/* =========================================================================
 * js/symbol-registry.js — App.SymbolRegistry
 * =========================================================================
 * 종목 목록 + 종목별 규격표(spec)의 **단일 출처**입니다.
 * 종목 규격(최소수량·가격단위·최소주문금액·수량 자릿수·단위 이름·최대배수)이
 * 필요하면 코드에 숫자를 박지 말고 반드시 여기서 읽어 쓰세요.
 *
 *   App.SymbolRegistry.getSpec("BTCUSDT").minQty   ← 이렇게
 *   const MIN = 0.001;                             ← 이렇게 하지 마세요
 *
 * ── 종목 4개 (대표 결정 2026-08-27) ─────────────────────────────────────
 *   비트코인 · 나스닥 · 삼성전자 · SK하이닉스
 *   이더리움은 대표 결정으로 제외했습니다.
 *
 *   ⚠ 나스닥은 "나스닥" 으로만 씁니다. "나스닥100" / "NASDAQ 100" /
 *     "나스닥 지수" 라고 쓰지 마세요. 바이낸스에 있는 QQQUSDT 는 지수가
 *     아니라 그 지수를 따라가는 ETF(QQQ) 라서, 진짜 나스닥100 지수(29,209)와
 *     숫자가 41배 차이납니다(QQQ 717). "지수" 라는 말을 안 붙이는 것이
 *     이 결정의 핵심입니다.
 *
 * ── ⭐ 숫자 규격은 네 종목이 전부 같습니다 (대표 지시 2026-08-27) ───────
 *   대표: "매수하는 단위도 비트코인이랑 똑같은 시스템으로 해"
 *
 *       최소수량      0.001
 *       가격단위      0.10
 *       최소주문금액  50 USDT
 *       수량 표시     6자리
 *       최대배수      150
 *
 *   바이낸스 실제 규격은 종목마다 다르지만(주식은 0.01 / 0.01 / 5 USDT),
 *   우리는 모의거래라 우리 규칙으로 통일합니다. 실제 바이낸스 값은 아래
 *   binance 칸에 실측 그대로 남겨뒀습니다(참고용, 화면에는 안 씁니다).
 *
 *   ⚠ "지금은 네 종목 값이 전부 같지만, 종목별로 다르게 둘 수 있는 구조"
 *     입니다. 나중에 종목마다 다르게 하고 싶어지면 아래 spec 의 값만
 *     바꾸면 됩니다. 칸을 없애지 마세요.
 *
 *   ⚠ unit(단위 이름)만은 종목마다 다릅니다. 삼성전자 수량이 "1.020000 BTC"
 *     로 나오면 틀린 정보이기 때문입니다. 숫자 규칙은 통일, 이름만 종목 것.
 *
 * ── spec 값의 출처 ──────────────────────────────────────────────────────
 *   minQty / qtyStep / tickSize / minNotional / qtyDecimals / maxLeverage
 *       ← 대표 결정(전 종목 통일). 바이낸스 값이 아닙니다.
 *   unit / priceDecimals
 *       ← 우리 화면 표시 관례. BTC 의 qtyDecimals 6 은 js/utils.js 의
 *         formatQty 와 같은 값입니다.
 *   binance.*
 *       ← 2026-08-27 실측. 바꾸지 마세요(실제 거래소 값의 기록입니다).
 *         exchangeInfo : https://fapi.binance.com/fapi/v1/exchangeInfo
 *         brackets     : https://www.binance.com/bapi/futures/v1/
 *                        friendly/future/common/brackets
 *
 * ── ⛔ maxLeverage 150 은 아직 엔진이 못 받습니다 ───────────────────────
 *   js/trading.js:96 에 MAX_LEVERAGE = 125 가 박혀 있고 그 파일은 수정
 *   금지입니다. setLeverage(150) 을 불러도 엔진은 조용히 125 로 깎습니다
 *   (실측 확인함). 그래서 화면 상한은 아직 올리지 않았습니다.
 *   여기 150 은 "대표가 정한 목표값" 이고, 화면에 쓰려면 먼저 대표 결재로
 *   trading.js 의 125 를 푸는 절차가 필요합니다.
 *
 * ── dataSource ──────────────────────────────────────────────────────────
 *   네 종목 모두 바이낸스 선물에 실재하므로 전부 "binance" 입니다.
 *   가짜 시세는 만들지 않습니다(mock-adapter 를 안 태웁니다).
 *
 * ── enabled — 종목 전환을 여는 스위치 ───────────────────────────────────
 *   false = 목록에는 보이지만 눌러도 "준비 중입니다" 만 나옵니다.
 *   ⭐ 2026-08-27 — 네 종목 전부 true 입니다. 4번 관문
 *      (js/symbol-stream-switch.js)이 종목을 바꿀 때 세 소켓을 새 주소로
 *      다시 붙여 주기 때문입니다. 그 파일의 <script> 를 지우면 전환이
 *      사라지므로, 지울 때는 여기 세 종목도 false 로 같이 돌려놓으세요.
 *      (안 돌려놓으면 눌러도 아무 일이 안 일어나는 조용한 고장이 됩니다.)
 *
 * ── isMock() 의 뜻이 바뀌지 않게 지켰습니다 ─────────────────────────────
 *   isMock() 은 "아직 실전으로 못 쓰는 종목" 판정에 쓰이고 있고,
 *   js/symbol-guard.js(1번 관문 그물)가 이 값으로 전환을 막습니다.
 *   dataSource 를 mock→binance 로 바꾸면서도 그 판정이 그대로 유지되도록
 *   isMock() 을 isEnabled() 의 반대로 정의했습니다.
 *   그래서 symbol-guard.js 는 한 글자도 안 고치고 그대로 동작합니다.
 * ========================================================================= */

