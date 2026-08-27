/* tests/seed-recharge-guard.test.js
 * =========================================================================
 * 시드 충전권 / 실현손익 200건 잘림 — 서버 SQL 재발 방지
 * =========================================================================
 * 무엇을 지키나
 *
 *  (1) 시드 충전권이 포지션 보유 중에 지갑을 올리지 못한다
 *      — 지갑 초기화 · 재충전 이용권에는 있던 검사가 여기만 빠져 있었습니다.
 *
 *  (2) 시드 충전권으로 받은 돈이 recharge_total 에 쌓인다
 *      — 안 쌓으면 300 TL 짜리 1장으로 계급이 정확히 +1000점(상병) 오릅니다.
 *        "계급을 사는" 셈이라 2026-08-24 대표 결정과 정면으로 어긋납니다.
 *
 *  (3) use_user_item() 이 ★두 파일에 있다★ — 한쪽만 고치면 다른 쪽을
 *      나중에 Run 했을 때 수리가 조용히 되돌아갑니다. 두 벌이 같은지 봅니다.
 *
 *  (4) 실현손익 200건 잘림을 막는 트리거 3개가 다 있다
 *      — 1번만 달고 2번을 안 달면 시즌 초기화가 깨집니다(자세한 이유는
 *        supabase/fix-realized-pnl-200.sql 주석 참조).
 *
 *  (5) 상한 숫자(200)가 js/trading.js 의 MAX_CLOSED_TRADES 와 같다
 *      — 한쪽만 바뀌면 조용히 어긋납니다.
 *
 * SQL 을 실행하지 않습니다. 파일 내용을 읽고, 판정 규칙을 자바스크립트로
 * 똑같이 옮겨 숫자로 확인합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [32m✓[0m " + name); }
  else { fail++; console.log("  [31m✗[0m " + name + (detail ? " — " + detail : "")); }
}
function read(rel) {
  return fs.readFileSync(path.join(REPO, rel), "utf8");
}

const MARKET_SQL = "supabase/schema-tl-market.sql";
const FIX_SQL = "supabase/fix-seed-recharge-guard.sql";
const CHECK_PNL_SQL = "supabase/check-realized-pnl-200.sql";
const FIX_PNL_SQL = "supabase/fix-realized-pnl-200.sql";

/* use_user_item() 안에서 seed_recharge 분기만 잘라냅니다. */
function seedBranch(sql) {
  const start = sql.indexOf("if it.item_type = 'seed_recharge' then");
  if (start < 0) return "";
  const end = sql.indexOf("elsif it.item_type = 'account_reset'", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end);
}

/* ===================================================================== */
console.log("\n  (1) 포지션 보유 중에는 시드 충전을 막는다");
/* ===================================================================== */
{
  [MARKET_SQL, FIX_SQL].forEach((rel) => {
    const branch = seedBranch(read(rel));
    ok(rel + " : seed_recharge 분기를 찾았다", branch.length > 0);
    ok(rel + " : 포지션 검사가 있다",
      /select\s+1\s+from\s+public\.positions\s+where\s+user_id\s*=\s*uid/.test(branch),
      "positions 검사가 없습니다");
    ok(rel + " : has_position 으로 거절한다",
      /raise exception 'has_position'/.test(branch),
      "raise exception 'has_position' 가 없습니다");
  });

  /* 지갑 초기화·재충전 이용권과 '같은 방식' 인지 대조합니다. */
  const daily = read("supabase/schema-daily-recharge.sql");
  ok("지갑 초기화(claim_daily_recharge)도 같은 검사를 쓴다",
    /raise exception 'has_position'/.test(daily));
}

/* ===================================================================== */
console.log("\n  (2) 충전받은 돈이 recharge_total 에 쌓인다");
/* ===================================================================== */
{
  [MARKET_SQL, FIX_SQL].forEach((rel) => {
    const branch = seedBranch(read(rel));
    ok(rel + " : 지갑을 올린다", /balance\s*=\s*balance\s*\+\s*added/.test(branch));
    ok(rel + " : recharge_total 도 같이 올린다",
      /recharge_total\s*=\s*coalesce\(recharge_total,\s*0\)\s*\+\s*added/.test(branch),
      "recharge_total 적립이 없습니다 — 1장당 계급 +1000점");
    ok(rel + " : 지갑과 계급 차감액이 같은 값(added)이다",
      (branch.match(/\badded\b/g) || []).length >= 3);
  });

  /* recharge_total 칸이 없는 서버에서 Run 해도 안 터지게 해 뒀는가 */
  [MARKET_SQL, FIX_SQL].forEach((rel) => {
    ok(rel + " : recharge_total 칸을 먼저 만들어 둔다(실행 순서 무관)",
      /add column if not exists recharge_total/.test(read(rel)));
  });
}

