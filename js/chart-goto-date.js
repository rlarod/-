/* =========================================================================
 * js/chart-goto-date.js — App.ChartGotoDate
 * =========================================================================
 * 차트 아래 "날짜" 버튼입니다. 날짜를 고르면 그 시점으로 차트를 옮깁니다.
 * 트레이딩뷰 차트 하단의 달력 아이콘(go-to-date)을 따라간 것입니다
 * (2026-09-02 에 트레이딩뷰를 직접 열어 자리와 생김새를 확인했습니다 —
 *  기간 탭 바로 오른쪽에 달력 아이콘 하나가 있습니다).
 *
 * ── ★"아무 일도 안 일어남" 을 없애는 것이 이 파일의 핵심입니다★ ───────
 * 우리가 가진 것보다 과거를 고르면 옛날에는 그냥 아무 일도 안 났을 것입니다.
 * 그게 제일 나쁩니다 — 회원은 자기가 잘못 눌렀는지, 고장인지 모릅니다.
 * 그래서 어떤 경우에도 ★한 줄 답★ 을 돌려줍니다.
 *
 *   고른 날짜가 우리 데이터보다 과거   "우리가 가진 값은 2019-09-08 부터입니다
 *                                       — 그 시점으로 옮겼습니다"
 *   오늘 이후                          입력칸 max 로 못 고르게 막고, 그래도 들어오면
 *                                       "오늘 이후는 아직 없습니다"
 *   불러오는 중                         "불러오는 중…"
 *   못 받아옴                           "데이터를 제때 받지 못했습니다 — 다시 눌러 주세요"
 *   성공                                "2026-06-15 로 옮겼습니다 (1시간봉 100개)"
 *
 * ── 봉 간격을 같이 고릅니다 ──────────────────────────────────────────
 * 우리 로더는 한 번에 500개만 받습니다(js/config.js KLINE_LIMIT = 500).
 * 1년 전을 1분봉으로 보려면 52만 개가 필요해서 절대 못 갑니다.
 * 그래서 ★지금부터 그 날짜까지가 450봉 안에 들어오는 가장 촘촘한 간격★ 을
 * 자동으로 고릅니다. 예 —
 *
 *   고른 날짜        거리        고르는 간격     봉 개수
 *   오늘 00:00       ~1일        15분            ~96
 *   3일 전           3일         1시간           72
 *   한 달 전         30일        2시간           360
 *   1년 전           365일       1일             365
 *   5년 전           1825일      1주             261
 *
 * 바꿨으면 바꿨다고 안내문에 적습니다 — 조용히 바꾸지 않습니다.
 *
 * ── 수정 금지 파일을 건드리지 않습니다 ───────────────────────────────
 *   차트 객체    App.ChartFont.getCharts()      (js/chart.js 무수정)
 *   봉 간격      #interval-row 의 버튼을 대신 눌러 줍니다
 *                (js/chart-date-range.js 와 같은 이유 — 그 파일 주석 참고)
 *
 * ⚠ 아래 몇몇 함수(getChart · seriesData · switchInterval · dataMatches)는
 *   js/chart-date-range.js 에도 같은 것이 있습니다. ★일부러★ 나눠 놨습니다 —
 *   한 파일을 지워도 다른 파일이 그대로 돌아야 되돌리기가 쉽습니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/chart-goto-date.js"></script> 한 줄 삭제
 *   2) rm js/chart-goto-date.js
 *   실행 중에 잠깐 끄려면 콘솔에서 App.ChartGotoDate.disable()
 * ========================================================================= */

window.App = window.App || {};

