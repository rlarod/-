/* ===========================================================================
 * tests/chart-position-symbol.test.js
 * 차트 가로선 종목 판정 봉인 — js/chart-position-symbol.js
 *
 * 2026-08-27 추가. 그전까지 tests/ 전체에 chart-position-symbol ·
 * ChartPositionSymbol 참조가 **0건**이었습니다. 그날 만들어 통과시킨 기능인데
 * 아무 테스트도 지키고 있지 않았습니다(감사팀 지적).
 *
 * ── 무엇을 막나 ────────────────────────────────────────────────────────
 * js/chart.js:454(진입가) :464(TP) :474(SL) 는 포지션 스냅샷만 보고 선을
 * 그립니다. 종목을 안 봅니다. js/trading.js 의 position 에는 symbol 칸이
 * 아예 없습니다(거래엔진은 종목을 모릅니다).
 * 그래서 삼성전자(193 USDT) 캔들 위에 비트코인 78,000 짜리 진입가 가로선이
 * 그대로 붙습니다. 회원은 그 숫자를 삼성전자 값으로 읽습니다 — 조용한 고장(P1).
 *
 * ── 본부장 실측 (2026-08-27) — 이 값이 유지되는지 봉인합니다 ──────────
 *     종목 같을 때   hidden 0 / shown 0   ← applyOptions 를 한 번도 안 부름
 *     종목 다를 때   hidden 3
 *     돌아왔을 때    shown  3             ← 살아 돌아옴
 *
 * ── "지우지 않고 숨긴다" 를 같이 못 박습니다 ──────────────────────────
 * removePriceLine 으로 지우면 js/chart.js:449 의
 *     if (pos.openTime === trackedPositionMarker) return;
 * 때문에 **종목이 돌아와도 다시 안 그려집니다.** 같은 포지션이면 "다시 그릴
 * 필요 없음" 으로 건너뛰기 때문입니다. 차트팀이 그래서 숨기기로 갔습니다.
 * 누가 나중에 "지우는 게 깔끔하지" 하고 바꾸면 [4][5] 가 터집니다.
 *
 * ── 진짜 서버에 붙지 않습니다 ──────────────────────────────────────────
 * Lightweight Charts 라이브러리를 가짜로 만들어 vm 안에서 돌립니다.
 * 네트워크·Supabase·바이낸스를 부르지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  o " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  X " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(제목) {
  console.log("\n" + 제목);
}
const read = (p) => fs.readFileSync(p, "utf8");

const SYMBOL_PATH = path.join(REPO, "js", "chart-position-symbol.js");
const LINES_PATH = path.join(REPO, "js", "chart-position-lines.js");
const FONT_PATH = path.join(REPO, "js", "chart-font.js");
const HTML = read(path.join(REPO, "index.html"));
const CHART_JS = read(path.join(REPO, "js", "chart.js"));
const SYMBOL_SRC = fs.existsSync(SYMBOL_PATH) ? read(SYMBOL_PATH) : "";
const LINES_SRC = fs.existsSync(LINES_PATH) ? read(LINES_PATH) : "";
const FONT_SRC = fs.existsSync(FONT_PATH) ? read(FONT_PATH) : "";

/* 주석을 걷어낸 "실제로 도는 코드" 만 남깁니다.
   실측 2026-08-27 — 주석에 "App.SymbolGuard.rememberedSymbol() 을 쓰면
   안 됩니다" 라고 적혀 있어서, 그냥 문자열로 찾으면 쓰지도 않는 것을
   쓴다고 잡습니다(오탐). CLAUDE.md 도 같은 이유로 수정 금지 파일 확인을
   문자열이 아니라 md5 로 하라고 적어 두었습니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const SYMBOL_CODE = 주석제거(SYMBOL_SRC);
const LINES_CODE = 주석제거(LINES_SRC);

/* js/chart.js 가 실제로 쓰는 값 (수정 금지 파일이라 바뀌지 않습니다).
   아래 [8] 에서 원본과 대조해 어긋나면 잡습니다. */
const CHART = {
  entry: "#1D5FD6",
  tp: "#34D399",
  sl: "#FB923C",
};

/* =========================================================================
 * 가짜 Lightweight Charts
 *   createChart -> addSeries -> createPriceLine 까지 흉내 냅니다.
 *   선마다 applyOptions 가 몇 번 불렸는지 세어 둡니다 —
 *   "종목이 같으면 한 번도 안 부른다" 를 재기 위해서입니다.
 * ===================================================================== */
