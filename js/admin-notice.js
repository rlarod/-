/* =========================================================================
 * js/admin-notice.js — App.AdminNotice
 * =========================================================================
 * 관리자 창에서 공지를 쓰고 지웁니다.
 *
 * 왜 만들었나
 *   지금까지 공지 4줄은 js/notice-board.js 코드에 박혀 있었습니다.
 *   대표가 공지 하나 바꾸려면 개발자가 코드를 고쳐야 했습니다
 *   (2026-08-25 대표 지적 — "우리 공지 안 띄웠는데 공지 올라와 있다").
 *   이제 표에 넣고 화면에서 관리합니다.
 *
 * 서버는 supabase/schema-notices.sql 입니다.
 * ========================================================================= */

window.App = window.App || {};

App.AdminNotice = (function () {
  "use strict";

  var 목록 = [];

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------- 화면 ---------------- */

  function build() {
    var panel = el("admin-panel");
    if (!panel || el("admin-notice-box")) return false;

    var box = document.createElement("div");
    box.id = "admin-notice-box";
    box.className = "admin-notice-box";
    box.innerHTML =
      '<div class="admin-notice-title">공지 관리</div>' +
      '<div class="admin-notice-form">' +
      '<select id="admin-notice-kind" class="admin-notice-kind">' +
      '<option value="공지">공지</option>' +
      '<option value="안내">안내</option>' +
      '<option value="점검">점검</option>' +
      '<option value="이벤트">이벤트</option>' +
      "</select>" +
      '<input type="text" id="admin-notice-input" class="admin-notice-input" ' +
      'maxlength="200" placeholder="공지 내용을 쓰세요" autocomplete="off">' +
      '<button type="button" class="admin-tool-btn" id="admin-notice-add">올리기</button>' +
      "</div>" +
      '<div class="admin-notice-list" id="admin-notice-list"></div>' +
      '<div class="admin-tool-msg" id="admin-notice-msg"></div>';
    panel.appendChild(box);

    el("admin-notice-add").addEventListener("click", 올리기);
    el("admin-notice-input").addEventListener("keydown", function (e) {
      if (e.key === "Enter") 올리기();
    });
    불러오기();
    return true;
  }

  function 알림(text, kind) {
    var m = el("admin-notice-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "admin-tool-msg" + (kind ? " admin-tool-msg-" + kind : "");
  }

  function 목록그리기() {
    var box = el("admin-notice-list");
    if (!box) return;
    if (!목록.length) {
      box.innerHTML = '<div class="admin-notice-empty">올라간 공지가 없습니다.</div>';
      return;
    }
    box.innerHTML = 목록
      .map(function (n) {
        return (
          '<div class="admin-notice-row">' +
          '<span class="admin-notice-kind-tag">[' + escapeHtml(n.kind) + "]</span>" +
          '<span class="admin-notice-text">' + escapeHtml(n.title) + "</span>" +
          '<button type="button" class="admin-notice-del" data-id="' +
          escapeHtml(n.id) + '">지우기</button>' +
          "</div>"
        );
      })
      .join("");

    box.querySelectorAll(".admin-notice-del").forEach(function (b) {
      b.addEventListener("click", function () {
        지우기(b.getAttribute("data-id"), b);
      });
    });
  }

  /* ---------------- 서버 ---------------- */

  function 오류설명(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/not_admin/.test(m)) return "관리자만 할 수 있습니다.";
    if (/empty_title/.test(m)) return "공지 내용을 입력해주세요.";
    if (/does not exist|schema cache|PGRST202/i.test(m)) {
      return "서버 준비가 안 됐습니다 — supabase/schema-notices.sql 을 먼저 실행해주세요.";
    }
    /* 모르는 오류는 감추지 않습니다. 감추면 원인을 찾을 방법이 없습니다. */
    return "실패했습니다: " + (m || "알 수 없는 오류");
  }

  async function 불러오기() {
    var client = sb();
    if (!client) return;
    try {
      var res = await client.rpc("get_notices", { limit_count: 50 });
      if (res && res.error) throw res.error;
      목록 = Array.isArray(res.data) ? res.data : [];
      목록그리기();
    } catch (e) {
      console.warn("[admin-notice.js] 공지를 불러오지 못했습니다:", e);
      알림(오류설명(e), "err");
    }
  }

  async function 올리기() {
    var input = el("admin-notice-input");
    var kind = el("admin-notice-kind");
    if (!input) return;
    var title = input.value.trim();
    if (!title) return 알림("공지 내용을 입력해주세요.", "err");

    var client = sb();
    if (!client) return 알림("로그인 서버에 연결할 수 없습니다.", "err");

    var btn = el("admin-notice-add");
    if (btn) btn.disabled = true;
    알림("");
    try {
      var res = await client.rpc("add_notice", {
        p_title: title,
        p_kind: kind ? kind.value : "공지",
      });
      if (res && res.error) throw res.error;
      input.value = "";
      알림("공지를 올렸습니다.", "ok");
      await 불러오기();
      /* 내 화면의 공지 영역도 바로 갱신합니다. */
      if (App.NoticeBoard && App.NoticeBoard.loadNotices) App.NoticeBoard.loadNotices();
    } catch (e) {
      console.warn("[admin-notice.js] 공지 올리기 실패:", e);
      알림(오류설명(e), "err");
    }
    if (btn) btn.disabled = false;
  }

  async function 지우기(id, btn) {
    if (!id) return;
    if (!window.confirm("이 공지를 지웁니다. 되돌릴 수 없습니다.\n진행할까요?")) return;

    var client = sb();
    if (!client) return 알림("로그인 서버에 연결할 수 없습니다.", "err");
    if (btn) btn.disabled = true;
    알림("");
    try {
      var res = await client.rpc("delete_notice", { p_id: id });
      if (res && res.error) throw res.error;
      알림("공지를 지웠습니다.", "ok");
      await 불러오기();
      if (App.NoticeBoard && App.NoticeBoard.loadNotices) App.NoticeBoard.loadNotices();
    } catch (e) {
      console.warn("[admin-notice.js] 공지 지우기 실패:", e);
      알림(오류설명(e), "err");
      if (btn) btn.disabled = false;
    }
  }

  /* ---------------- 시작 ---------------- */

  function init() {
    /* 관리자 패널은 관리자로 확인된 뒤에야 나타납니다(admin.js).
       나타날 때까지 지켜보다가 붙입니다. */
    if (!build() && typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () {
        if (build()) mo.disconnect();
      });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, 불러오기: 불러오기, 올리기: 올리기, 지우기: 지우기 };
})();
