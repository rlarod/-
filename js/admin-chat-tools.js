/* =========================================================================
 * js/admin-chat-tools.js — App.AdminChatTools
 * =========================================================================
 * 관리자 창에 채팅 관리 버튼 두 개를 붙입니다.
 *
 *   채팅방 얼리기   — 회원들이 채팅을 못 쓰게 합니다(관리자는 계속 가능)
 *   채팅방 초기화   — 채팅을 전부 지웁니다
 *
 * js/admin.js 와 js/chat.js 는 수정 금지 파일이라 건드리지 않습니다.
 * 관리자 패널(#admin-panel) 안에 버튼만 덧붙이고, 실제 동작은 서버 함수를
 * 부릅니다(supabase/schema-admin-chat.sql).
 *
 * ── 왜 서버에서 막는가 ──────────────────────────────────────────────────
 * 화면에서 입력칸만 잠그면 개발자 도구로 우회할 수 있습니다. 그래서 서버
 * 트리거가 거절하게 만들어 뒀고, 화면 잠금은 "쓸 수 없다는 걸 보여주는"
 * 역할만 합니다. 둘 다 있어야 안전하면서도 답답하지 않습니다.
 *
 * ── 되돌릴 수 없는 일에는 확인을 받습니다 ───────────────────────────────
 * 채팅 초기화는 되돌릴 수 없습니다. 시즌 초기화와 같은 방식으로
 * 확인창을 한 번 거칩니다.
 * ========================================================================= */

window.App = window.App || {};