function makeFakeLib() {
  const lib = Object.freeze({
    createChart(container, options) {
      const seriesList = [];
      const chart = {
        __opts: options || {},
        applyOptions() {},
        addSeries(type) {
          const s = {
            __kind: (type && type.__name) || "Candlestick",
            seriesType() {
              return this.__kind;
            },
            lines: [], // 지금 차트에 살아 있는 선
            removed: [], // removePriceLine 으로 지워진 선
            createPriceLine(o) {
              const state = Object.assign({}, o);
              const line = {
                applyCalls: [],
                options() {
                  return Object.assign({}, state);
                },
                applyOptions(p) {
                  line.applyCalls.push(Object.assign({}, p));
                  Object.assign(state, p);
                },
              };
              s.lines.push(line);
              return line;
            },
            removePriceLine(line) {
              s.removed.push(line);
              s.lines = s.lines.filter((l) => l !== line);
            },
          };
          seriesList.push(s);
          return s;
        },
        panes() {
          return [{ getSeries: () => seriesList.slice() }];
        },
        __series: seriesList,
      };
      lib.__charts.push(chart);
      return chart;
    },
    __charts: [],
    CandlestickSeries: { __name: "Candlestick" },
    HistogramSeries: { __name: "Histogram" },
    LineSeries: { __name: "Line" },
    LineStyle: { Solid: 0, Dashed: 2 },
    CrosshairMode: { Normal: 1 },
  });
  return lib;
}

/* 사이트가 부팅될 때 이미 있는 것들만 흉내 냅니다(App.Bus / Config / Trading). */
const PRELUDE = [
  "window.App = window.App || {};",
  "App.Bus = (function () {",
  "  var L = {};",
  "  return {",
  "    on: function (e, f) { (L[e] = L[e] || []).push(f); return f; },",
  "    off: function (e, f) { if (L[e]) L[e] = L[e].filter(function (x) { return x !== f; }); },",
  "    emit: function (e, p) { (L[e] || []).slice().forEach(function (f) { f(p); }); },",
  "    __count: function (e) { return (L[e] || []).length; }",
  "  };",
  "})();",
  "App.Config = { getActiveSymbol: function () { return window.__active; } };",
  "App.Trading = { getSnapshot: function () { return window.__snap; } };",
].join("\n");

function boot(opts) {
  opts = opts || {};
  const lib = makeFakeLib();
  const timers = [];
  const sb = {
    console: { log() {}, warn() {}, error() {} },
    setInterval(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearInterval(id) {
      timers[id - 1] = null;
    },
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout(id) {
      timers[id - 1] = null;
    },
    addEventListener() {},
    removeEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }),
    document: {
      readyState: "complete",
      addEventListener() {},
      documentElement: {},
      head: { appendChild() {} },
      createElement: () => ({ id: "", textContent: "", setAttribute() {} }),
      getElementById(id) {
        /* chart-position-lines 의 wideEnough() 용 — 넓은 화면으로 둡니다 */
        return id === "chart_container" ? { getBoundingClientRect: () => ({ width: 1000 }) } : null;
      },
    },
  };
  sb.window = sb;
  sb.LightweightCharts = opts.noLib ? undefined : lib;
  sb.__active = opts.active || "BTCUSDT";
  sb.__snap = opts.snap || null;
  vm.createContext(sb);
  vm.runInContext(PRELUDE, sb);
  if (opts.noConfig) vm.runInContext("delete App.Config;", sb);
  /* index.html 과 같은 순서로 태웁니다 — chart-font -> chart-position-symbol */
  if (opts.withFont) vm.runInContext(FONT_SRC, sb);
  if (opts.withSymbol !== false) vm.runInContext(SYMBOL_SRC, sb);
  if (opts.withLines) vm.runInContext(LINES_SRC, sb);
  return {
    sb,
    lib,
    App: sb.App,
    tick() {
      timers.slice().forEach((f) => {
        if (f) f();
      });
    },
    emit(ev, p) {
      if (ev === "trading:update" || ev === "trading:persisted") sb.__snap = p;
      sb.App.Bus.emit(ev, p);
    },
    setActive(sym) {
      sb.__active = sym;
      sb.App.Bus.emit("symbol:change", { symbol: sym });
    },
    /* js/chart.js 가 차트를 만드는 것과 같은 순서 */
    makeChart() {
      const chart = sb.LightweightCharts.createChart({}, { layout: {} });
      const candles = chart.addSeries(sb.LightweightCharts.CandlestickSeries, {});
      return { chart, candles };
    },
  };
}

