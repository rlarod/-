/* tests/chart-overlay-4way-census.test.js
 * =========================================================================
 * ★차트 위에 겹쳐 뜨는 것들이 서로 안 싸우는가★ — 팀 사이에 낀 자리
 *   대상: js/chart-replay.js (자리 다시잡기)  ·  census: js/chart*.js 전부
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 만드나 ─────────────────────────────────────────────────────────
 * 차트 위에 겹쳐 뜨는 것이 넷입니다. ★만든 팀이 다 다릅니다.★
 *
 *   지표 칩 줄     .tl-ind-bar     js/chart-indicators.js   z 6
 *   그린 것 목록   .tl-draw-list   js/chart-drawings.js     z 8
 *   리플레이 안내줄 .tl-rp-banner  js/chart-replay.js       z 18(층)
 *   리플레이 조작막대 .tl-rp-bar   js/chart-replay.js       z 18(층)
 *
 * 지금까지 봉인은 ★쌍★ 으로만 있었습니다 —
 *   tests/chart-replay-banner-ind-bar.test.js     안내줄 ↔ 칩 줄
 *   tests/chart-replay-draw-list-clash.test.js    막대 ↔ 목록
 * 두 쌍을 따로 고치면 ★셋이 동시에 뜰 때★ 는 아무도 안 봅니다. 실제로 자리는
 * 사슬로 정해집니다 — 칩 줄이 안내줄을 밀고, 안내줄이 막대의 천장을 정하고,
 * 목록이 막대를 들어 올립니다. ★한 고리만 어긋나도 사슬 전체가 틀어집니다.★
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *   [1] 겹쳐 뜨는 것 census — ★새로 하나 생기면 여기서 빨개집니다★
 *   [2] 자리 사슬 — relayout 이 ★안내줄 먼저, 막대 나중★ 인가
 *   [3] 행동 — 여러 형상에서 넷이 ★실제로★ 안 겹치는가 (진짜 코드로)
 *   [4] ★아무도 안 보는 쌍★ 을 이름 붙여 적어 둔다 (안내줄 ↔ 목록)
 *   [5] 돌연변이 — 고리를 하나씩 끊으면 반드시 겹쳐야 한다
 *
 * ── 자리를 어떻게 재나 ────────────────────────────────────────────────
 * jsdom 은 화면을 안 그리므로 네모(rect)를 우리가 넣어 줍니다. 넣는 값은
 * ★브라우저 실측에서 가져옵니다★ —
 *   1440 : 막대 150,700~550,752 · 안내줄 20,108~680,166 · 목록 20,560~380,740
 *          (tests/chart-replay-draw-list-clash.test.js 2026-09-02 실측)
 *   360  : 칩 줄 23,62~263,85 · 안내줄 21,62~339,120
 *          (tests/chart-replay-banner-ind-bar.test.js 2026-09-02 실측)
 * 그리고 ★자리잡기 계산은 js/chart-replay.js 의 진짜 코드★ 를 그대로 돌립니다.
 * 이 파일이 계산을 베껴 쓰지 않습니다.
 *
 * 창에 style 이 붙으면(marginTop · top · transform) 네모도 그만큼 움직이게
 * 해 두었습니다 — 브라우저가 하는 일과 같습니다. 이게 없으면 두 번째 계산이
 * 첫 번째 결과를 못 보고 늘 옛 자리를 봅니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const REPLAY_SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m" + "✓" + ESC + "[0m";
const NGM = ESC + "[31m" + "✗" + ESC + "[0m";
let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + OKM + " " + 제목); }
  else { fail++; console.log("  " + NGM + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

console.log("\n차트 위에 겹쳐 뜨는 넷이 서로 안 싸우는가");

/* =========================================================================
 * [1] census — 차트 모듈이 주입하는 「겹쳐 뜨는 것」 전부
 * ========================================================================= */
절("[1] 겹쳐 뜨는 것 census (js/chart*.js 를 전부 읽어서)");

