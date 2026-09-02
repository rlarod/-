/* =========================================================================
 * js/chart-date-range.js — App.ChartDateRange
 * =========================================================================
 * 차트 아래쪽 "표시 기간" 탭입니다 (1D · 5D · 1M · 3M · 6M · YTD · 1Y · 5Y · ALL).
 * 한 번 누르면 그 기간이 화면에 딱 들어옵니다.
 *
 * ── 시간 단위(1분·5분)와 무엇이 다른가 ────────────────────────────────
 *   시간 단위(#interval-row, 차트 ★위★)   봉 하나가 몇 분인가
 *   표시 기간(이 파일, 차트 ★아래★)        얼마나 긴 기간을 볼 것인가
 *
 *   헷갈리지 않게 세 가지를 다르게 했습니다.
 *     ① 자리      — 위(시간 단위) / 아래(표시 기간). 트레이딩뷰와 같습니다
 *     ② 글자      — 한글(1분·1일) / 영문(1D·1M). 같은 글자가 두 번 안 나옵니다
 *                   ⚠ 한글로 하면 "1일"·"1주"·"1개월" 이 시간 단위와 ★글자까지 같아집니다
 *     ③ 줄 이름   — 줄 맨 앞에 "표시 기간" 이라고 적어 둡니다
 *
 * ── 트레이딩뷰를 실제로 열어서 재고 그대로 맞춘 것 ────────────────────
 * 2026-09-02, BINANCE:BTCUSDT.P 를 열어 탭을 하나씩 눌러 ★직접 측정★했습니다.
 * 트레이딩뷰는 기간 탭을 누르면 ★봉 간격도 같이 바꿉니다★ (D 로 보다가 1D 를
 * 누르니 1m 으로 바뀌었습니다). 우리도 같이 바꿉니다.
 *
 *   탭    트레이딩뷰 실측    우리        우리 봉 개수    비고
 *   1D    1m  (1440개)      5m          288
 *   5D    5m  (1440개)      15m         480
 *   1M    30m (1440개)      2h          360
 *   3M    1h  (2160개)      6h          360
 *   6M    2h  (2160개)      12h         360
 *   YTD   D                 1d          ~245           ★같음★
 *   1Y    D   (365개)       1d          365            ★같음★
 *   5Y    W   (261개)       1w          261            ★같음★
 *   ALL   M                 1M          ~84            ★같음★
 *
 * ★왜 짧은 5개만 봉을 더 굵게 잡았나 — 우리 로더가 한 번에 500개만 받습니다★
 *   js/config.js:91  KLINE_LIMIT = 500
 *   js/chart.js:306  fetchKlines(symbol, interval, KLINE_LIMIT)
 *   트레이딩뷰처럼 1440개를 쓰려면 500개씩 ★세 번★ 이어 받아야 하는데,
 *   그 이어받기는 js/chart.js 의 loadMoreHistory 가 "왼쪽 끝까지 스크롤했을 때"
 *   만 도는 함수라 우리가 직접 부를 수 없습니다(수정 금지 파일).
 *   여러 번 돌게 만들면 왕복이 3~5번이라 느리고, 중간에 하나만 실패해도
 *   ★빈 구간★ 이 생깁니다. 그게 제일 나쁩니다.
 *   그래서 ★기간은 트레이딩뷰와 똑같이★, ★봉 굵기만 한 단계 굵게★ 했습니다.
 *   전부 500개 안이라 한 번에 받아 옵니다.
 *
 * ★봉이 모자라면 어떻게 되나★
 *   ① 위 표대로 요청 봉 수가 전부 500개 이하라 "기간은 넓은데 봉이 없는" 상황이
 *      원칙적으로 안 생깁니다.
 *   ② 그래도 상장이 얼마 안 된 종목이면 데이터 자체가 짧을 수 있습니다.
 *      그때는 ★조용히 빈 화면을 두지 않고★ 줄 아래에 이렇게 적습니다 —
 *        "우리가 가진 값은 2019-09-08 부터입니다 — 그때부터 보여드립니다"
 *      그리고 있는 데까지 맞춰서 보여 줍니다.
 *   ③ 봉 간격을 바꾼 것도 조용히 넘기지 않고 "봉 간격을 5분으로 맞췄습니다"
 *      라고 같은 자리에 적습니다.
 *
 * ── 수정 금지 파일을 건드리지 않습니다 ───────────────────────────────
 *   차트 객체    App.ChartFont.getCharts() 로 빌려 씁니다 (js/chart.js 무수정)
 *   봉 간격 변경 #interval-row 의 ★버튼을 대신 눌러줍니다★.
 *                App.Config.setActiveInterval() 을 직접 부르면 js/chart.js 가
 *                버튼 줄을 다시 안 그려서 "1분" 이 금색으로 남습니다(조용한 어긋남).
 *                버튼을 누르면 js/chart.js 의 손잡이가 다시 그려 주고,
 *                js/interval-more.js 도 자기 관찰자로 따라옵니다.
 *                ⚠ "더보기" 안으로 숨긴 버튼(2h·6h·12h·1w·1M)도 DOM 에는 그대로
 *                  있습니다(CSS 로만 가림) — 그래서 눌러집니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/chart-date-range.js"></script> 한 줄 삭제
 *   2) rm js/chart-date-range.js
 *   실행 중에 잠깐 끄려면 콘솔에서 App.ChartDateRange.disable()
 * ========================================================================= */

