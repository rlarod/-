/* tests/boot-once.test.js
 * =========================================================================
 * 부팅은 딱 한 번만 된다 — 2026-08-28  (P1: 회원 돈이 두 번 나갑니다)
 * =========================================================================
 *
 * 무슨 일이 있었나
 *   회원이 "절반만 닫기" 를 한 번 눌렀는데 3/4 이 닫혔습니다.
 *   거래내역에 회원이 모르는 청산이 한 줄 더 생기고 오류는 안 뜹니다.
 *
 *   실측(이 파일 [1] 이 그대로 잽니다) — 10배 롱 진입 뒤 "절반만 닫기" 한 번
 *     한 번 부팅  구독자 price:update 3 / trading:update 4
 *                 closedTrades 1건 · 닫힌비율 50% · 잔고 99,492.55
 *     두 번 부팅  구독자 price:update 6 / trading:update 7
 *                 closedTrades 2건 · 닫힌비율 75% · 잔고 99,741.32
 *
 * 왜 두 배가 되나
 *   js/ui.js:747 injectDynamicUI() 가 멱등이라 DOM 을 다시 만들지 않습니다.
 *   그래서 두 번째 bindOrderPanel() 이 "같은 노드" 에 리스너를 하나 더 붙입니다.
 *   js/ui.js:658 의 것은 화살표 함수라 브라우저의 "같은 리스너 중복 등록 무시"
 *   도 안 걸립니다.
 *
 * 부팅을 부르는 길이 셋이고, 셋이 서로 다른 변수를 봅니다.
 *   ① js/auth.js:43        let booted      로그인 성공
 *   ② js/guest-access.js:121 var bootCalled 비회원 · 세션복구 지연 재방문
 *   ③ main.js start()      App.Auth 가 없을 때 boot() 직접 호출
 *   ①②는 App.bootApp 을 거치지만 ③은 boot() 를 바로 부릅니다.
 *   그래서 자물쇠는 boot() 에 걸려 있어야 합니다. [3] 이 그걸 지킵니다.
 *
 * ⛔ 이 파일은 손익·청산 계산식을 검사하지 않습니다. "몇 번 실행되는가" 만 봅니다.
 * ⚠ 사이트 코드는 한 글자도 고치지 않습니다. 읽어서 띄우기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const MODULES = [
  "js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js",
  "js/symbol-guard.js", "js/trading.js", "js/ui.js",
  "js/order-info-panel.js", "js/qty-price-order.js", "js/order-panel-amitalk.js",
  "js/position-table-extra.js", "js/limit-close.js",
];

/* main.js 가 뿜는 "모듈이 없거나" 경고는 이 테스트에서 정상입니다(차트·WS 등을
   일부러 안 태웁니다). 시끄럽기만 하므로 잠시 가려둡니다. */
function quiet(fn) {
  const w = console.warn, l = console.log, e = console.error;
  const buf = [];
  console.warn = (...a) => buf.push(String(a[0]));
  console.error = () => {};
  try { return { out: fn(), warns: buf }; }
  finally { console.warn = w; console.log = l; console.error = e; }
}

/* -------------------------------------------------------------------------
 * 부팅기 — 실제 main.js 를 그대로 태웁니다(부팅 순서를 흉내내지 않습니다).
 *   opts.blockAutoBoot  true 면 App.Auth 자리를 막아 start() 가 스스로
 *                       부팅하지 않게 합니다(= 부팅 횟수를 우리가 정함).
 *                       false 면 ③번 길(Auth 없음 → boot() 직접)이 그대로 돕니다.
 * ----------------------------------------------------------------------- */
