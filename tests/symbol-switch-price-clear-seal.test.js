/* tests/symbol-switch-price-clear-seal.test.js
 * =========================================================================
 * 봉인 — 종목을 바꾼 직후 주문창에 ★옛 종목 가격★이 남던 것 (2026-08-28)
 * =========================================================================
 *
 * ── 무엇이 터져 있었나 ───────────────────────────────────────────────────
 *   js/order-info-panel.js 는 symbol:change 를 구독하지 않습니다.
 *   1초짜리 타이머 하나만 있습니다(REFRESH_INTERVAL_MS = 1000).
 *   그래서 종목을 바꿔도 ★화면 글자★는 다음 1초 눈금까지 옛 숫자 그대로였습니다.
 *
 *   수리팀 실측 (localhost, 100ms 간격, 전환 6회)
 *       옛값 노출  1067ms / 426ms / 942ms / 335ms / 733ms / 243ms
 *       이론상 최대 1,000ms
 *
 *   예 — 비트코인(79,674.00) → SK하이닉스 로 바꿨는데 1초 동안 매수가격 칸에
 *   79,674.00 이 그대로 보입니다. 회원은 그걸 SK하이닉스 가격으로 읽습니다.
 *   오류도 안 나고 화면도 멀쩡한 ★조용한 고장★ 입니다.
 *
 * ── PM 실측 (수정 뒤, localhost · 60ms 간격 · 진짜 전환만) ───────────────
 *       SAMSUNG→BTC      옛값 182.75      옛값샘플 0/45   새값복귀 1549ms
 *       BTC→QQQ          옛값 77,991.20   옛값샘플 0/45   새값복귀  536ms
 *       QQQ→SAMSUNG      옛값 714.33      옛값샘플 0/45   새값복귀  535ms
 *       SAMSUNG→SKHYNIX  옛값 182.90      옛값샘플 0/45   새값복귀 1554ms
 *       폭별 360 / 768 / 1920 — 옛값 0 · 이벤트 1 · 지움 2
 *
 * ── 이 파일이 못 박는 것 (PM 이 지정한 5가지) ────────────────────────────
 *   1) 대상이 ★두 칸뿐★ 이다 — preview-ask-price · preview-bid-price
 *      늘어나면 터집니다. 매수금액·매도금액·평가·보유·가능·수수료는
 *      종목과 무관하거나(잔고) 회원이 친 입력값(증거금×레버리지)이라
 *      종목이 바뀌어도 뜻이 그대로입니다. 지우면 그게 새 고장입니다.
 *   2) ★dataset 을 읽지 않는다★
 *      읽으면 js/stale-price-guard.js 와 실행 순서를 타서 누가 먼저 도느냐에
 *      결과가 달라집니다. 그게 이 설계(곧장 "-" 를 쓴다)의 이유입니다.
 *   3) js/order-info-panel.js 가 안 바뀐다 — 1초 타이머도 그대로
 *   4) index.html 의 script 한 줄 · main.js 부팅 목록의 "SymbolSwitchPriceClear"
 *   5) "-" 가 order-info-panel.js 의 setValue 가 쓰는 것과 ★같은 글자★ 인가
 *      (U+002D HYPHEN-MINUS. U+2011 · U+2212 같은 비슷한 글자로 바뀌면
 *       setValue 의 is-idle 판정과 어긋나 색이 달라집니다)
 *
 * 네트워크는 한 번도 안 씁니다. jsdom 안에서만 돕니다.
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

const SRC_REL = "js/symbol-switch-price-clear.js";
const PANEL_REL = "js/order-info-panel.js";
const src = read(SRC_REL);
const panel = read(PANEL_REL);
const html = read("index.html");
const mainjs = read("main.js");

/* 주석을 걷어낸 본문 — 주석 안에 "dataset" 이라는 낱말이 실제로 있습니다
   ("왜 dataset 을 다시 읽지 않나"). 문자열 검색만 하면 오탐이 납니다. */
