/* tests/chart-indicator-kit-seal.test.js
 * =========================================================================
 * 지표 틀(js/chart-indicator-kit.js) 봉인 — "정의 1개 + 인스턴스 N개"
 * =========================================================================
 * 2026-09-02 에 1,255줄짜리 틀이 d49bd27 로 배포됐는데 ★테스트가 0건★ 이었습니다.
 * 이 파일은 그 틀이 조용히 되돌아가는 것을 막습니다.
 *
 * ── 무엇을 못 박는가 ────────────────────────────────────────────────────
 *   ① step 강제      step 이 없으면 "틱마다 전체 재계산" 하는 지표가 몰래 들어옵니다.
 *                    그게 이 틀의 성능 근거 전부입니다 (켜기 6.51ms → 2.14ms · 차트팀 실측).
 *   ② 색 목록 밖 거부  초록(색상 100~185도) · 빨강(330~18도) 구간이 ★일부러★ 빠져
 *                    있습니다. 회원이 손익 색으로 읽기 때문입니다. 그 구간이 다시
 *                    열리면 여기서 터집니다.
 *   ③ 색이 한 곳에만  "같은 값 두 곳" 으로 오늘까지 다섯 번 당했습니다.
 *                    앞 세 색(#F0B429 · #E7ECF5 · #838DA4)은 지금 MA 색이라 못 바꿉니다.
 *   ④ 기존 7개 보호   틀이 App.ChartIndicators.isOn/toggle 을 ★감쌉니다★.
 *                    감싼 뒤에도 ma7 · ma25 · ma99 · bb · vol 이 원래 모듈로
 *                    그대로 넘어가야 합니다. 대표가 매일 쓰시는 것입니다.
 *   ⑤ 봉 창고 한 벌 · 감시 타이머 하나
 *   ⑥ 저장 키가 기존 것과 다름 — 같으면 대표가 켜두신 지표가 날아갑니다
 *   ⑦ EMA 값 — ★숫자를 박지 않고 매번 다시 계산해서★ 대조합니다
 *
 * ── ⚠️ 소스 문자열에 기대지 않습니다 ────────────────────────────────────
 * 차트팀이 지금 설정판을 만드느라 이 파일을 만지고 있습니다(2026-09-02 기준
 * 작업트리에 364줄 미커밋). 그래서 검사는 ★공개 API★ 로만 합니다.
 * 예외는 절 1 의 마지막(색 목록이 두 벌인지)뿐입니다 — 그건 "다른 파일" 을
 * 보는 검사라 소스를 읽을 수밖에 없습니다.
 *
 * ── 쓰는 API 는 d49bd27 에 이미 있던 것만 ──────────────────────────────
 *   define · addInstance · removeInstance · listDefs · listInstances
 *   LINE_COLORS · toggle · setOn · isOn · getPerf · resetPerf
 *   getBarsForTest · getInstancesForTest · getDefsForTest · onTickForTest
 * 차트팀이 6단계에서 더한 것(createInstance · updateInstance · SOURCES · inputsOf)은
 * ★일부러 안 씁니다.★ 그래야 그 작업이 되돌려져도 이 봉인이 안 깨집니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.join(__dirname, "..");

/* ⚠️ 돌연변이 검증(일부러 틀리게 해서 이 봉인이 터지는지 보는 것)을 할 때만
   ★이 파일의 사본★ 에서 아래 한 줄을 사본 경로로 바꿔 씁니다.
   원본 js/chart-indicator-kit.js 는 절대 건드리지 않습니다 —
   차트팀이 같은 파일을 동시에 만지고 있기 때문입니다. */
const KIT_FILE = "js/chart-indicator-kit.js";

const SRC = fs.readFileSync(path.join(REPO, KIT_FILE), "utf8");

/* ─────────────────────────────────────────────────────────────────────────
 * ⭐ 기본 인스턴스 개수 — ★여기 한 곳에만★ 적습니다 (2026-09-02 기록팀)
 *
 * "처음 오는 회원에게 기본 인스턴스가 몇 개인가" 를 이 파일이 ★네 군데★ 에서
 * 따로 못 박고 있었습니다. 2026-08-31 에 수정 금지 파일 md5 가 48곳에 흩어져
 * 있다가 tests/_locked-hashes.js 한 곳으로 모인 것과 같은 냄새입니다.
 *   · 처음 오는 회원에게 기본 인스턴스가 둘 있다
 *   · 판번호가 다르면 저장값을 안 쓰고 기본으로 시작한다
 *   · 거부해도 목록이 안 늘어난다
 *   · 목록 창이 열리면 우리 줄이 붙는다        (줄 수 = 인스턴스 수)
 * 2026-09-02 실측 — DEFAULT_INSTANCES 를 2 → 3 으로 늘려 보니 이 네 군데가
 * 한꺼번에 빨개졌고, 그래서 팀들이 기본 인스턴스를 못 늘렸습니다.
 *
 * ── ⚠️ 그래도 이 봉인은 ★그대로 둡니다★ ────────────────────────────────
 *   기본으로 켜진 지표를 늘리면 처음 오는 회원의 차트가 갑자기 어지러워집니다.
 *   대표가 매일 보시는 화면이라, "늘려도 되는가" 는 PM 이 정할 일이지
 *   팀이 조용히 바꿀 일이 아닙니다. ★막는 것이 이 봉인의 목적입니다.★
 *   지금 둘 다 꺼져 있다는 것(on:false)도 아래에서 같이 봅니다.
 *
 * ── 늘리기로 정해지면 ───────────────────────────────────────────────────
 *   ★이 숫자 하나만★ 고치면 됩니다. 네 군데를 찾아다니지 않습니다.
 *   그리고 왜 늘렸는지를 이 주석에 날짜와 함께 적으세요.
 * ───────────────────────────────────────────────────────────────────── */
const 기본인스턴스수 = 2;

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

console.log("\n지표 틀 봉인 (정의 1개 + 인스턴스 N개)");

/* =======================================================================
 * 가짜 DOM — 브라우저 없이 틀을 그대로 돌립니다.
 * ⚠️ 기록팀은 브라우저를 쓰지 않습니다 (대표 컴퓨터가 느립니다).
 * ===================================================================== */
/* ── 가짜 MutationObserver 와 "같은 값을 다시 썼나" 세기 ────────────────
 * 2026-09-02 차트팀 발견 — paintMenu()/paintButtons() 가 ★값이 같아도★
 * setAttribute 를 다시 쓰고 있었습니다. 브라우저는 값이 같아도 변경 기록을
 * 남기기 때문에(DOM 표준의 "change an attribute"), 그 속성을 보는 감시가
 * 다시 불려 감시 → 그리기 → setAttribute → 감시 ... 로 ★끝없이 돌았습니다.★
 * 증상은 fx 목록을 열면 페이지 전체가 멈춤. ★콘솔 오류는 0건★ 입니다.
 * 그래서 여기 가짜 감시도 ★값이 같아도 알림을 냅니다★ — 진짜와 같게.
 * (진짜는 마이크로태스크로 모아 부르므로, 여기서도 재귀 말고 줄을 세워 돕니다)
 */
let 감시허브 = null;
let 같은값쓰기 = {};

function makeHub() {
  const 관찰 = [];
  const 대기 = [];
  const 상태 = { 알림수: 0, 넘침: false, 한계: 3000, 도는중: false };
  function 자손인가(뿌리, el) {
    let n = el;
    while (n) {
      if (n === 뿌리) return true;
      n = n.parentNode;
    }
    return false;
  }
  function 알림(el, 종류, 속성) {
    if (상태.넘침) return;
    대기.push([el, 종류, 속성]);
    if (상태.도는중) return;
    상태.도는중 = true;
    while (대기.length) {
      const one = 대기.shift();
      for (let i = 0; i < 관찰.length; i++) {
        const o = 관찰[i];
        if (!o.연결) continue;
        const 범위 = o.target === one[0] || (o.opts.subtree && 자손인가(o.target, one[0]));
        if (!범위) continue;
        if (one[1] === "attr") {
          if (!o.opts.attributes) continue;
          if (o.opts.attributeFilter && o.opts.attributeFilter.indexOf(one[2]) < 0) continue;
        }
        if (one[1] === "child" && !o.opts.childList) continue;
        if (one[1] === "text" && !o.opts.characterData) continue;
        상태.알림수++;
        if (상태.알림수 > 상태.한계) { 상태.넘침 = true; 대기.length = 0; break; }
        try { o.cb([]); } catch (e) { /* 감시가 터져도 세는 것은 계속 */ }
      }
      if (상태.넘침) break;
    }
    상태.도는중 = false;
  }
  function MO(cb) {
    const 나 = this;
    나.observe = function (target, opts) {
      나._rec = { cb: cb, target: target, opts: opts || {}, 연결: true };
      관찰.push(나._rec);
    };
    나.disconnect = function () { if (나._rec) 나._rec.연결 = false; };
    나.takeRecords = function () { return []; };
  }
  return { MO: MO, 상태: 상태, 알림: 알림, 관찰: 관찰 };
}

