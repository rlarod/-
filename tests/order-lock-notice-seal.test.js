/* =========================================================================
 * tests/order-lock-notice-seal.test.js
 * 주문 패널 덮개 봉인 — js/order-lock-notice.js (2026-08-27)
 * =========================================================================
 *
 * 왜 만들었나
 *   b5d128f 로 라이브에 나갔는데 이 모듈을 지키는 테스트가 0건이었습니다.
 *   본부장이 라이브에서 문구까지 읽고 통과시킨 상태였습니다.
 *
 * 대표 지시(2026-08-27)
 *   "바이낸스에서 포지션 잡고 있다고 다른 차트 못 보는 거 아니잖아"
 *   막는 대상이 "종목 보기" 에서 "주문" 으로 바뀌었습니다.
 *   차트·호가·최근 체결·지표·선긋기·시간봉은 열려 있고, 주문 패널만 덮습니다.
 *   (그전에는 종목 탭을 누르면 window.alert 이 떠서 보기 자체를 거부했습니다)
 *
 * 이 파일이 못 박는 것
 *
 *   1) 포지션이 없으면 덮개가 안 뜬다 (hidden)
 *      덮개는 display 를 flex 로 씁니다. hidden 속성만으로는 안 꺼집니다 —
 *      ".tl-order-lock[hidden]{display:none;}" 규칙이 반드시 같이 있어야
 *      합니다. 그 한 줄이 사라지면 포지션이 없는 회원의 주문창이
 *      영구히 덮입니다(주문 자체가 불가능해지는 P1).
 *
 *   2) 보는 종목과 포지션 종목이 다를 때만 뜬다
 *      같은 종목을 볼 때 뜨면 정작 주문해야 할 사람을 막습니다.
 *
 *   3) 주문창 높이가 안 늘어난다
 *      덮개가 흐름에 끼면 주문창이 바로 넘칩니다. 종목 줄 4개를 넣느라
 *      여유가 0 이었습니다(1440 실측 scrollHeight 1149 / clientHeight 1148).
 *      본부장 실측 — 덮개를 켜도 1209.4 → 1209.4, 차이 0.
 *      그 0 을 만드는 규칙이 position 을 absolute 로 두는 것이라 규칙을 봉인합니다.
 *      주의 — 픽셀 위치나 "보이는 개수" 로 봉인하지 않습니다.
 *             디자인팀이 지금 style.css 를 만지는 중입니다.
 *
 *   4) alert 을 안 쓴다 — 옛 방식으로 되돌아가는 것을 막습니다
 *
 *   5) 조사 "으로/로" 가 받침에 맞다
 *      비트코인으로 · 나스닥으로 · 삼성전자로 · SK하이닉스로
 *
 *   6) App.SymbolGuard.requiredSymbol() 을 쓴다
 *      잠금 판정을 여기서 다시 계산하지 않습니다. 두 곳에서 따로 계산하면
 *      한쪽만 고쳐졌을 때 화면과 엔진이 어긋납니다.
 *
 *   7) 확정 팔레트 · 빨강 없음 · 이모지 없음 · 모서리 12px 이하 · 그림자 없음
 *
 * 이 파일은 사이트 코드를 한 글자도 고치지 않습니다. tests/ 안에서만 돕니다.
 * 네트워크에 붙지 않습니다(Supabase·바이낸스 호출 없음).
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
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  " + MARK_OK + " " + 제목);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* 주석을 걷어낸 "실제로 도는 코드" 만 남깁니다.
   이 모듈 머리말에 alert 이야기가 설명으로 적혀 있어 문자열만 찾으면 오탐이 납니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const SRC = read("js/order-lock-notice.js");
const CODE = 주석제거(SRC);
const INDEX = read("index.html");
const CSS = read("style.css");
/* CSS 주석에도 색·문구가 적혀 있어 같이 걷어냅니다 */
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, " ");

const 손익빨강 = "#F0506E";

console.log("\n주문 패널 덮개 봉인 — js/order-lock-notice.js");

/* =========================================================================
 * jsdom 부팅 — index.html + 종목 등록소 + 이 모듈만.
 * 잠금 판정(App.SymbolGuard)과 보는 종목(App.Config)은 테스트가 쥐고 흔듭니다.
 * ========================================================================= */
const dom = new JSDOM(INDEX, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "https://example.test/",
});
const win = dom.window;
const doc = win.document;
win.WebSocket = function () {
  this.close = () => {};
  this.send = () => {};
};
win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

