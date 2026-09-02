/* tests/chart-indicator-ma-move.test.js
 * =========================================================================
 * 옛 MA(7)·MA(25)·MA(99) 를 지표 틀로 옮긴 것 — 봉인
 * =========================================================================
 * 2026-09-02 (11단계). js/chart-indicators.js 가 그리던 MA 세 줄이
 * js/chart-indicator-kit.js 로 옮겨졌습니다. 이 파일은 그 옮김이 회원 화면을
 * 조용히 바꾸지 않았는지 지킵니다.
 *
 * ── 이 건에서 제일 위험한 것 ────────────────────────────────────────────
 *   ① 켜 두었던 것이 꺼진다   회원 브라우저의 옛 저장칸(chart-indicators)과
 *                             새 저장칸(chart-indicator-kit)이 다릅니다.
 *   ② 색이 바뀐다             금 #F0B429 · 흰 #E7ECF5 · 회 #838DA4 그대로여야 합니다.
 *   ③ 값이 달라진다           옛 computeSMA 와 ★소수점 끝자리까지★ 같아야 합니다.
 *                             숫자를 박지 않고 ★옛 파일을 실제로 실행해★ 대조합니다.
 *   ④ 선이 두 벌 그려진다     옛 MA 를 안 끄면 같은 자리에 두 번 그립니다.
 *   ⑤ 줄이 뒤섞인다           fx 목록·칩 줄에서 옛 자리를 그대로 이어받아야 합니다.
 *   ⑥ 두 번 옮긴다            회원이 지운 MA 줄이 새로고침마다 되살아납니다.
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
const OLD_FILE = "js/chart-indicators.js";

const KIT_SRC = fs.readFileSync(path.join(REPO, KIT_FILE), "utf8");
const OLD_SRC = fs.readFileSync(path.join(REPO, OLD_FILE), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
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
  };
}

/* fx 목록 창을 옛 모듈이 그린 그대로 만듭니다 (주 차트 5줄 · 아래 칸 2줄) */
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
 *   opts.옛상태     옛 모듈이 들고 있는 켜짐/꺼짐
 *   opts.getState없음  옛 모듈이 아직 상태를 안 읽은 상황
 *   opts.saved      새 저장칸에 이미 들어 있던 것
 */
function boot(candles, opts) {
  opts = opts || {};
  const timers = [];
  const warns = [];
  const stored = {};
  const storeWrites = [];
  const storeReads = [];
  if (opts.saved) stored["chart-indicator-kit"] = opts.saved;

  const candleSeries = makeFakeSeries("Candlestick", { priceScaleId: "right" });
  candleSeries._data = (candles || []).slice();
  const volumeSeries = makeFakeSeries("Histogram", { priceScaleId: "" });
  const addedSeries = [];
  const chart = {
    panes() {
      return [
        {
          getSeries() {
            return [candleSeries, volumeSeries];
          },
          getStretchFactor() {
            return 1;
          },
        },
      ];
    },
    addSeries(def, o) {
      const s = makeFakeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", o);
      addedSeries.push(s);
      return s;
    },
    removeSeries(s) {
      const i = addedSeries.indexOf(s);
      if (i >= 0) addedSeries.splice(i, 1);
    },
    addPane() {
      return { setStretchFactor() {}, paneIndex: () => 1, getSeries: () => [] };
    },
    removePane() {},
  };

  const head = makeEl("head");
  const body = makeEl("body");
  const panel = makeEl("div");
  panel.className = "chart-panel";
  const indBar = makeEl("div");
  indBar.className = "tl-ind-bar";
  /* 옛 칩 다섯 개 — 옛 모듈이 그린 그대로 */
  ["ma7", "ma25", "ma99", "bb", "vol"].forEach((k) => {
    const b = makeEl("button");
    b.className = "tl-ind-btn";
    b.setAttribute("data-ind", k);
    indBar.appendChild(b);
  });
  panel.appendChild(indBar);
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

  /* 옛 모듈 흉내 — getState / setOn 을 실제로 들고 있습니다 */
  const 옛상태 = Object.assign(
    { ma7: false, ma25: false, ma99: false, bb: false, vol: true },
    opts.옛상태 || {}
  );
  const calls = { setOn: [], isOn: [], toggle: [] };
  const ChartIndicators = {
    isOn(k) {
      calls.isOn.push(k);
      return !!옛상태[k];
    },
    toggle(k) {
      calls.toggle.push(k);
      옛상태[k] = !옛상태[k];
      return 옛상태[k];
    },
    MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 },
    COLORS: { ma7: "#F0B429", ma25: "#E7ECF5", ma99: "#838DA4", bb: "#838DA4" },
  };
  if (!opts.옛모듈없음) {
    if (!opts.getState없음) {
      ChartIndicators.getState = function () {
        const out = {};
        for (const k in 옛상태) out[k] = 옛상태[k];
        return out;
      };
    }
    ChartIndicators.setOn = function (k, on) {
      calls.setOn.push(k + "=" + !!on);
      옛상태[k] = !!on;
    };
  }

  const bus = {};
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
        storeWrites.push(k);
        stored[k] = JSON.parse(JSON.stringify(v));
        return true;
      },
      load(k) {
        storeReads.push(k);
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
    },
    ChartIndicators,
  };

  vm.createContext(sandbox);
  vm.runInContext(KIT_SRC, sandbox, { filename: KIT_FILE });

  const tick = () => timers.slice().forEach((t) => t.alive && t.fn());
  tick();
  tick();

  return {
    K: sandbox.App.ChartIndicatorKit,
    sandbox,
    candleSeries,
    addedSeries,
    stored,
    storeWrites,
    storeReads,
    warns,
    옛상태,
    calls,
    indBar,
    menu,
    tick,
  };
}

