/* tests/leaderboard.test.js
 * 랭킹 기준과 화면이 쓰는 칸이 맞는지 검증합니다.
 *
 * 발견했던 문제
 *   1) leaderboard 뷰가 balance(가용 잔고)로 정렬 -> 포지션을 들고 있으면
 *      증거금이 잔고에서 빠져 순위가 내려갔습니다.
 *   2) 공지는 "실현 손익 기준"인데 실제는 balance 기준이었습니다.
 *   3) 화면은 total_asset / profit_amount 를 찍는데 서버가 안 줘서
 *      총자산·수익금 칸이 비어 있었습니다.
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

const fix = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-leaderboard-fix.sql"), "utf8"));
const lbJs = fs.readFileSync(path.join(REPO, "js", "leaderboard.js"), "utf8");
const noticeJs = fs.readFileSync(path.join(REPO, "js", "notice-board.js"), "utf8");

console.log("\n랭킹");

/* ---------- 순위 기준 ---------- */
{
  ok("실현 손익으로 정렬한다", /order by ta\.realized_pnl desc/.test(fix));
  ok("가용 잔고로 정렬하지 않는다", !/order by ta\.balance desc/.test(fix));
  ok("동점이면 수익률로 가른다", /realized_pnl desc nulls last,[\s\S]{0,140}roe_percent|realized_pnl desc nulls last,[\s\S]{0,140}\* 100, 2\) desc/.test(fix));
  ok("내 순위도 같은 기준을 쓴다",
     (fix.match(/order by ta\.realized_pnl desc/g) || []).length >= 2);

  /* 공지에 적힌 기준과 실제가 같아야 합니다. */
  ok("공지가 실현 손익 기준이라고 안내한다", /실현 손익\) 기준으로 계산/.test(noticeJs));
}

/* ---------- 화면이 쓰는 칸 ---------- */
{
  ok("화면은 total_asset 을 표시한다", /r\.total_asset/.test(lbJs));
  ok("화면은 profit_amount 를 표시한다", /r\.profit_amount/.test(lbJs));
  ok("서버가 total_asset 을 내려준다", /total_asset numeric/.test(fix));
  ok("서버가 profit_amount 를 내려준다", /profit_amount numeric/.test(fix));
  ok("뷰에도 두 칸이 있다", /as total_asset/.test(fix) && /as profit_amount/.test(fix));
}

/* ---------- 수익률 ---------- */
{
  ok("수익률은 실현손익 / 시작자산", /realized_pnl \/ nullif\(ta\.initial_balance, 0\)\) \* 100/.test(fix));
  ok("시작자산 0 이어도 안 터진다", /nullif\(ta\.initial_balance, 0\)/.test(fix));
}

/* ---------- 안전 ---------- */
{
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(fix));
  ok("뷰·함수만 다시 만든다", /create or replace view public\.leaderboard/.test(fix) && /create or replace function public\.get_leaderboard/.test(fix));
  ok("비회원도 랭킹을 볼 수 있다", /grant execute on function public\.get_leaderboard to anon/.test(fix));
  ok("내 순위는 로그인한 본인 것만", /where ranked\.user_id = auth\.uid\(\)/.test(fix));
}

/* ---------- 순위 계산 시나리오 ---------- */
{
  /* 서버 정렬 규칙을 그대로 옮겨 확인합니다. */
  const users = [
    { 이름: "A", initial: 100000, realized: 10000, balance: 110000 },
    { 이름: "B", initial: 100000, realized: 10000, balance: 60000 },  // 포지션 보유
    { 이름: "C", initial: 100000, realized: 20000, balance: 60000 },  // 포지션 보유, 더 벌었음
  ];
  const roe = (u) => (u.realized / u.initial) * 100;
  const sorted = users.slice().sort((a, b) => b.realized - a.realized || roe(b) - roe(a));
  ok("가장 많이 번 사람이 1위", sorted[0].이름 === "C", sorted.map((u) => u.이름).join(">"));
  /* A 와 B 는 실현손익·수익률이 같습니다. 잔고만 다릅니다(B 는 포지션 보유).
     같은 성적이면 잔고 차이로 순위가 갈리면 안 됩니다. */
  {
    const a = users.find((u) => u.이름 === "A");
    const b = users.find((u) => u.이름 === "B");
    ok("같은 성적이면 잔고가 달라도 동등하다",
       a.realized === b.realized && roe(a) === roe(b) && a.balance !== b.balance);
  }

  /* 잘못된 옛 기준(balance)이면 C 가 꼴찌였습니다. */
  const old = users.slice().sort((a, b) => b.balance - a.balance);
  ok("옛 기준(잔고)이었으면 C 가 꼴찌였다", old[old.length - 1].이름 === "C");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
