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
  "js/symbol-guard.js",
  /* js/risk-brackets.js — 2026-08-31 대표 결재(바이낸스 구간별 유지증거금). index.html 은 risk-brackets → trading 순서라 여기도 같게 태웁니다. 안 태우면 이 테스트는 회원이 겪지 않는 옛 고정값(MMR_FALLBACK 0.5%) 경로를 재게 됩니다. */
  "js/risk-brackets.js",
  "js/trading.js", "js/ui.js",
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

/* =========================================================================
 * [6] 부팅 도중에 또 부르면 — 자물쇠는 bootModules() 보다 "먼저" 걸려야 한다
 *     2026-08-28 본부장 돌연변이 ② 로 뚫린 구멍. [1]~[5] 31건이 전부 통과했습니다.
 *
 *  무엇이 뚫렸나 — main.js 의 이 두 줄 순서를 뒤집으면 새는데 아무도 안 잡았습니다.
 *        bootDone = true;   ←  이 줄이 먼저여야 합니다
 *        bootModules();
 *     "부팅이 중간에 실패하면 다시는 못 부팅하니 성공한 뒤에 잠그자" 는 그럴듯한
 *     이유로 누가 뒤집기 쉽습니다. 실제로 bootModules() 는 모듈마다 try/catch 라
 *     밖으로 오류를 안 던집니다 — 즉 "성공한 뒤에 잠그기" 는 얻는 게 없고
 *     아래 구멍만 생깁니다.
 *
 *  왜 새나 — App.bootApp 의 자물쇠(bootPromise)는 이때 아직 비어 있습니다.
 *        bootPromise = (async function () { ... boot(); })();
 *     App.Season 이 없으면 이 async 함수가 await 없이 boot() 까지 그대로 달려서,
 *     bootPromise 에 값이 대입되기 "전에" 모듈 init() 들이 이미 돌고 있습니다.
 *     (App.Season 은 js/season.js 인데, Supabase 로드가 실패하면 없습니다 —
 *      ③번 길과 같은 상황입니다)
 *     그래서 그 사이에 어떤 모듈의 init() 이 App.bootApp() 을 부르면
 *     bootPromise 도 null, bootDone 도 아직 false → 부팅이 통째로 한 번 더 돕니다.
 *
 *  2026-08-28 실측 (돌연변이 ② 를 넣은 사본에서 잰 값)
 *        원본        재진입 1회 · price:update 3 · trading:update 4
 *        두 줄 뒤집음  재진입 2회 · price:update 6 · trading:update 7
 *     [2] 의 "두 번 부팅" 과 완전히 같은 숫자입니다 = 같은 P1 이 그대로 돌아옵니다.
 * ========================================================================= */
