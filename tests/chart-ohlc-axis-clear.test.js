/* tests/chart-ohlc-axis-clear.test.js
 * =========================================================================
 * 십자선 O·H·L·C 줄이 ★가격축을 안 덮는가★ — 그것도 ★통화가 바뀌어도★
 * =========================================================================
 * 2026-09-07 · 수리팀
 *   대상: js/chart-ohlc-legend.js (App.ChartOhlcLegend)
 *
 * ── 무슨 사고였나 (P1, 라이브) ─────────────────────────────────────────
 *   d7bdc66(09-04) 이 이 줄을 자기 줄 -> 차트 안 겹침으로 옮기면서
 *   left 만 정하고 ★오른끝을 안 정했습니다★. 상자가 .chart-wrap
 *   (그림 영역 + 가격축) 끝까지 늘어나 가격축 숫자를 덮었습니다.
 *     768 · 원화 실측(2026-09-07) — 그림 오른끝 584 인데 줄 오른끝 753.
 *     ★가격축 170px 을 통째로★ 덮어 ₩120,900,000 이 ,900,000 으로 읽혔습니다.
 *     1억 2천만원을 90만원으로 읽는 것이라 P1 입니다.
 *   flex-wrap:wrap 이라 문서를 안 밀어내서 "가로 스크롤 0 · 오류 0" 으로
 *   조용히 통과했습니다.
 *
 * ── ⭐ 여기서 ★안 보는 것★ (두 벌 금지) ───────────────────────────────
 *   · "차트 위 절대배치 상자에 오른끝이 있는가"
 *     -> tests/chart-overlay-right-edge.test.js 한 곳입니다. 여기서 또 안 봅니다.
 *        그 봉인은 폴더를 훑어 right/max-width/width 가 ★있기만 하면★ 초록입니다.
 *   · 변동 계산식(종가 − 시가) · 글씨 17px 바닥 · 하이킨아시 · 시간대
 *     -> tests/chart-ohlc-legend.test.js 및 각 전용 봉인 한 곳씩입니다.
 *
 * ── ⭐ 그래서 여기서는 ★그 봉인이 구조적으로 못 보는 두 가지★ 만 봅니다 ──
 *
 *   [A] ★정적 px 로 막으면 안 된다★
 *       가격축 폭은 ★네 가지★ 로 변합니다 (조사팀 실측 2026-09-07) —
 *         USDT ≤390 75px · KRW ≤390 93px · USDT ≥768 131px · KRW ≥768 169px
 *       그래서 right:98px 같은 고정값은 ★통화만 바꿔도 어긋납니다★.
 *       그런데 위 봉인의 [7] 절은 정적 right 를 "판정 없음 · 숫자만" 으로
 *       찍고 넘어갑니다. 즉 ★.tl-ohlc 를 right:98px 로 바꿔도 전부 초록★ 입니다.
 *       여기서는 가짜 차트에 좌표를 물려 ★실제로 재서 넣는지★ 를 검산하고,
 *       통화를 바꿔 가격축을 넓히면 ★상자도 따라 좁아지는지★ 를 봅니다.
 *
 *   [B] ★값을 … 로 자르면 안 된다★
 *       조사팀이 B안(right + nowrap + overflow + ellipsis)을 실제로 얹어 재 봤고
 *       "화면상 OK · 1줄 · 23px" 로 ★숫자는 전부 초록★ 이었습니다.
 *       하지만 O·H·L 값이 … 로 잘려 ★십자선의 쓸모가 사라집니다★.
 *       이 줄은 지표 이름표와 달리 ★값 자체가 내용★ 입니다
 *       (모듈 주석: "폰에서 봉을 눌러 값을 읽는 것이 이 줄의 주된 쓸모").
 *       그래서 좁히는 대신 ★줄이 늘어나는 것을 받아들인다★ 가 PM 결정이고,
 *       그 결정을 여기서 못 박습니다.
 *
 *   [C] 십자선을 떼면 ★원래대로 돌아오는가★
 *       안 돌아오면 그게 새 고장입니다(PM 지시). 폰에서 O·H·L 을 다시 접어
 *       한 줄로 돌아가는지 봅니다.
 *
 * ── 브라우저를 안 씁니다 ───────────────────────────────────────────────
 *   jsdom 에는 배치가 없어 getBoundingClientRect 가 전부 0 입니다. 그래서
 *   ★가짜 차트의 칸마다 좌표를 직접 물려★ applyWidth 의 셈을 검산합니다.
 *   실제 화면 침범값은 사람이 여섯 폭으로 따로 잽니다(봉인이 대신하지 않습니다).
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-ohlc-axis-clear.test.js
 *   그리고 tests/_order.txt 의 이 줄을 지웁니다.
 *   ⚠ rm 이 아니라 ★git rm★ 입니다 — git 에 남으면 tests-dir-hygiene 이 터집니다.
 *   사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-ohlc-legend.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");

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

/* =========================================================================
 * 가짜 차트 — ★좌표를 직접 물립니다★
 * -------------------------------------------------------------------------
 * 진짜 차트의 칸 한 줄(tr)은 세 칸입니다: 왼축 · 그림 · 오른축(가격축).
 * 여기서도 똑같이 만들고, 각 칸에 getBoundingClientRect 를 손으로 붙여
 * "그림 영역이 어디서 끝나는가" 를 이 모듈이 진짜로 읽는지 검산합니다.
 * ========================================================================= */
