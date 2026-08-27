/* tests/chart-symbol-switch-seal.test.js
 * =========================================================================
 * 종목이 바뀌면 이전 종목 값이 한 톨도 안 남는다 — 봉인
 * =========================================================================
 * 2026-08-28 — 본부장 배정 / 기록팀 봉인 (그전까지 봉인 0건)
 *
 * ── 왜 봉인이 급했나 ───────────────────────────────────────────────────
 *   js/chart-symbol-switch.js 는 316줄인데 봉인이 0건이었습니다.
 *   2026-08-27 하루에 이 구간으로 커밋이 4개 몰렸습니다(종목 전환 4번 관문).
 *   **가장 많이 흔들린 자리에 그물이 하나도 없던 상태입니다.**
 *
 * ── 무엇을 막는 코드인가 (2026-08-27 실측, 모듈 주석에서 그대로 옮김) ──
 *   종목마다 가격대가 크게 다릅니다.
 *       BTCUSDT     78,864 달러
 *       SAMSUNGUSDT    194 달러   → 406배
 *       QQQUSDT        717 달러   → 110배
 *
 *   실제로 재현된 고장 (shots/sym4/before-1440-mixed.png):
 *     과거 봉을 더 받는 중에 종목을 바꿨더니, 3.2초 뒤 도착한 옛 종목 응답이
 *     js/chart.js:369 `allCandles = filtered.concat(allCandles)` 로 붙어서
 *     **BTC 500봉 + 삼성전자 500봉이 한 차트에** 들어갔습니다.
 *     캔들 1000개, 값 범위 187.5 ~ 79,299.8. 가격축이 125,000 까지 늘어나
 *     삼성전자 봉은 바닥의 가는 선 한 줄이 됐습니다.
 *     8.9초 뒤에도 그대로였고 **콘솔 오류는 0건**이었습니다(조용한 고장).
 *
 * ── 여기서 못 박는 것 ─────────────────────────────────────────────────
 *   [3] 감싸기 — App.Api.fetchKlines 를 한 번만 감싼다 (js/api.js 무수정)
 *   [4] 최초 로딩 응답이 철 지났으면 **거절이 아니라 조용히 버린다**
 *       ⚠ 거절하면 js/chart.js:315 catch 가 화면을 "과거 캔들 조회 실패" 로
 *         바꿉니다. 멀쩡한데 빨간 문구가 뜹니다. 여기가 제일 되돌아가기 쉽습니다
 *   [5] 이어붙이기는 **요청조차 안 보낸다** (빗장이 잠겼을 때)
 *   [6] 이어붙이기 응답이 철 지났으면 **거절한다**
 *       ⚠ 여긴 반대입니다. 거절해야 isLoadingMore 빗장이 풀립니다
 *   [7] 종목이 바뀌면 캔들만이 아니라 **모든 시리즈**를 비운다
 *       ⚠ 실측 — 캔들만 비웠더니 MA·볼린저가 남아 축이 142,242 ~ -108,934
 *         그대로였습니다. 캔들만 비우는 것은 아무 소용이 없습니다
 *   [8] 봉 간격 변경 때는 **비우지 않는다** (종목이 그대로면 지표도 그대로)
 *   [9] 시세 틱마다 하는 일이 0 — price:update 를 구독하지 않는다
 *   [10] 아직 종목 전환을 "열지" 않는다 — symbol:change 를 쏘지 않는다
 *
 * ⚠ 가짜 차트·가짜 Api 만 씁니다. 서버에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = path.join(REPO, "js/chart-symbol-switch.js");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* -------------------------------------------------------------------------
 * 가짜 차트 — 라이브러리 공개 API 모양(panes()[n].getSeries())만 흉내
 * -------------------------------------------------------------------------
 * 지표까지 넣습니다. 캔들만 넣으면 "캔들만 비워도 통과" 하는 헐거운 테스트가
 * 됩니다 — 실제로 그게 2026-08-27 에 재현된 고장이었습니다.
 * ----------------------------------------------------------------------- */
