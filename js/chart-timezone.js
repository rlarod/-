/* =========================================================================
 * js/chart-timezone.js — App.ChartTimezone
 * =========================================================================
 * 차트 아래 오른쪽의 "차트 시각" 시계 + 시간대 고르기입니다.
 * 트레이딩뷰 차트 하단 오른쪽(time-zone-menu)을 따라간 것입니다.
 * 2026-09-02 에 트레이딩뷰를 직접 열어 확인했습니다 — BINANCE:BTCUSDT.P 에서
 * 오른쪽 아래에 ★"10:02:16 UTC"★ 처럼 ★시간대 이름을 같이★ 보여 줍니다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ★먼저 잰 사실 — 지금 우리 차트는 UTC 입니다 (2026-09-02 실측)★
 * ─────────────────────────────────────────────────────────────────────
 *   Lightweight Charts 5.2.0 번들에는 시간 글자를 만드는 자리에
 *   getUTCFullYear 7곳 · getUTCHours 2곳만 있고 getHours 는 0곳입니다.
 *   → 라이브러리가 ★UTC 로만★ 눈금을 그립니다(공식 문서에도 시간대 기능이
 *     없다고 적혀 있고, "타임스탬프를 직접 옮겨라" 고 안내합니다).
 *
 *   실측 대조 — 마지막 봉 1788344820
 *     차트 눈금            2026-09-02 10:27  (UTC)
 *     내 컴퓨터·거래내역    2026-09-02 19:27  (KST, 9시간 차이)
 *
 *   즉 ★이 파일을 만들기 전부터★ 차트(UTC)와 거래내역(내 컴퓨터 시간)이
 *   9시간 어긋나 있었고, 화면 어디에도 그게 적혀 있지 않았습니다.
 *   js/trade-history.js:79 · js/utils.js:138 은 d.getHours() — 내 컴퓨터 시간입니다.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ★무엇을 바꾸고 무엇을 안 바꾸는가 — 이 결정이 이 파일에서 제일 중요합니다★
 * ─────────────────────────────────────────────────────────────────────
 *   바꾸는 것    ★차트의 눈금 글자와 십자선 글자★ 뿐입니다 (보이는 글자만)
 *   안 바꾸는 것  · 봉이 놓이는 자리(시각 그 자체)
 *                 · 거래내역 · 체결 시각 · 주문 시각 (서버 값입니다)
 *                 · 회원이 그려 둔 선 · 진입가 · 청산가 가로선
 *
 *   ★왜 차트만인가★
 *     ① 거래 기록은 서버 값입니다. 화면에서 함부로 옮기면 회원이 "내 주문이
 *        딴 시간에 찍혔다" 고 오해합니다. 그건 P1(잘못된 정보로 판단) 입니다.
 *     ② 봉의 타임스탬프를 옮기는 방법(라이브러리 공식 안내)은 쓰지 않았습니다.
 *        타임스탬프를 옮기면 ★회원이 그려 둔 선·알람★ 이 그 자리에 그대로
 *        남아 봉과 어긋납니다. 그리기 자료는 시각으로 저장되기 때문입니다.
 *        글자만 바꾸면 그런 일이 없습니다.
 *
 *   ★기본값은 UTC 입니다 — 오늘까지와 똑같습니다★
 *     · 트레이딩뷰도 이 종목에서 기본이 UTC 입니다(위 실측)
 *     · 기본값에서는 ★서식 함수를 아예 걸지 않습니다★. 그래서 아무도 안
 *       건드리면 화면 글자가 오늘과 한 글자도 다르지 않습니다
 *     · 대신 시계 옆에 ★UTC★ 라고 항상 적습니다. 안 적힌 게 문제였습니다
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/chart-timezone.js"></script> 한 줄 삭제
 *   2) rm js/chart-timezone.js
 *   3) 회원 브라우저에 남은 선택값은 localStorage 의
 *      btc_sim_v2_chart-timezone 하나뿐이라, 파일이 없으면 아무 일도 안 합니다
 *   실행 중에 잠깐 끄려면 콘솔에서 App.ChartTimezone.disable()
 * ========================================================================= */