/** 옛 js/chart-indicators.js 를 그대로 실행해 computeSMA 를 꺼내 옵니다.
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
  vm.runInContext(OLD_SRC, sandbox, { filename: OLD_FILE });
  return sandbox.App.ChartIndicators;
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
    .filter(
      (b) =>
        String(b.className).indexOf("tl-ind-btn") >= 0 ||
        String(b.className).indexOf("tl-kit-btn") >= 0
    )
    .map((b) => b.getAttribute("data-ind") || b.getAttribute("data-kit"));
}

const candles = makeCandles(160);
const closes = candles.map((c) => c.close);
const times = candles.map((c) => c.time);

console.log("\n=== 옛 MA 를 틀로 옮긴 것 ===");

/* =======================================================================
 * [1] ⭐ 값이 그대로인가 — 옛 computeSMA 와 소수점 끝자리까지
 * ===================================================================== */
console.log("\n[1] 값 대조 (옛 js/chart-indicators.js 를 실제로 실행해서)");
{
  const 옛 = 옛계산();
  ok("옛 모듈에서 computeSMA 를 꺼냈다", typeof 옛.computeSMA === "function");
  ok(
    "옛 기간이 7 · 25 · 99 그대로다",
    옛.MA_PERIODS.ma7 === 7 && 옛.MA_PERIODS.ma25 === 25 && 옛.MA_PERIODS.ma99 === 99,
    JSON.stringify(옛.MA_PERIODS)
  );
  ok(
    "옛 색이 금 · 흰 · 회 그대로다",
    옛.COLORS.ma7 === "#F0B429" && 옛.COLORS.ma25 === "#E7ECF5" && 옛.COLORS.ma99 === "#838DA4",
    JSON.stringify(옛.COLORS)
  );

  const B = boot(candles, { 옛상태: { ma7: false, ma25: false, ma99: false } });
  [
    ["ma-7", 7],
    ["ma-25", 25],
    ["ma-99", 99],
  ].forEach(([id, p]) => {
    const n0 = B.addedSeries.length;
    B.K.setOn(id, true);
    const s = B.addedSeries[n0];
    const 옛값 = 옛.computeSMA(closes, times, p);
    ok(
      "MA(" + p + ") 점 개수가 옛것과 같다",
      !!s && s.data().length === 옛값.length,
      (s ? s.data().length : "선없음") + " vs " + 옛값.length
    );
    const 오차 = s.data().reduce((m, q, i) => Math.max(m, Math.abs(q.value - 옛값[i].value)), 0);
    ok("MA(" + p + ") 값이 옛것과 ★완전히★ 같다 (오차 0)", 오차 === 0, "최대오차 " + 오차);
    ok(
      "MA(" + p + ") 점의 시각도 같다",
      s.data().every((q, i) => q.time === 옛값[i].time)
    );
    B.K.setOn(id, false);
  });

  /* 진행 중인 봉 — O(1) step 이 전체 재계산과 같은 값을 내는가 */
  const B2 = boot(candles);
  B2.K.setOn("ma-7", true);
  const s7 = B2.addedSeries[0];
  const last = candles[candles.length - 1];
  const 새종가 = last.close + 231.5;
  B2.sandbox.App.Bus.emit("kline:update", {
    symbol: "BTCUSDT",
    candle: {
      time: last.time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: 새종가,
      volume: 3,
    },
  });
  const 바뀐 = closes.slice(0, -1).concat([새종가]);
  const 기대 = 옛.computeSMA(바뀐, times, 7);
  const d7 = s7.data();
  ok(
    "진행 중인 봉을 갱신해도 옛 계산과 같다 (오차 1e-9 이하)",
    Math.abs(d7[d7.length - 1].value - 기대[기대.length - 1].value) < 1e-9,
    d7[d7.length - 1].value + " vs " + 기대[기대.length - 1].value
  );

  /* 같은 봉이 여러 번 와도 값이 흔들리면 안 됩니다 */
  for (let i = 0; i < 5; i++) {
    B2.sandbox.App.Bus.emit("kline:update", {
      symbol: "BTCUSDT",
      candle: {
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: 새종가,
        volume: 3,
      },
    });
  }
  const d7b = s7.data();
  ok(
    "같은 봉을 여섯 번 갱신해도 값이 그대로다",
    d7b.length === d7.length &&
      Math.abs(d7b[d7b.length - 1].value - 기대[기대.length - 1].value) < 1e-9
  );

  /* 새 봉이 와도 옛 계산과 같아야 합니다 */
  const 새봉 = {
    time: last.time + 60,
    open: 새종가,
    high: 새종가 + 5,
    low: 새종가 - 5,
    close: 새종가 + 3,
    volume: 3,
  };
  B2.sandbox.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: 새봉 });
  const 기대2 = 옛.computeSMA(바뀐.concat([새봉.close]), times.concat([새봉.time]), 7);
  const d7c = s7.data();
  ok(
    "새 봉이 생겨도 옛 계산과 같다 (오차 1e-9 이하)",
    Math.abs(d7c[d7c.length - 1].value - 기대2[기대2.length - 1].value) < 1e-9,
    d7c[d7c.length - 1].value + " vs " + 기대2[기대2.length - 1].value
  );
}

