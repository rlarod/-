/* tests/stale-price-guard.test.js
 * =========================================================================
 * [P1] 종목을 바꾼 직후 매수하면 옛 종목 가격으로 체결되던 것 — 2026-08-27
 * =========================================================================
 *
 * ── 무엇이 터져 있었나 (본부장 라이브 실측) ──────────────────────────────
 *       SK하이닉스 화면            currentPrice = 1253.4
 *       비트코인 전환 1.2초 뒤      BTCUSDT · currentPrice = 1253.4  ← 그대로
 *       비트코인 전환 3.2초 뒤      BTCUSDT · currentPrice = 1253.4  ← 여전히
 *
 *   js/trading.js:671-672 는 price:update · funding:update 둘만 구독합니다.
 *   symbol:change 를 안 봐서 currentPrice 가 영영 안 비워집니다.
 *   js/trading.js:132 가 그 값을 그대로 진입가로 씁니다(:117-122 에 종목 확인 없음).
 *
 *   조사팀 재현 — 비트코인 전환 직후 롱
 *       진입가 1,250.3 · 수량 79.98 BTC
 *       비트코인 첫 틱 78,700 → 미실현손익 +6,194,489 USDT (증거금 10,000 의 619배)
 *   반대 방향이면 첫 틱에 강제청산(증거금 전액 손실).
 *   청산하면 실현손익이 되어 랭킹·계급에 그대로 들어갑니다.
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 *   1) 전환 직후 시장가 매수·매도가 막힌다 (네 종목 전부)
 *   2) 지정가 주문도 막힌다
 *   3) 조용히 막지 않는다 — 버튼이 잠기고 이유가 화면에 보인다
 *   4) ± 스텝 버튼 · Last 버튼이 옛 가격을 안 채운다
 *   5) 새 종목 첫 시세가 오면 풀린다 (타이머가 아니라 시세로)
 *   6) ⭐ 정상 상태에서는 예전과 똑같이 주문된다
 *   7) 스위치 한 줄을 빼면 어제와 똑같아진다(= 이 버그가 되살아난다)
 *   8) 방금 만든 다종목 묶음을 안 깨뜨린다
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
  win.alert = (m) => {
    win.__lastAlert = m;
  };
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
  if (win.App.SymbolStreamSwitch && win.App.SymbolStreamSwitch.init) win.App.SymbolStreamSwitch.init();
  if (win.App.StalePriceGuard) win.App.StalePriceGuard.init();
  return { dom, win, App: win.App };
}

const 시세 = (App, sym, price) => App.Bus.emit("price:update", { symbol: sym, price: price, time: Date.now() });

/* 지정가 주문가격 칸은 js/ui.js 가 init() 에서 만듭니다(수정 금지 파일이라 여기서
   태우지 않습니다). js/ui.js:88-93 과 같은 마크업을 그대로 심어 대신합니다. */
function 지정가칸만들기(win) {
  const anchor = win.document.getElementById("order-err");
  if (!anchor || !anchor.parentNode) return null;
  const field = win.document.createElement("div");
  field.className = "field";
  field.id = "limit-price-field";
  field.innerHTML =
    '<div class="field-label"><span>지정가</span></div>' +
    '<div class="margin-input-wrap">' +
    '<input type="text" inputmode="numeric" id="limit-price-input" placeholder="주문 가격">' +
    '<span id="limit-price-unit-label">USDT</span>' +
    "</div>";
  anchor.parentNode.insertBefore(field, anchor);
  return win.document.getElementById("limit-price-input");
}

/* 익절가(TP)·손절가(SL) 칸도 js/ui.js:99-112 가 init() 에서 만듭니다.
   수정 금지 파일이라 여기서 태우지 않고 같은 마크업을 심어 대신합니다. */
function TPSL칸만들기(win) {
  const anchor = win.document.getElementById("order-err");
  if (!anchor || !anchor.parentNode) return null;
  const row = win.document.createElement("div");
  row.className = "tp-sl-row";
  row.innerHTML =
    '<div class="field"><div class="field-label"><span>익절가(TP)</span></div>' +
    '<div class="margin-input-wrap">' +
    '<input type="text" inputmode="numeric" id="tp-input" placeholder="익절가(TP)">' +
    '<span id="tp-unit-label">USDT</span></div></div>' +
    '<div class="field"><div class="field-label"><span>손절가(SL)</span></div>' +
    '<div class="margin-input-wrap">' +
    '<input type="text" inputmode="numeric" id="sl-input" placeholder="손절가(SL)">' +
    '<span id="sl-unit-label">USDT</span></div></div>';
  anchor.parentNode.insertBefore(row, anchor);
  return { tp: win.document.getElementById("tp-input"), sl: win.document.getElementById("sl-input") };
}

/* js/ui.js:698-699 getOptionalPrice 와 같은 판정 (빈 칸이거나 이상값이면 null) */
function 칸값(input) {
  const v = String(input.value || "").trim();
  if (!v) return null;
  const n = parseFloat(v.replace(/,/g, ""));
  return isFinite(n) && n > 0 ? n : null;
}

