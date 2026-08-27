-- =========================================================================
-- 조회-잔고출처-2026-08-27.sql
-- =========================================================================
-- ⛔ 이 파일은 읽기만 합니다.
--    SELECT 만 들어 있습니다. INSERT · UPDATE · DELETE 가 한 줄도 없습니다.
--    실행해도 서버의 값은 하나도 바뀌지 않습니다.
--
-- 무엇을 알아보려는 것인가
--   어떤 회원의 지갑이 진입 순간 정확히 200,000.00 USDT 였습니다.
--   190,476.19 x 1.05 = 199,999.9995 = 200,000.00
--   딱 떨어지는 200,000 은 "벌어서 모인 돈" 의 모양이 아니라
--   "한 번에 받은 돈" 의 모양입니다. 그 출처를 서버에 직접 물어봅니다.
--
--   가장 유력한 후보 - TL 마켓 시드 충전권
--     supabase/schema-tl-market.sql:218
--       balance = balance + coalesce(it.effect_value, 0)   <- effect_value = 100,000
--     100,000(시작 시드) + 100,000(충전권) = 200,000
--   다만 파일만 봐서는 서버의 실제 상태를 알 수 없어 확정이 안 됩니다.
--
-- 어떻게 실행하나
--   주의 - 아래는 블록이 8개입니다(0번~7번). Supabase SQL Editor 는 한 번에 여러 개를
--      돌리면 마지막 결과 하나만 보여 줍니다.
--      그래서 0번부터 7번까지 블록을 하나씩 마우스로 드래그해서 선택한 뒤
--      Run(Ctrl+Enter) 을 눌러 주세요. 결과 표를 각각 캡처해 주시면 됩니다.
--
--   0번을 먼저 돌려 주세요. 표가 없으면 그 뒤 블록은 오류가 납니다.
--
-- 회원 이름/이메일은 뽑지 않습니다. 구분이 필요한 곳만 user_id 앞 8자리를 씁니다.
-- =========================================================================


-- =========================================================================
-- 0번 - 표가 서버에 있는지 먼저 확인
-- =========================================================================
-- 여기서 '없음' 이 나온 표를 쓰는 블록은 건너뛰시면 됩니다.

select '1. 아이템 사용기록 (item_usage_logs)' as 표,
       case when to_regclass('public.item_usage_logs') is null then '없음' else '있음' end as 상태
union all
select '2. 마켓 상품 (tl_market_products)',
       case when to_regclass('public.tl_market_products') is null then '없음' else '있음' end
union all
select '3. 아이템 보관함 (user_items)',
       case when to_regclass('public.user_items') is null then '없음' else '있음' end
union all
select '4. 거래계정 (trading_accounts)',
       case when to_regclass('public.trading_accounts') is null then '없음' else '있음' end
union all
select '5. 거래기록 (trades)',
       case when to_regclass('public.trades') is null then '없음' else '있음' end
union all
select '6. 충전 기록칸 (trading_accounts.recharge_total)',
       case when exists (select 1 from information_schema.columns
                          where table_schema = 'public'
                            and table_name = 'trading_accounts'
                            and column_name = 'recharge_total')
            then '있음' else '없음' end
order by 1;


-- =========================================================================
-- 1번 - 시드 충전권을 실제로 쓴 기록이 있나   <- 있으면 200,000 의 출처가 확정됩니다
-- =========================================================================
-- item_type = 'seed_recharge' 기록이 한 건이라도 나오면
-- "번 돈이 아니라 받은 돈" 이 서버 기록으로 증명됩니다.
-- effect_data 안의 balance 는 충전 직후 지갑 금액입니다.
-- 여기가 200000 이면 그 자리에서 끝납니다.

select left(l.user_id::text, 8)                       as 회원앞8자리,
       l.item_type                                    as 아이템종류,
       l.effect_value                                 as 효과값,
       to_char(l.used_at, 'YYYY-MM-DD HH24:MI')       as 사용시각,
       (l.effect_data ->> 'added')                    as 더해진금액,
       (l.effect_data ->> 'balance')                  as 충전직후잔고,
       case when (l.effect_data ->> 'balance')::numeric = 200000
            then '*** 정확히 200000 ***'
            else '' end                               as 표시
  from public.item_usage_logs l
 order by l.used_at desc;


