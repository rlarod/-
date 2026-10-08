/* tests/symbol-tabs-wide-hide-seal.test.js
 * =========================================================================
 * 넓은 화면에서 ★왼쪽 종목 탭 줄★ 숨기기 — 2026-10-08 PM 배정 / 수리팀 (TL-024)
 * =========================================================================
 *   대표: "업비트랑 차이가 너무 심해;; 크기부터 모든 ㄷㄷ 다 분석해서 ㄱㄱ"
 *
 *   1440 실측 — 차트 ★위★ 가 업비트보다 591px 두꺼웠습니다.
 *     종목 탭 줄   업비트 0px  /  우리 49px
 *   왼쪽 탭 4개는 오른쪽 종목 목록(.tl-sym-list)과 하는 일이 똑같습니다.
 *   넓은 화면에서만 줄을 내려 49px -> 0px.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ ──────────────────────────────────────
 *
 *   ★폰에서 종목을 못 바꾸게 되는 것★
 *
 *   css/upbit-layout.css 가 `@media (min-width:1100px)` 에서만 오른쪽 열을
 *   차트 옆에 붙입니다. ★1100 아래에서는 오른쪽 열이 맨 아래로 내려갑니다★
 *   (390 실측 — .tl-sym-list 가 y=1795, 360 실측 y=2265).
 *
 *   그 화면에서 이 탭 줄까지 숨기면 ★폰에서 종목을 바꿀 길이 없어집니다.★
 *   그런데 화면은 멀쩡하고 오류도 안 납니다 — 조용한 고장입니다.
 *   넓은 모니터로 확인하는 사람은 ★영원히 못 봅니다.★
 *
 *   그래서 아래 [3] 이 ★두 파일의 분기점 숫자를 직접 꺼내 맞춰봅니다.★
 *     · 새 CSS 가 숨기는 구간          min-width:1100px
 *     · upbit-layout 이 열을 붙이는 구간 min-width:1100px
 *   한쪽만 고치면 그 자리에서 터집니다. 주석으로 "맞추세요" 라고 적어두는
 *   것으로는 아무도 안 지킵니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] 마크업을 지우지 않았다 — js/symbol-tabs.js 무수정, display 로만 숨김
 *   [3] ⭐⭐ 숨기는 분기점이 오른쪽 열 분기점과 ★글자 단위로 같다★
 *   [4] ⭐ 좁은 화면 규칙이 아예 없다 (max-width 로 숨기는 규칙 금지)
 *   [5] 글씨·누르는 칸을 건드리지 않았다 (19px / 48px 그대로)
 *   [6] style.css · 봉인 CSS 를 안 건드렸다
 *   [7] index.html 등록 + git 추적 + 경로가 한 번만 나온다
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

const CSS_REL = "css/symbol-tabs-wide-hide.css";
const LAYOUT_REL = "css/upbit-layout.css";
const TABS_JS_REL = "js/symbol-tabs.js";

const CSS = read(CSS_REL);
const LAYOUT = read(LAYOUT_REL);
const TABS_JS = read(TABS_JS_REL);
const HTML = read("index.html");

function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const CSS_CODE = 코드만(CSS);
const LAYOUT_CODE = 코드만(LAYOUT);

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

console.log("\n넓은 화면에서 종목 탭 줄 숨기기 (TL-024 · 49px -> 0px)");

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
 * [2] 마크업을 지우지 않았다
 * ========================================================================= */
