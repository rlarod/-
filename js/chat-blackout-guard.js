/* =========================================================================
 * js/chat-blackout-guard.js — App.ChatBlackoutGuard
 * =========================================================================
 * 채팅창이 "영구히 비어 버리는" 조용한 고장을 막습니다.
 * js/chat.js 는 수정 금지 파일이라 한 글자도 건드리지 않고, 밖에서 감쌉니다.
 *
 * ── 무슨 일이 일어나나 (조사팀 재현) ───────────────────────────────────
 *   채팅 불러오기가 3초만 실패해도        글 8줄 -> 0줄
 *   연결이 정상으로 돌아온 뒤 8초         여전히 0줄
 *   그 뒤 122초 (성공 조회 100회 이상)    여전히 0줄
 *   새로고침 전까지 안 돌아옵니다. 오류창도 없습니다.
 *   회원은 "글이 하나도 없구나" 로 믿습니다.
 *
 * ── 원인 두 가지 ───────────────────────────────────────────────────────
 *
 *   (A) 지운 줄이 영영 안 돌아온다
 *       js/chat.js:141~144  조회가 한 번 실패하면 renderEmpty() 가
 *                           #chat-messages 를 통째로 비웁니다.
 *       js/chat.js:38       그런데 지운 메시지 id 는 seenIds 에 그대로 남습니다.
 *       js/chat.js:84       다음에 성공적으로 받아와도 "이미 본 것" 이라며
 *                           하나도 안 그립니다.  -> 영구 0줄
 *
 *   (B) 1초 주기 재연결 무한고리
 *       js/chat.js:160  removeChannel(channel) 을 부르면 supabase-js 가
 *                       그 채널의 subscribe 콜백을 CLOSED 로 되부릅니다.
 *       js/chat.js:181  chat.js 는 그걸 "연결이 끊겼다" 로 보고 재연결을 예약합니다.
 *       js/chat.js:177  새 채널이 붙으면 시도횟수를 0 으로 되돌리므로
 *                       간격이 1초에 고정됩니다.
 *       -> 내가 지운 채널이 나를 다시 깨우는 고리. 진짜 끊김 한 번이
 *          영원히 끝나지 않는 1초 주기 루프가 됩니다(24분 44초에 879건).
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 *
 *   (1) 고리 끊기 — client.channel()/removeChannel() 을 감쌉니다.
 *       "내가 지운 채널" 로 표시해 두고, 그 채널이 뒤늦게 보내는 상태알림
 *       (CLOSED 등)은 chat.js 에게 전달하지 않습니다.
 *       내가 지우지 않은 채널이 스스로 끊긴 것(CHANNEL_ERROR/TIMED_OUT/CLOSED)은
 *       그대로 통과시킵니다 — 진짜 자동 재연결은 살아 있어야 합니다.
 *
 *   (2) 지워진 줄 되살리기 — #chat-messages 를 지켜보다가
 *       "채팅을 불러오지 못했습니다." 안내가 뜨면서 글줄이 통째로 사라지면,
 *       방금 사라진 그 노드들을 그대로 다시 붙입니다.
 *       * 다시 조회하지 않고 원래 노드를 되돌리므로
 *         chat.js 의 seenIds 와 화면이 항상 일치합니다(중복이 생길 수 없습니다).
 *
 *   (3) 처음부터 못 불러온 경우 — 되살릴 줄이 아예 없으면(부팅 때 실패)
 *       우리가 직접 최대 3번까지 다시 조회해서 그려 넣습니다.
 *       이때 그린 줄에는 data-chat-guard="1" 을 붙여두고, 나중에 chat.js 가
 *       같은 메시지를 그리면 우리 줄만 조용히 걷어냅니다(중복 방지).
 *
 * ── 건드리지 않는 것 ───────────────────────────────────────────────────
 *   "아직 대화가 없습니다" 는 되살리지 않습니다 — 서버가 정말 0건이라고
 *   답한 경우(관리자 채팅 초기화 포함)라서 되살리면 안 됩니다.
 *   메시지 전송, 실시간 수신, 재연결 백오프는 전부 chat.js 그대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChatBlackoutGuard = (function () {
  "use strict";

  var LOAD_FAIL_TEXT = "채팅을 불러오지 못했습니다.";
  var CHAT_TOPIC_PREFIX = "chat_messages_live_";
  var TABLE = "chat_messages";
  var LOAD_COUNT = 50;                       // chat.js 의 INITIAL_LOAD_COUNT 와 동일
  var REFETCH_DELAYS = [1000, 3000, 6000];   // 되살릴 줄이 없을 때만. 최대 3번

  /* 관측용 계수기 — 테스트/실측에서 읽습니다 */
  var stats = {
    swallowedCloses: 0,   // 되쏘는 CLOSED 를 막은 횟수
    restoredRows: 0,      // 되살린 줄 수
    restoreEvents: 0,     // 되살리기가 일어난 횟수
    refetches: 0,         // 우리가 직접 조회한 횟수
    refetchRows: 0,       // 우리가 직접 그린 줄 수
    dedupedRows: 0        // chat.js 와 겹쳐서 걷어낸 우리 줄 수
  };

  /* ------------------------------------------------------------------ */
  /* (1) 내가 지운 채널이 나를 다시 깨우지 못하게                        */
  /* ------------------------------------------------------------------ */

  function markRemoved(ch) {
    if (!ch || typeof ch !== "object") return;
    try { ch.__chatGuardRemoved = true; } catch (e) { /* noop */ }
  }
  function isRemoved(ch) {
    return !!(ch && ch.__chatGuardRemoved);
  }

  function patchClient(client) {
    if (!client || client.__chatBlackoutGuardPatched) return client;
    if (typeof client.channel !== "function" || typeof client.removeChannel !== "function") return client;
    client.__chatBlackoutGuardPatched = true;

    var origChannel = client.channel.bind(client);
    var origRemove = client.removeChannel.bind(client);

    client.channel = function (topic) {
      var ch = origChannel.apply(null, arguments);
      if (typeof topic !== "string" || topic.indexOf(CHAT_TOPIC_PREFIX) !== 0) return ch;
      if (!ch || typeof ch.subscribe !== "function" || ch.__chatGuardWrapped) return ch;
      ch.__chatGuardWrapped = true;

      var origSubscribe = ch.subscribe.bind(ch);
      ch.subscribe = function (cb) {
        var args = Array.prototype.slice.call(arguments);
        if (typeof cb !== "function") return origSubscribe.apply(null, args);
        args[0] = function () {
          /* 내가 지운 채널이 뒤늦게 보내는 알림은 chat.js 에 전하지 않습니다.
             (이게 1초 주기 재연결 무한고리의 시작점이었습니다) */
          if (isRemoved(ch)) {
            stats.swallowedCloses++;
            return;
          }
          return cb.apply(this, arguments);
        };
        return origSubscribe.apply(null, args);
      };
      return ch;
    };

    client.removeChannel = function (ch) {
      markRemoved(ch);          // 지우기 전에 표시 — CLOSED 가 동기로 올 수 있습니다
      return origRemove.apply(null, arguments);
    };

    return client;
  }

  function install() {
    if (!window.App || !App.SupabaseClient || typeof App.SupabaseClient.get !== "function") return false;
    if (App.SupabaseClient.__chatBlackoutGuardWrapped) return true;
    var origGet = App.SupabaseClient.get;
    App.SupabaseClient.get = function () {
      return patchClient(origGet.apply(App.SupabaseClient, arguments));
    };
    App.SupabaseClient.__chatBlackoutGuardWrapped = true;
    return true;
  }

  /* ------------------------------------------------------------------ */
  /* (2)(3) 비어 버린 채팅창 되살리기                                     */
  /* ------------------------------------------------------------------ */

  var box = null;
  var refetchStep = 0;
  var refetchTimer = null;

  function isLoadFailRow(node) {
    return !!(node && node.nodeType === 1 &&
      node.classList && node.classList.contains("chat-empty") &&
      (node.textContent || "").indexOf(LOAD_FAIL_TEXT) !== -1);
  }
  function failRowIn(el) {
    if (!el) return null;
    var kids = el.children || [];
    for (var i = 0; i < kids.length; i++) if (isLoadFailRow(kids[i])) return kids[i];
    return null;
  }
  function msgCount(el) {
    return el ? el.querySelectorAll(".chat-msg").length : 0;
  }
  function scrollToBottom() {
    if (box) box.scrollTop = box.scrollHeight;
  }

  /* chat.js 가 그린 줄과 우리가 그린 줄이 같은 메시지인지 알아보는 표식 */
  function signature(row) {
    if (!row || row.nodeType !== 1) return "";
    var nick = row.querySelector(".chat-msg-nick");
    var time = row.querySelector(".chat-msg-time");
    var text = row.querySelector(".chat-msg-text");
    return [
      nick ? nick.textContent : "",
      time ? time.textContent : "",
      text ? text.textContent : ""
    ].join("");
  }

  function isGuardRow(node) {
    return !!(node && node.nodeType === 1 && node.getAttribute &&
      node.getAttribute("data-chat-guard") === "1");
  }

  function fmtTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    var pad = function (n) { return String(n).padStart(2, "0"); };
    return pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  /* chat.js 의 appendMessageEl 과 같은 모양으로 그립니다(아이콘 글자는 뺍니다 —
     js/no-emoji.js 가 어차피 지웁니다). */
  function buildRow(msg) {
    var row = document.createElement("div");
    var isEvent = msg && msg.message_type === "trade_event";
    row.className = isEvent ? "chat-msg chat-msg-event" : "chat-msg";
    row.setAttribute("data-chat-guard", "1");

    if (!isEvent) {
      var nick = document.createElement("span");
      nick.className = "chat-msg-nick";
      nick.textContent = (msg && msg.nickname) || "";
      row.appendChild(nick);
    } else {
      var icon = document.createElement("span");
      icon.className = "chat-event-icon";
      row.appendChild(icon);
    }
    var time = document.createElement("span");
    time.className = "chat-msg-time";
    time.textContent = fmtTime(msg && msg.created_at);
    row.appendChild(time);

    var text = document.createElement("div");
    text.className = "chat-msg-text";
    text.textContent = (msg && msg.message) || "";
    row.appendChild(text);
    return row;
  }

  /* 우리가 그린 줄 중, chat.js 가 방금 그린 줄과 같은 메시지인 것을 걷어냅니다 */
  function dropOurDuplicates(addedRows) {
    if (!box || !addedRows.length) return;
    var ours = box.querySelectorAll(".chat-msg[data-chat-guard='1']");
    if (!ours.length) return;
    var incoming = {};
    for (var i = 0; i < addedRows.length; i++) incoming[signature(addedRows[i])] = true;
    for (var j = 0; j < ours.length; j++) {
      if (incoming[signature(ours[j])]) {
        /* ⭐ 되돌이 구멍 막기 (2026-08-28 기록팀 지적) —
           여기서 지운 줄이 곧바로 관찰기에 "사라진 글줄" 로 잡힙니다.
           그때 마침 실패 안내가 떠 있으면 방금 내가 지운 줄을 내가 되살립니다.
           표시를 남겨서 "내가 일부러 지운 것" 은 되살리지 않게 합니다. */
        try { ours[j].__guardDropped = true; } catch (e) { /* noop */ }
        ours[j].remove();
        stats.dedupedRows++;
      }
    }
  }

  /* 되살릴 줄이 아예 없을 때만 — 우리가 직접 조회해서 그립니다 */
  function scheduleRefetch() {
    if (refetchTimer || refetchStep >= REFETCH_DELAYS.length) return;
    var delay = REFETCH_DELAYS[refetchStep++];
    refetchTimer = setTimeout(function () {
      refetchTimer = null;
      refetch();
    }, delay);
  }

  function refetch() {
    if (!box) return;
    if (!failRowIn(box) || msgCount(box) > 0) return;   // 이미 회복됨
    var client = App.SupabaseClient ? App.SupabaseClient.get() : null;
    if (!client || typeof client.from !== "function") return;

    stats.refetches++;
    var q;
    try {
      q = client.from(TABLE).select("*").order("created_at", { ascending: false }).limit(LOAD_COUNT);
    } catch (e) {
      scheduleRefetch();
      return;
    }
    Promise.resolve(q).then(function (res) {
      if (!res || res.error) { scheduleRefetch(); return; }
      if (!box || !failRowIn(box) || msgCount(box) > 0) return;
      var rows = (res.data || []).slice().reverse();
      if (!rows.length) return;   // 정말 0건이면 안내문을 그대로 둡니다
      var fail = failRowIn(box);
      if (fail) fail.remove();
      rows.forEach(function (m) {
        box.appendChild(buildRow(m));
        stats.refetchRows++;
      });
      scrollToBottom();
      console.warn("[chat-blackout-guard.js] 채팅을 직접 다시 불러왔습니다: " + rows.length + "줄");
    }).catch(function () {
      scheduleRefetch();
    });
  }

  function onMutations(records) {
    if (!box) return;

    /* 이번 묶음에서 사라진 글줄과 새로 붙은 글줄을 모읍니다 */
    var removedRows = [];
    var addedRows = [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var rm = rec.removedNodes || [];
      for (var a = 0; a < rm.length; a++) {
        var n = rm[a];
        if (n && n.nodeType === 1 && n.classList && n.classList.contains("chat-msg") &&
            !n.__guardDropped) {                 // 내가 일부러 지운 줄은 되살리지 않습니다
          removedRows.push(n);
        }
      }
      var ad = rec.addedNodes || [];
      for (var b = 0; b < ad.length; b++) {
        var m = ad[b];
        if (m && m.nodeType === 1 && m.classList && m.classList.contains("chat-msg") && !isGuardRow(m)) {
          addedRows.push(m);
        }
      }
    }

    if (addedRows.length) dropOurDuplicates(addedRows);

    var fail = failRowIn(box);
    if (!fail) return;

    if (removedRows.length) {
      /* (2) 방금 지워진 줄을 그대로 되돌립니다 — 다시 조회하지 않습니다 */
      fail.remove();
      for (var k = 0; k < removedRows.length; k++) box.appendChild(removedRows[k]);
      stats.restoreEvents++;
      stats.restoredRows += removedRows.length;
      scrollToBottom();
      console.warn("[chat-blackout-guard.js] 조회 실패로 지워진 채팅 " + removedRows.length + "줄을 되살렸습니다.");
      return;
    }

    /* (3) 되살릴 게 없으면(부팅 때 실패) 우리가 직접 다시 불러옵니다 */
    if (msgCount(box) === 0) scheduleRefetch();
  }

  function init() {
    install();
    box = document.getElementById("chat-messages");
    if (!box || typeof MutationObserver === "undefined") return;
    if (box.__chatGuardObserved) return;
    box.__chatGuardObserved = true;
    new MutationObserver(onMutations).observe(box, { childList: true });
    /* 이미 실패 안내가 떠 있는 상태로 늦게 켜진 경우 */
    if (failRowIn(box) && msgCount(box) === 0) scheduleRefetch();
  }

  /* supabase 클라이언트 감싸기는 chat.js 의 init() 보다 먼저 걸려 있어야 합니다.
     그래서 화면 준비를 기다리지 않고 지금 바로 겁니다. */
  if (!install()) {
    var tries = 0;
    var t = setInterval(function () {
      if (install() || ++tries > 100) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    install: install,
    patchClient: patchClient,
    stats: stats,
    LOAD_FAIL_TEXT: LOAD_FAIL_TEXT
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChatBlackoutGuard;
