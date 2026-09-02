/* =========================================================================
 * js/config.js — App.Config
 * =========================================================================
 * 심볼/간격 목록과 Binance Futures 공식 엔드포인트를 만드는 규칙만 모아둡니다.
 * 다른 파일들은 URL을 직접 문자열로 만들지 않고 전부 이 파일의 함수를
 * 통해서만 만듭니다.
 *
 * ⚠️ 2026-04-23부로 Binance Futures가 레거시 WebSocket 주소를 폐지하고
 * /public, /market, /private로 나뉜 새 주소 체계로 이전했습니다. kline/
 * ticker/trade/markPrice 같은 일반 시세 스트림은 /market 경로로만 옵니다.
 *
 * ── 이번 단계에서 바뀐 가장 중요한 부분: 통화 모델 ──────────────────
 * 이전 버전은 WebSocket에서 받는 순간 바로 원화로 환산해서 내부 상태
 * 전체(차트 데이터, 거래 엔진, 잔고)가 원화 기준이었습니다. 이번에
 * "내부 계산은 항상 USDT, 화면 표시만 선택한 통화로 환산" 원칙으로
 * 바꿨습니다. 그래서:
 *   - js/websocket.js는 이제 원화 환산 없이 Binance가 준 USDT 값을 그대로 emit
 *   - js/trading.js의 잔고/증거금/손익/청산가는 전부 USDT 단위
 *   - 화면에 보여줄 때만(js/utils.js의 formatCurrency) 현재 선택된 통화로 환산
 * displayCurrency는 여기(config.js)에서 "현재 선택된 표시 통화" 하나만
 * 관리하고, 'currency:change' 이벤트로 알립니다. USD_KRW(환율 상수)도
 * 순수 표시 변환에만 쓰입니다 — 절대 거래 계산에 섞이지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Config = (function () {
  // 지금은 BTCUSDT 하나만 쓰지만, 배열 구조로 만들어 향후 확장에 대비합니다.
  const SYMBOLS = [{ symbol: "BTCUSDT", label: "BTC/USDT" }];

  let activeSymbol = SYMBOLS[0].symbol;
  function getActiveSymbol() {
    return activeSymbol;
  }

  // 실제 거래소처럼 초 단위 ~ 일봉까지 지원합니다.
  // native: Binance 선물(fapi/fstream)이 공식 kline 스트림/REST로 직접 제공하는 간격
  //         (1m, 5m, 15m, 1h, 4h, 1d)
  // 비-native(1s, 5s, 15s)는 실제 체결가를 직접 그 시간 단위로 묶어서 구성합니다(가짜 데이터 아님).
  //
  // ── 2026-08-28 정정: 1s 는 native 가 아닙니다 (실측) ──────────────────
  // 예전에는 1s 도 native: true 였습니다. 사실이 아니었습니다.
  //   REST  GET /fapi/v1/klines?symbol=BTCUSDT&interval=1s
  //         → 400 {"code":-1120,"msg":"Invalid interval."}
  //   WS    btcusdt@kline_1s → 15초 동안 kline 0건
  //         (같은 연결의 @ticker 는 같은 15초에 8건 정상 · 연결 오류·종료 없음)
  // 바이낸스는 없는 스트림 이름을 받아도 오류를 내지 않고 연결을 유지합니다.
  // 그래서 native: true 로 두면 1s 를 골랐을 때 kline 이 한 건도 안 오는데 아무
  // 표시가 없고, js/trade-stream-fix.js 는 "native 니까 websocket.js 가 하겠지"
  // 하고 빠져나가 합성 봉도 안 만듭니다 → price:update 0회 → 손익·강제청산·
  // TP/SL·지정가 체결이 조용히 멈춥니다(TL-004 와 같은 고장).
  // 1s 는 5s/15s 와 똑같이 체결을 묶어서 만드는 것이 맞습니다.
  //
  // ⚠ 이 값은 버튼을 되살리지 않습니다. 1s/5s/15s 버튼은 style.css 가 가리고
  //   js/interval-guard.js 가 1m 으로 되돌립니다(둘 다 그대로 둡니다).
  //   지금 눈에 보이는 동작은 바뀌지 않고, 나중에 그 자물쇠를 풀 때 1s 가
  //   조용히 멈추지 않도록 사실만 미리 맞춰 두는 것입니다.
  // ── 2026-09-02 추가 : 3분 · 30분 · 2시간 · 6시간 · 12시간 · 1주 · 1개월 ──
  //   9개 -> 16개. 일곱 개 전부 바이낸스 선물이 실제로 주는지 REST 로 직접
  //   확인했습니다(fapi/v1/klines, 2026-09-02, 7/7 응답 정상).
  //   ⚠ 화면에는 일곱 개가 버튼으로 나오지 않습니다. 360px 에서 버튼 줄이
  //     터지기 때문에 js/interval-more.js 가 "더보기" 안으로 넣습니다.
  //     (트레이딩뷰도 자주 쓰는 것만 밖에 두고 나머지는 메뉴 안입니다)
  //   ⚠ 3시간 · 45분 · 10분 · 2분 은 넣지 않았습니다 — 바이낸스에 없거나
  //     회원이 안 쓰는 단위입니다.
  const INTERVALS = [
    { value: "1s", label: "1초", seconds: 1, native: false },
    { value: "5s", label: "5초", seconds: 5, native: false },
    { value: "15s", label: "15초", seconds: 15, native: false },
    { value: "1m", label: "1분", seconds: 60, native: true },
    { value: "3m", label: "3분", seconds: 180, native: true },
    { value: "5m", label: "5분", seconds: 300, native: true },
    { value: "15m", label: "15분", seconds: 900, native: true },
    { value: "30m", label: "30분", seconds: 1800, native: true },
    { value: "1h", label: "1시간", seconds: 3600, native: true },
    { value: "2h", label: "2시간", seconds: 7200, native: true },
    { value: "4h", label: "4시간", seconds: 14400, native: true },
    { value: "6h", label: "6시간", seconds: 21600, native: true },
    // 8시간봉 · 3일봉 — 바이낸스에 있는데 우리에만 없던 것입니다 (2026-09-03 추가).
    // ★실제로 불러서 확인했습니다★ — fapi/v1/klines?interval=8h 는 봉 간격이
    // 28,800,000ms, interval=3d 는 259,200,000ms 로 정확히 왔습니다.
    // 둘 다 WS kline 스트림에도 있는 간격이라 native:true 입니다.
    { value: "8h", label: "8시간", seconds: 28800, native: true },
    { value: "12h", label: "12시간", seconds: 43200, native: true },
    { value: "1d", label: "1일", seconds: 86400, native: true },
    { value: "3d", label: "3일", seconds: 259200, native: true },
    { value: "1w", label: "1주", seconds: 604800, native: true },
    // "1M" 은 ★대문자 M★ 입니다 — 소문자 "1m" 은 1분입니다. 바이낸스 표기 그대로입니다.
    // seconds 는 30일로 잡았습니다(달마다 실제 길이가 다릅니다). 이 값은 native:false
    // 인 간격을 우리가 직접 묶을 때만 쓰이므로(js/websocket.js:149) 여기서는
    // 쓰이지 않습니다. 그래도 0 이나 빈 값을 두면 나중에 누가 나눗셈에 쓸 때
    // 조용히 터지므로 그럴듯한 값을 넣어 둡니다.
    { value: "1M", label: "1개월", seconds: 2592000, native: true },
  ];
  let activeInterval = "1m";

  const KLINE_LIMIT = 500;

  const REST_BASE = "https://fapi.binance.com";
  const WS_STREAM_BASE = "wss://fstream.binance.com/market";

  const RECONNECT_MIN_MS = 1000;
  const RECONNECT_MAX_MS = 15000;

  // 화면 표시 전용 고정 환율 (거래 엔진 계산에는 절대 쓰이지 않음)
  const USD_KRW = 1500;

  // ---------------- 표시 통화 (USDT ↔ KRW) ----------------
  const CURRENCY_STORAGE_KEY = "settings";
  let displayCurrency = "USDT"; // 기본값 USDT

  function restoreDisplayCurrency() {
    if (!App.Storage) return;
    try {
      const saved = App.Storage.load(CURRENCY_STORAGE_KEY);
      if (saved && (saved.displayCurrency === "USDT" || saved.displayCurrency === "KRW")) {
        displayCurrency = saved.displayCurrency;
      }
    } catch (e) {
      /* 손상된 설정은 무시하고 기본값(USDT) 유지 */
    }
  }

  function getDisplayCurrency() {
    return displayCurrency;
  }
  function setDisplayCurrency(cur) {
    if (cur !== "USDT" && cur !== "KRW") return;
    if (cur === displayCurrency) return;
    displayCurrency = cur;
    if (App.Storage) App.Storage.save(CURRENCY_STORAGE_KEY, { displayCurrency: cur });
    App.Bus.emit("currency:change", { currency: cur });
  }

  function getIntervals() {
    return INTERVALS.slice();
  }
  function getActiveInterval() {
    return activeInterval;
  }
  function setActiveInterval(interval) {
    if (interval === activeInterval) return;
    activeInterval = interval;
    App.Bus.emit("interval:change", { interval });
  }
  function findInterval(value) {
    return INTERVALS.find((iv) => iv.value === value) || null;
  }
  function isNativeInterval(value) {
    const iv = findInterval(value);
    return iv ? iv.native : true;
  }
  function intervalToSeconds(value) {
    const iv = findInterval(value);
    return iv ? iv.seconds : 60;
  }

  function buildKlinesRestUrl(symbol, interval, limit, endTime) {
    let url =
      REST_BASE + "/fapi/v1/klines?symbol=" + symbol + "&interval=" + interval + "&limit=" + limit;
    if (endTime) url += "&endTime=" + Math.floor(endTime);
    return url;
  }

  // 실시간 펀딩비는 markPrice WS 스트림으로 받지만(buildCombinedStreamUrl에 포함),
  // 새로고침/재접속 사이에 놓친 펀딩 정산이 있는지 시작할 때 딱 한 번 확인하기
  // 위한 REST(폴링 아님). 공식 엔드포인트: GET /fapi/v1/fundingRate
  function buildFundingRateRestUrl(symbol, limit) {
    return REST_BASE + "/fapi/v1/fundingRate?symbol=" + symbol + "&limit=" + (limit || 1);
  }

  // Binance Futures 공식 WS(/market 경로): ticker(24H) + trade(체결) + markPrice(마크가격·
  // 실시간 펀딩비 추정치)를 항상 함께 구독하고, kline은 native 간격일 때만 추가합니다.
  // markPrice는 공식 공지에서 "Regular market feeds(markPrice/kline/ticker) → /market"이라고
  // 명시된 스트림이라, 기존 연결에 그대로 추가했습니다 — 별도 WebSocket을 새로 만들지 않았습니다.
  function buildCombinedStreamUrl(symbol) {
    const s = symbol.toLowerCase();
    const streams = [s + "@ticker", s + "@trade", s + "@markPrice@1s"];
    if (isNativeInterval(activeInterval)) {
      streams.splice(0, 0, s + "@kline_" + activeInterval);
    }
    return WS_STREAM_BASE + "/stream?streams=" + streams.join("/");
  }

  restoreDisplayCurrency();

  return {
    getActiveSymbol,
    getIntervals,
    getActiveInterval,
    setActiveInterval,
    isNativeInterval,
    intervalToSeconds,
    getDisplayCurrency,
    setDisplayCurrency,
    KLINE_LIMIT,
    RECONNECT_MIN_MS,
    RECONNECT_MAX_MS,
    USD_KRW,
    buildKlinesRestUrl,
    buildCombinedStreamUrl,
    buildFundingRateRestUrl,
  };
})();
