-- =========================================================================
-- chat_messages 닉네임 위조 방지 트리거
-- =========================================================================
-- 문제: RLS(chat_insert_own)는 user_id가 본인인지만 확인하고, nickname
-- 컬럼 값 자체는 클라이언트가 보내는 대로 그냥 저장됩니다 — 즉 지금은
-- 클라이언트가 마음만 먹으면 다른 사람 닉네임으로 메시지를 보낼 수
-- 있습니다.
--
-- 해결: INSERT 직전에 무조건 profiles.nickname 값으로 덮어쓰는 트리거를
-- 답니다. 클라이언트가 nickname에 뭘 보내든(심지어 안 보내도) 서버가
-- auth.uid() 기준으로 실제 프로필의 닉네임을 조회해서 강제로 채웁니다.
--
-- 안전성: CREATE OR REPLACE FUNCTION / CREATE TRIGGER 둘 다 재실행 안전.
-- 기존 데이터/테이블을 전혀 건드리지 않습니다.
-- =========================================================================

create or replace function public.set_chat_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select nickname into new.nickname
  from public.profiles
  where id = new.user_id;

  if new.nickname is null then
    raise exception 'profile not found for this user — 닉네임 등록을 먼저 완료해주세요';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_chat_nickname on public.chat_messages;
create trigger trg_set_chat_nickname
  before insert on public.chat_messages
  for each row execute function public.set_chat_nickname();
