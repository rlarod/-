-- =========================================================================
-- TL 핫딜 — 상품 / 구매내역 / TL 거래내역
-- =========================================================================
-- 이 파일은 기존 테이블을 하나도 지우거나 바꾸지 않습니다.
--   CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS /
--   CREATE OR REPLACE FUNCTION 만 씁니다. 여러 번 실행해도 안전합니다.
--   DROP TABLE / TRUNCATE 없음.
--
-- ── 왜 서버에서 잔액을 계산하나 ─────────────────────────────────────────
-- 지금 "보유 TL"은 js/rank.js 가 브라우저에서 거래기록으로 계산합니다.
-- 서버에 저장된 값이 아니라서, 그대로 두면 사용자가 개발자도구에서
-- 잔액을 바꿔 구매할 수 있습니다.
-- 다행히 서버도 같은 재료를 갖고 있습니다.
--   청산 거래 건수 -> public.trades
--   실현 수익률    -> trading_accounts.realized_pnl / initial_balance
--   수동 가감점    -> profiles.rank_points
-- 그래서 rank.js 와 똑같은 공식을 서버 함수로 옮겨 잔액을 직접 계산합니다.
-- 클라이언트가 보내는 잔액/가격/재고는 하나도 믿지 않습니다.
--
-- ── 계급 점수와 보유 TL 은 다릅니다 ─────────────────────────────────────
--   계급 점수 = 획득 TL            (쓴다고 내려가지 않음. 계급 유지)
--   보유 TL   = 획득 TL - 사용 TL  (핫딜에서 쓸 수 있는 잔액)
-- =========================================================================


-- ---------------- 사전 준비 ----------------
-- rank_points 는 schema-rank-patch.sql 에 있지만, 그 파일을 아직 안 돌렸어도
-- 이 파일만으로 동작하도록 여기서도 안전하게 보장합니다.
alter table public.profiles
  add column if not exists rank_points numeric not null default 0;


-- ---------------- 1) 상품 ----------------
create table if not exists public.tl_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text not null,
  category text not null,            -- cafe / delivery / meal / shopping / life / etc
  price numeric not null,            -- 실제 상품 금액(원)
  tl_price numeric not null check (tl_price > 0),
  list_tl_price numeric,             -- 특가 이전 정가 TL (없으면 null = 특가 아님)
  image_url text,                    -- 상품 이미지. 없으면 화면에서 브랜드 머리글자로 대체
  stock integer not null default 0 check (stock >= 0),
  max_purchase integer,              -- null = 1인 구매 제한 없음
  status text not null default 'active' check (status in ('active','paused','ended')),
  is_hot boolean not null default false,
  is_limited boolean not null default false,
  sort_order integer not null default 0,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tl_products_category on public.tl_products(category);
create index if not exists idx_tl_products_status on public.tl_products(status);

alter table public.tl_products enable row level security;

-- 상품 목록은 누구나 볼 수 있습니다(로그아웃 상태에서도 구경 가능).
drop policy if exists "tl_products_select_all" on public.tl_products;
create policy "tl_products_select_all" on public.tl_products
  for select using (true);

-- 등록/수정/삭제는 관리자만. (관리자 페이지를 나중에 붙일 때 이 정책을 그대로 씁니다)
drop policy if exists "tl_products_admin_write" on public.tl_products;
create policy "tl_products_admin_write" on public.tl_products
  for all
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid()))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid()));


-- ---------------- 2) 구매내역 ----------------
create table if not exists public.tl_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.tl_products(id),
  -- 나중에 상품 정보가 바뀌어도 구매 당시 내용이 남도록 스냅샷을 같이 저장합니다.
  product_name text not null,
  product_brand text not null,
  unit_tl_price numeric not null,
  quantity integer not null check (quantity > 0),
  total_tl numeric not null,
  status text not null default 'completed' check (status in ('completed','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_tl_purchases_user on public.tl_purchases(user_id, created_at desc);
create index if not exists idx_tl_purchases_user_product on public.tl_purchases(user_id, product_id);

alter table public.tl_purchases enable row level security;

-- 내 구매내역만 봅니다. INSERT 정책은 일부러 없습니다 —
-- 구매는 아래 purchase_tl_product() 함수를 통해서만 가능합니다.
drop policy if exists "tl_purchases_select_own" on public.tl_purchases;
create policy "tl_purchases_select_own" on public.tl_purchases
  for select using (auth.uid() = user_id);


-- ---------------- 3) TL 거래내역 ----------------
-- amount 는 부호 있는 값입니다. 사용은 음수(-5300), 지급/환불은 양수.
create table if not exists public.tl_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('spend','refund','grant')),
  amount numeric not null,
  balance_after numeric not null,
  description text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_tl_transactions_user on public.tl_transactions(user_id, created_at desc);

alter table public.tl_transactions enable row level security;

