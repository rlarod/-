-- =========================================================================
-- 고객 개인정보 분리 (5순위)
-- =========================================================================
-- 지금 구조
--   profiles = id, nickname, created_at
--   닉네임만 있어서 깨끗합니다. 개인정보가 섞여 있지 않습니다.
--
-- 왜 지금 만드나
--   카카오·네이버 로그인이 붙으면 전화번호·이메일·provider 정보가
--   들어옵니다. 그때 profiles 에 같이 넣으면
--     · profiles 는 닉네임 표시용이라 여기저기서 조회됩니다
--       (랭킹, 게시판, 채팅 — 지금은 누구나 읽기 허용)
--     · 거기에 전화번호가 있으면 남의 번호가 그대로 노출됩니다
--   그래서 미리 그릇을 분리해 둡니다.
--
-- 이 파일이 만드는 것
--   customer_private_info — 본인과 관리자만 볼 수 있는 개인정보
--   mask_phone()          — 010-****-1234 형태로 가리는 함수
--   my_private_info()     — 본인 정보를 마스킹해서 돌려주는 함수
--
-- profiles 는 건드리지 않습니다. 기존 데이터도 그대로입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 개인정보 테이블 ----------------
create table if not exists public.customer_private_info (
  user_id            uuid primary key references auth.users(id) on delete cascade,

  -- 로그인 출처 (kakao / naver / phone / password)
  provider           text,
  provider_user_id   text,

  -- 소셜에서 받아올 수 있는 값들. 못 받으면 비워둡니다(지어내지 않습니다).
  real_name          text,
  email              text,
  phone_number       text,
  phone_verified     boolean not null default false,
  phone_verified_at  timestamptz,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 같은 소셜 계정으로 두 번 가입되지 않게
create unique index if not exists idx_cpi_provider
  on public.customer_private_info (provider, provider_user_id)
  where provider is not null and provider_user_id is not null;

-- 같은 전화번호로 중복 가입되지 않게(인증된 번호만)
create unique index if not exists idx_cpi_phone
  on public.customer_private_info (phone_number)
  where phone_number is not null and phone_verified = true;


-- ---------------- 2) 접근 권한 ----------------
alter table public.customer_private_info enable row level security;

-- 본인만 읽습니다. 남의 전화번호는 조회 자체가 불가능합니다.
drop policy if exists "cpi_select_own" on public.customer_private_info;
create policy "cpi_select_own" on public.customer_private_info
  for select using (auth.uid() = user_id);

-- 관리자는 전체를 볼 수 있습니다(고객 응대·분쟁 처리용).
drop policy if exists "cpi_select_admin" on public.customer_private_info;
create policy "cpi_select_admin" on public.customer_private_info
  for select using (
    exists (select 1 from public.admin_users a where a.user_id = auth.uid())
  );

-- 본인만 자기 정보를 만들고 고칠 수 있습니다.
drop policy if exists "cpi_insert_own" on public.customer_private_info;
create policy "cpi_insert_own" on public.customer_private_info
  for insert with check (auth.uid() = user_id);

drop policy if exists "cpi_update_own" on public.customer_private_info;
create policy "cpi_update_own" on public.customer_private_info
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 삭제 정책은 만들지 않습니다. 탈퇴 시 auth.users 가 지워지면
-- on delete cascade 로 함께 정리됩니다.


-- ---------------- 3) 전화번호 가리기 ----------------
-- 010-1234-5678 -> 010-****-5678
create or replace function public.mask_phone(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or btrim(p) = '' then null
    when char_length(regexp_replace(p, '\D', '', 'g')) < 8 then '***'
    else
      substr(regexp_replace(p, '\D', '', 'g'), 1, 3) || '-****-' ||
      right(regexp_replace(p, '\D', '', 'g'), 4)
  end;
$$;


-- ---------------- 4) 본인 정보 조회 ----------------
-- 화면에서 쓰는 함수입니다. 전화번호는 항상 가려서 나갑니다.
-- 전체 번호가 필요한 경우는 없습니다(있다면 그때 별도 검토).
create or replace function public.my_private_info()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.customer_private_info%rowtype;
begin
  if uid is null then
    return json_build_object('logged_in', false);
  end if;

  select * into r from public.customer_private_info where user_id = uid;

  if not found then
    return json_build_object('logged_in', true, 'has_info', false);
  end if;

  return json_build_object(
    'logged_in', true,
    'has_info', true,
    'provider', r.provider,
    'email', r.email,
    'phone_masked', public.mask_phone(r.phone_number),
    'phone_verified', r.phone_verified,
    'created_at', r.created_at
  );
end;
$$;

grant execute on function public.my_private_info to authenticated;


-- ---------------- 5) 갱신 시각 자동 기록 ----------------
create or replace function public.touch_cpi_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_cpi on public.customer_private_info;
create trigger trg_touch_cpi
  before update on public.customer_private_info
  for each row execute function public.touch_cpi_updated_at();


-- ---------------- 6) 확인 ----------------
select
  '테이블'                                     as 구분,
  'customer_private_info'                     as 이름,
  case when to_regclass('public.customer_private_info') is not null
       then '✅ 있음' else '❌ 없음' end        as 상태
union all
select
  '권한(RLS)',
  policyname,
  cmd || ' — ' || coalesce(qual, with_check, '')
from pg_policies
where schemaname = 'public' and tablename = 'customer_private_info'
union all
select
  '마스킹 시험',
  '010-1234-5678',
  public.mask_phone('010-1234-5678')
union all
select
  '마스킹 시험',
  '01012345678',
  public.mask_phone('01012345678');
