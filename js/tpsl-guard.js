/* =========================================================================
 * js/tpsl-guard.js — App.TpSlGuard
 * =========================================================================
 * 말이 안 되는 TP/SL 값이 주문으로 들어가는 것을 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * js/trading.js 의 TP/SL 검증은 대부분 잘 되어 있습니다.
 *   진입가보다 불리한 TP/SL -> null 로 무시
 *   청산가보다 더 불리한 SL -> 청산가 바로 위/아래로 당김
 *     (그대로 두면 청산이 먼저 발동해 '죽은 SL' 이 되기 때문)
 *
 * 그런데 음수가 들어오면 마지막 규칙에 잘못 걸립니다.
 *
 *   실측 (롱 · 진입 60,000 · 10배 · 청산가 54,300)
 *     SL 에 -100 을 넣음
 *     -> '너무 낮은 SL' 로 보고 54,305.43 으로 끌어올림
 *     -> 사용자는 SL 을 안 걸었다고 생각하는데 실제로는 걸려 있음
 *     -> 가격이 54,305 아래로 가면 손절됩니다.
 *
 * 오타나 잘못 붙여넣기로 충분히 생길 수 있습니다.
 * 원치 않는 손절은 사용자 성적에 직접 영향을 줍니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * openPosition / placeLimitOrder 를 감싸, 값이 유한한 양수가 아니면
 * 아예 null 로 바꿔 넘깁니다(= TP/SL 을 걸지 않음).
 * 정상 범위의 값은 그대로 통과시켜, trading.js 의 기존 검증이
 * 이어서 판단합니다.
 *
 * js/trading.js 는 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.TpSlGuard = (function () {
  "use strict";

  var dropped = 0;

  /* 값이 '가격'으로 말이 되는가 — 유한한 양수만 통과 */
  function sanePrice(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return n;
  }

  /* TP/SL 한 쌍을 정리합니다. 버린 값은 세어둡니다. */
  function clean(tp, sl, label) {
    var t = sanePrice(tp);
    var s = sanePrice(sl);
    if (tp !== null && tp !== undefined && tp !== "" && t === null) {
      dropped++;
      console.warn("[tpsl-guard.js] 잘못된 " + (label || "") + " TP 값을 무시했습니다:", tp);
    }
    if (sl !== null && sl !== undefined && sl !== "" && s === null) {
      dropped++;
      console.warn("[tpsl-guard.js] 잘못된 " + (label || "") + " SL 값을 무시했습니다:", sl);
    }
    return [t, s];
  }

  function wrap() {
    if (!App.Trading || typeof App.Trading.openPosition !== "function") return false;
    if (App.Trading.__tpslGuarded) return true;

    /* openPosition(side, margin, tp, sl) */
    var origOpen = App.Trading.openPosition;
    App.Trading.openPosition = function (side, margin, tp, sl) {
      var c = clean(tp, sl, "시장가");
      return origOpen.call(App.Trading, side, margin, c[0], c[1]);
    };

    /* placeLimitOrder(side, price, margin, tp, sl) */
    if (typeof App.Trading.placeLimitOrder === "function") {
      var origLimit = App.Trading.placeLimitOrder;
      App.Trading.placeLimitOrder = function (side, price, margin, tp, sl) {
        var c = clean(tp, sl, "지정가");
        return origLimit.call(App.Trading, side, price, margin, c[0], c[1]);
      };
    }

    App.Trading.__tpslGuarded = true;
    return true;
  }

  function init() {
    if (wrap()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (wrap() || ++tries > 100) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    sanePrice: sanePrice,
    clean: clean,
    getDroppedCount: function () { return dropped; },
    _reset: function () { dropped = 0; },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.TpSlGuard;
