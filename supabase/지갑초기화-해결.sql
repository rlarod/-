-- =========================================================================
-- 지갑이 새로고침마다 1.5억으로 돌아가던 문제 — 원인과 해결
-- =========================================================================
-- 증상
--   새로고침할 때마다 지갑이 시작값으로 되돌아감.
--   서버 조회: 잔고 100000 / 실현손익 -1,827,783
--   손실이 182만인데 잔고가 시작값 그대로 — 앞뒤가 안 맞습니다.
--
-- 원인
--   trg_force_starting_balance 트리거가 범인입니다.
--   이 트리거는 '새 계정을 만들 때 시작 자산을 10만으로 맞추는' 용도로
--   BEFORE INSERT 에 걸려 있습니다.
--
--     new.initial_balance := 100000;
--     new.balance         := 100000;
--
--   그런데 앱은 잔고를 저장할 때 upsert 를 씁니다.
--   upsert 는 INSERT ... ON CONFLICT DO UPDATE 이고,
--   PostgreSQL 은 충돌을 확인하기 '전에' BEFORE INSERT 트리거를 먼저
--   실행합니다. 그래서 갱신하려던 잔고가 트리거에 의해 10만으로
--   바뀐 뒤 그 값이 저장됩니다.
--
--   실현손익은 트리거가 손대지 않아서 정상적으로 갱신됐습니다.
--   그래서 '손익은 쌓이는데 잔고만 안 변하는' 이상한 상태가 됐습니다.
--
-- 해결
--   트리거가 '진짜 새 계정' 일 때만 시작값을 강제하도록 고칩니다.
--   이미 그 사용자의 계정이 있으면 손대지 않습니다.
--   신규 가입자는 여전히 10만으로 시작합니다(원래 의도 유지).
--
-- 테이블·데이터는 건드리지 않습니다. 함수 하나만 바꿉니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 트리거 함수 수정 ----------------
create or replace function public.force_starting_balance()
returns trigger
language plpgsql
as $$
begin
  -- 이미 이 사용자의 계정이 있으면(= upsert 로 갱신하는 중이면)
  -- 잔고를 건드리지 않습니다. 안 그러면 매번 시작값으로 되돌아갑니다.
  if exists (select 1 from public.trading_accounts t where t.user_id = new.user_id) then
    return new;
  end if;

  -- 진짜 새 계정일 때만 시작값을 강제합니다(원래 의도).
  new.initial_balance := public.starting_balance();
  new.balance         := public.starting_balance();
  return new;
end;
$$;

drop trigger if exists trg_force_starting_balance on public.trading_accounts;
create trigger trg_force_starting_balance
  before insert on public.trading_accounts
  for each row execute function public.force_starting_balance();


-- ---------------- 2) 확인 ----------------
-- 트리거가 붙어 있어야 합니다.
select
  tgname          as 트리거,
  tgenabled::text as 상태
from pg_trigger
where tgrelid = 'public.trading_accounts'::regclass
  and not tgisinternal;


-- ---------------- 3) 현재 값 ----------------
-- 이 SQL 을 돌린 뒤 사이트에서 거래하면 잔고가 실제로 바뀌어야 합니다.
select
  p.nickname          as 닉네임,
  ta.balance          as 잔고,
  ta.initial_balance  as 시작자산,
  ta.realized_pnl     as 실현손익,
  ta.updated_at       as 마지막갱신
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
order by ta.updated_at desc;


-- =========================================================================
-- 실행 후 확인 방법
-- =========================================================================
--   1) 사이트에서 Ctrl+Shift+R 로 새로고침
--   2) 거래 한 번 (진입 -> 청산)
--   3) 위 3번만 다시 실행
--   4) 잔고가 100000 이 아닌 값으로 바뀌어 있으면 해결된 것입니다
--   5) 다시 새로고침해도 그 잔고가 유지되어야 합니다
--
-- 참고: 지금 쌓인 실현손익(-182만)과 잔고가 안 맞습니다.
-- 그동안 잔고가 저장되지 않은 탓입니다. 정확한 값으로 맞추고 싶으면
-- 관리자 화면의 '무료 충전' 으로 잔고를 다시 잡거나, 시즌 초기화로
-- 모두 같은 조건에서 다시 시작하는 방법이 있습니다.
-- =========================================================================
