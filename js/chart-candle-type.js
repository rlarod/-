/* =========================================================================
 * js/chart-candle-type.js — App.ChartCandleType
 * =========================================================================
 * 가로 막대의 "봉 종류" 버튼을 엽니다 (준비중 5개 중 하나).
 *
 * ── 무엇을 넣었나 · 왜 그것만인가 (2026-08-28 바이낸스 실측) ───────────
 * binance.com/en/futures/BTCUSDT 를 1440x900 으로 직접 열어
 * Original(바이낸스 자체 차트) 모드의 Chart Style 창을 띄워 세었습니다.
 * 고를 수 있는 것이 정확히 넷이었습니다 — 그래서 우리도 넷입니다.
 *
 *   Candle(기본)  Line   Bars   Area
 *
 *   실측 캡처 : shots/ct5-bnf-charttype.png (목록)
 *               shots/ct5-bnf-line.png · ct5-bnf-bars.png · ct5-bnf-area.png
 *   선 색     : 캔버스 픽셀을 직접 읽어 rgb(240,185,11) = #F0B90B
 *   선 굵기   : 같은 캔버스에서 세로 한 줄씩 잉크량을 재어 2.0px
 *               (700개 열 중 최빈값 2.0 이 129개, 2.5 가 122개)
 *   Area 채움 : 선 바로 아래 알파 0.26 → 아래로 내려가며 0 에 가까워짐
 *   Bars      : 열림(왼쪽)·닫힘(오른쪽) 눈금이 둘 다 있고 색은 캔들과 같음
 *
 * 하이킨아시·할로우 캔들은 넣지 않았습니다 — 바이낸스 Original 차트에
 * 없습니다. "있으면 좋을 것 같아서" 넣지 않습니다.
 * (트레이딩뷰 모드의 목록은 확인하지 못했습니다. 두 번 시도했지만 지표 창이
 *  닫히지 않아 2분 규칙으로 중단했습니다. 보고서에 적었습니다.)
 *
 * ── 색은 우리 팔레트로 바꿔 씁니다 ────────────────────────────────────
 * 바이낸스 금색 #F0B90B 는 우리 확정 팔레트에 없습니다. 같은 자리의
 * 우리 포인트(골드) #F0B429 을 씁니다 (R 같음, G +29, B +30).
 * 오르내림 색(캔들·바)은 새로 정하지 않고 js/chart.js 가 이미 캔들에
 * 쓰고 있는 값을 그 자리에서 읽어옵니다. 숫자를 여기 적어두면 저쪽이
 * 바뀔 때 여기만 옛 색으로 남는 "조용한 고장" 이 됩니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 거기서 라이브러리
 * 공개 API 인 chart.panes()[n].getSeries() 로 캔들 시리즈를 찾습니다.
 * 1단계(chart-position-lines.js)·2단계(chart-indicators.js)·
 * 4단계(chart-drawings.js) 와 같은 방식입니다.
 *
 * ── ⭐ 캔들 시리즈를 갈아끼우지 않습니다 (제일 중요한 부분) ───────────
 * 시리즈를 지웠다 새로 만들면 그 시리즈에 매달린 것이 전부 떨어집니다 —
 *   · 진입가·TP·SL·청산가·미체결 가로선 (createPriceLine)
 *   · 수평선 (chart-drawings)
 *   · 추세선·피보나치·자·채널·브러시 (attachPrimitive)
 *   · MA·볼린저·RSI·MACD 가 종가를 읽어가는 자리 (candleSeries.data())
 * 그래서 캔들 시리즈는 그대로 두고, 색만 투명으로 바꿔 안 보이게 한 뒤
 * 그 위에 라인/바/영역 시리즈를 하나 얹습니다.
 *
 * visible:false 를 쓰지 않은 이유 — 그러면 그 시리즈에 붙은 가로선까지
 * 같이 사라집니다. 투명색은 "보이는 시리즈" 라서 가로선이 그대로 그려집니다.
 * 실제로 확인했습니다 (shots/ct5-probe-line.png — 캔들이 사라진 상태에서
 * 현재가 가로선과 오른쪽 빨간 가격표가 그대로 남아 있습니다).
 *
 * ── 새 값이 들어올 때 전체를 다시 계산하지 않습니다 ───────────────────
 * 캔들 시리즈의 setData / update 를 그 객체에서 감쌉니다.
 * chart.js 가 마지막 봉 하나를 update() 할 때 우리도 딱 그 한 봉만
 * update() 합니다 (전체 다시 계산 0회). 과거 500봉을 setData() 로
 * 통째로 넣을 때만 우리도 한 번 통째로 넣습니다.
 * 봉 종류가 "캔들" 이면 얹은 시리즈가 아예 없어서, 감싼 함수는
 * null 하나 보고 바로 끝납니다 (계산 0).
 *
 * ── 어디에 저장하나 ───────────────────────────────────────────────────
 * App.Storage 키 "chart-candle-type" (실제 키는 btc_sim_v2_chart-candle-type).
 * 종목·봉 간격과 상관없이 하나만 기억합니다 — 바이낸스도 Chart Style 을
 * 종목별로 따로 두지 않고 전체에 한 번 적용합니다(창 안내문에
 * "Chart Style will take precedence over Layout Settings" 라고 적혀 있습니다).
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-candle-type.js"></script> 삭제
 *   2) js/chart-drawings.js 의 TOP_TOOLS 에서 candletype 의 ready:true -> false
 *      (그 줄 바로 위 주석에 적어 두었습니다)
 *   3) js/chart-drawings.js onButton() 의 candletype 네 줄 삭제
 *   4) tests/chart-toolbar-seal.test.js 의 가로 막대 준비중 개수 2 -> 3
 *   5) js/chart-candle-type.js 파일 삭제
 * 그러면 버튼이 다시 "준비중" 으로 돌아갑니다. 회원 브라우저에 남은
 * btc_sim_v2_chart-candle-type 키는 아무 동작도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartCandleType = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다. 새 색을 만들지 않습니다. */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429"; /* 라인·영역 색 — 바이낸스 #F0B90B 자리 */

  /* 영역(Area) 채움 — 바이낸스 실측 알파 0.26 → 아래로 0 에 가깝게 */
  var AREA_TOP = "rgba(240,180,41,0.26)";
  var AREA_BOTTOM = "rgba(240,180,41,0.02)";
  var LINE_WIDTH = 2; /* 바이낸스 실측 2.0px */

  var STORAGE_KEY = "chart-candle-type";
  var STYLE_ID = "chart-candle-type-style";
  var PANEL_ID = "tl-ct-menu";
  var TRANSPARENT = "rgba(0,0,0,0)";

  /* 이름은 바이낸스 목록 순서 그대로입니다 (Candle / Line / Bars / Area) */
  var TYPES = [
    { k: "candle", name: "캔들", note: "기본" },
    { k: "line", name: "라인", note: "종가만" },
    { k: "bar", name: "바", note: "OHLC 막대" },
    { k: "area", name: "영역", note: "라인 + 채움" }
  ];

  function isType(k) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].k === k) return true;
    return false;
  }
  function typeName(k) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].k === k) return TYPES[i].name;
    return "캔들";
  }

  /* ---------------- 상태 ---------------- */
  var chart = null;
  var candle = null; /* js/chart.js 가 만든 캔들 시리즈 — 절대 지우지 않습니다 */
  var overlay = null; /* 우리가 얹은 라인/바/영역 시리즈 */
  var overlayKind = null;
  var current = "candle";
  var candleColors = null; /* 숨기기 전의 원래 색 — 되돌릴 때 씁니다 */
  var wrapped = false;
  var panel = null;
  var anchorBtn = null;
  var docBound = false;

  /* =====================================================================
   * 저장
   * ===================================================================== */
  function loadSaved() {
    try {
      if (App.Storage && typeof App.Storage.load === "function") {
        var s = App.Storage.load(STORAGE_KEY);
        if (s && isType(s.type)) return s.type;
      }
    } catch (e) {
      /* 저장이 막힌 환경 — 기본값으로 */
    }
    return "candle";
  }

  function saveNow() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") {
        App.Storage.save(STORAGE_KEY, { type: current });
      }
    } catch (e) {
      /* 저장 실패는 화면 동작을 막지 않습니다 */
    }
  }

  /* =====================================================================
   * 차트·시리즈 찾기 (js/chart.js 무수정)
   * ===================================================================== */
  function findParts() {
    if (chart && candle) return true;
    var charts = [];
    try {
      if (App.ChartFont && typeof App.ChartFont.getCharts === "function") {
        charts = App.ChartFont.getCharts() || [];
      }
    } catch (e) {
      return false;
    }
    if (!charts.length) return false;
    chart = charts[0];
    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          var t = list[j].seriesType && list[j].seriesType();
          if (t === "Candlestick" && !candle) candle = list[j];
        }
      }
    } catch (e) {
      return false;
    }
    return !!candle;
  }

  /* =====================================================================
   * 캔들 시리즈의 setData / update 를 감쌉니다
   *
   * 시리즈 객체 자체에 우리 함수를 얹습니다. js/chart.js 는 자기가 들고 있는
   * 참조로 candleSeries.update(...) 를 부르므로, 부르는 순간 우리 것이
   * 먼저 잡힙니다. chart.js 는 한 글자도 안 바뀝니다.
   * ===================================================================== */
  function wrapSeries() {
    if (wrapped || !candle) return;
    if (typeof candle.setData !== "function" || typeof candle.update !== "function") return;
    var origSet = candle.setData;
    var origUpd = candle.update;
    var origApply = candle.applyOptions;

    try {
      candle.setData = function (data) {
        var r = origSet.call(candle, data);
        mirrorSetData(data);
        return r;
      };
      candle.update = function (bar) {
        var r = origUpd.call(candle, bar);
        mirrorUpdate(bar);
        return r;
      };
      /* chart.js 가 표시 통화를 바꿀 때 priceFormat 을 다시 겁니다
         (js/chart.js:170). 얹은 시리즈도 같은 형식을 따라가야 합니다. */
      if (typeof origApply === "function") {
        candle.applyOptions = function (opts) {
          var r = origApply.call(candle, opts);
          try {
            if (overlay && opts && opts.priceFormat) overlay.applyOptions({ priceFormat: opts.priceFormat });
          } catch (e) {
            /* 무시 — 얹은 시리즈는 가격표를 안 띄웁니다 */
          }
          return r;
        };
      }
      wrapped = true;
    } catch (e) {
      console.warn("[chart-candle-type.js] 캔들 시리즈를 감싸지 못했습니다:", e);
    }
  }

  /* ---- 값 옮기기 ----
     바(Bar)는 캔들과 자료 모양이 같아서 그대로 넘깁니다(새로 만드는 것 0개).
     라인·영역만 { time, value } 로 바꿔 줍니다. */
  function mirrorSetData(data) {
    if (!overlay || !data) return;
    try {
      if (overlayKind === "bar") {
        overlay.setData(data);
        return;
      }
      var out = [];
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        if (!d || typeof d.close !== "number") continue;
        out.push({ time: d.time, value: d.close });
      }
      overlay.setData(out);
    } catch (e) {
      /* 무시 — 캔들 쪽은 이미 정상적으로 들어갔습니다 */
    }
  }

  function mirrorUpdate(bar) {
    if (!overlay || !bar) return;
    try {
      if (overlayKind === "bar") {
        overlay.update(bar);
        return;
      }
      if (typeof bar.close !== "number") return;
      overlay.update({ time: bar.time, value: bar.close });
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 캔들 숨기기 / 되살리기 — 색만 바꿉니다. 시리즈는 그대로 살아 있습니다.
   * ===================================================================== */
  function rememberColors() {
    if (candleColors || !candle) return;
    var o = null;
    try {
      o = candle.options();
    } catch (e) {
      o = null;
    }
    if (!o) return;
    candleColors = {
      upColor: o.upColor,
      downColor: o.downColor,
      borderVisible: o.borderVisible,
      borderUpColor: o.borderUpColor,
      borderDownColor: o.borderDownColor,
      wickUpColor: o.wickUpColor,
      wickDownColor: o.wickDownColor
    };
  }

  function hideCandles() {
    rememberColors();
    if (!candle) return;
    try {
      candle.applyOptions({
        upColor: TRANSPARENT,
        downColor: TRANSPARENT,
        borderVisible: false,
        borderUpColor: TRANSPARENT,
        borderDownColor: TRANSPARENT,
        wickUpColor: TRANSPARENT,
        wickDownColor: TRANSPARENT
      });
    } catch (e) {
      /* 무시 */
    }
  }

  function showCandles() {
    if (!candle || !candleColors) return;
    try {
      candle.applyOptions(candleColors);
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 얹는 시리즈 만들기 / 지우기
   * ===================================================================== */
  function upDownColors() {
    rememberColors();
    var up = candleColors && candleColors.upColor ? candleColors.upColor : "#26C281";
    var dn = candleColors && candleColors.downColor ? candleColors.downColor : "#F0506E";
    return { up: up, down: dn };
  }

  function priceFormatNow() {
    try {
      var o = candle.options();
      return o && o.priceFormat ? o.priceFormat : null;
    } catch (e) {
      return null;
    }
  }

  function withBase(extra) {
    /* 얹은 시리즈는 오른쪽 축에 자기 가격표를 띄우지 않습니다 —
       chart.js 가 이미 현재가 가로선과 가격표를 그리고 있어서 두 벌이 됩니다. */
    var o = { lastValueVisible: false, priceLineVisible: false };
    var pf = priceFormatNow();
    if (pf) o.priceFormat = pf;
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    }
    return o;
  }

  function makeOverlay(kind) {
    var LC = window.LightweightCharts;
    if (!LC || !chart || typeof chart.addSeries !== "function") return null;
    try {
      if (kind === "line") {
        return chart.addSeries(
          LC.LineSeries,
          withBase({ color: C_POINT, lineWidth: LINE_WIDTH, crosshairMarkerVisible: false })
        );
      }
      if (kind === "area") {
        return chart.addSeries(
          LC.AreaSeries,
          withBase({
            lineColor: C_POINT,
            lineWidth: LINE_WIDTH,
            topColor: AREA_TOP,
            bottomColor: AREA_BOTTOM,
            crosshairMarkerVisible: false
          })
        );
      }
      if (kind === "bar") {
        var c = upDownColors();
        return chart.addSeries(LC.BarSeries, withBase({ upColor: c.up, downColor: c.down }));
      }
    } catch (e) {
      console.warn("[chart-candle-type.js] 시리즈를 만들지 못했습니다:", e);
    }
    return null;
  }

  function dropOverlay() {
    if (!overlay) return;
    try {
      chart.removeSeries(overlay);
    } catch (e) {
      /* 무시 */
    }
    overlay = null;
    overlayKind = null;
  }

  /* =====================================================================
   * 지금 고른 종류를 화면에 반영
   * ===================================================================== */
  function apply() {
    if (!findParts()) return false;
    wrapSeries();

    if (current === "candle") {
      dropOverlay();
      showCandles();
      paintButton();
      return true;
    }

    if (overlayKind !== current) {
      dropOverlay();
      overlay = makeOverlay(current);
      overlayKind = overlay ? current : null;
      if (!overlay) {
        /* 못 만들었으면 캔들로 되돌립니다 — 빈 화면을 보여주지 않습니다 */
        current = "candle";
        showCandles();
        paintButton();
        return false;
      }
    }

    /* 지금 들어 있는 값을 한 번 옮겨 담습니다. 이 뒤로는 chart.js 가
       마지막 봉 하나를 update() 할 때마다 한 봉씩만 따라갑니다. */
    var d = null;
    try {
      d = candle.data();
    } catch (e) {
      d = null;
    }
    if (d && d.length) mirrorSetData(d);

    hideCandles();
    paintButton();
    return true;
  }

  function setType(k) {
    if (!isType(k)) return false;
    if (k === current) {
      paintButton();
      return true;
    }
    current = k;
    saveNow();
    apply();
    return true;
  }

  function getType() {
    return current;
  }

  /* 버튼 이름표를 지금 고른 것으로 맞춥니다 — 마우스를 올리면 읽힙니다 */
  function toolButton() {
    return document.querySelector('.tlc-toolbar .tlc-btn[data-tlc="candletype"]');
  }

  function paintButton() {
    var b = toolButton();
    if (!b) return;
    var label = "봉 종류 — " + typeName(current);
    b.setAttribute("title", label);
    b.setAttribute("aria-label", label);
  }

  /* =====================================================================
   * 목록 (껍데기는 fx 목록과 같은 규칙 — 확정 팔레트만 씁니다)
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var P = "#" + PANEL_ID;
    var css =
      P + "{position:fixed;z-index:60;width:248px;background:" + C_CARD + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:10px;overflow:hidden;" +
      "box-shadow:none;font-family:inherit;}" +
      P + "::before{content:\"\";position:absolute;left:0;right:0;top:0;height:1px;" +
      "background:rgba(255,255,255,.03);pointer-events:none;}" +
      P + " .tl-ct-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:10px 13px;border-bottom:1px solid " + C_BORDER + ";}" +
      P + " .tl-ct-title{font-size:14px;font-weight:700;color:" + C_TEXT + ";}" +
      P + " .tl-ct-x{background:none;border:0;color:" + C_MUTED + ";font-size:15px;line-height:1;" +
      "cursor:pointer;padding:3px 5px;border-radius:4px;font-family:inherit;}" +
      P + " .tl-ct-x:hover{color:" + C_TEXT + ";}" +
      /* 줄 높이 38px — fx 목록과 같은 값(바이낸스 실측) */
      P + " .tl-ct-row{width:100%;display:flex;align-items:center;gap:8px;background:none;" +
      "border:0;padding:10px 13px;cursor:pointer;text-align:left;font-family:inherit;}" +
      P + " .tl-ct-row:hover{background:" + C_TILE + ";}" +
      P + " .tl-ct-dot{width:7px;height:7px;border-radius:50%;flex:0 0 auto;background:" + C_BORDER + ";}" +
      P + " .tl-ct-name{flex:1 1 auto;min-width:0;font-size:14px;line-height:20px;font-weight:600;" +
      "color:" + C_MUTED + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      P + " .tl-ct-note{font-size:12.5px;line-height:20px;font-weight:500;color:" + C_MUTED + ";" +
      "flex:0 0 auto;opacity:.75;}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-name{color:" + C_TEXT + ";}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-dot{background:" + C_POINT + ";}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-note{color:" + C_POINT + ";opacity:1;}" +
      P + " .tl-ct-foot{padding:8px 13px 10px;border-top:1px solid " + C_BORDER + ";" +
      "font-size:12px;color:" + C_MUTED + ";line-height:1.5;}" +
      P + " .tl-ct-list{overflow-y:auto;overscroll-behavior:contain;}" +
      P + " .tl-ct-list::-webkit-scrollbar{width:3px;}" +
      P + " .tl-ct-list::-webkit-scrollbar-thumb{background:" + C_BORDER + ";border-radius:2px;}" +
      P + " .tl-ct-list::-webkit-scrollbar-track{background:transparent;}" +
      P + " .tl-ct-hint{display:none;padding:7px 13px;border-top:1px solid " + C_BORDER + ";" +
      "font-size:11.5px;line-height:1.4;color:" + C_POINT + ";background:" + C_TILE + ";}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function host() {
    return document.querySelector(".chart-panel") || null;
  }

  function paint() {
    if (!panel) return;
    var rows = panel.querySelectorAll(".tl-ct-row");
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-k") === current;
      rows[i].setAttribute("aria-checked", on ? "true" : "false");
    }
    var foot = panel.querySelector(".tl-ct-foot");
    if (foot) foot.textContent = "지금 " + typeName(current) + ". 종목·봉 간격을 바꿔도 그대로 갑니다.";
  }

  function build() {
    injectStyle();
    var h = host();
    if (!h) return null;

    var p = document.createElement("div");
    p.id = PANEL_ID;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "봉 종류 고르기");

    var head = document.createElement("div");
    head.className = "tl-ct-head";
    var t = document.createElement("span");
    t.className = "tl-ct-title";
    t.textContent = "봉 종류";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "tl-ct-x";
    x.setAttribute("aria-label", "봉 종류 목록 닫기");
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
    list.className = "tl-ct-list";
    list.setAttribute("role", "radiogroup");

    TYPES.forEach(function (ty) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "tl-ct-row";
      row.setAttribute("role", "radio");
      row.setAttribute("data-k", ty.k);
      row.setAttribute("aria-checked", "false");

      var dot = document.createElement("span");
      dot.className = "tl-ct-dot";
      var nm = document.createElement("span");
      nm.className = "tl-ct-name";
      nm.textContent = ty.name;
      var note = document.createElement("span");
      note.className = "tl-ct-note";
      note.textContent = ty.note;

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setType(ty.k);
        paint();
      });
      list.appendChild(row);
    });
    p.appendChild(list);

    var hint = document.createElement("div");
    hint.className = "tl-ct-hint";
    hint.textContent = "목록을 위아래로 밀면 나머지가 보입니다";
    p.appendChild(hint);

    var foot = document.createElement("div");
    foot.className = "tl-ct-foot";
    p.appendChild(foot);

    h.appendChild(p);
    return p;
  }

  /* ---------------------------------------------------------------------
   * 자리 잡기 — 화면(viewport) 기준입니다.
   * fx 목록(js/chart-indicator-menu.js)이 2026-08-27 에 폰에서 화면 밖으로
   * 나갔던 일이 있어, 그때 고친 방식을 그대로 씁니다.
   *   · position:fixed 로 화면 기준
   *   · 아래가 모자라면 버튼 위로 뒤집기
   *   · 양쪽 다 모자라면 몸통만 줄여 스크롤 + 안내줄
   *   · 폰 하단 고정 매수/매도 바(.tl-order-bar) 위로는 안 내려감
   * ------------------------------------------------------------------- */
  var EDGE = 8;

  function vpW() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }
  function vpH() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }
  function fullscreenOn() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function floorY() {
    var lim = vpH() - EDGE;
    if (fullscreenOn()) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim;
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - EDGE < lim) lim = r.top - EDGE;
    return lim;
  }

  function place() {
    if (!panel) return;
    var listEl = panel.querySelector(".tl-ct-list");
    var hintEl = panel.querySelector(".tl-ct-hint");
    if (listEl) listEl.style.maxHeight = "";
    if (hintEl) hintEl.style.display = "none";

    var TOP = EDGE;
    var BOT = floorY();
    var w = panel.offsetWidth || 248;
    var natural = panel.offsetHeight || 0;

    var br = null;
    if (anchorBtn && anchorBtn.getBoundingClientRect) {
      var b = anchorBtn.getBoundingClientRect();
      if (b.width > 0 || b.height > 0) br = b;
    }

    var left = br ? (br.left + br.right) / 2 - w / 2 : EDGE;
    var maxLeft = vpW() - w - EDGE;
    if (left > maxLeft) left = maxLeft;
    if (left < EDGE) left = EDGE;

    var below = br ? br.bottom + 4 : TOP;

    /* 지표 막대(.tl-ind-bar)는 "지금 무엇이 켜져 있나" 자리라 덮지 않습니다 */
    var indBar = document.querySelector(".tl-ind-bar");
    if (indBar && indBar.getBoundingClientRect) {
      var ir = indBar.getBoundingClientRect();
      if (ir.width > 0 && ir.height > 0 && left < ir.right && left + w > ir.left && below < ir.bottom + 4) {
        below = ir.bottom + 4;
      }
    }

    var aboveEnd = br ? br.top - 4 : TOP;
    if (aboveEnd > BOT) aboveEnd = BOT;
    if (aboveEnd < TOP) aboveEnd = TOP;
    if (below < TOP) below = TOP;

    var roomBelow = BOT - below;
    var roomAbove = aboveEnd - TOP;

    var top;
    var cap = 0;
    if (roomBelow >= natural) {
      top = below;
    } else if (roomAbove >= natural) {
      top = aboveEnd - natural;
    } else if (roomAbove > roomBelow) {
      cap = roomAbove;
      top = TOP;
    } else {
      cap = roomBelow;
      top = below;
    }

    if (cap > 0 && listEl) {
      if (hintEl) hintEl.style.display = "block";
      var chrome = panel.offsetHeight - listEl.offsetHeight;
      var avail = Math.floor(cap - chrome);
      if (avail < 38) avail = 38;
      listEl.style.maxHeight = avail + "px";
      if (top === TOP && br) top = aboveEnd - panel.offsetHeight;
    }

    var hNow = panel.offsetHeight;
    if (top + hNow > BOT) top = BOT - hNow;
    if (top < TOP) top = TOP;

    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";
  }

  var rafId = 0;
  function replaceSoon() {
    if (!panel) return;
    if (rafId) return;
    rafId = window.requestAnimationFrame
      ? window.requestAnimationFrame(function () {
          rafId = 0;
          if (!panel) return;
          if (anchorBtn && anchorBtn.getBoundingClientRect) {
            var r = anchorBtn.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vpH()) {
              close();
              return;
            }
          }
          place();
        })
      : (place(), 0);
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
      window.addEventListener("resize", replaceSoon);
      window.addEventListener("scroll", replaceSoon, true);
    } else {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", replaceSoon);
      window.removeEventListener("scroll", replaceSoon, true);
    }
  }

  function isOpen() {
    return !!panel;
  }

  function open(btn) {
    if (panel) close();
    anchorBtn = btn || toolButton();
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

  /* =====================================================================
   * 시작 — 차트가 만들어질 때까지 잠깐 기다립니다.
   * ===================================================================== */
  function boot() {
    current = loadSaved();
    var tries = 0;
    var timer = setInterval(function () {
      if (findParts()) {
        clearInterval(timer);
        wrapSeries();
        if (current !== "candle") apply();
        else paintButton();
        return;
      }
      if (++tries > 200) clearInterval(timer); /* 10초 — 차트가 없는 화면 */
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    getType: getType,
    setType: setType,
    TYPES: TYPES,
    PANEL_ID: PANEL_ID,
    STORAGE_KEY: STORAGE_KEY,
    LINE_WIDTH: LINE_WIDTH,
    /* 확인용 */
    getSeriesForTest: function () {
      return { chart: chart, candle: candle, overlay: overlay, kind: overlayKind, wrapped: wrapped };
    }
  };
})();
