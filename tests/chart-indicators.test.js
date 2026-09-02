/* tests/chart-indicators.test.js
 * 차트 2단계 — 이동평균선(7/25/99) · 볼린저밴드 · 거래량 켜기/끄기 검증.
 *
 * 이 모듈이 지켜야 하는 것
 *   1) js/chart.js 를 고치지 않는다 (차트는 App.ChartFont.getCharts() 로 가져옴)
 *   2) 이미 있는 거래량 막대를 또 만들지 않는다 (visible 만 껐다 켠다)
 *   3) 꺼져 있으면 계산도 하지 않는다
 *   4) 새 값이 올 때 전체를 다시 계산하지 않는다 — 그런데 결과는 전체 계산과 같아야 한다
 *   5) 확정 팔레트 밖의 색을 쓰지 않는다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
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

const SRC = fs.readFileSync(path.join(REPO, "js", "chart-indicators.js"), "utf8");
const CHART_JS = fs.readFileSync(path.join(REPO, "js", "chart.js"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n차트 지표 (이동평균선 · 볼린저밴드 · 거래량)");

/* ===================================================================
 * 가짜 DOM — 실제 브라우저 없이 모듈을 그대로 돌립니다.
 * =================================================================== */
function makeText(s) {
  return { __text: true, nodeValue: s, children: [] };
}
function makeEl(tag) {
  return {
    tagName: tag,
    className: "",
    id: "",
    textContent: "",
    type: "",
    style: {},
    children: [],
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
      this.children.push(c);
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
      const cls = String(sel).replace(/^\./, "");
      const out = [];
      (function walk(n) {
        n.children.forEach((c) => {
          if (c.className === cls) out.push(c);
          walk(c);
        });
      })(this);
      return out;
    },
    getBoundingClientRect() {
      return { width: 800, height: 400, top: 0, left: 0, right: 800, bottom: 400 };
    },
  };
}

/* ===================================================================
 * 가짜 Lightweight Charts + 가짜 차트
 * =================================================================== */
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
  };
}

function boot(candles, savedState) {
  const timers = [];
  const stored = {};
  if (savedState) stored["chart-indicators"] = savedState;

  const candleSeries = makeFakeSeries("Candlestick", { priceScaleId: "right" });
  candleSeries._data = candles.slice();
  const volumeSeries = makeFakeSeries("Histogram", { priceScaleId: "" });

  const added = [];
  const chart = {
    panes() {
      return [
        {
          getSeries() {
            return [candleSeries, volumeSeries];
          },
        },
      ];
    },
    addSeries(type, opts) {
      const s = makeFakeSeries("Line", opts);
      added.push(s);
      return s;
    },
    removeSeries(s) {
      const i = added.indexOf(s);
      if (i >= 0) added.splice(i, 1);
    },
  };

  const head = makeEl("head");
  const body = makeEl("body");
  const wrap = makeEl("div");
  wrap.className = "chart-wrap";
  body.appendChild(wrap);

  const styles = [];
  const doc = {
    readyState: "complete",
    head: head,
    body: body,
    documentElement: makeEl("html"),
    addEventListener() {},
    createElement(tag) {
      const e = makeEl(tag);
      return e;
    },
    createTextNode: makeText,
    getElementById(id) {
      return styles.filter((s) => s.id === id)[0] || null;
    },
    querySelector(sel) {
      if (sel.indexOf("chart-wrap") !== -1) return wrap;
      return null;
    },
  };
  /* <style> 는 head 에 붙습니다 — 붙을 때 목록에 넣어 getElementById 로 찾히게 */
  head.appendChild = function (c) {
    styles.push(c);
    return c;
  };
  body.contains = function (n) {
    return n === wrap || wrap.children.indexOf(n) !== -1;
  };

  const bus = {};
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: doc,
    performance: { now: () => 0 },
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
      LineSeries: {},
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
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);

  /* init() 안의 대기 타이머를 몇 번 돌려 준비를 끝냅니다. */
  const tick = () => timers.slice().forEach((f) => f && f());
  tick();
  tick();

  return { M: sandbox.App.ChartIndicators, sandbox, chart, candleSeries, volumeSeries, wrap, stored, tick, added };
}

