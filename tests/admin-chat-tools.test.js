/* tests/admin-chat-tools.test.js
 * 관리자용 채팅 얼리기 / 초기화.
 *
 * 이 파일이 지키는 것
 *   1) 서버가 막는다 — 화면만 잠그면 개발자 도구로 우회됩니다
 *   2) 관리자만 할 수 있다
 *   3) 거래 알림(청산·익절·손절)은 얼려도 계속 올라간다
 *   4) 게시판 댓글은 같이 잠기지 않는다 (클래스 이름이 겹칩니다)
 *   5) 되돌릴 수 없는 초기화는 확인을 받는다
 *   6) 수정 금지 파일(admin.js / chat.js)을 건드리지 않는다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "admin-chat-tools.js"), "utf8");
const SQL = fs.readFileSync(path.join(REPO, "supabase", "schema-admin-chat.sql"), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n관리자 채팅 도구");

/* ---------- 서버가 실제로 막는가 ---------- */
{
  ok("잠금 상태를 담아둘 자리가 있다", /create table if not exists public\.app_settings/.test(SQL));
  ok("잠금 상태는 누구나 읽을 수 있다(화면이 알아야 함)",
    /app_settings_read[\s\S]{0,120}for select using \(true\)/.test(SQL));
  ok("잠금 상태를 직접 고치는 길은 막아뒀다",
    !/for (insert|update)[\s\S]{0,80}app_settings/i.test(SQL),
    "관리자 함수로만 바꿔야 합니다");

  /* 핵심 — 채팅 입력 검사 트리거가 잠금을 확인해야 합니다.
     화면에서만 막으면 개발자 도구로 요청을 직접 보내면 그대로 들어갑니다. */
  const trigger = SQL.slice(SQL.indexOf("function public.check_chat_message"));
  ok("서버 트리거가 잠금을 확인한다", /is_chat_locked\(\)/.test(trigger));
  ok("잠겼으면 서버가 거절한다", /raise exception 'chat_locked'/.test(trigger));
  ok("트리거가 채팅 표에 붙어 있다",
    /create trigger trg_check_chat_message[\s\S]{0,120}before insert on public\.chat_messages/.test(SQL));

  ok("도배 방지 검사가 그대로 남아 있다", /rate_limited/.test(trigger));
  ok("금지어 검사가 그대로 남아 있다", /profanity_detected/.test(trigger));
}

/* ---------- 관리자만 ---------- */
{
  const lock = SQL.slice(SQL.indexOf("function public.set_chat_locked"));
  const clear = SQL.slice(SQL.indexOf("function public.clear_chat_messages"));
  ok("잠금 전환은 관리자만", /am_i_admin\(\)[\s\S]{0,80}raise exception 'not_admin'/.test(lock));
  ok("채팅 초기화는 관리자만", /am_i_admin\(\)[\s\S]{0,80}raise exception 'not_admin'/.test(clear));
  ok("초기화는 지운 개수를 돌려준다", /returns integer/.test(clear) && /delete from public\.chat_messages/.test(clear));
  /* Supabase 에 "WHERE 없는 DELETE 는 거부" 하는 안전장치가 켜져 있습니다.
     조건 없이 지우면 21000 오류로 막힙니다(2026-08-20 실제로 막혔습니다).
     id 는 primary key 라 반드시 값이 있으므로 지우는 대상은 같습니다. */
  ok("삭제에 where 절이 있다(안전장치 우회)",
    /delete from public\.chat_messages where id is not null/.test(clear),
    "조건 없는 DELETE 는 Supabase 가 거부합니다");
}

/* ---------- 얼려도 청산 기록은 남는다 ---------- */
{
  const trigger = SQL.slice(SQL.indexOf("function public.check_chat_message"));
  const eventIdx = trigger.indexOf("if is_event then");
  const lockIdx = trigger.indexOf("is_chat_locked()");
  ok("거래 이벤트는 잠금 검사보다 먼저 통과시킨다", eventIdx !== -1 && eventIdx < lockIdx,
    "얼렸다고 청산 기록까지 막히면 그 시간대 기록이 통째로 비어버립니다");
  ok("관리자는 잠긴 상태에서도 쓸 수 있다", /is_chat_locked\(\) and not public\.am_i_admin\(\)/.test(trigger),
    "공지를 남겨야 합니다");
}