function 주석제거(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((줄) => 줄.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}
const 코드 = 주석제거(src);

/* =========================================================================
 * [0] 주석 제거기가 진짜 도는가 (아래 [2] 가 이것에 기대고 있습니다)
 * ========================================================================= */
section("[0] 주석 제거기 자체 확인");
{
  ok("블록주석을 걷어낸다", 주석제거("/* dataset */ var a = 1;").indexOf("dataset") === -1);
  ok("한 줄 주석을 걷어낸다", 주석제거("var a = 1; // dataset\n").indexOf("dataset") === -1);
  ok("코드 안의 낱말은 남긴다", 주석제거("n.dataset.price;").indexOf("dataset") >= 0);
  ok(
    "원본 주석에 실제로 dataset 이 들어 있다 (오탐 위험이 진짜 있었다)",
    src.indexOf("dataset") >= 0
  );
  ok("주석을 걷어내면 코드에는 dataset 이 없다", 코드.indexOf("dataset") === -1,
    "코드에서 dataset 을 읽고 있습니다");
}

/* =========================================================================
 * [1] 파일이 실려 있는가 — 만들어 놓고 안 부르면 아무 일도 안 일어납니다
 * ========================================================================= */
section("[1] 실려 있는가");
{
  ok("js/symbol-switch-price-clear.js 가 있다", fs.existsSync(path.join(REPO, SRC_REL)));
  ok("index.html 에 script 한 줄이 있다",
    html.indexOf('<script src="js/symbol-switch-price-clear.js"></script>') >= 0);
  ok("js/order-info-panel.js 보다 뒤에 실린다",
    html.indexOf('src="js/symbol-switch-price-clear.js"') >
      html.indexOf('src="js/order-info-panel.js"'),
    "앞에 실리면 순서 의미가 흐려집니다");
  ok('main.js 부팅 목록에 "SymbolSwitchPriceClear" 가 있다',
    /"SymbolSwitchPriceClear"/.test(mainjs),
    "부팅 목록에 없으면 init() 이 안 불려 구독 자체가 안 붙습니다");
  ok("부팅 목록에서 OrderInfoPanel 바로 뒤에 온다",
    mainjs.indexOf('"OrderInfoPanel", "SymbolSwitchPriceClear"') >= 0,
    "떨어져 있으면 누가 옮긴 것입니다");
  ok("script 줄이 딱 한 번만 있다",
    html.split('src="js/symbol-switch-price-clear.js"').length - 1 === 1,
    "두 번 실리면 구독이 두 번 붙습니다");
}

/* =========================================================================
 * [2] ★대상이 두 칸뿐★ + dataset 을 안 읽는다   ← 이 봉인의 핵심
 * ========================================================================= */
section("[2] 대상 두 칸 / dataset 안 읽음");
{
  const m = 코드.match(/IDS\s*=\s*\[([^\]]*)\]/);
  ok("IDS 배열이 있다", !!m);
  const ids = m
    ? m[1].split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean)
    : [];
  ok("대상이 정확히 2개다 (지금 " + ids.length + "개)", ids.length === 2,
    JSON.stringify(ids) + " — 늘리지 마세요. 다른 칸은 종목과 무관합니다");
  ok("대상이 preview-ask-price · preview-bid-price 다",
    ids.indexOf("preview-ask-price") >= 0 && ids.indexOf("preview-bid-price") >= 0,
    JSON.stringify(ids));

  /* 건드리면 안 되는 칸들이 코드 어디에도 없어야 합니다 */
  const 금지칸 = [
    "preview-buy-amount",
    "preview-sell-amount",
    "acc-equity",
    "acc-balance-holding",
    "acc-available",
    "acc-fee-rate",
    "margin-input",
    "lev-display",
  ];
  금지칸.forEach((id) => {
    ok("코드가 " + id + " 를 건드리지 않는다", 코드.indexOf(id) === -1,
      "종목과 무관하거나 회원이 친 값입니다. 지우면 그게 새 고장입니다");
  });

  /* 아무것도 읽지 않는다 — 순서 의존을 만들지 않는 것이 이 설계의 이유 */
  ["dataset", "getAttribute", "data-price", "querySelector", "ob-asks", "ob-bids"].forEach(
    (낱말) => {
      ok("코드에 " + 낱말 + " 이(가) 없다", 코드.indexOf(낱말) === -1,
        "읽기 시작하면 stale-price-guard 와 실행 순서를 타서 결과가 달라집니다");
    }
  );
  ok("textContent 는 비교만 하고 값으로 쓰지 않는다",
    /n\.textContent\s*!==\s*EMPTY/.test(코드) && !/=\s*n\.textContent\s*;/.test(코드));
}

/* =========================================================================
 * [3] "-" 가 order-info-panel.js 의 setValue 와 같은 글자인가
 *     비슷하게 생긴 U+2010 U+2011 U+2012 U+2013 U+2212 로 바뀌면
 *     is-idle 판정(text === "-")과 어긋나 색이 달라집니다.
 * ========================================================================= */