drop policy if exists "tl_transactions_select_own" on public.tl_transactions;
create policy "tl_transactions_select_own" on public.tl_transactions
  for select using (auth.uid() = user_id);


-- ---------------- 4) 획득 TL (= 계급 점수) ----------------
-- js/rank.js 의 calculatePoints() 와 같은 공식입니다.
--   청산 거래 1건당 10점 + 실현 수익률 1%당 20점(손실은 0으로) + 수동 가감점
-- 배점을 바꿀 일이 생기면 rank.js 와 이 함수를 같이 고쳐야 합니다.
create or replace function public.tl_earned(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select count(*) from public.trades t where t.user_id = p_uid), 0) * 10
    + greatest(0, coalesce((
        select case when ta.initial_balance > 0
                    then (ta.realized_pnl / ta.initial_balance) * 100
                    else 0 end
        from public.trading_accounts ta where ta.user_id = p_uid), 0)) * 20
    + coalesce((select pr.rank_points from public.profiles pr where pr.id = p_uid), 0);
$$;

-- ---------------- 5) 보유 TL = 획득 - 사용 ----------------
create or replace function public.tl_balance(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select public.tl_earned(p_uid)
       + coalesce((select sum(amount) from public.tl_transactions x where x.user_id = p_uid), 0);
$$;

-- 화면 표시용 — 획득/사용/보유를 한 번에 돌려줍니다.
create or replace function public.tl_balance_info()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  earned numeric;
  spent numeric;
begin
  if uid is null then
    return json_build_object('logged_in', false, 'earned', 0, 'spent', 0, 'balance', 0);
  end if;
  earned := public.tl_earned(uid);
  spent := coalesce((select -sum(amount) from public.tl_transactions x
                     where x.user_id = uid and x.amount < 0), 0);
  return json_build_object(
    'logged_in', true,
    'earned', earned,
    'spent', spent,
    'balance', earned - spent);
end;
$$;

grant execute on function public.tl_balance_info to authenticated;


-- ---------------- 6) 구매 (하나의 트랜잭션) ----------------
-- 클라이언트는 상품 id 와 수량만 보냅니다. 가격/잔액/재고/제한은 전부 여기서 봅니다.
create or replace function public.purchase_tl_product(p_product_id uuid, p_quantity integer)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  prod public.tl_products%rowtype;
  already integer;
  total numeric;
  bal numeric;
  new_stock integer;
  new_purchase_id uuid;
begin
  if uid is null then
    raise exception 'not_logged_in';
  end if;
  if p_quantity is null or p_quantity < 1 then
    raise exception 'bad_quantity';
  end if;

  -- 같은 사용자의 동시 요청을 줄 세웁니다(잔액 이중 사용 방지).
  perform 1 from public.trading_accounts where user_id = uid for update;

  -- 상품 행을 잠급니다(동시 구매로 재고가 음수가 되는 것 방지).
  select * into prod from public.tl_products where id = p_product_id for update;
  if not found then
    raise exception 'no_product';
  end if;
  if prod.status <> 'active' then
    raise exception 'not_on_sale';
  end if;
  if prod.expires_at is not null and prod.expires_at <= now() then
    raise exception 'expired';
  end if;
  if prod.stock < p_quantity then
    raise exception 'out_of_stock';
  end if;

  -- 1인 구매 제한
  if prod.max_purchase is not null then
    select coalesce(sum(quantity), 0) into already
      from public.tl_purchases
     where user_id = uid and product_id = p_product_id and status = 'completed';
    if already + p_quantity > prod.max_purchase then
      raise exception 'limit_exceeded';
    end if;
  end if;

  total := prod.tl_price * p_quantity;

  -- 잔액은 서버가 직접 계산합니다. 클라이언트가 보낸 값은 쓰지 않습니다.
  bal := public.tl_balance(uid);
  if bal < total then
    raise exception 'insufficient_tl';
  end if;

  update public.tl_products
     set stock = stock - p_quantity, updated_at = now()
   where id = p_product_id
   returning stock into new_stock;

  insert into public.tl_purchases
    (user_id, product_id, product_name, product_brand, unit_tl_price, quantity, total_tl, status)
  values
    (uid, prod.id, prod.name, prod.brand, prod.tl_price, p_quantity, total, 'completed')
  returning id into new_purchase_id;

  insert into public.tl_transactions
    (user_id, type, amount, balance_after, description, reference_id)
  values
    (uid, 'spend', -total, bal - total,
     prod.brand || ' ' || prod.name, new_purchase_id);

  return json_build_object(
    'ok', true,
    'purchase_id', new_purchase_id,
    'spent', total,
    'balance_after', bal - total,
    'stock', new_stock);
end;
$$;

grant execute on function public.purchase_tl_product to authenticated;


