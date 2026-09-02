/* tests/chart-indicator-rsi-move.test.js
 * =========================================================================
 * 옛 RSI(14) 를 지표 틀로 옮긴 것 — 봉인
 * =========================================================================
 * 2026-09-03 차트팀 (12.7단계). js/chart-oscillators.js 가 그리던 RSI 한 줄이
 * js/chart-indicator-kit.js 로 옮겨졌습니다. 이 파일은 그 옮김이 회원 화면을
 * 조용히 바꾸지 않았는지 지킵니다.
 *
 * ⚠️ 11단계(MA) · 12단계(볼린저) 봉인과 ★같은 모양★ 입니다.
 *    한 파일에 세 건을 섞지 않고 RSI 만 따로 봅니다.
 *
 * ── 이 건에서 제일 위험한 것 ────────────────────────────────────────────
 *   ① 옛 모듈이 ★다릅니다★     MA · 볼린저는 App.ChartIndicators 였는데
 *                              RSI 는 ★App.ChartOscillators★ 입니다.
 *                              엉뚱한 모듈에 물으면 "아직 못 읽음" 이 되어
 *                              영영 안 옮겨지거나, 옛 선이 안 꺼져 두 벌이 됩니다.
 *   ② 옛 칩의 생김새가 다름     2단계 칩 .tl-ind-btn[data-ind] 와 달리
 *                              3단계 칩은 ★.tl-osc-btn[data-osc]★ 입니다.
 *                              모르고 두면 옛 칩이 안 빠지거나(RSI 칩 두 개)
 *                              우리 칩이 자리를 못 찾아 맨 뒤로 밀립니다.
 *   ③ 값이 달라진다             옛 computeRSI 와 ★소수점 끝자리까지★ 같아야 합니다.
 *                              숫자를 박지 않고 ★옛 파일을 실제로 실행해★ 맞춥니다.
 *                              0 나눗셈 자리(평균하락 0)까지 같아야 합니다 —
 *                              같은 파일의 StochRSI 는 ★다르게★ 처리합니다.
 *   ④ 눈금이 안 고정된다        0~100 고정과 70·30 기준선이 같이 있어야 합니다.
 *                              고정이 풀리면 기준선이 화면 밖으로 나갑니다.
 *   ⑤ 통화를 따라간다           ★RSI 는 지수라 통화가 아닙니다.★ unit 이 붙으면
 *                              원화 회원 화면에 "₩56" 이 뜹니다(ATR 과 반대 사고).
 *   ⑥ 켜 두었던 것이 꺼진다     옛 저장칸(chart-oscillators)과 새 칸이 다릅니다.
 *   ⑦ 두 번 옮긴다              회원이 지운 줄이 새로고침마다 되살아납니다.
 *   ⑧ MACD 를 건드린다          ★MACD 는 이번에 안 옮겼습니다.★ 옛 자리 그대로여야 합니다.
 *   ⑨ 태생값이 없다             "기본값" 버튼이 기간 14 · 흰색으로 안 돌아가면
 *                              2026-09-02 밤 P2 와 같은 사고가 다시 납니다.
 *
 * ── ⚠️ 가짜 DOM 을 여기에 또 두는 이유 ─────────────────────────────────
 * tests/_kit-harness.js 에는 ★옛 모듈이 없습니다★(일부러 그렇습니다 — 그 도구를
 * 쓰는 다른 테스트들이 "옮기기 전" 상태를 봅니다). 옮기기 봉인은 옛 모듈이
 * 있어야 하므로, 11 · 12단계 봉인과 같은 방식으로 여기서 따로 만듭니다.
 *
 * ── 되돌리기 ────────────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 줄과 이 파일을 지우면 끝입니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
const KIT_FILE = "js/chart-indicator-kit.js";
const OSC_FILE = "js/chart-oscillators.js";

const KIT_SRC = fs.readFileSync(path.join(REPO, KIT_FILE), "utf8");
const OSC_SRC = fs.readFileSync(path.join(REPO, OSC_FILE), "utf8");

let pass = 0;
let fail = 0;
const ESC = String.fromCharCode(27);
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + ESC + "[32m✓" + ESC + "[0m " + name);
  } else {
    fail++;
    console.log("  " + ESC + "[31m✗" + ESC + "[0m " + name + (detail ? " — " + detail : ""));
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 아주 작은 가짜 DOM — 틀이 쓰는 선택자(.클래스[속성="값"])만 답합니다.
 * ───────────────────────────────────────────────────────────────────── */
function matchOne(el, compound) {
  const m = /^\.([A-Za-z0-9_-]+)(?:\[([A-Za-z0-9_-]+)="([^"]*)"\])?$/.exec(compound);
  if (!m) return false;
  if ((" " + (el.className || "") + " ").indexOf(" " + m[1] + " ") < 0) return false;
  if (m[2] && el.getAttribute(m[2]) !== m[3]) return false;
  return true;
}

function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    nodeType: 1,
    className: "",
    id: "",
    type: "",
    style: {},
    parentNode: null,
    childNodes: [],
    attrs: {},
    offsetHeight: 23,
    getBoundingClientRect() {
      return { top: 0, left: 0, right: 900, bottom: 900, width: 900, height: 900 };
    },
    setAttribute(k, v) {
      this.attrs[k] = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(c) {
      c.parentNode = this;
      this.childNodes.push(c);
      return c;
    },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.childNodes.indexOf(ref);
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    addEventListener() {},
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const parts = String(sel).trim().split(/\s+/);
      const last = parts[parts.length - 1];
      const out = [];
      (function walk(n, chain) {
        n.childNodes.forEach((c) => {
          if (c.nodeType !== 1) return;
          if (matchOne(c, last)) {
            let okChain = true;
            for (let pi = 0; pi < parts.length - 1; pi++) {
              if (!chain.some((a) => matchOne(a, parts[pi]))) okChain = false;
            }
            if (okChain) out.push(c);
          }
          walk(c, chain.concat([c]));
        });
      })(this, []);
      return out;
    },
  };
  Object.defineProperty(el, "children", {
    get() {
      return this.childNodes.filter((c) => c.nodeType === 1);
    },
  });
  let 글자 = "";
  Object.defineProperty(el, "textContent", {
    get() {
      return 글자;
    },
    set(v) {
      글자 = String(v);
    },
  });
  return el;
}

