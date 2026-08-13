-- =========================================================================
-- 투자 랭킹 — 정렬 기준 변경 + "내 순위" 조회 함수 추가
-- =========================================================================
-- 이 파일은 기존 테이블/데이터를 전혀 건드리지 않습니다.
--   - CREATE OR REPLACE VIEW: 뷰의 "정의"만 바꿈(데이터 삭제 아님, 재실행 안전)
--   - CREATE OR REPLACE FUNCTION: 함수만 새로 정의(재실행 안전)
-- DROP TABLE / TRUNCATE는 없습니다.
--
-- 변경 1: leaderboard 뷰 정렬 기준을 "수익률 우선" → "총자산(balance) 우선,
--         동점이면 수익률"로 변경(이번 요구사항).
-- 변경 2: 로그인한 사용자가 자기 정확한 순위를 알 수 있는 get_my_rank()
--         함수 추가 — SECURITY DEFINER로 전체 사용자 순위를 계산하지만,
--         마지막에 auth.uid()로 필터링해서 호출한 사람 본인 행만 반환합니다
--         (다른 사용자의 순위/자산이 노출되지 않음).
-- =========================================================================

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
  order by ta.balance desc, roe_percent desc nulls last;

create or replace function public.get_my_rank()
returns table (rank bigint, nickname text, roe_percent numeric, balance numeric)
language sql
security definer
set search_path = public
as $$
  select ranked.rank, ranked.nickname, ranked.roe_percent, ranked.balance
  from (
    select
      row_number() over (
        order by ta.balance desc,
                 round(((ta.balance - ta.initial_balance) / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last
      ) as rank,
      p.nickname,
      round(((ta.balance - ta.initial_balance) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
      ta.balance,
      ta.user_id
    from public.trading_accounts ta
    join public.profiles p on p.id = ta.user_id
  ) ranked
  where ranked.user_id = auth.uid();
$$;

grant execute on function public.get_my_rank to authenticated;

-- get_leaderboard()는 이미 있던 함수 그대로 재사용합니다(변경 없음).