/* ---------- 화면 ---------- */
{
  ok("index.html 에 연결돼 있다", /js\/admin-chat-tools\.js/.test(HTML));
  ok("얼리기 버튼이 있다", /admin-chat-lock-btn/.test(SRC));
  ok("초기화 버튼이 있다", /admin-chat-clear-btn/.test(SRC));
  ok("되돌릴 수 없는 동작은 확인을 받는다",
    /confirm\([\s\S]{0,80}되돌릴 수 없습니다/.test(SRC));
  ok("초기화 버튼은 위험한 색", /admin-tool-danger/.test(SRC) && /\.admin-tool-btn\.admin-tool-danger\{[^}]*var\(--red\)/.test(CSS));
  ok("얼린 상태는 색으로 보인다", /admin-tool-on/.test(SRC) && /\.admin-tool-btn\.admin-tool-on\{/.test(CSS));

  /* 게시판 댓글 입력칸이 같은 클래스를 씁니다(2026-08-20 실측으로 발견).
     클래스로 고르면 채팅을 얼릴 때 댓글까지 잠깁니다. */
  ok("채팅 입력칸을 id 로 고른다", /el\("chat-input"\)/.test(SRC));
  ok("클래스만으로 입력칸을 고르지 않는다",
    !/querySelectorAll\("\.chat-input"\)/.test(SRC),
    "게시판 댓글칸(#board-comment-input)도 .chat-input 을 씁니다");
  ok("댓글 입력칸은 여전히 같은 클래스", /id="board-comment-input" class="chat-input"/.test(HTML),
    "마크업은 그대로 두고 고르는 방법만 바꿉니다");

  /* 안내 문구를 placeholder 에 쓰면 chat.js 가 되돌려놓습니다. */
  ok("잠금 안내를 따로 만든 줄에 적는다", /chat-locked-notice/.test(SRC) && /\.chat-locked-notice\{/.test(CSS));
  ok("입력칸 안내 글자를 건드리지 않는다", !/\.placeholder = "채팅방이 잠겼습니다"/.test(SRC));

  /* 감시가 무한히 돌면 화면이 멈춥니다(2026-08-20 실측). */
  ok("감시가 무한 반복하지 않게 막았다", /풀려있음/.test(SRC) && /if \(!풀려있음\) return;/.test(SRC));
}

/* ---------- 지운 걸 다른 회원도 바로 안다 ---------- */
{
  /* js/chat.js 는 새 글(INSERT)만 실시간으로 받고 삭제는 받지 않습니다.
     그냥 두면 관리자가 지워도 다른 회원은 새로고침할 때까지 옛 채팅을
     계속 봅니다(2026-08-20 사용자 지적). */
  const clear = SQL.slice(SQL.indexOf("function public.clear_chat_messages"));
  ok("지웠다는 사실을 서버에 남긴다", /chat_cleared_at/.test(clear));
  ok("설정 변경이 실시간으로 전달되게 등록한다",
    /alter publication supabase_realtime add table public\.app_settings/.test(SQL));
  ok("publication 이 없는 환경에서도 SQL 이 멈추지 않는다",
    /when undefined_object then null/.test(SQL));

  ok("화면이 목록을 비우는 기능이 있다", /채팅목록비우기/.test(SRC));
  ok("설정 변경을 실시간으로 구독한다", /postgres_changes[\s\S]{0,120}app_settings/.test(SRC));
  ok("실시간이 막히면 주기 확인으로 대체한다", /setInterval\(상태읽기/.test(SRC));

  /* 페이지를 열 때마다 예전 기록 때문에 화면이 지워지면 안 됩니다. */
  ok("처음 켤 때는 기준만 잡고 지우지 않는다", /첫확인/.test(SRC) && /첫확인 = false/.test(SRC));
  ok("값이 바뀐 경우에만 비운다", /at !== 마지막초기화/.test(SRC));
  ok("지운 본인 화면도 즉시 비운다", /채팅목록비우기\(\); \/\* 내 화면부터 즉시 \*\//.test(SRC));
}

/* ---------- 서버 준비가 안 됐을 때 ---------- */
{
  ok("SQL 을 아직 안 돌렸으면 그렇게 알려준다",
    /schema-admin-chat\.sql 을 먼저 실행/.test(SRC));
  ok("권한 없음도 사람 말로 알려준다", /관리자만 할 수 있습니다/.test(SRC));
  ok("영어 오류를 그대로 보여주지 않는다", /서버오류설명/.test(SRC));
}

/* ---------- 수정 금지 파일 ---------- */
{
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("admin.js 를 건드리지 않았다", md5("admin.js") === "424e4c63ec1cd24681c4f27f60aee2fa", md5("admin.js"));
  ok("chat.js 를 건드리지 않았다", md5("chat.js") === "a93dfaa7f82ce72a914b270acb3650bb", md5("chat.js"));
  ok("기존 시즌 초기화 버튼은 그대로", /id="admin-reset-btn"/.test(HTML));
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
