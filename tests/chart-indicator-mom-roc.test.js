/* tests/chart-indicator-mom-roc.test.js
 * =========================================================================
 * 봉인 — Momentum(Mom) 과 Rate Of Change(ROC) 의 ★계산 · 단위 · 눈금★
 * =========================================================================
 * 2026-09-03 차트팀. 오늘 얹은 지표 둘입니다(js/chart-indicator-kit.js 의
 * "mom" · "roc").
 *
 * ── 왜 둘을 한 파일에 두는가 ────────────────────────────────────────────
 *   뼈대가 같습니다 — 둘 다 "지금 값" 과 "n봉 전 값" 을 비교합니다.
 *   Mom 은 빼고(차이), ROC 는 나눕니다(변화율 %). 그래서 틀 안에서도 고리버퍼
 *   하나(lagPush)를 같이 씁니다. 한쪽만 고치면 다른 쪽이 조용히 어긋나므로
 *   같은 자리에서 같이 잽니다.
 *
 * ── ⭐ 이 둘이 특별히 위험한 자리 두 곳 ────────────────────────────────
 *   ① ★칸 하나 차이★
 *      "n봉 전 값" 이 든 칸과 "지금 값을 쓸 칸" 이 같으면, 진행 중인 봉으로
 *      step 을 ★두 번째★ 부를 때 이미 덮여 있어서 ★차이가 0★ 이 됩니다.
 *      오류도 경고도 없이 선만 0 에 붙습니다(조용한 고장). 그래서 이 파일은
 *      같은 봉을 ★5번★ 흘려보내고 값이 안 흔들리는지 봅니다.
 *   ② ★단위★
 *      Mom 은 값이 ★가격 차이★ 입니다(85.02 는 85.02 USDT). ROC 는 ★%★ 입니다.
 *      섞이면 원화로 보는 회원 화면에 USDT 숫자가 뜨거나(ATR 사고),
 *      %가 원으로 환산돼 뜻 없는 숫자가 됩니다. 그래서 ★봉 값을 10배로 올려
 *      재서★ 둘이 갈리는지 확인합니다.
 *
 * ── 숫자를 박지 않습니다 ────────────────────────────────────────────────
 *   기대값을 글자로 적지 않고 ★참조식을 따로 짜서 매번 다시 계산★ 합니다.
 *   참조식은 고리버퍼를 안 씁니다 — 배열을 그냥 i-p 로 되짚습니다.
 *   틀은 고리버퍼로 빠르고, 그 빠름이 값을 어긋나게 하는지를 여기서 봅니다.
 *
 * ── 계산식 근거 (2026-09-03 · 브라우저로 직접 열어 읽음) ────────────────
 *   ta.mom  "This is simply a difference: source - source[length]."
 *   ta.roc  "100 * change(src, length) / src[length]"
 *   기본값은 트레이딩뷰 차트(BINANCE:BTCUSDT · 1시간)에 내장 지표를 얹어
 *   범례로 실측 — "Mom 10 close" · "ROC 9 close".
 *
 * ── 무엇을 보는가 ───────────────────────────────────────────────────────
 *   [1] seed 가 참조식과 같은가 (기간 1 · 2 · 9 · 10 · 50)
 *   [2] ★첫 값이 나오는 자리★ — p봉째부터. 그 앞은 아예 안 그린다
 *   [3] 진행 중인 봉이 5번 와도 값이 안 흔들리는가 (위 ① 함정)
 *   [4] ⭐ 단위 — 봉 값을 10배로 올려 Mom 만 10배가 되는가
 *   [5] ★Mom 과 ROC 의 관계★ — ROC = Mom / n봉전값 × 100 (같은 기간일 때)
 *   [6] 정의 약속 — 아래 칸 · unit · 기준선 · 눈금 · 색 · 기본으로 꺼짐
 *   [7] 0 으로 나누는 자리에서 ROC 가 무한대를 안 그린다
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
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
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}

console.log("\nMomentum · ROC 봉인 (n봉 전과 비교하는 지표)");

const 허용 = 1e-9;
const CS = makeCandles(400);
const 기간들 = [1, 2, 9, 10, 50];

/* ── 참조식 — 고리버퍼를 안 씁니다. 배열을 그냥 i-p 로 되짚습니다 ────── */
function 참조Mom(cs, p) {
  const out = [];
  for (let i = p; i < cs.length; i++) {
    out.push({ time: cs[i].time, value: cs[i].close - cs[i - p].close });
  }
  return out;
}
function 참조Roc(cs, p) {
  const out = [];
  for (let i = p; i < cs.length; i++) {
    out.push({ time: cs[i].time, value: (100 * (cs[i].close - cs[i - p].close)) / cs[i - p].close });
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
    if (got[i].time !== want[i].time) return { 같은가: false, 왜: i + "번째 시각이 다릅니다" };
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
    const mid = B.K.createInstance("mom", { on: true, params: { p: p } });
    const rid = B.K.createInstance("roc", { on: true, params: { p: p } });
    if (!mid || !rid) {
      ok("Mom(" + p + ") · ROC(" + p + ") 를 얹을 수 있다", false, "createInstance 가 null 을 냈습니다");
      return;
    }
    const rm = 대조((B.그린값(mid) || {}).mom, 참조Mom(CS, p));
    ok("Mom(" + p + ") 이 참조식과 같다 (봉 " + CS.length + "개)", rm.같은가, rm.왜);
    const rr = 대조((B.그린값(rid) || {}).roc, 참조Roc(CS, p));
    ok("ROC(" + p + ") 가 참조식과 같다 (봉 " + CS.length + "개)", rr.같은가, rr.왜);
  });
}

