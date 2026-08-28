-- =========================================================================
-- 유령포지션-조사.sql  —  읽기 전용입니다. 아무것도 바뀌지 않습니다.
-- =========================================================================
--  이 파일은 SELECT 만 합니다.
--  회원 데이터를 지우거나 고치지 않습니다. 그냥 Run 하셔도 안전합니다.
--
--  무엇을 보나
--    "이미 청산됐는데 positions 표에 아직 남아 있는 포지션"이 몇 개인지 봅니다.
--    이것이 남아 있으면, 그 회원이 새로고침할 때 없는 포지션이 되살아나서
--    바로 강제청산됩니다(대표님이 겪으신 그 증상).
--
--  어떻게 가리나 — 아래 셋을 모두 만족하면 유령으로 봅니다.
--    (1) 그 포지션이 열린 뒤에 청산 거래가 있다
--    (2) 그 거래가 "부분청산"이 아니다
--        (부분청산은 포지션을 남기므로 유령이 아닙니다)
--    (3) 그 거래의 방향(side)과 진입가(entry_price)가 그 포지션과 같다
--        — 이것까지 같아야 "바로 이 포지션을 닫은 거래"라고 볼 수 있습니다
--
--  화면 코드(js/ghost-position-guard.js)가 쓰는 기준과 같습니다.
-- =========================================================================

-- [1] 유령으로 보이는 포지션 목록
select
  p.user_id,
  p.symbol,
  p.side                                as 포지션_방향,
  p.entry_price                         as 포지션_진입가,
  p.margin                              as 묶인_증거금,
  p.created_at                          as 포지션_연시각,
  t.created_at                          as 닫은거래_시각,
  t.close_reason                        as 닫은이유,
  t.pnl                                 as 그때_손익
from positions p
join trades t
  on t.user_id     = p.user_id
 and t.side        = p.side
 and t.entry_price = p.entry_price
 and t.created_at  > p.created_at + interval '2 seconds'
 and coalesce(t.close_reason, '') <> '부분청산'
order by p.created_at;

-- [2] 몇 건인지 한 줄 요약
select
  count(*)                        as 유령으로_보이는_포지션_수,
  count(distinct p.user_id)       as 영향받는_회원_수,
  coalesce(sum(p.margin), 0)      as 묶여있는_증거금_합계
from positions p
where exists (
  select 1
  from trades t
  where t.user_id     = p.user_id
    and t.side        = p.side
    and t.entry_price = p.entry_price
    and t.created_at  > p.created_at + interval '2 seconds'
    and coalesce(t.close_reason, '') <> '부분청산'
);

-- [3] 참고 — 지금 positions 에 남아 있는 전체 행 수
--     (위 [2] 의 숫자와 비교해 보시라고 같이 뽑습니다)
select count(*) as 전체_열린포지션_행수 from positions;

-- =========================================================================
--  결과를 어떻게 읽나
--
--   [2] 가 0 이면  → 서버에 남은 유령이 없습니다. 더 하실 일 없습니다.
--   [2] 가 1 이상  → 그 회원들이 새로고침하면 유령 청산을 겪을 수 있습니다.
--
--  다만 화면 쪽(js/ghost-position-guard.js)이 복원 단계에서 이미 걸러내므로,
--  이 표에 몇 건이 남아 있어도 회원이 유령 청산을 당하지는 않습니다.
--  그리고 그 회원이 다음에 거래를 한 번 하면 그 시점에 정상적으로 지워집니다.
--
--  ⚠️ 지우는 SQL 은 일부러 만들지 않았습니다.
--     포지션을 지우는 것은 회원 돈이 걸린 일이라, 위 [1] 목록을 먼저 보고
--     PM·대표님이 확인하신 뒤에 만들어야 합니다.
-- =========================================================================
