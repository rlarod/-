-- =========================================================================
-- schema-market-sale-stop.sql
--   TL 마켓 판매 중지를 ★서버에도★ 겁니다 (대표 B안)
-- =========================================================================
-- 2026-09-02 · 수리팀
--
-- ⛔ 이 파일은 [0] 번이 ★읽기만★ 합니다.
--    먼저 [0] 만 Run 해서 서버의 지금 상태를 눈으로 보신 뒤에
--    [1] 을 Run 해 주세요. (한 번에 전부 Run 하셔도 결과는 같습니다.
--    순서가 어긋나도 망가지는 것이 없습니다 — 아래 '안전한 이유' 참고)
--
-- =========================================================================
-- 되돌리는 방법  ★한 줄★
-- =========================================================================
--   update public.tl_market_products
--      set status = 'active', updated_at = now()
--    where item_type = 'leverage_boost';
--
--   이 한 줄이면 이 파일을 돌리기 ★직전 상태로 정확히★ 돌아갑니다.
--   (돌리기 직전 서버 상태 — leverage_boost 만 'active',
--    나머지 5개는 이미 'paused' 였습니다. 2026-09-01 수리팀 실서버 확인)
--   맨 아래 [되돌리기] 절에 같은 내용을 다시 적어 두었습니다.
--
--   ⚠ 화면 잠금도 같이 푸셔야 합니다 — 아래 '화면과 어긋나지 않게' 참고.
--
-- =========================================================================
-- 왜 하나
-- =========================================================================
--   2026-08-31 대표님이 B안(판매 중지)을 고르셨습니다.
--   그날 ★화면★ 은 막았습니다 (js/tl-market.js 의 SALE_PAUSED = true).
--   그런데 ★서버는 아직 열려 있습니다★.
--
--   2026-09-01 실서버를 읽어 확인한 상태 —
--     '레버리지 x100배 이용권'  50 TL   status = ★'active'★   ← 열려 있음
--     나머지 5개                        status = 'paused'
--
--   화면 버튼만 막은 것이라, 개발자도구를 아는 회원은
--     supabase.rpc('purchase_tl_market_item', {...})
--   를 직접 불러 ★지금도 50 TL 을 쓸 수 있습니다★.
--   그 아이템은 효과가 없습니다(js/leverage-gate.js 의 기본 상한이 이미 100).
--   즉 TL 만 나가고 아무 일도 일어나지 않습니다.
--
-- =========================================================================
-- 무엇을 하나 / 무엇을 안 하나
-- =========================================================================
--   한다    tl_market_products.status 를 'paused' 로 바꿉니다. 상품 6개 전부.
--
--   안 한다 · 상품을 지우지 않습니다. 이름·가격·설명·정렬순서 그대로 남습니다.
--           · ★이미 산 회원의 기록을 하나도 안 건드립니다★
--             user_items(보관함) · item_usage_logs(사용기록) ·
--             tl_transactions(TL 내역) · tl_purchases(핫딜) — 전부 그대로.
--             ⚠ 환불(C안)은 대표님이 고르지 않으셨습니다. 여기서 안 합니다.
--           · 회원의 TL 잔액을 안 건드립니다.
--
-- =========================================================================
-- ⭐ 이미 산 회원은 그대로 쓸 수 있습니다
-- =========================================================================
--   서버 함수 use_user_item() 은 ★상품의 status 를 보지 않습니다★.
--   보관함(user_items)의 수량만 봅니다.
--   그래서 판매를 멈춰도 [아이템 보관함]의 [사용하기]는 그대로 됩니다.
--   (supabase/schema-tl-market.sql 의 use_user_item 본문에
--    tl_market_products 나 status 를 읽는 곳이 한 줄도 없습니다)
--
-- =========================================================================
-- ⭐ 마켓 화면에서 상품이 사라지지 않습니다
-- =========================================================================
--   js/tl-market.js:249 는 status 로 거르지 않고 전부 읽어옵니다
--     client.from("tl_market_products").select("*")
--   조회 정책도 열려 있습니다 (tl_market_products_select_all · using (true)).
--   그래서 카드는 그대로 보이고 ★살 수만 없게★ 됩니다.
--
-- =========================================================================
-- ⭐ 화면 잠금과 어긋나지 않게 (확인 완료)
-- =========================================================================
--   화면(js/tl-market.js)        서버(이 파일)         회원이 보는 것
--   ---------------------------------------------------------------------
--   SALE_PAUSED = true (지금)    paused (이 파일 뒤)   "판매 중지" · 못 삼   ✅
--   SALE_PAUSED = true (지금)    active (지금 서버)    "판매 중지" · ⚠ 우회 가능
--   SALE_PAUSED = false          paused                "판매 준비중" · 못 삼
--   SALE_PAUSED = false          active                "구매하기" · 살 수 있음
--
--   js/tl-market.js 의 saleInfo() 가 SALE_PAUSED 를 서버 상태보다 앞에 둡니다.
--   그래서 이 파일을 돌려도 회원이 보는 글자는 ★하나도 안 바뀝니다★
--   ("판매 중지" 그대로). 바뀌는 것은 우회로가 막히는 것뿐입니다.
--
--   ⚠ 나중에 A안(진짜 작동하게)으로 가실 때는 ★두 곳을 같이★ 푸셔야 합니다.
--      ① 위 [되돌리기] 한 줄을 Run
--      ② js/tl-market.js 의 SALE_PAUSED 를 false 로
--      한쪽만 풀면 회원 화면이 "판매 준비중" 에서 멈춰 있거나(①만),
--      버튼은 눌리는데 서버가 거절합니다(②만).
--
-- =========================================================================
-- ⚠ 다른 SQL 파일과 부딪치는 곳 (꼭 읽어 주세요)
-- =========================================================================
--   supabase/schema-market-pause-unbuilt.sql 의 [3] 번에 이 줄이 있습니다 —
--     update public.tl_market_products
--        set status = 'active' where item_type = 'leverage_boost';
--
--   ★그 파일을 나중에 다시 Run 하시면 이 파일이 조용히 되돌아갑니다.★
--   그 파일을 다시 돌리셨으면 ★이 파일도 다시 Run★ 해 주세요.
--   (아래 [2] 확인이 그 상태를 ⚠ 로 잡아 줍니다)
--
--   ※ 그 파일은 여기서 고치지 않았습니다. 배정받은 범위 밖이라
--     PM 에게 따로 보고했습니다.
--
-- =========================================================================
-- 안전한 이유 (여러 번 돌려도, 순서가 어긋나도 괜찮습니다)
-- =========================================================================
--   · DELETE / TRUNCATE / DROP 이 한 줄도 없습니다
--   · 바꾸는 표는 tl_market_products 하나뿐이고, 바꾸는 칸은 status 와
--     updated_at 두 개뿐입니다
--   · WHERE 에 상품 종류 6개를 이름으로 적었습니다. 조건 없는 UPDATE 가 아닙니다
--   · 이미 'paused' 인 줄은 건드리지 않습니다 (and status <> 'paused')
--   · [0] 과 [2] 는 select 만 합니다
-- =========================================================================