window.App = window.App || {};

App.ChartDateRange = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다 */
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  var BAR_ID = "tl-chart-bottombar"; /* 2건(날짜)·3건(시간대)과 같이 쓰는 줄 */
  var STYLE_ID = "tl-date-range-css";
  var WRAP_ID = "tl-dr-wrap";
  var NOTE_ID = "tl-dr-note";

  var DAY = 86400;

  /* 탭 정의 — seconds 가 null 이면 "있는 데까지 전부" 입니다.
     interval 은 위 표에서 정한 봉 간격입니다(js/config.js 의 value 와 같은 글자). */
  var TABS = [
    { id: "1D", seconds: DAY, interval: "5m", title: "최근 1일 — 5분봉 288개" },
    { id: "5D", seconds: DAY * 5, interval: "15m", title: "최근 5일 — 15분봉 480개" },
    { id: "1M", seconds: DAY * 30, interval: "2h", title: "최근 1개월 — 2시간봉 360개" },
    { id: "3M", seconds: DAY * 90, interval: "6h", title: "최근 3개월 — 6시간봉 360개" },
    { id: "6M", seconds: DAY * 180, interval: "12h", title: "최근 6개월 — 12시간봉 360개" },
    { id: "YTD", seconds: "ytd", interval: "1d", title: "올해 1월 1일부터 — 일봉" },
    { id: "1Y", seconds: DAY * 365, interval: "1d", title: "최근 1년 — 일봉 365개" },
    { id: "5Y", seconds: DAY * 1825, interval: "1w", title: "최근 5년 — 주봉 261개" },
    { id: "ALL", seconds: null, interval: "1M", title: "있는 데까지 전부 — 월봉" },
  ];

  var off = false;
  var wrap = null;
  var noteEl = null;
  var observer = null;
  var activeTab = null;
  var token = 0; /* 늦게 온 옛 요청이 새 요청을 덮지 않게 하는 표 */
  var noteTimer = null;
  var busyUntil = 0;

  /* =====================================================================
   * 차트 빌려오기
   * ===================================================================== */
  function getChart() {
    try {
      if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return null;
      var list = App.ChartFont.getCharts();
      return list && list.length ? list[0] : null;
    } catch (e) {
      return null;
    }
  }

  function getCandleSeries() {
    var c = getChart();
    if (!c || typeof c.panes !== "function") return null;
    try {
      var panes = c.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          if (list[j].seriesType && list[j].seriesType() === "Candlestick") return list[j];
        }
      }
    } catch (e) {
      /* 무시 */
    }
    return null;
  }

  function seriesData() {
    var s = getCandleSeries();
    if (!s || typeof s.data !== "function") return null;
    try {
      var d = s.data();
      return d && d.length ? d : null;
    } catch (e) {
      return null;
    }
  }

  /* =====================================================================
   * 줄(2·3건과 함께 쓰는 바닥 줄)
   * ⚠ 세 파일이 똑같은 함수를 각각 갖고 있습니다. 하나만 지워도 나머지가
   *   그대로 도는 것이 더 중요해서 일부러 나눠 놨습니다.
   * ===================================================================== */
  function ensureBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    var panel = document.querySelector(".chart-panel");
    if (!panel) {
      var cw = document.querySelector(".chart-wrap");
      panel = cw ? cw.parentNode : null;
    }
    if (!panel) return null;
    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:6px;" +
      "flex:0 0 auto;padding:7px 2px 1px;margin-top:5px;" +
      "border-top:1px solid " + C_BORDER + ";";
    panel.appendChild(bar);
    return bar;
  }

  /* =====================================================================
   * 화면
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "#" + WRAP_ID + "{display:flex;flex-wrap:wrap;align-items:center;gap:5px;order:1;}" +
      "#" + WRAP_ID + " .tl-dr-label{font-size:15px;color:" + C_MUTED + ";" +
      "white-space:nowrap;margin-right:3px;}" +
      "#" + WRAP_ID + " .tl-dr-tab{background:" + C_TILE + ";border:1px solid " + C_BORDER + ";" +
      "color:" + C_MUTED + ";padding:5px 10px;border-radius:3px;font-family:var(--mono);" +
      "font-size:17px;font-weight:600;line-height:1.15;cursor:pointer;transition:.12s;}" +
      "#" + WRAP_ID + " .tl-dr-tab:hover{border-color:" + C_MUTED + ";color:" + C_TEXT + ";}" +
      "#" + WRAP_ID + " .tl-dr-tab.on{background:rgba(240,180,41,.12);" +
      "border-color:" + C_POINT + ";color:" + C_POINT + ";}" +
      /* 안내문은 ★자기 줄★ 을 씁니다 — 탭 위에 겹쳐 그리지 않습니다 */
      "#" + NOTE_ID + "{flex:1 1 100%;order:9;font-size:15px;color:" + C_MUTED + ";" +
      "padding:2px 2px 3px;line-height:1.35;}" +
      "#" + NOTE_ID + ":empty{display:none;}" +
      /* ★넓은 화면에서 한 줄로 만들기 위한 것입니다(글씨는 그대로 17px).★
         2026-09-02 실측 — 이 줄에 필요한 폭 832px / 차트 열 폭 780px(1440·1920).
         52px 이 모자라 시계가 둘째 줄로 내려갔고 차트가 83px 짧아졌습니다.
         여기서 버는 것   탭 좌우 여백 10→8 (9개 × 4px = 36px) · 탭 사이 5→4 (8px)
         시계에서 버는 것 초 표시 제거 (31px)  → 합계 75px, 23px 여유로 한 줄이 됩니다.
         ⚠ 폰(360~390)은 ★그대로 둡니다★ — 거기는 어차피 두 줄이고, 손가락으로
           누르는 자리를 좁히면 안 됩니다.
         ⚠ 혹시 안 맞으면 그냥 두 줄로 접힙니다. 잘리거나 숨지 않습니다. */
      "@media (min-width:1200px){" +
      "#" + WRAP_ID + "{gap:4px;}" +
      "#" + WRAP_ID + " .tl-dr-tab{padding:5px 8px;}" +
      "}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function note(msg) {
    if (!noteEl) return;
    noteEl.textContent = msg || "";
    if (noteTimer) clearTimeout(noteTimer);
    if (msg) {
      noteTimer = setTimeout(function () {
        if (noteEl) noteEl.textContent = "";
      }, 7000);
    }
  }

  function paint() {
    if (off) return;
    var bar = ensureBar();
    if (!bar) return;
    injectStyle();

    if (!wrap || wrap.parentNode !== bar) {
      wrap = document.createElement("div");
      wrap.id = WRAP_ID;
      wrap.setAttribute("role", "group");
      wrap.setAttribute("aria-label", "표시 기간");

      var lab = document.createElement("span");
      lab.className = "tl-dr-label";
      lab.textContent = "표시 기간";
      wrap.appendChild(lab);

      TABS.forEach(function (t) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tl-dr-tab";
        b.setAttribute("data-dr", t.id);
        b.setAttribute("title", t.title);
        b.setAttribute("aria-label", t.title);
        b.textContent = t.id;
        b.addEventListener("click", function () {
          apply(t);
        });
        wrap.appendChild(b);
      });
      bar.appendChild(wrap);
    }

    if (!noteEl || noteEl.parentNode !== bar) {
      noteEl = document.createElement("div");
      noteEl.id = NOTE_ID;
      noteEl.setAttribute("role", "status");
      noteEl.setAttribute("aria-live", "polite");
      bar.appendChild(noteEl);
    }
    markActive();
  }

  function markActive() {
    if (!wrap) return;
    var btns = wrap.querySelectorAll(".tl-dr-tab");
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute("data-dr") === activeTab;
      btns[i].className = "tl-dr-tab" + (on ? " on" : "");
      btns[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }

  /* =====================================================================
   * 봉 간격 바꾸기 — #interval-row 의 버튼을 대신 눌러 줍니다
   * ===================================================================== */
  function switchInterval(value) {
    var cur = null;
    try {
      cur = App.Config.getActiveInterval();
    } catch (e) {
      /* 무시 */
    }
    if (cur === value) return false;
    busyUntil = Date.now() + 1200; /* 우리가 누른 것 — 아래 감시가 탭 불을 끄지 않게 */
    var row = document.getElementById("interval-row");
    var btn = row ? row.querySelector('.interval-btn[data-interval="' + value + '"]') : null;
    if (btn) {
      btn.click(); /* js/chart.js 의 손잡이를 그대로 씁니다 */
      return true;
    }
    /* 버튼을 못 찾은 경우에만(줄이 아직 안 그려짐 등) 직접 부릅니다 */
    try {
      App.Config.setActiveInterval(value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function intervalSeconds(value) {
    try {
      var list = App.Config.getIntervals();
      for (var i = 0; i < list.length; i++) if (list[i].value === value) return list[i].seconds;
    } catch (e) {
      /* 무시 */
    }
    return 60;
  }

  /* 새 간격의 봉이 실제로 들어왔는지 — 봉 사이 간격으로 확인합니다.
     ⚠ 1개월봉은 달마다 길이가 달라(28~31일) 넉넉한 오차를 둡니다. */
  function dataMatches(d, sec) {
    if (!d || d.length < 2) return false;
    var gap = d[1].time - d[0].time;
    var tol = Math.max(2, sec * 0.34);
    return Math.abs(gap - sec) <= tol;
  }

  function ytdStart() {
    var now = new Date();
    return Math.floor(new Date(now.getFullYear(), 0, 1, 0, 0, 0).getTime() / 1000);
  }

  function ymd(sec) {
    var d = new Date(sec * 1000);
    var p = function (n) {
      return String(n).padStart(2, "0");
    };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function labelOf(v) {
    try {
      var list = App.Config.getIntervals();
      for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i].label;
    } catch (e) {
      /* 무시 */
    }
    return v;
  }

  /* =====================================================================
   * 탭 누름
   * ===================================================================== */
  function apply(tab) {
    if (off) return;
    var chart = getChart();
    if (!chart) {
      note("차트가 아직 준비되지 않았습니다 — 잠시 뒤 다시 눌러 주세요");
      return;
    }
    activeTab = tab.id;
    markActive();

    var my = ++token;
    var sec = intervalSeconds(tab.interval);
    var changed = switchInterval(tab.interval);
    if (changed) note("봉 간격을 " + labelOf(tab.interval) + "으로 맞췄습니다 — 불러오는 중…");
    else note("불러오는 중…");

    var tries = 0;
    var lastLen = -1;
    var stable = 0;

    (function wait() {
      if (off || my !== token) return; /* 더 최근 요청이 있으면 조용히 물러납니다 */
      var d = seriesData();
      if (dataMatches(d, sec)) {
        var wantFrom =
          tab.seconds === "ytd"
            ? ytdStart()
            : tab.seconds == null
            ? d[0].time
            : d[d.length - 1].time - tab.seconds;
        if (d[0].time <= wantFrom) return finish(tab, d, wantFrom);
        /* 아직 그만큼 과거가 안 왔습니다 — 더 들어오는지 조금 더 봅니다 */
        if (d.length === lastLen) stable++;
        else stable = 0;
        lastLen = d.length;
        if (stable >= 6) return finish(tab, d, wantFrom); /* 더 이상 안 늘어남 */
      }
      if (++tries > 70) {
        /* 70 × 120ms ≒ 8.4초 */
        note("데이터를 제때 받지 못했습니다 — 다시 눌러 주세요");
        return;
      }
      setTimeout(wait, 120);
    })();
  }

  function finish(tab, d, wantFrom) {
    var chart = getChart();
    if (!chart) return;
    var first = d[0].time;
    var last = d[d.length - 1].time;
    var from = Math.max(wantFrom, first);
    /* 안내문에 적는 개수는 ★화면에 들어온 봉★ 입니다.
       전체 보유 개수를 적으면 js/chart.js 가 뒤에서 과거를 더 이어받는 순간
       숫자가 혼자 늘어나 회원이 "왜 늘지?" 하게 됩니다. */
    var shown = 0;
    for (var i = 0; i < d.length; i++) if (d[i].time >= from) shown++;
    try {
      chart.timeScale().setVisibleRange({ from: from, to: last });
    } catch (e) {
      try {
        chart.timeScale().fitContent();
      } catch (e2) {
        /* 무시 */
      }
    }
    if (tab.seconds == null) {
      note(
        "있는 데까지 전부 — " + ymd(first) + " 부터 (" + labelOf(tab.interval) + " " + shown + "개)"
      );
    } else if (wantFrom < first - intervalSeconds(tab.interval)) {
      /* ★조용히 빈 화면을 두지 않습니다★ */
      note(
        "우리가 가진 값은 " + ymd(first) + " 부터입니다 — 그때부터 보여드립니다 (" +
          labelOf(tab.interval) + " " + shown + "개)"
      );
    } else {
      note(ymd(from) + " ~ " + ymd(last) + " (" + labelOf(tab.interval) + " " + shown + "개)");
    }
  }

  function busy() {
    return Date.now() < busyUntil;
  }

  /* =====================================================================
   * 시간 단위를 회원이 직접 바꾸면 기간 탭 불을 끕니다
   * (그 순간부터 화면은 그 탭의 기간이 아니게 됩니다)
   * ===================================================================== */
  var clickBound = false;
  function watchIntervalRow() {
    if (clickBound) return;
    clickBound = true;
    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (t.closest("#interval-row .interval-btn") || t.closest(".tl-im-menu button")) {
          setTimeout(function () {
            if (busy()) return; /* 우리가 대신 누른 것이면 건너뜁니다 */
            activeTab = null;
            markActive();
          }, 0);
        }
      },
      true
    );
  }

  /* =====================================================================
   * 차트 아래 줄이 날아가면 다시 붙입니다
   * (js/chart-drawings.js 가 .chart-panel 안을 다시 짜는 일이 있습니다)
   * ===================================================================== */
  function observe() {
    var panel = document.querySelector(".chart-panel");
    if (!panel || observer) return;
    observer = new MutationObserver(function () {
      if (off) return;
      var bar = document.getElementById(BAR_ID);
      if (!bar || bar.parentNode !== panel) {
        paint();
        return;
      }
      if (bar !== panel.lastElementChild) panel.appendChild(bar); /* 항상 맨 아래 */
    });
    observer.observe(panel, { childList: true });
  }

  function start() {
    if (off) return;
    paint();
    observe();
    watchIntervalRow();
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        setTimeout(start, 0);
      });
    } else {
      setTimeout(start, 0);
    }
    /* 차트가 늦게 붙는 경우가 있어 몇 번 더 확인합니다 */
    var n = 0;
    var t = setInterval(function () {
      if (off || ++n > 40) return clearInterval(t);
      if (document.querySelector(".chart-panel")) {
        start();
        clearInterval(t);
      }
    }, 250);
  }

  init();

  return {
    ensureBar: ensureBar,
    BAR_ID: BAR_ID,
    TABS: TABS,
    getActiveTab: function () {
      return activeTab;
    },
    apply: function (id) {
      for (var i = 0; i < TABS.length; i++) if (TABS[i].id === id) return apply(TABS[i]);
    },
    disable: function () {
      off = true;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      if (noteEl && noteEl.parentNode) noteEl.parentNode.removeChild(noteEl);
      wrap = null;
      noteEl = null;
    },
  };
})();
