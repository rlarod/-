/* =========================================================================
 * js/chat-split.js — App.ChatSplit
 * =========================================================================
 * 채팅 칸에 섞여 있던 두 가지를 분리합니다.
 *
 *   ⚡ 자동 알림(누가 익절/손절/강제청산) → 화면 위쪽 얇은 가로 띠로 "흐르게"
 *   💬 실제 대화                          → 오른쪽 채팅 칼럼에 그대로 (항상 열림)
 *
 * ★ 2026-08-24 대표 지시 — "그냥 채팅 열고 닫고 지워버리자. 항상 열려있는걸로 하자."
 *   접었다 폈다 하는 상태를 없앴습니다. 지운 것:
 *     · localStorage("tl.chat.open") 저장·복원
 *     · #chat-toggle-btn / #chat-fab 클릭 리스너
 *     · 안 읽은 개수 배지(접힌 상태가 없으니 띄울 자리가 없습니다)
 *   마크업은 index.html 에 그대로 두고 style.css 에서만 숨깁니다(원칙 1-2).
 *   대가: 1920 에서 차트가 61.7% -> 47.0% (채팅 칸 23%가 항상 자리를 차지).
 *   되살리려면 아래 "항상 열림" 블록을 예전 readStored/setOpen 으로 되돌리고
 *   style.css 의 html[data-chat="off"] 주석을 풀면 됩니다.
 *
 * 1440 실측 기준 채팅 13줄 중 10줄이 자동 알림이었습니다. 그 알림 하나 때문에
 * 오른쪽 세로 칸 23%를 통째로 쓰고 있었고, 그만큼 차트가 좁았습니다(1920 42.4%).
 *
 * ── 수정 금지 파일을 한 글자도 건드리지 않습니다 ──────────────────────────
 * js/chat.js 는 #chat-messages 안에 .chat-msg / .chat-msg-event 를 그립니다.
 * 이 모듈은 그 DOM 을 "관찰만" 해서 알림 줄을 띠로 복제합니다. 원본 줄은
 * 지우지 않고 CSS(html[data-tt="1"])로 숨기기만 하므로, 이 스크립트를 빼면
 * 즉시 예전 모습으로 돌아갑니다.
 *
 * 되돌리기: index.html 에서 이 <script> 한 줄과 #trade-ticker / #chat-fab /
 *           #chat-toggle-btn 마크업을 지우고, style.css 의
 *           "채팅 분리(알림 띠)" 블록을 지우면 원상복구됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChatSplit = (function () {
  "use strict";

  const MAX_ITEMS = 20;      // 띠에 유지하는 최대 알림 수(오래된 것부터 버림)
  const PX_PER_SEC = 70;     // 흐르는 속도 — 읽을 수 있는 정도로 느리게
  const MIN_SEC = 18;

  let track = null;
  let viewport = null;
  let emptyEl = null;
  let items = [];            // {text, kind}

  /* ---------------- 항상 열림 (2026-08-24 대표 지시) ----------------
   * 예전에는 readStored()/setOpen() 이 localStorage 를 읽고 써서
   * data-chat 을 on/off 로 오갔습니다. 지금은 켜는 것 하나뿐입니다.
   * 되살리려면 이 블록을 readStored/applyOpen/setOpen/isOpen/renderBadge
   * 네 함수로 되돌리고, style.css 의 html[data-chat="off"] 주석을 푸세요.
   */

  function applyAlwaysOpen() {
    document.documentElement.setAttribute("data-chat", "on");
    // 마크업은 남아 있으므로(CSS 로만 숨김) 보조기술에도 상태를 맞춰 둡니다.
    const btn = document.getElementById("chat-toggle-btn");
    if (btn) {
      btn.setAttribute("aria-expanded", "true");
      btn.setAttribute("hidden", "hidden");
    }
    const fab = document.getElementById("chat-fab");
    if (fab) {
      fab.setAttribute("aria-expanded", "true");
      fab.setAttribute("hidden", "hidden");
    }
    const badge = document.getElementById("chat-fab-badge");
    if (badge) badge.hidden = true;
  }

  function isOpen() {
    return true;
  }

  /* ---------------- ⚡ 알림 띠 ---------------- */

  function kindOf(row) {
    if (row.classList.contains("chat-event-liq")) return "liq";
    if (row.classList.contains("chat-event-loss")) return "loss";
    if (row.classList.contains("chat-event-profit")) return "profit";
    // chat-event-style.js 가 아직 색을 안 붙였을 때를 위한 예비 판정
    const t = row.textContent || "";
    if (/강제청산/.test(t)) return "liq";
    if (/손절/.test(t)) return "loss";
    if (/익절/.test(t)) return "profit";
    return "";
  }

  function textOf(row) {
    const el = row.querySelector(".chat-msg-text");
    return ((el ? el.textContent : row.textContent) || "").trim();
  }

  function makeItem(it) {
    const span = document.createElement("span");
    span.className = "tt-item" + (it.kind ? " tt-" + it.kind : "");
    const mark = document.createElement("span");
    mark.className = "tt-mark";
    mark.textContent = it.kind === "profit" ? "▲" : it.kind ? "▼" : "⚡";
    const txt = document.createElement("span");
    txt.className = "tt-text";
    txt.textContent = it.text;
    span.appendChild(mark);
    span.appendChild(txt);
    return span;
  }

  // 끊김 없이 흐르게 하려고 같은 목록을 두 벌 이어 붙이고 -50% 까지 움직입니다.
  function renderTrack() {
    if (!track) return;
    track.textContent = "";
    if (!items.length) {
      if (emptyEl) emptyEl.hidden = false;
      track.style.animation = "none";
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    const half = document.createElement("span");
    half.className = "tt-half";
    items.forEach((it) => half.appendChild(makeItem(it)));
    const copy = half.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    track.appendChild(half);
    track.appendChild(copy);

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      track.style.animation = "none";
      return;
    }
    // 폭을 재서 속도를 일정하게 유지합니다(내용이 길어져도 읽는 속도는 같게).
    requestAnimationFrame(() => {
      const w = half.getBoundingClientRect().width;
      const sec = Math.max(MIN_SEC, Math.round(w / PX_PER_SEC));
      track.style.animation = "tt-scroll " + sec + "s linear infinite";
    });
  }

  function pushRow(row) {
    if (!row || row.nodeType !== 1) return false;
    if (!row.classList || !row.classList.contains("chat-msg-event")) return false;
    if (row.dataset.ttPushed === "1") return true;
    row.dataset.ttPushed = "1";
    const text = textOf(row);
    if (!text) return true;
    items.push({ text: text, kind: kindOf(row) });
    if (items.length > MAX_ITEMS) items = items.slice(items.length - MAX_ITEMS);
    return true;
  }

  /* ---------------- 초기화 ---------------- */

  function init() {
    const box = document.getElementById("chat-messages");
    const ticker = document.getElementById("trade-ticker");

    // 채팅은 항상 열려 있습니다. 띠가 없어도 이건 켜 둡니다(둘은 독립).
    applyAlwaysOpen();

    if (!box || !ticker) {
      // 띠를 못 만들면 알림을 숨기면 안 됩니다 — data-tt 를 켜지 않아
      // 채팅 목록에 알림이 그대로 남습니다(조용한 고장 방지).
      return;
    }

    track = document.getElementById("trade-ticker-track");
    viewport = ticker.querySelector(".tt-viewport");
    emptyEl = document.getElementById("trade-ticker-empty");
    if (!track) return;

    // 이제부터 알림 줄은 띠가 책임집니다.
    document.documentElement.setAttribute("data-tt", "1");

    box.querySelectorAll(".chat-msg-event").forEach(pushRow);
    renderTrack();

    new MutationObserver((muts) => {
      let changed = false;
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (pushRow(n)) changed = true;
        });
      });
      // 안 읽음 배지는 없앴습니다 — 채팅이 항상 열려 있어 셀 이유가 없습니다.
      if (changed) renderTrack();
    }).observe(box, { childList: true });
  }

  return {
    init: init,
    // 테스트용
    _isOpen: isOpen,
    _items: () => items.slice(),
  };
})();
