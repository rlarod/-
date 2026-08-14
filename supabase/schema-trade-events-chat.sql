-- =========================================================================
-- 채팅 거래 이벤트 메시지 지원 (PHASE 9)
-- =========================================================================
-- 이 파일은 기존 chat_messages 테이블/데이터를 전혀 삭제하지 않습니다.
--   - ADD COLUMN IF NOT EXISTS만 사용
--   - 기존 도배방지/욕설필터 트리거 함수는 CREATE OR REPLACE로 "거래
--     이벤트 메시지는 예외 처리"만 추가합니다(재실행 안전)
--
-- message_type: 'user'(일반 채팅, 기본값) | 'trade_event'(자동 생성,
-- 청산 시에만 — 단순히 주문 버튼을 눌렀다고 생성되지 않음, js/trade-
-- events-chat.js가 trading.js의 실제 청산 이벤트에서만 만듭니다).
--
-- 거래 이벤트 메시지는 사람이 타이핑한 게 아니라 시스템이 자동 생성한
-- 것이라, 기존 "1.5초 연속 도배 방지"/"욕설 필터"를 그대로 적용하면
-- 사용자가 채팅하다가 마침 그 순간에 청산해서 둘 중 하나가 막히는
-- 부작용이 생길 수 있습니다 — 그래서 trade_event 타입은 두 검사 모두
-- 예외 처리합니다.
-- =========================================================================

alter table public.chat_messages add column if not exists message_type text not null default 'user';
alter table public.chat_messages drop constraint if exists chat_messages_message_type_check;
alter table public.chat_messages add constraint chat_messages_message_type_check
  check (message_type in ('user', 'trade_event'));

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
  -- 거래 이벤트 메시지(시스템 자동 생성)는 도배방지/욕설필터 예외
  if new.message_type = 'trade_event' then
    return new;
  end if;

  -- 1) 연속 도배 방지 — 같은 사용자가 1.5초 이내에 또 보내면 차단
  --    (일반 채팅 메시지끼리만 비교 — 거래 이벤트는 별개로 취급)
  select created_at into last_msg_time
  from public.chat_messages
  where user_id = new.user_id and message_type = 'user'
  order by created_at desc
  limit 1;

  if last_msg_time is not null and (now() - last_msg_time) < interval '1.5 seconds' then
    raise exception 'rate_limited';
  end if;

  -- 2) 기본 욕설 필터(대소문자 무관 부분 일치)
  foreach w in array banned_words loop
    if new.message ilike '%' || w || '%' then
      raise exception 'profanity_detected';
    end if;
  end loop;

  return new;
end;
$$;

-- 트리거 자체는 이미 있으면 그대로 재사용(함수만 교체됐으므로 재생성 불필요하지만 안전하게 재확인)
drop trigger if exists trg_check_chat_message on public.chat_messages;
create trigger trg_check_chat_message
  before insert on public.chat_messages
  for each row execute function public.check_chat_message();
