/* tests/limit-close-symbol-seal.test.js
 * =========================================================================
 * 지정가 청산은 "내 포지션 종목" 시세로만 발동한다 — 봉인 (2026-08-27)
 * =========================================================================
 *
 * 왜 이 파일이 생겼나
 *   2026-08-27 감사팀 점검 — js/limit-close.js 를 검사하는 테스트가
 *   0건이었습니다.  grep -rl "limit-close" tests/  →  0건
 *   이 파일은 돈이 나가는 경로입니다. 봉인이 없으면 안 됩니다.
 *
 * 이 파일이 왜 위험한가 (구조)
 *   js/limit-close.js:98 에서 App.Trading.closePosition() 을 **직접** 부릅니다.
 *   그런데 price:update 를 자기 이름으로 따로 구독하기 때문에
 *     · js/symbol-guard.js 의 "엔진 그물" 에 안 걸리고
 *     · js/symbol-guard.js (b) 의 종목 바꿔치기에도 안 걸리고
 *     · js/multi-symbol-view.js 의 "화면 그물" 은 일부러 제외돼 있습니다
 *   → 스스로 종목을 대조하는 것이 **유일한 방어**입니다.
 *     그 대조가 사라지면 남의 종목 시세로 내 포지션이 청산됩니다(P1, 즉시 돈).
 *
 * 그래서 여기서 못 박는 것
 *   1) 남의 종목 시세로는 절대 청산되지 않는다 (롱·숏 둘 다)
 *   2) 남의 종목 시세를 받아도 예약은 살아 있다 (조용히 사라지면 안 됨)
 *   3) pos.symbol 이 없는 옛 기록은 getActiveSymbol() 로 판단한다  ← 폴백 경로
 *   4) 소스에 대조 코드·직접 호출이 그대로 있다
 *   5) js/multi-symbol-view.js 가 이 구독자를 화면 그물에서 뺀 판단
 *      — 다른 종목 차트를 보는 중에도 지정가 청산이 발동해야 합니다.
 *        여기서 또 걸러내면 지정가 청산이 "영영 안 되는" 조용한 고장이 됩니다.
 *
 * 네트워크를 한 번도 쓰지 않습니다. 거래엔진과 방송은 가짜로 세우고
 * js/limit-close.js · js/multi-symbol-view.js 는 진짜 파일을 그대로 태웁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* ------------------------------------------------------------------------
 * 가짜 무대 — 거래엔진·방송·DOM 을 손으로 세웁니다.
 * ---------------------------------------------------------------------- */
function fakeEl() {
  return {
    style: {}, value: "", textContent: "", disabled: false,
    addEventListener() {}, focus() {},
  };
}

function boot(opts) {
  opts = opts || {};
  const closeCalls = [];
  const els = {};

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout: () => 0,
    JSON: JSON,
    Function: Function,
    Object: Object,
    Array: Array,
    String: String,
    Math: Math,
    Promise: Promise,
    parseFloat: parseFloat,
    isFinite: isFinite,
    module: { exports: {} },
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById(id) { return (els[id] = els[id] || fakeEl()); },
    },
  };
  sandbox.window = sandbox;
  sandbox.alert = (m) => { sandbox.__lastAlert = m; };

  const listeners = {};
  const bus = {
    on(e, f) { (listeners[e] = listeners[e] || []).push(f); return f; },
    off(e, f) { if (listeners[e]) listeners[e] = listeners[e].filter((x) => x !== f); },
    emit(e, p) { (listeners[e] || []).forEach((f) => f(p)); },
    _listeners: listeners,
  };

  const state = {
    position: opts.position === undefined
      ? { side: "long", orderId: "ORD-1", symbol: "BTCUSDT", entry: 60000, qty: 1, margin: 1000 }
      : opts.position,
    currentPrice: opts.currentPrice === undefined ? 60000 : opts.currentPrice,
  };

  sandbox.App = {
    Bus: bus,
    Utils: { formatCurrencyPlain: (v) => String(v) },
    Config: opts.noConfig ? {} : {
      getActiveSymbol: () => sandbox.__view || "BTCUSDT",
      buildCombinedStreamUrl: () => "wss://x/stream?streams=btcusdt@trade",
    },
    Trading: {
      getSnapshot: () => ({ position: state.position, currentPrice: state.currentPrice }),
      closePosition: () => { closeCalls.push({ price: state.currentPrice }); state.position = null; },
    },
  };
  sandbox.__view = opts.view || "BTCUSDT";

  vm.createContext(sandbox);
  vm.runInContext(read("js/limit-close.js"), sandbox, { filename: "js/limit-close.js" });

  return { sandbox, App: sandbox.App, LC: sandbox.App.LimitClose, bus, state, closeCalls, els };
}

