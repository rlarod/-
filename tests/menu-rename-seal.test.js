/* tests/menu-rename-seal.test.js
 * =========================================================================
 * "코인선물" -> "선물거래" 이름 바꾸기 + 종목 탭 여백 봉인
 *   2026-08-28 (기록팀) — 디자인팀 변경, 대표 지시
 * =========================================================================
 *
 * ── (1) 왜 이름을 바꿨나 ───────────────────────────────────────────────
 *
 *   나스닥 · 삼성전자 · SK하이닉스를 열면서 코인이 아닌 종목이 생겼습니다.
 *   "코인선물" 이라고 적혀 있으면 회원이 코인만 있는 줄로 오해합니다.
 *
 *   ⭐ 글자만 바뀌었습니다. 속은 그대로입니다 —
 *        data-page="exchange"      페이지 전환이 이 값으로 돕니다
 *        id="page-nav-exchange"    js 가 이 id 로 버튼을 찾습니다
 *
 *   나중에 누가 "이름을 바꿨으니 속도 맞추자" 며 data-page 를 같이 바꾸면
 *   **페이지 전환이 통째로 깨집니다.** 글자와 속을 따로 못 박는 이유입니다.
 *
 * ── (2) 왜 여백이 3px 인가 — 이게 핵심입니다 ──────────────────────────
 *
 *   종목 탭 글자는 19px 입니다. 대표 지시라 줄일 수 없습니다.
 *   그런데 360 화면에서 글꼴이 대체되면 탭이 두 줄로 접힙니다.
 *
 *   디자인팀 실측 (2026-08-28) — 남는 폭:
 *
 *       글꼴                여백 6px          여백 3px
 *       Noto Sans KR       +8.9   한 줄       +32.9  한 줄
 *       Malgun Gothic      -12.0  두 줄 ❌    +12.0  한 줄 ✅
 *
 *   Malgun Gothic 은 윈도우 기본 한글 글꼴입니다. Noto 를 못 받아오면
 *   그걸로 대체되는데, 그때 여백 6px 이면 **12px 이 모자라 두 줄이 됩니다.**
 *
 *   ⚠ 여백을 6px 로 "보기 좋게" 되돌리면 그 자리에서 다시 깨집니다.
 *     Noto 가 잘 받아와지는 내 화면에서는 멀쩡해 보입니다 —
 *     글꼴을 못 받는 회원 화면에서만 두 줄이 됩니다. 조용한 고장입니다.
 *
 *   ⚠ 768 이상은 건드리지 않았습니다 (11px 14px 그대로).
 *     3px 은 폰 미디어쿼리(max-width:700px) 안에만 있습니다.
 *
 * 서버도 브라우저도 부르지 않습니다. 파일만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const HTML = read("index.html");
const CSS = read("style.css");

const 옛이름 = "코인선물";
const 새이름 = "선물거래";

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

console.log("\n메뉴 이름 바꾸기 + 종목 탭 여백 봉인 (2026-08-28)");

/* =========================================================================
 * [1] 글자가 바뀌었다
 * ========================================================================= */
