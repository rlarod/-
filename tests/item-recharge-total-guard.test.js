/* tests/item-recharge-total-guard.test.js
 * =========================================================================
 * [P1] 무상으로 준 돈이 recharge_total 에 안 쌓여 계급이 부풀던 것 — 2026-08-27
 * =========================================================================
 *
 * ── 규칙 (2026-08-24 대표 결정) ──────────────────────────────────────────
 *   계급용 자산 = 지갑 + 증거금 − recharge_total
 *   계급 점수   = 1000 × log2(자산 / 초기자금)
 *   → 무상으로 받은 돈은 recharge_total 에 쌓아 계급에서 빼야 합니다.
 *
 * ── 무엇이 터져 있었나 ──────────────────────────────────────────────────
 *   seed_recharge   지갑 +100,000 인데 recharge_total 은 그대로  → 2026-08-27 수리
 *   account_reset   지갑을 초기자금으로 되돌리는데 recharge_total 은 그대로
 *                   → 손실 중에 쓰면 원금이 무상 복구되는데 계급에서는 안 빠짐
 *                   → 거래를 한 번도 더 안 하고 계급이 올라감
 *
 * ── [P1 조용한 고장] security definer 안에서 current_user 가 안 통함 ────
 *   PostgreSQL 은 security definer 함수 안에서 current_user 를 함수 주인으로
 *   바꿉니다. lock_server_owned_account_fields() 가 security definer 라
 *       if current_user not in ('authenticated','anon') then return new;
 *   이 언제나 참이 되어 잠금이 한 줄도 안 돌았습니다.
 *   오류도 안 나고 트리거 목록에는 멀쩡히 나옵니다.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────────────────
 *   1) use_user_item 의 account_reset 이 recharge_total 을 같이 쌓는다
 *   2) 그 금액이 greatest(0, ...) 이다 (음수를 더하면 계급이 거꾸로 부풀어 오름)
 *   3) balance_before 를 기록에 남긴다 (다음에 소급할 수 있게)
 *   4) 두 파일의 use_user_item 본문이 글자 하나까지 같다
 *      — 한쪽만 고치면 다른 쪽을 나중에 Run 했을 때 수리가 되돌아감
 *   5) 잠금 트리거가 security definer 가 아니다
 *   6) 계급 공식(1000 × log2) 을 아무도 안 건드렸다
 *   7) 회원 데이터를 지우는 문장이 없다
 *
 * 서버에 붙지 않습니다. 파일만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

const GUARD = "supabase/fix-seed-recharge-guard.sql";
const MARKET = "supabase/schema-tl-market.sql";
const RLS = "supabase/fix-trading-accounts-rls.sql";

/* use_user_item 의 본문만 뽑습니다 (달러 인용 안쪽) */
function useUserItemBody(rel, delim) {
  const s = read(rel);
  const i = s.indexOf("create or replace function public.use_user_item");
  if (i < 0) return null;
  const start = s.indexOf("as " + delim, i);
  if (start < 0) return null;
  const from = start + 3 + delim.length;
  const end = s.indexOf(delim, from);
  if (end < 0) return null;
  return s.slice(from, end);
}

/* 주석(-- 로 시작하는 줄)을 걷어낸 실행문만 */
function stripComments(s) {
  return s
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i < 0 ? l : l.slice(0, i);
    })
    .join("\n");
}

console.log("\n[P1] 무상으로 준 돈이 recharge_total 에 안 쌓여 계급이 부풀던 것");

/* =========================================================================
 * [0] 전제 — 파일이 있고 함수가 있다
 * ========================================================================= */
section("[0] 전제");
{
  ok(GUARD + " 가 있다", exists(GUARD));
  ok(MARKET + " 가 있다", exists(MARKET));
  ok(RLS + " 가 있다", exists(RLS));
}

const bodyGuard = useUserItemBody(GUARD, "$fn$");
const bodyMarket = useUserItemBody(MARKET, "$$");

/* =========================================================================
 * [1] account_reset 이 recharge_total 을 같이 쌓는다
 * ========================================================================= */