function textNode(s) {
  return { nodeType: 3, nodeValue: s, parentNode: null };
}

function makeFakeSeries(type, options) {
  return {
    _type: type,
    _opts: Object.assign({}, options),
    _data: [],
    _lines: [],
    _scale: { opts: {} },
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
      this._data = (d || []).slice();
    },
    update(p) {
      const last = this._data[this._data.length - 1];
      if (last && last.time === p.time) this._data[this._data.length - 1] = p;
      else this._data.push(p);
    },
    data() {
      return this._data;
    },
    createPriceLine(o) {
      const ln = Object.assign({}, o);
      this._lines.push(ln);
      return ln;
    },
    removePriceLine(ln) {
      const i = this._lines.indexOf(ln);
      if (i >= 0) this._lines.splice(i, 1);
    },
    priceScale() {
      const sc = this._scale;
      return {
        applyOptions(o) {
          Object.assign(sc.opts, o);
        },
      };
    },
  };
}

/* fx 목록 창을 옛 모듈들이 그린 그대로 (주 차트 5줄 · 아래 칸 2줄) */
function makeMenu() {
  const p = makeEl("div");
  p.id = "tl-fx-menu";
  const list = makeEl("div");
  list.className = "tl-fx-list";
  const g1 = makeEl("div");
  g1.className = "tl-fx-group";
  g1.textContent = "주 차트";
  list.appendChild(g1);
  ["ma7", "ma25", "ma99", "bb", "vol"].forEach((k) => {
    const r = makeEl("button");
    r.className = "tl-fx-row";
    r.setAttribute("data-who", "ind");
    r.setAttribute("data-key", k);
    r.setAttribute("aria-pressed", "false");
    list.appendChild(r);
  });
  const g2 = makeEl("div");
  g2.className = "tl-fx-group";
  g2.textContent = "아래 별도 칸";
  list.appendChild(g2);
  ["rsi", "macd"].forEach((k) => {
    const r = makeEl("button");
    r.className = "tl-fx-row";
    r.setAttribute("data-who", "osc");
    r.setAttribute("data-key", k);
    r.setAttribute("aria-pressed", "false");
    list.appendChild(r);
  });
  const foot = makeEl("div");
  foot.className = "tl-fx-foot";
  p.appendChild(list);
  p.appendChild(foot);
  return p;
}

/**
 * 틀을 한 번 태웁니다.
 *   opts.옛osc        옛 오실레이터 모듈이 들고 있는 켜짐/꺼짐 { rsi, macd }
 *   opts.getState없음 옛 모듈이 아직 상태를 안 읽은 상황
 *   opts.옛모듈없음   js/chart-oscillators.js 를 아예 안 실은 상황
 *   opts.saved        새 저장칸에 이미 들어 있던 것
 */
