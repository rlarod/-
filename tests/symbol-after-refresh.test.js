/* tests/symbol-after-refresh.test.js
 * =========================================================================
 * 새로고침한 뒤 청산해도 종목이 제 이름으로 기록된다 — 2026-08-27 [P1]
 * =========================================================================
 *
 * ── 무엇이 고장나 있었나 ──────────────────────────────────────────────────
 *   삼성전자 포지션을 들고 F5 → 청산
 *       채팅 알림      "비트코인 청산"      ❌  실제로는 삼성전자
 *       서버 trades    symbol = BTCUSDT     ❌
 *
 *   새로고침하면 "활성 종목" 만 BTCUSDT 로 되돌아갑니다
 *   (js/symbol-stream-switch.js:90-93 — 활성 종목은 저장하지 않습니다).
 *   포지션에는 진짜 종목이 남아 있는데도, 종목을 모르는 기록에 도장을 찍을 때
 *   활성 종목(=BTCUSDT)을 그대로 썼습니다.
 *
 *       js/symbol-guard.js:317        duringRestore ? DEFAULT_SYMBOL : activeSymbol()
 *       js/symbol-sync-bridge.js:196  createdMs >= PAGE_LOAD ? activeSymbol() : DEFAULT
 *
 *   실측(고치기 전) — 네 종목 전부 closedTrades[0].symbol === "BTCUSDT".
 *   화면도 멀쩡하고 오류도 안 납니다. 회원은 자기 거래기록이 틀린 줄 모릅니다.
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 *   1) 네 종목 전부, F5 뒤 청산해도 그 종목으로 기록된다
 *   2) 옛 기록(symbol 칸이 아예 없는 것)은 여전히 BTCUSDT 로 남는다
 *      — 그때는 거래 가능한 종목이 BTCUSDT 뿐이었으므로 그것이 사실입니다
 *   3) 옛 청산기록이 "지금 들고 있는 종목" 으로 물들지 않는다
 *   4) 종목을 찾는 순서가 1)서버 → 2)로컬 포지션 → 3)활성 종목 → 4)BTCUSDT 다
 *   5) 안전장치가 약해지지 않았다
 *      · getNettedCount() === 1  (시세 통로가 하나)
 *      · isLocked() 판정이 그대로
 *      · passes() 가 고치기 전보다 더 많이 통과시키지 않는다
 *      · 찍는 값은 언제나 비어 있지 않은 문자열
 *        (undefined 를 찍으면 need 가 null 이 되어 그물이 통째로 열립니다)
 *
 * 네트워크는 한 번도 안 씁니다. 사이트 코드는 읽어서 띄우기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

const TRADING_LS_KEY = "btc_sim_v2_trading";

/* -------------------------------------------------------------------------
 * 작은 부팅기 — index.html 과 같은 순서로 읽습니다.
 * (symbol-sync-bridge.js 는 반드시 symbol-guard.js "뒤" 입니다 — 도장 우선권.
 *  그 순서 자체는 tests/storage-save-wrap-order.test.js 가 못 박습니다.)
 * ----------------------------------------------------------------------- */
function boot(seedDoc) {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () {
    this.close = () => {};
    this.send = () => {};
  };
  win.fetch = () => {
    throw new Error("테스트 중에는 네트워크를 쓰지 않습니다");
  };
  win.alert = () => {};

  if (seedDoc) {
    win.localStorage.setItem(
      TRADING_LS_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), state: seedDoc })
    );
  }

  win.eval(
    "window.App = window.App || {};" +
      "App.Bus = (function(){ var L = {}; return {" +
      "  on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
      "  off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
      "  emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{ f(p); }catch(x){} }); }" +
      "}; })();" +
      "App.bootApp = function(){ return true; };" +
      "App.SupabaseClient = { get: function(){ return null; } };"
  );

  [
    "js/config.js",
    "js/utils.js",
    "js/storage.js",
    "js/symbol-registry.js",
    "js/symbol-guard.js",
    "js/symbol-sync-bridge.js",
    /* js/risk-brackets.js — 2026-08-31 대표 결재(바이낸스 구간별 유지증거금). index.html 은 risk-brackets → trading 순서라 여기도 같게 태웁니다. 안 태우면 이 테스트는 회원이 겪지 않는 옛 고정값(MMR_FALLBACK 0.5%) 경로를 재게 됩니다. */
    "js/risk-brackets.js",
    "js/trading.js",
    "js/max-margin-safe.js",   // 엔진을 감쌉니다 — 반드시 trading.js 뒤
  ].forEach((f) => win.eval(read(f)));

  return { win, App: win.App };
}

/* 새로고침하면 활성 종목은 BTCUSDT 로 되돌아갑니다(저장하지 않으므로). */
function setActive(App, symbol) {
  App.Config.getActiveSymbol = function () {
    return symbol;
  };
}

