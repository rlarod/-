-- =========================================================================
-- 조회-랭킹0원-검산-2026-08-27.sql
--   "랭킹 세 분이 전부 0원" 이 ★계산상 맞는 값★ 인지 서버에서 확정합니다
-- =========================================================================
-- ⛔ 읽기만 합니다. UPDATE / INSERT / DELETE / DROP / CREATE 가 한 줄도
--    없습니다. 몇 번 돌리셔도 아무것도 바뀌지 않습니다.
--
-- 지금까지 확인된 것 (2026-08-27 조사팀, 라이브 화면에서 직접 잼)
--   랭킹 화면    CHRO / Mang9 / 김갱  세 분 모두
--                총자산 $100,000.00 · 수익금 +$0.00 · 수익률 +0.00%
--   채팅 기록    김갱님 거래 8건이 시각과 함께 남아 있습니다 (10:06~18:51)
--
--   그 8건을 확정 계산식(누적 = max(0, 누적 + 이번손익))에 그대로 넣어
--   손으로 계산했더니 ★정확히 0★ 이 나왔습니다.
--
--     10:06 +60,903,329   누적    60,903,329   바닥규칙    60,903,329
--     10:14 +35,623,994   누적    96,527,323   바닥규칙    96,527,323
--     10:56 -218,744,361  누적  -122,217,038   바닥규칙             0
--     11:24 +94,092,527   누적   -28,124,511   바닥규칙    94,092,527
--     12:43 +116,631,862  누적    88,507,351   바닥규칙   210,724,389
--     14:13 +29,149,474   누적   117,656,825   바닥규칙   239,873,863
--     15:48 -338,235,972  누적  -220,579,147   바닥규칙             0
--     18:51 -142,857,143  누적  -363,436,290   바닥규칙             0  <= 마지막
--
--     합계 -363,436,290원 / 누적 최솟값도 -363,436,290원 (마지막이 최저점)
--     랭킹수익금 = 합계 - 최솟값 = 0
--
--   즉 김갱님의 0원은 ★고장이 아니라 계산상 맞는 값★ 으로 보입니다.
--   마지막 두 번의 강제청산으로 ★지금이 여태 가장 깊은 바닥★ 이라
--   바닥 규칙상 0이 됩니다.
--
--   (채팅 금액은 원화이고 랭킹은 달러입니다. 환율 1,500원 고정 —
--    js/config.js 61번 줄. -363,436,290원 = -242,290.86 USDT)
--
-- 그래도 서버에서 확인해야 하는 것 세 가지
--   1) 채팅에 안 보이는 예전 거래가 더 있나 (채팅은 최근 50건만 불러옵니다)
--   2) CHRO / Mang9 두 분은 거래가 아예 없나, 아니면 저장이 안 된 건가
--   3) 지금 서버에 살아 있는 랭킹 뷰가 어느 판인가 (파일이 5벌입니다)
--
-- 어떻게 돌리나
--   블록이 6개입니다. ★한 블록씩 드래그해서 선택한 뒤 Run★ 해 주세요.
-- =========================================================================


-- =========================================================================
-- [1] 지금 서버에 살아 있는 랭킹 판이 어느 것인가
-- =========================================================================
-- 저장소에 leaderboard 뷰가 5벌 있습니다. 계산이 서로 다릅니다.
-- '판정' 칸으로 어느 판인지 가려냅니다.
select
  case when to_regclass('public.ranking_profit') is null
       then '없음' else '있음' end                     as ranking_profit_뷰,
  case
    when to_regclass('public.leaderboard') is null
      then '⚠ 랭킹 뷰가 아예 없습니다'
    when to_regclass('public.ranking_profit') is not null
     and pg_get_viewdef('public.leaderboard'::regclass) like '%ranking_profit%'
      then '✅ floor 판 (schema-leaderboard-floor.sql) - 인계문서 확정식과 같습니다'
    when pg_get_viewdef('public.leaderboard'::regclass) like '%GREATEST(0%'
      or pg_get_viewdef('public.leaderboard'::regclass) like '%greatest(0%'
      then '△ leaderboard-fix 판 - 합계에만 0 바닥. 확정식과 다릅니다'
    when pg_get_viewdef('public.leaderboard'::regclass) like '%realized_pnl%'
      then '⚠ ranking-fix 판 - 마이너스를 그대로 씁니다'
    else '? 알 수 없는 판 - 아래 정의를 봐 주세요'
  end                                                   as 판정,
  pg_get_viewdef('public.leaderboard'::regclass, true)  as 랭킹뷰_실제정의;


