/* =========================================================================
 * js/chat.js — App.Chat
 * =========================================================================
 * "💬 실시간 채팅" 패널. 거래엔진/랭킹과 완전히 독립된 모듈입니다.
 * trading.js는 여기서 전혀 참조하지 않습니다.
 *
 * ── Realtime (Polling 아님) ──────────────────────────────────────
 * 최근 50개는 최초 1회 REST로 불러오고, 이후 새 메시지는
 * Supabase Realtime(postgres_changes INSERT 구독)으로만 받습니다.
 * setInterval로 DB를 반복 조회하지 않습니다.
 *
 * ── 닉네임 위조 방지 ─────────────────────────────────────────────
 * 실제 저장되는 nickname은 DB 트리거(set_chat_nickname)가 profiles
 * 테이블 값으로 강제로 덮어씁니다(supabase/schema-chat-patch.sql).
 * 여기서 보내는 nickname은 트리거 적용 전 안전망일 뿐, 최종적으로는
 * 항상 서버가 검증한 값이 저장됩니다.
 *
 * ── 중복 방지 ────────────────────────────────────────────────────
 * 최초 조회와 Realtime 이벤트가 겹칠 수 있어서, 메시지 id를 Set으로
 * 추적해서 이미 표시한 메시지는 다시 그리지 않습니다.
 *
 * ── 자동 스크롤 ──────────────────────────────────────────────────
 * 사용자가 맨 아래 근처에 있을 때만 새 메시지 도착 시 자동으로
 * 아래로 이동합니다. 위로 스크롤해서 과거 메시지를 보는 중이면
 * 강제로 이동시키지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Chat = (function () {
  "use strict";

  const MAX_MESSAGE_LEN = 200;
  const INITIAL_LOAD_COUNT = 50;
  const NEAR_BOTTOM_THRESHOLD = 40; // px

  let dom = {};
  const seenIds = new Set();
  let channel = null;

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function getUserId(client) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return data.session.user.id;
    } catch (e) {
      return null;
    }
  }

  function setErr(msg) {
    if (dom.err) dom.err.textContent = msg || "";
  }

  function fmtTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function isNearBottom() {
    if (!dom.messages) return true;
    const el2 = dom.messages;
    return el2.scrollHeight - el2.scrollTop - el2.clientHeight < NEAR_BOTTOM_THRESHOLD;
  }
  function scrollToBottom() {
    if (dom.messages) dom.messages.scrollTop = dom.messages.scrollHeight;
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function appendMessageEl(msg, opts) {
    if (seenIds.has(msg.id)) return; // 중복 방지(초기 조회 + Realtime 겹침 대비)
    seenIds.add(msg.id);

    const wasNearBottom = opts && opts.forceScroll ? true : isNearBottom();

    if (dom.emptyRow) {
      dom.emptyRow.remove();
      dom.emptyRow = null;
    }

    const row = document.createElement("div");
    row.className = "chat-msg";
    row.innerHTML =
      '<span class="chat-msg-nick">' + escapeHtml(msg.nickname) + "</span>" +
      '<span class="chat-msg-time">' + fmtTime(msg.created_at) + "</span>" +
      '<div class="chat-msg-text">' + escapeHtml(msg.message) + "</div>";
    dom.messages.appendChild(row);

    if (wasNearBottom) scrollToBottom();
  }

  function renderEmpty(text) {
    dom.messages.innerHTML = "";
    const row = document.createElement("div");
    row.className = "chat-empty";
    row.textContent = text;
    dom.messages.appendChild(row);
    dom.emptyRow = row;
  }

  /* ---------------- 최근 메시지 불러오기(최초 1회) ---------------- */
  async function loadRecent(client) {
    try {
      const { data, error } = await client
        .from("chat_messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(INITIAL_LOAD_COUNT);
      if (error) throw error;

      const rows = (data || []).slice().reverse(); // 오래된 것 → 최신 순으로 표시
      if (rows.length === 0) {
        renderEmpty("아직 대화가 없습니다. 첫 메시지를 남겨보세요!");
        return;
      }
      rows.forEach((m) => appendMessageEl(m));
      scrollToBottom(); // 최초 로딩은 항상 맨 아래에서 시작
    } catch (e) {
      console.warn("[chat.js] 최근 메시지 조회 실패:", e);
      renderEmpty("채팅을 불러오지 못했습니다.");
    }
  }

  /* ---------------- Realtime 구독 ---------------- */
  function subscribeRealtime(client) {
    try {
      channel = client
        .channel("chat_messages_live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
          appendMessageEl(payload.new);
        })
        .subscribe((status) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn("[chat.js] 실시간 채팅 연결에 문제가 발생했습니다(상태: " + status + ").");
            setErr("실시간 연결이 불안정합니다. 새로고침해보세요.");
          }
        });
    } catch (e) {
      console.warn("[chat.js] Realtime 구독 실패:", e);
      setErr("실시간 채팅 연결에 실패했습니다.");
    }
  }

  /* ---------------- 메시지 전송 ---------------- */
  async function sendMessage() {
    setErr("");
    const raw = (dom.input.value || "").trim();

    if (!raw) {
      setErr("메시지를 입력해주세요.");
      return;
    }
    if (raw.length > MAX_MESSAGE_LEN) {
      setErr("메시지는 " + MAX_MESSAGE_LEN + "자 이내로 입력해주세요.");
      return;
    }

    const client = sb();
    if (!client) {
      setErr("서버 연결을 사용할 수 없습니다.");
      return;
    }
    const userId = await getUserId(client);
    if (!userId) {
      setErr("로그인 후 채팅을 이용할 수 있습니다.");
      return;
    }

    const nickname = App.Auth ? App.Auth.getNickname() : null;

    dom.sendBtn.disabled = true;
    try {
      const { error } = await client.from("chat_messages").insert({
        user_id: userId,
        nickname: nickname || "익명", // 실제 저장값은 서버 트리거가 profiles 기준으로 덮어씀(안전망 차원)
        message: raw,
      });
      if (error) throw error;
      dom.input.value = "";
      // 화면에는 여기서 직접 추가하지 않습니다 — 본인 메시지도 Realtime
      // 구독으로 되돌아와서 표시되므로, 다른 사용자 메시지와 동일한
      // 경로로만 렌더링되게 해서 중복/불일치 위험을 없앴습니다.
    } catch (e) {
      console.warn("[chat.js] 메시지 전송 실패:", e);
      setErr("메시지 전송에 실패했습니다. 다시 시도해주세요.");
    } finally {
      dom.sendBtn.disabled = false;
      dom.input.focus();
    }
  }

  function bindEvents() {
    dom.sendBtn.addEventListener("click", sendMessage);
    dom.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendMessage();
    });
  }

  async function init() {
    dom = {
      messages: el("chat-messages"),
      input: el("chat-input"),
      sendBtn: el("chat-send-btn"),
      err: el("chat-err"),
    };
    if (!dom.messages || !dom.input || !dom.sendBtn) return; // 패널 DOM 없으면 조용히 종료

    const client = sb();
    if (!client) {
      renderEmpty("서버 연결을 사용할 수 없습니다.");
      dom.input.disabled = true;
      dom.sendBtn.disabled = true;
      return;
    }

    bindEvents();
    await loadRecent(client);
    subscribeRealtime(client);
  }

  return { init };
})();
