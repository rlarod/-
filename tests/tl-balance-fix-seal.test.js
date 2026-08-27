/* tests/tl-balance-fix-seal.test.js
 * ① supabase/schema-tl-balance-fix.sql 의 tl_balance_info() 봉인을 지킵니다.
 * ② supabase/README-대표님-먼저-읽으세요.md 안내가 거짓말이 되지 않게 지킵니다.
 *
 * 무슨 일이 있었나 — 실행 순서에 기대는 설계
 *   schema-tl-balance-fix.sql 과 schema-tl-realtime.sql 이 둘 다 같은
 *   tl_balance_info() 를 만듭니다. 순서에 따라 결과가 달라집니다.
 *
 *     realtime 먼저 → balance-fix 나중  ❌ 'granted' 가 "양수 전부 합계" 로 되돌아감
 *     balance-fix 먼저 → realtime 나중  ✅ 정상
 *
 *   되돌아가면 마이페이지에 "획득 1,000 · 지급 1,000" 처럼 같은 숫자가 두 번
 *   보입니다. 오류도 안 나고 화면도 멀쩡합니다 — 조용한 고장입니다.
 *   supabase/ 에 파일이 45개가 넘습니다. "순서를 지켜라" 는 언젠가 깨집니다.
 *   그래서 순서와 무관하게 안전하도록 옛 정의를 주석으로 막았습니다.
 *
 * 왜 파일을 지우지 않았나
 *   왜 이렇게 고쳤는지가 적혀 있는 기록입니다.
 *   맨 아래 "확인" select 는 읽기 전용이라 그대로 살려 뒀습니다.
 *
 * 이 검사가 지키는 것
 *   ① 파일이 지워지지 않았다
 *   ② tl_balance_info() 와 그 grant 가 실행되지 않는다 (전부 주석)
 *   ③ 옛 'granted' 계산이 실행되는 자리에 없다
 *   ④ 원문이 주석으로 보존돼 있다 (통째로 날린 게 아니다)
 *   ⑤ 읽기 전용 "확인" select 는 살아 있고, 바꾸는 문장은 하나도 없다
 *   ⑥ 맨 위에 "대체됐다 / 정본으로 가라" 경고가 있다
 *   ⑦ 정본(schema-tl-realtime.sql)이 실제로 tl_balance_info() 를 다시 만든다
 *   ⑧ 대표님 안내 파일이 있고, 실행 순서 3개가 올바른 순서로 적혀 있다
 *   ⑨ 안내 파일이 가리키는 파일 경로가 전부 실제로 존재한다
 *   ⑩ 봉인이 풀리면 정말 잡아낸다 (돌연변이)
 *
 * 옆 봉인들과 겹치지 않습니다 —
 *   schema-tl-hotdeal.sql 의 세 함수  → tests/tl-hotdeal-seal.test.js
 *   schema-tl-monthly.sql 전체        → tests/tl-monthly.test.js
 *   cleanup-test-data.sql 전원삭제    → tests/sql-mass-delete-guard.test.js
 *   실시간 지급 동작 자체             → tests/tl-realtime.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

const SQL = path.join(REPO, "supabase", "schema-tl-balance-fix.sql");
const 정본경로 = path.join(REPO, "supabase", "schema-tl-realtime.sql");
const 안내경로 = path.join(REPO, "supabase", "README-대표님-먼저-읽으세요.md");

/* 주석을 지운 "실제로 실행되는 본문" */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}
/* "-- " 만 떼어 봉인된 원문을 되살립니다(기록 확인용) */
function unseal(s) {
  return s.split("\n").map((l) => (l === "--" ? "" : l.replace(/^-- /, ""))).join("\n");
}

/* tl_balance_info 가 정말 실행되지 않는가 */
function 봉인됐나(rawText) {
  const live = strip(rawText);
  return !/create\s+or\s+replace\s+function\s+public\.tl_balance_info/.test(live)
      && !/grant\s+execute\s+on\s+function\s+public\.tl_balance_info/.test(live);
}

