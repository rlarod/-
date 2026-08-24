-- =========================================================================
-- TL 을 "월 정산 + 저장" 방식으로 바꿉니다  (2026-08-24)
-- =========================================================================
-- ⚠ 이 파일은 대표님이 Supabase SQL Editor 에서 직접 실행하십니다.
--   1절은 읽기만 하는 미리보기입니다. 숫자를 먼저 보시고 2절부터 실행하세요.
--   여러 번 실행해도 안전합니다(같은 달을 두 번 정산해도 중복 지급되지 않습니다).
--   회원 정보·거래기록을 지우거나 초기화하는 문장은 이 파일에 하나도 없습니다.
--   이 파일에는 DELETE / UPDATE / TRUNCATE / DROP TABLE 이 없습니다. INSERT 만 합니다.
--
-- ── 지금 무엇이 문제인가 ────────────────────────────────────────────────
--   지금 TL 은 schema-tl-hotdeal.sql 의 tl_earned() 가 매번 "계산" 합니다.
--       거래횟수 × 10  +  max(0, 수익률%) × 20  +  rank_points
--
--   1) 무한 구멍 — 0.001 BTC 를 1,000번 사고팔면 실력과 무관하게 10,000 TL.
--      상점 최고가가 500 TL 이니 공짜로 20개를 삽니다.
--   2) 계산식이라 계좌를 초기화하면 TL 이 통째로 사라집니다.
--      trades 가 비면 TL 도 0 이 됩니다. 회원은 "내 TL 어디갔지" 하게 됩니다.
--   3) 계급 점수(rank_points)가 TL 에 섞여 있습니다.
--      계급은 2026-08-24 에 "지갑에 있는 돈" 기준으로 바뀌었습니다(최대 9,381점).
--      그 점수가 그대로 TL 로 흘러들어갑니다. 계급과 TL 은 분리돼야 합니다.
--
-- ── 새 규칙 ─────────────────────────────────────────────────────────────
--   예산: 한 달에 만원(TL 1점 ≈ 10원) → 아주 잘한 회원이 한 달 1,000 TL 근처.
--
--       그달TL = 성과 + 참여
--       성과   = floor( 300 × log2( 1 + max(0, 그달순수익) / 10,000,000 ) )
--       참여   = (그 달에 거래가 있었던 "날짜 수") × 5     (상한 150)
--
--   ★ "거래 건수" 가 아니라 "거래한 날짜 수" 입니다.
--     하루에 500번을 해도 그날 몫은 5 TL 입니다. 이것이 구멍을 막는 핵심입니다.
--
--   성과 구간 (이 파일의 함수가 실제로 내는 값)
--       순수익 0          →     0 TL
--       순수익 1,000만    →   300 TL
--       순수익 3,000만    →   600 TL
--       순수익 7,000만    →   900 TL
--       순수익 1억        → 1,037 TL   (정확히 1037.83 → 내림)
--       순수익 10억       → 1,997 TL   (정확히 1997.46 → 내림)
--   손실인 달은 성과 0 입니다. 음수 TL 은 주지 않습니다. 참여 TL 은 그대로 줍니다.
--
-- ── "그달순수익" 을 무엇으로 보나 ───────────────────────────────────────
--   새로 만들지 않고 이 프로젝트가 이미 쓰는 확정손익 정의를 그대로 씁니다.
--
--   js/trading.js 는 청산할 때 이렇게 기록합니다(docs/인계문서.md 3번 "수수료").
--       trades.pnl = 총손익 − 청산수수료      ← 청산수수료는 이미 빠져 있음
--       trades.fee = 진입수수료 + 청산수수료  ← 왕복
--   그래서 sum(pnl) 은 진입수수료가 덜 빠진 값이고,
--        sum(pnl − fee) 는 청산수수료를 두 번 빼는 값입니다. 둘 다 틀립니다.
--
--   js/realized-pnl-fix.js 27줄이 확정손익을 이렇게 정의합니다.
--       realizedPnl = Σ(거래별 pnl) − Σ(거래별 진입수수료)
--       진입수수료  = fee − 청산수수료,  청산수수료 = 수량 × 청산가 × 테이커율
--       단, 강제청산은 trading.js 가 fee 에 진입수수료만 담으므로 fee 전체가 진입수수료
--   이 파일은 서버에서 같은 식을 그대로 계산합니다(아래 tl_month_profit).
--   테이커율 0.05% 는 docs/인계문서.md 3번 "수수료" 와 같은 값입니다.
--
-- ── 달의 경계는 한국시간 (Asia/Seoul) ──────────────────────────────────
--   trades.created_at 은 timestamptz 라 세계표준시(UTC)로 저장됩니다.
--   그냥 date_trunc('month', created_at) 으로 자르면 서버 시간대(UTC) 기준이 됩니다.
--   한국은 UTC+9 라서 이렇게 어긋납니다.
--
--       한국시간 9월 1일 오전 3시 거래  →  UTC 로는 8월 31일 오후 6시
--       → 회원은 9월에 벌었는데 8월 정산에 들어갑니다.
--
--   한국 서비스이므로 이 파일은 달·날짜를 전부 한국시간으로 셉니다.
--       달   : date_trunc('month', created_at at time zone 'Asia/Seoul')
--       날짜 : (created_at at time zone 'Asia/Seoul')::date
--   "이번 달인가"(아직 정산하면 안 되는 달) 판정도 같은 기준입니다.
--       date_trunc('month', now() at time zone 'Asia/Seoul')
--
--   period 칸(어느 달 몫인지)에도 한국시간 기준 달 1일이 들어갑니다.
--   계산과 저장이 같은 기준이라야 중복 정산 방지 인덱스가 제 달을 막습니다.
--   ※ 공식은 하나도 건들지 않았습니다.
--     구간별 TL(1,000만=300 · 3,000만=600 · 7,000만=900 · 10억=1,997)도 그대로입니다.
--     달 경계에 걸친 거래가 어느 달로 가느냐만 달라집니다.
--     그러니 그런 거래가 있는 회원은 합계가 조금 달라질 수 있습니다
--     (성과가 달마다 로그로 접히기 때문입니다).
--     한국시간이 회원이 체감하는 달이므로 이쪽이 맞습니다.
--
-- ── 실행 순서 ───────────────────────────────────────────────────────────
--   0. (선행) schema-admin-patch.sql · schema-rank-1000.sql 이 이미 적용돼 있어야 합니다.
--      am_i_admin() 이 필요하고, 계급(rank_points_all)이 tl_earned 에서 떨어져 있어야 합니다.
--   1절  미리보기 SELECT 를 돌려 숫자를 확인합니다 (아무것도 바뀌지 않습니다)
--   2절  tl_transactions 준비 (period 칸 · 타입 확장 · 중복 방지 인덱스)
--   3절  월 순수익 / 거래날짜수 / 그달TL 계산 함수
--   4절  tl_earned() · tl_balance() · tl_balance_info() 를 "저장된 값" 기준으로 교체
--   5절  월 정산 함수 (관리자 전용)
--   6절  지난 달 전부 정산 실행
--   7절  일회성 보정 지급 실행  ← 반드시 6절 다음
--   8절  확인
-- =========================================================================


