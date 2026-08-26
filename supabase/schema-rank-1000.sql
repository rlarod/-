-- =========================================================================
-- schema-rank-1000.sql — 계급을 "지갑에 있는 돈"으로 평가합니다
--                        (대장 = 지갑 1000억원)
-- =========================================================================
-- ★ 대표님은 이 파일 하나만 Supabase SQL Editor 에 붙여넣고 실행하시면 됩니다.
--   한 번만 하면 되고, 여러 번 실행해도 안전합니다.
--
-- 변경 이력
--   2026-08-24 (1차) 대장 = 지갑 1000억원(667배) 으로 승급 점수 재조정
--   2026-08-24 (2차) 대표 결정 — "계급은 무조건 지갑에 있는 돈으로 평가한다"
--                    → 계급용 자산을 (초기자금 + 확정손익) 에서
--                      (지갑 + 묶인 증거금 − 충전받은 돈) 으로 바꿉니다.
--                      펀딩비가 이제 계급에 반영됩니다.
--
-- ⚠ 이 파일은 "지금 서버에 어떤 버전이 살아있든 덮어씁니다".
--    rank_points_all() 이 아래 세 파일에 서로 다르게 정의돼 있습니다.
--      supabase/schema-guest-read.sql    (권한만 부여)
--      supabase/schema-rank-assets.sql   (초기자금 + 확정손익 — 이제 낡음)
--      supabase/schema-rank-badges.sql   (tl_earned = TL 화폐 공식, 낡음)
--    마지막에 무엇을 실행했느냐에 따라 서버 동작이 달라지는데, 파일만
--    봐서는 알 수 없습니다. 그래서 이 파일이 rank_points() 와
--    rank_points_all() 을 둘 다 다시 정의하고 권한까지 다시 줍니다.
--    이걸 실행한 뒤에는 위 세 파일을 다시 실행하지 마세요(되돌아갑니다).
--
-- ---------------------------------------------------------------------
-- 1. 무엇이 바뀌나 (1) — 계급 기준 점수
-- ---------------------------------------------------------------------
--   점수 공식은 그대로입니다.  점수 = 1000 × log2(자산 / 초기자금)
--
--   2026-08-24 대표 결정 — 대장 = 지갑 1000억원.
--     초기자금 10만 USDT(약 1.5억원)의 약 667배 → 9381점.
--     그전에는 대장이 4.2배(2070점, 약 6.3억원)여서 회원 4명 중 1명이
--     이미 대장이었습니다. 최고 계급이 너무 흔해 의미가 없었습니다.
--
--   ⚠ 기존 회원의 계급이 함께 내려갑니다(거래기록은 손대지 않습니다).
--     예) 자산 5.1배 회원: 대장(19) → 중사(6)
--
--   min_points 는 전부 1000 × log2(배수) 를 반올림한 값입니다.
--   js/rank.js 의 RANK_TABLE 과 같은 값이어야 합니다 — 다르면 내 화면의
--   계급과 랭킹표의 계급이 서로 다르게 나옵니다.
--   (tests/rank-table.test.js 가 두 파일을 대조해서 막아줍니다)
--
-- ---------------------------------------------------------------------
-- 2. 무엇이 바뀌나 (2) — 계급용 자산을 "지갑" 으로  ★이번 핵심
-- ---------------------------------------------------------------------
--   2026-08-24 대표 결정
--     "계급은 무조건 지갑에 있는 돈으로 평가하는거임"
--
--   바뀌기 전 (서버)
--     계급용 자산 = 초기자금 + 확정손익(realized_pnl)
--
--   바뀐 뒤 (서버·화면 공통)
--     계급용 자산 = 지갑 잔액(balance)
--                 + 포지션에 묶인 증거금(positions.margin)
--                 + 미체결 주문 증거금(orders.margin, status='OPEN')
--                 − 충전받은 총액(trading_accounts.recharge_total)
--
--   왜 바꾸나 — 펀딩비 때문입니다.
--     펀딩비는 지갑(balance)에 바로 더해지고 빠지는데, 확정손익
--     (realized_pnl = 청산한 거래의 손익 합계) 에는 안 들어갑니다.
--     그래서 옛 공식은 펀딩비를 통째로 빼먹었습니다.
--     실측 예) 김갱 계정에서 지갑과 옛 공식의 차이가 11,231 USDT.
--     대표 결정에 따라 이제 그 몫도 계급에 들어갑니다.
--     (펀딩비를 따로 더하는 코드는 없습니다. 이미 지갑에 있으므로
--      지갑을 보면 자동으로 포함됩니다.)
--
--   그대로 두는 것
--     · 미실현 손익은 여전히 제외합니다. 아직 확정 안 된 숫자라, 넣으면
--       가격이 출렁일 때마다 계급이 오르내립니다.
--     · 묶인 증거금은 잃은 돈이 아니므로 자산에 그대로 더합니다.
--     · 충전받은 돈은 계속 뺍니다(아래 3번).
--
-- ---------------------------------------------------------------------
-- 3. 같이 막는 것 — 무료 충전으로 계급을 사는 구멍
-- ---------------------------------------------------------------------
--   무료 충전은 하루 2회 × 100,000 USDT 가 지갑에 그대로 들어옵니다.
--   계급이 지갑 기준이면 거래를 한 번도 안 해도 이틀이면 병장이 됩니다.
--   (1회 = 지갑 2배 = 상병, 2회 = 3배 = 병장)
--
--   그래서 "지금까지 충전받은 총액" 을 기록하는 칸을 새로 만들고
--   (trading_accounts.recharge_total), 계급 계산에서 뺍니다.
--
--   ⚠ trading_accounts.recharge_count 로는 못 합니다.
--     그 값은 "오늘 몇 번 받았나"라서 자정마다 0 으로 돌아갑니다(최대 2).
--     지금까지 받은 총 횟수가 아닙니다.
--
--   ⚠ 예전에 쓰던 "거래로 설명되지 않는 돈" 역산도 이제 못 씁니다.
--     그 방식은 (지갑 + 증거금) − (초기자금 + 확정손익) 을 충전액으로 봤는데,
--     펀딩비가 정확히 거기에 섞여 들어갑니다. 그대로 두면 펀딩비를
--     충전으로 오해해서 도로 빼버립니다(= 대표 결정과 반대).
--     그래서 충전할 때 서버가 직접 기록하는 방식으로 바꿨습니다.
--
-- ---------------------------------------------------------------------
-- 4. 이 파일이 하지 않는 것
-- ---------------------------------------------------------------------
--   · 테이블을 만들거나 지우지 않습니다 (ranks 행 갱신 + 컬럼 1개 추가만).
--   · 회원의 지갑(balance) · 확정손익(realized_pnl) · 초기자금
--     (initial_balance) · 거래기록(trades) · 포지션을 고치지 않습니다.
--     DELETE / TRUNCATE / DROP TABLE 이 하나도 없습니다.
--   · TL 화폐(tl_earned)는 그대로 둡니다 — 모은 TL 은 변하지 않습니다.
-- =========================================================================


