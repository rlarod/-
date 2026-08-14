/* =========================================================================
 * js/market-data/mock-adapter.js — App.MarketDataAdapters.Mock
 * =========================================================================
 * 아직 실제 데이터 공급원이 연결되지 않은 종목(삼성전자/SK하이닉스/
 * NASDAQ)용 임시 어댑터입니다. 랜덤워크로 그럴듯한 가격 움직임을
 * 만들지만, isMock:true 플래그가 항상 붙어있어서 화면에서 반드시
 * "실제 시세 아님"을 표시해야 합니다(요구사항 — Mock 가격을 실제
 * 시장가격인 것처럼 보여주지 않음).
 *
 * 참고 시작가는 대략적인 시세 감각을 위한 것일 뿐 실제 시장가와 무관합니다.
 * ========================================================================= */

window.App = window.App || {};
App.MarketDataAdapters = App.MarketDataAdapters || {};

App.MarketDataAdapters.Mock = (function () {
  "use strict";

  const REFERENCE_PRICE = {
    "005930": 78000, // 삼성전자 — 대략적인 참고값(실제 시세 아님)
    "000660": 210000, // SK하이닉스
    NDX: 20500, // NASDAQ 100
  };
  const TICK_INTERVAL_MS = 2000;
  const VOLATILITY = 0.0015; // 틱당 ±0.15% 정도의 랜덤워크

  function create(symbol) {
    let price = REFERENCE_PRICE[symbol] || 100000;
    const dayOpen = price;
    let high24h = price;
    let low24h = price;
    const priceSubs = [];
    const candleSubs = [];

    function tick() {
      const change = (Math.random() - 0.5) * 2 * VOLATILITY;
      price = Math.max(1, price * (1 + change));
      high24h = Math.max(high24h, price);
      low24h = Math.min(low24h, price);
      priceSubs.forEach((fn) => fn(price));
    }
    setInterval(tick, TICK_INTERVAL_MS);

    return {
      isMock: true, // 반드시 UI에서 확인해서 "Mock 데이터" 표시할 것
      getPrice: () => price,
      getCandles: () => [], // Mock 캔들은 아직 미구현(실시간 틱만 제공)
      subscribePrice: (fn) => {
        priceSubs.push(fn);
        return () => {
          const i = priceSubs.indexOf(fn);
          if (i >= 0) priceSubs.splice(i, 1);
        };
      },
      subscribeCandles: (fn) => {
        candleSubs.push(fn);
        return () => {
          const i = candleSubs.indexOf(fn);
          if (i >= 0) candleSubs.splice(i, 1);
        };
      },
      getMarketStats: () => ({
        changePercent: ((price - dayOpen) / dayOpen) * 100,
        high24h,
        low24h,
        volume24h: null, // Mock 환경에서는 의미 없는 값이라 비워둠
      }),
    };
  }

  return { create };
})();
