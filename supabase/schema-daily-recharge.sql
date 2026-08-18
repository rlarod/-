-- =========================================================================
-- 무료 충전 (100,000 USDT) — 자정(한국시간) 기준 하루 2회
-- =========================================================================
-- 변경 이력
--   2026-08-18: 오전 6시 기준 하루 1회 -> 자정 기준 하루 2회 (사장님 지시)
--
-- 이 파일은 기존 테이블/데이터를 전혀 삭제하지 않습니다.
--   - ADD COLUMN IF NOT EXISTS      : 이미 있으면 그대로 둠
--   - CREATE OR REPLACE FUNCTION    : 함수 정의만 교체(재실행 안전)
-- DROP TABLE / TRUNCATE / DELETE 는 하나도 없습니다.
--
-- 왜 서버에서 처리하나:
--   충전 횟수를 브라우저(localStorage)에만 기록하면 사용자가 지우고
--   무한히 충전할 수 있습니다. 그래서 "몇 번 충전했는지"와 "포지션이
--   있는지"를 모두 서버에서 확인하고, 잔고도 서버에서 더합니다.
-- =========================================================================

-- ---------------- 기록용 컬럼 ----------------
alter table public.trading_accounts
  add column if not exists last_recharge_at timestamptz;

-- 하루 2회가 되면서 "언제 받았는지"만으로는 부족해 횟수를 같이 셉니다.
alter table public.trading_accounts
  add column if not exists recharge_count integer not null default 0;

-- ---------------- 하루 한도 ----------------
-- 한도를 바꿀 일이 있으면 이 함수 하나만 고치면 됩니다.
create or replace function public.recharge_max_per_day()
returns integer
language sql
immutable
as $$
  select 2;
$$;

-- ---------------- 오늘의 리셋 기준 시각(한국시간 자정) ----------------
-- 한국시간으로 오늘 00:00 입니다. 자정이 지나면 횟수가 새로 채워집니다.
create or replace function public.recharge_period_start()
returns timestamptz
language sql
stable
as $$
  select (date_trunc('day', now() at time zone 'Asia/Seoul')) at time zone 'Asia/Seoul';
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
  cnt integer;
  period_start timestamptz := public.recharge_period_start();
  next_at timestamptz := public.recharge_period_start() + interval '1 day';
  max_per_day integer := public.recharge_max_per_day();
  used integer;
  remaining integer;
  has_pos boolean;
begin
  if uid is null then
    return json_build_object('can_claim', false, 'reason', 'not_logged_in',
                             'used', 0, 'remaining', 0, 'max_per_day', max_per_day);
  end if;

  select last_recharge_at, coalesce(recharge_count, 0)
    into last_at, cnt
    from public.trading_accounts where user_id = uid;

  -- 마지막 충전이 오늘 자정보다 이전이면 오늘은 아직 0회입니다.
  used := case when last_at is not null and last_at >= period_start then cnt else 0 end;
  remaining := greatest(max_per_day - used, 0);

  select exists(select 1 from public.positions where user_id = uid) into has_pos;

  if has_pos then
    return json_build_object('can_claim', false, 'reason', 'has_position',
                             'used', used, 'remaining', remaining,
                             'max_per_day', max_per_day, 'next_at', next_at);
  end if;

  if remaining <= 0 then
    return json_build_object('can_claim', false, 'reason', 'already_claimed',
                             'used', used, 'remaining', 0,
                             'max_per_day', max_per_day, 'next_at', next_at);
  end if;

  return json_build_object('can_claim', true, 'reason', 'ok',
                           'used', used, 'remaining', remaining,
                           'max_per_day', max_per_day, 'next_at', next_at);
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
  cnt integer;
  period_start timestamptz := public.recharge_period_start();
  next_at timestamptz := public.recharge_period_start() + interval '1 day';
  max_per_day integer := public.recharge_max_per_day();
  used integer;
  new_count integer;
  has_pos boolean;
  new_balance numeric;
  AMOUNT constant numeric := 100000;
begin
  if uid is null then
    raise exception 'not_logged_in';
  end if;

  -- 같은 사용자의 동시 요청으로 두 번 충전되는 것을 막습니다.
  select last_recharge_at, coalesce(recharge_count, 0)
    into last_at, cnt
    from public.trading_accounts where user_id = uid for update;

  if not found then
    raise exception 'no_account';
  end if;

  select exists(select 1 from public.positions where user_id = uid) into has_pos;
  if has_pos then
    raise exception 'has_position';
  end if;

  used := case when last_at is not null and last_at >= period_start then cnt else 0 end;
  if used >= max_per_day then
    raise exception 'already_claimed';
  end if;
  new_count := used + 1;

  update public.trading_accounts
     set balance = balance + AMOUNT,
         last_recharge_at = now(),
         recharge_count = new_count,
         updated_at = now()
   where user_id = uid
   returning balance into new_balance;

  return json_build_object('balance', new_balance, 'amount', AMOUNT,
                           'used', new_count,
                           'remaining', greatest(max_per_day - new_count, 0),
                           'max_per_day', max_per_day, 'next_at', next_at);
end;
$$;

grant execute on function public.claim_daily_recharge to authenticated;
