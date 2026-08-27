/* tests/chart-toolbar-seal.test.js
 * =============================================================================
 * 차트 도구막대 · 선긋기 "되돌아감 방지" 봉인 (2026-08-26)
 * -----------------------------------------------------------------------------
 * 왜 이 파일이 생겼나
 *
 *  (1) 크기가 하루에 두 번 뒤집혔습니다.
 *      2026-08-25 1차(A안) 에서 아이콘을 우리 아이콘 규칙(16px)에 맞춰 줄였는데
 *      대표님이 "너무 작다" 고 하셨습니다. 업비트·바이낸스 실측 28px 의 57% 였습니다.
 *      2차(B안 22px) 를 거쳐 3차에서 C안(28px) 으로 확정했습니다.
 *      → 아이콘 28 / 버튼 44 아래로 내려가면 이 파일이 실패합니다.
 *
 *      2026-08-26 4차 — 대표님이 C안이 나간 라이브를 보시고도 "더 키워" 라고
 *      두 번째로 말씀하셔서 데스크톱(>=768)만 E안(버튼 60 / 아이콘 36)으로
 *      올렸습니다. 폰(<=767)은 C안(44 / 28) 그대로 둡니다 — 360 차트 칸이
 *      330px 이라 버튼 60px 이면 한 줄에 5칸뿐이고, 늘 보이는 가로 막대가
 *      1줄(44px) -> 2줄(120px) 로 늘어나기 때문입니다.
 *      → 그래서 이 파일은 "한 벌"이 아니라 "데스크톱 값 + 폰 값" 두 벌을 봅니다.
 *        두 벌을 각각 못 박아 두면 한쪽만 조용히 되돌아가도 잡힙니다.
 *
 *  (2) 폰에서 도구가 숨는 방식으로 되돌아가면 안 됩니다.
 *      C안은 세로막대 11칸 × 44px = 484px 인데 360 화면의 차트 칸은 330px 입니다.
 *      옆으로 미는 방식(overflow-x:auto)은 오버레이 스크롤바라 밀기 전에는
 *      막대가 안 보여서, 회원은 도구가 3.5칸 더 있다는 걸 모릅니다.
 *      → flex-wrap 으로 접는 지금 방식이 overflow 로 되돌아가면 실패합니다.
 *
 *  (3) "준비중이라 써 있는데 실제로는 열리는" 모순이 자유게시판에서
 *      회원을 막고 있었습니다(2026-08-26 수정). 같은 실수를 반복하면 안 됩니다.
 *      → 표시(title/data-soon)와 실제(disabled)가 어긋나면 실패합니다.
 *      기존 tests/chart-drawings.test.js 는 "도구 목록(자료)" 을 봤고,
 *      이 파일은 jsdom 으로 "실제로 그려진 버튼(DOM)" 을 봅니다.
 *
 *  (4) 저장 키가 바뀌면 회원이 그어 둔 선이 통째로 사라집니다.
 *      → 실제 localStorage 에 찍히는 키까지 확인합니다.
 *
 *  (5) js/chart.js 무수정 우회가 유지되는지.
 *
 * 기존 파일과 겹치지 않게 나눈 자리
 *   tests/chart-drawings.test.js   — 도구 목록·색·계산부·정규식 (48개)
 *   tests/chart-indicators.test.js — 지표 계산·버튼·저장 (61개)
 *   이 파일                        — CSS 크기값 / 폰 접힘 / DOM 버튼 / 저장 키 / 우회
 * =========================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const stripComments = (s) => s.replace(/[/][*][^]*?[*][/]/g, "");

const CSS_RAW = read("css/chart-toolbar.css");
const CSS = stripComments(CSS_RAW);
const DRAW_SRC = read("js/chart-drawings.js");
const DRAW_CODE = stripComments(DRAW_SRC);
const CHART_JS = read("js/chart.js");
const STORAGE_SRC = read("js/storage.js");

console.log("\n차트 도구막대 · 선긋기 봉인");

/* =============================================================================
 * 1) 도구막대 크기 — C안 (2026-08-25 대표 확정)
 * -------------------------------------------------------------------------- */
console.log("\n[1] 크기 — 데스크톱 E안 / 폰 C안 봉인");

/* ── CSS 를 두 범위로 나눕니다 (2026-08-26 4차) ───────────────────────────────
 * 기본(데스크톱, >=768) : @media (max-width:767px) 블록을 도려낸 나머지
 * 폰(<=767)             : 그 미디어쿼리 블록 안
 * 이렇게 나눠야 "같은 변수가 두 곳" 을 실수(중복)와 의도(폰 분리)로 구분할 수
 * 있습니다. 나누지 않으면 폰 값이 데스크톱 값으로 잘못 읽힙니다.
 * (block 은 아래 [2] 에 선언돼 있습니다. function 선언이라 여기서 써도 됩니다.) */
