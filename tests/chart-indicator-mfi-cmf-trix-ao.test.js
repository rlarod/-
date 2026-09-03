/* tests/chart-indicator-mfi-cmf-trix-ao.test.js
 * =========================================================================
 * 봉인 — MFI · CMF · TRIX · AO 넷의 ★계산 · 거래량 · 단위 · 눈금★
 * =========================================================================
 * 2026-09-03 차트팀. 오늘 얹은 지표 넷입니다(js/chart-indicator-kit.js 의
 * "mfi" · "cmf" · "trix" · "ao").
 *
 * ── 왜 따로 두는가 — 이 넷에만 있는 세 개의 구멍 ────────────────────────
 *
 *   ⚠️ 구멍 1 — ★거래량이 0 이면 MFI · CMF 는 평평한 선이 됩니다★
 *      오류도 경고도 안 나고 화면도 멀쩡합니다. 회원은 "요즘 자금이 잠잠하네"
 *      로 읽습니다. 이 프로젝트가 P1 로 부르는 「조용한 고장」 그대로입니다.
 *      착수 전 실측에서는 거래량이 진짜 왔습니다(1002봉 중 0 인 봉 0개)만,
 *      chart.js 의 거래량 시리즈를 못 찾거나 시각이 어긋나면 언제든 0 이
 *      됩니다. 그래서 ★거래량을 0 으로 만들어 실제로 태워 봅니다.★
 *
 *   ⚠️ 구멍 2 — ★AO 만 값이 「가격」 입니다★
 *      PM 지시서에는 「넷 다 지수라 unit 을 붙이지 마라」 고 적혀 있었는데,
 *      AO = 중간값 단순평균(5) − 단순평균(34) 이라 MACD 와 뿌리가 같습니다.
 *      unit:"price" 를 빠뜨리면 원화로 보는 회원 화면에 USDT 숫자가 그대로
 *      뜹니다(2026-09-03 에 ATR 이 당한 그 고장). 여기서도 ★손으로 적지 않고
 *      봉 값을 10배로 올려 재서★ 가릅니다.
 *
 *   ⚠️ 구멍 3 — ★TRIX 는 로그이고 10000 배입니다★
 *      트레이딩뷰 도움말은 "1 Period Percent Change" 라고만 적어 배수를
 *      알 수 없습니다. 실측(트레이딩뷰 범례 −2.54 · 눈금 −8~32)으로
 *      10000 배가 맞다고 정한 자리라, 누가 "percent 니까 100 배겠지" 로
 *      고치면 값이 100배 작아지는데 ★선 모양은 똑같습니다.★
 *      그래서 「로그를 쓰는가」 를 ★성질로★ 잽니다 — 봉 값을 10배로 올려도
 *      값이 안 변하면 로그입니다(상수가 차이에서 지워지므로).
 *
 * ── 숫자를 박지 않습니다 ────────────────────────────────────────────────
 *   기대값을 글자로 적어 두지 않고 ★참조식을 따로 짜서 매번 다시 계산★ 합니다.
 *   참조식은 정의 그대로 순진하게 씁니다 — 링버퍼(winPush)도 안 씁니다.
 *   틀은 그 링버퍼 때문에 O(1) 이고, 그 최적화가 값을 어긋나게 만드는지를
 *   여기서 봅니다(tests/chart-indicator-math.test.js · wr 과 같은 방식).
 *
 * ── 무엇을 보는가 ───────────────────────────────────────────────────────
 *   [1] seed 가 참조식과 같은가 (기간을 여러 개 바꿔 가며)
 *   [2] 첫 점이 몇 번째 봉인가 — MFI 는 p, CMF 는 p-1, TRIX 는 3p-2, AO 는 slow-1
 *   [3] 진행 중인 봉으로 step 을 5번 불러도 값이 안 흔들리는가
 *       (★링버퍼를 그 자리에서 고쳐 쓰는 구조라 여기가 제일 위험합니다★)
 *   [4] ⭐ 거래량 0 — MFI · CMF 가 평평한 선을 안 그리고 ★비운다★
 *   [5] ⭐ 봉 값 10배 — AO 만 10배(가격) · 나머지 셋은 1배(지수)
 *   [6] 값이 정의된 범위 밖으로 안 나가는가 · NaN · Infinity 0건
 *   [7] 정의 약속 — 칸 · unit · 눈금 · 기준선 · 색이 LINE_COLORS 안
 *   [8] 돌연변이 자체검증 — 위 검사가 진짜 무는가
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const { boot, makeCandles } = require("./_kit-harness.js");

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
    실패목록.push(name + "  →  " + (detail || ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function 절(t) { console.log("\n" + t); }

console.log("\nMFI · CMF · TRIX · AO 봉인");

const 허용 = 1e-8;
const CS = makeCandles(400);

/* =====================================================================
 * 참조식 — 정의 그대로. 창을 매번 처음부터 훑습니다.
 * ===================================================================== */

