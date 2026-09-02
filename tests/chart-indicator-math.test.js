/* tests/chart-indicator-math.test.js
 * =========================================================================
 * 봉인 — 지표 6개의 ★계산이 맞는가★ (EMA · WMA · KDJ · ATR · StochRSI · CCI)
 * =========================================================================
 * 2026-09-02 기록팀. 하루에 지표가 6개 늘었습니다(커밋 9ce7f83 · 2a65991).
 *
 * ── ⚠️ 숫자를 박아 두지 않습니다 ────────────────────────────────────────
 *   "EMA(9) 의 300번째 값은 77123.45" 처럼 적으면, 값이 왜 그래야 하는지
 *   아무도 모르는 채로 굳습니다. 나중에 계산이 틀리게 바뀌어도 그 숫자만
 *   고치면 초록이 됩니다. ★아무것도 안 지키는 테스트★ 가 됩니다.
 *
 *   그래서 아래 참조식을 ★따로★ 짰습니다. 정의(공식) 그대로 순진하게 씁니다 —
 *   굴러가는 합도, 링버퍼도, "최고가 어느 칸인지" 도 안 씁니다.
 *   js/chart-indicator-kit.js 는 그 최적화 때문에 빠르고, ★그 최적화가
 *   값을 어긋나게 만드는지★ 를 보는 것이 이 파일입니다.
 *   (실제로 그런 적이 있습니다 — 아래 [5] CCI 반올림 참조)
 *
 * ── 무엇을 보는가 ───────────────────────────────────────────────────────
 *   [1] 켤 때 전체 계산(seed) 이 참조식과 같은가 — 여러 기간으로
 *   [2] 짧은 기간(1 · 2) 에서 0 으로 나누지 않는가 — NaN · ±Infinity 0건
 *   [3] 진행 중인 봉(step) 이 여러 번 들어와도 값이 안 흔들리는가
 *       ⚠️ 틀은 봉이 닫히기 전에 ★같은 상태로 step 을 여러 번★ 부릅니다.
 *          WMA · KDJ · StochRSI · CCI 는 버퍼를 그 자리에서 고쳐 쓰기 때문에
 *          "여러 번 불러도 답이 같다" 가 무너지면 값이 매 틱 조금씩 흘러갑니다.
 *          ★오류 0건 · 선은 그려짐 · 값만 틀림★ 인 조용한 고장입니다.
 *   [4] step 이 낸 값 == 그 봉까지 넣고 seed 를 다시 돌린 값
 *       ⭐ 참조식이 없어도 걸립니다. 그래서 ★앞으로 늘어날 지표에도 자동으로★
 *          걸립니다(지금은 OBV · SAR · VWAP 가 여기에 걸립니다).
 *   [5] ⭐ CCI 반올림 — 굴러가는 합으로 되돌아가면 여기서 터집니다
 *
 * ── ⚠️ 소스 글자나 줄 번호에 기대지 않습니다 ────────────────────────────
 *   차트팀이 지금 js/chart-indicator-kit.js 를 잡고 있습니다. 정의 목록도
 *   listDefs() 로 그때그때 셉니다 — 지표가 늘어도 이 파일은 안 고칩니다.
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
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}

console.log("\n지표 계산 봉인 (참조식과 대조)");

/* 허용 오차 — ★상대오차★ 로 봅니다.
   값이 77,000 대인 지표(EMA · WMA)는 절대오차 5.9e-8 이 나와도 상대로는
   7.6e-13 입니다. 반대로 CCI 는 값이 작아서 절대오차가 곧 상대오차입니다.
   2026-09-02 실측 최대 — WMA 7.6e-13 · StochRSI 1.8e-12 · CCI 9.6e-11.
   1e-9 는 그보다 10배 이상 넉넉하면서, 실제로 났던 CCI 사고(상대 4e-8)는
   그대로 잡습니다. */
const 허용 = 1e-9;

/* =======================================================================
 * 참조식 — 정의 그대로. 최적화를 하나도 안 씁니다.
 * ===================================================================== */
function 값뽑기(cs, key) {
  return cs.map(function (c) {
    if (!key || key === "close") return c.close;
    if (key === "open") return c.open;
    if (key === "high") return c.high;
    if (key === "low") return c.low;
    if (key === "hl2") return (c.high + c.low) / 2;
    if (key === "hlc3") return (c.high + c.low + c.close) / 3;
    if (key === "ohlc4") return (c.open + c.high + c.low + c.close) / 4;
    throw new Error("모르는 값 종류 " + key);
  });
}

