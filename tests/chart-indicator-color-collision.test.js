/* tests/chart-indicator-color-collision.test.js
 * =========================================================================
 * 봉인 — ★새로 얹은 지표선이 이미 있는 선과 같은 색으로 나오는 것★
 * =========================================================================
 * 2026-09-02 기록팀. 오늘 실제로 두 번 났고 두 번 다 사람 눈으로 잡았습니다.
 *
 * ── 무엇이 실제로 있었나 ────────────────────────────────────────────────
 *   2026-08-31   시세선과 MA(7) 이 둘 다 금색 #F0B429 이라 ★회원 화면의
 *                62.7% 에서 한 줄로 보였습니다.★
 *   2026-09-02   suggestColor() 가 무조건 앞에서부터 골라 첫 줄에 금색을
 *                줬습니다. MA(7) 을 켜 둔 회원에게 WMA 가 ★MA(7) 과 같은 색★
 *                으로 나왔습니다. 차트팀이 LEGACY_HEXES 를 뒤로 미뤄 고쳤습니다.
 *
 *   둘 다 오류 0건 · 화면 멀쩡 · ★내용만 틀린★ 조용한 고장입니다. 회원은
 *   두 지표가 겹쳐 있는 줄 모르고 한 선만 보고 판단합니다.
 *
 * ── 왜 테스트가 필요한가 ────────────────────────────────────────────────
 *   지표가 오늘 하루에 6개 늘었습니다(EMA · WMA · KDJ · ATR · StochRSI · CCI).
 *   색 목록은 20색인데 정의는 9개고 KDJ 는 혼자 3선을 씁니다. ★선이 색보다
 *   빨리 늡니다.★ 다음 사람이 지표를 하나 더 얹을 때 눈으로 세는 것으로는
 *   못 막습니다.
 *
 * ── ⚠️ 숫자를 박지 않습니다 ─────────────────────────────────────────────
 *   차트팀이 지금 이 파일이 보는 js/chart-indicator-kit.js 를 잡고 있습니다.
 *   색이 12 → 20 으로 이미 늘었고 더 늘 수 있습니다. 그래서 이 봉인은
 *   ★"몇 개인가" 를 묻지 않고 "목록 길이보다 하나 더 얹으면 어떻게 되는가"★
 *   를 묻습니다. 정의 개수도 K.listDefs() 로 그때그때 셉니다.
 *
 * ── 회원 경로 그대로 ────────────────────────────────────────────────────
 *   회원이 "지표 추가" 를 누르면 js/chart-indicator-settings.js 가
 *       suggestColor()  →  createInstance()  →  updateInstance(첫 선 색)
 *   순서로 부릅니다. 이 파일의 회원추가() 가 그 세 줄을 그대로 흉내냅니다.
 *   ★틀의 API 를 따로 부르지 않습니다★ — 회원이 실제로 지나는 길만 잽니다.
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

console.log("\n지표선 색 겹침 봉인 (같은 색 두 줄 금지)");

/* ── 색 도우미 ──────────────────────────────────────────────────────────
 * ΔE76 (CIE Lab 거리) 로 잽니다. js/chart-indicator-kit.js 의 LINE_COLORS
 * 주석이 "색끼리 Lab 거리 22 이상 · 손익색과 46.4 이상" 으로 골랐다고
 * 적어 두었습니다. ★그 말이 지금도 사실인지★ 를 여기서 매번 다시 잽니다. */
function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
function lab(hex) {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const p = rgb(hex).map((v) => f(v / 255));
  const g = (c) => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);
  const X = g((0.4124 * p[0] + 0.3576 * p[1] + 0.1805 * p[2]) / 0.95047);
  const Y = g(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]);
  const Z = g((0.0193 * p[0] + 0.1192 * p[1] + 0.9505 * p[2]) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}
function dE(a, b) {
  const A = lab(a);
  const Bb = lab(b);
  return Math.sqrt((A[0] - Bb[0]) ** 2 + (A[1] - Bb[1]) ** 2 + (A[2] - Bb[2]) ** 2);
}

const 상승색 = "#26C281";
const 하락색 = "#F0506E";
/* 기존 7개(MA7 · MA25 · MA99 · RSI · MACD)가 이미 쓰고 있는 색.
   js/chart-indicators.js · js/chart-oscillators.js 에서 온 값입니다. */
const 기존색 = ["#F0B429", "#E7ECF5", "#838DA4"];

/**
 * 회원이 "지표 추가" 에서 한 줄 얹는 것과 ★같은 순서★.
 * (js/chart-indicator-settings.js 의 pickrow click 처리 그대로)
 */
function 회원추가(K, defId, params) {
  const hex = K.suggestColor();
  const id = K.createInstance(defId, params ? { on: true, params: params } : { on: true });
  if (!id) return { id: null, hex: hex };
  const inst = K.listInstances().filter((i) => i.id === id)[0];
  if (inst && hex) {
    const first = Object.keys(inst.colors)[0];
    if (first) {
      const c = {};
      c[first] = hex;
      K.updateInstance(id, { colors: c });
    }
  }
  return { id: id, hex: hex };
}

