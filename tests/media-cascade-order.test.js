/* tests/media-cascade-order.test.js
 * "좁은 화면 전용 규칙이 넓은 화면 규칙에 덮여 죽는 것" 을 잡습니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * 2026-08-26, 360px 에서 마지막 메뉴 "TL 마켓" 이 35.3px 잘려 있었습니다.
 * 처음에는 "글자가 커서" 로 보였지만 진짜 원인은 다른 것이었습니다.
 *
 *   @media (max-width:400px){ .top-banner-nav-btn{padding:8.5px 8px;} }  <- 505행 (앞)
 *   ...
 *   @media (max-width:520px){ .top-banner-nav-btn{padding-left:10px;} }  <- 3150행대 (뒤)
 *
 * 360px 은 400 이하이면서 520 이하이기도 해서 **둘 다 맞습니다.**
 * 특이도가 같으면 CSS 는 파일에서 뒤에 있는 것이 이깁니다. 그래서 좁은 화면
 * 전용으로 만든 8px 이 넓은 화면용 10px 에 덮여 **아예 죽어 있었습니다.**
 * 고쳐도 화면이 안 바뀌는 그 유형입니다.
 *
 * 이미 있는 tests/css-duplicate-rules.test.js 는 **같은 미디어쿼리 안의 중복만**
 * 봅니다. 위처럼 **서로 다른 미디어쿼리끼리 덮는 것은 못 잡아서** 이번 건이
 * 그대로 빠져나갔습니다. 그 구멍을 이 파일이 막습니다.
 *
 * ── 무엇을 지키는가 ────────────────────────────────────────────────────
 *   규칙: 같은 선택자 + 겹치는 속성이 max-width 두 곳에 있으면
 *         **더 좁은 쪽이 파일에서 더 뒤에 있어야 한다.**
 *
 * 세 가지 모양을 다 봅니다.
 *   (가) max-width  vs  더 넓은 max-width   - 이번 사고의 모양
 *   (나) max-width  vs  뒤에 나오는 기본 규칙(미디어쿼리 없음)
 *   (다) min-width  vs  더 좁은 min-width   - 큰 화면 쪽의 같은 문제
 *
 * 속성 이름이 달라도 겹치는 것을 봅니다(padding 과 padding-left 처럼
 * 줄임말이 낱개 속성을 덮는 경우). 이번 사고가 정확히 그 모양이었습니다.
 *
 * ── 지금 남아 있는 것은 기준선으로 박아 둡니다(래칫) ──────────────────
 * 전수로 훑어 보니 (가) 4건, (나) 14건이 이미 있습니다. 전부 진짜로 죽어 있는
 * 규칙이고 화면에 영향이 있습니다. 다만 style.css 를 고치는 것은 기록팀 일이
 * 아니라 본부장 판단이므로 **지금 상태를 그대로 박아 두고, 여기서 하나라도
 * 늘면 실패**시킵니다. 고치면 아래 목록에서 그 줄을 지우면 통과합니다.
 *
 * style.css 는 읽기만 합니다. 이 파일은 사이트 코드를 아무것도 고치지 않습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? "\n      " + detail : "")); }
}

console.log("\n좁은 화면 규칙이 넓은 화면 규칙에 덮이지 않는다");

/* =========================================================================
 * 1) 읽기 - CSS 를 규칙 단위로 훑습니다.
 *    주석은 같은 길이의 공백으로 바꿔 지웁니다(줄 번호가 안 밀립니다).
 * ========================================================================= */
