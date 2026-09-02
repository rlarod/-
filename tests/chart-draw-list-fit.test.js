/* tests/chart-draw-list-fit.test.js
 * =========================================================================
 * 「그린 것 목록」이 화면 아래로 넘치지 않는다 — 2026-09-03 (수리팀)
 *   대상: js/chart-drawings.js  (placeList)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 목록 창(.tl-draw-list)은 그리기 칩 바로 위에서 ★위로★ 자랍니다.
 * placeList 에는 ★위쪽 방어만★ 있고 아래쪽 방어가 없었습니다.
 *
 *     var top = 칩top - box.offsetHeight - 6;
 *     if (top < vis.top) top = vis.top;      ← 위만 막음
 *     putFixed(box, left, top);              ← 아래는 안 막음
 *
 * 같은 파일의 placeToast 에는 그 방어가 있습니다. placeList 에만 빠졌습니다.
 *
 * ⚠️ ★최악 자리는 스크롤을 훑어야 나옵니다.★ 차트가 화면 가운데 있을 때
 *    재면 그냥 통과합니다. 폰에서 살짝 내린 자리(360·y=50)가 최악입니다.
 *
 * 2026-09-03 실측 (localhost · 그린 것 3개 · 스크롤 25px 간격 전수)
 *   폭    최악 y   고치기 전 목록      화면밖   주문막대밑   막힌단추
 *   360    50      666~838 (키 172)   +38px    +111px       9 (+3 화면밖)
 *   375    50      666~838            +38      +111         9 (+3)
 *   390    25      660~832            +32      +105         6 (+3)
 *   768   100      737~909            +109     (막대 없음)  0 (+9 화면밖)
 *  1440     0      745~917            +117     (없음)       0 (+12)
 *  1920    25      739~911            +111     (없음)       0 (+12)
 *
 *   고친 뒤 — 여섯 폭 모두 615~719 / 688~792 (키 104)
 *             화면밖 0 · 주문막대에 물림 0 · 막힌단추 0 · 화면밖단추 0
 *
 * 고친 방법 — ★두 가지를 같이★ 합니다. 눌러 앉히기만 하면 안 됩니다.
 *   ① ★키를 줄인다★  최악일 때 차트 칸에 47px 밖에 안 남습니다.
 *      .rows 는 이미 overflow-y:auto 라 줄여도 항목이 사라지지 않습니다.
 *      ★글씨는 안 줄입니다★ (파일 4290줄 주석: 좁다고 줄이지 말고
 *      안에서 세로로 스크롤한다).
 *   ② ★아래를 막는다★  placeToast 와 같은 차례입니다 —
 *      위 막기 → 아래 막기 → 화면 위끝 막기. ★아래가 나중이라 이깁니다.★
 *
 *      ⚠️ 마지막 줄이 vis.top 이 아니라 ★CHIP_EDGE★ 인 것이 중요합니다.
 *         조사팀 제안대로 vis.top 으로 다시 올리면, 아무리 줄여도
 *         머리(70px)+한 줄(34px)=104px > 남은 자리(47px) 라 아래가 다시
 *         주문 막대 밑으로 43px 내려가 단추 9개가 막힙니다 (2026-09-03 실측).
 *         placeToast 도 box.top 이 아니라 CHIP_EDGE 로 막습니다.
 *
 * ── 어떻게 확인하나 (계산을 베끼지 않습니다) ──────────────────────────
 * 자리잡기 함수는 모듈 밖으로 안 나옵니다. 그래서 원본 함수 본문을
 * ★글자 그대로 떼어내★ 가짜 화면 위에서 돌립니다.
 * 테스트가 계산을 따로 베껴 쓰면 원본이 바뀌어도 옛 계산만 지키게 됩니다.
 * (tests/chart-chip-viewport-seal.test.js 와 같은 방식입니다)
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

console.log("\n그린 것 목록이 화면 아래로 넘치지 않는다");

/* =====================================================================
 * [0] 준비 — 자리잡기 계산부를 원본에서 글자 그대로 떼어낸다
 * ===================================================================== */
절("[0] 준비 — 원본에서 계산부를 그대로 떼어낸다");