/* =======================================================================
 * [2] ⭐ 첫 값이 나오는 자리 — p봉째부터
 *     트레이딩뷰도 source[length] 가 없는 구간은 na 라 아무것도 안 그립니다.
 *     여기서 한 칸이 밀리면 선 전체가 한 봉씩 어긋납니다(눈으로는 못 봅니다).
 * ===================================================================== */
console.log("\n[2] 첫 값이 나오는 자리");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const mid = B.K.createInstance("mom", { on: true, params: { p: p } });
    const arr = ((B.그린값(mid) || {}).mom) || [];
    ok("Mom(" + p + ") 의 첫 점이 " + p + "번째 봉이다 (점 " + arr.length + "개)",
      arr.length === CS.length - p && arr[0] && arr[0].time === CS[p].time,
      "첫 시각 " + (arr[0] ? arr[0].time : "없음") + " · 기대 " + CS[p].time);
  });
}

/* =======================================================================
 * [3] ⭐⭐ 진행 중인 봉이 5번 와도 값이 안 흔들린다 (칸 하나 차이 함정)
 * ===================================================================== */
console.log("\n[3] 진행 중인 봉이 여러 번 들어올 때 (step)");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const mid = B.K.createInstance("mom", { on: true, params: { p: p } });
    const rid = B.K.createInstance("roc", { on: true, params: { p: p } });
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
    const 자취M = [];
    const 자취R = [];
    for (let r = 0; r < 5; r++) {
      B.틱(진행중);
      const a = (B.그린값(mid) || {}).mom || [];
      const b = (B.그린값(rid) || {}).roc || [];
      자취M.push(a[a.length - 1].value);
      자취R.push(b[b.length - 1].value);
    }
    const 흔들M = Math.max.apply(null, 자취M) - Math.min.apply(null, 자취M);
    const 흔들R = Math.max.apply(null, 자취R) - Math.min.apply(null, 자취R);
    ok("Mom(" + p + ") 은 같은 봉이 5번 와도 값이 안 흔들린다", 흔들M === 0,
      "흔들림 " + 흔들M.toExponential(3) + " (" + 자취M.join(" → ") + ")");
    ok("ROC(" + p + ") 는 같은 봉이 5번 와도 값이 안 흔들린다", 흔들R === 0,
      "흔들림 " + 흔들R.toExponential(3) + " (" + 자취R.join(" → ") + ")");

    /* ★0 으로 주저앉지 않았는지★ — 위 함정에 빠지면 값이 딱 0 이 됩니다 */
    ok("Mom(" + p + ") 의 진행중 값이 0 이 아니다 (덮어쓰기 함정 확인 · " +
      자취M[0].toFixed(3) + ")", 자취M[0] !== 0,
      "0 이면 「n봉 전 값」 칸을 지금 값으로 덮어쓴 것입니다");

    const wm = 참조Mom(CS.slice(0, -1).concat([진행중]), p);
    const wr = 참조Roc(CS.slice(0, -1).concat([진행중]), p);
    const dm = Math.abs(자취M[0] - wm[wm.length - 1].value) / (Math.abs(wm[wm.length - 1].value) || 1);
    const dr = Math.abs(자취R[0] - wr[wr.length - 1].value) / (Math.abs(wr[wr.length - 1].value) || 1);
    ok("Mom(" + p + ") 의 진행중 값이 참조식과 같다", dm <= 허용, "상대오차 " + dm.toExponential(2));
    ok("ROC(" + p + ") 의 진행중 값이 참조식과 같다", dr <= 허용, "상대오차 " + dr.toExponential(2));
  });
}