/* EMA — 첫 값은 앞 p개의 단순평균, 그 뒤로 EMA(t)=값·k + EMA(t-1)·(1-k) */
function refEMA(cs, p, srcKey) {
  const src = 값뽑기(cs, srcKey);
  const n = src.length;
  const out = [];
  if (n < p) return out;
  const k = 2 / (p + 1);
  let sum = 0;
  for (let i = 0; i < p; i++) sum += src[i];
  let e = sum / p;
  out.push({ time: cs[p - 1].time, value: e });
  for (let i = p; i < n; i++) {
    e = src[i] * k + e * (1 - k);
    out.push({ time: cs[i].time, value: e });
  }
  return out;
}

/* WMA — 창을 매번 처음부터 다시 더합니다(굴러가는 합을 안 씁니다) */
function refWMA(cs, p, srcKey) {
  const src = 값뽑기(cs, srcKey);
  const n = src.length;
  const out = [];
  const den = (p * (p + 1)) / 2;
  for (let i = p - 1; i < n; i++) {
    let num = 0;
    for (let q = 0; q < p; q++) num += (q + 1) * src[i - p + 1 + q];
    out.push({ time: cs[i].time, value: num / den });
  }
  return out;
}

/* KDJ — 창의 최고 · 최저를 매번 처음부터 훑습니다(링버퍼를 안 씁니다).
   창은 p개(현재 봉 포함). K = ((k-1)·이전K + RSV)/k, 시작값 K=D=50 */
function refKDJ(cs, p, kp, dp) {
  const m = p - 1;
  const n = cs.length;
  const K = [];
  const D = [];
  const J = [];
  let k = 50;
  let d = 50;
  for (let i = m; i < n; i++) {
    let hh = -Infinity;
    let ll = Infinity;
    for (let q = i - m; q <= i; q++) {
      if (cs[q].high > hh) hh = cs[q].high;
      if (cs[q].low < ll) ll = cs[q].low;
    }
    const rsv = hh > ll ? ((cs[i].close - ll) / (hh - ll)) * 100 : 50;
    k = ((kp - 1) * k + rsv) / kp;
    d = ((dp - 1) * d + k) / dp;
    K.push({ time: cs[i].time, value: k });
    D.push({ time: cs[i].time, value: d });
    J.push({ time: cs[i].time, value: 3 * k - 2 * d });
  }
  return { k: K, d: D, j: J };
}

/* ATR — TR 의 와일더 평활(RMA). 첫 봉의 TR 은 고-저 만 */
function refATR(cs, p) {
  const n = cs.length;
  const out = [];
  if (n < p) return out;
  const tr = new Array(n);
  tr[0] = cs[0].high - cs[0].low;
  for (let i = 1; i < n; i++) {
    const pc = cs[i - 1].close;
    tr[i] = Math.max(cs[i].high - cs[i].low, Math.abs(cs[i].high - pc), Math.abs(cs[i].low - pc));
  }
  let sum = 0;
  for (let i = 0; i < p; i++) sum += tr[i];
  let a = sum / p;
  out.push({ time: cs[p - 1].time, value: a });
  for (let i = p; i < n; i++) {
    a = ((p - 1) * a + tr[i]) / p;
    out.push({ time: cs[i].time, value: a });
  }
  return out;
}

/* StochRSI — RSI → 스토캐스틱 → %K(단순평균) → %D(단순평균).
   창은 매번 처음부터 훑고, 평균도 매번 다시 더합니다. */
