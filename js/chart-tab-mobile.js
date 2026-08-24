/* =========================================================================
 * js/chart-tab-mobile.js — App.ChartTabMobile
 * =========================================================================
 * [모바일 2단계] 폰에서 차트를 호가창·최근체결과 "같은 탭 자리"로 모읍니다.
 *
 * ── 무엇이 불편했나 (390px 실측, 2026-08-24) ──────────────────────────
 *   차트 칼럼   상단 449px  높이 605px
 *   호가창 칼럼 상단 1057px 높이 545px
 *   → 둘이 세로로 1,153px 을 따로 차지합니다. 주문 패널까지 내려가려면
 *     화면 한 번 반을 더 밀어야 합니다. 문서 총 높이 4,776px.
 *   바이낸스 모바일은 [Chart][Order Book][Trades] 를 한 자리에서 바꿉니다.
 *
 * ── 어떻게 하나 ───────────────────────────────────────────────────────
 * 1) 이미 있는 탭 막대(#orderbook-tabs)에 "차트" 버튼 하나를 맨 앞에 넣습니다.
 *    버튼은 데스크톱에서 CSS 로 숨깁니다(.ob-tab-btn-chart) — 768/1440/1920 은
 *    지금 그대로 세 칼럼입니다.
 * 2) .main-grid 에 data-mtab="chart|orderbook|trades" 를 붙이고, 어느 것을
 *    보일지는 style.css 가 display 로만 정합니다.
 *    - 차트 탭   → #orderbook-tabs-content 를 숨기고 .chart-column 을 보임
 *    - 호가창/최근체결 → .chart-column 을 숨기고 탭 내용만 보임
 * 3) 모바일에서 탭 막대가 차트보다 위로 와야 하므로 CSS `order` 로 보이는
 *    자리만 바꿉니다(.orderbook-column 1 / .chart-column 2 / .side-column 3).
 *    **DOM 순서는 그대로**입니다.
 *
 * ── 차트가 0x0 에서 되살아나는가 (실측 확인함) ────────────────────────
 *   js/chart.js 는 createChart(..., { autoSize:true }) 로 만듭니다. autoSize 는
 *   내부 ResizeObserver 라서 display:none 동안 0x0 이 되어도 다시 보이는
 *   순간 스스로 크기를 잡습니다. 390px 실측:
 *     숨기기 전 캔버스 212x542 / 130x542 / 212x46
 *     숨겼을 때 컨테이너 0x0
 *     다시 보임 컨테이너 345x591, 캔버스 212x542 / 130x542 / 212x46 (동일)
 *   → js/chart.js 를 열 필요가 없었습니다. 여기서 resize() 를 부르지 않습니다
 *     (autoSize 가 켜져 있으면 수동 resize() 는 무시됩니다).
 *
 * ── 안 하는 것 ────────────────────────────────────────────────────────
 *   - js/orderbook-tabs.js 의 동작을 바꾸지 않습니다. 그 모듈이 "차트" 버튼에도
 *     자기 리스너를 붙이는데(showTab("chart") → 두 패널 다 숨김) 결과가 같아서
 *     충돌하지 않습니다. 이 모듈은 그것과 무관하게 스스로도 상태를 맞춥니다.
 *   - 어떤 항목도 지우지 않습니다. 감추는 것은 전부 display 뿐입니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   index.html 의 <script src="js/chart-tab-mobile.js"> 한 줄을 지우면
 *   차트가 다시 탭 위에 따로 놓입니다(style.css 의 [data-mtab] 규칙은 남아
 *   있어도 속성이 안 붙으므로 아무 일도 하지 않습니다).
 *   완전히 지우려면 style.css 의 "[모바일 2단계]" 블록도 함께 지웁니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartTabMobile = (function () {
  "use strict";

  var MQ = "(max-width:700px)";        /* 1단계와 같은 경계 */
  var BTN_ID = "mtab-chart-btn";
  var DEFAULT_TAB = "chart";           /* 바이낸스도 Chart 가 기본 */

  var current = DEFAULT_TAB;
  var wasMobile = null;

  function el(id) { return document.getElementById(id); }
  function grid() { return document.querySelector(".main-grid"); }
  function tabsBar() { return el("orderbook-tabs"); }

  function isMobile() {
    return window.matchMedia && window.matchMedia(MQ).matches;
  }

  /* js/orderbook-tabs.js 의 canStack() 과 같은 기준.
     그 모듈이 넓은 화면에서 호가창+최근체결을 동시에 띄우므로,
     그 구간에서는 패널 display 를 건드리지 않습니다. */
  function stacked() {
    return window.innerWidth >= 1301 && window.innerHeight >= 760;
  }

  /* ---------- "차트" 버튼 만들기 ---------- */
  function ensureButton() {
    var bar = tabsBar();
    if (!bar || el(BTN_ID)) return;
    var btn = document.createElement("button");
    btn.type = "button";
    btn.id = BTN_ID;
    btn.className = "ob-tab-btn ob-tab-btn-chart";
    btn.dataset.tab = "chart";
    btn.textContent = "차트";
    bar.insertBefore(btn, bar.firstChild);
  }

  /* ---------- 상태 적용 ---------- */
  function applyTab(name) {
    var g = grid();
    if (g) g.setAttribute("data-mtab", name);

    var bar = tabsBar();
    if (bar) {
      var btns = bar.querySelectorAll(".ob-tab-btn");
      for (var i = 0; i < btns.length; i++) {
        btns[i].classList.toggle("active", btns[i].dataset.tab === name);
      }
    }
    /* 패널 display 는 orderbook-tabs.js 의 showTab() 과 같은 규칙입니다.
       (그 모듈의 리스너가 안 붙은 경우에도 혼자 동작하게 하기 위함) */
    var ob = el("orderbook-panel");
    var tr = el("recent-trades-panel");
    if (ob) ob.style.display = name === "orderbook" ? "" : "none";
    if (tr) tr.style.display = name === "trades" ? "" : "none";
  }

  /* 모바일을 벗어날 때 — 차트 칼럼과 호가창을 원래대로 돌려놓습니다.
     이걸 안 하면 768~1300 구간에서 "차트" 탭이 선택된 채로 남아
     호가창이 통째로 비어 보입니다(실제로 걸렸던 경우). */
  function leaveMobile() {
    var g = grid();
    if (g) g.removeAttribute("data-mtab");

    var bar = tabsBar();
    if (bar) {
      var chartBtn = el(BTN_ID);
      if (chartBtn && chartBtn.classList.contains("active")) {
        chartBtn.classList.remove("active");
        var obBtn = bar.querySelector('.ob-tab-btn[data-tab="orderbook"]');
        if (obBtn) obBtn.classList.add("active");
      }
    }
    if (stacked()) return;             /* 넓은 화면은 orderbook-tabs.js 가 둘 다 켭니다 */
    var active = document.querySelector("#orderbook-tabs .ob-tab-btn.active");
    var name = active && active.dataset.tab ? active.dataset.tab : "orderbook";
    if (name === "chart") name = "orderbook";
    var ob = el("orderbook-panel");
    var tr = el("recent-trades-panel");
    if (ob) ob.style.display = name === "orderbook" ? "" : "none";
    if (tr) tr.style.display = name === "trades" ? "" : "none";
  }

  function sync() {
    ensureButton();
    var m = isMobile();
    if (m) {
      applyTab(current);
    } else if (wasMobile !== false) {
      leaveMobile();
    }
    wasMobile = m;
  }

  function onClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest(".ob-tab-btn") : null;
    if (!btn || !btn.dataset.tab) return;
    if (!isMobile()) return;           /* 데스크톱은 기존 동작 그대로 */
    current = btn.dataset.tab;
    applyTab(current);
  }

  function init() {
    ensureButton();
    var bar = tabsBar();
    if (!bar) return;                  /* 마크업이 없으면 조용히 종료 */
    bar.addEventListener("click", onClick);
    sync();
    /* js/orderbook-tabs.js 는 resize 후 apply() 로 자기 상태를 다시 씁니다.
       그 리스너가 먼저 등록돼 있어 먼저 실행되므로, 뒤이어 여기서 덮습니다. */
    window.addEventListener("resize", sync);
    /* trades.js 가 #recent-trades-panel 을 나중에 만들고,
       orderbook-tabs.js 도 800ms 에 한 번 더 apply() 합니다. 그 뒤에 맞춥니다. */
    setTimeout(sync, 1000);
    setTimeout(sync, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, sync: sync, applyTab: applyTab };
})();
