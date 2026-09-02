/* tests/chart-indicator-unit-registry-seal.test.js
 * =========================================================================
 * ★돈에 닿는 자리★ — 지표 하나하나가 표시 통화를 「따라가야 하는지」 를
 *   손으로 적지 않고 ★값이 가격에 비례하는지 재서★ 판정한다
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 만드나 ─────────────────────────────────────────────────────────
 * 2026-09-03 에 ATR 이 원화로 보는 회원 화면에 ★USDT 숫자 그대로★ 떴습니다.
 * 오류 0건 · 화면 멀쩡 · 회원은 그게 USDT 인 줄 모릅니다. 이 프로젝트가
 * P1 로 부르는 「조용한 고장」 그대로입니다. 지금은 고쳐졌습니다(unit:"price").
 *
 * ⚠️ 그런데 ★같은 고장이 다음 지표에서 또 납니다.★ MACD 도 값이 가격입니다.
 *    옮길 때 unit 한 줄을 빠뜨리면 아무도 모릅니다 — 오류가 안 나니까요.
 *
 * tests/chart-indicator-pane-kit.test.js 는 ★틀★ 이 unit 을 제대로 처리하는지
 * 봅니다(시험용 가짜 지표로). 이 파일은 ★등록소★ 를 봅니다 —
 * 실제로 회원 화면에 뜨는 지표 하나하나가 맞게 붙였는가.
 *
 * ── ⭐ 어떻게 판정하나 — 「가격인지」 를 ★재서★ 압니다 ──────────────
 * 목록을 손으로 적으면 새 지표가 왔을 때 아무도 안 적습니다. 그래서 잽니다.
 *
 *   같은 봉을 ★값만 10배★ 로 올려 두 번 계산합니다 (거래량은 그대로 둡니다)
 *     값이 10배가 되면   → 그 지표의 값은 ★가격★ 입니다   (ATR · MACD · MA · VWAP)
 *     값이 그대로면      → 지수·거래량입니다               (RSI · KDJ · CCI · OBV)
 *
 * 2026-09-03 실측 — 15개 정의 전부 10.000 또는 1.000 으로 딱 갈렸습니다.
 *   가격  ma ema wma bb atr sar vwap supertrend ichimoku
 *   아님  kdj srsi cci obv stoch dmi
 * 거래량을 안 올리는 것이 핵심입니다 — 그래야 OBV 가 「가격 아님」 으로 갈립니다.
 * (OBV 에 unit 을 붙이면 거래량이 원화로 환산돼 뜻 없는 숫자가 됩니다)
 *
 * ⚠️ NaN 함정 — 값을 못 읽으면 나눗셈이 NaN 이 되고, NaN 비교는 늘 거짓이라
 *    ★「가격 아님」 으로 조용히 넘어갑니다.★ 그래서 두 번 다 「유한하고 0 이
 *    아닌 값」 이 나왔는지 먼저 확인하고, 못 읽으면 그 자리에서 빨개집니다.
 *    (2026-09-03 앞 건에서 실제로 당한 함정입니다)
 *
 * ── 여기서 못 박는 것 ──────────────────────────────────────────────────
 *   [1] 값이 가격인지 ★재서★ 가른다 (읽기 실패는 빨강)
 *   [2] 아래 칸 + 가격 이면 unit:"price" ★필수★ / 아니면 ★금지★
 *   [3] ATR 이 실제로 원화를 따라간다 · 지수 지표는 안 따라간다 (실제로 태워서)
 *   [4] ★아직 안 옮긴 것★ (MACD · RSI) — 오는 순간 규칙이 스스로 걸린다
 *   [5] 기준선(guides)이 눈금(scale) 밖으로 나가면 안 된다  ← RSI 30·70 미리 막기
 *   [6] 태생값(born) — 볼린저가 들어온 뒤에도 「기본값」 이 제자리로 간다
 *   [7] 돌연변이 — 위 규칙들이 진짜로 무는지
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { boot, makeCandles, makeEl, REPO } = require("./_kit-harness.js");

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

console.log("\n지표 등록소 — 표시 통화 · 눈금 · 태생값");

/* =====================================================================
 * [0] 준비
 * ===================================================================== */
const 봉수 = 240;

/** 같은 봉을 값만 배수만큼 올립니다. ★거래량(value)은 그대로 둡니다★ */
function 배율봉(mul) {
  return makeCandles(봉수).map((c) => ({
    time: c.time,
    open: c.open * mul,
    high: c.high * mul,
    low: c.low * mul,
    close: c.close * mul,
    value: c.value
  }));
}