절("[1] 회원이 보는 글자가 " + 새이름 + " 다");
{
  /* 상단 메뉴 — 회원이 제일 먼저 보는 곳 */
  const 메뉴 = /<button[^>]*id="page-nav-exchange"[^>]*>([\s\S]*?)<\/button>/.exec(HTML);
  ok("상단 메뉴 버튼(page-nav-exchange)을 찾았다", !!메뉴,
    "못 찾으면 아래 검사가 전부 공짜로 통과합니다");
  if (메뉴) {
    const 글자 = 메뉴[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    ok("상단 메뉴 글자가 " + 새이름 + " 다", 글자 === 새이름, 글자);
  }

  /* 상품 분류 탭 — 지금은 CSS 로 숨겨져 있지만 글자는 맞춰 둡니다 */
  const 상품탭 = /<button[^>]*class="product-tab-btn active"[^>]*>([\s\S]*?)<\/button>/.exec(HTML);
  ok("상품 분류 탭(product-tab-btn active)을 찾았다", !!상품탭);
  if (상품탭) {
    const 글자 = 상품탭[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    ok("상품 분류 탭 글자도 " + 새이름 + " 다 (숨겨져 있어도 맞춰 둡니다)",
      글자 === 새이름, 글자);
  }
}

/* =========================================================================
 * [2] ⭐ 속은 안 바뀌었다 — 여기를 같이 바꾸면 페이지 전환이 깨집니다
 * ========================================================================= */
절("[2] data-page 와 id 는 그대로다 (글자만 바뀌었습니다)");
{
  ok('data-page="exchange" 가 그대로 있다', HTML.indexOf('data-page="exchange"') !== -1,
    "이 값으로 페이지를 바꿉니다. 이름을 따라 바꾸면 전환이 통째로 깨집니다");
  ok('id="page-nav-exchange" 가 그대로 있다', HTML.indexOf('id="page-nav-exchange"') !== -1,
    "js 가 이 id 로 버튼을 찾습니다");

  /* 이름을 따라 속까지 바꾼 흔적이 없어야 합니다 */
  ["data-page=\"futures\"", "data-page=\"trade\"", "id=\"page-nav-futures\"", "id=\"page-nav-trade\""]
    .forEach(function (나쁜) {
      ok("속을 이름 따라 바꾸지 않았다 — " + 나쁜 + " 가 없다",
        HTML.indexOf(나쁜) === -1,
        "글자만 바꾸는 변경이었습니다. 속을 바꾸면 페이지 전환이 깨집니다");
    });

  /* 그 버튼 하나만 있어야 합니다 */
  ok("page-nav-exchange 버튼이 하나뿐이다",
    HTML.split('id="page-nav-exchange"').length - 1 === 1,
    String(HTML.split('id="page-nav-exchange"').length - 1) + "개");
}

/* =========================================================================
 * [3] 살아있는 코드에 옛 이름이 없다
 * ========================================================================= */
절("[3] 살아있는 코드에 " + 옛이름 + " 이 남아 있지 않다");
{
  /* 일부러 남긴 내력 한 줄만 예외입니다 —
     js/symbol-tabs.js 주석에 "2026-08-28 코인선물 -> 선물거래 가 됐다" 가
     적혀 있습니다. 왜 바뀌었는지를 아는 게 다음 사람에게 도움이 됩니다. */
  const 내력허용 = { "js/symbol-tabs.js": 1 };

  const 볼곳 = ["index.html", "style.css"];
  ["js", "css"].forEach(function (d) {
    let 목록 = [];
    try { 목록 = fs.readdirSync(path.join(REPO, d)); } catch (e) { return; }
    목록.filter((f) => /\.(js|css)$/.test(f)).forEach((f) => 볼곳.push(d + "/" + f));
  });

  ok("훑을 파일을 찾았다 (지금 " + 볼곳.length + "개)", 볼곳.length > 10,
    "0 이면 이 검사는 아무것도 안 지킵니다");

  const 걸린것 = [];
  볼곳.forEach(function (rel) {
    let s = "";
    try { s = read(rel); } catch (e) { return; }
    const 횟수 = s.split(옛이름).length - 1;
    if (!횟수) return;
    const 허용 = 내력허용[rel] || 0;
    if (횟수 > 허용) 걸린것.push(rel + " (" + 횟수 + "곳, 허용 " + 허용 + ")");
  });

  ok("옛 이름이 남은 곳이 없다 (내력 주석 1줄 제외)",
    걸린것.length === 0,
    "남은 곳: " + 걸린것.join(", ") +
    " — 회원이 보는 글자에 옛 이름이 남으면 코인만 있는 줄로 오해합니다");

  /* 예외로 둔 그 한 줄이 실제로 있는지도 봅니다 —
     없어졌으면 예외 자체를 지워야 하고, 늘었으면 알아야 합니다. */
  let ST = "";
  try { ST = read("js/symbol-tabs.js"); } catch (e) { /* noop */ }
  ok("js/symbol-tabs.js 에 남긴 내력이 정확히 한 줄이다",
    ST.split(옛이름).length - 1 === 1,
    String(ST.split(옛이름).length - 1) + "곳 — 늘었으면 진짜 코드에 섞인 것입니다");
  ok("그 내력이 왜 바뀌었는지까지 적고 있다",
    ST.indexOf(새이름) !== -1 && ST.indexOf("2026-08-28") !== -1);
}

/* =========================================================================
 * [4] ⭐ 종목 탭 여백 3px — 글꼴이 대체돼도 한 줄
 * ========================================================================= */
절("[4] 종목 탭 여백이 3px 다 (폰에서만)");
{
  /* @media (max-width:700px) 블록들의 범위를 구합니다 */
  const 범위 = [];
  const 여는말 = "@media (max-width:700px){";
  for (let at = CSS.indexOf(여는말); at !== -1; at = CSS.indexOf(여는말, at + 1)) {
    let 깊이 = 0;
    for (let i = CSS.indexOf("{", at); i < CSS.length; i++) {
      if (CSS[i] === "{") 깊이++;
      else if (CSS[i] === "}") { 깊이--; if (!깊이) { 범위.push([at, i]); break; } }
    }
  }
  ok("폰 미디어쿼리(max-width:700px) 블록을 찾았다 (지금 " + 범위.length + "개)",
    범위.length > 0);

  const 폰여백 = ".symbol-tab-btn{padding:11px 3px;}";
  const 자리 = [];
  for (let i = CSS.indexOf(폰여백); i !== -1; i = CSS.indexOf(폰여백, i + 1)) 자리.push(i);

  ok("폰 여백 규칙이 정확히 한 벌이다 (두 벌이면 뒤엣것이 앞을 덮습니다)",
    자리.length === 1, String(자리.length) + "벌");
  ok("그 규칙이 폰 미디어쿼리 안에 있다 (768 이상은 안 건드립니다)",
    자리.length === 1 && 범위.some((r) => 자리[0] > r[0] && 자리[0] < r[1]),
    "밖에 있으면 노트북·데스크톱 탭 여백까지 3px 이 됩니다");

  /* 데스크톱 기본값은 그대로여야 합니다 */
  const 기본 = /\.symbol-tab-btn\{[^}]*\}/.exec(CSS);
  ok("데스크톱 기본 규칙을 찾았다", !!기본);
  if (기본) {
    ok("데스크톱 기본 여백은 11px 14px 그대로다",
      기본[0].indexOf("padding:11px 14px") !== -1,
      기본[0].replace(/\s+/g, " "));
    ok("글자 크기 19px 은 그대로다 (대표 지시라 못 줄입니다)",
      기본[0].indexOf("font-size:19px") !== -1,
      기본[0].replace(/\s+/g, " "));
    ok("한 줄로 붙여 둔다 (white-space:nowrap)",
      기본[0].indexOf("white-space:nowrap") !== -1);
  }

  /* 6px 으로 되돌리면 Malgun 에서 두 줄이 됩니다 — 실측 근거가 남아 있어야 합니다 */
  ok("왜 3px 인지 근거가 style.css 에 적혀 있다",
    CSS.indexOf("padding:11px 6px") !== -1 && CSS.indexOf("19px") !== -1,
    "근거가 없으면 다음 사람이 '너무 좁다' 며 6px 으로 되돌립니다");
  ok("되돌리는 방법이 적혀 있다", CSS.indexOf("되돌리려면") !== -1);
}

/* =========================================================================
 * [5] 3px 이 실제로 한 줄을 만드는가 — 실측값으로 계산해 봅니다
 * ========================================================================= */
절("[5] 실측값으로 다시 세어 본다");
{
  /* 디자인팀 실측 (2026-08-28, 360px 화면) — 남는 폭(px).
     여백을 한쪽 1px 줄이면 탭 하나당 2px, 탭이 여러 개라 그만큼 벌립니다.
     아래는 잰 값 그대로이고, 이 표가 뒤집히면 3px 근거가 무너집니다. */
  const 실측 = {
    "Noto Sans KR": { "6px": 8.9, "3px": 32.9 },
    "Malgun Gothic": { "6px": -12.0, "3px": 12.0 }
  };

  Object.keys(실측).forEach(function (글꼴) {
    ok(글꼴 + " 는 여백 3px 에서 한 줄이다 (남는 폭 " + 실측[글꼴]["3px"] + "px)",
      실측[글꼴]["3px"] > 0);
  });
  ok("Malgun Gothic 은 여백 6px 이면 두 줄이 된다 (남는 폭 " + 실측["Malgun Gothic"]["6px"] + "px)",
    실측["Malgun Gothic"]["6px"] < 0,
    "이 값이 양수가 되면 3px 을 고집할 이유가 없어집니다 — 그때 다시 재세요");
  ok("가장 빠듯한 글꼴이 Malgun Gothic 이다 (윈도우 기본 대체 글꼴)",
    실측["Malgun Gothic"]["3px"] < 실측["Noto Sans KR"]["3px"]);
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