const PHONE_AT = CSS.search(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/);
const PHONE_CSS = PHONE_AT === -1 ? "" : block(CSS, PHONE_AT);
const DESK_CSS =
  PHONE_AT === -1 ? CSS : CSS.slice(0, PHONE_AT) + CSS.slice(PHONE_AT + PHONE_CSS.length);

/** 주어진 범위에서 크기 변수를 읽습니다(주석은 이미 걷어냈습니다). */
function varIn(scope, name) {
  const m = scope.match(new RegExp("--" + name + "\\s*:\\s*([^;]+);"));
  return m ? m[1].trim() : null;
}
/** 폰 값. 폰에 따로 안 적혀 있으면 데스크톱 값을 물려받습니다(CSS 상속과 같게). */
function phoneVar(name) {
  const v = varIn(PHONE_CSS, name);
  return v !== null ? v : varIn(DESK_CSS, name);
}
/** 데스크톱(기본) 값 */
const cssVar = (n) => varIn(DESK_CSS, n);
function px(name) {
  const v = cssVar(name);
  return v === null ? NaN : parseFloat(v);
}
/** 폰 값 */
function pxM(name) {
  const v = phoneVar(name);
  return v === null ? NaN : parseFloat(v);
}

const ICO = px("tlc-ico");
const BTN = px("tlc-btn");
const RAIL_W = px("tlc-rail-w");
const BAR_H = px("tlc-bar-h");
const BAR_H_M = px("tlc-bar-h-m");
const STROKE = parseFloat(cssVar("tlc-stroke"));

/* 폰(<=767) 값 — 2026-08-26 부터 데스크톱과 다릅니다 */
const M_ICO = pxM("tlc-ico");
const M_BTN = pxM("tlc-btn");
const M_BAR_H_M = pxM("tlc-bar-h-m");
const M_STROKE = parseFloat(phoneVar("tlc-stroke"));

ok(
  "아이콘이 28px 아래로 내려가지 않는다 (업비트·바이낸스 실측 28px 이 기준. 16px 은 그 57% 라 대표님이 '작다'고 하셨습니다)",
  ICO >= 28,
  "지금 " + ICO + "px = 기준의 " + Math.round((ICO / 28) * 100) + "%"
);
ok(
  "버튼 한 칸이 44px 아래로 내려가지 않는다 (손가락으로 누르는 칸. 애플 권고 44pt)",
  BTN >= 44,
  "지금 " + BTN + "px"
);
ok("세로 막대 폭이 52px 아래로 내려가지 않는다 (업비트·바이낸스 둘 다 52px)", RAIL_W >= 52, "지금 " + RAIL_W + "px");
ok("가로 막대 높이가 46px 아래로 내려가지 않는다", BAR_H >= 46, "지금 " + BAR_H + "px");
ok("폰 막대 한 줄 높이가 44px 아래로 내려가지 않는다", BAR_H_M >= 44, "지금 " + BAR_H_M + "px");

/* 2026-08-26 대표 "더 키워" 두 번째 → 데스크톱 E안, 폰은 C안 유지.
   옛 기준 "전 폭 공통 C안 (46/52/44/28/1/44)" → "데스크톱 E안 + 폰 C안" 두 벌.
   한 벌만 보면 한쪽이 조용히 되돌아가도 못 잡습니다. */
ok("데스크톱(>=768) 값이 확정된 E안 그대로다 (62 / 68 / 60 / 36 / 0.9 / 60)",
  BAR_H === 62 && RAIL_W === 68 && BTN === 60 && ICO === 36 && STROKE === 0.9 && BAR_H_M === 60,
  [BAR_H, RAIL_W, BTN, ICO, STROKE, BAR_H_M].join(" / "));
ok("폰(<=767) 값이 확정된 C안 그대로다 (버튼 44 / 아이콘 28 / 획 1 / 한 줄 44)",
  M_BTN === 44 && M_ICO === 28 && M_STROKE === 1 && M_BAR_H_M === 44,
  [M_BTN, M_ICO, M_STROKE, M_BAR_H_M].join(" / "));
ok("폰이 데스크톱보다 작다 (반대로 뒤집히면 폰에서 막대가 세 줄이 됩니다)",
  M_BTN < BTN && M_ICO < ICO, M_BTN + "/" + M_ICO + " vs " + BTN + "/" + ICO);
ok("폰 아이콘이 업비트·바이낸스 실측 28px 아래로는 안 내려간다", M_ICO >= 28, "지금 " + M_ICO + "px");
ok("폰 버튼이 손가락 권고 44px 아래로는 안 내려간다", M_BTN >= 44, "지금 " + M_BTN + "px");
ok("폰도 아이콘 / 버튼 이 0.60~0.64 다 (안을 섞으면 아이콘이 버튼 밖으로 나갑니다)",
  M_ICO / M_BTN >= 0.6 && M_ICO / M_BTN <= 0.64, (M_ICO / M_BTN).toFixed(3));
