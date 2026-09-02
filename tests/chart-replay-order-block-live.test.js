/* tests/chart-replay-order-block-live.test.js
 * =========================================================================
 * 돈에 닿는 봉인 — 리플레이 중 주문 막기를 ★실제로 눌러서★ 확인합니다
 * =========================================================================
 * 2026-09-02 밤 · 기록팀
 *   대상: js/chart-replay.js (App.ChartReplay)
 *
 * ── 왜 또 만드나 (tests/chart-replay.test.js 가 이미 있는데) ────────────
 *   먼저 있던 봉인은 ★소스 글자(정규식)★ 로 봅니다 —
 *       ok("주문 함수를 감싼다 — openPosition", CODE.indexOf('"openPosition"') >= 0)
 *       ok("리플레이 중이면 주문을 거부하고 null 을 돌려준다",
 *          /if\s*\(state\.on\)\s*\{[^]{0,240}return null;/.test(CODE))
 *   글자가 남아 있어도 ★실제로는 안 막힐 수 있습니다★ —
 *     · installOrderGuard() 를 부르는 자리가 사라져도 글자는 그대로입니다
 *     · App.Trading 이 늦게 실려 감싸기가 통째로 건너뛰어도 글자는 그대로입니다
 *     · 남이 나중에 App.Trading.openPosition 을 다시 감싸도 글자는 그대로입니다
 *   그래서 이 파일은 ★진짜로 리플레이를 켜고 주문 함수를 불러 봅니다.★
 *
 * ── 무엇이 걸린 일인가 ─────────────────────────────────────────────────
 *   리플레이는 ★과거 화면★ 입니다. 그런데 주문·호가·손익은 ★지금 가격★ 으로 돕니다.
 *   회원이 과거 가격을 보면서 시장가를 누르면 생각과 다른 값에 체결됩니다.
 *   트레이딩뷰는 이걸 안 막지만(고객센터 원문: "orders ... are executed based on
 *   real-time data") 우리는 거래 사이트이고, 바이낸스 거래화면에는 리플레이가
 *   아예 없습니다. 그래서 우리는 막습니다. ★회원 돈★ 입니다.
 *
 * ── ⚠️ 순서에 기대는 자리 (PM 실측 2026-09-02) ─────────────────────────
 *   index.html 에서
 *       1269  js/chart-replay.js      (여기서 App.Trading 의 함수 5개를 감쌉니다)
 *       1316  js/tpsl-guard.js        (그 위를 다시 감쌉니다)
 *   ★두 줄의 순서가 바뀌면 조용히 뚫릴 수 있습니다.★ 오류도 안 나고 화면도 멀쩡합니다.
 *   그래서 [2] 는 ★두 순서를 다 태워 보고★, 어느 쪽이든 막히는지를 봅니다.
 *   순서 자체를 못 박는 것이 아니라 ★순서와 무관하게 막히는지★ 를 못 박습니다 —
 *   그래야 나중에 누가 순서를 바꿔도 회원이 안 다칩니다.
 *
 * ── 무엇을 새로 못 박나 ────────────────────────────────────────────────
 *   [2] 주문 함수 5개가 실린 순서와 무관하게 막힌다 (원래 함수 호출 0회)
 *   [3] 리플레이 중 App.Bus.emit 이 0회다 (가짜 시세를 쏘면 js/trading.js 가
 *       그 값을 현재가로 믿어 손익·청산가가 과거로 돌아갑니다)
 *   [4] 포지션·미체결이 있으면 ★시작 자체를 못 한다★
 *   [5] 끄면 다시 주문이 된다 (막다가 회원을 가둬 두면 그것도 사고입니다)
 *   [6] 리플레이 중 포지션이 생기면 스스로 꺼진다
 *   [7] App.Trading 이 늦게 실려도 막힌다
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

/* 봉 40개 — canStart() 가 10개 미만이면 시작을 안 합니다 */
function 봉만들기(개수) {
  const out = [];
  for (let i = 0; i < 개수; i++) {
    const 밑 = 80000 + i * 10;
    out.push({ time: 1700000000 + i * 60, open: 밑, high: 밑 + 20, low: 밑 - 20, close: 밑 + 5 });
  }
  return out;
}
const 봉들 = 봉만들기(40);

