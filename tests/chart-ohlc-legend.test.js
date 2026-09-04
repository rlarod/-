/* tests/chart-ohlc-legend.test.js
 * =========================================================================
 * 십자선 O·H·L·C 범례 — 이 모듈에 봉인이 ★하나도 없었습니다★
 * =========================================================================
 * 2026-09-02 밤 · 기록팀
 *   대상: js/chart-ohlc-legend.js (App.ChartOhlcLegend) — 커밋 5f015e6
 *
 * ── 왜 지금 만드나 ─────────────────────────────────────────────────────
 *   오늘 밤 배포된 여덟 건 중 이 모듈만 자기 봉인이 없었습니다.
 *   tests/ 를 통째로 훑어도 chart-ohlc-legend 를 부르는 파일이
 *   tests/chart-candle-type-seal.test.js 의 ★주석 한 줄★ 뿐이었습니다.
 *
 *   이 줄은 회원이 ★가격을 읽는 자리★ 입니다. 숫자가 틀리면 회원이 그 값으로
 *   지정가·손절을 적습니다. 오류도 안 나고 화면도 멀쩡합니다(조용한 고장).
 *
 * ── 여기서 ★안 보는 것★ (두 벌 금지) ──────────────────────────────────
 *   · "하이킨아시를 켜도 범례가 진짜 값을 보여주는가"
 *     -> tests/chart-ha-real-price-seal.test.js 한 곳입니다. 여기서 또 안 봅니다.
 *   · 시간대 기본값("내 컴퓨터 시간")
 *     -> tests/chart-bottombar.test.js [4] 한 곳입니다.
 *
 * ── ⭐ 아직 안 만든 것을 "안 만들었다" 고 못 박습니다 ([5] 절) ─────────
 *   이 줄에는 ★시각이 없습니다.★ O·H·L·C 와 변동뿐입니다.
 *   그래서 지금은 차트 표시 시간대(js/chart-timezone.js)와 부딪힐 일이 없습니다.
 *   ★나중에 누가 이 줄에 시각을 넣으면 [5] 가 실패합니다.★
 *   그때 이 글을 읽고 시간대 변환을 같이 붙이면 됩니다. 안 붙이면 차트 축은
 *   회원이 고른 시간대인데 이 줄만 다른 시간대가 되어, 회원이 체결 시각의 봉을
 *   엉뚱한 자리에서 찾습니다(같은 종류의 사고가 2026-09-02 에 실제로 있었습니다 —
 *   그때는 축이 UTC 라 거래내역과 9시간 어긋났습니다).
 *
 * ── 변동은 ★종가 − 시가★ 입니다 (앞 봉 종가가 아닙니다) ───────────────
 *   모듈 주석에 트레이딩뷰 실측이 적혀 있습니다 —
 *       O 77,439.01 … C 76,826.46  →  −612.54 (−0.79%)
 *       76,826.46 − 77,439.01 = −612.55 ≈ −612.54
 *   아래 [2] 는 그 숫자를 박지 않고 ★참조식★ 으로 매번 다시 계산해 대조합니다.
 *   앞 봉 종가로 계산하면 부호가 봉 색과 어긋나 회원이 고장으로 봅니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 줄과 이 파일을 지우면 됩니다.
 *   사이트 코드는 한 글자도 건드리지 않습니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-ohlc-legend.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
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

/* 참조식 — 트레이딩뷰 실측대로 "종가 − 시가" 입니다 */
function 변동참조(b) {
  const 차 = b.close - b.open;
  return { 차: 차, 퍼센트: b.open ? (차 / b.open) * 100 : 0 };
}

const 봉들 = [
  { time: 1, open: 100, high: 110, low: 90, close: 105 },
  { time: 2, open: 200, high: 260, low: 190, close: 240 },
  { time: 3, open: 300, high: 320, low: 250, close: 270 }
];

/* =========================================================================
 * 가짜 차트 한 벌
 * ========================================================================= */