function 규칙들(cssText) {
  const c = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const list = [];
  const ctx = [];
  let buf = "";
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === "{") {
      const head = buf.trim().replace(/\s+/g, " ");
      buf = "";
      if (/^@/.test(head)) { ctx.push(head); continue; }
      let d = 1, j = i + 1;
      for (; j < c.length && d > 0; j++) { if (c[j] === "{") d++; else if (c[j] === "}") d--; }
      const body = c.slice(i + 1, j - 1);
      const props = (body.match(/(?:^|[;{])\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/g) || [])
        .map((s) => s.replace(/[^a-zA-Z-]/g, "").toLowerCase());
      const line = c.slice(0, i).split("\n").length;
      for (const sel of head.split(",").map((s) => s.trim()).filter(Boolean)) {
        list.push({ media: ctx.slice(), sel: sel, props: props, pos: i, line: line });
      }
      i = j - 1;
      continue;
    } else if (ch === "}") { if (ctx.length) ctx.pop(); buf = ""; continue; }
    buf += ch;
  }
  return list;
}

/* 줄임말(shorthand)이 낱개 속성을 덮는 관계.
   이번 사고가 padding 과 padding-left 였으므로 이 표가 없으면 못 잡습니다. */
const 줄임말 = {
  "padding": ["padding-top", "padding-right", "padding-bottom", "padding-left", "padding-inline", "padding-block"],
  "margin": ["margin-top", "margin-right", "margin-bottom", "margin-left", "margin-inline", "margin-block"],
  "gap": ["row-gap", "column-gap"],
  "font": ["font-size", "font-weight", "font-family", "font-style", "line-height", "font-variant"],
  "background": ["background-color", "background-image", "background-position", "background-size", "background-repeat", "background-clip"],
  "border": ["border-width", "border-style", "border-color", "border-top", "border-right", "border-bottom", "border-left"],
  "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-left-radius", "border-bottom-right-radius"],
  "flex": ["flex-grow", "flex-shrink", "flex-basis"],
  "inset": ["top", "right", "bottom", "left"],
  "overflow": ["overflow-x", "overflow-y"],
  "grid-template": ["grid-template-columns", "grid-template-rows", "grid-template-areas"],
  "transition": ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"],
  "place-items": ["align-items", "justify-items"],
  "place-content": ["align-content", "justify-content"]
};
function 겹치나(a, b) {
  if (a === b) return true;
  if (줄임말[a] && 줄임말[a].indexOf(b) >= 0) return true;
  if (줄임말[b] && 줄임말[b].indexOf(a) >= 0) return true;
  return false;
}

/* @media 조건에서 폭 하나만 뽑습니다.
   and 로 두 조건이 엮였거나 쉼표로 여러 개면 판단하지 않고 건너뜁니다
   (겹치는 범위를 단정할 수 없어서, 억지로 세면 오탐이 납니다). */
function 최대폭(mediaArr) {
  if (mediaArr.length !== 1) return null;
  const m = mediaArr[0];
  if (!/^@media/.test(m) || /,/.test(m)) return null;
  const mx = m.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/g);
  const mn = m.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/g);
  if (!mx || mx.length !== 1 || mn) return null;
  return parseFloat(mx[0].match(/(\d+(?:\.\d+)?)/)[1]);
}
function 최소폭(mediaArr) {
  if (mediaArr.length !== 1) return null;
  const m = mediaArr[0];
  if (!/^@media/.test(m) || /,/.test(m)) return null;
  const mn = m.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/g);
  const mx = m.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/g);
  if (!mn || mn.length !== 1 || mx) return null;
  return parseFloat(mn[0].match(/(\d+(?:\.\d+)?)/)[1]);
}

/* 공통 뼈대 - 폭을 뽑는 함수와 "A 가 B 보다 좁은가" 판정만 갈아 끼웁니다. */
function 역전찾기(cssText, 폭뽑기, 더좁나, 이름표) {
  const bySel = new Map();
  for (const r of 규칙들(cssText)) {
    const w = 폭뽑기(r.media);
    if (w === null) continue;
    if (!bySel.has(r.sel)) bySel.set(r.sel, []);
    bySel.get(r.sel).push({ w: w, props: r.props, pos: r.pos, line: r.line });
  }
  const out = [];
  for (const [sel, arr] of bySel) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
      if (i === j) continue;
      const A = arr[i], B = arr[j];
      if (!더좁나(A.w, B.w)) continue;   /* A 가 더 좁은 화면용인가 */
      if (!(A.pos < B.pos)) continue;    /* A 가 파일에서 앞인가 -> 앞이면 죽습니다 */
      const 겹 = [];
      for (const p of A.props) for (const q of B.props) if (겹치나(p, q)) 겹.push(p);
      if (겹.length) {
        out.push(sel + "  [" + 이름표(A.w) + " @" + A.line + "행] 이 [" + 이름표(B.w) +
          " @" + B.line + "행] 에 덮임 - " + [...new Set(겹)].sort().join(","));
      }
    }
  }
  out.sort();
  return out;
}