const 필요함수 = ["vpW", "vpH", "chipFloorY", "visibleBox", "putFixed", "placeList"];

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
const LIST_MAX_H = 상수("LIST_MAX_H", 240);
const LIST_ROW_H = 상수("LIST_ROW_H", 34);
ok("여백 8 · 최대높이 240 · 한 줄 34 (바뀌면 아래 기대값도 같이 봐야 합니다)",
  CHIP_EDGE === 8 && LIST_MAX_H === 240 && LIST_ROW_H === 34,
  CHIP_EDGE + " / " + LIST_MAX_H + " / " + LIST_ROW_H);

/* ---------------------------------------------------------------------
 * 가짜 화면.
 *   목록 키 = 머리(head) + .rows 키
 *   .rows 키 = min(내용, style.maxHeight 가 있으면 그 값, 없으면 LIST_MAX_H)
 * 이 두 줄이 진짜 브라우저와 같은지는 1절에서 실측과 맞춰 봅니다.
 * ------------------------------------------------------------------- */
function 화면만들기(설정) {
  const 내용 = 설정.줄수 * LIST_ROW_H;
  const 머리 = 설정.머리;

  const rows = {
    className: "rows",
    style: {},
    get offsetHeight() {
      const mh = parseFloat(this.style.maxHeight);
      return Math.min(내용, isNaN(mh) ? LIST_MAX_H : mh);
    }
  };
  const list = {
    style: {},
    get offsetWidth() {
      const mw = parseFloat(this.style.maxWidth);
      return Math.min(설정.바라는폭, isNaN(mw) ? 설정.바라는폭 : mw);
    },
    get offsetHeight() { return 머리 + rows.offsetHeight; }
  };
  const chip = { style: { display: "flex", top: 설정.칩top + "px", left: "0px" } };

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
    els: { list: list, listRows: rows, chip: chip },
    console: { warn: function () {}, log: function () {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    "var CHIP_EDGE=" + CHIP_EDGE + ";var LIST_MAX_H=" + LIST_MAX_H +
    ";var LIST_ROW_H=" + LIST_ROW_H + ";\n" +
    필요함수.map(function (n) { return 조각[n]; }).join("\n"),
    sandbox, { filename: "place-lifted.js" }
  );
  sandbox.__vis = sandbox.visibleBox();
  sandbox.placeList();
  const top = parseFloat(list.style.top);
  const left = parseFloat(list.style.left);
  return {
    vis: sandbox.__vis,
    위: top, 아래: top + list.offsetHeight, 키: list.offsetHeight,
    왼: left, 폭: list.offsetWidth,
    rowsMaxH: rows.style.maxHeight || "(안정함)", rows키: rows.offsetHeight,
    보임: list.style.visibility, 설정: 설정
  };
}

/* 2026-09-03 브라우저 실측 그대로. 그린 것 3개 · 폭마다 최악 스크롤 자리 */
const 실측 = [
  { 이름: "360 · y=50", w: 360, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 345 },
    바: { top: 727, height: 73 }, 칩top: 681, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 666, 아래: 838 }, 후: { 위: 615, 아래: 719, 폭: 314, 왼: 23 } },
  { 이름: "375 · y=50", w: 375, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 360 },
    바: { top: 727, height: 73 }, 칩top: 681, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 666, 아래: 838 }, 후: { 위: 615, 아래: 719, 폭: 329, 왼: 23 } },
  { 이름: "390 · y=25", w: 390, h: 800, wrap: { top: 660, bottom: 1220, left: 15, right: 375 },
    바: { top: 727, height: 73 }, 칩top: 681, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 660, 아래: 832 }, 후: { 위: 615, 아래: 719, 폭: 344, 왼: 23 } },
  { 이름: "768 · y=100", w: 768, h: 800, wrap: { top: 737, bottom: 1430, left: 83, right: 753 },
    바: null, 칩top: 754, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 737, 아래: 909 }, 후: { 위: 688, 아래: 792, 폭: 360, 왼: 91 } },
  { 이름: "1440 · y=0", w: 1440, h: 800, wrap: { top: 745, bottom: 1734, left: 83, right: 799 },
    바: null, 칩top: 754, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 745, 아래: 917 }, 후: { 위: 688, 아래: 792, 폭: 360, 왼: 91 } },
  { 이름: "1920 · y=25", w: 1920, h: 800, wrap: { top: 739, bottom: 1727, left: 83, right: 815 },
    바: null, 칩top: 754, 바라는폭: 360, 머리: 70, 줄수: 3,
    전: { 위: 739, 아래: 911 }, 후: { 위: 688, 아래: 792, 폭: 360, 왼: 91 } }
];