section('[3] "-" 가 같은 글자인가');
{
  const m = 코드.match(/EMPTY\s*=\s*"([^"]*)"/);
  ok("EMPTY 를 찾았다", !!m);
  const empty = m ? m[1] : "";
  ok("EMPTY 가 한 글자다 (지금 " + empty.length + "글자)", empty.length === 1);
  ok(
    "EMPTY 가 U+002D 다 (지금 U+" + (empty.codePointAt(0) || 0).toString(16).toUpperCase() + ")",
    empty.codePointAt(0) === 0x2d,
    "‐ ‑ ‒ – − 는 다른 글자입니다"
  );

  /* order-info-panel.js 쪽이 쓰는 글자를 실제로 뽑아서 비교합니다 */
  const p1 = panel.match(/const idle = text === "([^"]*)"/);
  const p2 = panel.match(/bestAsk !== null \? plain\(bestAsk, 2\) : "([^"]*)"/);
  ok("order-info-panel.js 의 is-idle 판정 글자를 찾았다", !!p1);
  ok("order-info-panel.js 의 빈값 표시 글자를 찾았다", !!p2);
  ok("세 글자가 전부 같다",
    !!p1 && !!p2 && p1[1] === empty && p2[1] === empty,
    JSON.stringify({ 지우개: empty, isIdle판정: p1 && p1[1], 빈값표시: p2 && p2[1] }));
  ok("is-idle 클래스 이름도 같다",
    코드.indexOf('"is-idle"') >= 0 && panel.indexOf('"is-idle"') >= 0);
}

/* =========================================================================
 * [4] js/order-info-panel.js 가 안 바뀌었는가
 *     ⚠ 정당하게 고쳐야 할 이유가 생기면 여기 해시를 같이 고치고
 *       ★왜 고쳤는지★ 를 이 주석에 날짜와 함께 적으세요. 그냥 지우지 마세요.
 * ========================================================================= */
section("[4] order-info-panel.js 그대로인가");
{
  const md5 = crypto
    .createHash("md5")
    .update(fs.readFileSync(path.join(REPO, PANEL_REL)))
    .digest("hex");
  ok("js/order-info-panel.js 해시 그대로 (2026-08-28 기준)",
    md5 === "a44b32d228798c8cdf1192078af293f0",
    "지금 " + md5 + " — 이 파일을 고쳐서 해결하는 방식은 순서 의존을 만듭니다");
  ok("1초 타이머 값이 그대로다", /REFRESH_INTERVAL_MS\s*=\s*1000\b/.test(panel));
  ok("setInterval 이 그대로 살아 있다",
    /setInterval\(updatePreview,\s*REFRESH_INTERVAL_MS\)/.test(panel),
    "껐다 켜면 그게 새 고장이 됩니다");
  ok("order-info-panel.js 는 여전히 symbol:change 를 구독하지 않는다",
    panel.indexOf("symbol:change") === -1,
    "구독하면 updatePreview() 가 dataset 을 다시 읽어 옛 값이 되살아날 수 있습니다");
}

/* =========================================================================
 * [5] 실제로 도는가 — jsdom 에서 symbol:change 를 쏴 봅니다
 * ========================================================================= */
section("[5] 실제 동작");

function 버스만들기(w) {
  const listeners = {};
  w.App = {
    Bus: {
      on(e, fn) {
        (listeners[e] = listeners[e] || []).push(fn);
        return fn;
      },
      emit(e, p) {
        (listeners[e] || []).forEach((fn) => fn(p));
      },
    },
  };
  return listeners;
}

