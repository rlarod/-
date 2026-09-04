/* tests/chart-ha-real-price-seal.test.js
 * =========================================================================
 * 돈에 닿는 봉인 — 하이킨아시(평균낸 봉)가 ★진짜 가격★ 을 가리지 못하게
 * =========================================================================
 * 2026-09-02 밤 · 기록팀
 *   대상 두 모듈이 ★같은 캔들 시리즈를 서로 잡아갑니다★ —
 *     js/chart-candle-type.js   봉 종류(하이킨아시 포함). 평균낸 봉을 하나 얹습니다
 *     js/chart-ohlc-legend.js   십자선 O·H·L·C 범례. 캔들 하나를 잡아 값을 읽습니다
 *
 * ── 왜 이 파일이 따로 필요한가 (팀 사이에 낀 자리) ─────────────────────
 *   두 모듈은 같은 날 밤 ★다른 커밋★ 으로 들어왔습니다.
 *     08d183d  봉 종류 4->10 (하이킨아시)
 *     5f015e6  십자선 봉 값(OHLC) 범례
 *   각 팀이 자기 봉인은 만들었지만, ★둘이 만나는 자리★ 는 아무도 안 봤습니다.
 *   실제로 두 모듈 모두 "pane 의 ★첫 번째★ Candlestick" 을 진짜 캔들로 삼습니다
 *   (js/chart-candle-type.js findParts · js/chart-ohlc-legend.js findParts).
 *   그런데 하이킨아시가 켜지면 pane 에 Candlestick 이 ★두 개★ 가 됩니다.
 *   범례가 뒤엣것(평균낸 봉)을 잡는 순간 —
 *
 *       회원이 보는 O·H·L·C 가 ★평균값★ 이 됩니다. 오류도 안 나고 화면도 멀쩡합니다.
 *       회원은 그 숫자를 진짜 가격으로 믿고 지정가·손절값을 적습니다. ★회원 돈★ 입니다.
 *
 *   CLAUDE.md 가 말하는 "조용한 고장" 이고 P1 입니다.
 *
 *   ⚠️ 이 자리는 ★순서에 기댑니다★. 실려 있는 순서(index.html)나
 *      getSeries() 가 돌려주는 순서 중 하나만 바뀌어도 조용히 뒤집힙니다.
 *      그래서 아래 [1] 은 ★네 가지 순서★ 를 전부 태워 봅니다 —
 *        · 봉종류 먼저 / 범례 먼저
 *        · 하이킨아시가 꺼진 채로 시작 / ★이미 켜진 채로★ 새로고침
 *      마지막 것이 제일 위험합니다. 회원이 하이킨아시를 골라 둔 채 새로고침하면
 *      범례가 붙는 그 순간 이미 Candlestick 이 두 개입니다.
 *
 * ── 회원이 실제로 누르는 길로만 잽니다 ─────────────────────────────────
 *   2026-09-02 밤 PM 이 같은 종류로 네 번 잘못 쟀습니다(회원이 안 쓰는 낮은 단계
 *   함수를 부름). 그래서 여기서는 ★DOM 단추를 진짜로 누릅니다★ —
 *     M.open()  ->  panel.querySelector('.tl-ct-row[data-k="heikin"]').click()
 *   setType() 을 직접 부르는 것은 [2-0] 에서 "단추 클릭과 결과가 같다" 를
 *   확인하는 자리에만 씁니다. 거기서 같다는 것이 확인돼야 다른 봉인들이
 *   setType 으로 재는 것도 뜻이 있습니다.
 *
 * ── 숫자를 박지 않습니다 ───────────────────────────────────────────────
 *   기대값은 ★참조식★ 으로 매번 다시 계산합니다(아래 하이킨아시참조).
 *   그리고 범례 글자는 "하이킨아시를 켜기 전 · 켠 뒤" 를 서로 대조합니다 —
 *   한 글자라도 달라지면 실패입니다. 고정 숫자가 아니라 ★불변식★ 입니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 줄과 이 파일을 지우면 됩니다.
 *   사이트 코드는 한 글자도 건드리지 않습니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const L = require("./_locked-hashes.js");
const 글씨단위 = require("./_font-size.js");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

function md5(rel) {
  return crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", rel))).digest("hex");
}

/* =========================================================================
 * 참조식 — 트레이딩뷰 고객센터 원문 그대로. 모듈 코드를 안 보고 따로 짰습니다.
 *   HA종가 = (시+고+저+종)/4
 *   HA시가 = (앞 HA시가 + 앞 HA종가)/2      첫 봉은 (시+종)/2
 *   HA고가 = max(고, HA시가, HA종가)
 *   HA저가 = min(저, HA시가, HA종가)
 * ========================================================================= */
