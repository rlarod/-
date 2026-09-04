/* tests/chart-candle-type-seal.test.js
 * =========================================================================
 * 봉 종류 봉인 — 2026-08-28 (기록팀)
 *   대상: js/chart-candle-type.js  (App.ChartCandleType)
 * =========================================================================
 * 가로 막대 "봉 종류" 버튼 — 캔들 / 라인 / 바 / 영역 넷을 고릅니다.
 *
 * ── ⭐ 이 봉인이 지키는 제일 중요한 것 ────────────────────────────────
 *
 *   캔들 시리즈를 **갈아끼우지 않습니다.**
 *   지웠다 새로 만들면 그 시리즈에 매달린 것이 전부 떨어집니다 —
 *     · 진입가 · TP · SL · 청산가 · 미체결 가로선 (createPriceLine)
 *     · 수평선 · 추세선 · 피보나치 · 자 · 채널 · 브러시 (attachPrimitive)
 *     · MA · 볼린저 · RSI · MACD 가 종가를 읽어가는 자리
 *
 *   그래서 캔들은 그대로 두고 **색만 투명(rgba(0,0,0,0))** 으로 만든 뒤
 *   그 위에 라인/바/영역을 하나 얹습니다.
 *
 * ── ⭐⭐ visible:false 를 쓰면 안 됩니다 ───────────────────────────────
 *
 *   visible:false 로 바꾸면 그 시리즈에 붙은 **가로선까지 같이 사라집니다.**
 *   투명색은 "보이는 시리즈" 라서 청산가·진입가 가로선이 그대로 그려집니다.
 *
 *   한 글자 차이인데 결과가 다릅니다 — 그리고 화면은 똑같아 보입니다.
 *   봉 종류를 라인으로 바꾼 회원의 **청산가 선이 조용히 사라지는** 것이라
 *   회원은 자기 청산가를 모르는 채로 거래하게 됩니다. 전형적인 조용한 고장이고
 *   돈에 직결됩니다. 그래서 값으로 못 박습니다.
 *
 * ── ⭐ 기준이 바뀌었습니다 (2026-09-02 대표 지시) ─────────────────────
 *
 *   처음(2026-08-28)엔 **바이낸스 Original 실측**으로 넷이었습니다 —
 *   Candle / Line / Bars / Area. 그때는 그게 맞았습니다.
 *
 *   그 뒤 대표가 **"트레이딩뷰 시스템을 따라간다 이상."** 이라고 정했고,
 *   PM 이 **차트 시스템 전체**(지표·그리기·봉 종류)로 확인해 주었습니다.
 *   그래서 이 봉인의 "넷뿐" 조항만 트레이딩뷰 기준으로 바꿉니다.
 *   **나머지 조항(시리즈 안 갈아끼우기 · visible:false 금지 · 한 봉만 갱신 ·
 *   기억하기)은 한 글자도 안 바뀌었습니다. 그게 돈에 닿는 부분입니다.**
 *
 * ── ⚠️⚠️ 하이킨아시는 진짜 가격이 아닙니다 ([3-2] 절) ────────────────
 *
 *   HA종가 = (시+고+저+종)/4 로 **평균낸 값**입니다. 그런데 진입가·청산가·
 *   미체결 선은 **진짜 가격**입니다. 회원이 HA 봉값을 보고 주문을 내면
 *   돈이 걸립니다. 그래서 아래를 값으로 못 박습니다 —
 *     · 계산식이 트레이딩뷰 원문과 같은가 (손으로 푼 값과 대조)
 *     · 얹은 시리즈가 오른쪽 축에 자기 값을 안 찍는가
 *       (lastValueVisible / priceLineVisible 이 꺼져 있는가)
 *     · 진짜 캔들이 pane 의 **첫 번째** Candlestick 인가
 *       (범례·포지션선·그리기·지표가 전부 "첫 번째" 를 잡아갑니다)
 *     · 화면에 경고 문구가 뜨는가
 *
 * 서버도 브라우저도 부르지 않습니다. 가짜 차트만 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-candle-type.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const 글씨단위 = require("./_font-size.js");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/* =========================================================================
 * 가짜 차트 — 라이브러리 공개 API 모양만 흉내 냅니다
 * ========================================================================= */
