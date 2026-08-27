-- =========================================================================
-- fix-trading-accounts-rls.sql
--   회원이 자기 지갑 줄을 마음대로 고칠 수 있던 구멍을 좁힙니다
-- =========================================================================
-- ⛔ 이 파일은 [0] 번이 ★읽기만★ 합니다. 먼저 [0] 만 돌려서 서버의
--    지금 상태를 눈으로 보신 뒤에 [1] 부터 진행해 주세요.
--    저장소 파일과 서버가 다를 수 있어서, 파일만 봐서는 확정이 안 됩니다.
--
-- 여러 번 돌려도 안전합니다 (idempotent).
--   · drop policy if exists + create policy
--   · create or replace function / drop trigger if exists + create trigger
--   · DELETE / TRUNCATE / DROP TABLE 이 하나도 없습니다
--   · 회원 데이터를 하나도 안 바꿉니다 (규칙만 바꿉니다)
--
-- =========================================================================
-- 무엇이 문제인가
-- =========================================================================
--   supabase/schema.sql:53-55
--     create policy "trading_accounts_update_own" on public.trading_accounts
--       for update using (auth.uid() = user_id);
--                                                   <- with check 가 없습니다
--
--   using       = "누구 줄을 고칠 수 있나"
--   with check  = "무엇으로 고칠 수 있나"
--
--   with check 가 없으면 고친 뒤의 값을 아무도 안 봅니다.
--   같은 파일의 다른 정책 6곳에는 with check 가 있는데 이 줄만 빠졌습니다.
--
-- =========================================================================
-- ⚠ 먼저 알아두실 것 — 이 파일로 "지갑 조작" 이 전부 막히지는 않습니다
-- =========================================================================
--   막고 싶은 마음은 굴뚝같지만, 지금 구조에서는 balance 를 회원이 못
--   쓰게 하면 ★거래가 아예 저장이 안 됩니다★.
--
--   지금 구조가 이렇습니다 —
--     거래 계산을 브라우저가 합니다 (js/trading.js)
--     그 결과 지갑 잔액을 브라우저가 서버에 씁니다 (js/supabase-sync.js:53)
--
--   즉 "정상적인 거래" 와 "손으로 고친 값" 이 ★똑같은 길★ 로 들어옵니다.
--   서버는 둘을 구분할 근거가 없습니다. balance 를 막으면 정상 거래도
--   같이 막힙니다.
--
--   그래서 이 파일은 ★확실히 회원 것이 아닌 칸★ 만 잠급니다.
--   balance 자체를 어떻게 할지는 계산 규칙에 관한 문제라
--   ★대표님 결정 사항★ 입니다. 아래 [4] 에 정리해 두었습니다.
--
-- =========================================================================
-- 무엇을 잠그고 무엇을 열어두나
-- =========================================================================
--   열어둠 (브라우저가 정상적으로 씁니다 — 막으면 거래가 안 저장됩니다)
--     balance          지갑 잔액        js/supabase-sync.js:53
--     realized_pnl     누적 실현손익    js/supabase-sync.js:56
--     updated_at       저장 시각        js/supabase-sync.js:57
--
--   잠금 (서버만 정하는 칸입니다. 브라우저는 원래 안 보냅니다)
--     user_id          남의 줄로 옮기기 방지
--     initial_balance  기준자본 — 부풀리면 수익률이 통째로 조작됩니다
--     recharge_total   무상으로 받은 돈 누계 — 지우면 계급이 부풀려집니다
--     recharge_count   오늘 충전 횟수 — 지우면 무한 충전이 됩니다
--     last_recharge_at 마지막 충전 시각 — 위와 같음
--     cycle_no         사이클 번호 — 바꾸면 지난 기록이 섞입니다
--     cycle_started_at 사이클 시작 시각
--
-- =========================================================================
-- 되돌리는 방법은 맨 아래 [되돌리기] 절에 있습니다.
-- =========================================================================


-- =========================================================================
-- [0] 서버의 지금 상태 보기  (읽기 전용 — 아무것도 바뀌지 않습니다)
-- =========================================================================
-- ★ 이 [0] 번만 먼저 돌려서 결과를 캡처해 주세요.
--   저장소 파일에 없는 것이 서버에 있을 수 있습니다.

-- (0-1) trading_accounts 의 지금 정책. with check 칸이 비어 있는지 봅니다.
--   'update' 줄의 '고친뒤_검사(with check)' 가 비어 있으면 구멍이 있는 것입니다.
select
  polname                                   as 정책이름,
  case polcmd when 'r' then 'select' when 'a' then 'insert'
              when 'w' then 'update' when 'd' then 'delete'
              else 'all' end                as 대상동작,
  pg_get_expr(polqual,  polrelid)           as "고칠수있는줄(using)",
  pg_get_expr(polwithcheck, polrelid)       as "고친뒤_검사(with check)"
