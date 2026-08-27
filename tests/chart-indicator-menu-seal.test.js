/* tests/chart-indicator-menu-seal.test.js
 * =========================================================================
 * fx 지표 목록 — 기간·색을 여기서 다시 정하지 않는다 + 화면 기준으로 열린다
 * =========================================================================
 * 2026-08-28 — 기록팀 봉인 / 본부장 배정 (봉인 0건 목록 1순위)
 *
 * js/chart-indicator-menu.js 는 579줄인데 봉인이 하나도 없었습니다.
 *
 * ── ⭐ 무엇이 제일 위험한가 ─────────────────────────────────────────────
 *
 *   이 파일 머리에 이렇게 적혀 있습니다.
 *       "계산식·색·기간을 여기서 다시 정하지 않습니다. 전부 저쪽에서
 *        읽어옵니다 (App.ChartIndicators.MA_PERIODS / BB_PERIOD / ...)"
 *
 *   아무도 안 지키는 약속입니다. 주석일 뿐이라 누가 목록 이름표에
 *   "MA(7)" 이라고 글자로 박아 넣어도 아무 검사도 안 걸립니다.
 *
 *   그러면 js/chart-indicators.js 의 MA_PERIODS 를 바꾼 날,
 *   차트에는 MA(20) 이 그려지는데 목록에는 "MA(7)" 이라고 적힙니다.
 *   오류도 안 나고 목록도 멀쩡히 열립니다. 회원은 자기가 켠 것이
 *   7일선인 줄 알고 판단합니다 — 전형적인 조용한 고장입니다.
 *
 *   그래서 [1] 은 지표 파일의 값을 일부러 이상한 숫자로 바꿔 끼우고,
 *   목록 이름표가 그 숫자를 그대로 따라오는지 봅니다. 글자로 박아 넣으면
 *   따라오지 못하고 그 자리에서 터집니다.
 *   [1-2] 는 진짜 파일의 값과 목록이 지금 일치하는지도 같이 봅니다
 *   (이미 갈라져 있으면 여기서 걸립니다).
 *
 * ── 두 번째 — 화면 밖에서 열리던 문제 (2026-08-27 P2, 이미 고침) ────────
 *
 *   360x800 실측 — 목록 651~1038, 화면 800, 하단 매수/매도 바 위끝 727
 *   → 7줄 중 0줄이 보였습니다. 차트 칸(.chart-panel) 높이만 보고
 *   화면을 안 봤기 때문입니다(차트 칸은 폰에서 화면보다 훨씬 깁니다).
 *
 *   [3] 은 그 계산부(place / floorY / vpW / vpH / fullscreenOn)를
 *   원본에서 글자 그대로 떼어내 가짜 화면 위에서 돌립니다.
 *   계산을 베껴 쓰면 원본이 바뀌어도 테스트는 옛 계산만 지키게 되므로
 *   베끼지 않았습니다 (tests/chart-chip-viewport-seal.test.js 와 같은 방식).
 *
 *   주의 — 차트팀이 함수 이름을 바꾸면 [3] 이 "못 찾았다" 로 멈춥니다.
 *   그건 고장이 아니라 신호입니다. 아래 GEOM 목록의 이름만 고쳐 주세요.
 *
 * ── 여기서 봉인하지 않는 것 ─────────────────────────────────────────────
 *   지표의 계산식(SMA·볼린저·RSI·MACD) — tests/chart-indicators.test.js,
 *   tests/chart-oscillators.test.js 가 봅니다. 여기서는 "목록" 만 봅니다.
 *
 * 이 파일은 파일만 읽습니다. 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const 읽기 = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const SRC = 읽기("js/chart-indicator-menu.js");

let pass = 0, fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

/* -------------------------------------------------------------------------
 * 모듈 띄우기 — 지표 모듈을 진짜로 쓸지 가짜로 쓸지 고를 수 있게 합니다.
 * ----------------------------------------------------------------------- */
function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    "<!doctype html><html><body><div class='chart-panel'></div></body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  win.eval("window.App = window.App || {}; App.Bus = { on: function(){}, off: function(){}, emit: function(){} };");

  if (옵션.진짜지표) {
    win.eval(읽기("js/chart-indicators.js"));
    win.eval(읽기("js/chart-oscillators.js"));
  }
  if (옵션.ind !== undefined) win.App.ChartIndicators = 옵션.ind;
  if (옵션.osc !== undefined) win.App.ChartOscillators = 옵션.osc;

  win.eval(SRC);
  return { win: win, App: win.App, doc: win.document };
}