function textNode(s) {
  return { nodeType: 3, nodeValue: s, parentNode: null };
}

function matchOne(el, compound) {
  /* 클래스 하나 + 속성 하나까지만 씁니다. 틀이 쓰는 선택자가 그 형태뿐입니다. */
  const m = /^\.([A-Za-z0-9_-]+)(?:\[([A-Za-z0-9_-]+)="([^"]*)"\])?$/.exec(compound);
  if (!m) return false;
  const cls = m[1];
  if ((" " + (el.className || "") + " ").indexOf(" " + cls + " ") < 0) return false;
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
      const 새값 = String(v);
      const 옛값 = Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
      /* ⭐ 값이 같은데 또 쓰는 것 — 그것이 무한 고리의 씨앗입니다. 따로 셉니다. */
      if (옛값 === 새값) 같은값쓰기[k] = (같은값쓰기[k] || 0) + 1;
      this.attrs[k] = 새값;
      if (감시허브) 감시허브.알림(this, "attr", k);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(c) {
      c.parentNode = this;
      this.childNodes.push(c);
      if (감시허브) 감시허브.알림(this, "child", null);
      return c;
    },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.childNodes.indexOf(ref);
      if (i < 0) this.childNodes.push(c);
      else this.childNodes.splice(i, 0, c);
      if (감시허브) 감시허브.알림(this, "child", null);
      return c;
    },
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null;
      if (감시허브) 감시허브.알림(this, "child", null);
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
  let _글자 = "";
  Object.defineProperty(el, "textContent", {
    get() {
      return _글자;
    },
    set(v) {
      _글자 = String(v);
      if (감시허브) 감시허브.알림(el, "text", null);
    },
  });
  Object.defineProperty(el, "lastChild", {
    get() {
      return this.childNodes[this.childNodes.length - 1] || null;
    },
  });
  return el;
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

/**
 * 틀을 한 번 태웁니다.
 *   candles   캔들 배열 ({time,open,high,low,close})
 *   saved     저장돼 있던 상태 (없으면 처음 오는 회원)
 */
function boot(candles, saved, opts) {
  opts = opts || {};
  const timers = []; /* {ms, fn, alive} */
  감시허브 = null;
  같은값쓰기 = {};
  const warns = [];
  const stored = {};
  const storeWrites = [];
  if (saved) stored["chart-indicator-kit"] = saved;

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
    addSeries(def, opts) {
      const s = makeFakeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", opts);
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
  panel.appendChild(indBar);
  body.appendChild(panel);

  /* opts.목록 — js/chart-indicator-menu.js 가 만드는 fx 목록 창을 흉내냅니다.
     .chart-panel 의 바로 밑 자식으로 붙습니다(저쪽 build() 와 같은 자리). */
  let 목록창 = null;
  if (opts.목록) {
    목록창 = makeEl("div");
    목록창.id = "tl-fx-menu";
    const list = makeEl("div");
    list.className = "tl-fx-list";
    const foot = makeEl("div");
    foot.className = "tl-fx-foot";
    목록창.appendChild(list);
    목록창.appendChild(foot);
  }

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

  /* 기존 5개(ma7/ma25/ma99/bb/vol) — 틀이 이 모듈의 isOn/toggle 을 감쌉니다.
     감싼 뒤에도 원래 모듈로 그대로 넘어가는지 세어 봅니다. */
  const indState = { ma7: false, ma25: false, ma99: false, bb: false, vol: true };
  const indCalls = { isOn: [], toggle: [] };
  const ChartIndicators = {
    isOn(key) {
      indCalls.isOn.push(key);
      return !!indState[key];
    },
    toggle(key) {
      indCalls.toggle.push(key);
      indState[key] = !indState[key];
      return indState[key];
    },
    MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 },
  };

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
        storeWrites.push(k);
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
    },
    ChartIndicators: ChartIndicators,
  };

  const hub = opts.목록 ? makeHub() : null;
  if (hub) sandbox.MutationObserver = hub.MO;

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: KIT_FILE });

  /* 창이 뜬 ★뒤에★ 목록을 붙입니다 — 회원이 fx 를 누른 순간과 같은 순서입니다.
     ⭐ 여기서부터 감시가 살아 있어야 무한 고리를 재현할 수 있습니다. */
  if (hub) {
    감시허브 = hub;
    if (목록창) panel.appendChild(목록창);
  }

  /* init() 안의 준비 타이머(50ms)를 몇 번 돌려 줍니다 */
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
    timers,
    warns,
    stored,
    storeWrites,
    indState,
    indCalls,
    tick,
    indBar,
    허브: hub,
    목록창: 목록창,
    panel: panel,
    같은값쓰기: () => 같은값쓰기,
    aliveTimers(ms) {
      return timers.filter((t) => t.alive && (ms === undefined || t.ms === ms)).length;
    },
  };
}

function makeCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 77000 + Math.sin(i / 9) * 120 + (i % 7) * 13;
    out.push({ time: 1700000000 + i * 60, open: c - 5, high: c + 9, low: c - 11, close: c });
  }
  return out;
}

