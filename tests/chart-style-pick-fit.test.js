/* tests/chart-style-pick-fit.test.js
 * =========================================================================
 * 「색·굵기 고르는 창」이 화면 아래로 넘치지 않는다 — 2026-09-03 (수리팀)
 *   대상: js/chart-drawings.js  (placeStyle)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 색·굵기 창(.tl-style-pick)은 그리기 칩 바로 위에서 ★위로★ 자랍니다.
 * placeStyle 에는 ★위쪽 방어만★ 있고 아래쪽 방어가 없었습니다.
 *
 *     var top = 칩top - box.offsetHeight - 6;
 *     if (top < vis.top) top = vis.top;      ← 위만 막음
 *     putFixed(box, left, top);              ← 아래는 안 막음
 *
 * ★바로 앞 건(placeList)과 글자 그대로 같은 병입니다.★ 같은 파일 안에서
 * placeToast 에는 있고 placeList·placeStyle 에는 없었습니다. placeList 를
 * 2026-09-03 에 고치면서 placeStyle 이 남아 있는 것을 보고했고, 이 파일이
 * 그 나머지 한 곳을 고친 것을 지킵니다.
 *
 * ⚠️ ★최악 자리는 스크롤을 훑어야 나옵니다.★ 차트가 화면 가운데 있을 때
 *    재면 그냥 통과합니다. 폰에서 살짝 내린 자리(360·y=50)가 최악입니다.
 *
 * 2026-09-03 실측 (localhost · 수평선 1개 · 스크롤 25px 간격 전수)
 *   폭    최악 y   고치기 전 창       화면밖   주문막대밑   막힌단추/13
 *   360     50     666~809           +9px     +82px        5 (+1 화면밖)
 *   375     50     666~809           +9       +82          5 (+1)
 *   390     25     660~803           +3       +76          5 (+0)
 *   768      0     837~980           +80      (막대 없음)  0 (+5 화면밖)
 *  1440   1550       8~151           -749     (없음)       0  ← 원래 멀쩡
 *  1920      0     764~907           +7       (없음)       0
 *
 *   고친 뒤 — 360·375·390 은 576~719 / 768·1920 은 749~892 / 1440 은 8~151
 *             화면밖 0 · 주문막대에 물림 0 · 막힌단추 0 · 화면밖단추 0
 *
 * 고친 방법 — ★자리만 막습니다. 키는 안 줄입니다.★
 *   목록(.tl-draw-list)에는 .rows 라는 스크롤 칸이 있어서 키를 줄일 수
 *   있었지만, 이 창은 색 줄·굵기 줄·계속 그리기 줄이 다 붙박이라
 *   ★줄일 곳이 없습니다★ (높이 143px 고정). 그래서 자리만 막습니다.
 *   ★글씨·단추 크기(STYLE_BTN 32px)는 그대로입니다.★
 *
 *   막는 차례는 placeToast · placeList 와 같습니다 —
 *   위 막기 → 아래 막기 → 화면 위끝 막기. ★아래가 나중이라 이깁니다.★
 *
 *   ⚠️ 마지막 줄이 vis.top 이 아니라 ★CHIP_EDGE★ 인 것이 중요합니다.
 *      최악(360·y=50)에는 차트 칸에 53px 밖에 안 남는데 창은 143px 입니다.
 *      vis.top 으로 다시 올리면 아래가 또 주문 막대 밑으로 내려갑니다.
 *
 * ── 어떻게 확인하나 (계산을 베끼지 않습니다) ──────────────────────────
 * 자리잡기 함수는 모듈 밖으로 안 나옵니다. 그래서 원본 함수 본문을
 * ★글자 그대로 떼어내★ 가짜 화면 위에서 돌립니다.
 * 테스트가 계산을 따로 베껴 쓰면 원본이 바뀌어도 옛 계산만 지키게 됩니다.
 * (tests/chart-draw-list-fit.test.js 와 같은 방식입니다)
 *
 * 흉내가 진짜와 같은지는 1절에서 ★브라우저 실측값과 글자 그대로★ 맞춰
 * 봅니다. 다르면 거기서 먼저 빨개집니다.
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [32m✓[0m " + 제목); }
  else { fail++; console.log("  [31m✗[0m " + 제목 + (도움말 ? " — " + 도움말 : "")); }
}
function 절(제목) { console.log("\n" + 제목); }

console.log("\n색·굵기 고르는 창이 화면 아래로 넘치지 않는다");

/* =====================================================================
 * [0] 준비 — 자리잡기 계산부를 원본에서 글자 그대로 떼어낸다
 * ===================================================================== */