/* ⭐⭐ ★같은 바닥★ 이 무엇인가 (2026-09-02 저녁에 바로잡았습니다)
 *
 * 색이 겹쳐서 회원이 손해를 보는 것은 ★두 선이 같은 눈금 위에 나란히★ 놓일
 * 때입니다. 처음엔 이 파일이 pane 값("main" / "sub")으로 묶었는데, 그러면
 * ★아래 칸 지표 일곱 개를 한 칸으로★ 셉니다. 사실이 아닙니다.
 *
 * js/chart-indicator-kit.js 의 turnOn() 을 보면
 *     var pane = it.pane === "sub" ? makePane() : null;
 * 즉 ★아래 칸 지표는 켤 때마다 자기 칸을 새로 만듭니다.★ KDJ 와 CCI 를 둘 다
 * 켜면 칸이 두 개 생기고, 둘이 같은 색이어도 한 줄로 보이지 않습니다.
 * 같은 바닥을 실제로 나눠 쓰는 것은 ★주 차트에 얹는 것들끼리★ 입니다.
 *
 * ⚠️ 왜 이걸 지금 바로잡나 - 지표가 13개가 되면서 ★선이 26개, 색은 20개★ 가
 *    됐습니다. "화면의 모든 선이 서로 달라야 한다" 는 이제 ★지킬 수 없는 약속★
 *    입니다. 지킬 수 없는 약속을 걸어 두면 다음 사람이 빨간 줄을 보고 "원래
 *    빨갛다" 며 넘기게 되고, 그러면 ★진짜 겹침도 같이 묻힙니다.★
 *    그래서 약속을 ★지킬 수 있고 뜻이 있는 것★ 으로 바꿉니다 -
 *        · 같은 바닥에서는 ★절대★ 안 겹친다              (완화 금지)
 *        · 색이 남아 있는 동안은 화면 전체에서 안 겹친다  (자원이 있는 동안)
 */
function 바닥(i) {
  return i.pane === "sub" ? "sub:" + i.id : "main";
}

/* ⭐⭐⭐ 2026-09-02 (12단계) — ★무엇을 "겹쳤다" 고 부를 것인가★ 를 고쳤습니다
 *        (PM 승인. 차트팀이 옛 볼린저를 틀로 옮기면서 드러난 것)
 *
 * ── 무엇이 드러났나 ─────────────────────────────────────────────────────
 * 볼린저가 틀 밖(js/chart-indicators.js)에 있어서 이 봉인이 여태 못 봤습니다.
 * 틀로 들어오자마자 10건이 빨개졌는데, 그 10건이 전부 ★지금 회원이 보고 있는
 * 화면 그대로★ 였습니다.
 *     main  ma-99.ma ↔ bb-20.upper / middle / lower   (넷 다 #838DA4)
 *
 * 그런데 그건 사고가 아니라 ★이 상품의 원래 설계★ 입니다. 옛 파일이 직접
 * 그렇게 적어 두었습니다 —
 *     js/chart-indicators.js:79
 *       "볼린저는 #838DA4 점선 셋 — 실선인 MA(99)와 선 모양으로 구분됩니다."
 * 즉 ★색은 같고 선 모양으로 가른다★ 가 처음부터의 약속이었습니다.
 *
 * ── 그래서 봉인을 ★넓힌 게 아니라 정확하게★ 만들었습니다 ─────────────────
 *     봉인이 지키려던 것   "두 선이 ★한 줄로 보이는 것★"
 *     옛 재는 방식         색만 봄       -> 점선/실선 차이를 ★못 봄★
 *     새 재는 방식         색 + 선 모양  -> 진짜로 갈리는지를 봄
 *
 * ⚠️ ★굵기는 일부러 안 넣었습니다.★ PM 지시는 "색+선모양+굵기가 전부 같으면
 *    실패" 였고, 아래 판정은 그보다 ★더 엄격합니다★ (굵기가 달라도 색·선모양이
 *    같으면 실패). 굵기를 봐주면 2026-08-31 사고가 통과해 버립니다 —
 *    그때 시세선(금색 2px)과 MA(7)(금색 1px)이 ★굵기가 달랐는데도★ 회원 화면의
 *    62.7% 에서 한 줄로 보였습니다. 1px 과 2px 은 겹쳐 놓으면 안 갈립니다.
 *    굵기는 실패 메시지에 ★적기만★ 합니다.
 *
 * ── 밴드(위/중간/아래)는 한 색이 맞습니다 ───────────────────────────────
 * 볼린저의 위·중간·아래는 ★한 덩어리★ 라 트레이딩뷰도 같은 색으로 그립니다.
 * 서로 겹칠 일도 없습니다(늘 위 > 중간 > 아래). 그래서 ★같은 인스턴스 안★ 에서만
 * 봐줍니다. 아래 목록에 이름이 있는 정의에 ★한해서★ 입니다.
 *
 * ⚠️ 이 목록에 이름을 더하려면 ★근거를 날짜와 함께 여기에 적으세요.★
 *    그리고 밴드로 선언하면 [2] 절이 거꾸로 ★색이 전부 같은지★ 를 요구합니다 —
 *    "비슷하지만 다른 색" 을 슬쩍 넣는 길을 막으려는 것입니다.
 *
 *   bb   2026-09-02. 옛 js/chart-indicators.js 의 볼린저를 그대로 옮긴 것.
 *        위·중간·아래 셋 다 #838DA4 점선. 회원이 몇 달째 보던 화면이고
 *        PM 이 "색을 바꾸지 마세요 · 옮긴 뒤에도 회색 4개여야 합니다" 로 정했습니다.
 */
const 밴드정의 = ["bb"];

function 밴드인가(defId) {
  return 밴드정의.indexOf(defId) >= 0;
}

/** 그 선이 실제로 그려지는 선 모양. 인스턴스가 정한 것이 우선이고,
 *  없으면 정의가 그 선에 준 기본값입니다(js/chart-indicator-kit.js addSeriesFor 와 같은 순서). */
function 선모양(K, inst, outKey) {
  if (inst.style) return inst.style;
  const d = (K.getDefsForTest() || {})[inst.def];
  const o = d && d.outputs ? d.outputs.filter((x) => x.key === outKey)[0] : null;
  return (o && o.style) || "solid";
}

/** 지금 화면에 있는 모든 선 - [{id, def, key, hex, 선모양, 굵기, pane, 바닥}] */
function 모든선(K) {
  const out = [];
  K.listInstances().forEach((i) => {
    Object.keys(i.colors).forEach((k) =>
      out.push({
        id: i.id,
        def: i.def,
        key: k,
        hex: i.colors[k],
        선모양: 선모양(K, i, k),
        굵기: i.width || 1,
        pane: i.pane,
        바닥: 바닥(i),
      })
    );
  });
  return out;
}

