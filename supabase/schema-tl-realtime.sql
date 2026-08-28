-- =========================================================================
-- TL 을 "거래할 때마다 실시간 지급" 으로 바꿉니다  (2026-08-24, 대표 지시)
-- =========================================================================
-- ⚠ 이 파일은 대표님이 Supabase SQL Editor 에서 직접 실행하십니다.
--   1절은 읽기만 하는 미리보기입니다. 숫자를 먼저 보시고 2절부터 실행하세요.
--   여러 번 실행해도 안전합니다(중복 지급되지 않습니다).
--   회원 정보·거래기록을 지우거나 초기화하는 문장은 이 파일에 하나도 없습니다.
--   이 파일에는 DELETE / UPDATE / TRUNCATE / DROP TABLE 이 없습니다. INSERT 만 합니다.
--
--   ★ 이 파일이 supabase/schema-tl-monthly.sql 을 대체합니다.
--     옛 파일은 기록으로만 남겨 두었고, 열어서 실행해도 아무 일이 없게 막아 두었습니다.
--
-- ── 무엇이 바뀌나 ───────────────────────────────────────────────────────
--   공식은 하나도 바꾸지 않았습니다. "언제 주는가" 만 바뀝니다.
--
--       (전) 달이 끝나면 관리자가 한 달치를 몰아서 지급
--       (후) 거래를 닫을 때마다 그 자리에서 지급
--
--   공식 (그대로)
--       성과 = floor( 300 × log2( 1 + max(0, 누적순수익) / 10,000,000 ) )
--       참여 = (거래가 있었던 "날짜 수") × 5,  상한 150
--
--   달 단위가 아니라 "가입 이후 누적" 으로 봅니다.
--   참여 TL 은 누적이라 결국 상한 150 에서 멈춥니다. 그것이 의도입니다.
--
--   성과 구간 (이 파일의 함수가 실제로 내는 값)
--       누적순수익 0          →     0 TL
--       누적순수익 1,000만    →   300 TL
--       누적순수익 3,000만    →   600 TL
--       누적순수익 7,000만    →   900 TL
--       누적순수익 1억        → 1,037 TL
--       누적순수익 10억       → 1,997 TL
--   손실이면 성과 0 입니다. 음수 TL 은 주지 않습니다.
--
-- ── 핵심 — 누적 기준 "차액" 지급 ────────────────────────────────────────
--   거래가 하나 저장될 때마다 이렇게 계산합니다.
--
--       받아야_할_총TL = 성과(그 회원의 누적 순수익) + 참여(누적 거래날짜수)
--       이번_지급액     = max(0, 받아야_할_총TL − 이미_받은_총TL)
--
--   ★ "이번 거래의 수익" 으로 계산하면 절대 안 됩니다.
--     그러면 익절 → 손절 을 반복해서 무한히 적립할 수 있습니다.
--     반드시 손실이 이미 차감된 "누적 순수익" 으로 계산하고,
--     지금까지 준 합계를 뺍니다.
--
--   ▸ 지급액이 0 이하면 아무것도 하지 않습니다. 이미 준 TL 을 회수하지 않습니다.
--   ▸ 지급액이 양수일 때만 tl_transactions 에 한 줄 남깁니다.
--
--   검산 (참여 TL 은 뺀 값입니다. 실제로는 여기에 더해집니다)
--
--     순서 | 그 거래   | 누적 순수익 | 받아야 할 총TL | 이미 받은 | 이번 지급
--     -----+-----------+-------------+----------------+-----------+----------
--       1  | +1,000만  |   1,000만   |      300       |     0     |   300
--       2  | -1,000만  |        0    |        0       |   300     |     0
--       3  | +1,000만  |   1,000만   |      300       |   300     |     0
--       4  | +2,000만  |   3,000만   |      600       |   300     |   300
--
--   2번에서 음수(-300)를 주지 않습니다. 손실을 봐도 TL 을 뺏지 않습니다.
--   3번에서 다시 300 을 주지 않습니다. 익절·손절 반복으로 못 긁습니다.
--   9절 (사) 에서 이 표를 서버가 직접 계산해 보여줍니다.
--
-- ── "누적 순수익" 을 무엇으로 보나 ──────────────────────────────────────
--   새로 정의하지 않았습니다. 이 프로젝트가 이미 쓰는 확정손익 정의 그대로,
--   거기서 "그 달" 조건만 뺀 것입니다.
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
--   아래 tl_total_profit() 이 서버에서 같은 식을 그대로 계산합니다.
--   테이커율 0.05% 는 docs/인계문서.md 3번 "수수료" 와 같은 값입니다.
--
-- ── 날짜는 한국시간 (Asia/Seoul) ────────────────────────────────────────
--   trades.created_at 은 timestamptz 라 세계표준시(UTC)로 저장됩니다.
--   그냥 ::date 로 자르면 서버 시간대(UTC) 기준이 되고, 한국은 UTC+9 라서
--   한국시간 9월 1일 오전 3시 거래가 8월 31일로 잡힙니다.
--   한국 서비스이므로 날짜를 전부 한국시간으로 셉니다.
--       (created_at at time zone 'Asia/Seoul')::date
--
-- ── 실행 순서 ───────────────────────────────────────────────────────────
--   0. (선행) schema-admin-patch.sql · schema-rank-1000.sql 이 이미 적용돼 있어야 합니다.
--      am_i_admin() 이 필요하고, 계급(rank_points_all)이 tl_earned 에서 떨어져 있어야 합니다.
--   1절  미리보기 SELECT — 아무것도 바뀌지 않습니다. 숫자만 봅니다
--   2절  tl_transactions 준비 (타입 확장 · 인덱스)
--   3절  누적 순수익 / 누적 거래날짜수 / 받아야 할 총TL 계산 함수
--   4절  차액 지급 함수 (트리거 전용 — 회원은 직접 못 부릅니다)
--   5절  tl_earned() · tl_balance() · tl_balance_info() 를 "저장된 값" 기준으로 교체
--   6절  trades 에 after insert 트리거 걸기  ← 여기서부터 실시간이 됩니다
--   7절  이미 쌓여 있는 거래분 한 번에 지급 (밀린 것 채우기)
--   8절  일회성 보정 지급 실행  ← 반드시 7절 다음
--   9절  확인
--
-- ── 대표님이 하실 일 (2026-08-26 고침) ──────────────────────────────────
--   이 파일 하나를 통째로 복사해 SQL Editor 에 붙여넣고 Run 을 한 번 누르시면
--   끝납니다. 다른 파일을 따로 돌리실 필요가 없습니다.
--
--   "Potential issues detected" 가 뜨면 Run without RLS 를 누르시면 됩니다.
--   새 표를 만들지 않으므로 RLS 와 무관합니다.
--
--   ★ 결과에서 이 두 줄을 꼭 봐 주세요.
--       ① 맨 위  '선행조건_확인'          — '✅' 여야 합니다
--       ② 8절 뒤 '밀린것채우기_보정지급_결과' — '✅' 로 시작해야 합니다
--     둘 중 하나라도 '⚠' 면 그 문장을 그대로 보내 주세요.
--
-- ── 2026-08-26 에 세 번 실패했던 것을 이 파일에서 고쳤습니다 ────────────
--   (전) 7절에서 '관리자가 아니다(not_admin)' 로 멈췄고,
--        SQL Editor 는 파일 전체를 한 덩어리로 처리하기 때문에
--        2~6절(함수·트리거)까지 통째로 되돌아가 서버에 아무것도 남지 않았습니다.
--        그래서 그 다음에 '그런 함수가 없다(tl_grant_diff)' 오류가 이어졌습니다.
--   (후) 7절·8절을 실행하는 자리만 바꿨습니다. 계산식·함수 내용·관리자 잠금은
--        한 글자도 바꾸지 않았습니다. 자세한 설명은 8절 끝에 적어 두었습니다.
--
-- ── 지금 서버 상태가 궁금하시면 ─────────────────────────────────────────
--   supabase/조사-TL실시간-서버상태-2026-08-26.sql 을 먼저 Run 해 보세요.
--   읽기만 하는 파일이라 아무것도 바뀌지 않습니다.
-- =========================================================================


