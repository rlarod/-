/* tests/chart-brush-seal.test.js
 * =========================================================================
 * 브러시(끌어서 자유롭게 긋기) 봉인 — 2026-08-28
 * =========================================================================
 * 기록팀 / 본부장 배정. 차트팀이 5차로 브러시를 열면서 붙인 실측을 못 박습니다.
 *
 * ── 무엇보다 이것 하나 ─────────────────────────────────────────────────
 *   "브러시를 끄면 차트 조작이 되돌아오는가"
 *
 *   차트팀이 자기 코드에서 잡은 조용한 고장입니다. 처음 판은
 *   chart.options() 가 준 객체를 그대로 들고 있었는데, 그게 차트가 쥐고 있는
 *   바로 그 객체라 applyOptions({handleScroll:false}) 를 걸면 우리가 "원래
 *   값" 이라고 들고 있던 것까지 같이 false 가 됐습니다.
 *   그러면 브러시를 끌 때 false 를 도로 써 넣게 되어
 *   **브러시를 한 번 쓰면 차트를 영영 못 끄는 상태**가 됩니다.
 *   오류도 안 나고 차트도 멀쩡히 보입니다. 회원은 "차트가 안 움직이네" 만 압니다.
 *
 *   차트팀 실측 (2026-08-28)
 *       handleScroll   브러시 중 전부 false  ->  끝내기 뒤 전부 true
 *       touch-action   auto -> none -> auto
 *
 *   주의 — 이 파일의 가짜 차트는 lightweight-charts 가 실제로 하는 일을 흉내 냅니다.
 *   그 라이브러리는 applyOptions 에 boolean 을 주면 안쪽에서 네 갈래
 *   ({mouseWheel, pressedMouseMove, horzTouchDrag, vertTouchDrag}) 로 펼친 뒤
 *   기존 객체에 덮어씁니다(제자리 병합). 그래서 참조를 들고 있으면 같이 물듭니다.
 *   가짜를 "값을 통째로 갈아끼우는" 식으로 만들면 이 버그를 못 잡습니다.
 *   그래서 일부러 제자리 병합으로 만들었습니다.
 *
 * ── 나머지로 못 박는 것 ────────────────────────────────────────────────
 *   [3] 종목·봉 간격별 저장·복원 (차트팀 실측 시나리오 그대로)
 *         BTC 1m 1획 -> QQQ 0획 -> QQQ 1획 -> BTC 복귀 1획 -> QQQ 다시 1획
 *         BTC 1m 1획 -> 5분봉 0획 -> 1분봉 복귀 1획
 *   [4] 폰에서 그릴 때 페이지가 같이 밀리지 않는다
 *         360 실측 — window.scrollY 472 -> 472
 *         (jsdom 에는 진짜 스크롤이 없어서, 그것을 막는 두 가지를 봅니다 —
 *          touch-action:none 과 pointerdown/up 의 preventDefault)
 *   [5] 칩이 "브러시 · 획 n / 되돌리기 / 끝내기" 로 바뀐다
 *         360 실측 — 칩 190x30, 왼쪽 23, 주문바 55px 위
 *         (자리 계산 자체는 tests/chart-chip-viewport-seal.test.js 가 봅니다)
 *   [6] 손이 떨리는 만큼은 점을 안 찍는다 / 점 상한이 있다 / 톡 눌러도 안 남는다
 *
 * 가짜 차트·가짜 저장소만 씁니다. 서버도 브라우저도 부르지 않습니다.
 * tests/ 밖은 한 글자도 고치지 않았습니다 (js/chart.js md5 를 아래에서 확인).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC_PATH = path.join(REPO, "js", "chart-drawings.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/* -------------------------------------------------------------------------
 * 가짜 차트 — lightweight-charts 의 옵션 병합 방식까지 흉내 냅니다
 * ----------------------------------------------------------------------- */
function 기본조작옵션() {
  return {
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }
  };
}

/** boolean 이면 네 갈래로 펼칩니다 (라이브러리가 안에서 하는 일) */
function 펼치기(원래, 값) {
  if (typeof 값 !== "boolean") return 값;
  const out = {};
  Object.keys(원래).forEach(function (k) { out[k] = 값; });
  return out;
}

