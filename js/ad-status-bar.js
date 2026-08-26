/* =========================================================================
 * js/ad-status-bar.js — App.AdStatusBar   (C안 시안, 2026-08-26 디자인팀)
 * =========================================================================
 * 무엇을 하나 —
 *   상단 광고 배너 자리에 "광고" 대신 "지금 리그 상태"를 한 줄로 보여줍니다.
 *   근거(실측) — 토스증권은 헤더 바로 아래 240px 를 광고가 아니라
 *   코스피/환율/나스닥 같은 '현재 상태 카드'로 씁니다. 바이낸스 홈도
 *   첫 화면 제일 큰 글자가 광고 문구가 아니라 누적 이용자 수(숫자)입니다.
 *
 * 어디서 값을 가져오나 — 이미 화면에 그려져 있는 랭킹 표(#leaderboard-body)
 *   에서만 읽습니다. 새로 서버를 부르지 않고, 계산도 하지 않습니다.
 *     참가 인원 = 표의 줄 수
 *     1위       = 첫 줄의 닉네임 / 수익률 칸
 *   값이 없으면 숫자를 만들어 넣지 않고 "준비중" 배지를 보여줍니다.
 *
 * 수정 금지 파일(js/leaderboard.js 등)은 한 글자도 건드리지 않습니다.
 * 표가 다시 그려지면 MutationObserver 로 알아채 값만 새로 씁니다.
 *
 * 기존 마크업은 하나도 지우지 않습니다. 슬롯 안에 <div class="tl-status-bar">
 * 를 하나 덧붙일 뿐이고, 옛 소재는 css/ad-banner-status.css 가 화면에서만
 * 가립니다.
 *
 * 되돌리기 — index.html 에서 이 파일 <script> 와 CSS <link> 두 줄을 지웁니다.
 * ========================================================================= */

window.App = window.App || {};

App.AdStatusBar = (function () {
  "use strict";

  var SOON = '<span class="tl-status-soon">준비중</span>';
  var bar = null;

  function build() {
    var slot = document.getElementById("top-ad-slot");
    if (!slot || document.querySelector(".tl-status-bar")) return null;
    var el = document.createElement("div");
    el.className = "tl-status-bar";
    el.setAttribute("role", "link");
    // 클릭하면 기존 '랭킹' 메뉴 버튼을 그대로 눌러줍니다(새 화면 전환 로직 없음).
    el.addEventListener("click", function () {
      var t = document.getElementById("page-nav-ranking");
      if (t) t.click();
    });
    slot.appendChild(el);
    return el;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function read() {
    var body = document.getElementById("leaderboard-body");
    var rows = body ? body.querySelectorAll("tr") : [];
    var out = { count: null, nick: null, rate: null, up: null };
    if (!rows.length) return out;
    out.count = rows.length;
    var cells = rows[0].children;
    var nickCell = rows[0].querySelector(".leaderboard-nick-cell");
    if (nickCell) out.nick = nickCell.textContent.trim();
    var last = cells[cells.length - 1];
    if (last) {
      var txt = last.textContent.trim();
      if (/%/.test(txt)) {
        out.rate = txt;
        out.up = /^\+/.test(txt) ? true : /^-/.test(txt) ? false : null;
      }
    }
    return out;
  }

  function item(label, valueHtml) {
    return (
      '<span class="tl-status-item">' +
      '<span class="tl-status-label">' + label + "</span>" +
      '<span class="tl-status-value">' + valueHtml + "</span>" +
      "</span>"
    );
  }

  function render() {
    if (!bar) return;
    var d = read();
    var cnt = d.count == null ? SOON : esc(d.count) + '<span class="tl-status-unit">명</span>';
    var top =
      d.nick == null
        ? SOON
        : esc(d.nick) +
          (d.rate
            ? ' <span class="tl-status-rate ' +
              (d.up === true ? "is-up" : d.up === false ? "is-down" : "") +
              '">' + esc(d.rate) + "</span>"
            : "");
    bar.innerHTML =
      item("랭킹 참가", cnt) +
      item("1위", top) +
      item("시즌 기간", SOON) +
      '<span class="tl-status-go">랭킹 보기 &rsaquo;</span>';
  }

  function init() {
    bar = build();
    if (!bar) return;
    render();
    var body = document.getElementById("leaderboard-body");
    if (body && window.MutationObserver) {
      new MutationObserver(render).observe(body, { childList: true, subtree: true });
    }
  }

  return { init: init, render: render };
})();
