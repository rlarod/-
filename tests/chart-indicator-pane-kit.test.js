/* tests/chart-indicator-pane-kit.test.js
 * =========================================================================
 * 봉인 — 아래 칸(pane) 지표에 틀이 내준 셋
 *        ① 눈금 고정(scale)  ② 칸 이름표  ③ 표시 통화(unit:"price")
 * =========================================================================
 * 2026-09-03 차트팀 (13단계). RSI · MACD 를 틀로 옮기기 ★전에★ 낸 길입니다.
 *
 * ── 왜 이 셋인가 ────────────────────────────────────────────────────────
 *   ① 눈금 고정 — RSI 는 0~100 이 정해진 지표입니다. 눈금을 데이터에만 맞추면
 *      값이 40~60 에서 놀 때 눈금이 40~60 으로 좁아지고 ★30 · 70 기준선이
 *      화면 밖★ 으로 나갑니다. 그 두 줄이 없으면 RSI 를 읽을 수가 없습니다.
 *      js/chart-oscillators.js 가 몇 달째 쓰던 방식을 틀로 옮긴 것입니다.
 *
 *   ② 칸 이름표 — 아래 칸 지표 일곱 개(KDJ · ATR · StochRSI · CCI · OBV ·
 *      Stochastic · ADX)는 선만 뜨고 ★그게 뭔지도 지금 값이 얼마인지도★
 *      안 보였습니다. 트레이딩뷰는 칸마다 "이름 + 값" 을 띄웁니다.
 *
 *   ③ 표시 통화 — ★여기가 제일 위험한 곳입니다.★
 *      ATR · MACD 는 값이 ★가격★ 입니다. 캔들 데이터는 항상 USDT 인데
 *      원화로 보는 회원 화면에도 USDT 숫자가 그대로 떴습니다.
 *      오류 0건 · 화면 멀쩡 · 회원은 그게 USDT 인 줄 모릅니다.
 *      이 프로젝트가 P1 로 부르는 "조용한 고장" 그대로입니다.
 *
 * ── ⚠️ 소스 글자에 기대지 않습니다 ──────────────────────────────────────
 * 줄 번호도, "이 지표가 몇 개다" 도 손으로 안 적습니다. listDefs() 로 세고
 * 공개 API 로 실제로 켜 봅니다. 통화 계산도 ★js/utils.js 를 실제로 태워★
 * 대조합니다 — 숫자를 베껴 적으면 저쪽이 바뀌어도 여기는 옛 값을 지킵니다.
 *
 * ── 되돌리기 ────────────────────────────────────────────────────────────
 * tests/_order.txt 에서 이 줄을 지우고 이 파일을 지우면 됩니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { boot, makeCandles, makeEl, REPO } = require("./_kit-harness.js");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m✓" + ESC + "[0m";
const NGM = ESC + "[31m✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + OKM + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}

console.log("\n아래 칸 지표 — 눈금 고정 · 칸 이름표 · 표시 통화");

/* =======================================================================
 * 부팅 도우미 — 가짜 화면에 .chart-wrap 과 칸 줄(tr)을 얹습니다.
 *
 * ⚠️ tests/_kit-harness.js 는 손대지 않았습니다. 여러 테스트가 같이 쓰는
 *    파일이라, 거기에 화면을 더하면 다른 테스트의 결과가 같이 바뀝니다.
 *    여기서는 boot() 가 만든 가짜 DOM 에 ★덧붙이기만★ 합니다.
 * ===================================================================== */
const 칸높이 = 120; /* 아래 칸 하나의 높이(px) — 자리 계산 대조용 */
const 주칸높이 = 400;

function 화면얹기(B) {
  const panel = B.sandbox.document.querySelector(".chart-panel");
  const wrap = makeEl("div");
  wrap.className = "chart-wrap";
  wrap.getBoundingClientRect = () => ({ top: 50, left: 0, right: 900, bottom: 950, width: 900, height: 900 });
  panel.appendChild(wrap);

  /* 라이브러리가 만드는 표 — 칸마다 한 줄, 맨 끝은 시간축 줄 */
  B.rows = [];
  B.chart.chartElement = () => ({
    querySelectorAll(sel) {
      if (sel !== "tr") return [];
      return B.rows;
    },
  });
  B.칸줄맞추기 = () => {
    const n = B.chart.panes().length; /* 주 칸 + 아래 칸들 */
    B.rows = [];
    let y = 50;
    for (let i = 0; i < n; i++) {
      const h = i === 0 ? 주칸높이 : 칸높이;
      const top = y;
      B.rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: top, height: h }) });
      y += h;
    }
    /* 맨 끝 시간축 줄 — 틀이 이걸 빼고 셉니다 */
    B.rows.push({ children: { length: 3 }, getBoundingClientRect: () => ({ top: y, height: 26 }) });
  };
  B.칸줄맞추기();
  B.wrap = wrap;
  return B;
}