/** 제자리 병합 — 있는 객체를 갈아끼우지 않고 그 안을 고칩니다 */
function 제자리병합(목표, 새것) {
  Object.keys(새것).forEach(function (k) {
    if (새것[k] && typeof 새것[k] === "object" && 목표[k] && typeof 목표[k] === "object") {
      제자리병합(목표[k], 새것[k]);
    } else {
      목표[k] = 새것[k];
    }
  });
}

function 가짜차트(옵션시작값) {
  const opts = 옵션시작값 || 기본조작옵션();
  const 적용기록 = [];
  const 캔들 = [];
  for (let i = 0; i < 500; i++) 캔들.push({ time: 1700000000 + i * 60, open: 1, high: 2, low: 0, close: 1 });

  const series = {
    seriesType: () => "Candlestick",
    data: () => 캔들,
    attachPrimitive: () => {},
    detachPrimitive: () => {},
    createPriceLine: () => ({}),
    removePriceLine: () => {},
    priceToCoordinate: (p) => 80000 - p,
    coordinateToPrice: (y) => 80000 - y,
    applyOptions: () => {}
  };

  const chart = {
    panes: () => [{ getSeries: () => [series] }],
    subscribeClick: () => {},
    subscribeCrosshairMove: () => {},
    unsubscribeClick: () => {},
    unsubscribeCrosshairMove: () => {},
    timeScale: () => ({
      coordinateToLogical: (x) => x / 6,
      logicalToCoordinate: (l) => l * 6,
      timeToCoordinate: () => null,
      getVisibleLogicalRange: () => ({ from: 0, to: 100 }),
      setVisibleLogicalRange: () => {},
      fitContent: () => {}
    }),
    options: () => opts,
    applyOptions: (o) => {
      적용기록.push(JSON.parse(JSON.stringify(o)));
      const 펴진것 = {};
      Object.keys(o).forEach(function (k) {
        펴진것[k] = (k === "handleScroll" || k === "handleScale")
          ? 펼치기(opts[k] && typeof opts[k] === "object" ? opts[k] : { v: true }, o[k])
          : o[k];
      });
      제자리병합(opts, 펴진것);
    },
    takeScreenshot: () => ({ toDataURL: () => "" })
  };
  return { chart, series, opts, 적용기록 };
}

/** 저장소에 실제로 들어간 획 목록. 통이 없으면 빈 배열을 줍니다.
 *  (없는 통을 그냥 파고들면 테스트가 "실패" 가 아니라 "터짐" 으로 끝나
 *   npm test 가 거기서 멈추고 뒤 파일이 아예 안 돕니다) */
function 저장획(t, 종목, 간격) {
  const s = t.저장소["chart-drawings"];
  const b = s && s.bySymbol && s.bySymbol[종목];
  const arr = b && b.byInterval && b.byInterval[간격];
  return Array.isArray(arr) ? arr : [];
}

/** 옵션 한 갈래가 전부 참인가 / 전부 거짓인가 */
function 모두(값, 참거짓) {
  if (typeof 값 === "boolean") return 값 === 참거짓;
  return Object.keys(값).every((k) => 값[k] === 참거짓);
}