/** 등록된 정의를 하나씩 켜서 「지금 값」 을 읽어 옵니다 */
function 값읽기(mul) {
  const B = boot(배율봉(mul));
  const K = B.K;
  const out = {};
  K.listDefs().forEach((d) => {
    const id = K.createInstance(d.id, { on: true });
    const it = K.getInstancesForTest()[id];
    out[d.id] = it && it.live ? JSON.parse(JSON.stringify(it.live.vals || {})) : null;
  });
  return { 값: out, 정의: K.listDefs(), K: K };
}

절("[0] 준비 — 등록된 정의를 전부 켜서 값을 읽는다");
const 한배 = 값읽기(1);
const 열배 = 값읽기(10);
const 정의들 = 한배.정의;
ok("등록된 정의를 " + 정의들.length + "개 읽었다 (" + 정의들.map((d) => d.id).join(" ") + ")",
  정의들.length >= 15, "정의가 너무 적습니다 — 틀이 안 떴을 수 있습니다");
ok("두 번 다 같은 정의 목록이 나왔다 (배수만 다릅니다)",
  정의들.map((d) => d.id).join(",") === 열배.정의.map((d) => d.id).join(","));

/* =====================================================================
 * [1] ⭐ 값이 가격인지 ★재서★ 가른다
 * ===================================================================== */
절("[1] 값이 가격인가 — 봉 값을 10배로 올려 재서 가른다");

const 판정 = {};
정의들.forEach((d) => {
  const a = 한배.값[d.id] || {};
  const b = 열배.값[d.id] || {};
  const 키들 = Object.keys(a);
  const 못읽음 = [];
  const 비율들 = [];
  키들.forEach((k) => {
    const x = a[k];
    const y = b[k];
    /* ★NaN 함정 방지★ — 못 읽으면 조용히 「가격 아님」 이 되지 않게 여기서 셉니다 */
    if (typeof x !== "number" || typeof y !== "number" ||
      !isFinite(x) || !isFinite(y) || Math.abs(x) < 1e-9) {
      못읽음.push(k + "(" + x + " / " + y + ")");
      return;
    }
    비율들.push(y / x);
  });
  ok(d.id + " — 출력 " + 키들.length + "개를 두 배수에서 다 읽었다",
    키들.length > 0 && 못읽음.length === 0,
    "못 읽은 것: " + 못읽음.join(", ") +
    "  ★값을 못 읽으면 아래 판정이 통째로 헛것이 됩니다★");
  const 가격 = 비율들.length > 0 && 비율들.every((r) => Math.abs(r - 10) < 0.05);
  const 지수 = 비율들.length > 0 && 비율들.every((r) => Math.abs(r - 1) < 0.05);
  판정[d.id] = { 가격: 가격, 지수: 지수, 비율: 비율들.map((r) => r.toFixed(3)).join(" "), pane: d.pane, unit: d.unit };
  ok(d.id + " — 비율이 딱 갈린다 (" + 판정[d.id].비율 + ") → " +
    (가격 ? "★가격★" : 지수 ? "지수·거래량" : "???"), 가격 || 지수,
    "10배도 1배도 아닌 어중간한 비율입니다 — 이 지표는 사람이 직접 판정해야 합니다");
});

{
  const 가격목록 = Object.keys(판정).filter((k) => 판정[k].가격);
  const 지수목록 = Object.keys(판정).filter((k) => 판정[k].지수);
  console.log("      가격  " + 가격목록.join(" "));
  console.log("      지수  " + 지수목록.join(" "));
  ok("둘 중 하나로 다 갈렸다 (" + 가격목록.length + " + " + 지수목록.length + " = " + 정의들.length + ")",
    가격목록.length + 지수목록.length === 정의들.length);
}

/* =====================================================================
 * [2] ⭐⭐ 규칙 — 아래 칸 + 가격 이면 unit:"price" 필수, 아니면 금지
 * ===================================================================== */
절('[2] 규칙 — 아래 칸 지표는 값이 가격이면 unit:"price" 를 붙인다');