console.log("\nfx 지표 목록 — 기간·색은 지표 파일에서만 온다 + 화면 기준으로 열린다");

/* =========================================================================
 * [1] 기간·색을 여기서 다시 정하지 않는다
 *     지표 파일 값을 "실제 기본값과 전혀 다른 숫자" 로 바꿔 끼웁니다.
 *     목록이 글자로 박아 놓았다면 따라오지 못합니다.
 * ========================================================================= */
절("[1] 기간·색이 지표 파일에서 온다 (여기서 다시 정하지 않는다)");
{
  const 가짜IND = {
    MA_PERIODS: { ma7: 5, ma25: 33, ma99: 120 },
    BB_PERIOD: 30,
    BB_MULT: 3,
    COLORS: { ma7: "#111111", ma25: "#222222", ma99: "#333333", bb: "#444444" },
    isOn: function () { return false; },
    toggle: function () {}
  };
  const 가짜OSC = {
    RSI_PERIOD: 21,
    MACD_FAST: 8, MACD_SLOW: 17, MACD_SIGNAL: 6,
    COLORS: { rsi: "#555555", signal: "#666666" },
    isOn: function () { return false; },
    toggle: function () {}
  };

  const r0 = 띄우기({ ind: 가짜IND, osc: 가짜OSC });
  const rows = r0.App.ChartIndicatorMenu.getRowsForTest();
  const 이름 = {};
  const 색 = {};
  rows.forEach(function (r) { 이름[r.key] = r.name; 색[r.key] = r.color; });

  ok("줄이 7개다 (MA 3 · 볼린저 · 거래량 · RSI · MACD)", rows.length === 7, String(rows.length));

  ok("MA 기간을 지표 파일에서 읽는다 — MA(5)/MA(33)/MA(120)",
    이름.ma7 === "MA(5)" && 이름.ma25 === "MA(33)" && 이름.ma99 === "MA(120)",
    JSON.stringify([이름.ma7, 이름.ma25, 이름.ma99]) +
    " — 7/25/99 가 그대로 나오면 이 파일에 글자로 박은 것입니다");

  ok("볼린저 기간·배수를 지표 파일에서 읽는다 — BOLL(30, 3)",
    이름.bb === "BOLL(30, 3)", String(이름.bb));

  ok("RSI 기간을 오실레이터 파일에서 읽는다 — RSI(21)",
    이름.rsi === "RSI(21)", String(이름.rsi));

  ok("MACD 세 값을 오실레이터 파일에서 읽는다 — MACD(8, 17, 6)",
    이름.macd === "MACD(8, 17, 6)", String(이름.macd));

  ok("색도 지표 파일의 COLORS 를 그대로 쓴다",
    색.ma7 === "#111111" && 색.ma25 === "#222222" && 색.ma99 === "#333333" && 색.bb === "#444444",
    JSON.stringify([색.ma7, 색.ma25, 색.ma99, 색.bb]));

  ok("오실레이터 색도 그대로 쓴다 (RSI 는 rsi, MACD 는 signal)",
    색.rsi === "#555555" && 색.macd === "#666666",
    JSON.stringify([색.rsi, 색.macd]));

  /* 왜 이렇게 되는지 소스로도 한 줄 남깁니다 — 터졌을 때 바로 읽히게 */
  const rowsFn = (function () {
    const i = SRC.indexOf("function rows()");
    if (i < 0) return "";
    const j = SRC.indexOf("function mod(", i);
    return SRC.slice(i, j < 0 ? SRC.length : j);
  })();
  ok("rows() 가 MA_PERIODS / BB_PERIOD / BB_MULT 를 실제로 읽는다",
    rowsFn.indexOf("MA_PERIODS") !== -1 && rowsFn.indexOf("BB_PERIOD") !== -1 &&
    rowsFn.indexOf("BB_MULT") !== -1,
    "rows() 안에서 못 찾았습니다");
  ok("rows() 가 RSI_PERIOD / MACD_FAST / MACD_SLOW / MACD_SIGNAL 을 실제로 읽는다",
    rowsFn.indexOf("RSI_PERIOD") !== -1 && rowsFn.indexOf("MACD_FAST") !== -1 &&
    rowsFn.indexOf("MACD_SLOW") !== -1 && rowsFn.indexOf("MACD_SIGNAL") !== -1,
    "rows() 안에서 못 찾았습니다");
}

