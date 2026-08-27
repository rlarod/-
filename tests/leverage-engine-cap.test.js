/* tests/leverage-engine-cap.test.js
 * =========================================================================
 * ⭐ 화면 레버리지 상한이 거래 엔진 상한을 절대 넘지 않는다 — 2026-08-28
 * =========================================================================
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────
 * js/trading.js:96 에 MAX_LEVERAGE 가 박혀 있고, setLeverage() 가 그 값으로
 * ★조용히 깎습니다★ — 오류도 안 나고 화면도 멀쩡합니다.
 *
 * js/leverage-gate.js 는 이용권(서버 상품)의 effect_value 를 그대로 상한으로
 * 썼습니다.
 *     return Math.max(DEFAULT_MAX, Number(boostedMax) || 0);   ← 자르는 곳 없음
 * 서버에 엔진 상한을 넘는 상품이 하나만 등록되면
 *     화면 "150배 사용 중"   ↔   엔진 실제 125배
 * 가 되어 회원이 잘못된 배율·증거금·청산가를 보게 됩니다.
 * CLAUDE.md 가 P1 로 규정한 '조용한 고장' 구조입니다.
 * (지금 등록 상품이 100배라 실제 피해는 없습니다 — 터지기 전에 막는 것입니다)
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *   [1] 엔진 상한을 ★재서★ 알아낸다 (숫자를 박아두지 않는다)
 *   [2] 재는 동안 회원의 현재 배율이 바뀌지 않는다
 *   [3] 이용권이 엔진보다 크면 엔진 값으로 잘린다
 *   [4] 엔진보다 작으면 그대로 둔다 (멀쩡한 것까지 깎지 않는다)
 *   [5] 감싼 setLeverage 도 같은 상한을 지킨다
 *   [6] 깎였으면 회원에게 글자로 알린다 (조용히 자르지 않는다)
 *   [7] 돌연변이 — 자르는 줄을 지우면 여기서 터진다
 *   [7-2] ⭐ 재다가 중간에 터져도 회원 배율이 남지 않는다 (finally 복구)
 *   [8] 수정 금지 파일(js/trading.js) 무수정
 *
 * ⚠ 이 파일은 사이트 코드를 한 글자도 고치지 않습니다. 읽기만 합니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { boot, REPO } = require("./harness.js");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const GATE_SRC = fs.readFileSync(path.join(REPO, "js", "leverage-gate.js"), "utf8");
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

const 미래 = new Date(Date.now() + 3600000).toISOString();

console.log("\n레버리지 상한이 거래 엔진을 넘지 않는가");

const { App, doc } = boot({ extra: ["js/leverage-gate.js"] });

/* =========================================================================
 * [1] 엔진 상한을 재서 알아낸다
 * ========================================================================= */