/* 주 칸(main)은 캔들과 같은 가격축을 쓰고 그 글자는 js/chart.js 가 이미
   통화에 맞춰 만듭니다. 그래서 main 에는 unit 을 붙이면 안 됩니다(두 벌 금지). */
{
  const 빠뜨림 = [];
  const 잘못붙임 = [];
  const 주칸붙임 = [];
  정의들.forEach((d) => {
    const p = 판정[d.id];
    if (d.pane === "main") {
      if (d.unit) 주칸붙임.push(d.id);
      return;
    }
    if (p.가격 && d.unit !== "price") 빠뜨림.push(d.id + "(" + p.비율 + ")");
    if (!p.가격 && d.unit) 잘못붙임.push(d.id + "=" + d.unit);
  });
  ok('★값이 가격인 아래 칸 지표는 전부 unit:"price" 를 붙였다★', 빠뜨림.length === 0,
    "안 붙인 것: " + 빠뜨림.join(", ") +
    "  → 원화로 보는 회원 화면에 USDT 숫자가 그대로 뜹니다(조용한 고장). " +
    'js/chart-indicator-kit.js 의 그 define 에 unit: "price" 한 줄을 넣어야 합니다');
  ok("값이 가격이 아닌 지표에는 unit 을 안 붙였다 (RSI · KDJ · CCI · OBV 계열)",
    잘못붙임.length === 0,
    "잘못 붙인 것: " + 잘못붙임.join(", ") +
    "  → 지수·거래량이 원화로 환산돼 ★뜻 없는 숫자★ 가 됩니다");
  ok("주 칸(main) 지표에는 unit 을 안 붙였다 (가격축은 js/chart.js 담당)",
    주칸붙임.length === 0, 주칸붙임.join(", "));
}

/* 지금 무엇이 붙어 있나 — 사실을 적어 둡니다 */
{
  const 붙은것 = 정의들.filter((d) => d.unit === "price").map((d) => d.id);
  ok('unit:"price" 가 붙은 것은 지금 [' + 붙은것.join(" ") + "] 하나뿐이다 (ATR)",
    붙은것.join(",") === "atr",
    "지금: " + 붙은것.join(",") + "  → MACD 를 옮겼으면 이 줄만 고치면 됩니다. " +
    "위 두 줄이 초록이면 규칙은 지켜진 것입니다");
}

/* =====================================================================
 * [3] ⭐ 행동 — 원화로 바꾸면 ATR 만 글자가 바뀐다
 *     (틀이 아니라 ★진짜 지표★ 로 확인합니다)
 * ===================================================================== */
절("[3] 행동 — 원화로 바꾸면 ATR 만 글자가 바뀐다");

/* 표시 통화 — js/utils.js 를 ★실제로 태워서★ 씁니다(숫자를 안 베낍니다).
   tests/chart-indicator-pane-kit.test.js 와 같은 방식입니다. */
function 통화붙이기(B) {
  const box = { App: { Config: { USD_KRW: 1500, getDisplayCurrency: () => box.cur } }, console: { warn() {} } };
  box.window = box;
  box.cur = "USDT";
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js/utils.js"), "utf8"), box, { filename: "js/utils.js" });
  B.sandbox.App.Utils = box.App.Utils;
  B.sandbox.App.Config.getDisplayCurrency = () => box.cur;
  B.통화 = (c) => { box.cur = c; B.sandbox.App.Bus.emit("currency:change", { currency: c }); };
  B.진짜글자 = (v) => box.App.Utils.formatCurrencyPlain(v);
  return B;
}

/** 아래 칸 이름표를 볼 수 있게 가짜 화면을 얹습니다 */
function 화면얹기(B) {
  const panel = B.sandbox.document.querySelector(".chart-panel");
  const wrap = makeEl("div");
  wrap.className = "chart-wrap";
  wrap.getBoundingClientRect = () => ({ top: 50, left: 0, right: 900, bottom: 950, width: 900, height: 900 });
  panel.appendChild(wrap);
  B.rows = [];
  B.chart.chartElement = () => ({
    querySelectorAll(sel) { return sel === "tr" ? B.rows : []; }
  });
  B.칸줄맞추기 = () => {
    const n = B.chart.panes().length;
    B.rows = [];
    let y = 50;
    for (let i = 0; i < n; i++) {
      const h = i === 0 ? 400 : 120;
      const top = y;
      B.rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: top, height: h }) });
      y += h;
    }
    B.rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: y, height: 26 }) });
  };
  B.칸줄맞추기();
  B.wrap = wrap;
  return B;
}

