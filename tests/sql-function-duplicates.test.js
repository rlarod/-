/* tests/sql-function-duplicates.test.js
 * 같은 이름의 SQL 함수·뷰가 여러 파일에 흩어지는 것을 감시합니다.
 *
 * 왜 이 검사가 필요한가
 *   supabase/ 안에는 같은 이름의 함수가 여러 벌 있습니다.
 *     get_leaderboard 4벌 / get_my_rank 4벌 / leaderboard 뷰 5벌 …
 *   Postgres 는 "마지막에 실행한 것" 하나만 남깁니다. 그래서 어느 파일을
 *   마지막에 Run 했느냐에 따라 서버 동작이 통째로 달라지고, 파일만 봐서는
 *   서버 상태를 알 수 없습니다. 랭킹이 계속 이상했던 이유 중 하나입니다.
 *
 * 이 검사가 지키는 것
 *   1) 중복 개수가 지금보다 늘어나지 않는다 (래칫)
 *      — 새 파일에 get_leaderboard 를 또 만들면 실패합니다
 *   2) 조사용 SQL(조사-함수중복-2026-08-25.sql)이 읽기 전용으로 남는다
 *      — CREATE/UPDATE/DELETE/DROP 이 한 줄이라도 들어오면 실패합니다
 *   3) 정리 제안 문서(README-함수중복.md)가 사라지지 않는다
 *
 * 봉인(주석 처리)된 정의는 세지 않습니다
 *   schema-tl-monthly.sql 처럼 본문 전체가 -- 로 막힌 파일은 Run 해도
 *   아무 일이 없으므로 "살아있는 벌" 이 아닙니다. 봉인을 풀면 개수가
 *   늘어나 이 검사가 실패합니다 — 그게 의도입니다.
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

/* 주석(--)과 블록주석을 걷어냅니다. 봉인된 정의를 세지 않기 위해서입니다. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map(function (line) {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

const files = fs.readdirSync(SQL_DIR).filter(function (f) { return /\.sql$/i.test(f); });

/* 파일별로 "살아있는" 함수/뷰 이름을 뽑습니다. */
const liveDefs = {};   // 이름 -> [파일…]
function record(name, file) {
  if (!liveDefs[name]) liveDefs[name] = [];
  if (liveDefs[name].indexOf(file) === -1) liveDefs[name].push(file);
}

const RE_FN = /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)/gi;
const RE_VIEW = /create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z0-9_]+)/gi;

files.forEach(function (f) {
  const body = stripComments(fs.readFileSync(path.join(SQL_DIR, f), "utf8"));
  let m;
  while ((m = RE_FN.exec(body)) !== null) record(m[1].toLowerCase(), f);
  while ((m = RE_VIEW.exec(body)) !== null) record("view:" + m[1].toLowerCase(), f);
});

console.log("\n[1] 중복 개수 래칫 — 지금보다 늘어나면 실패");

/* 2026-08-25 수리팀이 직접 센 "살아있는 벌" 개수입니다.
 * 줄이는 것은 언제든 환영(봉인/정리)이고, 늘리면 실패합니다. */
const BASELINE = {
  "view:leaderboard": 5,
  "get_leaderboard": 4,
  "get_my_rank": 4,
  "check_chat_message": 4,
  "reset_season": 3,
  /* 2026-08-28 수리팀 — 2 에서 3 으로 올렸습니다. 왜 올렸는지 남깁니다.
   *   supabase/fix-signup-insert-guard.sql 이 세 번째 벌입니다.
   *   가입(INSERT) 때 recharge_total 등 네 칸을 서버가 고정하려면
   *   이 함수 본문을 늘려야 하는데, 앞의 두 파일은 그대로 두는 것이
   *   맞다고 봤습니다 —
   *     schema-initial-balance.sql 을 고치면 그 파일의 '기존 회원 보정'
   *     UPDATE 까지 같이 다시 돌게 되고,
   *     지갑초기화-해결.sql 은 사고 기록으로 남겨야 합니다.
   *   대신 두 파일 모두에 "정본은 fix-signup-insert-guard.sql" 이라고
   *   적어 뒀고, tests/signup-insert-guard.test.js 가 그 표시를 지킵니다. */
  "force_starting_balance": 3,
  "claim_daily_recharge": 2,
  "rank_points_all": 1,
  "rank_points": 1,
  "tl_balance_info": 1,
  "tl_earned": 1,
  "tl_balance": 1
};

