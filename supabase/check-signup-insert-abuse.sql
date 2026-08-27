-- =========================================================================
-- check-signup-insert-abuse.sql
--   "가입할 때 이상한 값을 실어 보낸 회원이 이미 있나" 를 셉니다
-- =========================================================================
-- ⛔ 읽기만 합니다. UPDATE / INSERT / DELETE / DROP / CREATE / ALTER 가
--    ★한 줄도 없습니다★. 몇 번을 돌리셔도 아무것도 바뀌지 않습니다.
--
-- 2026-08-28 / 수리팀
--
-- 짝이 되는 파일
--   supabase/fix-signup-insert-guard.sql  <- 앞으로 들어올 것을 막는 파일
--   이 파일은 ★이미 들어온 것이 있는지★ 만 봅니다.
--
-- 왜 보나
--   계급 자산 = 지갑 + 증거금 - recharge_total   (schema-rank-1000.sql)
--   recharge_total 은 ★빼는 칸★ 이라 음수가 들어가면 계급이 부풀어 오릅니다.
--   그런데 정상 경로에서는 이 값이 ★절대 줄지 않습니다★
--   (schema-daily-recharge.sql 주석: "이 누계는 절대 줄지 않습니다(음수 없음)").
--   그래서 ★음수면 정상 경로로 들어온 값이 아닙니다.★
--
-- 어떻게 돌리나
--   블록이 4개입니다 ([0] ~ [3]).
--   ★한 블록씩 드래그해서 Run★ 해 주세요. 한 번에 다 돌리면 마지막 표만 보입니다.
--   급하시면 [1] 하나만 보셔도 됩니다 - 전부 0 이면 아무 일도 없는 것입니다.
-- =========================================================================


-- =========================================================================
-- [0] 먼저 - 볼 칸이 서버에 있는지  (이걸 안 하면 뒤가 오류납니다)
-- =========================================================================
-- '있나' 가 전부 '있음' 이어야 [1] 부터 돌아갑니다.
-- 하나라도 '없음' 이면 그 칸을 만드는 파일을 아직 안 돌리신 것이고,
-- ★그 상태에서는 이 문제 자체가 없습니다★ (칸이 없으니 넣을 수도 없습니다).
select
  칸.칸이름                                                    as 봐야할_칸,
  case when exists (select 1 from information_schema.columns c
                     where c.table_schema = 'public'
                       and c.table_name   = 'trading_accounts'
                       and c.column_name  = 칸.칸이름)
       then '있음' else '없음 - 아래 블록을 건너뛰세요' end   as 있나,
  칸.만드는파일                                              as 이_파일이_만듭니다
from (values
  ('recharge_total',   'supabase/schema-daily-recharge.sql'),
  ('recharge_count',   'supabase/schema-daily-recharge.sql'),
  ('last_recharge_at', 'supabase/schema-daily-recharge.sql'),
  ('cycle_no',         'supabase/schema-trading-cycle.sql')
) as 칸(칸이름, 만드는파일);


-- =========================================================================
-- [1] ★핵심★ 요약 - 이 표 한 줄만 보시면 됩니다
-- =========================================================================
-- 숫자가 ★전부 0 이면 아무 일도 없습니다.★
-- 하나라도 0 이 아니면 [2] 로 내려가서 누구인지 보세요.
select
  count(*)                                                            as 전체회원수,
  count(*) filter (where coalesce(recharge_total, 0) < 0)             as "⚠ 충전누계가_음수",
  count(*) filter (where coalesce(recharge_count, 0) < 0)             as "⚠ 충전횟수가_음수",
  count(*) filter (where coalesce(recharge_count, 0) > 2)             as "⚠ 충전횟수가_한도초과",
  count(*) filter (where last_recharge_at > now())                    as "⚠ 충전시각이_미래",
  count(*) filter (where coalesce(cycle_no, 1) < 1)                   as "⚠ 사이클번호가_0이하",
  count(*) filter (where coalesce(initial_balance, 0) <> 100000)      as "참고 기준자본이_10만이_아님",
  count(*) filter (where coalesce(cycle_no, 1) > 1)                   as "참고 사이클이_2회차이상"
