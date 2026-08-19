-- =========================================================================
-- 비회원도 공개 영역을 볼 수 있게 (읽기 권한만 엽니다)
-- =========================================================================
-- 증상: 비회원이 홈에 들어오면 공지·게시판·인기글·채팅·랭킹이 전부 빈칸.
--
-- 원인: 이 테이블들의 읽기 정책이 auth.role() = 'authenticated' 였습니다.
--       예전에는 비회원이 로그인 게이트에 막혀 화면 자체를 못 봤기 때문에
--       드러나지 않았습니다. 게이트를 걷어내니 빈 화면이 보이게 됐습니다.
--
-- 이 파일이 하는 일: 읽기(SELECT)만 누구나 가능하게 바꿉니다.
--   · 쓰기(INSERT/UPDATE/DELETE) 정책은 하나도 건드리지 않습니다.
--     글쓰기·댓글·추천·채팅 전송은 여전히 로그인해야 합니다.
--   · 개인 정보 테이블(trading_accounts, positions, orders, trades,
--     tl_purchases, user_items 등)은 그대로 본인만 볼 수 있습니다.
--   · 테이블을 만들거나 지우지 않습니다.
-- 여러 번 실행해도 안전합니다.
--
-- 되돌리려면 각 정책의 using (true) 를
--   using (auth.role() = 'authenticated')
-- 로 바꿔 다시 실행하면 됩니다.
-- =========================================================================


-- ---------------- 1) 닉네임(프로필) ----------------
-- 글쓴이·채팅 닉네임·계급장 표시에 필요합니다. 닉네임 외 민감정보는 없습니다.
drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);


-- ---------------- 2) 게시판 ----------------
drop policy if exists "posts_select_all" on public.posts;
create policy "posts_select_all" on public.posts
  for select using (true);

drop policy if exists "comments_select_all" on public.post_comments;
create policy "comments_select_all" on public.post_comments
  for select using (true);

drop policy if exists "votes_select_all" on public.post_votes;
create policy "votes_select_all" on public.post_votes
  for select using (true);


-- ---------------- 3) 실시간 채팅 ----------------
-- 읽기만 열립니다. 보내려면 여전히 로그인해야 합니다(chat_insert_own 유지).
drop policy if exists "chat_select_all" on public.chat_messages;
create policy "chat_select_all" on public.chat_messages
  for select using (true);


-- ---------------- 4) 랭킹 ----------------
-- 랭킹은 함수로 조회합니다. 비회원(anon)에게도 실행 권한을 줍니다.
grant execute on function public.get_leaderboard to anon;
grant execute on function public.rank_points_all to anon;


-- ---------------- 5) 확인 ----------------
-- '누구나'로 나와야 비회원이 볼 수 있습니다.
select tablename as 테이블, policyname as 정책,
       case when qual = 'true' then '누구나' else qual end as 읽기조건
from pg_policies
where schemaname = 'public'
  and cmd = 'SELECT'
  and tablename in ('profiles','posts','post_comments','post_votes','chat_messages')
order by tablename;
