/* tests/first-paint-dark.test.js
 * ---------------------------------------------------------------
 * 지키는 것 — "처음 열면 하얀 화면이 잠깐 보였다가 어두워지는 것" 재발 방지
 *
 * 2026-08-31 대표 보고
 *   "홈페이지를 처음 키면 렉?? 이라해야나 화이트모드가 나오고 얼마있다 다크모드로 바껴"
 *
 * 실측 원인은 두 가지였습니다 (CSS 응답을 800ms 늦춘 조건, 1440):
 *   0 ~ 1632ms     하양     — html·body 에 배경이 아예 없어 브라우저 기본값이 칠해짐
 *   1632 ~ 3275ms  밝은회색 — style.css 는 왔는데 data-theme="dark" 가 아직 안 붙어
 *                             :root 의 밝은 팔레트(--bg:#F3F4F7)가 적용됨
 *   3275ms         그제서야 다크 (js/theme.js 가 모든 스크립트 뒤에 붙임)
 *
 * 그래서 index.html 에 두 가지를 넣었습니다.
 *   1) <html data-theme="dark">                   ← 둘째 구간을 없앰
 *   2) <style id="tl-first-paint"> ... </style>   ← 첫째 구간을 없앰
 *      반드시 모든 <link rel="stylesheet"> 보다 위에 있어야 합니다
 *
 * 이 파일의 핵심은 "색이 두 벌이 되지 않게" 입니다.
 * index.html 의 인라인 색은 style.css 의 html[data-theme="dark"] 값을 그대로
 * 베낀 것입니다. style.css 만 바뀌고 index.html 이 안 바뀌면 첫 화면만 옛 색으로
 * 남습니다 — 그 상태를 여기서 실패로 잡습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [32m✓[0m " + name); }
  else { fail++; console.log("  [31m✗[0m " + name + (detail ? "\n         " + detail : "")); }
}

const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
/* 주석 안에도 <link rel="stylesheet"> / <style id="tl-first-paint"> 라는 글자가
   들어 있습니다(설명 주석). 위치를 잴 때는 주석을 뺀 본문으로 봐야 합니다.
   길이가 바뀌면 위치 비교가 어긋나므로 같은 길이의 공백으로 바꿉니다. */
const 본문 = HTML.replace(/<!--[\s\S]*?-->/g, (c) => " ".repeat(c.length));
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

console.log("\n첫 화면 색 (하얀 깜빡임 방지)");

/* ---------- 1. <html> 에 data-theme="dark" 가 처음부터 박혀 있다 ---------- */
{
  const tag = (HTML.match(/<html\b[^>]*>/) || [""])[0];
  ok('<html> 에 data-theme="dark" 가 있다',
    /data-theme\s*=\s*"dark"/.test(tag),
    "지금: " + tag +
    "\n         이게 없으면 js/theme.js 가 붙일 때까지 밝은 팔레트가 보입니다 (실측 1.6초).");
}

/* ---------- 2. 인라인 <style> 이 있고, 모든 스타일시트 link 보다 위다 ---------- */
const styleAt = 본문.indexOf('<style id="tl-first-paint">');
{
  ok('<style id="tl-first-paint"> 가 있다', styleAt >= 0,
    "index.html <head> 안에 첫 화면 배경을 직접 칠하는 블록이 필요합니다.");

  const m = 본문.match(/<link\b[^>]*rel\s*=\s*"stylesheet"[^>]*>/i);
  const firstLinkAt = m ? 본문.indexOf(m[0]) : -1;
  ok('스타일시트 <link> 를 찾았다', firstLinkAt >= 0);
  ok('그 <style> 이 첫 <link rel="stylesheet"> 보다 위에 있다',
    styleAt >= 0 && firstLinkAt >= 0 && styleAt < firstLinkAt,
    "style 위치 " + styleAt + " / 첫 link 위치 " + firstLinkAt +
    "\n         아래로 내리면 바깥 CSS 를 기다리는 동안 다시 하얘집니다.");
}

/* ---------- 3. html 과 body 를 둘 다 칠하고, 글자색도 넣는다 ---------- */
const block = styleAt >= 0
  ? 본문.slice(styleAt, 본문.indexOf("</style>", styleAt))
  : "";
{
  ok("html 배경을 칠한다", /html\s*\{[^}]*background\s*:\s*#[0-9A-Fa-f]{6}/.test(block),
    "html 이 투명이면 뒤(브라우저 기본 하양)가 비칩니다.");
  ok("body 배경을 칠한다", /body\s*\{[^}]*background\s*:\s*#[0-9A-Fa-f]{6}/.test(block));
  ok("body 글자색도 넣는다", /body\s*\{[^}]*color\s*:\s*#[0-9A-Fa-f]{6}/.test(block),
    "배경만 어둡고 글자가 기본 검정이면 첫 글자가 안 보입니다.");
}

/* ---------- 4. 색이 두 벌이 아니다 — style.css 가 정본 ---------- */
{
  const 다크 = CSS.slice(CSS.indexOf('html[data-theme="dark"]{'));
  const bg = (다크.match(/--bg\s*:\s*(#[0-9A-Fa-f]{6})/) || [])[1];
  const text = (다크.match(/--text\s*:\s*(#[0-9A-Fa-f]{6})/) || [])[1];

  ok("style.css 에서 다크 --bg / --text 를 읽었다", !!bg && !!text,
    "--bg=" + bg + " --text=" + text);

  const 인라인색 = (block.match(/#[0-9A-Fa-f]{6}/g) || []).map((v) => v.toUpperCase());
  const 배경들 = (block.match(/background\s*:\s*#[0-9A-Fa-f]{6}/g) || [])
    .map((v) => v.split(":")[1].trim().toUpperCase());
  const 글자들 = (block.match(/color\s*:\s*#[0-9A-Fa-f]{6}/g) || [])
    .map((v) => v.split(":")[1].trim().toUpperCase());

  ok("인라인 배경색이 style.css 의 --bg 와 같다",
    배경들.length > 0 && 배경들.every((v) => v === String(bg).toUpperCase()),
    "index.html " + JSON.stringify(배경들) + " vs style.css --bg " + bg +
    "\n         색이 두 벌이 됐습니다. style.css 가 정본입니다 —" +
    "\n         index.html 의 <style id=\"tl-first-paint\"> 를 같은 값으로 고쳐주세요." +
    "\n         안 고치면 사이트를 처음 열 때만 옛 색으로 보입니다.");

  ok("인라인 글자색이 style.css 의 --text 와 같다",
    글자들.length > 0 && 글자들.every((v) => v === String(text).toUpperCase()),
    "index.html " + JSON.stringify(글자들) + " vs style.css --text " + text);

  /* 확정 팔레트(CLAUDE.md) 와도 같아야 합니다. 새 색을 만들면 안 됩니다. */
  ok("확정 팔레트 값 그대로다 (배경 #0A0F1C / 본문 #E7ECF5)",
    인라인색.indexOf("#0A0F1C") >= 0 && 인라인색.indexOf("#E7ECF5") >= 0,
    "지금: " + JSON.stringify(인라인색));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