/* =======================================================================
 * [4] ⭐ 단위 — 봉 값을 10배로 올리면 Mom 만 10배, ROC 는 그대로
 *     (tests/chart-indicator-unit-registry-seal.test.js 와 같은 자로 잽니다.
 *      저쪽은 「모든 지표」 를 훑고, 여기는 이 둘을 ★기간별로★ 잽니다)
 * ===================================================================== */
console.log("\n[4] 단위 — 봉 값을 10배로 올려서 잰다");
{
  const 마지막값 = function (id, mul, p) {
    const cs = makeCandles(400).map((c) => ({
      time: c.time, open: c.open * mul, high: c.high * mul,
      low: c.low * mul, close: c.close * mul, value: c.value
    }));
    const B = boot(cs);
    const i = B.K.createInstance(id, { on: true, params: { p: p } });
    const it = B.K.getInstancesForTest()[i];
    const v = it && it.live ? it.live.vals[id] : null;
    return typeof v === "number" && isFinite(v) ? v : null;
  };
  기간들.forEach(function (p) {
    const m1 = 마지막값("mom", 1, p);
    const m10 = 마지막값("mom", 10, p);
    const r1 = 마지막값("roc", 1, p);
    const r10 = 마지막값("roc", 10, p);
    ok("Mom(" + p + ") · ROC(" + p + ") 값을 두 배수에서 다 읽었다",
      m1 !== null && m10 !== null && r1 !== null && r10 !== null,
      "못 읽으면 아래 비율이 헛것이 됩니다: " + [m1, m10, r1, r10].join(" / "));
    if (m1 === null || r1 === null || m1 === 0 || r1 === 0) return;
    const 비M = m10 / m1;
    const 비R = r10 / r1;
    ok("★Mom(" + p + ") 은 가격이다★ — 10배 올리면 10배 (실측 " + 비M.toFixed(3) + ")",
      Math.abs(비M - 10) < 0.001, "비율 " + 비M);
    ok("★ROC(" + p + ") 는 지수(%)다★ — 10배 올려도 그대로 (실측 " + 비R.toFixed(3) + ")",
      Math.abs(비R - 1) < 0.001, "비율 " + 비R);
  });
}

/* =======================================================================
 * [5] ⭐ Mom 과 ROC 의 관계 — ROC = Mom / n봉전값 × 100
 *     둘이 ★같은 고리버퍼★ 를 쓰므로, 한쪽 칸이 밀리면 이 항등이 깨집니다.
 * ===================================================================== */
console.log("\n[5] ROC = Mom / n봉전값 × 100 (항등)");
{
  기간들.forEach(function (p) {
    const B = boot(CS);
    const mid = B.K.createInstance("mom", { on: true, params: { p: p } });
    const rid = B.K.createInstance("roc", { on: true, params: { p: p } });
    const mm = ((B.그린값(mid) || {}).mom) || [];
    const rr = ((B.그린값(rid) || {}).roc) || [];
    const map = {};
    rr.forEach((x) => { map[x.time] = x.value; });
    /* n봉 전 종가는 원본 캔들에서 직접 가져옵니다(틀에 안 물어봅니다) */
    const 전값 = {};
    for (let i = p; i < CS.length; i++) 전값[CS[i].time] = CS[i - p].close;
    let 최대 = 0;
    let 같은점 = 0;
    mm.forEach((x) => {
      if (!(x.time in map)) return;
      같은점++;
      const 기대 = (x.value / 전값[x.time]) * 100;
      const d = Math.abs(map[x.time] - 기대) / (Math.abs(기대) || 1);
      if (d > 최대) 최대 = d;
    });
    ok("기간 " + p + " 에서 ROC = Mom / n봉전값 × 100 이다 (겹치는 점 " + 같은점 + "개)",
      같은점 > 0 && 최대 <= 1e-12, "최대 상대오차 " + 최대.toExponential(2));
  });
}

/* =======================================================================
 * [6] 정의가 약속을 지키는가
 * ===================================================================== */
