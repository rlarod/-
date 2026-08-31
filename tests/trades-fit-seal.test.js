/* tests/trades-fit-seal.test.js
 * =========================================================================
 * 최근 체결 "칸에 닿으면 없어지게" — 줄 수 계산을 못 박습니다
 * =========================================================================
 * 2026-08-27 — 본부장 배정 / 기록팀 봉인 (그전까지 봉인 0건)
 *
 * ── 왜 이 모듈이 생겼나 (2026-08-24 대표 지시) ─────────────────────────
 *   대표: "그 칸에 닿으면 자동으로 없어지게 해줘"
 *
 *   1440 실측 — 보이는 높이 495px / 내용 높이 1020px (30줄 × 34px).
 *   들어가는 줄은 14줄인데 30줄이 들어와 두 배 넘게 넘쳤습니다.
 *   넘치니까 세로 스크롤이 생기고, 스크롤이 생기니까 막대가 생겼습니다.
 *   앞선 수정(style.css 3835행)은 **막대만 감췄을 뿐** 넘침은 그대로였습니다.
 *
 * ── 이 파일이 지키는 것 ───────────────────────────────────────────────
 *   js/trades-fit.js 는 회귀 3종 중 ③(최근 체결 30줄) 의 본체인데
 *   봉인이 0건이었습니다. 게다가 **숫자를 코드에 안 박은** 계산이라
 *   조건 하나만 바뀌어도 조용히 달라집니다 —
 *     · 넘치는데 안 감춤   → 막대가 다시 생김 (원래 증상 재발)
 *     · 너무 많이 감춤     → 체결이 3줄만 보임. 회원은 "거래가 뜸하다" 로 오해
 *     · 행을 지워버림      → 최근 30건을 쓰는 다른 기능이 같이 깨짐
 *   마지막 것이 특히 위험합니다. 오류도 안 나고 화면도 멀쩡합니다(조용한 고장).
 *
 * ── 못 박는 것 ────────────────────────────────────────────────────────
 *   [2] 배선 — index.html · main.js · style.css 규칙
 *   [3] 1440 실측 재현 — 495 / 34 / 30줄 → **14줄 남고 16줄 감춤**
 *   [4] 감추는 건 항상 아래쪽(오래된 줄). 위(새 체결)는 절대 안 감춤
 *   [5] 행 DOM 을 지우지 않는다 — 30개 그대로, 속성만 붙었다 뗀다
 *   [6] class 가 아니라 **속성**이다 (trades.js 가 className 을 통째로 덮어씀)
 *   [7] 안전판 — 아무리 좁아도 3줄 밑으로 안 내려간다
 *   [8] 넘치지 않으면 전부 보인다 / 이미 감춘 것도 되살린다
 *   [9] 탭 모드(overflow visible)에서는 아무것도 안 감춘다
 *   [10] 잴 수 없을 때(높이 0)는 스스로 복구한다
 *   [11] 0.5px 여유 — 반올림 때문에 한 줄을 잃지 않는다
 *   [12] 여러 번 불러도 결과가 같다 (멱등)
 *   [13] 수정 금지 파일 12개 무변경
 *
 * ⚠ DOM 계산만 합니다. 서버도 네트워크도 안 붙습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = path.join(REPO, "js/trades-fit.js");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* -------------------------------------------------------------------------
 * 최근 체결 패널을 흉내 냅니다
 * -------------------------------------------------------------------------
 * jsdom 은 레이아웃을 계산하지 않아 clientHeight 가 늘 0 이고
 * getBoundingClientRect() 가 전부 0 입니다. 그래서 **실측값을 직접 심습니다.**
 * 심는 숫자는 전부 2026-08-24 1440 실측에서 온 것입니다.
 *   보이는 높이 495px / 줄 높이 34px / 줄 수 30
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const 줄수 = opts.줄수 === undefined ? 30 : opts.줄수;
  const 칸높이 = opts.칸높이 === undefined ? 495 : opts.칸높이;
  const 줄높이 = opts.줄높이 === undefined ? 34 : opts.줄높이;
  const overflowY = opts.overflowY || "auto";

  const dom = new JSDOM(
    '<!doctype html><html><body><div id="recent-trades-list"></div></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;
  const doc = win.document;

  const list = doc.getElementById("recent-trades-list");
  for (let i = 0; i < 줄수; i++) {
    const row = doc.createElement("div");
    row.className = "ob-row";
    /* 새 체결이 위(index 0)로 들어옵니다 — trades.js flush() 가
       pendingTicks.concat(recentTrades) 로 앞에 붙입니다.
       그래서 index 가 클수록 오래된 줄입니다. */
    row.setAttribute("data-나이", String(i));   /* 0 = 가장 새것 */
    list.appendChild(row);
  }

  Object.defineProperty(list, "clientHeight", { get: () => 칸높이, configurable: true });
  Object.defineProperty(list, "isConnected", { get: () => true, configurable: true });

  /* 감춰진 줄(display:none)은 실제 브라우저에서 높이 0 입니다. 그것도 흉내 냅니다 —
     모듈이 "지금 보이는 줄"에서만 줄 높이를 재는지 확인하려면 이게 필요합니다. */
  for (const row of Array.from(list.children)) {
    row.getBoundingClientRect = function () {
      const 감춤 = this.hasAttribute("data-rt-clipped");
      const h = 감춤 ? 0 : 줄높이;
      return { height: h, width: 300, top: 0, left: 0, right: 300, bottom: h, x: 0, y: 0 };
    };
  }

  const 원래 = win.getComputedStyle;
  win.getComputedStyle = function (el) {
    const s = 원래.call(win, el);
    if (el === list) return Object.assign({}, s, { overflowY: overflowY });
    return s;
  };

  win.App = {};
  win.eval(fs.readFileSync(SRC, "utf8"));

  const 상태 = () => {
    const rows = Array.from(list.children);
    return {
      전체: rows.length,
      보임: rows.filter((r) => !r.hasAttribute("data-rt-clipped")).map((r) => Number(r.getAttribute("data-나이"))),
      감춤: rows.filter((r) => r.hasAttribute("data-rt-clipped")).map((r) => Number(r.getAttribute("data-나이"))),
    };
  };

  return { win, dom, doc, list, App: win.App, 상태, 적용: () => { win.App.TradesFit.init(); win.App.TradesFit._apply(); } };
}