section("[6] 부팅 도중에 또 부르면 (재진입) — 자물쇠가 모듈 init 보다 먼저 걸린다");
{
  /* 부팅 중에 App.bootApp() 을 한 번 더 부르는 모듈을 심습니다.
     Theme 은 main.js 모듈 목록에 실제로 있는 이름입니다.

     ⚠ 여기서는 [1] 의 기준값과 바로 비교하지 않습니다. 이 시험은 부팅 뒤
        60ms 를 더 기다리는데, 그 사이 모듈 하나가 trading:update 를 늦게
        하나 더 구독합니다(원본에서도 4 → 5). 조건이 다른 값끼리 비교하면
        엉뚱한 곳이 빨개집니다. 그래서 "재진입 안 하는 같은 시험(대조군)" 을
        한 번 더 돌려 그 값과 비교합니다 — 조건이 완전히 같습니다. */
  const 재진입시험 = async function (시즌있음, 재진입할지) {
    const { win } = makeWindow({ blockAutoBoot: true });
    quiet(function () { win.eval(read("main.js")); });
    const App = win.App;

    const counts = {};
    const origOn = App.Bus.on;
    App.Bus.on = function (e, f) { counts[e] = (counts[e] || 0) + 1; return origOn.call(this, e, f); };

    if (시즌있음) App.Season = { checkAndReset: function () { return Promise.resolve(); } };

    let 돈횟수 = 0;
    App.Theme = {
      init: function () { 돈횟수++; if (재진입할지 && 돈횟수 === 1) App.bootApp(); },
    };

    const w = console.warn; console.warn = function () {};
    try { await App.bootApp(); await new Promise(function (r) { setTimeout(r, 60); }); }
    finally { console.warn = w; }

    return { 돈횟수: 돈횟수, m: measure({ App: App, doc: win.document, win: win, counts: counts }) };
  };

  {
    const 대조 = await 재진입시험(false, false);   // 재진입 없음
    const 실험 = await 재진입시험(false, true);    // 부팅 중에 App.bootApp() 한 번 더

    ok("(대조군) 재진입이 없으면 모듈 init() 은 당연히 1회",
      대조.돈횟수 === 1, "Theme.init() " + 대조.돈횟수 + "회");

    ok("App.Season 이 없을 때 — 모듈 init() 이 딱 한 번만 돈다 (뒤집으면 2)",
      실험.돈횟수 === 1, "Theme.init() " + 실험.돈횟수 + "회");
    ok("App.Season 이 없을 때 — price:update 구독자가 대조군과 같다 (뒤집으면 두 배)",
      실험.m.구독가격 === 대조.m.구독가격, 실험.m.구독가격 + " vs 대조군 " + 대조.m.구독가격);
    ok("App.Season 이 없을 때 — trading:update 구독자가 대조군과 같다 (뒤집으면 두 배)",
      실험.m.구독방송 === 대조.m.구독방송, 실험.m.구독방송 + " vs 대조군 " + 대조.m.구독방송);
    ok("App.Season 이 없을 때 — 틱 1번에 trading:update 1번",
      실험.m.틱당방송 === 1, String(실험.m.틱당방송));
    ok("App.Season 이 없을 때 — 절반만 닫기가 여전히 50%", 실험.m.비율 === 50, 실험.m.비율 + "%");
    ok("App.Season 이 없을 때 — 거래내역 1건", 실험.m.건수 === 1, String(실험.m.건수));
    ok("App.Season 이 없을 때 — 잔고 99,492.55", 실험.m.잔고 === 기준값.잔고, String(실험.m.잔고));
  }

  {
    /* 시즌이 있으면 await 때문에 bootPromise 가 먼저 채워져 App.bootApp 자물쇠도
       같이 막아줍니다. 그래도 여기까지 같이 못 박아 둡니다. */
    const 실험 = await 재진입시험(true, true);
    ok("App.Season 이 있을 때도 — 모듈 init() 이 딱 한 번",
      실험.돈횟수 === 1, "Theme.init() " + 실험.돈횟수 + "회");
    ok("App.Season 이 있을 때도 — 절반만 닫기가 50%", 실험.m.비율 === 50, 실험.m.비율 + "%");
    ok("App.Season 이 있을 때도 — 거래내역 1건", 실험.m.건수 === 1, String(실험.m.건수));
  }

  /* 소스로도 한 번 더 — 왜 터졌는지 바로 읽히게 */
  const src6 = read("main.js");
  const bi6 = src6.indexOf("function boot()");
  const end6 = src6.indexOf("function bootModules()", bi6);
  const 본문6 = (bi6 !== -1 && end6 !== -1) ? src6.slice(bi6, end6) : "";
  const 잠금6 = 본문6.indexOf("bootDone = true");
  const 호출6 = 본문6.indexOf("bootModules()");
  ok("boot() 안에서 'bootDone = true' 가 'bootModules()' 보다 먼저 나온다",
    잠금6 !== -1 && 호출6 !== -1 && 잠금6 < 호출6,
    "bootDone=true " + 잠금6 + " / bootModules() " + 호출6 +
    " — 뒤집으면 모듈 init() 중에 부팅이 한 번 더 돕니다");
}

/* =========================================================================
 * [7] 부팅이 도중에 끊기면 — 자물쇠를 풀어 다시 부팅할 수 있어야 한다
 *     그러면서 이미 켠 모듈은 두 번 켜지 않아야 한다
 *
 *     2026-08-28 감사팀 지적 ① / 본부장 돌연변이 ① 로 뚫린 구멍.
 *     이 절을 넣기 전 [1]~[6] 43건이 그 돌연변이를 하나도 못 잡았습니다.
 *
 *  무엇이 뚫렸나 — main.js boot() 의 try/catch 를 통째로 지우면
 *        bootDone = true;
 *        bootModules();          ← 여기서 끊기면 bootDone 은 true 로 남는다
 *     부팅이 중간에 끊긴 채 자물쇠만 켜져서, 그 뒤로는 몇 번을 불러도
 *     "이미 부팅했습니다" 만 찍고 화면이 영영 반쪽으로 남습니다.
 *     오류도 안 뜨고 껍데기는 멀쩡합니다 — 전형적인 조용한 고장입니다.
 *
 *  ⚠ 부팅 실패를 인위로 만들어야 합니다. bootModules() 는 모듈마다 try/catch 라
 *     init() 이 던져도 밖으로 안 나옵니다. 그래서 감사팀이 쓴 방법 그대로
 *     App.<모듈> 을 "읽는 순간 던지는 getter" 로 심습니다 —
 *     forEach 안의 App[name] 접근은 그 try/catch 바깥입니다.
 *
 *  2026-08-28 실측 (돌연변이 ① 을 넣은 사본에서 잰 값)
 *        원본            첫 부팅 끊김 → 다시 부팅 성공 · 주문창 있음 · 절반만 닫기 50%
 *        try/catch 삭제  다시 부팅 거부("이미 부팅했습니다") · 주문창 없음 · 주문 불가
 * ========================================================================= */