function boot(candles, opts) {
  opts = opts || {};
  const timers = [];
  const warns = [];
  const stored = {};
  if (opts.saved) stored["chart-indicator-kit"] = opts.saved;

  const candleSeries = makeFakeSeries("Candlestick", { priceScaleId: "right" });
  candleSeries._data = (candles || []).slice();
  const volumeSeries = makeFakeSeries("Histogram", { priceScaleId: "" });
  const addedSeries = [];
  const panesList = [
    {
      getSeries() {
        return [candleSeries, volumeSeries];
      },
      getStretchFactor() {
        return 1;
      },
    },
  ];
  const chart = {
    panes() {
      return panesList;
    },
    addSeries(def, o) {
      const s = makeFakeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", o);
      addedSeries.push(s);
      return s;
    },
    removeSeries(s) {
      const i = addedSeries.indexOf(s);
      if (i >= 0) addedSeries.splice(i, 1);
      /* 칸이 들고 있는 목록에서도 뺍니다 - 라이브러리는 마지막 시리즈가
         빠지면 그 칸을 스스로 없앱니다. 여기서 안 빼면 '끈 뒤에도 칸이
         남는' 사고를 테스트가 못 봅니다. */
      panesList.forEach((p) => {
        if (!p._mine) return;
        const j = p._mine.indexOf(s);
        if (j >= 0) p._mine.splice(j, 1);
      });
    },
    addPane() {
      const idx = panesList.length;
      const mine = [];
      const p = {
        _mine: mine,
        _stretch: 0,
        setStretchFactor(v) {
          this._stretch = v;
        },
        paneIndex: () => idx,
        getSeries: () => mine,
        addSeries(def, o) {
          const s = chart.addSeries(def, o);
          mine.push(s);
          return s;
        },
      };
      panesList.push(p);
      return p;
    },
    removePane(i) {
      if (i > 0 && panesList[i]) panesList.splice(i, 1);
    },
    chartElement() {
      return {
        querySelectorAll(sel) {
          if (sel !== "tr") return [];
          /* 칸마다 한 줄 + 맨 끝 시간축 줄 */
          const rows = [];
          let y = 0;
          for (let i = 0; i < panesList.length; i++) {
            const h = i === 0 ? 400 : 120;
            const top = y;
            rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: top, height: h }) });
            y += h;
          }
          rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: y, height: 26 }) });
          return rows;
        },
      };
    },
  };

  const head = makeEl("head");
  const body = makeEl("body");
  const panel = makeEl("div");
  panel.className = "chart-panel";
  const wrap = makeEl("div");
  wrap.className = "chart-wrap";
  const indBar = makeEl("div");
  indBar.className = "tl-ind-bar";
  /* 옛 칩 다섯 개 — 2단계(js/chart-indicators.js)가 그린 그대로 */
  ["ma7", "ma25", "ma99", "bb", "vol"].forEach((k) => {
    const b = makeEl("button");
    b.className = "tl-ind-btn";
    b.setAttribute("data-ind", k);
    indBar.appendChild(b);
  });
  /* 옛 칩 두 개 — 3단계(js/chart-oscillators.js)가 그린 그대로.
     ★클래스와 속성이 다릅니다★ (.tl-osc-btn / data-osc) */
  ["rsi", "macd"].forEach((k) => {
    const b = makeEl("button");
    b.className = "tl-osc-btn";
    b.setAttribute("data-osc", k);
    indBar.appendChild(b);
  });
  panel.appendChild(indBar);
  panel.appendChild(wrap);
  body.appendChild(panel);
  const menu = makeMenu();
  panel.appendChild(menu);

  function findById(root, id) {
    let found = null;
    (function walk(n) {
      n.childNodes.forEach((c) => {
        if (c.nodeType !== 1) return;
        if (c.id === id && !found) found = c;
        walk(c);
      });
    })(root);
    return found;
  }

  const doc = {
    readyState: "complete",
    head,
    body,
    documentElement: makeEl("html"),
    addEventListener() {},
    createElement: makeEl,
    createTextNode: textNode,
    getElementById(id) {
      return findById(head, id) || findById(body, id);
    },
    querySelector(sel) {
      return body.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      return body.querySelectorAll(sel);
    },
  };

  /* 옛 오실레이터 모듈 흉내 — getState / setOn 을 실제로 들고 있습니다 */
  const 옛osc = Object.assign({ rsi: false, macd: false }, opts.옛osc || {});
  const calls = { setOn: [], isOn: [], toggle: [] };
  const ChartOscillators = {
    isOn(k) {
      calls.isOn.push(k);
      return !!옛osc[k];
    },
    toggle(k) {
      calls.toggle.push(k);
      옛osc[k] = !옛osc[k];
      return 옛osc[k];
    },
    COLORS: { rsi: "#E7ECF5", rsiGuide: "#1D273B", macd: "#E7ECF5", signal: "#F0B429" },
    RSI_PERIOD: 14,
    MACD_FAST: 12,
    MACD_SLOW: 26,
    MACD_SIGNAL: 9,
  };
  if (!opts.getState없음) {
    ChartOscillators.getState = function () {
      const out = {};
      for (const k in 옛osc) out[k] = 옛osc[k];
      return out;
    };
  }
  ChartOscillators.setOn = function (k, on) {
    calls.setOn.push(k + "=" + !!on);
    옛osc[k] = !!on;
  };

  /* 옛 지표 모듈(MA · 볼린저) — 이쪽도 같이 있어야 실제와 같습니다 */
  const 옛ind = { ma7: false, ma25: false, ma99: false, bb: false, vol: true };
  const ChartIndicators = {
    isOn: (k) => !!옛ind[k],
    toggle(k) {
      옛ind[k] = !옛ind[k];
      return 옛ind[k];
    },
    getState() {
      const out = {};
      for (const k in 옛ind) out[k] = 옛ind[k];
      return out;
    },
    setOn(k, on) {
      옛ind[k] = !!on;
    },
    MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 },
    COLORS: { ma7: "#F0B429", ma25: "#E7ECF5", ma99: "#838DA4", bb: "#838DA4" },
  };

  const bus = {};
  let 통화 = "USDT";
  const sandbox = {
    console: {
      warn() {
        warns.push(Array.prototype.map.call(arguments, String).join(" "));
      },
      log() {},
      error() {
        warns.push(Array.prototype.map.call(arguments, String).join(" "));
      },
    },
    document: doc,
    performance: { now: () => 0 },
    setInterval(fn, ms) {
      timers.push({ ms, fn, alive: true });
      return timers.length;
    },
    clearInterval(id) {
      if (id && timers[id - 1]) timers[id - 1].alive = false;
    },
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    LightweightCharts: {
      LineSeries: { __kind: "line" },
      HistogramSeries: { __kind: "hist" },
      LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
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
    ChartFont: { getCharts: () => [chart] },
    Config: {
      getActiveSymbol: () => "BTCUSDT",
      getDisplayCurrency: () => 통화,
    },
    ChartIndicators,
  };
  if (!opts.옛모듈없음) sandbox.App.ChartOscillators = ChartOscillators;

  vm.createContext(sandbox);
  vm.runInContext(KIT_SRC, sandbox, { filename: KIT_FILE });

  const tick = () => timers.slice().forEach((t) => t.alive && t.fn());
  tick();
  tick();

  return {
    K: sandbox.App.ChartIndicatorKit,
    sandbox,
    chart,
    panesList,
    candleSeries,
    addedSeries,
    stored,
    warns,
    옛osc,
    옛ind,
    calls,
    indBar,
    wrap,
    menu,
    tick,
    통화바꾸기(c) {
      통화 = c;
      sandbox.App.Bus.emit("currency:change", { currency: c });
    },
    틱(candle) {
      sandbox.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: candle });
    },
  };
}

/** 옛 js/chart-oscillators.js 를 그대로 실행해 computeRSI 를 꺼내 옵니다.
 *  ★값을 손으로 옮겨 적지 않습니다★ — 옮겨 적으면 그 순간부터 두 벌입니다. */
function 옛계산() {
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      head: { appendChild() {} },
      documentElement: { appendChild() {} },
      createElement: () => ({
        style: {},
        setAttribute() {},
        appendChild() {},
        addEventListener() {},
      }),
    },
    setInterval: () => 0,
    clearInterval() {},
    performance: { now: () => 0 },
  };
  sandbox.window = sandbox;
  sandbox.App = {};
  vm.createContext(sandbox);
  vm.runInContext(OSC_SRC, sandbox, { filename: OSC_FILE });
  return sandbox.App.ChartOscillators;
}

function makeCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 77000 + Math.sin(i / 9) * 120 + (i % 7) * 13 + (i % 5) * 2.5;
    out.push({
      time: 1700000000 + i * 60,
      open: c - 5,
      high: c + 9,
      low: c - 11,
      close: c,
      volume: 3 + (i % 4),
    });
  }
  return out;
}

function 줄이름들(menu) {
  return menu.querySelectorAll(".tl-fx-row").map((r) => r.getAttribute("data-key"));
}

function 칩이름들(bar) {
  return bar.children
    .filter((b) => {
      const c = String(b.className);
      return c.indexOf("tl-ind-btn") >= 0 || c.indexOf("tl-osc-btn") >= 0 || c.indexOf("tl-kit-btn") >= 0;
    })
    .map((b) => b.getAttribute("data-ind") || b.getAttribute("data-osc") || b.getAttribute("data-kit"));
}

/** rsi-14 가 실제로 그린 점들 */
function 그린값(K, id) {
  const it = (K.getInstancesForTest() || {})[id];
  if (!it || !it.live || !it.live.series) return null;
  return it.live.series.rsi.data().slice();
}

const candles = makeCandles(160);
const closes = candles.map((c) => c.close);
const times = candles.map((c) => c.time);

console.log("\n=== 옛 RSI 를 틀로 옮긴 것 (12.7단계) ===");

/* =======================================================================
 * [1] 값이 그대로인가 — 옛 computeRSI 와 소수점 끝자리까지
 *     숫자를 손으로 옮겨 적지 않습니다 — 옛 파일을 실제로 실행합니다.
 * ===================================================================== */
console.log("\n[1] 값 대조 (옛 js/chart-oscillators.js 를 실제로 실행해서)");
{
  const 옛 = 옛계산();
  ok("옛 모듈에서 computeRSI 를 꺼냈다", typeof 옛.computeRSI === "function");
  ok("옛 기간이 14 그대로다", 옛.RSI_PERIOD === 14, String(옛.RSI_PERIOD));
  ok("옛 색이 #E7ECF5 그대로다", 옛.COLORS.rsi === "#E7ECF5", 옛.COLORS.rsi);
  ok("옛 기준선 색이 #1D273B 그대로다", 옛.COLORS.rsiGuide === "#1D273B", 옛.COLORS.rsiGuide);

  const B = boot(candles, { 옛osc: { rsi: false } });
  const n0 = B.addedSeries.length;
  B.K.setOn("rsi-14", true);
  const 만든선 = B.addedSeries.slice(n0);
  ok("켜면 선이 정확히 1개 생긴다", 만든선.length === 1, String(만든선.length));

  const 옛값 = 옛.computeRSI(closes, times, 옛.RSI_PERIOD);
  const 새값 = 그린값(B.K, "rsi-14") || [];
  ok("점 개수가 옛것과 같다", 새값.length === 옛값.length, 새값.length + " vs " + 옛값.length);

  let 최대오차 = 0;
  let 시각어긋남 = 0;
  for (let i = 0; i < Math.min(새값.length, 옛값.length); i++) {
    if (새값[i].time !== 옛값[i].time) 시각어긋남++;
    const d = Math.abs(새값[i].value - 옛값[i].value);
    if (d > 최대오차) 최대오차 = d;
  }
  ok("시각이 하나도 안 어긋난다", 시각어긋남 === 0, String(시각어긋남));
  ok("★값 최대오차가 0★ 이다", 최대오차 === 0, "최대오차 " + 최대오차);

  /* 실시간 한 걸음도 옛 것과 같아야 합니다 — 마지막 봉만 갱신하는 길입니다 */
  const 끝 = candles[candles.length - 1];
  const 새종가 = 끝.close + 37.5;
  B.틱({ time: 끝.time, open: 끝.open, high: 끝.high, low: 끝.low, close: 새종가, volume: 3 });
  const 옛종가들 = closes.slice();
  옛종가들[옛종가들.length - 1] = 새종가;
  const 옛갱신 = 옛.computeRSI(옛종가들, times, 옛.RSI_PERIOD);
  const 새갱신 = 그린값(B.K, "rsi-14") || [];
  const 끝오차 = Math.abs(새갱신[새갱신.length - 1].value - 옛갱신[옛갱신.length - 1].value);
  ok("★틱 한 번 뒤의 값도 옛것과 오차 0★", 끝오차 === 0, "오차 " + 끝오차);
  ok("틱을 받아도 점 개수가 안 늘어난다", 새갱신.length === 새값.length, 새갱신.length + " vs " + 새값.length);

  /* 0 나눗셈 자리 — 옛 rsiValue 와 같은가. 계속 오르기만 하는 봉으로 봅니다 */
  const 오르막 = makeCandles(60).map((c, i) => Object.assign({}, c, { close: 70000 + i * 10 }));
  const 오르막종가 = 오르막.map((c) => c.close);
  const 오르막시각 = 오르막.map((c) => c.time);
  const B2 = boot(오르막, { 옛osc: { rsi: true } });
  const 새오르막 = 그린값(B2.K, "rsi-14") || [];
  const 옛오르막 = 옛.computeRSI(오르막종가, 오르막시각, 14);
  let 오르막오차 = 0;
  for (let i = 0; i < Math.min(새오르막.length, 옛오르막.length); i++) {
    const d = Math.abs(새오르막[i].value - 옛오르막[i].value);
    if (d > 오르막오차) 오르막오차 = d;
  }
  ok(
    "★한 번도 안 내린 구간(평균하락 0)도 옛것과 같다★ (100 이어야 합니다)",
    오르막오차 === 0 && 새오르막[새오르막.length - 1].value === 100,
    "오차 " + 오르막오차 + " · 끝값 " + (새오르막.length ? 새오르막[새오르막.length - 1].value : "없음")
  );
}