{
  const B = 통화붙이기(화면얹기(boot(makeCandles(봉수))));
  const K = B.K;

  /* 아래 칸 지표를 ★전부★ 켭니다 — 하나만 보면 다음 지표에서 또 납니다 */
  const 아래칸 = K.listDefs().filter((d) => d.pane === "sub");
  const 켠것 = {};
  아래칸.forEach((d) => { 켠것[d.id] = K.createInstance(d.id, { on: true }); });
  B.칸줄맞추기();
  K.repositionPaneLabelsForTest();
  K.paintPaneLabelsForTest(true);

  const 라벨 = () => {
    const out = {};
    K.getPaneLabelsForTest().forEach((L) => { out[L.id] = JSON.stringify(L.values); });
    return out;
  };
  const 전 = 라벨();
  ok("아래 칸 지표 " + 아래칸.length + "개를 켜서 이름표가 다 떴다",
    Object.keys(전).length === 아래칸.length, Object.keys(전).length + "개");

  B.통화("KRW");
  const 후 = 라벨();

  const 바뀐것 = [];
  const 안바뀐것 = [];
  아래칸.forEach((d) => {
    const id = 켠것[d.id];
    if (전[id] === undefined || 후[id] === undefined) return;
    (전[id] !== 후[id] ? 바뀐것 : 안바뀐것).push(d.id);
  });
  console.log("      원화로 바꿨을 때 글자가 바뀐 것  " + 바뀐것.join(" "));
  console.log("      그대로인 것                     " + 안바뀐것.join(" "));

  const 가격인것 = 아래칸.filter((d) => 판정[d.id].가격).map((d) => d.id);
  const 지수인것 = 아래칸.filter((d) => !판정[d.id].가격).map((d) => d.id);
  ok("★값이 가격인 아래 칸 지표는 원화를 따라간다★ (" + 가격인것.join(" ") + ")",
    가격인것.every((id) => 바뀐것.indexOf(id) >= 0),
    "안 따라간 것: " + 가격인것.filter((id) => 바뀐것.indexOf(id) < 0).join(", ") +
    "  ★원화 회원이 USDT 숫자를 원화로 읽습니다★");
  ok("★지수·거래량 지표는 원화를 안 따라간다★ (" + 지수인것.join(" ") + ")",
    지수인것.every((id) => 안바뀐것.indexOf(id) >= 0),
    "따라간 것: " + 지수인것.filter((id) => 안바뀐것.indexOf(id) < 0).join(", ") +
    "  → 지수를 환율로 곱하면 뜻 없는 숫자가 됩니다");
  ok("실제로 하나라도 바뀌었다 (아무것도 안 바뀌면 검사가 헛돕니다)", 바뀐것.length > 0,
    "★전부 그대로면 통화 갈아끼우기 자체가 안 도는 것입니다★");

  /* 눈금 글자 만들기도 같이 봅니다 — 이름표만 바뀌고 눈금이 그대로면 반쪽입니다 */
  가격인것.forEach((did) => {
    const it = K.getInstancesForTest()[켠것[did]];
    const s = it.live.series[Object.keys(it.live.series)[0]];
    const pf = s.options().priceFormat;
    ok(did + " — 눈금 글자도 원화를 따라간다 (minMove 1)",
      !!pf && typeof pf.formatter === "function" && pf.formatter(1234.5) === B.진짜글자(1234.5) &&
      pf.minMove === 1,
      JSON.stringify(pf && { m: pf.minMove, s: pf.formatter && pf.formatter(1234.5) }));
  });
  지수인것.forEach((did) => {
    const it = K.getInstancesForTest()[켠것[did]];
    const s = it.live.series[Object.keys(it.live.series)[0]];
    ok(did + " — 눈금 글자를 안 건드린다", s.options().priceFormat === undefined,
      JSON.stringify(s.options().priceFormat));
  });

  /* 데이터는 한 점도 안 바뀝니다 — 보이는 글자만 바뀝니다 */
  const atrId = 켠것.atr;
  if (atrId) {
    const 점 = B.그린값(atrId);
    const 값들 = 점[Object.keys(점)[0]].map((p) => p.value).filter((v) => typeof v === "number");
    ok("★그린 값(데이터)은 환율로 안 곱해진다★ — 글자만 바꿉니다",
      값들.length > 0 && 값들.every((v) => v < 100000),
      "가장 큰 값 " + Math.max.apply(null, 값들));
  }
}

/* =====================================================================
 * [4] ⭐ 아직 안 옮긴 것 — 오는 순간 규칙이 스스로 걸린다
 * ===================================================================== */
절("[4] 옮겨 오는 지표마다 반드시 같이 해야 하는 것");

/* ⭐ 이 표는 ★스스로 켜집니다★ — 그 지표가 아직 없으면 「아직 안 왔다」 로
   지나가고, 오는 순간 요구조건을 그 자리에서 검사합니다. 「없다」 만 적어 두면
   오는 날 빨개지긴 하지만 ★무엇을 확인해야 하는지는 안 검사합니다.★
   ⚠️ 실제로 이 파일을 만드는 동안 RSI 가 들어왔습니다(2026-09-03 03:12).
      그래서 「아직 안 왔다」 만 적는 방식을 버리고 이 모양으로 바꿨습니다. */