/* 예약을 거는 실제 경로(apply)를 그대로 씁니다 — 손으로 target 을 심지 않습니다. */
function reserve(env, price) {
  env.LC.init();
  env.els["pos-limit-price"].value = String(price);
  env.LC.applyForTest();
  return env.LC.getTargetForTest();
}

/* ========================================================================
 * 1. 남의 종목 시세로는 청산되지 않는다   ← 이것 하나 때문에 이 파일이 있습니다
 * ====================================================================== */
section("1. 남의 종목 시세로는 청산되지 않는다");
{
  const env = boot({ position: { side: "long", orderId: "ORD-1", symbol: "BTCUSDT" }, currentPrice: 60000 });
  const t = reserve(env, 61000);
  ok("예약이 걸렸다 (롱 · 목표 61,000)", !!t && t.price === 61000 && t.side === "long");

  /* 삼성전자(005930)가 61,500 이어도 BTC 포지션과는 아무 상관이 없습니다. */
  env.LC.onPriceForTest({ symbol: "005930", price: 61500 });
  ok("남의 종목이 목표가를 넘어도 청산되지 않는다", env.closeCalls.length === 0,
    "closePosition 이 " + env.closeCalls.length + "회 불렸습니다 — 남의 종목 시세로 돈이 나갑니다");
  ok("남의 종목 시세를 받아도 예약이 사라지지 않는다", env.LC.getTargetForTest() !== null,
    "예약이 조용히 지워지면 회원은 걸어둔 줄 알고 기다립니다");

  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("내 종목이 목표가에 닿으면 청산된다", env.closeCalls.length === 1, String(env.closeCalls.length));
  ok("청산 뒤 예약은 비워진다", env.LC.getTargetForTest() === null);
}
{
  const env = boot({ position: { side: "short", orderId: "ORD-2", symbol: "ETHUSDT" }, currentPrice: 3000 });
  const t = reserve(env, 2900);
  ok("숏 예약이 걸렸다 (ETH · 목표 2,900)", !!t && t.side === "short");

  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 100 });
  ok("숏도 남의 종목 시세로는 청산되지 않는다", env.closeCalls.length === 0,
    "BTC 가 100 이라고 ETH 숏이 청산되면 안 됩니다");

  env.LC.onPriceForTest({ symbol: "ETHUSDT", price: 2900 });
  ok("숏은 내 종목이 목표 이하로 내려오면 청산된다", env.closeCalls.length === 1);
}
{
  /* 방향 판정 자체도 같이 못 박습니다 — 롱은 위로, 숏은 아래로만. */
  const env = boot({ position: { side: "long", orderId: "ORD-3", symbol: "BTCUSDT" }, currentPrice: 60000 });
  reserve(env, 61000);
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 60999.99 });
  ok("목표가에 못 닿으면 청산되지 않는다", env.closeCalls.length === 0);
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("정확히 목표가면 청산된다 (>= 판정)", env.closeCalls.length === 1);
}

/* ========================================================================
 * 2. pos.symbol 이 없는 옛 기록 — getActiveSymbol() 폴백 경로
 * ------------------------------------------------------------------------
 * 종목 전환이 열리기 전(2026-08-27 이전)에 저장된 포지션에는 종목 도장이
 * 없습니다. js/limit-close.js:81-85 는 그때 App.Config.getActiveSymbol() 로
 * 떨어집니다. 감사팀이 "그 경로도 봉인하라" 고 지목한 자리입니다.
 * ====================================================================== */
