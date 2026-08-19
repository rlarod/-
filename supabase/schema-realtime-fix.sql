-- =========================================================================
-- 실시간 채팅 연결 끊김 진단 및 복구
-- =========================================================================
-- 증상
--   채팅 입력칸 아래에 빨간 글씨로
--   '실시간 연결이 끊겼습니다. 자동으로 재연결 중...' 이 계속 깜빡임
--
-- 원인 후보
--   1) chat_messages 가 Realtime 방송 목록에 없음
--   2) Realtime 이 RLS 를 확인하는데 읽기 권한이 막혀 있음
--   3) Supabase 대시보드에서 Realtime 기능 자체가 꺼져 있음
--
-- 이 파일은 1)과 2)를 확인하고 고칩니다.
-- 3)은 대시보드에서 켜야 합니다(아래 안내 참고).
--
-- 조회 -> 복구 -> 재확인 순서로 되어 있습니다.
-- 여러 번 실행해도 안전합니다.
-- =========================================================================


-- ---------------- 1) 지금 상태 확인 ----------------
-- chat_messages 가 목록에 있어야 합니다.
select
  tablename                          as 테이블,
  '방송 중'                          as 상태
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;


-- ---------------- 2) 없으면 추가 ----------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
    raise notice 'chat_messages 를 실시간 방송 목록에 추가했습니다.';
  else
    raise notice 'chat_messages 는 이미 방송 목록에 있습니다.';
  end if;
end $$;


-- ---------------- 3) 변경 내용을 온전히 보내도록 ----------------
-- Realtime 이 새 메시지의 모든 칸을 보내려면 필요합니다.
-- 이게 없으면 일부 값이 비어 오거나 구독이 불안정할 수 있습니다.
alter table public.chat_messages replica identity full;


-- ---------------- 4) 읽기 권한 재확인 ----------------
-- Realtime 은 RLS 를 그대로 따릅니다. 읽기가 막혀 있으면 구독이 끊깁니다.
-- (비회원도 채팅을 볼 수 있어야 하므로 누구나 읽기입니다)
drop policy if exists "chat_select_all" on public.chat_messages;
create policy "chat_select_all" on public.chat_messages
  for select using (true);


-- ---------------- 5) 최종 확인 ----------------
select
  (select count(*) from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'chat_messages')                     as 방송등록,
  (select count(*) from pg_policies
    where schemaname = 'public' and tablename = 'chat_messages'
      and cmd = 'SELECT' and qual = 'true')                as 누구나읽기,
  (select relreplident from pg_class
    where oid = 'public.chat_messages'::regclass)::text    as 변경내용전송;
-- 방송등록 1 / 누구나읽기 1 / 변경내용전송 f  가 나오면 정상입니다.
-- ('f' 는 full 을 뜻합니다)


-- =========================================================================
-- 위 결과가 모두 정상인데도 계속 끊긴다면
-- =========================================================================
-- Supabase 대시보드에서 Realtime 기능 자체를 확인해야 합니다.
--   1) 왼쪽 메뉴 Database -> Replication
--   2) supabase_realtime 항목에서 chat_messages 가 켜져 있는지 확인
--   3) 꺼져 있으면 켜기
--
-- 무료 요금제는 동시 접속 수 제한이 있어, 여러 탭을 열어두면
-- 연결이 끊길 수 있습니다. 탭을 하나만 남겨 보고 증상이 사라지는지
-- 확인해 보세요.
-- =========================================================================