function storedDoc(win) {
  return JSON.parse(win.localStorage.getItem(TRADING_LS_KEY)).state;
}

/* 1세션 — 그 종목으로 포지션을 하나 만들고 저장된 문서를 돌려줍니다. */
function 포지션만들기(symbol, price) {
  const { win, App } = boot(null);
  App.bootApp();
  App.Trading.init();
  setActive(App, symbol);
  App.Bus.emit("price:update", { symbol: symbol, price: price });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  return storedDoc(win);
}

/* 2세션 — F5 한 뒤(활성 종목은 BTCUSDT) 청산합니다. */
function 새로고침후청산(seedDoc, posSymbol, price) {
  const { win, App } = boot(seedDoc);
  App.Trading.init(); // 복원 구간(armed=true)에서 저장소를 읽습니다
  App.bootApp(); // 복원 끝
  setActive(App, "BTCUSDT"); // js/symbol-stream-switch.js:90-93
  const restored = App.Trading.getSnapshot().position;
  App.Bus.emit("price:update", { symbol: posSymbol, price: price * 1.01 });
  App.Trading.closePosition();
  const snap = App.Trading.getSnapshot();
  return {
    win: win,
    App: App,
    복원된포지션: restored && restored.symbol,
    청산기록: snap.closedTrades[0] && snap.closedTrades[0].symbol,
    저장된청산기록: storedDoc(win).closedTrades[0] && storedDoc(win).closedTrades[0].symbol,
    netted: App.SymbolGuard.getNettedCount(),
  };
}

const 네종목 = [
  ["BTCUSDT", 110000],
  ["QQQUSDT", 717],
  ["SAMSUNGUSDT", 55],
  ["SKHYNIXUSDT", 250],
];

console.log("\n새로고침한 뒤 청산해도 종목이 제 이름으로 기록된다 [P1]");

/* =========================================================================
 * [1] 네 종목 전부 — F5 뒤 청산해도 그 종목으로 남는다
 * ========================================================================= */
section("[1] 네 종목 전부 F5 뒤 청산 (고치기 전에는 전부 BTCUSDT 였습니다)");
{
  네종목.forEach(([sym, price]) => {
    const r = 새로고침후청산(포지션만들기(sym, price), sym, price);
    ok(sym + " — 복원된 포지션이 " + sym, r.복원된포지션 === sym, String(r.복원된포지션));
    ok(sym + " — closedTrades[0].symbol 이 " + sym, r.청산기록 === sym, String(r.청산기록));
    ok(sym + " — 저장된 청산기록도 " + sym, r.저장된청산기록 === sym, String(r.저장된청산기록));
    ok(sym + " — 시세 통로는 여전히 하나(netted=1)", r.netted === 1, String(r.netted));
  });
}

/* =========================================================================
 * [2] 옛 기록은 여전히 BTCUSDT (4단계를 없애면 안 됩니다)
 * ========================================================================= */
section("[2] 옛 기록(symbol 칸이 없는 것)은 그대로 BTCUSDT");
{
  const legacy = 포지션만들기("BTCUSDT", 110000);
  delete legacy.position.symbol;
  (legacy.closedTrades || []).forEach((t) => delete t.symbol);
  (legacy.orderHistory || []).forEach((o) => delete o.symbol);

  const r = 새로고침후청산(legacy, "BTCUSDT", 110000);
  ok("종목을 모르는 옛 포지션은 BTCUSDT 로 복원된다", r.복원된포지션 === "BTCUSDT", String(r.복원된포지션));
  ok("그 청산기록도 BTCUSDT", r.청산기록 === "BTCUSDT", String(r.청산기록));
}

/* =========================================================================
 * [3] 옛 청산기록이 "지금 들고 있는 종목" 으로 물들지 않는다
 * ========================================================================= */
section("[3] 옛 청산기록에 지금 종목이 번지지 않는다");
{
  const seed = 포지션만들기("SAMSUNGUSDT", 55);
  /* 종목 칸이 없는 옛 거래 2건을 섞어 둡니다(이번 세션보다 훨씬 전 시각). */
  seed.closedTrades = [
    { side: "long", leverage: 10, entry: 100, exit: 101, qty: 1, margin: 10, pnl: 1, pnlPercent: 10, fee: 0.1, reason: "수동청산", closeTime: 1700000000000 },
    { side: "short", leverage: 5, entry: 200, exit: 199, qty: 1, margin: 40, pnl: 1, pnlPercent: 2, fee: 0.2, reason: "수동청산", closeTime: 1700000001000 },
  ];

  const { win, App } = boot(seed);
  App.Trading.init();
  App.bootApp();
  setActive(App, "BTCUSDT");
  App.Bus.emit("price:update", { symbol: "SAMSUNGUSDT", price: 55.5 });
  App.Trading.closePosition();

  const c = App.Trading.getSnapshot().closedTrades;
  ok("방금 만든 청산기록은 SAMSUNGUSDT", c[0].symbol === "SAMSUNGUSDT", String(c[0].symbol));
  ok("옛 청산기록 1은 BTCUSDT 그대로", c[1].symbol === "BTCUSDT", String(c[1].symbol));
  ok("옛 청산기록 2도 BTCUSDT 그대로", c[2].symbol === "BTCUSDT", String(c[2].symbol));
  console.log("      └ 새 청산=" + c[0].symbol + " / 옛것=" + c[1].symbol + "," + c[2].symbol);
}

