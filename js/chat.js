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
    // 거래 이벤트(청산 시 자동 생성, js/trade-events-chat.js)는 일반 채팅과
    // 색상/아이콘을 다르게 — 요구사항: 일반 채팅과 거래 이벤트를 명확히 구분
    const isTradeEvent = msg.message_type === "trade_event";
    row.className = isTradeEvent ? "chat-msg chat-msg-event" : "chat-msg";
    if (isTradeEvent) {
      row.innerHTML =
        '<span class="chat-event-icon">⚡</span>' +
        '<span class="chat-msg-time">' + fmtTime(msg.created_at) + "</span>" +
        '<div class="chat-msg-text">' + escapeHtml(msg.message) + "</div>";
    } else {
      row.innerHTML =
        '<span class="chat-msg-nick">' + escapeHtml(msg.nickname) + "</span>" +
        '<span class="chat-msg-time">' + fmtTime(msg.created_at) + "</span>" +
        '<div class="chat-msg-text">' + escapeHtml(msg.message) + "</div>";
    }
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

  /* ---------------- Realtime 구독(자동 재연결 포함) ----------------
   * 버그 수정: 예전엔 연결이 끊기면(CHANNEL_ERROR/TIMED_OUT/CLOSED)
   * 에러 메시지만 띄우고 사용자가 직접 새로고침해야만 복구됐습니다.
   * 이제 지수 백오프로 자동 재연결을 시도하고, 재연결에 성공하면 그
   * 사이에 놓쳤을 수 있는 메시지를 다시 불러옵니다(seenIds로 중복 방지).
   * ------------------------------------------------------------- */
  const RECONNECT_BASE_DELAY_MS = 1000;
  const RECONNECT_MAX_DELAY_MS = 15000;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function subscribeRealtime(client) {
    try {
      if (channel) {
        try {
          client.removeChannel(channel);
        } catch (e) {
          /* noop */
        }
      }
      channel = client
        .channel("chat_messages_live_" + Date.now()) // 매번 새 이름 — 이전 좀비 구독과 안 겹치게
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, (payload) => {
          appendMessageEl(payload.new);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            if (reconnectAttempts > 0) {
              loadRecent(client); // 끊겨있던 동안 놓친 메시지 보충(중복은 seenIds가 막아줌)
            }
            reconnectAttempts = 0;
            setErr("");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            console.warn("[chat.js] 실시간 채팅 연결 끊김(상태: " + status + ") — 자동 재연결 시도합니다.");
            scheduleReconnect(client);
          }
        });
    } catch (e) {
      console.warn("[chat.js] Realtime 구독 실패:", e);
      scheduleReconnect(client);
    }
  }

  function scheduleReconnect(client) {
    if (reconnectTimer) return; // 이미 재연결이 예약돼 있으면 중복 예약 방지
    reconnectAttempts++;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * Math.pow(1.6, reconnectAttempts - 1), RECONNECT_MAX_DELAY_MS);
    setErr("실시간 연결이 끊겼습니다. 자동으로 재연결 중...");
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      subscribeRealtime(client);
    }, delay);
  }

  /* ---------------- 메시지 전송 ---------------- */
  const MIN_SEND_INTERVAL_MS = 1500; // 서버 트리거(1.5초)와 동일하게 맞춰서 즉각적인 피드백을 줌
  const BASIC_BANNED_WORDS = ["시발", "씨발", "씨팔", "병신", "ㅅㅂ", "ㅂㅅ", "좆", "개새끼", "fuck", "shit"];
  let lastSentAt = 0;

  function containsBannedWord(text) {
    const lower = text.toLowerCase();
    return BASIC_BANNED_WORDS.some((w) => lower.includes(w.toLowerCase()));
  }

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
    // 클라이언트 쪽 즉각 피드백용 검사 — 진짜 강제력은 서버 트리거
    // (schema-chat-safety-patch.sql)가 담당합니다. 이 검사를 우회해도
    // 서버에서 다시 막힙니다.
    const sinceLastSend = Date.now() - lastSentAt;
    if (lastSentAt > 0 && sinceLastSend < MIN_SEND_INTERVAL_MS) {
      setErr("메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.");
      return;
    }
    if (containsBannedWord(raw)) {
      setErr("부적절한 표현이 포함되어 있어 전송할 수 없습니다.");
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
      lastSentAt = Date.now();
      dom.input.value = "";
      // 화면에는 여기서 직접 추가하지 않습니다 — 본인 메시지도 Realtime
      // 구독으로 되돌아와서 표시되므로, 다른 사용자 메시지와 동일한
      // 경로로만 렌더링되게 해서 중복/불일치 위험을 없앴습니다.
    } catch (e) {
      console.warn("[chat.js] 메시지 전송 실패:", e);
      const msg = (e && e.message) || "";
      if (msg.includes("rate_limited")) {
        setErr("메시지를 너무 빠르게 보내고 있어요. 잠시 후 다시 시도해주세요.");
      } else if (msg.includes("profanity_detected")) {
        setErr("부적절한 표현이 포함되어 있어 전송할 수 없습니다.");
      } else {
        setErr("메시지 전송에 실패했습니다. 다시 시도해주세요.");
      }
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
