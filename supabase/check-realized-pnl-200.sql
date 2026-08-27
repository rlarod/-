-- =========================================================================
-- check-realized-pnl-200.sql
--   "실현손익이 최근 200건으로 잘려 서버를 덮어쓴다" 를 실제로 재는 파일
-- =========================================================================
-- ★ 이 파일은 읽기만 합니다. 아무것도 바뀌지 않습니다. ★
--   select 만 있습니다. insert / update / delete / drop 이 하나도 없습니다.
--   몇 번을 Run 해도 회원 데이터가 그대로입니다.
--
-- =========================================================================
-- 무엇을 보는 파일인가
-- =========================================================================
-- 브라우저는 거래내역을 최근 200건만 들고 있습니다(js/trading.js:68).
-- 그런데 마이페이지에 쓰는 '누적 실현손익' 을 그 200건만 더해서 만들고
-- (js/trading.js:634-637), 그 값을 서버에 그대로 덮어씁니다
-- (js/supabase-sync.js:56).
--
-- 그래서 거래가 200건을 넘긴 회원은
--   서버에 저장된 realized_pnl = 최근 200건의 합
--   실제 누적 실현손익        = 전체 거래의 합
-- 이 서로 달라집니다. 오류도 안 나고 화면도 멀쩡해서 회원은 모릅니다.
--
-- js/sync-guard.js 는 이 경우를 ★일부러 통과시킵니다★
--   (js/sync-guard.js:79  serverBaseline.tradeCount < 200 조건)
--   200건 상한에 닿은 것은 '데이터 유실' 이 아니라고 보기 때문입니다.
--
-- =========================================================================
-- 어디에 영향이 있고 어디에 없는지 (코드를 직접 읽고 확인한 것)
-- =========================================================================
--   랭킹      영향 없음
--             정본 뷰 schema-leaderboard-floor.sql 의 leaderboard 는
--             public.trades 를 시간 순으로 훑어 계산합니다.
--             realized_pnl 은 그냥 옆에 같이 보여주는 칸일 뿐입니다.
--
--   계급      영향 없음
--             schema-rank-1000.sql 의 rank_assets() 는 지갑 + 증거금 -
--             recharge_total 이라 realized_pnl 을 아예 안 씁니다.
--
--   마이페이지  ★영향 있음★
--             js/cycle-pnl.js:55 이 trading_accounts.realized_pnl 을
--             그대로 읽어 '누적 실현손익' 자리에 찍습니다.
--
--   옛 랭킹 뷰  영향 있음 (schema-leaderboard-fix.sql)
--             그 파일을 나중에 Run 하면 랭킹이 realized_pnl 기준으로
--             돌아가면서 이 문제가 랭킹까지 번집니다.
--             ⚠ health-check.sql 이 그 옛 파일을 안내합니다. 따르지 마세요.
--             정본은 schema-leaderboard-floor.sql 입니다.
--
-- =========================================================================
-- 서버의 trades 표가 '정답' 인 이유
-- =========================================================================
--   · js/supabase-sync.js 는 새로 늘어난 거래만 insert 합니다 (지우지 않음)
--   · schema-trades-dedupe.sql 이 (user_id, created_at) 유일 인덱스로
--     중복을 막고, 중복이 와도 조용히 무시합니다
--   → 그래서 서버 trades 에는 200건 상한이 없습니다. 전부 쌓여 있습니다.
-- =========================================================================


-- ---------------- 1) 한눈에 보기 ----------------
-- 지금 이 문제에 실제로 걸린 회원이 몇 명인지.
-- '걸린_회원수' 가 0 이면 아직 아무도 200건을 안 넘겼다는 뜻이고,
-- 고쳐도 지금 바뀌는 숫자는 하나도 없습니다(앞으로를 막는 것뿐입니다).
with 현재사이클_거래 as (
  select t.user_id, t.pnl
    from public.trades t
    join public.trading_accounts ta on ta.user_id = t.user_id
   where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
),
집계 as (
  select user_id,
         count(*)                  as 서버_거래건수,
         coalesce(sum(pnl), 0)     as 서버_합계
    from 현재사이클_거래
   group by user_id
)
select
  count(*)                                                as 거래한_회원수,
  count(*) filter (where g.서버_거래건수 > 200)           as 걸린_회원수,
  max(g.서버_거래건수)                                    as 최다_거래건수,
  round(coalesce(max(abs(g.서버_합계 - coalesce(ta.realized_pnl, 0)))
                 filter (where g.서버_거래건수 > 200), 0)) as 최대_차이_USDT
from 집계 g
join public.trading_accounts ta on ta.user_id = g.user_id;


-- ---------------- 2) 회원별로 자세히 ----------------
-- 차이_USDT 가 0 에서 멀수록 마이페이지 '누적 실현손익' 이 틀려 있는 것입니다.
-- 200건 이하인 회원은 차이가 0 이 정상입니다.
--   (0 이 아니면 다른 원인입니다 — supabase/diagnose-pnl.sql 을 보세요)
with 현재사이클_거래 as (
  select t.user_id, t.pnl
    from public.trades t
    join public.trading_accounts ta on ta.user_id = t.user_id
   where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
),
집계 as (
  select user_id,
         count(*)              as 서버_거래건수,
         coalesce(sum(pnl), 0) as 서버_합계
    from 현재사이클_거래
   group by user_id
)
select
  coalesce(p.nickname, '(이름없음)')                       as 회원,
  g.서버_거래건수                                          as 서버_거래건수,
  case when g.서버_거래건수 > 200 then '★잘림'
       else '정상' end                                     as 상태,
  round(g.서버_합계)                                       as 진짜_누적손익,
  round(coalesce(ta.realized_pnl, 0))                      as 저장된_값,
  round(g.서버_합계 - coalesce(ta.realized_pnl, 0))        as 차이_USDT
  -- 참고 — 랭킹 수익금은 여기 안 넣었습니다.
  --   ranking_profit 뷰는 schema-leaderboard-floor.sql 을 돌린 서버에만
  --   있어서, 없는 서버에서 이 파일이 통째로 오류가 나기 때문입니다.
  --   랭킹 숫자는 어차피 이 값의 영향을 안 받습니다(맨 위 설명 참조).
from 집계 g
join public.trading_accounts ta on ta.user_id = g.user_id
left join public.profiles p     on p.id = g.user_id
order by abs(g.서버_합계 - coalesce(ta.realized_pnl, 0)) desc;


-- ---------------- 3) 200건을 넘긴 회원만 ----------------
-- 아래 목록이 비어 있으면 지금 당장 틀린 회원은 없습니다.
select
  coalesce(p.nickname, '(이름없음)') as 회원,
  count(*)                           as 현재사이클_거래건수,
  min(t.created_at)                  as 첫거래,
  max(t.created_at)                  as 마지막거래
from public.trades t
join public.trading_accounts ta on ta.user_id = t.user_id
left join public.profiles p     on p.id = t.user_id
where coalesce(t.cycle_no, 1) = coalesce(ta.cycle_no, 1)
group by p.nickname
having count(*) > 200
order by count(*) desc;