/* =======================================================================
 * [2] ⭐⭐ 켜 두었던 것이 그대로 켜져 있는가
 * ===================================================================== */
console.log("\n[2] 옮겨도 켜짐 · 꺼짐 · 색이 그대로");
{
  const B = boot(candles, { 옛상태: { ma7: true, ma25: false, ma99: true } });
  ok("옮겼다는 표시가 남았다", B.K.isMovedForTest() === true);
  ok("켜 뒀던 MA(7) 이 켜진 채로 왔다", B.K.isOn("ma-7") === true);
  ok("꺼져 있던 MA(25) 는 꺼진 채로 왔다", B.K.isOn("ma-25") === false);
  ok("켜 뒀던 MA(99) 도 켜진 채로 왔다", B.K.isOn("ma-99") === true);

  const 목록 = B.K.listInstances();
  const m = {};
  목록.forEach((i) => (m[i.id] = i));
  ok("MA(7) 색이 금색 그대로다", m["ma-7"].colors.ma === "#F0B429", m["ma-7"].colors.ma);
  ok("MA(25) 색이 흰색 그대로다", m["ma-25"].colors.ma === "#E7ECF5", m["ma-25"].colors.ma);
  ok("MA(99) 색이 회색 그대로다", m["ma-99"].colors.ma === "#838DA4", m["ma-99"].colors.ma);
  const MA줄 = 목록.filter((x) => x.def === "ma");
  ok("굵기가 1px 그대로다", MA줄.every((x) => x.width === 1), MA줄.map((x) => x.width).join(","));
  ok("모양이 실선 그대로다", MA줄.every((x) => x.style === "solid"));
  ok(
    "기간이 7 · 25 · 99 그대로다",
    MA줄.map((x) => x.params.p).join(",") === "7,25,99",
    MA줄.map((x) => x.params.p).join(",")
  );

  /* ④ 선이 두 벌 그려지면 안 됩니다 — 옛 것을 확실히 껐는가 */
  ok(
    "옛 MA 를 전부 껐다",
    B.calls.setOn.join(",") === "ma7=false,ma25=false,ma99=false",
    B.calls.setOn.join(",")
  );
  ok(
    "옛 모듈 안에서도 꺼져 있다",
    B.옛상태.ma7 === false && B.옛상태.ma25 === false && B.옛상태.ma99 === false
  );
  ok("★옛 볼린저 · 거래량은 손대지 않았다★", B.옛상태.bb === false && B.옛상태.vol === true);
  ok("옛 것을 toggle 로 뒤집지 않았다 (setOn 만 씁니다)", B.calls.toggle.length === 0);

  /* 켜진 두 줄이 실제로 그려졌는가 */
  ok("켜져 있던 두 줄이 실제로 그려졌다", B.addedSeries.length === 2, String(B.addedSeries.length));
}

