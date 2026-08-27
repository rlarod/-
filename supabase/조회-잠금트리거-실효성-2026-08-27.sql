-- =========================================================================
-- 조회-잠금트리거-실효성-2026-08-27.sql
--   "회원이 못 고치게 잠근 트리거가 ★진짜로 잠그고 있나★" 를 표로 봅니다
-- =========================================================================
-- ⛔ 읽기만 합니다. UPDATE / INSERT / DELETE / DROP / CREATE 가 한 줄도
--    없습니다. 몇 번을 돌리셔도 아무것도 바뀌지 않습니다.
--
-- 왜 이 파일이 필요한가
--   supabase/fix-trading-accounts-rls.sql 의 잠금 트리거가 처음에
--   security definer 로 만들어져 있었습니다. 그러면 안쪽 검사가
--   ★한 줄도 안 돕니다★. 그런데 "트리거 달렸나?" 로만 보면 멀쩡히
--   달려 있다고 나옵니다. 오류도 안 납니다 - 전형적인 조용한 고장입니다.
--
--   "달려 있다" 와 "실제로 돈다" 는 다릅니다. 이 파일은 뒤쪽을 봅니다.
--
-- 근거 (PostgreSQL / PostgREST 공식 문서, 2026-08-27 확인)
--   . PostgreSQL 39.1 Overview of Trigger Behavior
--       "the trigger will always run as the role that queued the trigger
--        event, unless the trigger function is marked as SECURITY DEFINER,
--        in which case it will run as the function owner."
--   . PostgreSQL 9.27 System Information Functions
--       "The current_user ... can be changed with SET ROLE. It also changes
--        during the execution of functions with the attribute SECURITY DEFINER."
--   . PostgREST References/Auth - User Impersonation
--       브라우저 요청은 authenticator 로 접속한 뒤 SET LOCAL ROLE 로
--       authenticated / anon 이 됩니다.
--       -> session_user 는 언제나 authenticator, current_user 만 갈립니다.
--
-- 어떻게 돌리나
--   블록이 6개입니다 (1번~6번).
--   Supabase SQL Editor 에서 ★한 블록씩 드래그해서 선택한 뒤 Run★ 해 주세요.
--   한 번에 다 돌리면 마지막 표 하나만 보입니다.
-- =========================================================================


-- =========================================================================
-- [1] 지금 이 편집기에서 나는 누구인가  (기준점 잡기)
-- =========================================================================
-- SQL 편집기에서 돌리면 보통 postgres 로 나옵니다.
-- 브라우저에서 온 저장이라면 current_user 가 authenticated 로 나옵니다.
-- 이 차이로 "브라우저가 직접 보낸 것" 을 가려냅니다.
select
  current_user                                as 지금_current_user,
  session_user                                as 지금_session_user,
  current_setting('request.jwt.claims', true) as 요청JWT_있나_없으면_편집기;


-- =========================================================================
-- [2] ★핵심★ 잠금 트리거가 실제로 잠그고 있나
-- =========================================================================
-- 맨 오른쪽 '판정' 칸 하나만 보시면 됩니다.
select
  case when to_regprocedure('public.lock_server_owned_account_fields()') is null
       then '없음' else '있음' end                                as 잠금함수_있나,
  coalesce((select case when p.prosecdef then 'security definer'
                        else 'security invoker' end
              from pg_proc p
             where p.oid = to_regprocedure(
                     'public.lock_server_owned_account_fields()')), '-')
                                                                  as 잠금함수_모드,
  coalesce((select r.rolname::text from pg_proc p
              join pg_roles r on r.oid = p.proowner
             where p.oid = to_regprocedure(
                     'public.lock_server_owned_account_fields()')), '-')
                                                                  as 잠금함수_주인,
  (select count(*) from pg_trigger
    where tgrelid = 'public.trading_accounts'::regclass
      and tgname  = 'trg_lock_server_owned_account_fields'
      and not tgisinternal)                                       as 트리거_달린수,
  case
    when to_regprocedure('public.lock_server_owned_account_fields()') is null
      then '1. 함수가 없습니다 - fix-trading-accounts-rls.sql 의 [2] 를 아직 안 돌리셨습니다'
    when not exists (select 1 from pg_trigger
                      where tgrelid = 'public.trading_accounts'::regclass
                        and tgname  = 'trg_lock_server_owned_account_fields'
                        and not tgisinternal)
      then '2. 함수는 있는데 트리거가 안 달렸습니다 - 잠금이 안 돕니다'
    when (select p.prosecdef from pg_proc p
           where p.oid = to_regprocedure(
                   'public.lock_server_owned_account_fields()'))
      then '3. ⚠ security definer 입니다 - 달려는 있는데 안쪽이 한 줄도 안 돕니다 (조용한 고장)'
    when (select tgenabled from pg_trigger
           where tgrelid = 'public.trading_accounts'::regclass
             and tgname  = 'trg_lock_server_owned_account_fields'
             and not tgisinternal) <> 'O'
      then '4. ⚠ 트리거가 꺼져 있습니다'
    else '5. ✅ security invoker + 켜짐 - 실제로 잠그고 있습니다'
  end                                                             as 판정;