절("[0] 준비 — 원본에서 계산부를 그대로 떼어낸다");

const 필요함수 = ["vpW", "vpH", "chipFloorY", "visibleBox", "putFixed", "placeStyle"];

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
for (const n of 필요함수) {
  조각[n] = 함수떼기(n);
  if (!조각[n]) 다떼었다 = false;
}
ok("계산 함수 " + 필요함수.length + "개를 원본에서 찾았다", 다떼었다,
  "못 찾은 것: " + 필요함수.filter((n) => !조각[n]).join(", ") +
  " (이름이 바뀌었다면 이 파일 위쪽 필요함수 목록을 고치세요)");

function 상수(이름, 기본) {
  const m = new RegExp("var\\s+" + 이름 + "\\s*=\\s*(\\d+)\\s*;").exec(SRC);
  ok("상수 " + 이름 + " 가 원본에 있다", !!m, String(m));
  return m ? Number(m[1]) : 기본;
}
const CHIP_EDGE = 상수("CHIP_EDGE", 8);
const STYLE_BTN = 상수("STYLE_BTN", 32);
ok("여백 8 · 단추 32 (바뀌면 아래 기대값도 같이 봐야 합니다)",
  CHIP_EDGE === 8 && STYLE_BTN === 32, CHIP_EDGE + " / " + STYLE_BTN);

/* ---------------------------------------------------------------------
 * 가짜 화면.
 *   이 창은 ★키가 고정★ 입니다 (머리 + 색 줄 + 굵기 줄 + 계속 그리기 줄).
 *   2026-09-03 브라우저 실측으로 여섯 폭 모두 143px · 284px 였습니다.
 *   목록과 달리 maxWidth·maxHeight 를 건드리지 않으므로 그대로 둡니다.
 * ------------------------------------------------------------------- */
