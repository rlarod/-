/* tests/tl-realtime-run.test.js
 * =========================================================================
 * TL 실시간 SQL 이 "대표님 Run 한 번" 으로 끝나는 상태를 지킵니다
 * =========================================================================
 *
 * ── 2026-08-26 무슨 일이 있었나 (세 번 실패) ────────────────────────────
 *   1차  ERROR P0001: not_admin          (tl_settle_all_past() line 9)
 *   2차  ERROR 42883: tl_grant_diff(uuid, unknown) does not exist
 *   3차  ERROR 42883: tl_grant_diff(uuid) does not exist
 *
 *   원인은 두 겹이었습니다.
 *
 *   ① 7절·8절 함수가 맨 앞에서 "관리자냐" 를 묻는데, SQL Editor 는 화면에
 *      로그인한 회원이 아니라 서버 자신으로 돌아갑니다. auth.uid() 가 비어
 *      있어 관리자 확인이 항상 실패했습니다.
 *   ② SQL Editor 는 파일 전체를 한 덩어리로 처리합니다. 그래서 7절에서
 *      터지는 순간 2~6절(함수·트리거)까지 통째로 되돌아갔습니다.
 *      → 서버에는 아무것도 안 올라갔고, 그래서 그 다음에 "tl_grant_diff
 *        그런 함수 없다" 가 이어졌습니다.
 *
 * ── 이 파일이 잠그는 것 (다른 테스트와 겹치지 않는 부분만) ──────────────
 *   공식·상수·차액 구조·트리거·권한  → tests/tl-realtime.test.js
 *   옛 공식이 되살아나는지            → tests/tl-grant-formula-seal.test.js
 *   여기서만 보는 것은 "실행이 되는가" 딱 하나입니다.
 *
 *   1) 7절·8절이 최상위 select 로 벌거벗고 있지 않다
 *      (그러면 실패할 때 2~6절까지 없던 일이 됩니다)
 *   2) 7절·8절을 "오류를 삼키는 블록" 이 감싸고 있다
 *   3) 함수 안의 관리자 잠금은 느슨해지지 않았다 (한 글자도 안 풀었다)
 *   4) 관리자 자격은 "이 실행 동안만" 빌리고 끝나면 되돌린다
 *   5) 파일의 맨 마지막 명령이 대표님이 보실 요약표다
 *      (Supabase 는 명령이 여러 개면 마지막 것만 보여 줍니다)
 *   6) 서버 상태 확인 파일이 읽기 전용이고 명령이 한 개다
 *   7) TL-밀린것채우기 는 봉인돼서 실수로 Run 해도 아무 일이 없다
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SQL_DIR = path.join(REPO, "supabase");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const MAIN = path.join(SQL_DIR, "schema-tl-realtime.sql");
const PROBE_NAME = "조사-TL실시간-서버상태-2026-08-26.sql";
const OLD_NAME = "TL-밀린것채우기-2026-08-26.sql";
const PROBE = path.join(SQL_DIR, PROBE_NAME);
const OLD = path.join(SQL_DIR, OLD_NAME);

/* 주석(--)을 지운 "실제로 실행되는 본문" */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}

/* $$ ... $$ 안(함수 본문 · do 블록)을 통째로 지웁니다.
   남는 것이 "파일을 Run 했을 때 최상위에서 도는 문장" 입니다. */
function stripDollarBodies(s) {
  let out = "", i = 0;
  while (i < s.length) {
    const m = /^\$[A-Za-z_]*\$/.exec(s.slice(i, i + 20));
    if (m) {
      const end = s.indexOf(m[0], i + m[0].length);
      if (end < 0) { out += s.slice(i); break; }
      out += " ";
      i = end + m[0].length;
      continue;
    }
    out += s[i];
    i++;
  }
  return out;
}

/* 최상위 문장으로 자릅니다(괄호·따옴표·$$ 를 셈에 넣습니다). */
function topStatements(s) {
  const list = [];
  let i = 0, depth = 0, inS = false, dollar = null, cur = "";
  while (i < s.length) {
    const c = s[i];
    if (dollar) {
      if (s.startsWith(dollar, i)) { cur += dollar; i += dollar.length; dollar = null; continue; }
      cur += c; i++; continue;
    }
    if (inS) {
      if (c === "'") {
        if (s[i + 1] === "'") { cur += "''"; i += 2; continue; }
        inS = false;
      }
      cur += c; i++; continue;
    }
    if (c === "-" && s[i + 1] === "-") { const j = s.indexOf("\n", i); i = j < 0 ? s.length : j; continue; }
    const m = /^\$[A-Za-z_]*\$/.exec(s.slice(i, i + 20));
    if (m) { dollar = m[0]; cur += m[0]; i += m[0].length; continue; }
    if (c === "'") { inS = true; cur += c; i++; continue; }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === ";" && depth === 0) { list.push(cur.trim()); cur = ""; i++; continue; }
    cur += c; i++;
  }
  if (cur.trim()) list.push(cur.trim());
  return list.filter((x) => x.length > 0);
}

