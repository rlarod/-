-- =========================================================================
-- TL 마켓 — 모의투자 아이템 상점
-- =========================================================================
-- TL 핫딜(실제 상품권)과 완전히 분리된 테이블입니다.
--   핫딜  : tl_products / tl_purchases        (건드리지 않습니다)
--   마켓  : tl_market_products / user_items / item_usage_logs
-- TL 잔액과 거래내역은 기존 것을 그대로 씁니다 —
--   tl_balance() / tl_balance_info() / tl_transactions
--   새 잔액 테이블을 만들지 않습니다.
--
-- 이 파일은 기존 테이블을 하나도 지우거나 바꾸지 않습니다.
-- CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE FUNCTION 만 씁니다.
-- 여러 번 실행해도 안전합니다. DROP TABLE / TRUNCATE 없음.
--
-- 선행 조건: supabase/schema-tl-hotdeal.sql 을 먼저 실행해야 합니다
--            (tl_transactions, tl_balance() 가 거기서 만들어집니다).
-- =========================================================================


-- ---------------- 1) 마켓 상품 ----------------
create table if not exists public.tl_market_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null,              -- leverage / seed / position / trade / etc
  image_url text,                      -- 없으면 화면에서 아이콘으로 대체
  icon text,                           -- 이미지가 없을 때 쓸 짧은 표시(예: 100x, 👁)
  tl_price numeric not null check (tl_price > 0),
  item_type text not null,             -- 아이템 동작 종류(아래 주석 참고)
  effect_value numeric,                -- 종류별 숫자값(레버리지 배수, 충전액, 할인율 등)
  duration_hours integer,              -- 기간제면 시간, 1회성이면 null
  stock integer,                       -- null = 무제한
  max_purchase integer,                -- null = 1인 구매 제한 없음
  status text not null default 'active'
    check (status in ('active','paused','soldout','ended')),
  is_visible boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- item_type 값 (코드와 약속한 이름입니다. 새 아이템을 추가할 때 여기에 맞춥니다)
--   leverage_boost   : 최대 레버리지를 effect_value 배까지 허용 (기간제)
--   seed_recharge    : 잔고를 effect_value 만큼 더함 (1회)
--   account_reset    : 계정을 기본 시드로 되돌림 (1회, effect_value 사용 안 함)
--   fee_discount     : 거래 수수료를 effect_value 비율만큼 할인 (기간제)
--   position_peek    : 포지션 훔쳐보기 1회 충전
--   liquidation_guard: 청산 보호 1회

create index if not exists idx_tl_market_products_cat on public.tl_market_products(category);
alter table public.tl_market_products enable row level security;

drop policy if exists "tl_market_products_select_all" on public.tl_market_products;
create policy "tl_market_products_select_all" on public.tl_market_products
  for select using (true);

drop policy if exists "tl_market_products_admin_write" on public.tl_market_products;
create policy "tl_market_products_admin_write" on public.tl_market_products
  for all
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));


-- ---------------- 2) 아이템 보관함 ----------------
-- 구매하면 여기 쌓이고, 사용해야 효과가 납니다(구매 = 즉시 적용 아님).
create table if not exists public.user_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.tl_market_products(id),
  -- 구매 당시 내용을 남겨 나중에 상품이 바뀌어도 보관함이 흔들리지 않게 합니다.
  product_name text not null,
  item_type text not null,
  effect_value numeric,
  duration_hours integer,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create index if not exists idx_user_items_user on public.user_items(user_id);
alter table public.user_items enable row level security;

drop policy if exists "user_items_select_own" on public.user_items;
create policy "user_items_select_own" on public.user_items
  for select using (auth.uid() = user_id);
-- INSERT/UPDATE 정책 없음 — 아래 함수(SECURITY DEFINER)로만 바뀝니다.


-- ---------------- 3) 아이템 사용 기록 ----------------
-- 기간제 아이템의 만료 시각도 여기서 관리합니다(expires_at).
create table if not exists public.item_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.tl_market_products(id),
  item_type text not null,
  effect_value numeric,
  used_at timestamptz not null default now(),
  expires_at timestamptz,              -- 1회성이면 null
  effect_data jsonb
);

create index if not exists idx_item_usage_user on public.item_usage_logs(user_id, used_at desc);
create index if not exists idx_item_usage_active on public.item_usage_logs(user_id, item_type, expires_at);
alter table public.item_usage_logs enable row level security;

drop policy if exists "item_usage_logs_select_own" on public.item_usage_logs;
create policy "item_usage_logs_select_own" on public.item_usage_logs
  for select using (auth.uid() = user_id);


