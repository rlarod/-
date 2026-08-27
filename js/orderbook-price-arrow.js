/* =========================================================================
 * js/orderbook-price-arrow.js — App.OrderbookPriceArrow
 * =========================================================================
 * 현재가 옆 상승/하락 화살표(↑/↓). orderbook.js는 전혀 안 건드립니다 —
 * orderbook.js가 이미 구독하는 것과 같은 'price:update' 이벤트를
 * 이 모듈도 독립적으로 구독해서, 직전 가격과 비교해 방향만 계산합니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderbookPriceArrow = (function () {
  "use strict";

  let dom = {};
  let lastPrice = null;

  function el(id) {
    return document.getElementById(id);
  }

  function onPriceUpdate(payload) {
    if (!dom.arrow) return;
    /* 종목 확인 (2026-08-27, 종목 전환 4번 관문)
       이걸 안 보면 다른 종목 시세와 비교해서 화살표 방향이 틀립니다.
       js/orderbook.js 의 현재가 표시와 같은 판정입니다. */
    if (
      payload &&
      typeof payload.symbol === "string" &&
      App.Config &&
      typeof App.Config.getActiveSymbol === "function" &&
      payload.symbol !== App.Config.getActiveSymbol()
    ) {
      return;
    }
    const price = payload.price;
    if (lastPrice !== null) {
      if (price > lastPrice) {
        dom.arrow.textContent = "▲";
        dom.arrow.className = "ob-price-arrow ob-price-arrow-up";
      } else if (price < lastPrice) {
        dom.arrow.textContent = "▼";
        dom.arrow.className = "ob-price-arrow ob-price-arrow-down";
      }
      // 가격이 동일하면 직전 화살표/색을 그대로 유지(깜빡임 방지)
    }
    lastPrice = price;
  }

  function init() {
    dom = { arrow: el("ob-price-arrow") };
    if (!dom.arrow) return; // 마크업 없으면 조용히 종료
    App.Bus.on("price:update", onPriceUpdate);
    /* 종목이 바뀌면 비교 기준을 버립니다 — 옛 종목 가격과 비교하면 안 됩니다. */
    App.Bus.on("symbol:change", () => {
      lastPrice = null;
      dom.arrow.textContent = "";
      dom.arrow.className = "ob-price-arrow";
    });
  }

  return { init };
})();
