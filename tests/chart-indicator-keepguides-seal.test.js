/* tests/chart-indicator-keepguides-seal.test.js
 * =========================================================================
 * 봉인 — scale:{ keepGuides:true } · "확대해도 기준선은 눈금 안에 남는다"
 * =========================================================================
 * 2026-09-03 기록팀.
 *
 * ── ⭐ 이 파일이 생긴 이유 ──────────────────────────────────────────────
 *   차트팀이 ★스스로 신고했습니다★ —
 *     "keepGuides 를 지키는 테스트를 안 만들었습니다. 지금은 제가 브라우저에서
 *      잰 숫자만 있고, 다음 사람이 이 장치를 지워도 npm test 는 조용히
 *      통과합니다. 기록팀에 봉인을 요청해 주십시오."
 *   신고가 정확했습니다 — 이 파일이 생기기 전까지 js/chart-indicator-kit.js 에서
 *   keepGuides 를 통째로 지워도 npm test 는 초록이었습니다.
 *
 * ── 무엇을 막는가 ──────────────────────────────────────────────────────
 *   CCI 는 0~100 짜리가 아닙니다. ±100 을 예사로 넘습니다.
 *     · min/max 로 고정하면  → 큰 봉우리가 통째로 잘립니다
 *     · 아무것도 안 걸면      → 한쪽으로 쏠린 장에서 ±100 · 0 이
 *                               ★셋 다 화면 밖★ 으로 나갑니다
 *   기준선이 없는 CCI 는 읽을 수가 없습니다. 과매수 · 과매도가 그 두 줄입니다.
 *   화면은 멀쩡하고 오류도 안 납니다 — 이 프로젝트가 P1 로 부르는 "조용한 고장".
 *
 *   차트팀 브라우저 실측 — 30봉까지 당기면 CCI 가 ★10번 중 4번★ 기준선을 잃었습니다.
 *   이 파일 실측(아래 [3]) — 단조 상승 300봉에서 30봉 창 26개를 훑으면
 *   장치가 없을 때 ★26개 창 전부★ 가 기준선을 잃습니다(CCI 값이 120.5~133.3 에
 *   갇혀 0 · ±100 이 셋 다 밖). 장치를 거치면 26개 전부 안에 들어옵니다.
 *
 *   세 번째 길 —
 *       범위 = [데이터 최소, 데이터 최대] ∪ [기준선 최소, 기준선 최대]
 *   트레이딩뷰 Pine 의 hline 이 "그림이 아니라 눈금에 참여하는 값" 인 것과
 *   같은 뜻입니다. 대표 지시 "차트 시스템은 트레이딩뷰를 따라간다" 그대로입니다.
 *
 * ── ⚠️ 소스 글자 · 줄 번호 · 지표 개수를 손으로 안 적습니다 ─────────────
 *   차트팀이 지금도 js/chart-indicator-kit.js 를 잡고 있습니다.
 *   listDefs() 가 돌려주는 것만 보고, 어느 지표가 keepGuides 인지도 ★셉니다★.
 *   숫자(기준선 값 · 데이터 범위)는 전부 실행해서 얻습니다.
 *   딱 한 곳만 값을 박아 뒀습니다 — [5] 의 0~100 입니다.
 *   그건 "재서 나온 숫자" 가 아니라 ★그 지표의 정의★ 라서 그렇습니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   이 파일을 지우고 tests/_order.txt 에서 같은 이름 한 줄을 지우면 됩니다.
 *   사이트 코드는 한 줄도 안 건드렸습니다.
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

/* ── 작은 도구 ──────────────────────────────────────────────────────────
   ⚠️ Math.min(...[]) 은 Infinity 입니다. 빈 배열이 오면 조용히 통과하는
      검사가 되므로 여기서 막습니다(이 프로젝트에서 두 번 당한 NaN·빈값 함정). */
