-- =========================================================================
-- 신고 확인 기능 — 관리자가 신고를 볼 수 있게
-- =========================================================================
-- 무엇이 문제인가
--   신고 기능은 잘 만들어져 있습니다.
--     post_reports / comment_reports 테이블
--     1인 1회 제한 (unique post_id, user_id)
--     글이 지워지면 신고도 함께 정리 (on delete cascade)
--
--   그런데 읽기 정책이 '본인이 낸 신고만' 입니다.
--     using (auth.uid() = user_id)
--   관리자도 남의 신고를 볼 수 없습니다.
--
--   즉 사용자가 신고 버튼을 눌러도 아무도 그 사실을 알 수 없습니다.
--   신고가 쌓이기만 하고 조치가 불가능합니다.
--
-- 어떻게 고치나
--   관리자에게만 전체 신고를 볼 수 있게 정책을 하나 더 둡니다.
--   본인이 낸 신고를 보는 기존 정책은 그대로 둡니다.
--   신고 내역을 모아 보는 함수도 함께 만듭니다
--   (어떤 글이 몇 번 신고됐는지 한눈에).
--
--   일반 사용자는 여전히 남의 신고를 볼 수 없습니다.
--   신고를 지우거나 수정하는 권한은 아무에게도 주지 않습니다.
--
-- 테이블은 만들거나 지우지 않습니다. 정책과 함수만 추가합니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 관리자 읽기 정책 ----------------
drop policy if exists "post_reports_select_admin" on public.post_reports;
create policy "post_reports_select_admin" on public.post_reports
  for select using (
    exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  );

drop policy if exists "comment_reports_select_admin" on public.comment_reports;
create policy "comment_reports_select_admin" on public.comment_reports
  for select using (
    exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  );


-- ---------------- 2) 신고 모아 보기 ----------------
-- 어떤 글이 몇 번 신고됐는지, 최근 신고가 언제인지 한눈에 봅니다.
create or replace function public.get_reported_posts(limit_count int default 50)
returns table (
  post_id uuid,
  title text,
  nickname text,
  report_count bigint,
  last_reported timestamptz,
  reasons text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.post_id,
    p.title,
    pr.nickname,
    count(*)                                   as report_count,
    max(r.created_at)                          as last_reported,
    string_agg(distinct nullif(r.reason, ''), ' | ') as reasons
  from public.post_reports r
  join public.posts p    on p.id = r.post_id
  join public.profiles pr on pr.id = p.user_id
  where exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  group by r.post_id, p.title, pr.nickname
  order by count(*) desc, max(r.created_at) desc
  limit limit_count;
$$;

grant execute on function public.get_reported_posts to authenticated;


-- 댓글 신고도 같은 방식으로
create or replace function public.get_reported_comments(limit_count int default 50)
returns table (
  comment_id uuid,
  content text,
  nickname text,
  report_count bigint,
  last_reported timestamptz,
  reasons text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    r.comment_id,
    c.content,
    pr.nickname,
    count(*)                                   as report_count,
    max(r.created_at)                          as last_reported,
    string_agg(distinct nullif(r.reason, ''), ' | ') as reasons
  from public.comment_reports r
  join public.post_comments c on c.id = r.comment_id
  join public.profiles pr     on pr.id = c.user_id
  where exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  group by r.comment_id, c.content, pr.nickname
  order by count(*) desc, max(r.created_at) desc
  limit limit_count;
$$;

grant execute on function public.get_reported_comments to authenticated;


-- ---------------- 3) 확인 ----------------
-- 관리자로 로그인한 상태에서 실행하면 신고된 글 목록이 나옵니다.
-- 신고가 없으면 빈 결과가 정상입니다.
select * from public.get_reported_posts(20);
