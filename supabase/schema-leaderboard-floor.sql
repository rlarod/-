-- =========================================================================
-- schema-leaderboard-floor.sql — 랭킹 누적은 0 이 바닥
-- =========================================================================
-- 무엇이 문제였나 (2026-08-20)
--   누적 실현손익이 -18,158,792 까지 내려가 있었습니다.
--   이 값을 그대로 들고 가면, 앞으로 아무리 벌어도 그 마이너스를 전부
--   메우기 전까지는 랭킹이 계속 0% 입니다. 사실상 복구가 불가능합니다.
--
--   앞서 손실을 0 으로 끊기만 했더니 (greatest(0, realized_pnl))
--   "잃은 사람은 0%" 는 해결됐지만, 그 사람이 새로 벌어도 여전히 0% 였습니다.
--   마이너스가 그대로 남아 있었기 때문입니다.
--
-- 어떻게 바꾸나
--   거래를 시간 순으로 훑으면서 누적을 쌓되, 0 아래로는 내려가지 않게
--   바닥을 잡습니다.
--
--     누적 = max(0, 누적 + 이번거래손익)
--
--   예) +10 → 10 / -30 → 0 / +5 → 5 / +5 → 10
--   잃으면 0 으로 내려앉고, 그다음 버는 것은 바로 랭킹에 올라갑니다.
--
--   거래 기록과 실제 손익(trading_accounts.realized_pnl)은 그대로 둡니다.
--   마이페이지·거래내역에는 진짜 숫자가 나옵니다. 랭킹 집계만 이렇게 셉니다.
--
-- 계산 방법
--   위 규칙은 한 줄씩 세지 않아도 구할 수 있습니다.
--     최종누적 = 전체합계 - min(0, 누적합계의 최솟값)
--   즉 "가장 깊이 파였던 지점" 을 0 으로 끌어올린 것과 같습니다.
--   창 함수 하나로 끝나므로 거래가 많아도 빠릅니다.
--
-- 이 파일은 랭킹 뷰와 랭킹 함수만 다시 만듭니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 사람별 랭킹 수익금 ----------------
-- 현재 사이클의 거래만 봅니다(지난 사이클은 보관용).
create or replace view public.ranking_profit as
with 순서대로 as (
  select
    t.user_id,
    t.pnl,
    -- 시간 순 누적 합계
    sum(t.pnl) over (
      partition by t.user_id
      order by t.created_at, t.id
      rows between unbounded preceding and current row
    ) as 누적
  from public.trades t
  join public.trading_accounts ta on ta.user_id = t.user_id
  where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
)
select
  user_id,
  -- 전체합계 - 가장 깊이 파였던 지점(음수일 때만)
  coalesce(sum(pnl), 0) - least(0, coalesce(min(누적), 0)) as ranking_profit
from 순서대로
group by user_id;

grant select on public.ranking_profit to authenticated;
grant select on public.ranking_profit to anon;


-- ---------------- 2) 랭킹 뷰 ----------------
drop view if exists public.leaderboard cascade;

create view public.leaderboard as
  select
    p.nickname,
    ta.initial_balance,
    ta.balance,
    ta.realized_pnl,
    -- 랭킹 수익금 — 0 이 바닥. 거래가 없으면 0.
    coalesce(rp.ranking_profit, 0)                         as profit_amount,
    -- 총자산 = 기준자본 + 랭킹 수익금
    (ta.initial_balance + coalesce(rp.ranking_profit, 0))  as total_asset,
    -- 수익률 = 랭킹 수익금 / 기준자본 x 100
    round((coalesce(rp.ranking_profit, 0) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
    ta.updated_at
  from public.trading_accounts ta
  join public.profiles p on p.id = ta.user_id
  left join public.ranking_profit rp on rp.user_id = ta.user_id
  order by round((coalesce(rp.ranking_profit, 0) / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last,
           coalesce(rp.ranking_profit, 0) desc nulls last;


-- ---------------- 3) 랭킹 목록 ----------------
drop function if exists public.get_leaderboard(int);

create function public.get_leaderboard(limit_count int default 100)
returns table (
  nickname text,
  roe_percent numeric,
  balance numeric,
  total_asset numeric,
  profit_amount numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select nickname, roe_percent, total_asset as balance, total_asset, profit_amount
  from public.leaderboard
  limit limit_count;
$$;

grant execute on function public.get_leaderboard to authenticated;
grant execute on function public.get_leaderboard to anon;


-- ---------------- 4) 내 순위 ----------------
-- 목록과 정확히 같은 기준이어야 합니다.
-- 여기만 다르면 "목록엔 3등인데 내 순위는 5등" 이 됩니다.
drop function if exists public.get_my_rank();

create function public.get_my_rank()
returns table (rank bigint, nickname text, roe_percent numeric, balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  select ranked.rank, ranked.nickname, ranked.roe_percent, ranked.balance
  from (
    select
      row_number() over (
        order by round((coalesce(rp.ranking_profit, 0) / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last,
                 coalesce(rp.ranking_profit, 0) desc nulls last
      ) as rank,
      p.nickname,
      round((coalesce(rp.ranking_profit, 0) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
      (ta.initial_balance + coalesce(rp.ranking_profit, 0)) as balance,
      ta.user_id
    from public.trading_accounts ta
    join public.profiles p on p.id = ta.user_id
    left join public.ranking_profit rp on rp.user_id = ta.user_id
  ) ranked
  where ranked.user_id = auth.uid();
$$;

grant execute on function public.get_my_rank to authenticated;


-- ---------------- 5) 확인 ----------------
select nickname as 닉네임,
       total_asset as 총자산,
       profit_amount as 수익금,
       roe_percent as 수익률
from public.get_leaderboard(20);
