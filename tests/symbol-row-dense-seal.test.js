/* tests/symbol-row-dense-seal.test.js
 * =========================================================================
 * 오른쪽 종목 줄 높이 — 2026-10-08 PM 배정 / 수리팀 (TL-024)
 * =========================================================================
 *   대표: "업비트랑 차이가 너무 심해;; 크기부터 모든 ㄷㄷ 다 분석해서 ㄱㄱ"
 *
 *   1440 실측 — 종목 줄 높이  업비트 45px / 우리 ★72.6px★ (1.6배).
 *   72.6px -> 51.2px. 네 줄 합 289.9px -> 204.3px (-85.6px).
 *
 * ── 72.6px 의 내역 (1440 실측, 한 줄) ──────────────────────────────────
 *     위 여백 11.0 + 이름 23.8 + 사이 2.0 + 코드 23.8 + 아래 여백 11.0
 *     + 줄 아래 선 1.0  =  72.6px
 *   우리는 업비트와 달리 ★이름/코드 두 줄★ 이라 45px 까지는 못 내려갑니다.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ 두 가지 ──────────────────────────────
 *
 *   ① ★글씨를 줄여서★ 줄을 낮추는 것
 *      줄을 낮추는 가장 쉬운 방법은 17px 을 14px 로 내리는 것입니다.
 *      대표가 "14px 도 작다" 고 ★세 번★ 말씀하셨습니다.
 *      아래 [3] 이 새 CSS 에 font-size 가 ★한 줄도 없는지★ 보고,
 *      css/upbit-layout.css 의 17px 세 곳이 그대로인지 봅니다.
 *      (tests/symbol-category-tabs-seal.test.js ·
 *       tests/symbol-search-seal.test.js 도 17px 바닥을 따로 봅니다)
 *
 *   ② ★별(관심 종목) 누르는 칸이 줄 밖으로 삐져나오는 것★
 *      css/symbol-category-tabs.css 는 별을 `height:52px` 로 두었고
 *      그 주석에 전제가 적혀 있습니다 —
 *          "줄 높이가 73px 이라 세로로 늘릴 자리는 넉넉합니다"
 *      ★이 건이 그 전제를 깹니다.★ 줄이 51.2px 이 되면 52px 짜리 별이
 *      줄 밖으로 나와 위아래 줄의 별과 겹치고, 어느 종목의 별을 누른 건지
 *      알 수 없게 됩니다. 오류는 안 납니다 — 조용한 고장입니다.
 *      그래서 별을 44px 로 낮췄습니다.
 *      아래 [4] 가 ★44px 이상(최소 누르는 칸)★ 이면서 동시에
 *      ★줄 높이 이하(삐져나오지 않음)★ 인지를 ★숫자로 계산해서★ 봅니다.
 *      둘 중 하나만 지키면 통과하지 않습니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] 칸·줄·순서를 하나도 지우지 않았다
 *   [3] ⭐⭐ 글씨 17px 을 한 글자도 안 건드렸다
 *   [4] ⭐⭐ 별 누르는 칸이 44px 이상이면서 줄 안에 들어간다
 *   [5] 줄간격을 한글이 잘릴 만큼 줄이지 않았다 (1.25 이상)
 *   [6] 여백을 longhand 로만 줄였다 (별 자리 padding-left 를 지운다)
 *   [7] index.html 등록 + ★카테고리 탭 CSS 보다 뒤★ + git 추적
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

const CSS_REL = "css/symbol-row-dense.css";
const LAYOUT_REL = "css/upbit-layout.css";
const CAT_REL = "css/symbol-category-tabs.css";

const CSS = read(CSS_REL);
const HTML = read("index.html");

function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const 납작 = (s) => 코드만(s).replace(/\s*\n\s*/g, "");
const CSS_CODE = 코드만(CSS);
const CSS_FLAT = 납작(CSS);
const LAYOUT_FLAT = 납작(read(LAYOUT_REL));
const CAT_FLAT = 납작(read(CAT_REL));

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