function 화면만들기(설정) {
  const box = {
    style: {},
    offsetWidth: 설정.창폭,
    offsetHeight: 설정.창키
  };
  const chip = { style: { display: 설정.칩보임 || "flex", top: 설정.칩top + "px", left: "0px" } };

  const 바 = 설정.바
    ? { getBoundingClientRect: function () {
          return { top: 설정.바.top, bottom: 설정.h, height: 설정.바.height };
        }, __display: "block" }
    : null;

  const document = {
    documentElement: { clientWidth: 설정.w, clientHeight: 설정.h },
    fullscreenElement: null,
    webkitFullscreenElement: null,
    querySelector: function (s) { return s === ".tl-order-bar" ? 바 : null; }
  };
  const window = {
    innerWidth: 설정.w,
    innerHeight: 설정.h,
    getComputedStyle: function (el) { return { display: el.__display }; }
  };
  const wrap = { getBoundingClientRect: function () { return 설정.wrap; } };

  const sandbox = {
    window: window, document: document, wrap: wrap,
    els: { stylePick: box, chip: chip },
    console: { warn: function () {}, log: function () {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    "var CHIP_EDGE=" + CHIP_EDGE + ";\n" +
    필요함수.map(function (n) { return 조각[n]; }).join("\n"),
    sandbox, { filename: "place-lifted.js" }
  );
  sandbox.__vis = sandbox.visibleBox();
  sandbox.placeStyle();
  const top = parseFloat(box.style.top);
  const left = parseFloat(box.style.left);
  return {
    vis: sandbox.__vis,
    위: top, 아래: top + box.offsetHeight, 키: box.offsetHeight,
    왼: left, 폭: box.offsetWidth,
    보임: box.style.visibility, 설정: 설정
  };
}

/* 2026-09-03 브라우저 실측 그대로. 수평선 1개 · 폭마다 최악 스크롤 자리 */
const 실측 = [
  { 이름: "360 · y=50", w: 360, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 345 },
    바: { top: 727, height: 73 }, 칩top: 681, 창폭: 284, 창키: 143,
    전: { 위: 666, 아래: 809 }, 후: { 위: 576, 아래: 719, 왼: 23 } },
  { 이름: "375 · y=50", w: 375, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 360 },
    바: { top: 727, height: 73 }, 칩top: 681, 창폭: 284, 창키: 143,
    전: { 위: 666, 아래: 809 }, 후: { 위: 576, 아래: 719, 왼: 23 } },
  { 이름: "390 · y=25", w: 390, h: 800, wrap: { top: 660, bottom: 1220, left: 15, right: 375 },
    바: { top: 727, height: 73 }, 칩top: 681, 창폭: 284, 창키: 143,
    전: { 위: 660, 아래: 803 }, 후: { 위: 576, 아래: 719, 왼: 23 } },
  { 이름: "768 · y=0", w: 768, h: 900, wrap: { top: 837, bottom: 1530, left: 83, right: 753 },
    바: null, 칩top: 854, 창폭: 284, 창키: 143,
    전: { 위: 837, 아래: 980 }, 후: { 위: 749, 아래: 892, 왼: 91 } },
  { 이름: "1440 · y=1550", w: 1440, h: 900, wrap: { top: -805, bottom: 184, left: 83, right: 799 },
    바: null, 칩top: 146, 창폭: 284, 창키: 143,
    전: { 위: 8, 아래: 151 }, 후: { 위: 8, 아래: 151, 왼: 91 } },
  { 이름: "1920 · y=0", w: 1920, h: 900, wrap: { top: 764, bottom: 1752, left: 83, right: 815 },
    바: null, 칩top: 854, 창폭: 284, 창키: 143,
    전: { 위: 764, 아래: 907 }, 후: { 위: 749, 아래: 892, 왼: 91 } }
];

/* =====================================================================
 * [1] 흉내가 브라우저 실측과 같은가 — 여기가 틀리면 아래는 다 헛것입니다
 * ===================================================================== */
절("[1] 흉내 맞춰보기 — 브라우저 실측과 글자 그대로 같은가");

const 잰것 = 실측.map(화면만들기);
실측.forEach(function (c, i) {
  const r = 잰것[i];
  ok(c.이름 + " — 창 자리가 실측과 같다 (위 " + c.후.위 + " · 아래 " + c.후.아래 + ")",
    r.위 === c.후.위 && r.아래 === c.후.아래,
    "흉내 " + r.위 + "~" + r.아래);
  ok(c.이름 + " — 가로 자리도 실측과 같다 (왼 " + c.후.왼 + ")",
    r.왼 === c.후.왼, "흉내 왼" + r.왼);
});

/* =====================================================================
 * [2] 고쳐진 것 — 여섯 폭 모두 화면 안 · 주문 막대 위
 * ===================================================================== */
절("[2] 여섯 폭 모두 화면 안에 있고 주문 막대에 안 물린다");

실측.forEach(function (c, i) {
  const r = 잰것[i];
  ok(c.이름 + " — 화면 아래로 안 넘친다 (아래끝 " + r.아래 + " ≤ 화면 " + c.h + ")",
    r.아래 <= c.h, "넘침 " + (r.아래 - c.h) + "px");
  ok(c.이름 + " — 화면 위로도 안 나간다 (위끝 " + r.위 + " ≥ " + CHIP_EDGE + ")",
    r.위 >= CHIP_EDGE, "위끝 " + r.위);
  ok(c.이름 + " — 차트 칸이 허락한 바닥(vis.bottom " + r.vis.bottom + ") 을 안 넘는다",
    r.아래 <= r.vis.bottom, "아래끝 " + r.아래);
  if (c.바) {
    ok(c.이름 + " — ★하단 주문 막대(위끝 " + c.바.top + ") 밑으로 안 내려간다★",
      r.아래 <= c.바.top, "막대 밑으로 " + (r.아래 - c.바.top) + "px");
  }
  ok(c.이름 + " — 창이 사라지지 않는다 (키 " + c.창키 + " 그대로)",
    r.키 === c.창키 && r.보임 !== "hidden", "키 " + r.키 + " 보임 " + r.보임);
});

