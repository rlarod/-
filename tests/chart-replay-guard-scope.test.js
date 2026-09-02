/* tests/chart-replay-guard-scope.test.js
 * =========================================================================
 * 돈에 닿는 봉인 — 리플레이 주문 막기가 ★넓지도 좁지도 않은지★
 *   대상: js/chart-replay.js (App.ChartReplay)  ·  견줌: js/trading.js · js/chart.js
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 또 만드나 ──────────────────────────────────────────────────────
 * tests/chart-replay-order-block-live.test.js 가 ★막아야 할 5개가 막히는지★ 를
 * 실제로 눌러서 봅니다. 그 파일은 그대로 두고, 여기서는 ★그 5개가 맞는 5개인지★
 * 와 ★막으면 안 되는 것까지 막지는 않는지★ 를 봅니다.
 *
 *   좁으면(모자라면)  회원이 과거 화면을 보면서 지금 값으로 주문합니다 → 돈
 *   넓으면(지나치면)  리플레이 중에 청산가·최대주문금액 계산까지 null 이 되어
 *                     포지션 표가 조용히 빈칸이 됩니다 → 조용한 고장
 *
 * 2026-09-02 밤 이후 js/chart-replay.js 가 ★세 번★ 바뀌었습니다
 * (8eedf5b · b9494d0 · 겹침 수정). 그때마다 다시 재는 그물이 필요합니다.
 *
 * ── ★손으로 적은 이름 목록에 기대지 않습니다★ ────────────────────────
 * js/trading.js 가 실제로 내주는 함수 이름을 ★소스에서 뽑아★ 씁니다.
 * 거래 엔진에 함수가 하나 늘면 이 파일이 빨개지고, 사람이 "이건 리플레이 중에
 * 막아야 하나" 를 한 번은 보게 됩니다.
 * (js/trading.js 는 수정 금지 파일이라 자주 바뀌지 않습니다. 그래서 이 census
 *  가 시끄럽지 않고, 바뀌는 그 드문 순간에만 붙잡습니다)
 *
 * ── 현재가 선 색 — ★두 파일이 같은 값인지 매번 대조합니다★ ───────────
 * 리플레이는 chart.js 가 그린 빨간 현재가 선을 ★색으로★ 집어 감춥니다.
 *     js/chart.js:50        COLORS.current = "#FF5252"
 *     js/chart-replay.js    LIVE_LINE_COLOR = "#FF5252"
 * ★두 값이 어긋나면 아무 오류 없이 선이 안 감춰집니다★ — 회원은 과거 화면에
 * 그려진 「지금 가격」 을 보게 됩니다(조용한 고장).
 * 이 파일은 ★값을 여기에 적지 않고 js/chart.js 에서 뽑아★ 견줍니다. 그래서
 * 나중에 색을 바꿔도 두 곳만 같으면 통과하고, 한 곳만 바뀌면 빨개집니다.
 * (tests/chart-replay-live-line-pick.test.js 는 "#FF5252" 를 글자로 박아 두어
 *  색을 바꾸면 테스트도 같이 고쳐야 합니다. 그 파일은 다른 것을 지키므로 두고,
 *  여기서 ★값에 매이지 않는★ 대조를 따로 겁니다)
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const L = require("./_locked-hashes.js");
const REPLAY_SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");
const TRADING_SRC = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
const CHART_SRC = fs.readFileSync(path.join(REPO, "js", "chart.js"), "utf8");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m" + "✓" + ESC + "[0m";
const NGM = ESC + "[31m" + "✗" + ESC + "[0m";
let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + OKM + " " + 제목); }
  else { fail++; console.log("  " + NGM + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }
function md5(rel) {
  return crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", rel))).digest("hex");
}

console.log("\n리플레이 주문 막기 — 넓지도 좁지도 않은가");

/* =========================================================================
 * [0] 수정 금지 파일 — 견주는 두 파일이 그대로여야 견줌이 뜻이 있습니다
 * ========================================================================= */