/** MFI = 100 - 100/(1 + 양/음).  대표가격 hlc3 · 원자금흐름 = 대표가격×거래량 */
function 참조MFI(cs, p) {
  const tp = cs.map((b) => (b.high + b.low + b.close) / 3);
  const out = [];
  for (let i = p; i < cs.length; i++) {
    let pos = 0;
    let neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const rmf = tp[j] * cs[j].value;
      if (tp[j] > tp[j - 1]) pos += rmf;
      else if (tp[j] < tp[j - 1]) neg += rmf;
    }
    let v = null;
    if (neg > 0) v = 100 - 100 / (1 + pos / neg);
    else if (pos > 0) v = 100;
    if (v !== null) out.push({ time: cs[i].time, value: v });
  }
  return out;
}

/** CMF = p봉 자금흐름량 합 / p봉 거래량 합 */
function 참조CMF(cs, p) {
  const out = [];
  for (let i = p - 1; i < cs.length; i++) {
    let m = 0;
    let v = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const rng = cs[j].high - cs[j].low;
      const mm = rng > 0 ? (cs[j].close - cs[j].low - (cs[j].high - cs[j].close)) / rng : 0;
      m += mm * cs[j].value;
      v += cs[j].value;
    }
    if (v > 0) out.push({ time: cs[i].time, value: m / v });
  }
  return out;
}

/** TRIX = 10000 × (로그종가 삼중 EMA 의 한 봉 차이).  EMA 는 앞 p개 단순평균으로 시작 */
function 참조TRIX(cs, p) {
  const n = cs.length;
  const lg = cs.map((b) => Math.log(b.close));
  const ema = (a, start) => {
    const k = 2 / (p + 1);
    const o = new Array(n);
    let s = 0;
    for (let i = start; i < start + p; i++) s += a[i];
    let e = s / p;
    o[start + p - 1] = e;
    for (let i = start + p; i < n; i++) {
      e = (a[i] - e) * k + e;
      o[i] = e;
    }
    return o;
  };
  if (n < 3 * p - 1) return [];
  const A = ema(lg, 0);
  const B = ema(A, p - 1);
  const C = ema(B, 2 * p - 2);
  const out = [];
  for (let i = 3 * p - 2; i < n; i++) out.push({ time: cs[i].time, value: 10000 * (C[i] - C[i - 1]) });
  return out;
}

/** AO = 중간값(hl2) 의 단순평균(fast) − 단순평균(slow) */
function 참조AO(cs, f, s) {
  const hl = cs.map((b) => (b.high + b.low) / 2);
  const sma = (p, i) => {
    let t = 0;
    for (let j = i - p + 1; j <= i; j++) t += hl[j];
    return t / p;
  };
  const need = Math.max(f, s);
  const out = [];
  for (let i = need - 1; i < cs.length; i++) out.push({ time: cs[i].time, value: sma(f, i) - sma(s, i) });
  return out;
}

/** 정의 하나를 켜서 그린 점을 돌려줍니다 */
function 그린다(cs, id, params, key) {
  const B = boot(cs);
  const iid = B.K.createInstance(id, Object.assign({ on: true }, params || {}));
  const g = B.그린값(iid) || {};
  return { B, iid, pts: g[key] || [], K: B.K };
}

function 최대오차(우리, 참조) {
  const map = {};
  참조.forEach((x) => { map[x.time] = x.value; });
  let d = 0;
  let 겹침 = 0;
  우리.forEach((p) => {
    if (map[p.time] === undefined) return;
    겹침++;
    const e = Math.abs(p.value - map[p.time]);
    if (e > d) d = e;
  });
  return { 오차: d, 겹침 };
}

