/* tests/mmr-fallback-blindspot.test.js
 * =========================================================================
 * 봉인 — 봉인들이 ★회원이 겪지 않는 경로★ 를 재고 있지 않은지 봅니다
 * =========================================================================
 *
 * ── 무슨 일이 있었나 (2026-08-31) ──────────────────────────────────────
 *   대표 결재로 유지증거금이 바이낸스 명목 구간별로 바뀌었습니다.
 *       대표 "바이낸스 거래 시스템을 따라해 그것만 허용"
 *   새 규칙은 js/risk-brackets.js 에 있고, index.html 은 이 순서로 태웁니다.
 *       1239행  <script src="js/risk-brackets.js">
 *       1240행  <script src="js/trading.js">
 *
 *   js/trading.js 는 App.RiskBrackets 가 ★없으면★ 예전 고정값으로 되돌아갑니다.
 *       const MMR_FALLBACK = 0.005;   // 표를 못 읽을 때만
 *   되돌아가는 것 자체는 안전장치라 맞습니다. 문제는 ★테스트★ 였습니다.
 *
 *   봉인 테스트들의 sandbox 는 js/risk-brackets.js 를 안 태웠습니다.
 *   그래서 A건이 들어온 뒤에도 그 봉인들은 ★옛 고정값 경로★ 를 재고 있었습니다.
 *
 *       테스트는 초록  ↔  회원은 다른 값을 겪음
 *
 *   화면도 안 깨지고 오류도 안 납니다. ★우리가 P1 로 부르는 조용한 고장★ 입니다.
 *   시끄러운 고장보다 나쁩니다 — 아무도 모르니까요.
 *
 *   ── 2026-08-31 실측 (고친 뒤 실제로 달라진 값) ────────────────────────
 *     forced-liquidation-wipeout-seal   청산가 59,700    → 59,924.40 (버팀폭 0.500% → 0.126%)
 *     symbol-guard                      청산가 99,550    → 99,440
 *     symbol-guard-emit-view            청산가 99,550    → 99,440
 *     symbol-switch-unbuilt             청산가 99,550    → 99,440
 *     forced-liquidation-wipeout-seal   지갑 200,000 최대+100배가 ★진입 거절★ 로 바뀜
 *   전부 "구간표를 안 태워서" 옛 값으로 통과하던 것들이었습니다.
 *
 * ── 이 파일이 못 박는 것 ────────────────────────────────────────────────
 *   [1] 판정기가 진짜 도는가 (오탐 / 미탐을 실제 문자열로 확인)
 *   [2] 엔진(js/trading.js)을 sandbox 에 태우는 테스트는 js/risk-brackets.js 도
 *       ★먼저★ 같이 태운다
 *   [3] 예외는 이유가 적혀 있어야 한다 (fallback 을 일부러 재는 파일 하나뿐)
 *   [4] index.html 도 risk-brackets → trading 순서다
 *   [5] ⭐ 두 경로가 ★실제로 다른 값★ 을 낸다 — 이 검사가 왜 필요한지의 증거.
 *       언젠가 두 값이 같아지면 이 파일째로 다시 볼 일입니다.
 *
 * 네트워크를 쓰지 않습니다. 사이트 코드도 서버도 건드리지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
/* 엔진과 같이 태워야 하는 모듈 목록 — tests/_engine-modules.js 한 곳에만 있습니다 */
const { 엔진필수, 엔진뒤 } = require("./_engine-modules.js");
/* 태우는 시점까지 같이 들고 다닙니다 — 순서가 뒤집히면 조용히 아무 일도 안 합니다.
   "먼저" = 엔진이 읽어가는 것 / "나중" = 엔진 함수를 감싸는 것 */
const 태울것 = 엔진필수.map((m) => Object.assign({ 시점: "먼저" }, m))
  .concat(엔진뒤.map((m) => Object.assign({ 시점: "나중" }, m)));
const TESTS = __dirname;
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* =========================================================================
 * 규칙 — 여기만 고치면 됩니다
 * ========================================================================= */

/* 엔진을 sandbox 에 태우면서도 구간표를 ★일부러★ 안 태우는 파일.
   ★이유를 반드시 적으세요.★ 이유 없이 이름만 넣으면 이 봉인이 무의미해집니다. */
