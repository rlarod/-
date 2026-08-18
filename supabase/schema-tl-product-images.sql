-- =========================================================================
-- 상품 이미지 연결 — 스타벅스 e교환권
-- =========================================================================
-- 이미지 파일은 저장소 assets/products/ 에 들어 있습니다(이미 push 완료).
-- 여기서는 tl_products.image_url 만 채웁니다. 다른 값은 건드리지 않습니다.
-- 여러 번 실행해도 안전합니다.
--
-- ※ 30,000원권 이미지도 주셨는데, 지금 상품 목록에 스타벅스 30,000원권이
--   없습니다(주신 목록: 아메리카노 5,000 / 금액권 10,000 / 금액권 20,000).
--   상품을 새로 만들려면 TL 가격을 정해주셔야 해서, 아래 4)번에
--   주석으로만 준비해뒀습니다. TL 가격만 알려주시면 바로 켭니다.
-- =========================================================================


-- ---------------- 1) 연결 ----------------
update public.tl_products
   set image_url = 'assets/products/starbucks-10000.png', updated_at = now()
 where brand = '스타벅스' and name = '금액권 10,000원';

update public.tl_products
   set image_url = 'assets/products/starbucks-20000.png', updated_at = now()
 where brand = '스타벅스' and name = '금액권 20,000원';


-- ---------------- 2) 확인 ----------------
-- 스타벅스 상품 3개 중 2개에 image_url 이 채워져 있어야 합니다.
select brand, name, price, tl_price,
       coalesce(image_url, '(없음 — 머리글자로 표시)') as 이미지
from public.tl_products
where brand = '스타벅스'
order by price;


-- ---------------- 3) 전체 현황 ----------------
select count(*) as 전체상품,
       count(image_url) as 이미지있음,
       count(*) - count(image_url) as 이미지없음
from public.tl_products;


-- ---------------- 4) 스타벅스 30,000원권을 추가하려면 ----------------
-- TL 가격을 정해서 아래 <TL가격> 자리에 넣고 주석을 풀어 실행하세요.
-- (참고: 기존 비율은 10,000원 -> 2,700 TL / 20,000원 -> 5,300 TL 입니다)
--
-- insert into public.tl_products
--   (name, brand, category, price, tl_price, stock, max_purchase, sort_order, image_url)
-- values
--   ('금액권 30,000원', '스타벅스', 'cafe', 30000, <TL가격>, 50, 2, 16,
--    'assets/products/starbucks-30000.png')
-- on conflict do nothing;