-- ---------------- 1) 계급 정의 19단계 — 승급 점수 갱신 ----------------
-- ranks 테이블이 있으면 js/rank.js 가 코드 안의 표 대신 이걸 씁니다.
-- 그래서 여기도 같이 바꿔야 합니다(안 그러면 서버 표가 화면을 되돌립니다).
-- 테이블이 아직 없으면 supabase/schema-rank-patch.sql 을 먼저 실행하세요.
insert into public.ranks (rank_id, rank_name, rank_level, rank_tier, min_points) values
  ( 1, '이병',  1, '병',       0),   -- 1배
  ( 2, '일병',  2, '병',     378),   -- 1.3배
  ( 3, '상병',  3, '병',     766),   -- 1.7배
  ( 4, '병장',  4, '병',    1138),   -- 2.2배
  ( 5, '하사',  5, '부사관', 1585),   -- 3배
  ( 6, '중사',  6, '부사관', 2000),   -- 4배
  ( 7, '상사',  7, '부사관', 2459),   -- 5.5배
  ( 8, '원사',  8, '부사관', 2907),   -- 7.5배
  ( 9, '준위',  9, '준사관', 3322),   -- 10배
  (10, '소위', 10, '위관',   3807),   -- 14배
  (11, '중위', 11, '위관',   4322),   -- 20배
  (12, '대위', 12, '위관',   4807),   -- 28배
  (13, '소령', 13, '영관',   5322),   -- 40배
  (14, '중령', 14, '영관',   5907),   -- 60배
  (15, '대령', 15, '영관',   6492),   -- 90배
  (16, '준장', 16, '장성',   7129),   -- 140배
  (17, '소장', 17, '장성',   7845),   -- 230배
  (18, '중장', 18, '장성',   8644),   -- 400배
  (19, '대장', 19, '장성',   9381)    -- 667배 = 지갑 1000억원 (2026-08-24 대표 결정)