/* =========================================================================
 * [1-2] 지금 진짜 파일과 목록이 갈라져 있지 않다
 *       (이미 갈라져 있으면 [1] 만으로는 못 잡습니다)
 * ========================================================================= */
절("[1-2] 진짜 지표 파일의 값과 목록이 일치한다");
{
  const r1 = 띄우기({ 진짜지표: true });
  const IND = r1.App.ChartIndicators;
  const OSC = r1.App.ChartOscillators;
  const rows = r1.App.ChartIndicatorMenu.getRowsForTest();
  const 이름 = {};
  rows.forEach(function (r) { 이름[r.key] = r.name; });

  ok("MA(" + IND.MA_PERIODS.ma7 + ") 가 목록에 그대로 있다",
    이름.ma7 === "MA(" + IND.MA_PERIODS.ma7 + ")", String(이름.ma7));
  ok("MA(" + IND.MA_PERIODS.ma25 + ") 가 목록에 그대로 있다",
    이름.ma25 === "MA(" + IND.MA_PERIODS.ma25 + ")", String(이름.ma25));
  ok("MA(" + IND.MA_PERIODS.ma99 + ") 가 목록에 그대로 있다",
    이름.ma99 === "MA(" + IND.MA_PERIODS.ma99 + ")", String(이름.ma99));
  ok("BOLL(" + IND.BB_PERIOD + ", " + IND.BB_MULT + ") 가 목록에 그대로 있다",
    이름.bb === "BOLL(" + IND.BB_PERIOD + ", " + IND.BB_MULT + ")", String(이름.bb));
  ok("RSI(" + OSC.RSI_PERIOD + ") 가 목록에 그대로 있다",
    이름.rsi === "RSI(" + OSC.RSI_PERIOD + ")", String(이름.rsi));
  ok("MACD(" + OSC.MACD_FAST + ", " + OSC.MACD_SLOW + ", " + OSC.MACD_SIGNAL + ") 가 목록에 그대로 있다",
    이름.macd === "MACD(" + OSC.MACD_FAST + ", " + OSC.MACD_SLOW + ", " + OSC.MACD_SIGNAL + ")",
    String(이름.macd));

  /* 바이낸스 표기 — 차트 위 범례가 "MA(7)" 처럼 기간을 괄호로 적습니다 */
  ok("기간을 괄호로 적는다 (바이낸스 표기, 2026-08-27 실측)",
    /^MA\(\d+\)$/.test(이름.ma7) && /^RSI\(\d+\)$/.test(이름.rsi),
    JSON.stringify([이름.ma7, 이름.rsi]));
}

/* =========================================================================
 * [2] 켜고 끄기는 저쪽 공개 함수(toggle / isOn)로만 한다
 *     여기서 상태를 따로 들고 있으면 두 곳이 서로 다른 값을 보게 됩니다.
 * ========================================================================= */
