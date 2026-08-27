-- =========================================================================
-- fix-signup-insert-guard.sql
--   "가입하는 순간" 에 계급 회계 칸을 서버가 고정합니다
-- =========================================================================
-- 2026-08-28 / 수리팀
--
-- 여러 번 돌려도 안전합니다 (idempotent).
--   · create or replace function 만 씁니다
--   · 트리거는 ★없을 때만★ 답니다 (있으면 그대로 둡니다 — 중복으로 안 답니다)
--   · DELETE / TRUNCATE / DROP TABLE 이 한 줄도 없습니다
--   · 회원 데이터를 ★한 줄도 안 바꿉니다★. 앞으로 들어올 것만 막습니다
--
-- =========================================================================
-- 무엇이 문제인가
-- =========================================================================
--   지갑 줄을 ★고칠 때★ 는 자물쇠가 걸려 있습니다
--     supabase/fix-trading-accounts-rls.sql 의
--     lock_server_owned_account_fields()  <- BEFORE UPDATE 입니다
--
--   그런데 지갑 줄을 ★처음 만들 때★ 는 아무 검사가 없습니다.
--     js/auth.js:317   가입하면 브라우저가 trading_accounts 줄을 직접 만듭니다
--     supabase/schema.sql:50  서버 규칙은 "본인 것이 맞나(auth.uid() = user_id)"
--                             만 봅니다. ★무슨 값을 넣는지는 안 봅니다★
--
--   저장소가 공개(Public)라 접속 키가 노출돼 있고, 요청 한 줄만 고치면
--   가입할 때 아무 칸이나 같이 실어 보낼 수 있습니다.
--
--   계급 자산 식이 이렇습니다 (supabase/schema-rank-1000.sql:255-268)
--
--     계급 자산 = 지갑 + 포지션증거금 + 미체결증거금 - recharge_total
--
--   recharge_total 은 ★빼는 칸★ 입니다. 여기에 음수를 실으면 자산이 늘어납니다.
--
--     recharge_total 에 -1,000,000 을 실어 가입하면
--       계급 자산   100,000  ->  1,100,000
--       계급 점수   0점      ->  약 3,459점
--     거래를 한 번도 안 하고 계급이 올라갑니다.
--
--   recharge_count / last_recharge_at 을 실으면 무료 충전 하루 한도가 흔들리고,
--   cycle_no 를 실으면 랭킹이 보는 '이번 사이클' 이 어긋납니다
--   (supabase/schema-leaderboard-floor.sql 의 ranking_profit 이
--    trades.cycle_no = trading_accounts.cycle_no 로 거릅니다).
--
-- =========================================================================
-- 어떻게 막나
-- =========================================================================
--   ★새 트리거를 달지 않습니다.★
--   이미 BEFORE INSERT 로 걸려 있는 force_starting_balance() 의
--   ★본문만 늘립니다.★
--   (원래 정의가 두 곳에 있습니다 — schema-initial-balance.sql:41 과
--    지갑초기화-해결.sql:37. ★두 쪽 내용을 다 담아서★ 늘렸습니다.
--    어느 쪽을 마지막에 돌리셨든 이 파일을 돌리면 둘 다 살아 있습니다)
--
--   ⚠ 이 파일 하나만으로는 절반입니다.
--     ★supabase/fix-trading-accounts-rls.sql (3-3) 을 먼저 돌리셔야 완성됩니다.★
--     가입(INSERT)은 이 파일이 막고, 그 뒤의 저장(UPDATE / upsert 갱신)은
--     그 파일의 lock_server_owned_account_fields() 가 막습니다.
--     한쪽만 걸면 다른 길로 그대로 들어옵니다.
--
--   ⚠ 잠금함수(lock_server_owned_account_fields)를 INSERT 에 다는 방식은
--     쓸 수 없습니다. 그 함수는 OLD 를 읽는데 INSERT 에는 OLD 가 없어서
--     SQLSTATE 55000 (record "old" is not assigned yet) 로 터집니다.
--     가입 자체가 안 되는 사고가 납니다.
--
--   지금 덮는 것   initial_balance · balance
--   여기서 더 덮음 recharge_total · recharge_count · last_recharge_at · cycle_no
--
--   전부 '새 계정의 기본값' 으로 고정합니다. 값을 검사해서 튕기는 게 아니라
--   ★조용히 기본값으로 덮고 저장은 성공시킵니다.★
--   오류를 내면 화면이 "저장 실패" 로 보고 무한히 다시 시도합니다
--   (실제로 겪었던 문제입니다).
--
--   정상 가입은 하나도 안 막힙니다 - js/auth.js:317 도
--   js/supabase-sync.js:50 의 upsert 도 이 네 칸을 원래 안 보냅니다.
--   서버 기본값과 똑같은 값으로 덮으므로 결과가 같습니다.
--
-- =========================================================================
-- 되돌리는 방법은 맨 아래 [되돌리기] 절에 있습니다.
-- 누가 이미 넣었는지 세는 조회는 supabase/check-signup-insert-abuse.sql 입니다
-- (읽기 전용).
-- =========================================================================


