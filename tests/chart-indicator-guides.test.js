/* tests/chart-indicator-guides.test.js
 * =========================================================================
 * 봉인 — ① 정의에 모르는 칸을 적으면 ★조용히 버려지던 것★
 *        ② 끈 지표의 기준선이 ★화면에 남던 것★
 * =========================================================================
 * 2026-09-02 기록팀. 둘 다 오늘 차트팀이 스스로 잡았습니다. 테스트가 없어서
 * 다음에 또 납니다.
 *
 * ── ① 조용히 버려지던 칸 ────────────────────────────────────────────────
 *   define({ guides:[...] }) 를 적었더니
 *       돌려준 값   true
 *       콘솔 경고   0건
 *       화면        기준선 0줄
 *   틀이 아는 칸만 옮겨 담고 모르는 칸을 말없이 버렸기 때문입니다.
 *   ★오류 0건 · 화면 멀쩡 · 내용만 없음★ — 이 프로젝트가 P1 로 부르는
 *   "조용한 고장" 그대로입니다. 다음 사람이 bands: · guide: 처럼 한 글자만
 *   틀려도 똑같이 됩니다.
 *
 *   ⚠️ 거부하면 안 됩니다. 칸 이름 하나 틀렸다고 지표가 통째로 안 뜨는 쪽이
 *      더 나쁩니다. ★경고는 반드시 · 등록은 그대로★ 가 정답입니다.
 *
 * ── ② 화면에 남던 기준선 ────────────────────────────────────────────────
 *   차트 라이브러리는 removeSeries 만 하면 기준선을 ★다음에 다시 그릴 때★
 *   지웁니다. 그때까지 끈 지표의 선이 화면에 남습니다.
 *   차트팀 브라우저 실측 —
 *       그리기 전 0점 → 그린 뒤 304점 → removeSeries 직후 ★304점 그대로★
 *   지금은 turnOff 가 ★시리즈보다 먼저★ 기준선을 직접 지웁니다.
 *
 *   ⭐ 이 파일이 순서까지 잡는 방법 —
 *      tests/_kit-harness.js 의 가짜 시리즈는 removeSeries 된 뒤에
 *      removePriceLine 을 부르면 ★던집니다.★ 그래서 순서가 뒤집히면
 *      "남은 기준선" 이 0 이 아니게 됩니다. 진짜 라이브러리는 조용히
 *      넘어가기 때문에, 진짜와 똑같이 흉내내면 이 사고를 못 잡습니다.
 *
 * ── ⚠️ 소스 글자에 기대지 않습니다 ──────────────────────────────────────
 *   차트팀이 지금 js/chart-indicator-kit.js 를 잡고 있습니다. 정의가 몇 개인지,
 *   어느 지표가 기준선을 갖는지 ★손으로 안 적습니다★ — listDefs() 로 셉니다.
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

console.log("\n지표 틀 — 모르는 칸 · 기준선 봉인");

/* 확정 팔레트의 테두리색. js/chart-oscillators.js 의 RSI 30/70 · MACD 0선도
   같은 값을 씁니다(COLORS.rsiGuide · COLORS.zero). 기준선은 "값" 이 아니라
   "배경" 이라 지표마다 다른 회색이 생기면 안 됩니다. */
const 기준선색 = "#1D273B";

/* =======================================================================
 * [1] ⭐ 정의에 모르는 칸이 오면 — 경고는 찍고, 등록은 그대로
 * ===================================================================== */