-- 1-2. 종류별로 몇 번씩 썼나 (한 줄 요약)
select coalesce(item_type, '(합계)')                  as 아이템종류,
       count(*)                                       as 사용횟수,
       to_char(max(used_at), 'YYYY-MM-DD HH24:MI')    as 마지막사용
  from public.item_usage_logs
 group by rollup (item_type)
 order by 2 desc;


-- 1-3. 시드 충전권을 산 사람이 있나 (사고 아직 안 썼을 수도 있습니다)
select left(ui.user_id::text, 8)                      as 회원앞8자리,
       ui.product_name                                as 상품명,
       ui.item_type                                   as 아이템종류,
       ui.effect_value                                as 효과값,
       ui.quantity                                    as 남은수량,
       to_char(ui.created_at, 'YYYY-MM-DD HH24:MI')   as 구매시각
  from public.user_items ui
 where ui.item_type in ('seed_recharge', 'account_reset')
 order by ui.created_at desc;


-- =========================================================================
-- 2번 - 무료 충전으로 받은 누계(recharge_total) 와 지갑 상태
-- =========================================================================
-- 200,000 이 무료 충전으로 만들어졌는지 가릅니다.
-- 지금 파일 기준으로 서버 함수는 지갑을 100,000 으로 덮어쓰게 돼 있어서(3번 참고)
-- 무료 충전만으로는 200,000 이 나올 수 없습니다.
-- 만약 옛 더하기 버전이 서버에 남아 있으면 100,000 + 100,000 = 200,000 이 됩니다.

select left(ta.user_id::text, 8)                            as 회원앞8자리,
       ta.balance                                           as 지갑잔고,
       ta.initial_balance                                   as 시작자금,
       ta.realized_pnl                                      as 서버실현손익,
       coalesce(ta.recharge_total, 0)                       as 무료충전받은누계,
       coalesce(ta.recharge_count, 0)                       as 오늘충전횟수,
       to_char(ta.last_recharge_at, 'YYYY-MM-DD HH24:MI')   as 마지막충전시각,
       case
         when ta.balance = 200000 then '*** 정확히 200000 ***'
         when ta.balance = ta.initial_balance and ta.realized_pnl = 0
              then '주의 - 시작자금 그대로 + 손익 0 (지갑 초기화 의심)'
         else ''
       end                                                  as 표시
  from public.trading_accounts ta
 order by ta.balance desc;


-- =========================================================================
-- 3번 - 서버에 실제로 들어 있는 함수가 덮어쓰기인가 더하기인가
-- =========================================================================
-- 같은 함수가 파일 여러 곳에 있어서, 어느 파일을 마지막에 돌렸느냐로
-- 서버 동작이 달라집니다. 파일이 아니라 서버에 직접 묻습니다.
--
--   claim_daily_recharge  (무료 충전, 하루 2회)
--     지금 파일 기준(정본) : balance = AMOUNT             <- 덮어쓰기. 항상 100,000
--     옛 버전              : balance = balance + AMOUNT   <- 더하기. 누를 때마다 쌓임
--     주의 - 옛 버전이 살아 있으면 무료 충전 두 번으로 200,000 이 됩니다.
--
--   use_user_item         (마켓 아이템 사용)
--     seed_recharge 는 balance = balance + effect_value (더하기) 입니다.

select p.proname                                            as 함수이름,
       case
         when p.prosrc like '%balance = balance +%' then '더하기 (balance + 금액)'
         when p.prosrc like '%balance = AMOUNT%'    then '덮어쓰기 (balance = 100000)'
         else '판단 불가 - 아래 3-3 을 눈으로 보세요'
       end                                                  as 동작방식,
       case
         when p.proname = 'claim_daily_recharge'
              and p.prosrc like '%balance = balance +%'
           then '주의 - 옛 버전. 무료 충전 두 번이면 200,000 이 됩니다'
         when p.proname = 'claim_daily_recharge'
              and p.prosrc like '%balance = AMOUNT%'
           then 'O 정본. 무료 충전으로는 200,000 이 안 나옵니다'
         else ''
       end                                                  as 판정,
       length(p.prosrc)                                     as 정의길이
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('claim_daily_recharge', 'use_user_item',
                     'purchase_tl_market_item', 'force_starting_balance')
 order by p.proname;


