/* tests/chart-indicator-bb-move.test.js
 * =========================================================================
 * 옛 볼린저(BOLL 20, 2) 를 지표 틀로 옮긴 것 — 봉인
 * =========================================================================
 * 2026-09-02 (12단계). js/chart-indicators.js 가 그리던 볼린저 세 줄(위·중간·
 * 아래)이 js/chart-indicator-kit.js 로 옮겨졌습니다. 이 파일은 그 옮김이 회원
 * 화면을 조용히 바꾸지 않았는지 지킵니다.
 *
 * ⚠️ 11단계(MA)의 tests/chart-indicator-ma-move.test.js 와 ★같은 모양★ 입니다.
 *    MA 쪽 봉인을 그대로 두고 볼린저만 따로 봅니다(한 파일에 두 건을 섞지 않음).
 *
 * ── 이 건에서 제일 위험한 것 ────────────────────────────────────────────
 *   ① 켜 두었던 것이 꺼진다   옛 저장칸(chart-indicators)과 새 칸이 다릅니다.
 *   ② 색·선모양이 바뀐다      위·중간·아래 ★셋 다★ #838DA4 ★점선★ 이어야 합니다.
 *                             (실선인 MA(99) 와 선 모양으로 구분됩니다)
 *   ③ 값이 달라진다           옛 computeBB 와 ★소수점 끝자리까지★ 같아야 합니다.
 *                             숫자를 박지 않고 ★옛 파일을 실제로 실행해★ 대조합니다.
 *                             표준편차는 ★모집단★(÷p) 입니다 - ÷(p-1) 로 바뀌면
 *                             밴드 폭이 조용히 넓어집니다.
 *   ④ 선이 두 벌 그려진다     옛 볼린저를 안 끄면 같은 자리에 여섯 줄이 됩니다.
 *   ⑤ 자리가 바뀐다           옛 자리는 MA(99) 다음 · 거래량 앞입니다.
 *                             실제로 옮기는 순서를 잘못 짜서 거래량 뒤로 밀렸었습니다.
 *   ⑥ 두 번 옮긴다            회원이 지운 줄이 새로고침마다 되살아납니다.
 *   ⑦ 거래량을 건드린다       ★거래량은 이번에 안 옮겼습니다.★ 기본 켜짐 그대로여야 합니다.
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

console.log("\n=== 옛 볼린저를 틀로 옮긴 것 ===");

/* =======================================================================
 * [1] 값이 그대로인가 — 옛 computeBB 와 소수점 끝자리까지
 *     숫자를 손으로 옮겨 적지 않습니다 — 옛 파일을 실제로 실행합니다.
 * ===================================================================== */