function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"tlc-toolbar\"></div>" +
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

  function 시리즈(종류, o) {
    const s = {
      __종류: 종류, __opts: o || {}, __data: [],
      seriesType: function () { return 종류; },
      options: function () { return s.__opts; },
      applyOptions: function () { return true; },
      setData: function (d) { s.__data = d; return true; },
      update: function () { return true; },
      data: function () { return s.__data; },
      createPriceLine: function (x) { return { o: x }; },
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
      return s;
    },
    removeSeries: function () {},
    subscribeCrosshairMove: function (f) { chart.__십자선 = f; },
    timeScale: function () {
      return {
        subscribeVisibleLogicalRangeChange: function () {},
        subscribeVisibleTimeRangeChange: function () {},
        getVisibleLogicalRange: function () { return null; }
      };
    },
    applyOptions: function () {},
    priceScale: function () { return { applyOptions: function () {} }; }
  };
  win.LightweightCharts = { CandlestickSeries: { __종류: "Candlestick" } };

  const 캔들 = chart.addSeries(win.LightweightCharts.CandlestickSeries, {});
  캔들.setData(봉들);

  let 통화 = "USDT";
  const 듣는이 = {};
  const 그린횟수 = { n: 0 };
  win.App = {
    ChartFont: { getCharts: function () { return [chart]; } },
    Config: {
      getActiveSymbol: function () { return "BTCUSDT"; },
      getActiveInterval: function () { return "1m"; },
      getDisplayCurrency: function () { return 통화; }
    },
    Bus: {
      on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
      emit: function (n, p) { (듣는이[n] || []).forEach(function (f) { f(p); }); }
    },
    Storage: { load: function (k, d) { return d; }, save: function () {} },
    Utils: {
      formatCurrencyPlain: function (v) {
        그린횟수.n++;
        return 통화 === "KRW" ? String(Math.round(v * 1300)) + "원" : String(v);
      }
    }
  };

  win.eval(SRC);
  const ev = win.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  win.document.dispatchEvent(ev);
  지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });

  const t = {
    win: win, dom: dom, chart: chart, 캔들: 캔들, 듣는이: 듣는이, 그린횟수: 그린횟수,
    M: win.App.ChartOhlcLegend,
    통화바꾸기: function (v) { 통화 = v; win.App.Bus.emit("currency:change", { currency: v }); },
    줄: function () { return win.document.querySelector("." + win.App.ChartOhlcLegend.EL_CLASS); },
    글자: function () {
      const el = win.document.querySelector("." + win.App.ChartOhlcLegend.EL_CLASS);
      return el ? el.textContent : null;
    },
    십자선: function (봉) {
      const 지도 = new win.Map();
      if (봉) 지도.set(캔들, 봉);
      chart.__십자선({ time: 봉 ? 봉.time : undefined, seriesData: 지도 });
    },
    닫기: function () { dom.window.close(); }
  };
  return t;
}

console.log("\n십자선 O·H·L·C 범례 (js/chart-ohlc-legend.js)");

/* =========================================================================
 * [0] 수정 금지 파일 · 실려 있나 · git 에 있나
 * ========================================================================= */