-- 3-2. 같은 이름의 함수가 서버에 여러 벌 있나 (있으면 어느 게 도는지 알 수 없습니다)
select p.proname                                            as 함수이름,
       count(*)                                             as 서버에등록된개수,
       case when count(*) > 1 then '주의 - 여러 벌' else 'O 한 벌' end as 판정
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('claim_daily_recharge', 'use_user_item',
                     'purchase_tl_market_item', 'get_leaderboard',
                     'reset_season', 'rank_points_all', 'tl_balance_info')
 group by p.proname
 order by 2 desc, 1;


-- 3-3. 잔고를 건드리는 줄만 원문 그대로 뽑아 봅니다 (눈으로 확인용)
select p.proname                                            as 함수이름,
       btrim(줄)                                            as 잔고를건드리는줄
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(string_to_array(p.prosrc, chr(10))) as 줄
 where n.nspname = 'public'
   and p.proname in ('claim_daily_recharge', 'use_user_item')
   and 줄 like '%balance =%'
 order by p.proname;


-- =========================================================================
-- 4번 - 거래가 200건을 넘는 회원이 있나
-- =========================================================================
-- 왜 200 인가
--   js/trading.js:68     const MAX_CLOSED_TRADES = 200;   (화면이 들고 있는 상한)
--   js/auth.js:364       trades ... .limit(200)           (로그인할 때 가져오는 개수)
--   화면의 실현손익은 이 200건을 더해서 만듭니다(js/trading.js:634-637).
--   그 값을 js/supabase-sync.js:53 이 서버 realized_pnl 에 그대로 덮어씁니다.
--   그래서 201번째 거래부터는 오래된 거래의 손익이 서버에서 조용히 사라집니다.
--
--   여기서 200건 넘는 회원이 한 명도 없으면 아직 실제 피해는 없다는 뜻입니다.

with 순번 as (
  select user_id, pnl, created_at,
         row_number() over (partition by user_id order by created_at desc) as rn
    from public.trades
)
select left(user_id::text, 8)                               as 회원앞8자리,
       count(*)                                             as 거래건수,
       case when count(*) > 200 then '주의 - 200건 초과' else 'O 200건 이하' end as 판정,
       greatest(count(*) - 200, 0)                          as 잘려나간건수,
       round(sum(pnl), 2)                                   as 전체손익합계,
       round(sum(pnl) filter (where rn <= 200), 2)          as 최근200건만합계,
       round(sum(pnl) - sum(pnl) filter (where rn <= 200), 2) as 잘려서사라진손익,
       to_char(min(created_at), 'YYYY-MM-DD')               as 첫거래,
       to_char(max(created_at), 'YYYY-MM-DD')               as 마지막거래
  from 순번
 group by user_id
 order by 2 desc;


-- =========================================================================
-- 5번 - 서버 realized_pnl 과 거래기록 실제 합계가 어긋나는 회원   *** 가장 중요 ***
-- =========================================================================
-- 4번에서 설명한 "최근 200건으로 잘려 서버를 덮어쓰는" 조용한 고장의
-- 실제 피해 범위를 여기서 잽니다.
--
-- 읽는 법
--   차이 = 서버실현손익 - 거래기록합계
--   차이가 0 이 아니면 서버 값과 거래기록이 서로 다른 이야기를 하고 있습니다.
--   차이가 음수면 서버 쪽이 손익을 덜 들고 있는 것입니다(랭킹이 낮게 나옵니다).
--
-- 주의 - 차이가 0 이 아니어도 200건 잘림이 원인이 아닐 수 있습니다.
--        수수료 처리 방식이나 과거 복구 작업 때문일 수도 있습니다.
--        4번의 거래건수와 같이 보셔야 원인이 갈립니다.

select left(ta.user_id::text, 8)                            as 회원앞8자리,
       coalesce(tr.건수, 0)                                 as 거래건수,
       round(ta.realized_pnl, 2)                            as 서버실현손익,
       round(coalesce(tr.합계, 0), 2)                       as 거래기록합계,
       round(ta.realized_pnl - coalesce(tr.합계, 0), 2)     as 차이,
       case
         when round(ta.realized_pnl - coalesce(tr.합계, 0), 2) = 0 then 'O 일치'
         when coalesce(tr.건수, 0) > 200 then '주의 - 어긋남 + 거래 200건 초과 (잘림 의심)'
         else '주의 - 어긋남 (원인 별도 확인 필요)'
       end                                                  as 판정,
       ta.balance                                           as 지갑잔고,
       ta.initial_balance                                   as 시작자금,
       coalesce(ta.recharge_total, 0)                       as 무료충전받은누계
  from public.trading_accounts ta
  left join (
        select user_id, count(*) as 건수, sum(pnl) as 합계
          from public.trades
         group by user_id) tr
    on tr.user_id = ta.user_id
 order by abs(ta.realized_pnl - coalesce(tr.합계, 0)) desc;


