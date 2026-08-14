/* =========================================================================
 * js/page-nav.js — App.PageNav
 * =========================================================================
 * 상단 "거래소 / 게시판" 탭 전환만 담당하는 아주 작은 모듈입니다.
 * board.js/trading.js 등 다른 어떤 모듈도 이 파일을 몰라도 됩니다 —
 * 그냥 #page-exchange와 #page-board의 display를 토글할 뿐입니다.
 * board.js는 부팅 시 이미 DOM에 다 그려져 있어서(숨겨져 있을 뿐),
 * 탭을 처음 눌러도 다시 초기화할 필요가 없습니다.
 * ========================================================================= */

window.App = window.App || {};

App.PageNav = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function showPage(page) {
    if (dom.exchangePage) dom.exchangePage.style.display = page === "exchange" ? "" : "none";
    if (dom.boardPage) dom.boardPage.style.display = page === "board" ? "" : "none";
    if (dom.exchangeBtn) dom.exchangeBtn.classList.toggle("active", page === "exchange");
    if (dom.boardBtn) dom.boardBtn.classList.toggle("active", page === "board");
  }

  function init() {
    dom = {
      exchangePage: el("page-exchange"),
      boardPage: el("page-board"),
      exchangeBtn: el("page-nav-exchange"),
      boardBtn: el("page-nav-board"),
    };
    if (!dom.exchangePage || !dom.boardPage) return; // 마크업 없으면 조용히 종료

    if (dom.exchangeBtn) dom.exchangeBtn.addEventListener("click", () => showPage("exchange"));
    if (dom.boardBtn) dom.boardBtn.addEventListener("click", () => showPage("board"));
  }

  return { init };
})();
