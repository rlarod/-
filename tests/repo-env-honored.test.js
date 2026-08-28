/* tests/repo-env-honored.test.js
 * =========================================================================
 * REPO 환경변수 봉인 — 2026-08-28 (기록팀)
 * =========================================================================
 * 왜 이 파일이 생겼나
 * -------------------
 * 이 프로젝트의 봉인 테스트는 대부분 **파일을 글자 그대로 읽어서** 검사합니다.
 * 그래서 "이 테스트가 진짜로 잡는가" 를 확인하려면 **사본을 일부러 틀리게 고쳐서**
 * 돌려봐야 합니다(돌연변이 자체검증).
 *
 * 그런데 테스트가 저장소 위치를 이렇게 박아두면 —
 *
 *     const REPO = path.resolve(__dirname, "..");        <- 함정
 *
 * 사본을 아무리 망가뜨려도 테스트는 **진짜 저장소**를 읽습니다.
 * 돌연변이가 "통과" 로 나옵니다. 그 통과는 거짓입니다.
 *
 * 2026-08-28 실측 — 팀이 실제로 **두 번** 속았습니다.
 *   tests/supabase-client-seal.test.js:52       (고정으로 박혀 있었음)
 *   tests/chart-chip-viewport-seal.test.js:61   (고정으로 박혀 있었음)
 *
 * 같은 날 tests/ 전체를 세어 보니 **85개 파일**이 같은 함정을 갖고 있었습니다
 * (테스트 142개 중 REPO 를 존중하던 것은 50개뿐). 전부 아래 모양으로 고쳤습니다.
 *
 *     const REPO = process.env.REPO || path.resolve(__dirname, "..");   <- 올바름
 *
 * 이 파일은 **같은 함정이 다시 생기는 것**을 막습니다.
 * 새 봉인을 만들면서 REPO 를 고정으로 박으면 여기서 바로 터집니다.
 *
 * 무엇을 보나
 * -----------
 *   [1] 저장소 루트를 __dirname 으로 잡는 테스트는 전부 process.env.REPO 를 먼저 본다
 *   [2] REPO 를 거치지 않고 __dirname 으로 곧장 파일을 읽는 곳이 없다
 *   [3] REPO 선언 모양이 정해진 형태다
 *   [4] 살아있는 증명 — REPO 를 임시 폴더로 돌리면 테스트가 실제로 그쪽을 읽는다
 *       (문자열만 보면 주석에 적어놓고 통과시킬 수 있습니다. 실제로 돌려서 확인합니다)
 *   [5] 이 파일이 실행 목록에 등록돼 있다
 *
 * 주석은 걷어내고 봅니다. 이 파일 주석에도 함정 모양이 그대로 적혀 있어서
 * 문자열로만 찾으면 자기 자신에 걸려 오탐이 납니다.
 *
 * 서버도 브라우저도 부르지 않습니다. 파일만 읽고, [4] 에서만 node 를 두 번 띄웁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const TESTS = path.join(REPO, "tests");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/* 주석을 걷어낸다. 이 파일 자신의 주석에 함정 모양이 적혀 있기 때문에
   문자열로만 찾으면 자기 자신을 잡습니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* _run-all.js 는 테스트가 아니라 **실행기**입니다.
   거기서 REPO 는 자식 프로세스의 cwd 로 쓰입니다 — 사본이 아니라 진짜 저장소가 맞습니다.
   그래서 일부러 예외로 둡니다. 예외는 이 하나뿐이고, 늘어나면 아래 [1-1] 이 터집니다. */
const 예외 = ["_run-all.js"];

const 파일들 = fs.readdirSync(TESTS)
  .filter(function (f) { return f.endsWith(".test.js"); })
  .sort();

/* =========================================================================
 * [1] 저장소 루트를 잡는 테스트는 전부 process.env.REPO 를 먼저 본다
 * ========================================================================= */
절("[1] REPO 환경변수를 존중하는가");

const 루트를잡는파일 = [];
const 함정 = [];

