-- =========================================================================
-- 자유게시판 스키마 (PHASE 13) — 전부 신규 테이블, 기존 테이블 무수정
-- =========================================================================
-- DROP TABLE / TRUNCATE 없음. 전부 CREATE TABLE IF NOT EXISTS +
-- CREATE OR REPLACE (뷰/함수) + DROP POLICY IF EXISTS 패턴이라 재실행 안전.
--
-- 설계 핵심: like_count/dislike_count를 posts 테이블에 "숫자 컬럼"으로
-- 직접 저장하지 않습니다. 그렇게 하면 trading_accounts 때처럼 사용자가
-- 개발자도구로 그 숫자를 직접 조작할 수 있는 구멍이 생깁니다. 대신
-- post_votes(누가 어떤 글에 좋아요/싫어요 눌렀는지)만 저장하고,
-- 좋아요 개수는 항상 그 테이블에서 실시간으로 계산합니다 — 조작할
-- "개수 컬럼" 자체가 없으므로 이 취약점 자체가 발생하지 않습니다.
-- =========================================================================

-- ---------------- posts ----------------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  content text not null check (char_length(content) between 1 and 10000),
  view_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.posts enable row level security;

drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all" on public.posts
  for select using (auth.role() = 'authenticated');

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own" on public.posts
  for insert with check (auth.uid() = user_id);

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete using (auth.uid() = user_id);

-- 버그 방지: RLS는 "어떤 행"을 건드릴 수 있는지만 제한하고 "어떤 컬럼"을
-- 건드릴 수 있는지는 제한 못합니다. view_count를 본인 글이라고 직접
-- 조작 못 하도록 컬럼 단위 권한으로 한 번 더 막습니다 — view_count는
-- 아래 increment_post_view() 함수(SECURITY DEFINER)를 통해서만 바뀝니다.
revoke update on public.posts from authenticated;
grant update (title, content, updated_at) on public.posts to authenticated;

create index if not exists idx_posts_created_at on public.posts(created_at desc);

-- ---------------- post_comments ----------------
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

alter table public.post_comments enable row level security;

drop policy if exists "comments_select_all" on public.post_comments;
create policy "comments_select_all" on public.post_comments
  for select using (auth.role() = 'authenticated');

drop policy if exists "comments_insert_own" on public.post_comments;
create policy "comments_insert_own" on public.post_comments
  for insert with check (auth.uid() = user_id);

drop policy if exists "comments_delete_own" on public.post_comments;
create policy "comments_delete_own" on public.post_comments
  for delete using (auth.uid() = user_id);
-- 댓글 수정 기능은 이번 범위에 없어서 update 정책 없음(요구사항: 작성/삭제만)

create index if not exists idx_comments_post_id on public.post_comments(post_id);

-- ---------------- post_votes(좋아요/싫어요 — 유일한 진짜 데이터) ----------------
create table if not exists public.post_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  vote_type text not null check (vote_type in ('LIKE', 'DISLIKE')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id) -- 한 사용자가 같은 글에 중복 투표 불가(DB가 직접 강제)
);

alter table public.post_votes enable row level security;

drop policy if exists "votes_select_all" on public.post_votes;
create policy "votes_select_all" on public.post_votes
  for select using (auth.role() = 'authenticated');

drop policy if exists "votes_all_own" on public.post_votes;
create policy "votes_all_own" on public.post_votes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------- 신고(구조만 — 이번 단계에서 관리자 화면은 안 만듦) ----------------
create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
alter table public.post_reports enable row level security;
drop policy if exists "post_reports_insert_own" on public.post_reports;
create policy "post_reports_insert_own" on public.post_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "post_reports_select_own" on public.post_reports;
create policy "post_reports_select_own" on public.post_reports
  for select using (auth.uid() = user_id);

create table if not exists public.comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  unique (comment_id, user_id)
);
alter table public.comment_reports enable row level security;
drop policy if exists "comment_reports_insert_own" on public.comment_reports;
create policy "comment_reports_insert_own" on public.comment_reports
  for insert with check (auth.uid() = user_id);
drop policy if exists "comment_reports_select_own" on public.comment_reports;
create policy "comment_reports_select_own" on public.comment_reports
  for select using (auth.uid() = user_id);

-- ---------------- 조회수 중복 방지용 로그(내부 전용, 클라이언트 직접 접근 불가) ----------------
create table if not exists public.post_view_log (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_viewed_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
alter table public.post_view_log enable row level security;
-- 정책 없음 — increment_post_view() 함수(SECURITY DEFINER)를 통해서만 접근

-- ---------------- 게시글 + 좋아요/싫어요 + 작성자 닉네임을 한 번에 조회하는 뷰 ----------------
create or replace view public.posts_with_meta as
select
  p.id,
  p.user_id,
  p.title,
  p.content,
  p.view_count,
  p.created_at,
  p.updated_at,
  coalesce(pr.nickname, '(알수없음)') as author_nickname,
  coalesce((select count(*) from public.post_votes v where v.post_id = p.id and v.vote_type = 'LIKE'), 0) as like_count,
  coalesce((select count(*) from public.post_votes v where v.post_id = p.id and v.vote_type = 'DISLIKE'), 0) as dislike_count,
  coalesce((select count(*) from public.post_comments c where c.post_id = p.id), 0) as comment_count
from public.posts p
left join public.profiles pr on pr.id = p.user_id;

-- ---------------- 조회수 증가(중복 방지, 10분 내 재조회는 무시) ----------------
create or replace function public.increment_post_view(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  last_seen timestamptz;
begin
  select last_viewed_at into last_seen
  from public.post_view_log
  where post_id = p_post_id and user_id = auth.uid();

  if last_seen is not null and (now() - last_seen) < interval '10 minutes' then
    return; -- 최근에 이미 조회수를 반영했으므로 중복 증가 안 함
  end if;

  insert into public.post_view_log (post_id, user_id, last_viewed_at)
  values (p_post_id, auth.uid(), now())
  on conflict (post_id, user_id) do update set last_viewed_at = now();

  update public.posts set view_count = view_count + 1 where id = p_post_id;
end;
$$;

grant execute on function public.increment_post_view to authenticated;