function makeWindow(opts) {
  opts = opts || {};
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.alert = (m) => { win.__lastAlert = m; };
  win.confirm = () => true;
  win.AudioContext = function () {
    this.state = "running"; this.currentTime = 0; this.destination = {};
    this.resume = () => {};
    this.createOscillator = () => ({ frequency: {}, connect: (n) => n, start() {}, stop() {} });
    this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n });
  };

  win.eval("window.App = window.App || {};");
  if (opts.blockAutoBoot) win.eval("App.Auth = { init: function(){} };");

  for (const f of MODULES) {
    try { win.eval(read(f)); }
    catch (e) { throw new Error("모듈 로드 실패 " + f + ": " + e.message); }
  }
  return { dom, win };
}

/* 진입 → "절반만 닫기" 한 번 → 실제로 얼마가 닫혔는지 */
function measure(ctx) {
  const { App, doc, win, counts } = ctx;

  let tuHits = 0;
  App.Bus.on("trading:update", () => { tuHits++; });

  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000, time: Date.now() });
  App.Trading.setLeverage(10);
  const opened = App.Trading.openPosition("long", 1000);
  const 진입수량 = opened.ok ? opened.position.qty : null;

  tuHits = 0;
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110001, time: Date.now() });
  const 틱당방송 = tuHits;

  const chip = doc.querySelector('.chip[data-close-ratio="0.5"]');
  if (chip) chip.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));

  const s = App.Trading.getSnapshot();
  const 닫힌수량 = (s.closedTrades || []).reduce((a, t) => a + (t.qty || 0), 0);

  return {
    칩있음: !!chip,
    구독가격: counts ? (counts["price:update"] || 0) : null,
    구독방송: counts ? (counts["trading:update"] || 0) : null,
    틱당방송: 틱당방송,
    건수: (s.closedTrades || []).length,
    비율: 진입수량 ? Math.round((닫힌수량 / 진입수량) * 1000) / 10 : null,
    잔고: Math.round(s.balance * 100) / 100,
    남은수량: s.position ? s.position.qty : 0,
  };
}

/* App.bootApp 을 N 번 부르고 잽니다(①②번 길). */
async function bootTimes(times) {
  const { win, dom } = makeWindow({ blockAutoBoot: true });
  const r = quiet(() => { win.eval(read("main.js")); });
  const App = win.App;

  /* 구독자 수 세기 — main.js 가 App.Bus 를 만든 직후, 부팅 전에 겁니다 */
  const counts = {};
  const origOn = App.Bus.on;
  App.Bus.on = function (e, f) { counts[e] = (counts[e] || 0) + 1; return origOn.call(this, e, f); };

  const warns = [];
  const w = console.warn;
  console.warn = (...a) => warns.push(String(a[0]));
  try { for (let i = 0; i < times; i++) await App.bootApp(); }
  finally { console.warn = w; }

  return { m: measure({ App, doc: win.document, win, counts }), warns, App, win };
}

const 기준값 = { 건수: 1, 비율: 50, 잔고: 99492.55 };