const 요구표 = [
  {
    id: "macd", 이름: "MACD",
    요구: (d) => d.unit === "price",
    할일: '값이 ★가격 차이★ 라 unit: "price" 가 필수입니다. ' +
      "안 붙이면 원화 회원 화면에 USDT 숫자가 뜹니다 — ATR 과 똑같은 조용한 고장입니다. " +
      "(지금은 js/chart-oscillators.js 의 macdPriceFormat 이 그 일을 하고 있습니다)"
  },
  {
    id: "rsi", 이름: "RSI",
    요구: (d) => !!d.scale && d.scale.min === 0 && d.scale.max === 100 && !d.unit,
    할일: "0~100 이 정해진 지표라 scale: { min: 0, max: 100 } 이 필수입니다. " +
      "안 걸면 값이 40~60 에서 놀 때 눈금이 40~60 으로 좁아져 ★30 · 70 기준선이 화면 밖★ 으로 " +
      "나갑니다. 그 두 줄이 없으면 RSI 를 읽을 수가 없습니다. unit 은 붙이면 안 됩니다(지수입니다)."
  }
];
const 정의로 = {};
정의들.forEach((d) => { 정의로[d.id] = d; });
요구표.forEach((x) => {
  const d = 정의로[x.id];
  if (!d) {
    ok(x.이름 + " — 아직 틀로 안 왔다 (오면 이 줄이 요구조건을 검사합니다)", true);
    console.log("        요구: " + x.할일);
    return;
  }
  ok("★" + x.이름 + " 가 왔다 — 요구조건을 지켰다★ " +
    "(unit=" + d.unit + " · scale=" + JSON.stringify(d.scale) + ")",
    x.요구(d), x.할일);
});
{
  const 온것 = 요구표.filter((x) => !!정의로[x.id]).map((x) => x.이름);
  const 아직 = 요구표.filter((x) => !정의로[x.id]).map((x) => x.이름);
  ok("표에 적힌 " + 요구표.length + "개 중 온 것 [" + 온것.join(" ") + "] · 아직 [" + 아직.join(" ") + "]",
    요구표.length === 2);
}

/* =====================================================================
 * [5] ⭐ 기준선은 눈금 안에 있어야 한다 — RSI 30 · 70 미리 막기
 * ===================================================================== */
절("[5] 눈금을 고정했으면 기준선이 그 안에 있어야 한다");

