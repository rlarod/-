/* =========================================================================
 * js/orderbook-click-order.js — App.OrderbookClickOrder
 * =========================================================================
 * 호가 행을 클릭하면 지정가 주문가격 입력칸에 그 가격이 자동으로 채워지고,
 * 지정가 탭으로 전환됩니다.
 *
 * orderbook.js는 전혀 안 건드립니다 — 이벤트 위임(event delegation)으로
 * #ob-asks/#ob-bids 컨테이너에서 클릭을 감지하고, 이미 렌더링된 .ob-price
 * 텍스트를 읽기만 합니다. 지정가 탭 전환도 ui.js가 이미 만들어둔
 * .interval-btn[data-order-type="limit"] 버튼을 실제로 클릭시켜서
 * ui.js의 기존 전환 로직을 그대로 타게 만듭니다(새 로직 안 만듦).
 * ========================================================================= */

window.App = window.App || {};

App.OrderbookClickOrder = (function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  function parsePriceText(text) {
    // "63,022.10" -> 63022.10 (쉼표만 제거, 값 자체는 이미 화면에 표시된 그대로)
    const cleaned = text.replace(/,/g, "").trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  function onRowClick(e) {
    const row = e.target.closest(".ob-row");
    if (!row) return;
    const priceEl = row.querySelector(".ob-price");
    if (!priceEl) return;
    const price = parsePriceText(priceEl.textContent);
    if (price === null) return;

    const limitInput = el("limit-price-input");
    if (limitInput) limitInput.value = price;

    // 지정가 탭으로 전환 — ui.js가 이미 바인딩해둔 클릭 핸들러를 그대로 트리거
    const limitTabBtn = document.querySelector('.interval-btn[data-order-type="limit"]');
    if (limitTabBtn && !limitTabBtn.classList.contains("active")) {
      limitTabBtn.click();
    }
  }

  function init() {
    const asksEl = el("ob-asks");
    const bidsEl = el("ob-bids");
    if (!asksEl && !bidsEl) return; // 마크업 없으면 조용히 종료

    if (asksEl) asksEl.addEventListener("click", onRowClick);
    if (bidsEl) bidsEl.addEventListener("click", onRowClick);
  }

  return { init };
})();