-- =========================================================================
-- [0] 순서 확인 - 잘못된 순서면 여기서 ⚠ 를 띄우고 멈춥니다
-- =========================================================================
-- 왜 필요한가
--   막을 칸(recharge_total 등)이 서버에 아직 없는데 함수부터 바꾸면,
--   함수 만들기는 ★성공★ 하고 그 뒤 ★가입할 때마다★ 터집니다.
--   (plpgsql 은 new.어쩌고 를 실행할 때 확인합니다)
--   그러면 아무도 가입을 못 하는데 원인은 안 보입니다. 그래서 먼저 봅니다.
--
--   아무것도 안 바뀝니다. 통과하면 조용히 지나갑니다.
do $$
declare
  없는칸 text := '';
begin
  if to_regclass('public.trading_accounts') is null then
    raise exception '⚠ 멈춤 - trading_accounts 표가 없습니다. supabase/schema.sql 부터 돌려 주세요.';
  end if;

  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'trading_accounts'
                    and column_name = 'recharge_total') then
    없는칸 := 없는칸 || 'recharge_total ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'trading_accounts'
                    and column_name = 'recharge_count') then
    없는칸 := 없는칸 || 'recharge_count ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'trading_accounts'
                    and column_name = 'last_recharge_at') then
    없는칸 := 없는칸 || 'last_recharge_at ';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'trading_accounts'
                    and column_name = 'cycle_no') then
    없는칸 := 없는칸 || 'cycle_no ';
  end if;

  if 없는칸 <> '' then
    raise exception '⚠ 멈춤 - 서버에 없는 칸이 있습니다: %. 먼저 supabase/schema-daily-recharge.sql 과 supabase/schema-trading-cycle.sql 을 돌린 뒤에 이 파일을 다시 Run 해 주세요. (지금 이 파일은 아무것도 안 바꿨습니다)', 없는칸;
  end if;

  if to_regprocedure('public.starting_balance()') is null then
    raise exception '⚠ 멈춤 - starting_balance() 가 없습니다. 먼저 supabase/schema-initial-balance.sql 을 돌려 주세요. (지금 이 파일은 아무것도 안 바꿨습니다)';
  end if;

  raise notice '[0] 확인 통과 - 필요한 칸과 함수가 전부 있습니다.';
end $$;


