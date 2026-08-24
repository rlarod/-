-- =========================================================================
-- 회원 계정 삭제 — CHRO / Mang9 (2026-08-24)
-- =========================================================================
-- 대표 지시: "김갱, 김갱TV 빼고 다 지워"
--
--   남깁니다 : 김갱 (2026-08-14) · 김갱TV (2026-08-20)
--   지웁니다 : CHRO (2026-08-19) · Mang9 (2026-08-20)
--
-- ⚠️ 이 파일은 되돌릴 수 없습니다.
--    한 번 지우면 그 회원의 거래기록·글·댓글·채팅·TL·아이템이 전부
--    사라지고, 복구 방법은 "2절에서 저장해 둔 CSV 를 보고 사람이 다시
--    입력하는 것" 뿐입니다.
--
-- =========================================================================
-- ⭐ 실행 방법 — 한 번에 전부 돌리지 마세요
-- =========================================================================
--   Supabase 대시보드 > SQL Editor 를 엽니다.
--   https://supabase.com/dashboard/project/oxpjpotilcumjqixsdxw/sql/new
--
--   1) 먼저 [1절] 만 복사해서 붙여넣고 Run → 결과를 보고 판단합니다.
--   2) 맞으면 [2절] 만 복사해서 Run → 결과를 CSV 로 내려받아 보관합니다.
--      (결과창 오른쪽 위 "Download CSV" 버튼)
--   3) 백업을 확실히 받은 뒤 [3절] 을 Run 합니다.  ← 여기서 실제로 지워집니다
--   4) 마지막으로 [4절] 을 Run 해서 제대로 지워졌는지 확인합니다.
--
--   ❗ 절과 절 사이에서 반드시 멈추고 결과를 확인하세요.
-- =========================================================================
--
-- 이 파일 안에 조건(WHERE) 없는 DELETE 는 하나도 없습니다.
-- 모든 삭제문의 대상은 아래 조건 하나로만 정해집니다.
--
--     public.profiles.nickname 이 'CHRO' 또는 'Mang9' 인 회원
--     그리고 '김갱' · '김갱TV' 는 어떤 경우에도 제외
--
-- 삭제문마다 이 조건을 매번 통째로 다시 씁니다(길어 보여도 일부러 그렇게
-- 했습니다 — 한 줄만 읽어도 무엇이 지워지는지 알 수 있게).
-- =========================================================================



-- #########################################################################
-- # 1절. 무엇이 지워지는지 먼저 봅니다 (아직 아무것도 안 지웁니다)
-- #########################################################################
-- 여기까지 실행하고 결과를 보세요. 이 절은 읽기만 합니다.

-- ---------------- 1-1) 지금 있는 계정 전부 ----------------
-- 4개(김갱 · 김갱TV · CHRO · Mang9)가 맞는지, 닉네임 철자가 정확한지 봅니다.
select
  p.id                                                     as user_id,
  p.nickname                                               as 닉네임,
  p.created_at                                             as 가입일,
  case when p.nickname in ('김갱','김갱TV') then '남김'
       when p.nickname in ('CHRO','Mang9') then '지움'
       else '목록에 없는 계정 — 대표 확인 필요' end          as 처리
from public.profiles p
order by p.created_at;


-- ---------------- 1-2) 지울 대상이 정확히 2명인지 ----------------
-- 반드시 2 가 나와야 합니다. 2 가 아니면 여기서 멈추고 알려주세요.
-- (닉네임 대소문자나 공백이 실제와 다르면 여기서 걸립니다.)
select count(*) as 지울_대상_수
from public.profiles p
where p.nickname in ('CHRO','Mang9')
  and p.nickname not in ('김갱','김갱TV');


-- ---------------- 1-3) 남길 대상이 정확히 2명인지 ----------------
-- 반드시 2 가 나와야 합니다.
select count(*) as 남길_대상_수
from public.profiles p
where p.nickname in ('김갱','김갱TV');