function refSRSI(cs, rp, sp, kp, dp) {
  const n = cs.length;
  const rsi = [];
  let ag = 0;
  let al = 0;
  for (let i = 1; i < n; i++) {
    const ch = cs[i].close - cs[i - 1].close;
    const up = ch > 0 ? ch : 0;
    const dn = ch < 0 ? -ch : 0;
    const m = i;
    if (m < rp) {
      ag += up;
      al += dn;
    } else if (m === rp) {
      ag = (ag + up) / rp;
      al = (al + dn) / rp;
    } else {
      ag = ((rp - 1) * ag + up) / rp;
      al = ((rp - 1) * al + dn) / rp;
    }
    if (m >= rp) {
      rsi.push({ i: i, v: al === 0 ? 100 : ag === 0 ? 0 : 100 - 100 / (1 + ag / al) });
    }
  }
  const stoch = [];
  for (let t = sp - 1; t < rsi.length; t++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let q = t - sp + 1; q <= t; q++) {
      if (rsi[q].v > hi) hi = rsi[q].v;
      if (rsi[q].v < lo) lo = rsi[q].v;
    }
    stoch.push({ i: rsi[t].i, v: hi > lo ? ((rsi[t].v - lo) / (hi - lo)) * 100 : 0 });
  }
  const kk = [];
  for (let t = kp - 1; t < stoch.length; t++) {
    let s = 0;
    for (let q = t - kp + 1; q <= t; q++) s += stoch[q].v;
    kk.push({ i: stoch[t].i, v: s / kp });
  }
  const K = [];
  const D = [];
  for (let t = dp - 1; t < kk.length; t++) {
    let s = 0;
    for (let q = t - dp + 1; q <= t; q++) s += kk[q].v;
    K.push({ time: cs[kk[t].i].time, value: kk[t].v });
    D.push({ time: cs[kk[t].i].time, value: s / dp });
  }
  return { k: K, d: D };
}

/* CCI = (TP - SMA) / (0.015 · 평균편차). 평균도 편차도 매번 창을 훑습니다 */
function refCCI(cs, p, srcKey) {
  const src = 값뽑기(cs, srcKey);
  const n = src.length;
  const out = [];
  for (let i = p - 1; i < n; i++) {
    let sum = 0;
    for (let q = i - p + 1; q <= i; q++) sum += src[q];
    const sma = sum / p;
    let md = 0;
    for (let q = i - p + 1; q <= i; q++) md += Math.abs(src[q] - sma);
    md /= p;
    out.push({ time: cs[i].time, value: md > 0 ? (src[i] - sma) / (0.015 * md) : 0 });
  }
  return out;
}

function ref(defId, cs, prm) {
  if (defId === "ema") return { ema: refEMA(cs, prm.p, "close") };
  if (defId === "wma") return { wma: refWMA(cs, prm.p, "close") };
  if (defId === "kdj") return refKDJ(cs, prm.p, prm.k, prm.d);
  if (defId === "atr") return { atr: refATR(cs, prm.p) };
  if (defId === "srsi") return refSRSI(cs, prm.rp, prm.sp, prm.k, prm.d);
  if (defId === "cci") return { cci: refCCI(cs, prm.p, "hlc3") };
  return null;
}

/* 참조식이 있는 지표와 기간들. ★짧은 기간(1 · 2)을 일부러 넣었습니다★ —
   0 으로 나누는 자리가 거기 있습니다(창 하나짜리 · 최고==최저). */
const 사례 = [
  ["ema", { p: 1 }], ["ema", { p: 2 }], ["ema", { p: 3 }], ["ema", { p: 9 }], ["ema", { p: 60 }],
  ["wma", { p: 1 }], ["wma", { p: 2 }], ["wma", { p: 9 }], ["wma", { p: 50 }],
  ["kdj", { p: 1, k: 1, d: 1 }], ["kdj", { p: 2, k: 1, d: 1 }], ["kdj", { p: 2, k: 2, d: 2 }],
  ["kdj", { p: 9, k: 3, d: 3 }], ["kdj", { p: 14, k: 3, d: 3 }],
  ["atr", { p: 1 }], ["atr", { p: 2 }], ["atr", { p: 14 }], ["atr", { p: 30 }],
  ["srsi", { rp: 1, sp: 1, k: 1, d: 1 }], ["srsi", { rp: 2, sp: 2, k: 1, d: 1 }],
  ["srsi", { rp: 2, sp: 2, k: 2, d: 2 }], ["srsi", { rp: 14, sp: 14, k: 3, d: 3 }],
  ["cci", { p: 1 }], ["cci", { p: 2 }], ["cci", { p: 3 }], ["cci", { p: 9 }], ["cci", { p: 20 }],
];

/* 되풀이 가능한 봉 — seed 를 고정해 두어 값이 늘 같습니다(흔들리는 테스트 금지) */
const CS = makeCandles(400, 3);

function 이름(defId, prm) {
  return defId + "(" + Object.keys(prm).map((k) => prm[k]).join(",") + ")";
}