-- =========================================================================
-- [1] force_starting_balance() 본문을 늘립니다
-- =========================================================================
-- ★ 이 함수의 정본은 이제 이 파일입니다.
--   같은 이름의 함수가 저장소에 ★세 벌★ 있습니다. 나중에 돌린 것이 이깁니다.
--     supabase/schema-initial-balance.sql:41   옛 정의 (2줄짜리)
--     supabase/지갑초기화-해결.sql:37          새로고침 되돌림을 고친 정의
--     supabase/fix-signup-insert-guard.sql     ← 이 파일. 위 둘을 합치고 늘린 것
--   저 둘 중 하나를 나중에 Run 하면 아래 방어가 ★조용히 사라집니다★.
--   그때는 이 파일을 뒤이어 다시 Run 해 주세요.
--   ([3] 의 판정이 '4. ⚠ 옛 본문입니다' 로 나오면 그런 상태입니다)
--
-- ⚠⚠ 맨 앞의 '이미 있으면 그냥 통과' 는 ★절대 빼면 안 됩니다★.
--   supabase/지갑초기화-해결.sql 이 고친 실제 사고입니다 —
--   js/supabase-sync.js:50 이 잔고를 upsert 로 저장하는데,
--   upsert 는 INSERT ... ON CONFLICT 라서 PostgreSQL 이 충돌을 보기 ★전에★
--   BEFORE INSERT 트리거를 먼저 돌립니다. 그래서 이 줄이 없으면
--   ★새로고침할 때마다 지갑이 100,000 으로 되돌아갑니다.★
--   (증상: 실현손익은 -1,827,783 인데 잔고는 100,000 그대로)
--
--   이 줄이 있어도 가입 방어는 그대로입니다 —
--   진짜 가입은 줄이 아직 없으니 아래로 내려갑니다.
--   ★반대로 upsert 로 들어오는 갱신은 BEFORE UPDATE 잠금이 막습니다★
--   (supabase/fix-trading-accounts-rls.sql 의
--    lock_server_owned_account_fields — 그래서 3-3 을 먼저 돌리셔야 합니다).
--
-- security definer 를 쓰지 않습니다 (지금까지와 같습니다).
--   표를 읽는 곳은 위 exists 한 줄뿐이고, 그것도 ★자기 줄★ 을 봅니다.
--   RLS 규칙 trading_accounts_select_own 이 자기 줄은 열어 주므로
--   invoker 로도 그대로 돕니다. 지금 서버에서 이미 그렇게 돌고 있습니다
--   (supabase/지갑초기화-해결.sql 도 definer 없이 같은 exists 를 씁니다).
--
--   BEFORE INSERT 트리거는 누가 넣든 무조건 돌아야 하므로
--   current_user 로 갈라내지 않습니다 - 서버 함수든 SQL 편집기든
--   ★새 계정은 언제나 깨끗한 기본값으로 시작★ 하는 것이 맞습니다.
create or replace function public.force_starting_balance()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- (기존) 2026-08-21 지갑초기화-해결.sql — ★이 4줄을 빼면 안 됩니다★
  --   이미 이 사람의 줄이 있으면 = upsert 로 '갱신' 하는 중입니다.
  --   여기서 손대면 새로고침마다 지갑이 시작값으로 되돌아갑니다.
  --   진짜 가입은 줄이 없으므로 이 if 를 그냥 지나갑니다.
  if exists (select 1 from public.trading_accounts t where t.user_id = new.user_id) then
    return new;
  end if;

  -- (기존) 2026-08-20 schema-initial-balance.sql
  --   js/auth.js 가 보내는 10,000 을 서버 기준값(100,000)으로 덮습니다.
  new.initial_balance := public.starting_balance();
  new.balance         := public.starting_balance();

  -- (추가) 2026-08-28 - 가입 요청에 실려 들어올 수 있는 서버 전용 칸들.
  --   전부 '새 계정 기본값' 으로 고정합니다.
  --   ★여기 값을 바꾸면 새 계정의 출발 상태가 바뀝니다. 함부로 고치지 마세요.★
  new.recharge_total   := 0;      -- 계급에서 빼는 무상충전 누계. 음수면 계급이 부풀어 오릅니다
  new.recharge_count   := 0;      -- 오늘 충전 횟수. 마이너스면 무한 충전이 됩니다
  new.last_recharge_at := null;   -- 마지막 충전 시각. 위와 같은 이유
  new.cycle_no         := 1;      -- 사이클 번호. 어긋나면 랭킹이 거래를 못 셉니다

  -- realized_pnl / updated_at 은 일부러 손대지 않습니다.
  --   이번 배정 범위 밖입니다. (아래 [4] '남은 구멍' 참조)
  return new;
end;
$fn$;


-- =========================================================================
-- [2] 트리거가 달려 있는지 - ★없을 때만★ 답니다
-- =========================================================================
-- 이미 trg_force_starting_balance 가 달려 있습니다(schema-initial-balance.sql).
-- 그래서 여기서는 ★새로 만들지 않고★, 없을 때만 채워 넣습니다.
-- 중복으로 달면 같은 함수가 두 번 돌아 원인을 찾기 어려워집니다.
do $$
declare
  t record;
begin
  select tg.tgname, tg.tgenabled, tg.tgtype into t
  from pg_trigger tg
  where tg.tgrelid = 'public.trading_accounts'::regclass
    and tg.tgname  = 'trg_force_starting_balance'
    and not tg.tgisinternal;

  if not found then
    execute 'create trigger trg_force_starting_balance'
         || ' before insert on public.trading_accounts'
         || ' for each row execute function public.force_starting_balance()';
    raise notice '[2] 트리거가 없어서 새로 달았습니다.';
  else
    raise notice '[2] 트리거가 이미 달려 있습니다 - 그대로 둡니다. (본문만 바뀌었습니다)';
    if t.tgenabled <> 'O' then
      raise warning '[2] 트리거가 꺼져 있습니다(%). 아래 [3] 표를 캡처해 주세요.', t.tgenabled;
    end if;
    if (t.tgtype::int & 2) = 0 or (t.tgtype::int & 4) = 0 then
      raise warning '[2] 트리거가 BEFORE INSERT 가 아닙니다. 아래 [3] 표를 캡처해 주세요.';
    end if;
  end if;