-- =========================================================================
-- 1절) 미리보기 — 읽기 전용입니다. 아무것도 바뀌지 않습니다.
-- =========================================================================
-- 회원별로 "지금 TL / 바뀐 뒤 TL / 차액 / 보정지급 / 최종 보유TL" 을 보여줍니다.
-- 차액이 음수인 회원은 8절의 보정 지급으로 그만큼 채워 주므로
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

-- (나) 새 방식: 누적 성과 + 누적 참여 + 이미 받은 별도 지급/환불(양수 기록)
cross join lateral (
  select
      (
        select
            floor(round(300 * log(2, (1 + greatest(0, coalesce(누적.순수익, 0)) / 10000000)::numeric), 6))
          + least(150, coalesce(누적.거래날짜수, 0) * 5)
        from (
          select
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
        ) as 누적
      )
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
-- 2절) tl_transactions 준비 — 타입 확장 · 인덱스
-- =========================================================================
-- 새 표를 만들지 않습니다. 이미 있는 tl_transactions 를 그대로 씁니다.

-- (가) 어느 시점 몫인지 적어 둘 칸(옛 월 정산과 호환용). 실시간 지급은 비어 있습니다(null).
alter table public.tl_transactions
  add column if not exists period date;

comment on column public.tl_transactions.period is
  '옛 월 정산(type=monthly) 이 어느 달 몫인지. 실시간 지급(type=realtime) 은 null.';

