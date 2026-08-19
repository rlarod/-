-- =========================================================================
-- 랭킹 수정 — 기준을 실현 손익으로 통일하고, 빈 칸을 채웁니다
-- =========================================================================
-- 발견한 문제 3가지
--
-- 1) 순위 기준이 잘못됨
--    leaderboard 뷰가 ta.balance(가용 잔고) 로 정렬합니다.
--    포지션을 열면 증거금이 잔고에서 빠지므로, 포지션을 들고 있는
--    사람은 그것만으로 순위가 내려갑니다.
--      A 현금 110,000 / 포지션 없음        -> 총자산 110,000
--      B 잔고  60,000 / 증거금 50,000       -> 총자산 110,000
--      C 잔고  60,000 / 증거금 50,000 +1만  -> 총자산 120,000
--    현재 순위 A > B > C. 가장 잘한 C 가 꼴찌입니다.
--
-- 2) 공지와 실제가 다름
--    공지: "랭킹은 청산된 거래(실현 손익) 기준으로 계산됩니다"
--    실제: balance 기준
--
-- 3) 화면이 기대하는 칸이 비어 있음
--    js/leaderboard.js 는 total_asset, profit_amount 를 표시하는데
--    get_leaderboard() 는 nickname, roe_percent, balance 만 돌려줍니다.
--    그래서 총자산·수익금 칸이 빈 채로 나옵니다.
--
-- 이 파일이 하는 일
--   순위 기준을 공지대로 '실현 손익'으로 통일합니다.
--   실현 손익은 청산된 거래만 반영하므로, 포지션 보유 여부와
--   미실현 손익에 흔들리지 않습니다. 미실현으로 순위를 매기면
--   포지션만 열어두고 버티는 쪽이 유리해지는 문제도 생깁니다.
--   화면이 쓰는 total_asset / profit_amount 도 같이 내려줍니다.
--
-- 기존 것을 지우지 않습니다. 뷰와 함수만 다시 만듭니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 랭킹 뷰 ----------------
-- create or replace 는 컬럼 순서·이름이 바뀌면 거부합니다
--   ERROR: cannot change name of view column "total_asset" to "balance"
-- 그래서 먼저 지우고 다시 만듭니다.
-- 뷰는 데이터를 담고 있지 않습니다(테이블을 조회하는 정의일 뿐) —
-- 지워도 거래·회원 데이터는 그대로입니다.
-- 이 뷰를 참조하는 get_leaderboard() 도 아래에서 다시 만듭니다.
drop view if exists public.leaderboard cascade;

create view public.leaderboard as
  select
    p.nickname,
    ta.initial_balance,
    ta.balance,
    ta.realized_pnl,
    -- 총자산 = 잔고 + 실현손익이 이미 반영된 값이라 balance 그대로 씁니다.
    -- (미실현은 청산 전이므로 랭킹에 넣지 않습니다 — 공지 기준)
    ta.balance                                    as total_asset,
    -- 수익금 = 실현 손익 (청산된 거래만)
    ta.realized_pnl                               as profit_amount,
    -- 수익률 = 실현손익 / 시작자산 x 100
    round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
    ta.updated_at
  from public.trading_accounts ta
  join public.profiles p on p.id = ta.user_id
  -- 순위: 실현 손익이 큰 순서. 같으면 시작자산 대비 수익률로 가릅니다.
  order by ta.realized_pnl desc nulls last,
           round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last;


-- ---------------- 2) 랭킹 목록 ----------------
-- 화면이 쓰는 칸을 전부 내려줍니다(total_asset, profit_amount 추가).
-- 반환 칸이 늘어나므로 함수도 먼저 지웁니다(같은 이유).
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
security definer
set search_path = public
as $$
  select nickname, roe_percent, balance, total_asset, profit_amount
  from public.leaderboard
  limit limit_count;
$$;

grant execute on function public.get_leaderboard to authenticated;
grant execute on function public.get_leaderboard to anon;


-- ---------------- 3) 내 순위 ----------------
drop function if exists public.get_my_rank();

create function public.get_my_rank()
returns table (rank bigint, nickname text, roe_percent numeric, balance numeric)
language sql
security definer
set search_path = public
as $$
  select ranked.rank, ranked.nickname, ranked.roe_percent, ranked.balance
  from (
    select
      row_number() over (
        order by ta.realized_pnl desc nulls last,
                 round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last
      ) as rank,
      p.nickname,
      round((ta.realized_pnl / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
      ta.balance,
      ta.user_id
    from public.trading_accounts ta
    join public.profiles p on p.id = ta.user_id
  ) ranked
  where ranked.user_id = auth.uid();
$$;

grant execute on function public.get_my_rank to authenticated;


-- ---------------- 4) 확인 ----------------
-- 수익금(실현 손익)이 큰 순서로 나오고, 총자산·수익금 칸이 비어 있지
-- 않아야 합니다.
select * from public.get_leaderboard(10);