/* 고치기 전이었다면 어떤 값이었나 — 봉인이 무엇을 막는지 숫자로 남깁니다 */
절("[2-1] 고치기 전 값과 견주기 (그때는 이만큼 넘쳤습니다)");
실측.forEach(function (c, i) {
  const r = 잰것[i];
  const 전넘침 = c.전.아래 - c.h;
  const 후넘침 = r.아래 - c.h;
  ok(c.이름 + " — 전 " + c.전.위 + "~" + c.전.아래 + "(화면밖 " + 전넘침 +
    "px) → 후 " + r.위 + "~" + r.아래 + "(화면밖 " + 후넘침 + "px) · 안 나빠졌다",
    후넘침 <= 전넘침, "나빠졌습니다");
  if (전넘침 > 0) {
    ok(c.이름 + " — ★넘치던 것이 실제로 들어왔다★ (" + 전넘침 + "px → " + 후넘침 + "px)",
      후넘침 < 0, "아직 " + 후넘침);
  }
});

/* =====================================================================
 * [3] 자리가 넉넉하면 원래대로 — 칩 바로 위에 그대로 놓인다
 * ===================================================================== */
절("[3] 자리가 넉넉하면 예전처럼 칩 바로 위에 놓인다");
{
  const 넉넉 = {
    이름: "넉넉", w: 1440, h: 900, wrap: { top: 100, bottom: 850, left: 83, right: 799 },
    바: null, 칩top: 800, 창폭: 284, 창키: 143
  };
  const r = 화면만들기(넉넉);
  ok("칩 바로 위에 놓인다 (칩top 800 - 키 143 - 6 = 651)", r.위 === 651, "위 " + r.위);
  ok("화면 안에 있다", r.아래 <= 넉넉.h && r.위 >= CHIP_EDGE, r.위 + "~" + r.아래);
  ok("키를 안 줄인다 (143 그대로)", r.키 === 143, "키 " + r.키);
}

/* =====================================================================
 * [4] 아주 좁아도 화면 밖으로는 안 나간다 (극단)
 * ===================================================================== */
절("[4] 차트 칸이 겨우 보일 만큼 좁아도 화면 밖으로 안 나간다");
{
  /* visibleBox 는 44px 미만이면 null 을 주고 창을 숨깁니다.
     딱 그 문턱 언저리(45px)에서도 화면 밖으로 안 나가야 합니다. */
  const 빠듯 = {
    이름: "빠듯", w: 360, h: 800, wrap: { top: 674, bottom: 1200, left: 15, right: 345 },
    바: { top: 727, height: 73 }, 칩top: 690, 창폭: 284, 창키: 143
  };
  const r = 화면만들기(빠듯);
  ok("보이는 자리가 45px 여도 창을 그린다 (visibleBox 문턱 44 위)",
    r.vis !== null && r.보임 !== "hidden", JSON.stringify(r.vis));
  ok("화면 아래로 안 넘친다", r.아래 <= 800, "아래끝 " + r.아래);
  ok("화면 위로 안 나간다", r.위 >= CHIP_EDGE, "위끝 " + r.위);
  ok("주문 막대 밑으로 안 내려간다", r.아래 <= 727, "아래끝 " + r.아래);

  /* 44px 미만이면 아예 숨깁니다 (원래 동작 그대로) */
  const 너무좁음 = Object.assign({}, 빠듯, {
    이름: "너무좁음", wrap: { top: 700, bottom: 1200, left: 15, right: 345 }
  });
  const r2 = 화면만들기(너무좁음);
  ok("보이는 자리가 44px 미만이면 창을 숨긴다 (원래대로)",
    r2.보임 === "hidden", "보임=" + r2.보임);

  /* 칩이 안 보이면 창도 숨깁니다 (원래 동작 그대로) */
  const 칩없음 = Object.assign({}, 빠듯, { 이름: "칩없음", 칩보임: "none" });
  const r3 = 화면만들기(칩없음);
  ok("칩이 안 보이면 창도 숨긴다 (원래대로)", r3.보임 === "hidden", "보임=" + r3.보임);
}

