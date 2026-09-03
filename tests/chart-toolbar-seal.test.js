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
 *      ★2026-09-03 21차 — 데스크톱 값을 E안 -> F안(버튼 38 / 아이콘 28)으로
 *        갱신했습니다. 근거를 남깁니다(기준을 슬쩍 낮춘 것이 아닙니다):
 *
 *        (가) 대표 지시 원문 (2026-09-03) — ★"줄인다 — 트레이딩뷰처럼"★
 *             위 (1) 의 2026-08-26 "더 키워" 를 ★대표가 직접 뒤집으셨습니다.★
 *             PM 이 "8월 26일에 두 번 키우라고 하신 값인데 줄여도 되겠습니까"
 *             를 물어 받은 답입니다. 그러니 이 파일의 데스크톱 숫자를 E안으로
 *             되돌리는 것은 대표 지시를 되돌리는 일입니다 — 다시 물어보세요.
 *
 *        (나) 줄이지 않으면 못 넣는 것이 있었습니다 (1440 실측, localhost)
 *             가로 막대 784px 중 E안이 이미 720px 을 쓰고 남는 칸 87px.
 *             되돌리기/다시하기를 넣으려면 60+60+11 = 131px 이 필요해
 *             ★44px 이 모자랐습니다.★ F안이면 38+38+11 = 87px 로 딱 맞습니다.
 *             세로 막대도 E안 14개 = 989px 인데 3개를 더하면 1169px 로
 *             차트 칸(1150px)을 넘습니다. F안이면 17개 = 688px 입니다.
 *
 *        (다) 아이콘은 28px 로 남겼습니다 — 위 (1) 의 "작다" 하한을 그대로 지킵니다.
 *             28px 은 업비트·바이낸스·트레이딩뷰 실측값이고 16px 의 175% 입니다.
 *             버튼만 60 -> 38 이고 아이콘은 36 -> 28 입니다.
 *             ★.tlc-txt 글자 15px 은 한 픽셀도 안 줄였습니다.★
 *
 *        (라) ★폰 44px 하한은 그대로입니다.★ 아래 M_BTN >= 44 검사를 살려 뒀고,
 *             오히려 "폰이 데스크톱보다 작아지면 안 된다" 를 새로 못 박았습니다.
 *             데스크톱을 마우스에 맞춰 줄이는 흐름에 폰이 딸려 내려가는 것이
 *             앞으로 가장 있을 법한 사고라서, 그 방향을 막는 검사를 넣었습니다.
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

const REPO = process.env.REPO || path.join(__dirname, "..");
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
/* ★ 데스크톱 버튼 하한은 2026-09-03 에 44 -> 34 로 갱신했습니다 (21차).
     낮춘 것이 아니라 "무엇을 지키는 하한인지" 를 나눈 것입니다 —
       폰(<=767)   44px : ★손가락★ 규격(애플 권고 44pt). 그대로 둡니다(아래 M_BTN 검사)
       데스크톱     34px : ★마우스★ 규격. 트레이딩뷰·업비트·바이낸스 실측이 38px 이라
                          그보다 더 줄면 실측 밑으로 내려가는 것이라 막습니다
     44 를 데스크톱에도 걸어 두면 "손가락 하한" 이라는 이름과 실제(마우스로 누르는
     화면)가 어긋나고, 대표 지시("줄인다 — 트레이딩뷰처럼")를 실행할 수 없습니다. */
ok(
  "데스크톱 버튼 한 칸이 34px 아래로 내려가지 않는다 (마우스로 누르는 칸. 트레이딩뷰 실측 38px)",
  BTN >= 34,
  "지금 " + BTN + "px"
);
ok("세로 막대 폭이 46px 아래로 내려가지 않는다 (버튼 38 + 8. 트레이딩뷰 실측 막대는 52px 이지만 그건 버튼이 가로로 긴 52x38 이고 우리 버튼은 정사각입니다)",
  RAIL_W >= 46, "지금 " + RAIL_W + "px");
ok("가로 막대 높이가 40px 아래로 내려가지 않는다 (트레이딩뷰 줄 높이 38px + 1px 선 두 줄)",
  BAR_H >= 40, "지금 " + BAR_H + "px");
ok("데스크톱 --tlc-bar-h-m 이 데스크톱 버튼과 같다 (폰 값은 아래 M_BAR_H_M 이 따로 봅니다)",
  BAR_H_M === BTN, "지금 " + BAR_H_M + "px");

/* 2026-08-26 대표 "더 키워" 두 번째 → 데스크톱 E안, 폰은 C안 유지.
   2026-09-03 대표 "줄인다 — 트레이딩뷰처럼" → 데스크톱 F안, 폰은 C안 그대로.
   옛 기준 "전 폭 공통 C안" → "데스크톱 값 + 폰 값" 두 벌.
   한 벌만 보면 한쪽이 조용히 되돌아가도 못 잡습니다. */
ok("데스크톱(>=768) 값이 확정된 F안 그대로다 (40 / 46 / 38 / 28 / 1 / 38)",
  BAR_H === 40 && RAIL_W === 46 && BTN === 38 && ICO === 28 && STROKE === 1 && BAR_H_M === 38,
  [BAR_H, RAIL_W, BTN, ICO, STROKE, BAR_H_M].join(" / "));
ok("폰(<=767) 값이 확정된 C안 그대로다 (버튼 44 / 아이콘 28 / 획 1 / 한 줄 44)",
  M_BTN === 44 && M_ICO === 28 && M_STROKE === 1 && M_BAR_H_M === 44,
  [M_BTN, M_ICO, M_STROKE, M_BAR_H_M].join(" / "));
/* ★ 2026-09-03 21차 — 방향이 뒤집혔습니다.
   E안 때는 데스크톱이 더 컸고(60 > 44), F안에서는 폰이 더 큽니다(44 > 38).
   앞으로 가장 있을 법한 사고는 "데스크톱을 줄이는 김에 폰도 같이 내리는 것"
   입니다. 그러면 폰이 손가락 하한 44px 밑으로 갑니다. 그 방향을 막습니다. */
ok("★폰 버튼이 데스크톱 버튼보다 작아지지 않는다★ (폰은 손가락, 데스크톱은 마우스)",
  M_BTN >= BTN, M_BTN + " vs " + BTN);
ok("아이콘은 폰·데스크톱이 같다 (28px — 업비트·바이낸스·트레이딩뷰 실측)",
  M_ICO === ICO, M_ICO + " vs " + ICO);
ok("폰 아이콘이 업비트·바이낸스 실측 28px 아래로는 안 내려간다", M_ICO >= 28, "지금 " + M_ICO + "px");
ok("★폰 버튼이 손가락 권고 44px 아래로는 안 내려간다★ (이 검사는 어떤 경우에도 지웁니다 X)",
  M_BTN >= 44, "지금 " + M_BTN + "px");
ok("폰도 아이콘 / 버튼 이 0.60~0.75 다 (안을 섞으면 아이콘이 버튼 밖으로 나갑니다)",
  M_ICO / M_BTN >= 0.6 && M_ICO / M_BTN <= 0.75, (M_ICO / M_BTN).toFixed(3));
