/* =========================================================================
 * js/funding-restore-guard.js — App.FundingRestoreGuard
 * =========================================================================
 * 새로고침할 때마다 펀딩비가 다시 지급되던 문제를 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * js/auth.js 는 로그인할 때 서버 데이터로 로컬을 다시 채웁니다.
 * 그때 이 두 값을 비워버립니다.
 *     lastSettledFundingTime: null
 *     fundingHistory: []
 *
 * lastSettledFundingTime 은 "펀딩비를 어디까지 정산했는지" 표시입니다.
 * 이게 null 이 되면 trading.js 는 "아직 한 번도 정산 안 했다" 고 보고
 * 다음 펀딩 시각이 오면 다시 정산합니다.
 *
 * 그래서 포지션을 들고 새로고침할 때마다 펀딩비가 또 지급됩니다.
 *   실측: 새로고침 1회당 잔고가 50만원가량 늘어남
 *         (명목가 x 펀딩율 0.01% 수준과 일치)
 * 포지션이 없을 때는 안 생깁니다 — 신고 내용과 정확히 일치합니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * js/auth.js 는 수정 금지라 손대지 않습니다.
 * 대신 App.Storage.save 를 감싸, 거래 데이터를 저장할 때
 * 이 두 값이 비어 있으면 기존 값을 그대로 지켜줍니다.
 *
 *   들어온 값이 비었고 기존에 값이 있으면  -> 기존 값 유지
 *   들어온 값에 제대로 된 값이 있으면      -> 그대로 저장
 *
 * 서버가 펀딩 기록을 보관하지 않아서 fundingHistory 는 로컬에만 있습니다.
 * 그래서 덮어쓰지 않고 남겨두는 것이 맞습니다.
 * ========================================================================= */

window.App = window.App || {};

App.FundingRestoreGuard = (function () {
  "use strict";

  var KEY = "trading";
  var kept = 0;

  function isEmpty(v) {
    if (v === null || v === undefined) return true;
    if (Array.isArray(v)) return v.length === 0;
    return false;
  }

  function merge(incoming, existing) {
    if (!incoming || typeof incoming !== "object") return incoming;
    if (!existing || typeof existing !== "object") return incoming;

    var changed = false;

    /* 펀딩 정산 시각 — 이게 비면 펀딩비가 다시 지급됩니다. */
    if (isEmpty(incoming.lastSettledFundingTime) && !isEmpty(existing.lastSettledFundingTime)) {
      incoming.lastSettledFundingTime = existing.lastSettledFundingTime;
      changed = true;
    }

    /* 펀딩 기록 — 서버에 없어서 로컬에만 있습니다. */
    if (isEmpty(incoming.fundingHistory) && !isEmpty(existing.fundingHistory)) {
      incoming.fundingHistory = existing.fundingHistory;
      changed = true;
    }

    if (changed) {
      kept++;
      console.warn("[funding-restore-guard.js] 펀딩 정산 기록을 지켰습니다(중복 지급 방지).");
    }
    return incoming;
  }

  function wrap() {
    if (!App.Storage || typeof App.Storage.save !== "function") return false;
    if (App.Storage.__fundingGuarded) return true;

    var origSave = App.Storage.save;
    App.Storage.save = function (key, value) {
      if (key === KEY) {
        try {
          var existing = App.Storage.load(KEY);
          value = merge(value, existing);
        } catch (e) {
          console.warn("[funding-restore-guard.js] 기존 값 확인 실패(그대로 저장):", e);
        }
      }
      return origSave.call(App.Storage, key, value);
    };
    App.Storage.__fundingGuarded = true;
    return true;
  }

  function init() {
    if (wrap()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (wrap() || ++tries > 100) clearInterval(t);
    }, 50);
  }

  /* Storage 는 아주 일찍 필요하므로 지금 바로 감쌉니다. */
  init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);

  return { init: init, merge: merge, isEmpty: isEmpty, getKeptCount: function () { return kept; } };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.FundingRestoreGuard;