-- ---------------- 7) 기본 상품 등록 ----------------
-- 사장님이 주신 상품/금액/TL 가격 그대로입니다.
--
-- ★ stock(재고)과 max_purchase(1인 제한)는 주신 목록에 없어서 운영값을
--   임의로 정하지 않고 아래 두 변수로 한 번에 지정하게 해뒀습니다.
--   실제 운영값이 정해지면 이 숫자만 바꿔 다시 실행하시거나,
--   나중에 관리자 화면에서 상품별로 수정하시면 됩니다.
--   is_hot(오늘의 핫딜)도 지금은 전부 false 입니다 — 어떤 상품을 특가로
--   걸지는 사장님이 정하실 일이라 임의로 지정하지 않았습니다.
do $$
declare
  DEFAULT_STOCK constant integer := 50;   -- ← 재고 기본값
  DEFAULT_LIMIT constant integer := 2;    -- ← 1인 구매 제한 기본값(null 이면 무제한)
begin
  insert into public.tl_products
    (name, brand, category, price, tl_price, stock, max_purchase, sort_order)
  values
    -- 카페
    ('아메리카노',        '스타벅스',   'cafe',      5000,  1400, DEFAULT_STOCK, DEFAULT_LIMIT, 10),
    ('아메리카노',        '메가커피',   'cafe',      5000,  1200, DEFAULT_STOCK, DEFAULT_LIMIT, 11),
    ('아메리카노',        '투썸플레이스','cafe',     5000,  1400, DEFAULT_STOCK, DEFAULT_LIMIT, 12),
    ('금액권 10,000원',   '스타벅스',   'cafe',     10000,  2700, DEFAULT_STOCK, DEFAULT_LIMIT, 13),
    ('금액권 10,000원',   '메가커피',   'cafe',     10000,  2500, DEFAULT_STOCK, DEFAULT_LIMIT, 14),
    ('금액권 20,000원',   '스타벅스',   'cafe',     20000,  5300, DEFAULT_STOCK, DEFAULT_LIMIT, 15),
    -- 배달/외식
    ('금액권 5,000원',    '배달의민족', 'delivery',  5000,  1400, DEFAULT_STOCK, DEFAULT_LIMIT, 20),
    ('금액권 10,000원',   '배달의민족', 'delivery', 10000,  2700, DEFAULT_STOCK, DEFAULT_LIMIT, 21),
    ('금액권 20,000원',   '배달의민족', 'delivery', 20000,  5300, DEFAULT_STOCK, DEFAULT_LIMIT, 22),
    ('금액권 30,000원',   '배달의민족', 'delivery', 30000,  8000, DEFAULT_STOCK, DEFAULT_LIMIT, 23),
    ('금액권 50,000원',   '배달의민족', 'delivery', 50000, 13500, DEFAULT_STOCK, DEFAULT_LIMIT, 24),
    ('금액권 10,000원',   'BBQ',        'delivery', 10000,  2800, DEFAULT_STOCK, DEFAULT_LIMIT, 25),
    ('금액권 20,000원',   'BBQ',        'delivery', 20000,  5500, DEFAULT_STOCK, DEFAULT_LIMIT, 26),
    ('금액권 20,000원',   '교촌치킨',   'delivery', 20000,  5500, DEFAULT_STOCK, DEFAULT_LIMIT, 27),
    -- 쇼핑
    ('금액권 5,000원',    '쿠팡',       'shopping',  5000,  1400, DEFAULT_STOCK, DEFAULT_LIMIT, 30),
    ('금액권 10,000원',   '쿠팡',       'shopping', 10000,  2700, DEFAULT_STOCK, DEFAULT_LIMIT, 31),
    ('금액권 20,000원',   '쿠팡',       'shopping', 20000,  5300, DEFAULT_STOCK, DEFAULT_LIMIT, 32),
    ('금액권 30,000원',   '쿠팡',       'shopping', 30000,  8000, DEFAULT_STOCK, DEFAULT_LIMIT, 33),
    ('금액권 50,000원',   '쿠팡',       'shopping', 50000, 13500, DEFAULT_STOCK, DEFAULT_LIMIT, 34),
    -- 생활
    ('주유권 10,000원',   '주유소',     'life',     10000,  2700, DEFAULT_STOCK, DEFAULT_LIMIT, 40),
    ('주유권 20,000원',   '주유소',     'life',     20000,  5300, DEFAULT_STOCK, DEFAULT_LIMIT, 41),
    ('주유권 30,000원',   '주유소',     'life',     30000,  8000, DEFAULT_STOCK, DEFAULT_LIMIT, 42),
    ('주유권 50,000원',   '주유소',     'life',     50000, 13500, DEFAULT_STOCK, DEFAULT_LIMIT, 43)
  on conflict do nothing;
end $$;


-- ---------------- 8) 확인 ----------------
select category, count(*) as 상품수, min(tl_price) as 최저TL, max(tl_price) as 최고TL
from public.tl_products group by category order by category;
