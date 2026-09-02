/* tests/tests-dir-hygiene.test.js
 * =========================================================================
 * 봉인 — tests/ 안의 ★임시 파일★ 이 git 에 딸려 올라가는 것을 막습니다
 * =========================================================================
 *
 * ── 무엇이 실제로 있었나 ────────────────────────────────────────────────
 *   2026-08-30 — PM 이 커밋할 때 파일을 쓸어담아서
 *       tests/tw-probe-tmp.js
 *   가 커밋 e3cfc66 에 딸려 들어갔습니다. 팀이 조사하려고 잠깐 만든 파일인데
 *   아무도 부르지 않습니다. .test.js 가 아니라서 npm test 도 안 돌립니다.
 *   ★오류가 안 납니다.★ 그냥 저장소에 쓰레기가 하나 남습니다.
 *   (2026-08-31 에 index 에서 지웠습니다. 이 파일이 재발을 막습니다)
 *
 *   같은 뿌리의 사고가 CLAUDE.md 에도 적혀 있습니다 —
 *   "여섯 팀이 같은 작업트리를 동시에 씁니다. git add -A 는 남의 미완성을
 *    같이 올립니다." 실제로 fde463a 에서 "뺐습니다" 라고 적어놓고
 *    799e3f6 에서 그대로 반복했습니다.
 *
 * ── 이 파일이 못 박는 것 ────────────────────────────────────────────────
 *   [1] tests/ 에 ★git 이 추적하는★ 파일은 셋 중 하나여야 한다
 *         · _order.txt 에 등록된 .test.js
 *         · 아래 도우미목록 에 이름이 적힌 파일
 *         · (그 외는 전부 실패)
 *       ⚠ 디스크에만 있고 git 밖인 파일은 봐주지 않습니다 — 그건 작업 중인
 *         임시 파일이고, 정상입니다. ★커밋에 들어가는 순간★ 만 막습니다.
 *   [2] 파일 이름에 tmp · temp · scratch 같은 낱말이 ★낱말 단위★로 들어가면 실패
 *   [3] tests/ 아래 폴더에 숨은 .test.js 가 없다
 *       — tests/_run-all.js 의 readdirSync 는 폴더 안을 안 봅니다.
 *         거기 있으면 tests/test-registry.test.js 의 개수 검사에도 안 걸리고
 *         npm test 도 안 돌립니다. 조용한 사각지대라 여기서 같이 막습니다.
 *   [4] tests/tw-probe-tmp.js 가 다시 추적되지 않는다 (실제로 났던 그 파일)
 *
 * ── ★오탐을 실제로 확인했습니다★ ───────────────────────────────────────
 *   "template" 안에 "temp" 가 들어 있습니다. 부분 문자열로 검사하면
 *   멀쩡한 이름이 걸립니다. 그래서 이름을 낱말로 쪼갠 뒤 ★정확히 같을 때만★
 *   잡습니다.
 *
 *   2026-08-31 실측 — 지금 git 이 추적하는 tests/ 파일 이름을 전부 낱말로
 *   쪼개니 낱말 222개가 나왔고, 그중 금지 낱말과 정확히 같은 것은 0개였습니다.
 *   부분 문자열로 검사했다면 아래가 잘못 걸립니다:
 *       forced-liquidation-wipeout-seal.test.js   ← "wip" 이 들어 있음
 *       (그리고 앞으로 생길 "template" 류 전부)
 *   반대로 "bar"(power-bar) · "delete"(member-delete-sql) 는 정상 낱말이라
 *   금지 목록에서 일부러 뺐습니다.
 *
 *   금지 낱말을 두 단으로 나눈 이유 —
 *     "probe" 는 js/jitter-probe.js 라는 ★진짜 모듈★ 이름입니다.
 *     그 모듈의 봉인 테스트가 tests/jitter-probe.test.js 로 생기는 것은 정상입니다.
 *     그래서 probe · draft · sandbox 같은 낱말은 "_order.txt 에 등록된
 *     제대로 된 테스트" 에는 안 겁니다. 등록도 안 된 파일에만 겁니다.
 *
 *
 * ── ⚠️⚠️ 2026-08-31 — 이 봉인이 ★자기 이름★ 에 걸렸습니다 (이름을 바꿨습니다) ──
 *   처음 이름이 tests/temp-file-guard.test.js 였습니다.
 *   "temp" 를 금지하는 파일 이름에 "temp" 가 들어 있었던 것입니다.
 *
 *   ★단독 실행으로는 안 잡혔습니다.★ 아래 [2][3] 은 "git 이 추적하는" 파일만
 *   봅니다. 파일이 아직 git 밖일 때는 자기가 목록에 없어서 통과했고,
 *   PM 이 git add 한 ★그 순간★ 터졌습니다.
 *
 *       [3] 추적되는 tests/ 파일 이름에 임시 낱말이 없다 (157개 전부 훑음)
 *           ✗ ["temp-file-guard.test.js (temp)"]
 *
 *   같은 날 같은 함정을 이미 두 번 밟았습니다 —
 *   tests/sync-guard-baseline-blindspot.test.js 에서 "가짜클라이언트" 와
 *   require("vm") 이라는 낱말이 자기 코드에 걸렸습니다.
 *   ★이번엔 코드가 아니라 파일 이름이라 눈에 안 보였습니다.★
 *
 *   ── 왜 "예외" 가 아니라 "이름 바꾸기" 로 했나 ──
 *     1) 예외를 한 번 만들면 다음 사람이 자기 파일도 예외에 넣습니다.
 *        예외 목록은 반드시 자랍니다.
 *     2) __filename 으로 자기만 빼는 방법도 있었지만(목록이 아니라 못 자랍니다),
 *        ★"temp 금지" 를 강제하는 파일 이름이 temp-file-guard 인 것 자체가★
 *        다음 사람에게 혼란입니다. 규칙과 이름이 어긋나면 규칙이 안 지켜집니다.
 *     3) 이름을 바꾸면 ★원인이 사라집니다.★ 예외는 증상만 가립니다.
 *
 *   ⭐ 재발 방지 — 아래 [0] 이 ★자기 파일 이름★ 을 자기 판정기에 넣어 봅니다.
 *      다음에 누가 이 파일 이름을 바꿔서 금지 낱말이 들어가면 그 자리에서 터집니다.
 *      (봉인을 붙인 뒤가 아니라 ★단독 실행에서도★ 잡힙니다)
 * 사이트 코드도 서버도 건드리지 않습니다. jsdom 도 안 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const TESTS = __dirname;

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? " → " + detail : ""));
    console.log("  " + MARK_NG + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* =========================================================================
 * 규칙 — 여기만 고치면 됩니다
 * ========================================================================= */