let alert호출 = 0;
win.alert = function () {
  alert호출++;
};

win.eval(
  "window.App = window.App || {};" +
    "App.Bus = (function(){" +
    "  var L = {};" +
    "  return {" +
    "    on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
    "    emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{f(p);}catch(err){} }); }" +
    "  };" +
    "})();"
);
win.eval(read("js/symbol-registry.js"));

/* 테스트가 쥐고 있는 손잡이 두 개 */
const 손잡이 = { 필요: null, 지금: "BTCUSDT", 이유: "보유 중인 포지션이 있습니다", 던짐: false };
win.__h = 손잡이;
win.eval(
  "App.SymbolGuard = {" +
    "  requiredSymbol: function(){ if (window.__h.던짐) throw new Error('테스트'); return window.__h.필요; }," +
    "  blockReason: function(){ return window.__h.이유; }" +
    "};" +
    "App.Config = App.Config || {};" +
    "App.Config.getActiveSymbol = function(){ return window.__h.지금; };"
);

const 전환기록 = [];
win.__sw = 전환기록;
win.eval(
  "App.SymbolStreamSwitch = { switchTo: function(s){ window.__sw.push(s); } };"
);

win.eval(SRC);
const Notice = win.App.OrderLockNotice;
if (Notice && typeof Notice.init === "function") Notice.init();

const panel = doc.querySelector(".amitalk-order");
const 덮개 = () => doc.querySelector(".tl-order-lock");

/* .tl-order-lock 이 들어간 CSS 규칙만 모읍니다 (주석은 이미 걷어냈습니다) */
function 덮개규칙() {
  const 결과 = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS_CODE)) !== null) {
    const 선택자 = m[1].trim();
    if (선택자.indexOf("tl-order-lock") >= 0) 결과.push({ 선택자: 선택자, 본문: m[2] });
  }
  return 결과;
}
const 규칙들 = 덮개규칙();
function 규칙찾기(부분) {
  return 규칙들.filter((r) => r.선택자.indexOf(부분) >= 0);
}

/* =========================================================================
 * [0] 실려 있는가 · 한 줄로 꺼지는가
 * ========================================================================= */
section("[0] index.html script 한 줄만 지우면 덮개가 안 만들어진다");
{
  const 줄수 = (INDEX.match(/js\/order-lock-notice\.js/g) || []).length;
  ok("index.html 이 이 파일을 싣는다", 줄수 >= 1);
  ok("index.html 에 딱 한 줄만 있다", 줄수 === 1, "지금 " + 줄수 + "줄");
  ok(
    "main.js 의 init 목록에 넣지 않았다",
    read("main.js").indexOf("OrderLockNotice") === -1,
    "main.js 는 여러 팀이 같이 만지는 파일입니다"
  );
  const 남의파일 = fs
    .readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js" && f !== "order-lock-notice.js")
    .filter((f) => 주석제거(read("js/" + f)).indexOf("OrderLockNotice") >= 0);
  ok("다른 js 파일이 이 모듈에 기대지 않는다", 남의파일.length === 0, 남의파일.join(", "));
  ok("App.OrderLockNotice 가 떠 있다", !!Notice);
  ok("주문 패널(.amitalk-order)이 index.html 에 있다", !!panel);
}

/* =========================================================================
 * [1] 포지션이 없으면 덮개가 안 뜬다
 * ========================================================================= */
section("[1] 포지션이 없으면 덮개가 안 뜬다");
{
  손잡이.필요 = null;
  손잡이.지금 = "BTCUSDT";
  Notice.update();

  ok("덮개가 안 보인다", Notice.isShown() === false);
  ok("덮개에 hidden 이 붙어 있다", !!덮개() && 덮개().hasAttribute("hidden"));
  ok(
    "주문창에 잠금 표시가 없다",
    panel.getAttribute("data-tl-order-locked") === null,
    "이 표시가 남으면 주문창 내용이 흐린 채로 눌리지 않습니다"
  );

  /* 덮개는 display 를 flex 로 씁니다 — hidden 속성만으로는 안 꺼집니다 */
  const hidden규칙 = 규칙찾기("[hidden]");
  ok(
    ".tl-order-lock[hidden] 을 display:none 으로 확실히 끈다",
    hidden규칙.length >= 1 && /display\s*:\s*none/.test(hidden규칙.map((r) => r.본문).join(" ")),
    "이 한 줄이 없으면 display:flex 가 hidden 을 이겨서 포지션 없는 회원의 주문창이 영구히 덮입니다"
  );

  /* 잠금 판정 모듈이 아예 없을 때도 조용히 아무것도 안 합니다 */
  const 보관 = win.App.SymbolGuard;
  win.App.SymbolGuard = undefined;
  Notice.update();
  ok("잠금 판정 모듈이 없으면 조용히 아무것도 안 한다", Notice.isShown() === false);
  win.App.SymbolGuard = 보관;

  손잡이.던짐 = true;
  Notice.update();
  ok("잠금 판정이 오류를 던져도 덮개가 안 뜬다", Notice.isShown() === false);
  손잡이.던짐 = false;
}

