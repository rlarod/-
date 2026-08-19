/* =========================================================================
 * js/chat-status-calm.js — App.ChatStatusCalm
 * =========================================================================
 * 실시간 채팅 재연결 안내가 계속 깜빡이는 것을 가라앉힙니다.
 *
 * ── 무엇이 거슬리나 ────────────────────────────────────────────────────
 * js/chat.js 는 연결이 끊기면 빨간 글씨로 안내를 띄우고, 붙으면 지웁니다.
 *     '실시간 연결이 끊겼습니다. 자동으로 재연결 중...'
 * 재연결 로직 자체는 잘 만들어져 있습니다(점점 간격을 늘려가며 재시도).
 *
 * 문제는 연결이 자주 끊겼다 붙으면 이 글씨가 켜졌다 꺼졌다를 반복해
 * 화면이 계속 깜빡인다는 점입니다. 실제로 채팅은 곧 돌아오는데도
 * 사용자는 뭔가 크게 잘못된 줄 압니다.
 *
 * ── 어떻게 가라앉히나 ──────────────────────────────────────────────────
 *   · 끊겼다는 안내를 바로 띄우지 않고 3초 기다립니다.
 *     그 안에 다시 붙으면 아예 보여주지 않습니다(대부분 여기서 끝납니다).
 *   · 3초를 넘겨 진짜 끊긴 상태면 그때 보여줍니다.
 *   · 한 번 띄운 뒤에는 껐다 켰다 하지 않고 붙을 때까지 그대로 둡니다.
 *   · 색도 빨강(오류) 대신 흐린 안내색으로 낮춥니다 —
 *     오류가 아니라 '복구 중' 이니까요.
 *
 * js/chat.js 는 건드리지 않습니다. 문구를 담는 칸(#chat-err)만 지켜봅니다.
 * 다른 오류 문구(전송 실패, 금지어 등)는 그대로 빨갛게 보여줍니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChatStatusCalm = (function () {
  "use strict";

  var HOLD_MS = 3000;          // 이 시간 안에 회복되면 안 보여줍니다
  var RECONNECT_TEXT = "실시간 연결이 끊겼습니다";

  var pendingTimer = null;
  var showing = false;

  function isReconnectMsg(text) {
    return typeof text === "string" && text.indexOf(RECONNECT_TEXT) !== -1;
  }

  function apply(box) {
    var text = box.textContent || "";

    /* 재연결 안내가 아니면(진짜 오류) 그대로 둡니다. */
    if (!isReconnectMsg(text)) {
      if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
      if (text === "") showing = false;
      box.classList.remove("chat-err-calm");
      box.classList.remove("chat-err-hold");
      return;
    }

    /* 이미 보여주고 있으면 다시 손대지 않습니다(깜빡임 방지). */
    if (showing) {
      box.classList.remove("chat-err-hold");
      box.classList.add("chat-err-calm");
      return;
    }

    /* 잠깐 끊긴 것일 수 있으니 조금 기다렸다 판단합니다.
       주의: 여기서 문구를 지우면 내 MutationObserver 가 다시 불려
       '빈 문자열' 을 보고 상태를 초기화해 버립니다. 그러면 오래 끊겨도
       영영 안 보입니다(처음에 그렇게 만들어 안 보였습니다).
       그래서 글자는 그대로 두고 화면에서만 잠깐 감춥니다. */
    if (pendingTimer) return;
    box.classList.add("chat-err-hold");   // CSS 로만 감춤
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      /* 그새 회복돼 문구가 사라졌으면 아무것도 하지 않습니다. */
      if (!isReconnectMsg(box.textContent || "")) {
        box.classList.remove("chat-err-hold");
        return;
      }
      showing = true;
      box.classList.remove("chat-err-hold");
      box.classList.add("chat-err-calm");
    }, HOLD_MS);
  }

  function init() {
    var box = document.getElementById("chat-err");
    if (!box || typeof MutationObserver === "undefined") return;
    apply(box);
    new MutationObserver(function () { apply(box); })
      .observe(box, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, isReconnectMsg: isReconnectMsg, HOLD_MS: HOLD_MS };
})();
