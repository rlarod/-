/* tests/chart-indicator-wr.test.js
 * =========================================================================
 * 봉인 — Williams %R (%R) 의 ★계산 · 범위 · 눈금★
 * =========================================================================
 * 2026-09-03 차트팀. 오늘 얹은 지표입니다(js/chart-indicator-kit.js 의 "wr").
 *
 * ── 왜 따로 두는가 ──────────────────────────────────────────────────────
 *   %R 은 이 틀에서 ★처음으로 음수 눈금(0 ~ -100)★ 을 쓰는 지표입니다.
 *   지금까지 아래 칸 지표는 전부 0~100 이거나 범위가 없었습니다. 그래서
 *   "부호를 어디선가 뒤집어 0~100 으로 그려 놓는" 고장이 ★오류 없이★
 *   날 수 있습니다 — 선 모양은 똑같고 위아래만 뒤집힙니다. 회원은 그걸
 *   과매수/과매도 반대로 읽습니다.
 *
 * ── 숫자를 박지 않습니다 ────────────────────────────────────────────────
 *   기대값을 글자로 적어 두지 않고 ★참조식을 따로 짜서 매번 다시 계산★ 합니다.
 *   참조식은 정의 그대로 순진하게 씁니다 — 링버퍼도, "최고가 어느 칸인지" 도
 *   안 씁니다. 틀은 그 최적화 때문에 빠르고, 그 최적화가 값을 어긋나게
 *   만드는지를 여기서 봅니다(tests/chart-indicator-math.test.js 와 같은 방식).
 *
 * ── 무엇을 보는가 ───────────────────────────────────────────────────────
 *   [1] seed 가 참조식과 같은가 (기간 1 · 2 · 3 · 14 · 50)
 *   [2] 값이 ★0 ~ -100 밖으로 안 나가는가★ · NaN · Infinity 0건
 *   [3] 진행 중인 봉으로 step 을 여러 번 불러도 값이 안 흔들리는가
 *   [4] ⭐ Stochastic(%K 다듬기 1) 과 ★%R = %K - 100★ 항등이 성립하는가
 *       (Pine 참고서가 ta.wpr 의 나눗셈 식을 글자로 안 적어 둔 자리를
 *        ta.stoch 원문으로 메운 근거입니다 — 그 근거가 지금도 사실인지 잽니다)
 *   [5] 정의 약속 — 아래 칸 · unit 없음 · 눈금 [-100,0] · 기준선 -20 · -80 ·
 *       색이 LINE_COLORS 안
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

console.log("\nWilliams %R 봉인 (0 ~ -100)");

const 허용 = 1e-9;
const CS = makeCandles(400);
const 기간들 = [1, 2, 3, 14, 50];


/* ── 참조식 — 정의 그대로. 창을 매번 처음부터 훑습니다 ──────────────────
 *   %R = (최고(고,p) - 종가) / (최고(고,p) - 최저(저,p)) · -100
 *   창에 ★지금 봉이 들어갑니다★ (ta.wpr · ta.stoch 와 같습니다).            */
function 참조WR(cs, p) {
  const out = [];
  for (let i = p - 1; i < cs.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      if (cs[j].high > hi) hi = cs[j].high;
      if (cs[j].low < lo) lo = cs[j].low;
    }
    let v = hi > lo ? ((hi - cs[i].close) / (hi - lo)) * -100 : -100;
    if (v === 0) v = 0;                 /* -0 을 0 으로 */
    out.push({ time: cs[i].time, value: v });
  }
  return out;
}

/* ── 참조식 — 스토캐스틱 %K (다듬기 1). [4] 항등 검사에만 씁니다 ───────── */
function 참조K(cs, p) {
  const out = [];
  for (let i = p - 1; i < cs.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) {
      if (cs[j].high > hi) hi = cs[j].high;
      if (cs[j].low < lo) lo = cs[j].low;
    }
    out.push({ time: cs[i].time, value: hi > lo ? ((cs[i].close - lo) / (hi - lo)) * 100 : 0 });
  }
  return out;
}

function 대조(got, want) {
  if (!got) return { 같은가: false, 왜: "그린 값이 없습니다" };
  if (got.length !== want.length) {
    return { 같은가: false, 왜: "점 개수 " + got.length + " ≠ 참조식 " + want.length };
  }
  let 최대 = 0;
  for (let i = 0; i < want.length; i++) {
    if (got[i].time !== want[i].time) {
      return { 같은가: false, 왜: i + "번째 시각이 다릅니다" };
    }
    const d = Math.abs(got[i].value - want[i].value) / (Math.abs(want[i].value) || 1);
    if (d > 최대) 최대 = d;
  }
  return { 같은가: 최대 <= 허용, 왜: "최대 상대오차 " + 최대.toExponential(2) };
}

/* =======================================================================
 * [1] 켤 때 계산(seed) 이 참조식과 같은가
 * ===================================================================== */
