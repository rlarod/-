/* =========================================================================
 * js/currency-refresh.js — App.CurrencyRefresh
 * =========================================================================
 * 통화를 바꿨을 때 같이 갱신되지 않던 화면들을 다시 그립니다.
 *
 * ── 무엇이 문제인가 ────────────────────────────────────────────────────
 * js/config.js 가 통화를 바꾸면 'currency:change' 를 방송합니다.
 * 그런데 그 신호를 듣지 않는 화면이 있습니다.
 *
 *   듣는 곳   차트, 랭킹, 내 정보 패널, 포지션표, MARKET WAR
 *   안 듣는 곳 마이페이지, 주문정보 패널, 거래내역
 *
 * 그래서 원화로 바꿔도 마이페이지 숫자는 USDT 그대로 남습니다.
 * 실측: 원화 모드로 바꿨는데 총자산이 100,161.67 로 동일했습니다.
 * 환율이 1,500 이니 원화면 1억 5천만 원대로 보여야 맞습니다.
 *
 * 같은 화면에 원화와 USDT 가 섞여 보이면 사용자가 자기 자산을
 * 잘못 판단합니다.
 *
 * ── 어떻게 고치나 ──────────────────────────────────────────────────────
 * 각 모듈은 이미 "지금 값으로 다시 그리는" 방법을 갖고 있습니다.
 * 통화가 바뀌면 그 방법을 한 번 더 불러주기만 하면 됩니다.
 *   마이페이지·주문정보 패널 -> trading:update 를 다시 흘려보냅니다
 *                              (두 모듈 다 그 이벤트로 그립니다)
 *   거래내역                 -> render() 를 다시 부릅니다
 *
 * 값을 새로 계산하지 않습니다. 표시만 다시 그립니다.
 * 해당 모듈들은 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.CurrencyRefresh = (function () {
  "use strict";

  function repaint() {
    /* 마이페이지·주문정보 패널은 trading:update 로 그립니다.
       지금 값을 그대로 한 번 더 흘려보내면 새 통화로 다시 그려집니다. */
    try {
      if (App.Bus && App.Trading && typeof App.Trading.getSnapshot === "function") {
        App.Bus.emit("trading:update", App.Trading.getSnapshot());
      }
    } catch (e) {
      console.warn("[currency-refresh.js] 자산 화면 갱신 실패:", e);
    }

    /* 거래내역은 trading:persisted 로 다시 불러와 그립니다.
       (render 를 밖으로 내주지 않아서 이 이벤트를 씁니다) */
    try {
      if (App.Bus && App.Trading && typeof App.Trading.getSnapshot === "function") {
        App.Bus.emit("trading:persisted", App.Trading.getSnapshot());
      }
    } catch (e) {
      console.warn("[currency-refresh.js] 거래내역 갱신 실패:", e);
    }
  }

  function init() {
    if (!App.Bus || typeof App.Bus.on !== "function") return;
    App.Bus.on("currency:change", repaint);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, repaint: repaint };
})();
