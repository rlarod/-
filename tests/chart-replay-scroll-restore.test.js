/* tests/chart-replay-scroll-restore.test.js
 * =========================================================================
 * 리플레이를 끄면 보던 자리로 돌아온다 — 2026-09-02 (수리팀)
 *   대상: js/chart-replay.js  (App.ChartReplay)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 먼 과거에서 리플레이를 끄면 차트가 오른쪽 끝으로 안 돌아왔습니다.
 *
 * 2026-09-02 실측 (localhost · 1440)
 *   기준 (리플레이 안 켬)             오른쪽 빈 칸   2px   scrollPosition 0
 *   280봉 전 + 5봉 진행 (리플레이 중)                     scrollPosition 124.75
 *   그대로 끔                         오른쪽 빈 칸 144px   scrollPosition 124.75
 *   가까운 데(40봉 전)에서는 안 났습니다 — 멀리 되감았을 때만입니다
 *
 * 왜 그런가 — keepInView 가 새 봉을 화면 안으로 데려올 때 마지막 봉을 가로
 * 75% 자리에 둡니다. 그러면 오른쪽에 보이는 폭의 25% 만큼 빈 칸이 생기고
 * (실측 124.75봉), 시간축은 그걸 "오른쪽 끝에서 몇 봉" 으로 기억합니다.
 * 리플레이를 끄고 봉을 다 되돌려도 그 빈 칸이 남습니다.
 *
 * ⚠️ 값은 다 맞고 ★화면 자리만★ 안 돌아옵니다. 그래서 회원은 "봉이 없네"
 *    로 읽습니다 — 화면이 안 깨지는 쪽이라 더 헷갈립니다.
 *
 * 고친 방법 — 켤 때의 가로 자리를 적어 두었다가 끌 때 그대로 되돌립니다.
 *   · "오른쪽 끝에서 몇 봉" 이라 봉이 하나 더 생겨도 그대로 맞습니다
 *   · ★봉을 되돌린 다음에★ 자리를 되돌립니다 (순서가 중요합니다)
 *   · 종목·봉간격이 바뀌어서 끄는 경우(stop(false))에는 되돌리지 않습니다
 *     — 다른 자료로 갈아타는 것이라 옛 자리가 뜻이 없습니다
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

console.log("\n리플레이를 끄면 보던 자리로");

const 기록 = []; /* 무엇을 어떤 차례로 불렀는지 */

const dom = new JSDOM(
  "<!doctype html><html><body>" +
  '<div class="tlc-toolbar"></div>' +
  '<div class="chart-wrap"><div id="c"></div></div>' +
  '<div class="amitalk-order"></div>' +
  "</body></html>",
  { runScripts: "outside-only", url: "https://example.test/" }
);
const win = dom.window;
const doc = win.document;
win.innerWidth = 1440;
win.innerHeight = 900;
win.setInterval = function () { return 0; };
win.clearInterval = function () {};
win.setTimeout = function () { return 0; };
win.clearTimeout = function () {};
win.requestAnimationFrame = undefined;
win.Element.prototype.getBoundingClientRect = function () {
  return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
};

const 첫봉 = 1700000000;
const 봉들 = [];
for (let i = 0; i < 1000; i++) {
  봉들.push({ time: 첫봉 + i * 60, open: 100, high: 101, low: 99, close: 100 });
}

/* ---------------------------------------------------------------------
 * 시간축 흉내 — Lightweight Charts 의 실제 셈법을 그대로 옮겼습니다.
 *
 *   scrollPosition()  마지막 봉이 오른쪽 끝에서 몇 봉 떨어져 있나
 *   보이는 범위(logical) = { from: 끝봉 + 자리 - 폭, to: 끝봉 + 자리 }
 *
 * ★ 봉을 새로 넣거나(setData) 한 봉 붙여도(update) 「자리」 는 그대로 두고
 *   범위를 다시 셉니다. 그래서 리플레이 중에 생긴 빈 칸이 끄고 나서도
 *   남습니다 — 이게 이 봉인이 지키는 고장입니다.
 *
 * 이 흉내가 진짜와 같은지 — 아래 3절에서 브라우저 실측값(124.75)과
 * 같은 숫자가 나오는지 확인합니다. 다르면 흉내가 틀린 것입니다.
 * ------------------------------------------------------------------- */
