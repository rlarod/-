/* =========================================================================
 * js/inline-login.js — App.InlineLogin
 * =========================================================================
 * 전체 화면을 덮는 로그인 창을 없애고, 오른쪽 '내 정보' 칸 안에서
 * 로그인·회원가입을 하게 합니다.
 *
 * ── 로그인 처리는 그대로 재사용합니다 ──────────────────────────────────
 * js/auth.js 는 수정 금지 파일이고, 로그인/회원가입 로직이 전부 그 안에
 * 있습니다. 그래서 로직을 새로 만들지 않습니다.
 *   원래 폼(#auth-gate 안의 입력칸/버튼)을 통째로 '내 정보' 칸으로
 *   옮겨 담습니다. 같은 DOM 요소이므로 auth.js 가 걸어둔 이벤트와
 *   검증·에러 표시가 그대로 살아 있습니다.
 * 껍데기(#auth-gate)만 화면에서 빼고, 알맹이(.auth-card)는 그대로 씁니다.
 *
 * ── 왜 옮기나 ──────────────────────────────────────────────────────────
 * 비회원도 사이트를 둘러볼 수 있어야 하는데, 전체 화면 창이 뜨면
 * 아무것도 못 봅니다. 칸 안에 있으면 구경하면서 로그인할 수 있습니다.
 * ========================================================================= */

window.App = window.App || {};

App.InlineLogin = (function () {
  "use strict";

  var MOVED_FLAG = "data-inline-login";

  function el(id) { return document.getElementById(id); }

  /* 로그인 판단 — App.Auth 에는 isLoggedIn 이 없습니다(init, getNickname 뿐).
     isLoggedIn 을 부르면 항상 false 가 나와 로그인해도 막히는 버그가
     있었습니다. user-panel.js 와 같은 방식으로 닉네임 유무를 봅니다. */
  function isLoggedIn() {
    return !!(App.Auth && typeof App.Auth.getNickname === "function" && App.Auth.getNickname());
  }

  /* '내 정보' 칸의 비회원 영역을 찾습니다. */
  function guestBox() {
    return document.querySelector(".user-panel-guest");
  }

  /* 로그인 폼은 js/user-panel.js 가 '내 정보' 칸 안에 직접 그립니다.
     그 칸은 user-panel.js 가 innerHTML 로 통째로 다시 그리기 때문에,
     밖에서 폼을 옮겨 넣으면 다음 갱신 때 지워집니다(실제로 그랬습니다).
     이 파일은 전체 화면 로그인 창이 뜨지 않게 막는 역할만 합니다.
     원래 폼(#auth-gate)은 화면에서만 숨기고 그대로 둡니다 —
     칸 안의 폼이 그 입력칸에 값을 넘겨 auth.js 로직을 재사용합니다. */

  /* 전체 화면 덮개로는 쓰지 않습니다. */
  function unlockApp() {
    var app = document.querySelector(".app.pending-auth");
    if (app) app.classList.remove("pending-auth");
  }

  function hideGate() {
    var g = el("auth-gate");
    if (!g) return;
    g.style.display = "none";
    unlockApp();
  }

  function refresh() {
    unlockApp();
    hideGate();   // 전체 화면 창은 절대 띄우지 않습니다
  }

  function init() {
    refresh();
    /* 내 정보 칸은 로그인 상태가 바뀔 때마다 다시 그려지므로 따라갑니다. */
    setTimeout(refresh, 800);
    setTimeout(refresh, 2500);
    setInterval(refresh, 5000);
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", refresh);
      App.Bus.on("trading:update", refresh);
    }
    var panel = document.querySelector(".user-panel-box");
    if (panel && typeof MutationObserver !== "undefined") {
      new MutationObserver(function () { refresh(); }).observe(panel, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, refresh: refresh, hideGate: hideGate };
})();