function 최소(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce(function (a, b) { return b < a ? b : a; });
}
function 최대(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce(function (a, b) { return b > a ? b : a; });
}
function 유한(v) {
  return typeof v === "number" && isFinite(v);
}
/** 그 인스턴스가 실제로 차트에 붙인 시리즈들 */
function 시리즈들(K, instId) {
  const it = (K.getInstancesForTest() || {})[instId];
  if (!it || !it.live || !it.live.series) return [];
  return Object.keys(it.live.series).map((k) => it.live.series[k]);
}
/** 그 정의를 켜고, 붙은 시리즈를 돌려줍니다 */
function 켜서시리즈(K, defId) {
  const id = K.createInstance(defId, { on: true });
  return { id: id, list: id ? 시리즈들(K, id) : [] };
}
/** 눈금 범위를 정하는 함수 (autoscaleInfoProvider) */
function 눈금함수(s) {
  return s && s._opts ? s._opts.autoscaleInfoProvider : undefined;
}
/** 라이브러리가 넘겨주는 "원래 계산한 범위" 흉내 */
function 원래범위(mn, mx, margins) {
  return function () {
    const r = { priceRange: { minValue: mn, maxValue: mx } };
    if (margins) r.margins = margins;
    return r;
  };
}

console.log("\n지표 틀 — keepGuides 봉인 (확대해도 기준선이 안 사라진다)");

/* =======================================================================
 * [1] 장치가 살아 있는가 — 지우면 ★그 자리에서★ 터진다
 * ===================================================================== */
console.log("\n[1] keepGuides 장치가 붙어 있다");

const B1 = boot(makeCandles(200));
const K1 = B1.K;
const 정의목록 = K1.listDefs();

ok("정의를 읽었다 (도구가 헛돌지 않게)", 정의목록.length > 0, String(정의목록.length) + "개");

const 지킴정의 = 정의목록.filter((d) => d.scale && d.scale.keepGuides === true);

ok(
  "★scale.keepGuides 를 쓰는 지표가 있다★",
  지킴정의.length > 0,
  "0개입니다 — js/chart-indicator-kit.js 에서 keepGuides 가 통째로 사라졌거나, " +
    "define() 이 그 칸을 조용히 버리고 있습니다. 회원이 확대하면 기준선이 화면 밖으로 나갑니다"
);

지킴정의.forEach((d) => {
  ok("[" + d.id + "] keepGuides 는 아래 칸(sub) 지표다", d.pane === "sub", "pane=" + d.pane);
  ok(
    "[" + d.id + "] ★기준선이 실제로 있다★ (없으면 지킬 것이 없다)",
    d.guides && d.guides.length > 0,
    "기준선 " + ((d.guides && d.guides.length) || 0) + "줄"
  );
  ok(
    "[" + d.id + "] min/max 로 고정하지 않았다 (고정하면 봉우리가 잘린다)",
    d.scale.min === null && d.scale.max === null,
    JSON.stringify(d.scale)
  );
  ok(
    "[" + d.id + "] 기준선 값이 전부 유한한 숫자다",
    d.guides.every((g) => 유한(g.price)),
    JSON.stringify(d.guides)
  );

  const 켬 = 켜서시리즈(K1, d.id);
  ok("[" + d.id + "] 실제로 차트에 얹힌다", 켬.list.length > 0, "시리즈 " + 켬.list.length + "개");
  ok(
    "[" + d.id + "] ★눈금 범위를 정하는 함수가 붙는다★",
    켬.list.length > 0 && 켬.list.every((s) => typeof 눈금함수(s) === "function"),
    "autoscaleInfoProvider 가 안 붙었습니다 — keepGuides 값만 남고 " +
      "실제로 눈금에 반영하는 자리(addSeriesFor)가 지워졌습니다"
  );
});

/* =======================================================================
 * [2] 눈금 범위가 ★정말★ 기준선을 포함하는가
 *     값이 아무리 좁아도 기준선이 들어와야 하고, 넓을 때 좁아지면 안 됩니다.
 * ===================================================================== */
console.log("\n[2] 눈금 범위가 기준선을 포함한다");