section("[7] 부팅이 도중에 끊겨도 다시 부팅할 수 있다 (자물쇠를 되돌린다)");
{
  const { win } = makeWindow({ blockAutoBoot: true });
  quiet(function () { win.eval(read("main.js")); });
  const App = win.App;

  /* MarketWar 는 main.js 모듈 목록에서 Trading 보다 앞입니다.
     여기서 끊으면 Trading·UI 가 아예 안 켜집니다(= 주문창이 안 생깁니다). */
  let 던짐 = 0;
  Object.defineProperty(App, "MarketWar", {
    configurable: true,
    get: function () { 던짐++; throw new Error("[시험] 부팅을 일부러 끊습니다"); },
  });

  /* TradesFit 은 MarketWar 보다 앞입니다 — 다시 부팅할 때 이 모듈이 두 번
     켜지면 같은 노드에 리스너가 한 겹 더 붙는 그 P1 이 그대로 돌아옵니다. */
  let 앞모듈init = 0;
  App.TradesFit = { init: function () { 앞모듈init++; } };

  const errs = [];
  const e0 = console.error, w0 = console.warn;
  console.error = function () { errs.push(String(arguments[0])); };
  console.warn = function () {};

  let 첫부팅오류 = null;
  try { await App.bootApp(); } catch (err) { 첫부팅오류 = err; }

  ok("첫 부팅이 실제로 도중에 끊겼다 (시험 준비가 됐다)",
    던짐 === 1 && !!첫부팅오류, "getter 던짐 " + 던짐 + "회 / 오류 " + 첫부팅오류);
  ok("끊긴 시점에는 주문창이 아직 없다 (Trading·UI 가 못 켜졌다)",
    !win.document.querySelector('.chip[data-close-ratio="0.5"]'));
  ok("끊기기 전 모듈은 한 번 켜졌다", 앞모듈init === 1, String(앞모듈init));
  ok("왜 끊겼는지 콘솔에 남긴다 (조용히 죽지 않는다)",
    errs.some(function (x) { return x.indexOf("자물쇠를 풉니다") !== -1; }),
    JSON.stringify(errs.slice(0, 2)));

  /* 끊긴 원인을 걷어내고 다시 부팅합니다 (실제로는 늦게 온 재시도 / 새로고침) */
  Object.defineProperty(App, "MarketWar", { configurable: true, value: undefined });

  const warns = [];
  console.warn = function () { warns.push(String(arguments[0])); };
  try { await App.bootApp(); } finally { console.warn = w0; console.error = e0; }

  ok("다시 부팅이 실제로 됐다 (자물쇠가 풀렸다 — 돌연변이 ① 이면 여기가 터집니다)",
    !!win.document.querySelector('.chip[data-close-ratio="0.5"]'),
    "주문창이 없습니다. bootDone 이 true 로 남아 '이미 부팅했습니다' 만 찍습니다: " +
    JSON.stringify(warns.slice(0, 2)));
  ok("다시 부팅해도 이미 켠 모듈은 두 번 안 켠다 (리스너 두 겹 = P1 재발)",
    앞모듈init === 1, "TradesFit.init() " + 앞모듈init + "회");

  const m7 = measure({ App: App, doc: win.document, win: win, counts: null });
  ok("다시 부팅한 뒤 절반만 닫기가 50%", m7.비율 === 기준값.비율, m7.비율 + "%");
  ok("다시 부팅한 뒤 거래내역 1건", m7.건수 === 기준값.건수, String(m7.건수));
  ok("다시 부팅한 뒤 잔고 99,492.55", m7.잔고 === 기준값.잔고, String(m7.잔고));
  ok("다시 부팅한 뒤 틱 1번에 trading:update 1번", m7.틱당방송 === 1, String(m7.틱당방송));

  /* 소스로도 한 번 더 — 왜 터졌는지 바로 읽히게 */
  const src7 = read("main.js");
  const b7 = src7.indexOf("function boot()");
  const e7 = src7.indexOf("function bootModules()", b7);
  const 본문7 = (b7 !== -1 && e7 !== -1) ? src7.slice(b7, e7) : "";
  ok("boot() 안에 '끊기면 자물쇠를 되돌린다'(bootDone = false) 가 있다",
    본문7.indexOf("bootDone = false") !== -1,
    "부팅이 한 번 끊기면 다시는 못 부팅합니다");
  ok("bootModules() 가 이미 켠 모듈을 기억한다 (bootedModules)",
    src7.indexOf("bootedModules") !== -1);
}