/* js/chart.js:454~479 를 그대로 흉내 냅니다(제목·색까지 같은 값).
   [8] 에서 이 흉내가 원본과 어긋나지 않았는지 원본 파일로 대조합니다. */
function drawLikeChartJs(series, pos) {
  const out = {};
  out.entry = series.createPriceLine({
    price: pos.entry,
    color: CHART.entry,
    lineWidth: 1,
    lineStyle: 2,
    axisLabelVisible: true,
    title: (pos.side === "long" ? "롱" : "숏") + " 진입가",
  });
  if (pos.tp) {
    out.tp = series.createPriceLine({
      price: pos.tp,
      color: CHART.tp,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "TP",
    });
  }
  if (pos.sl) {
    out.sl = series.createPriceLine({
      price: pos.sl,
      color: CHART.sl,
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "SL",
    });
  }
  return out;
}

/* symbol 도장은 js/symbol-guard.js 가 포지션이 생길 때 딱 한 번 찍습니다. */
const POS_BTC = {
  side: "long",
  entry: 78000,
  tp: 80000,
  sl: 76000,
  liq: 71100,
  openTime: 1000,
  symbol: "BTCUSDT",
};

function snapOf(pos, pending) {
  return { position: pos || null, pendingOrder: pending || null };
}
function applyCallCount(lines) {
  return Object.keys(lines).reduce((n, k) => n + lines[k].applyCalls.length, 0);
}

console.log("\n차트 가로선 종목 판정 (js/chart-position-symbol.js)");

/* =========================================================================
 * [1] 파일이 제자리에 있고 싣는 순서가 맞다
 * ===================================================================== */
section("[1] 파일 · 싣는 순서");

ok("js/chart-position-symbol.js 가 있다", fs.existsSync(SYMBOL_PATH));
ok("index.html 이 이 파일을 싣는다", HTML.indexOf('src="js/chart-position-symbol.js"') !== -1);

const idx심볼 = HTML.indexOf('src="js/chart-position-symbol.js"');
const idx차트 = HTML.indexOf('src="js/chart.js"');
ok("index.html 이 js/chart.js 를 싣는다", idx차트 !== -1);
ok(
  "js/chart.js 보다 앞에 실린다",
  idx심볼 !== -1 && idx차트 !== -1 && idx심볼 < idx차트,
  "chart.js 가 차트를 만드는 순간을 가로채야 합니다. 뒤로 밀리면 createChart 를 " +
    "감쌀 기회를 놓쳐 선을 하나도 못 붙잡습니다 (심볼 " +
    idx심볼 +
    " / 차트 " +
    idx차트 +
    ")"
);

const 순서목록 = read(path.join(__dirname, "_order.txt"))
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && l.charAt(0) !== "#");
ok(
  "tests/_order.txt 에 이 테스트가 등록돼 있다",
  순서목록.indexOf("tests/chart-position-symbol.test.js") !== -1,
  "등록 안 하면 npm test 가 이 봉인을 안 돌립니다"
);

/* =========================================================================
 * [2] 자기 저장소를 만들지 않는다 (기준이 두 벌이 되면 안 됩니다)
 *
 * 차트팀이 처음엔 종목을 따로 저장했다가, snapshot 의 도장과 기준이 두 벌이
 * 되는 것을 발견하고 걷어냈습니다. 그 상태를 못 박습니다.
 * ===================================================================== */
section("[2] 기준은 snapshot.position.symbol 하나뿐");

ok(
  "App.Storage 를 쓰지 않는다 (0건)",
  (SYMBOL_CODE.match(/App\.Storage/g) || []).length === 0,
  "따로 저장하면 도장과 저장값이 어긋나 차트와 엔진이 다른 종목을 봅니다"
);
ok("localStorage 를 직접 쓰지 않는다 (0건)", (SYMBOL_CODE.match(/localStorage/g) || []).length === 0);
ok(
  "App.SymbolGuard.rememberedSymbol() 을 쓰지 않는다",
  SYMBOL_CODE.indexOf("rememberedSymbol") === -1,
  '"마지막으로 바꾼 종목" 이라 차트만 옮겨 봐도 따라 바뀝니다 — 포지션의 종목이 아닙니다'
);
ok(
  "포지션 종목은 스냅샷에서 읽는다",
  /snap\.position/.test(SYMBOL_CODE) && /snap\.pendingOrder/.test(SYMBOL_CODE)
);

