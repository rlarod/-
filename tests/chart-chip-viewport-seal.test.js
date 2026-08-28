/* tests/chart-chip-viewport-seal.test.js
 * =========================================================================
 * "그린 것" 칩 · "확대됨" 칩 · 알림줄은 화면(viewport) 기준으로 잡는다
 * =========================================================================
 * 2026-08-28 — 기록팀 봉인 / 본부장 배정
 *
 * ── 무슨 일이 있었나 ────────────────────────────────────────────────────
 *
 *   2026-08-27 밤, 차트팀이 fx 지표 목록이 폰에서 화면 밖으로 열리는 것을
 *   고치면서 같은 원인의 버그를 두 개 더 찾아 같이 고쳤습니다.
 *
 *     "그린 것" 칩 (.tl-draw-chip)
 *     알림줄      (.tl-draw-toast)
 *
 *   원인은 셋 다 똑같습니다 — 차트 칸(.chart-wrap) 기준으로 붙였습니다.
 *   폰에서 차트 칸은 화면보다 훨씬 깁니다.
 *
 *     360x800 실측 (2026-08-27)
 *       .chart-wrap        682 ~ 1242  (560px)
 *       화면 높이          800
 *       하단 매수/매도 바   위끝 727
 *
 *     칸 기준(position:absolute) + bottom:28px 이면
 *       칩 위끝 = 1242 - 28 - 28 = 1186px   <- 화면(800) 밖으로 386px
 *
 *   회원 눈에는 칩이 그냥 "없는" 것으로 보입니다. 오류도 안 나고 차트도
 *   멀쩡합니다. 지운 적도 없는데 "그린 것 [지우기]" 버튼이 안 보이고,
 *   확대해 놓고도 "되돌리기" 를 못 찾습니다. 조용한 고장입니다.
 *
 * ── 그래서 여기서 못 박는 것 ────────────────────────────────────────────
 *   (1) 세 선택자의 "최종" position 이 fixed 다
 *       문자열 한 번 찾기로는 부족합니다 — 같은 규칙을 아래에 한 벌 더 쓰면
 *       뒤엣것이 이깁니다. 이 프로젝트에서 두 번 났던 유형입니다
 *       (tests/css-duplicate-rules.test.js 와 같은 이유).
 *   (2) 그 규칙에 bottom / right 앵커가 없다 (칸 기준으로 붙이던 옛 방식)
 *   (3) 실제 좌표 계산 — 소스의 배치 함수를 그대로 떼어내 돌려서,
 *       여러 폭 상황에서 칩이 화면 안에 있는지 숫자로 확인합니다
 *
 * ── 어떻게 확인하나 (재구현하지 않습니다) ───────────────────────────────
 *   배치 함수(chipFloorY / visibleBox / placeChips / placeToast)는 모듈
 *   바깥으로 내보내지 않습니다. 그래서 js/chart-drawings.js 의 그 함수
 *   본문을 글자 그대로 떼어내 가짜 화면 위에서 돌립니다.
 *   테스트가 계산을 따로 베껴 쓰면 원본이 바뀌어도 테스트는 옛 계산을
 *   지키게 되어 아무것도 못 잡습니다. 그래서 베끼지 않았습니다.
 *
 *   주의 — 차트팀이 함수 이름을 바꾸면 [0] 에서 "못 찾았다" 로 멈춥니다.
 *   그건 고장이 아니라 신호입니다. 아래 GEOM 목록의 이름만 고쳐 주세요.
 *
 * ── 여기서 봉인하지 않는 것 ─────────────────────────────────────────────
 *   도구 개수 · 브러시 · 여러선 · 파동 — 차트팀이 지금 만들고 있습니다.
 *   그 부분은 일부러 손대지 않았습니다. 이 파일은 자리잡기만 봅니다.
 *
 * 이 파일은 파일만 읽습니다. 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");

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

/* =========================================================================
 * [0] 준비 — 배치 계산부를 소스에서 글자 그대로 떼어낸다
 * ========================================================================= */
