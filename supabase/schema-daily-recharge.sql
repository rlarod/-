-- =========================================================================
-- 하루 1회 무료 충전 (100,000 USDT) — 오전 6시(한국시간) 기준 리셋
-- =========================================================================
-- 이 파일은 기존 테이블/데이터를 전혀 삭제하지 않습니다.
--   - ADD COLUMN IF NOT EXISTS : 이미 있으면 그대로 둠
--   - CREATE OR REPLACE FUNCTION : 함수 정의만 교체(재실행 안전)
-- DROP TABLE / TRUNCATE / DELETE 는 하나도 없습니다.
--
-- 왜 서버에서 처리하나:
--   충전 횟수를 브라우저(localStorage)에만 기록하면 사용자가 지우고
--   무한히 충전할 수 있습니다. 그래서 "언제 충전했는지"와 "포지션이
--   있는지"를 모두 서버에서 확인하고, 잔고도 서버에서 더합니다.
-- =========================================================================

-- ---------------- 마지막 충전 시각 기록 컬럼 ----------------
alter table public.trading_accounts
  add column if not exists last_recharge_at timestamptz;

-- ---------------- 오늘의 리셋 기준 시각(한국시간 오전 6시) ----------------
-- 지금이 오전 6시 이전이면 "어제 6시"가 기준이 됩니다.
create or replace function public.recharge_period_start()
returns timestamptz
language sql
stable
as $$
  select case
    when (now() at time zone 'Asia/Seoul') >=
         (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '6 hours')
    then (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '6 hours') at time zone 'Asia/Seoul'
    else (date_trunc('day', now() at time zone 'Asia/Seoul') + interval '6 hours' - interval '1 day') at time zone 'Asia/Seoul'
  end;
$$;

-- ---------------- 충전 가능 여부 조회(버튼 상태 표시용) ----------------
create or replace function public.recharge_status()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_at timestamptz;
  period_start timestamptz := public.recharge_period_start();
  has_pos boolean;
begin
  if uid is null then
    return json_build_object('can_claim', false, 'reason', 'not_logged_in');
  end if;

  select last_recharge_at into last_at
    from public.trading_accounts where user_id = uid;

  select exists(select 1 from public.positions where user_id = uid) into has_pos;

  if has_pos then
    return json_build_object(
      'can_claim', false, 'reason', 'has_position',
      'next_at', period_start + interval '1 day');
  end if;

  if last_at is not null and last_at >= period_start then
    return json_build_object(
      'can_claim', false, 'reason', 'already_claimed',
      'next_at', period_start + interval '1 day');
  end if;

  return json_build_object(
    'can_claim', true, 'reason', 'ok',
    'next_at', period_start + interval '1 day');
end;
$$;

grant execute on function public.recharge_status to authenticated;

-- ---------------- 실제 충전 ----------------
-- 클라이언트가 금액을 정하지 않습니다 — 서버에 박아둔 100,000만 더합니다.
create or replace function public.claim_daily_recharge()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  last_at timestamptz;
  period_start timestamptz := public.recharge_period_start();
  has_pos boolean;
  new_balance numeric;
  AMOUNT constant numeric := 100000;
begin
  if uid is null then
    raise exception 'not_logged_in';
  end if;

  -- 같은 사용자의 동시 요청으로 두 번 충전되는 것을 막습니다.
  select last_recharge_at into last_at
    from public.trading_accounts where user_id = uid for update;

  if not found then
    raise exception 'no_account';
  end if;

  select exists(select 1 from public.positions where user_id = uid) into has_pos;
  if has_pos then
    raise exception 'has_position';
  end if;

  if last_at is not null and last_at >= period_start then
    raise exception 'already_claimed';
  end if;

  update public.trading_accounts
     set balance = balance + AMOUNT,
         last_recharge_at = now(),
         updated_at = now()
   where user_id = uid
   returning balance into new_balance;

  return json_build_object('balance', new_balance, 'amount', AMOUNT);
end;
$$;

grant execute on function public.claim_daily_recharge to authenticated;