/* =========================================================================
 * [4] 복원 구간에서 서버 문서를 저장해도 로컬 포지션의 종목이 살아남는다
 *     (js/auth.js:412 가 하는 그 저장 — symbol 을 안 실어옵니다)
 * ========================================================================= */
section("[4] 복원 구간 — 서버가 종목을 안 실어와도 로컬 포지션에서 찾는다");
{
  const seed = 포지션만들기("SAMSUNGUSDT", 55);
  const openTime = seed.position.openTime;

  const { App } = boot(seed);
  App.Trading.init(); // App.bootApp() 을 아직 안 불렀으므로 복원 구간입니다
  ok("복원 구간이다(armed=true)", App.SymbolGuard.isArmed() === true, String(App.SymbolGuard.isArmed()));

  const serverDoc = {
    balance: 100000,
    leverage: 10,
    position: { side: "long", entry: 55, leverage: 10, margin: 1000, qty: 18, liq: 50, entryFee: 0.5, openTime: openTime, orderId: "x" },
    pendingOrder: null,
    orderHistory: [],
    closedTrades: [],
    fundingHistory: [],
    lastSettledFundingTime: null,
  };
  App.Storage.save("trading", serverDoc);
  ok("서버가 종목을 빠뜨려도 SAMSUNGUSDT 로 찍힌다", serverDoc.position.symbol === "SAMSUNGUSDT", String(serverDoc.position.symbol));

  /* openTime 이 다르면 = 다른 포지션이므로 지금 것을 빌려오면 안 됩니다. */
  const 남의포지션 = {
    position: { side: "long", entry: 1, leverage: 10, margin: 1, qty: 1, liq: 0, entryFee: 0, openTime: 1699999999999 },
  };
  App.Storage.save("trading", 남의포지션);
  ok("openTime 이 다른 포지션에는 지금 종목을 빌려주지 않는다", 남의포지션.position.symbol === "BTCUSDT", String(남의포지션.position.symbol));
}

/* =========================================================================
 * [5] 안전장치가 약해지지 않았다
 * ========================================================================= */
section("[5] 안전장치 — 그물·자물쇠가 그대로다");
{
  const seed = 포지션만들기("SAMSUNGUSDT", 55);
  const { App } = boot(seed);
  App.Trading.init();
  App.bootApp();
  setActive(App, "BTCUSDT");

  ok("그물이 씌워진 구독자는 하나(거래엔진)", App.SymbolGuard.getNettedCount() === 1, String(App.SymbolGuard.getNettedCount()));
  ok("포지션이 있으면 잠긴다", App.SymbolGuard.isLocked() === true, String(App.SymbolGuard.isLocked()));
  ok("내 포지션 종목은 SAMSUNGUSDT", App.SymbolGuard.requiredSymbol() === "SAMSUNGUSDT", String(App.SymbolGuard.requiredSymbol()));
  ok("다른 종목(BTC) 시세는 거래엔진에 안 넘어간다", App.SymbolGuard.passes({ symbol: "BTCUSDT", price: 1 }) === false);
  ok("내 종목 시세는 넘어간다", App.SymbolGuard.passes({ symbol: "SAMSUNGUSDT", price: 1 }) === true);
  /* 아래 둘은 이번 건의 범위가 아닙니다 — 고치기 전과 같은지만 못 박습니다.
     (조사팀 2026-08-27: symbol-guard.js:380 need 가 null 이면 통과 /
      :411 그물은 price:update 만 감쌈. 둘 다 이번 수리에서 손대지 않았습니다.) */
  ok("종목이 안 적힌 시세는 예전처럼 통과한다(이번 건 범위 밖, 동작 유지)", App.SymbolGuard.passes({ price: 1 }) === true);

  const 빈손 = boot(null);
  빈손.App.Trading.init();
  빈손.App.bootApp();
  ok("포지션이 없으면 잠기지 않는다", 빈손.App.SymbolGuard.isLocked() === false, String(빈손.App.SymbolGuard.isLocked()));
  ok("포지션이 없으면 그물이 아무것도 안 버린다", 빈손.App.SymbolGuard.passes({ symbol: "BTCUSDT", price: 1 }) === true);
}

