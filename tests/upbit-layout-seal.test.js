/* tests/upbit-layout-seal.test.js
 * =========================================================================
 * 업비트식 2단 배치(★안 B★) — 2026-10-01 PM 배정 / 수리팀
 * =========================================================================
 *   대표 (2026-10-01)
 *     "홈페이지를 완전히 개편할거야 업비트 처럼 갈거야"
 *     "차트는 왼쪽 종목은 오른쪽"
 *
 *       왼쪽 990   차트(그림 영역 560px) / 그 아래 가로 2분할 — 주문 | 호가
 *       오른쪽 400 종목 목록 4줄 / 내 포지션 요약 / 내 정보 / 채팅
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] ⭐ 세 열을 ★새 <div> 로 감싸지 않았다★
 *         js/order-sheet-mobile.js 가 ".main-grid > .side-column" 을
 *         ★직계 자식★ 으로 찾습니다. 한 겹만 끼워도 폰 주문 시트가
 *         ★오류 없이★ 안 열립니다 — 전형적인 조용한 고장입니다.
 *   [3] ⭐ 차트가 든 행이 ★확정 px★ 이다 (auto 금지)
 *         js/chart.js 는 autoSize:true(ResizeObserver) 입니다.
 *         auto 로 두면 차트 커짐 → 행 커짐 → 차트 또 커짐 으로 무한 증가합니다.
 *         PM 실측 — 19초에 1,830px → 14,080px (13배).
 *   [4] 오른쪽 열이 ★% 가 아니라 고정 px★ 이다
 *         조사팀 실측 — 23% 면 1440 에서 327.5px 인데 종목 표 3칸 최소폭이
 *         451.9px 라 124px 넘칩니다.
 *   [5] 2열을 유지하는 최소 폭이 이론적 최소(942px) 보다 넓다
 *   [6] ⭐ 아직 안 온 값(null)과 진짜 0 을 구분해서 보여준다
 *         "-" 만 덩그러니 두면 회원이 고장인 줄 모릅니다(조용한 고장).
 *   [7] 손익·등락률을 ★다시 계산하지 않는다★ (계산식은 대표 결재 항목)
 *   [8] 새 전환 경로를 만들지 않았다 — switchTo 한 통로만 쓴다
 *   [9] 전광판(#ticker-board-panel)을 켜지 않았다
 *         켜려면 js/symbol-registry.js 의 isMock() 과 js/ticker-board.js 의
 *         "준비중" 조건을 먼저 고쳐야 하고, 그러면
 *         tests/ticker-board-reality-seal.test.js 의 기준이 빨개집니다(기록팀 건).
 *  [10] 글씨 17px 바닥 · 그림자 없음 · 모서리 10px · 이모지 없음
 *  [11] index.html · main.js 에 제대로 등록돼 있고 git 에 올라가 있다
 *         "UI" ★뒤★ 여야 합니다 — UI.init() 이 historyPanel 을 통째로 비웁니다.
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 * ⚠ 브라우저를 띄우지 않습니다(화면 실측은 보고서의 캡처가 담당합니다).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/upbit-layout.css";
const JS_REL = "js/upbit-right-column.js";

const CSS = read(CSS_REL);
const JS = read(JS_REL);
const HTML = read("index.html");
const MAIN = read("main.js");

/* 주석을 지운 "실제 코드" — 설명문에 적힌 글자 때문에 오판하지 않게 */
function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const CSS_CODE = 코드만(CSS);
const JS_CODE = 코드만(JS);

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

