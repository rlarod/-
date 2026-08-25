-- ============================================================================
--
--   TL 마켓에 상품이 두 벌씩 올라와 있는 것을 정리합니다
--
--   ⚠️ 이 파일은 값을 바꿉니다. 앞의 조사 파일들과 다릅니다.
--      다만 아래 세 가지는 절대 하지 않습니다.
--        · 회원 데이터(user_items · tl_transactions)를 지우지 않습니다
--        · 구매 이력이 걸린 상품은 지우지 않습니다
--        · WHERE 없는 DELETE 를 쓰지 않습니다
--
-- ============================================================================
--
--   무엇이 문제였나
--
--   화면에 상품이 12개 떠 있는데 실제로는 6종입니다. 전부 두 번씩입니다.
--     레버리지 x100배 이용권 · 포지션 훔쳐보기 이용권 · 코인선물 재충전 이용권
--     시드 충전권 · 거래 수수료 할인권 · 포지션 보호권
--
--   원인 — supabase/schema-tl-market.sql 의 상품 등록문이 이렇게 끝납니다.
--
--       on conflict do nothing;
--
--   막아주는 것처럼 보이지만, name 에 중복 방지 장치가 없어서
--   실제로는 아무것도 막지 못합니다(기본키가 매번 새로 만들어지는 번호라
--   절대 부딪히지 않습니다). 그래서 그 파일을 두 번 실행하면서 두 벌이 됐습니다.
--
--   이 파일은 두 가지를 합니다.
--     1. 중복된 줄을 지웁니다 (구매 이력이 있는 줄은 남깁니다)
--     2. 같은 이름이 두 번 들어가지 못하게 막습니다 → 다시는 안 생깁니다
--
-- ============================================================================
--
--   대표님이 하실 일
--
--   1. 이 파일을 통째로 복사해서 SQL Editor 에 붙여넣습니다
--   2. Run 을 누릅니다
--   3. 결과 표 두 개가 나옵니다. 캡처해서 보내주세요
--        앞의 표 = 정리 전에 무엇이 있었는지
--        뒤의 표 = 정리 후에 무엇이 남았는지  (6줄이면 성공입니다)
--
--   여러 번 실행해도 안전합니다. 두 번째부터는 지울 게 없어서 아무 일도 안 합니다.
--
-- ============================================================================


begin;

-- ── 정리 전 상태를 남겨 둡니다 (나중에 무엇이 지워졌는지 확인용) ──────────
create temporary table _마켓_정리전 on commit drop as
select id, name, sort_order, status, created_at
from public.tl_market_products
order by sort_order, created_at;


-- ── 남길 줄 하나를 고릅니다 ────────────────────────────────────────────────
--
--   같은 이름끼리 묶어서 아래 순서로 우선순위를 매기고 1등만 남깁니다.
--     1) 구매 이력이 있는 줄  ← 회원이 산 상품은 절대 안 지웁니다
--     2) 먼저 만들어진 줄
--     3) 번호가 앞서는 줄 (앞의 둘이 같을 때만)
--
create temporary table _마켓_남길것 on commit drop as
select id
from (
  select
    p.id,
    row_number() over (
      partition by p.name
      order by
        (exists (select 1 from public.user_items ui where ui.product_id = p.id)) desc,
        p.created_at asc,
        p.id asc
    ) as 순위
  from public.tl_market_products p
) t
where 순위 = 1;


-- ── 중복 줄만 지웁니다 ─────────────────────────────────────────────────────
--
--   WHERE 조건이 반드시 붙어 있습니다.
--   그리고 "구매 이력이 있는 줄은 어떤 경우에도 제외" 조건을 한 번 더 겁니다.
--   (위에서 이미 걸렀지만, 실수로 지워지는 일이 없도록 두 겹으로 막습니다)
--
delete from public.tl_market_products p
where p.id not in (select id from _마켓_남길것)
  and not exists (
    select 1 from public.user_items ui where ui.product_id = p.id
  );


-- ── 다시는 두 벌이 안 생기게 막습니다 ──────────────────────────────────────
--
--   같은 이름을 두 번 넣으려 하면 서버가 거부합니다.
--   이게 있어야 schema-tl-market.sql 의 "on conflict do nothing" 이
--   비로소 진짜로 동작합니다.
--
create unique index if not exists tl_market_products_name_uniq
  on public.tl_market_products (name);

-- ── 같은 함정이 핫딜 상품에도 있어서 미리 막습니다 ────────────────────────
--
--   supabase/schema-tl-hotdeal.sql:347       상품 23줄 insert
--   supabase/schema-tl-product-images.sql:66 상품  3줄 insert
--   둘 다 "on conflict do nothing" 인데 tl_products 에도 중복 방지 장치가
--   없습니다. 마켓과 똑같은 함정입니다.
--
--   2026-08-25 확인 — 핫딜 상품은 아직 중복이 없습니다(26행 전부 고유).
--   터지기 전에 미리 막습니다. 지우는 것이 없으니 안전합니다.
--
--   이름만으로는 안 됩니다. "아메리카노" 가 스타벅스·메가커피·투썸에 각각
--   있고 "금액권 10,000원" 도 여러 브랜드에 있습니다. 브랜드+이름으로 묶습니다.
--
create unique index if not exists tl_products_brand_name_uniq
  on public.tl_products (brand, name);

commit;


-- ── 결과 확인 ──────────────────────────────────────────────────────────────

select '① 정리 전' as 구분, count(*) as 줄수,
       count(distinct name) as 고유이름수
from _마켓_정리전
union all
select '② 정리 후', count(*), count(distinct name)
from public.tl_market_products;

select '③ 남은 상품' as 구분,
       sort_order as 순서, name as 상품명, tl_price as 가격,
       status as 상태, is_visible as 보임
from public.tl_market_products
order by sort_order, name;


-- ============================================================================
--
--   결과 읽는 법
--
--   ① 정리 전   12줄 / 고유이름 6개
--   ② 정리 후    6줄 / 고유이름 6개     ← 이러면 성공입니다
--   ③ 남은 상품  6줄이 순서대로
--
--   만약 ② 가 6줄이 아니라면 구매 이력이 걸린 줄이 더 있다는 뜻입니다.
--   그 경우 그대로 캡처해서 알려주세요. 지워야 할지 따로 판단하겠습니다.
--
--   되돌리기 — 지운 줄을 되살리려면 supabase/schema-tl-market.sql 의
--   "7) 기본 상품 등록" 부분을 다시 실행하면 됩니다. 이제 이름 중복 장치가
--   있어서 이미 있는 것은 건너뛰고 빠진 것만 들어갑니다.
--   중복 방지 장치만 없애려면:  drop index tl_market_products_name_uniq;
--
-- ============================================================================