/* =====================================================================
 * [1] 흉내가 브라우저 실측과 같은가 — 여기가 틀리면 아래는 다 헛것입니다
 * ===================================================================== */
절("[1] 흉내 맞춰보기 — 브라우저 실측과 글자 그대로 같은가");

const 잰것 = 실측.map(화면만들기);
실측.forEach(function (c, i) {
  const r = 잰것[i];
  ok(c.이름 + " — 목록 자리가 실측과 같다 (위 " + c.후.위 + " · 아래 " + c.후.아래 + ")",
    r.위 === c.후.위 && r.아래 === c.후.아래,
    "흉내 " + r.위 + "~" + r.아래);
  ok(c.이름 + " — 가로 자리·폭도 실측과 같다 (왼 " + c.후.왼 + " · 폭 " + c.후.폭 + ")",
    r.왼 === c.후.왼 && r.폭 === c.후.폭, "흉내 왼" + r.왼 + " 폭" + r.폭);
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
  ok(c.이름 + " — 목록이 사라지지 않는다 (한 줄은 남는다)",
    r.rows키 >= LIST_ROW_H && r.보임 !== "hidden", "rows " + r.rows키);
});

/* 고치기 전이었다면 어떤 값이었나 — 봉인이 무엇을 막는지 숫자로 남깁니다 */
절("[2-1] 고치기 전 값과 견주기 (그때는 이만큼 넘쳤습니다)");
실측.forEach(function (c, i) {
  const r = 잰것[i];
  const 전넘침 = c.전.아래 - c.h;
  ok(c.이름 + " — 전 " + c.전.위 + "~" + c.전.아래 + "(화면밖 " + (전넘침 > 0 ? "+" + 전넘침 : 전넘침) +
    "px) → 후 " + r.위 + "~" + r.아래 + "(화면밖 " + (r.아래 - c.h) + "px)",
    r.아래 - c.h < 전넘침, "안 좋아졌습니다");
});

/* =====================================================================
 * [3] 자리가 넉넉하면 원래대로 — 스스로 되돌아온다
 * ===================================================================== */
절("[3] 자리가 넉넉하면 예전처럼 놓인다 (한 번 줄인 채로 굳지 않는다)");
{
  /* 차트 칸이 화면 안에 넉넉히 보이는 자리 */
  const 넉넉 = {
    이름: "넉넉", w: 1440, h: 900, wrap: { top: 100, bottom: 850, left: 83, right: 799 },
    바: null, 칩top: 800, 바라는폭: 360, 머리: 70, 줄수: 3
  };
  const r = 화면만들기(넉넉);
  ok("칩 바로 위에 놓인다 (칩top 800 - 키 172 - 6 = 622)", r.위 === 622, "위 " + r.위);
  ok("키를 안 줄인다 (rows 가 내용 그대로 102)", r.rows키 === 102, "rows " + r.rows키);
  ok("최대높이는 " + LIST_MAX_H + " 로 되돌아온다",
    r.rowsMaxH === LIST_MAX_H + "px", String(r.rowsMaxH));

  /* 항목이 아주 많아도 LIST_MAX_H 를 넘지 않는다 */
  const 많음 = Object.assign({}, 넉넉, { 이름: "많음", 줄수: 30 });
  const r2 = 화면만들기(많음);
  ok("항목이 30개여도 " + LIST_MAX_H + "px 를 안 넘는다 (안에서 스크롤)",
    r2.rows키 === LIST_MAX_H, "rows " + r2.rows키);
  ok("그래도 화면 안에 있다", r2.아래 <= 넉넉.h && r2.위 >= CHIP_EDGE, r2.위 + "~" + r2.아래);
}

/* =====================================================================
 * [4] 아주 좁아도 화면 밖으로는 안 나간다 (극단)
 * ===================================================================== */
