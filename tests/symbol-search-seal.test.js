/* tests/symbol-search-seal.test.js
 * =========================================================================
 * 마켓 목록 ★검색창★ — 2026-10-01 PM 배정 / 수리팀 (사양서 TL-024 7번)
 * =========================================================================
 *   "[돋보기] 종목 검색" 칸을 오른쪽 종목 목록 맨 위에 답니다.
 *   한글 이름(비트코인)과 종목 코드(BTCUSDT) ★둘 다★ 로 거를 수 있어야 하고,
 *   하나도 안 맞으면 "찾는 종목이 없습니다" 를 보여줘야 합니다.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ ──────────────────────────────────────
 *   js/upbit-right-column.js 의 renderSymbols() 는 줄마다
 *       tr.className = "tl-sym-row is-active";   /  tr.className = "tl-sym-row";
 *   로 ★className 을 통째로 덮습니다★. 그리고 그 함수는 시세가 올 때마다 +
 *   1초마다(MIRROR_MS) 돕니다.
 *
 *   그래서 검색 결과를 classList 로 숨기면
 *       ★1초 뒤에 거른 줄이 저절로 다시 나타납니다.★
 *   오류도 안 나고 화면도 안 깨집니다 — 전형적인 조용한 고장입니다.
 *   손으로 확인할 때는 1초를 안 기다려서 ★통과한 것처럼 보입니다★.
 *
 *   아래 [4] 가 jsdom 에서 ★renderSymbols() 를 실제로 다시 돌린 뒤★
 *   거른 줄이 그대로인지 봅니다. 손 확인이 못 잡는 자리를 여기서 못 박습니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] js/upbit-right-column.js 를 ★한 글자도 안 고쳤다★
 *       (그 파일의 className 덮어쓰기 두 줄이 아직 그대로다 — 함정이 살아 있다)
 *   [3] 새 모듈이 classList 가 아니라 style.display 로 숨긴다
 *   [4] ⭐ jsdom 으로 실제로 걸러 본다 + renderSymbols() 를 다시 돌려도 유지된다
 *   [5] 하나도 안 맞을 때 ★빈 화면★ 이 아니라 말로 적는다
 *   [6] 종목 이름을 파일에 적지 않는다 (SymbolRegistry 가 단일 출처 · 컴포넌트화)
 *   [7] 글씨 17px 바닥 · 그림자 없음 · 모서리 12px 이하 · 이모지 없음(인라인 SVG)
 *       · 확정 팔레트 9색만
 *   [8] index.html · main.js 등록 + git 추적 ("UpbitRightColumn" ★뒤★)
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/symbol-search.css";
const JS_REL = "js/symbol-search.js";
const HOST_REL = "js/upbit-right-column.js";

const CSS = read(CSS_REL);
const JS = read(JS_REL);
const HOST = read(HOST_REL);
const HTML = read("index.html");
const MAIN = read("main.js");

/* 주석을 지운 "실제 코드" — 설명문에 적힌 글자 때문에 오판하지 않게 */
function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const CSS_CODE = 코드만(CSS);
const JS_CODE = 코드만(JS);
const HOST_CODE = 코드만(HOST);

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

console.log("\n마켓 목록 검색창 (사양서 7번)");

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
 * [2] 숙주 파일을 안 고쳤다 — 함정이 아직 살아 있다
 * ========================================================================= */
절("[2] js/upbit-right-column.js 를 ★안 고쳤다★ (함정이 그대로 있다)");
{
  ok("renderSymbols() 가 아직 tr.className 을 ★통째로★ 덮는다",
    /tr\.className\s*=\s*"tl-sym-row is-active"/.test(HOST_CODE) &&
    /tr\.className\s*=\s*"tl-sym-row"/.test(HOST_CODE),
    "이 두 줄이 사라졌다면 검색은 멀쩡하겠지만, 이 봉인의 전제가 바뀐 것입니다. " +
    "그때는 [3][4] 를 다시 설계하세요");
  ok("숙주가 1초마다 돈다 (MIRROR_MS)",
    /MIRROR_MS\s*=\s*1000/.test(HOST_CODE),
    "주기가 바뀌면 '2초 기다려 확인' 기준도 같이 바꿔야 합니다");
  ok("숙주에 검색 코드가 섞여 들어가지 않았다",
    HOST_CODE.indexOf("symsearch") < 0 && HOST_CODE.indexOf("SymbolSearch") < 0,
    "검색은 ★별도 모듈★ 입니다. 숙주를 고치면 upbit-layout-seal 과 엉킵니다");
}

