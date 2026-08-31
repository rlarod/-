/* tests/chart-channel-seal.test.js
 * =========================================================================
 * 여러선 = 평행 채널 봉인 — 2026-08-28 (차트팀 6차)
 * =========================================================================
 * 기록팀 / 본부장 배정. 차트팀이 6차로 "여러선(평행 채널)" 을 열면서 붙인
 * 실측을 못 박습니다. 고치는 파일이 아니라 "지금 이렇다" 를 남기는 파일입니다.
 *
 * ── 무엇보다 이것 둘 ───────────────────────────────────────────────────
 *
 *  (1) 종목을 바꾸면 chanBase 가 비워지는가        ← 조용한 고장
 *      여러선은 세 번 톡으로 만듭니다. 두 번 톡 한 상태(기준선은 그었고 폭만
 *      남은 상태)에서 종목을 바꾸면, 옛 종목의 기준점 두 개가 그대로 남습니다.
 *      그 뒤 한 번만 더 톡 하면 옛 종목 자리에 채널이 하나 생깁니다.
 *      오류도 안 나고 화면도 멀쩡합니다. 회원은 자기가 안 그은 선을 봅니다.
 *      js/chart-drawings.js 의 rescope() 안에 pending = null 과 chanBase = null
 *      두 줄이 들어 있어 지금은 막혀 있습니다.
 *      두 겹으로 봅니다 (2026-08-28 돌연변이로 확인한 결과입니다) —
 *        · 실제로 톡 해 보는 검사 : 두 줄이 다 빠지면 채널이 1개 생겨 터집니다
 *        · 코드를 읽는 검사       : chanBase 한 줄만 빠져도 터집니다
 *      chanBase 한 줄만 지우면 pending = null 이 대신 막아 줘서 동작으로는
 *      안 드러납니다. 그래서 코드를 읽는 검사를 같이 둡니다 — 그 줄은
 *      "다음에 pending 쪽이 바뀌었을 때" 를 위한 안전장치이기 때문입니다.
 *
 *  (2) dp 를 픽셀이 아니라 "가격 차이" 로 저장하는가
 *      저장 모양 { id, type:"channel", t1,p1, t2,p2, dp }
 *      dp 가 픽셀이면 확대·축소할 때마다 채널 폭이 제자리를 잃습니다
 *      (차트를 두 배로 늘리면 두 선이 겹쳐 보이거나 화면 밖으로 나갑니다).
 *      그래서 이 파일은 가격축 배율을 1배 -> 2배로 바꿔 놓고 다시 그려서,
 *      저장값 dp 는 그대로인데 화면 간격만 92px -> 184px 로 따라 늘어나는지
 *      확인합니다. 값만 읽어서는 "가격인지 픽셀인지" 를 못 가립니다.
 *
 * ── 나머지로 못 박는 것 ────────────────────────────────────────────────
 *   [3] 두 선이 진짜 평행한가
 *        차트팀 실측 — x=300 · 400 · 500 에서 전부 92px
 *        캔버스에 실제로 찍힌 선분을 받아서 세 자리를 다시 계산합니다.
 *   [5] 종목 · 봉 간격별 저장·복원 (차트팀 실측 시나리오 그대로)
 *        BTC 1m 채널 1개 -> QQQ 0개 -> BTC 복귀 1개
 *        BTC 1m 1개 -> 5분봉 0개 -> 1분봉 복귀 1개
 *        새로고침(모듈을 새로 띄움) 뒤에도 남는가
 *   [6] 안내 한 줄이 접히지 않는가
 *        차트팀 실측 — 360 에서 높이 27px (한 줄)
 *        주의 — nowrap 을 강제하지 않습니다. placeToast() 가 카드 안으로 밀어
 *        넣는 방식이라 nowrap 을 걸면 글자가 카드 밖으로 삐져나갑니다.
 *        그래서 "접히지 않는다" 를 높이 계산으로 봅니다.
 *
 * 가짜 차트 · 가짜 저장소만 씁니다. 서버도 브라우저도 부르지 않습니다.
 * tests/ 밖은 한 글자도 고치지 않았습니다 (수정 금지 파일 md5 를 [0] 에서 확인).
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
const 가깝나 = (a, b, 여유) => Math.abs(a - b) <= (여유 === undefined ? 0.001 : 여유);

/* -------------------------------------------------------------------------
 * 캔버스 흉내 — 찍힌 선분을 그대로 받아 둡니다
 *   (평행인지 보려면 "무엇을 그렸는지" 를 봐야 합니다. 저장값만 보면
 *    그리는 쪽이 틀려도 통과합니다)
 * ----------------------------------------------------------------------- */
