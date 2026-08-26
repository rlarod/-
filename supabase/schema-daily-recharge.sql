-- =========================================================================
-- 지갑 초기화 (100,000 USDT) — 자정(한국시간) 기준 하루 2회
-- =========================================================================
-- 변경 이력
--   2026-08-18: 오전 6시 기준 하루 1회 -> 자정 기준 하루 2회 (사장님 지시)
--   2026-08-26: 무료 충전(더하기) -> 지갑 초기화(덮어쓰기) (대표 지시)
--
--   대표 지시 원문: "이거를 지갑 초기화로 하자 / 지갑 초기화 100,000usdt 충전
--                   두번씩 충전되고 그러니까 초기화 충전이 맞는거 같음"
--
--   (전) 잔고 30,000 에서 두 번 누르면 230,000
--   (후) 잔고가 얼마든 누르면 100,000. 두 번 눌러도 100,000
--
--   ⚠ 잔고가 100,000 보다 많은 회원은 돈이 줄어듭니다.
--     그래서 화면에서 누르기 전에 숫자로 확인 창을 띄웁니다(js/daily-recharge.js).
--     하루 2회 제한·자정 리셋·포지션 보유 중 금지는 전부 그대로입니다.
--
-- 이 파일은 기존 테이블/데이터를 전혀 삭제하지 않습니다.
--   - ADD COLUMN IF NOT EXISTS      : 이미 있으면 그대로 둠
--   - CREATE OR REPLACE FUNCTION    : 함수 정의만 교체(재실행 안전)
-- DROP TABLE / TRUNCATE / DELETE 는 하나도 없습니다.
--
-- 왜 서버에서 처리하나:
--   충전 횟수를 브라우저(localStorage)에만 기록하면 사용자가 지우고
--   무한히 충전할 수 있습니다. 그래서 "몇 번 충전했는지"와 "포지션이
--   있는지"를 모두 서버에서 확인하고, 잔고도 서버에서 정합니다.
-- =========================================================================

-- ---------------- 기록용 컬럼 ----------------
alter table public.trading_accounts
  add column if not exists last_recharge_at timestamptz;

-- 계급 계산에서 빼야 할 '무상으로 받은 돈' 누계입니다.
-- (supabase/schema-rank-1000.sql 에도 같은 칸이 있습니다. 어느 쪽을 먼저 돌려도 되게 양쪽에 둔 것입니다.)
alter table public.trading_accounts
  add column if not exists recharge_total numeric not null default 0;

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
  bal numeric;
  -- 초기화 뒤 지갑에 남길 금액.
  -- ★ claim_daily_recharge() 의 AMOUNT 와 반드시 같은 값이어야 합니다.
  --   화면은 이 값으로 "얼마가 어떻게 된다" 를 미리 보여 줍니다.
  AMOUNT constant numeric := 100000;
begin
  if uid is null then
    return json_build_object('can_claim', false, 'reason', 'not_logged_in',
                             'used', 0, 'remaining', 0, 'max_per_day', max_per_day,
                             'balance', 0, 'target', AMOUNT, 'delta', 0);
  end if;

  select last_recharge_at, coalesce(recharge_count, 0), coalesce(balance, 0)
    into last_at, cnt, bal
    from public.trading_accounts where user_id = uid;

  bal := coalesce(bal, 0);

  -- 마지막 충전이 오늘 자정보다 이전이면 오늘은 아직 0회입니다.
  used := case when last_at is not null and last_at >= period_start then cnt else 0 end;
  remaining := greatest(max_per_day - used, 0);

  select exists(select 1 from public.positions where user_id = uid) into has_pos;

  if has_pos then
    return json_build_object('can_claim', false, 'reason', 'has_position',
                             'used', used, 'remaining', remaining,
                             'max_per_day', max_per_day, 'next_at', next_at,
                             'balance', bal, 'target', AMOUNT, 'delta', AMOUNT - bal);
  end if;

  if remaining <= 0 then
    return json_build_object('can_claim', false, 'reason', 'already_claimed',
                             'used', used, 'remaining', 0,
                             'max_per_day', max_per_day, 'next_at', next_at,
                             'balance', bal, 'target', AMOUNT, 'delta', AMOUNT - bal);
  end if;

  return json_build_object('can_claim', true, 'reason', 'ok',
                           'used', used, 'remaining', remaining,
                           'max_per_day', max_per_day, 'next_at', next_at,
                           'balance', bal, 'target', AMOUNT, 'delta', AMOUNT - bal);
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
  old_balance numeric;   -- 초기화하기 전 지갑에 있던 돈
  new_balance numeric;
  -- 초기화 뒤 지갑에 남길 금액. 예전에는 '더할 금액' 이었고
  -- 지금은 '만들어 둘 금액' 입니다. 값은 같습니다(100,000).
  -- ★ 금액은 여기서만 정합니다. 브라우저가 정하면 조작됩니다.
  AMOUNT constant numeric := 100000;
begin
  if uid is null then
    raise exception 'not_logged_in';
  end if;

  -- 같은 사용자의 동시 요청으로 두 번 충전되는 것을 막습니다.
  select last_recharge_at, coalesce(recharge_count, 0), coalesce(balance, 0)
    into last_at, cnt, old_balance
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

  -- ★ 2026-08-26 대표 지시 — 더하기(balance + AMOUNT)에서 덮어쓰기로 바꾸었습니다.
  --   두 번 누르면 두 번 쌓이던 것을 막습니다. 언제 눌러도 결과는 항상 100,000 입니다.
  --
  -- 계급 회계(recharge_total) — '무상으로 받은 돈' 만 쌓습니다.
  --   받은 돈 = AMOUNT - least(AMOUNT, 이전잔고)  =  max(0, AMOUNT - 이전잔고)
  --
  --     이전잔고  30,000 → 받은 돈 70,000  (지갑은 100,000 이 됨)
  --     이전잔고 500,000 → 받은 돈      0  (받은 게 아니라 버린 것입니다)
  --
  --   왜 이렇게 하나
  --     · 돈이 늘어나는 경우: 늘어난 만큼 그대로 쌓여서 계급이 한 칸도 안 움직입니다.
  --       (지금까지 '더하기' 때와 완전히 같은 결과입니다)
  --     · 돈이 줄어드는 경우: 버린 것이라 0 을 쌓고, 지갑이 줄은 만큼 계급도 내려갑니다.
  --       (2026-08-24 대표 결정 "계급은 지갑에 있는 돈으로 평가" 와 같은 방향)
  --     · 이 누계는 절대 줄지 않습니다(음수 없음).
  --       음수가 되면 화면과 서버의 계급이 달라집니다
  --       (js/rank.js 와 rank_recharged_total() 이 음수를 0 으로 막아서).
  --
  -- 계급 공식(1000 × log2(자산/초기자금)) 은 한 글자도 안 건드렸습니다.
  update public.trading_accounts
     set balance = AMOUNT,
         last_recharge_at = now(),
         recharge_count = new_count,
         recharge_total = coalesce(recharge_total, 0) + AMOUNT - least(AMOUNT, greatest(0, old_balance)),
         updated_at = now()
   where user_id = uid
   returning balance into new_balance;

  return json_build_object('balance', new_balance, 'amount', AMOUNT,
                           'previous_balance', old_balance,
                           'delta', AMOUNT - old_balance,
                           'granted', AMOUNT - least(AMOUNT, greatest(0, old_balance)),
                           'used', new_count,
                           'remaining', greatest(max_per_day - new_count, 0),
                           'max_per_day', max_per_day, 'next_at', next_at);
end;
$$;

grant execute on function public.claim_daily_recharge to authenticated;
