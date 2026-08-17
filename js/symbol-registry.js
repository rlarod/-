/* =========================================================================
 * js/symbol-registry.js — App.SymbolRegistry
 * =========================================================================
 * 다종목 확장의 첫 단계(PHASE 4). 종목 메타데이터를 한 곳에서 관리합니다.
 * 이 파일은 순수하게 새로 추가된 것이고, 기존 어떤 파일도 이걸 아직
 * 참조하지 않습니다 — 그래서 지금 추가해도 기존 BTC 동작에 영향이
 * 전혀 없습니다(안전하게 먼저 깔아두는 기반 작업).
 *
 * dataSource 필드:
 *   "binance" — 기존 websocket.js(Binance Futures) 그대로 사용
 *   "mock"    — 아직 실제 데이터 공급원이 연결되지 않음. 화면에 반드시
 *               "(Mock 데이터)" 같은 표시를 해야 합니다(실제 시세처럼
 *               보이면 안 됨 — PHASE 3 요구사항).
 * ========================================================================= */

window.App = window.App || {};

App.SymbolRegistry = (function () {
  "use strict";

  const SYMBOLS = [
    { symbol: "BTCUSDT", name: "비트코인", type: "crypto", dataSource: "binance" },
    // ETH는 아직 websocket.js/chart.js/trading.js가 BTC 단일 심볼로 동작하기 때문에
    // 실제 거래 연결이 안 돼 있습니다. "준비중"으로만 노출됩니다(가짜 시세 금지).
    { symbol: "ETHUSDT", name: "이더리움", type: "crypto", dataSource: "mock" },
    { symbol: "005930", name: "삼성전자", type: "stock", dataSource: "mock" },
    { symbol: "000660", name: "SK하이닉스", type: "stock", dataSource: "mock" },
    { symbol: "NDX", name: "NASDAQ 100", type: "index", dataSource: "mock" },
  ];

  function getAll() {
    return SYMBOLS.slice();
  }
  function getBySymbol(symbol) {
    return SYMBOLS.find((s) => s.symbol === symbol) || null;
  }
  function isMock(symbol) {
    const s = getBySymbol(symbol);
    return !s || s.dataSource === "mock";
  }

  return { getAll, getBySymbol, isMock };
})();
