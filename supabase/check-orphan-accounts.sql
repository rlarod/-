-- =========================================================================
-- check-orphan-accounts.sql
--   ★지갑 줄이 없는 회원★ 이 지금 몇 명인지 봅니다.  (백로그 TL-016 · P1)
-- =========================================================================
-- ⛔ 이 파일은 읽기만 합니다. ★아무것도 바뀌지 않습니다.★
--    SELECT 만 들어 있습니다.
--    INSERT · UPDATE · DELETE · DROP · ALTER · TRUNCATE · CREATE 가
--    실행문에 ★한 줄도 없습니다.★
--    실행해도 회원 데이터 · 잔고 · 랭킹 · 계급은 하나도 달라지지 않습니다.
--    몇 번을 돌려도 됩니다.
--
-- ── 무엇을 알아보려는 것인가 (2026-08-28 등록, 13일째 미확인) ────────────
--   회원 정보는 표 두 개에 나뉘어 들어갑니다.
--
--       public.profiles           닉네임 · 가입시각          (회원 명부)
--       public.trading_accounts   잔고 · 기준자본 · 실현손익   (지갑)
--
--   가입 때 이 두 줄이 같이 만들어져야 하는데, ★지갑 줄만 안 만들어진 회원★
--   이 생길 수 있습니다. 그러면 그 회원은 랭킹에서 ★통째로 사라집니다.★
--   화면에는 오류가 안 뜹니다. 본인은 "내가 왜 랭킹에 없지" 만 알 뿐입니다.
--
--   ★왜 사라지는가 — 파일에 그대로 적혀 있습니다.★
--       supabase/schema-leaderboard-floor.sql:80
--         from public.trading_accounts ta
--       supabase/schema-leaderboard-floor.sql:81
--         join public.profiles p on p.id = ta.user_id
--
--     랭킹 뷰가 ★지갑 표에서 출발해서★ 회원 명부를 붙입니다(inner join).
--     지갑 줄이 없으면 시작점 자체가 없으니 그 회원은 목록에 안 나옵니다.
--     내 순위(get_my_rank, 같은 파일 :135~:136)도 똑같은 모양이라
--     ★목록에도 없고 내 순위도 안 나옵니다.★
--
--   ⚠ 지금 몇 명인지 아무도 모릅니다. 숫자가 두 번 어긋났습니다.
--       2026-08-28  조사팀   profiles 4명 / 랭킹에 나오는 사람 3명 (김갱TV 없음)
--       2026-09-01  실행분   "전체회원수 3"  ← 이건 trading_accounts 기준입니다
--     서로 다른 시점 · 다른 표를 센 숫자라 ★지금 값이 확정이 안 됩니다.★
--     supabase/health-check.sql 의 ⑮ 는 profiles 만 세고 지갑 표는 안 셉니다.
--     그래서 두 표를 ★같은 순간에 나란히★ 세는 이 파일을 새로 만들었습니다.
--
-- ── 어떻게 실행하나 ──────────────────────────────────────────────────────
--   Supabase SQL Editor 에 이 파일을 통째로 붙여넣고 Run(Ctrl+Enter) 하시면
--   됩니다. 다만 Editor 는 여러 블록을 한 번에 돌리면 ★마지막 표 하나만★
--   보여 줍니다.
--
--   ★1번 블록만 보셔도 답이 나옵니다.★ 1번을 마우스로 드래그해서 선택한 뒤
--   Run 을 눌러 주세요. 그 표 한 줄이 결론입니다.
--   2~6번은 "있다" 가 나왔을 때 누구인지 보려고 두는 상세 블록입니다.
--
-- ── 결과를 어떻게 읽나 ───────────────────────────────────────────────────
--   1번 표의 ★지갑없는_회원수★ 가 결론입니다.
--       0 이면  → 판정 칸에 O 가 뜹니다. ★여기서 닫으셔도 됩니다.★
--       1 이상  → 그 수만큼 랭킹에서 빠져 있습니다. 2번 블록에 명단이 나옵니다.
--
--   1번 표에 ★랭킹뷰_leaderboard★ · ★계급뷰_user_rank_points★ 칸이 있습니다.
--   '없음' 으로 나온 뷰를 쓰는 블록은 오류가 나니 건너뛰세요.
--       leaderboard 없음        → 4번 건너뛰기
--       user_rank_points 없음   → 5번 건너뛰기
--   (2번 · 3번은 회원 명부와 지갑 표만 쓰므로 항상 됩니다)
--
-- ── 닉네임을 왜 찍나 ─────────────────────────────────────────────────────
--   다른 조회 파일은 user_id 앞 8자리만 씁니다. 이 조회는 ★둘 다★ 씁니다.
--   앞 8자리만으로는 "누구를 고쳐줘야 하는지" 를 알 수 없고, 이 건은
--   그 회원의 지갑 줄을 되살려 줘야 끝나기 때문입니다.
--   닉네임은 랭킹 화면에 이미 공개로 나오는 값이라 새로 드러나는 정보가
--   아닙니다. 이메일 · 비밀번호 · 실명은 뽑지 않습니다.
-- =========================================================================


