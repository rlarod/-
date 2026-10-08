/* tests/stats-bar-dense-seal.test.js
 * =========================================================================
 * 시세 바 높이 줄이기 — 2026-10-08 PM 배정 / 수리팀 (TL-024)
 * =========================================================================
 *   대표: "업비트랑 차이가 너무 심해;; 크기부터 모든 ㄷㄷ 다 분석해서 ㄱㄱ"
 *
 *   1440 실측 — 차트 ★위★ 가 업비트보다 591px 두꺼웠습니다.
 *     시세 바   업비트 44px  /  우리 103px
 *   103px -> 72px (-31px).
 *
 * ── ⚠ "한 줄" 은 ★불가능★ 합니다 — 숫자로 확인했습니다 ──────────────────
 *   1440 에서 항목 7개의 폭 합이 ★1,379.9px★ + 항목 사이 간격 30px = 1,409.9px.
 *   그런데 시세 바가 쓸 수 있는 폭은 ★988px★ 뿐입니다
 *   (바가 1440 전체가 아니라 .page-left 안에 들어 있어 990px).
 *   ★422px 모자랍니다.★ 간격을 0 으로 해도 안 들어갑니다.
 *   그래서 두 줄을 두고 ★줄 자체를 얇게★ 했습니다.
 *
 *   103px 의 정체는 "두 줄" 이 아니라 ★첫 줄이 혼자 61.8px★ 인 것이었습니다
 *   (대표가격 블록만 2단: 이름표 위 / 값 아래). 그 하나를 나란히 눕혀
 *   37.8px 이 되었습니다. 나머지 6개는 이미 나란히였습니다.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ 두 가지 ──────────────────────────────
 *
 *   ① ★글씨를 줄여서★ 한 줄에 넣는 것
 *      422px 을 벌 수 있는 유일한 방법은 글씨를 줄이거나 이름표를 자르는
 *      것입니다. 그런데 대표가 "14px 도 작다" 고 ★세 번★ 말씀하셨습니다.
 *      아래 [3] 이 새 CSS 에 font-size 가 ★한 줄도 없는지★ 보고,
 *      style.css 의 27px(가격) · 17px(이름표) · 18px(값)이 그대로인지 봅니다.
 *
 *   ② ★다시 nowrap + overflow-x 로 돌아가는 것★
 *      한 줄로 보이게 하는 가장 쉬운 방법은 줄바꿈을 막고 가로 스크롤로
 *      미는 것입니다(원래 그랬습니다). 그러면 ★마크가격이 상자 안에 갇혀
 *      화면 밖으로 사라집니다★ — 2026-08-24 에 실제로 났던 사고이고,
 *      ★페이지 가로 스크롤로는 안 잡힙니다★(상자가 넘침을 자기 안에 가둠).
 *      stats-bar-desktop-wrap.css 가 그걸 고치려고 wrap 으로 바꿔 둔 것입니다.
 *      아래 [4] 가 그 되돌림을 금지합니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] 항목을 하나도 지우지 않았다 (마크업 .stat-block 5개 + 주입 2개)
 *   [3] ⭐⭐ 글씨를 한 글자도 줄이지 않았다 (27 / 17 / 18px 그대로)
 *   [4] ⭐⭐ nowrap + overflow-x 로 되돌리지 않았다 (마크가격이 숨지 않는다)
 *   [5] 높이를 줄인 수단이 ★여백과 방향★ 뿐이다
 *   [6] style.css · 봉인 CSS 를 안 건드렸다
 *   [7] index.html 등록 + ★폰·데스크톱 시세 바 파일보다 뒤★ + git 추적
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 항목 주석에 적어 뒀습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/stats-bar-dense.css";
const MOBILE_REL = "stats-bar-mobile-wrap.css";
const DESKTOP_REL = "stats-bar-desktop-wrap.css";

const CSS = read(CSS_REL);
const HTML = read("index.html");
const STYLE = read("style.css");

function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const CSS_CODE = 코드만(CSS);
/* 줄바꿈·들여쓰기를 지운 style.css — 선언을 한 덩어리로 찾기 위해 */
const STYLE_FLAT = 코드만(STYLE).replace(/\s*\n\s*/g, "");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

console.log("\n시세 바 높이 (TL-024 · 103px -> 72px)");

/* =========================================================================
 * [1] 수정 금지 파일 12개
 * ========================================================================= */
절("[1] 수정 금지 파일 12개가 그대로다");
{
  const { BY_FILE } = require("./_locked-hashes.js");
  [
    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
    "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
    "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
  ].forEach((f) => {
    const 실제 = crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok(f + " 가 그대로다", 실제 === BY_FILE[f],
      "기준 " + BY_FILE[f] + " / 지금 " + 실제);
  });
}

/* =========================================================================
 * [2] 항목을 하나도 지우지 않았다
 * ========================================================================= */
