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

  /* 표시 통화 ↔ 내부 단위(USDT) 변환 — ui.js의 toDisplayValue/fromDisplayValue와
     같은 규칙입니다. 이 파일이 읽고 쓰는 입력칸(#limit-price-input, #margin-input)은
     전부 "화면에 보이는 통화" 기준이고, 계산 엔진은 전부 USDT입니다. */
  function toDisplayFloor(usdValue) {
    if (!App.Config || typeof App.Config.getDisplayCurrency !== "function") return usdValue;
    if (App.Config.getDisplayCurrency() === "KRW") return Math.floor(usdValue * App.Config.USD_KRW);
    return Math.floor(usdValue * 100) / 100;
  }
  function fromDisplay(displayValue) {
    if (!App.Config || typeof App.Config.getDisplayCurrency !== "function") return displayValue;
    if (App.Config.getDisplayCurrency() === "KRW") return displayValue / App.Config.USD_KRW;
    return displayValue;
  }

  function getEffectivePrice() {
    if (isLimitMode()) {
      // 입력칸에는 "96,521,700원"처럼 쉼표·단위가 붙어 있습니다. 그냥 parseFloat하면
      // 쉼표 앞에서 끊겨 96이 됩니다. 숫자만 남긴 뒤 USDT로 되돌립니다.
      const raw = (dom.priceInput && dom.priceInput.value) || "";
      const v = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      return isNaN(v) || v <= 0 ? null : fromDisplay(v);
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
  //
  // 버그 수정(2026-08-18): 여기서 USDT 값을 그대로 써 넣었는데, ui.js의
  // getMarginValue()는 이 칸을 "화면 통화"로 읽고 fromDisplayValue()로 나눕니다.
  // 그래서 원화 모드에서 증거금이 1,500으로 한 번 더 나뉘었습니다.
  // 실측: 100% 클릭 시 119,939.79 USDT 의도 -> 실제 진입 80.01 USDT.
  // ui.js와 같은 규칙으로 화면 통화 단위를 써 넣어 맞춥니다.
  function syncMargin() {
    const marginInput = el("margin-input");
    if (!marginInput || !dom.qtyInput) return;
    const qty = parseFloat(dom.qtyInput.value);
    const price = getEffectivePrice();
    const leverage = getLeverage();
    if (!isNaN(qty) && qty > 0 && price) {
      const notional = qty * price;
      const margin = notional / leverage;
      // 반올림하면 한계선을 위로 넘어 "증거금+수수료가 자산보다 큼"으로
      // 거부되므로 ui.js의 MAX 버튼과 똑같이 항상 버림합니다.
      marginInput.value = toDisplayFloor(margin);
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

    // toFixed(6)는 반올림이라 100%에서 최대치를 아주 조금 넘길 수 있습니다.
    // 그러면 "증거금과 수수료를 합친 금액이 가용 자산보다 큽니다"로 진입이
    // 거부됩니다(실측: 0.0009 USDT 초과). 올림이 아니라 버림으로 맞춥니다.
    const raw = (maxQty * pct) / 100;
    const floored = Math.floor(raw * 1e6) / 1e6;
    dom.qtyInput.value = floored.toFixed(6);
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

  // 수량 뒤 단위 이름. App.Utils가 없던 시절 동작("BTC")으로 안전하게 떨어집니다.
  function unitLabel() {
    return App.Utils && App.Utils.qtyUnit ? App.Utils.qtyUnit() : "BTC";
  }

  function injectQtyField() {
    const anchor = el("qty-price-order-anchor");
    if (!anchor) return;
    anchor.innerHTML =
      '<div class="field">' +
      '<div class="field-label"><span>주문수량</span></div>' +
      '<div class="margin-input-wrap">' +
      '<input type="text" inputmode="decimal" id="order-qty-input" placeholder="0.000000">' +
      // 단위 이름은 종목 규격표에서 읽습니다(App.Utils.qtyUnit → SymbolRegistry.getSpec().unit).
      // 자릿수는 종목과 무관하게 6자리 고정이라 placeholder 는 그대로입니다.
      '<span id="order-qty-unit">' + unitLabel() + "</span>" +
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

    /* 종목이 바뀌면 수량 단위 이름도 같이 바뀝니다(BTC → 주).
       2026-08-27 실측 — 이걸 안 하면 삼성전자로 바꾼 뒤에도 주문수량 칸이
       "0.000000 BTC" 로 남아 회원이 단위를 오해합니다. 숫자 규격(0.001·6자리)은
       네 종목이 같으므로 이름만 다시 씁니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", () => {
        const unitEl = el("order-qty-unit");
        if (unitEl) unitEl.textContent = unitLabel();
        syncMargin();
      });
    }

    syncMargin();
  }

  return { init };
})();