App.AdminChatTools = (function () {
  "use strict";

  var 잠김 = false;
  var 준비됨 = false;

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 화면 ---------------- */

  function build() {
    var panel = el("admin-panel");
    if (!panel || el("admin-chat-tools")) return false;

    var wrap = document.createElement("div");
    wrap.id = "admin-chat-tools";
    wrap.className = "admin-chat-tools";
    wrap.innerHTML =
      '<div class="admin-tool-row">' +
      '<button type="button" class="admin-tool-btn" id="admin-chat-lock-btn">채팅방 얼리기</button>' +
      '<span class="admin-tool-desc" id="admin-chat-lock-desc">회원들이 채팅을 쓸 수 없게 합니다</span>' +
      "</div>" +
      '<div class="admin-tool-row">' +
      '<button type="button" class="admin-tool-btn admin-tool-danger" id="admin-chat-clear-btn">채팅방 초기화</button>' +
      '<span class="admin-tool-desc">지금까지의 채팅을 전부 지웁니다 (되돌릴 수 없습니다)</span>' +
      "</div>" +
      '<div class="admin-tool-msg" id="admin-chat-msg"></div>';
    panel.appendChild(wrap);

    el("admin-chat-lock-btn").addEventListener("click", 잠금전환);
    el("admin-chat-clear-btn").addEventListener("click", 초기화확인);
    return true;
  }

  function 알림(text, kind) {
    var m = el("admin-chat-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "admin-tool-msg" + (kind ? " admin-tool-msg-" + kind : "");
  }

  function 버튼갱신() {
    var btn = el("admin-chat-lock-btn");
    var desc = el("admin-chat-lock-desc");
    if (!btn) return;
    btn.textContent = 잠김 ? "채팅방 풀기" : "채팅방 얼리기";
    btn.classList.toggle("admin-tool-on", 잠김);
    if (desc) {
      desc.textContent = 잠김
        ? "지금 얼어 있습니다 — 회원들이 채팅을 쓸 수 없습니다"
        : "회원들이 채팅을 쓸 수 없게 합니다";
    }
  }

  /* ---------------- 서버 ---------------- */

  async function 상태읽기() {
    var client = sb();
    if (!client) return;
    try {
      var res = await client.rpc("is_chat_locked");
      if (res && res.error) throw res.error;
      잠김 = !!res.data;
      준비됨 = true;
    } catch (e) {
      /* 서버 함수가 아직 없으면(SQL 미실행) 조용히 넘어갑니다.
         버튼을 눌렀을 때 안내가 나가므로 여기서 경고를 띄우지 않습니다. */
      준비됨 = false;
      console.warn("[admin-chat-tools.js] 채팅 잠금 상태를 읽지 못했습니다:", e);
    }
    버튼갱신();
    잠금화면반영();
  }

  function 서버오류설명(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/not_admin/.test(m)) return "관리자만 할 수 있습니다.";
    if (/does not exist|schema cache|PGRST202/i.test(m)) {
      return "서버 준비가 안 됐습니다 — supabase/schema-admin-chat.sql 을 먼저 실행해주세요.";
    }
    if (/permission denied/i.test(m)) {
      return "서버가 권한을 거부했습니다 — 채팅 표의 삭제 권한 문제입니다. (" + m + ")";
    }
    /* 모르는 오류는 감추지 않고 그대로 보여줍니다.
       '실패했습니다' 만 띄우면 원인을 찾을 방법이 없습니다
       (2026-08-20 채팅 초기화가 이 메시지만 남기고 막혔습니다). */
    return "실패했습니다: " + (m || "알 수 없는 오류") + (err && err.code ? " [" + err.code + "]" : "");
  }

  async function 잠금전환() {
    var client = sb();
    if (!client) return 알림("로그인 서버에 연결할 수 없습니다.", "err");
    var 목표 = !잠김;
    var btn = el("admin-chat-lock-btn");
    if (btn) btn.disabled = true;
    알림("");
    try {
      var res = await client.rpc("set_chat_locked", { p_locked: 목표 });
      if (res && res.error) throw res.error;
      잠김 = !!res.data;
      버튼갱신();
      잠금화면반영();
      알림(잠김 ? "채팅방을 얼렸습니다." : "채팅방을 풀었습니다.", "ok");
    } catch (e) {
      console.warn("[admin-chat-tools.js] 채팅 잠금 전환 실패:", e);
      알림(서버오류설명(e), "err");
    }
    if (btn) btn.disabled = false;
  }

  function 초기화확인() {
    if (!window.confirm("채팅을 전부 지웁니다.\n되돌릴 수 없습니다. 진행할까요?")) return;
    초기화();
  }

  async function 초기화() {
    var client = sb();
    if (!client) return 알림("로그인 서버에 연결할 수 없습니다.", "err");
    var btn = el("admin-chat-clear-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "지우는 중...";
    }
    알림("");
    try {
      var res = await client.rpc("clear_chat_messages");
      if (res && res.error) throw res.error;
      var n = typeof res.data === "number" ? res.data : 0;
      알림(n.toLocaleString("ko-KR") + "개의 채팅을 지웠습니다.", "ok");
    } catch (e) {
      console.warn("[admin-chat-tools.js] 채팅 초기화 실패:", e);
      알림(서버오류설명(e), "err");
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "채팅방 초기화";
    }
  }

  /* ---------------- 회원 화면에 잠금 알리기 ----------------
   * 서버가 이미 막고 있지만, 눌러도 아무 일이 없으면 고장으로 보입니다.
   * 입력칸을 비활성화하고 이유를 적어 줍니다.
   * js/chat.js 는 건드리지 않고 DOM 만 손댑니다. */

  /* 실시간 채팅 입력칸만 고릅니다.
     .chat-input 클래스는 게시판 댓글 입력칸(#board-comment-input)도 같이
     쓰고 있어서, 클래스로만 고르면 채팅을 얼릴 때 댓글까지 잠깁니다
     (2026-08-20 실측으로 발견). 채팅 입력칸은 id 가 chat-input 하나뿐입니다. */
  function 채팅입력칸들() {
    var one = el("chat-input");
    return one ? [one] : [];
  }

  function 채팅전송버튼들() {
    var one = el("chat-send-btn");
    if (one) return [one];
    /* id 가 없는 화면을 대비해 채팅 패널 안에서만 찾습니다(댓글 영역 제외). */
    return Array.prototype.slice.call(
      document.querySelectorAll(".page-chat-panel .chat-send-btn, .side-chat-panel .chat-send-btn")
    );
  }

  /* 안내는 우리가 만든 줄에 적습니다.
     입력칸의 안내 글자(placeholder)를 바꿔봤더니 js/chat.js 가 화면을 다시
     그릴 때마다 원래 문구로 되돌려놨습니다(2026-08-20 실측). chat.js 는
     수정 금지라, 그쪽이 건드리지 않는 자리를 따로 만들어 씁니다. */
  function 안내줄() {
    var 있는것 = el("chat-locked-notice");
    if (있는것) return 있는것;
    var input = el("chat-input");
    var row = input ? input.closest(".chat-input-row") : null;
    if (!row || !row.parentNode) return null;
    var d = document.createElement("div");
    d.id = "chat-locked-notice";
    d.className = "chat-locked-notice";
    d.textContent = "관리자가 채팅방을 잠갔습니다";
    row.parentNode.insertBefore(d, row);
    return d;
  }

  function 잠금화면반영() {
    채팅입력칸들().forEach(function (input) {
      input.disabled = 잠김 || input.dataset.guestDisabled === "1";
      if (잠김) input.disabled = true;
    });
    채팅전송버튼들().forEach(function (b) {
      if (잠김) b.disabled = true;
    });
    var n = 안내줄();
    if (n) n.style.display = 잠김 ? "" : "none";
  }

  /* js/chat.js 가 입력칸을 다시 살려놓는 경우가 있어, 잠긴 동안에는
     계속 지켜보다가 다시 잠급니다. 서버가 이미 막고 있으므로 안전에는
     영향이 없고, 눌러도 아무 일이 없는 답답함만 없애는 장치입니다. */
  function 감시시작() {
    if (typeof MutationObserver === "undefined") return;
    var input = el("chat-input");
    var row = input ? input.closest(".chat-input-row") : null;
    if (!row) return;
    var mo = new MutationObserver(function () {
      if (!잠김) return;
      /* 이미 잠겨 있으면 아무것도 하지 않습니다.
         그냥 다시 잠그면 그 변경이 감시에 또 걸려 무한히 돌게 됩니다
         (2026-08-20 실측 — 화면이 멈췄습니다). 바뀐 게 있을 때만 손댑니다. */
      var input = el("chat-input");
      var btn = el("chat-send-btn");
      var 풀려있음 = (input && !input.disabled) || (btn && !btn.disabled);
      if (!풀려있음) return;
      잠금화면반영();
    });
    mo.observe(row, { attributes: true, subtree: true, attributeFilter: ["disabled", "placeholder"] });
  }

  /* ---------------- 시작 ---------------- */

  function init() {
    /* 관리자 패널은 관리자로 확인된 뒤에야 화면에 나타납니다(admin.js).
       그래서 나타날 때까지 지켜보다가 버튼을 붙입니다. */
    if (!build() && typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () {
        if (build()) {
          버튼갱신();
          mo.disconnect();
        }
      });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }
    상태읽기();
    감시시작();
    /* 다른 관리자가 잠갔을 수도 있으니 가끔 다시 확인합니다.
       채팅은 실시간이라 잠금만 늦게 반영되면 어색합니다. */
    setInterval(상태읽기, 30000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    상태읽기: 상태읽기,
    잠금화면반영: 잠금화면반영,
    isLocked: function () {
      return 잠김;
    },
  };
})();
