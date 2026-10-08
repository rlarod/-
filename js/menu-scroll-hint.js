/* =========================================================================
 * js/menu-scroll-hint.js — App.MenuScrollHint
 * =========================================================================
 * 좁은 화면에서 메뉴가 한 줄에 안 들어갈 때 "옆으로 더 있다"는 신호를 줍니다.
 *
 * 메뉴는 원래 가로로 밀 수 있게 되어 있는데(.top-banner-nav 의 overflow-x),
 * 스크롤바를 숨겨둬서 밀 수 있다는 걸 알 방법이 없었습니다.
 * 실측: 390px 화면에서 메뉴는 470px 필요 — 마이페이지와 TL 마켓이
 * 화면 밖에 있어 접근 자체가 안 되는 것처럼 보였습니다.
 *
 * 메뉴를 지우거나 줄이지 않습니다. 끝까지 밀지 않았을 때만
 * 오른쪽에 옅은 그림자를 띄워 신호만 줍니다.
 * ========================================================================= */

window.App = window.App || {};

App.MenuScrollHint = (function () {
  "use strict";

  function update() {
    var nav = document.querySelector(".top-banner-nav");
    /* ★2026-10-08 — ".menu-bar-inner" 를 글자로 박아 두던 것을 고쳤습니다★
       그날 index.html 에서 <nav> 를 헤더(.top-banner-inner) 안으로 옮겼습니다.
       그대로 두면 ★nav 가 그 상자 안에 없는데도 힌트 클래스만 빈 상자에 붙어★
       오류도 없이 힌트가 사라집니다(조용한 고장). nav 의 실제 부모를 씁니다.
       되돌리기: 아래 한 줄을 document.querySelector(".menu-bar-inner") 로. */
    var box = nav.parentElement || document.querySelector(".menu-bar-inner");
    if (!nav || !box) return;
    /* 남은 스크롤이 2px 넘게 있으면 더 볼 게 있다는 뜻입니다. */
    var more = nav.scrollWidth - nav.clientWidth - nav.scrollLeft > 2;
    box.classList.toggle("has-more", more);
  }

  function init() {
    var nav = document.querySelector(".top-banner-nav");
    if (!nav) return;
    update();
    nav.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    /* 메뉴가 나중에 바뀌어도 따라갑니다(준비중 메뉴 노출 등). */
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(update).observe(nav, { childList: true, subtree: true });
    }
    setTimeout(update, 1000);
    setTimeout(update, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, update: update };
})();
