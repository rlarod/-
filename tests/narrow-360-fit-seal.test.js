/* tests/narrow-360-fit-seal.test.js
 * 2026-08-26 에 고친 "360px 잘림 4건" 이 되돌아가지 못하게 못 박습니다.
 *
 * ── 그날 무슨 일이 있었나 (본부장 라이브 실측) ────────────────────────
 *   메뉴 밀기 힌트   확정 팔레트 밖 색(#0F4C82) 파란 띠  ->  var(--surface2) = #0D1422
 *   360 메뉴         'TL 마켓' 이 35.3px 잘림            ->  여유 19.7px, 6개 전부 읽힘
 *   게시판 검색문구  14.1px 모자람                       ->  여유 11.9px
 *   채팅 안내문구     8.3px 넘침                          ->  여유  7.3px
 *
 *   폭별 메뉴 여유 - 360:19.7 / 375:34.7 / 390:49.7 / 768:83.3 / 1440:645.3 / 1920:1125.3
 *
 * 잘림을 **문구를 줄이거나 글자를 작게 해서** 푼 것이 아닙니다.
 * 여백만 줄여서 풀었습니다. 그래서 이 파일은 "여백이 다시 커졌는가" 와
 * "문구·글자·메뉴 개수가 줄었는가" 를 둘 다 봅니다.
 *
 * ⚠️ 글자 크기 바닥이 왜 있나 - 2026-08-25 에 메뉴 글자를 작게 했다가
 *    대표가 "글씨 너무 작다" 고 해서 전부 되돌렸습니다. 같은 일이 또 벌어지지
 *    않게 바닥을 박습니다. 더 작게 하려면 대표 확인이 먼저입니다.
 *
 * ── ★2026-09-04 갱신 — "정확히 13px" 을 버리고 "들어가는가" 로 바꿨습니다★ ──
 *    아래 [4] 는 원래 `=== "13px"` 한 줄이었습니다. 두 가지가 문제였습니다.
 *      (1) 대표 지시(글씨 17px 바닥)에 따라 15px 로 올릴 참인데 그 자리가 빨개집니다
 *      (2) ★위로 올리는 것을 아무것도 못 막습니다.★ 17px 로 올리면 글자가 서로
 *          붙거나 두 줄이 되는데 "정확히 13px" 검사는 그냥 빨개질 뿐,
 *          ★왜 안 되는지★ 를 말해 주지 못합니다.
 *    그래서 숫자를 못 박는 대신 ★360 에서 메뉴 6개가 한 줄에 읽히게 들어가는가★
 *    를 잽니다. 자세한 근거는 [4] 머리말에 있습니다.
 *
 * ── 짝이 되는 파일 ────────────────────────────────────────────────────
 *   tests/media-cascade-order.test.js  - 좁은 화면 규칙이 넓은 규칙에 덮이는 것
 *   tests/css-duplicate-rules.test.js  - 같은 미디어쿼리 안의 중복
 *
 * 되돌리기: 이 파일은 새로 만든 것이 아니라 갱신입니다. 새 파일이 아니므로 git rm 이 아닙니다.
 *           git checkout 43f8166~1 -- tests/narrow-360-fit-seal.test.js
 *           ⚠️ 2026-09-07 정정 — 원래 "git checkout HEAD -- …" 였습니다.  설명용·안내아님
 *              이미 커밋된 뒤라 HEAD 에 갱신된 판이 들어 있어 ★아무것도 안 되돌아갑니다★
 *              (종료코드 0 · git status 깨끗 · 조용한 고장).
 *              이 파일을 갱신한 커밋이 43f8166 이라 그 하나 앞을 꺼냅니다.
 *              (윗줄의 옛 안내 글자는 설명용·안내아님 표식으로 봉인에서 빼둡니다)
 *
 *           ⚠️ ★style.css 를 42cd474 이전으로 되돌리려면 이 파일도 같이 내려야 합니다.★
 *              (401~700 이 13.5px 으로 돌아가면 아래 둘이 빨개집니다)
 *                1. [4](가-2) 밴드 표 두 번째 줄  `바닥: 바닥` → `바닥: 13`
 *                2. [4](마) 역전 검사 — 320~400 은 15px 인데 401~700 이 13.5px 이면
 *                   그게 바로 역전이라 반드시 잡힙니다. 되돌리려면 이 검사도 함께
 *                   꺼야 합니다. ★끄기 전에 "왜 다시 역전을 허용하는지" 를 적으세요.★
 *              style.css 491행 주석의 되돌리기 안내에는 이 두 줄이 빠져 있습니다
 *              (기록팀이 tests/ 밖을 못 고쳐서 여기에 적어 둡니다).
 *
 * style.css 와 index.html 은 읽기만 합니다. 아무것도 고치지 않습니다.
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

const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const 주석없는CSS = CSS.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

console.log("\n360px 잘림 4건 봉인");

/* =========================================================================
 * 0) 아주 작은 CSS 읽기 + "이 폭에서 실제로 먹는 값" 계산기
 *    잘림 사고는 "규칙이 있느냐" 가 아니라 "그 폭에서 그 값이 이기느냐" 라
 *    문자열 검색만으로는 못 지킵니다. 그래서 폭을 넣으면 최종값을 돌려줍니다.
 * ========================================================================= */
/* 같은 글자열을 두 번 읽지 않게 기억해 둡니다 (2026-09-07).
   style.css 한 번 읽는 데 163ms 인데 이 파일이 60번 넘게 읽어서 17.7초가 걸렸습니다.
   ⚠️ 결과를 고쳐 쓰는 곳이 하나도 없어서 안전합니다. 나중에 결과를 고쳐 쓰게 되면
      ★이 기억을 먼저 지우세요★ - 앞 검사의 흔적이 뒤 검사로 새어 갑니다.
   기억을 지워도 검사 결과는 똑같아야 합니다(느려질 뿐입니다). */
const 규칙기억 = new Map();
function 규칙들(cssText) {
  if (규칙기억.has(cssText)) return 규칙기억.get(cssText);
  const r = 규칙들_계산(cssText);
  규칙기억.set(cssText, r);
  return r;
}
function 규칙들_계산(cssText) {
  const c = cssText.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  const list = [], ctx = [];
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
      const line = c.slice(0, i).split("\n").length;
      for (const sel of head.split(",").map((s) => s.trim()).filter(Boolean)) {
        list.push({ media: ctx.slice(), sel: sel, body: body, line: line });
      }
      i = j - 1;
      continue;
    } else if (ch === "}") { if (ctx.length) ctx.pop(); buf = ""; continue; }
    buf += ch;
  }
  return list;
}

/* 괄호 안의 쉼표·공백은 건드리지 않고 선언을 나눕니다 (clamp(...) 때문에 필요) */
function 선언들(body) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === ";" && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean).map((s) => {
    const k = s.indexOf(":");
    if (k < 0) return null;
    return { 속성: s.slice(0, k).trim().toLowerCase(), 값: s.slice(k + 1).trim() };
  }).filter(Boolean);
}