if (지킴정의.length) {
  const d = 지킴정의[0];
  const 켬 = 켜서시리즈(K1, d.id);
  const f = 눈금함수(켬.list[0]);
  const gp = d.guides.map((g) => g.price);
  const glo = 최소(gp);
  const ghi = 최대(gp);

  ok("기준선 최소/최대를 구했다", 유한(glo) && 유한(ghi) && glo < ghi, glo + " ~ " + ghi);

  if (typeof f === "function") {
    /* 2-1 값이 기준선보다 ★훨씬 위★ 에서만 놀 때 (회원이 확대한 그 상황) */
    const 좁게위 = f(원래범위(ghi + 20, ghi + 27));
    const r1 = 좁게위 && 좁게위.priceRange;
    ok(
      "★값이 기준선 위에 갇혀 있어도 기준선이 눈금 안에 들어온다★",
      !!r1 && r1.minValue <= glo && r1.maxValue >= ghi,
      JSON.stringify(좁게위)
    );
    ok("그러면서 데이터 쪽 위 끝은 안 잘린다", !!r1 && r1.maxValue >= ghi + 27, JSON.stringify(좁게위));

    /* 2-2 값이 기준선보다 훨씬 아래 */
    const 좁게아래 = f(원래범위(glo - 27, glo - 20));
    const r2 = 좁게아래 && 좁게아래.priceRange;
    ok(
      "값이 기준선 아래에 갇혀 있어도 기준선이 눈금 안에 들어온다",
      !!r2 && r2.minValue <= glo && r2.maxValue >= ghi,
      JSON.stringify(좁게아래)
    );
    ok("그러면서 데이터 쪽 아래 끝도 안 잘린다", !!r2 && r2.minValue <= glo - 27, JSON.stringify(좁게아래));

    /* 2-3 기준선 하나하나가 다 들어오는지 (가운데 0선까지) */
    gp.forEach((p) => {
      ok(
        "기준선 " + p + " 이 눈금 안에 있다",
        !!r1 && r1.minValue <= p && r1.maxValue >= p,
        JSON.stringify(r1)
      );
    });

    /* 2-4 ★넓을 때 좁아지면 안 됩니다★ — 기준선 때문에 눈금이 줄어들면
           큰 봉우리가 잘립니다. keepGuides 는 "늘리기만" 해야 합니다 */
    const 넓게 = f(원래범위(glo - 400, ghi + 400));
    const r3 = 넓게 && 넓게.priceRange;
    ok(
      "★데이터가 넓으면 그대로 둔다 (기준선이 눈금을 좁히지 않는다)★",
      !!r3 && r3.minValue === glo - 400 && r3.maxValue === ghi + 400,
      JSON.stringify(넓게)
    );

    /* 2-5 원래 범위를 못 받을 때도 기준선은 살아야 합니다 */
    const 없음 = f(undefined);
    ok(
      "원래 범위를 못 받아도 기준선 범위를 돌려준다",
      !!없음 && 없음.priceRange && 없음.priceRange.minValue === glo && 없음.priceRange.maxValue === ghi,
      JSON.stringify(없음)
    );
    ok(
      "★기준선 목록을 실제로 따라간다★ (다른 값을 박아두지 않았다)",
      !!없음 && 없음.priceRange.minValue === glo && 없음.priceRange.maxValue === ghi,
      "정의의 기준선 " + glo + "~" + ghi + " 인데 눈금은 " + JSON.stringify(없음)
    );

    let 던져도살았나 = false;
    let 던짐결과 = null;
    try {
      던짐결과 = f(function () {
        throw new Error("라이브러리가 던졌습니다");
      });
      던져도살았나 = true;
    } catch (e) {
      던져도살았나 = false;
    }
    ok("원래 범위를 구하다 터져도 눈금 함수는 안 던진다", 던져도살았나, "던졌습니다");
    ok(
      "그때도 기준선 범위를 돌려준다",
      !!던짐결과 && 던짐결과.priceRange.minValue === glo && 던짐결과.priceRange.maxValue === ghi,
      JSON.stringify(던짐결과)
    );

    /* 2-6 ⚠️ NaN 함정 — 이 프로젝트에서 두 번 당한 그것입니다.
           NaN 이 하나라도 새어나가면 Math.min(NaN, x) 가 NaN 이고,
           눈금이 통째로 깨지면서 ★칸이 빈 채로 조용히★ 뜹니다. */
    const 모두NaN = f(원래범위(NaN, NaN));
    ok(
      "★원래 범위가 NaN 이어도 결과에 NaN 이 안 섞인다★",
      !!모두NaN && 유한(모두NaN.priceRange.minValue) && 유한(모두NaN.priceRange.maxValue),
      JSON.stringify(모두NaN)
    );
    ok(
      "NaN 이 와도 기준선은 눈금 안에 있다",
      !!모두NaN && 모두NaN.priceRange.minValue <= glo && 모두NaN.priceRange.maxValue >= ghi,
      JSON.stringify(모두NaN)
    );

    const 한쪽NaN = f(원래범위(NaN, ghi + 500));
    ok(
      "한쪽만 NaN 이면 ★성한 쪽은 살린다★",
      !!한쪽NaN && 유한(한쪽NaN.priceRange.minValue) && 한쪽NaN.priceRange.maxValue === ghi + 500,
      JSON.stringify(한쪽NaN)
    );

    const 무한 = f(원래범위(-Infinity, Infinity));
    ok(
      "Infinity 가 와도 결과가 유한하다",
      !!무한 && 유한(무한.priceRange.minValue) && 유한(무한.priceRange.maxValue),
      JSON.stringify(무한)
    );

    const 빈것 = f(function () {
      return null;
    });
    ok(
      "원래 범위가 비어도 기준선 범위를 돌려준다",
      !!빈것 && 빈것.priceRange.minValue === glo && 빈것.priceRange.maxValue === ghi,
      JSON.stringify(빈것)
    );

    /* 2-7 결과가 뒤집히면 라이브러리가 칸을 못 그립니다 */
    [
      원래범위(ghi + 20, ghi + 27),
      원래범위(glo - 27, glo - 20),
      원래범위(glo - 400, ghi + 400),
      원래범위(NaN, NaN),
      undefined,
    ].forEach((orig, i) => {
      const r = f(orig);
      ok(
        "[" + (i + 1) + "] 결과가 뒤집히지 않는다 (min < max)",
        !!r && r.priceRange.minValue < r.priceRange.maxValue,
        JSON.stringify(r)
      );
    });

    /* 2-8 라이브러리가 준 여백(margins)은 그대로 넘겨야 합니다.
           버리면 칸 위아래 여백이 사라져 선이 테두리에 붙습니다. */
    const 여백 = f(원래범위(0, 1, { above: 11, below: 13 }));
    ok(
      "라이브러리가 준 여백(margins)을 안 버린다",
      !!여백 && 여백.margins && 여백.margins.above === 11 && 여백.margins.below === 13,
      JSON.stringify(여백)
    );
  }
}

