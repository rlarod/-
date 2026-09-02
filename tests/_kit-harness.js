/* tests/_kit-harness.js
 * =========================================================================
 * 지표 틀(js/chart-indicator-kit.js)을 브라우저 없이 그대로 태우는 도구
 * =========================================================================
 * 2026-09-02 기록팀.
 *
 * ── 왜 별도 파일인가 ────────────────────────────────────────────────────
 * 이 틀을 검사하는 테스트가 여럿이 됐습니다(색 겹침 · 기준선 · 계산).
 * 가짜 DOM 을 파일마다 한 벌씩 두면 ★같은 값이 여러 벌★ 이 됩니다. 이 프로젝트가
 * 오늘까지 여러 번 당한 모양이라, 부팅 도구는 여기 한 곳에만 둡니다.
 * (tests/harness.js · tests/_locked-hashes.js · tests/_engine-modules.js 와 같은 자리)
 *
 * ── ⚠️ 소스 글자나 줄 번호에 기대지 않습니다 ────────────────────────────
 * 차트팀이 지금 js/chart-indicator-kit.js 를 잡고 있습니다(2026-09-02 밤
 * 작업트리에 미커밋 변경). 그래서 이 도구도, 이걸 쓰는 테스트도 ★공개 API 와
 * 실제 동작★ 으로만 검사합니다. "몇 번째 줄에 무엇이 있다" 를 쓰지 않습니다.
 *
 * ── 진짜와 다르게 만든 곳 (일부러 그런 것) ──────────────────────────────
 *   1) removeSeries 된 시리즈에 removePriceLine 을 부르면 ★던집니다.★
 *      진짜 라이브러리는 조용히 넘어가지만, 그러면 "시리즈를 먼저 지워서
 *      기준선이 화면에 남는" 사고를 테스트가 못 봅니다. 던지게 해 두면
 *      순서가 뒤집히는 순간 남은 기준선 개수가 0 이 아니게 됩니다.
 *   2) MutationObserver 를 안 넣습니다 - 틀이 typeof 로 확인하고 건너뜁니다.
 *      fx 목록 감시는 tests/chart-indicator-kit-seal.test.js 가 이미 봅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
const KIT_FILE = "js/chart-indicator-kit.js";

/* ── 아주 작은 가짜 DOM ────────────────────────────────────────────────── */
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
    handlers: {},
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
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    addEventListener(ev, fn) {
      (this.handlers[ev] = this.handlers[ev] || []).push(fn);
    },
    click() {
      (this.handlers.click || []).forEach((f) => f());
    },
    querySelector(sel) {
      return this.querySelectorAll(sel)[0] || null;
    },
    querySelectorAll(sel) {
      const parts = String(sel).trim().split(/\s+/);
      const last = parts[parts.length - 1];
      const out = [];
      (function walk(n) {
        n.childNodes.forEach((c) => {
          if (c.nodeType !== 1) return;
          if (matchOne(c, last)) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
  };
  let 글자 = "";
  Object.defineProperty(el, "textContent", {
    get() {
      return 글자;
    },
    set(v) {
      글자 = String(v);
    },
  });
  Object.defineProperty(el, "lastChild", {
    get() {
      return this.childNodes[this.childNodes.length - 1] || null;
    },
  });
  return el;
}

/* ── 가짜 시리즈 - ★기준선(priceLine)까지 셉니다★ ─────────────────────── */
function makeSeries(type, options, 장부) {
  let 번호 = 0;
  return {
    _type: type,
    _opts: Object.assign({}, options),
    _data: [],
    _lines: [] /* 아직 안 지워진 기준선 */,
    _dead: false /* removeSeries 된 뒤인가 */,
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
    createPriceLine(opts) {
      if (장부) 장부.만든수++;
      const 선 = { _id: ++번호, opts: Object.assign({}, opts) };
      this._lines.push(선);
      return 선;
    },
    removePriceLine(선) {
      /* ⚠️ 일부러 던집니다 - 위 머리말 1) 참조.
         시리즈를 먼저 지우고 나서 기준선을 지우려 하면 여기서 걸립니다. */
      if (this._dead) throw new Error("시리즈가 이미 없습니다 - removePriceLine 실패");
      const i = this._lines.indexOf(선);
      if (i < 0) throw new Error("그런 기준선이 없습니다");
      this._lines.splice(i, 1);
      if (장부) 장부.지운수++;
    },
  };
}

/** 되풀이 가능한 가짜 캔들 (같은 seed 면 늘 같은 값 - 테스트가 흔들리지 않게) */
function makeCandles(n, seed) {
  const out = [];
  let s = typeof seed === "number" ? seed : 7;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  let px = 77000;
  for (let i = 0; i < n; i++) {
    px += (rnd() - 0.5) * 140 + Math.sin(i / 11) * 25;
    const o = px + (rnd() - 0.5) * 30;
    const c = px + (rnd() - 0.5) * 30;
    const hi = Math.max(o, c) + rnd() * 40;
    const lo = Math.min(o, c) - rnd() * 40;
    out.push({
      time: 1700000000 + i * 60,
      open: o,
      high: hi,
      low: lo,
      close: c,
      value: 10 + rnd() * 90 /* 거래량 시리즈가 쓰는 칸 */,
    });
  }
  return out;
}

/**
 * 틀을 한 번 태웁니다.
 *   candles   캔들 배열
 *   saved     저장돼 있던 상태 (없으면 처음 오는 회원)
 */
function boot(candles, saved) {
  const SRC = fs.readFileSync(path.join(REPO, KIT_FILE), "utf8");
  const timers = [];
  const warns = [];
  const stored = {};
  const 장부 = { 만든수: 0, 지운수: 0 };
  const 모든시리즈 = [];
  if (saved) stored["chart-indicator-kit"] = saved;

  const candleSeries = makeSeries("Candlestick", { priceScaleId: "right" }, 장부);
  candleSeries._data = (candles || []).map((c) => ({
    time: c.time,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
  const volumeSeries = makeSeries("Histogram", { priceScaleId: "" }, 장부);
  volumeSeries._data = (candles || []).map((c) => ({ time: c.time, value: c.value }));

  const addedSeries = [];
  const panes = [];
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
      ].concat(panes);
    },
    addSeries(def, opts) {
      const s = makeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", opts, 장부);
      addedSeries.push(s);
      모든시리즈.push(s);
      return s;
    },
    removeSeries(s) {
      s._dead = true; /* 지운 뒤엔 기준선을 못 지웁니다 */
      const i = addedSeries.indexOf(s);
      if (i >= 0) addedSeries.splice(i, 1);
    },
    addPane() {
      const p = {
        setStretchFactor() {},
        paneIndex: () => panes.indexOf(p) + 1,
        getSeries: () => [],
      };
      panes.push(p);
      return p;
    },
    removePane(i) {
      if (i > 0 && panes[i - 1]) panes.splice(i - 1, 1);
    },
  };

  const head = makeEl("head");
  const body = makeEl("body");
  const panel = makeEl("div");
  panel.className = "chart-panel";
  const indBar = makeEl("div");
  indBar.className = "tl-ind-bar";
  panel.appendChild(indBar);
  body.appendChild(panel);

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
    head: head,
    body: body,
    documentElement: makeEl("html"),
    addEventListener() {},
    createElement: makeEl,
    createTextNode: (s) => ({ nodeType: 3, nodeValue: s, parentNode: null }),
    getElementById: (id) => findById(head, id) || findById(body, id),
    querySelector: (sel) => body.querySelectorAll(sel)[0] || null,
    querySelectorAll: (sel) => body.querySelectorAll(sel),
  };

  const indState = { ma7: false, ma25: false, ma99: false, bb: false, vol: true };
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
      timers.push({ ms: ms, fn: fn, alive: true });
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
    Config: { getActiveSymbol: () => "BTCUSDT" },
    ChartIndicators: {
      isOn: (k) => !!indState[k],
      toggle(k) {
        indState[k] = !indState[k];
        return indState[k];
      },
      MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: KIT_FILE });

  const tick = () => timers.slice().forEach((t) => t.alive && t.fn());
  tick();
  tick();

  return {
    K: sandbox.App.ChartIndicatorKit,
    sandbox,
    chart,
    candleSeries,
    volumeSeries,
    addedSeries,
    모든시리즈,
    장부,
    warns,
    stored,
    timers,
    indBar,
    tick,
    /** 지금 어느 시리즈에든 ★남아 있는★ 기준선 개수 (지워진 시리즈까지 셉니다) */
    남은기준선() {
      let n = 0;
      모든시리즈.forEach((s) => (n += s._lines.length));
      return n;
    },
    /** 실시간 봉 하나를 흘려보냅니다 */
    틱(candle) {
      sandbox.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: candle });
    },
    /** 인스턴스가 실제로 그린 점들 - { 출력키: [{time,value}] } */
    그린값(id) {
      const it = (this.K.getInstancesForTest() || {})[id];
      if (!it || !it.live || !it.live.series) return null;
      const out = {};
      Object.keys(it.live.series).forEach((k) => {
        out[k] = it.live.series[k].data().slice();
      });
      return out;
    },
  };
}

module.exports = { boot, makeCandles, makeEl, KIT_FILE, REPO };
