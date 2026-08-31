/* tests/symbol-guard-emit-view.test.js
 * =========================================================================
 * 방송(App.Bus.emit) 이 도는 동안 종목 바꿔치기가 새지 않는다 — 2026-08-28
 * =========================================================================
 *
 * 무엇을 지키나
 *   [1] 구독자 자리에서 읽은 종목 = 회원이 보고 있는 종목 (포지션 종목이 아님)
 *   [1] 틱이 도는 내내 주문 잠금 덮개가 계속 보인다 (표시 N회 / 숨김 0회)
 *   [2] 그러면서도 엔진 보호가 그대로다 — 다른 종목을 보는 중에도
 *       포지션 종목 시세로 강제청산이 정상 동작한다 (P1)
 *   [3] 방송이 끝나면 바꿔치기가 도로 씌워져 있다 (엔진이 예상한 상태)
 *   [4] 바꿔치기가 없을 때는 아무것도 하지 않는다
 *   [5] index.html 등록 순서 + git 추적
 *
 * 왜 생겼나 (조사팀 실측 · 이 파일 [0] 이 그대로 재현합니다)
 *   js/symbol-guard.js:508 이 엔진 핸들러가 도는 동안만 getActiveSymbol 을
 *   포지션 종목으로 바꿔치기하는데, 그 안에서 js/trading.js:93 이
 *   emit("trading:update") 를 부릅니다. emit 은 구독자를 그 자리에서 동기로
 *   전부 부르므로 구독자 20여 곳이 바꿔치기된 값을 읽었습니다.
 *     실측 — 구독자가 본 종목 80/80 이 포지션 종목,
 *            주문 잠금 덮개 표시 0회 / 숨김 80회.
 *   회원에게는 "주문은 비트코인에서만 할 수 있습니다" 안내가 사라지고
 *   다른 종목 주문 패널이 열려 보였습니다(눌러도 엔진이 거절합니다. P2).
 *
 * ⛔ 이 파일이 지키는 가장 중요한 것은 [2] 입니다.
 *    "새는 것을 막겠다" 며 바꿔치기 자체를 없애면 [2] 가 터집니다.
 *    바꿔치기를 없애면 강제청산·TP·SL·펀딩이 오류 없이 조용히 멈춥니다(P1).
 *
 * 모듈 있음/없음 두 벌을 같은 틱 수로 돌려 숫자를 비교합니다.
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

/* -------------------------------------------------------------------------
 * 부팅기 — tests/symbol-guard.test.js 와 같은 방식이되, 이번 모듈을
 * 켜고 끌 수 있게 했습니다(있음/없음 비교를 해야 해서 harness 를 못 씁니다).
 * index.html 과 같은 순서로 읽습니다:
 *   symbol-guard → trading → 화면쪽 → symbol-guard-emit-view
 * emit 감싸기가 symbol-guard 것보다 바깥이어야 해서 순서가 중요합니다.
 * ----------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const withFix = opts.fix !== false;
  const html = read("index.html");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;

  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.__alerts = [];
  win.alert = (m) => { win.__alerts.push(m); };

  win.eval(
    "window.App = window.App || {};\n" +
    "App.Bus = (function(){\n" +
    "  const listeners = {};\n" +
    "  return {\n" +
    "    on(e,f){ (listeners[e]=listeners[e]||[]).push(f); return f; },\n" +
    "    off(e,f){ if(listeners[e]) listeners[e]=listeners[e].filter(x=>x!==f); },\n" +
    "    emit(e,p){ (listeners[e]||[]).forEach(f=>{ try{f(p);}catch(err){ console.error(err); } }); }\n" +
    "  };\n" +
    "})();\n" +
    "App.bootApp = function(){ return true; };\n"
  );

  const files = [
    "js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js",
    "js/symbol-guard.js",
    /* js/risk-brackets.js — 2026-08-31 대표 결재(바이낸스 구간별 유지증거금). index.html 은 risk-brackets → trading 순서라 여기도 같게 태웁니다. 안 태우면 이 테스트는 회원이 겪지 않는 옛 고정값(MMR_FALLBACK 0.5%) 경로를 재게 됩니다. */
    "js/risk-brackets.js",
    "js/trading.js",
    "js/multi-symbol-view.js", "js/order-lock-notice.js",
  ];
  /* opts.wrongOrder — js/symbol-guard.js 보다 "먼저" 읽습니다([6] 에서 씁니다).
     실제 화면에서는 아무도 init() 을 손으로 안 부르므로 아래에서도 안 부릅니다. */
  if (withFix) {
    if (opts.wrongOrder) files.splice(files.indexOf("js/symbol-guard.js"), 0, "js/symbol-guard-emit-view.js");
    else files.push("js/symbol-guard-emit-view.js");
  }
  for (const f of files) {
    try { win.eval(read(f)); }
    catch (e) { throw new Error("모듈 로드 실패 " + f + ": " + e.message); }
  }

  win.App.bootApp();
  win.App.Trading.init();
  const A = win.App;
  if (A.SymbolGuard) A.SymbolGuard.armUi();
  if (A.MultiSymbolView && A.MultiSymbolView.init) A.MultiSymbolView.init();
  if (withFix && !opts.wrongOrder && A.SymbolGuardEmitView) A.SymbolGuardEmitView.init();
  if (A.OrderLockNotice && A.OrderLockNotice.init) A.OrderLockNotice.init();

  return { dom, win, App: A, doc: win.document };
}

