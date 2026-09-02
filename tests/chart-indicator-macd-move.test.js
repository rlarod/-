/* tests/chart-indicator-macd-move.test.js
 * =========================================================================
 * ★옛 MACD(12,26,9) 를 지표 틀로 옮긴 것★ 을 못 박는다  (12.8단계)
 * =========================================================================
 * 2026-09-03 · 차트팀
 *
 * ── 무엇을 옮겼나 ───────────────────────────────────────────────────────
 * js/chart-oscillators.js 가 그리던 MACD 를 js/chart-indicator-kit.js 의
 * 정의 "macd" + 인스턴스 "macd-12-26-9" 로 옮겼습니다. 회원이 이제 빠른·느린·
 * 신호선 기간 · 값 종류 · 색 · 굵기 · 선 모양을 고칩니다(옛 것은 전부 코드에
 * 박혀 있었습니다).
 *
 * ── ⚠️ 여기서 막으려는 사고 ────────────────────────────────────────────
 *   ① 값이 달라진다        옛 computeMACD 와 ★소수점 끝자리까지★ 같아야 합니다.
 *                          숫자를 손으로 옮겨 적지 않고 ★옛 파일을 실제로 실행★
 *                          해서 맞춥니다(옮겨 적으면 그 순간부터 두 벌).
 *   ② 막대가 선이 된다     MACD 는 이 틀에서 kind:"hist" 를 쓰는 ★첫 지표★ 입니다.
 *                          틀에 길만 있고 아무도 안 써 본 길이라, 진짜
 *                          HistogramSeries 로 만들어지는지 여기서 봅니다.
 *   ③ 막대가 선을 덮는다   그리는 순서가 막대 → MACD → 신호선 이어야 선이 위로
 *                          옵니다(옛 파일이 같은 이유로 막대를 먼저 만듭니다).
 *   ④ 통화를 안 따라간다   MACD 는 ★가격 차이★ 입니다. unit:"price" 가 빠지면
 *                          원화 회원 화면에 USDT 숫자가 뜹니다(ATR 과 같은 사고).
 *   ⑤ 0선이 사라진다      기준선 0 하나가 붙어 있어야 합니다(#1D273B 점선).
 *   ⑥ 눈금을 0~100 으로 고정한다  ★RSI 와 다릅니다.★ MACD 는 범위가 없습니다.
 *                          고정하면 선이 통째로 화면 밖으로 나갑니다.
 *   ⑦ 태생값이 없다       "기본값" 버튼이 12/26/9 · 옛 색 셋으로 안 돌아가면
 *                          2026-09-02 밤 P2 와 같은 사고가 다시 납니다.
 *   ⑧ 틱마다 전체를 다시 센다   step 이 마지막 봉 하나만 고쳐야 합니다.
 *
 * ⚠️ ★옮기는 동작★(옛 켜짐/꺼짐 이어받기 · 옛 칩/줄 자리)은
 *    tests/chart-indicator-rsi-move.test.js 가 옛 모듈을 띄운 채로 이미 봅니다
 *    (2026-09-03 12.8절에 그 파일의 MACD 줄을 새 사실로 고쳤습니다).
 *    여기서 또 가짜 DOM 을 한 벌 만들지 않습니다 — 같은 것 두 벌 금지.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 * tests/_order.txt 의 이 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { boot, REPO } = require("./_kit-harness.js");

const ESC = String.fromCharCode(27);
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + ESC + "[32m✓" + ESC + "[0m " + name);
  } else {
    fail++;
    console.log("  " + ESC + "[31m✗" + ESC + "[0m " + name + (detail ? " — " + detail : ""));
  }
}
function 절(t) {
  console.log("\n" + t);
}

/** 옛 js/chart-oscillators.js 를 그대로 실행해 computeMACD 를 꺼내 옵니다.
 *  ★값을 손으로 옮겨 적지 않습니다★ — 옮겨 적으면 그 순간부터 두 벌입니다. */
