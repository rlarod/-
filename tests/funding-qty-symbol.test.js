/* tests/funding-qty-symbol.test.js
 * =========================================================================
 * 펀딩 정산 내역 "수량" 칸의 단위 — 재발 방지 (2026-08-27)
 * =========================================================================
 * 무엇이 터져 있었나
 *
 *   js/ui.js:599 가 App.Utils.formatQty(f.positionSize) 를 부릅니다.
 *   종목을 안 넘기면 "지금 활성 종목" 으로 떨어져서(js/utils.js activeSymbolOf),
 *   삼성전자를 보는 동안 옛 비트코인 펀딩 행이 "0.050000 삼성전자" 가 됩니다.
 *   숫자도 단위도 그럴듯해서 회원은 고장인 줄 모릅니다(조용한 고장).
 *
 *   js/ui.js 는 수정 금지 파일이라 js/funding-qty-symbol.js 가 그린 뒤에
 *   덮어씁니다.
 *
 * 이 파일이 지키는 것
 *
 *   (1) 도장이 있는 행은 ★그 행의 종목★ 단위로 보인다 (활성 종목이 아니라)
 *   (2) 도장이 없는 옛 행은 단위를 비운다 — BTC 로도 활성 종목으로도 안 채운다
 *       (펀딩은 서버에 원본이 없어 채우면 추측입니다)
 *   (3) 수량 숫자 자체는 안 지운다 (기록된 사실)
 *   (4) ★ui.js 가 다시 그려도 유지된다★ — MutationObserver
 *       js/ui.js:583-585 의 dirty check 때문에 "행 수가 바뀔 때만" 다시
 *       그립니다. 이벤트로는 그 순간을 알 수 없습니다.
 *   (5) 우리 덮어쓰기가 관찰자를 다시 안 부른다 (무한 루프 없음)
 *   (6) 다른 칸(시각·방향·마크가격·펀딩비율·정산금액)은 안 건드린다
 *   (7) index.html 에 한 줄로 붙어 있고 symbol-sync-bridge.js 뒤다
 *   (8) 짝(js/trade-history.js)이 여전히 종목을 넘긴다
 *
 * 2026-08-28 기록팀 보강 — 빠져 있던 다섯 가지
 *
 *   (9)  네 종목을 전부 돌려가며 같은 값이 나오는지 본다
 *        원래는 활성 종목이 삼성전자일 때 한 번만 쟀습니다. 이 버그의 본질이
 *        "보고 있는 종목에 따라 옛 기록이 달라진다" 라서, 한 종목만 재면
 *        종목이 늘 때 조용히 되살아납니다(실제로 2026-08-27 에 1개 -> 4개로 늘었습니다).
 *   (10) 종목을 바꾼 뒤 누가 다시 그려도 되살아나지 않는다 (symbol:change)
 *   (11) 50줄 넘게 쌓여도 화면 행과 기록의 짝이 안 어긋난다
 *        ⚠ 여기서 알게 된 것 — 단위 글자로는 누수를 못 가립니다.
 *          BTCUSDT 만 "BTC" 고 나스닥·삼성전자·SK하이닉스는 셋 다 "주" 입니다.
 *          그 셋 사이의 누수는 "주" 를 세는 방식으로 절대 안 잡힙니다.
 *          그래서 행마다 기대값을 만들어 하나씩 맞춥니다.
 *   (12) 도장 없는 행의 숫자 자릿수가 나머지 줄과 같다 (0.050000 vs 0.05)
 *   (13) 수정 금지 파일 md5 — 문자열이 아니라 해시로 봅니다
 *        (주석에 js/ui.js 라고 적혀 있어서 문자열 검사는 오탐이 납니다)
 *
 * 네트워크는 한 번도 안 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* ------------------------------------------------------------------
 * js/ui.js 가 그리는 것과 같은 모양의 표를 만듭니다.
 * ★ 수량 칸은 js/ui.js:599 를 그대로 옮겼습니다 — formatQty(f.positionSize)
 *   (종목을 안 넘깁니다. 이게 지금 화면에서 벌어지는 일입니다)
 * ------------------------------------------------------------------ */