console.log("\n[1] 켤 때 계산(seed) vs 참조식");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const id = B.K.createInstance("wr", { on: true, params: { p: p } });
    if (!id) {
      ok("%R(" + p + ") 를 얹을 수 있다", false, "createInstance 가 null 을 냈습니다");
      return;
    }
    const g = B.그린값(id) || {};
    const r = 대조(g.wr, 참조WR(CS, p));
    ok("%R(" + p + ") 이 참조식과 같다 (봉 " + CS.length + "개)", r.같은가, r.왜);
  });
}

/* =======================================================================
 * [2] ⭐ 값이 0 ~ -100 밖으로 안 나간다 · NaN · Infinity 0건
 *     ⚠️ 기간 1 이면 창에 봉이 하나뿐이라 고 == 저 가 될 수 있습니다
 *        (0 으로 나누는 자리). 그래서 기간 1 을 꼭 넣습니다.
 * ===================================================================== */
console.log("\n[2] 값이 0 ~ -100 안에 있는가");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const id = B.K.createInstance("wr", { on: true, params: { p: p } });
    const arr = ((B.그린값(id) || {}).wr) || [];
    const 나쁨 = arr.filter((x) => typeof x.value !== "number" || !isFinite(x.value)).length;
    const 밖 = arr.filter((x) => x.value > 0 || x.value < -100).length;
    let lo = 0;
    let hi = -100;
    arr.forEach((x) => {
      if (x.value < lo) lo = x.value;
      if (x.value > hi) hi = x.value;
    });
    ok(
      "%R(" + p + ") 값이 전부 0 ~ -100 안이다 (점 " + arr.length + "개 · 실측 " +
        hi.toFixed(2) + " ~ " + lo.toFixed(2) + ")",
      arr.length > 0 && 나쁨 === 0 && 밖 === 0,
      "밖 " + 밖 + "개 · 이상한 값 " + 나쁨 + "개"
    );
  });

  /* ⭐ ★위로도 아래로도 끝까지 가 봅니다★ — 값이 정말 0 과 -100 에 닿는지.
     안 닿으면 "범위 안" 은 통과해도 부호가 뒤집혔는지 못 봅니다. */
  const 오름 = [];
  const 내림 = [];
  for (let i = 0; i < 60; i++) {
    const up = 70000 + i * 30;
    오름.push({ time: 1700000000 + i * 60, open: up - 5, high: up, low: up - 20, close: up, value: 10 });
    const dn = 70000 - i * 30;
    내림.push({ time: 1700000000 + i * 60, open: dn + 5, high: dn + 20, low: dn, close: dn, value: 10 });
  }
  const B1 = boot(오름);
  const a1 = ((B1.그린값(B1.K.createInstance("wr", { on: true, params: { p: 14 } })) || {}).wr) || [];
  const 끝값1 = a1.length ? a1[a1.length - 1].value : null;
  ok("★계속 오르면 %R 이 0 쪽에 붙는다★ (실측 " + 끝값1 + ")", 끝값1 === 0,
    "0 이어야 합니다 — 0~100 짜리로 뒤집혀 있으면 여기서 -100 이 나옵니다");

  const B2 = boot(내림);
  const a2 = ((B2.그린값(B2.K.createInstance("wr", { on: true, params: { p: 14 } })) || {}).wr) || [];
  const 끝값2 = a2.length ? a2[a2.length - 1].value : null;
  ok("★계속 내리면 %R 이 -100 쪽에 붙는다★ (실측 " + 끝값2 + ")", 끝값2 === -100,
    "-100 이어야 합니다");
}

/* =======================================================================
 * [3] 진행 중인 봉이 여러 번 들어와도 값이 안 흔들린다
 * ===================================================================== */
console.log("\n[3] 진행 중인 봉이 여러 번 들어올 때 (step)");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const id = B.K.createInstance("wr", { on: true, params: { p: p } });
    if (!id) return;
    const last = CS[CS.length - 1];
    const 진행중 = {
      time: last.time,
      open: last.open,
      high: last.high + 70,
      low: last.low - 20,
      close: last.close + 55,
      volume: 12,
      value: 12
    };
    const 자취 = [];
    for (let r = 0; r < 5; r++) {
      B.틱(진행중);
      const arr = (B.그린값(id) || {}).wr || [];
      자취.push(arr[arr.length - 1].value);
    }
    const 흔들림 = Math.max.apply(null, 자취) - Math.min.apply(null, 자취);
    ok("%R(" + p + ") 은 같은 봉이 5번 와도 값이 안 흔들린다", 흔들림 === 0,
      "흔들림 " + 흔들림.toExponential(3) + " (" + 자취.join(" → ") + ")");

    const want = 참조WR(CS.slice(0, -1).concat([진행중]), p);
    const w = want[want.length - 1];
    const d = Math.abs(자취[자취.length - 1] - w.value) / (Math.abs(w.value) || 1);
    ok("%R(" + p + ") 의 진행중 값이 참조식과 같다", d <= 허용, "상대오차 " + d.toExponential(2));
  });
}

