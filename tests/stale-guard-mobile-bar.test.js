/* tests/stale-guard-mobile-bar.test.js
 * =========================================================================
 * [P3] 폰 하단 [매수/롱][매도/숏] 바가 "시세 받는 중" 에 안 잠기던 것
 *      2026-08-31 · 점검팀 라이브 발견 → 수리팀
 * =========================================================================
 *
 * ── 무엇이 터져 있었나 (390 실측) ────────────────────────────────────────
 *     App.StalePriceGuard.isStale()      true    ← 장치는 정상
 *     #btn-long / #btn-short  disabled   true    ← 데스크톱 버튼은 잠김
 *     .tl-order-bar-long      disabled   false   ← 폰 하단 바만 안 잠김
 *                             opacity    1        평소와 똑같이 보임
 *
 *   js/stale-price-guard.js 의 lockButtons() 는 id 두 개만 잠급니다.
 *   폰 바 버튼은 클래스 기반(.tl-order-bar-btn)이라 그 목록에 없습니다.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────────────────
 *   1) 전환 직후 폰 바 버튼도 같이 잠긴다 (네 종목 전부)
 *   2) 흐려진다 — 데스크톱 잠금과 ★같은 값★ 을 쓴다 (새 표시를 만들지 않음)
 *   3) ⭐ 새 시세가 오면 다시 눌린다 — 영구 잠금이 아니다
 *      (부팅 잠금 때 한 번 영구히 잠긴 적이 있어 제일 위험한 항목입니다)
 *   4) 잠긴 동안 눌러도 주문 시트가 안 열린다
 *   5) 우리가 안 잠근 버튼은 대신 풀어주지 않는다
 *   6) 잠금 판정을 새로 만들지 않는다 — isStale() 한 곳만 읽는다
 *   7) 데스크톱 버튼(#btn-long/#btn-short)은 예전 그대로다
 *   8) index.html 에 스위치 한 줄이 있고, 그 줄을 빼면 예전으로 돌아간다
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
  "js/symbol-sync-bridge.js",
  "js/symbol-stream-switch.js",
  "js/multi-symbol-view.js",
  "js/order-sheet-mobile.js",
  "js/stale-price-guard.js",
  "js/stale-guard-mobile-bar.js",
];

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  win.alert = (m) => { win.__lastAlert = m; };
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
  if (win.App.OrderSheetMobile && win.App.OrderSheetMobile.init) win.App.OrderSheetMobile.init();
  if (win.App.StalePriceGuard) win.App.StalePriceGuard.init();
  if (win.App.StaleGuardMobileBar) win.App.StaleGuardMobileBar.init();
  return { dom, win, App: win.App };
}

const 시세 = (App, sym, price) =>
  App.Bus.emit("price:update", { symbol: sym, price: price, time: Date.now() });

function 전환(App, to) {
  const from = App.Config.getActiveSymbol();
  App.Config.getActiveSymbol = function () { return to; };
  App.Bus.emit("symbol:change", { symbol: to, from: from });
}

const 바버튼 = (win) => Array.prototype.slice.call(
  win.document.querySelectorAll(".tl-order-bar-btn")
);

const 네종목 = [
  ["BTCUSDT", 78700],
  ["QQQUSDT", 717],
  ["SAMSUNGUSDT", 55],
  ["SKHYNIXUSDT", 1253.4],
];

const SRC = read("js/stale-guard-mobile-bar.js");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const HTML = read("index.html");
const CSS = read("style.css");

console.log("\n[P3] 폰 하단 매수·매도 바도 '시세 받는 중' 에 같이 잠근다");

/* =========================================================================
 * [1] 전환 직후 폰 바 버튼도 잠긴다 (네 종목 전부)
 * ========================================================================= */
section("[1] 전환 직후 폰 바 버튼이 잠긴다 (네 종목)");
{
  네종목.forEach(function (목적지) {
    const to = 목적지[0];
    const 출발 = 네종목.find((x) => x[0] !== to);
    const { win, App } = boot();

    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);

    const btns = 바버튼(win);
    ok(to + " — 폰 바 버튼 2개가 있다", btns.length === 2, String(btns.length));
    ok(to + " — 평소에는 눌린다", btns.every((b) => b.disabled === false));

    전환(App, to);

    ok(to + " — 잠금 창이 열렸다", App.StalePriceGuard.isStale() === true);
    ok(to + " — 폰 바 버튼이 잠겼다",
      바버튼(win).every((b) => b.disabled === true),
      JSON.stringify(바버튼(win).map((b) => b.disabled)));
    ok(to + " — 우리가 잠갔다는 표시가 붙는다",
      바버튼(win).every((b) => b.getAttribute("data-stale-bar-locked") === "1"));
    win.close();
  });
}