/* 색 도우미 — 색상(hue) 과 명암비를 직접 계산합니다 */
function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function hueOf(hex) {
  const p = rgb(hex).map((v) => v / 255);
  const r = p[0];
  const g = p[1];
  const b = p[2];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
function lum(hex) {
  const c = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a, b) {
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const 상승색 = "#26C281";
const 하락색 = "#F0506E";
const 배경색 = "#0A0F1C";

/* =======================================================================
 * 1. 지표선 색 목록 — 한 곳에만, 값도 고정
 * ===================================================================== */
console.log("\n[1] 지표선 색 목록 (LINE_COLORS)");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const list = K && K.LINE_COLORS;
  const hexes = (list || []).map((c) => c.hex);

  ok("틀이 지표선 색 목록을 공개한다", Array.isArray(list) && list.length > 0);
  /* ⚠️ 2026-09-02 에 12 -> 20 으로 늘렸습니다. 대표 승인 건입니다
     (CLAUDE.md "예외 — 차트 지표 색은 늘려도 됩니다"). 개수를 여기 박아 두는
     이유는 "몇 개인지" 가 중요해서가 아니라 ★말없이 줄거나 느는 것★ 을 잡으려는
     것입니다. 늘릴 때는 아래 거리 검사를 같이 통과해야 합니다. */
  ok("색이 20개다", hexes.length === 20, "지금 " + hexes.length + "개");
  ok(
    "전부 #RRGGBB 형식이다",
    hexes.every((h) => /^#[0-9A-F]{6}$/.test(h)),
    hexes.filter((h) => !/^#[0-9A-F]{6}$/.test(h)).join(",")
  );
  ok("같은 색이 두 번 들어 있지 않다", new Set(hexes).size === hexes.length);

  /* 대표가 매일 보시던 MA 색입니다. 순서까지 그대로여야 합니다 —
     suggestColor() 가 앞에서부터 고르기 때문에 순서가 바뀌면 기본색이 바뀝니다. */
  ok("첫 색이 지금 MA(7) 색 #F0B429 그대로다", hexes[0] === "#F0B429", hexes[0]);
  ok("둘째 색이 지금 MA(25) 색 #E7ECF5 그대로다", hexes[1] === "#E7ECF5", hexes[1]);
  ok("셋째 색이 지금 MA(99) 색 #838DA4 그대로다", hexes[2] === "#838DA4", hexes[2]);

  ok("상승색 #26C281 은 지표선 색이 아니다", hexes.indexOf(상승색) < 0);
  ok("하락색 #F0506E 는 지표선 색이 아니다", hexes.indexOf(하락색) < 0);

  /* ⚠️ 초록·빨강 구간은 ★일부러★ 비워 둔 것입니다. 거리 숫자만 보면 통과하지만
     회원이 손익 색으로 읽습니다. 구간이 다시 열리면 여기서 터집니다. */
  const 초록 = hexes.filter((h) => {
    const u = hueOf(h);
    return u >= 100 && u <= 185;
  });
  ok("초록 구간(색상 100~185도) 색이 하나도 없다", 초록.length === 0, 초록.join(","));

  const 빨강 = hexes.filter((h) => {
    const u = hueOf(h);
    return u >= 330 || u <= 18;
  });
  ok("빨강 구간(색상 330~18도) 색이 하나도 없다", 빨강.length === 0, 빨강.join(","));

  const 어두운 = hexes.filter((h) => contrast(h, 배경색) < 4.5);
  ok(
    "배경 #0A0F1C 위에서 전부 명암비 4.5 이상이다",
    어두운.length === 0,
    어두운.map((h) => h + "=" + contrast(h, 배경색).toFixed(2)).join(",")
  );


  /* ── ⭐ 색끼리 얼마나 떨어져 있나 — ★눈대중이 아니라 재서★ ───────────────
     2026-09-02 PM 지적 — "구분된다를 눈대중으로 말하지 마라. 색 간 거리를
     실제로 재서 가장 가까운 두 색의 값을 숫자로 보고하라."
     12색 시절에는 이 계산이 아예 없었습니다. 이제 매번 다시 잽니다.

     ⚠️ 자를 두 개 씁니다. ΔE76(Lab 직선거리)만 보면 틀립니다 —
        #BA6EED / #E637E6 은 ΔE76 30.76 으로 멀어 보이는데 ΔE2000 은 9.71 로
        20색 중 ★제일 가깝습니다.★ 사람 눈에 가까운 자는 ΔE2000 입니다. */
  function lab(hex) {
    const c = rgb(hex).map((v) => {
      const s = v / 255;
      return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    });
    const X = c[0] * 0.4124564 + c[1] * 0.3575761 + c[2] * 0.1804375;
    const Y = c[0] * 0.2126729 + c[1] * 0.7151522 + c[2] * 0.072175;
    const Z = c[0] * 0.0193339 + c[1] * 0.119192 + c[2] * 0.9503041;
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(X / 0.95047);
    const fy = f(Y / 1);
    const fz = f(Z / 1.08883);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }
  function de76(a, b) {
    const A = lab(a);
    const B2 = lab(b);
    return Math.hypot(A[0] - B2[0], A[1] - B2[1], A[2] - B2[2]);
  }
  function de2000(h1, h2) {
    const [L1, a1, b1] = lab(h1);
    const [L2, a2, b2] = lab(h2);
    const rad = (x) => (x * Math.PI) / 180;
    const deg = (x) => (x * 180) / Math.PI;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    let h1p = deg(Math.atan2(b1, a1p));
    if (h1p < 0) h1p += 360;
    let h2p = deg(Math.atan2(b2, a2p));
    if (h2p < 0) h2p += 360;
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp) / 2);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else hbp = (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2;
    const T =
      1 -
      0.17 * Math.cos(rad(hbp - 30)) +
      0.24 * Math.cos(rad(2 * hbp)) +
      0.32 * Math.cos(rad(3 * hbp + 6)) -
      0.2 * Math.cos(rad(4 * hbp - 63));
    const dTh = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const Sc = 1 + 0.045 * Cbp;
    const Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin(rad(2 * dTh)) * Rc;
    return Math.sqrt(
      Math.pow(dLp / Sl, 2) +
        Math.pow(dCp / Sc, 2) +
        Math.pow(dHp / Sh, 2) +
        Rt * (dCp / Sc) * (dHp / Sh)
    );
  }

  let 최소76 = { d: Infinity, 쌍: "" };
  let 최소00 = { d: Infinity, 쌍: "" };
  for (let i = 0; i < hexes.length; i++) {
    for (let j = i + 1; j < hexes.length; j++) {
      const d1 = de76(hexes[i], hexes[j]);
      const d2 = de2000(hexes[i], hexes[j]);
      if (d1 < 최소76.d) 최소76 = { d: d1, 쌍: hexes[i] + "/" + hexes[j] };
      if (d2 < 최소00.d) 최소00 = { d: d2, 쌍: hexes[i] + "/" + hexes[j] };
    }
  }
  console.log(
    "      가장 가까운 쌍 — ΔE76 " +
      최소76.d.toFixed(2) +
      " (" +
      최소76.쌍 +
      ") · ΔE2000 " +
      최소00.d.toFixed(2) +
      " (" +
      최소00.쌍 +
      ")"
  );
  ok("모든 색끼리 ΔE76 22 이상 떨어져 있다", 최소76.d >= 22, 최소76.d.toFixed(2) + " " + 최소76.쌍);
  /* ⚠️ 9.7 은 "지금이 딱 이만큼" 이라는 뜻입니다. 여유가 없습니다.
     새 색을 또 넣을 때 이 줄이 빨개지면 ★그 색이 문제★ 입니다. */
  ok("모든 색끼리 ΔE2000 9.7 이상 떨어져 있다", 최소00.d >= 9.7, 최소00.d.toFixed(2) + " " + 최소00.쌍);

  const 상승가까움 = hexes.filter((h) => de76(h, 상승색) < 46);
  const 하락가까움 = hexes.filter((h) => de76(h, 하락색) < 46);
  ok(
    "상승색과 ΔE76 46 이상 떨어져 있다",
    상승가까움.length === 0,
    상승가까움.map((h) => h + "=" + de76(h, 상승색).toFixed(1)).join(",")
  );
  ok(
    "하락색과 ΔE76 46 이상 떨어져 있다",
    하락가까움.length === 0,
    하락가까움.map((h) => h + "=" + de76(h, 하락색).toFixed(1)).join(",")
  );

  /* ── 같은 값 두 벌 금지 ──────────────────────────────────────────────
     ⚠️ git 이 ★추적하는★ js 만 봅니다. 실제로 배포되는 것이 그것뿐이고,
        팀이 잠깐 만들어 둔 사본(untracked)까지 잡으면 남의 작업을 막습니다.
        ★사본이 커밋되는 순간★ 여기가 빨강이 됩니다 — 그게 우리가 막으려는 것입니다. */
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z", "js"], { cwd: REPO })
      .toString()
      .split(String.fromCharCode(0))
      .filter((f) => f && /\.js$/.test(f));
  } catch (e) {
    tracked = [];
  }
  ok("git 이 추적하는 js 목록을 읽었다", tracked.length > 0, "git ls-files 실패");
  const 두벌 = tracked.filter((f) => {
    if (f === KIT_FILE) return false;
    let t = "";
    try {
      t = fs.readFileSync(path.join(REPO, f), "utf8");
    } catch (e) {
      return false;
    }
    return hexes.filter((h) => t.indexOf(h) >= 0).length >= 6;
  });
  ok("지표선 색 목록이 다른 파일에 두 벌로 있지 않다", 두벌.length === 0, 두벌.join(","));
}

/* =======================================================================
 * 2. define() 이 거부하는 것 — ★틀의 존재 이유★
 * ===================================================================== */
console.log("\n[2] define() 이 거부하는 것");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const warns = B.warns;
  const 좋은색 = K.LINE_COLORS[6].hex; /* #49C9E9 하늘 */

  let seq = 0;
  function 정의(over) {
    return Object.assign(
      {
        id: "seal-t" + ++seq,
        name: "테스트",
        pane: "main",
        params: { p: 5 },
        outputs: [{ key: "v", kind: "line", color: 좋은색, style: "solid" }],
        seed: function () {
          return { v: [] };
        },
        step: function (st) {
          return { values: { v: 1 }, state: st };
        },
      },
      over || {}
    );
  }

  /* ⭐⭐ 이게 이 틀의 성능 근거 전부입니다.
     step 이 없으면 "틱마다 전체 재계산" 하는 지표가 몰래 들어옵니다.
     차트팀 실측 — 켜기 6.51ms → 2.14ms */
  const before = warns.length;
  ok("step 이 없으면 정의를 거부한다", K.define(정의({ step: undefined })) === false);
  ok(
    "거부한 이유를 콘솔에 남긴다",
    warns.length > before && /step/.test(warns[warns.length - 1]),
    warns[warns.length - 1]
  );
  ok("step 이 함수가 아니면(true 라도) 거부한다", K.define(정의({ step: true })) === false);

  ok("seed 가 없으면 거부한다", K.define(정의({ seed: undefined })) === false);
  ok("seed 가 함수가 아니면 거부한다", K.define(정의({ seed: {} })) === false);

  /* ⭐⭐ 색 목록 밖은 거부 */
  ok(
    "색 목록 밖의 색이면 거부한다",
    K.define(정의({ outputs: [{ key: "v", color: "#00FF00" }] })) === false
  );
  ok(
    "상승색(#26C281)으로 지표선을 만들 수 없다",
    K.define(정의({ outputs: [{ key: "v", color: 상승색 }] })) === false
  );
  ok(
    "하락색(#F0506E)으로 지표선을 만들 수 없다",
    K.define(정의({ outputs: [{ key: "v", color: 하락색 }] })) === false
  );
  ok("색이 아예 없으면 거부한다", K.define(정의({ outputs: [{ key: "v" }] })) === false);

  ok("outputs 가 비면 거부한다", K.define(정의({ outputs: [] })) === false);
  ok("pane 이 main/sub 가 아니면 거부한다", K.define(정의({ pane: "middle" })) === false);
  ok("id 가 없으면 거부한다", K.define(정의({ id: "" })) === false);
  ok("name 이 없으면 거부한다", K.define(정의({ name: "" })) === false);
  ok("객체가 아니면 거부한다", K.define(null) === false && K.define("ema") === false);

  /* id 중복 */
  const before2 = K.listDefs().length;
  ok("정상 정의는 등록된다", K.define(정의({ id: "seal-a" })) === true);
  ok("등록되면 목록에 나온다", K.listDefs().some((d) => d.id === "seal-a"));
  ok("id 가 겹치면 거부한다", K.define(정의({ id: "seal-a" })) === false);
  ok(
    "겹친 정의는 목록을 늘리지 않는다",
    K.listDefs().filter((d) => d.id === "seal-a").length === 1
  );
  ok(
    "거부된 정의는 목록에 없다",
    K.listDefs().length === before2 + 1,
    "정의 " + before2 + " → " + K.listDefs().length
  );

  ok("기본으로 EMA 정의가 하나 있다", K.listDefs().some((d) => d.id === "ema"));
}