{
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      '<b id="preview-ask-price">79,674.00</b>' +
      '<b id="preview-bid-price">79,673.50</b>' +
      '<b id="preview-buy-amount">1,000,000.00</b>' +
      '<b id="preview-sell-amount">1,000,000.00</b>' +
      '<b id="acc-equity">100,000.0000</b>' +
      '<b id="acc-available">100,000.0000</b>' +
      "</body></html>",
    { runScripts: "outside-only" }
  );
  const w = dom.window;
  const listeners = 버스만들기(w);
  w.eval(src);

  const M = w.App.SymbolSwitchPriceClear;
  ok("App.SymbolSwitchPriceClear 가 만들어진다", !!M);
  ok("init / clearNow / getCounters 가 있다",
    !!M &&
      typeof M.init === "function" &&
      typeof M.clearNow === "function" &&
      typeof M.getCounters === "function");

  ok("init 전에는 아무 구독도 안 붙는다", !listeners["symbol:change"]);
  M.init();
  ok("init 하면 symbol:change 를 딱 하나 구독한다",
    !!listeners["symbol:change"] && listeners["symbol:change"].length === 1);
  ok("symbol:change 말고 다른 것은 구독하지 않는다",
    Object.keys(listeners).length === 1, JSON.stringify(Object.keys(listeners)));

  const d = w.document;
  ok("전환 전에는 옛 값이 그대로 있다",
    d.getElementById("preview-ask-price").textContent === "79,674.00");

  w.App.Bus.emit("symbol:change", { symbol: "SKHYNIX" });

  ok('매수가격이 "-" 로 바뀐다', d.getElementById("preview-ask-price").textContent === "-",
    JSON.stringify(d.getElementById("preview-ask-price").textContent));
  ok('매도가격이 "-" 로 바뀐다', d.getElementById("preview-bid-price").textContent === "-",
    JSON.stringify(d.getElementById("preview-bid-price").textContent));
  ok("두 칸에 is-idle 이 붙는다",
    d.getElementById("preview-ask-price").classList.contains("is-idle") &&
      d.getElementById("preview-bid-price").classList.contains("is-idle"));

  ok("★매수금액은 안 건드린다★",
    d.getElementById("preview-buy-amount").textContent === "1,000,000.00");
  ok("★매도금액은 안 건드린다★",
    d.getElementById("preview-sell-amount").textContent === "1,000,000.00");
  ok("★평가는 안 건드린다★", d.getElementById("acc-equity").textContent === "100,000.0000");
  ok("★가능은 안 건드린다★", d.getElementById("acc-available").textContent === "100,000.0000");

  const c = M.getCounters();
  ok("이벤트 1 · 지움 2 (PM 실측과 같다)", c.events === 1 && c.cleared === 2, JSON.stringify(c));

  /* 두 번 쏴도 이미 "-" 면 다시 세지 않습니다 */
  w.App.Bus.emit("symbol:change", { symbol: "QQQ" });
  const c2 = M.getCounters();
  ok('이미 "-" 면 다시 쓰지 않는다 (이벤트 2 · 지움 2)',
    c2.events === 2 && c2.cleared === 2, JSON.stringify(c2));

  /* 마크업을 지우지 않습니다 — 다음 1초 눈금에 다시 채워질 자리가 남아야 합니다 */
  ok("칸(노드)을 지우지 않는다",
    !!d.getElementById("preview-ask-price") && !!d.getElementById("preview-bid-price"));

  d.getElementById("preview-ask-price").textContent = "182.90";
  ok("새 값이 들어오면 그대로 남는다 (지우개가 다시 덮지 않는다)",
    d.getElementById("preview-ask-price").textContent === "182.90");

  w.close();
}

/* 칸이 아예 없는 화면(비로그인 등)에서도 안 터진다 */
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const w = dom.window;
  버스만들기(w);
  w.eval(src);
  let 터짐 = null;
  try {
    w.App.SymbolSwitchPriceClear.init();
    w.App.Bus.emit("symbol:change", { symbol: "BTCUSDT" });
  } catch (e) {
    터짐 = e;
  }
  ok("칸이 없는 화면에서도 오류가 안 난다", 터짐 === null, 터짐 && String(터짐));
  ok("칸이 없으면 지운 횟수가 0 이다",
    w.App.SymbolSwitchPriceClear.getCounters().cleared === 0);
  w.close();
}

/* App.Bus 가 아직 없을 때 init 해도 안 터진다 */
{
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const w = dom.window;
  w.App = {};
  w.eval(src);
  let 터짐 = null;
  try {
    w.App.SymbolSwitchPriceClear.init();
  } catch (e) {
    터짐 = e;
  }
  ok("App.Bus 가 없어도 init 이 조용히 끝난다", 터짐 === null, 터짐 && String(터짐));
  w.close();
}

/* =========================================================================
 * [6] 돌연변이 자체검증 — 이 봉인이 진짜 잡는가
 *     소스를 일부러 틀리게 바꾼 ★사본★ 을 메모리에서 돌립니다.
 *     디스크의 js/ 파일은 한 글자도 건드리지 않습니다.
 * ========================================================================= */
section("[6] 돌연변이 자체검증 (디스크는 안 건드립니다)");