-- =========================================================================
-- [3] trading_accounts 에 걸린 트리거 전부 - ★도는 순서대로★
-- =========================================================================
-- 왜 순서를 보나
--   같은 시점(BEFORE UPDATE)에 트리거가 여럿이면 PostgreSQL 은
--   ★이름 알파벳 순★ 으로 실행합니다. 우리 잠금 뒤에 도는 트리거가
--   같은 칸을 다시 고치면 잠금이 무효가 됩니다.
--   표의 위에서 아래가 곧 실행 순서입니다.
select
  t.tgname                                        as 트리거이름_이_순서로_돕니다,
  case t.tgenabled when 'O' then '켜짐' when 'D' then '⚠ 꺼짐'
                   else t.tgenabled::text end     as 켜짐,
  case when (t.tgtype::int & 2)  > 0 then 'BEFORE' else 'AFTER' end as 시점,
  concat_ws(' ',
    case when (t.tgtype::int & 4)  > 0 then 'INSERT' end,
    case when (t.tgtype::int & 8)  > 0 then 'DELETE' end,
    case when (t.tgtype::int & 16) > 0 then 'UPDATE' end)          as 언제,
  p.proname                                       as 함수,
  case when p.prosecdef then '⚠ security definer (안쪽 current_user 가 주인으로 바뀜)'
       else 'security invoker' end                as 함수모드,
  r.rolname                                       as 함수주인
from pg_trigger t
join pg_proc  p on p.oid = t.tgfoid
join pg_roles r on r.oid = p.proowner
where t.tgrelid = 'public.trading_accounts'::regclass
  and not t.tgisinternal
order by t.tgname;


-- =========================================================================
-- [4] ★중요★ 무료충전.아이템이 잠금에 막히지 않나
-- =========================================================================
-- 잠금이 security invoker 라면, 서버 함수 안에서 도는 UPDATE 는
-- ★그 서버 함수의 주인★ 자격으로 돕니다.
--   주인이 authenticated / anon 이 아니면 -> 잠금이 안 걸림 -> 정상 동작 (OK)
--   주인이 authenticated / anon 이면       -> 잠금이 걸림 -> 충전.아이템이
--                                             조용히 안 먹힘 (문제)
-- 아래 '충전이_막히나' 칸이 전부 '✅ 안 막힘' 이어야 합니다.
select
  p.proname                                       as 함수,
  case when p.prosecdef then 'security definer' else '⚠ security invoker' end
                                                  as 모드,
  r.rolname                                       as 주인,
  case
    when not p.prosecdef
      then '⚠ invoker 라 브라우저가 부르면 current_user=authenticated -> 잠금에 막힙니다'
    when r.rolname::text in ('authenticated', 'anon')
      then '⚠ 주인이 ' || r.rolname::text || ' 이라 잠금에 막힙니다'
    else '✅ 안 막힘'
  end                                             as 충전이_막히나
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_roles r     on r.oid = p.proowner
where n.nspname = 'public'
  and p.proname in ('claim_daily_recharge', 'use_user_item', 'reset_season',
                    'reset_trading_cycle', 'start_new_cycle',
                    'purchase_tl_market_item', 'force_starting_balance',
                    'check_trading_account_update')
order by p.proname;


-- =========================================================================
-- [5] 브라우저 역할이 잠금 함수를 실행할 수 있나
-- =========================================================================
-- security invoker 트리거 함수는 부르는 역할에게 EXECUTE 권한이 있는 편이
-- 안전합니다. PostgreSQL 기본값은 PUBLIC 에 열려 있어 보통 문제가 없지만,
-- 서버에서 회수해 둔 경우를 확인합니다. 둘 다 true 여야 합니다.
select 역할,
       has_function_privilege(역할::name,
         to_regprocedure('public.lock_server_owned_account_fields()'),
         'EXECUTE') as 실행권한_있나
from (values ('authenticated'), ('anon')) as v(역할)
where to_regprocedure('public.lock_server_owned_account_fields()') is not null;


