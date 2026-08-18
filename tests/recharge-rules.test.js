/* tests/recharge-rules.test.js
 * 충전 규칙(자정 리셋 · 하루 2회)과 초기자산 보정식이 맞는지 검증합니다.
 * supabase/*.sql 의 로직을 그대로 옮겨 시뮬레이션합니다. */
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m✓\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const KST = 9 * 3600 * 1000;
const MAX_PER_DAY = 2;
const AMOUNT = 100000;

/* recharge_period_start(): 한국시간 오늘 00:00 (UTC ms 로 반환) */
function periodStart(nowMs) {
  const kst = nowMs + KST;
  return Math.floor(kst / 86400000) * 86400000 - KST;
}

/* recharge_status() / claim_daily_recharge() 의 횟수 판정 */
function usedToday(acc, nowMs) {
  const ps = periodStart(nowMs);
  return acc.last_recharge_at !== null && acc.last_recharge_at >= ps ? acc.recharge_count : 0;
}
function claim(acc, nowMs, hasPosition) {
  if (hasPosition) return { error: "has_position" };
  const used = usedToday(acc, nowMs);
  if (used >= MAX_PER_DAY) return { error: "already_claimed" };
  acc.balance += AMOUNT;
  acc.recharge_count = used + 1;
  acc.last_recharge_at = nowMs;
  return { balance: acc.balance, used: acc.recharge_count, remaining: MAX_PER_DAY - acc.recharge_count };
}

const KST_NOON = Date.UTC(2026, 7, 18, 3, 0, 0); // 2026-08-18 12:00 KST

console.log("\n충전 규칙 (자정 기준 · 하루 2회)");

/* ---- 리셋 기준 시각 ---- */
{
  const ps = periodStart(KST_NOON);
  const asKst = new Date(ps + KST).toISOString();
  ok("리셋 기준이 한국시간 자정이다", asKst.endsWith("T00:00:00.000Z") && asKst.startsWith("2026-08-18"), asKst);

  const at0530 = Date.UTC(2026, 7, 18, 20, 30, 0); // 8/19 05:30 KST
  ok("새벽 5시 30분도 이미 '오늘'로 친다(오전 6시 기준 아님)", periodStart(at0530) === periodStart(Date.UTC(2026, 7, 18, 15, 0, 0)), "8/19 00:00 KST 기준이어야 함");

  const before = Date.UTC(2026, 7, 18, 14, 59, 0); // 8/18 23:59 KST
  const after = Date.UTC(2026, 7, 18, 15, 1, 0); // 8/19 00:01 KST
  ok("자정을 넘기면 기준 시각이 하루 넘어간다", periodStart(after) - periodStart(before) === 86400000);
}

/* ---- 하루 2회 ---- */
{
  const acc = { balance: 0, recharge_count: 0, last_recharge_at: null };
  const r1 = claim(acc, KST_NOON, false);
  ok("1회차 충전 성공", !r1.error && r1.balance === 100000, JSON.stringify(r1));
  ok("1회차 뒤 남은 횟수 1회", r1.remaining === 1, String(r1.remaining));

  const r2 = claim(acc, KST_NOON + 60000, false);
  ok("2회차 충전 성공", !r2.error && r2.balance === 200000, JSON.stringify(r2));
  ok("2회차 뒤 남은 횟수 0회", r2.remaining === 0, String(r2.remaining));

  const r3 = claim(acc, KST_NOON + 120000, false);
  ok("3회차는 막힌다(already_claimed)", r3.error === "already_claimed", JSON.stringify(r3));
  ok("막힌 뒤 잔고가 늘지 않는다", acc.balance === 200000, String(acc.balance));

  /* 자정 넘기기 */
  const nextDay = KST_NOON + 86400000;
  const r4 = claim(acc, nextDay, false);
  ok("자정이 지나면 다시 충전된다", !r4.error && acc.balance === 300000, JSON.stringify(r4));
  ok("자정 넘긴 뒤 횟수가 1로 리셋된다", acc.recharge_count === 1, String(acc.recharge_count));
  const r5 = claim(acc, nextDay + 1000, false);
  ok("다음날도 2회까지만", !r5.error && r5.remaining === 0);
  ok("다음날 3회차도 막힌다", claim(acc, nextDay + 2000, false).error === "already_claimed");
}

