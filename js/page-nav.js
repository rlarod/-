/* =========================================================================
 * js/page-nav.js — App.PageNav
 * =========================================================================
 * 상단 "거래소 / 전쟁터 / 게시판" 탭 전환만 담당하는 아주 작은 모듈입니다.
 * board.js/market-war.js 등 다른 어떤 모듈도 이 파일을 몰라도 됩니다 —
 * 그냥 페이지 wrapper들의 display를 토글할 뿐입니다.
 *
 * ── 전쟁터(MARKET WAR) 탭 전환 시 캔버스 리사이즈 필요 ─────────────────
 * 부팅 시점엔 "거래소" 탭이 기본이라 #page-battle이 display:none입니다.
 * market-war.js는 초기화 시 캔버스 크기를 getBoundingClientRect()로
 * 재는데, 부모가 숨겨진 동안엔 0x0이 나와서 캔버스가 찌그러진 채로
 * 시작합니다 — 그래서 전쟁터 탭을 처음 누르는 순간 App.MarketWar.resize()
 * 를 한 번 더 호출해서 실제 보이는 크기로 다시 잡아줍니다
 * (market-war.js 내부 로직은 전혀 안 건드리고, 이미 있던 resize 함수를
 * 외부에서 한 번 더 부르는 것뿐입니다).
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
    if (dom.rankingPage) dom.rankingPage.style.display = page === "ranking" ? "" : "none";
    if (dom.battlePage) dom.battlePage.style.display = page === "battle" ? "" : "none";
    if (dom.boardPage) dom.boardPage.style.display = page === "board" ? "" : "none";
    if (dom.mypagePage) dom.mypagePage.style.display = page === "mypage" ? "" : "none";
    if (dom.hotdealPage) dom.hotdealPage.style.display = page === "hotdeal" ? "" : "none";
    if (dom.exchangeBtn) dom.exchangeBtn.classList.toggle("active", page === "exchange");
    if (dom.rankingBtn) dom.rankingBtn.classList.toggle("active", page === "ranking");
    if (dom.battleBtn) dom.battleBtn.classList.toggle("active", page === "battle");
    if (dom.boardBtn) dom.boardBtn.classList.toggle("active", page === "board");
    if (dom.mypageBtn) dom.mypageBtn.classList.toggle("active", page === "mypage");
    if (dom.hotdealBtn) dom.hotdealBtn.classList.toggle("active", page === "hotdeal");

    // TL 핫딜은 열릴 때 서버에서 상품/잔액을 새로 받아옵니다(재고가 바뀌었을 수 있음).
    if (page === "hotdeal" && App.TLHotdeal && typeof App.TLHotdeal.refresh === "function") {
      App.TLHotdeal.refresh();
    }

    if (page === "battle" && App.MarketWar && typeof App.MarketWar.resize === "function") {
      // 방금 display:none이 풀린 직후라 레이아웃이 아직 안 정착됐을 수 있어서
      // 한 프레임 뒤에 재계산합니다(기존 부팅 시 60ms/300ms 지연 패턴과 동일한 이유).
      requestAnimationFrame(() => App.MarketWar.resize());
      setTimeout(() => App.MarketWar.resize(), 200);
    }
  }

  function init() {
    dom = {
      exchangePage: el("page-exchange"),
      rankingPage: el("page-ranking"),
      battlePage: el("page-battle"),
      boardPage: el("page-board"),
      mypagePage: el("page-mypage"),
      hotdealPage: el("page-hotdeal"),
      exchangeBtn: el("page-nav-exchange"),
      rankingBtn: el("page-nav-ranking"),
      battleBtn: el("page-nav-battle"),
      boardBtn: el("page-nav-board"),
      mypageBtn: el("page-nav-mypage"),
      hotdealBtn: el("page-nav-hotdeal"),
    };
    if (!dom.exchangePage) return; // 마크업 없으면 조용히 종료

    if (dom.exchangeBtn) dom.exchangeBtn.addEventListener("click", () => showPage("exchange"));
    if (dom.rankingBtn) dom.rankingBtn.addEventListener("click", () => showPage("ranking"));
    if (dom.battleBtn) dom.battleBtn.addEventListener("click", () => showPage("battle"));
    if (dom.boardBtn) dom.boardBtn.addEventListener("click", () => showPage("board"));
    if (dom.mypageBtn) dom.mypageBtn.addEventListener("click", () => showPage("mypage"));
    if (dom.hotdealBtn) dom.hotdealBtn.addEventListener("click", () => showPage("hotdeal"));

    // 준비중 메뉴 — 페이지 전환 없이 안내만(요구사항: 실제 기능 없는 메뉴는 UI만 만들고 "준비중" 처리)
    document.querySelectorAll(".nav-coming-soon").forEach((btn) => {
      btn.addEventListener("click", () => alert("준비 중인 메뉴입니다."));
    });
  }

  return { init, showPage };
})();
