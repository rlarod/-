/* tests/chart-oscillators.test.js
 * 차트 3단계 — RSI · MACD (차트 아래 별도 칸)
 *
 * 이 모듈이 지켜야 하는 것
 *   1) js/chart.js 를 고치지 않는다 (차트는 App.ChartFont.getCharts() 로 가져옴)
 *   2) 1·2·4단계 파일을 고치지 않는다 (버튼은 2단계 막대에 "이어 붙이기"만)
 *   3) 기본은 둘 다 꺼짐 — 처음 온 회원 화면이 지금과 같아야 한다
 *   4) 꺼져 있으면 계산도 하지 않는다
 *   5) 실시간 누적 계산 결과가 전체 계산과 같아야 한다
 *      (EMA·와일더는 한 번 틀리면 계속 끌고 갑니다)
 *   6) 값의 범위가 다른 지표를 캔들 가격축에 얹지 않는다 (별도 pane)
 *   7) 확정 팔레트 밖의 색을 쓰지 않는다. 손익용 초록·빨강도 쓰지 않는다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \x1b[32m✓\x1b[0m " + name);
  } else {
    fail++;
    console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "chart-oscillators.js"), "utf8");
const CHART_JS = fs.readFileSync(path.join(REPO, "js", "chart.js"), "utf8");
const IND_JS = fs.readFileSync(path.join(REPO, "js", "chart-indicators.js"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
/* 주석에는 "chart-font.js 가 createChart 를 감쌌다" 는 설명이 있으므로 주석을 뺀 코드로 봅니다 */
const CODE = (function () {
  /* 주석을 빼고 실제 코드만 남깁니다 (정규식 대신 문자열로 잘라냅니다) */
  var out = "";
  var i = 0;
  while (i < SRC.length) {
    var a = SRC.indexOf("/*", i);
    if (a === -1) { out += SRC.slice(i); break; }
    out += SRC.slice(i, a);
    var b = SRC.indexOf("*/", a + 2);
    if (b === -1) break;
    i = b + 2;
  }
  return out;
})();

console.log("\n차트 3단계 — RSI · MACD");

/* ===================================================================
 * 가짜 DOM
 * =================================================================== */