절("[0] 준비 - 자리잡기 계산부를 원본에서 그대로 떼어낸다");

const GEOM = ["vpW", "vpH", "chipFloorY", "visibleBox", "putFixed", "placeChips", "placeToast"];

/** function 이름(...) { ... } 한 덩어리를 중괄호 짝을 세어 잘라냅니다 */
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
for (const n of GEOM) {
  조각[n] = 함수떼기(n);
  if (!조각[n]) 다떼었다 = false;
}
ok("자리잡기 함수 " + GEOM.length + "개를 원본에서 찾았다",
  다떼었다,
  "못 찾은 것: " + GEOM.filter((n) => !조각[n]).join(", ") +
  " (차트팀이 이름을 바꿨다면 이 파일 위쪽 GEOM 목록을 고치세요)");

const m칩여백 = /var\s+CHIP_EDGE\s*=\s*(\d+)\s*;/.exec(SRC);
ok("화면 가장자리 여백(CHIP_EDGE)이 원본에 있다", !!m칩여백, String(m칩여백));
const CHIP_EDGE = m칩여백 ? Number(m칩여백[1]) : 8;
ok("여백이 8px 다 (바뀌면 아래 기대값도 같이 봐야 합니다)", CHIP_EDGE === 8, String(CHIP_EDGE));

/* =========================================================================
 * [1] CSS - 칩·알림줄의 "최종" position 이 fixed 다
 * -------------------------------------------------------------------------
 * 문자열이 한 번 나오는지가 아니라, 마지막으로 이긴 선언을 봅니다.
 * 이 프로젝트에서 "같은 CSS 규칙이 두 벌" 이 두 번 났고 그때마다
 * 뒤엣것이 앞을 덮어 수정이 안 먹혔습니다.
 * ========================================================================= */
절("[1] CSS - 칩·알림줄의 최종 position 이 fixed 다");

/* 모듈이 만들어 넣는 CSS 는 소스에 문자열 조각으로 이어 붙어 있습니다.
   따옴표를 걷어내고 한 줄로 이으면 실제로 들어가는 CSS 와 같아집니다. */
const CSS덩어리 = (function () {
  let out = "";
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = re.exec(SRC)) !== null) out += m[1];
  return out;
})();

const 대상선택자 = [".tl-draw-chip", ".tl-zoom-chip", ".tl-draw-toast"];

/** 이어붙인 CSS 에서 그 선택자 블록들을 전부 찾아 마지막 position 을 돌려줍니다 */
function 최종position(sel) {
  const 블록들 = [];
  let from = 0;
  for (;;) {
    const i = CSS덩어리.indexOf(sel + "{", from);
    if (i < 0) break;
    const j = CSS덩어리.indexOf("}", i);
    if (j < 0) break;
    블록들.push(CSS덩어리.slice(i + sel.length + 1, j));
    from = j + 1;
  }
  let 값 = null;
  for (const b of 블록들) {
    const mm = /(?:^|;)\s*position\s*:\s*([a-z]+)/.exec(b);
    if (mm) 값 = mm[1];
  }
  return { 값: 값, 블록수: 블록들.length, 블록들: 블록들 };
}

for (const sel of 대상선택자) {
  const r = 최종position(sel);
  ok(sel + " 의 최종 position 이 fixed 다", r.값 === "fixed",
    "지금 " + r.값 + " (블록 " + r.블록수 + "개)");
  ok(sel + " 규칙이 한 벌뿐이다 (두 벌이면 뒤엣것이 이깁니다)", r.블록수 === 1,
    "블록 " + r.블록수 + "개");
}

/* =========================================================================
 * [2] CSS - 칸 기준으로 붙이던 옛 앵커가 없다
 * -------------------------------------------------------------------------
 * 옛 방식은 .chart-wrap 안에서 bottom:28px / right:8px 로 붙였습니다.
 * 지금은 JS 가 left/top 을 화면 좌표로 계산해 넣습니다.
 * CSS 에 bottom/right 가 남아 있으면 계산값과 싸웁니다.
 * ========================================================================= */