/* 주입 CSS 문자열에서  ".무엇{...z-index:N...}"  를 그대로 긁습니다.
   ★손으로 목록을 적지 않습니다★ — 새 모듈이 생겨도 자동으로 들어옵니다. */
function 겹침요소들() {
  const out = [];
  fs.readdirSync(path.join(REPO, "js"))
    .filter((f) => /^chart.*\.js$/.test(f))
    .forEach((f) => {
      const src = fs.readFileSync(path.join(REPO, "js", f), "utf8");
      const re = /"(\.[a-zA-Z0-9_ .>-]+)\{([^"]*z-index:\s*(\d+)[^"]*)"/g;
      let m;
      while ((m = re.exec(src))) {
        out.push({
          파일: "js/" + f,
          선택자: m[1].trim(),
          z: Number(m[3]),
          자리: /position:\s*([a-z]+)/.exec(m[2]) ? /position:\s*([a-z]+)/.exec(m[2])[1] : "(없음)",
          클릭통과: /pointer-events:\s*none/.test(m[2])
        });
      }
    });
  return out.sort((a, b) => (a.z - b.z) || (a.선택자 < b.선택자 ? -1 : 1));
}

const 겹침목록 = 겹침요소들();
겹침목록.forEach((e) => {
  console.log("      " + String(e.z).padStart(4) + "  " + e.선택자 +
    "  (" + e.자리 + (e.클릭통과 ? " · 클릭통과" : "") + ")  " + e.파일);
});

/* 2026-09-03 현재. ★새로 생기면 여기서 빨개집니다★ —
   그때 할 일은 "이 새 창이 넷 중 누구와 겹칠 수 있나" 를 사람이 한 번 보는 것입니다. */
const 알려진 = [
  ".tl-kit-plabel|3", ".tl-osc-label|3", ".tl-draw-chip|6", ".tl-ind-bar|6", ".tl-zoom-chip|6",
  ".tl-style-pick|7", ".tl-draw-list|8", ".tl-draw-input|9", ".tl-draw-toast|9",
  ".tl-face-pick|9", ".tl-rp-layer|18", ".tl-rp-lock|40", ".tl-gd-panel|70",
  ".tl-tz-menu|70", ".tl-rp-mlock|9000"
];
const 지금 = 겹침목록.map((e) => e.선택자 + "|" + e.z);
ok("겹쳐 뜨는 것이 " + 겹침목록.length + "개다 (알려진 " + 알려진.length + "개와 같다)",
  지금.slice().sort().join(" , ") === 알려진.slice().sort().join(" , "),
  "지금: " + 지금.join(" , ") + "\n         알려진: " + 알려진.join(" , ") +
  "\n         → 새 창이 생겼습니다. ★넷(칩 줄·목록·안내줄·막대)과 겹칠 수 있는지★ 를 " +
  "사람이 한 번 보고, 이 목록에 더하세요");

/* 층 순서 — 나중에 뜬 것이 위에 있어야 회원이 지금 만지는 것을 봅니다 */
function z(sel) {
  const e = 겹침목록.filter((x) => x.선택자 === sel)[0];
  return e ? e.z : -1;
}
ok("칩 줄(" + z(".tl-ind-bar") + ") < 그린 것 목록(" + z(".tl-draw-list") + ") < 리플레이 층(" +
  z(".tl-rp-layer") + ") 차례다",
  z(".tl-ind-bar") < z(".tl-draw-list") && z(".tl-draw-list") < z(".tl-rp-layer"),
  "층 차례가 뒤집히면 회원이 방금 연 창이 뒤로 숨습니다");
ok("색·굵기 창(" + z(".tl-style-pick") + ")이 칩(" + z(".tl-draw-chip") + ") 위에 있다",
  z(".tl-style-pick") > z(".tl-draw-chip"));
ok("알림줄(" + z(".tl-draw-toast") + ")이 목록(" + z(".tl-draw-list") + ") 위에 있다",
  z(".tl-draw-toast") > z(".tl-draw-list"));

/* =========================================================================
 * [2] 자리 사슬 — 누가 누구를 보고 비키는가
 * ========================================================================= */
