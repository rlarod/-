/* =========================================================================
 * js/market-data/binance-adapter.js — App.MarketDataAdapters.Binance
 * =========================================================================
 * 기존 js/websocket.js가 이미 App.Bus로 방송하는 이벤트('price:update',
 * 'kline:update', 'ticker:update')를 그대로 받아서 공통 어댑터 인터페이스
 * 모양으로만 감쌉니다. websocket.js 내부 로직은 전혀 안 건드립니다 —
 * 지금 이 파일이 존재하는 것 자체도 websocket.js 동작에 영향이 없습니다
 * (websocket.js는 이 어댑터의 존재를 모릅니다).
 * ========================================================================= */

window.App = window.App || {};
App.MarketDataAdapters = App.MarketDataAdapters || {};

App.MarketDataAdapters.Binance = (function () {
  "use strict";

  function create(symbol) {
    let lastPrice = null;
    let lastCandles = [];
    let lastStats = { changePercent: null, high24h: null, low24h: null, volume24h: null };
    const priceSubs = [];
    const candleSubs = [];

    App.Bus.on("price:update", (p) => {
      if (p.symbol !== symbol) return;
      lastPrice = p.price;
      priceSubs.forEach((fn) => fn(p.price));
    });
    App.Bus.on("kline:update", (p) => {
      if (p.symbol !== symbol) return;
      candleSubs.forEach((fn) => fn(p.candle));
    });
    App.Bus.on("ticker:update", (p) => {
      if (p.symbol !== symbol) return;
      lastStats = {
        changePercent: p.priceChangePercent,
        high24h: p.highPrice,
        low24h: p.lowPrice,
        volume24h: p.volume,
      };
    });

    return {
      isMock: false,
      getPrice: () => lastPrice,
      getCandles: () => lastCandles.slice(),
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
      getMarketStats: () => lastStats,
    };
  }

  return { create };
})();
