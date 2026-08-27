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

const REPO = path.join(__dirname, "..");
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