section("2. 종목 도장이 없는 옛 포지션 (getActiveSymbol 폴백)");
{
  const env = boot({ position: { side: "long", orderId: "OLD-1" }, currentPrice: 60000, view: "BTCUSDT" });
  const t = reserve(env, 61000);
  ok("도장 없는 포지션에도 예약을 걸 수 있다", !!t);

  env.LC.onPriceForTest({ symbol: "005930", price: 99999 });
  ok("도장이 없어도 남의 종목으로는 청산되지 않는다 (활성 종목으로 판단)",
    env.closeCalls.length === 0,
    "폴백이 사라지면 옛 포지션이 남의 시세로 청산됩니다");

  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("도장이 없어도 활성 종목 시세면 청산된다", env.closeCalls.length === 1);
}
{
  /* 화면을 삼성으로 옮긴 채 도장 없는 BTC 포지션을 들고 있으면 — limit-close 는
     "삼성" 을 내 종목으로 오해합니다. 이건 폴백의 한계이고 지금 동작입니다.
     사실로 기록해 둡니다(도장 쪽이 고쳐지면 여기서 터집니다). */
  const env = boot({ position: { side: "long", orderId: "OLD-2" }, currentPrice: 60000, view: "005930" });
  reserve(env, 61000);
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("[한계 기록] 도장이 없고 화면이 다른 종목이면 내 종목 시세를 무시한다",
    env.closeCalls.length === 0,
    "지금 동작입니다. 도장을 찍는 쪽(js/symbol-guard.js)이 먼저 고쳐져야 합니다");
}
{
  /* App.Config 자체가 없으면 판단 근거가 아무것도 없어 그대로 통과합니다.
     라이브에서는 js/config.js 가 항상 먼저 뜨므로 발생하지 않는 조합입니다.
     "그런 상태가 되면 방어가 없다" 는 사실만 기록합니다. */
  const env = boot({ position: { side: "long", orderId: "OLD-3" }, currentPrice: 60000, noConfig: true });
  reserve(env, 61000);
  env.LC.onPriceForTest({ symbol: "005930", price: 61000 });
  ok("[한계 기록] App.Config 가 없으면 종목 판단 자체를 못 한다",
    env.closeCalls.length === 1,
    "지금 동작. config.js 가 안 뜨는 상황은 라이브에 없습니다");
}
{
  /* 시세에 종목이 안 실려 오면 거르지 않습니다. js/websocket.js 는 항상
     symbol 을 싣지만(103행), 안 실린 값을 버리면 지정가가 조용히 멈춥니다. */
  const env = boot({ position: { side: "long", orderId: "N-1", symbol: "BTCUSDT" }, currentPrice: 60000 });
  reserve(env, 61000);
  env.LC.onPriceForTest({ price: 61000 });
  ok("종목이 안 실린 시세는 거르지 않는다 (막으면 지정가가 조용히 멈춤)",
    env.closeCalls.length === 1);
}

/* ========================================================================
 * 3. 예약을 버려야 하는 순간
 * ====================================================================== */
