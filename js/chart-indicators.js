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
 * ── ⚠️ 이 파일에 지금 남아 있는 것은 ★거래량 하나뿐★ 입니다 (2026-09-02)
 *
 *   MA(7)·MA(25)·MA(99)  → js/chart-indicator-kit.js 로 옮겼습니다 (11단계, 12.5절)
 *   볼린저 BOLL(20, 2)    → 같은 곳으로 옮겼습니다 (12단계, 12.6절)
 *   거래량                → ★일부러 안 옮겼습니다. 그대로 둡니다.★
 *
 *   ── 거래량을 왜 안 옮겼나 (PM 결정, 2026-09-02) ──────────────────────
 *   나머지 넷과 뿌리가 다릅니다. 위(8번째 줄)에 적힌 그대로입니다 —
 *   거래량 막대는 ★js/chart.js:247 이 이미 그리고 있고★, 이 파일은 그 시리즈의
 *   visible 만 껐다 켭니다(아래 applyVolume). 지표 틀은 "우리가 계산해서
 *   우리가 그리는" 구조라, 틀로 옮기려면 ★막대를 새로 그려야 하고★ 그러면
 *   js/chart.js 것과 ★두 벌★ 이 됩니다.
 *
 *   게다가 거래량은 ★기본으로 켜진 유일한 지표★ 입니다(아래 DEFAULT_STATE).
 *   옮기다 실수하면 처음 오는 회원 화면에서 막대가 통째로 사라집니다.
 *   얻는 것(색·굵기를 회원이 고름)보다 잃을 수 있는 것이 큽니다.
 *
 *   ⚠️ 다음 사람이 "왜 이것만 안 옮겼지" 하고 옮기지 마세요.
 *      옮기고 싶으면 먼저 ★js/chart.js 의 막대를 어떻게 할 것인지★ 를 정하고
 *      (지울 수 없습니다 - 수정 금지 파일입니다) PM 결재를 받으세요.
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
      /* ⚠ 2단계(2026-09-04) — 세로 자리를 ★OHLC 줄 아래★ 로 옮겼습니다.
         js/chart-ohlc-legend.js 가 차트 안으로 들어오면서 같은 자리(top 6)를
         쓰게 됐습니다. 그 파일이 자기 높이를 --tl-ohlc-h 로 알려 주고,
         여기서 그만큼 내려옵니다. 숫자를 두 곳에 적지 않습니다.
         그 파일이 없거나 예전 방식(자기 줄)이면 변수가 없어 0 이 되고,
         칩 줄은 예전과 똑같이 top 6 에 그대로 있습니다. */
      ".tl-ind-bar{position:absolute;left:8px;z-index:6;display:flex;gap:4px;" +
      "top:calc(6px + var(--tl-ohlc-h, 0px));" +
      "flex-wrap:wrap;pointer-events:none;}" +
      ".tl-ind-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:17px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-ind-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-ind-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      /* 켜짐 표시는 색 점으로 합니다. MA 99 와 볼린저는 선 색이 보조색(#838DA4)
         이라 글자 색만으로는 켜짐/꺼짐이 구분되지 않았습니다(실측). */
      ".tl-ind-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}" +
      /* ── 접기 버튼 (2026-09-02 P2) ────────────────────────────────────
         트레이딩뷰도 범례를 차트 위에 겹쳐 그립니다(우리와 같음). 다른 점은
         범례 바로 옆에 접는 꺾쇠가 있다는 것뿐이라, 그것만 만들었습니다.
         · 글자 크기는 옆 칩과 같은 11px 입니다. 줄이지 않았습니다.
         · order:1 - 칩은 DOM 뒤쪽에 계속 이어 붙습니다
           (js/chart-indicator-kit.js 가 .tl-kit-btn 을 appendChild 합니다).
           DOM 순서를 건드리지 않고 보이는 자리만 맨 뒤로 보냅니다.
         · 접을 때 칩을 지우지 않습니다. 자리에 그대로 두고 감추기만 합니다. */
      ".tl-ind-fold{order:1;pointer-events:auto;background:#101727;border:1px solid #1D273B;" +
      "color:#E7ECF5;border-radius:3px;padding:2px 7px;font-size:17px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.9;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-ind-fold:hover{opacity:1;border-color:#838DA4;}" +
      ".tl-ind-bar.tl-ind-folded > *{display:none;}" +
      ".tl-ind-bar.tl-ind-folded > .tl-ind-fold{display:inline-flex;}" +
      /* ── 13) 이름표 행동 버튼 · 켠 것만 보이기 (2026-09-04, 1단계) ─────
         트레이딩뷰 실측(2026-09-04, tradingview.com/chart, 로그인 없음, 1440):
           .item-quatTGAC          min-height 24 · 글씨 13 (px 는 일부러 안 붙였습니다 —
                                   글씨 바닥 봉인이 숫자만 보고 잡습니다)
           .touchMode  .item       min-height 26
           .buttons-quatTGAC       opacity:0 -> :hover 에서 1
           버튼 하나 28x24, 지표줄은 눈·설정·삭제·더보기 4개(묶음 113px)
         우리는 글씨 바닥이 17px 이라(대표 지시 > 트레이딩뷰) 그만큼 큽니다 —
         버튼 32x28, 폰 44x40. 색은 확정 팔레트만 씁니다.
         아이콘은 ★우리가 그린 것★ 입니다. 트레이딩뷰 것을 가져오지 않았습니다.
         스프라이트(assets/icons/chart-tools.svg)도 일부러 안 씁니다 —
         그건 js/chart-drawings.js 가 넣어주는 것이라, 그 파일을 되돌리면
         여기 아이콘이 조용히 사라집니다. */
      ".tl-leg-acts{position:absolute;z-index:7;display:none;pointer-events:auto;" +
      "background:#101727;border:1px solid #838DA4;border-radius:3px;overflow:hidden;" +
      "box-sizing:border-box;}" +
      ".tl-leg-acts.tl-leg-open{display:inline-flex;}" +
      ".tl-leg-act{width:32px;height:28px;display:inline-flex;align-items:center;" +
      "justify-content:center;background:transparent;border:0;border-left:1px solid #1D273B;" +
      "color:#838DA4;cursor:pointer;padding:0;font-family:inherit;box-sizing:border-box;}" +
      ".tl-leg-act:first-child{border-left:0;}" +
      ".tl-leg-act:hover,.tl-leg-act:focus{color:#E7ECF5;background:#0D1422;outline:none;}" +
      ".tl-leg-act svg{width:18px;height:18px;display:block;}" +
      "@media (max-width:767px){.tl-leg-act{width:44px;height:40px;}" +
      ".tl-leg-act svg{width:22px;height:22px;}}" +
      /* ★켠 것만★ — 끈 지표의 칩을 감춥니다. 지우지 않고 감추기만 하므로
         js/chart-indicator-kit.js 의 querySelectorAll 은 그대로 다 찾습니다.

         ⚠★거래량(.tl-ind-btn) 은 일부러 뺐습니다 — 감추면 막다른 길입니다.★
         실측(2026-09-04, localhost 1440): fx 지표 창(js/chart-indicator-picker.js)이
         보여주는 24줄은 전부 틀(kit)의 ★정의★ 입니다 —
           MA · EMA · WMA · BOLL · KDJ · ATR · StochRSI · CCI · OBV · SAR ·
           VWAP · Stochastic · Williams %R · ADX/DMI · Supertrend · Ichimoku ·
           RSI · MACD · Momentum · ROC · MFI · CMF · TRIX · AO
         ★이 목록에 거래량이 없습니다.★ 거래량은 틀 지표가 아니라 js/chart.js 가
         그리는 막대를 이 파일이 껐다 켜는 것이라서(맨 위 주석) 정의가 없습니다.
         옛 목록(js/chart-indicator-menu.js:144)에는 VOL 이 있지만, 그 목록은
         picker 가 대신 뜨면서 회원에게 더 이상 보이지 않습니다.
         그래서 거래량 칩까지 감추면 ★한 번 끄고 나면 다시 켤 길이 없습니다.★
         칩은 남기고 흐리게만 둡니다(예전 그대로) — 그게 되돌릴 수 있는 쪽입니다.
         ⓘ 거래량을 fx 창에 넣는 것은 js/chart-indicator-picker.js 를 고쳐야 해서
           이번 건 밖입니다(그 파일은 지금 다른 팀이 만지는 중). PM 에게 올립니다. */
      '.tl-ind-bar[data-onlyon="1"] > .tl-kit-btn[aria-pressed="false"]{display:none;}';
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

  /* =====================================================================
   * 칩 줄 접기 — 2026-09-02 P2
   *
   * ── 무엇이 문제였나 (조사팀 실측, 360x800) ────────────────────────────
   *   .tl-ind-bar 는 차트 ★위에 겹쳐★ 그립니다. 차트를 밀어내지 않습니다.
   *   그래서 칩이 늘어나도 .chart-container 는 560px 그대로이고,
   *   늘어난 만큼 캔들이 그냥 덮입니다.
   *       기본 9칩   칩 줄 76px (3줄)  주 칸 330px  가림 23.0%
   *       14칩       칩 줄 129px(5줄)  주 칸 182px  가림 70.6%
   *       21칩       칩 줄 235px(9줄)  주 칸 182px  가림 128.8%
   *   지표를 ★전부 꺼도★ 칩은 남습니다 — 칩이 "켜진 목록" 이 아니라
   *   켜고 끄는 ★버튼 자체★ 라서 그게 맞습니다. 그건 안 바꿉니다.
   *
   * ── 트레이딩뷰가 하는 대로 (2026-09-02 조사팀 실측) ───────────────────
   *   트레이딩뷰도 범례를 차트 위에 겹쳐 그립니다(우리와 같음).
   *   ★다만 범례에 접기 꺾쇠가 있습니다★ — 우리에게 없던 것이 그것뿐이라
   *   그것만 만들었습니다. 칩을 지우거나 옮기지 않았습니다.
   *
   * ── 처음에 접혀 있을지 ────────────────────────────────────────────────
   *   회원이 한 번이라도 직접 접거나 편 적이 있으면 ★그 선택이 우선★ 입니다.
   *   아직 한 번도 안 눌렀을 때만 자동으로 정합니다 —
   *   ★칩 줄이 두 줄을 넘으면(> 56px) 접습니다.★
   *   근거 — 두 줄은 49px(1440·14칩 실측) 이라 가림 15.8% 로 견딜 만하지만,
   *   세 줄부터는 76px(360·9칩 실측) 로 주 칸의 23% 를 덮습니다.
   *   화면 폭을 조건으로 쓰지 않고 ★실제 줄 높이★ 를 재는 이유는,
   *   칩 개수가 회원마다 다르기 때문입니다(지표를 몇 개 얹었느냐).
   *   그래서 넓은 화면이라도 칩이 많으면 접히고, 좁아도 적으면 안 접힙니다.
   * ===================================================================== */
  var FOLD_KEY = "chart-ind-fold";
  /* ⚠ 이 두 값은 ★칩 글씨 크기에 딸린 값★ 입니다. 칩 글씨를 바꾸면 같이 바꾸세요.
     2026-09-03 칩 글씨 11px -> 17px (대표 지시 "글씨 다 키워줘") 로 줄 높이가
     바뀌어 같이 올렸습니다. 안 올리면 ★뜻이 달라집니다★ — 실측으로 확인했습니다.
       11px 시절  1줄 23px · 2줄 49px · 3줄 76px   -> 30 / 56
       17px 지금  1줄 32px · 2줄 67px · 3줄 102.5px -> 40 / 80
     그대로 두었을 때 (실측) 1440·기본 9칩이 2줄 67px > 56 이라 ★처음부터 접힌 채★
     떴습니다. 회원은 칩 대신 "▾ 지표 9" 만 보게 됩니다. 뜻은 예전 그대로
     — ★세 줄부터 접는다★ — 로 지키려고 값만 옮겼습니다. */
  var FOLD_LINE1 = 40; /* 한 줄 = 32px (실측). 이하면 접을 것이 없습니다 */
  var FOLD_LINE2 = 80; /* 두 줄까지는 그냥 둡니다 (실측 2줄 67px) */
  var foldBtn = null;
  var folded = false;
  var foldChosen = false; /* 회원이 직접 눌렀나 */

  function loadFold() {
    try {
      if (!App.Storage || typeof App.Storage.load !== "function") return;
      var v = App.Storage.load(FOLD_KEY);
      if (v && typeof v.folded === "boolean") {
        folded = v.folded;
        foldChosen = true;
      }
    } catch (e) {
      /* 저장된 값이 이상하면 자동 판단 그대로 */
    }
  }

  function saveFold() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") {
        App.Storage.save(FOLD_KEY, { folded: folded });
      }
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작 */
    }
  }

  /** 지금 칩이 몇 개인가 — 접었을 때 "지표 14" 로 보여줍니다.
   *  (접기 버튼 자신은 빼고 셉니다) */
  /** 지금 ★감춰져 있는★ 칩인가 (13절 - 켠 것만 보이기).
   *  한 곳에서만 판단합니다. CSS 선택자와 뜻이 어긋나면 안 되므로
   *  ★injectStyle 의 [data-onlyon] 규칙과 같은 조건★ 을 씁니다. */
  function isHiddenChip(el) {
    if (!ONLY_ON || !el || !el.getAttribute) return false;
    if (String(el.className || "").indexOf("tl-kit-btn") === -1) return false;
    return el.getAttribute("aria-pressed") === "false";
  }

  function chipCount() {
    if (!buttonsEl) return 0;
    var kids = buttonsEl.children || [];
    var n = 0;
    for (var i = 0; i < kids.length; i++) {
      if (String(kids[i].className || "").indexOf("tl-ind-fold") !== -1) continue;
      /* 켠 것만 보이기(13절) 로 감춰진 칩은 세지 않습니다 — 안 그러면
         접었을 때 "지표 10" 이라고 하고 펴면 1개만 나옵니다.
         감추는 것은 ★틀 칩(.tl-kit-btn)뿐★ 입니다. 거래량은 늘 보입니다
         (위 injectStyle 13절 주석 — 감추면 다시 켤 길이 없습니다). */
      if (isHiddenChip(kids[i])) continue;
      n++;
    }
    return n;
  }

  /* class 를 글자로 다룹니다 — 이 막대의 class 는 늘 "tl-ind-bar" 하나입니다.
     (classList 를 쓰면 테스트의 가짜 DOM 에서 터집니다) */
  function isFoldedClass() {
    return String(buttonsEl && buttonsEl.className || "").indexOf("tl-ind-folded") !== -1;
  }
  function setFoldedClass(on) {
    if (!buttonsEl) return;
    buttonsEl.className = on ? "tl-ind-bar tl-ind-folded" : "tl-ind-bar";
  }

  function paintFold() {
    if (!buttonsEl || !foldBtn) return;
    setFoldedClass(folded);
    var label = folded ? "▾ 지표 " + chipCount() : "▴";
    if (foldBtn.textContent !== label) foldBtn.textContent = label;
    var t = folded ? "지표 칩 펴기" : "지표 칩 접기";
    if (foldBtn.getAttribute("title") !== t) {
      foldBtn.setAttribute("title", t);
      foldBtn.setAttribute("aria-label", t);
    }
    foldBtn.setAttribute("aria-expanded", folded ? "false" : "true");
  }

  function toggleFold() {
    folded = !folded;
    foldChosen = true;
    saveFold();
    refreshFold();
  }

  /* ---------------------------------------------------------------------
   * 다시 재고 다시 그리기 — 칩이 늘거나 화면 폭이 바뀔 때마다 부릅니다.
   *
   *   1) 접기 버튼을 잠깐 숨기고 ★칩만★ 의 줄 높이를 잽니다(hNat).
   *      버튼 자체가 폭을 차지해 줄을 하나 더 만들 수 있어서, 그 영향을
   *      뺀 값으로 판단해야 합니다.
   *      ⚠ 실제로 이걸 안 했을 때 1440·기본 9칩에서 23px(1줄) 이던 것이
   *        접기 버튼 때문에 49px(2줄) 로 늘었습니다 — 고치려던 것을 오히려
   *        키운 셈이라 이 단계를 넣었습니다.
   *   2) 회원이 아직 한 번도 안 눌렀으면 hNat 로 접힘 여부를 정합니다.
   *      두 줄(실측 49px)까지는 그냥 둡니다. 세 줄부터 접습니다.
   *   3) 접기 버튼은 ★접을 것이 있을 때만★ 보여줍니다.
   *      한 줄짜리면 접을 이유가 없으니 아예 안 그립니다 — 그래야 넓은
   *      화면에서 예전과 완전히 같은 높이가 나옵니다.
   *      단, 접혀 있을 때는 되돌릴 방법이 그 버튼뿐이라 항상 보여줍니다.
   * ------------------------------------------------------------------- */
  function refreshFold() {
    if (!buttonsEl || !foldBtn) return;

    var wasFolded = isFoldedClass();
    setFoldedClass(false);
    foldBtn.style.display = "none";
    var hNat = buttonsEl.offsetHeight || 0; /* 같은 프레임 안이라 화면에 안 비칩니다 */
    setFoldedClass(wasFolded);

    if (hNat) {
      if (!foldChosen) folded = hNat > FOLD_LINE2;
      foldBtn.style.display = folded || hNat > FOLD_LINE1 ? "" : "none";
    } else {
      /* 아직 그려지기 전 — 다음 변화 때 다시 봅니다 */
      foldBtn.style.display = "";
    }
    paintFold();
  }

  /* 칩은 나중에도 늘어납니다(js/chart-indicator-kit.js 가 이어 붙입니다).
     그때마다 개수 표시와 자동 판단을 다시 합니다. 회원이 한 번 누른 뒤에는
     자동 판단이 꺼지므로 회원의 선택을 덮지 않습니다. */
  var foldWatcher = null;
  var foldResizeRaf = 0;
  function watchChips() {
    if (foldWatcher || typeof MutationObserver === "undefined" || !buttonsEl) return;
    foldWatcher = new MutationObserver(function () {
      refreshFold();
    });
    foldWatcher.observe(buttonsEl, { childList: true });
  }

  function buildFold() {
    if (!buttonsEl || foldBtn) return;
    loadFold();
    foldBtn = document.createElement("button");
    foldBtn.type = "button";
    foldBtn.className = "tl-ind-fold";
    foldBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      toggleFold();
    });
    buttonsEl.appendChild(foldBtn);
    refreshFold();
    watchChips();

    /* 화면 폭이 바뀌면 줄 수도 바뀝니다(폰 가로세로 돌리기 · 창 크기 조절).
       회원이 이미 고른 뒤에도 "접기 버튼을 보여줄지" 는 다시 정해야 하므로
       그냥 부릅니다 — refreshFold() 안에서 회원의 선택은 덮지 않습니다. */
    if (window.addEventListener) {
      window.addEventListener("resize", function () {
        if (foldResizeRaf) return;
        if (!window.requestAnimationFrame) {
          refreshFold();
          return;
        }
        foldResizeRaf = window.requestAnimationFrame(function () {
          foldResizeRaf = 0;
          refreshFold();
        });
      });
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
    buildFold();
    /* ★buildFold() 뒤★ 여야 합니다 — 접기 버튼이 있어야 refreshFold 가 돕니다 */
    buildLegendActs();
    return true;
  }

  /* =====================================================================
   * 13) 이름표 행동 버튼 (눈 · 설정 · 지우기) + ★켠 것만 보이기★
   *     차트 상단 1단계 — 2026-09-04
   * ---------------------------------------------------------------------
   * ── 무엇이 문제였나 (실측, localhost) ────────────────────────────────
   *   칩은 "켜진 목록" 이 아니라 켜고 끄는 ★버튼★ 이라, 지표를 다 꺼도
   *   10개가 그대로 남습니다. 1440 에서 2줄 67px 로 차트 왼쪽 위를 덮습니다.
   *   390 에서는 접혀서 "▾ 지표 9" 32px 이 캔들 띠를 덮습니다.
   *
   * ── 트레이딩뷰는 (2026-09-04 실측, tradingview.com/chart, 로그인 없음) ─
   *   범례에 ★켠 지표만★ 한 줄(24px)씩 쌓입니다. 끄고 켜기는 범례가 아니라
   *   Indicators 창에서 합니다. 이름 위에 마우스를 올리면 그때 버튼이 뜹니다 —
   *   Hide(눈) · Settings · Remove · More, 각 28x24, 묶음 113px.
   *   CSS 로도 확인했습니다 : .buttons-quatTGAC{opacity:0} → :hover 에서 1.
   *   폰은 .touchMode-quatTGAC 로 줄 높이를 24 → 26px 로 따로 잡습니다.
   *
   * ── ★순서가 이 작업의 전부입니다★ ───────────────────────────────────
   *   지금 회원은 ★칩을 눌러 지표를 끕니다.★
   *   꺼진 칩을 먼저 감추면 끄는 길이 사라집니다(조용한 고장).
   *   그래서 ① 눈 버튼을 먼저 만들고 ② 그 다음에 감춥니다.
   *   이 파일 안에서도 buildLegendActs() 안에서 그 순서로 부릅니다.
   *
   * ── 끈 지표를 다시 켜는 길 (막다른 길이 없는지 확인했습니다) ─────────
   *   가로 막대의 "fx 지표" 창입니다(js/chart-indicator-picker.js).
   *   거래량(VOL)도 그 목록에 있습니다 — js/chart-indicator-menu.js:144.
   *   지운 지표는 그 창의 "지표 추가"(kit.listDefs)로 다시 얹습니다.
   *
   * ── 폰 ──────────────────────────────────────────────────────────────
   *   hover 가 없으니 ★탭하면 버튼이 뜹니다.★
   *   탭이 토글까지 하지 않도록 잡기(capture) 단계에서 멈춥니다 —
   *   안 막으면 탭 한 번에 "버튼도 뜨고 지표도 꺼집니다".
   *   손가락으로 누를 것이라 44x40 으로 키웁니다(도구막대 폰 규칙과 같음).
   *
   * ── js/chart-indicator-kit.js 는 한 글자도 안 건드렸습니다 ───────────
   *   칩을 ★지우지 않고 CSS 로 감추기만★ 합니다. 그래서 틀이 하는
   *   barEl.querySelectorAll(".tl-kit-btn") 은 예전 그대로 다 찾습니다.
   *   버튼 묶음도 칩 줄(.tl-ind-bar) 안이 아니라 ★그 바깥(.chart-wrap)★ 에
   *   답니다 — 남의 코드가 세는 children 수를 바꾸지 않기 위해서입니다.
   *
   * ── 되돌리기 ────────────────────────────────────────────────────────
   *   ONLY_ON 을 false 로 바꾸면 칩이 전부 다시 보입니다(버튼은 남습니다).
   *   자세한 것은 보고서의 "되돌리는 방법" 을 보세요.
   * ===================================================================== */

  /** false 로 두면 예전처럼 칩이 전부 보입니다 (되돌리기 스위치) */
  var ONLY_ON = true;

  /* 아이콘 — ★우리가 그린 것★ 입니다. 트레이딩뷰 것을 가져오지 않았습니다.
     스프라이트(assets/icons/chart-tools.svg)도 일부러 안 씁니다 — 그건
     js/chart-drawings.js 가 넣어주는 것이라, 그 파일을 되돌리면 여기 아이콘이
     조용히 사라집니다. 그래서 이 파일 안에 직접 그립니다. */
  var ICO_HEAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var ICONS = {
    eye:
      ICO_HEAD +
      '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/>' +
      '<circle cx="12" cy="12" r="2.6"/></svg>',
    /* 설정 — 톱니가 아니라 ★조절손잡이(슬라이더)★ 입니다.
       톱니를 그렸더니 18 크기에서 살이 뭉쳐 ★해 모양★ 으로 보였습니다(실측 캡처).
       조절손잡이는 같은 크기에서 뜻이 분명합니다. */
    gear:
      ICO_HEAD +
      '<path d="M4 7.5h16M4 12h16M4 16.5h16"/>' +
      '<circle cx="9" cy="7.5" r="2.1"/><circle cx="15" cy="12" r="2.1"/>' +
      '<circle cx="8" cy="16.5" r="2.1"/></svg>',
    trash:
      ICO_HEAD + '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5"/></svg>'
  };

  var actsEl = null; /* 버튼 묶음 — 칩 줄 ★바깥★(.chart-wrap)의 자식입니다 */
  var actsChip = null; /* 지금 어느 칩에 붙어 있나 */
  var actsPress = null; /* 버튼을 만들 때의 켜짐 상태 — 바뀌면 다시 만듭니다 */
  var actsHideTimer = 0;
  var pressWatcher = null;

  /** 마우스를 올릴 수 있는 기기인가 — 트레이딩뷰의 @media (any-hover:hover) 와 같은 판단 */
  function canHover() {
    try {
      if (window.matchMedia) return !!window.matchMedia("(hover: hover)").matches;
    } catch (e) {
      /* 못 물어보면 마우스가 있다고 봅니다 — 그래야 데스크톱이 안 바뀝니다 */
    }
    return true;
  }

  /** 칩인가 (접기 버튼·버튼묶음은 칩이 아닙니다) */
  function chipOf(node) {
    while (node && node !== document.body) {
      var c = String(node.className || "");
      if (c.indexOf("tl-leg-act") !== -1) return null;
      if (c.indexOf("tl-ind-fold") !== -1) return null;
      if (c.indexOf("tl-ind-btn") !== -1 || c.indexOf("tl-kit-btn") !== -1) return node;
      node = node.parentNode;
    }
    return null;
  }

  /** 이 칩이 무엇인지 — 틀 지표(kit)인지, 이 파일이 든 거래량(ind)인지 */
  function chipInfo(chip) {
    if (!chip || !chip.getAttribute) return null;
    var kid = chip.getAttribute("data-kit");
    if (kid) return { who: "kit", id: kid };
    var ind = chip.getAttribute("data-ind");
    if (ind) return { who: "ind", id: ind };
    return null;
  }

  function makeAct(icon, label, fn) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tl-leg-act";
    b.setAttribute("title", label);
    b.setAttribute("aria-label", label);
    b.innerHTML = ICONS[icon] || "";
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      try {
        fn();
      } catch (e) {
        /* 한 버튼이 실패해도 나머지 화면은 그대로 둡니다 */
      }
      hideActs();
    });
    return b;
  }

  /** 이 칩에 맞는 버튼을 다시 채웁니다.
   *  거래량은 ★눈 하나뿐★ 입니다 — 막대를 그리는 것은 js/chart.js 라
   *  (수정 금지 파일) 설정할 값도 없고 지울 수도 없습니다.
   *  눌러도 아무 일이 안 일어나는 버튼은 만들지 않습니다. */
  function fillActs(chip) {
    if (!actsEl) return false;
    var info = chipInfo(chip);
    if (!info) return false;
    while (actsEl.firstChild) actsEl.removeChild(actsEl.firstChild);

    /* 눈은 ★지금 상태의 반대★ 로 동작합니다.
       ⚠ 늘 "숨기기" 로 두면 폰에서 막다른 길이 됩니다 — 진짜 터치로 재서
         찾았습니다(2026-09-04, CDP Input.dispatchTouchEvent, 390).
         폰은 탭이 토글을 대신하지 않으므로(아래 buildLegendActs) 꺼진
         거래량 칩을 탭하면 "숨기기" 만 나오고, 눌러도 이미 꺼져 있어
         ★다시 켤 방법이 없었습니다.★ */
    if (info.who === "ind") {
      var indOn = !!(state && state[info.id]);
      actsEl.appendChild(
        makeAct("eye", indOn ? "숨기기" : "보이기", function () {
          setOn(info.id, !indOn);
        })
      );
      return true;
    }

    var kit = App.ChartIndicatorKit || null;
    if (!kit) return false;
    if (typeof kit.setOn === "function") {
      var kitOn = typeof kit.isOn === "function" ? !!kit.isOn(info.id) : true;
      actsEl.appendChild(
        makeAct("eye", kitOn ? "숨기기" : "보이기", function () {
          kit.setOn(info.id, !kitOn);
        })
      );
    }
    if (App.ChartIndicatorSettings && typeof App.ChartIndicatorSettings.open === "function") {
      actsEl.appendChild(
        makeAct("gear", "설정", function () {
          App.ChartIndicatorSettings.open(info.id, chip);
        })
      );
    }
    if (typeof kit.removeInstance === "function") {
      actsEl.appendChild(
        makeAct("trash", "지우기", function () {
          kit.removeInstance(info.id);
        })
      );
    }
    return !!actsEl.firstChild;
  }

  /* ── 폰 하단 매수/매도 바 (.tl-order-bar) ────────────────────────────
   *  ⚠ 이 버튼 묶음은 화면 아래쪽에 놓일 수 있습니다. 칩 줄은 차트 위쪽에
   *    있지만, 회원이 페이지를 스크롤해 차트 윗부분이 화면 아래로 내려오면
   *    버튼이 ★고정된 주문 막대 밑★ 으로 들어갑니다.
   *
   *  ★오늘(2026-09-04) P1 이 정확히 이 종류였습니다★ — 지표 설정판의
   *  "확인" 이 매도/숏 위에 얹혀서, 누르면 주문창이 열렸습니다(2f9a196).
   *  그때 원인이 window.innerHeight 만 보고 .tl-order-bar 를 안 본 것이었습니다.
   *
   *  ── 왜 또 적나 (계산이 세 벌이 되는 것 아닌가) ──────────────────────
   *  js/chart-drawings.js 의 chipFloorY() 와 ★같은 모양★ 입니다. 그 함수는
   *  밖으로 내주지 않고(모듈 안 지역 함수), tests/chart-popup-floor-census.js 는
   *  ★파일 안에 .tl-order-bar 를 찾는 코드가 있는지★ 로 보호 여부를 셉니다.
   *  그래서 빌려 쓰는 것으로는 보호군에 들어가지 못하고, 그 파일을 되돌리면
   *  여기 바닥이 조용히 사라집니다. 이 프로젝트는 창을 띄우는 모듈이 저마다
   *  자기 바닥을 갖는 방식입니다(js/chart-indicator-menu.js:423 floorY() 도 같음).
   *  ⚠ chipFloorY() 를 고치면 ★여기도 같이★ 고치세요.
   */
  var ACTS_EDGE = 8;

  function actsFloorY() {
    var lim = (window.innerHeight ||
      (document.documentElement && document.documentElement.clientHeight) || 0) - ACTS_EDGE;
    if (document.fullscreenElement || document.webkitFullscreenElement) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim; /* 1920·768 에는 없습니다 */
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - ACTS_EDGE < lim) lim = r.top - ACTS_EDGE;
    return lim;
  }

  /** 칩 옆에 붙입니다. 오른쪽이 모자라면 왼쪽으로, 아래가 모자라면 위로 —
   *  ★차트 밖으로 나가지 않게★ 잡아 둡니다 (폰에서 특히). */
  function placeActs(chip) {
    var wrap = actsEl && actsEl.parentNode;
    if (!wrap || !chip.getBoundingClientRect || !wrap.getBoundingClientRect) return;
    var wr = wrap.getBoundingClientRect();
    var cr = chip.getBoundingClientRect();
    var aw = actsEl.offsetWidth || 0;
    var ah = actsEl.offsetHeight || 0;
    var maxW = wrap.clientWidth || wr.width || 0;
    var maxH = wrap.clientHeight || wr.height || 0;

    var left = cr.right - wr.left + 4;
    if (aw && maxW && left + aw > maxW - 2) left = cr.left - wr.left - aw - 4;
    if (left < 2) left = 2;
    if (aw && maxW && left + aw > maxW - 2) left = maxW - aw - 2;
    if (left < 0) left = 0;

    /* ── 세로 — ★화면에 실제로 보이는 띠★ 안에만 놓습니다 ──────────────
       위끝  = 화면 맨 위 + 8
       아래끝 = actsFloorY()  (폰 매수/매도 바 윗변 - 8. 위 주석 참고)
       둘 다 ★화면 기준★ 이라 차트 칸 기준으로 옮겨서 같은 자로 잽니다
       (js/chart-drawings.js:5991 이 chipFloorY() 를 옮겨 쓰는 것과 같습니다).

       ⚠ 예전에 여기서 ★차트 칸 안★ 으로도 같이 묶었다가 틀렸습니다.
         차트 칸이 화면보다 훨씬 길어서(360x640 실측 — 차트 y747, 화면 640)
         "칸 안" 과 "화면 안" 이 서로 다른 답을 내고, 마지막에 있던
         top<0 -> 0 이 바닥 잡은 것을 도로 풀어 ★바를 160px 침범★ 했습니다
         (3px 간격 868회 훑어서 찾았습니다). 지금은 ★화면 띠 하나만★ 봅니다. */
    var visTop = ACTS_EDGE - wr.top;
    var visBot = actsFloorY() - wr.top;
    var chipTop = cr.top - wr.top;
    var chipBot = cr.bottom - wr.top;

    /* 칩 자체가 그 띠 밖이면(스크롤로 화면을 벗어남) ★아예 안 띄웁니다.★
       칩이 안 보이는데 단추만 떠 있으면 그게 회원이 못 누르는 유령입니다. */
    if (chipBot <= visTop || chipTop >= visBot) return false;

    var top = chipTop + (cr.height - ah) / 2;
    if (ah && top + ah > visBot) {
      /* 아래가 모자라면 ★칩 위★ 로 올립니다.
         ⚠ 키를 줄이지 않습니다 — 한 줄짜리 단추 띠라 줄이면 손가락으로 못
           누르는 크기가 됩니다(폰 44x40 은 손가락 하한). 여러 줄짜리 판이면
           키도 같이 줄여야 합니다 — js/chart-timezone.js 가 그 함정에
           빠진 적이 있고, 2f9a196 에서 maxHeight 를 같이 안 줄이면 판이
           안 밀리고 안쪽만 잘린다는 것이 확인됐습니다. */
      top = chipTop - ah - 4;
    }
    if (top < visTop) top = visTop;
    if (ah && top + ah > visBot) top = visBot - ah;
    /* 그 자리조차 없으면(띠가 단추보다 얇음) 안 띄웁니다 — 억지로 넣으면
       반드시 바 밑이나 화면 밖으로 삐져나갑니다. */
    if (top < visTop - 0.5) return false;

    actsEl.style.left = Math.round(left) + "px";
    actsEl.style.top = Math.round(top) + "px";
    return true;
  }

  function showActs(chip) {
    if (!actsEl || !chip) return;
    if (actsHideTimer) {
      clearTimeout(actsHideTimer);
      actsHideTimer = 0;
    }
    /* 마우스를 칩 위에서 움직이면 mouseover 가 여러 번 옵니다.
       같은 칩이고 켜짐 상태도 그대로면 다시 만들지 않습니다 —
       버튼을 매번 새로 만들면 깜빡이고, 누르려던 버튼이 사라집니다. */
    var press = chip.getAttribute ? chip.getAttribute("aria-pressed") : null;
    if (actsChip === chip && actsPress === press && actsEl.className.indexOf("tl-leg-open") !== -1) {
      return;
    }
    if (!fillActs(chip)) {
      hideActs();
      return;
    }
    actsPress = press;
    actsChip = chip;
    actsEl.className = "tl-leg-acts tl-leg-open";
    /* 자리를 못 잡으면(칩이 화면 밖이거나 띠가 너무 얇음) 다시 감춥니다 */
    if (!placeActs(chip)) hideActs();
  }

  function hideActs() {
    if (actsHideTimer) {
      clearTimeout(actsHideTimer);
      actsHideTimer = 0;
    }
    actsChip = null;
    actsPress = null;
    if (actsEl) actsEl.className = "tl-leg-acts";
  }

  function hideActsSoon() {
    if (actsHideTimer) clearTimeout(actsHideTimer);
    /* 칩에서 버튼으로 마우스가 건너갈 시간(4px 틈)을 줍니다 */
    actsHideTimer = setTimeout(hideActs, 180);
  }

  /** 켠 것만 보이게 — ★반드시 버튼을 만든 뒤에★ 부릅니다 */
  /** ⚠ ★class 가 아니라 data 속성★ 을 씁니다.
   *  이 막대의 class 는 늘 "tl-ind-bar"(또는 +" tl-ind-folded") 하나여야 합니다 —
   *  setFoldedClass 가 className 을 통째로 새로 쓰고(위), 테스트 하네스도
   *  className 을 ★글자 그대로 비교★ 합니다(tests/_kit-harness.js:81,
   *  tests/chart-indicators.test.js:458). 여기에 class 를 하나 더 붙였더니
   *  가짜 DOM 이 막대를 못 찾아 버튼이 5개 -> 0개로 읽혔습니다(실측).
   *  data 속성은 className 을 건드리지 않아 둘 다 안전합니다. */
  function applyOnlyOn() {
    if (!buttonsEl || !buttonsEl.setAttribute) return;
    if (ONLY_ON) buttonsEl.setAttribute("data-onlyon", "1");
    else if (buttonsEl.removeAttribute) buttonsEl.removeAttribute("data-onlyon");
  }

  /** ⚠ 이 함수가 실패해도 ★칩 줄은 반드시 살아 있어야 합니다.★
   *  buildButtons() 의 맨 끝에서 불리는데, 여기서 예외가 나면 칩 줄 자체가
   *  안 만들어집니다(테스트 하네스의 가짜 DOM 에서 실제로 그랬습니다 —
   *  addEventListener 가 없는 흉내 요소라 터졌고, 버튼 5개가 0개가 됐습니다).
   *  그래서 통째로 감싸고, 없는 기능은 건너뜁니다. */
  function buildLegendActs() {
    if (actsEl || !buttonsEl) return;
    var wrap = buttonsEl.parentNode;
    if (!wrap) return;
    if (!document.createElement || !buttonsEl.addEventListener) {
      /* 버튼은 못 만들지만 ★켠 것만 보이기★ 는 CSS 라 그대로 걸어 둡니다 */
      applyOnlyOn();
      return;
    }
    try {
      buildLegendActsInner(wrap);
    } catch (e) {
      /* 버튼을 못 붙여도 칩 줄과 접기는 그대로 씁니다 */
      applyOnlyOn();
    }
  }

  function buildLegendActsInner(wrap) {

    actsEl = document.createElement("div");
    actsEl.className = "tl-leg-acts";
    actsEl.setAttribute("aria-label", "지표 다루기");
    wrap.appendChild(actsEl);

    if (canHover()) {
      buttonsEl.addEventListener("mouseover", function (ev) {
        var chip = chipOf(ev.target);
        if (chip) showActs(chip);
      });
      buttonsEl.addEventListener("mouseout", function (ev) {
        if (chipOf(ev.relatedTarget)) return;
        hideActsSoon();
      });
      actsEl.addEventListener("mouseover", function () {
        if (actsHideTimer) {
          clearTimeout(actsHideTimer);
          actsHideTimer = 0;
        }
      });
      actsEl.addEventListener("mouseout", hideActsSoon);
    } else {
      /* ★폰★ — 탭하면 버튼이 뜹니다. 잡기(capture) 단계에서 멈춰야
         칩 자신의 클릭(=토글)이 같이 일어나지 않습니다. */
      buttonsEl.addEventListener(
        "click",
        function (ev) {
          var chip = chipOf(ev.target);
          if (!chip) return;
          ev.preventDefault();
          ev.stopPropagation();
          if (actsChip === chip) hideActs();
          else showActs(chip);
        },
        true
      );
      document.addEventListener("click", function (ev) {
        if (!actsChip) return;
        var n = ev.target;
        while (n && n !== document.body) {
          if (n === actsEl || n === actsChip) return;
          n = n.parentNode;
        }
        hideActs();
      });
    }

    if (window.addEventListener) {
      window.addEventListener("resize", hideActs);
      window.addEventListener("scroll", hideActs, true);
    }

    /* ① 버튼을 만든 뒤 ② 감춥니다. ★이 순서를 바꾸지 마세요.★ */
    applyOnlyOn();
    watchPressed();
    refreshFold();
  }

  /** 켜짐/꺼짐이 바뀌면 칩이 나타나거나 사라집니다 — 줄 높이가 달라지므로
   *  접기 판단을 다시 하고, 사라진 칩에 붙어 있던 버튼 묶음은 치웁니다.
   *  ⚠ 켠 것만 보이기는 data 속성이라 className 을 새로 써도 안 지워집니다.
  function watchPressed() {
    if (pressWatcher || typeof MutationObserver === "undefined" || !buttonsEl) return;
    pressWatcher = new MutationObserver(function () {
      if (isHiddenChip(actsChip)) hideActs();
      refreshFold();
      applyOnlyOn();
    });
    pressWatcher.observe(buttonsEl, {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-pressed"]
    });
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
    /* 칩 줄 접기 — 확인용 */
    isFoldedForTest: function () {
      return folded;
    },
    toggleFoldForTest: toggleFold,
    buildFoldForTest: buildFold,
    refreshFoldForTest: refreshFold,
    buildButtonsForTest: buildButtons,
    /* 13) 이름표 행동 버튼 — 확인용 */
    ONLY_ON_FOR_TEST: ONLY_ON,
    buildLegendActsForTest: buildLegendActs,
    showActsForTest: showActs,
    hideActsForTest: hideActs,
    chipOfForTest: chipOf,
    fillActsForTest: fillActs,
    canHoverForTest: canHover,
    applyOnlyOnForTest: applyOnlyOn,
    chipCountForTest: chipCount,
    isHiddenChipForTest: isHiddenChip,
    actsFloorYForTest: actsFloorY,
    placeActsForTest: placeActs,
    getActsElForTest: function () {
      return actsEl;
    },
    FOLD_LINE1_FOR_TEST: FOLD_LINE1,
    FOLD_LINE2_FOR_TEST: FOLD_LINE2,
    COLORS: COLORS,
    MA_PERIODS: MA_PERIODS,
    BB_PERIOD: BB_PERIOD,
    BB_MULT: BB_MULT,
  };
})();
