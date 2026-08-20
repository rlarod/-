-- =========================================================================
-- 진단용 — 랭킹의 이상한 숫자가 어디서 왔는지 찾습니다
-- =========================================================================
-- 아무것도 바꾸지 않습니다. 읽기만 합니다.
-- Supabase SQL Editor 에 붙여넣고 실행한 뒤, 결과를 캡처해 주세요.
--
-- 확인하려는 것
--   trading_accounts.realized_pnl(랭킹이 쓰는 값)이
--   trades 표에 실제로 쌓인 거래 손익의 합과 맞는지.
--   둘이 다르면 '거래 기록' 이 아니라 '누적값' 이 잘못된 것입니다.
-- =========================================================================

-- ---------------- 1) 계정별 요약 ----------------
select
  p.nickname                                   as 닉네임,
  round(ta.initial_balance)                    as 초기자금_USDT,
  round(ta.balance)                            as 현재지갑_USDT,
  round(ta.realized_pnl)                       as 누적손익_USDT,
  -- 거래 표에 실제로 쌓인 손익의 합
  round(coalesce((
    select sum(t.pnl) from public.trades t where t.user_id = p.id
  ), 0))                                       as 거래합계_USDT,
  -- 위 둘의 차이. 0 이 아니면 누적값이 거래 기록과 어긋난 것입니다.
  round(ta.realized_pnl - coalesce((
    select sum(t.pnl) from public.trades t where t.user_id = p.id
  ), 0))                                       as 차이,
  (select count(*) from public.trades t where t.user_id = p.id) as 거래건수,
  ta.updated_at                                as 마지막갱신
from public.profiles p
join public.trading_accounts ta on ta.user_id = p.id
order by ta.realized_pnl asc
limit 30;


-- ---------------- 2) 손실이 큰 거래 20건 ----------------
-- 한 건에 얼마나 큰 손실이 기록됐는지 봅니다.
-- 증거금보다 손실이 크면(강제청산 제외) 계산이 잘못된 것입니다.
select
  p.nickname            as 닉네임,
  t.created_at          as 시각,
  t.side                as 방향,
  t.leverage            as 레버리지,
  round(t.margin)       as 증거금_USDT,
  round(t.margin * t.leverage) as 명목가_USDT,
  round(t.pnl)          as 손익_USDT,
  -- 손실이 증거금보다 크면 이상합니다(강제청산도 증거금까지만 잃습니다)
  case when t.pnl < -t.margin * 1.05 then '증거금보다 큰 손실'
       else '' end      as 이상여부,
  t.close_reason        as 사유
from public.trades t
join public.profiles p on p.id = t.user_id
order by t.pnl asc
limit 20;


-- ---------------- 3) 거래 표 자체가 있는지 ----------------
-- trades 표가 비어 있다면 위 2번 결과도 비어 있습니다.
-- 그 경우 누적값(realized_pnl)만 남아 있고 근거가 없다는 뜻입니다.
select count(*) as 전체거래건수 from public.trades;
