/* =========================================================================
 * js/admin-menu.js — App.AdminMenu
 * =========================================================================
 * 관리자 창(전체 시즌 초기화)을 거래 화면에서 빼고, 내 정보 하단의
 * "관리자" 메뉴로만 열 수 있게 합니다.
 *
 * 관리자 판정은 하지 않습니다 — js/admin.js가 서버(am_i_admin RPC)에
 * 물어보고 관리자일 때만 #admin-panel의 display를 풀어줍니다. 이 모듈은
 * 그 변화를 지켜보다가 메뉴 버튼을 꺼낼 뿐이라, 권한 검사가 두 곳으로
 * 갈라지지 않습니다. 실제 초기화도 서버에서 관리자 여부를 다시 봅니다.
 *
 * 패널은 DOM에서 옮기기만 합니다(이동은 이벤트 연결을 끊지 않습니다).
 * ========================================================================= */

window.App = window.App || {};

App.AdminMenu = (function () {
  "use strict";

  let panel = null;
  let modal = null;
  let navBtn = null;

  function el(id) {
    return document.getElementById(id);
  }

  function isAdminRevealed() {
    // admin.js가 관리자에게만 인라인 display를 비웁니다.
    return !!panel && panel.style.display !== "none";
  }

  function open() {
    if (!modal) return;
    modal.style.display = "";
  }

  function close() {
    if (!modal) return;
    modal.style.display = "none";
  }

  function ensureNavButton() {
    if (navBtn || !isAdminRevealed()) return;
    const nav = document.querySelector(".page-right .up-nav");
    if (!nav) return;

    navBtn = document.createElement("button");
    navBtn.type = "button";
    navBtn.id = "up-nav-admin";
    navBtn.textContent = "관리자";
    navBtn.addEventListener("click", open);
    nav.appendChild(navBtn);
  }

  function init() {
    panel = el("admin-panel");
    modal = el("admin-modal");
    const slot = el("admin-modal-slot");
    if (!panel || !modal || !slot) return;

    // 패널을 모달 안으로 이동 — 거래 화면에서는 더 이상 보이지 않습니다.
    slot.appendChild(panel);

    const closeBtn = el("admin-modal-close");
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) close(); // 바깥 클릭으로 닫기
    });

    // admin.js가 나중에 관리자 여부를 확인하므로 display 변화를 지켜봅니다.
    new MutationObserver(ensureNavButton).observe(panel, {
      attributes: true,
      attributeFilter: ["style"],
    });
    ensureNavButton();
  }

  return { init, openForTest: open, closeForTest: close, ensureNavForTest: ensureNavButton };
})();
