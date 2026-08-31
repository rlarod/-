/* tests/chat-event-dedupe.test.js
 * =========================================================================
 * 거래 알림(청산 메시지)이 채팅에 두 번 들어가던 문제
 * =========================================================================
 *
 * 무슨 일이 있었나 (실측)
 *   유령 포지션 버그로 같은 청산 알림이 두 번 들어갔습니다.
 *     18:51  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
 *     09:44  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
 *   한 번 들어가면 모든 회원이 계속 봅니다. 지워지지 않습니다.
 *
 * 왜 막지 못했나
 *   chat_messages 에 unique 색인도, 중복 트리거도 없었고,
 *   거래 이벤트는 도배 검사(1.5초)마저 면제였습니다.
 *   => 거래 알림에 대한 서버 검사가 0개였습니다.
 *
 * 이 검사가 지키는 것
 *   1) 서버 방어(supabase/schema-chat-event-dedupe.sql)가 사라지지 않는다
 *   2) 오류를 내지 않고 조용히 무시한다  (오류 -> 화면이 무한 재시도)
 *   3) 사람이 쓴 채팅은 막지 않는다
 *   4) 영구 unique 를 걸지 않는다  (같은 문장이 정당하게 또 나올 수 있음)
 *   5) 기존 check_chat_message 4벌을 건드리지 않는다 (기능이 누적형이라
 *      덮어쓰면 앞 기능이 사라짐)
 *   6) 트리거 순서가 보장된다 (이름 알파벳 순)
 *   7) 브라우저가 보내는 값과 서버가 거르는 값이 같다
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = process.env.REPO || path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* 주석은 실행되지 않으므로, "실제로 도는 본문" 만 따로 만듭니다. */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}

const SQL_PATH = path.join(REPO, "supabase", "schema-chat-event-dedupe.sql");

section("거래 알림 중복 — 서버 방어");

ok("supabase/schema-chat-event-dedupe.sql 이 있다", fs.existsSync(SQL_PATH),
   "이 파일이 서버 방어의 전부입니다. 지우면 방어가 0 으로 돌아갑니다");

if (!fs.existsSync(SQL_PATH)) {
  console.log("통과 " + pass + " / 실패 " + fail);
  console.log("실패 있음");
  process.exit(1);
}

const RAW = fs.readFileSync(SQL_PATH, "utf8");
const SQL = strip(RAW);

/* ------------------------------------------------------------------ [1] */
section("[1] 어떻게 막는가 — 시간창 + 조용히 무시");

ok("chat_messages 의 INSERT 앞에서 검사한다",
   /before\s+insert\s+on\s+public\.chat_messages/i.test(SQL));

ok("같은 사람 + 같은 문장을 본다",
   /c\.user_id\s*=\s*new\.user_id/i.test(SQL) && /c\.message\s*=\s*new\.message/i.test(SQL),
   "user_id 와 message 를 둘 다 비교해야 합니다");

ok("시간창으로 자른다 (영구 비교가 아니다)",
   /interval\s+'24 hours'/i.test(SQL),
   "24시간 창이 없으면 정당한 재발생까지 영원히 막힙니다");

ok("창이 90초보다 훨씬 길다 (실제 사고가 15시간 차이였다)",
   !/interval\s+'\d+\s*(seconds?|minutes?)'/i.test(SQL),
   "초/분 단위 창으로는 이번 사고를 못 잡습니다");

ok("중복이면 오류를 내지 않고 조용히 무시한다",
   /return\s+null\s*;/i.test(SQL),
   "오류를 내면 화면이 '저장 실패' 로 보고 무한히 재시도합니다");

{
  /* 새로 만든 함수 본문 안에 raise 가 없어야 합니다. */
  const fn = SQL.match(/create\s+or\s+replace\s+function\s+public\.block_duplicate_trade_event[\s\S]*?\$\$\s*;/i);
  ok("새 트리거 함수 안에 raise exception 이 없다",
     !!fn && !/raise\s+exception/i.test(fn[0]),
     "예외를 던지면 무한 재시도로 이어집니다");
}