function 옛계산() {
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      head: { appendChild() {} },
      documentElement: { appendChild() {} },
      createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} })
    },
    setInterval: () => 0,
    clearInterval() {},
    performance: { now: () => 0 }
  };
  sandbox.window = sandbox;
  sandbox.App = {};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js/chart-oscillators.js"), "utf8"), sandbox, {
    filename: "js/chart-oscillators.js"
  });
  return sandbox.App.ChartOscillators;
}

function makeCandles(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = 77000 + Math.sin(i / 9) * 120 + (i % 7) * 13 + (i % 5) * 2.5;
    out.push({ time: 1700000000 + i * 60, open: c - 5, high: c + 9, low: c - 11, close: c, value: 3 + (i % 4) });
  }
  return out;
}

const candles = makeCandles(200);
const closes = candles.map((c) => c.close);
const times = candles.map((c) => c.time);

console.log("\n=== 옛 MACD 를 틀로 옮긴 것 (12.8단계) ===");

/* =======================================================================
 * [1] 값이 그대로인가 — 옛 computeMACD 와 소수점 끝자리까지
 * ===================================================================== */
절("[1] 값 — 옛 computeMACD 와 오차 0");
const 옛 = 옛계산();
ok("옛 모듈에서 computeMACD 를 꺼냈다", typeof 옛.computeMACD === "function");
ok("옛 기본값이 12 / 26 / 9 다", 옛.MACD_FAST === 12 && 옛.MACD_SLOW === 26 && 옛.MACD_SIGNAL === 9,
  [옛.MACD_FAST, 옛.MACD_SLOW, 옛.MACD_SIGNAL].join("/"));

const B = boot(candles);
const K = B.K;
const 정의 = K.listDefs().filter((d) => d.id === "macd")[0];
/* outputs 는 공개 목록(listDefs)에 없어서 시험용 창구로 봅니다 */
const 정의원본 = K.getDefsForTest().macd;
ok("틀에 macd 정의가 등록됐다", !!정의);

const id = K.createInstance("macd", {
  params: { fast: 12, slow: 26, sig: 9 },
  colors: { hist: "#838DA4", macd: "#E7ECF5", signal: "#F0B429" },
  on: true
});
const 그림 = B.그린값(id) || {};
const 옛값 = 옛.computeMACD(closes, times, 12, 26, 9, {});

function 최대오차(새, 옛것) {
  if (!새 || !옛것 || 새.length !== 옛것.length) return Infinity;
  let m = 0;
  for (let i = 0; i < 새.length; i++) {
    if (새[i].time !== 옛것[i].time) return Infinity;
    m = Math.max(m, Math.abs(새[i].value - 옛것[i].value));
  }
  return m;
}

["macd", "signal", "hist"].forEach((k) => {
  ok("★" + k + " 가 옛것과 점 개수도 값도 오차 0★ (" + (그림[k] || []).length + "점)",
    최대오차(그림[k], 옛값[k]) === 0,
    "새 " + (그림[k] || []).length + "점 / 옛 " + (옛값[k] || []).length + "점 · 오차 " +
    최대오차(그림[k], 옛값[k]));
});
ok("(근거) 헛돌지 않았다 — 실제로 점이 100개 넘게 그려졌다", (그림.macd || []).length > 100,
  String((그림.macd || []).length));

/* 신호선은 처음 9개 MACD 값의 단순평균으로 시작하므로 8점 늦게 시작합니다 */
ok("신호선은 MACD 보다 8점 늦게 시작한다 (신호선 9)",
  옛값.macd.length - 옛값.signal.length === 8 && 그림.macd.length - 그림.signal.length === 8,
  그림.macd.length + " / " + 그림.signal.length);

/* =======================================================================
 * [2] ★막대(hist)★ — 이 틀에서 처음 쓰는 길
 * ===================================================================== */
