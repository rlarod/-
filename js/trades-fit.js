/* =========================================================================
 * js/trades-fit.js — App.TradesFit
 * =========================================================================
 * "최근 체결" 목록을 칸 높이에 들어가는 만큼만 보이게 다듬습니다.
 *
 * 왜 필요한가 (2026-08-24 대표 지시 "그 칸에 닿으면 자동으로 없어지게 해줘")
 * ------------------------------------------------------------------------
 * 1440 실측: 보이는 높이 495px / 내용 높이 1020px (30줄 x 34px).
 * 들어가는 줄은 14줄인데 30줄이 들어와서 두 배 넘게 넘쳤고, 넘치니까
 * 세로 스크롤이 생기고, 스크롤이 생기니까 오른쪽에 막대가 생겼습니다.
 * 앞선 수정(style.css 3835행)은 막대만 감췄을 뿐 넘침 자체는 그대로였습니다.
 * 이 모듈은 원인을 없앱니다 — 넘치지 않으면 막대도 생기지 않습니다.
 *
 * 왜 CSS 만으로 하지 않았나
 * ------------------------------------------------------------------------
 *   - overflow:hidden 만 주면 맨 아래 줄이 반쯤 잘려 보입니다.
 *   - 들어가는 줄 수는 창 높이·글자 크기·화면 폭(탭 모드 여부)에 따라 달라져서
 *     CSS 로는 "몇 줄"인지 알 수 없습니다. 고정 숫자를 박으면 폭마다 틀립니다.
 * 그래서 실제 높이를 재서 줄 수를 정합니다. 숫자를 코드에 박지 않습니다.
 *
 * 무엇을 하지 않는가 (중요)
 * ------------------------------------------------------------------------
 *   - js/trades.js 는 한 글자도 안 고칩니다. 내부 배열(recentTrades 30건)도
 *     그대로 둡니다. "최근 30건"을 쓰는 다른 기능이 깨지지 않습니다.
 *   - 행 DOM 도 지우지 않습니다. data-rt-clipped 속성 하나만 붙였다 뗍니다
 *     (마크업 보존). class 를 쓰지 않는 이유: js/trades.js 의 render() 가 체결마다
 *     rowEl.className 을 통째로 덮어써서 class 로 표시하면 매번 지워집니다.
 *     속성은 render() 가 건드리지 않으므로 살아남습니다(실측으로 확인).
 *   - 새 체결은 위(index 0)로 들어오고 오래된 것이 아래로 밀립니다
 *     (trades.js flush(): pendingTicks...concat(recentTrades)).
 *     그래서 뒤쪽 index 를 감추면 항상 "오래된 줄"이 빠집니다.
 *     실측 확인: 맨 위 11:32:15 / 맨 아래 11:32:14.
 *
 * 되돌리는 방법
 * ------------------------------------------------------------------------
 *   index.html 의 <script src="js/trades-fit.js"> 한 줄과 main.js 의
 *   "TradesFit" 한 단어를 지우면 원래대로 30줄 전부 보입니다.
 *   (style.css 의 [data-rt-clipped] 규칙은 남아 있어도 아무 일도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.TradesFit = (function () {
  "use strict";

  var LIST_ID = "recent-trades-list";
  var HIDE_ATTR = "data-rt-clipped";
  var MIN_ROWS = 3; // 어떤 경우에도 이보다 적게 남기지 않습니다(안전판)

  var listEl = null;
  var rafId = 0;
  var findTries = 0;
  var findTimer = 0;

  function schedule() {
    if (rafId) return;
    rafId = requestAnimationFrame(function () {
      rafId = 0;
      apply();
    });
  }

  /* 이 목록이 "칸 안에 갇힌" 상태인지 — 넘치면 잘리거나 스크롤되는 상태인지.
     넓은 화면(호가창+최근체결 상하 배치)에서는 overflow-y:auto 가 걸려 높이가
     칼럼에 의해 정해지고, 좁은 화면(탭 모드)에서는 규칙이 적용되지 않아
     overflow-y 가 visible 이고 높이가 내용만큼 늘어납니다.
     visible 이면 넘칠 수가 없으니 아무것도 감추지 않습니다. */
  function isClipped(el) {
    var oy = window.getComputedStyle(el).overflowY;
    return oy === "auto" || oy === "scroll" || oy === "hidden" || oy === "overlay";
  }

  function showAll(rows) {
    for (var i = 0; i < rows.length; i++) rows[i].removeAttribute(HIDE_ATTR);
  }

  function apply() {
    if (!listEl || !listEl.isConnected) return;

    var rows = listEl.children;
    if (!rows.length) return;

    // 패널 자체가 안 보이는 상태(탭 모드에서 호가창이 선택됨)면 건드리지 않습니다.
    if (listEl.clientHeight <= 0) return;

    if (!isClipped(listEl)) {
      showAll(rows);
      return;
    }

    // 줄 높이는 "지금 보이는 줄"에서 잽니다(감춘 줄은 높이가 0이라 못 씁니다).
    var rowH = 0;
    for (var i = 0; i < rows.length; i++) {
      var h = rows[i].getBoundingClientRect().height;
      if (h > 0) { rowH = h; break; }
    }
    // 잴 수 없으면(아직 그려지기 전 등) 감춘 것을 전부 풀어 스스로 복구합니다.
    if (rowH <= 0) { showAll(rows); return; }

    // 소수점 반올림 오차로 마지막 줄이 1px 삐져나가는 것을 막으려고 0.5px 여유를 둡니다.
    var fit = Math.floor((listEl.clientHeight + 0.5) / rowH);
    if (fit < MIN_ROWS) fit = MIN_ROWS;
    if (fit >= rows.length) { showAll(rows); return; }

    // 앞에서 fit 개만 남기고 나머지(=오래된 줄)를 감춥니다.
    for (var j = 0; j < rows.length; j++) {
      if (j >= fit) rows[j].setAttribute(HIDE_ATTR, "");
      else rows[j].removeAttribute(HIDE_ATTR);
    }
  }

  function watch() {
    // 새 행이 추가될 때(trades.js ensureRowEls) 다시 계산
    if (window.MutationObserver) {
      new MutationObserver(schedule).observe(listEl, { childList: true });
    }
    // 칸 높이가 바뀔 때(창 크기·레이아웃 변경) 다시 계산
    if (window.ResizeObserver) {
      new ResizeObserver(schedule).observe(listEl);
    }
    // 글자 크기가 미디어쿼리로 바뀌면 칸 높이는 그대로여도 줄 높이가 달라집니다.
    window.addEventListener("resize", schedule);
    // 탭/상하배치 전환은 js/orderbook-tabs.js 가 resize 후 800ms 에 한 번 더 합니다.
    window.addEventListener("resize", function () { setTimeout(schedule, 900); });
    schedule();
  }

  function findList() {
    listEl = document.getElementById(LIST_ID);
    if (listEl) { watch(); return; }
    // trades.js 가 패널을 나중에 만들 수 있어 잠깐 기다립니다(최대 약 20초).
    if (++findTries > 100) return;
    findTimer = setTimeout(findList, 200);
  }

  function init() {
    if (findTimer) clearTimeout(findTimer);
    findTries = 0;
    findList();
  }

  return { init: init, _apply: apply };
})();
