-- =========================================================================
-- BTCUSDT 모의투자 MVP — Supabase 스키마 + RLS (복구용, 재실행 안전 버전)
-- =========================================================================
-- 이 파일은 몇 번을 다시 실행해도 안전합니다(idempotent).
--   - CREATE TABLE IF NOT EXISTS → 이미 있으면 건드리지 않음(데이터 보존)
--   - 모든 CREATE POLICY 앞에 DROP POLICY IF EXISTS → 정책만 새로 교체,
--     테이블 데이터는 전혀 영향 없음
--   - CREATE OR REPLACE VIEW/FUNCTION → 원래부터 재실행 안전
--   - Realtime publication 추가는 이미 등록되어 있는지 먼저 확인 후 처리
--   - DROP TABLE / TRUNCATE 는 이 파일 어디에도 없습니다(데이터 삭제 없음)
--
-- 실행 방법: 전체를 복사해서 SQL Editor에 붙여넣고 Run 한 번이면 끝입니다.
-- 지금 프로젝트 상태가 "일부만 실행된 상태"든 "이미 전부 실행된 상태"든
-- 똑같이 안전합니다.
-- =========================================================================

-- ---------------- profiles: 닉네임 ----------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (auth.role() = 'authenticated');

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

-- ---------------- trading_accounts: 잔고/초기자산 ----------------
create table if not exists public.trading_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance numeric not null default 10000,
  initial_balance numeric not null default 10000,
  realized_pnl numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.trading_accounts enable row level security;

drop policy if exists "trading_accounts_select_own" on public.trading_accounts;
create policy "trading_accounts_select_own" on public.trading_accounts
  for select using (auth.uid() = user_id);

drop policy if exists "trading_accounts_insert_own" on public.trading_accounts;
create policy "trading_accounts_insert_own" on public.trading_accounts
  for insert with check (auth.uid() = user_id);

drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
create policy "trading_accounts_update_own" on public.trading_accounts
  for update using (auth.uid() = user_id);

-- 랭킹용 뷰(원본 테이블 RLS와 무관하게 닉네임+수익률만 노출)
create or replace view public.leaderboard as
  select
    p.nickname,
    ta.initial_balance,
    ta.balance,
    ta.realized_pnl,
    round(((ta.balance - ta.initial_balance) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
    ta.updated_at
  from public.trading_accounts ta
  join public.profiles p on p.id = ta.user_id
  order by roe_percent desc nulls last;

create or replace function public.get_leaderboard(limit_count int default 100)
returns table (nickname text, roe_percent numeric, balance numeric)
language sql
security definer
set search_path = public
as $$
  select nickname, roe_percent, balance
  from public.leaderboard
  limit limit_count;
$$;

grant execute on function public.get_leaderboard to authenticated;

-- ---------------- positions: 현재 포지션 ----------------
create table if not exists public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null default 'BTCUSDT',
  side text not null check (side in ('long','short')),
  quantity numeric not null,
  entry_price numeric not null,
  leverage numeric not null,
  margin numeric not null,
  tp_price numeric,
  sl_price numeric,
  liq_price numeric,
  entry_fee numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.positions enable row level security;

drop policy if exists "positions_all_own" on public.positions;
create policy "positions_all_own" on public.positions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_positions_user_id on public.positions(user_id);

-- ---------------- orders: 지정가 미체결/주문 로그 ----------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null default 'BTCUSDT',
  side text not null check (side in ('long','short')),
  order_type text not null check (order_type in ('market','limit')),
  price numeric,
  margin numeric not null,
  leverage numeric not null,
  status text not null check (status in ('OPEN','FILLED','CANCELLED')),
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  cancelled_at timestamptz
);

alter table public.orders enable row level security;

drop policy if exists "orders_all_own" on public.orders;
create policy "orders_all_own" on public.orders
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists idx_orders_user_id on public.orders(user_id);

-- ---------------- trades: 종료된 거래 ----------------
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null default 'BTCUSDT',
  side text not null check (side in ('long','short')),
  entry_price numeric not null,
  exit_price numeric not null,
  quantity numeric not null,
  leverage numeric not null,
  margin numeric not null,
  pnl numeric not null,
  roe numeric,
  fee numeric not null default 0,
  close_reason text,
  created_at timestamptz not null default now()
);

alter table public.trades enable row level security;

drop policy if exists "trades_select_own" on public.trades;
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);

drop policy if exists "trades_insert_own" on public.trades;
create policy "trades_insert_own" on public.trades
  for insert with check (auth.uid() = user_id);

create index if not exists idx_trades_user_id on public.trades(user_id);
create index if not exists idx_trades_created_at on public.trades(created_at desc);

-- ---------------- chat_messages: 공개 채팅방 ----------------
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  message text not null check (char_length(message) <= 200 and char_length(message) > 0),
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

drop policy if exists "chat_select_all" on public.chat_messages;
create policy "chat_select_all" on public.chat_messages
  for select using (auth.role() = 'authenticated');

drop policy if exists "chat_insert_own" on public.chat_messages;
create policy "chat_insert_own" on public.chat_messages
  for insert with check (auth.uid() = user_id);

drop policy if exists "chat_delete_own" on public.chat_messages;
create policy "chat_delete_own" on public.chat_messages
  for delete using (auth.uid() = user_id);

create index if not exists idx_chat_created_at on public.chat_messages(created_at desc);

-- ---------------- Realtime publication (이미 추가돼 있으면 건너뜀) ----------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trading_accounts'
  ) then
    alter publication supabase_realtime add table public.trading_accounts;
  end if;
end $$;

-- =========================================================================
-- 여기까지가 전부입니다. DROP TABLE / TRUNCATE는 이 파일에 없습니다.
-- =========================================================================