/* =======================================================================
 * [3] ⭐ 확대 재현 — 30봉 창을 훑는다
 *     차트팀이 브라우저에서 잰 "30봉까지 당기면 기준선을 잃는다" 를
 *     ★브라우저 없이★ 다시 냅니다.
 *
 *     ⚠️ "장치를 거치면 다 들어온다" 만 검사하면 헛돌 수 있습니다 —
 *        데이터가 원래 기준선을 품고 있으면 장치가 없어도 통과합니다.
 *        그래서 ★장치가 없을 때 실제로 잃는 창이 있는지★ 를 먼저 셉니다.
 * ===================================================================== */
console.log("\n[3] 30봉까지 확대해도 기준선이 안 사라진다");

/* 단조 상승 캔들 — CCI 가 +100 위에 눌러앉습니다(한쪽으로 쏠린 장) */
function 단조상승(n) {
  const out = [];
  let px = 70000;
  for (let i = 0; i < n; i++) {
    px += 60 + Math.sin(i / 7) * 8;
    out.push({ time: 1700000000 + i * 60, open: px - 5, high: px + 8, low: px - 9, close: px, value: 50 });
  }
  return out;
}

if (지킴정의.length) {
  const B3 = boot(단조상승(300));
  const K3 = B3.K;
  const d3 = K3.listDefs().filter((x) => x.scale && x.scale.keepGuides === true)[0];
  const 켬3 = 켜서시리즈(K3, d3.id);
  const s3 = 켬3.list[0];
  const f3 = 눈금함수(s3);
  const 값 = s3 ? s3.data().map((x) => x.value) : [];
  const gp3 = d3.guides.map((g) => g.price);
  const glo3 = 최소(gp3);
  const ghi3 = 최대(gp3);

  ok("한쪽으로 쏠린 장에서 선이 그려졌다", 값.length > 30, 값.length + "점");
  ok("그 값들이 전부 유한하다", 값.length > 0 && 값.every(유한), "NaN/Infinity 가 섞였습니다");

  const 창크기 = 30;
  let 창수 = 0;
  let 장치없이잃음 = 0;
  let 장치로지킴 = 0;
  let 최악 = null;
  for (let e = 창크기; e <= 값.length; e += 10) {
    const w = 값.slice(e - 창크기, e);
    const mn = 최소(w);
    const mx = 최대(w);
    if (!유한(mn) || !유한(mx)) continue;
    창수++;
    if (mn > glo3 || mx < ghi3) {
      장치없이잃음++;
      if (!최악) 최악 = mn.toFixed(1) + " ~ " + mx.toFixed(1);
    }
    const r = f3 ? f3(원래범위(mn, mx)) : null;
    if (r && r.priceRange.minValue <= glo3 && r.priceRange.maxValue >= ghi3) 장치로지킴++;
  }

  ok("30봉 창을 여러 개 훑었다", 창수 >= 10, 창수 + "개");
  ok(
    "★장치가 없으면 실제로 기준선을 잃는 창이 있다★ (검사가 헛돌지 않게)",
    장치없이잃음 > 0,
    "0개 — 이 캔들로는 재현이 안 됩니다. 캔들을 더 한쪽으로 쏠리게 만드세요"
  );
  ok(
    "★장치를 거치면 모든 창에서 기준선이 눈금 안에 있다★",
    창수 > 0 && 장치로지킴 === 창수,
    장치로지킴 + "/" + 창수 + " 창만 지켰습니다"
  );
  console.log(
    "      실측 — 창 " + 창수 + "개 · 장치 없으면 " + 장치없이잃음 + "개가 기준선을 잃음(예: 값 " +
      최악 + ", 기준선 " + glo3 + "~" + ghi3 + ") · 장치로 " + 장치로지킴 + "개 지킴"
  );
}

