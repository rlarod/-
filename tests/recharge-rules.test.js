/* tests/recharge-rules.test.js
 * 충전 규칙(자정 리셋 · 하루 2회)과 초기자산 보정식이 맞는지 검증합니다.
 * supabase/*.sql 의 로직을 그대로 옮겨 시뮬레이션합니다.
 *
 * ── 2026-08-26 시뮬레이션을 새 동작에 맞췄습니다 (대표 지시) ──────────────
 *   대표 지시로 "무료 충전(더하기)" 이 "지갑 초기화(덮어쓰기)" 로 바뀌었습니다.
 *
 *     (전) set balance = balance + 100,000   두 번 누르면 200,000
 *     (후) set balance = 100,000             두 번 눌러도 100,000
 *
 *   그런데 이 파일의 claim() 시뮬레이션은 `acc.balance += AMOUNT` 로 남아 있어
 *   "2회차 충전 성공 balance 200000" 을 맞다고 단언하고 있었습니다.
 *   자기 안에서만 도는 시뮬레이션이라 통과는 했지만, 실제 서버와 반대였습니다.
 *   테스트는 "이렇게 도는 게 맞다" 고 못 박는 문서인데 틀린 것을 못 박고 있던 셈이라
 *   여기서 새 동작으로 고쳤습니다. (수리팀 발견 / 2026-08-26)
 *
 *   ⚠ 되돌아감 방지는 아래 [되돌아감 방지] 절에 있습니다. 시뮬레이션이
 *     `+= AMOUNT` / `balance + AMOUNT` 로 되돌아가면 그 절이 실패합니다.
 *
 * ── 이 파일이 맡는 범위 (겹치지 않게) ─────────────────────────────────────
 *   여기          : 자정 리셋 시각 · 하루 2회 한도 · 포지션 보유 중 금지 ·
 *                   초기자산 보정식 · 화면 안내 문구
 *   recharge-reset: 서버 SQL 의 덮어쓰기 문장 · 계급 회계(recharge_total) ·
 *                   확인 창 · 버튼 글씨   → tests/recharge-reset.test.js
 *   따라서 여기서는 SQL 의 balance 대입문을 다시 검사하지 않습니다.
 * ------------------------------------------------------------------------ */
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
  /* 2026-08-26 대표 지시 — 더하기가 아니라 덮어쓰기입니다.
     서버: update trading_accounts set balance = AMOUNT ...
     예전에는 acc.balance += AMOUNT 였습니다. 되돌리지 마세요. */
  acc.balance = AMOUNT;
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

/* ---- 하루 2회 ----
 * 2026-08-26: 잔고 30,000 에서 시작합니다. 더하기였다면 130,000 → 230,000 이
 * 됐을 자리라, 덮어쓰기로 바뀐 것이 숫자로 드러납니다. */
{
  const acc = { balance: 30000, recharge_count: 0, last_recharge_at: null };
  const r1 = claim(acc, KST_NOON, false);
  ok("1회차 초기화 성공 — 잔고가 100,000 이 된다", !r1.error && r1.balance === 100000, JSON.stringify(r1));
  ok("1회차 뒤 남은 횟수 1회", r1.remaining === 1, String(r1.remaining));

  const r2 = claim(acc, KST_NOON + 60000, false);
  /* 2026-08-26 이전에는 여기가 200000 이었습니다(더하기). 이제는 덮어쓰기라 100000 입니다. */
  ok("2회차도 100,000 그대로다 — 두 번 눌러도 쌓이지 않는다", !r2.error && r2.balance === 100000, JSON.stringify(r2));
  ok("2회차 뒤 남은 횟수 0회", r2.remaining === 0, String(r2.remaining));

  const r3 = claim(acc, KST_NOON + 120000, false);
  ok("3회차는 막힌다(already_claimed)", r3.error === "already_claimed", JSON.stringify(r3));
  ok("막힌 뒤 잔고가 움직이지 않는다", acc.balance === 100000, String(acc.balance));

  /* 자정 넘기기 */
  const nextDay = KST_NOON + 86400000;
  const r4 = claim(acc, nextDay, false);
  /* 예전에는 300000 이었습니다. 며칠을 눌러도 100,000 을 넘지 않습니다. */
  ok("자정이 지나면 다시 초기화되지만 잔고는 여전히 100,000", !r4.error && acc.balance === 100000, JSON.stringify(r4));
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

  /* 2026-08-26 추가 — 덮어쓰기가 되면서 잔고가 '줄 수도' 있게 됐습니다.
     포지션 보유 중 막힘이 뚫리면 돈이 사라지므로 큰 잔고로도 확인합니다. */
  const rich = { balance: 500000, recharge_count: 0, last_recharge_at: null };
  const r2 = claim(rich, KST_NOON, true);
  ok("포지션 보유 중이면 잔고가 많아도 막힌다", r2.error === "has_position");
  ok("포지션 보유 중에는 잔고가 줄지도 않는다", rich.balance === 500000, String(rich.balance));
}