/* =========================================================================
 * [3] 종목이 같으면 선 옵션을 한 번도 안 건드린다
 *     본부장 실측 — hidden 0 / shown 0
 *     "잘 되는 걸 망가뜨리지 않는다" 는 보장이라 제일 중요합니다.
 * ===================================================================== */
section("[3] 종목이 같을 때 — 화면이 한 픽셀도 안 바뀐다");

{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  ok("모듈이 뜬다", !!CPS);
  ok("라이브러리를 감쌌다(전역이 원본과 다른 객체)", t.sb.LightweightCharts !== t.lib);
  ok(
    "나머지 속성은 원본 그대로 읽힌다",
    t.sb.LightweightCharts.CandlestickSeries === t.lib.CandlestickSeries
  );

  const { candles } = t.makeChart();
  const lines = drawLikeChartJs(candles, POS_BTC);

  ok("chart.js 가 그린 선 3개를 붙잡았다", CPS.getTrackedCount() === 3, String(CPS.getTrackedCount()));

  t.emit("trading:update", snapOf(POS_BTC));
  t.emit("trading:update", snapOf(POS_BTC));

  const s = CPS.getStats();
  ok("hidden 0 (실측값 유지)", s.hidden === 0, JSON.stringify(s));
  ok("shown 0 (실측값 유지)", s.shown === 0, JSON.stringify(s));
  ok(
    "applyOptions 를 한 번도 안 불렀다 = 화면 무변화",
    applyCallCount(lines) === 0,
    "호출 " + applyCallCount(lines) + "회 — 종목이 같은데 선을 건드리면 회귀입니다"
  );
  ok("isHidden() 이 false", CPS.isHidden() === false);
  ok("matches() 가 true", CPS.matches() === true);
  ok(
    "진입가 색이 chart.js 원본 그대로",
    lines.entry.options().color === CHART.entry,
    String(lines.entry.options().color)
  );

  /* 같은 값이 계속 와도 다시 판단하지 않습니다(틱마다 오는 이벤트라 중요) */
  const changed1 = CPS.getStats().changed;
  t.emit("trading:update", snapOf(POS_BTC));
  t.emit("trading:update", snapOf(POS_BTC));
  ok(
    "같은 종목이 계속 와도 다시 계산하지 않는다",
    CPS.getStats().changed === changed1,
    "changed " + CPS.getStats().changed
  );
}

/* =========================================================================
 * [4] 종목이 다르면 숨긴다 — 그러나 지우지는 않는다
 * ===================================================================== */
section("[4] 종목이 다를 때 — 숨긴다 (hidden 3)");

let 되살리기시나리오 = null;
{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  const { candles } = t.makeChart();
  const lines = drawLikeChartJs(candles, POS_BTC);
  t.emit("trading:update", snapOf(POS_BTC));

  /* 비트코인 포지션을 든 채 삼성전자 차트로 넘어간 상황 */
  t.setActive("SAMSUNGUSDT");

  const s = CPS.getStats();
  ok("hidden 3 (실측값 유지)", s.hidden === 3, JSON.stringify(s));
  ok("matches() 가 false", CPS.matches() === false);
  ok("isHidden() 이 true", CPS.isHidden() === true);

  const o = lines.entry.options();
  ok("진입가 선이 안 보인다 (lineVisible:false)", o.lineVisible === false, JSON.stringify(o));
  ok("가격축 라벨도 사라진다 (axisLabelVisible:false)", o.axisLabelVisible === false);
  ok("색이 투명이다", o.color === "rgba(0,0,0,0)", String(o.color));
  ok("TP 도 숨었다", lines.tp.options().lineVisible === false);
  ok("SL 도 숨었다", lines.sl.options().lineVisible === false);

  /* 핵심 — 지우면 안 됩니다 */
  ok(
    "removePriceLine 을 한 번도 안 불렀다",
    candles.removed.length === 0,
    "지우면 chart.js:449 trackedPositionMarker 때문에 돌아와도 다시 안 그려집니다 (지운 수 " +
      candles.removed.length +
      ")"
  );
  ok("선 3개가 차트에 그대로 살아 있다", candles.lines.length === 3, String(candles.lines.length));
  ok("붙잡은 목록도 3개 그대로다", CPS.getTrackedCount() === 3, String(CPS.getTrackedCount()));

  /* 다른 종목을 보는 중에 chart.js 가 새 선을 그리면(포지션 교체) 그리자마자 숨깁니다 */
  const 새선 = candles.createPriceLine({
    price: 79000,
    color: CHART.entry,
    axisLabelVisible: true,
    title: "숏 진입가",
  });
  ok(
    "보는 중에 새로 그려진 선도 즉시 숨는다",
    새선.options().lineVisible === false,
    JSON.stringify(새선.options())
  );
  ok("새 선까지 4개를 붙잡고 있다", CPS.getTrackedCount() === 4, String(CPS.getTrackedCount()));

  되살리기시나리오 = { t, CPS, lines, candles, 숨김직후shown: CPS.getStats().shown };
}