console.log("\nTL 실시간 SQL — Run 한 번으로 끝나는가");

ok("supabase/schema-tl-realtime.sql 이 있다", fs.existsSync(MAIN));
const raw = fs.readFileSync(MAIN, "utf8");
const code = strip(raw);
const top = stripDollarBodies(code);
const stmts = topStatements(code);

/* =========================================================================
 * [1] 7절·8절이 최상위에서 벌거벗고 있지 않다
 * ========================================================================= */
section("[1] 7절·8절이 최상위 select 로 벌거벗고 있지 않다");
{
  /* 최상위에서 그냥 부르면, 실패할 때 2~6절(함수·트리거)까지 통째로 되돌아갑니다.
     2026-08-26 에 실제로 그렇게 되어 서버에 아무것도 안 남았습니다. */
  ok("select public.tl_settle_all_past() 가 최상위에 없다",
    !/select\s+public\.tl_settle_all_past\s*\(/i.test(top),
    "최상위에서 부르면 실패할 때 2~6절까지 되돌아갑니다");
  ok("select public.tl_migrate_legacy() 가 최상위에 없다",
    !/select\s+public\.tl_migrate_legacy\s*\(/i.test(top));
  ok("그래도 두 함수는 여전히 만들고 권한도 준다(지우지 않았다)",
    /create or replace function public\.tl_settle_all_past\(\)/.test(code) &&
    /create or replace function public\.tl_migrate_legacy\(\)/.test(code) &&
    /grant execute on function public\.tl_settle_all_past\(\) to authenticated;/.test(code) &&
    /grant execute on function public\.tl_migrate_legacy\(\) to authenticated;/.test(code));
}

/* =========================================================================
 * [2] 오류를 삼키는 블록이 7절·8절을 감싸고 있다
 * ========================================================================= */
section("[2] 7절·8절이 실패해도 2~6절은 남는다");
const runBlock = (function () {
  const a = code.indexOf("do $run$");
  if (a < 0) return "";
  const b = code.indexOf("$run$;", a + 8);
  return b < 0 ? "" : code.slice(a, b);
})();
{
  ok("7절·8절을 돌리는 블록(do $run$)이 있다", runBlock.length > 300, String(runBlock.length));
  ok("그 블록 안에서 7절을 부른다", /public\.tl_settle_all_past\(\)/.test(runBlock));
  ok("그 블록 안에서 8절을 부른다", /public\.tl_migrate_legacy\(\)/.test(runBlock));
  ok("7절이 8절보다 먼저다(순서가 바뀌면 보정액이 과하게 나갑니다)",
    runBlock.indexOf("tl_settle_all_past") < runBlock.indexOf("tl_migrate_legacy"));
  ok("오류를 삼키는 블록이 걸려 있다(exception when others)",
    /exception\s+when\s+others\s+then/i.test(runBlock));
  ok("오류를 숨기지 않고 서버 메시지를 그대로 남긴다(sqlerrm)",
    /sqlerrm/.test(runBlock),
    "'실패했습니다' 만 띄우면 원인을 못 찾습니다");
  ok("어떤 오류인지 번호까지 남긴다(sqlstate)", /sqlstate/.test(runBlock));
}

/* =========================================================================
 * [3] 함수 안의 관리자 잠금은 한 글자도 안 풀렸다
 * ========================================================================= */
section("[3] 관리자 잠금이 느슨해지지 않았다");
{
  ["tl_settle_all_past", "tl_migrate_legacy"].forEach((fn) => {
    const a = code.indexOf("create or replace function public." + fn);
    const b = code.indexOf("grant execute on function public." + fn, a);
    const body = a >= 0 && b > a ? code.slice(a, b) : "";
    ok(fn + "() 안의 관리자 확인이 그대로다",
      /if not public\.am_i_admin\(\) then\s*raise exception 'not_admin'/.test(body),
      "구간 길이 " + body.length);
  });
  /* "auth.uid() 가 비어 있으면 통과" 같은 우회로 잠금을 풀지 않았는지 봅니다.
     그렇게 하면 로그인 안 한 사람(anon)도 조건을 통과합니다. */
  ok("'비어 있으면 통과' 로 잠금을 풀지 않았다",
    !/auth\.uid\(\)\s+is\s+not\s+null\s+and\s+not\s+public\.am_i_admin/i.test(code),
    "이렇게 풀면 anon 도 조건을 통과합니다");
  ok("관리자 확인 문장을 지우지 않았다",
    (code.match(/raise exception 'not_admin'/g) || []).length === 2,
    String((code.match(/raise exception 'not_admin'/g) || []).length) + "곳");
}

/* =========================================================================
 * [4] 관리자 자격은 "이 실행 동안만" 빌린다
 * ========================================================================= */
section("[4] 관리자 자격을 빌리는 방식");
{
  ok("관리자 명단(admin_users)에서 가져온다",
    /from public\.admin_users/.test(runBlock),
    "아무 uuid 나 써넣으면 안 됩니다");
  ok("명단이 비어 있으면 조용히 건너뛰고 알려 준다",
    /if v_admin is null then/.test(runBlock) && /admin_users/.test(runBlock));

  /* set_config 의 세 번째 값이 true = "이 실행이 끝나면 저절로 풀림" 입니다.
     false 로 바뀌면 접속이 살아 있는 동안 계속 남습니다. 그러면 안 됩니다. */
  /* set_config( ... ) 를 괄호 짝을 세어 통째로 잘라냅니다.
     json_build_object(...) 처럼 안에 괄호가 또 있어서 단순 검색으로는 잘립니다. */
  function setConfigCalls(s, prefix) {
    const out = [];
    let i = 0;
    while (true) {
      const a = s.indexOf(prefix, i);
      if (a < 0) break;
      let j = s.indexOf("(", a), d = 0, end = -1;
      for (let k = j; k < s.length; k++) {
        if (s[k] === "(") d++;
        else if (s[k] === ")") { d--; if (d === 0) { end = k; break; } }
      }
      if (end < 0) break;
      out.push(s.slice(a, end + 1));
      i = end + 1;
    }
    return out;
  }
  const claims = setConfigCalls(runBlock, "set_config('request.jwt.");
  ok("자격을 빌리는 문장을 찾았다", claims.length >= 2, String(claims.length) + "개");
  ok("빌린 자격은 전부 '이 실행 동안만'이다(마지막 값 true)",
    claims.length > 0 && claims.every((c) => /,\s*true\s*\)$/.test(c)),
    claims.join(" | "));
  ok("끝나면 빌린 자격을 되돌린다",
    (runBlock.match(/set_config\('request\.jwt\.[^']*',\s*''/g) || []).length >= 2,
    "되돌리는 문장이 모자랍니다");
  ok("회원·비회원 권한을 새로 열어 주지 않았다",
    !/grant execute on function public\.tl_grant_diff/.test(code) &&
    !/grant[^\n]*to (anon|public)\b/i.test(code));
  ok("왜 이렇게 했는지 파일에 적어 둔다",
    /서버 자신으로 돌아갑니다/.test(raw) && /한 덩어리로 처리합니다/.test(raw),
    "설명이 없으면 다음 사람이 다시 풀어놓습니다");
}

/* =========================================================================
 * [5] 맨 마지막 명령이 대표님이 보실 표다
 * ========================================================================= */
section("[5] 대표님이 결과를 볼 수 있다");
{
  /* Supabase SQL Editor 는 명령이 여러 개면 "맨 마지막 것" 만 보여 줍니다.
     그래서 실행 결과가 중간에 있으면 대표님 눈에 아예 안 보입니다. */
  const last = stmts[stmts.length - 1] || "";
  ok("최상위 명령을 읽어냈다", stmts.length > 10, String(stmts.length) + "개");
  ok("맨 마지막 명령이 7절·8절 실행 결과를 보여 준다",
    /current_setting\('tl\.run_result'/.test(last),
    "마지막 명령: " + last.replace(/\s+/g, " ").slice(0, 120));
  ok("맨 마지막 명령이 트리거가 걸렸는지도 보여 준다",
    /trg_tl_on_trade_insert/.test(last));
  ok("맨 마지막 명령이 회원별 TL 도 보여 준다",
    /public\.tl_balance\(p\.id\)/.test(last));
  ok("맨 마지막 명령은 읽기만 한다",
    /^select\b/i.test(last.trim()) &&
    !/\b(insert|update|delete|drop|truncate|alter)\b/i.test(last));
  ok("결과가 성공인지 실패인지 글자로 나타난다",
    /✅/.test(runBlock) && /⚠/.test(runBlock));
}

/* =========================================================================
 * [6] 서버 상태 확인 파일은 읽기 전용 · 명령 한 개
 * ========================================================================= */
section("[6] 서버 상태 확인 파일");
{
  ok("supabase/" + PROBE_NAME + " 이 있다", fs.existsSync(PROBE));
  const p = fs.existsSync(PROBE) ? fs.readFileSync(PROBE, "utf8") : "";
  const pcode = strip(p);
  ok("맨 앞에 '읽기만 합니다' 라고 적혀 있다",
    /읽기만 합니다/.test(p.split("\n").slice(0, 12).join("\n")));
  ok("값을 바꾸는 문장이 하나도 없다",
    !/\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i.test(pcode),
    (pcode.match(/\b(insert|update|delete|drop|truncate|alter|create|grant|revoke)\b/i) || [""])[0]);
  const pstmts = topStatements(pcode);
  ok("명령이 딱 한 개다(Supabase 가 마지막 것만 보여 주기 때문)",
    pstmts.length === 1, String(pstmts.length) + "개");
  ["tl_earned", "tl_grant_diff", "tl_paid_total", "tl_balance",
    "trg_tl_on_trade_insert", "tl_transactions", "admin_users"].forEach((k) => {
      ok("무엇을 보는지에 " + k + " 이 들어 있다", pcode.indexOf(k) >= 0);
    });
  ok("실시간 지급 기록이 몇 줄인지 세어 보여 준다", /'realtime'/.test(pcode));
  ok("본 파일이 이 조사 파일로 안내한다", raw.indexOf(PROBE_NAME) > 0);
}

/* =========================================================================
 * [7] TL-밀린것채우기 는 봉인됐다 (전제가 틀린 파일)
 * ========================================================================= */
section("[7] TL-밀린것채우기 봉인");
{
  ok("파일이 기록으로 남아 있다(지우지 않았다)", fs.existsSync(OLD));
  const o = fs.existsSync(OLD) ? fs.readFileSync(OLD, "utf8") : "";
  const head = o.split("\n").slice(0, 30).join("\n");
  ok("맨 위 30줄 안에 실행 금지 표시가 있다",
    /⛔/.test(head) && /실행하지 마십시오/.test(head));
  ok("'쓰지 마시오 — 전제가 틀렸음' 이 적혀 있다",
    /쓰지 마시오/.test(head) && /전제가 틀렸습니다/.test(head));
  ok("어떤 파일을 대신 Run 해야 하는지 안내한다",
    /schema-tl-realtime\.sql/.test(head));

  /* 실수로 Run 해도 아무 일이 없어야 합니다 — 첫 명령이 바로 멈춥니다. */
  const ostmts = topStatements(strip(o));
  ok("맨 처음 명령이 바로 멈춘다",
    /raise exception/i.test(ostmts[0] || ""),
    "첫 명령: " + (ostmts[0] || "").replace(/\s+/g, " ").slice(0, 100));
  ok("멈추면서 왜 멈췄는지 알려 준다",
    /봉인/.test(ostmts[0] || "") && /schema-tl-realtime\.sql/.test(ostmts[0] || ""));
  ok("틀렸던 전제('2~6절은 성공했습니다')를 정정해 뒀다",
    /2~6절은 성공하지 않았습니다/.test(o));
  ok("원문을 통째로 날리지 않았다(왜 그런 판단을 했는지 남김)",
    o.length > 6000, String(o.length) + "자");
}

/* =========================================================================
 * [8] 자체 확인 — 일부러 틀리게 하면 잡히는가
 * ========================================================================= */
section("[8] 검사기 자체 확인");
{
  const 되돌림 = code + "\nselect public.tl_settle_all_past() as x;\n";
  ok("최상위 select 를 다시 넣으면 잡아낸다",
    /select\s+public\.tl_settle_all_past\s*\(/i.test(stripDollarBodies(되돌림)));
  const 잠금해제 = code.replace(/if not public\.am_i_admin\(\) then/g,
    "if auth.uid() is not null and not public.am_i_admin() then");
  ok("관리자 잠금을 풀면 잡아낸다",
    !/if not public\.am_i_admin\(\) then\s*raise exception 'not_admin'/.test(잠금해제));
  ok("빌린 자격을 영구로 두면 잡아낸다",
    !/,\s*true\s*\)$/.test("set_config('request.jwt.claims', x, false)"));
  ok("괄호가 안에 또 있어도 끝까지 잘라낸다(오탐 없음)",
    /,\s*true\s*\)$/.test("set_config('request.jwt.claims', json_build_object('sub', v)::text, true)"));
}

/* =========================================================================
 * [9] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다",
    pkg.indexOf("tests/tl-realtime-run.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
  ["tests/tl-realtime.test.js", "tests/tl-grant-formula-seal.test.js"].forEach((f) => {
    ok("겹침 담당 파일이 그대로 있다: " + f, fs.existsSync(path.join(REPO, f)));
  });
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
