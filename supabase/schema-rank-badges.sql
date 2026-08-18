-- =========================================================================
-- 계급장 표시용 — 닉네임별 계급 점수
-- =========================================================================
-- 왜 필요한가
--   랭킹표(get_leaderboard)와 채팅(chat_messages)은 닉네임만 주고
--   계급 정보를 주지 않습니다. 그래서 지금은 내 계급장만 보입니다.
--   남의 계급을 화면에서 지어낼 수는 없으므로(가짜 데이터 금지),
--   서버가 계급 점수를 알려주는 함수를 하나 둡니다.
--
-- 점수는 새로 만들지 않습니다.
--   이미 있는 public.tl_earned(uid) 를 그대로 씁니다.
--   (js/rank.js 와 같은 공식: 청산 거래 1건당 10점 + 실현 수익률 1%당 20점
--    + profiles.rank_points 가감점)
--   계급 단계 판정은 화면의 js/rank.js RANK_TABLE 이 합니다 — 한 곳에서만 정합니다.
--
-- 선행 조건: supabase/schema-tl-hotdeal.sql (tl_earned 가 거기서 만들어집니다)
--
-- 이 파일은 테이블을 만들거나 지우지 않습니다. 함수 하나뿐입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================

create or replace function public.rank_points_all(limit_count integer default 500)
returns table (nickname text, rank_points numeric)
language sql
stable
security definer
set search_path = public
as $$
  select p.nickname, public.tl_earned(p.id) as rank_points
  from public.profiles p
  order by public.tl_earned(p.id) desc
  limit greatest(1, least(coalesce(limit_count, 500), 2000));
$$;

grant execute on function public.rank_points_all to authenticated;


-- ---------------- 확인 ----------------
-- 닉네임과 계급 점수가 나오면 성공입니다.
select * from public.rank_points_all(20);
