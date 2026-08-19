/* =========================================================================
 * js/realized-pnl-fix.js — App.RealizedPnlFix
 * =========================================================================
 * 실현손익에서 진입 수수료가 빠져 있던 문제를 바로잡습니다.
 *
 * ── 무엇이 틀렸나 ───────────────────────────────────────────────────────
 * js/trading.js 는 청산할 때 이렇게 기록합니다.
 *     netPnl = 총손익 - 청산수수료
 *     closedTrades[].pnl = netPnl
 *     closedTrades[].fee = 진입수수료 + 청산수수료
 * getSnapshot() 의 realizedPnl 은 pnl 만 더하므로 진입 수수료가 빠집니다.
 *
 * 실측(증거금 1,000 · 10배 · 60,000 -> 61,000 · 1회 청산)
 *     실제로 번 돈  : 100,156.58 - 100,000 = 156.58
 *     화면 실현손익 : 161.58  (진입수수료 5.00 만큼 많음)
 * 잔고 자체는 맞습니다. 진입 수수료는 진입할 때 이미 빠졌습니다.
 * 표시되는 '실현손익'만 실제보다 커 보입니다.
 *
 * ── 왜 고쳐야 하나 ──────────────────────────────────────────────────────
 * 랭킹과 계급 점수가 실현손익 기준입니다. 수수료를 덜 뺀 값으로 집계되면
 * 거래를 많이 할수록 실제보다 유리해집니다(1,000회면 5,000원 과대계상).
 * 마이페이지·포지션표·서버 저장(realized_pnl)도 같은 값을 씁니다.
 *
 * ── 어떻게 고치나 ───────────────────────────────────────────────────────
 * js/trading.js 는 수정 금지 파일이라 손대지 않습니다.
 * App.Trading.getSnapshot() 을 감싸 realizedPnl 만 다시 계산합니다.
 *     realizedPnl = Σ(거래별 pnl) - Σ(거래별 진입수수료)
 * 진입 수수료는 fee(진입+청산)에서 청산수수료를 빼서 구합니다.
 * 청산수수료는 거래에 남은 값(qty · exit · 테이커율)으로 계산합니다.
 *
 * 이 한 곳만 고치면 마이페이지·포지션표·계급점수·서버 저장이 모두
 * 같은 값을 쓰게 됩니다(전부 getSnapshot 을 통해 읽습니다).
 * ========================================================================= */

window.App = window.App || {};

App.RealizedPnlFix = (function () {
  "use strict";

  /* 거래 한 건의 진입 수수료를 되살립니다. */
  function entryFeeOf(trade, feeRate) {
    if (!trade || typeof trade !== "object") return 0;   // null/undefined 방어
    var fee = Number(trade.fee);
    if (!isFinite(fee) || fee <= 0) return 0;

    /* 강제청산은 trading.js 가 진입 수수료만 fee 에 담습니다. */
    if (trade.forced || trade.isForced) return fee;

    var taker = feeRate && isFinite(feeRate.taker) ? feeRate.taker : 0.0005;
    var qty = Number(trade.qty) || 0;
    var exit = Number(trade.exit) || 0;
    var exitFee = qty * exit * taker;

    var entryFee = fee - exitFee;
    /* 반올림 오차로 음수가 나오면 0 으로 둡니다(과대 보정 방지). */
    if (!isFinite(entryFee) || entryFee < 0) return 0;
    return entryFee;
  }

  function recompute(snap) {
    if (!snap || !Array.isArray(snap.closedTrades)) return snap;
    var entryFees = 0;
    snap.closedTrades.forEach(function (t) {
      entryFees += entryFeeOf(t, snap.feeRate);
    });
    if (!entryFees) return snap;
    snap.realizedPnl = (Number(snap.realizedPnl) || 0) - entryFees;
    return snap;
  }

  function wrap() {
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return false;
    if (App.Trading.__realizedPnlFixed) return true;
    var orig = App.Trading.getSnapshot;
    App.Trading.getSnapshot = function () {
      var snap = orig.apply(App.Trading, arguments);
      try {
        return recompute(snap);
      } catch (e) {
        console.warn("[realized-pnl-fix.js] 보정 실패 — 원래 값 사용:", e);
        return snap;
      }
    };
    App.Trading.__realizedPnlFixed = true;
    return true;
  }

  function init() {
    if (wrap()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (wrap() || ++tries > 100) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, entryFeeOf: entryFeeOf, recompute: recompute };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.RealizedPnlFix;
