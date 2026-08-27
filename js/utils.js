/* =========================================================================
 * js/utils.js — App.Utils
 * =========================================================================
 * 어떤 모듈 상태도 갖지 않는 순수 함수만 모아둡니다(포맷팅 등).
 *
 * ── 통화 표시 ─────────────────────────────────────────────────
 * formatCurrency(usdValue)는 내부적으로 항상 USDT로 계산된 값을 받아서,
 * App.Config.getDisplayCurrency()가 "USDT"면 그대로, "KRW"면 고정 환율로
 * 환산해서 문자열로 만듭니다. 이 함수 하나만 거치면 되므로, 호출하는
 * 쪽(chart.js/ui.js/orderbook.js)은 통화 계산을 직접 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Utils = (function () {
  // 내부(USDT) 값을 현재 선택된 표시 통화로 환산해서 문자열로 만듭니다.
  // USDT는 소수점 2자리, KRW는 정수(콤마)로 표시합니다.
  function formatCurrency(usdValue) {
    if (usdValue === null || usdValue === undefined || isNaN(usdValue)) return "-";
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") {
      const krw = usdValue * App.Config.USD_KRW;
      return "₩" + Math.round(krw).toLocaleString("ko-KR");
    }
    return "$" + usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // 부호(+/-)를 붙인 버전 — 손익 표시용
  function formatCurrencySigned(usdValue) {
    if (usdValue === null || usdValue === undefined || isNaN(usdValue)) return "-";
    const sign = usdValue >= 0 ? "+" : "";
    return sign + formatCurrency(usdValue);
  }

  // 통화 기호 없이 숫자만 (표 안에서 열 헤더에 단위를 따로 표시할 때 사용)
  function formatCurrencyPlain(usdValue) {
    if (usdValue === null || usdValue === undefined || isNaN(usdValue)) return "-";
    const cur = App.Config.getDisplayCurrency();
    if (cur === "KRW") {
      // 숫자만 있으면 어떤 통화인지 알 수 없어 "원"을 붙입니다.
      return Math.round(usdValue * App.Config.USD_KRW).toLocaleString("ko-KR") + "원";
    }
    return usdValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (n >= 0 ? "+" : "") + n.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  // 큰 수량을 K/M/B 단위로 축약 (24시간 거래량 표시용)
  function formatVolume(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    const abs = Math.abs(n);
    const fmt = (v) => v.toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (abs >= 1e9) return fmt(n / 1e9) + "B";
    if (abs >= 1e6) return fmt(n / 1e6) + "M";
    if (abs >= 1e3) return fmt(n / 1e3) + "K";
    return fmt(n);
  }

  /* ---------------- 종목별 표시 이름 ----------------
   * 다종목(나스닥·삼성전자·SK하이닉스) 대비. 수량 뒤에 붙는 단위 이름을
   * 종목 규격표(App.SymbolRegistry)에서 읽어옵니다.
   *
   * ⚠ 자릿수는 종목별로 나누지 않습니다 — 대표 지시(2026-08-27)
   *   "매수하는 단위도 비트코인이랑 똑같은 시스템으로 해".
   *   그래서 QTY_DECIMALS 는 네 종목 모두 6 고정이고, 규격표의
   *   spec.qtyDecimals 는 일부러 읽지 않습니다. 바뀌는 건 "이름" 하나뿐입니다.
   *
   * 읽는 곳 — App.SymbolRegistry.getSpec(symbol).unit (수리팀 규격표와 같은 이름)
   * 규격표가 없거나 모르는 종목이면 지금까지의 동작("BTC")으로 그대로 떨어집니다.
   */
  const QTY_DECIMALS = 6;
  const UNIT_FALLBACK = "BTC";

  function activeSymbolOf(symbol) {
    if (symbol) return symbol;
    return App.Config && App.Config.getActiveSymbol ? App.Config.getActiveSymbol() : "";
  }

  // 수량 뒤에 붙는 단위 이름. 예) "BTC"
  function qtyUnit(symbol) {
    const reg = App.SymbolRegistry;
    if (reg && typeof reg.getSpec === "function") {
      const spec = reg.getSpec(activeSymbolOf(symbol));
      if (spec && typeof spec.unit === "string" && spec.unit) return spec.unit;
    }
    return UNIT_FALLBACK;
  }

  // 문장 안에서 종목을 가리키는 이름. 예) "BTC 매수 포지션" / "삼성전자 매수 포지션"
  // 코인은 단위 이름이 곧 통용 코드(BTC)라 그대로 쓰고, 주식·지수는 종목명을 씁니다
  // ("주 매수 포지션"은 말이 안 되므로).
  function symbolLabel(symbol) {
    const reg = App.SymbolRegistry;
    const sym = activeSymbolOf(symbol);
    if (reg && typeof reg.getBySymbol === "function") {
      const meta = reg.getBySymbol(sym);
      if (meta && meta.type !== "crypto" && meta.name) return meta.name;
      if (meta) return qtyUnit(sym);
    }
    return UNIT_FALLBACK;
  }

  function formatQty(n, symbol) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (
      n.toLocaleString("ko-KR", { minimumFractionDigits: QTY_DECIMALS, maximumFractionDigits: QTY_DECIMALS }) +
      " " +
      qtyUnit(symbol)
    );
  }

  function nowStr() {
    const d = new Date();
    return (
      String(d.getHours()).padStart(2, "0") + ":" +
      String(d.getMinutes()).padStart(2, "0") + ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  return {
    formatCurrency,
    formatCurrencySigned,
    formatCurrencyPlain,
    formatPercent,
    formatVolume,
    formatQty,
    qtyUnit,
    symbolLabel,
    QTY_DECIMALS,
    nowStr,
  };
})();
