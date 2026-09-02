/* tests/chart-replay.test.js
 * =========================================================================
 * 리플레이 봉인 — 2026-09-02 (차트팀)
 *   대상: js/chart-replay.js  (App.ChartReplay)
 * =========================================================================
 * 과거로 돌아가 봉을 하나씩 넘겨 보는 기능(트레이딩뷰 Bar replay)입니다.
 *
 * ── ⭐⭐ 이 봉인이 지키는 제일 중요한 것 — 주문 막기 ────────────────────
 *
 *   리플레이 중 회원은 ★과거 가격★ 을 봅니다. 그런데 주문창·호가창·손익은
 *   ★지금 가격★ 으로 돕니다. 그 상태로 주문이 되면 회원은 과거 가격을 보고
 *   지금 시세로 체결됩니다. 그건 회원 돈입니다.
 *
 *   트레이딩뷰는 이걸 안 막습니다 (고객센터 원문, 2026-09-02 확인):
 *     "trading orders (Paper Trading and other brokers) are executed based
 *      on real-time data"   https://www.tradingview.com/support/solutions/43000474024/
 *   트레이딩뷰는 순수 차트라 그래도 됩니다. ★우리는 거래 사이트★ 입니다.
 *   바이낸스 선물 거래화면에는 Original 에도 Trading View 모드에도
 *   리플레이 버튼이 아예 없습니다 (2026-09-02 실측).
 *   그래서 "경계가 겹치면 거래 우선"(CLAUDE.md) 에 따라 이렇게 못 박습니다.
 *
 *     1) 포지션·미체결이 있으면 ★리플레이를 시작조차 못 합니다★
 *        (닫기까지 막혀서 못 빠져나오는 상황을 아예 안 만듭니다)
 *     2) 리플레이 중에는 App.Trading 의 주문 함수 5개가 전부 거부합니다
 *     3) 주문창과 폰 아래 주문 막대를 덮개로 덮습니다
 *     4) 리플레이 중에 포지션이 생기면 즉시 리플레이를 끕니다
 *
 * ── ⭐ 두 번째 — App.Bus 에 가짜 이벤트를 쏘지 않습니다 ─────────────────
 *
 *   price:update 를 흉내내면 js/trading.js 가 그 값을 현재가로 믿습니다.
 *   미실현손익·청산 판정이 과거 가격으로 돌아갑니다. 절대 하면 안 됩니다.
 *   그래서 이 파일에 App.Bus.emit 이 ★한 번도 없어야★ 합니다.
 *
 * ── ⭐ 세 번째 — js/chart.js 를 한 글자도 안 고칩니다 ───────────────────
 *
 *   차트·시리즈는 js/chart-font.js 와 같은 방법(createChart 감싸기)으로
 *   붙잡습니다. index.html 에서 반드시 js/chart.js ★앞★ 에 실려야 합니다.
 *
 * ── 이 파일은 파일만 읽습니다 ─────────────────────────────────────────
 *   사이트도 서버도 건드리지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}
function md5(rel) {
  return crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", rel))).digest("hex");
}

const SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");
/* 설명글(주석)은 빼고 진짜 코드만 봅니다 */
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n리플레이 (트레이딩뷰 Bar replay)");