/* =========================================================================
 * 화면 하나 띄우기
 *   옵션.순서 : 실을 파일 차례. 기본은 index.html 과 같은 차례입니다
 *   옵션.거래늦게 : true 면 App.Trading 을 모듈을 다 실은 ★뒤에★ 만듭니다
 *   옵션.스냅샷 : App.Trading.getSnapshot() 이 돌려줄 것
 * ========================================================================= */
function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const 순서 = 옵션.순서 || ["chart-replay.js", "tpsl-guard.js"];

  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"tlc-toolbar\"></div>" +
      "<div class=\"tlc-body\"><div class=\"chart-wrap\"><div id=\"chart_container\"></div></div></div></div>" +
      "<div class=\"amitalk-order\"></div><div class=\"tl-order-bar\"></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = 1440;
  win.innerHeight = 900;
  const 지연 = [];
  win.setInterval = function () { return 0; };   /* 되풀이 타이머는 안 돌립니다 */
  win.clearInterval = function () {};
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;
  win.fetch = undefined;
  const 알림들 = [];
  win.alert = function (m) { 알림들.push(String(m)); };

  /* ---- 가짜 라이브러리 ---- */
  function 시리즈(종류) {
    const s = {
      __종류: 종류, __data: [], __last: null,
      seriesType: function () { return 종류; },
      options: function () { return {}; },
      applyOptions: function () { return true; },
      setData: function (d) { s.__data = d; return true; },
      update: function (b) { s.__last = b; return true; },
      data: function () { return s.__data; },
      createPriceLine: function (o) { return { o: o }; },
      removePriceLine: function () {},
      applyRealData: null,
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return s;
  }
  const pane = { __목록: [], getSeries: function () { return pane.__목록.slice(); } };
  function 차트만들기() {
    const c = {
      panes: function () { return [pane]; },
      addSeries: function (ctor) {
        const s = 시리즈(ctor && ctor.__종류);
        pane.__목록.push(s);
        return s;
      },
      removeSeries: function (s) {
        const i = pane.__목록.indexOf(s);
        if (i >= 0) pane.__목록.splice(i, 1);
      },
      timeScale: function () {
        return {
          subscribeVisibleLogicalRangeChange: function () {},
          subscribeVisibleTimeRangeChange: function () {},
          getVisibleLogicalRange: function () { return null; },
          coordinateToLogical: function () { return 0; },
          scrollToPosition: function () {},
          fitContent: function () {}
        };
      },
      subscribeCrosshairMove: function () {},
      subscribeClick: function (f) { c.__클릭 = f; },
      applyOptions: function () {},
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return c;
  }
  const 원래라이브러리 = {
    createChart: function () { return 차트만들기(); },
    CandlestickSeries: { __종류: "Candlestick" },
    LineSeries: { __종류: "Line" },
    HistogramSeries: { __종류: "Histogram" },
    LineStyle: { Dashed: 2 }
  };
  win.LightweightCharts = 원래라이브러리;

  /* ---- App ---- */
  const 저장소 = {};
  const 듣는이 = {};
  const 쏜것 = [];
  win.App = {
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
      /* ★쏜 것을 전부 적어 둡니다 — 리플레이가 하나라도 쏘면 [3] 에서 걸립니다★ */
      emit: function (n, p) { 쏜것.push(n); (듣는이[n] || []).forEach(function (f) { f(p); }); }
    },
    Utils: { formatCurrencyPlain: function (v) { return String(v); } },
    ChartFont: { getCharts: function () { return [차트]; } }
  };

  /* ---- 거래 엔진 흉내 (js/trading.js 는 열지 않습니다) ---- */
  const 불린것 = [];
  const 이름들 = ["openPosition", "placeLimitOrder", "closePosition", "closePartial", "cancelPendingOrder"];
  let 스냅샷 = 옵션.스냅샷 || { position: null, pendingOrder: null };
  function 거래엔진만들기() {
    const T = {
      getSnapshot: function () { return 스냅샷; }
    };
    이름들.forEach(function (n) {
      T[n] = function () { 불린것.push(n); return "진짜로 주문했습니다:" + n; };
    });
    win.App.Trading = T;
    return T;
  }
  if (!옵션.거래늦게) 거래엔진만들기();

  /* ---- 모듈 싣기 ---- */
  순서.forEach(function (f) {
    win.eval(fs.readFileSync(path.join(REPO, "js", f), "utf8"));
  });
  if (옵션.거래늦게) 거래엔진만들기();

  const ev = win.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  win.document.dispatchEvent(ev);
  지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });

  /* ---- js/chart.js 가 하는 일 흉내 : 차트를 만들고 캔들을 넣습니다 ---- */
  const 차트 = win.LightweightCharts.createChart(
    win.document.getElementById("chart_container"), {}
  );
  const 캔들 = 차트.addSeries(win.LightweightCharts.CandlestickSeries, {});
  캔들.setData(봉들);

  const t = {
    win: win, dom: dom, 차트: 차트, 캔들: 캔들, pane: pane,
    쏜것: 쏜것, 불린것: 불린것, 알림들: 알림들, 듣는이: 듣는이, 이름들: 이름들,
    M: win.App.ChartReplay,
    T: function () { return win.App.Trading; },
    스냅샷바꾸기: function (v) { 스냅샷 = v; },
    지연: 지연,
    닫기: function () { dom.window.close(); }
  };
  /* 주문 5개를 다 한 번씩 눌러 봅니다. 돌려준 값을 그대로 모읍니다 */
  t.주문전부눌러보기 = function () {
    const 결과 = {};
    이름들.forEach(function (n) {
      let r;
      try { r = win.App.Trading[n]("buy", 100, null, null); }
      catch (e) { r = "던짐:" + e.message; }
      결과[n] = r;
    });
    return 결과;
  };
  return t;
}

