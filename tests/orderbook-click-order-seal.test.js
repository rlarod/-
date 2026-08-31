/* =========================================================================
 * tests/orderbook-click-order-seal.test.js
 * 호가 클릭 → 주문가 자동 입력 봉인 — js/orderbook-click-order.js (2026-08-27)
 * =========================================================================
 *
 * 왜 만들었나
 *   61줄짜리 작은 파일인데 **돈이 지나가는 길** 입니다.
 *   회원이 호가창의 한 줄을 누르면 그 값이 지정가 주문 입력칸(#limit-price-input)에
 *   그대로 들어가고, 탭이 지정가로 바뀝니다. 회원은 그 뒤에 수량만 넣고 주문을
 *   누릅니다. 즉 **여기서 잘못된 숫자가 들어가면 회원은 그걸 모르고 주문합니다.**
 *   화면도 안 깨지고 오류도 안 납니다 — CLAUDE.md 가 P1 로 규정한 "조용한 고장" 입니다.
 *   그런데 지키는 테스트가 0건이었습니다.
 *
 * ── 이 파일이 못 박는 것 중 가장 중요한 하나 ────────────────────────────
 *
 *   ⭐ 가격은 반드시 .ob-price 의 textContent 에서 읽는다. dataset.price 가 아니다.
 *
 *   두 값이 같아 보이지만 **종목을 바꾼 직후에 완전히 달라집니다.**
 *
 *     js/orderbook.js:173             rowEl.dataset.price = item.price;  ← 남습니다
 *     js/symbol-stream-switch.js:339  .ob-price 의 textContent 만 "" 로 비웁니다
 *
 *   종목을 비트코인 → 나스닥으로 바꾸면 호가 10줄의 글자는 비워지지만
 *   dataset.price 에는 **비트코인 가격이 그대로 남아 있습니다.**
 *   지금은 textContent 를 읽으므로 parseFloat("") → NaN → null → 아무것도
 *   안 채우고 조용히 끝납니다(올바른 동작).
 *   누가 "dataset.price 가 더 정확하다"며 바꾸면, 나스닥 호가를 눌렀는데
 *   비트코인 가격이 주문칸에 박힙니다. 회원은 그걸 그대로 주문합니다.
 *
 *   이 테스트는 그 상황을 실제로 만들어서(글자만 비우고 dataset 은 남긴 행)
 *   입력칸이 채워지지 않는 것을 확인합니다.
 *
 * ── 나머지 ──────────────────────────────────────────────────────────────
 *   · 이 모듈은 주문을 넣지 않는다 (입력칸만 채운다)
 *   · js/orderbook.js 의 기존 클릭(#tp-input 채우기)을 건드리지 않는다
 *   · 지정가 탭 전환은 ui.js 가 만든 버튼을 실제로 눌러서 시킨다 (새 로직 없음)
 *   · 마크업이 없어도 터지지 않는다
 *   · 수정 금지 파일 12개를 한 글자도 안 건드렸다
 *
 * 네트워크에 붙지 않습니다(fetch·WebSocket 을 던지게 막아두고, 불리면 실패합니다).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  ✓ " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(t) { console.log("\n" + t); }

/* 주석에 dataset.price·주문 같은 말이 설명으로 적혀 있어 문자열만 찾으면
   오탐이 납니다. 실제로 도는 코드만 남깁니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const REL = "js/orderbook-click-order.js";
const SRC = read(REL);
const CODE = 주석제거(SRC);

/* =========================================================================
 * [1] 파일이 있고 모양이 그대로다
 * ========================================================================= */
section("[1] 파일 구조");

ok("js/orderbook-click-order.js 가 있다", fs.existsSync(path.join(REPO, REL)));
ok("index.html 이 이 파일을 불러온다", read("index.html").indexOf('src="' + REL + '"') >= 0,
  "불러오지 않으면 호가 클릭이 조용히 안 먹습니다");
ok("index.html 에서 js/orderbook.js 보다 뒤에 있다",
  read("index.html").indexOf('src="js/orderbook-click-order.js"') >
  read("index.html").indexOf('src="js/orderbook.js"'),
  "행을 만드는 쪽이 먼저여야 합니다");
