/* =========================================================================
 * js/chart-indicator-menu.js — App.ChartIndicatorMenu
 * =========================================================================
 * 가로 막대의 "fx 지표" 버튼을 엽니다 (준비중 9개 중 첫 번째).
 *
 * ── 새로 만든 것이 없습니다. 이미 있는 것에 얹기만 합니다 ──────────────
 * 지표 계산·그리기는 이미 다 되어 있습니다.
 *   js/chart-indicators.js   MA(7) · MA(25) · MA(99) · 볼린저 · 거래량
 *   js/chart-oscillators.js  RSI · MACD
 * 그런데 켜는 곳이 차트 왼쪽 위 작은 글자 버튼 줄(.tl-ind-bar) 하나뿐이라
 * 무엇이 무엇인지(기간이 몇인지) 알 수 없었고, fx 버튼은 "준비중" 인 채로
 * 잠겨 있었습니다. 이 파일은 그 버튼을 눌렀을 때 뜨는 목록만 만듭니다.
 *
 * 계산식·색·기간을 여기서 다시 정하지 않습니다. 전부 저쪽에서 읽어옵니다
 * (App.ChartIndicators.COLORS / MA_PERIODS / BB_PERIOD / BB_MULT,
 *  App.ChartOscillators.COLORS / RSI_PERIOD / MACD_*).
 * 켜고 끄는 것도 저쪽 공개 함수(toggle / isOn) 로만 합니다.
 * 그래서 이 파일이 사라져도 지표는 그대로 동작합니다.
 *
 * ── 이미 있는 버튼 줄(.tl-ind-bar)은 그대로 둡니다 ────────────────────
 * 지우지 않았습니다. 그 줄은 바이낸스의 차트 위 범례와 같은 자리라
 * "지금 무엇이 켜져 있나" 를 한눈에 보여주는 역할을 합니다.
 * 이 목록은 "무엇을 켤 수 있나" 를 보여주는 자리라 역할이 다릅니다.
 * 둘은 같은 상태를 보므로 한쪽에서 켜면 다른 쪽도 같이 바뀝니다.
 *
 * ── 바이낸스와 맞춘 것 (2026-08-27 실측) ──────────────────────────────
 * binance.com/en/futures/BTCUSDT, 1440px 에서 확인했습니다.
 *   · 차트 위 범례가 "MA(7) / MA(25) / MA(99)" 처럼 기간을 괄호로 적습니다.
 *     그래서 목록도 같은 표기를 씁니다.
 *   · 지표는 "주 차트에 겹치는 것" 과 "아래 별도 칸" 으로 나뉩니다.
 *     RSI·MACD 는 아래 칸이라 목록에서도 나눠 적습니다.
 *   · 2026-08-27 다시 열어 차트 머리줄 버튼의 목록을 실제로 띄워 쟀습니다
 *     (봉 종류 목록. 지표 목록도 같은 껍데기를 씁니다).
 *       버튼 16x16 @(345,220) → 목록 136x172 @(285,240)
 *       버튼 아래끝 236 → 목록 위끝 240 = 아래로 4px
 *       목록 가운데 353 = 버튼 가운데 353 → 좌우는 버튼 한가운데
 *       줄 한 칸 136x38 · 안쪽 여백 8px 10px · 글자 14px/500 · #EAECEF
 *       모서리 12px · 테두리 없음 · 배경 #202630 · 그림자 있음
 *     우리가 따라간 것 — 아래 4px · 버튼 한가운데 · 줄 높이 38px
 *     우리가 안 따라간 것과 이유 —
 *       배경/글자색: #202630·#EAECEF 은 우리 팔레트에 없습니다. 카드 #101727 ·
 *                    본문 #E7ECF5 을 씁니다(같은 자리에 쓰는 색).
 *       모서리 12px: 우리 규칙이 10px(상한 12px) 이라 10px.
 *       그림자     : 우리는 그림자를 쓰지 않습니다. 대신 테두리 1px #1D273B 와
 *                    카드 위쪽 흰색 3% 얇은 선으로 띄웁니다.
 *       글자 14px  : 이름 옆에 한글 설명이 같이 들어가서 250px 안에 14px 이
 *                    안 들어갑니다. 이름 13px / 설명 11px 로 낮췄습니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * 시세 틱을 아예 듣지 않습니다. 목록이 닫혀 있으면 DOM 도 없습니다
 * (열 때 만들고 닫을 때 지웁니다). 켜고 끄는 계산은 전부 저쪽 파일에서
 * 일어나므로 이 파일 때문에 늘어나는 계산은 0 입니다.
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-indicator-menu.js"></script> 삭제
 *   2) js/chart-drawings.js 의 TOP_TOOLS 에서 fx 의 ready:true -> false
 *      (그 줄 바로 위 주석에 적어 두었습니다)
 *   3) js/chart-drawings.js onButton() 의 fx 세 줄 삭제
 *   4) tests/chart-toolbar-seal.test.js 의 가로 막대 준비중 개수 3 -> 4
 *   5) js/chart-indicator-menu.js 파일 삭제
 * 그러면 fx 버튼이 다시 "준비중" 으로 돌아갑니다. 지표 자체는 영향 없습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorMenu = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다. 새 색을 만들지 않습니다. */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";
  var C_PAGE = "#0A0F1C";

  var STYLE_ID = "chart-indicator-menu-style";
  var PANEL_ID = "tl-fx-menu";

  var panel = null;
  var anchorBtn = null;
  var docBound = false;

  function IND() {
    return App.ChartIndicators || null;
  }
  function OSC() {
    return App.ChartOscillators || null;
  }

  function num(v, fallback) {
    return typeof v === "number" && isFinite(v) ? v : fallback;
  }

  /* ---------------------------------------------------------------------
   * 목록 — 이름표에 들어갈 숫자(기간)는 지표 파일에서 읽습니다.
   * 여기에 7 · 25 · 99 같은 숫자를 적어 두면 저쪽이 바뀔 때 목록만
   * 옛날 숫자를 보여주는 "조용한 고장" 이 됩니다.
   * ------------------------------------------------------------------- */
  function rows() {
    var ind = IND();
    var osc = OSC();
    var out = [];

    if (ind) {
      var P = ind.MA_PERIODS || {};
      var C = ind.COLORS || {};
      out.push({ g: "main", who: "ind", key: "ma7", name: "MA(" + num(P.ma7, 7) + ")", color: C.ma7 || C_POINT, note: "이동평균" });
      out.push({ g: "main", who: "ind", key: "ma25", name: "MA(" + num(P.ma25, 25) + ")", color: C.ma25 || C_TEXT, note: "이동평균" });
      out.push({ g: "main", who: "ind", key: "ma99", name: "MA(" + num(P.ma99, 99) + ")", color: C.ma99 || C_MUTED, note: "이동평균" });
      out.push({
        g: "main",
        who: "ind",
        key: "bb",
        name: "BOLL(" + num(ind.BB_PERIOD, 20) + ", " + num(ind.BB_MULT, 2) + ")",
        color: C.bb || C_MUTED,
        note: "볼린저밴드"
      });
      out.push({ g: "main", who: "ind", key: "vol", name: "VOL", color: C_POINT, note: "거래량" });
    }
    if (osc) {
      var OC = osc.COLORS || {};
      out.push({ g: "sub", who: "osc", key: "rsi", name: "RSI(" + num(osc.RSI_PERIOD, 14) + ")", color: OC.rsi || C_TEXT, note: "상대강도" });
      out.push({
        g: "sub",
        who: "osc",
        key: "macd",
        name: "MACD(" + num(osc.MACD_FAST, 12) + ", " + num(osc.MACD_SLOW, 26) + ", " + num(osc.MACD_SIGNAL, 9) + ")",
        color: OC.signal || C_POINT,
        note: "수렴·확산"
      });
    }
    return out;
  }

  function mod(who) {
    return who === "osc" ? OSC() : IND();
  }

  function isOn(r) {
    var m = mod(r.who);
    try {
      return !!(m && m.isOn && m.isOn(r.key));
    } catch (e) {
      return false;
    }
  }

  function flip(r) {
    var m = mod(r.who);
    if (!m || typeof m.toggle !== "function") return;
    try {
      m.toggle(r.key);
    } catch (e) {
      /* 지표 쪽에서 막히면 목록만 조용히 그대로 둡니다 */
    }
  }

  /* ---------------------------------------------------------------------
   * 생김새 — 그림자를 쓰지 않습니다. 카드 위쪽에 흰색 3% 얇은 선만 넣습니다.
   * 모서리 10px (상한 12px).
   * ------------------------------------------------------------------- */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var P = "#" + PANEL_ID;
    var css =
      P + "{position:absolute;z-index:40;width:250px;max-width:calc(100% - 12px);" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "box-shadow:none;overflow:hidden;font-family:inherit;box-sizing:border-box;}" +
      P + "::before{content:\"\";position:absolute;left:0;right:0;top:0;height:1px;" +
      "background:rgba(255,255,255,.03);pointer-events:none;}" +
      P + " .tl-fx-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:9px 12px 7px;border-bottom:1px solid " + C_BORDER + ";}" +
      P + " .tl-fx-title{font-size:12px;font-weight:700;color:" + C_TEXT + ";letter-spacing:.2px;}" +
      P + " .tl-fx-x{background:none;border:0;color:" + C_MUTED + ";font-size:14px;line-height:1;" +
      "cursor:pointer;padding:3px 5px;border-radius:4px;font-family:inherit;}" +
      P + " .tl-fx-x:hover{color:" + C_TEXT + ";}" +
      P + " .tl-fx-group{padding:8px 12px 3px;font-size:10px;font-weight:700;" +
      "color:" + C_MUTED + ";letter-spacing:.4px;}" +
      /* 줄 높이 38px — 바이낸스 실측과 같은 값 (아래 주석의 실측표 참고) */
      P + " .tl-fx-row{width:100%;display:flex;align-items:center;gap:8px;background:none;" +
      "border:0;padding:10px 12px;cursor:pointer;text-align:left;font-family:inherit;}" +
      P + " .tl-fx-row:hover{background:" + C_TILE + ";}" +
      P + " .tl-fx-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:" + C_BORDER + ";}" +
      P + " .tl-fx-name{flex:1 1 auto;min-width:0;font-size:13px;line-height:18px;font-weight:600;" +
      "color:" + C_MUTED + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      P + " .tl-fx-note{font-size:11px;line-height:18px;font-weight:500;color:" + C_MUTED + ";" +
      "flex:0 0 auto;opacity:.75;}" +
      P + " .tl-fx-sw{flex:0 0 auto;width:26px;height:14px;border-radius:7px;" +
      "background:" + C_BORDER + ";position:relative;transition:background .12s;}" +
      P + " .tl-fx-sw i{position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;" +
      "background:" + C_MUTED + ";transition:left .12s,background .12s;}" +
      P + " .tl-fx-row[aria-pressed=\"true\"] .tl-fx-name{color:" + C_TEXT + ";}" +
      P + " .tl-fx-row[aria-pressed=\"true\"] .tl-fx-sw{background:" + C_POINT + ";}" +
      P + " .tl-fx-row[aria-pressed=\"true\"] .tl-fx-sw i{left:14px;background:" + C_PAGE + ";}" +
      P + " .tl-fx-foot{padding:7px 12px 9px;border-top:1px solid " + C_BORDER + ";" +
      "font-size:10px;color:" + C_MUTED + ";line-height:1.5;}" +
      /* 차트 칸이 낮은 폰에서 목록이 칸 밖으로 나가지 않게 — 몸통만 스크롤 */
      P + " .tl-fx-list{overflow-y:auto;overscroll-behavior:contain;}" +
      P + " .tl-fx-list::-webkit-scrollbar{width:3px;}" +
      P + " .tl-fx-list::-webkit-scrollbar-thumb{background:" + C_BORDER + ";border-radius:2px;}" +
      P + " .tl-fx-list::-webkit-scrollbar-track{background:transparent;}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function paint() {
    if (!panel) return;
    var list = panel.querySelectorAll(".tl-fx-row");
    var on;
    var i;
    for (i = 0; i < list.length; i++) {
      var el = list[i];
      on = isOn({ who: el.getAttribute("data-who"), key: el.getAttribute("data-key") });
      el.setAttribute("aria-pressed", on ? "true" : "false");
      var dot = el.querySelector(".tl-fx-dot");
      if (dot) dot.style.background = on ? el.getAttribute("data-color") : C_BORDER;
    }
    var n = 0;
    var rs = rows();
    for (i = 0; i < rs.length; i++) if (isOn(rs[i])) n++;
    var foot = panel.querySelector(".tl-fx-foot");
    if (foot) {
      foot.textContent =
        n === 0
          ? "켜진 지표가 없습니다. 눌러서 켜면 차트에 바로 그려집니다."
          : "켜진 지표 " + n + "개. 꺼진 지표는 계산도 하지 않습니다.";
    }
  }

  function host() {
    return document.querySelector(".chart-panel") || null;
  }

  function build() {
    injectStyle();
    var h = host();
    if (!h) return null;
    /* style.css 를 고치지 않고 이 요소에만 기준점을 줍니다
       (js/chart-indicators.js 가 .chart-wrap 에 하는 것과 같은 방식) */
    if (!h.style.position) {
      var cs = null;
      try {
        cs = window.getComputedStyle(h);
      } catch (e) {
        cs = null;
      }
      if (!cs || cs.position === "static") h.style.position = "relative";
    }

    var p = document.createElement("div");
    p.id = PANEL_ID;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "지표 켜기 끄기");

    var head = document.createElement("div");
    head.className = "tl-fx-head";
    var t = document.createElement("span");
    t.className = "tl-fx-title";
    t.textContent = "지표";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "tl-fx-x";
    x.setAttribute("aria-label", "지표 목록 닫기");
    x.textContent = "✕";
    x.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
    head.appendChild(t);
    head.appendChild(x);
    p.appendChild(head);

    var list = document.createElement("div");
    list.className = "tl-fx-list";

    var lastGroup = null;
    rows().forEach(function (r) {
      if (r.g !== lastGroup) {
        lastGroup = r.g;
        var g = document.createElement("div");
        g.className = "tl-fx-group";
        g.textContent = r.g === "main" ? "주 차트" : "아래 별도 칸";
        list.appendChild(g);
      }
      var row = document.createElement("button");
      row.type = "button";
      row.className = "tl-fx-row";
      row.setAttribute("data-who", r.who);
      row.setAttribute("data-key", r.key);
      row.setAttribute("data-color", r.color);
      row.setAttribute("aria-pressed", "false");

      var dot = document.createElement("span");
      dot.className = "tl-fx-dot";
      var nm = document.createElement("span");
      nm.className = "tl-fx-name";
      nm.textContent = r.name;
      var note = document.createElement("span");
      note.className = "tl-fx-note";
      note.textContent = r.note;
      var sw = document.createElement("span");
      sw.className = "tl-fx-sw";
      sw.appendChild(document.createElement("i"));

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.appendChild(sw);
      row.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        flip(r);
        paint();
      });
      list.appendChild(row);
    });
    p.appendChild(list);

    var foot = document.createElement("div");
    foot.className = "tl-fx-foot";
    p.appendChild(foot);

    h.appendChild(p);
    return p;
  }

  /* ---------------------------------------------------------------------
   * 자리 잡기 — fx 버튼 바로 아래. 좁은 화면에서 오른쪽으로 넘치면
   * 안쪽으로 당깁니다 (360 에서 잘리지 않게).
   * ------------------------------------------------------------------- */
  function place() {
    if (!panel) return;
    var h = host();
    if (!h || !h.getBoundingClientRect) return;
    var hr = h.getBoundingClientRect();
    var top = 8;
    var left = 8;
    if (anchorBtn && anchorBtn.getBoundingClientRect) {
      var br = anchorBtn.getBoundingClientRect();
      /* 버튼 아래 4px — 바이낸스 실측(버튼 아래끝 236 -> 목록 위끝 240)과 같습니다 */
      top = br.bottom - hr.top + 4;
      /* 좌우는 버튼 한가운데 — 바이낸스도 가운데에 맞춥니다
         (실측: 버튼 가운데 353, 목록 가운데 (285+421)/2 = 353) */
      left = (br.left + br.right) / 2 - hr.left - (panel.offsetWidth || 250) / 2;
    }
    var w = panel.offsetWidth || 250;
    var max = hr.width - w - 6;
    if (left > max) left = max;
    if (left < 6) left = 6;
    if (top < 4) top = 4;

    /* ── 이미 있는 지표 막대를 가리지 않습니다 ──────────────────────────
     * 차트 왼쪽 위 작은 글자 줄(.tl-ind-bar)은 "지금 무엇이 켜져 있나" 를
     * 보여주는 자리입니다. 목록이 그 위를 덮으면 켜고 끄는 동안 결과가
     * 안 보입니다. 그래서 그 줄 아래에서 시작합니다.
     * 줄이 여러 줄로 접히는 좁은 화면도 실제 높이를 재서 따라갑니다.
     * ----------------------------------------------------------------- */
    var indBar = document.querySelector(".tl-ind-bar");
    if (indBar && indBar.getBoundingClientRect) {
      var ir = indBar.getBoundingClientRect();
      if (ir.width > 0 && ir.height > 0) {
        var indBottom = ir.bottom - hr.top + 4;
        var xHit = left < ir.right - hr.left && left + w > ir.left - hr.left;
        if (xHit && top < indBottom) top = indBottom;
      }
    }

    /* 차트 칸 아래로 넘치면 목록 몸통만 줄여서 안에 넣습니다 */
    var listEl = panel.querySelector(".tl-fx-list");
    if (listEl) {
      var room = hr.height - top - 8;
      var chrome = panel.offsetHeight - listEl.offsetHeight;
      var avail = room - chrome;
      if (avail > 60 && listEl.offsetHeight > avail) listEl.style.maxHeight = Math.round(avail) + "px";
      else listEl.style.maxHeight = "";
    }

    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";
  }

  function onDocDown(ev) {
    if (!panel) return;
    var t = ev.target;
    if (panel.contains && panel.contains(t)) return;
    if (anchorBtn && anchorBtn.contains && anchorBtn.contains(t)) return;
    close();
  }

  function onKey(ev) {
    if (ev.key === "Escape" || ev.keyCode === 27) close();
  }

  function bindDoc(on) {
    if (on === docBound) return;
    docBound = on;
    if (on) {
      document.addEventListener("mousedown", onDocDown, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", place);
    } else {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", place);
    }
  }

  function isOpen() {
    return !!panel;
  }

  function open(btn) {
    if (panel) close();
    anchorBtn = btn || document.querySelector('.tlc-toolbar .tlc-btn[data-tlc="fx"]');
    panel = build();
    if (!panel) return false;
    paint();
    place();
    bindDoc(true);
    if (anchorBtn && anchorBtn.setAttribute) anchorBtn.setAttribute("aria-pressed", "true");
    return true;
  }

  function close() {
    bindDoc(false);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    if (anchorBtn && anchorBtn.setAttribute) anchorBtn.setAttribute("aria-pressed", "false");
    anchorBtn = null;
  }

  function toggle(btn) {
    if (panel) {
      close();
      return false;
    }
    return open(btn);
  }

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    /* 확인용 */
    getRowsForTest: rows,
    PANEL_ID: PANEL_ID
  };
})();
