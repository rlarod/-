-- =========================================================================
-- 마이페이지 — TL 내역 / 구매 내역 / 회원탈퇴 (14순위)
-- =========================================================================
-- 지금 마이페이지에는 자산 숫자만 있습니다.
--   총자산, 잔고, 증거금, 미실현·실현손익, 수수료, 펀딩비, 보유 TL
--
-- 없는 것
--   TL 획득 내역 / TL 사용 내역
--   마켓 구매 내역 / 핫딜 구매 내역
--   회원탈퇴
--
-- 이 파일은 그 조회 함수와 탈퇴 함수를 만듭니다.
-- 테이블은 만들거나 지우지 않습니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) TL 사용 내역 ----------------
-- tl_transactions 에는 사용(음수)과 지급/환불(양수)이 함께 있습니다.
create or replace function public.my_tl_history(limit_count int default 50)
returns table (
  발생시각 timestamptz,
  구분     text,
  금액     numeric,
  사유     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.created_at,
    case when t.amount < 0 then '사용' else '지급' end,
    t.amount,
    coalesce(t.reason, t.tx_type, '-')
  from public.tl_transactions t
  where t.user_id = auth.uid()
  order by t.created_at desc
  limit limit_count;
$$;

grant execute on function public.my_tl_history to authenticated;


-- ---------------- 2) 핫딜 구매 내역 ----------------
create or replace function public.my_hotdeal_purchases(limit_count int default 50)
returns table (
  구매시각 timestamptz,
  상품명   text,
  브랜드   text,
  수량     int,
  사용TL   numeric,
  상태     text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.created_at,
    coalesce(pr.name, '(삭제된 상품)'),
    coalesce(pr.brand, '-'),
    p.quantity,
    p.total_tl,
    coalesce(p.status, 'completed')
  from public.tl_purchases p
  left join public.tl_products pr on pr.id = p.product_id
  where p.user_id = auth.uid()
  order by p.created_at desc
  limit limit_count;
$$;

grant execute on function public.my_hotdeal_purchases to authenticated;


-- ---------------- 3) 마켓 아이템 보관함 ----------------
-- 테이블이 아직 없는 서버에서도 안 터지게 존재를 확인합니다.
do $$
begin
  if to_regclass('public.user_items') is null then
    raise notice 'user_items 테이블이 없어 마켓 내역 함수는 건너뜁니다.';
    return;
  end if;

  execute $fn$
    create or replace function public.my_market_items(limit_count int default 50)
    returns table (
      구매시각 timestamptz,
      아이템   text,
      수량     int,
      사용여부 text,
      만료시각 timestamptz
    )
    language sql
    stable
    security definer
    set search_path = public
    as $inner$
      select
        ui.created_at,
        coalesce(mp.name, '(삭제된 아이템)'),
        ui.quantity,
        case when ui.used_at is not null then '사용함' else '보유중' end,
        ui.expires_at
      from public.user_items ui
      left join public.tl_market_products mp on mp.id = ui.product_id
      where ui.user_id = auth.uid()
      order by ui.created_at desc
      limit limit_count;
    $inner$;
  $fn$;

  execute 'grant execute on function public.my_market_items to authenticated';
end $$;


-- ---------------- 4) 회원탈퇴 ----------------
-- 되돌릴 수 없습니다. 본인만 실행할 수 있습니다.
--
-- 무엇이 지워지나
--   auth.users 행이 지워지면 아래가 cascade 로 함께 정리됩니다.
--     profiles, trading_accounts, positions, orders, trades,
--     tl_transactions, tl_purchases, user_items,
--     customer_private_info, chat_messages, posts, post_comments 등
--
-- 왜 함수로 만드나
--   클라이언트는 auth.users 를 직접 지울 수 없습니다.
--   본인 확인 후 서버에서 지웁니다.
create or replace function public.delete_my_account()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  nick text;
begin
  if uid is null then
    return json_build_object('ok', false, 'error', 'not_logged_in');
  end if;

  select nickname into nick from public.profiles where id = uid;

  -- 관리자는 실수로 지우지 못하게 막습니다.
  if exists (select 1 from public.admin_users a where a.user_id = uid) then
    return json_build_object('ok', false, 'error', 'admin_cannot_delete');
  end if;

  -- auth.users 를 지우면 나머지는 cascade 로 정리됩니다.
  delete from auth.users where id = uid;

  return json_build_object('ok', true, 'nickname', nick);
exception when others then
  return json_build_object('ok', false, 'error', sqlerrm);
end;
$$;

grant execute on function public.delete_my_account to authenticated;


-- ---------------- 5) 확인 ----------------
select
  p.proname                                   as 함수,
  case when p.proname is not null then '✅ 만들어짐' else '-' end as 상태
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('my_tl_history', 'my_hotdeal_purchases',
                    'my_market_items', 'delete_my_account')
order by p.proname;