/** 가짜 화면 위에서 이름표 요소를 찾습니다 */
function 이름표들(B) {
  return B.wrap.querySelectorAll(".tl-kit-plabel");
}

/* 표시 통화 — js/utils.js 를 ★실제로 태워서★ 씁니다(숫자를 안 베낍니다) */
function 통화붙이기(B) {
  const box = {
    App: { Config: { USD_KRW: 1500, getDisplayCurrency: () => box.cur } },
    console: { warn() {} },
  };
  box.window = box;
  box.cur = "USDT";
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js/utils.js"), "utf8"), box, { filename: "js/utils.js" });
  B.sandbox.App.Utils = box.App.Utils;
  B.sandbox.App.Config.getDisplayCurrency = () => box.cur;
  B.통화 = (c) => {
    box.cur = c;
    B.sandbox.App.Bus.emit("currency:change", { currency: c });
  };
  B.진짜글자 = (v) => box.App.Utils.formatCurrencyPlain(v);
  return B;
}

/* 색 목록에 있는 색만 씁니다(정의 등록이 색 검사를 합니다) */
let 씨앗 = 0;
function 시험정의(K, over) {
  const 색 = K.LINE_COLORS[6].hex;
  return Object.assign(
    {
      id: "t-" + ++씨앗,
      name: "시험",
      pane: "sub",
      params: { p: 5 },
      inputs: [{ key: "p", label: "기간", min: 1, max: 100 }],
      outputs: [{ key: "v", kind: "line", color: 색, style: "solid" }],
      seed: function (bs, prm, cap) {
        const out = [];
        for (let i = 0; i < bs.close.length; i++) out.push({ time: bs.time[i], value: 40 + (i % 20) });
        cap.state = {}; /* 확정 상태 — 이게 없으면 틀이 틱을 건너뜁니다 */
        return { v: out };
      },
      step: function (st) {
        return { values: { v: 55.5 }, state: st || {} };
      },
    },
    over || {}
  );
}

/* =======================================================================
 * [1] ① 눈금 고정 — scale: { min, max, top, bottom }
 * ===================================================================== */