ok("폰 막대 한 줄 = 폰 버튼", M_BAR_H_M === M_BTN, M_BAR_H_M + " vs " + M_BTN);
{
  const ss = M_STROKE * (M_ICO / 16);
  ok("폰 아이콘 화면 획도 1.5~2.1px 다", ss >= 1.5 && ss <= 2.1, ss.toFixed(2) + "px");
}

/* 값끼리의 관계 — 새 안(D·E)으로 갈아끼워도 이 관계는 지켜야 합니다 */
ok("세로 막대 = 버튼 + 8", RAIL_W === BTN + 8, RAIL_W + " vs " + (BTN + 8));
ok("가로 막대 = 버튼 + 2", BAR_H === BTN + 2, BAR_H + " vs " + (BTN + 2));
ok("폰 막대 한 줄 = 버튼", BAR_H_M === BTN, BAR_H_M + " vs " + BTN);
/* 2026-09-03 — 위끝을 0.64 -> 0.75 로 넓혔습니다.
   A~E 안은 전부 0.60~0.64 였지만, F안은 트레이딩뷰 실측(버튼 38 / 아이콘 28)을
   그대로 쓴 0.74 입니다. 실측을 못 담는 범위라 실측 쪽에 맞춰 넓혔습니다.
   아래끝 0.60 은 그대로입니다 — 아이콘이 버튼 안에서 너무 작아지는 것은 여전히 막습니다. */
ok("아이콘 ÷ 버튼 이 0.60~0.75 (A~F 안 전부 이 안에 듭니다. 0.74 는 트레이딩뷰 실측)",
  ICO / BTN >= 0.6 && ICO / BTN <= 0.75, (ICO / BTN).toFixed(3));

/* 아이콘 획 — 스프라이트 viewBox 가 0 0 16 16 이라 화면 획 = 값 × (아이콘 ÷ 16) */
const screenStroke = STROKE * (ICO / 16);
ok("화면에 찍히는 아이콘 획이 1.5~2.1px (얇아서 안 보이거나 뭉개지지 않는 구간)",
  screenStroke >= 1.5 && screenStroke <= 2.1, screenStroke.toFixed(2) + "px");

/* 되돌릴 근거가 파일에 남아 있는가 — 이게 없으면 다음 사람이 다시 헤맵니다 */
ok("주석에 A~F 안 이름이 다 남아 있다",
  ["A안", "B안", "C안", "D안", "E안", "F안"].every((n) => CSS_RAW.indexOf(n) !== -1));
[
  ["A안", "16px"], ["B안", "22px"], ["C안", "28px"], ["D안", "32px"], ["E안", "36px"], ["F안", "28px"]
].forEach(function (p) {
  ok("주석의 갈아끼우기 상자에 " + p[0] + " 아이콘 " + p[1] + " 이 남아 있다",
    CSS_RAW.indexOf("--tlc-ico:" + p[1]) !== -1);
});
ok("주석에 업비트 실측(막대 52 / 아이콘 28)이 남아 있다",
  /업비트[\s\S]{0,600}52/.test(CSS_RAW) && /업비트[\s\S]{0,600}28/.test(CSS_RAW));
ok("주석에 바이낸스 실측이 남아 있다", /바이낸스[\s\S]{0,600}52px/.test(CSS_RAW));
ok("A안이 왜 퇴짜맞았는지(기준의 57%) 근거가 남아 있다", /57%/.test(CSS_RAW));
ok("어느 안이 확정인지 적혀 있다 (2026-08-25 C안 → 2026-08-26 E안 → 2026-09-03 F안)",
  /2026-08-25 대표 확정: C안/.test(CSS_RAW) && /2026-08-26 대표 확정/.test(CSS_RAW) &&
  /2026-09-03 대표 확정/.test(CSS_RAW));
/* ★ 2026-09-03 — "대표가 8월 지시를 직접 뒤집으셨다" 는 사실을 CSS 에도 남깁니다.
   이게 없으면 다음 사람이 8월 주석("더 키워" 두 번)만 읽고 "누가 몰래 줄였네"
   로 읽습니다. 지시 원문 한 줄이 그 오해를 막습니다. */
ok("F안으로 줄인 대표 지시 원문이 CSS 주석에 남아 있다",
  /줄인다 — 트레이딩뷰처럼/.test(CSS_RAW), "CSS 주석에서 못 찾음");
ok("8월 '더 키워' 를 대표가 직접 뒤집으셨다는 사실이 적혀 있다",
  /뒤집으셨습니다/.test(CSS_RAW));