/* =======================================================================
 * [2] 화면이 그대로인가 — 색 · 선모양 · 굵기 · 기준선 · 눈금 고정
 * ===================================================================== */
console.log("\n[2] 화면 (색 · 선모양 · 굵기 · 기준선 · 눈금 0~100 고정)");
{
  const B = boot(candles, { 옛osc: { rsi: true } });
  const it = B.K.getInstancesForTest()["rsi-14"];
  ok("옮겨 온 인스턴스가 있다", !!it, Object.keys(B.K.getInstancesForTest()).join(","));
  ok("기간이 14 다", it.params.p === 14, String(it.params.p));
  ok("색이 #E7ECF5 다", it.colors.rsi === "#E7ECF5", it.colors.rsi);
  ok("선 모양이 실선이다", it.style === "solid", String(it.style));
  ok("굵기가 1 이다", it.width === 1, String(it.width));
  ok("아래 별도 칸이다", it.pane === "sub", it.pane);
  ok("이름이 RSI(14) 다", B.K.listInstances().filter((i) => i.id === "rsi-14")[0].name === "RSI(14)");

  const s = it.live.series.rsi;
  ok("그린 선 색도 #E7ECF5 다", s.options().color === "#E7ECF5", s.options().color);
  ok("굵기 1 로 그린다", s.options().lineWidth === 1, String(s.options().lineWidth));
  ok("실선으로 그린다 (LineStyle.Solid=0)", s.options().lineStyle === 0, String(s.options().lineStyle));
  ok("마지막 값 라벨이 보인다 (옛 것과 같음)", s.options().lastValueVisible === true);

  /* ⑤ 통화 사고 방지 — RSI 는 지수라 unit 이 붙으면 안 됩니다 */
  const def = B.K.listDefs().filter((d) => d.id === "rsi")[0];
  ok("★rsi 정의에 unit 이 없다★ (지수는 통화가 아닙니다)", !def.unit, String(def.unit));
  ok("그래서 눈금 글자 만들기(priceFormat)를 안 건다", !s.options().priceFormat, JSON.stringify(s.options().priceFormat));

  /* ④ 눈금 0~100 고정 + 여백 0.12 */
  const prov = s.options().autoscaleInfoProvider;
  ok("눈금 고정이 걸려 있다", typeof prov === "function", typeof prov);
  const r = typeof prov === "function" ? prov() : null;
  ok(
    "★눈금이 0~100 으로 고정된다★",
    !!r && r.priceRange.minValue === 0 && r.priceRange.maxValue === 100,
    JSON.stringify(r)
  );
  ok(
    "칸 위·아래 여백이 0.12 다 (옛 것과 같음)",
    s._scale.opts.scaleMargins && s._scale.opts.scaleMargins.top === 0.12 && s._scale.opts.scaleMargins.bottom === 0.12,
    JSON.stringify(s._scale.opts.scaleMargins)
  );

  /* 기준선 70 · 30 */
  ok("기준선이 2개다", B.K.getGuideCountForTest() === 2, String(B.K.getGuideCountForTest()));
  const 값들 = s._lines.map((l) => l.price).sort((a, b) => a - b);
  ok("기준선이 30 과 70 이다", 값들.join(",") === "30,70", 값들.join(","));
  ok(
    "기준선 색이 #1D273B · 굵기 1 · 점선 · 축 라벨 없음",
    s._lines.every((l) => l.color === "#1D273B" && l.lineWidth === 1 && l.lineStyle === 2 && l.axisLabelVisible === false),
    JSON.stringify(s._lines[0])
  );

  /* 칸 이름표 — 13.2절. 옛 .tl-osc-label 자리에 우리 이름표가 뜹니다 */
  const 표 = B.wrap.querySelectorAll(".tl-kit-plabel");
  ok("칸 이름표가 1개 붙는다", 표.length === 1, String(표.length));
  const L = B.K.getPaneLabelsForTest();
  ok("이름표에 RSI(14) 라고 적힌다", L.length === 1 && L[0].name === "RSI(14)", JSON.stringify(L));
  const 지금값 = 그린값(B.K, "rsi-14").slice(-1)[0].value;
  ok(
    "이름표에 지금 값이 적힌다",
    L[0].values.rsi === 지금값.toFixed(2),
    L[0].values.rsi + " vs " + 지금값.toFixed(2)
  );

  /* ★통화를 원화로 바꿔도 RSI 숫자는 그대로★ (ATR 과 반대) */
  const 전 = B.K.getPaneLabelsForTest()[0].values.rsi;
  B.통화바꾸기("KRW");
  const 후 = B.K.getPaneLabelsForTest()[0].values.rsi;
  ok("★원화로 봐도 RSI 이름표 숫자가 그대로다★", 전 === 후, 전 + " → " + 후);
  ok("원화로 봐도 눈금 글자 만들기가 안 걸린다", !s.options().priceFormat, JSON.stringify(s.options().priceFormat));

  /* 끄면 기준선 · 이름표 · 칸이 같이 사라집니다 */
  B.K.setOn("rsi-14", false);
  ok("끄면 기준선이 0개", B.K.getGuideCountForTest() === 0, String(B.K.getGuideCountForTest()));
  ok("끄면 이름표도 사라진다", B.wrap.querySelectorAll(".tl-kit-plabel").length === 0);
  ok("끄면 아래 칸도 사라진다 (칸 1개)", B.panesList.length === 1, String(B.panesList.length));
}

/* =======================================================================
 * [3] 옛 켜짐/꺼짐이 그대로 옮겨지고, 옛 선은 꺼진다
 * ===================================================================== */
