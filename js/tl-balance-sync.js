/* =========================================================================
 * js/tl-balance-sync.js — App.TLBalanceSync
 * =========================================================================
 * '보유 TL' 이 화면마다 다르게 나오던 문제를 맞춥니다.
 *
 * ── 무엇이 어긋났나 ────────────────────────────────────────────────────
 * 같은 시점인데 두 곳이 다른 값을 보여줬습니다.
 *     내 정보 패널   2,000 TL
 *     TL 핫딜       36,560 TL
 *
 * 서로 다른 것을 보고 있었기 때문입니다.
 *     내 정보 패널 : js/rank.js 의 계급 점수 (브라우저에서 계산)
 *     TL 핫딜      : 서버 tl_balance_info() 의 실제 잔액
 *
 * 계급 점수와 보유 TL 은 원래 다른 값입니다.
 *     계급 점수 = 지금까지 획득한 TL (쓰더라도 안 내려감)
 *     보유 TL   = 획득 - 사용 (쓰면 줄어듦)
 * 게다가 브라우저 계산은 로컬 거래 기록(최대 200건)만 보고,
 * 서버는 전체 기록을 봅니다. 그래서 값이 크게 벌어집니다.
 *
 * 사용자에게는 '보유 TL' 이 하나여야 합니다. 물건을 살 때 쓰는 값,
 * 즉 서버 잔액이 맞습니다.
 *
 * ── 어떻게 맞추나 ──────────────────────────────────────────────────────
 * 서버에서 잔액을 받아 내 정보 패널의 '보유 TL' 자리에 넣습니다.
 * js/user-panel.js 가 다시 그릴 때마다 계급 점수로 되돌아가므로
 * 그 자리를 지켜보다가 다시 채웁니다.
 *
 * 계급(이병·일병…)은 그대로 계급 점수를 씁니다 — 그건 원래 그 값이
 * 맞습니다. 이 파일은 '보유 TL' 숫자만 바로잡습니다.
 *
 * 서버에서 못 받으면 손대지 않습니다(기존 표시 유지).
 * ========================================================================= */

window.App = window.App || {};

App.TLBalanceSync = (function () {
  "use strict";

  var TARGET_ID = "user-panel-points";
  var serverBalance = null;   // 서버가 알려준 보유 TL
  var fetching = false;

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  function fmt(n) {
    return Math.round(Number(n) || 0).toLocaleString() + " TL";
  }

  /* 서버에서 실제 잔액을 받아옵니다(핫딜·마켓과 같은 함수). */
  function fetchBalance() {
    var client = sb();
    if (!client || fetching) return Promise.resolve(null);
    fetching = true;
    return Promise.resolve(client.rpc("tl_balance_info"))
      .then(function (r) {
        fetching = false;
        var d = r && r.data;
        if (!d || d.logged_in !== true) return null;
        serverBalance = Number(d.balance) || 0;
        paint();
        return serverBalance;
      })
      .catch(function (e) {
        fetching = false;
        console.warn("[tl-balance-sync.js] 보유 TL 조회 실패(기존 표시 유지):", e);
        return null;
      });
  }

  /* 내 정보 패널의 '보유 TL' 자리를 서버 값으로 채웁니다. */
  function paint() {
    if (serverBalance === null) return;
    var el = document.getElementById(TARGET_ID);
    if (!el) return;
    var want = fmt(serverBalance);
    if (el.textContent !== want) el.textContent = want;
  }

  function init() {
    /* 패널은 자주 다시 그려집니다 — 그때마다 다시 채웁니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("trading:update", paint);
      App.Bus.on("auth:changed", function () { serverBalance = null; fetchBalance(); });
      /* 거래가 끝나면 획득 TL 이 늘어나므로 다시 받아옵니다. */
      App.Bus.on("trading:persisted", function () { fetchBalance(); });
    }

    var box = document.querySelector(".user-panel-box");
    if (box && typeof MutationObserver !== "undefined") {
      new MutationObserver(paint).observe(box, { childList: true, subtree: true });
    }

    setTimeout(fetchBalance, 1500);
    setTimeout(fetchBalance, 4000);
    /* 핫딜에서 물건을 사면 줄어드므로 가끔 다시 확인합니다. */
    setInterval(fetchBalance, 60000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    paint: paint,
    fetchBalance: fetchBalance,
    getServerBalance: function () { return serverBalance; },
    _setServerBalance: function (v) { serverBalance = v; },
  };
})();
