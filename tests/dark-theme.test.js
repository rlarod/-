/* tests/dark-theme.test.js
 * 다크 화면 점검.
 *
 * 이 파일이 지키는 것
 *   1) 빨강은 손익 표시에만 쓴다 — 공지·탭 같은 곳에 쓰면 화면 전체가
 *      "뭔가 잘못된" 것처럼 읽힙니다
 *   2) 밝은 배경 위에는 어두운 글자를 쓴다 (금색 배경 + 흰 글자는 안 읽힘)
 *   3) 글자가 칸 밖으로 삐져나오지 않는다
 *   4) 팔레트는 레퍼런스 실측값 그대로
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const 다크 = CSS.slice(CSS.indexOf('html[data-theme="dark"]{'));

console.log("\n다크 화면");

/* ---------- 빨강은 손익에만 ---------- */
{
  /* 2026-08-20 실측 — 공지 라벨, 상품 탭, 헤더 공지 태그가 전부 빨강이라
     화면이 경고투성이로 보였습니다. 빨강은 하락·손실 전용입니다. */
  ok("상품 탭은 빨강이 아니다",
    /\.product-tab-btn\.active\{[^}]*var\(--gold\)/.test(다크),
    "지금 보고 있는 탭은 강조지 손실이 아닙니다");
  ok("공지 라벨은 빨강이 아니다",
    /\.notice-tag-notice\{color:var\(--tl-blue\)\}/.test(다크.replace(/;\}/g, "}")) ||
    /\.notice-tag-notice\{color:var\(--tl-blue\);\}/.test(다크));
  ok("헤더 공지 태그는 빨강이 아니다",
    /\.header-notice-tag\{[^}]*background:var\(--tl-blue\)/.test(다크));

  /* 손익 표시는 그대로 빨강이어야 합니다 — 여기까지 바꾸면 안 됩니다. */
  ok("하락 색은 그대로 남아 있다", /--red:#F0506E/.test(다크));
  ok("상승 색도 그대로", /--green:#26C281/.test(다크));
  ok("강제청산 경고는 빨강 계열 유지", /\.chat-event-liq/.test(CSS) && /240,80,110/.test(CSS));
}

/* ---------- 밝은 배경 + 어두운 글자 ---------- */
{
  /* 금색 배경에 흰 글자는 거의 안 읽힙니다(실측으로 발견). */
  ok("금색 배지는 어두운 글자를 쓴다",
    /\.ami-symbol-badge\.on\{[^}]*color:#191600/.test(다크),
    "금색 위 흰 글자는 읽히지 않습니다");
  ok("카카오 버튼도 같은 원칙", /\.kakao-login-btn\{background:#FEE500;color:#191600;\}/.test(CSS));
}

/* ---------- 글자가 칸을 넘지 않는다 ---------- */
{
  /* 실측 — "교차(Cross) ▾" 가 두 줄로 접혀 아래 버튼 위로 흘렀고,
     "비트코인 (BTCUSDT)" 는 '거래중' 배지와 22x26px 겹쳤습니다. */
  ok("증거금 방식 버튼은 한 줄로 고정", /\.margin-mode-badge\{[^}]*white-space:nowrap/.test(CSS));
  ok("종목 이름은 넘치면 …으로 자른다",
    /\.ami-symbol-row > span:first-child\{[^}]*text-overflow:ellipsis/.test(CSS));
  ok("배지를 겹쳐 놓지 않고 나란히 둔다",
    /\.ami-symbol-badge\{[^}]*position:static/.test(CSS),
    "겹쳐 놓기(absolute)가 겹침의 원인이었습니다");
  ok("종목 줄이 이름과 배지를 양끝으로 나눈다",
    /\.ami-symbol-row\{[^}]*justify-content:space-between/.test(CSS));
}

/* ---------- 팔레트 ---------- */
{
  [["--bg:#0A0F1C", "페이지 배경"], ["--surface:#101727", "카드"],
   ["--border:#1D273B", "테두리"], ["--gold:#F0B429", "포인트"],
   ["--text:#E7ECF5", "본문 글자"]].forEach(([v, label]) => {
    ok(label + " 값이 실측 그대로", 다크.indexOf(v) !== -1, v);
  });
  ok("카드 모서리 10px", /--card-radius:10px/.test(다크));
}

/* ---------- 밝은 모드는 보존 ---------- */
{
  ok("밝은 모드 색 정의가 남아 있다", /--surface:#FFFFFF/.test(CSS),
    "지우지 않고 감춰두기로 했습니다");
  ok("다크 전용 규칙은 data-theme 로 한정한다",
    (다크.match(/html\[data-theme="dark"\]/g) || []).length > 5,
    "밝은 모드를 다시 만들 때 서로 안 섞이게 합니다");
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
