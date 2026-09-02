/* tests/chart-replay-banner-ind-bar.test.js
 * =========================================================================
 * 리플레이 안내줄이 지표 칩 줄을 덮지 않는다 — 2026-09-02 (수리팀)
 *   대상: js/chart-replay.js  (App.ChartReplay)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 지표 칩 줄(js/chart-indicators.js · .tl-ind-bar · z-index 6)은 차트 칸
 * 왼쪽 위에 절대자리(top:6px)로 붙어 있습니다. 리플레이 안내줄
 * (.tl-rp-banner · z-index 18)도 같은 자리에서 시작해 칩 줄을 통째로
 * 덮었습니다.
 *
 * 2026-09-02 실측 (localhost · 360 · 칩 줄 접힌 상태)
 *   칩 줄   23,62~263,85 (23px)     안내줄 21,62~339,120 (58px)
 *   겹침 240 x 22.5px = ★칩 줄 전체★
 *
 * ⚠️ 제일 나쁜 점 — 안내줄은 pointer-events:none 이라 ★누르면 뒤에 있는
 *    칩이 눌립니다★. 회원은 안내줄을 눌렀는데 지표 목록이 펼쳐집니다.
 *    보이지도 않는데 눌리니까 회원은 고장인 줄도 모릅니다(조용한 고장).
 *
 * 고친 방법 — 안내줄을 칩 줄 ★아래로 내립니다★.
 *   ① 차트가 다 보일 때  : 위쪽 여백(margin-top)으로 내립니다
 *   ② 페이지를 내려 안내줄이 화면 위에 붙어 있을 때(sticky) : 붙은
 *      자리(top)를 내립니다. ①이 안 먹는 상태라 두 번째 손이 필요합니다
 *      (2026-09-02 1440 실측 — ① 만으로는 2.4px 이 남았습니다)
 *   ③ 칩 줄이 접히고 펴지면 높이가 23 ↔ 76px 로 바뀌므로 다시 잽니다
 *
 * ★ 칩 줄은 한 글자도 안 건드립니다 ★ — 회원이 켜둔 지표를 우리가 접지
 *   않습니다. 안내줄 글씨도 안 줄입니다. 자리만 내립니다.
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * js/chart-indicators.js 는 읽지도 고치지도 않습니다 — 가짜 칩 줄을
 * 직접 만들어 씁니다.
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

console.log("\n리플레이 안내줄 ↔ 지표 칩 줄");

/* =====================================================================
 * 가짜 화면
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
win.innerWidth = 360;
win.innerHeight = 800;
win.setInterval = function () { return 0; };
win.clearInterval = function () {};
win.setTimeout = function () { return 0; };
win.clearTimeout = function () {};
win.requestAnimationFrame = undefined;

/* 자리(사각형) — jsdom 은 자리를 못 재므로 우리가 넣습니다.
   ★안내줄만★ 은 "위쪽 여백을 늘리면 그만큼 내려간다" 를 흉내 냅니다.
   그래야 진짜 브라우저처럼 ①로 해결되는지 ②까지 필요한지가 갈립니다. */
const rects = new Map();
function setRect(el, r) {
  rects.set(el, { left: r.left, right: r.right, top: r.top, bottom: r.bottom, dy: null });
}
/** el 의 자리를 "위쪽 여백만큼 내려가게" 만듭니다 (진짜 배치 흉내) */
function 여백따라움직이게(el, 기준여백) {
  const r = rects.get(el);
  r.dy = function () {
    const m = parseFloat(el.style.marginTop);
    return isNaN(m) ? 0 : m - 기준여백;
  };
}
win.Element.prototype.getBoundingClientRect = function () {
  const r = rects.get(this);
  if (!r) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
  const d = r.dy ? r.dy() : 0;
  return {
    left: r.left, right: r.right, top: r.top + d, bottom: r.bottom + d,
    width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top + d
  };
};