from pg_policy
where polrelid = 'public.trading_accounts'::regclass
order by polcmd, polname;

-- (0-2) 지금 걸려 있는 트리거 목록.
select tgname as 트리거, tgenabled as 켜짐여부,
       pg_get_triggerdef(oid) as 정의
from pg_trigger
where tgrelid = 'public.trading_accounts'::regclass
  and not tgisinternal
order by tgname;

-- (0-3) ★중요★ check_trading_account_update() 의 실제 본문.
--   이 함수는 저장소 파일에 본문이 없습니다(이름만 언급돼 있습니다).
--   서버에만 있어서, 아래 결과를 봐야 무엇을 지키고 있는지 알 수 있습니다.
--   결과가 비어 있으면 그 함수는 서버에 없다는 뜻입니다.
select p.proname as 함수, pg_get_functiondef(p.oid) as 본문
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('check_trading_account_update', 'force_starting_balance');

-- (0-4) 어떤 함수가 '서버 권한(security definer)' 으로 도는지.
--   아래 [2] 번 트리거는 이 함수들의 정상 동작을 막지 않아야 합니다.
select p.proname as 함수, p.prosecdef as 서버권한으로도나
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('claim_daily_recharge', 'use_user_item', 'reset_season',
                    'start_new_cycle', 'purchase_tl_market_item')
order by p.proname;

-- (0-5) ★2026-08-27 추가★ 잠금 트리거가 실제로 도는 모드인지.
--   아무것도 바꾸지 않습니다. 아래 세 칸만 보시면 됩니다.
--
--   트리거함수_모드 가
--     '아직 없음'            → 이 파일을 아직 안 돌리셨습니다. 정상입니다.
--     '⚠ security definer'  → 잠금이 한 줄도 안 돌고 있습니다. 이 파일을 다시 Run 하세요.
--     '✅ security invoker'  → 제대로 걸려 있습니다.
--
--   지금_current_user 는 SQL 편집기에서 보면 postgres 로 나옵니다.
--   브라우저에서 오면 authenticated 로 나옵니다 — 그 차이로 갈라냅니다.
select
  current_user as 지금_current_user,
  session_user as 지금_session_user,
  case
    when to_regprocedure('public.lock_server_owned_account_fields()') is null
      then '아직 없음 - 이 파일을 아직 안 돌리셨습니다'
    when (select p.prosecdef from pg_proc p
           where p.oid = to_regprocedure('public.lock_server_owned_account_fields()'))
      then '⚠ security definer - 잠금이 한 줄도 안 돕니다. 이 파일을 다시 Run 하세요'
    else '✅ security invoker - 제대로 걸려 있습니다'
  end as 트리거함수_모드;


-- (0-6) 참고 — 지갑이 딱 떨어지는 숫자인 회원이 있는지.
--   조사팀 파일 supabase/조회-잔고출처-2026-08-27.sql 의 블록 7-3 과
--   겹치는 내용입니다. 그 파일을 이미 돌리셨으면 여기는 건너뛰셔도 됩니다.
select
  count(*)                                                as 회원수,
  count(*) filter (where balance = round(balance / 10000) * 10000
                     and balance > 0)                     as 만단위로_딱떨어짐
from public.trading_accounts;


-- =========================================================================
-- [1] 빠져 있던 with check 를 채웁니다
-- =========================================================================
-- 고친 뒤의 줄도 여전히 '자기 줄' 이어야 합니다.
-- 이것만으로도 "내 줄을 남의 것으로 바꿔치기" 가 막힙니다.
--
-- ⚠ 이것은 정상 거래를 하나도 막지 않습니다 —
--   js/supabase-sync.js 는 언제나 자기 user_id 로 씁니다.
drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
create policy "trading_accounts_update_own" on public.trading_accounts
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);


