-- =========================================================================
-- schema-chat-event-dedupe.sql
--   거래 알림(청산 메시지)이 채팅에 두 번 들어가는 것을 서버에서 막습니다
-- =========================================================================
--
-- 이 파일을 Run 하면 무엇이 바뀌나
--   1) chat_messages 에 message_type 칸이 없으면 만듭니다 (이미 있으면 그대로)
--   2) 거래 알림을 빨리 찾기 위한 검색용 색인을 하나 만듭니다
--   3) 트리거 함수 block_duplicate_trade_event() 를 만듭니다
--   4) 그 함수를 chat_messages 의 INSERT 앞에 트리거로 붙입니다
--   5) 맨 끝에서 지금 상태를 보여줍니다 (읽기만)
--
-- 이 파일이 하지 않는 것 — 중요
--   · 회원 데이터를 지우지 않습니다. DELETE / UPDATE / TRUNCATE 가 한 줄도 없습니다
--   · 이미 들어간 중복 2줄도 지우지 않습니다 (그건 따로 정합니다)
--   · 기존 check_chat_message() 를 건드리지 않습니다 (아래 "왜" 참조)
--   · 사람이 쓴 채팅은 검사조차 하지 않습니다
--
-- 여러 번 실행해도 안전합니다.
--   add column if not exists / create index if not exists /
--   create or replace function / drop trigger if exists + create trigger
--   전부 몇 번을 돌려도 같은 결과가 됩니다.
--
-- =========================================================================
-- 무엇이 문제였나
-- =========================================================================
--   유령 포지션 버그로 같은 청산 알림이 두 번 채팅에 들어갔습니다.
--
--     18:51  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
--     09:44  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
--
--   한 번 들어가면 모든 회원이 계속 봅니다. 지워지지 않습니다.
--   유령 포지션은 고쳤지만, 서버에 방어가 하나도 없다는 사실은 그대로입니다.
--
--   그때 서버 검사 현황
--     · chat_messages 에 unique 색인 없음        (supabase/schema.sql 164-187)
--     · 중복을 걸러내는 트리거 없음
--     · 게다가 message_type = trade_event 는 도배 검사(1.5초)마저 면제
--         supabase/schema-trade-events-chat.sql  39줄
--         supabase/schema-chat-event-exempt.sql  45줄
--         supabase/schema-admin-chat.sql        152줄
--       셋 다 맨 앞에서 return new 로 그냥 통과시킵니다
--
--   => 거래 알림 메시지에 대한 서버 검사가 0개였습니다.
--
--   브라우저 쪽에는 이미 방어가 있습니다 (js/trade-events-chat.js).
--   청산 시각 기억 + 같은 문장 90초 차단. 그런데 둘 다 그 브라우저 안에만
--   있는 기억이라, 창을 두 개 띄우거나 다른 기기로 접속하거나 저장소가
--   비워지면 통하지 않습니다. 실제 사고는 15시간 차이라 90초로는 어차피
--   못 막습니다. 그래서 서버에도 걸어 둡니다.
--
-- =========================================================================
-- 어떻게 막나 — 시간창 방식
-- =========================================================================
--   같은 user_id + 같은 message + message_type = trade_event 가
--   24시간 안에 이미 있으면  ->  return null 로 조용히 무시합니다.
--
--   왜 오류(raise exception)를 내지 않나
--     오류를 내면 화면이 "저장 실패" 로 받아들이고 무한히 다시 시도합니다.
--     docs/인계문서.md 6번에 그 사고가 적혀 있습니다.
--     return null 은 그 줄만 조용히 넣지 않고 끝냅니다. 화면에는 성공으로
--     보이고, 재시도가 일어나지 않습니다.
--
--   왜 unique 색인을 영구로 걸지 않나
--     같은 문장이 정당하게 두 번 나올 수 있습니다.
--     잔고가 정확히 10만 달러일 때 100배 최대치로 걸면 손익이 항상
--     -142,857,143원 으로 똑같이 찍힙니다. 회원이 진짜로 두 번 그럴 수
--     있습니다. unique 를 걸면 그 정당한 두 번째가 영원히 막힙니다.
--     그리고 unique 는 "시간" 을 조건에 넣을 수 없습니다.
--
--   왜 24시간인가
--     · 이번 사고가 18:51 -> 09:44, 약 15시간 차이였습니다.
--       90초(브라우저 쪽 기존 방어)로는 못 잡습니다.
--     · 하루를 넘기면 같은 문장이라도 "다른 날 있었던 일" 로 보는 것이
--       자연스럽습니다.
--     · 잘못 막았을 때의 손해가 작습니다. 막히는 것은 채팅 알림 한 줄뿐이고,
--       거래기록(trades)·손익·랭킹·TL 은 전혀 다른 표라 그대로 남습니다.
--       반대로 안 막으면 모든 회원이 틀린 줄을 영구히 봅니다.
--     · 창을 바꾸려면 아래 함수 안의 interval 24 hours 한 곳만 고치면 됩니다.
--
--   앞뒤 24시간을 모두 봅니다
--     보통은 created_at 이 서버의 now() 라 "지난 24시간" 만 의미가 있습니다.
--     혹시 시각을 직접 지정해 넣는 경우까지 대비해 앞뒤로 봅니다.
--     정상 흐름에서는 뒤쪽(미래) 조건에 걸리는 줄이 없어 동작이 같습니다.
--
-- =========================================================================
-- 왜 check_chat_message() 를 고치지 않고 트리거를 따로 다는가   [핵심]
-- =========================================================================
--   check_chat_message() 는 파일 4개에 서로 다른 내용으로 들어 있습니다.
--   파일만 봐서는 서버에 어느 것이 살아 있는지 알 수 없습니다.
--
--     schema-chat-safety-patch.sql   도배 1.5초 + 금지어 10개
--                                    (거래 이벤트 면제 없음)
--     schema-trade-events-chat.sql   + 거래 이벤트 면제
--     schema-chat-event-exempt.sql   + null 안전 처리
--     schema-admin-chat.sql          + 채팅방 잠금(is_chat_locked / am_i_admin)
--                                    단, 금지어 목록이 다릅니다
--                                    (미친놈·지랄 추가 / 씨팔·ㅅㅂ·ㅂㅅ·fuck·shit 빠짐)
--
--   덮어쓰면 둘 중 하나가 반드시 터집니다.
--
--     (가) admin-chat 판을 기준으로 쓰면
--          -> 서버에 is_chat_locked() / am_i_admin() 이 없을 경우
--             채팅 INSERT 마다 "함수 없음" 오류가 나서 채팅이 통째로 멈춥니다
--     (나) event-exempt 판을 기준으로 쓰면
--          -> admin-chat 이 살아 있었다면 채팅방 잠금 기능이 조용히 사라지고
--             금지어 목록도 바뀝니다
--
--   어느 쪽이든 "거래 알림 중복 막기" 와 상관없는 기능을 건드립니다.
--   배정 범위 밖이고, 서버 상태를 모르는 채로 하는 도박입니다.
--
--   그래서 기존 함수는 한 글자도 건드리지 않고 트리거를 하나 더 답니다.
--
--   Postgres 는 같은 표의 BEFORE INSERT 트리거를 "이름 알파벳 순" 으로
--   차례로 부릅니다. 이 파일을 돌리고 나면 이렇게 됩니다.
--
--     trg_block_dup_trade_event   <- 이 파일이 새로 다는 것   (b)
--     trg_check_chat_message      <- 기존 검사                (c)
--     trg_set_chat_nickname       <- 기존 닉네임 덮어쓰기     (s)
--
--   b < c < s 이므로 이 트리거가 가장 먼저 돕니다.
--     · 거래 알림이 아니면        -> return new  -> 기존 트리거들이 그대로 돕니다
--     · 거래 알림인데 중복이 아니면 -> return new -> 역시 그대로 돕니다
--     · 거래 알림인데 중복이면     -> return null -> 그 줄만 안 들어갑니다
--
--   즉 기존 동작이 바뀌는 경우는 "24시간 안에 똑같은 거래 알림이 또 온 때"
--   하나뿐입니다. 그 외에는 이 트리거가 아무 일도 하지 않습니다.
--
--   참고: tests/sql-function-duplicates.test.js 가 check_chat_message 를
--   4벌로 못박아 두었습니다(래칫). 5벌째를 만들면 그 검사가 실패합니다.
--   이것도 따로 다는 쪽이 맞다는 근거입니다.
--
-- =========================================================================