/* =====================================================================
 * [1] 계산 — 참조식과 같은가
 * ===================================================================== */
절("[1] 계산 — 순진한 참조식과 값이 같다 (링버퍼가 값을 안 바꿨다)");

[2, 3, 14, 30].forEach((p) => {
  const r = 그린다(CS, "mfi", { params: { p } }, "mfi");
  const ref = 참조MFI(CS, p);
  const m = 최대오차(r.pts, ref);
  ok("MFI(" + p + ") 점 " + r.pts.length + "개 · 참조 " + ref.length + "개 · 최대오차 " + m.오차.toExponential(2),
    r.pts.length === ref.length && m.겹침 === ref.length && m.오차 < 허용,
    "우리 " + r.pts.length + " / 참조 " + ref.length + " / 겹침 " + m.겹침 + " / 오차 " + m.오차);
});

[2, 5, 20, 50].forEach((p) => {
  const r = 그린다(CS, "cmf", { params: { p } }, "cmf");
  const ref = 참조CMF(CS, p);
  const m = 최대오차(r.pts, ref);
  ok("CMF(" + p + ") 점 " + r.pts.length + "개 · 참조 " + ref.length + "개 · 최대오차 " + m.오차.toExponential(2),
    r.pts.length === ref.length && m.겹침 === ref.length && m.오차 < 허용,
    "우리 " + r.pts.length + " / 참조 " + ref.length + " / 겹침 " + m.겹침 + " / 오차 " + m.오차);
});

[2, 5, 18, 40].forEach((p) => {
  const r = 그린다(CS, "trix", { params: { p } }, "trix");
  const ref = 참조TRIX(CS, p);
  const m = 최대오차(r.pts, ref);
  /* TRIX 는 EMA 를 세 번 겹쳐서 부동소수점 오차가 조금 더 큽니다 (값이 ±30 자리) */
  ok("TRIX(" + p + ") 점 " + r.pts.length + "개 · 참조 " + ref.length + "개 · 최대오차 " + m.오차.toExponential(2),
    r.pts.length === ref.length && m.겹침 === ref.length && m.오차 < 1e-6,
    "우리 " + r.pts.length + " / 참조 " + ref.length + " / 겹침 " + m.겹침 + " / 오차 " + m.오차);
});

[[5, 34], [3, 10], [1, 2], [20, 60]].forEach((fs) => {
  const r = 그린다(CS, "ao", { params: { fast: fs[0], slow: fs[1] } }, "ao");
  const ref = 참조AO(CS, fs[0], fs[1]);
  const m = 최대오차(r.pts, ref);
  ok("AO(" + fs[0] + "," + fs[1] + ") 점 " + r.pts.length + "개 · 참조 " + ref.length + "개 · 최대오차 " + m.오차.toExponential(2),
    r.pts.length === ref.length && m.겹침 === ref.length && m.오차 < 1e-6,
    "우리 " + r.pts.length + " / 참조 " + ref.length + " / 겹침 " + m.겹침 + " / 오차 " + m.오차);
});

/* =====================================================================
 * [2] 첫 점이 몇 번째 봉인가
 *     ⚠️ 넷이 다 다릅니다. 한 봉 어긋나도 선 모양이 똑같아 눈으로는 못 잡습니다.
 * ===================================================================== */
절("[2] 첫 점 자리 — 넷이 서로 다르다 (한 봉 어긋나도 눈으로는 못 잡습니다)");

function 첫점index(cs, pts) {
  if (!pts.length) return -1;
  for (let i = 0; i < cs.length; i++) if (cs[i].time === pts[0].time) return i;
  return -1;
}
{
  const 표 = [
    ["MFI(14)", 그린다(CS, "mfi", { params: { p: 14 } }, "mfi").pts, 14, "앞 봉과의 차이가 p개 필요"],
    ["CMF(20)", 그린다(CS, "cmf", { params: { p: 20 } }, "cmf").pts, 19, "봉 자체가 p개면 됨 (차이를 안 씀)"],
    ["TRIX(18)", 그린다(CS, "trix", { params: { p: 18 } }, "trix").pts, 3 * 18 - 2, "EMA 세 겹 + 한 봉 차이"],
    ["AO(5,34)", 그린다(CS, "ao", {}, "ao").pts, 33, "느린 평균(34)이 다 차야 함"]
  ];
  표.forEach((row) => {
    const got = 첫점index(CS, row[1]);
    ok(row[0] + " 의 첫 점은 " + row[2] + "번째 봉이다 (" + row[3] + ")",
      got === row[2], "지금 " + got + "번째");
  });
}