/* CSS 를 "@media 조건 + 규칙" 단위로 훑습니다(아주 단순한 훑기 — 중첩 없음) */
function 규칙들(css) {
  const out = [];
  const c = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /@media([^{]+)\{([\s\S]*?)\n\}/g;
  let m;
  const 미디어구간 = [];
  while ((m = re.exec(c)) !== null) {
    미디어구간.push([m.index, m.index + m[0].length]);
    const 조건 = m[1].trim();
    const 본문 = m[2];
    const r2 = /([^{}]+)\{([^{}]*)\}/g;
    let n;
    while ((n = r2.exec(본문)) !== null) {
      out.push({ media: 조건, sel: n[1].trim(), body: n[2].trim() });
    }
  }
  /* 미디어 밖 규칙 */
  let 남은 = c;
  미디어구간.slice().reverse().forEach(([a, b]) => {
    남은 = 남은.slice(0, a) + 남은.slice(b);
  });
  const r3 = /([^{}]+)\{([^{}]*)\}/g;
  let k;
  while ((k = r3.exec(남은)) !== null) {
    out.push({ media: "", sel: k[1].trim(), body: k[2].trim() });
  }
  return out;
}
const RULES = 규칙들(CSS);
function 규칙찾기(선택자조각) {
  return RULES.filter((r) => r.sel.indexOf(선택자조각) >= 0);
}

console.log("\n업비트식 2단 배치 (안 B)");

/* =========================================================================
 * [1] 수정 금지 파일 12개
 * ========================================================================= */
절("[1] 수정 금지 파일 12개가 그대로다");
{
  const { BY_FILE } = require("./_locked-hashes.js");
  const 목록 = [
    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
    "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
    "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
  ];
  목록.forEach((f) => {
    const 실제 = crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok(f + " 가 그대로다", 실제 === BY_FILE[f],
      "기준 " + BY_FILE[f] + " / 지금 " + 실제);
  });
}

/* =========================================================================
 * [2] ⭐ 세 열을 새 <div> 로 감싸지 않았다
 * ========================================================================= */
절("[2] ⭐ .main-grid 의 세 열이 ★직계 자식★ 그대로다");
{
  /* index.html 에서 .main-grid 블록을 떼어 바로 안쪽 자식만 봅니다 */
  const i = HTML.indexOf('<div class="main-grid">');
  ok(".main-grid 가 index.html 에 있다", i > 0);

  /* 세 열이 .main-grid 바로 다음 들여쓰기 깊이에 그대로 있는지 — 글자로 확인 */
  const 블록 = HTML.slice(i, i + 20000);
  [".chart-column", ".orderbook-column", ".side-column"].forEach((cls) => {
    const 이름 = cls.slice(1);
    const 패턴 = new RegExp('\\n    <div class="' + 이름 + '">');
    ok(이름 + " 이 .main-grid 바로 아래 그대로 있다", 패턴.test(블록),
      "한 겹이라도 끼우면 js/order-sheet-mobile.js 가 주문창을 못 찾습니다");
  });

  /* 새 모듈이 세 열을 옮기지 않는다 */
  [".chart-column", ".orderbook-column", ".side-column", ".main-grid"].forEach((sel) => {
    ok("새 모듈이 " + sel + " 을 건드리지 않는다", JS_CODE.indexOf(sel) < 0,
      "js/upbit-right-column.js 안에 " + sel + " 가 있습니다");
  });
  ok("새 모듈에 appendChild/insertBefore 로 ★기존★ 열을 옮긴 곳이 없다",
    JS_CODE.indexOf("querySelector(\".side-column\")") < 0 &&
    JS_CODE.indexOf("getElementById(\"ticker-board-panel\")") < 0,
    "기존 요소를 옮기면 수정 금지 모듈들이 기대하는 형제 관계가 깨집니다");

  /* 자리 바꾸기는 grid-template-areas 로 한다 */
  ok("자리는 grid-template-areas 로 바꾼다", /grid-template-areas\s*:/.test(CSS_CODE),
    "래퍼 <div> 대신 영역 이름으로 바꿔야 합니다");
  ["tlchart", "tlorder", "tlbook"].forEach((a) => {
    ok("영역 " + a + " 이 정의돼 있다", CSS_CODE.indexOf(a) > 0);
  });
}

/* =========================================================================
 * [3] ⭐ 차트가 든 행이 확정 px — auto 금지
 * ========================================================================= */
절("[3] ⭐ 차트 행 높이가 ★확정 px★ 이다 (무한 증가 방지)");
{
  const rows = CSS_CODE.match(/grid-template-rows\s*:([^;]+);/g) || [];
  ok("grid-template-rows 를 적어 뒀다", rows.length > 0);
  rows.forEach((r) => {
    const 값 = r.replace(/grid-template-rows\s*:/, "").replace(/;$/, "").trim();
    const 첫행 = 값.split(/\s+/)[0];
    ok("첫 행(차트)이 auto 가 아니다 — [" + 첫행 + "]",
      첫행 !== "auto" && 첫행 !== "min-content" && 첫행 !== "max-content",
      "차트 행을 내용 기준으로 두면 19초에 1,830px → 14,080px 로 늘어납니다");
  });

  /* 그 확정값이 변수 하나로 관리되는지 — 두 벌로 갈라지면 한쪽만 고칩니다 */
  ok("차트 행 높이가 변수(--tl-chart-row) 한 곳에 있다",
    /--tl-chart-row\s*:\s*\d+px/.test(CSS_CODE),
    "px 을 여러 곳에 박으면 다음 사람이 한 곳만 고칩니다");
  const 변수선언 = (CSS_CODE.match(/--tl-chart-row\s*:/g) || []).length;
  ok("--tl-chart-row 선언이 한 벌뿐이다 (" + 변수선언 + "벌)", 변수선언 === 1);

  /* 차트 칸이 들어 있는 행을 auto 로 되돌리는 규칙이 없는지 */
  const 차트행auto = RULES.some((r) =>
    /chart-column/.test(r.sel) && /height\s*:\s*auto/.test(r.body) &&
    /min-width\s*:\s*1100/.test(r.media));
  ok("2열 구간에서 .chart-column 을 height:auto 로 되돌리지 않는다", !차트행auto);
}

/* =========================================================================
 * [4] 오른쪽 열이 고정 px
 * ========================================================================= */
절("[4] 오른쪽 열이 ★% 가 아니라 고정 px★ 이다");
{
  const 틀 = 규칙찾기(".page-shell").filter((r) => /grid-template-columns/.test(r.body));
  ok(".page-shell 의 열 폭을 새로 정한다", 틀.length > 0);
  틀.forEach((r) => {
    const m = r.body.match(/grid-template-columns\s*:([^;]+)/);
    const 값 = m ? m[1].trim() : "";
    ok("오른쪽 열에 % 를 쓰지 않는다 — [" + 값 + "]", !/%/.test(값),
      "23% 면 1440 에서 327.5px 인데 종목 표 최소폭이 451.9px 라 124px 넘칩니다");
    ok("오른쪽 열이 px 고정이다 — [" + 값 + "]", /\d+px|--tl-right-col/.test(값));
  });
  ok("오른쪽 열 폭이 400px 이다", /--tl-right-col\s*:\s*400px/.test(CSS_CODE),
    "업비트 실측값입니다");
}

/* =========================================================================
 * [5] 2열 유지 최소 폭
 * ========================================================================= */
절("[5] 2열을 유지하는 최소 폭이 이론적 최소(942px)보다 넓다");
{
  /* 조사팀 실측 — 주문 288.63 + 호가 219 + gap 4 + 우측 400 + gap 14 + 패딩 16 */
  const 이론최소 = 942;
  const 조건들 = RULES
    .filter((r) => /\.page-shell/.test(r.sel) && /grid-template-columns/.test(r.body))
    .map((r) => r.media)
    .filter((m) => /min-width/.test(m));
  ok("2열 전환이 min-width 로 켜진다", 조건들.length > 0,
    "max-width 로 쓰면 style.css 의 1799 규칙을 못 덮습니다");
  조건들.forEach((m) => {
    const px = Number((m.match(/min-width\s*:\s*(\d+)px/) || [])[1]);
    ok("전환 지점 " + px + "px 이 이론적 최소 " + 이론최소 + "px 보다 넓다",
      px >= 이론최소,
      "좁히면 주문창 최소폭 때문에 2열이 깨집니다");
    ok("전환 지점 " + px + "px 이 옛 1799px 보다 낮다 (1440 에서도 2열)",
      px <= 1440,
      "1440 노트북에서 2열이 안 나오면 개편의 뜻이 사라집니다");
  });
}

/* =========================================================================
 * [6] ⭐ null 과 0 을 구분한다
 * ========================================================================= */
절("[6] ⭐ 아직 안 온 값(null)과 진짜 0 을 구분해서 보여준다");
{
  ok("App.AllSymbolFeed.get() 으로 값을 읽는다", /feed\.get\(/.test(JS_CODE));
  ok("값이 null/undefined 일 때를 따로 다룬다",
    /price\s*===\s*null/.test(JS_CODE) && /price\s*===\s*undefined/.test(JS_CODE),
    "!q.price 로 쓰면 ★진짜 0★ 까지 '안 온 것' 으로 삼킵니다");
  ok("안 온 값을 '-' 가 아니라 말로 적는다", /불러오는 중/.test(JS_CODE),
    "'-' 만 두면 회원이 고장인 줄 모릅니다(조용한 고장)");
  ok("왜 비었는지 안내 줄이 따로 있다", /tl-sym-note/.test(JS_CODE));
  ok("소켓이 끊긴 것도 화면에 말한다",
    /closed/.test(JS_CODE) && /reconnecting/.test(JS_CODE) && /끊겨/.test(JS_CODE),
    "조용히 죽으면 안 됩니다 — allsymbol:status 로 closed 가 반드시 옵니다");
  ok("allsymbol:status 를 듣는다", /allsymbol:status/.test(JS_CODE));
  ok("allsymbol:ticker 를 듣는다", /allsymbol:ticker/.test(JS_CODE));
  ok("binance-adapter 를 쓰지 않는다 (아직 BTC 만 봅니다)",
    JS_CODE.indexOf("MarketData") < 0 && JS_CODE.indexOf("getAdapter") < 0,
    'App.MarketData.getAdapter("QQQUSDT").getPrice() 는 지금도 null 입니다');
}

/* =========================================================================
 * [7] 손익·등락률을 다시 계산하지 않는다
 * ========================================================================= */
절("[7] 손익·등락률을 ★다시 계산하지 않는다★ (계산식은 대표 결재 항목)");
{
  /* 등락률은 거래소가 준 값(changePercent)을 그대로 쓴다 */
  ok("등락률을 changePercent 그대로 쓴다", /q\.changePercent/.test(JS_CODE));
  ok("등락률을 직접 계산하지 않는다",
    !/\(\s*price\s*-\s*open\s*\)/.test(JS_CODE) && !/\/\s*q\.open/.test(JS_CODE),
    "바이낸스가 계산해 준 P 필드를 그대로 써야 계산식이 두 벌이 안 됩니다");
  /* 손익은 이미 그려진 글자를 비추기만 한다 */
  ok("손익을 #pos-pnl 글자에서 가져온다", /#pos-pnl/.test(JS_CODE));
  ok("손익 수식을 새로 쓰지 않는다",
    !/unrealized/i.test(JS_CODE) && !/leverage\s*\*/.test(JS_CODE) &&
    !/entryPrice/.test(JS_CODE),
    "손익·청산 계산식은 대표 결재 항목입니다(docs/인계문서.md 3번)");
  ok("손익 색도 원본 클래스를 물려받는다", /src\.className/.test(JS_CODE));
}

/* =========================================================================
 * [8] 새 전환 경로를 만들지 않았다
 * ========================================================================= */
절("[8] 종목 전환이 ★기존 통로 하나★ 만 쓴다");
{
  ok("App.SymbolStreamSwitch.switchTo 를 부른다",
    /SymbolStreamSwitch\s*&&[\s\S]{0,120}switchTo/.test(JS_CODE));
  ok("소켓을 새로 열지 않는다", JS_CODE.indexOf("new WebSocket") < 0,
    "시세는 js/all-symbol-feed.js 한 곳에서만 받습니다");
  ok("종목 목록을 파일에 적지 않는다 — SymbolRegistry 가 단일 출처",
    JS_CODE.indexOf("BTCUSDT") < 0 && JS_CODE.indexOf("QQQUSDT") < 0 &&
    JS_CODE.indexOf("SAMSUNGUSDT") < 0 && JS_CODE.indexOf("SKHYNIXUSDT") < 0,
    "종목이 늘면 js/symbol-registry.js 만 고치면 되게");
  ok("App.SymbolRegistry 에서 읽는다", /SymbolRegistry/.test(JS_CODE));
}

/* =========================================================================
 * [9] 전광판을 켜지 않았다
 * ========================================================================= */
절("[9] 전광판(#ticker-board-panel)을 켜지 않았다");
{
  ok('index.html 의 #ticker-board-panel 이 아직 style="display:none;" 이다',
    /id="ticker-board-panel"[^>]*style="display:none;"/.test(HTML),
    "켜면 tests/ticker-board-seal.test.js 가 설계대로 실패합니다(기록팀 건)");
  ok("새 모듈이 전광판을 건드리지 않는다",
    JS_CODE.indexOf("ticker-board") < 0,
    "지금 켜면 3줄이 이유 없는 '-' 로 보입니다 — isMock() 이 전부 false 라 배지가 0개");
  ok("새 CSS 도 전광판을 건드리지 않는다", CSS_CODE.indexOf("ticker-board") < 0);
}

/* =========================================================================
 * [10] 디자인 확정 규칙
 * ========================================================================= */
절("[10] 글씨 17px 바닥 · 그림자 없음 · 모서리 10px · 이모지 없음");
{
  const 글씨 = CSS_CODE.match(/font-size\s*:\s*([\d.]+)px/g) || [];
  const 작은것 = 글씨
    .map((s) => Number(s.match(/([\d.]+)px/)[1]))
    .filter((n) => n < 17);
  ok("17px 보다 작은 글씨가 없다 (" + 글씨.length + "곳 확인)", 작은것.length === 0,
    "대표님이 '14px 도 작다' 고 세 번 말씀하셨습니다. 발견: " + 작은것.join(", "));

  /* 그림자 금지 — inset 한 줄(위쪽 흰색 3% 선)은 그림자가 아닙니다 */
  const 그림자 = (CSS_CODE.match(/box-shadow\s*:[^;]+;/g) || [])
    .filter((s) => !/inset/.test(s) && !/none/.test(s));
  ok("그림자를 쓰지 않는다", 그림자.length === 0,
    "발견: " + 그림자.join(" | "));

  const 모서리 = (CSS_CODE.match(/border-radius\s*:\s*([\d.]+)px/g) || [])
    .map((s) => Number(s.match(/([\d.]+)px/)[1]));
  const 큰모서리 = 모서리.filter((n) => n > 12);
  ok("카드 모서리가 12px 을 넘지 않는다", 큰모서리.length === 0,
    "발견: " + 큰모서리.join(", "));

  /* 확정 팔레트 9색 바깥의 색을 새로 만들지 않았다 */
  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B",
                  "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 쓴색 = (CSS_CODE.match(/#[0-9A-Fa-f]{6}/g) || [])
    .map((s) => s.toUpperCase());
  const 바깥 = Array.from(new Set(쓴색)).filter((c) => 팔레트.indexOf(c) < 0);
  ok("확정 팔레트 9색만 쓴다", 바깥.length === 0,
    "업비트 색을 베끼지 않습니다. 발견: " + 바깥.join(", "));

  /* 상승은 초록, 하락은 빨강 */
  ok("상승이 초록 #26C281 이다", /\.up\{color:#26C281;\}/.test(CSS_CODE.replace(/\s+/g, "")),
    "업비트는 상승이 빨강이지만 우리 확정 팔레트는 초록입니다");

  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("새 모듈이 만드는 글자에 이모지가 없다", !EMOJI.test(JS_CODE),
    "아이콘이 필요하면 인라인 SVG 를 씁니다");
  ok("새 CSS 에 이모지가 없다", !EMOJI.test(CSS_CODE));
}

/* =========================================================================
 * [11] 등록 상태
 * ========================================================================= */
절("[11] index.html · main.js 등록 + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다",
    HTML.indexOf('<link rel="stylesheet" href="css/upbit-layout.css">') >= 0);
  ok("index.html 이 새 모듈을 부른다",
    HTML.indexOf('<script src="js/upbit-right-column.js"></script>') >= 0);

  /* ⭐ style.css 보다 뒤에 있어야 1799 규칙을 덮습니다 */
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf("css/upbit-layout.css") > HTML.indexOf('href="style.css"'),
    "앞에 있으면 style.css 의 @media(max-width:1799px) 가 덮어써서 2열이 안 됩니다");

  /* ⭐ main.js 목록에서 "UI" 뒤 */
  const 목록 = MAIN.slice(MAIN.indexOf("const modules = ["),
                         MAIN.indexOf("modules.forEach"));
  ok('main.js 에 "UpbitRightColumn" 이 있다', 목록.indexOf('"UpbitRightColumn"') > 0);
  ok('"UpbitRightColumn" 이 "UI" ★뒤★ 에 있다',
    목록.indexOf('"UpbitRightColumn"') > 목록.indexOf('"UI"'),
    'UI.init() 이 historyPanel.innerHTML = "" 로 통째로 비웁니다');

  /* 디스크엔 있는데 git 엔 없는 조용한 고장 방지 */
  [CSS_REL, JS_REL].forEach((rel) => {
    const 추적 = execFileSync("git", ["ls-files", "--", rel], { cwd: REPO })
      .toString().trim();
    ok(rel + " 가 git 에 올라가 있다", 추적 === rel,
      "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
  });
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " upbit-layout-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