ok("전역을 더럽히지 않는다 — App.OrderbookClickOrder 하나만 만든다",
  /App\.OrderbookClickOrder\s*=\s*\(function/.test(CODE));
ok('"use strict" 로 돈다', /["']use strict["']/.test(CODE));

/* =========================================================================
 * [2] ⭐ 가격 출처 봉인 — textContent 만. dataset 금지
 * ========================================================================= */
section("[2] ⭐ 가격은 .ob-price 의 글자에서만 읽는다");

ok(".ob-price 를 찾아서 읽는다", /querySelector\(\s*["']\.ob-price["']\s*\)/.test(CODE));
ok("그 요소의 textContent 를 읽는다", /\.textContent/.test(CODE));
ok("dataset 을 읽지 않는다",
  CODE.indexOf("dataset") === -1,
  "dataset.price 는 종목을 바꿔도 안 지워집니다. 옛 종목 가격이 주문칸에 박힙니다");
ok('getAttribute("data-price") 로 우회하지도 않는다',
  !/getAttribute\s*\(\s*["']data-/.test(CODE),
  "dataset 과 같은 값입니다. 이름만 바꿔 우회하는 것도 막습니다");
ok("가격을 스스로 계산하지 않는다 (화면에 보이는 값 그대로)",
  !/App\.Trading/.test(CODE) && !/getCurrentPrice/.test(CODE),
  "회원이 누른 그 줄의 숫자가 그대로 들어가야 합니다");

/* 짝이 되는 쪽 — 여기가 바뀌면 위 봉인의 전제가 무너집니다 */
section("[2-1] 짝 확인 — 종목 전환 시 무엇이 지워지는가");
{
  const SW = 주석제거(read("js/symbol-stream-switch.js"));
  ok("js/symbol-stream-switch.js 가 .ob-price 의 글자를 비운다",
    /\.ob-price/.test(SW) && /textContent\s*=\s*["']{2}/.test(SW),
    "이게 없으면 종목을 바꿔도 옛 가격 글자가 화면에 남습니다");
  ok("그런데 dataset.price 는 지우지 않는다 (그래서 dataset 을 읽으면 안 된다)",
    !/dataset\.price\s*=/.test(SW),
    "만약 여기서 dataset 도 지우도록 바뀌었다면 이 봉인의 설명을 갱신하세요");
  const OB = 주석제거(read("js/orderbook.js"));
  ok("js/orderbook.js 는 여전히 dataset.price 를 쓴다 (값이 남는 자리)",
    /dataset\.price\s*=/.test(OB));
}

/* =========================================================================
 * [3] 주문을 넣지 않는다
 * ========================================================================= */
section("[3] 이 모듈은 주문을 넣지 않는다");

[
  ["openPosition", /openPosition/],
  ["placeLimitOrder", /placeLimitOrder/],
  ["closePosition", /closePosition/],
  ["setLeverage", /setLeverage/],
].forEach(function (쌍) {
  ok("주문 함수 " + 쌍[0] + " 을 부르지 않는다", !쌍[1].test(CODE),
    "누르면 창만 채워져야 합니다. 여기서 주문이 나가면 회원이 모르는 사이 체결됩니다");
});
ok("서버에 붙지 않는다 (fetch/WebSocket/Supabase 없음)",
  !/fetch\s*\(/.test(CODE) && !/WebSocket/.test(CODE) && !/Supabase/.test(CODE));
ok("localStorage 를 쓰지 않는다", !/localStorage/.test(CODE));
ok("#tp-input 을 건드리지 않는다 (그건 js/orderbook.js 담당)",
  CODE.indexOf("tp-input") === -1,
  "두 곳이 같은 칸을 채우면 어느 쪽이 이겼는지 회원이 알 수 없습니다");

/* =========================================================================
 * [4] 실제로 돌려본다 — jsdom
 * ========================================================================= */
section("[4] 실제 동작");

/* ⚠️ 2026-08-27 — jsdom 은 addEventListener 안에서 난 오류를 밖으로 안 던집니다.
   처음에 try/catch 만 썼더니, 일부러 방어 코드(if (!priceEl) return; 등)를
   지운 돌연변이 2종이 "통과 56 / 실패 0" 으로 그냥 지나갔습니다.
   그래서 VirtualConsole 로 jsdomError 를 따로 받아 모읍니다.
   이걸 빼면 "크래시 0" 검사가 전부 가짜가 됩니다. */
function 화면만들기(opts) {
  opts = opts || {};
  const 콘솔오류 = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", function (e) { 콘솔오류.push(String((e && e.message) || e)); });
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      '<div class="ob-asks" id="ob-asks"></div>' +
      '<div class="ob-bids" id="ob-bids"></div>' +
      '<input id="tp-input" value="원래값">' +
      (opts.limitInput === false ? "" : '<input id="limit-price-input" value="">') +
      '<button class="interval-btn' + (opts.limitActive ? " active" : "") +
        '" data-order-type="limit">지정가</button>' +
      '<button class="interval-btn" data-order-type="market">시장가</button>' +
      "</body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/", virtualConsole: vc }
  );
  const win = dom.window;
  win.fetch = function () { throw new Error("이 모듈은 네트워크에 붙으면 안 됩니다(fetch)"); };
  win.WebSocket = function () { throw new Error("이 모듈은 네트워크에 붙으면 안 됩니다(WebSocket)"); };
  win.eval("window.App = window.App || {};");
  win.eval(SRC);

  /* js/orderbook.js 가 만드는 것과 같은 모양의 행을 넣습니다.
     글자와 dataset 을 따로 줄 수 있게 해서, 종목 전환 직후를 재현합니다. */
  function 행추가(컨테이너id, 글자, dataset값, 클래스) {
    const row = win.document.createElement("div");
    row.className = "ob-row " + (클래스 || "ob-ask");
    row.innerHTML =
      '<span class="ob-depth-bar"></span>' +
      '<span class="ob-price"></span>' +
      '<span class="ob-qty">0.500</span>' +
      '<span class="ob-cum">1.00</span>';
    if (글자 !== null) row.querySelector(".ob-price").textContent = 글자;
    if (dataset값 !== null) row.dataset.price = dataset값;
    win.document.getElementById(컨테이너id).appendChild(row);
    return row;
  }

  return { win: win, doc: win.document, 행추가: 행추가, App: win.App, 콘솔오류: 콘솔오류 };
}

function 클릭(win, el) {
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
}

/* 눌러 보고 "터졌는가" 를 돌려줍니다.
   try/catch(밖으로 나온 오류) + jsdomError(처리기 안에서 난 오류) 둘 다 봅니다. */
function 눌러보기(t, el) {
  const 전 = t.콘솔오류.length;
  try {
    클릭(t.win, el);
  } catch (e) {
    return e.message;
  }
  return t.콘솔오류.length > 전 ? t.콘솔오류.slice(전).join(" | ") : null;
}

/* --- 4-1. 정상 클릭 --------------------------------------------------- */
{
  const t = 화면만들기();
  const 행 = t.행추가("ob-asks", "63,022.10", "63022.1");
  let 입력이벤트 = 0;
  let 버블 = false;
  t.doc.getElementById("limit-price-input").addEventListener("input", function (e) {
    입력이벤트++; 버블 = e.bubbles;
  });
  t.App.OrderbookClickOrder.init();
  클릭(t.win, 행.querySelector(".ob-price"));

  ok("매도호가를 누르면 지정가 입력칸에 그 값이 들어간다 (63,022.10 → 63022.1)",
    t.doc.getElementById("limit-price-input").value === "63022.1",
    "실제값: " + JSON.stringify(t.doc.getElementById("limit-price-input").value));
  ok("쉼표는 지우고 숫자만 넣는다",
    t.doc.getElementById("limit-price-input").value.indexOf(",") === -1);
  ok("input 이벤트를 한 번 띄운다", 입력이벤트 === 1, "실제: " + 입력이벤트);
  ok("그 이벤트가 bubbles: true 다 (ui.js 가 상위에서 듣습니다)", 버블 === true);
  ok("#tp-input 값은 그대로다 (이 모듈이 안 건드림)",
    t.doc.getElementById("tp-input").value === "원래값");
  t.win.close();
}

/* --- 4-2. 매수호가도 같다 --------------------------------------------- */
{
  const t = 화면만들기();
  const 행 = t.행추가("ob-bids", "1,234.56", "1234.56", "ob-bid");
  t.App.OrderbookClickOrder.init();
  클릭(t.win, 행);
  ok("매수호가를 눌러도 같은 칸이 채워진다",
    t.doc.getElementById("limit-price-input").value === "1234.56",
    "실제값: " + JSON.stringify(t.doc.getElementById("limit-price-input").value));
  t.win.close();
}

/* --- 4-3. ⭐ 종목 전환 직후 — 이 파일의 핵심 --------------------------- */
section("[5] ⭐ 종목 전환 직후 — 옛 종목 가격이 들어가면 안 된다");
{
  const t = 화면만들기();
  /* 비트코인 호가가 그려진 상태 */
  const 행 = t.행추가("ob-asks", "63,022.10", "63022.1");
  t.App.OrderbookClickOrder.init();

  /* 나스닥으로 전환 — js/symbol-stream-switch.js 가 하는 것과 똑같이
     .ob-price 의 글자만 비웁니다. dataset.price 는 손대지 않습니다. */
  행.querySelector(".ob-price").textContent = "";

  ok("전환 뒤에도 dataset.price 에는 옛 종목 값이 그대로 남아 있다",
    행.dataset.price === "63022.1",
    "이 전제가 깨지면 이 검사의 의미가 없습니다");

  const 터짐 = 눌러보기(t, 행);
  ok("⭐ 빈 줄을 눌러도 지정가 입력칸이 채워지지 않는다",
    t.doc.getElementById("limit-price-input").value === "",
    "실제값: " + JSON.stringify(t.doc.getElementById("limit-price-input").value) +
    " — dataset.price 를 읽도록 바뀌면 63022.1(옛 종목 가격)이 들어갑니다");
  ok("빈 줄을 눌러도 오류가 나지 않는다 (조용히 넘어간다)", 터짐 === null, 터짐);
  t.win.close();
}

/* --- 4-4. 이상한 글자 --------------------------------------------------- */
section("[6] 숫자가 아니면 아무것도 안 한다");
[
  ["빈 문자열", ""],
  ["공백만", "   "],
  ["대시 한 개", "-"],
  ["글자", "로딩중"],
].forEach(function (쌍) {
  const t = 화면만들기();
  const 행 = t.행추가("ob-asks", 쌍[1], "99999");
  t.App.OrderbookClickOrder.init();
  const 터짐 = 눌러보기(t, 행);
  ok(쌍[0] + ' ("' + 쌍[1] + '") 를 눌러도 입력칸이 그대로다',
    t.doc.getElementById("limit-price-input").value === "" && 터짐 === null,
    "값: " + JSON.stringify(t.doc.getElementById("limit-price-input").value) +
    (터짐 ? " / 오류: " + 터짐 : ""));
  t.win.close();
});

/* =========================================================================
 * [7] 지정가 탭 전환은 ui.js 버튼을 눌러서만 한다
 * ========================================================================= */
section("[7] 탭 전환");

ok("ui.js 가 만든 버튼을 찾아서 click() 한다",
  /interval-btn\[data-order-type="limit"\]/.test(CODE) && /\.click\(\)/.test(CODE),
  "새 전환 로직을 만들면 ui.js 와 두 벌이 되어 어긋납니다");
ok("탭 표시(active)를 직접 붙이거나 떼지 않는다",
  !/classList\.(add|remove|toggle)/.test(CODE),
  "표시는 ui.js 가 합니다. 여기서 같이 만지면 두 곳이 싸웁니다");

{
  const t = 화면만들기();
  const 행 = t.행추가("ob-asks", "100", "100");
  let 눌림 = 0;
  t.doc.querySelector('.interval-btn[data-order-type="limit"]')
    .addEventListener("click", function () { 눌림++; });
  t.App.OrderbookClickOrder.init();
  클릭(t.win, 행);
  ok("지정가 버튼이 아직 active 가 아니면 눌러준다", 눌림 === 1, "실제: " + 눌림);
  t.win.close();
}
{
  const t = 화면만들기({ limitActive: true });
  const 행 = t.행추가("ob-asks", "100", "100");
  let 눌림 = 0;
  t.doc.querySelector('.interval-btn[data-order-type="limit"]')
    .addEventListener("click", function () { 눌림++; });
  t.App.OrderbookClickOrder.init();
  클릭(t.win, 행);
  ok("이미 지정가 탭이면 다시 누르지 않는다", 눌림 === 0,
    "실제: " + 눌림 + " — 다시 누르면 ui.js 가 입력칸을 초기화해 방금 넣은 값이 날아갈 수 있습니다");
  ok("이미 지정가 탭이어도 값은 정상적으로 들어간다",
    t.doc.getElementById("limit-price-input").value === "100");
  t.win.close();
}

/* =========================================================================
 * [8] 마크업이 없거나 이상해도 터지지 않는다 (크래시 0)
 * ========================================================================= */
section("[8] 크래시 0");

{
  /* 호가 컨테이너가 아예 없는 페이지 */
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  dom.window.eval("window.App = window.App || {};");
  dom.window.eval(SRC);
  let 터짐 = null;
  try { dom.window.App.OrderbookClickOrder.init(); } catch (e) { 터짐 = e.message; }
  ok("호가 마크업이 없는 페이지에서 init() 해도 안 터진다", 터짐 === null, 터짐);
  dom.window.close();
}
{
  const t = 화면만들기({ limitInput: false });
  const 행 = t.행추가("ob-asks", "100", "100");
  t.App.OrderbookClickOrder.init();
  const 터짐 = 눌러보기(t, 행);
  ok("지정가 입력칸이 없어도 안 터진다", 터짐 === null, 터짐);
  t.win.close();
}
{
  const t = 화면만들기();
  t.App.OrderbookClickOrder.init();
  const 터짐 = 눌러보기(t, t.doc.getElementById("ob-asks"));
  ok("행이 아닌 빈 곳을 눌러도 안 터진다", 터짐 === null, 터짐);
  t.win.close();
}
{
  const t = 화면만들기();
  const row = t.doc.createElement("div");
  row.className = "ob-row";           /* .ob-price 가 없는 행 */
  t.doc.getElementById("ob-asks").appendChild(row);
  t.App.OrderbookClickOrder.init();
  const 터짐 = 눌러보기(t, row);
  ok(".ob-price 가 없는 행을 눌러도 안 터진다", 터짐 === null, 터짐);
  t.win.close();
}
{
  /* init() 을 두 번 부르면 지금은 처리기가 두 벌이 됩니다.
     값 자체는 같아서 피해가 없지만, 나중에 init() 을 여러 번 부르는 코드가
     생기면 여기서 다시 판단하세요. */
  const t = 화면만들기();
  const 행 = t.행추가("ob-asks", "77", "77");
  t.App.OrderbookClickOrder.init();
  t.App.OrderbookClickOrder.init();
  const 터짐 = 눌러보기(t, 행);
  ok("init() 을 두 번 불러도 값이 같고 안 터진다",
    t.doc.getElementById("limit-price-input").value === "77" && 터짐 === null, 터짐);
  t.win.close();
}

/* =========================================================================
 * [9] 수정 금지 파일 12개
 * ========================================================================= */
section("[9] 수정 금지 파일 12개");

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
const md5 = function (f) {
  return crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
};
Object.keys(기준).forEach(function (f) {
  ok("js/" + f + " 를 건드리지 않았다", md5(f) === 기준[f], "지금: " + md5(f));
});

/* =========================================================================
 * [10] 테스트 등록
 * ========================================================================= */
section("[10] 테스트 등록");
{
  const 파일명 = "tests/orderbook-click-order-seal.test.js";
  let order = "";
  try { order = read("tests/_order.txt"); } catch (e) { order = ""; }
  ok("npm test 목록에 이 파일이 있다", order.indexOf(파일명) >= 0,
    "tests/_order.txt 에 한 줄 넣지 않으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach(function (s) { console.log("  - " + s); });
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