-- 5-2. 한 줄 요약 - 어긋난 사람이 몇 명인가
select count(*)                                             as 전체회원수,
       count(*) filter (
         where round(ta.realized_pnl - coalesce(tr.합계, 0), 2) <> 0) as 어긋난회원수,
       count(*) filter (where coalesce(tr.건수, 0) > 200)   as 거래200건초과회원수,
       count(*) filter (where ta.balance = 200000)          as 잔고가정확히200000인회원수,
       round(sum(abs(ta.realized_pnl - coalesce(tr.합계, 0))), 2) as 어긋난금액총합
  from public.trading_accounts ta
  left join (
        select user_id, count(*) as 건수, sum(pnl) as 합계
          from public.trades
         group by user_id) tr
    on tr.user_id = ta.user_id;


-- =========================================================================
-- 6번 - (덤) TL 마켓이 지금 실제로 무엇을 팔고 있나
-- =========================================================================
-- 시드 충전권이 status = 'active' 이고 화면에 보이기까지 하면 지금도 살 수 있습니다.
-- 'paused' 면 화면에서 살 수 없습니다.

select name                                                 as 상품,
       item_type                                            as 효과종류,
       tl_price                                             as 가격TL,
       effect_value                                         as 효과값,
       status                                               as 판매상태,
       is_visible                                           as 화면에보임,
       coalesce(stock::text, '무제한')                      as 재고,
       case when item_type = 'seed_recharge' and status = 'active'
            then '*** 지금도 살 수 있음 ***' else '' end    as 표시
  from public.tl_market_products
 order by sort_order;


-- =========================================================================
-- 끝. 다시 말씀드리지만 이 파일은 아무것도 바꾸지 않습니다.
-- =========================================================================


-- =========================================================================
-- 7번 - 지갑(balance) 을 지켜 주는 안전장치가 서버에 걸려 있나
-- =========================================================================
-- 왜 보나
--   js/trading.js:571-573 은 브라우저에 저장된 잔고가 "유한한 숫자" 이기만
--   하면 무엇이든 그대로 받아들이고, js/supabase-sync.js:53 이 그 값을
--   서버에 그대로 올립니다. 화면 쪽에는 상한이 한 곳도 없습니다.
--
--   서버에는 initial_balance(시작자금) 를 지키는 트리거
--   check_trading_account_update() 가 걸려 있다고 기록돼 있습니다
--   (supabase/schema-initial-balance.sql:65-67).
--   그 트리거가 balance(지갑) 까지 보고 있는지가 이 블록의 질문입니다.
--   함수 본문이 저장소 파일에는 없어서 서버에 직접 물어봐야 합니다.

select t.tgname                                             as 트리거이름,
       p.proname                                            as 함수이름,
       case when t.tgenabled = 'D' then '꺼져 있음' else '켜져 있음' end as 상태
  from pg_trigger t
  join pg_proc p on p.oid = t.tgfoid
 where t.tgrelid = 'public.trading_accounts'::regclass
   and not t.tgisinternal
 order by t.tgname;


-- 7-2. 그 함수가 실제로 무엇을 막는지 본문 그대로 보기
select p.proname                                            as 함수이름,
       btrim(줄)                                            as 본문
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral unnest(string_to_array(p.prosrc, chr(10))) as 줄
 where n.nspname = 'public'
   and p.proname in ('check_trading_account_update', 'force_starting_balance')
   and btrim(줄) <> ''
 order by p.proname;


-- 7-3. 지갑 쓰기 권한이 회원에게 열려 있나
--   trading_accounts_update_own 정책에 with check 가 비어 있으면,
--   회원이 자기 계정의 balance 를 원하는 값으로 바꿔 쓸 수 있습니다.
select policyname                                           as 정책이름,
       cmd                                                  as 동작,
       coalesce(qual, '(없음)')                             as 읽기조건,
       coalesce(with_check, '(없음 - 쓰는 값을 검사하지 않음)') as 쓰기조건
  from pg_policies
 where schemaname = 'public' and tablename = 'trading_accounts'
 order by policyname;