-- =========================================================================
-- 1절) 미리보기 — 읽기 전용입니다. 아무것도 바뀌지 않습니다.
-- =========================================================================
-- 회원별로 "지금 TL / 바뀐 뒤 TL / 차액 / 보정지급" 을 보여줍니다.
-- 차액이 음수인 회원은 7절의 보정 지급으로 그만큼 채워 주므로
-- 맨 오른쪽 "최종_보유TL" 이 "지금_보유TL" 보다 작아지는 회원은 없어야 합니다.

-- (0) 먼저 이것부터 보세요 — 계급이 TL 에서 떨어져 있는가.
--     '⚠' 가 나오면 이 파일을 실행하지 마시고 schema-rank-1000.sql 을 먼저 돌리세요.
--     계급표(rank_points_all)가 아직 tl_earned() 를 쓰고 있으면,
--     TL 을 바꾸는 순간 모든 회원의 계급이 같이 무너집니다.
select case
         when pg_get_functiondef(f.oid) like '%tl_earned%'
           then '⚠ 멈춤 — 계급표가 아직 tl_earned 를 씁니다. schema-rank-1000.sql 을 먼저 실행하세요'
         else '✅ 계급은 TL 과 분리돼 있습니다 — 진행해도 됩니다'
       end as 선행조건_확인