/** 선 몇 개가 실려 있나 (색 개수와 견주려고) */
function 선수(K) {
  let n = 0;
  K.listInstances().forEach((i) => (n += Object.keys(i.colors).length));
  return n;
}

/** 같은 바닥끼리만 묶어서 겹친 쌍을 찾습니다 */
function 바닥별겹침(선들) {
  const 묶음 = {};
  선들.forEach((s) => (묶음[s.바닥] = 묶음[s.바닥] || []).push(s));
  let out = [];
  Object.keys(묶음).forEach((g) => {
    out = out.concat(겹친쌍(묶음[g]).map((x) => g + " " + x));
  });
  return out;
}

/**
 * ★한 줄로 보이는 쌍★ 을 찾습니다 (위 12단계 주석 참조).
 *   · 색이 다르면          갈립니다
 *   · 색이 같아도 선 모양이 다르면(점선 ↔ 실선) 갈립니다
 *   · 색도 선 모양도 같으면 ★굵기가 달라도 한 줄로 보입니다★ -> 겹침
 *   · 단, ★같은 인스턴스 안의 밴드★(볼린저 위/중간/아래)는 한 덩어리라 봐줍니다
 */
function 겹친쌍(선들) {
  const 겹침 = [];
  for (let a = 0; a < 선들.length; a++) {
    for (let b = a + 1; b < 선들.length; b++) {
      const x = 선들[a];
      const y = 선들[b];
      if (x.hex !== y.hex) continue;
      if (x.선모양 !== y.선모양) continue;
      if (x.id === y.id && 밴드인가(x.def)) continue;
      겹침.push(
        x.id + "." + x.key + " ↔ " + y.id + "." + y.key +
          " (" + x.hex + " " + x.선모양 + " " + x.굵기 + "px/" + y.굵기 + "px)"
      );
    }
  }
  return 겹침;
}

/* =======================================================================
 * [1] 색 목록 자체가 지켜야 하는 것
 *
 * ⚠️ ★여기서 검사하지 않습니다.★ tests/chart-indicator-kit-seal.test.js 의
 *    [1] 절이 이미 같은 것을 잽니다 — ΔE76 22 이상 · ΔE2000 9.7 이상 ·
 *    상승/하락색과 46 이상 · 배경 명암비 4.5 이상 · 초록/빨강 구간 제외.
 *    (2026-09-02 저녁에 그 파일이 그 검사를 갖추었습니다)
 *
 *    같은 규칙을 여기에도 적으면 ★같은 값 두 벌★ 이 됩니다. 이 프로젝트가
 *    오늘까지 여러 번 당한 모양이고, 두 벌이 되면 한쪽만 고쳐져서 어느 쪽이
 *    사실인지 알 수 없게 됩니다. 그래서 지웠습니다.
 *
 *    ★색 목록의 규칙은 저 파일, 화면에서 겹치는지는 이 파일★ 로 나눕니다.
 *    아래 도우미(dE)는 [2] 절이 정의의 기본색끼리 재는 데 씁니다.
 * ===================================================================== */

/* =======================================================================
 * [2] 정의가 들고 있는 기본색
 *     ⚠️ 정의가 늘면 자동으로 같이 검사됩니다 - 목록을 손으로 안 적습니다.
 * ===================================================================== */
console.log("\n[2] 정의의 기본색 (KDJ 3선 · StochRSI 2선)");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const defs = K.getDefsForTest();
  const 목록 = K.listDefs();
  const hexes = (K.LINE_COLORS || []).map((c) => c.hex);

  ok("등록된 정의가 하나 이상 있다", 목록.length > 0, String(목록.length));

  목록.forEach((d) => {
    const outs = (defs[d.id] && defs[d.id].outputs) || [];
    const 색들 = outs.map((o) => o.color);
    if (색들.length > 1 && 밴드인가(d.id)) {
      /* ⭐ 밴드로 선언한 정의는 ★거꾸로★ 봅니다 - 전부 같은 색이어야 합니다.
         "다를 필요 없다" 로만 두면 "비슷하지만 다른 색" 을 슬쩍 넣을 수 있고,
         그건 밴드도 아니고 구분도 안 되는 최악입니다. */
      ok(
        d.id + " 는 ★밴드★ 라 선 " + 색들.length + "개가 전부 같은 색이다",
        new Set(색들).size === 1,
        색들.join(" ")
      );
    } else if (색들.length > 1) {
      ok(
        d.id + " 는 선이 " + 색들.length + "개인데 서로 다른 색이다",
        new Set(색들).size === 색들.length,
        색들.join(" ")
      );
      /* "다르기만" 해서는 모자랍니다 — 한 칸에 나란히 그려지는 선이라
         회원 눈에 갈라져야 합니다. 색 목록이 지키는 바닥값과 같은 22 로 봅니다. */
      let 최소 = Infinity;
      let 쌍 = "";
      for (let a = 0; a < 색들.length; a++) {
        for (let b = a + 1; b < 색들.length; b++) {
          const v = dE(색들[a], 색들[b]);
          if (v < 최소) {
            최소 = v;
            쌍 = 색들[a] + " / " + 색들[b];
          }
        }
      }
      ok(
        d.id + " 의 선끼리 Lab 거리(ΔE76)가 22 이상이다",
        최소 >= 22,
        "제일 가까운 쌍 " + 쌍 + " = " + 최소.toFixed(2)
      );
    }
    ok(
      d.id + " 의 기본색이 전부 색 목록 안에 있다",
      색들.every((c) => hexes.indexOf(c) >= 0),
      색들.filter((c) => hexes.indexOf(c) < 0).join(" ")
    );
  });
}

/* =======================================================================
 * [3] ⭐ 회원 경로 - "지표 추가" 로 하나씩 다 얹었을 때
 * ===================================================================== */