절("[2] 막대 — 진짜 HistogramSeries 인가 (틀의 첫 hist 사용자)");
{
  const it = K.getInstancesForTest()[id];
  const 종류 = {};
  Object.keys(it.live.series).forEach((k) => (종류[k] = it.live.series[k].seriesType()));
  ok("★hist 는 HistogramSeries 로 만들어졌다★", 종류.hist === "Histogram", JSON.stringify(종류));
  ok("macd · signal 은 LineSeries 다", 종류.macd === "Line" && 종류.signal === "Line", JSON.stringify(종류));

  ok('정의가 hist 를 kind:"hist" 로 적었다',
    정의원본.outputs.filter((o) => o.kind === "hist").map((o) => o.key).join(",") === "hist",
    JSON.stringify(정의원본.outputs.map((o) => o.key + ":" + o.kind)));

  /* ③ 그리는 순서 — 막대가 먼저여야 선이 그 위에 옵니다 */
  ok("★그리는 순서가 막대 → MACD → 신호선 이다★ (선이 막대 위로)",
    정의원본.outputs.map((o) => o.key).join(",") === "hist,macd,signal",
    정의원본.outputs.map((o) => o.key).join(","));
  ok("실제로 만들어진 순서도 같다",
    Object.keys(it.live.series).join(",") === "hist,macd,signal",
    Object.keys(it.live.series).join(","));

  /* 막대에는 굵기·선모양을 안 겁니다(뜻이 없습니다) */
  const ho = it.live.series.hist.options();
  ok("막대에는 lineWidth · lineStyle 을 안 건다", ho.lineWidth === undefined && ho.lineStyle === undefined,
    JSON.stringify({ w: ho.lineWidth, s: ho.lineStyle }));
}

/* =======================================================================
 * [3] 색 · 굵기 · 0선 — 회원이 보던 그대로
 * ===================================================================== */
절("[3] 색 · 굵기 · 기준선 (옛 화면 그대로)");
{
  const it = K.getInstancesForTest()[id];
  ok("MACD 선 색이 옛 COLORS.macd 다 (#E7ECF5)", it.live.series.macd.options().color === 옛.COLORS.macd,
    it.live.series.macd.options().color + " vs " + 옛.COLORS.macd);
  ok("신호선 색이 옛 COLORS.signal 이다 (#F0B429)", it.live.series.signal.options().color === 옛.COLORS.signal,
    it.live.series.signal.options().color + " vs " + 옛.COLORS.signal);
  ok("막대 색이 옛 COLORS.hist 다 (#838DA4)", it.live.series.hist.options().color === 옛.COLORS.hist,
    it.live.series.hist.options().color + " vs " + 옛.COLORS.hist);
  ok("굵기 1 · 실선 그대로다", it.live.series.macd.options().lineWidth === 1,
    String(it.live.series.macd.options().lineWidth));

  ok("★0선(기준선)이 하나 붙어 있다★", 정의.guides.length === 1 && 정의.guides[0].price === 0,
    JSON.stringify(정의.guides));
  ok("0선은 점선이다 (옛 addGuide 와 같음)", 정의.guides[0].style === "dashed", 정의.guides[0].style);
  ok("실제로 화면에 기준선이 1개 생겼다", B.남은기준선() >= 1, String(B.남은기준선()));
  const 선옵션 = it.live.series.hist._lines[0] && it.live.series.hist._lines[0].opts;
  ok("기준선 색이 #1D273B · 굵기 1 · 축 라벨 없음",
    !!선옵션 && 선옵션.color === "#1D273B" && 선옵션.lineWidth === 1 && 선옵션.axisLabelVisible === false,
    JSON.stringify(선옵션));
}

/* =======================================================================
 * [4] ⭐ 통화 — MACD 는 가격 차이라 표시 통화를 따라간다
 * ===================================================================== */
