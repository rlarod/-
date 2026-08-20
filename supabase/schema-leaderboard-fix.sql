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
-- 2026-08-20 추가로 고친 것 2가지
--
-- 4) 총자산이 지갑 잔고였음
--    포지션을 잡으면 증거금이 지갑에서 빠져 총자산이 줄었고, 무료 충전
--    (하루 2회)이 지갑에 더해져 충전만 받은 사람이 자산 순위가 높게
--    보였습니다. 총자산을 '초기자금 + 확정 손익' 으로 바꿉니다.
--    계급 점수(rank_points)와 같은 기준이라 두 화면 숫자가 맞습니다.
--
-- 5) 이름은 '수익률 랭킹' 인데 정렬은 수익금 순이었음
--    정렬 기준을 수익률로 바꿉니다. 수익률이 같으면 수익금이 큰 쪽이 위.
--
-- 6) 손실이 끝없이 커지던 문제 (2026-08-20)
--    원금을 다 잃으면 무료 충전으로 다시 채워 또 잃을 수 있습니다.
--    그 손실을 기준자본 하나로 계속 나누니 -17,147% 같은 숫자가 나왔습니다.
--    랭킹은 "얼마나 벌었나" 를 보여주는 표이므로, 기준자본 아래로 내려간
--    부분은 계산하지 않습니다. 손실은 0%, 총자산은 기준자본이 바닥입니다.
--    원본 데이터는 그대로 둡니다 — 마이페이지·거래내역에는 실제 손익이
--    그대로 나옵니다. 랭킹 표시만 0 에서 끊습니다.
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
    -- ── 랭킹은 "번 사람" 만 보여줍니다 (2026-08-20 결정) ──────────────
    -- 원금을 다 잃으면 무료 충전으로 다시 채워 또 잃을 수 있습니다.
    -- 그걸 기준자본 하나로 계속 나누면 -17,147% 같은 숫자가 나옵니다
    -- (실제로 그렇게 찍혔습니다). 기준자본 아래로 내려간 부분은
    -- 랭킹에서 계산하지 않습니다.
    --   수익금·수익률은 0 이 바닥이고, 총자산은 기준자본이 바닥입니다.
    -- 원본 데이터(realized_pnl)는 그대로 둡니다 — 마이페이지·거래내역은
    -- 실제 손익을 그대로 보여줍니다. 랭킹 표시만 0 에서 끊습니다.
    -- 총자산 = 초기자금 + 확정 손익
    --
    -- 예전에는 ta.balance(지갑 잔고)를 그대로 썼는데 두 가지가 어긋났습니다
    -- (2026-08-20).
    --   1) 포지션을 잡으면 증거금이 지갑에서 빠져나가 총자산이 줄어듭니다.
    --      묶인 돈이지 잃은 돈이 아닌데 거래 중인 사람만 순위가 내려갔다가
    --      청산하면 돌아왔습니다.
    --   2) 무료 충전(하루 2회)이 지갑에 그대로 더해져, 충전만 꼬박꼬박
    --      받은 사람이 자산 순위가 높게 보였습니다. 실력과 무관합니다.
    -- 계급 점수(rank_points)와 같은 기준이라 두 화면 숫자가 일치합니다.
    -- 미실현 손익은 넣지 않습니다 — 청산 전이라 확정된 값이 아닙니다.
    (ta.initial_balance + greatest(0, ta.realized_pnl))  as total_asset,
    -- 수익금 = 실현 손익 (청산된 거래만). 손실은 0 으로 봅니다.
    greatest(0, ta.realized_pnl)                  as profit_amount,
    -- 수익률 = 실현 수익 / 기준자본 x 100. 손실은 0.00%.
    round((greatest(0, ta.realized_pnl) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
    ta.updated_at
  from public.trading_accounts ta
  join public.profiles p on p.id = ta.user_id
  -- 순위: 수익률이 높은 순서. 이 표의 이름이 '수익률 랭킹' 이므로
  -- 정렬 기준도 수익률이어야 합니다(예전에는 수익금 순이라 이름과
  -- 기준이 달랐습니다). 수익률이 같으면 수익금이 큰 쪽을 위로 둡니다.
  order by round((greatest(0, ta.realized_pnl) / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last,
           greatest(0, ta.realized_pnl) desc nulls last;


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
      -- 목록과 정확히 같은 순서여야 합니다.
      -- 여기만 다르면 "목록에는 3등인데 내 순위는 5등" 이 됩니다.
      row_number() over (
        order by round((greatest(0, ta.realized_pnl) / nullif(ta.initial_balance, 0)) * 100, 2) desc nulls last,
                 greatest(0, ta.realized_pnl) desc nulls last
      ) as rank,
      p.nickname,
      round((greatest(0, ta.realized_pnl) / nullif(ta.initial_balance, 0)) * 100, 2) as roe_percent,
      -- 목록의 총자산과 같은 기준(초기자금 + 확정 수익, 손실은 0)
      (ta.initial_balance + greatest(0, ta.realized_pnl)) as balance,
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