/* ===================================================================
 * 1) 주문 막기 — 이 절이 이 파일의 존재 이유입니다
 * =================================================================== */
{
  const NEED = ["openPosition", "placeLimitOrder", "closePosition", "closePartial", "cancelPendingOrder"];
  NEED.forEach(function (fn) {
    ok("주문 함수를 감싼다 — " + fn, CODE.indexOf('"' + fn + '"') >= 0);
  });

  /* 감싼 함수는 리플레이 중이면 원래 함수를 부르지 않고 되돌아와야 합니다 */
  ok("리플레이 중이면 주문을 거부하고 null 을 돌려준다",
    /if\s*\(state\.on\)\s*\{[^]{0,240}return null;/.test(CODE));

  ok("포지션·미체결이 있으면 시작하지 않는다 (canStart 가 막는다)",
    /function canStart\(\)[^]{0,400}accountBusy\(\)/.test(CODE));
  ok("포지션 여부는 App.Trading.getSnapshot 에서만 읽는다 (직접 계산하지 않는다)",
    /App\.Trading\.getSnapshot\(\)/.test(CODE) &&
    !/calcLiquidationPrice|maintenanceMargin/.test(CODE));
  ok("리플레이 중에 포지션이 생기면 바로 끈다",
    /trading:update[^]{0,220}stop\(true\)/.test(CODE));
  ok("주문창을 덮는다 (.amitalk-order)", CODE.indexOf(".amitalk-order") >= 0);
  ok("폰 아래 주문 막대도 덮는다 (.tl-order-bar)", CODE.indexOf(".tl-order-bar") >= 0);
  ok("덮개에 '리플레이 끄기' 가 있다 (막다가 갇히지 않게)",
    (SRC.match(/리플레이 끄기/g) || []).length >= 2);
}

/* ===================================================================
 * 2) App.Bus 에 가짜 이벤트를 쏘지 않는다
 * =================================================================== */
{
  ok("App.Bus.emit 이 한 번도 없다 (가짜 시세를 만들지 않는다)",
    !/App\.Bus\s*\.\s*emit/.test(CODE) && !/Bus\.emit/.test(CODE));
  ok("price:update 를 만들지 않는다", !/emit\([^)]*price:update/.test(CODE));
  ok("듣기만 한다 — symbol:change / interval:change / trading:update",
    /App\.Bus\.on\("symbol:change"/.test(CODE) &&
    /App\.Bus\.on\("interval:change"/.test(CODE) &&
    /App\.Bus\.on\("trading:update"/.test(CODE));
}

/* ===================================================================
 * 3) 수정 금지 파일을 안 건드렸다
 * =================================================================== */
{
  const L = require("./_locked-hashes.js");
  ok("js/chart.js 를 한 글자도 안 고쳤다",
    md5("chart.js") === L.잠긴11["js/chart.js"], md5("chart.js"));
  ok("js/trading.js 를 한 글자도 안 고쳤다", md5("trading.js") === L.TRADING, md5("trading.js"));
  ok("js/websocket.js 를 한 글자도 안 고쳤다",
    md5("websocket.js") === L.잠긴11["js/websocket.js"], md5("websocket.js"));
  ok("js/ui.js 를 한 글자도 안 고쳤다", md5("ui.js") === L.잠긴11["js/ui.js"], md5("ui.js"));

  /* 차트 객체는 chart-font.js 와 같은 방법으로 가져옵니다 */
  ok("createChart 를 감싸서 차트를 잡는다 (chart.js 를 고치지 않는 근거)",
    /LightweightCharts/.test(CODE) && /createChart/.test(CODE) && /Object\.create\(LC\)/.test(CODE));
  ok("시리즈는 addSeries 를 감싸서 잡는다", /addSeries/.test(CODE));
}

/* ===================================================================
 * 4) 실리는 순서 — 라이브러리 뒤, js/chart.js 앞
 * =================================================================== */
{
  const lib = HTML.indexOf("lightweight-charts");
  const me = HTML.indexOf('js/chart-replay.js"');
  const chart = HTML.indexOf('js/chart.js"');
  ok("index.html 이 js/chart-replay.js 를 부른다", me > 0);
  ok("라이브러리 다음에 실린다", me > lib);
  ok("js/chart.js 앞에 실린다", me < chart, "me=" + me + " chart=" + chart);
  ok("한 줄만 추가했다 (되돌리기 = 그 줄 삭제)",
    (HTML.match(/js\/chart-replay\.js/g) || []).length === 1);
}

/* ===================================================================
 * 5) 성능 — 새 값이 들어올 때 전체를 다시 계산하지 않는다
 * =================================================================== */
{
  /* 한 봉 앞으로는 시리즈마다 점 하나만 붙입니다 (O(1)) */
  ok("한 봉 앞으로 갈 때 점 하나만 붙인다 (setData 로 통째로 다시 넣지 않는다)",
    /function stepForward\(\)[^]{0,900}e\.upd\(pt\)/.test(CODE) &&
    !/function stepForward\(\)[^]{0,900}applyAll\(\)/.test(CODE));
  /* 실시간 값은 화면에 안 넣되 장부에는 적어 둡니다 — 꺼질 때 되돌리려고 */
  ok("리플레이 중 실시간 값은 삼키되 장부에 기록한다",
    /mergePoint\(e, p\);[^]{0,200}return undefined;/.test(CODE));
  ok("리플레이를 끄면 장부 그대로 되돌린다",
    /function stop\([^]{0,400}reg\[i\]\.set\(reg\[i\]\.data\.slice\(\)\)/.test(CODE));
  ok("재는 자리가 있다 (getPerf)", /getPerf/.test(CODE) && /performance\.now\(\)/.test(CODE));
}

/* ===================================================================
 * 6) 색 — 확정 팔레트 밖의 색을 쓰지 않는다
 * =================================================================== */
{
  const ALLOWED = [
    "#0A0F1C", "#101727", "#0D1422", "#1D273B",
    "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"
  ];
  const found = (SRC.match(/#[0-9A-Fa-f]{6}\b/g) || []).map(function (h) { return h.toUpperCase(); });
  const bad = found.filter(function (h) { return ALLOWED.indexOf(h) < 0; });
  ok("확정 팔레트 9색만 쓴다", bad.length === 0, bad.join(","));
  ok("빨강은 하락색 하나만 쓴다 (새 빨강을 만들지 않는다)",
    found.indexOf("#FF0000") < 0 && found.indexOf("#F6465D") < 0);
}

/* ===================================================================
 * 7) 글씨 크기 — 줄이지 않았다 (대표: 팝업 글씨가 아직 작다)
 * =================================================================== */
{
  const sizes = (SRC.match(/font-size:(\d+)px/g) || []).map(function (s) {
    return Number(s.replace(/[^0-9]/g, ""));
  });
  ok("글씨가 14px 밑으로 내려가지 않는다", sizes.length > 0 && Math.min.apply(null, sizes) >= 14,
    "가장 작은 값 " + (sizes.length ? Math.min.apply(null, sizes) : "없음"));
  ok("주문 막힘 안내는 크게 쓴다 (21px 이상)", /\.t\{color:[^]{0,80}font-size:21px/.test(SRC) ||
    /font-size:21px/.test(SRC));
}

/* ===================================================================
 * 8) 화면이 없으면 아무것도 만들지 않는다 (조용히)
 * =================================================================== */
{
  const listeners = {};
  const win = {
    App: { Bus: { on: function (n, f) { listeners[n] = f; } } },
    setInterval: function () { return 0; },
    clearInterval: function () { },
    setTimeout: function () { return 0; },
    clearTimeout: function () { },
    performance: { now: function () { return 0; } },
    console: console,
    Map: Map,
    Intl: Intl,
    Date: Date,
    Number: Number,
    Math: Math,
    JSON: JSON,
    isFinite: isFinite,
    alert: function () { }
  };
  win.window = win;
  const doc = {
    readyState: "complete",
    documentElement: { setAttribute: function () { }, removeAttribute: function () { }, getAttribute: function () { return null; } },
    head: { appendChild: function () { } },
    body: { appendChild: function () { } },
    addEventListener: function () { },
    getElementById: function () { return null; },
    querySelector: function () { return null; },
    querySelectorAll: function () { return []; },
    createElement: function () {
      return {
        style: {}, classList: { toggle: function () { }, add: function () { } },
        setAttribute: function () { }, addEventListener: function () { },
        appendChild: function () { }, querySelector: function () { return null; },
        querySelectorAll: function () { return []; }
      };
    }
  };
  win.document = doc;
  win.getComputedStyle = function () { return { position: "relative" }; };

  let threw = null;
  try {
    vm.createContext(win);
    vm.runInContext(SRC, win, { filename: "chart-replay.js" });
  } catch (e) {
    threw = e;
  }
  ok("차트가 없어도 오류 없이 실립니다", !threw, threw && threw.message);
  const M = win.App && win.App.ChartReplay;
  ok("App.ChartReplay 를 내어준다", !!M);
  if (M) {
    ok("차트가 없으면 켜지지 않는다", M.isOn() === false);
    ok("차트가 없으면 시작해도 아무 일이 없다", M.start(1) === false);
    ok("잡은 시리즈가 0 개다", M.getSeriesCountForTest() === 0);
    ok("배속 목록이 트레이딩뷰처럼 여러 단이다", M.SPEEDS.length >= 5 && M.SPEEDS.indexOf(10) >= 0);
    ok("되돌릴 수 있는 스위치가 있다 (disable)", typeof M.disable === "function");
  }
}

/* ===================================================================
 * 9) 등록 · 이모지
 * =================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", order.indexOf("tests/chart-replay.test.js") >= 0);

  /* 화면에 나가는 글자에 그림문자를 쓰지 않습니다.
     설명글(주석)의 ★·⚠ 표시는 tests/no-emoji.test.js 와 같은 취급으로 뺍니다 —
     화면에 안 나가고, 이 저장소의 다른 모듈도 주석에 그대로 쓰고 있습니다. */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/gu;
  const ALLOW = "✕✓✖×";
  const found = (CODE.match(EMOJI) || []).filter(function (ch) { return ALLOW.indexOf(ch) < 0; });
  ok("화면에 나가는 글자에 이모지가 없다", found.length === 0, found.join(" "));
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
process.exit(fail ? 1 : 0);
