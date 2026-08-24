/* tests/member-delete-sql.test.js
 * 회원 계정 삭제 SQL(supabase/회원삭제-2026-08-24.sql)이 안전한지 검증합니다.
 *
 * 왜 이 검사가 필요한가
 *   이 파일은 실서버의 회원 데이터를 되돌릴 수 없게 지웁니다.
 *   저장소에 이미 있던 supabase/cleanup-test-data.sql 은
 *     delete from auth.users where id is not null;
 *   한 줄로 "전원 삭제" 를 합니다. 조건이 있는 것처럼 보이지만
 *   실제로는 아무도 걸러내지 못합니다.
 *   새 파일이 실수로 그런 모양이 되면 회원 전체가 사라집니다.
 *
 * 이 검사가 지키는 것
 *   1) 모든 DELETE 에 진짜 조건이 있다 (대상을 좁히지 못하는 조건은 실패)
 *   2) 남길 계정(김갱 · 김갱TV)이 모든 삭제문에서 제외된다
 *   3) TRUNCATE / DROP TABLE / 활성 UPDATE 가 없다
 *   4) 스키마에서 auth.users 를 참조하는 테이블을 하나도 빠뜨리지 않는다
 *   5) auth.users 를 profiles 보다 먼저 지운다
 *      (반대로 하면 "로그인은 되는데 프로필이 없는" 계정이 남습니다)
 *   6) 1~4절 구조와 "여기까지 실행하고 확인" 안내가 있다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

const SQL_NAME = "회원삭제-2026-08-24.sql";
const SQL_PATH = path.join(REPO, "supabase", SQL_NAME);

const KEEP = ["김갱", "김갱TV"];
const DROP = ["CHRO", "Mang9"];

const raw = fs.existsSync(SQL_PATH) ? fs.readFileSync(SQL_PATH, "utf8") : "";
/* 주석을 지운 "실제로 실행되는 본문" 만 봅니다.
   주석 안의 예시 문장 때문에 검사가 오작동하지 않게 합니다. */
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const body = strip(raw);
const statements = body.split(";").map((s) => s.trim()).filter(Boolean);
const deletes = statements.filter((s) => /^delete\s+from/i.test(s));

console.log("\n회원 계정 삭제 SQL");

