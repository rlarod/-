/* =========================================================================
 * js/orderbook-tabs.js — App.OrderbookTabs
 * =========================================================================
 * "호가창 / 최근거래" 탭 전환. orderbook.js/trades.js는 전혀 안 건드립니다 —
 * trades.js가 #orderbook-panel 바로 다음 형제로 #recent-trades-panel을
 * 스스로 만들어 넣는 기존 로직 그대로 두고, 이 모듈은 둘 중 하나만
 * 보이게 display만 토글합니다. 클릭 시점에 다시 조회하는 이유는
 * #recent-trades-panel이 trades.js에 의해 "나중에" 동적으로 생기기
 * 때문입니다(부팅 시점에 미리 캐싱하면 못 찾을 수 있음).
 * ========================================================================= */

window.App = window.App || {};

App.OrderbookTabs = (function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function showTab(tabName) {
    const orderbookPanel = el("orderbook-panel");
    const tradesPanel = el("recent-trades-panel");
    if (orderbookPanel) orderbookPanel.style.display = tabName === "orderbook" ? "" : "none";
    if (tradesPanel) tradesPanel.style.display = tabName === "trades" ? "" : "none";

    const tabsContainer = el("orderbook-tabs");
    if (tabsContainer) {
      tabsContainer.querySelectorAll(".ob-tab-btn").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.tab === tabName);
      });
    }
  }

  function init() {
    const tabsContainer = el("orderbook-tabs");
    if (!tabsContainer) return; // 마크업 없으면 조용히 종료

    tabsContainer.querySelectorAll(".ob-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => showTab(btn.dataset.tab));
    });

    showTab("orderbook"); // 초기 상태: 호가창 표시, 최근거래 숨김
  }

  return { init };
})();
