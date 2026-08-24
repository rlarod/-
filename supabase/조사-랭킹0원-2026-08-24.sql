-- =========================================================================
-- 조사 — 랭킹이 전부 0원으로 나오는 이유
-- 2026-08-24 본부장
-- =========================================================================
--   ⚠ 이 파일은 "읽기만" 합니다. 아무것도 바뀌지 않습니다.
--     지우지도, 고치지도, 만들지도 않습니다. 전부 select 뿐입니다.
--
--   ▸ 무엇을 확인하려는 건가
--       랭킹에 3명 전부 "총자산 100,000 / 수익금 +0원" 으로 나옵니다.
--       그런데 같은 화면 채팅에는 오늘(8/24) 김갱님 거래 7건이 억 단위로
--       떠 있습니다. 합계 약 -220,579,147원.
--
--       둘 중 하나입니다. 이 조회로 가려집니다.
--         (가) 계좌가 초기화됐다   → 거래기록은 있는데 손익만 0
--         (나) 손익이 안 쌓인다     → 거래할 때마다 기록이 안 남음
--
--   ▸ 어떻게 쓰나
--       전체를 한 번에 Run 하셔도 됩니다. 결과 5개가 차례로 나옵니다.
--       그 결과를 그대로 캡처해서 보내주시면 본부장이 판정합니다.
-- =========================================================================


-- ---------------- 1) 지금 계좌 상태 ----------------
-- realized_pnl(확정손익)이 0 인지, initial_balance(시작돈)가 얼마인지.
select
  p.nickname                                   as 닉네임,
  ta.initial_balance                           as 시작돈,
  ta.balance                                   as 지갑,
  ta.realized_pnl                              as 확정손익,
  ta.updated_at                                as 계좌_마지막변경
from public.trading_accounts ta
join public.profiles p on p.id = ta.user_id
order by p.nickname;


-- ---------------- 2) 거래기록이 남아 있나 ----------------
-- 여기 줄이 나오면 (가) 초기화, 줄이 없으면 (나) 기록 안 남음 입니다.
select
  p.nickname                                   as 닉네임,
  count(*)                                     as 거래건수,
  min(t.created_at)                            as 첫거래,
  max(t.created_at)                            as 마지막거래,
  round(sum(t.pnl))                            as 손익합계,
  round(sum(t.fee))                            as 수수료합계
from public.trades t
join public.profiles p on p.id = t.user_id
group by p.nickname
order by 거래건수 desc;


-- ---------------- 3) 오늘(한국시간 8/24) 거래만 ----------------
-- 채팅에 뜬 7건이 실제로 trades 에 있는지 봅니다.
select
  p.nickname                                              as 닉네임,
  (t.created_at at time zone 'Asia/Seoul')                as 한국시간,
  t.side                                                  as 방향,
  round(t.pnl)                                            as 손익,
  t.close_reason                                          as 사유
from public.trades t
join public.profiles p on p.id = t.user_id
where (t.created_at at time zone 'Asia/Seoul')::date
      = (now() at time zone 'Asia/Seoul')::date
order by t.created_at;


-- ---------------- 4) 랭킹에 안 나오는 회원이 있나 ----------------
-- 프로필은 4명인데 랭킹에는 3명만 나옵니다. 누가 빠졌는지 봅니다.
select
  p.nickname                                   as 닉네임,
  case when ta.user_id is null
       then '❌ 계좌 없음 — 랭킹에서 빠짐'
       else '✅ 계좌 있음' end                  as 상태
from public.profiles p
left join public.trading_accounts ta on ta.user_id = p.id
order by 상태, p.nickname;


-- ---------------- 5) 초기화한 흔적이 있나 ----------------
-- 계좌 마지막 변경 시각이 마지막 거래보다 "나중"이면
-- 거래 뒤에 누군가/무언가가 계좌를 건드린 것입니다.
select
  p.nickname                                              as 닉네임,
  max(t.created_at)                                       as 마지막거래,
  ta.updated_at                                           as 계좌_마지막변경,
  case
    when max(t.created_at) is null then '거래 없음'
    when ta.updated_at > max(t.created_at) + interval '1 minute'
         then '⚠ 거래 뒤에 계좌가 바뀜 — 초기화 의심'
    else '거래와 함께 갱신됨 — 정상'
  end                                                     as 판정
from public.profiles p
join public.trading_accounts ta on ta.user_id = p.id
left join public.trades t on t.user_id = p.id
group by p.nickname, ta.updated_at
order by p.nickname;
