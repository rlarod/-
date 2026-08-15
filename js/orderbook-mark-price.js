/* =========================================================================
 * js/orderbook-mark-price.js — App.OrderbookMarkPrice
 * =========================================================================
 * 호가창 현재가 아래 두 번째 줄(마크가격). chart.js는 전혀 안 건드립니다 —
 * chart.js가 이미 구독하는 'funding:update' 이벤트를 이 모듈도 독립적으로
 * 구독해서 payload.markPrice(실제 Binance 마크가격)를 그대로 표시만 합니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderbookMarkPrice = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function onFundingUpdate(payload) {
    if (!dom.markPrice) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (typeof payload.markPrice === "number" && App.Utils) {
      dom.markPrice.textContent = App.Utils.formatCurrencyPlain(payload.markPrice);
    }
  }

  function init() {
    dom = { markPrice: el("ob-mark-price") };
    if (!dom.markPrice) return; // 마크업 없으면 조용히 종료
    App.Bus.on("funding:update", onFundingUpdate);
  }

  return { init };
})();
