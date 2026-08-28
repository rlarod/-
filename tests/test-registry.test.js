/* ===========================================================================
 * tests/test-registry.test.js — "만들었는데 아무도 안 돌리는 테스트" 를 막습니다
 *
 * 2026-08-27 추가.
 *
 * ── 무엇을 못 박나 ─────────────────────────────────────────────────────
 *
 * ① npm test 가 한 파일 실패에서 멈추지 않는다
 *
 *    그전까지 package.json 의 test 는 && 로 이은 93개짜리 한 줄이었습니다.
 *    2026-08-27 실측 — 목록 2번째인 tests/top-panel.test.js 가 1건 실패하자
 *    npm test 가 "통과 101 / 실패 1" 만 찍고 끝났고, **뒤의 91개 파일이
 *    한 번도 실행되지 않았습니다.** 그날 올린 종목 봉인 94건도 npm test 로는
 *    한 번도 안 돌았습니다. 게이트 2 의 "npm test 통과 확인" 이 그동안
 *    아무것도 검증하지 못한 상태였습니다.
 *
 *    같은 사고가 전에도 있었습니다 — CLAUDE.md 기록:
 *    "수정 금지 파일 12개가 전부 변경됨으로 보였고, 그게 목록 맨 앞이라
 *     나머지 42개는 실행조차 안 됐습니다."
 *
 * ② 목록에서 빠진 테스트 파일이 하나도 없다
 *
 *    tests/ 에 있는 *.test.js 를 전부 세서, tests/_order.txt 에 없는 게
 *    하나라도 있으면 여기서 실패합니다.
 *    각 테스트가 자기 등록을 스스로 확인하는 방식(20개 파일이 그렇게 합니다)은
 *    **자기 검사를 안 넣은 새 파일은 못 잡습니다.** 이 검사는 바깥에서 세기
 *    때문에 빠짐없이 잡습니다.
 *
 * ── 이 파일은 파일만 읽습니다 ─────────────────────────────────────────
 *    사이트 코드도 서버도 건드리지 않습니다. jsdom 도 안 씁니다.
 * ======================================================================== */

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const TESTS = __dirname;
const ORDER = path.join(TESTS, "_order.txt");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  ✓ " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function section(제목) {
  console.log("\n" + 제목);
}
const read = (p) => fs.readFileSync(p, "utf8");

/* 목록 읽기 — 실행기와 똑같은 방식으로 (주석 #, 빈 줄 제외) */
function 목록읽기(본문) {
  return 본문
    .split("\n")
    .map((줄) => 줄.trim())
    .filter((줄) => 줄 && 줄.charAt(0) !== "#");
}

/* =========================================================================
 * [1] 목록 파일이 있다
 * ===================================================================== */
section("[1] tests/_order.txt");

ok("tests/_order.txt 가 있다", fs.existsSync(ORDER),
  "이 파일이 없으면 npm test 가 무엇을 돌려야 할지 모릅니다");

const 목록 = fs.existsSync(ORDER) ? 목록읽기(read(ORDER)) : [];

ok("목록이 비어 있지 않다", 목록.length > 0);
ok('모든 줄이 "tests/" 로 시작한다', 목록.every((f) => f.indexOf("tests/") === 0),
  '봉인 테스트들이 목록.indexOf("tests/내파일.test.js") 로 자기 등록을 확인합니다');
ok("모든 줄이 .test.js 로 끝난다", 목록.every((f) => f.slice(-8) === ".test.js"));

const 중복 = 목록.filter((f, i) => 목록.indexOf(f) !== i);
ok("같은 파일이 두 번 적혀 있지 않다", 중복.length === 0, JSON.stringify(중복));

/* =========================================================================
 * [2] 목록과 실제 파일이 정확히 일치한다  ← 이 파일의 핵심
 * ===================================================================== */
section("[2] 목록 ↔ 실제 파일");

const 디스크 = fs
  .readdirSync(TESTS)
  .filter((f) => f.slice(-8) === ".test.js")
  .sort();

const 목록이름 = 목록.map((f) => f.replace("tests/", ""));

const 목록에없음 = 디스크.filter((f) => 목록이름.indexOf(f) === -1);
ok("tests/ 의 모든 테스트 파일이 목록에 있다 (" + 디스크.length + "개)",
  목록에없음.length === 0,
  "목록에 없는 파일: " + JSON.stringify(목록에없음) +
  " — tests/_order.txt 에 한 줄 추가하세요. 안 넣으면 아무도 안 돌립니다");