/* =========================================================================
 * [5] 돌아오면 살아난다 — 색·라벨이 처음 값 그대로
 * ===================================================================== */
section("[5] 종목이 돌아왔을 때 — 살아 돌아온다 (shown 3)");

{
  const { t, CPS, lines, candles, 숨김직후shown } = 되살리기시나리오;

  t.setActive("BTCUSDT");

  const s = CPS.getStats();
  ok("shown 이 4 늘었다 (숨어 있던 3 + 그새 생긴 1)", s.shown - 숨김직후shown === 4, JSON.stringify(s));
  ok("isHidden() 이 다시 false", CPS.isHidden() === false);

  const o = lines.entry.options();
  ok("진입가가 다시 보인다", o.lineVisible === true, JSON.stringify(o));
  ok("진입가 색이 처음 색으로 돌아왔다", o.color === CHART.entry, String(o.color));
  ok("가격축 라벨도 돌아왔다", o.axisLabelVisible === true);
  ok("가격 값은 그대로다", o.price === POS_BTC.entry, String(o.price));
  ok("TP 색이 처음 색이다", lines.tp.options().color === CHART.tp, String(lines.tp.options().color));
  ok("SL 색이 처음 색이다", lines.sl.options().color === CHART.sl, String(lines.sl.options().color));
  ok("제목(선 위 글자)이 그대로다", lines.tp.options().title === "TP", String(lines.tp.options().title));
  ok("선을 지운 적이 없다", candles.removed.length === 0, String(candles.removed.length));
}

/* =========================================================================
 * [6] 도장이 없으면 아무것도 안 숨긴다 — "모르면 지금까지 하던 대로"
 * ===================================================================== */
section("[6] 포지션 종목 도장이 없을 때");

{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  const { candles } = t.makeChart();
  const lines = drawLikeChartJs(candles, POS_BTC);

  /* symbol-guard 가 도장을 못 찍은 포지션 */
  const 도장없음 = Object.assign({}, POS_BTC);
  delete 도장없음.symbol;
  t.emit("trading:update", snapOf(도장없음));
  t.setActive("SKHYNIXUSDT");

  ok("getPositionSymbol() 이 null", CPS.getPositionSymbol() === null, String(CPS.getPositionSymbol()));
  ok("판단 근거가 없으면 matches() 가 true", CPS.matches() === true);
  ok("아무것도 숨기지 않는다", CPS.getStats().hidden === 0, JSON.stringify(CPS.getStats()));
  ok("선을 건드리지도 않는다", applyCallCount(lines) === 0, String(applyCallCount(lines)));
}

{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  t.makeChart();
  /* 포지션은 없고 미체결 주문만 있을 때 — 2순위로 pendingOrder.symbol 을 봅니다 */
  t.emit("trading:update", snapOf(null, { id: 7, side: "long", price: 193, symbol: "SAMSUNGUSDT" }));
  ok(
    "포지션이 없으면 미체결 주문의 종목을 본다",
    CPS.getPositionSymbol() === "SAMSUNGUSDT",
    String(CPS.getPositionSymbol())
  );
}