절("[2] 켜고 끄기는 지표 파일의 toggle / isOn 으로만 한다");
{
  const 부른것 = [];
  const 켜짐 = {};
  const 가짜IND = {
    MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 }, BB_PERIOD: 20, BB_MULT: 2, COLORS: {},
    isOn: function (k) { return !!켜짐[k]; },
    toggle: function (k) { 부른것.push(k); 켜짐[k] = !켜짐[k]; }
  };
  const r2 = 띄우기({ ind: 가짜IND });
  const App = r2.App, doc = r2.doc, win = r2.win;

  ok("오실레이터 파일이 없으면 RSI·MACD 줄이 아예 안 생긴다",
    App.ChartIndicatorMenu.getRowsForTest().every(function (r) { return r.who !== "osc"; }),
    JSON.stringify(App.ChartIndicatorMenu.getRowsForTest().map(function (r) { return r.key; })));

  App.ChartIndicatorMenu.open(null);
  const 줄 = doc.querySelectorAll("#" + App.ChartIndicatorMenu.PANEL_ID + " .tl-fx-row");
  ok("목록이 열리고 줄이 5개다 (지표 파일 것만)", 줄.length === 5, String(줄.length));

  const ma25줄 = doc.querySelector('.tl-fx-row[data-key="ma25"]');
  ok("처음엔 꺼진 상태로 그려진다", !!ma25줄 && ma25줄.getAttribute("aria-pressed") === "false",
    ma25줄 ? ma25줄.getAttribute("aria-pressed") : "줄 없음");

  ma25줄.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("줄을 누르면 지표 파일의 toggle('ma25') 이 불린다",
    부른것.length === 1 && 부른것[0] === "ma25", JSON.stringify(부른것));
  ok("눌린 뒤 표시가 isOn() 결과를 따라간다 (스스로 기억하지 않는다)",
    ma25줄.getAttribute("aria-pressed") === "true", ma25줄.getAttribute("aria-pressed"));

  /* 지표 파일이 거부해도(예외) 목록이 죽지 않아야 합니다 */
  가짜IND.toggle = function () { throw new Error("지표 쪽 거부"); };
  let 터짐 = false;
  try {
    ma25줄.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  } catch (e) { 터짐 = true; }
  ok("지표 파일이 오류를 던져도 목록이 안 죽는다", 터짐 === false, "예외가 밖으로 나왔습니다");

  App.ChartIndicatorMenu.close();
  ok("닫으면 DOM 이 남지 않는다 (닫혀 있으면 계산도 0)",
    doc.getElementById(App.ChartIndicatorMenu.PANEL_ID) === null);
}

/* =========================================================================
 * [3] 화면(viewport) 기준으로 열린다 — 원본 계산부를 그대로 떼어 돌린다
 * ========================================================================= */
절("[3] 자리잡기 — 원본 place() 를 가짜 화면 위에서 돌린다");

const GEOM = ["vpW", "vpH", "fullscreenOn", "floorY", "place"];

function 함수떼기(name) {
  const i = SRC.indexOf("function " + name + "(");
  if (i < 0) return null;
  let k = SRC.indexOf("{", i);
  if (k < 0) return null;
  let depth = 0;
  for (; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { k++; break; } }
  }
  return SRC.slice(i, k);
}

const 조각 = {};
let 다떼었다 = true;
for (const n of GEOM) { 조각[n] = 함수떼기(n); if (!조각[n]) 다떼었다 = false; }
ok("자리잡기 함수 " + GEOM.length + "개를 원본에서 찾았다", 다떼었다,
  "못 찾은 것: " + GEOM.filter(function (n) { return !조각[n]; }).join(", ") +
  " (차트팀이 이름을 바꿨다면 이 파일의 GEOM 목록을 고치세요)");

const mEDGE = /var\s+EDGE\s*=\s*(\d+)\s*;/.exec(SRC);
ok("화면 가장자리 여백(EDGE)이 원본에 있다", !!mEDGE, String(mEDGE));
const EDGE = mEDGE ? Number(mEDGE[1]) : 8;
ok("여백이 8px 다 (바뀌면 아래 기대값도 같이 봐야 합니다)", EDGE === 8, String(EDGE));

/* 가짜 화면 — jsdom 은 배치를 계산하지 않으므로 크기를 직접 줍니다.
   머리 33 + 발 30 = 63, 안내줄 27, 목록 몸통 324 → 다 펼치면 387px.
   387 은 2026-08-27 에 실제로 잰 목록 높이입니다. */
const HEAD = 33, FOOT = 30, HINT = 27, LIST자연 = 324;

