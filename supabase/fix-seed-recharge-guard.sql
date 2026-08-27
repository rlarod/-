-- =========================================================================
-- fix-seed-recharge-guard.sql
--   시드 충전권(seed_recharge) 두 가지를 고칩니다.
--     (1) 포지션을 들고 있어도 지갑이 늘어나던 것을 막습니다
--     (2) 충전받은 돈을 recharge_total 에 쌓아 계급이 부풀지 않게 합니다
-- =========================================================================
-- 이 파일이 use_user_item() 의 ★정본★ 입니다 (2026-08-27 부터).
--   supabase/schema-tl-market.sql 안에도 같은 함수가 있습니다.
--   같은 내용으로 맞춰 두었으므로 어느 쪽을 나중에 돌려도 결과가 같습니다.
--   앞으로 use_user_item() 을 고칠 때는 ★두 파일을 같이★ 고치세요.
--
-- 여러 번 돌려도 안전합니다 (idempotent).
--   · 함수는 create or replace  — 정의만 갈아끼웁니다
--   · 소급 보정은 recharge_total_backfill_log 에 기록을 남겨,
--     두 번째부터는 아무 일도 하지 않습니다
--   · DELETE / TRUNCATE / DROP TABLE 이 하나도 없습니다
--
-- =========================================================================
-- 무엇이 왜 문제였나
-- =========================================================================
-- (1) 포지션 보유 중 충전
--     지갑 초기화(schema-daily-recharge.sql) 와 재충전 이용권(account_reset)
--     에는 "포지션이 있으면 안 됨" 검사가 있는데, 시드 충전권에만 없었습니다.
--     포지션을 크게 잡아 청산 직전인 상태에서 지갑을 채우면
--     청산가·증거금 계산이 회원에게 유리하게 흔들립니다.
--     → 같은 방식(raise exception 'has_position')으로 맞춥니다.
--
-- (2) 계급 부풀림
--     계급용 자산 = 지갑 + 증거금 − recharge_total   (schema-rank-1000.sql)
--     계급 점수   = 1000 × log2(자산 / 초기자금)
--
--     시드 충전권 1장(300 TL)이 지갑에 100,000 을 넣는데 recharge_total 에는
--     안 쌓였습니다. 초기자금 100,000 기준으로 자산이 정확히 2배가 되므로
--     ★거래를 한 번도 안 하고 정확히 +1000점(상병)★ 이 됩니다.
--
--     2026-08-24 대표 결정 "충전받은 돈은 계급에서 뺀다" 가
--     지갑 초기화 경로에만 걸려 있고 TL 마켓 경로에 안 걸린 것입니다.
--     화면(js/rank.js:154-163)은 이미 이 규칙대로 돌고 있습니다.
--     → 서버를 화면에 맞춥니다.
--
-- 계급 공식(1000 × log2(자산/초기자금)) 은 한 글자도 안 건드립니다.
-- '자산' 에서 빼는 항목(recharge_total)에 빠져 있던 금액을 채우는 것뿐입니다.
--
-- =========================================================================
-- 기존 회원의 계급이 소급해서 내려갈 수 있습니다
-- =========================================================================
--   아래 [0] 과 [1] 은 ★읽기만★ 합니다. 아무것도 바뀌지 않습니다.
--   먼저 돌려서 "누가 몇 점에서 몇 점이 되는지" 를 확인하신 뒤,
--   괜찮으면 [2] 부터 그대로 이어서 Run 하시면 됩니다.
--
--   파일 전체를 한 번에 Run 해도 됩니다 — [0]·[1] 의 표가 먼저 나오고
--   그 아래에 반영 결과가 나옵니다.
--
-- =========================================================================
-- 되돌리는 방법은 맨 아래 [되돌리기] 절에 명령이 그대로 있습니다.
-- =========================================================================


