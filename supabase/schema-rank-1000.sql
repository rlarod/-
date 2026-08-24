-- =========================================================================
-- schema-rank-1000.sql — 계급 기준을 다시 잡습니다 (대장 = 지갑 1000억원)
-- =========================================================================
-- 이 파일을 Supabase SQL Editor 에 붙여넣고 실행하세요. 한 번만 하면 됩니다.
-- 여러 번 실행해도 안전합니다.
--
-- ⚠ 이 파일은 "지금 서버에 어떤 버전이 살아있든 덮어씁니다".
--    rank_points_all() 이 아래 세 파일에 서로 다르게 정의돼 있습니다.
--      supabase/schema-guest-read.sql    (권한만 부여)
--      supabase/schema-rank-assets.sql   (자산 배율 = 지금 쓰려는 공식)
--      supabase/schema-rank-badges.sql   (tl_earned = TL 화폐 공식, 낡음)
--    마지막에 무엇을 실행했느냐에 따라 서버 동작이 달라지는데, 파일만
--    봐서는 알 수 없습니다. 그래서 이 파일이 rank_points() 와
--    rank_points_all() 을 둘 다 다시 정의하고 권한까지 다시 줍니다.
--    이걸 실행한 뒤에는 위 세 파일을 다시 실행하지 마세요(되돌아갑니다).
--
-- ---------------------------------------------------------------------
-- 1. 무엇이 바뀌나 — 계급 기준
-- ---------------------------------------------------------------------
--   점수 공식은 그대로입니다.  점수 = 1000 × log2(자산 / 초기자금)
--   바뀌는 것은 각 계급의 승급 점수(min_points) 뿐입니다.
--
--   2026-08-24 대표 결정 — 대장 = 지갑 1000억원.
--     초기자금 10만 USDT(약 1.5억원)의 약 667배 → 9381점.
--     그전에는 대장이 4.2배(2070점, 약 6.3억원)여서 회원 4명 중 1명이
--     이미 대장이었습니다. 최고 계급이 너무 흔해 의미가 없었습니다.
--
--   ⚠ 기존 회원의 계급이 함께 내려갑니다(거래기록은 손대지 않습니다).
--     예) 자산 5.1배 회원: 대장(19) → 중사(6)
--
--   min_points 는 전부 1000 × log2(배수) 를 반올림한 값입니다.
--   js/rank.js 의 RANK_TABLE 과 같은 값이어야 합니다 — 다르면 내 화면의
--   계급과 랭킹표의 계급이 서로 다르게 나옵니다.
--   (tests/rank-table.test.js 가 두 파일을 대조해서 막아줍니다)
--
-- ---------------------------------------------------------------------
-- 2. 같이 막는 것 — 무료 충전으로 계급을 사는 구멍
-- ---------------------------------------------------------------------
--   무료 충전은 하루 2회 × 100,000 USDT 가 지갑에 그대로 들어옵니다.
--   계급이 지갑 기준이면 거래를 한 번도 안 해도 이틀이면 일병이 됩니다.
--
--   서버 rank_points() 는 지갑이 아니라 (초기자금 + 확정 손익) 으로
--   계산해서 원래부터 충전에 영향받지 않습니다. 구멍은 화면(js/rank.js)
--   쪽에만 있었습니다 — 거긴 지갑 잔고를 그대로 씁니다.
--   그래서 아래 rank_recharged_total() 을 새로 만들어, 화면이 빼야 할
--   금액을 서버가 알려주게 했습니다.
--
--   ⚠ trading_accounts.recharge_count 는 쓰지 않습니다.
--     그 값은 "오늘 몇 번 받았나"라서 자정마다 0 으로 돌아갑니다(최대 2).
--     지금까지 받은 총 횟수가 아니므로 x 100,000 해도 어제까지 받은
--     몫이 통째로 빠집니다. 총 충전액을 기록해 둔 컬럼은 없습니다.
--
-- ---------------------------------------------------------------------
-- 3. 이 파일이 하지 않는 것
-- ---------------------------------------------------------------------
--   · 테이블을 만들거나 지우지 않습니다 (ranks 행 갱신만).
--   · 회원 데이터(balance, realized_pnl, trades, positions)를 건드리지
--     않습니다. DELETE / TRUNCATE 가 하나도 없습니다.
--   · TL 화폐(tl_earned)는 그대로 둡니다 — 모은 TL 은 변하지 않습니다.
-- =========================================================================