/* 종목 전환을 코드로 재현합니다 — js/symbol-stream-switch.js 가 하는 그 방송 */
function 전환(App, to) {
  const from = App.Config.getActiveSymbol();
  App.Config.getActiveSymbol = function () { return to; };
  App.Bus.emit("symbol:change", { symbol: to, from: from });
}

const 네종목 = [
  ["BTCUSDT", 78700],
  ["QQQUSDT", 717],
  ["SAMSUNGUSDT", 55],
  ["SKHYNIXUSDT", 1253.4],
];

console.log("\n[P1] 종목 바꾼 직후 매수하면 옛 종목 가격으로 체결되던 것");

/* =========================================================================
 * [1] 네 종목 전부 — 전환 직후 시장가 주문이 막힌다
 * ========================================================================= */
section("[1] 전환 직후 시장가 주문 (네 종목 전부)");
{
  네종목.forEach(function (목적지) {
    const [to] = 목적지;
    const 출발 = 네종목.find((x) => x[0] !== to);
    const { App } = boot();

    /* 출발 종목에서 시세를 받아 currentPrice 를 채웁니다 */
    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    App.Trading.setLeverage(10);
    ok(출발[0] + " 에서 현재가가 채워졌다", App.Trading.getSnapshot().currentPrice === 출발[1], String(App.Trading.getSnapshot().currentPrice));

    전환(App, to);

    const r = App.Trading.openPosition("long", 1000);
    ok(to + " 로 바꾼 직후 매수가 막힌다", r.ok === false, JSON.stringify(r));
    ok(to + " — 포지션이 안 생겼다", App.Trading.getSnapshot().position === null);
    ok(to + " — 이유를 알려준다", typeof r.error === "string" && r.error.indexOf("시세를 받는 중") >= 0, String(r.error));
  });
}

/* =========================================================================
 * [2] 막지 않았다면 얼마나 터졌을까 — 옛 값이 실제로 남아 있는지 확인
 * ========================================================================= */
section("[2] 옛 종목 가격이 실제로 남아 있다 (엔진 내부는 그대로)");
{
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  ok("SK하이닉스 현재가 1253.4", App.Trading.getSnapshot().currentPrice === 1253.4);

  전환(App, "BTCUSDT");
  ok("전환 뒤 종목은 BTCUSDT", App.Config.getActiveSymbol() === "BTCUSDT");
  ok("⭐ 바깥에서 보이는 현재가는 null 이 된다(부팅 직후와 같은 상태)",
    App.Trading.getSnapshot().currentPrice === null, String(App.Trading.getSnapshot().currentPrice));
  ok("막는 창이 열려 있다", App.StalePriceGuard.isStale() === true);
  ok("무슨 종목을 기다리는지 안다", App.StalePriceGuard.getWaitingFor() === "BTCUSDT", String(App.StalePriceGuard.getWaitingFor()));

  /* 스위치를 잠깐 끄면 옛 값이 그대로 보입니다 = 버그가 실재한다는 증거 */
  App.StalePriceGuard._close();
  ok("막지 않으면 옛 종목 가격 1253.4 가 그대로 나온다(버그 실재 확인)",
    App.Trading.getSnapshot().currentPrice === 1253.4, String(App.Trading.getSnapshot().currentPrice));
}

/* =========================================================================
 * [3] 지정가 주문도 막힌다
 * ========================================================================= */
section("[3] 지정가 주문");
{
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  App.Trading.setLeverage(10);
  전환(App, "BTCUSDT");

  const r = App.Trading.placeLimitOrder("short", 1250, 1000);
  ok("전환 직후 지정가 주문이 막힌다", r.ok === false, JSON.stringify(r));
  ok("미체결 주문이 안 생겼다", App.Trading.getSnapshot().pendingOrder === null);
  ok("막은 지정가 건수가 센다", App.StalePriceGuard.getCounts().blockedLimit === 1, String(App.StalePriceGuard.getCounts().blockedLimit));

  /* 만약 걸렸다면 78,700 첫 틱에 1,250 으로 즉시 체결됐을 상황입니다 */
  시세(App, "BTCUSDT", 78700);
  ok("첫 틱이 와도 잘못된 지정가 체결이 없다", App.Trading.getSnapshot().position === null);
}

/* =========================================================================
 * [4] ⛔ 조용히 막지 않는다 — 버튼과 안내
 * ========================================================================= */