/* Lightweight Charts 흉내 */
const 첫봉 = 1700000000;
const 봉들 = [];
for (let i = 0; i < 300; i++) {
  봉들.push({ time: 첫봉 + i * 60, open: 100, high: 101, low: 99, close: 100 });
}
function 가짜차트() {
  let range = { from: 0, to: 100 };
  const ts = {
    getVisibleLogicalRange() { return range; },
    setVisibleLogicalRange(r) { range = r; },
    scrollPosition() { return 0; },
    scrollToPosition() {},
    scrollToRealTime() {},
    fitContent() {}
  };
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
chart.addSeries("Candlestick").setData(봉들);

const wrap = doc.querySelector(".chart-wrap");
setRect(wrap, { left: 0, right: 350, top: 100, bottom: 660 });

ok("리플레이를 켰다", RP.start(봉들[봉들.length - 40].time) === true);
const banner = doc.querySelector(".tl-rp-banner");
const bar = doc.querySelector(".tl-rp-bar");
ok("안내줄이 생겼다", !!banner);

/* 안내줄 원래 자리 — 칩 줄과 똑같이 차트 칸 맨 위에서 시작합니다 */
setRect(banner, { left: 18, right: 340, top: 108, bottom: 166 });
const 기준여백 = parseFloat(win.getComputedStyle(banner).marginTop) || 0;
여백따라움직이게(banner, 기준여백);
setRect(bar, { left: 40, right: 310, top: 580, bottom: 632 });

function 안내줄자리() {
  const r = banner.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}
function 겹침높이(a, b) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? y : 0;
}

/* =====================================================================
 * 1) 칩 줄이 없으면 안 내린다
 * ===================================================================== */
RP.placeBannerForTest();
ok("칩 줄이 없으면 안내줄을 안 건드린다",
  banner.style.marginTop === "" && banner.style.top === "",
  banner.style.marginTop + " / " + banner.style.top);
ok("안내줄이 원래 자리 그대로다 (108)", 안내줄자리().top === 108, String(안내줄자리().top));

/* =====================================================================
 * 2) 칩 줄(접힘 23px)을 덮으면 그 아래로 내린다
 * ===================================================================== */
const ind = doc.createElement("div");
ind.className = "tl-ind-bar";
wrap.appendChild(ind);
setRect(ind, { left: 20, right: 300, top: 106, bottom: 129 }); /* 23px */

{
  const 전 = 겹침높이(banner.getBoundingClientRect(), ind.getBoundingClientRect());
  ok("(전제) 안 내리면 칩 줄을 " + 전 + "px 덮는다", 전 > 0);
}
RP.placeBannerForTest();
{
  const b = banner.getBoundingClientRect();
  const i = ind.getBoundingClientRect();
  ok("칩 줄 아래로 내렸다 (안내줄 위 " + b.top + " ≥ 칩줄 아래 " + i.bottom + " + 6)",
    b.top >= i.bottom + 6, JSON.stringify({ banner: b.top, ind: i.bottom }));
  ok("칩 줄과 안 겹친다 (0px)", 겹침높이(b, i) === 0, String(겹침높이(b, i)));
  ok("위쪽 여백으로 내렸다 (글씨·크기는 안 건드림)",
    banner.style.marginTop !== "" && banner.style.top === "",
    banner.style.marginTop + " / " + banner.style.top);
  ok("안내줄 높이는 그대로다 (58px — 글씨를 안 줄였다)",
    b.bottom - b.top === 58, String(b.bottom - b.top));
}

/* =====================================================================
 * 3) 칩 줄을 펴면(76px) 더 내려간다
 * ===================================================================== */
setRect(ind, { left: 20, right: 300, top: 106, bottom: 182 }); /* 76px */
RP.placeBannerForTest();
{
  const b = banner.getBoundingClientRect();
  const i = ind.getBoundingClientRect();
  ok("칩 줄이 커지면 그만큼 더 내려간다 (안내줄 위 " + b.top + ")", b.top >= i.bottom + 6);
  ok("펼친 칩 줄과도 안 겹친다 (0px)", 겹침높이(b, i) === 0);
}