/* -------------------------------------------------------------------------
 * 모듈 띄우기
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"chart-wrap\">" +
      "<div id=\"chart_container\"><canvas></canvas></div></div></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = opts.width || 1440;
  win.innerHeight = opts.height || 900;
  win.fetch = undefined;              /* 스프라이트는 파일 경로로 물러섭니다 */
  /* 차트를 기다리는 폴링 — 바로 한 번만 돌립니다(타이머를 남기지 않습니다) */
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.requestAnimationFrame = undefined; /* 다시 그리기를 미루지 않게 합니다 */

  const canvas = win.document.querySelector("#chart_container canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 });
  win.document.querySelector(".chart-wrap").getBoundingClientRect =
    () => ({ left: 20, top: 100, right: 620, bottom: 500, width: 600, height: 400 });

  const 저장소 = opts.저장소 || {};
  const 구독 = [];
  let 심볼 = opts.symbol || "BTCUSDT";
  let 간격 = opts.interval || "1m";

  const 만든것 = 가짜차트(opts.차트옵션);

  win.App = {
    Storage: {
      save(k, v) { 저장소[k] = JSON.parse(JSON.stringify(v)); return true; },
      load(k) { return 저장소[k] ? JSON.parse(JSON.stringify(저장소[k])) : null; }
    },
    Config: { getActiveSymbol: () => 심볼, getActiveInterval: () => 간격 },
    Bus: {
      on(e, f) { 구독.push([e, f]); return f; },
      off() {},
      emit(e, p) { 구독.filter((c) => c[0] === e).forEach((c) => c[1](p)); }
    },
    ChartFont: { getCharts: () => [만든것.chart] }
  };

  win.eval(SRC);

  const M = win.App.ChartDrawings;
  const container = win.document.getElementById("chart_container");

  /** 화면 위에 획을 하나 긋습니다 (누르고 -> 끌고 -> 뗌) */
  function 획긋기(점들) {
    const pts = 점들 || [[100, 100], [120, 130], [150, 160], [190, 200]];
    const 보내기 = (형, x, y, 대상) => {
      const ev = new win.MouseEvent(형, { bubbles: true, cancelable: true, clientX: x, clientY: y });
      (대상 || win).dispatchEvent(ev);
      return ev;
    };
    const down = 보내기("pointerdown", pts[0][0], pts[0][1], container);
    for (let i = 1; i < pts.length; i++) 보내기("pointermove", pts[i][0], pts[i][1]);
    const up = 보내기("pointerup", pts[pts.length - 1][0], pts[pts.length - 1][1]);
    return { down, up };
  }

  return {
    win, dom, M, container, 획긋기,
    chart: 만든것.chart,
    series: 만든것.series,
    차트옵션: 만든것.opts,
    적용기록: 만든것.적용기록,
    저장소: 저장소,
    종목바꾸기(s) { 심볼 = s; win.App.Bus.emit("symbol:change", { symbol: s }); },
    간격바꾸기(v) { 간격 = v; win.App.Bus.emit("interval:change", { interval: v }); },
    칩() { return win.document.querySelector(".tl-draw-chip"); },
    칩버튼() { return Array.from(win.document.querySelectorAll(".tl-draw-chip button")); },
    누르기(el) {
      el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    닫기() { try { win.close(); } catch (e) { /* noop */ } }
  };
}

console.log("\n브러시 봉인 (2026-08-28 차트팀 5차)");

/* =========================================================================
 * [0] 수정 금지 파일 · 주석
 * ========================================================================= */
절("[0] 수정 금지 파일 · 실측 주석");
{
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/chart.js 를 건드리지 않았다", md5("chart.js") === "02ddcb000d577131f797143d08c09123", md5("chart.js"));
  ok("js/ui.js 를 건드리지 않았다", md5("ui.js") === "333fc427e75b47b306699c92aa4e7b50", md5("ui.js"));

  ok("주석에 5차(2026-08-28) 브러시를 열었다고 적혀 있다",
    /5차\(2026-08-28\)[\s\S]{0,200}브러시/.test(SRC));
  ok("브러시를 되돌리는 방법이 적혀 있다 (LEFT_TOOLS 의 ready · READY_TOOLS)",
    /되돌리려면[\s\S]{0,40}LEFT_TOOLS 의 brush ready 를 false/.test(SRC));
  ok("chart.options() 가 준 객체를 그대로 들면 안 되는 이유가 적혀 있다",
    /베껴 두어야 합니다/.test(SRC),
    "이 이유가 없으면 다음 사람이 copyOpt 를 군더더기로 보고 지웁니다");
  ok("그 고장이 '조용한 고장' 이라고 적혀 있다 (오류가 안 납니다)",
    /브러시를 한 번 쓰고 나면[\s\S]{0,80}조용한 고장/.test(SRC));
  ok("touch-action 을 왜 거는지 적혀 있다 (폰에서 페이지가 같이 밀립니다)",
    /스크롤되지 않게[\s\S]{0,40}touch-action/.test(SRC));
}

/* =========================================================================
 * [1] 도구가 실제로 열려 있다
 * ========================================================================= */
절("[1] 브러시가 열려 있다");
{
  const t = 띄우기();
  const btn = t.win.document.querySelector(".tlc-rail .tlc-btn[data-tlc=\"brush\"]");
  ok("세로 막대에 브러시 버튼이 있다", !!btn);
  ok("브러시 버튼이 잠겨 있지 않다", !!btn && !btn.hasAttribute("disabled") && !btn.hasAttribute("data-soon"));
  ok("READY_TOOLS 에 brush 가 들어 있다", !!t.M.TOOLS.ready.brush);
  t.M.setTool("brush");
  ok("브러시가 켜진다", t.M.getTool() === "brush", t.M.getTool());
  ok("브러시 모드 표시(isBrushMode)가 켜진다", t.M.isBrushMode() === true);
  t.M.setTool("cursor");
  ok("커서로 돌아가면 브러시 모드도 꺼진다", t.M.isBrushMode() === false);
  t.닫기();
}

/* =========================================================================
 * [2] 브러시를 끄면 차트 조작이 되돌아온다  ← 이 파일의 핵심
 * ========================================================================= */
절("[2] 끄면 차트 끌기·확대가 되돌아온다 (조용한 고장 봉인)");
{
  const t = 띄우기();
  const o = t.차트옵션;

  ok("처음에는 차트를 끌 수 있다 (handleScroll 전부 true)", 모두(o.handleScroll, true));
  ok("처음에는 확대할 수 있다 (handleScale 전부 true)", 모두(o.handleScale, true));
  /* jsdom 은 touch-action 을 아직 모르는 속성으로 다뤄서, 한 번도 안 쓴 상태에서는
     빈 문자열이 아니라 undefined 로 읽힙니다. "손댄 적 없음" 을 둘 다로 봅니다. */
  ok("브러시를 켜기 전에는 touch-action 을 손대지 않은 상태다",
    !t.container.style.touchAction, String(t.container.style.touchAction));

  t.M.setTool("brush");
  ok("브러시 중에는 차트 끌기가 전부 잠긴다", 모두(o.handleScroll, false), JSON.stringify(o.handleScroll));
  ok("브러시 중에는 확대도 전부 잠긴다", 모두(o.handleScale, false), JSON.stringify(o.handleScale));
  ok("브러시 중에는 touch-action 이 none 이다 (폰에서 페이지가 안 밀립니다)",
    t.container.style.touchAction === "none", t.container.style.touchAction);

  t.M.setTool("cursor");
  ok("끝내면 차트 끌기가 되돌아온다", 모두(o.handleScroll, true), JSON.stringify(o.handleScroll));
  ok("끝내면 확대도 되돌아온다", 모두(o.handleScale, true), JSON.stringify(o.handleScale));
  ok("끝내면 touch-action 도 원래대로 돌아온다", t.container.style.touchAction === "", t.container.style.touchAction);

  /* 여기가 핵심입니다. 참조를 그대로 들고 있으면 두 번째 판부터 false 가 굳습니다 */
  t.M.setTool("brush");
  t.M.setTool("cursor");
  ok("두 번째로 켰다 꺼도 차트 끌기가 살아 있다 (참조를 들고 있으면 여기서 굳습니다)",
    모두(o.handleScroll, true), JSON.stringify(o.handleScroll));
  t.M.setTool("brush");
  t.M.setTool("trend");
  ok("세 번째(다른 도구로 옮겨 끄기)에도 차트 끌기가 살아 있다", 모두(o.handleScroll, true),
    JSON.stringify(o.handleScroll));
  ok("세 번을 오가도 확대가 살아 있다", 모두(o.handleScale, true), JSON.stringify(o.handleScale));
  t.닫기();
}

/* 회원이 원래 꺼 둔 설정을 우리가 켜 버리면 안 됩니다 */
{
  const 시작값 = {
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: true, pinch: false, axisPressedMouseMove: true, axisDoubleClickReset: true }
  };
  const t = 띄우기({ 차트옵션: 시작값 });
  const o = t.차트옵션;
  t.M.setTool("brush");
  t.M.setTool("cursor");
  ok("원래 꺼져 있던 갈래(mouseWheel:false)를 우리가 켜 놓지 않는다",
    o.handleScroll.mouseWheel === false, JSON.stringify(o.handleScroll));
  ok("원래 켜져 있던 갈래는 그대로 켜진 채 돌아온다",
    o.handleScroll.pressedMouseMove === true && o.handleScroll.horzTouchDrag === true,
    JSON.stringify(o.handleScroll));
  ok("확대 쪽도 원래 모양 그대로 돌아온다 (pinch:false 유지)",
    o.handleScale.pinch === false && o.handleScale.mouseWheel === true, JSON.stringify(o.handleScale));
  t.닫기();
}