section("[4] 회원에게 무엇이 보이나");
{
  const { App, win } = boot();
  const btnLong = win.document.getElementById("btn-long");
  const btnShort = win.document.getElementById("btn-short");
  const notice = () => win.document.getElementById(App.StalePriceGuard.NOTICE_ID);

  ok("평소에는 매수 버튼을 누를 수 있다", btnLong.disabled === false);
  ok("평소에는 안내가 안 보인다", !notice() || notice().style.display === "none");

  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  전환(App, "BTCUSDT");

  ok("매수 버튼이 잠긴다", btnLong.disabled === true);
  ok("매도 버튼도 잠긴다", btnShort.disabled === true);
  ok("안내가 보인다", notice() && notice().style.display !== "none");
  ok("안내에 종목 이름이 한글로 나온다", notice() && notice().textContent.indexOf("비트코인") >= 0, notice() ? notice().textContent : "(없음)");
  ok("안내에 무엇을 기다리는지 적혀 있다", notice() && notice().textContent.indexOf("시세를 받는 중") >= 0, notice() ? notice().textContent : "(없음)");
  console.log("      └ 회원이 보는 문구: " + (notice() ? notice().textContent : "(없음)"));

  /* 빨강은 손익 표시에만 — 확정 팔레트 */
  ok("안내에 빨강(#F0506E)을 쓰지 않는다", notice() && notice().style.cssText.indexOf("F0506E") < 0);
  ok("주문 오류 칸(#order-err)을 뺏어 쓰지 않는다", win.document.getElementById("order-err").textContent === "");

  시세(App, "BTCUSDT", 78700);
  ok("시세가 오면 매수 버튼이 풀린다", btnLong.disabled === false);
  ok("시세가 오면 매도 버튼도 풀린다", btnShort.disabled === false);
  ok("시세가 오면 안내가 사라진다", notice().style.display === "none");
}

/* =========================================================================
 * [5] ± 스텝 버튼 · Last 버튼이 옛 가격을 안 채운다
 * ========================================================================= */
section("[5] 지정가 칸을 채우는 두 곳");
{
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);

  /* 두 곳 모두 App.Trading.getSnapshot().currentPrice 를 읽습니다
     (js/order-panel-amitalk.js:83 · js/qty-price-order.js:58,94) */
  const 읽기 = () => {
    const snap = App.Trading.getSnapshot();
    return snap && snap.currentPrice ? snap.currentPrice : null;
  };
  ok("평소에는 현재가를 읽어 온다", 읽기() === 1253.4, String(읽기()));

  전환(App, "BTCUSDT");
  ok("⭐ 전환 직후에는 null 이라 ± 가 아무것도 안 채운다", 읽기() === null, String(읽기()));
  ok("⭐ Last 버튼도 채울 값이 없다", 읽기() === null, String(읽기()));

  시세(App, "BTCUSDT", 78700);
  ok("시세가 오면 새 종목 가격을 채운다", 읽기() === 78700, String(읽기()));

  /* 두 파일이 정말 그 값을 읽는지 소스로 못 박습니다 */
  ok("js/order-panel-amitalk.js 가 스냅샷 현재가를 읽는다", /getSnapshot\(\)[\s\S]{0,120}currentPrice/.test(read("js/order-panel-amitalk.js")));
  ok("js/qty-price-order.js 도 스냅샷 현재가를 읽는다", /getSnapshot\(\)[\s\S]{0,120}currentPrice/.test(read("js/qty-price-order.js")));
  ok("js/order-panel-amitalk.js 는 값이 없으면 아무것도 안 한다", /if \(base === null\) return;/.test(read("js/order-panel-amitalk.js")));
}

/* =========================================================================
 * [6] 언제 풀리나 — 타이머가 아니라 "새 종목 첫 시세"
 * ========================================================================= */
section("[6] 풀리는 조건");
{
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  전환(App, "BTCUSDT");

  시세(App, "SKHYNIXUSDT", 1300);
  ok("옛 종목 시세가 더 와도 안 풀린다", App.StalePriceGuard.isStale() === true);
  시세(App, "SAMSUNGUSDT", 55);
  ok("엉뚱한 종목 시세로도 안 풀린다", App.StalePriceGuard.isStale() === true);

  시세(App, "BTCUSDT", 78700);
  ok("새 종목 첫 시세에 풀린다", App.StalePriceGuard.isStale() === false);
  ok("창이 열려 있던 시간이 기록된다", App.StalePriceGuard.getCounts().lastWindowMs >= 0);

  /* 시세가 영영 안 오면 계속 잠겨 있어야 합니다(안전한 쪽) */
  const b = boot();
  b.App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(b.App, "SKHYNIXUSDT", 1253.4);
  전환(b.App, "BTCUSDT");
  for (let i = 0; i < 50; i++) 시세(b.App, "SKHYNIXUSDT", 1253.4 + i);
  ok("새 종목 시세가 안 오면 계속 잠겨 있다(타이머로 안 풂)", b.App.StalePriceGuard.isStale() === true);
  ok("그동안 주문도 계속 막힌다", b.App.Trading.openPosition("long", 1000).ok === false);
}

/* =========================================================================
 * [7] ⭐ 정상 상태에서는 예전과 똑같이 주문된다 (제일 중요)
 * ========================================================================= */