(async function () {

console.log("\n부팅은 딱 한 번만 된다 (P1 — 절반만 닫기가 3/4 을 닫던 문제)");

/* =========================================================================
 * [1] 한 번 부팅 — 지금과 똑같아야 합니다(엔진이 안 바뀐 것을 먼저 확인)
 * ========================================================================= */
section("[1] 한 번 부팅 — 기준값");
let 한번 = null;
{
  const { m } = await bootTimes(1);
  한번 = m;
  ok("주문창에 '절반만 닫기' 칩이 있다", m.칩있음);
  ok("price:update 구독자 3", m.구독가격 === 3, String(m.구독가격));
  ok("trading:update 구독자 4", m.구독방송 === 4, String(m.구독방송));
  ok("틱 1번에 trading:update 가 1번 나간다", m.틱당방송 === 1, String(m.틱당방송));
  ok("절반만 닫기 → 정확히 50% 가 닫힌다", m.비율 === 기준값.비율, m.비율 + "%");
  ok("거래내역이 1건이다", m.건수 === 기준값.건수, String(m.건수));
  ok("잔고 99,492.55", m.잔고 === 기준값.잔고, String(m.잔고));
}

/* =========================================================================
 * [2] 두 번 부팅 — [1] 과 숫자가 완전히 같아야 합니다  ← 이 파일의 핵심
 * ========================================================================= */
section("[2] 두 번 부팅 — 한 번 부팅과 숫자가 같다");
{
  const { m, warns } = await bootTimes(2);
  ok("price:update 구독자가 안 늘었다 (고치기 전 6)",
    m.구독가격 === 한번.구독가격, m.구독가격 + " (한 번 부팅 " + 한번.구독가격 + ")");
  ok("trading:update 구독자가 안 늘었다 (고치기 전 7)",
    m.구독방송 === 한번.구독방송, m.구독방송 + " (한 번 부팅 " + 한번.구독방송 + ")");
  ok("틱 1번에 trading:update 가 여전히 1번 (고치기 전 2)",
    m.틱당방송 === 1, String(m.틱당방송));

  ok("절반만 닫기 → 여전히 50% (고치기 전 75%)",
    m.비율 === 50, m.비율 + "%");
  ok("거래내역이 여전히 1건 (고치기 전 2건 — 회원이 모르는 청산이 한 줄 더)",
    m.건수 === 1, String(m.건수));
  ok("잔고가 99,492.55 그대로 (고치기 전 99,741.32)",
    m.잔고 === 기준값.잔고, String(m.잔고));
  ok("남은 수량이 절반 그대로", Math.abs(m.남은수량 - 한번.남은수량) < 1e-12,
    m.남은수량 + " vs " + 한번.남은수량);

  ok("조용히 넘기지 않고 콘솔에 남긴다 (누가 두 번 불렀는지 잡을 수 있게)",
    warns.some((x) => x.indexOf("두 번 불렸습니다") !== -1),
    JSON.stringify(warns.slice(0, 2)));
  ok("경고에 부른 자리가 들어 있다",
    warns.some((x) => x.indexOf("부른 곳:") !== -1),
    JSON.stringify(warns.slice(0, 2)));
}

/* =========================================================================
 * [2-1] 열 번 불러도 한 번
 * ========================================================================= */
section("[2-1] 열 번 불러도 한 번");
{
  const { m } = await bootTimes(10);
  ok("구독자 수가 한 번 부팅과 같다",
    m.구독가격 === 한번.구독가격 && m.구독방송 === 한번.구독방송,
    m.구독가격 + " / " + m.구독방송);
  ok("절반만 닫기가 여전히 50%", m.비율 === 50, m.비율 + "%");
  ok("거래내역 1건", m.건수 === 1, String(m.건수));
}

/* =========================================================================
 * [3] ③번 길 — App.Auth 가 없어 main.js 가 boot() 를 직접 부른 뒤,
 *     나중에 누가 App.bootApp() 을 또 불러도 두 번 부팅되지 않는다.
 *
 *     자물쇠를 App.bootApp 에만 걸면 여기가 터집니다.
 *     (Supabase 라이브러리 로드 실패가 실제 발생 경로입니다)
 * ========================================================================= */
section("[3] Auth 가 없어 main.js 가 직접 부팅한 뒤 bootApp() 이 또 불려도 한 번");
{
  const { win } = makeWindow({ blockAutoBoot: false });   // Auth 없음 → start() 가 boot() 직접
  quiet(() => { win.eval(read("main.js")); });
  const App = win.App;

  /* jsdom 은 생성 직후 readyState 가 "loading" 이라 main.js 가
     DOMContentLoaded 를 기다립니다. 실제 브라우저와 같은 상태를 만들려면
     그 이벤트가 실제로 나갈 때까지 기다려야 합니다. */
  await new Promise((r) => {
    if (win.document.readyState === "complete") return r();
    win.document.addEventListener("DOMContentLoaded", () => r());
    win.addEventListener("load", () => r());
    setTimeout(r, 1500);
  });
  await new Promise((r) => setTimeout(r, 50));

  ok("Auth 가 없으니 main.js 가 boot() 를 직접 불러 스스로 부팅했다 (③번 길)",
    !!win.document.querySelector('.chip[data-close-ratio="0.5"]'),
    "칩을 못 찾았습니다 — ③번 길이 안 돌았습니다");

  const warns = [];
  const w = console.warn;
  console.warn = (...a) => warns.push(String(a[0]));
  try { await App.bootApp(); } finally { console.warn = w; }

  const m = measure({ App, doc: win.document, win, counts: null });
  ok("절반만 닫기 → 50% (자물쇠가 boot() 에 걸려 있어야 통과)",
    m.비율 === 50, m.비율 + "%");
  ok("거래내역 1건", m.건수 === 1, String(m.건수));
  ok("틱 1번에 trading:update 1번", m.틱당방송 === 1, String(m.틱당방송));
  ok("두 번째 호출을 조용히 넘기지 않고 콘솔에 남겼다",
    warns.some((x) => x.indexOf("부팅") !== -1 && x.indexOf("부른 곳:") !== -1),
    JSON.stringify(warns.slice(0, 2)));
}

/* =========================================================================
 * [4] 두 번째로 부른 쪽도 "끝났다" 를 제대로 받는다
 *     그냥 return 하면 두 번째 쪽이 아직 준비 안 된 앱을 쓰게 됩니다.
 * ========================================================================= */
section("[4] 두 번째 호출도 부팅이 끝난 뒤에 이어진다");
{
  const { win } = makeWindow({ blockAutoBoot: true });
  quiet(() => { win.eval(read("main.js")); });
  const App = win.App;

  /* 시즌 확인이 늦게 끝나는 상황을 만듭니다 */
  let 시즌끝남 = false;
  App.Season = { checkAndReset: () => new Promise((r) => setTimeout(() => { 시즌끝남 = true; r(); }, 60)) };

  const w = console.warn; console.warn = () => {};
  let 첫번째끝, 두번째끝;
  try {
    const p1 = App.bootApp();
    const p2 = App.bootApp();          // 첫 번째가 아직 시즌을 기다리는 중
    ok("두 번째 호출도 약속(Promise)을 돌려준다", !!(p2 && typeof p2.then === "function"));
    await p2;
    두번째끝 = 시즌끝남;
    await p1;
    첫번째끝 = 시즌끝남;
  } finally { console.warn = w; }

  ok("두 번째 호출이 끝났을 때 부팅이 실제로 끝나 있다 (먼저 앞서가지 않는다)",
    두번째끝 === true, "시즌 확인이 아직 안 끝났습니다");
  ok("부팅이 실제로 됐다 (주문창이 있다)",
    !!win.document.querySelector('.chip[data-close-ratio="0.5"]'));
  ok("첫 번째도 정상적으로 끝난다", 첫번째끝 === true);
}

/* =========================================================================
 * [5] main.js 가 자물쇠를 실제로 들고 있는지 (소스 확인)
 *     누가 나중에 자물쇠를 App.bootApp 쪽으로만 옮기면 [3] 이 터지지만,
 *     여기서 먼저 이유를 알려줍니다.
 * ========================================================================= */
section("[5] 자물쇠가 boot() 에 걸려 있다");
{
  const src = read("main.js");
  ok("main.js 에 bootDone 자물쇠가 있다", src.indexOf("bootDone") !== -1);
  const bi = src.indexOf("function boot()");
  const di = src.indexOf("bootDone", bi);
  ok("boot() 안에서 bootDone 을 본다 (App.bootApp 에만 걸면 ③번 길이 샙니다)",
    bi !== -1 && di !== -1 && di - bi < 400, "boot() " + bi + " / bootDone " + di);
  ok("main.js 는 수정 금지 12개 파일이 아니다 (js/ 밑이 아님)",
    fs.existsSync(path.join(REPO, "main.js")) && !fs.existsSync(path.join(REPO, "js/main.js")));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);

})();
