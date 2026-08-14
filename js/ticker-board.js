/* =========================================================================
 * js/ticker-board.js — App.TickerBoard
 * =========================================================================
 * "📊 전광판" — 여러 종목을 표로 한눈에 보여줍니다(개미톡 등 참고).
 * 예전에 만들어둔 App.SymbolRegistry / App.MarketData 어댑터를 여기서
 * 처음으로 실제로 사용합니다 — trading.js/websocket.js/chart.js는
 * 전혀 안 건드리고, 어댑터가 이미 노출하는 getPrice()/getMarketStats()만
 * 읽어서 표시만 합니다.
 *
 * 요구사항(다종목 PHASE 3): Mock 가격을 실제 시장가격인 것처럼 보여주지
 * 않는다 — 그래서 dataSource가 "mock"인 종목은 행 전체에 "(모의)" 표시를
 * 명확히 붙입니다.
 * ========================================================================= */

window.App = window.App || {};

App.TickerBoard = (function () {
  "use strict";

  const REFRESH_INTERVAL_MS = 2000;

  let dom = {};
  let timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function fmtPrice(v) {
    if (v === null || v === undefined) return "-";
    return Number(v).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtPercent(v) {
    if (v === null || v === undefined || isNaN(v)) return "-";
    return (v >= 0 ? "+" : "") + Number(v).toFixed(2) + "%";
  }

  function render() {
    if (!dom.body || !App.SymbolRegistry || !App.MarketData) return;
    const symbols = App.SymbolRegistry.getAll();

    dom.body.innerHTML = symbols
      .map((s) => {
        const adapter = App.MarketData.getAdapter(s.symbol);
        if (!adapter) return "";
        const price = adapter.getPrice();
        const stats = adapter.getMarketStats();
        const changeClass = stats.changePercent >= 0 ? "pnl-positive" : "pnl-negative";
        return (
          "<tr>" +
          '<td style="text-align:left;">' +
          s.name +
          ' <span class="ticker-board-code">' + s.symbol + "</span>" +
          (adapter.isMock ? '<span class="ticker-board-mock-badge">모의</span>' : "") +
          "</td>" +
          "<td>" + fmtPrice(price) + "</td>" +
          '<td class="' + changeClass + '">' + fmtPercent(stats.changePercent) + "</td>" +
          "<td>" + fmtPrice(stats.high24h) + "</td>" +
          "<td>" + fmtPrice(stats.low24h) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function init() {
    dom = { body: el("ticker-board-body") };
    if (!dom.body) return;
    render();
    timer = setInterval(render, REFRESH_INTERVAL_MS);
  }

  return { init };
})();
