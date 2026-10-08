/* =========================================================================
 * js/notice-compact.js — App.NoticeCompact  (TL-024 · 2026-10-08 대표 지시)
 * -------------------------------------------------------------------------
 * 공지/커뮤니티 박스를 ★한 줄 띠★ 로 접고, 눌러서 펼칩니다.
 * 실제 모양은 전부 css/notice-compact.css 가 그립니다.
 * 이 파일이 하는 일은 단 두 가지입니다.
 *   1) 펼치기/접기 버튼 하나를 .notice-board-wrap 끝에 붙인다
 *   2) <html> 에 data-ncompact 를 켜고 data-nopen="1" 을 켜고 끈다
 *
 * ⛔ 공지 글·개수·순서·데이터를 ★한 글자도★ 건드리지 않습니다.
 *    .notice-box 의 개수도 그대로 2개입니다(버튼은 .notice-box 가 아닙니다).
 *    js/notice-board.js · js/board.js 는 한 줄도 수정하지 않았습니다.
 *
 * 디자인팀 시안(/tmp/tl-notice-mock/js/notice-compact-mock.js)의 [가] 안을
 * 옮긴 것입니다. 시안은 ?nmock=ga 로 켰지만 여기서는 항상 켜져 있습니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * index.html 의 이 파일 <script> 한 줄만 지우면 버튼도 사라지고
 * data-ncompact 도 안 붙어 CSS 가 전부 꺼집니다(= 예전 232px 박스).
 * ========================================================================= */

window.App = window.App || {};

App.NoticeCompact = (function () {
  "use strict";

  var html = document.documentElement;
  var open = false;          /* 열 때마다 접힌 상태로 시작합니다 */
  var btn = null;
  var booted = false;

  function chevron() {
    return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"' +
           ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
           '<path d="M3.5 6 8 10.5 12.5 6"/></svg>';
  }

  function paint() {
    if (open) html.setAttribute("data-nopen", "1");
    else html.removeAttribute("data-nopen");
    if (!btn) return;
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    btn.setAttribute("aria-label", open ? "공지 접기" : "공지 펼치기");
    var list = document.getElementById("notice-list-notice");
    var n = list ? list.children.length : 0;
    btn.querySelector(".nfb-count").textContent =
      open ? "접기" : (n > 1 ? "+" + (n - 1) : "");
  }

  function init() {
    if (booted) return;
    var wrap = document.querySelector(".notice-board-wrap");
    if (!wrap) return;          /* 거래 화면이 아니면 아무것도 안 합니다 */
    booted = true;

    html.setAttribute("data-ncompact", "1");

    btn = document.createElement("button");
    btn.type = "button";
    btn.className = "notice-fold-btn";
    btn.innerHTML =
      '<span class="nfb-label">공지</span>' +
      '<span class="nfb-peek"></span>' +
      '<span class="nfb-count"></span>' +
      chevron();
    wrap.appendChild(btn);

    btn.addEventListener("click", function () {
      open = !open;
      paint();
    });

    paint();

    /* 공지가 서버에서 늦게 오면 건수만 다시 씁니다(글은 안 건드립니다) */
    var list = document.getElementById("notice-list-notice");
    if (list && window.MutationObserver) {
      new MutationObserver(paint).observe(list, { childList: true });
    }
  }

  return { init: init };
})();