console.log("\n[1] 눈금 고정 (scale)");
{
  const B = boot(makeCandles(200));
  const K = B.K;

  /* 잘못 적은 것은 ★거부★ 합니다. 조용히 무시하면 "적었는데 안 먹는" 고장이 됩니다 */
  const n0 = B.warns.length;
  ok("scale 이 객체가 아니면 거부", K.define(시험정의(K, { scale: 5 })) === false);
  ok("min 만 적으면 거부 (min · max 는 짝)", K.define(시험정의(K, { scale: { min: 0 } })) === false);
  ok("max 가 min 보다 작으면 거부", K.define(시험정의(K, { scale: { min: 100, max: 0 } })) === false);
  ok("여백이 0.45 를 넘으면 거부", K.define(시험정의(K, { scale: { top: 0.6 } })) === false);
  ok(
    "★주 칸(main)에는 못 씁니다★ (캔들이 사라집니다)",
    K.define(시험정의(K, { pane: "main", scale: { min: 0, max: 100 } })) === false
  );
  ok("거부할 때마다 콘솔에 이유를 남긴다", B.warns.length - n0 >= 5, "경고 " + (B.warns.length - n0) + "건");

  /* 제대로 적은 것은 받고, ★실제로 걸립니다★ */
  const def = 시험정의(K, { scale: { min: 0, max: 100, top: 0.12, bottom: 0.12 } });
  ok("제대로 적으면 등록된다", K.define(def) === true);
  const 목록 = K.listDefs().filter((d) => d.id === def.id)[0];
  ok(
    "listDefs 가 scale 을 그대로 내준다",
    !!목록 && 목록.scale && 목록.scale.min === 0 && 목록.scale.max === 100 && 목록.scale.top === 0.12,
    JSON.stringify(목록 && 목록.scale)
  );

  /* 눈금 여백은 시리즈의 priceScale 로 겁니다 — 가짜 시리즈에 그 손잡이를 답니다 */
  const 원래 = B.chart.addSeries.bind(B.chart);
  B.chart.addSeries = function (d, o, i) {
    const s = 원래(d, o, i);
    s._scale = {};
    s.priceScale = () => ({ applyOptions: (x) => Object.assign(s._scale, x) });
    return s;
  };

  const id = K.createInstance(def.id, { on: true });
  const it = K.getInstancesForTest()[id];
  const 시리즈 = it.live.series.v;
  const prov = 시리즈.options().autoscaleInfoProvider;

  ok("아래 칸 시리즈에 autoscaleInfoProvider 가 걸린다", typeof prov === "function", typeof prov);
  const r = prov ? prov(() => ({ priceRange: { minValue: 41, maxValue: 59 } })) : null;
  ok(
    "★데이터와 상관없이 늘 0~100 을 돌려준다★",
    !!r && r.priceRange.minValue === 0 && r.priceRange.maxValue === 100,
    JSON.stringify(r)
  );
  ok(
    "칸 위·아래 여백이 실제로 걸린다",
    시리즈._scale &&
      시리즈._scale.scaleMargins &&
      시리즈._scale.scaleMargins.top === 0.12 &&
      시리즈._scale.scaleMargins.bottom === 0.12,
    JSON.stringify(시리즈._scale)
  );

  /* scale 을 안 적은 지표는 ★그대로★ — 지금 배포된 일곱 개가 안 바뀌어야 합니다 */
  const def2 = 시험정의(K);
  K.define(def2);
  const id2 = K.createInstance(def2.id, { on: true });
  const s2 = K.getInstancesForTest()[id2].live.series.v;
  ok(
    "scale 을 안 적은 지표는 눈금을 안 건드린다 (기존 7개 보호)",
    s2.options().autoscaleInfoProvider === undefined,
    String(s2.options().autoscaleInfoProvider)
  );
}

/* =======================================================================
 * [2] ② 칸 이름표 — 이름 + ★지금 값★
 * ===================================================================== */