section("[1] 엔진 상한을 숫자로 박지 않고 재서 알아낸다");
let 엔진최대 = null;
{
  ok("App.LeverageGate 가 떴다", !!App.LeverageGate);
  ok("getEngineMax() 가 있다", typeof App.LeverageGate.getEngineMax === "function");

  엔진최대 = App.LeverageGate.getEngineMax();
  ok("엔진 상한을 실제로 쟀다 = " + 엔진최대, typeof 엔진최대 === "number" && 엔진최대 >= 1);

  /* 같은 값을 직접 눌러서도 확인합니다 — 잰 방법이 맞는지 교차 검증. */
  const 이전 = App.Trading.getSnapshot().leverage;
  let 직접 = 1;
  for (let v = 1; v <= 1000; v++) {
    App.Trading.setLeverage(v);
    const got = App.Trading.getSnapshot().leverage;
    if (got > 직접) 직접 = got;
  }
  App.Trading.setLeverage(이전);
  ok("직접 눌러서 잰 값(" + 직접 + ")과 같다", 직접 === 엔진최대, "잰값=" + 엔진최대);

  /* 숫자를 코드에 박아두면 엔진이 바뀔 때 조용히 어긋납니다. */
  const 본문 = strip(GATE_SRC);
  ok("코드 본문에 엔진 상한 숫자(" + 엔진최대 + ")를 박아두지 않았다",
    본문.indexOf(String(엔진최대)) < 0,
    "본문에 " + 엔진최대 + " 가 박혀 있습니다. 엔진 값이 바뀌면 조용히 어긋납니다");
  ok("Math.min 으로 두 자리 이상 상수를 박는 형태가 없다",
    !/Math\.min\(\s*\d\d+\s*,/.test(본문));
}

/* =========================================================================
 * [2] 재는 동안 회원의 배율이 바뀌지 않는다
 * ========================================================================= */
section("[2] 상한을 재도 회원 배율은 그대로다");
{
  App.Trading.setLeverage(20);
  const 전 = App.Trading.getSnapshot().leverage;
  App.LeverageGate.getEngineMax();
  App.LeverageGate.currentMax();
  const 후 = App.Trading.getSnapshot().leverage;
  ok("재기 전 20배 → 재고 나서도 20배", 전 === 20 && 후 === 20, "전=" + 전 + " 후=" + 후);
}

/* =========================================================================
 * [3] 이용권이 엔진보다 크면 엔진 값으로 잘린다
 * ========================================================================= */
section("[3] 엔진보다 큰 이용권은 엔진 값으로 잘린다");
{
  const 기본 = App.LeverageGate.getDefaultMax();
  ok("기본 상한(" + 기본 + ")이 엔진 상한(" + 엔진최대 + ")을 안 넘는다", 기본 <= 엔진최대);

  const 과한값 = 엔진최대 + 25;
  App.LeverageGate._setBoost(과한값, 미래);
  ok("이용권 " + 과한값 + "배 → currentMax() 는 " + 엔진최대,
    App.LeverageGate.currentMax() === 엔진최대, String(App.LeverageGate.currentMax()));
  ok("깎이기 전 값(" + 과한값 + ")을 기억하고 있다",
    App.LeverageGate.getCappedFrom() === 과한값, String(App.LeverageGate.getCappedFrom()));

  /* DEFAULT_MAX 자체가 엔진을 넘어도 잘려야 합니다. */
  App.LeverageGate._setBoost(null, null);
  App.LeverageGate.setDefaultMax(엔진최대 + 75);
  ok("기본 상한을 엔진보다 크게 잡아도 잘린다",
    App.LeverageGate.currentMax() === 엔진최대, String(App.LeverageGate.currentMax()));
  App.LeverageGate.setDefaultMax(기본);
  ok("기본 상한을 되돌리면 원래대로", App.LeverageGate.currentMax() === 기본);
}

/* =========================================================================
 * [4] 엔진보다 작은 이용권은 그대로 둔다
 * ========================================================================= */
section("[4] 멀쩡한 것까지 깎지 않는다");
{
  const 적당한값 = 엔진최대 - 5;
  App.LeverageGate._setBoost(적당한값, 미래);
  ok("이용권 " + 적당한값 + "배 → 그대로 " + 적당한값,
    App.LeverageGate.currentMax() === 적당한값, String(App.LeverageGate.currentMax()));
  ok("안 깎였으므로 기억값이 없다", App.LeverageGate.getCappedFrom() === null);

  /* 만료된 이용권은 원래대로 기본 상한. */
  App.LeverageGate._setBoost(적당한값, new Date(Date.now() - 1000).toISOString());
  ok("만료된 이용권은 기본 상한으로 돌아간다",
    App.LeverageGate.currentMax() === App.LeverageGate.getDefaultMax());
  App.LeverageGate._setBoost(null, null);
}

/* =========================================================================
 * [5] 감싼 setLeverage 도 같은 상한을 지킨다
 * ========================================================================= */
section("[5] 실제로 눌러도 엔진 상한을 안 넘는다");
{
  App.LeverageGate._setBoost(엔진최대 + 25, 미래);
  App.Trading.setLeverage(엔진최대 + 25);
  ok("과한 배율을 넣어도 엔진 상한으로 들어간다",
    App.Trading.getSnapshot().leverage === 엔진최대, String(App.Trading.getSnapshot().leverage));
  App.Trading.setLeverage(10);
  ok("정상 배율은 그대로 들어간다", App.Trading.getSnapshot().leverage === 10);
  App.LeverageGate._setBoost(null, null);
}

/* =========================================================================
 * [6] 깎였으면 회원에게 알린다 — 조용히 자르지 않는다
 * ========================================================================= */
section("[6] 깎였을 때 회원이 알 수 있는가");
{
  /* 레버리지 창은 열 때 만들어집니다. 그 창의 안내문 자리를 흉내 냅니다. */
  const anchor = doc.createElement("p");
  anchor.id = "lev-modal-note";
  doc.body.appendChild(anchor);

  const 과한값 = 엔진최대 + 25;
  App.LeverageGate._setBoost(과한값, 미래); // _setBoost 안에서 화면 갱신까지 합니다
  const note = doc.getElementById("lev-cap-note");
  ok("안내문이 화면에 생긴다", !!note);
  ok("안내문에 이용권 값(" + 과한값 + ")이 적혀 있다",
    !!note && note.textContent.indexOf(String(과한값)) >= 0, note && note.textContent);
  ok("안내문에 실제 적용값(" + 엔진최대 + ")도 적혀 있다",
    !!note && note.textContent.indexOf(String(엔진최대)) >= 0, note && note.textContent);
  ok("빈 글자가 아니다", !!note && note.textContent.trim().length > 10);
  ok("레버리지 창이 쓰는 안내문(#lev-modal-note)은 안 건드린다",
    anchor.textContent === "", anchor.textContent);

  App.LeverageGate._setBoost(null, null);
  ok("안 깎이면 안내문이 사라진다", !doc.getElementById("lev-cap-note"));
}

/* =========================================================================
 * [7] 돌연변이 — 자르는 줄을 지우면 정말 실패하는가
 * ========================================================================= */
section("[7] 돌연변이 — 방어를 지우면 잡히는가");
{
  const 원래줄 = "    var eng = engineMax();\n    if (eng && want > eng) {";
  const 망친줄 = "    var eng = engineMax();\n    if (false && eng && want > eng) {";
  const 망친소스 = GATE_SRC.replace(원래줄, 망친줄);
  ok("돌연변이 준비 — 사본을 만들었다(원본 파일은 안 건드림)", 망친소스 !== GATE_SRC);

  const b2 = boot({});
  b2.win.eval(망친소스);
  const G2 = b2.App.LeverageGate;
  const 과한값 = 엔진최대 + 25;
  G2._setBoost(과한값, 미래);
  ok("→ 방어를 지우면 엔진을 넘는 값이 그대로 나온다(= 이 검사가 진짜로 잡는다)",
    G2.currentMax() === 과한값, String(G2.currentMax()));
  ok("→ 그때는 안내문도 안 생긴다", !b2.doc.getElementById("lev-cap-note"));
}

/* =========================================================================
 * [7-2] ⭐ 재다가 중간에 터져도 회원 배율이 남지 않는다
 *       (감사팀 지적 2026-08-28 — 복구 줄이 try 안에 있으면 예외가 났을 때
 *        회원 배율이 엔진 상한에 그대로 남습니다. 10배로 잡아둔 회원이
 *        모르는 사이 125배가 되고 다음 주문이 12.5배 커집니다 = 돈 문제)
 * ========================================================================= */
section("[7-2] 재다가 터져도 회원 배율이 그대로 남는다");
{
  /* 상황을 만듭니다 — 배율을 10배로 잡아 둔 회원 화면에서,
     상한을 재는 도중 getSnapshot() 이 던지게 합니다. */
  function 터지게_해서_재보기(소스) {
    const b = boot({});
    b.win.eval(소스);
    b.App.Trading.setLeverage(10); // 회원이 잡아 둔 배율

    const 원본스냅 = b.App.Trading.getSnapshot;
    let n = 0;
    b.App.Trading.getSnapshot = function () {
      n++;
      /* 첫 호출(되돌릴 값 읽기)만 통과시키고 그 뒤로는 전부 던집니다.
         = PROBE 를 넣은 ★직후★ 에 터지는 상황 */
      if (n >= 2) throw new Error("일부러 낸 오류(테스트)");
      return 원본스냅.apply(this, arguments);
    };
    let 밖으로샌오류 = null;
    try {
      b.App.LeverageGate.getEngineMax(); // 여기서 재다가 터집니다
    } catch (e) {
      밖으로샌오류 = e.message;
    }
    b.App.Trading.getSnapshot = 원본스냅; // 원래대로 돌려놓고 결과를 봅니다
    return { 배율: b.App.Trading.getSnapshot().leverage, 호출: n, 샌오류: 밖으로샌오류 };
  }

  const 결과 = 터지게_해서_재보기(GATE_SRC);
  /* 먼저 '상황이 실제로 벌어졌는지' 를 확인합니다.
     안 벌어졌는데 통과하면 아무것도 안 지키는 검사가 됩니다. */
  ok("상황이 실제로 벌어졌다 — 재는 도중 오류가 났다(getSnapshot 호출 " + 결과.호출 + "회)",
    결과.호출 >= 2, "호출 " + 결과.호출 + "회 — 오류를 낼 자리까지 가지도 않았습니다");
  ok("중간에 터져도 회원 배율이 10배 그대로다", 결과.배율 === 10,
    "회원 배율이 " + 결과.배율 + "배로 남았습니다 — 다음 주문이 그만큼 커집니다");
  ok("엔진 상한(" + 엔진최대 + ")이 회원 배율로 남지 않았다", 결과.배율 !== 엔진최대);
  ok("오류를 밖으로 흘리지 않는다(화면이 안 깨진다)", 결과.샌오류 === null, String(결과.샌오류));

  /* 돌연변이 — 복구 줄을 finally 에서 try 안으로 되돌리면 정말 남는가.
     시작/끝 표시 사이를 통째로 '고치기 전 모양' 으로 갈아끼웁니다. */
  const 시작 = "    measuring = true;";
  const 끝 = "    return engineMaxCache;";
  const i = GATE_SRC.indexOf(시작);
  const j = GATE_SRC.indexOf(끝, i);
  const 고치기전모양 =
    "    measuring = true;\n" +
    "    try {\n" +
    "      setter.call(App.Trading, PROBE);\n" +
    "      var got = Number((App.Trading.getSnapshot() || {}).leverage);\n" +
    "      setter.call(App.Trading, before);\n" +
    "      if (isFinite(got) && got >= 1) engineMaxCache = got;\n" +
    "    } catch (e) {}\n" +
    "    measuring = false;\n";
  const 망친소스2 = i >= 0 && j > i
    ? GATE_SRC.slice(0, i) + 고치기전모양 + GATE_SRC.slice(j)
    : GATE_SRC;
  ok("돌연변이 준비 — 복구를 try 안으로 되돌린 사본을 만들었다",
    망친소스2 !== GATE_SRC && 망친소스2.indexOf("} finally {") < 0);

  let 망친결과 = null;
  try {
    망친결과 = 터지게_해서_재보기(망친소스2).배율;
  } catch (e) {
    망친결과 = "로드실패:" + e.message;
  }
  ok("→ 복구를 try 안으로 되돌리면 회원 배율이 " + 엔진최대 + "배로 남는다(= 이 검사가 진짜로 잡는다)",
    망친결과 === 엔진최대, String(망친결과));
}

/* =========================================================================
 * [8] 수정 금지 파일 무수정
 * ========================================================================= */
section("[8] js/trading.js 는 한 글자도 안 건드렸다");
{
  const crypto = require("crypto");
  const md5 = crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", "trading.js")))
    .digest("hex");
  ok("js/trading.js md5 가 기준값과 같다",
    md5 === "33250202c00b097ff8344ae2ee64cbe7", md5);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다(tests/README.md). */
process.exit(0);