/* =======================================================================
 * [4] ⭐ %R = 스토캐스틱 %K - 100  (항등)
 *     Pine 참고서 ta.wpr 에는 나눗셈 식이 글자로 없습니다. 같은 참고서의
 *     ta.stoch 원문("100 * (close - lowest) / (highest - lowest)")과 맞물려
 *     정한 식이라, 그 근거가 지금도 사실인지를 ★틀의 두 지표로 직접★ 잽니다.
 *     ⚠️ 창이 평평할 때만 다릅니다 — %K 는 0, %R 은 -100 (같은 자리입니다).
 * ===================================================================== */
console.log("\n[4] %R = %K - 100 (Stochastic 과 항등)");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const wid = B.K.createInstance("wr", { on: true, params: { p: p } });
    const sid = B.K.createInstance("stoch", { on: true, params: { p: p, k: 1, d: 1 } });
    const wr = ((B.그린값(wid) || {}).wr) || [];
    const kk = ((B.그린값(sid) || {}).k) || [];
    let 최대 = 0;
    let 같은점 = 0;
    const map = {};
    kk.forEach((x) => { map[x.time] = x.value; });
    wr.forEach((x) => {
      if (!(x.time in map)) return;
      같은점++;
      const d = Math.abs(x.value - (map[x.time] - 100));
      if (d > 최대) 최대 = d;
    });
    ok(
      "%R(" + p + ") 이 Stoch(" + p + ",1,1) 의 %K - 100 과 같다 (겹치는 점 " + 같은점 + "개)",
      같은점 > 0 && 최대 <= 1e-9,
      "최대 차이 " + 최대.toExponential(2)
    );
  });

  /* 참조식끼리도 한 번 맞춰 둡니다 — 위 항등이 "틀 안에서만" 맞는 것이 아님을 보려고 */
  {
    let 최대 = 0;
    const a = 참조WR(CS, 14);
    const b = 참조K(CS, 14);
    for (let i = 0; i < a.length; i++) 최대 = Math.max(최대, Math.abs(a[i].value - (b[i].value - 100)));
    ok("참조식끼리도 %R = %K - 100 이다 (기간 14)", 최대 <= 1e-9, "최대 차이 " + 최대.toExponential(2));
  }
}

/* =======================================================================
 * [5] 정의가 약속을 지키는가 (아래 칸 · unit 없음 · 눈금 · 기준선 · 색)
 * ===================================================================== */
console.log("\n[5] 정의 약속");
{
  const B = boot(CS);
  const d = B.K.listDefs().filter((x) => x.id === "wr")[0];
  ok("정의 wr 가 등록돼 있다", !!d);
  if (d) {
    ok("아래 칸(sub) 지표다", d.pane === "sub", String(d.pane));
    ok("★unit 이 없다★ (지수라 표시 통화를 따라가면 안 됩니다)",
      d.unit === null || d.unit === undefined, String(d.unit));
    ok("눈금이 [-100, 0] 으로 고정돼 있다",
      !!d.scale && d.scale.min === -100 && d.scale.max === 0, JSON.stringify(d.scale));
    const g = (d.guides || []).map((x) => x.price).sort((a, b) => a - b);
    ok("기준선이 -80 · -20 이다", g.join(",") === "-80,-20", g.join(","));
    ok("기준선이 눈금 안에 있다",
      g.every((v) => v >= d.scale.min && v <= d.scale.max), g.join(","));
    const hexes = (B.K.LINE_COLORS || []).map((c) => c.hex);
    /* 정의의 출력선 색은 listDefs 가 안 내줍니다 — 틀이 검사용으로 여는 문으로 읽습니다 */
    const 원정의 = (B.K.getDefsForTest() || {}).wr || {};
    const 색 = (원정의.outputs || []).map((o) => o.color);
    ok("선 색이 LINE_COLORS 안에 있다 (" + 색.join(",") + ")",
      색.length === 1 && hexes.indexOf(색[0]) >= 0, 색.join(","));
    ok("기본 기간이 14 다 (Pine 참고서 예제 ta.wpr(14))", d.params && d.params.p === 14,
      JSON.stringify(d.params));
  }

  /* 기본으로 켜져 있으면 안 됩니다 — 처음 온 사람 화면에 선이 늘면 안 됩니다 */
  const 켜진것 = (B.K.listInstances() || []).filter((x) => x.def === "wr" && x.on);
  ok("기본으로 켜져 있지 않다", 켜진것.length === 0, String(켜진것.length));
}

console.log(
  "\n==========================================================\n" +
  "통과 " + pass + " / 실패 " + fail
);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((x) => console.log("  - " + x));
  process.exit(1);
}
console.log("전체 통과 ✅");