/* ---- 되돌아감 방지 (2026-08-26) ----
 * 이 시뮬레이션이 옛 동작(더하기)으로 슬그머니 되돌아가는 것을 막습니다.
 * 시뮬레이션은 자기 안에서만 돌기 때문에 되돌려도 "통과" 해 버릴 수 있어,
 * 함수 본문 자체를 글자로 확인합니다. */
{
  /* 주석에 "예전에는 += 였다" 고 적어 두었으므로, 주석을 걷어낸
     '실제로 실행되는 본문' 만 봅니다. */
  const src = claim
    .toString()
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/\s+/g, " ");
  ok("시뮬레이션이 잔고를 덮어쓴다 (acc.balance = AMOUNT)",
    /acc\.balance = AMOUNT;/.test(src),
    "서버는 set balance = AMOUNT 입니다. 시뮬레이션도 같아야 합니다");
  ok("시뮬레이션에 '+= AMOUNT' 가 남아 있지 않다",
    !/acc\.balance \+=/.test(src),
    "2026-08-26 대표 지시(지갑 초기화) 이전으로 되돌아간 것입니다");
  ok("시뮬레이션에 'balance + AMOUNT' 형태가 남아 있지 않다",
    !/acc\.balance = acc\.balance \+/.test(src) && !/balance \+ AMOUNT/.test(src),
    "2026-08-26 대표 지시(지갑 초기화) 이전으로 되돌아간 것입니다");

  /* 동작으로도 한 번 더 — 어떤 잔고에서 눌러도 결과는 항상 AMOUNT 하나입니다. */
  const 결과 = [0, 1, 30000, 99999, 100000, 100001, 500000, 2000000].map((b) => {
    const a = { balance: b, recharge_count: 0, last_recharge_at: null };
    claim(a, KST_NOON, false);
    return a.balance;
  });
  ok("어떤 잔고에서 눌러도 결과가 100,000 하나뿐이다",
    결과.every((v) => v === AMOUNT),
    결과.join(","));
  ok("잔고가 100,000 보다 많으면 줄어든다(더하기였다면 늘었을 자리)",
    (function () {
      const a = { balance: 500000, recharge_count: 0, last_recharge_at: null };
      claim(a, KST_NOON, false);
      return a.balance < 500000;
    })(),
    "이 검사가 실패하면 더하기로 되돌아간 것입니다");
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
if (fail !== 0) {
  console.log("실패 있음 ❌");
  process.exit(1);
}
console.log("전체 통과 ✅");
/* 타이머가 프로세스를 붙들지 않게 명시적으로 끝냅니다.
   npm test 는 && 로 이어져 있어, 한 파일이 안 끝나면 뒤가 전부 안 돌아갑니다. */
process.exit(0);