const 봉들 = [
  { time: 1, open: 100, high: 110, low: 90, close: 105 },
  { time: 2, open: 200, high: 260, low: 190, close: 240 },
  { time: 3, open: 300, high: 320, low: 250, close: 270 }
];

/** 실측한 가격축 폭 (조사팀 2026-09-07). 통화별로 다릅니다. */
const 축폭 = { USDT: 131, KRW: 169 };
const WRAP_L = 61;    /* .chart-wrap 왼끝 (768 실측) */
const WRAP_R = 753;   /* .chart-wrap 오른끝 (768 실측) */

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
  const doc = win.document;
  win.innerWidth = 옵션.width || 768;
  win.innerHeight = 옵션.height || 900;

  const 지연 = [];
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;
  win.ResizeObserver = undefined;    /* 없는 브라우저에서도 되는지 같이 봅니다 */
  win.fetch = undefined;

  let 통화 = 옵션.통화 || "USDT";

  /* --- 차트 속 표 (왼축 · 그림 · 가격축) --------------------------------- */
  const chartEl = doc.createElement("div");
  const table = doc.createElement("table");
  const tr = doc.createElement("tr");
  const 왼축 = doc.createElement("td");
  const 그림 = doc.createElement("td");
  const 가격축 = doc.createElement("td");
  tr.appendChild(왼축); tr.appendChild(그림); tr.appendChild(가격축);
  table.appendChild(tr);
  chartEl.appendChild(table);
  doc.querySelector("#chart_container").appendChild(chartEl);

  /* 그림 영역의 오른끝 = .chart-wrap 오른끝 − 가격축 폭 (통화를 따라 움직입니다) */
  function 그림오른끝() { return WRAP_R - 축폭[통화]; }
  const wrap = doc.querySelector(".chart-wrap");
  wrap.getBoundingClientRect = function () {
    return { left: WRAP_L, right: WRAP_R, top: 0, bottom: 400, width: WRAP_R - WRAP_L, height: 400 };
  };
  왼축.getBoundingClientRect = function () {
    return { left: WRAP_L, right: WRAP_L, top: 0, bottom: 360, width: 0, height: 360 };
  };
  그림.getBoundingClientRect = function () {
    const r = 그림오른끝();
    return { left: WRAP_L, right: r, top: 0, bottom: 360, width: r - WRAP_L, height: 360 };
  };
  가격축.getBoundingClientRect = function () {
    const l = 그림오른끝();
    return { left: l, right: WRAP_R, top: 0, bottom: 360, width: WRAP_R - l, height: 360 };
  };

  /* --- 차트 객체 -------------------------------------------------------- */
  function 시리즈(종류) {
    const s = {
      __데이터: [],
      seriesType: function () { return 종류; },
      setData: function (d) { s.__데이터 = d; },
      data: function () { return s.__데이터; },
      applyOptions: function () {},
      priceScale: function () { return { applyOptions: function () {} }; }
    };
    return s;
  }
  const 캔들 = 시리즈("Candlestick");
  캔들.setData(봉들);
  const pane = { getSeries: function () { return [캔들]; } };
  const chart = {
    panes: function () { return [pane]; },
    chartElement: function () { return 옵션.차트칸없음 ? null : chartEl; },
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

  const 듣는이 = {};
  win.App = {
    ChartFont: { getCharts: function () { return [chart]; } },
    Config: {
      getActiveSymbol: function () { return "BTCUSDT"; },
      getActiveInterval: function () { return "1m"; },
      getDisplayCurrency: function () { return 통화; }
    },
    Bus: {
      on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
      emit: function (n, p) { (듣는이[n] || []).slice().forEach(function (f) { f(p); }); }
    },
    Storage: { load: function (k, d) { return d; }, save: function () {} },
    Utils: {
      formatCurrencyPlain: function (v) {
        return 통화 === "KRW" ? "₩" + String(Math.round(v * 1300)) : String(v);
      }
    }
  };

  win.eval(SRC);
  const ev = doc.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  doc.dispatchEvent(ev);
  function 지연흘리기() {
    for (let i = 0; i < 6; i++) 지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });
  }
  지연흘리기();

  return {
    win: win,
    M: win.App.ChartOhlcLegend,
    줄: function () { return doc.querySelector(".tl-ohlc"); },
    그림오른끝: 그림오른끝,
    상자폭: function () {
      const el = doc.querySelector(".tl-ohlc");
      return el && el.style.maxWidth ? parseInt(el.style.maxWidth, 10) : null;
    },
    통화바꾸기: function (v) {
      통화 = v;
      win.App.Bus.emit("currency:change", { currency: v });
      지연흘리기();
    },
    십자선: function (봉) {
      const 지도 = new win.Map();
      if (봉) 지도.set(캔들, 봉);
      chart.__십자선({ time: 봉 ? 봉.time : undefined, seriesData: 지도 });
    },
    닫기: function () { dom.window.close(); }
  };
}