function 하이킨아시참조(봉들) {
  const 나온것 = [];
  let 앞 = null;
  봉들.forEach(function (b) {
    const c = (b.open + b.high + b.low + b.close) / 4;
    const o = 앞 ? (앞.open + 앞.close) / 2 : (b.open + b.close) / 2;
    const v = { time: b.time, open: o, high: Math.max(b.high, o, c), low: Math.min(b.low, o, c), close: c };
    나온것.push(v);
    앞 = v;
  });
  return 나온것;
}

/* 검사에 쓸 봉 — 진짜 값과 HA 값이 ★한 자리도 안 겹치게★ 골랐습니다.
   겹치면 "진짜 값을 보여준다" 와 "평균값을 보여준다" 를 글자로 구분할 수 없습니다. */
const 봉들 = [
  { time: 1, open: 100, high: 110, low: 90, close: 105 },
  { time: 2, open: 105, high: 120, low: 100, close: 115 },
  { time: 3, open: 115, high: 118, low: 95, close: 97 }
];

/* =========================================================================
 * 가짜 차트 — Lightweight Charts 공개 API 모양만 흉내 냅니다
 * ========================================================================= */
function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const 순서 = 옵션.순서 || ["chart-candle-type.js", "chart-ohlc-legend.js"];

  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\">" +
      "<div class=\"tlc-toolbar\"><button class=\"tlc-btn\" data-tlc=\"candletype\"></button></div>" +
      "<div class=\"tlc-body\"><div class=\"chart-wrap\"><div id=\"chart_container\"></div></div></div>" +
      "</div></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = 옵션.width || 1440;
  win.innerHeight = 옵션.height || 900;
  const 지연 = [];
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;
  win.fetch = undefined;

  const 기록 = { 만든것: [], 지운것: [], 지운가로선: [] };

  function 시리즈(종류, 옵) {
    const o = Object.assign({}, 옵 || {});
    const s = {
      __종류: 종류, __opts: o, __data: [], __last: null, __가로선: [],
      seriesType: function () { return 종류; },
      options: function () { return Object.assign({}, o); },
      applyOptions: function (n) { Object.assign(o, n || {}); return true; },
      setData: function (d) { s.__data = d; return true; },
      update: function (b) { s.__last = b; return true; },
      data: function () { return s.__data; },
      createPriceLine: function (x) {
        const l = { o: x, __살아있음: true, __주인: s };
        s.__가로선.push(l);
        return l;
      },
      removePriceLine: function (l) { l.__살아있음 = false; 기록.지운가로선.push(l); },
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return s;
  }

  const pane = { __목록: [], getSeries: function () { return pane.__목록.slice(); } };
  const chart = {
    panes: function () { return [pane]; },
    addSeries: function (ctor, opts) {
      const s = 시리즈(ctor && ctor.__종류, opts);
      pane.__목록.push(s);
      기록.만든것.push(s);
      return s;
    },
    removeSeries: function (s) {
      const i = pane.__목록.indexOf(s);
      if (i >= 0) pane.__목록.splice(i, 1);
      기록.지운것.push(s);
    },
    timeScale: function () {
      return {
        subscribeVisibleLogicalRangeChange: function () {},
        subscribeVisibleTimeRangeChange: function () {},
        getVisibleLogicalRange: function () { return null; },
        coordinateToLogical: function () { return 0; }
      };
    },
    subscribeCrosshairMove: function (f) { chart.__십자선 = f; },
    applyOptions: function () {},
    priceScale: function () { return { applyOptions: function () {} }; }
  };

  win.LightweightCharts = {
    CandlestickSeries: { __종류: "Candlestick" },
    LineSeries: { __종류: "Line" },
    BarSeries: { __종류: "Bar" },
    AreaSeries: { __종류: "Area" },
    BaselineSeries: { __종류: "Baseline" },
    HistogramSeries: { __종류: "Histogram" },
    LineType: { WithSteps: 1 },
    LineStyle: { Dashed: 2 }
  };

  /* js/chart.js 가 만드는 ★진짜 캔들★. 언제나 제일 먼저 만들어집니다 */
  const 진짜캔들 = chart.addSeries(win.LightweightCharts.CandlestickSeries, {
    upColor: "#26C281", downColor: "#F0506E", borderVisible: false,
    wickUpColor: "#26C281", wickDownColor: "#F0506E",
    lastValueVisible: true, priceLineVisible: true
  });
  /* 거기 매달려 있는 것 — 시리즈를 갈아끼우면 같이 떨어집니다 */
  const 진입가선 = 진짜캔들.createPriceLine({ price: 100, title: "진입가" });
  const 청산가선 = 진짜캔들.createPriceLine({ price: 90, title: "청산가" });
  진짜캔들.setData(봉들);

  const 저장소 = Object.assign({}, 옵션.저장소 || {});
  const 듣는이 = {};
  win.App = {
    ChartFont: { getCharts: function () { return [chart]; } },
    Storage: {
      load: function (k, d) { return Object.prototype.hasOwnProperty.call(저장소, k) ? 저장소[k] : d; },
      save: function (k, v) { 저장소[k] = v; }
    },
    Config: {
      getActiveSymbol: function () { return "BTCUSDT"; },
      getActiveInterval: function () { return "1m"; },
      getDisplayCurrency: function () { return "USDT"; }
    },
    Bus: {
      on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
      emit: function (n, p) { (듣는이[n] || []).forEach(function (f) { f(p); }); }
    },
    Utils: { formatCurrencyPlain: function (v) { return String(v); } }
  };

  순서.forEach(function (f) {
    win.eval(fs.readFileSync(path.join(REPO, "js", f), "utf8"));
  });
  /* 두 모듈 다 DOMContentLoaded 를 기다립니다 — 실제 화면과 같게 한 번 쏴 줍니다 */
  const ev = win.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  win.document.dispatchEvent(ev);
  지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });

  const t = {
    win: win, dom: dom, chart: chart, pane: pane, 기록: 기록,
    진짜캔들: 진짜캔들, 진입가선: 진입가선, 청산가선: 청산가선,
    저장소: 저장소, 듣는이: 듣는이,
    CT: win.App.ChartCandleType,
    LG: win.App.ChartOhlcLegend,
    닫기: function () { dom.window.close(); }
  };

  /* 회원이 실제로 누르는 길 — 창을 열고 줄을 누릅니다 */
  t.눌러고르기 = function (k) {
    t.CT.open();
    const 창 = win.document.getElementById(t.CT.PANEL_ID);
    if (!창) return "창이 안 열렸습니다";
    const 줄 = 창.querySelector(".tl-ct-row[data-k=\"" + k + "\"]");
    if (!줄) return "'" + k + "' 줄이 없습니다";
    줄.click();
    지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });
    return null;
  };
  t.범례글자 = function () {
    const el = win.document.querySelector("." + t.LG.EL_CLASS);
    return el ? el.textContent : null;
  };
  t.범례가잡은캔들 = function () { return t.LG.getStateForTest().candle; };
  t.첫캔들 = function () {
    return pane.getSeries().filter(function (s) { return s.seriesType() === "Candlestick"; })[0];
  };
  t.안내줄 = function () { return win.document.getElementById(t.CT.NOTICE_ID); };
  return t;
}