절("[2] CSS - 칸 기준 앵커(bottom·right)가 남아 있지 않다");

for (const sel of 대상선택자) {
  const r = 최종position(sel);
  const 본문 = r.블록들.join(";");
  ok(sel + " 에 bottom 앵커가 없다", !/(?:^|;)\s*bottom\s*:/.test(본문), 본문.slice(0, 90));
  ok(sel + " 에 right 앵커가 없다", !/(?:^|;)\s*right\s*:/.test(본문), 본문.slice(0, 90));
  ok(sel + " 은 left/top 을 0 에서 시작한다 (자리는 JS 가 넣습니다)",
    /left\s*:\s*0/.test(본문) && /top\s*:\s*0/.test(본문), 본문.slice(0, 90));
}

/* =========================================================================
 * [3] 실제 좌표 계산 - 원본 함수를 그대로 돌린다
 * ========================================================================= */
절("[3] 실제 좌표 - 원본 계산부를 가짜 화면 위에서 돌린다");

function 화면만들기(설정) {
  const wrap = { getBoundingClientRect: function () { return 설정.wrap; } };
  const 바 = 설정.바
    ? { getBoundingClientRect: function () { return 설정.바; },
        __display: 설정.바.display || "block" }
    : null;

  const document = {
    documentElement: { clientWidth: 설정.w, clientHeight: 설정.h },
    fullscreenElement: 설정.전체화면 ? {} : null,
    webkitFullscreenElement: null,
    querySelector: function (s) { return s === ".tl-order-bar" ? 바 : null; }
  };
  const window = {
    innerWidth: 설정.w,
    innerHeight: 설정.h,
    getComputedStyle: function (el) { return { display: el.__display }; }
  };

  const 칩 = function (w, h, 켬) {
    return {
      style: { display: 켬 ? "flex" : "none", left: "", top: "", visibility: "" },
      offsetWidth: w, offsetHeight: h
    };
  };
  const els = {
    chip: 설정.그린것 ? 칩(설정.그린것.w, 설정.그린것.h, true) : 칩(0, 0, false),
    zoomChip: 설정.확대됨 ? 칩(설정.확대됨.w, 설정.확대됨.h, true) : 칩(0, 0, false),
    toast: 설정.알림줄
      ? { style: { display: "block", left: "", top: "", visibility: "" },
          offsetWidth: 설정.알림줄.w, offsetHeight: 설정.알림줄.h }
      : null
  };

  const sandbox = { window: window, document: document, wrap: wrap, els: els,
    console: { warn: function () {}, log: function () {} } };
  vm.createContext(sandbox);
  vm.runInContext(
    "var CHIP_EDGE = " + CHIP_EDGE + ";\n" + GEOM.map(function (n) { return 조각[n]; }).join("\n"),
    sandbox, { filename: "geom-lifted.js" }
  );
  sandbox.__box = sandbox.visibleBox();
  sandbox.placeChips();
  sandbox.placeToast();
  return sandbox;
}

const 수 = (s) => (s === "" || s === undefined ? NaN : parseFloat(s));
const 위치 = (el) => ({
  left: 수(el.style.left), top: 수(el.style.top),
  보임: el.style.visibility !== "hidden",
  아래끝: 수(el.style.top) + el.offsetHeight,
  오른끝: 수(el.style.left) + el.offsetWidth
});