/* 원래 touch-action 이 있던 경우 그 값으로 돌아와야 합니다 */
{
  const t = 띄우기();
  t.container.style.touchAction = "pan-y";
  t.M.setTool("brush");
  ok("브러시 중에는 원래 touch-action 을 덮는다", t.container.style.touchAction === "none");
  t.M.setTool("cursor");
  ok("끝내면 원래 touch-action(pan-y) 으로 정확히 돌아온다",
    t.container.style.touchAction === "pan-y", t.container.style.touchAction);
  t.닫기();
}

/* 브러시가 아닐 때는 차트 옵션에 손대지 않습니다 */
{
  const t = 띄우기();
  const 처음 = t.적용기록.length;
  t.M.setTool("trend");
  t.M.setTool("hline");
  t.M.setTool("cursor");
  ok("브러시가 아닌 도구를 오갈 때는 차트 옵션을 아예 안 건드린다",
    t.적용기록.length === 처음, (t.적용기록.length - 처음) + "번 불렸습니다");
  t.M.setTool("brush");
  ok("브러시를 켤 때 applyOptions 는 한 번만 부른다", t.적용기록.length === 처음 + 1,
    (t.적용기록.length - 처음) + "번");
  t.M.setTool("brush");
  ok("이미 켜져 있으면 또 부르지 않는다 (틱마다 부르면 차트가 버벅입니다)",
    t.적용기록.length === 처음 + 1, (t.적용기록.length - 처음) + "번");
  t.M.setTool("cursor");
  ok("끌 때도 한 번만 부른다", t.적용기록.length === 처음 + 2, (t.적용기록.length - 처음) + "번");
  t.M.setTool("cursor");
  ok("이미 꺼져 있으면 또 부르지 않는다", t.적용기록.length === 처음 + 2, (t.적용기록.length - 처음) + "번");
  t.닫기();
}