-- (나) 타입에 'realtime'(실시간 지급)을 더합니다.
--     'monthly' 는 옛 방식 기록이 남아 있을 수 있어 허용 목록에 그대로 둡니다.
--     기존 'spend' / 'refund' / 'grant' / 'migration' 도 그대로 둡니다.
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
      check (type in ('spend','refund','grant','monthly','migration','realtime'))
  $sql$;
end
$do$;

-- (다) 전환 보정 지급은 회원당 평생 1번만 들어갑니다(서버에서 막기).
create unique index if not exists uq_tl_tx_migration_once
  on public.tl_transactions (user_id)
  where type = 'migration';

-- (라) 옛 월 정산 기록이 남아 있어도 한 회원 한 달에 한 줄까지만.
create unique index if not exists uq_tl_tx_monthly_once
  on public.tl_transactions (user_id, period)
  where type = 'monthly';

-- (마) "이미 받은 총TL" 을 빨리 더하려고 씁니다.
create index if not exists idx_tl_tx_user_type
  on public.tl_transactions (user_id, type);


-- =========================================================================
-- 3절) 계산 함수 — 누적 순수익 / 누적 거래날짜수 / 받아야 할 총TL
-- =========================================================================

-- (가) 누적 순수익 = Σ(pnl) − Σ(진입수수료).  달 조건이 없습니다.
--     맨 위 "누적 순수익을 무엇으로 보나" 참고. js/realized-pnl-fix.js 와 같은 식입니다.
create or replace function public.tl_total_profit(p_uid uuid)
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
  where t.user_id = p_uid;
$fn$;

