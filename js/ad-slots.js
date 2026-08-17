/* =========================================================================
 * js/ad-slots.js — App.AdSlots
 * =========================================================================
 * 광고 슬롯(상단 가로 배너 / 좌측 세로 배너)의 클릭 처리만 담당합니다.
 *
 * 소재 교체는 index.html의 슬롯 안쪽만 바꾸면 됩니다.
 *   <div class="top-ad-slot" id="top-ad-slot"> ... 여기 ... </div>
 * 이미지로 바꾸려면:
 *   <a href="https://..." target="_blank" rel="noopener">
 *     <img src="assets/배너.png" alt="광고">
 *   </a>
 * 지금처럼 사이트 안쪽으로 보내려면 data-ad-link에 기존 메뉴 버튼 id를 씁니다.
 *
 * 이 모듈은 새 화면 전환 로직을 만들지 않습니다 — 기존 메뉴 버튼을 대신
 * 눌러줄 뿐이라 page-nav.js / auth.js 등은 전혀 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.AdSlots = (function () {
  "use strict";

  function init() {
    document.querySelectorAll("[data-ad-link]").forEach((el) => {
      el.style.cursor = "pointer";
      el.setAttribute("role", "link");
      el.addEventListener("click", () => {
        const target = document.getElementById(el.dataset.adLink);
        if (target) target.click(); // 기존 메뉴 버튼을 그대로 사용
      });
    });
  }

  return { init };
})();