-- =========================================================================
-- 1번 - ★결론. 이것만 보셔도 됩니다★
-- =========================================================================
--   한 줄만 나옵니다. '지갑없는_회원수' 가 이 건의 답입니다.
select
  (select count(*) from public.profiles)                             as 회원명부_profiles,
  (select count(*) from public.trading_accounts)                     as 지갑표_trading_accounts,
  (select count(*)
     from public.profiles p
    where not exists (select 1
                        from public.trading_accounts ta
                       where ta.user_id = p.id))                     as 지갑없는_회원수,
  (select count(*)
     from public.trading_accounts ta
    where not exists (select 1
                        from public.profiles p
                       where p.id = ta.user_id))                     as 주인없는_지갑줄,
  case
    when (select count(*)
            from public.profiles p
           where not exists (select 1
                               from public.trading_accounts ta
                              where ta.user_id = p.id)) = 0
    then 'O — 지갑 줄이 없는 회원이 없습니다. 여기서 닫으셔도 됩니다.'
    else 'X — 이 회원들은 랭킹에서 통째로 빠져 있습니다. 2번 블록에 명단이 나옵니다.'
  end                                                                as 판정,
  case when to_regclass('public.leaderboard') is null
       then '없음 (4번 건너뛰기)' else '있음' end                      as 랭킹뷰_leaderboard,
  case when to_regclass('public.user_rank_points') is null
       then '없음 (5번 건너뛰기)' else '있음' end                      as 계급뷰_user_rank_points;


-- =========================================================================
-- 2번 - 지갑 줄이 없는 회원이 ★누구인지★
-- =========================================================================
--   1번의 '지갑없는_회원수' 가 0 이면 이 표는 비어서 나옵니다. 그게 정상입니다.
select left(p.id::text, 8)                                           as 회원_앞8자리,
       p.nickname                                                    as 닉네임,
       p.created_at                                                  as 가입시각,
       now() - p.created_at                                          as 가입후_경과,
       (select count(*) from public.trades t
         where t.user_id = p.id)                                     as 거래기록_건수,
       (select count(*) from public.positions ps
         where ps.user_id = p.id)                                    as 열린_포지션,
       (select count(*) from public.orders o
         where o.user_id = p.id and o.status = 'OPEN')                as 미체결_주문,
       '지갑 줄 없음 → 랭킹·내순위에서 빠짐'                            as 상태
  from public.profiles p
 where not exists (select 1
                     from public.trading_accounts ta
                    where ta.user_id = p.id)
 order by p.created_at;


-- =========================================================================
-- 3번 - 회원 전체를 한 줄씩. 누가 지갑이 있고 없는지 나란히
-- =========================================================================
--   1번 숫자가 어디서 나온 건지 눈으로 확인하는 표입니다.
--   회원 수가 적으니 전부 나와도 몇 줄 안 됩니다.
select left(p.id::text, 8)                                           as 회원_앞8자리,
       p.nickname                                                    as 닉네임,
       case when ta.user_id is null then 'X 없음' else 'O 있음' end   as 지갑줄,
       ta.balance                                                    as 지갑잔고,
       ta.initial_balance                                            as 기준자본,
       ta.realized_pnl                                               as 실현손익,
       p.created_at                                                  as 가입시각,
       ta.updated_at                                                 as 지갑_마지막수정
  from public.profiles p
  left join public.trading_accounts ta on ta.user_id = p.id
 order by (ta.user_id is null) desc, p.created_at;