section("[1] account_reset 이 recharge_total 을 같이 쌓는다");
{
  [[GUARD, bodyGuard], [MARKET, bodyMarket]].forEach(function (pair) {
    const 이름 = pair[0];
    const 본문 = pair[1];
    ok(이름 + " — use_user_item 본문을 읽었다", typeof 본문 === "string" && 본문.length > 0);
    if (!본문) return;

    const i = 본문.indexOf("elsif it.item_type = 'account_reset'");
    ok(이름 + " — account_reset 갈래가 있다", i >= 0);
    if (i < 0) return;

    /* account_reset 갈래만 잘라냅니다 (다음 end if 까지) */
    const 갈래 = 본문.slice(i, 본문.indexOf("\n  end if;", i));
    const 실행문 = stripComments(갈래);

    ok(이름 + " — 그 갈래에서 recharge_total 을 쌓는다",
      /recharge_total\s*=\s*coalesce\(recharge_total,\s*0\)\s*\+\s*added/.test(실행문), 실행문.slice(0, 300));
    ok(이름 + " — 지갑은 초기자금으로 되돌린다(원래 동작 그대로)",
      /balance\s*=\s*start_bal/.test(실행문));
    ok(이름 + " — 포지션이 있으면 막는다(원래 동작 그대로)",
      실행문.indexOf("raise exception 'has_position'") >= 0);
  });
}

/* =========================================================================
 * [2] 금액이 greatest(0, ...) 이다
 *     이익 중에 쓰면 (초기자금 − 지갑) 이 음수가 됩니다.
 *     그걸 그대로 더하면 recharge_total 이 줄어 ★계급이 거꾸로 부풀어 오릅니다★.
 * ========================================================================= */