-- (나) 거래가 "있었던 날짜 수". 거래 건수가 아닙니다.
--     하루에 몇 번을 하든 그 날은 1로 셉니다. 이것이 무한 적립을 막는 핵심입니다.
create or replace function public.tl_total_days(p_uid uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(count(distinct (t.created_at at time zone 'Asia/Seoul')::date), 0)::integer
  from public.trades t
  where t.user_id = p_uid;
$fn$;

-- (다) 받아야 할 총TL = 성과 + 참여
--     성과 = floor(300 × log2(1 + max(0, 누적순수익) / 10,000,000))   손실이면 0
--     참여 = 누적 거래날짜수 × 5, 최대 150
--     ※ round(..., 6) 은 값을 바꾸려는 게 아니라 자릿수 오차 방어입니다.
--       log(2, 2) 가 0.9999999999999999 로 나오면 floor 가 300 대신 299 를 냅니다.
--       소수점 6자리에서 한 번 반올림한 뒤 내림하면 1,000만 = 300 처럼
--       딱 떨어지는 구간이 어긋나지 않습니다.
create or replace function public.tl_total_amount(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select
      floor(round(300 * log(2, (1 + greatest(0, public.tl_total_profit(p_uid))
                                    / 10000000)::numeric), 6))
    + least(150, public.tl_total_days(p_uid) * 5);
$fn$;

-- (라) 이미 받은 총TL — 성과·참여 몫으로 나간 것만 셉니다.
--     'realtime' 이 지금 방식, 'monthly' 는 옛 월 정산 기록입니다.
--     보정지급(migration)·이벤트지급(grant)·환불(refund)은 여기 넣지 않습니다.
--     넣으면 보정을 많이 받은 회원이 앞으로 영영 성과 TL 을 못 받게 됩니다.
create or replace function public.tl_paid_total(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select sum(x.amount) from public.tl_transactions x
                    where x.user_id = p_uid
                      and x.type in ('realtime', 'monthly')), 0);
$fn$;

grant execute on function public.tl_total_profit(uuid) to authenticated;
grant execute on function public.tl_total_days(uuid) to authenticated;
grant execute on function public.tl_total_amount(uuid) to authenticated;
grant execute on function public.tl_paid_total(uuid) to authenticated;


-- =========================================================================
-- 4절) 차액 지급 함수 — 트리거 전용
-- =========================================================================
--       이번_지급액 = max(0, 받아야_할_총TL − 이미_받은_총TL)
--
-- ⚠ 이 함수는 회원이 직접 부를 수 없어야 합니다. 부를 수 있으면
--   "나에게 TL 주세요" 를 스스로 실행하는 셈이 됩니다.
--   PostgreSQL 은 함수를 만들면 기본으로 PUBLIC 에게 실행 권한을 줍니다.
--   그래서 아래에서 반드시 회수(revoke)합니다.
create or replace function public.tl_grant_diff(p_uid uuid, p_ref uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $fn$
declare
  should numeric;      -- 받아야 할 총TL
  paid   numeric;      -- 이미 받은 총TL
  diff   numeric;      -- 이번 지급액
begin
  if p_uid is null then
    return 0;
  end if;

  -- 같은 회원의 거래가 동시에 두 건 들어와도 두 번 지급되지 않게 줄을 세웁니다.
  -- 트랜잭션이 끝나면 자동으로 풀립니다.
  perform pg_advisory_xact_lock(hashtextextended(p_uid::text, 0));

  should := coalesce(public.tl_total_amount(p_uid), 0);
  paid   := coalesce(public.tl_paid_total(p_uid), 0);
  diff   := should - paid;

  -- 0 이하면 아무것도 하지 않습니다. 이미 준 TL 을 회수하지 않습니다.
  if diff is null or diff <= 0 then
    return 0;
  end if;

  insert into public.tl_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (p_uid, 'realtime', diff, public.tl_balance(p_uid) + diff,
     '거래 실시간 TL 지급', p_ref);

  return diff;
end;
$fn$;

-- 회원이 스스로 TL 을 지급하지 못하게 막습니다.
-- (트리거는 security definer 함수 안에서 부르므로 영향을 받지 않습니다.)
revoke all on function public.tl_grant_diff(uuid, uuid) from public;
revoke all on function public.tl_grant_diff(uuid, uuid) from anon;
revoke all on function public.tl_grant_diff(uuid, uuid) from authenticated;


-- =========================================================================
-- 5절) 보유 TL 을 "저장된 지급 기록" 으로 바꿉니다
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
--     는 한 글자도 고치지 않아도 됩니다.
--     'granted' 만 뜻을 좁혔습니다 — 성과·참여 지급을 뺀 "별도 지급/환불" 입니다.
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
                         and x.type not in ('realtime', 'monthly')), 0);

  return json_build_object(
    'logged_in', true,
    'earned', earned,
    'spent', spent,
    'granted', granted,
    -- 잔액은 반드시 tl_balance() 와 같아야 합니다. 구매 가능 여부도 그 함수로 봅니다.
    'balance', public.tl_balance(uid));
end;
$fn$;

grant execute on function public.tl_balance_info() to authenticated;


-- =========================================================================
-- 6절) trades 에 트리거 — 여기서부터 "실시간" 이 됩니다
-- =========================================================================
-- 거래기록이 한 줄 저장되면(after insert) 그 회원에게 차액을 지급합니다.
--
-- ★ 가장 중요한 것 — TL 계산이 실패해도 거래 저장은 반드시 성공해야 합니다.
--   회원의 거래기록이 먼저입니다. TL 은 덤입니다.
--   덤을 계산하다 오류가 났다고 회원 거래기록이 날아가면 안 됩니다.
--
--   그래서 지급 부분 전체를 begin ... exception when others then ... end 로 감쌌습니다.
--   plpgsql 은 exception 절이 있는 블록에 들어갈 때 암묵적으로 SAVEPOINT 를 잡습니다.
--   블록 안에서 어떤 오류가 나든 그 블록이 한 일만 되돌리고,
--   블록 바깥(= 회원의 거래 INSERT)은 그대로 남은 채 트리거가 정상 종료합니다.
--   after insert 트리거라 return 값은 무시되지만, 관례대로 new 를 돌려줍니다.
create or replace function public.tl_on_trade_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  begin
    perform public.tl_grant_diff(new.user_id, new.id);
  exception when others then
    -- TL 지급이 실패해도 거래 저장은 성공시킵니다. 조용히 넘어갑니다.
    return new;
  end;
  return new;