-- ---------------- 1-4) 지울 회원이 관리자인지 ----------------
-- 여기에 CHRO 나 Mang9 가 나오면, 지운 뒤 그 사람으로는 관리자 기능을
-- 쓸 수 없습니다. 관리자가 김갱/김갱TV 에도 있는지 같이 봅니다.
select
  coalesce(p.nickname, '(프로필 없음)')                     as 닉네임,
  a.user_id,
  a.created_at                                              as 관리자등록일,
  case when p.nickname in ('CHRO','Mang9')
       then '이 관리자는 지워집니다'
       else '유지' end                                       as 처리
from public.admin_users a
left join public.profiles p on p.id = a.user_id
order by a.created_at;


-- ---------------- 1-5) 테이블별로 몇 건이 지워지는지 ----------------
-- "본인 것"     = 그 회원이 만든 행
-- "남이 남긴 것" = 지울 회원의 글에 다른 사람이 단 댓글·추천 등
--                 (글이 지워지면 같이 사라집니다)
with 대상 as (
  select p.id
  from public.profiles p
  where p.nickname in ('CHRO','Mang9')
    and p.nickname not in ('김갱','김갱TV')
),
대상글 as (
  select po.id from public.posts po where po.user_id in (select id from 대상)
)
select '01. posts (글)' as 테이블, count(*) as 삭제건수 from public.posts where user_id in (select id from 대상)
union all select '02. post_comments (본인 댓글)',            count(*) from public.post_comments   where user_id in (select id from 대상)
union all select '03. post_comments (지울글에 남이 단 댓글)', count(*) from public.post_comments   where post_id in (select id from 대상글)
union all select '04. post_votes (본인 추천)',               count(*) from public.post_votes      where user_id in (select id from 대상)
union all select '05. post_votes (지울글에 남이 준 추천)',    count(*) from public.post_votes      where post_id in (select id from 대상글)
union all select '06. post_reports (본인 신고)',             count(*) from public.post_reports    where user_id in (select id from 대상)
union all select '07. comment_reports (본인 댓글신고)',      count(*) from public.comment_reports where user_id in (select id from 대상)
union all select '08. post_view_log (조회기록)',             count(*) from public.post_view_log   where user_id in (select id from 대상)
union all select '09. chat_messages (채팅)',                count(*) from public.chat_messages   where user_id in (select id from 대상)
union all select '10. trades (종료된 거래)',                 count(*) from public.trades          where user_id in (select id from 대상)
union all select '11. positions (보유 포지션)',              count(*) from public.positions       where user_id in (select id from 대상)
union all select '12. orders (주문)',                       count(*) from public.orders          where user_id in (select id from 대상)
union all select '13. trading_accounts (지갑)',             count(*) from public.trading_accounts where user_id in (select id from 대상)
union all select '14. trading_cycles (지난 사이클)',         count(*) from public.trading_cycles  where user_id in (select id from 대상)
union all select '15. tl_purchases (TL 구매)',              count(*) from public.tl_purchases    where user_id in (select id from 대상)
union all select '16. tl_transactions (TL 내역)',           count(*) from public.tl_transactions where user_id in (select id from 대상)
union all select '17. user_items (보관함)',                 count(*) from public.user_items      where user_id in (select id from 대상)
union all select '18. item_usage_logs (아이템 사용)',        count(*) from public.item_usage_logs where user_id in (select id from 대상)
union all select '19. customer_private_info (개인정보)',     count(*) from public.customer_private_info where user_id in (select id from 대상)
union all select '20. admin_users (관리자)',                count(*) from public.admin_users     where user_id in (select id from 대상)
union all select '21. profiles (프로필)',                   count(*) from public.profiles        where id in (select id from 대상)
union all select '22. auth.users (로그인 계정)',             count(*) from auth.users             where id in (select id from 대상)
order by 1;


