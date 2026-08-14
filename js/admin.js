/* =========================================================================
 * js/admin.js — App.Admin
 * =========================================================================
 * "⚠️ 관리자 — 전체 시즌 초기화" 버튼. 일반 사용자에게는 기본적으로
 * 숨겨져 있고(display:none, style.css), am_i_admin() RPC가 true를
 * 반환할 때만 보여줍니다.
 *
 * ── 보안 ─────────────────────────────────────────────────────────
 * 버튼을 숨기는 건 UX일 뿐, 실제 보안은 서버(reset_season() 함수 내부의
 * admin_users 체크)가 담당합니다. 이 파일의 checkAdminAndReveal()이
 * 실패하거나 조작당해도, 관리자가 아닌 사용자가 reset_season()을
 * 직접 호출하면 서버에서 예외가 발생해서 아무 것도 안 바뀝니다.
 * ========================================================================= */

window.App = window.App || {};

App.Admin = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function checkAdminAndReveal() {
    const client = sb();
    if (!client || !dom.panel) return;
    try {
      const { data, error } = await client.rpc("am_i_admin");
      if (error) throw error;
      if (data === true) {
        dom.panel.style.display = "";
      }
    } catch (e) {
      console.warn("[admin.js] 관리자 확인 실패(버튼은 계속 숨김 상태 유지):", e);
    }
  }

  function openConfirm() {
    if (dom.overlay) dom.overlay.style.display = "flex";
  }
  function closeConfirm() {
    if (dom.overlay) dom.overlay.style.display = "none";
  }

  async function runReset() {
    const client = sb();
    if (!client) return;
    dom.okBtn.disabled = true;
    dom.cancelBtn.disabled = true;
    const originalText = dom.okBtn.textContent;
    dom.okBtn.textContent = "초기화 중...";
    try {
      const { error } = await client.rpc("reset_season");
      if (error) throw error;
      closeConfirm();
      alert("전체 시즌 초기화가 완료되었습니다. 페이지를 새로고침합니다.");
      window.location.reload();
    } catch (e) {
      console.warn("[admin.js] 시즌 초기화 실패:", e);
      alert("초기화에 실패했습니다: " + (e.message || e));
      dom.okBtn.disabled = false;
      dom.cancelBtn.disabled = false;
      dom.okBtn.textContent = originalText;
    }
  }

  function bindEvents() {
    dom.resetBtn.addEventListener("click", openConfirm);
    dom.cancelBtn.addEventListener("click", closeConfirm);
    dom.okBtn.addEventListener("click", runReset);
  }

  function init() {
    dom = {
      panel: el("admin-panel"),
      resetBtn: el("admin-reset-btn"),
      overlay: el("admin-confirm-overlay"),
      cancelBtn: el("admin-confirm-cancel"),
      okBtn: el("admin-confirm-ok"),
    };
    if (!dom.panel || !dom.resetBtn || !dom.overlay) return; // 패널 DOM 없으면 조용히 종료

    bindEvents();
    checkAdminAndReveal();
  }

  return { init };
})();