/* ⚠️⚠️ 2026-09-01 — ★예외를 "파일 통째로" 에서 "모듈별" 로 바꿨습니다.★
   왜 — 목록에 js/max-margin-safe.js 가 추가되는 순간, 파일 통째 예외가
   ★새 모듈까지 같이 가려버립니다.★ risk-brackets 를 일부러 안 태우는 것과
   max-margin-safe 를 깜빡한 것은 전혀 다른 일인데, 옛 구조로는 구분이 안 됩니다.
   예외는 ★그 파일이 일부러 뺀 그 모듈 하나★ 에만 걸려야 합니다. */
const 예외 = {
  "risk-brackets-tiered-mmr.test.js": {
    모듈: ["js/risk-brackets.js"],
    이유:
      "구간표가 없을 때 예전 고정값(0.5%)으로 안전하게 되돌아가는지를 ★일부러★ 확인하는 " +
      "파일입니다. 이 파일만은 두 경로를 다 태워봐야 합니다.",
  },

  /* ⚠️ 2026-08-31 — ★이 봉인이 자기 자신에게 걸렸습니다.★
     아래 [5] 는 "구간표를 태울 때와 안 태울 때가 실제로 다른가" 를 증명하려고
     ★일부러 구간표 없이도★ 엔진을 띄웁니다. 그러니 이 파일이 규칙을 어기는 게
     맞습니다 — 예외로 두는 것이 정직합니다.
     (같은 날 tests/tests-dir-hygiene.test.js 도 자기 파일 이름에 걸려서
      이름을 바꿨습니다. 그쪽은 원인을 없앨 수 있었지만, 여기는 원인 자체가
      이 파일의 목적이라 없앨 수 없습니다) */
  "mmr-fallback-blindspot.test.js": {
    모듈: ["js/risk-brackets.js"],
    이유:
      "이 파일 [5] 는 두 경로가 실제로 다른 값을 내는지 보이려고 구간표 없이도 " +
      "엔진을 띄웁니다. 그게 이 파일의 목적이라 예외입니다.",
  },
};

/* 이 파일이 그 모듈을 일부러 뺐는가 */
function 예외인가(name, 경로) {
  const e = 예외[name];
  return !!e && e.모듈.indexOf(경로) !== -1;
}

/* "js/trading.js" 라는 글자가 나오지만 엔진을 태우는 게 아닌 파일들.
   ★왜 아닌지 적으세요.★ */
const 로드아님파일 = {
  "dev-server.test.js": "로컬 서버가 특정 파일을 특별 취급하지 않는지 보는 목록입니다(엔진을 안 태웁니다)",
  "locked-hashes-source.test.js": "md5 기준값을 다루는 파일이라 경로 문자열만 나옵니다",
  "_locked-hashes.js": "md5 기준값 자체를 담은 파일입니다",
  "_engine-modules.js": "무엇을 태울지 적어둔 목록 자체입니다(태우는 파일이 아닙니다)",
};

/* =========================================================================
 * 판정기 — 한 줄이 "엔진을 태우는 줄" 인가
 * ---------------------------------------------------------------------
 * 왜 줄 단위로 보나 — 같은 "js/trading.js" 글자가 세 가지로 쓰입니다.
 *   ① 로드 목록          "js/trading.js",              ← 이것만 대상
 *   ② md5 해시맵 키       "js/trading.js": 해시,
 *   ③ 수정 금지 12개 목록  "js/trading.js", "js/ui.js", "js/auth.js", ...
 * ③ 은 항상 js/auth.js · js/supabase-sync.js 같은 다른 잠긴 파일과 한 줄에
 * 붙어 다닙니다. 로드 목록에는 그 파일들이 안 들어갑니다(테스트가 네트워크를
 * 안 쓰므로). 그 차이로 가릅니다.
 * ========================================================================= */
