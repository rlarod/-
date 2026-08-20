-- =========================================================================
-- schema-rank-assets.sql — 계급 점수를 "지금 가진 자산" 기준으로
-- =========================================================================
-- 이 파일을 Supabase SQL Editor 에 붙여넣고 실행하세요. 한 번만 하면 됩니다.
--
-- 무엇이 바뀌나
--   지금까지 계급 점수는 "청산 1건당 10점 + 수익률 1%당 20점" 이었습니다.
--   거래를 많이 하기만 하면 올라서, 손실 -21% 인 사람이 중장을 달고 있었습니다.
--   앞으로는 거래 횟수를 세지 않고 지금 가진 자산만 봅니다.
--
--     점수 = 1000 × log2(자산 / 초기자금)
--
--   2배면 1000점, 4배면 2000점, 8배면 3000점입니다. 벌수록 올리기
--   어려워지므로 한 번 크게 번 사람이 영영 1등이 되지 않습니다.
--   원금 아래로 내려가면 0점(이병)이고, 자산이 줄면 계급도 내려갑니다.
--
-- TL 화폐는 건드리지 않습니다
--   지금까지 tl_earned() 하나가 'TL 화폐' 와 '계급 점수' 를 같이 맡고
--   있었습니다. 그래서 한쪽을 바꾸면 다른 쪽도 같이 바뀝니다.
--   이 패치는 계급 점수만 rank_points() 로 떼어냅니다.
--   tl_earned() 는 그대로 두므로 지금까지 모은 TL 은 변하지 않습니다.
--
-- 화면(js/rank.js)과 같은 공식입니다. 양쪽이 다르면 내 화면의 계급과
-- 랭킹표의 계급이 서로 다르게 나옵니다.
-- =========================================================================

-- ---------------- 1) 계급 점수 = 자산 배율 ----------------
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
        -- 자산 = 지갑 잔고 + 확정 손익. 포지션에 묶인 증거금은 잃은 돈이
        -- 아니므로 자산에 그대로 포함됩니다(= 초기자금 + 실현손익).
        -- 미실현 손익은 넣지 않습니다. 확정되지 않은 숫자를 넣으면
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

-- ---------------- 2) 랭킹표도 새 점수를 쓰게 ----------------
-- 예전에는 tl_earned(= TL 화폐)로 순위를 매겼습니다.
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

-- ---------------- 3) 확인용 ----------------
-- 실행한 뒤 아래를 돌려보면 상위 20명의 자산과 새 점수를 볼 수 있습니다.
--
-- select p.nickname,
--        ta.initial_balance                        as 초기자금,
--        ta.initial_balance + ta.realized_pnl      as 현재자산,
--        round((ta.initial_balance + ta.realized_pnl) / nullif(ta.initial_balance,0), 2) as 배율,
--        round(public.rank_points(p.id))           as 계급점수,
--        round(public.tl_earned(p.id))             as 획득TL
-- from public.profiles p
-- join public.trading_accounts ta on ta.user_id = p.id
-- order by 계급점수 desc
-- limit 20;