절("[0] 수정 금지 파일");
["trading.js", "chart.js"].forEach(function (f) {
  const 기준 = f === "trading.js" ? L.TRADING : L.BY_FILE["js/" + f];
  ok("js/" + f + " 를 안 건드렸다", md5(f) === 기준,
    "지금 " + md5(f) + " / 기준 " + 기준);
});

/* =========================================================================
 * [1] js/trading.js 가 내주는 함수 목록 — ★소스에서 뽑습니다★
 * ========================================================================= */
절("[1] 거래 엔진이 내주는 함수 (js/trading.js 에서 직접 읽음)");

function 내주는함수들(src) {
  /* 모듈 맨 끝의  return { ... };  를 통째로 떼어 이름만 골라냅니다 */
  const i = src.lastIndexOf("\n  return {");
  if (i < 0) return [];
  const j = src.indexOf("};", i);
  if (j < 0) return [];
  return src.slice(i, j)
    .split("\n")
    .map(function (줄) {
      const m = /^\s*([A-Za-z_$][\w$]*)\s*(,|:)/.exec(줄);
      return m ? m[1] : null;
    })
    .filter(Boolean);
}

const 내주는것 = 내주는함수들(TRADING_SRC);
const 알려진내주는것 = ["init", "setLeverage", "getMaxAffordableMargin", "openPosition",
  "placeLimitOrder", "cancelPendingOrder", "closePosition", "closePartial",
  "calcLiquidationPrice", "maintenanceMargin", "bracketMaxLeverage", "getSnapshot"];

ok("내주는 함수를 " + 내주는것.length + "개 찾았다", 내주는것.length >= 10, 내주는것.join(","));
ok("★알려진 " + 알려진내주는것.length + "개와 같다 — 거래 엔진에 새 함수가 안 생겼다★",
  내주는것.slice().sort().join(",") === 알려진내주는것.slice().sort().join(","),
  "지금: " + 내주는것.join(",") + "\n         알려진: " + 알려진내주는것.join(",") +
  "\n         → 새 함수가 생겼으면 ★리플레이 중에 막아야 하는지★ 를 사람이 판단해서 " +
  "js/chart-replay.js 의 GUARDED 에 넣을지 정하고, 이 목록도 같이 고치세요");

/* 막아야 하는 5개 · 막으면 안 되는 나머지 — 왜 그렇게 나뉘는지 적어 둡니다 */
const 막아야하는것 = {
  openPosition: "새 포지션 — 지금 시세로 체결됩니다",
  placeLimitOrder: "지정가 걸기 — 지금 호가에 얹힙니다",
  closePosition: "포지션 청산 — 지금 시세로 손익이 확정됩니다",
  closePartial: "일부 청산 — 위와 같습니다",
  cancelPendingOrder: "미체결 취소 — 과거 화면을 보고 취소를 누르게 됩니다"
};
const 막으면안되는것 = {
  init: "모듈 시작. 막으면 엔진이 안 삽니다",
  setLeverage: "배율 고르기. 주문이 아닙니다",
  getMaxAffordableMargin: "최대 주문금액 계산 — 막으면 주문창이 빈칸이 됩니다",
  calcLiquidationPrice: "청산가 계산 — 막으면 포지션 표가 빈칸이 됩니다",
  maintenanceMargin: "유지증거금 계산 — 위와 같습니다",
  bracketMaxLeverage: "명목별 배율 상한 — 위와 같습니다",
  getSnapshot: "지금 상태 읽기 — 막으면 리플레이 자신도 못 씁니다"
};
ok("나눔이 빠짐없다 (막을 것 " + Object.keys(막아야하는것).length + " + 안 막을 것 " +
  Object.keys(막으면안되는것).length + " = " + 내주는것.length + ")",
  Object.keys(막아야하는것).length + Object.keys(막으면안되는것).length === 내주는것.length &&
  내주는것.every(function (n) { return 막아야하는것[n] || 막으면안되는것[n]; }),
  내주는것.filter(function (n) { return !막아야하는것[n] && !막으면안되는것[n]; }).join(","));