function 가짜차트창(저장된) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;
  /* boot() 은 DOMContentLoaded 를 기다렸다가 setInterval 로 차트를 찾습니다.
     타이머를 남기지 않으려고 한 번만 바로 실행되게 바꿔 둡니다.
     (이걸 안 하면 새로고침 복원 경로가 아예 안 돌아서, 그 검사가
      거짓으로 실패합니다 — 실제로 처음에 그랬습니다) */
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = () => {};
  win.setTimeout = () => 0; win.clearTimeout = () => {};

  /* 캔들 시리즈 — chart.js 가 만든 그 하나 */
  const 캔들옵션 = {
    upColor: "#26C281", downColor: "#F0506E", borderVisible: false,
    borderUpColor: "#26C281", borderDownColor: "#F0506E",
    wickUpColor: "#26C281", wickDownColor: "#F0506E"
  };
  const 캔들 = {
    __이름: "candle",
    seriesType: () => "Candlestick",
    options: () => Object.assign({}, 캔들옵션),
    applyOptions: function (o) { Object.assign(캔들옵션, o || {}); return true; },
    setData: function (d) { 캔들.__data = d; return true; },
    update: function (b) { 캔들.__last = b; return true; },
    createPriceLine: function (o) { return { o: o }; }
  };

  /* 붙어 있는 것들 — 시리즈를 갈아끼우면 같이 떨어집니다 */
  const 붙은가로선 = [
    캔들.createPriceLine({ price: 100, title: "진입가" }),
    캔들.createPriceLine({ price: 90, title: "청산가" })
  ];

  const 기록 = { 만든것: [], 지운것: [], setData: 0, update: 0 };
  /* ⭐ 진짜 라이브러리와 같게 — getSeries() 는 **만든 순서대로** 돌려줍니다.
     진짜 캔들이 먼저 만들어졌으니 언제나 첫 번째입니다.
     범례·포지션선·그리기·지표가 전부 "첫 번째 Candlestick" 을 잡아가므로,
     우리가 얹은 하이킨아시가 앞으로 끼어들면 안 됩니다. */
  const 살아있는것 = [];
  const pane = { getSeries: () => [캔들].concat(살아있는것) };

  function 시리즈만들기(이름, 타입, opts) {
    const s = {
      __이름: 이름,
      __opts: Object.assign({}, opts || {}),
      seriesType: () => 타입,
      options: () => Object.assign({}, s.__opts),
      applyOptions: function (o) { Object.assign(s.__opts, o || {}); return true; },
      setData: function (d) { s.__data = d; 기록.setData++; return true; },
      update: function (b) { s.__last = b; 기록.update++; return true; },
      data: () => s.__data || []
    };
    기록.만든것.push(s);
    살아있는것.push(s);
    return s;
  }

  const chart = {
    panes: () => [pane],
    addSeries: function (형, opts) {
      return 시리즈만들기((형 && 형.__이름) || "?", (형 && 형.__타입) || "?", opts);
    },
    addCustomSeries: function (뷰, opts) {
      const s = 시리즈만들기("Custom", "Custom", opts);
      s.__뷰 = 뷰;
      return s;
    },
    removeSeries: function (s) {
      기록.지운것.push(s);
      const i = 살아있는것.indexOf(s);
      if (i !== -1) 살아있는것.splice(i, 1);
      return true;
    },
    timeScale: () => ({
      getVisibleLogicalRange: () => null,
      subscribeVisibleLogicalRangeChange: () => {}
    })
  };

  win.LightweightCharts = {
    LineSeries: { __이름: "Line", __타입: "Line" },
    AreaSeries: { __이름: "Area", __타입: "Area" },
    BarSeries: { __이름: "Bar", __타입: "Bar" },
    CandlestickSeries: { __이름: "Candlestick", __타입: "Candlestick" },
    BaselineSeries: { __이름: "Baseline", __타입: "Baseline" },
    HistogramSeries: { __이름: "Histogram", __타입: "Histogram" },
    LineType: { Simple: 0, WithSteps: 1, Curved: 2 }
  };

  /* 안내줄이 실제로 붙는지 보려면 붙일 자리가 있어야 합니다 */
  win.document.body.innerHTML =
    '<div class="chart-panel"><div class="tl-ohlc"></div><div class="tlc-body"></div></div>';

  const 저장소 = { 값: 저장된 === undefined ? null : 저장된, 쓴횟수: 0 };
  win.App = {
    ChartFont: { getCharts: () => [chart] },
    Storage: {
      load: (k) => 저장소.값,
      save: function (k, v) { 저장소.값 = v; 저장소.쓴횟수++; return true; }
    }
  };

  win.eval(SRC);
  /* 실제 페이지에서 boot() 이 도는 자리를 대신 열어 줍니다 */
  try {
    win.document.dispatchEvent(new win.Event("DOMContentLoaded", { bubbles: true }));
  } catch (e) { /* noop */ }
  const M = win.App.ChartCandleType;
  return {
    win, M, chart, 캔들, 캔들옵션, 기록, 저장소, 붙은가로선, pane,
    닫기: function () { try { win.close(); } catch (e) { /* noop */ } }
  };
}

