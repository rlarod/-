-- =========================================================================
-- schema-trading-cycle.sql — 매매 사이클 구조
-- =========================================================================
-- 무엇을 만드나
--   랭킹 수익률은 "영구 누적" 이 아니라 "현재 매매 사이클" 기준입니다.
--   관리자가 계좌를 초기화하면 그 사이클이 끝나고, 수익률 0% 부터
--   새 사이클이 시작됩니다.
--
--     수익률 = 현재 사이클 누적 실현손익 ÷ 기준자본 x 100
--
-- 이미 있는 것 (그대로 씁니다)
--   trading_accounts.initial_balance  → 기준자본
--   trading_accounts.realized_pnl     → 현재 사이클 누적 실현손익
--   랭킹 뷰가 이 둘로 수익률을 계산합니다(schema-leaderboard-fix.sql).
--
-- 이 파일이 더하는 것
--   1) 사이클 번호 — 지금이 몇 번째 사이클인지
--   2) 거래마다 사이클 번호를 붙임 — 지난 사이클 기록을 지우지 않고 보관
--   3) 관리자 전용 계좌 초기화 — 거래를 지우지 않습니다
--
-- 지금 시즌 초기화(reset_season)의 문제 두 가지도 여기서 고칩니다.
--   · trades 를 전부 삭제합니다 → 과거 기록이 사라집니다
--   · 자본을 10,000 으로 되돌립니다 → 지금 기준은 100,000 입니다
--
-- 기존 데이터를 지우지 않습니다. 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 사이클 번호 ----------------
alter table public.trading_accounts
  add column if not exists cycle_no int not null default 1;

alter table public.trading_accounts
  add column if not exists cycle_started_at timestamptz not null default now();

-- 거래에도 사이클 번호를 붙입니다. 지난 사이클 거래는 그대로 남고,
-- 사이클 번호로 "이번 사이클 거래" 만 골라볼 수 있습니다.
alter table public.trades
  add column if not exists cycle_no int not null default 1;

create index if not exists idx_trades_cycle
  on public.trades (user_id, cycle_no);


-- ---------------- 2) 새 거래에 지금 사이클 번호를 자동으로 ----------------
-- 화면(js/supabase-sync.js)은 사이클 번호를 보내지 않습니다.
-- 그 파일은 수정 금지라, 서버가 알아서 채웁니다.
create or replace function public.set_trade_cycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cycle_no is null or new.cycle_no = 1 then
    select coalesce(ta.cycle_no, 1) into new.cycle_no
    from public.trading_accounts ta
    where ta.user_id = new.user_id;
    new.cycle_no := coalesce(new.cycle_no, 1);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_trade_cycle on public.trades;
create trigger trg_set_trade_cycle
  before insert on public.trades
  for each row execute function public.set_trade_cycle();


-- ---------------- 3) 사이클 기록 보관 ----------------
-- 끝난 사이클의 성적을 남겨둡니다. 나중에 "지난 시즌 기록" 을 보여줄 수
-- 있고, 초기화가 언제 왜 일어났는지 추적할 수 있습니다.
create table if not exists public.trading_cycles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  cycle_no        int  not null,
  base_capital    numeric not null,   -- 그 사이클의 기준자본
  realized_pnl    numeric not null,   -- 그 사이클에서 확정한 손익
  roe_percent     numeric,            -- 그 사이클 최종 수익률
  trade_count     int,
  started_at      timestamptz,
  ended_at        timestamptz not null default now(),
  ended_by        uuid                -- 초기화를 실행한 관리자
);

alter table public.trading_cycles enable row level security;

drop policy if exists cycles_select_own on public.trading_cycles;
create policy cycles_select_own on public.trading_cycles
  for select using (auth.uid() = user_id);

create index if not exists idx_cycles_user on public.trading_cycles (user_id, cycle_no);


-- ---------------- 4) 관리자 전용 계좌 초기화 ----------------
-- p_user_id 를 주면 그 회원만, 비우면 전원.
-- 거래 기록은 지우지 않습니다 — 사이클 번호로 구분해 보관합니다.
create or replace function public.reset_trading_cycle(
  p_user_id uuid default null,
  p_base_capital numeric default 100000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
begin
  -- 관리자만. 일반 회원이 직접 불러도 여기서 막힙니다.
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;

  -- 끝나는 사이클의 성적을 먼저 보관합니다.
  insert into public.trading_cycles
    (user_id, cycle_no, base_capital, realized_pnl, roe_percent, trade_count,
     started_at, ended_at, ended_by)
  select
    ta.user_id,
    ta.cycle_no,
    ta.initial_balance,
    ta.realized_pnl,
    round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2),
    (select count(*) from public.trades t
      where t.user_id = ta.user_id and t.cycle_no = ta.cycle_no),
    ta.cycle_started_at,
    now(),
    auth.uid()
  from public.trading_accounts ta
  where (p_user_id is null or ta.user_id = p_user_id);

  -- 새 사이클 시작.
  --   기준자본 = 새로 지급하는 자본
  --   누적 실현손익 = 0  → 랭킹 수익률이 0.00% 부터 다시 시작
  update public.trading_accounts ta
  set balance          = p_base_capital,
      initial_balance  = p_base_capital,
      realized_pnl     = 0,
      cycle_no         = ta.cycle_no + 1,
      cycle_started_at = now(),
      updated_at       = now()
  where (p_user_id is null or ta.user_id = p_user_id)
    and ta.user_id is not null;   -- Supabase 안전장치(WHERE 필수) 때문에 필요

  get diagnostics affected = row_count;

  -- 열려 있던 포지션·미체결 주문은 정리합니다.
  -- 남겨두면 새 사이클의 자본과 맞지 않는 포지션이 떠 있게 됩니다.
  delete from public.positions
   where (p_user_id is null or user_id = p_user_id) and user_id is not null;
  delete from public.orders
   where (p_user_id is null or user_id = p_user_id) and user_id is not null;

  -- trades 는 지우지 않습니다(과거 기록 보관). 사이클 번호로 구분됩니다.

  -- 접속 중인 브라우저가 자기 저장소를 스스로 비우도록 알립니다.
  -- (js/season.js 가 이 값을 보고 판단합니다)
  if p_user_id is null then
    update public.app_meta
       set value = (value::int + 1)::text, updated_at = now()
     where key = 'season_version';
  end if;

  return affected;
end;
$$;

grant execute on function public.reset_trading_cycle to authenticated;


-- ---------------- 5) 확인 ----------------
-- select p.nickname,
--        ta.cycle_no                                as 사이클,
--        round(ta.initial_balance)                  as 기준자본,
--        round(ta.realized_pnl)                     as 누적실현손익,
--        round((ta.realized_pnl / nullif(ta.initial_balance,0)) * 100, 2) as 수익률,
--        (select count(*) from public.trades t
--          where t.user_id = p.id and t.cycle_no = ta.cycle_no) as 이번사이클거래,
--        (select count(*) from public.trades t where t.user_id = p.id) as 전체거래
-- from public.profiles p
-- join public.trading_accounts ta on ta.user_id = p.id
-- order by 수익률 desc nulls last;