function 상황(설정) {
  const listEl = {
    style: {},
    get offsetHeight() {
      const mh = this.style.maxHeight;
      if (!mh) return LIST자연;
      return Math.min(LIST자연, parseInt(mh, 10) || LIST자연);
    }
  };
  const hintEl = { style: { display: "none" } };
  const panel = {
    style: {},
    offsetWidth: 250,
    get offsetHeight() {
      return HEAD + FOOT + (hintEl.style.display === "block" ? HINT : 0) + listEl.offsetHeight;
    },
    querySelector: function (s) {
      if (s === ".tl-fx-list") return listEl;
      if (s === ".tl-fx-hint") return hintEl;
      return null;
    }
  };
  const anchorBtn = 설정.버튼
    ? { getBoundingClientRect: function () { return 설정.버튼; } }
    : null;
  const 바 = 설정.하단바
    ? { getBoundingClientRect: function () { return 설정.하단바; },
        __display: 설정.하단바.display || "block" }
    : null;
  const 지표막대 = 설정.지표막대
    ? { getBoundingClientRect: function () { return 설정.지표막대; } }
    : null;

  const ctx = {
    EDGE: EDGE,
    panel: panel,
    anchorBtn: anchorBtn,
    Math: Math,
    window: {
      innerWidth: 설정.w,
      innerHeight: 설정.h,
      getComputedStyle: function (el) {
        return { display: el && el.__display ? el.__display : "block" };
      }
    },
    document: {
      documentElement: { clientWidth: 설정.w, clientHeight: 설정.h },
      fullscreenElement: 설정.전체화면 ? {} : null,
      webkitFullscreenElement: null,
      querySelector: function (s) {
        if (s === ".tl-order-bar") return 바;
        if (s === ".tl-ind-bar") return 지표막대;
        return null;
      }
    }
  };
  vm.createContext(ctx);
  vm.runInContext(GEOM.map(function (n) { return 조각[n]; }).join("\n"), ctx);
  vm.runInContext("place();", ctx);

  return {
    top: parseFloat(panel.style.top),
    left: parseFloat(panel.style.left),
    높이: panel.offsetHeight,
    잘림: !!listEl.style.maxHeight,
    안내줄: hintEl.style.display === "block",
    바닥: vm.runInContext("floorY();", ctx)
  };
}

/* ── 3-1) 2026-08-27 에 실제로 깨졌던 상황 그대로 ──────────────────── */
절("[3-1] 360x800 · 하단 매수/매도 바 있음 — 고치기 전 아래끝 1038 (화면 800 밖)");
{
  const r = 상황({
    w: 360, h: 800,
    버튼: { left: 117, right: 133, top: 574, bottom: 590, width: 16, height: 16 },
    지표막대: { left: 8, right: 200, top: 631, bottom: 647, width: 192, height: 16 },
    하단바: { left: 0, right: 360, top: 727, bottom: 800, width: 360, height: 73 }
  });
  ok("하단 매수/매도 바 위를 마지노선으로 삼는다 (바닥 719)", r.바닥 === 719, String(r.바닥));
  ok("목록 위끝이 화면 안이다 (top >= 8)", r.top >= 8, "top " + r.top);
  ok("목록 아래끝이 하단 바 위다 (고치기 전 1038)", r.top + r.높이 <= r.바닥,
    "아래끝 " + (r.top + r.높이) + " / 바닥 " + r.바닥);
  ok("아래가 모자라 버튼 위로 뒤집어 열렸다 (아래끝 = 버튼 위끝 - 4 = 570)",
    Math.round(r.top + r.높이) === 570, "아래끝 " + (r.top + r.높이));
  ok("7줄이 다 보인다 (잘리지 않았다)", r.잘림 === false && r.안내줄 === false,
    "잘림 " + r.잘림 + " / 안내줄 " + r.안내줄);
}

/* ── 3-2) 노트북 — 버튼 아래 4px, 버튼 한가운데 (바이낸스 실측) ────── */
절("[3-2] 1440x900 · 하단 바 없음 — 버튼 아래 4px · 버튼 한가운데");
{
  const r = 상황({
    w: 1440, h: 900,
    버튼: { left: 345, right: 361, top: 220, bottom: 236, width: 16, height: 16 }
  });
  ok("버튼 아래 4px 에서 시작한다 (바이낸스 실측 236 -> 240)", r.top === 240, "top " + r.top);
  ok("좌우가 버튼 한가운데다 (버튼가운데 353 - 폭250/2 = 228)", r.left === 228, "left " + r.left);
  ok("잘리지 않았다", r.잘림 === false);
}

/* ── 3-3) 위아래 어디에도 안 들어갈 때 — 몸통만 줄이고 안내줄을 켠다 ── */
절("[3-3] 360x420 · 아주 낮은 화면 — 몸통만 줄이고 '밀면 더 보인다' 안내줄");
{
  const r = 상황({
    w: 360, h: 420,
    버튼: { left: 117, right: 133, top: 284, bottom: 300, width: 16, height: 16 },
    하단바: { left: 0, right: 360, top: 380, bottom: 420, width: 360, height: 40 }
  });
  ok("목록이 화면 안에 들어온다", r.top >= 8 && r.top + r.높이 <= r.바닥,
    "top " + r.top + " · 아래끝 " + (r.top + r.높이) + " · 바닥 " + r.바닥);
  ok("몸통을 줄여서 스크롤시킨다", r.잘림 === true);
  ok("'밀면 더 보인다' 안내줄을 켠다 (안 켜면 회원이 나머지가 있는 줄 모릅니다)",
    r.안내줄 === true);
}

