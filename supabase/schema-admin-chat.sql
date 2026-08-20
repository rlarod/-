-- =========================================================================
-- schema-admin-chat.sql — 관리자용 채팅 잠금 / 채팅 초기화
-- =========================================================================
-- 이 파일을 Supabase SQL Editor 에 붙여넣고 실행하세요. 한 번만 하면 됩니다.
--
-- 무엇이 생기나
--   1) 채팅방 얼리기 — 관리자가 켜면 회원들이 채팅을 못 씁니다.
--   2) 채팅방 초기화 — 채팅을 전부 지웁니다.
--
-- 왜 서버에서 막아야 하나
--   화면에서 입력칸만 막으면 우회할 수 있습니다. 브라우저 개발자 도구로
--   직접 요청을 보내면 그대로 들어갑니다. 그래서 서버가 거절하게 만듭니다.
--   화면 쪽 잠금은 "쓸 수 없다는 걸 보여주는" 역할만 합니다.
--
-- 거래 알림(청산·익절·손절)은 얼려도 계속 올라갑니다.
--   사람이 친 글이 아니라 시스템이 남기는 기록이라, 막으면 그 시간대
--   기록이 통째로 비어버립니다.
-- =========================================================================

-- ---------------- 1) 설정을 담아둘 표 ----------------
-- 앞으로 다른 운영 스위치가 생겨도 여기에 한 줄씩 추가하면 됩니다.
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);

alter table public.app_settings enable row level security;

-- 누구나 읽을 수 있어야 합니다 — 화면이 "지금 잠겼는지" 알아야 하니까요.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings
  for select using (true);

-- 쓰기는 아무도 직접 못 합니다. 아래 관리자 함수로만 바꿉니다.
-- (정책을 만들지 않으면 insert/update 가 전부 막힙니다.)

insert into public.app_settings (key, value)
values ('chat_locked', '{"locked": false}'::jsonb)
on conflict (key) do nothing;


-- ---------------- 2) 지금 잠겨 있나? ----------------
create or replace function public.is_chat_locked()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((value ->> 'locked')::boolean, false)
  from public.app_settings
  where key = 'chat_locked';
$$;

grant execute on function public.is_chat_locked to anon;
grant execute on function public.is_chat_locked to authenticated;


-- ---------------- 3) 잠그기 / 풀기 (관리자만) ----------------
create or replace function public.set_chat_locked(p_locked boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;

  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('chat_locked',
          jsonb_build_object('locked', coalesce(p_locked, false)),
          now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return coalesce(p_locked, false);
end;
$$;

grant execute on function public.set_chat_locked to authenticated;


-- ---------------- 4) 채팅 전부 지우기 (관리자만) ----------------
create or replace function public.clear_chat_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  if not public.am_i_admin() then
    raise exception 'not_admin';
  end if;

  -- 몇 개를 지웠는지 돌려줍니다. 화면에서 "1,234개를 지웠습니다" 로 씁니다.
  --
  -- where 절이 반드시 있어야 합니다.
  -- Supabase 에는 "WHERE 없는 DELETE 는 거부" 하는 안전장치(safeupdate)가
  -- 켜져 있습니다. 실수로 표 하나를 통째로 날리는 사고를 막는 장치인데,
  -- 여기서는 일부러 전부 지우는 것이라 그 장치에 걸렸습니다
  -- (2026-08-20 실제 오류: DELETE requires a WHERE clause [21000]).
  -- 그래서 "id 가 있는 모든 줄" 이라는 조건을 명시적으로 붙입니다.
  -- 조건이 있으나 없으나 지워지는 대상은 같습니다.
  delete from public.chat_messages where id is not null;
  get diagnostics removed = row_count;

  -- 지웠다는 사실을 남깁니다.
  -- 이게 없으면 다른 회원 화면은 새로고침할 때까지 옛 채팅이 그대로 보입니다.
  -- 채팅은 INSERT 만 실시간으로 전달되기 때문입니다(js/chat.js).
  -- 이 줄이 바뀌는 것을 각 화면이 지켜보다가 목록을 비웁니다.
  insert into public.app_settings (key, value, updated_at, updated_by)
  values ('chat_cleared_at',
          jsonb_build_object('at', extract(epoch from now())),
          now(), auth.uid())
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now(),
        updated_by = excluded.updated_by;

  return coalesce(removed, 0);
end;
$$;

grant execute on function public.clear_chat_messages to authenticated;


-- ---------------- 5) 잠겼으면 서버가 거절 ----------------
-- 기존 검사 트리거(check_chat_message)에 잠금 확인을 앞에 붙입니다.
-- 나머지 검사(도배 방지·금지어)는 예전 그대로입니다.
create or replace function public.check_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_msg_time timestamptz;
  banned_words text[] := array['시발','씨발','병신','좆','개새끼','미친놈','지랄'];
  w text;
  is_event boolean;
begin
  -- 거래 이벤트(청산 알림)인지 판별합니다.
  is_event := coalesce(new.message_type, 'chat') = 'trade_event';

  -- 거래 이벤트는 사람이 친 글이 아니므로 모든 검사를 건너뜁니다.
  -- 채팅방을 얼려도 청산 기록은 계속 남아야 합니다.
  if is_event then
    return new;
  end if;

  -- ---------------- 채팅방 잠금 ----------------
  -- 관리자는 잠긴 상태에서도 쓸 수 있습니다(공지를 남겨야 하니까요).
  if public.is_chat_locked() and not public.am_i_admin() then
    raise exception 'chat_locked';
  end if;

  -- ---------------- 도배 방지 (사람 채팅끼리만) ----------------
  select created_at into last_msg_time
  from public.chat_messages
  where user_id = new.user_id
    and coalesce(message_type, 'chat') <> 'trade_event'
  order by created_at desc
  limit 1;

  if last_msg_time is not null and (now() - last_msg_time) < interval '1.5 seconds' then
    raise exception 'rate_limited';
  end if;

  -- ---------------- 금지어 (사람 채팅만) ----------------
  foreach w in array banned_words loop
    if new.message ilike '%' || w || '%' then
      raise exception 'profanity_detected';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_check_chat_message on public.chat_messages;
create trigger trg_check_chat_message
  before insert on public.chat_messages
  for each row execute function public.check_chat_message();


-- ---------------- 6) 설정 변경을 실시간으로 알리기 ----------------
-- app_settings 가 바뀌면 모든 화면이 즉시 알 수 있게 합니다.
-- (채팅 잠금/풀기, 채팅 초기화가 바로 반영됩니다.)
do $$
begin
  begin
    alter publication supabase_realtime add table public.app_settings;
  exception
    when duplicate_object then null;   -- 이미 등록돼 있으면 넘어갑니다
    when undefined_object then null;   -- publication 이 없는 환경도 그냥 넘어갑니다
  end;
end $$;


-- ---------------- 확인 ----------------
-- 아래를 실행하면 지금 상태를 볼 수 있습니다.
--
-- select public.is_chat_locked() as 채팅잠김;
-- select key, value, updated_at from public.app_settings;
