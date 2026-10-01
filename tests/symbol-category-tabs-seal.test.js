/* tests/symbol-category-tabs-seal.test.js
 * =========================================================================
 * 종목 목록 ★카테고리 탭★ — 2026-10-01 PM 배정 / 수리팀
 * =========================================================================
 *   대표 지시 "업비트랑 비슷하게 ㄱㄱ 카테고리들도"
 *   [전체] [코인] [주식] [보유] [관심] 5개 + 줄 맨 앞 ★관심 별★.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ 세 가지 ──────────────────────────────
 *
 *   (1) 1초 뒤 되살아나기
 *       js/upbit-right-column.js 의 renderSymbols() 가 tr.className 을
 *       ★통째로 덮습니다★(시세마다 + 1초마다). classList 로 숨기면 1초 뒤
 *       거른 줄이 저절로 돌아옵니다. 오류도 안 나고 손으로는 못 잡습니다.
 *       -> [4] 가 jsdom 에서 renderSymbols() 를 ★실제로 다시 돌려★ 봅니다.
 *
 *   (2) 탭과 검색이 ★서로를 덮기★
 *       검색칸(js/symbol-search.js)이 이미 tr.style.display 를 씁니다.
 *       탭이 같은 자리를 따로 쓰면 나중에 돈 쪽이 이기고 앞 조건이 조용히
 *       사라집니다. [주식] 탭인데 코인이 보이는 식입니다.
 *       -> 숨기는 곳은 ★검색 모듈 한 곳★ 이어야 합니다([3]).
 *          탭은 setExtraFilter 로 조건만 맡기고, 둘은 ★교집합★ 입니다([4]).
 *
 *   (3) ⭐ 새 <td> 를 만들면 ★행이 깨집니다★ (2026-10-01 실측)
 *       renderSymbols() 는 칸을 ★번호로★ 찾아 씁니다(cells[1]=현재가,
 *       cells[2]=등락률). 별을 담으려고 <td> 를 하나 끼우고 6초 기다리니
 *           <td class="tl-sym-name">83,351.40</td>   <- 종목명 칸에 현재가
 *           <td class="tl-sym-chg">+0.04%</td>
 *           <td class="tl-sym-chg">+0.06%</td>       <- 갱신이 멈춘 옛 값
 *       회원 눈에는 "이름이 숫자로 바뀌고 등락률이 두 개" 로 보입니다.
 *       -> [3] 이 "칸을 만들지 않는다" 를 소스로, [4] 가 "renderSymbols()
 *          뒤에도 칸이 3개" 를 ★실제로 돌려★ 확인합니다.
 *
 * ── 무엇을 더 지키나 ────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] js/upbit-right-column.js 를 ★한 글자도 안 고쳤다★
 *   [3] 탭 모듈이 줄을 직접 숨기지 않는다 · 칸(td)을 만들지 않는다
 *   [4] ⭐ jsdom 으로 실제로 눌러 본다 — 탭별 줄 수 · 1초 뒤 유지 ·
 *       탭+검색 교집합 · 별 토글 · 별을 눌러도 ★종목이 안 바뀐다★ ·
 *       localStorage 에만 남는다 · 0줄일 때 왜 비었는지 말로 적는다
 *   [5] 종목 이름·코드를 파일에 적지 않는다 (SymbolRegistry 단일 출처)
 *       + ⭐ 레지스트리의 ★모든★ 종목이 코인·주식 중 한 곳에는 들어간다
 *         (새 type 이 생겨 어느 탭에도 안 나오는 종목을 막습니다)
 *   [6] ⛔ "지수" 라고 쓰지 않는다 — QQQUSDT 는 지수가 아니라 ETF 입니다
 *   [7] 글씨 17px 바닥 · 그림자 없음 · 모서리 12px 이하 · 이모지 없음(인라인 SVG)
 *       · 확정 팔레트 9색만
 *   [8] index.html · main.js 등록 + git 추적 ("SymbolSearch" ★뒤★)
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *   이 파일과 tests/_order.txt 의 등록 줄을 git rm -f 로 삭제한 뒤
 *   ★git add tests/_order.txt★ 까지 해야 끝납니다.
 *   (rm 이 아니라 git rm — git 에 남으면 tests-dir-hygiene 이 터집니다)
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/symbol-category-tabs.css";
const JS_REL = "js/symbol-category-tabs.js";
const HOST_REL = "js/upbit-right-column.js";
const SEARCH_REL = "js/symbol-search.js";
const REG_REL = "js/symbol-registry.js";

const CSS = read(CSS_REL);
const JS = read(JS_REL);
const HOST = read(HOST_REL);
const SEARCH = read(SEARCH_REL);
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
const SEARCH_CODE = 코드만(SEARCH);

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

console.log("\n종목 목록 카테고리 탭 (대표 지시 2026-10-01)");

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
    "이 두 줄이 사라졌다면 이 봉인의 전제가 바뀐 것입니다. [3][4] 를 다시 설계하세요");
  ok("숙주가 1초마다 돈다 (MIRROR_MS)",
    /MIRROR_MS\s*=\s*1000/.test(HOST_CODE),
    "주기가 바뀌면 '기다려 확인' 기준도 같이 바꿔야 합니다");
  ok("숙주에 탭·별 코드가 섞여 들어가지 않았다",
    HOST_CODE.indexOf("symcat") < 0 &&
    HOST_CODE.indexOf("symfav") < 0 &&
    HOST_CODE.indexOf("SymbolCategoryTabs") < 0,
    "탭은 ★별도 모듈★ 입니다. 숙주를 고치면 upbit-layout-seal 과 엉킵니다");
}

/* =========================================================================
 * [3] 숨기는 곳은 한 곳 · 칸(td)을 만들지 않는다
 * ========================================================================= */