/* =========================================================================
 * [2] 리플레이가 감싸겠다고 적어 둔 목록이 그 5개인가
 * ========================================================================= */
절("[2] GUARDED 목록");

const GUARDED_소스 = (function () {
  const m = /var\s+GUARDED\s*=\s*\[([^\]]*)\]/.exec(REPLAY_SRC);
  return m ? m[1].split(",").map(function (s) { return s.trim().replace(/^"|"$/g, ""); }).filter(Boolean) : [];
})();
ok("GUARDED 를 소스에서 읽었다 (" + GUARDED_소스.length + "개)", GUARDED_소스.length > 0);
ok("★GUARDED 가 막아야 할 5개와 정확히 같다★",
  GUARDED_소스.slice().sort().join(",") === Object.keys(막아야하는것).sort().join(","),
  "지금: " + GUARDED_소스.join(","));
ok("GUARDED 의 이름이 전부 거래 엔진에 실제로 있다 (오타 0개)",
  GUARDED_소스.every(function (n) { return 내주는것.indexOf(n) >= 0; }),
  GUARDED_소스.filter(function (n) { return 내주는것.indexOf(n) < 0; }).join(",") +
  " → 오타면 그 함수는 ★감싸지지도 않고 오류도 안 납니다★");

/* installOrderGuard 를 부르는 자리 — 켤 때 · 실릴 때 두 곳입니다.
   한 곳만 남으면 "늦게 실린 거래 엔진" 이나 "켜기 전에 감싸기" 중 하나가 뚫립니다 */
{
  const 부른곳 = (REPLAY_SRC.match(/^\s*installOrderGuard\(\);/gm) || []).length;
  ok("installOrderGuard 를 부르는 자리가 2곳 그대로다 (지금 " + 부른곳 + "곳)", 부른곳 === 2,
    "start() 안 1곳 + init() 안 1곳이어야 합니다");
}

/* =========================================================================
 * 화면 하나 띄우기 — ★거래 엔진 함수 12개를 다 만들어 둡니다★
 *   (order-block-live 의 도구는 5개만 만듭니다. 여기서는 나머지 7개가
 *    막히지 않는지도 봐야 해서 12개짜리가 따로 필요합니다)
 * ========================================================================= */
function 봉만들기(개수) {
  const out = [];
  for (let i = 0; i < 개수; i++) {
    const 밑 = 80000 + i * 10;
    out.push({ time: 1700000000 + i * 60, open: 밑, high: 밑 + 20, low: 밑 - 20, close: 밑 + 5 });
  }
  return out;
}
const 봉들 = 봉만들기(40);