console.log("\n[1] 값 대조 (옛 js/chart-indicators.js 를 실제로 실행해서)");
{
  const 옛 = 옛계산();
  ok("옛 모듈에서 computeBB 를 꺼냈다", typeof 옛.computeBB === "function");
  ok("옛 기간이 20 그대로다", 옛.BB_PERIOD === 20, String(옛.BB_PERIOD));
  ok("옛 배수가 2 그대로다", 옛.BB_MULT === 2, String(옛.BB_MULT));
  ok("옛 색이 #838DA4 그대로다", 옛.COLORS.bb === "#838DA4", 옛.COLORS.bb);

  const B = boot(candles, { 옛상태: { bb: false } });
  const n0 = B.addedSeries.length;
  B.K.setOn("bb-20", true);
  const 만든선 = B.addedSeries.slice(n0);
  ok("켜면 선이 정확히 3개 생긴다 (위·중간·아래)", 만든선.length === 3, String(만든선.length));

  const 옛값 = 옛.computeBB(closes, times, 옛.BB_PERIOD, 옛.BB_MULT);
  const 순서 = ["upper", "middle", "lower"];
  순서.forEach((키, i) => {
    const s = 만든선[i];
    const 기대 = 옛값[키];
    ok(
      "볼린저 " + 키 + " 점 개수가 옛것과 같다",
      !!s && s.data().length === 기대.length,
      (s ? s.data().length : "선없음") + " vs " + 기대.length
    );
    const 오차 = s.data().reduce((m, q, k) => Math.max(m, Math.abs(q.value - 기대[k].value)), 0);
    ok("볼린저 " + 키 + " 값이 옛것과 완전히 같다 (오차 0)", 오차 === 0, "최대오차 " + 오차);
    ok(
      "볼린저 " + 키 + " 점의 시각도 같다",
      s.data().every((q, k) => q.time === 기대[k].time)
    );
  });
  ok(
    "점 개수가 봉 수보다 기간-1 만큼 적다",
    만든선[0].data().length === candles.length - 19,
    만든선[0].data().length + " (봉 " + candles.length + ")"
  );

  /* 진행 중인 봉 — O(1) step 이 전체 재계산과 같은 값을 내는가 */
  const B2 = boot(candles, { 옛상태: { bb: false } });
  const m0 = B2.addedSeries.length;
  B2.K.setOn("bb-20", true);
  const 선들 = B2.addedSeries.slice(m0);
  const last = candles[candles.length - 1];
  const 새종가 = last.close + 231.5;
  B2.sandbox.App.Bus.emit("kline:update", {
    symbol: "BTCUSDT",
    candle: { time: last.time, open: last.open, high: last.high, low: last.low, close: 새종가, volume: 3 },
  });
  const 바뀐 = closes.slice(0, -1).concat([새종가]);
  const 기대2 = 옛.computeBB(바뀐, times, 20, 2);
  순서.forEach((키, i) => {
    const d = 선들[i].data();
    const e = 기대2[키];
    ok(
      "진행 중인 봉을 갱신해도 " + 키 + " 가 옛 계산과 같다 (오차 1e-9 이하)",
      Math.abs(d[d.length - 1].value - e[e.length - 1].value) < 1e-9,
      d[d.length - 1].value + " vs " + e[e.length - 1].value
    );
  });

  const 전 = 순서.map((키, i) => 선들[i].data()[선들[i].data().length - 1].value);
  for (let r = 0; r < 6; r++) {
    B2.sandbox.App.Bus.emit("kline:update", {
      symbol: "BTCUSDT",
      candle: { time: last.time, open: last.open, high: last.high, low: last.low, close: 새종가, volume: 3 },
    });
  }
  순서.forEach((키, i) => {
    const d = 선들[i].data();
    ok(
      "같은 봉이 여섯 번 더 와도 " + 키 + " 값이 그대로다",
      d[d.length - 1].value === 전[i],
      d[d.length - 1].value + " vs " + 전[i]
    );
    ok(
      "같은 봉이 여섯 번 더 와도 " + 키 + " 점 개수가 안 늘어난다",
      d.length === 기대2[키].length,
      d.length + " vs " + 기대2[키].length
    );
  });

  const 마지막 = 순서.map((키, i) => 선들[i].data()[선들[i].data().length - 1].value);
  ok("위 > 중간 > 아래 순서다", 마지막[0] > 마지막[1] && 마지막[1] > 마지막[2], 마지막.join(" > "));

  /* 표준편차가 모집단(÷p) 인가 — ÷(p-1) 이면 밴드가 넓어집니다 */
  {
    const p = 20;
    const 창 = closes.slice(closes.length - p);
    const 평균 = 창.reduce((a, b) => a + b, 0) / p;
    let acc = 0;
    창.forEach((v) => (acc += (v - 평균) * (v - 평균)));
    const 모집단 = Math.sqrt(acc / p);
    const 표본 = Math.sqrt(acc / (p - 1));
    const 반폭 = 옛값.upper[옛값.upper.length - 1].value - 옛값.middle[옛값.middle.length - 1].value;
    ok(
      "표준편차가 모집단(÷p) 이다 (÷(p-1) 아님)",
      Math.abs(반폭 - 2 * 모집단) < 1e-9 && Math.abs(반폭 - 2 * 표본) > 1e-9,
      "밴드 반폭 " + 반폭 + " / 모집단x2 " + 2 * 모집단 + " / 표본x2 " + 2 * 표본
    );
  }
}