console.log("\n[1] 정의에 모르는 칸 (조용히 버리지 않는다)");
{
  const B = boot(makeCandles(80));
  const K = B.K;
  const 좋은색 = K.LINE_COLORS[6].hex;

  let seq = 0;
  function 정의(over) {
    return Object.assign(
      {
        id: "guard-" + ++seq,
        name: "칸검사",
        pane: "main",
        params: { p: 5 },
        outputs: [{ key: "v", kind: "line", color: 좋은색, style: "solid" }],
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

  /* ⭐⭐ 실제로 당한 그 모양 — guides 를 몰랐을 때 bands 를 적은 셈입니다 */
  const n0 = B.warns.length;
  const id1 = "guard-1";
  const 결과 = K.define(정의({ bands: [{ price: 100 }] }));
  const 새경고 = B.warns.slice(n0);

  ok("모르는 칸이 있어도 정의는 등록된다 (거부하지 않는다)", 결과 === true, String(결과));
  ok("등록된 정의가 목록에 나온다", K.listDefs().some((d) => d.id === id1));
  ok("★모르는 칸을 조용히 버리지 않고 경고한다★", 새경고.length > 0,
    "경고 0건 — 2026-09-02 에 여기서 기준선이 통째로 사라졌습니다");
  ok("경고에 어느 정의의 어느 칸인지 적힌다", 새경고.some((w) => w.indexOf("bands") >= 0 && w.indexOf(id1) >= 0),
    새경고.join(" | "));
  ok("경고에 ★쓸 수 있는 칸 목록★ 이 같이 나온다 (다음 사람이 바로 고치게)",
    새경고.some((w) => w.indexOf("guides") >= 0 && w.indexOf("outputs") >= 0),
    새경고.join(" | "));

  /* 모르는 칸이 여럿이면 여럿 다 알립니다 — 하나만 알리면 나머지는 그대로 조용합니다 */
  const n1 = B.warns.length;
  K.define(정의({ guide: [{ price: 1 }], bandz: 1, 오타: true }));
  const 새경고2 = B.warns.slice(n1);
  ok("모르는 칸이 셋이면 셋 다 알린다", 새경고2.length >= 3, "경고 " + 새경고2.length + "건");

  /* 등록만 되고 못 쓰면 뜻이 없습니다 — 실제로 얹혀서 그려지는지 봅니다 */
  const 얹은 = K.createInstance(id1, { on: true });
  ok("모르는 칸이 있던 정의도 실제로 화면에 얹힌다", !!얹은, String(얹은));
  const 그림 = B.그린값(얹은);
  ok("그 지표가 실제로 선을 그린다", !!그림 && 그림.v && 그림.v.length > 0,
    그림 && 그림.v ? String(그림.v.length) : "없음");

  /* 아는 칸만 적었으면 경고가 없어야 합니다 (경고가 늘 나오면 아무도 안 봅니다) */
  const n2 = B.warns.length;
  K.define(정의({ note: "설명", useSource: true, useOffset: true, inputs: [{ key: "p", label: "기간" }] }));
  ok("아는 칸만 적으면 경고가 0건이다", B.warns.length === n2,
    B.warns.slice(n2).join(" | "));
}

/* =======================================================================
 * [2] 기준선 값 검사 — 잘못된 것은 거부 (여기는 거부가 맞습니다)
 *     ⚠️ [1] 과 다릅니다. "모르는 칸" 은 오타라 살려 두지만,
 *        "guides 라고 적어 놓고 숫자가 아닌 것" 은 반드시 터뜨려야 합니다.
 * ===================================================================== */
console.log("\n[2] 기준선 값이 이상하면 거부");
{
  const B = boot(makeCandles(60));
  const K = B.K;
  const 좋은색 = K.LINE_COLORS[6].hex;
  let seq = 0;
  const 정의 = (over) =>
    Object.assign(
      {
        id: "gv-" + ++seq,
        name: "기준선검사",
        pane: "sub",
        params: {},
        outputs: [{ key: "v", kind: "line", color: 좋은색 }],
        seed: () => ({ v: [] }),
        step: (st) => ({ values: { v: 1 }, state: st || {} }),
      },
      over || {}
    );

  ok("price 가 글자면 거부한다", K.define(정의({ guides: [{ price: "100" }] })) === false);
  ok("price 가 없으면 거부한다", K.define(정의({ guides: [{}] })) === false);
  ok("price 가 무한대면 거부한다", K.define(정의({ guides: [{ price: Infinity }] })) === false);
  ok(
    "선모양이 solid/dashed/dotted 밖이면 거부한다",
    K.define(정의({ guides: [{ price: 10, style: "wavy" }] })) === false
  );
  ok("멀쩡한 기준선은 등록된다", K.define(정의({ id: "gv-ok", guides: [{ price: 50 }] })) === true);
  ok("guides 를 아예 안 적어도 등록된다", K.define(정의({ id: "gv-none" })) === true);

  const d = K.listDefs().filter((x) => x.id === "gv-ok")[0];
  ok("등록된 기준선을 목록으로 읽을 수 있다", !!d && d.guides.length === 1, d ? String(d.guides.length) : "없음");
}

/* =======================================================================
 * [3] ⭐ 기준선이 실제로 그려지는가 — 정의가 적은 만큼, 적은 값으로
 *     정의 목록을 손으로 안 적습니다. 지표가 늘면 자동으로 같이 검사됩니다.
 * ===================================================================== */
console.log("\n[3] 정의가 적은 기준선이 그대로 그려지는가");
{
  const B = boot(makeCandles(200));
  const K = B.K;
  const defs = K.getDefsForTest();
  let 기준선있는정의 = 0;

  K.listDefs().forEach((d) => {
    const 정의기준선 = (defs[d.id] && defs[d.id].guides) || [];
    const 전 = B.장부.만든수;
    const id = K.createInstance(d.id, { on: true });
    if (!id) {
      ok(d.id + " 를 얹을 수 있다", false, "createInstance 가 null");
      return;
    }
    const 만든 = B.장부.만든수 - 전;
    ok(
      d.id + " 의 기준선이 정의대로 " + 정의기준선.length + "줄 그려진다",
      만든 === 정의기준선.length,
      "정의 " + 정의기준선.length + "줄 · 실제 " + 만든 + "줄"
    );
    if (정의기준선.length) {
      기준선있는정의++;
      const it = K.getInstancesForTest()[id];
      const host = it.live && it.live.guideHost;
      const 첫키 = defs[d.id].outputs[0].key;
      ok(
        d.id + " 의 기준선은 ★첫 번째 선★ 에 붙는다 (지울 손잡이가 하나여야 합니다)",
        !!host && host === it.live.series[첫키]
      );
      const 값들 = (host ? host._lines : []).map((l) => l.opts.price);
      ok(
        d.id + " 의 기준선 값이 정의와 같다",
        JSON.stringify(값들) === JSON.stringify(정의기준선.map((g) => g.price)),
        "정의 " + JSON.stringify(정의기준선.map((g) => g.price)) + " · 실제 " + JSON.stringify(값들)
      );
      const 색들 = (host ? host._lines : []).map((l) => l.opts.color);
      ok(
        d.id + " 의 기준선 색이 팔레트 테두리색 " + 기준선색 + " 하나뿐이다",
        색들.length > 0 && 색들.every((c) => c === 기준선색),
        색들.join(" ")
      );
      const 굵기 = (host ? host._lines : []).map((l) => l.opts.lineWidth);
      ok(d.id + " 의 기준선 굵기가 전부 1 이다", 굵기.every((w) => w === 1), 굵기.join(" "));
      const 라벨 = (host ? host._lines : []).map((l) => l.opts.axisLabelVisible);
      ok(
        d.id + " 의 기준선은 축에 값을 안 적는다 (배경이지 값이 아닙니다)",
        라벨.every((v) => v === false),
        라벨.join(" ")
      );
    }
  });

  ok("기준선을 쓰는 정의가 하나 이상 있다 (검사가 헛돌지 않게)", 기준선있는정의 > 0,
    "0개 — 기준선을 쓰는 지표가 사라졌다면 이 파일도 다시 보세요");
}

/* =======================================================================
 * [4] ⭐⭐ 켰다 껐다 — 남은 기준선이 0 인가 · 만든 수 == 지운 수인가
 * ===================================================================== */
console.log("\n[4] 켰다 껐다 여러 번 (끈 지표의 기준선이 안 남는가)");
{
  const B = boot(makeCandles(200));
  const K = B.K;
  const defs = K.getDefsForTest();
  /* 기준선을 쓰는 정의를 ★전부★ 켭니다 — 목록을 손으로 안 적습니다 */
  const 대상 = K.listDefs().filter((d) => ((defs[d.id] && defs[d.id].guides) || []).length > 0);
  ok("기준선을 쓰는 정의를 찾았다", 대상.length > 0, String(대상.length));

  const ids = 대상.map((d) => K.createInstance(d.id, { on: true })).filter(Boolean);
  ok("전부 얹혔다", ids.length === 대상.length, ids.length + "/" + 대상.length);

  const 켠뒤 = K.getGuideCountForTest();
  ok("켜면 기준선이 생긴다", 켠뒤 > 0, String(켠뒤));
  ok("켠 직후 화면에 남은 기준선 == 틀이 세는 기준선", B.남은기준선() === 켠뒤,
    "화면 " + B.남은기준선() + " · 틀 " + 켠뒤);

  /* 켰다 껐다 5회 */
  for (let r = 0; r < 5; r++) {
    ids.forEach((id) => K.setOn(id, false));
    ok(
      "[" + (r + 1) + "회차] 다 끄면 틀이 세는 기준선이 0 이다",
      K.getGuideCountForTest() === 0,
      String(K.getGuideCountForTest())
    );
    ok(
      "[" + (r + 1) + "회차] ★화면에 남은 기준선도 0 이다★",
      B.남은기준선() === 0,
      B.남은기준선() + "줄 남았습니다 — 끈 지표의 선이 화면에 그대로 보입니다"
    );
    ok(
      "[" + (r + 1) + "회차] 만든 수 == 지운 수",
      B.장부.만든수 === B.장부.지운수,
      "만든 " + B.장부.만든수 + " · 지운 " + B.장부.지운수
    );
    ids.forEach((id) => K.setOn(id, true));
  }

  /* 마지막으로 다 끄고 최종 확인 */
  ids.forEach((id) => K.setOn(id, false));
  ok("5회 돌린 뒤에도 남은 기준선 0", B.남은기준선() === 0, String(B.남은기준선()));
  ok("5회 돌린 뒤 만든 수 == 지운 수", B.장부.만든수 === B.장부.지운수,
    "만든 " + B.장부.만든수 + " · 지운 " + B.장부.지운수);
  ok("기준선을 실제로 여러 번 만들었다 (검사가 헛돌지 않게)", B.장부.만든수 >= 켠뒤 * 5,
    "만든 " + B.장부.만든수 + "회");
  ok("켰다 껐다 하는 동안 경고가 안 났다", B.warns.length === 0, B.warns.slice(0, 2).join(" | "));
}

/* =======================================================================
 * [5] 다른 길로 꺼질 때도 안 남는가
 *     설정 바꾸기(updateInstance) · 기본값 되돌리기(resetInstance) ·
 *     지우기(removeInstance) · 종목 바뀜(symbol:change) 도 전부 끄고 다시 켭니다.
 * ===================================================================== */
console.log("\n[5] 설정 변경 · 지우기 · 종목 변경으로 다시 그릴 때");
{
  const B = boot(makeCandles(200));
  const K = B.K;
  const defs = K.getDefsForTest();
  const 대상 = K.listDefs().filter((d) => ((defs[d.id] && defs[d.id].guides) || []).length > 0)[0];
  const id = K.createInstance(대상.id, { on: true });
  const 줄수 = defs[대상.id].guides.length;

  ok("기준선을 쓰는 지표를 하나 켰다", K.getGuideCountForTest() === 줄수, String(K.getGuideCountForTest()));

  /* 설정 바꾸기 — 안에서 turnOff → turnOn 을 합니다 */
  const 첫입력 = K.inputsOf(대상.id).filter((s) => s.type === "int")[0];
  if (첫입력) {
    const p = {};
    p[첫입력.key] = 7;
    K.updateInstance(id, { params: p });
  }
  ok("설정을 바꿔도 기준선은 " + 줄수 + "줄 그대로다", K.getGuideCountForTest() === 줄수,
    String(K.getGuideCountForTest()));
  ok("설정을 바꿔도 화면에 남는 기준선이 안 는다", B.남은기준선() === 줄수,
    "화면 " + B.남은기준선());
  ok("설정 변경 뒤 만든 수 - 지운 수 == 지금 켜진 줄 수",
    B.장부.만든수 - B.장부.지운수 === 줄수,
    "만든 " + B.장부.만든수 + " · 지운 " + B.장부.지운수);

  /* 굵기 · 색 바꾸기도 같은 길입니다 */
  K.updateInstance(id, { width: 2 });
  K.updateInstance(id, { style: "dashed" });
  ok("굵기 · 선모양을 바꿔도 기준선이 안 는다", B.남은기준선() === 줄수,
    "화면 " + B.남은기준선());

  /* 기본값 되돌리기 */
  K.resetInstance(id);
  ok("기본값으로 되돌려도 기준선이 안 는다", B.남은기준선() === 줄수, "화면 " + B.남은기준선());

  /* 종목이 바뀌면 전부 다시 그립니다 */
  const 전만든 = B.장부.만든수;
  B.sandbox.App.Bus.emit("symbol:change", { symbol: "ETHUSDT" });
  B.tick();
  ok(
    "종목이 바뀌면 실제로 다시 그린다 (검사가 헛돌지 않게)",
    B.장부.만든수 > 전만든,
    "기준선을 다시 안 만들었습니다 — 아래 검사가 뜻이 없어집니다"
  );
  ok("종목이 바뀌어 다시 그려도 기준선이 안 는다", B.남은기준선() === 줄수, "화면 " + B.남은기준선());

  /* 켠 채로 지우기 */
  K.removeInstance(id);
  ok("켠 채로 지우면 기준선이 0 이 된다", K.getGuideCountForTest() === 0, String(K.getGuideCountForTest()));
  ok("켠 채로 지워도 화면에 안 남는다", B.남은기준선() === 0, String(B.남은기준선()));
  ok("끝까지 만든 수 == 지운 수", B.장부.만든수 === B.장부.지운수,
    "만든 " + B.장부.만든수 + " · 지운 " + B.장부.지운수);
}

/* =======================================================================
 * [6] 기준선이 없는 지표는 하나도 안 만든다
 *     (없는데 만들면 팔레트 밖 회색 선이 차트에 깔립니다)
 * ===================================================================== */
console.log("\n[6] 기준선이 없는 지표");
{
  const B = boot(makeCandles(200));
  const K = B.K;
  const defs = K.getDefsForTest();
  const 없는것 = K.listDefs().filter((d) => ((defs[d.id] && defs[d.id].guides) || []).length === 0);
  ok("기준선이 없는 정의가 하나 이상 있다", 없는것.length > 0, String(없는것.length));

  const 전 = B.장부.만든수;
  없는것.forEach((d) => K.createInstance(d.id, { on: true }));
  ok(
    "기준선이 없는 지표는 " + 없는것.length + "개를 다 켜도 기준선을 0줄 만든다",
    B.장부.만든수 === 전,
    "만든 " + (B.장부.만든수 - 전) + "줄"
  );
  ok("틀이 세는 기준선도 0 이다", K.getGuideCountForTest() === 0, String(K.getGuideCountForTest()));
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
}
process.exit(fail ? 1 : 0);
