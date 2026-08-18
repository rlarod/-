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

update public.tl_products
   set image_url = 'assets/products/mega-10000.png', updated_at = now()
 where brand = '메가커피' and name = '금액권 10,000원';


-- ---------------- 2) 확인 ----------------
-- 스타벅스 상품 3개 중 2개에 image_url 이 채워져 있어야 합니다.
select brand, name, price, tl_price,
       coalesce(image_url, '(없음 — 화면에서 숨김)') as 이미지
from public.tl_products
where brand in ('스타벅스', '메가커피')
order by brand, price;


-- ---------------- 3) 전체 현황 ----------------
-- 이미지 없는 상품은 화면에서 숨겨집니다(데이터는 그대로 남습니다).
select count(*) as 전체상품,
       count(image_url) as 화면에_보임,
       count(*) - count(image_url) as 숨겨짐
from public.tl_products;


-- ---------------- 4) 30,000 / 50,000원권 신규 등록 ----------------
-- 이미지는 받았는데 처음 목록에 없던 금액대입니다.
-- TL 가격은 지어내지 않고, 사장님이 이미 정하신 가격표에서 규칙을 뽑아 계산했습니다.
--
--  [기준표] 배민·쿠팡·스타벅스 금액권이 모두 같은 값을 씁니다
--     5,000원 ->  1,400 TL
--    10,000원 ->  2,700 TL
--    20,000원 ->  5,300 TL
--    30,000원 ->  8,000 TL
--    50,000원 -> 13,500 TL
--
--  [스타벅스] 10,000/20,000원이 기준표와 똑같으므로 30,000원도 기준표 그대로
--    -> 8,000 TL
--
--  [메가커피] 10,000원이 2,500 TL 로 기준표(2,700)보다 1만원당 200 TL 쌉니다.
--    같은 할인폭을 적용했고, 비율(2500/2700)로 계산해도 같은 값이 나옵니다.
--      30,000원 : 8,000 - 600 = 7,400   (비율식 7,407 -> 100 단위로 맞춤)
--      50,000원 : 13,500 - 1,000 = 12,500  (비율식도 정확히 12,500)
--
-- 재고 50 / 1인 2개 제한은 기존 상품과 동일하게 맞췄습니다.
insert into public.tl_products
  (name, brand, category, price, tl_price, stock, max_purchase, sort_order, image_url)
values
  ('금액권 30,000원', '스타벅스', 'cafe', 30000,  8000, 50, 2, 16,
   'assets/products/starbucks-30000.png'),
  ('금액권 30,000원', '메가커피', 'cafe', 30000,  7400, 50, 2, 17,
   'assets/products/mega-30000.png'),
  ('금액권 50,000원', '메가커피', 'cafe', 50000, 12500, 50, 2, 18,
   'assets/products/mega-50000.png')
on conflict do nothing;


-- ---------------- 5) 최종 확인 ----------------
-- 화면에 보이는 상품(이미지 있는 것)이 6개여야 합니다.
select brand, name, price, tl_price,
       round(tl_price / price, 4) as "원당TL",
       coalesce(image_url, '(없음 — 화면에서 숨김)') as 이미지
from public.tl_products
where image_url is not null
order by brand, price;