-- =========================================================================
-- [준비] 실행 순서를 안 타게 만드는 한 줄
-- =========================================================================
-- 계급에서 빼는 '무상으로 받은 돈' 누계 칸입니다.
-- schema-daily-recharge.sql / schema-rank-1000.sql 에도 같은 줄이 있습니다.
-- 어느 파일을 먼저 돌려도 되게 여기에도 둡니다(이미 있으면 그냥 넘어갑니다).
alter table public.trading_accounts
  add column if not exists recharge_total numeric not null default 0;


-- =========================================================================
-- [0] 지금 상태 보기  (읽기 전용 — 아무것도 바뀌지 않습니다)
-- =========================================================================
-- 시드 충전권이 지금 팔리고 있는지 봅니다.
--   schema-market-pause-unbuilt.sql 을 돌린 적이 있으면 'paused' 일 수 있습니다.
--   paused 여도 ★이미 산 사람은 계속 쓸 수 있습니다★ (use_user_item 은 상태를
--   안 봅니다). 그래서 paused 여도 이 수리는 그대로 필요합니다.
select
  name         as 상품,
  item_type    as 효과종류,
  tl_price     as 가격_TL,
  effect_value as 충전액,
  max_purchase as 구매한도,
  status       as 판매상태
from public.tl_market_products
where item_type in ('seed_recharge', 'account_reset')
order by sort_order;


-- 지금까지 시드 충전권이 실제로 몇 번 쓰였는지.
select
  count(*)                                  as 사용_건수,
  count(distinct user_id)                   as 사용한_회원수,
  coalesce(sum(coalesce(effect_value, 0)), 0) as 지급된_총액_USDT
from public.item_usage_logs
where item_type = 'seed_recharge';


-- =========================================================================
-- [1] 계급이 어떻게 바뀌는지 미리 보기  (읽기 전용 — 아무것도 바뀌지 않습니다)
-- =========================================================================
-- 아래 표에 나오는 사람만 계급이 내려갑니다. 표가 비어 있으면
-- 시드 충전권을 쓴 사람이 아직 없다는 뜻이고, 계급은 아무도 안 바뀝니다.
--
-- 점수 계산은 schema-rank-1000.sql 의 rank_points() 와 같은 식입니다.
--   자산 = max(0, 지갑 + 포지션증거금 + 미체결증거금 − recharge_total)
--   점수 = max(0, 1000 × log2(자산 / 초기자금))       (자산·초기자금 > 0 일 때)
--
-- ※ 이 표를 만들려면 [2] 의 기록표가 있어야 합니다. 없어도 오류가 안 나게
--   여기서 먼저 만들어 둡니다(빈 표를 만들 뿐 아무 값도 안 바꿉니다).
-- ※ 일부러 auth.users 를 참조(FK)하지 않습니다.
--   이 표는 회원 데이터가 아니라 ★관리용 감사 기록★ 입니다.
--   "우리가 누구의 recharge_total 을 얼마에서 얼마로 바꿨다" 는 기록이라,
--   회원이 탈퇴해도 남아 있어야 되돌리기와 대조가 가능합니다.
--   FK 를 걸면 탈퇴와 함께 사라져서 감사 기록의 뜻이 없어집니다.
--   (남는 것은 uuid 한 개뿐이라 개인정보가 아닙니다)
create table if not exists public.recharge_total_backfill_log (
  user_id               uuid primary key,
  reason                text        not null default 'seed_recharge',
  amount                numeric     not null,
  recharge_total_before numeric     not null,
  recharge_total_after  numeric     not null,
  done_at               timestamptz not null default now()
);

