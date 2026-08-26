-- ############################################################################
-- ##                                                                        ##
-- ##   ⛔ 이 파일을 실행하지 마십시오.  (2026-08-26 봉인)                    ##
-- ##                                                                        ##
-- ##   쓰지 마시오 — 전제가 틀렸습니다.                                     ##
-- ##                                                                        ##
-- ##   이 파일은 "2~6절은 이미 성공했다" 는 전제로 만들었습니다.            ##
-- ##   그런데 그 전제가 틀렸습니다. 서버에는 아무것도 올라가 있지           ##
-- ##   않았습니다. SQL Editor 는 파일 전체를 한 덩어리로 처리해서,          ##
-- ##   7절에서 오류가 나는 순간 2~6절까지 통째로 되돌아갔기 때문입니다.     ##
-- ##                                                                        ##
-- ##   그래서 이 파일을 Run 하면 이런 오류가 납니다.                        ##
-- ##       ERROR: 42883: function public.tl_grant_diff(uuid) does not exist  ##
-- ##   (2026-08-26 에 실제로 두 번 이 오류가 났습니다.)                     ##
-- ##                                                                        ##
-- ##   ★ 대신 이것을 Run 하세요 — 한 번이면 끝납니다                        ##
-- ##                                                                        ##
-- ##       supabase/schema-tl-realtime.sql                                   ##
-- ##                                                                        ##
-- ##   지금 서버 상태가 궁금하시면 (읽기만 합니다)                          ##
-- ##                                                                        ##
-- ##       supabase/조사-TL실시간-서버상태-2026-08-26.sql                    ##
-- ##                                                                        ##
-- ##   아래 내용은 "왜 이런 판단을 했는지" 를 남겨 두려고 지우지 않았을      ##
-- ##   뿐입니다. 실수로 Run 하셔도 아무 일이 없도록 맨 앞에서 멈춥니다.      ##
-- ##                                                                        ##
-- ############################################################################

-- 실수로 Run 해도 아무 일이 없게 맨 앞에서 멈춥니다. 아래 문장은 실행되지 않습니다.
do $seal$
begin
  raise exception '⛔ 이 파일(TL-밀린것채우기-2026-08-26.sql)은 봉인됐습니다. 전제가 틀렸습니다. supabase/schema-tl-realtime.sql 을 Run 하세요.';
end
$seal$;


-- ============================================================================
--
--   (아래는 2026-08-26 당시의 기록입니다. 실행되지 않습니다.)
--
--   TL 실시간 전환 — 7절·8절만 다시 돌립니다
--
--   schema-tl-realtime.sql 을 실행했더니 마지막에 이 오류가 났습니다.
--
--       ERROR: P0001: not_admin
--       CONTEXT: PL/pgSQL function tl_settle_all_past() line 9 at RAISE
--
-- ============================================================================
--
--   왜 그랬나
--
--   7절·8절 함수가 맨 앞에서 "지금 부르는 사람이 관리자냐"를 묻습니다.
--
--       if not public.am_i_admin() then raise exception 'not_admin'; end if;
--
--   그런데 Supabase SQL Editor 는 "로그인한 회원"이 아니라 서버 자신으로
--   실행됩니다. 그래서 auth.uid() 가 비어 있고, 관리자 확인이 항상 실패합니다.
--   화면에서 관리자로 로그인해도 SQL Editor 와는 별개입니다.
--
--   ⛔ 아래 한 문장이 틀렸습니다 (2026-08-26 정정) — 2~6절은 성공하지 않았습니다.
--      확인하지 않고 적은 것이었고, 이 파일이 실패한 진짜 이유입니다.
--
--   ★ 2~6절은 성공했습니다. 트리거가 걸렸으니 앞으로 들어올 거래는
--     이미 실시간으로 지급됩니다. 못 한 것은 아래 둘뿐입니다.
--
--       7절  지금까지 쌓인 거래분 한 번에 지급 (밀린 것 채우기)
--       8절  계산식이 바뀌면서 TL 이 줄어드는 회원에게 그 차액을 채워줌
--
--   이 파일은 그 두 가지를 "관리자 확인만 빼고" 똑같이 합니다.
--   계산식은 한 글자도 바꾸지 않았습니다. 원본 함수의 내용을 그대로 옮겼습니다.
--
-- ============================================================================
--
--   안전한가
--
--   · 회원 정보·거래기록을 지우거나 바꾸지 않습니다
--   · DELETE / UPDATE / TRUNCATE / DROP 이 한 줄도 없습니다. INSERT 만 합니다
--   · 여러 번 실행해도 안전합니다
--       7절 — 두 번째부터는 차액이 0 이라 아무것도 안 합니다
--       8절 — 회원당 평생 1번만 (uq_tl_tx_migration_once 가 막습니다)
--   · 원본 함수(tl_settle_all_past · tl_migrate_legacy)는 그대로 둡니다.
--     관리자 확인도 그대로 살아 있습니다. 이 파일만 우회합니다
--
-- ============================================================================
--
--   대표님이 하실 일
--
--   1. 통째로 복사해서 SQL Editor 에 붙여넣고 Run
--   2. 결과 표 세 개가 나옵니다. 캡처해서 보내주세요
--        ① 밀린 것 채우기 결과
--        ② 보정 지급 결과
--        ③ 회원별 최종 TL
--
--   "Potential issues detected" 가 뜨면 Run without RLS 를 누르시면 됩니다.
--   표를 새로 만들지 않으니 RLS 와 무관합니다.
--
-- ============================================================================


