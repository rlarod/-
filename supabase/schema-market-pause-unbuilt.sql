-- =========================================================================
-- schema-market-pause-unbuilt.sql — 아직 효과가 없는 상품 판매 중지
-- =========================================================================
-- 왜 하나
--   TL 마켓에 상품 6개가 등록돼 있는데, 실제로 효과가 있는 건 하나뿐입니다.
--   나머지를 그대로 열어두면 손님이 TL 을 내고 아무 일도 일어나지 않습니다.
--
--   코드에서 확인한 결과(2026-08-20):
--     leverage_boost     ✅ js/leverage-gate.js 가 실제로 상한을 올려줍니다
--     position_peek      ❌ 쓰는 코드 없음
--     account_reset      ❌ 쓰는 코드 없음
--     seed_recharge      ❌ 쓰는 코드 없음
--     fee_discount       ❌ 쓰는 코드 없음 (수수료는 js/trading.js 고정값)
--     liquidation_guard  ❌ 쓰는 코드 없음 (청산은 js/trading.js 가 그대로 실행)
--
-- 무엇을 하나
--   상품을 지우지 않습니다. status 를 'paused' 로 바꿔 판매만 멈춥니다.
--   나중에 기능을 만들면 'active' 로 되돌리면 그대로 살아납니다.
--   가격·설명·정렬 순서 같은 설정은 전부 남아 있습니다.
--
-- 이미 산 사람은
--   구매 기록(tl_purchases)과 쓴 TL 기록은 건드리지 않습니다.
--   환불이 필요하면 별도로 판단하셔야 합니다 — 이 파일은 판매만 멈춥니다.
--
-- 여러 번 실행해도 안전합니다.
-- =========================================================================

-- ---------------- 1) 지금 상태 보기 ----------------
select name as 상품, item_type as 효과종류, tl_price as 가격, status as 상태
from public.tl_market_products
order by sort_order;


-- ---------------- 2) 효과 없는 상품 판매 중지 ----------------
update public.tl_market_products
set status = 'paused'
where item_type in (
  'position_peek',
  'account_reset',
  'seed_recharge',
  'fee_discount',
  'liquidation_guard'
);


-- ---------------- 3) 실제로 되는 상품은 판매 유지 ----------------
-- 혹시 예전에 멈춰뒀다면 다시 켭니다.
update public.tl_market_products
set status = 'active'
where item_type = 'leverage_boost';


-- ---------------- 4) 확인 ----------------
-- '레버리지 x100배 이용권' 만 active 여야 합니다.
select name as 상품, item_type as 효과종류, tl_price as 가격, status as 상태
from public.tl_market_products
order by status, sort_order;
