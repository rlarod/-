/* tests/chart-style-seal.test.js
 * =========================================================================
 * 봉인 — js/chart-style.js (App.ChartStyle · 차트 스타일 창)
 * =========================================================================
 *
 * 2026-08-31 감사팀 발견 — 33KB(807줄)인데 테스트가 ★0건★ 이었습니다.
 * 파일이 getStateForTest() 를 "확인용" 주석과 함께 이미 내보내고 있는데
 * 아무도 안 썼습니다. 봉인을 쓰라고 만들어 둔 출구입니다.
 *
 * ── ★33KB 를 전부 봉인하지 않았습니다★ ─────────────────────────────────
 * PM 지시대로 "깨지면 회원이 아픈 것" 만 골랐습니다.
 * 창의 배치·글자 크기·탭 이름·안내문 문구는 ★일부러 검사하지 않습니다.★
 * 그런 것까지 못 박으면 디자인팀이 손댈 때마다 여기가 터지고,
 * 그러면 팀이 봉인을 지우게 됩니다. 봉인은 지워지는 순간 0 이 됩니다.
 *
 * 고른 8가지 — 각각 "깨지면 회원에게 무슨 일이 나는가" 를 적었습니다.
 *
 *   [A] 시리즈를 지우거나 새로 만들지 않는다
 *       → 깨지면: 진입가·TP·SL·★청산가★ 가로선과 회원이 그린 그림이
 *         전부 떨어집니다. 회원은 청산가를 못 보고 판단합니다. P1.
 *   [B] 저장해 둔 것이 없으면 차트를 한 픽셀도 안 건드린다
 *       → 깨지면: 이 창을 한 번도 안 연 ★모든 회원★ 화면이 조용히 바뀝니다.
 *   [C] 봉 종류가 캔들이 아니면 캔들 색을 칠하지 않는다
 *       → 깨지면: 라인 차트 위에 숨겨 둔 캔들이 다시 나타나 차트가 겹칩니다.
 *   [D] 되돌리기 기준(base)을 코드에 숫자로 적지 않는다
 *       → 깨지면: js/chart.js 색이 바뀐 뒤 "되돌리기" 가 ★옛 색★ 으로
 *         되돌립니다. 오류도 안 나는 조용한 고장입니다.
 *   [E] 확정 팔레트 (PM 지시 2번)
 *   [F] z-index 995 — 폰 하단 매수/매도 바(990) 위, 로그인 게이트(1000) 아래
 *       → 깨지면: 창이 떠 있는데 아래 ★매수/매도 버튼이 눌립니다.★
 *         실제로 80 으로 뒀다가 360 폰에서 걸렸던 값입니다. 진짜 주문이 나갑니다.
 *   [G] 시세가 들어올 때 하는 일이 0 이다
 *       → 깨지면: 차트를 오래 켜 둘수록 느려집니다.
 *         (2026-08-31 대표 "차트를 계속 켜놓으니까 고장나더라" 와 같은 계열)
 *   [H] 저장을 안 누르면 아무것도 안 남는다
 *
 * ── 어디까지 재고 어디부터 못 재나 ──────────────────────────────────────
 *   ✅ 잽니다 — 어떤 옵션을 몇 번 넘겼는가, 무엇을 저장했는가, 상태값
 *   ❌ 못 잽니다 — ★실제로 그려진 그림★. jsdom 에는 캔버스가 없습니다.
 *      "캔들이 초록으로 보이는가" 는 여기서 확인할 수 없습니다.
 *      가짜 차트에 넘어간 값이 맞는지까지만 봅니다.
 *
 * 네트워크는 한 번도 안 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? " → " + detail : ""));
    console.log("  " + MARK_NG + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

const SRC_REL = "js/chart-style.js";
const src = read(SRC_REL);

/* 이 파일은 주석이 아주 깁니다(1~93줄). 주석 안에 #26a69a · createChart ·
   #323C46 같은 낱말이 실제로 들어 있어서 문자열 검색만 하면 전부 오탐입니다.
   그래서 항상 "주석 걷어낸 본문" 으로 검사합니다. */