파일들.forEach(function (f) {
  const 코드 = 주석제거(fs.readFileSync(path.join(TESTS, f), "utf8"));
  /* "__dirname 에서 한 칸 위" = 저장소 루트로 올라간다는 뜻 */
  if (!/__dirname\s*,\s*"\.\."/.test(코드)) return;   // tests/ 안만 보는 파일은 해당 없음
  루트를잡는파일.push(f);
  if (!/process\.env\.REPO/.test(코드)) 함정.push(f);
});

ok("저장소 루트를 잡는 테스트가 있다 (" + 루트를잡는파일.length + "개 / 전체 " + 파일들.length + "개)",
  루트를잡는파일.length > 0,
  "한 개도 못 찾았으면 이 검사가 아무것도 안 보고 있는 것입니다");

ok("그 파일들이 전부 process.env.REPO 를 본다" +
    (함정.length ? " (함정 " + 함정.length + "개: " + 함정.slice(0, 8).join(", ") + ")" : ""),
  함정.length === 0,
  "const REPO = process.env.REPO || path.resolve(__dirname, \"..\") 형태로 고치세요. " +
  "고정으로 박으면 돌연변이 검증이 사본이 아니라 진짜 저장소를 읽어 거짓 통과합니다");

절("[1-1] 예외 목록이 늘어나지 않았다");
const 예외중실제로있는것 = 예외.filter(function (f) { return fs.existsSync(path.join(TESTS, f)); });
ok("예외는 실행기 하나뿐이다 (지금: " + JSON.stringify(예외중실제로있는것) + ")",
  예외중실제로있는것.length === 1 && 예외중실제로있는것[0] === "_run-all.js",
  "예외를 늘리려면 왜 사본을 읽으면 안 되는지 주석에 근거를 남기세요");

/* =========================================================================
 * [2] REPO 를 거치지 않고 곧장 파일을 읽는 곳이 없다
 *     REPO 를 선언해 놓고도 __dirname 으로 직접 읽으면 그 줄만 진짜 저장소를 봅니다.
 *     (부분 함정 — 더 찾기 어렵습니다)
 * ========================================================================= */
절("[2] REPO 를 우회해서 읽는 곳이 없다");

const 우회 = [];
파일들.forEach(function (f) {
  const 코드 = 주석제거(fs.readFileSync(path.join(TESTS, f), "utf8"));
  /* __dirname, "..", <또 뭔가>  =  루트를 지나 더 깊이 들어가는 직접 읽기 */
  const m = 코드.match(/__dirname\s*,\s*"\.\."\s*,/g);
  if (m) 우회.push(f + "(" + m.length + "곳)");
});
ok("__dirname 으로 곧장 파일을 읽는 곳이 없다" +
    (우회.length ? " (" + 우회.join(", ") + ")" : ""),
  우회.length === 0,
  "path.join(REPO, \"js\", \"x.js\") 로 바꾸세요. " +
  "REPO 를 선언해 놓고도 이렇게 읽으면 그 줄만 진짜 저장소를 봅니다");

/* =========================================================================
 * [3] REPO 선언 모양이 일정하다
 * ========================================================================= */
절("[3] 선언 모양이 일정하다");

const 이상한선언 = [];
루트를잡는파일.forEach(function (f) {
  const 코드 = 주석제거(fs.readFileSync(path.join(TESTS, f), "utf8"));
  const 선언 = 코드.match(/const\s+REPO\s*=[^;]+;/);
  if (!선언) { 이상한선언.push(f + " (REPO 선언을 못 찾음)"); return; }
  const s = 선언[0].replace(/\s+/g, " ");
  const 맞는모양 =
    /^const REPO = process\.env\.REPO \|\| (path|require\("path"\))\.(join|resolve)\(__dirname, "\.\."\);$/.test(s);
  if (!맞는모양) 이상한선언.push(f + " -> " + s);
});
ok("REPO 선언이 전부 정해진 모양이다" +
    (이상한선언.length ? " (" + 이상한선언.length + "개 다름)" : ""),
  이상한선언.length === 0,
  이상한선언.slice(0, 5).join(" / ") ||
  "const REPO = process.env.REPO || path.resolve(__dirname, \"..\"); 형태로 맞추세요");