function 그린다(win, list) {
  const App = win.App;
  const body = win.document.getElementById("funding-history-body");
  if (!list.length) {
    body.innerHTML = '<tr class="empty"><td colspan="6">펀딩 정산 내역이 없습니다.</td></tr>';
    return;
  }
  body.innerHTML = list.slice(0, 50).map((f) =>
    "<tr>" +
    "<td>" + new Date(f.fundingTime).toISOString() + "</td>" +
    '<td><span class="badge ' + f.positionSide + '">' + (f.positionSide === "long" ? "LONG" : "SHORT") + "</span></td>" +
    "<td>" + App.Utils.formatQty(f.positionSize) + "</td>" +
    "<td>" + App.Utils.formatCurrencyPlain(f.markPrice) + "</td>" +
    "<td>" + (f.fundingRate * 100).toFixed(4) + "%</td>" +
    '<td class="pnl-negative">' + App.Utils.formatCurrencySigned(f.fundingFee) + "</td>" +
    "</tr>"
  ).join("");
}

const HTML =
  "<!doctype html><html><body><table><tbody id='funding-history-body'>" +
  "<tr class='empty'><td colspan='6'>펀딩 정산 내역이 없습니다.</td></tr>" +
  "</tbody></table></body></html>";

function boot(active) {
  const dom = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;
  win.eval(
    "window.App = window.App || {};" +
    "App.Bus = (function(){ var L={}; return {" +
    " on:function(e,f){(L[e]=L[e]||[]).push(f);return f;}," +
    " emit:function(e,p){(L[e]||[]).slice().forEach(function(f){try{f(p);}catch(x){}});}" +
    "}; })();"
  );
  ["js/config.js", "js/storage.js", "js/symbol-registry.js", "js/utils.js"].forEach((f) => win.eval(read(f)));
  /* 활성 종목을 못 박습니다 — "활성 종목으로 떨어지는" 옛 동작을 재현하려면 필요합니다 */
  win.eval("App.Config.getActiveSymbol = function(){ return " + JSON.stringify(active) + "; };");
  win.App.__list = [];
  win.eval("App.Trading = { getSnapshot: function(){ return { fundingHistory: App.__list }; } };");
  win.eval(read("js/funding-qty-symbol.js"));
  /* jsdom 은 생성 직후 readyState 가 아직 loading 이라 자가 시작이 DOMContentLoaded 로 밀립니다.
     테스트는 기다리지 않고 바로 재므로 여기서 한 번 붙여 둡니다(붙음 여부는 안에서 한 번만). */
  win.App.FundingQtySymbol.init();
  return { dom, win, App: win.App };
}

function 셀(win, i, col) {
  const rows = win.document.getElementById("funding-history-body").children;
  if (!rows[i] || !rows[i].children[col]) return null;
  return rows[i].children[col].textContent;
}
const 수량셀 = (win, i) => 셀(win, i, 2);

const 행 = (o) => Object.assign({
  fundingTime: 1735689600000, fundingRate: 0.0001, positionSide: "long",
  positionSize: 0.05, markPrice: 78700, fundingFee: -0.39, timestamp: 1735689600000,
}, o);

const 잠깐 = () => new Promise((r) => setTimeout(r, 30));