/* =========================================================================
 * [6] 찍는 값은 언제나 "비어 있지 않은 문자열"
 *     — undefined 를 찍으면 needFrom() 이 null 이 되어 그물이 통째로 열립니다
 * ========================================================================= */
section("[6] 도장 값이 비거나 undefined 가 되지 않는다");
{
  네종목.concat([["없는종목", 10]]).forEach(([sym, price]) => {
    const { App } = boot(null);
    App.bootApp();
    App.Trading.init();
    setActive(App, sym);
    App.Bus.emit("price:update", { symbol: sym, price: price });
    App.Trading.setLeverage(10);
    App.Trading.openPosition("long", 1000);
    const s = App.Trading.getSnapshot().position.symbol;
    ok(sym + " — 도장이 비어 있지 않은 문자열", typeof s === "string" && s.length > 0, String(s));
  });

  /* 저장소도 거래엔진도 없는 최악의 상황에서도 문자열이어야 합니다. */
  const { App } = boot(null);
  App.Storage.load = function () {
    throw new Error("저장소 고장");
  };
  const doc = { position: { side: "long", entry: 1, leverage: 10, margin: 1, qty: 1, liq: 0, entryFee: 0, openTime: Date.now() } };
  App.Storage.save("trading", doc);
  ok("저장소가 고장나도 BTCUSDT 로라도 찍는다", typeof doc.position.symbol === "string" && doc.position.symbol.length > 0, String(doc.position.symbol));
}

/* =========================================================================
 * [7] 찾는 순서가 코드에 그대로 적혀 있다 (다음 사람이 뒤집지 않게)
 * ========================================================================= */
section("[7] 우선순위와 4단계 보존");
{
  const guard = read("js/symbol-guard.js");
  const bridge = read("js/symbol-sync-bridge.js");

  ok("guard 가 로컬 포지션을 먼저 본다", /function localSymbol\(/.test(guard) && /var local = localSymbol\(/.test(guard));
  ok("guard 의 마지막 단계는 여전히 BTCUSDT 다", /return duringRestore \? DEFAULT_SYMBOL : activeSymbol\(\);/.test(guard), "4단계를 없애면 옛 기록이 깨집니다");
  ok("bridge 가 로컬 포지션을 활성 종목보다 먼저 본다", bridge.indexOf("var held = heldSymbol(doc);") > 0 && bridge.indexOf("var held = heldSymbol(doc);") < bridge.lastIndexOf("return activeSymbol();"));
  ok("bridge 도 옛 기록은 BTCUSDT 로 남긴다", /if \(!sameSession\) return DEFAULT_SYMBOL;/.test(bridge));
  ok("두 파일의 기본 종목이 BTCUSDT 로 같다", /DEFAULT_SYMBOL = "BTCUSDT"/.test(guard) && /DEFAULT_SYMBOL = "BTCUSDT"/.test(bridge));
  ok("두 파일에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(guard) && /되돌리는 방법/.test(bridge));
}

/* =========================================================================
 * [8] 수정 금지 파일 12개를 건드리지 않았다
 * ========================================================================= */
section("[8] 수정 금지 파일 12개");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [
    ["trading.js", require("./_locked-hashes.js").TRADING],  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
    ["ui.js", "333fc427e75b47b306699c92aa4e7b50"],
    ["auth.js", "9cec9a7257eb54f379bf72e14e21e463"],
    ["supabase-sync.js", "faddcbbc34b5165177ff26cb978040f8"],
    ["chat.js", "a93dfaa7f82ce72a914b270acb3650bb"],
    ["leaderboard.js", "62e839f06e0565cca5d9216e484b6031"],
    ["admin.js", "424e4c63ec1cd24681c4f27f60aee2fa"],
    ["season.js", "9c5fbf13ced09ca2f348e48f87c78224"],
    ["board.js", "8b847bd8f5d8231b8dd329f8b15dbe37"],
    ["orderbook.js", "fa5f77dc5108133128f85ba5ab3f096e"],
    ["chart.js", "02ddcb000d577131f797143d08c09123"],
    ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"],
  ].forEach(([f, want]) => ok("js/" + f + " 해시 그대로", md5(f) === want, md5(f)));
}

/* =========================================================================
 * [9] 테스트 등록
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const 목록 = read("tests/_order.txt"); /* 2026-08-27 — 실행 목록이 package.json 에서 tests/_order.txt 로 옮겨졌습니다 */
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다",
    목록.indexOf("tests/symbol-after-refresh.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
process.exit(fail === 0 ? 0 : 1);