-- ---------------- 1-6) 글이 누구 것인지 (현황: 1건) ----------------
select
  po.id,
  coalesce(pr.nickname, '(프로필 없음)')                    as 작성자,
  po.title                                                  as 제목,
  po.created_at                                             as 작성일,
  case when pr.nickname in ('CHRO','Mang9') then '글이 통째로 지워집니다'
       else '남습니다' end                                   as 처리
from public.posts po
left join public.profiles pr on pr.id = po.user_id
order by po.created_at;


-- ---------------- 1-7) 채팅이 누구 것인지 (현황: 5건) ----------------
select
  cm.id,
  coalesce(pr.nickname, cm.nickname)                        as 작성자,
  cm.message                                                as 내용,
  cm.created_at                                             as 시각,
  case when pr.nickname in ('CHRO','Mang9') then '지워집니다'
       else '남습니다' end                                   as 처리
from public.chat_messages cm
left join public.profiles pr on pr.id = cm.user_id
order by cm.created_at;


-- ---------------- 1-8) 댓글이 누구 것인지 ----------------
-- 지울 회원이 쓴 댓글뿐 아니라, "지울 회원의 글에 김갱이 단 댓글"도
-- 글이 사라지면서 같이 없어집니다. 여기서 미리 확인하세요.
select
  c.id,
  coalesce(pr.nickname, '(프로필 없음)')                    as 작성자,
  c.content                                                 as 내용,
  coalesce(pw.nickname, '(프로필 없음)')                    as 글주인,
  case when pr.nickname in ('CHRO','Mang9') or pw.nickname in ('CHRO','Mang9')
       then '지워집니다' else '남습니다' end                  as 처리
from public.post_comments c
left join public.profiles pr on pr.id = c.user_id
left join public.posts po    on po.id = c.post_id
left join public.profiles pw on pw.id = po.user_id
order by c.created_at;


-- ---------------- 1-9) 외래키가 없어 자동으로 안 지워지는 자리 ----------------
-- 이 두 컬럼은 uuid 만 들어 있고 외래키가 없습니다. 회원을 지워도
-- 값이 그대로 남습니다(오류는 안 납니다 — 누구인지 알 수 없는 번호가
-- 남을 뿐입니다). 3절 마지막의 [선택] 항목에서 정리할 수 있습니다.
select 'trading_cycles.ended_by' as 자리, count(*) as 남게될건수
from public.trading_cycles
where ended_by in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV'))
union all
select 'app_settings.updated_by', count(*)
from public.app_settings
where updated_by in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV'));


-- ---------------- 1-10) auth.users(로그인 계정)를 여기서 지울 수 있는지 ----------------
-- 아래가 오류 없이 결과를 보여주면 3절의 auth.users 삭제도 됩니다.
-- "permission denied for schema auth" 같은 오류가 나면 SQL 로는 못 지웁니다
-- → 그때는 3절 맨 아래 [대안] 안내대로 대시보드에서 지우세요.
--
-- ⭐ 이메일이 사람이 읽을 수 없는 모양인 것은 정상입니다.
--    이 사이트는 닉네임으로 로그인하고, 내부적으로 닉네임을 16진수로
--    바꿔 만든 가짜 이메일을 씁니다(js/auth.js 의 nicknameToEmail).
--    닉네임과 이메일의 대응은 이렇습니다 —
--      CHRO    →  u4348524f@btcsim.local          ← 지움
--      Mang9   →  u4d616e6739@btcsim.local        ← 지움
--      김갱     →  ueab980eab0b1@btcsim.local      ← 남김
--      김갱TV   →  ueab980eab0b15456@btcsim.local  ← 남김
--    (카카오·네이버로 가입했다면 이메일이 다를 수 있습니다.
--     그때는 위 결과의 닉네임 열을 보고 판단하세요.)
select
  u.id,
  u.email,
  u.created_at                                              as 가입일,
  u.last_sign_in_at                                         as 마지막로그인,
  coalesce(p.nickname, '(프로필 없음)')                      as 닉네임
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;

