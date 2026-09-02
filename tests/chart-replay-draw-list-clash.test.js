/* tests/chart-replay-draw-list-clash.test.js
 * =========================================================================
 * 리플레이 조작막대가 「그린 것 목록」을 막지 않는다 — 2026-09-02 (수리팀)
 *   대상: js/chart-replay.js  (App.ChartReplay)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 그린 것 목록(js/chart-drawings.js · .tl-draw-list · z-index 8)은 그리기 칩
 * 바로 위에서 위로 자랍니다. 리플레이 조작막대(.tl-rp-bar)는 차트 아래쪽
 * 가운데에 붙어 있고 리플레이 층은 z-index 18 이라 목록을 덮습니다.
 *
 * 2026-09-02 실측 (localhost · 그린 것 3개)
 *   1440  목록 91,706~451,946   막대 231,834~652,886   겹침 220 x 52px
 *   360   목록 23,652~337,824   막대  49,734~311,786   겹침 262 x 52px
 *   두 폭 다 ★숨김·잠금·지움★ 세 단추가 안 눌렸습니다
 *   (elementFromPoint 가 tl-rp-bar · tl-rp-speed 를 잡았습니다)
 *
 * 고친 방법 — 목록이 열리면 조작막대가 비킵니다.
 *   ① 위로 올릴 자리가 있으면 올립니다 (transform 으로만. 자리는 안 건드림)
 *   ② 올릴 자리가 없으면 잠깐 접습니다. 목록을 닫으면 도로 나옵니다
 *
 * ── ⚠️ 이 봉인이 실제로 잡은 것 ───────────────────────────────────────
 * 접힘 CSS 한 줄을 ".tl-rp-bar{...}" 규칙 ★한가운데★ 에 끼워 넣어서 막대
 * 규칙이 두 동강 났던 적이 있습니다(2026-09-02, 고치는 중에 실측으로 발견).
 * 화면에서는 "접었다고 하는데 안 접힘" 으로만 보였습니다.
 * 그래서 아래 6절이 ★막대 규칙이 통째로 살아 있는지★ 를 따로 봅니다.
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * js/chart-drawings.js 는 ★읽지도 고치지도★ 않습니다 — 가짜 목록을 직접
 * 만들어 씁니다. 실제 목록은 만들어졌다 없어졌다 하는 평범한 div 라
 * 자리와 크기만 같으면 결과가 같습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");

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

console.log("\n리플레이 조작막대 ↔ 그린 것 목록 자리 다툼");

/* =====================================================================
 * 가짜 화면 — 브라우저 없이 js/chart-replay.js 를 그대로 띄웁니다
 * ===================================================================== */
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
/* 되풀이 타이머·rAF 는 안 돌립니다 — 우리가 직접 불러서 잽니다 */
win.setInterval = function () { return 0; };
win.clearInterval = function () {};
win.setTimeout = function () { return 0; };
win.clearTimeout = function () {};
win.requestAnimationFrame = undefined;

