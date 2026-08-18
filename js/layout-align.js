/* =========================================================================
 * js/layout-align.js — App.LayoutAlign
 * =========================================================================
 * 오른쪽 채팅 패널의 아랫변을 왼쪽 거래 행(차트/호가창/주문창)의 아랫변에
 * 맞춥니다.
 *
 * 왜 CSS만으로 안 되나:
 *   채팅은 화면 높이(100vh) 기준으로 늘어나고, 거래 행은 콘텐츠 폭과
 *   주문창 길이로 정해집니다. 서로 기준이 달라 화면 높이에 따라 아랫변이
 *   최대 357px까지 어긋났습니다(실측). 한쪽을 다른 쪽에 맞추려면 실제
 *   높이를 재서 넣는 수밖에 없습니다.
 *
 * 세로 길이만 조정합니다 — 색·글자·데이터는 건드리지 않습니다.
 * 좌우 2단이 풀리는 좁은 화면에서는 세로로 쌓이므로 아무것도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.LayoutAlign = (function () {
  "use strict";

  const MIN_WIDTH = 1800; // 좌우 2단이 적용되는 폭(style.css와 동일 기준)
  let col = null;
  let grid = null;
  let chat = null;

  // 채팅 아랫변을 맞출 기준 요소를 찾습니다.
  // 거래 화면이면 거래 행, 다른 페이지(커뮤니티/랭킹 등)면 그 페이지의 본문.
  function anchorBottom() {
    if (grid && grid.offsetParent) return grid.getBoundingClientRect().bottom;
    // 거래 화면이 아니면 현재 보이는 페이지를 찾습니다(인라인 style로 전환됨).
    const app = document.querySelector(".page-left .app");
    if (!app) return null;
    const pages = app.children;
    for (let i = 0; i < pages.length; i++) {
      if (pages[i].offsetParent) return pages[i].getBoundingClientRect().bottom;
    }
    return null;
  }

  function apply() {
    if (!col || !chat) return;

    // 2단이 아니면 CSS 기본값으로 되돌립니다.
    if (window.innerWidth < MIN_WIDTH || !chat.offsetParent) {
      col.style.height = "";
      col.style.maxHeight = "";
      return;
    }

    const bottom = anchorBottom();
    if (bottom === null) return;
    const chatTop = chat.getBoundingClientRect().top;
    const h = Math.round(bottom - chatTop);
    // 너무 짧으면 채팅이 찌그러지므로 최소 높이를 둡니다.
    // (파란 헤더 134px + 메시지 영역 + 입력줄이 들어갈 최소치)
    const MIN_H = 260;
    if (h < MIN_H) {
      col.style.height = MIN_H + "px";
      col.style.maxHeight = MIN_H + "px";
      return;
    }

    col.style.height = h + "px";
    col.style.maxHeight = h + "px";
  }

  function init() {
    col = document.querySelector(".page-right .page-chat-col");
    grid = document.querySelector(".main-grid");
    chat = document.querySelector(".page-right .page-chat-panel");
    if (!col || !chat) return;

    apply();
    window.addEventListener("resize", apply);
    // 주문창 길이가 바뀌면 거래 행 높이도 바뀌므로 다시 맞춥니다.
    if (window.ResizeObserver) {
      if (grid) new ResizeObserver(apply).observe(grid);
      // 페이지를 바꾸면(커뮤니티/랭킹 등) 기준 요소가 달라지므로 함께 관찰합니다.
      const appEl = document.querySelector(".page-left .app");
      if (appEl) new ResizeObserver(apply).observe(appEl);
    }
    // 메뉴로 페이지를 옮길 때도 다시 맞춥니다.
    document.querySelectorAll(".top-banner-nav-btn").forEach((b) => {
      b.addEventListener("click", () => setTimeout(apply, 0));
    });
    if (App.Bus) App.Bus.on("trading:persisted", apply);
  }

  return { init, applyForTest: apply };
})();
