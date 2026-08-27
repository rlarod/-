/**
 * 테스트 전체 실행기 — npm test 가 부르는 파일
 * ---------------------------------------------------------------
 * 왜 만들었나 (2026-08-27)
 *
 *   그전까지 package.json 의 "test" 는
 *       node tests/a.test.js && node tests/b.test.js && ...   (93개)
 *   였습니다. && 는 앞이 실패하면 뒤를 아예 실행하지 않습니다.
 *
 *   2026-08-27 실측 — 목록 2번째인 tests/top-panel.test.js 가 1건 실패해서
 *   (디자인팀이 style.css 를 고치는 중이었습니다) npm test 가 거기서 끝났고
 *   **뒤의 91개 파일이 한 번도 실행되지 않았습니다.**
 *   같은 날 올린 종목 봉인 94건도 npm test 로는 한 번도 안 돌았습니다.
 *   게이트 2 의 "npm test 통과 확인" 이 그동안 아무것도 검증하지 못한 셈입니다.
 *
 *   같은 사고가 전에도 있었습니다 — CLAUDE.md 기록:
 *   "수정 금지 파일 12개가 전부 변경됨으로 보였고, 그게 목록 맨 앞이라
 *    나머지 42개는 실행조차 안 됐습니다."
 *
 *   그래서 **전부 돌리고 → 끝에 모아서 보여주고 → 하나라도 실패하면 종료코드 1**
 *   로 바꿨습니다.
 *
 * 왜 셸이 아니라 node 실행기인가
 *
 *   대표 PC 가 윈도우입니다. package.json 의 script 는 윈도우에서 cmd.exe 로
 *   실행되는데 ; || $? 같은 것은 셸마다 동작이 다릅니다.
 *   node 로 돌리면 어느 셸에서 부르든 똑같이 동작합니다.
 *
 * 실행 순서
 *
 *   tests/_order.txt 에 적힌 순서 그대로 돕니다.
 *   (옛 && 사슬에서 스크립트로 그대로 뽑았습니다. 손으로 다시 적지 않았습니다)
 *   목록에 없는 *.test.js 가 tests/ 에 있으면 맨 뒤에 붙여서 같이 돌립니다.
 *   목록에서 빠진 것 자체는 tests/test-registry.test.js 가 실패로 잡습니다.
 *
 * 실패 판정 두 가지
 *
 *   1) 종료코드가 0 이 아니다
 *   2) 출력의 "통과 N / 실패 M" 에서 M 이 0 보다 크다
 *
 *   2번이 왜 필요한가 — 두 겹으로 보기 위해서입니다.
 *   2026-08-27 확인 결과 **지금은 96개 파일 전부가 실패를 종료코드로 알립니다.**
 *   (처음에 "5개가 안 그렇다" 고 적었다가 다시 세어 보니 틀렸습니다.
 *    ghost-position-seal 등은 process.exit(fail === 0 ? 0 : 1) 형태라
 *    문자열 검색에 안 걸렸을 뿐 정상이었습니다. 정정합니다)
 *   앞으로 끝에서 그냥 process.exit(0) 을 부르는 파일이 생기면 그 실패는
 *   종료코드만 봐서는 영원히 묻힙니다. 그걸 막는 그물입니다.
 *
 * 시간 초과
 *
 *   jsdom 창이 타이머를 붙들면 프로세스가 안 끝납니다(파일 끝에서 process.exit(0)
 *   을 안 부른 경우). 한 파일당 180초를 넘기면 죽이고 "시간초과" 실패로 셉니다.
 *   전체가 거기서 멈춰 있는 것보다 낫습니다.
 */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const TESTS_DIR = __dirname;
const REPO = path.resolve(__dirname, "..");
const ORDER_FILE = path.join(TESTS_DIR, "_order.txt");
const 파일당제한 = 180000; // 180초

/* ── 실행 목록 만들기 ──────────────────────────────────────────────
 * _order.txt 에는 "tests/xxx.test.js" 형태로 한 줄씩 적혀 있습니다.
 * ("tests/" 를 붙여 두는 이유 — 여러 봉인 테스트가 자기 등록 여부를
 *  목록.indexOf("tests/내파일.test.js") 로 확인하기 때문입니다)
 * ─────────────────────────────────────────────────────────────── */
let 순서 = [];
if (fs.existsSync(ORDER_FILE)) {
  순서 = fs
    .readFileSync(ORDER_FILE, "utf8")
    .split("\n")
    .map(function (줄) { return 줄.trim(); })            // \r 도 여기서 떨어집니다
    .filter(function (줄) { return 줄 && 줄.charAt(0) !== "#"; })
    .map(function (줄) { return 줄.indexOf("tests/") === 0 ? 줄.slice(6) : 줄; });
}

const 디스크 = fs
  .readdirSync(TESTS_DIR)
  .filter(function (f) { return f.slice(-8) === ".test.js"; })
  .sort();

/* 목록에 있는데 파일이 없는 것 → 실패로 잡는다 (오타·삭제를 조용히 넘기지 않음) */
const 없는파일 = 순서.filter(function (f) { return !fs.existsSync(path.join(TESTS_DIR, f)); });

/* 파일은 있는데 목록에 없는 것 → 맨 뒤에 붙여서 어쨌든 돌린다.
   목록에서 빠진 사실 자체는 tests/test-registry.test.js 가 실패로 잡습니다. */
const 목록밖 = 디스크.filter(function (f) { return 순서.indexOf(f) === -1; });

const 실행목록 = 순서
  .filter(function (f) { return fs.existsSync(path.join(TESTS_DIR, f)); })
  .concat(목록밖);