App.ChartGotoDate = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다 */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  var BAR_ID = "tl-chart-bottombar";
  var STYLE_ID = "tl-goto-date-css";
  var WRAP_ID = "tl-gd-wrap";
  var NOTE_ID = "tl-gd-note";

  /* 촘촘한 것부터 — "지금부터 그 날짜까지" 가 450봉 안에 들어오는 첫 번째를 씁니다 */
  var LADDER = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d", "1w", "1M"];
  var MAX_BARS = 450;

  var off = false;
  var wrap = null;
  var btn = null;
  var panel = null;
  var noteEl = null;
  var observer = null;
  var token = 0;
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

  function seriesData() {
    var c = getChart();
    if (!c || typeof c.panes !== "function") return null;
    try {
      var panes = c.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          if (list[j].seriesType && list[j].seriesType() === "Candlestick") {
            var d = list[j].data();
            return d && d.length ? d : null;
          }
        }
      }
    } catch (e) {
      /* 무시 */
    }
    return null;
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

  function labelOf(v) {
    try {
      var list = App.Config.getIntervals();
      for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i].label;
    } catch (e) {
      /* 무시 */
    }
    return v;
  }

  function dataMatches(d, sec) {
    if (!d || d.length < 2) return false;
    var gap = d[1].time - d[0].time;
    var tol = Math.max(2, sec * 0.34);
    return Math.abs(gap - sec) <= tol;
  }

  function switchInterval(value) {
    var cur = null;
    try {
      cur = App.Config.getActiveInterval();
    } catch (e) {
      /* 무시 */
    }
    if (cur === value) return false;
    busyUntil = Date.now() + 1200;
    var row = document.getElementById("interval-row");
    var b = row ? row.querySelector('.interval-btn[data-interval="' + value + '"]') : null;
    if (b) {
      b.click();
      return true;
    }
    try {
      App.Config.setActiveInterval(value);
      return true;
    } catch (e) {
      return false;
    }
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }
  function ymd(sec) {
    var d = new Date(sec * 1000);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  /* =====================================================================
   * 줄 (표시 기간 탭과 같이 쓰는 바닥 줄)
   * ===================================================================== */
  function ensureBar() {
    var bar = document.getElementById(BAR_ID);
    if (bar) return bar;
    var host = document.querySelector(".chart-panel");
    if (!host) {
      var cw = document.querySelector(".chart-wrap");
      host = cw ? cw.parentNode : null;
    }
    if (!host) return null;
    bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.style.cssText =
      "display:flex;flex-wrap:wrap;align-items:center;gap:6px;" +
      "flex:0 0 auto;padding:7px 2px 1px;margin-top:5px;" +
      "border-top:1px solid " + C_BORDER + ";";
    host.appendChild(bar);
    return bar;
  }

  /* =====================================================================
   * 화면
   * ⚠ 팝업 글씨는 크게 씁니다. 대표가 "팝업 글씨가 작다" 고 세 번 말씀하셨고
   *   14px 도 작다고 하셨습니다. 여기 입력칸·버튼은 19px 입니다.
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "#" + WRAP_ID + "{position:relative;display:inline-flex;order:2;}" +
      "#" + WRAP_ID + " .tl-gd-btn{display:inline-flex;align-items:center;gap:6px;" +
      "background:" + C_TILE + ";border:1px solid " + C_BORDER + ";color:" + C_MUTED + ";" +
      "padding:5px 10px;border-radius:3px;font-family:var(--mono);font-size:17px;" +
      "font-weight:600;line-height:1.15;cursor:pointer;transition:.12s;}" +
      "#" + WRAP_ID + " .tl-gd-btn:hover{border-color:" + C_MUTED + ";color:" + C_TEXT + ";}" +
      "#" + WRAP_ID + ' .tl-gd-btn[aria-expanded="true"]{border-color:' + C_POINT + ";color:" + C_POINT + ";}" +
      "#" + WRAP_ID + " .tl-gd-btn svg{width:16px;height:16px;flex:0 0 16px;}" +
      ".tl-gd-panel{position:absolute;left:0;bottom:calc(100% + 6px);z-index:70;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "padding:12px;width:290px;max-width:calc(100vw - 24px);" +
      "display:flex;flex-direction:column;gap:9px;}" +
      ".tl-gd-panel .tl-gd-title{font-size:17px;color:" + C_TEXT + ";font-weight:700;}" +
      ".tl-gd-panel .tl-gd-help{font-size:15px;color:" + C_MUTED + ";line-height:1.4;}" +
      ".tl-gd-panel input[type=date]{width:100%;box-sizing:border-box;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:6px;color:" + C_TEXT + ";" +
      "font-family:var(--mono);font-size:19px;padding:9px 10px;color-scheme:dark;}" +
      ".tl-gd-panel .tl-gd-row{display:flex;gap:8px;}" +
      ".tl-gd-panel .tl-gd-row button{flex:1 1 0;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";border-radius:6px;" +
      "padding:10px 6px;font-family:var(--mono);font-size:19px;font-weight:600;cursor:pointer;}" +
      ".tl-gd-panel .tl-gd-row button.go{background:rgba(240,180,41,.12);" +
      "border-color:" + C_POINT + ";color:" + C_POINT + ";}" +
      ".tl-gd-panel .tl-gd-row button:hover{border-color:" + C_MUTED + ";}" +
      "#" + NOTE_ID + "{flex:1 1 100%;order:10;font-size:15px;color:" + C_MUTED + ";" +
      "padding:2px 2px 3px;line-height:1.35;}" +
      "#" + NOTE_ID + ":empty{display:none;}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function note(msg) {
    if (!noteEl) return;
    noteEl.textContent = msg || "";
    /* 표시 기간 탭의 안내문이 남아 있으면 지웁니다 — 두 줄이 겹쳐 보이지 않게 */
    var other = document.getElementById("tl-dr-note");
    if (other && msg) other.textContent = "";
    if (noteTimer) clearTimeout(noteTimer);
    if (msg) {
      noteTimer = setTimeout(function () {
        if (noteEl) noteEl.textContent = "";
      }, 8000);
    }
  }

  function calendarSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<rect x="3" y="5" width="18" height="16" rx="2"></rect>' +
      '<path d="M3 10h18M8 3v4M16 3v4"></path></svg>'
    );
  }

  function paint() {
    if (off) return;
    var bar = ensureBar();
    if (!bar) return;
    injectStyle();

    if (!wrap || wrap.parentNode !== bar) {
      closePanel();
      wrap = document.createElement("span");
      wrap.id = WRAP_ID;
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-gd-btn";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-expanded", "false");
      btn.setAttribute("title", "날짜로 가기 — 고른 날짜 시점으로 차트를 옮깁니다");
      btn.setAttribute("aria-label", "날짜로 가기");
      btn.innerHTML = calendarSvg() + "<span>날짜</span>";
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        togglePanel();
      });
      wrap.appendChild(btn);
      bar.appendChild(wrap);
    }

    if (!noteEl || noteEl.parentNode !== bar) {
      noteEl = document.createElement("div");
      noteEl.id = NOTE_ID;
      noteEl.setAttribute("role", "status");
      noteEl.setAttribute("aria-live", "polite");
      bar.appendChild(noteEl);
    }
    bindDoc();
  }

  /* =====================================================================
   * 고르는 창
   * ===================================================================== */
  function isOpen() {
    return !!(panel && panel.parentNode);
  }

  function closePanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function openPanel() {
    if (!wrap || isOpen()) return;
    injectStyle();
    panel = document.createElement("div");
    panel.className = "tl-gd-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "날짜로 가기");
    panel.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    var t = document.createElement("div");
    t.className = "tl-gd-title";
    t.textContent = "날짜로 가기";
    panel.appendChild(t);

    var input = document.createElement("input");
    input.type = "date";
    input.value = todayStr();
    input.max = todayStr(); /* ★오늘 이후는 아예 못 고르게 막습니다★ */
    input.setAttribute("aria-label", "옮겨갈 날짜");
    panel.appendChild(input);

    var help = document.createElement("div");
    help.className = "tl-gd-help";
    help.textContent = "그 날짜가 화면 가운데 오도록 옮깁니다. 너무 먼 과거면 봉 간격을 자동으로 넓힙니다.";
    panel.appendChild(help);

    var row = document.createElement("div");
    row.className = "tl-gd-row";
    var cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "취소";
    cancel.addEventListener("click", closePanel);
    var go = document.createElement("button");
    go.type = "button";
    go.className = "go";
    go.textContent = "이동";
    go.addEventListener("click", function () {
      var v = input.value;
      closePanel();
      goTo(v);
    });
    row.appendChild(cancel);
    row.appendChild(go);
    panel.appendChild(row);

    input.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") go.click();
    });

    wrap.appendChild(panel);
    btn.setAttribute("aria-expanded", "true");
    clampPanel();
    try {
      input.focus();
    } catch (e) {
      /* 무시 */
    }
  }

  /* 창을 화면 안으로 넣습니다 (js/interval-more.js 와 같은 처리).
     기본은 버튼 ★위쪽★ 입니다 — 이 줄이 화면 아래쪽에 있어서
     아래로 열면 잘립니다. 위쪽도 모자라면 아래로 뒤집습니다. */
  function clampPanel() {
    if (!isOpen()) return;
    try {
      panel.style.left = "0px";
      var vw = document.documentElement.clientWidth;
      var r = panel.getBoundingClientRect();
      var shift = 0;
      if (r.right > vw - 8) shift = vw - 8 - r.right;
      if (r.left + shift < 8) shift = 8 - r.left;
      if (shift) panel.style.left = Math.round(shift) + "px";

      var vh = document.documentElement.clientHeight;
      var br = btn.getBoundingClientRect();
      var r2 = panel.getBoundingClientRect();
      if (r2.top < 8 && br.bottom + r2.height + 6 <= vh - 8) {
        panel.style.bottom = "auto";
        panel.style.top = "calc(100% + 6px)";
      }
    } catch (e) {
      /* 무시 */
    }
  }

  function togglePanel() {
    if (isOpen()) closePanel();
    else openPanel();
  }

  var docBound = false;
  function bindDoc() {
    if (docBound) return;
    docBound = true;
    document.addEventListener("click", function () {
      if (isOpen()) closePanel();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen()) closePanel();
    });
    window.addEventListener("resize", clampPanel);
  }

  /* =====================================================================
   * 실제로 옮기기
   * ===================================================================== */
  function pickInterval(distanceSec) {
    for (var i = 0; i < LADDER.length; i++) {
      var sec = intervalSeconds(LADDER[i]);
      if (distanceSec / sec <= MAX_BARS) return LADDER[i];
    }
    return LADDER[LADDER.length - 1];
  }

  function goTo(dateStr) {
    if (off) return;
    if (!dateStr) {
      note("날짜를 고르지 않았습니다");
      return;
    }
    var parts = String(dateStr).split("-");
    if (parts.length !== 3) {
      note("날짜를 읽지 못했습니다: " + dateStr);
      return;
    }
    var target = Math.floor(
      new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 0, 0, 0).getTime() / 1000
    );
    var now = Math.floor(Date.now() / 1000);
    var future = false;
    if (target > now) {
      /* 입력칸 max 로 막고 있지만, 직접 부를 수도 있으니 여기서도 답을 줍니다.
         ⚠ 여기서 note() 를 바로 쓰면 뒤따라오는 "불러오는 중…" 이 덮어써서
           회원이 못 봅니다 — 그래서 표만 세워 두고 ★마지막 안내문★ 에 넣습니다. */
      future = true;
      target = now;
    }

    var chart = getChart();
    if (!chart) {
      note("차트가 아직 준비되지 않았습니다 — 잠시 뒤 다시 눌러 주세요");
      return;
    }

    var want = pickInterval(Math.max(now - target, 60));
    var sec = intervalSeconds(want);
    var my = ++token;
    var changed = switchInterval(want);
    note(
      (changed ? "봉 간격을 " + labelOf(want) + "으로 맞췄습니다 — " : "") + "불러오는 중…"
    );

    var tries = 0;
    var lastLen = -1;
    var stable = 0;

    (function wait() {
      if (off || my !== token) return;
      var d = seriesData();
      if (dataMatches(d, sec)) {
        if (d[0].time <= target) return land(d, target, want, sec, future);
        if (d.length === lastLen) stable++;
        else stable = 0;
        lastLen = d.length;
        if (stable >= 6) return land(d, target, want, sec, future); /* 더 이상 안 늘어남 */
      }
      if (++tries > 70) {
        note("데이터를 제때 받지 못했습니다 — 다시 눌러 주세요");
        return;
      }
      setTimeout(wait, 120);
    })();
  }

  function land(d, target, want, sec, future) {
    var chart = getChart();
    if (!chart) return;
    var first = d[0].time;
    var last = d[d.length - 1].time;
    var short = target < first;
    var center = short ? first : target;

    /* 고른 날짜가 화면 가운데 오도록 앞뒤로 50봉씩 */
    var from = center - sec * 50;
    var to = center + sec * 50;
    if (from < first) {
      from = first;
      to = Math.min(last, first + sec * 100);
    }
    if (to > last) {
      to = last;
      from = Math.max(first, last - sec * 100);
    }
    var shown = 0;
    for (var i = 0; i < d.length; i++) if (d[i].time >= from && d[i].time <= to) shown++;

    try {
      chart.timeScale().setVisibleRange({ from: from, to: to });
    } catch (e) {
      try {
        chart.timeScale().fitContent();
      } catch (e2) {
        /* 무시 */
      }
    }

    if (future) {
      note("오늘 이후는 아직 없습니다 — 오늘(" + ymd(target) + ")로 옮겼습니다 (" +
        labelOf(want) + " " + shown + "개)");
    } else if (short) {
      /* ★아무 일도 안 일어남을 만들지 않습니다★ */
      note(
        "우리가 가진 값은 " + ymd(first) + " 부터입니다 — 그 시점으로 옮겼습니다 (" +
          labelOf(want) + " " + shown + "개)"
      );
    } else {
      note(ymd(target) + " 로 옮겼습니다 (" + labelOf(want) + " " + shown + "개 · " +
        ymd(from) + " ~ " + ymd(to) + ")");
    }
  }

  /* =====================================================================
   * 줄이 날아가면 다시 붙입니다
   * ===================================================================== */
  function observe() {
    var host = document.querySelector(".chart-panel");
    if (!host || observer) return;
    observer = new MutationObserver(function () {
      if (off) return;
      var bar = document.getElementById(BAR_ID);
      if (!bar || !wrap || wrap.parentNode !== bar) paint();
    });
    observer.observe(host, { childList: true });
  }

  function start() {
    if (off) return;
    paint();
    observe();
  }

  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        setTimeout(start, 0);
      });
    } else {
      setTimeout(start, 0);
    }
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
    goTo: goTo,
    pickInterval: pickInterval,
    open: openPanel,
    close: closePanel,
    disable: function () {
      off = true;
      closePanel();
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