{
  /* 지금 눈금을 고정한 지표가 있으면 전부 봅니다. 없으면 「없다」 를 적어 둡니다 */
  const 눈금있는것 = 정의들.filter((d) => d.scale && d.scale.min !== null && d.scale.min !== undefined);
  const 밖으로나감 = [];
  눈금있는것.forEach((d) => {
    (d.guides || []).forEach((g) => {
      if (g.price < d.scale.min || g.price > d.scale.max) {
        밖으로나감.push(d.id + " 기준선 " + g.price + " 가 [" + d.scale.min + "," + d.scale.max + "] 밖");
      }
    });
  });
  ok("★눈금을 고정한 지표의 기준선은 전부 눈금 안에 있다★ (지금 " + 눈금있는것.length +
    "개: " + 눈금있는것.map((d) => d.id).join(" ") + ")",
    밖으로나감.length === 0,
    밖으로나감.join(" / ") +
    "  → 눈금 밖 기준선은 ★영원히 안 보입니다.★ 오류도 안 납니다");
  /* 기준선이 있는 지표는 눈금을 고정해야 그 선이 늘 보입니다.
     ⚠️ 이 줄은 「몇 개냐」 가 아니라 ★어느 것이 아직 안 걸었나★ 를 봅니다 —
        개수만 세면 하나가 걸리고 하나가 늘 때 조용히 통과합니다. */
  const 기준선지표 = 정의들.filter((d) => (d.guides || []).length > 0);
  const 눈금건것 = 기준선지표.filter((d) => d.scale && d.scale.min !== null && d.scale.min !== undefined)
    .map((d) => d.id).sort();
  ok("기준선이 있는 지표 " + 기준선지표.length + "개 중 눈금을 고정한 것은 [" + 눈금건것.join(" ") + "] 이다",
    눈금건것.join(",") === "rsi",
    "지금: " + 눈금건것.join(",") +
    "  → 늘었으면 좋은 일입니다. 아래 「PM 보고」 줄과 함께 새 사실로 고치세요");

  /* ⚠️ 눈금을 ★안★ 고정한 채 기준선만 있는 지표는 추세장에서 기준선이 사라집니다.
     아래는 그 사실을 ★실제로 재서★ 적어 둔 것입니다 — PM 보고분입니다. */
  const 상승봉 = [];
  {
    let px = 70000;
    for (let i = 0; i < 봉수; i++) {
      px += 20;
      상승봉.push({ time: 1700000000 + i * 60, open: px - 5, high: px + 5, low: px - 8, close: px, value: 10 });
    }
  }
  const B2 = boot(상승봉);
  const 기준선있고눈금없음 = B2.K.listDefs().filter((d) =>
    (d.guides || []).length > 0 && !(d.scale && d.scale.min !== null && d.scale.min !== undefined));
  const 사라짐 = [];
  기준선있고눈금없음.forEach((d) => {
    const id = B2.K.createInstance(d.id, { on: true });
    const g = B2.그린값(id) || {};
    const vs = [];
    Object.keys(g).forEach((k) => g[k].forEach((p) => {
      if (typeof p.value === "number" && isFinite(p.value)) vs.push(p.value);
    }));
    if (!vs.length) return;
    const lo = Math.min.apply(null, vs);
    const hi = Math.max.apply(null, vs);
    const 밖 = (d.guides || []).filter((x) => x.price < lo || x.price > hi).map((x) => x.price);
    if (밖.length) 사라짐.push(d.id + " 값 " + lo.toFixed(1) + "~" + hi.toFixed(1) + " · 밖 [" + 밖.join(",") + "]");
  });
  사라짐.forEach((s) => console.log("      · " + s));
  const 사라진이름 = 사라짐.map((s) => s.split(" ")[0]).sort();
  ok("★(PM 보고) 눈금을 안 고정한 지표는 한쪽으로 쏠린 장에서 기준선이 화면 밖으로 나갑니다★ — " +
    "[" + 사라진이름.join(" ") + "] (기준선은 있고 눈금은 안 건 것 " +
    기준선있고눈금없음.length + "개 중)",
    사라진이름.join(",") === "cci,srsi,stoch",
    "지금: [" + 사라진이름.join(" ") + "]" +
    "  → 줄었으면 눈금을 고정한 것입니다(좋은 일). 늘었으면 ★새 지표가 같은 구멍★ 입니다. " +
    "어느 쪽이든 이 줄을 새 사실로 고치고 PM 에게 알리세요");
  ok("(근거) 위 재기가 헛돌지 않았다 — 기준선 있는 지표를 실제로 " +
    기준선있고눈금없음.length + "개 태웠다", 기준선있고눈금없음.length >= 3,
    "0 개면 위 줄이 공짜로 통과합니다");
}

/* =====================================================================
 * [6] ⭐ 태생값(born) — 볼린저가 들어온 뒤에도 「기본값」 이 제자리로
 * ===================================================================== */
절("[6] 태생값 — 「기본값」 을 눌러도 회원이 처음 본 그 모습으로 돌아온다");

