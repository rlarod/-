-- =========================================================================
-- fix-realized-pnl-200.sql
--   200건으로 잘린 실현손익이 서버 원본을 덮어쓰는 것을 서버에서 막습니다
-- =========================================================================
-- ★ 먼저 supabase/check-realized-pnl-200.sql 을 Run 해서 몇 명이
--   걸려 있는지 보세요. 그 파일은 읽기만 합니다. ★
--
--   '걸린_회원수' 가 0 이면 이 파일을 Run 해도 지금 바뀌는 숫자가
--   하나도 없습니다. 앞으로를 막아두는 것뿐입니다.
--
-- 여러 번 돌려도 안전합니다 (idempotent).
--   · create or replace function / drop trigger if exists + create trigger
--   · DELETE / TRUNCATE / DROP TABLE 이 하나도 없습니다
--   · WHERE 없는 UPDATE 가 하나도 없습니다
--
-- =========================================================================
-- 왜 서버에서 막나 — 화면 쪽은 손댈 수 없습니다
-- =========================================================================
--   js/trading.js:68        MAX_CLOSED_TRADES = 200        수정 금지 파일
--   js/auth.js:363          .limit(200)                    수정 금지 파일
--   js/supabase-sync.js:56  realized_pnl: snapshot.realizedPnl   수정 금지 파일
--
--   세 파일 다 못 고칩니다. 그래서 서버가 마지막에 걸러냅니다.
--
--   js/sync-guard.js 도 이 경우는 못 막습니다 — 200건 상한에 닿은 저장은
--   '데이터 유실이 아니다' 라고 보고 일부러 통과시킵니다
--   (js/sync-guard.js:79 의 tradeCount < 200 조건).
--
-- =========================================================================
-- 무엇이 '정답' 인가
-- =========================================================================
--   public.trades 입니다.
--     · js/supabase-sync.js 는 새 거래만 추가할 뿐 지우지 않습니다
--     · schema-trades-dedupe.sql 이 (user_id, created_at) 유일 인덱스로
--       중복을 막습니다
--   → 서버 trades 에는 200건 상한이 없습니다. 전부 남아 있습니다.
--
--   누적 실현손익 = 이번 사이클 거래들의 pnl 합계
--
--   ⚠ 이것은 새로운 계산식이 아닙니다. js/trading.js:634-637 이 하는 것과
--     ★똑같은 식★ 입니다. 다른 점은 '200건만' 이 아니라 '전부' 라는 것뿐입니다.
--     손익·청산·랭킹·계급 계산식은 한 글자도 안 건드립니다.
--
-- =========================================================================
-- 어디에 영향이 있나 (코드를 직접 읽고 확인)
-- =========================================================================
--   마이페이지 '누적 실현손익'  ★고쳐집니다★  (js/cycle-pnl.js:55)
--   랭킹                         원래 영향 없음 (정본 뷰는 trades 를 직접 셉니다)
--   계급                         원래 영향 없음 (rank_assets 는 지갑 기준)
--
-- =========================================================================
-- 초기화·사이클 넘김과 부딪히지 않게 한 것 (중요)
-- =========================================================================
--   (가) 사이클 넘김 — start_new_cycle()
--        realized_pnl = 0 과 cycle_no + 1 을 한 번에 바꿉니다.
--        아래 트리거는 ★새 cycle_no★ 로 계산하므로 새 사이클 거래 0건 → 0.
--        그대로 0 이 됩니다. 부딪히지 않습니다.
--
--   (나) 시즌 초기화 — reset_season() / force_starting_balance() / 관리자 초기화
--        realized_pnl = 0 을 먼저 하고 그 뒤에 trades 를 지웁니다.
--        먼저 하는 UPDATE 때는 거래가 아직 남아 있어서 트리거가 옛 합계로
--        되돌려 놓습니다. 그래서 ★trades 를 지울 때 다시 맞추는 트리거★ 를
--        같이 답니다(아래 2번). 지우고 나면 합계가 0 이라 0 이 됩니다.
--
--   이 두 가지를 같이 달아야 초기화가 안 깨집니다. 하나만 달지 마세요.
--
-- =========================================================================
-- 되돌리는 방법은 맨 아래 [되돌리기] 절에 있습니다 (두 줄입니다).
-- =========================================================================