const BASE = Infinity;   /* 미디어쿼리가 없는 기본 규칙 = 폭 제한 없음 */
function 좁은게앞_미디어(css) {
  return 역전찾기(css, 최대폭, (a, b) => a < b, (w) => "<=" + w + "px");
}
function 좁은게앞_기본(css) {
  return 역전찾기(css,
    (media) => (media.length === 0 ? BASE : 최대폭(media)),
    (a, b) => a < b && b === BASE,
    (w) => (w === BASE ? "기본" : "<=" + w + "px"));
}
function 좁은게앞_민폭(css) {
  return 역전찾기(css, 최소폭, (a, b) => a > b, (w) => ">=" + w + "px");
}

/* =========================================================================
 * 2) 자체검증 - 탐지기가 진짜로 잡는가 (합성 CSS 로만)
 * ========================================================================= */
console.log("\n  [자체검증] 탐지기가 진짜로 잡는가");
{
  /* 이번 사고를 그대로 재현한 모양 - 이걸 못 잡으면 이 파일은 의미가 없습니다 */
  const 사고모양 =
    "@media (max-width:400px){.top-banner-nav-btn{padding:8.5px 8px;font-size:13px;}}\n" +
    "@media (max-width:520px){.top-banner-nav-btn{padding-left:10px;padding-right:10px;}}\n";
  const r = 좁은게앞_미디어(사고모양);
  ok("2026-08-26 'TL 마켓' 사고 모양(padding 이 뒤의 padding-left 에 덮임)을 잡는다",
    r.length === 1 && /top-banner-nav-btn/.test(r[0]) && /<=400px/.test(r[0]) && /<=520px/.test(r[0]),
    r.join(" / "));

  ok("고친 순서(좁은 것이 뒤)면 잡지 않는다 - 오탐 없음",
    좁은게앞_미디어(
      "@media (max-width:520px){.top-banner-nav-btn{padding-left:7px;padding-right:7px;}}\n" +
      "@media (max-width:400px){.top-banner-nav-btn{padding:8.5px 5px;font-size:13px;}}\n").length === 0);

  ok("같은 속성 이름이 그대로 겹쳐도 잡는다",
    좁은게앞_미디어(
      "@media (max-width:400px){.a{font-size:13px;}}\n@media (max-width:700px){.a{font-size:20px;}}\n").length === 1);

  ok("속성이 안 겹치면 잡지 않는다 (좁은 값이 안 죽으므로)",
    좁은게앞_미디어(
      "@media (max-width:400px){.a{color:red;}}\n@media (max-width:700px){.a{font-size:20px;}}\n").length === 0);

  ok("선택자가 다르면 잡지 않는다 (특이도 비교까지는 하지 않습니다)",
    좁은게앞_미디어(
      "@media (max-width:400px){.a{gap:1px;}}\n@media (max-width:700px){.b{gap:9px;}}\n").length === 0);

  ok("기본 규칙이 뒤에 와서 좁은 화면 값을 덮는 것도 잡는다",
    좁은게앞_기본("@media (max-width:400px){.a{padding:9px 0;}}\n.a{padding:6px 0;}\n").length === 1);

  ok("기본 규칙이 앞에 있으면(정상) 잡지 않는다",
    좁은게앞_기본(".a{padding:6px 0;}\n@media (max-width:400px){.a{padding:9px 0;}}\n").length === 0);

  ok("min-width 쪽 역전(넓은 화면 전용이 앞)도 잡는다",
    좁은게앞_민폭(
      "@media (min-width:1800px){.a{font-size:24px;}}\n@media (min-width:1200px){.a{font-size:14px;}}\n").length === 1);

  ok("주석 안에 적힌 규칙은 세지 않는다",
    좁은게앞_미디어(
      "/* @media (max-width:400px){.a{gap:1px;}} */\n@media (max-width:700px){.a{gap:9px;}}\n").length === 0);

  ok("and 로 엮인 조건은 판단하지 않고 건너뛴다 (오탐 방지)",
    최대폭(["@media (min-width:1800px) and (max-width:2200px)"]) === null);

  ok("쉼표로 여러 조건이면 건너뛴다 (오탐 방지)",
    최대폭(["@media (max-width:400px), print"]) === null);

  ok("겹치나() 가 padding 과 padding-left 를 겹친다고 본다", 겹치나("padding", "padding-left") === true);
  ok("겹치나() 가 gap 과 row-gap 을 겹친다고 본다", 겹치나("gap", "row-gap") === true);
  ok("겹치나() 가 padding 과 margin 은 안 겹친다고 본다", 겹치나("padding", "margin") === false);
}