section("3. 엉뚱한 포지션을 청산하지 않는다");
{
  const env = boot({ position: { side: "long", orderId: "ORD-A", symbol: "BTCUSDT" }, currentPrice: 60000 });
  reserve(env, 61000);
  env.state.position = null;
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("포지션이 사라졌으면 예약을 버린다", env.closeCalls.length === 0 && env.LC.getTargetForTest() === null);
}
{
  const env = boot({ position: { side: "long", orderId: "ORD-A", symbol: "BTCUSDT" }, currentPrice: 60000 });
  reserve(env, 61000);
  /* 청산하고 새로 잡은 다른 포지션에 옛 예약이 붙으면 안 됩니다. */
  env.state.position = { side: "long", orderId: "ORD-B", symbol: "BTCUSDT" };
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 61000 });
  ok("주문번호가 바뀌었으면 옛 예약을 버린다", env.closeCalls.length === 0 && env.LC.getTargetForTest() === null,
    "옛 예약이 새 포지션을 청산하면 회원은 이유를 알 수 없습니다");
}
{
  const env = boot({ position: { side: "long", orderId: "ORD-A", symbol: "BTCUSDT" }, currentPrice: 60000 });
  env.LC.init();
  env.LC.onPriceForTest({ symbol: "BTCUSDT", price: 99999 });
  ok("예약이 없으면 아무 일도 안 한다", env.closeCalls.length === 0);
}
{
  /* 이미 닿아 있는 가격은 예약 자체를 거부합니다(걸자마자 시장가와 같아짐). */
  const env = boot({ position: { side: "long", orderId: "ORD-A", symbol: "BTCUSDT" }, currentPrice: 60000 });
  env.LC.init();
  env.els["pos-limit-price"].value = "59000";
  env.LC.applyForTest();
  ok("롱은 현재가보다 낮은 지정가를 거부한다", env.LC.getTargetForTest() === null);
  ok("거부 사유를 회원에게 알린다", /높은 가격/.test(String(env.sandbox.__lastAlert)),
    String(env.sandbox.__lastAlert));
}

/* ========================================================================
 * 4. 소스 봉인 — 구조가 바뀌면 여기서 터진다
 * ====================================================================== */
section("4. 소스 봉인");
{
  const src = read("js/limit-close.js");
  ok("price:update 를 자기 이름으로 따로 구독한다",
    /App\.Bus\.on\("price:update", onPrice\)/.test(src),
    "구독 방식이 바뀌면 그물 전제가 통째로 달라집니다");
  ok("onPrice 안에서 App.Trading.closePosition() 을 직접 부른다",
    /App\.Trading\.closePosition\(\)/.test(src));
  ok("포지션 종목과 시세 종목을 대조하고 다르면 되돌아간다",
    /if \(posSymbol && tickSymbol && posSymbol !== tickSymbol\) return;/.test(src),
    "이 한 줄이 유일한 방어입니다. 지우면 남의 종목 시세로 청산됩니다");
  ok("도장이 없으면 getActiveSymbol() 로 떨어진다",
    /App\.Config\.getActiveSymbol\(\)/.test(src) && /pos\.symbol \|\|/.test(src));
  ok("종목 대조가 closePosition 호출보다 위에 있다",
    src.indexOf("posSymbol !== tickSymbol") < src.indexOf("App.Trading.closePosition()"),
    "순서가 뒤집히면 걸러도 이미 청산된 뒤입니다");
  ok("계산은 trading.js 에 맡긴다 (여기서 손익을 다시 계산하지 않는다)",
    !/realizedPnl|balance \+=|state\.balance/.test(src));
  ok("index.html 에 연결돼 있다", /js\/limit-close\.js/.test(read("index.html")));
}

/* ========================================================================
 * 5. js/multi-symbol-view.js 가 이 구독자를 화면 그물에서 뺀 판단
 * ------------------------------------------------------------------------
 * 2026-08-27 — 다른 종목 차트를 보면서 포지션을 들 수 있게 열면서,
 * 화면 그물(보고 있는 종목만 통과)이 생겼습니다. limit-close 의 onPrice 는
 * **일부러 제외**했습니다. 여기서 또 거르면 다른 종목을 보는 동안
 * 지정가 청산이 영영 발동하지 않습니다(오류 0건 · 조용한 고장 · P1).
 * ====================================================================== */