/* =======================================================================
 * 3. 인스턴스 — "정의 1개 + 인스턴스 N개" 가 진짜인가
 * ===================================================================== */
console.log("\n[3] 인스턴스 (정의 1개 + 인스턴스 N개)");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const warns = B.warns;

  const 목록 = K.listInstances();
  ok(
    "처음 오는 회원에게 기본 인스턴스가 " + 기본인스턴스수 + "개 있다",
    목록.length === 기본인스턴스수,
    "지금 " + 목록.length + "개 (늘리려면 파일 위 기본인스턴스수 한 곳만 고치세요)"
  );
  ok(
    "둘 다 같은 정의(ema)에서 나왔다",
    목록.every((i) => i.def === "ema")
  );
  ok(
    "둘 다 꺼져 있다 (기본은 전부 꺼짐)",
    목록.every((i) => i.on === false)
  );
  ok("이름이 기간까지 달리 나온다", 목록[0].name !== 목록[1].name, 목록.map((i) => i.name).join(" / "));

  const id = K.addInstance("ema", { id: "seal-ema-50", params: { p: 50 } });
  ok("정의 하나로 인스턴스를 더 얹을 수 있다", id === "seal-ema-50", String(id));
  ok(
    "얹은 것이 목록에 나온다",
    K.listInstances().some((i) => i.id === "seal-ema-50")
  );
  ok("같은 id 를 또 얹으면 null 을 돌려준다", K.addInstance("ema", { id: "seal-ema-50" }) === null);
  ok("없는 정의로 얹으려 하면 null 을 돌려준다", K.addInstance("없는지표", {}) === null);

  /* ⭐ 목록 밖 색은 ★조용히 쓰이지 않고★ 기본색으로 되돌아갑니다 */
  const before = warns.length;
  const id2 = K.addInstance("ema", { id: "seal-bad-color", colors: { ema: 상승색 } });
  const it2 = K.listInstances().filter((i) => i.id === "seal-bad-color")[0];
  ok("색 목록 밖 색을 줘도 인스턴스는 만들어진다", id2 === "seal-bad-color");
  ok("그 색은 쓰이지 않고 기본색으로 되돌아간다", !!it2 && it2.colors.ema !== 상승색, it2 && it2.colors.ema);
  ok(
    "그 색이 목록 안의 색이다",
    !!it2 && K.LINE_COLORS.some((c) => c.hex === it2.colors.ema)
  );
  ok("조용히 넘어가지 않고 알린다", warns.length > before);

  ok(
    "지운 인스턴스는 목록에서 사라진다",
    K.removeInstance("seal-ema-50") === true && !K.listInstances().some((i) => i.id === "seal-ema-50")
  );
  ok("없는 인스턴스를 지우면 false", K.removeInstance("없는것") === false);
}

/* =======================================================================
 * 4. 봉 창고는 한 벌 · 감시 타이머는 하나 · 꺼져 있으면 계산도 안 함
 * ===================================================================== */
console.log("\n[4] 봉 창고 한 벌 · 감시 타이머 하나");
{
  const candles = makeCandles(120);
  const B = boot(candles);
  const K = B.K;

  ok(
    "꺼져 있으면 봉을 하나도 안 읽는다",
    K.getBarsForTest().close.length === 0,
    String(K.getBarsForTest().close.length)
  );
  ok("꺼져 있으면 1.5초 감시 타이머도 안 돈다", B.aliveTimers(1500) === 0);

  const last = candles[candles.length - 1];
  K.onTickForTest({ symbol: "BTCUSDT", candle: Object.assign({}, last, { close: last.close + 50 }) });
  ok(
    "꺼져 있으면 시세가 와도 아무 계산도 안 한다",
    K.getPerf().ticks === 0 && K.getBarsForTest().close.length === 0
  );

  K.setOn("ema-9", true);
  const bars1 = K.getBarsForTest();
  ok("켜면 봉을 읽어온다", bars1.close.length === candles.length, String(bars1.close.length));
  ok("켜면 1.5초 감시 타이머가 돈다", B.aliveTimers(1500) === 1, String(B.aliveTimers(1500)));

  K.setOn("ema-21", true);
  const bars2 = K.getBarsForTest();
  ok("인스턴스를 둘 켜도 봉 창고는 한 벌이다", bars2 === bars1 && bars2.close.length === candles.length);
  ok("인스턴스를 둘 켜도 감시 타이머는 하나다", B.aliveTimers(1500) === 1, String(B.aliveTimers(1500)));

  /* 시세 한 번에 봉이 한 칸만 늘어야 합니다 (인스턴스 수만큼 늘면 창고가 두 벌) */
  const before = K.getBarsForTest().close.length;
  const nb = {
    time: last.time + 60,
    open: last.close,
    high: last.close + 20,
    low: last.close - 20,
    close: last.close + 10,
    volume: 1,
  };
  K.onTickForTest({ symbol: "BTCUSDT", candle: nb });
  ok(
    "인스턴스가 둘이어도 새 봉은 한 칸만 늘어난다",
    K.getBarsForTest().close.length === before + 1,
    before + " → " + K.getBarsForTest().close.length
  );

  K.setOn("ema-9", false);
  ok("하나만 끄면 감시 타이머는 그대로 돈다", B.aliveTimers(1500) === 1);
  K.setOn("ema-21", false);
  ok("전부 끄면 감시 타이머가 멈춘다", B.aliveTimers(1500) === 0, String(B.aliveTimers(1500)));
  ok("전부 끄면 봉 창고를 비운다", K.getBarsForTest().close.length === 0, String(K.getBarsForTest().close.length));

  /* 다른 종목의 시세는 무시해야 합니다 */
  K.setOn("ema-9", true);
  const n0 = K.getBarsForTest().close.length;
  K.onTickForTest({
    symbol: "ETHUSDT",
    candle: { time: nb.time + 60, open: 1, high: 1, low: 1, close: 1, volume: 1 },
  });
  ok("보고 있지 않은 종목의 시세는 무시한다", K.getBarsForTest().close.length === n0);
}

/* =======================================================================
 * 5. 저장 키 — ⚠️ 기존 것과 같으면 대표가 켜두신 지표가 날아갑니다
 * ===================================================================== */
console.log("\n[5] 저장 키");
{
  const B = boot(makeCandles(60));
  B.K.setOn("ema-9", true);

  ok("무언가를 저장했다", B.storeWrites.length > 0);
  ok(
    "저장 키가 chart-indicator-kit 이다",
    B.storeWrites.every((k) => k === "chart-indicator-kit"),
    B.storeWrites.join(",")
  );
  /* App.Storage 가 btc_sim_v2_ 를 붙이므로 실제 키는
     btc_sim_v2_chart-indicator-kit — 기존 btc_sim_v2_chart-indicators 와 다릅니다 */
  ok("기존 지표(chart-indicators) 칸에는 절대 안 쓴다", B.storeWrites.indexOf("chart-indicators") < 0);
  ok("기존 보조지표(chart-oscillators) 칸에도 안 쓴다", B.storeWrites.indexOf("chart-oscillators") < 0);
  ok(
    "기존 키를 읽지도 않는다",
    !("chart-indicators" in B.stored) && !("chart-oscillators" in B.stored)
  );

  const saved = B.stored["chart-indicator-kit"];
  ok("저장 형식에 판번호(v)가 있다", !!saved && saved.v === 1, saved && String(saved.v));
  const B2 = boot(makeCandles(60), saved);
  ok("새로고침해도 켠 지표가 그대로다", B2.K.isOn("ema-9") === true);
  ok("안 켠 것은 그대로 꺼져 있다", B2.K.isOn("ema-21") === false);

  /* 저장값이 이상하면 기본값으로 (조용히 깨지지 않게) */
  const B3 = boot(makeCandles(60), {
    v: 99,
    instances: [{ def: "ema", id: "x", params: { p: 3 }, on: true }],
  });
  ok(
    "판번호가 다르면 저장값을 안 쓰고 기본으로 시작한다",
    B3.K.listInstances().length === 기본인스턴스수 && !B3.K.isOn("x")
  );
}