-- =========================================================================
-- [6] UPDATE 정책에 '고친 뒤 검사(with check)' 가 채워졌나
-- =========================================================================
select
  polname                                   as 정책이름,
  pg_get_expr(polqual,      polrelid)       as "고칠수있는줄(using)",
  pg_get_expr(polwithcheck, polrelid)       as "고친뒤_검사(with check)",
  case when polwithcheck is null then '⚠ 아직 비어 있음' else '✅ 채워짐' end as 상태
from pg_policy
where polrelid = 'public.trading_accounts'::regclass
  and polcmd   = 'w';


-- =========================================================================
-- 결과를 어떻게 읽나 (요약)
-- =========================================================================
--   [2] 판정 = '5. ✅'  이고
--   [4] 충전이_막히나 가 전부 '✅ 안 막힘'  이고
--   [6] 상태 = '✅ 채워짐'   ->  잠금이 제대로 걸린 상태입니다.
--
--   [2] 가 '3.' 이면 fix-trading-accounts-rls.sql 을 다시 Run 하시면 됩니다.
--   [3] 에서 우리 트리거(trg_lock_...) 보다 ★뒤에★ 오는 BEFORE UPDATE
--       트리거가 있으면 그 이름을 알려 주세요. 그 함수 본문을 봐야 합니다.
-- =========================================================================


-- =========================================================================
-- ★2026-08-27 추가★  [7] ~ [9]  INSERT 쪽은 어떻게 되어 있나
-- =========================================================================
-- ⛔ 여기도 ★읽기만★ 합니다. 아무것도 바뀌지 않습니다.
--
-- 왜 붙였나
--   [1]~[6] 은 전부 UPDATE 쪽 이야기입니다. 잠금 트리거가
--   before update 라서 INSERT 는 한 줄도 안 봅니다.
--   INSERT 정책은 "누구 줄인지" 만 보고 "무슨 값인지" 는 안 봅니다.
--
--     supabase/schema.sql:50
--       create policy "trading_accounts_insert_own" ...
--         for insert with check (auth.uid() = user_id);
--
--   그런데 서버에는 저장소 파일과 별개로 before insert 트리거가
--   하나 걸려 있을 수 있습니다 (trg_force_starting_balance).
--   그게 살아 있으면 INSERT 구멍이 이미 막혀 있고, 없으면 뚫려 있습니다.
--   ★파일만 봐서는 못 가립니다. 아래를 돌려야 압니다.★
--
--   블록이 3개입니다. 한 블록씩 드래그해서 Run 해 주세요.
-- =========================================================================


-- =========================================================================
-- [7] trading_accounts 의 네 가지 동작(select/insert/update/delete) 정책 전부
-- =========================================================================
-- 보실 곳
--   · 'insert' 줄의 "고친뒤_검사(with check)" — user_id 만 보고 있으면
--     값(initial_balance 등)은 아무도 안 보는 상태입니다.
--   · 'delete' 줄이 ★아예 없어야★ 정상입니다.
--     RLS 는 정책이 없으면 막습니다. 그래서 회원이 자기 줄을 지우고
--     새로 만드는 것은 못 합니다(= 구멍이 1회용으로 좁아집니다).
select
  case polcmd when 'r' then 'select' when 'a' then 'insert'
              when 'w' then 'update' when 'd' then 'delete'
              else 'all' end                  as 대상동작,
  polname                                     as 정책이름,
  pg_get_expr(polqual,      polrelid)         as "고칠수있는줄(using)",
  pg_get_expr(polwithcheck, polrelid)         as "고친뒤_검사(with check)"
from pg_policy
where polrelid = 'public.trading_accounts'::regclass
order by polcmd, polname;

-- delete 정책이 정말로 없는지 한 줄로.
select
  case when exists (
    select 1 from pg_policy
    where polrelid = 'public.trading_accounts'::regclass
      and polcmd in ('d', '*')
  ) then '⚠ delete 를 허용하는 정책이 있습니다 - 지우고 다시 만들 수 있습니다'
  else '✅ delete 정책 없음 - 회원은 자기 줄을 못 지웁니다'
  end as 지우고_다시만들기_가능한가;