-- =========================================================================
-- [0] 서버의 지금 상태 보기   ★읽기 전용 — 아무것도 바뀌지 않습니다★
-- =========================================================================
-- ★ 이 [0] 번만 먼저 Run 하시고 결과를 캡처해 주세요.
--   저장소 파일에 없는 것이 서버에 있을 수 있어서, 파일만 봐서는 확정이 안 됩니다.

-- (0-1) 상품의 지금 상태.
--   '지금_살_수_있나' 가 '⚠ 살 수 있음' 인 줄이 우회로가 열려 있는 상품입니다.
select
  name                                   as 상품,
  item_type                              as 효과종류,
  tl_price                               as 가격,
  status                                 as 서버상태,
  is_visible                             as 화면에보임,
  case when status = 'active' then '⚠ 살 수 있음'
       else '✅ 못 삼' end                as 지금_살_수_있나
from public.tl_market_products
order by (status = 'active') desc, sort_order;

-- (0-2) ★중요★ 서버의 purchase_tl_market_item 이 정말 status 를 보는가.
--   이 파일은 "서버가 paused 를 거절한다" 를 전제로 합니다.
--   서버 함수가 저장소 파일과 다를 수 있어서 본문을 직접 확인합니다.
--
--   판정_결과 가
--     '✅ status 검사 있음'  → 이 파일이 효과가 있습니다. [1] 로 진행하세요.
--     '⚠ status 검사 없음'   → 이 파일만으로는 안 막힙니다. ★멈추고 알려주세요★
--     '⚠ 함수가 없습니다'    → schema-tl-market.sql 을 먼저 Run 하셔야 합니다
select
  case
    when to_regprocedure('public.purchase_tl_market_item(uuid,integer)') is null
      then '⚠ 함수가 없습니다 - supabase/schema-tl-market.sql 을 먼저 Run 하세요'
    when pg_get_functiondef(
           to_regprocedure('public.purchase_tl_market_item(uuid,integer)')::oid
         ) like '%not_on_sale%'
      then '✅ status 검사 있음 - 이 파일이 효과가 있습니다'
    else '⚠ status 검사 없음 - 이 파일만으로는 안 막힙니다. 팀에 알려주세요'
  end as 판정_결과;