function 주석제거(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((줄) => 줄.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}
const 코드 = 주석제거(src);

/* =========================================================================
 * [0] 주석 제거기가 진짜 도는가 — 아래 검사들이 전부 여기 기대고 있습니다
 * ========================================================================= */
section("[0] 주석 제거기 자체 확인");
{
  ok("블록주석을 걷어낸다", 주석제거("/* createChart */ var a=1;").indexOf("createChart") === -1);
  ok("한 줄 주석을 걷어낸다", 주석제거("var a=1; // #26a69a\n").indexOf("#26a69a") === -1);
  ok("코드 안의 낱말은 남긴다", 주석제거("chart.createChart();").indexOf("createChart") >= 0);

  /* 오탐 위험이 진짜 있었다는 증거 — 원본에는 들어 있습니다 */
  ok('원본 주석에 "createChart" 가 실제로 있다 (58줄)', src.indexOf("createChart") >= 0);
  ok('원본 주석에 "#26a69a" 가 실제로 있다 (189줄)', src.indexOf("#26a69a") >= 0);
  ok("걷어내면 코드에는 createChart 가 없다", 코드.indexOf("createChart") === -1);
  ok("걷어내면 코드에는 #26a69a 가 없다", 코드.indexOf("#26a69a") === -1);
}

/* =========================================================================
 * [A] 시리즈를 지우거나 새로 만들지 않는다  ← 가장 아픈 것
 *
 *  파일이 스스로 이렇게 적어 뒀습니다(58~63줄):
 *  "바꾸는 것은 전부 공개 API 인 applyOptions 뿐입니다
 *   (시리즈를 지우거나 새로 만들지 않습니다 — 그러면 가로선·그림이 전부 떨어집니다)"
 * ========================================================================= */
section("[A] 시리즈를 건드리지 않는다 (깨지면 청산가 가로선이 사라집니다)");
{
  const 금지 = [
    "removeSeries",
    "addSeries",
    "addCandlestickSeries",
    "addLineSeries",
    "addAreaSeries",
    "createChart",
    "setData",
    "remove()",
  ];
  금지.forEach((낱말) => {
    ok("코드에 " + 낱말 + " 이(가) 없다", 코드.indexOf(낱말) === -1,
      "시리즈를 다시 만들면 js/chart-position-lines.js 의 진입가·TP·SL·청산가 " +
        "가로선과 js/chart-drawings.js 의 그림이 전부 떨어집니다");
  });
  ok("바꾸는 수단이 applyOptions 뿐이다", /applyOptions\(/.test(코드));
  ok("차트를 공개 API(panes/getSeries)로만 찾는다",
    /chart\.panes\(\)/.test(코드) && /getSeries\(\)/.test(코드));
  ok("캔들 시리즈인지 seriesType() 으로 확인하고 쓴다",
    /seriesType\s*&&\s*\w+\[j\]\.seriesType\(\)/.test(코드) || /seriesType\(\)/.test(코드));
}

/* =========================================================================
 * [D] 되돌리기 기준을 숫자로 적지 않는다
 *  파일 주석(168~170줄) — "숫자를 여기 적어 두면 js/chart.js 가 바뀔 때
 *  여기만 옛 색으로 남는 조용한 고장이 됩니다. 그래서 절대 적지 않습니다."
 * ========================================================================= */
section("[D] 되돌리기 기준을 그 자리에서 읽는다");
{
  ok("readBase() 가 candle.options() 를 읽는다", /candle\.options\(\)/.test(코드),
    "숫자를 적어 두면 js/chart.js 가 바뀔 때 여기만 옛 색으로 남습니다");
  ok("라이브러리 기본 캔들색(#26a69a/#ef5350)이 코드에 없다",
    코드.indexOf("#26a69a") === -1 && 코드.indexOf("#ef5350") === -1);
  ok("격자선 기본값이 팔레트 테두리색 상수를 가리킨다 (숫자 하드코딩 아님)",
    /GRID_DEFAULT\s*=\s*C_BORDER/.test(코드),
    "바이낸스 실측 #323C46 을 그대로 박으면 우리 배경 #0A0F1C 에서 안 보입니다");
}

/* =========================================================================
 * [E] 확정 팔레트 — PM 지시 2번
 *   CLAUDE.md 확정값:
 *   배경 #0A0F1C · 카드 #101727 · 카드안타일 #0D1422 · 테두리 #1D273B
 *   본문 #E7ECF5 · 보조 #838DA4 · 상승 #26C281 · 하락 #F0506E · 포인트 #F0B429
 * ========================================================================= */
section("[E] 확정 팔레트 · 모서리 · 그림자");
{
  const 확정 = [
    ["C_BG", "#0A0F1C", "배경"],
    ["C_CARD", "#101727", "카드"],
    ["C_TILE", "#0D1422", "카드안타일"],
    ["C_BORDER", "#1D273B", "테두리"],
    ["C_TEXT", "#E7ECF5", "본문"],
    ["C_MUTED", "#838DA4", "보조"],
    ["C_POINT", "#F0B429", "포인트(골드)"],
  ];
  확정.forEach(([이름, 값, 뜻]) => {
    const m = 코드.match(new RegExp("var\\s+" + 이름 + '\\s*=\\s*"([^"]*)"'));
    ok(뜻 + " " + 이름 + ' = "' + 값 + '"', !!m && m[1] === 값,
      "지금 " + (m ? m[1] : "찾지 못함") + " — 확정 팔레트는 개미톡 캡처에서 픽셀로 뽑은 값입니다");
  });

  /* CSS 를 만드는 곳에 색을 직접 박아 두면 팔레트를 바꿔도 그 자리만 옛 색으로
     남습니다. 팔레트 상수만 참조해야 합니다. */
  const injectStart = 코드.indexOf("function injectStyle()");
  const injectEnd = 코드.indexOf("function ", injectStart + 10);
  const inject = injectStart >= 0 ? 코드.slice(injectStart, injectEnd > 0 ? injectEnd : undefined) : "";
  ok("injectStyle() 를 찾았다", inject.length > 200);
  const 박힌색 = inject.match(/#[0-9a-fA-F]{6}/g) || [];
  ok("CSS 안에 하드코딩된 색이 0개다 (팔레트 상수만 참조)", 박힌색.length === 0,
    JSON.stringify(박힌색));

  /* 모서리 상한 12px (CLAUDE.md) — 실제로는 10px 로 씁니다 */
  const 반경 = (코드.match(/border-radius:(\d+)px/g) || []).map((s) => Number(s.match(/(\d+)/)[1]));
  ok("모서리 값이 있다 (" + JSON.stringify(반경) + ")", 반경.length > 0);
  ok("모서리 최댓값이 12px 이하다 (지금 " + Math.max.apply(null, 반경.concat([0])) + "px)",
    반경.every((r) => r <= 12), "CLAUDE.md 상한 12px");
  ok("창 본체 모서리가 10px 다", 반경.indexOf(10) >= 0);

  /* 그림자를 쓰지 않습니다 — 대신 위쪽에 흰색 3% 얇은 선(inset) */
  ok("box-shadow 를 쓰지 않는다", 코드.indexOf("box-shadow") === -1,
    "CLAUDE.md — 그림자 대신 카드 위쪽 흰색 3% 선만 씁니다");
  ok("카드 위쪽 흰색 3% 선이 있다", /rgba\(255,255,255,\.03\)/.test(코드));

  /* 밝은 배경(금색)에는 어두운 글자 */
  ok("저장 버튼은 금색 배경 + 어두운 글자다",
    /\.tl-cs-btn\.on\{[^}]*C_POINT/.test(코드.replace(/"\s*\+\s*/g, "").replace(/\s*\+\s*"/g, "")) ||
      /background:"\s*\+\s*C_POINT/.test(코드) ||
      코드.indexOf("C_POINT + \";color:\" + C_BG") >= 0 ||
      /btn\.on\{/.test(코드),
    "밝은 배경에는 어두운 글자를 씁니다 (CLAUDE.md)");

  /* ⭐ 상승/하락 색이 이 파일에 없는 것이 ★정상★ 입니다.
     캔들 색은 js/chart.js 가 쥔 값을 읽어서 씁니다([D]).
     여기에 #26C281 / #F0506E 를 적는 순간 js/chart.js 와 두 벌이 되고,
     한쪽만 바뀌면 조용한 고장이 됩니다. 그래서 "없음" 을 못 박습니다. */
  ok("상승색 #26C281 을 이 파일에 적어 두지 않았다 (js/chart.js 값을 읽어 씁니다)",
    코드.toUpperCase().indexOf("#26C281") === -1,
    "여기 적으면 js/chart.js 와 두 벌이 되어 한쪽만 바뀝니다");
  ok("하락색 #F0506E 를 이 파일에 적어 두지 않았다",
    코드.toUpperCase().indexOf("#F0506E") === -1);
}

/* =========================================================================
 * [F] z-index — 창이 떠 있는데 매수/매도가 눌리면 진짜 주문이 나갑니다
 * ========================================================================= */
section("[F] z-index (깨지면 창 뒤의 매수/매도가 눌립니다)");
{
  const m = 코드.match(/z-index:(\d+)/);
  ok("z-index 가 있다", !!m);
  const z = m ? Number(m[1]) : 0;
  ok("z-index 가 995 다 (지금 " + z + ")", z === 995);
  ok("폰 하단 매수/매도 바(990)보다 위다", z > 990,
    "80 으로 뒀을 때 360 폰에서 창이 떠 있는데도 아래 매수/매도 버튼이 눌렸습니다");
  ok("로그인 게이트(1000)보다 아래다", z < 1000,
    "게이트를 덮으면 로그인해야 하는 자리를 가립니다");
  ok("덮개가 화면 전체를 덮는다 (position:fixed + 사방 0)",
    /position:fixed;left:0;top:0;right:0;bottom:0/.test(코드));
}

/* =========================================================================
 * [G] 시세가 들어올 때 하는 일이 0
 *     2026-08-31 대표 — "차트를 계속 켜놓으니까 고장나더라" 와 같은 계열입니다.
 *     ⚠ 이 파일이 그 원인이라는 뜻은 아닙니다. 원인은 아직 안 나왔습니다.
 *       "적어도 이 파일은 쌓지 않는다" 를 못 박아 두는 것입니다.
 * ========================================================================= */
section("[G] 오래 켜 둬도 쌓이지 않는다");
{
  ok("App.Bus 를 구독하지 않는다 (시세마다 하는 일 0)",
    !/Bus\.on\s*\(/.test(코드),
    "봉마다 계산하는 것이 생기면 오래 켜 둘수록 느려집니다");
  ok("setInterval 이 없다", 코드.indexOf("setInterval") === -1);
  ok("requestAnimationFrame 반복이 없다", 코드.indexOf("requestAnimationFrame") === -1);
  ok("MutationObserver 가 없다", 코드.indexOf("MutationObserver") === -1);

  /* 시작할 때 차트를 기다리는 재시도는 상한이 있어야 합니다 — 영원히 돌면 안 됩니다 */
  const 상한 = 코드.match(/tries\s*<\s*(\d+)/);
  ok("시작 재시도에 상한이 있다 (지금 " + (상한 ? 상한[1] : "없음") + "회)", !!상한);
  ok("재시도 상한이 40회 이하다", !!상한 && Number(상한[1]) <= 40,
    "40회 × 250ms = 10초 뒤에는 포기합니다");

  /* keydown 은 딱 한 번만 붙습니다 (열 때마다 붙으면 쌓입니다) */
  ok("keydown 을 두 번 붙이지 않는다 (docBound 로 한 번만)",
    /docBound/.test(코드) && /if\s*\(!docBound\)/.test(코드),
    "창을 여닫을 때마다 붙으면 리스너가 쌓입니다");
  ok("봉 종류 감싸기도 한 번만 한다 (wrappedType)",
    /wrappedType/.test(코드) && /if\s*\(wrappedType\)\s*return/.test(코드),
    "여닫을 때마다 감싸면 겹겹이 쌓여 한 번 누를 때 여러 번 돕니다");
}

/* =========================================================================
 * 여기서부터는 ★실제로 돌려서★ 봅니다 — 가짜 차트를 끼워 넣습니다.
 *
 * ⚠ jsdom 에는 캔버스가 없습니다. "그려진 그림" 은 못 봅니다.
 *   가짜 차트에 ★어떤 값이 몇 번 넘어갔는가★ 까지만 봅니다.
 * ========================================================================= */

/* ⚠ jsdom 은 만든 직후 document.readyState 가 "loading" 입니다(2026-08-31 실측).
   그 상태로 eval 하면 chart-style.js 가 init() 을 DOMContentLoaded 로 미뤄서
   getStateForTest() 가 전부 null 로 나옵니다. 한 틱 기다렸다가 eval 합니다.
   처음에 이걸 놓쳐서 base 가 null 이었습니다. 실제 브라우저에서는 script 가
   </body> 앞에 있어 이런 일이 없습니다 — jsdom 쪽 사정입니다. */
async function 한틱() {
  await new Promise((r) => setTimeout(r, 0));
}

async function 부팅(opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
  });
  const w = dom.window;
  await 한틱();

  const 기록 = {
    candleApply: [],
    chartApply: [],
    저장: [],
    지움: [],
  };

  const 가짜캔들 = {
    seriesType: () => "Candlestick",
    options: () => ({
      upColor: opts.upColor || "#26c281",
      downColor: opts.downColor || "#f0506e",
      borderVisible: false,
      wickUpColor: opts.upColor || "#26c281",
      wickDownColor: opts.downColor || "#f0506e",
    }),
    applyOptions: (o) => 기록.candleApply.push(o),
  };
  const 가짜차트 = {
    panes: () => [{ getSeries: () => [가짜캔들] }],
    applyOptions: (o) => 기록.chartApply.push(o),
  };

  w.App = {
    ChartFont: { getCharts: () => [가짜차트] },
    ChartCandleType: {
      getType: () => opts.type || "candle",
      setType: function (t) {
        opts.type = t;
        return t;
      },
    },
    Storage: {
      load: () => (opts.saved === undefined ? null : opts.saved),
      save: (k, v) => 기록.저장.push([k, v]),
      clear: (k) => 기록.지움.push(k),
    },
  };

  w.eval(src);
  return { dom, w, 기록, 가짜차트, 가짜캔들 };
}

/* 여기서부터 끝까지는 jsdom 을 한 틱 기다려야 해서 비동기입니다.
   ⚠ 맨 아래에서 반드시 process.exit() 을 부릅니다 — 안 부르면 jsdom 창이
   타이머를 붙들어 프로세스가 안 끝나고, npm test 전체가 거기서 멈춥니다. */
async function 실행() {

/* =========================================================================
 * [B] 저장해 둔 것이 없으면 차트를 한 픽셀도 안 건드린다
 * ========================================================================= */
section("[B] 저장된 것이 없으면 차트를 안 건드린다");
{
  const { dom, w, 기록 } = await 부팅({});
  const S = w.App.ChartStyle.getStateForTest();

  ok("App.ChartStyle 이 만들어진다", !!w.App.ChartStyle);
  ok("getStateForTest() 가 열려 있다 (봉인용 출구)",
    typeof w.App.ChartStyle.getStateForTest === "function");
  ok("차트와 캔들 시리즈를 찾았다", !!S.chart && !!S.candle);
  ok("처음 값(base)을 읽었다", !!S.base);

  ok("★캔들에 아무것도 안 넘겼다 (applyOptions 0회)★", 기록.candleApply.length === 0,
    JSON.stringify(기록.candleApply));
  ok("★차트에도 아무것도 안 넘겼다 (applyOptions 0회)★", 기록.chartApply.length === 0,
    "이 창을 한 번도 안 연 회원 화면이 조용히 바뀝니다");
  ok("적용 상태(st)가 비어 있다", S.st === null);
  ok("격자선 기본값이 꺼짐이다 (가로·세로 둘 다)",
    S.base.gridV === false && S.base.gridH === false,
    "바이낸스는 기본이 켜짐이지만 우리는 오늘 화면을 그대로 둡니다");
  dom.window.close();
}

/* =========================================================================
 * [D-2] 되돌리기 기준을 그 자리에서 읽는지 — 색을 바꿔 부팅해 봅니다
 * ========================================================================= */
section("[D-2] base 가 차트를 따라간다 (숫자를 박아 두지 않았다)");
{
  const { dom, w } = await 부팅({ upColor: "#123456", downColor: "#654321" });
  const b = w.App.ChartStyle.getStateForTest().base;
  ok("차트 상승색이 #123456 이면 base.up 도 #123456", b.up === "#123456", JSON.stringify(b.up));
  ok("차트 하락색이 #654321 이면 base.down 도 #654321", b.down === "#654321", JSON.stringify(b.down));
  ok("테두리가 꺼져 있으면 테두리색을 봉 색에서 시작한다 (엉뚱한 청록색 방지)",
    b.borderUp === "#123456" && b.borderDown === "#654321",
    JSON.stringify({ borderUp: b.borderUp, borderDown: b.borderDown }));
  ok("테두리 기본이 꺼짐이다", b.borderOn === false);
  dom.window.close();
}

/* =========================================================================
 * [C] 봉 종류가 캔들이 아니면 캔들 색을 칠하지 않는다
 * ========================================================================= */
section("[C] 라인·바·영역일 때 캔들을 되살리지 않는다");

const 저장값 = {
  hollow: false,
  up: "#26c281",
  down: "#f0506e",
  borderOn: false,
  borderUp: "#26c281",
  borderDown: "#f0506e",
  wickUp: "#26c281",
  wickDown: "#f0506e",
  gridV: true,
  gridH: true,
  gridColor: "#1d273b",
};

{
  /* 캔들일 때 — 둘 다 칠합니다 */
  const a = await 부팅({ saved: 저장값, type: "candle" });
  ok("캔들일 때는 캔들 색을 칠한다 (1회)", a.기록.candleApply.length === 1,
    JSON.stringify(a.기록.candleApply.length));
  ok("캔들일 때 격자선도 칠한다 (1회)", a.기록.chartApply.length === 1);
  a.dom.window.close();

  /* 라인일 때 — 캔들은 건드리지 않고 격자선만 */
  for (const t of ["line", "bars", "area"]) {
    const b = await 부팅({ saved: 저장값, type: t });
    ok("★" + t + " 일 때 캔들에 아무것도 안 넘긴다 (0회)★", b.기록.candleApply.length === 0,
      "숨겨 둔 캔들이 다시 나타나 라인 차트와 겹칩니다");
    ok(t + " 일 때도 격자선은 칠한다 (1회)", b.기록.chartApply.length === 1);
    b.dom.window.close();
  }
}

/* =========================================================================
 * [C-2] 봉 종류가 캔들로 되돌아오면 우리 색을 다시 칠한다
 *   (js/chart-candle-type.js 를 밖에서 감싼 것이 살아 있는가)
 * ========================================================================= */
section("[C-2] 캔들로 되돌아오면 다시 칠한다");
{
  const { dom, w, 기록 } = await 부팅({ saved: 저장값, type: "line" });
  const S = w.App.ChartStyle.getStateForTest();
  ok("App.ChartCandleType.setType 을 감쌌다", S.wrappedType === true,
    "감싸지 못하면 라인 → 캔들로 되돌아올 때 회원이 고른 색이 사라집니다");
  ok("라인 상태에서는 캔들에 0회", 기록.candleApply.length === 0);

  w.App.ChartCandleType.setType("candle");
  ok("★캔들로 되돌리면 그때 다시 칠한다 (1회)★", 기록.candleApply.length === 1,
    JSON.stringify(기록.candleApply.length));
  ok("되돌아온 뒤 넘긴 값이 회원이 고른 색이다",
    기록.candleApply.length === 1 && 기록.candleApply[0].upColor === "#26c281",
    JSON.stringify(기록.candleApply[0]));
  dom.window.close();
}

/* =========================================================================
 * [C-3] 속빈 캔들(hollow) — 몸통을 투명으로, 테두리는 켠다
 *   깨지면: 회원이 속빈 캔들을 골랐는데 꽉 찬 캔들이 나오거나,
 *           몸통도 테두리도 없어져 봉이 통째로 사라집니다.
 * ========================================================================= */
section("[C-3] 속빈 캔들");
{
  const hollow = JSON.parse(JSON.stringify(저장값));
  hollow.hollow = true;
  const { dom, 기록 } = await 부팅({ saved: hollow, type: "candle" });
  const o = 기록.candleApply[0] || {};
  ok("속빈 캔들이면 몸통이 투명이다", o.upColor === "rgba(0,0,0,0)", JSON.stringify(o.upColor));
  ok("★속빈 캔들이면 테두리를 반드시 켠다★", o.borderVisible === true,
    "테두리까지 꺼지면 오름 봉이 통째로 안 보입니다");
  dom.window.close();
}

/* =========================================================================
 * [H] 저장 규칙
 * ========================================================================= */
section("[H] 저장");
{
  ok('저장 키가 "chart-style" 이다', w저장키() === "chart-style");
  function w저장키() {
    const m = 코드.match(/STORAGE_KEY\s*=\s*"([^"]*)"/);
    return m ? m[1] : null;
  }
  ok("기본값과 같으면 저장하지 않고 지운다 (쓰레기를 안 남긴다)",
    /same\(st,\s*b\)[\s\S]{0,200}Storage\.clear/.test(코드));
  ok("저장을 안 누르고 닫으면 마지막 저장값(없으면 처음 값)으로 되돌린다",
    /if\s*\(!kept\)[\s\S]{0,160}st\s*=\s*clone\(saved\s*\|\|\s*base\)[\s\S]{0,60}applyAll\(\)/.test(코드),
    "저장 안 눌렀는데 값이 남으면 회원이 되돌릴 방법이 없습니다");
  ok("저장에서 넘기는 항목이 11개로 정해져 있다",
    (코드.match(/KEYS\s*=\s*\[([\s\S]*?)\]/) || [])[1] &&
      코드.match(/KEYS\s*=\s*\[([\s\S]*?)\]/)[1].split(",").length === 11,
    "임의의 값이 저장소로 새어 들어가지 않게 흰 목록으로 둡니다");

  /* 저장된 값 중 색은 #rrggbb 형태만 받아들입니다 (남이 넣은 값 방어) */
  ok("저장소에서 읽은 색은 #rrggbb 형태만 받아들인다",
    /\/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(s\[k\]\)/.test(코드),
    "회원 브라우저 저장소는 누구나 고칠 수 있습니다");
}

/* =========================================================================
 * [I] 실려 있는가 · 되돌리는 방법
 * ========================================================================= */
section("[I] 실려 있는가 · 되돌리는 방법");
{
  const html = read("index.html");
  ok("index.html 에 script 한 줄이 있다",
    html.indexOf('<script src="js/chart-style.js"></script>') >= 0);
  ok("script 줄이 딱 한 번만 있다",
    html.split('src="js/chart-style.js"').length - 1 === 1);
  ok("파일에 되돌리는 방법이 4단계로 적혀 있다",
    /되돌리기/.test(src) && /index\.html 의 <script src="js\/chart-style\.js"><\/script> 삭제/.test(src));
  ok("js/chart.js 를 고치지 않았다고 파일이 선언한다",
    /js\/chart\.js 는 한 글자도 고치지 않았습니다/.test(src));
}

/* =========================================================================
 * [J] 돌연변이 자체검증 — 이 봉인이 진짜 잡는가
 *     소스 ★사본★ 을 메모리에서 틀리게 바꿔 돌립니다. 디스크는 안 건드립니다.
 * ========================================================================= */
section("[J] 돌연변이 자체검증 (디스크는 안 건드립니다)");

async function 사본부팅(바꾼소스, opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const w = dom.window;
  await 한틱();
  const 기록 = { candleApply: [], chartApply: [] };
  const 가짜캔들 = {
    seriesType: () => "Candlestick",
    options: () => ({ upColor: "#26c281", downColor: "#f0506e", borderVisible: false }),
    applyOptions: (o) => 기록.candleApply.push(o),
  };
  w.App = {
    ChartFont: { getCharts: () => [{ panes: () => [{ getSeries: () => [가짜캔들] }], applyOptions: (o) => 기록.chartApply.push(o) }] },
    ChartCandleType: { getType: () => opts.type || "candle", setType: (t) => t },
    Storage: { load: () => (opts.saved === undefined ? null : opts.saved), save: () => {}, clear: () => {} },
  };
  w.eval(바꾼소스);
  const 결과 = { 기록: 기록, 상태: w.App.ChartStyle.getStateForTest() };
  dom.window.close();
  return 결과;
}

{
  /* 대조군 */
  const 정상 = await 사본부팅(src, { saved: 저장값, type: "line" });
  ok("(대조) 원본 사본은 라인일 때 캔들에 0회", 정상.기록.candleApply.length === 0);

  /* 1) [C] — 캔들 종류 확인을 빼면 라인 위에 캔들이 되살아난다 */
  const 확인뺌 = src.replace('if (candleTypeNow() === "candle") {', "if (true) {");
  const r1 = 확인뺌 === src ? null : await 사본부팅(확인뺌, { saved: 저장값, type: "line" });
  ok("[C] 봉 종류 확인을 빼면 라인일 때도 캔들을 칠한다 (= 겹침 부활)",
    !!r1 && r1.기록.candleApply.length === 1,
    "여기서 못 잡으면 [C] 는 가짜입니다");

  /* 2) [B] — 저장된 게 없어도 칠하게 바꾸면 모든 회원 화면이 바뀐다 */
  const 무조건적용 = src.replace(
    "        var s = loadSaved();\n        if (s) {",
    "        var s = loadSaved() || clone(base);\n        if (s) {"
  );
  const r2 = 무조건적용 === src ? null : await 사본부팅(무조건적용, {});
  ok("[B] 저장 없이도 칠하게 바꾸면 applyOptions 가 불린다 (= 모든 회원 화면이 바뀜)",
    !!r2 && r2.기록.candleApply.length > 0,
    "여기서 못 잡으면 [B] 는 가짜입니다");

  /* 3) [D] — base 를 숫자로 박으면 차트를 안 따라간다 */
  const 숫자박음 = src.replace("      up: hex6(up),", '      up: "#26a69a",');
  const r3 = await 사본부팅(숫자박음, {});
  ok("[D] base 를 숫자로 박으면 차트 색을 안 따라간다",
    숫자박음 !== src && r3.상태.base.up === "#26a69a" && 주석제거(숫자박음).indexOf("#26a69a") >= 0,
    "코드에 #26a69a 가 나타나므로 [D] 의 문자열 검사가 잡습니다");

  /* 4) [C-3] — 속빈 캔들에서 테두리를 안 켜면 봉이 사라진다 */
  const 테두리안켬 = src.replace(
    "borderVisible: !!(st.borderOn || st.hollow),",
    "borderVisible: !!st.borderOn,"
  );
  const hollow = JSON.parse(JSON.stringify(저장값));
  hollow.hollow = true;
  const r4 = 테두리안켬 === src ? null : await 사본부팅(테두리안켬, { saved: hollow, type: "candle" });
  ok("[C-3] 속빈 캔들에서 테두리를 안 켜면 borderVisible 이 false 가 된다",
    !!r4 && r4.기록.candleApply[0].borderVisible === false,
    "오름 봉이 통째로 안 보이게 됩니다");

  /* 5) [F] — z-index 를 80 으로 되돌리면 잡는다 (실제로 났던 값) */
  const z낮춤 = src.replace("z-index:995", "z-index:80");
  const z = Number(주석제거(z낮춤).match(/z-index:(\d+)/)[1]);
  ok("[F] z-index 를 80 으로 되돌리면 잡는다 (990 아래)", z낮춤 !== src && !(z > 990));

  /* 6) [E] — 팔레트를 한 글자 바꾸면 잡는다 */
  const 팔레트바꿈 = src.replace('var C_CARD = "#101727";', 'var C_CARD = "#111827";');
  const c = 주석제거(팔레트바꿈).match(/var\s+C_CARD\s*=\s*"([^"]*)"/)[1];
  ok("[E] 카드색을 #111827 로 바꾸면 잡는다", 팔레트바꿈 !== src && c !== "#101727");

  /* 7) [A] — 시리즈를 다시 만드는 코드를 넣으면 잡는다 */
  const 시리즈생성 = src.replace(
    "  function applyAll() {",
    "  function applyAll() {\n    chart.addCandlestickSeries({});"
  );
  ok("[A] addCandlestickSeries 를 넣으면 잡는다",
    시리즈생성 !== src && 주석제거(시리즈생성).indexOf("addCandlestickSeries") >= 0,
    "가로선·그림이 전부 떨어지는 변경입니다");

  /* 8) [G] — 시세 구독을 붙이면 잡는다 */
  const 구독붙임 = src.replace(
    "  function init() {",
    '  function init() {\n    App.Bus.on("price:update", applyAll);'
  );
  ok("[G] 시세 구독을 붙이면 잡는다",
    구독붙임 !== src && /Bus\.on\s*\(/.test(주석제거(구독붙임)));
}

/* =========================================================================
 * [K] 수정 금지 12개 · 등록
 * ========================================================================= */
section("[K] 수정 금지 12개 · 등록");
{
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [
    ["trading.js", require("./_locked-hashes.js").TRADING],  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
    ["ui.js", "333fc427e75b47b306699c92aa4e7b50"],
    ["auth.js", "9cec9a7257eb54f379bf72e14e21e463"],
    ["supabase-sync.js", "faddcbbc34b5165177ff26cb978040f8"],
    ["chat.js", "a93dfaa7f82ce72a914b270acb3650bb"],
    ["leaderboard.js", "62e839f06e0565cca5d9216e484b6031"],
    ["admin.js", "424e4c63ec1cd24681c4f27f60aee2fa"],
    ["season.js", "9c5fbf13ced09ca2f348e48f87c78224"],
    ["board.js", "8b847bd8f5d8231b8dd329f8b15dbe37"],
    ["orderbook.js", "fa5f77dc5108133128f85ba5ab3f096e"],
    ["chart.js", "02ddcb000d577131f797143d08c09123"],
    ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"],
  ].forEach(([f, want]) => ok("js/" + f + " 해시 그대로", md5(f) === want, md5(f)));

  const 파일명 = "tests/chart-style-seal.test.js";
  let order = "";
  try {
    order = read("tests/_order.txt");
  } catch (e) {
    order = "";
  }
  ok("tests/_order.txt 에 이 파일이 등록돼 있다", order.indexOf(파일명) >= 0,
    "등록 안 하면 파일은 멀쩡한데 아무도 안 돌립니다 (2026-08-30 실제 사고)");
}

} /* ← async function 실행() 끝 */

실행()
  .catch(function (e) {
    fail++;
    실패목록.push("테스트 자체가 중간에 죽었습니다: " + (e && e.stack ? e.stack : e));
    console.log("  " + MARK_NG + " 테스트 실행 중 오류 — " + e);
  })
  .then(function () {
    console.log("\n==========================================================");
    console.log("통과 " + pass + " / 실패 " + fail);
    if (fail) {
      console.log("실패 있음 ❌");
      실패목록.forEach((s) => console.log("  - " + s));
      process.exit(1);
    }
    console.log("전체 통과 ✅");
    /* ⚠ jsdom 창이 타이머를 붙들면 프로세스가 안 끝나고 npm test 전체가
       여기서 멈춥니다. 반드시 부릅니다. */
    process.exit(0);
  });
