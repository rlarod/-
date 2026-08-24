-- =========================================================================
-- 조사 2 — 랭킹·손익이 0으로 나오는 이유 (한 번에 나오는 판)
-- 2026-08-24 본부장
-- =========================================================================
--   ⚠ 읽기만 합니다. 아무것도 바뀌지 않습니다. select 뿐입니다.
--
--   앞선 파일은 조회를 5개로 나눠 놓았는데, Supabase SQL Editor 는
--   여러 개를 한 번에 돌리면 "마지막 것만" 보여줍니다.
--   그래서 전부 한 표에 담았습니다.
--
--   ▸ 사용법
--       통째로 Run → 결과 표 하나가 나옵니다 → 그대로 캡처해 주세요.
--       가로로 길면 오른쪽으로 밀어서 한 장 더 찍어주시면 좋습니다.
--
--   ▸ 지금까지 알아낸 것
--       · CHRO / Mang9 은 거래를 한 번도 안 했습니다 → 0원이 정상입니다
--       · 김갱님만 문제입니다 — 마지막 거래(06:48) 2시간 뒤인
--         08:47 에 계좌가 바뀌었습니다
--
--   ▸ 이 조회로 가리려는 것
--       (가) 거래기록은 남아 있는데 손익(realized_pnl)만 0 으로 지워졌나
--       (나) 애초에 손익이 쌓이지 않고 있나
-- =========================================================================

select
  p.nickname                                                    as "닉네임",

  -- ---------- 서버가 들고 있는 계좌 값 ----------
  ta.initial_balance                                            as "시작돈",
  ta.balance                                                    as "지갑",
  ta.realized_pnl                                               as "확정손익",

  -- ---------- 거래기록이 실제로 남아 있나 ----------
  coalesce(t.건수, 0)                                            as "거래건수",
  round(coalesce(t.손익합, 0))                                   as "거래손익_합계",
  round(coalesce(t.수수료합, 0))                                 as "수수료_합계",
  coalesce(t.오늘건수, 0)                                        as "오늘_거래건수",

  -- ---------- 앞뒤가 맞나 ----------
  -- 거래기록의 손익 합계와 계좌의 확정손익이 같아야 정상입니다.
  round(coalesce(t.손익합, 0) - ta.realized_pnl)                 as "차이_거래합계빼기계좌",

  case
    when coalesce(t.건수, 0) = 0 and ta.realized_pnl = 0
      then '✅ 정상 — 거래를 안 했고 손익도 0'
    when coalesce(t.건수, 0) > 0 and ta.realized_pnl = 0
      then '❌ 거래기록은 있는데 계좌 손익만 0 — 지워졌음'
    when abs(coalesce(t.손익합, 0) - ta.realized_pnl) > 1
      then '⚠ 거래합계와 계좌손익이 다름'
    else '✅ 앞뒤가 맞음'
  end                                                           as "판정",

  -- ---------- 시각 ----------
  (t.마지막거래 at time zone 'Asia/Seoul')                        as "마지막거래_한국시간",
  (ta.updated_at at time zone 'Asia/Seoul')                      as "계좌변경_한국시간",

  case
    when t.마지막거래 is null then '거래 없음'
    when ta.updated_at > t.마지막거래 + interval '1 minute'
      then '⚠ 거래 뒤에 계좌가 바뀜 — 초기화 의심'
    else '거래와 함께 갱신됨 — 정상'
  end                                                           as "초기화_흔적",

  -- ---------- 랭킹에 나오나 ----------
  case when ta.user_id is null
       then '❌ 계좌 없음 — 랭킹에서 빠짐'
       else '✅ 랭킹에 나옴' end                                  as "랭킹노출"

from public.profiles p
left join public.trading_accounts ta
       on ta.user_id = p.id
left join (
  select
    x.user_id,
    count(*)                     as 건수,
    sum(x.pnl)                   as 손익합,
    sum(x.fee)                   as 수수료합,
    max(x.created_at)            as 마지막거래,
    count(*) filter (
      where (x.created_at at time zone 'Asia/Seoul')::date
          = (now() at time zone 'Asia/Seoul')::date
    )                            as 오늘건수
  from public.trades x
  group by x.user_id
) t on t.user_id = p.id
order by coalesce(t.건수, 0) desc, p.nickname;
