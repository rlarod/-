/* =========================================================================
 * js/ui.js — App.UI
 * =========================================================================
 * 오른쪽 주문창(총자산 → 증거금 입력 → 레버리지 → LONG/SHORT → 현재 포지션)을
 * 렌더링하고 사용자 입력을 처리합니다. 계산은 하지 않고 전부 App.Trading에
 * 위임합니다 — 이 파일은 "표시"만 합니다.
 *
 * ── 통화 표시 (USDT ↔ KRW) ─────────────────────────────────────────
 * 내부 데이터(App.Trading의 잔고/증거금/가격)는 항상 USDT입니다. 이 파일이
 * 화면에 뿌릴 때만 App.Utils.formatCurrency로 선택된 통화로 환산합니다.
 * 반대로, 사용자가 증거금/TP/SL 입력창에 숫자를 입력할 때는 "지금 화면에
 * 보이는 통화 기준"으로 입력하므로, 이 파일이 그 값을 다시 USDT로
 * 환산해서 App.Trading에 넘깁니다(fromDisplayValue). 즉 화면 밖으로 나가는
 * 모든 값과 화면 안으로 들어오는 모든 값의 경계에서 변환이 일어나고,
 * App.Trading 내부에는 절대 KRW 숫자가 들어가지 않습니다.
 *
 * 상단 [USDT] [KRW] 버튼도 index.html에 없던 요소라 이 파일이 JS로
 * 만들어서 topbar에 끼워 넣습니다(기존 .ws-status 스타일을 참고해 최소한의
 * 인라인 스타일만 사용). index.html/style.css 파일 자체는 이 기능 때문에
 * 구조를 바꾸지 않았습니다.
 * ========================================================================= */