ok("폰 막대 한 줄 = 폰 버튼", M_BAR_H_M === M_BTN, M_BAR_H_M + " vs " + M_BTN);
{
  const ss = M_STROKE * (M_ICO / 16);
  ok("폰 아이콘 화면 획도 1.5~2.1px 다", ss >= 1.5 && ss <= 2.1, ss.toFixed(2) + "px");
}

/* 값끼리의 관계 — 새 안(D·E)으로 갈아끼워도 이 관계는 지켜야 합니다 */
ok("세로 막대 = 버튼 + 8", RAIL_W === BTN + 8, RAIL_W + " vs " + (BTN + 8));
ok("가로 막대 = 버튼 + 2", BAR_H === BTN + 2, BAR_H + " vs " + (BTN + 2));
ok("폰 막대 한 줄 = 버튼", BAR_H_M === BTN, BAR_H_M + " vs " + BTN);
ok("아이콘 ÷ 버튼 이 0.60~0.64 (A~E 안 전부 이 안에 듭니다)",
  ICO / BTN >= 0.6 && ICO / BTN <= 0.64, (ICO / BTN).toFixed(3));

/* 아이콘 획 — 스프라이트 viewBox 가 0 0 16 16 이라 화면 획 = 값 × (아이콘 ÷ 16) */
const screenStroke = STROKE * (ICO / 16);
ok("화면에 찍히는 아이콘 획이 1.5~2.1px (얇아서 안 보이거나 뭉개지지 않는 구간)",
  screenStroke >= 1.5 && screenStroke <= 2.1, screenStroke.toFixed(2) + "px");

/* 되돌릴 근거가 파일에 남아 있는가 — 이게 없으면 다음 사람이 다시 헤맵니다 */
ok("주석에 A~E 안 이름이 다 남아 있다", ["A안", "B안", "C안", "D안", "E안"].every((n) => CSS_RAW.indexOf(n) !== -1));
[
  ["A안", "16px"], ["B안", "22px"], ["C안", "28px"], ["D안", "32px"], ["E안", "36px"]
].forEach(function (p) {
  ok("주석의 갈아끼우기 상자에 " + p[0] + " 아이콘 " + p[1] + " 이 남아 있다",
    CSS_RAW.indexOf("--tlc-ico:" + p[1]) !== -1);
});
ok("주석에 업비트 실측(막대 52 / 아이콘 28)이 남아 있다",
  /업비트[\s\S]{0,600}52/.test(CSS_RAW) && /업비트[\s\S]{0,600}28/.test(CSS_RAW));
ok("주석에 바이낸스 실측이 남아 있다", /바이낸스[\s\S]{0,600}52px/.test(CSS_RAW));
ok("A안이 왜 퇴짜맞았는지(기준의 57%) 근거가 남아 있다", /57%/.test(CSS_RAW));
ok("어느 안이 확정인지 적혀 있다 (2026-08-25 C안 → 2026-08-26 데스크톱 E / 폰 C)",
  /2026-08-25 대표 확정: C안/.test(CSS_RAW) && /2026-08-26 대표 확정/.test(CSS_RAW));
ok("폰만 C안으로 남긴 이유가 숫자로 적혀 있다 (다음 사람이 무심코 합치지 않게)",
  /폰을 같이 안 올린 이유/.test(CSS_RAW) && /330px/.test(CSS_RAW));