/* =========================================================================
 * 3) 기준선 - 2026-08-26 전수조사 결과
 *    이 목록은 "봐준 것"이 아니라 "이미 죽어 있는 규칙 목록"입니다.
 *    늘리지 마세요. 고치면 그 줄을 지우면 됩니다.
 *
 *    눈에 띄는 것 몇 개 (전부 실제로 화면에 영향이 있습니다):
 *      .mypage-grid   360px 에서 1열로 만들려던 규칙이 죽어 2열 그대로입니다
 *      .chip          "터치 타겟 6px->9px" 주석이 붙어 있는데 실제로는 6px 입니다
 *      .position-table td/th  모바일 글자 크기 규칙이 죽어 있습니다
 *
 *    == 갱신 이력 =========================================================
 *    2026-08-26  (나) 14건 -> 13건. 디자인팀이 아래 한 건을 실제로 고쳤습니다.
 *      뺀 줄: .position-expand-btn  [<=700px @496행] 이 [기본 @635행] 에 덮임 - display
 *      무엇이었나 - 700px 이하에서 포지션 표의 .mobile-hide 18칸(금액·강제청산가·
 *        TP·SL·개시증거금·진입수수료…)이 숨겨지는데, 그것을 되살리는 유일한 길인
 *        "더보기" 버튼이 display:none 이라 폰에서 아예 안 보였습니다.
 *        회원이 강제청산가를 숫자로 볼 방법이 없었습니다.
 *      어떻게 고쳤나 - 496행에 있던 @media(max-width:700px) 규칙을 style.css
 *        맨 뒤로 옮겼습니다(635행 기본 규칙보다 뒤). 값은 그대로 옮겼고, 터치
 *        크기만 min-height:44px 로 못 박았습니다. js/ui.js 는 안 건드렸습니다.
 *      실측(360, 주문 시트를 연 상태) - 버튼 display:none -> block, 높이 49px,
 *        눌렀더니 .mobile-hide 보이는 칸 0 -> 18, 표에 .expanded 가 붙었습니다.
 *      아래 5) 의 이름표 검사가 이 자리를 따로 못 박습니다.
 * ========================================================================= */

/* (가) max-width 끼리 - 좁은 쪽이 앞이라 죽은 것 */
const 기준선_미디어 = [
  ".brand .name  [<=700px @482행] 이 [<=760px @1843행] 에 덮임 - font-size",
  ".main-grid .chart-column .chart-container  [<=700px @474행] 이 [<=1300px @708행] 에 덮임 - height,min-height",
  ".position-table td  [<=700px @490행] 이 [<=1799px @2352행] 에 덮임 - font-size",
  ".position-table th  [<=700px @489행] 이 [<=1799px @2351행] 에 덮임 - font-size"
];