-- =========================================================================
-- 4번 - ★랭킹에서 실제로 빠지는지★ 확인   (leaderboard 뷰가 '있음' 일 때만)
-- =========================================================================
--   랭킹 뷰에 그 닉네임이 나오는지 서버에 직접 물어봅니다.
--   '지갑줄 X 없음' 인 사람이 '랭킹표시 X 안 나옴' 이면 이 건이 확정됩니다.
--   ⚠ 1번 표에서 랭킹뷰_leaderboard 가 '없음' 이면 이 블록은 오류가 납니다.
--      그 경우 건너뛰세요. 오류가 나도 바뀌는 것은 없습니다.
--
--   ⚠ leaderboard 뷰는 ★파일이 5벌★ 이고 칸 이름이 서로 다릅니다.
--       schema-leaderboard-floor.sql   ← 정본
--       schema-leaderboard-fix.sql · schema-leaderboard-patch.sql
--       schema-ranking-fix.sql · schema.sql
--     profit_amount · total_asset 는 5벌 중 3벌에만 있고, balance 는 4벌에만
--     있습니다. 서버에 어느 벌이 올라가 있는지는 파일만 봐서 알 수 없으므로
--     이 조회는 ★5벌 전부에 있는 칸(nickname · initial_balance · roe_percent)★
--     만 씁니다. 어느 벌이 올라가 있어도 오류 없이 돕니다.
select left(p.id::text, 8)                                           as 회원_앞8자리,
       p.nickname                                                    as 닉네임,
       case when ta.user_id is null then 'X 없음' else 'O 있음' end   as 지갑줄,
       case when lb.nickname is null then 'X 안 나옴' else 'O 나옴' end as 랭킹표시,
       lb.roe_percent                                                as 랭킹_수익률,
       lb.initial_balance                                            as 랭킹_기준자본
  from public.profiles p
  left join public.trading_accounts ta on ta.user_id = p.id
  left join public.leaderboard lb      on lb.nickname = p.nickname
 order by (lb.nickname is null) desc, p.nickname;


-- =========================================================================
-- 5번 - 계급 뷰에서도 값이 비는지  (user_rank_points 뷰가 '있음' 일 때만)
-- =========================================================================
--   user_rank_points 는 회원 명부에서 출발해 지갑을 붙이는(left join) 뷰라
--   지갑 줄이 없어도 이름은 나오되 ★숫자 칸이 빈 채로★ 나옵니다.
--   (supabase/schema-rank-patch.sql:78)
--   계급 점수는 자산으로 계산하므로 이 칸이 비면 계급도 계산이 안 됩니다.
--   ⚠ 1번 표에서 계급뷰_user_rank_points 가 '없음' 이면 건너뛰세요.
select left(urp.user_id::text, 8)                                    as 회원_앞8자리,
       urp.nickname                                                  as 닉네임,
       urp.initial_balance                                           as 기준자본,
       urp.realized_pnl                                              as 실현손익,
       urp.bonus_points                                              as 보너스점수,
       case when urp.initial_balance is null
            then 'X 자산 없음 → 계급 계산 불가'
            else 'O' end                                             as 상태
  from public.user_rank_points urp
 order by (urp.initial_balance is null) desc, urp.nickname;


-- =========================================================================
-- 6번 - 한 겹 더 위. 로그인 계정은 있는데 ★회원 명부에도 없는★ 사람
-- =========================================================================
--   지갑 줄이 아니라 profiles 줄부터 없는 경우입니다. 이러면 닉네임조차 없어서
--   위 블록들에 아예 안 잡힙니다. 그래서 마지막에 한 번 더 셉니다.
--   ⚠ 권한 때문에 auth 표를 못 읽으면 오류가 납니다. 그때는 건너뛰세요.
select (select count(*) from auth.users)                             as 로그인계정_authusers,
       (select count(*) from public.profiles)                        as 회원명부_profiles,
       (select count(*) from public.trading_accounts)                as 지갑표_trading_accounts,
       (select count(*)
          from auth.users u
         where not exists (select 1
                             from public.profiles p
                            where p.id = u.id))                      as 명부에_없는_계정수,
       case
         when (select count(*)
                 from auth.users u
                where not exists (select 1
                                    from public.profiles p
                                   where p.id = u.id)) = 0
         then 'O — 로그인 계정은 전부 회원 명부에 있습니다.'
         else 'X — 명부 줄부터 없는 계정이 있습니다. 이름도 랭킹도 안 나옵니다.'
       end                                                           as 판정;
