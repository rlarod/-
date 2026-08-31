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
 *    않게 **13px 을 바닥으로 박습니다.** 더 작게 하려면 대표 확인이 먼저입니다.
 *    (승인대기 5번 "글자 크기를 다시 손댈지" 가 아직 답 대기 중입니다)
 *
 * ── 짝이 되는 파일 ────────────────────────────────────────────────────
 *   tests/media-cascade-order.test.js  - 좁은 화면 규칙이 넓은 규칙에 덮이는 것
 *   tests/css-duplicate-rules.test.js  - 같은 미디어쿼리 안의 중복
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
function 규칙들(cssText) {
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
 * 4) 메뉴 버튼 글자 크기 바닥 13px
 *    2026-08-25 에 글자를 작게 했다가 대표가 되돌리라고 한 자리입니다.
 * ========================================================================= */
console.log("\n  [4] 메뉴 글자가 13px 밑으로 안 내려간다");
{
  const px = (v) => { const m = /^(-?\d+(?:\.\d+)?)px$/.exec(String(v || "").trim()); return m ? parseFloat(m[1]) : NaN; };
  for (const w of 폭6) {
    const v = 적용값(CSS, ".top-banner-nav-btn", w);
    const f = px(v["font-size"]);
    console.log("    " + w + "px -> font-size " + v["font-size"] + ", 좌우 여백 " + v["padding-left"] + "/" + v["padding-right"]);
    ok(w + "px 에서 메뉴 글자가 13px 이상이다", !isNaN(f) && f >= 13, "지금 값: " + v["font-size"]);
  }
  ok("가장 좁은 360 에서 정확히 13px 이다 (2026-08-26 고칠 때도 이 값은 안 건드렸습니다)",
    적용값(CSS, ".top-banner-nav-btn", 360)["font-size"] === "13px",
    적용값(CSS, ".top-banner-nav-btn", 360)["font-size"]);

  /* 어느 폭에서든 13px 밑이 없어야 합니다 - 새 미디어쿼리로 몰래 낮추는 것 방지 */
  const 작은글자 = 규칙들(CSS)
    .filter((r) => /top-banner-nav-btn/.test(r.sel))
    .map((r) => ({ 선언: 선언들(r.body).filter((d) => d.속성 === "font-size"), line: r.line, sel: r.sel }))
    .filter((x) => x.선언.length)
    .map((x) => ({ v: px(x.선언[x.선언.length - 1].값), line: x.line, sel: x.sel }))
    .filter((x) => !isNaN(x.v) && x.v < 13);
  ok("style.css 어디에도 메뉴 글자를 13px 밑으로 정한 규칙이 없다",
    작은글자.length === 0,
    작은글자.map((x) => x.sel + " @" + x.line + "행 " + x.v + "px").join(" / "));

  /* 자체검증 - 정말 잡는가 */
  ok("(자체검증) 12px 로 낮추면 바닥 검사가 실패한다",
    px(적용값(CSS + "\n@media (max-width:400px){.top-banner-nav-btn{font-size:12px;}}\n",
      ".top-banner-nav-btn", 360)["font-size"]) < 13);
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

  /* (아) 아무것도 안 바꾸면 통과 - 오탐이 없는지 */
  {
    ok("그대로 두면 360 메뉴 여백 5px / 글자 13px 이다",
      적용값(CSS, ".top-banner-nav-btn", 360)["padding-left"] === "5px" &&
      적용값(CSS, ".top-banner-nav-btn", 360)["font-size"] === "13px");
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
