/* =========================================================================
 * js/orderbook.js — App.OrderBook
 * =========================================================================
 * 실시간 호가창(Order Book)입니다. Binance Futures의 공식 "Partial Book
 * Depth" WebSocket 스트림(<symbol>@depth5@500ms)을 그대로 사용합니다 —
 * REST API를 반복 호출하지 않고, 상위 5개 매도/매수 호가를 Binance가 이미
 * 정렬해서 보내주는 그대로 받습니다. 직접 오더북을 합성하지 않습니다.
 *
 * ── 기존 WebSocket 연결을 재사용하지 못한 이유 ─────────────────────
 * js/websocket.js는 kline/ticker/trade 스트림을 위해 이미
 * wss://fstream.binance.com/market/... 에 연결되어 있습니다. 그런데
 * Binance가 2026-04-23에 발표한 새 주소 체계에서 depth(호가) 스트림은
 * /public 경로로, kline/ticker/trade 같은 "Regular market feeds"는 /market
 * 경로로 분리되어 있어 — 같은 커넥션에 함께 구독할 수 없습니다(연결마다
 * 하나의 라우팅 경로로 고정됨). 그래서 이 파일만 별도로 얕은 두 번째
 * WebSocket 연결을 엽니다. js/websocket.js는 단 한 줄도 건드리지 않았습니다.
 *
 * ── 성능 최적화 ─────────────────────────────────────────────────
 *   - Binance 쪽에서 이미 500ms 간격으로만 메시지를 보내도록 스트림
 *     자체를 선택했습니다(@depth5@500ms) — 더 빠른 100ms 스트림도 있지만
 *     화면이 5단계 호가만 보여주는 용도라 500ms로 충분히 "실시간"으로
 *     느껴지고, 브라우저 부담은 훨씬 적습니다.
 *   - 그 안에서도 실제 DOM 렌더링은 requestAnimationFrame으로 한 번 더
 *     배치 처리합니다 — 같은 프레임 안에 메시지가 여러 번 와도 화면
 *     갱신은 프레임당 최대 1번만 일어납니다.
 *   - 매 렌더마다 5+5개 행의 DOM 노드를 새로 만들지 않고, 처음 한 번만
 *     만들어두고 이후에는 textContent/style만 갱신합니다(reflow 최소화).
 *
 * ── 다른 모듈과의 데이터 공유 ───────────────────────────────────────
 * 파싱한 호가 데이터를 'orderbook:update' 이벤트로 App.Bus에 공유합니다
 * (js/market-war.js가 이 이벤트를 구독해서 새 WebSocket 없이 재사용합니다).
 * 연결/렌더링 로직 자체는 이 공유 때문에 전혀 바뀌지 않았습니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderBook = (function () {
  "use strict";

  const DEPTH_LEVELS = 5;
  const STREAM_SPEED = "500ms";
  const RECONNECT_MIN_MS = 1000;
  const RECONNECT_MAX_MS = 15000;
  const PRICE_THROTTLE_MS = 300; // 현재가 표시는 체결마다가 아니라 이 주기로만 갱신

  let ws = null;
  let reconnectDelay = 0;
  let renderScheduled = false;
  let latestBids = []; // [{price, qty}], 높은 가격 순
  let latestAsks = []; // [{price, qty}], 낮은 가격 순
  let lastPriceRenderAt = 0;
  let lastPricePayload = null;

  let dom = {
    asksEl: null,
    bidsEl: null,
    currentPriceEl: null,
  };
  let askRowEls = []; // 미리 만들어둔 행 DOM (재사용)
  let bidRowEls = [];

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- WebSocket (호가 전용, 별도 연결) ---------------- */
  function buildUrl() {
    const symbol = App.Config.getActiveSymbol().toLowerCase();
    // Binance Futures 공식 신규 주소 체계: 호가(depth) 스트림은 /public 경로
    return "wss://fstream.binance.com/public/ws/" + symbol + "@depth" + DEPTH_LEVELS + "@" + STREAM_SPEED;
  }

  function connect() {
    let socket;
    try {
      socket = new WebSocket(buildUrl());
    } catch (e) {
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      reconnectDelay = RECONNECT_MIN_MS;
    };
    socket.onmessage = (evt) => handleMessage(evt.data);
    socket.onerror = () => {
      try {
        socket.close();
      } catch (e) {
        /* noop */
      }
    };
    socket.onclose = () => {
      scheduleReconnect(); // 호가창도 끊기면 자동 재연결 (REST로 대체하지 않음)
    };
  }

  function scheduleReconnect() {
    setTimeout(connect, reconnectDelay || RECONNECT_MIN_MS);
    reconnectDelay = Math.min((reconnectDelay || RECONNECT_MIN_MS) * 1.6, RECONNECT_MAX_MS);
  }

  function handleMessage(raw) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return;
    }
    if (!data || !Array.isArray(data.b) || !Array.isArray(data.a)) return;

    // Binance는 bids를 높은 가격 순, asks를 낮은 가격 순으로 이미 정렬해서 보내줍니다.
    // 가격은 원본 USDT 그대로 저장합니다 — 화면 표시만 currency formatter가 환산합니다.
    latestBids = data.b
      .map((row) => ({ price: parseFloat(row[0]), qty: parseFloat(row[1]) }))
      .filter((r) => r.qty > 0);
    latestAsks = data.a
      .map((row) => ({ price: parseFloat(row[0]), qty: parseFloat(row[1]) }))
      .filter((r) => r.qty > 0);

    // 이 파일이 파싱한 호가 데이터를 다른 모듈(예: MARKET WAR)도 새 WebSocket
    // 없이 그대로 쓸 수 있도록 버스에 공유합니다 — 연결/렌더링 로직은 그대로입니다.
    App.Bus.emit("orderbook:update", { bids: latestBids, asks: latestAsks });

    scheduleRender();
  }

  /* ---------------- 렌더링 (rAF로 배치 처리) ---------------- */
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      renderBook();
    });
  }

  // 화면에 표시할 행 계산: 누적 수량은 "현재가에 가까운 호가"부터 바깥쪽으로 합산합니다.
  function withCumulative(rows) {
    let cum = 0;
    return rows.map((r) => {
      cum += r.qty;
      return { price: r.price, qty: r.qty, cum: cum };
    });
  }

  function createRowEl(side) {
    const row = document.createElement("div");
    row.className = "ob-row ob-" + side;
    row.innerHTML =
      '<span class="ob-depth-bar"></span>' +
      '<span class="ob-price"></span>' +
      '<span class="ob-qty"></span>' +
      '<span class="ob-cum"></span>';
    return row;
  }

  function ensureRowEls(container, arr, side, count) {
    while (arr.length < count) {
      const row = createRowEl(side);
      container.appendChild(row);
      arr.push(row);
    }
  }

  function updateRow(rowEl, item, maxCum) {
    const depthPct = maxCum > 0 ? Math.min(100, (item.cum / maxCum) * 100) : 0;
    rowEl.querySelector(".ob-depth-bar").style.width = depthPct + "%";
    rowEl.querySelector(".ob-price").textContent = App.Utils.formatCurrencyPlain(item.price);
    rowEl.querySelector(".ob-qty").textContent = item.qty.toFixed(3);
    rowEl.querySelector(".ob-cum").textContent = item.cum.toFixed(2);
    rowEl.dataset.price = item.price;
    rowEl.style.display = "";
  }

  function renderBook() {
    if (!dom.asksEl || !dom.bidsEl) return;

    // 매도호가(asks): 화면엔 "현재가에서 먼 것이 위, 가까운 것이 아래"로 보여야 하므로
    // 누적은 가까운 값(최우선 매도호가)부터 먼 쪽으로 합산한 뒤, 표시만 뒤집습니다.
    const asksWithCum = withCumulative(latestAsks); // index 0 = 최우선(가장 가까운) 매도호가
    const bidsWithCum = withCumulative(latestBids); // index 0 = 최우선(가장 가까운) 매수호가

    const maxCum = Math.max(
      asksWithCum.length ? asksWithCum[asksWithCum.length - 1].cum : 0,
      bidsWithCum.length ? bidsWithCum[bidsWithCum.length - 1].cum : 0
    );

    ensureRowEls(dom.asksEl, askRowEls, "ask", DEPTH_LEVELS);
    ensureRowEls(dom.bidsEl, bidRowEls, "bid", DEPTH_LEVELS);

    // asks는 배열을 뒤집어서(먼 것부터) 위에서 아래로 그림 — 마지막 행이 현재가에 가장 가까움
    const asksForDisplay = asksWithCum.slice(0, DEPTH_LEVELS).reverse();
    for (let i = 0; i < DEPTH_LEVELS; i++) {
      const rowEl = askRowEls[i];
      const item = asksForDisplay[i];
      if (item) updateRow(rowEl, item, maxCum);
      else rowEl.style.display = "none";
    }

    const bidsForDisplay = bidsWithCum.slice(0, DEPTH_LEVELS);
    for (let i = 0; i < DEPTH_LEVELS; i++) {
      const rowEl = bidRowEls[i];
      const item = bidsForDisplay[i];
      if (item) updateRow(rowEl, item, maxCum);
      else rowEl.style.display = "none";
    }
  }

  /* ---------------- 현재가 표시 (기존 price:update 이벤트 재사용) ---------------- */
  function onPriceUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    lastPricePayload = payload;
    const now = Date.now();
    if (now - lastPriceRenderAt < PRICE_THROTTLE_MS) return; // 과도한 갱신 방지
    lastPriceRenderAt = now;
    if (dom.currentPriceEl) {
      dom.currentPriceEl.textContent = "현재가 " + App.Utils.formatCurrencyPlain(payload.price);
    }
  }

  function toDisplayValue(usdPrice) {
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") return Math.round(usdPrice * App.Config.USD_KRW);
    return Math.round(usdPrice * 100) / 100;
  }

  /* ---------------- 호가 클릭 → TP 입력창에 값 채우기 (선택 기능) ----------------
   * 참고: 이 코멘트를 쓸 당시엔 지정가 주문이 없었지만 이후 추가됐습니다.
   * 지금은 지정가 입력창(limit-price-input)도 따로 있지만, 호가창 클릭은
   * 여전히 TP(익절가) 입력창만 채우는 용도로 남겨뒀습니다 — 어느 입력창을
   * 채울지는 순수 UX 선택이라 이번 정리에서는 굳이 바꾸지 않았습니다.
   * 기존 주문 로직(App.Trading.openPosition/placeLimitOrder)은 전혀
   * 건드리지 않고, 그냥 입력창 값만 채웁니다. 입력창에는 현재 선택된
   * 표시 통화 기준 숫자를 넣습니다(ui.js가 제출 시 다시 USDT로 환산).
   * ------------------------------------------------------------------- */
  function bindRowClicks(container) {
    container.addEventListener("click", (evt) => {
      const row = evt.target.closest(".ob-row");
      if (!row || !row.dataset.price) return;
      const tpInput = el("tp-input");
      if (tpInput) {
        tpInput.value = toDisplayValue(parseFloat(row.dataset.price));
        tpInput.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  }

  function onCurrencyChange() {
    renderBook(); // 데이터는 그대로, 표시만 다시 계산
    if (lastPricePayload && dom.currentPriceEl) {
      dom.currentPriceEl.textContent = "현재가 " + App.Utils.formatCurrencyPlain(lastPricePayload.price);
    }
  }

  function init() {
    dom.asksEl = el("ob-asks");
    dom.bidsEl = el("ob-bids");
    dom.currentPriceEl = el("ob-current-price");
    if (!dom.asksEl || !dom.bidsEl) return; // 호가창 컨테이너가 없으면 조용히 아무 것도 안 함

    bindRowClicks(dom.asksEl);
    bindRowClicks(dom.bidsEl);

    App.Bus.on("price:update", onPriceUpdate);
    App.Bus.on("currency:change", onCurrencyChange);
    connect();
  }

  return { init };
})();