{
  /* 포지션이 아예 없으면(로그인 전 등) 판단할 게 없습니다 */
  const t = boot({ active: "QQQUSDT" });
  const CPS = t.App.ChartPositionSymbol;
  t.makeChart();
  t.emit("trading:update", snapOf(null, null));
  ok("포지션도 주문도 없으면 matches() 가 true", CPS.matches() === true);
  ok("숨긴 것이 없다", CPS.getStats().hidden === 0);
}

/* =========================================================================
 * [7] 붙잡을 선을 가려 잡는다
 * ===================================================================== */
section("[7] 어떤 선을 붙잡나");

{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  const { chart, candles } = t.makeChart();

  /* 현재가 선 — js/chart.js:412, 제목이 빈 글자입니다.
     종목과 무관하게 늘 보여야 합니다(지금 이 차트의 가격이니까). */
  const 현재가 = candles.createPriceLine({
    price: 78100,
    color: "#F0B429",
    axisLabelVisible: true,
    title: "",
  });
  ok("현재가 선(제목이 빈 글자)은 붙잡지 않는다", CPS.getTrackedCount() === 0, String(CPS.getTrackedCount()));

  /* 우리 모듈이 그리는 선(청산가·미체결)도 여기서는 안 붙잡습니다 —
     그쪽은 App.ChartPositionLines 가 스스로 다시 판단합니다([9]). */
  candles.createPriceLine({
    price: 71100,
    color: "#F0506E",
    axisLabelVisible: true,
    title: "청산가 71,100",
  });
  ok("청산가 선은 여기서 붙잡지 않는다", CPS.getTrackedCount() === 0, String(CPS.getTrackedCount()));

  drawLikeChartJs(candles, POS_BTC);
  ok("진입가·TP·SL 만 붙잡는다 (3개)", CPS.getTrackedCount() === 3, String(CPS.getTrackedCount()));

  t.emit("trading:update", snapOf(POS_BTC));
  t.setActive("QQQUSDT");
  ok(
    "현재가 선은 숨기지 않는다",
    현재가.options().lineVisible === undefined || 현재가.options().lineVisible === true,
    JSON.stringify(현재가.options())
  );
  ok("숨긴 것은 3개뿐", CPS.getStats().hidden === 3, JSON.stringify(CPS.getStats()));

  /* 거래량(Histogram) 시리즈는 손대지 않습니다 */
  const vol = chart.addSeries(t.sb.LightweightCharts.HistogramSeries, {});
  vol.createPriceLine({ price: 1, color: "#fff", title: "TP" });
  ok("캔들이 아닌 시리즈는 감싸지 않는다", CPS.getTrackedCount() === 3, String(CPS.getTrackedCount()));
}

{
  /* chart.js 가 선을 지우면(포지션 교체·종료) 우리 목록에서도 빠져야 합니다.
     안 빠지면 죽은 선을 계속 붙들고 앉아 있게 됩니다. */
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  const { candles } = t.makeChart();
  const lines = drawLikeChartJs(candles, POS_BTC);
  candles.removePriceLine(lines.tp);
  ok("chart.js 가 지운 선은 목록에서 빠진다", CPS.getTrackedCount() === 2, String(CPS.getTrackedCount()));
  ok("지우기는 그대로 통과한다", candles.lines.length === 2, String(candles.lines.length));
}

/* =========================================================================
 * [8] js/chart.js 원본과 어긋나지 않는다
 *     (제목 글자가 바뀌면 선을 하나도 못 붙잡게 됩니다)
 * ===================================================================== */
section("[8] chart.js 원본 대조");

ok(
  'chart.js 는 진입가 제목을 롱/숏 + " 진입가" 로 만든다',
  /\(pos\.side === "long" \? "롱" : "숏"\) \+ " 진입가"/.test(CHART_JS)
);
ok('chart.js 가 "TP" 제목을 쓴다', /title:\s*"TP"/.test(CHART_JS));
ok('chart.js 가 "SL" 제목을 쓴다', /title:\s*"SL"/.test(CHART_JS));
ok('붙잡는 제목 목록에 "TP" 가 있다', /TP:\s*1/.test(SYMBOL_CODE));
ok('붙잡는 제목 목록에 "SL" 이 있다', /SL:\s*1/.test(SYMBOL_CODE));
ok(
  '붙잡는 제목 목록에 "롱 진입가"·"숏 진입가" 가 있다',
  SYMBOL_CODE.indexOf('"롱 진입가"') !== -1 && SYMBOL_CODE.indexOf('"숏 진입가"') !== -1
);
ok(
  "chart.js:449 의 조기 반환이 그대로 있다 (지우면 안 되는 이유)",
  /pos\.openTime === trackedPositionMarker\) return;/.test(CHART_JS),
  "이 줄이 사라졌다면 removePriceLine 으로 지워도 다시 그려질 수 있습니다 — " +
    "그때는 이 봉인의 전제를 다시 검토해야 합니다"
);
ok("chart.js 의 진입가 색이 " + CHART.entry + " 그대로다", CHART_JS.indexOf(CHART.entry) !== -1);
ok("chart.js 의 TP 색이 " + CHART.tp + " 그대로다", CHART_JS.indexOf(CHART.tp) !== -1);
ok("chart.js 의 SL 색이 " + CHART.sl + " 그대로다", CHART_JS.indexOf(CHART.sl) !== -1);