/* =========================================================================
 * [3] 종목 · 봉 간격별 저장 · 복원 (차트팀 실측 시나리오)
 * ========================================================================= */
절("[3] 종목·봉 간격별 저장·복원");
{
  const t = 띄우기();
  t.M.setTool("brush");
  t.획긋기();
  ok("BTC 1분봉에 한 획을 그으면 1획이다", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");

  t.종목바꾸기("QQQUSDT");
  ok("QQQ 로 바꾸면 0획이다 (BTC 획이 따라오지 않는다)", t.M.getBrushCount() === 0,
    "지금 " + t.M.getBrushCount() + "획");

  t.M.setTool("brush");
  t.획긋기([[200, 120], [230, 150], [260, 190]]);
  ok("QQQ 에서 한 획을 그으면 1획이다", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");

  t.종목바꾸기("BTCUSDT");
  ok("BTC 로 돌아오면 아까 그은 1획이 그대로 있다", t.M.getBrushCount() === 1,
    "지금 " + t.M.getBrushCount() + "획");

  t.종목바꾸기("QQQUSDT");
  ok("QQQ 로 다시 가면 QQQ 의 1획이 그대로 있다", t.M.getBrushCount() === 1,
    "지금 " + t.M.getBrushCount() + "획");

  const 저장 = t.저장소["chart-drawings"];
  ok("저장 키는 chart-drawings 그대로다", !!저장, Object.keys(t.저장소).join(","));
  ok("종목별로 따로 담긴다 (BTCUSDT · QQQUSDT)",
    !!저장 && !!저장.bySymbol.BTCUSDT && !!저장.bySymbol.QQQUSDT,
    저장 ? Object.keys(저장.bySymbol).join(",") : "");
  ok("종목 안에서 다시 봉 간격별로 담긴다 (1m)",
    !!저장 && !!저장.bySymbol.BTCUSDT.byInterval["1m"],
    저장 ? Object.keys(저장.bySymbol.BTCUSDT.byInterval).join(",") : "");
  t.닫기();
}

{
  const t = 띄우기();
  t.M.setTool("brush");
  t.획긋기();
  ok("BTC 1분봉 1획", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");
  t.간격바꾸기("5m");
  ok("5분봉으로 바꾸면 0획이다 (1분봉 획이 따라오지 않는다)", t.M.getBrushCount() === 0,
    "지금 " + t.M.getBrushCount() + "획");
  t.간격바꾸기("1m");
  ok("1분봉으로 돌아오면 1획이 그대로 있다", t.M.getBrushCount() === 1,
    "지금 " + t.M.getBrushCount() + "획");

  /* 새로고침 — 같은 저장소로 모듈을 다시 띄웁니다 */
  const 저장소 = t.저장소;
  t.닫기();
  const u = 띄우기({ 저장소: 저장소 });
  ok("새로고침해도 BTC 1분봉의 획이 남아 있다", u.M.getBrushCount() === 1, "지금 " + u.M.getBrushCount() + "획");
  u.닫기();
  const v = 띄우기({ 저장소: 저장소, symbol: "QQQUSDT", interval: "5m" });
  ok("새로고침 뒤 QQQ 5분봉으로 열면 0획이다", v.M.getBrushCount() === 0, "지금 " + v.M.getBrushCount() + "획");
  v.닫기();
}

/* =========================================================================
 * [4] 폰에서 그릴 때 페이지가 같이 밀리지 않는다
 * ========================================================================= */
절("[4] 폰 — 그리는 동안 페이지가 안 밀린다 (360 실측 scrollY 472 -> 472)");
{
  const t = 띄우기({ width: 360, height: 800 });
  t.M.setTool("brush");
  const r = t.획긋기();
  ok("누르는 순간 기본 동작을 막는다 (preventDefault)", r.down.defaultPrevented === true);
  ok("떼는 순간에도 기본 동작을 막는다", r.up.defaultPrevented === true);
  ok("그리는 동안 touch-action 이 none 이다", t.container.style.touchAction === "none");
  ok("360 에서도 획이 저장된다", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");

  /* 2026-09-02 (13차) — 커서 도구로 "그림을 끌어 옮기기" 가 생겼습니다.
     그래서 기준을 나눕니다. 기준을 낮춘 것이 아니라 두 개로 쪼갠 것입니다.
       빈 곳    가로채지 않는다 (차트 끌기가 그대로여야 합니다)  <- 원래 이 줄
       그림 위  가로챈다 (안 그러면 그림을 못 끕니다)            <- 새로 더한 줄
     획은 (100,100)~(190,200) 에 그어져 있습니다. */
  t.M.setTool("cursor");
  const 빈곳 = new t.win.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 320, clientY: 60 });
  t.container.dispatchEvent(빈곳);
  ok("브러시가 아닐 때 빈 곳을 누르면 가로채지 않는다 (차트 끌기를 막으면 안 됩니다)",
    빈곳.defaultPrevented === false);
  const ev = new t.win.MouseEvent("pointerdown", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 });
  t.container.dispatchEvent(ev);
  ok("그림 위를 누르면 그때만 가로챈다 (끌어 옮기기)", ev.defaultPrevented === true);
  ok("누른 그림을 잡고 있다", !!t.M.getDragInfo(), JSON.stringify(t.M.getDragInfo()));
  t.win.dispatchEvent(new t.win.MouseEvent("pointerup", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }));
  ok("손을 떼면 놓는다", t.M.isDragging() === false);
  t.닫기();
}

