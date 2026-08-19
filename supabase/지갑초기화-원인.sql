-- =========================================================================
-- 지갑이 새로고침마다 초기화되는 원인 찾기 (조회만 합니다)
-- =========================================================================
-- 증상
--   새로고침할 때마다 지갑이 1.5억으로 돌아감
--   TL 도 같이 늘어남(거래 기록은 남아 있는데 잔고만 초기값)
--
-- 앞선 조회에서 나온 단서
--   서버 trading_accounts.balance = 100000 (시작값 그대로)
--   그런데 realized_pnl = -176,162
--   -> 손실이 났는데 잔고가 안 줄었습니다.
--      즉 잔고가 서버에 저장되지 않고 있습니다.
--
-- 저장을 막는 범인 후보
--   1) trading_accounts 에 걸린 방어 트리거
--   2) RLS 정책이 UPDATE 를 막음
--   3) 컬럼이 없어서 upsert 실패
--
-- 아무것도 바꾸지 않습니다.
-- =========================================================================


-- ---------------- 1) 방어 트리거가 있는가 ----------------
-- check_trading_account_update 같은 트리거가 잔고 변경을 막을 수 있습니다.
select
  tgname                                   as 트리거이름,
  tgenabled::text                           as 상태,
  pg_get_triggerdef(oid)                    as 정의
from pg_trigger
where tgrelid = 'public.trading_accounts'::regclass
  and not tgisinternal;


-- ---------------- 2) 트리거 함수 내용 ----------------
-- 위에서 트리거가 나왔다면, 그 함수가 무엇을 막는지 봅니다.
select
  p.proname                                as 함수명,
  pg_get_functiondef(p.oid)                as 정의
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like '%trading_account%';


-- ---------------- 3) 쓰기 권한이 있는가 ----------------
select
  policyname                               as 정책,
  cmd                                      as 종류,
  coalesce(qual, '(없음)')                  as 조건,
  coalesce(with_check, '(없음)')            as 허용조건
from pg_policies
where schemaname = 'public'
  and tablename  = 'trading_accounts'
order by cmd;


-- ---------------- 4) 컬럼이 다 있는가 ----------------
select
  needed.col                                as 필요한컬럼,
  case when c.column_name is null then '❌ 없음' else '✅ 있음' end as 상태
from (values ('user_id'), ('balance'), ('initial_balance'),
             ('realized_pnl'), ('updated_at')) as needed(col)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name   = 'trading_accounts'
 and c.column_name  = needed.col
order by (c.column_name is null) desc;


-- ---------------- 5) 실제 값 ----------------
select
  p.nickname          as 닉네임,
  ta.balance          as 잔고,
  ta.initial_balance  as 시작자산,
  ta.realized_pnl     as 실현손익,
  ta.updated_at       as 마지막갱신,
  case when ta.balance = ta.initial_balance and ta.realized_pnl <> 0
       then '❌ 손익은 있는데 잔고가 시작값 그대로 — 저장 안 됨'
       else '정상 범위' end as 판정
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id;