console.log("\n[2] 칸 이름표 (값이 같이 뜨는 줄)");
{
  const 봉 = makeCandles(200);
  const B = 화면얹기(boot(봉));
  const K = B.K;

  const def = 시험정의(K, {
    nameOf: (prm) => "시험(" + prm.p + ")",
    scale: { min: 0, max: 100 },
  });
  K.define(def);

  ok("켜기 전에는 이름표가 0개다", 이름표들(B).length === 0, String(이름표들(B).length));

  const id = K.createInstance(def.id, { on: true });
  B.칸줄맞추기();
  K.repositionPaneLabelsForTest();

  const 표 = 이름표들(B);
  ok("아래 칸 지표를 켜면 이름표가 1개 생긴다", 표.length === 1, String(표.length));

  const L = K.getPaneLabelsForTest();
  ok("이름표에 ★지표 이름★ 이 적힌다", L.length === 1 && L[0].name === "시험(5)", JSON.stringify(L));
  ok(
    "★지금 값이 같이 뜬다★ (선만 뜨고 값이 없던 것)",
    L.length === 1 && /\d/.test(L[0].values.v) && L[0].values.v !== "-",
    JSON.stringify(L[0] && L[0].values)
  );

  /* 자리 — 그 칸의 위끝에 붙어야 합니다. 주 칸(400) 아래이므로 400 + 2 */
  ok(
    "★그 칸의 왼쪽 위★ 에 붙는다 (주 칸 아래 " + 주칸높이 + "px 지점)",
    L[0].top === 주칸높이 + 2 + "px",
    L[0].top
  );

  /* 값이 실시간으로 바뀝니다 */
  const 마지막 = 봉[봉.length - 1];
  B.틱({
    time: 마지막.time,
    open: 마지막.open,
    high: 마지막.high,
    low: 마지막.low,
    close: 마지막.close + 10,
    volume: 5,
  });
  K.paintPaneLabelsForTest(true);
  ok(
    "틱이 오면 이름표 값이 갱신된다 (step 이 준 55.5)",
    K.getPaneLabelsForTest()[0].values.v === "55.50",
    K.getPaneLabelsForTest()[0].values.v
  );

  /* 이름이 바뀌면 이름표도 바뀝니다 */
  K.updateInstance(id, { params: { p: 9 } });
  B.칸줄맞추기();
  ok(
    "기간을 바꾸면 이름표 이름도 바뀐다",
    K.getPaneLabelsForTest()[0].name === "시험(9)",
    K.getPaneLabelsForTest()[0].name
  );

  /* 둘째 칸 — 자리가 아래로 내려갑니다 */
  const def2 = 시험정의(K, { nameOf: () => "둘째" });
  K.define(def2);
  const id2 = K.createInstance(def2.id, { on: true });
  B.칸줄맞추기();
  K.repositionPaneLabelsForTest();
  const L2 = K.getPaneLabelsForTest();
  ok("칸이 둘이면 이름표도 둘", L2.length === 2, String(L2.length));
  const 아래 = L2.filter((x) => x.id === id2)[0];
  ok(
    "둘째 칸 이름표는 ★둘째 칸 위끝★ 에 붙는다",
    아래 && 아래.top === 주칸높이 + 칸높이 + 2 + "px",
    아래 && 아래.top
  );

  /* ⭐ 끄면 반드시 사라져야 합니다 — 남으면 "끈 지표의 이름표만 허공에" 입니다 */
  K.setOn(id2, false);
  B.칸줄맞추기();
  ok("★끄면 그 이름표가 사라진다★", K.getPaneLabelsForTest().length === 1, JSON.stringify(K.getPaneLabelsForTest()));
  ok("★화면에서도 실제로 빠진다★ (DOM 에 남지 않는다)", 이름표들(B).length === 1, String(이름표들(B).length));

  K.setOn(id, false);
  ok("전부 끄면 이름표가 0개", 이름표들(B).length === 0, String(이름표들(B).length));
  ok("전부 끄면 틀이 세는 이름표도 0개", K.getPaneLabelsForTest().length === 0);

  /* 주 칸 지표에는 안 붙습니다 — 거기는 칩 줄과 OHLC 범례 자리입니다 */
  const def3 = 시험정의(K, { pane: "main" });
  K.define(def3);
  K.createInstance(def3.id, { on: true });
  ok("주 칸(main) 지표에는 칸 이름표를 안 붙인다", 이름표들(B).length === 0, String(이름표들(B).length));
}

/* =======================================================================
 * [3] ③ ⭐ 표시 통화 — 값이 가격인 지표(unit:"price")
 *     여기가 이번 단계에서 제일 위험한 곳입니다.
 * ===================================================================== */