with 보정할_금액 as (
  select l.user_id,
         sum(coalesce(l.effect_value, 0)) as 더할금액
    from public.item_usage_logs l
   where l.item_type = 'seed_recharge'
     and not exists (select 1 from public.recharge_total_backfill_log b
                      where b.user_id = l.user_id)
   group by l.user_id
),
계정 as (
  select ta.user_id,
         coalesce(ta.initial_balance, 0) as 초기자금,
         coalesce(ta.recharge_total, 0)  as 지금_충전누계,
           coalesce(ta.balance, 0)
         + coalesce((select sum(ps.margin) from public.positions ps
                      where ps.user_id = ta.user_id), 0)
         + coalesce((select sum(o.margin) from public.orders o
                      where o.user_id = ta.user_id and o.status = 'OPEN'), 0)
           as 지갑_더_증거금
    from public.trading_accounts ta
)
미리보기 as (
  select
    coalesce(p.nickname, '(이름없음)')                                  as 회원,
    round(c.초기자금)                                                   as 초기자금,
    round(c.지갑_더_증거금)                                             as 지갑_더_증거금,
    round(c.지금_충전누계)                                              as 충전누계_전,
    round(c.지금_충전누계 + m.더할금액)                                 as 충전누계_후,
    round(greatest(0, c.지갑_더_증거금 - c.지금_충전누계))              as 계급자산_전,
    round(greatest(0, c.지갑_더_증거금 - c.지금_충전누계 - m.더할금액)) as 계급자산_후,
    round(case
            when c.초기자금 > 0
             and greatest(0, c.지갑_더_증거금 - c.지금_충전누계) > 0
            then greatest(0, log(2, greatest(0, c.지갑_더_증거금 - c.지금_충전누계) / c.초기자금) * 1000)
            else 0 end)                                                 as 계급점수_전,
    round(case
            when c.초기자금 > 0
             and greatest(0, c.지갑_더_증거금 - c.지금_충전누계 - m.더할금액) > 0
            then greatest(0, log(2, greatest(0, c.지갑_더_증거금 - c.지금_충전누계 - m.더할금액) / c.초기자금) * 1000)
            else 0 end)                                                 as 계급점수_후
  from 보정할_금액 m
  join 계정 c on c.user_id = m.user_id
  left join public.profiles p on p.id = m.user_id
)
select
  회원, 초기자금, 지갑_더_증거금,
  충전누계_전, 충전누계_후,
  계급자산_전, 계급자산_후,
  계급점수_전, 계급점수_후,
  (계급점수_전 - 계급점수_후) as 내려가는_점수
from 미리보기
-- 내림폭이 큰 사람부터 보여줍니다.
order by 내려가는_점수 desc;


-- =========================================================================
-- [2] 백업표  (여기서부터 실제로 바뀝니다)
-- =========================================================================
-- 소급 보정을 누구에게 얼마나 했는지 남깁니다.
--   · 되돌릴 때 이 표를 그대로 씁니다
--   · 이 표에 이미 있는 회원은 [3] 이 건너뜁니다 → 몇 번 돌려도 안전
-- (표 자체는 위 [1] 에서 이미 만들어졌습니다. 여기서는 보호만 켭니다.)
alter table public.recharge_total_backfill_log enable row level security;
-- 회원 화면은 이 표를 볼 일이 없습니다. 관리용이라 정책을 열지 않습니다
-- (security definer 함수와 SQL 편집기는 그대로 읽고 씁니다).


-- =========================================================================
-- [3] 지난 시드 충전분을 recharge_total 에 채워 넣기 (1회, 재실행 안전)
-- =========================================================================
-- item_usage_logs 에 남아 있는 seed_recharge 기록이 근거입니다.
--   ★추정이 하나도 없습니다★ — 쓴 시각과 금액이 그대로 기록돼 있습니다.
with 보정할_금액 as (
  select l.user_id,
         sum(coalesce(l.effect_value, 0)) as 더할금액
    from public.item_usage_logs l
   where l.item_type = 'seed_recharge'
     and not exists (select 1 from public.recharge_total_backfill_log b
                      where b.user_id = l.user_id)
   group by l.user_id
  having sum(coalesce(l.effect_value, 0)) > 0
),
바꾸기 as (
  update public.trading_accounts ta
     set recharge_total = coalesce(ta.recharge_total, 0) + m.더할금액,
         updated_at = now()
    from 보정할_금액 m
   where ta.user_id = m.user_id
  returning ta.user_id,
            m.더할금액                                    as 더할금액,
            coalesce(ta.recharge_total, 0) - m.더할금액   as 전,
            coalesce(ta.recharge_total, 0)                as 후
)
insert into public.recharge_total_backfill_log
  (user_id, reason, amount, recharge_total_before, recharge_total_after)
