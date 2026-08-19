/* tests/chat-safety.test.js
 * 채팅 도배 방지·금지어·길이 제한, 그리고 거래 이벤트 예외 처리 검증.
 *
 * 배경
 *   도배 방지 트리거가 chat_messages 의 모든 행에 1.5초 간격을 걸었는데,
 *   청산 알림(거래 이벤트)도 같은 테이블에 들어갑니다.
 *   그래서 빠른 매매 때 알림이 조용히 사라졌습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const chatJs = fs.readFileSync(path.join(REPO, "js", "chat.js"), "utf8");
const eventJs = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");
const schema = strip(fs.readFileSync(path.join(REPO, "supabase", "schema.sql"), "utf8"));
const exempt = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-chat-event-exempt.sql"), "utf8"));

console.log("\n채팅 안전장치");

/* ---------- 길이 제한 ---------- */
{
  ok("입력칸에 200자 제한", /id="chat-input"[^>]*maxlength="200"/.test(html));
  ok("화면에서도 길이를 검사", /MAX_MESSAGE_LEN/.test(chatJs));
  ok("서버가 길이를 강제한다", /char_length\(message\) <= 200 and char_length\(message\) > 0/.test(schema));
  ok("빈 메시지도 서버에서 막힌다", /char_length\(message\) > 0/.test(schema));
}

/* ---------- 도배 방지 ---------- */
{
  ok("화면에서 연속 전송을 막는다", /MIN_SEND_INTERVAL_MS/.test(chatJs));
  ok("서버 트리거가 진짜 강제력", /raise exception 'rate_limited'/.test(exempt));
  ok("간격은 1.5초 그대로(느슨해지지 않음)", /interval '1\.5 seconds'/.test(exempt));
  ok("화면 검사만 믿지 않는다(주석에 명시)", /진짜 강제력은 서버 트리거/.test(chatJs));
}

/* ---------- 금지어 ---------- */
{
  ok("화면에서 금지어를 거른다", /containsBannedWord/.test(chatJs));
  ok("서버도 금지어를 거른다", /raise exception 'profanity_detected'/.test(exempt));
  ok("금지어 목록이 비어 있지 않다", /banned_words text\[\] := array\['[^\]]+\]/.test(exempt));
}

/* ---------- 거래 이벤트 예외 (이번에 고친 부분) ---------- */
{
  ok("거래 이벤트는 도배·금지어 검사를 건너뛴다",
     /is_event := coalesce\(new\.message_type, 'chat'\) = 'trade_event'/.test(exempt) &&
     /if is_event then\s*\n\s*return new;/.test(exempt));
  ok("사람 채팅 간격을 잴 때 거래 이벤트는 세지 않는다",
     /coalesce\(message_type, 'chat'\) <> 'trade_event'/.test(exempt));
  ok("트리거를 다시 붙인다", /create trigger trg_check_chat_message/.test(exempt));
  ok("테이블·정책은 건드리지 않는다",
     !/create table|drop table|truncate|create policy/i.test(exempt));

  /* SQL 을 아직 안 돌린 서버 대비 */
  ok("도배 제한에 막히면 한 번 재시도한다", /rate_limited/.test(eventJs) && /setTimeout\(r, 1700\)/.test(eventJs));
  ok("막힌 이유를 콘솔에 알려준다", /schema-chat-event-exempt\.sql 실행 필요/.test(eventJs));
  ok("거래 이벤트는 message_type 으로 구분해 보낸다", /message_type: "trade_event"/.test(eventJs));
}

/* ---------- 재연결 안내가 깜빡이지 않는가 ---------- */
{
  /* 연결이 자주 끊겼다 붙으면 빨간 안내가 켜졌다 꺼졌다를 반복해
     화면이 계속 깜빡였습니다. 실제로는 곧 복구되는데도 사용자는
     크게 잘못된 줄 압니다. */
  const calm = fs.readFileSync(path.join(REPO, "js", "chat-status-calm.js"), "utf8");
  const cssC = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

  ok("바로 띄우지 않고 잠깐 기다린다", /HOLD_MS = 3000/.test(calm));
  ok("재연결 안내만 골라낸다", /실시간 연결이 끊겼습니다/.test(calm));
  ok("한 번 띄우면 껐다 켜지 않는다", /if \(showing\)/.test(calm));
  ok("글자를 지우지 않고 화면에서만 감춘다", /chat-err-hold/.test(calm) && /visibility:hidden/.test(cssC));
  ok("복구 중은 빨강 대신 흐린 색", /\.chat-err\.chat-err-calm\{[\s\S]{0,80}var\(--text-faint\)/.test(cssC));
  ok("진짜 오류는 손대지 않는다", /if \(!isReconnectMsg\(text\)\)/.test(calm));
  ok("chat.js 는 건드리지 않았다", !/ChatStatusCalm/.test(chatJs));
  ok("스크립트가 연결됐다", /js\/chat-status-calm\.js/.test(html));
}

/* ---------- 권한 ---------- */
{
  ok("남의 이름으로 못 보낸다", /chat_insert_own[\s\S]{0,120}auth\.uid\(\) = user_id/.test(schema));
  ok("자기 글만 지울 수 있다", /chat_delete_own/.test(schema));
  ok("비회원은 읽기만(전송은 로그인 필요)",
     /chat-send-btn/.test(fs.readFileSync(path.join(REPO, "js", "login-required.js"), "utf8")));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