/** 두 배열을 비교합니다. { 같은가, 왜, 최대상대 } */
function 대조(got, want) {
  if (!got) return { 같은가: false, 왜: "그린 값이 없습니다" };
  if (got.length !== want.length) {
    return { 같은가: false, 왜: "점 개수 " + got.length + " ≠ 참조식 " + want.length };
  }
  let 최대 = 0;
  let 최대절대 = 0;
  for (let i = 0; i < want.length; i++) {
    if (got[i].time !== want[i].time) {
      return { 같은가: false, 왜: i + "번째 시각이 다릅니다 " + got[i].time + " ≠ " + want[i].time };
    }
    const d = Math.abs(got[i].value - want[i].value);
    if (d > 최대절대) 최대절대 = d;
    const r = d / (Math.abs(want[i].value) || 1);
    if (r > 최대) 최대 = r;
  }
  return {
    같은가: 최대 <= 허용,
    왜: "최대 상대오차 " + 최대.toExponential(2) + " (절대 " + 최대절대.toExponential(2) + ") · 허용 " + 허용,
    최대상대: 최대,
    최대절대: 최대절대,
  };
}

function 이상한값(arr) {
  return arr.filter((p) => typeof p.value !== "number" || !isFinite(p.value)).length;
}

/* =======================================================================
 * [1] 켤 때 전체 계산(seed) 이 참조식과 같은가
 * ===================================================================== */
console.log("\n[1] 켤 때 계산(seed) vs 참조식");
{
  사례.forEach(function (c) {
    const defId = c[0];
    const prm = c[1];
    const B = boot(CS);
    const id = B.K.createInstance(defId, { on: true, params: prm });
    if (!id) {
      ok(이름(defId, prm) + " 를 얹을 수 있다", false, "createInstance 가 null");
      return;
    }
    const got = B.그린값(id);
    const want = ref(defId, CS, prm);
    Object.keys(want).forEach(function (k) {
      const r = 대조(got && got[k], want[k]);
      ok(이름(defId, prm) + " 의 " + k + " 선이 참조식과 같다", r.같은가, r.왜);
    });
  });
}

/* =======================================================================
 * [2] 짧은 기간에서 0 으로 나누지 않는가 (NaN · ±Infinity 0건)
 *     기간 1 은 "창에 값이 하나" 라 최고==최저 · 편차 0 이 됩니다.
 * ===================================================================== */
console.log("\n[2] 짧은 기간에서 NaN · Infinity 가 안 나오는가");
{
  사례.forEach(function (c) {
    const defId = c[0];
    const prm = c[1];
    const 짧은가 = Object.keys(prm).some((k) => prm[k] <= 2);
    if (!짧은가) return;
    const B = boot(CS);
    const id = B.K.createInstance(defId, { on: true, params: prm });
    const got = B.그린값(id) || {};
    let 나쁨 = 0;
    let 점수 = 0;
    Object.keys(got).forEach(function (k) {
      나쁨 += 이상한값(got[k]);
      점수 += got[k].length;
    });
    ok(
      이름(defId, prm) + " 에 NaN · Infinity 가 하나도 없다 (점 " + 점수 + "개)",
      나쁨 === 0 && 점수 > 0,
      나쁨 + "개가 이상하거나 점이 0개입니다"
    );
  });
}

/* =======================================================================
 * [3] ⭐ 진행 중인 봉 — 같은 봉이 여러 번 들어와도 값이 안 흔들린다
 *     그리고 그 값이 참조식과 같다.
 * ===================================================================== */
