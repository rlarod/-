-- =========================================================================
-- 댓글이 등록은 되는데 화면에 안 보이는 문제 수정
-- =========================================================================
-- 증상: 댓글을 쓰고 [등록]을 눌러도 "아직 댓글이 없습니다."만 계속 보임.
--       입력칸은 비워지고 오류창은 안 뜸.
--
-- 원인: js/board.js:171 이 댓글을 이렇게 읽습니다.
--         .from("post_comments").select("*, profiles(nickname)")
--       이 "profiles(nickname)" 문법은 PostgREST 임베드인데,
--       두 테이블 사이에 외래키가 있어야만 동작합니다.
--       그런데 post_comments.user_id 는 auth.users(id) 만 참조하고,
--       public.profiles 를 참조하는 외래키는 스키마 전체에 하나도 없습니다.
--       -> 조회가 PGRST200 오류로 실패
--       -> board.js 가 빈 배열을 반환 (console 에 "[board.js] 댓글 조회 실패")
--       -> "아직 댓글이 없습니다."
--
--       등록(INSERT)은 profiles 를 안 거치므로 정상 동작합니다.
--       그래서 이미 쓴 댓글들은 DB 에 그대로 살아 있습니다. (아래 0번으로 확인)
--
-- 해결: post_comments.user_id -> public.profiles(id) 외래키를 하나 더 답니다.
--       js/board.js 는 손대지 않습니다(수정 금지 파일).
--
-- 실행 위치: Supabase 대시보드 > SQL Editor
-- =========================================================================


-- ---------------- 0) 이미 쓴 댓글이 살아 있는지 확인 ----------------
select c.id, c.content, c.created_at, p.nickname
from public.post_comments c
left join public.profiles p on p.id = c.user_id
order by c.created_at desc
limit 20;


-- ---------------- 1) 프로필 없는 작성자가 있는지 확인 ----------------
-- 반드시 0 이어야 2)번이 통과합니다. 0 이 아니면 여기서 멈추고 알려주세요.
select count(*) as 프로필없는_댓글수
from public.post_comments c
left join public.profiles p on p.id = c.user_id
where p.id is null;


-- ---------------- 2) 외래키 추가 ----------------
-- 기존 auth.users 외래키는 그대로 두고, profiles 쪽 외래키를 추가로 답니다.
-- profiles 를 참조하는 외래키가 이것 하나뿐이라 PostgREST 가 헷갈리지 않습니다.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'post_comments_user_id_profiles_fkey'
      and conrelid = 'public.post_comments'::regclass
  ) then
    alter table public.post_comments
      add constraint post_comments_user_id_profiles_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;
end $$;


-- ---------------- 3) PostgREST 스키마 캐시 갱신 ----------------
-- 이걸 안 하면 외래키를 달아도 몇 분간 그대로 실패합니다.
notify pgrst, 'reload schema';


-- ---------------- 4) 확인 ----------------
select conname, confrelid::regclass as 참조테이블
from pg_constraint
where conrelid = 'public.post_comments'::regclass
  and contype = 'f';
-- post_comments_post_id_fkey        -> posts
-- post_comments_user_id_fkey        -> users        (auth.users)
-- post_comments_user_id_profiles_fkey -> profiles   <- 이 줄이 새로 보여야 합니다
