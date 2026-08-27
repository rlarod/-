/* =========================================================================
 * tests/order-sheet-mobile-seal.test.js
 * 폰 주문 시트 봉인 — js/order-sheet-mobile.js (2026-08-27)
 * =========================================================================
 *
 * 왜 만들었나
 *   이 파일은 2026-08-24 에 라이브로 나갔는데 지키는 테스트가 0건이었습니다.
 *   239줄이고 **회원이 폰에서 주문을 넣는 유일한 통로**입니다.
 *   폰에서 주문 패널은 CSS 로 화면에서 빠져 있고(body[data-tl-order-sheet]),
 *   이 모듈이 만든 하단 바를 눌러야만 다시 올라옵니다.
 *   즉 이 모듈이 조용히 어긋나면 **폰 회원은 주문 자체를 못 합니다.**
 *   화면도 안 깨지고 오류도 안 납니다 — CLAUDE.md 가 말하는 "조용한 고장" 입니다.
 *
 * 이 파일이 못 박는 것
 *
 *   1) 이 모듈은 주문을 넣지 않는다
 *      "보이느냐 마느냐" 만 다룹니다. 값을 계산하지도, 입력칸을 채우지도,
 *      서버에 붙지도 않습니다. 하단 바 버튼은 글자만 "매수 / 롱" 이지
 *      누르면 주문창이 열릴 뿐입니다. 여기서 진짜 주문이 나가기 시작하면
 *      회원이 "창 열려고 눌렀는데 주문이 들어간" 상태가 됩니다(P1).
 *
 *   2) 하단 바 버튼은 id 를 갖지 않는다
 *      진짜 주문 버튼은 #btn-long / #btn-short 입니다. 하단 바에 같은 id 를
 *      붙이면 document.getElementById("btn-long") 이 **바 버튼**을 집습니다.
 *      ui.js(수정 금지)와 leverage-modal·qty-price-order 가 전부 id 로 찾기
 *      때문에, 그 순간 진짜 주문 버튼에 걸린 처리기가 통째로 헛돕니다.
 *
 *   3) DOM 을 하나도 옮기지 않는다
 *      .order-panel 의 부모는 계속 .side-column 이고, .side-column 의 부모는
 *      계속 .main-grid 입니다. 주문 패널을 body 밑으로 옮기는 식으로 "고치면"
 *      js/ui.js 가 다시 그릴 때 화면에서 사라집니다.
 *
 *   4) 폭이 넓어지면 주문 패널이 반드시 돌아온다
 *      폰에서 열었다가 화면을 넓히면(회전·태블릿) body 의 속성이 떨어져야
 *      합니다. 남아 있으면 데스크톱에서도 주문 패널이 화면에서 빠집니다.
 *
 *   5) 데스크톱에서는 한 줄도 달라지지 않는다
 *      768/1440/1920 에서는 속성이 아예 안 붙습니다. open() 을 직접 불러도
 *      열리지 않습니다.
 *
 *   6) CSS 짝이 맞다 — 닫힘 규칙과 열림 규칙이 둘 다 있고, 경계가 같다
 *      JS 는 700px 을 폰으로 보는데 CSS 가 600px 이면, 그 사이 폭에서
 *      "패널도 없고 바도 없는" 화면이 됩니다. 주문 불가(P1).
 *      닫힘 규칙만 남고 열림 규칙이 사라져도 마찬가지로 영원히 주문 불가입니다.
 *
 *   7) 수정 금지 파일 12개를 건드리지 않았다
 *
 * 사이트 코드는 한 글자도 고치지 않습니다. 네트워크에 붙지 않습니다
 * (fetch·WebSocket 을 던지게 막아두고, 불리면 실패합니다).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  ✓ " + 제목);
  } else {
    fail++;
    console.log("  ✗ " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(t) { console.log("\n" + t); }

/* 주석에 "주문"·"placeOrder" 같은 말이 설명으로 잔뜩 적혀 있어서
   문자열만 찾으면 오탐이 납니다. 실제로 도는 코드만 남깁니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const SRC = read("js/order-sheet-mobile.js");
const CODE = 주석제거(SRC);
const INDEX = read("index.html");
const CSS_CODE = read("style.css").replace(/\/\*[\s\S]*?\*\//g, " ");

console.log("\n폰 주문 시트 봉인 — js/order-sheet-mobile.js");

/* =========================================================================
 * jsdom 부팅기 — index.html 의 진짜 마크업 위에서 이 모듈만 돌립니다.
 * 화면 폭은 테스트가 쥐고 흔듭니다(win.__w).
 * ========================================================================= */