/* =======================================================================
 * 6. 기존 7개가 안 깨졌는지 — ⭐ 대표가 매일 쓰시는 것입니다
 *    틀은 App.ChartIndicators.isOn/toggle 을 ★감쌉니다★.
 * ===================================================================== */
console.log("\n[6] 기존 7개 보호 (감싸기가 원래 것을 가리지 않는가)");
{
  const B = boot(makeCandles(60));
  const IND = B.sandbox.App.ChartIndicators;

  ["ma7", "ma25", "ma99", "bb", "vol"].forEach((key) => {
    const 원래 = key === "vol";
    ok("감싼 뒤에도 " + key + " 의 상태는 원래 모듈이 답한다", IND.isOn(key) === 원래);
  });
  ok(
    "기존 키 물음이 원래 함수까지 그대로 내려간다",
    B.indCalls.isOn.filter((k) => k === "ma7").length === 1
  );

  const before = B.indState.ma7;
  IND.toggle("ma7");
  ok("기존 키를 누르면 원래 모듈이 처리한다", B.indState.ma7 === !before);
  ok("원래 toggle 이 딱 한 번 불린다", B.indCalls.toggle.filter((k) => k === "ma7").length === 1);

  /* 우리 인스턴스는 우리가 답합니다 */
  const c0 = B.indCalls.isOn.length;
  ok("우리 인스턴스는 우리가 답한다", IND.isOn("ema-9") === false);
  ok("우리 인스턴스를 원래 모듈에 물어보지 않는다", B.indCalls.isOn.length === c0);

  const t0 = B.indCalls.toggle.length;
  IND.toggle("ema-9");
  ok("우리 인스턴스를 누르면 우리가 켠다", B.K.isOn("ema-9") === true);
  ok("우리 인스턴스를 원래 모듈에 넘기지 않는다", B.indCalls.toggle.length === t0);

  ok(
    "기존 5개 상태를 우리가 바꾸지 않았다",
    B.indState.ma25 === false &&
      B.indState.ma99 === false &&
      B.indState.bb === false &&
      B.indState.vol === true
  );
  ok(
    "기존 모듈의 MA 기간(7/25/99)을 건드리지 않았다",
    IND.MA_PERIODS.ma7 === 7 && IND.MA_PERIODS.ma25 === 25 && IND.MA_PERIODS.ma99 === 99
  );

  /* 두 번 태워도 두 겹으로 감싸지 않아야 합니다 (감싸기 중복 = 눌러도 안 켜짐) */
  const t1 = B.indCalls.toggle.length;
  B.tick();
  B.tick();
  IND.toggle("ma25");
  ok(
    "여러 번 준비를 돌려도 감싸기가 겹치지 않는다",
    B.indCalls.toggle.length === t1 + 1 && B.indState.ma25 === true
  );

  /* ── ⚠️ 2026-09-02 에 ★기준이 한 번 바뀌었습니다.★ 그대로 남깁니다 ──────
     이 자리에 처음 적은 것은 ★기록★ 이었습니다 —
       "지금은 기존 키(ma7)와 같은 id 를 막지 않는다. 막게 되면 여기가 터집니다"
     addInstance("ema", {id:"ma7"}) 가 그대로 통과했고, 그러면 틀이 감싼
     App.ChartIndicators.isOn/toggle 이 ★대표가 매일 쓰시는 MA7 을 가로챕니다.★

     같은 날 차트팀이 js/chart-indicator-kit.js 에 RESERVED_IDS 를 넣어 막았고,
     ★그 순간 이 검사가 빨강이 되면서 '이제 막았다' 고 알려줬습니다.★
     그래서 기준을 뒤집어 다시 씁니다 — 이제는 ★막혀 있어야★ 통과입니다.
     (막는 방식 자체는 안 봅니다. 이름을 거부하기만 하면 됩니다) */
  const B2 = boot(makeCandles(60));
  ["ma7", "ma25", "ma99", "bb", "vol", "rsi", "macd"].forEach(function (key) {
    ok(
      "기존 지표 이름(" + key + ")을 인스턴스 id 로 못 쓴다 — 쓰면 그 지표를 가로챕니다",
      B2.K.addInstance("ema", { id: key }) === null,
      "id " + key + " 가 통과했습니다 — 감싸기가 기존 " + key + " 을 가로챕니다"
    );
  });
  ok(
    "거부해도 목록이 안 늘어난다 (기본 " + 기본인스턴스수 + "개 그대로)",
    B2.K.listInstances().length === 기본인스턴스수,
    String(B2.K.listInstances().length)
  );
  ok(
    "막힌 뒤에도 우리 인스턴스는 정상으로 얹힌다",
    B2.K.addInstance("ema", { id: "seal-ok-id" }) === "seal-ok-id"
  );
}


/* =======================================================================
 * 7. EMA 값 — ⭐ 숫자를 박지 않고 ★매번 다시 계산해서★ 대조합니다
 * ===================================================================== */