-- ---------------- 1) message_type 칸 확인 ----------------
-- 원래 supabase/schema-trade-events-chat.sql 이 만드는 칸입니다.
-- 이미 있으면 아무 일도 일어나지 않습니다. 없을 때만 만듭니다.
-- 없던 서버라면 기존 줄은 전부 user 가 되므로 사람 채팅으로 취급됩니다.
alter table public.chat_messages
  add column if not exists message_type text not null default 'user';


-- ---------------- 2) 찾기 빠르게 ----------------
-- 거래 알림만 담는 부분 색인입니다. unique 가 아니라서 무엇도 거부하지 않습니다.
-- 사람 채팅은 이 색인에 들어가지도 않습니다.
create index if not exists idx_chat_trade_event_dup
  on public.chat_messages (user_id, created_at desc)
  where message_type = 'trade_event';


-- ---------------- 3) 중복이면 조용히 무시 ----------------
create or replace function public.block_duplicate_trade_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  win_span constant interval := interval '24 hours';  -- 창 길이는 여기 한 곳만 고치면 됩니다
  anchor   timestamptz;                        -- 새로 들어온 줄의 시각
begin
  -- 사람이 쓴 채팅은 손대지 않습니다. 여기서 바로 돌려보냅니다.
  -- 사람은 같은 말을 두 번 할 수 있고, 그건 막으면 안 됩니다.
  if coalesce(new.message_type, 'user') <> 'trade_event' then
    return new;
  end if;

  anchor := coalesce(new.created_at, now());

  -- 같은 사람 + 같은 문장 + 거래 알림 이 24시간 안에 이미 있나
  if exists (
    select 1
    from public.chat_messages c
    where c.user_id = new.user_id
      and coalesce(c.message_type, 'user') = 'trade_event'
      and c.message = new.message
      and c.created_at > anchor - win_span
      and c.created_at < anchor + win_span
  ) then
    -- 오류를 내지 않습니다. 오류를 내면 화면이 "저장 실패" 로 보고
    -- 무한히 다시 시도합니다. 조용히 넣지 않고 끝냅니다.
    return null;
  end if;

  return new;