/* 읽기 전용 확인 select 가 그대로 살아 있는가 —
   실수로 파일 전체를 봉인하면 여기서 걸립니다. */
const 살려둔것 = [
  ["확인 select", /select\s/],
  ["구매판정 잔액 열", /as 구매판정_잔액/],
  ["화면표시 잔액 열", /as 화면표시_잔액/],
  ["일치 여부 열", /as 일치/],
];
function 확인살아있나(rawText) {
  const live = strip(rawText);
  return 살려둔것.every(([, re]) => re.test(live));
}

console.log("\ntl_balance_info() 봉인 + 대표님 안내 파일 확인");

/* =====================================================================
 * ① 파일이 남아 있다
 * ===================================================================== */
console.log("\n① 지우지 않았다(기록으로 남긴다)");
ok("supabase/schema-tl-balance-fix.sql 이 있다", fs.existsSync(SQL));
const raw = fs.existsSync(SQL) ? fs.readFileSync(SQL, "utf8") : "";
ok("내용이 비어 있지 않다", raw.length > 2000, String(raw.length));

const live = strip(raw);
const 원문 = unseal(raw);

/* =====================================================================
 * ② tl_balance_info() 가 실행되지 않는다
 * ===================================================================== */
console.log("\n② tl_balance_info() 가 실행되지 않는다");
ok("tl_balance_info() 를 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.tl_balance_info/.test(live));
ok("어떤 함수도 만들지 않는다",
   !/create\s+or\s+replace\s+function/i.test(live));
/* 정본이 이미 권한을 주므로 여기서 다시 줄 이유가 없습니다.
   함수 정의만 막고 grant 를 살려 두면 "이 파일은 뭔가 한다" 는 오해를 남깁니다. */
ok("tl_balance_info 의 grant 도 같이 막았다",
   !/grant\s+execute\s+on\s+function\s+public\.tl_balance_info/.test(live));
ok("grant 문장이 아예 없다", !/\bgrant\b/i.test(live));
ok("봉인 판정 함수도 통과", 봉인됐나(raw));

/* =====================================================================
 * ③ 옛 'granted' 계산이 실행되는 자리에 없다
 * ===================================================================== */
console.log("\n③ 옛 'granted' 계산이 실행되는 자리에 없다");
ok("'양수 전부 합계' 로 granted 를 구하지 않는다",
   !/granted\s*:=\s*coalesce/.test(live));
ok("json_build_object 를 만들지 않는다", !/json_build_object/.test(live));
ok("plpgsql 본문($$)이 실행되지 않는다", !/\$\$/.test(live));

/* =====================================================================
 * ④ 원문이 주석으로 보존돼 있다
 * ===================================================================== */
console.log("\n④ 원문을 통째로 날린 게 아니다(기록 보존)");
ok("tl_balance_info() 원문이 주석으로 남아 있다",
   /create or replace function public\.tl_balance_info\(\)/.test(원문));
ok("옛 granted 계산(양수 전부 합계)이 기록에 남아 있다",
   /granted := coalesce\(\(select sum\(amount\) from public\.tl_transactions x/.test(원문));
ok("grant 원문도 남아 있다",
   /grant execute on function public\.tl_balance_info to authenticated;/.test(원문));
ok("왜 이렇게 고쳤는지 설명이 그대로 남아 있다",
   /tl_balance_info\(\) 가 tl_balance\(\) 를 그대로 쓰게 합니다/.test(raw));
{
  /* 봉인 구간의 줄 수 — 원문(39줄)이 통째로 잘려나가지 않았는지 봅니다. */
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const s = lines.findIndex((l) => l.indexOf("봉인 시작 — 여기부터") !== -1) + 2;
  const e = lines.findIndex((l) => l.indexOf("⛔ [봉인 끝]") !== -1) - 1;
  const 봉인줄수 = s > 1 && e > s ? e - s : 0;
  ok("봉인 구간이 35줄 이상 보존돼 있다", 봉인줄수 >= 35, String(봉인줄수));
  ok("봉인 구간이 전부 주석이다",
     s > 1 && e > s && lines.slice(s, e).every((l) => /^--/.test(l)));
}

/* =====================================================================
 * ⑤ 읽기 전용 확인 select 는 살아 있다
 * ===================================================================== */
console.log("\n⑤ 읽기 전용 '확인' 은 살려 뒀다(Run 해도 숫자만 나온다)");
살려둔것.forEach(([name, re]) => ok("실행됨: " + name, re.test(live)));
ok("확인 판정 함수도 통과", 확인살아있나(raw));
ok("바꾸는 문장이 하나도 없다(create/alter/drop/insert/update/delete/truncate)",
   !/\b(create|alter|drop|insert|update|delete|truncate)\b/i.test(live));
ok("실행되는 문장은 select 하나뿐이다",
   (live.match(/;/g) || []).length === 1, String((live.match(/;/g) || []).length));

/* =====================================================================
 * ⑥ 맨 위 경고
 * ===================================================================== */
console.log("\n⑥ 맨 위에 경고와 안내가 있다");
const 머리 = raw.slice(0, 2500);
ok("맨 위에 '대체됐습니다' 안내가 있다", /대체됐습니다/.test(머리));
ok("맨 위에 정본 파일 이름이 있다", /schema-tl-realtime\.sql/.test(머리));
ok("'TL 잔액 표시는 바뀌지 않습니다' 가 있다", /TL 잔액 표시는 바뀌지 않습니다/.test(머리));
ok("무엇이 막혔는지 함수 이름이 적혀 있다", /tl_balance_info/.test(머리));
ok("무엇을 살려 뒀는지 적혀 있다", /그대로 살아 있나/.test(머리));
ok("실행 순서 함정을 설명한다", /순서/.test(머리));
ok("실수로 Run 하면 어떻게 되는지 적혀 있다", /실수로 이 파일을 Run 하면/.test(머리));
ok("이 테스트가 봉인을 지킨다고 적혀 있다", /tl-balance-fix-seal\.test\.js/.test(raw));

/* =====================================================================
 * ⑦ 정본이 tl_balance_info() 를 만든다
 * ===================================================================== */
console.log("\n⑦ 정본(schema-tl-realtime.sql)이 tl_balance_info() 를 만든다");
ok("정본 파일이 있다", fs.existsSync(정본경로));
const 정본 = fs.existsSync(정본경로) ? fs.readFileSync(정본경로, "utf8") : "";
const 정본코드 = strip(정본);
ok("정본이 tl_balance_info() 를 만든다",
   /create or replace function public\.tl_balance_info\(/.test(정본코드));
ok("정본이 tl_balance_info 에 권한을 준다",
   /grant execute on function public\.tl_balance_info\(\) to authenticated/.test(정본코드));
ok("정본의 화면 잔액이 구매 판정과 같은 함수를 쓴다",
   /'balance', public\.tl_balance\(uid\)/.test(정본코드));
ok("정본의 granted 는 성과·참여 지급을 뺀다(같은 숫자 두 번 방지)",
   /x\.type not in \('realtime', 'monthly'\)/.test(정본코드));

/* =====================================================================
 * ⑧ 대표님 안내 파일 — 실행 순서
 * ===================================================================== */
console.log("\n⑧ 대표님 안내 파일이 있고 순서가 맞다");
ok("supabase/README-대표님-먼저-읽으세요.md 가 있다", fs.existsSync(안내경로));
const 안내 = fs.existsSync(안내경로) ? fs.readFileSync(안내경로, "utf8") : "";
ok("내용이 비어 있지 않다", 안내.length > 500, String(안내.length));

const 실행순서 = [
  "supabase/schema-rank-1000.sql",
  "supabase/회원삭제-2026-08-24.sql",
  "supabase/schema-tl-realtime.sql",
];
실행순서.forEach((f, i) => ok((i + 1) + "번 파일이 적혀 있다: " + f, 안내.indexOf(f) !== -1));
{
  const 위치 = 실행순서.map((f) => 안내.indexOf(f));
  ok("세 파일이 1 → 2 → 3 순서로 적혀 있다",
     위치.every((v) => v >= 0) && 위치[0] < 위치[1] && 위치[1] < 위치[2],
     위치.join(" / "));
}
ok("조사용(읽기 전용) 파일이 안내돼 있다",
   /supabase\/조사2-랭킹0원-한번에\.sql/.test(안내));
ok("'읽기만 합니다' 라고 알려준다", /읽기만 합니다/.test(안내));
["cleanup-test-data.sql", "schema-tl-monthly.sql",
 "schema-tl-hotdeal.sql", "schema-tl-balance-fix.sql"].forEach((f) => {
  ok("봉인된 파일이 '열 필요 없음' 으로 안내돼 있다: " + f,
     안내.indexOf("supabase/" + f) !== -1);
});
ok("나머지 파일은 다시 돌릴 필요 없다고 적혀 있다", /다시 돌리실 필요 없습니다/.test(안내));
ok("전문용어를 쓰지 않는다(마이그레이션·재정의·롤백·리팩터)",
   !/마이그레이션|재정의|리팩터|롤백/.test(안내));

/* =====================================================================
 * ⑨ 안내가 가리키는 파일이 전부 실제로 있다
 * ===================================================================== */
console.log("\n⑨ 안내에 적힌 파일이 전부 실제로 존재한다(이름이 바뀌면 안내가 거짓말이 된다)");
{
  const 언급 = Array.from(new Set(
    (안내.match(/supabase\/[^\s`)|]+\.(sql|md)/g) || [])
  ));
  ok("안내가 파일을 하나 이상 가리킨다", 언급.length >= 8, String(언급.length));
  언급.forEach((rel) => {
    ok("실제로 있다: " + rel, fs.existsSync(path.join(REPO, rel)));
  });
}

/* =====================================================================
 * ⑩ 돌연변이 — 봉인이 풀리면 정말 잡는가
 * ===================================================================== */
console.log("\n⑩ 돌연변이 (봉인이 풀리면 잡는가)");
{
  ok("지금 상태는 통과한다(오탐 없음)", 봉인됐나(raw) && 확인살아있나(raw));

  const a = raw.replace(/^-- create or replace function public\.tl_balance_info/m,
                        "create or replace function public.tl_balance_info");
  ok("함수 주석 하나만 풀어도 잡아낸다", !봉인됐나(a));

  const b = raw.replace(/^-- grant execute on function public\.tl_balance_info/m,
                        "grant execute on function public.tl_balance_info");
  ok("grant 주석 하나만 풀어도 잡아낸다", !봉인됐나(b));

  const c = raw + "\n" + unseal(
    raw.slice(raw.indexOf("-- create or replace function public.tl_balance_info")));
  ok("파일 맨 뒤에 옛 함수를 다시 붙여도 잡아낸다", !봉인됐나(c));

  const d = raw.replace(/^-- /gm, "");
  ok("봉인을 통째로 풀어도 잡아낸다", !봉인됐나(d));

  /* 반대 방향 — 실수로 파일 전체를 봉인해 확인 select 까지 죽이면 잡아냅니다 */
  const 전체봉인 = raw.split("\n").map((l) => "-- " + l).join("\n");
  ok("파일 전체를 봉인해 버리면 '확인' 검사가 잡아낸다", !확인살아있나(전체봉인));
}

/* =====================================================================
 * ⑪ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑪ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("npm test 목록(tests/_order.txt)에 들어 있다", /tests\/tl-balance-fix-seal\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
