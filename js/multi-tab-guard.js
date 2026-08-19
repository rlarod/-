/* =========================================================================
 * js/multi-tab-guard.js — App.MultiTabGuard
 * =========================================================================
 * 같은 브라우저에서 창을 두 개 열어두면 한쪽 거래 결과가 사라지는 문제를
 * 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * 거래 데이터는 localStorage 에 저장되는데, 각 창은 자기 메모리 값을
 * 기준으로 통째로 덮어씁니다. 다른 창이 먼저 저장한 것을 모릅니다.
 *
 *   실측
 *     창A, 창B 둘 다 잔고 100,000 으로 시작
 *     창A 거래 -> 100,156.58 저장
 *     창B 는 아직 100,000 으로 알고 있음
 *     창B 거래 -> 99,990 저장 (창A 것을 덮어씀)
 *     새로고침 -> 99,990. 창A 의 수익 156.58 이 사라짐
 *
 * 탭을 두 개 열어두는 건 흔한 일이고, 잃는 것은 거래 기록·잔고·포지션
 * 전부입니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * 브라우저는 다른 탭이 localStorage 를 바꾸면 'storage' 이벤트로
 * 알려줍니다. 그걸 듣고 있다가, 내 화면이 낡았다는 것을 알려줍니다.
 *
 *   · 내가 거래 중이 아니면 -> 조용히 새로고침해 최신 상태를 따라갑니다
 *   · 내가 포지션을 들고 있거나 방금 거래했으면 -> 함부로 새로고침하면
 *     오히려 내 작업이 날아가므로, 안내 띠를 띄우고 사용자가 고르게 합니다
 *
 * 저장 자체를 막지는 않습니다(그러면 거래가 안 됩니다).
 * "덮어쓰기가 일어났다"는 사실을 사용자가 알 수 있게 하는 것이 목적입니다.
 *
 * js/trading.js, js/storage.js 는 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.MultiTabGuard = (function () {
  "use strict";

  var KEY_HINT = "trading";     // 이 글자가 들어간 키가 바뀌면 거래 데이터입니다
  var notified = false;
  var myLastWrite = 0;

  function iAmBusy() {
    try {
      if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return false;
      var s = App.Trading.getSnapshot();
      /* 포지션이나 미체결 주문이 있으면 '작업 중'입니다. */
      if (s.position || s.pendingOrder) return true;
      /* 방금 내가 저장했다면 아직 화면을 쓰고 있는 중입니다. */
      return Date.now() - myLastWrite < 15000;
    } catch (e) {
      return true; // 판단이 안 되면 안전하게 '작업 중'으로 봅니다
    }
  }

  function showBanner() {
    if (notified || document.getElementById("multi-tab-banner")) return;
    notified = true;

    var bar = document.createElement("div");
    bar.id = "multi-tab-banner";
    bar.className = "multi-tab-banner";
    bar.innerHTML =
      '<span class="mtb-text">다른 창에서 거래가 있었습니다. ' +
      "이 창의 내용은 최신이 아니며, 여기서 거래하면 다른 창의 기록을 덮어쓸 수 있습니다.</span>" +
      '<button type="button" class="mtb-btn" id="mtb-reload">최신 내용 불러오기</button>' +
      '<button type="button" class="mtb-close" id="mtb-close" aria-label="닫기">×</button>';
    document.body.appendChild(bar);

    var reload = document.getElementById("mtb-reload");
    if (reload) reload.addEventListener("click", function () { window.location.reload(); });
    var close = document.getElementById("mtb-close");
    if (close) {
      close.addEventListener("click", function () {
        bar.remove();
        /* 닫아도 상황은 그대로이므로, 다음 변경 때 다시 알립니다. */
        notified = false;
      });
    }
  }

  function onOtherTabWrite() {
    if (iAmBusy()) {
      showBanner();
      console.warn("[multi-tab-guard.js] 다른 창에서 거래 데이터가 바뀌었습니다. 이 창은 최신이 아닙니다.");
      return;
    }
    /* 작업 중이 아니면 조용히 최신 상태로 따라갑니다. */
    console.warn("[multi-tab-guard.js] 다른 창의 변경을 반영하기 위해 새로고침합니다.");
    window.location.reload();
  }

  function init() {
    if (typeof window.addEventListener !== "function") return;

    /* 내가 저장한 시각을 기록해 둡니다(내 변경과 남의 변경을 구분). */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("trading:persisted", function () { myLastWrite = Date.now(); });
    }

    window.addEventListener("storage", function (e) {
      /* 다른 탭이 바꿨을 때만 이 이벤트가 옵니다(내 탭 변경은 안 옴). */
      if (!e || !e.key) return;
      if (String(e.key).indexOf(KEY_HINT) === -1) return;
      onOtherTabWrite();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, iAmBusy: iAmBusy, showBanner: showBanner };
})();