/* ── 3-4) 전체화면이면 하단 바를 세지 않는다 ──────────────────────── */
절("[3-4] 전체화면 — 하단 매수/매도 바는 안 그려지므로 세지 않는다");
{
  const 설정 = {
    w: 360, h: 800,
    버튼: { left: 117, right: 133, top: 184, bottom: 200, width: 16, height: 16 },
    하단바: { left: 0, right: 360, top: 400, bottom: 800, width: 360, height: 400 }
  };
  const 보통 = 상황(설정);
  const 전체 = 상황(Object.assign({}, 설정, { 전체화면: true }));
  ok("보통일 때는 바 위(392)가 바닥이라 잘린다", 보통.바닥 === 392 && 보통.잘림 === true,
    "바닥 " + 보통.바닥 + " / 잘림 " + 보통.잘림);
  ok("전체화면이면 바닥이 화면 끝(792)이고 안 잘린다",
    전체.바닥 === 792 && 전체.잘림 === false, "바닥 " + 전체.바닥 + " / 잘림 " + 전체.잘림);
}

/* ── 3-5) 좌우가 화면 밖으로 안 나간다 ────────────────────────────── */
절("[3-5] 360 폭 — 목록이 좌우로 화면 밖에 안 나간다");
{
  const 오른쪽 = 상황({
    w: 360, h: 800,
    버튼: { left: 340, right: 356, top: 220, bottom: 236, width: 16, height: 16 }
  });
  ok("오른쪽 끝 버튼이어도 오른쪽으로 안 넘친다",
    오른쪽.left + 250 <= 360 - EDGE, "left " + 오른쪽.left + " → 오른끝 " + (오른쪽.left + 250));
  const 왼쪽 = 상황({
    w: 360, h: 800,
    버튼: { left: 4, right: 20, top: 220, bottom: 236, width: 16, height: 16 }
  });
  ok("왼쪽 끝 버튼이어도 왼쪽으로 안 넘친다 (left >= 8)", 왼쪽.left >= EDGE, "left " + 왼쪽.left);
}

/* ── 3-6) 이미 있는 지표 막대(.tl-ind-bar)를 덮지 않는다 ──────────── */
절("[3-6] 아래로 열 때 지표 막대를 덮지 않는다");
{
  const r = 상황({
    w: 1440, h: 900,
    버튼: { left: 345, right: 361, top: 220, bottom: 236, width: 16, height: 16 },
    지표막대: { left: 200, right: 500, top: 250, bottom: 270, width: 300, height: 20 }
  });
  ok("지표 막대 아래 4px 로 밀린다 (270 -> 274)", r.top === 274, "top " + r.top);
}

/* =========================================================================
 * [4] CSS — 화면 기준(fixed) · 규칙이 한 벌 · 모서리 10px · 확정 팔레트
 * ========================================================================= */