/* (나) 기본 규칙이 뒤에 있어 좁은 화면 값을 덮은 것 */
const 기준선_기본 = [
  ".amitalk-order .ami-symbol-row  [<=900px @1454행] 이 [기본 @3690행] 에 덮임 - padding",
  ".auth-user-badge  [<=700px @483행] 이 [기본 @898행] 에 덮임 - font-size,gap,margin-right",
  ".chip  [<=700px @478행] 이 [기본 @558행] 에 덮임 - padding",
  ".mw-canvas-wrap-battle  [<=700px @485행] 이 [기본 @812행] 에 덮임 - height,min-height",
  ".mypage-grid  [<=400px @510행] 이 [기본 @1080행] 에 덮임 - grid-template-columns",
  ".mypage-grid  [<=700px @501행] 이 [기본 @1080행] 에 덮임 - grid-template-columns",
  ".mypage-nickname-value  [<=700px @502행] 이 [기본 @1077행] 에 덮임 - font-size",
  ".position-grid  [<=700px @487행] 이 [기본 @608행] 에 덮임 - gap",
  ".position-grid b  [<=700px @488행] 이 [기본 @611행] 에 덮임 - font-size",
  ".position-table td  [<=700px @490행] 이 [기본 @2341행] 에 덮임 - font-size,padding-right",
  ".position-table td  [<=700px @490행] 이 [기본 @623행] 에 덮임 - font-size,padding-right",
  ".position-table th  [<=700px @489행] 이 [기본 @2340행] 에 덮임 - font-size,padding-right",
  ".position-table th  [<=700px @489행] 이 [기본 @619행] 에 덮임 - font-size,padding-right"
];

/* 줄 번호가 조금 밀려도 "같은 사고"로 알아보게, 선택자와 폭만 비교합니다.
   (다른 곳을 고쳐서 줄이 밀렸다는 이유로 실패하면 아무도 안 고칩니다) */
function 열쇠(s) { return s.replace(/@\d+행/g, "@?행"); }

/* =========================================================================
 * 4) 실제 style.css 검사
 * ========================================================================= */
console.log("\n  [실제 CSS] style.css 전수");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
{
  const 가 = 좁은게앞_미디어(CSS);
  const 나 = 좁은게앞_기본(CSS);
  const 다 = 좁은게앞_민폭(CSS);
  console.log("    (가) max-width 끼리 역전 " + 가.length + "건 / (나) 기본이 덮음 " + 나.length +
    "건 / (다) min-width 역전 " + 다.length + "건");

  const 기준가 = 기준선_미디어.map(열쇠);
  const 기준나 = 기준선_기본.map(열쇠);
  const 새가 = 가.filter((x) => 기준가.indexOf(열쇠(x)) < 0);
  const 새나 = 나.filter((x) => 기준나.indexOf(열쇠(x)) < 0);
  새가.forEach((x) => console.log("    새 역전 -> " + x));
  새나.forEach((x) => console.log("    새 덮어씀 -> " + x));

  ok("좁은 화면 규칙이 넓은 화면 규칙에 새로 덮인 곳이 없다", 새가.length === 0, 새가.join("\n      "));
  ok("좁은 화면 규칙이 뒤에 나온 기본 규칙에 새로 덮인 곳이 없다", 새나.length === 0, 새나.join("\n      "));
  ok("(가) 가 4건을 넘지 않는다", 가.length <= 4, String(가.length));
  ok("(나) 가 13건을 넘지 않는다", 나.length <= 13, String(나.length));
  ok("min-width 쪽 역전은 0건이다 (여긴 아직 깨끗합니다)", 다.length === 0, 다.join("\n      "));

  const 사라진 = 기준선_미디어.concat(기준선_기본)
    .filter((x) => 가.concat(나).map(열쇠).indexOf(열쇠(x)) < 0);
  if (사라진.length) {
    console.log("    아래 역전은 없어졌습니다 - 기준선에서 지워도 됩니다");
    사라진.forEach((x) => console.log("      . " + x));
  }
}