console.log("\n리플레이 주문 막기 — 진짜로 눌러 봅니다");

/* =========================================================================
 * [0] 수정 금지 파일
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
 * [1] 뼈대가 제대로 섰는지 (이게 안 되면 아래가 다 헛검사입니다)
 * ========================================================================= */
절("[1] 뼈대 확인 — 이게 서야 아래 검사가 뜻이 있습니다");
{
  const t = 띄우기();
  ok("App.ChartReplay 가 있다", !!t.M);
  ok("차트를 잡았다 (createChart 를 감싸서)", t.M.getSeriesCountForTest() >= 1,
    String(t.M.getSeriesCountForTest()));
  ok("막을 주문 함수가 5개다", (t.M.GUARDED_FOR_TEST || []).length === 5,
    (t.M.GUARDED_FOR_TEST || []).join(","));
  ok("막는 이름이 우리가 흉내 낸 이름과 정확히 같다",
    (t.M.GUARDED_FOR_TEST || []).slice().sort().join(",") === t.이름들.slice().sort().join(","),
    (t.M.GUARDED_FOR_TEST || []).join(","));

  /* 리플레이를 켜기 ★전★ 에는 주문이 그냥 돼야 합니다 */
  const 켜기전 = t.주문전부눌러보기();
  ok("리플레이를 켜기 전에는 주문 5개가 다 통한다",
    t.이름들.every(function (n) { return 켜기전[n] === "진짜로 주문했습니다:" + n; }),
    JSON.stringify(켜기전));
  ok("그때 진짜 함수가 5번 다 불렸다", t.불린것.length === 5, t.불린것.join(","));
  t.닫기();
}

/* =========================================================================
 * [2] 주문 함수 5개가 ★실린 순서와 무관하게★ 막힌다
 * ========================================================================= */