/* =========================================================================
 * [8] 시즌 확인은 언제나 부팅보다 "먼저" 끝난다 — 세 경로 전부
 *
 *     2026-08-28 감사팀 지적 ② / 본부장 돌연변이 ② 로 뚫린 구멍.
 *     이 절을 넣기 전 [1]~[7] 이 아래 두 돌연변이를 하나도 못 잡았습니다.
 *       M2a  App.bootApp 안에서 boot() 를 시즌 확인보다 앞으로  → 세 경로 전부 뒤집힘
 *       M2b  start() 의 'Auth 없음' 갈래가 boot() 를 직접 호출  → ③번 길만 뒤집힘
 *
 *  왜 순서가 중요한가 — js/trading.js 는 init() 에서 localStorage 를 읽어
 *     메모리에 올립니다. 그 "뒤에" 시즌 초기화가 일어나면 초기화된 값이
 *     화면에 반영되지 않습니다. 관리자가 "전체 시즌 초기화" 를 눌렀는데
 *     회원 화면에는 옛 잔고·옛 포지션이 그대로 남아 보입니다(P1 — 회원이
 *     틀린 숫자로 판단합니다). 오류는 안 납니다.
 *
 *  2026-08-27 실측 (③번 길이 boot() 를 직접 부르던 때)
 *        init:Trading @11ms  →  season:check @47ms      ← 뒤집혀 있었습니다
 *  2026-08-28 지금 (세 경로 전부 App.bootApp 을 거칩니다)
 *        season:check 가 언제나 init:Trading 보다 앞입니다.
 *
 *  ⚠ ms 는 기계에 따라 흔들리므로 "몇 번째로 일어났는가"(순번)로 판정하고
 *     ms 는 사람이 읽는 용도로만 찍습니다.
 * ========================================================================= */
