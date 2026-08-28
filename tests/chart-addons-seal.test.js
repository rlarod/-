/* tests/chart-addons-seal.test.js
 * =========================================================================
 * 차트 곁다리 모듈 셋 봉인 — 2026-08-28
 *   js/chart-axis-fit.js    폰에서 가격축이 캔들을 잡아먹던 것
 *   js/chart-axis-edge.js   시간축 맨 끝 눈금 글자가 잘리던 것 ("06:00" -> "06:")
 *   js/chart-tab-mobile.js  폰에서 차트를 호가창 탭 자리로 모은 것
 * =========================================================================
 * 왜 이 파일이 생겼나
 *
 *   셋 다 "js/chart.js 를 못 고치니 밖에서 감싼다" 는 우회 모듈인데,
 *   봉인이 하나도 없었습니다. 우회 모듈은 원래 모듈보다 조용히 깨집니다 —
 *   기능이 사라져도 화면은 멀쩡해 보이고 오류도 안 납니다.
 *
 *   실제로 셋 다 "조용한 고장" 이 될 수 있는 자리를 가지고 있습니다.
 *
 *   (1) chart-axis-fit  — 구간표(STEPS) 가 한 칸만 틀어져도 폰에서 축이
 *       다시 두꺼워집니다. 실측 — 360px 원화 표시에서 21px 축은 174px 이고
 *       캔들은 154px 이었습니다(축이 차트의 53%). 지금은 11px / 축 96px 입니다.
 *
 *   (2) chart-axis-edge — 캔버스 배율(devicePixelRatio)을 안 보고
 *       canvas.width 를 그대로 쓰면 밀어넣기가 엉뚱한 자리로 갑니다.
 *       글자는 여전히 찍히므로 아무도 못 알아챕니다.
 *       또 같은 컨텍스트를 두 번 감싸면 밀기가 두 번 걸립니다(250ms 마다
 *       다시 확인하는 구조라 실제로 일어날 수 있는 일입니다).
 *
 *   (3) chart-tab-mobile — 폰을 벗어날 때 data-mtab 을 안 지우면
 *       768~1300 구간에서 "차트" 탭이 선택된 채로 남아 **호가창이 통째로
 *       비어 보입니다.** 모듈 주석에 "실제로 걸렸던 경우" 라고 적혀 있습니다.
 *       CSS 쪽 짝(style.css 의 [data-mtab] 블록)이 사라져도 속성만 붙고
 *       아무 일도 안 일어납니다 — 이것도 조용한 고장입니다.
 *
 * 이 파일은 tests/ 안에서만 돌고, 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");

const FIT_SRC = read("js/chart-axis-fit.js");
const EDGE_SRC = read("js/chart-axis-edge.js");
const TAB_SRC = read("js/chart-tab-mobile.js");
const HTML = read("index.html");
const CSS = read("style.css");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/** 모듈 하나를 빈 창에 띄웁니다. 필요한 것만 미리 심어 둡니다. */
function 창(본문, 준비) {
  const dom = new JSDOM("<!doctype html><html><body>" + (본문 || "") + "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;
  win.App = {};
  if (준비) 준비(win);
  return { win, dom, 닫기() { try { win.close(); } catch (e) { /* noop */ } } };
}

console.log("\n차트 곁다리 모듈 셋 봉인 (2026-08-28)");

/* =========================================================================
 * [0] 수정 금지 파일 · 실려 있는 순서
 * ========================================================================= */
절("[0] 수정 금지 파일 · index.html 에 실려 있는 순서");
{
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/chart.js 를 건드리지 않았다", md5("chart.js") === "02ddcb000d577131f797143d08c09123", md5("chart.js"));
  ok("js/websocket.js 를 건드리지 않았다", md5("websocket.js") === "1a914631175760e0b0cb5144bc11b59e", md5("websocket.js"));

  /* 우회 모듈의 이름이 chart.js 안에 있으면 chart.js 를 고친 것입니다 */
  const CHART = read("js/chart.js");
  ["ChartAxisFit", "ChartAxisEdge", "ChartTabMobile"].forEach(function (n) {
    ok("js/chart.js 안에 " + n + " 이라는 글자가 없다", CHART.indexOf(n) === -1);
  });

  ["js/chart-axis-fit.js", "js/chart-axis-edge.js", "js/chart-tab-mobile.js"].forEach(function (f) {
    ok(f + " 가 index.html 에 한 줄만 실린다",
      (HTML.match(new RegExp(f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length === 1,
      "두 번 실리면 감싸기가 두 겹이 됩니다");
  });

  /* chart-axis-fit 은 chart-font.js 의 FONT_SIZE 를 바꿔 두는 방식이라
     chart-font.js 뒤에 실려야 합니다. */
  ok("chart-axis-fit.js 가 chart-font.js 뒤에 실린다",
    HTML.indexOf("js/chart-axis-fit.js") > HTML.indexOf("js/chart-font.js"));
  ok("chart-axis-edge.js 가 chart.js 뒤에 실린다 (차트가 만들어진 뒤에 감쌉니다)",
    HTML.indexOf("js/chart-axis-edge.js") > HTML.indexOf("js/chart.js"));
}

/* =========================================================================
 * [1] chart-axis-fit — 폰에서 가격축이 캔들을 잡아먹지 않는다
 * ========================================================================= */
절("[1] chart-axis-fit — 축 글씨 구간표");
{
  const t = 창("", function (win) {
    win.innerWidth = 1440;
    win.App.ChartFont = { setFontSize() {} };
  });
  t.win.eval(FIT_SRC);
  const F = t.win.App.ChartAxisFit;

  ok("기본값이 21px 다 (chart-font.js 가 2026-08-18 에 정한 값)", F.getBaseSize() === 21, String(F.getBaseSize()));

  /* 표준 점검 여섯 폭 — 이 표가 틀어지면 폰에서 축이 다시 두꺼워집니다 */
  [[360, 11], [375, 11], [390, 11], [768, 21], [1440, 21], [1920, 21]].forEach(function (p) {
    ok(p[0] + "px 에서 축 글씨가 " + p[1] + "px 다", F.sizeFor(p[0]) === p[1], String(F.sizeFor(p[0])));
  });

  /* 구간 경계 — 한 칸만 밀려도 360 이 다른 칸으로 넘어갑니다 */
  [[439, 11], [440, 14], [559, 14], [560, 16], [767, 16], [768, 21]].forEach(function (p) {
    ok("경계 " + p[0] + "px -> " + p[1] + "px", F.sizeFor(p[0]) === p[1], String(F.sizeFor(p[0])));
  });

  ok("구간표가 세 칸이다 (11 / 14 / 16)",
    F.getSteps().map((s) => s.px).join(",") === "11,14,16", F.getSteps().map((s) => s.px).join(","));
  ok("구간 상한이 439 / 559 / 767 이다",
    F.getSteps().map((s) => s.maxWidth).join(",") === "439,559,767",
    F.getSteps().map((s) => s.maxWidth).join(","));

  /* 768 이상은 chart-font.js 가 정한 21px 를 그대로 둡니다.
     여기를 건드리면 데스크톱 축 글씨가 주변 UI 와 눈높이가 안 맞습니다. */
  ok("768 이상은 chart-font.js 값(21px)을 그대로 둔다",
    [768, 1024, 1440, 1920, 2560].every((w) => F.sizeFor(w) === 21));
  ok("화면 폭을 못 읽으면 21px 로 물러선다 (0 을 넣어도 축이 사라지지 않습니다)",
    F.sizeFor(0) === 21, String(F.sizeFor(0)));

  /* ── "축이 차트의 30% 미만" 규칙이 지금 표에서 실제로 성립하는가 ─────────
     축 폭은 화면 폭이 아니라 글씨 크기로만 정해집니다(모듈 주석의 실측표).
     차트 전체 폭은 (화면폭 - 좌우 여백 32px) 입니다.
     구간표를 누가 손보면 이 계산이 바로 깨집니다. */
  const 축폭 = { 21: 174, 16: 136, 15: 128, 14: 120, 13: 112, 12: 104, 11: 96, 10: 90, 18: 150 };
  [360, 375, 390, 440, 560, 768, 1440, 1920].forEach(function (w) {
    const 비율 = 축폭[F.sizeFor(w)] / (w - 32);
    ok(w + "px 에서 축이 차트의 30% 미만이다 (" + Math.round(비율 * 1000) / 10 + "%)", 비율 < 0.3,
      Math.round(비율 * 1000) / 10 + "%");
  });
  ok("고치기 전 360px 값(21px = 축 174px)은 30% 를 훌쩍 넘었다 — 이게 고친 이유입니다",
    축폭[21] / (360 - 32) > 0.5, Math.round((축폭[21] / (360 - 32)) * 1000) / 10 + "%");

  /* 되돌리기 — 게이트 2 는 되돌리는 방법이 없으면 반려합니다 */
  let 마지막 = null;
  const t2 = 창("", function (win) {
    win.innerWidth = 360;
    win.App.ChartFont = { setFontSize(n) { 마지막 = n; } };
  });
  t2.win.eval(FIT_SRC);
  ok("360px 에서 실제로 11px 를 넣는다", 마지막 === 11, String(마지막));
  ok("적용한 값을 밖에서 읽을 수 있다", t2.win.App.ChartAxisFit.getAppliedSize() === 11);
  t2.win.App.ChartAxisFit.disable();
  ok("disable() 하면 21px 로 되돌린다 (콘솔에서 바로 되돌릴 수 있습니다)", 마지막 === 21, String(마지막));
  t2.닫기();

  ok("주석에 360px 실측(축 174 / 캔들 154)이 남아 있다",
    /축 174px/.test(FIT_SRC) && /캔들 154px/.test(FIT_SRC));
  ok("minimumWidth 로는 못 줄인다는 확인 결과가 남아 있다 (다음 사람이 또 시도하지 않게)",
    /minimumWidth/.test(FIT_SRC) && /최소값/.test(FIT_SRC));
  ok("되돌리는 방법이 적혀 있다", /되돌리기/.test(FIT_SRC) && /ChartAxisFit\.disable\(\)/.test(FIT_SRC));
  t.닫기();
}

/* =========================================================================
 * [1-2] chart-axis-fit 이 매달려 있는 남의 값 — chart-font.js 의 21px
 * =========================================================================
 * 위 [1] 은 chart-axis-fit 이 "21 이라고 알고 있는 값"만 봅니다.
 * 그런데 그 21 은 chart-axis-fit 이 정한 값이 아니라 **chart-font.js 가 정한
 * 값을 손으로 베껴 적어 둔 것**입니다. 21 이 두 파일에 따로 적혀 있습니다.
 *
 *   js/chart-font.js:34      var FONT_SIZE = 21;
 *   js/chart-axis-fit.js:44  var BASE_PX  = 21;   ← 베낀 쪽
 *
 * chart-font.js 는 자기 주석에 "크기를 바꾸려면 아래 FONT_SIZE 만 고치면
 * 됩니다" 라고 적어 두었습니다. 그 말을 믿고 한 줄만 고치면 이렇게 됩니다.
 *
 * 2026-08-28 실측 — chart-font.js 를 21 -> 16 으로만 바꾸고 재어 봤습니다.
 *
 *     360px  : chart-font 가 정한 16 -> axis-fit 통과 뒤 11   (폰은 원래 덮음)
 *     768px  : 16 -> **21**   disable() 뒤에도 21
 *     1440px : 16 -> **21**   disable() 뒤에도 21
 *     1920px : 16 -> **21**   disable() 뒤에도 21
 *
 * 데스크톱 세 폭에서 chart-font.js 의 변경이 **통째로 지워집니다.**
 * 오류도 안 나고 차트도 멀쩡히 그려집니다. 고친 사람은 "왜 안 먹지" 하며
 * chart-font.js 만 들여다보게 됩니다 — 범인은 다른 파일입니다.
 * 되돌리기로 적혀 있는 disable() 조차 16 이 아니라 21 로 되돌립니다.
 *
 * 전형적인 조용한 고장이라 값으로 못 박습니다. 두 겹으로 둡니다 —
 * 글자(두 파일의 21 이 같은가)와 동작(정말 안 덮어쓰는가) 양쪽입니다.
 * ========================================================================= */
절("[1-2] chart-axis-fit 이 베껴 적은 chart-font.js 의 21px");
{
  const FONT_SRC = read("js/chart-font.js");

  const 폰트값 = (FONT_SRC.match(/var FONT_SIZE = (\d+);/) || [])[1];
  const 베낀값 = (FIT_SRC.match(/var BASE_PX = (\d+);/) || [])[1];

  ok("chart-font.js 에서 기본 글씨 크기를 읽을 수 있다 (var FONT_SIZE = N;)",
    폰트값 !== undefined,
    "선언 모양이 바뀌었으면 이 검사부터 고쳐야 합니다 — 조용히 통과시키면 안 됩니다");
  ok("chart-axis-fit.js 에서 베껴 적은 값을 읽을 수 있다 (var BASE_PX = N;)",
    베낀값 !== undefined,
    "선언 모양이 바뀌었으면 이 검사부터 고쳐야 합니다");

  ok("두 파일의 기본 글씨 크기가 같다 (chart-font " + 폰트값 + " / chart-axis-fit " + 베낀값 + ")",
    폰트값 !== undefined && 폰트값 === 베낀값,
    "chart-font.js 만 고치면 768 이상에서 그 값이 통째로 지워집니다. " +
    "chart-axis-fit.js 의 BASE_PX 도 같이 고치세요");

  /* ── 동작으로도 확인합니다 ────────────────────────────────────────────
     글자 검사만 두면 "BASE_PX 를 지우고 App.ChartFont.getFontSize() 를
     읽도록 고친" 개선까지 실패로 잡습니다. 그건 오히려 옳은 방향이라
     막으면 안 됩니다. 그래서 실제로 둘을 같이 띄워 결과를 봅니다. */
  function 같이띄우기(폭, 폰트소스) {
    const dom = new JSDOM("<!doctype html><html><body></body></html>",
      { runScripts: "outside-only", url: "https://example.test/" });
    const win = dom.window;
    win.App = {};
    win.setInterval = () => 0; win.clearInterval = () => {};
    win.setTimeout = () => 0; win.clearTimeout = () => {};
    win.eval(폰트소스);
    const 정한값 = win.App.ChartFont.getFontSize();
    win.innerWidth = 폭;
    win.eval(FIT_SRC);
    win.App.ChartAxisFit.apply();
    const 적용뒤 = win.App.ChartFont.getFontSize();
    win.App.ChartAxisFit.disable();
    const 되돌린뒤 = win.App.ChartFont.getFontSize();
    try { win.close(); } catch (e) { /* noop */ }
    return { 정한값: 정한값, 적용뒤: 적용뒤, 되돌린뒤: 되돌린뒤 };
  }

  /* 지금 그대로 — 데스크톱에서는 chart-font.js 가 정한 값이 살아 있어야 합니다 */
  [768, 1440, 1920].forEach(function (w) {
    const r = 같이띄우기(w, FONT_SRC);
    ok(w + "px 에서 chart-font.js 가 정한 " + r.정한값 + "px 가 그대로 남는다",
      r.적용뒤 === r.정한값, "정한값 " + r.정한값 + " -> 적용뒤 " + r.적용뒤);
    ok(w + "px 에서 disable() 도 chart-font.js 가 정한 값으로 되돌린다",
      r.되돌린뒤 === r.정한값, "정한값 " + r.정한값 + " -> disable 뒤 " + r.되돌린뒤);
  });

  /* 폰은 덮어쓰는 것이 이 모듈의 목적입니다 — 덮어쓰지 '않으면' 그게 고장입니다 */
  {
    const r = 같이띄우기(360, FONT_SRC);
    ok("360px 에서는 오히려 덮어써야 한다 (이 모듈의 존재 이유입니다)",
      r.적용뒤 === 11, String(r.적용뒤));
  }

  /* ── 조용한 고장 재현 ────────────────────────────────────────────────
     chart-font.js 한 줄만 바뀐 세상을 만들어, 지금 코드가 정말 그 값을
     지우는지 확인합니다. 지우는 것이 지금의 사실이고, 위 글자 검사가
     그래서 필요합니다. 누가 BASE_PX 의존을 없애 고치면 이 검사가 실패하며
     "이제 [1-2] 의 글자 검사는 빼도 된다" 고 알려줍니다. */
  {
    /* 지금 값이 무엇이든 반드시 다른 값이 되게 고릅니다.
       "16" 을 박아 두면 훗날 진짜 기본값이 16 이 됐을 때 바꿔치기가
       아무것도 안 바꾸고, 그러면 이 검사가 스스로 거짓 통과합니다. */
    const 딴값 = Number(폰트값) + 5;
    const 바뀐폰트 = FONT_SRC.replace(/var FONT_SIZE = \d+;/, "var FONT_SIZE = " + 딴값 + ";");
    ok("바꿔치기가 실제로 먹혔다 (안 먹었으면 아래 검사가 의미 없습니다)",
      바뀐폰트 !== FONT_SRC && new RegExp("var FONT_SIZE = " + 딴값 + ";").test(바뀐폰트));
    const r = 같이띄우기(1440, 바뀐폰트);
    ok("chart-font.js 만 " + 딴값 + " 로 바꾸면 1440px 에서 " + 베낀값 + "px 로 되돌아간다 " +
      "— 이것이 BASE_PX 를 같이 고쳐야 하는 이유입니다",
      r.정한값 === 딴값 && r.적용뒤 === Number(베낀값),
      "정한값 " + r.정한값 + " -> 적용뒤 " + r.적용뒤 +
      " / " + 딴값 + " 이 그대로 남았다면 의존이 끊긴 것이니 위 글자 검사를 빼세요");
  }

  ok("chart-axis-fit.js 주석이 21 을 chart-font.js 가 정했다고 밝혀 둔다",
    /chart-font\.js 가 정한 기본값/.test(FIT_SRC),
    "출처가 안 적혀 있으면 다음 사람이 두 값이 짝이라는 걸 모릅니다");
}

/* =========================================================================
 * [2] chart-axis-edge — 시간축 끝 글자가 안 잘린다
 * ========================================================================= */
절("[2] chart-axis-edge — 끝 눈금 글자 밀어넣기");

/** 가짜 시간축 캔버스 하나를 가진 가짜 차트를 만들어 모듈을 띄웁니다 */
function 축모듈(opts) {
  opts = opts || {};
  const 배율 = opts.배율 || 1;
  const 캔버스폭 = opts.캔버스폭 || 600;   /* 장치 픽셀 */
  const 찍힌것 = [];

  const t = 창(
    "<div id=\"c\"><table><tr><td id=\"cell\"><canvas id=\"cv\"></canvas></td></tr></table></div>",
    function (win) {
      win.setInterval = function (fn) { fn(); return 0; };   /* 타이머를 남기지 않습니다 */
      win.clearInterval = function () {};
      win.setTimeout = function () { return 0; };
      win.clearTimeout = function () {};
    }
  );
  const win = t.win;
  const canvas = win.document.getElementById("cv");
  win.document.getElementById("cell").getBoundingClientRect =
    () => ({ left: 0, top: 0, right: 300, bottom: 30, width: 300, height: 30 });

  const ctx = {
    font: "12px sans-serif",
    textAlign: "center",
    measureText: (s) => ({ width: s.length * 8 }),
    getTransform: () => ({ a: 배율, e: 0 }),
    fillText: function (text, x, y) { 찍힌것.push({ text: text, x: x, y: y }); }
  };
  const 원래fillText = ctx.fillText;
  canvas.width = 캔버스폭;
  canvas.getContext = () => ctx;

  const el = win.document.getElementById("c");
  win.App.ChartFont = {
    getCharts: () => [{
      chartElement: () => el,
      timeScale: () => ({ applyOptions() {}, options: () => ({ borderColor: "#000" }) })
    }]
  };

  win.eval(EDGE_SRC);
  /* jsdom 의 readyState 는 "loading" 이라 모듈이 DOMContentLoaded 를 기다립니다.
     실제 페이지에서는 그때 start() 가 돕니다. 여기서는 그 자리를 대신 불러 줍니다. */
  win.App.ChartAxisEdge.apply();
  return { t, win, ctx, canvas, 찍힌것, 원래fillText, M: win.App.ChartAxisEdge };
}

{
  const a = 축모듈();
  ok("여백(PAD)이 1px 다 (0 이면 글자가 축 테두리에 닿습니다)", a.M.getPadding() === 1, String(a.M.getPadding()));
  ok("시간축 캔버스를 하나 감쌌다", a.M.getStats().patchedCanvases === 1, String(a.M.getStats().patchedCanvases));
  ok("fillText 를 우리 것으로 바꿔 놓았다", a.ctx.fillText !== a.원래fillText);

  /* 화면 한가운데 글자는 손대지 않습니다 */
  a.ctx.fillText("12:00", 300, 20);
  ok("한가운데 글자는 자리를 안 옮긴다", a.찍힌것[a.찍힌것.length - 1].x === 300,
    String(a.찍힌것[a.찍힌것.length - 1].x));

  /* 오른쪽 끝 — "06:00" 은 폭 40, 반폭 20. x=595 면 오른쪽으로 15 넘칩니다.
     들어가야 할 자리는 600 - 1(PAD) - 20 = 579 입니다. */
  a.ctx.fillText("06:00", 595, 20);
  ok("오른쪽 끝 글자를 캔버스 안으로 민다 (595 -> 579)",
    a.찍힌것[a.찍힌것.length - 1].x === 579, String(a.찍힌것[a.찍힌것.length - 1].x));

  /* 왼쪽 끝 — x=5 면 왼쪽으로 15 넘칩니다. 들어가야 할 자리는 0 + 1 + 20 = 21 */
  a.ctx.fillText("06:00", 5, 20);
  ok("왼쪽 끝 글자도 안으로 민다 (5 -> 21)",
    a.찍힌것[a.찍힌것.length - 1].x === 21, String(a.찍힌것[a.찍힌것.length - 1].x));

  ok("민 횟수를 세어 둔다 (getStats 로 실측할 수 있습니다)", a.M.getStats().clamps === 2,
    String(a.M.getStats().clamps));
  ok("가장 많이 민 거리를 기억한다", a.M.getStats().maxShiftPx === 16, String(a.M.getStats().maxShiftPx));

  /* 가운데 정렬이 아닌 글자(가격축·십자선 라벨)는 건드리지 않습니다 */
  a.ctx.textAlign = "left";
  a.ctx.fillText("06:00", 595, 20);
  ok("가운데 정렬이 아닌 글자는 손대지 않는다 (가격축·십자선 라벨을 망가뜨리지 않습니다)",
    a.찍힌것[a.찍힌것.length - 1].x === 595, String(a.찍힌것[a.찍힌것.length - 1].x));
  a.ctx.textAlign = "center";

  /* 같은 컨텍스트를 두 번 감싸면 밀기가 두 번 걸립니다.
     250ms 마다 다시 확인하는 구조라 실제로 일어날 수 있는 일입니다. */
  const 전 = a.ctx.fillText;
  a.M.apply();
  a.M.apply();
  ok("같은 컨텍스트를 두 번 감싸지 않는다 (두 겹이면 글자가 두 번 밀립니다)", a.ctx.fillText === 전);
  ok("감싼 캔버스 수가 그대로 1 이다", a.M.getStats().patchedCanvases === 1,
    String(a.M.getStats().patchedCanvases));

  /* 되돌리기 */
  a.M.disable();
  ok("disable() 하면 원래 fillText 로 되돌아간다", a.ctx.fillText === a.원래fillText);
  ok("disable() 뒤에는 꺼진 상태로 읽힌다", a.M.isEnabled() === false);
  a.t.닫기();
}
{
  /* ── 조용한 고장 봉인 ────────────────────────────────────────────────
     라이브러리가 useMediaCoordinateSpace 로 배율을 걸어 두기 때문에
     canvas.width(장치 픽셀) 를 그대로 쓰면 안 됩니다.
     devicePixelRatio 2 인 폰에서 canvas.width 는 1200 이고 화면 좌표계의
     오른쪽 끝은 600 입니다. 배율을 안 보면 "안 넘쳤다" 고 판단해서
     글자가 그대로 잘립니다 — 글자는 찍히니 아무도 못 알아챕니다. */
  const b = 축모듈({ 배율: 2, 캔버스폭: 1200 });
  b.ctx.fillText("06:00", 595, 20);
  ok("배율 2배(폰)에서도 오른쪽 끝을 600 으로 보고 민다 (canvas.width 1200 을 그대로 쓰면 안 밉니다)",
    b.찍힌것[b.찍힌것.length - 1].x === 579,
    String(b.찍힌것[b.찍힌것.length - 1].x) + " — 595 그대로면 배율을 안 본 것입니다");
  ok("배율 2배에서 민 횟수가 1 이다", b.M.getStats().clamps === 1, String(b.M.getStats().clamps));
  b.t.닫기();
}
{
  /* 시간축 캔버스 고르기 — 마지막 줄의 가장 넓은 칸입니다.
     좁은 칸(가격축)을 고르면 엉뚱한 글자를 밀게 됩니다. */
  const t = 창("", function (win) { win.setInterval = () => 0; win.clearInterval = () => {}; });
  t.win.App.ChartFont = { getCharts: () => [] };
  t.win.eval(EDGE_SRC);
  const 찾기 = t.win.App.ChartAxisEdge.findTimeAxisCanvasForTest;
  const d = t.win.document;
  d.body.innerHTML =
    "<div id=\"r\"><table>" +
    "<tr><td id=\"a\"><canvas id=\"ca\"></canvas></td></tr>" +
    "<tr><td id=\"b\"><canvas id=\"cb\"></canvas></td><td id=\"c\"><canvas id=\"cc\"></canvas></td></tr>" +
    "</table></div>";
  d.getElementById("a").getBoundingClientRect = () => ({ width: 900 });
  d.getElementById("b").getBoundingClientRect = () => ({ width: 500 });   /* 캔들 칸 */
  d.getElementById("c").getBoundingClientRect = () => ({ width: 60 });    /* 가격축 칸 */
  const got = 찾기(d.getElementById("r"));
  ok("마지막 줄에서 가장 넓은 칸의 캔버스를 고른다 (가격축 칸이 아니라 캔들 칸)",
    !!got && got.id === "cb", got && got.id);

  d.getElementById("b").getBoundingClientRect = () => ({ width: 20 });
  d.getElementById("c").getBoundingClientRect = () => ({ width: 10 });
  ok("칸이 너무 좁으면(40px 미만) 아무것도 안 고른다 (아직 안 그려진 차트)",
    찾기(d.getElementById("r")) === null);
  ok("표가 없으면 조용히 아무것도 안 한다 (오류를 내지 않습니다)",
    찾기(d.createElement("div")) === null);
  ok("아무것도 안 넘겨도 조용히 넘어간다", 찾기(null) === null);
  t.닫기();
}
{
  ok("왜 fixRightEdge 를 안 켰는지 근거가 남아 있다 (켜면 오른쪽 빈 공간 스크롤이 사라집니다)",
    /fixRightEdge/.test(EDGE_SRC) && /rightOffset 상한을 0 으로 묶어/.test(EDGE_SRC),
    "이 근거가 없으면 다음 사람이 '한 줄이면 되는데' 하고 기능을 지웁니다");
  ok("라이브러리 판(5.2.0) 을 직접 열어 확인했다고 적혀 있다",
    /lightweight-charts 5\.2\.0 번들/.test(EDGE_SRC));
  ok("되돌리는 방법이 적혀 있다", /ChartAxisEdge\.disable\(\)/.test(EDGE_SRC));
  ok("표준 Canvas API 만 쓴다 — 난독화된 내부 이름에 기대지 않는다",
    /표준 Canvas API 만 쓰므로/.test(EDGE_SRC));
}

/* =========================================================================
 * [3] chart-tab-mobile — 폰에서 차트를 탭 자리로 모은다
 * ========================================================================= */
절("[3] chart-tab-mobile — 폰 탭 · 데스크톱 복귀");

const 탭마크업 =
  "<div class=\"main-grid\">" +
  "<div class=\"orderbook-column\">" +
  "<div class=\"orderbook-tabs-wrap\"><div id=\"orderbook-tabs\">" +
  "<button class=\"ob-tab-btn active\" data-tab=\"orderbook\">호가</button>" +
  "<button class=\"ob-tab-btn\" data-tab=\"trades\">체결</button>" +
  "</div><div id=\"orderbook-tabs-content\">" +
  "<div id=\"orderbook-panel\"></div><div id=\"recent-trades-panel\"></div>" +
  "</div></div></div>" +
  "<div class=\"chart-column\"></div>" +
  "<div class=\"side-column\"></div>" +
  "</div>";

function 탭모듈(폭, 높이) {
  const t = 창(탭마크업, function (win) {
    win.innerWidth = 폭;
    win.innerHeight = 높이 || 800;
    win.setTimeout = function () { return 0; };
    win.clearTimeout = function () {};
    win.matchMedia = function (q) {
      const m = /max-width:\s*(\d+)px/.exec(q);
      return { matches: m ? 폭 <= Number(m[1]) : false, media: q, addListener() {}, removeListener() {} };
    };
  });
  t.win.eval(TAB_SRC);
  /* jsdom 의 readyState 는 "loading" 이라 모듈이 DOMContentLoaded 를 기다립니다.
     실제 페이지에서는 그때 init() 이 돕니다. 여기서는 그 자리를 대신 불러 줍니다. */
  t.win.App.ChartTabMobile.init();
  return t;
}

{
  const t = 탭모듈(390);
  const d = t.win.document;
  const btn = d.getElementById("mtab-chart-btn");
  ok("폰에서 '차트' 버튼이 생긴다", !!btn);
  ok("'차트' 버튼이 탭 막대 맨 앞이다 (바이낸스 모바일과 같은 순서)",
    !!btn && d.getElementById("orderbook-tabs").firstChild === btn);
  ok("버튼 글자가 '차트' 다", !!btn && btn.textContent === "차트", btn && btn.textContent);
  ok("데스크톱에서 숨길 수 있게 ob-tab-btn-chart 를 붙인다",
    !!btn && btn.classList.contains("ob-tab-btn-chart"));
  ok("폰의 기본 탭이 차트다 (바이낸스도 Chart 가 기본)",
    d.querySelector(".main-grid").getAttribute("data-mtab") === "chart",
    d.querySelector(".main-grid").getAttribute("data-mtab"));
  ok("차트 탭에서는 호가창 패널을 숨긴다",
    d.getElementById("orderbook-panel").style.display === "none");
  ok("차트 탭에서는 최근체결 패널도 숨긴다",
    d.getElementById("recent-trades-panel").style.display === "none");

  /* 탭을 눌러 옮깁니다 */
  d.querySelector('.ob-tab-btn[data-tab="orderbook"]')
    .dispatchEvent(new t.win.MouseEvent("click", { bubbles: true }));
  ok("호가 탭을 누르면 data-mtab 이 orderbook 이 된다",
    d.querySelector(".main-grid").getAttribute("data-mtab") === "orderbook",
    d.querySelector(".main-grid").getAttribute("data-mtab"));
  ok("호가 탭에서는 호가창 패널이 다시 보인다",
    d.getElementById("orderbook-panel").style.display === "");
  ok("호가 탭에서는 최근체결이 숨는다",
    d.getElementById("recent-trades-panel").style.display === "none");

  /* 지우지 않고 display 로만 다룹니다 — 지우면 orderbook.js 가 붙을 곳을 잃습니다 */
  ok("어떤 패널도 DOM 에서 지우지 않는다",
    !!d.getElementById("orderbook-panel") && !!d.getElementById("recent-trades-panel"));
  ok("칼럼 DOM 순서를 바꾸지 않는다 (자리는 CSS order 로만 바꿉니다)",
    Array.from(d.querySelector(".main-grid").children)
      .map((e) => e.className).join(",") === "orderbook-column,chart-column,side-column",
    Array.from(d.querySelector(".main-grid").children).map((e) => e.className).join(","));
  t.닫기();
}
{
  /* ── 조용한 고장 봉인 ────────────────────────────────────────────────
     폰을 벗어날 때 data-mtab 이 남으면 768~1300 에서 호가창이 통째로
     비어 보입니다. 모듈 주석에 "실제로 걸렸던 경우" 라고 적혀 있습니다. */
  const t = 탭모듈(768);
  const d = t.win.document;
  ok("768px 에서는 data-mtab 이 아예 안 붙는다 (세 칼럼 그대로)",
    !d.querySelector(".main-grid").hasAttribute("data-mtab"),
    d.querySelector(".main-grid").getAttribute("data-mtab"));
  ok("768px 에서 호가창 패널이 보인다", d.getElementById("orderbook-panel").style.display === "");
  t.닫기();
}
{
  /* 폰 -> 데스크톱으로 창을 넓히는 상황을 그대로 재현합니다 */
  const t = 탭모듈(390);
  const d = t.win.document;
  ok("먼저 폰 상태다", d.querySelector(".main-grid").getAttribute("data-mtab") === "chart");

  t.win.innerWidth = 1024;
  t.win.matchMedia = function (q) {
    const m = /max-width:\s*(\d+)px/.exec(q);
    return { matches: m ? 1024 <= Number(m[1]) : false, media: q, addListener() {}, removeListener() {} };
  };
  t.win.App.ChartTabMobile.sync();

  ok("창을 넓히면 data-mtab 을 지운다 (안 지우면 768~1300 에서 호가창이 통째로 빕니다)",
    !d.querySelector(".main-grid").hasAttribute("data-mtab"),
    d.querySelector(".main-grid").getAttribute("data-mtab"));
  ok("'차트' 탭이 선택돼 있었으면 호가 탭으로 넘겨준다",
    d.querySelector('.ob-tab-btn[data-tab="orderbook"]').classList.contains("active"));
  ok("'차트' 버튼의 선택 표시는 지운다",
    !d.getElementById("mtab-chart-btn").classList.contains("active"));
  ok("호가창 패널이 다시 보인다", d.getElementById("orderbook-panel").style.display === "");
  t.닫기();
}
{
  /* CSS 쪽 짝이 사라지면 속성만 붙고 아무 일도 안 일어납니다 — 조용한 고장 */
  ok("style.css 에 [data-mtab] 규칙이 살아 있다 (없으면 속성만 붙고 화면은 그대로입니다)",
    (CSS.match(/\[data-mtab=/g) || []).length >= 4,
    "지금 " + (CSS.match(/\[data-mtab=/g) || []).length + "곳");
  ok("차트 탭 버튼을 데스크톱에서 숨기는 규칙이 있다", /\.ob-tab-btn-chart\{display:none;\}/.test(CSS));
  ok("폰에서만 그 버튼을 보이는 규칙이 있다",
    /\.ob-tab-btn-chart\{display:inline-block;\}/.test(CSS));
  ok("[data-mtab] 규칙이 전부 max-width:700px 안에 있다 (768/1440/1920 은 안 건드립니다)",
    (function () {
      /* style.css 에는 @media (max-width:700px){ 블록이 여러 개 있습니다(지금 10개).
         그 블록들의 범위를 전부 구해서, [data-mtab= 이 하나도 밖에 없는지 봅니다. */
      const 범위 = [];
      const 여는말 = "@media (max-width:700px){";
      for (let at = CSS.indexOf(여는말); at !== -1; at = CSS.indexOf(여는말, at + 1)) {
        let 깊이 = 0;
        for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
          if (CSS[i] === "{") 깊이++;
          else if (CSS[i] === "}") { 깊이--; if (!깊이) { 범위.push([at, i]); break; } }
        }
      }
      if (!범위.length) return false;
      let 밖 = 0;
      for (let i = CSS.indexOf("[data-mtab="); i !== -1; i = CSS.indexOf("[data-mtab=", i + 1)) {
        if (!범위.some((r) => i > r[0] && i < r[1])) 밖++;
      }
      return 밖 === 0;
    })(),
    "폰 밖으로 새어 나간 [data-mtab] 규칙이 있습니다");
  ok("자리 바꾸기는 CSS order 로만 한다 (DOM 을 옮기지 않습니다)",
    /\.main-grid > \.chart-column\{order:2;\}/.test(CSS) &&
    !/insertBefore|appendChild/.test(TAB_SRC.replace(/bar\.insertBefore\(btn, bar\.firstChild\);/, "")),
    "칼럼을 옮기는 코드가 생기면 orderbook-tabs.js·trades.js 가 기대하는 형제 관계가 깨집니다");
  ok("경계가 max-width:700px 로 코드와 CSS 가 같다",
    /var MQ = "\(max-width:700px\)"/.test(TAB_SRC) && CSS.indexOf("@media (max-width:700px){") !== -1);
  ok("되돌리는 방법이 적혀 있다 (script 한 줄 + style.css 블록)",
    /되돌리는 방법/.test(TAB_SRC) && /되돌리려면/.test(CSS.slice(CSS.indexOf("[모바일 2단계]"), CSS.indexOf("[모바일 2단계]") + 1200)));
  ok("390px 실측(차트 605 / 호가 545 / 문서 4,776)이 남아 있다",
    /605px/.test(TAB_SRC) && /545px/.test(TAB_SRC) && /4,776px/.test(TAB_SRC));
  ok("차트가 0x0 에서 되살아나는지 확인한 실측이 남아 있다 (그래서 resize() 를 안 부릅니다)",
    /autoSize/.test(TAB_SRC) && /212x542/.test(TAB_SRC));
}

/* =========================================================================
 * 끝
 * ========================================================================= */
console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
