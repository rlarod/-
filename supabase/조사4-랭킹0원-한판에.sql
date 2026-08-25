-- ============================================================================
--
--   ★★★  읽기만 합니다. 아무것도 바뀌지 않습니다.  ★★★
--
--   이 파일은 명령이 "딱 한 개" 입니다.
--   그래서 Run 을 한 번 누르면 결과가 한 표에 전부 나옵니다.
--
--   (앞서 드린 조사3 은 명령이 6개라 Supabase 가 마지막 것만 보여줬습니다.
--    제 실수입니다. 이 파일을 쓰시면 됩니다.)
--
--   통째로 복사 → SQL Editor 에 붙여넣기 → Run → 결과 캡처
--
-- ============================================================================

select * from (

  -- ── 1. 회원별 실제 값 (가장 중요) ────────────────────────────────────────
  select
    1                                                as 순서,
    '① 회원'                                          as 구분,
    p.nickname                                        as 항목,
    concat(
      '지갑 ',            round(ta.balance)::text,
      ' / 시작돈 ',       round(ta.initial_balance)::text,
      ' / 확정손익 ',     round(ta.realized_pnl)::text,
      ' / 사이클 ',       coalesce(ta.cycle_no,1)::text
    )                                                 as 값,
    concat(
      '전체거래 ',
      (select count(*) from public.trades t where t.user_id = p.id)::text,
      '건 / 이번사이클 ',
      (select count(*) from public.trades t
         where t.user_id = p.id
           and coalesce(t.cycle_no,1) = coalesce(ta.cycle_no,1))::text,
      '건 / 거래손익합 ',
      coalesce((select round(sum(t.pnl))::text from public.trades t
                  where t.user_id = p.id), '없음'),
      ' / 마지막변경 ',
      to_char(ta.updated_at at time zone 'Asia/Seoul', 'MM-DD HH24:MI')
    )                                                 as 참고
  from public.profiles p
  join public.trading_accounts ta on ta.user_id = p.id

  union all

  -- ── 2. 랭킹 함수가 어느 버전인가 ──────────────────────────────────────────
  select
    2,
    '② 랭킹함수',
    p.proname,
    case
      when pg_get_functiondef(p.oid) ilike '%least(0%'
        or pg_get_functiondef(p.oid) ilike '%running%'    then '바닥치기 방식 → 0은 정상일 수 있음'
      when pg_get_functiondef(p.oid) ilike '%greatest(0%' then '0이하 잘라내기 → 0은 정상일 수 있음'
      else                                                     '날것 realized_pnl → 0이면 진짜 0'
    end,
    concat('길이 ', length(pg_get_functiondef(p.oid))::text, '자')
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_leaderboard'

  union all

  -- ── 3. 지갑 고정 트리거가 고친 쪽인가 ─────────────────────────────────────
  select
    3,
    '③ 지갑트리거',
    p.proname,
    case
      when pg_get_functiondef(p.oid) ilike '%if exists%trading_accounts%'
        then 'OK 고친 쪽 (기존 계정 안 건드림)'
      else 'X 고장난 쪽 — 지갑초기화-해결.sql 필요'
    end,
    ''
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('force_starting_balance','set_starting_balance')

  union all

  -- ── 4. 랭킹이 쓰는 뷰·표가 있는가 ─────────────────────────────────────────
  select
    4,
    '④ 존재확인',
    v.이름,
    case when to_regclass(v.이름) is null then 'X 없음' else 'OK 있음' end,
    ''
  from (values
    ('public.ranking_profit'),
    ('public.leaderboard'),
    ('public.trading_cycles'),
    ('public.trades')
  ) as v(이름)

  union all

  -- ── 5. 거래 기록 요약 (전체) ──────────────────────────────────────────────
  select
    5,
    '⑤ 거래전체',
    '모든 회원 합계',
    concat('총 ', count(*)::text, '건'),
    concat(
      '가장 오래된 ', coalesce(to_char(min(t.created_at) at time zone 'Asia/Seoul','MM-DD HH24:MI'),'없음'),
      ' / 가장 최근 ', coalesce(to_char(max(t.created_at) at time zone 'Asia/Seoul','MM-DD HH24:MI'),'없음')
    )
  from public.trades t

) as 결과
order by 순서, 항목;


-- ============================================================================
--
--   ① 회원 줄만 보면 됩니다 — 김갱 줄을 찾으세요
--
--   ┌──────────────────────────────────────┬─────────────────────────────────┐
--   │ 전체거래 7건 · 이번사이클 7건         │ OK 랭킹은 정상. 진짜 다 잃은 것  │
--   │ 확정손익 이 -147,053 근처            │    (지갑만 따로 보면 됨)         │
--   ├──────────────────────────────────────┼─────────────────────────────────┤
--   │ 전체거래 7건 · 이번사이클 0건         │ X  계좌 초기화가 눌렸음          │
--   ├──────────────────────────────────────┼─────────────────────────────────┤
--   │ 전체거래 0건                         │ X  거래가 서버에 아예 없음        │
--   ├──────────────────────────────────────┼─────────────────────────────────┤
--   │ 전체거래 7건 · 확정손익 0            │ X  브라우저 빈 값이 서버를 덮음   │
--   └──────────────────────────────────────┴─────────────────────────────────┘
--
--   ③ 줄에 X 가 나오면, 위와 별개로 지갑 고정 버그가 살아 있는 것입니다.
--
-- ============================================================================