console.log("\n[3] 회원이 지표를 하나씩 다 얹었을 때");
{
  const B = boot(makeCandles(150));
  const K = B.K;
  const 정의들 = K.listDefs().map((d) => d.id);

  /* 처음 오는 회원에게 이미 얹혀 있는 기본 인스턴스가 있습니다.
     그것들이 쓰는 색도 같이 셉니다 - 회원 눈에는 다 같은 선입니다. */
  const 시작선 = 모든선(K);
  ok("기본 인스턴스끼리는 색이 안 겹친다", 겹친쌍(시작선).length === 0, 겹친쌍(시작선).join(", "));

  const 골라진색 = [];
  정의들.forEach((id) => {
    const r = 회원추가(K, id);
    골라진색.push(r.hex);
    ok("지표 추가로 " + id + " 를 얹을 수 있다", !!r.id, "createInstance 가 null 을 냈습니다");
  });

  /* suggestColor 가 고른 색끼리 - 자유색이 남아 있는 동안은 전부 달라야 합니다.
     ⚠️ 2026-09-02 (11단계) 에 재는 자리를 고쳤습니다.
        그전 조건은 "얹은 개수 <= 색수 - 3" 이었는데, ★한 인스턴스가 선을
        여럿 들고 있다★ 는 것을 안 세고 있었습니다(KDJ 3선 · 일목 5선).
        그래서 실제로는 색이 다 떨어졌는데도 "다 달라야 한다" 고 요구했습니다.
        실측 - 옛 MA 를 틀로 옮기자(정의 13 -> 14, 선 26 -> 30) 그 자리에서
        #499EE9 가 세 번 나왔습니다. 셋 다 ★서로 다른 칸★ 이라 한 줄로는 안
        보이고, 그건 바로 아래 "같은 바닥" 검사가 지킵니다(지금도 0건).
        그래서 아래 검사와 같은 잣대(선 개수 vs 색 개수)로 맞췄습니다. */
  const 색수 = (K.LINE_COLORS || []).length;
  if (선수(K) <= 색수) {
    ok(
      "틀이 고른 색끼리 하나도 안 겹친다",
      new Set(골라진색).size === 골라진색.length,
      골라진색.join(" ")
    );
  } else {
    console.log(
      "      (선 " + 선수(K) + "개 > 색 " + 색수 + "개 - 색이 다 차서 고른 색 비교는 건너뜁니다)"
    );
  }

  /* ⚠️ ★자유색이 남아 있는 동안만★ 입니다. 다 쓰고 나면 틀이 일부러 기존 MA
     색도 씁니다(js/chart-indicator-kit.js suggestColor 의 마지막 물러설 자리).
     "색이 없으니 아무것도 못 얹습니다" 보다는 그게 낫습니다. */
  if (선수(K) <= 색수) {
    ok(
      "틀이 고른 색에 기존 MA 색(금 · 흰 · 회)이 안 섞인다",
      골라진색.every((h) => 기존색.indexOf(h) < 0),
      골라진색.filter((h) => 기존색.indexOf(h) >= 0).join(" ")
    );
  } else {
    console.log(
      "      (선 " + 선수(K) + "개 > 색 " + 색수 + "개 - 색이 다 차서 기존 MA 색 검사는 건너뜁니다)"
    );
  }

  /* ⭐⭐ 여기가 핵심입니다 - ★같은 바닥에 놓인 선★ 은 절대 같은 색이면 안 됩니다.
     KDJ(3선) · 일목(5선) 처럼 한 인스턴스가 선을 여럿 들고 있어서,
     "첫 선만" 새 색으로 바꾸면 ★자기 둘째 선과 부딪힐 수 있습니다.★ */
  const 선들 = 모든선(K);
  const 바닥겹침 = 바닥별겹침(선들);
  ok(
    "★같은 바닥★ 에서는 색이 하나도 안 겹친다 (선 " + 선들.length + "개 · 색 " + 색수 + "개)",
    바닥겹침.length === 0,
    바닥겹침.join(" / ")
  );

  /* 화면 전체 - ★색이 남아 있는 동안만★ 약속할 수 있습니다.
     (선 26개 · 색 20개 이면 비둘기집 원리로 반드시 겹칩니다) */
  const 겹침 = 겹친쌍(선들);
  if (선들.length <= 색수) {
    ok(
      "화면의 모든 지표선이 서로 다른 색이다 (선 " + 선들.length + "개 · 색 " + 색수 + "개)",
      겹침.length === 0,
      겹침.join(" / ")
    );
  } else {
    ok(
      "색이 모자랄 때 겹치는 것은 ★서로 다른 바닥끼리뿐★ 이다 (선 " +
        선들.length + "개 · 색 " + 색수 + "개 · 겹친 쌍 " + 겹침.length + ")",
      바닥겹침.length === 0,
      바닥겹침.join(" / ")
    );
  }

  /* 더 좁은 검사 - ★한 인스턴스 안★ 에서 겹치는 것은 어떤 경우에도 안 됩니다.
     같은 칸 같은 눈금에 나란히 그려지기 때문에 회원이 선 하나로 봅니다. */
  K.listInstances().forEach((i) => {
    const 색들 = Object.keys(i.colors).map((k) => i.colors[k]);
    if (색들.length < 2) return;
    const 글 = Object.keys(i.colors).map((k) => k + "=" + i.colors[k]).join(" ");
    if (밴드인가(i.def)) {
      /* 밴드는 한 덩어리 - 셋이 ★같은 색이어야★ 합니다(위 12단계 주석) */
      ok(i.id + " 안의 " + 색들.length + "개 선이 ★밴드라 전부 같은 색★ 이다", new Set(색들).size === 1, 글);
      return;
    }
    ok(i.id + " 안의 " + 색들.length + "개 선이 서로 다른 색이다", new Set(색들).size === 색들.length, 글);
  });

  /* 바닥 하나하나를 따로 봅니다. ★이건 절대 완화하면 안 됩니다.★ */
  const 칸별 = {};
  선들.forEach((s) => {
    (칸별[s.바닥] = 칸별[s.바닥] || []).push(s);
  });
  Object.keys(칸별).forEach((g) => {
    const 겹 = 겹친쌍(칸별[g]);
    ok(
      "같은 바닥(" + g + " · 선 " + 칸별[g].length + "개) 안에서 색이 안 겹친다",
      겹.length === 0,
      겹.join(" / ")
    );
  });
}

