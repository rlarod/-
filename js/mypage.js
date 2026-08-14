/* =========================================================================
 * js/mypage.js — App.MyPage
 * =========================================================================
 * "내 자산 / 마이페이지" 페이지. trading.js는 전혀 안 건드립니다 — 이미
 * 모든 화면(ui.js의 자산 탭 등)이 구독하고 있는 'trading:update'(가격
 * 틱마다 발생)를 이 모듈도 똑같이 구독해서 표시만 합니다. 계산은 전부
 * trading.js의 getSnapshot()이 이미 한 결과를 그대로 씁니다.
 * ========================================================================= */

window.App = window.App || {};

App.MyPage = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function render(snapshot) {
    if (!dom.equity) return;
    if (dom.nickname) dom.nickname.textContent = App.Auth && App.Auth.getNickname() ? App.Auth.getNickname() : "-";

    dom.equity.textContent = App.Utils.formatCurrency(snapshot.equity);
    dom.balance.textContent = App.Utils.formatCurrency(snapshot.balance);
    dom.usedMargin.textContent = App.Utils.formatCurrency(snapshot.usedMargin);

    dom.unrealized.textContent = App.Utils.formatCurrencySigned(snapshot.unrealizedPnl);
    dom.unrealized.className = "mypage-value " + (snapshot.unrealizedPnl >= 0 ? "pnl-positive" : "pnl-negative");

    dom.realized.textContent = App.Utils.formatCurrencySigned(snapshot.realizedPnl);
    dom.realized.className = "mypage-value " + (snapshot.realizedPnl >= 0 ? "pnl-positive" : "pnl-negative");

    dom.fees.textContent = App.Utils.formatCurrency(snapshot.totalFeesPaid);

    const funding = snapshot.totalFundingPaid || 0;
    dom.funding.textContent = App.Utils.formatCurrencySigned(funding);
    dom.funding.className = "mypage-value " + (funding >= 0 ? "pnl-positive" : "pnl-negative");
  }

  function init() {
    dom = {
      nickname: el("mypage-nickname"),
      equity: el("mypage-equity"),
      balance: el("mypage-balance"),
      usedMargin: el("mypage-used-margin"),
      unrealized: el("mypage-unrealized"),
      realized: el("mypage-realized"),
      fees: el("mypage-fees"),
      funding: el("mypage-funding"),
    };
    if (!dom.equity) return; // 마크업 없으면 조용히 종료

    App.Bus.on("trading:update", render);
  }

  return { init };
})();