/* =========================================================================
 * [5] 칩 — 브러시 중에는 되돌리기 · 끝내기
 * ========================================================================= */
절("[5] 칩 — 브러시 · 획 n / 되돌리기 / 끝내기");
{
  const t = 띄우기({ width: 360, height: 800 });
  ok("아무것도 안 그렸으면 칩은 숨어 있다", t.칩().style.display === "none", t.칩().style.display);

  t.M.setTool("brush");
  ok("브러시를 켜면 아직 0획이어도 칩이 나온다 (끝내는 길이 있어야 합니다)",
    t.칩().style.display === "flex", t.칩().style.display);
  const 라벨 = t.win.document.querySelector(".tl-draw-chip span");
  ok("칩에 '브러시 · 획 0' 이라고 적힌다", 라벨.textContent === "브러시 · 획 0", 라벨.textContent);

  const 단추 = t.칩버튼();
  const b1 = 단추[0];
  const b2 = 단추[1];
  ok("첫 단추는 되돌리기다", b1.textContent === "되돌리기", b1.textContent);
  ok("둘째 단추는 끝내기다", b2.textContent === "끝내기", b2.textContent);
  ok("되돌릴 획이 없으면 첫 단추가 흐리다(data-dim)", b1.getAttribute("data-dim") === "1");

  t.획긋기();
  ok("한 획을 그으면 칩이 '브러시 · 획 1' 이 된다", 라벨.textContent === "브러시 · 획 1", 라벨.textContent);
  ok("획이 생기면 되돌리기가 진해진다", b1.getAttribute("data-dim") === null);

  t.획긋기([[300, 120], [330, 150], [360, 190]]);
  ok("두 획이면 '브러시 · 획 2'", 라벨.textContent === "브러시 · 획 2", 라벨.textContent);

  t.누르기(b1);
  ok("되돌리기를 누르면 마지막 한 획만 사라진다", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");
  ok("되돌린 것이 저장소에도 반영된다", 저장획(t, "BTCUSDT", "1m").length === 1,
    저장획(t, "BTCUSDT", "1m").length + "개 남음");

  t.누르기(b2);
  ok("끝내기를 누르면 커서로 돌아온다", t.M.getTool() === "cursor", t.M.getTool());
  ok("끝내기를 누르면 차트 끌기가 되돌아온다 (칩으로 끄는 길도 막히면 안 됩니다)",
    모두(t.차트옵션.handleScroll, true), JSON.stringify(t.차트옵션.handleScroll));
  ok("끝내기 뒤에도 그은 획은 남아 있다 (끄는 것과 지우는 것은 다릅니다)",
    t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");
  t.닫기();
}

/* =========================================================================
 * [6] 획 자체의 규칙 — 떨림 · 상한 · 톡 누름
 * ========================================================================= */
절("[6] 획 규칙 — 손떨림 · 점 상한 · 톡 누름");
{
  const t = 띄우기();
  ok("최소 이동이 2.5px 다 (손떨림만큼은 점을 안 찍습니다)", t.M.BRUSH_MIN_PX === 2.5, String(t.M.BRUSH_MIN_PX));
  ok("한 획의 점 상한이 600 이다 (끝없이 쌓이면 저장이 터집니다)", t.M.BRUSH_MAX_PTS === 600,
    String(t.M.BRUSH_MAX_PTS));
  ok("획 굵기는 2px 다", t.M.BRUSH_WIDTH === 2, String(t.M.BRUSH_WIDTH));

  t.M.setTool("brush");
  /* 톡 누르고 바로 뗌 — 점 하나짜리 쓰레기가 남으면 안 됩니다 */
  t.획긋기([[100, 100]]);
  ok("톡 누르고 떼면 획이 안 남는다", t.M.getBrushCount() === 0, "지금 " + t.M.getBrushCount() + "획");

  /* 1px 씩 떨기만 한 경우도 마찬가지입니다 */
  t.획긋기([[100, 100], [101, 100], [100, 101], [101, 101]]);
  ok("1px 씩 떨기만 하면 점이 안 쌓여 획도 안 남는다", t.M.getBrushCount() === 0,
    "지금 " + t.M.getBrushCount() + "획");

  /* 제대로 끌면 남습니다 */
  t.획긋기([[100, 100], [140, 140], [200, 200]]);
  ok("제대로 끌면 획이 남는다", t.M.getBrushCount() === 1, "지금 " + t.M.getBrushCount() + "획");

  const 획 = 저장획(t, "BTCUSDT", "1m")[0];
  ok("저장된 획의 종류는 brush 다", !!획 && 획.type === "brush", 획 ? 획.type : "없음");
  ok("점은 시각(t)·가격(p) 으로 저장한다 (화면 좌표로 저장하면 확대할 때 어긋납니다)",
    !!획 && 획.pts.length >= 2 && typeof 획.pts[0].t === "number" && typeof 획.pts[0].p === "number",
    획 ? JSON.stringify(획.pts[0]) : "없음");
  t.닫기();
}

/* ========================================================================= */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  - " + s));
  console.log("chart-brush-seal - 실패");
  process.exit(1);
}
console.log("chart-brush-seal - 전체 통과");
process.exit(0);