/* =======================================================================
 * [2] 켜짐/꺼짐 · 색 · 선모양이 그대로인가
 * ===================================================================== */
console.log("\n[2] 켜 두었던 것 · 색 · 선모양");
{
  [true, false].forEach((켬) => {
    const B = boot(candles, { 옛상태: { bb: 켬 } });
    ok("옮겼다는 표시가 남는다 (bb=" + 켬 + ")", B.K.isMovedBBForTest() === true);
    const it = B.K.listInstances().filter((x) => x.id === "bb-20")[0];
    ok("bb-20 인스턴스가 생겼다 (bb=" + 켬 + ")", !!it);
    ok("옛 켜짐/꺼짐이 그대로 옮겨졌다 (bb=" + 켬 + ")", !!it && it.on === 켬, it ? String(it.on) : "없음");
  });

  const B = boot(candles, { 옛상태: { bb: true } });
  const it = B.K.listInstances().filter((x) => x.id === "bb-20")[0];
  ok(
    "위·중간·아래 색이 셋 다 #838DA4 다",
    it.colors.upper === "#838DA4" && it.colors.middle === "#838DA4" && it.colors.lower === "#838DA4",
    JSON.stringify(it.colors)
  );
  ok("점선이다", it.style === "dashed", it.style);
  ok("굵기가 1 이다", it.width === 1, String(it.width));
  ok("기간 20 · 배수 2 다", it.params.p === 20 && it.params.k === 2, it.params.p + " / " + it.params.k);
  ok("주 차트에 그린다 (아래 별도 칸 아님)", it.pane === "main", it.pane);
  ok("이름이 옛 목록 글자 그대로다", it.name === "BOLL(20, 2)", it.name);

  ok("옛 볼린저를 껐다", B.calls.setOn.indexOf("bb=false") >= 0, B.calls.setOn.join(","));
  ok("옛 모듈 안에서도 볼린저가 꺼져 있다", B.옛상태.bb === false, String(B.옛상태.bb));
  ok("거래량은 손대지 않았다 (지금도 켜짐)", B.옛상태.vol === true, String(B.옛상태.vol));
  ok("거래량을 끄려 든 적이 없다", B.calls.setOn.indexOf("vol=false") < 0, B.calls.setOn.join(","));
  ok("옛 것을 toggle 로 뒤집지 않았다 (setOn 만 씁니다)", B.calls.toggle.length === 0);
  ok("켜져 있던 볼린저가 실제로 3줄 그려졌다", B.addedSeries.length === 3, String(B.addedSeries.length));

  const 점선 = B.addedSeries.every((s) => s.options().lineStyle === 2);
  ok("그린 선 셋이 실제로 점선 옵션이다", 점선, B.addedSeries.map((s) => s.options().lineStyle).join(","));
  const 색 = B.addedSeries.every((s) => s.options().color === "#838DA4");
  ok("그린 선 셋이 실제로 #838DA4 다", 색, B.addedSeries.map((s) => s.options().color).join(","));
  const 굵기 = B.addedSeries.every((s) => s.options().lineWidth === 1);
  ok("그린 선 셋이 실제로 1px 이다", 굵기, B.addedSeries.map((s) => s.options().lineWidth).join(","));
}

/* =======================================================================
 * [3] 저장칸 — 옛 칸에 쓰지도 읽지도 않는다
 * ===================================================================== */
