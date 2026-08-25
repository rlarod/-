/* =========================================================================
 * js/chart-indicators.js — App.ChartIndicators
 * =========================================================================
 * 차트에 "이동평균선(MA 7/25/99)" 과 "볼린저밴드" 를 얹고,
 * 이미 있는 "거래량 막대" 를 껐다 켤 수 있게 합니다.
 *
 * ── 이미 있는 것은 다시 만들지 않습니다 ───────────────────────────────
 *   거래량 막대 — js/chart.js:247 의 volumeSeries 가 이미 그리고 있습니다.
 *   실측(2026-08-25, localhost 1920): 캔들 아래 20% 자리에 데이터 1001개로
 *   정상 표시 중이었습니다. 그래서 여기서는 새로 만들지 않고,
 *   그 시리즈를 찾아 visible 옵션만 켰다 껐다 합니다.
 *   새로 만들면 막대가 두 벌이 됩니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 거기서 라이브러리
 * 공개 API 인 chart.panes()[n].getSeries() 로 캔들/거래량 시리즈를 찾습니다.
 * 1단계(js/chart-position-lines.js)에서 검증된 것과 같은 방식입니다.
 *
 * ── 기본은 꺼둡니다 ───────────────────────────────────────────────────
 *   MA 7 / MA 25 / MA 99 / 볼린저 → 기본 꺼짐 (이번에 새로 생긴 것)
 *   거래량                        → 기본 켜짐 (지금 화면 그대로. 아래 참고)
 * 거래량을 기본 꺼짐으로 바꾸면 "지금 보이던 것이 사라지는" 변경이 됩니다.
 * 그건 기능을 지우는 쪽이라 기본값을 오늘 화면과 같게 두었습니다.
 * 기본 꺼짐으로 바꾸려면 아래 DEFAULT_STATE 의 vol 을 false 로 한 글자만
 * 고치면 됩니다.
 *
 * ── 꺼져 있으면 계산도 하지 않습니다 ──────────────────────────────────
 * onTick() 첫 줄에서 켜진 지표가 하나도 없으면 즉시 돌아옵니다.
 * 종가 배열(closes)도 지표를 켤 때 비로소 만듭니다 — 다 꺼져 있으면
 * 배열도, 합계도, 타이머도 없습니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * kline:update 는 초당 수십 번 옵니다. 전체를 다시 계산하지 않습니다.
 *   · 같은 봉이 갱신될 때 → 합계에서 옛 종가를 빼고 새 종가를 더합니다(O(1))
 *   · 새 봉이 생길 때     → 그 구간만 정확히 다시 더합니다(O(기간), 분당 1회)
 *     새 봉마다 정확히 다시 더하므로 소수점 오차가 쌓이지 않습니다.
 * 볼린저의 표준편차는 20개짜리 창이라 매 틱 정확히 계산합니다(20회 덧셈).
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-indicators.js"></script> 한 줄 삭제
 *   2) package.json 의 tests/chart-indicators.test.js 한 토막 삭제
 *   3) js/chart-indicators.js, tests/chart-indicators.test.js 파일 삭제
 * 이 파일은 다른 파일을 고치지 않습니다. 지우면 원래 화면 그대로입니다.
 * (회원 브라우저에 남은 켜짐/꺼짐 기록은 btc_sim_v2_chart-indicators 키라
 *  그냥 남아 있어도 아무 동작도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicators = (function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 색 — 확정 팔레트 안에서만 고릅니다. 새 색을 만들지 않습니다.
   *
   * 바이낸스 선물 차트 실측 (2026-08-25, binance.com/en/futures/BTCUSDT,
   * 1920px, Original 차트, 범례 span 의 style.color 를 그대로 읽음):
   *   MA(7)  rgb(240,185,11)  #F0B90B  노랑
   *   MA(25) rgb(235,64,181)  #EB40B5  자홍
   *   MA(99) rgb(179,133,248) #B385F8  보라
   *   굵기   1px (캔버스 픽셀을 세로로 훑어 연속 길이를 셈 — 5곳 모두 1)
   *
   * 우리 팔레트에는 자홍·보라가 없습니다. 상승(#26C281)·하락(#F0506E)은
   * 손익 전용이라 지표선에 쓰면 회원이 오해합니다. 그래서 이렇게 골랐습니다.
   *   MA(7)  #F0B429 포인트(골드) — 바이낸스 노랑과 사실상 같은 색
   *                                 (R 240=240, G 180 vs 185, B 41 vs 11)
   *   MA(25) #E7ECF5 본문        — 팔레트에서 가장 밝은 색
   *   MA(99) #838DA4 보조        — 가장 느린 선이 가장 뒤로 물러남
   *   → 골드 > 흰색 > 회색 으로 밝기가 낮아지는 순서가 곧 기간 순서입니다.
   * 볼린저는 #838DA4 점선 셋 — 실선인 MA(99)와 선 모양으로 구분됩니다.
   * ------------------------------------------------------------------- */
  var COLORS = {
    ma7: "#F0B429",
    ma25: "#E7ECF5",
    ma99: "#838DA4",
    bb: "#838DA4",
  };

  /* 굵기는 바이낸스와 같은 1px */
  var LINE_WIDTH = 1;

  /* 기간 — 바이낸스 기본값 그대로 */
  var MA_PERIODS = { ma7: 7, ma25: 25, ma99: 99 };

  /* 볼린저 — 기간 20, 표준편차 2배 (바이낸스 BOLL 기본값) */
  var BB_PERIOD = 20;
  var BB_MULT = 2;

  var STORAGE_KEY = "chart-indicators";

  /* 기본 상태. vol 만 true — 지금 화면이 그렇기 때문입니다(위 설명 참고). */
  var DEFAULT_STATE = { ma7: false, ma25: false, ma99: false, bb: false, vol: true };

  var BUTTONS = [
    { key: "ma7", label: "MA 7", color: COLORS.ma7 },
    { key: "ma25", label: "MA 25", color: COLORS.ma25 },
    { key: "ma99", label: "MA 99", color: COLORS.ma99 },
    { key: "bb", label: "볼린저", color: COLORS.bb },
    { key: "vol", label: "거래량", color: "#F0B429" },
  ];

  /* ---------------- 상태 ---------------- */
  var state = null; // { ma7, ma25, ma99, bb, vol }
  var chart = null;
  var candleSeries = null;
  var volumeSeries = null;

  /* 우리가 만든 선들 (꺼져 있으면 아예 없습니다) */
  var lineSeries = { ma7: null, ma25: null, ma99: null, bbUpper: null, bbMiddle: null, bbLower: null };

  /* 종가 배열 — 켜진 지표가 하나라도 있을 때만 채웁니다 */
  var closes = [];
  var times = [];
  var sums = { ma7: 0, ma25: 0, ma99: 0, bb: 0 }; // 각 기간의 최근 N개 합계
  var closesReady = false;
  var syncMark = { len: -1, first: null }; // 차트 데이터가 통째로 바뀐 걸 알아채기 위한 표시

  var syncTimer = null;
  var buttonsEl = null;

  /* 성능 측정용 (콘솔에서 App.ChartIndicators.getPerf() 로 확인) */
  var perf = { ticks: 0, totalMs: 0, maxMs: 0 };

  function LC() {
    return window.LightweightCharts;
  }

  /* =====================================================================
   * 계산 — 순수 함수. 차트를 모릅니다(테스트에서 그대로 씁니다).
   * ===================================================================== */

  /** 단순이동평균. 값이 없는 앞부분은 건너뜁니다. → [{time, value}] */
  function computeSMA(closeArr, timeArr, period) {
    var out = [];
    if (!closeArr || closeArr.length < period) return out;
    var sum = 0;
    for (var i = 0; i < closeArr.length; i++) {
      sum += closeArr[i];
      if (i >= period) sum -= closeArr[i - period];
      if (i >= period - 1) out.push({ time: timeArr[i], value: sum / period });
    }
    return out;
  }

  /** 창(window) 하나의 표준편차 — 모집단 기준(TradingView·바이낸스와 같음) */
  function stdevOfWindow(closeArr, endIndex, period, mean) {
    var acc = 0;
    for (var i = endIndex - period + 1; i <= endIndex; i++) {
      var d = closeArr[i] - mean;
      acc += d * d;
    }
    return Math.sqrt(acc / period);
  }

  /** 볼린저밴드 → { upper:[], middle:[], lower:[] } */
  function computeBB(closeArr, timeArr, period, mult) {
    var res = { upper: [], middle: [], lower: [] };
    if (!closeArr || closeArr.length < period) return res;
    var sum = 0;
    for (var i = 0; i < closeArr.length; i++) {
      sum += closeArr[i];
      if (i >= period) sum -= closeArr[i - period];
      if (i < period - 1) continue;
      var mean = sum / period;
      var sd = stdevOfWindow(closeArr, i, period, mean);
      res.middle.push({ time: timeArr[i], value: mean });
      res.upper.push({ time: timeArr[i], value: mean + mult * sd });
      res.lower.push({ time: timeArr[i], value: mean - mult * sd });
    }
    return res;
  }

  /** 마지막 봉 기준 합계를 그 구간만 정확히 다시 더합니다(오차 누적 방지) */
  function recalcSum(period) {
    var n = closes.length;
    var start = Math.max(0, n - period);
    var s = 0;
    for (var i = start; i < n; i++) s += closes[i];
    return s;
  }

  function recalcAllSums() {
    sums.ma7 = recalcSum(MA_PERIODS.ma7);
    sums.ma25 = recalcSum(MA_PERIODS.ma25);
    sums.ma99 = recalcSum(MA_PERIODS.ma99);
    sums.bb = recalcSum(BB_PERIOD);
  }

  /* =====================================================================
   * 저장 (App.Storage) — 새로고침해도 켜짐/꺼짐이 유지됩니다.
   * ===================================================================== */
  function loadState() {
    var s = {};
    var k;
    for (k in DEFAULT_STATE) s[k] = DEFAULT_STATE[k];
    try {
      if (App.Storage && typeof App.Storage.load === "function") {
        var saved = App.Storage.load(STORAGE_KEY);
        if (saved && typeof saved === "object") {
          for (k in DEFAULT_STATE) {
            if (typeof saved[k] === "boolean") s[k] = saved[k];
          }
        }
      }
    } catch (e) {
      /* 저장된 값이 이상하면 기본값 그대로 */
    }
    return s;
  }

  function saveState() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") {
        App.Storage.save(STORAGE_KEY, state);
      }
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작 */
    }
  }

  /* =====================================================================
   * 차트/시리즈 찾기 — chart.js 를 고치지 않고 공개 API 로만 찾습니다.
   * ===================================================================== */
  function ensureSeries() {
    if (candleSeries && volumeSeries) return true;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return false;

    var charts = App.ChartFont.getCharts();
    if (!charts || !charts.length) return false;
    chart = charts[0];

    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          var t = list[j].seriesType && list[j].seriesType();
          if (t === "Candlestick" && !candleSeries) candleSeries = list[j];
          /* 거래량은 chart.js 가 priceScaleId "" (오버레이)로 만들었습니다.
             혹시 나중에 다른 히스토그램이 생겨도 오버레이인 것만 고릅니다. */
          if (t === "Histogram" && !volumeSeries) {
            try {
              if (list[j].options().priceScaleId === "") volumeSeries = list[j];
            } catch (e) {
              volumeSeries = list[j];
            }
          }
        }
      }
    } catch (e) {
      console.warn("[chart-indicators.js] 시리즈를 찾지 못했습니다:", e);
      return false;
    }
    return !!(candleSeries && volumeSeries);
  }

  /* =====================================================================
   * 종가 배열 맞추기
   * ===================================================================== */
  function anyIndicatorOn() {
    return !!(state && (state.ma7 || state.ma25 || state.ma99 || state.bb));
  }

  /** 캔들 시리즈에서 종가를 통째로 다시 읽어옵니다(봉 간격 변경·과거 로딩 후). */
  function fullSync() {
    if (!candleSeries) return false;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return false;
    }
    if (!data || !data.length) {
      closes = [];
      times = [];
      closesReady = false;
      syncMark.len = 0;
      syncMark.first = null;
      return false;
    }
    closes = new Array(data.length);
    times = new Array(data.length);
    for (var i = 0; i < data.length; i++) {
      closes[i] = data[i].close;
      times[i] = data[i].time;
    }
    recalcAllSums();
    closesReady = true;
    syncMark.len = closes.length;
    syncMark.first = times[0];
    return true;
  }

  /* =====================================================================
   * 선 만들기 / 지우기
   * ===================================================================== */
  function makeLine(color, dashed) {
    var lc = LC();
    return chart.addSeries(lc.LineSeries, {
      color: color,
      lineWidth: LINE_WIDTH,
      lineStyle: dashed ? lc.LineStyle.Dashed : lc.LineStyle.Solid,
      priceScaleId: "right", // 캔들과 같은 가격축
      priceLineVisible: false, // 우리 선 때문에 가로선이 또 생기지 않게
      lastValueVisible: false, // 가격축 라벨도 늘리지 않음
      crosshairMarkerVisible: false,
    });
  }

  function dropLine(key) {
    if (!lineSeries[key]) return;
    try {
      chart.removeSeries(lineSeries[key]);
    } catch (e) {
      /* 이미 지워졌으면 무시 */
    }
    lineSeries[key] = null;
  }

  /* =====================================================================
   * 그리기 (전체) — 켤 때 / 봉 간격이 바뀔 때만 부릅니다.
   * ===================================================================== */
  function redrawAll() {
    if (!ensureSeries()) return;

    /* 켜진 게 하나도 없으면 선을 전부 없애고 배열도 비웁니다(계산 안 함) */
    if (!anyIndicatorOn()) {
      dropLine("ma7");
      dropLine("ma25");
      dropLine("ma99");
      dropLine("bbUpper");
      dropLine("bbMiddle");
      dropLine("bbLower");
      closes = [];
      times = [];
      closesReady = false;
      stopSyncTimer();
      return;
    }

    /* 켜진 지표가 있으면 감시 타이머는 항상 돌려 둡니다.
       chart.js 가 과거 캔들을 아직 못 받아온 시점(새로고침 직후)에도
       데이터가 도착하면 이 타이머가 다시 그려줍니다. */
    startSyncTimer();

    if (!closesReady) fullSync();
    if (!closesReady) return;

    ["ma7", "ma25", "ma99"].forEach(function (key) {
      if (state[key]) {
        if (!lineSeries[key]) lineSeries[key] = makeLine(COLORS[key], false);
        lineSeries[key].setData(computeSMA(closes, times, MA_PERIODS[key]));
      } else {
        dropLine(key);
      }
    });

    if (state.bb) {
      var bb = computeBB(closes, times, BB_PERIOD, BB_MULT);
      if (!lineSeries.bbUpper) lineSeries.bbUpper = makeLine(COLORS.bb, true);
      if (!lineSeries.bbMiddle) lineSeries.bbMiddle = makeLine(COLORS.bb, true);
      if (!lineSeries.bbLower) lineSeries.bbLower = makeLine(COLORS.bb, true);
      lineSeries.bbUpper.setData(bb.upper);
      lineSeries.bbMiddle.setData(bb.middle);
      lineSeries.bbLower.setData(bb.lower);
    } else {
      dropLine("bbUpper");
      dropLine("bbMiddle");
      dropLine("bbLower");
    }
  }

  /* =====================================================================
   * 실시간 갱신 — 마지막 봉만 손댑니다.
   * ===================================================================== */
  function onTick(payload) {
    /* 꺼져 있으면 여기서 끝 — 계산도 하지 않습니다 */
    if (!anyIndicatorOn()) return;
    if (!payload || !payload.candle) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (!candleSeries) return;
    if (!closesReady && !fullSync()) return;

    var t0 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;

    var c = payload.candle;
    var n = closes.length;
    var lastTime = n ? times[n - 1] : null;

    if (n && c.time === lastTime) {
      /* 같은 봉이 갱신됨 — 합계에서 옛 종가를 빼고 새 종가를 더합니다 (O(1)) */
      var diff = c.close - closes[n - 1];
      closes[n - 1] = c.close;
      sums.ma7 += diff;
      sums.ma25 += diff;
      sums.ma99 += diff;
      sums.bb += diff;
    } else if (!n || c.time > lastTime) {
      /* 새 봉 — 그 구간만 정확히 다시 더합니다 (분당 1회, 오차 누적 방지) */
      closes.push(c.close);
      times.push(c.time);
      recalcAllSums();
      syncMark.len = closes.length;
    } else {
      return; /* 과거 시각이 뒤늦게 온 경우 — 무시 */
    }

    n = closes.length;
    var time = times[n - 1];

    ["ma7", "ma25", "ma99"].forEach(function (key) {
      if (!state[key] || !lineSeries[key]) return;
      var p = MA_PERIODS[key];
      if (n < p) return;
      try {
        lineSeries[key].update({ time: time, value: sums[key] / p });
      } catch (e) {
        /* 시각이 어긋난 경우 — 다음 전체 맞춤에서 정리됩니다 */
      }
    });

    if (state.bb && lineSeries.bbUpper && n >= BB_PERIOD) {
      var mean = sums.bb / BB_PERIOD;
      var sd = stdevOfWindow(closes, n - 1, BB_PERIOD, mean);
      try {
        lineSeries.bbUpper.update({ time: time, value: mean + BB_MULT * sd });
        lineSeries.bbMiddle.update({ time: time, value: mean });
        lineSeries.bbLower.update({ time: time, value: mean - BB_MULT * sd });
      } catch (e) {
        /* 위와 같음 */
      }
    }

    if (t0) {
      var ms = performance.now() - t0;
      perf.ticks++;
      perf.totalMs += ms;
      if (ms > perf.maxMs) perf.maxMs = ms;
    }
  }

  /* =====================================================================
   * 차트 데이터가 통째로 바뀌었는지 확인 (봉 간격 변경 / 과거 스크롤 로딩)
   * chart.js 는 그때 setData() 를 부르는데 알려주는 신호가 없습니다.
   * 그래서 길이와 맨 앞 시각만 가끔 비교합니다. 켜진 지표가 있을 때만 돕니다.
   * ===================================================================== */
  function checkResync() {
    if (!anyIndicatorOn() || !candleSeries) return;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return;
    }
    if (!data || !data.length) return;
    if (data.length === syncMark.len && data[0].time === syncMark.first) return;
    closesReady = false;
    redrawAll();
  }

  function startSyncTimer() {
    if (syncTimer) return;
    syncTimer = setInterval(checkResync, 1500);
  }
  function stopSyncTimer() {
    if (!syncTimer) return;
    clearInterval(syncTimer);
    syncTimer = null;
  }

  /* =====================================================================
   * 거래량 — 이미 있는 시리즈를 켰다 껐다 할 뿐입니다(새로 만들지 않음)
   * ===================================================================== */
  function applyVolume() {
    if (!volumeSeries) return;
    try {
      volumeSeries.applyOptions({ visible: !!state.vol });
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 껐다 켜는 버튼 — 차트 왼쪽 위 작은 버튼
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById("chart-indicators-style")) return;
    var css =
      ".tl-ind-bar{position:absolute;top:6px;left:8px;z-index:6;display:flex;gap:4px;" +
      "flex-wrap:wrap;pointer-events:none;}" +
      ".tl-ind-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-ind-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-ind-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      /* 켜짐 표시는 색 점으로 합니다. MA 99 와 볼린저는 선 색이 보조색(#838DA4)
         이라 글자 색만으로는 켜짐/꺼짐이 구분되지 않았습니다(실측). */
      ".tl-ind-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}";
    var st = document.createElement("style");
    st.id = "chart-indicators-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function paintButtons() {
    if (!buttonsEl) return;
    var kids = buttonsEl.querySelectorAll(".tl-ind-btn");
    for (var i = 0; i < kids.length; i++) {
      var key = kids[i].getAttribute("data-ind");
      var on = !!state[key];
      kids[i].setAttribute("aria-pressed", on ? "true" : "false");
      kids[i].style.color = on ? "#E7ECF5" : "#838DA4";
      kids[i].style.borderColor = on ? "#838DA4" : "#1D273B";
      var dot = kids[i].querySelector(".tl-ind-dot");
      if (dot) dot.style.background = on ? kids[i].getAttribute("data-color") : "#1D273B";
    }
  }

  function buildButtons() {
    if (buttonsEl && document.body && document.body.contains(buttonsEl)) return true;
    var wrap = document.querySelector(".chart-panel .chart-wrap") || document.querySelector(".chart-wrap");
    if (!wrap) return false;

    injectStyle();
    /* style.css 를 건드리지 않고 이 요소에만 기준점을 줍니다 */
    if (!wrap.style.position) wrap.style.position = "relative";

    buttonsEl = document.createElement("div");
    buttonsEl.className = "tl-ind-bar";
    buttonsEl.setAttribute("aria-label", "차트 지표 켜기/끄기");

    BUTTONS.forEach(function (b) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-ind-btn";
      btn.setAttribute("data-ind", b.key);
      btn.setAttribute("data-color", b.color);
      btn.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span");
      dot.className = "tl-ind-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(b.label));
      btn.addEventListener("click", function () {
        toggle(b.key);
      });
      buttonsEl.appendChild(btn);
    });

    wrap.appendChild(buttonsEl);
    paintButtons();
    return true;
  }

  /* =====================================================================
   * 켜기 / 끄기
   * ===================================================================== */
  function toggle(key) {
    if (!state || !(key in state)) return;
    state[key] = !state[key];
    saveState();
    paintButtons();
    if (key === "vol") applyVolume();
    else redrawAll();
  }

  function setOn(key, on) {
    if (!state || !(key in state)) return;
    if (state[key] === !!on) return;
    toggle(key);
  }

  /* =====================================================================
   * 시작
   * ===================================================================== */
  function scheduleResync() {
    closesReady = false;
    if (!anyIndicatorOn()) return;
    var n = 0;
    var t = setInterval(function () {
      if (++n > 20) {
        clearInterval(t);
        return;
      }
      if (!candleSeries) return;
      var d;
      try {
        d = candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        closesReady = false;
        redrawAll();
      }
    }, 250);
  }

  function init() {
    state = loadState();

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("kline:update", onTick);
      /* 종목·봉 간격이 바뀌면 chart.js 가 과거를 다시 받아옵니다.
         받아오는 데 시간이 걸리므로 잠깐 뒤에 다시 맞춥니다. */
      App.Bus.on("symbol:change", scheduleResync);
      App.Bus.on("interval:change", scheduleResync);
    }

    /* 차트는 chart.js 가 나중에 만들고, 과거 캔들은 그보다 더 나중에
       도착합니다(REST 조회). 둘 다 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 200) {
        clearInterval(timer); // 10초 — 그래도 없으면 포기
        return;
      }
      if (!ensureSeries()) return;
      if (!buildButtons()) return;
      applyVolume();
      if (!anyIndicatorOn()) {
        clearInterval(timer); // 켜진 게 없으면 캔들을 기다릴 이유도 없음
        return;
      }
      var d = null;
      try {
        d = candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(timer);
        redrawAll();
      }
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    toggle: toggle,
    setOn: setOn,
    isOn: function (key) {
      return !!(state && state[key]);
    },
    /* 계산부 — 테스트에서 그대로 씁니다 */
    computeSMA: computeSMA,
    computeBB: computeBB,
    stdevOfWindow: stdevOfWindow,
    /* 확인용 */
    getState: function () {
      var out = {};
      for (var k in state) out[k] = state[k];
      return out;
    },
    getPerf: function () {
      return {
        ticks: perf.ticks,
        avgMs: perf.ticks ? perf.totalMs / perf.ticks : 0,
        maxMs: perf.maxMs,
      };
    },
    resetPerf: function () {
      perf.ticks = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
    },
    getSeriesForTest: function () {
      return { candle: candleSeries, volume: volumeSeries, lines: lineSeries };
    },
    getClosesForTest: function () {
      return closes.slice();
    },
    getSumsForTest: function () {
      return { ma7: sums.ma7, ma25: sums.ma25, ma99: sums.ma99, bb: sums.bb };
    },
    onTickForTest: onTick,
    COLORS: COLORS,
    MA_PERIODS: MA_PERIODS,
    BB_PERIOD: BB_PERIOD,
    BB_MULT: BB_MULT,
  };
})();
