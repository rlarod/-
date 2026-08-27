/* ===========================================================================
 * tests/signup-insert-guard.test.js
 *   "가입하는 순간" 방어 SQL 이 조용히 사라지는 것을 막습니다
 * ===========================================================================
 * 2026-08-28 — 수리팀 작성 / 본부장 배정 (승인대기 8번)
 *
 * ── 무엇을 지키나 ──────────────────────────────────────────────────────
 *
 *   js/auth.js:317 은 가입할 때 브라우저가 trading_accounts 줄을 직접
 *   만듭니다. supabase/schema.sql:50 의 규칙은 "본인 것이 맞나" 만 보고
 *   **무슨 값을 넣는지는 안 봅니다.**
 *
 *   계급 자산 = 지갑 + 증거금 − recharge_total   (schema-rank-1000.sql:255)
 *
 *   recharge_total 은 **빼는 칸**이라 음수를 실어 가입하면 계급이 부풀어
 *   오릅니다. -1,000,000 이면 자산 100,000 → 1,100,000, 점수 0 → 약 3,459.
 *
 *   supabase/fix-signup-insert-guard.sql 이 force_starting_balance() 본문을
 *   늘려 네 칸을 기본값으로 고정합니다.
 *
 * ── 왜 테스트가 필요한가 ───────────────────────────────────────────────
 *
 *   ① 같은 함수가 두 파일에 있습니다.
 *      supabase/schema-initial-balance.sql:41  ← 옛 2줄짜리 정의
 *      supabase/fix-signup-insert-guard.sql    ← 정본 (네 칸이 더 있음)
 *      옛 파일을 나중에 Run 하면 방어가 **조용히 사라집니다.**
 *      그래서 "정본이 어디인지" 를 옛 파일에도 적어 두게 못 박습니다.
 *
 *   ② 문서가 가리키는 .sql 이 git 에 없으면 다른 PC 에서 빈 링크가 됩니다.
 *      (2026-08-27 밤에 하루 세 번 났던 일입니다)
 *      fs.existsSync 로는 못 잡아서 `git ls-files -z` 로 봅니다.
 *      한글 파일명 때문에 -z 가 필수입니다 (기본값은 8진수로 escape 됩니다).
 *
 *   ③ 읽기 전용이라고 적어 놓은 조회 파일이 나중에 쓰기로 바뀌면 안 됩니다.
 *      대표님이 "아무것도 안 바뀝니다" 를 믿고 Run 하십니다.
 *
 *   ④ 잠금함수를 INSERT 트리거로 다는 방식은 터집니다 (OLD 가 없음 /
 *      SQLSTATE 55000). 실수로 그렇게 바뀌면 **가입 자체가 안 됩니다.**
 *
 * ── 이 파일은 파일만 읽습니다 ─────────────────────────────────────────
 *    사이트 코드도 서버도 건드리지 않습니다. jsdom 도 안 씁니다.
 *    SQL 을 실행하지 않습니다 (여기에는 서버가 없습니다).
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const REPO = path.resolve(__dirname, "..");

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
    console.log("  ✗ " + 제목 + (도움말 ? " → " + 도움말 : ""));
  }
}
function 절(제목) {
  console.log("\n" + 제목);
}

const 읽기 = (rel) => {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch (e) {
    return null;
  }
};
const NFC = (s) => (s && s.normalize ? s.normalize("NFC") : s);

const 방어파일 = "supabase/fix-signup-insert-guard.sql";
const 조회파일 = "supabase/check-signup-insert-abuse.sql";
const 옛정의파일 = "supabase/schema-initial-balance.sql";
const 안내서 = "supabase/README-대표님-먼저-읽으세요.md";

const 방어 = 읽기(방어파일);
const 조회 = 읽기(조회파일);
const 옛정의 = 읽기(옛정의파일);
const 안내 = 읽기(안내서);

/* 주석(-- 로 시작하는 줄)을 걷어낸 '실제로 도는 SQL' 만 남깁니다.
 * 설명 주석에 'delete' 같은 단어가 들어 있어서 오탐이 납니다. */
