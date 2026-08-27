/* =========================================================================
 * js/multi-symbol-view.js — App.MultiSymbolView
 * =========================================================================
 * 포지션을 들고도 다른 종목 차트를 볼 수 있게 엽니다 (2026-08-27 대표 지시)
 *
 *   대표: "바이낸스에서 포지션 잡고 있다고 다른 차트 못 보는 거 아니잖아"
 *
 * ── 이 파일이 그 "한 줄" 입니다 ──────────────────────────────────────────
 *   index.html 에서 <script src="js/multi-symbol-view.js"></script> 한 줄을
 *   지우면 다섯 조각이 통째로 꺼지고 어제와 100% 같아집니다.
 *   다른 파일에 넣은 조각들은 전부 아래 isOn() 을 물어보고 나서 움직입니다.
 *
 *       js/symbol-guard.js          (b) 엔진이 도는 동안만 종목 바꿔치기
 *       js/symbol-stream-switch.js  (c) 포지션 표 종목 칸 / (e) 전환 허용 조건
 *       js/multi-symbol-view.js     (a) 스트림 덧붙이기 · 화면 그물 · (d) 신호
 *
 *   ⛔ 다섯 개는 한 묶음입니다. 하나만 떼면 아래 둘 중 하나가 됩니다.
 *       (b) 만 있으면 — 조합 주소에 포지션 종목이 없어 시세가 한 건도 안 옴.
 *                       강제청산·TP·SL·지정가·펀딩이 조용히 멈춤(오류 0건)
 *       (a) 만 있으면 — 엔진이 둘 다 받는데 js/trading.js:89 가 화면 종목만
 *                       통과시켜, 다른 종목 시세로 즉시 강제청산
 *
 * ── (a) 무엇을 덧붙이나 ──────────────────────────────────────────────────
 *       <포지션종목>@trade        엔진이 쓸 현재가 (오늘과 같은 "체결가")
 *       <포지션종목>@markPrice@1s 펀딩 정산에 쓸 마크가격·요율·정산시각
 *
 *   ⛔ @kline / @ticker 는 안 붙입니다 — js/websocket.js 가 그대로
 *      kline:update / ticker:update 로 방송해 차트와 24H 통계가 섞입니다.
 *   ⛔ @depth(호가)도 안 붙입니다 — orderbook:update 에 종목이 안 실려
 *      (js/orderbook.js:120) 구분할 방법이 아예 없습니다.
 *   ⛔ 마크가격을 엔진의 현재가로 쓰지 않습니다. 오늘 엔진이 보는 값은
 *      "체결가" 이고, 무엇으로 청산할지는 계산식이라 대표 결재 사항입니다.
 *      여기서는 "어느 종목 값을 먹일지" 만 고칩니다.
 *
 * ── 화면 그물 (이 파일) ──────────────────────────────────────────────────
 *   js/symbol-guard.js 의 그물이 "엔진에게 포지션 종목만" 보여준다면,
 *   여기 그물은 반대로 "화면에게 보고 있는 종목만" 보여줍니다.
 *   두 종목이 한 소켓으로 같이 들어오므로 양쪽 다 필요합니다.
 *
 *       엔진 쪽(통과)   js/trading.js onPriceUpdate · onFundingUpdate
 *                       js/limit-close.js onPrice
 *                         └ 이 셋은 스스로 종목을 봅니다. 여기서 걸러내면
 *                           지정가 청산이 조용히 멈춥니다(P1).
 *       화면 쪽(거름)   차트·호가·최근체결·전황·지표 등 나머지 전부
 *
 *   ⚠ 이름만 보고 고르지 않습니다. js/symbol-guard.js 가 겪은 것과 같은
 *     함정입니다 — onPriceUpdate 라는 이름의 구독자가 5개, onFundingUpdate
 *     라는 이름이 2개(js/trading.js · js/chart.js)입니다. 본문 지문으로
 *     가려냅니다.
 *
 * ── 주문은 못 엽니다 (열 수 있는 게 아니라 없는 기능입니다) ──────────────
 *       js/trading.js:116  if (state.position)     → "한 번에 하나만 가능합니다"
 *       js/trading.js:119  if (state.pendingOrder) → "대기 중인 지정가 주문이 있습니다"
 *   엔진이 구조적으로 한 종목만 들 수 있습니다. 그래서 "종목 보기" 는 열고
 *   "주문" 을 막습니다. 화면은 디자인팀이 만들고, 여기서는 상태만 내줍니다
 *   (getOrderLockState() · "orderlock:change" 방송).
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/multi-symbol-view.js"></script> 한 줄을
 *   지웁니다. 그것으로 끝입니다(다섯 조각이 한꺼번에 꺼집니다).
 *   파일까지 지우려면 그 다음에 이 파일을 지웁니다.
 * ========================================================================= */