-- ---------------- 4) 구매 ----------------
-- 클라이언트는 상품 id 와 수량만 보냅니다. 가격·잔액·재고·제한은 전부 서버 판정.
create or replace function public.purchase_tl_market_item(p_product_id uuid, p_quantity integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prod public.tl_market_products%rowtype;
  already integer;
  total numeric;
  bal numeric;
  new_qty integer;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  if p_quantity is null or p_quantity < 1 then raise exception 'bad_quantity'; end if;

  -- 같은 사용자의 동시 요청을 줄 세웁니다(TL 이중 차감 방지).
  perform 1 from public.trading_accounts where user_id = uid for update;

  select * into prod from public.tl_market_products where id = p_product_id for update;
  if not found then raise exception 'no_product'; end if;
  if prod.status <> 'active' then raise exception 'not_on_sale'; end if;
  if prod.stock is not null and prod.stock < p_quantity then raise exception 'out_of_stock'; end if;

  if prod.max_purchase is not null then
    select coalesce(sum(quantity), 0) into already
      from public.item_usage_logs where user_id = uid and product_id = p_product_id;
    select coalesce((select quantity from public.user_items
                      where user_id = uid and product_id = p_product_id), 0) + already
      into already;
    if already + p_quantity > prod.max_purchase then raise exception 'limit_exceeded'; end if;
  end if;

  total := prod.tl_price * p_quantity;

  bal := public.tl_balance(uid);           -- 서버가 직접 계산
  if bal < total then raise exception 'insufficient_tl'; end if;

  if prod.stock is not null then
    update public.tl_market_products
       set stock = stock - p_quantity, updated_at = now()
     where id = p_product_id;
  end if;

  insert into public.user_items
    (user_id, product_id, product_name, item_type, effect_value, duration_hours, quantity)
  values
    (uid, prod.id, prod.name, prod.item_type, prod.effect_value, prod.duration_hours, p_quantity)
  on conflict (user_id, product_id)
  do update set quantity = public.user_items.quantity + excluded.quantity,
                updated_at = now()
  returning quantity into new_qty;

  -- TL 거래내역은 핫딜과 같은 테이블을 씁니다(중복 테이블 만들지 않음).
  insert into public.tl_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (uid, 'spend', -total, bal - total, 'TL 마켓 · ' || prod.name, prod.id);

  return json_build_object(
    'ok', true, 'spent', total, 'balance_after', bal - total,
    'product_name', prod.name, 'quantity', new_qty);
end;
$$;

grant execute on function public.purchase_tl_market_item to authenticated;


-- ---------------- 5) 사용 ----------------
-- 아이템을 1개 차감하고 효과를 겁니다. TL 은 여기서 차감하지 않습니다(구매 때만).
--
-- =====================================================================
-- 이 함수는 supabase/fix-seed-recharge-guard.sql 에도 똑같이 있습니다.
-- 그 파일이 정본입니다(2026-08-27). 여기 있는 것과 내용이 같으므로
-- 어느 쪽을 나중에 Run 해도 결과가 같습니다.
-- 고칠 때는 반드시 두 파일을 같이 고치세요. 한쪽만 고치면
-- 다른 쪽을 나중에 돌렸을 때 수리가 조용히 되돌아갑니다.
--
-- seed_recharge 는 recharge_total(계급에서 빼는 무상 지급 누계)에
-- 같이 쌓아야 합니다. 안 쌓으면 1장당 계급이 정확히 +1000점 오릅니다.
-- =====================================================================

-- 계급에서 빼는 '무상으로 받은 돈' 누계입니다.
-- schema-daily-recharge.sql / schema-rank-1000.sql 에도 같은 줄이 있습니다.
-- 어느 파일을 먼저 돌려도 되게 세 곳에 모두 둡니다(있으면 그냥 넘어갑니다).
alter table public.trading_accounts
  add column if not exists recharge_total numeric not null default 0;

