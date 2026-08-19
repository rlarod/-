/* =========================================================================
 * js/login-required.js — App.LoginRequired
 * =========================================================================
 * 비회원은 화면을 볼 수만 있고, 실제로 뭔가를 "하는" 동작은 막습니다.
 *
 * 왜 필요한가
 *   js/guest-access.js 가 비회원에게 화면을 열어줬는데, 거래 버튼까지
 *   같이 열려서 로그인 없이 매수/매도가 됐습니다.
 *   모의투자라도 잔고·포지션·랭킹이 걸린 동작이라 로그인이 있어야 합니다.
 *
 * 어떻게 막는가
 *   js/trading.js / ui.js / chat.js / board.js 는 수정 금지 파일이라
 *   손대지 않습니다. 대신 두 겹으로 막습니다.
 *     1) 버튼 클릭을 캡처 단계에서 가로채 로그인 창을 띄웁니다.
 *        (캡처 단계라 ui.js 의 원래 처리보다 먼저 실행됩니다)
 *     2) App.Trading 의 주문 함수들을 감싸 혹시 다른 경로로 불려도
 *        비회원이면 거부합니다. 화면만 막으면 우회될 수 있어서입니다.
 *
 * 로그인하면 감싼 함수가 원래대로 통과시키므로, 회원 동작은 그대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.LoginRequired = (function () {
  "use strict";

  /* 로그인해야 쓸 수 있는 버튼들 — 화면에 없으면 조용히 건너뜁니다. */
  var GUARDED_BUTTONS = [
    { id: "btn-long", label: "매수" },
    { id: "btn-short", label: "매도" },
    { id: "chat-send", label: "채팅 전송" },
    { id: "board-write-btn", label: "글쓰기" },
    { id: "board-comment-submit", label: "댓글" },
    { id: "daily-recharge-btn", label: "무료 충전" },
  ];

  /* 서버가 어차피 막지만, 화면에서도 먼저 안내하는 편이 친절합니다. */
  var GUARDED_TRADING = ["openPosition", "placeLimitOrder", "closePosition", "closePartial", "cancelPendingOrder"];

  var notified = 0;

  function isLoggedIn() {
    return !!(App.Auth && typeof App.Auth.isLoggedIn === "function" && App.Auth.isLoggedIn());
  }

  /* '매수은(는)' 처럼 어색하지 않게 받침에 맞는 조사를 붙입니다. */
  function withParticle(word) {
    if (!word) return "";
    var last = word.charCodeAt(word.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return word + "는 "; // 한글이 아니면 기본값
    var hasBatchim = (last - 0xac00) % 28 !== 0;
    return word + (hasBatchim ? "은 " : "는 ");
  }

  function askLogin(what) {
    /* 같은 안내가 연달아 뜨지 않게 잠깐 간격을 둡니다. */
    var now = Date.now();
    if (now - notified > 800) {
      notified = now;
      alert(withParticle(what) + "로그인 후 이용할 수 있습니다.");
    }
    if (App.GuestAccess && typeof App.GuestAccess.openLogin === "function") {
      App.GuestAccess.openLogin();
    }
  }

  /* ---------------- 1) 버튼 가로채기 ---------------- */
  function guardButtons() {
    GUARDED_BUTTONS.forEach(function (item) {
      var btn = document.getElementById(item.id);
      if (!btn || btn.getAttribute("data-login-guarded")) return;
      btn.setAttribute("data-login-guarded", "1");
      btn.addEventListener(
        "click",
        function (e) {
          if (isLoggedIn()) return; // 회원이면 원래대로 진행
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          askLogin(item.label);
        },
        true // 캡처 단계 — ui.js 등의 원래 처리보다 먼저
      );
    });

    /* 채팅 입력칸에서 Enter 로 보내는 경로도 막습니다. */
    var chat = document.getElementById("chat-input");
    if (chat && !chat.getAttribute("data-login-guarded")) {
      chat.setAttribute("data-login-guarded", "1");
      chat.addEventListener(
        "keydown",
        function (e) {
          if (isLoggedIn()) return;
          if (e.key !== "Enter") return;
          e.preventDefault();
          e.stopImmediatePropagation();
          askLogin("채팅");
        },
        true
      );
    }
  }

  /* ---------------- 2) 주문 함수 감싸기 ---------------- */
  function guardTrading() {
    if (!App.Trading || App.Trading.__loginGuarded) return false;
    GUARDED_TRADING.forEach(function (name) {
      var orig = App.Trading[name];
      if (typeof orig !== "function") return;
      App.Trading[name] = function () {
        if (!isLoggedIn()) {
          askLogin("거래");
          return null;
        }
        return orig.apply(App.Trading, arguments);
      };
    });
    App.Trading.__loginGuarded = true;
    return true;
  }

  /* ---------------- 화면 안내 ---------------- */
  function markButtons() {
    var guest = !isLoggedIn();
    GUARDED_BUTTONS.forEach(function (item) {
      var btn = document.getElementById(item.id);
      if (!btn) return;
      btn.classList.toggle("login-required", guest);
      if (guest) btn.setAttribute("title", "로그인 후 이용할 수 있습니다");
      else btn.removeAttribute("title");
    });
  }

  function refresh() {
    guardButtons();
    guardTrading();
    markButtons();
  }

  function init() {
    refresh();
    /* 버튼이 나중에 다시 그려지는 화면(주문창 등)에 대비해 몇 번 더 걸어둡니다. */
    setTimeout(refresh, 1500);
    setTimeout(refresh, 4000);
    setInterval(refresh, 10000);
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", refresh);
      App.Bus.on("trading:update", markButtons);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, refresh: refresh, isLoggedIn: isLoggedIn, askLogin: askLogin, GUARDED_BUTTONS: GUARDED_BUTTONS };
})();