/* =========================================================================
 * [4] 살아있는 증명
 *     문자열만 보면 주석에 process.env.REPO 라고 적어놓고 통과시킬 수 있습니다.
 *     그래서 실제로 REPO 를 미끼 폴더로 돌려 놓고 테스트를 한 번 돌립니다.
 *     사본을 읽는다면 미끼가 틀렸으니 반드시 실패해야 합니다(종료코드 != 0).
 *     여기서 통과해버리면 그 테스트는 진짜 저장소를 몰래 읽고 있는 것입니다.
 * ========================================================================= */
절("[4] REPO 를 미끼 폴더로 돌려 실제로 확인한다");

const 미끼 = fs.mkdtempSync(path.join(os.tmpdir(), "tw-repo-proof-"));
try {
  fs.mkdirSync(path.join(미끼, "js"), { recursive: true });
  /* 진짜 js/comment-fix.js 와 전혀 다른 내용. 읽으면 반드시 검사가 깨집니다. */
  fs.writeFileSync(path.join(미끼, "js", "comment-fix.js"),
    "/* 미끼입니다. 이 내용을 읽었다면 REPO 를 존중한 것입니다. */\n", "utf8");

  const 대상 = path.join(TESTS, "comment-fix.test.js");
  ok("증명에 쓸 테스트가 있다 (tests/comment-fix.test.js)", fs.existsSync(대상),
    "이 파일이 사라졌으면 [4] 를 다른 파일로 바꾸세요");

  let 종료코드 = 0;
  try {
    execFileSync(process.execPath, [대상], {
      env: Object.assign({}, process.env, { REPO: 미끼 }),
      stdio: "ignore",
      timeout: 60000,
    });
  } catch (e) {
    종료코드 = typeof e.status === "number" ? e.status : -1;
  }
  ok("REPO 를 미끼로 돌리면 tests/comment-fix.test.js 가 미끼를 읽는다 (종료코드 " + 종료코드 + ")",
    종료코드 !== 0,
    "미끼를 넣었는데도 통과했다는 것은 진짜 저장소를 읽고 있다는 뜻입니다. " +
    "이 상태에서는 어떤 돌연변이 검증도 믿을 수 없습니다");

  /* 반대 방향도 봅니다 — REPO 를 안 주면 진짜 저장소를 읽어 정상 통과해야 합니다.
     한쪽만 보면 "항상 실패하는 테스트" 도 통과로 보입니다. */
  let 평소종료코드 = 0;
  try {
    const 깨끗한env = Object.assign({}, process.env);
    delete 깨끗한env.REPO;
    execFileSync(process.execPath, [대상], { env: 깨끗한env, stdio: "ignore", timeout: 60000 });
  } catch (e) {
    평소종료코드 = typeof e.status === "number" ? e.status : -1;
  }
  ok("REPO 를 안 주면 진짜 저장소를 읽어 정상 통과한다 (종료코드 " + 평소종료코드 + ")",
    평소종료코드 === 0,
    "양쪽을 다 봐야 합니다. 한쪽만 보면 '늘 실패하는 테스트' 도 통과로 보입니다");
} finally {
  try { fs.rmSync(미끼, { recursive: true, force: true }); } catch (e) { /* 무시 */ }
}

/* =========================================================================
 * [5] 이 파일이 실행 목록에 등록돼 있다
 *     만들어 놓고 _order.txt 에 안 넣으면 실행기가 맨 뒤에 붙이면서 경고만 냅니다.
 * ========================================================================= */
절("[5] 실행 목록 등록");
{
  let order = "";
  try { order = fs.readFileSync(path.join(TESTS, "_order.txt"), "utf8"); } catch (e) { order = ""; }
  ok("tests/_order.txt 에 이 파일이 적혀 있다",
    order.indexOf("repo-env-honored.test.js") !== -1,
    "적어두지 않으면 실행기가 맨 뒤에 붙이면서 경고만 냅니다");
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패한 것");
  실패목록.forEach(function (m) { console.log("  - " + m); });
}
process.exit(fail ? 1 : 0);
