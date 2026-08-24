/* tests/sql-mass-delete-guard.test.js
 * supabase/ 안의 SQL 파일에 "회원 전체를 날리는 문장" 이 새로 들어오는 것을 막습니다.
 *
 * 왜 이 검사가 필요한가
 *   supabase/cleanup-test-data.sql 에는 이 한 줄이 방치돼 있었습니다.
 *       delete from auth.users where id is not null;
 *   where 가 붙어 있어 안전해 보이지만 "id is not null" 은 아무도 걸러내지
 *   못합니다. 파일을 잘못 열어 Run 을 누르면 회원 전원이 사라지고,
 *   되돌릴 방법이 없습니다.
 *   경고 주석은 이미 있었지만 주석은 실행을 막지 못합니다.
 *
 * 이 검사가 지키는 것
 *   1) 파일을 그냥 실행했을 때 곧바로 도는 자리(= 최상위)에
 *      "사실상 전체" 를 지우거나 바꾸는 문장이 없다
 *   2) TRUNCATE / DROP TABLE 이 최상위에 없다
 *   3) 함수 안(create function ... $$ ... $$)의 전체 삭제는 "지금 있는 것" 만
 *      예외로 인정하고, 하나라도 늘어나면 실패한다 (래칫)
 *   4) cleanup-test-data.sql 이 다시 살아나면(주석이 풀리면) 실패한다
 *
 * 최상위와 함수 안을 왜 다르게 보나
 *   create function 의 본문은 파일을 실행해도 "정의만" 됩니다. 실제로 지우려면
 *   누군가 그 함수를 따로 불러야 하고, reset_season() 같은 것은 am_i_admin()
 *   으로 잠겨 있습니다. 반면 최상위 문장은 Run 을 누르는 순간 그대로 돕니다.
 *   사고가 나는 곳은 최상위입니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SQL_DIR = path.join(REPO, "supabase");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

/* ---------------------------------------------------------------- 예외 목록
 * 함수 정의 안에 이미 들어 있는 "전체 대상" 문장들입니다.
 * 전부 관리자 전용 RPC 의 본문이고, 파일을 실행한다고 도는 것이 아닙니다.
 *   reset_season()         — 시즌 초기화. am_i_admin() 으로 잠겨 있음
 *   clear_chat_messages()  — 채팅 전체 비우기. 관리자 전용
 * 여기에 없는 것이 새로 생기면 이 검사가 실패합니다. 늘리려면 왜 안전한지
 * 근거를 적고 손으로 추가하세요. 최상위(파일 실행 즉시)는 예외가 없습니다.
 * ------------------------------------------------------------------------ */
const IN_FUNCTION_ALLOW = {
  "schema-admin-chat.sql": 1,
  "schema-admin-patch.sql": 4,
  "schema-initial-balance.sql": 4,
  "schema-reset-season-fix.sql": 7
};

/* 주석을 지운 "실제로 실행되는 본문" 만 봅니다. */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}

/* create ... function ... as $$ ... $$ 본문을 지워, 남은 것이 "최상위" 가
 * 되게 합니다. do $$ ... $$ 블록은 실행되므로 일부러 남깁니다. */
const FUNC_RE = /create\s+(?:or\s+replace\s+)?function[\s\S]*?\$\$([\s\S]*?)\$\$/gi;
function splitLevels(body) {
  /* 함수 본문($$ 와 $$ 사이)만 따로 모읍니다. "create ... as $$" 앞부분을
     같이 두면 본문 첫 문장이 create 문에 붙어버려 검사가 헛돕니다. */
  const bodies = [];
  let m;
  FUNC_RE.lastIndex = 0;
  while ((m = FUNC_RE.exec(body)) !== null) bodies.push(m[1]);
  FUNC_RE.lastIndex = 0;
  return { top: body.replace(FUNC_RE, "\n"), inFunc: bodies.join("\n;\n") };
}

