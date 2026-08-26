-- ============================================================================
--
--   ★★★  읽기만 합니다. 아무것도 바뀌지 않습니다.  ★★★
--
--   TL 실시간 지급이 지금 서버에 얼마나 올라가 있는지 봅니다.
--   더하거나 지우거나 바꾸는 문장이 한 줄도 없습니다. 전부 "보기" 뿐입니다.
--
--   ── 대표님이 하실 일 ──────────────────────────────────────────────────
--   1. 이 파일을 통째로 복사 → SQL Editor 에 붙여넣기 → Run
--   2. 나오는 표를 캡처해서 보내 주세요
--
--   명령이 "딱 한 개" 라서 Run 한 번에 결과가 한 표에 전부 나옵니다.
--   (Supabase 는 명령이 여러 개면 마지막 것만 보여줍니다.)
--
--   ── 표 읽는 법 ────────────────────────────────────────────────────────
--   ① 한눈에        지금 어느 단계까지 올라갔는지 한 줄로
--   ② 함수          있어야 할 함수 12개가 있는지
--   ③ 트리거        거래가 저장될 때 TL 을 주는 장치가 걸렸는지
--   ④ 표 준비       TL 기록표(tl_transactions)가 준비됐는지
--   ⑤ TL 기록       지금까지 어떤 종류의 TL 이 몇 줄 들어 있는지
--   ⑥ 보유TL 계산   보유 TL 을 옛 방식으로 세는지 새 방식으로 세는지
--   ⑦ 실행 권한     회원·비회원이 TL 지급 함수를 부를 수 있는지
--   ⑧ 지금 이 창    SQL Editor 가 누구로 돌아가고 있는지
--   ⑨ 회원별        회원마다 TL 이 얼마인지
--
--   ── 혹시 오류가 나면 ──────────────────────────────────────────────────
--   "relation public.admin_users does not exist" 가 나오면
--     → supabase/schema-admin-patch.sql 을 먼저 Run 하셔야 합니다.
--   "relation public.tl_transactions does not exist" 가 나오면
--     → supabase/schema-tl-hotdeal.sql 을 먼저 Run 하셔야 합니다.
--   그 밖의 오류는 문장을 그대로 보내 주세요.
--
-- ============================================================================