절("[2] 시세 항목을 하나도 지우지 않았다");
{
  /* 마크업에 있는 5개 — 대표가격 · 24H 변동률 · 고가 · 저가 · 거래량.
     나머지 2개(마크가격 · 펀딩비)는 다른 모듈이 넣습니다. */
  const 바 = HTML.slice(HTML.indexOf('class="stats-bar'),
                       HTML.indexOf("/.tl-stats-hint-layer"));
  const n = (바.match(/class="stat-block/g) || []).length;
  ok("index.html 의 시세 바에 항목이 ★5개 그대로★ 다 (" + n + "개)", n === 5,
    "높이를 줄이려고 항목을 지우면 회원이 정보를 못 봅니다");
  ["stat-price", "stat-change", "stat-high", "stat-low", "stat-volume"]
    .forEach((id) => {
      ok("  " + id + " 가 그대로 있다", 바.includes('id="' + id + '"'));
    });
  ok("새 CSS 가 display:none 으로 항목을 숨기지 않는다",
    !/display:\s*none/.test(CSS_CODE),
    "항목을 숨기면 높이는 줄지만 회원이 못 봅니다");
  ok("새 CSS 가 이름표 글자를 자르지 않는다 (content 치환 금지)",
    !/\bcontent:/.test(CSS_CODE) && !/text-overflow/.test(CSS_CODE),
    '"24H 고가" 를 "고가" 로 바꾸는 것도 정보를 줄이는 것입니다');
}

/* =========================================================================
 * [3] 글씨를 한 글자도 줄이지 않았다
 * ========================================================================= */
절("[3] ⭐⭐ 글씨를 한 글자도 줄이지 않았다");
{
  ok("새 CSS 에 font-size 가 ★한 줄도 없다★", !/font-size/.test(CSS_CODE),
    '대표가 "14px 도 작다" 고 세 번 말씀하셨습니다. ' +
    "지금 들어 있는 것: " + (CSS_CODE.match(/font-size:[^;]*/g) || []).join(","));
  ok("새 CSS 에 transform:scale 같은 우회 축소가 없다",
    !/transform/.test(CSS_CODE) && !/zoom/.test(CSS_CODE),
    "scale 로 줄이면 font-size 검사를 피해 가면서 글씨가 작아집니다");

  /* style.css 의 원래 크기가 그대로인지 — 누가 거기서 줄이지 않았나 */
  ok("style.css 의 대표가격이 아직 ★27px★ 이다",
    /\.main-price-block\s*\.stat-value\.price\{[^}]*font-size:27px/.test(STYLE_FLAT),
    "가격은 이 바에서 가장 큰 글씨입니다");
  ok("style.css 의 이름표가 아직 ★17px★ 이다",
    /\.stat-label\{[^}]*font-size:17px/.test(STYLE_FLAT),
    "2026-09-04 에 15px -> 17px 로 키운 것입니다. 되돌리면 잔글씨가 됩니다");
  ok("style.css 의 값이 아직 ★18px★ 이다",
    /\.stat-value\{[^}]*font-size:18px/.test(STYLE_FLAT));
}

/* =========================================================================
 * [4] nowrap + overflow-x 로 되돌리지 않았다
 * ========================================================================= */
절("[4] ⭐⭐ 가로 스크롤 상자로 되돌리지 않았다 (마크가격이 숨지 않는다)");
{
  ok("새 CSS 가 flex-wrap 을 nowrap 으로 되돌리지 않는다",
    !/flex-wrap:\s*nowrap/.test(CSS_CODE),
    "nowrap 으로 두면 넘치는 항목(마크가격)이 상자 안에 갇혀 화면 밖으로 " +
    "사라집니다. 2026-08-24 에 실제로 났던 사고이고 페이지 가로 스크롤로는 " +
    "안 잡힙니다");
  ok("새 CSS 가 overflow 를 건드리지 않는다", !/overflow/.test(CSS_CODE),
    "overflow:hidden 으로 넘침을 가두면 같은 사고가 납니다");
  ok("새 CSS 가 max-width/width 로 바를 좁히지 않는다",
    !/\b(?:max-)?width:/.test(CSS_CODE));
  /* 고친 쪽(desktop-wrap)의 wrap 선언이 아직 살아 있는지 */
  const DESKTOP_FLAT = 코드만(read(DESKTOP_REL)).replace(/\s*\n\s*/g, "");
  ok(DESKTOP_REL + " 의 flex-wrap:wrap 이 아직 살아 있다",
    /\.stats-bar\{[^}]*flex-wrap:wrap/.test(DESKTOP_FLAT),
    "이 선언이 사라지면 1440·1920 에서 24H 거래량이 다시 잘립니다");
  const MOBILE_FLAT = 코드만(read(MOBILE_REL)).replace(/\s*\n\s*/g, "");
  ok(MOBILE_REL + " 의 flex-wrap:wrap 이 아직 살아 있다",
    /flex-wrap:\s*wrap/.test(MOBILE_FLAT));
}

/* =========================================================================
 * [5] 높이를 줄인 수단이 여백과 방향뿐이다
 * ========================================================================= */
절("[5] 높이를 줄인 수단이 ★여백과 방향★ 뿐이다");
{
  ok("⭐ 대표가격 블록을 ★나란히(row)★ 눕혔다 — 이게 -24px 의 정체다",
    /\.main-price-block\{[^}]*flex-direction:row/
      .test(CSS_CODE.replace(/\s*\n\s*/g, "")),
    "첫 줄이 혼자 61.8px 이던 이유가 이 블록만 2단이었기 때문입니다");
  ok("밑선 정렬(baseline)로 27px 가격과 17px 이름표를 맞췄다",
    /align-items:\s*baseline/.test(CSS_CODE));
  ok("종목 고르는 버튼은 가운데 정렬로 빼 두었다 (눌러야 하므로)",
    /\.symbol-select-wrap\{[^}]*align-self:\s*center/
      .test(CSS_CODE.replace(/\s*\n\s*/g, "")),
    "baseline 로 두면 버튼 테두리가 가격 글자 밑선까지 끌려 내려갑니다");
  ok("위아래 여백·줄 사이만 줄였다 (padding-top/bottom · row-gap)",
    /padding-top:\s*2px/.test(CSS_CODE) &&
    /padding-bottom:\s*2px/.test(CSS_CODE) &&
    /row-gap:\s*3px/.test(CSS_CODE));
  ok("높이를 px 로 못박지 않았다 (height/max-height 금지)",
    !/\bheight:/.test(CSS_CODE) && !/max-height/.test(CSS_CODE),
    "글꼴이 대체되면 글자가 잘립니다");
  ok("line-height 를 줄이지 않았다",
    !/line-height/.test(CSS_CODE),
    "줄간격을 줄이면 글자 위아래가 잘려 보입니다");
}

/* =========================================================================
 * [6] 봉인된 CSS 를 안 건드렸다
 * ========================================================================= */
절("[6] style.css · 봉인 CSS 를 안 건드렸다");
{
  ok("style.css 에 .main-price-block{flex-direction:row} 가 새로 안 들어갔다",
    !/\.main-price-block\{[^}]*flex-direction:row/.test(STYLE_FLAT),
    "tests/css-duplicate-rules.test.js 가 style.css 중복 규칙 수를 고정합니다");
  ok("style.css 의 원래 예외 규칙이 그대로 있다",
    /\.stat-block:not\(\.main-price-block\)\{flex-direction:row/.test(STYLE_FLAT),
    "이 규칙이 사라졌다면 이 봉인의 전제가 바뀐 것입니다");
  ok("css/upbit-layout.css 에 .stats-bar 규칙이 없다",
    !/\.stats-bar/.test(코드만(read("css/upbit-layout.css"))));
  ok("--tl-chart-row 를 건드리지 않는다", !/--tl-chart-row/.test(CSS_CODE),
    "차트 행 높이를 건드리면 autoSize:true 와 맞물려 차트가 무한히 커집니다");
  ok("새 색을 만들지 않았다 (확정 팔레트)",
    !/#[0-9a-fA-F]{3,8}\b/.test(CSS_CODE) && !/\brgb/.test(CSS_CODE));
  ok("그림자를 쓰지 않는다", !/box-shadow/.test(CSS_CODE));
}

/* =========================================================================
 * [7] index.html 등록 + 순서 + git 추적
 * ========================================================================= */
절("[7] index.html 등록 + ★폰·데스크톱 파일보다 뒤★ + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다", HTML.includes("href=\"" + CSS_REL + "\""));
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf("style.css"));
  ok("새 CSS 가 " + MOBILE_REL + " 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf('href="' + MOBILE_REL + '"'),
    "앞에 있으면 폰 구간에서 !important 없이는 못 이깁니다");
  ok("새 CSS 가 " + DESKTOP_REL + " 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf('href="' + DESKTOP_REL + '"'),
    "앞에 있으면 701px 이상에서 row-gap 이 6px 로 되돌아갑니다");
  const n = HTML.split(CSS_REL).length - 1;
  ok("index.html 에 " + CSS_REL + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1);

  const 추적 = execFileSync("git", ["ls-files", "--", CSS_REL], { cwd: REPO })
    .toString().trim();
  ok(CSS_REL + " 가 git 에 올라가 있다", 추적 === CSS_REL,
    "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");

  ok("_order.txt 에 이 파일이 등록돼 있다",
    read("tests/_order.txt").includes("tests/stats-bar-dense-seal.test.js"));
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " stats-bar-dense-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