/* 회원이 다른 종목 차트로 옮겨 간 상태를 흉내냅니다(js/config.js 무수정). */
function lookAt(App, symbol) {
  App.Config.getActiveSymbol = function () { return symbol; };
}

function openLong(App, price, margin, leverage) {
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  App.Trading.setLeverage(leverage);
  return App.Trading.openPosition("long", margin);
}

/* BTC 포지션을 들고 ETH 차트를 보는 상태에서 BTC 틱을 N번 흘리고,
   그동안 구독자가 무엇을 봤는지 / 덮개가 보였는지 셉니다.
   덮개는 폴링(1초)이 아니라 틱마다 즉시 반영돼야 하므로 틱마다 잽니다. */
function measure(App, ticks) {
  const seen = [];
  App.Bus.on("trading:update", function () {
    let v = null;
    try { v = App.Config.getActiveSymbol(); } catch (e) { v = "(읽기 오류)"; }
    seen.push(v);
  });

  let shown = 0, hidden = 0;
  for (let i = 0; i < ticks; i++) {
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 + i });
    if (App.OrderLockNotice.isShown()) shown++; else hidden++;
  }
  return { seen, shown, hidden, wrong: seen.filter((s) => s !== "ETHUSDT").length };
}

const TICKS = 80;

console.log("\n방송 동안 종목 바꿔치기가 새지 않는다");

/* =========================================================================
 * [0] 모듈이 없으면 실제로 샌다 — 비교 기준(돌연변이 검증)
 *     이 칸이 통과해야 [1] 의 숫자가 의미가 있습니다.
 * ========================================================================= */
section("[0] 모듈 없음 — 조사팀 실측이 그대로 재현된다");
let 기준 = null;
{
  const { App } = boot({ fix: false });
  const opened = openLong(App, 110000, 1000, 10);
  ok("BTC 110,000 에 10배 롱 진입", opened.ok === true, opened.error || "");
  ok("포지션 종목이 BTCUSDT", opened.position.symbol === "BTCUSDT", String(opened.position.symbol));

  lookAt(App, "ETHUSDT");
  기준 = measure(App, TICKS);

  ok("구독자가 " + TICKS + "번 다 엉뚱한 종목을 본다",
    기준.wrong === TICKS,
    "잘못 본 것 " + 기준.wrong + "/" + TICKS + " · 값 예 " + JSON.stringify(기준.seen.slice(0, 3)));
  ok("주문 잠금 덮개가 한 번도 안 보인다 (표시 0 / 숨김 " + TICKS + ")",
    기준.shown === 0 && 기준.hidden === TICKS,
    "표시 " + 기준.shown + " / 숨김 " + 기준.hidden);
}

/* =========================================================================
 * [1] 모듈이 있으면 안 샌다 — 같은 상황, 같은 틱 수로 비교
 * ========================================================================= */