end;
$fn$;

-- ※ 이 트리거 함수에는 일부러 revoke 를 걸지 않았습니다.
--   트리거 함수(returns trigger)는 직접 부르면 PostgreSQL 이
--   "trigger functions can only be called as triggers" 오류를 내므로,
--   실행 권한이 남아 있어도 회원이 이것으로 TL 을 받을 수는 없습니다.
--   반대로 여기에 revoke 를 걸었다가, 만에 하나 트리거가 발동할 때
--   실행 권한을 본다면 회원의 거래 저장이 통째로 실패합니다.
--   거래 저장이 먼저이므로 그 위험을 아예 만들지 않았습니다.
--   실제로 막아야 하는 것은 금액을 넣는 tl_grant_diff() 이고, 그쪽은 4절에서 막았습니다.
--   tl_grant_diff() 는 이 함수(security definer) 안에서 불리므로
--   회원 권한이 아니라 함수 소유자 권한으로 실행됩니다.

drop trigger if exists trg_tl_on_trade_insert on public.trades;
create trigger trg_tl_on_trade_insert
  after insert on public.trades
  for each row execute function public.tl_on_trade_insert();


-- =========================================================================
-- 7절) 밀린 것 채우기 — 이미 쌓여 있는 거래분을 한 번에 지급
-- =========================================================================
-- 6절 트리거는 "앞으로 들어올" 거래만 잡습니다.
-- 지금까지 쌓인 거래분은 이 함수가 같은 차액 공식으로 한 번에 지급합니다.
-- 여러 번 불러도 두 번 지급되지 않습니다(두 번째부터는 차액이 0 이 됩니다).
create or replace function public.tl_settle_all_past()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  amt numeric;
  n integer := 0;
  total numeric := 0;
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;

  for r in select pr.id as uid from public.profiles pr
  loop
    amt := coalesce(public.tl_grant_diff(r.uid), 0);
    if amt > 0 then
      n := n + 1;
      total := total + amt;
    end if;
  end loop;

  return json_build_object('ok', true, 'paid_members', n, 'total_tl', total);
end;
$fn$;

grant execute on function public.tl_settle_all_past() to authenticated;

-- 실행은 8절 끝에서 7절·8절을 한 번에 돌립니다. 순서가 중요해서 한 곳에 모았습니다.
-- (여기서 바로 부르면 8절 함수가 아직 만들어지지 않은 상태라 순서를 갈라 놓을 수 없습니다.)


-- =========================================================================
-- 8절) 일회성 보정 지급 — 아무도 TL 이 줄지 않게 합니다
-- =========================================================================
-- ⚠ 반드시 7절(밀린 것 채우기) 다음에 실행하세요. 순서가 바뀌면 보정액이 과하게 나갑니다.
--
-- 계산식을 바꾸면 기존 회원이 갖고 있던 TL 이 확 줄어듭니다.
-- 회원 입장에서는 재산이 사라지는 것이라, 줄어드는 만큼 그대로 채워 줍니다.
--
--   보정액 = max(0,  옛 방식 획득 TL  −  이번에 새로 지급된 성과·참여 합계 )
--
--   · 양수면 그 차액을 'migration' 기록으로 지급합니다
--   · 0 이거나 음수면 아무것도 하지 않습니다 — 뺏지 않습니다
--   · 회원당 평생 1번만 지급됩니다(uq_tl_tx_migration_once)
--
-- 왜 "옛 획득 − 새 지급합계" 인가
--   옛 보유 = 옛공식 + (기존 기록 합계)
--   새 보유 = (기존 기록 합계) + 새지급합계 + 보정액
--   두 값이 같아지려면 보정액 = 옛공식 − 새지급합계 입니다.
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
  paid_sum numeric;
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

    paid_sum := coalesce(public.tl_paid_total(r.uid), 0);

    diff := legacy - paid_sum;
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

grant execute on function public.tl_migrate_legacy() to authenticated;