/* ------------------------------------------------------------------------
 * (가) 360x800 - 2026-08-27 실측 그대로
 *      차트 칸 682~1242, 화면 800, 매수/매도 바 위끝 727
 *      실제로 보이는 자리가 37px 뿐이라 칩을 아예 숨겨야 맞습니다.
 *      옛 방식이었다면 칩 위끝이 1186px - 화면 밖 386px 이었습니다.
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800,
    wrap: { top: 682, bottom: 1242, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    그린것: { w: 96, h: 28 }
  });
  const a = 위치(s.els.chip);
  ok("360 실측 - 보이는 자리가 모자라면 칩을 아예 숨긴다",
    s.__box === null && a.보임 === false,
    JSON.stringify({ box: s.__box, 보임: a.보임 }));
  ok("360 실측 - 화면 밖 1186px 같은 자리에 놓지 않는다",
    !(a.top > 800), "top=" + a.top);
}

/* ------------------------------------------------------------------------
 * (나) 360x800 - 회원이 조금 올려서 차트가 화면에 걸친 상태
 *      차트 칸 300~860 (아래로 60px 삐져나감), 매수/매도 바 위끝 727
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800,
    wrap: { top: 300, bottom: 860, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    그린것: { w: 96, h: 28 },
    확대됨: { w: 150, h: 28 }
  });
  const a = 위치(s.els.chip);
  const b = 위치(s.els.zoomChip);
  ok("360 - '그린 것' 칩이 화면 안이다", a.보임 && a.top >= 0 && a.아래끝 <= 800,
    JSON.stringify(a));
  ok("360 - '확대됨' 칩이 화면 안이다", b.보임 && b.top >= 0 && b.아래끝 <= 800,
    JSON.stringify(b));
  ok("360 - 두 칩 모두 매수/매도 바(727) 위에 있다",
    a.아래끝 <= 727 && b.아래끝 <= 727,
    JSON.stringify({ 그린것: a.아래끝, 확대됨: b.아래끝 }));
  ok("360 - 왼쪽으로 잘리지 않는다", a.left >= 0 && b.left >= 0,
    JSON.stringify({ a: a.left, b: b.left }));
  ok("360 - 오른쪽으로 잘리지 않는다", a.오른끝 <= 360 && b.오른끝 <= 360,
    JSON.stringify({ a: a.오른끝, b: b.오른끝 }));
  ok("360 - '그린 것' 은 왼쪽, '확대됨' 은 오른쪽 (바이낸스 자리)",
    a.left < b.left, JSON.stringify({ a: a.left, b: b.left }));
}

/* ------------------------------------------------------------------------
 * (다) 칩 두 개가 좁아서 겹칠 때 - 확대됨 칩이 한 줄 위로 올라간다
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800,
    wrap: { top: 300, bottom: 860, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    그린것: { w: 96, h: 28 },
    확대됨: { w: 300, h: 28 }
  });
  const a = 위치(s.els.chip);
  const b = 위치(s.els.zoomChip);
  ok("좁아서 겹치면 '확대됨' 을 한 줄 위로 올린다", b.top < a.top,
    JSON.stringify({ 그린것: a.top, 확대됨: b.top }));
  ok("올려도 화면 안이다", b.top >= 0 && b.아래끝 <= 800, JSON.stringify(b));
  ok("올려도 왼쪽으로 안 잘린다", b.left >= 0, String(b.left));
}

/* ------------------------------------------------------------------------
 * (라) 1920x900 - 매수/매도 바가 아예 없는 폭
 *      디자인팀 CSS 의 @media max-width:700px 라 1920·768 에는 없습니다.
 *      없다고 터지면 데스크톱에서 칩이 통째로 안 나옵니다.
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 1920, h: 900,
    wrap: { top: 200, bottom: 800, left: 300, right: 1600 },
    바: null,
    그린것: { w: 96, h: 28 },
    확대됨: { w: 150, h: 28 }
  });
  const a = 위치(s.els.chip);
  const b = 위치(s.els.zoomChip);
  ok("1920 - 매수/매도 바가 없어도 터지지 않는다", s.__box !== null);
  ok("1920 - 두 칩이 화면 안이다",
    a.보임 && b.보임 && a.아래끝 <= 900 && b.아래끝 <= 900, JSON.stringify({ a: a, b: b }));
  ok("1920 - 칩이 차트 칸 안에 머문다",
    a.left >= 300 && b.오른끝 <= 1600, JSON.stringify({ a: a.left, b: b.오른끝 }));
}

/* ------------------------------------------------------------------------
 * (마) 768 - 바가 DOM 에는 있는데 display:none 인 폭
 *      display 를 안 보고 rect 만 믿으면 있지도 않은 바를 피하느라
 *      칩이 위로 밀립니다.
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 768, h: 900,
    wrap: { top: 100, bottom: 700, left: 0, right: 768 },
    바: { top: 300, bottom: 380, height: 80, display: "none" },
    그린것: { w: 96, h: 28 }
  });
  const a = 위치(s.els.chip);
  ok("768 - display:none 인 매수/매도 바는 세지 않는다",
    a.아래끝 > 380, "칩 아래끝 " + a.아래끝 + " (안 세면 692 근처)");
  ok("768 - 칩이 차트 칸 아래끝 근처에 붙는다",
    Math.abs(a.아래끝 - (700 - CHIP_EDGE)) < 1, String(a.아래끝));
}

/* ------------------------------------------------------------------------
 * (바) 전체화면 - 매수/매도 바는 화면에 안 그려지므로 세지 않는다
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800, 전체화면: true,
    wrap: { top: 0, bottom: 800, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    그린것: { w: 96, h: 28 }
  });
  const a = 위치(s.els.chip);
  ok("전체화면 - 매수/매도 바를 세지 않는다", a.아래끝 > 727,
    "칩 아래끝 " + a.아래끝);
  ok("전체화면 - 그래도 화면 밖으로는 안 나간다", a.아래끝 <= 800, String(a.아래끝));
}

/* ------------------------------------------------------------------------
 * (사) 스크롤로 차트가 화면 위로 완전히 빠져나갔을 때
 *      안 보이는 것을 그리면 칩만 화면에 덩그러니 남습니다.
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800,
    wrap: { top: -600, bottom: -40, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    그린것: { w: 96, h: 28 },
    확대됨: { w: 150, h: 28 },
    알림줄: { w: 200, h: 30 }
  });
  ok("차트가 화면 밖이면 보이는 네모가 없다", s.__box === null, JSON.stringify(s.__box));
  ok("-> '그린 것' 칩을 숨긴다", s.els.chip.style.visibility === "hidden");
  ok("-> '확대됨' 칩을 숨긴다", s.els.zoomChip.style.visibility === "hidden");
  ok("-> 알림줄도 숨긴다", s.els.toast.style.visibility === "hidden");
}

/* ------------------------------------------------------------------------
 * (아) 알림줄 - 보이는 네모 가운데에, 위쪽에 붙는다
 * ---------------------------------------------------------------------- */
{
  const s = 화면만들기({
    w: 360, h: 800,
    wrap: { top: 300, bottom: 860, left: 0, right: 360 },
    바: { top: 727, bottom: 800, height: 73 },
    알림줄: { w: 200, h: 30 }
  });
  const t = 위치(s.els.toast);
  ok("알림줄이 화면 안이다", t.보임 && t.top >= 0 && t.아래끝 <= 800, JSON.stringify(t));
  ok("알림줄이 좌우로 안 잘린다", t.left >= 0 && t.오른끝 <= 360, JSON.stringify(t));
  ok("알림줄이 가운데다", Math.abs((t.left + t.오른끝) / 2 - 180) <= 1,
    String((t.left + t.오른끝) / 2));
  ok("알림줄이 차트 위쪽에 붙는다", Math.abs(t.top - (300 + CHIP_EDGE)) < 1, String(t.top));
}