{
  const B = boot(makeCandles(120));
  const K = B.K;
  const 기본줄 = K.listInstances();
  ok("처음 오는 회원에게 주는 줄이 " + 기본줄.length + "개다 (" + 기본줄.map((i) => i.id).join(" ") + ")",
    기본줄.length >= 6, 기본줄.map((i) => i.id).join(","));
  ok("★볼린저(bb-20)가 그 안에 있다★ (2026-09-02 12단계에 옮겨 옴)",
    기본줄.some((i) => i.id === "bb-20"),
    "볼린저가 빠졌습니다 — 옮기기가 되돌아갔을 수 있습니다");

  /* 처음 모습을 그대로 적어 둡니다 (손으로 값을 안 적고 ★지금 화면★ 을 찍습니다) */
  const 처음 = {};
  기본줄.forEach((i) => {
    처음[i.id] = JSON.stringify({ p: i.params, c: i.colors, s: i.style, w: i.width });
  });

  /* 회원이 전부 헤집어 놓습니다 — 기간 · 색 · 굵기 · 선모양 */
  기본줄.forEach((i) => {
    const 색바꿈 = {};
    Object.keys(i.colors).forEach((k) => { 색바꿈[k] = "#F0B429"; });
    K.updateInstance(i.id, { colors: 색바꿈, width: 4, style: "dotted" });
  });
  const 헤집은뒤 = K.listInstances().map((i) =>
    JSON.stringify({ p: i.params, c: i.colors, s: i.style, w: i.width }));
  ok("회원이 바꾸면 실제로 바뀐다 (안 바뀌면 아래 검사가 헛돕니다)",
    K.listInstances().every((i, n) => 헤집은뒤[n] !== 처음[i.id]));

  /* 「기본값」 버튼 */
  K.listInstances().forEach((i) => K.resetInstance(i.id));
  const 어긋남 = [];
  K.listInstances().forEach((i) => {
    const 지금 = JSON.stringify({ p: i.params, c: i.colors, s: i.style, w: i.width });
    if (지금 !== 처음[i.id]) 어긋남.push(i.id + "\n           처음 " + 처음[i.id] + "\n           지금 " + 지금);
  });
  ok("★기본값을 눌러도 " + 기본줄.length + "줄 전부 처음 모습 그대로다★ (볼린저 포함)",
    어긋남.length === 0, 어긋남.join("\n         "));

  /* ⭐ 새로고침 왕복 — ★저장분을 진짜로 다시 읽습니다★
     ⚠️ boot(candles, saved) 입니다. saved 를 { saved: ... } 로 감싸 넘기면
        판 번호가 안 맞아 ★저장분이 통째로 버려지고 기본값으로 뜹니다★ —
        그러면 "새로고침 뒤에도 된다" 가 아무것도 확인 못 합니다.
        2026-09-03 에 tests/chart-indicator-color-collision.test.js 가 실제로
        그렇게 돼 있던 것을 찾아 고쳤습니다. 여기서도 같은 실수를 막으려고
        ★저장분이 진짜 실렸는지 먼저 확인★ 합니다. */
  K.updateInstance("bb-20", { params: { p: 5, k: 9 }, colors: { upper: "#F0B429", middle: "#F0B429", lower: "#F0B429" } });
  const 저장분 = B.stored["chart-indicator-kit"];
  ok("저장칸에 회원이 바꾼 값이 들어 있다 (p=5)",
    !!저장분 && 저장분.instances.filter((x) => x.id === "bb-20")[0].params.p === 5,
    JSON.stringify(저장분 && 저장분.instances.filter((x) => x.id === "bb-20")[0]));
  ok("저장칸에 ★태생값★ 도 같이 들어 있다 (안 넣으면 새로고침 한 번에 잊습니다)",
    !!저장분.instances.filter((x) => x.id === "bb-20")[0].born,
    JSON.stringify(저장분.instances.filter((x) => x.id === "bb-20")[0]));

  const B2 = boot(makeCandles(120), 저장분);
  const bb2 = B2.K.listInstances().filter((x) => x.id === "bb-20")[0];
  ok("★저장분이 진짜로 실렸다★ (p=5 로 떠야 합니다 — 20 이면 저장분이 버려진 것)",
    bb2 && bb2.params.p === 5, bb2 ? JSON.stringify(bb2.params) : "없음");
  B2.K.resetInstance("bb-20");
  const bb3 = B2.K.listInstances().filter((x) => x.id === "bb-20")[0];
  ok("새로고침한 뒤 기본값을 눌러도 태생값(20 · 2 · 회색 점선)으로 돌아온다",
    bb3.params.p === 20 && bb3.params.k === 2 && bb3.colors.upper === "#838DA4" &&
    bb3.style === "dashed" && bb3.width === 1,
    JSON.stringify({ p: bb3.params, c: bb3.colors, s: bb3.style, w: bb3.width }));

  /* 태생값 칸이 아예 없던 옛 저장분 — 기본 인스턴스 목록에서 되살려야 합니다 */
  const 옛 = JSON.parse(JSON.stringify(저장분));
  옛.instances.forEach((x) => { delete x.born; });
  const B3 = boot(makeCandles(120), 옛);
  const bb4a = B3.K.listInstances().filter((x) => x.id === "bb-20")[0];
  ok("(대조) 태생값이 없던 옛 저장분도 회원 값(p=5)으로 뜬다", bb4a && bb4a.params.p === 5,
    bb4a ? JSON.stringify(bb4a.params) : "없음");
  B3.K.resetInstance("bb-20");
  const bb4 = B3.K.listInstances().filter((x) => x.id === "bb-20")[0];
  ok("★태생값이 없던 옛 저장분도 20 · 2 · 회색 점선으로 돌아온다★",
    bb4.params.p === 20 && bb4.params.k === 2 && bb4.colors.upper === "#838DA4" && bb4.style === "dashed",
    JSON.stringify({ p: bb4.params, c: bb4.colors, s: bb4.style }));
}

/* =====================================================================
 * [7] ⭐⭐ 돌연변이 — 위 규칙들이 진짜로 무는가
 *
 * ★원본 파일은 한 글자도 안 건드립니다★ (지금 차트팀이 잡고 있습니다).
 * 대신 ★공개 API 로 일부러 틀린 지표를 등록★ 해서 규칙이 잡는지 봅니다.
 * ===================================================================== */