section("[7] 정상 주문이 예전과 똑같다");
{
  네종목.forEach(function (pair) {
    const [sym, price] = pair;
    const { App } = boot();
    App.Config.getActiveSymbol = function () { return sym; };
    시세(App, sym, price);
    App.Trading.setLeverage(10);

    ok(sym + " — 막는 창이 안 열려 있다", App.StalePriceGuard.isStale() === false);
    const r = App.Trading.openPosition("long", 1000);
    ok(sym + " — 시장가 매수가 된다", r.ok === true, JSON.stringify(r));
    const pos = App.Trading.getSnapshot().position;
    ok(sym + " — 진입가가 그 종목 가격이다", pos && pos.entry === price, pos ? String(pos.entry) : "(없음)");
    ok(sym + " — 수량이 맞다", pos && Math.abs(pos.qty - (1000 * 10) / price) < 1e-9, pos ? String(pos.qty) : "-");
  });

  /* 전환 → 시세 도착 → 그 뒤 주문은 정상 */
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  App.Trading.setLeverage(10);
  전환(App, "BTCUSDT");
  시세(App, "BTCUSDT", 78700);
  const r = App.Trading.openPosition("long", 1000);
  ok("전환 뒤 시세가 오고 나면 정상 주문된다", r.ok === true, JSON.stringify(r));
  ok("⭐ 진입가가 새 종목 가격 78,700 이다", App.Trading.getSnapshot().position.entry === 78700, String(App.Trading.getSnapshot().position.entry));

  /* 지정가도 */
  const b = boot();
  b.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(b.App, "BTCUSDT", 78700);
  b.App.Trading.setLeverage(10);
  const r2 = b.App.Trading.placeLimitOrder("long", 70000, 1000);
  ok("정상 상태에서 지정가 주문도 된다", r2.ok === true, JSON.stringify(r2));
}

/* =========================================================================
 * [8] 호가창에 남은 옛 종목 값 지우기 (조사팀 [A])
 * ========================================================================= */
section("[8] 매수가격·매도가격 칸");
{
  const { App, win } = boot();
  const asks = win.document.getElementById("ob-asks");
  const bids = win.document.getElementById("ob-bids");
  ok("호가 칸이 index.html 에 있다", !!asks && !!bids);

  /* js/orderbook.js 가 만드는 것과 같은 모양으로 행을 심습니다 */
  [asks, bids].forEach(function (box) {
    const row = win.document.createElement("div");
    row.dataset.price = "1253.4";
    box.appendChild(row);
  });
  ok("옛 종목 값이 dataset 에 들어 있다", asks.children[0].dataset.price === "1253.4");

  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  전환(App, "BTCUSDT");

  ok("전환하면 매도호가 dataset 이 지워진다", asks.children[0].dataset.price === undefined, String(asks.children[0].dataset.price));
  ok("전환하면 매수호가 dataset 도 지워진다", bids.children[0].dataset.price === undefined, String(bids.children[0].dataset.price));
  ok("지운 행 수가 센다", App.StalePriceGuard.getCounts().clearedRows === 2, String(App.StalePriceGuard.getCounts().clearedRows));

  /* js/order-info-panel.js 가 그 값을 읽어 "-" 로 떨어지는 구조인지 소스로 확인 */
  const oip = read("js/order-info-panel.js");
  ok("js/order-info-panel.js 는 dataset.price 가 없으면 안 읽는다", /if \(last && last\.dataset\.price\)/.test(oip) && /if \(first && first\.dataset\.price\)/.test(oip));
  ok("js/orderbook.js 도 없으면 안전하게 빠진다", read("js/orderbook.js").indexOf("if (!row || !row.dataset.price) return;") >= 0, "js/orderbook.js:241 bindRowClicks");
}

/* =========================================================================
 * [8-2] 🔴 지정가 주문가격 칸 — 옛 종목 가격이 남으면 안 됩니다
 * =========================================================================
 * 점검팀 라이브(1440) — 비트코인에서 Last 로 78,758 을 채우고 SK하이닉스로 전환
 *     +1.5초 / +5.5초 / +15.5초   주문가격 78,758.00 그대로 (62.9배)
 * 시세 잠금은 약 4초 뒤 풀리는데 칸의 값은 안 풀려서, 위험 창이 무기한이었습니다.
 *
 * ⭐ 체결가가 지정가인지 시장가인지 — js/trading.js:279 가 답입니다.
 *     const fillPrice = order.price;   ← 지정가 "그대로"
 *   아래에서 숫자로 확인합니다(시장가로 안 바뀝니다).
 * ========================================================================= */
