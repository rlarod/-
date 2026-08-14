-- =========================================================================
-- 채팅 안전장치 — 연속 도배 방지 + 기본 욕설 필터 (서버 강제)
-- =========================================================================
-- 이 파일은 기존 테이블/데이터를 전혀 삭제하지 않습니다. 트리거 함수만
-- 새로 추가합니다(CREATE OR REPLACE, 재실행 안전).
--
-- 클라이언트(js/chat.js)에서도 같은 검사를 미리 해서 즉각적인 피드백을
-- 주지만, 여기 트리거가 진짜 강제력입니다 — 브라우저 개발자도구로
-- 클라이언트 검사를 우회해도 이 트리거는 못 피합니다.
-- =========================================================================

create or replace function public.check_chat_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  last_msg_time timestamptz;
  banned_words text[] := array['시발','씨발','씨팔','병신','ㅅㅂ','ㅂㅅ','좆','개새끼','fuck','shit'];
  w text;
begin
  -- 1) 연속 도배 방지 — 같은 사용자가 1.5초 이내에 또 보내면 차단
  select created_at into last_msg_time
  from public.chat_messages
  where user_id = new.user_id
  order by created_at desc
  limit 1;

  if last_msg_time is not null and (now() - last_msg_time) < interval '1.5 seconds' then
    raise exception 'rate_limited';
  end if;

  -- 2) 기본 욕설 필터(대소문자 무관 부분 일치) — 완벽하지 않지만 가장
  --    흔한 케이스는 막습니다. 우회 문자열(자음만 분리 등)까지는 못 막음.
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