on conflict (rank_id) do update
  set rank_name  = excluded.rank_name,
      rank_level = excluded.rank_level,
      rank_tier  = excluded.rank_tier,
      min_points = excluded.min_points;


-- ---------------- 2) 충전받은 총액을 기록할 칸 ----------------
-- 지금까지 무료 충전으로 받은 돈의 누계입니다. 자정에 초기화되지 않습니다.
-- 이미 있으면 그대로 둡니다(재실행 안전). 기본값 0.
alter table public.trading_accounts
  add column if not exists recharge_total numeric not null default 0;


-- ---------------- 3) 충전할 때 그 칸을 같이 채우게 ----------------
-- supabase/schema-daily-recharge.sql 의 claim_daily_recharge() 와 같은 함수입니다.
--
-- ★ 2026-08-26 부터 두 파일의 함수 본문을 글자 하나까지 똑같이 맞추었습니다.
--   전에는 이쪽에만 recharge_total 줄이 있어서, 어느 파일을 나중에 돌렸느냐에
--   따라 계급 회계가 조용히 달라졌습니다. 이제는 어느 쪽을 나중에 돌려도 같습니다.
--   한쪽을 고치면 다른 쪽도 꼭 같이 고쳐야 합니다.
--   (tests/recharge-reset.test.js 가 둘이 같은지 감시합니다)
--
-- (금액 · 횟수 제한 · 포지션 보유 시 차단 규칙은 전부 그대로입니다)
create or replace function public.claim_daily_recharge()
returns json
language plpgsql
security definer
set search_path = public
as $fn$
declare
  uid uuid := auth.uid();
  last_at timestamptz;
  cnt integer;
  period_start timestamptz := public.recharge_period_start();
  next_at timestamptz := public.recharge_period_start() + interval '1 day';
  max_per_day integer := public.recharge_max_per_day();
  used integer;
  new_count integer;
  has_pos boolean;
  old_balance numeric;   -- 초기화하기 전 지갑에 있던 돈
  new_balance numeric;
  -- 초기화 뒤 지갑에 남길 금액. 예전에는 '더할 금액' 이었고
  -- 지금은 '만들어 둘 금액' 입니다. 값은 같습니다(100,000).
  -- ★ 금액은 여기서만 정합니다. 브라우저가 정하면 조작됩니다.
  AMOUNT constant numeric := 100000;