/* =======================================================================
 * [4] define() 이 잘못된 조합을 ★거부★ 하는가
 *     조용히 넘기면 회원 화면에서만 티가 납니다.
 * ===================================================================== */
console.log("\n[4] define() 이 잘못된 keepGuides 를 거부한다");

{
  const B4 = boot(makeCandles(120));
  const K4 = B4.K;
  const 좋은색 = K4.LINE_COLORS[6].hex;
  let seq = 0;
  function 정의(over) {
    return Object.assign(
      {
        id: "kg-" + ++seq,
        name: "지킴검사",
        pane: "sub",
        params: { p: 5 },
        outputs: [{ key: "v", kind: "line", color: 좋은색, style: "solid" }],
        guides: [{ price: 100 }, { price: -100 }],
        seed: function (bs) {
          const out = [];
          for (let i = 0; i < bs.close.length; i++) out.push({ time: bs.time[i], value: bs.close[i] });
          return { v: out };
        },
        step: function (st, bar) {
          return { values: { v: bar.close }, state: st || {} };
        },
      },
      over || {}
    );
  }
  function 거부되나(이름, over, 경고에들어갈말) {
    const n = B4.warns.length;
    const def = 정의(over);
    const r = K4.define(def);
    const 새경고 = B4.warns.slice(n);
    ok("★" + 이름 + " → 거부★", r === false, "돌려준 값 " + String(r) + " (조용히 통과했습니다)");
    ok("  " + 이름 + " → 왜 거부했는지 알린다", 새경고.length > 0, "경고 0건");
    if (경고에들어갈말) {
      ok(
        "  " + 이름 + " → 경고에 이유가 적힌다",
        새경고.some((w) => w.indexOf(경고에들어갈말) >= 0),
        새경고.join(" | ")
      );
    }
    ok("  " + 이름 + " → 목록에 안 올라간다", !K4.listDefs().some((x) => x.id === def.id), def.id);
  }

  거부되나("keepGuides + min/max 를 같이 적음", { scale: { keepGuides: true, min: 0, max: 100 } }, "keepGuides");
  거부되나("keepGuides 인데 기준선이 없음", { guides: [], scale: { keepGuides: true } }, "guides");
  거부되나("keepGuides 가 글자", { scale: { keepGuides: "yes" } }, "true/false");
  거부되나("keepGuides 가 숫자 1", { scale: { keepGuides: 1 } }, "true/false");
  거부되나("keepGuides 를 주 칸(main)에", { pane: "main", scale: { keepGuides: true } }, "sub");

  /* 정상은 통과해야 합니다 — 거부만 잘하고 통과를 막으면 지표를 못 만듭니다 */
  const n5 = B4.warns.length;
  const 좋은정의 = 정의({ scale: { keepGuides: true } });
  const r5 = K4.define(좋은정의);
  ok("정상 조합(sub + 기준선 + keepGuides)은 통과한다", r5 === true, String(r5));
  ok("정상 조합은 경고가 안 난다", B4.warns.length === n5, B4.warns.slice(n5).join(" | "));
  const 등록 = K4.listDefs().filter((x) => x.id === 좋은정의.id)[0];
  ok(
    "★등록된 정의에 keepGuides 가 그대로 남는다★ (조용히 버리지 않는다)",
    !!등록 && 등록.scale && 등록.scale.keepGuides === true,
    등록 ? JSON.stringify(등록.scale) : "정의가 없습니다"
  );
  const 켬5 = 켜서시리즈(K4, 좋은정의.id);
  ok(
    "그 정의를 켜면 눈금 함수가 붙는다",
    켬5.list.length > 0 && 켬5.list.every((s) => typeof 눈금함수(s) === "function"),
    "시리즈 " + 켬5.list.length + "개"
  );
  const f5 = 눈금함수(켬5.list[0]);
  const r5b = f5 ? f5(원래범위(500, 507)) : null;
  ok(
    "새로 만든 지표에서도 기준선이 눈금 안에 들어온다",
    !!r5b && r5b.priceRange.minValue <= -100 && r5b.priceRange.maxValue >= 100,
    JSON.stringify(r5b)
  );

  /* keepGuides:false 는 "안 켬" 이지 오류가 아닙니다 */
  const n6 = B4.warns.length;
  const 꺼둠 = 정의({ scale: { keepGuides: false, top: 0.1 } });
  ok("keepGuides:false 는 그냥 통과한다", K4.define(꺼둠) === true);
  ok("keepGuides:false 는 경고가 안 난다", B4.warns.length === n6, B4.warns.slice(n6).join(" | "));
  const 켬6 = 켜서시리즈(K4, 꺼둠.id);
  ok(
    "keepGuides:false 면 눈금 함수를 안 붙인다",
    켬6.list.length > 0 && 켬6.list.every((s) => 눈금함수(s) === undefined),
    "안 켰는데 눈금이 기준선에 묶였습니다"
  );
}

