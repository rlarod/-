-- =========================================================================
-- 채팅 안전장치 수정 — 거래 이벤트는 도배 검사에서 제외
-- =========================================================================
-- 무엇이 문제였나
--   채팅 도배 방지 트리거(check_chat_message)가 chat_messages 에 들어오는
--   모든 행에 1.5초 간격 제한을 겁니다.
--   그런데 청산 알림(거래 이벤트)도 같은 테이블에 들어갑니다
--   (js/trade-events-chat.js, message_type = 'trade_event').
--
--   그래서 이런 일이 생깁니다.
--     · 1.5초 안에 두 번 청산 -> 두 번째 알림이 거부됨
--     · 내가 채팅 보낸 직후 청산 -> 알림이 사라짐
--     · TP/SL 이 연달아 발동 -> 첫 건만 표시
--   게다가 trade-events-chat.js 는 실패해도 조용히 넘어가서
--   사용자도 운영자도 알아채지 못합니다.
--
-- 어떻게 고치나
--   1) 도배 검사는 사람이 친 채팅끼리만 비교합니다.
--      거래 이벤트는 간격 제한을 받지 않고, 사람 채팅의 간격을 잴 때도
--      거래 이벤트는 세지 않습니다.
--   2) 금지어 검사도 사람이 친 채팅에만 적용합니다.
--      거래 이벤트 문구는 코드가 만드는 값이라 검사할 필요가 없고,
--      코인 이름 등이 우연히 걸리는 것을 막습니다.
--   3) 사람 채팅의 도배 제한은 그대로 1.5초입니다. 느슨해지지 않습니다.
--
-- 이 파일은 함수 하나만 다시 만듭니다. 테이블·정책은 건드리지 않습니다.
-- 여러 번 실행해도 안전합니다.
-- 선행: supabase/schema-chat-safety-patch.sql (트리거가 거기서 만들어집니다)
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
  is_event boolean;
begin
  -- 거래 이벤트(청산 알림)인지 판별합니다.
  is_event := coalesce(new.message_type, 'chat') = 'trade_event';

  -- 거래 이벤트는 사람이 친 글이 아니므로 도배·금지어 검사를 건너뜁니다.
  if is_event then
    return new;
  end if;

  -- ---------------- 도배 방지 (사람 채팅끼리만) ----------------
  select created_at into last_msg_time
  from public.chat_messages
  where user_id = new.user_id
    and coalesce(message_type, 'chat') <> 'trade_event'   -- 거래 이벤트는 세지 않음
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


-- ---------------- 확인 ----------------
-- 트리거가 붙어 있어야 합니다.
select tgname as 트리거, tgenabled as 활성여부
from pg_trigger
where tgrelid = 'public.chat_messages'::regclass
  and not tgisinternal;