-- ── 7절·8절 실행 ──────────────────────────────────────────────────────────
-- 여기서 7절(밀린 것 채우기) → 8절(보정 지급) 을 순서대로 한 번에 돌립니다.
--
-- ⚠ 왜 그냥 select 로 부르지 않고 이렇게 감쌌나 — 2026-08-26 에 세 번 실패한 이유입니다.
--
--   ① 관리자 확인이 이 창(SQL Editor)에서는 언제나 실패합니다
--      7절·8절 함수는 맨 앞에서 "지금 부르는 사람이 관리자냐" 를 묻습니다.
--      그런데 SQL Editor 는 화면에 로그인한 회원이 아니라 서버 자신으로 돌아갑니다.
--      그래서 "지금 부르는 사람" 이 비어 있고, 관리자 확인이 항상 실패했습니다.
--      화면에서 관리자로 로그인해도 이 창과는 별개입니다.
--
--      ★ 함수의 관리자 잠금은 한 글자도 풀지 않았습니다.
--        대신 이 실행에 한해서만, 관리자 명단에 있는 사람 한 명의 자격을
--        잠깐 빌려 씁니다. 아래 set_config 의 맨 뒤 true 가
--        "이 실행이 끝나면 저절로 풀린다" 는 뜻입니다.
--        회원 화면·권한에는 아무 영향이 없습니다.
--
--   ② 마지막에 오류가 나면 앞의 것까지 전부 없던 일이 됩니다
--      SQL Editor 는 파일 전체를 한 덩어리로 처리합니다.
--      그래서 7절에서 터지면 2~6절(함수·트리거)까지 통째로 되돌아갑니다.
--      실제로 그렇게 되어 서버에는 아무것도 올라가 있지 않았습니다.
--      → 7절·8절을 "오류를 삼키는 블록" 으로 감쌌습니다.
--        여기서 무슨 일이 나도 2~6절은 그대로 저장되고,
--        무엇이 잘못됐는지는 바로 아래 결과표에 글자로 나옵니다.
--
-- 여러 번 실행해도 안전합니다. 두 번째부터는 줄 것이 없어 아무 일도 하지 않습니다.
do $run$
declare
  v_admin   uuid;
  v_settle  json;
  v_migrate json;
begin
  perform set_config('tl.run_result', '', false);

  begin
    -- (가) 관리자 명단에서 한 명을 고릅니다. 그 사람 자격을 잠깐 빌립니다.
    select a.user_id into v_admin
      from public.admin_users a
      order by a.created_at
      limit 1;

    if v_admin is null then
      perform set_config('tl.run_result',
        '⚠ 관리자 명단(admin_users)이 비어 있어 7절·8절을 건너뛰었습니다. '
        || '2~6절(함수·트리거)은 정상 저장됐습니다. '
        || 'supabase/schema-admin-patch.sql 을 먼저 Run 하신 뒤 이 파일을 다시 Run 하세요.',
        false);
      return;
    end if;

    -- (나) 이 실행에 한해서만 "나는 이 관리자다" 로 봅니다. 끝나면 저절로 풀립니다.
    perform set_config('request.jwt.claim.sub', v_admin::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin)::text, true);

    -- (다) 반드시 7절 먼저, 그 다음 8절. 순서가 바뀌면 보정액이 과하게 나갑니다.
    select into v_settle  public.tl_settle_all_past() as 밀린것_지급결과;
    select into v_migrate public.tl_migrate_legacy() as 보정지급_결과;

    -- (라) 빌려 썼던 자격을 바로 되돌립니다.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', '', true);

    perform set_config('tl.run_result',
      '✅ 7절 밀린 것 채우기 ' || coalesce(v_settle::text, '(결과 없음)')
      || '   /   8절 보정 지급 ' || coalesce(v_migrate::text, '(결과 없음)'), false);

  exception when others then
    -- 여기서 무슨 일이 나도 2~6절(함수·트리거)은 그대로 저장됩니다.
    perform set_config('tl.run_result',
      '⚠ 7절·8절만 실패했습니다 — ' || sqlstate || ' ' || sqlerrm
      || ' / 2~6절(함수·트리거)은 정상 저장됐습니다. 이 문장을 그대로 보내 주세요.', false);
  end;
end
$run$;

-- ★ 여기서 나온 결과는 이 파일 맨 끝 10절의 표 '① 실행 결과' 칸에 그대로 나옵니다.
--   Supabase 는 명령이 여러 개면 맨 마지막 것만 보여 주기 때문에, 꼭 보셔야 할 것을
--   맨 뒤에 모아 두었습니다. 여기서는 아무것도 출력하지 않습니다.


