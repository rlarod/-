/* tests/stale-market-price-display.test.js
 * =========================================================================
 * [P1] 종목을 바꿔도 시장가 "주문가격" 칸에 옛 종목 숫자가 남던 것 — 2026-08-27
 * =========================================================================
 *
 * ── 무엇이 터져 있었나 (점검팀 라이브 실측) ──────────────────────────────
 *   #ami-market-price-input 은 readonly 표시 칸입니다(index.html:484).
 *   js/order-panel-amitalk.js:107 renderMarketPrice() 가 채우는데,
 *   그 함수는 trading:update 때만 돕니다(:301).
 *
 *   종목을 바꾸면 새 종목 첫 틱이 올 때까지 trading:update 가 안 옵니다.
 *   그동안 옛 종목 숫자가 그대로 화면에 남습니다.
 *
 *       1440  비트코인 → 나스닥       79,475.90 (비트코인)  11,143 ms
 *       390   삼성전자 → 비트코인        193.34 (삼성전자)   4,058 ms
 *       360   비트코인 → SK하이닉스   79,716.60 (비트코인)   4,668 ms
 *
 *   360 한 화면에 이렇게 같이 보였습니다 —
 *       주문가격 79,716.60(비트코인) · 매수가격 1,257.07(SK) · 수량단위 주(SK)
 *
 *   주의 — 돈에는 안 닿습니다. 그 시간 currentPrice 가 null 이라 주문이 막힙니다.
 *   보이는 값만 틀립니다. 그래도 회원은 그 숫자를 사실로 보고 판단합니다.
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 *   1) 전환 직후 그 칸이 "-" 로 되돌아간다 (네 종목 전부)
 *   2) 새 종목 첫 시세가 오면 새 종목 값으로 다시 채워진다
 *   3) 옛 종목 숫자가 단 한 순간도 안 남는다 (전환 ~ 첫 틱 사이 계속 확인)
 *   4) "지웠습니다" 안내가 안 붙는다 — 회원이 넣은 값이 아니라서
 *   5) 이미 "-" 면 아무것도 안 한다 (헛일 안 함)
 *   6) 스위치 한 줄을 빼면 어제와 똑같아진다(= 이 버그가 되살아난다)
 *   7) 앞서 고친 세 칸(주문가격/TP/SL)을 안 깨뜨린다
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
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* index.html 과 같은 순서 */
const LOAD_ORDER = [
  "js/config.js",
  "js/utils.js",
  "js/storage.js",
  "js/symbol-registry.js",
  "js/limit-close.js",
  "js/api.js",
  "js/symbol-guard.js",
  /* js/risk-brackets.js — 2026-08-31 대표 결재(바이낸스 구간별 유지증거금). index.html 은 risk-brackets → trading 순서라 여기도 같게 태웁니다. 안 태우면 이 테스트는 회원이 겪지 않는 옛 고정값(MMR_FALLBACK 0.5%) 경로를 재게 됩니다. */
  "js/risk-brackets.js",
  "js/trading.js",
  "js/max-margin-safe.js",   // 엔진을 감쌉니다 — 반드시 trading.js 뒤
  "js/symbol-sync-bridge.js",
  "js/symbol-stream-switch.js",
  "js/multi-symbol-view.js",
  "js/order-panel-amitalk.js",
  "js/stale-price-guard.js",
];

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () {
    this.close = () => {};
    this.send = () => {};
  };
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  win.alert = () => {};
  win.eval(
    "window.App = window.App || {};" +
      "App.Bus = (function(){ var L = {}; return {" +
      "  on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
      "  off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
      "  emit: function(e,p){ (L[e]||[]).slice().forEach(function(f){ try{ f(p); }catch(x){} }); }" +
      "}; })();" +
      "App.bootApp = function(){ return true; };" +
      "App.SupabaseClient = { get: function(){ return null; } };"
  );
  LOAD_ORDER.filter((f) => !(opts.without || []).includes(f)).forEach((f) => win.eval(read(f)));
  win.App.bootApp();
  win.App.Trading.init();
  if (win.App.AmiTalkOrderPanel && win.App.AmiTalkOrderPanel.init) win.App.AmiTalkOrderPanel.init();
  if (win.App.StalePriceGuard) win.App.StalePriceGuard.init();
  return { dom, win, App: win.App };
}

const 시세 = (App, sym, price) =>
  App.Bus.emit("price:update", { symbol: sym, price: price, time: Date.now() });