/* =========================================================================
 * [2] 보는 종목과 포지션 종목이 다를 때만 뜬다
 * ========================================================================= */
section("[2] 보는 종목 != 포지션 종목 일 때만 뜬다");
{
  손잡이.필요 = "BTCUSDT";
  손잡이.지금 = "BTCUSDT";
  Notice.update();
  ok("같은 종목을 보고 있으면 안 뜬다", Notice.isShown() === false, "정작 주문할 사람을 막습니다");

  손잡이.지금 = "QQQUSDT";
  Notice.update();
  ok("다른 종목을 보면 뜬다", Notice.isShown() === true);
  ok("주문창에 잠금 표시가 붙는다", panel.getAttribute("data-tl-order-locked") === "1");
  ok(
    "잠긴 동안 주문창 내용은 눌리지 않는다 (CSS 규칙)",
    규칙찾기("data-tl-order-locked").some((r) => /pointer-events\s*:\s*none/.test(r.본문)),
    "덮개 뒤의 매수/매도 버튼이 그대로 눌리면 덮은 의미가 없습니다"
  );

  손잡이.지금 = "BTCUSDT";
  Notice.update();
  ok("다시 원래 종목으로 돌아오면 덮개가 걷힌다", Notice.isShown() === false);
  ok("잠금 표시도 같이 걷힌다", panel.getAttribute("data-tl-order-locked") === null);
}

/* =========================================================================
 * [3] 주문창 높이가 안 늘어난다
 * ========================================================================= */
section("[3] 주문창 높이가 안 늘어난다 (본부장 실측 1209.4 -> 1209.4, 차이 0)");
{
  const 본체 = 규칙찾기(".tl-order-lock").filter((r) => /(^|,)\s*\.tl-order-lock\s*(,|$)/.test(r.선택자));
  ok(".tl-order-lock 규칙이 style.css 에 있다", 본체.length >= 1);
  const 본문 = 본체.map((r) => r.본문).join(" ");
  ok(
    "덮개가 흐름에서 빠져 있다 (position 을 absolute 로)",
    /position\s*:\s*absolute/.test(본문),
    "흐름에 끼면 주문창 높이가 덮개만큼 늘어 바로 넘칩니다"
  );
  ok(
    "덮개가 주문창을 기준으로 자리잡는다 (.amitalk-order 가 position 을 relative 로)",
    /\.amitalk-order\s*\{[^}]*position\s*:\s*relative/.test(CSS_CODE),
    "기준점이 없으면 덮개가 페이지 전체를 덮습니다"
  );

  /* 덮개는 한 장뿐이고, 기존 마크업을 지우거나 옮기지 않습니다 */
  손잡이.필요 = "BTCUSDT";
  손잡이.지금 = "QQQUSDT";
  const 자식수 = panel.children.length;
  Notice.update();
  Notice.update();
  Notice.update();
  ok("덮개는 한 장만 만든다", doc.querySelectorAll(".tl-order-lock").length === 1);
  ok(
    "주문창의 기존 내용을 지우거나 옮기지 않는다",
    panel.children.length === 자식수,
    "덮개 한 장을 append 할 뿐이어야 합니다"
  );
  ok("덮개가 주문창 안에 있다", 덮개().parentNode === panel);
}

/* =========================================================================
 * [4] alert 을 안 쓴다
 * ========================================================================= */
