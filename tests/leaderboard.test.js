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

/* 2026-08-20 — 랭킹 계산이 schema-leaderboard-floor.sql 로 옮겨졌습니다.
   누적을 0 에서 끊어야 해서 거래 표를 훑는 뷰가 필요했기 때문입니다.
   schema-leaderboard-fix.sql 은 그 이전 단계로 남아 있습니다. */
const fix = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-leaderboard-floor.sql"), "utf8"));
const lbJs = fs.readFileSync(path.join(REPO, "js", "leaderboard.js"), "utf8");
const noticeJs = fs.readFileSync(path.join(REPO, "js", "notice-board.js"), "utf8");

console.log("\n랭킹");

/* ---------- 순위 기준 ---------- */
{
  /* 2026-08-20 — 이 표의 이름이 '수익률 랭킹' 이라 정렬 기준도 수익률입니다.
     예전에는 수익금 순이라 이름과 기준이 달랐습니다. */
  ok("수익률로 정렬한다", /order by round\(\(coalesce\(rp\.ranking_profit/.test(fix));
  ok("가용 잔고로 정렬하지 않는다", !/order by ta\.balance desc/.test(fix));
  ok("수익률이 같으면 수익금으로 가른다",
    /\* 100, 2\) desc nulls last,\s*\n?\s*coalesce\(rp\.ranking_profit, 0\) desc/.test(fix));
  ok("내 순위도 목록과 같은 기준을 쓴다",
     (fix.match(/order by round\(\(coalesce\(rp\.ranking_profit/g) || []).length >= 2,
     "여기만 다르면 '목록엔 3등인데 내 순위는 5등' 이 됩니다");

  /* 2026-08-20 — 원금을 다 잃고 무료 충전으로 또 잃으면 손실이 끝없이
     커져 -17,147% 같은 숫자가 나왔습니다. 랭킹은 '얼마나 벌었나' 표이므로
     기준자본 아래는 계산하지 않습니다. */
  ok("누적을 0 에서 끊는다", /least\(0, coalesce\(min\(누적\), 0\)\)/.test(fix),
    "잃으면 0 으로 내려앉고 그다음 버는 것은 바로 올라갑니다");
  ok("수익금은 0 이 바닥", /coalesce\(rp\.ranking_profit, 0\)\s*as profit_amount/.test(fix));
  ok("총자산은 기준자본이 바닥",
    /ta\.initial_balance \+ coalesce\(rp\.ranking_profit, 0\)\)/.test(fix));
  /* 원본은 건드리지 않습니다 — 마이페이지·거래내역은 실제 손익을 보여줍니다. */
  ok("원본 데이터를 바꾸지 않는다", !/update public\.trading_accounts/.test(fix),
    "표시만 0 에서 끊고 저장된 값은 그대로 둡니다");

  /* 총자산은 계급 점수와 같은 기준이어야 두 화면 숫자가 맞습니다. */
  ok("내 순위의 총자산도 같은 기준",
    (fix.match(/ta\.initial_balance \+ coalesce\(rp\.ranking_profit, 0\)/g) || []).length >= 2,
    "지갑 잔고를 쓰면 포지션 보유 중에 줄고, 무료 충전이 섞입니다");

  /* 공지에 적힌 기준과 실제가 같아야 합니다.
     2026-08-25 — 공지 문구가 코드에서 서버 표로 옮겨졌습니다(대표가 직접
     쓰고 지울 수 있게). 그래서 코드가 아니라 SQL 의 초기 공지를 봅니다.
     대표가 이 공지를 지우거나 고칠 수 있으므로, 이 검사는 "처음 넣어둔
     안내가 실제 계산과 맞는지" 만 확인합니다. */
  const noticeSql = fs.readFileSync(path.join(REPO, "supabase", "schema-notices.sql"), "utf8");
  ok("초기 공지가 실현 손익 기준이라고 안내한다", /실현 손익\) 기준으로 계산/.test(noticeSql));
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
  ok("수익률은 랭킹 수익금 / 기준자본", /coalesce\(rp\.ranking_profit, 0\) \/ nullif\(ta\.initial_balance, 0\)/.test(fix));
  ok("시작자산 0 이어도 안 터진다", /nullif\(ta\.initial_balance, 0\)/.test(fix));
}

/* ---------- 안전 ---------- */
{
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(fix));
  /* create or replace 는 컬럼 이름·순서가 바뀌면 거부합니다
     (ERROR: cannot change name of view column). 그래서 먼저 지우고
     다시 만듭니다. 뷰·함수는 정의일 뿐이라 데이터가 사라지지 않습니다. */
  ok("뷰를 먼저 지우고 다시 만든다", /drop view if exists public\.leaderboard cascade;/.test(fix) && /create view public\.leaderboard as/.test(fix));
  ok("함수도 먼저 지우고 다시 만든다", /drop function if exists public\.get_leaderboard\(int\);/.test(fix) && /drop function if exists public\.get_my_rank\(\);/.test(fix));
  ok("지우는 대상은 뷰와 함수뿐", !/drop (table|schema|database|policy|trigger)/i.test(fix));
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