절("[4] 차트 칸이 겨우 보일 만큼 좁아도 화면 밖으로 안 나간다");
{
  /* visibleBox 는 44px 미만이면 null 을 주고 목록을 숨깁니다.
     딱 그 문턱 언저리(45px)에서도 화면 밖으로 안 나가야 합니다. */
  const 빠듯 = {
    이름: "빠듯", w: 360, h: 800, wrap: { top: 674, bottom: 1200, left: 15, right: 345 },
    바: { top: 727, height: 73 }, 칩top: 690, 바라는폭: 360, 머리: 70, 줄수: 3
  };
  const r = 화면만들기(빠듯);
  ok("보이는 자리가 45px 여도 목록을 그린다 (visibleBox 문턱 44 위)",
    r.vis !== null && r.보임 !== "hidden", JSON.stringify(r.vis));
  ok("화면 아래로 안 넘친다", r.아래 <= 800, "아래끝 " + r.아래);
  ok("화면 위로 안 나간다", r.위 >= CHIP_EDGE, "위끝 " + r.위);
  ok("주문 막대 밑으로 안 내려간다", r.아래 <= 727, "아래끝 " + r.아래);

  /* 44px 미만이면 아예 숨깁니다 (원래 동작 그대로) */
  const 너무좁음 = Object.assign({}, 빠듯, {
    이름: "너무좁음", wrap: { top: 700, bottom: 1200, left: 15, right: 345 }
  });
  const r2 = 화면만들기(너무좁음);
  ok("보이는 자리가 44px 미만이면 목록을 숨긴다 (원래대로)",
    r2.보임 === "hidden", "보임=" + r2.보임);
}

/* =====================================================================
 * [5] 소스 — 되돌림 방지
 * ===================================================================== */
절("[5] 소스 — 고친 방식이 되돌아가지 않게");
{
  const 본문 = 조각.placeList || "";
  ok("아래쪽 방어가 있다 (vis.bottom 으로 눌러 앉힌다)",
    /top\s*\+\s*box\.offsetHeight\s*>\s*vis\.bottom/.test(본문), "없음");
  ok("키를 줄인다 (.rows 의 maxHeight 를 정한다)",
    /listRows/.test(본문) && /maxHeight/.test(본문), "없음");
  ok("한 줄(LIST_ROW_H)은 남긴다 (목록이 사라지지 않게)",
    /Math\.max\(\s*LIST_ROW_H/.test(본문), "없음");
  ok("최대높이(LIST_MAX_H)로 되돌아올 수 있다",
    /Math\.min\(\s*LIST_MAX_H/.test(본문), "없음");
  ok("★글씨는 안 줄인다★ (fontSize 를 건드리지 않는다)",
    !/fontSize|font-size/.test(본문), "글씨를 건드립니다");

  /* 막는 차례 — 위 → 아래 → 화면위끝. 아래가 위보다 나중이라 이깁니다 */
  const i위 = 본문.indexOf("if (top < vis.top)");
  const i아래 = 본문.search(/top\s*\+\s*box\.offsetHeight\s*>\s*vis\.bottom/);
  const i끝 = 본문.indexOf("if (top < CHIP_EDGE)");
  ok("★아래 막기가 위 막기보다 나중이다★ (아래가 이겨야 합니다)",
    i위 >= 0 && i아래 > i위, "위=" + i위 + " 아래=" + i아래);
  ok("★마지막은 화면 위끝(CHIP_EDGE)★ — vis.top 으로 다시 올리면 주문 막대에 물립니다",
    i끝 > i아래, "끝=" + i끝 + " 아래=" + i아래);

  /* placeToast 에는 원래 있던 방어입니다 — 같은 규칙을 쓰는지 봅니다 */
  const 알림 = 함수떼기("placeToast") || "";
  ok("(견줌) placeToast 에도 같은 아래쪽 방어가 있다",
    /y\s*\+\s*h\s*>\s*box\.bottom/.test(알림), "없음");
  ok("(견줌) placeToast 도 마지막은 CHIP_EDGE 로 막는다",
    /if\s*\(y\s*<\s*CHIP_EDGE\)/.test(알림), "없음");
}

/* =====================================================================
 * [6] 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-draw-list-fit.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