/* ===================================================================== */
async function main() {
  console.log("\n펀딩 정산 내역 수량 단위 — js/ui.js:599 우회");

  /* ------------------------------------------------------------------- */
  section("[0] 전제 — 지금 화면이 실제로 틀린가");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    ok("ui.js 방식 그대로 그리면 활성 종목 단위가 붙는다(= 이게 버그)",
      /주$/.test(수량셀(win, 0)), 수량셀(win, 0));
    ok("js/ui.js 는 여전히 formatQty 에 종목을 안 넘긴다(우회가 계속 필요)",
      /App\.Utils\.formatQty\(f\.positionSize\)/.test(read("js/ui.js")));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[1] 도장이 있는 행은 그 행의 종목으로 보인다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [행({ symbol: "BTCUSDT" }), 행({ symbol: "QQQUSDT", positionSize: 3 })];
    그린다(win, App.__list);
    App.FundingQtySymbol.repaintForTest();
    ok("비트코인 행 → BTC", 수량셀(win, 0) === "0.050000 BTC", 수량셀(win, 0));
    ok("나스닥 행 → 나스닥 단위", 수량셀(win, 1) === App.Utils.formatQty(3, "QQQUSDT"), 수량셀(win, 1));
    /* ⚠ 나스닥·삼성전자·SK하이닉스는 단위 이름이 셋 다 "주" 입니다(js/symbol-registry.js).
       그래서 1행은 "주" 로 끝나는 게 정답이고, 새는지는 비트코인 행에서만 가립니다. */
    ok("활성 종목(삼성전자=주)이 비트코인 행에 안 새어 든다", !/주$/.test(수량셀(win, 0)), 수량셀(win, 0));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[2] 도장이 없는 옛 행 — 추측하지 않는다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [행({})]; // symbol 없음
    그린다(win, App.__list);
    App.FundingQtySymbol.repaintForTest();
    const c = 수량셀(win, 0);
    ok("활성 종목 단위를 안 붙인다", !/주$/.test(c), c);
    ok("BTC 로도 안 채운다(펀딩은 서버 원본이 없음)", !/BTC/.test(c), c);
    ok("수량 숫자는 지우지 않는다", c.indexOf("0.050000") === 0, c);
    ok("단위 자리가 비어 있다", c.trim() === "0.050000", JSON.stringify(c));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[3] ★ui.js 가 다시 그려도 유지된다 (dirty check 대응)");
  {
    const { win, App } = boot("SKHYNIXUSDT");
    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    App.FundingQtySymbol.init();          // 관찰 시작
    await 잠깐();
    ok("붙자마자 한 번 고친다", 수량셀(win, 0) === "0.050000 BTC", 수량셀(win, 0));

    /* 새 펀딩이 하나 더 쌓여 ui.js 가 통째로 다시 그리는 상황 */
    App.__list = [행({ symbol: "BTCUSDT", positionSize: 0.07 }), 행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    ok("다시 그린 직후는 잠깐 틀리다(ui.js 가 방금 쓴 값)",
      !/BTC/.test(수량셀(win, 0)), 수량셀(win, 0));
    await 잠깐();
    ok("관찰자가 곧바로 되덮는다 0행", 수량셀(win, 0) === "0.070000 BTC", 수량셀(win, 0));
    ok("관찰자가 되덮는다 1행", 수량셀(win, 1) === "0.050000 BTC", 수량셀(win, 1));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[4] 무한 루프가 없다 — 우리 글자 수정이 관찰자를 다시 안 부른다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    App.FundingQtySymbol.init();
    await 잠깐();
    const n1 = App.FundingQtySymbol.countsForTest().repaints;
    await 잠깐();
    const n2 = App.FundingQtySymbol.countsForTest().repaints;
    ok("가만히 두면 다시 안 돈다 (" + n1 + " → " + n2 + ")", n1 === n2);
    ok("덮어쓴 횟수가 행 수를 넘지 않는다", App.FundingQtySymbol.countsForTest().rewritten <= 2,
      String(App.FundingQtySymbol.countsForTest().rewritten));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[5] 다른 칸은 안 건드린다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    const 전 = [0, 1, 3, 4, 5].map((c) => 셀(win, 0, c));
    App.FundingQtySymbol.repaintForTest();
    const 후 = [0, 1, 3, 4, 5].map((c) => 셀(win, 0, c));
    ok("시각·방향·마크가격·펀딩비율·정산금액 그대로", JSON.stringify(전) === JSON.stringify(후),
      JSON.stringify(전) + " -> " + JSON.stringify(후));
    ok("수량 칸 위치가 3번째다(칸 순서가 바뀌면 여기서 잡힙니다)", App.FundingQtySymbol.QTY_COL === 2);
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[6] 빈 표·짝 없는 행에서 안 터진다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    App.__list = [];
    그린다(win, App.__list);
    let 터짐 = false;
    try { App.FundingQtySymbol.repaintForTest(); } catch (e) { 터짐 = true; }
    ok("'내역이 없습니다' 줄에서 안 터진다", !터짐);
    ok("그 줄을 안 건드린다", /없습니다/.test(셀(win, 0, 0)), 셀(win, 0, 0));

    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    App.__list = [];                       // 화면보다 기록이 짧은 경우
    터짐 = false;
    try { App.FundingQtySymbol.repaintForTest(); } catch (e) { 터짐 = true; }
    ok("짝을 못 찾아도 안 터지고 손대지 않는다", !터짐 && /주$/.test(수량셀(win, 0)), 수량셀(win, 0));
    win.close();
  }

  /* ------------------------------------------------------------------- */
  section("[7] 붙어 있고, 되돌릴 수 있다");
  {
    const html = read("index.html");
    ok("index.html 에 한 줄로 들어 있다", /<script src="js\/funding-qty-symbol\.js"><\/script>/.test(html));
    const i = html.indexOf("js/symbol-sync-bridge.js");
    const j = html.indexOf("js/funding-qty-symbol.js");
    ok("도장(symbol-sync-bridge.js) 뒤에 있다", i > 0 && j > i, i + " / " + j);
    const src = read("js/funding-qty-symbol.js");
    ok("subtree 관찰을 켜지 않는다(무한 루프 방지)", !/subtree\s*:\s*true/.test(src));
  }

  /* ------------------------------------------------------------------- */
  section("[8] 짝 — 거래내역은 이미 종목을 넘긴다(같이 안 깨지게)");
  {
    const th = read("js/trade-history.js");
    ok("js/trade-history.js 가 formatQty 에 종목을 넘긴다",
      /App\.Utils\.formatQty\(t\.quantity,\s*rowSymbol\(t\)\)/.test(th));
  }

  /* -------------------------------------------------------------------
   * [9] 2026-08-28 기록팀 보강 — 활성 종목을 바꿔가며 눌러 본다
   * -------------------------------------------------------------------
   * [1] 은 활성 종목이 삼성전자일 때 한 번만 봤습니다. 그런데 이 버그의
   * 본질은 "보고 있는 종목에 따라 옛 기록의 단위가 달라진다" 입니다.
   * 그래서 네 종목을 전부 돌려가며 ★같은 값이 나오는지★ 봅니다.
   * 한 종목에서만 재고 통과시키면, 종목이 늘 때 조용히 되살아납니다.
   *
   * ⚠ 2026-08-27 에 종목이 1개 -> 4개로 늘었습니다(나스닥·삼성전자·SK하이닉스).
   *   그때 안 걸린 이유가 "한 종목에서만 쟀기" 때문입니다.
   * ------------------------------------------------------------------- */
  section("[9] 어느 종목을 보고 있어도 같은 값이다 (2026-08-28 보강)");
  {
    const 종목들 = ["BTCUSDT", "QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"];
    const 결과 = [];
    for (const 활성 of 종목들) {
      const { win, App } = boot(활성);
      App.__list = [행({ symbol: "BTCUSDT" }), 행({ symbol: "QQQUSDT", positionSize: 3 })];
      그린다(win, App.__list);
      App.FundingQtySymbol.repaintForTest();
      결과.push({ 활성, 0: 수량셀(win, 0), 1: 수량셀(win, 1) });
      win.close();
    }
    const 첫 = 결과[0];
    ok("네 종목 전부에서 비트코인 행이 똑같이 보인다",
      결과.every((r) => r[0] === 첫[0]),
      JSON.stringify(결과.map((r) => r.활성 + "=" + r[0])));
    ok("네 종목 전부에서 나스닥 행이 똑같이 보인다",
      결과.every((r) => r[1] === 첫[1]),
      JSON.stringify(결과.map((r) => r.활성 + "=" + r[1])));
    ok("그 값이 활성 종목이 아니라 행의 종목이다 (0행 = BTC)",
      첫[0] === "0.050000 BTC", 첫[0]);
  }

  /* -------------------------------------------------------------------
   * [10] 종목을 바꾼 뒤 누가 다시 그려도 되살아나지 않는다
   * -------------------------------------------------------------------
   * js/ui.js 는 행 수가 그대로면 다시 안 그립니다(dirty check). 그래서
   * 평소에는 우리 값이 그냥 남습니다. 문제는 ★다른 모듈이 다시 그렸을 때★
   * 입니다. 그때 활성 종목이 바뀐 뒤라면 옛 버그가 그대로 돌아옵니다.
   *
   * ⚠ 2026-08-28 돌연변이 실측 — 정직하게 적습니다.
   *   js/funding-qty-symbol.js 의 symbol:change 구독을 통째로 지워도
   *   이 검사는 40/0 으로 그대로 통과했습니다. MutationObserver 가 먼저
   *   잡아채기 때문입니다(표를 다시 그리면 tbody 의 자식이 갈립니다).
   *   즉 symbol:change 구독은 ★이중 방어★ 이고, 이 검사가 지키는 것은
   *   "종목을 바꾼 뒤 다시 그려져도 값이 안 되살아난다" 라는 결과입니다.
   *   구독 자체를 봉인하려는 것이 아닙니다 — 봉인하는 척하지 않습니다.
   *   (구독이 남아 있는지는 아래에서 소스로 따로 적어만 둡니다)
   * ------------------------------------------------------------------- */
  section("[10] 종목을 바꾼 뒤 다시 그려져도 되살아나지 않는다");
  {
    const { win, App } = boot("BTCUSDT");
    App.__list = [행({ symbol: "BTCUSDT" })];
    그린다(win, App.__list);
    App.FundingQtySymbol.repaintForTest();
    ok("처음엔 BTC 로 보인다", 수량셀(win, 0) === "0.050000 BTC", 수량셀(win, 0));

    /* 회원이 삼성전자로 바꿨습니다 */
    win.eval("App.Config.getActiveSymbol = function(){ return \"SAMSUNGUSDT\"; };");
    /* 그리고 누군가 표를 다시 그렸습니다 (ui.js 와 같은 방식 = 종목 안 넘김) */
    그린다(win, App.__list);
    ok("다시 그린 직후엔 활성 종목(주) 단위가 붙어 있다",
      /주$/.test(수량셀(win, 0)), 수량셀(win, 0));

    App.Bus.emit("symbol:change", { symbol: "SAMSUNGUSDT" });
    await 잠깐();
    ok("한 박자 뒤에는 다시 BTC 로 돌아와 있다",
      수량셀(win, 0) === "0.050000 BTC", 수량셀(win, 0));
    win.close();

    /* 이중 방어가 아직 있는지 — 사실만 적어 둡니다.
       위 검사는 이것이 없어도 통과합니다(관찰자가 먼저 잡습니다). */
    const src = read("js/funding-qty-symbol.js");
    ok("(참고) symbol:change 구독이 아직 있다 — 없어도 위는 통과합니다",
      /App\.Bus\.on\("symbol:change"/.test(src));
    ok("(참고) trading:persisted 구독이 아직 있다 — 새 정산이 들어올 때 보험",
      /App\.Bus\.on\("trading:persisted"/.test(src));
  }

  /* -------------------------------------------------------------------
   * [11] 표가 길 때 행과 기록의 짝이 안 어긋난다
   * -------------------------------------------------------------------
   * js/ui.js:591 은 list.slice(0, 50) 을 순서 그대로 그립니다. 우리는
   * 화면 i 번째 = fundingHistory[i] 라고 보고 덮어씁니다. 만약 누가
   * slice(-50) 처럼 뒤에서 자르게 바꾸면 ★엉뚱한 행에 엉뚱한 단위★가
   * 붙습니다. 숫자는 그대로라 아무도 못 알아챕니다(조용한 고장).
   * 그래서 51번째 이후가 잘리는 상황에서 앞뒤를 직접 확인합니다.
   * ------------------------------------------------------------------- */
  section("[11] 50줄 넘게 쌓여도 행과 기록의 짝이 안 어긋난다");
  {
    const { win, App } = boot("SAMSUNGUSDT");
    const 긴목록 = [];
    for (let i = 0; i < 60; i++) {
      긴목록.push(행({ symbol: i % 2 === 0 ? "BTCUSDT" : "QQQUSDT", positionSize: 1 + i }));
    }
    App.__list = 긴목록;
    그린다(win, App.__list);
    App.FundingQtySymbol.repaintForTest();

    const 행수 = win.document.getElementById("funding-history-body").children.length;
    ok("화면에는 50줄만 그린다", 행수 === 50, String(행수));
    ok("0행은 목록 0번(비트코인, 1개)", 수량셀(win, 0) === App.Utils.formatQty(1, "BTCUSDT"),
      수량셀(win, 0));
    ok("1행은 목록 1번(나스닥, 2개)", 수량셀(win, 1) === App.Utils.formatQty(2, "QQQUSDT"),
      수량셀(win, 1));
    ok("49행은 목록 49번(나스닥, 50개)", 수량셀(win, 49) === App.Utils.formatQty(50, "QQQUSDT"),
      수량셀(win, 49));
    /* ⚠ 2026-08-28 실측 — 단위 글자로는 누수를 못 가립니다.
         BTCUSDT "BTC" / QQQUSDT "주" / SAMSUNGUSDT "주" / SKHYNIXUSDT "주"
       나스닥·삼성전자·SK하이닉스 셋이 단위를 나눠 씁니다. 그래서 그 셋
       사이의 누수는 "주" 를 세는 것으로 절대 안 잡힙니다.
       50줄 전부를 ★그 행의 종목으로 만든 기대값★ 과 하나씩 맞춥니다. */
    const 어긋남 = [];
    for (let i = 0; i < 50; i++) {
      const 기대 = App.Utils.formatQty(긴목록[i].positionSize, 긴목록[i].symbol);
      if (수량셀(win, i) !== 기대) 어긋남.push(i + ": " + 수량셀(win, i) + " != " + 기대);
    }
    ok("50줄 전부가 그 행의 종목으로 만든 값과 같다", 어긋남.length === 0,
      어긋남.slice(0, 5).join(" / "));
    win.close();
  }

  /* -------------------------------------------------------------------
   * [12] 도장 없는 행의 숫자 자릿수가 formatQty 와 같다
   * -------------------------------------------------------------------
   * 단위만 비우고 숫자는 남깁니다. 그 숫자를 따로 만들기 때문에
   * 자릿수가 어긋나면 같은 표 안에서 "0.050000" 과 "0.05" 가 섞입니다.
   * (js/utils.js 의 QTY_DECIMALS 는 네 종목 모두 6 고정입니다)
   * ------------------------------------------------------------------- */
  section("[12] 도장 없는 행의 숫자 자릿수가 나머지 줄과 같다");
  {
    const { win, App } = boot("BTCUSDT");
    const 도장있음 = App.Utils.formatQty(0.05, "BTCUSDT");     /* "0.050000 BTC" */
    const 숫자부 = 도장있음.split(" ")[0];
    const 도장없음 = App.FundingQtySymbol.cellTextForTest(행({}));
    ok("자릿수가 같다 (" + 숫자부 + " / " + 도장없음 + ")", 도장없음.trim() === 숫자부,
      JSON.stringify({ 도장있음: 숫자부, 도장없음 }));
    ok("js/utils.js 의 자릿수는 6 이다", App.Utils.QTY_DECIMALS === 6,
      String(App.Utils.QTY_DECIMALS));
    win.close();
  }

  /* -------------------------------------------------------------------
   * [13] 수정 금지 파일 — 이 우회를 만들면서 건드리지 않았다
   * -------------------------------------------------------------------
   * 문자열로 파일명을 찾으면 주석에 적힌 이름 때문에 오탐이 납니다.
   * 그래서 md5 로 봅니다.
   * ------------------------------------------------------------------- */
  section("[13] 수정 금지 파일을 건드리지 않았다");
  {
    const crypto = require("crypto");
    const 기준 = {
      "ui.js": "333fc427e75b47b306699c92aa4e7b50",
      "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
      "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8"
    };
    for (const f of Object.keys(기준)) {
      let h = null;
      try {
        h = crypto.createHash("md5")
          .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
      } catch (e) { h = "읽기실패"; }
      ok("js/" + f + " 를 건드리지 않았다", h === 기준[f], h);
    }
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail === 0) console.log("전체 통과 ✅");
  else { console.log("실패 있음 ❌"); process.exit(1); }
  process.exit(0);
}

main();