ok("되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(CSS_RAW));

/* 크기 변수가 여러 곳에 선언되면 뒤엣것이 앞을 덮어 수정이 안 먹힙니다.
   (이 프로젝트에서 "같은 CSS 규칙이 두 벌" 이 이미 세 번 났습니다.)

   2026-08-26 — 옛 기준은 "선언이 딱 한 곳" 이었습니다. 폰을 일부러 다르게
   두면서 이 기준을 그냥 없애면, 앞으로 실수로 생기는 중복도 같이 놓칩니다.
   없애지 않고 좁혔습니다:

     기본(데스크톱) 범위에 한 번  +  @media (max-width:767px) 안에 최대 한 번

   즉 "의도한 폰 분리" 딱 한 자리만 열어 주고, 같은 범위 안에서 두 번 적히는
   진짜 중복(세 번째 선언)은 여전히 실패합니다. 미디어쿼리가 늘어나도 이 검사가
   먼저 걸리므로 아무 데나 덧붙일 수 없습니다. */
["tlc-ico", "tlc-btn", "tlc-rail-w", "tlc-stroke", "tlc-bar-h-m", "tlc-bar-h"].forEach(function (n) {
  const re = () => new RegExp("--" + n + "\\s*:", "g");
  const all = (CSS.match(re()) || []).length;
  const inDesk = (DESK_CSS.match(re()) || []).length;
  const inPhone = (PHONE_CSS.match(re()) || []).length;
  ok("--" + n + " 가 기본 범위에 딱 한 번 적혀 있다", inDesk === 1, "지금 " + inDesk + "번");
  ok("--" + n + " 가 폰 미디어쿼리 안에 많아야 한 번 적혀 있다", inPhone <= 1, "지금 " + inPhone + "번");
  ok("--" + n + " 선언이 이 두 곳 말고 다른 데는 없다", all === inDesk + inPhone,
    "전체 " + all + " / 기본 " + inDesk + " + 폰 " + inPhone);
});
/* 폰 미디어쿼리는 하나뿐이어야 합니다 — 두 개면 위 계산이 무의미해집니다 */
{
  const c = (CSS.match(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/g) || []).length;
  ok("@media (max-width:767px) 가 파일에 딱 하나다 (여러 개면 어느 게 이기는지 알 수 없습니다)",
    c === 1, "지금 " + c + "개");
}

/* =============================================================================
 * 2) 폰에서 도구가 숨지 않는다
 * -------------------------------------------------------------------------- */
console.log("\n[2] 폰(<=767) — 감추지 않고 접는다");

/** 중괄호를 세어 블록 하나를 통째로 잘라냅니다 */
function block(text, startIdx) {
  const open = text.indexOf("{", startIdx);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}") {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return "";
}
/** 블록 안에서 선택자 하나의 본문을 꺼냅니다 */
function rule(scope, selector) {
  const re = new RegExp("(^|[},])\\s*" + selector.replace(/[.[\]="]/g, "\\$&") + "\\s*\\{");
  const m = scope.match(re);
  if (!m) return null;
  return block(scope, m.index + m[0].length - 1);
}

const mIdx = CSS.search(/@media\s*\(\s*max-width\s*:\s*767px\s*\)/);
ok("@media (max-width:767px) 구간이 있다", mIdx !== -1);
const MOBILE = mIdx === -1 ? "" : block(CSS, mIdx);
const mRail = rule(MOBILE, ".tlc-rail");
const mBar = rule(MOBILE, ".tlc-toolbar");
/** 실패했을 때 사람이 한 줄로 읽을 수 있게 줄바꿈을 접습니다 */
const flat = (s) => (s || "(규칙 없음)").replace(/\s+/g, " ").trim();

ok("폰 .tlc-rail 규칙이 있다", !!mRail);
ok("폰 .tlc-rail 이 flex-wrap:wrap 이다 (넘치면 다음 줄로 접습니다)",
  !!mRail && /flex-wrap\s*:\s*wrap/.test(mRail), flat(mRail));
ok("폰 .tlc-rail 이 가로줄로 눕는다 (flex-direction:row)",
  !!mRail && /flex-direction\s*:\s*row/.test(mRail));
ok("폰 .tlc-rail 에 overflow:hidden 이 없다 (숨으면 도구가 사라진 것처럼 보입니다)",
  !!mRail && !/overflow(-[xy])?\s*:\s*hidden/.test(mRail), flat(mRail));
ok("폰 .tlc-rail 에 overflow:auto/scroll 이 없다 — 옆으로 미는 방식으로 되돌아가면 도구 3.5칸이 숨습니다",
  !!mRail && !/overflow(-[xy])?\s*:\s*(auto|scroll)/.test(mRail), flat(mRail));
ok("폰 .tlc-rail 의 overflow 는 visible 로 못 박혀 있다 (데스크톱의 overflow-y:auto 를 덮어야 합니다)",
  !!mRail && /overflow\s*:\s*visible/.test(mRail), flat(mRail));
ok("폰 기본은 접힘 (display:none)", !!mRail && /display\s*:\s*none/.test(mRail));
ok("펴는 것은 data-rail=\"on\" 하나뿐이다",
  /\.tlc-body\[data-rail="on"\]\s*>\s*\.tlc-rail\s*\{[^}]*display\s*:\s*flex/.test(MOBILE));
ok("접는 것은 data-rail=\"off\" 하나뿐이다 (768 이상)",
  /\.tlc-body\[data-rail="off"\]\s*>\s*\.tlc-rail\s*\{[^}]*display\s*:\s*none/.test(CSS));

ok("폰 .tlc-toolbar 도 flex-wrap:wrap 이다 (D·E 안으로 키워도 접히도록)",
  !!mBar && /flex-wrap\s*:\s*wrap/.test(mBar), flat(mBar));
ok("폰 .tlc-toolbar 도 overflow:visible 이다 (데스크톱의 overflow-x:auto 를 덮습니다)",
  !!mBar && /overflow\s*:\s*visible/.test(mBar), flat(mBar));

/* 왜 접어야만 하는지 + 왜 폰만 C안인지를 숫자로 못 박습니다.
   ★ 여기는 반드시 "폰 값(M_BTN)" 으로 잽니다. 데스크톱 값(BTN)으로 재면
     2026-08-26 처럼 폰/데스크톱이 갈린 뒤로는 틀린 답이 나옵니다. */
{
  const 세로도구수 = 11;
  const 가로도구수 = 7;
  const 폰차트칸 = 330; /* 2026-08-25 360 화면 localhost 실측 — .chart-wrap 330px */
  const 한줄칸수 = Math.floor(폰차트칸 / M_BTN);
  const 필요폭 = 세로도구수 * M_BTN;

  ok("세로 도구 11칸이 360 화면 한 줄에 물리적으로 안 들어간다 → 접기가 필수다",
    필요폭 > 폰차트칸, 필요폭 + "px 필요 / " + 폰차트칸 + "px 있음");
  ok("두 줄이면 다 보인다 (한 줄에 최소 6칸)", 한줄칸수 >= 6,
    "한 줄 " + 한줄칸수 + "칸 (폰 버튼 " + M_BTN + "px)");

  /* 늘 보이는 가로 막대가 두 줄이 되면, 세로 막대를 펴지도 않은 회원까지
     손해를 봅니다. 폰을 E안으로 올리면(60px) 5칸뿐이라 7개가 2줄이 됩니다. */
  ok("늘 보이는 가로 막대 7개가 360 에서 한 줄에 들어간다 (접힘으로 못 가리는 자리)",
    가로도구수 <= 한줄칸수, 가로도구수 + "개 / 한 줄 " + 한줄칸수 + "칸");
  ok("세로 막대가 세 줄이 되지 않는다", Math.ceil(세로도구수 / 한줄칸수) <= 2,
    Math.ceil(세로도구수 / 한줄칸수) + "줄");
  ok("마지막 줄에 버튼이 둘 이상 남는다 (한 개만 남으면 깨져 보입니다)",
    세로도구수 - (Math.ceil(세로도구수 / 한줄칸수) - 1) * 한줄칸수 >= 2,
    "마지막 줄 " + (세로도구수 - (Math.ceil(세로도구수 / 한줄칸수) - 1) * 한줄칸수) + "개");
}

/* CSS 기준(767) 과 JS 기준(768) 이 어긋나면 폰에서 막대가 두 번 접히거나 안 접힙니다 */
{
  const m = DRAW_CODE.match(/RAIL_AUTO_WIDTH\s*=\s*(\d+)/);
  ok("js 의 RAIL_AUTO_WIDTH 가 CSS 의 max-width:767px 과 짝이 맞는다 (768)",
    !!m && Number(m[1]) === 768, m ? m[1] : "없음");
}

/* =============================================================================
 * 3) 준비중 도구 — 표시와 실제가 같아야 한다 (실제로 그려진 버튼을 봅니다)
 * -------------------------------------------------------------------------- */
console.log("\n[3] 준비중 — 화면에 그려진 버튼으로 확인");

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"chart-wrap\"><div id=\"chart_container\"></div></div></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = opts.width || 1920;
  win.fetch = undefined; /* 스프라이트는 파일 경로로 물러섭니다 */
  win.setInterval = function () { return 0; }; /* 차트를 기다리는 폴링은 필요 없습니다 */
  win.clearInterval = function () {};

  if (opts.realStorage) {
    win.eval(STORAGE_SRC);
  } else {
    const store = opts.seed || {};
    win.App = win.App || {};
    win.App.Storage = {
      save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); return true; },
      load(k) { return store[k] ? JSON.parse(JSON.stringify(store[k])) : null; }
    };
    win.__store = store;
  }
  win.App = win.App || {};
  win.App.Config = {
    getActiveSymbol: () => win.__sym || "BTCUSDT",
    getActiveInterval: () => win.__iv || "1m"
  };
  win.eval(DRAW_SRC);
  return { dom, win, M: win.App.ChartDrawings };
}

const A = boot({ width: 1920 });
const railBtns = Array.from(A.win.document.querySelectorAll(".tlc-rail .tlc-btn"));
const barBtns = Array.from(A.win.document.querySelectorAll(".tlc-toolbar .tlc-btn"));

ok("세로 막대 버튼 11개가 실제로 그려진다", railBtns.length === 11, "지금 " + railBtns.length + "개");
ok("가로 막대 버튼 7개가 실제로 그려진다", barBtns.length === 7, "지금 " + barBtns.length + "개");
ok("차트 칸이 .tlc-body 안으로 들어갔다",
  !!A.win.document.querySelector(".tlc-body > .chart-wrap"));

const ALL = railBtns.concat(barBtns);
const soon = ALL.filter((b) => b.hasAttribute("data-soon"));
const dis = ALL.filter((b) => b.hasAttribute("disabled"));
const titled = ALL.filter((b) => (b.getAttribute("title") || "").indexOf("준비중") !== -1);

/* ── 준비중 개수 (2026-08-26 선긋기 2차) ───────────────────────────────────────
 * 처음 셀 때는 세로 7 / 가로 6 = 13 개였습니다. 2차에서 4개를 열었습니다.
 *   세로 : 피보나치 되돌림(fib) · 자(ruler)          7 -> 5
 *   가로 : 전체화면(fullscreen) · 카메라(camera)     6 -> 4
 * 3차(2026-08-27) 에서 하나 더 열었습니다.
 *   가로 : fx 지표(fx)                               4 -> 3
 *   지표 계산·그리기가 이미 다 되어 있는데 켜는 자리가 없어서 잠겨 있던 것입니다.
 * 4차(2026-08-27) — 세로 : 돋보기(zoom)              5 -> 4
 * 5차(2026-08-28) — 세로 : 브러시(brush)             4 -> 3
 *   끌어서 자유롭게 긋습니다. 남은 준비중은 세로 파동·여러선·표정 셋입니다.
 *   ⚠ 숫자를 낮춘 것이 아니라 "지금 잠겨 있는 개수" 로 맞춘 것입니다.
 *     아래 클릭 검사도 brush -> wave 로 옮겼습니다(brush 는 이제 열립니다).
 * 왜 이 넷인가 — 바이낸스 선물 차트에 실제로 있는 도구이고, 회원이 자주
 * 쓰는 순서로 골랐습니다(차트를 크게 보기 / 자랑용 캡처 / 되돌림·목표가 재기).
 * 이 숫자를 다시 줄이려면 무엇을 왜 열었는지 여기에 날짜와 함께 적으세요.
 * 검사를 지우지 마세요 — "준비중이라 써 놓고 실제로 열리는" 모순을 막는 그물입니다. */
ok("세로 막대 준비중이 3개다 (2026-08-28 브러시를 열어 4 -> 3 / 남은 것 파동·여러선·표정)",
  railBtns.filter((b) => b.hasAttribute("data-soon")).length === 3,
  "지금 " + railBtns.filter((b) => b.hasAttribute("data-soon")).length + "개");
/* 남은 준비중이 "그 셋" 인지까지 봅니다 — 개수만 세면 엉뚱한 도구가 잠겨도
   숫자만 맞아 통과합니다(예: brush 를 열면서 ruler 를 잠근 경우). 2026-08-28 추가 */
ok("남은 세로 준비중이 파동·여러선·표정 셋 그대로다",
  railBtns.filter((b) => b.hasAttribute("data-soon")).map((b) => b.getAttribute("data-tlc")).sort().join(",")
    === "channel,face,wave",
  railBtns.filter((b) => b.hasAttribute("data-soon")).map((b) => b.getAttribute("data-tlc")).join(","));
ok("가로 막대 준비중이 3개다 (2026-08-27 fx 를 열어 4 -> 3)",
  barBtns.filter((b) => b.hasAttribute("data-soon")).length === 3,
  "지금 " + barBtns.filter((b) => b.hasAttribute("data-soon")).length + "개");

{
  const bad = soon.filter((b) => !b.hasAttribute("disabled")).map((b) => b.getAttribute("data-tlc"));
  ok("준비중 표시(data-soon)가 붙은 버튼은 전부 실제로 잠겨 있다(disabled)", bad.length === 0, bad.join(","));
}
{
  const bad = soon.filter((b) => (b.getAttribute("title") || "").indexOf("준비중") === -1)
    .map((b) => b.getAttribute("data-tlc"));
  ok("준비중 버튼은 title 에 '준비중' 이라고 적혀 있다 (마우스를 올리면 읽힙니다)", bad.length === 0, bad.join(","));
}
{
  const bad = soon.filter((b) => (b.getAttribute("aria-label") || "").indexOf("준비중") === -1)
    .map((b) => b.getAttribute("data-tlc"));
  ok("준비중 버튼은 읽어주는 이름(aria-label)에도 '준비중' 이 들어간다", bad.length === 0, bad.join(","));
}
{
  const bad = dis.filter((b) => !b.hasAttribute("data-soon")).map((b) => b.getAttribute("data-tlc"));
  ok("거꾸로 — 잠겨 있는데 준비중 표시가 없는 버튼이 없다 (회원이 왜 안 눌리는지 모릅니다)",
    bad.length === 0, bad.join(","));
}
{
  const bad = titled.filter((b) => !b.hasAttribute("disabled")).map((b) => b.getAttribute("data-tlc"));
  ok("거꾸로 — '준비중' 이라 써 놓고 실제로 열리는 버튼이 없다 (자유게시판에서 났던 그 모순)",
    bad.length === 0, bad.join(","));
}
{
  /* 2026-08-26 — 처음에는 "준비중 버튼에 aria-pressed 를 아예 달지 않는다" 로 썼다가
     실제 화면을 재 보니 세로 막대 7개에 aria-pressed="false" 가 붙어 있었습니다.
     이건 모순이 아닙니다("꺼짐"이라 말하고 실제로도 꺼져 있음). 사이트를 고치지 않고
     검사 쪽을 진짜 규칙으로 좁혔습니다 — 준비중인데 "켜짐"으로 보이면 안 된다. */
  const bad = soon.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("data-tlc"));
  ok("준비중 버튼이 켜진 것처럼(aria-pressed=true) 보이지 않는다", bad.length === 0, bad.join(","));
}