/* =========================================================================
 * [9] 관문 — js/chart-position-lines.js 는 판단을 여기서만 읽는다
 * ===================================================================== */
section("[9] 청산가·미체결 선도 같은 판단을 따른다");

ok(
  "chart-position-lines 는 App.ChartPositionSymbol.matches() 를 읽는다",
  LINES_CODE.indexOf("App.ChartPositionSymbol") !== -1 && /matches\(\)/.test(LINES_CODE)
);
ok(
  "chart-position-lines 가 종목을 따로 판단하지 않는다",
  (LINES_CODE.match(/getActiveSymbol/g) || []).length === 0,
  "여기서 또 따지면 기준이 두 벌이 됩니다"
);

{
  const t = boot({ withFont: true, withLines: true });
  const CPS = t.App.ChartPositionSymbol;
  const CPL = t.App.ChartPositionLines;
  ok("chart-position-lines 도 떴다", !!CPL);

  const { candles } = t.makeChart();
  drawLikeChartJs(candles, POS_BTC);
  t.tick(); // 차트를 찾는 대기 타이머 한 번
  t.emit("trading:update", snapOf(POS_BTC));

  const 그려짐 = CPL.getDrawnForTest();
  ok("종목이 같으면 청산가 선을 그린다", 그려짐.liqPrice === POS_BTC.liq, JSON.stringify(그려짐));
  ok("청산가 선 손잡이가 있다", !!CPL.getLinesForTest().liq);

  t.setActive("SAMSUNGUSDT");
  ok(
    "종목이 다르면 청산가 선을 내린다",
    CPL.getDrawnForTest().liqPrice === null,
    JSON.stringify(CPL.getDrawnForTest())
  );
  ok("청산가 선 손잡이가 비었다", CPL.getLinesForTest().liq === null);
  ok("진입가·TP·SL 은 숨김 처리라 차트에 남아 있다", candles.lines.length >= 3 && CPS.isHidden() === true);

  t.setActive("BTCUSDT");
  ok(
    "돌아오면 청산가 선이 다시 그려진다",
    CPL.getDrawnForTest().liqPrice === POS_BTC.liq,
    JSON.stringify(CPL.getDrawnForTest())
  );
}

{
  /* 판단 모듈을 빼면(스크립트 한 줄 삭제 = 되돌리기) 지금까지처럼 그대로 그립니다 */
  const t = boot({ withSymbol: false, withFont: true, withLines: true, active: "SAMSUNGUSDT" });
  const CPL = t.App.ChartPositionLines;
  t.makeChart();
  t.tick();
  t.emit("trading:update", snapOf(POS_BTC));
  ok(
    "판단 모듈이 없으면 예전 동작 그대로다 (되돌리기가 통한다)",
    CPL.getDrawnForTest().liqPrice === POS_BTC.liq,
    JSON.stringify(CPL.getDrawnForTest())
  );
}

/* =========================================================================
 * [10] 검산용 손잡이 — 있고, 실제로 쓸 수 있다
 *      (감사팀 지적 2026-08-27: 만들어 놓고 파일 밖 참조가 0건이었습니다.
 *       이 절이 그 다섯 개를 실제로 씁니다)
 * ===================================================================== */
section("[10] 검산용 손잡이");