절("[2] 자리 사슬 — 안내줄 먼저, 막대 나중");
{
  const relayout = /function relayout\(\)\s*\{([\s\S]*?)\n  \}/.exec(REPLAY_SRC);
  ok("relayout 을 찾았다", !!relayout);
  const 본문 = relayout ? relayout[1] : "";
  const i배너 = 본문.indexOf("placeBanner()");
  const i막대 = 본문.indexOf("placeBar()");
  ok("relayout 이 둘을 다 부른다", i배너 >= 0 && i막대 >= 0, 본문.trim());
  ok("★안내줄을 먼저 맞추고 막대를 나중에 맞춘다★ (막대가 안내줄 자리를 봅니다)",
    i배너 >= 0 && i막대 > i배너, "차례가 뒤집히면 막대가 ★옛 안내줄 자리★ 를 봅니다");

  const 배너본문 = /function placeBanner\(\)\s*\{([\s\S]*?)\n  \}/.exec(REPLAY_SRC);
  ok("안내줄이 칩 줄을 보고 비킨다 (.tl-ind-bar 를 잽니다)",
    !!배너본문 && /indBarEl\(\)/.test(배너본문[1]), "칩 줄을 안 봅니다");
  const 막대본문 = /function placeBar\(\)\s*\{([\s\S]*?)\n  \}/.exec(REPLAY_SRC);
  ok("막대가 그린 것 목록을 보고 비킨다 (.tl-draw-list 를 잽니다)",
    !!막대본문 && /drawListEl\(\)/.test(막대본문[1]), "목록을 안 봅니다");
  ok("막대의 천장이 안내줄 아래다 (barTopLimit 이 안내줄을 봅니다)",
    /function barTopLimit\(\)[\s\S]{0,500}ui\.banner/.test(REPLAY_SRC), "안내줄을 안 봅니다");
  ok("스크롤·창크기·목록 생김이 바뀌면 다시 잡는다",
    /addEventListener\("scroll", placeBarSoon/.test(REPLAY_SRC) &&
    /addEventListener\("resize", placeBarSoon/.test(REPLAY_SRC) &&
    /MutationObserver\(placeBarSoon\)/.test(REPLAY_SRC),
    "한 번만 잡고 말면 회원이 스크롤하는 순간 다시 겹칩니다");
}

/* =========================================================================
 * 가짜 화면 — 진짜 js/chart-replay.js 를 태워 자리를 잡게 합니다
 * ========================================================================= */
function 띄우기(형상, 소스) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    '<div class="chart-panel"><div class="tlc-toolbar"></div>' +
    '<div class="chart-wrap"><div id="c"></div></div></div>' +
    "</body></html>", { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;
  const doc = win.document;
  win.innerWidth = 형상.w;
  win.innerHeight = 형상.h;
  win.setInterval = () => 0; win.clearInterval = () => {};
  win.setTimeout = () => 0; win.clearTimeout = () => {};
  win.requestAnimationFrame = undefined;

  /* 네모는 우리가 넣고, ★style 이 붙은 만큼 같이 움직이게★ 합니다.
     (marginTop · top 은 CSS 기본값이 8px 이라 8 을 뺀 만큼이 실제로 내려간 값입니다) */
  const 밑네모 = new Map();
  function 지금네모(el) {
    const r = 밑네모.get(el);
    if (!r) return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 };
    let dy = 0;
    const mt = parseFloat(el.style.marginTop);
    if (!isNaN(mt)) dy += mt - 8;
    const tp = parseFloat(el.style.top);
    if (!isNaN(tp)) dy += tp - 8;
    const tf = /translateY\((-?\d+(?:\.\d+)?)px\)/.exec(el.style.transform || "");
    if (tf) dy += Number(tf[1]);
    return { left: r.left, right: r.right, top: r.top + dy, bottom: r.bottom + dy,
      width: r.right - r.left, height: r.bottom - r.top, x: r.left, y: r.top + dy };
  }
  win.Element.prototype.getBoundingClientRect = function () { return 지금네모(this); };

  const 첫봉 = 1700000000;
  const 봉들 = [];
  for (let i = 0; i < 300; i++) 봉들.push({ time: 첫봉 + i * 60, open: 100, high: 101, low: 99, close: 100 });
  function 가짜차트() {
    let range = { from: 0, to: 100 };
    let 위치 = 0;
    const ts = {
      getVisibleLogicalRange: () => range, setVisibleLogicalRange: (r) => { range = r; },
      scrollPosition: () => 위치, scrollToPosition: (p) => { 위치 = p; },
      scrollToRealTime: () => { 위치 = 0; }, fitContent() {},
      subscribeVisibleLogicalRangeChange() {}, unsubscribeVisibleLogicalRangeChange() {}
    };
    return {
      addSeries() {
        let 자료 = [];
        return { seriesType: () => "Candlestick", setData(d) { 자료 = d.slice(); }, update() {},
          data: () => 자료, applyOptions() {}, createPriceLine: () => ({ applyOptions() {} }),
          removePriceLine() {} };
      },
      timeScale: () => ts, subscribeClick() {}, unsubscribeClick() {},
      subscribeCrosshairMove() {}, unsubscribeCrosshairMove() {}, applyOptions() {}
    };
  }
  win.LightweightCharts = { createChart: () => 가짜차트() };
  win.App = {
    Storage: { load: () => null, save: () => true },
    Config: { getActiveSymbol: () => "BTCUSDT", getActiveInterval: () => "1m" },
    Trading: { getSnapshot: () => ({ position: null, pendingOrder: null }) },
    Utils: { formatCurrencyPlain: (v) => String(v) },
    Bus: { on() {}, emit() {} }
  };
  win.eval(소스 || REPLAY_SRC);
  const RP = win.App.ChartReplay;
  const chart = win.LightweightCharts.createChart(doc.getElementById("c"));
  chart.addSeries("Candlestick").setData(봉들);

  const wrap = doc.querySelector(".chart-wrap");
  밑네모.set(wrap, 형상.wrap);
  const 켰나 = RP.start(봉들[봉들.length - 40].time);
  const bar = doc.querySelector(".tl-rp-bar");
  const banner = doc.querySelector(".tl-rp-banner");
  밑네모.set(bar, 형상.막대);
  밑네모.set(banner, 형상.안내줄);

  const chip = doc.createElement("div");
  chip.className = "tl-ind-bar";
  wrap.appendChild(chip);
  밑네모.set(chip, 형상.칩줄);

  let list = null;
  if (형상.목록) {
    list = doc.createElement("div");
    list.className = "tl-draw-list";
    wrap.appendChild(list);
    밑네모.set(list, 형상.목록);
  }
  RP.relayoutForTest();
  const 자리 = RP.getBarPlacementForTest();
  const 결과 = {
    켰나: 켰나,
    안내줄: 지금네모(banner),
    막대: 자리.folded ? null : 지금네모(bar),   /* 접히면 CSS 가 display:none 입니다 */
    칩줄: 지금네모(chip),
    목록: list ? 지금네모(list) : null,
    접힘: 자리.folded, lift: 자리.lift
  };
  dom.window.close();
  return 결과;
}

function 겹침(a, b) {
  if (!a || !b) return 0;
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? Math.round(x * y) : 0;
}
function 자리글(r) { return r ? Math.round(r.top) + "~" + Math.round(r.bottom) : "(없음)"; }

/* 형상 — 앞 두 개는 브라우저 실측 자리 그대로, 나머지는 그 자리에서
   ★칩 줄 높이·목록 높이만★ 바꿔 본 것입니다 (회원이 지표를 켜거나
   그린 것이 늘면 실제로 그렇게 바뀝니다) */
const 형상들 = [
  { 이름: "1440 실측 · 목록 3줄", w: 1440, h: 900,
    wrap: { left: 0, right: 700, top: 100, bottom: 800 },
    막대: { left: 150, right: 550, top: 700, bottom: 752 },
    안내줄: { left: 20, right: 680, top: 108, bottom: 166 },
    칩줄: { left: 8, right: 300, top: 106, bottom: 129 },
    목록: { left: 20, right: 380, top: 560, bottom: 740 } },
  { 이름: "360 실측 · 좁은 칸", w: 360, h: 800,
    wrap: { left: 15, right: 345, top: 55, bottom: 400 },
    막대: { left: 49, right: 311, top: 334, bottom: 386 },
    안내줄: { left: 21, right: 339, top: 62, bottom: 120 },
    칩줄: { left: 23, right: 263, top: 62, bottom: 85 },
    목록: { left: 23, right: 337, top: 172, bottom: 344 } },
  { 이름: "1440 · 칩 줄 펼침(76px)", w: 1440, h: 900,
    wrap: { left: 0, right: 700, top: 100, bottom: 800 },
    막대: { left: 150, right: 550, top: 700, bottom: 752 },
    안내줄: { left: 20, right: 680, top: 108, bottom: 166 },
    칩줄: { left: 8, right: 300, top: 106, bottom: 182 },
    목록: { left: 20, right: 380, top: 560, bottom: 740 } },
  { 이름: "1440 · 목록 큼(310px)", w: 1440, h: 900,
    wrap: { left: 0, right: 700, top: 100, bottom: 800 },
    막대: { left: 150, right: 550, top: 700, bottom: 752 },
    안내줄: { left: 20, right: 680, top: 108, bottom: 166 },
    칩줄: { left: 8, right: 300, top: 106, bottom: 129 },
    목록: { left: 20, right: 380, top: 430, bottom: 740 } },
  { 이름: "1440 · 칩 줄 아주 김 + 목록 큼", w: 1440, h: 900,
    wrap: { left: 0, right: 700, top: 100, bottom: 800 },
    막대: { left: 150, right: 550, top: 700, bottom: 752 },
    안내줄: { left: 20, right: 680, top: 108, bottom: 166 },
    칩줄: { left: 8, right: 300, top: 106, bottom: 282 },
    목록: { left: 20, right: 380, top: 400, bottom: 740 } },
  { 이름: "360 · 목록 없음", w: 360, h: 800,
    wrap: { left: 15, right: 345, top: 55, bottom: 400 },
    막대: { left: 49, right: 311, top: 334, bottom: 386 },
    안내줄: { left: 21, right: 339, top: 62, bottom: 120 },
    칩줄: { left: 23, right: 263, top: 62, bottom: 85 }, 목록: null }
];

/* 서로 비킬 장치가 ★있는★ 쌍 — 여기서 겹치면 사슬이 끊어진 것입니다 */
const 봐야하는쌍 = [["안내줄", "칩줄"], ["안내줄", "막대"], ["막대", "목록"], ["막대", "칩줄"]];

/* =========================================================================
 * [3] 행동 — 넷이 실제로 안 겹치는가
 * ========================================================================= */
절("[3] 행동 — 여러 형상에서 넷이 안 겹친다 (진짜 코드로 자리를 잡습니다)");
const 잰것들 = 형상들.map((f) => ({ 형상: f, r: 띄우기(f) }));
잰것들.forEach(({ 형상, r }) => {
  ok(형상.이름 + " — 리플레이가 켜졌다 · 안내줄 " + 자리글(r.안내줄) +
    " · 막대 " + (r.접힘 ? "(접힘)" : 자리글(r.막대)) +
    " · 칩줄 " + 자리글(r.칩줄) + " · 목록 " + 자리글(r.목록),
    r.켰나 === true);
  봐야하는쌍.forEach(([a, b]) => {
    const v = 겹침(r[a], r[b]);
    ok(형상.이름 + " — " + a + " ↔ " + b + " 가 안 겹친다", v === 0, "겹침 " + v + "px²");
  });
});
{
  /* 목록이 없으면 막대가 원래 자리에 그대로 있어야 합니다 (괜히 비키면 그것도 고장) */
  const 없는것 = 잰것들.filter((x) => !x.형상.목록)[0];
  ok("목록이 없으면 막대를 안 민다 (lift 0 · 안 접힘)",
    없는것 && 없는것.r.lift === 0 && 없는것.r.접힘 === false,
    JSON.stringify(없는것 && { lift: 없는것.r.lift, 접힘: 없는것.r.접힘 }));
}

/* =========================================================================
 * [4] ★아무도 안 보는 쌍★ — 있는 그대로 적어 둡니다
 * ========================================================================= */
절("[4] 아직 아무도 안 보는 쌍 (안내줄 ↔ 목록 · 목록 ↔ 칩 줄)");
{
  /* 그린 것 목록은 자리가 모자라면 ★화면 위끝(8px)까지★ 올라옵니다
     (js/chart-drawings.js placeList — tests/chart-draw-list-fit.test.js 참조).
     그 자리는 안내줄·칩 줄이 있는 자리입니다. ★비킴 장치가 없습니다.★ */
  const 형상 = {
    이름: "목록이 화면 위끝까지 올라온 자리", w: 360, h: 800,
    wrap: { left: 15, right: 345, top: 55, bottom: 400 },
    막대: { left: 49, right: 311, top: 334, bottom: 386 },
    안내줄: { left: 21, right: 339, top: 62, bottom: 120 },
    칩줄: { left: 23, right: 263, top: 62, bottom: 85 },
    목록: { left: 23, right: 337, top: 8, bottom: 112 }
  };
  const r = 띄우기(형상);
  const 안내줄x목록 = 겹침(r.안내줄, r.목록);
  const 목록x칩줄 = 겹침(r.목록, r.칩줄);

  /* ⚠️ 이건 「고쳐졌다」 가 아니라 「아직 안 고쳤다」 를 못 박는 것입니다.
     누가 비킴 장치를 넣으면 이 두 줄이 빨개지고, 그때 위 [3] 의 봐야하는쌍 에
     이 쌍을 옮겨 적으면 됩니다. (프로젝트에서 마켓 상품 5종에 쓰는 방식과 같습니다) */
  ok("★아직 안 고침★ — 안내줄과 목록은 겹칠 수 있다 (지금 " + 안내줄x목록 + "px²)",
    안내줄x목록 > 0,
    "겹침이 없어졌습니다 — 비킴 장치가 생겼다면 이 쌍을 [3] 의 봐야하는쌍 으로 옮기세요");
  ok("★아직 안 고침★ — 칩 줄과 목록도 겹칠 수 있다 (지금 " + 목록x칩줄 + "px²)",
    목록x칩줄 > 0,
    "겹침이 없어졌습니다 — 위와 같이 [3] 으로 옮기세요");

  /* 겹쳐도 ★단추는 눌려야★ 합니다. 리플레이 층이 클릭을 삼키면 회원은
     목록 단추를 눌렀는데 아무 일도 안 일어납니다 — 조용한 고장입니다. */
  const 층 = 겹침목록.filter((e) => e.선택자 === ".tl-rp-layer")[0];
  ok("리플레이 층이 클릭을 안 삼킨다 (pointer-events:none)",
    !!층 && 층.클릭통과 === true,
    "★이게 빠지면 위 겹침이 곧바로 '단추가 안 눌림' 이 됩니다★");
  ok("안내줄도 클릭을 안 삼킨다",
    /\.tl-rp-banner\{[^"]*pointer-events:\s*none/.test(REPLAY_SRC) ||
    /\.tl-rp-layer\{[^"]*pointer-events:\s*none/.test(REPLAY_SRC),
    "안내줄이 클릭을 삼키면 뒤에 있는 목록·칩이 안 눌립니다");
}

/* =========================================================================
 * [5] ★돌연변이★ — 고리를 하나씩 끊으면 반드시 겹친다
 *     ★사본만 고칩니다. 원본 js/chart-replay.js 는 안 건드립니다★
 * ========================================================================= */
절("[5] 돌연변이 — 고리를 끊으면 겹친다");
{
  const 배너뺀소스 = REPLAY_SRC.replace(/(function relayout\(\)\s*\{\s*)placeBanner\(\);/, "$1");
  ok("사본에서 placeBanner 호출을 뺐다", 배너뺀소스 !== REPLAY_SRC);
  let 겹친형상 = 0;
  형상들.forEach((f) => {
    const r = 띄우기(f, 배너뺀소스);
    if (겹침(r.안내줄, r.칩줄) > 0) 겹친형상++;
  });
  ok("★안내줄을 안 비키면 칩 줄과 겹친다★ (" + 겹친형상 + "/" + 형상들.length + " 형상)",
    겹친형상 > 0, "안 겹치면 [3] 의 안내줄↔칩줄 검사는 아무것도 안 지키는 것입니다");

  const 막대뺀소스 = REPLAY_SRC.replace(/(function relayout\(\)\s*\{[\s\S]{0,80}?)placeBar\(\);/, "$1");
  ok("사본에서 placeBar 호출을 뺐다", 막대뺀소스 !== REPLAY_SRC);
  let 겹친형상2 = 0;
  형상들.forEach((f) => {
    if (!f.목록) return;
    const r = 띄우기(f, 막대뺀소스);
    if (겹침(r.막대, r.목록) > 0) 겹친형상2++;
  });
  ok("★막대를 안 비키면 목록과 겹친다★ (" + 겹친형상2 + " 형상)", 겹친형상2 > 0,
    "안 겹치면 [3] 의 막대↔목록 검사는 아무것도 안 지키는 것입니다");

  /* 차례를 뒤집으면 — 막대가 ★아직 안 내려간★ 안내줄 자리를 보고 잽니다 */
  const 뒤집은소스 = REPLAY_SRC.replace(
    /(function relayout\(\)\s*\{\s*)placeBanner\(\);(\s*)placeBar\(\);/,
    "$1placeBar();$2placeBanner();"
  );
  ok("사본에서 차례를 뒤집었다 (막대 먼저 · 안내줄 나중)", 뒤집은소스 !== REPLAY_SRC);
  let 달라진형상 = [];
  형상들.forEach((f) => {
    const 바른 = 띄우기(f);
    const 뒤집 = 띄우기(f, 뒤집은소스);
    const 같나 = 바른.접힘 === 뒤집.접힘 && 바른.lift === 뒤집.lift;
    if (!같나) 달라진형상.push(f.이름 + "(접힘 " + 바른.접힘 + "→" + 뒤집.접힘 +
      " · lift " + 바른.lift + "→" + 뒤집.lift + ")");
  });
  /* 달라지기만 하는 게 아니라 ★실제로 겹칩니다★ — 그것까지 봅니다 */
  let 뒤집어서겹친것 = [];
  형상들.forEach((f) => {
    const 뒤집 = 띄우기(f, 뒤집은소스);
    const v = 겹침(뒤집.안내줄, 뒤집.막대);
    if (v > 0) 뒤집어서겹친것.push(f.이름 + " " + v + "px²");
  });
  ok("★차례를 뒤집으면 막대가 안내줄과 겹친다★ (" + 뒤집어서겹친것.join(" / ") + ")",
    뒤집어서겹친것.length > 0,
    "겹치지는 않더라도 결과가 달라지면 아래 줄이 잡습니다");
  ok("★차례가 뒤집히면 결과가 달라진다★ — 차례에 뜻이 있다 (" + 달라진형상.length + " 형상)",
    달라진형상.length > 0,
    "어느 형상에서도 안 달라지면 [2] 의 차례 검사는 아무 뜻이 없습니다");
  if (달라진형상.length) console.log("      달라진 형상: " + 달라진형상.join(" / "));

  ok("원본 js/chart-replay.js 가 그대로다 (사본만 고쳤습니다)",
    fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8") === REPLAY_SRC);
}

/* =========================================================================
 * [6] 등록
 * ========================================================================= */
절("[6] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-overlay-4way-census.test.js") >= 0);
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다 */
process.exit(0);