-- ⛔ 여기까지 실행하고 결과를 확인하세요.
--    1-2 가 2, 1-3 이 2 가 아니면 아래로 내려가지 마세요.



-- #########################################################################
-- # 2절. 백업 — 지워질 내용을 전부 뽑아 봅니다 (아직 안 지웁니다)
-- #########################################################################
-- 각 쿼리를 하나씩 Run 하고, 결과창 오른쪽 위 "Download CSV" 로
-- 파일을 내려받아 보관하세요. 지운 뒤에는 이 내용을 다시 볼 방법이 없습니다.

-- ---------------- 2-1) 계정 기본 정보 ----------------
select p.id, p.nickname, p.created_at, u.email, u.last_sign_in_at
from public.profiles p
left join auth.users u on u.id = p.id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-2) 지갑 ----------------
select ta.*, p.nickname
from public.trading_accounts ta join public.profiles p on p.id = ta.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-3) 종료된 거래 ----------------
select t.*, p.nickname
from public.trades t join public.profiles p on p.id = t.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
order by t.created_at;

-- ---------------- 2-4) 보유 포지션 ----------------
select po.*, p.nickname
from public.positions po join public.profiles p on p.id = po.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-5) 주문 ----------------
select o.*, p.nickname
from public.orders o join public.profiles p on p.id = o.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
order by o.created_at;

-- ---------------- 2-6) 지난 사이클 ----------------
select c.*, p.nickname
from public.trading_cycles c join public.profiles p on p.id = c.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-7) 채팅 ----------------
select cm.*, p.nickname as 프로필닉네임
from public.chat_messages cm join public.profiles p on p.id = cm.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
order by cm.created_at;

-- ---------------- 2-8) 글 ----------------
select po.*, p.nickname
from public.posts po join public.profiles p on p.id = po.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
order by po.created_at;

-- ---------------- 2-9) 댓글 (본인이 쓴 것 + 지울 글에 남이 단 것) ----------------
select c.*, coalesce(pr.nickname,'(프로필 없음)') as 작성자
from public.post_comments c
left join public.profiles pr on pr.id = c.user_id
where c.user_id in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV'))
   or c.post_id in (select po.id from public.posts po where po.user_id in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')))
order by c.created_at;

-- ---------------- 2-10) 추천 ----------------
select v.*, coalesce(pr.nickname,'(프로필 없음)') as 누른사람
from public.post_votes v
left join public.profiles pr on pr.id = v.user_id
where v.user_id in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV'))
   or v.post_id in (select po.id from public.posts po where po.user_id in (select p.id from public.profiles p where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')));

-- ---------------- 2-11) TL 구매 · TL 거래내역 ----------------
select tp.*, p.nickname
from public.tl_purchases tp join public.profiles p on p.id = tp.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select tt.*, p.nickname
from public.tl_transactions tt join public.profiles p on p.id = tt.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-12) 아이템 보관함 · 사용기록 ----------------
select ui.*, p.nickname
from public.user_items ui join public.profiles p on p.id = ui.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select l.*, p.nickname
from public.item_usage_logs l join public.profiles p on p.id = l.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ---------------- 2-13) 개인정보 · 관리자 · 신고 · 조회기록 ----------------
select c.*, p.nickname
from public.customer_private_info c join public.profiles p on p.id = c.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select a.*, p.nickname
from public.admin_users a join public.profiles p on p.id = a.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select r.*, p.nickname
from public.post_reports r join public.profiles p on p.id = r.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select r.*, p.nickname
from public.comment_reports r join public.profiles p on p.id = r.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

select v.*, p.nickname
from public.post_view_log v join public.profiles p on p.id = v.user_id
where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV');

-- ⛔ 여기까지 실행하고, CSV 를 전부 내려받아 저장하셨는지 확인하세요.
--    저장 안 하셨으면 3절로 내려가지 마세요. 되돌릴 수 없습니다.