/* =========================================================================
 * 5) 이번에 고친 자리는 이름을 불러 못 박습니다
 *    (기준선은 "늘지 마라"일 뿐이고, 사고 자리는 따로 콕 집어 둡니다)
 * ========================================================================= */
console.log("\n  [사고 자리] 메뉴 버튼 - 400 규칙이 520 규칙보다 뒤에 있어야 한다");
{
  const 나온곳 = 규칙들(CSS).filter((r) => r.sel === ".top-banner-nav-btn" && r.media.length === 1);
  const 폭들 = 나온곳.map((r) => ({ w: 최대폭(r.media), line: r.line, props: r.props }))
    .filter((x) => x.w !== null)
    .sort((a, b) => a.line - b.line);
  console.log("    .top-banner-nav-btn 의 max-width 규칙 순서: " +
    폭들.map((x) => "<=" + x.w + "(@" + x.line + "행)").join(" -> "));

  ok(".top-banner-nav-btn 규칙이 좁은 폭 순서로 뒤에 온다 (1366 -> 700 -> 520 -> 400)",
    폭들.map((x) => x.w).join(",") === "1366,700,520,400",
    폭들.map((x) => "<=" + x.w + "@" + x.line).join(" "));

  const 사백 = 폭들.filter((x) => x.w === 400)[0];
  const 오이공 = 폭들.filter((x) => x.w === 520)[0];
  ok("400px 이하 메뉴 규칙이 존재한다", !!사백);
  ok("520px 이하 메뉴 규칙이 존재한다", !!오이공);
  ok("400 규칙이 520 규칙보다 파일에서 뒤에 있다 (뒤집히면 360 에서 'TL 마켓' 이 다시 잘립니다)",
    !!사백 && !!오이공 && 사백.line > 오이공.line,
    사백 && 오이공 ? "400=@" + 사백.line + "행, 520=@" + 오이공.line + "행" : "규칙 없음");
  ok("400 규칙이 좌우 여백을 직접 정한다 (padding 또는 padding-left/right)",
    !!사백 && 사백.props.some((p) => /^padding(-left|-right)?$/.test(p)), 사백 ? 사백.props.join(",") : "");
}