from pg_proc f
join pg_namespace ns on ns.oid = f.pronamespace
where ns.nspname = 'public' and f.proname = 'rank_points_all';


-- (1) 회원별 TL 비교
select
  p.nickname                                              as 닉네임,
  round(옛.획득)                                          as 지금_획득TL,
  round(새.획득)                                          as 바뀐뒤_획득TL,
  round(새.획득 - 옛.획득)                                as 차액,
  round(greatest(0, 옛.획득 - 새.획득))                   as 보정지급,
  round(사용.합계)                                        as 사용TL,
  round(옛.획득 - 사용.합계)                              as 지금_보유TL,
  round(greatest(새.획득, 옛.획득) - 사용.합계)           as 최종_보유TL
from public.profiles p

-- (가) 지금 방식: 거래횟수 × 10 + max(0, 수익률%) × 20 + 계급점수
cross join lateral (
  select
      coalesce((select count(*) from public.trades t where t.user_id = p.id), 0) * 10
    + greatest(0, coalesce((
        select case when ta.initial_balance > 0
                    then (ta.realized_pnl / ta.initial_balance) * 100
                    else 0 end
        from public.trading_accounts ta where ta.user_id = p.id), 0)) * 20
    + coalesce(p.rank_points, 0)                          as 획득
) as 옛

-- (나) 새 방식: 달마다 (성과 + 참여) 를 더한 값 + 이미 받은 별도 지급/환불(양수 기록)
cross join lateral (
  select
      coalesce((
        select sum(
                 floor(round(300 * log(2, (1 + greatest(0, 월.순수익) / 10000000)::numeric), 6))
                 + least(150, 월.거래날짜수 * 5))
        from (
          select
            date_trunc('month', t.created_at at time zone 'Asia/Seoul')     as 달,
            sum(
              t.pnl
              - case
                  when coalesce(t.close_reason, '') = '강제청산'
                    then coalesce(t.fee, 0)
                  else greatest(0, coalesce(t.fee, 0)
                                   - coalesce(t.quantity, 0) * coalesce(t.exit_price, 0) * 0.0005)
                end
            )                                                               as 순수익,
            count(distinct (t.created_at at time zone 'Asia/Seoul')::date)  as 거래날짜수
          from public.trades t
          where t.user_id = p.id
          group by date_trunc('month', t.created_at at time zone 'Asia/Seoul')
        ) as 월), 0)
    + coalesce((select sum(x.amount) from public.tl_transactions x
                 where x.user_id = p.id and x.amount > 0), 0)     as 획득
) as 새

-- (다) 이미 쓴 TL (음수 기록의 절대값)
cross join lateral (
  select coalesce((select -sum(x.amount) from public.tl_transactions x
                    where x.user_id = p.id and x.amount < 0), 0)  as 합계
) as 사용

order by 차액 asc;


-- =========================================================================
-- 2절) tl_transactions 준비 — 칸 추가 · 타입 확장 · 중복 지급 방지
-- =========================================================================
-- 새 표를 만들지 않습니다. 이미 있는 tl_transactions 를 그대로 씁니다.

-- (가) 어느 달의 정산인지 적어 둘 칸. 기존 기록은 비어 있어도(null) 됩니다.
alter table public.tl_transactions
  add column if not exists period date;

comment on column public.tl_transactions.period is
  '월 정산(type=monthly)이 어느 달 몫인지. 한국시간(Asia/Seoul) 기준 그 달 1일. 다른 타입은 null.';