console.log('\n[3] 표시 통화 (unit:"price")');
{
  const B = 통화붙이기(화면얹기(boot(makeCandles(200))));
  const K = B.K;

  ok("모르는 단위는 거부", K.define(시험정의(K, { unit: "banana" })) === false);
  ok(
    "주 칸에는 unit 을 못 쓴다 (가격축은 js/chart.js 가 이미 함)",
    K.define(시험정의(K, { pane: "main", unit: "price" })) === false
  );

  const def = 시험정의(K, { unit: "price", nameOf: () => "가격지표" });
  ok('unit:"price" 는 등록된다', K.define(def) === true);
  ok("listDefs 가 unit 을 내준다", K.listDefs().filter((d) => d.id === def.id)[0].unit === "price");

  const id = K.createInstance(def.id, { on: true });
  const 시리즈 = K.getInstancesForTest()[id].live.series.v;

  ok(
    "눈금 글자 만들기가 시리즈에 걸린다",
    !!시리즈.options().priceFormat && typeof 시리즈.options().priceFormat.formatter === "function"
  );

  /* USDT 일 때 */
  ok(
    "USDT 일 때는 USDT 숫자 그대로",
    시리즈.options().priceFormat.formatter(1234.5) === B.진짜글자(1234.5),
    시리즈.options().priceFormat.formatter(1234.5) + " vs " + B.진짜글자(1234.5)
  );

  const 지금값 = K.getInstancesForTest()[id].live.vals.v;
  const 라벨0 = K.getPaneLabelsForTest()[0].values.v;
  ok(
    "칸 이름표도 눈금과 ★같은 글자 만들기★ 를 쓴다 (두 벌 금지)",
    라벨0 === B.진짜글자(지금값),
    라벨0 + " vs " + B.진짜글자(지금값)
  );

  /* ⭐⭐ 원화로 바꾸면 — 여기가 빠지면 조용히 USDT 숫자로 남습니다 */
  B.통화("KRW");
  const f2 = 시리즈.options().priceFormat;
  ok(
    "★원화로 바꾸면 눈금 글자가 원화로 바뀐다★",
    f2.formatter(1234.5) === B.진짜글자(1234.5),
    f2.formatter(1234.5) + " vs " + B.진짜글자(1234.5)
  );
  ok("원화 글자가 실제로 달라진다 (안 바뀌면 조용한 고장)", f2.formatter(1234.5) !== "1,234.50", f2.formatter(1234.5));
  ok("원화일 때 최소단위(minMove)가 1 이다 (원 단위)", f2.minMove === 1, String(f2.minMove));

  const 라벨1 = K.getPaneLabelsForTest()[0].values.v;
  ok("★칸 이름표도 그 자리에서 원화로 바뀐다★", 라벨1 === B.진짜글자(지금값), 라벨1 + " vs " + B.진짜글자(지금값));
  ok("이름표 글자가 실제로 달라진다", 라벨1 !== 라벨0, 라벨0 + " → " + 라벨1);

  /* 데이터는 한 점도 안 바뀝니다 — 보이는 글자만 바뀝니다 */
  const 점 = 시리즈.data();
  ok(
    "★그린 값(데이터)은 한 점도 안 바뀐다★ — 글자만 바꿉니다",
    점.length > 0 && 점.every((d) => d.value === undefined || d.value < 1000),
    "첫 점 " + JSON.stringify(점[0])
  );

  /* 다시 USDT 로 */
  B.통화("USDT");
  ok("USDT 로 되돌리면 글자도 되돌아온다", 시리즈.options().priceFormat.formatter(1234.5) === B.진짜글자(1234.5));

  /* unit 을 안 적은 지표는 통화를 안 따라갑니다 (RSI · CCI 같은 지수) */
  const def2 = 시험정의(K, { nameOf: () => "지수지표" });
  K.define(def2);
  const id2 = K.createInstance(def2.id, { on: true });
  const s2 = K.getInstancesForTest()[id2].live.series.v;
  ok(
    "unit 을 안 적으면 눈금 글자를 안 건드린다 (RSI · CCI · OBV)",
    s2.options().priceFormat === undefined,
    JSON.stringify(s2.options().priceFormat)
  );
  B.통화("KRW");
  ok(
    "★통화를 바꿔도 지수 지표는 그대로다★ (OBV 가 원화로 환산되면 안 됩니다)",
    s2.options().priceFormat === undefined,
    JSON.stringify(s2.options().priceFormat)
  );
  const 지수값 = K.getInstancesForTest()[id2].live.vals.v;
  ok(
    "지수 지표의 이름표는 ★소수 두 자리 그대로★ (통화 기호가 안 붙는다)",
    K.getPaneLabelsForTest().filter((x) => x.id === id2)[0].values.v === 지수값.toFixed(2),
    K.getPaneLabelsForTest().filter((x) => x.id === id2)[0].values.v + " vs " + 지수값.toFixed(2)
  );
}

/* =======================================================================
 * [4] ⭐ ATR 은 ★가격★ 이다 — 배포돼 있던 조용한 고장
 * ===================================================================== */
