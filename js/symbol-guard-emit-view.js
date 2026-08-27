/* =========================================================================
 * js/symbol-guard-emit-view.js — App.SymbolGuardEmitView
 * =========================================================================
 * 한 줄 요약 — 방송(App.Bus.emit) 이 도는 동안에는 종목 바꿔치기를 잠깐
 *              풀어서, 듣는 쪽이 "보고 있는 종목" 을 그대로 보게 합니다.
 *
 * ── 무엇이 새고 있었나 (2026-08-28, 조사팀 실측) ────────────────────
 *   js/symbol-guard.js:508 callWithPositionSymbol() 은 거래엔진 핸들러가
 *   도는 동안만 App.Config.getActiveSymbol() 을 "포지션 종목" 으로
 *   바꿔치기하고 finally 로 되돌립니다. 여기까지는 맞습니다.
 *
 *   그런데 그 핸들러 안에서 js/trading.js:93 이 방송을 합니다.
 *       App.Bus.emit("trading:update", getSnapshot());
 *   App.Bus.emit 은 구독자를 그 자리에서 동기로 전부 부릅니다. 그래서
 *   구독자 20여 곳이 전부 바꿔치기된 값을 읽습니다.
 *
 *   실측(헤드리스 80틱) — 구독자가 본 종목 80/80 이 "BTCUSDT"(포지션 종목).
 *   실제로 보고 있던 종목은 ETHUSDT 였습니다.
 *   그 결과 js/order-lock-notice.js 의 update() 가 "포지션 종목 == 보는 종목"
 *   으로 판정해 주문 잠금 덮개를 숨깁니다 — 표시 0회 / 숨김 80회.
 *   회원에게는 "주문은 비트코인에서만 할 수 있습니다" 안내가 사라진 채
 *   다른 종목 주문 패널이 열려 보입니다(눌러도 엔진이 거절합니다. P2).
 *
 * ── ⛔ 바꿔치기 자체를 없애면 안 됩니다 ──────────────────────────────
 *   js/symbol-guard.js:465-475 에 P1 으로 적혀 있습니다. 없애면 포지션 종목
 *   시세를 엔진이 스스로 버려서 강제청산·TP·SL·지정가·펀딩이 조용히 멈춥니다.
 *   그래서 바꿔치기는 그대로 두고, "방송이 도는 동안만" 풀어 줍니다.
 *
 * ── 왜 구독자를 하나씩 안 고치나 ────────────────────────────────────
 *   trading:update 구독자는 지금 20곳입니다. 그중 getActiveSymbol 을 읽는
 *   곳을 골라 고치면, 나중에 구독자가 하나 늘 때 또 샙니다. 새는 곳은
 *   구독자가 아니라 "방송 구간" 이라 방송 구간 한 곳에서 막습니다.
 *
 * ── 엔진에 영향이 없는 근거 ─────────────────────────────────────────
 *   js/trading.js 가 getActiveSymbol 을 읽는 곳은 세 군데뿐입니다.
 *       :89  onPriceUpdate   — emit(:93) 보다 앞
 *       :368 onFundingUpdate — settleFunding(:370) 보다 앞
 *       :381 checkMissedFunding — 바꿔치기 구간 밖(부팅 때 한 번)
 *   전부 방송보다 앞에서 읽습니다. 방송 중에만 푸는 이 파일은 엔진이
 *   읽는 값을 한 번도 바꾸지 않습니다.
 *
 * ── 어떻게 원본 함수를 찾나 ─────────────────────────────────────────
 *   바꿔치기된 함수에는 js/symbol-guard.js 가 __symbolGuardStub 표식을
 *   달아 둡니다. 표식이 없는 값을 볼 때마다 그것을 "진짜" 로 적어 둡니다.
 *   방송은 바꿔치기 밖에서도 수없이 도니까(price:update 등) 항상 최신입니다.
 *   적어 둔 것이 없으면 아무것도 하지 않습니다 — 추측하지 않습니다.
 *
 * ── 하지 않는 일 ────────────────────────────────────────────────────
 *   · 수정 금지 12개 파일을 건드리지 않습니다
 *   · js/symbol-guard.js 를 건드리지 않습니다 (표식만 읽습니다)
 *   · 손익·청산·랭킹 계산에 손대지 않습니다
 *   · 방송 내용(payload)을 바꾸거나 막지 않습니다. 순서도 그대로입니다
 *
 * ── 되돌리는 법 ────────────────────────────────────────────────────
 *   index.html 의 <script src="js/symbol-guard-emit-view.js"> 한 줄을
 *   지우면 됩니다. 다른 파일에 흔적이 없습니다.
 * ========================================================================= */