begin
  if uid is null then
    raise exception 'not_logged_in';
  end if;

  -- 같은 사용자의 동시 요청으로 두 번 충전되는 것을 막습니다.
  select last_recharge_at, coalesce(recharge_count, 0), coalesce(balance, 0)
    into last_at, cnt, old_balance
    from public.trading_accounts where user_id = uid for update;

  if not found then
    raise exception 'no_account';
  end if;

  select exists(select 1 from public.positions where user_id = uid) into has_pos;
  if has_pos then
    raise exception 'has_position';
  end if;

  used := case when last_at is not null and last_at >= period_start then cnt else 0 end;
  if used >= max_per_day then
    raise exception 'already_claimed';
  end if;
  new_count := used + 1;

  -- ★ 2026-08-26 대표 지시 — 더하기(balance + AMOUNT)에서 덮어쓰기로 바꾸었습니다.
  --   두 번 누르면 두 번 쌓이던 것을 막습니다. 언제 눌러도 결과는 항상 100,000 입니다.
  --
  -- 계급 회계(recharge_total) — '무상으로 받은 돈' 만 쌓습니다.
  --   받은 돈 = AMOUNT - least(AMOUNT, 이전잔고)  =  max(0, AMOUNT - 이전잔고)
  --
  --     이전잔고  30,000 → 받은 돈 70,000  (지갑은 100,000 이 됨)
  --     이전잔고 500,000 → 받은 돈      0  (받은 게 아니라 버린 것입니다)
  --
  --   왜 이렇게 하나
  --     · 돈이 늘어나는 경우: 늘어난 만큼 그대로 쌓여서 계급이 한 칸도 안 움직입니다.
  --       (지금까지 '더하기' 때와 완전히 같은 결과입니다)
  --     · 돈이 줄어드는 경우: 버린 것이라 0 을 쌓고, 지갑이 줄은 만큼 계급도 내려갑니다.
  --       (2026-08-24 대표 결정 "계급은 지갑에 있는 돈으로 평가" 와 같은 방향)
  --     · 이 누계는 절대 줄지 않습니다(음수 없음).
  --       음수가 되면 화면과 서버의 계급이 달라집니다
  --       (js/rank.js 와 rank_recharged_total() 이 음수를 0 으로 막아서).
  --
  -- 계급 공식(1000 × log2(자산/초기자금)) 은 한 글자도 안 건드렸습니다.
  update public.trading_accounts
     set balance = AMOUNT,
         last_recharge_at = now(),
         recharge_count = new_count,
         recharge_total = coalesce(recharge_total, 0) + AMOUNT - least(AMOUNT, greatest(0, old_balance)),
         updated_at = now()
   where user_id = uid
   returning balance into new_balance;

  return json_build_object('balance', new_balance, 'amount', AMOUNT,
                           'previous_balance', old_balance,
                           'delta', AMOUNT - old_balance,
                           'granted', AMOUNT - least(AMOUNT, greatest(0, old_balance)),
                           'used', new_count,
                           'remaining', greatest(max_per_day - new_count, 0),
                           'max_per_day', max_per_day, 'next_at', next_at);
end;
$fn$;

grant execute on function public.claim_daily_recharge to authenticated;


