/* tests/tl-brand.test.js
 * TL 브랜드 적용 검증.
 * 핵심은 "로고 원본을 변형하지 않았는가" 와 "브랜드가 일관되게 적용됐는가" 입니다. */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m✓\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

console.log("\nTL 브랜드 적용");

/* ---- 로고 파일 ---- */
{
  const dir = path.join(REPO, "assets", "brand");
  ["tl-logo.png", "tl-mark.png", "tl-mark-32.png", "tl-mark-180.png",
   "tl-logo-dark.png", "tl-mark-dark.png", "tl-mark-dark-32.png", "tl-mark-dark-180.png"].forEach((f) => {
    ok("로고 파일 존재: " + f, fs.existsSync(path.join(dir, f)));
  });

  /* PNG 헤더에서 크기를 직접 읽어 비율이 원본과 같은지 확인합니다. */
  function pngSize(file) {
    const buf = fs.readFileSync(file);
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  const full = pngSize(path.join(dir, "tl-logo.png"));
  const mark = pngSize(path.join(dir, "tl-mark.png"));
  ok("전체 로고 비율 4.454 (원본 그대로)", Math.abs(full.w / full.h - 4.4543) < 0.01, (full.w / full.h).toFixed(4));
  ok("심볼이 세로로 잘리지 않았다(높이가 전체 로고와 같음)", full.h === mark.h, full.h + " vs " + mark.h);
  ok("심볼 비율 1.6 대", Math.abs(mark.w / mark.h - 1.6) < 0.05, (mark.w / mark.h).toFixed(3));
  ok("파비콘은 정사각", (() => { const s = pngSize(path.join(dir, "tl-mark-32.png")); return s.w === 32 && s.h === 32; })());

  /* 투명 배경이어야 다크모드에서 흰 사각형이 안 생깁니다. */
  const buf = fs.readFileSync(path.join(dir, "tl-logo.png"));
  ok("로고가 알파 채널을 가진 PNG (colorType 6)", buf.readUInt8(25) === 6, "colorType " + buf.readUInt8(25));

  const fullD = pngSize(path.join(dir, "tl-logo-dark.png"));
  const markD = pngSize(path.join(dir, "tl-mark-dark.png"));
  ok("다크 로고 비율 4.896 (원본 그대로)", Math.abs(fullD.w / fullD.h - 4.8961) < 0.01, (fullD.w / fullD.h).toFixed(4));
  ok("다크 심볼도 세로로 잘리지 않았다", fullD.h === markD.h, fullD.h + " vs " + markD.h);
  ok("다크 로고도 투명 배경", fs.readFileSync(path.join(dir, "tl-logo-dark.png")).readUInt8(25) === 6);
}

/* ---- CSS 가 로고를 변형하지 않는지 ---- */
{
  const brandBlock = css.slice(css.indexOf(".brand-logo{"), css.indexOf(".brand-logo{") + 400);
  ok("로고 가로는 auto — 찌그러뜨리지 않는다", /width:auto/.test(brandBlock));
  ok("원본 비율을 aspect-ratio 로 고정", /aspect-ratio:1461 \/ 328/.test(css));
  ok("로고에 색 필터를 걸지 않았다", !/\.brand-logo[^{]*\{[^}]*filter:/.test(css));
  ok("로고가 한눈에 보일 만큼 크다(100px 이상)", /\.brand-logo\{[^}]*height:(1[0-9]{2}|[2-9][0-9]{2})px/.test(css));
  ok("다크모드는 어두운 배경용 로고 원본으로 교체한다", /html\[data-theme="dark"\] \.brand-logo\.brand-logo-dark\{display:block;\}/.test(css));
  ok("다크 전용 로고가 생겼으니 흰 판은 걷어냈다", !/html\[data-theme="dark"\] \.brand-logo[^{]*\{[^}]*background:#fff/.test(css));
  ok("다크 로고도 원본 비율로 고정", /aspect-ratio:1885 \/ 385/.test(css) && /aspect-ratio:648 \/ 385/.test(css));
}

/* ---- 헤더 브랜드 ---- */
{
  ok("헤더에 TL 로고가 들어갔다", /class="brand-logo brand-logo-light"[^>]*src="assets\/brand\/tl-logo\.png"/.test(html));
  ok("좁은 화면용 심볼도 있다", /src="assets\/brand\/tl-mark\.png"/.test(html));
  ok("어두운 배경용 로고도 헤더에 있다", /src="assets\/brand\/tl-logo-dark\.png"/.test(html));
  ok("alt 에 브랜드명이 들어있다", /alt="TL TRADING LEAGUE/.test(html));
  ok("BTC 아이콘(₿)을 메인 브랜드로 쓰지 않는다", !/<div class="mark">₿<\/div>/.test(html));
  ok("'BTC 모의투자' 문구가 화면에서 사라졌다", html.indexOf("BTC 모의투자") === -1);
  ok("문서 제목이 TL 브랜드", /<title>TL · TRADING LEAGUE/.test(html));
  ok("파비콘이 TL 심볼", /href="assets\/brand\/tl-mark-32\.png"/.test(html));
}

/* ---- TL 포인트 단위 ---- */
{
  const up = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
  ok("내 정보 라벨이 '보유 TL'", /up-label">보유 TL<\/span>/.test(up));
  ok("단위가 'P' 가 아니라 'TL'", /toLocaleString\(\) \+ " TL"/.test(up) && !/toLocaleString\(\) \+ " P"/.test(up));
  ok("마이페이지에 TL 잔액 칸이 있다", /id="mypage-tl"/.test(html));
  ok("TL 잔액은 새 숫자가 아니라 rank.points 를 쓴다", /getUserRank\(\)/.test(fs.readFileSync(path.join(REPO, "js", "tl-brand.js"), "utf8")));
  ok("랭킹 제목이 TL 랭킹", /TL 랭킹/.test(html));
  ok("핫딜 메뉴가 TL 핫딜", /TL 핫딜/.test(html));
}

/* ---- 브랜드 컬러 ---- */
{
  ok("로고에서 뽑은 TL 블루가 변수로 있다", /--tl-blue:#0058F8/.test(css));
  ok("네이비·시안 보조색도 정의됐다", /--tl-navy:#011E7A/.test(css) && /--tl-cyan:#17E9FF/.test(css));
  /* 금지된 메인 컬러 계열을 새로 추가하지 않았는지 */
  ok("보라색을 브랜드 변수로 추가하지 않았다", !/--(purple|violet)/.test(css));
  ok("주황색을 브랜드 변수로 추가하지 않았다", !/--orange/.test(css));
  ok("빨강·초록 변수는 매매 표시용으로 그대로 유지", /--red:#E5484D/.test(css) && /--green:#0ECB81/.test(css));
}

/* ---- 기능을 지우지 않았는지 ---- */
{
  ok("옛 텍스트 브랜드 CSS 를 지우지 않고 남겼다", /\.brand \.name\{/.test(css) && /\.brand-tagline\{/.test(css));
  ok("로고 로딩 실패 대비가 있다", /brand-text/.test(fs.readFileSync(path.join(REPO, "js", "tl-brand.js"), "utf8")));
  ok("기존 페이지 구조(거래/게시판/랭킹/마이페이지)가 그대로", ["page-exchange", "page-board", "page-ranking", "page-mypage"].every((id) => html.indexOf('id="' + id + '"') !== -1));
}

/* ---- 수정 금지 파일 ---- */
{
  const locked = ["trading", "ui", "auth", "supabase-sync", "chat", "leaderboard", "admin", "season", "board", "orderbook", "chart", "websocket"];
  const changed = execSync("git -C " + REPO + " diff --name-only HEAD", { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  const touched = locked.filter((n) => changed.indexOf("js/" + n + ".js") !== -1);
  ok("수정 금지 12개 파일을 건드리지 않았다", touched.length === 0, touched.join(", "));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