/* ---- 포지션 보유 중 ---- */
{
  const acc = { balance: 0, recharge_count: 0, last_recharge_at: null };
  const r = claim(acc, KST_NOON, true);
  ok("포지션 보유 중에는 충전 불가", r.error === "has_position");
  ok("포지션 보유 중 잔고 변화 없음", acc.balance === 0);
}

/* ---- 초기자산 보정식 ---- */
{
  const START = 100000;
  const cases = [
    { name: "거래 안 한 회원", balance: 10000, initial: 10000, pnl: 0 },
    { name: "수익 본 회원", balance: 12000, initial: 10000, pnl: 2000 },
    { name: "손실 본 회원", balance: 7000, initial: 10000, pnl: -3000 },
    { name: "전부 잃은 회원", balance: 0, initial: 10000, pnl: -10000 },
  ];
  cases.forEach((c) => {
    const newBalance = c.balance + (START - c.initial);
    const newPnl = newBalance - START;
    ok("보정 후 손익이 보존된다 — " + c.name, newPnl === c.pnl, "기대 " + c.pnl + " / 실제 " + newPnl);
  });
  const already = 100000 + (START - 100000);
  ok("이미 100,000인 계정은 그대로", already === 100000);
}

/* ---- SQL 파일이 실제로 그렇게 쓰였는지 ---- */
{
  const sqlDir = path.join(__dirname, "..", "supabase");
  /* 주석(-- ...)에 적힌 설명 문구가 검사에 걸리지 않도록 걷어냅니다. */
  const stripComments = (t) => t.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  const recharge = stripComments(fs.readFileSync(path.join(sqlDir, "schema-daily-recharge.sql"), "utf8"));
  const initbal = stripComments(fs.readFileSync(path.join(sqlDir, "schema-initial-balance.sql"), "utf8"));

  ok("SQL: 리셋 기준에 '6 hours' 가 남아있지 않다", recharge.indexOf("interval '6 hours'") === -1);
  ok("SQL: date_trunc('day', ...) 로 자정을 잡는다", /date_trunc\('day', now\(\) at time zone 'Asia\/Seoul'\)\) at time zone 'Asia\/Seoul'/.test(recharge));
  ok("SQL: 하루 한도가 2회다", /recharge_max_per_day[\s\S]{0,200}select 2;/.test(recharge));
  ok("SQL: 충전 금액은 100,000 그대로", /AMOUNT constant numeric := 100000;/.test(recharge));
  ok("SQL: 충전 파일 본문에 DROP TABLE/TRUNCATE/DELETE 없음", !/\b(drop\s+table|truncate|delete\s+from)\b/i.test(recharge));

  ok("SQL: 초기자산 기준이 100,000", /select 100000::numeric;/.test(initbal));
  ok("SQL: INSERT 트리거로 auth.js 의 10,000 을 덮는다", /before insert on public\.trading_accounts/.test(initbal));
  ok("SQL: 기존 회원 보정이 차액을 잔고에도 더한다", /balance\s*=\s*balance \+ \(public\.starting_balance\(\) - initial_balance\)/.test(initbal));
  ok("SQL: reset_season 도 starting_balance() 를 쓴다", /set balance = public\.starting_balance\(\)/.test(initbal));
  ok("SQL: 초기자산 파일 본문에 DROP TABLE/TRUNCATE 없음", !/\b(drop\s+table|truncate)\b/i.test(initbal));
  /* reset_season 안의 delete 는 원본에도 있던 시즌 초기화 동작입니다(신규 삭제 아님). */
  const deletes = (initbal.match(/delete\s+from\s+public\.(\w+)/gi) || []).map((m) => m.split(".")[1]);
  ok("SQL: 초기자산 파일의 delete 는 positions/orders/trades 뿐(원본과 동일)", deletes.sort().join(",") === "orders,positions,trades", deletes.join(","));
}

/* ---- 화면 안내 문구 ---- */
{
  const js = fs.readFileSync(path.join(__dirname, "..", "js", "daily-recharge.js"), "utf8");
  ok("화면 문구에 '오전 6시' 가 남아있지 않다", js.indexOf("오전 6시") === -1);
  ok("화면 문구가 '자정' 기준으로 바뀌었다", js.indexOf("자정") !== -1);
  ok("남은 횟수는 서버 값(remaining/max_per_day)을 쓴다", js.indexOf("data.remaining") !== -1 && js.indexOf("data.max_per_day") !== -1);
  ok("횟수를 클라이언트가 지어내지 않는다(하드코딩 '2회' 없음)", !/"[^"]*2회[^"]*"/.test(js));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
