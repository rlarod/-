/* =========================================================================
 * js/account-isolation.js — App.AccountIsolation
 * =========================================================================
 * 같은 브라우저에서 계정이 바뀌었는데 앞사람의 거래 데이터가 남아
 * 보이는 상황을 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * js/auth.js 는 로그인할 때 서버에서 잔고·포지션·거래내역을 받아
 * localStorage 를 통째로 덮어씁니다. 정상 경로에서는 안전합니다.
 *
 * 그런데 그 복원이 실패하면(네트워크 끊김 등) catch 에서 경고만 남기고
 * 넘어갑니다. localStorage 를 덮어쓰지 않으므로 앞서 쓰던 데이터가
 * 그대로 남습니다.
 *
 *   A 로그인 -> 거래 -> 로그아웃            : 로컬을 지우므로 안전
 *   A 로그인 -> 거래 -> 세션 만료 -> B 로그인 : 로컬에 A 데이터가 남음
 *                                              + B 복원 실패
 *                                              -> B 가 A 의 잔고를 봄
 *
 * 모의투자라도 남의 성적이 내 화면에 뜨고, 그 상태로 거래하면
 * 서버에 잘못된 값이 저장됩니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * 거래 데이터를 저장할 때 "누구 것인지"를 같이 적어둡니다(닉네임).
 * 로그인한 사람이 그 주인과 다르면 로컬 거래 데이터를 지웁니다.
 * 그러면 최악의 경우에도 남의 데이터 대신 깨끗한 기본값에서 시작합니다.
 *
 * js/auth.js 와 js/trading.js 는 건드리지 않습니다.
 * 닉네임만 저장하며, 그 외 개인정보는 저장하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.AccountIsolation = (function () {
  "use strict";

  var OWNER_KEY = "trading-owner";
  var DATA_KEY = "trading";

  function nickname() {
    if (!App.Auth || typeof App.Auth.getNickname !== "function") return null;
    var n = App.Auth.getNickname();
    return n ? String(n).trim() : null;
  }

  function readOwner() {
    if (!App.Storage) return null;
    var saved = App.Storage.load(OWNER_KEY);
    return saved && saved.nickname ? String(saved.nickname).trim() : null;
  }

  function writeOwner(n) {
    if (!App.Storage || !n) return;
    App.Storage.save(OWNER_KEY, { nickname: n });
  }

  function hasTradingData() {
    if (!App.Storage) return false;
    var d = App.Storage.load(DATA_KEY);
    if (!d) return false;
    /* 거래 흔적이 있는지 — 빈 초기 상태는 지울 필요가 없습니다. */
    var trades = Array.isArray(d.closedTrades) ? d.closedTrades.length : 0;
    return !!(d.position || trades > 0 || d.pendingOrder);
  }

  /* 로그인한 사람과 로컬 데이터 주인이 다르면 지웁니다. */
  function check() {
    if (!App.Storage) return "저장소 없음";
    var who = nickname();
    if (!who) return "로그인 전";        // 비회원은 판단하지 않습니다

    var owner = readOwner();
    if (owner === who) return "같은 사람";

    if (owner === null) {
      /* 주인 표시가 없는 예전 데이터입니다.
         거래 흔적이 있으면 누구 것인지 알 수 없으므로 지우고,
         비어 있으면 그냥 지금 사람을 주인으로 적습니다. */
      if (hasTradingData()) {
        App.Storage.clear(DATA_KEY);
        writeOwner(who);
        console.warn("[account-isolation.js] 주인을 알 수 없는 거래 데이터라 정리했습니다.");
        return "주인불명 정리";
      }
      writeOwner(who);
      return "주인 표시";
    }

    /* 주인이 다릅니다 — 남의 데이터입니다. */
    App.Storage.clear(DATA_KEY);
    writeOwner(who);
    console.warn(
      "[account-isolation.js] 다른 계정(" + owner + ")의 거래 데이터가 남아 있어 정리했습니다. " +
      "현재 계정: " + who
    );
    return "다른사람 정리";
  }

  function init() {
    check();
    /* 로그인 복구에 시간이 걸리므로 몇 번 더 확인합니다. */
    setTimeout(check, 1200);
    setTimeout(check, 3000);
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", check);
      /* 거래가 저장될 때마다 주인 표시를 최신으로 유지합니다. */
      App.Bus.on("trading:persisted", function () {
        var who = nickname();
        if (who) writeOwner(who);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, check: check, readOwner: readOwner, hasTradingData: hasTradingData };
})();
