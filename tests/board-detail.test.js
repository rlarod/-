/* tests/board-detail.test.js
 * 게시판 상세 기능(수정·삭제·추천·신고)이 안전한지 검증합니다.
 *
 * 발견했던 문제
 *   신고 기능은 잘 만들어져 있는데 읽기 정책이 '본인이 낸 신고만' 이라
 *   관리자도 남의 신고를 볼 수 없었습니다.
 *   사용자가 신고해도 아무도 알 수 없어 조치가 불가능했습니다.
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
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const board = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-board.sql"), "utf8"));
const admin = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-report-admin.sql"), "utf8"));
const js = fs.readFileSync(path.join(REPO, "js", "board.js"), "utf8");

console.log("\n게시판 상세");

/* ---------- 남의 글을 못 건드리는가 ---------- */
{
  ok("수정은 본인 글만", /posts_update_own[\s\S]{0,140}auth\.uid\(\) = user_id/.test(board));
  ok("삭제는 본인 글만", /posts_delete_own[\s\S]{0,140}auth\.uid\(\) = user_id/.test(board));
  ok("댓글 삭제도 본인 것만", /comments_delete_own[\s\S]{0,140}auth\.uid\(\) = user_id/.test(board));

  /* 클라이언트는 소유자 검사를 안 하지만 서버가 막습니다. */
  ok("클라이언트는 서버 판정에 맡긴다", /from\("posts"\)\.delete\(\)\.eq\("id", postId\)/.test(js));
}

/* ---------- 글을 지우면 딸린 것도 정리되는가 ---------- */
{
  const cascades = (board.match(/references public\.posts\(id\) on delete cascade/g) || []).length;
  ok("댓글·추천·신고가 함께 정리된다(cascade 3개 이상)", cascades >= 3, String(cascades));
  ok("댓글을 지우면 댓글 신고도 정리된다", /references public\.post_comments\(id\) on delete cascade/.test(board));
}

/* ---------- 추천 ---------- */
{
  ok("한 사람이 한 글에 한 표", /unique \(post_id, user_id\)/.test(board));
  ok("추천은 본인 것만 만들고 지운다", /votes_all_own[\s\S]{0,160}auth\.uid\(\) = user_id/.test(board));
  ok("추천 취소도 지원한다", /voteType: "LIKE" \| "DISLIKE" \| null\(취소\)/.test(js));
}

/* ---------- 신고 ---------- */
{
  ok("신고도 1인 1회", /create table if not exists public\.post_reports[\s\S]{0,400}unique \(post_id, user_id\)/.test(board));
  ok("신고는 본인만 남길 수 있다", /post_reports_insert_own[\s\S]{0,140}auth\.uid\(\) = user_id/.test(board));

  /* 이번에 고친 부분 */
  ok("관리자는 전체 신고를 볼 수 있다",
     /post_reports_select_admin[\s\S]{0,200}admin_users a where a\.user_id = auth\.uid\(\)/.test(admin));
  ok("댓글 신고도 관리자가 볼 수 있다",
     /comment_reports_select_admin[\s\S]{0,200}admin_users a where a\.user_id = auth\.uid\(\)/.test(admin));
  ok("신고 모아 보기 함수가 있다", /function public\.get_reported_posts/.test(admin));
  ok("댓글 신고 모아 보기도 있다", /function public\.get_reported_comments/.test(admin));
  ok("신고 횟수가 많은 순으로 보여준다", /order by count\(\*\) desc/.test(admin));
  ok("함수 안에서도 관리자를 확인한다",
     (admin.match(/admin_users a where a\.user_id = auth\.uid\(\)/g) || []).length >= 4);

  /* 일반 사용자 보호 */
  ok("본인 신고를 보는 기존 정책은 그대로", /post_reports_select_own/.test(board));
  ok("신고를 수정·삭제하는 정책은 만들지 않는다",
     !/post_reports[\s\S]{0,60}for (update|delete)/.test(admin));
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(admin));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