section("[8] 시즌 확인 → 부팅 순서 (①로그인 ②세션복구지연 ③App.Auth 없음)");
{
  /* 시즌 확인과 Trading 초기화가 각각 몇 번째로 일어났는지 기록합니다 */
  function 계측(App, t0) {
    const 기록 = [];
    let 순번 = 0;
    App.Season = {
      checkAndReset: function () {
        기록.push({ 이름: "season:check", 순번: ++순번, ms: Date.now() - t0 });
        /* 실제 season.js 처럼 서버를 한 번 기다립니다 */
        return new Promise(function (r) { setTimeout(r, 30); });
      },
    };
    const orig = App.Trading.init;
    App.Trading.init = function () {
      기록.push({ 이름: "init:Trading", 순번: ++순번, ms: Date.now() - t0 });
      return orig.apply(this, arguments);
    };
    return 기록;
  }

  function 판정(라벨, 기록) {
    const s = 기록.filter(function (x) { return x.이름 === "season:check"; })[0];
    const t = 기록.filter(function (x) { return x.이름 === "init:Trading"; })[0];
    const 설명 = 기록.map(function (x) { return x.이름 + " @" + x.ms + "ms"; }).join(" → ")
      || "(시즌 확인도 부팅도 안 돌았습니다)";
    ok(라벨 + " — 시즌 확인이 돌았다", !!s, 설명);
    ok(라벨 + " — Trading 이 켜졌다", !!t, 설명);
    ok(라벨 + " — season:check 가 init:Trading 보다 먼저다", !!s && !!t && s.순번 < t.순번, 설명);
  }

  /* ── ① 로그인 길 (js/auth.js 가 App.bootApp() 을 부릅니다) ── */
  {
    const { win } = makeWindow({ blockAutoBoot: true });
    quiet(function () { win.eval(read("main.js")); });
    const App = win.App;
    const 기록 = 계측(App, Date.now());
    const w = console.warn; console.warn = function () {};
    try { await App.bootApp(); } finally { console.warn = w; }
    판정("①로그인", 기록);
  }

  /* ── ② 세션복구 지연 길 (js/guest-access.js 가 나중에 부릅니다) ── */
  {
    const { win } = makeWindow({ blockAutoBoot: true });
    quiet(function () { win.eval(read("main.js")); });
    const App = win.App;
    const 기록 = 계측(App, Date.now());
    await new Promise(function (r) { setTimeout(r, 80); });   // 세션 복구를 기다리는 동안
    const w = console.warn; console.warn = function () {};
    try { await App.bootApp(); } finally { console.warn = w; }
    판정("②세션복구지연", 기록);
  }

  /* ── ③ App.Auth 가 없는 길 (Supabase 로드 실패 → main.js start()) ──
     여기가 2026-08-27 에 실제로 뒤집혀 있던 길입니다. */
  {
    const { win } = makeWindow({ blockAutoBoot: false });
    quiet(function () { win.eval(read("main.js")); });
    const App = win.App;
    /* start() 는 DOMContentLoaded 뒤에 도니 아직 안 늦었습니다 */
    const 기록 = 계측(App, Date.now());

    /* ③번 길은 스스로 부팅하므로 quiet() 로 못 감쌉니다.
       "모듈이 없거나" 경고(차트·WS 등을 일부러 안 태웁니다)를 여기서 가립니다. */
    const w3 = console.warn; console.warn = function () {};
    try {
      await new Promise(function (r) {
        if (win.document.readyState === "complete") return r();
        win.document.addEventListener("DOMContentLoaded", function () { r(); });
        win.addEventListener("load", function () { r(); });
        setTimeout(r, 1500);
      });
      /* 시즌 30ms + 부팅. 전체를 한꺼번에 돌릴 때를 생각해 넉넉히 둡니다 */
      await new Promise(function (r) { setTimeout(r, 300); });
    } finally { console.warn = w3; }

    ok("③App.Auth없음 — 실제로 부팅됐다 (주문창이 있다)",
      !!win.document.querySelector('.chip[data-close-ratio="0.5"]'));
    판정("③App.Auth없음", 기록);
  }

  /* 소스로도 — 왜 터졌는지 바로 읽히게 */
  const src8 = read("main.js");
  const si8 = src8.indexOf("function start()");
  const 본문8 = si8 !== -1 ? src8.slice(si8) : "";
  const else8 = 본문8.indexOf("} else {");
  const 뒷갈래 = else8 !== -1 ? 본문8.slice(else8) : "";
  ok("start() 의 'Auth 가 없을 때' 갈래가 App.bootApp() 을 거친다",
    뒷갈래.indexOf("App.bootApp(") !== -1,
    "boot() 를 직접 부르면 시즌 확인이 부팅보다 뒤로 갑니다 " +
    "(2026-08-27 실측 init:Trading @11ms / season:check @47ms)");
  /* ⚠ 주석을 먼저 걷어냅니다 — main.js 의 설명 주석에 "App.Season.checkAndReset() 을
     기다리는 중이라면" 이라는 문장이 들어 있어서, 그냥 찾으면 코드가 뒤집혀도
     통과합니다 (2026-08-28 돌연변이 M2a 로 실제로 이 오탐을 확인했습니다). */
  const 코드만8 = (function (t) {
    let out = "", i = 0;
    for (;;) {
      const a = t.indexOf("/" + "*", i);
      if (a === -1) { out += t.slice(i); break; }
      out += t.slice(i, a) + " ";
      const b = t.indexOf("*" + "/", a + 2);
      if (b === -1) break;
      i = b + 2;
    }
    return out.split("\n").map(function (l) {
      const j = l.indexOf("/" + "/");
      return j === -1 ? l : l.slice(0, j);
    }).join("\n");
  })(src8);
  ok("App.bootApp 이 시즌 확인을 기다린 '뒤에' boot() 를 부른다",
    (function () {
      const bi = 코드만8.indexOf("App.bootApp = async function");
      const 몸통 = bi !== -1 ? 코드만8.slice(bi, 코드만8.indexOf("function start()", bi)) : "";
      const si = 몸통.indexOf("await App.Season.checkAndReset()");
      const bo = 몸통.lastIndexOf("boot();");
      return si !== -1 && bo !== -1 && si < bo;
    })(),
    "boot() 가 시즌 확인보다 앞에 있습니다");
  /* 자체검증 — 위 주석 걷어내기가 고장나면 아래가 먼저 빨개집니다 */
  ok("(자체검증) 주석 걷어내기가 실제로 동작한다",
    코드만8.indexOf("기다리는 중이라면") === -1 &&
    코드만8.indexOf("App.bootApp = async function") !== -1,
    "주석이 안 걷혔거나 코드까지 지웠습니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);

})();