/** 지금 pane 안에 Candlestick 시리즈가 살아 있나 */
function 캔들살아있나(t) {
  return t.pane.getSeries().some((s) => s.seriesType() === "Candlestick");
}

console.log("\n봉 종류 봉인 — 시리즈를 갈아끼우지 않는다 (2026-08-28)");

/* =========================================================================
 * [0] 수정 금지 파일 · 실려 있는 자리 · git
 * ========================================================================= */
절("[0] 수정 금지 파일 · 실린 자리 · git 추적");
{
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/chart.js 를 한 글자도 안 고쳤다", md5("chart.js") === "02ddcb000d577131f797143d08c09123", md5("chart.js"));
  ok("js/trading.js 를 한 글자도 안 고쳤다", md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록

  const 부름 = "src=\"" + MOD + "\"";
  ok("index.html 이 이 모듈을 부른다", HTML.indexOf(부름) !== -1);
  ok("한 줄만 실린다 (두 번 실리면 감싸기가 두 겹입니다)",
    HTML.split(부름).length - 1 === 1, String(HTML.split(부름).length - 1));
  ok("js/chart.js 뒤에서 부른다 (차트가 만들어진 뒤에 붙습니다)",
    HTML.indexOf(부름) > HTML.indexOf("src=\"js/chart.js\""));

  let 추적 = new Set(); let git됨 = true;
  try {
    추적 = new Set(execFileSync("git", ["ls-files", "-z", "--", "js"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(String.fromCharCode(0)).filter(Boolean));
  } catch (e) { git됨 = false; }
  ok(MOD + " 가 git 에 올라가 있다 (fs.existsSync 로는 못 잡는 자리입니다)",
    !git됨 || 추적.has(MOD), "git 에 없으면 라이브에서 404 입니다");
}

/* =========================================================================
 * [1] ⭐⭐ visible:false 를 쓰지 않는다
 * ========================================================================= */
절("[1] visible:false 를 쓰지 않는다 — 쓰면 청산가 선이 같이 사라집니다");
{
  /* 주석은 빼고 진짜 코드만 봅니다 — 설명문에 그 낱말이 적혀 있습니다 */
  const 코드 = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("코드에 visible:false 가 없다",
    !/visible\s*:\s*false/.test(코드),
    "캔들을 visible:false 로 숨기면 그 시리즈에 붙은 청산가·진입가 가로선까지 사라집니다");
  ok("숨기는 방법이 투명색이다 (rgba(0,0,0,0))",
    SRC.indexOf("rgba(0,0,0,0)") !== -1);
  ok("왜 visible:false 를 안 썼는지 근거가 적혀 있다",
    SRC.indexOf("visible:false 를 쓰지 않은 이유") !== -1,
    "근거가 없으면 다음 사람이 '한 줄이면 되는데' 하고 바꿉니다");

  /* 값으로도 확인 — 네 종류를 다 눌러보며 캔들에 visible 이 꺼지지 않는지 */
  const t = 가짜차트창();
  ["line", "bar", "area", "candle"].forEach(function (k) {
    t.M.setType(k);
    ok(k + " 로 바꿔도 캔들의 visible 이 꺼지지 않는다",
      t.캔들옵션.visible === undefined || t.캔들옵션.visible === true,
      "visible=" + String(t.캔들옵션.visible));
  });
  t.닫기();
}

/* =========================================================================
 * [2] ⭐ 캔들 시리즈를 갈아끼우지 않는다
 * ========================================================================= */
절("[2] 네 종류를 다 눌러도 캔들 시리즈가 그대로 있다");
{
  const t = 가짜차트창();
  const 처음캔들 = t.pane.getSeries().filter((s) => s.seriesType() === "Candlestick")[0];

  ["candle", "line", "bar", "area", "line", "candle"].forEach(function (k) {
    t.M.setType(k);
    ok(k + " 에서 Candlestick 시리즈가 살아 있다", 캔들살아있나(t));
  });

  ok("처음의 그 캔들 객체 그대로다 (새로 만든 것이 아니다)",
    t.pane.getSeries().filter((s) => s.seriesType() === "Candlestick")[0] === 처음캔들,
    "객체가 바뀌었으면 붙어 있던 가로선·도형·지표가 전부 떨어진 것입니다");

  ok("캔들 시리즈를 한 번도 지우지 않았다 (removeSeries 대상에 캔들이 없다)",
    t.기록.지운것.indexOf(처음캔들) === -1,
    "지운 것: " + t.기록.지운것.map((s) => s.__이름).join(","));

  ok("붙어 있던 가로선 2개가 그대로다 (진입가·청산가)",
    t.붙은가로선.length === 2 && t.붙은가로선.every((l) => !!l));
  t.닫기();
}
{
  /* 라인으로 갔다가 캔들로 돌아오면 원래 색이 돌아와야 합니다 */
  const t = 가짜차트창();
  const 원래색 = t.캔들옵션.upColor;
  t.M.setType("line");
  ok("라인일 때 캔들 색이 투명이다", t.캔들옵션.upColor === "rgba(0,0,0,0)", t.캔들옵션.upColor);
  t.M.setType("candle");
  ok("캔들로 돌아오면 원래 색이 되돌아온다 (" + 원래색 + ")",
    t.캔들옵션.upColor === 원래색, t.캔들옵션.upColor);
  ok("캔들로 돌아오면 얹었던 시리즈를 지운다",
    t.기록.지운것.length >= 1, String(t.기록.지운것.length));
  t.닫기();
}

/* =========================================================================
 * [3] 트레이딩뷰 목록을 따라간다 (2026-09-02 대표 지시)
 * ========================================================================= */
절("[3] 고를 수 있는 것 (트레이딩뷰 기준)");
{
  const t = 가짜차트창();
  const 종류 = t.M.TYPES.map((x) => x.k);
  const 있어야할것 = [
    "candle", "heikin", "bar", "highlow",
    "line", "step", "area", "hlcarea", "baseline", "columns"
  ];
  ok("처음 넷(캔들·라인·바·영역)이 그대로 남아 있다 — 늘리면서 빼지 않았습니다",
    ["candle", "line", "bar", "area"].every((k) => 종류.indexOf(k) !== -1), 종류.join(","));
  있어야할것.forEach(function (k) {
    ok("'" + k + "' 를 고를 수 있다", 종류.indexOf(k) !== -1, 종류.join(","));
  });
  ok("같은 것이 두 번 들어 있지 않다",
    new Set(종류).size === 종류.length, 종류.join(","));
  ok("이름·설명이 다 채워져 있다 (빈 줄이 보이면 안 됩니다)",
    t.M.TYPES.every((x) => x.name && x.note), JSON.stringify(t.M.TYPES));

  /* 라이브러리에 없어 아직 못 만드는 것 — 목록에 넣지 않습니다 */
  ["renko", "linebreak", "kagi", "pointfigure", "hollow", "volumecandle"].forEach(function (k) {
    ok("'" + k + "' 는 아직 없다 (라이브러리에 없어서 못 만듭니다)",
      종류.indexOf(k) === -1);
  });
  ok("모르는 종류를 넣으면 거절한다", t.M.setType("renko") === false);
  ok("거절된 뒤에도 종류가 안 바뀐다", t.M.getType() !== "renko", t.M.getType());

  ok("기준이 왜 바뀌었는지 모듈에 적혀 있다 (2026-09-02 대표 지시)",
    SRC.indexOf("2026-09-02 대표 지시") !== -1 &&
    SRC.indexOf("트레이딩뷰 시스템을 따라간다") !== -1);
  ok("처음 실측(2026-08-28 바이낸스)도 지우지 않고 남겼다",
    SRC.indexOf("2026-08-28") !== -1 && SRC.indexOf("바이낸스 Original") !== -1);
  ok("못 넣은 것을 왜 못 넣었는지 적혀 있다 (11개를 이름으로 적었는가)",
    ["Hollow candles", "Volume candles", "Line with markers", "Volume footprint",
     "Time price opportunity", "Session volume profile", "Renko", "Kagi",
     "Point & figure", "Range"].every((n) => SRC.indexOf(n) !== -1),
    "'다음 건입니다' 한 줄로 넘기면 다음 사람이 뭘 남겼는지 모릅니다");
  ok("트레이딩뷰 목록을 어디서 쟀는지 적혀 있다 (주소·캡처)",
    SRC.indexOf("tradingview.com/chart") !== -1 &&
    SRC.indexOf("shots/ct18-hk-tv-style-menu.png") !== -1);

  /* 순서도 트레이딩뷰 그대로여야 합니다 — 회원이 같은 자리에서 찾습니다 */
  ok("목록 순서가 트레이딩뷰 Chart style 창 순서 그대로다",
    종류.join(",") === "bar,candle,line,step,area,hlcarea,baseline,columns,highlow,heikin",
    종류.join(","));

  /* 열 가지를 다 눌러도 진짜 캔들이 살아 있고 첫 번째여야 합니다 */
  있어야할것.forEach(function (k) {
    t.M.setType(k);
    ok(k + " 로 바꿔도 진짜 캔들이 pane 의 첫 Candlestick 이다",
      t.pane.getSeries().filter((s) => s.seriesType() === "Candlestick")[0] === t.캔들,
      "얹은 것이 앞으로 끼어들면 범례·포지션선이 평균값을 잡아갑니다");
  });
  t.M.setType("candle");

  ok("바이낸스를 어디서 쟀는지 적혀 있다 (주소·날짜·캡처)",
    SRC.indexOf("binance.com/en/futures/BTCUSDT") !== -1 &&
    SRC.indexOf("2026-08-28") !== -1 && SRC.indexOf("shots/ct5-bnf-charttype.png") !== -1);
  ok("하이킨아시를 왜 뺐다가 왜 넣었는지 적혀 있다",
    SRC.indexOf("하이킨아시") !== -1 && SRC.indexOf("바이낸스 Original") !== -1);
  t.닫기();
}

/* =========================================================================
 * [3-2] ⚠️⚠️ 하이킨아시는 진짜 가격이 아니다 — 돈에 닿는 자리
 * ========================================================================= */
절("[3-2] 하이킨아시 — 평균낸 값이 진짜 가격인 척하면 안 된다");
{
  const t = 가짜차트창();

  /* ---- 계산식 : 트레이딩뷰 고객센터 원문 ----
     HA종가 = (시+고+저+종)/4
     HA시가 = (앞 HA시가 + 앞 HA종가)/2      첫 봉은 (시+종)/2
     HA고가 = max(고, HA시가, HA종가)
     HA저가 = min(저, HA시가, HA종가)
     아래 기대값은 손으로 풀어서 적은 것입니다(코드로 만들지 않았습니다). */
  const 봉 = [
    { time: 1, open: 100, high: 110, low: 90, close: 105 },
    { time: 2, open: 105, high: 120, low: 100, close: 115 },
    { time: 3, open: 115, high: 118, low: 95, close: 97 }
  ];
  const 손으로푼값 = [
    { open: 102.5, high: 110, low: 90, close: 101.25 },
    { open: 101.875, high: 120, low: 100, close: 110 },
    { open: 105.9375, high: 118, low: 95, close: 106.25 }
  ];
  const 낸값 = t.M.heikinAshi(봉);
  ok("하이킨아시 계산 결과가 3개다", 낸값.length === 3, String(낸값.length));
  손으로푼값.forEach(function (기대, i) {
    ok("봉 " + (i + 1) + " 의 HA 시·고·저·종이 손으로 푼 값과 같다",
      낸값[i] && 낸값[i].open === 기대.open && 낸값[i].high === 기대.high &&
      낸값[i].low === 기대.low && 낸값[i].close === 기대.close,
      JSON.stringify(낸값[i]) + " != " + JSON.stringify(기대));
  });
  ok("첫 봉의 HA시가는 (시+종)/2 다 (앞 봉이 없으므로)",
    낸값[0].open === (봉[0].open + 봉[0].close) / 2, String(낸값[0].open));
  ok("계산식 출처(트레이딩뷰 원문 주소)가 모듈에 적혀 있다",
    SRC.indexOf("tradingview.com/support/solutions/43000619436-heikin-ashi") !== -1);

  /* ---- 한 봉씩 갱신해도 통째로 계산한 것과 같아야 합니다 ---- */
  t.M.setType("heikin");
  const 얹은것 = t.기록.만든것[t.기록.만든것.length - 1];
  t.캔들.setData(봉);
  ok("하이킨아시로 바꾸면 캔들 모양 시리즈를 하나 얹는다",
    얹은것.seriesType() === "Candlestick", 얹은것.seriesType());
  ok("통째로 넣은 값이 하이킨아시 값이다",
    (얹은것.__data || []).length === 3 && 얹은것.__data[2].close === 106.25,
    JSON.stringify(얹은것.__data && 얹은것.__data[2]));

  /* 마지막 봉이 시세로 계속 바뀌는 상황 */
  t.캔들.update({ time: 3, open: 115, high: 118, low: 95, close: 97 });
  const 한봉씩 = 얹은것.__last;
  ok("마지막 봉만 갱신해도 통째로 계산한 값과 같다 (틱마다 어긋나면 안 됩니다)",
    한봉씩 && 한봉씩.open === 105.9375 && 한봉씩.close === 106.25,
    JSON.stringify(한봉씩));

  /* ---- 오른쪽 축에 평균값을 현재가처럼 찍지 않는다 ---- */
  ok("얹은 시리즈가 마지막 값을 축에 안 찍는다 (lastValueVisible=false)",
    얹은것.__opts.lastValueVisible === false, String(얹은것.__opts.lastValueVisible));
  ok("얹은 시리즈가 자기 가격선을 안 그린다 (priceLineVisible=false)",
    얹은것.__opts.priceLineVisible === false, String(얹은것.__opts.priceLineVisible));

  /* ---- 진짜 캔들은 값이 그대로여야 합니다 ---- */
  ok("진짜 캔들에는 하이킨아시 값이 안 들어갔다 (십자선 범례가 읽는 자리)",
    t.캔들.__data === 봉 && t.캔들.__last.close === 97,
    JSON.stringify(t.캔들.__last));

  /* ---- 화면 경고 ---- */
  const 안내 = t.win.document.getElementById(t.M.NOTICE_ID);
  ok("하이킨아시일 때 화면에 안내줄이 뜬다", !!안내);
  ok("안내줄에 '평균' 이라는 말이 있다",
    !!안내 && 안내.textContent.indexOf("평균") !== -1, 안내 && 안내.textContent);
  ok("안내줄에 '실제 가격' 이라는 말이 있다",
    !!안내 && 안내.textContent.indexOf("실제 가격") !== -1, 안내 && 안내.textContent);
  ok("안내줄이 청산가·진입가를 콕 집어 말한다",
    !!안내 && 안내.textContent.indexOf("청산가") !== -1 &&
    안내.textContent.indexOf("진입가") !== -1, 안내 && 안내.textContent);
  /* ⚠️⚠️ 2026-09-02 밤 기록팀이 고쳤습니다 — ★이 검사가 아무것도 안 지키고
     있었습니다.★ 예전 모양은 이랬습니다:

         /#\s*"\s*\+\s*NOTICE_ID/.test(SRC) || /font-size:17px…/.test(SRC)

     앞쪽 조건은 모듈 안의 `var N = "#" + NOTICE_ID;` 한 줄에 ★언제나★ 걸립니다.
     || 라서 뒤쪽(글씨 크기)은 아예 안 봅니다.
     실측 — 사본에서 안내줄 글씨를 17px -> 12px 로 바꿔 돌렸더니
     이 줄이 그대로 [O] 로 통과했고 파일 전체가 115/0 초록이었습니다.

     그래서 소스 글자 대신 ★실제로 넣은 <style> 내용★ 에서 크기를 읽습니다.
     같은 방식의 검사가 tests/chart-ha-real-price-seal.test.js [5] 에도 있는데,
     그쪽은 자리·연결·색까지 같이 봅니다. 여기는 크기 하나만 남겨 둡니다. */
  const 안내규칙 = (function () {
    const ss = t.win.document.querySelectorAll("style");
    for (let i = 0; i < ss.length; i++) {
      const m = ss[i].textContent.match(new RegExp("#" + t.M.NOTICE_ID + "\\s*\\{([^}]*)\\}"));
      if (m) return m[1];
    }
    return "";
  })();
  const 안내크기 = Number((안내규칙.match(/font-size:\s*(\d+)px/) || [])[1] || 0);
  ok("안내줄 글씨를 줄이지 않았다 (17px 이상 — 실제 <style> 에서 읽음)",
    안내크기 >= 17, 안내크기 + "px · 대표가 작은 글씨를 못 읽습니다");

  t.M.setType("candle");
  ok("캔들로 돌아오면 안내줄이 사라진다",
    !t.win.document.getElementById(t.M.NOTICE_ID));

  ok("하이킨아시만 '진짜 가격이 아닌 봉' 으로 표시돼 있다",
    t.M.SYNTHETIC && t.M.SYNTHETIC.heikin === true &&
    Object.keys(t.M.SYNTHETIC).length === 1, JSON.stringify(t.M.SYNTHETIC));
  t.닫기();
}

/* =========================================================================
 * [3-3] HLC 영역은 Custom 시리즈여야 한다
 *   캔들 시리즈를 찾는 모듈이 8개 있습니다(범례·포지션선·그리기·지표…).
 *   전부 "첫 번째 Candlestick" 을 잡아가므로, 우리가 얹는 것이 굳이
 *   Candlestick 일 필요가 없으면 Custom 으로 두는 편이 안전합니다.
 * ========================================================================= */
절("[3-3] 얹는 시리즈의 종류");
{
  const t = 가짜차트창();
  const 기대 = {
    line: "Line", step: "Line", area: "Area", bar: "Bar",
    heikin: "Candlestick", highlow: "Candlestick",
    hlcarea: "Custom", baseline: "Baseline", columns: "Histogram"
  };
  Object.keys(기대).forEach(function (k) {
    t.M.setType(k);
    const s = t.기록.만든것[t.기록.만든것.length - 1];
    ok(k + " 는 " + 기대[k] + " 시리즈로 얹는다", s && s.seriesType() === 기대[k],
      s && s.seriesType());
  });
  t.M.setType("step");
  const 계단 = t.기록.만든것[t.기록.만든것.length - 1];
  ok("계단선은 lineType 을 WithSteps(1) 로 준다",
    계단.__opts.lineType === 1, String(계단.__opts.lineType));
  t.M.setType("line");
  const 라인 = t.기록.만든것[t.기록.만든것.length - 1];
  ok("그냥 라인에는 lineType 을 안 준다",
    라인.__opts.lineType === undefined, String(라인.__opts.lineType));
  t.닫기();
}

/* =========================================================================
 * [4] 새 값이 올 때 전체를 다시 계산하지 않는다
 * ========================================================================= */
절("[4] 값이 올 때 한 봉만 옮긴다 (캔들일 때는 계산 0)");
{
  const t = 가짜차트창();
  t.M.setType("line");
  const 만든것 = t.기록.만든것[t.기록.만든것.length - 1];

  const 봉 = [];
  for (let i = 0; i < 500; i++) 봉.push({ time: i, open: 1, high: 2, low: 0, close: 1.5 });

  const 전 = { setData: t.기록.setData, update: t.기록.update };
  t.캔들.setData(봉);
  ok("과거 500봉을 통째로 넣을 때 얹은 시리즈도 한 번만 통째로 받는다",
    t.기록.setData === 전.setData + 1, String(t.기록.setData - 전.setData));
  ok("얹은 시리즈가 500개를 받았다", (만든것.__data || []).length === 500,
    String((만든것.__data || []).length));

  const 전2 = t.기록.update;
  t.캔들.update({ time: 501, open: 1, high: 2, low: 0, close: 1.7 });
  ok("마지막 봉 하나를 고칠 때 한 봉만 옮긴다 (전체 다시 계산 0회)",
    t.기록.update === 전2 + 1, String(t.기록.update - 전2));
  ok("옮긴 값이 종가다 (라인은 time·value 로 바꿔 넣습니다)",
    만든것.__last && 만든것.__last.value === 1.7, JSON.stringify(만든것.__last));

  /* ⭐ 캔들일 때는 얹은 시리즈가 없으니 계산이 0 이어야 합니다 */
  t.M.setType("candle");
  const 전3 = { setData: t.기록.setData, update: t.기록.update };
  t.캔들.setData(봉);
  t.캔들.update({ time: 502, open: 1, high: 2, low: 0, close: 1.9 });
  ok("봉 종류가 캔들이면 옮기는 계산이 0회다",
    t.기록.setData === 전3.setData && t.기록.update === 전3.update,
    "setData " + (t.기록.setData - 전3.setData) + " / update " + (t.기록.update - 전3.update));

  ok("감싼 뒤에도 chart.js 의 원래 setData 가 그대로 불린다",
    (t.캔들.__data || []).length === 500, String((t.캔들.__data || []).length));
  ok("감싼 뒤에도 chart.js 의 원래 update 가 그대로 불린다",
    t.캔들.__last && t.캔들.__last.close === 1.9, JSON.stringify(t.캔들.__last));
  t.닫기();
}
{
  /* 바(Bar)는 캔들과 자료 모양이 같아서 배열을 새로 만들지 않습니다 */
  const t = 가짜차트창();
  t.M.setType("bar");
  const 만든것 = t.기록.만든것[t.기록.만든것.length - 1];
  const 봉 = [{ time: 1, open: 1, high: 2, low: 0, close: 1.5 }];
  t.캔들.setData(봉);
  ok("바(Bar)는 넘어온 배열을 그대로 넘긴다 (새 배열을 안 만든다)",
    만든것.__data === 봉,
    "새 배열이면 500봉마다 쓸데없이 한 벌 더 만듭니다");
  t.닫기();
}

/* =========================================================================
 * [5] 기억한다 — 종목·봉 간격이 바뀌어도, 새로고침해도
 * ========================================================================= */
절("[5] 고른 종류를 기억한다");
{
  const t = 가짜차트창();
  ok("처음 값은 캔들이다", t.M.getType() === "candle", t.M.getType());
  t.M.setType("area");
  ok("바꾸면 저장한다", t.저장소.값 && t.저장소.값.type === "area", JSON.stringify(t.저장소.값));
  ok("저장 키가 chart-candle-type 이다", t.M.STORAGE_KEY === "chart-candle-type", t.M.STORAGE_KEY);
  t.닫기();

  /* 새로고침 — 저장된 값을 들고 새 창을 엽니다 */
  const t2 = 가짜차트창({ type: "area" });
  ok("새로고침 뒤에도 영역이 그대로다", t2.M.getType() === "area", t2.M.getType());
  ok("새로고침 뒤에도 캔들 시리즈가 살아 있다", 캔들살아있나(t2));
  ok("새로고침 뒤 캔들은 투명이고 얹은 시리즈가 하나 있다",
    t2.캔들옵션.upColor === "rgba(0,0,0,0)" && t2.기록.만든것.length === 1,
    t2.캔들옵션.upColor + " / 얹은 것 " + t2.기록.만든것.length + "개");
  t2.닫기();

  /* 망가진 저장값이 들어와도 캔들로 물러서야 합니다 */
  [{ type: "renko" }, { type: 123 }, {}, null, "area"].forEach(function (나쁜값, i) {
    const t3 = 가짜차트창(나쁜값);
    ok("이상한 저장값 " + i + " 이면 캔들로 물러선다 (" + JSON.stringify(나쁜값) + ")",
      t3.M.getType() === "candle", t3.M.getType());
    t3.닫기();
  });
}

/* =========================================================================
 * [6] 되돌리는 방법
 * ========================================================================= */
절("[6] 되돌리는 방법이 적혀 있다");
{
  ok("되돌리는 방법이 모듈에 적혀 있다 (script 한 줄 + ready:false)",
    SRC.indexOf("되돌리기") !== -1 && SRC.indexOf("ready:true -> false") !== -1);
  ok("chart.js 를 안 고쳤다는 근거가 적혀 있다",
    SRC.indexOf("js/chart.js 는 한 글자도 고치지 않았습니다") !== -1);
  ok("색을 chart.js 에서 읽어온다고 적혀 있다 (숫자를 베껴 적지 않았습니다)",
    SRC.indexOf("숫자를 여기 적어두면") !== -1);
}


/* ===================================================================== */
절("[7] ★px 말고 다른 단위로 우회하지 않았는가★");
{
/* ⚠️ 2026-09-04 기록팀 — ★이 파일의 글씨 검사들이 px 라고 적힌 것만 셌습니다.★
     1.0625rem(=17px) · 1em · 120% · 13pt · 4vw · calc() · clamp() 로 적으면
     바닥값 검사를 통째로 빠져나갑니다. 대표가 글씨 크기로 네 번 지적하신 자리입니다.

     ★실측 (2026-09-04, 사본에서 · 진짜 파일은 안 건드렸습니다)★
       js/chart-indicator-kit.js 사본의 .tl-kit-btn 맨 앞에
           font-size:clamp(11px, 2vw, 17px)   ← 360 에서는 11px 로 그려집니다
       를 끼웠더니, 옛 검사는 ★옆 규칙의 17px 을 대신 읽어★ "17px" 이라 보고하고
       그대로 초록이었습니다. 0.6875rem(=11px) 도 똑같이 17 로 읽혔습니다.
       17px 미만 개수 검사도 원본 0 · clamp 사본 0 · rem 사본 0 으로 같았습니다.

     ★환산이 아니라 "px 로만 적어라" 로 못 박은 이유★ — rem·em·%·vw·ch·clamp 는
     화면·부모·글꼴·회원 브라우저 설정에 따라 달라져 정적으로 px 을 못 냅니다.
     우리 규칙은 ★가장 좁은 360 에서도 17px★ 이라, 좁아지면 작아지는 표기는
     애초에 쓰면 안 되는 것입니다. 자세한 근거는 tests/_font-size.js 머리말.

     판정은 tests/_font-size.js 한 곳에만 있습니다. 아래 자체검증 줄을 같이 두어,
     그 한 곳을 헐겁게 고쳐 봉인 9개를 한꺼번에 눈멀게 하는 것을 막습니다. */
  const 검 = 글씨단위.자체검증();
  ok("단위 판정기가 표본 " + 검.표본수 + "개를 다 맞춘다 (tests/_font-size.js)",
    검.전부통과, 검.설명);

  /* 위 [3-2] 가 안내줄 글씨를 <style> 에서 읽어 17px 이상인지 봅니다.
     그 검사는 /font-size:\\s*(\\d+)px/ 라 px 이 아니면 0 이 되어 빨개집니다(닫힘).
     여기서는 ★모듈 전체★ 에 다른 단위가 새로 생기는 것을 막습니다. */
  const 위반 = 글씨단위.단위위반(SRC);
  const 선언수 = 글씨단위.선언들(SRC).length;
  ok("chart-candle-type.js 의 font-size 를 px 로만 적었다 (" + 선언수 + "곳 확인)",
    위반.length === 0, 글씨단위.요약(위반));
  ok("font-size 선언을 하나 이상 읽었다 (검사가 헛돌지 않았다)", 선언수 >= 1);
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