console.log("\n  [사고 자리] 포지션 표 더보기 버튼 - 700 규칙이 기본 규칙보다 뒤에 있어야 한다");
{
  /* 2026-08-26. 폰(<=700px)에서 포지션 표의 .mobile-hide 18칸이 숨겨지는데,
     그것을 되살리는 유일한 길이 .position-table.expanded 이고, 그 클래스를 붙이는
     코드는 js/ui.js 의 "더보기" 버튼 클릭 핸들러 하나뿐입니다. 그 버튼이
     display:none 이라 폰에서 아예 안 보였습니다(숨은 칸에 강제청산가가 있습니다).
     기본 규칙 .position-expand-btn{display:none} 은 넓은 화면용이라 남겨 둡니다.
     대신 700px 규칙이 반드시 그보다 뒤에 있어야 합니다. */
  const 전부 = 규칙들(CSS).filter((r) => r.sel === ".position-expand-btn");
  const 기본 = 전부.filter((r) => r.media.length === 0).sort((a, b) => a.line - b.line);
  const 칠백 = 전부.filter((r) => 최대폭(r.media) === 700).sort((a, b) => a.line - b.line);
  console.log("    .position-expand-btn - 기본 " + 기본.map((x) => "@" + x.line + "행").join(",") +
    " / <=700px " + 칠백.map((x) => "@" + x.line + "행").join(","));

  ok("기본(넓은 화면) 숨김 규칙이 그대로 있다", 기본.length >= 1);
  ok("<=700px 에서 버튼을 보이게 하는 규칙이 있다", 칠백.length >= 1);
  ok("<=700px 규칙이 display 를 직접 정한다",
    칠백.length >= 1 && 칠백.some((x) => x.props.indexOf("display") >= 0),
    칠백.map((x) => x.props.join(",")).join(" | "));
  ok("<=700px 규칙이 마지막 기본 규칙보다 파일에서 뒤에 있다 (뒤집히면 폰에서 18칸을 다시 못 폅니다)",
    칠백.length >= 1 && 기본.length >= 1 &&
    칠백[칠백.length - 1].line > 기본[기본.length - 1].line,
    (칠백.length ? "700=@" + 칠백[칠백.length - 1].line + "행" : "700 규칙 없음") + ", " +
    (기본.length ? "기본=@" + 기본[기본.length - 1].line + "행" : "기본 규칙 없음"));

  /* 터치 크기 - 옮기기 전 실측 높이가 40.6px 이라 44px 기준에 3.4px 모자랐습니다.
     옮기면서 min-height:44px 로 못 박았고(실측 49px), 그 값이 지워지지 않게 봅니다. */
  const 뒤블록머리 = "@media (max-width:700px){";
  const 마지막블록 = CSS.lastIndexOf(뒤블록머리);
  const 몸통 = 마지막블록 >= 0 ? CSS.slice(마지막블록, 마지막블록 + 600) : "";
  ok("맨 뒤 700px 블록이 .position-expand-btn 을 담고 있다", 몸통.indexOf(".position-expand-btn") >= 0);
  ok("<=700px 규칙에 터치 크기 44px 이상이 박혀 있다",
    /min-height\s*:\s*(4[4-9]|[5-9]\d|\d{3,})px/.test(몸통),
    (몸통.match(/min-height\s*:\s*[^;]+/) || ["min-height 없음"])[0]);

  /* 되돌림 검사 - 700 규칙을 예전 자리(496행 근처 블록)로 돌리면 정말 잡히는가 */
  {
    const 표식 = "@media (max-width:700px){\n  .position-expand-btn";
    ok("(준비) 맨 뒤 700px 더보기 블록 원문을 찾았다", CSS.indexOf(표식) >= 0);
    const 되돌림 = CSS
      .replace(표식, "@media (max-width:700px){\n  .tl-되돌림-더미클래스")
      .replace("  .position-table.expanded .mobile-hide{display:table-cell;}",
        "  .position-table.expanded .mobile-hide{display:table-cell;}\n  .position-expand-btn{display:block;}");
    const r = 좁은게앞_기본(되돌림);
    ok("고치기 전 배치로 되돌리면 더보기 버튼 사고가 다시 잡힌다",
      r.some((x) => /^\.position-expand-btn\b/.test(x)),
      r.filter((x) => /position-expand/.test(x)).join(" / ") || "아무것도 안 잡힘");
  }
}

/* =========================================================================
 * 6) 돌연변이 - 일부러 되돌리면 정말 실패하는가
 *    style.css 파일은 건드리지 않습니다. 읽어온 문자열만 바꿔 봅니다.
 * ========================================================================= */