function 코드만(sql) {
  if (!sql) return "";
  return sql
    .split(/\r?\n/)
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

console.log("=== 가입 INSERT 방어 SQL 봉인 ===");

/* -------------------------------------------------------------------------
 * [1] 파일이 있고 git 에 추적되는가
 * ------------------------------------------------------------------------- */
절("[1] 파일 존재 + git 추적");

ok("방어 파일이 있다: " + 방어파일, 방어 !== null);
ok("조회 파일이 있다: " + 조회파일, 조회 !== null);

let 추적목록 = null;
try {
  const out = cp.execSync("git ls-files -z", { cwd: REPO, maxBuffer: 32 * 1024 * 1024 });
  추적목록 = new Set(
    out
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((s) => NFC(s))
  );
} catch (e) {
  추적목록 = null;
}

if (추적목록 === null) {
  console.log("  · git 없음 — 추적 검사를 건너뜁니다 (테스트를 죽이지 않습니다)");
} else {
  ok("git ls-files -z 가 escape 없이 읽혔다 (한글 파일명 확인)",
    ![...추적목록].some((f) => f.includes("\\3")),
    "8진수 escape 가 섞였습니다. -z 를 쓰고 있는지 확인하세요");
  ok("방어 파일이 git 에 추적된다", 추적목록.has(NFC(방어파일)),
    "git add " + 방어파일 + " 이 안 됐습니다. 다른 PC 에서 빈 링크가 됩니다");
  ok("조회 파일이 git 에 추적된다", 추적목록.has(NFC(조회파일)),
    "git add " + 조회파일 + " 이 안 됐습니다");
}

/* -------------------------------------------------------------------------
 * [2] 방어 파일이 실제로 네 칸을 고정하는가
 * ------------------------------------------------------------------------- */
절("[2] 방어 내용 — 무엇을 고정하나");

const 방어코드 = 코드만(방어);

ok("force_starting_balance() 를 다시 만든다",
  /create\s+or\s+replace\s+function\s+public\.force_starting_balance\s*\(\s*\)/i.test(방어코드));

/* ★가장 중요한 검사★
 * supabase/지갑초기화-해결.sql 이 고친 사고를 되살리지 않게 못 박습니다.
 * js/supabase-sync.js:50 은 잔고를 upsert 로 저장합니다.
 * upsert = INSERT ... ON CONFLICT 라서 PostgreSQL 이 충돌을 보기 '전에'
 * BEFORE INSERT 트리거를 먼저 돌립니다. 그래서 '이미 있으면 통과' 가 빠지면
 * 새로고침할 때마다 지갑이 100,000 으로 되돌아갑니다.
 * (실제 증상: 실현손익 -1,827,783 인데 잔고는 100,000 그대로) */
ok("upsert 갱신이면 손대지 않고 통과한다 (지갑 되돌림 방지)",
  /if\s+exists\s*\(\s*select\s+1\s+from\s+public\.trading_accounts[\s\S]{0,120}new\.user_id\s*\)[\s\S]{0,80}return\s+new;/i.test(방어코드),
  "이 줄이 빠지면 새로고침마다 지갑이 시작값으로 되돌아갑니다 (지갑초기화-해결.sql 참조)");

ok("그 통과 검사가 값을 덮는 줄보다 ★앞★ 에 있다",
  방어코드.indexOf("return new;") < 방어코드.indexOf("new.initial_balance"),
  "뒤에 있으면 이미 덮은 뒤라 아무 소용이 없습니다");

// 기존에 있던 두 줄이 사라지지 않았는지
ok("기존: initial_balance 를 기준값으로 덮는다",
  /new\.initial_balance\s*:=\s*public\.starting_balance\(\)/i.test(방어코드),
  "이걸 빼면 신규 회원 기준자본이 10,000 으로 돌아가 수익률이 1/10 로 표시됩니다");
ok("기존: balance 를 기준값으로 덮는다",
  /new\.balance\s*:=\s*public\.starting_balance\(\)/i.test(방어코드));

// 이번에 추가한 네 칸
const 고정할칸 = [
  ["recharge_total", /new\.recharge_total\s*:=\s*0\b/i,
    "음수를 실어 가입하면 계급 자산이 그만큼 부풀어 오릅니다"],
  ["recharge_count", /new\.recharge_count\s*:=\s*0\b/i,
    "음수를 실으면 무료 충전 하루 한도가 풀립니다"],
  ["last_recharge_at", /new\.last_recharge_at\s*:=\s*null\b/i,
    "충전 시각을 실으면 하루 한도 계산이 흔들립니다"],
  ["cycle_no", /new\.cycle_no\s*:=\s*1\b/i,
    "사이클 번호가 어긋나면 랭킹이 그 사람 거래를 한 건도 못 셉니다"],
];
for (const [칸, 정규식, 왜] of 고정할칸) {
  ok("가입 때 " + 칸 + " 을 기본값으로 고정한다", 정규식.test(방어코드), 왜);
}

ok("BEFORE INSERT 트리거로 건다",
  /before\s+insert\s+on\s+public\.trading_accounts/i.test(방어코드));

ok("트리거를 '없을 때만' 단다 (중복으로 안 단다)",
  /if\s+not\s+found\s+then/i.test(방어코드) &&
  !/drop\s+trigger\s+if\s+exists\s+trg_force_starting_balance/i.test(방어코드),
  "drop + create 로 바뀌면 기존 트리거를 떼었다 다시 답니다. 순간적으로 무방비가 됩니다");

/* -------------------------------------------------------------------------
 * [3] 하면 안 되는 것
 * ------------------------------------------------------------------------- */
절("[3] 하면 안 되는 것");

ok("잠금함수를 INSERT 트리거로 달지 않는다",
  !/before\s+insert[\s\S]{0,200}lock_server_owned_account_fields/i.test(방어코드),
  "INSERT 에는 OLD 가 없어 SQLSTATE 55000 으로 터집니다. 가입 자체가 안 됩니다");

ok("회원 데이터를 지우거나 바꾸는 문장이 없다",
  !/\b(delete\s+from|truncate|drop\s+table|update\s+public\.\w+\s+set)/i.test(방어코드),
  "이 파일은 '앞으로 들어올 것' 만 막습니다. 기존 회원 줄을 건드리면 안 됩니다");

ok("수정 금지 파일을 고치라고 시키지 않는다",
  !/js\/(auth|trading|supabase-sync)\.js\s*(를|을)?\s*(고|수정)/.test(방어),
  "js/auth.js 는 수정 금지입니다. 서버에서만 막습니다");

ok("순서가 틀리면 ⚠ 로 멈추는 확인이 맨 앞에 있다",
  /raise\s+exception\s+'⚠/.test(방어코드) &&
  방어코드.indexOf("raise exception") < 방어코드.indexOf("create or replace function"),
  "칸이 없는 서버에서 함수만 바꾸면 그 뒤 '가입할 때마다' 터집니다");

ok("되돌리는 방법이 적혀 있다",
  /\[되돌리기\]/.test(방어),
  "되돌리는 방법이 없으면 게이트 2 에서 반려됩니다");

/* -------------------------------------------------------------------------
 * [4] 조회 파일은 읽기만 해야 한다
 * ------------------------------------------------------------------------- */
절("[4] 조회 파일은 읽기 전용");

const 조회코드 = 코드만(조회);

ok("읽기 전용이라고 파일 앞에 적혀 있다",
  /읽기만\s*합니다/.test(조회 || ""),
  "대표님이 '아무것도 안 바뀝니다' 를 믿고 Run 하십니다");

const 쓰기문장 = [
  ["insert into", /\binsert\s+into\b/i],
  ["update ... set", /\bupdate\s+\w[\w.]*\s+set\b/i],
  ["delete from", /\bdelete\s+from\b/i],
  ["truncate", /\btruncate\b/i],
  ["drop", /\bdrop\s+(table|function|trigger|view|policy)\b/i],
  ["create", /\bcreate\s+(or\s+replace\s+)?(table|function|trigger|view|policy|index)\b/i],
  ["alter", /\balter\s+(table|function)\b/i],
  ["grant/revoke", /\b(grant|revoke)\b/i],
];
for (const [이름, 정규식] of 쓰기문장) {
  ok("조회 파일에 " + 이름 + " 이 없다", !정규식.test(조회코드),
    "읽기 전용이라고 안내해 놓고 서버를 바꾸면 안 됩니다");
}

ok("조회 파일이 recharge_total 음수를 센다",
  /recharge_total[^\n]*<\s*0/.test(조회코드),
  "정상 경로에서는 이 값이 절대 줄지 않습니다. 음수면 침입 흔적입니다");
ok("조회 파일이 cycle_no 이상값을 센다", /cycle_no[^\n]*<\s*1/.test(조회코드));

/* -------------------------------------------------------------------------
 * [5] 같은 함수가 두 파일에 있다 — 어느 쪽이 정본인지 적혀 있는가
 * ------------------------------------------------------------------------- */
절("[5] 함수 중복 — 정본 표시");

ok("옛 정의 파일에도 force_starting_balance() 가 있다 (중복 확인)",
  /create\s+or\s+replace\s+function\s+public\.force_starting_balance/i.test(옛정의 || ""),
  "구조가 바뀌었으면 이 테스트를 같이 고쳐 주세요");

ok("옛 정의 파일이 정본 위치를 가리킨다",
  (옛정의 || "").includes("fix-signup-insert-guard.sql"),
  "이 표시가 없으면 옛 파일을 나중에 Run 했을 때 방어가 조용히 사라집니다");

/* 세 번째 벌 — 2026-08-28 에 발견했습니다. 조사 보고에는 두 벌로 적혀 있었습니다. */
const 세번째 = 읽기("supabase/지갑초기화-해결.sql");
ok("세 번째 정의 파일에도 force_starting_balance() 가 있다 (중복 3벌 확인)",
  /create\s+or\s+replace\s+function\s+public\.force_starting_balance/i.test(세번째 || ""),
  "구조가 바뀌었으면 이 테스트를 같이 고쳐 주세요");
ok("세 번째 정의 파일도 정본 위치를 가리킨다",
  (세번째 || "").includes("fix-signup-insert-guard.sql"),
  "supabase/지갑초기화-해결.sql 에 '정본은 여기가 아니다' 표시가 없습니다");

ok("방어 파일이 '내가 정본' 이라고 밝힌다",
  /정본은\s*이\s*파일|이\s*함수의\s*정본/.test(방어 || ""));

/* -------------------------------------------------------------------------
 * [6] 대표님 안내서에 등록됐는가
 * ------------------------------------------------------------------------- */
절("[6] 안내서 등록");

ok("안내서가 있다", 안내 !== null);
ok("안내서가 방어 파일을 가리킨다", (안내 || "").includes("fix-signup-insert-guard.sql"),
  "supabase/README-대표님-먼저-읽으세요.md 에 번호를 붙여 등록해야 합니다");
ok("안내서가 조회 파일을 가리킨다", (안내 || "").includes("check-signup-insert-abuse.sql"));
ok("안내서에 '3-4' 번호가 있다", /\*\*3-4\*\*/.test(안내 || ""),
  "번호 없이 적으면 대표님이 어느 순서로 돌릴지 알 수 없습니다");

/* -------------------------------------------------------------------------
 * [7] 자체검증 — 탐지기가 진짜 잡는가
 * ------------------------------------------------------------------------- */
절("[7] 자체검증 (탐지기가 고장나면 여기서 걸립니다)");

ok("코드만() 이 주석 속 delete 를 걸러낸다",
  !/\bdelete\s+from\b/i.test(코드만("-- delete from members\nselect 1;")),
  "주석 제거가 안 되면 위 [4] 가 전부 오탐입니다");
ok("코드만() 이 진짜 delete 는 남긴다",
  /\bdelete\s+from\b/i.test(코드만("delete from members where id = 1;")),
  "주석 제거가 너무 세면 위 [4] 가 아무것도 못 잡습니다");

/* -------------------------------------------------------------------------
 * [8] 이 테스트가 npm test 목록에 등록돼 있는가
 * ------------------------------------------------------------------------- */
절("[8] 실행 목록 등록");

const 목록 = 읽기("tests/_order.txt");
ok("tests/_order.txt 에 등록됐다",
  (목록 || "").includes("tests/signup-insert-guard.test.js"),
  "등록 안 하면 npm test 뒤에 붙어 돌긴 하지만 순서가 보장되지 않습니다");

/* ------------------------------------------------------------------------- */
console.log("\n---------------------------------------------");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail === 0 ? 0 : 1);
