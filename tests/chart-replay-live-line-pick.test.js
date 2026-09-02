/* tests/chart-replay-live-line-pick.test.js
 * =========================================================================
 * 리플레이가 감출 선을 ★색★ 으로 집는다 — 2026-09-03 (수리팀)
 *   대상: js/chart-replay.js  (App.ChartReplay)
 * =========================================================================
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *
 * 리플레이를 켜면 「지금 시세」 를 가리키는 빨간 현재가 선을 감춰야 합니다.
 * 과거 화면인데 지금 값이 그려져 있으면 회원이 그걸 그 시점 값으로 읽습니다.
 *
 * 옛 코드는 감출 선을 ★"제목이 빈 첫 번째 가로선"★ 으로 집었습니다.
 *
 *     if (!liveLine && (!opts || !opts.title)) liveLine = ln;   ← 옛 코드
 *
 * 그런데 ★회원이 그은 수평선도 title:"" 입니다★ (js/chart-drawings.js:1922).
 * 저장된 수평선은 페이지를 열 때 되살아나고, 현재가 선은 첫 시세가 와야
 * 생기므로(js/chart.js:403) ★회원 선이 언제나 먼저★ 만들어집니다.
 * 그래서 엉뚱한 선을 집었습니다.
 *
 * 증상이 ★두 개★ 였습니다
 *   ① 빨간 현재가 선이 안 감춰짐  — 과거 화면에 지금 값이 남음
 *   ② 회원이 그은 수평선 하나가 조용히 사라짐 — 아무도 몰랐던 것
 *      (끄면 돌아오고 저장은 안 지워집니다. 자료 손실은 없습니다)
 *
 * 2026-09-03 실측 (localhost · 캔버스 화소를 직접 셈 · 리플레이 ON · 1440)
 *   그린 것 0개   빨강 0 · 축 0                       ← 그때도 정상이었음
 *   그린 것 1개   고치기 전  빨강 584 · 축 2983 · 금색 0
 *                 고친 뒤    빨강   0 · 축    0 · 금색 584
 *   ⚠️ ★그린 것이 하나라도 있어야★ 재현됩니다. 0개로 재면 그냥 통과합니다.
 *      그래서 이 봉인은 ★회원 선을 먼저 만들어 두고★ 검사합니다.
 *
 * 고친 방법 — 제목이 아니라 ★색★ 으로 집습니다.
 *   #FF5252 는 js/chart.js:50 COLORS.current 에만 있는 값입니다.
 *   그리기 팔레트(DRAW_COLORS)·선택색(#E7ECF5)·알람색(#A3CEFF) 어디에도
 *   없어서 회원 선과 겹치지 않습니다.
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-replay.js"), "utf8");
const CHART_SRC = fs.readFileSync(path.join(REPO, "js", "chart.js"), "utf8");
const DRAW_SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m\u2713\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m\u2717\u001b[0m " + name + (detail ? " \u2014 " + detail : ""));
  }
}

console.log("\n리플레이가 감출 선을 색으로 집는다");

const LIVE = "#FF5252";

/* =====================================================================
 * 0) 전제 — 두 선이 진짜로 「제목이 같고 색이 다른」 상태인가
 *    이 전제가 깨지면 아래 검사는 다 헛것이라 여기서 먼저 빨개집니다.
 * ===================================================================== */
{
  ok("js/chart.js 의 현재가 선 색이 " + LIVE + " 다",
    new RegExp("current:\\s*\"" + LIVE + "\"").test(CHART_SRC));
  ok("js/chart.js 의 현재가 선은 제목이 비어 있다 (title: \"\")",
    /createPriceLine\(\{[\s\S]{0,400}?title:\s*""/.test(CHART_SRC));
  ok("js/chart-drawings.js 의 회원 수평선도 제목이 비어 있다 (제목으로는 못 가린다)",
    /createPriceLine\(\{[\s\S]{0,400}?title:\s*""/.test(DRAW_SRC));
  ok("회원 그리기 팔레트에 " + LIVE + " 가 없다 (색이 겹치지 않는다)",
    DRAW_SRC.indexOf(LIVE) === -1);
}

/* ---------------------------------------------------------------------
 * 흉내 — Lightweight Charts 의 가로선만 있으면 됩니다.
 *   만들어진 선마다 색과 「지금 보이는지」 를 적어 둡니다.
 * ------------------------------------------------------------------- */
function 판만들기() {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<div class=\"tlc-toolbar\"></div>" +
    "<div class=\"chart-wrap\"><div id=\"c\"></div></div>" +
    "<div class=\"amitalk-order\"></div>" +
    "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
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

  const 선들 = []; /* { 색, 제목, 보임, 축라벨 } */
  let 봉수 = 0;
  let 자리 = 0;
  const ts = {
    scrollPosition() { return 자리; },
    scrollToPosition(p) { 자리 = p; },
    getVisibleLogicalRange() { return { from: 봉수 - 500, to: 봉수 - 1 + 자리 }; },
    setVisibleLogicalRange(r) { 자리 = r.to - (봉수 - 1); },
    fitContent() {},
    scrollToRealTime() { 자리 = 0; }
  };
  const chart = {
    addSeries() {
      let 자료 = [];
      return {
        seriesType() { return "Candlestick"; },
        setData(d) { 자료 = d.slice(); 봉수 = d.length; },
        update() {},
        data() { return 자료; },
        applyOptions() {},
        createPriceLine(opts) {
          const rec = {
            색: (opts && opts.color) || "",
            제목: (opts && opts.title) || "",
            보임: true,
            축라벨: !!(opts && opts.axisLabelVisible)
          };
          선들.push(rec);
          return {
            applyOptions(o) {
              if (o && "lineVisible" in o) rec.보임 = o.lineVisible;
              if (o && "axisLabelVisible" in o) rec.축라벨 = o.axisLabelVisible;
            }
          };
        },
        removePriceLine() {}
      };
    },
    timeScale() { return ts; },
    subscribeClick() {}, unsubscribeClick() {},
    subscribeCrosshairMove() {}, unsubscribeCrosshairMove() {},
    applyOptions() {}
  };
  win.LightweightCharts = { createChart() { return chart; } };
  win.App = {
    Storage: { load() { return null; }, save() { return true; } },
    Config: { getActiveSymbol() { return "BTCUSDT"; }, getActiveInterval() { return "1m"; } },
    Trading: { getSnapshot() { return { position: null, pendingOrder: null }; } },
    Utils: { formatCurrencyPlain(v) { return String(v); } },
    Bus: { on() {}, emit() {} }
  };
  win.eval(SRC);

  const 봉들 = [];
  for (let i = 0; i < 1000; i++) {
    봉들.push({ time: 1700000000 + i * 60, open: 100, high: 101, low: 99, close: 100 });
  }
  const c = win.LightweightCharts.createChart(win.document.getElementById("c"));
  const candle = c.addSeries("Candlestick");
  candle.setData(봉들);
  return { win: win, RP: win.App.ChartReplay, candle: candle, 선들: 선들, 봉들: 봉들 };
}

/* 회원이 그은 수평선 — js/chart-drawings.js:1922 와 같은 모양 */
function 회원선(candle, 색) {
  return candle.createPriceLine({
    price: 100, color: 색 || "#F0B429", lineWidth: 2, lineStyle: 2,
    axisLabelVisible: true, title: ""
  });
}
/* chart.js 의 현재가 선 — js/chart.js:403 과 같은 모양 */
function 현재가선(candle) {
  return candle.createPriceLine({
    price: 100, color: LIVE, lineWidth: 1, lineStyle: 0,
    axisLabelVisible: true, title: ""
  });
}

/* =====================================================================
 * 1) ★회원 선이 먼저★ 있을 때 — 이게 실제 회원 화면입니다
 *    (저장된 수평선은 페이지를 열 때 되살아나고, 현재가 선은 첫 시세를
 *     받아야 생기므로 언제나 회원 선이 먼저입니다)
 * ===================================================================== */
{
  const t = 판만들기();
  회원선(t.candle);
  현재가선(t.candle);
  const 그린것 = t.선들[0];
  const 빨강 = t.선들[1];

  ok("(전제) 선 두 개 다 제목이 비어 있다", 그린것.제목 === "" && 빨강.제목 === "");
  ok("(전제) 회원 선이 ★먼저★ 만들어졌다", 그린것.색 === "#F0B429" && 빨강.색 === LIVE);

  ok("리플레이를 켰다", t.RP.start(t.봉들[t.봉들.length - 280].time) === true);
  ok("★빨간 현재가 선이 감춰진다★ (증상 ①)", 빨강.보임 === false, "보임=" + 빨강.보임);
  ok("빨간 선의 가격축 라벨도 감춰진다", 빨강.축라벨 === false, "축라벨=" + 빨강.축라벨);
  ok("★회원이 그은 선은 그대로 있다★ (증상 ②)", 그린것.보임 === true, "보임=" + 그린것.보임);
  ok("회원 선의 가격축 라벨도 그대로다", 그린것.축라벨 === true, "축라벨=" + 그린것.축라벨);

  t.RP.stop(true);
  ok("끄면 빨간 현재가 선이 돌아온다", 빨강.보임 === true, "보임=" + 빨강.보임);
  ok("끈 뒤에도 회원 선은 그대로다", 그린것.보임 === true, "보임=" + 그린것.보임);
}

/* =====================================================================
 * 2) 회원 선이 ★여러 개★ 여도 하나도 안 사라진다
 *    (라이브에서도 수평선 2개 중 딱 하나가 사라졌습니다)
 * ===================================================================== */
{
  const t = 판만들기();
  회원선(t.candle, "#F0B429");
  회원선(t.candle, "#BA94DB");
  회원선(t.candle, "#F8B877");
  현재가선(t.candle);
  t.RP.start(t.봉들[t.봉들.length - 280].time);

  const 회원들 = t.선들.filter(function (r) { return r.색 !== LIVE; });
  const 빨강 = t.선들.filter(function (r) { return r.색 === LIVE; })[0];
  ok("회원 선 3개가 모두 그대로다",
    회원들.length === 3 && 회원들.every(function (r) { return r.보임 === true; }),
    회원들.map(function (r) { return r.색 + ":" + r.보임; }).join(" "));
  ok("빨간 현재가 선만 감춰졌다", 빨강.보임 === false);
}

/* =====================================================================
 * 3) 그린 것이 ★0개★ 여도 그대로 된다 (옛 코드도 통과하던 자리)
 * ===================================================================== */
{
  const t = 판만들기();
  현재가선(t.candle);
  t.RP.start(t.봉들[t.봉들.length - 280].time);
  ok("그린 것 0개 — 빨간 현재가 선이 감춰진다", t.선들[0].보임 === false);
  t.RP.stop(true);
  ok("그린 것 0개 — 끄면 돌아온다", t.선들[0].보임 === true);
}

/* =====================================================================
 * 4) 순서가 뒤바뀌어도 (현재가 선이 먼저 생겨도) 맞게 집는다
 * ===================================================================== */
{
  const t = 판만들기();
  현재가선(t.candle);
  회원선(t.candle);
  t.RP.start(t.봉들[t.봉들.length - 280].time);
  ok("현재가 선이 먼저였어도 그것만 감춘다",
    t.선들[0].보임 === false && t.선들[1].보임 === true,
    "빨강=" + t.선들[0].보임 + " 회원=" + t.선들[1].보임);
}

/* =====================================================================
 * 5) 진입가처럼 제목이 있는 선은 원래대로 안 건드린다
 * ===================================================================== */
{
  const t = 판만들기();
  t.candle.createPriceLine({ price: 100, color: "#1D5FD6", title: "진입 100", axisLabelVisible: true });
  현재가선(t.candle);
  t.RP.start(t.봉들[t.봉들.length - 280].time);
  ok("진입가 선은 그대로다", t.선들[0].보임 === true);
  ok("현재가 선만 감춰졌다", t.선들[1].보임 === false);
}

/* =====================================================================
 * 6) 소스 되돌림 방지 — 제목으로 집는 옛 방식이 돌아오지 않게
 * ===================================================================== */
{
  ok("★제목으로 집던 옛 줄이 없다★ ((!opts || !opts.title) 로 고르지 않는다)",
    !/!liveLine\s*&&\s*\(!opts\s*\|\|\s*!opts\.title\)/.test(SRC));
  ok("색으로 집는다 (liveLine 을 정하는 줄에 color 가 있다)",
    /!liveLine\s*&&[^\n]*opts\.color/.test(SRC));
  ok("현재가 선 색이 이 파일 안 한 곳(LIVE_LINE_COLOR)에만 적혀 있다",
    (SRC.match(/#FF5252/g) || []).length === 1,
    String((SRC.match(/#FF5252/g) || []).length) + "곳");
  ok("그 한 곳이 js/chart.js 의 값과 같다",
    new RegExp("LIVE_LINE_COLOR\\s*=\\s*\"" + LIVE + "\"").test(SRC));
}

/* =====================================================================
 * 7) 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-replay-live-line-pick.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
