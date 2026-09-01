/* 주문창 테스트 하네스 — index.html + 실제 trading.js/ui.js/주문창 모듈을
 * jsdom에 그대로 올려서, 네트워크(WS/Supabase/차트)만 빼고 구동합니다.
 * 계산 로직은 실제 trading.js 그대로를 사용합니다(모킹하지 않음). */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

function boot(opts) {
  opts = opts || {};
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;

  // 네트워크/미디어 스텁 — 계산에는 전혀 관여하지 않습니다.
  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.alert = (m) => { win.__lastAlert = m; };
  win.AudioContext = function () {
    this.state = "running";
    this.currentTime = 0;
    this.destination = {};
    this.resume = () => {};
    this.createOscillator = () => ({ frequency: {}, connect: (n) => n, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n });
  };
  win.__beeps = [];

  // App.Bus — main.js와 동일한 구현(main.js는 자동 부팅하므로 여기서 직접 정의)
  const busSrc = `
    window.App = window.App || {};
    App.Bus = (function(){
      const listeners = {};
      return {
        on(e,f){ (listeners[e]=listeners[e]||[]).push(f); return f; },
        off(e,f){ if(listeners[e]) listeners[e]=listeners[e].filter(x=>x!==f); },
        emit(e,p){ (listeners[e]||[]).forEach(f=>{ try{f(p);}catch(err){ console.error(err); } }); }
      };
    })();
  `;
  win.eval(busSrc);

  /* 엔진(js/trading.js)이 있어야 제대로 도는 모듈들 — 목록은 tests/_engine-modules.js
     한 곳에만 있습니다. 여기에 이름을 또 적지 않습니다(적으면 언젠가 어긋납니다).
     ⭐ 반드시 js/trading.js ★앞★ 에 넣습니다 (index.html 과 같은 순서). */
  const 엔진필수경로 = require("./_engine-modules.js").엔진필수.map((m) => m.경로);

  const files = [
    "js/config.js",
    "js/utils.js",
    "js/storage.js",
    "js/symbol-registry.js",
  ].concat(엔진필수경로, [
    "js/trading.js",
    "js/ui.js",
    "js/order-info-panel.js",
    "js/qty-price-order.js",
    "js/order-panel-amitalk.js",
    "js/position-table-extra.js",
    "js/limit-close.js",
  ]);
  /* opts.extra — 기본 목록 뒤, init() 전에 더 태울 파일들. (2026-08-27 추가)
     왜 필요한가: tests/symbol-switch-unbuilt.test.js 가 js/trading.js 만 태우고
     js/symbol-guard.js 를 안 읽는 바람에, 안전장치가 라이브에 들어온 뒤에도
     "아직 없다" 는 옛 기준이 55건 전부 조용히 통과했습니다(커밋 9622e15·3bce232).
     js/symbol-guard.js 는 js/trading.js 가 price:update 를 구독하기 전에
     App.Bus.on 을 감싸야 해서, 반드시 init() 호출 전에 태워야 합니다
     (index.html 도 symbol-guard 1196행 → trading 1197행 순서입니다).
     ⚠ opts.extra 를 안 주면 예전과 완전히 같습니다. 다른 테스트에 영향 없음. */
  const extra = Array.isArray(opts.extra) ? opts.extra : [];

  for (const f of files.concat(extra)) {
    const src = fs.readFileSync(path.join(REPO, f), "utf8");
    try {
      win.eval(src);
    } catch (e) {
      throw new Error("모듈 로드 실패 " + f + ": " + e.message);
    }
  }

  const order = ["Trading", "OrderInfoPanel", "UI", "QtyPriceOrder", "AmiTalkOrderPanel", "PositionTableExtra", "LimitClose"];
  for (const name of order) {
    if (win.App[name] && typeof win.App[name].init === "function") win.App[name].init();
  }

  return { dom, win, App: win.App, doc: win.document };
}

module.exports = { boot, REPO };