-- #########################################################################
-- # 3절. 실제 삭제  ← 여기서부터 진짜로 지워집니다
-- #########################################################################
-- 3절 전체(begin 부터 commit 까지)를 한 번에 복사해서 Run 하세요.
-- 한 덩어리로 돌아가므로, 중간에 오류가 나면 아무것도 안 지워집니다.
--
-- 자식 → 부모 순서입니다. 참고로 이 프로젝트의 모든 회원 테이블은
-- auth.users 에 on delete cascade 로 걸려 있어서 3-8 한 줄만으로도
-- 지워지지만, 무엇이 몇 건 지워졌는지 눈으로 보려고 일부러 하나씩 씁니다.

begin;

-- ---------------- 3-0) 안전장치 ----------------
-- 지울 대상이 정확히 2명(CHRO, Mang9)이 아니면 여기서 멈춥니다.
-- 남길 계정이 2명(김갱, 김갱TV)이 아니어도 멈춥니다.
do $$
declare
  n_del  int;
  n_keep int;
begin
  select count(*) into n_del  from public.profiles
   where nickname in ('CHRO','Mang9') and nickname not in ('김갱','김갱TV');
  select count(*) into n_keep from public.profiles
   where nickname in ('김갱','김갱TV');

  if n_del <> 2 then
    raise exception '중단합니다: 지울 대상이 2명이 아니라 %명입니다. 1절 1-1 로 닉네임을 다시 확인하세요.', n_del;
  end if;
  if n_keep <> 2 then
    raise exception '중단합니다: 남길 대상이 2명이 아니라 %명입니다. 1절 1-1 로 닉네임을 다시 확인하세요.', n_keep;
  end if;
end $$;


-- ---------------- 3-1) 지울 회원의 "글"에 딸린 것들 ----------------
-- (글이 지워지면 어차피 같이 사라지지만, 순서대로 명시합니다)

delete from public.comment_reports
where comment_id in (
  select c.id from public.post_comments c
  where c.post_id in (
    select po.id from public.posts po
    where po.user_id in (
      select p.id from public.profiles p
      where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
    )
  )
);

delete from public.post_view_log
where post_id in (
  select po.id from public.posts po
  where po.user_id in (
    select p.id from public.profiles p
    where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
  )
);

delete from public.post_reports
where post_id in (
  select po.id from public.posts po
  where po.user_id in (
    select p.id from public.profiles p
    where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
  )
);

delete from public.post_votes
where post_id in (
  select po.id from public.posts po
  where po.user_id in (
    select p.id from public.profiles p
    where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
  )
);

delete from public.post_comments
where post_id in (
  select po.id from public.posts po
  where po.user_id in (
    select p.id from public.profiles p
    where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
  )
);


-- ---------------- 3-2) 지울 회원이 "남의 글에" 남긴 것들 ----------------

delete from public.comment_reports
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.comment_reports
where comment_id in (
  select c.id from public.post_comments c
  where c.user_id in (
    select p.id from public.profiles p
    where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
  )
);

delete from public.post_view_log
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.post_reports
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.post_votes
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.post_comments
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-3) 글 ----------------
delete from public.posts
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-4) 채팅 ----------------
delete from public.chat_messages
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-5) 아이템 · TL ----------------
delete from public.item_usage_logs
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.user_items
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.tl_purchases
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.tl_transactions
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-6) 거래 ----------------
delete from public.trading_cycles
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.trades
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.positions
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.orders
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.trading_accounts
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-7) 개인정보 · 관리자 ----------------
delete from public.customer_private_info
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);