window.App = window.App || {};

App.MultiSymbolView = (function () {
  "use strict";

  var PRICE_EVENT = "price:update";
  var FUNDING_EVENT = "funding:update";
  var TRADE_EVENT = "trade:tick";
  var KLINE_EVENT = "kline:update";
  var TICKER_EVENT = "ticker:update";

  /* 화면 그물을 씌울 방송. 전부 payload.symbol 이 실려 옵니다
     (js/websocket.js:103/108/120/132). orderbook:update 는 종목이 안 실려
     오므로 목록에 없습니다 — 애초에 호가는 두 종목을 안 받습니다. */
  var SCREEN_EVENTS = {};
  SCREEN_EVENTS[PRICE_EVENT] = true;
  SCREEN_EVENTS[FUNDING_EVENT] = true;
  SCREEN_EVENTS[TRADE_EVENT] = true;
  SCREEN_EVENTS[KLINE_EVENT] = true;
  SCREEN_EVENTS[TICKER_EVENT] = true;

  var counts = {
    appendedUrls: 0,      // 조합 주소에 포지션 종목을 덧붙인 횟수
    screenNetted: 0,      // 화면 그물을 씌운 구독자 수
    screenDropped: 0,     // 화면에 안 보여준 남의 종목 payload 수
    enginePassed: 0,      // 그대로 통과시킨 엔진 구독자 수
    fundingRerouted: 0,   // 놓친 펀딩 REST 조회를 포지션 종목으로 돌린 횟수
    lockBroadcasts: 0
  };
  /* 실측용 — 종목별로 몇 건이 화면에 갔는가 */
  var seen = { screen: {}, engine: {} };

  function bump(box, sym) {
    if (typeof sym !== "string" || !sym) sym = "(종목없음)";
    box[sym] = (box[sym] || 0) + 1;
  }

  /* ------------------------------------------------------------------
   * 켜져 있는가 — 이 파일이 읽혔다는 것 자체가 "켜짐" 입니다.
   * ------------------------------------------------------------------ */
  var on = true;
  function isOn() { return on; }

  function isSym(v) { return typeof v === "string" && v.length > 0; }

  function viewSymbol() {
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try { return App.Config.getActiveSymbol(); } catch (e) { /* noop */ }
    }
    return "BTCUSDT";
  }

  /* 내 포지션(또는 미체결)의 종목. js/symbol-guard.js 가 원본입니다. */
  function positionSymbol() {
    if (!App.SymbolGuard || typeof App.SymbolGuard.requiredSymbol !== "function") return null;
    try {
      var s = App.SymbolGuard.requiredSymbol();
      return isSym(s) ? s : null;
    } catch (e) {
      return null;
    }
  }

  /* ⭐ (e) 전환을 허용해도 되는 조건 — 조사팀이 둘 다 실제로 켜지는 것을
     확인했습니다. 그물이 진짜로 작동할 때만 다른 종목을 보여줍니다.

     requiredSymbol() 이 null 인데 포지션이 있는 순간이 존재합니다
     (복원 직후 ~ 첫 trading:update 사이). 그 창에서는 false 를 돌려주므로
     오늘과 똑같이 전환이 막힙니다 — 안전한 쪽입니다. */
  function netIsWorking() {
    if (!on) return false;
    if (!App.SymbolGuard) return false;
    try {
      if (typeof App.SymbolGuard.requiredSymbol !== "function") return false;
      if (typeof App.SymbolGuard.getNettedCount !== "function") return false;
      if (App.SymbolGuard.requiredSymbol() === null) return false;
      if (App.SymbolGuard.getNettedCount() !== 1) return false;
      return true;
    } catch (e) {
      return false; /* 못 읽으면 안 여는 쪽으로 */
    }
  }

  /* 지금 "두 종목을 동시에 보고 있는" 상태인가 */
  function isSplit() {
    if (!on) return false;
    var p = positionSymbol();
    return !!(p && p !== viewSymbol());
  }

  /* ------------------------------------------------------------------
   * (a) 조합 주소에 포지션 종목 스트림을 덧붙입니다
   * ------------------------------------------------------------------ */
  function extraStreams(pos) {
    var s = pos.toLowerCase();
    return [s + "@trade", s + "@markPrice@1s"];
  }

  function appendStreams(url) {
    if (!on || typeof url !== "string" || url.indexOf("/stream?streams=") < 0) return url;
    var pos = positionSymbol();
    if (!pos) return url;
    if (pos === viewSymbol()) return url;

    var head = url.split("/stream?streams=");
    var have = head[1] ? head[1].split("/") : [];
    var add = extraStreams(pos);
    var changed = false;
    for (var i = 0; i < add.length; i++) {
      if (have.indexOf(add[i]) < 0) { have.push(add[i]); changed = true; }
    }
    if (!changed) return url;
    counts.appendedUrls++;
    return head[0] + "/stream?streams=" + have.join("/");
  }

  function wrapUrlBuilder() {
    if (!App.Config || typeof App.Config.buildCombinedStreamUrl !== "function") return false;
    if (App.Config.buildCombinedStreamUrl.__multiSymbol) return true;
    var orig = App.Config.buildCombinedStreamUrl;
    var wrapped = function () {
      var url = orig.apply(App.Config, arguments);
      try {
        return appendStreams(url);
      } catch (e) {
        console.warn("[multi-symbol-view.js] 주소 덧붙이기 실패 — 원본 주소를 그대로 씁니다:", e);
        return url;
      }
    };
    wrapped.__multiSymbol = true;
    try {
      App.Config.buildCombinedStreamUrl = wrapped;
    } catch (e) {
      console.error("[multi-symbol-view.js] buildCombinedStreamUrl 을 못 감쌌습니다:", e);
      return false;
    }
    return App.Config.buildCombinedStreamUrl === wrapped;
  }

  /* ------------------------------------------------------------------
   * 화면 그물 — 화면 쪽 구독자에게는 "보고 있는 종목" 만 보여줍니다
   * ------------------------------------------------------------------ */

  function srcOf(fn) {
    try { return Function.prototype.toString.call(fn); } catch (e) { return ""; }
  }

  function isEnginePrice(fn) {
    if (App.SymbolGuard && typeof App.SymbolGuard.isEngineHandler === "function") {
      try { if (App.SymbolGuard.isEngineHandler(fn)) return true; } catch (e) { /* noop */ }
    }
    return false;
  }

  /* js/trading.js:367 onFundingUpdate — js/chart.js:108 에 같은 이름이 또 있어
     본문으로 가려냅니다(settleFunding 은 거래엔진에만 있습니다). */
  function isEngineFunding(fn) {
    if (typeof fn !== "function" || fn.name !== "onFundingUpdate") return false;
    var s = srcOf(fn);
    return s.indexOf("settleFunding(") >= 0 && s.indexOf("lastKnownFundingTime") >= 0;
  }

  /* js/limit-close.js:65 onPrice — 그물도 (b) 도 안 걸리는데 여기서
     closePosition() 을 직접 부릅니다(:97). 스스로 pos.symbol 을 보고
     거르므로 우리가 또 거르면 지정가 청산이 영영 안 됩니다. */
  function isLimitClose(fn) {
    if (typeof fn !== "function" || fn.name !== "onPrice") return false;
    var s = srcOf(fn);
    return s.indexOf("App.Trading.closePosition()") >= 0 && s.indexOf("target.orderId") >= 0;
  }

  function isEngineSide(event, fn) {
    if (event === PRICE_EVENT) return isEnginePrice(fn) || isLimitClose(fn);
    if (event === FUNDING_EVENT) return isEngineFunding(fn);
    return false;
  }

  function screenPasses(payload) {
    if (!on) return true;
    if (!payload || !isSym(payload.symbol)) return true;  // 종목이 안 실린 것은 그대로
    return payload.symbol === viewSymbol();
  }

  function makeScreenNet(fn) {
    var netted = function (payload) {
      if (!screenPasses(payload)) {
        counts.screenDropped++;
        return undefined;
      }
      if (payload && isSym(payload.symbol)) bump(seen.screen, payload.symbol);
      return fn.apply(this, arguments);
    };
    netted.__screenNet = true;
    return netted;
  }

  function wrapBusOn() {
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    if (App.Bus.__multiSymbolOn) return true;
    var origOn = App.Bus.on;
    App.Bus.on = function (event, fn) {
      if (!SCREEN_EVENTS[event] || typeof fn !== "function" || fn.__screenNet) {
        return origOn.call(App.Bus, event, fn);
      }
      if (isEngineSide(event, fn)) {
        counts.enginePassed++;
        /* ⚠ 손대지 않고 그대로 넘깁니다. 여기서 감싸면 js/symbol-guard.js 의
           isEngineHandler() 가 지문을 못 읽어 그물이 안 씌워집니다
           (getNettedCount() 가 0 이 됩니다). */
        return origOn.call(App.Bus, event, fn);
      }
      counts.screenNetted++;
      return origOn.call(App.Bus, event, makeScreenNet(fn));
    };
    App.Bus.__multiSymbolOn = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 놓친 펀딩 REST 조회를 포지션 종목으로 돌립니다
   * ------------------------------------------------------------------
   * js/trading.js:381 이 부팅 때 딱 한 번 이렇게 부릅니다.
   *     App.Api.fetchLatestFundingRate(cfg().getActiveSymbol())
   * 삼성 화면인 채로 새로고침하면 BTC 포지션에 삼성 펀딩이 정산됩니다.
   * (b) 로는 안 막힙니다 — 이건 방송이 아니라 직접 호출이라 그물 밖입니다.
   * js/trading.js 는 수정 금지 파일이라 App.Api 쪽을 감쌉니다.
   *
   * ⚠ requiredSymbol() 은 첫 trading:update 전에는 null 일 수 있어서
   *   여기서는 거래엔진 스냅샷의 포지션 종목을 직접 봅니다
   *   (js/trading.js:669 restoreFromStorage 가 바로 앞에서 끝나 있습니다).
   * ------------------------------------------------------------------ */
  function enginePositionSymbol() {
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return null;
    try {
      var s = App.Trading.getSnapshot();
      if (s && s.position && isSym(s.position.symbol)) return s.position.symbol;
      if (s && s.pendingOrder && isSym(s.pendingOrder.symbol)) return s.pendingOrder.symbol;
    } catch (e) { /* noop */ }
    return null;
  }

  function wrapFundingRest() {
    if (!App.Api || typeof App.Api.fetchLatestFundingRate !== "function") return false;
    if (App.Api.fetchLatestFundingRate.__multiSymbol) return true;
    var orig = App.Api.fetchLatestFundingRate;
    var wrapped = function (symbol) {
      var want = symbol;
      try {
        if (on) {
          var pos = enginePositionSymbol();
          if (pos && pos !== symbol) {
            counts.fundingRerouted++;
            console.warn(
              "[multi-symbol-view.js] 놓친 펀딩을 " + symbol + " 이 아니라 포지션 종목(" +
              pos + ") 으로 조회합니다 — 남의 종목 요율로 정산되는 것을 막습니다."
            );
            want = pos;
          }
        }
      } catch (e) {
        want = symbol; /* 못 읽으면 오늘과 똑같이 */
      }
      return orig.call(App.Api, want);
    };
    wrapped.__multiSymbol = true;
    App.Api.fetchLatestFundingRate = wrapped;
    return true;
  }

  /* ------------------------------------------------------------------
   * (d) 주문 잠금 상태 — 화면은 디자인팀이 만듭니다
   * ------------------------------------------------------------------ */
  function nameOf(sym) {
    if (!isSym(sym)) return null;
    if (App.SymbolRegistry && typeof App.SymbolRegistry.getBySymbol === "function") {
      try {
        var m = App.SymbolRegistry.getBySymbol(sym);
        if (m && m.name) return m.name;
      } catch (e) { /* noop */ }
    }
    return sym;
  }

  function getOrderLockState() {
    var pos = positionSymbol();
    var view = viewSymbol();
    var reason = "";
    if (App.SymbolGuard && typeof App.SymbolGuard.blockReason === "function") {
      try { reason = App.SymbolGuard.blockReason() || ""; } catch (e) { reason = ""; }
    }
    return {
      locked: !!pos,                 // 주문이 막혀 있는가 (한 번에 한 종목만)
      positionSymbol: pos,
      positionName: nameOf(pos),
      viewSymbol: view,
      viewName: nameOf(view),
      differs: !!(pos && pos !== view),
      reason: reason
    };
  }

  var lastLockKey = null;
  function broadcastLock() {
    var s = getOrderLockState();
    var key = String(s.locked) + "|" + String(s.positionSymbol) + "|" + String(s.viewSymbol);
    if (key === lastLockKey) return;
    lastLockKey = key;
    counts.lockBroadcasts++;
    try { App.Bus.emit("orderlock:change", s); } catch (e) { /* noop */ }
  }

  /* ------------------------------------------------------------------ */
  function wireBus() {
    if (wireBus.done) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("trading:update", broadcastLock);
    App.Bus.on("trading:persisted", broadcastLock);
    App.Bus.on("symbol:change", broadcastLock);
    wireBus.done = true;
    return true;
  }

  function tryAll() {
    var a = wrapBusOn();
    var b = wrapUrlBuilder();
    var c = wireBus();
    var d = wrapFundingRest();
    return a && b && c && d;
  }

  function init() {
    if (tryAll()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (tryAll() || ++tries > 200) clearInterval(t);
    }, 50);
  }

  /* App.Bus.on 감싸기는 구독자들이 등록하기 전에 끝나야 하므로 스크립트를
     읽는 즉시 실행합니다(등록은 DOMContentLoaded 이후 init 에서 일어납니다).
     ⚠ 이 <script> 는 반드시 js/symbol-guard.js 뒤여야 합니다 — 우리 감싸기가
        바깥이어야 엔진 핸들러를 손대지 않고 guard 에게 넘길 수 있습니다. */
  init();

  return {
    init: init,
    isOn: isOn,
    isSplit: isSplit,
    netIsWorking: netIsWorking,
    positionSymbol: positionSymbol,
    viewSymbol: viewSymbol,
    getOrderLockState: getOrderLockState,
    appendStreams: appendStreams,
    screenPasses: screenPasses,
    isEngineSide: isEngineSide,
    enginePositionSymbol: enginePositionSymbol,
    getCounts: function () {
      var o = {};
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) o[k] = counts[k];
      return o;
    },
    getSeen: function () {
      return {
        screen: JSON.parse(JSON.stringify(seen.screen)),
        engine: JSON.parse(JSON.stringify(seen.engine))
      };
    },
    _noteEngine: function (sym) { bump(seen.engine, sym); },
    _setOn: function (v) { on = !!v; },
    _reset: function () {
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] = 0;
      seen = { screen: {}, engine: {} };
      lastLockKey = null;
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.MultiSymbolView;