/* =====================================================================
 * [3] 진행 중인 봉 — 같은 봉을 5번 흘려도 값이 안 흔들린다
 *     ⚠️ 넷 중 셋이 링버퍼를 ★그 자리에서 고쳐 씁니다.★ 여기가 제일 위험합니다.
 * ===================================================================== */
절("[3] 진행 중인 봉을 5번 흘려보내도 값이 안 흔들린다");

[["mfi", "mfi"], ["cmf", "cmf"], ["trix", "trix"], ["ao", "ao"]].forEach((x) => {
  const r = 그린다(CS, x[0], {}, x[1]);
  const 끝 = CS[CS.length - 1];
  const 값 = [];
  for (let i = 0; i < 5; i++) {
    r.B.틱({ time: 끝.time, open: 끝.open, high: 끝.high, low: 끝.low, close: 끝.close, volume: 끝.value });
    const g = r.B.그린값(r.iid) || {};
    const arr = g[x[1]] || [];
    값.push(arr.length ? arr[arr.length - 1].value : null);
  }
  const 흔들림 = Math.max.apply(null, 값) - Math.min.apply(null, 값);
  ok("[" + x[0] + "] 같은 봉 5번 — 흔들림 " + 흔들림.toExponential(2) + " (값 " + 값[0] + ")",
    값.every((v) => typeof v === "number" && isFinite(v)) && 흔들림 === 0,
    "값들: " + 값.join(" ") + "  ★링버퍼를 두 번 밀었을 수 있습니다★");

  /* 점 개수도 안 늘어야 합니다 — 마지막 봉만 갱신입니다 */
  const 뒤 = (r.B.그린값(r.iid) || {})[x[1]] || [];
  ok("[" + x[0] + "] 틱 5번에도 점 개수가 안 늘었다 (" + r.pts.length + " → " + 뒤.length + ")",
    뒤.length === r.pts.length, r.pts.length + " → " + 뒤.length);
});

/* =====================================================================
 * [4] ⭐ 거래량 0 — MFI · CMF 가 「평평한 선」 을 안 그린다
 * ===================================================================== */
절("[4] ⭐ 거래량이 0 이면 MFI · CMF 는 ★안 그린다★ (조용한 고장 막기)");

{
  const 무거래량 = CS.map((c) => Object.assign({}, c, { value: 0 }));

  ["mfi", "cmf"].forEach((id) => {
    const r = 그린다(무거래량, id, {}, id);
    ok("[" + id + "] 거래량이 전부 0 이면 점을 하나도 안 그린다 (지금 " + r.pts.length + "개)",
      r.pts.length === 0,
      "평평한 선을 그리면 회원이 그걸 사실로 믿습니다");
    const 알림 = r.B.warns.filter((w) => /거래량/.test(w));
    ok("[" + id + "] 그 사실을 콘솔에 알린다 (경고 " + 알림.length + "건)",
      알림.length >= 1, r.B.warns.join(" | ") || "경고가 하나도 없습니다");
  });

  /* 거래량을 안 쓰는 둘은 ★그대로 그려야★ 합니다 — 안전장치가 번지면 안 됩니다 */
  ["trix", "ao"].forEach((id) => {
    const r = 그린다(무거래량, id, {}, id);
    ok("[" + id + "] 거래량과 무관하므로 거래량 0 에서도 그대로 그린다 (" + r.pts.length + "개)",
      r.pts.length > 0, "안전장치가 엉뚱한 지표까지 껐습니다");
  });
}

/* =====================================================================
 * [5] ⭐ 봉 값 10배 — AO 만 「가격」 이다
 *     ⚠️ 거래량은 그대로 둡니다. 안 그러면 MFI 가 「가격」 으로 잘못 갈립니다.
 * ===================================================================== */
절("[5] ⭐ 봉 값만 10배 — AO 만 10배(가격) · 셋은 1배(지수)");

