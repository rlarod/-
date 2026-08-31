/* =========================================================================
 * js/risk-brackets.js — App.RiskBrackets
 * =========================================================================
 * 바이낸스 선물의 "명목 구간별 위험 한도표"(Leverage & Margin Bracket) 입니다.
 * 2026-08-31 대표 결재 — "바이낸스 거래 시스템을 따라해".
 *
 * 이 표가 정하는 것 두 가지
 *   1) 유지증거금률(MMR) 과 공제액(Maintenance Amount)
 *   2) 그 명목 구간에서 쓸 수 있는 최대 배율
 *
 * 바이낸스가 공식 문서에 적어둔 계산식 그대로입니다.
 *   개시증거금  = 명목 / 배율
 *   유지증거금  = 명목 × 유지증거금률 − 공제액
 *
 * 공제액을 빼먹으면 큰 포지션에서 유지증거금이 과하게 나오고, 그만큼
 * 청산가가 진입가 쪽으로 붙어 회원이 억울하게 청산됩니다. 반드시 뺍니다.
 *
 * ── 출처 ─────────────────────────────────────────────────────────────
 * 2026-08-31 06:12 UTC, 두 곳에서 같은 값 확인
 *   API   https://www.binance.com/bapi/futures/v1/friendly/future/common/brackets
 *   화면  binance.com/en/futures/trading-parameters/perpetual/leverage-margin
 *
 * ── ⚠️ 종목별 표에 대하여 ───────────────────────────────────────────
 * 바이낸스는 종목마다 구간표가 다릅니다. 지금 확보한 것은 BTCUSDT 하나뿐입니다.
 * 나머지 3종목(QQQ · 삼성전자 · SK하이닉스)은 애초에 바이낸스에 없는 종목이라
 * 가져올 표가 없습니다. 그래서 **전 종목이 BTCUSDT 표를 그대로 씁니다.**
 * 근거 — CLAUDE.md 대표 지시 "매수 단위는 전 종목 비트코인과 동일". 같은 논리입니다.
 * 나중에 종목별 표가 생기면 TABLES 에 심볼 키를 추가하면 됩니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/risk-brackets.js"></script> 한 줄을 지운다
 *      → js/trading.js 가 표를 못 읽어 예전 고정값(MMR 0.5%)으로 되돌아갑니다
 *   2) 완전히 되돌리려면
 *      git checkout -- js/trading.js js/position-table-extra.js index.html
 *      rm js/risk-brackets.js
 * ========================================================================= */

window.App = window.App || {};

App.RiskBrackets = (function () {
  "use strict";

  /* tier      : 구간 번호 (바이낸스 표기 그대로)
   * maxNotional: 이 구간의 명목 상한(USDT). 명목이 이 값 이하면 이 구간입니다
   * maxLeverage: 이 구간에서 허용되는 최대 배율
   * mmr       : 유지증거금률
   * cum       : 공제액(Maintenance Amount, USDT) */
  const BTCUSDT = [
    { tier: 1, maxNotional: 300000, maxLeverage: 150, mmr: 0.004, cum: 0 },
    { tier: 2, maxNotional: 800000, maxLeverage: 100, mmr: 0.005, cum: 300 },
    { tier: 3, maxNotional: 3000000, maxLeverage: 75, mmr: 0.0065, cum: 1500 },
    { tier: 4, maxNotional: 12000000, maxLeverage: 50, mmr: 0.01, cum: 12000 },
    { tier: 5, maxNotional: 70000000, maxLeverage: 25, mmr: 0.02, cum: 132000 },
    { tier: 6, maxNotional: 100000000, maxLeverage: 20, mmr: 0.025, cum: 482000 },
    { tier: 7, maxNotional: 230000000, maxLeverage: 10, mmr: 0.05, cum: 2982000 },
    { tier: 8, maxNotional: 480000000, maxLeverage: 5, mmr: 0.1, cum: 14482000 },
    { tier: 9, maxNotional: 600000000, maxLeverage: 4, mmr: 0.125, cum: 26482000 },
    { tier: 10, maxNotional: 800000000, maxLeverage: 3, mmr: 0.15, cum: 41482000 },
    { tier: 11, maxNotional: 1200000000, maxLeverage: 2, mmr: 0.25, cum: 121482000 },
    { tier: 12, maxNotional: 1800000000, maxLeverage: 1, mmr: 0.5, cum: 421482000 },
  ];

  // 심볼 → 표. 지금은 전 종목이 같은 표를 씁니다(위 주석 참조).
  const TABLES = { DEFAULT: BTCUSDT };

  function tableFor(symbol) {
    return (symbol && TABLES[symbol]) || TABLES.DEFAULT;
  }

  /* 명목(USDT)이 속한 구간을 돌려줍니다.
   * 값이 이상하면 1구간, 표의 끝을 넘으면 마지막 구간(가장 보수적)입니다. */
  function bracketFor(notional, symbol) {
    const table = tableFor(symbol);
    const n = typeof notional === "number" && isFinite(notional) && notional > 0 ? notional : 0;
    for (let i = 0; i < table.length; i++) {
      if (n <= table[i].maxNotional) return table[i];
    }
    return table[table.length - 1];
  }

  function mmr(notional, symbol) {
    return bracketFor(notional, symbol).mmr;
  }

  function maintenanceAmount(notional, symbol) {
    return bracketFor(notional, symbol).cum;
  }

  function maxLeverage(notional, symbol) {
    return bracketFor(notional, symbol).maxLeverage;
  }

  /* 유지증거금(USDT) = 명목 × 유지증거금률 − 공제액
   * 구간 경계에서 아주 조금 음수가 나올 수 있어 0 밑으로는 내려가지 않게 막습니다. */
  function maintenanceMargin(notional, symbol) {
    const n = typeof notional === "number" && isFinite(notional) && notional > 0 ? notional : 0;
    if (n === 0) return 0;
    const b = bracketFor(n, symbol);
    const mm = n * b.mmr - b.cum;
    return mm > 0 ? mm : 0;
  }

  /* 유지증거금 ÷ 명목 — 청산가 식에 그대로 넣는 "실효 유지증거금률" 입니다.
   * 공제액이 이미 반영돼 있어서 구간표의 mmr 과는 다른 값입니다. */
  function effectiveRate(notional, symbol) {
    const n = typeof notional === "number" && isFinite(notional) && notional > 0 ? notional : 0;
    if (n === 0) return bracketFor(0, symbol).mmr;
    return maintenanceMargin(n, symbol) / n;
  }

  return {
    bracketFor,
    mmr,
    maintenanceAmount,
    maintenanceMargin,
    effectiveRate,
    maxLeverage,
    tableFor,
  };
})();