function 띄우기() {
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
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;
  win.fetch = undefined;
  const 알림들 = [];
  win.alert = function (m) { 알림들.push(String(m)); };

  const 만든선들 = [];
  function 시리즈(종류) {
    const s = {
      __종류: 종류, __data: [],
      seriesType: function () { return 종류; },
      options: function () { return {}; },
      applyOptions: function () { return true; },
      setData: function (d) { s.__data = d; return true; },
      update: function () { return true; },
      data: function () { return s.__data; },
      createPriceLine: function (o) {
        const ln = { o: o, __보임: true, applyOptions: function (n) { Object.assign(ln.o, n); } };
        만든선들.push(ln);
        return ln;
      },
      removePriceLine: function () {},
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return s;
  }
  const pane = { __목록: [], getSeries: function () { return pane.__목록.slice(); } };
  function 차트만들기() {
    const c = {
      panes: function () { return [pane]; },
      addSeries: function (ctor) { const s = 시리즈(ctor && ctor.__종류); pane.__목록.push(s); return s; },
      removeSeries: function (s) { const i = pane.__목록.indexOf(s); if (i >= 0) pane.__목록.splice(i, 1); },
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
      subscribeClick: function () {},
      applyOptions: function () {},
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return c;
  }
  win.LightweightCharts = {
    createChart: function () { return 차트만들기(); },
    CandlestickSeries: { __종류: "Candlestick" },
    LineSeries: { __종류: "Line" },
    HistogramSeries: { __종류: "Histogram" },
    LineStyle: { Dashed: 2, Solid: 0 }
  };

  const 저장소 = {};
  const 듣는이 = {};
  const 쏜것 = [];
  let 차트 = null;
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
      emit: function (n, p) { 쏜것.push(n); (듣는이[n] || []).forEach(function (f) { f(p); }); }
    },
    Utils: { formatCurrencyPlain: function (v) { return String(v); } },
    ChartFont: { getCharts: function () { return 차트 ? [차트] : []; } }
  };

  /* ★거래 엔진 흉내 — js/trading.js 가 내주는 이름 그대로 12개를 만듭니다★
     js/trading.js 는 열지도 실행하지도 않습니다(수정 금지 파일). 이름만 씁니다 */
  const 불린것 = [];
  const T = {};
  내주는것.forEach(function (n) {
    T[n] = function () { 불린것.push(n); return "진짜로 했습니다:" + n; };
  });
  T.getSnapshot = function () { 불린것.push("getSnapshot"); return { position: null, pendingOrder: null }; };
  win.App.Trading = T;

  win.eval(fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8"));
  const ev = win.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  win.document.dispatchEvent(ev);
  지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });

  차트 = win.LightweightCharts.createChart(win.document.getElementById("chart_container"), {});
  const 캔들 = 차트.addSeries(win.LightweightCharts.CandlestickSeries, {});
  캔들.setData(봉들);

  return {
    win: win, M: win.App.ChartReplay, T: T, 캔들: 캔들, 만든선들: 만든선들,
    불린것: 불린것, 알림들: 알림들, 쏜것: 쏜것,
    전부불러보기: function () {
      const 결과 = {};
      내주는것.forEach(function (n) {
        try { 결과[n] = win.App.Trading[n](100, 1, "buy"); }
        catch (e) { 결과[n] = "던짐:" + e.message; }
      });
      return 결과;
    },
    닫기: function () { dom.window.close(); }
  };
}

/* =========================================================================
 * [3] ★실제로 12개를 다 눌러 본다★ — 5개는 막히고 7개는 그대로 돈다
 * ========================================================================= */
절("[3] 리플레이를 켜고 12개를 다 눌러 본다");
{
  const t = 띄우기();
  ok("리플레이가 켜졌다", t.M.start(봉들[20].time) === true && t.M.isOn() === true);

  t.불린것.length = 0;
  const 결과 = t.전부불러보기();

  const 막힌것 = 내주는것.filter(function (n) { return 결과[n] === null; });
  const 통과한것 = 내주는것.filter(function (n) { return t.불린것.indexOf(n) >= 0; });

  ok("★막아야 할 5개가 다 막혔다★ (null 을 돌려주고 진짜 함수는 안 불림)",
    Object.keys(막아야하는것).every(function (n) {
      return 결과[n] === null && t.불린것.indexOf(n) < 0;
    }),
    Object.keys(막아야하는것).filter(function (n) { return 결과[n] !== null; })
      .map(function (n) { return n + "=" + 결과[n]; }).join(" / "));

  Object.keys(막으면안되는것).forEach(function (n) {
    ok("★" + n + " 은 리플레이 중에도 그대로 돈다★ — " + 막으면안되는것[n],
      t.불린것.indexOf(n) >= 0 && 결과[n] !== null,
      "돌려준 값 " + 결과[n] + " / 진짜로 불렸나 " + (t.불린것.indexOf(n) >= 0) +
      "  ★막으면 화면이 조용히 빈칸이 됩니다★");
  });

  ok("막힌 것이 정확히 5개다 (더도 덜도 아님) — 막힘: " + 막힌것.join(","),
    막힌것.length === 5, 막힌것.join(","));
  ok("통과한 것이 정확히 7개다 — 통과: " + 통과한것.join(","),
    통과한것.length === 7, 통과한것.join(","));
  ok("왜 막혔는지 회원에게 알려 준다", t.알림들.length >= 1 && t.알림들[0].indexOf("리플레이") >= 0,
    JSON.stringify(t.알림들.slice(0, 1)));

  /* 끄면 12개가 다 돌아야 합니다 (막다가 회원을 가둬 두면 그것도 사고입니다) */
  t.M.stop(true);
  t.불린것.length = 0;
  t.전부불러보기();
  ok("끄면 12개가 다 다시 돈다", t.불린것.length === 내주는것.length,
    "불린 것 " + t.불린것.length + "개: " + t.불린것.join(","));
  t.닫기();
}

