-- ══════════════════════════════════════════════════════════════════════
--
--   ██  이 파일은 읽기만 합니다. 아무것도 바뀌지 않습니다.  ██
--
--   회원 데이터·거래기록·랭킹 — 어느 것도 건드리지 않습니다.
--   CREATE / UPDATE / DELETE / DROP 이 한 줄도 없습니다.
--   몇 번을 눌러도 안전합니다.
--
-- ══════════════════════════════════════════════════════════════════════
--
--   무엇을 보는 파일인가요?
--
--   같은 이름의 함수가 파일마다 여러 벌 있습니다.
--   (get_leaderboard 4벌, leaderboard 뷰 5벌 …)
--   파일만 봐서는 "서버에 지금 어느 것이 들어 있는지" 알 수 없습니다.
--   이 파일은 그걸 서버에 직접 물어봅니다.
--
--   ▶ 하는 법
--     1. 아래 전체를 복사해 SQL Editor 에 붙여넣고 Run 을 한 번 누릅니다
--     2. 나오는 표를 통째로 캡처해서 보내주시면 됩니다
--     3. 표는 위에서부터 A → B → C … 순서로 읽으면 됩니다
--
--   ▶ 가장 중요한 줄
--     "C. 진단" 칸을 먼저 보세요. 랭킹이 전원 0원인 이유가 여기 나옵니다.
--     그다음 "F. 실측값" 의 ★ 표시 줄 세 개를 보시면 됩니다.
--
-- ══════════════════════════════════════════════════════════════════════

with chk as (
  select
    (to_regclass('public.ranking_profit') is not null)            as has_rp,
    (to_regclass('public.leaderboard')    is not null)            as has_lb,
    exists(select 1 from information_schema.columns
           where table_schema='public' and table_name='trades'
             and column_name='cycle_no')                          as trades_cycle,
    exists(select 1 from information_schema.columns
           where table_schema='public' and table_name='trading_accounts'
             and column_name='cycle_no')                          as ta_cycle,
    exists(select 1 from information_schema.columns
           where table_schema='public' and table_name='leaderboard'
             and column_name='profit_amount')                     as lb_profit,
    exists(select 1 from information_schema.columns
           where table_schema='public' and table_name='leaderboard'
             and column_name='total_asset')                       as lb_asset
),

-- ── 랭킹 함수가 화면에 실제로 내려주는 칸 이름들 ──────────────────────
fn_cols as (
  select p.oid,
         p.proname,
         coalesce(
           (select string_agg(u.nm, ', ' order by u.i)
            from unnest(p.proargnames) with ordinality as u(nm, i)
            where p.proargmodes is null
               or p.proargmodes[u.i] in ('t','o')),
           '(칸 이름 없음)') as cols
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('get_leaderboard','get_my_rank')
),

-- ── 서버에 직접 물어보는 실측 항목들 (전부 select 뿐입니다) ───────────
probe(순서, 항목, 쿼리) as (
  select 610, '회원 수 (trading_accounts)',
         'select count(*) as v from public.trading_accounts' from chk
  union all
  select 620, '전체 거래 건수 (trades)',
         'select count(*) as v from public.trades' from chk
  union all
  select 630, '랭킹에 잡히는 거래 건수 (사이클 일치)',
         case when c.trades_cycle and c.ta_cycle then
           'select count(*) as v from public.trades t join public.trading_accounts ta on ta.user_id = t.user_id where coalesce(t.cycle_no,1) = coalesce(ta.cycle_no,1)'
         else 'select ''cycle_no 칸이 없어 확인 불가''::text as v' end
    from chk c
  union all
  select 640, '랭킹에서 빠지는 거래 건수 (사이클 불일치) ★',
         case when c.trades_cycle and c.ta_cycle then
           'select count(*) as v from public.trades t join public.trading_accounts ta on ta.user_id = t.user_id where coalesce(t.cycle_no,1) <> coalesce(ta.cycle_no,1)'
         else 'select ''cycle_no 칸이 없어 확인 불가''::text as v' end
    from chk c
  union all
  select 650, 'ranking_profit 뷰가 내놓는 사람 수',
         case when c.has_rp then
           'select count(*) as v from public.ranking_profit'
         else 'select ''뷰 없음 (schema-leaderboard-floor.sql 미실행)''::text as v' end
    from chk c
  union all
  select 660, 'ranking_profit 이 0원이 아닌 사람 수 ★',
         case when c.has_rp then
           'select count(*) as v from public.ranking_profit where coalesce(ranking_profit,0) <> 0'
         else 'select ''뷰 없음''::text as v' end
    from chk c
  union all
  select 670, 'leaderboard 뷰에서 수익금이 0이 아닌 사람 수 ★',
         case when c.has_lb and c.lb_profit then
           'select count(*) as v from public.leaderboard where coalesce(profit_amount,0) <> 0'
         when c.has_lb then
           'select ''뷰에 profit_amount 칸 자체가 없음''::text as v'
         else 'select ''leaderboard 뷰 없음''::text as v' end
    from chk c
),

