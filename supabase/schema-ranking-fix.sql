-- =========================================================================
-- 랭킹 계산 기준 수정 — "실현 자산" 기준으로 (오픈 포지션 무관)
-- =========================================================================
-- 문제: 기존 leaderboard 뷰는 trading_accounts.balance를 "총자산"으로
-- 썼는데, balance는 포지션 진입 시 증거금+수수료만큼 즉시 줄어듭니다
-- (실제로 재현해서 확인: 진입 직후 balance가 10만→98995로 떨어짐).
-- 그래서 포지션을 잡기만 해도 랭킹이 나빠지는 것처럼 보였습니다.
--
-- 해결: realized_pnl(청산된 거래에서만 나온 손익 — trading.js/
-- supabase-sync.js가 이미 정확히 이렇게 계산해서 보내고 있었음, 여기선
-- 컬럼 자체를 새로 안 만듦)을 기준으로 "총자산 = initial_balance +
-- realized_pnl"을 계산합니다. 오픈 포지션은 청산되기 전까지 이 계산에
-- 전혀 영향을 안 줍니다.
--
-- 이 파일은 뷰/함수 정의만 교체합니다(CREATE OR REPLACE, 재실행 안전).
-- 기존 데이터는 전혀 안 건드립니다. trading.js/supabase-sync.js도
-- 무수정입니다(realized_pnl은 이미 올바르게 계산되고 있었음).
-- =========================================================================

create or replace view public.leaderboard as
  select
    p.nickname,
    ta.initial_balance,
    (ta.initial_balance + ta.realized_pnl) as total_asset, -- 실현 자산(오픈 포지션 무관)
    ta.realized_pnl as profit_amount, -- 수익금
    round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent, -- 수익률
    ta.updated_at
  from public.trading_accounts ta
  join public.profiles p on p.id = ta.user_id
  order by roe_percent desc nulls last, profit_amount desc, total_asset desc;

create or replace function public.get_leaderboard(limit_count int default 100)
returns table (nickname text, roe_percent numeric, total_asset numeric, profit_amount numeric)
language sql
security definer
set search_path = public
as $$
  select nickname, roe_percent, total_asset, profit_amount
  from public.leaderboard
  limit limit_count;
$$;

grant execute on function public.get_leaderboard to authenticated;

create or replace function public.get_my_rank()
returns table (rank bigint, nickname text, roe_percent numeric, total_asset numeric, profit_amount numeric)
language sql
security definer
set search_path = public
as $$
  select ranked.rank, ranked.nickname, ranked.roe_percent, ranked.total_asset, ranked.profit_amount
  from (
    select
      row_number() over (
        order by
          round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last,
          ta.realized_pnl desc,
          (ta.initial_balance + ta.realized_pnl) desc
      ) as rank,
      p.nickname,
      round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
      (ta.initial_balance + ta.realized_pnl) as total_asset,
      ta.realized_pnl as profit_amount,
      ta.user_id
    from public.trading_accounts ta
    join public.profiles p on p.id = ta.user_id
  ) ranked
  where ranked.user_id = auth.uid();
$$;

grant execute on function public.get_my_rank to authenticated;