console.log("\n하이킨아시 <-> 진짜 가격 (봉 종류 · 십자선 범례)");

/* =========================================================================
 * [0] 수정 금지 파일을 한 글자도 안 건드렸다
 * ========================================================================= */
절("[0] 수정 금지 파일");
{
  Object.keys(L.잠긴11).forEach(function (p) {
    const f = p.replace(/^js\//, "");
    ok(p + " 를 한 글자도 안 고쳤다", md5(f) === L.잠긴11[p], md5(f));
  });
  ok("js/trading.js 가 결재된 그 해시 그대로다", md5("trading.js") === L.TRADING, md5("trading.js"));
}

/* =========================================================================
 * [1] 범례는 언제나 ★진짜 캔들★ 을 잡는다 — 네 가지 순서 전부
 * ========================================================================= */
절("[1] 범례가 잡는 캔들 — 순서를 어떻게 바꿔도 진짜 캔들이다");
{
  const 경우들 = [
    { 이름: "봉종류 먼저 실림 · 캔들로 시작", 순서: ["chart-candle-type.js", "chart-ohlc-legend.js"], 저장소: {} },
    { 이름: "범례 먼저 실림 · 캔들로 시작", 순서: ["chart-ohlc-legend.js", "chart-candle-type.js"], 저장소: {} },
    {
      이름: "하이킨아시를 골라 둔 채 새로고침 (봉종류 먼저)",
      순서: ["chart-candle-type.js", "chart-ohlc-legend.js"],
      저장소: { "chart-candle-type": { type: "heikin" } }
    },
    {
      이름: "하이킨아시를 골라 둔 채 새로고침 (범례 먼저)",
      순서: ["chart-ohlc-legend.js", "chart-candle-type.js"],
      저장소: { "chart-candle-type": { type: "heikin" } }
    }
  ];
  경우들.forEach(function (c) {
    const t = 띄우기({ 순서: c.순서, 저장소: c.저장소 });
    ok(c.이름 + " — 범례가 진짜 캔들을 잡았다",
      t.범례가잡은캔들() === t.진짜캔들,
      "잡은 것: " + (!t.범례가잡은캔들() ? "없음" : "다른 시리즈(평균낸 봉일 수 있습니다)"));
    ok(c.이름 + " — 진짜 캔들이 여전히 pane 의 첫 Candlestick 이다",
      t.첫캔들() === t.진짜캔들);
    t.닫기();
  });
}
{
  /* 저장값이 실제로 먹었는지 — 안 먹으면 위 두 경우가 헛검사가 됩니다 */
  const t = 띄우기({ 저장소: { "chart-candle-type": { type: "heikin" } } });
  ok("저장해 둔 '하이킨아시' 가 새로고침 뒤에 살아난다 (위 검사가 헛돌지 않는다)",
    t.CT.getType() === "heikin", t.CT.getType());
  const 캔들수 = t.pane.getSeries().filter(function (s) { return s.seriesType() === "Candlestick"; }).length;
  ok("그때 Candlestick 이 두 개다 (진짜 + 평균낸 봉) — 이 상황이라야 의미가 있다",
    캔들수 === 2, String(캔들수));
  t.닫기();
}
{
  /* 고저(highlow) 도 Candlestick 을 얹습니다 — 같은 함정입니다 */
  const t = 띄우기();
  const 왜 = t.눌러고르기("highlow");
  ok("고저(highlow) 를 회원 경로로 고를 수 있다", 왜 === null, 왜 || "");
  ok("고저일 때도 범례가 진짜 캔들을 잡고 있다", t.범례가잡은캔들() === t.진짜캔들);
  ok("고저일 때도 진짜 캔들이 첫 Candlestick 이다", t.첫캔들() === t.진짜캔들);
  t.닫기();
}

/* =========================================================================
 * [2] 십자선 O·H·L·C 가 평균값이 아니라 진짜 값이다
 * ========================================================================= */
절("[2] 십자선 범례 값 — 평균낸 값이 섞이면 안 된다");
{
  const t = 띄우기();
  const HA = 하이킨아시참조(봉들);

  const 십자선쏘기 = function () {
    const 지도 = new t.win.Map();
    지도.set(t.진짜캔들, 봉들[2]);
    const 얹은것 = t.CT.getSeriesForTest().overlay;
    if (얹은것) 지도.set(얹은것, HA[2]);
    t.chart.__십자선({ time: 3, seriesData: 지도 });
    return t.범례글자();
  };
  const 켜기전 = 십자선쏘기();
  ok("범례가 화면에 있다", !!켜기전 && 켜기전.length > 0, String(켜기전));

  const 왜 = t.눌러고르기("heikin");
  ok("하이킨아시를 회원 경로(창 열기 -> 줄 누르기)로 골랐다", 왜 === null, 왜 || "");
  ok("정말 하이킨아시가 됐다", t.CT.getType() === "heikin", t.CT.getType());
  ok("평균낸 봉이 실제로 하나 얹혔다", !!t.CT.getSeriesForTest().overlay);

  const 켠뒤 = 십자선쏘기();
  ok("하이킨아시를 켜도 범례 글자가 한 글자도 안 바뀐다",
    켠뒤 === 켜기전, "켜기전 [" + 켜기전 + "] / 켠뒤 [" + 켠뒤 + "]");

  /* 참조식으로 낸 평균값이 글자에 섞이지 않았는지 — 숫자를 박지 않고 계산해 대조 */
  const 평균숫자 = [HA[2].open, HA[2].close].map(String);
  const 섞인것 = 평균숫자.filter(function (n) { return 켠뒤 && 켠뒤.indexOf(n) >= 0; });
  ok("범례 글자에 평균값이 하나도 없다", 섞인것.length === 0, 섞인것.join(","));

  const 진짜숫자 = [봉들[2].open, 봉들[2].high, 봉들[2].low, 봉들[2].close].map(String);
  const 빠진것 = 진짜숫자.filter(function (n) { return !켠뒤 || 켠뒤.indexOf(n) < 0; });
  ok("범례 글자에 진짜 시·고·저·종이 다 있다", 빠진것.length === 0, 빠진것.join(","));

  /* 변동(종가 - 시가)도 진짜 값 기준이어야 합니다 */
  const 진짜변동 = 봉들[2].close - 봉들[2].open;
  const 평균변동 = HA[2].close - HA[2].open;
  ok("변동이 진짜 값으로 계산돼 있다 (평균값으로 계산한 값이 아니다)",
    켠뒤.indexOf(String(Math.abs(진짜변동))) >= 0 &&
      켠뒤.indexOf(String(Math.abs(평균변동))) < 0,
    "진짜 " + 진짜변동 + " / 평균 " + 평균변동);
  t.닫기();
}
{
  /* App.Bus 로 들어오는 실시간 봉도 진짜 값이어야 합니다 */
  const t = 띄우기();
  t.눌러고르기("heikin");
  const 새봉 = { time: 4, open: 97, high: 133, low: 91, close: 129 };
  t.win.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: 새봉 });
  const 글자 = t.범례글자() || "";
  const 빠진것 = [새봉.open, 새봉.high, 새봉.low, 새봉.close]
    .map(String).filter(function (n) { return 글자.indexOf(n) < 0; });
  ok("실시간으로 들어온 봉도 진짜 값 그대로 나온다", 빠진것.length === 0,
    빠진것.join(",") + " / 글자=" + 글자);

  const 통째 = 하이킨아시참조(봉들.concat([새봉]));
  ok("실시간 봉에도 평균값이 안 섞인다",
    글자.indexOf(String(통째[3].close)) < 0 && 글자.indexOf(String(통째[3].open)) < 0,
    글자);
  t.닫기();
}
{
  /* [2-0] 단추를 누른 것과 setType() 을 부른 것이 같은 결과여야 합니다.
     같지 않으면 다른 봉인들이 setType 으로 재는 것이 헛검사가 됩니다. */
  const a = 띄우기();
  a.눌러고르기("heikin");
  const b = 띄우기();
  b.CT.setType("heikin");
  ok("단추를 누른 것과 setType('heikin') 이 같은 종류가 된다",
    a.CT.getType() === b.CT.getType(), a.CT.getType() + " / " + b.CT.getType());
  ok("단추를 누른 것과 setType 이 같은 종류의 시리즈를 얹는다",
    (a.CT.getSeriesForTest().overlay || {}).__종류 ===
      (b.CT.getSeriesForTest().overlay || {}).__종류);
  ok("단추를 누르면 저장까지 된다 (새로고침해도 남는다)",
    !!a.저장소["chart-candle-type"] && a.저장소["chart-candle-type"].type === "heikin",
    JSON.stringify(a.저장소));
  a.닫기(); b.닫기();
}