from public.trading_accounts;
-- '충전횟수가_한도초과' 의 2 는 schema-daily-recharge.sql 의
-- recharge_max_per_day() 와 같은 값입니다. 그 값을 바꾸시면 여기도 같이 고쳐 주세요.
--
-- '참고' 로 시작하는 두 칸은 ★문제가 아닐 수 있습니다★.
--   기준자본이 10만이 아님   -> 아주 초기에 가입한 분일 수 있습니다
--   사이클이 2회차 이상      -> 계좌 초기화를 하시면 정상적으로 늘어납니다


-- =========================================================================
-- [2] 누구인지 - 이상한 값이 있는 회원만 나옵니다
-- =========================================================================
-- 결과가 ★비어 있으면 정상★ 입니다.
select
  coalesce(p.nickname, '(닉네임 없음)')                  as 닉네임,
  round(coalesce(ta.balance, 0))                         as 지갑,
  round(coalesce(ta.initial_balance, 0))                 as 기준자본,
  round(coalesce(ta.recharge_total, 0))                  as 충전누계,
  coalesce(ta.recharge_count, 0)                         as 오늘충전횟수,
  ta.last_recharge_at                                    as 마지막충전시각,
  coalesce(ta.cycle_no, 1)                               as 사이클번호,
  -- 계급 자산에서 recharge_total 을 빼므로, 음수면 그만큼 자산이 ★부풀어 있습니다★.
  round(greatest(0, -coalesce(ta.recharge_total, 0)))    as "계급자산이_부풀어있는_금액",
  concat_ws(' / ',
    case when coalesce(ta.recharge_total, 0) < 0 then '충전누계 음수 (정상 경로로는 불가능)' end,
    case when coalesce(ta.recharge_count, 0) < 0 then '충전횟수 음수' end,
    case when coalesce(ta.recharge_count, 0) > 2 then '충전횟수 한도초과' end,
    case when ta.last_recharge_at > now()        then '충전시각이 미래' end,
    case when coalesce(ta.cycle_no, 1) < 1       then '사이클번호 0 이하' end
  )                                                      as 판정
from public.trading_accounts ta
left join public.profiles p on p.id = ta.user_id
where coalesce(ta.recharge_total, 0) < 0
   or coalesce(ta.recharge_count, 0) < 0
   or coalesce(ta.recharge_count, 0) > 2
   or ta.last_recharge_at > now()
   or coalesce(ta.cycle_no, 1) < 1
order by coalesce(ta.recharge_total, 0) asc;


-- =========================================================================
-- [3] 지금 방어가 걸려 있나 - fix-signup-insert-guard.sql 을 돌리셨는지
-- =========================================================================
-- '판정' 이 5번이면 앞으로는 안 들어옵니다.
select
  case when to_regprocedure('public.force_starting_balance()') is null
       then '없음' else '있음' end                                as 함수_있나,
  coalesce((select case t.tgenabled when 'O' then '켜짐'
                                    when 'D' then '⚠ 꺼짐'
                                    else t.tgenabled::text end
              from pg_trigger t
             where t.tgrelid = 'public.trading_accounts'::regclass
               and t.tgname  = 'trg_force_starting_balance'
               and not t.tgisinternal), '⚠ 안 달림')              as 트리거_상태,
  case
    when to_regprocedure('public.force_starting_balance()') is null
      then '1. ⚠ 함수가 없습니다 - supabase/schema-initial-balance.sql 부터 돌려 주세요'
    when not exists (select 1 from pg_trigger
                      where tgrelid = 'public.trading_accounts'::regclass
                        and tgname  = 'trg_force_starting_balance'
                        and not tgisinternal)
      then '2. ⚠ 트리거가 안 달렸습니다 - supabase/fix-signup-insert-guard.sql 을 돌려 주세요'
    when (select tgenabled from pg_trigger
           where tgrelid = 'public.trading_accounts'::regclass
             and tgname  = 'trg_force_starting_balance'
             and not tgisinternal) <> 'O'
      then '3. ⚠ 트리거가 꺼져 있습니다'
    when not exists (select 1 from pg_proc p
                      where p.oid = to_regprocedure('public.force_starting_balance()')
                        and p.prosrc like '%recharge_total%')
      then '4. ⚠ 아직 안 막혀 있습니다 - supabase/fix-signup-insert-guard.sql 을 돌려 주세요'
    else '5. ✅ 막혀 있습니다'
  end                                                             as 판정;