-- =========================================================================
-- 9절) 확인
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

-- (나) 트리거가 제대로 걸렸는지 — 한 줄 나와야 하고 'AFTER INSERT' 여야 합니다.
select t.tgname                as 트리거이름,
       pg_get_triggerdef(t.oid) as 정의
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'trades'
  and t.tgname = 'trg_tl_on_trade_insert';

-- (다) 회원이 스스로 TL 을 지급할 수 없는지 — 둘 다 false 여야 정상입니다.
select
  has_function_privilege('authenticated', 'public.tl_grant_diff(uuid,uuid)', 'execute') as 회원이_지급함수_실행가능,
  has_function_privilege('anon',          'public.tl_grant_diff(uuid,uuid)', 'execute') as 비회원이_지급함수_실행가능;

-- (라) 회원별 TL — 실시간 지급 / 보정 / 별도지급 / 사용 / 보유
select
  p.nickname                                                            as 닉네임,
  round(coalesce(sum(x.amount) filter (where x.type = 'realtime'), 0))  as 실시간지급TL,
  round(coalesce(sum(x.amount) filter (where x.type = 'monthly'), 0))   as 옛월정산TL,
  round(coalesce(sum(x.amount) filter (where x.type = 'migration'), 0)) as 보정TL,
  round(coalesce(sum(x.amount) filter (where x.amount > 0
                                         and x.type not in ('realtime','monthly','migration')), 0))
                                                                        as 별도지급TL,
  round(coalesce(-sum(x.amount) filter (where x.amount < 0), 0))        as 사용TL,
  round(public.tl_balance(p.id))                                        as 보유TL
from public.profiles p
left join public.tl_transactions x on x.user_id = p.id
group by p.id, p.nickname
order by 보유TL desc;

-- (마) 과지급이 없는지 — "이미 받은 총TL" 이 "받아야 할 총TL" 을 넘는 회원.
--     보정지급(migration)은 여기 안 들어가므로, 결과가 0줄이어야 정상입니다.
select p.nickname                          as 닉네임,
       round(public.tl_total_amount(p.id)) as 받아야할_총TL,
       round(public.tl_paid_total(p.id))   as 이미받은_총TL
from public.profiles p
where public.tl_paid_total(p.id) > public.tl_total_amount(p.id);

-- (바) 성과 구간이 표와 맞는지 (회원 데이터와 무관한 순수 계산 확인)
select v.순수익,
       floor(round(300 * log(2, (1 + greatest(0, v.순수익) / 10000000)::numeric), 6)) as 성과TL
from (values (0::numeric), (10000000), (30000000), (70000000), (100000000), (1000000000))
     as v(순수익);

-- (사) 검산 — 맨 위 4단계 표가 이 공식으로 그대로 나오는지 서버가 직접 계산합니다.
--     참여 TL 은 뺀 값입니다(성과만 봅니다). 이번지급 이 300 / 0 / 0 / 300 이어야 정상입니다.
with 단계(순서, 누적순수익, 이미받은) as (
  values (1, 10000000::numeric,   0::numeric),
         (2,        0::numeric, 300::numeric),
         (3, 10000000::numeric, 300::numeric),
         (4, 30000000::numeric, 300::numeric)
)
select 순서,
       누적순수익,
       floor(round(300 * log(2, (1 + greatest(0, 누적순수익) / 10000000)::numeric), 6)) as 받아야할_총TL,
       이미받은,
       greatest(0,
         floor(round(300 * log(2, (1 + greatest(0, 누적순수익) / 10000000)::numeric), 6))
         - 이미받은)                                                                   as 이번지급
from 단계
order by 순서;