-- (나) 타입에 'monthly'(월 정산)와 'migration'(전환 보정 지급)을 더합니다.
--     기존 'spend' / 'refund' / 'grant' 는 그대로 둡니다.
--     제약 이름이 다를 수 있어 type 칸에 걸린 검사 제약을 찾아 바꿉니다.
do $do$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace ns on ns.oid = cl.relnamespace
    where ns.nspname = 'public'
      and cl.relname = 'tl_transactions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%spend%'
  loop
    execute format('alter table public.tl_transactions drop constraint %I', c.conname);
  end loop;

  execute $sql$
    alter table public.tl_transactions
      add constraint tl_transactions_type_check
      check (type in ('spend','refund','grant','monthly','migration'))
  $sql$;
end
$do$;

-- (다) 같은 달을 두 번 정산해도 두 번 지급되지 않게 막습니다(서버에서 막기).
--     회원 1명 + 달 1개 = 월 정산 기록 1줄까지만 들어갑니다.
create unique index if not exists uq_tl_tx_monthly_once
  on public.tl_transactions (user_id, period)
  where type = 'monthly';

-- (라) 전환 보정 지급은 회원당 평생 1번만 들어갑니다.
create unique index if not exists uq_tl_tx_migration_once
  on public.tl_transactions (user_id)
  where type = 'migration';

create index if not exists idx_tl_tx_type_period
  on public.tl_transactions (type, period);


-- =========================================================================
-- 3절) 계산 함수 — 그 달 순수익 / 거래한 날짜 수 / 그달 TL
-- =========================================================================

-- (가) 그 달 순수익 = Σ(pnl) − Σ(진입수수료)
--     맨 위 주석 "그달순수익을 무엇으로 보나" 참고. js/realized-pnl-fix.js 와 같은 식입니다.
--     ※ 달 경계는 한국시간(Asia/Seoul) 기준입니다. 맨 위 "달의 경계는 한국시간" 참고.
create or replace function public.tl_month_profit(p_uid uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(
      t.pnl
      - case
          when coalesce(t.close_reason, '') = '강제청산'
            then coalesce(t.fee, 0)                       -- 강제청산은 fee 에 진입수수료만 들어감
          else greatest(0, coalesce(t.fee, 0)
                           - coalesce(t.quantity, 0) * coalesce(t.exit_price, 0) * 0.0005)
        end
    ), 0)
  from public.trades t
  where t.user_id = p_uid
    and date_trunc('month', t.created_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp);
$fn$;

-- (나) 그 달에 거래가 "있었던 날짜 수". 거래 건수가 아닙니다.
--     하루에 몇 번을 하든 그 날은 1로 셉니다.
create or replace function public.tl_month_days(p_uid uuid, p_month date)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(count(distinct (t.created_at at time zone 'Asia/Seoul')::date), 0)::integer
  from public.trades t
  where t.user_id = p_uid
    and date_trunc('month', t.created_at at time zone 'Asia/Seoul')
        = date_trunc('month', p_month::timestamp);
$fn$;

-- (다) 그달TL = 성과 + 참여
--     성과 = floor(300 × log2(1 + max(0, 순수익) / 10,000,000))   손실이면 0
--     참여 = 거래날짜수 × 5, 최대 150
--     ※ round(..., 6) 은 값을 바꾸려는 게 아니라 자릿수 오차 방어입니다.
--       log(2, 2) 가 0.9999999999999999 로 나오면 floor 가 300 대신 299 를 냅니다.
--       소수점 6자리에서 한 번 반올림한 뒤 내림하면 1,000만 = 300 처럼
--       딱 떨어지는 구간이 어긋나지 않습니다.
create or replace function public.tl_month_amount(p_uid uuid, p_month date)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select
      floor(round(300 * log(2, (1 + greatest(0, public.tl_month_profit(p_uid, p_month))
                                    / 10000000)::numeric), 6))
    + least(150, public.tl_month_days(p_uid, p_month) * 5);
$fn$;

grant execute on function public.tl_month_profit to authenticated;
grant execute on function public.tl_month_days to authenticated;
grant execute on function public.tl_month_amount to authenticated;