절("[7] 돌연변이 — 일부러 틀리게 등록하면 규칙이 잡는가");

{
  const B = 통화붙이기(화면얹기(boot(makeCandles(봉수))));
  const K = B.K;
  const 색 = K.LINE_COLORS[6].hex;

  /* 값이 ★가격★ 인데 unit 을 안 붙인 아래 칸 지표 (= MACD 를 옮길 때의 실수) */
  const 가격인데안붙임 = {
    id: "t-가격-unit없음", name: "시험", pane: "sub",
    params: { p: 5 }, inputs: [{ key: "p", label: "기간", min: 1, max: 100 }],
    outputs: [{ key: "v", kind: "line", color: 색, style: "solid" }],
    seed: function (bs, prm, cap) {
      const out = [];
      for (let i = 0; i < bs.close.length; i++) out.push({ time: bs.time[i], value: bs.close[i] });
      cap.state = {};
      return { v: out };
    },
    step: function (st, bar) { return { values: { v: bar ? bar.close : 1 }, state: st || {} }; }
  };
  ok("일부러 틀린 지표가 등록은 된다 (틀은 값 단위를 모릅니다)",
    K.define(가격인데안붙임) === true);
  const id = K.createInstance(가격인데안붙임.id, { on: true });

  /* 위 [1] 과 같은 방식으로 재 봅니다 — 배수 1 · 10 */
  function 값재기(mul) {
    const BB = boot(배율봉(mul));
    BB.K.define(가격인데안붙임);
    const i2 = BB.K.createInstance(가격인데안붙임.id, { on: true });
    const it = BB.K.getInstancesForTest()[i2];
    return it && it.live ? it.live.vals.v : null;
  }
  const v1 = 값재기(1);
  const v10 = 값재기(10);
  ok("★재기 규칙이 이 지표를 「가격」 으로 가려낸다★ (비율 " +
    (typeof v1 === "number" && v1 ? (v10 / v1).toFixed(3) : "?") + ")",
    typeof v1 === "number" && typeof v10 === "number" && isFinite(v1) && isFinite(v10) &&
    Math.abs(v1) > 1e-9 && Math.abs(v10 / v1 - 10) < 0.05,
    "못 가려냈습니다 — [1] 의 재기 방식이 죽었습니다: " + v1 + " / " + v10);

  const it = K.getInstancesForTest()[id];
  const s = it.live.series.v;
  ok("★unit 을 안 붙였으니 눈금 글자가 안 걸린다★ (= 조용한 고장 상태)",
    s.options().priceFormat === undefined,
    "붙어 있으면 틀이 unit 없이도 걸어 준다는 뜻입니다 — 그러면 [2] 가 필요 없어집니다");

  const 전 = JSON.stringify(K.getPaneLabelsForTest().filter((L) => L.id === id)[0]);
  B.통화("KRW");
  const 후 = JSON.stringify(K.getPaneLabelsForTest().filter((L) => L.id === id)[0]);
  ok("★원화로 바꿔도 글자가 안 바뀐다 — 이것이 ATR 에서 났던 그 고장입니다★",
    전 === 후, "바뀌었습니다: " + 전 + " -> " + 후);

  /* 반대쪽 — 지수인데 unit 을 붙인 것도 [2] 가 잡아야 합니다 */
  const 지수인데붙임 = Object.assign({}, 가격인데안붙임, {
    id: "t-지수-unit붙임", unit: "price",
    seed: function (bs, prm, cap) {
      const out = [];
      for (let i = 0; i < bs.close.length; i++) out.push({ time: bs.time[i], value: 55 });
      cap.state = {};
      return { v: out };
    },
    step: function (st) { return { values: { v: 55 }, state: st || {} }; }
  });
  ok('지수인데 unit:"price" 를 붙인 것도 등록은 된다', K.define(지수인데붙임) === true);
  const B4 = boot(makeCandles(봉수));
  B4.K.define(지수인데붙임);
  const i4 = B4.K.createInstance(지수인데붙임.id, { on: true });
  const s4 = B4.K.getInstancesForTest()[i4].live.series.v;
  ok("★그러면 지수 값에 원화 글자가 붙습니다 — [2] 의 「금지」 가 이걸 막습니다★",
    !!s4.options().priceFormat,
    "안 붙었으면 [2] 의 금지 규칙이 지킬 게 없습니다");
}

/* =====================================================================
 * [8] 등록
 * ===================================================================== */
절("[8] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-indicator-unit-registry-seal.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