/* =========================================================================
 * [1] 파일과 주석
 * ========================================================================= */
절("[1] 모듈 파일 · 되돌리는 방법");
{
  ok("js/trades-fit.js 가 있다", fs.existsSync(SRC));
  const src = fs.readFileSync(SRC, "utf8");
  ok("주석에 1440 실측(495 / 1020 / 30줄 × 34px)이 남아 있다",
    src.indexOf("495px") >= 0 && src.indexOf("1020px") >= 0 && /30줄/.test(src),
    "왜 이 숫자인지 모르면 다음 사람이 계산을 임의로 바꿉니다");
  ok("주석에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(src));
  ok("안전판 MIN_ROWS 가 3 이다", /MIN_ROWS\s*=\s*3\b/.test(src),
    "이 값이 커지면 좁은 화면에서 다시 넘치고, 0 이 되면 체결이 통째로 사라집니다");
  ok("js/trades.js 를 직접 고치지 않는다 (내부 배열 30건 보존)",
    !/recentTrades\s*=/.test(src) && !/\.splice\(|removeChild|innerHTML\s*=/.test(src),
    "행을 지우면 '최근 30건' 을 쓰는 다른 기능이 같이 깨집니다");
}

/* =========================================================================
 * [2] 배선
 * ========================================================================= */
절("[2] 배선 — index.html · main.js · style.css");
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(REPO, "main.js"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

  ok("index.html 이 js/trades-fit.js 를 부른다", html.indexOf('src="js/trades-fit.js"') >= 0);
  ok("main.js 가 TradesFit 을 init 목록에 넣는다", main.indexOf('"TradesFit"') >= 0);
  /* ⚠ #recent-trades-list 는 index.html 에 없습니다. js/trades.js 가 실행 중에
     만듭니다 — trades.js:48  '<div class="ob-bids" id="recent-trades-list"></div>'.
     2026-08-27 기록팀이 index.html 을 보다가 헛다리를 짚었고 본부장이 잡았습니다.
     점검팀이 라이브에서 #recent-trades-list .ob-row = 30줄을 여러 번 쟀으니
     요소는 실제로 있습니다. **보는 파일은 js/trades.js 입니다.**
     js/trades.js 는 수정 금지 12개가 아니라 읽어서 봉인해도 되는 파일입니다. */
  const tradesJs = fs.readFileSync(path.join(REPO, "js/trades.js"), "utf8");
  ok("js/trades.js 가 id=\"recent-trades-list\" 를 만든다",
    /id="recent-trades-list"/.test(tradesJs),
    "id 가 바뀌면 trades-fit 이 20초 찾다가 조용히 포기합니다 — 줄이 다시 30줄로 넘칩니다");
  ok("만드는 쪽(trades.js)과 찾는 쪽(trades-fit.js)의 id 가 같다",
    /LIST_ID\s*=\s*"recent-trades-list"/.test(fs.readFileSync(SRC, "utf8")),
    "어긋나면 오류도 안 나고 아무 일도 안 일어납니다 — 줄이 조용히 다시 넘칩니다");
  ok("행에 붙는 class 가 ob-row 다 (style.css 선택자와 짝이 맞는다)",
    /className\s*=\s*"ob-row"/.test(tradesJs),
    "규칙이 #recent-trades-list .ob-row[data-rt-clipped] 라 class 가 바뀌면 안 감춰집니다");

  const 규칙 = css.match(/#recent-trades-list[^{]*\[data-rt-clipped\][^{]*\{([^}]*)\}/);
  ok("style.css 에 [data-rt-clipped] 를 감추는 규칙이 있다", !!규칙,
    "속성만 붙고 CSS 가 없으면 줄이 그대로 다 보입니다 — 아무 일도 안 한 게 됩니다");
  ok("그 규칙이 display:none 이다", !!규칙 && /display\s*:\s*none/.test(규칙[1]),
    규칙 ? 규칙[1] : "규칙 없음");

  const 개수 = (css.match(/\[data-rt-clipped\]/g) || []).length;
  ok("[data-rt-clipped] 규칙이 한 벌뿐이다 (" + 개수 + "곳)", 개수 === 1,
    "두 벌이면 뒤엣것이 앞을 덮어 수정이 안 먹습니다 — 이 프로젝트에서 두 번 났던 유형입니다");
}

/* =========================================================================
 * [3] ⭐ 1440 실측 재현 — 30줄 중 14줄만 남는다
 * -------------------------------------------------------------------------
 * fit = floor((495 + 0.5) / 34) = floor(14.57) = 14
 * ========================================================================= */
절("[3] ⭐ 1440 실측 — 칸 495px / 줄 34px / 30줄 → 14줄만 보인다");
{
  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t.적용();
  const s = t.상태();

  ok("보이는 줄이 정확히 14줄이다", s.보임.length === 14, "실제 " + s.보임.length + "줄");
  ok("감춘 줄이 16줄이다", s.감춤.length === 16, "실제 " + s.감춤.length + "줄");
  ok("보이는 줄 × 줄높이(14 × 34 = 476) 가 칸 높이 495 를 넘지 않는다",
    s.보임.length * 34 <= 495, s.보임.length * 34 + "px > 495px — 다시 넘칩니다");
  ok("한 줄 더 넣으면(15 × 34 = 510) 넘친다 — 즉 꽉 채운 값이다",
    (s.보임.length + 1) * 34 > 495,
    "아직 여유가 있는데 덜 보여주고 있습니다. 495px 에 " + s.보임.length + "줄은 낭비입니다");
}

/* =========================================================================
 * [4] 감추는 건 항상 오래된 쪽 (아래)
 * ========================================================================= */
절("[4] 새 체결(위)은 남고 오래된 것(아래)이 감춰진다");
{
  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t.적용();
  const s = t.상태();

  ok("보이는 줄이 맨 위부터 연속이다 (0~13)",
    s.보임.join(",") === Array.from({ length: 14 }, (_, i) => i).join(","),
    "실제: " + s.보임.join(","));
  ok("가장 새 줄(index 0)은 절대 안 감춘다", s.감춤.indexOf(0) < 0);
  ok("감춘 줄은 전부 뒤쪽이다 (14~29)", Math.min.apply(null, s.감춤) === 14 && Math.max.apply(null, s.감춤) === 29,
    "실제 감춤: " + s.감춤.join(","));
}

/* =========================================================================
 * [5] 행을 지우지 않는다
 * ========================================================================= */
절("[5] 행 DOM 을 지우지 않는다 (마크업 보존)");
{
  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  const 전 = t.list.children.length;
  t.적용();
  ok("적용 뒤에도 행이 30개 그대로다", t.list.children.length === 30,
    "적용 전 " + 전 + " → 적용 후 " + t.list.children.length + " — 지우면 '최근 30건' 이 깨집니다");
  ok("감춘 행도 DOM 에 남아 있다", t.list.children[29] && t.list.children[29].hasAttribute("data-rt-clipped"));

  /* 칸이 커지면 감췄던 줄이 되살아나야 합니다 — 지웠으면 못 되살립니다 */
  Object.defineProperty(t.list, "clientHeight", { get: () => 1200, configurable: true });
  t.App.TradesFit._apply();
  ok("칸이 커지면 감췄던 줄이 전부 되살아난다", t.상태().감춤.length === 0,
    "아직 감춤 " + t.상태().감춤.length + "줄");
}

/* =========================================================================
 * [6] class 가 아니라 속성이어야 한다
 * -------------------------------------------------------------------------
 * js/trades.js 의 render() 가 체결마다 rowEl.className 을 통째로 덮어씁니다.
 * class 로 표시하면 새 체결이 올 때마다 지워져서, 감췄던 줄이 다시 나타나고
 * 다시 넘칩니다. 속성은 render() 가 안 건드립니다(실측 확인).
 * ========================================================================= */
절("[6] class 가 아니라 data 속성이다 (className 덮어쓰기에 살아남는다)");
{
  const src = fs.readFileSync(SRC, "utf8");
  ok("HIDE_ATTR 이 data-rt-clipped 다", /HIDE_ATTR\s*=\s*"data-rt-clipped"/.test(src));
  ok("classList.add / className 으로 감추지 않는다",
    !/classList\.(add|remove|toggle)/.test(src) && !/\.className\s*=/.test(src),
    "class 로 감추면 trades.js 의 className 덮어쓰기에 매번 지워집니다");

  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t.적용();
  /* trades.js 가 하는 짓을 그대로 흉내 냅니다 — className 통째로 덮어쓰기 */
  Array.from(t.list.children).forEach((r) => { r.className = "ob-row sell"; });
  ok("className 을 통째로 덮어써도 감춤 표시가 살아남는다", t.상태().감춤.length === 16,
    "덮어쓴 뒤 감춤 " + t.상태().감춤.length + "줄 — class 로 바뀌었으면 0 이 됩니다");
}

/* =========================================================================
 * [7] 안전판 — 3줄 밑으로 안 내려간다
 * ========================================================================= */
절("[7] 안전판 — 아무리 좁아도 3줄은 남긴다");
{
  const 좁은칸 = [0.1, 10, 20, 33];   /* 34px 한 줄도 못 들어가는 높이들 */
  for (const h of 좁은칸) {
    const t = 띄우기({ 칸높이: h, 줄높이: 34, 줄수: 30 });
    t.적용();
    ok("칸 " + h + "px 여도 3줄은 보인다", t.상태().보임.length === 3,
      "실제 " + t.상태().보임.length + "줄 — 0 줄이면 '거래가 없다' 로 오해합니다(조용한 고장)");
  }
  /* 3줄보다 적게 들어와 있으면 있는 만큼만 */
  const t2 = 띄우기({ 칸높이: 10, 줄높이: 34, 줄수: 2 });
  t2.적용();
  ok("줄이 2개뿐이면 2줄 그대로 (없는 줄을 만들지 않는다)", t2.상태().보임.length === 2,
    "실제 " + t2.상태().보임.length + "줄");
}

/* =========================================================================
 * [8] 넘치지 않으면 손대지 않는다
 * ========================================================================= */
절("[8] 넘치지 않으면 전부 보인다");
{
  const t = 띄우기({ 칸높이: 1200, 줄높이: 34, 줄수: 30 });  /* 35줄까지 들어감 */
  t.적용();
  ok("칸 1200px(35줄분) 에 30줄이면 하나도 안 감춘다", t.상태().감춤.length === 0,
    "감춤 " + t.상태().감춤.length + "줄");

  /* 딱 맞을 때 — 30 × 34 = 1020 */
  const t2 = 띄우기({ 칸높이: 1020, 줄높이: 34, 줄수: 30 });
  t2.적용();
  ok("칸이 내용과 딱 같으면(1020px / 30줄) 하나도 안 감춘다", t2.상태().감춤.length === 0,
    "감춤 " + t2.상태().감춤.length + "줄 — 딱 맞는데 감추면 한 줄이 억울하게 사라집니다");
}

/* =========================================================================
 * [9] 탭 모드 — overflow 가 visible 이면 아무것도 안 감춘다
 * ========================================================================= */
절("[9] 탭 모드(overflow-y: visible)에서는 감추지 않는다");
{
  for (const oy of ["visible", "clip"]) {
    const t = 띄우기({ 칸높이: 100, 줄높이: 34, 줄수: 30, overflowY: oy });
    t.적용();
    ok("overflow-y:" + oy + " 이면 30줄 전부 보인다", t.상태().감춤.length === 0,
      "감춤 " + t.상태().감춤.length + "줄 — 넘칠 수 없는 칸에서 줄을 지우면 그냥 손해입니다");
  }
  for (const oy of ["auto", "scroll", "hidden", "overlay"]) {
    const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30, overflowY: oy });
    t.적용();
    ok("overflow-y:" + oy + " 이면 감춘다 (14줄)", t.상태().보임.length === 14,
      "실제 " + t.상태().보임.length + "줄");
  }
}

/* =========================================================================
 * [10] 잴 수 없을 때는 스스로 복구한다
 * ========================================================================= */
절("[10] 잴 수 없을 때 — 패널 숨김 / 줄 높이 0");
{
  /* 패널이 안 보일 때(탭 모드에서 호가창 선택) — 건드리지 않습니다 */
  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t.적용();
  const 전 = t.상태().감춤.length;
  Object.defineProperty(t.list, "clientHeight", { get: () => 0, configurable: true });
  t.App.TradesFit._apply();
  ok("칸 높이가 0 이면 지금 상태를 그대로 둔다", t.상태().감춤.length === 전,
    "전 " + 전 + " → 후 " + t.상태().감춤.length);

  /* 줄 높이를 못 재면(아직 안 그려짐) 전부 되살립니다 */
  const t2 = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t2.적용();
  ok("준비 — 먼저 16줄이 감춰져 있다", t2.상태().감춤.length === 16);
  Array.from(t2.list.children).forEach((r) => {
    r.getBoundingClientRect = () => ({ height: 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 });
  });
  t2.App.TradesFit._apply();
  ok("줄 높이를 못 재면 감춘 것을 전부 되살린다 (스스로 복구)", t2.상태().감춤.length === 0,
    "아직 감춤 " + t2.상태().감춤.length + "줄 — 못 재는 상태로 굳으면 체결이 영영 3줄만 보입니다");

  /* 맨 위 줄만 아직 안 그려진 상태 — 아래 "보이는 줄"에서 높이를 재야 합니다.
     rows[0] 하나만 보고 판단하면 높이가 0 이라 전부 되살려 버리고,
     30줄이 그대로 남아 **원래 증상(넘침 + 스크롤 막대)이 그대로 재발**합니다.
     모듈 주석의 "감춘 줄은 높이가 0이라 못 씁니다" 가 이 뜻입니다. */
  const t3 = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t3.list.children[0].getBoundingClientRect = () =>
    ({ height: 0, width: 0, top: 0, left: 0, right: 0, bottom: 0, x: 0, y: 0 });
  t3.적용();
  ok("맨 위 줄만 높이를 못 재도 아래 줄에서 재서 14줄을 맞춘다", t3.상태().보임.length === 14,
    "실제 " + t3.상태().보임.length + "줄 — 30줄이면 첫 줄만 보고 포기한 것이고, 넘침이 재발합니다");
}

/* =========================================================================
 * [11] 0.5px 여유 — 반올림 때문에 한 줄을 잃지 않는다
 * -------------------------------------------------------------------------
 * 브라우저가 주는 높이는 소수입니다. fit = floor((clientHeight + 0.5) / rowH).
 * 0.5 를 빼면 칸 475.6px / 줄 34px 에서 14줄이 아니라 13줄이 됩니다.
 * ========================================================================= */
절("[11] 0.5px 여유 — 소수점 때문에 한 줄을 잃지 않는다");
{
  const t = 띄우기({ 칸높이: 475.6, 줄높이: 34, 줄수: 30 });   /* 34 × 14 = 476 */
  t.적용();
  ok("칸 475.6px / 줄 34px → 14줄 (여유 없으면 13줄)", t.상태().보임.length === 14,
    "실제 " + t.상태().보임.length + "줄");

  /* 여유가 지나치면 안 됩니다 — 진짜로 한 줄이 모자란 높이에서는 줄어야 합니다 */
  const t2 = 띄우기({ 칸높이: 474, 줄높이: 34, 줄수: 30 });
  t2.적용();
  ok("칸 474px 는 13줄이다 (여유가 1px 을 넘지 않는다)", t2.상태().보임.length === 13,
    "실제 " + t2.상태().보임.length + "줄 — 14줄이면 476px 이라 넘칩니다");
}

/* =========================================================================
 * [12] 여러 번 불러도 같다
 * ========================================================================= */
절("[12] 몇 번을 불러도 결과가 같다 (멱등)");
{
  const t = 띄우기({ 칸높이: 495, 줄높이: 34, 줄수: 30 });
  t.적용();
  const 첫 = t.상태().보임.join(",");
  for (let i = 0; i < 5; i++) t.App.TradesFit._apply();
  ok("5번 더 불러도 보이는 줄이 그대로다", t.상태().보임.join(",") === 첫,
    "첫 " + 첫 + " → 지금 " + t.상태().보임.join(","));
  ok("여전히 14줄이다 (부를 때마다 줄어들지 않는다)", t.상태().보임.length === 14,
    "실제 " + t.상태().보임.length + "줄 — 감춘 줄 높이가 0 인 걸 줄 높이로 잘못 쓰면 여기서 무너집니다");
}

/* =========================================================================
 * [13] 수정 금지 파일 12개
 * ========================================================================= */
절("[13] 수정 금지 파일 12개가 그대로다");
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
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  const 다름 = Object.keys(기준).filter((f) => md5(f) !== 기준[f]);
  ok("12개 전부 기준 해시와 같다", 다름.length === 0, "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [14] tests/_order.txt 등록
 * ========================================================================= */
절("[14] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/trades-fit-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") + " trades-fit-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창이 타이머(findList setTimeout · rAF)를 붙들고 있어 반드시 필요합니다. */
process.exit(fail > 0 ? 1 : 0);