section("5. 화면 그물 제외 판단 (multi-symbol-view)");
{
  const env = boot({ position: { side: "long", orderId: "ORD-M", symbol: "BTCUSDT" }, currentPrice: 60000 });
  const S = env.sandbox;

  /* symbol-guard 는 이 테스트의 대상이 아니므로 최소한만 세웁니다.
     isEngineHandler 는 항상 false — limit-close 가 "엔진 지문" 이 아니라
     자기 지문(isLimitClose)으로 걸러지는지 봐야 하기 때문입니다. */
  S.App.SymbolGuard = {
    isEngineHandler: () => false,
    requiredSymbol: () => "BTCUSDT",
    getNettedCount: () => 1,
    blockReason: () => "",
  };
  S.App.Api = { fetchLatestFundingRate: () => null };

  vm.runInContext(read("js/multi-symbol-view.js"), S, { filename: "js/multi-symbol-view.js" });
  const MSV = S.App.MultiSymbolView;
  ok("화면 그물이 켜졌다", !!MSV && MSV.isOn() === true);

  /* 화면 쪽 구독자 하나 — 그물이 진짜 작동하는지 대조군으로 씁니다. */
  const screenSeen = [];
  env.bus.on("price:update", function paintTicker(p) { screenSeen.push(p.symbol); });

  /* limit-close 는 이 시점에 구독합니다(init). */
  const t = reserve(env, 61000);
  ok("예약이 걸렸다", !!t);

  ok("limit-close 의 onPrice 는 그물에 안 감싸였다",
    MSV.getCounts().enginePassed >= 1,
    "enginePassed=" + MSV.getCounts().enginePassed);
  ok("일반 화면 구독자는 그물에 감싸였다",
    MSV.getCounts().screenNetted >= 1,
    "screenNetted=" + MSV.getCounts().screenNetted);
  ok("지문 판정이 limit-close 를 엔진 쪽으로 분류한다",
    MSV.isEngineSide("price:update", function onPrice() {
      /* 실제 본문과 같은 두 지문 */
      var target = { orderId: 1 };
      S.App.Trading.closePosition();
      return target.orderId;
    }) === true);

  /* 핵심 — 화면은 삼성전자를 보는 중, 포지션은 BTC. */
  S.__view = "005930";
  env.bus.emit("price:update", { symbol: "005930", price: 99999 });
  ok("다른 종목을 보는 중, 그 종목 시세로는 청산되지 않는다", env.closeCalls.length === 0);

  env.bus.emit("price:update", { symbol: "BTCUSDT", price: 61000 });
  ok("다른 종목을 보는 중에도 내 종목 지정가 청산은 발동한다",
    env.closeCalls.length === 1,
    "여기서 0 이면 그물이 limit-close 까지 덮은 것입니다 — 지정가 청산이 영영 안 됩니다");

  ok("같은 시간 화면 구독자는 보고 있는 종목만 받았다",
    screenSeen.indexOf("BTCUSDT") < 0 && screenSeen.indexOf("005930") >= 0,
    JSON.stringify(screenSeen));
  ok("걸러진 화면 payload 가 실제로 있었다",
    MSV.getCounts().screenDropped >= 1, "screenDropped=" + MSV.getCounts().screenDropped);
}
{
  const msv = read("js/multi-symbol-view.js");
  ok("제외 판단이 소스에 그대로 있다 (isLimitClose)",
    /function isLimitClose\(fn\)/.test(msv) &&
    /s\.indexOf\("App\.Trading\.closePosition\(\)"\) >= 0/.test(msv) &&
    /s\.indexOf\("target\.orderId"\) >= 0/.test(msv));
  ok("price:update 판정에 isLimitClose 가 물려 있다",
    /isEnginePrice\(fn\) \|\| isLimitClose\(fn\)/.test(msv));
  ok("왜 제외했는지 이유가 주석에 남아 있다",
    /지정가 청산이 영영 안 됩니다/.test(msv));
}

/* ========================================================================
 * 6. 수정 금지 파일을 건드리지 않았다 (md5)
 * ---------------------------------------------------------------------- */
section("6. 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/trading.js 를 건드리지 않았다", md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
  ok("js/websocket.js 를 건드리지 않았다", md5("websocket.js") === "1a914631175760e0b0cb5144bc11b59e", md5("websocket.js"));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