function 가짜컨텍스트() {
  const 기록 = [];
  const c = {
    _기록: 기록,
    _대시: [],
    lineWidth: 1, strokeStyle: "", fillStyle: "", font: "", textBaseline: "", textAlign: "",
    beginPath() { 기록.push({ op: "begin" }); },
    closePath() { 기록.push({ op: "close" }); },
    moveTo(x, y) { 기록.push({ op: "move", x: x, y: y }); },
    lineTo(x, y) { 기록.push({ op: "line", x: x, y: y }); },
    stroke() { 기록.push({ op: "stroke", w: c.lineWidth, color: c.strokeStyle, dash: c._대시.slice() }); },
    fill() { 기록.push({ op: "fill", color: c.fillStyle }); },
    setLineDash(d) { c._대시 = (d || []).slice(); },
    arc() {}, rect() {}, fillRect() {}, strokeRect() {},
    save() {}, restore() {}, clip() {},
    fillText() {}, strokeText() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, ellipse() {},
    translate() {}, scale() {}, rotate() {},
    measureText() { return { width: 40 }; }
  };
  return c;
}

/** 한 번 그린 것에서 "선 긋기(stroke)" 묶음들을 꺼냅니다 */
function 획묶음(기록) {
  const out = [];
  let 현재 = [];
  기록.forEach(function (e) {
    if (e.op === "begin") { 현재 = []; return; }
    if (e.op === "move" || e.op === "line") { 현재.push(e); return; }
    if (e.op === "stroke") { out.push({ 점: 현재.slice(), w: e.w, color: e.color, dash: e.dash }); 현재 = []; }
  });
  return out;
}

/** 두 점을 잇는 직선이 x 자리에서 갖는 y */
function y좌표(p1, p2, x) {
  if (p2.x === p1.x) return p1.y;
  return p1.y + ((p2.y - p1.y) * (x - p1.x)) / (p2.x - p1.x);
}

/* -------------------------------------------------------------------------
 * 모듈 띄우기
 *   가격축은 배율을 바꿀 수 있게 만들었습니다 ([2] 에서 확대·축소를 흉내 냅니다)
 *   시간축은 x = ((t - 첫봉) / 60) * 6  ->  x=300 이면 50번째 봉
 * ----------------------------------------------------------------------- */
const 첫봉 = 1700000000;
const 봉간격초 = 60;
const 기준가 = 80000;

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
  win.fetch = undefined;
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function () { return 0; };      /* 알림 자동 닫힘 타이머를 남기지 않습니다 */
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;

  const canvas = win.document.querySelector("#chart_container canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 });
  const 칸너비 = opts.칸너비 || 600;
  win.document.querySelector(".chart-wrap").getBoundingClientRect =
    () => ({ left: 20, top: 100, right: 20 + 칸너비, bottom: 500, width: 칸너비, height: 400 });

  const 저장소 = opts.저장소 || {};
  const 구독 = [];
  let 심볼 = opts.symbol || "BTCUSDT";
  let 간격 = opts.interval || "1m";

  /* 가격축 배율 — 1 이면 y = 기준가 - p, 2 면 그 두 배로 벌어집니다 */
  const 축 = { 배율: 1 };

  const 캔들 = [];
  for (let i = 0; i < 500; i++) 캔들.push({ time: 첫봉 + i * 봉간격초, open: 1, high: 2, low: 0, close: 1 });

  let 클릭콜백 = null;
  let 프리미티브 = null;

  const series = {
    seriesType: () => "Candlestick",
    data: () => 캔들,
    attachPrimitive: (p) => { 프리미티브 = p; if (p.attached) p.attached({ requestUpdate: function () {} }); },
    detachPrimitive: () => { 프리미티브 = null; },
    createPriceLine: () => ({ applyOptions: () => {} }),
    removePriceLine: () => {},
    priceToCoordinate: (p) => (기준가 - p) * 축.배율,
    coordinateToPrice: (y) => 기준가 - y / 축.배율,
    applyOptions: () => {}
  };

  const chart = {
    panes: () => [{ getSeries: () => [series] }],
    subscribeClick: (f) => { 클릭콜백 = f; },
    subscribeCrosshairMove: () => {},
    unsubscribeClick: () => {},
    unsubscribeCrosshairMove: () => {},
    timeScale: () => ({
      coordinateToLogical: (x) => x / 6,
      logicalToCoordinate: (l) => l * 6,
      timeToCoordinate: () => null,   /* 논리 번호로 물러서게 둡니다 (실제로도 화면 밖은 null) */
      getVisibleLogicalRange: () => ({ from: 0, to: 100 }),
      setVisibleLogicalRange: () => {},
      fitContent: () => {}
    }),
    options: () => ({
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }
    }),
    applyOptions: () => {},
    takeScreenshot: () => ({ toDataURL: () => "" })
  };

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
    ChartFont: { getCharts: () => [chart] }
  };

  win.eval(SRC);
  const M = win.App.ChartDrawings;

  /** 차트 위를 한 번 톡 합니다 (라이브러리의 subscribeClick 이 주는 모양 그대로) */
  function 톡(x, y) {
    if (!클릭콜백) return;
    클릭콜백({ point: { x: x, y: y }, logical: x / 6 });
  }
  /** 한 프레임 그려서 캔버스에 찍힌 것을 돌려줍니다 */
  function 그리기() {
    const ctx = 가짜컨텍스트();
    if (!프리미티브) return ctx;
    프리미티브.paneViews()[0].renderer().draw({
      useMediaCoordinateSpace: (fn) => fn({ mediaSize: { width: 600, height: 400 }, context: ctx })
    });
    return ctx;
  }

  return {
    win, dom, M, 축, 톡, 그리기, 저장소,
    시각(x) { return Math.round(첫봉 + (x / 6) * 봉간격초); },
    도형() { return M.getDrawings().shapes; },
    종목바꾸기(s) { 심볼 = s; win.App.Bus.emit("symbol:change", { symbol: s }); },
    간격바꾸기(v) { 간격 = v; win.App.Bus.emit("interval:change", { interval: v }); },
    알림() { return win.document.querySelector(".tl-draw-toast"); },
    닫기() { try { win.close(); } catch (e) { /* noop */ } }
  };
}