select 구분, 항목, 값, 참고
from (

  -- ── ① 한눈에 — 지금 어느 단계인가 ─────────────────────────────────────
  select
    1                                                     as 순서,
    1                                                     as 하위,
    '① 한눈에'                                            as 구분,
    '지금 서버 상태'                                       as 항목,
    (case
       when to_regprocedure('public.tl_grant_diff(uuid,uuid)') is null
         then '❌ 아직 아무것도 안 올라갔습니다'
       when not exists (
              select 1
                from pg_trigger t
                join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public'
                 and c.relname = 'trades'
                 and t.tgname  = 'trg_tl_on_trade_insert')
         then '△ 함수는 있는데 실시간 트리거가 없습니다'
       when not exists (select 1 from public.tl_transactions x where x.type = 'realtime')
         then '△ 트리거까지 걸렸는데 밀린 것 채우기(7절)가 아직입니다'
       else '✅ 전부 적용돼 있습니다'
     end)::text                                           as 값,
    (case
       when to_regprocedure('public.tl_grant_diff(uuid,uuid)') is null
         then 'supabase/schema-tl-realtime.sql 을 통째로 복사해 Run 하세요'
       when not exists (
              select 1
                from pg_trigger t
                join pg_class c on c.oid = t.tgrelid
                join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public'
                 and c.relname = 'trades'
                 and t.tgname  = 'trg_tl_on_trade_insert')
         then 'supabase/schema-tl-realtime.sql 을 다시 Run 하세요'
       when not exists (select 1 from public.tl_transactions x where x.type = 'realtime')
         then 'supabase/schema-tl-realtime.sql 을 다시 Run 하세요 (7절·8절만 남았습니다)'
       else '더 하실 일이 없습니다'
     end)::text                                           as 참고

  union all

  -- ── ② 있어야 할 함수 ──────────────────────────────────────────────────
  select
    2,
    v.n,
    '② 함수',
    v.이름,
    (case when to_regprocedure('public.' || v.이름) is null
          then '❌ 없습니다' else '✅ 있습니다' end)::text,
    v.설명::text
  from (values
    ( 1, 'am_i_admin()',             '관리자인지 확인 — schema-admin-patch.sql'),
    ( 2, 'tl_total_profit(uuid)',    '누적 순수익 — 3절'),
    ( 3, 'tl_total_days(uuid)',      '거래한 날짜 수 — 3절'),
    ( 4, 'tl_total_amount(uuid)',    '받아야 할 총TL — 3절'),
    ( 5, 'tl_paid_total(uuid)',      '이미 받은 총TL — 3절'),
    ( 6, 'tl_grant_diff(uuid,uuid)', '차액 지급 — 4절 ★ 이것이 없으면 아무것도 안 올라간 것입니다'),
    ( 7, 'tl_earned(uuid)',          '획득 TL — 5절'),
    ( 8, 'tl_balance(uuid)',         '보유 TL — 5절'),
    ( 9, 'tl_balance_info()',        '화면에 보여 주는 TL — 5절'),
    (10, 'tl_on_trade_insert()',     '트리거가 부르는 함수 — 6절'),
    (11, 'tl_settle_all_past()',     '밀린 것 채우기 — 7절'),
    (12, 'tl_migrate_legacy()',      '보정 지급 — 8절')
  ) as v(n, 이름, 설명)

  union all

  -- ── ③ 트리거 ──────────────────────────────────────────────────────────
  select
    3,
    1,
    '③ 트리거',
    'trg_tl_on_trade_insert (거래가 저장될 때 TL 지급)',
    (case when exists (
            select 1
              from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public'
               and c.relname = 'trades'
               and t.tgname  = 'trg_tl_on_trade_insert')
          then '✅ 걸려 있습니다' else '❌ 없습니다' end)::text,
    coalesce((
      select pg_get_triggerdef(t.oid)
        from pg_trigger t
        join pg_class c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public'
         and c.relname = 'trades'
         and t.tgname  = 'trg_tl_on_trade_insert'), '(없음)')::text

  union all

  -- ── ④ TL 기록표가 준비됐는가 (2절) ────────────────────────────────────
  select
    4, 1, '④ 표 준비', 'tl_transactions 의 period 칸',
    (case when exists (
            select 1 from information_schema.columns c
             where c.table_schema = 'public'
               and c.table_name   = 'tl_transactions'
               and c.column_name  = 'period')
          then '✅ 있습니다' else '❌ 없습니다' end)::text,
    '2절에서 만듭니다'::text

  union all

  select
    4, 2, '④ 표 준비', 'type 에 realtime 을 허용하는가',
    (case when exists (
            select 1
              from pg_constraint con
              join pg_class cl on cl.oid = con.conrelid
              join pg_namespace ns on ns.oid = cl.relnamespace
             where ns.nspname = 'public'
               and cl.relname = 'tl_transactions'
               and con.contype = 'c'
               and pg_get_constraintdef(con.oid) like '%realtime%')
          then '✅ 허용됩니다' else '❌ 아직입니다' end)::text,
    '2절에서 바꿉니다. 이것이 ❌ 면 실시간 지급이 저장되지 않습니다'::text

  union all

  select
    4, 2 + w.n, '④ 표 준비', w.이름,
    (case when to_regclass('public.' || w.이름) is null
          then '❌ 없습니다' else '✅ 있습니다' end)::text,
    w.설명::text
  from (values
    (1, 'uq_tl_tx_migration_once', '보정 지급은 회원당 평생 1번만 — 서버가 막습니다'),
    (2, 'uq_tl_tx_monthly_once',   '옛 월정산 중복 방지'),
    (3, 'idx_tl_tx_user_type',     '조회를 빠르게 하는 것 (없어도 동작은 합니다)')
  ) as w(n, 이름, 설명)

  union all

  -- ── ⑤ 지금 들어 있는 TL 기록 ──────────────────────────────────────────
  select
    5,
    1,
    '⑤ TL 기록',
    coalesce(x.type, '(전체 합계)'),
    (count(*)::text || '줄')::text,
    ('TL 합계 ' || round(coalesce(sum(x.amount), 0))::text)::text
  from public.tl_transactions x
  group by rollup (x.type)

  union all

  -- ── ⑥ 보유 TL 을 무엇으로 세고 있나 ───────────────────────────────────
  select
    6, 1, '⑥ 보유TL 계산', 'tl_earned()',
    coalesce((
      select case when pg_get_functiondef(p.oid) like '%public.trades%'
                  then '⚠ 옛 방식입니다'
                  else '✅ 새 방식입니다' end
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'tl_earned'
       limit 1), '❌ tl_earned 함수가 없습니다')::text,
    coalesce((
      select case when pg_get_functiondef(p.oid) like '%public.trades%'
                  then '거래 건수를 셉니다 — 계좌를 초기화하면 TL 이 같이 사라집니다'
                  else '지급 기록만 더합니다 — 계좌를 초기화해도 TL 이 남습니다' end
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'tl_earned'
       limit 1), 'schema-tl-realtime.sql 을 Run 하면 만들어집니다')::text

  union all

  -- ── ⑦ 누가 TL 지급 함수를 부를 수 있나 ────────────────────────────────
  select
    7,
    1,
    '⑦ 실행 권한',
    (p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')')::text,
    (case when has_function_privilege('anon', p.oid, 'execute')
          then '⚠ 로그인 안 한 사람도 부를 수 있음'
          else '✅ 로그인 안 한 사람은 막힘' end)::text,
    (case when has_function_privilege('authenticated', p.oid, 'execute')
          then '회원은 부를 수 있음'
          else '회원도 막힘' end)::text
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('tl_grant_diff', 'tl_settle_all_past', 'tl_migrate_legacy', 'tl_balance_info')

  union all

  -- ── ⑧ 지금 이 창(SQL Editor)은 누구인가 ───────────────────────────────
  select
    8, 1, '⑧ 지금 이 창', '접속 계정 / 지금 역할',
    (session_user || ' / ' || current_user)::text,
    '이 창은 화면에 로그인한 회원이 아니라 서버 자신으로 돌아갑니다'::text

  union all

  select
    8, 2, '⑧ 지금 이 창', '로그인한 회원 (auth.uid)',
    coalesce(auth.uid()::text, '(비어 있음)')::text,
    '비어 있는 것이 정상입니다. 그래서 관리자 확인이 항상 실패했습니다'::text

  union all

  select
    8, 3, '⑧ 지금 이 창', '관리자 명단(admin_users) 인원',
    ((select count(*) from public.admin_users)::text || '명')::text,
    (case when (select count(*) from public.admin_users) = 0
          then '⚠ 비어 있으면 7절·8절을 돌릴 수 없습니다 — schema-admin-patch.sql 을 먼저 Run 하세요'
          else '✅ 이 명단에 있는 한 명의 자격으로 7절·8절이 실행됩니다' end)::text

  union all

  -- ── ⑨ 회원별 TL ───────────────────────────────────────────────────────
  select
    9,
    1,
    '⑨ 회원별',
    p.nickname::text,
    ('획득 ' ||
       round(coalesce((select sum(x.amount) from public.tl_transactions x
                        where x.user_id = p.id and x.amount > 0), 0))::text
     || ' / 사용 ' ||
       round(coalesce((select -sum(x.amount) from public.tl_transactions x
                        where x.user_id = p.id and x.amount < 0), 0))::text)::text,
    ('거래 ' || (select count(*) from public.trades t where t.user_id = p.id)::text || '건'
     || ' / TL기록 ' || (select count(*) from public.tl_transactions x where x.user_id = p.id)::text || '줄')::text
  from public.profiles p

) as 결과
order by 결과.순서, 결과.하위, 결과.항목;