/* =======================================================================
 * [3-2] ⭐ 얹는 ★순서★ 를 바꿔도 겹치지 않는다  (2026-09-02 고쳐졌습니다)
  *
  * 위 [3] 은 "지표 추가" 목록에 나오는 차례대로 얹은 한 가지 길만 봅니다.
  * 회원은 아무 순서로나 누릅니다. 여기서는 순서를 바꿔 가며 다시 잽니다.
  *
  * ── 고치기 ★전★ 실측 (2026-09-02 · 기록팀이 이 절을 만들며 잰 값) ──────
  *     같은 칸 안에서 겹친 순서   131 / 무작위 600
  *     어디서든 겹친 순서         214 / 무작위 600
  *   제일 짧은 재현 — ★ATR → SAR → CCI → KDJ★ 네 번이면 났습니다.
  *     CCI 가 suggestColor 로 #E1ED97 을 받고, 뒤이어 얹은 KDJ 의 D 선이
  *     정의 기본색 #E1ED97 그대로라 ★둘 다 아래 칸에서 같은 색★ 이었습니다.
  *
  * ── 왜 났었나 ───────────────────────────────────────────────────────────
  *   그때 고쳐 둔 것은 "★새로 얹는 줄 안에서★ 겹치지 않게" 까지였습니다
  *   (pickFreeColor 의 banned 가 제 줄만 봅니다). ★이미 있는 다른 줄★ 과의
  *   비교는 첫 선에만 걸려 있었고, 둘째 · 셋째 선은 정의 기본색 그대로라
  *   선이 여럿인 지표(KDJ 3선 · StochRSI 2선)를 나중에 얹으면 부딪혔습니다.
  *
  * ── 어떻게 고쳤나 (2026-09-02 · 차트팀) ────────────────────────────────
  *   js/chart-indicator-kit.js 의 createInstance 가 autoColors() 로
  *   ★모든 출력선★ 에 아직 안 쓰인 색을 채웁니다. 회원이 직접 준 색
  *   (opts.colors)과 저장소에서 되살리는 색(loadState)은 안 건드립니다.
  *
  * ── 고치고 난 뒤 실측 ───────────────────────────────────────────────────
  *   ATR → SAR → CCI → KDJ  같은 칸 겹침 0
  *   결정적 순서 11가지 · 무작위 600가지 모두 ★같은 칸 0 · 어디서든 0★
 * ===================================================================== */
console.log("\n[3-2] 얹는 순서를 바꿔도 겹치지 않는다");
{
  /* 무작위를 안 씁니다 — 흔들리는 테스트는 아무도 안 믿습니다.
     정의 목록에서 ★정해진 방법★ 으로 순서를 만듭니다(정의가 늘면 같이 늡니다). */
  function 순서들(defs) {
    const 목록 = [defs.slice(), defs.slice().reverse()];
    for (let r = 1; r < defs.length; r++) {
      목록.push(defs.slice(r).concat(defs.slice(0, r)));
    }
    /* 제일 짧은 재현 — 있으면 같이 넣습니다 */
    const 짧은 = ["atr", "sar", "cci", "kdj"].filter((x) => defs.indexOf(x) >= 0);
    if (짧은.length === 4) 목록.push(짧은);
    return 목록;
  }

  function 얹어보기(순서, 색수) {
    const B = boot(makeCandles(150));
    const K = B.K;
    /* 색수를 주면 ★색이 다 차기 전까지만★ 얹습니다 - "자원이 있는 동안은
       화면 전체에서 안 겹친다" 를 빈 검사 아니게 재려고 씁니다. */
    순서.forEach((d) => {
      if (색수) {
        const outs = (K.getDefsForTest()[d] || {}).outputs || [];
        if (선수(K) + outs.length > 색수) return;
      }
      회원추가(K, d);
    });
    const 선 = 모든선(K);
    return { 전체: 겹친쌍(선), 같은바닥: 바닥별겹침(선), 선수: 선.length };
  }

  const B0 = boot(makeCandles(60));
  const 정의들 = B0.K.listDefs().map((d) => d.id);
  const 목록 = 순서들(정의들);

  const 색수2 = (B0.K.LINE_COLORS || []).length;
  let 같은바닥겹친순서 = 0;
  let 색남을때겹친순서 = 0;
  let 첫예 = null;
  let 첫전체예 = null;
  let 잰선수 = 0;
  목록.forEach((s) => {
    /* ① 다 얹었을 때 - ★같은 바닥★ 은 절대 안 겹쳐야 합니다 */
    const r = 얹어보기(s);
    if (r.같은바닥.length) {
      같은바닥겹친순서++;
      if (!첫예) 첫예 = s.join(" → ") + "  ⇒  " + r.같은바닥[0];
    }
    /* ② 색이 남아 있는 만큼만 얹었을 때 - 화면 어디서든 안 겹쳐야 합니다 */
    const r2 = 얹어보기(s, 색수2);
    잰선수 = Math.max(잰선수, r2.선수);
    if (r2.전체.length) {
      색남을때겹친순서++;
      if (!첫전체예) 첫전체예 = s.join(" → ") + "  ⇒  " + r2.전체[0];
    }
  });

  console.log(
    "      순서 " + 목록.length + "가지 · 같은 바닥 겹침 " + 같은바닥겹친순서 +
    " · (색 남을 때) 어디서든 겹침 " + 색남을때겹친순서 + " · 그때 선 " + 잰선수 + "개"
  );
  if (첫예) console.log("      예: " + 첫예);
  if (첫전체예) console.log("      예: " + 첫전체예);

  ok(
    "★어느 순서로 얹어도★ 같은 바닥에서 색이 안 겹친다 (순서 " + 목록.length + "가지 · 다 얹음)",
    같은바닥겹친순서 === 0,
    같은바닥겹친순서 + "가지에서 겹칩니다 — " + 첫예
  );
  ok(
    "★색이 남아 있는 동안은★ 어느 순서로 얹어도 화면 전체에서 안 겹친다 (선 " + 잰선수 + "개까지)",
    색남을때겹친순서 === 0,
    색남을때겹친순서 + "가지에서 겹칩니다 — " + 첫전체예
  );
  ok(
    "제일 짧은 재현(ATR → SAR → CCI → KDJ) 이 같은 바닥에서 안 겹친다",
    얹어보기(["atr", "sar", "cci", "kdj"]).같은바닥.length === 0,
    얹어보기(["atr", "sar", "cci", "kdj"]).같은바닥.join(" / ")
  );
}

