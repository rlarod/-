-- =========================================================================
-- schema-notices.sql — 진짜 공지사항
-- =========================================================================
-- 지금 문제
--   화면에 보이는 공지 4줄은 js/notice-board.js 코드에 박아둔 문구입니다.
--   관리자가 쓴 게 아니라서 대표가 바꿀 수 없고, 새 공지를 올릴 수도
--   없습니다. 오픈하면 공지 하나 띄우려고 코드를 고쳐야 합니다.
--
-- 만드는 것
--   공지 표 + 관리자 전용 쓰기/수정/삭제 함수.
--   회원은 읽기만 합니다.
--
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 공지 표 ----------------
create table if not exists public.notices (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default '공지'
                check (kind in ('공지','안내','점검','이벤트')),
  title       text not null check (char_length(title) between 1 and 200),
  body        text,                       -- 길게 쓸 내용(없어도 됩니다)
  pinned      boolean not null default false,  -- 맨 위에 고정
  visible     boolean not null default true,   -- 숨기기(지우지 않고)
  sort_order  int not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.notices enable row level security;

-- 누구나 읽습니다(로그인 안 해도).
drop policy if exists notices_read on public.notices;
create policy notices_read on public.notices
  for select using (visible = true);

-- 쓰기는 아래 관리자 함수로만. 직접 쓰는 정책은 만들지 않습니다.

create index if not exists idx_notices_order
  on public.notices (pinned desc, sort_order desc, created_at desc);


-- ---------------- 2) 공지 읽기 ----------------
create or replace function public.get_notices(limit_count int default 20)
returns table (
  id uuid, kind text, title text, body text,
  pinned boolean, created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select n.id, n.kind, n.title, n.body, n.pinned, n.created_at
  from public.notices n
  where n.visible = true
  order by n.pinned desc, n.sort_order desc, n.created_at desc
  limit greatest(1, least(coalesce(limit_count, 20), 100));
$$;

grant execute on function public.get_notices to anon;
grant execute on function public.get_notices to authenticated;


-- ---------------- 3) 공지 쓰기 (관리자만) ----------------
create or replace function public.add_notice(
  p_title text,
  p_kind text default '공지',
  p_body text default null,
  p_pinned boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;

  if p_title is null or btrim(p_title) = '' then
    raise exception 'empty_title';
  end if;

  insert into public.notices (kind, title, body, pinned, created_by)
  values (coalesce(p_kind, '공지'), btrim(p_title), p_body,
          coalesce(p_pinned, false), auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.add_notice to authenticated;


-- ---------------- 4) 공지 지우기 (관리자만) ----------------
-- 실제로 지웁니다. 숨기기만 하려면 아래 hide_notice 를 쓰세요.
create or replace function public.delete_notice(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;

  -- Supabase 는 WHERE 없는 DELETE 를 거부합니다. 조건이 있으니 통과합니다.
  delete from public.notices where id = p_id;
  return found;
end;
$$;

grant execute on function public.delete_notice to authenticated;


-- ---------------- 5) 공지 숨기기 (관리자만) ----------------
-- 지우지 않고 화면에서만 뺍니다. 나중에 되살릴 수 있습니다.
create or replace function public.hide_notice(p_id uuid, p_hidden boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'not_admin';
  end if;

  update public.notices
     set visible = not coalesce(p_hidden, true), updated_at = now()
   where id = p_id;
  return found;
end;
$$;

grant execute on function public.hide_notice to authenticated;


-- ---------------- 6) 지금 화면에 있는 4줄을 옮겨둡니다 ----------------
-- 코드에 박혀 있던 문구를 표로 옮깁니다. 마음에 안 들면 관리자 창에서
-- 지우고 새로 쓰시면 됩니다. 이제 코드를 안 고쳐도 됩니다.
insert into public.notices (kind, title, sort_order)
select * from (values
  ('공지', '실제 자금이 오가지 않는 모의투자 플랫폼입니다', 100),
  ('공지', '랭킹은 청산된 거래(실현 손익) 기준으로 계산됩니다', 90),
  ('안내', '전쟁터에서 실시간 매수/매도 세력 대결을 확인해보세요', 80),
  ('안내', '마이페이지에서 내 자산 현황을 한눈에 확인하세요', 70)
) as v(kind, title, sort_order)
where not exists (select 1 from public.notices);


-- ---------------- 7) 실시간 반영 ----------------
-- 공지를 올리면 접속 중인 회원 화면에도 바로 뜨게 합니다.
do $$
begin
  begin
    alter publication supabase_realtime add table public.notices;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;


-- ---------------- 8) 확인 ----------------
select kind as 종류, title as 제목, pinned as 고정, visible as 보임, created_at as 등록
from public.notices
order by pinned desc, sort_order desc, created_at desc;