function 시리즈(이름, 개수, 값) {
  let d = [];
  for (let i = 0; i < 개수; i++) d.push({ time: i, value: 값 === undefined ? 100 : 값 });
  return {
    __이름: 이름,
    data: () => d,
    setData: (x) => { d = x; },
  };
}

function 가짜차트() {
  /* BTC 값이 들어 있는 상태를 흉내 냅니다 — 78,864 달러대 */
  const s = {
    캔들: 시리즈("캔들", 500, 78864),
    거래량: 시리즈("거래량", 500, 1200),
    MA20: 시리즈("MA20", 500, 78700),
    볼린저상: 시리즈("볼린저상", 500, 79299.8),
    볼린저하: 시리즈("볼린저하", 500, 77500),
    RSI: 시리즈("RSI", 500, 55),
    MACD: 시리즈("MACD", 500, 12),
    MACD시그널: 시리즈("MACD시그널", 500, 10),
  };
  const chart = {
    panes: () => [
      { getSeries: () => [s.캔들, s.거래량, s.MA20, s.볼린저상, s.볼린저하] },
      { getSeries: () => [s.RSI] },
      { getSeries: () => [s.MACD, s.MACD시그널] },
    ],
  };
  return { chart, s };
}

/* -------------------------------------------------------------------------
 * 모듈 띄우기
 * -------------------------------------------------------------------------
 * ⚠ 이 파일은 eval 되는 순간 boot() 이 돌면서 App.Api / App.Bus 를 잡습니다.
 *   그래서 **eval 전에** 둘을 먼저 심어야 합니다. 안 그러면 50ms 짜리
 *   setInterval 이 10초 동안 남아 프로세스가 안 끝납니다.
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  const 구독 = [];
  const 호출 = [];        /* orig fetchKlines 가 실제로 불린 인자들 */
  let 활성 = opts.활성종목 || "BTCUSDT";

  const { chart, s } = 가짜차트();

  const 응답 = opts.응답 || {};   /* symbol -> {rows} | {err} */

  win.App = {
    Bus: {
      on(e, f) { 구독.push([e, f]); return f; },
      off() {},
      emit(e, p) { 구독.filter((c) => c[0] === e).forEach((c) => c[1](p)); },
    },
    Config: { getActiveSymbol: () => 활성 },
    ChartFont: { getCharts: () => (opts.차트없음 ? [] : [chart]) },
    Api: {
      fetchKlines: function (symbol, interval, limit, endTime) {
        호출.push({ symbol, interval, limit, endTime, 인자수: arguments.length });
        const r = 응답[symbol];
        if (r && r.err) return Promise.reject(r.err);
        if (r && r.느림) return new Promise((res) => { r.풀기 = () => res(r.rows || []); });
        return Promise.resolve((r && r.rows) || [{ t: 1 }]);
      },
    },
  };
  const 원본fetch = win.App.Api.fetchKlines;

  win.eval(fs.readFileSync(SRC, "utf8"));

  return {
    win, dom, 구독, 호출, chart, s, 응답, 원본fetch,
    App: win.App,
    모듈: win.App.ChartSymbolSwitch,
    종목바꾸기: (sym) => { 활성 = sym; },
    활성: () => 활성,
    남은점: () => win.App.ChartSymbolSwitch.countPoints(),
    닫기: () => { try { win.close(); } catch (e) { /* noop */ } },
  };
}

/* 약속이 "영원히 안 끝나는" 상태인지 재는 도구.
   ⚠ 시간에 여유를 둡니다 — 전체를 한꺼번에 돌릴 때 짧게 잡으면 가끔 틀립니다. */
function 결말(p, ms) {
  return Promise.race([
    p.then((v) => ({ 상태: "성공", 값: v }), (e) => ({ 상태: "거절", 값: e })),
    new Promise((res) => setTimeout(() => res({ 상태: "안끝남" }), ms || 300)),
  ]);
}