/* =========================================================================
 * [3] 오른쪽 축·현재가 자리에 평균값을 찍지 않는다
 * ========================================================================= */
절("[3] 오른쪽 축에 평균값을 안 찍는다");
{
  const t = 띄우기();
  t.눌러고르기("heikin");
  const 얹은것 = t.CT.getSeriesForTest().overlay;
  ok("평균낸 봉이 마지막 값을 축에 안 찍는다 (lastValueVisible=false)",
    !!얹은것 && 얹은것.__opts.lastValueVisible === false, String(얹은것 && 얹은것.__opts.lastValueVisible));
  ok("평균낸 봉이 자기 가격선을 안 그린다 (priceLineVisible=false)",
    !!얹은것 && 얹은것.__opts.priceLineVisible === false, String(얹은것 && 얹은것.__opts.priceLineVisible));
  ok("평균낸 봉이 가로선을 하나도 안 만들었다 (createPriceLine 0회)",
    !!얹은것 && 얹은것.__가로선.length === 0, String(얹은것 && 얹은것.__가로선.length));
  ok("진짜 캔들의 현재가 표시는 그대로 켜져 있다 (끄면 회원이 현재가를 못 봅니다)",
    t.진짜캔들.options().lastValueVisible !== false &&
      t.진짜캔들.options().priceLineVisible !== false,
    JSON.stringify({ l: t.진짜캔들.options().lastValueVisible, p: t.진짜캔들.options().priceLineVisible }));

  /* 평균낸 봉을 얹는 종류 전부에 같은 규칙이 걸려야 합니다 */
  ["highlow", "heikin"].forEach(function (k) {
    t.눌러고르기("candle");
    t.눌러고르기(k);
    const s = t.CT.getSeriesForTest().overlay;
    ok(k + " 로 얹은 시리즈도 축에 값을 안 찍는다",
      !!s && s.__opts.lastValueVisible === false && s.__opts.priceLineVisible === false,
      JSON.stringify(s && s.__opts));
  });
  t.닫기();
}