/* "조건이 있는 척하지만 아무도 못 거르는" WHERE 인지 봅니다. */
const FAKE_WHERE = /\bwhere\b\s+(?:[\w."]+\s+is\s+not\s+null|true|1\s*=\s*1)\s*$/i;

/* if ... then delete ... 처럼 앞에 제어문이 붙어 있으면 ";" 로만 잘랐을 때
   "delete 로 시작" 판정을 빠져나갑니다. 실제로 schema-reset-season-fix.sql 의
   삭제 3건이 이 모양으로 숨어 있었습니다. 제어문 키워드도 경계로 봅니다. */
function statements(sqlText) {
  return sqlText
    .replace(/\b(then|begin|loop|else|declare)\b/gi, ";")
    .split(";").map((s) => s.trim()).filter(Boolean);
}

function scan(sqlText) {
  const hits = [];
  statements(sqlText).forEach((s) => {
    const one = s.replace(/\s+/g, " ").slice(0, 100);
    const isDel = /^delete\s+from/i.test(s);
    const isUpd = /^update\s+/i.test(s);
    if (isDel || isUpd) {
      const kind = isDel ? "DELETE" : "UPDATE";
      if (!/\bwhere\b/i.test(s)) hits.push(kind + "(WHERE 없음): " + one);
      else if (FAKE_WHERE.test(s)) hits.push(kind + "(사실상 전체): " + one);
    }
    if (/\btruncate\b/i.test(s)) hits.push("TRUNCATE: " + one);
    if (/\bdrop\s+(table|schema|database)\b/i.test(s)) hits.push("DROP: " + one);
  });
  return hits;
}

const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();

console.log("\nsupabase SQL — 전체 삭제 방지");
console.log("\n[대상] 검사할 파일");
ok("supabase 폴더에 SQL 파일이 있다", files.length >= 30, "찾은 개수 " + files.length);

console.log("\n[최상위] 파일을 그냥 실행했을 때 바로 도는 자리");
const topOffenders = [];
const inFuncCount = {};
files.forEach((f) => {
  const { top, inFunc } = splitLevels(strip(fs.readFileSync(path.join(SQL_DIR, f), "utf8")));
  scan(top).forEach((h) => topOffenders.push(f + " :: " + h));
  const n = scan(inFunc).length;
  if (n > 0) inFuncCount[f] = n;
});
ok("최상위에 전체를 지우거나 바꾸는 문장이 하나도 없다", topOffenders.length === 0,
   topOffenders.join(" | "));

console.log("\n[래칫] 함수 안의 전체 대상 문장이 늘지 않았는가");
const newFiles = Object.keys(inFuncCount).filter((f) => !(f in IN_FUNCTION_ALLOW));
ok("예외 목록에 없는 파일이 새로 생기지 않았다", newFiles.length === 0,
   "새로 생긴 파일: " + newFiles.join(", "));

const grown = Object.keys(inFuncCount)
  .filter((f) => f in IN_FUNCTION_ALLOW && inFuncCount[f] > IN_FUNCTION_ALLOW[f])
  .map((f) => f + " " + IN_FUNCTION_ALLOW[f] + "→" + inFuncCount[f]);
ok("기존 파일에서도 개수가 늘지 않았다", grown.length === 0, grown.join(", "));

/* 줄어든 것은 실패시키지 않되(고치는 것을 막으면 안 되므로) 알려줍니다. */
Object.keys(IN_FUNCTION_ALLOW).forEach((f) => {
  const now = inFuncCount[f] || 0;
  if (now < IN_FUNCTION_ALLOW[f]) {
    console.log("    ℹ " + f + " 이 " + IN_FUNCTION_ALLOW[f] + "→" + now +
                " 로 줄었습니다. 예외 목록 숫자를 낮춰 주세요.");
  }
});

console.log("\n[봉인] cleanup-test-data.sql 이 다시 살아나지 않았는가");
const LEGACY = path.join(SQL_DIR, "cleanup-test-data.sql");
const legacyRaw = fs.existsSync(LEGACY) ? fs.readFileSync(LEGACY, "utf8") : "";
ok("파일이 기록으로 남아 있다(지우지 않았다)", legacyRaw.length > 0);
const legacyBody = strip(legacyRaw);
ok("실행되는 DELETE 가 없다(주석으로 막혀 있다)", !/delete\s+from/i.test(legacyBody),
   (legacyBody.match(/delete\s+from[^\n;]*/i) || [""])[0]);
ok("실행되는 UPDATE 가 없다", !/^\s*update\s+/im.test(legacyBody));
ok("원래의 전원 삭제 문장은 주석으로 보존돼 있다",
   /--\s*delete from auth\.users where id is not null;/.test(legacyRaw));
ok("맨 위에 실행 금지 경고가 있다", /실행 금지/.test(legacyRaw.slice(0, 600)));
ok("되돌릴 수 없다고 알린다", /되돌릴 수 (없|있)/.test(legacyRaw));
ok("올바른 파일(회원삭제-2026-08-24.sql)로 안내한다",
   /회원삭제-2026-08-24\.sql/.test(legacyRaw));
ok("실행 전 몇 명이 지워지는지 세어 보게 한다",
   /count\(\*\)\s*from auth\.users/i.test(legacyBody));

console.log("\n[돌연변이] 위험한 문장을 넣으면 정말 잡아내는가");
{
  const cases = [
    ["where 없는 DELETE", "delete from public.trades;"],
    ["id is not null DELETE", "delete from auth.users where id is not null;"],
    ["where true DELETE", "delete from public.profiles where true;"],
    ["1=1 DELETE", "delete from public.orders where 1=1;"],
    ["where 없는 UPDATE", "update public.trading_accounts set balance = 0;"],
    ["TRUNCATE", "truncate table public.trades;"],
    ["DROP TABLE", "drop table public.profiles;"]
  ];
  cases.forEach(([label, stmt]) => {
    const mutated = splitLevels(strip(legacyRaw + "\n" + stmt + "\n"));
    ok(label + " 을 넣으면 최상위 검사가 잡아낸다", scan(mutated.top).length === 1,
       "잡은 개수 " + scan(mutated.top).length);
  });
}
{
  /* 함수 정의 안에 숨겨도 래칫이 잡는지 봅니다. */
  const sneaky = "create or replace function public.x() returns void as $$ begin " +
                 "delete from auth.users where id is not null; end $$;";
  const lv = splitLevels(strip(sneaky));
  ok("함수 안에 숨기면 최상위 검사는 통과한다(설계대로)", scan(lv.top).length === 0);
  ok("그래도 래칫이 개수 1 로 세어 새 파일이면 실패한다", scan(lv.inFunc).length === 1);
}
{
  /* 주석 안의 예시 문장 때문에 오작동하지 않는지 봅니다. */
  const commented = "-- delete from auth.users where id is not null;\nselect 1;";
  ok("주석 안의 위험한 문장은 잡지 않는다(오탐 없음)",
     scan(splitLevels(strip(commented)).top).length === 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
