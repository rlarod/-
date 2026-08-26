-- ============================================================================
--
--   채팅에 두 번 들어간 거래 알림(청산 메시지)을 지웁니다
--
--   ⚠️⚠️  지운 채팅은 원칙적으로 되살릴 수 없습니다  ⚠️⚠️
--
--         그래서 이 파일은 지우기 전에 반드시 사본을 먼저 남깁니다.
--         사본 표 이름:  public.chat_event_dedupe_backup_20260826
--
--         사본이 남아 있는 동안에는 되살릴 수 있습니다(맨 아래 "되돌리는 방법").
--         ⚠️ 사본 표를 지우는 순간부터는 영영 되살릴 수 없습니다.
--            사본 표는 지우지 마세요. 지워도 화면에는 아무 영향이 없습니다.
--
-- ============================================================================
--
--   이 파일이 하지 않는 것 — 중요
--
--     · 사람이 친 채팅은 한 줄도 건드리지 않습니다
--       (message_type = 'trade_event' 인 자동 알림만 봅니다)
--     · trades · trading_accounts · tl_transactions · profiles · positions ·
--       orders 는 한 글자도 건드리지 않습니다
--       → 회원의 돈 · 순위 · TL · 거래기록은 하나도 안 바뀝니다
--     · WHERE 없는 DELETE 를 쓰지 않습니다
--     · 중복이 아닌 알림은 지우지 않습니다
--
-- ============================================================================
--
--   무엇이 문제였나
--
--     18:51  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
--     09:44  김갱님의 BTC 매수 포지션이 강제청산되었습니다 (-142,857,143원)
--                                                          ↑ 같은 것이 또
--
--   유령 포지션 버그 때문에 일어나지도 않은 청산이 한 번 더 기록됐습니다.
--   앞으로 새로 생기는 것은 이미 막혔습니다
--   (supabase/schema-chat-event-dedupe.sql — 대표님이 Run 하셨습니다).
--   이 파일은 그 전에 이미 들어가 버린 줄을 정리합니다.
--
-- ============================================================================
--
--   무엇을 "중복" 으로 보나  ← 이미 켜 둔 트리거와 똑같은 기준입니다
--
--     같은 회원 + 똑같은 문장 + 거래 알림 이
--     24시간 안에 두 번 이상 있으면 중복입니다.
--
--     · 처음 것을 남기고, 뒤에 온 것을 지웁니다.
--       (18:51 이 진짜 청산이고 09:44 가 유령입니다)
--     · 24시간을 넘겨서 같은 문장이 또 나온 것은 지우지 않습니다.
--       잔고가 딱 맞아떨어질 때 손익이 똑같이 찍히는 일이 실제로 있습니다.
--       그건 다른 날 진짜로 또 일어난 일이라 남깁니다.
--       (schema-chat-event-dedupe.sql 이 정한 기준과 같게 맞춘 것입니다.
--        기준이 다르면, 트리거가 통과시킨 줄을 이 파일이 나중에 지워버립니다)
--
--     김갱님 것만 보는 게 아니라 전 회원을 다 봅니다.
--
-- ============================================================================
--
--   대표님이 하실 일 — Run 한 번
--
--     1. 이 파일을 통째로 복사해서 SQL Editor 에 붙여넣습니다
--     2. Run 을 누릅니다
--     3. 결과 표를 캡처해서 보내주세요
--
--   결과 표가 여러 개 나옵니다. 아래로 내리면서 보시면 됩니다.
--        ① 지울 것 미리보기   무엇이 지워지는지 (지우기 전 모습)
--        ② 실제로 지운 것     방금 지운 줄
--        ③ 정리 결과          남은 줄 수 / 아직 남은 중복 (0 이어야 정상)
--
--   여러 번 Run 해도 안전합니다.
--   두 번째부터는 지울 것이 없어서 ①②가 빈 표로 나오고 아무 일도 안 합니다.
--
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0) 사본 표를 먼저 준비합니다 (지우기 전에 반드시 여기에 옮겨 담습니다)
-- ---------------------------------------------------------------------------
--   chat_messages 와 같은 칸을 그대로 가진 표입니다.
--   여기에 옮겨 담은 뒤에만 원본을 지웁니다.
--   RLS 를 켜고 정책을 하나도 만들지 않아, 화면(API)에서는 아무도 못 봅니다.
--   SQL Editor 에서만 보입니다.

create table if not exists public.chat_event_dedupe_backup_20260826 (
  id           uuid primary key,
  user_id      uuid,
  nickname     text,
  message      text,
  message_type text,
  created_at   timestamptz,
  지운시각      timestamptz not null default now(),
  지운이유      text        not null default '거래 알림 중복(24시간 안 같은 문장) — 2026-08-26'
);