console.log("\n  [돌연변이] 되돌리면 정말 잡히는가");
{
  /* (가) 진짜 사고 되돌리기 - 맨 뒤 400 메뉴 규칙을 505행 블록으로 되돌린다.
         고치기 전 style.css 와 같은 배치가 되므로, 이걸 못 잡으면 이 테스트는
         "이번 버그를 잡을 수 있었는가" 에 답하지 못합니다. */
  {
    const 뒤규칙 = ".top-banner-nav-btn{padding:8.5px 5px;font-size:13px;}";
    ok("(준비) 맨 뒤 400 메뉴 규칙 원문을 찾았다", CSS.indexOf(뒤규칙) >= 0);
    const 되돌림 = CSS
      .replace(뒤규칙, "/* 여기서 빼서 505행으로 되돌림 */")
      .replace("  .stats-bar{gap:10px;}",
        "  .stats-bar{gap:10px;}\n  .top-banner-nav-btn{padding:8.5px 8px;font-size:13px;}");
    const r = 좁은게앞_미디어(되돌림);
    const 새 = r.filter((x) => 기준선_미디어.map(열쇠).indexOf(열쇠(x)) < 0);
    ok("고치기 전 배치로 되돌리면 'TL 마켓' 사고가 새 역전으로 잡힌다",
      새.some((x) => /^\.top-banner-nav-btn\b/.test(x) && /<=400px/.test(x) && /<=520px/.test(x)),
      새.join(" / ") || "아무것도 안 잡힘");
  }

  /* (나) 새 규칙을 잘못된 자리에 끼워 넣는다 - 앞으로 가장 흔할 실수 */
  {
    const 머리 = "@media (max-width:520px){\n  .menu-bar-inner{padding:0 4px;}";
    const 오염 = CSS.replace(머리,
      "@media (max-width:360px){\n  .board-search-row input{min-width:0;}\n}\n" + 머리);
    ok("(준비) 520 블록 머리를 찾았다", 오염 !== CSS);
    const r = 좁은게앞_미디어(오염);
    const 새 = r.filter((x) => 기준선_미디어.map(열쇠).indexOf(열쇠(x)) < 0);
    ok("360 규칙을 400 규칙보다 앞에 끼워 넣으면 잡힌다",
      새.some((x) => /board-search-row input/.test(x)), 새.join(" / ") || "아무것도 안 잡힘");
  }

  /* (다) 맨 뒤에 기본 규칙을 덧붙인다 - "덧붙이다 좁은 화면이 죽는" 모양 */
  {
    const r = 좁은게앞_기본(CSS + "\n.top-banner-nav-btn{padding:20px 22px;}\n");
    const 새 = r.filter((x) => 기준선_기본.map(열쇠).indexOf(열쇠(x)) < 0);
    ok("맨 뒤에 기본 .top-banner-nav-btn padding 을 덧붙이면 잡힌다",
      새.some((x) => /^\.top-banner-nav-btn\b/.test(x)), 새.join(" / ") || "아무것도 안 잡힘");
  }

  /* (라) min-width 쪽을 뒤집는다 */
  {
    /* .page-right .up-nick 은 @media (min-width:1800px) 안에 있습니다(2045행).
       그 뒤에 더 헐거운 1200 이상 규칙을 붙이면 1800 쪽이 죽습니다. */
    const r = 좁은게앞_민폭(CSS + "\n@media (min-width:1200px){.page-right .up-nick{font-size:9px;}}\n");
    ok("넓은 화면 전용(1800 이상) 뒤에 1200 이상을 붙이면 잡힌다",
      r.some((x) => /up-nick/.test(x)), r.join(" / ") || "아무것도 안 잡힘");
  }

  /* (마) 아무것도 안 바꾸면 통과 - 오탐이 없는지 */
  {
    ok("그대로 두면 새 역전이 0 이다",
      좁은게앞_미디어(CSS).filter((x) => 기준선_미디어.map(열쇠).indexOf(열쇠(x)) < 0).length === 0 &&
      좁은게앞_기본(CSS).filter((x) => 기준선_기본.map(열쇠).indexOf(열쇠(x)) < 0).length === 0);
  }
}

/* =========================================================================
 * 7) 수정 금지 파일 12개 - 이 작업으로 건드리지 않았다
 *    (문자열로 세지 않고 md5 로 봅니다. 주석에 파일명이 적혀 있어 오탐이 납니다)
 * ========================================================================= */
console.log("\n  [수정 금지] 12개 파일 해시");
{
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
    "chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
    "season.js": "9c5fbf13ced09ca2f348e48f87c78224",
    "board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
    "orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "chart.js": "02ddcb000d577131f797143d08c09123",
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e"
  };
  let 맞음 = 0;
  for (const f of Object.keys(기준)) {
    const p = path.join(REPO, "js", f);
    const h = fs.existsSync(p)
      ? crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex") : "(없음)";
    if (h === 기준[f]) 맞음++;
    else console.log("      x js/" + f + " - " + h);
  }
  ok("수정 금지 파일 12개가 전부 그대로다", 맞음 === 12, 맞음 + "/12");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