/* =======================================================================
 * [5] 엉뚱한 지표에 붙지 않았는가
 *     keepGuides 는 ★스스로 켜지지 않는★ 옵션이어야 합니다.
 * ===================================================================== */
console.log("\n[5] 다른 지표에는 안 붙어 있다");

{
  const B5 = boot(makeCandles(300));
  const K5 = B5.K;
  const L5 = K5.listDefs();
  const 찾기 = (id) => L5.filter((d) => d.id === id)[0] || null;

  /* ── MACD — 값이 0 을 늘 오가서 0선이 저절로 들어옵니다.
        게다가 다른 팀 봉인이 "MACD 는 autoscaleInfoProvider 를 안 건다" 를 봅니다.
        여기에 keepGuides 가 붙으면 그 봉인과 정면으로 부딪힙니다. */
  const macd = 찾기("macd");
  ok("MACD 정의가 있다", !!macd, "id 가 바뀌었으면 이 줄을 고치세요");
  if (macd) {
    ok(
      "★MACD 에는 keepGuides 가 안 붙어 있다★",
      !(macd.scale && macd.scale.keepGuides === true),
      JSON.stringify(macd.scale)
    );
    ok(
      "MACD 는 min/max 로도 안 고정한다 (값이 가격 차이라 범위가 매번 다름)",
      !macd.scale || macd.scale.min === null,
      JSON.stringify(macd.scale)
    );
    const 켬 = 켜서시리즈(K5, "macd");
    ok("MACD 가 차트에 얹힌다", 켬.list.length > 0, "시리즈 " + 켬.list.length + "개");
    ok(
      "★MACD 시리즈에 눈금 함수가 안 붙는다★",
      켬.list.length > 0 && 켬.list.every((s) => 눈금함수(s) === undefined),
      "붙었습니다 — 다른 팀의 'MACD 는 autoscaleInfoProvider 를 안 건다' 봉인과 부딪힙니다"
    );
  }

  /* ── StochRSI · Stochastic · RSI — 정의상 0~100 짜리입니다(값의 뜻이 백분율).
        여기에 keepGuides 를 붙이면 0~100 고정이 풀려서 눈금이 매 틱 출렁입니다.
        ⚠️ 0 · 100 은 "재서 나온 숫자" 가 아니라 ★그 지표의 정의★ 라 박아 둡니다. */
  ["srsi", "stoch", "rsi"].forEach((id) => {
    const d = 찾기(id);
    ok("[" + id + "] 정의가 있다", !!d, "id 가 바뀌었으면 이 줄을 고치세요");
    if (!d) return;
    ok(
      "[" + id + "] scale 이 0~100 으로 고정돼 있다",
      !!d.scale && d.scale.min === 0 && d.scale.max === 100,
      JSON.stringify(d.scale)
    );
    ok("[" + id + "] ★keepGuides 가 아니다★", d.scale.keepGuides !== true, JSON.stringify(d.scale));

    const 켬 = 켜서시리즈(K5, id);
    ok("[" + id + "] 차트에 얹힌다", 켬.list.length > 0, "시리즈 " + 켬.list.length + "개");
    const f = 켬.list.length ? 눈금함수(켬.list[0]) : undefined;
    ok("[" + id + "] 눈금 함수가 붙는다 (0~100 고정)", typeof f === "function");
    if (typeof f === "function") {
      const 좁게 = f(원래범위(40, 60));
      const 넓게 = f(원래범위(-500, 500));
      ok(
        "[" + id + "] ★값이 좁아도 눈금은 0~100 그대로다★",
        !!좁게 && 좁게.priceRange.minValue === d.scale.min && 좁게.priceRange.maxValue === d.scale.max,
        JSON.stringify(좁게)
      );
      ok(
        "[" + id + "] 기준선 때문에 눈금이 늘어나지 않는다 (keepGuides 가 새어들지 않았다)",
        !!넓게 && 넓게.priceRange.minValue === d.scale.min && 넓게.priceRange.maxValue === d.scale.max,
        JSON.stringify(넓게)
      );
    }
  });

  /* ── 일반 규칙 — 손으로 적은 목록이 아니라 ★전부★ 를 훑습니다.
        새 지표가 들어와도 이 규칙은 따라옵니다. */
  const 고정정의 = L5.filter((d) => d.scale && d.scale.min !== null);
  ok("눈금을 0~100 처럼 고정한 지표가 있다", 고정정의.length > 0, String(고정정의.length) + "개");
  ok(
    "★고정(min/max)한 지표는 하나도 keepGuides 가 아니다★",
    고정정의.every((d) => d.scale.keepGuides !== true),
    고정정의.filter((d) => d.scale.keepGuides === true).map((d) => d.id).join(", ")
  );
  ok(
    "★keepGuides 인 지표는 전부 sub 칸이고 기준선을 갖는다★",
    L5.filter((d) => d.scale && d.scale.keepGuides === true).every(
      (d) => d.pane === "sub" && d.guides.length > 0
    ),
    "규칙을 어긴 정의가 있습니다"
  );
  ok(
    "keepGuides 가 저절로 번지지 않았다 (기준선 없는 지표엔 안 붙음)",
    L5.filter((d) => !d.guides || !d.guides.length).every(
      (d) => !(d.scale && d.scale.keepGuides === true)
    ),
    "기준선 없는 지표에 붙었습니다"
  );
  ok("이 절이 실제로 지표를 태웠다 (경고 없이)", B5.warns.length === 0, B5.warns.slice(0, 3).join(" | "));
}

/* ===================================================================== */
/* ⚠️ 요약 줄은 반드시 이 형식이어야 합니다 — "통과 N / 실패 M".
   tests/_run-all.js 가 이 글자로 결과를 셉니다. "통과: 96/96" 처럼 적으면
   실행기가 ★뒤 숫자를 실패 수로★ 읽어 96건 실패로 잡습니다 (2026-09-03 실측 —
   이 파일이 처음에 그 형식이었고, npm test 에서 "실패 96건" 으로 나왔습니다).
   그리고 끝에서 반드시 프로세스를 끝냅니다 — 안 끝내면 npm test 가 여기서 멈추고
   뒤 파일이 아예 안 돕니다. */
console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
  process.exit(1);
}
process.exit(0);
