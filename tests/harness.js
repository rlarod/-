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

  const files = [
    "js/config.js",
    "js/utils.js",
    "js/storage.js",
    "js/symbol-registry.js",
    "js/trading.js",
    "js/ui.js",
    "js/order-info-panel.js",
    "js/qty-price-order.js",
    "js/order-panel-amitalk.js",
  ];
  for (const f of files) {
    const src = fs.readFileSync(path.join(REPO, f), "utf8");
    try {
      win.eval(src);
    } catch (e) {
      throw new Error("모듈 로드 실패 " + f + ": " + e.message);
    }
  }

  const order = ["Trading", "OrderInfoPanel", "UI", "QtyPriceOrder", "AmiTalkOrderPanel"];
  for (const name of order) {
    if (win.App[name] && typeof win.App[name].init === "function") win.App[name].init();
  }

  return { dom, win, App: win.App, doc: win.document };
}

module.exports = { boot, REPO };