-- (0-3) 이미 산 회원이 몇 분인지.  ★읽기만 합니다. 하나도 안 바꿉니다★
--   이 파일을 돌려도 아래 숫자는 그대로여야 합니다([2-3] 에서 다시 셉니다).
select
  (select count(*) from public.user_items where quantity > 0) as 보관함에_아이템있는_줄수,
  (select coalesce(sum(quantity), 0) from public.user_items)  as 보관함_총수량,
  (select count(distinct user_id) from public.user_items)     as 산_회원수,
  (select count(*) from public.item_usage_logs)               as 사용기록_줄수;

-- (0-4) 한 줄 요약.
select
  count(*)                                   as 상품수,
  count(*) filter (where status = 'active')  as 아직_살수있는_상품수,
  case when count(*) filter (where status = 'active') = 0
       then '✅ 이미 다 막혀 있습니다 - [1] 을 돌려도 바뀌는 것이 없습니다'
       else '⚠ 아직 열려 있습니다 - 아래 [1] 을 Run 해 주세요'
  end                                        as 지금_해야_할_일
from public.tl_market_products;


-- =========================================================================
-- [1] 판매 중지   ★이 파일에서 무언가를 바꾸는 곳은 여기 하나뿐입니다★
-- =========================================================================
-- 상품을 지우지 않습니다. status 만 'paused' 로 바꿉니다.
-- 이미 'paused' 인 줄은 손대지 않습니다(updated_at 도 안 흔듭니다).
update public.tl_market_products
   set status = 'paused',
       updated_at = now()
 where item_type in (
         'leverage_boost',
         'position_peek',
         'account_reset',
         'seed_recharge',
         'fee_discount',
         'liquidation_guard'
       )
   and status <> 'paused';


-- =========================================================================
-- [2] 확인   ★읽기 전용★
-- =========================================================================
-- (2-1) 상품별 상태. '서버상태' 가 전부 paused 여야 합니다.
select
  name                                   as 상품,
  item_type                              as 효과종류,
  tl_price                               as 가격,
  status                                 as 서버상태,
  case when status = 'active' then '⚠ 아직 살 수 있음'
       else '✅ 못 삼' end                as 지금_살_수_있나
from public.tl_market_products
order by (status = 'active') desc, sort_order;

-- (2-2) ★이것만 보시면 됩니다★
select
  count(*) filter (where status = 'active') as 아직_살수있는_상품수,
  case when count(*) filter (where status = 'active') = 0
       then '✅ 끝났습니다 - 서버에서도 아무도 못 삽니다'
       else '⚠ 아직 남아 있습니다 - [1] 을 다시 Run 하거나 팀에 알려주세요'
  end                                       as 결과
from public.tl_market_products;

-- (2-3) 이미 산 회원 기록이 그대로인지.  (0-3) 과 ★같은 숫자★ 여야 합니다.
select
  (select count(*) from public.user_items where quantity > 0) as 보관함에_아이템있는_줄수,
  (select coalesce(sum(quantity), 0) from public.user_items)  as 보관함_총수량,
  (select count(distinct user_id) from public.user_items)     as 산_회원수,
  (select count(*) from public.item_usage_logs)               as 사용기록_줄수;


-- =========================================================================
-- [되돌리기]   ★한 줄★
-- =========================================================================
-- A안(레버리지 이용권을 진짜 작동하게)으로 바꾸실 때 아래 한 줄을 Run 하시면
-- 이 파일을 돌리기 직전 상태로 정확히 돌아갑니다.
-- (앞의 -- 를 지우고 실행하세요. 회원 데이터를 하나도 안 건드립니다)
--
--   update public.tl_market_products
--      set status = 'active', updated_at = now()
--    where item_type = 'leverage_boost';
--
-- ⚠ 되돌리시면 화면 잠금도 같이 푸셔야 합니다 —
--    js/tl-market.js 의  var SALE_PAUSED = true;  를  false;  로.
--    한쪽만 풀면 회원 화면과 서버가 서로 다른 말을 합니다.
--
-- ⚠ 되돌리시면 다시 "효과 없는 아이템에 50 TL 이 나가는" 상태가 됩니다.
--    A안(js/leverage-gate.js 의 기본 상한을 낮추고 이용권으로 올리게)을
--    ★먼저★ 만든 뒤에 되돌리시는 것이 맞습니다.
-- =========================================================================