/* 괄호를 지키며 공백으로 나눕니다 - padding 줄임말을 낱개로 펼칠 때 씁니다 */
function 공백나누기(v) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of v) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) { if (cur) out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
function 펼치기(속성, 값) {
  const 방향 = { padding: "padding", margin: "margin" }[속성];
  if (!방향) return [{ 속성: 속성, 값: 값 }];
  const p = 공백나누기(값);
  const [t, r, b, l] =
    p.length === 1 ? [p[0], p[0], p[0], p[0]] :
    p.length === 2 ? [p[0], p[1], p[0], p[1]] :
    p.length === 3 ? [p[0], p[1], p[2], p[1]] : [p[0], p[1], p[2], p[3]];
  return [
    { 속성: 방향 + "-top", 값: t }, { 속성: 방향 + "-right", 값: r },
    { 속성: 방향 + "-bottom", 값: b }, { 속성: 방향 + "-left", 값: l }
  ];
}

/* 이 폭에서 @media 조건이 맞는가 (max-width / min-width / and 조합만) */
function 폭에맞나(mediaArr, w) {
  for (const m of mediaArr) {
    if (!/^@media/.test(m)) return false;              /* @supports 등은 안 다룹니다 */
    if (/,/.test(m)) return false;
    let 하나라도 = false;
    const mx = m.match(/max-width\s*:\s*(\d+(?:\.\d+)?)px/);
    const mn = m.match(/min-width\s*:\s*(\d+(?:\.\d+)?)px/);
    if (mx) { 하나라도 = true; if (!(w <= parseFloat(mx[1]))) return false; }
    if (mn) { 하나라도 = true; if (!(w >= parseFloat(mn[1]))) return false; }
    if (!하나라도) return false;
    if (/data-theme|hover|print/.test(m)) return false;
  }
  return true;
}

/* 선택자 문자열이 정확히 같은 규칙만 봅니다(특이도 계산은 하지 않습니다).
   그래서 "이 값이 확실히 이긴다" 가 아니라 "같은 선택자 안에서 마지막 값" 입니다.
   우리가 지키려는 것이 전부 같은 선택자의 값이라 이걸로 충분합니다. */
function 적용값(cssText, 선택자, 폭) {
  const 결과 = {};
  for (const r of 규칙들(cssText)) {
    if (r.sel !== 선택자) continue;
    if (!폭에맞나(r.media, 폭)) continue;
    for (const d of 선언들(r.body)) for (const x of 펼치기(d.속성, d.값)) 결과[x.속성] = x.값;
  }
  return 결과;
}

/* 표준 점검 폭 6개 */
const 폭6 = [360, 375, 390, 768, 1440, 1920];

/* =========================================================================
 * 1) 자체검증 - 계산기가 진짜 맞게 도는가
 * ========================================================================= */
console.log("\n  [자체검증] 폭별 최종값 계산기");
{
  const 샘플 =
    ".a{padding:20px 22px;font-size:26px;}\n" +
    "@media (max-width:520px){.a{padding-left:7px;padding-right:7px;}}\n" +
    "@media (max-width:400px){.a{padding:8.5px 5px;font-size:13px;}}\n";
  ok("360 에서는 400 이하 규칙이 이긴다", 적용값(샘플, ".a", 360)["padding-left"] === "5px",
    JSON.stringify(적용값(샘플, ".a", 360)));
  ok("402 에서는 520 이하 규칙이 이긴다", 적용값(샘플, ".a", 402)["padding-left"] === "7px");
  ok("1440 에서는 기본 규칙이 남는다", 적용값(샘플, ".a", 1440)["padding-left"] === "22px");
  ok("padding 줄임말을 낱개로 펼친다", 적용값(".a{padding:1px 2px 3px 4px;}", ".a", 999)["padding-bottom"] === "3px");
  ok("clamp() 안의 쉼표에 속지 않는다",
    적용값(".a{padding:clamp(10px, 0.5vw, 18px) clamp(11px, 0.55vw, 18px);}", ".a", 999)["padding-right"]
      === "clamp(11px, 0.55vw, 18px)");
  ok("두 값 padding 은 위/아래, 좌/우로 펼친다",
    적용값(".a{padding:9px 0;}", ".a", 999)["padding-left"] === "0");
  ok("순서가 뒤집히면(넓은 것이 뒤) 좁은 값이 죽는 것도 그대로 계산한다",
    적용값("@media (max-width:400px){.a{padding-left:5px;}}\n@media (max-width:520px){.a{padding-left:10px;}}",
      ".a", 360)["padding-left"] === "10px");
}

/* =========================================================================
 * 2) 확정 팔레트 - #0F4C82 가 다시 들어오지 않는다
 *    주석에 적힌 것은 통과시킵니다(사고 기록이라 남겨 둡니다).
 * ========================================================================= */
console.log("\n  [2] 확정 팔레트 밖의 색이 규칙에 다시 들어오지 않는다");
{
  ok("주석을 뺀 style.css 에 #0F4C82 가 없다",
    !/0f4c82/i.test(주석없는CSS),
    "남아 있는 자리: " + (주석없는CSS.split(/\r?\n/)
      .map((l, i) => (/0f4c82/i.test(l) ? (i + 1) + "행" : null)).filter(Boolean).join(", ")));

  ok("주석에는 남아 있어도 된다 - 실제로 사고 기록이 1곳 남아 있다",
    (CSS.match(/0F4C82/gi) || []).length >= 1,
    "사고 기록까지 지워지면 왜 파랬는지 아무도 모르게 됩니다");

  /* 자체검증 - 주석/규칙을 가려내는가 */
  ok("(자체검증) 규칙 안의 색은 잡고 주석 안의 색은 안 잡는다",
    /0f4c82/i.test(".a{background:#0F4C82;}".replace(/\/\*[\s\S]*?\*\//g, "")) &&
    !/0f4c82/i.test("/* 옛 배경 #0F4C82 */".replace(/\/\*[\s\S]*?\*\//g, "")));

  /* 메뉴 바 구역 전체를 확정 팔레트로 묶어 둡니다.
   *
   * 예외 2곳 - #1769B3 (밝은 파랑).
   *   .menu-bar 와 .menu-bar-inner::after 의 **밝은 모드용 기본값**입니다.
   *   레퍼런스에서 실측한 rgb(23,105,179) 라 원래 규칙은 그대로 두고,
   *   다크 전용 규칙(html[data-theme="dark"] ...)에서 #0D1422 / var(--surface2)
   *   로 덮습니다. 이 사이트는 다크 하나로만 운영하므로 회원 눈에는 안 보입니다.
   *   ⚠️ #0F4C82 사고는 여기가 아니라 **다크 규칙 쪽**에서 났습니다.
   *      배경만 낮추고 힌트가 안 따라와서 파란 띠가 남았습니다.
   *      그래서 다크 규칙에는 예외를 하나도 두지 않습니다.
   */
  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5",
    "#838DA4", "#26C281", "#F0506E", "#F0B429", "#20D68C", "#FFFFFF", "#FFF", "#000"];
  const 밝은모드_예외 = ["#1769B3"];
  const 메뉴규칙 = 규칙들(CSS).filter((r) => /menu-bar|top-banner-nav-btn/.test(r.sel));
  const 이상한색 = [], 다크_이상한색 = [];
  for (const r of 메뉴규칙) {
    const 다크 = /data-theme="dark"/.test(r.sel) || r.media.some((m) => /data-theme="dark"/.test(m));
    for (const h of (r.body.match(/#[0-9a-fA-F]{3,8}\b/g) || [])) {
      const H = h.toUpperCase();
      if (팔레트.indexOf(H) >= 0) continue;
      const 자리 = r.sel + " @" + r.line + "행 " + h;
      if (다크) 다크_이상한색.push(자리);
      else if (밝은모드_예외.indexOf(H) < 0) 이상한색.push(자리);
    }
  }
  console.log("    메뉴 바 관련 규칙 " + 메뉴규칙.length + "개를 훑었습니다 (밝은 모드 예외 " +
    밝은모드_예외.join(",") + ")");
  ok("다크 메뉴 규칙에 확정 팔레트 밖의 색이 하나도 없다 - 사고가 난 자리입니다",
    다크_이상한색.length === 0, 다크_이상한색.join(" / "));
  ok("밝은 모드 메뉴 규칙에도 알려진 것(#1769B3) 말고 새 색이 없다",
    이상한색.length === 0, 이상한색.join(" / "));

  /* 밀기 힌트는 배경이 또 바뀌어도 따라오게 변수로 씁니다 */
  const 힌트 = 규칙들(CSS).filter((r) => r.sel === 'html[data-theme="dark"] .menu-bar-inner::after')[0];
  ok("다크 메뉴 밀기 힌트 규칙이 있다", !!힌트);
  ok("밀기 힌트가 색을 직접 적지 않고 var(--surface2) 를 쓴다",
    !!힌트 && /var\(--surface2\)/.test(힌트.body) && !/#0[fF]4[cC]82/.test(힌트.body),
    힌트 ? 힌트.body.trim() : "");
}

/* =========================================================================
 * 3) 좁은 화면에서 안내문구가 안 잘린다
 *    실측(360px, 다크) - 게시판 검색  안내문구 136.1px / 입력칸 안쪽 122px
 *                        채팅 입력    안내문구 238.7px / 입력칸 안쪽 230.4px
 * ========================================================================= */
console.log("\n  [3] 좁은 화면에서 안내문구가 안 잘린다");
{
  /* (가) 게시판 검색칸 - 고정폭으로 되돌아가면 실패 */
  const 검색360 = 적용값(CSS, ".board-search-row input", 360);
  const 검색1440 = 적용값(CSS, ".board-search-row input", 1440);
  console.log("    .board-search-row input @360 = " + JSON.stringify(검색360));
  ok("360 에서 검색칸이 고정폭이 아니다 (width:auto)", 검색360["width"] === "auto",
    "지금 값: " + 검색360["width"]);
  ok("360 에서 검색칸이 남는 폭을 받는다 (flex:1 1 auto)", 검색360["flex"] === "1 1 auto",
    "지금 값: " + 검색360["flex"]);
  ok("360 에서 검색칸이 줄어들 수 있다 (min-width:0)", 검색360["min-width"] === "0",
    "지금 값: " + 검색360["min-width"]);
  ok("1440 에서는 예전 고정폭 min(340px,40vw) 그대로다 (넓은 화면은 안 건드렸습니다)",
    /min\(340px/.test(검색1440["width"] || ""), "지금 값: " + 검색1440["width"]);

  const 검색버튼360 = 적용값(CSS, ".board-search-row button", 360);
  ok("360 에서 '검색' 버튼이 눌리지 않게 고정이다 (flex:0 0 auto)",
    검색버튼360["flex"] === "0 0 auto", "지금 값: " + 검색버튼360["flex"]);
  ok("360 에서 '검색' 글자가 줄바꿈되지 않는다 (white-space:nowrap)",
    검색버튼360["white-space"] === "nowrap", "지금 값: " + 검색버튼360["white-space"]);

  /* (나) 채팅 입력줄 - 여백이 커지면 실패 */
  const px = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v || "").trim()); return m ? parseFloat(m[1]) : NaN; };
  const 줄360 = 적용값(CSS, ".page-right .chat-input-row", 360);
  const 칸360 = 적용값(CSS, ".page-right .chat-input-row input", 360);
  const 버튼360 = 적용값(CSS, ".page-right .chat-input-row button", 360);
  console.log("    채팅 입력줄 @360 - 줄 좌우 " + 줄360["padding-left"] + "/" + 줄360["padding-right"] +
    ", 입력칸 좌우 " + 칸360["padding-left"] + ", 버튼 좌우 " + 버튼360["padding-left"]);

  ok("360 에서 채팅 입력줄 좌우 여백이 8px 이하다 (예전 clamp 최소 10px)",
    px(줄360["padding-left"]) <= 8 && px(줄360["padding-right"]) <= 8,
    줄360["padding-left"] + " / " + 줄360["padding-right"]);
  ok("360 에서 채팅 입력칸 좌우 여백이 10px 이하다 (예전 12px)",
    px(칸360["padding-left"]) <= 10 && px(칸360["padding-right"]) <= 10,
    칸360["padding-left"] + " / " + 칸360["padding-right"]);
  ok("360 에서 '전송' 버튼 좌우 여백이 12px 이하다 (예전 16px)",
    px(버튼360["padding-left"]) <= 12 && px(버튼360["padding-right"]) <= 12,
    버튼360["padding-left"] + " / " + 버튼360["padding-right"]);
  ok("버튼 세로(터치 높이)는 안 줄였다 - 위아래 여백 10px 그대로",
    px(버튼360["padding-top"]) >= 10 && px(버튼360["padding-bottom"]) >= 10,
    버튼360["padding-top"] + " / " + 버튼360["padding-bottom"]);

  const 줄1440 = 적용값(CSS, ".page-right .chat-input-row", 1440);
  ok("1440 에서는 예전 clamp 여백 그대로다 (넓은 화면은 안 건드렸습니다)",
    /clamp\(/.test(줄1440["padding-left"] || ""), "지금 값: " + 줄1440["padding-left"]);

  /* (다) 안내문구 자체를 줄여서 푼 것이 아니다.
     검색 안내문구는 index.html 이 아니라 js/board-paging.js 가 만들어 넣습니다.
     (수정 금지 12개가 아니라 읽어도 됩니다) */
  const BOARDJS = fs.readFileSync(path.join(REPO, "js", "board-paging.js"), "utf8");
  ok("게시판 검색 안내문구가 '검색어를 입력하세요' 그대로다 (실측 136.1px)",
    /placeholder="검색어를 입력하세요"/.test(BOARDJS),
    (BOARDJS.match(/placeholder="[^"]*"/g) || []).join(" / "));
  ok("채팅 안내문구가 '메시지를 입력하세요...' 그대로다 (실측 238.7px)",
    /placeholder="메시지를 입력하세요\.\.\."/.test(HTML),
    (HTML.match(/placeholder="[^"]*입력하세요[^"]*"/g) || []).join(" / "));
  ok("두 안내문구를 한 글자도 줄이지 않았다",
    !/placeholder="검색어"/.test(BOARDJS) && !/placeholder="메시지"/.test(HTML));
}

/* =========================================================================
 * 4) 상단 메뉴 글자 - 바닥과 천장을 같이 잡습니다
 *
 * ── ★왜 여기만 17px 이 아닌가★ (2026-09-04 PM 판단) ─────────────────────
 *   대표가 다섯 번째로 "글씨가 작다" 고 하셔서 화면 글씨 바닥을 17px 로
 *   올리는 중입니다(tests/_font-size.js 및 *-font-floor 봉인들 참조).
 *   ★상단 메뉴 6개만은 17px 이 물리적으로 불가능합니다.★
 *
 *   디자인팀 2026-09-04 실측 - 360px 화면, 메뉴를 담는 칸 안쪽 폭 352px:
 *
 *     현재 13px + 좌우여백 5px   총폭 321.9px   여유 +20.1
 *     15px + 여백 3px           총폭 334.7px   여유  +6.3   ← PM 이 고른 안
 *     16px + 여백 2px           총폭 342.6px   넘침   0.6   ❌
 *     17px + 여백 5px           총폭 401.6px   넘침  59.6   ❌
 *     17px + 여백 0 + 간격 0    총폭 338.6px   들어가지만 ★글자가 붙어 못 읽음★ ❌
 *
 *   여백을 0 으로 해도 안 됩니다. 두 줄로 늘리면 메뉴 바가 39 -> 76px 이 되는데,
 *   대표가 바로 그날 "차트 위 머리가 너무 크다" 를 지적하신 참이라 정면으로
 *   어긋납니다. 그래서 ★PM 이 15px 로 정했습니다 - 17px 바닥 규칙의 예외입니다.★
 *
 *   ⚠️ 다음 사람에게: 여기를 17px 로 올리지 마세요. 올리면 이 파일이 빨개지는데
 *      그건 봉인이 낡아서가 아니라 ★진짜로 안 들어가서★ 입니다.
 *
 * ── ★임시 상태가 끝났습니다 (2026-09-07)★ ────────────────────────────
 *   2026-09-04 에는 봉인을 먼저 갱신하고 디자인팀이 CSS 를 고치는 순서라,
 *   그날의 style.css 는 아직 13px 이었습니다. 그래서 바닥을 13 으로 두어
 *   13px 과 15px 을 둘 다 통과시키는 ★임시★ 상태였고, 여기에
 *   "15px 이 들어오면 올리세요" 라고 적어 두었습니다.
 *
 *   ★그 15px 이 실제로 들어왔습니다.★
 *     커밋   08e93b0  "fix: 상단 메뉴 13 → 15px — 폰 첫 화면 잔글씨가 0개가 됐습니다"
 *     날짜   2026-09-04
 *     근거   대표 지시 ("팝업창 글씨는 아직 작다" 계열의 다섯 번째 지시)
 *     자리   style.css 4905행 @media(max-width:400px)
 *            .top-banner-nav-btn{padding:8.5px 3px;font-size:15px;}
 *
 *   그래서 2026-09-07 에 바닥을 ★13 → 15★ 로 올렸습니다.
 *   변수 이름에서도 `_임시` 를 뗐습니다(`바닥` → `바닥`) — 더 이상 임시가
 *   아닙니다. 이름에 임시가 남아 있으면 다음 사람이 또 낮춰도 되는 값으로 읽습니다.
 *
 *   ⚠️ 13 인 동안에는 ★누가 다시 13px 로 내려도 이 봉인이 안 잡았습니다.★
 *      그게 이 갱신의 전부입니다. 아래 [돌연변이] (하) 가 그것을 증명합니다.
 *
 *
 * ── ★2026-09-07 (2) — 401~700 도 15 로 잠갔습니다. 조건이 충족됐습니다★ ──
 *   같은 날 오전에 이 파일은 이렇게 적혀 있었습니다 —
 *     "401~1920 의 바닥은 예전 값 13 그대로 둡니다. 디자인팀의 401~700 15px 이
 *      게이트 2 를 통과해 커밋되면 밴드 표 두 번째 줄을 15 로 올리세요."
 *
 *   ★그 15px 이 실제로 커밋됐습니다.★
 *     커밋   42cd474  "fix: 더 큰 폰이 더 작은 글씨였던 것 — 401~700 구간 13.5 → 15px"
 *     날짜   2026-09-07
 *     자리   style.css 491행  @media(max-width:700px)
 *            .top-banner-nav-btn{padding:8.5px 10px;font-size:15px;}   (13.5px → 15px)
 *            style.css 3512행 새 블록 @media(min-width:401px) and (max-width:520px)
 *            .top-banner-nav{gap:0px;}   ← 401px 에서 모자란 0.7px 을 여기서 법니다
 *     PM 실측 401 여유 9.3 / 402 여유 10.3 / 412 여유 20.3 / 이웃 글자 사이 14px
 *
 *   그래서 밴드 2 의 바닥을 ★13 → 15★ 로 올렸습니다.
 *   ⚠️ 13 인 동안에는 ★누가 401~700 을 다시 13.5px 로 내려도 이 봉인이 초록★ 이었습니다.
 *      08e93b0 뒤 사흘 동안 360 구간이 그랬던 것과 ★똑같은 구조★ 입니다.
 *      아래 [돌연변이] (하-2) 가 그것을 증명합니다.
 *
 * ── ★밴드가 2개에서 3개가 됐습니다 — 경계를 CSS 에서 다시 셌습니다★ ──────
 *   "밴드 표가 CSS 와 조용히 어긋나 있는 것" 이 이번에 사흘을 놓친 진짜 원인이라,
 *   경계를 손으로 적지 않고 ★CSS 에서 이기는 규칙이 바뀌는 폭을 세어 대조★ 합니다
 *   (아래 [4](가-1)). 지금 실측한 경계는 401 과 701 두 곳뿐입니다.
 *
 *     320~400px    15px   style.css 4905행 @media(max-width:400px)      08e93b0
 *     401~700px    15px   style.css  491행 @media(max-width:700px)      ★42cd474★
 *     701~1920px   26px   style.css  159행 (미디어 없는 기본 규칙)
 *
 *   ⚠️ 701~ 을 "26px" 로 못 박지는 않습니다. 넓은 화면 디자인까지 이 봉인이
 *      잠글 이유가 없습니다. 세 밴드 모두 ★바닥 15★ 만 둡니다 —
 *      "어느 폭에서도 15px 밑으로는 안 내려간다" 하나로 통일했습니다.
 *
 * ── ★역전 금지 — 이번 버그를 유형째로 막습니다 (2026-09-07)★ ────────────
 *   42cd474 가 고친 것은 "13.5px 이라서" 가 아니라 ★더 넓은 폰이 더 작은 글씨★
 *   였기 때문입니다. 바닥 숫자만 올리면 같은 유형이 다른 구간에서 또 납니다.
 *   그래서 [4](마) 에서 320~1920 을 훑어 ★폭이 넓어지는데 글자가 작아지는 자리★
 *   가 하나라도 있으면 실패시킵니다. 지금은 15 → 15 → 26 이라 역전 0곳입니다.
 *
 * ── ★521~700 은 실측표에 없던 구간입니다 (PM 지적, 2026-09-07)★ ─────────
 *   `gap:0px` 은 401~520 에만 걸립니다. 521~700 은 gap 2px 그대로인데 15px 이
 *   들어갑니다. 디자인팀 실측표에 이 구간이 한 줄도 없어서 직접 계산했습니다.
 *     521px  글자 15 / 여백 10·10 / gap 2 / 담는칸 505 / 총폭 426.8 → ★여유 78.2px★
 *     700px  같은 조합 / 담는칸 684 → 여유 257.2px, 이웃 글자 사이 22px
 *   ★521 에서 갑자기 여백이 7 → 10px 으로 넓어져(520 규칙이 끊김) 오히려 여유가
 *     늘어납니다.★ 위험 구간이 아니었습니다. 그래도 봉인이 안 보고 있었으므로
 *   [4](다-2) 에서 360~700 을 ★1px 씩 전부★ 재도록 넓혔습니다.
 *
 * ── 천장은 숫자가 아니라 "들어가는가" 로 잽니다 ─────────────────────────
 *   숫자로 못 박으면 여백·간격을 바꿔 우회할 수 있습니다. 그래서 실제 폭을 셉니다.
 *
 *     총폭 = 글자폭(F) + 버튼 좌우여백 합 + 버튼 사이 간격 합
 *     담는칸 = 화면폭 - .menu-bar-inner 좌우 여백
 *
 *   ★글자폭은 지어내지 않고 디자인팀 실측을 그대로 씁니다.★
 *   위 표 마지막 줄 - 17px 에서 여백·간격을 0 으로 두고 잰 순수 글자폭 338.6px.
 *   글자폭은 글자 크기에 비례하므로  글자폭(F) = 338.6 x F / 17.
 *
 *   ⚠️ 이 실측값은 ★아래 [5] 가 지키는 그 6개 라벨★ 에만 유효합니다.
 *      라벨이 바뀌면 [5] 의 문구 검사가 먼저 빨개집니다. 여기서도 한 번 더 봅니다.
 *
 *   여백은 CSS 에서 읽습니다. ★첫 버튼 왼쪽만 8px 로 다릅니다★ -
 *   `.top-banner-nav > .top-banner-nav-btn:first-child{padding-left:8px}` 의
 *   특이도가 (0,3,0) 이라 미디어쿼리 안의 `.top-banner-nav-btn` (0,1,0) 을 이깁니다.
 *
 *   ⚠️ ★디자인팀 표의 "여유 +6.3" 은 이 8px 을 안 센 값입니다.★
 *      세면 15px 안의 실제 여유는 ★2.2px★ 입니다. 통과는 하지만 아슬아슬합니다.
 *      여기서 여백을 1px 만 더 늘려도 넘칩니다. PM 에게 보고했습니다.
 *
 *   모델 검증 - 위 표 5줄을 이 식으로 다시 계산하면 실측과 이렇게 맞습니다.
 *     13px  여유 +20.1  <- 디자인팀 실측 +20.1 과 ★정확히 일치★
 *     17px  넘침  59.6  <- 디자인팀 실측  59.6 과 ★정확히 일치★
 *     402px 여유 +30.1  <- style.css 3497행 주석의 "여유 약 29px" 와 맞음
 *   들어감/넘침 판정은 5줄 전부 실측과 같습니다. 아래 [자체검증] 이 이걸 돕니다.
 * ========================================================================= */
/* 2026-09-04 에는 13(임시)이었습니다. 디자인팀 15px 이 08e93b0 으로 들어와
   2026-09-07 에 15 로 올리고 이름에서 `_임시` 를 뗐습니다. 위 머리글 참조. */
const 바닥 = 15;        /* 320~400px 에서 메뉴 글자가 이 밑으로 내려가면 안 됩니다 */
const 목표_글자 = 15;   /* PM 이 정한 값. 17px 예외 */
const 간격바닥 = 8;     /* 이웃한 두 메뉴 글자 사이 최소 거리. 15px 안의 값이 정확히 8 입니다 */

/* 디자인팀 2026-09-04 실측 - 17px, 버튼 여백 0, 간격 0 에서 메뉴 6개 글자만 338.6px */
const 실측_글자폭_17px = 338.6;
const 실측_라벨 = "선물거래|커뮤니티|랭킹|TL 핫딜|마이페이지|TL 마켓";

function pxv(v) {
  const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v || "").trim());
  return m ? parseFloat(m[1]) : NaN;
}
function 글자폭(F) { return 실측_글자폭_17px * F / 17; }

/* 이 폭에서 메뉴가 실제로 몇 px 을 차지하는가 */
function 메뉴재기(css, w) {
  const 버튼 = 적용값(css, ".top-banner-nav-btn", w);
  const 첫버튼 = 적용값(css, ".top-banner-nav > .top-banner-nav-btn:first-child", w);
  const 줄 = 적용값(css, ".top-banner-nav", w);
  const 칸 = 적용값(css, ".menu-bar-inner", w);

  const F = pxv(버튼["font-size"]);
  const pl = pxv(버튼["padding-left"]), pr = pxv(버튼["padding-right"]);
  /* 첫 버튼 왼쪽 여백은 특이도가 더 높은 규칙이 이깁니다. 없으면 일반값을 씁니다 */
  const 첫왼 = isNaN(pxv(첫버튼["padding-left"])) ? pl : pxv(첫버튼["padding-left"]);
  /* gap:2px / gap:10px 16px - 가로 간격은 마지막 값입니다 */
  const g = pxv(String(줄["gap"] || "").trim().split(/\s+/).pop());
  const 칸왼 = pxv(칸["padding-left"]), 칸오 = pxv(칸["padding-right"]);

  const 개수 = 6;                                    /* [5] 가 6개를 지킵니다 */
  const 여백합 = 개수 * (pl + pr) - pl + 첫왼;        /* 첫 버튼 왼쪽만 갈아 끼웁니다 */
  const 간격합 = (개수 - 1) * g;
  const 총폭 = 글자폭(F) + 여백합 + 간격합;
  const 담는칸 = w - 칸왼 - 칸오;
  return {
    F: F, pl: pl, pr: pr, 첫왼: 첫왼, gap: g,
    총폭: 총폭, 담는칸: 담는칸, 여유: 담는칸 - 총폭,
    이웃간격: pr + g + pl                             /* 옆 메뉴 글자와 떨어진 거리 */
  };
}

/* ── 폭을 1600개 훑기 위한 빠른 계산기 ([4](가-2) 에서 씁니다) ──────────────
   적용값() 은 부를 때마다 style.css 전체를 다시 읽습니다(실측 1회 163ms).
   폭마다 부르면 1600 x 163ms = 4분이 넘어 npm test 가 사실상 멈춥니다.
   그래서 `.top-banner-nav-btn` 의 font-size 규칙만 한 번 추려 놓고 씁니다.
   ⚠️ 빠른 만큼 틀릴 수 있으니, [4](가-2) 첫 줄에서 적용값() 과 답을 맞춰 봅니다. */
function 글자규칙만(css) {
  return 규칙들(css)
    .filter((r) => r.sel === ".top-banner-nav-btn")
    .map((r) => ({ 값: 선언들(r.body).filter((d) => d.속성 === "font-size").pop(), media: r.media, line: r.line }))
    .filter((x) => x.값);
}
/* 이 폭에서 이기는 글자 크기 - 나중에 나온 규칙이 이깁니다(적용값() 과 같은 규칙) */
function 이긴글자(규칙, w) {
  let v = NaN, line = 0;
  for (const r of 규칙) if (폭에맞나(r.media, w)) { v = pxv(r.값.값); line = r.line; }
  return { v: v, line: line };
}
/* 부터~까지 사이에서 바닥 밑으로 내려가는 폭을 전부 돌려줍니다(빈 배열이면 통과) */
function 바닥밑폭(css, 부터, 까지, 바닥값) {
  const 규칙 = 글자규칙만(css), out = [];
  for (let w = 부터; w <= 까지; w++) {
    const r = 이긴글자(규칙, w);
    if (isNaN(r.v) || r.v < 바닥값) out.push(w + "px→" + r.v + "px(style.css " + r.line + "행)");
  }
  return out;
}

console.log("\n  [4] 상단 메뉴 - 바닥은 " + 바닥 + "px, 천장은 '360 에서 한 줄에 읽히는가'");
{
  /* (가) 바닥 - 어느 폭에서도 더 작아지지 않는다 */
  for (const w of 폭6) {
    const v = 적용값(CSS, ".top-banner-nav-btn", w);
    const f = pxv(v["font-size"]);
    console.log("    " + w + "px -> font-size " + v["font-size"] + ", 좌우 여백 " + v["padding-left"] + "/" + v["padding-right"]);
    ok(w + "px 에서 메뉴 글자가 " + 바닥 + "px 이상이다", !isNaN(f) && f >= 바닥, "지금 값: " + v["font-size"]);
  }

  /* (가-2) 폭6 사이의 빈틈 - 새 미디어쿼리로 몰래 낮추는 것 방지.
     ────────────────────────────────────────────────────────────────────────
     ★2026-09-07 에 검사 방식을 바꿨습니다. 왜 바꿔야 했는지 남깁니다.★

     예전에는 "규칙 하나하나의 font-size 값" 을 훑어 바닥보다 작은 게 있으면
     잡았습니다. 바닥이 13 일 때는 style.css 491행의 13.5px 이 통과해서
     아무 문제가 없었는데, 바닥을 15 로 올리자 ★그 13.5px 이 걸렸습니다.★

     그런데 491행은 잘못된 규칙이 아닙니다. @media(max-width:700px) 라
     360px 에서도 "적용은 되지만" 뒤에 오는 4905행 @media(max-width:400px) 의
     15px 에 ★덮여서 죽습니다.★ 살아 있는 것은 401~700px 구간뿐입니다.

     ⚠️ 규칙 값만 훑어서는 "덮여 죽은 13.5" 와 "살아 있는 13.5" 를 구분 못 합니다.
        그래서 값이 아니라 ★그 폭에서 실제로 이기는 값★ 을 폭마다 계산합니다.
        [자체검증] 의 적용값() 계산기가 하던 일을 폭 전체로 넓힌 것입니다.

     이렇게 바꾸면 예전보다 오히려 더 촘촘합니다 - 예전 방식은 규칙을 넣는
     ★순서★ 로 우회할 수 있었지만(뒤에 넣으면 이기는데 값은 바닥 이상),
     지금은 폭마다 이긴 값을 보므로 순서 장난이 통하지 않습니다.

     ★2026-09-07 (2) - 밴드가 2개에서 3개가 됐고 바닥이 전부 15 가 됐습니다.★
     42cd474 로 401~700 이 13.5 → 15px 이 되어, 더 이상 "주제 밖" 이 아닙니다.
     그전까지 여기가 13 이라 ★401~700 을 13.5px 로 되돌려도 초록★ 이었습니다.

     밴드와 그 근거가 되는 CSS 자리:
       320~400   15px  style.css 4905행 @media(max-width:400px)   08e93b0
       401~700   15px  style.css  491행 @media(max-width:700px)   ★42cd474★
       701~1920  26px  style.css  159행 (미디어 없는 기본 규칙)

     ⚠️ 세 밴드 모두 바닥은 ★15★ 하나입니다. 701~ 을 26 으로 못 박지 않는 이유는
        머리글에 적었습니다 - 넓은 화면 디자인까지 잠글 이유가 없습니다.
     ──────────────────────────────────────────────────────────────────────── */
  const 밴드 = [
    { 이름: "320~400px (@max-width:400 · 08e93b0)", 부터: 320, 까지: 400, 바닥: 바닥 },
    { 이름: "401~700px (@max-width:700 · 42cd474)", 부터: 401, 까지: 700, 바닥: 바닥 },
    { 이름: "701~1920px (미디어 없는 기본 26px)", 부터: 701, 까지: 1920, 바닥: 바닥 }
  ];

  /* (가-1) ★밴드 표의 경계가 실제 CSS 와 맞는가★ - 2026-09-07 에 새로 넣었습니다.
     ────────────────────────────────────────────────────────────────────────
     ★이번에 사흘을 놓친 진짜 원인은 13 이라는 숫자가 아니라, 밴드 표가 CSS 와
       조용히 어긋나 있는데 아무도 몰랐던 것입니다.★ 손으로 적은 경계는 CSS 가
     바뀌어도 안 따라옵니다. 그래서 경계를 ★세어서★ 대조합니다.

     "이기는 규칙(줄 번호)이 바뀌는 폭" 을 320~1920 에서 전부 찾아, 밴드 표의
     시작점과 글자 하나까지 같은지 봅니다. 누가 새 미디어쿼리를 넣으면 경계가
     늘어나 여기가 빨개지고, ★"밴드 표를 갱신하세요" 라고 말해 줍니다.★
     ──────────────────────────────────────────────────────────────────────── */
  {
    const 규칙 = 글자규칙만(CSS);
    const 경계 = [];
    let 앞줄 = null;
    for (let w = 320; w <= 1920; w++) {
      const r = 이긴글자(규칙, w);
      if (앞줄 !== null && r.line !== 앞줄) 경계.push(w);
      앞줄 = r.line;
    }
    const 밴드시작 = 밴드.slice(1).map((b) => b.부터);
    console.log("    이기는 규칙이 바뀌는 폭: " + (경계.join(", ") || "없음") +
      "  /  밴드 표의 경계: " + 밴드시작.join(", "));
    ok("밴드 표의 경계가 style.css 에서 실제로 규칙이 바뀌는 폭과 같다 (다르면 표를 갱신하세요)",
      경계.join(",") === 밴드시작.join(","),
      "CSS 경계 [" + 경계.join(",") + "] vs 밴드 표 [" + 밴드시작.join(",") + "] - " +
      "style.css 에 미디어쿼리가 새로 생겼거나 없어졌습니다. 밴드 표를 다시 세세요");
    ok("밴드 표가 320~1920 을 빈틈 없이 덮는다",
      밴드[0].부터 === 320 && 밴드[밴드.length - 1].까지 === 1920 &&
      밴드.every((b, i) => i === 0 || b.부터 === 밴드[i - 1].까지 + 1),
      밴드.map((b) => b.부터 + "~" + b.까지).join(" / "));
    /* 밴드 하나 안에서는 이기는 규칙이 하나여야 합니다. 둘이면 밴드를 더 쪼개야 합니다 */
    const 뒤섞인 = 밴드.filter((b) => {
      const 줄들 = new Set();
      for (let w = b.부터; w <= b.까지; w++) 줄들.add(이긴글자(규칙, w).line);
      return 줄들.size !== 1;
    }).map((b) => b.이름);
    ok("밴드 하나 안에서는 이기는 규칙이 딱 하나다 (섞이면 밴드를 더 쪼개야 합니다)",
      뒤섞인.length === 0, 뒤섞인.join(" / "));
  }

  /* (가-1-2) ★주석에 적어 둔 줄 번호가 낡았는지 사람이 바로 보게 합니다★
     ────────────────────────────────────────────────────────────────────────
     이 파일 곳곳에 "style.css 491행" 같은 줄 번호가 적혀 있습니다.
     42cd474 가 style.css 를 21줄 늘리자 ★그 숫자들이 한꺼번에 낡았습니다★
     (4884 → 4905 / 484 → 491 / 3494 → 3497. 2026-09-07 에 여섯 곳 고쳤습니다).

     ⚠️ 그렇다고 줄 번호를 검사로 못 박지는 않습니다. style.css 에 주석 한 줄만
        늘어도 남의 작업이 빨개집니다. 대신 ★지금 줄 번호를 화면에 찍어★ 두고,
        낡지 않는 것 - ★어떤 @media 가 그 구간을 이기는가★ - 만 검사합니다.
     ──────────────────────────────────────────────────────────────────────── */
  {
    const 규칙 = 규칙들(CSS)
      .filter((r) => r.sel === ".top-banner-nav-btn")
      .map((r) => ({ 값: 선언들(r.body).filter((d) => d.속성 === "font-size").pop(), media: r.media.join(" "), line: r.line }))
      .filter((x) => x.값);
    const 이긴규칙 = (w) => { let out = null; for (const r of 규칙) if (폭에맞나(r.media ? [r.media] : [], w)) out = r; return out; };
    const 본것 = [360, 500, 1000].map((w) => { const r = 이긴규칙(w); return { w: w, line: r.line, media: r.media || "(미디어 없음)", v: r.값.값 }; });
    for (const x of 본것) console.log("    " + x.w + "px 를 이기는 규칙: style.css " + x.line + "행  " + x.media + "  font-size:" + x.v);
    ok("360 은 @media(max-width:400px) 가, 500 은 @media(max-width:700px) 가, 1000 은 미디어 없는 기본 규칙이 이긴다",
      본것[0].media.replace(/ /g, "").includes("max-width:400px") &&
      본것[1].media.replace(/ /g, "").includes("max-width:700px") &&
      본것[2].media === "(미디어 없음)",
      본것.map((x) => x.w + "px→" + x.media).join(" / ") +
      " — 계단 구조가 바뀌었습니다. 밴드 표와 머리글의 줄 번호를 같이 다시 보세요");
  }
  /* 빠른 계산기(글자규칙만/이긴글자)가 느린 적용값() 과 같은 답을 내는지 먼저 봅니다.
     안 맞으면 아래 밴드 검사 전체를 못 믿습니다. 밴드 경계 앞뒤를 일부러 넣었습니다. */
  {
    const 규칙 = 글자규칙만(CSS);
    const 어긋남 = 폭6.concat([320, 400, 401, 402, 520, 521, 700, 701])
      .filter((w) => 이긴글자(규칙, w).v !== pxv(적용값(CSS, ".top-banner-nav-btn", w)["font-size"]));
    ok("(자체검증) 빠른 계산기가 적용값() 과 폭 14개에서 같은 답을 낸다",
      어긋남.length === 0, "어긋난 폭: " + 어긋남.join(", "));
  }
  for (const b of 밴드) {
    const 낮은곳 = 바닥밑폭(CSS, b.부터, b.까지, b.바닥);
    console.log("    " + b.이름 + " 바닥 " + b.바닥 + "px - " +
      (낮은곳.length ? "밑으로 내려가는 폭 " + 낮은곳.length + "개" : "전부 통과"));
    ok(b.이름 + " 의 어느 폭에서도 메뉴 글자가 " + b.바닥 + "px 밑으로 안 내려간다",
      낮은곳.length === 0,
      낮은곳.slice(0, 6).join(" / ") + (낮은곳.length > 6 ? " ... 총 " + 낮은곳.length + "개" : ""));
  }
  /* 위 계산기는 선택자가 정확히 `.top-banner-nav-btn` 인 규칙만 봅니다.
     `.top-banner-nav-btn.active{font-size:9px}` 처럼 다른 선택자로 글자 크기를
     정하면 빠져나갑니다. 그래서 ★글자 크기는 한 선택자에서만 정한다★ 를
     따로 못 박습니다(확정 팔레트의 "두 벌 금지" 와 같은 생각입니다). */
  const 딴선택자 = 규칙들(CSS)
    .filter((r) => /top-banner-nav-btn/.test(r.sel) && r.sel !== ".top-banner-nav-btn")
    .filter((r) => 선언들(r.body).some((d) => d.속성 === "font-size"))
    .map((r) => r.sel + " @" + r.line + "행");
  ok("메뉴 글자 크기를 `.top-banner-nav-btn` 말고 다른 선택자에서 정하지 않는다",
    딴선택자.length === 0, 딴선택자.join(" / "));

  /* (마) ★역전 금지 - 넓은 화면이 더 작은 글씨면 안 됩니다 (2026-09-07 새로 넣음)★
     ────────────────────────────────────────────────────────────────────────
     42cd474 가 고친 것은 "13.5px 이라서" 가 아닙니다. 대표가 실제로 겪은 것은
     ★360 폰은 15px 인데 412 폰은 13.5px★ 이라는 역전이었습니다.

       08e93b0 이 @media(max-width:400px) 만 15px 로 올렸습니다
       401~700 은 13.5px 그대로 남았습니다
       → 더 큰 폰을 쓰는 사람이 더 작은 글씨를 봤습니다

     ★바닥 숫자만 올리면 같은 유형이 다른 구간에서 또 납니다.★
     예를 들어 나중에 320~400 을 17px 로 올리고 401~700 을 15px 로 두면
     바닥 검사(15)는 셋 다 초록인데 역전은 그대로 살아납니다.
     그래서 숫자가 아니라 ★유형★ 을 막습니다 - 폭이 넓어지는데 글자가 작아지는
     자리가 320~1920 어디에도 없어야 합니다.

     ⚠️ style.css 를 42cd474 이전으로 되돌리려면 이 검사도 같이 꺼야 합니다.
        머리글 "되돌리기" 에 적어 두었습니다.
     ──────────────────────────────────────────────────────────────────────── */
  {
    const 규칙 = 글자규칙만(CSS);
    const 역전자리 = [];
    let 앞값 = null, 앞폭 = 0;
    for (let w = 320; w <= 1920; w++) {
      const v = 이긴글자(규칙, w).v;
      if (앞값 !== null && v < 앞값) 역전자리.push(앞폭 + "px " + 앞값 + "px → " + w + "px " + v + "px");
      앞값 = v; 앞폭 = w;
    }
    console.log("    역전(넓은데 더 작은 글씨): " + (역전자리.length ? 역전자리.join(" / ") : "0곳"));
    ok("★320~1920 어디에도 '더 넓은 화면이 더 작은 글씨' 가 없다★ (42cd474 가 고친 바로 그 유형)",
      역전자리.length === 0, 역전자리.join(" / "));
  }

  /* (나) 15px 을 넘기지 않는다 - 넘기면 아래 (다) 가 넘침으로 잡습니다.
         숫자로도 한 번 더 못 박아 "왜 안 되는지" 를 사람이 바로 읽게 합니다.

         ⚠️ ★2026-09-07 (2) - 범위를 520 → 700 으로 넓혔습니다.★
            42cd474 전까지 폰 구간의 글자를 정하는 규칙은 @max-width:400 하나뿐이라
            520 으로 잘라도 다 잡혔습니다. 지금은 ★@max-width:700 (491행)★ 이
            401~700 의 글자를 정합니다. 520 으로 두면 그 규칙을 아예 안 봅니다.
            (701~ 의 기본 26px 은 넓은 화면용이라 여전히 안 셉니다) */
  const 천장_범위 = 700;
  console.log("    (기본 규칙 26px 은 넓은 화면용이라 안 셉니다 - <=" + 천장_범위 + "px 규칙만 봅니다)");
  const 큰글자 = 규칙들(CSS)
    .filter((r) => /top-banner-nav-btn/.test(r.sel))
    .filter((r) => { const m = r.media.join(" ").match(/max-width\s*:\s*(\d+)px/); return !!m && parseFloat(m[1]) <= 천장_범위; })
    .map((r) => ({ 선언: 선언들(r.body).filter((d) => d.속성 === "font-size"), line: r.line, sel: r.sel }))
    .filter((x) => x.선언.length)
    .map((x) => ({ v: pxv(x.선언[x.선언.length - 1].값), line: x.line, sel: x.sel }))
    .filter((x) => !isNaN(x.v) && x.v > 목표_글자);
  ok("좁은 화면(<=" + 천장_범위 + "px) 메뉴 규칙에 " + 목표_글자 + "px 을 넘는 글자가 없다",
    큰글자.length === 0,
    큰글자.map((x) => x.sel + " @" + x.line + "행 " + x.v + "px").join(" / "));

  /* (다) ★천장 - 360 에서 메뉴 6개가 한 줄에 들어가는가★ */
  ok("실측 기준이 되는 라벨 6개가 그대로다 (바뀌면 338.6px 실측이 무효입니다)",
    (HTML.match(/<button[^>]*class="[^"]*top-banner-nav-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [])
      .filter((b) => !/nav-coming-soon/.test(b))
      .map((b) => b.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim()).join("|") === 실측_라벨);

  for (const w of [360, 375, 390, 402]) {
    const m = 메뉴재기(CSS, w);
    console.log("    " + w + "px -> 글자 " + m.F + "px, 여백 " + m.pl + "/" + m.pr +
      "(첫 왼쪽 " + m.첫왼 + "), 간격 " + m.gap + " => 총폭 " + m.총폭.toFixed(1) +
      " / 담는칸 " + m.담는칸 + " => 여유 " + m.여유.toFixed(1) +
      ", 이웃 간격 " + m.이웃간격);
    ok(w + "px 에서 메뉴 6개가 한 줄에 들어간다 (넘치면 'TL 마켓' 이 다시 잘립니다)",
      m.여유 >= 0, "총폭 " + m.총폭.toFixed(1) + "px 이 담는칸 " + m.담는칸 + "px 을 " +
      (-m.여유).toFixed(1) + "px 넘칩니다");
    ok(w + "px 에서 이웃한 메뉴 글자가 " + 간격바닥 + "px 이상 떨어져 있다 (붙으면 못 읽습니다)",
      m.이웃간격 >= 간격바닥, "지금 " + m.이웃간격 + "px");
  }

  /* (다-2) ★360~700 을 1px 씩 전부 재기 (2026-09-07 새로 넣음)★
     ────────────────────────────────────────────────────────────────────────
     위 (다) 는 360·375·390·402 네 폭만 봅니다. 그런데 42cd474 가 넣은
     `.top-banner-nav{gap:0px}` 은 ★401~520 에만★ 걸립니다.
     521~700 은 gap 2px 그대로인데 글자만 15px 이 들어갔고,
     ★디자인팀 실측표에 521~700 이 한 줄도 없습니다★ (PM 지적).

     그래서 직접 계산했습니다:
       521px  글자 15 / 여백 10·10 / gap 2 / 담는칸 505 / 총폭 426.8 → 여유 ★78.2px★
       700px  같은 조합 / 담는칸 684 → 여유 257.2px
     ★521 에서 여백이 7 → 10px 으로 넓어지는데도 여유가 늘어납니다.★
     520 규칙(@max-width:520)이 끊기면서 담는칸도 같이 커지기 때문입니다.
     위험 구간이 아니었습니다 - 다만 봉인이 안 보고 있었던 것이 문제였습니다.

     ⚠️ 320~359 는 일부러 안 봅니다. 지금 값으로 320px 은 37.8px 넘칩니다
        (358px 부터 들어갑니다). 표준 점검 폭의 최소가 360 이고 국내에서 가장
        좁은 실기기도 360 이라, 여기를 검사로 만들면 style.css 를 고쳐야만
        초록이 됩니다. ★넘친다는 사실은 여기에 적어 둡니다 - 아래 값은 실측입니다.★
          320px 여유 -37.8 / 340px 여유 -17.8 / 357px 여유 -0.8 / 358px 여유 +0.2
        메뉴 줄은 overflow-x:auto 라 옆으로 밀어 볼 수는 있습니다(잘려 사라지지 않음).
     ──────────────────────────────────────────────────────────────────────── */
  {
    const 넘침 = [], 붙음 = [];
    let 최소여유 = { 여유: Infinity }, 최소간격 = { 이웃간격: Infinity };
    for (let w = 360; w <= 700; w++) {
      const m = 메뉴재기(CSS, w);
      if (!(m.여유 >= 0)) 넘침.push(w + "px(" + m.여유.toFixed(1) + ")");
      if (!(m.이웃간격 >= 간격바닥)) 붙음.push(w + "px(" + m.이웃간격 + ")");
      if (m.여유 < 최소여유.여유) 최소여유 = { 폭: w, 여유: m.여유 };
      if (m.이웃간격 < 최소간격.이웃간격) 최소간격 = { 폭: w, 이웃간격: m.이웃간격 };
    }
    /* 구간별로 어디가 가장 빠듯한지 사람이 바로 읽게 적습니다 */
    const 구간 = [[360, 400], [401, 520], [521, 700]];
    for (const [a, b] of 구간) {
      let mn = { 여유: Infinity };
      let 간격 = Infinity;
      for (let w = a; w <= b; w++) {
        const m = 메뉴재기(CSS, w);
        if (m.여유 < mn.여유) mn = { 폭: w, 여유: m.여유, F: m.F, gap: m.gap, pl: m.pl };
        if (m.이웃간격 < 간격) 간격 = m.이웃간격;
      }
      console.log("    " + a + "~" + b + "px -> 가장 빠듯한 곳 " + mn.폭 + "px 여유 " +
        mn.여유.toFixed(1) + "px (글자 " + mn.F + " / 여백 " + mn.pl + " / gap " + mn.gap +
        "), 이웃 간격 최소 " + 간격 + "px");
    }
    ok("★360~700px 341개 폭 전부에서 메뉴 6개가 한 줄에 들어간다★ (521~700 은 gap 이 2px 인 구간입니다)",
      넘침.length === 0,
      "넘치는 폭 " + 넘침.length + "개: " + 넘침.slice(0, 8).join(" / "));
    ok("360~700px 341개 폭 전부에서 이웃한 메뉴 글자가 " + 간격바닥 + "px 이상 떨어져 있다",
      붙음.length === 0,
      "붙은 폭 " + 붙음.length + "개: " + 붙음.slice(0, 8).join(" / "));
  }

  /* (라) 자체검증 - 이 계산기가 디자인팀 실측표 5줄을 다시 만들어 내는가.
         하나라도 어긋나면 계산기를 못 믿으니 위 (다) 도 못 믿습니다. */
  console.log("\n    [자체검증] 디자인팀 2026-09-04 실측표 5줄을 계산기가 재현하는가");
  const 표본 = (F, p, g) =>
    ".menu-bar-inner{padding:0 4px;}\n" +
    ".top-banner-nav{display:flex;gap:" + g + "px;}\n" +
    ".top-banner-nav-btn{padding:8.5px " + p + "px;font-size:" + F + "px;}\n" +
    ".top-banner-nav > .top-banner-nav-btn:first-child{padding-left:8px;}\n";
  const 재현 = [
    { 이름: "현재 13px + 여백 5px", F: 13, p: 5, g: 2, 여유: 20.1, 들어감: true },
    { 이름: "15px + 여백 3px (PM 이 고른 안)", F: 15, p: 3, g: 2, 여유: 2.2, 들어감: true },
    { 이름: "16px + 여백 2px", F: 16, p: 2, g: 2, 여유: -6.7, 들어감: false },
    { 이름: "17px + 여백 5px", F: 17, p: 5, g: 2, 여유: -59.6, 들어감: false },
    { 이름: "17px + 여백 0 + 간격 0 (들어가지만 글자가 붙음)", F: 17, p: 0, g: 0, 여유: 5.4, 들어감: true }
  ];
  for (const t of 재현) {
    const m = 메뉴재기(표본(t.F, t.p, t.g), 360);
    ok("(자체검증) " + t.이름 + " -> 총폭 " + m.총폭.toFixed(1) + ", 여유 " + m.여유.toFixed(1),
      Math.abs(m.여유 - t.여유) < 0.15 && (m.여유 >= 0) === t.들어감,
      "기대 여유 " + t.여유 + " / 실제 " + m.여유.toFixed(1));
  }
  ok("(자체검증) 17px 은 여백을 0 으로 해도 이웃 간격 0 이라 가독성 검사가 잡는다",
    메뉴재기(표본(17, 0, 0), 360).이웃간격 < 간격바닥);
  /* 디자인팀 표의 "15px + 여백 3px = 총폭 334.7px" 이 어떻게 나온 숫자인지 확인합니다.
     글자폭 + 버튼여백 12x3 만 센 값입니다 - ★첫 버튼 왼쪽 8px 과 버튼 사이 간격이 빠져 있습니다.★
     그래서 표의 여유 +6.3 은 실제보다 낙관적입니다(우리 계산으로는 +2.2).
     ⚠️ 표 자체도 안 맞습니다 - 그들의 담는칸 342 에서 334.7 을 빼면 7.3 이지 6.3 이 아닙니다. */
  ok("(자체검증) 디자인팀 표의 '15px = 334.7px' 은 첫 버튼 8px 과 간격을 뺀 값이다",
    Math.abs((글자폭(15) + 12 * 3) - 334.7) < 0.15,
    (글자폭(15) + 12 * 3).toFixed(1));
}

/* =========================================================================
 * 5) 메뉴 문구·개수를 줄여서 해결한 것이 아니다
 *    여백으로 푼 것이지 메뉴를 지운 게 아닙니다.
 * ========================================================================= */
console.log("\n  [5] 메뉴 문구와 개수를 줄이지 않았다");
{
  const 버튼들 = HTML.match(/<button[^>]*class="[^"]*top-banner-nav-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [];
  const 글자 = (b) => b.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
  const 준비중 = (b) => /nav-coming-soon/.test(b);
  const 보이는것 = 버튼들.filter((b) => !준비중(b)).map(글자);
  console.log("    메뉴 버튼 " + 버튼들.length + "개 (화면에 보이는 것 " + 보이는것.length + "개)");
  console.log("    보이는 메뉴: " + 보이는것.join(" | "));

  ok("메뉴 버튼이 마크업에 11개 그대로 있다 (숨긴 것도 지우지 않았습니다)",
    버튼들.length === 11, String(버튼들.length));
  ok("360 에서 보여야 할 메뉴가 6개다",
    보이는것.length === 6, 보이는것.join(" | "));
  /* 2026-08-28 대표 지시로 첫 메뉴 이름이 "코인선물" → "선물거래" 가 됐습니다.
     나스닥·삼성전자·SK하이닉스가 코인이 아니라서입니다.
     검사 내용은 그대로입니다 — 보이는 6개의 글자와 순서가 안 흔들리는가. */
  ok("보이는 메뉴 6개의 글자와 순서가 그대로다 (선물거래 ... TL 마켓)",
    보이는것.join("|") === "선물거래|커뮤니티|랭킹|TL 핫딜|마이페이지|TL 마켓",
    보이는것.join("|"));
  ok("첫 메뉴에 옛 이름 '코인선물' 이 되살아나지 않았다",
    보이는것[0] === "선물거래", 보이는것[0]);
  ok("'TL 마켓' 이 마지막 메뉴다 - 잘렸던 바로 그 항목입니다",
    보이는것[보이는것.length - 1] === "TL 마켓");
  ok("준비중 메뉴 5개를 숨기는 규칙이 그대로다 (없어지면 메뉴가 11개가 되어 다시 잘립니다)",
    /\.top-banner-nav-btn\.nav-coming-soon\{display:none;\}/.test(주석없는CSS.replace(/\s+/g, "")
      .replace(/\.top-banner-nav-btn\.nav-coming-soon\{display:none;\}/, ".top-banner-nav-btn.nav-coming-soon{display:none;}")) ||
    /\.top-banner-nav-btn\.nav-coming-soon\s*\{\s*display\s*:\s*none/.test(주석없는CSS));

  /* 좁은 화면에서 메뉴를 몰래 숨겨서 통과시키지 않았는지 */
  const 몰래숨김 = 규칙들(CSS).filter((r) => {
    if (!/page-nav-(exchange|board|ranking|hotdeal|mypage|market)\b/.test(r.sel)) return false;
    const mx = r.media.join(" ").match(/max-width\s*:\s*(\d+)px/);
    if (!mx) return false;
    return 선언들(r.body).some((d) => d.속성 === "display" && /none/.test(d.값));
  });
  ok("좁은 화면에서 보이는 메뉴 6개 중 하나라도 숨기는 규칙이 없다",
    몰래숨김.length === 0, 몰래숨김.map((r) => r.sel + " @" + r.line + "행").join(" / "));

  /* 좌우 여백은 실제로 줄어 있어야 합니다 - 이게 이번 해결 방식입니다 */
  const px = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v || "").trim()); return m ? parseFloat(m[1]) : NaN; };
  const 메뉴360 = 적용값(CSS, ".top-banner-nav-btn", 360);
  ok("360 에서 메뉴 좌우 여백이 8px 이하다 (여백으로 푼 것이 이 값입니다)",
    px(메뉴360["padding-left"]) <= 8 && px(메뉴360["padding-right"]) <= 8,
    메뉴360["padding-left"] + " / " + 메뉴360["padding-right"]);
  const 메뉴402 = 적용값(CSS, ".top-banner-nav-btn", 402);
  ok("402 에서도 좌우 여백이 7px 이하다 (401~408 구간에서 3px 잘렸던 자리)",
    px(메뉴402["padding-left"]) <= 7 && px(메뉴402["padding-right"]) <= 7,
    메뉴402["padding-left"] + " / " + 메뉴402["padding-right"]);
  const 메뉴바360 = 적용값(CSS, ".menu-bar-inner", 360);
  ok("360 에서 메뉴 바 좌우 여백이 4px 이하다",
    px(메뉴바360["padding-left"]) <= 4, 메뉴바360["padding-left"]);
}

/* =========================================================================
 * 6) 돌연변이 - 하나씩 되돌리면 정말 실패하는가
 *    style.css 파일은 건드리지 않습니다. 읽어온 문자열만 바꿔 봅니다.
 * ========================================================================= */
console.log("\n  [돌연변이] 하나씩 되돌리면 정말 실패하는가");
{
  const px = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v || "").trim()); return m ? parseFloat(m[1]) : NaN; };

  /* (가) 520 규칙의 여백을 10px 로 되돌린다 - 본부장이 콕 집은 돌연변이 */
  {
    const 원본 = ".top-banner-nav-btn{padding-left:7px;padding-right:7px;}";
    ok("(준비) 520 규칙 원문을 찾았다", CSS.indexOf(원본) >= 0);
    const 되돌림 = CSS.replace(원본, ".top-banner-nav-btn{padding-left:10px;padding-right:10px;}");
    ok("520 여백을 10px 로 되돌리면 402px 검사가 실패한다 (401~408 잘림 재발)",
      !(px(적용값(되돌림, ".top-banner-nav-btn", 402)["padding-left"]) <= 7),
      "402 에서 " + 적용값(되돌림, ".top-banner-nav-btn", 402)["padding-left"]);
    ok("그래도 360 은 400 규칙이 이겨서 멀쩡하다 (그래서 360 만 보면 못 잡습니다)",
      px(적용값(되돌림, ".top-banner-nav-btn", 360)["padding-left"]) <= 8);
  }

  /* (나) 밀기 힌트를 옛 파란색으로 되돌린다 */
  {
    const 되돌림 = CSS.replace("background:linear-gradient(to right, rgba(13,20,34,0), var(--surface2));",
      "background:linear-gradient(to right, rgba(15,76,130,0), #0F4C82);");
    ok("(준비) 밀기 힌트 원문을 찾았다", 되돌림 !== CSS);
    ok("힌트를 #0F4C82 로 되돌리면 팔레트 검사가 실패한다",
      /0f4c82/i.test(되돌림.replace(/\/\*[\s\S]*?\*\//g, "")));
  }

  /* (다) 검색칸을 고정폭으로 되돌린다 */
  {
    const 되돌림 = CSS.replace(".board-search-row input{flex:1 1 auto;width:auto;min-width:0;}",
      "/* 되돌림 */");
    ok("(준비) 검색칸 원문을 찾았다", 되돌림 !== CSS);
    ok("검색칸을 고정폭으로 되돌리면 360 검사가 실패한다",
      적용값(되돌림, ".board-search-row input", 360)["width"] !== "auto",
      "360 에서 " + 적용값(되돌림, ".board-search-row input", 360)["width"]);
  }

  /* (라) 채팅 입력줄 여백을 원래대로 키운다 */
  {
    const 되돌림 = CSS.replace("  .page-right .chat-input-row{padding-left:8px;padding-right:8px;}", "");
    ok("(준비) 채팅 입력줄 원문을 찾았다", 되돌림 !== CSS);
    const v = 적용값(되돌림, ".page-right .chat-input-row", 360)["padding-left"];
    ok("채팅 입력줄 여백을 되돌리면 360 검사가 실패한다 (clamp 최소 10px 로 돌아감)",
      !(px(v) <= 8), "360 에서 " + v);
  }

  /* (마) 메뉴를 하나 지워서 해결한 척한다 */
  {
    const 지움 = HTML.replace(/<button[^>]*id="page-nav-market"[^>]*>[\s\S]*?<\/button>/, "");
    const 남은 = (지움.match(/<button[^>]*class="[^"]*top-banner-nav-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [])
      .filter((b) => !/nav-coming-soon/.test(b));
    ok("'TL 마켓' 메뉴를 지우면 개수 검사가 실패한다", 남은.length !== 6, String(남은.length));
  }

  /* (바) 문구를 줄여서 해결한 척한다 */
  {
    const 줄임 = HTML.replace(">TL 마켓<", ">마켓<");
    const 보이는 = (줄임.match(/<button[^>]*class="[^"]*top-banner-nav-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g) || [])
      .filter((b) => !/nav-coming-soon/.test(b))
      .map((b) => b.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
    ok("'TL 마켓' 을 '마켓' 으로 줄이면 문구 검사가 실패한다",
      보이는.join("|") !== "선물거래|커뮤니티|랭킹|TL 핫딜|마이페이지|TL 마켓", 보이는.join("|"));
  }

  /* (사) 준비중 숨김 규칙을 지운다 - 메뉴가 11개가 되어 다시 잘립니다 */
  {
    const 지움 = 주석없는CSS.replace(".top-banner-nav-btn.nav-coming-soon{display:none;}", "");
    ok("준비중 숨김 규칙을 지우면 검사가 실패한다",
      !/\.top-banner-nav-btn\.nav-coming-soon\s*\{\s*display\s*:\s*none/.test(지움));
  }

  /* (아) 아무것도 안 바꾸면 통과 - 오탐이 없는지.
         ★2026-09-04 - "여백 5px / 글자 13px" 을 글자 그대로 보던 것을 값 판정으로 바꿨습니다.★
         디자인팀이 15px + 여백 3px 으로 바꾸면 옛 검사는 그냥 빨개졌습니다. */
  {
    const 지금 = 메뉴재기(CSS, 360);
    ok("그대로 두면 360 에서 메뉴가 한 줄에 들어가고 글자가 바닥 이상이다 (지금 " +
      지금.F + "px / 여백 " + 지금.pl + "px / 여유 " + 지금.여유.toFixed(1) + "px)",
      지금.여유 >= 0 && 지금.F >= 바닥 && 지금.F <= 목표_글자 && 지금.이웃간격 >= 간격바닥);
  }

  /* (자) ★15px + 여백 3px 조합이 이 봉인을 통과한다★
         2026-09-04 에는 "아직 안 들어온 안" 을 미리 증명하는 자리였습니다.
         2026-09-07 현재 그 안이 08e93b0 으로 실제로 들어왔습니다(style.css 4905행).
         그래도 지웁니다가 아니라 남깁니다 - 나중에 여백·간격이 조금씩 바뀌어
         이 조합이 더 이상 안 들어가게 되는 날을 잡아 주는 자리입니다.
         2026-09-04 계산 - 총폭 349.8 / 담는칸 352 -> 여유 2.2px, 이웃 간격 8px */
  {
    const 열다섯 = CSS + "\n@media (max-width:400px){.top-banner-nav-btn{padding:8.5px 3px;font-size:15px;}}\n";
    const m = 메뉴재기(열다섯, 360);
    console.log("    15px 안 미리보기 - 총폭 " + m.총폭.toFixed(1) + " / 담는칸 " + m.담는칸 +
      " -> 여유 " + m.여유.toFixed(1) + "px, 이웃 간격 " + m.이웃간격 + "px");
    ok("디자인팀 15px + 여백 3px 안은 이 봉인을 통과한다 (봉인이 다음 작업을 막지 않는다)",
      m.F === 15 && m.여유 >= 0 && m.이웃간격 >= 간격바닥,
      "여유 " + m.여유.toFixed(1) + " / 이웃 간격 " + m.이웃간격);
  }

  /* (차) 글자만 올리고 여백 줄이는 걸 잊으면 잡히는가 - 가장 흔할 실수.
         ⚠️ 여백 5px 을 ★여기서 직접 적습니다.★ style.css 의 지금 값을 물려받게
            두면, 디자인팀이 3px 으로 바꾼 뒤에는 "잊은 경우" 를 못 만들어
            이 돌연변이 자체가 헛돕니다(2026-09-04 사본 검증에서 실제로 걸렸습니다). */
  {
    const m = 메뉴재기(CSS + "\n@media (max-width:400px){.top-banner-nav-btn{padding:8.5px 5px;font-size:15px;}}\n", 360);
    ok("15px 로 올리면서 여백을 예전 5px 그대로 두면 넘침으로 잡힌다",
      m.여유 < 0, "여유 " + m.여유.toFixed(1));
  }

  /* (카) ★17px 로 올리면 잡히는가★ - PM 이 콕 집은 돌연변이 */
  {
    const m = 메뉴재기(CSS + "\n@media (max-width:400px){.top-banner-nav-btn{font-size:17px;}}\n", 360);
    ok("17px 로 올리면 360 에서 넘침으로 잡힌다 (여백 5px 그대로면 59.6px 넘침)",
      m.여유 < 0, "여유 " + m.여유.toFixed(1));
    const m2 = 메뉴재기(
      CSS + "\n@media (max-width:400px){.top-banner-nav{gap:0px;}" +
      ".top-banner-nav-btn{padding:8.5px 0px;font-size:17px;}" +
      ".top-banner-nav > .top-banner-nav-btn:first-child{padding-left:0px;}}\n", 360);
    ok("17px 을 여백 0 + 간격 0 으로 우겨 넣으면 폭은 통과해도 ★가독성 검사★ 가 잡는다",
      m2.여유 >= 0 && m2.이웃간격 < 간격바닥,
      "여유 " + m2.여유.toFixed(1) + " / 이웃 간격 " + m2.이웃간격);
  }

  /* (타) 바닥 - 12px 로 낮추면 잡히는가 */
  {
    ok("12px 로 낮추면 바닥 검사가 실패한다",
      pxv(적용값(CSS + "\n@media (max-width:400px){.top-banner-nav-btn{font-size:12px;}}\n",
        ".top-banner-nav-btn", 360)["font-size"]) < 바닥);
  }

  /* (파) 간격을 몰래 늘려 우회하는 것도 잡히는가.
         ⚠️ 여유 숫자가 낡아서 2026-09-07 에 고쳤습니다 - 13px 시절 20.1 이었고
            지금은 15px 이라 2.2 입니다. 판정(6px 로 늘리면 넘침)은 그대로입니다. */
  {
    const m = 메뉴재기(CSS + "\n@media (max-width:400px){.top-banner-nav{gap:6px;}}\n", 360);
    ok("버튼 사이 간격을 2 -> 6px 으로 늘리면 폭 검사가 잡는다 (여유 2.2 - 20 = 마이너스)",
      m.여유 < 1, "여유 " + m.여유.toFixed(1));
  }

  /* ────────────────────────────────────────────────────────────────────────
     ★(하) 2026-09-07 에 새로 넣은 돌연변이 - 이 갱신의 핵심★

     2026-09-04~09-07 사흘 동안 바닥이 13 이었습니다. 그 사이에는
     ★누가 style.css 를 15px → 13px 로 되돌려도 이 봉인이 초록이었습니다.★
     13 >= 13 이라 통과했기 때문입니다. 대표가 세 번 말한 "글씨가 작다" 가
     조용히 되돌아가도 아무도 몰랐을 자리입니다.

     그래서 "되돌리면 정말 빨개지는가" 를 여기서 증명합니다.
     ⚠️ style.css 는 손대지 않습니다. 읽어 온 글자열 뒤에 규칙을 덧붙인
        ★사본★ 으로만 계산합니다(이 파일 전체가 같은 방식입니다).
     ──────────────────────────────────────────────────────────────────────── */
  {
    const 되돌림 = CSS + "\n@media (max-width:400px){.top-banner-nav-btn{padding:8.5px 5px;font-size:13px;}}\n";

    /* 1. 폭6 바닥 검사가 잡는가 - 360/375/390 세 폭 전부 */
    const 잡힌폭 = [360, 375, 390]
      .filter((w) => pxv(적용값(되돌림, ".top-banner-nav-btn", w)["font-size"]) < 바닥);
    ok("★13px 으로 되돌리면 360·375·390 바닥 검사가 전부 실패한다★ (사흘간 못 잡던 것)",
      잡힌폭.length === 3, "잡힌 폭 " + 잡힌폭.length + "개: " + 잡힌폭.join(", "));

    /* 2. 밴드 훑기도 같이 잡는가 - 320~400 전 구간이 빨개져야 합니다 */
    const 밑 = 바닥밑폭(되돌림, 320, 400, 바닥);
    ok("★13px 으로 되돌리면 320~400 밴드 훑기가 81개 폭 전부를 잡는다★",
      밑.length === 81, "잡힌 폭 " + 밑.length + "개 (81개여야 합니다)");

    /* 3. 바닥이 13 이었다면 못 잡았다는 것도 같이 증명합니다.
          "지금 잡힌다" 만으로는 왜 올려야 했는지가 안 남습니다. */
    ok("(대조) 바닥이 13 이던 시절이었다면 같은 되돌림을 하나도 못 잡았다",
      바닥밑폭(되돌림, 320, 400, 13).length === 0 &&
      [360, 375, 390].every((w) => pxv(적용값(되돌림, ".top-banner-nav-btn", w)["font-size"]) >= 13));
  }

  /* ────────────────────────────────────────────────────────────────────────
     ★(하-2) 2026-09-07 (2) 에 새로 넣은 돌연변이 - 이번 갱신의 핵심★

     42cd474 전까지 401~700 은 13.5px 이었고, 이 봉인의 밴드 2 바닥은 13 이었습니다.
     ★그 상태에서는 401~700 을 13.5px 로 되돌려도 이 파일이 초록이었습니다.★
     13.5 >= 13 이라 통과했기 때문입니다. 08e93b0 뒤 360 구간에서 사흘을 놓친 것과
     ★한 글자도 다르지 않은 구조★ 입니다. 같은 병을 두 번 앓지 않으려고
     "되돌리면 정말 빨개지는가" 와 "예전 바닥이었다면 못 잡았다" 를 둘 다 증명합니다.

     ⚠️ style.css 는 손대지 않습니다. 읽어 온 글자열의 ★사본★ 으로만 계산합니다.
     ──────────────────────────────────────────────────────────────────────── */
  {
    /* style.css 491행 한 줄만 13.5px 으로 되돌린 사본. padding 이 달라서 4905행과
       헷갈리지 않습니다(4905행은 padding:8.5px 3px). 원문이 있어야 돌연변이가 성립합니다 */
    const 원본 = ".top-banner-nav-btn{padding:8.5px 10px;font-size:15px;}";
    ok("(준비) 42cd474 가 고친 491행 원문을 찾았다", CSS.indexOf(원본) >= 0,
      "못 찾으면 아래 돌연변이 세 개가 헛돕니다");
    const 되돌림 = CSS.replace(원본, ".top-banner-nav-btn{padding:8.5px 10px;font-size:13.5px;}");
    ok("(준비) 사본에서만 되돌렸고 style.css 는 그대로다", 되돌림 !== CSS && CSS.indexOf(원본) >= 0);

    /* 1. 밴드 2 훑기가 401~700 300개 폭을 전부 잡는가 */
    const 밑 = 바닥밑폭(되돌림, 401, 700, 바닥);
    ok("★401~700 을 13.5px 로 되돌리면 밴드 2 훑기가 300개 폭 전부를 잡는다★",
      밑.length === 300, "잡힌 폭 " + 밑.length + "개 (300개여야 합니다)");

    /* 2. ★예전 바닥 13 이었다면 하나도 못 잡았다★ - 왜 올려야 했는지를 남깁니다 */
    ok("(대조) 밴드 2 바닥이 13 이던 어제였다면 같은 되돌림을 하나도 못 잡았다",
      바닥밑폭(되돌림, 401, 700, 13).length === 0,
      "13.5 >= 13 이라 통과합니다 - 이것이 밴드 2 를 15 로 올린 이유입니다");

    /* 3. ★폭6 검사도 못 잡습니다★ - 표준 폭 6개 중 401~700 에 드는 것이 없습니다.
          360·375·390 은 4905행이 이기고, 768·1440·1920 은 기본 26px 이 이깁니다. */
    ok("(대조) 표준 폭 6개(360·375·390·768·1440·1920)도 이 되돌림을 하나도 못 잡는다",
      폭6.every((w) => pxv(적용값(되돌림, ".top-banner-nav-btn", w)["font-size"]) >= 바닥),
      "폭6 중 401~700 에 드는 폭이 하나도 없습니다 - 그래서 훑기가 필요합니다");

    /* 4. ★역전 검사도 같이 잡는가★ - 320~400 은 15px 인데 401~700 이 13.5px 이면
          그게 바로 대표가 412 폰에서 본 역전입니다. 서로 다른 두 검사가 잡아야
          하나가 낡아도 나머지가 버팁니다. */
    {
      const 규칙 = 글자규칙만(되돌림);
      let 역전 = 0, 앞값 = null;
      for (let w = 320; w <= 1920; w++) {
        const v = 이긴글자(규칙, w).v;
        if (앞값 !== null && v < 앞값) 역전++;
        앞값 = v;
      }
      ok("★같은 되돌림을 역전 검사도 따로 잡는다★ (400 → 401 에서 15px → 13.5px)",
        역전 === 1, "역전 " + 역전 + "곳 (1곳이어야 합니다)");
    }
  }

  /* ★(하-3) gap:0px 블록만 지우면 401px 이 넘치는가★
     42cd474 는 글자를 올리면서 모자란 폭을 `.top-banner-nav{gap:0px}` 으로 벌었습니다.
     누가 "이 블록 뭐지" 하고 지우면 글자만 15px 로 남아 401px 에서 0.8px 넘칩니다.
     ⚠️ ★넘치는 폭이 401 딱 하나입니다.★ 402 는 여유 10.3 이라 멀쩡합니다 -
        표준 폭 6개로도, 402 만 보는 (다) 로도 절대 못 잡습니다.
        1px 씩 훑는 (다-2) 만 잡습니다. 훑기를 넣은 이유가 이것입니다. */
  {
    const 원본 = "@media (min-width:401px) and (max-width:520px){";
    ok("(준비) 42cd474 가 넣은 gap 블록을 찾았다", CSS.indexOf(원본) >= 0);
    const 지움 = CSS.replace("@media (min-width:401px) and (max-width:520px){\n  .top-banner-nav{gap:0px;}\n}", "");
    ok("(준비) gap 블록이 사본에서 지워졌다", 지움 !== CSS && CSS.indexOf(원본) >= 0);
    const 넘침 = [];
    for (let w = 360; w <= 700; w++) if (메뉴재기(지움, w).여유 < 0) 넘침.push(w);
    ok("★gap:0px 블록을 지우면 401px 이 넘침으로 잡힌다★ (딱 한 폭 - 훑기만 잡습니다)",
      넘침.length === 1 && 넘침[0] === 401, "넘치는 폭: " + (넘침.join(", ") || "없음"));
    ok("(대조) 표준 폭 6개와 402px 만 봐서는 같은 삭제를 못 잡는다",
      폭6.concat([402]).every((w) => 메뉴재기(지움, w).여유 >= 0),
      "402 여유 " + 메뉴재기(지움, 402).여유.toFixed(1) + "px");
  }

  /* ★(하-4) 밴드 표가 CSS 와 어긋나면 (가-1) 이 말해 주는가★
     밴드 표를 손으로 적어 두고 CSS 만 바뀌는 것이 이번 사고의 뿌리입니다.
     새 미디어쿼리를 하나 심어 경계를 늘려 보고, (가-1) 이 알아채는지 봅니다. */
  {
    const 새경계 = CSS + "\n@media (min-width:441px) and (max-width:480px){.top-banner-nav-btn{font-size:15px;}}\n";
    const 규칙 = 글자규칙만(새경계);
    const 경계 = [];
    let 앞줄 = null;
    for (let w = 320; w <= 1920; w++) {
      const r = 이긴글자(규칙, w);
      if (앞줄 !== null && r.line !== 앞줄) 경계.push(w);
      앞줄 = r.line;
    }
    ok("★미디어쿼리를 하나 더 심으면 경계가 2곳 → 4곳이 되어 (가-1) 이 잡는다★",
      경계.length === 4 && 경계.join(",") === "401,441,481,701",
      "경계: " + 경계.join(", ") + " (401,441,481,701 이어야 합니다)");
  }

  /* (거) ★밴드 훑기가 폭6 보다 촘촘한가★ - 훑기를 넣은 이유를 증명합니다.
         표준 폭 6개(360·375·390·768·1440·1920)를 비켜 가는 구간에만 작은 글자를
         심습니다. 392~400 은 여섯 폭 어디에도 안 걸립니다.
         예전 "규칙 값만 훑기" 도, 폭6 검사도 이걸 못 잡습니다. */
  {
    const 몰래 = CSS + "\n@media (min-width:392px) and (max-width:400px){.top-banner-nav-btn{font-size:11px;}}\n";
    ok("폭6 검사는 392~400px 에만 심은 11px 을 못 잡는다 (그래서 훑기가 필요합니다)",
      폭6.every((w) => pxv(적용값(몰래, ".top-banner-nav-btn", w)["font-size"]) >= 바닥));
    const 밑 = 바닥밑폭(몰래, 320, 400, 바닥);
    ok("★밴드 훑기는 392~400px 9개 폭을 정확히 잡아낸다★",
      밑.length === 9, "잡힌 폭 " + 밑.length + "개: " + 밑.slice(0, 3).join(" / "));
  }

  /* (너) 다른 선택자로 글자 크기를 몰래 정하는 것도 잡히는가.
         밴드 훑기는 `.top-banner-nav-btn` 만 보므로, 여기가 뚫리면 훑기가 헛돕니다. */
  {
    const 딴데 = 규칙들(CSS + "\n.top-banner-nav-btn.active{font-size:9px;}\n")
      .filter((r) => /top-banner-nav-btn/.test(r.sel) && r.sel !== ".top-banner-nav-btn")
      .filter((r) => 선언들(r.body).some((d) => d.속성 === "font-size"));
    ok("`.top-banner-nav-btn.active` 에 글자 크기를 넣으면 '한 선택자' 검사가 잡는다",
      딴데.length === 1, "잡힌 규칙 " + 딴데.length + "개");
  }
}

/* =========================================================================
 * 7) 수정 금지 파일 12개 - 이 작업으로 건드리지 않았다
 * ========================================================================= */
console.log("\n  [수정 금지] 12개 파일 해시");
{
  const 기준 = {
    "trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
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