console.log("\n[3] 옛 켜짐/꺼짐 이어받기");
{
  const 켬 = boot(candles, { 옛osc: { rsi: true } });
  ok("옛 RSI 가 켜져 있었으면 우리 것도 켜진다", 켬.K.isOn("rsi-14") === true);
  ok("★옛 RSI 는 꺼졌다★ (안 끄면 선이 두 벌)", 켬.옛osc.rsi === false, String(켬.옛osc.rsi));
  ok("옛 모듈의 setOn 을 실제로 불렀다", 켬.calls.setOn.indexOf("rsi=false") >= 0, 켬.calls.setOn.join(","));
  ok("★MACD 는 안 건드렸다★", 켬.calls.setOn.every((c) => c.indexOf("macd") < 0), 켬.calls.setOn.join(","));

  const 끔 = boot(candles, { 옛osc: { rsi: false } });
  ok("옛 RSI 가 꺼져 있었으면 우리 것도 꺼짐", 끔.K.isOn("rsi-14") === false);
  ok("꺼져 있으면 선을 아예 안 만든다", 끔.addedSeries.length === 0, String(끔.addedSeries.length));

  /* 아직 못 읽는 상황에서는 ★옮기지 않습니다★ — 옮기면 켜둔 것이 꺼짐으로 굳습니다 */
  const 못읽음 = boot(candles, { getState없음: true, 옛osc: { rsi: true } });
  ok("옛 상태를 못 읽으면 안 옮긴다", 못읽음.K.isMovedRSIForTest() === false);
  ok("그때는 우리 줄도 안 생긴다", !못읽음.K.getInstancesForTest()["rsi-14"]);
  ok("그때 옛 RSI 를 끄지도 않는다", 못읽음.옛osc.rsi === true, String(못읽음.옛osc.rsi));

  const 모듈없음 = boot(candles, { 옛모듈없음: true });
  ok("옛 모듈이 아예 없으면 안 옮긴다", 모듈없음.K.isMovedRSIForTest() === false);
  ok("그래도 MA · 볼린저는 그대로 옮겨진다", 모듈없음.K.isMovedForTest() === true && 모듈없음.K.isMovedBBForTest() === true);
}

/* =======================================================================
 * [4] 회원이 보는 줄 수와 자리가 그대로인가
 * ===================================================================== */
console.log("\n[4] fx 목록 · 칩 줄 (옛 자리 그대로)");
{
  const B = boot(candles, { 옛osc: { rsi: false } });
  const 줄 = 줄이름들(B.menu);
  ok(
    "fx 목록 줄 수가 그대로 9줄이다 (옛 5 + 틀이 더한 EMA 2 + 아래 칸 2)",
    줄.length === 9,
    줄.join(" ")
  );
  ok(
    "★RSI 자리가 그대로다★ (아래 칸 첫 줄 · MACD 바로 앞)",
    줄.indexOf("rsi-14") >= 0 && 줄.indexOf("macd") === 줄.indexOf("rsi-14") + 1 && 줄[줄.length - 2] === "rsi-14",
    줄.join(" ")
  );
  ok("옛 rsi 줄은 빠졌다", 줄.indexOf("rsi") < 0, 줄.join(" "));
  ok("MACD 줄은 옛것 그대로 남아 있다", 줄.indexOf("macd") >= 0, 줄.join(" "));

  const 칩 = 칩이름들(B.indBar);
  ok(
    "★칩 자리도 그대로다★ (거래량 다음 · MACD 앞)",
    칩.indexOf("rsi-14") === 5 && 칩.indexOf("macd") === 6,
    칩.join(" ")
  );
  ok("옛 rsi 칩(.tl-osc-btn)은 빠졌다", 칩.indexOf("rsi") < 0, 칩.join(" "));
  ok(
    "옛 MACD 칩(.tl-osc-btn)은 그대로 있다",
    B.indBar.querySelectorAll('.tl-osc-btn[data-osc="macd"]').length === 1,
    칩.join(" ")
  );

  /* 우리 줄은 저쪽 CSS 를 그대로 쓰고, 우리가 답하도록 다리가 걸려 있어야 합니다 */
  const row = B.menu.querySelectorAll('.tl-fx-row[data-key="rsi-14"]')[0];
  ok("우리 줄이 저쪽 클래스를 그대로 쓴다", row && row.className === "tl-fx-row");
  ok("우리 줄임을 표시해 둔다 (data-kit)", row && row.getAttribute("data-kit") === "1");
  const IND = B.sandbox.App.ChartIndicators;
  ok("fx 목록이 물어보면 우리가 답한다", IND.isOn("rsi-14") === false && B.K.isOn("rsi-14") === false);
  IND.toggle("rsi-14");
  ok("fx 목록이 누르면 우리 것이 켜진다", B.K.isOn("rsi-14") === true);
  ok("★옛 것은 안 켜진다★", B.옛osc.rsi === false, String(B.옛osc.rsi));
  IND.toggle("rsi-14");
  ok("MA7 은 여전히 옛 모듈로 넘어간다", IND.isOn("ma7") === false && B.K.isOn("ma7") === false);
}

/* =======================================================================
 * [5] 옛 회원 상태를 심고 새로고침
 * ===================================================================== */
