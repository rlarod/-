/* =========================================================================
 * js/price-guard.js — App.PriceGuard
 * =========================================================================
 * 이상한 시세가 거래 계산으로 들어가는 것을 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * price:update 이벤트의 값이 그대로 trading.js 로 들어갑니다.
 * 검사가 없어서 잘못된 값이 오면 그대로 반영됩니다.
 *
 *   NaN 이 들어오면
 *     미실현손익 NaN, 평가자산 NaN -> 화면 숫자가 전부 깨집니다.
 *   음수가 들어오면
 *     청산가 아래로 판정되어 포지션이 강제청산됩니다.
 *     실제로 잃지 않은 돈이 사라집니다.
 *
 * 거래소 연결이 끊기거나 서버가 순간 이상한 값을 보낼 때 실제로
 * 일어날 수 있습니다. 모의투자라도 사용자 성적이 망가집니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * App.Bus.emit 을 감싸 price:update 가 지나갈 때 값을 검사합니다.
 *   · 숫자가 아니거나(NaN/null/문자) 0 이하 -> 버립니다
 *   · 직전 정상가 대비 너무 크게 튀면 -> 버립니다(오류값일 가능성)
 * 버릴 때는 콘솔에 남겨 원인을 추적할 수 있게 합니다.
 *
 * js/trading.js, js/websocket.js 는 건드리지 않습니다.
 * 정상 시세는 아무 영향 없이 그대로 지나갑니다.
 * ========================================================================= */

window.App = window.App || {};

App.PriceGuard = (function () {
  "use strict";

  /* 직전 정상가 대비 몇 배까지 허용할지.
     비트코인이 1초 만에 5배 뛰거나 1/5로 떨어지는 일은 없습니다.
     거래소 오류값이나 다른 종목 값이 섞여 들어온 것으로 봅니다. */
  var MAX_JUMP = 5;

  var lastGood = {};   // 종목별 마지막 정상가
  var dropped = 0;

  function isSane(symbol, price) {
    var n = Number(price);
    if (!isFinite(n) || n <= 0) return false;

    var prev = lastGood[symbol];
    if (prev && (n > prev * MAX_JUMP || n < prev / MAX_JUMP)) return false;

    return true;
  }

  function check(payload) {
    if (!payload || typeof payload !== "object") return false;
    var symbol = payload.symbol || "?";
    if (!isSane(symbol, payload.price)) {
      dropped++;
      if (dropped <= 20) {
        console.warn(
          "[price-guard.js] 이상한 시세를 버렸습니다:",
          symbol,
          payload.price,
          "(직전 정상가 " + (lastGood[symbol] || "없음") + ")"
        );
      }
      return false;
    }
    lastGood[symbol] = Number(payload.price);
    return true;
  }

  function wrap() {
    if (!App.Bus || typeof App.Bus.emit !== "function") return false;
    if (App.Bus.__priceGuarded) return true;
    var orig = App.Bus.emit;
    App.Bus.emit = function (name, payload) {
      if (name === "price:update" && !check(payload)) {
        return undefined; // 이상한 값은 아무에게도 전달하지 않습니다
      }
      return orig.apply(App.Bus, arguments);
    };
    App.Bus.__priceGuarded = true;
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
    isSane: isSane,
    check: check,
    getDroppedCount: function () { return dropped; },
    getLastGood: function (symbol) { return lastGood[symbol]; },
    _reset: function () { lastGood = {}; dropped = 0; },
    MAX_JUMP: MAX_JUMP,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.PriceGuard;