절("[2] 실린 순서를 바꿔도 주문 5개가 다 막힌다");
{
  const 경우들 = [
    { 이름: "index.html 과 같은 차례 (리플레이 -> tpsl)", 순서: ["chart-replay.js", "tpsl-guard.js"] },
    { 이름: "차례를 뒤집었을 때 (tpsl -> 리플레이)", 순서: ["tpsl-guard.js", "chart-replay.js"] },
    { 이름: "리플레이만 실렸을 때", 순서: ["chart-replay.js"] }
  ];
  경우들.forEach(function (c) {
    const t = 띄우기({ 순서: c.순서 });
    const 켰나 = t.M.start(봉들[20].time);
    ok(c.이름 + " — 리플레이가 켜졌다", 켰나 === true && t.M.isOn() === true,
      "start=" + 켰나 + " isOn=" + t.M.isOn());

    t.불린것.length = 0;
    const 결과 = t.주문전부눌러보기();
    const 통과해버린것 = t.이름들.filter(function (n) {
      return 결과[n] !== null && 결과[n] !== undefined;
    });
    ok(c.이름 + " — 주문 5개가 다 거절됐다 (null 또는 undefined)",
      통과해버린것.length === 0,
      통과해버린것.map(function (n) { return n + "=" + 결과[n]; }).join(" / "));
    ok(c.이름 + " — 진짜 주문 함수가 ★한 번도★ 안 불렸다",
      t.불린것.length === 0, t.불린것.join(","));
    ok(c.이름 + " — 왜 막혔는지 회원에게 알려 준다",
      t.알림들.length >= 1 && t.알림들[0].indexOf("리플레이") >= 0,
      JSON.stringify(t.알림들.slice(0, 1)));
    t.닫기();
  });
}
{
  /* tpsl-guard 가 나중에 ★다시★ 감싸도 막혀야 합니다 (실제로 일어나는 일) */
  const t = 띄우기({ 순서: ["chart-replay.js"] });
  t.M.start(봉들[20].time);
  t.win.eval(fs.readFileSync(path.join(REPO, "js", "tpsl-guard.js"), "utf8"));
  t.지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });
  t.불린것.length = 0;
  const 결과 = t.주문전부눌러보기();
  ok("리플레이가 켜진 ★뒤에★ tpsl-guard 가 다시 감싸도 막힌다",
    t.불린것.length === 0 && 결과.openPosition == null && 결과.placeLimitOrder == null,
    "불린것=" + t.불린것.join(",") + " open=" + 결과.openPosition);
  t.닫기();
}

/* =========================================================================
 * [3] 리플레이 중 App.Bus.emit 이 0회다
 *   가짜 시세를 쏘면 js/trading.js 가 그 값을 현재가로 믿습니다.
 *   손익·청산가가 ★과거로★ 돌아가고, 회원은 그걸 지금 값으로 봅니다.
 * ========================================================================= */
절("[3] 가짜 시세를 안 쏜다 (App.Bus.emit 0회)");
{
  const t = 띄우기();
  t.쏜것.length = 0;
  t.M.start(봉들[20].time);
  ok("리플레이를 켜는 동안 App.Bus.emit 이 0회다", t.쏜것.length === 0, t.쏜것.join(","));

  /* 한 봉씩 넘겨 봅니다 — 여기서 쏘면 제일 위험합니다 */
  for (let i = 0; i < 8; i++) t.M.stepForward();
  ok("한 봉씩 여덟 번 넘겨도 App.Bus.emit 이 0회다", t.쏜것.length === 0, t.쏜것.join(","));

  t.M.stepBack();
  t.M.stepBack();
  ok("뒤로 넘겨도 App.Bus.emit 이 0회다", t.쏜것.length === 0, t.쏜것.join(","));

  /* 실시간 값이 들어와도 화면에는 안 넣고 장부에만 적어야 합니다.
     ⚠️ __last 가 null 인지로 보면 안 됩니다 — 한 봉 넘기기(stepForward)가
        자기 값을 거기 넣습니다(실측: 위에서 여덟 번 넘겨 놓은 그 봉).
        그래서 ★새로 들어온 그 시각★ 이 화면에 들어갔는지로 봅니다. */
  const 화면이전 = t.캔들.__data.length;
  const 새시각 = 봉들[39].time + 60;
  t.캔들.update({ time: 새시각, open: 81000, high: 81100, low: 80900, close: 81050 });
  ok("리플레이 중 실시간 값이 화면 캔들에 안 들어간다",
    !t.캔들.__last || t.캔들.__last.time !== 새시각, JSON.stringify(t.캔들.__last));
  ok("리플레이 중에도 화면 봉 수가 안 늘어난다", t.캔들.__data.length === 화면이전,
    t.캔들.__data.length + " != " + 화면이전);

  t.M.stop(true);
  ok("리플레이를 끄는 동안에도 App.Bus.emit 이 0회다", t.쏜것.length === 0, t.쏜것.join(","));
  t.닫기();
}