-- =========================================================================
-- [2] ★핵심★ 회원별 한 줄 검산 - 화면값과 손계산이 맞나
-- =========================================================================
-- '계산한_랭킹수익금' 과 '화면에_나오는_수익금' 이 같아야 정상입니다.
-- 다르면 뷰가 옛 판이거나 사이클 번호가 어긋난 것입니다.
with 훑기 as (
  select
    t.user_id,
    t.pnl,
    sum(t.pnl) over (partition by t.user_id
                     order by t.created_at, t.id
                     rows between unbounded preceding and current row) as 누적
  from public.trades t
  join public.trading_accounts ta on ta.user_id = t.user_id
  where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
),
집계 as (
  select user_id,
         count(*)                       as 거래건수,
         sum(pnl)                        as 손익합계,
         min(누적)                       as 누적최솟값,
         sum(pnl) - least(0, min(누적))  as 계산한_랭킹수익금
  from 훑기 group by user_id
)
select
  p.nickname                                        as 닉네임,
  ta.initial_balance                                as 기준자본,
  ta.balance                                        as 지갑잔고,
  ta.realized_pnl                                   as 진짜누적손익,
  coalesce(g.거래건수, 0)                            as 랭킹에_들어간_거래수,
  round(coalesce(g.손익합계, 0), 2)                  as 손익합계,
  round(coalesce(g.누적최솟값, 0), 2)                as 누적최솟값,
  round(coalesce(g.계산한_랭킹수익금, 0), 2)          as 계산한_랭킹수익금,
  round(coalesce(lb.profit_amount, 0), 2)           as 화면에_나오는_수익금,
  case
    when coalesce(g.거래건수, 0) = 0
      then '거래가 0건입니다 - 0원이 맞습니다'
    when round(coalesce(g.계산한_랭킹수익금,0), 2)
       = round(coalesce(lb.profit_amount, 0), 2)
      then '✅ 손계산과 화면이 같습니다'
    else '⚠ 다릅니다 - [1] 의 판정과 [4] 사이클을 보세요'
  end                                               as 판정
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
left join 집계 g       on g.user_id = ta.user_id
left join public.leaderboard lb on lb.nickname = p.nickname
order by 닉네임;