절('[4] 통화 — unit:"price" (ATR 과 같은 사고 막기)');
{
  ok('★정의에 unit:"price" 가 붙어 있다★', 정의.unit === "price", String(정의.unit));
  const it = K.getInstancesForTest()[id];
  ["hist", "macd", "signal"].forEach((k) => {
    const pf = it.live.series[k].options().priceFormat;
    ok(k + " 눈금 글자가 통화를 따라간다 (priceFormat 이 걸려 있다)",
      !!pf && pf.type === "custom" && typeof pf.formatter === "function",
      JSON.stringify(pf && { t: pf.type, m: pf.minMove }));
  });
}

/* =======================================================================
 * [5] ⭐ 눈금 — ★고정하지 않는다★ (RSI 와 다름)
 * ===================================================================== */
절("[5] 눈금 — 범위는 안 고정하고 여백만 0.15");
{
  ok("★scale.min · max 를 안 걸었다★ (걸면 선이 화면 밖으로)",
    정의.scale && 정의.scale.min === null && 정의.scale.max === null, JSON.stringify(정의.scale));
  ok("위·아래 여백은 옛 것과 같은 0.15 다",
    정의.scale && 정의.scale.top === 0.15 && 정의.scale.bottom === 0.15, JSON.stringify(정의.scale));
  const it = K.getInstancesForTest()[id];
  ok("눈금 고정 함수(autoscaleInfoProvider)를 안 걸었다",
    it.live.series.macd.options().autoscaleInfoProvider === undefined,
    String(typeof it.live.series.macd.options().autoscaleInfoProvider));
  const rsi = K.listDefs().filter((d) => d.id === "rsi")[0];
  ok("(대조) RSI 는 0~100 으로 고정돼 있다 — 둘이 다른 것이 맞다",
    !!rsi && rsi.scale && rsi.scale.min === 0 && rsi.scale.max === 100, JSON.stringify(rsi && rsi.scale));
  ok("아래 칸(sub)에 그린다", 정의.pane === "sub", 정의.pane);
}

/* =======================================================================
 * [6] ⭐ 틱 — 마지막 봉 하나만 고친다 (전체를 다시 안 센다)
 * ===================================================================== */
절("[6] 실시간 — 마지막 봉 하나만");
{
  const 전 = B.그린값(id);
  const 전길이 = { hist: 전.hist.length, macd: 전.macd.length, signal: 전.signal.length };
  const 전끝 = 전.macd[전.macd.length - 1].value;
  const 마지막 = candles[candles.length - 1];
  B.틱({
    time: 마지막.time, open: 마지막.open, high: 마지막.high + 40,
    low: 마지막.low, close: 마지막.close + 33, volume: 5
  });
  const 후 = B.그린값(id);
  ok("점 개수가 안 늘었다 (같은 봉이니 자리만 고쳐야 합니다)",
    후.macd.length === 전길이.macd && 후.hist.length === 전길이.hist && 후.signal.length === 전길이.signal,
    JSON.stringify({ 전: 전길이, 후: { hist: 후.hist.length, macd: 후.macd.length, signal: 후.signal.length } }));
  ok("마지막 점의 값이 실제로 바뀌었다 (안 바뀌면 검사가 헛돕니다)",
    후.macd[후.macd.length - 1].value !== 전끝,
    전끝 + " -> " + 후.macd[후.macd.length - 1].value);

  /* ★옛 것과 같은 값인가★ — 종가를 바꾼 뒤 옛 computeMACD 를 통째로 다시 돌려 비교 */
  const 옛종가 = closes.slice();
  옛종가[옛종가.length - 1] = 마지막.close + 33;
  const 옛갱신 = 옛.computeMACD(옛종가, times, 12, 26, 9, {});
  const 끝오차 = Math.max(
    Math.abs(후.macd[후.macd.length - 1].value - 옛갱신.macd[옛갱신.macd.length - 1].value),
    Math.abs(후.signal[후.signal.length - 1].value - 옛갱신.signal[옛갱신.signal.length - 1].value),
    Math.abs(후.hist[후.hist.length - 1].value - 옛갱신.hist[옛갱신.hist.length - 1].value)
  );
  ok("★틱 한 번 뒤의 값도 옛것과 오차 0★ (세 줄 전부)", 끝오차 === 0, "오차 " + 끝오차);

  /* 새 봉이 하나 생기면 점이 하나 늘어야 합니다 */
  const 새시각 = 마지막.time + 60;
  B.틱({
    time: 새시각, open: 마지막.close, high: 마지막.close + 20,
    low: 마지막.close - 20, close: 마지막.close + 12, volume: 5
  });
  const 후2 = B.그린값(id);
  ok("새 봉이 오면 점이 하나 는다", 후2.macd.length === 전길이.macd + 1,
    전길이.macd + " -> " + 후2.macd.length);
}