section("[8-2] 지정가 주문가격 칸");
{
  /* --- (1) 막는 것이 없으면 어떻게 되는가 = 이 P1 의 실체 --- */
  const 없이 = boot({ without: ["js/stale-price-guard.js"] });
  없이.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(없이.App, "BTCUSDT", 78758);
  없이.App.Trading.setLeverage(10);
  전환(없이.App, "SKHYNIXUSDT");
  const r0 = 없이.App.Trading.placeLimitOrder("long", 78758, 1000);
  ok("막는 것이 없으면 옛 가격 지정가가 그대로 접수된다", r0.ok === true, JSON.stringify(r0));
  시세(없이.App, "SKHYNIXUSDT", 1253.2);
  const t0 = 없이.App.Trading.getSnapshot().closedTrades[0];
  ok("⭐ 체결가가 '지정가 그대로' 다 (시장가 아님)", t0 && t0.entry === 78758, t0 ? String(t0.entry) : "(미체결)");
  ok("⭐ 같은 틱에 강제청산된다", t0 && t0.reason === "강제청산", t0 ? String(t0.reason) : "-");
  ok("⭐ 증거금 전액을 잃는다", t0 && Math.round(t0.pnl) === -1000, t0 ? String(Math.round(t0.pnl)) : "-");
  if (t0) {
    console.log("      └ 지정가 78,758 → 진입가 " + t0.entry + " → " + t0.reason +
      " → 손익 " + Math.round(t0.pnl).toLocaleString("ko-KR") + " USDT (SK하이닉스 실제가 1,253.2)");
  }

  /* --- (2) 고친 뒤 — 종목이 바뀌면 칸이 비워집니다 --- */
  네종목.forEach(function (목적지) {
    const [to] = 목적지;
    const 출발 = 네종목.find((x) => x[0] !== to);
    const { App, win } = boot();
    const input = 지정가칸만들기(win);
    if (!input) { ok(to + " — 지정가 칸을 만들었다", false, "#order-err 가 없습니다"); return; }

    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    input.value = String(출발[1]);           // 회원이 Last 로 채워둔 상태
    ok(to + " — 전환 전에는 옛 종목 가격이 들어 있다", input.value === String(출발[1]), input.value);

    전환(App, to);
    ok(to + " — 전환하면 주문가격 칸이 비워진다", input.value === "", "남은 값: " + input.value);
    ok(to + " — 무엇을 지웠는지 기억한다", App.StalePriceGuard.getClearedPrice() === String(출발[1]), String(App.StalePriceGuard.getClearedPrice()));
  });

  /* --- (3) 조용히 지우지 않는다 --- */
  const { App, win } = boot();
  const input = 지정가칸만들기(win);
  const notice = () => win.document.getElementById(App.StalePriceGuard.NOTICE_ID);
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78758);
  input.value = "78758";
  전환(App, "SKHYNIXUSDT");

  ok("왜 비었는지 안내가 나온다", notice() && notice().textContent.indexOf("주문가격") >= 0, notice() ? notice().textContent : "(없음)");
  ok("지운 값이 안내에 그대로 적힌다", notice().textContent.indexOf("78758") >= 0, notice().textContent);
  ok("바뀐 종목 이름이 한글로 나온다", notice().textContent.indexOf("SK하이닉스") >= 0, notice().textContent);
  console.log("      └ 회원이 보는 문구: " + notice().textContent.replace(/s+/g, " "));

  /* --- (4) 시세가 와서 잠금이 풀려도 안내는 남는다 (칸이 왜 비었는지) --- */
  시세(App, "SKHYNIXUSDT", 1253.2);
  ok("시세가 와서 잠금은 풀린다", App.StalePriceGuard.isStale() === false);
  ok("주문 버튼도 풀린다", win.document.getElementById("btn-long").disabled === false);
  ok("⭐ 칸이 왜 비었는지는 계속 보인다", notice().style.display !== "none" && notice().textContent.indexOf("주문가격") >= 0, notice().textContent);
  ok("칸은 여전히 비어 있다", input.value === "");

  /* --- (5) 회원이 다시 입력하면 안내가 사라진다 --- */
  input.value = "1250";
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  ok("다시 입력하면 안내가 사라진다", notice().style.display === "none", notice().textContent);
  ok("입력한 값은 그대로 남는다", input.value === "1250", input.value);

  /* --- (6) 고친 뒤에는 옛 가격 지정가가 애초에 안 만들어진다 --- */
  const c = boot();
  c.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(c.App, "BTCUSDT", 78758);
  c.App.Trading.setLeverage(10);
  const ci = 지정가칸만들기(c.win);
  ci.value = "78758";
  전환(c.App, "SKHYNIXUSDT");
  시세(c.App, "SKHYNIXUSDT", 1253.2);
  ok("잠금이 풀린 뒤에도 칸이 비어 있어 옛 가격으로 주문할 수 없다", ci.value === "", ci.value);
  ok("그 사이 포지션도 미체결도 안 생겼다",
    c.App.Trading.getSnapshot().position === null && c.App.Trading.getSnapshot().pendingOrder === null);

  /* --- (7) 빈 칸이면 아무 일도 안 한다 (괜히 안내를 띄우지 않음) --- */
  const e = boot();
  e.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(e.App, "BTCUSDT", 78758);
  전환(e.App, "SAMSUNGUSDT");
  ok("칸이 원래 비어 있었으면 '지웠다' 안내를 안 띄운다", e.App.StalePriceGuard.getClearedPrice() === null);
  ok("비운 횟수도 안 늘어난다", e.App.StalePriceGuard.getCounts().clearedLimitPrice === 0, String(e.App.StalePriceGuard.getCounts().clearedLimitPrice));
}