(async function 본체() {

/* =========================================================================
 * [1] 파일 · 주석 · 배선
 * ========================================================================= */
절("[1] 파일 · 실측 주석 · 배선");
{
  ok("js/chart-symbol-switch.js 가 있다", fs.existsSync(SRC));
  const src = fs.readFileSync(SRC, "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

  ok("index.html 이 이 파일을 부른다", html.indexOf('src="js/chart-symbol-switch.js"') >= 0);
  ok("주석에 종목별 가격 실측(78,864 / 194 / 717)이 남아 있다",
    src.indexOf("78,864") >= 0 && src.indexOf("194") >= 0 && src.indexOf("717") >= 0,
    "왜 비워야 하는지 숫자가 없으면 다음 사람이 '굳이 필요한가' 로 지웁니다");
  ok("주석에 재현된 고장(187.5 ~ 79,299.8 · 캔들 1000개)이 남아 있다",
    src.indexOf("79,299.8") >= 0 && src.indexOf("1000") >= 0);
  ok("주석에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(src));
  ok("js/chart.js · js/api.js 를 직접 고치지 않는다고 적혀 있다",
    /js\/api\.js 는 안 고칩니다|chart\.js 는 수정 금지/.test(src));
}

/* =========================================================================
 * [2] 시세 틱마다 하는 일이 0 이다
 * ========================================================================= */
절("[2] 구독 — symbol:change · interval:change 딱 둘뿐");
{
  const t = 띄우기();
  const 이름들 = t.구독.map((c) => c[0]).sort();
  ok("구독이 정확히 2개다 (" + 이름들.length + "개)", 이름들.length === 2, JSON.stringify(이름들));
  ok("구독 목록이 interval:change · symbol:change 다",
    이름들.join(",") === "interval:change,symbol:change", JSON.stringify(이름들));
  ok("price:update 를 구독하지 않는다 (초당 수십 번 오는 경로에 안 끼어든다)",
    이름들.indexOf("price:update") < 0);

  t.모듈.init(); t.모듈.init();
  ok("init() 을 여러 번 불러도 구독이 늘지 않는다 (" + t.구독.length + "개)", t.구독.length === 2,
    "두 벌이 되면 종목 전환 때 두 번 비우고 통계가 두 배로 셉니다");
  t.닫기();
}

/* =========================================================================
 * [3] 감싸기 — 한 번만, 표시를 남기고
 * ========================================================================= */
절("[3] App.Api.fetchKlines 감싸기");
{
  const t = 띄우기();
  ok("파일이 실리는 것만으로 이미 감싸져 있다 (init 전)",
    t.App.Api.fetchKlines !== t.원본fetch,
    "index.html 이 부르기만 하면 걸려야 합니다 — main.js 순서에 기대면 늦습니다");
  ok("감쌌다는 표시(__symbolSwitchWrapped)가 붙어 있다",
    t.App.Api.fetchKlines.__symbolSwitchWrapped === true);

  const 한겹 = t.App.Api.fetchKlines;
  t.모듈.init(); t.모듈.init(); t.모듈.init();
  ok("init() 을 세 번 더 불러도 두 겹으로 감싸지 않는다", t.App.Api.fetchKlines === 한겹,
    "두 겹이면 요청 하나에 검사가 두 번 돌고 통계가 두 배로 셉니다");
  t.닫기();
}

/* =========================================================================
 * [4] ⭐ 최초 로딩 — 철 지난 응답은 "거절" 이 아니라 "조용히 버림"
 * -------------------------------------------------------------------------
 * 여기가 이 파일에서 가장 되돌아가기 쉬운 자리입니다.
 * 거절하면 js/chart.js:315 catch 가 화면 상태를 "과거 캔들 조회 실패" 로
 * 바꿉니다. 실제로는 아무 문제도 없는데 회원에게 빨간 문구가 뜹니다.
 * ========================================================================= */
절("[4] ⭐ 최초 로딩(인자 3개)");
{
  /* 정상 — 그대로 통과하고 이어붙이기 빗장이 풀린다 */
  const t = 띄우기({ 활성종목: "BTCUSDT", 응답: { BTCUSDT: { rows: [{ t: 1 }, { t: 2 }] } } });
  const r = await 결말(t.App.Api.fetchKlines("BTCUSDT", "1m", 500));
  ok("종목이 그대로면 응답을 그대로 넘긴다", r.상태 === "성공" && r.값.length === 2, JSON.stringify(r));
  ok("최초 로딩이 성공하면 그 종목이 loadedSymbol 이 된다",
    t.모듈.getLoadedSymbol() === "BTCUSDT", String(t.모듈.getLoadedSymbol()));
  t.닫기();

  /* 철 지남 — 응답이 돌아오는 사이 종목이 바뀜 */
  const t2 = 띄우기({ 활성종목: "BTCUSDT", 응답: { BTCUSDT: { 느림: true, rows: [{ t: 1 }] } } });
  const p = t2.App.Api.fetchKlines("BTCUSDT", "1m", 500);
  t2.종목바꾸기("SAMSUNGUSDT");                 /* 3.2초 사이에 바뀐 상황 */
  t2.응답.BTCUSDT.풀기();                        /* 이제 옛 종목 응답 도착 */
  const r2 = await 결말(p, 400);
  ok("종목이 바뀐 뒤 도착한 응답은 거절하지 않는다", r2.상태 !== "거절",
    "거절하면 화면이 '과거 캔들 조회 실패' 로 바뀝니다. 실제 상태: " + r2.상태);
  ok("⭐ 영원히 안 끝나는 약속으로 조용히 버린다", r2.상태 === "안끝남", "실제: " + r2.상태);
  ok("성공으로 통과시키지도 않는다 (옛 종목 봉이 들어가면 안 됨)", r2.상태 !== "성공");
  ok("버린 횟수가 1 로 센다", t2.모듈.getStats().droppedFull === 1,
    JSON.stringify(t2.모듈.getStats()));
  ok("버렸으면 loadedSymbol 을 옛 종목으로 세우지 않는다",
    t2.모듈.getLoadedSymbol() !== "BTCUSDT", String(t2.모듈.getLoadedSymbol()));
  t2.닫기();

  /* 실패 — 에러를 삼키지 않고 그대로 전달한다 */
  const 에러 = new Error("서버 500");
  const t3 = 띄우기({ 활성종목: "BTCUSDT", 응답: { BTCUSDT: { err: 에러 } } });
  const r3 = await 결말(t3.App.Api.fetchKlines("BTCUSDT", "1m", 500));
  ok("최초 로딩이 실패하면 에러를 그대로 넘긴다 (삼키지 않는다)",
    r3.상태 === "거절" && r3.값 === 에러, JSON.stringify(r3.상태));
  ok("실패했으면 이어붙이기 빗장을 계속 잠가 둔다 (loadedSymbol = null)",
    t3.모듈.getLoadedSymbol() === null, String(t3.모듈.getLoadedSymbol()));
  t3.닫기();
}

/* =========================================================================
 * [5] ⭐ 이어붙이기 — 빗장이 잠겼으면 요청조차 안 보낸다
 * ========================================================================= */
절("[5] ⭐ 이어붙이기(인자 4개) — 빗장");
{
  const t = 띄우기({ 활성종목: "BTCUSDT" });
  const 전 = t.호출.length;
  const r = await 결말(t.App.Api.fetchKlines("BTCUSDT", "1m", 500, 1730000000000));
  ok("최초 로딩 전에는 거절한다", r.상태 === "거절", "실제: " + r.상태);
  ok("거절 이유에 표시(STALE_MARK)가 붙는다",
    r.상태 === "거절" && String(r.값.message).indexOf(t.모듈.STALE_MARK) === 0,
    r.상태 === "거절" ? r.값.message : "");
  ok("⭐ 서버로 요청을 아예 보내지 않는다", t.호출.length === 전,
    "보낸 요청 " + (t.호출.length - 전) + "건 — 보내면 헛돈이고 응답이 늦게 끼어들 틈이 생깁니다");
  ok("차단 횟수가 1 로 센다", t.모듈.getStats().blockedMore === 1, JSON.stringify(t.모듈.getStats()));
  t.닫기();

  /* 최초 로딩이 끝난 뒤에는 통과 */
  const t2 = 띄우기({ 활성종목: "BTCUSDT" });
  await t2.App.Api.fetchKlines("BTCUSDT", "1m", 500);
  const 전2 = t2.호출.length;
  const r2 = await 결말(t2.App.Api.fetchKlines("BTCUSDT", "1m", 500, 1730000000000));
  ok("최초 로딩이 끝난 뒤 같은 종목이면 통과한다", r2.상태 === "성공", "실제: " + r2.상태);
  ok("그때는 요청을 실제로 보낸다", t2.호출.length === 전2 + 1, "보낸 요청 " + (t2.호출.length - 전2) + "건");
  t2.닫기();

  /* 다른 종목의 이어붙이기는 막는다 */
  const t3 = 띄우기({ 활성종목: "BTCUSDT" });
  await t3.App.Api.fetchKlines("BTCUSDT", "1m", 500);
  const 전3 = t3.호출.length;
  const r3 = await 결말(t3.App.Api.fetchKlines("SAMSUNGUSDT", "1m", 500, 1730000000000));
  ok("다른 종목(SAMSUNGUSDT)의 이어붙이기는 거절한다", r3.상태 === "거절", "실제: " + r3.상태);
  ok("그 요청도 서버로 안 보낸다", t3.호출.length === 전3);
  t3.닫기();
}

/* =========================================================================
 * [6] ⭐ 이어붙이기 응답이 철 지났으면 — 여긴 반대로 "거절" 해야 한다
 * -------------------------------------------------------------------------
 * js/chart.js:372 catch 가 isLoadingMore=false 로 되돌립니다.
 * 거절하지 않고 매달아 두면 그 빗장이 영원히 잠겨서
 * **다시는 과거 봉을 못 받습니다**(오류도 안 나는 조용한 고장).
 * ========================================================================= */
절("[6] ⭐ 이어붙이기 응답이 철 지나면 거절한다 (빗장을 풀어주려고)");
{
  const t = 띄우기({ 활성종목: "BTCUSDT", 응답: { BTCUSDT: { rows: [{ t: 1 }] } } });
  await t.App.Api.fetchKlines("BTCUSDT", "1m", 500);      /* 빗장 풀림 */

  t.응답.BTCUSDT = { 느림: true, rows: [{ t: 9 }] };
  const p = t.App.Api.fetchKlines("BTCUSDT", "1m", 500, 1730000000000);
  t.종목바꾸기("QQQUSDT");                                 /* 돌아오는 사이 종목 바뀜 */
  t.응답.BTCUSDT.풀기();
  const r = await 결말(p, 400);

  ok("⭐ 거절한다 (매달아 두지 않는다)", r.상태 === "거절",
    "실제: " + r.상태 + " — 매달아 두면 isLoadingMore 가 영영 안 풀려 과거 봉을 다시는 못 받습니다");
  ok("성공으로 통과시키지 않는다 (옛 종목 봉이 앞에 붙으면 안 됨)", r.상태 !== "성공");
  ok("거절 이유에 표시(STALE_MARK)가 붙는다",
    r.상태 === "거절" && String(r.값.message).indexOf(t.모듈.STALE_MARK) === 0,
    r.상태 === "거절" ? r.값.message : "");
  ok("staleMore 가 1 로 센다", t.모듈.getStats().staleMore === 1, JSON.stringify(t.모듈.getStats()));
  t.닫기();
}

/* =========================================================================
 * [7] ⭐ 종목이 바뀌면 모든 시리즈를 비운다
 * -------------------------------------------------------------------------
 * 실측 — 캔들만 비웠더니 MA·볼린저가 남아 가격축이 142,242 ~ -108,934 로
 * 그대로였습니다. **캔들만 비우는 것은 아무 소용이 없습니다.**
 * ========================================================================= */
절("[7] ⭐ symbol:change → 캔들·거래량·MA·볼린저·RSI·MACD 전부 비운다");
{
  const t = 띄우기({ 활성종목: "BTCUSDT" });
  ok("준비 — 비우기 전 점이 4000개 있다", t.남은점() === 4000, "실제 " + t.남은점() + "개");

  t.App.Bus.emit("symbol:change", { symbol: "SAMSUNGUSDT" });

  ok("⭐ 비운 뒤 차트에 남은 점이 0 이다", t.남은점() === 0, "실제 " + t.남은점() + "개");
  const 이름들 = Object.keys(t.s);
  const 남은것 = 이름들.filter((k) => t.s[k].data().length > 0);
  ok("시리즈 8개(캔들·거래량·MA20·볼린저상/하·RSI·MACD·시그널)가 전부 비었다",
    남은것.length === 0, "아직 남은 것: " + 남은것.join(", ") +
    " — 하나만 남아도 가격축이 옛 종목 값까지 늘어나 새 캔들이 바닥 선으로 뭉개집니다");
  ok("캔들 말고 지표도 비웠다 (MA20 · 볼린저상)",
    t.s.MA20.data().length === 0 && t.s.볼린저상.data().length === 0);
  ok("보조 창(RSI · MACD)도 비웠다",
    t.s.RSI.data().length === 0 && t.s.MACD.data().length === 0);

  const st = t.모듈.getStats();
  ok("비운 시리즈 개수를 8 로 센다", st.lastClearedSeries === 8, JSON.stringify(st));
  ok("바뀐 종목을 기록한다 (SAMSUNGUSDT)", st.lastSymbol === "SAMSUNGUSDT", JSON.stringify(st));
  ok("⭐ 종목이 바뀌면 이어붙이기 빗장을 다시 잠근다 (loadedSymbol = null)",
    t.모듈.getLoadedSymbol() === null, String(t.모듈.getLoadedSymbol()));
  t.닫기();

  /* 최초 로딩이 끝난 상태에서 종목이 바뀌어도 빗장이 잠겨야 합니다 */
  const t2 = 띄우기({ 활성종목: "BTCUSDT" });
  await t2.App.Api.fetchKlines("BTCUSDT", "1m", 500);
  ok("준비 — 빗장이 풀려 있다", t2.모듈.getLoadedSymbol() === "BTCUSDT");
  t2.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" });
  const 전 = t2.호출.length;
  const r = await 결말(t2.App.Api.fetchKlines("BTCUSDT", "1m", 500, 1730000000000));
  ok("종목이 바뀐 직후 옛 종목 이어붙이기는 요청도 안 나간다",
    r.상태 === "거절" && t2.호출.length === 전, "상태 " + r.상태 + " / 보낸 요청 " + (t2.호출.length - 전));
  t2.닫기();
}

/* =========================================================================
 * [8] 봉 간격 변경 — 비우지 않는다
 * ========================================================================= */
절("[8] interval:change → 빗장만 잠그고 시리즈는 안 비운다");
{
  const t = 띄우기({ 활성종목: "BTCUSDT" });
  await t.App.Api.fetchKlines("BTCUSDT", "1m", 500);
  const 점 = t.남은점();

  t.App.Bus.emit("interval:change", { interval: "1h" });

  ok("시리즈를 비우지 않는다 (" + 점 + "개 그대로)", t.남은점() === 점,
    "종목이 그대로인데 비우면 지표가 깜빡이고 다시 그려집니다 — 원래 동작이 아닙니다");
  ok("비운 횟수(cleared)가 0 이다", t.모듈.getStats().cleared === 0, JSON.stringify(t.모듈.getStats()));
  ok("이어붙이기 빗장은 잠근다 (1분봉과 1시간봉이 섞이면 안 됨)",
    t.모듈.getLoadedSymbol() === null, String(t.모듈.getLoadedSymbol()));
  t.닫기();
}

/* =========================================================================
 * [9] 차트가 말썽이어도 죽지 않는다
 * ========================================================================= */
절("[9] 차트가 없거나 시리즈 하나가 말썽이어도 죽지 않는다");
{
  const t = 띄우기({ 차트없음: true });
  let 던짐 = null;
  try { t.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" }); } catch (e) { 던짐 = e; }
  ok("차트가 아직 없어도 오류를 던지지 않는다", 던짐 === null, 던짐 && 던짐.message);
  ok("그래도 이어붙이기 빗장은 잠근다", t.모듈.getLoadedSymbol() === null);
  t.닫기();

  const t2 = 띄우기();
  t2.s.MA20.setData = function () { throw new Error("시리즈 말썽"); };
  let 던짐2 = null;
  try { t2.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" }); } catch (e) { 던짐2 = e; }
  ok("시리즈 하나가 예외를 던져도 전체가 멈추지 않는다", 던짐2 === null, 던짐2 && 던짐2.message);
  ok("말썽인 것만 남고 나머지는 다 비운다",
    t2.s.캔들.data().length === 0 && t2.s.RSI.data().length === 0 && t2.s.볼린저상.data().length === 0,
    "캔들 " + t2.s.캔들.data().length + " / RSI " + t2.s.RSI.data().length);
  t2.닫기();
}

/* =========================================================================
 * [10] 아직 종목 전환을 "열지" 않는다
 * -------------------------------------------------------------------------
 * 이 파일은 받는 쪽만 준비합니다. 쏘는 것은 수리팀 몫입니다.
 * 여기서 쏘기 시작하면 두 곳에서 쏘게 되어 두 번 비웁니다.
 * ⚠ 수리팀이 전환을 열면 이 검사가 실패합니다 — 그때가 "이제 켜도 된다" 는
 *   신호입니다. 그냥 지우지 말고 왜 바뀌었는지 날짜와 함께 남기세요.
 * ========================================================================= */
절("[10] 이 파일은 symbol:change 를 쏘지 않는다 (받기만 한다)");
{
  const src = fs.readFileSync(SRC, "utf8");
  const 코드 = src.slice(src.indexOf("window.App = window.App"));   /* 주석 부분 제외 */
  ok("Bus.emit 을 한 번도 안 부른다", !/Bus\s*\.\s*emit\s*\(/.test(코드),
    "받는 쪽이 쏘기 시작하면 종목 전환이 두 곳에서 일어납니다");
  ok("Bus.on 은 부른다 (받는 쪽이다)", /Bus\s*\.\s*on\s*\(/.test(코드));

  const t = 띄우기();
  const 쏜것 = [];
  t.App.Bus.emit = (e, p) => 쏜것.push(e);
  t.모듈.init();
  ok("init() 이 아무 이벤트도 쏘지 않는다", 쏜것.length === 0, JSON.stringify(쏜것));
  t.닫기();
}

/* =========================================================================
 * [11] 수정 금지 파일 12개
 * ========================================================================= */
절("[11] 수정 금지 파일 12개가 그대로다");
{
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
    "chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
    "season.js": "9c5fbf13ced09ca2f348e48f87c78224",
    "board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
    "orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "chart.js": "02ddcb000d577131f797143d08c09123",
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  const 다름 = Object.keys(기준).filter((f) => md5(f) !== 기준[f]);
  ok("12개 전부 기준 해시와 같다 (특히 chart.js)", 다름.length === 0, "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [12] tests/_order.txt 등록
 * ========================================================================= */
절("[12] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/chart-symbol-switch-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " chart-symbol-switch-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창과 boot() 의 setInterval 이 타이머를 붙들고 있어 반드시 필요합니다. */
process.exit(fail > 0 ? 1 : 0);

})();
