/* tests/nickname-rules.test.js
 * 닉네임 규칙이 화면·서버 양쪽에서 같게 동작하는지 검증합니다.
 *
 * 지금까지의 문제
 *   js/auth.js 는 '비었는지'와 '12자 이내인지'만 봤습니다.
 *   그래서 "김 갱", "★관리자★", "시발", "a" 가 다 통과했습니다.
 *   닉네임은 랭킹·게시판·채팅에 그대로 노출되는 이름이라,
 *   한 번 잘못 만들어지면 운영이 곤란해집니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const sandbox = {
  console: { warn() {}, log() {} },
  setInterval: () => 0, setTimeout: () => 0,
  document: { readyState: "complete", addEventListener() {}, getElementById: () => null },
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "nickname-rules.js"), "utf8"), sandbox);
const R = sandbox.App.NicknameRules;

const sql = fs.readFileSync(path.join(REPO, "supabase", "schema-nickname-rules.sql"), "utf8");
const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

console.log("\n닉네임 규칙");

/* ---------- 통과해야 하는 것 ---------- */
{
  ["김갱", "트레이더7", "a_b", "정상닉네임", "TL_트레이더", "abc123"].forEach((n) => {
    ok("통과: " + n, R.check(n).ok, R.check(n).message);
  });
  ok("앞뒤 공백은 잘라서 통과", R.check("  김갱  ").ok && R.check("  김갱  ").nickname === "김갱");
  ok("정확히 12자는 통과", R.check("열세글자넘어가는닉네임임").ok);
}

/* ---------- 막아야 하는 것 ---------- */
{
  const blocked = [
    ["", "empty"], ["   ", "empty"],
    ["a", "too_short"],
    ["열세글자넘어가는닉네임임임", "too_long"],
    ["김 갱", "has_space"],
    ["★관리자★", "bad_char"], ["김갱😀", "bad_char"], ["김-갱", "bad_char"],
    ["ㅋㅋㅋ", "bad_char"],
    ["시발", "banned"], ["병신이", "banned"], ["FUCK", "banned"],
    ["관리자", "reserved"], ["TL", "reserved"], ["admin", "reserved"], ["시스템", "reserved"],
  ];
  blocked.forEach(([n, reason]) => {
    const r = R.check(n);
    ok("차단: " + JSON.stringify(n) + " (" + reason + ")", !r.ok && r.reason === reason,
       r.ok ? "통과됨" : r.reason);
  });
}

/* ---------- 서버도 같은 규칙인가 ---------- */
{
  ok("서버가 길이를 검사한다", /char_length\(n\) < 2/.test(code) && /char_length\(n\) > 12/.test(code));
  ok("서버가 공백을 막는다", code.indexOf("n ~ '") !== -1 && /nickname_has_space/.test(code));
  ok("서버가 허용 문자를 제한한다", /\[가-힣a-zA-Z0-9_\]\+\$/.test(code));
  ok("서버가 자음·모음만을 막는다", /\[ㄱ-ㅎㅏ-ㅣ\]\+\$/.test(code));
  ok("서버에도 욕설 목록이 있다", /banned text\[\] := array\[/.test(code));
  ok("서버에도 사칭 목록이 있다", /reserved text\[\] := array\[/.test(code));

  /* 두 목록이 실제로 같은지 대조합니다. */
  const sqlBanned = (code.match(/banned text\[\] := array\[([\s\S]*?)\]/) || [])[1] || "";
  const missing = R.BANNED_WORDS.filter((w) => sqlBanned.indexOf(w) === -1);
  ok("욕설 목록이 화면·서버 같다", missing.length === 0, missing.join(", "));

  const sqlReserved = (code.match(/reserved text\[\] := array\[([\s\S]*?)\]/) || [])[1] || "";
  const missing2 = R.RESERVED.filter((w) => sqlReserved.indexOf(w) === -1);
  ok("사칭 목록이 화면·서버 같다", missing2.length === 0, missing2.join(", "));
}

/* ---------- 기존 회원 보호 ---------- */
{
  ok("닉네임이 안 바뀌면 검사하지 않는다",
     /new\.nickname is not distinct from old\.nickname/.test(code));
  ok("트리거는 profiles 에만 건다", /before insert or update on public\.profiles/.test(code));
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(code));
  ok("기존 닉네임을 자동으로 바꾸지 않는다", !/update public\.profiles\s+set nickname/i.test(code));
}

/* ---------- 연결 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "nickname-rules.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const auth = fs.readFileSync(path.join(REPO, "js", "auth.js"), "utf8");

  ok("스크립트가 연결됐다", /js\/nickname-rules\.js/.test(html));
  ok("회원가입일 때만 검사한다(로그인은 통과)", /indexOf\("회원가입"\) === -1/.test(src));
  ok("두 폼 모두 막는다", /up-login-submit/.test(src) && /auth-submit-btn/.test(src));
  ok("auth.js 는 건드리지 않았다", !/NicknameRules/.test(auth));
  ok("중복 닉네임은 DB 유니크로 막힌다",
     /nickname text not null unique/.test(fs.readFileSync(path.join(REPO, "supabase", "schema.sql"), "utf8")));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