/* =====================================================================
 * [5] 소스 — 되돌림 방지
 * ===================================================================== */
절("[5] 소스 — 고친 방식이 되돌아가지 않게");
{
  const 본문 = 조각.placeStyle || "";
  ok("아래쪽 방어가 있다 (vis.bottom 으로 눌러 앉힌다)",
    /top\s*\+\s*box\.offsetHeight\s*>\s*vis\.bottom/.test(본문), "없음");
  ok("★글씨·단추는 안 줄인다★ (fontSize·width·height 를 건드리지 않는다)",
    !/fontSize|font-size|style\.width|style\.height|maxHeight/.test(본문),
    "크기를 건드립니다 — 이 창은 자리만 막기로 했습니다");

  /* 막는 차례 — 위 → 아래 → 화면위끝. 아래가 위보다 나중이라 이깁니다 */
  const i위 = 본문.indexOf("if (top < vis.top)");
  const i아래 = 본문.search(/top\s*\+\s*box\.offsetHeight\s*>\s*vis\.bottom/);
  const i끝 = 본문.indexOf("if (top < CHIP_EDGE)");
  ok("★아래 막기가 위 막기보다 나중이다★ (아래가 이겨야 합니다)",
    i위 >= 0 && i아래 > i위, "위=" + i위 + " 아래=" + i아래);
  ok("★마지막은 화면 위끝(CHIP_EDGE)★ — vis.top 으로 다시 올리면 주문 막대에 물립니다",
    i끝 > i아래, "끝=" + i끝 + " 아래=" + i아래);

  /* 같은 파일의 형제 셋이 같은 규칙을 쓰는지 — 하나만 또 빠지는 것을 막습니다 */
  const 알림 = 함수떼기("placeToast") || "";
  const 목록 = 함수떼기("placeList") || "";
  ok("(견줌) placeToast 에도 같은 아래쪽 방어가 있다",
    /y\s*\+\s*h\s*>\s*box\.bottom/.test(알림), "없음");
  ok("(견줌) placeToast 도 마지막은 CHIP_EDGE 로 막는다",
    /if\s*\(y\s*<\s*CHIP_EDGE\)/.test(알림), "없음");
  ok("(견줌) placeList 에도 같은 아래쪽 방어가 있다",
    /top\s*\+\s*box\.offsetHeight\s*>\s*vis\.bottom/.test(목록), "없음");
  ok("(견줌) placeList 도 마지막은 CHIP_EDGE 로 막는다",
    /if\s*\(top\s*<\s*CHIP_EDGE\)/.test(목록), "없음");

  /* ★putFixed 를 부르는 자리마다 아래쪽 방어가 있는지★ — 세 번째가 또
     생기지 않게 개수로 잠급니다. 새 창을 만들면 여기서 빨개지고,
     그때 「아래쪽 방어를 넣었나」 를 반드시 다시 보게 됩니다. */
  const 부르는곳 = (SRC.match(/putFixed\(/g) || []).length - 1; /* 정의 1줄 제외 */
  ok("putFixed 를 부르는 자리가 5곳이다 (칩2 · 알림1 · 색굵기1 · 목록1)",
    부르는곳 === 5,
    "지금 " + 부르는곳 + "곳 — 새로 띄우는 것을 만들었다면 ★아래쪽 방어★ 를 " +
    "넣었는지 보고 이 숫자를 고치세요 (placeToast · placeList · placeStyle 참고)");
}

/* =====================================================================
 * [6] 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-style-pick-fit.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