/* 되는 도구는 잠기면 안 됩니다 (2026-08-27 zoom · 2026-08-28 brush 추가) */
["cursor", "trend", "hline", "text", "fib", "ruler", "zoom", "brush"].forEach(function (k) {
  const b = railBtns.filter((x) => x.getAttribute("data-tlc") === k)[0];
  ok("되는 도구 " + k + " 는 잠겨 있지 않다",
    !!b && !b.hasAttribute("disabled") && !b.hasAttribute("data-soon"));
});
["expand", "fullscreen", "camera"].forEach(function (k) {
  const b = barBtns.filter((x) => x.getAttribute("data-tlc") === k)[0];
  ok("가로 막대 " + k + " 버튼은 잠겨 있지 않다", !!b && !b.hasAttribute("disabled"));
});

/* 2026-08-26 — 전체화면은 "덮어쓰는" 동작이라 되돌아오는지까지 봅니다.
   돌아오지 못하면 회원이 차트에 갇힙니다. */
{
  const panel = A.win.document.querySelector(".chart-panel");
  A.M.toggleFullscreen();
  ok("전체화면을 켜면 차트 칸에 표가 붙는다", panel.getAttribute("data-tlc-full") === "1");
  ok("전체화면 버튼이 켜진 것으로 보인다",
    barBtns.filter((x) => x.getAttribute("data-tlc") === "fullscreen")[0].getAttribute("aria-pressed") === "true");
  A.M.toggleFullscreen();
  ok("한 번 더 누르면 원래대로 돌아온다 (회원이 갇히지 않는다)", !panel.hasAttribute("data-tlc-full"));
  ok("전체화면이 style.css 를 고치지 않고 우리 style 태그 안에서만 걸린다",
    A.win.document.getElementById("chart-drawings-style").textContent.indexOf("chart-panel[data-tlc-full") !== -1);
}