-- ============================================================================
--
--   결과를 이렇게 읽습니다
--
--   · ① 이 '❌ 아직 아무것도 안 올라갔습니다' 면
--     → supabase/schema-tl-realtime.sql 을 통째로 복사해 Run 한 번 하시면 됩니다.
--
--   · ⑧ 의 '로그인한 회원' 이 (비어 있음) 인 것은 고장이 아닙니다.
--     SQL Editor 는 원래 그렇습니다. 그래서 7절·8절이 not_admin 으로 막혔던 것이고,
--     고친 schema-tl-realtime.sql 은 그 자리를 다르게 처리합니다.
--
--   · ⑧ 의 '관리자 명단 인원' 이 0명이면 7절·8절을 돌릴 수 없습니다.
--     그때는 supabase/schema-admin-patch.sql 을 먼저 Run 하세요.
--
--   · ⑦ 에서 tl_grant_diff 가 '⚠ 로그인 안 한 사람도 부를 수 있음' 으로 나오면
--     그것은 문제입니다. 본부장에게 알려 주세요.
--     (tl_settle_all_past · tl_migrate_legacy 는 부를 수는 있어도
--      맨 앞에서 관리자인지 확인하고 막으므로 실제로는 아무 일도 못 합니다.)
--
-- ============================================================================