-- =========================================================================
-- [2] 서버만 정하는 칸을 브라우저가 못 바꾸게 합니다
-- =========================================================================
-- 왜 정책(with check)이 아니라 트리거인가
--   with check 는 "고친 뒤 값" 만 봅니다. "고치기 전 값과 같은지" 는
--   못 봅니다. 칸별로 "원래 값 그대로여야 한다" 를 보려면 트리거가 맞습니다.
--
-- 오류를 내지 않습니다.
--   브라우저가 엉뚱한 값을 보내면 ★조용히 원래 값으로 되돌려 놓고★
--   저장은 성공시킵니다. 오류를 내면 화면이 "저장 실패" 로 보고
--   무한히 다시 시도합니다(실제로 겪었던 문제입니다).
--
-- ★ 기존 트리거를 건드리지 않습니다.
--   check_trading_account_update() 가 무엇을 지키는지 서버를 봐야 알 수
--   있어서, 그것을 고치거나 지우지 않고 ★따로 하나 더★ 답니다.
--   둘 다 걸려 있어도 서로 방해하지 않습니다.
-- =========================================================================
-- ⚠ 2026-08-27 정정 — 이 함수에서 security definer 를 뺐습니다
-- =========================================================================
-- 처음에 security definer 로 만들었는데, 그러면 아래 잠금이 ★한 줄도
-- 안 돕니다★. 오류도 안 나고 [3] 확인 조회에도 '트리거 달림' 으로 나옵니다.
-- 전형적인 조용한 고장이었습니다. (감사팀 발견 / 본부장 확인)
--
-- 왜 안 됐나 —
--   PostgreSQL 은 security definer 함수 안에서 current_user 를
--   ★함수 주인★ 으로 바꿉니다. 이 함수 주인은 SQL 편집기에서 만들었으니
--   postgres 입니다. 그래서
--       if current_user not in ('authenticated','anon') then return new;
--   이 ★언제나 참★ 이 되어 곧바로 빠져나갔습니다.
--
-- 왜 security invoker 가 맞나 — 세 가지 길이 전부 우리가 원하는 대로 갈립니다.
--
--   ① 브라우저가 표를 직접 고칠 때 (js/supabase-sync.js)
--        PostgREST 는 authenticator 로 접속한 뒤 set role authenticated 를 합니다.
--        set role 은 current_user 를 바꿉니다 → current_user = 'authenticated'
--        → 잠금이 돕니다. ★이게 우리가 막으려던 길입니다★
--
--   ② 서버 함수 안에서 고칠 때 (use_user_item · claim_daily_recharge 등)
--        그 함수들이 security definer 라 그 안에서 current_user 는 주인(postgres)
--        입니다. 트리거가 invoker 면 그 값을 그대로 물려받습니다
--        → current_user = 'postgres' → 통과. ★무료 충전·아이템이 안 막힙니다★
--
--   ③ 대표님이 SQL 편집기에서 고칠 때
--        current_user = 'postgres' → 통과.
--
-- 왜 다른 것을 안 썼나 —
--   session_user  ✗ PostgREST 는 언제나 authenticator 로 접속하므로
--                   ①②③ 이 전부 'authenticator' 로 똑같이 나옵니다. 못 가릅니다.
--   auth.role()   ✗ JWT 의 role 을 읽습니다. ② 도 브라우저가 부른 것이라
--                   'authenticated' 로 나옵니다 → 무료 충전·아이템이 막힙니다.
--                   방금 고친 seed_recharge / account_reset 이 그 자리에서 깨집니다.
--   current_setting('request.jwt.claims') ✗ auth.role() 과 같은 이유.
--
-- ⚠ 이 함수는 표를 하나도 안 읽고 안 씁니다. NEW / OLD 만 만집니다.
--   그래서 security definer 가 없어도 권한 문제가 생기지 않습니다.
--   (definer 가 필요한 함수는 '남의 표를 대신 건드리는' 함수입니다)
--
-- ⚠ 실패해도 열리는 쪽입니다. 혹시 판정이 틀려도 지금보다 나빠지지 않습니다.
--   맞게 돌고 있는지는 [3] 의 마지막 조회로 확인하실 수 있습니다.
-- =========================================================================
create or replace function public.lock_server_owned_account_fields()
returns trigger
language plpgsql
-- security definer 를 ★일부러 안 씁니다★. 위 설명을 읽어 주세요.
set search_path = public
as $fn$
begin
  -- 서버 권한으로 도는 작업(security definer 함수, SQL 편집기, 관리자)은
  -- 그대로 통과시킵니다. 무료 충전·아이템 사용·시즌 초기화가 여기 해당합니다.
  --
  -- 브라우저에서 직접 오는 요청은 authenticated / anon 역할로 들어옵니다.
  -- 그 경우에만 아래에서 칸을 고정합니다.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  -- 여기부터는 '브라우저가 직접 보낸 저장' 입니다.
  -- 서버가 정하는 칸은 전부 원래 값으로 되돌립니다.
  new.user_id          := old.user_id;
  new.initial_balance  := old.initial_balance;
  new.recharge_total   := old.recharge_total;
  new.recharge_count   := old.recharge_count;
  new.last_recharge_at := old.last_recharge_at;
  new.cycle_no         := old.cycle_no;
  new.cycle_started_at := old.cycle_started_at;

  -- balance / realized_pnl / updated_at 은 일부러 손대지 않습니다.
  -- 브라우저가 거래 결과를 여기에 씁니다. 막으면 거래가 저장되지 않습니다.
  return new;
end;
$fn$;

