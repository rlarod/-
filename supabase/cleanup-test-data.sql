-- =========================================================================
-- 기존 테스트 데이터 전체 초기화 (실제 서비스 시작 전 1회만 실행)
-- =========================================================================
-- 이 파일은 테이블 구조를 전혀 건드리지 않습니다. DROP TABLE / TRUNCATE는
-- 없습니다.
--
-- auth.users에서 행을 지우면, on delete cascade로 걸어둔 외래키 덕분에
-- 아래 테이블들이 전부 자동으로 함께 정리됩니다(따로따로 DELETE할 필요
-- 없음):
--   profiles, trading_accounts, positions, orders, trades,
--   chat_messages, admin_users
--
-- Supabase 공식 문서/커뮤니티에서 auth.users를 SQL Editor에서 직접
-- DELETE하는 것은 지원되는 방법입니다(관리자 정리 작업 시 흔히 쓰임).
--
-- 주의: 이 SQL은 "지금 있는 사용자를 전부" 지웁니다. 실제 서비스 시작
-- 직전, 테스트 계정만 남아있는 상태에서 1번만 실행하세요. 이후에는
-- 절대 이 SQL을 다시 실행하면 안 됩니다(진짜 사용자까지 지워짐).
-- =========================================================================

delete from auth.users where id is not null;

-- app_meta(season_version 등)는 auth.users와 무관하게 독립적으로
-- 남아있습니다 — 필요 없으면 그대로 두셔도 되고, 시즌 번호도 1로
-- 되돌리고 싶으시면 아래 줄의 주석(--)을 지우고 실행하세요.
-- update public.app_meta set value = '1' where key = 'season_version';