ok("폰만 C안으로 남긴 이유가 숫자로 적혀 있다 (다음 사람이 무심코 합치지 않게)",
  /폰을 같이 안 줄인 이유/.test(CSS_RAW) && /330px/.test(CSS_RAW));
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
  /* 2026-09-03 18차 — 수직선·사각형·화살표가 들어와 11 -> 14.
     360 에서 한 줄 7칸이라 딱 두 줄(7 + 7)이고, 마지막 줄에 7개가 남습니다.
     아래 세 검사가 그것을 그대로 다시 계산합니다 — 숫자만 바꾼 것이 아니라
     "세 줄이 되지 않는다 / 마지막 줄에 둘 이상" 이 여전히 참인지 봅니다. */
  /* ★ 2026-09-03 21차 — 가로 단추 수를 7 -> 10 으로 바로잡았습니다.
   *   그중 하나는 이 검사가 ★원래부터 틀렸던 것★ 입니다:
   *   js/chart-replay.js 가 리플레이 단추를 알람 뒤에 꽂기 때문에 화면에는
   *   늘 TOP_TOOLS 7 개 + 1 개 = 8 개가 있었습니다. 그런데 이 검사는 7 로 세서
   *   "360 에서 한 줄에 들어간다" 를 통과시키고 있었습니다.
   *   실측하면 8 x 44 = 352px > 330px 이라 ★2026-09-03 이전에도 이미 두 줄★
   *   이었습니다(360 실측 330x89). 통과하던 것이 사실이 아니었습니다.
   *   (css/chart-toolbar.css 20차 주석이 같은 오류를 먼저 잡아 놨습니다)
   *   그래서 여기도 "화면에 실제로 그려지는 수" 로 고쳤습니다. */
  /* ★2026-09-03 22차 (기록팀) — 손으로 적은 상수를 없앴습니다.
   *   21차에 7 -> 10 으로 ★숫자만★ 고쳤는데, 감사팀 지적대로 ★그 구조 자체★ 가
   *   오늘 잡힌 버그였습니다. js/chart-replay.js 가 단추를 하나 꽂아 화면엔 8개인데
   *   이 계산은 7 로 세고 있었고, 아무도 몰랐습니다(그래서 "한 줄에 들어간다" 가
   *   통과하고 있었습니다 — 사실이 아니었는데도).
   *   숫자만 고치면 ★단추가 하나 더 늘어나는 날 또 똑같이 조용히 낡습니다.★
   *   → 아래 [3] 이 쓰는 방식 그대로, ★화면에 실제로 그려진 단추를 셉니다.★
   *     리플레이처럼 다른 파일이 꽂는 단추도 같이 태워서 셉니다. */
  const 막대 = 실제단추수();
  const 세로단추 = 막대.rail;
  const 가로단추 = 막대.bar;
  ok("가로 막대 단추 수를 손으로 적지 않고 화면에서 센다 (지금 " + 가로단추 + "개)",
    가로단추 > 0, "한 개도 안 그려졌습니다 — 아래 계산이 전부 헛돕니다");
  ok("세로 막대 단추 수도 화면에서 센다 (지금 " + 세로단추 + "개)",
    세로단추 > 0, "한 개도 안 그려졌습니다");
  {
    /* 세는 창에 ★다른 파일이 꽂는 단추★ 가 빠지면 21차 이전과 똑같아집니다.
       그래서 (가) 탐지된 파일이 실제로 단추를 늘렸는지, (나) 단추를 만드는
       파일 중 탐지에서 새는 것이 없는지 둘 다 봅니다. */
    const 혼자 = boot({ width: 1920 });
    const 혼자바 = 혼자.win.document.querySelectorAll(".tlc-toolbar .tlc-btn").length;
    혼자.win.close();
    ok("막대에 단추를 꽂는 다른 파일을 같이 태웠다 (" + (막대.꽂는파일.join(",") || "없음") +
      " → " + 혼자바 + "개 + " + (가로단추 - 혼자바) + "개)",
      가로단추 >= 혼자바 && (막대.꽂는파일.length === 0 || 가로단추 > 혼자바),
      "탐지는 됐는데 단추가 안 늘었습니다 — DOMContentLoaded 를 안 쏘았거나 그 파일이 안 꽂습니다");
    const 새는파일 = 단추를만드는파일들().filter(
      (f) => f !== "chart-drawings.js" && 막대.꽂는파일.indexOf(f) === -1);
    ok("단추를 만드는 파일이 전부 이 셈에 들어와 있다 (탐지가 눈먼 곳이 없다)",
      새는파일.length === 0,
      "세지 못한 파일: " + 새는파일.join(",") +
      " — 이 파일이 꽂는 단추만큼 아래 계산이 낡습니다. 탐지 조건을 넓히세요");
  }
  const 폰차트칸 = 330; /* 2026-08-25 360 화면 localhost 실측 — .chart-wrap 330px */
  const 한줄칸수 = Math.floor(폰차트칸 / M_BTN);
  const 필요폭 = 세로단추 * M_BTN;
  const 줄수 = (n) => Math.ceil(n / 한줄칸수);
  const 마지막줄 = (n) => n - (줄수(n) - 1) * 한줄칸수;

  ok("세로 막대 17칸이 360 화면 한 줄에 물리적으로 안 들어간다 → 접기가 필수다",
    필요폭 > 폰차트칸, 필요폭 + "px 필요 / " + 폰차트칸 + "px 있음");
  ok("한 줄에 최소 6칸은 들어간다", 한줄칸수 >= 6,
    "한 줄 " + 한줄칸수 + "칸 (폰 버튼 " + M_BTN + "px)");

  /* 늘 보이는 가로 막대가 길어지면, 세로 막대를 펴지도 않은 회원까지 손해입니다.
     360·375 는 예나 지금이나 두 줄입니다(위 ★ 참고). 390 은 8칸이라 8개가
     한 줄이었는데, 되돌리기·다시하기를 넣으면서 10개가 되어 두 줄이 됐습니다.
     그 대가로 폰에 없던 되돌리기가 생겼습니다 — 폰에는 Ctrl+Z 가 없어서
     단추가 없으면 아예 못 쓰던 기능입니다. 두 줄까지는 허용하고,
     ★세 줄이 되는 것은 막습니다★ (그때는 정말로 늘 손해입니다). */
  ok("늘 보이는 가로 막대가 360 에서 두 줄을 넘지 않는다 (접힘으로 못 가리는 자리)",
    줄수(가로단추) <= 2, 가로단추 + "개 / " + 줄수(가로단추) + "줄 / 한 줄 " + 한줄칸수 + "칸");
  /* 21차에 오히려 좋아진 자리 — 전에는 8개라 마지막 줄에 카메라 하나만
     덩그러니 남았습니다(360 실측으로 확인). 10개가 되면서 3개가 됩니다. */
  ok("가로 막대 마지막 줄에 단추가 둘 이상 남는다 (한 개만 남으면 깨져 보입니다)",
    마지막줄(가로단추) >= 2, "마지막 줄 " + 마지막줄(가로단추) + "개");

  /* 세로 막대는 폰에서 ★기본이 접힘★ 입니다. 편 회원에게만 줄이 늘어납니다.
     14개 2줄(89px) -> 17개 3줄(133px). 네 줄이 되면 카드가 너무 길어집니다. */
  ok("세로 막대가 네 줄이 되지 않는다 (폰 기본은 접힘이라 편 회원에게만 보입니다)",
    줄수(세로단추) <= 3, 줄수(세로단추) + "줄");
  ok("세로 막대 마지막 줄에 단추가 둘 이상 남는다 (한 개만 남으면 깨져 보입니다)",
    마지막줄(세로단추) >= 2, "마지막 줄 " + 마지막줄(세로단추) + "개");
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
  /* 막대에 단추를 꽂는 ★다른 파일★ 도 같이 태웁니다 (지금은 js/chart-replay.js).
     그 파일들은 DOMContentLoaded 를 기다리므로 여기서 한 번 쏴 줍니다 —
     안 쏘면 단추가 안 붙어서, 화면에는 있는 단추를 세지 못합니다. */
  (opts.also || []).forEach(function (f) {
    win.eval(read("js/" + f));
  });
  if (opts.also && opts.also.length) {
    win.document.dispatchEvent(new win.Event("DOMContentLoaded", { bubbles: true }));
  }
  return { dom, win, M: win.App.ChartDrawings };
}

/* ── 화면에 ★실제로 그려지는★ 단추 수 (2026-09-03 22차) ──────────────────────
 * 아래 [2] 의 접힘 계산이 쓰던 손으로 적은 상수를 대신합니다.
 * (function 선언이라 위쪽 [2] 에서 불러도 됩니다 — CSS 의 block() 과 같습니다)
 * -------------------------------------------------------------------------- */