/* 이 모듈이 넣은 <style> 안에서 선택자 하나의 선언 뭉치를 꺼냅니다 */
function 규칙(css, 선택자) {
  const i = css.indexOf(선택자 + "{");
  if (i < 0) return null;
  const j = css.indexOf("}", i);
  return j < 0 ? null : css.slice(i + 선택자.length + 1, j);
}

console.log("==========================================================");
console.log(" 십자선 OHLC 줄이 가격축을 안 덮는가 (통화가 바뀌어도)");
console.log("==========================================================");

/* =========================================================================
 * [A] 오른끝을 ★재서★ 정하는가 — 정적 px 이 아닌가
 * ========================================================================= */
절("[A] 오른끝을 ★그림 영역을 재서★ 정하는가 (정적 px 금지)");
{
  const t = 띄우기({ 통화: "USDT" });
  const el = t.줄();
  ok("줄이 차트 안(.chart-wrap)에 붙었다", !!el && el.parentNode.className === "chart-wrap",
    "붙은 곳: " + (el && el.parentNode && el.parentNode.className));

  const 폭U = t.상자폭();
  const 기대U = t.그림오른끝() - WRAP_L - 8 /* left */ - 6 /* gap */;
  ok("USDT 에서 상자 오른끝을 실제로 쟀다 (max-width " + 폭U + "px)",
    폭U !== null, "max-width 가 안 들어갔습니다 — 재는 길이 안 돕니다");
  ok("그 값이 ★그림 영역 오른끝 − 왼여백 − 틈★ 과 같다 (" + 폭U + " = " + 기대U + ")",
    폭U === 기대U, "잰 값: " + 폭U + " / 셈한 값: " + 기대U);
  /* 진짜로 안 덮는지 — 상자 오른끝이 그림 영역 안인가 */
  const 오른끝U = WRAP_L + 8 + 폭U;
  ok("상자 오른끝(" + 오른끝U + ")이 그림 영역 오른끝(" + t.그림오른끝() + ") 안이다",
    오른끝U <= t.그림오른끝(), "가격축을 " + (오른끝U - t.그림오른끝()) + "px 덮습니다");

  /* ★핵심★ — 통화를 바꾸면 가격축이 넓어집니다(131 -> 169). 따라가야 합니다. */
  t.통화바꾸기("KRW");
  const 폭K = t.상자폭();
  const 기대K = t.그림오른끝() - WRAP_L - 8 - 6;
  ok("★통화를 KRW 로 바꾸니 상자도 같이 좁아졌다★ (" + 폭U + " -> " + 폭K + ")",
    폭K === 기대K && 폭K < 폭U,
    "정적 px 로 막아 두면 여기서 걸립니다. 잰 값 " + 폭K + " / 셈한 값 " + 기대K);
  const 오른끝K = WRAP_L + 8 + 폭K;
  ok("KRW 에서도 상자 오른끝(" + 오른끝K + ")이 그림 영역(" + t.그림오른끝() + ") 안이다",
    오른끝K <= t.그림오른끝(), "가격축을 " + (오른끝K - t.그림오른끝()) + "px 덮습니다");
  ok("가격축이 " + 축폭.USDT + " -> " + 축폭.KRW + " 로 넓어진 만큼 상자가 줄었다 (" +
      (폭U - 폭K) + "px)", 폭U - 폭K === 축폭.KRW - 축폭.USDT,
    "차이 " + (폭U - 폭K) + " / 가격축 차이 " + (축폭.KRW - 축폭.USDT));
  t.닫기();
}