/* =======================================================================
 * [7] ⭐ 태생값 — "기본값" 을 눌러도 회원이 처음 본 모습으로
 * ===================================================================== */
절("[7] 태생값 — 기본값 버튼이 12/26/9 · 옛 색 셋으로 돌아간다");
{
  const B2 = boot(candles);
  const K2 = B2.K;
  /* 옮기기가 만드는 것과 ★같은 이름·같은 값★ 으로 만듭니다(MOVED_MACD) */
  const M = K2.MOVED_MACD;
  ok("MOVED_MACD 가 밖으로 나와 있다 (값이 한 곳에만)", !!M && M.id === "macd-12-26-9", JSON.stringify(M));
  ok("MOVED_MACD 의 기간이 12/26/9 다", M.fast === 12 && M.slow === 26 && M.sig === 9);
  ok("MOVED_MACD 의 색이 옛 COLORS 와 같다",
    M.colors.hist === 옛.COLORS.hist && M.colors.macd === 옛.COLORS.macd && M.colors.signal === 옛.COLORS.signal,
    JSON.stringify(M.colors));
  ok('옛 이름 "macd" 는 못 쓰게 막혀 있다 (RESERVED_IDS)', K2.RESERVED_IDS.indexOf("macd") >= 0,
    K2.RESERVED_IDS.join(","));

  const mid = K2.createInstance("macd", {
    id: M.id,
    params: { fast: M.fast, slow: M.slow, sig: M.sig },
    colors: { hist: M.colors.hist, macd: M.colors.macd, signal: M.colors.signal },
    style: "solid",
    on: true
  });
  ok("옮기기가 쓰는 이름 그대로 만들어졌다", mid === M.id, String(mid));
  K2.updateInstance(M.id, { params: { fast: 5, slow: 40, sig: 3 }, colors: { macd: "#49C9E9" } });
  const 바뀜 = K2.getInstancesForTest()[M.id];
  ok("회원이 바꾸면 실제로 바뀐다 (안 바뀌면 아래 검사가 헛돕니다)",
    바뀜.params.fast === 5 && 바뀜.colors.macd === "#49C9E9",
    JSON.stringify({ p: 바뀜.params, c: 바뀜.colors }));
  K2.resetInstance(M.id);
  const 돌아옴 = K2.getInstancesForTest()[M.id];
  ok("★기본값을 누르면 12/26/9 · 옛 색 셋으로 돌아간다★",
    돌아옴.params.fast === 12 && 돌아옴.params.slow === 26 && 돌아옴.params.sig === 9 &&
    돌아옴.colors.hist === 옛.COLORS.hist && 돌아옴.colors.macd === 옛.COLORS.macd &&
    돌아옴.colors.signal === 옛.COLORS.signal,
    JSON.stringify({ p: 돌아옴.params, c: 돌아옴.colors }));
}

/* =======================================================================
 * [8] 이름 · 설정 칸 — 회원이 무엇을 고칠 수 있나
 * ===================================================================== */