/* =========================================================================
 * [4] 진짜 캔들을 ★한 번도★ 지우지 않는다 — 10종을 세 바퀴 눌러 본다
 *   진입가·청산가·미체결 가로선이 거기 매달려 있습니다. 갈아끼우면 전부 떨어집니다.
 * ========================================================================= */
절("[4] 10종을 세 바퀴 눌러도 진짜 캔들이 그대로다");
{
  const t = 띄우기();
  const 종류들 = t.CT.TYPES.map(function (x) { return x.k; });
  ok("고를 수 있는 종류가 10가지다 (트레이딩뷰 Chart style 그대로)",
    종류들.length === 10, 종류들.join(","));

  const 처음시리즈수 = t.pane.getSeries().length;
  const 어긋난것 = [];
  for (let 바퀴 = 0; 바퀴 < 3; 바퀴++) {
    종류들.forEach(function (k) {
      const 왜 = t.눌러고르기(k);
      if (왜) { 어긋난것.push(k + ":" + 왜); return; }
      if (t.첫캔들() !== t.진짜캔들) 어긋난것.push(k + ":첫캔들이 바뀜");
      if (t.기록.지운것.indexOf(t.진짜캔들) >= 0) 어긋난것.push(k + ":진짜캔들을 지움");
      if (!t.진입가선.__살아있음 || !t.청산가선.__살아있음) 어긋난것.push(k + ":가로선이 떨어짐");
    });
  }
  ok("10종 x 3바퀴(30번) 눌러도 어긋난 곳이 하나도 없다",
    어긋난것.length === 0, 어긋난것.slice(0, 5).join(" / "));
  ok("진짜 캔들 객체가 처음 그것 그대로다", t.첫캔들() === t.진짜캔들);
  ok("removeSeries 대상에 진짜 캔들이 한 번도 없었다",
    t.기록.지운것.indexOf(t.진짜캔들) === -1, String(t.기록.지운것.length) + "개 지움");
  ok("진입가·청산가 가로선이 둘 다 살아 있다",
    t.진입가선.__살아있음 && t.청산가선.__살아있음);
  ok("removePriceLine 이 한 번도 안 불렸다 (붙어 있던 선을 안 건드렸다)",
    t.기록.지운가로선.length === 0, String(t.기록.지운가로선.length));

  t.눌러고르기("candle");
  ok("다 돌고 캔들로 돌아오면 시리즈 수가 처음과 같다 (얹은 것이 안 쌓인다)",
    t.pane.getSeries().length === 처음시리즈수,
    t.pane.getSeries().length + " != " + 처음시리즈수);
  /* 만든것에는 js/chart.js 몫인 진짜 캔들 1개가 들어 있습니다 — 그건 빼고 셉니다 */
  const 우리가만든것 = t.기록.만든것.filter(function (s) { return s !== t.진짜캔들; });
  ok("우리가 얹은 것은 만든 수와 지운 수가 맞아떨어진다 (한 개도 안 남는다)",
    우리가만든것.length === t.기록.지운것.length && 우리가만든것.length > 0,
    "만든 " + 우리가만든것.length + " / 지운 " + t.기록.지운것.length);
  t.닫기();
}