-- =========================================================================
-- [8] ★핵심★ before insert 트리거가 INSERT 값을 덮고 있나
-- =========================================================================
-- 저장소에 이 트리거를 만드는 파일이 ★두 개★ 있습니다. 내용이 다릅니다.
--   supabase/schema-initial-balance.sql:54   (옛 버전 - 언제나 덮음)
--   supabase/지갑초기화-해결.sql:57          (고친 버전 - 새 줄일 때만 덮음)
-- 어느 것이 마지막에 돌았느냐로 서버 동작이 달라집니다. 그래서 봅니다.
select
  case
    when to_regprocedure('public.force_starting_balance()') is null
      then '⚠ 함수가 없습니다 - INSERT 로 initial_balance 를 마음대로 넣을 수 있습니다'
    when not exists (
           select 1 from pg_trigger
            where tgrelid = 'public.trading_accounts'::regclass
              and tgname  = 'trg_force_starting_balance'
              and not tgisinternal)
      then '⚠ 함수는 있는데 트리거가 안 달렸습니다 - 역시 뚫려 있습니다'
    when (select tgenabled from pg_trigger
           where tgrelid = 'public.trading_accounts'::regclass
             and tgname  = 'trg_force_starting_balance'
             and not tgisinternal) = 'D'
      then '⚠ 트리거가 ★꺼져★ 있습니다(D) - 뚫려 있습니다'
    when pg_get_functiondef(to_regprocedure('public.force_starting_balance()'))
         ilike '%if exists%'
      then '✅ 고친 버전(지갑초기화-해결.sql) - 새 줄일 때만 100,000 으로 덮습니다'
    else '△ 옛 버전(schema-initial-balance.sql) - 언제나 덮습니다. 잔고가 새로고침마다 초기화될 수 있습니다'
  end                                          as INSERT_막혀있나,
  (select tgenabled::text from pg_trigger
    where tgrelid = 'public.trading_accounts'::regclass
      and tgname  = 'trg_force_starting_balance'
      and not tgisinternal)                    as 트리거_켜짐여부_O가정상;

-- 함수 본문 전체 (있으면 나옵니다). 어느 칸을 덮는지 눈으로 확인용입니다.
select p.proname as 함수, pg_get_functiondef(p.oid) as 본문
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('force_starting_balance', 'starting_balance');

-- before insert 로 걸린 트리거 전부 (여러 개면 이름 알파벳 순으로 돕니다).
select
  tgname                                        as 트리거,
  tgenabled::text                               as 켜짐,
  pg_get_triggerdef(oid)                        as 정의
from pg_trigger
where tgrelid = 'public.trading_accounts'::regclass
  and not tgisinternal
  and (tgtype & 4) <> 0     -- INSERT 에 반응
  and (tgtype & 2) <> 0     -- BEFORE
order by tgname;


-- =========================================================================
-- [9] 이미 뚫린 흔적이 있나 (집계만 - 개인 기록은 이상한 것만 나옵니다)
-- =========================================================================
-- 정상이면 모든 회원의 기준자본(initial_balance)이 100,000 입니다.
-- 하나라도 다르면 ①옛날 10,000 시절 계정이 남았거나 ②손으로 넣은 값입니다.
select
  count(*)                                                     as 회원수,
  count(*) filter (where initial_balance = 100000)             as 기준자본_10만,
  count(*) filter (where initial_balance <> 100000)            as 기준자본_다름,
  count(*) filter (where coalesce(recharge_count, 0) < 0)      as 충전횟수_음수,
  count(*) filter (where coalesce(recharge_total, 0) < 0)      as 충전누계_음수,
  count(*) filter (where coalesce(cycle_no, 1) < 1)            as 사이클번호_이상
from public.trading_accounts;

-- 위에서 0 이 아닌 칸이 있으면 그 줄만 봅니다.
select
  p.nickname                        as 닉네임,
  round(ta.initial_balance)         as 기준자본,
  round(ta.balance)                 as 지갑,
  round(coalesce(ta.recharge_total, 0)) as 충전누계,
  coalesce(ta.recharge_count, 0)    as 충전횟수,
  coalesce(ta.cycle_no, 1)          as 사이클,
  ta.updated_at                     as 마지막저장
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
where ta.initial_balance <> 100000
   or coalesce(ta.recharge_count, 0) < 0
   or coalesce(ta.recharge_total, 0) < 0
   or coalesce(ta.cycle_no, 1) < 1
order by ta.updated_at desc;


-- =========================================================================
-- [7]~[9] 결과를 어떻게 읽나
-- =========================================================================
--   [8] INSERT_막혀있나 가 '✅' 또는 '△'  ->  INSERT 구멍은 이미 막혀 있습니다.
--       (initial_balance / balance 를 서버가 덮어씁니다)
--       ⚠ 단 recharge_count · cycle_no 같은 나머지 칸은 여전히 안 봅니다.
--
--   [8] 이 '⚠' 로 시작하면  ->  가입 순간에 기준자본을 마음대로 넣을 수
--       있는 상태입니다. 이때만 수리가 필요합니다.
--
--   [7] 에서 delete 정책이 없으면, 뚫더라도 ★계정당 딱 한 번★ 입니다.
--       (줄이 이미 있으면 INSERT 는 PK 충돌 23505 로 막힙니다)
--
--   [9] 가 전부 0 이면 지금까지 뚫린 흔적은 없습니다.
-- =========================================================================