/* =========================================================================
 * [4] 스크롤·크기변경 때 다시 잡는다
 * -------------------------------------------------------------------------
 * position:fixed 는 페이지가 움직여도 제자리에 남습니다. 다시 안 잡으면
 * 차트는 올라갔는데 칩만 화면 한가운데 떠 있게 됩니다.
 * ========================================================================= */
절("[4] 페이지가 움직이면 칩을 다시 잡는다");
{
  const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
  ok("스크롤을 듣는다", /addEventListener\(\s*"scroll"\s*,\s*placeSoon/.test(CODE));
  ok("스크롤을 캡처 단계로 듣는다 (안쪽 스크롤 상자도 잡습니다)",
    /addEventListener\(\s*"scroll"\s*,\s*placeSoon\s*,\s*true\s*\)/.test(CODE));
  ok("창 크기가 바뀌어도 다시 잡는다",
    /addEventListener\(\s*"resize"[^]{0,300}placeSoon\(\)/.test(CODE));
  ok("한 프레임에 한 번만 계산한다 (스크롤마다 계산하면 폰이 버벅입니다)",
    /requestAnimationFrame/.test(CODE) && /placeRaf/.test(CODE),
    "placeSoon 안에 프레임 묶음이 없습니다");
}

/* =========================================================================
 * [5] 수정 금지 파일 - 이 봉인을 넣으면서 건드리지 않았다
 * -------------------------------------------------------------------------
 * 문자열로 파일명을 찾으면 주석에 적힌 이름 때문에 오탐이 납니다.
 * 그래서 md5 로 봅니다.
 * ========================================================================= */
절("[5] 수정 금지 파일을 건드리지 않았다");
{
  const crypto = require("crypto");
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "chart.js": "02ddcb000d577131f797143d08c09123",
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e"
  };
  for (const f of Object.keys(기준)) {
    let h = null;
    try {
      h = crypto.createHash("md5")
        .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
    } catch (e) { h = "읽기실패"; }
    ok("js/" + f + " 를 건드리지 않았다", h === 기준[f], h);
  }
  ok("차트 칩 모듈이 js/chart.js 를 덮어쓰지 않는다",
    !/App\.Chart\s*=/.test(SRC), "chart.js 를 덮어쓰는 줄이 있습니다");
}

/* =========================================================================
 * [6] 등록 · 이모지
 * ========================================================================= */
절("[6] 등록 · 이모지");
{
  const order = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/chart-chip-viewport-seal.test.js") !== -1,
    "빠지면 npm test 가 이 파일을 안 돌립니다");
  /* 저장소 전체 이모지 검사는 tests/no-emoji.test.js 가 합니다.
     여기서는 봉인 대상인 칩 버튼 글자만 봅니다 — 버튼 글자에 그림문자를
     넣으면 폰 글꼴에 따라 네모로 보이고, 칩 너비가 달라져 자리 계산도
     같이 어긋납니다. */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  /* ⚠ 주석을 먼저 걷어냅니다 (2026-08-28 기록팀).
     그전에는 파일 전체에서 따옴표를 찾았는데, 주석 안에도 따옴표가 있어서
     따옴표 하나부터 한참 뒤 따옴표까지 **설명문 덩어리가 통째로** 잡혔습니다.
     실제로 2026-08-28 차트팀이 주석에 그림문자를 하나 넣자, 칩 버튼과
     아무 상관 없는 이 검사가 터졌습니다 — 잡아야 할 것을 잡은 게 아니라
     엉뚱한 곳을 보고 있던 것입니다.
     (파일 전체의 그림문자는 tests/no-emoji.test.js 와
      tests/chart-drawings.test.js 가 따로 봅니다. 여기는 칩 글자만 봅니다) */
  const 코드만 = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const 칩글자 = (코드만.match(/"[^"]*(?:되돌리기|전체 지우기|지우기|그린 것|확대됨)[^"]*"/g) || []).join(" ");
  ok("칩 버튼 글자를 찾았다", 칩글자.length > 0, 칩글자.slice(0, 160));
  ok("칩 버튼 글자에 그림문자가 없다", !EMOJI.test(칩글자), 칩글자.slice(0, 160));
}

/* ===================================================================== */
console.log("\n==========================================================");
if (fail) {
  console.log("실패 " + fail + "건");
  for (const s of 실패목록) console.log("  - " + s);
}
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("chart-chip-viewport-seal - 전체 통과");
process.exit(fail ? 1 : 0);
