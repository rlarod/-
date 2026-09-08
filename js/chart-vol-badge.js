/* =========================================================================
 * js/chart-vol-badge.js — App.ChartVolBadge
 * =========================================================================
 * 거래량 시리즈가 ★가격축에 찍던 마지막값 배지★ 와 ★차트를 가로지르던
 * 가로 점선★ 을 끕니다. 그리고 그 숫자를 잃지 않게 「● 거래량」 칩에 붙입니다.
 *
 * ── 무슨 병인가 (2026-09-08 · P1 조용한 고장) ─────────────────────────
 *   js/chart.js:247~250 (수정 금지 파일. 읽기만 했습니다)
 *       volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
 *         priceFormat: { type: "volume" },
 *         priceScaleId: "",            // 오버레이 스케일
 *       });                            // ← lastValueVisible / priceLineVisible 지정 없음
 *   라이브러리 기본값이 ★둘 다 true★ 입니다.
 *
 *   ★바로 위 캔들에는 둘 다 꺼놨습니다★ (js/chart.js:235~236). 그 자리 주석:
 *     "이게 켜져 있으면 우리가 직접 만드는 현재가 선과 겹쳐서 화면에 선이
 *      2개로 보였음 — 현재가 선 하나만 남기기 위해 비활성화."
 *   ★거래량만 빠졌습니다.★
 *
 *   결과 두 가지 —
 *     ① 거래량 배지(10.35)가 가격축 눈금 위에 얹혀 79,080.00 이 .00 만 읽힘
 *     ② 거래량 값 자리에 ★차트를 가로지르는 가로 점선★ 이 그려짐
 *        → 회원이 그걸 ★가격선으로 읽습니다★. 배지보다 이쪽이 더 나쁩니다.
 *
 * ── "지금 안 겹친다" 는 안전하다는 뜻이 아닙니다 ───────────────────────
 *   조사팀 실측(768·KRW·100초 동안 2초마다 58번):
 *     배지 y 가 611~667 사이를 계속 움직임(1분 봉 안에서 거래량이 쌓이므로)
 *     겹침 ★53회 / 58회 = 91.4%★
 *   한 번 재서 "안 겹친다" 는 아무 보장이 못 됩니다.
 *
 * ── 왜 이 방법인가 (PM 결정 · 안 1) ───────────────────────────────────
 *   · ★가격축을 한 픽셀도 안 건드립니다.★ 폭·통화·DPR 어디서도 계산이
 *     필요 없습니다. 정적 px 로 자리를 맞추다 두 번 실패한 병을 안 만듭니다.
 *   · 차트를 가로지르던 점선도 같이 사라집니다.
 *   · ★트레이딩뷰와 같은 모양★ 입니다. 트레이딩뷰도 축에 거래량 배지를
 *     그리지만 범례에 Vol · BTC 1.08 K 로 숫자가 ★또★ 있어서 배지가
 *     눈금을 덮어도 값을 잃지 않습니다. 우리 칩에는 숫자가 없었습니다.
 *
 *   안 2(겹칠 때만 끄기)·안 3(DOM 배지 새로 만들기)는 PM 이 막았습니다.
 *
 * ── ★안 한 것★ ───────────────────────────────────────────────────────
 *   · 거래량 막대 자체는 그대로입니다. visible 을 안 건드립니다. 안 지웁니다.
 *   · 캔들·현재가 선·다른 시리즈에 손대지 않습니다
 *     (오버레이 스케일 priceScaleId 가 빈 문자열인 Histogram 하나만 고릅니다).
 *   · js/chart.js 를 안 고쳤습니다 (수정 금지 12개).
 *   · js/chart-indicators.js 를 안 고쳤습니다 — 차트팀과 겹칠 수 있어
 *     칩 안에 span 을 ★덧붙이기만★ 합니다. 칩 글자·개수·동작은 그대로입니다.
 *
 * ── 숫자 서식 ─────────────────────────────────────────────────────────
 *   ★우리가 새로 만들지 않습니다.★ 배지에 찍히던 글자를 그대로 씁니다 —
 *   시리즈 자신의 priceFormatter().format(v) 을 부릅니다(라이브러리 것).
 *   그게 없는 판이면 같은 규칙(995 / 999995 / … K·M·B)을 흉내 내는 예비
 *   서식만 씁니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   index.html 의 chart-vol-badge.js script 한 줄을 지우면 배지와 점선이
 *   그대로 돌아옵니다(라이브러리 기본값).
 *   실행 중에는 콘솔에서 App.ChartVolBadge.disable() 로 되돌립니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartVolBadge = (function () {
  "use strict";

  /* 칩에 붙이는 값 상자 */
  var VAL_CLASS = "tl-vol-val";
  var STYLE_ID = "tl-vol-badge-style";

  var chart = null;
  var series = null;      /* 거래량(오버레이 Histogram) 시리즈 */
  var valEl = null;       /* 칩 안의 값 span */
  var chipEl = null;      /* 「● 거래량」 칩 */
  var chipMo = null;
  var lastText = "";
  var lastValue = null;
  var off = false;
  var offApplied = false; /* 배지·점선을 껐는가 */

  function alive(el) {
    return !!el && (el.isConnected === undefined || el.isConnected);
  }

  /* =====================================================================
   * 1) 거래량 시리즈 찾기 — js/chart-indicators.js:246~277 과 같은 길입니다.
   *    새 통로를 뚫지 않습니다.
   * ===================================================================== */
  function findSeries() {
    if (series) return series;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return null;
    var charts;
    try {
      charts = App.ChartFont.getCharts();
    } catch (e) {
      return null;
    }
    if (!charts || !charts.length) return null;
    chart = charts[0];
    try {
      if (typeof chart.panes !== "function") return null;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (!panes[i] || typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          var t = list[j].seriesType && list[j].seriesType();
          if (t !== "Histogram") continue;
          /* ★오버레이인 것만★ — 나중에 다른 히스토그램이 생겨도
             (보조 pane 지표 등) 그건 건드리지 않습니다. */
          try {
            if (list[j].options().priceScaleId !== "") continue;
          } catch (e) {
            continue;
          }
          series = list[j];
          return series;
        }
      }
    } catch (e) {
      return null;
    }
    return null;
  }

  /* =====================================================================
   * 2) 축 배지 · 가로 점선 끄기
   *    ⚠ visible 은 안 건드립니다 — 막대는 그대로 보입니다.
   * ===================================================================== */
  function silenceAxis() {
    var s = findSeries();
    if (!s) return false;
    var o = null;
    try {
      o = s.options();
    } catch (e) {
      o = null;
    }
    /* 이미 꺼져 있으면 applyOptions 를 부르지 않습니다(다시 그리기 유발 방지) */
    if (o && o.lastValueVisible === false && o.priceLineVisible === false) {
      offApplied = true;
      return true;
    }
    try {
      s.applyOptions({ lastValueVisible: false, priceLineVisible: false });
    } catch (e) {
      return false;
    }
    offApplied = true;
    return true;
  }

  /* =====================================================================
   * 3) 숫자 서식 — 배지에 찍히던 그 글자
   * ===================================================================== */
  /** 라이브러리 서식(VolumeFormatter)과 같은 규칙의 예비 구현.
   *  priceFormatter() 가 없는 판에서만 씁니다. */
  function fallbackFormat(v) {
    if (typeof v !== "number" || !isFinite(v)) return "";
    var sign = "";
    if (v < 0) {
      sign = "-";
      v = -v;
    }
    function n(x) {
      return String(Math.round(x * 100) / 100);
    }
    if (v < 995) return sign + n(v);
    if (v < 999995) return sign + n(v / 1000) + "K";
    if (v < 999999995) return sign + n(v / 1000000) + "M";
    return sign + n(v / 1000000000) + "B";
  }

  function format(v) {
    if (typeof v !== "number" || !isFinite(v)) return "";
    var s = findSeries();
    if (s && typeof s.priceFormatter === "function") {
      try {
        var f = s.priceFormatter();
        if (f && typeof f.format === "function") {
          var out = f.format(v);
          if (typeof out === "string" && out) return out;
        }
      } catch (e) {
        /* 예비 서식으로 내려갑니다 */
      }
    }
    return fallbackFormat(v);
  }

  /* =====================================================================
   * 4) 칩에 값 붙이기
   * ===================================================================== */
  function injectStyle() {
    if (!document || !document.head) return;
    if (document.getElementById(STYLE_ID)) return;
    var st = document.createElement("style");
    st.id = STYLE_ID;
    /* 칩 글자와 같은 크기입니다 — ★줄이지 않습니다★.
       숫자만 본문색으로 조금 밝게 해서 이름과 값이 구분되게 합니다
       (확정 팔레트 본문 #E7ECF5. 새 색을 만들지 않았습니다). */
    st.textContent =
      "." + VAL_CLASS + "{color:#E7ECF5;font-variant-numeric:tabular-nums;" +
      "font-weight:600;margin-left:2px;}" +
      "." + VAL_CLASS + ":empty{display:none;margin-left:0;}";
    document.head.appendChild(st);
  }

  /** 「● 거래량」 칩을 찾습니다 (js/chart-indicators.js 가 만든 것). */
  function findChip() {
    if (alive(chipEl)) return chipEl;
    chipEl = null;
    valEl = null;
    try {
      chipEl = document.querySelector(".tl-ind-bar .tl-ind-btn[data-ind='vol']") ||
               document.querySelector(".tl-ind-btn[data-ind='vol']");
    } catch (e) {
      return null;
    }
    return chipEl;
  }

  /** 값 상자를 칩 안에 ★덧붙입니다★. 칩의 원래 내용은 그대로 둡니다. */
  function ensureValEl() {
    var c = findChip();
    if (!c) return null;
    if (alive(valEl) && valEl.parentNode === c) return valEl;
    var found = null;
    try {
      found = c.querySelector("." + VAL_CLASS);
    } catch (e) {
      found = null;
    }
    if (found) {
      valEl = found;
      return valEl;
    }
    injectStyle();
    valEl = document.createElement("span");
    valEl.className = VAL_CLASS;
    c.appendChild(valEl);
    return valEl;
  }

  /** 거래량이 꺼져 있으면(칩 aria-pressed 가 false) 값도 안 보입니다 —
   *  막대가 없는데 숫자만 남으면 그게 더 헷갈립니다. */
  function volOn() {
    var c = findChip();
    if (!c || !c.getAttribute) return true;
    return c.getAttribute("aria-pressed") !== "false";
  }

  function paint() {
    if (off) return false;
    /* 아직 값이 한 번도 안 왔으면 상자를 만들지 않습니다 —
       차트가 아직 없을 때 빈 상자만 칩에 붙는 일이 없게. */
    if (typeof lastValue !== "number" && !alive(valEl)) return false;
    var el = ensureValEl();
    if (!el) return false;
    var txt = volOn() ? format(lastValue) : "";
    if (el.textContent !== txt) el.textContent = txt;
    lastText = txt;
    return true;
  }

  /** 새 거래량 값이 들어왔습니다. */
  function setValue(v) {
    if (typeof v !== "number" || !isFinite(v)) return false;
    lastValue = v;
    return paint();
  }

  /** 차트가 이미 가진 마지막 값을 읽어옵니다(첫 그림·종목/간격 변경 뒤). */
  function pullFromSeries() {
    var s = findSeries();
    if (!s || typeof s.data !== "function") return false;
    var d;
    try {
      d = s.data();
    } catch (e) {
      return false;
    }
    if (!d || !d.length) return false;
    var last = d[d.length - 1];
    if (!last || typeof last.value !== "number") return false;
    return setValue(last.value);
  }

  /* =====================================================================
   * 5) 언제 다시 하나
   * ===================================================================== */
  function tick(payload) {
    if (off) return;
    /* 축 배지가 다시 켜지는 일이 없어야 합니다 — 시리즈를 새로 잡았거나
       누가 applyOptions 로 되돌렸으면 여기서 다시 끕니다. 평소에는 값만
       비교하므로 applyOptions 를 안 부릅니다. */
    if (!offApplied) silenceAxis();
    if (payload && payload.candle && typeof payload.candle.volume === "number") {
      /* 다른 종목 신호는 무시합니다 — js/chart.js:363 과 같은 판정입니다 */
      try {
        if (App.Config && typeof App.Config.getActiveSymbol === "function" &&
            payload.symbol && payload.symbol !== App.Config.getActiveSymbol()) return;
      } catch (e) {
        /* 판정을 못 하면 그냥 씁니다 */
      }
      setValue(payload.candle.volume);
      return;
    }
    pullFromSeries();
  }

  /** 칩이 나중에 다시 그려지거나 켜짐/꺼짐이 바뀌면 다시 칠합니다. */
  function watchChip() {
    if (chipMo || typeof MutationObserver === "undefined") return;
    var c = findChip();
    if (!c) return;
    try {
      chipMo = new MutationObserver(function () {
        if (!off) paint();
      });
      chipMo.observe(c, { attributes: true, attributeFilter: ["aria-pressed"] });
    } catch (e) {
      chipMo = null;
    }
  }

  function watchEvents() {
    if (!App.Bus || typeof App.Bus.on !== "function") return;
    try {
      App.Bus.on("kline:update", tick);
      /* 종목·간격·통화를 바꾸면 차트를 다시 그립니다. 데이터가 앉은 뒤 읽습니다. */
      App.Bus.on("symbol:change", function () {
        series = null;              /* 시리즈가 바뀌었을 수 있습니다 */
        offApplied = false;
        setTimeout(function () { silenceAxis(); pullFromSeries(); }, 600);
        setTimeout(function () { silenceAxis(); pullFromSeries(); }, 1500);
      });
      App.Bus.on("interval:change", function () {
        setTimeout(function () { silenceAxis(); pullFromSeries(); }, 600);
      });
      App.Bus.on("currency:change", function () { setTimeout(paint, 300); });
    } catch (e) {
      /* 무시 */
    }
  }

  /** 배지·점선을 되돌리고 칩의 숫자를 지웁니다(원래 화면으로). */
  function disable() {
    off = true;
    if (chipMo) {
      try { chipMo.disconnect(); } catch (e) { /* 무시 */ }
      chipMo = null;
    }
    if (alive(valEl) && valEl.parentNode) {
      try { valEl.parentNode.removeChild(valEl); } catch (e) { /* 무시 */ }
    }
    valEl = null;
    if (series) {
      try {
        series.applyOptions({ lastValueVisible: true, priceLineVisible: true });
      } catch (e) { /* 무시 */ }
    }
    offApplied = false;
  }

  function init() {
    var tries = 0;
    (function wait() {
      tries++;
      if (off) return;
      var 축 = silenceAxis();
      var 칩 = paint();
      if (축) {
        pullFromSeries();
        watchChip();
        watchEvents();
        /* 칩은 js/chart-indicators.js 가 나중에 만들 수도 있습니다 */
        if (!칩) {
          setTimeout(function () { paint(); watchChip(); }, 800);
          setTimeout(function () { paint(); watchChip(); }, 2000);
        }
        return;
      }
      if (tries < 120) setTimeout(wait, 250);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    disable: disable,
    silenceAxis: silenceAxis,
    paint: paint,
    setValue: setValue,
    format: format,
    pullFromSeries: pullFromSeries,
    VAL_CLASS: VAL_CLASS,
    /* 확인용 */
    getStateForTest: function () {
      return {
        chart: chart, series: series, valEl: valEl, chipEl: chipEl,
        lastValue: lastValue, lastText: lastText, off: off, offApplied: offApplied
      };
    },
    resetForTest: function () {
      chart = null; series = null; valEl = null; chipEl = null;
      lastValue = null; lastText = ""; off = false; offApplied = false;
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChartVolBadge;