/* =========================================================================
 * [4] 포지션·미체결이 있으면 ★시작 자체를 못 한다★
 * ========================================================================= */
절("[4] 포지션이 있으면 시작 자체를 못 한다");
{
  const 경우들 = [
    { 이름: "포지션이 있을 때", 스냅샷: { position: { side: "long", qty: 1 }, pendingOrder: null } },
    { 이름: "미체결 주문이 있을 때", 스냅샷: { position: null, pendingOrder: { price: 80000 } } },
    { 이름: "둘 다 있을 때", 스냅샷: { position: { side: "long" }, pendingOrder: { price: 1 } } }
  ];
  경우들.forEach(function (c) {
    const t = 띄우기({ 스냅샷: c.스냅샷 });
    const 켰나 = t.M.start(봉들[20].time);
    ok(c.이름 + " — 리플레이가 시작되지 않는다", 켰나 === false, String(켰나));
    ok(c.이름 + " — 켜진 상태도 아니다", t.M.isOn() === false, String(t.M.isOn()));
    t.불린것.length = 0;
    const 결과 = t.주문전부눌러보기();
    ok(c.이름 + " — 그래서 주문은 평소대로 된다 (막다가 회원을 가두지 않는다)",
      t.불린것.length === 5, t.불린것.join(",") + " / " + JSON.stringify(결과.openPosition));
    t.닫기();
  });
}
{
  /* 포지션이 없을 때는 켜져야 합니다 — 위 검사가 "언제나 false" 로 헛돌지 않게 */
  const t = 띄우기({ 스냅샷: { position: null, pendingOrder: null } });
  ok("포지션이 없으면 리플레이가 켜진다 (위 검사가 헛돌지 않는다)",
    t.M.start(봉들[20].time) === true);
  t.닫기();
}

/* =========================================================================
 * [5] 끄면 다시 주문이 된다 — 막다가 회원을 가두면 그것도 사고입니다
 * ========================================================================= */
절("[5] 끄면 다시 주문이 된다");
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  t.주문전부눌러보기();
  ok("켠 동안에는 하나도 안 불렸다", t.불린것.length === 0, t.불린것.join(","));

  t.M.stop(true);
  ok("껐다", t.M.isOn() === false);
  t.불린것.length = 0;
  const 결과 = t.주문전부눌러보기();
  ok("끄면 주문 5개가 다시 다 통한다",
    t.이름들.every(function (n) { return 결과[n] === "진짜로 주문했습니다:" + n; }),
    JSON.stringify(결과));
  ok("끄면 진짜 함수가 5번 다 불린다", t.불린것.length === 5, t.불린것.join(","));

  /* 켜고 끄기를 세 번 되풀이해도 같아야 합니다 (껍질이 쌓이면 여기서 어긋납니다) */
  let 어긋남 = [];
  for (let i = 0; i < 3; i++) {
    t.M.start(봉들[20].time);
    t.불린것.length = 0;
    t.주문전부눌러보기();
    if (t.불린것.length !== 0) 어긋남.push((i + 1) + "바퀴: 켠 동안 " + t.불린것.length + "번 통과");
    t.M.stop(true);
    t.불린것.length = 0;
    t.주문전부눌러보기();
    if (t.불린것.length !== 5) 어긋남.push((i + 1) + "바퀴: 끈 뒤 " + t.불린것.length + "번만 통과");
  }
  ok("켜고 끄기를 세 번 되풀이해도 그대로다", 어긋남.length === 0, 어긋남.join(" / "));
  t.닫기();
}

