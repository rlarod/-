/* =========================================================================
 * js/websocket.js — App.WS
 * =========================================================================
 * Binance Futures 공식 WebSocket에 연결하는 유일한 지점입니다. 실시간
 * 가격은 오직 이 WebSocket에서만 옵니다 — REST Polling으로 실시간 가격을
 * 대체하지 않습니다(REST는 js/chart.js가 "최초 캔들 로딩" 용도로만
 * 별도로 사용합니다).
 *
 * ⚠️ 2026-04-23부로 Binance Futures가 레거시 WebSocket 주소를 폐지하고
 * /public·/market·/private로 나뉜 새 주소 체계로 이전했습니다. kline/
 * ticker/trade/markPrice 같은 일반 시세 스트림은 /market 경로로만
 * 데이터가 오므로, 접속 주소는 js/config.js의 buildCombinedStreamUrl()이
 * wss://fstream.binance.com/market/... 로 만들어 줍니다.
 *
 * ── 통화 모델(이번 단계에서 바뀐 핵심) ─────────────────────────────
 * 이전 버전은 여기서 받는 즉시 원화로 환산해서 내보냈습니다. 이번부터는
 * Binance가 준 값(USDT)을 그대로 내보냅니다 — 원화 환산은 화면에 표시할
 * 때(js/utils.js의 formatCurrency)만 일어납니다. 그래서 이 파일이
 * "실제 거래 기준 가격은 항상 BTCUSDT(USDT)로 통일"하는 유일한 원천입니다.
 *
 * ---- 단일 currentPrice 원칙 ----
 * 이 모듈 안에 currentPrice 변수 하나만 두고, kline/trade에서 새 가격을 받을
 * 때마다 이 변수만(USDT 단위로) 갱신합니다. 다른 모든 모듈(차트, 손익, 청산,
 * 포지션 등)은 이 값에서 나온 'price:update' 이벤트 또는
 * App.WS.getCurrentPrice()를 통해서만 가격을 읽습니다.
 *
 * ---- 캔들(간격)별 데이터 출처 ----
 *   - native 간격(1s, 1m, 5m, 15m, 1h, 4h, 1d): Binance kline_<interval> 스트림의
 *     OHLC 값을 그대로 사용합니다(USDT).
 *   - 비-native 간격(5s, 15s): Binance에 없는 간격이라 실제 체결(trade) 데이터를
 *     해당 초 단위로 직접 묶어서 구성합니다 — 100% 실제 체결가(USDT)입니다.
 *
 * 내보내는 이벤트 (전부 USDT 단위):
 *   'kline:update'  → { symbol, candle }             : 차트 캔들 갱신용
 *   'ticker:update' → { symbol, lastPrice, ... }      : 상단 24H 통계용
 *   'price:update'  → { symbol, price, time }         : 단일 현재가 이벤트
 *   'trade:tick'    → { symbol, price, qty, isBuyerMaker, time } : 최근 체결 내역용
 *   'funding:update'→ { symbol, markPrice, fundingRate, nextFundingTime } : 펀딩비/마크가격
 *   'ws:status'     → { state, code?, reason? }       : 연결 상태
 *
 * 연결이 끊기면 지수 백오프(1초→최대 15초)로 자동 재연결합니다. 또한
 * "핸드셰이크는 성공했지만 실제 데이터가 안 오는 좀비 연결"을 감지해서
 * 강제로 재연결합니다.
 * ========================================================================= */

window.App = window.App || {};