/* =======================================================================
 * [4] ⭐ 색이 ★다 찼을 때★ 무슨 일이 나는가
 *     아무도 확인한 적이 없는 자리입니다. 목록 길이 + 3 만큼 얹어 봅니다.
 * ===================================================================== */
console.log("\n[4] 색 목록이 꽉 찬 뒤 (목록 길이 + 3 만큼 얹기)");
{
  const B = boot(makeCandles(150));
  const K = B.K;
  const hexes = (K.LINE_COLORS || []).map((c) => c.hex);
  const N = hexes.length;

  let 나쁜색 = 0;
  let 못얹음 = 0;
  const 고른색 = [];
  for (let i = 0; i < N + 3; i++) {
    const r = 회원추가(K, "ema", { p: 3 + i });
    if (!r.id) 못얹음++;
    if (typeof r.hex !== "string" || hexes.indexOf(r.hex) < 0) {
      나쁜색++;
      if (나쁜색 === 1) console.log("      첫 나쁜 색: " + i + "번째 = " + String(r.hex));
    }
    고른색.push(r.hex);
  }

  ok("색이 다 차도 지표를 계속 얹을 수 있다", 못얹음 === 0, "못 얹은 것 " + 못얹음 + "개");
  ok(
    "색이 다 차도 ★목록 안의 색★ 만 돌려준다 (undefined · null 없음)",
    나쁜색 === 0,
    "목록 밖 " + 나쁜색 + "번"
  );
  ok(
    "다 차기 전까지는 고른 색이 전부 다르다",
    new Set(고른색.slice(0, N - 기존색.length)).size === N - 기존색.length,
    고른색.slice(0, N - 기존색.length).join(" ")
  );
  ok("색이 다 차도 경고가 쏟아지지 않는다", B.warns.length === 0, B.warns.slice(0, 2).join(" | "));
  ok(
    "색이 다 차도 인스턴스 개수는 정직하게 는다",
    K.listInstances().length >= N + 3,
    String(K.listInstances().length)
  );

  /* 다 찬 뒤에도 ★같은 인스턴스 안★ 에서는 겹치면 안 됩니다 (선이 1개라 자동 통과지만,
     여러 선짜리 지표를 색이 찬 상태에서 얹어도 마찬가지여야 합니다) */
  const r2 = 회원추가(K, "kdj");
  const kdj = K.listInstances().filter((i) => i.id === r2.id)[0];
  if (kdj) {
    const 색들 = Object.keys(kdj.colors).map((k) => kdj.colors[k]);
    ok(
      "색이 다 찬 뒤에 얹은 KDJ 도 자기 선끼리는 색이 다르다",
      new Set(색들).size === 색들.length,
      Object.keys(kdj.colors).map((k) => k + "=" + kdj.colors[k]).join(" ")
    );
  }
}

/* =======================================================================
 * [5] 색을 손으로 고를 때 - 목록 밖은 안 들어간다
 * ===================================================================== */
console.log("\n[5] 회원이 색을 손으로 고칠 때");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const id = K.createInstance("ema", { on: false, params: { p: 12 } });
  const 원래 = K.listInstances().filter((i) => i.id === id)[0].colors.ema;

  K.updateInstance(id, { colors: { ema: "#00FF00" } });
  ok(
    "색 목록 밖(#00FF00)으로는 못 바꾼다",
    K.listInstances().filter((i) => i.id === id)[0].colors.ema === 원래
  );
  K.updateInstance(id, { colors: { ema: 상승색 } });
  ok(
    "상승색(#26C281)으로는 못 바꾼다",
    K.listInstances().filter((i) => i.id === id)[0].colors.ema === 원래
  );
  K.updateInstance(id, { colors: { ema: 하락색 } });
  ok(
    "하락색(#F0506E)으로는 못 바꾼다",
    K.listInstances().filter((i) => i.id === id)[0].colors.ema === 원래
  );

  const 목록색 = (K.LINE_COLORS || []).map((c) => c.hex);
  const 다른색 = 목록색.filter((h) => h !== 원래)[0];
  K.updateInstance(id, { colors: { ema: 다른색 } });
  ok(
    "목록 안의 색으로는 바꿔진다",
    K.listInstances().filter((i) => i.id === id)[0].colors.ema === 다른색,
    다른색
  );
}

/* =======================================================================
 * [6] ⭐ 밴드 목록이 ★두 벌★ 이 아닌가
 *
 * 이 파일의 밴드정의 는 사람이 손으로 적은 목록입니다. 틀(js/chart-indicator-kit.js)
 * 쪽에도 define({ band:true }) 표시가 있습니다. ★둘이 어긋나면★
 *   · 틀에만 있고 여기 없으면  -> 누가 band:true 를 붙여 이 봉인을 몰래 피한 것
 *   · 여기만 있고 틀에 없으면  -> 이 봉인이 있지도 않은 예외를 봐주고 있는 것
 * 둘 다 조용한 고장이라 여기서 글자 단위로 맞춥니다.
 * ===================================================================== */