절("[3] ⭐ 탭이 줄을 ★직접★ 숨기지 않는다 · 칸을 만들지 않는다");
{
  ok("탭 모듈이 tr.style.display 를 건드리지 않는다",
    !/style\.display\s*=/.test(JS_CODE),
    "검색 모듈과 서로 덮습니다 — 조건 하나가 조용히 사라집니다");
  ok("탭 모듈이 줄을 classList 로 숨기지 않는다",
    !/classList\.(add|remove|toggle)/.test(JS_CODE),
    "renderSymbols() 가 tr.className 을 통째로 덮습니다 — 1초 뒤 되살아납니다");
  ok("탭 모듈이 tr.className 에 직접 대입하지 않는다",
    !/\btr\.className\s*=/.test(JS_CODE));
  ok("⭐ 탭 모듈이 ★칸(td)을 만들지 않는다★",
    !/createElement\(\s*["']td["']\s*\)/i.test(JS_CODE),
    "renderSymbols() 가 칸을 번호로 찾아 씁니다 — 종목명 칸에 현재가가 찍힙니다");
  ok("탭 모듈이 줄을 ★지우지★ 않는다 (마크업 보존)",
    !/removeChild\s*\(\s*tr/.test(JS_CODE) && !/\btr\.remove\(\)/.test(JS_CODE));
  ok("조건은 검색 모듈에 ★맡긴다★ (setExtraFilter)",
    /setExtraFilter/.test(JS_CODE));
  ok("검색 모듈이 두 조건을 ★한 곳에서★ 합친다",
    /queryPass\s*\(\s*tr\s*\)\s*&&\s*extraPass\s*\(\s*tr\s*\)/.test(SEARCH_CODE),
    "교집합이 아니면 탭과 검색 중 하나가 무시됩니다");
  ok("검색 모듈은 여전히 style.display 로 숨긴다",
    /\.style\.display\s*=/.test(SEARCH_CODE));
  ok("별표를 ★서버로★ 보내지 않는다 (App.Storage 를 안 쓴다)",
    JS_CODE.indexOf("App.Storage") < 0 && /localStorage/.test(JS_CODE),
    "App.Storage.save 는 다섯 모듈이 감싸 서버로 올라가는 통로입니다");
  ok("별 클릭이 ★전파를 막는다★ (안 막으면 종목이 바뀝니다)",
    /stopPropagation/.test(JS_CODE));
  ok("보유를 볼 때 손익을 다시 계산하지 않는다",
    JS_CODE.indexOf("unrealizedPnl") < 0 &&
    JS_CODE.indexOf("realizedPnl") < 0 &&
    JS_CODE.indexOf("pnlPercent") < 0,
    "어느 종목을 들고 있나만 봅니다 — 계산식은 대표 확인 사항입니다");
}

/* =========================================================================
 * [4] ⭐ 실제로 눌러 본다 (jsdom)
 * ========================================================================= */
절("[4] ⭐ 실제로 눌러 본다 + renderSymbols() 를 다시 돌려도 유지된다");
{
  const dom = new JSDOM(
    '<!doctype html><html><body><aside class="page-right"></aside></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;

  /* 분류는 ★진짜 레지스트리★ 를 씁니다 — 단일 출처가 실제로 통하는지 봅니다 */
  win.eval(read(REG_REL));

  /* 숙주가 기대하는 것만 아주 얇게 세웁니다 */
  win.eval(`
    App.AllSymbolFeed = {
      getState: function () { return "open"; },
      get: function () { return { price: 100, changePercent: 1.5 }; }
    };
    window.__active = App.SymbolRegistry.getAll()[0].symbol;
    App.Config = { getActiveSymbol: function () { return window.__active; } };
    window.__nickname = null;
    App.Auth = { getNickname: function () { return window.__nickname; } };
    window.__position = null;
    App.Trading = { getSnapshot: function () { return { position: window.__position }; } };
  `);

  win.eval(read(HOST_REL));
  win.eval(read(SEARCH_REL));
  win.eval(read(JS_REL));
  win.App.UpbitRightColumn.init();
  win.App.SymbolSearch.init();
  win.App.SymbolCategoryTabs.init();

  const 탭 = win.App.SymbolCategoryTabs;
  const 종목들 = win.App.SymbolRegistry.getAll();

  const 줄들 = () =>
    Array.prototype.slice.call(doc.querySelectorAll('#tl-sym-body tr[data-symbol]'));
  const 보이는 = () =>
    줄들().filter((t) => t.style.display !== "none").map((t) => t.getAttribute("data-symbol"));
  const empty = () => doc.getElementById("tl-symsearch-empty");

  function 탭누른다(key) {
    const b = doc.querySelector('.tl-symcat-btn[data-cat="' + key + '"]');
    if (b) b.click();
    return !!b;
  }
  function 쳐본다(v) {
    const input = doc.getElementById("tl-symsearch-input");
    input.value = v;
    input.dispatchEvent(new win.Event("input", { bubbles: true }));
  }

  /* ---- 생김새 ---- */
  const wrap = doc.getElementById("tl-symcat");
  ok("탭 줄이 생긴다", !!wrap);
  ok("탭이 ★5개★ 다 (업비트와 같은 개수)",
    !!wrap && wrap.querySelectorAll(".tl-symcat-btn").length === 5,
    "지금 " + (wrap ? wrap.querySelectorAll(".tl-symcat-btn").length : 0) + "개");
  ok("탭 줄이 ★검색칸 아래 · 표 위★ 다", (() => {
    const card = doc.getElementById("tl-sym-list");
    const search = doc.getElementById("tl-symsearch");
    const table = card && card.querySelector(".tl-sym-table");
    if (!card || !wrap || !table || !search) return false;
    const F = win.Node.DOCUMENT_POSITION_FOLLOWING;
    return (search.compareDocumentPosition(wrap) & F) !== 0 &&
           (wrap.compareDocumentPosition(table) & F) !== 0;
  })(), "업비트는 검색 아래에 분류 탭이 있습니다");
  ok("탭 글자가 [전체][코인][주식][보유][관심] 이다",
    탭.getTabLabels().join(",") === "전체,코인,주식,보유,관심",
    "지금: " + 탭.getTabLabels().join(","));
  ok("처음엔 [전체] 가 골라져 있다", 탭.getCurrent() === "all");
  ok("처음엔 모든 줄이 보인다 (" + 보이는().length + "줄 / 종목 " + 종목들.length + "개)",
    보이는().length === 종목들.length);

  /* ---- 별 ---- */
  const 별들 = () => doc.querySelectorAll("#tl-sym-body .tl-symfav");
  ok("줄마다 별이 하나씩 있다 (" + 별들().length + "개)",
    별들().length === 종목들.length);
  ok("별이 ★인라인 SVG★ 다 (이모지 금지)",
    !!doc.querySelector("#tl-sym-body .tl-symfav svg path"));
  ok("⭐ 별 때문에 칸이 늘지 않았다 (전부 3칸)",
    줄들().every((t) => t.cells.length === 3),
    "칸: " + 줄들().map((t) => t.cells.length).join(",") +
    " — 칸이 늘면 종목명 칸에 현재가가 찍힙니다");
  ok("별이 ★종목명 칸(cells[0]) 안★ 에 있다",
    줄들().every((t) => !!t.cells[0].querySelector(".tl-symfav")));

  /* ---- 탭별 줄 수 ---- */
  const 코인들 = 종목들.filter((s) => 탭.isCoin(s.symbol)).map((s) => s.symbol);
  const 주식들 = 종목들.filter((s) => 탭.isStock(s.symbol)).map((s) => s.symbol);

  탭누른다("coin");
  ok("[코인] -> " + 코인들.length + "줄 — [" + 보이는().join(",") + "]",
    보이는().join(",") === 코인들.join(","));

  탭누른다("stock");
  ok("[주식] -> " + 주식들.length + "줄 — [" + 보이는().join(",") + "]",
    보이는().join(",") === 주식들.join(","));

  /* ⭐⭐ 핵심 — 숙주를 1초 주기처럼 ★다시 돌립니다★ */
  win.App.UpbitRightColumn.renderSymbols();
  win.App.UpbitRightColumn.renderSymbols();
  ok("⭐ renderSymbols() 를 다시 돌려도 [주식] 이 유지된다 — [" + 보이는().join(",") + "]",
    보이는().join(",") === 주식들.join(","),
    "classList 로 숨기면 여기서 전부 되살아납니다(1초 뒤 화면과 같은 상황)");
  ok("숙주가 실제로 className 을 다시 덮었다 (헛돌지 않았다)",
    줄들()[0].className.indexOf("tl-sym-row") === 0,
    "덮지 않았다면 위 검사가 ★가짜로 통과★ 한 것입니다");
  ok("⭐ renderSymbols() 뒤에도 별이 그대로다 (" + 별들().length + "개)",
    별들().length === 종목들.length);
  ok("⭐ renderSymbols() 뒤에도 칸이 3개다",
    줄들().every((t) => t.cells.length === 3),
    "칸: " + 줄들().map((t) => t.cells.length).join(","));

  /* ---- 탭 + 검색 = 교집합 ---- */
  const 주식한글 = 주식들.length
    ? (win.App.SymbolRegistry.getBySymbol(주식들[0]).name || "").slice(0, 2) : "";
  탭누른다("stock");
  쳐본다(주식한글);
  ok('[주식] + "' + 주식한글 + '" -> 1줄 (교집합) — [' + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === 주식들[0]);

  탭누른다("coin");
  ok('[코인] + "' + 주식한글 + '" -> 0줄 (교집합) — [' + 보이는().join(",") + "]",
    보이는().length === 0,
    "탭과 검색이 서로를 덮으면 여기서 줄이 남습니다");
  ok("그때 ★검색 쪽★ 문구가 나온다",
    !!empty() && empty().hidden === false && /찾는 종목이 없습니다/.test(empty().textContent),
    "지금: " + (empty() ? empty().textContent : "(없음)"));

  쳐본다("");
  ok('검색어를 지우면 [코인] 조건만 남는다 — [' + 보이는().join(",") + "]",
    보이는().join(",") === 코인들.join(","));

  /* ---- 관심 ---- */
  탭누른다("fav");
  ok("[관심] 이 비어 있으면 ★빈 화면이 아니라★ 말로 적는다",
    보이는().length === 0 && !!empty() && empty().hidden === false &&
    /관심 종목이 없습니다/.test(empty().textContent) &&
    /별을 눌러/.test(empty().textContent),
    "지금: " + (empty() ? empty().textContent : "(없음)"));

  /* 별을 ★실제로 눌러★ 봅니다 — 그리고 종목이 바뀌면 안 됩니다 */
  탭누른다("all");
  const 대상 = 종목들[종목들.length - 1].symbol;           /* 지금 종목이 아닌 것 */
  const 대상줄 = doc.querySelector('#tl-sym-body tr[data-symbol="' + 대상 + '"]');
  let 줄클릭 = 0;
  대상줄.addEventListener("click", function () { 줄클릭++; });
  const 전종목 = win.__active;

  대상줄.querySelector(".tl-symfav").click();
  ok("⭐ 별을 눌러도 ★줄의 클릭이 안 터진다★ (종목 전환 안 됨)", 줄클릭 === 0,
    "줄 클릭 " + 줄클릭 + "회 — stopPropagation 이 빠졌습니다");
  ok("⭐ 별을 눌러도 지금 종목이 그대로다", win.__active === 전종목);
  ok("별이 켜졌다", 탭.isFav(대상) === true);
  ok("별표가 ★localStorage 에만★ 남는다",
    (win.localStorage.getItem(탭.FAV_KEY) || "").indexOf(대상) >= 0,
    "지금: " + win.localStorage.getItem(탭.FAV_KEY));

  /* 줄 본문을 누르면 ★여전히★ 터져야 합니다 (숙주 동작을 안 막았다) */
  대상줄.cells[1].click();
  ok("줄 본문을 누르면 ★그대로★ 클릭이 터진다 (숙주 동작 보존)", 줄클릭 === 1,
    "줄 클릭 " + 줄클릭 + "회 — 별이 줄 전체를 막아버렸습니다");

  탭누른다("fav");
  ok("[관심] -> 방금 켠 1줄 — [" + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === 대상);

  win.App.UpbitRightColumn.renderSymbols();
  ok("⭐ [관심] 도 renderSymbols() 뒤에 유지된다 — [" + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === 대상);

  /* 다시 누르면 꺼집니다 */
  대상줄.querySelector(".tl-symfav").click();
  ok("별을 다시 누르면 꺼진다", 탭.isFav(대상) === false);
  ok("꺼지면 [관심] 이 다시 0줄 + 안내", 보이는().length === 0 &&
    /관심 종목이 없습니다/.test(empty().textContent));

  /* ---- 보유 ---- */
  탭누른다("hold");
  ok("[보유] 비회원이면 ★로그인 안내★ 를 적는다",
    보이는().length === 0 && /로그인하면 보유 종목이 보입니다/.test(empty().textContent),
    "지금: " + empty().textContent);

  win.eval('window.__nickname = "손님";');
  탭.refilter();
  ok("[보유] 로그인했는데 포지션이 없으면 ★다른 안내★ 를 적는다",
    보이는().length === 0 && /보유 중인 포지션|보유 중인 종목이 없습니다/.test(empty().textContent),
    "지금: " + empty().textContent);

  /* js/symbol-guard.js 가 찍어 둔 도장(position.symbol)만 봅니다 */
  win.eval('window.__position = { symbol: ' + JSON.stringify(대상) + ' };');
  탭.refilter();
  ok("⭐ [보유] -> 도장이 찍힌 ★그 종목 1줄★ — [" + 보이는().join(",") + "]",
    보이는().length === 1 && 보이는()[0] === 대상,
    "position.symbol(js/symbol-guard.js 의 도장)이 단일 출처입니다");
  ok("[보유] 가 renderSymbols() 뒤에도 유지된다", (() => {
    win.App.UpbitRightColumn.renderSymbols();
    return 보이는().length === 1 && 보이는()[0] === 대상;
  })());
}

/* =========================================================================
 * [5] 종목을 파일에 적지 않는다 + 모든 종목이 어느 탭에는 든다
 * ========================================================================= */
절("[5] 종목을 파일에 적지 않는다 (SymbolRegistry 단일 출처)");
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  dom.window.eval(read(REG_REL));
  const 종목들 = dom.window.App.SymbolRegistry.getAll();

  종목들.forEach((s) => {
    ok("모듈에 '" + s.symbol + "' 를 적지 않았다", JS_CODE.indexOf(s.symbol) < 0,
      "종목이 늘면 js/symbol-registry.js 만 고치면 되게");
    ok("모듈에 '" + s.name + "' 를 적지 않았다", JS_CODE.indexOf(s.name) < 0);
  });
  ok("App.SymbolRegistry 에서 분류를 읽는다", /SymbolRegistry/.test(JS_CODE));
  ok("줄을 그때그때 DOM 에서 훑는다 (개수를 박아두지 않는다)",
    /querySelectorAll\(\s*["']tr\[data-symbol\]["']\s*\)/.test(JS_CODE));
  ok("줄이 늘어나면 별을 다시 단다 (MutationObserver)",
    /MutationObserver/.test(JS_CODE));

  /* ⭐ 새 type 이 생겨도 ★어느 탭에도 안 나오는 종목★ 이 없어야 합니다 */
  const dom2 = new JSDOM(
    '<!doctype html><html><body><aside class="page-right"></aside></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const w2 = dom2.window;
  w2.eval(read(REG_REL));
  w2.eval(`
    App.AllSymbolFeed = { getState: function(){return "open";},
                          get: function(){return {price:1,changePercent:0};} };
    App.Config = { getActiveSymbol: function(){ return App.SymbolRegistry.getAll()[0].symbol; } };
  `);
  w2.eval(read(HOST_REL));
  w2.eval(read(SEARCH_REL));
  w2.eval(read(JS_REL));
  const 탭2 = w2.App.SymbolCategoryTabs;
  const 미아 = 종목들
    .filter((s) => !탭2.isCoin(s.symbol) && !탭2.isStock(s.symbol))
    .map((s) => s.symbol);
  ok("⭐ 모든 종목이 [코인] · [주식] 중 한 곳에는 든다 (" + 종목들.length + "개 확인)",
    미아.length === 0,
    "어느 탭에도 안 나오는 종목: " + 미아.join(", ") +
    " — 회원은 그 종목이 사라진 줄 압니다(조용한 고장)");
  ok("[코인] 과 [주식] 이 ★겹치지 않는다★",
    종목들.filter((s) => 탭2.isCoin(s.symbol) && 탭2.isStock(s.symbol)).length === 0);
}

/* =========================================================================
 * [6] ⛔ "지수" 금지
 * ========================================================================= */
절('[6] ⛔ "지수" 라고 쓰지 않는다 (QQQUSDT 는 지수가 아니라 ETF)');
{
  ok("탭 모듈 코드에 '지수' 가 없다", JS_CODE.indexOf("지수") < 0,
    "진짜 나스닥100 지수(29,209)와 QQQ(717)는 41배 다릅니다 — " +
    "'지수' 라고 적으면 회원이 속습니다. js/symbol-registry.js 16~19행");
  ok("새 CSS 에 '지수' 가 없다", CSS_CODE.indexOf("지수") < 0);
  ok("탭 글자에 '지수' 가 없다", (() => {
    const dom = new JSDOM(
      '<!doctype html><html><body><aside class="page-right"></aside></body></html>',
      { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
    const w = dom.window;
    w.eval(read(REG_REL));
    w.eval(`
      App.AllSymbolFeed = { getState: function(){return "open";},
                            get: function(){return {price:1,changePercent:0};} };
      App.Config = { getActiveSymbol: function(){ return App.SymbolRegistry.getAll()[0].symbol; } };
    `);
    w.eval(read(HOST_REL));
    w.eval(read(SEARCH_REL));
    w.eval(read(JS_REL));
    return w.App.SymbolCategoryTabs.getTabLabels().join("").indexOf("지수") < 0;
  })());
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
  ok("탭 버튼 글씨가 17px 이상이다",
    /\.tl-symcat-btn\{[^}]*font-size\s*:\s*(1[7-9]|[2-9]\d)px/.test(
      CSS_CODE.replace(/\s*\n\s*/g, "")),
    "탭은 좁다고 글씨를 줄이기 쉬운 자리입니다 — 좁으면 옆으로 밉니다");
  ok("탭이 모자랄 때 ★글씨를 줄이지 않고★ 옆으로 민다",
    /overflow-x\s*:\s*auto/.test(CSS_CODE) && /flex\s*:\s*1\s+0\s+auto/.test(CSS_CODE),
    "flex-shrink 가 0 이어야 글자가 눌리지 않습니다");

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
  ok("상승/하락 색을 탭·별에 쓰지 않는다 (빨강은 손익 표시에만)",
    CSS_CODE.toUpperCase().indexOf("#F0506E") < 0 &&
    CSS_CODE.toUpperCase().indexOf("#26C281") < 0);

  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("새 모듈이 만드는 글자에 이모지가 없다", !EMOJI.test(JS_CODE),
    "별은 인라인 SVG 로 그립니다");
  ok("새 CSS 에 이모지가 없다", !EMOJI.test(CSS_CODE));
  ok("CSS 에 content: 로 글자 아이콘을 넣지 않았다",
    !/content\s*:\s*["'][^"']/.test(CSS_CODE));

  /* 별이 표를 밀어내지 않게 — 360 에서 실제로 재고 고른 값입니다 */
  const 납작 = CSS_CODE.replace(/\s*\n\s*/g, "");
  const 왼여백 = 납작.match(/td\.tl-sym-name\{[^}]*padding-left\s*:\s*([\d.]+)px/);
  ok("별 자리(padding-left)가 38px 미만이다 — 360 에서 표가 카드를 밀지 않게",
    !!왼여백 && Number(왼여백[1]) < 38,
    "실측: 38px 에서 딱 붙고 44px 이면 6px 넘칩니다. 지금 " +
    (왼여백 ? 왼여백[1] : "(못 찾음)") + "px");
  ok("종목명 칸의 display 를 바꾸지 않는다 (table-cell 유지)",
    !/td\.tl-sym-name\{[^}]*display\s*:/.test(납작),
    "display 를 바꾸면 표 열 정렬이 깨집니다");
}

/* =========================================================================
 * [8] 등록 상태
 * ========================================================================= */
절("[8] index.html · main.js 등록 + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다",
    HTML.indexOf('<link rel="stylesheet" href="css/symbol-category-tabs.css">') >= 0);
  ok("index.html 이 새 모듈을 부른다",
    HTML.indexOf('<script src="js/symbol-category-tabs.js"></script>') >= 0);
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf("css/symbol-category-tabs.css") > HTML.indexOf('href="style.css"'),
    "앞에 있으면 덮지 못합니다");
  ok("새 모듈이 ★검색 모듈 뒤★ 에 있다",
    HTML.indexOf('<script src="js/symbol-category-tabs.js"></script>') >
    HTML.indexOf('<script src="js/symbol-search.js"></script>'),
    "앞에 두면 조건을 맡길 상대가 아직 없습니다");
  /* 주석에 경로를 또 적으면 '등장 횟수' 를 세는 봉인들이 오판합니다 */
  ["css/symbol-category-tabs.css", "js/symbol-category-tabs.js"].forEach((p) => {
    const n = HTML.split(p).length - 1;
    ok("index.html 에 " + p + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1,
      "주석에 경로를 또 적지 마세요 — 등장 횟수를 세는 봉인이 두 벌로 봅니다");
  });

  const 목록 = MAIN.slice(MAIN.indexOf("const modules = ["),
                         MAIN.indexOf("modules.forEach"));
  ok('main.js 에 "SymbolCategoryTabs" 가 있다', 목록.indexOf('"SymbolCategoryTabs"') > 0);
  ok('"SymbolCategoryTabs" 가 "SymbolSearch" ★뒤★ 에 있다',
    목록.indexOf('"SymbolCategoryTabs"') > 목록.indexOf('"SymbolSearch"'),
    "앞에 두면 조건을 맡길 상대가 아직 없습니다");

  [CSS_REL, JS_REL].forEach((rel) => {
    const 추적 = execFileSync("git", ["ls-files", "--", rel], { cwd: REPO })
      .toString().trim();
    ok(rel + " 가 git 에 올라가 있다", 추적 === rel,
      "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
  });

  const ORDER = read("tests/_order.txt");
  ok("_order.txt 에 이 파일이 등록돼 있다",
    ORDER.indexOf("tests/symbol-category-tabs-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " symbol-category-tabs-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