console.log("\n[존재] 파일과 4절 구조");
ok("삭제 SQL 파일이 있다", raw.length > 0, SQL_PATH);
ok("1절(확인) 이 있다", /#\s*1절\./.test(raw));
ok("2절(백업) 이 있다", /#\s*2절\./.test(raw));
ok("3절(삭제) 이 있다", /#\s*3절\./.test(raw));
ok("4절(삭제 후 확인) 이 있다", /#\s*4절\./.test(raw));
ok("절 단위로 끊어 실행하라고 안내한다",
   /한 번에 (전부|다) 돌리지 마세요/.test(raw) && /여기까지 실행하고/.test(raw));
ok("되돌릴 수 없다고 경고한다", /되돌릴 수 없습니다/.test(raw));

console.log("\n[안전] 모든 DELETE 에 진짜 조건이 있는가");
ok("DELETE 문이 실제로 들어 있다", deletes.length > 0, "찾은 개수 " + deletes.length);

const noWhere = deletes.filter((s) => !/\bwhere\b/i.test(s));
ok("WHERE 없는 DELETE 가 하나도 없다", noWhere.length === 0,
   noWhere.map((s) => s.split("\n")[0]).join(" | "));

/* "where id is not null" 처럼 아무도 못 거르는 조건을 잡아냅니다.
   cleanup-test-data.sql 이 실제로 이 모양이라, 복사해 오면 여기서 걸립니다. */
function isFakeWhere(s) {
  return /\bwhere\b\s+[\w.]+\s+is\s+not\s+null\s*$/i.test(s) || /\bwhere\b\s+true\s*$/i.test(s);
}
const fakeWhere = deletes.filter(isFakeWhere);
ok("아무도 못 거르는 조건(is not null / true)이 없다", fakeWhere.length === 0,
   fakeWhere.map((s) => s.split("\n")[0]).join(" | "));

const notTargeted = deletes.filter((s) => !DROP.every((n) => s.includes("'" + n + "'")));
ok("모든 DELETE 가 CHRO 와 Mang9 를 이름으로 지목한다", notTargeted.length === 0,
   notTargeted.map((s) => s.split("\n")[0]).join(" | "));

const notGuarded = deletes.filter((s) => !KEEP.every((n) => s.includes("'" + n + "'")));
ok("모든 DELETE 가 김갱 과 김갱TV 를 제외한다", notGuarded.length === 0,
   notGuarded.map((s) => s.split("\n")[0]).join(" | "));

const badGuard = deletes.filter((s) => !/not\s+in\s*\(\s*'김갱'\s*,\s*'김갱TV'\s*\)/.test(s));
ok("제외가 not in ('김갱','김갱TV') 형태다", badGuard.length === 0, badGuard.length + "개");

console.log("\n[안전] 구조를 부수는 문장이 없는가");
ok("TRUNCATE 가 없다", !/\btruncate\b/i.test(body));
ok("DROP TABLE / DROP SCHEMA 가 없다", !/\bdrop\s+(table|schema)\b/i.test(body));
ok("ALTER TABLE 이 없다", !/\balter\s+table\b/i.test(body));
ok("실행되는 UPDATE 가 없다(흔적 정리는 주석 처리)",
   !/^\s*update\s+/im.test(body) && /--\s*update public\.trading_cycles set ended_by = null/.test(raw));
ok("CREATE TABLE 이 없다(다른 테스트의 컬럼 수집을 오염시키지 않게)",
   !/create\s+table/i.test(body));

console.log("\n[누락] auth.users 를 참조하는 테이블을 다 다루는가");

/* 스키마 파일 전체에서 auth.users 를 참조하는 테이블을 뽑습니다.
   나중에 회원 테이블이 새로 생기면 이 검사가 자동으로 그 테이블을 요구합니다. */
function tablesReferencingUsers() {
  const found = new Set();
  fs.readdirSync(path.join(REPO, "supabase"))
    .filter((f) => f.endsWith(".sql") && f !== SQL_NAME)
    .forEach((f) => {
      const s = strip(fs.readFileSync(path.join(REPO, "supabase", f), "utf8"));
      const re = /create\s+table\s+if\s+not\s+exists\s+public\.(\w+)\s*\(([\s\S]*?)\n\);/g;
      let m;
      while ((m = re.exec(s)) !== null) {
        if (/references\s+auth\.users\s*\(\s*id\s*\)/i.test(m[2])) found.add(m[1]);
      }
    });
  return found;
}

/* 표 이름 뒤에 다른 글자가 붙은 경우(예: posts 와 post_votes)를 가르려고
   "이름 바로 뒤에 줄바꿈 또는 공백" 인 것만 인정합니다.
   정규식을 안 쓰는 이유는 표 이름을 그대로 이어 붙이면
   이름에 특수문자가 섞였을 때 뜻이 달라지기 때문입니다. */
function hasDeleteFor(text, table) {
  const head = "delete from public." + table;
  let i = text.indexOf(head);
  while (i >= 0) {
    const next = text.charAt(i + head.length);
    if (next === "" || next === "\n" || next === " " || next === ";") return true;
    i = text.indexOf(head, i + 1);
  }
  return false;
}

const needed = tablesReferencingUsers();
ok("스키마에서 회원 테이블을 찾아냈다", needed.size >= 15, "찾은 개수 " + needed.size);

const section1 = raw.slice(0, raw.indexOf("# 2절"));
const missingDelete = [];
const missingCount = [];
needed.forEach((t) => {
  if (t === "profiles") return; // profiles 는 아래 [순서] 에서 따로 봅니다
  if (!hasDeleteFor(body, t)) missingDelete.push(t);
  /* 1절 확인 쿼리에도 나와야 대표가 몇 건인지 미리 봅니다 */
  if (!section1.includes("public." + t)) missingCount.push(t);
});
ok("회원 테이블을 하나도 빠뜨리지 않고 지운다", missingDelete.length === 0,
   "빠진 것: " + missingDelete.join(", "));
ok("1절 확인 쿼리가 모든 회원 테이블 건수를 보여준다", missingCount.length === 0,
   "빠진 것: " + missingCount.join(", "));
ok("프로필도 지운다", /delete from public\.profiles\b/.test(body));

console.log("\n[순서] 로그인 계정을 프로필보다 먼저 지우는가");
const iAuth = body.indexOf("delete from auth.users");
const iProf = body.search(/delete from public\.profiles\b/);
const iPosts = body.search(/delete from public\.posts\b/);
const iComments = body.search(/delete from public\.post_comments\b/);
ok("auth.users 를 지운다(로그인만 남는 유령 계정 방지)", iAuth > 0);
ok("auth.users 를 profiles 보다 먼저 지운다", iAuth > 0 && iProf > iAuth,
   "auth=" + iAuth + " profiles=" + iProf);
ok("댓글을 글보다 먼저 지운다(자식에서 부모 순서)", iComments > 0 && iPosts > iComments);

console.log("\n[안전장치] 대상 수가 다르면 멈추는가");
const iGuard = body.indexOf("n_del");
const iFirstDelete = body.search(/delete\s+from/i);
ok("트랜잭션으로 감싼다(중간에 실패하면 전부 취소)",
   /\bbegin;/i.test(body) && /\bcommit;/i.test(body));
ok("지울 대상이 2명이 아니면 중단한다",
   /n_del\s*<>\s*2/.test(body) && /raise exception/i.test(body));
ok("남길 대상이 2명이 아니면 중단한다", /n_keep\s*<>\s*2/.test(body));
ok("안전장치가 첫 삭제문보다 앞에 있다", iGuard > 0 && iGuard < iFirstDelete,
   "guard=" + iGuard + " firstDelete=" + iFirstDelete);

console.log("\n[확인] 지운 뒤 무엇을 보는가");
const tail = raw.slice(raw.indexOf("# 4절"));
ok("남은 계정 목록을 보여준다", /from public\.profiles/.test(tail));
ok("남은 로그인 계정 수를 보여준다", /from auth\.users/.test(tail));
ok("고아 데이터가 0 인지 확인한다", /not in \(select id from public\.profiles\)/.test(tail));
ok("랭킹을 확인한다", /public\.leaderboard/.test(tail));
ok("채팅을 확인한다", /public\.chat_messages/.test(tail));
ok("게시판을 확인한다", /public\.posts_with_meta/.test(tail));
ok("관리자가 남았는지 확인한다", /public\.admin_users/.test(tail));

console.log("\n[읽기 전용] 1절과 2절은 아무것도 바꾸지 않는가");
const beforeDelete = body.slice(0, body.indexOf("begin;"));
ok("1·2절에 DELETE 가 없다", !/delete\s+from/i.test(beforeDelete));
ok("1·2절에 UPDATE 가 없다", !/\bupdate\s+public\./i.test(beforeDelete));
ok("1절이 관리자 여부를 미리 알려준다", /admin_users/.test(beforeDelete));
ok("1절이 글과 채팅이 누구 것인지 보여준다",
   /from public\.posts po/.test(beforeDelete) && /from public\.chat_messages cm/.test(beforeDelete));
ok("2절이 백업 CSV 를 받으라고 안내한다", /Download CSV/.test(raw));

console.log("\n[돌연변이] 위험한 문장을 넣으면 정말 실패하는가");
{
  /* cleanup-test-data.sql 의 "전원 삭제" 문장을 그대로 끼워 넣어 봅니다. */
  const mutated = body + "\ndelete from auth.users where id is not null;\n";
  const st = mutated.split(";").map((s) => s.trim()).filter(Boolean)
    .filter((s) => /^delete\s+from/i.test(s));
  ok("전원 삭제 문장을 넣으면 못 거르는 조건 검사가 실패한다",
     st.filter(isFakeWhere).length === 1);
  ok("그 문장은 김갱 제외 검사에서도 실패한다",
     st.filter((s) => !KEEP.every((n) => s.includes("'" + n + "'"))).length === 1);
}
{
  /* 보호 조건을 "삭제문 안에서" 한 곳만 빼도 잡히는지 봅니다.
     (1절·2절의 조회 쿼리에도 같은 조건이 있어서, 첫 삭제문 뒤부터 바꿉니다) */
  const cut = body.search(/delete\s+from/i);
  const mutated = body.slice(0, cut) +
    body.slice(cut).replace(/not\s+in\s*\(\s*'김갱'\s*,\s*'김갱TV'\s*\)/, "is not null");
  const st = mutated.split(";").map((s) => s.trim()).filter(Boolean)
    .filter((s) => /^delete\s+from/i.test(s));
  ok("보호 조건을 삭제문에서 한 곳만 빼도 검사가 실패한다",
     st.filter((s) => !KEEP.every((n) => s.includes("'" + n + "'"))).length > 0);
}
{
  /* 테이블 하나를 빠뜨리면 누락 검사가 잡는지 봅니다. */
  const mutated = body.split("delete from public.trades").join("delete from public.zzz_none");
  ok("테이블 하나를 빠뜨리면 누락 검사가 실패한다", hasDeleteFor(mutated, "trades") === false);
}
{
  /* auth.users 를 profiles 뒤로 옮기면 순서 검사가 잡는지 봅니다. */
  const a = "delete from auth.users";
  const p = "delete from public.profiles";
  const mutated = body.split(a).join("__TMP__").split(p).join(a).split("__TMP__").join(p);
  ok("순서를 뒤집으면 순서 검사가 실패한다",
     !(mutated.indexOf(a) < mutated.search(/delete from public\.profiles\b/)));
}
{
  /* cleanup-test-data.sql 에 있던 "전원 삭제" 문장이 이 검사에 실제로
     걸리는지 확인합니다 — 검사가 진짜인지 보는 용도입니다. */
  const historic = "delete from auth.users where id is not null";
  ok("전원 삭제 문장은 이 검사에 걸린다(검사가 진짜다)", isFakeWhere(historic));

  /* 그 파일은 2026-08-24 에 삭제문을 주석으로 막아 실행되지 않게 했습니다.
     (파일은 기록으로 남겨 두었습니다. 자세한 검사는
      tests/sql-mass-delete-guard.test.js 가 합니다) */
  const legacy = path.join(REPO, "supabase", "cleanup-test-data.sql");
  if (fs.existsSync(legacy)) {
    const legacyBody = strip(fs.readFileSync(legacy, "utf8"));
    ok("cleanup-test-data.sql 에 실행되는 DELETE 가 없다(봉인돼 있다)",
       !/delete\s+from/i.test(legacyBody),
       (legacyBody.match(/delete\s+from[^\n;]*/i) || [""])[0]);
  } else {
    ok("기존 cleanup-test-data.sql 이 없다(검사 생략)", true);
  }
}

console.log("\n[안전] 수정 금지 파일 확인");
const FROZEN = {
  "js/trading.js": "33250202c00b097ff8344ae2ee64cbe7",
  "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
  "js/auth.js": "9cec9a7257eb54f379bf72e14e21e463",
  "js/supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
  "js/chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
  "js/leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
  "js/admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
  "js/season.js": "9c5fbf13ced09ca2f348e48f87c78224",
  "js/board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
  "js/orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
  "js/chart.js": "02ddcb000d577131f797143d08c09123",
  "js/websocket.js": "1a914631175760e0b0cb5144bc11b59e"
};
Object.keys(FROZEN).forEach((rel) => {
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, rel))).digest("hex");
  ok("수정 금지 파일이 그대로다: " + rel, md5 === FROZEN[rel], md5);
});

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