/* ===================================================================== */
console.log("\n  (2-b) 계급이 실제로 안 움직이는지 숫자로 확인");
/* ===================================================================== */
{
  /* schema-rank-1000.sql 의 rank_assets / rank_points 를 그대로 옮긴 것입니다.
     ★공식은 손대지 않습니다★ — 그대로 옮겨서 결과만 비교합니다. */
  function rankPoints(acc) {
    const assets = Math.max(0, acc.balance + acc.margin - acc.rechargeTotal);
    if (!(acc.initial > 0) || !(assets > 0)) return 0;
    return Math.max(0, (Math.log(assets / acc.initial) / Math.log(2)) * 1000);
  }
  const EFFECT = 100000;

  const before = { balance: 100000, margin: 0, rechargeTotal: 0, initial: 100000 };
  ok("거래 전 계급점수 0점(이병)", Math.round(rankPoints(before)) === 0,
    String(Math.round(rankPoints(before))));

  /* 옛 동작 — 지갑만 올림 */
  const oldAfter = { ...before, balance: before.balance + EFFECT };
  const oldPts = Math.round(rankPoints(oldAfter));
  ok("옛 동작: 시드 충전권 1장으로 +1000점이 올랐다(재현)", oldPts === 1000, String(oldPts));

  /* 새 동작 — 지갑과 recharge_total 을 같이 올림 */
  const newAfter = {
    ...before,
    balance: before.balance + EFFECT,
    rechargeTotal: before.rechargeTotal + EFFECT,
  };
  const newPts = Math.round(rankPoints(newAfter));
  ok("새 동작: 계급점수가 한 칸도 안 움직인다", newPts === 0, String(newPts));
  ok("새 동작: 지갑은 그대로 늘어난다(회원 손해 없음)",
    newAfter.balance === 200000, String(newAfter.balance));

  /* 2장을 써도 마찬가지여야 합니다 */
  const two = { ...before, balance: before.balance + EFFECT * 2, rechargeTotal: EFFECT * 2 };
  ok("2장을 써도 계급점수 0점", Math.round(rankPoints(two)) === 0,
    String(Math.round(rankPoints(two))));

  /* 충전받은 뒤 진짜로 벌면 계급은 정상적으로 오른다 */
  const earned = { ...two, balance: two.balance + 100000 };
  ok("충전 뒤 거래로 10만을 벌면 계급이 오른다",
    Math.round(rankPoints(earned)) === 1000, String(Math.round(rankPoints(earned))));
}

/* ===================================================================== */
console.log("\n  (3) 같은 함수가 두 파일에 — 내용이 어긋나지 않는다");
/* ===================================================================== */
{
  const a = seedBranch(read(MARKET_SQL)).replace(/\s+/g, " ").trim();
  const b = seedBranch(read(FIX_SQL)).replace(/\s+/g, " ").trim();
  ok("두 파일의 seed_recharge 분기가 같다(공백 무시)", a === b,
    "어긋나면 나중에 Run 한 쪽이 이깁니다");

  ok(MARKET_SQL + " : 정본이 어디인지 주석에 적혀 있다",
    /fix-seed-recharge-guard\.sql/.test(read(MARKET_SQL)));
  ok(FIX_SQL + " : 정본이라고 적혀 있다",
    /정본/.test(read(FIX_SQL)) && /schema-tl-market\.sql/.test(read(FIX_SQL)));

  /* use_user_item 이 세 번째 파일에 또 생기지 않았는지 */
  const dir = path.join(REPO, "supabase");
  const copies = fs.readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => /create or replace function public\.use_user_item/
      .test(fs.readFileSync(path.join(dir, f), "utf8")));
  ok("use_user_item 정의가 2벌을 넘지 않는다 (" + copies.join(", ") + ")",
    copies.length <= 2, copies.join(", "));
}