/* =========================================================================
 * [6] 리플레이 중에 포지션이 생기면 스스로 꺼진다
 * ========================================================================= */
절("[6] 리플레이 중 포지션이 생기면 스스로 꺼진다");
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  ok("켜져 있다", t.M.isOn() === true);
  t.win.App.Bus.emit("trading:update", { position: { side: "long", qty: 1 }, pendingOrder: null });
  ok("포지션이 생기면 리플레이가 꺼진다", t.M.isOn() === false, String(t.M.isOn()));
  t.불린것.length = 0;
  t.주문전부눌러보기();
  ok("꺼졌으니 주문이 다시 된다", t.불린것.length === 5, t.불린것.join(","));
  t.닫기();
}
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  t.win.App.Bus.emit("symbol:change", { symbol: "ETHUSDT" });
  ok("종목을 바꾸면 리플레이가 꺼진다", t.M.isOn() === false);
  t.닫기();
}
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  t.win.App.Bus.emit("interval:change", { interval: "5m" });
  ok("봉 간격을 바꾸면 리플레이가 꺼진다", t.M.isOn() === false);
  t.닫기();
}

/* =========================================================================
 * [7] App.Trading 이 늦게 실려도 막힌다
 *   index.html 은 js/chart-replay.js(1269) 를 js/trading.js(1309) 보다 먼저
 *   싣습니다. 감싸기가 그때 건너뛰어지면 ★조용히 안 막힙니다★.
 * ========================================================================= */
절("[7] App.Trading 이 늦게 실려도 막힌다");
{
  const t = 띄우기({ 거래늦게: true, 순서: ["chart-replay.js"] });
  ok("리플레이가 켜진다", t.M.start(봉들[20].time) === true);
  t.불린것.length = 0;
  const 결과 = t.주문전부눌러보기();
  const 통과 = t.이름들.filter(function (n) { return 결과[n] != null; });
  ok("늦게 실린 거래 엔진도 주문 5개가 다 막힌다", 통과.length === 0 && t.불린것.length === 0,
    통과.join(",") + " / 불린것 " + t.불린것.join(","));
  t.닫기();
}

/* =========================================================================
 * [8] 화면 덮개도 진짜로 붙는다 (DOM 으로 확인 — 소스 글자가 아닙니다)
 * ========================================================================= */
절("[8] 주문창 덮개가 화면에 진짜로 붙는다");
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  const 주문창 = t.win.document.querySelector(".amitalk-order");
  const 덮개있나 = !!(주문창 && 주문창.querySelector("div") &&
    주문창.textContent.indexOf("리플레이") >= 0);
  ok("주문창(.amitalk-order) 안에 덮개가 붙었다", 덮개있나, 주문창 && 주문창.textContent);
  ok("덮개에 '리플레이 끄기' 단추가 있다 (막다가 갇히지 않게)",
    !!주문창 && 주문창.textContent.indexOf("리플레이 끄기") >= 0, 주문창 && 주문창.textContent);
  t.M.stop(true);
  ok("끄면 덮개가 사라진다",
    !주문창 || 주문창.textContent.indexOf("리플레이") < 0, 주문창 && 주문창.textContent);
  t.닫기();
}

/* =========================================================================
 * [9] 등록
 * ========================================================================= */
절("[9] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-order-block-live.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌립니다");
  const 나 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", 나.indexOf("되돌리는 방법") >= 0);
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n  실패한 것:");
  실패목록.forEach(function (s) { console.log("   - " + s); });
}
process.exit(fail ? 1 : 0);