{
  const t = boot();
  const CPS = t.App.ChartPositionSymbol;
  const { candles } = t.makeChart();
  drawLikeChartJs(candles, POS_BTC);

  [
    "init",
    "matches",
    "refresh",
    "getPositionSymbol",
    "getTrackedCount",
    "isHidden",
    "getStats",
    "getTrackedForTest",
    "_setPositionSymbolForTest",
  ].forEach((k) => {
    ok(k + "() 가 있다", typeof CPS[k] === "function");
  });

  const 표 = CPS.getTrackedForTest();
  ok(
    "getTrackedForTest() 가 붙잡은 선을 그대로 보여준다",
    표.length === 3 && 표[0].title === "롱 진입가",
    JSON.stringify(표[0])
  );
  ok("처음에는 아무것도 안 숨겨져 있다", 표.length === 3 && 표.every((r) => r.hidden === false));

  /* 손으로 종목을 넣어 봅니다 — 포지션을 든 채 다른 차트를 보는 날의 예행연습 */
  CPS._setPositionSymbolForTest("SKHYNIXUSDT");
  const 표2 = CPS.getTrackedForTest();
  ok(
    "_setPositionSymbolForTest 로 다른 종목을 넣으면 전부 숨는다",
    표2.length === 3 && 표2.every((r) => r.hidden === true),
    JSON.stringify(표2)
  );
  ok("숨은 선은 색이 투명이다", 표2.length === 3 && 표2.every((r) => r.color === "rgba(0,0,0,0)"));

  CPS._setPositionSymbolForTest(null);
  const 표3 = CPS.getTrackedForTest();
  ok("null 을 넣으면 다시 스냅샷의 도장을 따른다", 표3.length === 3 && 표3.every((r) => r.hidden === false), JSON.stringify(표3));
  ok("색이 원래대로 돌아온다", 표3.length === 3 && 표3[0].color === CHART.entry, JSON.stringify(표3));

  const st = CPS.getStats();
  ok(
    "getStats() 가 네 값을 준다",
    ["hidden", "shown", "tracked", "changed"].every((k) => typeof st[k] === "number"),
    JSON.stringify(st)
  );
  st.hidden = 999;
  ok("getStats() 는 복사본이다(밖에서 못 고친다)", CPS.getStats().hidden !== 999);
}

/* =========================================================================
 * [11] 없는 환경에서도 죽지 않는다
 * ===================================================================== */
section("[11] 라이브러리·설정이 없어도 죽지 않는다");

{
  const t = boot({ noLib: true });
  ok("라이브러리가 아직 없어도 모듈은 뜬다", !!t.App.ChartPositionSymbol);
  ok("붙잡은 선은 0개", t.App.ChartPositionSymbol.getTrackedCount() === 0);
  ok("matches() 는 true (판단 근거 없음)", t.App.ChartPositionSymbol.matches() === true);
}
{
  const t = boot({ noConfig: true });
  const CPS = t.App.ChartPositionSymbol;
  t.makeChart();
  t.emit("trading:update", snapOf(POS_BTC));
  ok("App.Config 가 없으면 BTCUSDT 로 본다", CPS.matches() === true, String(CPS.getPositionSymbol()));
  CPS._setPositionSymbolForTest("SAMSUNGUSDT");
  ok("그래도 다른 종목이면 다르다고 판단한다", CPS.matches() === false);
}

/* =========================================================================
 * [12] 수정 금지 파일 12개 — md5 로 확인 (문자열 검사는 오탐이 납니다)
 * ===================================================================== */
section("[12] 수정 금지 파일 12개");

const BASELINE = {
  "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
  "ui.js": "333fc427e75b47b306699c92aa4e7b50",
  "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
  "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
  "chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
  "leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
  "admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
  "season.js": "9c5fbf13ced09ca2f348e48f87c78224",
  "board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
  "orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
  "chart.js": "02ddcb000d577131f797143d08c09123",
  "websocket.js": "1a914631175760e0b0cb5144bc11b59e",
};
Object.keys(BASELINE).forEach((f) => {
  const 실제 = crypto.createHash("md5").update(read(path.join(REPO, "js", f))).digest("hex");
  ok("js/" + f + " 를 건드리지 않았다", 실제 === BASELINE[f], 실제);
});

/* ===================================================================== */
console.log("\n------------------------------------------");
if (fail) {
  console.log(" 실패한 검사:");
  실패목록.forEach((m, i) => console.log("  " + (i + 1) + ") " + m));
}
console.log("통과: " + pass + " / 실패: " + fail);
process.exit(fail === 0 ? 0 : 1);
