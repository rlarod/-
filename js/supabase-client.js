/* =========================================================================
 * js/supabase-client.js — App.SupabaseClient
 * =========================================================================
 * Supabase 클라이언트를 딱 한 곳에서만 생성합니다. 다른 모듈(js/auth.js,
 * 그리고 앞으로 추가될 채팅/랭킹 모듈)은 전부 App.SupabaseClient.get()으로만
 * 접근합니다 — client 생성 로직이나 키를 각자 중복해서 갖지 않습니다.
 *
 * ── 키 안전성 ────────────────────────────────────────────────────
 * 여기 있는 키는 "publishable"(예전 anon 키에 해당) 키입니다. 이름 그대로
 * 프론트엔드 코드에 그대로 노출돼도 안전하도록 설계된 키이고, 실제 데이터
 * 접근 제어는 Supabase 쪽 RLS(Row Level Security) 정책이 담당합니다.
 * service_role/secret 키는 이 프로젝트 어디에도 없습니다 — 프론트엔드
 * 전용이라 애초에 넣으면 안 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.SupabaseClient = (function () {
  "use strict";

  const SUPABASE_URL = "https://oxpjpotilcumjqixsdxw.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_b7Ke6jvns7ryO_iHh_lEaQ_rBqh14ij";

  let client = null;
  let warned = false;

  function get() {
    if (client) return client;
    if (typeof window.supabase === "undefined" || typeof window.supabase.createClient !== "function") {
      if (!warned) {
        console.error("[supabase-client.js] Supabase JS 라이브러리를 찾을 수 없습니다(CDN 로딩 실패?) — 로그인/저장 기능이 비활성화됩니다.");
        warned = true;
      }
      return null;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
    return client;
  }

  return { get };
})();