/* ------------------------------------------------------------------ [2] */
section("[2] 사람이 쓴 채팅은 안 막는다");

ok("거래 알림이 아니면 곧바로 통과시킨다",
   /coalesce\(new\.message_type,\s*'user'\)\s*<>\s*'trade_event'[\s\S]{0,80}return\s+new/i.test(SQL),
   "사람은 같은 말을 두 번 할 수 있고, 그건 막으면 안 됩니다");

ok("찾을 때도 거래 알림만 본다",
   /coalesce\(c\.message_type,\s*'user'\)\s*=\s*'trade_event'/i.test(SQL));

ok("message_type 조건 없이 message 만 비교하는 곳이 없다",
   (SQL.match(/message\s*=\s*new\.message/gi) || []).length === 1,
   "사람 채팅까지 걸리면 안 됩니다");

/* ------------------------------------------------------------------ [3] */
section("[3] 영구 unique 를 걸지 않는다");

ok("chat_messages 에 unique 색인을 만들지 않는다",
   !/create\s+unique\s+index/i.test(SQL),
   "잔고 10만 달러 + 100배면 손익이 항상 -142,857,143원 입니다. " +
   "회원이 진짜로 두 번 그럴 수 있어 영구 unique 는 안 됩니다");

ok("unique 제약도 추가하지 않는다",
   !/add\s+constraint[\s\S]{0,60}unique/i.test(SQL));

ok("검색용 색인은 부분 색인이라 아무것도 거부하지 않는다",
   /create\s+index\s+if\s+not\s+exists\s+idx_chat_trade_event_dup[\s\S]{0,160}where\s+message_type\s*=\s*'trade_event'/i.test(SQL));

/* ------------------------------------------------------------------ [4] */
section("[4] 기존 check_chat_message 를 건드리지 않는다");

ok("check_chat_message 를 다시 정의하지 않는다",
   !/create\s+(or\s+replace\s+)?function\s+(public\.)?check_chat_message/i.test(SQL),
   "4벌이 기능 누적형이라 덮어쓰면 앞 기능(관리자 잠금·금지어)이 사라집니다");

ok("기존 트리거 trg_check_chat_message 를 떼지 않는다",
   !/drop\s+trigger\s+if\s+exists\s+trg_check_chat_message/i.test(SQL),
   "떼면 도배 방지·금지어·관리자 잠금이 통째로 없어집니다");

ok("트리거를 새로 하나 더 단다",
   /create\s+trigger\s+trg_block_dup_trade_event/i.test(SQL));

{
  /* Postgres 는 같은 표의 BEFORE INSERT 트리거를 이름 알파벳 순으로 부릅니다.
     새 트리거가 기존 것보다 먼저 돌아야 판정이 선점되지 않습니다. */
  const m = SQL.match(/create\s+trigger\s+(trg_[a-z0-9_]+)/i);
  const 새이름 = m ? m[1].toLowerCase() : "";
  ok("새 트리거 이름이 trg_check_chat_message 보다 앞선다 (먼저 돈다)",
     !!새이름 && 새이름 < "trg_check_chat_message",
     "지금 이름: " + 새이름);
  ok("새 트리거 이름이 trg_set_chat_nickname 보다 앞선다",
     !!새이름 && 새이름 < "trg_set_chat_nickname",
     "지금 이름: " + 새이름);
}

