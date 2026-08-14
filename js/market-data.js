/* =========================================================================
 * js/market-data.js — App.MarketData
 * =========================================================================
 * PHASE 2(어댑터 구조). 모든 종목이 동일한 인터페이스로 데이터를 받을 수
 * 있게 하는 파사드입니다. 지금은 어떤 기존 파일도 이걸 안 쓰고 있어서
 * (websocket.js/trading.js/chart.js 등 전부 무수정), 추가해도 기존 BTC
 * 동작에 영향이 없습니다.
 *
 * 공통 인터페이스(어댑터마다 동일하게 구현):
 *   getPrice()          → 마지막으로 알려진 현재가(숫자 또는 null)
 *   getCandles()         → 최근 캔들 배열
 *   subscribePrice(fn)   → 가격 틱마다 fn(price) 호출, 구독 해제 함수 반환
 *   subscribeCandles(fn) → 캔들 갱신마다 fn(candle) 호출, 구독 해제 함수 반환
 *   getMarketStats()     → { changePercent, high24h, low24h, volume24h }
 *   isMock               → true면 실제 시세가 아님(화면에 반드시 표시해야 함)
 *
 * 어댑터 2종:
 *   js/market-data/binance-adapter.js — 기존 websocket.js(App.Bus 이벤트)를
 *     그대로 감싸기만 함. websocket.js 코드는 한 줄도 안 건드림.
 *   js/market-data/mock-adapter.js — 삼성전자/SK하이닉스/NASDAQ처럼 아직
 *     실제 데이터 공급원이 연결 안 된 종목용. 랜덤워크로 그럴듯한 가격을
 *     만들지만, isMock:true라서 UI가 반드시 구분 표시할 수 있습니다.
 * ========================================================================= */

window.App = window.App || {};

App.MarketData = (function () {
  "use strict";

  const adapterCache = {}; // symbol → adapter 인스턴스(같은 종목은 재사용)

  function getAdapter(symbol) {
    if (adapterCache[symbol]) return adapterCache[symbol];

    const meta = App.SymbolRegistry ? App.SymbolRegistry.getBySymbol(symbol) : null;
    const dataSource = meta ? meta.dataSource : "mock";

    let adapter;
    if (dataSource === "binance" && App.MarketDataAdapters && App.MarketDataAdapters.Binance) {
      adapter = App.MarketDataAdapters.Binance.create(symbol);
    } else if (App.MarketDataAdapters && App.MarketDataAdapters.Mock) {
      adapter = App.MarketDataAdapters.Mock.create(symbol);
    } else {
      console.warn("[market-data.js] 사용 가능한 어댑터가 없습니다:", symbol);
      return null;
    }

    adapterCache[symbol] = adapter;
    return adapter;
  }

  return { getAdapter };
})();
