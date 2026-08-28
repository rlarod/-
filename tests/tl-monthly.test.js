/* tests/tl-monthly.test.js
 * 옛 파일 supabase/schema-tl-monthly.sql 이 "봉인" 된 상태를 지킵니다.
 *
 * 무슨 일이 있었나
 *   2026-08-24 이 파일은 TL 을 "월 정산 + 저장" 방식으로 바꾸는 파일이었습니다.
 *   대표님이 실행하기 전에 지시가 바뀌었습니다 — "TL 은 거래할 때마다 실시간으로 주자".
 *   그래서 supabase/schema-tl-realtime.sql 이 이 파일을 대체했습니다.
 *
 * 왜 지우지 않았나
 *   기록이기 때문입니다. 대신 "실수로 열어서 Run 을 눌러도 아무 일이 없게"
 *   원문 전체를 주석으로 막았습니다(cleanup-test-data.sql 과 같은 방식).
 *
 * 왜 이 검사가 필요한가
 *   봉인이 풀리면 tl_earned() 가 월 정산 방식으로 되돌아갑니다.
 *   실시간 지급과 정의가 갈라져, 회원 화면의 TL 이 서버 값과 어긋납니다.
 *   주석은 실행을 막아 주지만, 주석이 풀린 것을 알려 주지는 못합니다.
 *   그래서 테스트가 지킵니다.
 *
 * 이 검사가 지키는 것
 *   1) 파일이 지워지지 않았다 (기록으로 남아 있다)
 *   2) 실행되는 문장이 하나도 없다 (전부 주석)
 *   3) 맨 위에 "대체됐다 / 새 파일로 가라" 안내가 있다
 *   4) 원문이 주석으로 보존돼 있다 (통째로 날린 게 아니다)
 *   5) 새 파일(schema-tl-realtime.sql)이 실제로 있다
 *
 * 실시간 지급 자체의 동작은 tests/tl-realtime.test.js 가 지킵니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

const OLD = path.join(REPO, "supabase", "schema-tl-monthly.sql");
const NEW = path.join(REPO, "supabase", "schema-tl-realtime.sql");

/* 주석을 지운 "실제로 실행되는 본문" 만 봅니다. */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}

console.log("\n옛 TL 월 정산 파일 — 봉인 확인");

/* =====================================================================
 * ① 파일이 남아 있다
 * ===================================================================== */
console.log("\n① 지우지 않았다(기록으로 남긴다)");
ok("supabase/schema-tl-monthly.sql 이 있다", fs.existsSync(OLD));
const raw = fs.existsSync(OLD) ? fs.readFileSync(OLD, "utf8") : "";
ok("내용이 비어 있지 않다", raw.length > 5000, String(raw.length));

/* =====================================================================
 * ② 실행되는 문장이 하나도 없다
 * ===================================================================== */
console.log("\n② 실행되는 문장이 하나도 없다");
const body = strip(raw);
const 남은것 = body.replace(/\s/g, "");
ok("주석을 지우면 남는 문장이 없다", 남은것.length === 0,
   "남은 " + 남은것.length + "자: " + body.replace(/\s+/g, " ").trim().slice(0, 160));

[
  ["SELECT", /\bselect\b/i],
  ["CREATE", /\bcreate\b/i],
  ["ALTER", /\balter\b/i],
  ["INSERT", /\binsert\b/i],
  ["UPDATE", /\bupdate\b/i],
  ["DELETE", /\bdelete\b/i],
  ["DO 블록", /\bdo\s*\$/i],
  ["GRANT", /\bgrant\b/i]
].forEach(([label, re]) => {
  ok("실행되는 " + label + " 이 없다", !re.test(body),
     (body.match(new RegExp(re.source + "[^\\n]*", "i")) || [""])[0]);
});

/* =====================================================================
 * ③ 맨 위에 안내가 있다 — 대표가 파일을 열면 바로 보이게
 * ===================================================================== */
console.log("\n③ 맨 위 안내");
const head = raw.slice(0, 1400);
ok("'대체됐습니다' 라고 알린다", /대체됐습니다/.test(head));
ok("실행해도 아무 일이 없다고 알린다", /실행해도 아무 일이 없습니다/.test(head));
ok("어느 파일을 열어야 하는지 알려준다", /schema-tl-realtime\.sql/.test(head));
ok("왜 바뀌었는지 적어 뒀다", /거래할 때마다 실시간/.test(head));
ok("공식은 그대로라고 적어 뒀다", /공식/.test(head) && /그대로/.test(head));
ok("어떻게 막았는지 적어 뒀다", /주석/.test(head));
ok("이 파일이 실행된 적이 없다고 적어 뒀다", /실행된 적이 없습니다/.test(head));

/* =====================================================================
 * ④ 원문이 주석으로 보존돼 있다 — 통째로 날린 게 아니다
 * ===================================================================== */
console.log("\n④ 원문 보존");
ok("옛 함수 정의가 주석으로 남아 있다",
   (raw.match(/--\s*create or replace function/g) || []).length >= 7,
   String((raw.match(/--\s*create or replace function/g) || []).length));
[
  "tl_month_profit",
  "tl_month_days",
  "tl_month_amount",
  "tl_settle_month",
  "tl_settle_all_past",
  "tl_migrate_legacy"
].forEach((fn) => {
  ok("옛 " + fn + "() 원문이 남아 있다", raw.indexOf(fn) > 0);
});
ok("옛 공식(300 × log2)도 원문 그대로 남아 있다", /300 \* log\(2,/.test(raw));

/* =====================================================================
 * ⑤ 새 파일이 실제로 있다 — 안내한 곳이 비어 있으면 안 됩니다
 * ===================================================================== */
console.log("\n⑤ 새 파일로 이어진다");
ok("supabase/schema-tl-realtime.sql 이 실제로 있다", fs.existsSync(NEW));
if (fs.existsSync(NEW)) {
  const nraw = fs.readFileSync(NEW, "utf8");
  const ncode = strip(nraw);
  ok("새 파일에는 실행되는 문장이 있다", ncode.replace(/\s/g, "").length > 2000,
     String(ncode.replace(/\s/g, "").length));
  ok("새 파일이 trades 에 트리거를 건다", /after insert on public\.trades/.test(ncode));
  ok("새 파일이 옛 파일을 대체한다고 적어 뒀다", /schema-tl-monthly\.sql/.test(nraw));
}

/* =====================================================================
 * ⑥ 돌연변이 — 봉인이 풀리면 정말 잡아내는가
 * ===================================================================== */
console.log("\n⑥ 돌연변이 (봉인이 풀리면 잡는가)");
{
  const 풀린것 = raw + "\nselect public.tl_settle_all_past();\n";
  ok("맨 뒤에 실행 문장을 하나 넣으면 잡아낸다",
     strip(풀린것).replace(/\s/g, "").length > 0);

  const 주석해제 = raw.replace(/^-- create or replace function/m, "create or replace function");
  ok("주석 하나만 풀어도 잡아낸다", strip(주석해제).replace(/\s/g, "").length > 0);

  ok("지금 상태는 통과한다(오탐 없음)", strip(raw).replace(/\s/g, "").length === 0);
}

/* =====================================================================
 * ⑦ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑦ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("npm test 목록(tests/_order.txt)에 들어 있다", /tests\/tl-monthly\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
