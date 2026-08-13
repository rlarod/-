/* =========================================================================
 * js/trades.js — App.RecentTrades
 * =========================================================================
 * 최근 체결(Recent Trades) 목록입니다. 새 WebSocket을 만들지 않습니다 —
 * js/websocket.js가 이미 열어둔 /market 연결의 @trade 스트림을 그대로
 * 파싱해서 내보내는 'trade:tick' 이벤트만 구독합니다(호가창과 같은 원리로
 * "기존 연결 재사용"). REST 폴링도 사용하지 않습니다.
 *
 * ── 성능 ─────────────────────────────────────────────────────────
 *   - 표시 개수를 MAX_ROWS(30)로 제한하고, 그 이상은 화면에서도, 내부
 *     버퍼에서도 잘라냅니다(메모리 누수 방지).
 *   - DOM 행을 미리 만들어두고 재사용합니다(체결마다 새로 만들지 않음).
 *   - 체결이 아주 잦을 때를 대비해 requestAnimationFrame으로 실제 DOM
 *     삽입을 배치 처리합니다.
 * ========================================================================= */

window.App = window.App || {};

App.RecentTrades = (function () {
  "use strict";

  const MAX_ROWS = 30;

  let container = null;
  let listEl = null;
  let rowEls = []; // 재사용 가능한 행 DOM 풀
  let pendingTicks = [];
  let renderScheduled = false;

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- DOM 생성 (index.html 구조는 바꾸지 않고 JS로 패널 추가) ---------------- */
  function injectPanel() {
    const anchor = el("orderbook-panel");
    if (!anchor || el("recent-trades-panel")) return;

    container = document.createElement("div");
    container.className = "panel orderbook-panel"; // 기존 호가창 패널과 동일한 스타일 재사용
    container.id = "recent-trades-panel";
    container.style.marginTop = "0"; // chart-column의 gap이 이미 간격을 줌
    container.innerHTML =
      '<div class="ob-header">' +
      '<span class="ob-title">최근 체결 (BTCUSDT)</span>' +
      '<span class="ob-cols"><span>가격</span><span>수량</span><span>시간</span></span>' +
      "</div>" +
      '<div class="ob-bids" id="recent-trades-list"></div>';

    anchor.parentNode.insertBefore(container, anchor.nextSibling);
    listEl = el("recent-trades-list");
  }

  function ensureRowEls(count) {
    while (rowEls.length < count) {
      const row = document.createElement("div");
      row.className = "ob-row"; // 호가창 행과 동일한 그리드/폰트 스타일 재사용
      row.innerHTML =
        '<span class="ob-price"></span>' +
        '<span class="ob-qty"></span>' +
        '<span class="ob-cum"></span>';
      listEl.appendChild(row);
      rowEls.push(row);
    }
  }

  function fmtTime(ms) {
    const d = new Date(ms);
    return (
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  function onTradeTick(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    pendingTicks.push(payload);
    if (pendingTicks.length > MAX_ROWS) pendingTicks.shift(); // 프레임 사이 과도한 누적 방지
    scheduleRender();
  }

  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      flush();
    });
  }

  let recentTrades = []; // 최신이 index 0

  function flush() {
    if (!listEl || pendingTicks.length === 0) return;
    // 최신 체결이 위로 오도록 앞에 추가하고, MAX_ROWS개로 잘라냄(메모리 누수 방지)
    recentTrades = pendingTicks.slice().reverse().concat(recentTrades).slice(0, MAX_ROWS);
    pendingTicks = [];
    render();
  }

  function render() {
    ensureRowEls(recentTrades.length);
    for (let i = 0; i < rowEls.length; i++) {
      const rowEl = rowEls[i];
      const t = recentTrades[i];
      if (!t) {
        rowEl.style.display = "none";
        continue;
      }
      rowEl.style.display = "";
      // isBuyerMaker가 true면 테이커가 매도(가격 하락 방향), false면 테이커가 매수(상승 방향)
      const isSell = t.isBuyerMaker;
      rowEl.className = "ob-row " + (isSell ? "ob-ask" : "ob-bid");
      rowEl.querySelector(".ob-price").textContent = App.Utils.formatCurrencyPlain(t.price);
      rowEl.querySelector(".ob-qty").textContent = t.qty.toFixed(3);
      rowEl.querySelector(".ob-cum").textContent = fmtTime(t.time);
    }
  }

  function onCurrencyChange() {
    render(); // 데이터는 그대로, 가격 표시만 다시 계산
  }

  function init() {
    injectPanel();
    if (!listEl) return; // 호가창 패널이 없으면(예: 다른 페이지) 조용히 아무 것도 안 함
    App.Bus.on("trade:tick", onTradeTick);
    App.Bus.on("currency:change", onCurrencyChange);
  }

  return { init };
})();