alter table public.chat_event_dedupe_backup_20260826 enable row level security;


-- ---------------------------------------------------------------------------
-- ① 지울 것 미리보기 (읽기만 합니다 — 아직 아무것도 안 지웁니다)
-- ---------------------------------------------------------------------------
--   같은 회원 + 같은 문장끼리 시간 순으로 줄을 세우고,
--   앞에 남긴 줄로부터 24시간 안에 있는 줄에 "지울 것" 표시를 합니다.

with recursive 순서 as (
  select
    c.id, c.user_id, c.nickname, c.message, c.created_at,
    row_number() over (
      partition by c.user_id, c.message
      order by c.created_at asc, c.id asc
    ) as 순번
  from public.chat_messages c
  where coalesce(c.message_type, 'user') = 'trade_event'
),
훑기 as (
  -- 각 묶음의 첫 줄은 무조건 남깁니다
  select
    o.id, o.user_id, o.nickname, o.message, o.created_at, o.순번,
    o.created_at as 남긴줄시각,
    false        as 지울것
  from 순서 o
  where o.순번 = 1

  union all

  -- 다음 줄이 "마지막으로 남긴 줄" 로부터 24시간 안이면 지울 것
  select
    n.id, n.user_id, n.nickname, n.message, n.created_at, n.순번,
    case when n.created_at - w.남긴줄시각 > interval '24 hours'
         then n.created_at else w.남긴줄시각 end,
    not (n.created_at - w.남긴줄시각 > interval '24 hours')
  from 훑기 w
  join 순서 n
    on  n.user_id = w.user_id
    and n.message = w.message
    and n.순번    = w.순번 + 1
)
select
  '① 지울 것 미리보기' as 구분,
  w.nickname            as 닉네임,
  w.message             as 문장,
  w.created_at          as 지울줄시각,
  w.남긴줄시각          as 남길줄시각,
  w.created_at - w.남긴줄시각 as 시간차
from 훑기 w
where w.지울것
order by w.nickname, w.message, w.created_at;


-- ---------------------------------------------------------------------------
-- ②-1) 지우기 전에 사본으로 옮겨 담습니다
-- ---------------------------------------------------------------------------
--   위 ① 과 똑같은 계산을 그대로 씁니다.
--   이미 사본에 있는 줄은 다시 넣지 않습니다(여러 번 Run 해도 안전).

with recursive 순서 as (
  select
    c.id, c.user_id, c.nickname, c.message, c.message_type, c.created_at,
    row_number() over (
      partition by c.user_id, c.message
      order by c.created_at asc, c.id asc
    ) as 순번
  from public.chat_messages c
  where coalesce(c.message_type, 'user') = 'trade_event'
),
훑기 as (
  select
    o.id, o.user_id, o.nickname, o.message, o.message_type, o.created_at, o.순번,
    o.created_at as 남긴줄시각,
    false        as 지울것
  from 순서 o
  where o.순번 = 1

  union all

  select
    n.id, n.user_id, n.nickname, n.message, n.message_type, n.created_at, n.순번,
    case when n.created_at - w.남긴줄시각 > interval '24 hours'
         then n.created_at else w.남긴줄시각 end,
    not (n.created_at - w.남긴줄시각 > interval '24 hours')
  from 훑기 w
  join 순서 n
    on  n.user_id = w.user_id
    and n.message = w.message
    and n.순번    = w.순번 + 1
)
insert into public.chat_event_dedupe_backup_20260826
  (id, user_id, nickname, message, message_type, created_at)
select w.id, w.user_id, w.nickname, w.message, w.message_type, w.created_at
from 훑기 w
where w.지울것
on conflict (id) do nothing;


-- ---------------------------------------------------------------------------
-- ②-2) 사본에 담긴 줄만 지웁니다
-- ---------------------------------------------------------------------------
--   조건이 세 겹입니다. 하나라도 안 맞으면 안 지웁니다.
--     1) 사본 표에 그 줄이 들어 있어야 하고 (id 가 정확히 일치)
--     2) 거래 알림이어야 하고 (사람 채팅은 여기서 다시 한 번 걸러냅니다)
--     3) 사본에 적힌 문장 · 작성자와 완전히 같아야 합니다
--   WHERE 없는 DELETE 가 아닙니다.
--
--   두 번째 Run 부터는 이미 지워진 줄이라 0건이 지워집니다.