{
  const 열배봉 = CS.map((c) => ({
    time: c.time, open: c.open * 10, high: c.high * 10, low: c.low * 10, close: c.close * 10, value: c.value
  }));
  const 기대 = { mfi: 1, cmf: 1, trix: 1, ao: 10 };
  Object.keys(기대).forEach((id) => {
    const a = 그린다(CS, id, {}, id).pts;
    const b = 그린다(열배봉, id, {}, id).pts;
    const x = a.length ? a[a.length - 1].value : NaN;
    const y = b.length ? b[b.length - 1].value : NaN;
    /* ⚠️ NaN 함정 — 값을 못 읽으면 비교가 조용히 거짓이 되어 「지수」 로 넘어갑니다 */
    ok("[" + id + "] 두 배수에서 값을 다 읽었다 (" + x + " / " + y + ")",
      isFinite(x) && isFinite(y) && Math.abs(x) > 1e-9,
      "못 읽으면 아래 판정이 통째로 헛것이 됩니다");
    const 비 = y / x;
    ok("[" + id + "] 비율이 " + 기대[id] + " 배다 (실측 " + 비.toFixed(4) + ")",
      Math.abs(비 - 기대[id]) < 0.02,
      "실측 " + 비 + "  → 10 이면 가격이라 unit 이 필요하고, 1 이면 붙이면 안 됩니다");
  });
}

/* =====================================================================
 * [6] 값이 정의된 범위를 안 벗어난다 · NaN · Infinity 0건
 * ===================================================================== */
절("[6] 값의 범위 · NaN · Infinity");

{
  function 모아보기(id) {
    const r = 그린다(CS, id, {}, id);
    const vs = r.pts.map((p) => p.value);
    return {
      n: vs.length,
      나쁨: vs.filter((v) => typeof v !== "number" || !isFinite(v)).length,
      lo: vs.length ? Math.min.apply(null, vs) : NaN,
      hi: vs.length ? Math.max.apply(null, vs) : NaN
    };
  }
  const M = 모아보기("mfi");
  ok("MFI 값이 0 ~ 100 안이다 (실측 " + M.lo.toFixed(2) + " ~ " + M.hi.toFixed(2) + ")",
    M.n > 0 && M.lo >= 0 && M.hi <= 100, JSON.stringify(M));
  const C = 모아보기("cmf");
  /* ⚠️ CMF 는 자르지 않습니다 - 창 합의 부동소수점 찌꺼기만큼(1e-9) 여유를 둡니다.
     MFI 는 눈금을 0~100 으로 고정해 놔서 음수가 화면에 뜨면 바로 보이기에 틀이 자릅니다. */
  ok("CMF 값이 -1 ~ 1 안이다 (실측 " + C.lo.toFixed(4) + " ~ " + C.hi.toFixed(4) + ")",
    C.n > 0 && C.lo >= -1 - 1e-9 && C.hi <= 1 + 1e-9, JSON.stringify(C));
  ["mfi", "cmf", "trix", "ao"].forEach((id) => {
    const x = 모아보기(id);
    ok("[" + id + "] NaN · Infinity 가 0건이다 (점 " + x.n + "개)", x.n > 0 && x.나쁨 === 0, JSON.stringify(x));
  });
}

/* =====================================================================
 * [7] 정의 약속 — 칸 · unit · 눈금 · 기준선 · 색
 * ===================================================================== */
절("[7] 정의 약속");