console.log("\n[7] EMA 값 대조 (전체 재계산과 같은가)");
{
  /* 테스트가 직접 계산하는 EMA — 틀 코드를 안 봅니다.
     EMA(t) = 값(t)·k + EMA(t-1)·(1-k),  k = 2/(기간+1)
     첫 값은 앞 기간개의 단순평균 (트레이딩뷰 · 바이낸스와 같음) */
  function emaRef(closes, p) {
    const out = [];
    if (closes.length < p) return out;
    const k = 2 / (p + 1);
    let sum = 0;
    for (let i = 0; i < p; i++) sum += closes[i];
    let e = sum / p;
    out.push({ i: p - 1, v: e });
    for (let i = p; i < closes.length; i++) {
      e = closes[i] * k + e * (1 - k);
      out.push({ i: i, v: e });
    }
    return out;
  }

  const candles = makeCandles(200);
  const closes = candles.map((c) => c.close);
  const B = boot(candles);
  const K = B.K;

  K.setOn("ema-9", true);
  ok("EMA 를 켜면 선이 하나 그려진다", B.addedSeries.length === 1, String(B.addedSeries.length));
  const s9 = B.addedSeries[0];
  const ref9 = emaRef(closes, 9);

  ok("점 개수가 전체 재계산과 같다", s9.data().length === ref9.length, s9.data().length + " vs " + ref9.length);
  ok(
    "점의 시각이 전체 재계산과 같다",
    s9.data().every((p, i) => p.time === candles[ref9[i].i].time)
  );
  const 최대오차9 = s9.data().reduce((m, p, i) => Math.max(m, Math.abs(p.value - ref9[i].v)), 0);
  ok("EMA(9) 값이 전체 재계산과 같다 (오차 0)", 최대오차9 === 0, "최대오차 " + 최대오차9);

  K.setOn("ema-21", true);
  const s21 = B.addedSeries[1];
  const ref21 = emaRef(closes, 21);
  const 최대오차21 = s21.data().reduce((m, p, i) => Math.max(m, Math.abs(p.value - ref21[i].v)), 0);
  ok("EMA(21) 값도 전체 재계산과 같다 (오차 0)", 최대오차21 === 0, "최대오차 " + 최대오차21);

  /* ⚠️ 2026-08-31 에 시세선과 MA7 이 둘 다 금색이라 한 줄로 보였던 일이 있습니다.
     기간이 다르면 값도 달라야 합니다. */
  const 끝9 = s9.data()[s9.data().length - 1].value;
  const 끝21 = s21.data()[s21.data().length - 1].value;
  ok("EMA(9) 와 EMA(21) 은 서로 다른 값이다", Math.abs(끝9 - 끝21) > 0.001, 끝9 + " vs " + 끝21);
  ok(
    "두 선의 색이 서로 다르다",
    K.listInstances()[0].colors.ema !== K.listInstances()[1].colors.ema
  );

  /* ⭐⭐ step 이 진짜 O(1) 로 맞는 값을 내는가 — 진행 중인 봉 */
  const last = candles[candles.length - 1];
  const 바뀐종가 = last.close + 137.5;
  K.onTickForTest({
    symbol: "BTCUSDT",
    candle: {
      time: last.time,
      open: last.open,
      high: last.high + 200,
      low: last.low,
      close: 바뀐종가,
      volume: 3,
    },
  });
  const closesA = closes.slice(0, -1).concat([바뀐종가]);
  const refA = emaRef(closesA, 9);
  const 끝A = s9.data()[s9.data().length - 1].value;
  ok(
    "진행 중인 봉이 갱신되면 step 결과가 전체 재계산과 같다",
    Math.abs(끝A - refA[refA.length - 1].v) < 1e-9,
    끝A + " vs " + refA[refA.length - 1].v
  );

  /* 같은 봉을 여러 번 갱신해도 확정값이 오염되면 안 됩니다
     (EMA 는 한 번 오염되면 계속 끌고 갑니다) */
  for (let r = 0; r < 5; r++) {
    K.onTickForTest({
      symbol: "BTCUSDT",
      candle: {
        time: last.time,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close + 900,
        volume: 3,
      },
    });
  }
  K.onTickForTest({
    symbol: "BTCUSDT",
    candle: {
      time: last.time,
      open: last.open,
      high: last.high,
      low: last.low,
      close: 바뀐종가,
      volume: 3,
    },
  });
  const 끝B = s9.data()[s9.data().length - 1].value;
  ok(
    "같은 봉을 여러 번 갱신해도 확정값이 오염되지 않는다",
    Math.abs(끝B - refA[refA.length - 1].v) < 1e-9,
    끝B + " vs " + refA[refA.length - 1].v
  );

  /* 새 봉이 생겼을 때 */
  const nb = {
    time: last.time + 60,
    open: 바뀐종가,
    high: 바뀐종가 + 30,
    low: 바뀐종가 - 30,
    close: 바뀐종가 + 22,
    volume: 4,
  };
  K.onTickForTest({ symbol: "BTCUSDT", candle: nb });
  const closesC = closesA.concat([nb.close]);
  const refC = emaRef(closesC, 9);
  const 끝C = s9.data()[s9.data().length - 1].value;
  ok(
    "새 봉이 생겨도 step 결과가 전체 재계산과 같다",
    Math.abs(끝C - refC[refC.length - 1].v) < 1e-9,
    끝C + " vs " + refC[refC.length - 1].v
  );
  ok(
    "새 봉 자리에 그린다 (점이 한 개만 늘어난다)",
    s9.data().length === ref9.length + 1,
    ref9.length + " → " + s9.data().length
  );

  /* 끈 인스턴스는 계산도 그리기도 안 합니다 */
  K.setOn("ema-21", false);
  ok("끄면 선이 사라진다", B.addedSeries.indexOf(s21) < 0);
  ok("끈 뒤에도 켜진 선은 그대로다", B.addedSeries.indexOf(s9) >= 0);
}

/* =======================================================================
 * 8. fx 목록 — ⭐⭐ 무한 고리(화면 멈춤) 방지
 *
 * 2026-09-02 차트팀 발견. ★이미 배포된 코드★ 에 들어 있던 것입니다.
 *   paintMenu()/paintButtons() 가 값이 같아도 setAttribute("aria-pressed") 를
 *   다시 썼습니다. 그 속성을 보는 감시가 다시 불려
 *       감시 → 그리기 → setAttribute → 감시 → ...
 *   가 끝없이 돌았습니다. fx 목록을 열면 페이지 전체가 멈춥니다.
 *   ⚠️ ★콘솔 오류가 0건★ 이라 그냥 열어보는 것으로는 원인을 못 찾습니다.
 *      우리가 P1 로 부르는 조용한 고장입니다.
 *
 * ⚠️ 그때 배포본은 목록에 아무것도 안 붙여서 안 터졌습니다.
 *    ★누가 그 줄에 아이콘 하나만 붙여도 그 순간 열리는 고리★ 였습니다.
 *    그래서 "지금 안 멈춘다" 가 아니라 ★몇 번 쓰는지★ 를 셉니다.
 * ===================================================================== */
console.log("\n[8] fx 목록 — 무한 고리 방지 (값이 같으면 안 쓴다)");
{
  const B = boot(makeCandles(60), null, { 목록: true });
  const K = B.K;

  const 줄 = B.목록창.querySelectorAll(".tl-fx-row");
  /* 줄 수 = 인스턴스 수. 기본 인스턴스가 늘면 여기도 같이 늡니다 */
  ok("목록 창이 열리면 우리 줄이 " + 기본인스턴스수 + "줄 붙는다", 줄.length === 기본인스턴스수,
    "지금 " + 줄.length + "줄");
  ok("감시가 실제로 돌고 있다", B.허브.상태.알림수 > 0, String(B.허브.상태.알림수));
  ok("줄을 붙이는 동안 고리가 안 열렸다", !B.허브.상태.넘침,
    "알림 " + B.허브.상태.알림수 + "회 — 감시→그리기→감시 가 끝없이 돌았습니다");

  /* ⭐⭐ 켜고 끄기를 여러 번 해도 알림이 폭주하면 안 됩니다 */
  const 전 = B.허브.상태.알림수;
  for (let r = 0; r < 5; r++) {
    K.setOn("ema-9", true);
    K.setOn("ema-9", false);
  }
  const 늘어난 = B.허브.상태.알림수 - 전;
  ok("켜고 끄기를 10번 해도 감시 알림이 폭주하지 않는다",
    !B.허브.상태.넘침 && 늘어난 < 300,
    "알림이 " + 늘어난 + "회 늘었습니다 (한계 " + B.허브.상태.한계 + ")");

  /* ⭐⭐ 이것이 핵심입니다 — 값이 같은데 또 쓴 적이 한 번도 없어야 합니다 */
  ok("aria-pressed 를 ★값이 같은데 또 쓴 적★ 이 0번이다",
    !B.같은값쓰기()["aria-pressed"],
    "같은 값 다시 쓰기 " + B.같은값쓰기()["aria-pressed"] +
      "회 — 이 줄에 무엇 하나만 더 붙으면 화면이 멈춥니다");

  /* 그리기를 직접 여러 번 불러도 마찬가지 */
  const 전2 = B.허브.상태.알림수;
  for (let r = 0; r < 20; r++) K.rebuildButtonsForTest();
  ok("버튼을 20번 다시 그려도 감시 알림이 하나도 안 는다",
    B.허브.상태.알림수 - 전2 === 0, (B.허브.상태.알림수 - 전2) + "회 늘었습니다");

  /* 감시를 넓게 걸면 시세 글자에 걸려 ★남의 계산까지★ 느려집니다.
     차트팀 실측(1920 · 봉 1001개) —
       통째로 감시  기존 지표 0.278 + 기존 오실 0.167 = 0.445ms/틱
       안 걸었을 때 기존 지표 0.161 + 기존 오실 0.117 = 0.278ms/틱 */
  const 바깥 = B.허브.관찰.filter((o) => o.target === B.panel);
  ok("바깥 감시는 .chart-panel 에 딱 하나만 건다", 바깥.length === 1, String(바깥.length));
  ok("바깥 감시는 subtree 를 안 본다 (시세 글자에 안 걸리게)",
    바깥.length === 1 && !바깥[0].opts.subtree,
    "subtree 로 걸면 남의 계산이 0.278 → 0.445ms/틱 으로 느려집니다");
  ok("바깥 감시는 글자 변화(characterData)를 안 본다",
    바깥.length === 1 && !바깥[0].opts.characterData);

  const 안쪽 = B.허브.관찰.filter((o) => o.target === B.목록창 && o.연결);
  ok("안쪽 감시는 목록 창이 열려 있을 때만 하나 건다", 안쪽.length === 1, String(안쪽.length));

  /* 목록 창이 닫히면 안쪽 감시도 끊겨야 합니다 (안 끊으면 계속 돕니다) */
  B.panel.removeChild(B.목록창);
  const 살아있는안쪽 = B.허브.관찰.filter((o) => o.target === B.목록창 && o.연결);
  ok("목록 창을 닫으면 안쪽 감시가 끊긴다", 살아있는안쪽.length === 0, String(살아있는안쪽.length));
}

/* =======================================================================
 * 9. 기존 지표 이름은 예약어 — 목록이 ★한 곳에만★ · 저장소 경로도 막힘
 *    (2026-09-02 차트팀이 RESERVED_IDS 로 막았습니다)
 * ===================================================================== */