-- ---------------- 0) 상한값을 한 곳에서 관리 ----------------
-- js/trading.js:68 의 MAX_CLOSED_TRADES 와 같은 값이어야 합니다.
-- 그 파일이 바뀌면 여기도 같이 바꿔주세요.
create or replace function public.client_trade_cap()
returns integer
language sql
immutable
as $fn$
  select 200;
$fn$;


-- ---------------- 1) 잘린 값이 들어오면 서버 값으로 되돌리기 ----------------
-- trading_accounts.realized_pnl 을 바꾸려는 저장이 들어올 때,
-- 그 회원의 이번 사이클 거래가 200건을 넘었으면 브라우저 값을 버리고
-- 서버에 쌓인 전체 합계로 바꿔 넣습니다.
--
--   · 200건 이하면 아무것도 하지 않습니다 — 브라우저 값이 이미 정확합니다
--   · 오류를 내지 않습니다. 조용히 값만 바로잡습니다.
--     오류를 내면 화면이 '저장 실패' 로 보고 무한히 재시도합니다.
--   · balance 등 다른 칸은 건드리지 않습니다.
create or replace function public.keep_full_realized_pnl()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  trade_cnt bigint;
  server_sum numeric;
begin
  -- realized_pnl 을 안 건드리는 저장이면 그냥 통과.
  if new.realized_pnl is not distinct from old.realized_pnl then
    return new;
  end if;

  -- ★ new.cycle_no 로 셉니다.
  --   사이클을 넘기는 UPDATE 는 realized_pnl = 0 과 cycle_no + 1 을 함께
  --   바꾸므로, 새 사이클 기준으로 세야 0 건 → 0 이 나옵니다.
  select count(*), coalesce(sum(t.pnl), 0)
    into trade_cnt, server_sum
    from public.trades t
   where t.user_id = new.user_id
     and coalesce(t.cycle_no, 1) = coalesce(new.cycle_no, 1);

  if trade_cnt > public.client_trade_cap() then
    new.realized_pnl := server_sum;
  end if;

  return new;
end;
$fn$;

drop trigger if exists trg_keep_full_realized_pnl on public.trading_accounts;
create trigger trg_keep_full_realized_pnl
  before update on public.trading_accounts
  for each row
  execute function public.keep_full_realized_pnl();


-- ---------------- 2) 거래가 지워지면 누적을 다시 맞추기 ----------------
-- 시즌 초기화는 realized_pnl = 0 을 먼저 하고 trades 를 나중에 지웁니다.
-- 위 1번 트리거가 그 0 을 옛 합계로 되돌려 놓기 때문에, 지운 뒤에 한 번 더
-- 맞춰야 합니다. 지우고 나면 남은 거래가 없으니 0 이 됩니다.
--
-- 한 건씩이 아니라 ★한 번의 DELETE 당 한 번★ 만 돕니다(전환 표 사용).
-- 시즌 초기화처럼 수천 건을 한꺼번에 지워도 느려지지 않습니다.
create or replace function public.resync_realized_pnl_on_trade_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.trading_accounts ta
     set realized_pnl = coalesce((
           select sum(t.pnl)
             from public.trades t
            where t.user_id = ta.user_id
              and coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)), 0),
         updated_at = now()
   where ta.user_id in (select distinct user_id from del_rows);
   -- WHERE 가 있으므로 Supabase 안전장치(safeupdate)를 통과합니다.
  return null;
end;
$fn$;

drop trigger if exists trg_resync_realized_pnl_del on public.trades;
create trigger trg_resync_realized_pnl_del
  after delete on public.trades
  referencing old table as del_rows
  for each statement
  execute function public.resync_realized_pnl_on_trade_delete();