{
  const B = boot(CS);
  const K = B.K;
  const 색들 = (K.LINE_COLORS || []).map((c) => c.hex);
  const 정의 = {};
  K.listDefs().forEach((d) => { 정의[d.id] = d; });
  const defs = K.getDefsForTest();

  const 표 = [
    { id: "mfi", p: { p: 14 }, 이름: "MFI(14)", unit: null, 눈금: { min: 0, max: 100 }, 기준선: [80, 20], kind: "line" },
    { id: "cmf", p: { p: 20 }, 이름: "CMF(20)", unit: null, 눈금: "keepGuides", 기준선: [0], kind: "line" },
    { id: "trix", p: { p: 18 }, 이름: "TRIX(18)", unit: null, 눈금: "keepGuides", 기준선: [0], kind: "line" },
    { id: "ao", p: { fast: 5, slow: 34 }, 이름: "AO(5,34)", unit: "price", 눈금: "keepGuides", 기준선: [0], kind: "hist" }
  ];

  표.forEach((x) => {
    const d = 정의[x.id];
    ok("[" + x.id + "] 정의가 등록돼 있다", !!d, "define() 이 거부했을 수 있습니다");
    if (!d) return;

    ok("[" + x.id + "] 아래 칸(sub) 이다", d.pane === "sub", d.pane);

    /* ⭐ unit — 위 [5] 의 재기 결과와 ★같아야★ 합니다. 여기만 고치면 안 됩니다 */
    ok("[" + x.id + "] unit 이 " + (x.unit === null ? "없다" : x.unit) + " ([5] 의 재기와 같다)",
      (d.unit || null) === x.unit, "지금 " + d.unit);

    if (x.눈금 === "keepGuides") {
      ok("[" + x.id + "] 눈금을 고정하지 않고 keepGuides 를 건다 (범위가 정해진 지표가 아님)",
        !!d.scale && d.scale.keepGuides === true && d.scale.min === null, JSON.stringify(d.scale));
    } else {
      ok("[" + x.id + "] 눈금이 " + x.눈금.min + " ~ " + x.눈금.max + " 로 고정돼 있다",
        !!d.scale && d.scale.min === x.눈금.min && d.scale.max === x.눈금.max, JSON.stringify(d.scale));
      ok("[" + x.id + "] 기준선이 그 눈금 ★안★ 이다 (밖이면 영원히 안 보입니다)",
        (d.guides || []).every((g) => g.price >= d.scale.min && g.price <= d.scale.max),
        JSON.stringify(d.guides));
    }

    ok("[" + x.id + "] 기준선이 [" + x.기준선.join(" ") + "] 이다",
      (d.guides || []).map((g) => g.price).join(",") === x.기준선.join(","),
      JSON.stringify((d.guides || []).map((g) => g.price)));

    const outs = (defs[x.id] || {}).outputs || [];
    ok("[" + x.id + "] 그리는 것이 " + x.kind + " 하나다",
      outs.length === 1 && (outs[0].kind || "line") === x.kind,
      JSON.stringify(outs.map((o) => o.kind)));
    ok("[" + x.id + "] 색이 지표선 색 목록(LINE_COLORS) 안이다 — " + outs.map((o) => o.color).join(" "),
      outs.every((o) => 색들.indexOf(o.color) >= 0), outs.map((o) => o.color).join(" "));
    ok("[" + x.id + "] 상승 #26C281 · 하락 #F0506E 를 안 쓴다 (손익 색과 헷갈림)",
      outs.every((o) => o.color !== "#26C281" && o.color !== "#F0506E"), outs.map((o) => o.color).join(" "));

    /* ⚠️ nameOf 는 listDefs() 가 안 넘겨 줍니다(복사본이라서). 원본에서 읽습니다 */
    const 원본 = defs[x.id] || {};
    const nm = 원본.nameOf ? 원본.nameOf(Object.assign({}, d.params, x.p)) : d.name;
    ok("[" + x.id + "] 이름표가 " + x.이름 + " 로 뜬다", nm === x.이름, nm);
  });

  /* 기본값 — 트레이딩뷰 실측값입니다 (범례 "MFI 14" · "CMF 20" · "TRIX 18" · AO 5/34) */
  ok("MFI 기본 기간이 14 다 (트레이딩뷰 범례 실측)", 정의.mfi && 정의.mfi.params.p === 14, JSON.stringify(정의.mfi && 정의.mfi.params));
  ok("CMF 기본 기간이 20 이다 (트레이딩뷰 범례 실측 — 도움말의 21 이 아닙니다)",
    정의.cmf && 정의.cmf.params.p === 20, JSON.stringify(정의.cmf && 정의.cmf.params));
  ok("TRIX 기본 기간이 18 이다 (트레이딩뷰 범례 실측)", 정의.trix && 정의.trix.params.p === 18, JSON.stringify(정의.trix && 정의.trix.params));
  ok("AO 기본이 5 / 34 다 (트레이딩뷰 도움말 원문)",
    정의.ao && 정의.ao.params.fast === 5 && 정의.ao.params.slow === 34, JSON.stringify(정의.ao && 정의.ao.params));

  ok("넷을 등록하는 동안 경고가 하나도 안 났다", B.warns.length === 0, B.warns.slice(0, 3).join(" | "));

  /* 넷의 기본색이 서로 다르다 — 같은 색이면 칸을 오갈 때 구분이 안 됩니다 */
  const 넷색 = 표.map((x) => ((defs[x.id] || {}).outputs || [{}])[0].color);
  ok("넷의 기본색이 서로 다르다 (" + 넷색.join(" ") + ")",
    new Set(넷색).size === 4, 넷색.join(" "));
}

