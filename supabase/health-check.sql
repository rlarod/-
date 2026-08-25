-- =========================================================================
-- health-check.sql — 오픈 전 서버 점검
-- =========================================================================
-- 아무것도 바꾸지 않습니다. 읽기만 합니다.
-- Supabase SQL Editor 에 붙여넣고 실행한 뒤 결과를 캡처해 주세요.
--
-- 왜 필요한가
--   같은 함수가 여러 SQL 파일에 정의돼 있습니다. 예를 들어 get_leaderboard
--   는 파일 4개에, reset_season 은 3개에 들어 있습니다. 어느 파일을
--   마지막에 실행했느냐에 따라 서버 동작이 달라집니다.
--   파일을 보는 것만으로는 서버의 실제 상태를 알 수 없어서, 서버에
--   직접 물어봅니다.
--
-- 결과는 전부 O / X 로 나옵니다. X 가 있으면 그 SQL 을 다시 실행하면 됩니다.
--
-- ── 2026-08-25 안내 파일명 정정 ───────────────────────────────────────────
--   ①②(랭킹) 의 안내가 schema-leaderboard-fix.sql 로 되어 있었습니다.
--   그 파일은 옛 계산식입니다. 랭킹 뷰(leaderboard)의 정본은
--   schema-leaderboard-floor.sql 입니다.
--
--     옛것 schema-leaderboard-fix.sql   : greatest(0, realized_pnl)
--                                         — 잃은 사람은 새로 벌어도 계속 0%
--     정본 schema-leaderboard-floor.sql : 누적 = max(0, 누적 + 이번손익)
--                                         — 0 이 바닥, 그다음 번 것은 바로 반영
--
--   옛 안내를 그대로 따라 fix 를 실행하면 leaderboard 뷰가 통째로 덮여
--   랭킹이 옛 계산식으로 되돌아갑니다. 그래서 안내를 정본으로 바꿨습니다.
--   랭킹 관련으로 X 가 나오면 schema-leaderboard-floor.sql 만 실행하세요.
--   schema-leaderboard-fix.sql 은 실행하지 마세요.
-- =========================================================================

select '① 랭킹 — 손실을 0%로 끊는가' as 항목,
       case when exists (
         select 1 from pg_views
         where schemaname = 'public' and viewname = 'leaderboard'
           and definition like '%GREATEST%'
       ) then 'O' else 'X — schema-leaderboard-floor.sql 실행 필요' end as 결과

union all
select '② 랭킹 — 총자산이 기준자본+수익인가',
       case when exists (
         select 1 from pg_views
         where schemaname = 'public' and viewname = 'leaderboard'
           and definition like '%initial_balance +%'
       ) then 'O' else 'X — schema-leaderboard-floor.sql 실행 필요' end

union all
select '③ 계급 — 자산 기준 함수가 있는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'rank_points'
       ) then 'O' else 'X — schema-rank-assets.sql 실행 필요' end

union all
select '④ 매매 사이클 — 계정에 사이클 번호가 있는가',
       case when exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'trading_accounts'
           and column_name = 'cycle_no'
       ) then 'O' else 'X — schema-trading-cycle.sql 실행 필요' end

union all
select '⑤ 매매 사이클 — 관리자 계좌 초기화가 있는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'reset_trading_cycle'
       ) then 'O' else 'X — schema-trading-cycle.sql 실행 필요' end

union all
select '⑥ 거래 중복 — 같은 거래가 두 번 못 들어오는가',
       case when exists (
         select 1 from pg_indexes
         where schemaname = 'public' and indexname = 'idx_trades_user_time'
       ) then 'O' else 'X — schema-trades-dedupe.sql 실행 필요' end

union all
select '⑦ 거래 중복 — 지금 남아 있는 중복',
       (select case when count(*) - count(distinct (user_id, created_at)) = 0
                    then 'O (없음)'
                    else 'X ' || (count(*) - count(distinct (user_id, created_at)))::text || '건 — schema-trades-dedupe.sql 실행 필요' end
        from public.trades)

union all
select '⑧ 채팅 — 관리자 잠금 기능이 있는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'set_chat_locked'
       ) then 'O' else 'X — schema-admin-chat.sql 실행 필요' end

union all
select '⑨ 채팅 — 거래 알림이 도배 제한에서 빠지는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'check_chat_message'
           and pg_get_functiondef(p.oid) like '%trade_event%'
       ) then 'O' else 'X — schema-chat-event-exempt.sql 실행 필요(익절 알림이 막힙니다)' end

union all
select '⑩ 마켓 — 효과 없는 상품이 판매 중지됐는가',
       (select case when count(*) = 0 then 'O'
                    else 'X ' || count(*)::text || '개 판매중 — schema-market-pause-unbuilt.sql 실행 필요' end
        from public.tl_market_products
        where status = 'active'
          and item_type in ('position_peek','account_reset','seed_recharge','fee_discount','liquidation_guard'))

union all
select '⑪ 초기자산 — 신규 회원이 100,000으로 시작하는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'starting_balance'
       ) then 'O' else 'X — schema-initial-balance.sql 실행 필요' end

union all
select '⑫ 무료 충전 — 하루 2회 지급 기능이 있는가',
       case when exists (
         select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'claim_daily_recharge'
       ) then 'O' else 'X — schema-daily-recharge.sql 실행 필요' end

union all
select '⑬ 개인정보 — 별도 표에 저장되는가',
       case when exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'customer_private_info'
       ) then 'O' else 'X — schema-private-info.sql 실행 필요' end

union all
select '⑭ 관리자 — 내 계정이 관리자로 등록됐는가',
       case when exists (select 1 from public.admin_users)
       then 'O (' || (select count(*) from public.admin_users)::text || '명)'
       else 'X — admin_users 에 등록 필요' end

union all
select '⑮ 회원 수',
       (select count(*)::text || '명' from public.profiles);