const 폭 = 499;      /* 화면에 보이는 봉 수 (1440 실측 500~999) */
let 봉수 = 0;
let 자리 = 0;        /* = scrollPosition */
let 마지막시각 = 0;

function 범위() {
  const 끝 = 봉수 - 1 + 자리;
  return { from: 끝 - 폭, to: 끝 };
}
const ts = {
  scrollPosition() { return 자리; },
  scrollToPosition(p, animated) {
    기록.push({ 무엇: "scrollToPosition", 값: p, 애니: animated });
    자리 = p;
  },
  getVisibleLogicalRange() { return 범위(); },
  setVisibleLogicalRange(r) { 자리 = r.to - (봉수 - 1); },
  fitContent() {},
  scrollToRealTime() { 기록.push({ 무엇: "scrollToRealTime" }); 자리 = 0; }
};

function 가짜차트() {
  return {
    addSeries() {
      let 자료 = [];
      return {
        seriesType() { return "Candlestick"; },
        setData(d) {
          기록.push({ 무엇: "setData", 개수: d.length });
          자료 = d.slice();
          봉수 = d.length;                                   /* 자리는 그대로 */
          마지막시각 = d.length ? d[d.length - 1].time : 0;
        },
        update(pt) {
          if (pt && pt.time > 마지막시각) { 봉수++; 마지막시각 = pt.time; }
        },
        data() { return 자료; },
        applyOptions() {},
        createPriceLine() { return { applyOptions() {} }; },
        removePriceLine() {}
      };
    },
    timeScale() { return ts; },
    subscribeClick() {}, unsubscribeClick() {},
    subscribeCrosshairMove() {}, unsubscribeCrosshairMove() {},
    applyOptions() {}
  };
}
win.LightweightCharts = { createChart() { return 가짜차트(); } };
win.App = {
  Storage: { load() { return null; }, save() { return true; } },
  Config: { getActiveSymbol() { return "BTCUSDT"; }, getActiveInterval() { return "1m"; } },
  Trading: { getSnapshot() { return { position: null, pendingOrder: null }; } },
  Utils: { formatCurrencyPlain(v) { return String(v); } },
  Bus: { on() {}, emit() {} }
};

win.eval(SRC);
const RP = win.App.ChartReplay;
const chart = win.LightweightCharts.createChart(doc.getElementById("c"));
const candle = chart.addSeries("Candlestick");
candle.setData(봉들);

/* =====================================================================
 * 1) 켤 때 보던 자리를 적어 둔다
 * ===================================================================== */
ok("(기준) 리플레이 전에는 오른쪽 끝이다 (scrollPosition 0)", 자리 === 0);
ok("리플레이를 켰다 (280봉 전)", RP.start(봉들[봉들.length - 280].time) === true);
ok("켤 때 자리를 적어 뒀다 (0)", RP.getScrollMarkForTest() === 0,
  String(RP.getScrollMarkForTest()));

/* =====================================================================
 * 2) 봉을 넘기면 오른쪽에 빈 칸이 생긴다 (이게 원인)
 * ===================================================================== */
for (let i = 0; i < 5; i++) RP.stepForward();
ok("봉을 넘기니 오른쪽에 빈 칸이 생겼다 (자리 " + 자리 + "봉)", 자리 > 0, String(자리));
/* 흉내가 진짜와 같은지 — 브라우저에서 잰 값과 딱 같아야 합니다.
   1440 실측 2026-09-02: scrollPosition 124.75 · 범위 350.7~849.8 */
ok("흉내가 브라우저 실측과 같다 (124.75봉 = 보이는 폭의 25%)",
  Math.abs(자리 - 124.75) < 0.01, String(자리));

/* =====================================================================
 * 3) 끄면 적어 둔 자리로 되돌린다
 * ===================================================================== */