section("[4] alert 을 안 쓴다 (옛 방식으로 되돌아가지 않는다)");
{
  ok("코드에 alert 호출이 없다", CODE.indexOf("alert(") === -1);
  ok("confirm 도 안 쓴다", CODE.indexOf("confirm(") === -1);

  손잡이.필요 = "BTCUSDT";
  손잡이.지금 = "QQQUSDT";
  Notice.update();
  alert호출 = 0;
  const btn = doc.querySelector(".tl-order-lock-btn");
  ok("돌아가기 버튼이 있다", !!btn);
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("버튼을 눌러도 팝업이 안 뜬다", alert호출 === 0, "alert 호출 " + alert호출 + "회");
  ok(
    "전환은 한 통로(App.SymbolStreamSwitch.switchTo)로만 간다",
    전환기록.length === 1 && 전환기록[0] === "BTCUSDT",
    JSON.stringify(전환기록)
  );
}

/* =========================================================================
 * [5] 조사 "으로/로"
 * ========================================================================= */
section("[5] 조사 '으로/로' 가 받침에 맞다");
{
  [
    ["비트코인", "으로"],
    ["나스닥", "으로"],
    ["삼성전자", "로"],
    ["SK하이닉스", "로"],
  ].forEach(function (쌍) {
    ok(쌍[0] + 쌍[1] + " 가 맞다", Notice._ro(쌍[0]) === 쌍[1], "지금 " + 쌍[0] + Notice._ro(쌍[0]));
  });

  /* 화면에 실제로 찍히는 문구까지 확인합니다 */
  const 기대 = {
    BTCUSDT: "비트코인으로 돌아가기",
    QQQUSDT: "나스닥으로 돌아가기",
    SAMSUNGUSDT: "삼성전자로 돌아가기",
    SKHYNIXUSDT: "SK하이닉스로 돌아가기",
  };
  Object.keys(기대).forEach(function (sym) {
    손잡이.필요 = sym;
    손잡이.지금 = sym === "BTCUSDT" ? "QQQUSDT" : "BTCUSDT";
    Notice.update();
    const 글 = doc.querySelector(".tl-order-lock-btn").textContent;
    ok("버튼 문구: " + 기대[sym], 글 === 기대[sym], "지금 '" + 글 + "'");
  });

  /* 종목 이름은 등록소에서만 가져옵니다 — 여기서 새로 짓지 않습니다 */
  ok(
    "종목 이름을 코드에 직접 적어두지 않았다",
    CODE.indexOf("비트코인") === -1 &&
      CODE.indexOf("나스닥") === -1 &&
      CODE.indexOf("삼성전자") === -1 &&
      CODE.indexOf("하이닉스") === -1,
    "여기서 이름을 새로 지으면 '나스닥100' 같은 이름이 생깁니다"
  );
  ok("이름을 App.SymbolRegistry 에서 가져온다", CODE.indexOf("SymbolRegistry") >= 0);
}

/* =========================================================================
 * [6] 잠금 판정을 여기서 다시 계산하지 않는다
 * ========================================================================= */
