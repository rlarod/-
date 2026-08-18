/* =========================================================================
 * js/chat-event-style.js — App.ChatEventStyle
 * =========================================================================
 * 거래 이벤트 메시지(청산/익절/손절)에 손익 부호별 색을 입힙니다.
 * js/chat.js(수정 금지 파일)는 전혀 건드리지 않고, chat.js가 그린 뒤의
 * DOM만 관찰해서 클래스와 금액 하이라이트를 덧붙입니다.
 * 메시지 문구·데이터는 그대로 두고 표시만 바꿉니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChatEventStyle = (function () {
  "use strict";

  // "+$1,234.56" / "-$1,234.56" 형태의 금액을 찾아 색을 입힙니다.
  // "+1,234만원" / "-1.23억원" / "+5,000원" 형태의 금액을 찾습니다.
  // (이전 "$1,234.56" 형식도 계속 인식하도록 둘 다 받습니다.)
  const AMOUNT = /([+-]\s?(?:\$[\d,]+(?:\.\d+)?|[\d,.]+(?:억|만)?원))/;

  function decorate(row) {
    if (!row || row.dataset.eventStyled === "1") return;
    if (!row.classList.contains("chat-msg-event")) return;
    const textEl = row.querySelector(".chat-msg-text");
    if (!textEl) return;
    const text = textEl.textContent || "";

    if (/강제청산/.test(text)) row.classList.add("chat-event-liq");
    else if (/익절/.test(text)) row.classList.add("chat-event-profit");
    else if (/손절/.test(text)) row.classList.add("chat-event-loss");

    const m = text.match(AMOUNT);
    if (m) {
      const cls = m[1].trim().charAt(0) === "-" ? "chat-event-amount-down" : "chat-event-amount-up";
      // textContent만 다루므로 HTML 주입 위험이 없습니다.
      const parts = text.split(m[1]);
      textEl.textContent = "";
      textEl.appendChild(document.createTextNode(parts[0]));
      const span = document.createElement("span");
      span.className = cls;
      span.textContent = m[1];
      textEl.appendChild(span);
      textEl.appendChild(document.createTextNode(parts.slice(1).join(m[1])));
    }
    row.dataset.eventStyled = "1";
  }

  function init() {
    const box = document.getElementById("chat-messages");
    if (!box) return;
    box.querySelectorAll(".chat-msg-event").forEach(decorate);
    new MutationObserver((muts) => {
      muts.forEach((m) => {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) decorate(n);
        });
      });
    }).observe(box, { childList: true });
  }

  return { init, decorateForTest: decorate };
})();