/* =======================================================================
 * [3] 저장칸 — 옛 칸에 쓰지도 읽지도 않는다
 * ===================================================================== */
console.log("\n[3] 저장칸");
{
  const B = boot(candles, { 옛상태: { ma7: true } });
  ok(
    "저장은 chart-indicator-kit 한 칸에만 한다",
    B.storeWrites.every((k) => k === "chart-indicator-kit"),
    B.storeWrites.join(",")
  );
  ok("옛 칸(chart-indicators)에 쓰지 않는다", B.storeWrites.indexOf("chart-indicators") < 0);
  ok(
    "옛 칸을 ★읽지도★ 않는다 (옛 모듈에게 물어봅니다)",
    B.storeReads.indexOf("chart-indicators") < 0,
    B.storeReads.join(",")
  );

  const saved = B.stored["chart-indicator-kit"];
  ok("옮겼다는 표시가 저장됐다", !!saved && !!saved.moved && saved.moved.ma === true);
  ok(
    "옮기기 직전 옛 상태를 적어 두었다 (되돌리기용)",
    !!saved.moved.legacy0 && saved.moved.legacy0.ma7 === true && saved.moved.legacy0.ma25 === false,
    JSON.stringify(saved.moved && saved.moved.legacy0)
  );

  /* ⑥ 두 번 옮기면 안 됩니다 */
  const B2 = boot(candles, {
    saved: saved,
    옛상태: { ma7: false, ma25: false, ma99: false },
  });
  ok("새로고침하면 다시 옮기지 않는다", B2.calls.setOn.length === 0, B2.calls.setOn.join(","));
  ok("새로고침해도 켠 것이 그대로다", B2.K.isOn("ma-7") === true);

  /* 회원이 MA 줄을 지웠으면 다시 살아나면 안 됩니다 */
  B2.K.removeInstance("ma-25");
  const saved2 = B2.stored["chart-indicator-kit"];
  const B3 = boot(candles, { saved: saved2 });
  ok(
    "회원이 지운 MA 줄은 되살아나지 않는다",
    B3.K.listInstances().every((i) => i.id !== "ma-25"),
    B3.K.listInstances()
      .map((i) => i.id)
      .join(",")
  );
}

/* =======================================================================
 * [4] ⑤ 화면 — 옛 자리를 그대로 이어받는가
 * ===================================================================== */
