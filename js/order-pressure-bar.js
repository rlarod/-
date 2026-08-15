/* =========================================================================
 * js/order-pressure-bar.js — App.OrderPressureBar
 * =========================================================================
 * 주문창 하단의 매수/매도 비율 바. 계산을 새로 만들지 않고,
 * App.MarketWar.getBuySellRatio()(이미 실시간 체결로 계속 갱신되고
 * 있는 값)를 그대로 읽어서 표시만 합니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderPressureBar = (function () {
  "use strict";

  const REFRESH_INTERVAL_MS = 1000;
  let dom = {};
  let timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function render() {
    if (!App.MarketWar || typeof App.MarketWar.getBuySellRatio !== "function") return;
    const { buyPct, sellPct } = App.MarketWar.getBuySellRatio();
    if (dom.buyBar) dom.buyBar.style.width = buyPct + "%";
    if (dom.sellBar) dom.sellBar.style.width = sellPct + "%";
    if (dom.buyPctText) dom.buyPctText.textContent = "매수 " + buyPct + "%";
    if (dom.sellPctText) dom.sellPctText.textContent = "매도 " + sellPct + "%";
  }

  function init() {
    dom = {
      buyBar: el("order-pressure-buy"),
      sellBar: el("order-pressure-sell"),
      buyPctText: el("order-pressure-buy-text"),
      sellPctText: el("order-pressure-sell-text"),
    };
    if (!dom.buyBar) return; // 마크업 없으면 조용히 종료

    render();
    timer = setInterval(render, REFRESH_INTERVAL_MS);
  }

  return { init };
})();