-- ---------------- 3) 새 거래가 들어오면 누적을 다시 맞추기 ----------------
-- 브라우저가 계정 저장(1번)과 거래 저장을 따로 보내기 때문에, 순서에 따라
-- 마지막 거래 한 건이 누적에서 빠질 수 있습니다. 거래가 들어올 때 한 번 더
-- 맞춰서 그 틈을 없앱니다.
--
-- 200건을 넘긴 회원만 손댑니다 — 그 아래는 브라우저 값이 이미 정확합니다.
create or replace function public.resync_realized_pnl_on_trade_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.trading_accounts ta
     set realized_pnl = coalesce((
           select sum(t.pnl)
             from public.trades t
            where t.user_id = ta.user_id
              and coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)), 0),
         updated_at = now()
   where ta.user_id in (select distinct user_id from ins_rows)
     and (select count(*)
            from public.trades t
           where t.user_id = ta.user_id
             and coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1))
         > public.client_trade_cap();
  return null;
end;
$fn$;

drop trigger if exists trg_resync_realized_pnl_ins on public.trades;
create trigger trg_resync_realized_pnl_ins
  after insert on public.trades
  referencing new table as ins_rows
  for each statement
  execute function public.resync_realized_pnl_on_trade_insert();


-- ---------------- 4) 이미 틀어져 있는 회원 바로잡기 ----------------
-- 지금 200건을 넘겨서 이미 값이 틀린 회원만 한 번 맞춥니다.
-- (200건 이하인 회원은 손대지 않습니다)
--
-- ⚠ 바꾸기 전 값을 아래 표에 백업합니다. 되돌릴 때 이 표를 씁니다.
-- ※ 일부러 auth.users 를 참조(FK)하지 않습니다.
--   이 표는 회원 데이터가 아니라 ★관리용 감사 기록★ 입니다.
--   "우리가 누구의 realized_pnl 을 얼마에서 얼마로 바꿨다" 는 기록이라,
--   회원이 탈퇴해도 남아 있어야 되돌리기와 대조가 가능합니다.
--   FK 를 걸면 탈퇴와 함께 사라져서 감사 기록의 뜻이 없어집니다.
--   (남는 것은 uuid 한 개뿐이라 개인정보가 아닙니다)
create table if not exists public.realized_pnl_backfill_log (
  user_id            uuid        not null,
  cycle_no           int         not null,
  realized_pnl_before numeric    not null,
  realized_pnl_after  numeric    not null,
  trade_count        bigint      not null,
  done_at            timestamptz not null default now(),
  primary key (user_id, cycle_no)
);

alter table public.realized_pnl_backfill_log enable row level security;
-- 관리용이라 회원 정책을 열지 않습니다.

-- (4-1) 먼저 ★바꾸기 전 값을 백업★ 합니다. 이 단계에서는 회원 데이터가
--       하나도 안 바뀝니다. 백업표에 기록만 남습니다.
insert into public.realized_pnl_backfill_log
  (user_id, cycle_no, realized_pnl_before, realized_pnl_after, trade_count)
select
  g.user_id,
  g.cycle_no,
  coalesce(ta.realized_pnl, 0)  as realized_pnl_before,
  g.합계                         as realized_pnl_after,
  g.건수                         as trade_count
from (
  select t.user_id,
         coalesce(ta2.cycle_no, 1) as cycle_no,
         count(*)                  as 건수,
         coalesce(sum(t.pnl), 0)   as 합계
    from public.trades t
    join public.trading_accounts ta2 on ta2.user_id = t.user_id
   where coalesce(t.cycle_no, 1) = coalesce(ta2.cycle_no, 1)
   group by t.user_id, coalesce(ta2.cycle_no, 1)
  having count(*) > public.client_trade_cap()
) g
join public.trading_accounts ta on ta.user_id = g.user_id
where ta.realized_pnl is distinct from g.합계
on conflict (user_id, cycle_no) do nothing;