/* =========================================================================
 * [B] 값을 자르지 않는가 — B안(ellipsis) 을 못 쓰게 막습니다
 * ========================================================================= */
절("[B] 값을 ★… 로 자르지 않는가★ (조사팀 B안 금지)");
{
  const t = 띄우기({ 통화: "KRW" });
  const 스타일 = t.win.document.getElementById(t.M.STYLE_ID);
  const css = 스타일 ? 스타일.textContent : "";
  ok("이 모듈이 넣은 <style> 을 읽었다 (" + css.length + "자)", css.length > 0, "스타일이 없습니다");

  const 본규칙 = 규칙(css, ".tl-ohlc");
  ok(".tl-ohlc 본 규칙을 찾았다", !!본규칙, "선택자가 바뀌었나요?");
  ok("본 규칙에 text-overflow 가 없다 (값이 … 로 잘리면 십자선의 쓸모가 사라집니다)",
    !!본규칙 && 본규칙.indexOf("text-overflow") === -1, 본규칙);
  ok("본 규칙에 overflow:hidden 이 없다",
    !!본규칙 && !/overflow\s*:\s*hidden/.test(본규칙), 본규칙);
  ok("줄바꿈이 살아 있다 (flex-wrap:wrap — 좁아지면 자르지 말고 ★줄을 늘립니다★)",
    !!본규칙 && /flex-wrap\s*:\s*wrap/.test(본규칙), 본규칙);

  /* 소스 전체에도 이 줄에 ellipsis 를 붙이는 자리가 없어야 합니다 */
  ok("소스 어디에도 이 줄에 ellipsis 를 붙이지 않는다",
    SRC.indexOf("ellipsis") === -1, "ellipsis 가 소스에 있습니다");

  /* 값이 실제로 온전한가 — 잘린 흔적(…)이 없어야 합니다 */
  t.십자선(봉들[1]);
  const 글자 = t.줄().textContent;
  ok("십자선을 짚으면 O·H·L·C 네 값이 다 나온다",
    글자.indexOf("₩" + 200 * 1300) !== -1 && 글자.indexOf("₩" + 260 * 1300) !== -1 &&
    글자.indexOf("₩" + 190 * 1300) !== -1 && 글자.indexOf("₩" + 240 * 1300) !== -1, 글자);
  ok("값에 잘린 표시(…)가 없다", 글자.indexOf("…") === -1 && 글자.indexOf("...") === -1, 글자);
  t.닫기();
}