section("[1] 모듈 있음 — 구독자가 '보고 있는 종목' 을 그대로 본다");
{
  const { App, doc } = boot();
  const opened = openLong(App, 110000, 1000, 10);
  ok("BTC 110,000 에 10배 롱 진입", opened.ok === true, opened.error || "");

  lookAt(App, "ETHUSDT");
  const m = measure(App, TICKS);

  ok("구독자가 본 종목이 " + TICKS + "/" + TICKS + " 다 ETHUSDT (수정 전 " + 기준.wrong + "건 오염 → 0건)",
    m.seen.length === TICKS && m.wrong === 0,
    "잘못 본 것 " + m.wrong + "/" + m.seen.length + " · 값 예 " + JSON.stringify(m.seen.slice(0, 3)));

  ok("주문 잠금 덮개가 틱이 도는 내내 계속 보인다 (표시 " + TICKS + " / 숨김 0)",
    m.shown === TICKS && m.hidden === 0,
    "표시 " + m.shown + " / 숨김 " + m.hidden);

  const cover = doc.querySelector(".tl-order-lock");
  const text = cover ? cover.textContent : "";
  ok("덮개 문구가 '지금 보는 종목' 과 '주문 가능 종목' 을 둘 다 말한다",
    /차트를 보고 있습니다/.test(text) && /에서만 할 수 있습니다/.test(text),
    JSON.stringify(text.slice(0, 80)));

  ok("모듈이 실제로 방송 구간에서 풀어 줬다 (restored >= " + TICKS + ")",
    App.SymbolGuardEmitView.getStats().restored >= TICKS,
    JSON.stringify(App.SymbolGuardEmitView.getStats()));
}

/* =========================================================================
 * [2] 엔진 보호는 그대로다 (P1 회귀 방지)
 *     바꿔치기를 없애는 방식으로 고치면 여기가 터집니다.
 * ========================================================================= */
section("[2] 다른 종목을 보는 중에도 포지션 종목 시세로 강제청산이 된다");
{
  const { App } = boot();
  const opened = openLong(App, 110000, 1000, 10);
  /* 2026-08-31 — 99,550 → 99,440 으로 바뀌었습니다. 고장이 아닙니다.
     대표 결재로 유지증거금이 바이낸스 명목 구간별(js/risk-brackets.js)로 바뀌었습니다.
       명목 = 증거금 1,000 × 10배 = 10,000 USDT → ★1구간★ (유지증거금률 0.4%, 공제액 0)
       청산가 = 110,000 × (1 − 1/10 + 0.004) = ★99,440★
     예전에는 유지증거금률이 0.5% 고정이라 110,000 × 0.905 = 99,550 이었습니다.
     ⭐ 소액은 1구간(0.4%)이라 예전보다 버팀폭이 ★넓어집니다.★ 큰 포지션만 좁아집니다.
     ⚠️ 이 테스트는 종목 안전장치를 보는 것이지 청산가를 보는 게 아닙니다.
        청산가는 "엔진이 진짜로 돌았다" 는 확인용 숫자입니다. */
  ok("청산가 99,440 (1구간 유지증거금률 0.4%)", Math.round(opened.position.liq) === 99440, String(opened.position.liq));

  lookAt(App, "ETHUSDT");                                             // ETH 차트를 보는 중
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 99000 });  // BTC 가 청산가 아래로

  const s = App.Trading.getSnapshot();
  const 청산 = (s.closedTrades || [])[0] || null;
  ok("포지션이 강제청산됐다 (조용히 멈추지 않았다)", s.position === null, "포지션이 남아 있습니다");
  ok("사유가 강제청산", 청산 && 청산.reason === "강제청산", 청산 ? 청산.reason : "기록 없음");
}

section("[2-1] 다른 종목을 보는 중에도 '다른 종목' 시세로는 청산되지 않는다");
{
  const { App } = boot();
  openLong(App, 110000, 1000, 10);
  lookAt(App, "ETHUSDT");
  for (let i = 0; i < 20; i++) App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });

  const s = App.Trading.getSnapshot();
  ok("ETH 시세 20틱에도 포지션이 살아 있다", s.position !== null, "사라졌습니다");
  ok("강제청산 기록이 없다", (s.closedTrades || []).length === 0, String((s.closedTrades || []).length));
}

/* =========================================================================
 * [3] 방송이 끝나면 원래 상태로 돌아가 있다
 * ========================================================================= */