/* 자리(사각형)는 jsdom 이 못 재므로 우리가 넣어 줍니다 */
const rects = new Map();
function setRect(el, r) {
  rects.set(el, {
    left: r.left, right: r.right, top: r.top, bottom: r.bottom,
    width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top
  });
}
win.Element.prototype.getBoundingClientRect = function () {
  return rects.get(this) || { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
};

/* Lightweight Charts 흉내 — 리플레이가 붙잡는 부분만 있으면 됩니다 */
const 첫봉 = 1700000000;
const 봉들 = [];
for (let i = 0; i < 300; i++) {
  봉들.push({ time: 첫봉 + i * 60, open: 100, high: 101, low: 99, close: 100 });
}

function 가짜시간축() {
  let range = { from: 0, to: 100 };
  let 위치 = 0;
  return {
    getVisibleLogicalRange() { return range; },
    setVisibleLogicalRange(r) { range = r; },
    scrollPosition() { return 위치; },
    scrollToPosition(p) { 위치 = p; },
    scrollToRealTime() { 위치 = 0; },
    fitContent() {},
    subscribeVisibleLogicalRangeChange() {},
    unsubscribeVisibleLogicalRangeChange() {}
  };
}
function 가짜차트() {
  const ts = 가짜시간축();
  return {
    addSeries() {
      let 자료 = [];
      return {
        seriesType() { return "Candlestick"; },
        setData(d) { 자료 = d.slice(); },
        update() {},
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

/* App 옆방들 — 리플레이가 읽기만 합니다 */
win.App = {
  Storage: { load() { return null; }, save() { return true; } },
  Config: { getActiveSymbol() { return "BTCUSDT"; }, getActiveInterval() { return "1m"; } },
  Trading: { getSnapshot() { return { position: null, pendingOrder: null }; } },
  Utils: { formatCurrencyPlain(v) { return String(v); } },
  Bus: { on() {}, emit() {} }
};

win.eval(SRC);
const RP = win.App.ChartReplay;
ok("가짜 화면에서 App.ChartReplay 가 만들어졌다", !!RP);

/* 차트·시리즈를 리플레이가 붙잡게 합니다 */
const chart = win.LightweightCharts.createChart(doc.getElementById("c"));
const candle = chart.addSeries("Candlestick");
candle.setData(봉들);
ok("캔들 시리즈를 붙잡았다 (1개)", RP.getSeriesCountForTest() === 1, String(RP.getSeriesCountForTest()));

/* =====================================================================
 * 1) 목록이 없으면 아무것도 안 한다
 * ===================================================================== */
const wrap = doc.querySelector(".chart-wrap");
setRect(wrap, { left: 0, right: 700, top: 100, bottom: 800 });

ok("리플레이를 켰다", RP.start(봉들[봉들.length - 40].time) === true);

const bar = doc.querySelector(".tl-rp-bar");
const banner = doc.querySelector(".tl-rp-banner");
ok("조작막대가 생겼다", !!bar);
setRect(bar, { left: 150, right: 550, top: 700, bottom: 752 });   /* 원래 자리 */
setRect(banner, { left: 20, right: 680, top: 108, bottom: 160 }); /* 안내줄 */

RP.placeBarForTest();
ok("목록이 없으면 안 민다 (lift 0 · 안 접음)",
  RP.getBarPlacementForTest().lift === 0 && RP.getBarPlacementForTest().folded === false,
  JSON.stringify(RP.getBarPlacementForTest()));
ok("목록이 없으면 transform 을 안 건다", bar.style.transform === "", bar.style.transform);

/* =====================================================================
 * 2) 목록과 겹치면 — 자리가 있으면 위로 올린다
 * ===================================================================== */
const list = doc.createElement("div");
list.className = "tl-draw-list";
wrap.appendChild(list);
setRect(list, { left: 20, right: 380, top: 560, bottom: 740 });

/* 고치기 전이라면 여기서 세로로 이만큼 겹칩니다 */
const 겹침전 = Math.min(752, 740) - Math.max(700, 560);
ok("(전제) 안 비키면 세로 " + 겹침전 + "px 겹친다", 겹침전 > 0);

RP.placeBarForTest();
const p2 = RP.getBarPlacementForTest();
ok("목록과 겹치면 위로 올린다 (lift = 막대아래 - (목록위 - 8) = 200)",
  p2.lift === 200 && p2.folded === false, JSON.stringify(p2));
ok("올릴 때는 자리를 안 건드리고 transform 으로만 민다",
  bar.style.transform === "translateY(-200px)", bar.style.transform);
{
  const 민뒤아래 = 752 - p2.lift;
  ok("올린 뒤에는 목록과 세로로 안 겹친다 (" + 민뒤아래 + " ≤ 552)", 민뒤아래 <= 560 - 8);
  ok("올린 뒤에도 안내줄 아래에 있다 (" + (700 - p2.lift) + " ≥ 166)", 700 - p2.lift >= 160 + 6);
}

/* =====================================================================
 * 3) 목록을 닫으면 원래 자리로 정확히 돌아온다
 * ===================================================================== */
wrap.removeChild(list);
RP.placeBarForTest();
ok("목록을 닫으면 밀었던 것을 되돌린다",
  bar.style.transform === "" && RP.getBarPlacementForTest().lift === 0,
  bar.style.transform);
ok("되돌릴 때 접힘도 같이 푼다", bar.className === "tl-rp-bar", bar.className);

/* =====================================================================
 * 4) 올릴 자리가 없으면 접는다 (폰 · 차트가 조금만 보일 때)
 * ===================================================================== */
wrap.appendChild(list);
setRect(list, { left: 20, right: 380, top: 180, bottom: 740 }); /* 차트를 거의 다 덮음 */
RP.placeBarForTest();
const p4 = RP.getBarPlacementForTest();
ok("올릴 자리가 없으면 접는다", p4.folded === true && p4.lift === 0, JSON.stringify(p4));
ok("접을 때 접힘 표시(class)를 붙인다",
  bar.className.indexOf("tl-rp-folded") >= 0, bar.className);
ok("접어도 transform 은 안 남긴다", bar.style.transform === "", bar.style.transform);

wrap.removeChild(list);
RP.placeBarForTest();
ok("목록을 닫으면 접힘이 풀린다",
  RP.getBarPlacementForTest().folded === false && bar.className === "tl-rp-bar", bar.className);

/* =====================================================================
 * 5) 리플레이를 끄면 흔적을 안 남긴다
 * ===================================================================== */
wrap.appendChild(list);
setRect(list, { left: 20, right: 380, top: 560, bottom: 740 });
RP.placeBarForTest();
ok("(전제) 지금은 밀려 있다", RP.getBarPlacementForTest().lift === 200);
RP.stop(true);
ok("리플레이를 끄면 민 것도 접힘도 없앤다",
  bar.style.transform === "" && bar.className === "tl-rp-bar" &&
  RP.getBarPlacementForTest().lift === 0 && RP.getBarPlacementForTest().folded === false,
  bar.style.transform + " / " + bar.className);

/* =====================================================================
 * 6) 넣은 CSS 가 원래 막대 규칙을 두 동강 내지 않았다 ⭐
 *    (고치는 중에 실제로 이렇게 깨뜨렸습니다 — 위 머리말 참조)
 * ===================================================================== */
{
  const style = doc.getElementById("tl-replay-style");
  const css = style ? style.textContent : "";
  ok("리플레이가 자기 CSS 를 넣는다 (style.css 는 안 건드림)", css.length > 0);
  ok("막대 규칙이 통째로 살아 있다 (자리·크기·누를 수 있음)",
    /\.tl-rp-bar\{[^}]*position:sticky[^}]*bottom:14px[^}]*align-items:center[^}]*pointer-events:auto[^}]*padding:6px 8px;\}/.test(css),
    "규칙이 잘렸습니다");
  ok("접힘 규칙이 따로 한 줄로 들어 있다",
    css.indexOf(".tl-rp-bar.tl-rp-folded{display:none !important;}") >= 0);
}

/* =====================================================================
 * 7) js/chart-drawings.js 를 건드리지 않았다
 * ===================================================================== */
{
  const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
  ok("목록은 찾기만 한다 (.tl-draw-list)",
    CODE.indexOf('querySelector(".tl-draw-list")') >= 0);
  ok("목록의 자리·모양을 고치지 않는다",
    !/list\.style|list\.className|list\.remove|list\.setAttribute/.test(CODE));
  ok("App.ChartDrawings 를 부르지 않는다 (그 파일에 기대지 않는다)",
    CODE.indexOf("App.ChartDrawings") < 0);
}

/* =====================================================================
 * 8) 수정 금지 파일 12개 — 한 글자도 안 고쳤다
 * ===================================================================== */
{
  const L = require("./_locked-hashes.js");
  const md5 = function (rel) {
    return crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", rel))).digest("hex");
  };
  ok("js/trading.js 그대로", md5("trading.js") === L.TRADING, md5("trading.js"));
  Object.keys(L.잠긴11).forEach(function (k) {
    const rel = k.replace(/^js[/]/, "");
    ok(k + " 그대로", md5(rel) === L.잠긴11[k], md5(rel));
  });
}

/* =====================================================================
 * 9) 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-draw-list-clash.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