const 파일없음 = 목록이름.filter((f) => !fs.existsSync(path.join(TESTS, f)));
ok("목록에 적힌 파일이 전부 실제로 있다", 파일없음.length === 0,
  "없는 파일: " + JSON.stringify(파일없음) + " — 오타이거나 지워진 파일입니다");

ok("목록 개수와 실제 파일 개수가 같다 (" + 목록이름.length + " vs " + 디스크.length + ")",
  목록이름.length === 디스크.length);

/* 2026-08-27 옮길 당시 개수입니다. 새 테스트가 늘어나는 건 정상이라
   "줄어들지 않았는가" 만 봅니다. 줄었다면 누가 목록에서 뺀 것입니다. */
const 옮길당시 = 93;
ok("목록이 2026-08-27 기준(" + 옮길당시 + "개)보다 줄지 않았다 — 지금 " + 목록이름.length + "개",
  목록이름.length >= 옮길당시,
  "테스트를 목록에서 빼는 것으로 실패를 없애지 않습니다");

/* =========================================================================
 * [2-1] 목록이 가리키는 테스트 파일이 git 에도 있는가 — 2026-08-28 추가
 *
 *  지금까지 이 파일은 "디스크 ↔ 목록" 만 봤습니다. 그래서 구멍이 하나 있었습니다.
 *      tests/_order.txt 는 커밋했는데 그 줄이 가리키는 .test.js 는 커밋 안 함
 *  내 PC 에서는 파일이 디스크에 있으니 아무 검사도 안 걸리고 npm test 도 통과합니다.
 *  clone 한 PC 에서만 그 파일이 통째로 없습니다. 전형적인 조용한 고장이고,
 *  이 프로젝트는 집·회사 PC 이동이 실제로 있습니다.
 *  2026-08-27 밤 하루에 세 번 났고(문서→sql, index.html→js), 2026-08-28 밤에는
 *  이것 때문에 커밋을 두 번 쪼갰습니다.
 *
 *  ⚠ fs.existsSync 로는 절대 못 잡습니다. git 에게 물어야 합니다.
 *
 *  어떻게 "아직 커밋 안 한 새 테스트" 와 구별하나
 *    새 테스트를 막 만들었을 때는 목록도 파일도 둘 다 아직 git 밖입니다.
 *    그건 정상입니다(본부장이 곧 같이 올립니다). 잘못된 상태는 이것 하나뿐입니다 —
 *        "git 안의 목록" 은 그 파일을 가리키는데  "git 안의 파일" 은 없다
 *    그래서 디스크의 _order.txt 가 아니라 **git 색인(index)에 들어 있는**
 *    _order.txt 를 읽어서 비교합니다. git add 를 반쪽만 해도 그 자리에서 걸립니다.
 * ===================================================================== */
section("[2-1] 목록 ↔ git 추적");

const NUL = String.fromCharCode(0);
const 줄바꿈 = String.fromCharCode(10);

function git(인자들) {
  try {
    return require("child_process")
      .execFileSync("git", 인자들, { cwd: REPO, maxBuffer: 8 * 1024 * 1024 })
      .toString();
  } catch (e) {
    return null;
  }
}

/* ⚠ 한글 파일 이름 때문에 git 이 따옴표로 감싸 내놓는 일이 있습니다.
   -z 를 쓰면 그런 가공 없이 NUL 로 끊어 줍니다. 여기 tests/ 는 한글 이름이
   없지만 습관으로 항상 -z 를 씁니다(docs-sql-tracked 에서 실제로 걸렸습니다). */
const 추적본문 = git(["ls-files", "-z", "--", "tests"]);
ok("git ls-files 가 응답한다 (여기서 실패하면 아래를 판단할 수 없습니다)",
  추적본문 !== null,
  "git 을 못 불렀습니다 — 이 저장소가 git 저장소가 맞는지 확인하세요");

const 추적목록 = (추적본문 || "").split(NUL).filter((s) => s);
const 추적집합 = Object.create(null);
추적목록.forEach((f) => { 추적집합[f.replace(/^tests[/]/, "")] = true; });

ok("tests/_order.txt 자체가 git 에 추적된다", !!추적집합["_order.txt"],
  "목록이 git 에 없으면 clone 한 PC 는 아무 테스트도 안 돌립니다");
ok("tests/_run-all.js 가 git 에 추적된다", !!추적집합["_run-all.js"],
  "실행기가 git 에 없으면 clone 한 PC 에서 npm test 자체가 안 됩니다");

/* git 색인에 들어 있는 _order.txt — 디스크 것이 아니라 "올라갈 것" 입니다.
   (git add 를 아직 안 했으면 색인 = HEAD 라, 새로 만든 테스트는 여기 안 들어옵니다) */
