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
 *
 * 표기 형식은 개미톡과 동일하게 통화기호 없이 숫자만 씁니다(평가/보유/가능은
 * 소수점 4자리, 가격/금액은 2자리). 값 자체는 전부 기존과 동일하며 표시만
 * 바뀝니다. KRW 표시 모드일 때는 App.Config의 환율 설정을 그대로 따릅니다.
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

  // 개미톡식 표기 — 통화기호 없이 숫자만. 내부 값은 항상 USDT이므로
  // App.Utils.formatCurrencyPlain과 동일한 방식으로 표시 통화만 반영합니다.
  //
  // 2026-08-28 디자인팀 — 원화일 때 단위가 아예 없어서(예: "120,317,550")
  // 같은 화면의 시세 바("₩120,317,550")·호가창과 세 번째로 다른 표기였습니다.
  // formatCurrencyPlain 과 같은 규칙("₩ 앞")으로 맞춥니다. USDT 는 종전대로
  // 기호 없이 숫자만 씁니다(머리글·라벨이 USDT 를 말해 줍니다).
  // 되돌리려면 아래 KRW 줄에서 `"₩" +` 만 지우면 됩니다.
  function plain(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return "-";
    if (value === 0) return "0"; // 개미톡은 0일 때 "0.0000"이 아니라 "0"으로 표시
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") {
      return "₩" + Math.round(value * App.Config.USD_KRW).toLocaleString("ko-KR");
    }
    return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  // 값이 아직 없거나 0이면 색 강조를 빼고 중립 회색으로 둡니다(타이포 위계).
  function setValue(node, text) {
    if (!node) return;
    node.textContent = text;
    const idle = text === "-" || text === "0";
    node.classList.toggle("is-idle", idle);
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

    setValue(dom.previewAskPrice, bestAsk !== null ? plain(bestAsk, 2) : "-");
    setValue(dom.previewBidPrice, bestBid !== null ? plain(bestBid, 2) : "-");

    const marginInput = el("margin-input");
    const levDisplay = el("lev-display");
    const margin = marginInput ? parseFloat(marginInput.value) : NaN;
    const leverage = levDisplay ? parseFloat(levDisplay.textContent) : NaN;
    if (!isNaN(margin) && !isNaN(leverage) && margin > 0) {
      const notional = margin * leverage;
      const notionalText = plain(notional, 2);
      setValue(dom.previewBuyAmount, notionalText);
      setValue(dom.previewSellAmount, notionalText);
    } else {
      setValue(dom.previewBuyAmount, "0");
      setValue(dom.previewSellAmount, "0");
    }
  }

  function updateAccountInfo(snapshot) {
    if (!dom.accEquity) return;
    // 개미톡과 동일하게 소수점 4자리(예: 100,000.0000)
    dom.accEquity.textContent = plain(snapshot.equity, 4);
    dom.accBalanceHolding.textContent = plain(snapshot.balance, 4);
    dom.accAvailable.textContent = plain(snapshot.balance, 4);
    if (dom.accFeeRate && snapshot.feeRate) {
      /* 메이커/테이커 자릿수를 4자리로 통일합니다(0.0200% / 0.0500%).
         전에는 메이커만 2자리, 테이커만 3자리라 같은 줄에서 자릿수가 어긋나
         회원이 서로 다른 정밀도의 값으로 오해할 수 있었습니다.
         바이낸스 USDⓈ-M 수수료 표기와 같은 4자리로 맞춥니다. */
      dom.accFeeRate.textContent = (snapshot.feeRate.maker * 100).toFixed(4) + "% / " + (snapshot.feeRate.taker * 100).toFixed(4) + "%";
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