App.WS = (function () {
  "use strict";

  const STALE_MS = 6000;
  const ZOMBIE_KILL_MS = 12000;

  let ws = null;
  let reconnectDelay = 0;
  let lastMessageAt = 0;
  let lastKlineAt = 0;

  // ---- 단일 현재가 (USDT) ----
  let currentPrice = null;

  let lastEmittedStatus = null;
  function emitWsOpenIfChanged() {
    if (lastEmittedStatus !== "open") {
      lastEmittedStatus = "open";
      App.Bus.emit("ws:status", { state: "open" });
    }
  }

  let liveCandle = null; // native 간격용: kline이 알려준 진행 중인 봉 (USDT)
  let syntheticCandle = null; // 비-native 간격(5s/15s)용

  function setCurrentPrice(price, symbol) {
    currentPrice = price;
    App.Bus.emit("price:update", { symbol, price, time: Date.now() });
  }

  function handleMessage(raw) {
    lastMessageAt = Date.now();

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      return;
    }
    const data = msg.data;
    if (!data) return;

    if (data.e === "kline") {
      lastKlineAt = Date.now();
      const k = data.k;
      const candle = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v), // BTC 수량
        isFinal: !!k.x,
      };
      liveCandle = Object.assign({}, candle);
      App.Bus.emit("kline:update", { symbol: data.s, candle });
      setCurrentPrice(candle.close, data.s);
      emitWsOpenIfChanged();
    } else if (data.e === "24hrTicker") {
      App.Bus.emit("ticker:update", {
        symbol: data.s,
        lastPrice: parseFloat(data.c),
        priceChangePercent: parseFloat(data.P),
        highPrice: parseFloat(data.h),
        lowPrice: parseFloat(data.l),
        volume: parseFloat(data.v), // 기초자산(BTC) 거래량
        quoteVolume: parseFloat(data.q), // 거래대금(USDT)
      });
      emitWsOpenIfChanged();
    } else if (data.e === "markPriceUpdate") {
      // 펀딩비/마크가격 — REST 폴링 없이 기존 /market 연결에 스트림만 추가해서 재사용
      App.Bus.emit("funding:update", {
        symbol: data.s,
        markPrice: parseFloat(data.p),
        fundingRate: parseFloat(data.r), // 다음 정산 예상 펀딩비율
        nextFundingTime: data.T, // ms epoch
      });
    } else if (data.e === "trade") {
      const price = parseFloat(data.p);
      if (isNaN(price)) return;
      const qty = parseFloat(data.q) || 0;

      // 최근 체결 내역용 — websocket.js가 이미 파싱한 trade를 그대로 재사용(새 연결 없음)
      App.Bus.emit("trade:tick", {
        symbol: data.s,
        price,
        qty,
        isBuyerMaker: !!data.m, // true면 매도 체결(테이커가 매도), false면 매수 체결
        time: data.T || Date.now(),
      });

      const interval = App.Config.getActiveInterval();
      if (App.Config.isNativeInterval(interval)) {
        if (liveCandle) {
          liveCandle.high = Math.max(liveCandle.high, price);
          liveCandle.low = Math.min(liveCandle.low, price);
          liveCandle.close = price;
          App.Bus.emit("kline:update", { symbol: data.s, candle: liveCandle });
          lastKlineAt = Date.now();
        }
      } else {
        const bucketSec = App.Config.intervalToSeconds(interval);
        const tradeTimeSec = data.T ? Math.floor(data.T / 1000) : Math.floor(Date.now() / 1000);
        const bucketTime = Math.floor(tradeTimeSec / bucketSec) * bucketSec;

        if (!syntheticCandle || syntheticCandle.time !== bucketTime) {
          syntheticCandle = { time: bucketTime, open: price, high: price, low: price, close: price, volume: qty };
        } else {
          syntheticCandle.high = Math.max(syntheticCandle.high, price);
          syntheticCandle.low = Math.min(syntheticCandle.low, price);
          syntheticCandle.close = price;
          syntheticCandle.volume += qty;
        }
        App.Bus.emit("kline:update", { symbol: data.s, candle: syntheticCandle });
        lastKlineAt = Date.now();
      }

      // "WebSocket → 캔들 업데이트 → 현재가 → 손익 → UI" 순서를 지키기 위해
      // 캔들을 먼저 갱신한 다음 마지막에 단일 currentPrice를 내보냅니다.
      setCurrentPrice(price, data.s);
      emitWsOpenIfChanged();
    }
  }

  function connect() {
    const symbol = App.Config.getActiveSymbol();
    const url = App.Config.buildCombinedStreamUrl(symbol);
    lastEmittedStatus = "connecting";
    App.Bus.emit("ws:status", { state: "connecting" });

    let socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      lastEmittedStatus = "closed";
      App.Bus.emit("ws:status", { state: "closed", code: null, reason: e.message });
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = () => {
      reconnectDelay = App.Config.RECONNECT_MIN_MS;
      lastEmittedStatus = "connecting";
      App.Bus.emit("ws:status", { state: "connecting" });
    };
    socket.onmessage = (evt) => handleMessage(evt.data);
    socket.onerror = () => {
      try {
        socket.close();
      } catch (e) {
        /* noop */
      }
    };
    socket.onclose = (evt) => {
      lastEmittedStatus = "closed";
      App.Bus.emit("ws:status", { state: "closed", code: evt.code, reason: evt.reason });
      scheduleReconnect();
    };
  }

  function scheduleReconnect() {
    const C = App.Config;
    setTimeout(connect, reconnectDelay || C.RECONNECT_MIN_MS);
    reconnectDelay = Math.min((reconnectDelay || C.RECONNECT_MIN_MS) * 1.6, C.RECONNECT_MAX_MS);
  }

  function startZombieWatchdog() {
    setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const idle = Date.now() - lastMessageAt;
      if (idle > ZOMBIE_KILL_MS) {
        lastEmittedStatus = "closed";
        App.Bus.emit("ws:status", {
          state: "closed",
          code: null,
          reason: idle + "ms 동안 데이터 없음 — 좀비 연결로 판단하여 강제 재연결",
        });
        try {
          ws.close();
        } catch (e) {
          /* noop, onclose가 처리 */
        }
      } else if (idle > STALE_MS) {
        if (lastEmittedStatus !== "stale") {
          lastEmittedStatus = "stale";
          App.Bus.emit("ws:status", { state: "stale" });
        }
      }
    }, 2000);
  }

  function init() {
    connect();
    startZombieWatchdog();

    App.Bus.on("interval:change", () => {
      lastMessageAt = 0;
      lastKlineAt = 0;
      liveCandle = null;
      syntheticCandle = null;
      reconnectDelay = App.Config.RECONNECT_MIN_MS;
      if (ws) {
        try {
          ws.close();
        } catch (e) {
          /* noop, onclose가 이어서 재연결을 처리함 */
        }
      } else {
        connect();
      }
    });
  }

  return {
    init,
    getCurrentPrice: () => currentPrice, // 단일 currentPrice(USDT) 읽기 전용 접근자
  };
})();