/* =====================================================================
 * [8] 돌연변이 자체검증 — 위 검사가 진짜 무는가
 * ===================================================================== */
절("[8] 돌연변이 — 이 파일이 진짜 잡는가");

{
  /* [1] 이 무는가 — 참조식을 한 봉 어긋나게 하면 빨개져야 합니다 */
  const 어긋난참조 = 참조MFI(CS, 14).slice(1);
  const 우리 = 그린다(CS, "mfi", { params: { p: 14 } }, "mfi").pts;
  ok("[1] 이 문다 — 참조식을 한 봉 밀면 개수가 달라진다",
    우리.length !== 어긋난참조.length, "밀어도 같으면 [1] 이 공짜로 통과합니다");

  /* [5] 가 무는가 — 지수 지표에 10 을 기대하면 틀려야 합니다 */
  const a = 그린다(CS, "trix", {}, "trix").pts;
  const b = 그린다(CS.map((c) => ({
    time: c.time, open: c.open * 10, high: c.high * 10, low: c.low * 10, close: c.close * 10, value: c.value
  })), "trix", {}, "trix").pts;
  const 비 = b[b.length - 1].value / a[a.length - 1].value;
  ok("[5] 가 문다 — TRIX 에 10배를 기대하면 실제(" + 비.toFixed(4) + ")와 어긋난다",
    Math.abs(비 - 10) > 0.02, "TRIX 가 10배로 나오면 로그를 안 쓰고 있는 것입니다");

  /* [4] 가 무는가 — 거래량을 살려 두면 MFI 가 그려져야 합니다 */
  const 살린것 = 그린다(CS, "mfi", {}, "mfi").pts;
  ok("[4] 가 문다 — 거래량이 있으면 MFI 가 실제로 그려진다 (" + 살린것.length + "개)",
    살린것.length > 0, "0 개면 [4] 의 「0개」 검사가 공짜로 통과합니다");

  /* [3] 이 무는가 — 값이 진짜로 바뀌는 봉을 넣으면 값이 달라져야 합니다 */
  const r = 그린다(CS, "cmf", {}, "cmf");
  const 끝 = CS[CS.length - 1];
  r.B.틱({ time: 끝.time, open: 끝.open, high: 끝.high * 1.05, low: 끝.low * 0.95, close: 끝.high * 1.05, volume: 끝.value });
  const v1 = (r.B.그린값(r.iid).cmf.slice(-1)[0] || {}).value;
  r.B.틱({ time: 끝.time, open: 끝.open, high: 끝.high * 1.05, low: 끝.low * 0.95, close: 끝.low * 0.95, volume: 끝.value });
  const v2 = (r.B.그린값(r.iid).cmf.slice(-1)[0] || {}).value;
  ok("[3] 이 문다 — 봉 내용이 바뀌면 값도 바뀐다 (" + v1.toFixed(6) + " → " + v2.toFixed(6) + ")",
    Math.abs(v1 - v2) > 1e-9, "안 바뀌면 step 이 봉을 안 읽고 있는 것입니다");
}

/* =====================================================================
 * [9] 등록
 * ===================================================================== */
절("[9] 등록");
{
  const fs = require("fs");
  const path = require("path");
  const 목록 = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    목록.indexOf("tests/chart-indicator-mfi-cmf-trix-ao.test.js") >= 0,
    "등록 안 하면 npm test 가 이 파일을 안 돕니다");
}

/* ===================================================================== */
/* ⚠️ 요약 줄은 반드시 이 형식이어야 합니다 — "통과 N / 실패 M".
   tests/_run-all.js 가 이 글자로 결과를 셉니다. */
console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
  process.exit(1);
}
process.exit(0);
