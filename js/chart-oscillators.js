/* =========================================================================
 * js/chart-oscillators.js — App.ChartOscillators   (차트 3단계)
 * =========================================================================
 * 차트 아래 "별도 칸(pane)" 에 RSI 와 MACD 를 그립니다.
 *
 * ── 왜 별도 칸인가 ────────────────────────────────────────────────────
 * RSI 는 0~100, MACD 는 가격 차이(수십 USDT)라서 값의 범위가 캔들 가격
 * (수만 USDT)과 완전히 다릅니다. 같은 가격축에 얹으면 선이 차트 맨 아래에
 * 눌러붙어 아무것도 안 보입니다.
 * 2단계(거래량)는 chart.js 가 만든 오버레이 스케일이라 같은 칸 아래 20%
 * 자리를 쓸 수밖에 없었지만, RSI·MACD 는 우리가 처음부터 만드는 것이라
 * 라이브러리의 진짜 pane 기능을 씁니다.
 *
 *   라이브러리 확인 (lightweight-charts 5.2.0 standalone 번들을 직접 열어
 *   확인, 2026-08-26):
 *     chart.addPane(preserveEmptyPane=false)  → 새 칸을 아래에 추가
 *     pane.addSeries(정의, 옵션)              → 그 칸에 시리즈 추가
 *     pane.setStretchFactor(n)                → 칸 높이 비율
 *   pane.getHTMLElement() 도 있지만 이 번들에서는 null 을 돌려줬습니다
 *   (실측 2026-08-26, 1920 localhost). 그래서 칸 이름표는 차트가 만든
 *   표(tr) 의 위치를 재서 .chart-wrap 위에 얹습니다 — 라이브러리 DOM 은
 *   건드리지 않습니다.
 *   번들 안에서 마지막 시리즈가 빠지면 그 칸은 스스로 사라집니다
 *   (Qd(t): preserveEmptyPane 이 false 이고 시리즈가 0개면 칸 제거).
 *   그래서 끌 때는 시리즈만 지우면 칸도 같이 없어집니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두었기 때문에
 * App.ChartFont.getCharts() 로 차트 객체를 그대로 받습니다. 캔들 시리즈는
 * 공개 API 인 chart.panes()[n].getSeries() 로 찾습니다.
 * 1·2·4단계(chart-position-lines / chart-indicators / chart-drawings)와
 * 똑같은 방식입니다.
 *
 * ── 2단계 파일을 고치지 않았습니다 ────────────────────────────────────
 * 켜고 끄는 버튼은 2단계가 만든 지표 막대(.tl-ind-bar) 에 "이어 붙이기만"
 * 합니다. js/chart-indicators.js 는 손대지 않았습니다.
 * 다만 그쪽 paintButtons() 가 .tl-ind-btn 을 전부 훑어 자기 상태로 색을
 * 다시 칠하기 때문에, 우리 버튼은 클래스를 tl-osc-btn 으로 따로 두어
 * 서로의 색을 건드리지 않게 했습니다. 생김새(크기·글씨·간격)는 같습니다.
 *
 * ── 360 에서 넘치지 않게 ──────────────────────────────────────────────
 * 실측(2026-08-26, localhost, 360x800): 차트 칸 330px, 지표 막대 302.8px,
 * 남는 폭 19.2px. 버튼 2개(RSI·MACD)를 그냥 붙이면 한 줄로는 넘칩니다.
 * 막대에는 이미 flex-wrap:wrap 이 걸려 있고 우리 버튼을 맨 뒤에 붙이므로
 * 좁은 화면에서는 둘째 줄로 접힙니다 — 숨는 게 아니라 접힙니다.
 * (4단계 도구막대에서 내린 것과 같은 판단입니다. 옆으로 미는 방식은
 *  스크롤바가 보이지 않아 회원이 버튼이 더 있다는 걸 모릅니다.)
 * 첫 줄의 5개는 자리가 그대로라 지금 화면이 바뀌지 않습니다.
 *
 * ── 꺼져 있으면 계산도 하지 않습니다 ──────────────────────────────────
 * onTick() 첫 줄에서 둘 다 꺼져 있으면 바로 돌아옵니다. 종가 배열도,
 * 누적값도, 타이머도 만들지 않습니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * RSI(와일더)와 MACD(EMA)는 둘 다 "직전 값 하나"만 있으면 다음 값이
 * 나오는 누적식입니다. 그래서
 *   · 같은 봉이 갱신될 때 → 확정된 직전 봉 상태에서 한 걸음만 (O(1))
 *   · 새 봉이 생길 때     → 닫힌 봉을 확정 상태에 접어 넣고 한 걸음 (O(1))
 * 전체 계산은 켤 때와 봉 간격·종목이 바뀔 때만 합니다.
 * 확정 상태를 따로 들고 있어서, 진행 중인 봉의 값이 확정값을 오염시키지
 * 않습니다(EMA 는 한 번 오염되면 계속 끌고 갑니다).
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-oscillators.js"></script> 한 줄 삭제
 *   2) package.json 의 tests/chart-oscillators.test.js 한 토막 삭제
 *   3) js/chart-oscillators.js, tests/chart-oscillators.test.js 파일 삭제
 * 이 파일은 다른 파일을 고치지 않습니다. 지우면 3단계 이전 화면 그대로입니다.
 * (회원 브라우저에 남는 켜짐/꺼짐 기록은 btc_sim_v2_chart-oscillators 키라
 *  그냥 남아 있어도 아무 동작도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.ChartOscillators = (function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 기간 — 바이낸스 기본값
   *   RSI  14
   *   MACD 12 / 26 / 9
   * 바이낸스 선물 차트의 TradingView 차트 기본값이 RSI 14, MACD 12/26/9
   * 입니다. 바이낸스 자체 "Original" 차트는 RSI 를 6/12/24 세 줄로 보여
   * 주지만, 지시받은 값과 회원이 실전에서 더 많이 보는 쪽에 맞춰 14 한
   * 줄로 갑니다.
   * ------------------------------------------------------------------- */
  var RSI_PERIOD = 14;
  var MACD_FAST = 12;
  var MACD_SLOW = 26;
  var MACD_SIGNAL = 9;

  /* RSI 안내선 — 바이낸스와 같은 70 / 30 */
  var RSI_UPPER = 70;
  var RSI_LOWER = 30;

  /* ---------------------------------------------------------------------
   * 색 — 확정 팔레트 안에서만 고릅니다. 새 색을 만들지 않습니다.
   *
   * 바이낸스 배색:
   *   MACD  DIF 흰색 / DEA 노랑 / 막대 초록·빨강
   *   RSI   주선 한 줄 + 70·30 안내선(흐린 회색)
   * 우리 규칙:
   *   · 상승 초록(#26C281)·하락 빨강(#F0506E)은 손익 전용이라 쓰지 않습니다.
   *     특히 빨강은 1단계 청산가 선 색이라 겹치면 회원이 오해합니다.
   *   · 그래서 2단계에서 정한 "밝기 순서로 대응" 을 그대로 이어갑니다.
   *       가장 중요한 선  → 본문 #E7ECF5 (가장 밝음)  = 바이낸스 흰색 자리
   *       다음 선        → 포인트 #F0B429 (골드)      = 바이낸스 노랑 자리
   *       배경 격인 막대 → 보조 #838DA4 (가장 어두움) = 바이낸스 초록·빨강 자리
   *   · MACD 막대는 0선 위/아래 위치만으로 부호가 드러나므로 한 가지 색으로
   *     충분합니다. 굳이 초록·빨강을 만들지 않았습니다.
   *   · 안내선(70/30, 0선)은 테두리색 #1D273B 입니다 — 값이 아니라 눈금이라
   *     데이터 선보다 뒤로 물러나야 합니다.
   * ------------------------------------------------------------------- */
  var COLORS = {
    rsi: "#E7ECF5",
    rsiGuide: "#1D273B",
    macd: "#E7ECF5",
    signal: "#F0B429",
    hist: "#838DA4",
    zero: "#1D273B",
  };

  /* 굵기는 2단계와 같은 1px (바이낸스 실측도 1px) */
  var LINE_WIDTH = 1;

  /* 새 칸 높이 비율 — 캔들 칸을 1 이라 할 때 0.30.
     둘 다 켜면 캔들 약 62% / RSI 약 19% / MACD 약 19% 가 됩니다. */
  var PANE_RATIO = 0.3;

  var STORAGE_KEY = "chart-oscillators";

  /* 기본은 둘 다 꺼짐 — 처음 온 회원 화면은 지금과 똑같습니다 */
  var DEFAULT_STATE = { rsi: false, macd: false };

  var BUTTONS = [
    { key: "rsi", label: "RSI", color: COLORS.rsi },
    { key: "macd", label: "MACD", color: COLORS.signal },
  ];

  /* ---------------- 상태 ---------------- */
  var state = null;
  var chart = null;
  var candleSeries = null;

  var panes = { rsi: null, macd: null };
  var series = { rsi: null, macd: null, signal: null, hist: null };
  var labels = { rsi: null, macd: null };
  /* 이름표 안의 숫자만 따로 들고 있다가 글자만 바꿔 씁니다 (매 틱 innerHTML 을
     다시 만들면 그것만으로 틱당 0.16ms 가 더 들었습니다 — 실측 2026-08-26) */
  var labelParts = { rsi: null, macd: null };

  var closes = [];
  var times = [];
  var closesReady = false;
  var syncMark = { len: -1, first: null };

  /* 확정 상태(직전에 닫힌 봉까지 접어 넣은 값)와 그 봉의 번호 */
  var rsiCommit = null;
  var macdCommit = null;
  var commitIdx = -1;

  var liveRsi = null;
  var liveMacd = null;

  var syncTimer = null;
  var buttonsEl = null;
  var labelPaintAt = 0;

  /* 성능 측정용 (콘솔에서 App.ChartOscillators.getPerf()) */
  var perf = { ticks: 0, totalMs: 0, maxMs: 0 };

  function LC() {
    return window.LightweightCharts;
  }

  function num(v, digits) {
    if (v === null || v === undefined || !isFinite(v)) return "-";
    return v.toFixed(digits === undefined ? 2 : digits);
  }

  /* =====================================================================
   * 계산 — 순수 함수. 차트를 모릅니다(테스트에서 그대로 씁니다).
   * ===================================================================== */

  /** 와일더 방식 한 걸음. st = {avgGain, avgLoss, prevClose} */
  function rsiStep(st, close, period) {
    var ch = close - st.prevClose;
    var gain = ch > 0 ? ch : 0;
    var loss = ch < 0 ? -ch : 0;
    return {
      avgGain: (st.avgGain * (period - 1) + gain) / period,
      avgLoss: (st.avgLoss * (period - 1) + loss) / period,
      prevClose: close,
    };
  }

  /** RSI 값. 내린 적이 없으면 100, 아예 움직이지 않았으면 50 으로 둡니다. */
  function rsiValue(st) {
    if (st.avgLoss === 0) return st.avgGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + st.avgGain / st.avgLoss);
  }

  /**
   * RSI 전체 계산 → [{time, value}]
   * capture 를 주면 capture.state 에 "마지막 봉 직전까지 확정된 상태" 를
   * 담아 줍니다(실시간 갱신에 씁니다). 봉이 period+2 개보다 적으면 null.
   */
  function computeRSI(closeArr, timeArr, period, capture) {
    var out = [];
    if (capture) capture.state = null;
    var n = closeArr ? closeArr.length : 0;
    if (n < period + 1) return out;

    var g = 0;
    var l = 0;
    var i;
    for (i = 1; i <= period; i++) {
      var ch = closeArr[i] - closeArr[i - 1];
      if (ch > 0) g += ch;
      else l -= ch;
    }
    var st = { avgGain: g / period, avgLoss: l / period, prevClose: closeArr[period] };
    out.push({ time: timeArr[period], value: rsiValue(st) });

    for (i = period + 1; i < n; i++) {
      if (capture && i === n - 1) {
        capture.state = { avgGain: st.avgGain, avgLoss: st.avgLoss, prevClose: st.prevClose };
      }
      st = rsiStep(st, closeArr[i], period);
      out.push({ time: timeArr[i], value: rsiValue(st) });
    }
    return out;
  }

  /** MACD 한 걸음. st = {emaFast, emaSlow, sig} */
  function macdStep(st, close, fast, slow, signal) {
    var kf = 2 / (fast + 1);
    var ks = 2 / (slow + 1);
    var kg = 2 / (signal + 1);
    var ef = close * kf + st.emaFast * (1 - kf);
    var es = close * ks + st.emaSlow * (1 - ks);
    var m = ef - es;
    var sg = st.sig === null || st.sig === undefined ? null : m * kg + st.sig * (1 - kg);
    return {
      emaFast: ef,
      emaSlow: es,
      sig: sg,
      macd: m,
      hist: sg === null ? null : m - sg,
    };
  }

  /**
   * MACD 전체 계산 → { macd:[], signal:[], hist:[] }
   * EMA 는 처음 N개의 단순평균으로 시작합니다(TradingView·바이낸스와 같음).
   * 신호선도 처음 9개 MACD 값의 단순평균으로 시작합니다.
   */
  function computeMACD(closeArr, timeArr, fast, slow, signal, capture) {
    var res = { macd: [], signal: [], hist: [] };
    if (capture) capture.state = null;
    var n = closeArr ? closeArr.length : 0;
    if (n < slow) return res;

    var kf = 2 / (fast + 1);
    var ks = 2 / (slow + 1);
    var kg = 2 / (signal + 1);
    var i;
    var sum = 0;

    for (i = 0; i < fast; i++) sum += closeArr[i];
    var ef = sum / fast;
    for (i = fast; i < slow; i++) ef = closeArr[i] * kf + ef * (1 - kf);

    sum = 0;
    for (i = 0; i < slow; i++) sum += closeArr[i];
    var es = sum / slow;

    var sig = null;
    var seedSum = 0;
    var seedCount = 0;

    for (i = slow - 1; i < n; i++) {
      if (capture && i === n - 1) {
        capture.state = i > slow - 1 ? { emaFast: ef, emaSlow: es, sig: sig } : null;
      }
      if (i > slow - 1) {
        ef = closeArr[i] * kf + ef * (1 - kf);
        es = closeArr[i] * ks + es * (1 - ks);
      }
      var m = ef - es;

      if (sig === null) {
        seedSum += m;
        seedCount++;
        if (seedCount === signal) sig = seedSum / signal;
      } else {
        sig = m * kg + sig * (1 - kg);
      }

      res.macd.push({ time: timeArr[i], value: m });
      if (sig !== null) {
        res.signal.push({ time: timeArr[i], value: sig });
        res.hist.push({ time: timeArr[i], value: m - sig, color: COLORS.hist });
      }
    }

    /* 신호선이 아직 자리를 못 잡았으면 실시간 한 걸음도 못 하므로
       확정 상태를 넘기지 않습니다(그 경우 전체 계산으로 돌아갑니다). */
    if (capture && capture.state && capture.state.sig === null) capture.state = null;
    return res;
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
      /* 저장값이 이상하면 기본값(둘 다 꺼짐) 그대로 */
    }
    return s;
  }

  function saveState() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") App.Storage.save(STORAGE_KEY, state);
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작합니다 */
    }
  }

  /* =====================================================================
   * 차트·캔들 찾기 (chart.js 무수정)
   * ===================================================================== */
  function ensureSeries() {
    if (chart && candleSeries) return true;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return false;
    var list = App.ChartFont.getCharts();
    if (!list || !list.length) return false;
    chart = list[0];
    try {
      if (typeof chart.panes !== "function" || typeof chart.addPane !== "function") return false;
      var ps = chart.panes();
      for (var i = 0; i < ps.length; i++) {
        if (typeof ps[i].getSeries !== "function") continue;
        var ss = ps[i].getSeries();
        for (var j = 0; j < ss.length; j++) {
          if (ss[j].seriesType && ss[j].seriesType() === "Candlestick") {
            candleSeries = ss[j];
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("[chart-oscillators.js] 캔들 시리즈를 찾지 못했습니다:", e);
    }
    return false;
  }

  function anyOn() {
    return !!(state && (state.rsi || state.macd));
  }

  /* =====================================================================
   * 종가 배열 맞추기
   * ===================================================================== */
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
      return false;
    }
    closes = new Array(data.length);
    times = new Array(data.length);
    for (var i = 0; i < data.length; i++) {
      closes[i] = data[i].close;
      times[i] = data[i].time;
    }
    closesReady = true;
    syncMark.len = closes.length;
    syncMark.first = times[0];
    return true;
  }

  /* =====================================================================
   * 칸(pane) 만들기 / 없애기
   * ===================================================================== */
  function paneStretch() {
    var base = 1;
    try {
      var main = chart.panes()[0];
      if (main && typeof main.getStretchFactor === "function") {
        var v = main.getStretchFactor();
        if (isFinite(v) && v > 0) base = v;
      }
    } catch (e) {
      /* 못 읽으면 1 기준 */
    }
    return base * PANE_RATIO;
  }

  function makePane(key) {
    if (panes[key]) return panes[key];
    var p = chart.addPane();
    try {
      if (typeof p.setStretchFactor === "function") p.setStretchFactor(paneStretch());
    } catch (e) {
      /* 비율을 못 정하면 라이브러리 기본 높이로 둡니다 */
    }
    panes[key] = p;
    return p;
  }

  function addTo(pane, def, opts) {
    if (typeof pane.addSeries === "function") return pane.addSeries(def, opts);
    return chart.addSeries(def, opts, pane.paneIndex());
  }

  function dropSeries(key) {
    if (!series[key]) return;
    try {
      chart.removeSeries(series[key]);
    } catch (e) {
      /* 이미 없으면 무시 */
    }
    series[key] = null;
  }

  function dropPane(key) {
    dropLabel(key);
    if (key === "rsi") {
      dropSeries("rsi");
    } else {
      dropSeries("hist");
      dropSeries("signal");
      dropSeries("macd");
    }
    /* 시리즈가 0개가 되면 라이브러리가 칸을 스스로 없앱니다.
       혹시 남아 있으면(다른 버전) 직접 없앱니다. */
    var p = panes[key];
    panes[key] = null;
    if (!p) return;
    try {
      var idx = typeof p.paneIndex === "function" ? p.paneIndex() : -1;
      if (idx > 0 && typeof p.getSeries === "function" && p.getSeries().length === 0) {
        if (typeof chart.removePane === "function") chart.removePane(idx);
      }
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 생김새 — 버튼(2단계와 똑같이)과 칸 이름표
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById("chart-osc-style")) return;
    var css =
      /* 2단계 버튼과 크기·글씨·간격을 똑같이 맞춘 별도 클래스.
         같은 클래스를 쓰면 2단계 paintButtons() 가 우리 버튼 색을 덮습니다. */
      ".tl-osc-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-osc-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-osc-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      ".tl-osc-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}" +
      ".tl-osc-label{position:absolute;left:8px;top:2px;z-index:3;pointer-events:none;" +
      "font-size:10px;font-weight:600;line-height:1.4;color:#838DA4;white-space:nowrap;" +
      "font-family:'JetBrains Mono',ui-monospace,monospace;}" +
      ".tl-osc-label b{font-weight:600;margin-left:6px;}";
    var st = document.createElement("style");
    st.id = "chart-osc-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function chartWrap() {
    return document.querySelector(".chart-panel .chart-wrap") || document.querySelector(".chart-wrap");
  }

  /* 칸 이름표를 그 칸의 왼쪽 위에 놓습니다.
     라이브러리는 칸마다 표의 한 줄(tr)을 만들고, 칸 사이에는 1px 짜리
     구분줄이, 맨 아래에는 시간축 줄이 들어갑니다. 줄의 위치를 재서
     .chart-wrap 위에 얹기만 하므로 라이브러리 DOM 은 건드리지 않습니다. */
  function paneRows() {
    try {
      var el = typeof chart.chartElement === "function" ? chart.chartElement() : null;
      if (!el) return [];
      var rows = el.querySelectorAll("tr");
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].children && rows[i].children.length === 3) out.push(rows[i]);
      }
      /* 맨 마지막 줄은 시간축입니다 */
      if (out.length) out.pop();
      return out;
    } catch (e) {
      return [];
    }
  }

  function positionLabels() {
    if (!labels.rsi && !labels.macd) return;
    var wrap = chartWrap();
    if (!wrap) return;
    var rows = paneRows();
    if (!rows.length) return;
    var wr = wrap.getBoundingClientRect();
    ["rsi", "macd"].forEach(function (k) {
      if (!labels[k] || !panes[k]) return;
      var idx = -1;
      try {
        idx = panes[k].paneIndex();
      } catch (e) {
        idx = -1;
      }
      if (idx < 0 || idx >= rows.length) return;
      var r = rows[idx].getBoundingClientRect();
      labels[k].style.top = Math.round(r.top - wr.top + 2) + "px";
    });
  }

  function ensureLabel(key) {
    if (labels[key] || !panes[key]) return;
    var wrap = chartWrap();
    if (!wrap) return;
    injectStyle();
    var el = document.createElement("div");
    el.className = "tl-osc-label";
    el.setAttribute("data-osc", key);
    try {
      var name = document.createElement("span");
      name.textContent = key === "rsi" ? "RSI 14" : "MACD 12 26 9";
      el.appendChild(name);
      var v1 = document.createElement("b");
      v1.style.color = key === "rsi" ? COLORS.rsi : COLORS.macd;
      el.appendChild(v1);
      var parts = [v1];
      if (key === "macd") {
        var v2 = document.createElement("b");
        v2.style.color = COLORS.signal;
        el.appendChild(v2);
        parts.push(v2);
      }
      wrap.appendChild(el);
      labels[key] = el;
      labelParts[key] = parts;
      positionLabels();
    } catch (e) {
      labels[key] = null;
      labelParts[key] = null;
    }
  }

  function dropLabel(key) {
    var el = labels[key];
    labels[key] = null;
    labelParts[key] = null;
    if (el && el.parentNode) {
      try {
        el.parentNode.removeChild(el);
      } catch (e) {
        /* 무시 */
      }
    }
  }

  function paintLabels(force) {
    var now = Date.now();
    /* 글자는 초당 5번까지만 다시 씁니다 — 시세는 그보다 훨씬 자주 옵니다 */
    if (!force && now - labelPaintAt < 200) return;
    labelPaintAt = now;
    if (labelParts.rsi) labelParts.rsi[0].textContent = num(liveRsi);
    if (labelParts.macd) {
      var m = liveMacd || {};
      labelParts.macd[0].textContent = num(m.macd);
      labelParts.macd[1].textContent = num(m.sig);
    }
  }

  /* MACD 값은 "가격 차이" 라서 표시 통화를 따라갑니다.
     캔들 데이터는 항상 USDT 이고, 원화로 보는 회원에게는 원화로 보여줍니다.
     (js/chart.js 의 currencyPriceFormat 과 같은 방식 — 데이터는 그대로 두고
      보이는 글자만 바꿉니다) */
  function macdPriceFormat() {
    var krw = false;
    try {
      krw = !!(App.Config && App.Config.getDisplayCurrency() === "KRW");
    } catch (e) {
      krw = false;
    }
    return {
      type: "custom",
      minMove: krw ? 1 : 0.01,
      formatter: function (v) {
        try {
          if (App.Utils && typeof App.Utils.formatCurrencyPlain === "function") {
            return App.Utils.formatCurrencyPlain(v);
          }
        } catch (e) {
          /* 아래 기본 표시로 */
        }
        return num(v);
      },
    };
  }

  function onCurrencyChange() {
    if (!series.macd) return;
    var f = macdPriceFormat();
    ["macd", "signal", "hist"].forEach(function (k) {
      if (!series[k]) return;
      try {
        series[k].applyOptions({ priceFormat: f });
      } catch (e) {
        /* 무시 */
      }
    });
  }

  function addGuide(target, price, color) {
    try {
      target.createPriceLine({
        price: price,
        color: color,
        lineWidth: 1,
        lineStyle: LC().LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    } catch (e) {
      /* 안내선을 못 그려도 지표 자체는 그대로 동작합니다 */
    }
  }

  /* =====================================================================
   * 전체 그리기 — 켤 때 / 봉 간격·종목이 바뀔 때만
   * ===================================================================== */
  function redrawAll() {
    if (!ensureSeries()) return;

    if (!anyOn()) {
      dropPane("rsi");
      dropPane("macd");
      closes = [];
      times = [];
      closesReady = false;
      rsiCommit = null;
      macdCommit = null;
      commitIdx = -1;
      liveRsi = null;
      liveMacd = null;
      stopSyncTimer();
      return;
    }

    startSyncTimer();
    if (!closesReady) fullSync();
    if (!closesReady) return;

    var lc = LC();
    var n = closes.length;
    commitIdx = n - 2;

    /* ---- RSI ---- */
    if (state.rsi) {
      var cap = {};
      var rsiData = computeRSI(closes, times, RSI_PERIOD, cap);
      rsiCommit = cap.state;
      liveRsi = rsiData.length ? rsiData[rsiData.length - 1].value : null;
      makePane("rsi");
      if (!series.rsi) {
        series.rsi = addTo(panes.rsi, lc.LineSeries, {
          color: COLORS.rsi,
          lineWidth: LINE_WIDTH,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          priceFormat: { type: "price", precision: 2, minMove: 0.01 },
          /* 바이낸스처럼 눈금을 0~100 으로 고정합니다. 그래야 70·30
             안내선이 늘 보이고, 눈금이 매 틱 출렁이지 않습니다. */
          autoscaleInfoProvider: function () {
            return { priceRange: { minValue: 0, maxValue: 100 } };
          },
        });
        try {
          series.rsi.priceScale().applyOptions({ scaleMargins: { top: 0.12, bottom: 0.12 } });
        } catch (e) {
          /* 무시 */
        }
        addGuide(series.rsi, RSI_UPPER, COLORS.rsiGuide);
        addGuide(series.rsi, RSI_LOWER, COLORS.rsiGuide);
      }
      series.rsi.setData(rsiData);
      ensureLabel("rsi");
    } else {
      dropPane("rsi");
      rsiCommit = null;
      liveRsi = null;
    }

    /* ---- MACD ---- */
    if (state.macd) {
      var cap2 = {};
      var md = computeMACD(closes, times, MACD_FAST, MACD_SLOW, MACD_SIGNAL, cap2);
      macdCommit = cap2.state;
      liveMacd = md.macd.length
        ? {
            macd: md.macd[md.macd.length - 1].value,
            sig: md.signal.length ? md.signal[md.signal.length - 1].value : null,
            hist: md.hist.length ? md.hist[md.hist.length - 1].value : null,
          }
        : null;
      makePane("macd");
      if (!series.macd) {
        /* 막대를 먼저 만들어 선이 그 위에 오게 합니다 */
        series.hist = addTo(panes.macd, lc.HistogramSeries, {
          color: COLORS.hist,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: false,
          priceFormat: macdPriceFormat(),
        });
        series.macd = addTo(panes.macd, lc.LineSeries, {
          color: COLORS.macd,
          lineWidth: LINE_WIDTH,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: true,
          crosshairMarkerVisible: false,
          priceFormat: macdPriceFormat(),
        });
        series.signal = addTo(panes.macd, lc.LineSeries, {
          color: COLORS.signal,
          lineWidth: LINE_WIDTH,
          priceScaleId: "right",
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
          priceFormat: macdPriceFormat(),
        });
        try {
          series.macd.priceScale().applyOptions({ scaleMargins: { top: 0.15, bottom: 0.15 } });
        } catch (e) {
          /* 무시 */
        }
        addGuide(series.macd, 0, COLORS.zero);
      }
      series.hist.setData(md.hist);
      series.macd.setData(md.macd);
      series.signal.setData(md.signal);
      ensureLabel("macd");
    } else {
      dropPane("macd");
      macdCommit = null;
      liveMacd = null;
    }

    positionLabels();
    paintLabels(true);
  }

  /* =====================================================================
   * 실시간 — 마지막 봉만 갱신
   * ===================================================================== */
  function onTick(payload) {
    /* 꺼져 있으면 여기서 끝 — 계산도 하지 않습니다 */
    if (!anyOn()) return;
    if (!payload || !payload.candle) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (!candleSeries) return;
    if (!closesReady && !fullSync()) return;

    var t0 = typeof performance !== "undefined" && performance.now ? performance.now() : 0;

    var c = payload.candle;
    var n = closes.length;
    var lastT = n ? times[n - 1] : null;

    if (n && c.time === lastT) {
      closes[n - 1] = c.close;
    } else if (!n || c.time > lastT) {
      closes.push(c.close);
      times.push(c.time);
      syncMark.len = closes.length;
    } else {
      return; /* 과거 시각이 뒤늦게 온 경우 — 무시 */
    }

    n = closes.length;
    var time = times[n - 1];

    /* 닫힌 봉을 확정 상태에 접어 넣습니다 (보통 새 봉이 생길 때 1회) */
    while (commitIdx < n - 2) {
      commitIdx++;
      if (rsiCommit) rsiCommit = rsiStep(rsiCommit, closes[commitIdx], RSI_PERIOD);
      if (macdCommit) {
        var st = macdStep(macdCommit, closes[commitIdx], MACD_FAST, MACD_SLOW, MACD_SIGNAL);
        macdCommit = { emaFast: st.emaFast, emaSlow: st.emaSlow, sig: st.sig };
      }
    }

    if (state.rsi && series.rsi) {
      if (rsiCommit) {
        var rs = rsiStep(rsiCommit, closes[n - 1], RSI_PERIOD);
        liveRsi = rsiValue(rs);
        try {
          series.rsi.update({ time: time, value: liveRsi });
        } catch (e) {
          /* 시각이 어긋나면 다음 전체 맞춤에서 정리됩니다 */
        }
      } else {
        /* 확정 상태를 만들 수 없을 만큼 봉이 적을 때만 전체 계산 */
        var cap = {};
        var d = computeRSI(closes, times, RSI_PERIOD, cap);
        rsiCommit = cap.state;
        if (d.length) {
          liveRsi = d[d.length - 1].value;
          try {
            series.rsi.setData(d);
          } catch (e) {
            /* 무시 */
          }
        }
      }
    }

    if (state.macd && series.macd) {
      if (macdCommit) {
        var ms = macdStep(macdCommit, closes[n - 1], MACD_FAST, MACD_SLOW, MACD_SIGNAL);
        liveMacd = { macd: ms.macd, sig: ms.sig, hist: ms.hist };
        try {
          series.macd.update({ time: time, value: ms.macd });
          if (ms.sig !== null) {
            series.signal.update({ time: time, value: ms.sig });
            series.hist.update({ time: time, value: ms.hist, color: COLORS.hist });
          }
        } catch (e) {
          /* 무시 */
        }
      } else {
        var cap2 = {};
        var md = computeMACD(closes, times, MACD_FAST, MACD_SLOW, MACD_SIGNAL, cap2);
        macdCommit = cap2.state;
        if (md.macd.length) {
          liveMacd = {
            macd: md.macd[md.macd.length - 1].value,
            sig: md.signal.length ? md.signal[md.signal.length - 1].value : null,
            hist: md.hist.length ? md.hist[md.hist.length - 1].value : null,
          };
          try {
            series.macd.setData(md.macd);
            series.signal.setData(md.signal);
            series.hist.setData(md.hist);
          } catch (e) {
            /* 무시 */
          }
        }
      }
    }

    paintLabels(false);

    if (t0) {
      var ms2 = performance.now() - t0;
      perf.ticks++;
      perf.totalMs += ms2;
      if (ms2 > perf.maxMs) perf.maxMs = ms2;
    }
  }

  /* =====================================================================
   * 차트 데이터가 통째로 바뀌었는지 확인 (봉 간격 변경 / 과거 스크롤 로딩)
   * chart.js 는 그때 setData() 를 부르는데 알려주는 신호가 없습니다.
   * 길이와 맨 앞 시각만 가끔 비교합니다. 켜져 있을 때만 돕니다.
   * ===================================================================== */
  function checkResync() {
    if (!anyOn() || !candleSeries) return;
    positionLabels();
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
   * 버튼 — 2단계 지표 막대(.tl-ind-bar)에 이어 붙입니다
   * ===================================================================== */
  function paintButtons() {
    if (!buttonsEl) return;
    var kids = buttonsEl.querySelectorAll(".tl-osc-btn");
    for (var i = 0; i < kids.length; i++) {
      var key = kids[i].getAttribute("data-osc");
      var on = !!state[key];
      kids[i].setAttribute("aria-pressed", on ? "true" : "false");
      kids[i].style.color = on ? "#E7ECF5" : "#838DA4";
      kids[i].style.borderColor = on ? "#838DA4" : "#1D273B";
      var dot = kids[i].querySelector(".tl-osc-dot");
      if (dot) dot.style.background = on ? kids[i].getAttribute("data-color") : "#1D273B";
    }
  }

  function buildButtons() {
    if (buttonsEl && document.body && document.body.contains(buttonsEl)) return true;
    /* 2단계가 만든 막대에 붙입니다. 없으면(2단계를 지웠으면) 아무것도 안 합니다. */
    var bar = document.querySelector(".chart-panel .tl-ind-bar") || document.querySelector(".tl-ind-bar");
    if (!bar) return false;

    injectStyle();
    buttonsEl = bar;

    BUTTONS.forEach(function (b) {
      if (bar.querySelector('.tl-osc-btn[data-osc="' + b.key + '"]')) return;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-osc-btn";
      btn.setAttribute("data-osc", b.key);
      btn.setAttribute("data-color", b.color);
      btn.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span");
      dot.className = "tl-osc-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(b.label));
      btn.addEventListener("click", function () {
        toggle(b.key);
      });
      bar.appendChild(btn);
    });

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
    redrawAll();
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
    rsiCommit = null;
    macdCommit = null;
    if (!anyOn()) return;
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
      App.Bus.on("currency:change", onCurrencyChange);
    }

    /* 차트는 chart.js 가 나중에 만들고, 과거 캔들은 그보다 더 나중에
       도착합니다(REST 조회). 둘 다 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 200) {
        clearInterval(timer); /* 10초 — 그래도 없으면 포기 */
        return;
      }
      if (!ensureSeries()) return;
      if (!buildButtons()) return;
      if (!anyOn()) {
        clearInterval(timer); /* 켜진 게 없으면 캔들을 기다릴 이유도 없음 */
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
    computeRSI: computeRSI,
    computeMACD: computeMACD,
    rsiStep: rsiStep,
    rsiValue: rsiValue,
    macdStep: macdStep,
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
      return { rsi: series.rsi, macd: series.macd, signal: series.signal, hist: series.hist };
    },
    getPanesForTest: function () {
      return { rsi: panes.rsi, macd: panes.macd };
    },
    getClosesForTest: function () {
      return closes.slice();
    },
    getLiveForTest: function () {
      return { rsi: liveRsi, macd: liveMacd };
    },
    onTickForTest: onTick,
    COLORS: COLORS,
    RSI_PERIOD: RSI_PERIOD,
    MACD_FAST: MACD_FAST,
    MACD_SLOW: MACD_SLOW,
    MACD_SIGNAL: MACD_SIGNAL,
    PANE_RATIO: PANE_RATIO,
  };
})();