console.log("\n[3] 진행 중인 봉이 여러 번 들어올 때 (step)");
{
  사례.forEach(function (c) {
    const defId = c[0];
    const prm = c[1];
    const B = boot(CS);
    const id = B.K.createInstance(defId, { on: true, params: prm });
    if (!id) return;

    const last = CS[CS.length - 1];
    const 진행중 = {
      time: last.time,
      open: last.open,
      high: last.high + 70,
      low: last.low - 20,
      close: last.close + 55,
      volume: 12,
    };

    /* 같은 봉을 다섯 번 흘려보냅니다 — 실제로 초당 여러 번 옵니다 */
    const 자취 = {};
    for (let r = 0; r < 5; r++) {
      B.틱(진행중);
      const g = B.그린값(id) || {};
      Object.keys(g).forEach(function (k) {
        (자취[k] = 자취[k] || []).push(g[k][g[k].length - 1].value);
      });
    }

    Object.keys(자취).forEach(function (k) {
      const v = 자취[k];
      const 흔들림 = Math.max.apply(null, v) - Math.min.apply(null, v);
      ok(
        이름(defId, prm) + " 의 " + k + " 는 같은 봉이 5번 와도 값이 안 흔들린다",
        흔들림 === 0,
        "흔들림 " + 흔들림.toExponential(3) + " (" + v.map((x) => x.toFixed(6)).join(" → ") + ")"
      );
    });

    /* 그 값이 참조식과 같은가 — 마지막 봉을 바꾼 봉 배열로 다시 계산 */
    const CS2 = CS.slice(0, -1).concat([진행중]);
    const want = ref(defId, CS2, prm);
    const got = B.그린값(id) || {};
    Object.keys(want).forEach(function (k) {
      const w = want[k][want[k].length - 1];
      const g = got[k] ? got[k][got[k].length - 1] : null;
      const d = g ? Math.abs(g.value - w.value) / (Math.abs(w.value) || 1) : Infinity;
      ok(
        이름(defId, prm) + " 의 " + k + " 진행중 값이 참조식과 같다",
        !!g && g.time === w.time && d <= 허용,
        g ? "상대오차 " + d.toExponential(2) : "값이 없습니다"
      );
    });
  });
}

/* =======================================================================
 * [4] ⭐⭐ step 이 낸 값 == 그 봉까지 넣고 seed 를 다시 돌린 값
 *     참조식이 없어도 걸립니다 → ★앞으로 늘어날 지표에도 자동으로 걸립니다.★
 *     정의 목록을 손으로 안 적습니다.
 * ===================================================================== */
console.log("\n[4] step 과 seed 가 같은 값을 내는가 (등록된 정의 전부)");
{
  const 기준 = boot(CS);
  const 정의들 = 기준.K.listDefs().map((d) => d.id);
  ok("등록된 정의를 읽었다", 정의들.length > 0, String(정의들.length));

  const last = CS[CS.length - 1];
  /* ⚠️ value 는 ★가짜 거래량 시리즈★ 가 읽는 칸이고 volume 은 ★틱 payload★ 가
     읽는 칸입니다. 둘을 같은 값으로 맞춰야 두 길(틱 / 처음부터)이 같은 거래량을
     봅니다. 처음에 value 를 빼먹었더니 OBV 가 딱 12+9 만큼 어긋났습니다 —
     지표 잘못이 아니라 ★이 테스트 잘못★ 이었습니다. 그대로 적어 둡니다. */
  const 진행중 = {
    time: last.time,
    open: last.open,
    high: last.high + 70,
    low: last.low - 20,
    close: last.close + 55,
    volume: 12,
    value: 12,
  };
  const 새봉 = {
    time: last.time + 60,
    open: 진행중.close,
    high: 진행중.close + 90,
    low: 진행중.close - 40,
    close: 진행중.close + 30,
    volume: 9,
    value: 9,
  };
  const CS2 = CS.slice(0, -1).concat([진행중]);
  const CS3 = CS2.concat([새봉]);

  정의들.forEach(function (defId) {
    /* (가) 실시간 길 — 켠 뒤 틱을 흘려보냅니다 */
    const A = boot(CS);
    const idA = A.K.createInstance(defId, { on: true });
    if (!idA) {
      ok(defId + " 를 얹을 수 있다", false, "createInstance 가 null");
      return;
    }
    A.틱(진행중);
    A.틱(진행중); /* 진행 중인 봉은 여러 번 옵니다 */
    A.틱(새봉);
    const 실시간 = A.그린값(idA) || {};

    /* (나) 켤 때 길 — 같은 봉 배열을 처음부터 seed 로 */
    const Bb = boot(CS3);
    const idB = Bb.K.createInstance(defId, { on: true });
    const 켤때 = Bb.그린값(idB) || {};

    /* ⚠️ 2026-09-02 저녁에 늘렸습니다 — ★값 없는 점(빈 점)★ 을 견주는 길.
       Supertrend 는 추세가 뒤집히는 자리에서 ★선을 끊어야★ 합니다. 끊는 방법이
       { time } 만 있고 value 가 없는 점을 찍는 것입니다(라이브러리 whitespace).
       그전에는 여기서 undefined - undefined 를 빼서 NaN 이 나왔고, ★두 길이
       똑같이 "여기는 비었다" 라고 답했는데도 실패★ 로 찍혔습니다.
       빈 점끼리는 같은 것으로 봅니다. 한쪽만 비어 있으면 그건 진짜 다른 것입니다. */
    Object.keys(켤때).forEach(function (k) {
      const w = 켤때[k][켤때[k].length - 1];
      const g = 실시간[k] ? 실시간[k][실시간[k].length - 1] : null;
      if (!w) return;
      const wv = typeof w.value === "number" ? w.value : null;
      const gv = g && typeof g.value === "number" ? g.value : null;

      if (wv === null || gv === null) {
        ok(
          defId + " — 틱으로 낸 " + k + " 의 ★빈 자리★ 가 처음부터 계산한 것과 같다",
          !!g && g.time === w.time && wv === null && gv === null,
          g
            ? "틱 " + (gv === null ? "빈 점" : gv) + " · 처음부터 " + (wv === null ? "빈 점" : wv)
            : "틱 쪽 점이 아예 없습니다"
        );
        return;
      }

      const d = Math.abs(gv - wv) / (Math.abs(wv) || 1);
      ok(
        defId + " — 틱으로 낸 " + k + " 값이 처음부터 계산한 값과 같다",
        !!g && g.time === w.time && d <= 허용,
        "틱 " + gv + " · 처음부터 " + wv + " · 상대오차 " + d.toExponential(2)
      );
    });
  });
}

