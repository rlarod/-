/* =========================================================================
 * js/orderbook-tabs.js — App.OrderbookTabs
 * =========================================================================
 * "호가창 / 최근거래" 표시. orderbook.js/trades.js는 전혀 안 건드립니다 —
 * trades.js가 #orderbook-panel 바로 다음 형제로 #recent-trades-panel을
 * 스스로 만들어 넣는 기존 로직 그대로 두고, 이 모듈은 display만 다룹니다.
 *
 * 2026-08 변경: 호가창이 5호가 고정(orderbook.js의 DEPTH_LEVELS=5, 수정 금지)
 * 이라 가운데 칼럼 아래쪽에 큰 빈 공간이 생겼습니다. 바이낸스처럼
 * "호가창 위 / 최근거래 아래"로 둘 다 동시에 띄워서 그 공간을 실제
 * 데이터로 채웁니다(가짜 호가를 만들어 늘리지 않음).
 *
 * 탭 버튼은 삭제하지 않고 그대로 둡니다 — 좁은 화면(둘 다 넣기엔 세로가
 * 모자란 경우)에서는 예전처럼 탭 전환 모드로 되돌아갑니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderbookTabs = (function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  // 둘 다 세로로 띄울 만큼 공간이 있는지 — 3열 레이아웃이 유지되는 폭에서만
  const STACK_MIN_WIDTH = 1301; // style.css의 3열 유지 최소 폭과 같은 기준
  const STACK_MIN_HEIGHT = 760; // 호가창 + 최근거래가 둘 다 들어갈 최소 세로

  function canStack() {
    return window.innerWidth >= STACK_MIN_WIDTH && window.innerHeight >= STACK_MIN_HEIGHT;
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

  // 바이낸스식: 호가창 위 / 최근거래 아래로 둘 다 표시
  function showStacked() {
    const orderbookPanel = el("orderbook-panel");
    const tradesPanel = el("recent-trades-panel");
    if (orderbookPanel) orderbookPanel.style.display = "";
    if (tradesPanel) tradesPanel.style.display = "";
    const content = el("orderbook-tabs-content");
    if (content) content.classList.add("ob-stacked");
    const tabsContainer = el("orderbook-tabs");
    if (tabsContainer) tabsContainer.classList.add("ob-tabs-stacked");
  }

  function apply() {
    const content = el("orderbook-tabs-content");
    if (canStack()) {
      showStacked();
      return;
    }
    if (content) content.classList.remove("ob-stacked");
    const tabsContainer = el("orderbook-tabs");
    if (tabsContainer) tabsContainer.classList.remove("ob-tabs-stacked");
    const active = document.querySelector(".ob-tab-btn.active");
    showTab(active ? active.dataset.tab : "orderbook");
  }

  function init() {
    const tabsContainer = el("orderbook-tabs");
    if (!tabsContainer) return; // 마크업 없으면 조용히 종료

    tabsContainer.querySelectorAll(".ob-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (canStack()) return; // 둘 다 보이는 상태에서는 탭이 의미 없음
        showTab(btn.dataset.tab);
      });
    });

    apply();
    // trades.js가 #recent-trades-panel을 나중에 만들기 때문에 한 번 더 적용
    setTimeout(apply, 800);
    window.addEventListener("resize", apply);
  }

  return { init };
})();