/** 여러선 하나를 세 번 톡으로 만듭니다 — 차트팀 실측과 같은 자리 */
function 채널그리기(t) {
  t.M.setTool("channel");
  t.톡(300, 100);   /* ① 기준선 시작 */
  t.톡(500, 200);   /* ② 기준선 끝 */
  t.톡(400, 242);   /* ③ 폭 — 기준선의 x=400 자리(y=150)에서 92px 아래 */
}

/** 지금 그려진 채널의 두 선 사이 간격(px)을 x 자리에서 잽니다 */
function 채널간격(t, x) {
  const 획 = 획묶음(t.그리기()._기록).filter((g) => g.점.length === 4);
  if (!획.length) return NaN;
  const g = 획[0].점;                       /* moveTo,lineTo (위) + moveTo,lineTo (아래) */
  return Math.abs(y좌표(g[2], g[3], x) - y좌표(g[0], g[1], x));
}

console.log("\n여러선(평행 채널) 봉인 (2026-08-28 차트팀 6차)");

/* =========================================================================
 * [0] 수정 금지 파일 · 되돌리는 방법 · 바이낸스 실측
 * ========================================================================= */
절("[0] 수정 금지 파일 · 실측 주석");
{
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/chart.js 를 건드리지 않았다", md5("chart.js") === "02ddcb000d577131f797143d08c09123", md5("chart.js"));
  ok("js/ui.js 를 건드리지 않았다", md5("ui.js") === "333fc427e75b47b306699c92aa4e7b50", md5("ui.js"));
  ok("js/trading.js 를 건드리지 않았다", md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록

  ok("주석에 6차(2026-08-28) 여러선을 열었다고 적혀 있다",
    /6차\(2026-08-28\)[\s\S]{0,120}여러선/.test(SRC));
  ok("되돌리는 방법이 적혀 있다 (LEFT_TOOLS 의 ready · READY_TOOLS)",
    /되돌리려면[\s\S]{0,60}LEFT_TOOLS 의 channel ready 를 false/.test(SRC),
    "되돌리는 방법이 없으면 게이트 2 에서 반려됩니다");
  ok("되돌릴 때 같이 고칠 테스트 파일 이름까지 적혀 있다",
    SRC.indexOf("tests/chart-toolbar-seal.test.js") !== -1 &&
    SRC.indexOf("tests/chart-drawings.test.js") !== -1);

  /* 우리 거래·차트는 바이낸스를 따라갑니다. 어디를 언제 쟀는지가 남아 있어야
     다음 사람이 "추측으로 맞춘 값" 과 구분할 수 있습니다. */
  ok("바이낸스를 어디서 쟀는지 적혀 있다 (주소 · 날짜 · 캡처 파일)",
    /binance\.com\/en\/futures\/BTCUSDT/.test(SRC) && /2026-08-28/.test(SRC) &&
    /shots\/ct4-bnf-channel\.png/.test(SRC));
  ok("바이낸스 실측 굵기 2px 가 적혀 있다", /굵기 2px/.test(SRC));
  ok("바이낸스와 다른 곳(색 · 채움)을 숫자로 적어 두었다",
    /우리 값과 다른 곳/.test(SRC) && /20%/.test(SRC) && /10%/.test(SRC));
  /* ── 2026-08-28 이 검사를 바꾼 이유 ─────────────────────────────────
     원래는 "우리 추세선은 1px 인데 바이낸스는 2px 라 어긋나 있다" 는
     **사실을 적어 두었는가** 를 봤습니다. 고치지 않고 기록만 남긴 것이라,
     어긋남이 해소되면 그 검사도 같이 없애는 게 맞습니다.

     차트팀이 바이낸스를 다시 재서 LINE_WIDTH 를 1 -> 2 로 맞췄습니다
     (216열 중 209열이 정확히 2행 · shots/ct6-bnf-trend.png).
     그래서 "어긋나 있다는 기록" 검사는 없애고, 그 자리에
     **맞춰진 값 자체**를 못 박습니다. 이게 더 강한 봉인입니다 —
     앞의 것은 주석만 있으면 통과했지만, 이건 값이 틀리면 터집니다. */
  ok("추세선 굵기가 바이낸스와 같은 2px 다 (2026-08-28 1 -> 2 로 맞췄습니다)",
    /var LINE_WIDTH = 2;/.test(SRC),
    "1px 로 되돌리면 바이낸스보다 얇아집니다. 되돌리려면 실측부터 다시 하세요");
  ok("추세선 굵기를 어디서 쟀는지 적혀 있다 (캡처 파일까지)",
    SRC.indexOf("shots/ct6-bnf-trend.png") !== -1,
    "근거 없이 숫자만 바뀌면 추측으로 맞춘 것과 구분이 안 됩니다");
}

/* =========================================================================
 * [1] 도구가 실제로 열려 있다 — "준비중이라 써 놓고 열리는" 반대도 봅니다
 * ========================================================================= */
절("[1] 여러선이 열려 있다");
{
  const t = 띄우기();
  const btn = t.win.document.querySelector(".tlc-rail .tlc-btn[data-tlc=\"channel\"]");
  ok("세로 막대에 여러선 버튼이 있다", !!btn);
  ok("여러선 버튼이 잠겨 있지 않다 (disabled · data-soon 이 없다)",
    !!btn && !btn.hasAttribute("disabled") && !btn.hasAttribute("data-soon"));
  ok("버튼 설명에 '세 번 톡' 이 적혀 있다 (다른 도구와 순서가 달라서 회원이 헷갈립니다)",
    !!btn && (btn.getAttribute("title") || "").indexOf("세 번 톡") !== -1,
    btn && btn.getAttribute("title"));
  ok("READY_TOOLS 에 channel 이 들어 있다", !!t.M.TOOLS.ready.channel);
  ok("THREE_TAP 은 channel 하나뿐이다 (세 번 톡 도구는 지금 이것 하나입니다)",
    Object.keys(t.M.TOOLS.threeTap).sort().join(",") === "channel",
    Object.keys(t.M.TOOLS.threeTap).join(","));
  ok("channel 은 두 번 톡(TWO_TAP) 에 들어 있지 않다 (둘 다면 두 번째 톡에서 끝나 버립니다)",
    !t.M.TOOLS.twoTap.channel);
  ok("channel 은 TWO_POINT 가 아니다 (두 점짜리 그림으로 다뤄지면 폭 dp 를 잃습니다)",
    !t.M.TOOLS.twoPoint.channel);
  t.M.setTool("channel");
  ok("여러선이 켜진다", t.M.getTool() === "channel", t.M.getTool());
  t.닫기();
}

/* =========================================================================
 * [2] 세 번 톡 · 저장 모양 · dp 는 픽셀이 아니라 가격 차이   ← 핵심 (2)
 * ========================================================================= */
절("[2] 세 번 톡으로 만들고, dp 는 '가격 차이' 로 저장한다");
{
  const t = 띄우기();
  t.M.setTool("channel");
  ok("아직 아무것도 없다", t.도형().length === 0);

  t.톡(300, 100);
  ok("한 번 톡 해도 아직 안 만들어진다 (기준선 시작점만 잡힙니다)",
    t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.톡(500, 200);
  ok("두 번 톡 해도 아직 안 만들어진다 (여기서 끝나면 그냥 추세선입니다)",
    t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.톡(400, 242);
  ok("세 번째 톡에서 하나 만들어진다", t.도형().length === 1, "지금 " + t.도형().length + "개");

  const s = t.도형()[0];
  ok("종류가 channel 이다", !!s && s.type === "channel", s && s.type);
  ok("저장 모양이 { id, type, t1,p1, t2,p2, dp } 그대로다",
    !!s && Object.keys(s).sort().join(",") === "dp,id,p1,p2,t1,t2,type",
    s && Object.keys(s).sort().join(","));
  ok("기준선 첫 점이 첫 번째 톡 자리다", 가깝나(s.t1, t.시각(300)) && 가깝나(s.p1, 79900), s.t1 + " / " + s.p1);
  ok("기준선 끝 점이 두 번째 톡 자리다", 가깝나(s.t2, t.시각(500)) && 가깝나(s.p2, 79800), s.t2 + " / " + s.p2);

  /* 세 번째 톡 (400, 242) — 기준선은 x=400 에서 y=150(가격 79850) 입니다.
     242 - 150 = 92px 아래 -> 가격으로는 -92. 차트팀 실측 92px 와 같은 값입니다. */
  ok("dp 가 -92 다 (기준선에서 92px 아래를 찍었고, 이 배율에서 1px = 1가격)",
    가깝나(s.dp, -92), String(s.dp));
  ok("dp 는 화면 좌표(242)가 아니다 — 픽셀을 그대로 넣으면 이 검사가 터집니다",
    s.dp !== 242 && s.dp !== -242, String(s.dp));

  /* 만든 뒤에는 커서로 돌아갑니다 (계속 켜져 있으면 다음 톡이 또 선을 만듭니다) */
  ok("만들고 나면 커서로 돌아간다", t.M.getTool() === "cursor", t.M.getTool());
  t.톡(320, 120);
  ok("커서로 돌아간 뒤의 톡은 새 채널을 만들지 않는다", t.도형().length === 1, "지금 " + t.도형().length + "개");

  /* ── 여기가 핵심 — 확대·축소를 흉내 내 봅니다 ──────────────────────────
     가격축 배율만 2배로 올립니다. 저장값은 아무것도 안 건드립니다.
     dp 가 "가격" 이면 화면 간격만 92 -> 184 로 따라 늘어나야 맞습니다.
     dp 가 "픽셀" 이었다면 92px 로 굳어 있어 채널이 엉뚱한 가격을 가리킵니다. */
  const 간격1배 = 채널간격(t, 400);
  ok("1배에서 두 선 간격이 92px 다", 가깝나(간격1배, 92, 0.01), String(간격1배));
  t.축.배율 = 2;
  const 간격2배 = 채널간격(t, 400);
  ok("가격축을 2배로 늘리면 화면 간격도 184px 로 따라 늘어난다 (dp 가 가격이라는 증거)",
    가깝나(간격2배, 184, 0.02), String(간격2배));
  ok("그동안 저장된 dp 는 -92 그대로다 (화면 배율은 저장값을 건드리지 않습니다)",
    가깝나(t.도형()[0].dp, -92), String(t.도형()[0].dp));
  t.축.배율 = 1;
  t.닫기();
}

/* =========================================================================
 * [3] 두 선이 진짜 평행한가 — 캔버스에 찍힌 선분으로 다시 잽니다
 * ========================================================================= */
절("[3] 두 선이 평행하다 (차트팀 실측 x=300 · 400 · 500 전부 92px)");
{
  const t = 띄우기();
  채널그리기(t);
  const ctx = t.그리기();
  const 획 = 획묶음(ctx._기록);

  const 두선 = 획.filter((g) => g.점.length === 4);
  ok("한 번에 두 줄(위·아래)을 같이 긋는다", 두선.length === 1, "지금 " + 두선.length + "묶음");

  const g = 두선.length ? 두선[0].점 : null;
  [300, 400, 500].forEach(function (x) {
    const 간격 = g ? Math.abs(y좌표(g[2], g[3], x) - y좌표(g[0], g[1], x)) : NaN;
    ok("x=" + x + " 에서 두 선 간격이 92px 다", 가깝나(간격, 92, 0.01), String(간격));
  });

  ok("위·아래 선 굵기가 바이낸스와 같은 2px 다", 두선.length === 1 && 두선[0].w === 2,
    두선.length ? String(두선[0].w) : "-");
  ok("위·아래 선은 실선이다 (미리보기만 점선입니다)",
    두선.length === 1 && 두선[0].dash.length === 0, 두선.length ? JSON.stringify(두선[0].dash) : "-");
  ok("선 색이 확정 팔레트의 포인트 금색이다 (파랑은 우리 팔레트에 없습니다)",
    두선.length === 1 && 두선[0].color === "#F0B429", 두선.length ? 두선[0].color : "-");

  /* 가운데 점선 한 줄 — 바이낸스와 같은 생김새 */
  const 점선 = 획.filter((g2) => g2.dash.length === 2 && g2.점.length === 2);
  ok("가운데 점선이 한 줄 있다", 점선.length === 1, "지금 " + 점선.length + "줄");
  ok("가운데 점선이 4 긋고 6 띄우는 바이낸스 실측 그대로다",
    점선.length === 1 && 점선[0].dash.join(",") === "4,6", 점선.length ? 점선[0].dash.join(",") : "-");
  if (점선.length === 1 && g) {
    const m = 점선[0].점;
    [300, 400, 500].forEach(function (x) {
      const 위 = y좌표(g[0], g[1], x);
      const 아래 = y좌표(g[2], g[3], x);
      ok("x=" + x + " 에서 가운데 점선이 정확히 한가운데다",
        가깝나(y좌표(m[0], m[1], x), (위 + 아래) / 2, 0.01), String(y좌표(m[0], m[1], x)));
    });
  }

  /* 안쪽 채움 — 선보다 먼저 칠해야 선이 채움 위로 올라옵니다 */
  const 채움 = ctx._기록.filter((e) => e.op === "fill");
  ok("안쪽을 한 번 칠한다", 채움.length === 1, "지금 " + 채움.length + "번");
  ok("채움이 금색 10% 다 (금색은 파랑보다 밝아 20% 면 안쪽 캔들이 묻힙니다)",
    채움.length === 1 && 채움[0].color === t.M.CHANNEL.fill, 채움.length ? 채움[0].color : "-");
  {
    const 첫칠 = ctx._기록.findIndex((e) => e.op === "fill");
    const 첫선 = ctx._기록.findIndex((e) => e.op === "stroke");
    ok("채움을 선보다 먼저 한다 (반대면 선이 채움에 덮여 흐려집니다)", 첫칠 >= 0 && 첫칠 < 첫선,
      첫칠 + " vs " + 첫선);
  }

  ok("공개된 CHANNEL 값이 바이낸스 실측 그대로다 (굵기 2 / 점선 4,6)",
    t.M.CHANNEL.width === 2 && t.M.CHANNEL.dash.join(",") === "4,6",
    t.M.CHANNEL.width + " / " + t.M.CHANNEL.dash.join(","));
  t.닫기();
}

/* =========================================================================
 * [4] 종목을 바꾸면 chanBase 가 비워진다   ← 핵심 (1) · 조용한 고장
 * ========================================================================= */
절("[4] 종목 · 봉 간격을 바꾸면 긋다 만 기준선이 버려진다");
{
  /* 두 번 톡 한 상태(기준선은 그었고 폭만 남음)에서 종목을 바꿉니다 */
  const t = 띄우기();
  t.M.setTool("channel");
  t.톡(300, 100);
  t.톡(500, 200);
  t.종목바꾸기("QQQ");
  t.톡(400, 242);
  ok("종목을 바꾼 뒤의 톡이 옛 종목 기준선으로 채널을 만들지 않는다 (조용한 고장 봉인)",
    t.도형().length === 0,
    "지금 " + t.도형().length + "개 — rescope() 가 pending · chanBase 를 안 비웠습니다");
  t.닫기();
}
{
  /* 봉 간격도 같습니다 — 1분봉에서 그은 기준점을 5분봉이 물려받으면 안 됩니다 */
  const t = 띄우기();
  t.M.setTool("channel");
  t.톡(300, 100);
  t.톡(500, 200);
  t.간격바꾸기("5m");
  t.톡(400, 242);
  ok("봉 간격을 바꾼 뒤의 톡도 옛 기준선으로 채널을 만들지 않는다",
    t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.닫기();
}
{
  /* 도구를 바꿔도 같습니다 (여러선을 찍다가 자로 바꾸는 경우) */
  const t = 띄우기();
  t.M.setTool("channel");
  t.톡(300, 100);
  t.톡(500, 200);
  t.M.setTool("channel");
  t.톡(400, 242);
  ok("도구를 다시 고르면 긋다 만 기준선이 버려진다 (한 번 톡 한 것으로 다시 셉니다)",
    t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.닫기();
}
{
  /* Esc 로도 빠져나올 수 있어야 합니다 — 안 그러면 잘못 찍은 기준선에 갇힙니다 */
  const t = 띄우기();
  t.M.setTool("channel");
  t.톡(300, 100);
  t.톡(500, 200);
  t.win.document.dispatchEvent(new t.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok("Esc 를 누르면 커서로 빠져나온다", t.M.getTool() === "cursor", t.M.getTool());
  t.톡(400, 242);
  ok("Esc 뒤의 톡도 채널을 만들지 않는다", t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.닫기();
}
{
  /* 코드에도 그 한 줄이 남아 있는지 봅니다 — 실제 동작과 코드를 둘 다 못 박습니다 */
  const rescope = SRC.slice(SRC.indexOf("function rescope()"), SRC.indexOf("function rescope()") + 700);
  ok("rescope() 안에 chanBase = null 이 있다", /chanBase\s*=\s*null/.test(rescope),
    "이 한 줄이 빠지면 옛 종목 기준점이 남습니다");
  const setTool = SRC.slice(SRC.indexOf("function setTool(name)"), SRC.indexOf("function setTool(name)") + 700);
  ok("setTool() 안에도 chanBase = null 이 있다", /chanBase\s*=\s*null/.test(setTool));
  const clearAll = SRC.slice(SRC.indexOf("function clearAll()"), SRC.indexOf("function clearAll()") + 500);
  ok("clearAll() 안에도 chanBase = null 이 있다", /chanBase\s*=\s*null/.test(clearAll));
}

/* =========================================================================
 * [5] 종목 · 봉 간격별 저장·복원 (차트팀 실측 시나리오 그대로)
 * ========================================================================= */
절("[5] 종목 · 봉 간격별로 따로 저장되고 되돌아온다");
{
  const 저장소 = {};
  const t = 띄우기({ 저장소: 저장소 });
  채널그리기(t);
  ok("BTC 1분봉에 채널 1개", t.도형().length === 1, "지금 " + t.도형().length + "개");

  t.종목바꾸기("QQQ");
  ok("QQQ 로 옮기면 0개 (다른 종목 것이 안 보입니다)", t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.종목바꾸기("BTCUSDT");
  ok("BTC 로 되돌아오면 다시 1개", t.도형().length === 1, "지금 " + t.도형().length + "개");

  t.간격바꾸기("5m");
  ok("5분봉으로 옮기면 0개 (봉 간격이 바뀌면 시간 자리의 뜻이 달라집니다)",
    t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.간격바꾸기("1m");
  ok("1분봉으로 되돌아오면 다시 1개", t.도형().length === 1, "지금 " + t.도형().length + "개");

  /* 저장통 안의 자리까지 봅니다 — 자리가 바뀌면 회원이 그은 선이 통째로 사라집니다 */
  const 통 = 저장소[t.M.STORAGE_KEY];
  ok("저장 열쇠가 chart-drawings 다", t.M.STORAGE_KEY === "chart-drawings", t.M.STORAGE_KEY);
  ok("채널이 bySymbol.BTCUSDT.byInterval['1m'] 자리에 들어간다",
    !!통 && !!통.bySymbol && !!통.bySymbol.BTCUSDT && Array.isArray(통.bySymbol.BTCUSDT.byInterval["1m"]) &&
    통.bySymbol.BTCUSDT.byInterval["1m"].filter((s) => s.type === "channel").length === 1);
  ok("수평선 자리(hlines)에는 안 들어간다 (수평선은 봉 간격을 안 봅니다)",
    !!통 && (통.bySymbol.BTCUSDT.hlines || []).length === 0);
  t.닫기();

  /* 새로고침 — 모듈을 완전히 새로 띄우고 같은 저장통만 물려줍니다 */
  const t2 = 띄우기({ 저장소: 저장소 });
  ok("새로고침 뒤에도 BTC 1분봉에 채널이 1개 남아 있다",
    t2.도형().length === 1, "지금 " + t2.도형().length + "개");
  const s2 = t2.도형()[0];
  ok("새로고침 뒤에도 폭 dp 가 -92 그대로다", !!s2 && 가깝나(s2.dp, -92), String(s2 && s2.dp));
  ok("새로고침 뒤에도 다시 그려진다 (두 선이 x=400 에서 92px)",
    가깝나(채널간격(t2, 400), 92, 0.01), String(채널간격(t2, 400)));
  t2.닫기();
}

/* =========================================================================
 * [6] 안내 한 줄 — 접히지 않는다 (nowrap 을 강제하지 않습니다)
 * ========================================================================= */
절("[6] 안내 한 줄이 접히지 않는다 (차트팀 실측 360 에서 27px)");
{
  const t = 띄우기({ width: 360, 칸너비: 330 });
  t.M.setTool("channel");
  const 알림 = t.알림();
  ok("여러선을 켜면 안내 한 줄이 나온다 (다른 도구와 톡 횟수가 달라서 필요합니다)", !!알림);
  ok("안내 글이 '세 번 톡 — 기준선 두 점, 그 다음 폭' 이다",
    !!알림 && 알림.textContent === "세 번 톡 — 기준선 두 점, 그 다음 폭", 알림 && 알림.textContent);
  ok("안내가 실제로 보인다", !!알림 && 알림.style.display === "block", 알림 && 알림.style.display);

  /* nowrap 을 걸지 않습니다 — placeToast() 가 카드 오른쪽 끝에 맞춰 밀어
     넣는 방식이라, nowrap 이면 좁은 폭에서 글자가 카드 밖으로 삐져나갑니다.
     그래서 "접히지 않는다" 를 CSS 값에서 나오는 한 줄 높이로 확인합니다. */
  const css = SRC.slice(SRC.indexOf(".tl-draw-toast{"), SRC.indexOf(".tl-draw-toast{") + 400);
  ok("안내 줄에 white-space:nowrap 을 걸지 않았다 (걸면 좁은 폭에서 카드 밖으로 나갑니다)",
    css.indexOf("nowrap") === -1, "nowrap 을 강제하지 마세요 — 차트팀이 일부러 뺐습니다");

  const 글자 = parseFloat((css.match(/font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
  const 줄높이 = parseFloat((css.match(/line-height:(\d+(?:\.\d+)?)/) || [])[1]);
  const 세로여백 = parseFloat((css.match(/padding:(\d+(?:\.\d+)?)px/) || [])[1]);
  ok("안내 글자가 12px 다", 글자 === 12, String(글자));
  ok("줄 높이가 1.6 이다", 줄높이 === 1.6, String(줄높이));
  ok("위아래 여백이 3px 다", 세로여백 === 3, String(세로여백));

  const 한줄 = 글자 * 줄높이 + 세로여백 * 2 + 2;   /* 글자줄 + 여백 + 테두리 1px 두 줄 */
  ok("한 줄 높이 계산이 차트팀 실측 27px 과 맞는다 (12 x 1.6 + 3 x 2 + 1 x 2 = 27.2)",
    Math.round(한줄) === 27, 한줄.toFixed(1) + "px");
  ok("두 줄이면 46px 이라 27 과 확실히 구분된다 (높이만 봐도 접힘을 알 수 있습니다)",
    Math.round(글자 * 줄높이 * 2 + 세로여백 * 2 + 2) === 46);

  /* 글이 길어지면 접힙니다. 좁은 폭에서 들어가는지 글자 수로 미리 잽니다.
     주의 — jsdom 에는 글자 폭이 없어서 이것은 실측이 아니라 어림입니다
     (한글 1.0em / 빈칸 0.28em / 나머지 0.55em — 실제 브라우저보다 넉넉하게 잡았습니다).
     진짜 폭은 차트팀이 360 에서 재서 27px 한 줄을 확인했습니다. */
  const 어림폭 = (s) => {
    let w = 0;
    for (const ch of s) {
      if (/[가-힣ㄱ-ㆎ一-鿿—]/.test(ch)) w += 12;
      else if (ch === " ") w += 12 * 0.28;
      else w += 12 * 0.55;
    }
    return w;
  };
  const 안내폭 = 어림폭("세 번 톡 — 기준선 두 점, 그 다음 폭") + 10 * 2 + 2;  /* 좌우 여백 10 + 테두리 */
  const 쓸수있는폭 = 330 - 8 * 2;   /* 360 폭 차트 칸 330px 에서 CHIP_EDGE 8 씩 뺀 값 */
  ok("360 에서 안내 글이 한 줄에 들어간다 (어림 " + Math.round(안내폭) + "px <= " + 쓸수있는폭 + "px)",
    안내폭 <= 쓸수있는폭, Math.round(안내폭) + " vs " + 쓸수있는폭);
  ok("여유가 30% 넘게 남는다 (글을 조금 손봐도 바로 접히지 않습니다)",
    안내폭 <= 쓸수있는폭 * 0.7, Math.round((안내폭 / 쓸수있는폭) * 100) + "%");
  t.닫기();
}
{
  /* 여섯 폭 전부에서 안내가 나오고, 좁을수록 칸이 좁아도 글은 그대로입니다 */
  [[360, 330], [375, 345], [390, 360], [768, 700], [1440, 1000], [1920, 1400]].forEach(function (p) {
    const t = 띄우기({ width: p[0], 칸너비: p[1] });
    t.M.setTool("channel");
    const 알림 = t.알림();
    ok(p[0] + "px 에서도 안내 한 줄이 그대로 나온다",
      !!알림 && 알림.style.display === "block" &&
      알림.textContent === "세 번 톡 — 기준선 두 점, 그 다음 폭",
      알림 && 알림.textContent);
    t.닫기();
  });
}

/* =========================================================================
 * [7] 이미 나가 있는 것을 안 망가뜨렸다
 * ========================================================================= */
절("[7] 다른 도구가 그대로다");
{
  const t = 띄우기();
  t.M.setTool("trend");
  t.톡(300, 100);
  t.톡(500, 200);
  ok("추세선은 여전히 두 번 톡이다", t.도형().length === 1 && t.도형()[0].type === "trend",
    t.도형().length + "개 / " + (t.도형()[0] && t.도형()[0].type));
  ok("추세선에는 dp 가 안 붙는다", !!t.도형()[0] && t.도형()[0].dp === undefined);

  채널그리기(t);
  ok("추세선 옆에 채널이 하나 더 생긴다", t.도형().length === 2, "지금 " + t.도형().length + "개");

  /* 지우기 — 채널도 다른 그림과 같이 지워져야 합니다 */
  t.M.clearAll();
  ok("전부 지우기로 채널도 지워진다", t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.닫기();
}
{
  /* 채널을 골라서 지울 수 있어야 합니다 (못 지우면 회원이 잘못 그은 것에 갇힙니다) */
  const t = 띄우기();
  채널그리기(t);
  t.M.setTool("cursor");
  t.톡(400, 150);   /* 기준선 위를 톡 — 골라져야 합니다 */
  const 골린것 = t.M.getSelected();
  ok("커서로 채널을 고를 수 있다", !!골린것 && 골린것.kind === "shape", JSON.stringify(골린것));
  t.M.removeSelected();
  ok("고른 채널을 지울 수 있다", t.도형().length === 0, "지금 " + t.도형().length + "개");
  t.닫기();
}

/* =========================================================================
 * 끝
 * ========================================================================= */
console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창이 타이머를 붙들고 있어서 이 줄이 없으면 프로세스가 안 끝납니다.
   npm test 는 목록을 이어 돌리므로, 한 파일이 안 끝나면 뒤가 통째로 안 돕니다. */
process.exit(fail ? 1 : 0);