/* 실제로 눌러 봅니다 */
function click(btn) {
  btn.dispatchEvent(new A.win.MouseEvent("click", { bubbles: true, cancelable: true }));
}
{
  /* 2026-08-28 — 여기서 누르던 brush 가 열렸습니다. 아직 안 연 파동(wave)으로
     옮겼습니다. 검사는 그대로입니다 — 잠긴 버튼은 눌러도 아무 일이 없어야 합니다. */
  A.M.setTool("cursor");
  const wave = railBtns.filter((x) => x.getAttribute("data-tlc") === "wave")[0];
  click(wave);
  ok("준비중 버튼(파동)을 실제로 눌러도 아무 일이 없다", A.M.getTool() === "cursor", A.M.getTool());
  /* 반대로 브러시는 눌러서 켜져야 합니다 (열어 놓고 안 켜지면 조용한 고장) */
  const brush = railBtns.filter((x) => x.getAttribute("data-tlc") === "brush")[0];
  click(brush);
  ok("브러시 버튼을 누르면 브러시가 켜진다 (2026-08-28)", A.M.getTool() === "brush", A.M.getTool());
  A.M.setTool("cursor");
}
{
  const hline = railBtns.filter((x) => x.getAttribute("data-tlc") === "hline")[0];
  click(hline);
  ok("되는 버튼을 누르면 그 도구가 켜진다", A.M.getTool() === "hline", A.M.getTool());
  ok("켜진 버튼에만 골드 표시가 붙는다(aria-pressed=true 가 하나)",
    railBtns.filter((b) => b.getAttribute("aria-pressed") === "true").length === 1);
  A.M.setTool("cursor");
}

