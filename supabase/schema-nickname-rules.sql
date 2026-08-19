-- =========================================================================
-- 닉네임 규칙 — 서버에서도 강제
-- =========================================================================
-- 지금까지는 '비었는지'와 '12자 이내인지'만 봤습니다.
-- 그래서 이런 닉네임이 다 통과했습니다.
--     "   "          공백만
--     "김 갱"         중간 공백
--     "★★관리자★★"    특수문자 + 사칭
--     "시발"          욕설
--     "a"            한 글자
--
-- 닉네임은 랭킹·게시판·채팅에 그대로 노출되는 이름이라,
-- 한 번 잘못 만들어지면 운영이 곤란해집니다.
--
-- 화면(js/nickname-rules.js)에서도 막지만, 화면 검사만으로는
-- 우회할 수 있으므로 서버에서 한 번 더 막습니다.
-- 두 곳의 규칙은 같아야 합니다.
--
-- 규칙
--   길이      2~12자
--   허용문자  한글, 영문, 숫자, 밑줄(_)
--   금지      공백, 특수문자, 이모지, 자음·모음만, 욕설, 사칭 이름
--
-- 기존 회원은 건드리지 않습니다. 새로 만들거나 바꿀 때만 검사합니다.
-- 테이블은 만들거나 지우지 않습니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 검사 함수 ----------------
create or replace function public.check_nickname()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n text;
  lower_n text;
  w text;
  banned text[] := array[
    '시발','씨발','씨팔','시바','병신','ㅅㅂ','ㅂㅅ','좆','존나',
    '개새','새끼','지랄','닥쳐','꺼져','죽어',
    'fuck','shit','bitch','asshole'
  ];
  reserved text[] := array[
    '관리자','운영자','admin','administrator','master','root',
    'tl','트레이딩리그','tradingleague','공지','notice','system','시스템',
    '봇','bot','탈퇴','익명'
  ];
begin
  -- 닉네임이 바뀌지 않았으면 검사하지 않습니다(기존 회원 보호).
  if tg_op = 'UPDATE' and new.nickname is not distinct from old.nickname then
    return new;
  end if;

  n := btrim(coalesce(new.nickname, ''));

  if n = '' then
    raise exception 'nickname_empty';
  end if;
  if char_length(n) < 2 then
    raise exception 'nickname_too_short';
  end if;
  if char_length(n) > 12 then
    raise exception 'nickname_too_long';
  end if;

  -- 공백(중간 포함)
  if n ~ '\s' then
    raise exception 'nickname_has_space';
  end if;

  -- 한글, 영문, 숫자, 밑줄만
  if n !~ '^[가-힣a-zA-Z0-9_]+$' then
    raise exception 'nickname_bad_char';
  end if;

  -- 자음·모음만 (ㅋㅋㅋ, ㅏㅏㅏ)
  if n ~ '^[ㄱ-ㅎㅏ-ㅣ]+$' then
    raise exception 'nickname_jamo_only';
  end if;

  lower_n := lower(n);

  foreach w in array banned loop
    if position(lower(w) in lower_n) > 0 then
      raise exception 'nickname_banned';
    end if;
  end loop;

  foreach w in array reserved loop
    if lower_n = lower(w) then
      raise exception 'nickname_reserved';
    end if;
  end loop;

  -- 앞뒤 공백은 잘라서 저장합니다.
  new.nickname := n;
  return new;
end;
$$;


-- ---------------- 2) 트리거 ----------------
drop trigger if exists trg_check_nickname on public.profiles;
create trigger trg_check_nickname
  before insert or update on public.profiles
  for each row execute function public.check_nickname();


-- ---------------- 3) 확인 ----------------
select
  tgname          as 트리거,
  tgenabled::text as 상태,
  case tgenabled::text when 'O' then '켜짐 (정상)' else '확인 필요' end as 판정
from pg_trigger
where tgrelid = 'public.profiles'::regclass
  and not tgisinternal;


-- ---------------- 4) 기존 닉네임 점검 ----------------
-- 규칙에 안 맞는 기존 닉네임이 있는지만 봅니다(바꾸지 않습니다).
select
  nickname                                   as 닉네임,
  case
    when char_length(btrim(nickname)) < 2 then '너무 짧음'
    when char_length(btrim(nickname)) > 12 then '너무 김'
    when nickname ~ '\s' then '공백 포함'
    when nickname !~ '^[가-힣a-zA-Z0-9_]+$' then '허용되지 않는 문자'
    else '규칙에 맞음'
  end                                        as 판정
from public.profiles
order by 2, 1;