/* =========================================================================
 * [5] 안내줄이 ★화면에 진짜로★ 있다
 *   "주석에만 있어도 통과" 하는 봉인이 실제로 있었습니다. 그래서 여기서는
 *   소스 글자를 안 봅니다 — 만들어진 DOM 과 ★실제로 넣은 <style> 내용★ 만 봅니다.
 * ========================================================================= */
절("[5] 안내줄이 화면에 진짜로 있다 (소스 글자가 아니라 DOM 으로)");
{
  const t = 띄우기();
  t.눌러고르기("heikin");
  const n = t.안내줄();
  ok("하이킨아시일 때 안내줄이 만들어진다", !!n);
  ok("안내줄이 문서에 실제로 붙어 있다 (isConnected)", !!n && n.isConnected === true);
  let 뿌리 = n;
  let 깊이 = 0;
  while (뿌리 && 뿌리.parentNode && 깊이 < 50) { 뿌리 = 뿌리.parentNode; 깊이++; }
  ok("부모를 타고 올라가면 문서에 닿는다 (떠 있는 조각이 아니다)",
    뿌리 === t.win.document, 뿌리 && 뿌리.nodeName);
  ok("안내줄에 글자가 실제로 들어 있다", !!n && n.textContent.trim().length >= 10,
    n && n.textContent);
  ok("안내줄이 '평균' 이라고 말한다", !!n && n.textContent.indexOf("평균") >= 0);
  ok("안내줄이 '실제 가격' 이라고 말한다", !!n && n.textContent.indexOf("실제 가격") >= 0);
  ok("안내줄이 청산가·진입가를 콕 집어 말한다",
    !!n && n.textContent.indexOf("청산가") >= 0 && n.textContent.indexOf("진입가") >= 0,
    n && n.textContent);

  /* 자리 — .tlc-body(차트) ★앞★ 이어야 차트를 안 덮습니다 */
  const body = t.win.document.querySelector(".chart-panel .tlc-body");
  ok("안내줄이 차트(.tlc-body) 앞에 있다 (겹쳐 덮지 않는다)",
    !!n && !!body && n.parentNode === body.parentNode &&
      Array.prototype.indexOf.call(n.parentNode.children, n) <
      Array.prototype.indexOf.call(n.parentNode.children, body));

  /* 실제로 넣은 스타일에서 글씨 크기를 읽습니다 (소스 정규식이 아닙니다) */
  const 스타일들 = t.win.document.querySelectorAll("style");
  let 규칙 = "";
  for (let i = 0; i < 스타일들.length; i++) {
    const m = 스타일들[i].textContent.match(new RegExp("#" + t.CT.NOTICE_ID + "\\s*\\{([^}]*)\\}"));
    if (m) { 규칙 = m[1]; break; }
  }
  ok("안내줄 스타일 규칙을 실제로 <style> 에 넣었다", 규칙.length > 0, "규칙을 못 찾았습니다");
  const 크기 = Number((규칙.match(/font-size:\s*(\d+)px/) || [])[1] || 0);
  ok("안내줄 글씨가 17px 이상이다 (대표가 작은 글씨를 못 읽습니다)", 크기 >= 17, 크기 + "px");
  ok("안내줄을 display:none 으로 숨기지 않았다", !/display\s*:\s*none/.test(규칙), 규칙);
  ok("안내줄 글자색이 확정 팔레트 안이다",
    /color:\s*#(F0B429|E7ECF5|838DA4)/i.test(규칙), 규칙);

  /* SYNTHETIC 인 종류에서만 떠야 합니다 — 10종 전부 확인 */
  const 어긋남 = [];
  t.CT.TYPES.map(function (x) { return x.k; }).forEach(function (k) {
    t.눌러고르기(k);
    const 있나 = !!t.안내줄();
    const 있어야 = !!t.CT.SYNTHETIC[k];
    if (있나 !== 있어야) 어긋남.push(k + "(있나=" + 있나 + " 있어야=" + 있어야 + ")");
  });
  ok("평균낸 봉일 때만 안내줄이 뜬다 — 10종 전부 확인", 어긋남.length === 0, 어긋남.join(","));
  ok("평균낸 봉으로 표시된 것은 하이킨아시 하나뿐이다",
    Object.keys(t.CT.SYNTHETIC).length === 1 && t.CT.SYNTHETIC.heikin === true,
    JSON.stringify(t.CT.SYNTHETIC));

  t.눌러고르기("candle");
  ok("캔들로 돌아오면 안내줄이 문서에서 빠진다", !t.안내줄(), "아직 남아 있습니다");
  t.닫기();
}

/* =========================================================================
 * [6] 등록 · 되돌리기
 * ========================================================================= */
절("[6] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-ha-real-price-seal.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌립니다");
  const 나 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", 나.indexOf("되돌리는 방법") >= 0);
}