/* =========================================================================
 * [2] 흐려진다 — 데스크톱 잠금과 같은 값 (새 표시를 만들지 않는다)
 * ========================================================================= */
section("[2] 흐려진다 — 데스크톱 잠금과 같은 값");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);
  전환(App, "QQQUSDT");

  const b = 바버튼(win)[0];
  ok("바탕이 var(--surface3) 로 바뀐다", b.style.background === "var(--surface3)", b.style.background);
  ok("글자가 var(--text-faint) 로 바뀐다", b.style.color === "var(--text-faint)", b.style.color);
  ok("커서가 not-allowed 로 바뀐다", b.style.cursor === "not-allowed", b.style.cursor);
  ok("눌린 느낌(filter)을 없앤다", b.style.filter === "none", b.style.filter);

  /* style.css 의 "버튼이 잠겼을 때" 규칙과 같은 값인지 — 새로 만든 색이 아님 */
  const rule = /\.order-btn:disabled\{([^}]*)\}/.exec(CSS);
  ok("style.css 에 .order-btn:disabled 규칙이 있다", !!rule);
  const body = rule ? rule[1] : "";
  ok("같은 바탕색을 쓴다(var(--surface3))", /background:var\(--surface3\)/.test(body), body);
  ok("같은 글자색을 쓴다(var(--text-faint))", /color:var\(--text-faint\)/.test(body), body);
  ok("확정 팔레트 밖의 색을 새로 박아넣지 않았다",
    !/#[0-9a-fA-F]{6}/.test(CODE), "인라인으로 색을 직접 박으면 팔레트와 따로 놉니다");
  win.close();
}

/* =========================================================================
 * [3] ⭐ 새 시세가 오면 다시 눌린다 — 영구 잠금이 아니다
 * ========================================================================= */
section("[3] ⭐ 시세가 오면 풀린다 (영구 잠금 아님)");
{
  네종목.forEach(function (목적지) {
    const to = 목적지[0];
    const 출발 = 네종목.find((x) => x[0] !== to);
    const { win, App } = boot();

    App.Config.getActiveSymbol = function () { return 출발[0]; };
    시세(App, 출발[0], 출발[1]);
    전환(App, to);
    ok(to + " — 먼저 잠겼다", 바버튼(win).every((b) => b.disabled === true));

    /* 다른 종목 시세로는 안 풀린다 */
    시세(App, 출발[0], 출발[1]);
    ok(to + " — 옛 종목 시세로는 안 풀린다", 바버튼(win).every((b) => b.disabled === true));

    /* 새 종목 첫 시세가 오면 풀린다 */
    시세(App, to, 목적지[1]);
    ok(to + " — 새 시세가 오면 다시 눌린다",
      바버튼(win).every((b) => b.disabled === false),
      JSON.stringify(바버튼(win).map((b) => b.disabled)));
    ok(to + " — 잠금 표시가 사라진다",
      바버튼(win).every((b) => b.getAttribute("data-stale-bar-locked") === null));
    ok(to + " — 우리가 얹은 인라인 색도 사라진다",
      바버튼(win).every((b) => !b.getAttribute("style")),
      JSON.stringify(바버튼(win).map((b) => b.getAttribute("style"))));
    win.close();
  });
}

/* =========================================================================
 * [4] 잠긴 동안 눌러도 주문 시트가 안 열린다
 * ========================================================================= */
section("[4] 잠긴 동안 눌러도 시트가 안 열린다");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);

  전환(App, "SAMSUNGUSDT");
  const before = win.document.body.getAttribute("data-tl-order-sheet");
  바버튼(win)[0].click();
  ok("잠긴 동안 눌러도 시트 상태가 그대로다",
    win.document.body.getAttribute("data-tl-order-sheet") === before,
    String(before) + " → " + String(win.document.body.getAttribute("data-tl-order-sheet")));

  /* 시트 안쪽 확인 버튼은 원래 장치가 이미 잠급니다 (여기서 다시 잠그지 않음) */
  const inner = ["btn-long", "btn-short"].map((id) => win.document.getElementById(id));
  ok("시트 안쪽 확인 버튼은 원래 장치가 잠근다",
    inner.every((b) => !b || b.disabled === true),
    JSON.stringify(inner.map((b) => (b ? b.disabled : null))));
  win.close();
}

