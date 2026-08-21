/* =========================================================================
 * js/trade-stream-fix.js — App.TradeStreamFix
 * =========================================================================
 * TL-004 / TL-005 근본 수정.
 *
 * 무엇이 고장나 있었나:
 *   js/config.js 의 buildCombinedStreamUrl() 이 만드는 주소는
 *   wss://fstream.binance.com/market/stream?streams=...btcusdt@trade...
 *   인데, 바이낸스 선물 2026-04-23 주소 개편 이후 체결 스트림(@trade)은
 *   /public 경로에만 있습니다. 바이낸스는 없는 스트림 이름을 받아도 오류를
 *   내지 않고 연결을 유지하기 때문에, 같은 연결의 kline/ticker/markPrice 는
 *   정상으로 오는데 @trade 만 한 건도 오지 않습니다(실측: 15초 0건).
 *   그 결과 js/websocket.js 의 'trade:tick' 방송이 영원히 실행되지 않아
 *     - 최근 체결 목록이 영구히 비어 있고
 *     - 매수/매도 압력 바가 항상 50:50 (데이터 없음의 대체값)
 *     - 전쟁터 매수/매도 강도가 전부 0
 *     - 비-native 간격(5s/15s)에서 캔들·현재가가 통째로 멈춤
 *   이 됩니다.
 *
 * 어떻게 고치나:
 *   js/websocket.js 와 js/config.js 는 한 글자도 건드리지 않고, 체결 스트림만
 *   따로 연결해서 'trade:tick' 을 대신 방송합니다. 이것은 새 패턴이 아니라
 *   js/orderbook.js(70행)가 이미 쓰고 있는 것과 똑같은 방식입니다 —
 *   호가(depth)도 /public 경로라 별도 연결을 하나 갖고 있습니다.
 *
 * 왜 @trade 가 아니라 @aggTrade 인가:
 *   /public/ws/…@trade  = 초당 약 92건 (체결 1건씩 전부)
 *   /market/ws/…@aggTrade = 초당 약 29건 (같은 가격·같은 주문 체결을 묶음)
 *   바이낸스 화면의 "최근 체결"이 보여주는 것이 @aggTrade 이고, 필드도
 *   (p q m T s) 로 동일합니다. js/market-war.js 는 체결 1건마다 최근 80개
 *   배열을 정렬하므로 초당 92회 정렬은 저사양 폰에 부담입니다.
 *   체결 1건 단위가 꼭 필요해지면 URL 을 /public/ws/<sym>@trade 로,
 *   아래 EVENT_NAME 을 "trade" 로 바꾸면 됩니다(둘 다 실측 동작 확인).
 *
 * 되돌리기: index.html 의 <script> 한 줄과 main.js 의 "TradeStreamFix" 한
 * 단어를 지우고 이 파일을 삭제하면 원래 상태로 완전히 돌아갑니다.
 * ========================================================================= */

window.App = window.App || {};

App.TradeStreamFix = (function () {
  "use strict";

  var STREAM_SUFFIX = "@aggTrade";
  var EVENT_NAME = "aggTrade";

  var sock = null;
  var delay = 0;
  var synthetic = null; // 비-native 간격(5s/15s)용 — websocket.js 148~163행과 같은 규칙

  function buildUrl() {
    // 체결은 /market 경로의 개별 스트림(ws)으로는 aggTrade 가 정상 수신됩니다.
    return (
      "wss://fstream.binance.com/market/ws/" +
      App.Config.getActiveSymbol().toLowerCase() +
      STREAM_SUFFIX
    );
  }

  function onTrade(d) {
    var price = parseFloat(d.p);
    if (isNaN(price)) return;
    var qty = parseFloat(d.q) || 0;

    App.Bus.emit("trade:tick", {
      symbol: d.s,
      price: price,
      qty: qty,
      isBuyerMaker: !!d.m, // true면 매도 체결(테이커가 매도), false면 매수 체결
      time: d.T || Date.now(),
    });

    // 비-native 간격(5s/15s)일 때만 캔들·현재가를 대신 만들어 줍니다.
    // native 간격에서는 js/websocket.js 의 kline 스트림이 이미 같은 일을 하므로
    // 여기서 내보내면 이중 방송이 되어 차트가 어긋납니다 — 절대 내보내지 않습니다.
    var interval = App.Config.getActiveInterval();
    if (App.Config.isNativeInterval(interval)) return;

    var bucketSec = App.Config.intervalToSeconds(interval);
    var tSec = d.T ? Math.floor(d.T / 1000) : Math.floor(Date.now() / 1000);
    var bucket = Math.floor(tSec / bucketSec) * bucketSec;
    if (!synthetic || synthetic.time !== bucket) {
      synthetic = {
        time: bucket,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: qty,
      };
    } else {
      synthetic.high = Math.max(synthetic.high, price);
      synthetic.low = Math.min(synthetic.low, price);
      synthetic.close = price;
      synthetic.volume += qty;
    }
    // 캔들을 먼저 갱신한 다음 현재가를 내보내는 순서는 websocket.js 와 같습니다.
    App.Bus.emit("kline:update", { symbol: d.s, candle: synthetic });
    App.Bus.emit("price:update", { symbol: d.s, price: price, time: Date.now() });
  }

  function connect() {
    var s;
    try {
      s = new WebSocket(buildUrl());
    } catch (e) {
      scheduleReconnect();
      return;
    }
    sock = s;

    s.onopen = function () {
      delay = App.Config.RECONNECT_MIN_MS;
    };
    s.onmessage = function (evt) {
      var d;
      try {
        d = JSON.parse(evt.data);
      } catch (e) {
        return;
      }
      if (!d || d.e !== EVENT_NAME) return;
      onTrade(d);
    };
    s.onerror = function () {
      try {
        s.close();
      } catch (e) {
        /* noop — onclose 가 재연결을 처리 */
      }
    };
    s.onclose = function () {
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    var C = App.Config;
    setTimeout(connect, delay || C.RECONNECT_MIN_MS);
    delay = Math.min((delay || C.RECONNECT_MIN_MS) * 1.6, C.RECONNECT_MAX_MS);
  }

  function init() {
    connect();
    // 간격이 바뀌면 만들던 합성 봉을 버립니다(websocket.js 의 interval:change 와 같은 처리).
    App.Bus.on("interval:change", function () {
      synthetic = null;
    });
  }

  return { init: init };
})();