console.log("\n[6] 밴드 목록이 틀과 어긋나지 않는가");
{
  const B = boot(makeCandles(60));
  const 틀밴드 = B.K.listDefs()
    .filter((d) => d.band === true)
    .map((d) => d.id)
    .sort();
  ok(
    "틀이 밴드로 선언한 정의와 이 봉인의 목록이 같다",
    틀밴드.join(",") === 밴드정의.slice().sort().join(","),
    "틀 [" + 틀밴드.join(",") + "] vs 봉인 [" + 밴드정의.join(",") + "]"
  );
  ok("밴드는 아직 하나뿐이다 (늘리려면 위 주석에 근거를 적으세요)", 틀밴드.length === 1, String(틀밴드.length));

  const 비밴드 = B.K.listDefs().filter((d) => !d.band);
  const defs = B.K.getDefsForTest();
  const 어긴것 = [];
  비밴드.forEach((d) => {
    const 색들 = ((defs[d.id] && defs[d.id].outputs) || []).map((o) => o.color);
    if (색들.length > 1 && new Set(색들).size !== 색들.length) 어긴것.push(d.id);
  });
  ok("밴드가 아닌 정의는 전부 선마다 다른 색이다", 어긴것.length === 0, 어긴것.join(","));
}

/* =======================================================================
 * [7] ⭐⭐ "기본값" 버튼을 눌러도 같은 바닥에서 안 겹치는가
 *
 * -- 2026-09-02 (13단계) 에 ★라이브에서★ 잡힌 것 -----------------------
 * 설정 창의 "기본값" 이 ★정의(define)의 기본값★ 으로 되돌렸습니다. 옮겨 온
 * 줄들은 자기만의 태생값이 따로 있는데 그걸 몰랐습니다.
 *     ma-25   기간 25 · 흰 #E7ECF5  ->  기간 9 · ★금 #F0B429★
 *     ma-99   기간 99 · 회 #838DA4  ->  기간 9 · ★금 #F0B429★
 *     ema-21  기간 21 · #BA6EED     ->  기간 9 · ★#49C9E9★ (ema-9 와 같은 색)
 * 되돌린 뒤 MA(7)(금색)과 ★한 줄로 보였습니다.★ 점검팀 실측 - 캔버스 표본
 * 11열 중 5열(45%)에서 금색 덩어리가 하나로 보였습니다. 오류는 0건이었습니다.
 *
 * -- 왜 이 절이 따로 필요한가 -------------------------------------------
 * 위 [3] 은 ★얹은 직후★ 만 봅니다. "기본값" 버튼은 그 뒤에 눌리는 ★다른 길★
 * 이라 [3] 이 초록이어도 여기서 겹칠 수 있었습니다. 실제로 그랬습니다.
 * ===================================================================== */
console.log("\n[7] 기본값 버튼을 눌러도 안 겹치는가");
{
  const B = boot(makeCandles(160));
  const K = B.K;

  K.listInstances().forEach((i) => K.resetInstance(i.id));
  const 선1 = 모든선(K);
  const 겹1 = 바닥별겹침(선1);
  ok("기본 인스턴스를 전부 되돌려도 같은 바닥에서 안 겹친다", 겹1.length === 0, 겹1.join(" / "));

  const 태생 = {
    "ma-7": [7, "#F0B429"],
    "ma-25": [25, "#E7ECF5"],
    "ma-99": [99, "#838DA4"],
    "ema-9": [9, "#49C9E9"],
    "ema-21": [21, "#BA6EED"],
  };
  Object.keys(태생).forEach((id) => {
    const it = K.listInstances().filter((x) => x.id === id)[0];
    const 첫 = it ? it.colors[Object.keys(it.colors)[0]] : null;
    ok(
      "기본값을 눌러도 " + id + " 이 기간 " + 태생[id][0] + " · " + 태생[id][1] + " 그대로다",
      !!it && it.params.p === 태생[id][0] && 첫 === 태생[id][1],
      it ? it.params.p + " / " + 첫 : "없음"
    );
  });

  K.updateInstance("ma-25", { params: { p: 3 }, colors: { ma: "#F0B429" }, width: 4, style: "dotted" });
  K.resetInstance("ma-25");
  const m25 = K.listInstances().filter((x) => x.id === "ma-25")[0];
  ok(
    "회원이 금색 4px 점선으로 바꾼 뒤 눌러도 흰색 1px 실선 25 로 돌아온다",
    m25.params.p === 25 && m25.colors.ma === "#E7ECF5" && m25.width === 1 && m25.style === "solid",
    m25.params.p + " / " + m25.colors.ma + " / " + m25.width + " / " + m25.style
  );

  const 정의들 = K.listDefs().map((d) => d.id);
  정의들.forEach((did) => 회원추가(K, did));
  K.listInstances().forEach((i) => K.resetInstance(i.id));
  const 선2 = 모든선(K);
  const 겹2 = 바닥별겹침(선2);
  ok(
    "다 얹고 전부 되돌려도 같은 바닥에서 안 겹친다 (선 " + 선2.length + "개)",
    겹2.length === 0,
    겹2.join(" / ")
  );

  const saved = B.stored["chart-indicator-kit"];
  const B2 = boot(makeCandles(160), { saved: saved });
  B2.K.updateInstance("ma-99", { params: { p: 4 }, colors: { ma: "#F0B429" } });
  B2.K.resetInstance("ma-99");
  const m99 = B2.K.listInstances().filter((x) => x.id === "ma-99")[0];
  ok(
    "새로고침한 뒤에 눌러도 태생값(99 · #838DA4)으로 돌아온다",
    m99.params.p === 99 && m99.colors.ma === "#838DA4",
    m99.params.p + " / " + m99.colors.ma
  );

  const 옛 = JSON.parse(JSON.stringify(saved));
  옛.instances.forEach((x) => delete x.born);
  옛.instances.forEach((x) => {
    if (x.id === "ma-99") {
      x.params = { p: 5 };
      x.colors = { ma: "#F0B429" };
    }
  });
  const B3 = boot(makeCandles(160), { saved: 옛 });
  B3.K.resetInstance("ma-99");
  const m99b = B3.K.listInstances().filter((x) => x.id === "ma-99")[0];
  ok(
    "태생값이 없던 옛 저장분도 99 · #838DA4 로 돌아온다",
    m99b.params.p === 99 && m99b.colors.ma === "#838DA4",
    m99b.params.p + " / " + m99b.colors.ma
  );
}