console.log("\n[3] 저장칸");
{
  const B = boot(candles, { 옛상태: { bb: true } });
  ok("옛 저장칸(chart-indicators)에 쓰지 않는다", B.storeWrites.indexOf("chart-indicators") < 0, B.storeWrites.join(","));
  ok("옛 저장칸을 읽지도 않는다", B.storeReads.indexOf("chart-indicators") < 0, B.storeReads.join(","));
  const saved = B.stored["chart-indicator-kit"];
  ok("새 칸에 옮겼다는 표시가 저장됐다", !!(saved && saved.moved && saved.moved.bb === true), JSON.stringify(saved && saved.moved));
  ok("되돌릴 때 쓸 옛 상태도 같이 저장됐다", !!(saved && saved.moved && saved.moved.legacyBB && saved.moved.legacyBB.bb === true));
  ok("MA 표시도 같은 칸에 그대로 있다", !!(saved && saved.moved && saved.moved.ma === true));
}

/* =======================================================================
 * [4] 줄 순서 — 옛 자리 그대로여야 합니다
 * ===================================================================== */
console.log("\n[4] fx 목록 · 칩 줄에서 옛 자리 그대로");
{
  const B = boot(candles, { 옛상태: { bb: true } });
  const 줄 = 줄이름들(B.menu);
  ok("옛 bb 줄이 목록에서 빠졌다", 줄.indexOf("bb") < 0, 줄.join(" "));
  ok("새 bb-20 줄이 들어왔다", 줄.indexOf("bb-20") >= 0, 줄.join(" "));
  ok(
    "옛 자리 그대로 — MA(99) 다음 · 거래량 앞",
    줄.slice(0, 5).join(",") === "ma-7,ma-25,ma-99,bb-20,vol",
    줄.join(" ")
  );
  ok("거래량 줄은 그대로 있다", 줄.indexOf("vol") >= 0, 줄.join(" "));
  ok("아래 칸 줄(RSI · MACD)이 뒤에 그대로다", 줄.slice(-2).join(",") === "rsi,macd", 줄.join(" "));
  ok("목록 줄 수가 옮기기 전과 같다 (7 + 얹혀 있던 EMA 2)", 줄.length === 9, String(줄.length));

  const 칩 = 칩이름들(B.indBar);
  ok("옛 bb 칩이 빠졌다", 칩.indexOf("bb") < 0, 칩.join(" "));
  ok("새 bb-20 칩이 옛 자리 그대로 넷째다", 칩[3] === "bb-20" && 칩[4] === "vol", 칩.join(" "));
  ok("칩 개수가 옮기기 전과 같다 (5 + EMA 2)", 칩.length === 7, String(칩.length));
}

/* =======================================================================
 * [5] 옛 상태를 못 읽으면 옮기지 않는다
 * ===================================================================== */
console.log("\n[5] 모르면 옮기지 않는다");
{
  const B = boot(candles, { getState없음: true, 옛상태: { bb: true } });
  ok("옛 켜짐/꺼짐을 못 읽으면 옮기지 않는다", B.K.isMovedBBForTest() === false);
  const 줄 = 줄이름들(B.menu);
  ok("옛 bb 줄이 그대로 남아 있다", 줄.indexOf("bb") >= 0, 줄.join(" "));
  ok("옛 것을 끄지도 않았다", B.옛상태.bb === true, String(B.옛상태.bb));

  const B2 = boot(candles, { 옛모듈없음: true });
  ok("옛 모듈 자체가 없으면 옮기지 않는다", B2.K.isMovedBBForTest() === false);
}

/* =======================================================================
 * [6] 두 번 옮기지 않는다 — 회원이 지운 줄이 되살아나면 안 됩니다
 * ===================================================================== */
console.log("\n[6] 두 번 옮기지 않는다");
{
  const B = boot(candles, { 옛상태: { bb: true } });
  ok("한 번은 옮겼다", B.K.isMovedBBForTest() === true);
  ok("다시 부르면 아무것도 안 한다", B.K.moveLegacyBBForTest() === false);

  B.K.removeInstance("bb-20");
  const saved = B.stored["chart-indicator-kit"];
  const B2 = boot(candles, { 옛상태: { bb: true }, saved: saved });
  ok(
    "회원이 지운 볼린저 줄이 새로고침해도 안 되살아난다",
    B2.K.listInstances().every((i) => i.id !== "bb-20"),
    B2.K.listInstances().map((i) => i.id).join(",")
  );
}

