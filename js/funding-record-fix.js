/* =========================================================================
 * js/funding-record-fix.js — App.FundingRecordFix
 * =========================================================================
 * 펀딩비 기록을 "실제로 낸 금액"과 맞춥니다.
 *
 * ── 무엇이 어긋났나 ────────────────────────────────────────────────────
 * js/trading.js 는 펀딩비를 이렇게 처리합니다.
 *     state.balance = Math.max(0, state.balance + fundingFee);
 *     fundingHistory 에는 fundingFee 를 그대로 기록
 *
 * 잔고가 모자라면 0 에서 멈추는데, 기록에는 전액을 낸 것처럼 남습니다.
 *
 *   실측 (잔고 1.49 · 명목가 995,010 · 펀딩율 1%)
 *     발생한 펀딩비   -9,950.10
 *     실제 빠진 금액      -1.49
 *     사라진 금액     -9,948.61
 *     그런데 기록은   -9,950.10
 *
 * 그래서 누적 펀딩비 표시가 실제 낸 돈보다 커집니다. 장부와 현실이
 * 다르면 사용자가 자기 손익을 잘못 계산합니다.
 *
 * ── 무엇을 고치고, 무엇을 안 고치나 ────────────────────────────────────
 * 고침   기록을 실제 낸 금액으로 맞춥니다. 못 낸 금액은 따로 남겨
 *        나중에 확인할 수 있게 합니다(unpaidFee).
 *
 * 안 고침 "잔고가 부족하면 부족분을 증거금에서 빼고, 그래도 모자라면
 *        청산" — 실제 거래소 방식입니다. 하지만 증거금을 건드리면
 *        청산가가 바뀌고, 그 계산은 js/trading.js(수정 금지) 안에
 *        있습니다. 잘못 손대면 멀쩡한 포지션이 청산될 수 있어
 *        여기서는 하지 않습니다.
 *        => 잔고를 0 에 가깝게 두고 큰 포지션을 들면 펀딩비를 거의
 *           안 내고 버틸 수 있는 문제는 남아 있습니다(운영 판단 필요).
 * ========================================================================= */

window.App = window.App || {};

App.FundingRecordFix = (function () {
  "use strict";

  var lastBalance = null;

  /* 기록된 펀딩비와 실제 잔고 변화가 다르면 기록을 실제에 맞춥니다. */
  function reconcile(snap) {
    if (!snap || !Array.isArray(snap.fundingHistory) || !snap.fundingHistory.length) {
      if (snap) lastBalance = snap.balance;
      return snap;
    }

    var latest = snap.fundingHistory[0];
    if (!latest || latest.__reconciled) {
      lastBalance = snap.balance;
      return snap;
    }

    /* 이번 갱신에서 실제로 줄어든 금액 */
    if (lastBalance !== null && typeof latest.fundingFee === "number" && latest.fundingFee < 0) {
      var actuallyPaid = lastBalance - snap.balance;   // 양수면 그만큼 냈다는 뜻
      var owed = -latest.fundingFee;                   // 내야 했던 금액

      if (actuallyPaid >= 0 && owed - actuallyPaid > 0.01) {
        latest.unpaidFee = Math.round((owed - actuallyPaid) * 100) / 100;
        latest.fundingFee = -Math.round(actuallyPaid * 100) / 100;
        latest.__reconciled = true;
        console.warn(
          "[funding-record-fix.js] 잔고가 모자라 펀딩비를 다 내지 못했습니다. " +
          "낸 금액 " + actuallyPaid.toFixed(2) + " / 못 낸 금액 " + latest.unpaidFee.toFixed(2)
        );
      } else {
        latest.__reconciled = true;
      }
    }

    lastBalance = snap.balance;
    return snap;
  }

  /* 못 낸 펀딩비 합계 — 화면에서 안내하고 싶을 때 씁니다. */
  function totalUnpaid(snap) {
    var s = snap || (App.Trading && App.Trading.getSnapshot ? App.Trading.getSnapshot() : null);
    if (!s || !Array.isArray(s.fundingHistory)) return 0;
    var sum = 0;
    s.fundingHistory.forEach(function (f) {
      if (f && typeof f.unpaidFee === "number") sum += f.unpaidFee;
    });
    return Math.round(sum * 100) / 100;
  }

  function wrap() {
    if (!App.Bus || typeof App.Bus.emit !== "function") return false;
    if (App.Bus.__fundingRecordFixed) return true;
    var orig = App.Bus.emit;
    App.Bus.emit = function (name, payload) {
      if ((name === "trading:update" || name === "trading:persisted") && payload) {
        try {
          payload = reconcile(payload);
        } catch (e) {
          console.warn("[funding-record-fix.js] 펀딩 기록 보정 실패 — 원래 값 사용:", e);
        }
      }
      return orig.apply(App.Bus, [name, payload].concat(
        Array.prototype.slice.call(arguments, 2)
      ));
    };
    App.Bus.__fundingRecordFixed = true;
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

  return { init: init, reconcile: reconcile, totalUnpaid: totalUnpaid, _reset: function () { lastBalance = null; } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.FundingRecordFix;