/* =======================================================================
 * [8] ⭐⭐⭐ 돌연변이 검증 — ★이 봉인이 진짜로 터지는가★
 *
 * 12단계에서 판정을 "색만" 에서 "색 + 선 모양" 으로 바꿨습니다. 기준을 낮춘 게
 * 아니라는 것을 ★일부러 틀리게 만들어서★ 확인합니다. 여기가 초록인데 위가
 * 전부 초록이면, 위가 초록인 것에 뜻이 있습니다.
 * ===================================================================== */
console.log("\n[8] 돌연변이 검증 (일부러 틀리게 해서 터지는지)");
{
  const B = boot(makeCandles(60));
  const K = B.K;

  const id = K.createInstance("ema", { on: false, params: { p: 12 } });
  K.updateInstance(id, { colors: { ema: "#F0B429" }, style: "solid" });
  const 겹 = 바닥별겹침(모든선(K));
  ok(
    "★같은 색 · 둘 다 실선★ 이면 여전히 터진다 (2026-08-31 계열)",
    겹.length > 0,
    겹.length ? 겹.join(" / ") : "안 터졌습니다 — 봉인이 죽었습니다"
  );
  ok(
    "터진 쌍이 금색 실선 두 줄이다",
    겹.join(" ").indexOf("#F0B429") >= 0 && 겹.join(" ").indexOf("solid") >= 0,
    겹.join(" / ")
  );

  K.updateInstance(id, { width: 3 });
  const 겹굵기 = 바닥별겹침(모든선(K));
  ok(
    "굵기만 다르고 색·선 모양이 같으면 ★그래도★ 터진다 (1px ↔ 3px)",
    겹굵기.length > 0,
    겹굵기.length ? 겹굵기.join(" / ") : "안 터졌습니다 — 굵기로 빠져나갔습니다"
  );

  /* 반대쪽 — 선 모양이 다르면 봐줍니다. 이것이 12단계의 핵심입니다.
     ★지금 회원 화면 그대로★ 를 씁니다 - MA(99) 회색 ★실선★ ↔ 볼린저 회색 ★점선★.
     둘 다 진짜로 #838DA4 인지도 같이 확인합니다(아니면 이 검사가 헛돕니다). */
  {
    const B0 = boot(makeCandles(60));
    const 선0 = 모든선(B0.K);
    const m99 = 선0.filter((x) => x.id === "ma-99")[0];
    const bbs = 선0.filter((x) => x.id === "bb-20");
    ok("MA(99) 가 회색 실선이다", !!m99 && m99.hex === "#838DA4" && m99.선모양 === "solid",
      m99 ? m99.hex + " " + m99.선모양 : "없음");
    ok("볼린저 세 줄이 회색 점선이다",
      bbs.length === 3 && bbs.every((x) => x.hex === "#838DA4" && x.선모양 === "dashed"),
      bbs.map((x) => x.hex + " " + x.선모양).join(" / "));
    const 겹점선 = 바닥별겹침(선0).filter((x) => x.indexOf("#838DA4") >= 0);
    ok(
      "색이 같아도 ★점선 ↔ 실선★ 이면 안 터진다 (볼린저 ↔ MA(99) 가 이 사이)",
      겹점선.length === 0,
      겹점선.join(" / ")
    );
    /* 그런데 ★점선끼리★ 같은 색이면 터져야 합니다 - 봐주는 범위가 넓지 않다는 증거 */
    const eid = B0.K.createInstance("ema", { on: false });
    B0.K.updateInstance(eid, { colors: { ema: "#838DA4" }, style: "dashed" });
    const 겹점점 = 바닥별겹침(모든선(B0.K)).filter((x) => x.indexOf("#838DA4") >= 0);
    ok(
      "★점선끼리★ 같은 색이면 터진다 (봐주는 것은 선 모양이 다를 때뿐)",
      겹점점.length > 0,
      겹점점.length ? 겹점점.join(" / ") : "안 터졌습니다 — 너무 넓게 봐주고 있습니다"
    );
  }

  const B2 = boot(makeCandles(60));
  const 가짜 = B2.K.define({
    id: "mut-band",
    name: "돌연변이",
    pane: "main",
    params: { p: 5 },
    outputs: [
      { key: "a", kind: "line", color: "#49C9E9", style: "solid" },
      { key: "b", kind: "line", color: "#49C9E9", style: "solid" },
    ],
    seed: function () {
      return { a: [], b: [] };
    },
    step: function () {
      return { values: {}, state: {} };
    },
  });
  ok("돌연변이 정의가 등록됐다", 가짜 === true);
  const d2 = B2.K.getDefsForTest()["mut-band"];
  const 색2 = (d2.outputs || []).map((o) => o.color);
  ok(
    "밴드로 선언하지 않은 정의가 선 둘을 한 색으로 들면 [2] 절이 잡는다",
    new Set(색2).size !== 색2.length && d2.band !== true,
    색2.join(" ") + " band=" + d2.band
  );

  const 되돌림 = B2.K.resetInstance("ma-99");
  ok("되돌리기 자체는 그대로 동작한다", 되돌림 === true);
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
}
process.exit(fail ? 1 : 0);