/* =========================================================================
 * [8-4] 🔴 익절가(TP)·손절가(SL) 칸 — 옛 종목 가격이 남으면 안 됩니다
 * =========================================================================
 * [P2 조용한 고장] 2026-08-27 본부장 배정.
 *
 *   비트코인(78,758) 화면에서 TP 78,900 / SL 78,600 을 채워두고
 *   SK하이닉스로 전환 → 매수
 *       진입가  1,253.2   (정상)
 *       tp      78,900    ← 남습니다. 롱인데 실제가 1,253 이라 영영 도달 못 함
 *       sl      null      ← 방향이 안 맞아 걸러집니다
 *
 * 즉시 청산은 안 납니다. 대신 "익절을 걸어뒀는데 영영 안 걸리는" 조용한
 * 고장이 남습니다. 회원은 익절이 걸려 있다고 믿고 판단합니다.
 * ========================================================================= */
section("[8-4] 익절가(TP)·손절가(SL) 칸");
{
  /* --- (1) 막는 것이 없으면 어떻게 되는가 = 이 P2 의 실체 --- */
  const 없이 = boot({ without: ["js/stale-price-guard.js"] });
  const f0 = TPSL칸만들기(없이.win);
  없이.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(없이.App, "BTCUSDT", 78758);
  없이.App.Trading.setLeverage(10);
  f0.tp.value = "78900";
  f0.sl.value = "78600";
  전환(없이.App, "SKHYNIXUSDT");
  시세(없이.App, "SKHYNIXUSDT", 1253.2);
  ok("막는 것이 없으면 TP 칸에 옛 종목 가격이 남는다", f0.tp.value === "78900", f0.tp.value);
  ok("막는 것이 없으면 SL 칸에도 남는다", f0.sl.value === "78600", f0.sl.value);
  const r0 = 없이.App.Trading.openPosition("long", 1000, 칸값(f0.tp), 칸값(f0.sl));
  const p0 = 없이.App.Trading.getSnapshot().position;
  ok("주문 자체는 정상 진입가로 들어간다 (즉시 청산이 아니다)",
    r0.ok === true && p0 && p0.entry === 1253.2, p0 ? String(p0.entry) : JSON.stringify(r0));
  ok("⭐ 그런데 tp 에 옛 종목 가격이 그대로 걸린다", p0 && p0.tp === 78900, p0 ? String(p0.tp) : "-");
  ok("sl 은 방향이 안 맞아 걸러진다", p0 && p0.sl === null, p0 ? String(p0.sl) : "-");
  if (p0 && p0.tp) {
    console.log("      └ 진입 " + p0.entry + " · tp " + p0.tp + " = 실제가의 " +
      (p0.tp / p0.entry).toFixed(1) + "배. 롱이라 영영 도달 못 하는 죽은 익절입니다");
  }

  /* --- (2) 고친 뒤 — 네 종목 전부 두 칸이 비워집니다 --- */
  네종목.forEach(function (목적지) {
    const to = 목적지[0];
    const 출발 = 네종목.find((x) => x[0] !== to);
    const { App, win } = boot();
    const f = TPSL칸만들기(win);
    if (!f) { ok(to + " — TP/SL 칸을 만들었다", false, "#order-err 가 없습니다"); return; }
    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    f.tp.value = String(출발[1] * 1.01);
    f.sl.value = String(출발[1] * 0.99);
    전환(App, to);
    ok(to + " — 전환하면 TP 칸이 비워진다", f.tp.value === "", "남은 값: " + f.tp.value);
    ok(to + " — 전환하면 SL 칸이 비워진다", f.sl.value === "", "남은 값: " + f.sl.value);
    ok(to + " — 무엇을 지웠는지 기억한다",
      App.StalePriceGuard.getClearedTp() !== null && App.StalePriceGuard.getClearedSl() !== null,
      String(App.StalePriceGuard.getClearedTp()) + " / " + String(App.StalePriceGuard.getClearedSl()));
  });

  /* --- (3) 고친 뒤에는 죽은 익절이 안 걸린다 --- */
  const c = boot();
  const fc = TPSL칸만들기(c.win);
  c.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(c.App, "BTCUSDT", 78758);
  c.App.Trading.setLeverage(10);
  fc.tp.value = "78900";
  fc.sl.value = "78600";
  전환(c.App, "SKHYNIXUSDT");
  시세(c.App, "SKHYNIXUSDT", 1253.2);
  const rc = c.App.Trading.openPosition("long", 1000, 칸값(fc.tp), 칸값(fc.sl));
  const pc = c.App.Trading.getSnapshot().position;
  ok("⭐ 고친 뒤에는 tp 가 안 걸린다", pc && pc.tp === null, pc ? String(pc.tp) : JSON.stringify(rc));
  ok("진입가는 그대로 정상이다", pc && pc.entry === 1253.2, pc ? String(pc.entry) : "-");

  /* --- (4) ⛔ 조용히 지우지 않는다 --- */
  const { App, win } = boot();
  const f = TPSL칸만들기(win);
  const notice = () => win.document.getElementById(App.StalePriceGuard.NOTICE_ID);
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78758);
  f.tp.value = "78900";
  f.sl.value = "78600";
  전환(App, "SKHYNIXUSDT");
  ok("왜 비었는지 안내가 나온다", notice() && notice().style.display !== "none");
  ok("익절가라고 적힌다", notice().textContent.indexOf("익절가(TP) 78900") >= 0, notice().textContent);
  ok("손절가도 같이 적힌다", notice().textContent.indexOf("손절가(SL) 78600") >= 0, notice().textContent);
  ok("바뀐 종목 이름이 한글로 나온다", notice().textContent.indexOf("SK하이닉스") >= 0, notice().textContent);
  console.log("      └ 회원이 보는 문구: " + notice().textContent);

  /* --- (5) 시세가 와서 잠금이 풀려도 안내는 남는다 --- */
  시세(App, "SKHYNIXUSDT", 1253.2);
  ok("잠금은 풀린다", App.StalePriceGuard.isStale() === false);
  ok("칸이 왜 비었는지는 계속 보인다",
    notice().style.display !== "none" && notice().textContent.indexOf("익절가") >= 0, notice().textContent);

  /* --- (6) 다시 입력하면 그 칸 안내만 사라진다 --- */
  f.tp.value = "1300";
  f.tp.dispatchEvent(new win.Event("input", { bubbles: true }));
  ok("TP 를 다시 넣으면 TP 안내가 사라진다", notice().textContent.indexOf("익절가") < 0, notice().textContent);
  ok("⭐ 아직 안 채운 SL 안내는 남는다", notice().textContent.indexOf("손절가(SL) 78600") >= 0, notice().textContent);
  ok("다시 넣은 값은 그대로 남는다", f.tp.value === "1300", f.tp.value);
  f.sl.value = "1200";
  f.sl.dispatchEvent(new win.Event("input", { bubbles: true }));
  ok("둘 다 채우면 안내가 완전히 사라진다", notice().style.display === "none", notice().textContent);

  /* --- (7) 호가창을 눌러 TP 를 채우는 경로도 같은 문을 지납니다 --- */
  const obSrc = read("js/orderbook.js");
  ok("호가창 클릭은 tp-input 을 채우고 input 을 쏜다 (js/orderbook.js:242)",
    obSrc.indexOf('el("tp-input")') >= 0 && obSrc.indexOf('tpInput.dispatchEvent(new Event("input", { bubbles: true }))') >= 0);

  /* --- (8) 빈 칸이면 아무 일도 안 한다 --- */
  const e = boot();
  TPSL칸만들기(e.win);
  e.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(e.App, "BTCUSDT", 78758);
  전환(e.App, "SAMSUNGUSDT");
  ok("칸이 원래 비어 있었으면 지웠다는 안내를 안 띄운다",
    e.App.StalePriceGuard.getClearedTp() === null && e.App.StalePriceGuard.getClearedSl() === null);
  ok("비운 횟수도 안 늘어난다", e.App.StalePriceGuard.getCounts().clearedFields === 0,
    String(e.App.StalePriceGuard.getCounts().clearedFields));

  /* --- (9) 세 칸이 다 차 있으면 한 줄로 모아서 보여준다 --- */
  const g = boot();
  const gl = 지정가칸만들기(g.win);
  const gf = TPSL칸만들기(g.win);
  g.App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(g.App, "BTCUSDT", 78758);
  gl.value = "78758"; gf.tp.value = "78900"; gf.sl.value = "78600";
  전환(g.App, "SKHYNIXUSDT");
  ok("세 칸이 다 비워진다", gl.value === "" && gf.tp.value === "" && gf.sl.value === "",
    gl.value + " / " + gf.tp.value + " / " + gf.sl.value);
  ok("세 칸이 순서대로 한 줄에 적힌다",
    g.App.StalePriceGuard.clearedMessage().indexOf("주문가격 78758 · 익절가(TP) 78900 · 손절가(SL) 78600") >= 0,
    g.App.StalePriceGuard.clearedMessage());
  ok("비운 칸 수를 센다", g.App.StalePriceGuard.getCounts().clearedFields === 3,
    String(g.App.StalePriceGuard.getCounts().clearedFields));
  console.log("      └ 세 칸 다 찼을 때: " + g.App.StalePriceGuard.clearedMessage());
}