기록.length = 0;
RP.stop(true);
ok("끄면 보던 자리로 되돌린다 (scrollPosition 0)", 자리 === 0, String(자리));
{
  const s = 기록.filter(function (r) { return r.무엇 === "scrollToPosition"; });
  ok("자리 되돌리기를 한 번 불렀다", s.length === 1, String(s.length));
  ok("적어 둔 값 그대로 되돌린다 (0)", s.length === 1 && s[0].값 === 0);
  ok("스르륵 움직이지 않는다 (animated=false)", s.length === 1 && s[0].애니 === false,
    s.length === 1 ? String(s[0].애니) : "-");
}
{
  const iSet = 기록.findIndex(function (r) { return r.무엇 === "setData"; });
  const iScroll = 기록.findIndex(function (r) { return r.무엇 === "scrollToPosition"; });
  ok("★봉을 다 되돌린 다음에★ 자리를 되돌린다 (순서)",
    iSet >= 0 && iScroll >= 0 && iSet < iScroll, "setData=" + iSet + " scroll=" + iScroll);
}
ok("되돌린 뒤에는 적어 둔 것을 지운다 (다음에 엉뚱하게 안 되돌리게)",
  RP.getScrollMarkForTest() === null, String(RP.getScrollMarkForTest()));

/* =====================================================================
 * 4) 다시 해도 같다 (되풀이해도 빈 칸이 안 쌓인다)
 * ===================================================================== */
for (let 회 = 1; 회 <= 2; 회++) {
  RP.start(봉들[봉들.length - 280].time);
  for (let i = 0; i < 5; i++) RP.stepForward();
  RP.stop(true);
  ok(회 + "번째 다시 해도 오른쪽 끝으로 돌아온다", 자리 === 0, String(자리));
}

/* =====================================================================
 * 5) 과거를 보다가 켰으면 ★그 자리로★ 돌아온다 (오른쪽 끝이 아니라)
 *    2026-09-02 실측 — 켜기 전 -150 → 끈 뒤 -150
 * ===================================================================== */
자리 = -150;
RP.start(봉들[봉들.length - 280].time);
ok("과거를 보던 자리를 적어 뒀다 (-150)", RP.getScrollMarkForTest() === -150,
  String(RP.getScrollMarkForTest()));
for (let i = 0; i < 5; i++) RP.stepForward();
RP.stop(true);
ok("끄면 보던 그 자리(-150)로 돌아온다", 자리 === -150, String(자리));

/* =====================================================================
 * 6) 종목·봉간격이 바뀌어 끄는 경우에는 되돌리지 않는다
 *    (다른 자료로 갈아타는 것이라 옛 자리가 뜻이 없습니다)
 * ===================================================================== */
자리 = 0;
RP.start(봉들[봉들.length - 280].time);
for (let i = 0; i < 5; i++) RP.stepForward();
const 갈아탈때자리 = 자리;
기록.length = 0;
RP.stop(false);
{
  const s = 기록.filter(function (r) { return r.무엇 === "scrollToPosition"; });
  ok("stop(false) 에서는 자리를 안 건드린다", s.length === 0, String(s.length));
  ok("stop(false) 에서는 봉도 안 되돌린다 (원래 그런 뜻)",
    기록.filter(function (r) { return r.무엇 === "setData"; }).length === 0);
  ok("stop(false) 뒤에도 자리는 그대로다", 자리 === 갈아탈때자리);
  ok("stop(false) 는 적어 둔 것을 버린다 (다음에 엉뚱하게 안 되돌리게)",
    RP.getScrollMarkForTest() === null, String(RP.getScrollMarkForTest()));
}

/* =====================================================================
 * 7) 값 계산은 손대지 않았다 — 자리(보이는 곳)만 되돌립니다
 * ===================================================================== */
{
  const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
  ok("봉 값을 고치지 않는다 (되돌릴 때 장부 사본을 그대로 넣는다)",
    /reg\[i\]\.set\(reg\[i\]\.data\.slice\(\)\)/.test(CODE));
  ok("시간축에는 자리 두 가지만 쓴다 (scrollPosition · scrollToPosition)",
    /scrollPosition\(\)/.test(CODE) && /scrollToPosition\(/.test(CODE));
  ok("App.Bus.emit 이 없다 (가짜 시세를 만들지 않는다)", !/Bus\s*\.\s*emit/.test(CODE));
}

/* =====================================================================
 * 8) 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-scroll-restore.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