절("[0] 수정 금지 파일과 배포 상태");
{
  Object.keys(L.잠긴11).forEach(function (p) {
    const f = p.replace(/^js\//, "");
    ok(p + " 를 한 글자도 안 고쳤다", md5(f) === L.잠긴11[p], md5(f));
  });
  ok("js/trading.js 가 결재된 그 해시 그대로다", md5("trading.js") === L.TRADING, md5("trading.js"));

  const 부름 = '<script src="' + MOD + '"></script>';
  ok("index.html 이 이 모듈을 부른다", HTML.indexOf(부름) !== -1);
  ok("한 줄만 실린다 (두 번 실리면 줄이 두 개 생깁니다)",
    HTML.split(부름).length - 1 === 1, String(HTML.split(부름).length - 1));
  ok("js/chart.js 뒤에서 부른다 (차트가 만들어진 뒤에 붙습니다)",
    HTML.indexOf(부름) > HTML.indexOf('<script src="js/chart.js"></script>'));

  /* 디스크엔 있는데 git 엔 없는 파일 — clone 한 PC 에서만 빈 링크가 됩니다 */
  let 추적됨 = false;
  try {
    추적됨 = execFileSync("git", ["ls-files", "--error-unmatch", MOD],
      { cwd: REPO, encoding: "utf8" }).trim() === MOD;
  } catch (e) { 추적됨 = false; }
  ok(MOD + " 가 git 에 올라가 있다 (fs.existsSync 로는 못 잡는 자리입니다)", 추적됨);
}

/* =========================================================================
 * [1] 줄이 차트를 안 덮고 자기 자리를 차지한다
 * ========================================================================= */
절("[1] 줄이 붙는 자리");
{
  const t = 띄우기();
  const el = t.줄();
  ok("줄이 만들어진다", !!el);
  ok("문서에 실제로 붙어 있다", !!el && el.isConnected === true);

  const body = t.win.document.querySelector(".chart-panel .tlc-body");
  ok("차트(.tlc-body) ★앞★ 에 있다 (겹쳐 덮지 않고 자기 줄을 씁니다)",
    !!el && !!body && el.parentNode === body.parentNode &&
      Array.prototype.indexOf.call(el.parentNode.children, el) <
      Array.prototype.indexOf.call(el.parentNode.children, body));

  ok("무슨 줄인지 읽어 주는 이름표가 있다",
    !!el && (el.getAttribute("aria-label") || "").length > 0, el && el.getAttribute("aria-label"));

  /* 이름표는 트레이딩뷰와 같은 O H L C 네 개 */
  const 이름표 = Array.prototype.map.call(el.querySelectorAll(".k"),
    function (x) { return x.textContent; });
  ok("이름표가 O H L C 네 개다 (트레이딩뷰와 같은 순서)",
    이름표.join("") === "OHLC", 이름표.join(""));

  ok("차트를 잡았고 십자선을 걸었다",
    t.M.getStateForTest().subscribed === true && !!t.M.getStateForTest().candle);
  t.닫기();
}

/* =========================================================================
 * [2] 변동은 ★종가 − 시가★ 다 (앞 봉 종가가 아니다)
 * ========================================================================= */
절("[2] 변동 계산 — 참조식으로 매번 다시 계산해 대조");
{
  const t = 띄우기();
  봉들.forEach(function (b, i) {
    t.십자선(b);
    const 글 = t.글자() || "";
    const r = 변동참조(b);
    const 앞봉기준 = i > 0 ? b.close - 봉들[i - 1].close : null;

    ok("봉 " + (i + 1) + " — 시·고·저·종이 다 나온다",
      [b.open, b.high, b.low, b.close].every(function (v) { return 글.indexOf(String(v)) >= 0; }),
      글);
    ok("봉 " + (i + 1) + " — 변동이 (종가 − 시가) = " + r.차 + " 다",
      글.indexOf(String(Math.abs(r.차))) >= 0, 글);
    ok("봉 " + (i + 1) + " — 퍼센트가 시가 기준이다 (" + r.퍼센트.toFixed(2) + "%)",
      글.indexOf(Math.abs(r.퍼센트).toLocaleString("ko-KR",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%") >= 0, 글);
    if (앞봉기준 !== null && Math.abs(앞봉기준) !== Math.abs(r.차)) {
      ok("봉 " + (i + 1) + " — ★앞 봉 종가 기준(" + 앞봉기준 + ")이 아니다★",
        글.indexOf(String(Math.abs(앞봉기준))) < 0, 글);
    }
  });

  /* 부호 — 오를 때 +, 내릴 때 진짜 빼기 기호(U+2212) */
  t.십자선(봉들[1]);           /* 200 -> 240 : 오름 */
  ok("오른 봉에는 + 가 붙는다", (t.글자() || "").indexOf("+") >= 0, t.글자());
  t.십자선(봉들[2]);           /* 300 -> 270 : 내림 */
  ok("내린 봉에는 진짜 빼기 기호(−)를 쓴다", (t.글자() || "").indexOf("−") >= 0, t.글자());
  t.닫기();
}

/* =========================================================================
 * [3] 십자선이 차트 밖이면 마지막 봉으로 돌아간다 (트레이딩뷰와 같음)
 * ========================================================================= */
절("[3] 십자선이 차트 밖일 때");
{
  const t = 띄우기();
  t.십자선(봉들[0]);
  const 짚은것 = t.글자();
  t.십자선(null);                            /* 차트 밖 */
  const 밖 = t.글자();
  ok("차트 밖으로 나가면 짚고 있던 봉을 그만 보여준다", 밖 !== 짚은것, 밖 + " / " + 짚은것);

  const 마지막 = 봉들[봉들.length - 1];
  ok("차트 밖이면 마지막 봉을 보여준다",
    [마지막.open, 마지막.high, 마지막.low, 마지막.close]
      .every(function (v) { return (밖 || "").indexOf(String(v)) >= 0; }), 밖);

  /* 실시간 봉이 들어오면 그것이 마지막 봉이 됩니다 */
  const 새봉 = { time: 4, open: 400, high: 460, low: 380, close: 450 };
  t.win.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: 새봉 });
  ok("실시간 봉이 들어오면 그 값으로 바뀐다",
    (t.글자() || "").indexOf(String(새봉.high)) >= 0, t.글자());

  /* 다른 종목의 시세는 무시해야 합니다 */
  t.win.App.Bus.emit("kline:update", {
    symbol: "ETHUSDT", candle: { time: 5, open: 1, high: 2, low: 0.5, close: 1.5 }
  });
  ok("다른 종목 시세는 무시한다 (종목을 섞으면 회원이 남의 값을 봅니다)",
    (t.글자() || "").indexOf(String(새봉.high)) >= 0, t.글자());
  t.닫기();
}

/* =========================================================================
 * [4] 통화를 바꾸면 다시 그린다 · 같은 값이면 화면을 안 건드린다
 * ========================================================================= */
절("[4] 통화 바꾸기 · 헛일 안 하기");
{
  const t = 띄우기();
  t.십자선(봉들[2]);
  const 달러 = t.글자();
  t.통화바꾸기("KRW");
  const 원화 = t.글자();
  ok("통화를 바꾸면 표기가 같이 바뀐다", 원화 !== 달러 && (원화 || "").indexOf("원") >= 0,
    달러 + " -> " + 원화);
  t.통화바꾸기("USDT");
  ok("되돌리면 원래 표기로 돌아온다", t.글자() === 달러, t.글자());

  /* 값이 그대로면 화면을 안 건드립니다 (십자선은 마우스마다 불립니다) */
  t.십자선(봉들[2]);
  const 전 = t.그린횟수.n;
  for (let i = 0; i < 20; i++) t.십자선(봉들[2]);
  ok("같은 봉을 스무 번 더 짚어도 다시 안 그린다 (" + (t.그린횟수.n - 전) + "회)",
    t.그린횟수.n === 전, String(t.그린횟수.n - 전));
  t.닫기();
}

/* =========================================================================
 * [5] ⭐ 아직 안 만든 것 — 이 줄에는 ★시각이 없습니다★
 *   넣는 순간 차트 표시 시간대(js/chart-timezone.js)와 같이 붙여야 합니다.
 * ========================================================================= */
절("[5] 시간대 <-> 범례 — 지금은 시각을 안 보여준다 (넣으면 여기서 알려 줍니다)");
{
  const t = 띄우기();
  t.십자선(봉들[2]);
  const 글 = t.글자() || "";
  ok("범례 글자에 시각(00:00 꼴)이 없다", !/\d{1,2}:\d{2}/.test(글), 글);
  ok("이름표에 T·시간 같은 시각 칸이 없다",
    Array.prototype.map.call(t.줄().querySelectorAll(".k"),
      function (x) { return x.textContent; }).join("") === "OHLC",
    Array.prototype.map.call(t.줄().querySelectorAll(".k"),
      function (x) { return x.textContent; }).join(""));
  /* ⚠️ toLocaleString 은 ★숫자★ 에도 씁니다 — 실제로 이 모듈이 퍼센트를
     toLocaleString("ko-KR", …) 으로 찍습니다. 그것까지 막으면 오탐입니다.
     (처음에 넓게 잡았다가 실제로 이 자리에서 헛걸렸습니다)
     그래서 ★날짜·시각 전용★ 함수만 겨눕니다. */
  ok("모듈이 시각을 만드는 함수를 안 쓴다 (Date · toLocale*Time/Date · Intl.DateTimeFormat)",
    !/toLocaleTimeString|toLocaleDateString|Intl\.DateTimeFormat|new\s+Date\s*\(/.test(CODE),
    "시각을 넣었다면 App.ChartTimezone 의 시간대를 같이 써야 합니다");
  ok("모듈이 App.ChartTimezone 을 아직 안 쓴다 (쓸 일이 없어야 정상)",
    CODE.indexOf("ChartTimezone") < 0,
    "시각을 넣으려면 이 검사와 위 두 검사를 같이 새 기준으로 바꾸세요");

  /* 시간대를 바꿔도 이 줄은 아무 영향이 없어야 합니다 */
  const 전 = t.글자();
  t.win.App.Bus.emit("timezone:change", { zone: "UTC" });
  ok("시간대를 바꿔도 범례 값이 안 흔들린다", t.글자() === 전, 전 + " -> " + t.글자());
  t.닫기();
}

/* =========================================================================
 * [6] 글씨·색 — 대표가 작은 글씨를 못 읽습니다
 * ========================================================================= */
절("[6] 글씨와 색");
{
  const t = 띄우기();
  const 스타일 = t.win.document.getElementById(t.M.STYLE_ID);
  const css = 스타일 ? 스타일.textContent : "";
  ok("스타일을 실제로 <style> 에 넣었다", css.length > 0);

  const 크기들 = (css.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) || [])
    .map(function (s) { return parseFloat(s.replace(/[^\d.]/g, "")); });
  ok("글씨 크기를 읽었다 (" + 크기들.join(",") + ")", 크기들.length >= 1);
  ok("가장 작은 글씨가 17px 이상이다 (트레이딩뷰 13px 을 천장으로 쓰지 않습니다)",
    크기들.length > 0 && Math.min.apply(null, 크기들) >= 17,
    String(Math.min.apply(null, 크기들)));

  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B",
    "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 쓴색 = Array.from(new Set((css.match(/#[0-9A-Fa-f]{6}/g) || [])
    .map(function (h) { return h.toUpperCase(); })));
  ok("확정 팔레트 밖의 색을 안 쓴다 (" + 쓴색.join(",") + ")",
    쓴색.every(function (h) { return 팔레트.indexOf(h) >= 0; }),
    쓴색.filter(function (h) { return 팔레트.indexOf(h) < 0; }).join(","));
  ok("빨강은 하락색 하나만 쓴다 (새 빨강을 만들지 않는다)",
    쓴색.filter(function (h) { return h === "#F0506E"; }).length <= 1);

  /* 그림자를 쓰지 않습니다 (확정 규칙) */
  ok("그림자를 쓰지 않는다", !/box-shadow\s*:\s*(?!none)/.test(css), css.slice(0, 80));

  /* 화면에 나가는 글자에 그림문자를 쓰지 않습니다 */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu;
  const 찾음 = (CODE.match(EMOJI) || []);
  ok("화면에 나가는 글자에 이모지가 없다", 찾음.length === 0, 찾음.join(" "));
  t.닫기();
}

