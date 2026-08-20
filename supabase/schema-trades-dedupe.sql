-- =========================================================================
-- schema-trades-dedupe.sql — 거래내역 중복 저장 막기 + 기존 중복 정리
-- =========================================================================
-- 문제
--   js/supabase-sync.js 가 "지금까지 몇 건 보냈는지"(lastSyncedTradesCount)를
--   기억하는데, 그 숫자가 페이지를 열 때마다 0 으로 초기화됩니다.
--   그래서 새로고침할 때마다 브라우저에 남아 있는 거래(최대 200건)를
--   통째로 다시 저장했습니다.
--   실측: trades 표에 7,261건 — 200건 x 약 36번 새로고침.
--
--   그 결과 마이페이지 거래내역과 통계가 실제보다 부풀려집니다.
--
-- 왜 서버에서 막는가
--   js/supabase-sync.js 는 수정 금지 파일입니다. 그리고 화면 쪽을 고쳐도
--   이미 들어간 중복은 남습니다. 서버가 걸러내면 어느 화면에서 들어오든
--   한 번만 저장됩니다.
--
-- 어떻게 거르는가
--   같은 사람의 같은 시각(created_at) 거래는 한 건입니다.
--   created_at 은 청산 시각(밀리초)이라 거래마다 다릅니다.
--   이미 있는 거래가 또 들어오면 조용히 무시합니다(오류를 내지 않습니다).
--   오류를 내면 화면이 "저장 실패"로 보고 계속 다시 시도합니다.
--
-- 이 파일은 거래를 지우지 않습니다 — 중복만 남기고 원본 1건은 지킵니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 기존 중복 정리 ----------------
-- 같은 (user_id, created_at) 이 여러 건이면 가장 먼저 들어온 1건만 남깁니다.
-- 실행 전에 몇 건이 지워질지 먼저 보고 싶으면 아래 select 를 돌려보세요.
--
--   select count(*) - count(distinct (user_id, created_at)) as 지워질건수
--   from public.trades;

with 순번 as (
  select
    id,
    row_number() over (
      partition by user_id, created_at
      order by id
    ) as rn
  from public.trades
)
delete from public.trades t
using 순번
where t.id = 순번.id
  and 순번.rn > 1;


-- ---------------- 2) 앞으로 못 들어오게 ----------------
-- 같은 사람의 같은 시각 거래는 하나뿐입니다.
create unique index if not exists idx_trades_user_time
  on public.trades (user_id, created_at);


-- ---------------- 3) 중복이 와도 조용히 넘기기 ----------------
-- 위 인덱스만 있으면 중복 저장 시 오류가 나고, 화면은 "저장 실패"로 보고
-- 계속 다시 시도합니다. 그래서 트리거로 조용히 무시합니다.
create or replace function public.skip_duplicate_trade()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.trades
    where user_id = new.user_id
      and created_at = new.created_at
  ) then
    return null;   -- 이미 있는 거래 — 넣지 않고 조용히 끝냅니다
  end if;
  return new;
end;
$$;

drop trigger if exists trg_skip_duplicate_trade on public.trades;
create trigger trg_skip_duplicate_trade
  before insert on public.trades
  for each row execute function public.skip_duplicate_trade();


-- ---------------- 4) 확인 ----------------
select
  count(*)                                        as 남은거래건수,
  count(*) - count(distinct (user_id, created_at)) as 남은중복건수
from public.trades;