/* ===================================================================== */
console.log("\n  (4) 실현손익 200건 잘림 — 서버 차단 트리거");
/* ===================================================================== */
{
  const fixPnl = read(FIX_PNL_SQL);

  ok("① trading_accounts 저장을 걸러내는 트리거가 있다",
    /create trigger trg_keep_full_realized_pnl[\s\S]*?before update on public\.trading_accounts/
      .test(fixPnl));
  ok("② 거래 삭제 뒤 다시 맞추는 트리거가 있다 (없으면 시즌 초기화가 깨집니다)",
    /create trigger trg_resync_realized_pnl_del[\s\S]*?after delete on public\.trades/
      .test(fixPnl));
  ok("③ 거래 추가 뒤 다시 맞추는 트리거가 있다",
    /create trigger trg_resync_realized_pnl_ins[\s\S]*?after insert on public\.trades/
      .test(fixPnl));

  ok("한 건씩이 아니라 문장 단위로 돈다(전환 표 사용 — 대량 삭제에서 안 느려짐)",
    /referencing old table as/.test(fixPnl) && /referencing new table as/.test(fixPnl));

  ok("사이클 넘김을 새 cycle_no 로 센다(안 그러면 새 사이클이 0 으로 안 시작)",
    /coalesce\(new\.cycle_no, 1\)/.test(fixPnl));

  ok("오류를 내지 않고 조용히 값만 바로잡는다",
    !/raise exception/.test(fixPnl),
    "오류를 내면 화면이 '저장 실패' 로 보고 무한 재시도합니다");

  /* (5) 상한 숫자가 js/trading.js 와 같은지 */
  const cap = /create or replace function public\.client_trade_cap[\s\S]*?select\s+(\d+)\s*;/
    .exec(fixPnl);
  const jsCap = /MAX_CLOSED_TRADES\s*=\s*(\d+)/.exec(read("js/trading.js"));
  ok("client_trade_cap() 을 찾았다", !!cap);
  ok("js/trading.js 의 MAX_CLOSED_TRADES 를 찾았다", !!jsCap);
  ok("상한 숫자가 서로 같다 (SQL " + (cap && cap[1]) + " / JS " + (jsCap && jsCap[1]) + ")",
    !!cap && !!jsCap && cap[1] === jsCap[1]);

  /* 진단 파일은 읽기 전용이어야 합니다 */
  const chk = read(CHECK_PNL_SQL);
  const 쓰기 = chk
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  ok(CHECK_PNL_SQL + " 은 읽기 전용이다(insert/update/delete/drop/alter 없음)",
    !/\b(insert|update|delete|drop|alter|truncate|create)\b/i.test(쓰기),
    "읽기 전용이라고 적어놓고 쓰기가 섞이면 대표가 안심하고 Run 할 수 없습니다");
}

/* ===================================================================== */
console.log("\n  (6) SQL 안전 규칙");
/* ===================================================================== */
{
  [FIX_SQL, FIX_PNL_SQL].forEach((rel) => {
    const sql = read(rel);
    const 코드 = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

    ok(rel + " : DROP TABLE / TRUNCATE 가 없다",
      !/\bdrop\s+table\b/i.test(코드) && !/\btruncate\b/i.test(코드));

    /* WHERE 없는 UPDATE / DELETE 금지 (safeupdate 가 거부합니다) */
    const 문장들 = 코드.split(";");
    const 위험 = 문장들.filter((s) => {
      const t = s.toLowerCase();
      if (!/\bupdate\s+public\.|\bdelete\s+from\s+public\./.test(t)) return false;
      return !/\bwhere\b/.test(t);
    });
    ok(rel + " : WHERE 없는 UPDATE/DELETE 가 없다", 위험.length === 0,
      위험.map((s) => s.trim().slice(0, 60)).join(" | "));

    ok(rel + " : 되돌리는 방법이 적혀 있다", /\[되돌리기\]/.test(sql));
    ok(rel + " : 여러 번 돌려도 안전하다고 밝혀 뒀다",
      /여러 번 (돌려도|실행해도) 안전/.test(sql));
  });

  /* 백업표가 있는가 */
  ok(FIX_SQL + " : 바꾸기 전 값을 백업표에 남긴다",
    /create table if not exists public\.recharge_total_backfill_log/.test(read(FIX_SQL)));
  ok(FIX_PNL_SQL + " : 바꾸기 전 값을 백업표에 남긴다",
    /create table if not exists public\.realized_pnl_backfill_log/.test(read(FIX_PNL_SQL)));

  /* 소급 보정이 두 번 돌아도 안 겹치는가 */
  ok(FIX_SQL + " : 소급 보정이 재실행에 안전하다(이미 처리한 회원은 건너뜀)",
    /not exists \(select 1 from public\.recharge_total_backfill_log/.test(read(FIX_SQL)));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
