-- =========================================================================
-- 관리자 시즌 초기화 — admin_users 테이블 + SECURITY DEFINER RPC 2개
-- =========================================================================
-- 이 파일은 기존 테이블/데이터를 전혀 삭제하지 않습니다.
--   - CREATE TABLE IF NOT EXISTS: 이미 있으면 그대로 둠
--   - CREATE OR REPLACE FUNCTION: 함수 정의만 교체(재실행 안전)
-- DROP TABLE / TRUNCATE는 없습니다. reset_season() 함수 내부도 특정
-- 테이블의 행만 DELETE/UPDATE 하지, 테이블 자체는 절대 건드리지 않습니다.
-- =========================================================================

-- ---------------- admin_users: 관리자 명단(닉네임이 아니라 user_id 기준) ----------------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
-- 의도적으로 select/insert/update/delete 정책을 하나도 안 둡니다 — 즉 일반
-- 클라이언트(익명 로그인 사용자 포함)는 이 테이블에 어떤 방식으로도 직접
-- 접근할 수 없습니다. 관리자 여부 확인은 아래 am_i_admin() 함수를 통해서만
-- 가능합니다(SECURITY DEFINER로 내부적으로만 조회).

-- ---------------- app_meta: season_version 등 간단한 설정값 저장 ----------------
create table if not exists public.app_meta (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_meta (key, value)
values ('season_version', '1')
on conflict (key) do nothing; -- 이미 있으면 절대 덮어쓰지 않음(기존 값 보존)

alter table public.app_meta enable row level security;

drop policy if exists "app_meta_select_all" on public.app_meta;
create policy "app_meta_select_all" on public.app_meta
  for select using (auth.role() = 'authenticated');
-- insert/update/delete 정책은 없습니다 — 일반 사용자는 읽기만 가능하고,
-- season_version 값은 오직 reset_season() 함수 내부에서만 바뀝니다.

-- ---------------- am_i_admin(): 내가 관리자인지 확인(자기 자신만) ----------------
create or replace function public.am_i_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid());
$$;

grant execute on function public.am_i_admin to authenticated;

-- ---------------- reset_season(): 관리자만 실행 가능한 시즌 초기화 ----------------
create or replace function public.reset_season()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 서버 측 권한 검증 — 이 체크를 통과 못하면 아무 것도 안 바뀝니다.
  -- 일반 사용자가 이 함수를 직접 호출해도 여기서 즉시 막힙니다.
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'permission denied: admin only';
  end if;

  -- 버그 수정: Supabase는 기본적으로 pg-safeupdate 확장을 켜둬서, WHERE
  -- 절이 없는 UPDATE/DELETE는 SECURITY DEFINER 함수 안에서도 무조건
  -- 막힙니다("UPDATE requires a WHERE clause" 에러로 실제 확인했습니다).
  -- 모든 행을 대상으로 하고 싶어도 "user_id is not null"처럼 항상 참인
  -- WHERE를 명시적으로 붙여야 합니다.

  -- 1) trading_accounts — 값만 초기화(행 자체는 삭제 안 함, profiles와의
  --    연결 유지)
  update public.trading_accounts
  set balance = 10000, initial_balance = 10000, realized_pnl = 0, updated_at = now()
  where user_id is not null;

  -- 2) positions — 전체 삭제(테이블 자체는 유지, DELETE만 사용)
  delete from public.positions where user_id is not null;

  -- 3) orders — 전체 삭제
  delete from public.orders where user_id is not null;

  -- 4) trades — 전체 삭제
  delete from public.trades where user_id is not null;

  -- 5) leaderboard 뷰는 trading_accounts를 그대로 계산하는 뷰라서
  --    1번이 반영되면 자동으로 전부 0%로 돌아갑니다(별도 작업 불필요).

  -- profiles / chat_messages는 여기서 전혀 건드리지 않습니다(닉네임·채팅 보존).

  -- 6) season_version 증가 — 접속 중인 브라우저들이 다음 접속/새로고침 때
  --    이 값을 보고 자기 localStorage 거래 데이터를 스스로 초기화합니다.
  update public.app_meta
  set value = (value::int + 1)::text, updated_at = now()
  where key = 'season_version';
end;
$$;

grant execute on function public.reset_season to authenticated;

-- =========================================================================
-- 아래는 "김갱"을 최초 관리자로 등록하는 별도 작업입니다.
-- 위 스키마 실행 후, 김갱 닉네임으로 최소 1번 로그인(=profiles에 이미
-- 존재)한 상태에서 딱 한 번만 실행하시면 됩니다. 여러 번 실행해도
-- 안전합니다(on conflict do nothing).
-- =========================================================================
insert into public.admin_users (user_id)
select id from public.profiles where nickname = '김갱'
on conflict (user_id) do nothing;