-- =========================================================================
-- 4절) 보유 TL 을 "저장된 지급 기록" 으로 바꿉니다
-- =========================================================================
-- 이제 tl_earned() 는 계산하지 않고 tl_transactions 에 남은 지급 기록만 더합니다.
-- 계좌를 초기화해서 trades 가 비어도 TL 은 사라지지 않습니다.
-- 계급 점수(rank_points)도 더 이상 TL 에 섞이지 않습니다.

-- (가) 획득 TL = 지금까지 지급된 기록(양수)의 합
create or replace function public.tl_earned(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select sum(x.amount) from public.tl_transactions x
                    where x.user_id = p_uid and x.amount > 0), 0);
$fn$;

-- (나) 보유 TL = 획득 − 사용
create or replace function public.tl_balance(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select public.tl_earned(p_uid)
       - coalesce((select -sum(x.amount) from public.tl_transactions x
                    where x.user_id = p_uid and x.amount < 0), 0);
$fn$;

-- (다) 화면 표시용 — json 키(logged_in / earned / spent / granted / balance)는
--     예전과 똑같습니다. js/tl-hotdeal.js · js/tl-market.js · js/tl-balance-sync.js
--     는 고치지 않아도 됩니다.
--     'granted' 만 뜻을 좁혔습니다 — 월 정산을 뺀 "별도 지급/환불" 입니다.
--     그러지 않으면 화면에 "획득 1,000 · 지급 1,000" 처럼 같은 숫자가 두 번 보입니다.
create or replace function public.tl_balance_info()
returns json
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  earned numeric;
  spent numeric;
  granted numeric;
begin
  if uid is null then
    return json_build_object(
      'logged_in', false, 'earned', 0, 'spent', 0, 'granted', 0, 'balance', 0);
  end if;

  earned := public.tl_earned(uid);

  spent := coalesce((select -sum(x.amount) from public.tl_transactions x
                     where x.user_id = uid and x.amount < 0), 0);

  granted := coalesce((select sum(x.amount) from public.tl_transactions x
                       where x.user_id = uid and x.amount > 0
                         and x.type <> 'monthly'), 0);

  return json_build_object(
    'logged_in', true,
    'earned', earned,
    'spent', spent,
    'granted', granted,
    -- 잔액은 반드시 tl_balance() 와 같아야 합니다. 구매 가능 여부도 그 함수로 봅니다.
    'balance', public.tl_balance(uid));
end;
$fn$;

grant execute on function public.tl_balance_info to authenticated;


-- =========================================================================
-- 5절) 월 정산 함수 (관리자만)
-- =========================================================================
-- 한 달 몫을 계산해 tl_transactions 에 'monthly' 기록으로 남깁니다.
-- 같은 달을 두 번 불러도 두 번 지급되지 않습니다(존재 확인 + 유니크 인덱스).
create or replace function public.tl_settle_month(p_month date)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  m date;
  r record;
  amt numeric;
  bal numeric;
  n integer := 0;
  skipped integer := 0;
  total numeric := 0;
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;
  if p_month is null then
    raise exception 'month_required';
  end if;

  -- p_month 는 날짜(date)라 시간대가 없습니다. 그대로 그 달 1일로 맞춥니다.
  -- 이 값이 period 칸에 들어갑니다. 위 계산 함수도 같은 기준(한국시간 달)이라
  -- 중복 정산 방지 인덱스가 엉뚱한 달을 막는 일이 없습니다.
  m := date_trunc('month', p_month::timestamp)::date;

  -- 아직 안 끝난 이번 달은 정산하지 않습니다.
  -- 중간에 잠가버리면 남은 날의 성과가 영영 안 들어가기 때문입니다.
  -- "이번 달" 도 한국시간 기준입니다. 한국시간 9월 1일 새벽에
  -- 8월 정산을 돌릴 수 있어야 합니다(세계표준시로는 아직 8월 31일).
  if m >= date_trunc('month', now() at time zone 'Asia/Seoul')::date then
    raise exception 'month_not_finished';
  end if;

  for r in select pr.id as uid from public.profiles pr
  loop
    -- 이미 정산된 달이면 건너뜁니다(중복 지급 방지 1차).
    if exists (select 1 from public.tl_transactions x
                where x.user_id = r.uid and x.type = 'monthly' and x.period = m) then
      skipped := skipped + 1;
      continue;
    end if;

    amt := public.tl_month_amount(r.uid, m);
    if amt is null or amt <= 0 then
      continue;                                   -- 거래가 없던 달은 기록을 남기지 않습니다
    end if;

    bal := public.tl_balance(r.uid) + amt;

    -- 중복 지급 방지 2차 — 유니크 인덱스(uq_tl_tx_monthly_once)가 막습니다.
    insert into public.tl_transactions
      (user_id, type, amount, balance_after, description, period)
    values
      (r.uid, 'monthly', amt, bal,
       to_char(m, 'YYYY년 MM월') || ' 월간 정산', m)
    on conflict do nothing;

    n := n + 1;
    total := total + amt;
  end loop;

  return json_build_object(
    'ok', true, 'month', m, 'paid_members', n, 'skipped', skipped, 'total_tl', total);
