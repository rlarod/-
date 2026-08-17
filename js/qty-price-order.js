/* =========================================================================
 * js/qty-price-order.js — App.QtyPriceOrder
 * =========================================================================
 * 개미톡 스타일 "주문가격 + 주문수량(BTC)" 입력 UI.
 *
 * 핵심 원칙: ui.js는 절대 안 건드립니다. ui.js의 submit()은 여전히
 * (지금은 숨겨진) #margin-input의 값만 읽어서 App.Trading.openPosition/
 * placeLimitOrder를 그대로 호출합니다 — 이 모듈은 그 앞단에서
 *   증거금 = 수량 × 가격 ÷ 레버리지
 * 을 계산해 #margin-input에 대신 채워 넣는 "번역기" 역할만 합니다.
 * 새로운 주문 계산이 아니라, trading.js가 원래 받던 파라미터(증거금)를
 * 사용자 친화적인 입력(수량+가격)으로부터 역산하는 것뿐입니다.
 *
 * 가격 기준:
 *  - 지정가 모드: 사용자가 입력한 #limit-price-input 값
 *  - 시장가 모드: App.Trading.getSnapshot().currentPrice(실시간 시세)
 * ========================================================================= */

window.App = window.App || {};

App.QtyPriceOrder = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function isLimitMode() {
    const limitBtn = document.querySelector('.interval-btn[data-order-type="limit"]');
    return !!(limitBtn && limitBtn.classList.contains("active"));
  }

  function getEffectivePrice() {
    if (isLimitMode()) {
      const v = parseFloat((dom.priceInput && dom.priceInput.value) || "");
      return isNaN(v) || v <= 0 ? null : v;
    }
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    return snap && snap.currentPrice ? snap.currentPrice : null;
  }

  function getLeverage() {
    const levDisplay = el("lev-display");
    const v = levDisplay ? parseFloat(levDisplay.textContent) : NaN;
    return isNaN(v) || v <= 0 ? 1 : v;
  }

  // 수량(BTC) + 가격 + 레버리지로부터 증거금을 역산해서, ui.js가 읽는
  // 기존 #margin-input에 채워 넣습니다(새 계산이 아니라 값 변환).
  function syncMargin() {
    const marginInput = el("margin-input");
    if (!marginInput || !dom.qtyInput) return;
    const qty = parseFloat(dom.qtyInput.value);
    const price = getEffectivePrice();
    const leverage = getLeverage();
    if (!isNaN(qty) && qty > 0 && price) {
      const notional = qty * price;
      const margin = notional / leverage;
      marginInput.value = margin;
    } else {
      marginInput.value = "0";
    }
  }

  function onLastClick() {
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    if (dom.priceInput && snap && snap.currentPrice) {
      dom.priceInput.value = App.Utils ? App.Utils.formatCurrencyPlain(snap.currentPrice) : snap.currentPrice;
      syncMargin();
    }
  }

  function onPercentClick(pct) {
    const price = getEffectivePrice();
    if (!price || !App.Trading) return;
    const maxMargin = App.Trading.getMaxAffordableMargin();
    const leverage = getLeverage();
    const maxQty = (maxMargin * leverage) / price;
    dom.qtyInput.value = ((maxQty * pct) / 100).toFixed(6);
    syncMargin();
  }

  function injectLastButton() {
    const priceField = el("limit-price-field");
    if (!priceField || el("qty-price-last-btn")) return;
    const wrap = priceField.querySelector(".margin-input-wrap");
    if (!wrap) return;
    const btn = document.createElement("button");
    btn.id = "qty-price-last-btn";
    btn.type = "button";
    btn.className = "qty-price-last-btn";
    btn.textContent = "Last";
    btn.addEventListener("click", onLastClick);
    wrap.appendChild(btn);
    dom.priceInput = el("limit-price-input");
    if (dom.priceInput) dom.priceInput.addEventListener("input", syncMargin);
  }

  function injectQtyField() {
    const anchor = el("qty-price-order-anchor");
    if (!anchor) return;
    anchor.innerHTML =
      '<div class="field">' +
      '<div class="field-label"><span>주문수량</span></div>' +
      '<div class="margin-input-wrap">' +
      '<input type="text" inputmode="decimal" id="order-qty-input" placeholder="0.000000">' +
      "<span>BTC</span>" +
      "</div>" +
      '<div class="chip-row" id="qty-percent-row">' +
      '<div class="chip" data-pct="10">10%</div>' +
      '<div class="chip" data-pct="25">25%</div>' +
      '<div class="chip" data-pct="50">50%</div>' +
      '<div class="chip" data-pct="75">75%</div>' +
      '<div class="chip" data-pct="100">100%</div>' +
      "</div>" +
      "</div>";
    dom.qtyInput = el("order-qty-input");
    dom.qtyInput.addEventListener("input", syncMargin);

    document.querySelectorAll("#qty-percent-row .chip").forEach((chip) => {
      chip.addEventListener("click", () => onPercentClick(parseFloat(chip.dataset.pct)));
    });
  }

  function bindOrderTypeTabs() {
    // 지정가/시장가 탭 전환 시 가격 기준이 바뀌므로 증거금도 재계산합니다.
    // ui.js가 이미 만들어둔 탭 버튼에 리스너를 하나 더 추가하는 것뿐이라
    // ui.js의 기존 클릭 핸들러와 서로 간섭하지 않습니다.
    document.querySelectorAll('.interval-btn[data-order-type]').forEach((btn) => {
      btn.addEventListener("click", () => setTimeout(syncMargin, 0));
    });
  }

  function init() {
    injectQtyField();
    injectLastButton();
    bindOrderTypeTabs();
    if (!dom.qtyInput) return; // 마크업 없으면 조용히 종료

    // 레버리지 슬라이더도 이미 ui.js가 리스너를 갖고 있지만, 여기서도
    // 하나 더 추가해서 레버리지 변경 시 증거금 재계산이 되게 합니다.
    const levSlider = el("lev-slider");
    if (levSlider) levSlider.addEventListener("input", () => setTimeout(syncMargin, 0));

    syncMargin();
  }

  return { init };
})();