/* 종목 전환을 코드로 재현합니다 — js/symbol-stream-switch.js 가 하는 그 방송 */
function 전환(App, to) {
  const from = App.Config.getActiveSymbol();
  App.Config.getActiveSymbol = function () { return to; };
  App.Bus.emit("symbol:change", { symbol: to, from: from });
}

const 칸 = (win) => {
  const i = win.document.getElementById("ami-market-price-input");
  return i ? String(i.value) : null;
};

const 네종목 = [
  ["BTCUSDT", 78700],
  ["QQQUSDT", 717],
  ["SAMSUNGUSDT", 55],
  ["SKHYNIXUSDT", 1253.4],
];

console.log("\n[P1] 종목을 바꿔도 시장가 주문가격 칸에 옛 종목 숫자가 남던 것");

/* =========================================================================
 * [0] 칸이 실제로 존재하고, 초기값이 "-" 인가
 * ========================================================================= */
section("[0] 전제 — 칸과 초기값");
{
  const { win } = boot();
  ok("#ami-market-price-input 이 index.html 에 있다", 칸(win) !== null);
  ok("초기값이 '-' 다", 칸(win) === "-", String(칸(win)));
}

/* =========================================================================
 * [1] 네 종목 전부 — 전환하면 "-" 로 되돌아간다
 * ========================================================================= */
section("[1] 전환 직후 '-' 로 되돌아간다 (네 종목 전부)");
{
  네종목.forEach(function (목적지) {
    const to = 목적지[0];
    const 출발 = 네종목.filter((x) => x[0] !== to)[0];
    const { win, App } = boot();

    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    const 전 = 칸(win);
    ok(출발[0] + " 에서 칸이 채워졌다", 전 !== "-" && 전 !== "", String(전));

    전환(App, to);
    ok(to + " 로 바꾸면 '-' 다", 칸(win) === "-", "실제=" + String(칸(win)) + " (전환 전 " + 전 + ")");
  });
}

/* =========================================================================
 * [2] 새 종목 첫 시세가 오면 새 값으로 다시 채워진다
 *     (우리가 되돌리는 게 아니라 renderMarketPrice 가 알아서 채웁니다)
 * ========================================================================= */
section("[2] 새 종목 첫 시세가 오면 다시 채워진다");
{
  네종목.forEach(function (목적지) {
    const to = 목적지[0];
    const 가격 = 목적지[1];
    const 출발 = 네종목.filter((x) => x[0] !== to)[0];
    const { win, App } = boot();

    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    전환(App, to);
    ok(to + " — 첫 틱 전에는 '-'", 칸(win) === "-", String(칸(win)));

    시세(App, to, 가격);
    const 후 = 칸(win);
    const 숫자 = parseFloat(String(후).replace(/,/g, ""));
    ok(to + " — 첫 틱이 오면 새 종목 값이 들어온다", Math.abs(숫자 - 가격) < 0.01, "실제=" + String(후) + " 기대=" + 가격);
    ok(to + " — 잠금도 함께 풀린다", App.StalePriceGuard.isStale() === false);
  });
}

/* =========================================================================
 * [3] 옛 종목 숫자가 단 한 순간도 안 남는다
 *     전환 ~ 첫 틱 사이에 다른 일이 여러 번 일어나도 그대로여야 합니다.
 * ========================================================================= */
section("[3] 전환 ~ 첫 틱 사이 내내 옛 숫자가 안 보인다");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 79716.6);
  const 옛값 = 칸(win);
  ok("비트코인 값이 칸에 있다", 옛값.indexOf("79,716") >= 0 || 옛값.indexOf("79716") >= 0, String(옛값));

  전환(App, "SKHYNIXUSDT");

  /* 그 사이에 흔히 일어나는 일들 — 옛 종목 틱이 늦게 도착 / 스냅샷 재방송 */
  let 오염 = null;
  시세(App, "BTCUSDT", 79800.1);                              // 옛 종목 늦은 틱
  if (칸(win) !== "-") 오염 = "옛 종목 늦은 틱 뒤: " + 칸(win);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());  // 스냅샷 재방송
  if (!오염 && 칸(win) !== "-") 오염 = "스냅샷 재방송 뒤: " + 칸(win);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());
  if (!오염 && 칸(win) !== "-") 오염 = "두 번째 재방송 뒤: " + 칸(win);

  ok("전환 뒤 어느 순간에도 비트코인 숫자가 안 나온다", 오염 === null, String(오염));

  시세(App, "SKHYNIXUSDT", 1257.07);
  const 후 = 칸(win);
  ok("SK하이닉스 첫 틱이 오면 1,257 대가 들어온다", 후.indexOf("1,257") >= 0 || 후.indexOf("1257") >= 0, String(후));
}