window.App = window.App || {};

App.SymbolRegistry = (function () {
  "use strict";

  /* ⭐ 전 종목 공통 숫자 규격 — 여기 한 곳만 바꾸면 네 종목이 같이 따라옵니다.
     종목별로 다르게 하고 싶어지면, 아래 SYMBOLS 의 spec 에서 해당 칸만
     덮어쓰면 됩니다(구조는 이미 종목별입니다). */
  var COMMON = {
    minQty: 0.001, // 최소 주문 수량
    qtyStep: 0.001, // 수량을 올리고 내리는 단위
    tickSize: 0.1, // 가격단위(호가 한 칸)
    minNotional: 50, // 최소 주문 금액(USDT)
    qtyDecimals: 6, // 수량 표시 자릿수 — js/utils.js formatQty 와 같은 값
    priceDecimals: 2, // 가격 표시 자릿수
    maxLeverage: 150, // 대표 결정 목표값 ⚠ 엔진(trading.js)은 아직 125 까지만
  };

  function spec(unit, extra) {
    var o = {};
    for (var k in COMMON) if (Object.prototype.hasOwnProperty.call(COMMON, k)) o[k] = COMMON[k];
    o.unit = unit; // 단위 이름만 종목마다 다릅니다
    o.binance = extra; // 바이낸스 실측값(참고용 — 화면에 쓰지 않습니다)
    return o;
  }

  var SYMBOLS = [
    {
      symbol: "BTCUSDT",
      name: "비트코인",
      type: "crypto",
      dataSource: "binance",
      enabled: true, // 지금 실제로 거래되는 유일한 종목
      spec: spec("BTC", {
        contractType: "PERPETUAL",
        underlyingType: "COIN",
        minQty: 0.001,
        tickSize: 0.1,
        minNotional: 50,
        maxLeverage: 150,
        mmr: 0.004,
      }),
    },
    {
      symbol: "QQQUSDT",
      name: "나스닥", // ⚠ "나스닥100" / "지수" 금지 — 파일 맨 위 설명 참고
      type: "index",
      dataSource: "binance",
      enabled: true, // 2026-08-27 4번 관문(js/symbol-stream-switch.js)이 시세를 붙여 개방
      spec: spec("주", {
        contractType: "TRADIFI_PERPETUAL",
        underlyingType: "EQUITY",
        minQty: 0.01,
        tickSize: 0.01,
        minNotional: 5,
        maxLeverage: 25,
        mmr: 0.02,
      }),
    },
    {
      symbol: "SAMSUNGUSDT",
      name: "삼성전자",
      type: "stock",
      dataSource: "binance",
      enabled: true, // 2026-08-27 4번 관문(js/symbol-stream-switch.js)이 시세를 붙여 개방
      spec: spec("주", {
        contractType: "TRADIFI_PERPETUAL",
        underlyingType: "KR_EQUITY",
        minQty: 0.01,
        tickSize: 0.01,
        minNotional: 5,
        maxLeverage: 25,
        mmr: 0.02,
      }),
    },
    {
      symbol: "SKHYNIXUSDT",
      name: "SK하이닉스",
      type: "stock",
      dataSource: "binance",
      enabled: true, // 2026-08-27 4번 관문(js/symbol-stream-switch.js)이 시세를 붙여 개방
      spec: spec("주", {
        contractType: "TRADIFI_PERPETUAL",
        underlyingType: "KR_EQUITY",
        minQty: 0.01,
        tickSize: 0.01,
        minNotional: 5,
        maxLeverage: 50,
        mmr: 0.01,
      }),
    },
  ];

  /* 밖에서 실수로 값을 바꾸지 못하게 얼려둡니다. */
  if (typeof Object.freeze === "function") {
    SYMBOLS.forEach(function (s) {
      Object.freeze(s.spec.binance);
      Object.freeze(s.spec);
      Object.freeze(s);
    });
    Object.freeze(SYMBOLS);
    Object.freeze(COMMON);
  }

  function getAll() {
    return SYMBOLS.slice();
  }

  function getBySymbol(symbol) {
    for (var i = 0; i < SYMBOLS.length; i++) {
      if (SYMBOLS[i].symbol === symbol) return SYMBOLS[i];
    }
    return null;
  }

  /* 규격표를 읽는 표준 통로. 모르는 종목이면 null 을 줍니다 —
     "모르면 기본값" 으로 지어내지 않습니다. */
  function getSpec(symbol) {
    var s = getBySymbol(symbol);
    return s ? s.spec : null;
  }

  /* 종목 전환이 허용됐는지. 화면(드롭다운·주문창)은 이 값만 봅니다. */
  function isEnabled(symbol) {
    var s = getBySymbol(symbol);
    return !!(s && s.enabled === true && s.dataSource === "binance");
  }

  /* "아직 실전으로 못 쓰는 종목" — js/symbol-guard.js 가 이 값으로 막습니다. */
  function isMock(symbol) {
    return !isEnabled(symbol);
  }

  /* 종목별 최대 레버리지(대표 결정 목표값).
     ⚠ 화면 상한으로 바로 쓰지 마세요 — js/trading.js 가 125 로 깎습니다. */
  function maxLeverage(symbol) {
    var sp = getSpec(symbol);
    return sp && isFinite(sp.maxLeverage) ? sp.maxLeverage : null;
  }

  /* 전 종목 공통 규격을 통째로 보고 싶을 때(읽기 전용 복사본). */
  function common() {
    var o = {};
    for (var k in COMMON) if (Object.prototype.hasOwnProperty.call(COMMON, k)) o[k] = COMMON[k];
    return o;
  }

  return {
    getAll: getAll,
    getBySymbol: getBySymbol,
    getSpec: getSpec,
    isEnabled: isEnabled,
    isMock: isMock,
    maxLeverage: maxLeverage,
    common: common,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolRegistry;