-- =========================================================================
-- [3] 거래를 한 줄씩 훑어보기 - 바닥이 어디였나 (최근 40건)
-- =========================================================================
-- '바닥규칙_누적' 이 ★맨 아래(가장 최근) 줄★ 에서 0 이면,
-- 지금이 여태 가장 깊은 바닥이라 랭킹 0원이 맞는 것입니다.
-- 눈으로 확인하실 수 있게 한 줄씩 펼칩니다. 오래된 것이 위입니다.
with 훑기 as (
  select
    t.id, t.user_id, t.symbol, t.close_reason, t.pnl, t.created_at, t.cycle_no,
    ta.cycle_no as 계좌사이클,
    sum(t.pnl) over (partition by t.user_id
                     order by t.created_at, t.id
                     rows between unbounded preceding and current row) as 누적
  from public.trades t
  join public.trading_accounts ta on ta.user_id = t.user_id
),
바닥붙임 as (
  select 훑기.*,
         min(누적) over (partition by user_id
                         order by created_at, id
                         rows between unbounded preceding and current row) as 여태최솟값
  from 훑기
)
select
  p.nickname                                as 닉네임,
  to_char(b.created_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI') as 시각,
  b.symbol                                  as 종목,
  b.close_reason                            as 청산사유,
  round(b.pnl, 2)                           as 이번손익_USDT,
  round(b.pnl * 1500)                       as 이번손익_원화,
  round(b.누적, 2)                           as 그냥누적_USDT,
  round(b.누적 - least(0, b.여태최솟값), 2)   as 바닥규칙_누적_USDT,
  b.cycle_no                                as 거래사이클,
  b.계좌사이클
from 바닥붙임 b
join public.profiles p on p.id = b.user_id
order by p.nickname, b.created_at, b.id
limit 40;


-- =========================================================================
-- [4] 사이클 번호가 어긋나서 거래가 통째로 빠지고 있나
-- =========================================================================
-- ranking_profit 뷰는 '거래의 사이클 번호 = 계좌의 사이클 번호' 인 것만 셉니다.
-- '랭킹에서_빠짐' 이 크고 '랭킹에_들어감' 이 0 이면 그것이 0원의 원인입니다.
select
  p.nickname                                                    as 닉네임,
  ta.cycle_no                                                   as 계좌사이클,
  count(t.id)                                                   as 전체거래수,
  count(t.id) filter (where coalesce(t.cycle_no,1) = coalesce(ta.cycle_no,1))
                                                                as 랭킹에_들어감,
  count(t.id) filter (where coalesce(t.cycle_no,1) <> coalesce(ta.cycle_no,1))
                                                                as 랭킹에서_빠짐,
  min(t.cycle_no)                                               as 거래사이클_최소,
  max(t.cycle_no)                                               as 거래사이클_최대
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
left join public.trades t on t.user_id = ta.user_id
group by p.nickname, ta.cycle_no
order by 닉네임;


-- =========================================================================
-- [5] 거래가 서버에 제대로 저장되고 있나 (채팅 기록과 대조)
-- =========================================================================
-- 채팅에 남은 청산 알림 수와 trades 표의 거래 수를 비교합니다.
-- 채팅에는 8건이 보이는데 trades 가 0건이면 ★저장이 안 되는 것★ 입니다.
-- (채팅 알림은 청산 때만 나가므로 trades 수가 채팅보다 많은 것은 정상입니다)
select
  p.nickname                                     as 닉네임,
  count(distinct t.id)                           as trades_거래수,
  count(distinct c.id) filter (
    where c.message like '%' || p.nickname || '%'
      and (c.message like '%익절%' or c.message like '%손절%'
           or c.message like '%강제청산%'))       as 채팅_청산알림수,
  max(t.created_at at time zone 'Asia/Seoul')    as 마지막_거래시각,
  max(ta.updated_at at time zone 'Asia/Seoul')   as 마지막_계좌저장시각
from public.profiles p
join public.trading_accounts ta on ta.user_id = p.id
left join public.trades t       on t.user_id = p.id
left join public.chat_messages c on true
group by p.nickname
order by 닉네임;


-- =========================================================================
-- [6] 결과를 어떻게 읽나 (요약)
-- =========================================================================
--   [2] 판정이 전부 '✅ 손계산과 화면이 같습니다' 또는 '거래가 0건입니다'
--       -> 랭킹 0원은 ★고장이 아니라 계산상 맞는 값★ 입니다. 정상입니다.
--
--   [2] 에 '⚠ 다릅니다' 가 있으면
--       -> [1] 판정이 'floor 판' 이 아닐 가능성이 큽니다.
--          그때는 어느 판인지 본부장에게 알려 주시면 됩니다.
--          (판을 바꾸는 것은 랭킹 계산식에 닿는 일이라 대표님 결재 사항입니다)
--
--   [4] 에서 '랭킹에_들어감' 이 0 인데 '랭킹에서_빠짐' 이 크면
--       -> 사이클 번호가 어긋난 것입니다. 별건으로 다뤄야 합니다.
--
--   [5] 에서 trades_거래수 가 0 인데 채팅_청산알림수 가 8 이면
--       -> 거래가 서버에 저장되지 않고 있는 것입니다. 이건 큰 건입니다.
-- =========================================================================


-- =========================================================================
-- ★2026-08-27 추가★ [7] 회원은 4명인데 랭킹에는 3명 - 누가 빠졌나
-- =========================================================================
-- ⛔ 여기도 읽기만 합니다.
--
-- 왜 붙였나
--   위 [1]~[5] 는 전부 trading_accounts 를 ★inner join★ 으로 씁니다.
--   그래서 '지갑 줄 자체가 없는 회원' 은 이 조회들에도 안 나옵니다.
--   랭킹 뷰(leaderboard)도 같은 inner join 이라 똑같이 빠집니다.
--
--   js/auth.js:317 이 가입할 때 trading_accounts 를 만드는데,
--   실패해도 ★console.warn 만 남기고 그냥 넘어갑니다★ (js/auth.js:323).
--   그래서 profiles 는 만들어졌는데 지갑 줄만 없는 회원이 생길 수 있습니다.
--   백로그 TL-010 의 곁가지("김갱TV 가 랭킹에 없음")가 이것일 수 있습니다.
select
  p.nickname                                       as 닉네임,
  case when ta.user_id is null
       then '★지갑 줄 없음 - 랭킹에서 통째로 빠집니다★'
       else 'OK 지갑 줄 있음' end                   as 상태,
  round(coalesce(ta.initial_balance, 0))           as 기준자본,
  round(coalesce(ta.balance, 0))                   as 지갑,
  round(coalesce(ta.realized_pnl, 0))              as 확정손익,
  (select count(*) from public.trades t where t.user_id = p.id) as 거래수,
  to_char(p.created_at at time zone 'Asia/Seoul',
          'MM-DD HH24:MI')                         as 가입시각
from public.profiles p
left join public.trading_accounts ta on ta.user_id = p.id
order by (ta.user_id is null) desc, p.created_at;

-- 숫자로 한 줄.
select
  (select count(*) from public.profiles)                     as 회원수,
  (select count(*) from public.trading_accounts)             as 지갑줄수,
  (select count(*) from public.leaderboard)                  as 랭킹에_나오는수,
  (select count(*) from public.profiles p
     where not exists (select 1 from public.trading_accounts ta
                        where ta.user_id = p.id))            as 지갑줄_없는회원;

-- 읽는 법
--   '지갑줄_없는회원' 이 0 이면 -> 4명 중 1명이 빠진 이유는 다른 데 있습니다.
--                                  (닉네임 중복·profiles 자체가 없음 등)
--   0 이 아니면                -> 그 회원은 가입 때 지갑 만들기가 실패한 것입니다.
--                                  거래를 한 번 하면 js/supabase-sync.js 의
--                                  upsert 가 줄을 만들어 주므로 그때 복구됩니다.
-- =========================================================================