window.App = window.App || {};

App.SymbolGuardEmitView = (function () {
  "use strict";

  var STUB_MARK = "__symbolGuardStub";

  var realFn = null;     // 표식 없는(진짜) getActiveSymbol — 마지막으로 본 것
  var wrapped = false;
  var timer = null;

  /* 실측용 계수기 */
  var stats = {
    restored: 0,   // 방송 동안 실제로 풀어 준 횟수
    skipped: 0,    // 바꿔치기가 없어서 그냥 지나간 횟수
    noReal: 0,     // 바꿔치기는 있는데 진짜를 몰라 못 푼 횟수
    stolen: 0      // 방송 도중 누가 값을 또 바꿔서 되돌리지 않은 횟수
  };

  function current() {
    if (!App.Config) return null;
    var f = App.Config.getActiveSymbol;
    return typeof f === "function" ? f : null;
  }

  function isStub(f) {
    return !!(f && f[STUB_MARK]);
  }

  /* ------------------------------------------------------------------
   * App.Bus.emit 감싸기
   * ------------------------------------------------------------------ */
  function wrapEmit() {
    if (wrapped) return true;
    if (!App.Bus || typeof App.Bus.emit !== "function") return false;
    if (App.Bus.__symbolGuardEmitView) { wrapped = true; return true; }

    /* js/symbol-guard.js 의 emit 감싸기보다 바깥에 있어야 합니다.
       안쪽이면 그쪽 symbol:change 판정도 바꿔치기된 값을 읽습니다. */
    if (!App.Bus.__symbolGuardedEmit) return false;

    var orig = App.Bus.emit;

    App.Bus.emit = function () {
      var now = current();

      if (!isStub(now)) {
        /* 바꿔치기 밖입니다 — 이 값이 "진짜" 입니다. 적어 두고 그냥 넘깁니다. */
        if (now) realFn = now;
        stats.skipped++;
        return orig.apply(App.Bus, arguments);
      }

      if (!realFn) {
        /* 진짜를 한 번도 못 봤습니다. 지어내지 않고 그대로 둡니다. */
        stats.noReal++;
        return orig.apply(App.Bus, arguments);
      }

      var stub = now;
      var real = realFn;
      try {
        App.Config.getActiveSymbol = real;
      } catch (e) {
        stats.noReal++;
        return orig.apply(App.Bus, arguments);
      }
      stats.restored++;

      try {
        return orig.apply(App.Bus, arguments);
      } finally {
        /* 방송 도중에 누가 값을 또 갈아끼웠다면 그쪽을 존중합니다.
           그대로면 바꿔치기를 도로 씌워, js/symbol-guard.js 의 finally 가
           예상한 상태(자기 stub 이 올라가 있는 상태)를 그대로 만납니다. */
        try {
          if (App.Config.getActiveSymbol === real) App.Config.getActiveSymbol = stub;
          else stats.stolen++;
        } catch (e2) { /* noop */ }
      }
    };

    App.Bus.__symbolGuardEmitView = true;
    wrapped = true;
    return true;
  }

  /* ------------------------------------------------------------------ */
  function init() {
    if (wrapEmit()) return;
    var tries = 0;
    if (timer) clearInterval(timer);
    timer = setInterval(function () {
      if (wrapEmit() || ++tries > 200) { clearInterval(timer); timer = null; }
    }, 50);
  }

  return {
    init: init,
    isWrapped: function () { return wrapped; },
    getStats: function () { return { restored: stats.restored, skipped: stats.skipped, noReal: stats.noReal, stolen: stats.stolen }; }
  };
})();

/* 스스로 켭니다 — js/main.js 를 건드리지 않기 위해서입니다.
   init() 은 여러 번 불려도 안전합니다(이미 감쌌으면 바로 돌아갑니다). */
if (typeof document !== "undefined") {
  App.SymbolGuardEmitView.init();
}

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolGuardEmitView;