-- ---------------- 4) 계급용 자산 = 지갑 + 묶인 증거금 − 충전받은 돈 ----------------
-- ★ 이번 변경의 핵심입니다. 화면(js/rank.js 의 getRankAssets)과 같은 식이어야 합니다.
--
--   지갑 잔액          trading_accounts.balance   ← 펀딩비가 여기 반영돼 있습니다
--   포지션 증거금      positions.margin           (열려 있는 포지션만 남는 테이블)
--   미체결 주문 증거금 orders.margin  where status = 'OPEN'
--   충전받은 총액      trading_accounts.recharge_total
--
-- realized_pnl 을 쓰지 않습니다 — 거기엔 펀딩비가 안 들어 있어서
-- 그걸 쓰면 대표 결정("지갑에 있는 돈으로 평가")과 어긋납니다.
-- 미실현 손익도 쓰지 않습니다 — 확정 전 숫자라 계급이 출렁입니다.
create or replace function public.rank_assets(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select greatest(0, coalesce((
    select
        coalesce(ta.balance, 0)
      + coalesce((select sum(ps.margin) from public.positions ps
                   where ps.user_id = ta.user_id), 0)
      + coalesce((select sum(o.margin) from public.orders o
                   where o.user_id = ta.user_id and o.status = 'OPEN'), 0)
      - coalesce(ta.recharge_total, 0)
    from public.trading_accounts ta
    where ta.user_id = p_uid
  ), 0));
$fn$;

grant execute on function public.rank_assets to authenticated;
grant execute on function public.rank_assets to anon;


-- ---------------- 5) 계급 점수 = 1000 × log2(자산 / 초기자금) ----------------
-- 공식 자체는 바뀌지 않았습니다. '자산' 의 뜻만 지갑 기준으로 바뀌었습니다.
-- 원금 아래로 내려가면 0점(이병)입니다 — 마이너스 점수는 만들지 않습니다.
create or replace function public.rank_points(p_uid uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select
    greatest(0, coalesce((
      select case
        when ta.initial_balance > 0 and public.rank_assets(p_uid) > 0
        then log(2, public.rank_assets(p_uid) / ta.initial_balance) * 1000
        else 0
      end
      from public.trading_accounts ta
      where ta.user_id = p_uid
    ), 0))
    -- 운영자 가감점은 그대로 더합니다(기존과 동일)
    + coalesce((select pr.rank_points from public.profiles pr where pr.id = p_uid), 0);
$fn$;

grant execute on function public.rank_points to authenticated;
grant execute on function public.rank_points to anon;


-- ---------------- 6) 랭킹표도 같은 점수를 쓰게 ----------------
-- schema-rank-badges.sql 판(tl_earned = TL 화폐)이 살아있으면 랭킹표 계급이
-- 내 화면 계급과 다르게 나옵니다. 여기서 확실히 덮어씁니다.
create or replace function public.rank_points_all(limit_count int default 500)
returns table (nickname text, rank_points numeric)
language sql
stable
security definer
set search_path = public
as $fn$
  select p.nickname, public.rank_points(p.id) as rank_points
  from public.profiles p
  order by public.rank_points(p.id) desc
  limit greatest(1, least(coalesce(limit_count, 500), 2000));
$fn$;

grant execute on function public.rank_points_all to authenticated;
grant execute on function public.rank_points_all to anon;


-- ---------------- 7) 화면이 빼야 할 '충전받은 총액' ----------------
-- js/rank.js 가 이 값을 받아서 뺍니다. 그래야 화면 계급과 서버 계급이
-- 같은 값이 됩니다. 로그인 안 했으면 0 입니다.
--
-- ⚠ 여기서 (지갑 + 증거금) − (초기자금 + 확정손익) 으로 역산하면 안 됩니다.
--   펀딩비가 그 차액에 섞여 있어서, 그렇게 하면 펀딩비를 충전으로 오해해
--   도로 빼버립니다(= 2026-08-24 대표 결정과 반대).
--   반드시 기록된 누계(recharge_total)를 그대로 돌려줍니다.
create or replace function public.rank_recharged_total()
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select greatest(0, coalesce((
    select ta.recharge_total
    from public.trading_accounts ta
    where ta.user_id = auth.uid()
  ), 0));
$fn$;

grant execute on function public.rank_recharged_total to authenticated;
-- 비회원은 볼 지갑이 없으므로(auth.uid() 가 null) 0 이 나옵니다.
grant execute on function public.rank_recharged_total to anon;