/* =========================================================================
 * [8-3] 가격 단위 라벨 — 종목이 아니라 표시통화를 따릅니다 (정상)
 * =========================================================================
 * 바이낸스 exchangeInfo 실측(2026-08-27) — 네 종목 모두 quoteAsset 이 USDT 입니다.
 *     BTCUSDT      quoteAsset USDT  baseAsset BTC       PERPETUAL
 *     QQQUSDT      quoteAsset USDT  baseAsset QQQ       TRADIFI_PERPETUAL
 *     SAMSUNGUSDT  quoteAsset USDT  baseAsset SAMSUNG   TRADIFI_PERPETUAL
 *     SKHYNIXUSDT  quoteAsset USDT  baseAsset SKHYNIX   TRADIFI_PERPETUAL
 * 그러니 "가격" 단위는 종목이 바뀌어도 USDT 가 맞습니다. 종목마다 달라지는 것은
 * "수량" 단위(BTC / 주)뿐입니다. 고치지 않습니다.
 * ========================================================================= */
section("[8-3] 가격 단위 라벨 (정상 — 고치지 않음)");
{
  const ui = read("js/ui.js");
  ok("가격 단위 라벨은 표시통화를 따라간다(js/ui.js:613)",
    read("js/ui.js").indexOf("if (dom.limitPriceUnitLabel) dom.limitPriceUnitLabel.textContent = label;") >= 0,
    "표시통화(USDT/원)를 따라가는 것이 맞습니다");
  ok("수량 단위만 종목을 따라간다(js/utils.js qtyUnit)", read("js/utils.js").indexOf("function qtyUnit(symbol)") >= 0);
  ok("우리는 가격 단위 라벨을 건드리지 않는다", read("js/stale-price-guard.js").indexOf("limit-price-unit-label") < 0);
}

