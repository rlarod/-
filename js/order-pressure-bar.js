/* =========================================================================
 * js/order-pressure-bar.js — App.OrderPressureBar
 * =========================================================================
 * 주문창 하단의 매수/매도 비율 바.
 *
 * ── 2026-08-21 TL-005 수정 ────────────────────────────────────────────
 * 이전에는 App.MarketWar.getBuySellRatio() 를 그대로 읽어 썼습니다.
 * 그 값은 전쟁터 연출용 "강도(intensity)" 에서 나오는데, 두 가지 이유로
 * 압력 바에 쓰기에 맞지 않습니다.
 *
 *   ① 체결이 하나도 안 올 때 강도는 둘 다 0 이고, getBuySellRatio() 는
 *      total 이 0 이면 50 을 돌려줍니다. 즉 "모름"이 "반반"으로 보였습니다.
 *      (TL-004 로 체결 스트림을 살리기 전까지 늘 이 상태였습니다.)
 *   ② 체결이 살아난 뒤에도 여전히 50:50 입니다. 강도는 체결 1건마다
 *      최소 10 씩 오르고(FREQUENCY_GAIN) 초당 4.5 밖에 안 내려가는데,
 *      실제 체결은 초당 수십 건이라 매수·매도 강도가 둘 다 상한 100 에
 *      붙어버립니다. 실측: mw-buy-pct 100% / mw-sell-pct 98~100% 고정.
 *      상한에 붙은 두 값의 비율은 언제나 50:50 입니다.
 *      → 강도는 "얼마나 격렬한가"를 나타내는 연출값이지 "어느 쪽이
 *        우세한가"를 나타내는 값이 아닙니다.
 *
 * 그래서 이제 실제 체결 거래량으로 직접 계산합니다 — 거래소의 매수/매도
 * 압력과 같은 정의입니다: 최근 60초 동안 테이커 매수 체결량 vs 테이커
 * 매도 체결량. (trade:tick 의 isBuyerMaker 가 false 면 테이커 매수)
 *
 * js/market-war.js 는 한 글자도 건드리지 않았습니다 — 전쟁터 연출은
 * 지금 값 그대로 두는 것이 맞습니다.
 *
 * 데이터가 없으면 50:50 을 지어내지 않고 '데이터 없음'을 표시합니다.
 * 스트림이 또 끊겨도 아무도 모르는 상태를 만들지 않기 위해서입니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderPressureBar = (function () {
  "use strict";

  const REFRESH_INTERVAL_MS = 1000;
  const WINDOW_MS = 60000; // 최근 60초 체결로 계산

  let dom = {};
  let timer = null;
  let ticks = []; // { t, qty, isBuy } — 60초보다 오래된 것은 매번 버려서 무한히 안 늘어납니다

  function el(id) {
    return document.getElementById(id);
  }

  function onTradeTick(p) {
    if (!p) return;
    /* 종목 확인 (2026-08-27, 종목 전환 4번 관문)
       이걸 안 보면 종목을 바꾼 뒤 60초 동안 옛 종목 체결이 비율에 섞입니다.
       같은 방식이 js/trades.js·js/orderbook.js 에 이미 있습니다. */
    if (
      typeof p.symbol === "string" &&
      App.Config &&
      typeof App.Config.getActiveSymbol === "function" &&
      p.symbol !== App.Config.getActiveSymbol()
    ) {
      return;
    }
    const qty = Number(p.qty);
    if (!isFinite(qty) || qty <= 0) return;
    ticks.push({ t: p.time || Date.now(), qty: qty, isBuy: !p.isBuyerMaker });
  }

  /* 종목이 바뀌면 모아둔 옛 종목 체결을 통째로 버립니다.
     안 버리면 새 종목 이름표 아래에 옛 종목 비율이 최대 60초간 남습니다. */
  function onSymbolChange() {
    ticks = [];
    render();
  }

  // 최근 WINDOW_MS 동안의 체결량 비율. 데이터가 없으면 null(=모름).
  function computeRatio() {
    const cut = Date.now() - WINDOW_MS;
    while (ticks.length && ticks[0].t < cut) ticks.shift();

    let buyQty = 0;
    let sellQty = 0;
    for (let i = 0; i < ticks.length; i++) {
      if (ticks[i].isBuy) buyQty += ticks[i].qty;
      else sellQty += ticks[i].qty;
    }
    const total = buyQty + sellQty;
    if (total <= 0) return null;

    const buyPct = Math.round((buyQty / total) * 100);
    return { buyPct: buyPct, sellPct: 100 - buyPct };
  }

  function render() {
    const r = computeRatio();

    if (!r) {
      // 체결이 하나도 없음 — 반반이 아니라 "모른다"고 말합니다.
      if (dom.buyBar) dom.buyBar.style.width = "50%";
      if (dom.sellBar) dom.sellBar.style.width = "50%";
      if (dom.buyPctText) dom.buyPctText.textContent = "매수 —";
      if (dom.sellPctText) dom.sellPctText.textContent = "매도 —";
      return;
    }

    if (dom.buyBar) dom.buyBar.style.width = r.buyPct + "%";
    if (dom.sellBar) dom.sellBar.style.width = r.sellPct + "%";
    if (dom.buyPctText) dom.buyPctText.textContent = "매수 " + r.buyPct + "%";
    if (dom.sellPctText) dom.sellPctText.textContent = "매도 " + r.sellPct + "%";
  }

  function init() {
    dom = {
      buyBar: el("order-pressure-buy"),
      sellBar: el("order-pressure-sell"),
      buyPctText: el("order-pressure-buy-text"),
      sellPctText: el("order-pressure-sell-text"),
    };
    if (!dom.buyBar) return; // 마크업 없으면 조용히 종료

    App.Bus.on("trade:tick", onTradeTick);
    App.Bus.on("symbol:change", onSymbolChange);
    render();
    timer = setInterval(render, REFRESH_INTERVAL_MS);
  }

  // 검증용 — 화면에 그리는 것과 같은 값을 그대로 돌려줍니다(데이터 없으면 null).
  return { init, getRatio: computeRatio };
})();
