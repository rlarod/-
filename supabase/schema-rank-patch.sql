-- =========================================================================
-- schema-rank-patch.sql — 계급(군 계급) 시스템 추가
-- =========================================================================
-- 이 스크립트는 "추가"만 합니다.
--   · 기존 테이블을 DROP하거나 TRUNCATE하지 않습니다.
--   · 기존 컬럼을 바꾸거나 지우지 않습니다.
--   · 기존 뷰/함수(leaderboard, get_leaderboard, get_my_rank)는 건드리지 않습니다.
--   · 여러 번 실행해도 안전합니다(if not exists / on conflict).
--
-- 실행하지 않아도 사이트는 정상 동작합니다 — js/rank.js가 이 테이블을
-- 못 찾으면 코드 안에 있는 동일한 19단계 표로 대체합니다. 이 스크립트를
-- 실행하면 계급 기준을 SQL에서 바꿀 수 있게 되고(코드 배포 없이),
-- rank_points로 수동 가감점도 줄 수 있습니다.
-- =========================================================================

-- ---------------- ranks: 계급 정의(19단계) ----------------
create table if not exists public.ranks (
  rank_id     int  primary key,          -- 1~19
  rank_name   text not null unique,       -- 이병 ~ 대장
  rank_level  int  not null,              -- rank_id와 동일하게 시작(정렬/비교용)
  rank_tier   text not null,              -- 병 / 부사관 / 준사관 / 위관 / 영관 / 장성
  min_points  numeric not null            -- 이 계급이 되기 위한 최소 점수
);

insert into public.ranks (rank_id, rank_name, rank_level, rank_tier, min_points) values
  ( 1, '이병', 1, '병',    0),
  ( 2, '일병', 2, '병',    30),
  ( 3, '상병', 3, '병',    70),
  ( 4, '병장', 4, '병',    120),
  ( 5, '하사', 5, '부사관', 180),
  ( 6, '중사', 6, '부사관', 250),
  ( 7, '상사', 7, '부사관', 330),
  ( 8, '원사', 8, '부사관', 420),
  ( 9, '준위', 9, '준사관', 520),
  (10, '소위', 10, '위관',  630),
  (11, '중위', 11, '위관',  750),
  (12, '대위', 12, '위관',  880),
  (13, '소령', 13, '영관',  1020),
  (14, '중령', 14, '영관',  1170),
  (15, '대령', 15, '영관',  1330),
  (16, '준장', 16, '장성',  1500),
  (17, '소장', 17, '장성',  1680),
  (18, '중장', 18, '장성',  1870),
  (19, '대장', 19, '장성',  2070)
on conflict (rank_id) do update
  set rank_name  = excluded.rank_name,
      rank_level = excluded.rank_level,
      rank_tier  = excluded.rank_tier,
      min_points = excluded.min_points;

alter table public.ranks enable row level security;

drop policy if exists "ranks_select_all" on public.ranks;
create policy "ranks_select_all" on public.ranks
  for select using (auth.role() = 'authenticated');

-- ---------------- profiles.rank_points: 수동 가감점(보너스) ----------------
-- 계급 점수의 기본값은 실제 거래 기록에서 계산합니다(js/rank.js).
-- 이 컬럼은 이벤트 보상/운영자 조정 같은 "추가 점수"를 담는 자리이며,
-- 기존 profiles의 다른 컬럼(id, nickname, created_at)은 그대로 둡니다.
alter table public.profiles
  add column if not exists rank_points numeric not null default 0;

-- ---------------- 참고용 뷰 ----------------
-- 기존 leaderboard 뷰는 전혀 건드리지 않고, 계급 조회용 뷰를 새로 추가만 합니다.
create or replace view public.user_rank_points as
  select
    p.id            as user_id,
    p.nickname,
    p.rank_points   as bonus_points,
    ta.realized_pnl,
    ta.initial_balance
  from public.profiles p
  left join public.trading_accounts ta on ta.user_id = p.id;

grant select on public.user_rank_points to authenticated;