delete from public.admin_users
where user_id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-8) 로그인 계정 (auth.users) ----------------
-- ⭐ 이 줄이 핵심입니다.
--    profiles 만 지우고 여기를 안 지우면 "로그인은 되는데 프로필이 없는"
--    상태가 되어, 그 사람이 다시 접속하면 닉네임을 새로 만들며 되살아납니다.
--    그래서 profiles(3-9)보다 먼저 지웁니다 —
--    profiles 를 먼저 지우면 아래 조건에서 대상을 못 찾습니다.
delete from auth.users
where id in (
  select p.id from public.profiles p
  where p.nickname in ('CHRO','Mang9') and p.nickname not in ('김갱','김갱TV')
);


-- ---------------- 3-9) 프로필 ----------------
-- 위 3-8 의 cascade 로 이미 사라졌을 가능성이 큽니다. 남아 있으면 지웁니다.
delete from public.profiles
where nickname in ('CHRO','Mang9')
  and nickname not in ('김갱','김갱TV');


commit;

-- ⛔ 여기까지가 삭제입니다. 4절로 넘어가 확인하세요.


-- ---------------- [선택] 남은 흔적 정리 ----------------
-- 아래 두 컬럼은 외래키가 없어서 자동으로 안 지워집니다.
-- 1절 1-9 에서 건수가 0 이었다면 그냥 넘어가세요.
-- 0 이 아니고 정리하고 싶으시면 아래 두 문장 앞의 "-- " 를 지우고 Run 하세요.
-- (지운 회원이 실행했던 "관리자 초기화" 기록의 실행자 이름만 비워집니다.
--  김갱·김갱TV 의 거래기록·손익·랭킹은 전혀 바뀌지 않습니다.)
--
-- update public.trading_cycles set ended_by = null
--   where ended_by is not null
--     and ended_by not in (select id from public.profiles);
--
-- update public.app_settings set updated_by = null
--   where updated_by is not null
--     and updated_by not in (select id from public.profiles);


-- ---------------- [대안] 3-8 에서 권한 오류가 났다면 ----------------
-- "permission denied for schema auth" 또는 "must be owner of table users"
-- 오류가 나면 SQL 로는 로그인 계정을 못 지웁니다. 그때는:
--
--   1) 3절을 다시 돌리되, 3-8 의 delete 문 5줄만 "-- " 로 주석 처리하고 Run
--   2) 대시보드 > Authentication > Users 로 갑니다
--      https://supabase.com/dashboard/project/oxpjpotilcumjqixsdxw/auth/users
--   3) CHRO · Mang9 의 계정을 찾습니다. 이메일이 이렇게 보입니다 —
--        CHRO   →  u4348524f@btcsim.local
--        Mang9  →  u4d616e6739@btcsim.local
--      (김갱 = ueab980eab0b1@... / 김갱TV = ueab980eab0b15456@... 는 건드리지 마세요)
--      찾았으면
--      오른쪽 점 3개 > Delete user 로 하나씩 지웁니다
--   4) 4절로 확인합니다
--
-- ※ 반대로, 대시보드에서 Delete user 만 해도 됩니다.
--    on delete cascade 가 전부 걸려 있어서 위 3-1~3-9 는 자동으로 따라
--    지워집니다. 3절을 하나씩 쓴 이유는 몇 건이 지워지는지 보이게 하려는 것뿐입니다.



-- #########################################################################
-- # 4절. 삭제 후 확인
-- #########################################################################

-- ---------------- 4-1) 남은 계정이 김갱 · 김갱TV 둘뿐인지 ----------------
-- 정확히 2줄, 김갱 과 김갱TV 만 나와야 합니다.
select p.id, p.nickname as 닉네임, p.created_at as 가입일
from public.profiles p
order by p.created_at;


-- ---------------- 4-2) 로그인 계정도 2개뿐인지 ----------------
-- 2 가 나와야 합니다. 2보다 크면 3-8 이 안 된 것입니다(3절 [대안] 참고).
select count(*) as 남은_로그인계정수 from auth.users;