/* =========================================================================
 * [5] 우리가 안 잠근 버튼은 대신 풀어주지 않는다
 * ========================================================================= */
section("[5] 남이 잠근 버튼은 대신 풀어주지 않는다");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);

  /* 다른 장치가 먼저 잠가 둔 상태 */
  const btns = 바버튼(win);
  btns[0].disabled = true;

  전환(App, "QQQUSDT");
  ok("우리가 그 버튼에 표시를 붙이지 않았다",
    btns[0].getAttribute("data-stale-bar-locked") === null);

  시세(App, "QQQUSDT", 717);
  ok("풀릴 때 남이 잠근 버튼은 그대로 잠겨 있다", btns[0].disabled === true);
  ok("우리가 잠근 버튼만 풀린다", btns[1].disabled === false);
  win.close();
}

/* =========================================================================
 * [6] 잠금 판정을 새로 만들지 않는다
 * ========================================================================= */
section("[6] 잠금 판정을 새로 만들지 않는다");
{
  ok("App.StalePriceGuard.isStale() 을 읽는다", /isStale\s*\(\)/.test(CODE) && /StalePriceGuard/.test(CODE));
  ok("경과 시간(ms)으로 판정하지 않는다", !/Date\.now\(\)/.test(CODE),
    "시각으로 풀면 시세가 늦을 때 열린 채로 남습니다");
  ok("종목 이름을 여기서 다시 비교하지 않는다",
    !/USDT/.test(CODE), "판정이 두 곳이 되면 서로 다른 순간에 잠깁니다");
  ok("수정 금지 파일의 함수를 바꿔치기하지 않는다",
    !/App\.Trading\s*\.\s*(openPosition|placeLimitOrder|getSnapshot)\s*=/.test(CODE));
}

/* =========================================================================
 * [7] 데스크톱 버튼은 예전 그대로
 * ========================================================================= */
section("[7] 데스크톱 버튼은 예전 그대로");
{
  const { win, App } = boot();
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);
  const d = win.document.getElementById("btn-long");
  const 원래style = d ? d.getAttribute("style") : null;

  전환(App, "QQQUSDT");
  ok("데스크톱 버튼은 원래 장치가 잠근다", !d || d.disabled === true);
  ok("우리 모듈이 데스크톱 버튼에 표시를 붙이지 않았다",
    !d || d.getAttribute("data-stale-bar-locked") === null);
  ok("우리 모듈이 데스크톱 버튼 인라인 스타일을 안 건드렸다",
    !d || d.getAttribute("style") === 원래style);

  시세(App, "QQQUSDT", 717);
  ok("데스크톱 버튼도 시세가 오면 풀린다", !d || d.disabled === false);
  win.close();
}

/* =========================================================================
 * [8] 스위치 한 줄 — 빼면 예전으로 돌아간다
 * ========================================================================= */
section("[8] 되돌리는 방법 (스위치 한 줄)");
{
  ok("index.html 이 이 파일을 부른다",
    /<script src="js\/stale-guard-mobile-bar\.js"><\/script>/.test(HTML));
  ok("stale-price-guard.js 보다 뒤에서 부른다",
    HTML.indexOf("js/stale-guard-mobile-bar.js") > HTML.indexOf("js/stale-price-guard.js"));
  ok("되돌리는 방법이 파일 머리말에 적혀 있다",
    /되돌리는 방법/.test(SRC) && /stale-guard-mobile-bar\.js/.test(SRC));

  /* 그 한 줄을 빼면 폰 바는 예전처럼 안 잠긴다(= 이 버그가 되살아난다) */
  const { win, App } = boot({ without: ["js/stale-guard-mobile-bar.js"] });
  App.Config.getActiveSymbol = function () { return "BTCUSDT"; };
  시세(App, "BTCUSDT", 78700);
  전환(App, "QQQUSDT");
  ok("스위치를 빼면 폰 바가 안 잠긴다(예전 그대로)",
    바버튼(win).every((b) => b.disabled === false));
  ok("그때도 데스크톱 버튼은 잠긴다(원래 장치는 그대로)",
    (function () { const d = win.document.getElementById("btn-long"); return !d || d.disabled === true; })());
  win.close();
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