function 돌연변이(바꾼소스) {
  const dom = new JSDOM(
    '<!doctype html><html><body><b id="preview-ask-price">79,674.00</b>' +
      '<b id="preview-bid-price">79,673.50</b>' +
      '<b id="preview-buy-amount">1,000,000.00</b></body></html>',
    { runScripts: "outside-only" }
  );
  const w = dom.window;
  버스만들기(w);
  w.eval(바꾼소스);
  w.App.SymbolSwitchPriceClear.init();
  w.App.Bus.emit("symbol:change", { symbol: "X" });
  const 결과 = {
    ask: w.document.getElementById("preview-ask-price").textContent,
    buyAmount: w.document.getElementById("preview-buy-amount").textContent,
  };
  w.close();
  return 결과;
}

{
  const 정상 = 돌연변이(src);
  ok("(대조) 원본 사본은 매수가격을 지우고 매수금액은 남긴다",
    정상.ask === "-" && 정상.buyAmount === "1,000,000.00", JSON.stringify(정상));

  /* 1) 구독을 빼면 → 옛 값이 그대로 남는다 = 이 버그가 되살아난다 */
  const 구독뺌 = src.replace('App.Bus.on("symbol:change", clearNow);', "/* 뺐음 */");
  ok("구독 한 줄을 빼면 옛 값이 그대로 남는다 (= 버그 부활을 [5] 가 잡는다)",
    구독뺌 !== src && 돌연변이(구독뺌).ask === "79,674.00",
    "여기서 안 잡히면 [5] 는 가짜입니다");

  /* 2) 대상을 늘리면 → 회원이 친 매수금액까지 지워진다 */
  const 늘림 = src.replace(
    'var IDS = ["preview-ask-price", "preview-bid-price"];',
    'var IDS = ["preview-ask-price", "preview-bid-price", "preview-buy-amount"];'
  );
  ok("대상을 하나 늘리면 매수금액까지 지워진다",
    늘림 !== src && 돌연변이(늘림).buyAmount === "-",
    "회원이 친 증거금×레버리지 값이 사라집니다");
  const 늘린개수 = 주석제거(늘림)
    .match(/IDS\s*=\s*\[([^\]]*)\]/)[1]
    .split(",")
    .filter((s) => s.trim()).length;
  ok("[2] 의 개수 검사가 3개를 잡아낸다", 늘린개수 !== 2, "지금 " + 늘린개수 + "개");

  /* 3) "-" 를 비슷한 글자로 바꾸면 [3] 이 잡는다 */
  const 다른대시 = src.replace('var EMPTY = "-";', 'var EMPTY = "−";');
  const 뽑힌 = 주석제거(다른대시).match(/EMPTY\s*=\s*"([^"]*)"/)[1];
  ok("[3] 이 U+2212(빼기표) 를 다른 글자로 잡아낸다",
    다른대시 !== src && 뽑힌.codePointAt(0) !== 0x2d);

  /* 4) dataset 을 읽기 시작하면 [2] 가 잡는다 */
  const dataset읽음 = src.replace(
    "if (n.textContent !== EMPTY) {",
    "var p = n.dataset.price;\n      if (n.textContent !== EMPTY) {"
  );
  ok("[2] 가 dataset 을 다시 읽기 시작한 것을 잡아낸다",
    dataset읽음 !== src && 주석제거(dataset읽음).indexOf("dataset") >= 0);

  /* 5) order-info-panel.js 해시 검사가 진짜 도는가 */
  ok("[4] 의 해시 검사는 한 글자만 달라도 값이 바뀐다",
    crypto.createHash("md5").update(panel + " ").digest("hex") !==
      crypto.createHash("md5").update(panel).digest("hex"));
}

/* =========================================================================
 * [7] 되돌리는 방법 · 수정 금지 12개 · 등록
 * ========================================================================= */
section("[7] 되돌리는 방법 · 수정 금지 · 등록");
{
  ok("파일에 되돌리는 방법이 적혀 있다", /되돌리려면/.test(src));

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

  const 파일명 = "tests/symbol-switch-price-clear-seal.test.js";
  let order = "";
  try {
    order = read("tests/_order.txt");
  } catch (e) {
    order = "";
  }
  ok("tests/_order.txt 에 이 파일이 등록돼 있다", order.indexOf(파일명) >= 0,
    "등록 안 하면 파일은 멀쩡한데 아무도 안 돌립니다 (2026-08-30 실제 사고)");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