section("[3] 방송이 끝난 뒤 상태가 어긋나지 않는다");
{
  const { App } = boot();
  openLong(App, 110000, 1000, 10);
  lookAt(App, "ETHUSDT");
  const 내가건함수 = App.Config.getActiveSymbol;

  for (let i = 0; i < 30; i++) App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 + i });

  ok("틱이 다 돈 뒤 getActiveSymbol 이 내가 건 함수 그대로다",
    App.Config.getActiveSymbol === 내가건함수, "다른 함수로 바뀌어 있습니다");
  ok("틱이 다 돈 뒤 값도 ETHUSDT 다", App.Config.getActiveSymbol() === "ETHUSDT",
    String(App.Config.getActiveSymbol()));
  ok("중간에 남이 값을 가로챈 일이 없다 (stolen 0)",
    App.SymbolGuardEmitView.getStats().stolen === 0,
    JSON.stringify(App.SymbolGuardEmitView.getStats()));
}

/* =========================================================================
 * [3-1] 한 틱에 방송이 여러 번 나가도 매번 풀어 준다
 *
 *   엔진 핸들러 한 번(= 바꿔치기 한 구간) 안에서 방송이 두 번 이상 나갑니다.
 *   TP 에 닿으면 closePosition 이 trading:update 를 먼저 쏘고(js/trading.js:249),
 *   그 뒤 onPriceUpdate 가 또 쏩니다(:93). trading:persisted 까지 셋입니다.
 *   방송이 끝날 때 바꿔치기를 도로 씌우지 않으면 두 번째부터는 "풀 것이 없는"
 *   상태로 지나가고, js/symbol-guard.js 의 finally 도 자기가 씌운 것이 아닌
 *   값을 만나게 됩니다.
 *
 *   돌연변이로 확인함 — 되돌리는 줄을 지우면 3 이 1 로 떨어집니다.
 * ========================================================================= */
section("[3-1] 한 틱에 방송이 여러 번 나가도 매번 풀어 준다");
{
  const { App } = boot();
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);
  const opened = App.Trading.openPosition("long", 1000, 111000);   // TP 111,000
  ok("TP 를 걸고 진입", opened.ok === true && opened.position.tp === 111000,
    opened.error || String(opened.position && opened.position.tp));

  lookAt(App, "ETHUSDT");
  const before = App.SymbolGuardEmitView.getStats().restored;
  let 방송 = 0;
  App.Bus.on("trading:update", function () { 방송++; });

  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 111500 }); // TP 도달

  const 증가 = App.SymbolGuardEmitView.getStats().restored - before;
  ok("한 틱에 trading:update 가 2번 나갔다", 방송 === 2, "방송 " + 방송 + "번");
  ok("그 틱에서 3번 다 풀어 줬다 (되돌리는 줄을 지우면 1 로 떨어짐)",
    증가 === 3, "restored 증가 " + 증가);
  ok("TP 로 정리됐다 (엔진은 그대로 동작)",
    App.Trading.getSnapshot().position === null, "포지션이 남아 있습니다");
}

/* =========================================================================
 * [4] 바꿔치기가 없을 때는 손대지 않는다
 * ========================================================================= */
section("[4] 바꿔치기가 없을 때는 아무것도 하지 않는다");
{
  const { App } = boot();
  for (let i = 0; i < 10; i++) App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 + i });
  const st = App.SymbolGuardEmitView.getStats();
  ok("포지션이 없으면 푼 적이 없다 (restored 0)", st.restored === 0, JSON.stringify(st));
  ok("그냥 지나간 방송이 있다 (skipped > 0)", st.skipped > 0, JSON.stringify(st));

  openLong(App, 110000, 1000, 10);              // 같은 종목(BTCUSDT)을 보는 중
  const before = App.SymbolGuardEmitView.getStats().restored;
  for (let i = 0; i < 10; i++) App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 + i });
  ok("같은 종목을 보고 있으면 풀 일이 없다 (restored 그대로)",
    App.SymbolGuardEmitView.getStats().restored === before,
    JSON.stringify(App.SymbolGuardEmitView.getStats()));
  ok("주문 잠금 덮개도 안 보인다 (같은 종목이라 막을 게 없다)",
    App.OrderLockNotice.isShown() === false, "보입니다");
}

/* =========================================================================
 * [5] index.html 등록 · git 추적
 *     문서·HTML 이 가리키는 파일이 git 에 없는 사고가 2026-08-27 에
 *     하루 세 번 있었습니다. fs.existsSync 로는 안 잡혀서 git ls-files 로 봅니다.
 * ========================================================================= */