with 지운것 as (
  delete from public.chat_messages c
  using public.chat_event_dedupe_backup_20260826 b
  where c.id      = b.id
    and coalesce(c.message_type, 'user') = 'trade_event'
    and c.message = b.message
    and c.user_id = b.user_id
  returning c.id, c.nickname, c.message, c.created_at
)
select
  '② 실제로 지운 것' as 구분,
  nickname            as 닉네임,
  message             as 문장,
  created_at          as 지운줄시각
from 지운것
order by nickname, created_at;


-- ---------------------------------------------------------------------------
-- ③ 정리 결과 (읽기만 합니다)
-- ---------------------------------------------------------------------------

select '③-1 전체 채팅 줄 수'        as 구분, count(*)::text as 값 from public.chat_messages
union all
select '③-2 그중 거래 알림',        count(*)::text from public.chat_messages
  where coalesce(message_type, 'user') = 'trade_event'
union all
select '③-3 그중 사람이 쓴 채팅',   count(*)::text from public.chat_messages
  where coalesce(message_type, 'user') <> 'trade_event'
union all
select '③-4 사본에 보관 중인 줄',   count(*)::text from public.chat_event_dedupe_backup_20260826
;

-- ③-5 아직 남은 중복이 몇 줄인가 (0 이어야 정상)
--     ① 과 완전히 같은 계산을 다시 돌립니다. 읽기만 합니다.
with recursive 순서 as (
  select
    c.id, c.user_id, c.message, c.created_at,
    row_number() over (
      partition by c.user_id, c.message
      order by c.created_at asc, c.id asc
    ) as 순번
  from public.chat_messages c
  where coalesce(c.message_type, 'user') = 'trade_event'
),
훑기 as (
  select o.id, o.user_id, o.message, o.created_at, o.순번,
         o.created_at as 남긴줄시각, false as 지울것
  from 순서 o
  where o.순번 = 1
  union all
  select n.id, n.user_id, n.message, n.created_at, n.순번,
         case when n.created_at - w.남긴줄시각 > interval '24 hours'
              then n.created_at else w.남긴줄시각 end,
         not (n.created_at - w.남긴줄시각 > interval '24 hours')
  from 훑기 w
  join 순서 n
    on  n.user_id = w.user_id
    and n.message = w.message
    and n.순번    = w.순번 + 1
)
select '③-5 아직 남은 중복(0 이어야 정상)' as 구분,
       count(*)::text                       as 값
from 훑기 where 지울것;

-- 남은 거래 알림을 눈으로 확인 (최근 30줄)
select
  '③-6 남은 거래 알림(최근 30줄)' as 구분,
  c.nickname   as 닉네임,
  c.message    as 문장,
  c.created_at as 시각
from public.chat_messages c
where coalesce(c.message_type, 'user') = 'trade_event'
order by c.created_at desc
limit 30;


-- ============================================================================
--
--   결과 읽는 법
--
--     ① 지울 것 미리보기   1줄 로 예상됩니다 (김갱님 09:44 짜리 한 줄).
--                          18:51 짜리는 남습니다. 그게 진짜 청산입니다.
--                          2줄 이상 나오면 다른 회원 것도 같이 정리된 것입니다.
--                          몇 줄이 나오든 ① 을 먼저 보고 판단하실 수 있습니다.
--     ② 실제로 지운 것     ① 과 같은 줄이 나와야 맞습니다.
--     ③-5 아직 남은 중복   0 이면 성공입니다.
--
--   ①②가 처음부터 빈 표면 = 지울 중복이 없다는 뜻입니다. 그것도 정상입니다.
--
-- ============================================================================
--
--   되돌리는 방법  ⚠️ 사본 표가 살아 있을 때만 됩니다
--
--   아래 한 덩어리를 SQL Editor 에 붙여넣고 Run 하면 지운 줄이 그대로
--   되살아납니다. 시각(created_at)까지 원래대로 돌아옵니다.
--
--   ⚠️ 단, 되살리기 전에 중복 차단 트리거를 잠깐 꺼야 합니다.
--      안 끄면 트리거가 "중복" 이라며 조용히 도로 막아서 아무것도 안 들어옵니다.
--
--     alter table public.chat_messages disable trigger trg_block_dup_trade_event;
--
--     insert into public.chat_messages (id, user_id, nickname, message, message_type, created_at)
--     select id, user_id, nickname, message, message_type, created_at
--     from public.chat_event_dedupe_backup_20260826
--     on conflict (id) do nothing;
--
--     alter table public.chat_messages enable trigger trg_block_dup_trade_event;
--
--   사본 표까지 없애고 완전히 정리하려면(되살리기 불가능해집니다):
--
--     drop table if exists public.chat_event_dedupe_backup_20260826;
--
-- ============================================================================
