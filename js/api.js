/* =========================================================================
 * js/api.js — App.Api
 * =========================================================================
 * Binance Futures 공식 REST API 호출만 담당합니다. (WebSocket은 websocket.js)
 * ========================================================================= */

window.App = window.App || {};

App.Api = (function () {
  // 과거 캔들(klines) 조회 — 차트를 처음 열었을 때 화면을 채우거나(endTime 없음),
  // 왼쪽으로 스크롤할 때 그 이전 페이지를 이어서 불러오는 용도(endTime 지정)
  function fetchKlines(symbol, interval, limit, endTime) {
    const url = App.Config.buildKlinesRestUrl(symbol, interval, limit, endTime);
    return fetch(url)
      .then((res) => {
        if (!res.ok) {
          return res.text().then((body) => {
            throw new Error("HTTP " + res.status + " " + res.statusText + " - " + body.slice(0, 200));
          });
        }
        return res.json();
      })
      .then((rows) => {
        // Binance kline row: [openTime, open, high, low, close, volume, closeTime, ...]
        return rows.map((r) => ({
          time: Math.floor(r[0] / 1000),
          open: parseFloat(r[1]),
          high: parseFloat(r[2]),
          low: parseFloat(r[3]),
          close: parseFloat(r[4]),
          volume: parseFloat(r[5]),
        }));
      });
  }

  // 실제 정산된 마지막 펀딩 이벤트 1건 조회 — 새로고침/재접속 사이에 놓친 펀딩
  // 정산이 있는지 시작할 때 딱 한 번만 확인하는 용도입니다(연속 폴링 아님).
  // 실시간 펀딩비율은 여전히 js/websocket.js의 markPrice 스트림으로만 받습니다.
  function fetchLatestFundingRate(symbol) {
    const url = App.Config.buildFundingRateRestUrl(symbol);
    return fetch(url)
      .then((res) => {
        if (!res.ok) {
          return res.text().then((body) => {
            throw new Error("HTTP " + res.status + " " + res.statusText + " - " + body.slice(0, 200));
          });
        }
        return res.json();
      })
      .then((rows) => {
        // Binance fundingRate row: { symbol, fundingTime, fundingRate, markPrice }
        return (rows || []).map((r) => ({
          fundingTime: r.fundingTime,
          fundingRate: parseFloat(r.fundingRate),
          markPrice: parseFloat(r.markPrice),
        }));
      });
  }

  // 요구사항 1: 실시간 가격은 절대 REST Polling으로 가져오지 않습니다.
  // REST는 여기 fetchKlines()로 "최초/과거 캔들 로딩"에만 사용되고,
  // 실시간 갱신은 전부 js/websocket.js가 담당합니다. fetchLatestFundingRate도
  // 시작 시 1회성 확인용이지 반복 폴링이 아닙니다.
  return { fetchKlines, fetchLatestFundingRate };
})();