console.log("\n[6] 정의 약속");
{
  const B = boot(CS);
  const defs = B.K.listDefs();
  const 원 = B.K.getDefsForTest() || {};
  const hexes = (B.K.LINE_COLORS || []).map((c) => c.hex);

  const dm = defs.filter((x) => x.id === "mom")[0];
  ok("정의 mom 이 등록돼 있다", !!dm);
  if (dm) {
    ok("Mom 은 아래 칸(sub) 지표다", dm.pane === "sub", String(dm.pane));
    ok('★Mom 은 unit:"price" 다★ (값이 가격 차이 — 원화 회원이 원으로 봐야 합니다)',
      dm.unit === "price", String(dm.unit));
    ok("Mom 은 기준선을 안 그린다 (트레이딩뷰 내장 Momentum 도 hline 이 없습니다)",
      (dm.guides || []).length === 0, JSON.stringify(dm.guides));
    ok("Mom 은 눈금을 안 고정한다 (범위가 없는 지표입니다)",
      !dm.scale || (dm.scale.min === null || dm.scale.min === undefined),
      JSON.stringify(dm.scale));
    ok("Mom 의 기본 기간이 10 이다 (트레이딩뷰 실측 「Mom 10 close」)",
      dm.params && dm.params.p === 10, JSON.stringify(dm.params));
    const 색M = ((원.mom || {}).outputs || []).map((o) => o.color);
    ok("Mom 의 선 색이 LINE_COLORS 안이다 (" + 색M.join(",") + ")",
      색M.length === 1 && hexes.indexOf(색M[0]) >= 0, 색M.join(","));
  }

  const dr = defs.filter((x) => x.id === "roc")[0];
  ok("정의 roc 가 등록돼 있다", !!dr);
  if (dr) {
    ok("ROC 는 아래 칸(sub) 지표다", dr.pane === "sub", String(dr.pane));
    ok("★ROC 에는 unit 이 없다★ (%(지수)라 원화로 환산하면 뜻이 없습니다)",
      dr.unit === null || dr.unit === undefined, String(dr.unit));
    const g = (dr.guides || []).map((x) => x.price);
    ok("ROC 의 기준선은 0 하나다 (트레이딩뷰 ROC 칸에 0선이 있었습니다)",
      g.join(",") === "0", g.join(","));
    ok("★ROC 는 keepGuides 다★ — 고정은 안 하고 0선만 늘 눈금 안에 넣습니다",
      !!dr.scale && dr.scale.keepGuides === true &&
      (dr.scale.min === null || dr.scale.min === undefined),
      JSON.stringify(dr.scale));
    ok("ROC 의 기본 기간이 9 다 (트레이딩뷰 실측 「ROC 9 close」)",
      dr.params && dr.params.p === 9, JSON.stringify(dr.params));
    const 색R = ((원.roc || {}).outputs || []).map((o) => o.color);
    ok("ROC 의 선 색이 LINE_COLORS 안이다 (" + 색R.join(",") + ")",
      색R.length === 1 && hexes.indexOf(색R[0]) >= 0, 색R.join(","));
    if (dm) {
      const a = ((원.mom || {}).outputs || [])[0];
      const b = ((원.roc || {}).outputs || [])[0];
      ok("Mom 과 ROC 의 기본 색이 서로 다르다", a && b && a.color !== b.color,
        (a && a.color) + " / " + (b && b.color));
    }
  }

  /* 기본으로 켜져 있으면 안 됩니다 — 처음 온 사람 화면에 칸이 늘면 안 됩니다 */
  const 켜진것 = (B.K.listInstances() || []).filter((x) => (x.def === "mom" || x.def === "roc") && x.on);
  ok("둘 다 기본으로 켜져 있지 않다", 켜진것.length === 0, String(켜진것.length));
}

/* =======================================================================
 * [7] ⭐ 0 으로 나누는 자리 — ROC 가 무한대를 안 그린다
 *     시세에 0 은 안 오지만, 오면 선이 화면 끝까지 튀어 눈금을 망가뜨립니다.
 * ===================================================================== */
console.log("\n[7] 0 으로 나누는 자리 (ROC)");
{
  const 봉 = [];
  for (let i = 0; i < 60; i++) {
    const c = i < 20 ? 0 : 100 + i;           /* 앞 20봉의 종가가 0 */
    봉.push({ time: 1700000000 + i * 60, open: c, high: c + 1, low: c, close: c, value: 10 });
  }
  const B = boot(봉);
  const rid = B.K.createInstance("roc", { on: true, params: { p: 9 } });
  const arr = ((B.그린값(rid) || {}).roc) || [];
  const 나쁨 = arr.filter((x) => typeof x.value !== "number" || !isFinite(x.value)).length;
  ok("ROC 에 무한대 · NaN 이 하나도 없다 (점 " + arr.length + "개)",
    arr.length > 0 && 나쁨 === 0, "이상한 값 " + 나쁨 + "개");

  const mid = B.K.createInstance("mom", { on: true, params: { p: 9 } });
  const am = ((B.그린값(mid) || {}).mom) || [];
  const 나쁨M = am.filter((x) => typeof x.value !== "number" || !isFinite(x.value)).length;
  ok("Mom 은 같은 봉에서도 값이 멀쩡하다 (나누지 않으므로 · 점 " + am.length + "개)",
    am.length > 0 && 나쁨M === 0, "이상한 값 " + 나쁨M + "개");
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