begin;

-- ── 7절) 지금까지 쌓인 거래분 지급 ─────────────────────────────────────────
--
--   원본 tl_settle_all_past() 의 내용 그대로입니다. 관리자 확인만 뺐습니다.
--   실제 계산은 원본 함수 public.tl_grant_diff() 가 합니다 — 손대지 않았습니다.
--
do $$
declare
  r record;
  amt numeric;
  n integer := 0;
  total numeric := 0;
begin
  for r in select pr.id as uid from public.profiles pr
  loop
    amt := coalesce(public.tl_grant_diff(r.uid), 0);
    if amt > 0 then
      n := n + 1;
      total := total + amt;
    end if;
  end loop;

  create temporary table _tl_7절 as
    select n as 지급받은회원수, total as 지급한TL합계;
end $$;


-- ── 8절) 보정 지급 — 아무도 TL 이 줄지 않게 ────────────────────────────────
--
--   원본 tl_migrate_legacy() 의 내용 그대로입니다. 관리자 확인만 뺐습니다.
--   ⚠ 반드시 7절 다음이어야 합니다. 위에서 이미 7절을 마쳤습니다.
--
--   보정액 = max(0,  옛 방식 획득 TL  −  이번에 새로 지급된 합계 )
--   0 이거나 음수면 아무것도 하지 않습니다. 뺏지 않습니다.
--
do $$
declare
  r record;
  legacy numeric;
  paid_sum numeric;
  diff numeric;
  bal numeric;
  n integer := 0;
  total numeric := 0;
begin
  for r in select pr.id as uid from public.profiles pr
  loop
    if exists (select 1 from public.tl_transactions x
                where x.user_id = r.uid and x.type = 'migration') then
      continue;
    end if;

    legacy :=
        coalesce((select count(*) from public.trades t where t.user_id = r.uid), 0) * 10
      + greatest(0, coalesce((
          select case when ta.initial_balance > 0
                      then (ta.realized_pnl / ta.initial_balance) * 100
                      else 0 end
          from public.trading_accounts ta where ta.user_id = r.uid), 0)) * 20
      + coalesce((select pr2.rank_points from public.profiles pr2 where pr2.id = r.uid), 0);

    paid_sum := coalesce(public.tl_paid_total(r.uid), 0);

    diff := legacy - paid_sum;
    if diff is null or diff <= 0 then
      continue;
    end if;

    bal := public.tl_balance(r.uid) + diff;

    insert into public.tl_transactions
      (user_id, type, amount, balance_after, description)
    values
      (r.uid, 'migration', diff, bal, 'TL 계산방식 변경 보정 지급(1회)')
    on conflict do nothing;

    n := n + 1;
    total := total + diff;
  end loop;

  create temporary table _tl_8절 as
    select n as 보정받은회원수, total as 보정한TL합계;
end $$;

commit;


-- ── 결과 확인 ──────────────────────────────────────────────────────────────

select '① 밀린 것 채우기' as 구분, 지급받은회원수, 지급한TL합계 from _tl_7절;

select '② 보정 지급' as 구분, 보정받은회원수, 보정한TL합계 from _tl_8절;

select
  '③ 회원별 최종' as 구분,
  p.nickname                                as 닉네임,
  round(public.tl_earned(p.id))             as 획득TL,
  round(public.tl_balance(p.id))            as 남은TL,
  (select count(*) from public.trades t where t.user_id = p.id)  as 거래건수,
  (select count(*) from public.tl_transactions x
     where x.user_id = p.id)                as TL기록수
from public.profiles p
order by p.nickname;


-- ============================================================================
--
--   결과 읽는 법
--
--   ① 지급받은회원수 — 지난 거래로 TL 을 받은 사람 수
--   ② 보정받은회원수 — 계산식이 바뀌며 TL 이 줄어들 뻔해서 채워준 사람 수
--                      0 이면 아무도 안 줄었다는 뜻입니다. 정상입니다
--   ③ 회원별 최종    — 지금 각자 TL 이 얼마인지
--
--   ⚠ 김갱님은 누적 손실이라 성과 TL 이 0 입니다.
--     참여 TL(거래한 날짜 수 × 5, 상한 150)만 붙습니다.
--     옛 방식(거래 건수 × 10 = 70)보다 줄어드는 만큼은 ②가 채워줍니다.
--
--   되돌리기
--     이 파일은 tl_transactions 에 기록만 더합니다.
--     되돌리려면 그 기록을 지워야 하는데, 회원 재산 기록이라
--     본부장·대표 확인 없이 지우지 마십시오.
--
-- ============================================================================