/** 도구 막대를 직접 잡아 단추를 꽂는 ★다른★ js 파일 목록 (스스로 찾습니다) */
function 막대에꽂는파일들() {
  return fs
    .readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js" && f !== "chart-drawings.js")
    .filter((f) =>
      /querySelector\(\s*["']\.tlc-toolbar["']\s*\)/.test(stripComments(read("js/" + f))))
    .sort();
}
/** .tlc-btn 을 ★새로 만드는★ js 파일 목록 — 위 탐지가 눈먼 곳을 잡는 그물입니다 */
function 단추를만드는파일들() {
  return fs
    .readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js")
    .filter((f) => /className\s*=\s*["']tlc-btn|class=\\?"tlc-btn/.test(stripComments(read("js/" + f))))
    .sort();
}
/** 실제로 그려진 단추를 세어 돌려줍니다 { rail, bar, 꽂는파일 } */
function 실제단추수() {
  const 꽂는파일 = 막대에꽂는파일들();
  const W = boot({ width: 1920, also: 꽂는파일 });
  const n = {
    rail: W.win.document.querySelectorAll(".tlc-rail .tlc-btn").length,
    bar: W.win.document.querySelectorAll(".tlc-toolbar .tlc-btn").length,
    꽂는파일: 꽂는파일
  };
  W.win.close();
  return n;
}

const A = boot({ width: 1920 });
const railBtns = Array.from(A.win.document.querySelectorAll(".tlc-rail .tlc-btn"));
const barBtns = Array.from(A.win.document.querySelectorAll(".tlc-toolbar .tlc-btn"));

/* ── 2026-09-03 21차 — 숫자가 늘어난 이유 ────────────────────────────────────
 * 세로 14 -> 17 · 가로 7 -> 9. ★기능을 새로 만든 것이 하나도 없습니다.★
 * 이미 있던 것을 막대로 꺼낸 것뿐이라 "지금 무엇이 있는지" 로 맞췄습니다.
 *   가로 +2  되돌리기(undo) · 다시하기(redo)
 *           — Ctrl+Z / Ctrl+Shift+Z 로만 되던 것입니다(13차 2026-09-02).
 *             폰에는 키보드가 없어서 단추가 없으면 아예 못 쓰던 기능입니다.
 *   세로 +3  전체 잠금(lockall) · 전체 숨김(hideall) · 모두 지우기(clearall)
 *           — "그린 것 목록" 안에 숨어 있던 것입니다(16차 2026-09-02).
 * ⚠ 자석(magnet)은 안 넣었습니다 — 코드에 기능 자체가 없습니다(grep 0건).
 *   아이콘만 세워 두면 눌러도 아무 일이 없는 조용한 고장이 됩니다.
 * ⚠ 이 다섯은 data-kind="act" 입니다. 도구(tool)가 아니라 "한 번 일하고 끝나는"
 *   단추라, 아래 "눌러보면 그 도구가 켜진다" 검사에서 일부러 뺍니다.
 * -------------------------------------------------------------------------- */
ok("세로 막대 버튼 17개가 실제로 그려진다 (도구 14 + 손질 3)",
  railBtns.length === 17, "지금 " + railBtns.length + "개");
ok("가로 막대 버튼 9개가 실제로 그려진다 (도구 7 + 되돌리기·다시하기 2)",
  barBtns.length === 9, "지금 " + barBtns.length + "개");
{
  /* 도구와 손질이 섞이지 않았는지 — 섞이면 paintButtons() 가 잠금·숨김의
     켜짐 표시를 매번 꺼 버립니다(21차에 실제로 조심한 자리입니다) */
  const railTool = railBtns.filter((b) => b.getAttribute("data-kind") === "tool").length;
  const railAct = railBtns.filter((b) => b.getAttribute("data-kind") === "act").length;
  const barTop = barBtns.filter((b) => b.getAttribute("data-kind") === "top").length;
  const barAct = barBtns.filter((b) => b.getAttribute("data-kind") === "act").length;
  ok("세로 막대가 도구 14 + 손질 3 으로 나뉘어 있다", railTool === 14 && railAct === 3,
    railTool + " + " + railAct);
  ok("가로 막대가 도구 7 + 손질 2 로 나뉘어 있다", barTop === 7 && barAct === 2,
    barTop + " + " + barAct);
}
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
 *   끌어서 자유롭게 긋습니다.
 *   ⚠ 숫자를 낮춘 것이 아니라 "지금 잠겨 있는 개수" 로 맞춘 것입니다.
 *     아래 클릭 검사도 brush -> wave 로 옮겼습니다(brush 는 이제 열립니다).
 * 6차(2026-08-28) — 세로 : 여러선(channel)             3 -> 2
 *   세 번 톡 해서 만드는 평행 채널입니다. 남은 준비중은 세로 파동·표정 둘입니다.
 *   ⚠ 여기도 기준을 낮춘 것이 아닙니다. js/chart-drawings.js 의 LEFT_TOOLS 를
 *     직접 열어 ready:false 로 남은 것이 wave · face 둘뿐임을 확인하고 맞췄습니다.
 * 7차(2026-08-28) — 가로 : 봉 종류(candletype)         3 -> 2
 *   캔들/라인/바/영역 넷을 고르는 메뉴입니다(js/chart-candle-type.js).
 *   ⚠ 기준을 낮춘 것이 아닙니다. js/chart-drawings.js 의 TOP_TOOLS 를 직접 열어
 *     ready:false 로 남은 것이 alert · hex 둘뿐임을 확인하고 맞췄습니다.
 *   남은 가로 준비중은 알람(alert) · 육각형(hex) 둘입니다.
 * 8차(2026-08-28) — 가로 : 육각형(hex)                 2 -> 1
 *   이름은 "육각형" 이지만 실제로는 **차트 스타일(봉 색·격자선)** 입니다
 *   (js/chart-drawings.js 의 label 이 "차트 스타일 (봉 색·격자선)" 입니다).
 *   ⚠ 기준을 낮춘 것이 아닙니다. TOP_TOOLS 를 직접 열어 세었습니다 —
 *     hex 가 ready:true 로 바뀌었고 ready:false 로 남은 것은 alert 하나뿐입니다.
 *   남은 가로 준비중은 알람(alert) 하나였습니다.
 * 10·11차(2026-09-02) — 세로 : 파동(wave) · 표정(face)   2 -> 0
 *   파동은 트레이딩뷰 엘리엇 파동(점을 이어 찍고 꼭짓점에 1·2·3·4·5 또는
 *   A·B·C), 표정은 트레이딩뷰 Emojis/Stickers 자리를 선 그림 여섯으로.
 *   차트 시스템은 트레이딩뷰를 따라간다는 2026-09-02 대표 지시에 맞췄습니다.
 *   주의 — 앱 실측이 아닙니다. 트레이딩뷰 도구 막대는 로그인해야 쓸 수 있고
 *   팀은 로그인하지 않습니다. 공개된 도구 목록 문서를 읽고 맞췄습니다.
 * 12차(2026-09-02) — 가로 : 알람(alert)                  1 -> 0
 *   주의 — 이 줄의 이력을 그대로 남깁니다. 여기에는 원래
 *   "알람이 이 목록에서 빠지는 날은 대표 결재가 난 날이어야 합니다" 라고
 *   적혀 있었고, 승인대기 10번(대표 캡처 대기)이 근거였습니다.
 *   2026-09-02 밤 PM 이 "돈 드는 것 빼고는 내가 정한다" 로 착수를 지시했고,
 *   같은 지시에서 경계를 못 박았습니다 —
 *     되는 것   : 가격 선 + 화면 배지 · 소리 · 브라우저 알림(전부 무료)
 *     안 되는 것 : 알람이 주문을 내는 것 / 자동매매 / 돈 드는 발송 서비스
 *   그 경계는 아래 "알람은 알려주기까지" 검사들이 지킵니다.
 *   대표 캡처는 여전히 못 봤습니다 — 트레이딩뷰 기본값(교차 · 한 번만)으로
 *   만들었고, 캡처가 오면 다시 맞춰야 할 수 있습니다.
 *   가로 준비중은 이제 0 입니다.
 * 왜 이 넷인가 — 바이낸스 선물 차트에 실제로 있는 도구이고, 회원이 자주
 * 쓰는 순서로 골랐습니다(차트를 크게 보기 / 자랑용 캡처 / 되돌림·목표가 재기).
 * 이 숫자를 다시 줄이려면 무엇을 왜 열었는지 여기에 날짜와 함께 적으세요.
 * 검사를 지우지 마세요 — "준비중이라 써 놓고 실제로 열리는" 모순을 막는 그물입니다. */
ok("세로 막대 준비중이 0개다 (2026-09-02 파동·표정을 열어 2 -> 0)",
  railBtns.filter((b) => b.hasAttribute("data-soon")).length === 0,
  "지금 " + railBtns.filter((b) => b.hasAttribute("data-soon")).length + "개 — " +
  railBtns.filter((b) => b.hasAttribute("data-soon")).map((b) => b.getAttribute("data-tlc")).join(","));
ok("가로 막대 준비중이 0개다 (2026-09-02 알람을 열어 1 -> 0)",
  barBtns.filter((b) => b.hasAttribute("data-soon")).length === 0,
  "지금 " + barBtns.filter((b) => b.hasAttribute("data-soon")).length + "개 — " +
  barBtns.filter((b) => b.hasAttribute("data-soon")).map((b) => b.getAttribute("data-tlc")).join(","));
/* 준비중이 0 이 되면 "개수" 검사만으로는 무엇이 잠겼는지 못 봅니다.
   그래서 반대로 못 박습니다 — 그려진 단추 18개가 이름 그대로 전부 있고,
   하나라도 잠기면 여기서 걸립니다. 누가 fx 를 도로 잠그면 개수는 1 이 되어
   위 검사에서 걸리고, 이름은 여기서 걸립니다. (2026-09-02) */
{
  /* 2026-09-03 18차 — arrow · rect · vline 셋이 늘었습니다 */
  /* 2026-09-03 21차 — 손질 단추 다섯이 들어왔습니다(clearall·hideall·lockall / redo·undo).
     ⚠ 이 줄에서 이름을 ★빼면★ 그 기능이 화면에서 사라진 것입니다. 지우지 마세요. */
  const wantRail = "arrow,brush,channel,clearall,cursor,face,fib,hideall,hline,lockall,rect,ruler,text,trend,vline,wave,zoom";
  const wantBar = "alert,camera,candletype,expand,fullscreen,fx,hex,redo,undo";
  const gotRail = railBtns.map((b) => b.getAttribute("data-tlc")).sort().join(",");
  const gotBar = barBtns.map((b) => b.getAttribute("data-tlc")).sort().join(",");
  ok("세로 막대 단추 열일곱 개가 이름 그대로 전부 그려진다", gotRail === wantRail, gotRail);
  ok("가로 막대 단추 아홉 개가 이름 그대로 전부 그려진다", gotBar === wantBar, gotBar);
  const anySoon = railBtns.concat(barBtns).filter((b) => b.hasAttribute("data-soon"))
    .map((b) => b.getAttribute("data-tlc"));
  ok("도구 막대 전체에 준비중이 하나도 없다 (2026-09-02 세 개를 마지막으로 다 열었습니다)",
    anySoon.length === 0, anySoon.join(","));
}

/* ── 반대 방향 — "열었다고 해 놓고 실제로는 안 열리는" 것도 막습니다 ──────
   준비중 검사는 "잠긴 것이 열려 있는" 모순만 잡습니다. 그 반대,
   즉 열었다고 적어 놓고 버튼이 잠겨 있거나 아예 없는 경우는 못 잡습니다.
   2026-08-28 봉 종류를 열면서 같이 넣습니다. */
{
  /* 2026-08-28 hex 추가 — 개수가 2 에서 1 로 준 것만 보면
     "hex 를 목록에서 빼버린 것" 과 "hex 를 실제로 연 것" 이 구별되지 않습니다.
     그래서 열었다고 한 것은 반드시 이 목록에 넣어 실제로 눌리는지까지 봅니다. */
  const 열린가로 = ["candletype", "fx", "fullscreen", "camera", "expand", "hex"];
  열린가로.forEach(function (k) {
    const b = barBtns.filter((x) => x.getAttribute("data-tlc") === k)[0];
    ok("가로 " + k + " 버튼이 실제로 있다", !!b);
    if (!b) return;
    ok("가로 " + k + " 는 준비중 표시가 없다", !b.hasAttribute("data-soon"),
      "열었다고 적어 놓고 잠겨 있으면 회원은 고장으로 봅니다");
    ok("가로 " + k + " 는 잠겨 있지 않다(disabled 아님)", !b.hasAttribute("disabled"));
  });
}

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
  /* 2026-09-02 — 잠긴 버튼이 하나도 남지 않아 "눌러도 아무 일이 없다" 를
     걸 자리가 없어졌습니다. 검사를 지우지 않고 방향을 뒤집습니다 —
     이제는 "열어 놓고 실제로는 안 켜지는" 쪽이 위험합니다(조용한 고장).
     세로 막대 단추를 하나씩 다 눌러서 그 도구가 켜지는지 봅니다. */
  A.M.setTool("cursor");
  const notOn = [];
  /* ★ 2026-09-03 21차 — [data-kind=tool] 로 좁혔습니다.
     이유는 "손질 단추가 통과 못 해서" 가 아니라 ★검사의 뜻이 다르기 때문★입니다.
       도구(tool)  누르면 그 도구가 켜진 채로 남습니다 → getTool() 로 확인
       손질(act)   누르면 한 번 일하고 끝납니다. 켜지는 게 없어서 getTool() 로는
                   확인할 수 없고, 확인해서도 안 됩니다(켜지면 오히려 고장입니다)
     손질 단추는 바로 아래 [3-1] 에서 ★실제로 눌러 무슨 일이 일어나는지★ 로 봅니다.
     검사를 없앤 것이 아니라 맞는 검사로 옮긴 것입니다. */
  const toolBtns = railBtns.filter((b) => b.getAttribute("data-kind") === "tool");
  ok("세로 막대에서 도구(tool)로 셀 단추가 14개다 (좁힌 범위가 비어버리지 않았는지)",
    toolBtns.length === 14, "지금 " + toolBtns.length + "개");
  toolBtns.forEach(function (b) {
    const k = b.getAttribute("data-tlc");
    A.M.setTool("cursor");
    click(b);
    if (A.M.getTool() !== k) notOn.push(k + "->" + A.M.getTool());
  });
  A.M.setTool("cursor");
  ok("세로 막대 도구 단추를 하나씩 다 눌러보면 전부 그 도구가 켜진다", notOn.length === 0, notOn.join(" "));
  /* 반대로 — 손질 단추를 누르면 ★도구가 바뀌면 안 됩니다★.
     바뀌면 회원이 잠금을 누른 뒤 차트를 톡 했을 때 엉뚱한 선이 그어집니다. */
  {
    const bad = [];
    railBtns.concat(barBtns).filter((b) => b.getAttribute("data-kind") === "act").forEach(function (b) {
      A.M.setTool("cursor");
      click(b);
      if (A.M.getTool() !== "cursor") bad.push(b.getAttribute("data-tlc") + "->" + A.M.getTool());
    });
    A.M.setTool("cursor");
    ok("손질 단추를 눌러도 그리기 도구가 바뀌지 않는다", bad.length === 0, bad.join(" "));
  }
  const waveBtn = railBtns.filter((x) => x.getAttribute("data-tlc") === "wave")[0];
  click(waveBtn);
  ok("파동 버튼을 누르면 파동이 켜진다 (2026-09-02 10차)", A.M.getTool() === "wave", A.M.getTool());
  A.M.setTool("cursor");
  const faceBtn = railBtns.filter((x) => x.getAttribute("data-tlc") === "face")[0];
  click(faceBtn);
  ok("표정 버튼을 누르면 표정이 켜진다 (2026-09-02 11차)", A.M.getTool() === "face", A.M.getTool());
  A.M.setTool("cursor");
  const alertBtn = barBtns.filter((x) => x.getAttribute("data-tlc") === "alert")[0];
  click(alertBtn);
  ok("알람 버튼을 누르면 알람 놓기가 켜진다 (2026-09-02 12차)", A.M.getTool() === "alert", A.M.getTool());
  click(alertBtn);
  ok("알람 버튼을 한 번 더 누르면 꺼진다 (회원이 갇히지 않는다)", A.M.getTool() === "cursor", A.M.getTool());
  A.M.setTool("cursor");
  /* 반대로 브러시는 눌러서 켜져야 합니다 (열어 놓고 안 켜지면 조용한 고장) */
  const brush = railBtns.filter((x) => x.getAttribute("data-tlc") === "brush")[0];
  click(brush);
  ok("브러시 버튼을 누르면 브러시가 켜진다 (2026-08-28)", A.M.getTool() === "brush", A.M.getTool());
  A.M.setTool("cursor");
}
/* =============================================================================
 * 3-1) 손질 단추 (21차 2026-09-03) — 되돌리기·다시하기 / 잠금·숨김·휴지통
 * -----------------------------------------------------------------------------
 * 여기서 지키는 것은 딱 둘입니다.
 *   (가) ★기능을 새로 만들지 않았다★ — 전부 이미 있던 함수를 부릅니다
 *   (나) ★눌러서 실제로 일이 일어난다★ — 아이콘만 세워 둔 조용한 고장이 아니다
 * -------------------------------------------------------------------------- */
console.log("\n[3-1] 손질 단추 — 되돌리기 · 잠금 · 숨김 · 휴지통");
{
  const SPRITE = read("assets/icons/chart-tools.svg");
  const acts = A.M.TOOLS.railActs.concat(A.M.TOOLS.topActs).filter((d) => !d.sep);
  ok("손질 단추가 다섯이다 (잠금·숨김·휴지통·되돌리기·다시하기)", acts.length === 5,
    "지금 " + acts.length + "개");
  const missing = [];
  acts.forEach(function (d) {
    if (d.icon && SPRITE.indexOf("id=\"" + d.icon + "\"") === -1) missing.push(d.icon);
    if (d.icon2 && SPRITE.indexOf("id=\"" + d.icon2 + "\"") === -1) missing.push(d.icon2);
  });
  ok("손질 단추 아이콘이 전부 우리 스프라이트에 있다 (밖에서 받아온 그림이 없다)",
    missing.length === 0, missing.join(","));
  ok("손질 단추 아이콘도 직접 그린 것이다 (스프라이트에 외부 주소가 없다)",
    !/https?:\/\//.test(SPRITE.replace(/xmlns="[^"]*"/g, "")), "외부 주소가 있습니다");
  /* 아이콘 갈아 끼우기(swapIcon)가 "# 앞" 을 지키는지는 ★아래 [3-2]★ 에서
     실제로 태워서 값으로 확인합니다. 여기에 글자 검사로 두지 않는 이유는
     [3-2] 첫머리에 적어 뒀습니다 (2026-09-03 감사팀 지적). */

  /* ⚠ 자석 — 코드에 기능이 없으면 단추도 없어야 합니다.
     "아이콘은 있는데 눌러도 아무 일이 없는" 것이 이 프로젝트가 가장 싫어하는
     조용한 고장입니다. 나중에 자석을 진짜로 만들면 이 검사를 뒤집으세요. */
  ok("자석(magnet) 단추가 없다 — 기능 자체가 코드에 없기 때문",
    !/magnet|자석/.test(DRAW_CODE) &&
      barBtns.concat(railBtns).every((b) => b.getAttribute("data-tlc") !== "magnet"));
  ok("자석을 왜 안 만들었는지 근거가 남아 있다 (다음 사람이 무심코 아이콘만 세우지 않게)",
    /자석\(magnet\)은 넣지 않았습니다/.test(DRAW_SRC));
}

/* =============================================================================
 * 3-2) 아이콘 갈아 끼우기 — ★글자가 아니라 실제로 태워서★ 봅니다 (22차 2026-09-03)
 * -----------------------------------------------------------------------------
 * 무엇을 지키나
 *   스프라이트(assets/icons/chart-tools.svg)를 못 받아온 회원은 spriteFallback()
 *   덕분에 href 가 ★"assets/icons/chart-tools.svg#tlc-i-unlock"★ 처럼
 *   ★파일경로가 앞에 붙은 상태★ 입니다. 자물쇠·눈 아이콘을 갈아 끼울 때
 *   그 앞부분을 버리고 "#" + id 로 통째로 덮으면, ★그 회원 화면에서만★
 *   아이콘이 사라집니다. 오류도 안 나고 다른 회원 화면은 멀쩡한 조용한 고장입니다.
 *
 * 왜 글자 검사를 버렸나 (2026-09-03 감사팀 지적 — 이 봉인은 가짜였습니다)
 *   전에는 이렇게 돼 있었습니다:
 *       /function swapIcon[\s\S]{0,400}indexOf\("#"\)/.test(DRAW_CODE)
 *   ★indexOf("#") 라는 글자만 있으면 통과★ 합니다. 그래서 아래처럼 버그를
 *   되살려도 초록이었습니다 — 지키는 것이 하나도 없었습니다:
 *       var at = cur.indexOf("#");   // 글자는 있음
 *       var want = "#" + id;         // 앞부분을 통째로 버림  ← 못 잡음
 *
 * 그래서 값으로 봅니다
 *   폴백 상태(경로#id)를 실제로 만들어 놓고 단추를 눌러 swapIcon 을 태운 뒤,
 *   ★# 앞의 경로가 그대로 남아 있는지★ 를 href 값 전체로 비교합니다.
 *   (boot() 는 win.fetch 를 지워 두기 때문에 loadSprite() 가 spriteFallback()
 *    으로 물러섭니다 — 이 창은 "스프라이트를 못 받은 회원" 그 화면입니다)
 * -------------------------------------------------------------------------- */
console.log("\n[3-2] 아이콘 갈아 끼우기 — 폴백 화면에서 실제로 눌러 봅니다");
{
  const SW = boot({
    width: 1920,
    seed: {
      "chart-drawings": {
        v: 1, ui: {},
        bySymbol: {
          BTCUSDT: {
            hlines: [{ id: "h1", price: 100000 }],
            byInterval: { "1m": [{ id: "s1", kind: "trend" }] }
          }
        }
      }
    }
  });
  const 단추 = (k) => SW.win.document.querySelector('.tlc-btn[data-tlc="' + k + '"]');
  const href = (b) => (b.querySelector(".tlc-ico use").getAttribute("href") || "");
  const 누름 = (b) => b.dispatchEvent(new SW.win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const 경로 = "assets/icons/chart-tools.svg";
  const lk = 단추("lockall");
  const hd = 단추("hideall");

  /* 전제 — 이 창이 정말 "스프라이트를 못 받은 회원" 화면인가.
     여기가 깨지면 아래 검사들이 전부 헛돌므로 먼저 못 박습니다. */
  ok("폴백 화면이 실제로 재현됐다 — href 가 \"경로#id\" 다 (이 아래 검사들의 전제)",
    href(lk) === 경로 + "#tlc-i-unlock", href(lk));

  누름(lk);
  ok("★잠근 뒤에도 # 앞의 파일경로가 그대로 남는다★ (\"#\"+id 로 덮으면 아이콘이 사라집니다)",
    href(lk) === 경로 + "#tlc-i-lock", href(lk));
  누름(lk);
  ok("풀면 다시 열린 자물쇠로 돌아오고 경로도 그대로다 (되돌아올 때도 안 깨진다)",
    href(lk) === 경로 + "#tlc-i-unlock", href(lk));
  ok("여러 번 갈아 끼워도 경로가 겹쳐 붙지 않는다 (\"경로#id#id\" 가 되지 않는다)",
    href(lk).split("#").length === 2, href(lk));

  누름(hd);
  ok("숨김 아이콘(눈→빗금)도 경로를 지킨다", href(hd) === 경로 + "#tlc-i-eye-off", href(hd));
  누름(hd);
  ok("다시 보이기로 돌아와도 경로를 지킨다", href(hd) === 경로 + "#tlc-i-eye", href(hd));

  /* ★경로를 통째로 박아 넣는 방식(SPRITE_URL + "#" + id)도 막습니다.★
     그렇게 짜면 위 검사는 전부 통과하지만, 스프라이트를 다른 자리에서
     받아오게 바뀌는 날 조용히 깨집니다. "앞부분을 그대로 둔다" 가 규칙이지
     "우리 경로를 붙인다" 가 규칙이 아닙니다. 그래서 낯선 앞부분을 넣어 봅니다. */
  const 낯선앞 = "https://cdn.example.test/sprite.svg";
  lk.querySelector(".tlc-ico use").setAttribute("href", 낯선앞 + "#tlc-i-unlock");
  누름(lk);
  ok("낯선 앞부분이어도 그대로 둔다 (우리 경로를 박아 넣는 방식이 아니다)",
    href(lk) === 낯선앞 + "#tlc-i-lock", href(lk));

  /* # 이 아예 없는 href(옛 브라우저에서 xlink:href 만 남는 등)도 안 터져야 합니다 */
  hd.querySelector(".tlc-ico use").setAttribute("href", "");
  누름(hd);
  ok("href 가 비어 있어도 터지지 않고 \"#id\" 로 채운다", href(hd) === "#tlc-i-eye-off", href(hd));

  SW.win.close();
}

{
  /* 되돌리기 — 이미 있던 undo()/redo() 를 그대로 부릅니다 */
  const un = barBtns.filter((x) => x.getAttribute("data-tlc") === "undo")[0];
  const re = barBtns.filter((x) => x.getAttribute("data-tlc") === "redo")[0];
  ok("되돌리기 단추가 가로 막대에 있다", !!un);
  ok("다시하기 단추가 가로 막대에 있다", !!re);
  /* 트레이딩뷰처럼 ★맨 오른쪽★ 인가 — 카메라(오른쪽 묶음의 끝)보다 뒤에 있어야 합니다 */
  const order = barBtns.map((b) => b.getAttribute("data-tlc"));
  ok("되돌리기·다시하기가 가로 막대 맨 오른쪽 두 자리다 (트레이딩뷰와 같은 자리)",
    order[order.length - 2] === "undo" && order[order.length - 1] === "redo", order.join(","));
  ok("되돌리기 앞에 구분선이 있다 (묶음이 나뉘어 보입니다)",
    !!un && un.previousElementSibling && un.previousElementSibling.className === "tlc-sep",
    un && un.previousElementSibling ? un.previousElementSibling.className : "없음");

  /* 되돌릴 것이 없으면 흐리게 (트레이딩뷰도 같습니다).
     ⚠ disabled 가 아니라 aria-disabled 입니다 — 이 프로젝트에서 disabled 는
       "준비중(아직 안 만든 것)" 이라는 뜻으로 이미 쓰고 있습니다. */
  ok("되돌릴 것이 없으면 되돌리기가 흐리다", un.getAttribute("aria-disabled") === "true",
    un.getAttribute("aria-disabled"));
  ok("다시 할 것이 없으면 다시하기가 흐리다", re.getAttribute("aria-disabled") === "true");
  ok("흐린 것을 disabled 로 잠그지 않는다 (준비중과 뜻이 섞이면 안 됩니다)",
    !un.hasAttribute("disabled") && !un.hasAttribute("data-soon"));
}
{
  /* ── 여기부터는 ★그린 것이 있는 화면★ 이 필요합니다 ────────────────────────
   * 위의 A 는 빈 화면이라 잠금·숨김·휴지통이 할 일이 없습니다.
   * 그리기는 캔버스를 톡 해야 생기는데 jsdom 에는 캔버스가 없어서,
   * 저장해 둔 것을 되살리는 방식(seed)으로 수평선 1 · 추세선 1 을 깔고 봅니다.
   * 새 창을 따로 띄우는 이유 — A 를 더럽히면 뒤따르는 검사들이 흔들립니다.
   * ------------------------------------------------------------------------ */
  const B = boot({
    width: 1920,
    seed: {
      "chart-drawings": {
        v: 1, ui: {},
        bySymbol: {
          BTCUSDT: {
            hlines: [{ id: "h1", price: 100000 }],
            byInterval: { "1m": [{ id: "s1", kind: "trend" }] }
          }
        }
      }
    }
  });
  const bRail = Array.from(B.win.document.querySelectorAll(".tlc-rail .tlc-btn"));
  const bBar = Array.from(B.win.document.querySelectorAll(".tlc-toolbar .tlc-btn"));
  const bClick = (btn) => btn.dispatchEvent(new B.win.MouseEvent("click", { bubbles: true, cancelable: true }));
  const pick = (arr, k) => arr.filter((x) => x.getAttribute("data-tlc") === k)[0];
  const cnt = () => B.M.getDrawings().hlines.length + B.M.getDrawings().shapes.length;
  /* href 는 스프라이트를 못 받아왔을 때 "파일경로#id" 가 됩니다(spriteFallback).
     그래서 ★# 뒤만★ 봅니다 — 앞부분까지 보면 되는 화면에서도 빨개집니다. */
  const useHref = (b) => {
    const h = b.querySelector(".tlc-ico use").getAttribute("href") || "";
    return h.slice(h.indexOf("#"));
  };

  const lk = pick(bRail, "lockall");
  const hd = pick(bRail, "hideall");
  const cl = pick(bRail, "clearall");
  const un = pick(bBar, "undo");
  const re = pick(bBar, "redo");
  ok("전체 잠금 단추가 세로 막대에 있다", !!lk);
  ok("전체 숨김 단추가 세로 막대에 있다", !!hd);
  ok("모두 지우기 단추가 세로 막대에 있다", !!cl);
  ok("깔아 둔 그림 2개가 되살아났다 (이 아래 검사들의 전제)", cnt() === 2, "지금 " + cnt() + "개");

  const kids = Array.from(B.win.document.querySelector(".tlc-rail").children);
  ok("손질 묶음이 세로 막대 ★맨 아래★ 세 자리다",
    kids.slice(-3).map((e) => e.getAttribute("data-tlc")).join(",") === "lockall,hideall,clearall",
    kids.slice(-3).map((e) => e.getAttribute("data-tlc")).join(","));
  ok("도구와 손질 묶음 사이에 가로 구분선이 있다",
    kids[kids.length - 4].className === "tlc-sep", kids[kids.length - 4].className);

  ok("그린 것이 있으면 잠금·숨김·휴지통이 흐리지 않다",
    [lk, hd, cl].every((b) => b.getAttribute("aria-disabled") !== "true"),
    [lk, hd, cl].map((b) => b.getAttribute("aria-disabled")).join(","));

  /* 잠금 — 색이 아니라 ★자물쇠 모양★ 으로 상태를 알립니다 */
  ok("잠기지 않았을 때는 열린 자물쇠다", useHref(lk) === "#tlc-i-unlock", useHref(lk));
  bClick(lk);
  ok("잠금 단추를 누르면 실제로 다 잠긴다 (목록의 '전체 잠금' 과 같은 함수)",
    B.M.getLockedCount() === 2, "잠긴 것 " + B.M.getLockedCount() + "개");
  ok("잠기면 닫힌 자물쇠로 바뀐다 (색이 아니라 그림으로)", useHref(lk) === "#tlc-i-lock", useHref(lk));
  ok("잠기면 읽어주는 프로그램에도 켜짐으로 간다", lk.getAttribute("aria-pressed") === "true");
  bClick(lk);
  ok("한 번 더 누르면 잠금이 풀린다 (회원이 갇히지 않는다)", B.M.getLockedCount() === 0,
    "잠긴 것 " + B.M.getLockedCount() + "개");
  ok("풀리면 열린 자물쇠로 돌아온다", useHref(lk) === "#tlc-i-unlock");

  /* 숨김 — 눈 ↔ 눈에 빗금 */
  ok("숨기지 않았을 때는 눈이다", useHref(hd) === "#tlc-i-eye", useHref(hd));
  bClick(hd);
  ok("숨김 단추를 누르면 실제로 다 숨는다", B.M.getHiddenCount() === 2,
    "숨은 것 " + B.M.getHiddenCount() + "개");
  ok("숨기면 눈에 빗금이 그어진다", useHref(hd) === "#tlc-i-eye-off", useHref(hd));
  ok("★숨겨도 그린 것이 지워지지는 않는다★ (자료는 그대로 남습니다)", cnt() === 2, "지금 " + cnt() + "개");
  bClick(hd);
  ok("한 번 더 누르면 다시 보인다", B.M.getHiddenCount() === 0 && useHref(hd) === "#tlc-i-eye");

  /* 휴지통 — ★한 번에 안 지워집니다.★ 그리는 도구 바로 아래라 스칠 수 있는 자리입니다 */
  bClick(cl);
  ok("휴지통을 한 번 누른 것으로는 지워지지 않는다 (스쳐도 안전하다)",
    cnt() === 2, "지금 " + cnt() + "개");
  ok("한 번 눌러 두면 '한 번 더' 상태로 켜져 보인다", cl.getAttribute("aria-pressed") === "true");
  bClick(cl);
  ok("두 번째로 누르면 지워진다", cnt() === 0, "지금 " + cnt() + "개");
  ok("지운 뒤에는 '한 번 더' 상태가 풀린다", cl.getAttribute("aria-pressed") !== "true");
  ok("다 지우고 나면 잠금·숨김·휴지통이 도로 흐려진다",
    [lk, hd, cl].every((b) => b.getAttribute("aria-disabled") === "true"),
    [lk, hd, cl].map((b) => b.getAttribute("aria-disabled")).join(","));

  /* ★ 실수로 지웠을 때 되돌릴 수 있는가 — 여기가 이 묶음에서 제일 중요합니다 ★
     휴지통이 있는데 되돌리기가 없으면 그린 것이 영영 사라집니다. */
  ok("지우고 나면 되돌리기가 흐리지 않다 (되돌릴 것이 생겼다)",
    un.getAttribute("aria-disabled") !== "true", un.getAttribute("aria-disabled"));
  bClick(un);
  ok("★되돌리기 단추를 누르면 지웠던 것이 도로 살아난다★ (Ctrl+Z 와 같은 함수)",
    cnt() === 2, "지금 " + cnt() + "개");
  ok("되돌린 뒤에는 다시하기가 흐리지 않다", re.getAttribute("aria-disabled") !== "true");
  bClick(re);
  ok("다시하기 단추를 누르면 도로 지워진다", cnt() === 0, "지금 " + cnt() + "개");
  bClick(un);
  ok("정리 — 되돌려 놓았다", cnt() === 2, "지금 " + cnt() + "개");

  /* 잠근 것은 남깁니다 — 16차 규칙이 이 단추에서도 그대로인지 */
  bClick(lk);
  bClick(cl);
  bClick(cl);
  ok("★잠근 것은 휴지통으로도 안 지워진다★ (16차 규칙 그대로)", cnt() === 2,
    "지금 " + cnt() + "개");
  B.win.close();
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
  ok("접혀 있어도 버튼 17개는 그대로 남아 있다 (지운 게 아니라 접은 것)",
    P.win.document.querySelectorAll(".tlc-rail .tlc-btn").length === 17);
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