/* tests/ 안에서 .test.js 가 아니어도 정당한 파일들.
   ★새로 추가할 때는 "왜 필요한지" 를 옆에 적으세요.★
   여기에 이름을 적는 것이 곧 "이건 임시 파일이 아니다" 라는 선언입니다. */
const 도우미목록 = {
  "README.md": "테스트 폴더 설명",
  /* 2026-09-02 16차 차트팀 — js/chart-drawings.js 를 브라우저 없이 띄우는 가짜 차트.
     chart-channel-seal 안에 같은 뼈대가 이미 있는데 그 파일은 여러선 봉인이라
     손대지 않았습니다. 새 봉인이 또 베끼면 가짜 차트가 두 벌이 됩니다. */
  "_chart-drawings-boot.js": "차트 선긋기 모듈을 태우는 공용 가짜 차트(봉인이 읽습니다)",
  "_order.txt": "npm test 실행 순서 목록",
  "_run-all.js": "npm test 가 부르는 전체 실행기",
  "harness.js": "여러 테스트가 함께 쓰는 공용 부팅 도구",
  /* 2026-08-31 — 수정 금지 12개 파일의 md5 를 여기 한 곳에만 둡니다.
     대표 결재로 js/trading.js 가 열렸을 때 옛 해시를 든 봉인 48개가 한꺼번에
     터졌는데, 같은 32자리 문자열이 48곳에 따로 박혀 있어서 고치는 데만 48번이
     들었습니다. B·C·D 건이 남아 있어 앞으로도 서너 번 더 바뀝니다.
     한 곳으로 모으고, tests/locked-hashes-source.test.js 가 그 한 곳을 감시합니다. */
  "_locked-hashes.js": "수정 금지 파일 md5 의 단 하나의 출처(봉인 48개가 읽습니다)",
  /* 2026-08-31 — 거래 엔진을 sandbox 에 태울 때 같이 태워야 하는 모듈 목록.
     봉인 16개가 js/risk-brackets.js 를 안 태워서 회원이 겪지 않는 옛 고정값
     경로를 재고 있었습니다(조용한 고장). 목록을 한 곳에만 둡니다. */
  "_engine-modules.js": "엔진 sandbox 에 같이 태울 모듈 목록(harness 와 봉인이 읽습니다)",
  /* 2026-09-02 — 지표 틀(js/chart-indicator-kit.js)을 브라우저 없이 태우는 도구.
     이 틀을 보는 테스트가 셋이 됐습니다(색 겹침 · 기준선 · 계산). 가짜 DOM 을
     파일마다 한 벌씩 두면 같은 값이 세 벌이 되므로 여기 한 곳에만 둡니다.
     ⭐ 진짜와 일부러 다르게 만든 곳이 하나 있습니다 — 지워진 시리즈에
        removePriceLine 을 부르면 던집니다. 그래야 "기준선을 시리즈보다 나중에
        지워서 화면에 남는" 사고를 숫자로 잡을 수 있습니다(파일 머리말 참조). */
  "_kit-harness.js": "지표 틀 부팅 도구(색 겹침 · 기준선 · 계산 테스트 셋이 읽습니다)",
};