/* =======================================================================
 * [7] 되돌리기
 * ===================================================================== */
console.log("\n[7] 되돌리기 (restoreLegacyBB)");
{
  const B = boot(candles, { 옛상태: { bb: true } });
  ok("되돌리기 함수가 있다", typeof B.K.restoreLegacyBB === "function");
  ok("되돌렸다고 답한다", B.K.restoreLegacyBB() === true);
  ok(
    "우리 볼린저 줄이 사라졌다",
    B.K.listInstances().every((i) => i.def !== "bb"),
    B.K.listInstances().map((i) => i.id).join(",")
  );
  ok("옛 켜짐이 그대로 돌아왔다", B.옛상태.bb === true, String(B.옛상태.bb));
  ok("옮겼다는 표시가 지워졌다", B.K.isMovedBBForTest() === false);
  const saved = B.stored["chart-indicator-kit"];
  ok("저장칸에서도 볼린저 표시가 지워졌다", !saved.moved || saved.moved.bb !== true, JSON.stringify(saved.moved));
  ok(
    "MA 표시는 그대로 남아 있다 (MA 가 다시 옮겨지면 안 됩니다)",
    !!(saved.moved && saved.moved.ma === true),
    JSON.stringify(saved.moved)
  );

  const B2 = boot(candles, { 옛상태: { bb: true, ma7: true } });
  B2.K.restoreLegacyMA();
  const s2 = B2.stored["chart-indicator-kit"];
  ok("MA 만 되돌려도 볼린저 표시는 남는다", !!(s2.moved && s2.moved.bb === true), JSON.stringify(s2.moved));
  ok(
    "그때 볼린저 줄도 그대로 남는다",
    B2.K.listInstances().some((i) => i.id === "bb-20"),
    B2.K.listInstances().map((i) => i.id).join(",")
  );
}

/* =======================================================================
 * [8] 꺼져 있으면 계산도 안 한다
 * ===================================================================== */
console.log("\n[8] 꺼져 있으면 계산도 안 한다");
{
  const B = boot(candles, { 옛상태: { bb: false } });
  ok("꺼져 있으면 선을 안 만든다", B.addedSeries.length === 0, String(B.addedSeries.length));
  const last = candles[candles.length - 1];
  B.sandbox.App.Bus.emit("kline:update", {
    symbol: "BTCUSDT",
    candle: { time: last.time, open: last.open, high: last.high, low: last.low, close: last.close + 10, volume: 3 },
  });
  ok("꺼져 있으면 시세가 와도 선이 안 생긴다", B.addedSeries.length === 0, String(B.addedSeries.length));

  B.K.setOn("bb-20", true);
  const it = B.K.getInstancesForTest()["bb-20"];
  ok(
    "켜면 확정 상태(commit)를 들고 있다 (틱마다 전체 재계산 안 함)",
    !!(it && it.live && it.live.commit),
    it && it.live ? String(!!it.live.commit) : "없음"
  );
  ok(
    "확정 상태가 창(buf)을 들고 있다 (기간 20칸)",
    !!(it.live.commit && it.live.commit.buf && it.live.commit.buf.length === 20),
    it.live.commit && it.live.commit.buf ? String(it.live.commit.buf.length) : "없음"
  );
}

/* =======================================================================
 * [9] 등록
 * ===================================================================== */
console.log("\n[9] 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", order.indexOf("tests/chart-indicator-bb-move.test.js") >= 0);
  const me = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", me.indexOf("되돌리기") >= 0);
}

console.log("\n  통과 " + pass + " / 실패 " + fail + "\n");
process.exit(fail ? 1 : 0);