행 as (

-- ══════ A. 서버에 살아 있는 랭킹 함수 ══════════════════════════════════
select 100 as 순서, 'A. 살아있는 함수' as 구분,
       (f.proname || ' (내부번호 ' || f.oid::text || ')')::text as 항목,
       ('내려주는 칸: ' || f.cols)::text as 값,
       '내부번호가 클수록 나중에 만들어진 것입니다'::text as 비고
from fn_cols f

union all
select 110, 'A. 살아있는 함수',
       '⚠ get_leaderboard 가 서버에 없습니다', '랭킹이 아예 안 나옵니다',
       'schema-leaderboard-floor.sql 을 실행하세요'
where not exists (select 1 from fn_cols where proname = 'get_leaderboard')

-- ══════ B. leaderboard 뷰가 실제로 가진 칸 ═══════════════════════════
union all
select 200 + a.attnum, 'B. leaderboard 뷰의 칸',
       a.attnum::text || '. ' || a.attname,
       format_type(a.atttypid, a.atttypmod),
       ''
from pg_attribute a
where a.attrelid = to_regclass('public.leaderboard')
  and a.attnum > 0 and not a.attisdropped

union all
select 210, 'B. leaderboard 뷰의 칸',
       '⚠ leaderboard 뷰가 없습니다', '랭킹이 아예 안 나옵니다',
       'schema-leaderboard-floor.sql 을 실행하세요'
from chk c where not c.has_lb

-- ══════ C. 진단 — 여기를 먼저 보세요 ═════════════════════════════════
union all
select 300, 'C. 진단 ★',
       '서버에 들어있는 랭킹 버전',
       case
         when not c.has_lb then '없음 — 랭킹 뷰 자체가 없습니다'
         when c.has_rp and c.lb_profit
           then '최신 (schema-leaderboard-floor.sql) — 맞는 버전입니다'
         when c.lb_profit or c.lb_asset
           then '중간 버전 (schema-leaderboard-fix.sql 또는 schema-ranking-fix.sql)'
         else '옛날 버전 (schema.sql / schema-leaderboard-patch.sql)'
       end,
       case
         when c.has_rp and c.lb_profit then 'OK'
         else '⚠ 최신이 아닙니다'
       end
from chk c

union all
select 310, 'C. 진단 ★',
       '화면이 요구하는 칸(total_asset, profit_amount)을 함수가 내려주는가',
       case
         when exists (select 1 from fn_cols
                      where proname = 'get_leaderboard'
                        and cols like '%profit_amount%'
                        and cols like '%total_asset%')
           then '예 — 내려줍니다'
         else '아니오 ★ 이러면 랭킹 표가 오류 없이 전부 - (하이픈) 으로 보입니다'
       end,
       '화면은 이 두 칸을 그대로 표시만 합니다. 0원으로 보인다면 칸은 있고 값이 0인 것입니다'

union all
select 320, 'C. 진단 ★',
       'get_leaderboard 가 몇 벌 살아있는가',
       (select count(*)::text from fn_cols where proname = 'get_leaderboard') || ' 벌',
       'Postgres 는 같은 이름이라도 인자가 다르면 따로 보관합니다. 2벌 이상이면 위험'

union all
select 330, 'C. 진단 ★',
       '거래는 있는데 랭킹 집계에서 전부 빠지고 있는가',
       case
         when not (c.trades_cycle and c.ta_cycle) then '확인 불가 (cycle_no 칸 없음)'
         else '아래 F 의 사이클 불일치 건수를 보세요'
       end,
       '사이클 일치가 0 이고 불일치가 크면 → 번호가 어긋나 전원 0원이 됩니다'
from chk c

-- ══════ D. 중복 후보 함수들이 서버에 몇 벌씩 있는가 ═══════════════════
union all
select 400, 'D. 중복 개수',
       p.proname,
       count(*)::text || ' 벌',
       case when count(*) > 1 then '⚠ 중복' else 'OK' end
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('get_leaderboard','get_my_rank','reset_season',
                    'rank_points_all','rank_points','tl_balance_info',
                    'tl_earned','tl_balance','check_chat_message',
                    'force_starting_balance','claim_daily_recharge')
group by p.proname

-- ══════ E. 랭킹 관련 뷰/테이블이 있는지 ══════════════════════════════
union all
select 500, 'E. 뷰·테이블 존재',
       t.nm,
       case when to_regclass('public.' || t.nm) is null then '없음' else '있음' end,
       ''
from (values ('leaderboard'),('ranking_profit'),('trading_accounts'),
             ('trades'),('profiles'),('trading_cycles'),('user_rank_points'))
     as t(nm)

-- ══════ F. 실측값 ════════════════════════════════════════════════════
union all
select pr.순서, 'F. 실측값', pr.항목,
       coalesce((xpath('//v/text()', x))[1]::text, '(값 없음)'),
       ''
from probe pr,
     lateral query_to_xml(pr.쿼리, false, true, '') as x

-- ══════ G. 트리거로 실제 붙어있는 함수 ═══════════════════════════════
union all
select 700, 'G. 실제로 붙어있는 트리거',
       tg.tgname,
       p.proname || ' (내부번호 ' || p.oid::text || ')',
       cl.relname::text
from pg_trigger tg
join pg_proc p   on p.oid = tg.tgfoid
join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace n on n.oid = cl.relnamespace
where not tg.tgisinternal and n.nspname = 'public'
  and p.proname in ('check_chat_message','force_starting_balance',
                    'skip_duplicate_trade','set_trade_cycle','tl_on_trade_insert')
)

select 구분 as "구분", 항목 as "항목", 값 as "값", 비고 as "비고"
from 행
order by 순서, 항목;

-- ══════════════════════════════════════════════════════════════════════
--   다시 한 번 — 이 파일은 아무것도 바꾸지 않았습니다.
--   결과 표를 캡처해서 보내주세요.
-- ══════════════════════════════════════════════════════════════════════
