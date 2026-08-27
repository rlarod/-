/* tests/chat-dedupe-sql-safety.test.js
 * =========================================================================
 * 채팅 중복 정리 SQL 이 "지우면 안 되는 것" 을 안 지키게 못박습니다 — 2026-08-26
 * =========================================================================
 *
 * 대상: supabase/채팅중복정리-2026-08-26.sql
 *
 * 이 SQL 은 대표님이 SQL Editor 에서 직접 Run 합니다. 한 번 Run 하면
 * 되돌리기가 어렵기 때문에(사본 표가 있어야만 됩니다), 파일이 나중에
 * 누구 손에 고쳐졌을 때 아래가 깨지지 않는지 검사로 붙잡아 둡니다.
 *
 *   · WHERE 없는 DELETE 가 들어가지 않았는가
 *   · 사람이 쓴 채팅을 지우지 않는가 (message_type = 'trade_event' 만)
 *   · 채팅 말고 다른 표(trades·trading_accounts·tl_transactions·profiles 등)를
 *     바꾸지 않는가
 *   · 지우기 전에 사본을 먼저 남기는가
 *   · 여러 번 Run 해도 안전한가
 *   · 되살릴 수 없다는 경고가 파일 맨 위에 있는가
 *
 * ⚠ 이 검사는 파일을 읽기만 합니다. 서버에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SQL_REL = "supabase/채팅중복정리-2026-08-26.sql";

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

console.log("\n채팅 중복 정리 SQL — 안전 규칙");

const raw = read(SQL_REL);
/* 주석(-- ...)을 걷어낸 "실제로 실행되는 본문".
   설명글에 delete 라고 적혀 있어도 오탐이 나지 않게 합니다. */