console.log("==========================================================");
console.log(" 테스트 전체 실행 — 파일 " + 실행목록.length + "개");
if (목록밖.length) {
  console.log(" ⚠ _order.txt 에 없어서 맨 뒤에 붙인 파일: " + 목록밖.join(", "));
}
if (없는파일.length) {
  console.log(" ⚠ _order.txt 에 적혀 있는데 파일이 없음: " + 없는파일.join(", "));
}
console.log("==========================================================");

/* ── 한 파일씩 실행 ────────────────────────────────────────────── */
const 실패목록 = [];
let 총통과 = 0;
let 총실패 = 0;
let 파일통과 = 0;
const 시작 = Date.now();

for (let i = 0; i < 실행목록.length; i++) {
  const 파일 = 실행목록[i];
  const 번호 = String(i + 1).padStart(2, " ") + "/" + 실행목록.length;
  console.log("\n────────────────────────────────────────────────────────");
  console.log("[" + 번호 + "] tests/" + 파일);
  console.log("────────────────────────────────────────────────────────");

  const r = spawnSync(process.execPath, [path.join(TESTS_DIR, 파일)], {
    cwd: REPO,
    timeout: 파일당제한,
    maxBuffer: 64 * 1024 * 1024,
  });

  /* 출력은 버퍼 그대로 흘립니다 — 문자열로 바꿔 다시 쓰면 윈도우 콘솔에서
     한글이 깨질 수 있습니다. */
  if (r.stdout && r.stdout.length) process.stdout.write(r.stdout);
  if (r.stderr && r.stderr.length) process.stderr.write(r.stderr);

  const 본문 =
    (r.stdout ? r.stdout.toString("utf8") : "") +
    (r.stderr ? r.stderr.toString("utf8") : "");

  /* 집계 줄을 읽습니다. 파일마다 형식이 조금씩 다릅니다 —
     대부분 "통과 N / 실패 M" 이고, guest-leaderboard 처럼
     "모두 통과 (34/34)" / "실패 3건 (31/34)" 을 쓰는 것도 있습니다. */
  let 통과수 = null;
  let 실패수 = null;
  let m;

  const 표준 = /통과\s*:?\s*(\d+)\s*\/\s*(?:실패\s*:?\s*)?(\d+)/g;
  while ((m = 표준.exec(본문)) !== null) {
    통과수 = Number(m[1]);
    실패수 = Number(m[2]);
  }
  if (통과수 === null) {
    const 모두 = /모두 통과[^(]*\((\d+)\s*\/\s*(\d+)\)/g;
    while ((m = 모두.exec(본문)) !== null) {
      통과수 = Number(m[1]);
      실패수 = 0;
    }
  }
  if (통과수 === null) {
    /* "실패 3건 (31/34)" 형식.
       표준 형식이 하나도 안 잡혔을 때만 봅니다 — 본문 안내 문구에
       "실패 2건" 같은 말이 섞여 있어도 잘못 세지 않게. */
    const 건 = /실패\s*(\d+)\s*건[^(\n]*(?:\((\d+)\s*\/\s*(\d+)\))?/g;
    while ((m = 건.exec(본문)) !== null) {
      실패수 = Number(m[1]);
      if (m[2] !== undefined) 통과수 = Number(m[2]);
    }
  }

  if (통과수 !== null) 총통과 += 통과수;
  if (실패수 !== null) 총실패 += 실패수;

  let 사유 = null;
  if (r.error && r.error.code === "ETIMEDOUT") {
    사유 = "시간초과(" + 파일당제한 / 1000 + "초) — 파일 끝에서 process.exit(0) 을 부르는지 확인하세요";
  } else if (r.error) {
    사유 = "실행 실패: " + r.error.message;
  } else if (r.status !== 0) {
    사유 = "종료코드 " + r.status + (실패수 ? " (실패 " + 실패수 + "건)" : "");
  } else if (실패수 !== null && 실패수 > 0) {
    사유 = "실패 " + 실패수 + "건 (종료코드는 0 이라 옛 && 사슬에서는 안 잡히던 것)";
  } else if (통과수 === null) {
    사유 = '"통과 N / 실패 M" 줄을 못 찾음 — 중간에 죽었을 수 있습니다';
  }

  if (사유) {
    실패목록.push({ 파일: 파일, 사유: 사유 });
    console.log("  ❌ " + 파일 + " — " + 사유);
  } else {
    파일통과++;
  }
}

/* 목록에 적혀 있는데 없는 파일도 실패로 셉니다 */
없는파일.forEach(function (f) {
  실패목록.push({ 파일: f, 사유: "파일이 없습니다 (tests/_order.txt 를 고치세요)" });
});

/* ── 요약 ─────────────────────────────────────────────────────── */
const 초 = ((Date.now() - 시작) / 1000).toFixed(1);
console.log("\n\n==========================================================");
console.log(" 전체 결과");
console.log("==========================================================");
console.log(" 파일   : " + 실행목록.length + "개 실행 / " + 파일통과 + "개 통과 / " + 실패목록.length + "개 실패");
console.log(" 검사   : 통과 " + 총통과 + " / 실패 " + 총실패);
console.log(" 걸린시간: " + 초 + "초");

if (실패목록.length) {
  console.log("\n 실패한 파일 " + 실패목록.length + "개:");
  실패목록.forEach(function (f, i) {
    console.log("  " + (i + 1) + ") tests/" + f.파일);
    console.log("      " + f.사유);
  });
  console.log("\n ❌ 실패 있음");
  process.exit(1);
}

console.log("\n ✅ 전체 통과");
process.exit(0);