{
  /* 기존 4벌의 "거래 이벤트 면제" 가 사라지지 않았는지 같이 봅니다.
     면제가 없어지면 청산 알림이 도배 제한에 걸려 조용히 사라집니다. */
  const 면제파일 = [
    "schema-trade-events-chat.sql",
    "schema-chat-event-exempt.sql",
    "schema-admin-chat.sql"
  ];
  면제파일.forEach(function (f) {
    const p = path.join(REPO, "supabase", f);
    const body = fs.existsSync(p) ? strip(fs.readFileSync(p, "utf8")) : "";
    ok(f + " 의 거래 이벤트 면제가 살아 있다",
       /'trade_event'[\s\S]{0,120}return\s+new/i.test(body),
       "면제가 없어지면 청산 알림이 도배 제한에 막혀 사라집니다");
  });

  /* 관리자 잠금은 admin-chat 판에만 있는 기능입니다. 사라지면 안 됩니다. */
  const admin = path.join(REPO, "supabase", "schema-admin-chat.sql");
  ok("schema-admin-chat.sql 의 채팅방 잠금 검사가 남아 있다",
     fs.existsSync(admin) && /is_chat_locked\(\)[\s\S]{0,80}chat_locked/i.test(strip(fs.readFileSync(admin, "utf8"))));
}

/* ------------------------------------------------------------------ [5] */
section("[5] 회원 데이터를 건드리지 않는다");

ok("DELETE 가 한 줄도 없다", !/\bdelete\b/i.test(SQL),
   "이미 들어간 줄을 지우는 것은 이 파일의 일이 아닙니다");
ok("UPDATE 가 한 줄도 없다", !/\bupdate\b/i.test(SQL));
ok("TRUNCATE / DROP TABLE 이 없다",
   !/\btruncate\b/i.test(SQL) && !/drop\s+table/i.test(SQL));

/* ------------------------------------------------------------------ [6] */
section("[6] 여러 번 실행해도 안전하다");

ok("칸 추가가 if not exists 다",
   /add\s+column\s+if\s+not\s+exists\s+message_type/i.test(SQL));
ok("색인이 if not exists 다", /create\s+index\s+if\s+not\s+exists/i.test(SQL));
ok("함수가 create or replace 다", /create\s+or\s+replace\s+function/i.test(SQL));
ok("트리거를 붙이기 전에 같은 이름을 떼어 둔다",
   /drop\s+trigger\s+if\s+exists\s+trg_block_dup_trade_event/i.test(SQL));

/* ------------------------------------------------------------------ [7] */
section("[7] 브라우저가 보내는 값과 서버가 거르는 값이 같다");

{
  const CLIENT = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");
  ok("브라우저가 message_type 을 trade_event 로 보낸다",
     /message_type:\s*"trade_event"/.test(CLIENT),
     "여기가 바뀌면 서버 필터가 헛돕니다");
  ok("브라우저가 message 를 통째로 만들어 보낸다",
     /message,/.test(CLIENT) && /buildMessage\(/.test(CLIENT));
}

/* ------------------------------------------------------------------ [8] */
section("[8] 되돌릴 수 있다");

ok("되돌리는 방법이 파일 안에 적혀 있다", /되돌리는 방법/.test(RAW));
ok("되돌리기 문장 3개가 다 적혀 있다",
   /drop\s+trigger\s+if\s+exists\s+trg_block_dup_trade_event/i.test(RAW) &&
   /drop\s+function\s+if\s+exists\s+public\.block_duplicate_trade_event/i.test(RAW) &&
   /drop\s+index\s+if\s+exists\s+public\.idx_chat_trade_event_dup/i.test(RAW));
ok("되돌리기 문장은 주석 안에 있다 (실수로 실행되지 않는다)",
   !/drop\s+function\s+if\s+exists\s+public\.block_duplicate_trade_event/i.test(SQL));

/* ------------------------------------------------------------------ [9] */
section("[9] 수정 금지 파일을 건드리지 않았다");

{
  const 기준 = {
    "js/chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "js/trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
    "js/supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8"
  };
  Object.keys(기준).forEach(function (f) {
    const md5 = crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, f)))
      .digest("hex");
    ok(f + " 를 건드리지 않았다", md5 === 기준[f], md5);
  });
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음"); process.exit(1); }
console.log("전체 통과");
process.exit(0);