section("[6] 잠금 판정은 App.SymbolGuard 한 곳에서만 온다");
{
  ok("App.SymbolGuard.requiredSymbol() 을 쓴다", /SymbolGuard\.requiredSymbol\s*\(/.test(CODE));
  ok("App.SymbolGuard.blockReason() 을 쓴다", /SymbolGuard\.blockReason\s*\(/.test(CODE));
  ok(
    "거래 엔진 상태를 직접 들여다보지 않는다",
    CODE.indexOf("App.Trading") === -1 &&
      CODE.indexOf("getState") === -1 &&
      CODE.indexOf("position") === -1 &&
      CODE.indexOf("openOrders") === -1,
    "두 곳에서 따로 계산하면 한쪽만 고쳐졌을 때 화면과 엔진이 어긋납니다"
  );

  /* 이유 문구도 SymbolGuard 가 준 그대로 씁니다 */
  손잡이.필요 = "BTCUSDT";
  손잡이.지금 = "QQQUSDT";
  손잡이.이유 = "미체결 주문이 있습니다";
  Notice.update();
  ok(
    "잠금 이유를 SymbolGuard 가 준 문장 그대로 보여준다",
    doc.querySelector(".tl-order-lock-why").textContent === "미체결 주문이 있습니다",
    doc.querySelector(".tl-order-lock-why").textContent
  );
  손잡이.이유 = "보유 중인 포지션이 있습니다";
  Notice.update();

  /* 판정이 null 이면 포지션이 있든 없든 덮개는 안 뜹니다 (다시 계산하지 않는 증거) */
  손잡이.필요 = null;
  Notice.update();
  ok("판정이 없다고 하면 덮개도 없다", Notice.isShown() === false);
}

/* =========================================================================
 * [7] 확정 팔레트 · 빨강 없음 · 이모지 없음
 * ========================================================================= */
section("[7] 확정 팔레트 · 빨강 없음 · 이모지 없음");
{
  const 덮개CSS = 규칙들.map((r) => r.본문).join("\n");

  ok("덮개 CSS 에 손익 빨강 " + 손익빨강 + " 이 없다", 덮개CSS.toUpperCase().indexOf(손익빨강) === -1);
  ok(
    "덮개 CSS 에 red / crimson 같은 색 이름이 없다",
    !/\b(red|crimson|firebrick|tomato)\b/i.test(덮개CSS)
  );
  ok("코드에도 빨강이 없다", CODE.toUpperCase().indexOf(손익빨강) === -1);

  /* 색은 팔레트 변수로만 씁니다 — 팔레트가 바뀌면 같이 따라가게.
     직접 적은 색은 아래 두 개뿐이고 둘 다 이유가 있습니다.
       #191600            밝은 배경(골드 버튼) 위에 쓰는 어두운 글자
       rgba(255,255,255,) 카드 윗변 흰색 3% 얇은 선 (그림자 대신)
       rgba(10,15,28,)    배경 #0A0F1C 를 그대로 쓴 반투명 막 */
  const 허용literal = ["#191600"];
  const hex들 = 덮개CSS.toUpperCase().match(/#[0-9A-F]{3,8}\b/g) || [];
  const 밖 = hex들.filter((c) => 허용literal.indexOf(c) === -1);
  ok(
    "직접 적은 색이 허용 목록 안이다 (나머지는 팔레트 변수)",
    밖.length === 0,
    "허용 목록 밖: " + 밖.join(", ") + " — 새 색을 넣으려면 이 목록에 이유와 함께 추가하세요"
  );
  const rgba들 = 덮개CSS.match(/rgba?\([^)]*\)/g) || [];
  const rgba밖 = rgba들.filter(
    (c) => c.replace(/\s/g, "").indexOf("rgba(10,15,28,") !== 0 && c.replace(/\s/g, "").indexOf("rgba(255,255,255,") !== 0
  );
  ok("반투명 색도 허용 목록 안이다", rgba밖.length === 0, "허용 목록 밖: " + rgba밖.join(", "));
  ok("색을 팔레트 변수로 쓴다", /var\(--/.test(덮개CSS));

  /* 그림자 금지 — 카드 윗변 흰색 3% 얇은 선만 */
  const 그림자 = 덮개CSS.match(/box-shadow\s*:\s*([^;]+)/g) || [];
  ok(
    "그림자를 쓰지 않는다 (inset 얇은 선만)",
    그림자.every((g) => /inset/.test(g)),
    그림자.join(" / ")
  );

  /* 모서리 상한 12px */
  const 모서리 = (덮개CSS.match(/border-radius\s*:\s*([0-9.]+)px/g) || []).map((s) =>
    parseFloat(s.replace(/[^0-9.]/g, ""))
  );
  ok(
    "카드 모서리가 12px 이하다",
    모서리.length === 0 || Math.max.apply(null, 모서리) <= 12,
    "가장 큰 값 " + (모서리.length ? Math.max.apply(null, 모서리) : "-") + "px"
  );

  const 이모지 = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
  ok("코드에 이모지가 없다", !이모지.test(CODE));
  ok("덮개 CSS 에 이모지가 없다", !이모지.test(덮개CSS));

  /* 화면에 실제로 찍힌 문구에도 이모지가 없어야 합니다 */
  손잡이.필요 = "BTCUSDT";
  손잡이.지금 = "QQQUSDT";
  Notice.update();
  ok("화면에 찍힌 문구에 이모지가 없다", !이모지.test(덮개().textContent), 덮개().textContent);
  ok(
    "무엇이 아직 열려 있는지 같이 알려준다",
    덮개().textContent.indexOf("차트") >= 0 && 덮개().textContent.indexOf("호가") >= 0,
    덮개().textContent
  );
}

/* =========================================================================
 * [8] 수정 금지 파일 12개
 * ========================================================================= */
section("[8] 수정 금지 파일 12개 무수정");
{
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [
    ["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
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
}

/* =========================================================================
 * [9] 테스트 등록
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const 파일명 = "tests/order-lock-notice-seal.test.js";
  let order = "";
  try {
    order = read("tests/_order.txt");
  } catch (e) {
    order = "";
  }
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