-- "프로필 없음" 이 나오면 로그인 계정만 남고 프로필이 지워진 상태입니다.
-- 그 계정으로 접속하면 닉네임을 새로 만들며 되살아나므로, 반드시
-- 대시보드에서 Delete user 로 지워야 합니다.
select u.id, u.email,
       coalesce(p.nickname, '프로필 없음 — 지우다 만 계정. 대시보드에서 삭제 필요') as 상태
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;


-- ---------------- 4-3) 지운 회원의 흔적이 남았는지 (전부 0 이어야 합니다) ----------------
select 'posts'                 as 테이블, count(*) as 고아행 from public.posts                 where user_id not in (select id from public.profiles)
union all select 'post_comments',         count(*) from public.post_comments         where user_id not in (select id from public.profiles)
union all select 'post_votes',            count(*) from public.post_votes            where user_id not in (select id from public.profiles)
union all select 'post_reports',          count(*) from public.post_reports          where user_id not in (select id from public.profiles)
union all select 'comment_reports',       count(*) from public.comment_reports       where user_id not in (select id from public.profiles)
union all select 'post_view_log',         count(*) from public.post_view_log         where user_id not in (select id from public.profiles)
union all select 'chat_messages',         count(*) from public.chat_messages         where user_id not in (select id from public.profiles)
union all select 'trades',                count(*) from public.trades                where user_id not in (select id from public.profiles)
union all select 'positions',             count(*) from public.positions             where user_id not in (select id from public.profiles)
union all select 'orders',                count(*) from public.orders                where user_id not in (select id from public.profiles)
union all select 'trading_accounts',      count(*) from public.trading_accounts      where user_id not in (select id from public.profiles)
union all select 'trading_cycles',        count(*) from public.trading_cycles        where user_id not in (select id from public.profiles)
union all select 'tl_purchases',          count(*) from public.tl_purchases          where user_id not in (select id from public.profiles)
union all select 'tl_transactions',       count(*) from public.tl_transactions       where user_id not in (select id from public.profiles)
union all select 'user_items',            count(*) from public.user_items            where user_id not in (select id from public.profiles)
union all select 'item_usage_logs',       count(*) from public.item_usage_logs       where user_id not in (select id from public.profiles)
union all select 'customer_private_info', count(*) from public.customer_private_info where user_id not in (select id from public.profiles)
union all select 'admin_users',           count(*) from public.admin_users           where user_id not in (select id from public.profiles)
order by 1;


-- ---------------- 4-4) 랭킹에 지운 회원이 안 보이는지 ----------------
-- 김갱 · 김갱TV 만 나와야 합니다(지갑이 있는 사람만 나옵니다).
select * from public.leaderboard;


-- ---------------- 4-5) 채팅에 지운 회원 이름이 남았는지 ----------------
-- CHRO · Mang9 가 안 나와야 합니다.
select cm.nickname as 표시이름, cm.message as 내용, cm.created_at as 시각
from public.chat_messages cm
order by cm.created_at desc
limit 50;


-- ---------------- 4-6) 게시판에 지운 회원 글이 남았는지 ----------------
-- 작성자에 CHRO · Mang9 가 없어야 하고, '(알수없음)' 도 없어야 합니다
-- ('(알수없음)' 이 보이면 프로필만 지워지고 글이 남은 것입니다).
select id, author_nickname as 작성자, title as 제목,
       comment_count as 댓글수, like_count as 추천수, created_at as 작성일
from public.posts_with_meta
order by created_at desc;


-- ---------------- 4-7) 관리자 명단 ----------------
-- 관리자가 한 명도 안 남으면 관리자 화면을 못 씁니다. 반드시 확인하세요.
select coalesce(p.nickname, '프로필 없음') as 닉네임, a.user_id, a.created_at as 등록일
from public.admin_users a
left join public.profiles p on p.id = a.user_id
order by a.created_at;

select count(*) as 남은_관리자수 from public.admin_users;


-- =========================================================================
-- 끝.
-- =========================================================================