-- ---------------- 1) 계급 정의 19단계 — 승급 점수 갱신 ----------------
-- ranks 테이블이 있으면 js/rank.js 가 코드 안의 표 대신 이걸 씁니다.
-- 그래서 여기도 같이 바꿔야 합니다(안 그러면 서버 표가 화면을 되돌립니다).
-- 테이블이 아직 없으면 supabase/schema-rank-patch.sql 을 먼저 실행하세요.
insert into public.ranks (rank_id, rank_name, rank_level, rank_tier, min_points) values
  ( 1, '이병',  1, '병',       0),   -- 1배
  ( 2, '일병',  2, '병',     378),   -- 1.3배
  ( 3, '상병',  3, '병',     766),   -- 1.7배
  ( 4, '병장',  4, '병',    1138),   -- 2.2배
  ( 5, '하사',  5, '부사관', 1585),   -- 3배
  ( 6, '중사',  6, '부사관', 2000),   -- 4배
  ( 7, '상사',  7, '부사관', 2459),   -- 5.5배
  ( 8, '원사',  8, '부사관', 2907),   -- 7.5배
  ( 9, '준위',  9, '준사관', 3322),   -- 10배
  (10, '소위', 10, '위관',   3807),   -- 14배
  (11, '중위', 11, '위관',   4322),   -- 20배
  (12, '대위', 12, '위관',   4807),   -- 28배
  (13, '소령', 13, '영관',   5322),   -- 40배
  (14, '중령', 14, '영관',   5907),   -- 60배
  (15, '대령', 15, '영관',   6492),   -- 90배
  (16, '준장', 16, '장성',   7129),   -- 140배
  (17, '소장', 17, '장성',   7845),   -- 230배
  (18, '중장', 18, '장성',   8644),   -- 400배
  (19, '대장', 19, '장성',   9381)    -- 667배 = 지갑 1000억원 (2026-08-24 대표 결정)
on conflict (rank_id) do update
  set rank_name  = excluded.rank_name,
      rank_level = excluded.rank_level,
      rank_tier  = excluded.rank_tier,
      min_points = excluded.min_points;


