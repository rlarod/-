-- =========================================================================
-- 시즌 초기화 수정 — TL 잔액이 음수가 되는 것을 막습니다
-- =========================================================================
-- 무엇이 문제인가
--   reset_season() 은 거래 데이터(trades/positions/orders)를 지우고
--   잔고를 되돌리지만, TL 관련 데이터는 하나도 건드리지 않습니다.
--
--   TL 잔액 = tl_earned(거래 기반 계산) + tl_transactions 합계
--   거래가 지워지면 tl_earned 가 0이 되는데, 사용 기록(음수)은 남습니다.
--
--     초기화 전: 획득 10,000 - 사용 5,300 = 잔액  4,700
--     초기화 후: 획득      0 - 사용 5,300 = 잔액 -5,300   <- 음수
--
--   모든 회원의 TL 이 마이너스가 되어 아무것도 살 수 없게 됩니다.
--   구매 판정이 'bal < total' 이라 영원히 통과하지 못합니다.
--
-- 어떻게 고치나
--   시즌 초기화 때 TL 사용 기록도 함께 정리합니다.
--   다만 이미 받은 물건까지 없던 일로 만들면 안 되므로 이렇게 나눕니다.
--
--     tl_transactions   비웁니다 (거래가 사라졌으니 사용 기록도 함께)
--     tl_purchases      남깁니다 (실제 상품권을 받은 기록 — 지우면 분쟁)
--     user_items        비웁니다 (모의투자용 아이템이라 시즌과 함께 초기화)
--     item_usage_logs   비웁니다 (같은 이유)
--     tl_products 재고  건드리지 않습니다 (운영자가 정하는 값)
--
--   게시판·채팅은 시즌과 무관하므로 그대로 둡니다.
--
-- 관리자만 실행할 수 있는 검사는 그대로 유지합니다.
-- 이 파일은 함수 하나만 다시 만듭니다. 테이블은 만들거나 지우지 않습니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================

create or replace function public.reset_season()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 관리자만 실행할 수 있습니다(기존과 동일).
  if not exists (select 1 from public.admin_users where user_id = auth.uid()) then
    raise exception 'permission denied: admin only';
  end if;

  -- ---------------- 모의투자 계정 ----------------
  update public.trading_accounts
  set balance = public.starting_balance(),
      initial_balance = public.starting_balance(),
      realized_pnl = 0,
      updated_at = now()
  where user_id is not null;

  delete from public.positions where user_id is not null;
  delete from public.orders    where user_id is not null;
  delete from public.trades    where user_id is not null;

  -- ---------------- TL ----------------
  -- 거래가 사라져 획득 TL 이 0 이 되므로, 사용 기록도 함께 비웁니다.
  -- 그러지 않으면 잔액이 음수가 되어 아무도 구매할 수 없습니다.
  -- (테이블이 아직 없는 서버에서도 안 터지도록 존재를 확인합니다)
  if to_regclass('public.tl_transactions') is not null then
    delete from public.tl_transactions where user_id is not null;
  end if;

  -- 마켓 아이템은 모의투자용이라 시즌과 함께 초기화합니다.
  if to_regclass('public.item_usage_logs') is not null then
    delete from public.item_usage_logs where user_id is not null;
  end if;
  if to_regclass('public.user_items') is not null then
    delete from public.user_items where user_id is not null;
  end if;

  -- 핫딜 구매내역(tl_purchases)은 지우지 않습니다.
  -- 실제 상품권을 받은 기록이라 지우면 분쟁이 생깁니다.

  -- ---------------- 시즌 번호 ----------------
  -- 접속 중인 브라우저가 자기 localStorage 를 비우게 합니다.
  update public.app_meta
  set value = (value::int + 1)::text, updated_at = now()
  where key = 'season_version';
end;
$$;

grant execute on function public.reset_season to authenticated;


-- ---------------- 확인 ----------------
-- 초기화를 실행하지 않고, 지금 TL 잔액이 음수인 사람이 있는지만 봅니다.
-- (예전에 초기화를 이미 눌렀다면 여기서 음수가 잡힙니다)
select
  p.nickname                       as 닉네임,
  public.tl_earned(p.id)           as 획득TL,
  coalesce((select sum(amount) from public.tl_transactions t
            where t.user_id = p.id), 0) as 거래합계,
  public.tl_balance(p.id)          as 잔액,
  case when public.tl_balance(p.id) < 0 then '음수 — 정리 필요' else '정상' end as 상태
from public.profiles p
order by public.tl_balance(p.id);