절("[4] CSS — 최종 position 이 fixed · 한 벌 · 모서리 10px · 확정 팔레트");
{
  /* 소스 글자를 찾지 않고, 실제로 화면에 들어가는 <style> 을 읽습니다.
     이 모듈은 CSS 를 "P + \"{position:fixed;...\"" 처럼 변수로 이어 붙이므로
     소스에서 "#tl-fx-menu{" 를 찾으면 영영 못 찾습니다(0개가 나옵니다). */
  const r4 = 띄우기({
    ind: { MA_PERIODS: {}, COLORS: {}, isOn: function () { return false; }, toggle: function () {} }
  });
  r4.App.ChartIndicatorMenu.open(null);
  const st = r4.doc.getElementById("chart-indicator-menu-style");
  ok("목록을 열면 <style> 이 실제로 들어간다", !!st, "chart-indicator-menu-style 을 못 찾았습니다");
  const CSS = st ? st.textContent : "";
  r4.App.ChartIndicatorMenu.close();

  const 머리 = "#tl-fx-menu{";
  const 블록들 = [];
  let from = 0;
  for (;;) {
    const i = CSS.indexOf(머리, from);
    if (i < 0) break;
    const j = CSS.indexOf("}", i);
    if (j < 0) break;
    블록들.push(CSS.slice(i + 머리.length, j));
    from = j + 1;
  }
  ok("#tl-fx-menu 규칙이 한 벌뿐이다 (두 벌이면 뒤엣것이 이깁니다)",
    블록들.length === 1, "블록 " + 블록들.length + "개");

  let 최종 = null;
  블록들.forEach(function (b) {
    const mm = /(?:^|;)\s*position\s*:\s*([a-z]+)/.exec(b);
    if (mm) 최종 = mm[1];
  });
  ok("최종 position 이 fixed 다 (absolute 로 되돌리면 폰에서 화면 밖에 열립니다)",
    최종 === "fixed", String(최종));

  const 본문 = 블록들.join(";");
  ok("bottom 앵커가 없다 (칸 기준으로 붙이던 옛 방식)",
    !/(?:^|;)\s*bottom\s*:/.test(본문), 본문.slice(0, 90));
  ok("right 앵커가 없다", !/(?:^|;)\s*right\s*:/.test(본문), 본문.slice(0, 90));

  const mr = /border-radius\s*:\s*(\d+)px/.exec(본문);
  ok("모서리가 10px 이다 (상한 12px)", !!mr && Number(mr[1]) === 10, mr ? mr[1] + "px" : "없음");
  ok("그림자를 쓰지 않는다 (대신 카드 위쪽 흰색 3% 얇은 선)",
    /box-shadow\s*:\s*none/.test(본문) && CSS.indexOf("rgba(255,255,255,.03)") !== -1,
    본문.slice(0, 120));

  /* 확정 팔레트 밖의 색을 새로 만들지 않았는지.
     ⚠ 주석은 빼고 봅니다 — 이 파일 머리에 바이낸스 실측값(#202630 · #EAECEF)이
        "우리가 안 따라간 것" 으로 적혀 있어서, 주석까지 세면 오탐이 납니다. */
  const 코드만 = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5", "#838DA4",
    "#26C281", "#F0506E", "#F0B429"];
  const 색들 = (코드만.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(function (s) { return s.toUpperCase(); });
  ok("코드에서 색을 실제로 찾았다 (탐지기가 고장나면 0개가 됩니다)", 색들.length >= 5,
    "찾은 색 " + 색들.length + "개");
  const 밖 = Array.from(new Set(색들.filter(function (c) { return 팔레트.indexOf(c) === -1; })));
  ok("확정 팔레트 밖의 색을 만들지 않았다", 밖.length === 0, JSON.stringify(밖));
}

/* =========================================================================
 * [5] index.html 등록 · git 추적
 *     2026-08-27 에 "디스크엔 있는데 git 엔 없는 파일" 이 하루 세 번 났습니다.
 *     fs.existsSync 로는 안 잡혀서 git ls-files 로 봅니다.
 * ========================================================================= */
절("[5] index.html 등록 · git 추적 · 실행 목록 등록");
{
  const html = 읽기("index.html");
  ok("index.html 이 js/chart-indicator-menu.js 를 부른다",
    html.indexOf('src="js/chart-indicator-menu.js"') !== -1);

  const ii = html.indexOf('src="js/chart-indicators.js"');
  const oi = html.indexOf('src="js/chart-oscillators.js"');
  const mi = html.indexOf('src="js/chart-indicator-menu.js"');
  ok("지표·오실레이터 파일보다 뒤에 있다 (목록이 그 값을 읽습니다)",
    ii !== -1 && oi !== -1 && mi !== -1 && mi > ii && mi > oi,
    "indicators " + ii + " / oscillators " + oi + " / menu " + mi);

  let tracked = "";
  try {
    tracked = require("child_process")
      .execFileSync("git", ["ls-files", "-z", "js/chart-indicator-menu.js"], { cwd: REPO })
      .toString().split(" ").filter(Boolean)[0] || "";
  } catch (e) { tracked = ""; }
  ok("git 에 추적되고 있다 (clone 한 PC 에서 빈 링크가 되지 않는다)",
    tracked === "js/chart-indicator-menu.js", tracked || "git ls-files 결과 없음");

  const order = 읽기("tests/_order.txt");
  ok("tests/_order.txt 에 이 파일이 등록됐다",
    order.indexOf("tests/chart-indicator-menu-seal.test.js") !== -1,
    "등록 안 하면 npm test 가 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