절("[8] 이름 · 설정 칸");
{
  const it = K.getInstancesForTest()[id];
  const 이름 = K.listInstances().filter((x) => x.id === id)[0].name;
  ok("이름이 MACD(12,26,9) 다", 이름 === "MACD(12,26,9)", 이름);
  const 칸 = K.inputsOf("macd").map((i) => i.key);
  ok("설정 칸에 빠른·느린·신호선 기간과 값 종류가 있다",
    ["fast", "slow", "sig", "src"].every((k) => 칸.indexOf(k) >= 0), 칸.join(" "));
  ok("기본 값 종류는 종가다", it.params.src === "close", String(it.params.src));
}

/* =======================================================================
 * [9] ⚠️ 기본 인스턴스에는 안 넣었다 (색 겹침 때문 — RSI 와 같은 이유)
 * ===================================================================== */
절("[9] 처음 오는 회원의 기본 줄에는 없다");
{
  const B3 = boot(candles);
  const 기본 = B3.K.listInstances().map((x) => x.id);
  ok("기본 줄에 macd-12-26-9 가 없다 (옮기기가 만들어 끼웁니다)", 기본.indexOf("macd-12-26-9") < 0,
    기본.join(" "));
  ok("기본 줄에 rsi-14 도 없다 (12.7절과 같은 이유)", 기본.indexOf("rsi-14") < 0, 기본.join(" "));
  ok("(근거) 기본 줄 자체는 그대로 6줄이다", 기본.length === 6, 기본.join(" "));
}

/* =======================================================================
 * [10] 돌연변이 — 위 검사가 진짜로 무는지
 * ===================================================================== */
절("[10] 돌연변이 — 규칙을 어기면 실제로 걸리는가");
{
  /* unit 을 뗀 정의를 등록하면 [4] 가 쓰는 priceFormat 이 안 걸립니다 */
  const B4 = boot(candles);
  const 등록됨 = B4.K.define({
    id: "mut-macd-nounit",
    name: "MUT",
    pane: "sub",
    params: {},
    outputs: [{ key: "v", kind: "hist", color: "#B99264" }],
    seed: (bs) => ({ v: bs.time.map((t, i) => ({ time: t, value: bs.close[i] - 77000 })) }),
    step: (st, bar) => ({ values: { v: bar.close - 77000 }, state: st || {} })
  });
  ok("unit 없는 시험용 정의를 등록했다", 등록됨 === true);
  const mid2 = B4.K.createInstance("mut-macd-nounit", { on: true });
  const it2 = B4.K.getInstancesForTest()[mid2];
  ok("★unit 을 안 붙이면 priceFormat 이 안 걸린다★ — [4] 가 진짜로 뭅니다",
    it2.live.series.v.options().priceFormat === undefined,
    String(typeof it2.live.series.v.options().priceFormat));
  ok("(같은 정의라도) hist 는 그래도 HistogramSeries 다",
    it2.live.series.v.seriesType() === "Histogram", it2.live.series.v.seriesType());

  /* 색 목록 밖의 색은 틀이 거부합니다 */
  const 거부 = B4.K.define({
    id: "mut-macd-badcolor",
    name: "MUT2",
    pane: "sub",
    params: {},
    outputs: [{ key: "v", kind: "hist", color: "#FF0000" }],
    seed: () => ({ v: [] }),
    step: (st) => ({ values: { v: 1 }, state: st || {} })
  });
  ok("지표선 색 목록 밖의 색은 거부된다 (막대도 같은 검사)", 거부 === false, String(거부));
}

/* =======================================================================
 * [11] 등록 · 되돌리기
 * ===================================================================== */
절("[11] 등록 · 되돌리기");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", order.indexOf("chart-indicator-macd-move.test.js") >= 0);
  const me = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다", me.indexOf("되돌리는 방법") >= 0);
  const kit = fs.readFileSync(path.join(REPO, "js/chart-indicator-kit.js"), "utf8");
  ok("틀에 restoreLegacyMACD 되돌리기가 있다", kit.indexOf("restoreLegacyMACD") >= 0);
  ok("틀이 그 되돌리기를 밖으로 내준다", typeof K.restoreLegacyMACD === "function");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
process.exit(fail === 0 ? 0 : 1);