console.log("\n[5] 옛 회원 상태 + 새로고침");
{
  /* 옛 회원 — RSI 를 켜 두고 쓰던 사람 */
  const B = boot(candles, { 옛osc: { rsi: true } });
  ok("옮긴 뒤 켜져 있다", B.K.isOn("rsi-14") === true);
  const saved = B.stored["chart-indicator-kit"];
  ok("저장칸에 옮김 표시가 남는다", !!(saved.moved && saved.moved.rsi === true), JSON.stringify(saved.moved));
  ok("옮기기 직전 옛 값도 남는다 (되돌릴 때 씁니다)", !!(saved.moved.legacyRSI && saved.moved.legacyRSI.rsi === true));
  ok(
    "저장칸에 rsi-14 줄이 켜짐으로 들어 있다",
    saved.instances.some((i) => i.id === "rsi-14" && i.on === true),
    JSON.stringify(saved.instances.map((i) => i.id + ":" + i.on))
  );
  ok(
    "★태생값도 같이 저장된다★ (없으면 새로고침 한 번에 잊습니다)",
    saved.instances.some((i) => i.id === "rsi-14" && i.born && i.born.params.p === 14 && i.born.colors.rsi === "#E7ECF5"),
    JSON.stringify(saved.instances.filter((i) => i.id === "rsi-14")[0].born)
  );

  /* 새로고침 — 이번엔 옛 모듈이 이미 꺼진 상태로 옵니다(우리가 꺼 뒀으니까) */
  const B2 = boot(candles, { saved: saved, 옛osc: { rsi: false } });
  ok("새로고침해도 켜짐이 그대로다", B2.K.isOn("rsi-14") === true);
  ok("새로고침해도 기간 14 · 흰색 그대로다", B2.K.getInstancesForTest()["rsi-14"].params.p === 14);
  /* ⚠️ fx 목록 줄은 ★목록 창이 열릴 때★ MutationObserver 로 끼웁니다. 이 가짜
     화면에는 MutationObserver 가 없어서(틀이 typeof 로 확인하고 건너뜁니다)
     새로고침 뒤 줄 검사는 여기서 못 합니다 - 위 [4] 절이 대신 봅니다.
     칩 줄은 buildButtons 가 매번 다시 그리므로 여기서 봅니다. */
  const 칩2 = 칩이름들(B2.indBar);
  ok(
    "새로고침 뒤에도 칩 자리가 그대로다 (거래량 다음 · MACD 앞)",
    칩2.indexOf("rsi-14") === 5 && 칩2.indexOf("macd") === 6,
    칩2.join(" ")
  );

  /* 회원이 기간을 바꿔 뒀으면 그 값이 살아 있어야 합니다 */
  B2.K.updateInstance("rsi-14", { params: { p: 21 } });
  const saved2 = B2.stored["chart-indicator-kit"];
  const B3 = boot(candles, { saved: saved2, 옛osc: { rsi: false } });
  ok("회원이 바꾼 기간 21 이 새로고침 뒤에도 남는다", B3.K.getInstancesForTest()["rsi-14"].params.p === 21);
  ok("이름도 RSI(21) 로 바뀐다", B3.K.listInstances().filter((i) => i.id === "rsi-14")[0].name === "RSI(21)");
}

/* =======================================================================
 * [6] 두 번 옮기지 않는다
 * ===================================================================== */
console.log("\n[6] 두 번 옮기지 않는다");
{
  const B = boot(candles, { 옛osc: { rsi: true } });
  ok("한 번은 옮겼다", B.K.isMovedRSIForTest() === true);
  ok("다시 부르면 아무것도 안 한다", B.K.moveLegacyRSIForTest() === false);

  B.K.removeInstance("rsi-14");
  const saved = B.stored["chart-indicator-kit"];
  const B2 = boot(candles, { 옛osc: { rsi: true }, saved: saved });
  ok(
    "회원이 지운 RSI 줄이 새로고침해도 안 되살아난다",
    B2.K.listInstances().every((i) => i.id !== "rsi-14"),
    B2.K.listInstances().map((i) => i.id).join(",")
  );
}

/* =======================================================================
 * [7] 되돌리기
 * ===================================================================== */
console.log("\n[7] 되돌리기 (restoreLegacyRSI)");
{
  const B = boot(candles, { 옛osc: { rsi: true } });
  ok("되돌리기 함수가 있다", typeof B.K.restoreLegacyRSI === "function");
  ok("되돌렸다고 답한다", B.K.restoreLegacyRSI() === true);
  ok(
    "우리 RSI 줄이 사라졌다",
    B.K.listInstances().every((i) => i.def !== "rsi"),
    B.K.listInstances().map((i) => i.id).join(",")
  );
  ok("옛 켜짐이 그대로 돌아왔다", B.옛osc.rsi === true, String(B.옛osc.rsi));
  ok("옮겼다는 표시가 지워졌다", B.K.isMovedRSIForTest() === false);
  const saved = B.stored["chart-indicator-kit"];
  ok("저장칸에서도 RSI 표시가 지워졌다", !saved.moved || saved.moved.rsi !== true, JSON.stringify(saved.moved));
  ok(
    "MA · 볼린저 표시는 그대로 남아 있다 (다시 옮겨지면 안 됩니다)",
    !!(saved.moved && saved.moved.ma === true && saved.moved.bb === true),
    JSON.stringify(saved.moved)
  );

  /* 거꾸로 — MA 나 볼린저만 되돌려도 RSI 표시는 남아야 합니다 */
  const B2 = boot(candles, { 옛osc: { rsi: true } });
  B2.K.restoreLegacyMA();
  const s2 = B2.stored["chart-indicator-kit"];
  ok("★MA 만 되돌려도 RSI 표시는 남는다★", !!(s2.moved && s2.moved.rsi === true), JSON.stringify(s2.moved));
  ok(
    "그때 RSI 줄도 그대로 남는다",
    B2.K.listInstances().some((i) => i.id === "rsi-14"),
    B2.K.listInstances().map((i) => i.id).join(",")
  );
  B2.K.restoreLegacyBB();
  const s3 = B2.stored["chart-indicator-kit"];
  ok("볼린저까지 되돌려도 RSI 표시는 남는다", !!(s3.moved && s3.moved.rsi === true), JSON.stringify(s3.moved));

  /* 되돌린 뒤 새로고침하면 다시 옮겨집니다(옛 모듈이 다시 그린 뒤이므로 정상) */
  const B3 = boot(candles, { saved: B.stored["chart-indicator-kit"], 옛osc: { rsi: true } });
  ok("되돌린 뒤 새로고침하면 다시 옮겨진다", B3.K.isMovedRSIForTest() === true);
}