Object.keys(BASELINE).forEach(function (name) {
  const now = (liveDefs[name] || []).length;
  const max = BASELINE[name];
  ok(name + " 이 " + max + "벌 이하로 유지된다",
     now <= max,
     "지금 " + now + "벌: " + (liveDefs[name] || []).join(", "));
});

console.log("\n[2] 봉인된 것이 다시 살아나지 않았는지");

/* 이미 봉인된 파일들은 "살아있는 정의" 가 0 이어야 합니다. */
const SEALED = ["schema-tl-monthly.sql", "schema-rank-assets.sql", "schema-rank-badges.sql"];
SEALED.forEach(function (f) {
  if (files.indexOf(f) === -1) { ok(f + " 존재", false, "파일이 사라졌습니다"); return; }
  const body = stripComments(fs.readFileSync(path.join(SQL_DIR, f), "utf8"));
  const hasFn = /create\s+(or\s+replace\s+)?function/i.test(body);
  ok(f + " 은 봉인된 상태다(실행되는 함수 정의 0개)", !hasFn,
     "주석이 풀렸습니다");
});

console.log("\n[3] 조사용 SQL 이 읽기 전용인지");

const PROBE = "조사-함수중복-2026-08-25.sql"; // 조사-함수중복-2026-08-25.sql
const probePath = path.join(SQL_DIR, PROBE);
ok(PROBE + " 이 있다", fs.existsSync(probePath));

if (fs.existsSync(probePath)) {
  const raw = fs.readFileSync(probePath, "utf8");
  const body = stripComments(raw);

  const WRITE = /\b(create|insert|update|delete|drop|alter|truncate|grant|revoke|refresh)\b/gi;
  const hits = body.match(WRITE) || [];
  ok("쓰기 구문이 한 줄도 없다", hits.length === 0, "발견: " + hits.join(", "));

  /* 대표님이 Run 한 번으로 끝내려면 결과가 한 표로 나와야 합니다.
   * Supabase SQL Editor 는 여러 문장을 돌리면 마지막 것만 보여줍니다. */
  const stmts = body.split(";").filter(function (s) { return s.trim().length > 0; });
  ok("문장이 하나뿐이다(결과 표가 한 장으로 나온다)", stmts.length === 1,
     stmts.length + "개");

  ok("맨 앞에 '읽기만 합니다' 안내가 있다",
     /읽기만\s*합니다/.test(raw.slice(0, 800)));
}

console.log("\n[4] 정리 제안 문서");

const README = "README-함수중복.md"; // README-함수중복.md
const readmePath = path.join(SQL_DIR, README);
ok(README + " 이 있다", fs.existsSync(readmePath));
if (fs.existsSync(readmePath)) {
  const doc = fs.readFileSync(readmePath, "utf8");
  ok("정본이 schema-leaderboard-floor.sql 이라고 적혀 있다",
     /schema-leaderboard-floor\.sql/.test(doc) && /정본/.test(doc));
  /* 실행 가능한 정리 SQL 을 문서에 넣지 않았는지 (제안만 해야 합니다) */
  ok("문서에 drop function 실행문을 넣지 않았다",
     !/^\s*drop\s+function/im.test(doc));
}

console.log("\n[5] 오탐 검사");
{
  const commented = "-- create or replace function public.get_leaderboard(x int)\nselect 1;";
  const body = stripComments(commented);
  ok("주석 처리된 정의는 세지 않는다",
     !/create\s+(or\s+replace\s+)?function/i.test(body));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