절("[2] 마크업을 안 지웠다 — display 로만 숨긴다");
{
  ok("index.html 에 분류 버튼 마크업이 그대로 있다 (.product-tab-btn 3개)",
    (HTML.match(/class="product-tab-btn/g) || []).length === 3,
    "숨기는 것과 지우는 것은 다릅니다 (원칙 1-2)");
  ok("index.html 에 .product-tabs 줄이 그대로 있다",
    /class="product-tabs/.test(HTML));
  ok("js/symbol-tabs.js 가 아직 .product-tabs 에 탭을 넣는다 (무수정)",
    /ROW_SEL\s*=\s*"\.product-tabs"/.test(코드만(TABS_JS)),
    "이 모듈이 바뀌었다면 이 봉인의 전제가 바뀐 것입니다");
  ok("새 CSS 가 display 말고 다른 수법을 쓰지 않는다",
    !/visibility:\s*hidden/.test(CSS_CODE) &&
    !/\bopacity:\s*0\b/.test(CSS_CODE) &&
    !/position:\s*absolute/.test(CSS_CODE) &&
    !/\bcontent:/.test(CSS_CODE),
    "자리만 차지하고 안 보이면 49px 이 그대로 남습니다");
  ok("새 CSS 가 ★.product-tabs 한 줄만★ 건드린다",
    (CSS_CODE.match(/^\s*\.[a-z-]/gim) || []).length <= 2 &&
    /\.product-tabs\s*\{\s*display:\s*none;?\s*\}/.test(CSS_CODE),
    "건드리는 선택자: " + (CSS_CODE.match(/\.[a-zA-Z-]+(?=\s*\{)/g) || []).join(","));
}

/* =========================================================================
 * [3] ⭐⭐ 분기점이 오른쪽 열 분기점과 같다
 * ========================================================================= */
절("[3] ⭐⭐ 숨기는 분기점이 ★오른쪽 열 분기점★ 과 같다");
{
  /* 새 CSS 쪽 — @media (min-width:NNNNpx) 안에서 숨깁니다 */
  const 숨김분기 = (CSS_CODE.match(/@media[^{]*min-width:\s*(\d+)px/g) || [])
    .map((s) => parseInt(s.match(/(\d+)px/)[1], 10));
  ok("새 CSS 가 @media min-width 안에서만 숨긴다 (" + 숨김분기.join(",") + ")",
    숨김분기.length === 1,
    "미디어쿼리가 하나가 아니면 어느 폭에서 숨는지 알 수 없습니다");

  /* 오른쪽 열 쪽 — .page-shell 을 2열로 만드는 @media 를 찾습니다 */
  const 열분기 = [];
  const re = /@media[^{]*min-width:\s*(\d+)px[^{]*\{/g;
  let m;
  while ((m = re.exec(LAYOUT_CODE)) !== null) {
    /* 그 블록 안에 .page-shell 2열 선언이 있는지 봅니다 */
    let i = m.index + m[0].length;
    let depth = 1;
    while (i < LAYOUT_CODE.length && depth > 0) {
      if (LAYOUT_CODE[i] === "{") depth++;
      else if (LAYOUT_CODE[i] === "}") depth--;
      i++;
    }
    const 블록 = LAYOUT_CODE.slice(m.index, i);
    if (/\.page-shell/.test(블록) && /--tl-right-col/.test(블록)) {
      열분기.push(parseInt(m[1], 10));
    }
  }
  ok("오른쪽 열을 옆에 붙이는 분기점을 찾았다 (" + 열분기.join(",") + ")",
    열분기.length === 1,
    LAYOUT_REL + " 의 .page-shell 2열 @media 를 못 찾았습니다. " +
    "그 파일 구조가 바뀌었다면 이 봉인을 다시 설계하세요");

  ok("⭐⭐ 두 분기점이 ★같다★ — 숨김 " + 숨김분기[0] + "px / 오른쪽 열 " +
     열분기[0] + "px",
    숨김분기.length === 1 && 열분기.length === 1 && 숨김분기[0] === 열분기[0],
    "다르면 그 사이 폭에서 ★왼쪽 탭도 없고 오른쪽 목록도 위에 없는★ 구멍이 " +
    "생깁니다. 그 폭의 회원은 종목을 바꿀 길이 없습니다(조용한 고장). " +
    LAYOUT_REL + " 를 고쳤다면 " + CSS_REL + " 도 같이 고치세요");
}

/* =========================================================================
 * [4] 좁은 화면에서는 ★반드시 보인다★
 * ========================================================================= */
절("[4] ⭐ 좁은 화면에서 숨기는 규칙이 아예 없다");
{
  ok("max-width 로 숨기는 규칙이 없다",
    !/max-width/.test(CSS_CODE),
    "좁은 화면에서 숨기면 폰에서 종목을 못 바꿉니다 (오른쪽 열이 맨 아래)");
  ok("미디어쿼리 ★밖★ 에 display:none 이 없다",
    !/^\s*\.product-tabs\s*\{[^}]*display:\s*none/m.test(
      CSS_CODE.replace(/@media[^{]*\{[\s\S]*?\n\}/g, "")),
    "미디어쿼리 밖에 있으면 모든 폭에서 숨어 폰에서 종목을 못 바꿉니다");
  /* 미디어쿼리 바깥에 남은 선언이 하나도 없어야 합니다 */
  const 바깥 = CSS_CODE.replace(/@media[^{]*\{[\s\S]*\}/, "").trim();
  ok("미디어쿼리 밖에는 선언이 하나도 없다", 바깥.length === 0,
    "밖에 남은 것: [" + 바깥.slice(0, 120) + "]");
}

/* =========================================================================
 * [5] 글씨·누르는 칸을 안 건드렸다
 * ========================================================================= */
절("[5] 글씨 19px · 누르는 칸 48px 을 안 건드렸다");
{
  ok("새 CSS 가 font-size 를 아예 안 건드린다", !/font-size/.test(CSS_CODE),
    '대표가 "14px 도 작다" 고 세 번 말씀하셨습니다');
  ok("새 CSS 가 padding/height 를 아예 안 건드린다",
    !/padding/.test(CSS_CODE) && !/\bheight:/.test(CSS_CODE),
    "폰에서 누르는 칸(360 실측 48px)이 줄어듭니다");
  /* style.css 의 원래 값이 그대로인지도 확인 — 누가 같이 줄이지 않았나 */
  const STYLE = read("style.css");
  ok("style.css 의 탭 글씨가 아직 19px 이다",
    /\.symbol-tab-btn\{[^}]*font-size:19px/.test(STYLE.replace(/\s*\n\s*/g, "")),
    "2026-08-28 대표 지시: '처음에 비트코인만 있었던 그 크기로 키워'");
}

/* =========================================================================
 * [6] 봉인된 CSS 를 안 건드렸다
 * ========================================================================= */
절("[6] style.css · 봉인 CSS 를 안 건드렸다");
{
  const STYLE = read("style.css");
  ok("style.css 에 .product-tabs{display:none} 이 새로 들어가지 않았다",
    !/\.product-tabs\s*\{\s*display:\s*none/.test(STYLE.replace(/\s*\n\s*/g, "")),
    "tests/css-duplicate-rules.test.js 가 style.css 중복 규칙 수를 고정합니다");
  ok(LAYOUT_REL + " 에 .product-tabs 규칙이 없다",
    !/\.product-tabs/.test(LAYOUT_CODE),
    "그 파일은 본문이 봉인돼 있습니다");
  ok("--tl-chart-row 를 건드리지 않는다", !/--tl-chart-row/.test(CSS_CODE),
    "차트 행 높이를 건드리면 autoSize:true 와 맞물려 차트가 무한히 커집니다");
}

/* =========================================================================
 * [7] index.html 등록 + git 추적
 * ========================================================================= */
절("[7] index.html 등록 + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다", HTML.includes("href=\"" + CSS_REL + "\""));
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf("style.css"),
    "앞에 있으면 !important 없이는 못 이깁니다");
  ok("새 CSS 가 " + LAYOUT_REL + " 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf(LAYOUT_REL));
  const n = HTML.split(CSS_REL).length - 1;
  ok("index.html 에 " + CSS_REL + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1,
    "주석에 경로를 또 적으면 2회가 됩니다");

  const 추적 = execFileSync("git", ["ls-files", "--", CSS_REL], { cwd: REPO })
    .toString().trim();
  ok(CSS_REL + " 가 git 에 올라가 있다", 추적 === CSS_REL,
    "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");

  ok("_order.txt 에 이 파일이 등록돼 있다",
    read("tests/_order.txt").includes("tests/symbol-tabs-wide-hide-seal.test.js"),
    "등록 안 하면 npm test 가 이 파일을 안 돌립니다");
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " symbol-tabs-wide-hide-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