/* =======================================================================
 * [5] ⭐ CCI 반올림 — 굴러가는 합으로 되돌아가면 여기서 터집니다
 *
 * 2026-09-02 차트팀 실측 — 처음엔 SMA 를 굴러가는 합으로 O(1) 에 구했는데,
 * 봉 1000개를 지나며 반올림 오차가 쌓여 ★기간 2 에서 최대 4.3e-6 어긋났습니다★
 * (1005개 중 2개). 지금은 평균편차 때문에 어차피 창을 한 바퀴 도는 김에 합도
 * 같이 구합니다 — O(p) 가 O(p) 그대로라 ★값은 공짜로 정확해집니다.★
 *
 * 여기서는 그 사고가 났던 자리(기간 2 · 긴 봉)를 그대로 다시 재고,
 * ★절대오차★ 로 못 박습니다. 다시 굴러가는 합을 쓰면 4.3e-6 이 돌아옵니다.
 * ===================================================================== */
console.log("\n[5] CCI 반올림 (기간 2 · 봉 1000개)");
{
  const 긴봉 = makeCandles(1000, 11);
  [1, 2, 3, 9, 20, 100].forEach(function (p) {
    const B = boot(긴봉);
    const id = B.K.createInstance("cci", { on: true, params: { p: p } });
    if (!id) {
      ok("CCI(" + p + ") 를 얹을 수 있다", false, "createInstance 가 null");
      return;
    }
    const got = (B.그린값(id) || {}).cci;
    const want = refCCI(긴봉, p, "hlc3");
    const r = 대조(got, want);
    const 절대 = r.최대절대;
    ok(
      "CCI(" + p + ") 가 봉 1000개에서도 참조식과 ★절대오차 1e-9 이하★ 로 같다",
      r.같은가 && 절대 !== undefined && 절대 <= 1e-9,
      r.왜 + "  ← 굴러가는 합으로 되돌아가면 4.3e-6 이 됩니다"
    );
  });
}

/* =======================================================================
 * [6] 값 종류(Source) 를 바꿔도 참조식과 같은가
 *     CCI 기본이 hlc3 이라, 값 종류 길이 틀어지면 지표가 통째로 달라집니다.
 * ===================================================================== */
console.log("\n[6] 값 종류(Source) 를 바꿨을 때");
{
  ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].forEach(function (src) {
    const B = boot(CS);
    const id = B.K.createInstance("ema", { on: true, params: { p: 9, src: src } });
    const got = (B.그린값(id) || {}).ema;
    const r = 대조(got, refEMA(CS, 9, src));
    ok("EMA(9) 를 " + src + " 로 계산해도 참조식과 같다", r.같은가, r.왜);
  });

  ["close", "hlc3", "ohlc4"].forEach(function (src) {
    const B = boot(CS);
    const id = B.K.createInstance("cci", { on: true, params: { p: 20, src: src } });
    const got = (B.그린값(id) || {}).cci;
    const r = 대조(got, refCCI(CS, 20, src));
    ok("CCI(20) 를 " + src + " 로 계산해도 참조식과 같다", r.같은가, r.왜);
  });
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
}
process.exit(fail ? 1 : 0);