end;
$fn$;

grant execute on function public.tl_settle_month to authenticated;


-- 지난 달까지 아직 정산 안 된 달을 전부 정산합니다(거래가 있었던 달만).
create or replace function public.tl_settle_all_past()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  mrow record;
  one json;
  months integer := 0;
  total numeric := 0;
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;

  for mrow in
    select distinct date_trunc('month', t.created_at at time zone 'Asia/Seoul')::date as m
    from public.trades t
    where date_trunc('month', t.created_at at time zone 'Asia/Seoul')
        < date_trunc('month', now() at time zone 'Asia/Seoul')
    order by 1
  loop
    one := public.tl_settle_month(mrow.m);
    months := months + 1;
    total := total + coalesce((one ->> 'total_tl')::numeric, 0);
  end loop;

  return json_build_object('ok', true, 'months', months, 'total_tl', total);
end;
$fn$;

grant execute on function public.tl_settle_all_past to authenticated;


-- =========================================================================
-- 6절) 실행 — 지난 달까지 전부 정산
-- =========================================================================
-- 관리자 계정으로 SQL Editor 에 로그인한 상태여야 합니다(am_i_admin).
select public.tl_settle_all_past() as 월정산_결과;


-- =========================================================================
-- 7절) 일회성 보정 지급 — 아무도 TL 이 줄지 않게 합니다
-- =========================================================================
-- ⚠ 반드시 6절(월 정산) 다음에 실행하세요. 순서가 바뀌면 보정액이 과하게 나갑니다.
--
-- 계산식을 바꾸면 기존 회원이 갖고 있던 TL 이 확 줄어듭니다.
-- 회원 입장에서는 재산이 사라지는 것이라, 줄어드는 만큼 그대로 채워 줍니다.
--
--   보정액 = max(0,  옛 방식 획득 TL  −  이번에 새로 지급된 월 정산 합계 )
--
--   · 양수면 그 차액을 'migration' 기록으로 지급합니다
--   · 0 이거나 음수면 아무것도 하지 않습니다 — 뺏지 않습니다
--   · 회원당 평생 1번만 지급됩니다(uq_tl_tx_migration_once)
--
-- 왜 "옛 획득 − 월정산합계" 인가
--   옛 보유 = 옛공식 + (기존 기록 합계)
--   새 보유 = (기존 기록 합계) + 월정산합계 + 보정액
--   두 값이 같아지려면 보정액 = 옛공식 − 월정산합계 입니다.
--   기존에 받은 별도 지급(grant/refund)은 양쪽에 똑같이 들어 있어 상쇄됩니다.
create or replace function public.tl_migrate_legacy()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  legacy numeric;
  monthly_sum numeric;
  diff numeric;
  bal numeric;
  n integer := 0;
  total numeric := 0;
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;

  for r in select pr.id as uid from public.profiles pr
  loop
    -- 이미 보정받았으면 건너뜁니다(두 번 지급 방지).
    if exists (select 1 from public.tl_transactions x
                where x.user_id = r.uid and x.type = 'migration') then
      continue;
    end if;

    -- 옛 방식 획득 TL — schema-tl-hotdeal.sql 의 예전 tl_earned() 와 같은 식입니다.
    legacy :=
        coalesce((select count(*) from public.trades t where t.user_id = r.uid), 0) * 10
      + greatest(0, coalesce((
          select case when ta.initial_balance > 0
                      then (ta.realized_pnl / ta.initial_balance) * 100
                      else 0 end
          from public.trading_accounts ta where ta.user_id = r.uid), 0)) * 20
      + coalesce((select pr2.rank_points from public.profiles pr2 where pr2.id = r.uid), 0);

    monthly_sum := coalesce((select sum(x.amount) from public.tl_transactions x
                              where x.user_id = r.uid and x.type = 'monthly'), 0);

    diff := legacy - monthly_sum;
    if diff is null or diff <= 0 then
      continue;                                   -- 줄지 않는 회원은 아무것도 안 합니다
    end if;

    bal := public.tl_balance(r.uid) + diff;

    insert into public.tl_transactions
      (user_id, type, amount, balance_after, description)
    values
      (r.uid, 'migration', diff, bal, 'TL 계산방식 변경 보정 지급(1회)')
    on conflict do nothing;

    n := n + 1;
    total := total + diff;
  end loop;

  return json_build_object('ok', true, 'members', n, 'total_tl', total);