end $$;


-- =========================================================================
-- [3] 확인 - 이 표 하나만 보시면 됩니다
-- =========================================================================
-- 맨 오른쪽 '판정' 칸이 5번 ✅ 면 끝입니다.
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
  (select count(*) from pg_proc p
    where p.oid = to_regprocedure('public.force_starting_balance()')
      and p.prosrc like '%recharge_total%')                       as 새본문_반영됨_1이면OK,
  case
    when to_regprocedure('public.force_starting_balance()') is null
      then '1. ⚠ 함수가 없습니다 - 이 파일을 다시 Run 해 주세요'
    when not exists (select 1 from pg_trigger
                      where tgrelid = 'public.trading_accounts'::regclass
                        and tgname  = 'trg_force_starting_balance'
                        and not tgisinternal)
      then '2. ⚠ 트리거가 안 달렸습니다 - 이 파일을 다시 Run 해 주세요'
    when (select tgenabled from pg_trigger
           where tgrelid = 'public.trading_accounts'::regclass
             and tgname  = 'trg_force_starting_balance'
             and not tgisinternal) <> 'O'
      then '3. ⚠ 트리거가 꺼져 있습니다'
    when not exists (select 1 from pg_proc p
                      where p.oid = to_regprocedure('public.force_starting_balance()')
                        and p.prosrc like '%recharge_total%')
      then '4. ⚠ 옛 본문입니다 - schema-initial-balance.sql 이나 지갑초기화-해결.sql 을 나중에 돌리셨습니다. 이 파일을 다시 Run 해 주세요'
    else '5. ✅ 가입할 때 계급 회계 칸이 고정됩니다'
  end                                                             as 판정;


-- =========================================================================
-- [4] 남은 구멍 - 솔직하게 적어 둡니다 (이 파일이 안 막는 것)
-- =========================================================================
--   (가) realized_pnl
--        가입 요청에 realized_pnl 을 실으면 그대로 들어갑니다.
--        랭킹 순위는 안 바뀝니다 - 랭킹은 trades 를 훑어서 따로 셉니다
--        (schema-leaderboard-floor.sql 의 ranking_profit).
--        마이페이지 '누적 손익' 숫자만 거짓으로 보입니다.
--        ★이번 배정 범위 밖이라 일부러 안 건드렸습니다.★
--
--   (나) cycle_started_at
--        서버가 정하는 칸인데 BEFORE UPDATE 잠금에는 들어 있고
--        여기에는 안 들어 있습니다. 기록용 시각이라 계급·랭킹에는 영향이
--        없습니다. ★이번 배정 범위 밖입니다.★
--
--   (다) balance 자체
--        브라우저가 거래 결과를 직접 쓰는 구조라 여기서는 못 막습니다.
--        (가입 순간만은 이 파일이 100,000 으로 덮습니다)
--        fix-trading-accounts-rls.sql 의 [4] 에 세 가지 길이 정리돼 있고
--        ★대표님 결정 사항★ 입니다.
--
--   위 세 가지는 "고칠까요?" 를 여쭤보는 항목입니다. 임의로 안 했습니다.


-- =========================================================================
-- [되돌리기]  <- 원래대로 돌리고 싶으실 때만
-- =========================================================================
-- 아래 블록의 맨 앞 '-- ' 를 지우고 통째로 Run 하시면
-- 2026-08-28 직전 상태(supabase/지갑초기화-해결.sql 의 내용)로 돌아갑니다.
--
-- ⚠ 2줄짜리 옛날 것(schema-initial-balance.sql)으로는 되돌리지 마세요.
--   그건 ★새로고침마다 지갑이 100,000 으로 되돌아가던★ 버전입니다.
--   아래 것이 그 사고를 고친 버전이고, 이번에 늘리기 전의 상태입니다.
--
-- 트리거는 그대로 둡니다 - 원래도 달려 있던 것이라 뗄 필요가 없습니다.
-- 회원 데이터는 되돌리기에서도 하나도 안 바뀝니다.
--
-- create or replace function public.force_starting_balance()
-- returns trigger
-- language plpgsql
-- as $fn$
-- begin
--   if exists (select 1 from public.trading_accounts t where t.user_id = new.user_id) then
--     return new;
--   end if;
--   new.initial_balance := public.starting_balance();
--   new.balance         := public.starting_balance();
--   return new;
-- end;
-- $fn$;
--
-- 되돌린 뒤 위 [3] 을 다시 Run 하면 '4. ⚠ 옛 본문입니다' 로 나옵니다.
-- 그게 되돌아갔다는 뜻입니다.