/* 낱말 단위로 정확히 같을 때만 잡습니다. 부분 문자열이 아닙니다. */
const 강한금지 = [
  "tmp", "temp", "temporary", "scratch", "scratchpad",
  "bak", "junk", "trash", "deleteme", "untitled", "wip",
];
/* 진짜 기능 이름일 수 있는 낱말들 — _order.txt 에 등록된 정식 테스트에는 안 겁니다.
   (js/jitter-probe.js 처럼 "probe" 가 실제 모듈 이름인 경우가 있습니다) */
const 약한금지 = ["probe", "draft", "sandbox", "playground", "dummy", "backup", "debug"];

/* 이름을 낱말로 쪼갭니다 — 영문자·숫자가 아닌 것은 전부 구분자로 봅니다.
   "tw-probe-tmp.js"      → tw / probe / tmp / js
   "orderbook-template.js" → orderbook / template / js     ("temp" 는 안 나옵니다) */
function 낱말쪼개기(이름) {
  return 이름
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/* 판정기 — 걸린 낱말들을 돌려줍니다. 빈 배열이면 통과입니다. */
function 임시이름판정(이름, 정식테스트인가) {
  const 낱말들 = 낱말쪼개기(이름);
  const 금지 = 정식테스트인가 ? 강한금지 : 강한금지.concat(약한금지);
  return 낱말들.filter((w) => 금지.indexOf(w) >= 0);
}

/* =========================================================================
 * [0] 판정기가 진짜 도는가 — ★오탐 확인이 이 봉인의 핵심입니다★
 * ========================================================================= */
section("[0] 판정기 자체 확인 (오탐 / 미탐)");
{
  /* 잡아야 하는 것 */
  [
    "tw-probe-tmp.js",
    "foo.tmp.js",
    "scratch-1.js",
    "order-panel.test.js.bak",
    "_tmp-check.js",
    "wip-thing.js",
    "untitled.js",
  ].forEach((n) => {
    ok("잡는다 — " + n, 임시이름판정(n, false).length > 0);
  });

  /* ★절대 잡으면 안 되는 것★ — "template" 안에 "temp" 가 있습니다 */
  [
    "orderbook-template.test.js",
    "template.test.js",
    "forced-liquidation-wipeout-seal.test.js", // "wip" 이 들어 있음
    "member-delete-sql.test.js",
    "market-war-power-bar.test.js",
    "placeholder-values.test.js",
    "attempt-order.test.js", // "temp" 가 들어 있음
    "contemporary-rank.test.js", // "tempor" 가 들어 있음
    "stale-price-guard.test.js",
  ].forEach((n) => {
    ok("안 잡는다 (오탐 없음) — " + n, 임시이름판정(n, false).length === 0,
      JSON.stringify(임시이름판정(n, false)));
  });

  ok('부분 문자열이었다면 "template" 이 잘못 걸렸을 것이다 (규칙을 좁힌 이유)',
    "orderbook-template.test.js".indexOf("temp") >= 0);
  ok('부분 문자열이었다면 "wipeout" 이 잘못 걸렸을 것이다',
    "forced-liquidation-wipeout-seal.test.js".indexOf("wip") >= 0);

  /* 두 단 규칙 — probe 는 정식 테스트면 봐줍니다 */
  ok('"jitter-probe.test.js" 는 등록된 정식 테스트면 봐준다 (js/jitter-probe.js 가 실제 모듈)',
    임시이름판정("jitter-probe.test.js", true).length === 0);
  ok('"jitter-probe.js" 가 등록 안 된 파일이면 잡는다',
    임시이름판정("jitter-probe.js", false).length > 0);
  ok('강한금지는 정식 테스트여도 봐주지 않는다 — "a-tmp.test.js"',
    임시이름판정("a-tmp.test.js", true).length > 0);

  /* ⭐⭐ 자기 자신을 판정기에 넣어 봅니다 — 2026-08-31 에 실제로 여기 걸렸습니다.
     ⚠ [2][3] 은 "git 이 추적하는" 파일만 보기 때문에, 이 파일이 아직 git 밖이면
       자기 이름을 검사할 기회가 아예 없습니다. 그래서 git 과 무관하게 여기서 봅니다.
       (그때 못 잡아서 PM 이 git add 한 순간에야 터졌습니다) */
  const 내이름 = path.basename(__filename);
  ok("★이 파일 이름 자신이 금지 낱말에 안 걸린다★ (" + 내이름 + ")",
    임시이름판정(내이름, true).length === 0,
    "걸린 낱말: " + JSON.stringify(임시이름판정(내이름, true)) +
      " — 이 파일 이름을 바꾸세요. 예외로 빼지 마세요. " +
      "예외를 한 번 만들면 다음 사람이 자기 파일도 넣습니다");
  ok("이 파일이 tests/ 안에 있고 .test.js 다", 내이름.slice(-8) === ".test.js");
}

/* =========================================================================
 * [1] git 이 추적하는 tests/ 파일 목록
 * ========================================================================= */
section("[1] git 추적 목록 읽기");

const NUL = String.fromCharCode(0);
function git(인자들) {
  try {
    return execFileSync("git", 인자들, { cwd: REPO, maxBuffer: 16 * 1024 * 1024 }).toString();
  } catch (e) {
    return null;
  }
}

/* ⚠ 한글 이름이 섞이면 git 이 따옴표로 감싸 내놓습니다. -z 로 NUL 구분을 씁니다
   (tests/docs-sql-tracked.test.js 에서 실제로 걸렸던 함정입니다). */
const 본문 = git(["ls-files", "-z", "--", "tests"]);
ok("git ls-files 가 응답한다", 본문 !== null,
  "git 을 못 불렀습니다 — 아래 판정을 신뢰할 수 없습니다");

const 추적 = (본문 || "")
  .split(NUL)
  .filter(Boolean)
  .map((p) => p.replace(/^tests[/]/, ""));

ok("추적되는 tests/ 파일이 있다 (" + 추적.length + "개)", 추적.length > 0);

/* _order.txt 에 등록된 테스트 (정식 테스트 판정에 씁니다) */
let 등록 = [];
try {
  등록 = fs
    .readFileSync(path.join(TESTS, "_order.txt"), "utf8")
    .split("\n")
    .map((줄) => 줄.trim())
    .filter((줄) => 줄 && 줄.charAt(0) !== "#")
    .map((줄) => 줄.replace(/^tests[/]/, ""));
} catch (e) {
  등록 = [];
}
const 등록집합 = Object.create(null);
등록.forEach((f) => (등록집합[f] = true));

/* =========================================================================
 * [2] 추적되는 파일은 "등록된 테스트" 아니면 "이름 적힌 도우미" 뿐이다
 *     ← tw-probe-tmp.js 를 이름과 상관없이 잡는 그물입니다
 * ========================================================================= */
section("[2] 정체불명 파일이 커밋에 들어가 있나");
{
  const 정체불명 = 추적.filter(
    (f) => !등록집합[f] && !Object.prototype.hasOwnProperty.call(도우미목록, f)
  );
  ok("tests/ 에 정체불명 파일이 없다 (추적 " + 추적.length + "개 검사)",
    정체불명.length === 0,
    "이런 파일이 커밋에 들어 있습니다: " + JSON.stringify(정체불명) +
      "\n         → 임시 파일이면 git rm --cached 로 빼세요." +
      "\n         → 정식 테스트면 tests/_order.txt 에 등록하세요." +
      "\n         → 공용 도우미면 이 파일의 도우미목록 에 이름과 이유를 적으세요.");

  const 도우미이름 = Object.keys(도우미목록);
  ok("도우미목록에 적힌 파일이 전부 실제로 있다 (" + 도우미이름.length + "개)",
    도우미이름.every((f) => fs.existsSync(path.join(TESTS, f))),
    JSON.stringify(도우미이름.filter((f) => !fs.existsSync(path.join(TESTS, f)))));
  ok("도우미목록이 불필요하게 커지지 않았다 (지금 " + 도우미이름.length + "개, 상한 8)",
    도우미이름.length <= 8,
    "임시 파일을 목록에 적어서 통과시키는 것으로 이 봉인을 무력화하지 마세요");
}

/* =========================================================================
 * [3] 이름 검사 — 추적되는 모든 파일
 * ========================================================================= */
section("[3] 이름에 임시 낱말이 있나");
{
  const 걸린것 = [];
  추적.forEach((f) => {
    const 정식 = !!등록집합[f] && f.slice(-8) === ".test.js";
    const 낱말 = 임시이름판정(f, 정식);
    if (낱말.length) 걸린것.push(f + " (" + 낱말.join(",") + ")");
  });
  ok("추적되는 tests/ 파일 이름에 임시 낱말이 없다 (" + 추적.length + "개 전부 훑음)",
    걸린것.length === 0,
    JSON.stringify(걸린것) + " — 임시 파일은 scratchpad 에 두세요");

  /* 실제로 났던 그 파일 */
  ok("tests/tw-probe-tmp.js 가 git 에 없다 (2026-08-30 커밋 e3cfc66 사고)",
    추적.indexOf("tw-probe-tmp.js") === -1,
    "다시 들어왔습니다. git rm --cached tests/tw-probe-tmp.js");

  /* 낱말 통계를 남깁니다 — 나중에 "왜 이 규칙이 안전한가" 를 다시 재볼 때 씁니다 */
  const 낱말집합 = Object.create(null);
  추적.forEach((f) => 낱말쪼개기(f).forEach((w) => (낱말집합[w] = true)));
  console.log("    (참고) 추적 파일 이름에서 나온 서로 다른 낱말 " +
    Object.keys(낱말집합).length + "개 / 금지 낱말과 정확히 겹친 것 0개");
}

/* =========================================================================
 * [4] 폴더에 숨은 .test.js — _run-all.js 도 test-registry 도 못 보는 사각지대
 * ========================================================================= */
section("[4] tests/ 아래 폴더에 숨은 테스트");
{
  const 하위폴더 = fs
    .readdirSync(TESTS, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  ok("tests/ 아래에 폴더가 없다 (" + JSON.stringify(하위폴더) + ")",
    하위폴더.length === 0,
    "tests/_run-all.js 의 readdirSync 는 폴더 안을 안 봅니다. " +
      "거기 둔 .test.js 는 npm test 가 영원히 안 돌리고 " +
      "tests/test-registry.test.js 의 개수 검사에도 안 걸립니다");

  const 하위추적 = 추적.filter((f) => f.indexOf("/") >= 0);
  ok("git 에도 tests/ 하위 경로 파일이 없다", 하위추적.length === 0,
    JSON.stringify(하위추적));
}

/* =========================================================================
 * [5] 등록 확인 — 이 파일도 예외가 아닙니다
 * ========================================================================= */
section("[5] 이 파일 자신의 등록");
{
  const 파일명 = "tests/tests-dir-hygiene.test.js";
  let order = "";
  try {
    order = fs.readFileSync(path.join(TESTS, "_order.txt"), "utf8");
  } catch (e) {
    order = "";
  }
  ok("tests/_order.txt 에 이 파일이 등록돼 있다", order.indexOf(파일명) >= 0,
    "등록 안 하면 파일은 멀쩡한데 아무도 안 돌립니다 (2026-08-30 실제 사고)");
}


/* =========================================================================
 * [6] ⭐⭐ ★등록된 파일★ 은 git 추적 여부와 상관없이 이름을 본다
 * -------------------------------------------------------------------------
 * ⚠️⚠️ 2026-08-31 — 이 봉인이 ★커밋된 뒤에야★ 빨강이 됐습니다 (c6242d8)
 *
 *   기록팀이 tests/_sandbox-modules.js 를 만들었습니다. "sandbox" 는 아래
 *   약한금지 낱말입니다. 그런데 아무도 못 봤습니다 —
 *
 *     ① 기록팀이 npm test 를 돌림 → 159/159 통과
 *        (그때 그 파일은 아직 ★git 밖★ 이라 [2][3] 목록에 안 들어갔습니다)
 *     ② PM 이 git add tests/ → ★그 순간 추적 대상이 됨★
 *     ③ PM 이 다시 안 돌리고 커밋 → 배포까지 나감
 *
 *   ★같은 성질로 오늘 두 번 당했습니다.★ 첫 번째는 이 파일 자신이었습니다
 *   (temp-file-guard → tests-dir-hygiene 개명, 위 머리말 참조).
 *   그때 "git add 한 그 순간 터졌습니다" 라고 적어놓고, 그 교훈이
 *   ★사람의 절차★ 에만 남아 있었습니다. 사람은 잊습니다.
 *
 * ── 그래서 무엇을 바꿨나 ──────────────────────────────────────────────
 *   [2][3] 이 git 추적 파일만 보는 것은 ★그대로 둡니다.★ 그건 맞는 규칙입니다 —
 *   작업 중 임시 파일까지 잡으면 아무도 조사를 못 합니다.
 *
 *   대신 ★등록된 파일★ 은 다르게 봅니다.
 *     · 위 도우미목록 에 이름을 적었다
 *     · tests/_order.txt 에 등록했다
 *   이건 둘 다 ★"이건 임시 파일이 아니다" 라는 선언★ 입니다.
 *   선언해 놓고 임시 낱말을 쓰는 건 앞뒤가 안 맞습니다.
 *   그러니 git 이 알든 모르든 ★그 자리에서★ 잡습니다.
 *
 *   ⭐ 이게 있었으면 _sandbox-modules.js 는 ★git add 전, 159/159 그 시점에★
 *      잡혔습니다. 도우미목록에 처음부터 등록돼 있었기 때문입니다.
 *
 * ── ⚠️ "곧 커밋될 것" 은 이미 보고 있습니다 ────────────────────────────
 *   git ls-files 는 ★색인(staged)★ 을 읽습니다. git add 하는 순간 목록에
 *   들어옵니다 — 이번에 빨강이 된 것도 그래서입니다.
 *   그러니 git diff --cached 를 더 볼 필요는 없습니다.
 *   빠져 있던 것은 반대쪽 — ★아직 git 밖인데 이미 등록된 파일★ 이었습니다.
 * ========================================================================= */
section("[6] 등록된 파일 이름 (git 추적 여부와 무관)");
{
  const NL = String.fromCharCode(10);
  let order = "";
  try {
    order = fs.readFileSync(path.join(TESTS, "_order.txt"), "utf8");
  } catch (e) {
    order = "";
  }
  const 등록된테스트 = order
    .split(NL)
    .map((l) => l.trim())
    .filter((l) => l.indexOf("tests/") === 0 && l.indexOf(".test.js") !== -1)
    .map((l) => l.slice("tests/".length));

  const 등록된도우미 = Object.keys(도우미목록);

  const 대상 = 등록된테스트.concat(등록된도우미);
  ok("등록된 파일을 읽었다 (테스트 " + 등록된테스트.length + " + 도우미 " + 등록된도우미.length + ")",
    대상.length > 0, "등록 목록을 못 읽었습니다");

  const 걸린것 = [];
  대상.forEach((이름) => {
    const 정식 = 등록된테스트.indexOf(이름) >= 0;
    const 낱말 = 임시이름판정(이름, 정식);
    if (낱말.length) 걸린것.push(이름 + " (" + 낱말.join(", ") + ")");
  });
  ok(
    "등록된 파일 이름에 임시 낱말이 없다 (" + 대상.length + "개 전부 훑음)",
    걸린것.length === 0,
    JSON.stringify(걸린것) +
      "  ← 이 파일들은 ★git 이 아직 몰라도★ 잡습니다." +
      "  도우미목록이나 _order.txt 에 적는 것 자체가 '임시 파일이 아니다' 는 선언입니다." +
      "  이름을 바꾸세요 (예외로 넣지 마세요 — 예외 목록은 반드시 자랍니다)."
  );

  /* 등록해 놓고 파일이 없는 것도 같이 잡습니다 (오타 · 이름만 바꾼 경우) */
  const 없는것 = 대상.filter((이름) => !fs.existsSync(path.join(TESTS, 이름)));
  ok(
    "등록된 파일이 전부 실제로 있다",
    없는것.length === 0,
    JSON.stringify(없는것) +
      "  ← 이름을 바꿨다면 도우미목록 · _order.txt · 부르는 곳을 같이 고쳐야 합니다."
  );
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