-- security invoker 라 부르는 역할에게 실행 권한이 있어야 합니다.
-- (기본으로 PUBLIC 에 열려 있지만, 서버에서 회수해 둔 경우를 대비해 명시합니다)
grant execute on function public.lock_server_owned_account_fields() to authenticated, anon;

drop trigger if exists trg_lock_server_owned_account_fields on public.trading_accounts;
create trigger trg_lock_server_owned_account_fields
  before update on public.trading_accounts
  for each row
  execute function public.lock_server_owned_account_fields();


-- =========================================================================
-- [3] 확인 (읽기 전용)
-- =========================================================================
-- with check 가 채워졌는지.
select
  polname                             as 정책이름,
  pg_get_expr(polwithcheck, polrelid) as "고친뒤_검사(with check)",
  case when polwithcheck is null then '⚠ 아직 비어 있음' else '✅ 채워짐' end as 상태
from pg_policy
where polrelid = 'public.trading_accounts'::regclass
  and polcmd = 'w';

-- 트리거가 달렸는지. 최소 두 줄(기존 것 + 새 것)이 나와야 합니다.
select tgname as 트리거
from pg_trigger
where tgrelid = 'public.trading_accounts'::regclass
  and not tgisinternal
order by tgname;

-- ★2026-08-27 추가★ '달려 있다' 와 '실제로 돈다' 는 다릅니다.
--   security definer 로 달려 있으면 위 조회에는 멀쩡히 나오는데
--   안은 한 줄도 안 돕니다. 아래가 그것까지 봅니다.
--   ✅ 가 나와야 끝난 것입니다.
select
  case
    when to_regprocedure('public.lock_server_owned_account_fields()') is null
      then '⚠ 함수가 없습니다 - [2] 가 안 돌았습니다'
    when (select p.prosecdef from pg_proc p
           where p.oid = to_regprocedure('public.lock_server_owned_account_fields()'))
      then '⚠ security definer - 잠금이 안 돕니다. 이 파일을 다시 Run 하세요'
    else '✅ security invoker - 잠금이 실제로 돕니다'
  end as 잠금_상태,
  (select count(*) from pg_trigger
    where tgrelid = 'public.trading_accounts'::regclass
      and tgname = 'trg_lock_server_owned_account_fields'
      and not tgisinternal) as 트리거_달린수;


-- =========================================================================
-- [4] ⚠ 남아 있는 문제 — 대표님 결정이 필요합니다
-- =========================================================================
-- 이 파일로도 ★지갑 잔액(balance) 자체를 아무 값으로 쓰는 것★ 은
-- 못 막습니다. 위에서 설명드린 대로, 정상 거래와 같은 길로 들어오기
-- 때문입니다.
--
-- 정말 막으려면 셋 중 하나를 골라야 하고, 셋 다 큰 결정입니다.
--
--   (가) 거래 계산을 서버로 옮긴다
--        가장 확실합니다. 대신 주문 체결·청산을 전부 서버에서 다시
--        만들어야 합니다. 큰 공사입니다.
--
--   (나) 서버가 지갑을 다시 계산해서 대조한다
--        기준자본 + 거래손익 + 펀딩비 로 계산한 값과 크게 다르면 막습니다.
--        ★이건 손익 계산 규칙을 새로 정하는 일이라 대표님 결재 사항입니다.★
--        (지금은 펀딩비가 지갑에만 반영돼 있어 대조가 정확히 안 맞습니다)
--
--   (다) 지금처럼 두고, 이상한 값이 생기면 찾아내는 쪽에 힘을 쏟는다
--        베타이고 회원이 소수라 당장은 이 선택도 합리적입니다.
--        위 [0-5] 같은 조회로 주기적으로 확인합니다.
--
-- 팀이 임의로 고르지 않았습니다. 정해 주시면 그대로 만들겠습니다.


-- =========================================================================
-- [되돌리기]
-- =========================================================================
-- 아래를 Run 하시면 이 파일 이전 상태로 정확히 돌아갑니다.
-- (앞의 -- 를 지우고 실행하세요. 회원 데이터를 지우지 않습니다.)
--
-- (1) 새로 단 트리거를 뗍니다
--   drop trigger if exists trg_lock_server_owned_account_fields
--     on public.trading_accounts;
--
-- (2) 정책을 옛 모양(with check 없음)으로 되돌립니다
--   drop policy if exists "trading_accounts_update_own" on public.trading_accounts;
--   create policy "trading_accounts_update_own" on public.trading_accounts
--     for update using (auth.uid() = user_id);
--
-- (3) 함수까지 지우시려면 (보통은 필요 없습니다)
--   drop function if exists public.lock_server_owned_account_fields();
--
-- ⚠ 되돌리면 회원이 자기 기준자본·충전 횟수를 다시 고칠 수 있게 됩니다.
-- =========================================================================
