-- =========================================================================
-- TL 잔액 계산 불일치 수정
-- =========================================================================
-- 무엇이 틀렸나
--   tl_balance()      = 획득 + 모든 거래 합계   (음수+양수 전부)
--   tl_balance_info() = 획득 - 음수 거래 합계   (양수를 무시)
--   두 함수가 다른 값을 냅니다.
--
--   tl_balance() 는 실제 구매 가능 여부를 판정하는 데 쓰이고,
--   tl_balance_info() 는 화면에 '보유 TL' 로 표시됩니다.
--
--   예: 획득 10,000 / 구매 -5,300 / 환불 +1,000 / 이벤트 지급 +2,000
--       실제 쓸 수 있는 돈  7,700  (tl_balance)
--       화면에 보이는 돈    4,700  (tl_balance_info)
--       3,000 TL 차이 — 사용자가 "왜 잔액이 다르지?" 하게 됩니다.
--
--   지금은 환불·지급 기능을 안 쓰고 있어 드러나지 않지만,
--   tl_transactions 에 refund/grant 타입이 이미 정의돼 있습니다.
--   나중에 이벤트 지급이나 환불을 시작하는 순간 바로 터집니다.
--
-- 어떻게 고치나
--   tl_balance_info() 가 tl_balance() 를 그대로 쓰게 합니다.
--   잔액을 두 군데서 따로 계산하지 않습니다 — 한 곳에서만 계산합니다.
--   '사용' 표시는 음수 합계 그대로 두고, '지급' 을 따로 보여줍니다.
--
-- 이 파일은 함수 하나만 바꿉니다. 테이블은 건드리지 않습니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================

create or replace function public.tl_balance_info()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  earned numeric;
  spent numeric;
  granted numeric;
begin
  if uid is null then
    return json_build_object(
      'logged_in', false, 'earned', 0, 'spent', 0, 'granted', 0, 'balance', 0);
  end if;

  earned := public.tl_earned(uid);

  -- 사용(음수)과 지급/환불(양수)을 각각 보여줍니다.
  spent := coalesce((select -sum(amount) from public.tl_transactions x
                     where x.user_id = uid and x.amount < 0), 0);
  granted := coalesce((select sum(amount) from public.tl_transactions x
                       where x.user_id = uid and x.amount > 0), 0);

  return json_build_object(
    'logged_in', true,
    'earned', earned,
    'spent', spent,
    'granted', granted,
    -- 잔액은 반드시 tl_balance() 와 같은 값이어야 합니다.
    -- 구매 가능 여부를 판정하는 것도 tl_balance() 이기 때문입니다.
    'balance', public.tl_balance(uid));
end;
$$;

grant execute on function public.tl_balance_info to authenticated;


-- ---------------- 확인 ----------------
-- 두 값이 같아야 합니다. 다르면 문제가 남아 있는 것입니다.
select
  public.tl_balance(auth.uid())                             as 구매판정_잔액,
  (public.tl_balance_info() ->> 'balance')::numeric          as 화면표시_잔액,
  public.tl_balance(auth.uid())
    = (public.tl_balance_info() ->> 'balance')::numeric      as 일치;