/* 폰에서는 접힌 채로 시작합니다 */
{
  const P = boot({ width: 360 });
  const body = P.win.document.querySelector(".tlc-body");
  ok("폰(360)에서는 세로 막대가 접힌 채로 시작한다", body.getAttribute("data-rail") === "off",
    body.getAttribute("data-rail"));
  ok("접혀 있어도 버튼 11개는 그대로 남아 있다 (지운 게 아니라 접은 것)",
    P.win.document.querySelectorAll(".tlc-rail .tlc-btn").length === 11);
  P.M.toggleRail();
  ok("폰에서 접기/펴기를 누르면 펴진다", body.getAttribute("data-rail") === "on");
  P.win.close();
}
{
  const D = boot({ width: 1440 });
  const body = D.win.document.querySelector(".tlc-body");
  ok("노트북(1440)에서는 펴진 채로 시작한다", body.getAttribute("data-rail") === "on");
  D.win.close();
}

/* =============================================================================
 * 4) 선긋기 저장
 * -------------------------------------------------------------------------- */
console.log("\n[4] 저장 — 회원이 그은 선이 사라지지 않게");

ok("App.Storage 접두어가 btc_sim_v2_ 다", /KEY_PREFIX\s*=\s*"btc_sim_v2_"/.test(STORAGE_SRC));
ok("선긋기 저장 키 이름이 chart-drawings 다", A.M.STORAGE_KEY === "chart-drawings", A.M.STORAGE_KEY);

