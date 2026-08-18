/* =========================================================================
 * js/order-fee-preview.js — App.OrderFeePreview
 * =========================================================================
 * 왜 만들었나
 *   100% 버튼을 눌러도 지갑 잔고가 다 안 들어가는 것처럼 보였습니다.
 *   실제로는 다 들어갑니다 — 증거금 + 진입수수료 = 지갑 전액입니다.
 *
 *   실측(2026-08-18, 지갑 188,905,165원 / 100배 / 96,521,700원):
 *     증거금       179,909,681원
 *     진입수수료     8,995,484원   (테이커 0.05% × 명목가)
 *     합계         188,905,165원  = 지갑 전액
 *
 *   trading.js 의 getMaxAffordableMargin() 이
 *     balance / (1 + leverage × taker)
 *   로 수수료 몫을 미리 빼둡니다. 안 빼면 openPosition() 이
 *   "증거금과 수수료를 합친 금액이 가용 자산보다 큽니다"로 거부합니다.
 *   100배에서는 수수료가 증거금의 5%라 그 차이가 눈에 크게 띕니다.
 *
 *   문제는 계산이 아니라 화면이었습니다. 주문창에는 수수료 "요율"만
 *   있고 실제 금액이 없어서 돈이 사라진 것처럼 보였습니다.
 *   그래서 지금 입력한 수량 기준의 실제 진입수수료와 필요총액을 띄웁니다.
 *
 * 원칙
 *   숫자를 새로 만들지 않습니다. 화면의 수량·가격과 trading.js 가 주는
 *   실제 FEE_RATE 만 써서 trading.js 와 똑같은 식으로 계산합니다.
 *     명목가   = 수량 × 가격
 *     진입수수료 = 명목가 × taker
 *     필요총액  = 증거금 + 진입수수료
 *   수정 금지 파일은 건드리지 않고 DOM 만 덧붙입니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderFeePreview = (function () {
  "use strict";

  var REFRESH_INTERVAL_MS = 500;
  var dom = {};
  var timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  /* order-info-panel.js 와 같은 표기 규칙을 씁니다(통화기호 없이 숫자만). */
  function plain(value, digits) {
    if (value === null || value === undefined || isNaN(value)) return "-";
    if (value === 0) return "0";
    if (!App.Config || typeof App.Config.getDisplayCurrency !== "function") {
      return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }
    if (App.Config.getDisplayCurrency() === "KRW") {
      return Math.round(value * App.Config.USD_KRW).toLocaleString("ko-KR");
    }
    return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  /* 지정가 모드인지 — qty-price-order.js 의 isLimitMode() 와 같은 판정 */
  function isLimitMode() {
    var btn = document.querySelector('.interval-btn[data-order-type="limit"]');
    return !!(btn && btn.classList.contains("active"));
  }

  /* 가격 — qty-price-order.js 의 getEffectivePrice() 와 같은 기준입니다.
     limit-price-input 은 화면 통화(원) 값이라 USDT 로 되돌립니다. */
  function getEffectivePrice(snap) {
    if (isLimitMode()) {
      var input = el("limit-price-input");
      var raw = (input && input.value) || "";
      var v = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      if (isNaN(v) || v <= 0) return null;
      if (App.Config && typeof App.Config.getDisplayCurrency === "function" && App.Config.getDisplayCurrency() === "KRW") {
        return v / App.Config.USD_KRW;
      }
      return v;
    }
    return snap && snap.currentPrice ? snap.currentPrice : null;
  }

  /* 주문창에 실제로 들어가 있는 값만 읽습니다. 새 숫자는 만들지 않습니다. */
  function readOrder() {
    var snap = App.Trading ? App.Trading.getSnapshot() : null;
    if (!snap) return null;

    var qtyInput = el("order-qty-input");
    var qty = qtyInput ? parseFloat(qtyInput.value) : NaN;
    var price = getEffectivePrice(snap);
    if (!price || isNaN(qty) || qty <= 0) return { qty: 0, price: price, snap: snap };

    var levEl = el("lev-display");
    var lev = levEl ? parseFloat(levEl.textContent) : NaN;
    if (isNaN(lev) || lev <= 0) lev = 1;

    /* 지정가는 메이커, 시장가는 테이커 — trading.js 와 같은 구분입니다. */
    var limit = isLimitMode();
    var rate = snap.feeRate ? (limit ? snap.feeRate.maker : snap.feeRate.taker) : null;
    if (rate === null || rate === undefined) return { qty: qty, price: price, snap: snap };

    var notional = qty * price;
    var margin = notional / lev;
    var fee = notional * rate;

    return {
      qty: qty,
      price: price,
      snap: snap,
      margin: margin,
      fee: fee,
      total: margin + fee,
      isLimit: limit,
    };
  }

  function render() {
    if (!dom.feeAmount) return;
    var o = readOrder();

    if (!o || !o.qty || o.fee === undefined) {
      dom.feeAmount.textContent = "-";
      dom.total.textContent = "-";
      if (dom.warn) dom.warn.style.display = "none";
      return;
    }

    /* 주문창 폭이 좁아 4자리면 잘립니다. 2자리로 줄입니다(실측). */
    dom.feeAmount.textContent = plain(o.fee, 2);
    dom.total.textContent = plain(o.total, 2);

    /* 가용 잔고를 넘으면 진입이 거부되므로 미리 알려줍니다. */
    if (dom.warn) {
      var over = o.snap && typeof o.snap.balance === "number" && o.total > o.snap.balance + 1e-9;
      dom.warn.style.display = over ? "" : "none";
    }
  }

  /* 수수료 요율 줄 바로 아래에 두 줄을 덧붙입니다. */
  function injectRows() {
    var rateRow = el("acc-fee-rate");
    if (!rateRow || el("acc-fee-amount")) return false;
    var container = rateRow.closest(".order-account-rows");
    if (!container) return false;

    /* 주문창 세로 공간이 빠듯해서(실측: 두 줄이면 40px 넘쳐 스크롤 발생)
       진입수수료와 필요총액을 한 줄에 같이 보여줍니다. */
    var feeRow = document.createElement("div");
    feeRow.className = "order-account-row order-fee-row";
    feeRow.innerHTML =
      /* 라벨에 '(수수료)' 안내까지 넣으니 값이 40px 잘렸습니다(실측).
         라벨은 짧게 두고, 값 옆 괄호가 수수료라는 건 title 로 알려줍니다. */
      '<span title="증거금 + 진입수수료. 괄호 안이 진입수수료입니다.">필요총액</span>' +
      '<b><span id="acc-order-total">-</span>' +
      '<span class="order-fee-sub"> (<span id="acc-fee-amount">-</span>)</span>' +
      '<span class="order-fee-warn-tag" id="acc-fee-warn" style="display:none;"> 초과</span></b>';

    container.appendChild(feeRow);

    dom.feeAmount = el("acc-fee-amount");
    dom.total = el("acc-order-total");
    dom.warn = el("acc-fee-warn");
    return true;
  }

  function init() {
    if (!injectRows()) return; // 마크업 없으면 조용히 종료
    render();
    if (App.Bus && typeof App.Bus.on === "function") App.Bus.on("trading:update", render);
    timer = setInterval(render, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init: init, render: render, readOrder: readOrder };
})();
