/* =========================================================================
 * js/guest-access.js — App.GuestAccess
 * =========================================================================
 * 비회원도 홈페이지를 바로 볼 수 있게 합니다.
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────────────────
 * js/auth.js 가 로그인 안 된 상태에서 전체 화면 게이트(#auth-gate)를
 * flex 로 띄웁니다. 그래서 접속하자마자 로그인 화면이 가로막았습니다.
 *
 * ── 어떻게 고쳤나 ───────────────────────────────────────────────────────
 * js/auth.js 는 수정 금지 파일이라 손대지 않습니다.
 * 게이트를 지우지도 않습니다 — 로그인 기능은 그대로 살아 있어야 합니다.
 * 대신 "누가 열었는지"를 구분합니다.
 *   · 자동으로 떠오른 게이트  -> 즉시 닫습니다(비회원도 그냥 둘러봅니다)
 *   · 사용자가 로그인 버튼을 눌러 연 게이트 -> 그대로 보여줍니다
 * 게이트가 열리는지 MutationObserver 로 지켜보다가 판단합니다.
 *
 * 로그인이 필요한 기능(거래·구매 등)은 기존 인증 로직이 그대로 막습니다.
 * 이 파일은 "첫 화면을 가로막지 않는 것"만 담당합니다.
 *
 * 로그인 창을 열어야 할 때는 어디서든 이렇게 부르면 됩니다.
 *   App.GuestAccess.openLogin()
 * ========================================================================= */

window.App = window.App || {};

App.GuestAccess = (function () {
  "use strict";

  var userOpened = false;   // 사용자가 직접 연 상태인가
  var observer = null;

  function gateEl() {
    return document.getElementById("auth-gate");
  }

  function isOpen(g) {
    return g && g.style.display !== "none" && getComputedStyle(g).display !== "none";
  }

  /* 사용자가 명시적으로 로그인 창을 열 때 씁니다. */
  function openLogin() {
    var g = gateEl();
    if (!g) return;
    userOpened = true;
    g.style.display = "flex";
    var input = document.getElementById("auth-nickname-input");
    if (input) {
      try { input.focus(); } catch (e) { /* 무시 */ }
    }
  }

  function closeGate() {
    var g = gateEl();
    if (!g) return;
    userOpened = false;
    g.style.display = "none";
  }

  /* 자동으로 떠오른 게이트만 닫습니다. */
  function guard() {
    var g = gateEl();
    if (!g) return;
    if (isOpen(g) && !userOpened) {
      g.style.display = "none";
    }
  }

  /* 로그인이 필요한 자리에 빈칸 대신 안내를 넣습니다.
     비회원이 들어와도 "왜 비었는지" 알 수 있게 합니다. */
  function markGuestAreas() {
    if (App.Auth && typeof App.Auth.isLoggedIn === "function" && App.Auth.isLoggedIn()) return;
    var input = document.getElementById("chat-input");
    if (input && !input.getAttribute("data-guest-note")) {
      input.setAttribute("data-guest-note", "1");
      input.placeholder = "로그인 후 채팅에 참여할 수 있습니다";
      input.addEventListener("focus", function () {
        input.blur();
        openLogin();
      });
    }
  }

  /* ── 가장 중요한 부분 ──────────────────────────────────────────────
     main.js 는 App.Auth.init() 에게 부팅을 맡기고, auth.js 는
     "로그인에 성공했을 때만" App.bootApp() 을 부릅니다.
     그래서 게이트만 숨기면 비회원은 부팅이 아예 안 돌아
     공지·게시판·차트·호가창이 전부 빈칸으로 남습니다(실제로 그랬습니다).

     로그인을 잠깐 기다린 뒤에도 부팅이 안 됐으면 여기서 직접 띄웁니다.
     App.bootApp 은 auth.js 안에 중복 부팅 방지 장치가 있고, main.js 쪽도
     boot() 를 한 번만 수행하므로 두 번 불려도 안전합니다. */
  /* ── 부팅은 딱 한 번만 ──────────────────────────────────────────────
     App.bootApp() 을 감싸서 "이미 불렸는지"를 확실히 기록합니다.
     화면을 보고 짐작하면(호가 행이 있나 없나 등) 시세가 늦게 올 때
     '아직 안 됐다'고 잘못 판단해 두 번 부팅하게 됩니다.
     두 번 부팅하면 화면이 두 번 만들어져 게시판·랭킹·핫딜까지 전부
     깨집니다(실제로 그랬습니다). 그래서 짐작하지 않고 기록으로 판단합니다. */
  var bootCalled = false;

  function wrapBoot() {
    if (!App.bootApp || App.bootApp.__guestWrapped) return;
    var orig = App.bootApp;
    var wrapped = function () {
      bootCalled = true;
      return orig.apply(this, arguments);
    };
    wrapped.__guestWrapped = true;
    App.bootApp = wrapped;
  }

  /* 로그인을 기다렸는데도 아무도 부팅을 안 했으면 여기서 한 번 띄웁니다. */
  function ensureBooted() {
    wrapBoot();
    if (bootCalled) return;                       // 이미 누가 불렀음
    if (!App.bootApp) return;
    if (App.Auth && typeof App.Auth.isLoggedIn === "function" && App.Auth.isLoggedIn()) return;
    try {
      App.bootApp();                              // 감싸둔 함수라 bootCalled 가 켜집니다
      console.warn("[guest-access.js] 비회원이라 로그인 없이 부팅했습니다.");
    } catch (e) {
      console.warn("[guest-access.js] 비회원 부팅 실패:", e);
    }
  }

  function init() {
    var g = gateEl();
    if (!g) return;

    wrapBoot();
    guard();
    markGuestAreas();
    setTimeout(markGuestAreas, 1500);
    /* 로그인 복구(세션 확인)에 시간이 걸리므로 잠깐 기다렸다 확인합니다. */
    setTimeout(ensureBooted, 1200);
    setTimeout(ensureBooted, 3000);

    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(function () { guard(); });
      observer.observe(g, { attributes: true, attributeFilter: ["style", "class"] });
    }

    /* 로그인 창 안에서 닫기/취소를 누르면 다시 '자동' 상태로 돌립니다. */
    g.addEventListener("click", function (e) {
      if (e.target === g) closeGate(); // 바깥 클릭
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen(gateEl())) closeGate();
    });

    /* 로그인에 성공하면 auth.js 가 알아서 게이트를 닫습니다.
       그때 플래그도 정리해 둡니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", function () { userOpened = false; markGuestAreas(); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, openLogin: openLogin, closeGate: closeGate, markGuestAreas: markGuestAreas, ensureBooted: ensureBooted, isUserOpened: function () { return userOpened; } };
})();