function makeText(s) {
  return { __text: true, nodeValue: s, children: [] };
}
function matches(el, sel) {
  const m = /^\.([\w-]+)(?:\[([\w-]+)="([^"]*)"\])?$/.exec(String(sel).trim());
  if (!m) return false;
  if (el.className !== m[1]) return false;
  if (m[2] && el.getAttribute(m[2]) !== m[3]) return false;
  return true;
}
function makeEl(tag) {
  return {
    tagName: tag,
    className: "",
    id: "",
    textContent: "",
    innerHTML: "",
    type: "",
    style: {},
    children: [],
    parentNode: null,
    attrs: {},
    handlers: {},
    setAttribute(k, v) {
      this.attrs[k] = v;
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(c) {
      if (c && c.__text) {
        this.textContent += c.nodeValue;
        return c;
      }
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    addEventListener(ev, fn) {
      this.handlers[ev] = fn;
    },
    click() {
      if (this.handlers.click) this.handlers.click();
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) {
        n.children.forEach((c) => {
          if (matches(c, sel)) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
    contains(n) {
      let cur = n;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    },
  };
}

/* ===================================================================
 * 가짜 차트 — pane 을 진짜처럼 흉내냅니다.
 *   · addPane() 으로 칸이 늘어난다
 *   · 그 칸의 마지막 시리즈를 지우면 칸도 사라진다 (라이브러리 동작과 같음)
 * =================================================================== */
function makeFakeSeries(type, options) {
  return {
    _type: type,
    _opts: Object.assign({}, options),
    _data: [],
    _lines: [],
    _pane: null,
    seriesType() {
      return this._type;
    },
    options() {
      return this._opts;
    },
    applyOptions(o) {
      Object.assign(this._opts, o);
    },
    setData(d) {
      this._data = d.slice();
    },
    update(p) {
      const last = this._data[this._data.length - 1];
      if (last && last.time === p.time) this._data[this._data.length - 1] = p;
      else this._data.push(p);
    },
    data() {
      return this._data;
    },
    priceScale() {
      const self = this;
      return {
        applyOptions(o) {
          self._scaleOpts = Object.assign({}, self._scaleOpts, o);
        },
      };
    },
    createPriceLine(o) {
      this._lines.push(o);
      return o;
    },
  };
}

function boot(candles, savedState) {
  const timers = [];
  const stored = {};
  if (savedState) stored["chart-oscillators"] = savedState;

  const candleSeries = makeFakeSeries("Candlestick", { priceScaleId: "right" });
  candleSeries._data = candles.slice();

  const panes = [];
  function makePane() {
    const list = [];
    const el = makeEl("div");
    const p = {
      _series: list,
      _el: el,
      _stretch: 1,
      getSeries() {
        return list.slice();
      },
      getStretchFactor() {
        return this._stretch;
      },
      setStretchFactor(v) {
        this._stretch = v;
      },
      getHTMLElement() {
        return el;
      },
      paneIndex() {
        return panes.indexOf(p);
      },
      addSeries(def, opts) {
        const s = makeFakeSeries(def.__type || "Line", opts);
        s._pane = p;
        list.push(s);
        return s;
      },
    };
    panes.push(p);
    return p;
  }
  const main = makePane();
  main._series.push(candleSeries);
  candleSeries._pane = main;

  const chart = {
    panes() {
      return panes.slice();
    },
    addPane() {
      return makePane();
    },
    removePane(i) {
      if (panes.length > 1) panes.splice(i, 1);
    },
    addSeries(def, opts, idx) {
      return panes[idx || 0].addSeries(def, opts);
    },
    removeSeries(s) {
      const p = s._pane;
      if (!p) return;
      const i = p._series.indexOf(s);
      if (i >= 0) p._series.splice(i, 1);
      /* 라이브러리와 같은 동작 — 시리즈가 0개가 된 칸은 스스로 사라집니다 */
      if (p._series.length === 0 && panes.indexOf(p) > 0) panes.splice(panes.indexOf(p), 1);
    },
    paneSize() {
      return { height: 100, width: 800 };
    },
  };

  /* 2단계가 이미 만들어 둔 지표 막대(버튼 5개) */
  const head = makeEl("head");
  const body = makeEl("body");
  const bar = makeEl("div");
  bar.className = "tl-ind-bar";
  ["MA 7", "MA 25", "MA 99", "볼린저", "거래량"].forEach((t) => {
    const b = makeEl("button");
    b.className = "tl-ind-btn";
    b.textContent = t;
    bar.appendChild(b);
  });
  body.appendChild(bar);

  const styles = [];
  const doc = {
    readyState: "complete",
    head: head,
    body: body,
    documentElement: makeEl("html"),
    addEventListener() {},
    createElement(tag) {
      return makeEl(tag);
    },
    createTextNode: makeText,
    getElementById(id) {
      return styles.filter((s) => s.id === id)[0] || null;
    },
    querySelector(sel) {
      if (String(sel).indexOf("tl-ind-bar") !== -1) return bar;
      return null;
    },
  };
  head.appendChild = function (c) {
    styles.push(c);
    return c;
  };

  const bus = {};
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: doc,
    performance: { now: () => 0 },
    Date: Date,
    setInterval(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearInterval(id) {
      if (id) timers[id - 1] = null;
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    LightweightCharts: {
      LineSeries: { __type: "Line" },
      HistogramSeries: { __type: "Histogram" },
      LineStyle: { Solid: 0, Dashed: 2 },
    },
  };
  sandbox.window = sandbox;
  sandbox.App = {
    Storage: {
      save(k, v) {
        stored[k] = JSON.parse(JSON.stringify(v));
        return true;
      },
      load(k) {
        return stored[k] ? JSON.parse(JSON.stringify(stored[k])) : null;
      },
    },
    Bus: {
      on(e, f) {
        (bus[e] = bus[e] || []).push(f);
      },
      emit(e, p) {
        (bus[e] || []).forEach((f) => f(p));
      },
    },
    ChartFont: {
      getCharts() {
        return [chart];
      },
    },
    Config: {
      getActiveSymbol() {
        return "BTCUSDT";
      },
      getDisplayCurrency() {
        return "USDT";
      },
    },
    Utils: {
      formatCurrencyPlain(v) {
        return String(v);
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  const tick = () => timers.slice().forEach((f) => f && f());
  tick();
  tick();

  return { M: sandbox.App.ChartOscillators, sandbox, chart, panes, candleSeries, bar, stored, tick, bus };
}

/* 테스트용 캔들 — 재현 가능한 파형 */
function makeCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = 80000 + Math.sin(i / 7) * 300 + (i % 13) * 11 - (i % 5) * 7;
    out.push({ time: 1700000000 + i * 60, open: close, high: close, low: close, close: close });
  }
  return out;
}
function closesOf(candles) {
  return candles.map((c) => c.close);
}

/* ── 대조군 — 매번 처음부터 다시 계산하는 순진한 방식 ────────────── */
function naiveRSI(closes, period, endIdx) {
  let g = 0;
  let l = 0;
  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch > 0) g += ch;
    else l -= ch;
  }
  let ag = g / period;
  let al = l / period;
  for (let i = period + 1; i <= endIdx; i++) {
    const ch = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (ch > 0 ? ch : 0)) / period;
    al = (al * (period - 1) + (ch < 0 ? -ch : 0)) / period;
  }
  if (al === 0) return ag === 0 ? 50 : 100;
  return 100 - 100 / (1 + ag / al);
}
function naiveMACD(closes, F, S, G, endIdx) {
  const kf = 2 / (F + 1);
  const ks = 2 / (S + 1);
  const kg = 2 / (G + 1);
  let sum = 0;
  let i;
  for (i = 0; i < F; i++) sum += closes[i];
  let ef = sum / F;
  for (i = F; i < S; i++) ef = closes[i] * kf + ef * (1 - kf);
  sum = 0;
  for (i = 0; i < S; i++) sum += closes[i];
  let es = sum / S;
  let sig = null;
  let seed = 0;
  let cnt = 0;
  let m = 0;
  for (i = S - 1; i <= endIdx; i++) {
    if (i > S - 1) {
      ef = closes[i] * kf + ef * (1 - kf);
      es = closes[i] * ks + es * (1 - ks);
    }
    m = ef - es;
    if (sig === null) {
      seed += m;
      cnt++;
      if (cnt === G) sig = seed / G;
    } else {
      sig = m * kg + sig * (1 - kg);
    }
  }
  return { macd: m, sig: sig };
}
function near(a, b, eps) {
  return Math.abs(a - b) < (eps === undefined ? 1e-9 : eps);
}

/* ================================================================
 * 1. 이미 있는 것을 건드리지 않는다
 * ================================================================ */
console.log("\n[다른 단계를 건드리지 않는다]");
{
  ok("js/chart.js 는 한 글자도 안 고쳤다 (해시)",
    require("crypto").createHash("md5").update(fs.readFileSync(path.join(REPO, "js", "chart.js"))).digest("hex") ===
      "02ddcb000d577131f797143d08c09123");
  ok("chart.js 안에 ChartOscillators 라는 글자가 없다", CHART_JS.indexOf("ChartOscillators") === -1);
  ok("차트는 App.ChartFont.getCharts() 로 가져온다", SRC.indexOf("App.ChartFont.getCharts()") !== -1);
  /* 주석에는 "chart-font.js 가 createChart 를 감쌌다" 는 설명이 있으므로 주석을 뺀 뒤 봅니다 */
  ok("createChart 를 직접 부르지 않는다 (부르면 차트가 두 개 생깁니다)",
    CODE.indexOf("createChart") === -1);
  ok("2단계 지표 막대(.tl-ind-bar)에 이어 붙인다", SRC.indexOf(".tl-ind-bar") !== -1);
  ok("2단계 버튼 클래스(tl-ind-btn)를 그대로 쓰지 않는다 (서로 색을 덮어씀)",
    SRC.indexOf('className = "tl-ind-btn"') === -1);
  ok("2단계 파일은 여전히 자기 버튼만 다시 칠한다", IND_JS.indexOf('querySelectorAll(".tl-ind-btn")') !== -1);
  ok("1단계가 그리는 청산가·진입가 선을 또 그리지 않는다", SRC.indexOf("ChartPositionLines") === -1);
  ok("4단계 선긋기를 건드리지 않는다", SRC.indexOf("ChartDrawings") === -1);
  ok("index.html 에 script 한 줄만 늘었다",
    (HTML.match(/js\/chart-oscillators\.js/g) || []).length === 1);
  ok("script 는 맨 마지막에 실린다",
    HTML.indexOf("js/chart-oscillators.js") > HTML.indexOf("js/chart-drawings.js"));
}

/* ================================================================
 * 2. 기간과 색
 * ================================================================ */
console.log("\n[기간과 색]");
{
  const { M } = boot(makeCandles(300));
  ok("RSI 기간은 14", M.RSI_PERIOD === 14, String(M.RSI_PERIOD));
  ok("MACD 는 12 / 26 / 9", M.MACD_FAST === 12 && M.MACD_SLOW === 26 && M.MACD_SIGNAL === 9);

  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5", "#838DA4", "#F0B429"];
  const 색들 = Object.keys(M.COLORS).map((k) => M.COLORS[k]);
  ok("모든 색이 확정 팔레트 안에 있다", 색들.every((c) => 팔레트.indexOf(c) !== -1), 색들.join(","));
  ok("손익용 상승 초록(#26C281)을 쓰지 않는다", 색들.indexOf("#26C281") === -1);
  ok("손익용 하락 빨강(#F0506E)을 쓰지 않는다 (청산가 선 색입니다)", 색들.indexOf("#F0506E") === -1);
  ok("MACD 주선은 가장 밝은 본문색", M.COLORS.macd === "#E7ECF5");
  ok("MACD 신호선은 포인트(골드)", M.COLORS.signal === "#F0B429");
  ok("MACD 막대는 보조색", M.COLORS.hist === "#838DA4");
  ok("안내선(70/30·0)은 테두리색이라 데이터 선보다 뒤로 물러난다",
    M.COLORS.rsiGuide === "#1D273B" && M.COLORS.zero === "#1D273B");
}

/* ================================================================
 * 3. 계산이 맞는가 (대조군과 비교)
 * ================================================================ */
console.log("\n[계산]");
{
  const candles = makeCandles(300);
  const closes = closesOf(candles);
  const times = candles.map((c) => c.time);
  const { M } = boot(candles);

  const rsi = M.computeRSI(closes, times, 14);
  ok("RSI 값은 봉 14번째부터 나온다", rsi.length === closes.length - 14, String(rsi.length));
  ok("RSI 첫 값이 대조군과 같다", near(rsi[0].value, naiveRSI(closes, 14, 14)));
  ok("RSI 마지막 값이 대조군과 같다", near(rsi[rsi.length - 1].value, naiveRSI(closes, 14, closes.length - 1)));
  ok("RSI 는 0~100 을 벗어나지 않는다", rsi.every((p) => p.value >= 0 && p.value <= 100));

  const md = M.computeMACD(closes, times, 12, 26, 9);
  const naive = naiveMACD(closes, 12, 26, 9, closes.length - 1);
  ok("MACD 는 26번째 봉부터 나온다", md.macd.length === closes.length - 25, String(md.macd.length));
  ok("신호선은 MACD 보다 8개 늦게 시작한다", md.signal.length === md.macd.length - 8, String(md.signal.length));
  ok("MACD 마지막 값이 대조군과 같다", near(md.macd[md.macd.length - 1].value, naive.macd));
  ok("신호선 마지막 값이 대조군과 같다", near(md.signal[md.signal.length - 1].value, naive.sig));
  ok("막대는 MACD - 신호선 이다",
    near(md.hist[md.hist.length - 1].value, naive.macd - naive.sig));

  /* 값이 계속 오르기만 하면 RSI 는 100 */
  const up = [];
  for (let i = 0; i < 40; i++) up.push(100 + i);
  const t2 = up.map((_, i) => 1700000000 + i * 60);
  const rup = M.computeRSI(up, t2, 14);
  ok("계속 오르기만 하면 RSI 100", near(rup[rup.length - 1].value, 100));
  const flat = new Array(40).fill(100);
  const rflat = M.computeRSI(flat, t2, 14);
  ok("한 번도 안 움직이면 RSI 50 (0으로 나누지 않는다)", rflat[rflat.length - 1].value === 50);

  ok("봉이 모자라면 빈 배열", M.computeRSI([1, 2, 3], [1, 2, 3], 14).length === 0);
  ok("봉이 모자라면 MACD 도 빈 배열", M.computeMACD([1, 2, 3], [1, 2, 3], 12, 26, 9).macd.length === 0);
}

/* ================================================================
 * 4. 실시간 갱신이 전체 계산과 같은 값을 낸다
 *    (EMA·와일더는 한 번 어긋나면 계속 끌고 갑니다)
 * ================================================================ */
console.log("\n[실시간 갱신]");
{
  const candles = makeCandles(300);
  const { M, candleSeries } = boot(candles);
  M.setOn("rsi", true);
  M.setOn("macd", true);

  const S = M.getSeriesForTest();
  ok("켜면 RSI 선이 생긴다", !!S.rsi);
  ok("켜면 MACD 선 · 신호선 · 막대가 생긴다", !!S.macd && !!S.signal && !!S.hist);

  /* 같은 봉이 여러 번 갱신되고, 그 뒤 새 봉이 생기는 상황을 30번 반복 */
  const closes = closesOf(candles);
  const times = candles.map((c) => c.time);
  let t = times[times.length - 1];
  for (let k = 0; k < 30; k++) {
    /* 같은 봉 안에서 값이 여러 번 흔들림 */
    for (let j = 0; j < 5; j++) {
      const v = closes[closes.length - 1] + (j - 2) * 13;
      M.onTickForTest({ symbol: "BTCUSDT", candle: { time: t, close: v } });
      closes[closes.length - 1] = v;
      candleSeries._data[candleSeries._data.length - 1] = { time: t, close: v };
    }
    /* 새 봉 */
    t += 60;
    const nv = 80000 + Math.sin(k / 3) * 250 + k * 4;
    M.onTickForTest({ symbol: "BTCUSDT", candle: { time: t, close: nv } });
    closes.push(nv);
    times.push(t);
    candleSeries._data.push({ time: t, close: nv });
  }

  const full = M.computeRSI(closes, times, 14);
  const live = M.getSeriesForTest().rsi.data();
  ok("RSI 마지막 값이 전체 계산과 같다",
    near(live[live.length - 1].value, full[full.length - 1].value, 1e-9),
    live[live.length - 1].value + " vs " + full[full.length - 1].value);
  ok("RSI 데이터 개수도 전체 계산과 같다", live.length === full.length, live.length + " vs " + full.length);

  const fullM = M.computeMACD(closes, times, 12, 26, 9);
  const liveM = M.getSeriesForTest().macd.data();
  const liveS = M.getSeriesForTest().signal.data();
  ok("MACD 마지막 값이 전체 계산과 같다",
    near(liveM[liveM.length - 1].value, fullM.macd[fullM.macd.length - 1].value, 1e-9),
    liveM[liveM.length - 1].value + " vs " + fullM.macd[fullM.macd.length - 1].value);
  ok("신호선 마지막 값이 전체 계산과 같다",
    near(liveS[liveS.length - 1].value, fullM.signal[fullM.signal.length - 1].value, 1e-9));
  ok("진행 중인 봉의 값이 확정값을 오염시키지 않는다 (30봉을 지나도 어긋나지 않음)",
    near(liveM[liveM.length - 1].value, fullM.macd[fullM.macd.length - 1].value, 1e-9));

  ok("한 틱에서 전체를 다시 계산하지 않는다 (setData 대신 update)",
    /series\.rsi\.update\(/.test(SRC) && /series\.macd\.update\(/.test(SRC));
}

/* ================================================================
 * 5. 꺼져 있으면 계산도 하지 않는다
 * ================================================================ */
console.log("\n[꺼져 있을 때]");
{
  const candles = makeCandles(200);
  const { M, panes } = boot(candles);
  ok("기본은 RSI 꺼짐", M.isOn("rsi") === false);
  ok("기본은 MACD 꺼짐", M.isOn("macd") === false);
  ok("꺼진 상태에서는 칸을 만들지 않는다 (캔들 칸 하나뿐)", panes.length === 1, String(panes.length));

  M.resetPerf();
  const lastTime = candles[candles.length - 1].time;
  for (let i = 0; i < 300; i++) {
    M.onTickForTest({ symbol: "BTCUSDT", candle: { time: lastTime, close: 80500 + i } });
  }
  ok("시세가 300번 와도 계산을 한 번도 하지 않는다", M.getPerf().ticks === 0, String(M.getPerf().ticks));
  ok("종가 배열조차 만들지 않는다", M.getClosesForTest().length === 0);
}

/* ================================================================
 * 6. 별도 칸(pane)
 * ================================================================ */
console.log("\n[별도 칸]");
{
  const candles = makeCandles(200);
  const { M, panes } = boot(candles);

  M.setOn("rsi", true);
  ok("RSI 를 켜면 칸이 하나 늘어난다", panes.length === 2, String(panes.length));
  ok("RSI 는 캔들 칸이 아니라 새 칸에 들어간다", panes[1]._series.indexOf(M.getSeriesForTest().rsi) !== -1);
  ok("캔들 칸에는 우리 시리즈가 없다", panes[0]._series.length === 1);
  ok("새 칸 높이는 캔들 칸의 30%", panes[1]._stretch === panes[0]._stretch * 0.3, String(panes[1]._stretch));

  M.setOn("macd", true);
  ok("MACD 를 켜면 칸이 또 하나 늘어난다", panes.length === 3, String(panes.length));
  ok("MACD 칸에는 막대 · 선 · 신호선 셋이 들어간다", panes[2]._series.length === 3, String(panes[2]._series.length));
  ok("막대가 선보다 먼저 들어가 뒤에 깔린다", panes[2]._series[0]._type === "Histogram");

  const rsiSeries = M.getSeriesForTest().rsi;
  ok("RSI 눈금은 0~100 으로 고정된다", (function () {
    const f = rsiSeries.options().autoscaleInfoProvider;
    if (typeof f !== "function") return false;
    const r = f();
    return r.priceRange.minValue === 0 && r.priceRange.maxValue === 100;
  })());
  ok("RSI 70 · 30 안내선이 있다",
    rsiSeries._lines.length === 2 && rsiSeries._lines.map((l) => l.price).join(",") === "70,30");
  ok("MACD 0선이 있다", M.getSeriesForTest().macd._lines.length === 1 && M.getSeriesForTest().macd._lines[0].price === 0);
  ok("안내선에는 가격축 라벨을 달지 않는다 (축이 지저분해집니다)",
    rsiSeries._lines.every((l) => l.axisLabelVisible === false));

  M.setOn("rsi", false);
  ok("RSI 를 끄면 그 칸이 사라진다", panes.length === 2, String(panes.length));
  M.setOn("macd", false);
  ok("MACD 도 끄면 캔들 칸만 남는다", panes.length === 1, String(panes.length));
  ok("끄면 종가 배열도 비운다", M.getClosesForTest().length === 0);
}

/* ================================================================
 * 7. 버튼 · 저장
 * ================================================================ */
console.log("\n[버튼과 기억]");
{
  const { M, bar, stored } = boot(makeCandles(200));
  const all = bar.children;
  ok("2단계 버튼 5개는 그대로다", all.slice(0, 5).map((b) => b.textContent).join(",") === "MA 7,MA 25,MA 99,볼린저,거래량");
  ok("우리 버튼 2개가 맨 뒤에 붙는다", all.length === 7, String(all.length));
  ok("버튼 이름은 RSI · MACD", all[5].textContent === "RSI" && all[6].textContent === "MACD");
  ok("우리 버튼은 클래스가 따로다 (2단계가 색을 덮지 않게)",
    all[5].className === "tl-osc-btn" && all[6].className === "tl-osc-btn");
  ok("2단계 버튼의 클래스는 그대로다", all[0].className === "tl-ind-btn");

  all[5].click();
  ok("버튼을 누르면 RSI 가 켜진다", M.isOn("rsi") === true);
  ok("켠 상태가 App.Storage 에 저장된다", stored["chart-oscillators"] && stored["chart-oscillators"].rsi === true);
  ok("켜짐 표시가 버튼에 반영된다", all[5].getAttribute("aria-pressed") === "true");
  all[5].click();
  ok("한 번 더 누르면 꺼진다", M.isOn("rsi") === false);
  ok("꺼진 것도 저장된다", stored["chart-oscillators"].rsi === false);
}
{
  const { M, panes } = boot(makeCandles(200), { rsi: true, macd: false });
  ok("새로고침해도 켠 지표가 그대로다", M.isOn("rsi") === true && M.isOn("macd") === false);
  ok("켜져 있던 것만 그린다 (칸 2개)", panes.length === 2, String(panes.length));
}
{
  const { M } = boot(makeCandles(200), { rsi: "이상한값", macd: 3 });
  ok("저장값이 이상하면 기본값(꺼짐)을 쓴다", M.isOn("rsi") === false && M.isOn("macd") === false);
}

/* ================================================================
 * 8. 봉 간격 · 통화
 * ================================================================ */
console.log("\n[봉 간격과 통화]");
{
  const candles = makeCandles(200);
  const { M, candleSeries, tick, bus } = boot(candles, { rsi: true, macd: true });
  const before = M.getSeriesForTest().rsi.data().length;
  ok("처음에 RSI 가 그려져 있다", before > 0, String(before));

  /* 봉 간격이 바뀌면 chart.js 가 데이터를 통째로 갈아끼웁니다 */
  const other = makeCandles(120).map((c, i) => ({ time: 1600000000 + i * 300, close: c.close }));
  candleSeries._data = other;
  tick();
  tick();
  const after = M.getSeriesForTest().rsi.data().length;
  ok("봉 간격이 바뀌면 지표도 다시 그린다", after === other.length - 14, after + " vs " + (other.length - 14));

  ok("MACD 값은 표시 통화를 따라간다 (가격 차이라서)", /formatCurrencyPlain/.test(SRC));
  ok("통화가 바뀌면 다시 칠한다", /currency:change/.test(SRC));
  ok("RSI 는 통화와 무관하다 (0~100 비율)", /precision: 2/.test(SRC));
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) process.exit(1);
process.exit(0);
