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
 * ── 넷뿐인 이유 (2026-08-28 바이낸스 실측) ────────────────────────────
 *
 *   binance.com/en/futures/BTCUSDT 를 열어 Original 모드의 Chart Style 을
 *   세었더니 정확히 넷이었습니다 — Candle / Line / Bars / Area.
 *   하이킨아시 · 할로우 캔들은 **바이낸스 Original 에 없어서 뺐습니다.**
 *   "있으면 좋을 것 같아서" 넣지 않습니다. 늘리려면 바이낸스를 다시 열어
 *   확인하고 이 봉인의 숫자도 같이 고쳐야 합니다.
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
  const pane = { getSeries: () => [캔들] };

  const chart = {
    panes: () => [pane],
    addSeries: function (형, opts) {
      const s = {
        __이름: (형 && 형.__이름) || "?",
        __opts: Object.assign({}, opts || {}),
        seriesType: () => (형 && 형.__타입) || "?",
        applyOptions: function (o) { Object.assign(s.__opts, o || {}); return true; },
        setData: function (d) { s.__data = d; 기록.setData++; return true; },
        update: function (b) { s.__last = b; 기록.update++; return true; }
      };
      기록.만든것.push(s);
      return s;
    },
    removeSeries: function (s) { 기록.지운것.push(s); return true; }
  };

  win.LightweightCharts = {
    LineSeries: { __이름: "Line", __타입: "Line" },
    AreaSeries: { __이름: "Area", __타입: "Area" },
    BarSeries: { __이름: "Bar", __타입: "Bar" }
  };

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
 * [3] 넷뿐이다 — 하이킨아시·할로우는 일부러 뺐다
 * ========================================================================= */
절("[3] 고를 수 있는 것이 넷뿐이다 (바이낸스 Original 실측)");
{
  const t = 가짜차트창();
  const 종류 = t.M.TYPES.map((x) => x.k);
  ok("종류가 정확히 넷이다 (지금 " + 종류.length + "개)", 종류.length === 4, 종류.join(","));
  ok("캔들·라인·바·영역 그대로다",
    종류.slice().sort().join(",") === "area,bar,candle,line", 종류.join(","));

  /* 바이낸스 Original 에 없는 것은 넣지 않습니다 */
  ["heikin", "heikinashi", "hollow", "baseline", "histogram"].forEach(function (k) {
    ok("'" + k + "' 는 없다 (바이낸스 Original 에 없어서 일부러 뺐습니다)",
      종류.indexOf(k) === -1);
  });
  ok("모르는 종류를 넣으면 거절한다", t.M.setType("heikin") === false);
  ok("거절된 뒤에도 종류가 안 바뀐다", t.M.getType() !== "heikin", t.M.getType());

  ok("바이낸스를 어디서 쟀는지 적혀 있다 (주소·날짜·캡처)",
    SRC.indexOf("binance.com/en/futures/BTCUSDT") !== -1 &&
    SRC.indexOf("2026-08-28") !== -1 && SRC.indexOf("shots/ct5-bnf-charttype.png") !== -1);
  ok("하이킨아시·할로우를 왜 뺐는지 적혀 있다",
    SRC.indexOf("하이킨아시") !== -1 && SRC.indexOf("바이낸스 Original") !== -1);
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
  [{ type: "heikin" }, { type: 123 }, {}, null, "area"].forEach(function (나쁜값, i) {
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

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