/* =========================================================================
 * [C] 십자선을 떼면 원래대로 돌아오는가 (PM 지시)
 * ========================================================================= */
절("[C] 십자선을 떼면 ★원래대로★ 돌아오는가");
{
  const t = 띄우기({ 통화: "KRW" });
  const el = t.줄();
  const 처음 = el.className;
  ok("처음에는 펼침(tl-ohlc-live) 이 아니다", 처음.indexOf("tl-ohlc-live") === -1, 처음);

  t.십자선(봉들[1]);
  ok("십자선을 짚으면 펼쳐진다 (폰에서 O·H·L 이 다시 보입니다)",
    t.줄().className.indexOf("tl-ohlc-live") !== -1, t.줄().className);

  t.십자선(null);   /* 차트 밖으로 나감 */
  ok("★십자선을 떼면 다시 접힌다★ — 안 돌아오면 그게 새 고장입니다",
    t.줄().className.indexOf("tl-ohlc-live") === -1, t.줄().className);
  ok("떼고 나서도 상자 오른끝은 그대로 그림 영역 안이다",
    WRAP_L + 8 + t.상자폭() <= t.그림오른끝(),
    "오른끝 " + (WRAP_L + 8 + t.상자폭()) + " / 그림 " + t.그림오른끝());
  t.닫기();
}

/* =========================================================================
 * [D] 못 재는 자리에서도 가격축까지 안 늘어나는가 (예비 길)
 * ========================================================================= */
절("[D] 못 재는 자리에서도 ★예비★ 가 남아 있는가");
{
  /* chartElement() 가 없으면 잴 수 없습니다. 그때도 CSS 예비값이 상자를
     .chart-wrap 안으로 묶어야 합니다 — 안 그러면 옛 버그 그대로입니다. */
  const t = 띄우기({ 통화: "KRW", 차트칸없음: true });
  ok("못 재면 inline max-width 를 안 넣는다 (CSS 예비값이 살아 있게)",
    t.상자폭() === null, "넣은 값: " + t.상자폭());
  const 스타일 = t.win.document.getElementById(t.M.STYLE_ID);
  const 본규칙 = 규칙(스타일 ? 스타일.textContent : "", ".tl-ohlc");
  ok("CSS 본 규칙에 ★예비 max-width★ 가 적혀 있다",
    !!본규칙 && /max-width\s*:/.test(본규칙), 본규칙);
  ok("그 예비값이 ★정적 px 이 아니다★ (calc 로 상자를 따라갑니다)",
    !!본규칙 && /max-width\s*:\s*calc\(/.test(본규칙),
    "정적 px 로 적으면 가격축 폭 네 가지(75/93/131/169)를 못 따라갑니다: " + 본규칙);
  t.닫기();
}

/* =========================================================================
 * [E] 왼여백을 두 곳에 적지 않았는가 (어긋나면 그만큼 덮습니다)
 * ========================================================================= */
절("[E] 왼여백(8px)을 CSS 와 셈이 ★같은 값★ 으로 쓰는가");
{
  const css왼 = /\.tl-ohlc\{[^}]*left:\s*(\d+)px/.exec(SRC.replace(/"\s*\+\s*EL_CLASS\s*\+\s*"/g, "tl-ohlc"));
  const 셈왼 = /BOX_LEFT\s*=\s*(\d+)/.exec(SRC);
  ok("CSS 의 left 값을 읽었다", !!css왼, "선택자 모양이 바뀌었습니다");
  ok("셈에 쓰는 BOX_LEFT 를 읽었다", !!셈왼, "BOX_LEFT 가 없습니다");
  ok("두 값이 같다 (CSS " + (css왼 && css왼[1]) + "px = BOX_LEFT " + (셈왼 && 셈왼[1]) + ")",
    !!css왼 && !!셈왼 && css왼[1] === 셈왼[1],
    "어긋나면 그 차이만큼 가격축을 덮거나 쓸데없이 좁아집니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach(function (s) { console.log("  - " + s); });
} else {
  console.log("전체 통과 ✅");
}
process.exit(fail ? 1 : 0);