/* =========================================================================
 * [4] 켜져 있는 동안 App.Bus.emit 이 0회 — 가짜 시세를 안 쏜다
 *     (세 번 바뀐 뒤에도 그대로인지 다시 잽니다)
 * ========================================================================= */
절("[4] 켜져 있는 동안 가짜 시세를 안 쏜다");
{
  const t = 띄우기();
  t.M.start(봉들[20].time);
  t.쏜것.length = 0;
  for (let i = 0; i < 8; i++) t.M.stepForward();
  for (let i = 0; i < 3; i++) t.M.stepBack();
  ok("봉을 앞으로 8번 · 뒤로 3번 옮기는 동안 App.Bus.emit 이 0회다 (지금 " + t.쏜것.length + "회)",
    t.쏜것.length === 0,
    "쏜 것: " + t.쏜것.join(",") + " → js/trading.js 가 이 값을 ★지금 가격★ 으로 믿습니다");
  t.닫기();
}

/* =========================================================================
 * [5] ★현재가 선 색 — 두 파일이 같은 값인가 (값을 여기에 안 적습니다)★
 * ========================================================================= */
절("[5] 현재가 선 색 — js/chart.js 와 js/chart-replay.js 가 같은 값인가");
{
  const m차트 = /current:\s*"(#[0-9A-Fa-f]{3,8})"/.exec(CHART_SRC);
  const m리플 = /LIVE_LINE_COLOR\s*=\s*"(#[0-9A-Fa-f]{3,8})"/.exec(REPLAY_SRC);
  ok("js/chart.js 에서 현재가 선 색을 읽었다" + (m차트 ? " (" + m차트[1] + ")" : ""), !!m차트,
    "COLORS.current 를 못 찾았습니다");
  ok("js/chart-replay.js 에서 LIVE_LINE_COLOR 를 읽었다" + (m리플 ? " (" + m리플[1] + ")" : ""), !!m리플,
    "이름이 바뀌었습니다");
  ok("★두 값이 같다★ (안 같으면 현재가 선이 조용히 안 감춰집니다)",
    !!m차트 && !!m리플 && m차트[1].toUpperCase() === m리플[1].toUpperCase(),
    "chart.js=" + (m차트 && m차트[1]) + " / chart-replay.js=" + (m리플 && m리플[1]));
  /* 집을 때 opts.color 를 대문자로 바꿔 견줍니다. 그러니 상수도 대문자여야 합니다 */
  ok("리플레이 쪽 값이 대문자다 (집을 때 toUpperCase 로 견주기 때문)",
    !!m리플 && m리플[1] === m리플[1].toUpperCase(),
    m리플 ? m리플[1] + " → 소문자면 ★영원히 안 맞습니다★" : "");
  ok("chart.js 안에서 그 색을 쓰는 곳이 현재가 선 하나뿐이다",
    !!m차트 && (CHART_SRC.match(new RegExp(m차트[1], "gi")) || []).length === 1,
    "여러 곳에 있으면 색으로 집는 방식이 다른 선까지 집을 수 있습니다");

  /* 소스만 보지 않고 ★실제로 감추는지★ 도 봅니다 */
  const t = 띄우기();
  const 색 = m차트 ? m차트[1] : "#FF5252";
  const 회원선 = t.캔들.createPriceLine({ price: 80000, color: "#F0B429", title: "" });
  const 현재가선 = t.캔들.createPriceLine({ price: 80100, color: 색, title: "" });
  t.M.start(봉들[20].time);
  ok("리플레이를 켜면 ★현재가 선만★ 감춰진다 (회원이 그은 선은 그대로)",
    현재가선.o.lineVisible === false && 회원선.o.lineVisible !== false,
    "현재가선 " + JSON.stringify(현재가선.o.lineVisible) +
    " / 회원선 " + JSON.stringify(회원선.o.lineVisible));
  t.M.stop(true);
  ok("끄면 현재가 선이 돌아온다", 현재가선.o.lineVisible !== false,
    JSON.stringify(현재가선.o.lineVisible));
  t.닫기();
}