console.log("\n[9] 예약어 목록 · 저장소로 들어오는 경로");
{
  /* ── 한 곳에만 ──────────────────────────────────────────────────────
     ⚠️ 기존 7개 이름이 두 벌이 되면 언젠가 어긋납니다. 한쪽만 늘어나면
        막힌 줄 알았던 이름이 다른 경로로 들어옵니다.
     git 이 ★추적하는★ js 만 봅니다 (실제로 배포되는 것이 그것뿐입니다). */
  const 이름들 = ["ma7", "ma25", "ma99", "bb", "vol", "rsi", "macd"];
  let tracked = [];
  try {
    tracked = execFileSync("git", ["ls-files", "-z", "js"], { cwd: REPO })
      .toString()
      .split(String.fromCharCode(0))
      .filter((f) => f && /\.js$/.test(f));
  } catch (e) {
    tracked = [];
  }
  const 목록가진파일 = [];
  let 총군데 = 0;
  tracked.forEach((f) => {
    let t = "";
    try {
      t = fs.readFileSync(path.join(REPO, f), "utf8");
    } catch (e) {
      return;
    }
    const 배열들 = t.match(/\[[^\]]*\]/g) || [];
    const 걸린 = 배열들.filter((a) =>
      이름들.every((n) => a.indexOf(String.fromCharCode(34) + n + String.fromCharCode(34)) >= 0 ||
        a.indexOf(String.fromCharCode(39) + n + String.fromCharCode(39)) >= 0)
    );
    if (걸린.length) {
      목록가진파일.push(f);
      총군데 += 걸린.length;
    }
  });
  ok("기존 7개 이름 목록이 파일 한 곳에만 있다", 목록가진파일.length === 1, 목록가진파일.join(", "));
  ok("그 한 곳이 지표 틀이다", 목록가진파일[0] === KIT_FILE, 목록가진파일.join(", "));
  ok("그 파일 안에서도 한 군데만 적혀 있다", 총군데 === 1, "지금 " + 총군데 + "군데");

  /* ── ⭐ 저장소로 들어오는 경로도 막혀야 합니다 ──────────────────────
     ⚠️ 저장소는 ★회원 브라우저 안★ 에 있습니다. 개발자도구로 고칠 수 있습니다.
        addInstance 만 막고 저장값 읽는 곳을 안 막으면 그쪽으로 그대로 들어옵니다. */
  const 심은것 = {
    v: 1,
    instances: [
      { def: "ema", id: "ma7", params: { p: 9 }, on: true },
      { def: "ema", id: "rsi", params: { p: 9 }, on: true },
      { def: "ema", id: "ema-9", params: { p: 9 }, on: false },
    ],
  };
  const B = boot(makeCandles(60), 심은것);
  const ids = B.K.listInstances().map((i) => i.id);
  ok("저장소에 ma7 을 손으로 심어도 안 들어온다", ids.indexOf("ma7") < 0, ids.join(","));
  ok("저장소에 rsi 를 손으로 심어도 안 들어온다", ids.indexOf("rsi") < 0, ids.join(","));
  ok("멀쩡한 것은 그대로 들어온다", ids.indexOf("ema-9") >= 0, ids.join(","));
  ok("기존 ma7 스위치는 원래 모듈 것 그대로다",
    B.sandbox.App.ChartIndicators.isOn("ma7") === false && B.indCalls.isOn.indexOf("ma7") >= 0,
    "우리가 가로챘습니다");

  /* ── ⭐ 글자가 아닌 id 도 거부 ─────────────────────────────────────
     차트팀이 ★회원이 id 를 아예 못 정하게★ 했습니다. 회원이 정하는 것은
     기간 · 색 · 굵기 · 선모양뿐입니다. 구멍을 애초에 안 여는 쪽입니다. */
  const B2 = boot(makeCandles(60));
  ok("숫자 id 를 거부한다", B2.K.addInstance("ema", { id: 7 }) === null);
  ok("빈 글자 id 를 거부한다", B2.K.addInstance("ema", { id: "" }) === null);
  ok("객체 id 를 거부한다", B2.K.addInstance("ema", { id: {} }) === null);
  ok("참/거짓 id 를 거부한다", B2.K.addInstance("ema", { id: true }) === null);
  const 지어준 = B2.K.addInstance("ema", {});
  ok("id 를 아예 안 주면 우리가 지어 준다", /^ema-\d+$/.test(String(지어준)), String(지어준));
  ok("지어 준 이름이 예약어와 안 겹친다", 이름들.indexOf(String(지어준)) < 0, String(지어준));
}

/* =======================================================================
 * 10. 거래량을 쓰는 지표 · 점으로 그리는 지표 (2026-09-02 · 9단계)
 *
 * ⚠️ 값을 ★숫자로 박지 않습니다.★ 여기서 트레이딩뷰 식을 다시 한 번 적어
 *    전체를 계산하고, 틀이 화면에 넣은 값과 대조합니다. 틀의 코드는 안 봅니다.
 *      OBV   ta.cum(math.sign(ta.change(close)) * volume)
 *      SAR   Pine 참고서 pine_sar(start, inc, max)
 *      VWAP  누적(hlc3 x 거래량) / 누적(거래량), ★하루(UTC)마다 다시 셈★
 *
 * ⚠️ 거래량은 ★가짜 거래량 시리즈에 직접 넣습니다.★ 틀은 거래량을 캔들이 아니라
 *    별도 시리즈에서 시각으로 맞춰 읽습니다(chart.js 가 그렇게 만들었습니다).
 *    그 길이 끊기면 거래량이 전부 0 이 되고, OBV 는 0 만 그리고 VWAP 은 값이
 *    안 나옵니다. ★오류 0건짜리 조용한 고장★ 이라 아래 마지막 두 검사로 막습니다.
 * ===================================================================== */