section("[5] index.html 등록 · git 추적");
{
  const html = read("index.html");
  ok("index.html 이 js/symbol-guard-emit-view.js 를 부른다",
    html.indexOf('src="js/symbol-guard-emit-view.js"') !== -1);

  const gi = html.indexOf('src="js/symbol-guard.js"');
  const ei = html.indexOf('src="js/symbol-guard-emit-view.js"');
  ok("js/symbol-guard.js 보다 뒤에 있다 (emit 감싸기가 바깥이어야 함)",
    gi !== -1 && ei !== -1 && ei > gi, "symbol-guard " + gi + " / emit-view " + ei);

  let tracked = "";
  try {
    tracked = require("child_process")
      .execFileSync("git", ["ls-files", "js/symbol-guard-emit-view.js"], { cwd: REPO })
      .toString().trim();
  } catch (e) { tracked = ""; }
  ok("git 에 추적되고 있다 (clone 한 PC 에서 빈 링크가 되지 않는다)",
    tracked === "js/symbol-guard-emit-view.js", tracked || "git ls-files 결과 없음");
}

/* =========================================================================
 * [6] 읽는 순서가 잘못되면 스스로 거부한다 — 2026-08-28 추가
 *     본부장 돌연변이 ⑤ 로 뚫린 구멍. [0]~[5] 28건이 전부 통과했습니다.
 *
 *  무엇이 뚫렸나 — js/symbol-guard-emit-view.js 의 이 한 줄을 지워도
 *  아무 검사도 안 걸렸습니다.
 *        if (!App.Bus.__symbolGuardedEmit) return false;
 *  이 줄은 "js/symbol-guard.js 가 먼저 emit 을 감싼 뒤가 아니면 나는 감싸지
 *  않는다" 는 뜻입니다. 이 모듈은 반드시 symbol-guard 의 emit 감싸기보다
 *  "바깥" 이어야 합니다 — 안쪽이면 symbol-guard 의 symbol:change 판정까지
 *  바꿔치기된 값을 읽게 됩니다.
 *
 *  [5] 는 index.html 의 글자 순서만 봅니다. 그런데 이 줄이 없으면
 *  index.html 을 고치지 않아도 (읽는 순서가 어떤 이유로든 어긋나는 순간)
 *  조용히 안쪽에 붙습니다. 오류도 안 나고 화면도 멀쩡합니다.
 *  그래서 글자 검사(정적) 말고 "실제로 거부하는지" 를 같이 봅니다.
 *
 *  ⚠ 실제 화면에서는 아무도 init() 을 손으로 부르지 않습니다 —
 *     파일 끝에서 스스로 켭니다. 그래서 이 칸은 손으로 부르지 않고
 *     스스로 켜진 결과만 봅니다(실제와 같은 조건).
 * ========================================================================= */
section("[6] symbol-guard 보다 먼저 읽히면 감싸기를 거부한다");
{
  {
    const { App } = boot();                       // 올바른 순서
    ok("올바른 순서면 감쌌다 (isWrapped true)",
      App.SymbolGuardEmitView.isWrapped() === true,
      String(App.SymbolGuardEmitView.isWrapped()));
  }
  {
    const { App } = boot({ wrongOrder: true });   // symbol-guard 보다 먼저 읽음
    ok("먼저 읽히면 감싸지 않는다 (isWrapped false — 안쪽에 붙지 않는다)",
      App.SymbolGuardEmitView.isWrapped() === false,
      String(App.SymbolGuardEmitView.isWrapped()));
    const st = App.SymbolGuardEmitView.getStats();
    ok("감싸지 않았으니 방송에 손댄 흔적이 하나도 없다",
      st.restored === 0 && st.skipped === 0 && st.noReal === 0 && st.stolen === 0,
      JSON.stringify(st));

    /* 거부만 하고 끝내지 않습니다 — 나중에 순서가 갖춰지면 스스로 붙습니다.
       (init() 이 50ms 간격으로 200번까지 다시 시도합니다) */
    ok("거부한 뒤에도 다시 시도할 준비가 되어 있다 (init 이 재시도 타이머를 건다)",
      read("js/symbol-guard-emit-view.js").indexOf("setInterval") !== -1);
  }

  /* 소스로도 한 번 더 — 지웠을 때 왜 터졌는지 바로 읽히게 */
  ok("js/symbol-guard-emit-view.js 가 __symbolGuardedEmit 를 확인한 뒤에만 감싼다",
    read("js/symbol-guard-emit-view.js").indexOf("if (!App.Bus.__symbolGuardedEmit) return false;") !== -1,
    "이 줄이 없으면 symbol-guard 안쪽에 조용히 붙습니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