-- (4-2) 백업이 끝났으니 실제로 바로잡습니다.
--       백업표에 있는 회원만 손댑니다 → 두 번 돌려도 결과가 같습니다.
update public.trading_accounts ta
   set realized_pnl = g.합계,
       updated_at = now()
  from (
    select t.user_id,
           coalesce(ta2.cycle_no, 1) as cycle_no,
           coalesce(sum(t.pnl), 0)   as 합계
      from public.trades t
      join public.trading_accounts ta2 on ta2.user_id = t.user_id
     where coalesce(t.cycle_no, 1) = coalesce(ta2.cycle_no, 1)
     group by t.user_id, coalesce(ta2.cycle_no, 1)
    having count(*) > public.client_trade_cap()
  ) g
 where ta.user_id = g.user_id
   and ta.realized_pnl is distinct from g.합계;


-- ---------------- 5) 확인 (읽기 전용) ----------------
-- 아래 '차이_USDT' 가 전부 0 이어야 합니다.
with 집계 as (
  select t.user_id,
         count(*)                as 건수,
         coalesce(sum(t.pnl), 0) as 합계
    from public.trades t
    join public.trading_accounts ta on ta.user_id = t.user_id
   where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
   group by t.user_id
)
select
  coalesce(p.nickname, '(이름없음)')                 as 회원,
  g.건수                                             as 거래건수,
  round(g.합계)                                      as 진짜_누적손익,
  round(coalesce(ta.realized_pnl, 0))                as 저장된_값,
  round(g.합계 - coalesce(ta.realized_pnl, 0))       as 차이_USDT
from 집계 g
join public.trading_accounts ta on ta.user_id = g.user_id
left join public.profiles p     on p.id = g.user_id
where g.건수 > public.client_trade_cap()
order by abs(g.합계 - coalesce(ta.realized_pnl, 0)) desc;

-- 트리거가 실제로 달렸는지 확인.
-- 세 줄이 나와야 합니다.
select tgname as 트리거, relname as 붙은표
from pg_trigger
join pg_class on pg_class.oid = pg_trigger.tgrelid
where tgname in ('trg_keep_full_realized_pnl',
                 'trg_resync_realized_pnl_del',
                 'trg_resync_realized_pnl_ins');


-- =========================================================================
-- [되돌리기]
-- =========================================================================
-- 트리거만 떼면 원래대로 돌아갑니다. 아래 세 줄을 Run 하세요.
-- (앞의 -- 를 지우고 실행하세요. 회원 데이터를 지우지 않습니다.)
--
--   drop trigger if exists trg_keep_full_realized_pnl on public.trading_accounts;
--   drop trigger if exists trg_resync_realized_pnl_del on public.trades;
--   drop trigger if exists trg_resync_realized_pnl_ins on public.trades;
--
-- 4번에서 바로잡은 숫자까지 되돌리시려면, 백업표를 그대로 쓰면 됩니다.
-- ★ 트리거를 먼저 떼고(위 세 줄) 나서 아래를 Run 하세요.
--   트리거가 달려 있으면 되돌린 값을 다시 바로잡아 버립니다.
--
--   update public.trading_accounts ta
--      set realized_pnl = b.realized_pnl_before,
--          updated_at = now()
--     from public.realized_pnl_backfill_log b
--    where ta.user_id = b.user_id
--      and coalesce(ta.cycle_no, 1) = b.cycle_no;
--
--   delete from public.realized_pnl_backfill_log where user_id is not null;
--
-- 함수까지 지우시려면(보통은 필요 없습니다):
--   drop function if exists public.keep_full_realized_pnl();
--   drop function if exists public.resync_realized_pnl_on_trade_delete();
--   drop function if exists public.resync_realized_pnl_on_trade_insert();
--   drop function if exists public.client_trade_cap();
-- =========================================================================