/* =========================================================================
 * [9] 스위치 한 줄을 빼면 어제 그대로 (= 이 버그가 되살아난다)
 * ========================================================================= */
section("[9] js/stale-price-guard.js 를 빼면");
{
  const { App } = boot({ without: ["js/stale-price-guard.js"] });
  ok("App.StalePriceGuard 가 아예 없다", typeof App.StalePriceGuard === "undefined");

  App.Config.getActiveSymbol = function () { return "SKHYNIXUSDT"; };
  시세(App, "SKHYNIXUSDT", 1253.4);
  App.Trading.setLeverage(10);
  전환(App, "BTCUSDT");

  const r = App.Trading.openPosition("long", 1000);
  ok("막는 것이 없어 주문이 그대로 들어간다(어제 그대로)", r.ok === true, JSON.stringify(r));
  const pos = App.Trading.getSnapshot().position;
  ok("⭐ 비트코인인데 진입가가 1253.4 다(이 P1 그 자체)", pos && pos.entry === 1253.4, pos ? String(pos.entry) : "(없음)");
  ok("수량이 79.79 BTC 로 부풀어 있다", pos && Math.abs(pos.qty - 10000 / 1253.4) < 1e-9, pos ? pos.qty.toFixed(2) : "-");

  시세(App, "BTCUSDT", 78700);
  const snap = App.Trading.getSnapshot();
  const 손익 = snap.position ? snap.unrealizedPnl : null;
  console.log("      └ 첫 틱 78,700 이 오면 미실현손익 " + (손익 === null ? "(청산됨)" : Math.round(손익).toLocaleString("ko-KR") + " USDT"));
  ok("증거금 1,000 짜리가 말도 안 되는 손익을 만든다", 손익 === null || Math.abs(손익) > 100000, String(손익));
}

/* =========================================================================
 * [10] 다종목 묶음을 안 깨뜨린다
 * ========================================================================= */
section("[10] 방금 만든 다종목 묶음과 함께 돌아간다");
{
  const { App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());

  ok("그물 숫자는 여전히 1", App.SymbolGuard.getNettedCount() === 1, String(App.SymbolGuard.getNettedCount()));
  ok("포지션 종목을 안다", App.SymbolGuard.requiredSymbol() === "BTCUSDT");
  ok("(e) 전환 허용 조건이 살아 있다", App.MultiSymbolView.netIsWorking() === true);
  ok("주문 잠금 신호도 살아 있다", App.MultiSymbolView.getOrderLockState().locked === true);

  /* 포지션을 든 채 종목을 바꿔도 우리 창이 열리고, 새 시세에 닫힙니다 */
  전환(App, "SAMSUNGUSDT");
  ok("포지션을 들고 바꿔도 창이 열린다", App.StalePriceGuard.isStale() === true);
  시세(App, "SAMSUNGUSDT", 55);
  ok("새 화면 종목 시세에 창이 닫힌다", App.StalePriceGuard.isStale() === false);
  ok("엔진은 여전히 BTC 값을 들고 있다", App.Trading.getSnapshot().position.entry === 78700);
}

/* =========================================================================
 * [11] 수정 금지 파일 12개
 * ========================================================================= */
section("[11] 수정 금지 파일 12개");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
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
}

/* =========================================================================
 * [12] 되돌리는 방법 · 테스트 등록
 * ========================================================================= */
section("[12] 되돌리는 방법 · 등록");
{
  const src = read("js/stale-price-guard.js");
  const html = read("index.html");
  ok("파일에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(src) && src.indexOf('<script src="js/stale-price-guard.js">') >= 0);
  ok("index.html 에 한 줄이 실려 있다", html.indexOf('<script src="js/stale-price-guard.js"></script>') >= 0);
  ok("js/trading.js 보다 뒤에 실린다", html.indexOf('src="js/stale-price-guard.js"') > html.indexOf('src="js/trading.js"'));

  const 파일명 = "tests/stale-price-guard.test.js";
  let order = "";
  try { order = read("tests/_order.txt"); } catch (e) { order = ""; }
  ok("테스트 목록에 이 파일이 있다", read("package.json").indexOf(파일명) >= 0 || order.indexOf(파일명) >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
process.exit(fail === 0 ? 0 : 1);
