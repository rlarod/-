-- =========================================================================
-- orders 테이블 패치 — 거래 데이터 동기화를 위한 추가 컬럼 (안전, 재실행 가능)
-- =========================================================================
-- 기존 테이블/데이터를 전혀 건드리지 않습니다. ADD COLUMN IF NOT EXISTS만
-- 사용하므로 이미 실행했어도 다시 실행해도 안전합니다.
--
-- client_order_id: trading.js가 자체적으로 만드는 주문 ID("o1755...")를
--   그대로 저장해서, 같은 주문의 상태가 OPEN→FILLED/CANCELLED로 바뀔 때
--   새 행을 또 만들지 않고 같은 행을 업데이트(upsert)할 수 있게 합니다.
-- quantity: 원래 설계(Phase 11)에 있었는데 처음 스키마에서 빠졌던 컬럼 —
--   증거금×레버리지/가격으로 계산해서 채웁니다.
-- =========================================================================

alter table public.orders add column if not exists client_order_id text;
alter table public.orders add column if not exists quantity numeric;

create unique index if not exists idx_orders_user_client_id
  on public.orders(user_id, client_order_id);