/* =========================================================================
 * [7] 끄는 방법이 있다 (되돌리기)
 * ========================================================================= */
절("[7] 되돌릴 수 있다");
{
  const t = 띄우기();
  ok("disable() 이 있다", typeof t.M.disable === "function");
  t.M.disable();
  ok("끄면 줄이 사라진다", !t.줄());
  ok("끄면 스타일도 사라진다", !t.win.document.getElementById(t.M.STYLE_ID));
  ok("끈 뒤에 시세가 들어와도 오류가 안 난다", (function () {
    try {
      t.win.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: 봉들[0] });
      return true;
    } catch (e) { return false; }
  })());
  t.닫기();
}

/* =========================================================================
 * [8] 등록
 * ========================================================================= */
절("[8] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-ohlc-legend.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌립니다");
  const 나 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", 나.indexOf("되돌리는 방법") >= 0);
}


/* ===================================================================== */
절("[9] ★px 말고 다른 단위로 우회하지 않았는가★");
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

  /* [6] 이 실제로 넣은 <style> 에서 크기를 읽어 17px 바닥을 봅니다.
     ⚠️ 거기 정규식은 px 만 셉니다 — clamp 로 적으면 ★그 선언이 없는 것★ 이 되어
        다른 규칙 값만으로 "가장 작은 글씨 17px" 이 되고 그대로 초록입니다.
     그래서 소스와 ★실제로 넣은 <style>★ 을 둘 다 단위로 봅니다. */
  const 위반S = 글씨단위.단위위반(SRC);
  ok("chart-ohlc-legend.js 의 font-size 를 px 로만 적었다",
    위반S.length === 0, 글씨단위.요약(위반S));
  const tU = 띄우기();
  const 스타일U = tU.win.document.getElementById(tU.M.STYLE_ID);
  const cssU = 스타일U ? 스타일U.textContent : "";
  const 선언수U = 글씨단위.선언들(cssU).length;
  ok("실제로 넣은 <style> 에서 font-size 선언을 하나 이상 읽었다 (" + 선언수U + "개)",
    선언수U >= 1, "스타일이 안 들어갔습니다");
  const 위반C = 글씨단위.단위위반(cssU);
  ok("실제로 넣은 <style> 도 px 로만 적혀 있다", 위반C.length === 0, 글씨단위.요약(위반C));
  tU.닫기();
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n  실패한 것:");
  실패목록.forEach(function (s) { console.log("   - " + s); });
}
process.exit(fail ? 1 : 0);