console.log("\n[4] fx 목록과 칩 줄의 자리");
{
  const B = boot(candles, { 옛상태: { ma7: true } });
  const 줄 = 줄이름들(B.menu);
  ok(
    "옛 MA 줄 셋이 목록에서 빠졌다",
    ["ma7", "ma25", "ma99"].every((k) => 줄.indexOf(k) < 0),
    줄.join(" ")
  );
  ok(
    "옛 볼린저 · 거래량 · RSI · MACD 줄은 그대로다",
    ["bb", "vol", "rsi", "macd"].every((k) => 줄.indexOf(k) >= 0),
    줄.join(" ")
  );
  ok(
    "새 MA 줄이 ★옛 자리 그대로★ 맨 앞 셋이다",
    줄.slice(0, 3).join(",") === "ma-7,ma-25,ma-99",
    줄.join(" ")
  );
  ok(
    "주 차트 줄 순서가 옛것과 같다 (MA 셋 · 볼린저 · 거래량)",
    줄.slice(0, 5).join(",") === "ma-7,ma-25,ma-99,bb,vol",
    줄.join(" ")
  );
  ok("아래 칸 줄이 뒤에 그대로 있다", 줄.slice(-2).join(",") === "rsi,macd", 줄.join(" "));
  ok("목록 줄 수가 옮기기 전과 같다 (7 + 얹혀 있던 EMA 2)", 줄.length === 9, String(줄.length));

  const 칩 = 칩이름들(B.indBar);
  ok("옛 MA 칩 셋이 빠졌다", ["ma7", "ma25", "ma99"].every((k) => 칩.indexOf(k) < 0), 칩.join(" "));
  ok(
    "새 MA 칩이 ★옛 자리 그대로★ 맨 앞 셋이다",
    칩.slice(0, 3).join(",") === "ma-7,ma-25,ma-99",
    칩.join(" ")
  );
  ok("옛 볼린저 · 거래량 칩은 그대로다", 칩[3] === "bb" && 칩[4] === "vol", 칩.join(" "));
  ok("칩 개수가 옮기기 전과 같다 (5 + EMA 2)", 칩.length === 7, String(칩.length));
}

/* =======================================================================
 * [5] 옛 모듈이 늦거나 없을 때 — ★모르면 옮기지 않는다★
 * ===================================================================== */
console.log("\n[5] 옛 상태를 못 읽으면 옮기지 않는다");
{
  const B = boot(candles, { getState없음: true, 옛상태: { ma7: true } });
  ok("옛 켜짐/꺼짐을 못 읽으면 옮기지 않는다", B.K.isMovedForTest() === false);
  ok(
    "그래도 오류로 죽지 않는다",
    B.warns.filter((w) => w.indexOf("Cannot") >= 0).length === 0,
    B.warns.join(" | ")
  );
  ok(
    "못 옮겼으면 옛 줄을 화면에서 빼지도 않는다",
    줄이름들(B.menu).indexOf("ma7") >= 0,
    줄이름들(B.menu).join(" ")
  );
  ok("못 옮겼으면 옛 칩도 그대로 둔다", 칩이름들(B.indBar).indexOf("ma7") >= 0);

  const B2 = boot(candles, { 옛모듈없음: true });
  ok("옛 모듈에 setOn 이 없어도 죽지 않는다", !!B2.K);
}

/* =======================================================================
 * [6] 되돌리기
 * ===================================================================== */
console.log("\n[6] 되돌리기 (restoreLegacyMA)");
{
  const B = boot(candles, { 옛상태: { ma7: true, ma25: false, ma99: true } });
  ok("되돌리기 함수가 있다", typeof B.K.restoreLegacyMA === "function");
  const r = B.K.restoreLegacyMA();
  ok("되돌렸다고 답한다", r === true);
  ok(
    "우리 MA 줄 셋이 사라졌다",
    B.K.listInstances().every((i) => i.def !== "ma"),
    B.K.listInstances()
      .map((i) => i.id)
      .join(",")
  );
  ok(
    "옛 켜짐/꺼짐이 그대로 돌아왔다",
    B.옛상태.ma7 === true && B.옛상태.ma25 === false && B.옛상태.ma99 === true,
    JSON.stringify({ ma7: B.옛상태.ma7, ma25: B.옛상태.ma25, ma99: B.옛상태.ma99 })
  );
  ok("옮겼다는 표시가 지워졌다", B.K.isMovedForTest() === false);
  const saved = B.stored["chart-indicator-kit"];
  ok("저장칸에서도 표시가 지워졌다", !saved.moved || saved.moved.ma !== true);
}