section("[2] 무상 지급액이 음수가 될 수 없다");
{
  [[GUARD, bodyGuard], [MARKET, bodyMarket]].forEach(function (pair) {
    const 이름 = pair[0];
    const 본문 = pair[1];
    if (!본문) return;
    const i = 본문.indexOf("elsif it.item_type = 'account_reset'");
    const 실행문 = stripComments(본문.slice(i, 본문.indexOf("\n  end if;", i)));

    ok(이름 + " — added := greatest(0, 초기자금 − 되돌리기전지갑)",
      /added\s*:=\s*greatest\(\s*0\s*,\s*start_bal\s*-\s*old_bal\s*\)/.test(실행문), 실행문.slice(0, 400));
    ok(이름 + " — 고정액(effect_value)을 안 쓴다 (account_reset 은 null 이라서)",
      실행문.indexOf("it.effect_value") < 0 || !/added\s*:=\s*coalesce\(it\.effect_value/.test(실행문));
    ok(이름 + " — old_bal 을 선언했다",
      본문.indexOf("old_bal numeric;") >= 0);
    ok(이름 + " — old_bal 을 지갑에서 읽어 온다",
      /into\s+old_bal,\s*start_bal/.test(stripComments(본문)), "");
  });
}

/* =========================================================================
 * [3] balance_before 를 기록에 남긴다
 *     옛 함수는 '되돌린 뒤' 값만 남겨서 지난 사용분을 소급할 수 없었습니다.
 * ========================================================================= */
section("[3] 되돌리기 전 지갑을 기록에 남긴다");
{
  [[GUARD, bodyGuard], [MARKET, bodyMarket]].forEach(function (pair) {
    const 이름 = pair[0];
    const 본문 = pair[1];
    if (!본문) return;
    const i = 본문.indexOf("elsif it.item_type = 'account_reset'");
    const 실행문 = stripComments(본문.slice(i, 본문.indexOf("\n  end if;", i)));
    ok(이름 + " — effect_data 에 balance_before 를 남긴다", 실행문.indexOf("'balance_before'") >= 0);
    ok(이름 + " — effect_data 에 added 를 남긴다", 실행문.indexOf("'added'") >= 0);
    ok(이름 + " — counted_as_recharge 표시를 남긴다", 실행문.indexOf("'counted_as_recharge'") >= 0);
  });
}

/* =========================================================================
 * [4] 두 파일의 use_user_item 본문이 글자 하나까지 같다
 *     ★한쪽만 고치면 다른 쪽을 나중에 Run 했을 때 수리가 통째로 되돌아갑니다★
 *     (docs/인계문서.md 6번 — 같은 함수가 여러 파일에 있는 문제)
 * ========================================================================= */
section("[4] 두 파일의 use_user_item 이 완전히 같다");
{
  ok("양쪽 본문을 다 읽었다", !!bodyGuard && !!bodyMarket);
  if (bodyGuard && bodyMarket) {
    let 첫차이 = -1;
    if (bodyGuard !== bodyMarket) {
      const n = Math.max(bodyGuard.length, bodyMarket.length);
      for (let i = 0; i < n; i++) {
        if (bodyGuard[i] !== bodyMarket[i]) { 첫차이 = i; break; }
      }
    }
    ok("본문이 글자 하나까지 같다", bodyGuard === bodyMarket,
      첫차이 < 0 ? "" : "첫 차이 " + 첫차이 + " / A=" + JSON.stringify(bodyGuard.slice(첫차이, 첫차이 + 60)) +
        " B=" + JSON.stringify(bodyMarket.slice(첫차이, 첫차이 + 60)));
  }
}

/* =========================================================================
 * [5] seed_recharge 는 그대로 (앞서 고친 것을 안 깨뜨렸다)
 * ========================================================================= */
section("[5] seed_recharge 수리가 그대로다");
{
  [[GUARD, bodyGuard], [MARKET, bodyMarket]].forEach(function (pair) {
    const 이름 = pair[0];
    const 본문 = pair[1];
    if (!본문) return;
    const i = 본문.indexOf("if it.item_type = 'seed_recharge'");
    const 갈래 = 본문.slice(i, 본문.indexOf("elsif it.item_type = 'account_reset'"));
    const 실행문 = stripComments(갈래);
    ok(이름 + " — seed_recharge 도 recharge_total 을 쌓는다",
      /recharge_total\s*=\s*coalesce\(recharge_total,\s*0\)\s*\+\s*added/.test(실행문));
    ok(이름 + " — seed_recharge 도 포지션이 있으면 막는다",
      실행문.indexOf("raise exception 'has_position'") >= 0);
  });
}

/* =========================================================================
 * [6] 잠금 트리거가 security definer 가 아니다
 *     definer 면 current_user 가 함수 주인으로 바뀌어 잠금이 한 줄도 안 돕니다.
 * ========================================================================= */
section("[6] 잠금 트리거가 security invoker 다");
{
  const s = read(RLS);
  const i = s.indexOf("create or replace function public.lock_server_owned_account_fields()");
  ok("함수 정의가 있다", i >= 0);
  if (i >= 0) {
    const 머리 = stripComments(s.slice(i, s.indexOf("as $fn$", i)));
    ok("security definer 가 없다", 머리.indexOf("security definer") < 0, 머리.trim());
    ok("current_user 로 판정한다", s.indexOf("if current_user not in ('authenticated', 'anon')") >= 0);
    ok("session_user 로 판정하지 않는다 (PostgREST 는 늘 authenticator 라 못 가름)",
      stripComments(s.slice(i, s.indexOf("$fn$;", i))).indexOf("session_user") < 0);
    ok("auth.role() 로 판정하지 않는다 (서버 함수 경로까지 막혀 무료충전이 깨짐)",
      stripComments(s.slice(i, s.indexOf("$fn$;", i))).indexOf("auth.role()") < 0);
    ok("부르는 역할에게 실행 권한을 명시했다",
      s.indexOf("grant execute on function public.lock_server_owned_account_fields() to authenticated, anon;") >= 0);
    ok("왜 definer 를 뺐는지 파일에 적혀 있다", s.indexOf("함수 주인") >= 0 && s.indexOf("조용한 고장") >= 0);
    ok("돌고 있는지 확인하는 조회가 있다 (달려 있다 ≠ 실제로 돈다)",
      s.indexOf("prosecdef") >= 0 && s.indexOf("security invoker") >= 0);
  }
}

/* =========================================================================
 * [7] 계급 공식을 아무도 안 건드렸다 (대표 확인 사항)
 * ========================================================================= */
section("[7] 계급 공식은 그대로다");
{
  [GUARD, MARKET, RLS].forEach(function (rel) {
    const 실행문 = stripComments(read(rel));
    ok(rel + " — rank_points() 를 새로 정의하지 않는다",
      실행문.indexOf("function public.rank_points") < 0);
    ok(rel + " — log(2, ...) 계수 1000 을 바꾸지 않았다",
      실행문.indexOf("log(2,") < 0 || 실행문.indexOf("* 1000") >= 0);
  });
}

/* =========================================================================
 * [8] 회원 데이터를 지우지 않는다
 * ========================================================================= */
section("[8] 회원 데이터를 지우지 않는다");
{
  [GUARD, MARKET, RLS].forEach(function (rel) {
    const 실행문 = stripComments(read(rel));
    ok(rel + " — truncate 가 없다", !/\btruncate\b/i.test(실행문));
    ok(rel + " — drop table 이 없다", !/\bdrop\s+table\b/i.test(실행문));
    ok(rel + " — where 없는 delete 가 없다",
      실행문.split(";").every(function (st) {
        return !/\bdelete\s+from\b/i.test(st) || /\bwhere\b/i.test(st);
      }));
    ok(rel + " — where 없는 update 가 없다",
      실행문.split(";").every(function (st) {
        return !/\bupdate\s+public\./i.test(st) || /\bwhere\b/i.test(st);
      }));
  });
}

/* =========================================================================
 * [9] 드라이버가 자리표시자로 오해하는 ? 연산자를 안 쓴다
 *     jsonb 의 ? 는 raw SQL 이 아니면 파라미터로 잘못 읽힙니다.
 * ========================================================================= */
section("[9] jsonb ? 연산자를 안 쓴다");
{
  [GUARD, MARKET].forEach(function (rel) {
    const 실행문 = stripComments(read(rel));
    ok(rel + " — effect_data ? 'key' 형태가 없다", !/effect_data\s*\?\s*'/.test(실행문));
  });
}

/* =========================================================================
 * [10] 달러 인용이 짝이 맞는다 (안 맞으면 Run 하는 순간 오류)
 * ========================================================================= */
section("[10] 달러 인용 짝이 맞는다");
{
  [[GUARD, "$fn$"], [MARKET, "$$"], [RLS, "$fn$"]].forEach(function (pair) {
    const s = read(pair[0]);
    const n = s.split(pair[1]).length - 1;
    ok(pair[0] + " — " + pair[1] + " 가 짝수개다 (" + n + ")", n % 2 === 0, String(n));
  });
}

/* =========================================================================
 * [11] 대표가 읽을 안내가 있다
 *      소급 못 하는 부분을 '못 한다' 고 적었는가
 * ========================================================================= */
section("[11] 소급 못 하는 것을 못 한다고 적었다");
{
  const s = read(GUARD);
  ok("[1-b] 절이 있다", s.indexOf("[1-b]") >= 0);
  ok("왜 소급을 못 하는지 적혀 있다", s.indexOf("되돌리기 전 지갑") >= 0);
  ok("추측으로 채우지 않았다고 적혀 있다", s.indexOf("추측") >= 0);
  ok("account_reset 지난 사용분을 바꾸는 update 가 없다",
    stripComments(s).split(";").every(function (st) {
      return !(/update\s+public\.trading_accounts/i.test(st) && /account_reset/i.test(st));
    }));
  ok("되돌리는 방법이 적혀 있다", s.indexOf("[되돌리기]") >= 0);
  ok("account_reset 만 따로 되돌리는 방법도 적혀 있다", s.indexOf("(4) 재충전 이용권으로 쌓인") >= 0);
}

console.log("\n통과 " + pass + " / 실패 " + fail);
process.exit(fail === 0 ? 0 : 1);
