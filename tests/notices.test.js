/* tests/notices.test.js
 * 공지사항.
 *
 * 왜 고쳤나 (2026-08-25 대표 지적)
 *   "우리 공지 안 띄웠는데 공지 올라와 있다"
 *   화면의 공지 4줄이 js/notice-board.js 코드에 박혀 있었습니다.
 *   관리자가 쓴 게 아니라서 대표가 바꿀 수 없었고, 공지 하나 올리려면
 *   개발자가 코드를 고쳐야 했습니다.
 *
 * 이제 서버 표에서 읽고 관리자 창에서 쓰고 지웁니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SQL = fs.readFileSync(path.join(REPO, "supabase", "schema-notices.sql"), "utf8");
const BOARD = fs.readFileSync(path.join(REPO, "js", "notice-board.js"), "utf8");
const ADMIN = fs.readFileSync(path.join(REPO, "js", "admin-notice.js"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

console.log("\n공지사항");

/* ---------- 코드에 박아두지 않는다 ---------- */
{
  ok("공지 문구가 코드에 박혀 있지 않다", !/STATIC_NOTICES/.test(BOARD),
    "예전에는 여기 4줄이 박혀 있어 대표가 바꿀 수 없었습니다");
  ok("서버에서 읽어온다", /rpc\("get_notices"/.test(BOARD));

  /* 서버를 못 읽을 때 화면이 비면 "고장난 사이트" 로 보입니다. */
  ok("서버를 못 읽으면 기본 문구를 보여준다", /FALLBACK_NOTICES/.test(BOARD));
  ok("공지가 하나도 없어도 화면이 비지 않는다",
    /if \(rows\.length\)/.test(BOARD),
    "관리자가 전부 지웠을 때를 대비합니다");
}

/* ---------- 서버 ---------- */
{
  ok("공지 표가 있다", /create table if not exists public\.notices/.test(SQL));
  ok("종류를 정해둔 값으로만 받는다", /check \(kind in \('공지','안내','점검','이벤트'\)\)/.test(SQL));
  ok("빈 제목을 막는다", /char_length\(title\) between 1 and 200/.test(SQL));
  ok("고정과 숨김을 쓸 수 있다", /pinned\s+boolean/.test(SQL) && /visible\s+boolean/.test(SQL));

  ok("누구나 읽을 수 있다", /notices_read[\s\S]{0,120}for select using \(visible = true\)/.test(SQL));
  ok("숨긴 공지는 안 보인다", /where n\.visible = true/.test(SQL));

  /* 화면에서 버튼만 막으면 개발자 도구로 우회됩니다. */
  ["add_notice", "delete_notice", "hide_notice"].forEach((fn) => {
    const body = SQL.slice(SQL.indexOf("function public." + fn));
    ok(fn + " 는 관리자만",
      /admin_users where user_id = auth\.uid\(\)[\s\S]{0,120}raise exception 'not_admin'/.test(body));
  });

  /* Supabase 는 WHERE 없는 DELETE 를 거부합니다. */
  ok("삭제에 조건이 있다", /delete from public\.notices where id = p_id/.test(SQL));

  ok("기존 4줄을 표로 옮긴다", /where not exists \(select 1 from public\.notices\)/.test(SQL),
    "여러 번 실행해도 중복으로 안 들어갑니다");
  ok("실시간 전달 대상에 등록한다",
    /alter publication supabase_realtime add table public\.notices/.test(SQL));
  ok("publication 이 없는 환경에서도 멈추지 않는다", /when undefined_object then null/.test(SQL));
}

/* ---------- 관리자 화면 ---------- */
{
  ok("index.html 에 연결돼 있다", /js\/admin-notice\.js/.test(HTML));
  ok("관리자 창 안에만 만든다", /admin-panel/.test(ADMIN));
  ok("공지를 올릴 수 있다", /rpc\("add_notice"/.test(ADMIN));
  ok("공지를 지울 수 있다", /rpc\("delete_notice"/.test(ADMIN));
  ok("지우기는 확인을 받는다", /confirm\([\s\S]{0,60}되돌릴 수 없습니다/.test(ADMIN));
  ok("올린 뒤 화면 공지도 갱신한다", /App\.NoticeBoard\.loadNotices/.test(ADMIN));
  ok("종류를 고를 수 있다", /admin-notice-kind/.test(ADMIN) && /\.admin-notice-kind\{/.test(CSS));

  ok("SQL 을 안 돌렸으면 그렇게 알려준다", /schema-notices\.sql 을 먼저 실행/.test(ADMIN));
  ok("모르는 오류를 감추지 않는다", /실패했습니다: /.test(ADMIN),
    "감추면 원인을 찾을 방법이 없습니다");
  ok("입력한 글자를 그대로 넣지 않는다", /escapeHtml/.test(ADMIN),
    "공지에 태그를 넣어 화면을 망가뜨릴 수 있습니다");
}

/* ---------- 회원 화면에 바로 반영 ---------- */
{
  ok("공지 변경을 실시간으로 받는다",
    /postgres_changes[\s\S]{0,120}table: "notices"/.test(BOARD));
  ok("실시간이 막히면 주기 확인으로 대체한다", /setInterval\(loadNotices/.test(BOARD));
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