const body = raw.replace(/^\s*--.*$/gm, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const lower = body.toLowerCase();

const BACKUP = "chat_event_dedupe_backup_20260826";

/* =========================================================================
 * [1] 지우는 문장이 안전한가
 * ========================================================================= */
section("[1] DELETE 안전");
{
  const deletes = lower.match(/\bdelete\s+from\b/g) || [];
  ok("DELETE 는 딱 한 군데다", deletes.length === 1, String(deletes.length));

  /* delete 문 하나를 통째로 떼어 봅니다(다음 세미콜론까지). */
  const i = lower.indexOf("delete from");
  const stmt = i >= 0 ? lower.slice(i, lower.indexOf(";", i) + 1) : "";
  ok("DELETE 에 WHERE 가 붙어 있다", /\bwhere\b/.test(stmt), stmt.slice(0, 80));
  ok("지우는 표는 chat_messages 하나뿐이다",
    /delete\s+from\s+public\.chat_messages\b/.test(stmt), stmt.slice(0, 80));
  ok("사본 표에 들어 있는 줄만 지운다", stmt.indexOf(BACKUP) !== -1);
  ok("거래 알림만 지운다(사람 채팅 제외)",
    stmt.indexOf("'trade_event'") !== -1 && stmt.indexOf("message_type") !== -1);
  ok("id 가 정확히 일치하는 줄만 지운다", /c\.id\s*=\s*b\.id/.test(stmt));
}

/* =========================================================================
 * [2] 다른 표를 건드리지 않는가
 * ========================================================================= */
section("[2] 다른 표 무수정");
{
  const 금지표 = ["trades", "trading_accounts", "tl_transactions", "profiles",
    "positions", "orders", "user_items", "tl_market_products", "auth.users"];
  const 바꾸는문장 = lower.match(/\b(delete\s+from|update|insert\s+into|truncate|drop\s+table|alter\s+table)\s+[a-z0-9_."]+/g) || [];

  금지표.forEach(function (t) {
    const hit = 바꾸는문장.filter(function (s) {
      return new RegExp("\\b" + t.replace(".", "\\.") + "\\b").test(s);
    });
    ok(t + " 를 바꾸는 문장이 없다", hit.length === 0, hit.join(" | "));
  });

  ok("바꾸는 문장은 chat_messages 와 사본 표에만 있다",
    바꾸는문장.every(function (s) { return /chat_messages/.test(s) || s.indexOf(BACKUP) !== -1; }),
    바꾸는문장.join(" | "));

  ok("TRUNCATE 가 없다", !/\btruncate\b/.test(lower));
  ok("chat_messages 를 DROP 하지 않는다", !/drop\s+table[^;]*chat_messages/.test(lower));
}

/* =========================================================================
 * [3] 지우기 전에 사본을 먼저 남기는가
 * ========================================================================= */
section("[3] 사본 먼저");
{
  const iCreate = lower.indexOf("create table if not exists public." + BACKUP);
  const iInsert = lower.indexOf("insert into public." + BACKUP);
  const iDelete = lower.indexOf("delete from");
  ok("사본 표를 만든다", iCreate >= 0);
  ok("사본 표에 옮겨 담는다", iInsert >= 0);
  ok("사본에 담는 것이 지우는 것보다 먼저다", iCreate >= 0 && iInsert > iCreate && iDelete > iInsert,
    iCreate + " / " + iInsert + " / " + iDelete);
  ok("사본 표는 화면(API)에서 안 보이게 RLS 를 켠다",
    new RegExp("alter\\s+table\\s+public\\." + BACKUP + "\\s+enable\\s+row\\s+level\\s+security").test(lower));
}

/* =========================================================================
 * [4] 여러 번 Run 해도 안전한가
 * ========================================================================= */
section("[4] 여러 번 Run 안전");
{
  ok("표 만들기가 if not exists 다", /create\s+table\s+if\s+not\s+exists/.test(lower));
  ok("사본 넣기가 on conflict do nothing 이다", /on\s+conflict\s*\(\s*id\s*\)\s*do\s+nothing/.test(lower));
}

/* =========================================================================
 * [5] 트리거와 같은 기준(24시간)을 쓰는가
 *     기준이 다르면, 트리거가 통과시킨 줄을 이 파일이 나중에 지워버립니다.
 * ========================================================================= */
section("[5] 트리거와 같은 24시간 기준");
{
  const trg = read("supabase/schema-chat-event-dedupe.sql");
  ok("트리거가 24시간 창을 쓴다", /interval\s+'24 hours'/.test(trg));
  ok("정리 SQL 도 24시간 창을 쓴다", /interval\s+'24 hours'/.test(lower));
  ok("정리 SQL 에 24시간 말고 다른 창이 섞여 있지 않다",
    (lower.match(/interval\s+'[^']+'/g) || []).every(function (s) { return /24 hours/.test(s); }),
    (lower.match(/interval\s+'[^']+'/g) || []).join(","));
}

/* =========================================================================
 * [6] 대표님이 읽을 경고가 맨 위에 있는가
 * ========================================================================= */
section("[6] 경고 문구");
{
  const 첫머리 = raw.split(/\r?\n/).slice(0, 20).join("\n");
  ok("'되살릴 수 없' 경고가 파일 맨 위 20줄 안에 있다", /되살릴 수 없/.test(첫머리),
    첫머리.slice(0, 60));
  ok("사본 표 이름이 맨 위에 적혀 있다", 첫머리.indexOf(BACKUP) !== -1);
  ok("되돌리는 방법이 파일 안에 적혀 있다", /되돌리는 방법/.test(raw));
  ok("되살릴 때 트리거를 꺼야 한다는 안내가 있다",
    /disable\s+trigger\s+trg_block_dup_trade_event/.test(raw));
}

/* =========================================================================
 * [7] npm test 목록 등록
 * ========================================================================= */
section("[7] 테스트 등록");
{
  const pkg = read("package.json");
  ok("package.json 의 test 목록에 이 파일이 있다",
    pkg.indexOf("tests/chat-dedupe-sql-safety.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
