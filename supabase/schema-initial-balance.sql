-- =========================================================================
-- 초기자산을 100,000 USDT(1.5억원)로 통일
-- =========================================================================
-- 왜 필요한가
--   지금 초기자산이 세 군데에서 어긋나 있습니다.
--     js/auth.js, DB 기본값        -> 10,000 USDT (1,500만원)  <- 실제 지급액
--     js/trading.js, rank.js,
--     user-panel.js (수익률 분모)  -> 100,000 USDT (1.5억원)
--     무료 충전액                   -> 100,000 USDT (1.5억원)
--   그래서 신규 회원은 1,500만원을 받고 수익률은 1.5억 기준으로 나뉘어,
--   수익률이 실제의 1/10로 표시됩니다.
--
-- 어떻게 고치나
--   js/auth.js 는 수정 금지 파일이라 손대지 않습니다.
--   대신 DB 쪽에서 INSERT 를 가로채 100,000 으로 맞춥니다.
--   auth.js 가 10,000 을 보내도 서버가 100,000 으로 바꿔 저장합니다.
--
-- 이 파일은 행을 하나도 지우지 않습니다.
--   DROP TABLE / TRUNCATE / DELETE 없음. UPDATE 는 금액 보정용 1건뿐입니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================

-- ---------------- 기준값 한 곳에서 관리 ----------------
-- 나중에 금액을 바꿀 일이 생기면 이 함수 하나만 고치면 전부 따라옵니다.
create or replace function public.starting_balance()
returns numeric
language sql
immutable
as $$
  select 100000::numeric;
$$;


-- ---------------- 1) 컬럼 기본값 ----------------
alter table public.trading_accounts alter column balance         set default 100000;
alter table public.trading_accounts alter column initial_balance set default 100000;


-- ---------------- 2) 신규 계정 생성 시 강제 ----------------
-- auth.js 가 보내는 10,000 을 서버에서 100,000 으로 덮습니다.
create or replace function public.force_starting_balance()
returns trigger
language plpgsql
as $$
begin
  new.initial_balance := public.starting_balance();
  new.balance         := public.starting_balance();
  return new;
end;
$$;

drop trigger if exists trg_force_starting_balance on public.trading_accounts;
create trigger trg_force_starting_balance
  before insert on public.trading_accounts
  for each row execute function public.force_starting_balance();


-- ---------------- 3) 기존 회원 보정 ----------------
-- 이미 1,500만원으로 시작한 회원들을 1.5억 기준으로 올립니다.
-- 차액(100,000 - 기존 initial_balance)을 잔고에도 똑같이 더하므로
-- 이미 낸 손익(balance - initial_balance)은 그대로 보존됩니다.
--   예) 잔고 12,000 / 초기 10,000 (= +2,000 수익)
--       -> 잔고 102,000 / 초기 100,000 (= +2,000 수익, 그대로)
update public.trading_accounts
   set balance         = balance + (public.starting_balance() - initial_balance),
       initial_balance = public.starting_balance(),
       updated_at      = now()
 where initial_balance is distinct from public.starting_balance();


-- ---------------- 4) 관리자 시즌 초기화도 같은 금액으로 ----------------
-- schema-admin-patch.sql 의 reset_season() 이 10,000 으로 되돌리게 되어 있어
-- 그대로 두면 "전체 초기화" 한 번에 모두가 1,500만원으로 떨어집니다.
-- 나머지 동작은 원본과 동일하고 금액만 starting_balance() 로 바꿉니다.
create or replace function public.reset_season()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 서버 측 권한 검증 — 이 체크를 통과 못하면 아무 것도 안 바뀝니다.
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'permission denied: admin only';
  end if;

  -- Supabase 는 pg-safeupdate 를 켜둬서 WHERE 없는 UPDATE/DELETE 가
  -- SECURITY DEFINER 안에서도 막힙니다. 항상 참인 WHERE 를 붙입니다.

  -- 1) trading_accounts — 값만 초기화(행 자체는 삭제 안 함)
  update public.trading_accounts
  set balance = public.starting_balance(),
      initial_balance = public.starting_balance(),
      realized_pnl = 0,
      updated_at = now()
  where user_id is not null;

  -- 2~4) 포지션/주문/체결 정리
  delete from public.positions where user_id is not null;
  delete from public.orders    where user_id is not null;
  delete from public.trades    where user_id is not null;

  -- 5) leaderboard 뷰는 trading_accounts 를 그대로 계산하므로 자동 반영됩니다.
  -- profiles / chat_messages 는 건드리지 않습니다(닉네임·채팅 보존).

  -- 6) season_version 증가 — 접속 중인 브라우저가 자기 localStorage 를 비웁니다.
  update public.app_meta
  set value = (value::int + 1)::text, updated_at = now()
  where key = 'season_version';
end;
$$;

grant execute on function public.reset_season to authenticated;


-- ---------------- 5) 확인 ----------------
select count(*) as 전체계정,
       count(*) filter (where initial_balance = 100000) as 초기자산_10만USDT,
       count(*) filter (where initial_balance <> 100000) as 안맞는계정
from public.trading_accounts;