end;
$fn$;

grant execute on function public.tl_migrate_legacy to authenticated;

-- 실행
select public.tl_migrate_legacy() as 보정지급_결과;


-- =========================================================================
-- 8절) 확인
-- =========================================================================

-- (가) 계급이 TL 과 분리돼 있는지. '⚠' 가 나오면 schema-rank-1000.sql 을 먼저 실행하세요.
select case
         when pg_get_functiondef(p.oid) like '%tl_earned%'
           then '⚠ rank_points_all 이 아직 tl_earned 를 씁니다 — schema-rank-1000.sql 을 먼저 실행하세요'
         else '✅ 계급은 TL 과 분리돼 있습니다'
       end as 계급_분리_확인
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'rank_points_all';

-- (나) 회원별 TL — 월 정산 / 보정 / 사용 / 보유
select
  p.nickname                                                            as 닉네임,
  round(coalesce(sum(x.amount) filter (where x.type = 'monthly'), 0))   as 월정산TL,
  round(coalesce(sum(x.amount) filter (where x.type = 'migration'), 0)) as 보정TL,
  round(coalesce(sum(x.amount) filter (where x.amount > 0
                                         and x.type not in ('monthly','migration')), 0))
                                                                        as 별도지급TL,
  round(coalesce(-sum(x.amount) filter (where x.amount < 0), 0))        as 사용TL,
  round(public.tl_balance(p.id))                                        as 보유TL
from public.profiles p
left join public.tl_transactions x on x.user_id = p.id
group by p.id, p.nickname
order by 보유TL desc;

-- (다) 달별 정산 내역 — 한 달에 얼마가 나갔는지
select
  x.period                       as 정산달,
  count(*)                       as 지급회원수,
  round(sum(x.amount))           as 지급TL합계,
  round(max(x.amount))           as 최고지급TL,
  round(sum(x.amount)) * 10      as 대략_원화환산
from public.tl_transactions x
where x.type = 'monthly'
group by x.period
order by x.period desc;

-- (라) 중복 지급이 없는지 — 결과가 0줄이어야 정상입니다.
select x.user_id, x.period, count(*) as 줄수
from public.tl_transactions x
where x.type = 'monthly'
group by x.user_id, x.period
having count(*) > 1;

-- (마) 성과 구간이 표와 맞는지 (회원 데이터와 무관한 순수 계산 확인)
select v.순수익,
       floor(round(300 * log(2, (1 + greatest(0, v.순수익) / 10000000)::numeric), 6)) as 성과TL
from (values (0::numeric), (10000000), (30000000), (70000000), (100000000), (1000000000))
     as v(순수익);