/* =========================================================================
 * [4] "지웠습니다" 안내가 안 붙는다
 *     회원이 넣은 값이 아니고 저절로 다시 채워지므로 안내 대상이 아닙니다.
 * ========================================================================= */
section("[4] 안내 문구에 안 섞인다");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);
  전환(App, "QQQUSDT");

  const 목록 = App.StalePriceGuard.getCleared();
  ok("cleared 목록에 시장가 칸이 안 들어간다",
    목록.every((x) => x.id !== "ami-market-price-input"), JSON.stringify(목록));
  ok("회원이 아무 칸도 안 채웠으면 '지웠습니다' 안내가 아예 없다",
    App.StalePriceGuard.clearedMessage() === "", String(App.StalePriceGuard.clearedMessage()));
  ok("칸은 그래도 '-' 로 되돌아가 있다", 칸(win) === "-", String(칸(win)));
}

/* =========================================================================
 * [5] 이미 "-" 면 아무것도 안 한다
 * ========================================================================= */
section("[5] 이미 '-' 면 헛일 안 한다");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  전환(App, "QQQUSDT");                       // 시세를 받은 적이 없어 칸이 "-" 인 상태
  ok("칸이 여전히 '-'", 칸(win) === "-", String(칸(win)));
  ok("되돌린 횟수가 0 이다", App.StalePriceGuard.getCounts().resetMarketPrice === 0,
    String(App.StalePriceGuard.getCounts().resetMarketPrice));

  시세(App, "QQQUSDT", 717);
  전환(App, "BTCUSDT");
  ok("값이 있던 뒤 전환하면 횟수가 1 이 된다", App.StalePriceGuard.getCounts().resetMarketPrice === 1,
    String(App.StalePriceGuard.getCounts().resetMarketPrice));
}

/* =========================================================================
 * [6] 스위치 한 줄을 빼면 이 버그가 되살아난다
 *     (그물이 실제로 이 버그를 잡고 있다는 증거)
 * ========================================================================= */
section("[6] 가드를 빼면 옛 숫자가 그대로 남는다");
{
  const { win, App } = boot({ without: ["js/stale-price-guard.js"] });
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 79716.6);
  전환(App, "SKHYNIXUSDT");
  const 남은값 = 칸(win);
  ok("가드가 없으면 비트코인 숫자가 그대로 남는다(= 고치기 전 증상)",
    남은값 !== "-" && (남은값.indexOf("79,716") >= 0 || 남은값.indexOf("79716") >= 0), String(남은값));
}

/* =========================================================================
 * [7] 앞서 고친 세 칸을 안 깨뜨린다
 * ========================================================================= */
section("[7] 주문가격(지정가)/TP/SL 은 그대로 동작한다");
{
  const { win, App } = boot();
  const doc = win.document;

  /* js/ui.js 는 수정 금지 파일이라 여기서 태우지 않고 같은 마크업을 심습니다
     (js/ui.js:88-93, :99-112 와 동일) */
  const anchor = doc.getElementById("order-err");
  const field = doc.createElement("div");
  field.id = "limit-price-field";
  field.innerHTML = '<input type="text" id="limit-price-input">';
  anchor.parentNode.insertBefore(field, anchor);
  const row = doc.createElement("div");
  row.innerHTML = '<input type="text" id="tp-input"><input type="text" id="sl-input">';
  anchor.parentNode.insertBefore(row, anchor);

  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78758);
  doc.getElementById("limit-price-input").value = "78758";
  doc.getElementById("tp-input").value = "78900";
  doc.getElementById("sl-input").value = "78600";

  전환(App, "SKHYNIXUSDT");

  ok("지정가 주문가격 칸이 비워진다", doc.getElementById("limit-price-input").value === "");
  ok("익절가(TP) 칸이 비워진다", doc.getElementById("tp-input").value === "");
  ok("손절가(SL) 칸이 비워진다", doc.getElementById("sl-input").value === "");
  ok("시장가 주문가격 칸은 '-' 다", 칸(win) === "-", String(칸(win)));
  const msg = App.StalePriceGuard.clearedMessage();
  ok("세 칸은 '지웠습니다' 안내에 들어간다",
    msg.indexOf("주문가격") >= 0 && msg.indexOf("익절") >= 0 && msg.indexOf("손절") >= 0, msg);
  ok("안내에 시장가 칸 id 가 안 섞인다", msg.indexOf("ami-market") < 0, msg);
}

console.log("\n통과 " + pass + " / 실패 " + fail);
process.exit(fail === 0 ? 0 : 1);