-- ---------------- 8) 예전에 받은 충전분 메우기 (1회) ----------------
-- recharge_total 칸은 오늘 만들었으므로, 이 파일을 실행하기 전에 받은
-- 충전은 기록이 없습니다. 아래에서 메웁니다.
--
-- ⚠ 여기만 추정이 섞입니다. 무엇이 사실이고 무엇이 추정인지 구분합니다.
--
--   [사실] last_recharge_at 이 비어 있으면 = 한 번도 충전받은 적이 없음.
--          claim_daily_recharge() 가 충전할 때마다 반드시 채우는 칸입니다.
--          → recharge_total = 0. 아래 UPDATE 가 건드리지 않습니다.
--
--   [추정] last_recharge_at 이 있으면 = 최소 한 번은 받았음. 총액은
--          기록이 없어 아래 둘 중 큰 값으로 잡습니다.
--            (가) recharge_count × 100,000
--                 — 마지막 날 받은 횟수. 확실한 최소치입니다.
--            (나) floor( (지갑 + 증거금 − 초기자금 − 확정손익) / 100,000 )
--                   × 100,000
--                 — 거래로 설명되지 않는 돈을 10만 단위로 내림.
--                   펀딩비가 섞여 있어서 10만 미만 잔돈은 버립니다.
--                   내림이므로 충전을 안 받은 사람이 손해 보지 않습니다.
--
-- ⚠ 실행 전에 아래 9-(가) 확인 쿼리를 먼저 돌려서 몇 명이 해당되는지 보세요.
--   대상이 0명이면 이 UPDATE 는 아무것도 바꾸지 않습니다.
--
-- 이 UPDATE 는 recharge_total 칸만 건드립니다.
-- 지갑(balance) · 확정손익(realized_pnl) · 초기자금(initial_balance) 은
-- 한 글자도 바꾸지 않습니다.
update public.trading_accounts ta
   set recharge_total = greatest(
         coalesce(ta.recharge_count, 0) * 100000,
         floor(
           greatest(0,
             coalesce(ta.balance, 0)
             + coalesce((select sum(ps.margin) from public.positions ps
                          where ps.user_id = ta.user_id), 0)
             + coalesce((select sum(o.margin) from public.orders o
                          where o.user_id = ta.user_id and o.status = 'OPEN'), 0)
             - coalesce(ta.initial_balance, 0)
             - coalesce(ta.realized_pnl, 0)
           ) / 100000
         ) * 100000
       )
 where ta.last_recharge_at is not null
   and coalesce(ta.recharge_total, 0) = 0;


-- ---------------- 9) 확인용 ----------------
-- (가) 예전 충전분 메우기 대상이 누구인가 — 8번을 실행하기 전에 보세요.
--      결과가 0줄이면 아무도 충전받은 적이 없다는 뜻입니다.
-- select p.nickname, ta.last_recharge_at, ta.recharge_count, ta.recharge_total
-- from public.trading_accounts ta
-- join public.profiles p on p.id = ta.user_id
-- where ta.last_recharge_at is not null;

-- (나) 계급표가 새 값으로 바뀌었는지 — 배수 칸이 위 주석과 같아야 합니다.
select rank_id, rank_name, min_points,
       round(power(2, min_points / 1000.0)::numeric, 1) as 배수
from public.ranks
order by rank_id;

-- (다) 누가 어떤 계급이 되는지 — 실행 전후로 돌려서 비교하세요.
--      '계급용자산' 이 지갑 기준으로 바뀌었는지 확인하는 용도입니다.
-- select p.nickname,
--        ta.initial_balance                                   as 초기자금,
--        ta.balance                                           as 지갑,
--        ta.recharge_total                                    as 충전받은총액,
--        round(public.rank_assets(p.id))                      as 계급용자산,
--        round(public.rank_assets(p.id)
--              / nullif(ta.initial_balance, 0), 2)            as 배율,
--        round(public.rank_points(p.id))                      as 계급점수,
--        (select r.rank_name from public.ranks r
--          where r.min_points <= public.rank_points(p.id)
--          order by r.min_points desc limit 1)                as 계급
-- from public.profiles p
-- join public.trading_accounts ta on ta.user_id = p.id
-- order by 계급점수 desc
-- limit 50;

-- (라) 옛 공식과 새 공식의 차이 — 펀딩비가 얼마나 반영됐는지 보입니다.
-- select p.nickname,
--        round(ta.initial_balance + ta.realized_pnl)             as 옛_계급용자산,
--        round(public.rank_assets(p.id))                         as 새_계급용자산,
--        round(public.rank_assets(p.id)
--              - (ta.initial_balance + ta.realized_pnl))         as 차이_주로_펀딩비
-- from public.profiles p
-- join public.trading_accounts ta on ta.user_id = p.id
-- order by 차이_주로_펀딩비 desc;