/* ===================================================================== */
절("[7] ★px 말고 다른 단위로 우회하지 않았는가★");
{
/* ⚠️ 2026-09-04 기록팀 — ★이 파일의 글씨 검사들이 px 라고 적힌 것만 셌습니다.★
     1.0625rem(=17px) · 1em · 120% · 13pt · 4vw · calc() · clamp() 로 적으면
     바닥값 검사를 통째로 빠져나갑니다. 대표가 글씨 크기로 네 번 지적하신 자리입니다.

     ★실측 (2026-09-04, 사본에서 · 진짜 파일은 안 건드렸습니다)★
       js/chart-indicator-kit.js 사본의 .tl-kit-btn 맨 앞에
           font-size:clamp(11px, 2vw, 17px)   ← 360 에서는 11px 로 그려집니다
       를 끼웠더니, 옛 검사는 ★옆 규칙의 17px 을 대신 읽어★ "17px" 이라 보고하고
       그대로 초록이었습니다. 0.6875rem(=11px) 도 똑같이 17 로 읽혔습니다.
       17px 미만 개수 검사도 원본 0 · clamp 사본 0 · rem 사본 0 으로 같았습니다.

     ★환산이 아니라 "px 로만 적어라" 로 못 박은 이유★ — rem·em·%·vw·ch·clamp 는
     화면·부모·글꼴·회원 브라우저 설정에 따라 달라져 정적으로 px 을 못 냅니다.
     우리 규칙은 ★가장 좁은 360 에서도 17px★ 이라, 좁아지면 작아지는 표기는
     애초에 쓰면 안 되는 것입니다. 자세한 근거는 tests/_font-size.js 머리말.

     판정은 tests/_font-size.js 한 곳에만 있습니다. 아래 자체검증 줄을 같이 두어,
     그 한 곳을 헐겁게 고쳐 봉인 9개를 한꺼번에 눈멀게 하는 것을 막습니다. */
  const 검 = 글씨단위.자체검증();
  ok("단위 판정기가 표본 " + 검.표본수 + "개를 다 맞춘다 (tests/_font-size.js)",
    검.전부통과, 검.설명);

  /* [5] 가 안내줄 글씨를 <style> 에서 읽어 17px 이상인지 봅니다.
     이 봉인이 태우는 두 모듈 전체에 다른 단위가 새로 생기는 것을 여기서 막습니다. */
  let 선언합 = 0;
  ["chart-candle-type.js", "chart-ohlc-legend.js"].forEach(function (f) {
    const src = fs.readFileSync(path.join(REPO, "js", f), "utf8");
    선언합 += 글씨단위.선언들(src).length;
    const 위반 = 글씨단위.단위위반(src);
    ok(f + " 의 font-size 를 px 로만 적었다", 위반.length === 0, 글씨단위.요약(위반));
  });
  ok("두 모듈에서 font-size 선언을 2개 이상 읽었다 (" + 선언합 + "개)", 선언합 >= 2);
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n  실패한 것:");
  실패목록.forEach(function (s) { console.log("   - " + s); });
}
process.exit(fail ? 1 : 0);