/* =========================================================================
 * [6] ★돌연변이★ — 검사가 진짜로 무는지 사본으로 확인
 * ========================================================================= */
절("[6] 돌연변이 — 목록에서 하나를 빼면 그 함수가 안 막힌다");
{
  /* ★사본만 고칩니다. 원본 js/chart-replay.js 는 안 건드립니다★ */
  const 상한소스 = REPLAY_SRC.replace(
    /var\s+GUARDED\s*=\s*\[[^\]]*\]/,
    'var GUARDED = ["openPosition", "placeLimitOrder", "closePosition", "closePartial"]'
  );
  ok("사본에서 cancelPendingOrder 를 목록에서 뺐다", 상한소스 !== REPLAY_SRC &&
    상한소스.indexOf("cancelPendingOrder\"]") < 0);

  /* 사본을 태우는 작은 화면 — 위 띄우기() 와 같은 뼈대라 결과를 견줄 수 있습니다 */
  const 원래읽기 = fs.readFileSync;
  let 갈아끼움 = false;
  fs.readFileSync = function (p, enc) {
    if (String(p).indexOf("chart-replay.js") >= 0 && enc === "utf8") { 갈아끼움 = true; return 상한소스; }
    return 원래읽기.apply(fs, arguments);
  };
  let 결과;
  let 불린것;
  try {
    const t = 띄우기();
    t.M.start(봉들[20].time);
    t.불린것.length = 0;
    결과 = t.전부불러보기();
    불린것 = t.불린것.slice();
    t.닫기();
  } finally {
    fs.readFileSync = 원래읽기;   /* ★반드시 되돌립니다★ */
  }
  ok("사본을 실제로 태웠다", 갈아끼움 === true);
  ok("★목록에서 뺀 cancelPendingOrder 가 그대로 통과한다 — 검사가 진짜로 뭅니다★",
    불린것.indexOf("cancelPendingOrder") >= 0 && 결과.cancelPendingOrder !== null,
    "빼도 막히면 이 봉인은 GUARDED 목록을 아무것도 안 지키는 것입니다");
  ok("나머지 4개는 사본에서도 여전히 막힌다 (사본이 딴 데를 망가뜨리지 않았다)",
    ["openPosition", "placeLimitOrder", "closePosition", "closePartial"]
      .every(function (n) { return 결과[n] === null; }),
    JSON.stringify(결과));
  ok("원본 파일 읽기를 되돌렸다",
    fs.readFileSync === 원래읽기 &&
    fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8") === REPLAY_SRC);
  ok("원본 js/chart-replay.js 가 그대로다 (사본만 고쳤습니다)",
    fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8").indexOf("cancelPendingOrder\"]") >= 0);
}

/* =========================================================================
 * [7] 등록
 * ========================================================================= */
절("[7] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-guard-scope.test.js") >= 0);
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다 */
process.exit(0);