window.App = window.App || {};

App.ChartTimezone = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다 */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  var BAR_ID = "tl-chart-bottombar";
  var STYLE_ID = "tl-chart-tz-css";
  var WRAP_ID = "tl-tz-wrap";
  var STORAGE_KEY = "chart-timezone";

  function localZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch (e) {
      return "UTC";
    }
  }

  /* 고를 수 있는 시간대. 첫 번째가 기본값입니다. */
  var ZONES = [
    { id: "UTC", tz: "UTC", label: "UTC", desc: "세계 표준시 (기본값 · 지금까지와 같음)" },
    { id: "KST", tz: "Asia/Seoul", label: "한국", desc: "UTC+9 — 거래내역과 같은 시간" },
    { id: "LOCAL", tz: null, label: "내 컴퓨터 시간", desc: "이 컴퓨터에 설정된 시간대" },
    { id: "NY", tz: "America/New_York", label: "뉴욕", desc: "미국 동부 (서머타임 자동)" },
    { id: "LON", tz: "Europe/London", label: "런던", desc: "영국 (서머타임 자동)" },
  ];

  var off = false;
  var wrap = null;
  var btn = null;
  var menu = null;
  var observer = null;
  var clockTimer = null;
  var current = "UTC";
  var appliedTo = null; /* 어느 차트 객체에 걸어 뒀는지 */
  var touched = false; /* 회원이 시간대를 한 번이라도 건드렸는가 */

  function zoneOf(id) {
    for (var i = 0; i < ZONES.length; i++) if (ZONES[i].id === id) return ZONES[i];
    return ZONES[0];
  }

  function tzOf(id) {
    var z = zoneOf(id);
    return z.tz || localZone();
  }

  /* 화면에 적는 짧은 이름 — "10:27 UTC" 처럼 뒤에 붙습니다 */
  function shortName(id) {
    if (id === "UTC") return "UTC";
    if (id === "KST") return "KST";
    if (id === "NY") return "뉴욕";
    if (id === "LON") return "런던";
    var tz = localZone();
    if (tz === "Asia/Seoul") return "KST";
    return tz;
  }

  /* =====================================================================
   * 시간대별 시각 쪼개기 — 서머타임은 Intl 이 알아서 처리합니다
   * ===================================================================== */
  var fmtCache = {};
  function partsIn(tz, ms) {
    var f = fmtCache[tz];
    if (!f) {
      f = new Intl.DateTimeFormat("en-GB", {
        timeZone: tz,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
      fmtCache[tz] = f;
    }
    var out = {};
    var list = f.formatToParts(new Date(ms));
    for (var i = 0; i < list.length; i++) {
      if (list[i].type !== "literal") out[list[i].type] = list[i].value;
    }
    if (out.hour === "24") out.hour = "00"; /* en-GB 가 자정을 24 로 줄 때가 있습니다 */
    return out;
  }

  function timeToMs(time) {
    /* 우리 데이터는 숫자(초)입니다. 라이브러리가 {year,month,day} 를 줄 수도 있어
       그 경우도 받아 둡니다 — 안 받으면 눈금이 "undefined" 로 나옵니다. */
    if (typeof time === "number") return time * 1000;
    if (time && typeof time === "object" && time.year) {
      return Date.UTC(time.year, (time.month || 1) - 1, time.day || 1);
    }
    return Date.now();
  }

  /* =====================================================================
   * 차트에 걸기 / 떼기
   * ⚠ 기본값(UTC)일 때는 ★아무 것도 걸지 않습니다★ — 오늘 화면 그대로입니다.
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

  function applyToChart() {
    var chart = getChart();
    if (!chart) return false;
    var T = window.LightweightCharts && LightweightCharts.TickMarkType;
    if (!T) return false;
    var tz = tzOf(current);

    /* ★아무도 시간대를 안 만졌으면 손대지 않습니다★ — 오늘 화면 그대로입니다 */
    if (current === "UTC" && !touched) {
      appliedTo = chart;
      return true;
    }

    /* ⚠ 실측으로 확인한 것 — 한 번 건 서식 함수는 ★뗄 수가 없습니다★.
       chart.applyOptions({timeScale:{tickMarkFormatter:undefined}}) 를 불러도
       라이브러리가 undefined 를 "안 바꿈" 으로 보고 무시합니다(실측: 되돌린 뒤에도
       typeof 가 계속 function 이었습니다). 그래서 UTC 로 돌아올 때는 떼는 대신
       ★UTC 로 그리는 같은 서식 함수★ 를 겁니다. 시각은 라이브러리 기본과 똑같습니다.
       (달 이름은 locale ko-KR 기준 "9월" 로 라이브러리 기본과 글자까지 같습니다.
        십자선 글자만 "2026-09-02 10:29" 형태로 남습니다 — 시각은 같습니다) */
    touched = true;

    try {
      chart.applyOptions({
        timeScale: {
          tickMarkFormatter: function (time, type) {
            var p = partsIn(tz, timeToMs(time));
            if (type === T.Year) return p.year;
            if (type === T.Month) return String(Number(p.month)) + "월";
            if (type === T.DayOfMonth) return String(Number(p.day));
            if (type === T.TimeWithSeconds) return p.hour + ":" + p.minute + ":" + p.second;
            return p.hour + ":" + p.minute;
          },
        },
        localization: {
          timeFormatter: function (time) {
            var p = partsIn(tz, timeToMs(time));
            return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute;
          },
        },
      });
    } catch (e) {
      return false;
    }
    appliedTo = chart;
    return true;
  }

  /* =====================================================================
   * 저장
   * ===================================================================== */
  function loadSaved() {
    try {
      if (!App.Storage || typeof App.Storage.load !== "function") return;
      var s = App.Storage.load(STORAGE_KEY);
      if (s && s.zone) {
        for (var i = 0; i < ZONES.length; i++) {
          if (ZONES[i].id === s.zone) {
            current = s.zone;
            return;
          }
        }
      }
    } catch (e) {
      /* 무시 — 기본값 UTC 로 갑니다 */
    }
  }

  function save() {
    try {
      if (!App.Storage) return;
      if (current === "UTC") {
        /* 기본값이면 저장칸을 아예 비웁니다 — 남겨 두면 나중에 기본값을
           바꿀 때 옛 값이 계속 살아납니다 */
        if (typeof App.Storage.clear === "function") App.Storage.clear(STORAGE_KEY);
        return;
      }
      if (typeof App.Storage.save === "function") App.Storage.save(STORAGE_KEY, { zone: current });
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 화면
   * ⚠ 팝업 글씨는 크게 씁니다 (대표 지시 — 14px 도 작다고 하셨습니다)
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "#" + WRAP_ID + "{position:relative;display:inline-flex;order:3;margin-left:auto;}" +
      "#" + WRAP_ID + " .tl-tz-btn{display:inline-flex;align-items:center;gap:6px;" +
      "background:" + C_TILE + ";border:1px solid " + C_BORDER + ";color:" + C_MUTED + ";" +
      "padding:5px 10px;border-radius:3px;font-family:var(--mono);font-size:17px;" +
      "font-weight:600;line-height:1.15;cursor:pointer;transition:.12s;white-space:nowrap;}" +
      "#" + WRAP_ID + " .tl-tz-btn:hover{border-color:" + C_MUTED + ";color:" + C_TEXT + ";}" +
      "#" + WRAP_ID + ' .tl-tz-btn[aria-expanded="true"]{border-color:' + C_POINT + ";color:" + C_POINT + ";}" +
      "#" + WRAP_ID + " .tl-tz-btn.custom{color:" + C_POINT + ";border-color:" + C_POINT + ";}" +
      "#" + WRAP_ID + " .tl-tz-btn svg{width:16px;height:16px;flex:0 0 16px;}" +
      ".tl-tz-menu{position:absolute;right:0;bottom:calc(100% + 6px);z-index:70;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "padding:12px;width:300px;max-width:calc(100vw - 24px);" +
      "max-height:calc(100vh - 20px);overflow-y:auto;" +
      "display:flex;flex-direction:column;gap:8px;}" +
      ".tl-tz-menu .tl-tz-title{font-size:17px;color:" + C_TEXT + ";font-weight:700;}" +
      ".tl-tz-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;" +
      "background:" + C_TILE + ";border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";" +
      "border-radius:6px;padding:9px 11px;font-family:var(--mono);font-size:19px;" +
      "font-weight:600;cursor:pointer;text-align:left;width:100%;box-sizing:border-box;}" +
      ".tl-tz-menu button:hover{border-color:" + C_MUTED + ";}" +
      ".tl-tz-menu button.on{background:rgba(240,180,41,.12);border-color:" + C_POINT + ";" +
      "color:" + C_POINT + ";}" +
      ".tl-tz-menu button i{font-style:normal;font-size:15px;font-weight:500;color:" + C_MUTED + ";}" +
      ".tl-tz-menu button.on i{color:" + C_POINT + ";}" +
      ".tl-tz-menu .tl-tz-warn{font-size:15px;color:" + C_MUTED + ";line-height:1.45;" +
      "border-top:1px solid " + C_BORDER + ";padding-top:8px;}" +
      ".tl-tz-menu .tl-tz-warn b{color:" + C_TEXT + ";font-weight:700;}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function clockSvg() {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path></svg>'
    );
  }

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

  function tickClock() {
    if (!btn) return;
    var p = partsIn(tzOf(current), Date.now());
    var label = btn.querySelector("span");
    if (label) {
      label.textContent = "차트 시각 " + p.hour + ":" + p.minute + ":" + p.second + " " + shortName(current);
    }
    btn.className = "tl-tz-btn" + (current === "UTC" ? "" : " custom");
    btn.setAttribute(
      "title",
      "차트 표시 시간대 — 지금 " + shortName(current) + " 입니다. 눌러서 바꿉니다.\n" +
        "차트 눈금과 십자선만 바뀝니다. 거래내역·체결 시각은 그대로입니다."
    );
    btn.setAttribute("aria-label", btn.getAttribute("title"));
  }

  function paint() {
    if (off) return;
    var bar = ensureBar();
    if (!bar) return;
    injectStyle();
    if (!wrap || wrap.parentNode !== bar) {
      closeMenu();
      wrap = document.createElement("span");
      wrap.id = WRAP_ID;
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-tz-btn";
      btn.setAttribute("aria-haspopup", "dialog");
      btn.setAttribute("aria-expanded", "false");
      btn.innerHTML = clockSvg() + "<span>차트 시각</span>";
      btn.addEventListener("click", function (ev) {
        ev.stopPropagation();
        toggleMenu();
      });
      wrap.appendChild(btn);
      bar.appendChild(wrap);
    }
    tickClock();
    if (!clockTimer) clockTimer = setInterval(tickClock, 1000);
    bindDoc();
  }

  /* =====================================================================
   * 고르는 창
   * ===================================================================== */
  function isOpen() {
    return !!(menu && menu.parentNode);
  }

  function closeMenu() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!wrap || isOpen()) return;
    injectStyle();
    menu = document.createElement("div");
    menu.className = "tl-tz-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "차트 표시 시간대");
    menu.addEventListener("click", function (ev) {
      ev.stopPropagation();
    });

    var t = document.createElement("div");
    t.className = "tl-tz-title";
    t.textContent = "차트 표시 시간대";
    menu.appendChild(t);

    ZONES.forEach(function (z) {
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("data-tz", z.id);
      var name = document.createElement("span");
      var p = partsIn(z.tz || localZone(), Date.now());
      name.textContent = z.label + "  " + p.hour + ":" + p.minute;
      var sub = document.createElement("i");
      sub.textContent = z.desc;
      b.appendChild(name);
      b.appendChild(sub);
      if (z.id === current) b.className = "on";
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        pick(z.id);
      });
      menu.appendChild(b);
    });

    /* ★PM 이 제일 걱정한 자리 — 여기에 분명히 적습니다★ */
    var warn = document.createElement("div");
    warn.className = "tl-tz-warn";
    warn.innerHTML =
      "여기서 바꾸는 것은 <b>차트 눈금과 십자선</b> 뿐입니다.<br>" +
      "<b>거래내역 · 체결 시각 · 주문 시각은 바뀌지 않습니다</b> — 그대로 내 컴퓨터 시간입니다.";
    menu.appendChild(warn);

    wrap.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    clampMenu();
  }

  /* 창을 화면 안으로 넣습니다.
     ⚠ 이 줄은 화면 ★아래쪽★ 에 있어서 창을 위로 엽니다. 그런데 이 창은
       항목이 5개라 키가 큽니다(실측 544px). 800px 높이 화면에서는 위로 열면
       ★위쪽이 166px 잘렸습니다★ — 실제로 재서 발견했고 아래처럼 고쳤습니다.
       ① 위가 잘리면 잘린 만큼 아래로 내립니다(버튼과 겹쳐도 괜찮습니다)
       ② 그래도 안 들어가면 CSS 의 max-height 로 안에서 스크롤합니다 */
  function clampMenu() {
    if (!isOpen()) return;
    try {
      var vw = document.documentElement.clientWidth;
      var vh = document.documentElement.clientHeight;

      /* 가로 — 기본은 오른쪽 맞춤. 왼쪽이 넘치면 왼쪽 맞춤으로 바꿉니다 */
      menu.style.right = "0px";
      menu.style.left = "auto";
      var r = menu.getBoundingClientRect();
      if (r.left < 8) {
        menu.style.right = "auto";
        menu.style.left = "0px";
        var r1 = menu.getBoundingClientRect();
        var shift = 0;
        if (r1.right > vw - 8) shift = vw - 8 - r1.right;
        if (r1.left + shift < 8) shift = 8 - r1.left;
        if (shift) menu.style.left = Math.round(shift) + "px";
      }

      /* 세로 — px 로 바꿔 놓고 잘린 만큼 내립니다 */
      var base = (wrap.offsetHeight || 0) + 6;
      menu.style.top = "auto";
      menu.style.bottom = base + "px";
      var r2 = menu.getBoundingClientRect();
      if (r2.top < 8) {
        menu.style.bottom = Math.round(base - (8 - r2.top)) + "px";
      }
      var r3 = menu.getBoundingClientRect();
      if (r3.bottom > vh - 8) {
        menu.style.bottom = Math.round(parseFloat(menu.style.bottom) + (r3.bottom - (vh - 8))) + "px";
      }
    } catch (e) {
      /* 무시 */
    }
  }

  function toggleMenu() {
    if (isOpen()) closeMenu();
    else openMenu();
  }

  var docBound = false;
  function bindDoc() {
    if (docBound) return;
    docBound = true;
    document.addEventListener("click", function () {
      if (isOpen()) closeMenu();
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape" && isOpen()) closeMenu();
    });
    window.addEventListener("resize", clampMenu);
  }

  function pick(id) {
    current = zoneOf(id).id;
    closeMenu();
    save();
    applyToChart();
    tickClock();
  }

  /* =====================================================================
   * 줄이 날아가면 다시 붙이고, 차트가 새로 생기면 다시 겁니다
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
    applyToChart();
  }

  function init() {
    loadSaved();
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        setTimeout(start, 0);
      });
    } else {
      setTimeout(start, 0);
    }
    var n = 0;
    var t = setInterval(function () {
      if (off || ++n > 60) return clearInterval(t);
      if (document.querySelector(".chart-panel")) start();
      /* 차트가 늦게 만들어졌거나 새로 만들어졌으면 다시 겁니다 */
      var c = getChart();
      if (c && c !== appliedTo) applyToChart();
      if (c && appliedTo === c && wrap) clearInterval(t);
    }, 250);
  }

  init();

  return {
    ZONES: ZONES,
    getZone: function () {
      return current;
    },
    set: pick,
    STORAGE_KEY: STORAGE_KEY,
    disable: function () {
      off = true;
      closeMenu();
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
      }
      current = "UTC";
      applyToChart();
      if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
      wrap = null;
      btn = null;
    },
  };
})();