/* =========================================================================
 * [3] classList 가 아니라 style.display 로 숨긴다
 * ========================================================================= */
절("[3] ⭐ 거를 때 className 을 건드리지 않는다");
{
  ok("style.display 로 숨긴다", /\.style\.display\s*=/.test(JS_CODE),
    "className 을 쓰면 1초 뒤 renderSymbols() 가 덮어써서 되살아납니다");
  ok("줄을 classList 로 숨기지 않는다",
    !/classList\.(add|remove|toggle)/.test(JS_CODE),
    "renderSymbols() 가 tr.className 을 통째로 덮습니다 — 1초 뒤 되살아납니다");
  ok("tr.className 에 직접 대입하지 않는다",
    !/tr\.className\s*=/.test(JS_CODE),
    "숙주와 서로 덮습니다");
  ok("줄을 ★지우지★ 않는다 (마크업 보존 — 되살릴 수 있어야 합니다)",
    !/removeChild\s*\(\s*tr/.test(JS_CODE) && !/\btr\.remove\(\)/.test(JS_CODE));
}

/* =========================================================================
 * [4] ⭐ 실제로 걸러 본다 (jsdom) — 그리고 renderSymbols() 를 다시 돌린다
 * ========================================================================= */
절("[4] ⭐ 실제로 걸러 본다 + 1초 뒤(renderSymbols 재실행)에도 유지된다");
{
  const dom = new JSDOM(
    '<!doctype html><html><body><aside class="page-right"></aside></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;

  /* 숙주가 기대하는 것만 아주 얇게 세웁니다 — 종목 4개와 시세 */
  win.eval(`
    window.App = {};
    App.SymbolRegistry = {
      getAll: function () {
        return [
          { symbol: "BTCUSDT",      name: "비트코인",   spec: { priceDecimals: 2 } },
          { symbol: "QQQUSDT",      name: "나스닥",     spec: { priceDecimals: 2 } },
          { symbol: "SAMSUNGUSDT",  name: "삼성전자",   spec: { priceDecimals: 2 } },
          { symbol: "SKHYNIXUSDT",  name: "SK하이닉스", spec: { priceDecimals: 2 } }
        ];
      },
      getBySymbol: function (s) {
        return App.SymbolRegistry.getAll().filter(function (x) { return x.symbol === s; })[0] || null;
      }
    };
    App.AllSymbolFeed = {
      getState: function () { return "open"; },
      get: function () { return { price: 100, changePercent: 1.5 }; }
    };
    App.Config = { getActiveSymbol: function () { return "BTCUSDT"; } };
  `);

  win.eval(read(HOST_REL));
  win.eval(read(JS_REL));
  win.App.UpbitRightColumn.init();
  win.App.SymbolSearch.init();

  const 줄들 = () =>
    Array.prototype.slice.call(doc.querySelectorAll('#tl-sym-body tr[data-symbol]'));
  const 보이는 = () =>
    줄들().filter((t) => t.style.display !== "none").map((t) => t.getAttribute("data-symbol"));

  const input = doc.getElementById("tl-symsearch-input");
  const empty = doc.getElementById("tl-symsearch-empty");

  ok("검색칸이 생긴다", !!input);
  ok("검색칸이 종목 카드(#tl-sym-list) ★안★ 에 있다",
    !!input && !!input.closest && !!input.closest("#tl-sym-list"));
  ok("검색칸이 표(.tl-sym-table) ★앞★ 에 있다", (() => {
    const card = doc.getElementById("tl-sym-list");
    const table = card && card.querySelector(".tl-sym-table");
    if (!card || !table || !input) return false;
    const wrap = doc.getElementById("tl-symsearch");
    return !!wrap &&
      (wrap.compareDocumentPosition(table) & win.Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  })(), "표 아래에 있으면 사양서 그림과 다릅니다");
  ok("돋보기가 ★인라인 SVG★ 다 (이모지 금지)",
    !!doc.querySelector("#tl-symsearch svg circle") &&
    !!doc.querySelector("#tl-symsearch svg line"));
  ok("처음엔 4줄 모두 보인다 — [" + 보이는().join(",") + "]", 보이는().length === 4);
  ok("처음엔 '없습니다' 가 숨어 있다", !!empty && empty.hidden === true);

  function 쳐본다(v) {
    input.value = v;
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  }

  /* 한글 이름으로 */
  쳐본다("비트");
  ok('"비트" → 1줄 (비트코인) — [' + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === "BTCUSDT");

  /* ⭐⭐ 여기가 핵심 — 숙주를 1초 주기처럼 ★다시 돌립니다★ */
  win.App.UpbitRightColumn.renderSymbols();
  win.App.UpbitRightColumn.renderSymbols();
  ok("⭐ renderSymbols() 를 다시 돌려도 ★거른 상태가 유지된다★ — [" +
    보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === "BTCUSDT",
    "classList 로 숨기면 여기서 4줄로 되살아납니다(1초 뒤 화면과 같은 상황)");
  ok("숙주가 실제로 className 을 다시 덮었다 (헛돌지 않았다)",
    줄들()[0].className === "tl-sym-row is-active",
    "덮지 않았다면 위 검사가 ★가짜로 통과★ 한 것입니다");

  /* 종목 코드로 */
  쳐본다("QQQ");
  ok('"QQQ" → 1줄 (나스닥) — [' + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === "QQQUSDT",
    "한글 이름뿐 아니라 ★코드★ 로도 걸러져야 합니다");

  /* 대소문자·공백 */
  쳐본다("  qqq  ");
  ok('"  qqq  " (소문자·공백) 도 같은 1줄', 보이는().length === 1);

  /* 안 맞을 때 */
  쳐본다("없는이름");
  ok('"없는이름" → 0줄', 보이는().length === 0);
  ok("0줄일 때 ★빈 화면이 아니라★ 말로 적는다",
    !!empty && empty.hidden === false && /찾는 종목이 없습니다/.test(empty.textContent),
    "아무 말 없는 빈 칸은 조용한 고장입니다");
  win.App.UpbitRightColumn.renderSymbols();
  ok("0줄 상태도 renderSymbols() 뒤에 유지된다",
    보이는().length === 0 && empty.hidden === false);

  /* 지우면 돌아온다 */
  쳐본다("");
  ok("검색어를 지우면 4줄이 ★그대로 돌아온다★ (마크업 보존)",
    보이는().length === 4);
  ok("돌아오면 '없습니다' 가 다시 숨는다", empty.hidden === true);
}

/* =========================================================================
 * [5][6] 빈 화면 금지 · 종목 이름을 파일에 적지 않는다
 * ========================================================================= */
절("[5][6] 빈 화면 금지 · 종목을 파일에 적지 않는다(컴포넌트화)");
{
  ok("'찾는 종목이 없습니다' 를 모듈이 직접 적는다",
    /찾는 종목이 없습니다/.test(JS_CODE));
  ok("App.SymbolRegistry 에서 이름을 읽는다 (단일 출처)",
    /SymbolRegistry/.test(JS_CODE));
  ["BTCUSDT", "QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT", "비트코인", "나스닥"].forEach((n) => {
    ok("모듈에 '" + n + "' 를 적지 않았다", JS_CODE.indexOf(n) < 0,
      "종목이 늘면 js/symbol-registry.js 만 고치면 되게");
  });
  ok("줄을 그때그때 DOM 에서 훑는다 (개수를 박아두지 않는다)",
    /querySelectorAll\(\s*["']tr\[data-symbol\]["']\s*\)/.test(JS_CODE));
  ok("줄이 늘어나면 다시 거른다 (MutationObserver)",
    /MutationObserver/.test(JS_CODE),
    "향후 종목 추가를 고려해 컴포넌트화 — 사양서 7번");
}

/* =========================================================================
 * [7] 디자인 확정 규칙
 * ========================================================================= */
절("[7] 글씨 17px 바닥 · 그림자 없음 · 모서리 10px · 이모지 없음 · 팔레트 9색");
{
  const 글씨 = CSS_CODE.match(/font-size\s*:\s*([\d.]+)px/g) || [];
  const 작은것 = 글씨.map((s) => Number(s.match(/([\d.]+)px/)[1])).filter((n) => n < 17);
  ok("17px 보다 작은 글씨가 없다 (" + 글씨.length + "곳 확인)", 작은것.length === 0,
    "대표님이 '14px 도 작다' 고 세 번 말씀하셨습니다. 발견: " + 작은것.join(", "));
  ok("검색 입력칸 글씨가 17px 이상이다",
    /\.tl-symsearch-input\{[^}]*font-size\s*:\s*(1[7-9]|[2-9]\d)px/.test(
      CSS_CODE.replace(/\s*\n\s*/g, "")),
    "입력칸은 특히 작게 두기 쉬운 자리입니다");

  const 그림자 = (CSS_CODE.match(/box-shadow\s*:[^;]+;/g) || [])
    .filter((s) => !/inset/.test(s) && !/none/.test(s));
  ok("그림자를 쓰지 않는다", 그림자.length === 0, "발견: " + 그림자.join(" | "));

  const 모서리 = (CSS_CODE.match(/border-radius\s*:\s*([\d.]+)px/g) || [])
    .map((s) => Number(s.match(/([\d.]+)px/)[1]));
  ok("모서리가 12px 을 넘지 않는다", 모서리.filter((n) => n > 12).length === 0,
    "발견: " + 모서리.join(", "));

  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B",
                  "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 바깥 = Array.from(new Set((CSS_CODE.match(/#[0-9A-Fa-f]{6}/g) || [])
    .map((s) => s.toUpperCase()))).filter((c) => 팔레트.indexOf(c) < 0);
  ok("확정 팔레트 9색만 쓴다", 바깥.length === 0, "발견: " + 바깥.join(", "));

  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("새 모듈이 만드는 글자에 이모지가 없다", !EMOJI.test(JS_CODE),
    "돋보기는 인라인 SVG 로 그립니다");
  ok("새 CSS 에 이모지가 없다", !EMOJI.test(CSS_CODE));
  ok("CSS 에 content: 로 글자 아이콘을 넣지 않았다", !/content\s*:\s*["'][^"']/.test(CSS_CODE));
}

/* =========================================================================
 * [8] 등록 상태
 * ========================================================================= */
절("[8] index.html · main.js 등록 + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다",
    HTML.indexOf('<link rel="stylesheet" href="css/symbol-search.css">') >= 0);
  ok("index.html 이 새 모듈을 부른다",
    HTML.indexOf('<script src="js/symbol-search.js"></script>') >= 0);
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf("css/symbol-search.css") > HTML.indexOf('href="style.css"'),
    "앞에 있으면 덮지 못합니다");
  ok("새 모듈이 숙주 모듈보다 ★뒤★ 에 있다",
    HTML.indexOf('<script src="js/symbol-search.js"></script>') >
    HTML.indexOf('<script src="js/upbit-right-column.js"></script>'),
    "앞에 두면 카드(#tl-sym-list)가 아직 없습니다");
  /* 주석에 경로를 또 적으면 '등장 횟수' 를 세는 봉인들이 오판합니다 */
  ["css/symbol-search.css", "js/symbol-search.js"].forEach((p) => {
    const n = HTML.split(p).length - 1;
    ok("index.html 에 " + p + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1,
      "주석에 경로를 또 적지 마세요 — 등장 횟수를 세는 봉인이 두 벌로 봅니다");
  });

  const 목록 = MAIN.slice(MAIN.indexOf("const modules = ["),
                         MAIN.indexOf("modules.forEach"));
  ok('main.js 에 "SymbolSearch" 가 있다', 목록.indexOf('"SymbolSearch"') > 0);
  ok('"SymbolSearch" 가 "UpbitRightColumn" ★뒤★ 에 있다',
    목록.indexOf('"SymbolSearch"') > 목록.indexOf('"UpbitRightColumn"'),
    "앞에 두면 카드(#tl-sym-list)가 아직 없습니다");

  [CSS_REL, JS_REL].forEach((rel) => {
    const 추적 = execFileSync("git", ["ls-files", "--", rel], { cwd: REPO })
      .toString().trim();
    ok(rel + " 가 git 에 올라가 있다", 추적 === rel,
      "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
  });
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " symbol-search-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
