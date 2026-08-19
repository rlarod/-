-- =========================================================================
-- 사라진 수익 기록 확인 및 복구
-- =========================================================================
-- 증상
--   '분명 수익 2천만원이었는데 -155 손실로 보인다'
--
-- 원인
--   로컬(브라우저) 거래 데이터가 비워진 상태에서 저장이 일어나면,
--   그 빈 값이 서버의 trading_accounts.realized_pnl 을 덮어씁니다.
--   랭킹도 이 값을 기준으로 하므로 순위까지 함께 사라집니다.
--
-- 다행인 점
--   개별 거래 기록(trades 테이블)은 덮어쓰기가 아니라 '추가' 방식이라
--   그대로 남아 있을 가능성이 높습니다.
--   그렇다면 trades 를 다시 합산해서 realized_pnl 을 되살릴 수 있습니다.
--
-- 아래는 [확인] -> [복구] 순서입니다. 확인부터 하세요.
-- =========================================================================


-- ---------------- 1) 확인: 저장된 값과 실제 거래 합계가 다른가 ----------------
select
  p.nickname                                    as 닉네임,
  ta.realized_pnl                               as 저장된_실현손익,
  coalesce(sum(t.pnl), 0)                       as 거래합계,
  count(t.id)                                   as 거래건수,
  round(coalesce(sum(t.pnl), 0) - ta.realized_pnl, 2) as 차이,
  case
    when count(t.id) = 0 then '거래 기록 없음'
    when abs(coalesce(sum(t.pnl), 0) - ta.realized_pnl) < 0.01 then '일치 (정상)'
    else '어긋남 — 복구 필요'
  end                                           as 상태
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
left join public.trades t on t.user_id = ta.user_id
group by p.nickname, ta.realized_pnl, ta.user_id
order by abs(coalesce(sum(t.pnl), 0) - ta.realized_pnl) desc;


-- ---------------- 2) 거래 기록이 실제로 남아 있는지 ----------------
-- 최근 거래 20건. 여기에 기록이 보이면 복구할 수 있습니다.
select
  p.nickname                as 닉네임,
  t.side                    as 방향,
  t.entry_price             as 진입가,
  t.exit_price              as 청산가,
  t.pnl                     as 손익,
  t.close_reason            as 사유,
  t.created_at              as 시각
from public.trades t
join public.profiles p on p.id = t.user_id
order by t.created_at desc
limit 20;


-- =========================================================================
-- [복구] 위 1)에서 '어긋남 — 복구 필요' 가 나왔고,
--        2)에서 거래 기록이 보일 때만 아래 주석을 풀어 실행하세요.
-- =========================================================================
-- 거래 기록(trades)을 다시 합산해서 realized_pnl 을 되살립니다.
-- 잔고(balance)는 건드리지 않습니다 — 잔고는 시드 충전·펀딩비 등
-- 거래 외 요인도 섞여 있어 단순 합산으로 되살리면 안 됩니다.
--
-- update public.trading_accounts ta
-- set realized_pnl = sub.total,
--     updated_at = now()
-- from (
--   select user_id, sum(pnl) as total, count(*) as cnt
--   from public.trades
--   group by user_id
-- ) sub
-- where ta.user_id = sub.user_id
--   and sub.cnt > 0
--   and abs(sub.total - ta.realized_pnl) >= 0.01;
--
-- -- 복구 후 재확인
-- select p.nickname, ta.realized_pnl as 복구된_실현손익,
--        (select count(*) from public.trades t where t.user_id = ta.user_id) as 거래건수
-- from public.trading_accounts ta
-- join public.profiles p on p.id = ta.user_id;
