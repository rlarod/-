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

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail === 0) console.log("전체 통과 ✅");
  else { console.log("실패 있음 ❌"); process.exit(1); }
  process.exit(0);
}

main();