/* 다시 접으면 도로 올라옵니다 — 내린 만큼이 쌓이지 않는지 */
setRect(ind, { left: 20, right: 300, top: 106, bottom: 129 });
RP.placeBannerForTest();
{
  const b = banner.getBoundingClientRect();
  ok("다시 접으면 도로 올라온다 (내린 만큼이 쌓이지 않는다)",
    b.top >= 129 + 6 && b.top < 129 + 6 + 20, String(b.top));
}

/* =====================================================================
 * 4) 칩 줄이 없어지면 원래 자리로 돌아온다
 * ===================================================================== */
wrap.removeChild(ind);
RP.placeBannerForTest();
ok("칩 줄이 없어지면 원래 자리로 돌아온다",
  banner.style.marginTop === "" && banner.style.top === "" && 안내줄자리().top === 108,
  String(안내줄자리().top));

/* =====================================================================
 * 5) 화면 위에 붙어 있을 때(sticky)는 붙은 자리를 내린다 ⭐
 *    — 위쪽 여백이 안 먹는 상태입니다. ①만 있으면 2.4px 이 남습니다
 *      (2026-09-02 1440 실측)
 * ===================================================================== */
wrap.appendChild(ind);
setRect(ind, { left: 20, right: 300, top: 106, bottom: 129 });
rects.get(banner).dy = null; /* 여백을 늘려도 안 움직임 = 붙어 있는 상태 */
RP.placeBannerForTest();
ok("여백이 안 먹으면 붙은 자리(top)를 내린다",
  banner.style.top !== "", banner.style.top);
{
  const 내린만큼 = parseFloat(banner.style.top) - (parseFloat(win.getComputedStyle(banner).top) || 8);
  ok("내린 값이 칩 줄 아래 + 6 을 채운다 (필요 " + (129 + 6 - 108) + "px)",
    parseFloat(banner.style.top) >= 129 + 6 - 108, banner.style.top);
}
여백따라움직이게(banner, 기준여백);

/* =====================================================================
 * 6) 리플레이를 끄면 흔적을 안 남긴다
 * ===================================================================== */
RP.stop(true);
ok("리플레이를 끄면 내린 것을 되돌린다",
  banner.style.marginTop === "" && banner.style.top === "",
  banner.style.marginTop + " / " + banner.style.top);

/* =====================================================================
 * 7) 지표 칩 줄을 건드리지 않았다
 * ===================================================================== */
{
  const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
  ok("칩 줄은 찾기만 한다 (.tl-ind-bar)",
    CODE.indexOf('querySelector(".tl-ind-bar")') >= 0);
  ok("칩 줄의 자리·모양·접힘을 고치지 않는다",
    !/ind\.style|ind\.className|ind\.click|tl-ind-fold/.test(CODE));
  ok("App.ChartIndicators 를 부르지 않는다", CODE.indexOf("App.ChartIndicators") < 0);
  ok("칩 줄과 겹치는지 잴 때 우리 줄만 옮긴다 (head 만 style 을 받는다)",
    /head\.style\.marginTop/.test(CODE) && /head\.style\.top/.test(CODE));
}

/* =====================================================================
 * 8) 글씨를 안 줄였다 — 안내줄·도움말 글씨 크기 그대로
 * ===================================================================== */
{
  const 안내 = /\.tl-rp-banner\{[^}]*font-size:(\d+)px/.exec(SRC);
  const 도움말 = /\.tl-rp-hint\{[^}]*font-size:(\d+)px/.exec(SRC);
  ok("안내줄 글씨 16px 그대로", 안내 && Number(안내[1]) === 16, 안내 ? 안내[1] : "없음");
  ok("도움말 글씨 16px 그대로", 도움말 && Number(도움말[1]) === 16, 도움말 ? 도움말[1] : "없음");
}

/* =====================================================================
 * 9) 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-banner-ind-bar.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