end;
$$;


-- ---------------- 4) INSERT 앞에 붙이기 ----------------
-- 이름을 trg_b... 로 시작하는 이유는 위 설명대로 기존 trg_c... / trg_s...
-- 보다 먼저 돌게 하기 위해서입니다.
drop trigger if exists trg_block_dup_trade_event on public.chat_messages;
create trigger trg_block_dup_trade_event
  before insert on public.chat_messages
  for each row execute function public.block_duplicate_trade_event();


-- ---------------- 5) 확인 (읽기만 합니다) ----------------

-- 5-1) 트리거가 몇 개 붙어 있고 순서가 어떻게 되는지
--      trg_block_dup_trade_event 가 맨 위에 나와야 맞습니다.
select
  tgname                                                      as 트리거이름,
  case tgenabled when 'O' then '켜짐' else tgenabled::text end as 상태
from pg_trigger
where tgrelid = 'public.chat_messages'::regclass
  and not tgisinternal
order by tgname;

-- 5-2) 지금 남아 있는 중복 거래 알림
--      이 파일은 지우지 않습니다. 무엇이 있는지 보여주기만 합니다.
select
  c.nickname            as 닉네임,
  c.message             as 문장,
  count(*)              as 같은문장건수,
  min(c.created_at)     as 처음,
  max(c.created_at)     as 마지막
from public.chat_messages c
where coalesce(c.message_type, 'user') = 'trade_event'
group by c.user_id, c.nickname, c.message
having count(*) > 1
order by count(*) desc, max(c.created_at) desc;


-- =========================================================================
-- 되돌리는 방법
-- =========================================================================
--   아래 세 줄을 복사해서 SQL Editor 에 붙여넣고 Run 하면 이 파일이 한 일이
--   전부 없어집니다. 회원 데이터·채팅 내용은 그대로입니다.
--
--     drop trigger if exists trg_block_dup_trade_event on public.chat_messages;
--     drop function if exists public.block_duplicate_trade_event();
--     drop index if exists public.idx_chat_trade_event_dup;
--
--   message_type 칸은 원래 schema-trade-events-chat.sql 것이라 그대로 둡니다.
--   지우면 채팅 화면이 거래 알림을 구분하지 못합니다.
-- =========================================================================