function boot(폭) {
  const dom = new JSDOM(INDEX, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  const doc = win.document;

  /* 네트워크는 아예 못 쓰게 막습니다 — 불리면 그 자리에서 터집니다 */
  win.fetch = () => { throw new Error("이 모듈은 네트워크를 쓰면 안 됩니다"); };
  win.WebSocket = function () { throw new Error("이 모듈은 소켓을 열면 안 됩니다"); };
  win.alert = () => { throw new Error("이 모듈은 alert 을 쓰면 안 됩니다"); };
  /* jsdom 은 scrollTo 를 안 만들어 뒀습니다. 그대로 두면 "Not implemented" 가
     화면에 쏟아져서 진짜 실패가 그 사이에 묻힙니다. 불린 횟수만 셉니다. */
  win.__scrollTo = 0;
  Object.defineProperty(win, "scrollTo", {
    configurable: true,
    writable: true,
    value: function () { win.__scrollTo++; },
  });

  win.__w = 폭;
  win.matchMedia = function (q) {
    const m = /max-width\s*:\s*(\d+)px/.exec(q);
    const 한계 = m ? Number(m[1]) : 0;
    return {
      media: q,
      get matches() { return m ? win.__w <= 한계 : false; },
      addListener() {}, removeListener() {},
      addEventListener() {}, removeEventListener() {},
      dispatchEvent() { return false; },
    };
  };

  /* 주문 엔진 감시자 — 한 번이라도 불리면 셉니다 */
  const 호출 = [];
  const 감시 = (이름) => function () { 호출.push(이름); };
  win.eval("window.App = window.App || {};");
  win.App.Trading = {
    openPosition: 감시("openPosition"),
    placeOrder: 감시("placeOrder"),
    closePosition: 감시("closePosition"),
    setLeverage: 감시("setLeverage"),
    executeOrder: 감시("executeOrder"),
  };
  win.App.Storage = { save: 감시("Storage.save"), load: 감시("Storage.load") };
  win.App.SupabaseClient = { get: 감시("SupabaseClient.get") };

  win.eval(SRC);
  /* 모듈은 readyState 에 따라 스스로 뜹니다. 아직 안 떴으면 신호를 줍니다.
     (여기서 곧장 init() 을 부르면 "스스로 뜨는가" 를 검사하지 못합니다) */
  if (!doc.getElementById("tl-order-bar")) {
    doc.dispatchEvent(new win.Event("DOMContentLoaded", { bubbles: true }));
  }

  return { dom, win, doc, App: win.App, 호출, 폭바꾸기(새폭) { win.__w = 새폭; } };
}

function 클릭(el) { el.click(); }

/* =========================================================================
 * [1] 살아 있는가 — 파일과 등록
 * ========================================================================= */
section("[1] 파일과 등록");
{
  ok("js/order-sheet-mobile.js 가 있다", SRC.length > 0);
  ok(
    "index.html 이 이 파일을 부른다",
    /<script[^>]+src="js\/order-sheet-mobile\.js"/.test(INDEX),
    "이 한 줄이 빠지면 폰에 매수/매도 바가 아예 안 생깁니다"
  );
  ok(
    "App.OrderSheetMobile 이라는 이름으로 붙는다",
    /App\.OrderSheetMobile\s*=/.test(CODE),
    "이름이 바뀌면 다른 모듈에서 시트를 열 수 없습니다"
  );
}

/* =========================================================================
 * [2] 이 모듈은 주문을 넣지 않는다 (소스)
 * ========================================================================= */
section("[2] 주문을 넣지 않는다 — 코드에 없어야 하는 것");
{
  const 금지 = [
    ["App.Trading", /App\.Trading/],
    ["placeOrder", /placeOrder/],
    ["openPosition", /openPosition/],
    ["closePosition", /closePosition/],
    ["App.Storage", /App\.Storage/],
    ["SupabaseClient", /SupabaseClient/],
    ["fetch(", /\bfetch\s*\(/],
    ["new WebSocket", /new\s+WebSocket/],
    ["localStorage", /localStorage/],
  ];
  금지.forEach(function (쌍) {
    ok(
      "코드에 " + 쌍[0] + " 가 없다",
      !쌍[1].test(CODE),
      "이 모듈은 창을 여닫는 일만 합니다. 주문·저장·서버가 여기로 들어오면 " +
        "'창 열려고 눌렀는데 주문이 나가는' 고장이 생깁니다"
    );
  });
  ok(
    "입력칸에 값을 써넣지 않는다 (.value = 없음)",
    !/\.value\s*=[^=]/.test(CODE),
    "가격·수량을 채우는 것은 orderbook-click-order.js 와 qty-price-order.js 의 일입니다"
  );
}

/* =========================================================================
 * [3] 데스크톱 — 한 줄도 달라지지 않는다
 * ========================================================================= */
section("[3] 데스크톱(1440) 은 그대로다");
{
  const t = boot(1440);
  ok(
    "body 에 data-tl-order-sheet 가 안 붙는다",
    !t.doc.body.hasAttribute("data-tl-order-sheet"),
    "붙으면 style.css 의 폰 규칙이 언제든 걸릴 수 있는 상태가 됩니다"
  );
  t.App.OrderSheetMobile.open("long");
  ok(
    "open('long') 을 직접 불러도 안 열린다",
    !t.App.OrderSheetMobile.isOpen(),
    "데스크톱에서 열리면 주문 패널이 화면 아래 시트로 튀어나옵니다"
  );
  ok(
    "주문 패널에 data-tl-side 가 안 붙는다",
    !t.doc.querySelector(".order-panel").hasAttribute("data-tl-side")
  );
  ok("주문 엔진을 한 번도 안 불렀다", t.호출.length === 0, "불린 것: " + t.호출.join(", "));
}

/* =========================================================================
 * [4] 폰 — 바가 생기고 "닫힘" 으로 시작한다
 * ========================================================================= */
section("[4] 폰(390) 첫 화면");
const p = boot(390);
{
  const bar = p.doc.getElementById("tl-order-bar");
  ok("하단 바가 생긴다", !!bar, "폰에서 주문창을 여는 유일한 입구입니다");
  ok("가림막이 생긴다", !!p.doc.getElementById("tl-order-scrim"));
  ok("시트 머리말이 생긴다", !!p.doc.querySelector(".tl-sheet-head"));
  ok(
    "바 버튼이 2개다 (매수/롱 · 매도/숏)",
    !!bar && bar.querySelectorAll("[data-tl-open]").length === 2
  );
  ok(
    "바 버튼에 id 가 없다",
    !!bar && bar.querySelectorAll("[id]").length === 0,
    "#btn-long 같은 id 를 여기 붙이면 getElementById 가 진짜 주문 버튼 대신 " +
      "이 바를 집어서, 주문 버튼 처리기가 통째로 헛돕니다"
  );
  ok(
    "시작 상태가 닫힘이다",
    p.doc.body.getAttribute("data-tl-order-sheet") === "closed",
    "속성이 아예 없으면 style.css 의 자리 비우기(padding-bottom)가 안 걸려 " +
      "페이지 맨 아래가 바에 가립니다"
  );
  ok("아직 안 열려 있다", p.App.OrderSheetMobile.isOpen() === false);
  ok("주문 엔진을 한 번도 안 불렀다", p.호출.length === 0, "불린 것: " + p.호출.join(", "));
}

/* =========================================================================
 * [5] 바를 눌러도 주문이 안 들어간다 — 창만 열린다
 * ========================================================================= */
section("[5] 하단 바를 눌렀을 때");
{
  const 매수 = p.doc.querySelector('[data-tl-open="long"]');
  const 매도 = p.doc.querySelector('[data-tl-open="short"]');
  const 증거금 = p.doc.getElementById("margin-input");
  const 이전값 = 증거금 ? 증거금.value : null;

  클릭(매수);
  ok("매수 바를 누르면 시트가 열린다", p.App.OrderSheetMobile.isOpen());
  ok(
    "주문 패널에 data-tl-side='long' 이 붙는다",
    p.doc.querySelector(".order-panel").getAttribute("data-tl-side") === "long",
    "어느 쪽으로 열었는지 표시가 없으면 회원이 반대로 누릅니다"
  );
  ok(
    "머리말 배지가 '매수 / 롱' 이다",
    p.doc.querySelector(".tl-sheet-side").textContent === "매수 / 롱"
  );
  ok("배경 스크롤 잠금이 걸린다", p.doc.documentElement.classList.contains("tl-sheet-lock"));
  ok(
    "매수 바를 눌러도 주문은 안 나간다",
    p.호출.length === 0,
    "불린 것: " + p.호출.join(", ") + " — 이 바는 '창 열기' 버튼입니다"
  );
  ok(
    "증거금 값이 그대로다 (" + 이전값 + ")",
    !증거금 || 증거금.value === 이전값,
    "이 모듈은 어떤 값도 채우지 않습니다"
  );

  클릭(매도);
  ok(
    "매도 바를 누르면 data-tl-side 가 short 로 바뀐다",
    p.doc.querySelector(".order-panel").getAttribute("data-tl-side") === "short"
  );
  ok(
    "배지도 '매도 / 숏' 으로 바뀐다",
    p.doc.querySelector(".tl-sheet-side").textContent === "매도 / 숏"
  );
  ok("매도 바를 눌러도 주문은 안 나간다", p.호출.length === 0, "불린 것: " + p.호출.join(", "));
}

/* =========================================================================
 * [6] DOM 을 옮기지 않는다 · id 가 그대로 있다
 * ========================================================================= */
section("[6] 마크업을 옮기지 않는다");
{
  const panel = p.doc.querySelector(".order-panel");
  const col = p.doc.querySelector(".main-grid > .side-column");
  ok(
    "주문 패널의 부모가 여전히 .side-column 이다",
    panel.parentElement === col,
    "옮기면 js/ui.js(수정 금지)가 다시 그릴 때 주문 패널이 사라집니다"
  );
  ok(
    ".side-column 의 부모가 여전히 .main-grid 이다",
    !!col.parentElement && col.parentElement.classList.contains("main-grid")
  );
  ok(
    "시트 머리말은 .side-column 의 첫 자식으로 '추가' 됐다",
    !!col.firstElementChild && col.firstElementChild.classList.contains("tl-sheet-head"),
    "기존 요소를 밀어내거나 감싸면 다른 모듈의 querySelector 가 어긋납니다"
  );

  ["btn-long", "btn-short", "lev-display", "margin-input", "ob-asks", "ob-bids"].forEach(function (id) {
    ok(
      "#" + id + " 이 문서에 딱 하나 있다",
      p.doc.querySelectorAll("#" + id).length === 1,
      "id 가 둘이 되면 getElementById 가 어느 쪽을 집을지 아무도 모릅니다"
    );
  });
}

/* =========================================================================
 * [7] 호가 행 클릭 — 시트만 연다
 * ========================================================================= */
section("[7] 호가 행을 눌렀을 때");
{
  p.App.OrderSheetMobile.close();
  const asks = p.doc.getElementById("ob-asks");
  const row = p.doc.createElement("div");
  row.className = "ob-row";
  row.innerHTML = '<span class="ob-price">110000.0</span>';
  asks.appendChild(row);

  const 증거금 = p.doc.getElementById("margin-input");
  const 이전값 = 증거금 ? 증거금.value : null;

  클릭(row.querySelector(".ob-price"));
  ok(
    "폰에서 호가 행을 누르면 시트가 열린다",
    p.App.OrderSheetMobile.isOpen(),
    "orderbook-click-order.js 가 값을 채워도 시트가 닫혀 있으면 " +
      "회원 눈에는 아무 일도 안 일어난 것으로 보입니다"
  );
  ok(
    "이때 data-tl-side 는 안 붙는다 (방향 미정)",
    !p.doc.querySelector(".order-panel").hasAttribute("data-tl-side"),
    "호가를 눌렀을 뿐인데 매수/매도가 정해진 것처럼 보이면 안 됩니다"
  );
  ok("호가 행을 눌러도 주문은 안 나간다", p.호출.length === 0, "불린 것: " + p.호출.join(", "));
  ok("호가 행을 눌러도 이 모듈은 값을 안 채운다", !증거금 || 증거금.value === 이전값);

  /* 데스크톱에서는 호가 행을 눌러도 시트가 뜨면 안 됩니다 */
  const d = boot(1440);
  const asks2 = d.doc.getElementById("ob-asks");
  const row2 = d.doc.createElement("div");
  row2.className = "ob-row";
  asks2.appendChild(row2);
  클릭(row2);
  ok(
    "데스크톱에서는 호가 행을 눌러도 시트가 안 열린다",
    !d.App.OrderSheetMobile.isOpen()
  );
}

/* =========================================================================
 * [8] 닫기 — 흔적을 남기지 않는다
 * ========================================================================= */
section("[8] 닫기");
{
  p.App.OrderSheetMobile.open("long");
  p.App.OrderSheetMobile.close();
  ok("닫히면 isOpen() 이 false 다", p.App.OrderSheetMobile.isOpen() === false);
  ok(
    "body 속성이 'closed' 로 남는다 (사라지지 않는다)",
    p.doc.body.getAttribute("data-tl-order-sheet") === "closed"
  );
  ok(
    "data-tl-side 가 지워진다",
    !p.doc.querySelector(".order-panel").hasAttribute("data-tl-side"),
    "남으면 다음에 반대쪽으로 열었을 때 옛 방향 표시가 그대로 보입니다"
  );
  ok("배지 글자가 비워진다", p.doc.querySelector(".tl-sheet-side").textContent === "");
  ok(
    "배경 스크롤 잠금이 풀린다",
    !p.doc.documentElement.classList.contains("tl-sheet-lock"),
    "안 풀리면 폰에서 페이지 전체가 스크롤이 안 됩니다"
  );

  ok(
    "닫을 때 배경 스크롤 위치를 되돌린다",
    p.win.__scrollTo > 0,
    "잠금을 풀면 페이지가 맨 위로 튀는 브라우저가 있어 원래 위치로 되돌립니다"
  );

  /* Esc — 열린 상태에서만 닫습니다 */
  p.App.OrderSheetMobile.open("short");
  p.doc.dispatchEvent(new p.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok("Esc 로도 닫힌다", p.App.OrderSheetMobile.isOpen() === false);

  /* 가림막 클릭 */
  p.App.OrderSheetMobile.open("long");
  클릭(p.doc.getElementById("tl-order-scrim"));
  ok("가림막을 눌러도 닫힌다", p.App.OrderSheetMobile.isOpen() === false);

  /* 닫기 버튼 */
  p.App.OrderSheetMobile.open("long");
  클릭(p.doc.querySelector(".tl-sheet-close"));
  ok("✕ 버튼으로도 닫힌다", p.App.OrderSheetMobile.isOpen() === false);
  ok("여기까지 주문 엔진 호출 0회", p.호출.length === 0, "불린 것: " + p.호출.join(", "));
}

/* =========================================================================
 * [9] 폭이 넓어지면 주문 패널이 반드시 돌아온다 (P1)
 * ========================================================================= */
section("[9] 폰 -> 데스크톱 (회전·창 넓히기)");
{
  const t = boot(390);
  t.App.OrderSheetMobile.open("long");
  ok("폰에서 열려 있다", t.App.OrderSheetMobile.isOpen());

  t.폭바꾸기(1440);
  t.win.dispatchEvent(new t.win.Event("resize"));

  ok(
    "넓히면 body 의 data-tl-order-sheet 가 떨어진다",
    !t.doc.body.hasAttribute("data-tl-order-sheet"),
    "남으면 데스크톱에서도 주문 패널이 화면에서 빠집니다 — 주문 불가(P1)"
  );
  ok(
    "배경 스크롤 잠금도 풀린다",
    !t.doc.documentElement.classList.contains("tl-sheet-lock")
  );
  ok(
    "data-tl-side 도 떨어진다",
    !t.doc.querySelector(".order-panel").hasAttribute("data-tl-side")
  );

  /* 다시 좁히면 닫힘 상태로 돌아옵니다 */
  t.폭바꾸기(360);
  t.win.dispatchEvent(new t.win.Event("resize"));
  ok(
    "다시 좁히면 '닫힘' 으로 돌아온다 (열린 채로 튀어나오지 않는다)",
    t.doc.body.getAttribute("data-tl-order-sheet") === "closed"
  );
}

/* =========================================================================
 * [10] 거래 화면이 아닐 때는 바를 감춘다
 * ========================================================================= */
section("[10] 다른 페이지에서는 바를 감춘다");
{
  const t = boot(360);
  const bar = t.doc.getElementById("tl-order-bar");
  ok("거래 화면에서는 바가 보인다", !bar.classList.contains("tl-bar-hidden"));

  t.doc.getElementById("page-exchange").style.display = "none";
  t.App.OrderSheetMobile.sync();
  ok(
    "게시판·랭킹으로 옮기면 바가 감춰진다",
    bar.classList.contains("tl-bar-hidden"),
    "다른 페이지에서 매수/매도 바가 떠 있으면 회원이 거기서 주문되는 줄 압니다"
  );

  t.doc.getElementById("page-exchange").style.display = "";
  t.App.OrderSheetMobile.sync();
  ok("거래 화면으로 돌아오면 다시 보인다", !bar.classList.contains("tl-bar-hidden"));
}

/* =========================================================================
 * [11] CSS 짝이 맞다
 * ========================================================================= */
section("[11] style.css 와 짝이 맞는가");
{
  const m = /var\s+MQ\s*=\s*"\(max-width:\s*(\d+)px\)"/.exec(SRC);
  ok("JS 가 폰 경계를 (max-width:700px) 로 쓴다", !!m && m[1] === "700");
  const 경계 = m ? m[1] : "700";

  /* 시트 규칙이 들어 있는 미디어 블록의 경계를 찾습니다 */
  const 시트블록 = CSS_CODE.split(/@media\s*/).filter(function (b) {
    return b.indexOf("body[data-tl-order-sheet]") >= 0 ||
           b.indexOf('body[data-tl-order-sheet="open"]') >= 0;
  });
  ok("시트 규칙이 @media 안에 있다", 시트블록.length > 0);
  const 경계일치 = 시트블록.every(function (b) {
    const mm = /^\(max-width\s*:\s*(\d+)px\)/.exec(b.trim());
    return !!mm && mm[1] === 경계;
  });
  ok(
    "CSS 의 폰 경계도 " + 경계 + "px 이다",
    시트블록.length > 0 && 경계일치,
    "JS 는 700px 을 폰으로 보는데 CSS 가 다르면 그 사이 폭에서 " +
      "'주문 패널도 없고 하단 바도 없는' 화면이 됩니다 — 주문 불가(P1)"
  );

  ok(
    "닫힘 규칙이 있다 — body[data-tl-order-sheet] .side-column{display:none}",
    /body\[data-tl-order-sheet\]\s*\.main-grid\s*>\s*\.side-column\s*\{[^}]*display\s*:\s*none/.test(CSS_CODE)
  );
  ok(
    '열림 규칙이 있다 — body[data-tl-order-sheet="open"] .side-column{display:flex}',
    /body\[data-tl-order-sheet="open"\]\s*\.main-grid\s*>\s*\.side-column\s*\{[^}]*display\s*:\s*flex/.test(CSS_CODE),
    "닫힘 규칙만 남고 열림 규칙이 사라지면 폰에서 주문 패널이 영영 안 나옵니다"
  );
  ok(
    "데스크톱 기본값에서 하단 바는 안 보인다 (.tl-order-bar{display:none})",
    /(^|\})\s*\.tl-order-bar\s*\{\s*display\s*:\s*none/.test(CSS_CODE),
    "데스크톱에 매수/매도 바가 깔리면 화면 아래가 가립니다"
  );
  ok(
    "폰에서 바가 flex 로 뜬다",
    /\.tl-order-bar\s*\{[^}]*display\s*:\s*flex/.test(CSS_CODE)
  );

  /* 모서리 상한 12px — CLAUDE.md 확정 규칙 */
  const 반경 = [];
  const re = /\.tl-(?:order-bar|sheet)[^{}]*\{[^}]*border-radius\s*:\s*([0-9.]+)px/g;
  let r;
  while ((r = re.exec(CSS_CODE)) !== null) 반경.push(Number(r[1]));
  ok(
    "시트·바의 모서리가 전부 12px 이하다 (" + (반경.join(", ") || "없음") + ")",
    반경.every(function (v) { return v <= 12; }),
    "확정 규칙: 카드 모서리 10px, 상한 12px"
  );
}

/* =========================================================================
 * [12] 수정 금지 파일 12개
 * ========================================================================= */
section("[12] 수정 금지 파일 12개");
{
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
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
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  const 다름 = Object.keys(기준).filter(function (f) { return md5(f) !== 기준[f]; });
  ok("12개 전부 그대로다", 다름.length === 0, "바뀐 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [13] 테스트 등록
 * ========================================================================= */
section("[13] 테스트 등록");
{
  const 파일명 = "tests/order-sheet-mobile-seal.test.js";
  let order = "";
  try { order = read("tests/_order.txt"); } catch (e) { order = ""; }
  ok(
    "npm test 목록에 이 파일이 있다",
    order.indexOf(파일명) >= 0 || read("package.json").indexOf(파일명) >= 0,
    "tests/_order.txt 에 한 줄 넣지 않으면 아무도 안 돌립니다"
  );
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과" : "실패 있음");
process.exit(fail === 0 ? 0 : 1);