App.UI = (function () {
  "use strict";

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 통화 변환 헬퍼 ----------------
   * "화면에 보이는 숫자" ↔ "엔진이 쓰는 USDT" 사이의 변환입니다.
   * ------------------------------------------------------------------ */
  function toDisplayValue(usdValue) {
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") return Math.round(usdValue * App.Config.USD_KRW);
    return Math.round(usdValue * 100) / 100;
  }
  // MAX 버튼 전용 — 반올림하면 "쓸 수 있는 한계선"을 위로 넘어버려서 바로 다음
  // 클릭에서 "증거금+수수료가 자산보다 큼" 에러가 나는 버그가 있었습니다.
  // 항상 아래로 내림해서 실제 한계선을 절대 넘지 않게 합니다.
  function toDisplayValueFloor(usdValue) {
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") return Math.floor(usdValue * App.Config.USD_KRW);
    return Math.floor(usdValue * 100) / 100;
  }
  function fromDisplayValue(displayValue) {
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") return displayValue / App.Config.USD_KRW;
    return displayValue;
  }
  function currencyUnitLabel() {
    return App.Config.getDisplayCurrency() === "KRW" ? "원" : "USDT";
  }

  function fmtTime(ms) {
    const d = new Date(ms);
    return (
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  let dom = {};
  let lastHistoryLength = -1; // 성능 최적화: 거래내역이 실제로 안 바뀌면 표를 다시 그리지 않음
  let lastSnapshot = null; // 통화 전환 시 재렌더링용 캐시
  let orderType = "market"; // 'market' | 'limit'

  /* ---------------- 동적 DOM 생성 (index.html은 구조를 바꾸지 않음) ---------------- */
  function injectDynamicUI() {
    // 주문 유형 토글 [시장가] [지정가] — 증거금 필드 바로 앞
    const marginField = el("margin-input") ? el("margin-input").closest(".field") : null;
    if (marginField && !el("order-type-row")) {
      const typeRow = document.createElement("div");
      typeRow.className = "chip-row";
      typeRow.id = "order-type-row";
      typeRow.style.marginBottom = "10px";
      typeRow.innerHTML =
        '<div class="interval-btn active" data-order-type="market">시장가</div>' +
        '<div class="interval-btn" data-order-type="limit">지정가</div>';
      marginField.parentNode.insertBefore(typeRow, marginField);

      // 지정가 선택 시에만 보이는 가격 입력창
      const priceField = document.createElement("div");
      priceField.className = "field";
      priceField.id = "limit-price-field";
      priceField.style.display = "none";
      priceField.innerHTML =
        '<div class="field-label"><span>지정가</span></div>' +
        '<div class="margin-input-wrap">' +
        '<input type="text" inputmode="numeric" id="limit-price-input" placeholder="주문 가격">' +
        '<span id="limit-price-unit-label">USDT</span>' +
        "</div>";
      marginField.parentNode.insertBefore(priceField, marginField);
    }

    // TP/SL 입력창 — 레버리지 필드와 LONG/SHORT 버튼 사이
    const orderButtons = document.querySelector(".order-buttons");
    if (orderButtons && !el("tp-input")) {
      const tpSlField = document.createElement("div");
      tpSlField.className = "field";
      tpSlField.id = "tp-sl-field";
      tpSlField.innerHTML =
        '<div class="field-label"><span>TP / SL (선택)</span></div>' +
        '<div class="margin-input-wrap">' +
        '<input type="text" inputmode="numeric" id="tp-input" placeholder="익절가(TP)">' +
        '<span id="tp-unit-label">USDT</span>' +
        "</div>" +
        '<div class="margin-input-wrap" style="margin-top:6px;">' +
        '<input type="text" inputmode="numeric" id="sl-input" placeholder="손절가(SL)">' +
        '<span id="sl-unit-label">USDT</span>' +
        "</div>";
      orderButtons.parentNode.insertBefore(tpSlField, orderButtons);
    }

    // 미체결 지정가 주문 카드 — LONG/SHORT 버튼 바로 뒤(현재 포지션 섹션 앞)
    const positionSection = document.querySelector(".position-section");
    if (positionSection && !el("pending-order-card")) {
      const card = document.createElement("div");
      card.id = "pending-order-card";
      card.className = "position-card";
      card.style.display = "none";
      card.style.marginBottom = "14px";
      card.innerHTML =
        '<div class="position-row"><span class="badge long" id="pending-side-badge">LONG</span> <span style="color:var(--text-faint);font-size:11px;">지정가 미체결</span></div>' +
        '<div class="position-grid">' +
        '<div><span>지정가</span><b id="pending-price">-</b></div>' +
        '<div><span>레버리지</span><b id="pending-leverage">-</b></div>' +
        '<div><span>증거금</span><b id="pending-margin">-</b></div>' +
        "</div>" +
        '<button class="close-btn" id="btn-cancel-order">주문 취소</button>';
      positionSection.parentNode.insertBefore(card, positionSection);
    }

    // 포지션 카드: 청산가 뒤에 TP/SL 표 컬럼 추가(헤더+본문 둘 다, 표 구조로 변경됨)
    const posLiqTd = el("pos-liq");
    const theadRow = el("position-thead-row");
    const tbodyRow = el("position-tbody-row");
    if (posLiqTd && theadRow && tbodyRow && !el("pos-tp")) {
      const liqIndex = Array.prototype.indexOf.call(tbodyRow.children, posLiqTd);
      const liqTh = theadRow.children[liqIndex];

      const tpTh = document.createElement("th");
      tpTh.textContent = "TP";
      tpTh.className = "mobile-hide";
      const slTh = document.createElement("th");
      slTh.textContent = "SL";
      slTh.className = "mobile-hide";
      liqTh.parentNode.insertBefore(tpTh, liqTh.nextSibling);
      tpTh.parentNode.insertBefore(slTh, tpTh.nextSibling);

      const tpTd = document.createElement("td");
      tpTd.id = "pos-tp";
      tpTd.textContent = "-";
      tpTd.className = "mobile-hide";
      const slTd = document.createElement("td");
      slTd.id = "pos-sl";
      slTd.textContent = "-";
      slTd.className = "mobile-hide";
      posLiqTd.parentNode.insertBefore(tpTd, posLiqTd.nextSibling);
      tpTd.parentNode.insertBefore(slTd, tpTd.nextSibling);
    }

    // 포지션 카드: 증거금 뒤에 진입 수수료 표 컬럼 추가(헤더+본문 둘 다)
    const posMarginTd = el("pos-margin");
    if (posMarginTd && theadRow && tbodyRow && !el("pos-entry-fee")) {
      const marginIndex = Array.prototype.indexOf.call(tbodyRow.children, posMarginTd);
      const marginTh = theadRow.children[marginIndex];

      const feeTh = document.createElement("th");
      feeTh.textContent = "진입수수료";
      feeTh.className = "mobile-hide";
      marginTh.parentNode.insertBefore(feeTh, marginTh.nextSibling);

      const feeTd = document.createElement("td");
      feeTd.id = "pos-entry-fee";
      feeTd.textContent = "-";
      feeTd.className = "mobile-hide";
      posMarginTd.parentNode.insertBefore(feeTd, posMarginTd.nextSibling);
    }

    // 부분청산 버튼 (25% / 50% / 75% / 100%) + 직접 입력
    const closeBtn = el("btn-close-position");
    if (closeBtn && !el("partial-close-row")) {
      const row = document.createElement("div");
      row.id = "partial-close-row";
      row.className = "chip-row";
      row.style.marginTop = "10px";
      row.innerHTML =
        '<div class="chip" data-close-ratio="0.25">25%</div>' +
        '<div class="chip" data-close-ratio="0.5">50%</div>' +
        '<div class="chip" data-close-ratio="0.75">75%</div>' +
        '<div class="chip" data-close-ratio="1">100%</div>';
      closeBtn.parentNode.insertBefore(row, closeBtn);

      // 요구사항 2: 0~100% 범위를 직접 입력할 수 있는 필드
      const customRow = document.createElement("div");
      customRow.id = "partial-close-custom-row";
      customRow.className = "margin-input-wrap";
      customRow.style.marginTop = "8px";
      customRow.innerHTML =
        '<input type="text" inputmode="numeric" id="partial-close-input" placeholder="직접 입력(0~100)">' +
        '<span>%</span>' +
        '<button class="chip" id="btn-partial-close-custom" style="flex:0 0 auto;padding:6px 12px;margin-left:6px;">청산</button>';
      closeBtn.parentNode.insertBefore(customRow, closeBtn);

      closeBtn.style.display = "none"; // 전체청산은 위 칩으로 통합, 기존 버튼은 숨김(삭제 아님)
    }

    // 거래내역 표: "수수료" 열 추가
    const historyHeadRow = document.querySelector(".history-panel thead tr");
    if (historyHeadRow && !el("history-th-fee")) {
      const ths = historyHeadRow.querySelectorAll("th");
      const reasonTh = ths[ths.length - 1];
      const feeTh = document.createElement("th");
      feeTh.id = "history-th-fee";
      feeTh.textContent = "수수료";
      if (reasonTh) historyHeadRow.insertBefore(feeTh, reasonTh);
      else historyHeadRow.appendChild(feeTh);
    }

    // 상단 통화 전환 버튼 [USDT] [KRW] — topbar의 ws-status 옆에 추가
    const wsStatus = document.querySelector(".ws-status");
    if (wsStatus && !el("currency-toggle")) {
      const wrap = document.createElement("div");
      wrap.id = "currency-toggle";
      wrap.style.cssText = "display:flex;gap:4px;margin-left:14px;";
      wrap.innerHTML =
        '<button class="interval-btn" data-currency="USDT" id="btn-cur-usdt">USDT</button>' +
        '<button class="interval-btn" data-currency="KRW" id="btn-cur-krw">KRW</button>';
      wsStatus.parentNode.insertBefore(wrap, wsStatus.nextSibling);
    }

    buildTabbedPanel();
  }

  /* ---------------- 5탭(포지션/미체결/주문내역/거래내역/자산) 재구성 ----------------
   * index.html/style.css의 기존 구조를 뜯어고치지 않고, 이미 있던 .history-panel을
   * 탭 컨테이너로 재구성합니다. 포지션 카드/미체결 카드/거래내역 표는 새로 만들지
   * 않고 appendChild로 "그대로 옮기기"만 합니다 — 내용을 다시 그리는 게 아니라
   * DOM 노드 자체를 이동하는 것이라, 기존 render() 로직(el() 기반 조회)이
   * 전혀 깨지지 않습니다.
   * ------------------------------------------------------------------- */
  function buildTabbedPanel() {
    const historyPanel = document.querySelector(".history-panel");
    if (!historyPanel || el("info-tabs")) return;

    const tabs = document.createElement("div");
    tabs.className = "tabs";
    tabs.id = "info-tabs";
    tabs.innerHTML =
      '<button class="tab-btn active" data-tab="position" id="tab-btn-position">포지션(0)</button>' +
      '<button class="tab-btn" data-tab="pending" id="tab-btn-pending">미체결(0)</button>' +
      '<button class="tab-btn" data-tab="orders" id="tab-btn-orders">주문내역(0)</button>' +
      '<button class="tab-btn" data-tab="history">거래내역</button>' +
      '<button class="tab-btn" data-tab="assets">자산</button>';

    const panelPosition = document.createElement("div");
    panelPosition.className = "tab-panel active";
    panelPosition.id = "tab-panel-position";

    const panelPending = document.createElement("div");
    panelPending.className = "tab-panel";
    panelPending.id = "tab-panel-pending";

    const panelOrders = document.createElement("div");
    panelOrders.className = "tab-panel";
    panelOrders.id = "tab-panel-orders";
    panelOrders.innerHTML =
      '<div class="table-scroll"><table>' +
      "<thead><tr><th>시각</th><th>방향</th><th>유형</th><th>가격</th><th>레버리지</th><th>증거금</th><th>상태</th></tr></thead>" +
      '<tbody id="order-history-body"><tr class="empty"><td colspan="7">주문 내역이 없습니다.</td></tr></tbody>' +
      "</table></div>";

    const panelHistory = document.createElement("div");
    panelHistory.className = "tab-panel";
    panelHistory.id = "tab-panel-history";

    const panelAssets = document.createElement("div");
    panelAssets.className = "tab-panel";
    panelAssets.id = "tab-panel-assets";
    panelAssets.innerHTML =
      '<div class="asset-grid">' +
      '<div class="asset-item"><div class="field-label"><span>총자산</span></div><b id="asset-equity">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>가용 잔고</span></div><b id="asset-balance">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>사용중 증거금</span></div><b id="asset-used-margin">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>미실현 손익</span></div><b id="asset-unrealized">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>실현 손익</span></div><b id="asset-realized">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>누적 수수료</span></div><b id="asset-fees">-</b></div>' +
      '<div class="asset-item"><div class="field-label"><span>누적 펀딩비</span></div><b id="asset-funding">-</b></div>' +
      "</div>" +
      '<div class="field-label" style="margin-top:16px;"><span>펀딩 정산 내역</span></div>' +
      '<div class="table-scroll"><table>' +
      "<thead><tr><th>정산시각</th><th>방향</th><th>수량</th><th>마크가격</th><th>펀딩비율</th><th>정산금액</th></tr></thead>" +
      '<tbody id="funding-history-body"><tr class="empty"><td colspan="6">펀딩 정산 내역이 없습니다.</td></tr></tbody>' +
      "</table></div>";

    // 기존 요소를 새로 만들지 않고 그대로 옮김 (appendChild = 이동, 복제 아님)
    const positionSection = document.querySelector(".position-section");
    const pendingCard = el("pending-order-card");
    const oldHistoryLabel = historyPanel.querySelector(".field-label");
    const oldHistoryTable = historyPanel.querySelector(".table-scroll");

    if (positionSection) panelPosition.appendChild(positionSection);
    if (pendingCard) panelPending.appendChild(pendingCard);
    if (oldHistoryLabel) panelHistory.appendChild(oldHistoryLabel);
    if (oldHistoryTable) panelHistory.appendChild(oldHistoryTable);

    historyPanel.innerHTML = "";
    historyPanel.appendChild(tabs);
    historyPanel.appendChild(panelPosition);
    historyPanel.appendChild(panelPending);
    historyPanel.appendChild(panelOrders);
    historyPanel.appendChild(panelHistory);
    historyPanel.appendChild(panelAssets);

    tabs.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        tabs.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        historyPanel.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const target = el("tab-panel-" + btn.dataset.tab);
        if (target) target.classList.add("active");
      });
    });
  }

  function cacheDom() {
    dom = {
      balanceValue: el("balance-value"),
      marginInput: el("margin-input"),
      marginUnitLabel: document.querySelector(".margin-input-wrap span"),
      levSlider: el("lev-slider"),
      levDisplay: el("lev-display"),
      btnLong: el("btn-long"),
      btnShort: el("btn-short"),
      orderErr: el("order-err"),
      positionEmpty: el("position-empty"),
      tabBtnPosition: el("tab-btn-position"),
      tabBtnPending: el("tab-btn-pending"),
      tabBtnOrders: el("tab-btn-orders"),
      positionCard: el("position-card"),
      posSideBadge: el("pos-side-badge"),
      posEntry: el("pos-entry"),
      posCurrent: el("pos-current"),
      posLeverage: el("pos-leverage"),
      posMargin: el("pos-margin"),
      posQty: el("pos-qty"),
      posLiq: el("pos-liq"),
      posTp: el("pos-tp"),
      posSl: el("pos-sl"),
      tpInput: el("tp-input"),
      slInput: el("sl-input"),
      tpUnitLabel: el("tp-unit-label"),
      slUnitLabel: el("sl-unit-label"),
      posPnl: el("pos-pnl"),
      posPnlPct: el("pos-pnl-pct"),
      posReturnRate: el("pos-return-rate"),
      btnClosePosition: el("btn-close-position"),
      historyBody: el("history-body"),
      posEntryFee: el("pos-entry-fee"),
      btnCurUsdt: el("btn-cur-usdt"),
      btnCurKrw: el("btn-cur-krw"),
      limitPriceField: el("limit-price-field"),
      limitPriceInput: el("limit-price-input"),
      limitPriceUnitLabel: el("limit-price-unit-label"),
      pendingOrderCard: el("pending-order-card"),
      pendingSideBadge: el("pending-side-badge"),
      pendingPrice: el("pending-price"),
      pendingLeverage: el("pending-leverage"),
      pendingMargin: el("pending-margin"),
      btnCancelOrder: el("btn-cancel-order"),
      partialCloseInput: el("partial-close-input"),
      btnPartialCloseCustom: el("btn-partial-close-custom"),
      assetFunding: el("asset-funding"),
      fundingHistoryBody: el("funding-history-body"),
      orderHistoryBody: el("order-history-body"),
      assetEquity: el("asset-equity"),
      assetBalance: el("asset-balance"),
      assetUsedMargin: el("asset-used-margin"),
      assetUnrealized: el("asset-unrealized"),
      assetRealized: el("asset-realized"),
      assetFees: el("asset-fees"),
    };
  }

  function getMarginValue() {
    const v = parseFloat((dom.marginInput.value || "0").replace(/[^0-9.]/g, ""));
    if (isNaN(v)) return 0;
    return fromDisplayValue(v); // 화면 통화 → USDT
  }
  function getOptionalPrice(input) {
    if (!input) return null;
    const v = parseFloat((input.value || "").replace(/[^0-9.]/g, ""));
    if (isNaN(v) || v <= 0) return null;
    return fromDisplayValue(v); // 화면 통화 → USDT
  }

  /* ---------------- 렌더링 ---------------- */
  function render(snapshot) {
    lastSnapshot = snapshot;
    dom.balanceValue.textContent = App.Utils.formatCurrency(snapshot.equity);

    // 탭 건수 표시(바이낸스 "Positions(1)/Open Orders(0)/Order History(0)" 참고) —
    // 전부 이미 있는 snapshot 값 개수만 세는 것이라 새 계산이 전혀 아닙니다.
    if (dom.tabBtnPosition) dom.tabBtnPosition.textContent = "포지션(" + (snapshot.position ? 1 : 0) + ")";
    if (dom.tabBtnPending) dom.tabBtnPending.textContent = "미체결(" + (snapshot.pendingOrder ? 1 : 0) + ")";
    if (dom.tabBtnOrders) dom.tabBtnOrders.textContent = "주문내역(" + ((snapshot.orderHistory && snapshot.orderHistory.length) || 0) + ")";

    const busy = !!snapshot.position || !!snapshot.pendingOrder; // 포지션 또는 미체결 주문 중 하나라도 있으면 신규 진입 불가
    dom.btnLong.disabled = busy;
    dom.btnShort.disabled = busy;

    if (dom.pendingOrderCard) {
      if (snapshot.pendingOrder) {
        const order = snapshot.pendingOrder;
        dom.pendingOrderCard.style.display = "block";
        dom.pendingSideBadge.textContent = order.side === "long" ? "LONG" : "SHORT";
        dom.pendingSideBadge.className = "badge " + order.side;
        dom.pendingPrice.textContent = App.Utils.formatCurrencyPlain(order.price);
        dom.pendingLeverage.textContent = order.leverage + "x";
        dom.pendingMargin.textContent = App.Utils.formatCurrency(order.margin);
      } else {
        dom.pendingOrderCard.style.display = "none";
      }
    }

    if (!snapshot.position) {
      dom.positionEmpty.style.display = "block";
      dom.positionCard.style.display = "none";
    } else {
      dom.positionEmpty.style.display = "none";
      dom.positionCard.style.display = "block";
      const pos = snapshot.position;

      dom.posSideBadge.textContent = pos.side === "long" ? "LONG" : "SHORT";
      dom.posSideBadge.className = "badge " + pos.side;
      dom.posEntry.textContent = App.Utils.formatCurrencyPlain(pos.entry);
      dom.posCurrent.textContent = App.Utils.formatCurrencyPlain(snapshot.currentPrice);
      dom.posLeverage.textContent = pos.leverage + "x";
      dom.posMargin.textContent = App.Utils.formatCurrency(pos.margin);
      // 바이낸스 포지션 표의 "Size" 컬럼처럼 방향을 부호+색으로 표시(LONG=+, SHORT=-).
      // pos.qty 자체(계산에 쓰이는 값)는 그대로 양수이고, 여기선 표시 문자열만 만듭니다.
      dom.posQty.textContent = (pos.side === "long" ? "+" : "-") + App.Utils.formatQty(pos.qty);
      dom.posQty.className = pos.side === "long" ? "qty-long" : "qty-short";
      dom.posLiq.textContent = App.Utils.formatCurrencyPlain(pos.liq);
      dom.posTp.textContent = pos.tp ? App.Utils.formatCurrencyPlain(pos.tp) : "-";
      dom.posSl.textContent = pos.sl ? App.Utils.formatCurrencyPlain(pos.sl) : "-";
      if (dom.posEntryFee) dom.posEntryFee.textContent = App.Utils.formatCurrency(pos.entryFee);

      const pnlClass = snapshot.unrealizedPnl >= 0 ? "pnl-positive" : "pnl-negative";
      dom.posPnl.textContent = App.Utils.formatCurrencySigned(snapshot.unrealizedPnl);
      dom.posPnl.className = pnlClass;
      dom.posPnlPct.textContent = fmtSignedPercent(snapshot.roe);
      dom.posPnlPct.className = pnlClass;
      // 버그 수정: 기존엔 이 자리(원래 "손익률")에 ROE(레버리지 반영)를 보여줘서
      // 진입 직후에도 고배율에선 수백%가 뜨는 것처럼 보였습니다. 레버리지
      // 미포함 일반 수익률을 별도 행("수익률")으로 새로 추가합니다.
      if (dom.posReturnRate) {
        const returnClass = snapshot.returnRate >= 0 ? "pnl-positive" : "pnl-negative";
        dom.posReturnRate.textContent = fmtSignedPercent(snapshot.returnRate);
        dom.posReturnRate.className = returnClass;
      }
    }

    renderHistory(snapshot.closedTrades);
    renderOrderHistory(snapshot.orderHistory, snapshot.orderHistoryVersion);
    renderAssets(snapshot);
    renderCurrencyUnitLabels();
  }

  function fmtSignedPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (n >= 0 ? "+" : "") + n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function renderHistory(closedTrades) {
    if (!dom.historyBody) return;
    const list = closedTrades || [];
    if (list.length === lastHistoryLength) return; // 성능 최적화: 안 바뀌었으면 재렌더링 생략
    lastHistoryLength = list.length;

    if (list.length === 0) {
      dom.historyBody.innerHTML = '<tr class="empty"><td colspan="11">거래 내역이 없습니다.</td></tr>';
      return;
    }
    dom.historyBody.innerHTML = list
      .slice(0, 50)
      .map((t) => {
        const pnlClass = t.pnl >= 0 ? "pnl-positive" : "pnl-negative";
        const reasonClass = t.reason === "강제청산" ? "reason-forced" : "";
        // 버그 수정: returnRate(레버리지 미포함 일반 수익률)를 pnlPercent(ROE)와
        // 별도 컬럼으로 표시합니다. 이 필드 추가 이전에 저장된 옛 거래 기록은
        // returnRate가 없을 수 있어서 그 경우 "-"로 안전하게 처리합니다.
        const returnRateClass = typeof t.returnRate === "number" ? (t.returnRate >= 0 ? "pnl-positive" : "pnl-negative") : "";
        const returnRateText = typeof t.returnRate === "number" ? fmtSignedPercent(t.returnRate) : "-";
        return (
          "<tr>" +
          '<td style="font-family:var(--sans)">' + fmtTime(t.closeTime) + "</td>" +
          '<td><span class="badge ' + t.side + '">' + (t.side === "long" ? "LONG" : "SHORT") + "</span></td>" +
          "<td>" + t.leverage + "x</td>" +
          "<td>" + App.Utils.formatCurrencyPlain(t.entry) + "</td>" +
          "<td>" + App.Utils.formatCurrencyPlain(t.exit) + "</td>" +
          "<td>" + App.Utils.formatCurrency(t.margin) + "</td>" +
          '<td class="' + pnlClass + '">' + App.Utils.formatCurrencySigned(t.pnl) + "</td>" +
          '<td class="' + returnRateClass + '">' + returnRateText + "</td>" +
          '<td class="' + pnlClass + '">' + fmtSignedPercent(t.pnlPercent) + "</td>" +
          "<td>" + App.Utils.formatCurrency(t.fee) + "</td>" +
          '<td><span class="badge-reason ' + reasonClass + '">' + t.reason + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  /* ---------------- 주문내역 탭 ----------------
   * orderHistory는 배열 길이가 그대로여도 항목 상태가 OPEN→FILLED/CANCELLED로
   * "제자리에서" 바뀔 수 있어서, 길이 비교만으로는 변경을 놓칩니다. 그래서
   * trading.js가 함께 내려주는 orderHistoryVersion(모든 변경마다 증가)으로
   * dirty-check를 합니다.
   * ------------------------------------------------------------------- */
  let lastOrderHistoryVersion = -1;
  const TYPE_LABEL = { market: "시장가", limit: "지정가" };

  function renderOrderHistory(orderHistory, version) {
    if (!dom.orderHistoryBody) return;
    if (version === lastOrderHistoryVersion) return; // 성능 최적화: 실제로 안 바뀌었으면 생략
    lastOrderHistoryVersion = version;

    const list = orderHistory || [];
    if (list.length === 0) {
      dom.orderHistoryBody.innerHTML = '<tr class="empty"><td colspan="7">주문 내역이 없습니다.</td></tr>';
      return;
    }
    dom.orderHistoryBody.innerHTML = list
      .slice(0, 50)
      .map((o) => {
        // 기존 클래스 재사용: 체결완료=초록(pnl-positive), 취소됨=빨강(badge-reason.reason-forced), 미체결=기본 회색(badge-reason)
        const statusHtml =
          o.status === "FILLED"
            ? '<span class="pnl-positive">체결완료</span>'
            : o.status === "CANCELLED"
            ? '<span class="badge-reason reason-forced">취소됨</span>'
            : '<span class="badge-reason">미체결</span>';
        return (
          "<tr>" +
          '<td style="font-family:var(--sans)">' + fmtTime(o.createdTime) + "</td>" +
          '<td><span class="badge ' + o.side + '">' + (o.side === "long" ? "LONG" : "SHORT") + "</span></td>" +
          "<td>" + (TYPE_LABEL[o.type] || o.type) + "</td>" +
          "<td>" + App.Utils.formatCurrencyPlain(o.price) + "</td>" +
          "<td>" + o.leverage + "x</td>" +
          "<td>" + App.Utils.formatCurrency(o.margin) + "</td>" +
          "<td>" + statusHtml + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  /* ---------------- 자산 탭 ---------------- */
  function renderAssets(snapshot) {
    if (!dom.assetEquity) return;
    dom.assetEquity.textContent = App.Utils.formatCurrency(snapshot.equity);
    dom.assetBalance.textContent = App.Utils.formatCurrency(snapshot.balance);
    dom.assetUsedMargin.textContent = App.Utils.formatCurrency(snapshot.usedMargin);
    dom.assetUnrealized.textContent = App.Utils.formatCurrencySigned(snapshot.unrealizedPnl);
    dom.assetUnrealized.className = snapshot.unrealizedPnl >= 0 ? "pnl-positive" : "pnl-negative";
    dom.assetRealized.textContent = App.Utils.formatCurrencySigned(snapshot.realizedPnl);
    dom.assetRealized.className = snapshot.realizedPnl >= 0 ? "pnl-positive" : "pnl-negative";
    dom.assetFees.textContent = App.Utils.formatCurrency(snapshot.totalFeesPaid);
    if (dom.assetFunding) {
      dom.assetFunding.textContent = App.Utils.formatCurrencySigned(snapshot.totalFundingPaid);
      dom.assetFunding.className = snapshot.totalFundingPaid >= 0 ? "pnl-positive" : "pnl-negative";
    }
    renderFundingHistory(snapshot.fundingHistory);
  }

  // fundingHistory는 closedTrades처럼 정산될 때만 unshift로 늘어나기만 하므로
  // 길이 비교 dirty-check가 안전합니다(orderHistory와 달리 제자리 상태 변경이 없음).
  let lastFundingHistoryLength = -1;
  function renderFundingHistory(fundingHistory) {
    if (!dom.fundingHistoryBody) return;
    const list = fundingHistory || [];
    if (list.length === lastFundingHistoryLength) return;
    lastFundingHistoryLength = list.length;

    if (list.length === 0) {
      dom.fundingHistoryBody.innerHTML = '<tr class="empty"><td colspan="6">펀딩 정산 내역이 없습니다.</td></tr>';
      return;
    }
    dom.fundingHistoryBody.innerHTML = list
      .slice(0, 50)
      .map((f) => {
        const feeClass = f.fundingFee >= 0 ? "pnl-positive" : "pnl-negative";
        return (
          "<tr>" +
          '<td style="font-family:var(--sans)">' + fmtTime(f.fundingTime) + "</td>" +
          '<td><span class="badge ' + f.positionSide + '">' + (f.positionSide === "long" ? "LONG" : "SHORT") + "</span></td>" +
          "<td>" + App.Utils.formatQty(f.positionSize) + "</td>" +
          "<td>" + App.Utils.formatCurrencyPlain(f.markPrice) + "</td>" +
          "<td>" + (f.fundingRate * 100).toFixed(4) + "%</td>" +
          '<td class="' + feeClass + '">' + App.Utils.formatCurrencySigned(f.fundingFee) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }
  function renderCurrencyUnitLabels() {
    const label = currencyUnitLabel();
    if (dom.marginUnitLabel) dom.marginUnitLabel.textContent = label;
    if (dom.tpUnitLabel) dom.tpUnitLabel.textContent = label;
    if (dom.slUnitLabel) dom.slUnitLabel.textContent = label;
    if (dom.limitPriceUnitLabel) dom.limitPriceUnitLabel.textContent = label;
    const cur = App.Config.getDisplayCurrency();
    if (dom.btnCurUsdt) dom.btnCurUsdt.classList.toggle("active", cur === "USDT");
    if (dom.btnCurKrw) dom.btnCurKrw.classList.toggle("active", cur === "KRW");
  }

  /* ---------------- 이벤트 바인딩 ---------------- */
  function bindOrderPanel() {
    // 모바일에서 숨겨진 저우선순위 컬럼(청산가/증거금/TP/SL/진입수수료/수익률)을
    // "더보기"로 펼쳐볼 수 있게. 순수 표시 토글이라 데이터/계산과 무관합니다.
    const expandBtn = el("position-expand-btn");
    const posTable = el("position-table");
    if (expandBtn && posTable) {
      expandBtn.addEventListener("click", () => {
        const expanded = posTable.classList.toggle("expanded");
        expandBtn.textContent = expanded ? "접기 ▴" : "더보기 ▾";
      });
    }

    document.querySelectorAll(".interval-btn[data-order-type]").forEach((chip) => {
      chip.addEventListener("click", () => {
        orderType = chip.dataset.orderType;
        document.querySelectorAll(".interval-btn[data-order-type]").forEach((c) => c.classList.toggle("active", c === chip));
        if (dom.limitPriceField) dom.limitPriceField.style.display = orderType === "limit" ? "block" : "none";
      });
    });

    dom.levSlider.addEventListener("input", () => {
      const lev = parseInt(dom.levSlider.value, 10);
      App.Trading.setLeverage(lev);
      dom.levDisplay.textContent = lev;
    });

    document.querySelectorAll(".chip[data-margin]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const snapshot = App.Trading.getSnapshot();
        if (chip.dataset.margin === "max") {
          dom.marginInput.value = toDisplayValueFloor(App.Trading.getMaxAffordableMargin());
        } else {
          // data-margin은 항상 USDT 기준값 — 화면에는 현재 선택된 통화로 환산해서 넣음
          dom.marginInput.value = toDisplayValue(parseFloat(chip.dataset.margin));
        }
      });
    });

    document.querySelectorAll(".chip[data-close-ratio]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const ratio = parseFloat(chip.dataset.closeRatio);
        const reason = ratio >= 1 ? "수동청산" : "부분청산";
        const result = App.Trading.closePartial(ratio, reason);
        if (!result.ok) dom.orderErr.textContent = result.error;
      });
    });

    // 요구사항 2: 0~100% 직접 입력 청산
    if (dom.btnPartialCloseCustom) {
      dom.btnPartialCloseCustom.addEventListener("click", () => {
        dom.orderErr.textContent = "";
        const raw = parseFloat((dom.partialCloseInput.value || "").replace(/[^0-9.]/g, ""));
        if (isNaN(raw)) {
          dom.orderErr.textContent = "청산 비율을 입력해주세요.";
          return;
        }
        if (raw <= 0) {
          dom.orderErr.textContent = "청산 비율은 0%보다 커야 합니다.";
          return;
        }
        if (raw > 100) {
          dom.orderErr.textContent = "청산 비율은 100%를 초과할 수 없습니다.";
          return;
        }
        const ratio = raw / 100;
        const reason = ratio >= 1 ? "수동청산" : "부분청산";
        const result = App.Trading.closePartial(ratio, reason);
        if (!result.ok) {
          dom.orderErr.textContent = result.error;
          return;
        }
        dom.partialCloseInput.value = "";
      });
    }

    function submit(side) {
      dom.orderErr.textContent = "";
      const margin = getMarginValue();
      const tp = getOptionalPrice(dom.tpInput);
      const sl = getOptionalPrice(dom.slInput);

      let result;
      if (orderType === "limit") {
        const price = getOptionalPrice(dom.limitPriceInput);
        if (!price) {
          dom.orderErr.textContent = "지정가를 입력해주세요.";
          return;
        }
        result = App.Trading.placeLimitOrder(side, price, margin, tp, sl);
      } else {
        result = App.Trading.openPosition(side, margin, tp, sl);
      }

      if (!result.ok) {
        dom.orderErr.textContent = result.error;
        return;
      }
      dom.tpInput.value = "";
      dom.slInput.value = "";
      if (dom.limitPriceInput) dom.limitPriceInput.value = "";
    }

    dom.btnLong.addEventListener("click", () => submit("long"));
    dom.btnShort.addEventListener("click", () => submit("short"));

    dom.btnClosePosition.addEventListener("click", () => {
      App.Trading.closePosition("수동청산");
    });

    if (dom.btnCancelOrder) {
      dom.btnCancelOrder.addEventListener("click", () => {
        App.Trading.cancelPendingOrder();
      });
    }

    if (dom.btnCurUsdt) dom.btnCurUsdt.addEventListener("click", () => App.Config.setDisplayCurrency("USDT"));
    if (dom.btnCurKrw) dom.btnCurKrw.addEventListener("click", () => App.Config.setDisplayCurrency("KRW"));
  }

  function bindBusEvents() {
    App.Bus.on("trading:update", render);
    App.Bus.on("currency:change", () => {
      if (lastSnapshot) render(lastSnapshot); // 데이터는 그대로, 표시만 다시 계산
      else renderCurrencyUnitLabels();
    });
  }

  function init() {
    injectDynamicUI();
    cacheDom();
    bindOrderPanel();
    bindBusEvents();
    renderCurrencyUnitLabels();
    render(App.Trading.getSnapshot());
  }

  return { init };
})();