/* 테스트용 캔들 — 재현 가능한 값이면 되므로 규칙적인 파형을 씁니다. */
function makeCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const close = 80000 + Math.sin(i / 7) * 300 + (i % 13) * 11;
    out.push({ time: 1700000000 + i * 60, open: close, high: close, low: close, close: close });
  }
  return out;
}

/* 대조군 — 순진하게 매번 전부 다시 더하는 계산 */
function naiveSMA(closes, period) {
  const out = [];
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += closes[j];
    out.push(s / period);
  }
  return out;
}
function naiveBB(closes, period, mult) {
  const up = [], mid = [], low = [];
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += closes[j];
    const m = s / period;
    let v = 0;
    for (let j = i - period + 1; j <= i; j++) v += (closes[j] - m) * (closes[j] - m);
    const sd = Math.sqrt(v / period);
    mid.push(m);
    up.push(m + mult * sd);
    low.push(m - mult * sd);
  }
  return { up, mid, low };
}

/* ================================================================
 * 1. 이미 있는 것을 또 만들지 않는다
 * ================================================================ */
console.log("\n[이미 있는 것]");
{
  ok("chart.js 가 거래량 막대를 이미 만들고 있다", /volumeSeries\s*=\s*chart\.addSeries\(LightweightCharts\.HistogramSeries/.test(CHART_JS));
  ok("우리 모듈은 히스토그램(거래량)을 새로 만들지 않는다", !/HistogramSeries/.test(SRC), "또 만들면 막대가 두 벌이 됩니다");
  ok("거래량은 visible 옵션만 껐다 켠다", /volumeSeries\.applyOptions\(\{ visible/.test(SRC));
  ok("chart.js 가 그리는 진입가·TP·SL 선을 또 그리지 않는다", !/createPriceLine/.test(SRC));
  ok("1단계 모듈(chart-position-lines.js)을 건드리지 않는다", !/ChartPositionLines/.test(SRC));
}

/* ================================================================
 * 2. chart.js 무수정 — 차트를 가져오는 방법
 * ================================================================ */
console.log("\n[chart.js 를 안 건드린 근거]");
{
  ok("차트는 App.ChartFont.getCharts() 로 가져온다", /App\.ChartFont\.getCharts\(\)/.test(SRC));
  ok("캔들·거래량 시리즈는 공개 API(panes/getSeries)로 찾는다", /chart\.panes\(\)/.test(SRC) && /getSeries\(\)/.test(SRC));
  ok("chart.js 안에 이 모듈 이름이 없다", !/ChartIndicators/.test(CHART_JS));
  ok("index.html 에 실려 있다", /<script src="js\/chart-indicators\.js"><\/script>/.test(HTML));
  ok(
    "js/chart.js 보다 뒤에 실린다",
    HTML.indexOf('js/chart-indicators.js') > HTML.indexOf('src="js/chart.js"'),
    "차트가 만들어진 뒤에 붙어야 합니다"
  );
  ok(
    "1단계 모듈도 그대로 남아 있다",
    /<script src="js\/chart-position-lines\.js"><\/script>/.test(HTML)
  );
}

/* ================================================================
 * 3. 색·기간 — 바이낸스 기준 + 확정 팔레트
 * ================================================================ */
console.log("\n[색과 기간]");
{
  const PALETTE = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  /* 주석은 뺍니다 — 바이낸스 실측값(#F0B90B 등)이 설명으로 적혀 있습니다. */
  const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  const used = (CODE.match(/#[0-9A-Fa-f]{6}/g) || []).map((c) => c.toUpperCase());
  const outside = used.filter((c) => PALETTE.indexOf(c) === -1);
  ok("확정 팔레트 밖의 색을 쓰지 않는다", outside.length === 0, outside.join(", "));
  ok("바이낸스 실측값이 주석에 적혀 있다(무엇과 맞췄는지 남김)", /#F0B90B/.test(SRC) && /#EB40B5/.test(SRC) && /#B385F8/.test(SRC));
  ok("MA 기간은 바이낸스 기본값 7 / 25 / 99", /ma7: 7/.test(SRC) && /ma25: 25/.test(SRC) && /ma99: 99/.test(SRC));
  ok("볼린저는 기간 20 · 표준편차 2배", /BB_PERIOD = 20/.test(SRC) && /BB_MULT = 2/.test(SRC));
  ok("선 굵기는 바이낸스와 같은 1px", /LINE_WIDTH = 1/.test(SRC));
  ok("MA 7 은 포인트색(바이낸스 노랑에 가장 가까움)", /ma7: "#F0B429"/.test(SRC));
  ok("상승·하락색은 지표선에 쓰지 않는다", !/ma\d+: "#26C281"/.test(SRC) && !/ma\d+: "#F0506E"/.test(SRC));
}

/* ================================================================
 * 4. 계산이 맞는가
 * ================================================================ */
console.log("\n[계산]");
{
  const candles = makeCandles(200);
  const { M } = boot(candles);
  const closes = candles.map((c) => c.close);
  const times = candles.map((c) => c.time);

  const sma25 = M.computeSMA(closes, times, 25);
  const naive25 = naiveSMA(closes, 25);
  ok("이동평균 개수가 맞다 (200개 · 25기간 → 176개)", sma25.length === 176, String(sma25.length));
  let maxDiff = 0;
  sma25.forEach((p, i) => {
    maxDiff = Math.max(maxDiff, Math.abs(p.value - naive25[i]));
  });
  ok("이동평균 값이 순진한 계산과 같다", maxDiff < 1e-9, "최대 차이 " + maxDiff);

  const bb = M.computeBB(closes, times, 20, 2);
  const nbb = naiveBB(closes, 20, 2);
  ok("볼린저 개수가 맞다 (200개 · 20기간 → 181개)", bb.middle.length === 181, String(bb.middle.length));
  let bbDiff = 0;
  bb.upper.forEach((p, i) => {
    bbDiff = Math.max(bbDiff, Math.abs(p.value - nbb.up[i]), Math.abs(bb.lower[i].value - nbb.low[i]));
  });
  ok("볼린저 값이 순진한 계산과 같다(모집단 표준편차)", bbDiff < 1e-9, "최대 차이 " + bbDiff);

  ok("데이터가 기간보다 적으면 아무 값도 내지 않는다", M.computeSMA([1, 2, 3], [1, 2, 3], 7).length === 0);
}

/* ================================================================
 * 5. 실시간 갱신 — 전체를 다시 계산하지 않아도 결과가 같아야 한다
 * ================================================================ */
console.log("\n[실시간 갱신]");
{
  const candles = makeCandles(300);
  const { M, added } = boot(candles);
  M.setOn("ma7", true);
  M.setOn("ma25", true);
  M.setOn("ma99", true);
  M.setOn("bb", true);

  const lines = M.getSeriesForTest().lines;
  ok("켜면 선이 6개 만들어진다 (MA 3 + 볼린저 3)", added.length === 6, String(added.length));

  /* 같은 봉이 30번 갱신되는 상황 */
  const lastTime = candles[candles.length - 1].time;
  for (let i = 0; i < 30; i++) {
    M.onTickForTest({ symbol: "BTCUSDT", candle: { time: lastTime, close: 80500 + i * 7 } });
  }
  /* 새 봉 5개가 이어지는 상황 */
  for (let i = 1; i <= 5; i++) {
    M.onTickForTest({ symbol: "BTCUSDT", candle: { time: lastTime + i * 60, close: 80700 + i * 3 } });
  }

  const closes = M.getClosesForTest();
  const times = closes.map((_, i) => i); // 시각은 비교에 쓰지 않습니다
  const full7 = naiveSMA(closes, 7);
  const full99 = naiveSMA(closes, 99);
  const fullBB = naiveBB(closes, 20, 2);

  const got7 = lines.ma7.data()[lines.ma7.data().length - 1].value;
  const got99 = lines.ma99.data()[lines.ma99.data().length - 1].value;
  const gotUp = lines.bbUpper.data()[lines.bbUpper.data().length - 1].value;
  const gotLow = lines.bbLower.data()[lines.bbLower.data().length - 1].value;

  ok("MA 7 마지막 값이 전체 재계산과 같다", Math.abs(got7 - full7[full7.length - 1]) < 1e-7,
    got7 + " vs " + full7[full7.length - 1]);
  ok("MA 99 마지막 값이 전체 재계산과 같다", Math.abs(got99 - full99[full99.length - 1]) < 1e-7,
    got99 + " vs " + full99[full99.length - 1]);
  ok("볼린저 윗선이 전체 재계산과 같다", Math.abs(gotUp - fullBB.up[fullBB.up.length - 1]) < 1e-7);
  ok("볼린저 아랫선이 전체 재계산과 같다", Math.abs(gotLow - fullBB.low[fullBB.low.length - 1]) < 1e-7);
  ok("새 봉 5개가 실제로 늘었다 (300 → 305)", closes.length === 305, String(closes.length));
  ok("다른 종목 신호는 무시한다", (function () {
    const before = M.getClosesForTest().length;
    M.onTickForTest({ symbol: "ETHUSDT", candle: { time: lastTime + 999, close: 1 } });
    return M.getClosesForTest().length === before;
  })());
  ok("갱신 1회는 전체 재계산보다 훨씬 싸다(합계를 빼고 더하는 방식)",
    /sums\.ma99 \+= diff/.test(SRC), "매번 99개를 다시 더하면 안 됩니다");
  ok("새 봉에서만 구간을 다시 더한다(오차 누적 방지)", /recalcAllSums\(\);/.test(SRC));
}

/* ================================================================
 * 6. 꺼져 있으면 계산도 하지 않는다
 * ================================================================ */
console.log("\n[꺼져 있을 때]");
{
  const candles = makeCandles(300);
  const { M, added } = boot(candles);
  ok("기본은 MA·볼린저 모두 꺼짐", !M.isOn("ma7") && !M.isOn("ma25") && !M.isOn("ma99") && !M.isOn("bb"));
  ok("꺼진 상태에서는 선을 아예 만들지 않는다", added.length === 0, String(added.length));

  M.resetPerf();
  const lastTime = candles[candles.length - 1].time;
  for (let i = 0; i < 200; i++) {
    M.onTickForTest({ symbol: "BTCUSDT", candle: { time: lastTime, close: 80500 + i } });
  }
  ok("시세가 200번 와도 계산을 한 번도 하지 않는다", M.getPerf().ticks === 0, String(M.getPerf().ticks));
  ok("종가 배열조차 만들지 않는다", M.getClosesForTest().length === 0);

  /* 켰다가 다시 끄면 선도 배열도 정리된다 */
  M.setOn("ma25", true);
  ok("켜면 선이 생긴다", M.getSeriesForTest().lines.ma25 !== null);
  M.setOn("ma25", false);
  ok("끄면 선을 없앤다", M.getSeriesForTest().lines.ma25 === null);
  ok("끄면 종가 배열도 비운다", M.getClosesForTest().length === 0);
}

/* ================================================================
 * 7. 껐다 켜기 · 새로고침해도 유지
 * ================================================================ */
console.log("\n[껐다 켜기와 기억]");
{
  const candles = makeCandles(120);
  const { M, stored, wrap, volumeSeries } = boot(candles);

  const bar = wrap.children.filter((c) => c.className === "tl-ind-bar")[0];
  ok("차트 위에 버튼이 붙는다", !!bar);
  /* 2026-09-02 — 칩 줄에 "접기" 버튼(.tl-ind-fold)이 하나 더 붙었습니다(P2).
     지표 칩만 세도록 골라냅니다. 접기 버튼은 아래에서 따로 확인합니다. */
  const btns = bar ? bar.children.filter((c) => c.className === "tl-ind-btn") : [];
  ok("지표 버튼은 5개 (MA 7 / MA 25 / MA 99 / 볼린저 / 거래량)", btns.length === 5, String(btns.length));
  ok("버튼 이름이 맞다", btns.map((b) => b.textContent).join(",") === "MA 7,MA 25,MA 99,볼린저,거래량",
    btns.map((b) => b.textContent).join(","));
  const fold = bar ? bar.children.filter((c) => c.className === "tl-ind-fold") : [];
  ok("접기 버튼이 딱 하나 붙는다 (칩이 캔들을 덮던 것 — 2026-09-02 P2)",
    fold.length === 1, String(fold.length));

  ok("기본값 — 거래량만 켜짐(지금 화면 그대로)", M.isOn("vol") === true);
  ok("기본값 — 나머지는 꺼짐", !M.isOn("ma7") && !M.isOn("bb"));

  /* 버튼을 눌러서 켠다 */
  btns[0].click();
  ok("버튼을 누르면 켜진다", M.isOn("ma7") === true);
  ok("켠 상태가 App.Storage 에 저장된다", stored["chart-indicators"] && stored["chart-indicators"].ma7 === true);
  ok("켜짐 표시가 버튼에 반영된다", btns[0].getAttribute("aria-pressed") === "true");
  btns[0].click();
  ok("한 번 더 누르면 꺼진다", M.isOn("ma7") === false);
  ok("꺼진 것도 저장된다", stored["chart-indicators"].ma7 === false);

  /* 거래량은 시리즈를 새로 만들지 않고 visible 만 바꾼다 */
  btns[4].click();
  ok("거래량을 끄면 기존 시리즈가 숨겨진다", volumeSeries.options().visible === false);
  btns[4].click();
  ok("다시 켜면 보인다", volumeSeries.options().visible === true);
}

{
  /* 새로고침 재현 — 저장된 값으로 다시 부팅 */
  const candles = makeCandles(120);
  const saved = { ma7: true, ma25: false, ma99: true, bb: true, vol: false };
  const { M, added, volumeSeries } = boot(candles, saved);
  ok("새로고침해도 켠 지표가 그대로다", M.isOn("ma7") && M.isOn("ma99") && M.isOn("bb") && !M.isOn("ma25"));
  ok("새로고침해도 끈 거래량이 그대로다", volumeSeries.options().visible === false);
  ok("켜져 있던 것만 그린다 (MA 2개 + 볼린저 3개 = 5)", added.length === 5, String(added.length));
}

{
  /* 저장된 값이 망가져 있으면 기본값으로 */
  const candles = makeCandles(120);
  const { M } = boot(candles, { ma7: "이상한값", vol: 3 });
  ok("저장값이 이상하면 기본값을 쓴다", M.isOn("ma7") === false && M.isOn("vol") === true);
}

/* ================================================================
 * 8. 봉 간격이 바뀌면 다시 계산한다
 * ================================================================ */
console.log("\n[봉 간격 · 과거 데이터]");
{
  ok("봉 간격이 바뀌면 다시 맞춘다", /App\.Bus\.on\("interval:change", scheduleResync\)/.test(SRC));
  ok("종목이 바뀌어도 다시 맞춘다", /App\.Bus\.on\("symbol:change", scheduleResync\)/.test(SRC));
  ok("과거 데이터가 앞에 붙는 것도 알아챈다(맨 앞 시각 비교)", /data\[0\]\.time === syncMark\.first/.test(SRC));
  ok("켜진 지표가 없으면 감시도 멈춘다", /stopSyncTimer\(\);/.test(SRC));
}

/* ================================================================
 * 9. 되돌리는 방법이 파일에 적혀 있다
 * ================================================================ */
console.log("\n[되돌리기]");
{
  ok("파일 맨 위에 되돌리는 방법이 적혀 있다", /되돌리기/.test(SRC) && /chart-indicators\.js"><\/script> 한 줄 삭제/.test(SRC));
  ok("style.css 를 건드리지 않는다(스타일은 JS 가 넣음)", /chart-indicators-style/.test(SRC));
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