/* =======================================================================
 * [8] 꺼져 있으면 계산도 안 한다 · 틱은 마지막 봉만
 * ===================================================================== */
console.log("\n[8] 꺼져 있으면 계산도 안 한다");
{
  const B = boot(candles, { 옛osc: { rsi: false } });
  ok("꺼져 있으면 선을 안 만든다", B.addedSeries.length === 0, String(B.addedSeries.length));
  const last = candles[candles.length - 1];
  B.틱({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close + 10, volume: 3 });
  ok("꺼져 있으면 시세가 와도 선이 안 생긴다", B.addedSeries.length === 0, String(B.addedSeries.length));
  ok("꺼져 있으면 틱 계산도 안 돈다", B.K.getPerf().ticks === 0, String(B.K.getPerf().ticks));

  B.K.setOn("rsi-14", true);
  const it = B.K.getInstancesForTest()["rsi-14"];
  ok(
    "켜면 확정 상태(commit)를 들고 있다 (틱마다 전체 재계산 안 함)",
    !!(it && it.live && it.live.commit),
    it && it.live ? String(!!it.live.commit) : "없음"
  );
  ok(
    "확정 상태가 { ag, al, pc } 셋뿐이다 (배열 없음 · O(1))",
    Object.keys(it.live.commit).sort().join(",") === "ag,al,pc",
    Object.keys(it.live.commit).join(",")
  );

  /* 같은 봉으로 200번 흘려도 점이 안 늘고, 값은 늘 같아야 합니다 */
  const 점수0 = 그린값(B.K, "rsi-14").length;
  let 값들 = new Set();
  for (let i = 0; i < 200; i++) {
    B.틱({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close + 10, volume: 3 });
    값들.add(그린값(B.K, "rsi-14").slice(-1)[0].value);
  }
  ok("틱 200번에도 점 개수가 안 늘어난다", 그린값(B.K, "rsi-14").length === 점수0, 점수0 + " → " + 그린값(B.K, "rsi-14").length);
  ok("★같은 봉을 몇 번 흘려도 답이 같다★ (상태를 고쳐 쓰지 않는다)", 값들.size === 1, "서로 다른 값 " + 값들.size + "가지");
}

/* =======================================================================
 * [9] 기본값 버튼 — 옮겨 온 줄의 태생값
 *     2026-09-02 밤에 이것 때문에 P2 가 났습니다(옮겨 온 줄이 정의 기본값으로
 *     돌아가 MA(7) 과 한 줄로 보였습니다).
 * ===================================================================== */
console.log("\n[9] 기본값 버튼 (태생값)");
{
  const B = boot(candles, { 옛osc: { rsi: true } });
  B.K.updateInstance("rsi-14", { params: { p: 30 }, colors: { rsi: "#BA6EED" }, style: "dotted", width: 3 });
  const 바꾼뒤 = B.K.getInstancesForTest()["rsi-14"];
  ok("회원이 바꾼 값이 들어갔다", 바꾼뒤.params.p === 30 && 바꾼뒤.colors.rsi === "#BA6EED");

  B.K.resetInstance("rsi-14");
  const it = B.K.getInstancesForTest()["rsi-14"];
  ok("★기본값을 누르면 기간 14 로 돌아간다★", it.params.p === 14, String(it.params.p));
  ok("★색도 #E7ECF5 로 돌아간다★ (정의 기본색이 아니라 태생값)", it.colors.rsi === "#E7ECF5", it.colors.rsi);
  ok("선 모양도 실선으로 돌아간다", it.style === "solid", String(it.style));
  ok("굵기도 1 로 돌아간다", it.width === 1, String(it.width));

  /* ★태생값이 저장에 없는 옛 회원★ — movedDefaultsOf 가 답해야 합니다 */
  const saved = JSON.parse(JSON.stringify(B.stored["chart-indicator-kit"]));
  saved.instances.forEach((i) => {
    if (i.id === "rsi-14") {
      delete i.born;
      i.params = { p: 30, src: "close" };
      i.colors = { rsi: "#BA6EED" };
      i.style = "dotted";
      i.width = 3;
    }
  });
  const B2 = boot(candles, { saved: saved, 옛osc: { rsi: false } });
  B2.K.resetInstance("rsi-14");
  const it2 = B2.K.getInstancesForTest()["rsi-14"];
  ok(
    "★태생값이 없던 옛 회원도 14 · #E7ECF5 · 실선 · 1px 로 돌아간다★",
    it2.params.p === 14 && it2.colors.rsi === "#E7ECF5" && it2.style === "solid" && it2.width === 1,
    it2.params.p + " · " + it2.colors.rsi + " · " + it2.style + " · " + it2.width
  );
}

/* =======================================================================
 * [10] 조용한 고장 감시 — 경고가 안 났는가
 * ===================================================================== */
console.log("\n[10] 경고 0건");
{
  const B = boot(candles, { 옛osc: { rsi: true } });
  B.K.setOn("rsi-14", false);
  B.K.setOn("rsi-14", true);
  ok("정의 등록 · 켜기 · 끄기에 경고가 하나도 없다", B.warns.length === 0, B.warns.slice(0, 2).join(" | "));
  ok(
    "rsi 정의가 '모르는 칸' 경고를 안 낸다 (scale · guides 는 아는 칸)",
    B.warns.every((w) => w.indexOf("모르는 칸") < 0),
    B.warns.join(" | ")
  );
}

/* =======================================================================
 * [11] 등록
 * ===================================================================== */
console.log("\n[11] 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", order.indexOf("tests/chart-indicator-rsi-move.test.js") >= 0);
  const me = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", me.indexOf("되돌리기") >= 0);
}

console.log("\n  통과 " + pass + " / 실패 " + fail + "\n");
process.exit(fail ? 1 : 0);