-- ---------------- 2) 계급 점수 = 자산 배율 (기존 공식 그대로) ----------------
-- 공식은 바뀌지 않았습니다. schema-rank-badges.sql 의 낡은 정의(tl_earned)가
-- 살아있을 수 있어 확실히 덮어쓰려고 여기 다시 넣습니다.
create or replace function public.rank_points(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    greatest(0, coalesce((
      select case
        -- 자산 = 초기자금 + 확정 손익. 포지션에 묶인 증거금은 잃은 돈이
        -- 아니므로 자산에 그대로 포함됩니다.
        -- 지갑 잔고(balance)를 쓰지 않는 이유: 무료 충전이 지갑에
        -- 들어오기 때문입니다. 충전으로 계급이 오르면 안 됩니다.
        -- 미실현 손익도 넣지 않습니다 — 확정되지 않은 숫자를 넣으면
        -- 가격이 출렁일 때마다 계급이 오르내립니다.
        when ta.initial_balance > 0
             and (ta.initial_balance + ta.realized_pnl) > 0
        then log(2, (ta.initial_balance + ta.realized_pnl) / ta.initial_balance) * 1000
        else 0
      end
      from public.trading_accounts ta
      where ta.user_id = p_uid
    ), 0))
    -- 운영자 가감점은 그대로 더합니다(기존과 동일)
    + coalesce((select pr.rank_points from public.profiles pr where pr.id = p_uid), 0);
$$;

grant execute on function public.rank_points to authenticated;
grant execute on function public.rank_points to anon;


-- ---------------- 3) 랭킹표도 같은 점수를 쓰게 ----------------
-- schema-rank-badges.sql 판(tl_earned = TL 화폐)이 살아있으면 랭킹표 계급이
-- 내 화면 계급과 다르게 나옵니다. 여기서 확실히 덮어씁니다.
create or replace function public.rank_points_all(limit_count int default 500)
returns table (nickname text, rank_points numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.nickname, public.rank_points(p.id) as rank_points
  from public.profiles p
  order by public.rank_points(p.id) desc
  limit greatest(1, least(coalesce(limit_count, 500), 2000));
$$;

grant execute on function public.rank_points_all to authenticated;
grant execute on function public.rank_points_all to anon;


-- ---------------- 4) 화면이 빼야 할 '충전받은 총액' ----------------
-- js/rank.js 는 지갑 잔고 + 증거금으로 계급을 계산합니다. 거기서 이 값을
-- 뺍니다. 그러면 화면 계급이 서버 rank_points() 와 같아집니다.
--
-- 어떻게 구하나 — "거래로 설명되지 않는 돈" 을 셉니다.
--   충전받은 총액 = (지갑 + 포지션 증거금 + 미체결 주문 증거금)
--                   - (초기자금 + 확정 손익)
--
-- 거래만 했다면 지갑 + 묶인 증거금은 정확히 초기자금 + 확정 손익입니다.
-- 그보다 많은 만큼이 밖에서 들어온 돈(= 무료 충전)입니다.
--
-- 왜 recharge_count 를 안 쓰나: 그 값은 '오늘 받은 횟수' 라서 자정마다
-- 0 으로 돌아갑니다(최대 2). 총 횟수가 아니므로 어제까지 받은 몫을
-- 못 뺍니다. 반면 위 계산은 지금까지 받은 것을 전부 잡아냅니다
-- (총 충전액을 기록해 둔 컬럼이 없어도 됩니다).
--
-- 음수가 나오면(있을 수 없지만 데이터가 어긋난 경우) 0 으로 막습니다 —
-- 빼기가 아니라 더하기가 되어 계급이 올라가면 안 됩니다.
create or replace function public.rank_recharged_total()
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select greatest(0, coalesce((
    select (
        coalesce(ta.balance, 0)
        + coalesce((select sum(ps.margin) from public.positions ps
                     where ps.user_id = ta.user_id), 0)
        + coalesce((select sum(o.margin) from public.orders o
                     where o.user_id = ta.user_id and o.status = 'OPEN'), 0)
      ) - (coalesce(ta.initial_balance, 0) + coalesce(ta.realized_pnl, 0))
    from public.trading_accounts ta
    where ta.user_id = auth.uid()
  ), 0));
$$;

grant execute on function public.rank_recharged_total to authenticated;
-- 비회원은 볼 지갑이 없으므로(auth.uid() 가 null) 0 이 나옵니다.
grant execute on function public.rank_recharged_total to anon;


-- ---------------- 5) 확인용 ----------------
-- (가) 계급표가 새 값으로 바뀌었는지 — 배수 칸이 위 주석과 같아야 합니다.
select rank_id, rank_name, min_points,
       round(power(2, min_points / 1000.0)::numeric, 1) as 배수
from public.ranks
order by rank_id;

-- (나) 누가 어떤 계급이 되는지 — 실행 전후로 돌려서 비교하세요.
-- select p.nickname,
--        ta.initial_balance                                   as 초기자금,
--        ta.balance                                           as 지갑,
--        ta.initial_balance + ta.realized_pnl                 as 계급용자산,
--        round((ta.initial_balance + ta.realized_pnl)
--              / nullif(ta.initial_balance, 0), 2)            as 배율,
--        round(public.rank_points(p.id))                      as 계급점수,
--        (select r.rank_name from public.ranks r
--          where r.min_points <= public.rank_points(p.id)
--          order by r.min_points desc limit 1)                as 계급
-- from public.profiles p
-- join public.trading_accounts ta on ta.user_id = p.id
-- order by 계급점수 desc
-- limit 50;