console.log("\n종목 줄 높이 (TL-024 · 72.6px -> 51.2px)");

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
 * [2] 아무것도 지우지 않았다
 * ========================================================================= */
절("[2] 칸·줄·순서를 하나도 지우지 않았다");
{
  ok("새 CSS 에 display:none 이 없다", !/display:\s*none/.test(CSS_CODE),
    "줄이나 칸을 숨기면 높이는 줄지만 회원이 종목을 못 봅니다");
  ok("새 CSS 가 display 를 아예 안 건드린다", !/display:/.test(CSS_CODE),
    "td 의 display 를 바꾸면 표 열 정렬이 깨집니다");
  ok("새 CSS 가 글자를 자르지 않는다 (overflow·text-overflow 금지)",
    !/overflow/.test(CSS_CODE) && !/text-overflow/.test(CSS_CODE) &&
    !/white-space/.test(CSS_CODE));
  ok("새 CSS 가 content: 로 글자를 바꿔치지 않는다",
    !/\bcontent\s*:/.test(CSS_CODE));
  ok("새 CSS 가 높이를 못박은 곳은 ★별 하나뿐★ 이다",
    /* line-height 는 세지 않습니다 — \b 가 하이픈 뒤에서도 걸립니다 */
    (CSS_CODE.match(/(?:^|[^-\w])height\s*:/g) || []).length === 1 &&
    /\.tl-symfav\{height:/.test(CSS_FLAT),
    "줄에 height 를 못박으면 글꼴이 대체될 때 글자가 잘립니다. " +
    "지금 height 를 쓰는 곳: " +
    (CSS_CODE.match(/[^\n]*(?:^|[^-\w])height\s*:[^;]*/g) || []).join(" | "));
  ok("js/upbit-right-column.js 가 아직 칸 3개를 만든다 (무수정 확인)",
    (코드만(read("js/upbit-right-column.js")).match(/createElement\("td"\)/g) || [])
      .length === 3,
    "칸 수가 바뀌었다면 이 봉인의 전제가 바뀐 것입니다");
}

/* =========================================================================
 * [3] 글씨 17px 을 한 글자도 안 건드렸다
 * ========================================================================= */
절("[3] ⭐⭐ 글씨 17px 을 한 글자도 안 건드렸다");
{
  ok("새 CSS 에 font-size 가 ★한 줄도 없다★", !/font-size/.test(CSS_CODE),
    '대표가 "14px 도 작다" 고 세 번 말씀하셨습니다. ' +
    "지금 들어 있는 것: " + (CSS_CODE.match(/font-size:[^;]*/g) || []).join(","));
  ok("새 CSS 에 transform:scale / zoom 같은 우회 축소가 없다",
    !/transform/.test(CSS_CODE) && !/zoom/.test(CSS_CODE),
    "scale 로 줄이면 font-size 검사를 피해 가면서 글씨가 작아집니다");
  ok("새 CSS 가 font 관련을 아예 안 건드린다 (굵기·자간 포함)",
    !/font-weight/.test(CSS_CODE) && !/letter-spacing/.test(CSS_CODE) &&
    !/font-family/.test(CSS_CODE));

  /* 숙주 파일의 17px 세 곳이 그대로인지 */
  ok(LAYOUT_REL + " 의 한글 이름이 아직 ★17px★ 이다",
    /\.tl-sym-kr\{[^}]*font-size:17px/.test(LAYOUT_FLAT));
  ok(LAYOUT_REL + " 의 종목 코드가 아직 ★17px★ 이다",
    /\.tl-sym-code\{[^}]*font-size:17px/.test(LAYOUT_FLAT));
  ok(LAYOUT_REL + " 의 표 칸이 아직 ★17px★ 이다",
    /\.tl-sym-table td\{[^}]*font-size:17px/.test(LAYOUT_FLAT));
}

/* =========================================================================
 * [4] 별 누르는 칸 — 44px 이상이면서 줄 안에 들어간다
 * ========================================================================= */
절("[4] ⭐⭐ 별 누르는 칸이 44px 이상이면서 ★줄 안에★ 들어간다");
{
  const 별 = CSS_FLAT.match(/\.tl-symfav\{[^}]*height:\s*([\d.]+)px/);
  ok("새 CSS 가 별 높이를 정한다", !!별,
    CAT_REL + " 의 52px 을 그대로 두면 51px 줄 밖으로 삐져나옵니다");
  const 별높이 = 별 ? Number(별[1]) : NaN;

  ok("⭐ 별 누르는 칸이 ★44px 이상★ 이다 (" + 별높이 + "px)", 별높이 >= 44,
    "최소 누르는 칸 44px — 폰에서 손가락으로 못 누릅니다");

  /* 줄 높이를 CSS 값으로 ★계산★ 해서 별이 들어가는지 봅니다.
     줄 높이 = 위여백 + 이름줄 + 코드줄 + 아래여백 + 줄아래선
     글자 17px 은 숙주 파일에서 읽어옵니다(여기 숫자를 박지 않습니다). */
  const 위 = CSS_FLAT.match(/\.tl-sym-table td\{[^}]*padding-top:\s*([\d.]+)px/);
  const 아래 = CSS_FLAT.match(/\.tl-sym-table td\{[^}]*padding-bottom:\s*([\d.]+)px/);
  const 줄간 = CSS_FLAT.match(/\.tl-sym-kr\{[^}]*line-height:\s*([\d.]+)/);
  const 글자 = LAYOUT_FLAT.match(/\.tl-sym-kr\{[^}]*font-size:\s*([\d.]+)px/);
  const 선 = LAYOUT_FLAT.match(/\.tl-sym-table td\{[^}]*border-bottom:\s*([\d.]+)px/);
  ok("줄 높이를 계산할 값이 전부 있다",
    !!(위 && 아래 && 줄간 && 글자 && 선),
    "위:" + !!위 + " 아래:" + !!아래 + " 줄간:" + !!줄간 +
    " 글자:" + !!글자 + " 선:" + !!선);

  if (위 && 아래 && 줄간 && 글자 && 선) {
    const 줄높이 = Number(위[1]) + Number(아래[1]) +
      2 * Number(글자[1]) * Number(줄간[1]) + Number(선[1]);
    ok("⭐⭐ 별(" + 별높이 + "px)이 줄(계산 " + 줄높이.toFixed(1) +
       "px) ★안에 들어간다★",
      별높이 <= 줄높이,
      "삐져나오면 위아래 줄의 별과 겹쳐서 어느 종목의 별을 누른 건지 " +
      "알 수 없게 됩니다(조용한 고장). 줄을 더 낮추려면 별도 같이 낮추되 " +
      "44px 아래로는 못 내립니다 — 그 아래로 내려야 한다면 멈추고 보고하세요");
    ok("줄 높이가 두 줄 최소값(" +
       (2 * Number(글자[1]) * Number(줄간[1]) + Number(선[1])).toFixed(1) +
       "px) 이상이다 — " + 줄높이.toFixed(1) + "px",
      줄높이 >= 2 * Number(글자[1]) * Number(줄간[1]) + Number(선[1]));
  }

  /* 별 가로폭은 건드리지 않았는지 — 가로를 키우면 표가 카드를 밀고 나갑니다 */
  ok("별 ★가로폭★ 은 건드리지 않았다 (360 에서 표가 카드를 밀고 나감)",
    !/\.tl-symfav\{[^}]*width:/.test(CSS_FLAT),
    CAT_REL + " 의 실측표 참고 — 가로 30px 은 그 파일이 재서 고른 값입니다");
  ok(CAT_REL + " 의 별 가로폭이 아직 30px 이다",
    /\.tl-symfav\{[^}]*width:\s*30px/.test(CAT_FLAT));
}

/* =========================================================================
 * [5] 줄간격을 한글이 잘릴 만큼 줄이지 않았다
 * ========================================================================= */
절("[5] 줄간격을 한글이 잘릴 만큼 줄이지 않았다");
{
  const 줄간들 = (CSS_FLAT.match(/line-height:\s*([\d.]+)(?!px)/g) || [])
    .map((s) => Number(s.replace(/[^\d.]/g, "")));
  ok("줄간격이 전부 ★1.25 이상★ 이다 (" + (줄간들.join(",") || "없음") + ")",
    줄간들.length > 0 && 줄간들.every((n) => n >= 1.25),
    "17px 한글은 1.25 아래로 가면 위아래가 붙어 읽기 어려워집니다");
  ok("줄간격을 px 로 못박지 않았다 (글꼴이 바뀌면 어긋남)",
    !/line-height:\s*[\d.]+px/.test(CSS_FLAT));
}

/* =========================================================================
 * [6] 여백을 longhand 로만 줄였다
 * ========================================================================= */
절("[6] 여백을 longhand 로만 줄였다 — 별 자리를 지우지 않는다");
{
  ok("⭐ padding ★shorthand★ 를 쓰지 않았다 (padding-top/bottom 만)",
    !/\bpadding\s*:/.test(CSS_CODE) &&
    /padding-top:/.test(CSS_CODE) && /padding-bottom:/.test(CSS_CODE),
    "`padding:3px 10px` 처럼 한꺼번에 쓰면 " + CAT_REL +
    " 가 별 자리로 내준 padding-left:34px 가 지워져 별이 글자 위에 겹칩니다");
  ok(CAT_REL + " 의 별 자리(padding-left)가 아직 살아 있다",
    /td\.tl-sym-name\{[^}]*padding-left:\s*([\d.]+)px/.test(CAT_FLAT));
  ok("위아래 여백만 줄였다 (margin 은 이름-코드 사이 하나뿐)",
    (CSS_CODE.match(/\bmargin[^:]*:/g) || []).length === 1 &&
    /\.tl-sym-code\{[^}]*margin-top:\s*0/.test(CSS_FLAT));
  ok("새 색을 만들지 않았다 · 그림자 없음 · 이모지 없음",
    !/#[0-9a-fA-F]{3,8}\b/.test(CSS_CODE) && !/box-shadow/.test(CSS_CODE) &&
    !/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(CSS_CODE));
  ok("--tl-chart-row 를 건드리지 않는다", !/--tl-chart-row/.test(CSS_CODE),
    "차트 행 높이를 건드리면 autoSize:true 와 맞물려 차트가 무한히 커집니다");
  ok("style.css 에 .tl-sym-table 규칙이 새로 안 들어갔다",
    !/\.tl-sym-table/.test(코드만(read("style.css"))),
    "tests/css-duplicate-rules.test.js 가 style.css 중복 규칙 수를 고정합니다");
}

/* =========================================================================
 * [7] index.html 등록 + 순서 + git 추적
 * ========================================================================= */
절("[7] index.html 등록 + ★카테고리 탭 CSS 보다 뒤★ + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다", HTML.includes("href=\"" + CSS_REL + "\""));
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf("style.css"));
  ok("새 CSS 가 " + LAYOUT_REL + " 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf('href="' + LAYOUT_REL + '"'),
    "앞에 있으면 여백이 11px 로 되돌아갑니다");
  ok("⭐ 새 CSS 가 " + CAT_REL + " 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf('href="' + CAT_REL + '"'),
    "앞에 있으면 별 높이가 52px 로 되돌아가 줄 밖으로 삐져나옵니다");
  const n = HTML.split(CSS_REL).length - 1;
  ok("index.html 에 " + CSS_REL + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1);

  const 추적 = execFileSync("git", ["ls-files", "--", CSS_REL], { cwd: REPO })
    .toString().trim();
  ok(CSS_REL + " 가 git 에 올라가 있다", 추적 === CSS_REL,
    "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");

  ok("_order.txt 에 이 파일이 등록돼 있다",
    read("tests/_order.txt").includes("tests/symbol-row-dense-seal.test.js"));
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " symbol-row-dense-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
