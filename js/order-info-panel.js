/* =========================================================================
 * js/order-info-panel.js — App.OrderInfoPanel
 * =========================================================================
 * 주문창 하단 정보 — 매수가격/매도가격/매수금액/매도금액 + 평가/보유/가능/수수료.
 *
 * 전부 이미 존재하는 실제 값만 읽어서 표시합니다(새 계산 없음):
 *  - 매수가격/매도가격: 호가창에 이미 렌더링된 최우선 매도/매수 호가
 *    (orderbook.js가 각 행에 심어둔 data-price 속성을 읽기만 함)
 *  - 매수금액/매도금액: 증거금 입력값 × 레버리지(명목가치 참고용 미리보기.
 *    trading.js의 실제 체결/청산 계산과는 무관한 "미리보기"일 뿐입니다)
 *  - 평가/보유/가능: App.Trading.getSnapshot()의 equity/balance
 *  - 수수료: App.Trading.getSnapshot().feeRate(실제 taker/maker 요율)
 *  - 환율: 저희가 가진 데이터 소스가 없어서 표시하지 않습니다(임의 값 금지)
 * ========================================================================= */

window.App = window.App || {};

App.OrderInfoPanel = (function () {
  "use strict";

  const REFRESH_INTERVAL_MS = 1000;
  let dom = {};
  let timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function updatePreview() {
    if (!dom.previewAskPrice) return;

    const asksEl = el("ob-asks");
    const bidsEl = el("ob-bids");
    let bestAsk = null;
    let bestBid = null;
    if (asksEl) {
      const visible = Array.prototype.filter.call(asksEl.children, (r) => r.style.display !== "none");
      const last = visible[visible.length - 1]; // 마지막 행 = 현재가에 가장 가까운 매도호가(최우선)
      if (last && last.dataset.price) bestAsk = parseFloat(last.dataset.price);
    }
    if (bidsEl) {
      const visible = Array.prototype.filter.call(bidsEl.children, (r) => r.style.display !== "none");
      const first = visible[0]; // 첫 행 = 현재가에 가장 가까운 매수호가(최우선)
      if (first && first.dataset.price) bestBid = parseFloat(first.dataset.price);
    }

    dom.previewAskPrice.textContent = bestAsk !== null ? App.Utils.formatCurrencyPlain(bestAsk) : "-";
    dom.previewBidPrice.textContent = bestBid !== null ? App.Utils.formatCurrencyPlain(bestBid) : "-";

    const marginInput = el("margin-input");
    const levDisplay = el("lev-display");
    const margin = marginInput ? parseFloat(marginInput.value) : NaN;
    const leverage = levDisplay ? parseFloat(levDisplay.textContent) : NaN;
    if (!isNaN(margin) && !isNaN(leverage) && margin > 0) {
      const notional = margin * leverage;
      const notionalText = App.Utils.formatCurrency(notional);
      dom.previewBuyAmount.textContent = notionalText;
      dom.previewSellAmount.textContent = notionalText;
    } else {
      dom.previewBuyAmount.textContent = "-";
      dom.previewSellAmount.textContent = "-";
    }
  }

  function updateAccountInfo(snapshot) {
    if (!dom.accEquity) return;
    dom.accEquity.textContent = App.Utils.formatCurrency(snapshot.equity);
    dom.accBalanceHolding.textContent = App.Utils.formatCurrency(snapshot.balance);
    dom.accAvailable.textContent = App.Utils.formatCurrency(snapshot.balance);
    if (dom.accFeeRate && snapshot.feeRate) {
      dom.accFeeRate.textContent = (snapshot.feeRate.maker * 100).toFixed(2) + "% / " + (snapshot.feeRate.taker * 100).toFixed(3) + "%";
    }
  }

  function init() {
    dom = {
      previewAskPrice: el("preview-ask-price"),
      previewBidPrice: el("preview-bid-price"),
      previewBuyAmount: el("preview-buy-amount"),
      previewSellAmount: el("preview-sell-amount"),
      accEquity: el("acc-equity"),
      accBalanceHolding: el("acc-balance-holding"),
      accAvailable: el("acc-available"),
      accFeeRate: el("acc-fee-rate"),
    };
    if (!dom.previewAskPrice && !dom.accEquity) return; // 마크업 없으면 조용히 종료

    if (App.Trading) {
      updateAccountInfo(App.Trading.getSnapshot());
    }
    App.Bus.on("trading:update", updateAccountInfo);

    updatePreview();
    timer = setInterval(updatePreview, REFRESH_INTERVAL_MS);
  }

  return { init };
})();