const 색인목록본문 = git(["show", ":tests/_order.txt"]) || git(["show", "HEAD:tests/_order.txt"]);
ok("git 색인에서 tests/_order.txt 를 읽었다", 색인목록본문 !== null,
  "아직 한 번도 커밋되지 않은 목록입니다");

const 색인목록 = (색인목록본문 || "")
  .split(줄바꿈)
  .map((줄) => 줄.trim())
  .filter((줄) => 줄 && 줄.charAt(0) !== "#")
  .map((f) => f.replace("tests/", ""));

/* 판정 함수 — 아래 [6] 에서 이 함수가 진짜 잡는지 다시 시험합니다 */
function 추적안됨찾기(목록이름들, 추적됨) {
  return 목록이름들.filter((f) => !추적됨[f]);
}

const git에없음 = 추적안됨찾기(색인목록, 추적집합);
ok("git 에 올라갈 목록이 가리키는 테스트 파일이 전부 git 에도 있다 (" + 색인목록.length + "개)",
  git에없음.length === 0,
  "목록에는 있는데 git 에 없는 파일: " + JSON.stringify(git에없음) +
  " — git add 를 반쪽만 했습니다. 이대로 올리면 clone 한 PC 에서 그 테스트가 통째로 사라집니다");

/* 실패는 아닙니다 — 아직 git 밖인 새 테스트 이름을 본부장이 볼 수 있게 적어둡니다.
   (본부장이 커밋할 때 이 이름들을 _order.txt 와 "같이" 적어야 합니다) */
const 아직git밖 = 디스크.filter((f) => !추적집합[f]);
if (아직git밖.length) {
  console.log("    (참고) 아직 git 에 없는 테스트 파일 " + 아직git밖.length + "개 — " +
    "커밋할 때 tests/_order.txt 와 함께 올리세요: " + 아직git밖.join(" / "));
}

/* =========================================================================
 * [3] package.json 이 전체 실행기를 부른다
 * ===================================================================== */
section("[3] package.json");

const pkg = JSON.parse(read(path.join(REPO, "package.json")));
const testScript = String((pkg.scripts || {}).test || "");

ok("npm test 가 tests/_run-all.js 를 부른다", /tests[/\\]_run-all\.js/.test(testScript),
  "지금 값: " + JSON.stringify(testScript));
ok("npm test 가 && 로 파일을 잇지 않는다", testScript.indexOf("&&") === -1,
  "&& 는 앞이 실패하면 뒤를 아예 실행하지 않습니다. 2026-08-27 에 이것 때문에 91개가 안 돌았습니다");
ok("npm test 가 || 나 ; 로 실패를 삼키지 않는다",
  testScript.indexOf("||") === -1 && testScript.indexOf(";") === -1,
  "셸마다 동작이 달라 윈도우에서 종료코드가 뒤집힐 수 있습니다");
ok("되돌리기용 dev:serve 가 그대로 있다", typeof (pkg.scripts || {})["dev:serve"] === "string");

/* =========================================================================
 * [4] 실행기가 갖춰야 할 성질
 * ===================================================================== */
section("[4] tests/_run-all.js");

const RUNNER = path.join(TESTS, "_run-all.js");
ok("tests/_run-all.js 가 있다", fs.existsSync(RUNNER));

const 실행기 = fs.existsSync(RUNNER) ? read(RUNNER) : "";

