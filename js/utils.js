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

  function formatQty(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return n.toLocaleString("ko-KR", { minimumFractionDigits: 6, maximumFractionDigits: 6 }) + " BTC";
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
    nowStr,
  };
})();
