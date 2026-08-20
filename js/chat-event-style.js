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
  // 지금까지 저장된 형태가 여러 가지라 모두 인식합니다.
  //   "$-1,696.82"(기호가 $ 뒤) / "-$1,696.82"(기호가 앞) / "+6,765원"
  const AMOUNT = /(\$[+-]?[\d,]+(?:\.\d+)?|[+-]\s?\$[\d,]+(?:\.\d+)?|[+-][\d,.]+(?:억|만)?원)/;

  // 예전에 달러로 저장된 메시지("$1,696.82")를 원화 표기로 바꿉니다.
  // 환율이 고정 상수라 변환 결과가 새 메시지와 정확히 같습니다.
  // 저장된 원문은 그대로 두고 화면에 보이는 문자열만 바꿉니다.
  function dollarToKrw(token) {
    // "$-1,696.82" 와 "-$1,696.82" 둘 다 받습니다.
    let m = token.match(/^\$([+-]?)([\d,]+(?:\.\d+)?)$/);
    if (m) m = [m[0], m[1], m[2]];
    else {
      const m2 = token.match(/^([+-])?\s?\$([\d,]+(?:\.\d+)?)$/);
      m = m2 ? [m2[0], m2[1], m2[2]] : null;
    }
    if (!m) return null;
    const rate = App.Config && App.Config.USD_KRW ? App.Config.USD_KRW : 0;
    if (!rate) return null;
    const won = Math.round(parseFloat(m[2].replace(/,/g, "")) * rate);
    const sign = m[1] === "-" ? "-" : m[1] === "+" ? "+" : "";
    /* 축약하지 않고 전체 자리수로 — 새로 보내는 메시지(trade-events-chat.js)와
       같은 형식이어야 예전 것과 새 것이 나란히 있을 때 어색하지 않습니다. */
    return sign + Math.abs(won).toLocaleString("ko-KR") + "원";
  }

  function decorate(row) {
    if (!row || row.dataset.eventStyled === "1") return;
    if (!row.classList.contains("chat-msg-event")) return;
    const textEl = row.querySelector(".chat-msg-text");
    if (!textEl) return;
    let text = textEl.textContent || "";

    // 문구 전체에 색을 입힙니다 — 익절 초록 / 손절·강제청산 빨강.
    if (/강제청산/.test(text)) row.classList.add("chat-event-liq");
    else if (/익절/.test(text)) row.classList.add("chat-event-profit");
    else if (/손절/.test(text)) row.classList.add("chat-event-loss");

    const m = text.match(AMOUNT);
    if (m) {
      const krw = dollarToKrw(m[1].replace(/\s/g, ""));
      if (krw) text = text.split(m[1]).join(krw);
      textEl.textContent = text;
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