-- =========================================================================
-- 10절) ★ 대표님이 보실 표 — 맨 마지막 결과가 이것입니다
-- =========================================================================
-- Supabase SQL Editor 는 명령이 여러 개면 "맨 마지막 것" 만 보여 줍니다.
-- 그래서 꼭 보셔야 할 것을 한 표에 모아 맨 뒤에 두었습니다.
-- 이 표를 캡처해서 보내 주시면 됩니다.
--
--   ① 실행 결과      '✅' 로 시작하면 끝난 것입니다. '⚠' 면 그 문장을 그대로 보내 주세요
--   ② 실시간 트리거   거래할 때마다 TL 을 주는 장치가 걸렸는지
--   ③ 지급된 TL      이번에 얼마가 나갔는지
--   ④ 회원별 최종    회원마다 지금 TL 이 얼마인지
select 구분, 항목, 값
from (

  select
    1                                   as 순서,
    1                                   as 하위,
    '① 실행 결과'                        as 구분,
    '7절 밀린 것 채우기 · 8절 보정 지급'   as 항목,
    coalesce(nullif(current_setting('tl.run_result', true), ''),
             '(결과를 남기지 못했습니다 — PM에게 알려 주세요)')::text as 값

  union all

  select
    2, 1, '② 실시간 트리거', 'trg_tl_on_trade_insert',
    (case when exists (
            select 1
              from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = 'trades'
               and t.tgname  = 'trg_tl_on_trade_insert')
          then '✅ 걸렸습니다 — 이제 거래를 닫을 때마다 TL 이 바로 들어갑니다'
          else '❌ 안 걸렸습니다 — PM에게 알려 주세요' end)::text

  union all

  select
    3, 1, '③ 지급된 TL', '실시간 지급(realtime) 누적',
    (coalesce(count(*) filter (where x.type = 'realtime'), 0)::text || '줄 / 합계 '
     || round(coalesce(sum(x.amount) filter (where x.type = 'realtime'), 0))::text || ' TL')::text
  from public.tl_transactions x

  union all

  select
    3, 2, '③ 지급된 TL', '보정 지급(migration) 누적',
    (coalesce(count(*) filter (where x.type = 'migration'), 0)::text || '줄 / 합계 '
     || round(coalesce(sum(x.amount) filter (where x.type = 'migration'), 0))::text || ' TL')::text
  from public.tl_transactions x

  union all

  select
    4, 1, '④ 회원별 최종', p.nickname::text,
    ('보유 ' || round(public.tl_balance(p.id))::text || ' TL'
     || '  (획득 ' || round(public.tl_earned(p.id))::text
     || ' / 사용 ' || round(coalesce((select -sum(x.amount) from public.tl_transactions x
                                       where x.user_id = p.id and x.amount < 0), 0))::text || ')')::text
  from public.profiles p

) as 결과
order by 결과.순서, 결과.하위, 결과.항목;


-- =========================================================================
-- 11절) 되돌리는 방법  (읽기만 하세요. 아래는 실행되는 문장이 아니라 설명입니다)
-- =========================================================================
-- 이 파일은 회원 기록을 지우거나 바꾸지 않습니다. 더하기만 합니다.
--
-- ① "거래할 때마다 주는 것" 만 멈추고 싶을 때 — 트리거만 떼면 됩니다.
--    이미 지급된 TL 은 그대로 남습니다.
--
--        drop trigger if exists trg_tl_on_trade_insert on public.trades;
--
--    (다시 켜려면 이 파일을 다시 Run 하시면 됩니다.)
--
-- ② "보유 TL 을 옛 계산으로 되돌리고 싶을 때"
--    schema-tl-hotdeal.sql 의 옛 tl_earned() 정의를 다시 Run 하면 됩니다.
--    다만 그 파일은 봉인돼 있고, 옛 공식은 손해를 봐도 TL 이 쌓이는 방식입니다.
--    되돌리기 전에 반드시 PM·대표 확인을 받으세요.
--
-- ③ "이번에 지급된 TL 기록 자체를 없애고 싶을 때"
--    tl_transactions 에서 type 이 'realtime' 과 'migration' 인 줄이 이번에 생긴 것입니다.
--    ★ 회원의 재산 기록이라 이 파일에는 지우는 문장을 일부러 넣지 않았습니다.
--      정말 필요하면 PM에게 말씀해 주세요. 지우기 전에 몇 줄인지 먼저 세어 봅니다.
--
--        select type, count(*) from public.tl_transactions
--         where type in ('realtime','migration') group by type;
--
-- ④ 이 파일을 여러 번 Run 해도 안전합니다.
--    함수는 덮어쓰기(create or replace), 인덱스는 없을 때만 만들기(if not exists),
--    지급은 "받아야 할 만큼에서 이미 받은 만큼을 뺀 차액" 이라 두 번째부터는 0 입니다.
--    보정 지급은 회원당 평생 1번만 들어갑니다(uq_tl_tx_migration_once).
-- =========================================================================