const 다른잠긴파일 = /js\/(auth|supabase-sync|leaderboard|admin|season|board|orderbook|websocket|chat)\.js/;
const 소스읽기 = /indexOf\(|\.match\(|줄번호\(|at\(|const trading = |const src = |const engine = |jsCap|copyFileSync/;

/* ⚠️ 2026-08-31 — 이 봉인이 ★자기 돌연변이 검사에서 안 잡혔습니다★ (고쳤습니다)
   처음에는 파일 전체에서 indexOf("js/risk-brackets.js") 로 봤습니다.
   harness.js 의 로드 줄을 일부러 지워봤는데 ★그대로 통과★ 했습니다 —
   지운 줄 바로 위 ★주석★ 에 같은 글자가 적혀 있었기 때문입니다.
   CLAUDE.md 가 md5 로 검사하라고 적어둔 것과 같은 함정입니다:
   "문자열 검사는 못 쓴다. 주석에 파일명이 적혀 있어 오탐이 난다."
   그래서 ★주석을 걷어낸 뒤★, ★따옴표에 싸인★ 경로만 봅니다.
   (로드 목록은 항상 "js/risk-brackets.js" 처럼 따옴표 안에 있습니다) */
function 주석걷어내기(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ") // /* ... */ 통째로
    .split(/\r?\n/)
    .map((l) => (/^\s*(\/\/|\*)/.test(l) ? "" : l)) // 줄 주석 · 여러 줄 주석 이어짐
    .join("\n");
}

function 구간표태우는줄인가(line) {
  return /["']js\/risk-brackets\.js["']/.test(line);
}

function 엔진태우는줄인가(line) {
  if (!/["']js\/trading\.js["']/.test(line)) return false;
  if (/["']js\/trading\.js["']\s*:/.test(line)) return false; // 해시맵 키
  if (다른잠긴파일.test(line)) return false; // 수정 금지 12개 목록
  if (소스읽기.test(line)) return false; // 소스를 글자로 읽는 것
  return true;
}

/* =========================================================================
 * [1] 판정기 자체 확인 — ★이게 이 봉인의 핵심입니다★
 *     판정기가 헐거우면 뒤의 검사가 전부 무의미합니다.
 * ========================================================================= */
section("[1] 판정기 자체 확인 (오탐 / 미탐)");
{
  /* 잡아야 하는 것 — 실제 저장소에서 그대로 가져온 줄들입니다 */
  [
    ['    "js/trading.js",', "harness.js 의 로드 목록"],
    ['  files.push("js/trading.js");', "symbol-guard.test.js 의 push 방식"],
    [
      '  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });',
      "forced-liquidation-wipeout-seal.test.js 의 vm 방식",
    ],
    ['  "js/symbol-guard.js", "js/trading.js", "js/ui.js",', "boot-once.test.js 의 한 줄 목록"],
  ].forEach(([line, why]) => {
    ok("잡는다 — " + why, 엔진태우는줄인가(line), JSON.stringify(line));
  });

  /* 잡으면 안 되는 것 */
  [
    ['  "js/trading.js": require("./_locked-hashes.js").TRADING,', "md5 해시맵 키"],
    [
      '    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",',
      "수정 금지 12개 목록",
    ],
    ['  const trading = read("js/trading.js");', "소스를 글자로 읽는 줄"],
    [
      "  ok(\"뒤에 실린다\", html.indexOf('src=\"js/trading.js\"') > 0);",
      "index.html 안의 순서를 보는 줄",
    ],
  ].forEach(([line, why]) => {
    ok("안 잡는다 — " + why, !엔진태우는줄인가(line), JSON.stringify(line));
  });

  /* ⭐ 주석 함정 — 실제로 이 봉인이 여기에 걸렸습니다 (위 주석걷어내기 설명 참조).
     harness.js 의 로드 줄을 일부러 지웠는데도 통과했습니다. 지운 줄 위 주석에
     같은 글자가 있었기 때문입니다. 그 상황을 그대로 재현해 둡니다. */
  const 주석딸린가짜 = [
    "  const files = [",
    "    /* js/risk-brackets.js — 2026-08-31 대표 결재. 안 태우면 옛 값을 잽니다. */",
    '    "js/trading.js",',
    "  ];",
  ].join("\n");
  ok(
    "주석에만 적힌 js/risk-brackets.js 는 '태웠다' 로 안 친다",
    !주석걷어내기(주석딸린가짜).split(/\r?\n/).some(구간표태우는줄인가),
    "주석을 로드로 오해하면, 로드 줄을 지워도 이 봉인이 통과합니다"
  );
  ok(
    "따옴표에 싸인 로드 줄은 '태웠다' 로 친다",
    주석걷어내기('    "js/risk-brackets.js",').split(/\r?\n/).some(구간표태우는줄인가)
  );
}

/* =========================================================================
 * [2] 엔진을 태우는 테스트는 구간표도 먼저 태운다
 * ========================================================================= */
section("[2] 엔진을 태우는 테스트가 구간표도 태우는가");
const 엔진태움 = [];
{
  fs.readdirSync(TESTS)
    .filter((n) => /\.js$/.test(n))
    .forEach((name) => {
      if (로드아님파일[name]) return;
      const lines = 주석걷어내기(fs.readFileSync(path.join(TESTS, name), "utf8")).split(/\r?\n/);
      if (lines.some(엔진태우는줄인가)) 엔진태움.push(name);
    });

  ok("엔진을 태우는 파일을 찾아냈다 (0 이면 판정기가 고장난 것)", 엔진태움.length > 0,
    "찾은 수: " + 엔진태움.length);
  console.log("      ℹ 엔진을 sandbox 에 태우는 파일 " + 엔진태움.length + "개 (2026-08-31 실측 17)");

  엔진태움.forEach((name) => {
    if (예외[name]) return;
    const 원문 = fs.readFileSync(path.join(TESTS, name), "utf8");
    const src = 주석걷어내기(원문);
    /* ⭐ 목록(tests/_engine-modules.js)을 읽어 쓰는 테스트는 통과입니다.
       그게 권장 방식입니다 — 목록이 늘어도 자동으로 따라옵니다.

       ⚠️ 2026-08-31 — 처음에는 "require 했으면 통과" 로 만들었습니다.
       그런데 ★require 만 해놓고 실제로는 안 쓰는★ 돌연변이를 넣었더니
       그대로 통과했습니다. 방금 만든 검사에 방금 구멍이 생긴 것입니다.
       그래서 ★읽어온 이름이 실제로 쓰이는지★ 까지 봅니다(선언 말고 또 나와야 함). */
    /* ⚠️⚠️ 2026-09-01 — ★파일 이름만 적어도 통과되던 구멍을 막았습니다.★
       옛 검사는 "_engine-modules.js" 라는 글자가 든 줄이 있으면 목록을 쓰는 것으로
       봤습니다. 그런데 봉인 하나가 회원용 안내 문구에
         ok(..., "목록은 tests/_engine-modules.js 의 엔진뒤 에 있습니다")
       라고 적었을 뿐인데 ★그 한 줄로 통과★ 해버렸습니다. 이 파일 위쪽에 적어둔
       "문자열 검사는 못 쓴다 — 파일명이 적혀 있어 오탐이 난다" 를 우리가 또 밟은 것입니다.
       그래서 ★실제로 require 하는 줄★ 만 봅니다. 설명에 파일 이름을 적는 것은 자유입니다. */
    const 읽는줄 = src
      .split(/\r?\n/)
      .find((l) => l.indexOf("_engine-modules.js") !== -1 && l.indexOf("require(") !== -1);
    if (읽는줄) {
      const m = 읽는줄.match(/const\s*\{?\s*([A-Za-z0-9_$가-힣]+)/);
      const 이름 = m ? m[1] : null;
      const 쓰인횟수 = 이름 ? (src.split(이름).length - 1) : 0;
      ok(
        name + " 이 tests/_engine-modules.js 목록을 ★실제로 써서★ 태운다",
        !!이름 && 쓰인횟수 >= 2,
        "목록을 읽어오기만 하고 로드 목록에 안 넣었습니다 (" + 이름 + " 등장 " + 쓰인횟수 + "회)." +
          "\n         → require 만 하면 아무것도 안 태워집니다. 실제 로드 목록에 넣으세요."
      );
      /* ⚠️⚠️ 2026-09-01 — 목록이 ★두 개★ 가 됐습니다(엔진필수 · 엔진뒤).
         하나만 읽어 쓰면 나머지가 조용히 안 태워집니다. 옛 검사는 "아무 이름이나 하나만 쓰면 통과" 라서
         이걸 못 잡습니다. 그래서 ★둘 다★ 확인합니다. */
      ["엔진필수", "엔진뒤"].forEach((목록이름) => {
        const 횟수 = src.split(목록이름).length - 1;
        ok(
          name + " 이 목록 " + 목록이름 + " 도 실제로 써서 태운다",
          횟수 >= 2,
          목록이름 + " 이 " + 횟수 + "회만 나옵니다 — 목록 하나만 읽고 나머지는 " +
            "태우지 않고 있습니다." +
            "\n         → 엔진필수 는 js/trading.js 앞, 엔진뒤 는 뒤에 넣으세요."
        );
      });
      return;
    }

    const tr = src.search(new RegExp("[\"']js/trading\\.js[\"']"));
    태울것.forEach((m) => {
      if (예외인가(name, m.경로)) return;   // 그 모듈 하나만 건너뜁니다(파일 통째가 아닙니다)
      const 찾기 = new RegExp("[\"\"']" + m.경로.replace(/[.]/g, "[.]") + "[\"\"']");
      const rb = src.search(찾기);
      const 자리 = m.시점 === "먼저" ? "바로 앞" : "바로 뒤";
      ok(
        name + " 이 " + m.경로 + " 를 같이 태운다",
        rb !== -1,
        m.이유 +
          "\n         → 로드 목록에서 \"js/trading.js\" " + 자리 + "에 \"" + m.경로 + "\" 를 넣으세요." +
          "\n         → 또는 tests/_engine-modules.js 의 엔진필수·엔진뒤 를 읽어 쓰세요(권장)." +
          "\n         → 일부러 그런 것이면 이 파일 위쪽 예외 목록에 ★모듈 이름과 이유★ 를 적으세요."
      );
      if (rb === -1) return;
      if (m.시점 === "먼저") {
        ok(
          name + " 이 " + m.경로 + " 를 엔진보다 ★먼저★ 태운다",
          rb < tr,
          "index.html 은 " + m.경로 + " → js/trading.js 순서입니다. 뒤집히면 실제와 달라집니다."
        );
      } else {
        /* ⭐ 감싸는 모듈은 반대입니다. 먼저 태우면 App.Trading 이 아직 없어서
           ★조용히 아무 일도 안 합니다★ — 오류도 안 나서 알아채기 어렵습니다. */
        ok(
          name + " 이 " + m.경로 + " 를 엔진보다 ★나중에★ 태운다",
          rb > tr,
          "감싸는 모듈입니다. js/trading.js 보다 먼저 태우면 App.Trading 이 아직 없어서" +
            "\n         아무것도 감싸지 않고 되돌아갑니다(오류 없음). 테스트만 초록이 됩니다."
        );
      }
    });
  });
}

/* =========================================================================
 * [3] 예외는 이유가 적혀 있어야 한다
 * ========================================================================= */
section("[3] 예외 목록");
{
  const 알려진경로 = 태울것.map((m) => m.경로);
  Object.keys(예외).forEach((name) => {
    const e = 예외[name];
    ok(
      "예외 " + name + " 에 이유가 적혀 있다",
      !!e && typeof e.이유 === "string" && e.이유.trim().length > 20,
      "예외는 반드시 이유가 있어야 합니다. 이유 없는 예외는 목록이 자라기만 합니다."
    );
    /* ⭐ 2026-09-01 — ★파일 통째 예외를 금지합니다.★ 목록에 모듈이 하나 추가되면
       옛 구조에서는 그 새 모듈까지 같이 가려졌습니다. 그게 정확히 조용한 고장입니다. */
    ok(
      "예외 " + name + " 이 ★어느 모듈★ 을 뺐는지 적혀 있다",
      !!e && Array.isArray(e.모듈) && e.모듈.length > 0,
      "파일 통째 예외는 안 됩니다 — 나중에 목록에 모듈이 추가되면 그것까지 같이 가립니다."
    );
    (e && Array.isArray(e.모듈) ? e.모듈 : []).forEach((경로) => {
      ok(
        "예외 " + name + " 의 " + 경로 + " 가 실제 목록에 있는 모듈이다",
        알려진경로.indexOf(경로) !== -1,
        "목록에 없는 모듈을 예외로 적어두면 오타를 눈치채지 못합니다. 지금 목록: " +
          알려진경로.join(", ")
      );
    });
    ok(
      "예외 " + name + " 이 실제로 있는 파일이다",
      fs.existsSync(path.join(TESTS, name)),
      "없는 파일이 예외에 남아 있으면 다음 사람이 그걸 보고 따라 합니다"
    );
  });
  Object.keys(로드아님파일).forEach((name) => {
    ok(
      "로드아님 " + name + " 이 실제로 있는 파일이다",
      fs.existsSync(path.join(TESTS, name)),
      "없는 파일이 목록에 남아 있습니다"
    );
  });
}

/* =========================================================================
 * [4] index.html 도 같은 순서다
 * ========================================================================= */
section("[4] index.html 순서");
{
  const html = read("index.html");
  const rb = html.indexOf('src="js/risk-brackets.js"');
  const tr = html.indexOf('src="js/trading.js"');
  ok("index.html 이 js/risk-brackets.js 를 부른다", rb !== -1,
    "안 부르면 라이브에서 엔진이 조용히 옛 고정값(0.5%)으로 돌아갑니다");
  ok("index.html 이 구간표를 엔진보다 먼저 부른다", rb !== -1 && rb < tr,
    "risk-brackets " + rb + " / trading " + tr);

  /* ⭐ 2026-09-01 — 감싸는 모듈은 ★엔진 뒤★ 여야 합니다.
     라이브에서 순서가 뒤집히면 회원만 옛 동작을 겪습니다(테스트는 초록). */
  엔진뒤.forEach((m) => {
    const at = html.indexOf('src="' + m.경로 + '"');
    ok("index.html 이 " + m.경로 + " 를 부른다", at !== -1,
      "안 부르면 라이브에서 감싸지지 않은 옛 동작이 그대로 나갑니다");
    ok("index.html 이 " + m.경로 + " 를 엔진보다 ★뒤에★ 부른다", at !== -1 && at > tr,
      m.경로 + " " + at + " / trading " + tr);
  });
}

/* =========================================================================
 * [5] ⭐ 두 경로가 실제로 다른 값을 낸다 — 이 봉인이 필요한 이유의 증거
 * ---------------------------------------------------------------------
 * 소스를 읽어서 "태웠나" 만 보면, 언젠가 두 경로가 같은 값을 내게 됐을 때도
 * 이 봉인이 계속 남아 아무 뜻 없이 돌아갑니다. 그래서 ★진짜로 값이 갈리는지★
 * 를 여기서 직접 계산합니다. 값이 같아지면 이 검사가 터지고, 그때 이 파일을
 * 통째로 다시 볼 수 있습니다.
 * ========================================================================= */
section("[5] 구간표를 태울 때와 안 태울 때가 실제로 다른가");
{
  function 엔진띄우기(구간표태움) {
    const store = {};
    const sandbox = {
      console: { log() {}, warn() {}, error() {} },
      setInterval: () => 0,
      clearInterval: () => {},
      setTimeout: () => 0,
      JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
      Math: Math, Date: Date, isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat,
      module: { exports: {} },
      document: { readyState: "complete", addEventListener() {} },
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
      },
    };
    sandbox.window = sandbox;
    const L = {};
    sandbox.App = {
      Bus: {
        on(e, f) { (L[e] = L[e] || []).push(f); return f; },
        off() {},
        emit(e, p) { (L[e] || []).forEach((f) => f(p)); },
      },
      Config: { getActiveSymbol: () => "BTCUSDT" },
    };
    vm.createContext(sandbox);
    vm.runInContext(read("js/storage.js"), sandbox, { filename: "js/storage.js" });
    if (구간표태움) {
      vm.runInContext(read("js/risk-brackets.js"), sandbox, { filename: "js/risk-brackets.js" });
    }
    vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
    sandbox.App.Trading.init();
    return sandbox.App.Trading;
  }

  /* 진입가 60,000 · 100배 · 증거금 95,238.0952 (= 지갑 100,000 최대 버튼)
     명목 9,523,809.52 → 4구간(1%, 공제 12,000) → 실효 0.874% */
  const 진입 = 60000;
  const 증거금 = 95238.095238;
  const 명목 = 증거금 * 100;

  const 없이 = 엔진띄우기(false).calcLiquidationPrice("long", 진입, 100, 명목);
  const 함께 = 엔진띄우기(true).calcLiquidationPrice("long", 진입, 100, 명목);

  ok("구간표 없이 계산하면 예전 값 59,700 이 나온다 (fallback 경로)",
    Math.abs(없이 - 59700) < 0.01, String(없이));
  ok("구간표와 함께 계산하면 59,924.40 이 나온다 (회원이 실제로 겪는 값)",
    Math.abs(함께 - 59924.4) < 0.01, String(함께));
  ok("⭐ 두 경로가 실제로 다르다 (같아지면 이 봉인을 다시 보세요)",
    Math.abs(없이 - 함께) > 1,
    "차이 " + Math.abs(없이 - 함께).toFixed(4) +
      " — 두 경로가 같아졌다면 이 파일이 지키던 위험이 사라진 것입니다. PM 에게 알리세요.");
  console.log(
    "      ℹ 버팀폭 — 구간표 없이 " +
      (((진입 - 없이) / 진입) * 100).toFixed(3) +
      "% / 구간표와 함께 " +
      (((진입 - 함께) / 진입) * 100).toFixed(3) +
      "%"
  );
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