{
  /* 진짜 localStorage 에 어떤 이름으로 찍히는지까지 봅니다 */
  const R = boot({ width: 1920, realStorage: true });
  R.M.toggleRail(); /* 저장을 일으키는 가장 가벼운 동작 */
  const keys = Object.keys(R.win.localStorage).filter((k) => k.indexOf("chart-drawings") !== -1);
  ok("실제로 찍히는 키가 btc_sim_v2_chart-drawings 다 (바뀌면 그은 선이 통째로 사라집니다)",
    keys.length === 1 && keys[0] === "btc_sim_v2_chart-drawings", keys.join(","));
  R.win.close();
}

{
  /* 봉 간격을 바꿔도 수평선은 남고, 추세선·텍스트는 그 봉에서만 보여야 합니다 */
  const seed = {
    "chart-drawings": {
      v: 1,
      ui: {},
      bySymbol: {
        BTCUSDT: {
          hlines: [{ id: "h1", price: 100000 }],
          byInterval: {
            "1m": [{ id: "s1", kind: "trend" }, { id: "s2", kind: "text" }],
            "1d": []
          }
        },
        ETHUSDT: { hlines: [], byInterval: {} }
      }
    }
  };
  const S = boot({ width: 1920, seed: seed });
  const g = () => S.M.getDrawings();

  ok("저장해 둔 수평선 1개가 되살아난다", g().hlines.length === 1, String(g().hlines.length));
  ok("저장해 둔 추세선·텍스트 2개가 되살아난다", g().shapes.length === 2, String(g().shapes.length));

  S.win.__iv = "1d";
  ok("봉 간격을 1m → 1d 로 바꿔도 수평선은 남는다 (가격 하나만 쓰므로 봉과 무관)",
    g().hlines.length === 1, String(g().hlines.length));
  ok("봉 간격을 바꾸면 추세선·텍스트는 안 보인다 (1분봉 추세선을 1일봉에 올리면 점으로 뭉갭니다)",
    g().shapes.length === 0, String(g().shapes.length));

  S.win.__iv = "1m";
  ok("원래 봉으로 돌아오면 추세선·텍스트가 다시 보인다", g().shapes.length === 2);

  S.win.__sym = "ETHUSDT";
  ok("종목이 바뀌면 다른 종목의 수평선은 안 보인다", g().hlines.length === 0);
  S.win.__sym = "BTCUSDT";
  ok("종목을 되돌리면 수평선이 그대로 있다", g().hlines.length === 1);
  S.win.close();
}

ok("수평선은 봉 간격을 아예 보지 않는 자리에 저장한다 (코드에 그 판단이 남아 있다)",
  /수평선[\s\S]{0,120}봉 간격/.test(DRAW_SRC));
ok("추세선·텍스트를 왜 봉별로 나눴는지 근거가 남아 있다",
  /1분봉[\s\S]{0,120}1일봉/.test(DRAW_SRC));

/* =============================================================================
 * 5) js/chart.js 무수정 우회가 살아 있는가
 * -------------------------------------------------------------------------- */
console.log("\n[5] chart.js 무수정 우회");

const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
ok("js/chart.js 를 한 글자도 건드리지 않았다", md5("chart.js") === "02ddcb000d577131f797143d08c09123", md5("chart.js"));
ok("chart.js 안에 ChartDrawings 라는 글자가 없다", CHART_JS.indexOf("ChartDrawings") === -1);
ok("chart.js 안에 ChartIndicators 라는 글자가 없다", CHART_JS.indexOf("ChartIndicators") === -1);
ok("chart.js 안에 ChartPositionLines 라는 글자가 없다", CHART_JS.indexOf("ChartPositionLines") === -1);

/* 2026-08-26 — 3단계(RSI·MACD)가 들어오면서 chart-oscillators.js 가 늘었습니다.
   같은 우회 방식(App.ChartFont.getCharts)을 쓰므로 같은 잣대로 함께 봉인합니다.
   그래서 이 파일의 통과 건수가 112 -> 114 로 늘어나는 것이 정상입니다. */
["chart-position-lines", "chart-indicators", "chart-drawings", "chart-oscillators"].forEach(function (f) {
  const src = read("js/" + f + ".js");
  const code = stripComments(src);
  ok(f + ".js 가 App.ChartFont.getCharts() 로 차트를 가져온다", code.indexOf("App.ChartFont.getCharts()") !== -1);
  ok(f + ".js 가 createChart 를 직접 부르지 않는다 (부르면 차트가 두 개 생깁니다)",
    code.indexOf("createChart") === -1);
});

A.win.close();

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) process.exit(1);
process.exit(0);