console.log("\n[10] 거래량 지표(OBV · VWAP) 와 점 지표(SAR)");
{
  const candles = makeCandles(200);
  /* 봉마다 다른 거래량 - 다 같으면 OBV 가 틀려도 안 걸립니다 */
  const vols = candles.map((c, i) => 3 + ((i * 7) % 11) + (i % 3) * 0.5);

  const B = boot(candles);
  const K = B.K;
  B.volumeSeries._data = candles.map((c, i) => ({ time: c.time, value: vols[i] }));

  /* -- OBV ------------------------------------------------------------ */
  const obvRef = [];
  {
    let acc = 0;
    for (let i = 1; i < candles.length; i++) {
      if (candles[i].close > candles[i - 1].close) acc += vols[i];
      else if (candles[i].close < candles[i - 1].close) acc -= vols[i];
      obvRef.push({ time: candles[i].time, v: acc });
    }
  }
  const obvId = K.addInstance("obv", {});
  ok("OBV 정의가 있다", !!obvId);
  K.setOn(obvId, true);
  const obvS = B.addedSeries[B.addedSeries.length - 1];
  ok("OBV 점 개수가 전체 재계산과 같다", obvS.data().length === obvRef.length,
    obvS.data().length + " vs " + obvRef.length);
  ok("OBV 는 첫 봉을 안 그린다(전 봉과의 차이가 없음)",
    obvS.data()[0].time === candles[1].time);
  const obv오차 = obvS.data().reduce((m, p, i) => Math.max(m, Math.abs(p.value - obvRef[i].v)), 0);
  ok("OBV 값이 전체 재계산과 같다 (오차 0)", obv오차 === 0, "최대오차 " + obv오차);
  ok("OBV 는 아래 칸에 그린다", K.listInstances().filter((i) => i.id === obvId)[0].pane === "sub");

  /* -- VWAP ----------------------------------------------------------- */
  const vwRef = [];
  {
    let pv = 0;
    let vv = 0;
    let day = null;
    for (let i = 0; i < candles.length; i++) {
      const d = Math.floor(candles[i].time / 86400);
      if (d !== day) {
        day = d;
        pv = 0;
        vv = 0;
      }
      const tp = (candles[i].high + candles[i].low + candles[i].close) / 3;
      pv += tp * vols[i];
      vv += vols[i];
      vwRef.push({ time: candles[i].time, v: pv / vv });
    }
  }
  const 날수 = new Set(candles.map((c) => Math.floor(c.time / 86400))).size;
  ok("이 시험 데이터가 하루 경계를 실제로 넘는다", 날수 >= 2, "날 " + 날수 + "개");

  const vwId = K.addInstance("vwap", {});
  K.setOn(vwId, true);
  const vwS = B.addedSeries[B.addedSeries.length - 1];
  ok("VWAP 점 개수가 전체 재계산과 같다", vwS.data().length === vwRef.length,
    vwS.data().length + " vs " + vwRef.length);
  const vw오차 = vwS.data().reduce((m, p, i) => Math.max(m, Math.abs(p.value - vwRef[i].v)), 0);
  ok("VWAP 값이 전체 재계산과 같다 (오차 1e-9 이하)", vw오차 < 1e-9, "최대오차 " + vw오차);
  ok("VWAP 은 주 차트에 그린다", K.listInstances().filter((i) => i.id === vwId)[0].pane === "main");

  /* ⭐ 하루가 바뀌는 자리에서 ★진짜로 다시 세는가★ - 안 그러면 어제 거래가
     오늘 평균에 딸려 옵니다. 경계 봉의 VWAP 은 그 봉의 hlc3 과 같아야 합니다. */
  let 경계 = -1;
  for (let i = 1; i < candles.length; i++) {
    if (Math.floor(candles[i].time / 86400) !== Math.floor(candles[i - 1].time / 86400)) {
      경계 = i;
      break;
    }
  }
  const 경계값 = vwS.data()[경계].value;
  const 경계hlc3 = (candles[경계].high + candles[경계].low + candles[경계].close) / 3;
  ok("하루가 바뀌면 VWAP 이 그 봉의 (고+저+종)/3 에서 다시 시작한다",
    Math.abs(경계값 - 경계hlc3) < 1e-9, 경계값 + " vs " + 경계hlc3);

  /* -- SAR ------------------------------------------------------------ */
  const sarRef = [];
  {
    const start = 0.02;
    const inc = 0.02;
    const mx = 0.2;
    let res = null;
    let mm = null;
    let af = start;
    let below = true;
    for (let i = 0; i < candles.length; i++) {
      let first = false;
      const c = candles[i];
      if (i === 1) {
        if (c.close > candles[0].close) {
          below = true;
          mm = c.high;
          res = candles[0].low;
        } else {
          below = false;
          mm = c.low;
          res = candles[0].high;
        }
        first = true;
        af = start;
      }
      if (i >= 1) {
        res = res + af * (mm - res);
        if (below) {
          if (res > c.low) {
            first = true;
            below = false;
            res = Math.max(c.high, mm);
            mm = c.low;
            af = start;
          }
        } else if (res < c.high) {
          first = true;
          below = true;
          res = Math.min(c.low, mm);
          mm = c.high;
          af = start;
        }
        if (!first) {
          if (below) {
            if (c.high > mm) {
              mm = c.high;
              af = Math.min(af + inc, mx);
            }
          } else if (c.low < mm) {
            mm = c.low;
            af = Math.min(af + inc, mx);
          }
        }
        if (below) {
          res = Math.min(res, candles[i - 1].low);
          if (i > 1) res = Math.min(res, candles[i - 2].low);
        } else {
          res = Math.max(res, candles[i - 1].high);
          if (i > 1) res = Math.max(res, candles[i - 2].high);
        }
        sarRef.push({ time: c.time, v: res });
      }
    }
  }
  const sarId = K.addInstance("sar", {});
  K.setOn(sarId, true);
  const sarS = B.addedSeries[B.addedSeries.length - 1];
  ok("SAR 점 개수가 전체 재계산과 같다", sarS.data().length === sarRef.length,
    sarS.data().length + " vs " + sarRef.length);
  const sar오차 = sarS.data().reduce((m, p, i) => Math.max(m, Math.abs(p.value - sarRef[i].v)), 0);
  ok("SAR 값이 전체 재계산과 같다 (오차 0)", sar오차 === 0, "최대오차 " + sar오차);
  const 뒤집힘 = sarRef.filter((p, i) => i > 0 && (p.v > candles[i + 1].close) !== (sarRef[i - 1].v > candles[i].close)).length;
  ok("시험 데이터에서 SAR 이 실제로 여러 번 뒤집힌다", 뒤집힘 >= 3, "뒤집힘 " + 뒤집힘 + "회");

  /* ⭐⭐ 점으로 그려야 합니다 - 선으로 이으면 뒤집히는 자리마다 캔들을 가로지르는
     사선이 생겨 아예 다른 그림이 됩니다(트레이딩뷰는 X 표로 찍습니다). */
  ok("SAR 은 선을 숨긴다", sarS.options().lineVisible === false, String(sarS.options().lineVisible));
  ok("SAR 은 점을 켠다", sarS.options().pointMarkersVisible === true);
  ok("SAR 점 반지름이 정해져 있다", typeof sarS.options().pointMarkersRadius === "number",
    String(sarS.options().pointMarkersRadius));
  ok("SAR 은 주 차트에 그린다", K.listInstances().filter((i) => i.id === sarId)[0].pane === "main");

  /* ⭐ 진행 중인 봉 - step 이 전체 재계산과 같은 답을 내는가 (세 지표 다) */
  const last = candles[candles.length - 1];
  const 새종가 = last.close + 260;
  const 새거래량 = vols[vols.length - 1] + 4;
  K.onTickForTest({
    symbol: "BTCUSDT",
    candle: { time: last.time, open: last.open, high: last.high + 300, low: last.low, close: 새종가, volume: 새거래량 },
  });
  const 바뀐봉 = candles.slice(0, -1).concat([
    { time: last.time, open: last.open, high: last.high + 300, low: last.low, close: 새종가 },
  ]);
  const 바뀐량 = vols.slice(0, -1).concat([새거래량]);

  let acc2 = 0;
  for (let i = 1; i < 바뀐봉.length; i++) {
    if (바뀐봉[i].close > 바뀐봉[i - 1].close) acc2 += 바뀐량[i];
    else if (바뀐봉[i].close < 바뀐봉[i - 1].close) acc2 -= 바뀐량[i];
  }
  const obv끝 = obvS.data()[obvS.data().length - 1].value;
  ok("OBV - 진행 중인 봉이 갱신되면 전체 재계산과 같다", Math.abs(obv끝 - acc2) < 1e-9,
    obv끝 + " vs " + acc2);

  let pv2 = 0;
  let vv2 = 0;
  let day2 = null;
  for (let i = 0; i < 바뀐봉.length; i++) {
    const d = Math.floor(바뀐봉[i].time / 86400);
    if (d !== day2) {
      day2 = d;
      pv2 = 0;
      vv2 = 0;
    }
    pv2 += ((바뀐봉[i].high + 바뀐봉[i].low + 바뀐봉[i].close) / 3) * 바뀐량[i];
    vv2 += 바뀐량[i];
  }
  const vw끝 = vwS.data()[vwS.data().length - 1].value;
  ok("VWAP - 진행 중인 봉이 갱신되면 전체 재계산과 같다", Math.abs(vw끝 - pv2 / vv2) < 1e-9,
    vw끝 + " vs " + pv2 / vv2);

  /* 같은 봉을 여러 번 갱신해도 답이 안 흔들려야 합니다(확정 상태 오염 검사) */
  for (let r = 0; r < 5; r++) {
    K.onTickForTest({
      symbol: "BTCUSDT",
      candle: { time: last.time, open: last.open, high: last.high + 300, low: last.low, close: 새종가, volume: 새거래량 },
    });
  }
  ok("같은 봉을 여섯 번 갱신해도 OBV 가 그대로다",
    Math.abs(obvS.data()[obvS.data().length - 1].value - acc2) < 1e-9);
  ok("같은 봉을 여섯 번 갱신해도 VWAP 이 그대로다",
    Math.abs(vwS.data()[vwS.data().length - 1].value - pv2 / vv2) < 1e-9);
  ok("같은 봉을 여섯 번 갱신해도 SAR 점 개수가 안 늘어난다",
    sarS.data().length === sarRef.length, String(sarS.data().length));

  /* ⭐⭐ 조용한 고장 막기 - 거래량 길이 끊기면 ★그리지 않고 알린다★ */
  const B3 = boot(makeCandles(200));   /* 가짜 거래량 시리즈가 비어 있는 상태 */
  const 전 = B3.warns.length;
  const obvId3 = B3.K.addInstance("obv", {});
  B3.K.setOn(obvId3, true);
  const 새선 = B3.addedSeries.length;
  ok("거래량이 전부 0 이면 OBV 를 0 짜리 선으로 그리지 않는다",
    새선 === 0 || B3.addedSeries[새선 - 1].data().length === 0,
    "점 " + (새선 ? B3.addedSeries[새선 - 1].data().length : 0) + "개");
  ok("거래량이 전부 0 이면 콘솔에 남긴다",
    B3.warns.length > 전 && /거래량/.test(B3.warns[B3.warns.length - 1]),
    B3.warns[B3.warns.length - 1] || "경고 없음");
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail > 0) process.exit(1);
process.exit(0);