console.log("\n[4] ATR — 원화 회원 화면에 USDT 숫자로 떠 있던 것");
{
  const B = 통화붙이기(화면얹기(boot(makeCandles(300))));
  const K = B.K;

  const atr = K.listDefs().filter((d) => d.id === "atr")[0];
  ok("ATR 정의가 있다", !!atr);
  ok(
    '★ATR 은 unit:"price" 다★ (ATR 120.45 는 120.45 USDT 라는 뜻)',
    !!atr && atr.unit === "price",
    atr && String(atr.unit)
  );

  const id = K.createInstance("atr", { on: true });
  const s = K.getInstancesForTest()[id].live.series.atr;
  ok("ATR 을 켜면 눈금 글자 만들기가 걸려 있다", !!s.options().priceFormat);

  B.통화("KRW");
  ok(
    "★원화로 보면 ATR 눈금도 원화★",
    s.options().priceFormat.formatter(120.45) === B.진짜글자(120.45),
    s.options().priceFormat.formatter(120.45)
  );
  const 라벨 = K.getPaneLabelsForTest().filter((x) => x.id === id)[0];
  ok("★원화로 보면 ATR 이름표도 원화★", !!라벨 && 라벨.values.atr.indexOf("₩") === 0, 라벨 && 라벨.values.atr);

  /* 값 자체는 안 바뀝니다 — 계산식을 건드리지 않았다는 증거 */
  const 점 = s.data();
  B.통화("USDT");
  const 점2 = s.data();
  ok("통화를 두 번 바꿔도 그린 값은 똑같다", JSON.stringify(점) === JSON.stringify(점2));

  /* ⚠️ 통화를 따라가면 안 되는 것 — OBV 는 거래량입니다 */
  const obv = K.listDefs().filter((d) => d.id === "obv")[0];
  ok("★OBV 는 unit 이 없다★ (거래량을 원화로 환산하면 뜻이 없습니다)", !!obv && !obv.unit, obv && String(obv.unit));
  const 지수들 = ["kdj", "srsi", "cci", "stoch", "dmi"];
  지수들.forEach((k) => {
    const d = K.listDefs().filter((x) => x.id === k)[0];
    ok(k + " 는 unit 이 없다 (0~100 · 지수)", !!d && !d.unit, d && String(d.unit));
  });
}

/* =======================================================================
 * [5] 성능 — 이름표가 계산을 늘리지 않는다
 * ===================================================================== */
console.log("\n[5] 성능 — 이름표가 계산을 늘리지 않는다");
{
  const 봉 = makeCandles(1000);
  const B = 화면얹기(boot(봉));
  const K = B.K;
  const def = 시험정의(K, { nameOf: () => "성능" });
  K.define(def);

  /* 꺼져 있으면 이름표도 없고 계산도 없습니다 */
  const id = K.createInstance(def.id, { on: false });
  K.resetPerf();
  const 마지막 = 봉[봉.length - 1];
  for (let i = 0; i < 50; i++) {
    B.틱({
      time: 마지막.time,
      open: 마지막.open,
      high: 마지막.high,
      low: 마지막.low,
      close: 마지막.close + i,
      volume: 1,
    });
  }
  ok("★꺼져 있으면 틱이 와도 아무 일도 안 한다★", K.getPerf().ticks === 0, String(K.getPerf().ticks));
  ok("꺼져 있으면 이름표도 없다", 이름표들(B).length === 0, String(이름표들(B).length));

  /* 켜면 — 틱 한 번에 이름표까지 포함해도 마지막 봉 하나만 만집니다 */
  K.setOn(id, true);
  B.칸줄맞추기();
  const 점수0 = K.getInstancesForTest()[id].live.series.v.data().length;
  K.resetPerf();
  for (let i = 0; i < 200; i++) {
    B.틱({
      time: 마지막.time,
      open: 마지막.open,
      high: 마지막.high,
      low: 마지막.low,
      close: 마지막.close + i,
      volume: 1,
    });
  }
  const 점수1 = K.getInstancesForTest()[id].live.series.v.data().length;
  ok("틱 200번에도 ★점 개수가 안 늘어난다★ (마지막 봉만 갱신)", 점수0 === 점수1, 점수0 + " → " + 점수1);
  /* ⚠️ getPerf().ticks 는 여기서 안 씁니다 — 가짜 화면의 performance.now() 가
     늘 0 이라 틀이 시간을 안 재고, 그래서 횟수도 안 셉니다(틀의 원래 동작).
     대신 ★마지막 봉이 실제로 갱신됐는지★ 로 확인합니다. */
  const 끝점 = K.getInstancesForTest()[id].live.series.v.data().slice(-1)[0];
  ok("마지막 봉이 실제로 갱신됐다 (step 이 준 55.5)", !!끝점 && 끝점.value === 55.5, JSON.stringify(끝점));
  ok("이름표는 여전히 1개 (틱마다 새로 만들지 않는다)", 이름표들(B).length === 1, String(이름표들(B).length));
}

/* =======================================================================
 * [6] 등록 — tests/_order.txt
 * ===================================================================== */
console.log("\n[6] 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", order.indexOf("tests/chart-indicator-pane-kit.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록");
  실패목록.forEach((s) => console.log("  · " + s));
  console.log("전체 실패 ❌\n");
  process.exit(1);
}
console.log("전체 통과 ✅\n");