/* =======================================================================
 * [7] 라인(종가선) 모드에서 MA(7) 을 점선으로 — 넘겨주는 자리
 * ===================================================================== */
console.log("\n[7] js/chart-ma-line-mode.js 에 MA(7) 선을 넘겨주는 자리");
{
  const B = boot(candles, { 옛상태: { ma7: false } });
  ok("넘겨주는 함수가 있다", typeof B.K.getMovedMa7Series === "function");
  ok("MA(7) 이 꺼져 있으면 없다고 답한다", B.K.getMovedMa7Series() === null);
  B.K.setOn("ma-7", true);
  const s = B.K.getMovedMa7Series();
  ok("MA(7) 을 켜면 그 선을 내어준다", !!s && s === B.addedSeries[0]);
  ok(
    "내어준 선이 금색 1px 이다",
    s.options().color === "#F0B429" && s.options().lineWidth === 1,
    s.options().color + " / " + s.options().lineWidth
  );
  B.K.setOn("ma-7", false);
  ok("다시 끄면 없다고 답한다", B.K.getMovedMa7Series() === null);

  /* 한쪽만 고치는 것을 막습니다 */
  const 모드 = fs.readFileSync(path.join(REPO, "js/chart-ma-line-mode.js"), "utf8");
  ok("js/chart-ma-line-mode.js 가 그 함수를 본다", 모드.indexOf("getMovedMa7Series") >= 0);
  ok("틀이 없을 때 옛 자리로 물러설 길이 남아 있다", 모드.indexOf("L.ma7") >= 0);
}

/* =======================================================================
 * [8] 옛 파일은 한 글자도 안 고쳤다
 * ===================================================================== */
console.log("\n[8] 옛 파일 무수정 · 새로 얹을 때의 기본값");
{
  /* ⚠️ 옮겨 온 세 줄(7·25·99 · 바이낸스)과 새로 얹을 때(9 · 트레이딩뷰)는
     ★다릅니다.★ 헷갈려서 옮겨 온 줄을 9 로 바꾸는 일이 없게 못 박습니다. */
  const B8 = boot(candles, { 옛상태: {} });
  const 정의8 = B8.K.listDefs().filter((d) => d.id === "ma")[0];
  ok("새로 얹는 MA 의 기본 기간이 9 다 (트레이딩뷰)", !!정의8 && 정의8.params.p === 9, 정의8 && String(정의8.params.p));
  ok(
    "그래도 옮겨 온 세 줄은 7 · 25 · 99 그대로다 (바이낸스)",
    B8.K.listInstances()
      .filter((i) => i.def === "ma")
      .map((i) => i.params.p)
      .join(",") === "7,25,99"
  );
  ok("MA 가 지표 추가 목록 맨 앞이다", B8.K.listDefs()[0].id === "ma", B8.K.listDefs()[0].id);
  ok("js/chart-indicators.js 가 아직 MA 를 계산할 줄 안다", OLD_SRC.indexOf("function computeSMA") >= 0);
  ok(
    "js/chart-indicators.js 의 MA 색이 그대로다",
    OLD_SRC.indexOf('ma7: "#F0B429"') >= 0 &&
      OLD_SRC.indexOf('ma25: "#E7ECF5"') >= 0 &&
      OLD_SRC.indexOf('ma99: "#838DA4"') >= 0
  );
  ok("틀이 옛 파일을 부르지 않는다 (감싸기만 합니다)", KIT_SRC.indexOf("require(") < 0);
}

console.log("\n통과 " + pass + " / 실패 " + fail);
process.exit(fail ? 1 : 0);
