-- ############################################################################
--
--   ⛔  이 파일을 실행하지 마십시오.  (2026-08-25 봉인)
--
--   여기 적힌 "복구" 는 지금 상황에서 틀렸습니다.
--   돌리면 회원의 손실 기록이 지워지고 랭킹이 부당하게 올라갑니다.
--
-- ── 왜 봉인했나 ─────────────────────────────────────────────────────────
--
--   이 파일은  realized_pnl = sum(trades.pnl)  로 덮으려 합니다.
--   그런데 그 둘은 원래 같으면 안 되는 값입니다.
--
--       trades.pnl        = 총손익 − 청산수수료      (진입수수료가 안 빠짐)
--       realized_pnl      = 거기서 진입수수료까지 뺀 값  ← 진짜 잃은 돈
--
--   차이 = 진입수수료 합계.  js/realized-pnl-fix.js 가 그렇게 만들고 있습니다.
--
--   2026-08-25 김갱 계정 실측 (PM이 서버에서 직접 확인)
--
--       거래 7건 손익 합계      -147,053
--       진입수수료 합계           52,947
--                              ─────────
--                              -200,000  = 서버 realized_pnl -199,999.99  ✓
--
--   딱 맞아떨어집니다. 지금 서버 값이 맞는 값입니다.
--
--   이 파일을 돌리면  -199,999.99 → -147,053  이 되어
--   손실 52,947 이 사라집니다. 되돌릴 수 없습니다.
--
-- ── supabase/diagnose-pnl.sql 도 같은 오진을 합니다 ──────────────────────
--
--   그 파일은 "차이 0 = 정상" 으로 판정합니다. 진입수수료를 모릅니다.
--   그래서 볼 때마다 "어긋남 — 복구 필요" 라고 나옵니다. 무시하십시오.
--
-- ── 정말 복구가 필요한 상황이라면 ───────────────────────────────────────
--
--   먼저 조사팀에 원인을 확정시키십시오. 이 프로젝트에서 원인을 확정하지 않고
--   세 번 고쳤다가 세 번 다 엉뚱한 곳이었습니다.
--
-- ############################################################################

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