select user_id, 'seed_recharge', 더할금액, 전, 후 from 바꾸기
on conflict (user_id) do nothing;


-- =========================================================================
-- [4] use_user_item() 교체 — (1)·(2) 를 같이 고칩니다
-- =========================================================================
-- ★ schema-tl-market.sql 의 같은 함수와 내용이 동일합니다.
--   한쪽만 고치면 나중에 다른 쪽을 돌렸을 때 수리가 되돌아갑니다.
create or replace function public.use_user_item(p_product_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  it public.user_items%rowtype;
  exp timestamptz;
  new_balance numeric;
  start_bal numeric;
  eff jsonb := '{}'::jsonb;
  added numeric;
begin
  if uid is null then raise exception 'not_logged_in'; end if;

  perform 1 from public.trading_accounts where user_id = uid for update;

  select * into it from public.user_items
   where user_id = uid and product_id = p_product_id for update;
  if not found or it.quantity < 1 then raise exception 'no_item'; end if;

  -- 기간제 아이템이 이미 켜져 있으면 중복 사용을 막습니다(낭비 방지).
  if it.duration_hours is not null then
    if exists (select 1 from public.item_usage_logs
                where user_id = uid and item_type = it.item_type
                  and expires_at is not null and expires_at > now()) then
      raise exception 'already_active';
    end if;
    exp := now() + make_interval(hours => it.duration_hours);
  end if;

  -- 효과 적용 — 잔고를 건드리는 종류만 여기서 처리합니다.
  if it.item_type = 'seed_recharge' then
    -- (1) 2026-08-27 추가 - 포지션을 들고 있으면 충전하지 않습니다.
    --     지갑 초기화(claim_daily_recharge), 재충전 이용권(account_reset) 과
    --     같은 검사입니다. 예외가 나면 트랜잭션 전체가 되돌아가므로
    --     아이템은 차감되지 않고 그대로 남습니다.
    if exists (select 1 from public.positions where user_id = uid) then
      raise exception 'has_position';
    end if;

    added := coalesce(it.effect_value, 0);

    -- (2) 2026-08-27 추가 - recharge_total 에 같이 쌓습니다.
    --     무상으로 받은 돈이라 계급 계산에서 빠져야 합니다
    --     (2026-08-24 대표 결정 / js/rank.js:154-163 과 같은 규칙).
    --     지갑에 들어간 금액과 계급에서 빼는 금액이 정확히 같으므로
    --     시드 충전권으로는 계급이 한 칸도 안 움직입니다.
    update public.trading_accounts
       set balance        = balance + added,
           recharge_total = coalesce(recharge_total, 0) + added,
           updated_at     = now()
     where user_id = uid
     returning balance into new_balance;

    eff := jsonb_build_object('added', added, 'balance', new_balance,
                              'counted_as_recharge', true);

  elsif it.item_type = 'account_reset' then
    select initial_balance into start_bal from public.trading_accounts where user_id = uid;
    if exists (select 1 from public.positions where user_id = uid) then
      raise exception 'has_position';
    end if;
    update public.trading_accounts
       set balance = start_bal, updated_at = now()
     where user_id = uid
     returning balance into new_balance;
    eff := jsonb_build_object('balance', new_balance);
  end if;
  -- leverage_boost / fee_discount / position_peek / liquidation_guard 는
  -- 잔고를 바꾸지 않습니다. 아래 사용 기록만 남기고, 효과는 화면 쪽에서
  -- active_user_effects() 를 보고 적용합니다.

  update public.user_items
     set quantity = quantity - 1, updated_at = now()
   where user_id = uid and product_id = p_product_id;

  insert into public.item_usage_logs
    (user_id, product_id, item_type, effect_value, expires_at, effect_data)
  values (uid, p_product_id, it.item_type, it.effect_value, exp, eff);

  return json_build_object(
    'ok', true, 'item_type', it.item_type, 'effect_value', it.effect_value,
    'expires_at', exp, 'balance', new_balance, 'effect', eff);
end;
$fn$;

grant execute on function public.use_user_item to authenticated;


-- =========================================================================
-- [5] 확인 (읽기 전용)
-- =========================================================================
-- 소급 보정이 몇 명에게 얼마나 들어갔는지.
select
  coalesce(p.nickname, '(이름없음)') as 회원,
  round(b.amount)                    as 더한금액,
  round(b.recharge_total_before)     as 충전누계_전,
  round(b.recharge_total_after)      as 충전누계_후,
  b.done_at                          as 처리시각
from public.recharge_total_backfill_log b
left join public.profiles p on p.id = b.user_id
order by b.done_at desc, 더한금액 desc;

-- 시드 충전권을 쓴 회원의 지금 계급점수.
select
  coalesce(p.nickname, '(이름없음)')    as 회원,
  round(coalesce(ta.balance, 0))        as 지갑,
  round(coalesce(ta.recharge_total, 0)) as 충전누계,
  round(public.rank_points(ta.user_id)) as 계급점수
from public.trading_accounts ta
left join public.profiles p on p.id = ta.user_id
where exists (select 1 from public.item_usage_logs l
               where l.user_id = ta.user_id and l.item_type = 'seed_recharge')
order by 계급점수 desc;


-- =========================================================================
-- [참고] 구매 횟수 제한(max_purchase) 은 손대지 않았습니다
-- =========================================================================
-- 시드 충전권은 max_purchase 가 null(무제한) 입니다.
-- 재충전 이용권(account_reset) 도 똑같이 null 이라, "빠뜨린 것" 인지
-- "그렇게 정한 것" 인지 코드만 봐서는 알 수 없어 그대로 두었습니다.
-- 한도를 걸기로 정하시면 아래 한 줄만 Run 하시면 됩니다(숫자는 원하는 대로).
--
--   update public.tl_market_products
--      set max_purchase = 3
--    where item_type = 'seed_recharge';
--
-- 되돌리기:
--   update public.tl_market_products
--      set max_purchase = null
--    where item_type = 'seed_recharge';


-- =========================================================================
-- [되돌리기]  — 이 파일이 한 일을 전부 원래대로
-- =========================================================================
-- 아래를 위에서부터 순서대로 Run 하시면 됩니다.
-- (앞의 -- 를 지우고 실행하세요. 회원 데이터를 지우지 않습니다.)
--
-- (1) 소급 보정한 recharge_total 을 원래 값으로 되돌립니다
--   update public.trading_accounts ta
--      set recharge_total = b.recharge_total_before,
--          updated_at = now()
--     from public.recharge_total_backfill_log b
--    where ta.user_id = b.user_id
--      and b.reason = 'seed_recharge';
--
-- (2) 보정 기록을 지웁니다 (나중에 다시 돌릴 수 있게)
--   delete from public.recharge_total_backfill_log
--    where reason = 'seed_recharge';
--
-- (3) 함수를 옛 동작으로 되돌립니다
--   git 에서 옛 파일을 꺼내 그 안의 use_user_item 만 Run 하면 됩니다.
--     git show <이_커밋>^:supabase/schema-tl-market.sql
--
-- (3) 을 되돌리면 (1)(2) 두 문제가 그대로 되살아납니다.
-- 보통은 위 (1)(2) 만 되돌리면 충분합니다
-- (계급은 원위치, 앞으로는 정상 적립).
-- =========================================================================