create or replace function public.use_user_item(p_product_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  it public.user_items%rowtype;
  exp timestamptz;
  new_balance numeric;
  start_bal numeric;
  eff jsonb := '{}'::jsonb;
  added numeric;
  old_bal numeric;   -- account_reset: 되돌리기 '전' 지갑 (무상 지급액 계산용)
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
    -- 2026-08-27 추가 - 시드 충전권과 똑같은 구멍이 여기에도 있었습니다.
    --   balance 를 initial_balance 로 되돌리면서 recharge_total 에는 안 쌓아서,
    --   손실을 본 상태에서 쓰면 원금이 무상 복구되는데 계급 점수에서는 안 빠집니다.
    --   → 거래를 한 번도 더 안 하고 계급이 올라갑니다.
    if exists (select 1 from public.positions where user_id = uid) then
      raise exception 'has_position';
    end if;

    -- 위 perform ... for update 로 이미 이 줄을 잠가 두었습니다.
    select coalesce(balance, 0), coalesce(initial_balance, 0)
      into old_bal, start_bal
      from public.trading_accounts where user_id = uid;

    -- ★ 무상으로 받은 금액 = 되돌리기로 '늘어난' 만큼입니다.
    --   시드 충전권처럼 고정액(effect_value)이 아닙니다.
    --   account_reset 의 effect_value 는 null 입니다(schema-tl-market.sql:349).
    --
    --     손실 중 (지갑 50,000 < 초기 100,000)
    --        → added = 50,000. 지갑 +50,000, recharge_total +50,000.
    --          계급자산 = 100,000 - 50,000 = 50,000 → 점수는 손실 그대로 반영
    --     이익 중 (지갑 150,000 > 초기 100,000)
    --        → added = 0.   지갑이 오히려 줄어듭니다(회원이 이익을 포기한 것).
    --          무상으로 받은 게 없으므로 recharge_total 은 안 건드립니다.
    --          음수를 더하면 계급이 거꾸로 부풀어 오르므로 greatest(0, ...) 입니다.
    --
    --   계급 공식(1000 × log2(자산/초기자금)) 은 한 글자도 안 건드립니다.
    --   '자산' 에서 빼는 항목에 빠져 있던 금액을 채우는 것뿐입니다.
    added := greatest(0, start_bal - old_bal);

    update public.trading_accounts
       set balance        = start_bal,
           recharge_total = coalesce(recharge_total, 0) + added,
           updated_at     = now()
     where user_id = uid
     returning balance into new_balance;

    -- ★ balance_before 를 기록에 남깁니다.
    --   지금까지의 기록에는 '되돌린 뒤' 잔고만 있어서(effect_data.balance),
    --   지난 사용분은 얼마가 무상으로 들어갔는지 계산할 방법이 없습니다.
    --   앞으로 쓴 것은 이 값으로 언제든 대조·소급이 됩니다.
    eff := jsonb_build_object('balance', new_balance,
                              'balance_before', old_bal,
                              'added', added,
                              'counted_as_recharge', true);
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
$$;

grant execute on function public.use_user_item to authenticated;


-- ---------------- 6) 지금 켜져 있는 효과 ----------------
-- 화면이 이걸 보고 레버리지 상한 등을 정합니다. 클라이언트 값은 믿지 않습니다.
create or replace function public.active_user_effects()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return json_build_object('logged_in', false, 'timed', '[]'::json, 'counts', '{}'::json);
  end if;
  return json_build_object(
    'logged_in', true,
    'now', now(),
    -- 기간제 효과 중 아직 안 끝난 것
    'timed', coalesce((
      select json_agg(json_build_object(
               'item_type', item_type, 'effect_value', effect_value, 'expires_at', expires_at))
        from public.item_usage_logs
       where user_id = uid and expires_at is not null and expires_at > now()), '[]'::json),
    -- 1회성 효과를 몇 번 썼는지(훔쳐보기 잔여 계산 등에 씁니다)
    'used_counts', coalesce((
      select json_object_agg(item_type, n)
        from (select item_type, count(*) as n
                from public.item_usage_logs
               where user_id = uid and expires_at is null
               group by item_type) t), '{}'::json));
end;
$$;

grant execute on function public.active_user_effects to authenticated;


-- ---------------- 7) 기본 상품 등록 ----------------
-- 가격·효과·기간은 전부 이 표에서 관리합니다(코드에 박지 않습니다).
-- 관리자 화면이 붙으면 이 행들을 그대로 수정하면 됩니다.
insert into public.tl_market_products
  (name, description, category, icon, tl_price, item_type, effect_value, duration_hours,
   stock, max_purchase, sort_order)
values
  ('레버리지 x100배 이용권',
   '코인선물 거래에서 1일간 최대 100배 레버리지를 사용할 수 있습니다.',
   'leverage', '100x', 50, 'leverage_boost', 100, 24, null, null, 10),

  ('포지션 훔쳐보기 이용권',
   '다른 이용자의 공개된 포지션 정보를 1회 확인할 수 있습니다.',
   'position', '👁', 100, 'position_peek', 1, null, null, null, 20),

  ('코인선물 재충전 이용권',
   '코인선물 모의투자 계정을 1회 재충전할 수 있습니다.',
   'seed', '🔄', 200, 'account_reset', null, null, null, null, 30),

  ('시드 충전권',
   '모의투자 계정의 가상 시드를 추가로 충전합니다.',
   'seed', '💰', 300, 'seed_recharge', 100000, null, null, null, 40),

  ('거래 수수료 할인권',
   '일정 시간 동안 모의투자 거래 수수료를 할인받습니다.',
   'trade', '🏷', 250, 'fee_discount', 0.5, 24, null, null, 50),

  ('포지션 보호권',
   '포지션 청산 위험을 1회 보호할 수 있는 특별 이용권입니다.',
   'trade', '🛡', 500, 'liquidation_guard', 1, null, null, null, 60)
on conflict do nothing;


-- ---------------- 8) 확인 ----------------
select name, category, tl_price, item_type, effect_value, duration_hours, status
from public.tl_market_products order by sort_order;