ok("한 파일이 실패해도 반복문이 계속 돈다 (중간 return/break 없음)",
  /for\s*\(/.test(실행기) && !/실패목록\.push[\s\S]{0,120}\bbreak\b/.test(실행기),
  "실패한 자리에서 멈추면 옛 && 사슬과 똑같아집니다");
ok("실패한 파일을 모아 끝에 목록으로 보여준다",
  /실패목록/.test(실행기) && /실패한 파일/.test(실행기));
ok("하나라도 실패하면 종료코드 1 로 끝난다",
  /실패목록\.length[\s\S]{0,600}process\.exit\(1\)/.test(실행기),
  "종료코드가 0 이면 게이트 2 가 실패를 못 봅니다");
ok("전부 통과하면 종료코드 0 으로 끝난다", /process\.exit\(0\)/.test(실행기));
ok("종료코드가 0 이어도 '실패 N' 이 있으면 실패로 센다",
  /실패수\s*!==\s*null\s*&&\s*실패수\s*>\s*0/.test(실행기),
  "두 겹으로 봅니다. 끝에서 그냥 process.exit(0) 을 부르는 파일이 생기면 " +
  "종료코드만으로는 그 실패가 영원히 묻힙니다");
ok("파일당 시간제한이 있다 (안 끝나는 테스트에 전체가 붙잡히지 않게)",
  /timeout\s*:/.test(실행기) && /파일당제한/.test(실행기));
ok("목록에 없는 파일도 일단 돌린다 (조용히 건너뛰지 않는다)",
  /목록밖/.test(실행기));
ok("셸을 거치지 않고 node 를 직접 부른다 (윈도우에서 셸 차이를 안 탄다)",
  /spawnSync\(\s*process\.execPath/.test(실행기),
  "shell:true 를 쓰면 cmd.exe / PowerShell / bash 가 다르게 동작합니다");
ok("shell 옵션을 켜지 않았다", !/shell\s*:\s*true/.test(실행기));

/* =========================================================================
 * [5] 모든 테스트 파일이 실행기가 읽을 수 있게 끝난다
 *
 *     jsdom 창이 타이머를 붙들면 프로세스가 안 끝납니다.
 *     파일 끝의 process.exit() 가 그것을 끊습니다.
 * ===================================================================== */
section("[5] 각 테스트 파일의 마무리");

const exit없음 = 디스크.filter((f) => read(path.join(TESTS, f)).indexOf("process.exit(") === -1);
ok("모든 테스트 파일이 process.exit() 을 부른다", exit없음.length === 0,
  "안 부르는 파일: " + JSON.stringify(exit없음) +
  " — jsdom 이 타이머를 붙들면 프로세스가 안 끝나고 전체가 거기서 멈춥니다");

/* 실패를 종료코드로 알리는가.
   2026-08-27 확인 — 96개 전부 그렇습니다. 앞으로 끝에서 그냥 exit(0) 을
   부르는 파일이 생기면 그 실패가 조용히 묻히므로 여기서 막습니다. */
const 종료코드안알림 = 디스크.filter((f) => {
  const s = read(path.join(TESTS, f));
  return !(
    /process\.exit\(1\)/.test(s) ||
    /process\.exit\(fail/.test(s) ||
    /process\.exit\([^)]*\?[^)]*1\)/.test(s)
  );
});
ok("모든 테스트 파일이 실패를 종료코드로 알린다", 종료코드안알림.length === 0,
  "실패해도 0 으로 끝날 수 있는 파일: " + JSON.stringify(종료코드안알림));

/* =========================================================================
 * [6] 돌연변이 자체검증 — 이 검사가 정말 잡아내는가
 *
 *     [2] 의 판정 로직을 그대로 가져와, 일부러 빠뜨린 목록을 먹였을 때
 *     "빠졌다" 고 나오는지 봅니다. 안 나오면 [2] 는 아무것도 안 지키는 것입니다.
 * ===================================================================== */
section("[6] 돌연변이 자체검증");

function 빠진것찾기(목록본문, 실제파일들) {
  const 이름 = 목록읽기(목록본문).map((f) => f.replace("tests/", ""));
  return 실제파일들.filter((f) => 이름.indexOf(f) === -1);
}

const 정상본문 = "# 주석\ntests/a.test.js\ntests/b.test.js\n";
ok("정상 목록에서는 빠진 것이 없다고 나온다",
  빠진것찾기(정상본문, ["a.test.js", "b.test.js"]).length === 0);

const 망가진본문 = "# 주석\ntests/a.test.js\n";
const 잡힘 = 빠진것찾기(망가진본문, ["a.test.js", "b.test.js"]);
ok("목록에서 한 줄을 빼면 그 파일을 잡아낸다",
  잡힘.length === 1 && 잡힘[0] === "b.test.js",
  "여기서 못 잡으면 [2] 는 가짜입니다");

ok("주석 줄을 파일로 착각하지 않는다",
  목록읽기("# tests/없는파일.test.js\ntests/a.test.js\n").length === 1);


/* [2-1] 의 판정 함수도 같이 시험합니다 — 이게 가짜면 반쪽 커밋을 못 잡습니다 */
ok("(git 추적) 목록에 있는데 git 에 없는 파일을 잡아낸다",
  (function () {
    const 잡힌것 = 추적안됨찾기(["a.test.js", "b.test.js"], { "a.test.js": true });
    return 잡힌것.length === 1 && 잡힌것[0] === "b.test.js";
  })(),
  "여기서 못 잡으면 [2-1] 은 아무것도 안 지킵니다");
ok("(git 추적) 전부 git 에 있으면 잡지 않는다",
  추적안됨찾기(["a.test.js"], { "a.test.js": true, "b.test.js": true }).length === 0);

/* =========================================================================
 * 마무리
 * ===================================================================== */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
