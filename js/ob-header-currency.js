/* =========================================================================
 * js/ob-header-currency.js — App.ObHeaderCurrency        [TL-002 / P2]
 * =========================================================================
 * 문제
 *   호가창 머리글이 index.html 에 `가격(USDT)` 로 **글자로 박혀** 있습니다.
 *   표시 통화를 KRW 로 바꾸면 값은 `112,261,650원` 으로 바뀌는데
 *   (js/utils.js formatCurrencyPlain), 머리글은 `가격(USDT)` 그대로 남습니다.
 *   → 회원이 원화 숫자를 달러로 오해할 수 있습니다.
 *
 * 왜 별도 모듈인가
 *   머리글을 다시 쓰는 자연스러운 자리는 js/orderbook.js 인데
 *   **수정 금지 파일 12개** 중 하나입니다. 그래서 열지 않고,
 *   `currency:change` 를 듣고 머리글만 바깥에서 고쳐 씁니다.
 *
 * 덮어쓰기 싸움이 없는 근거
 *   js/orderbook.js 는 각 호가 "행"만 다시 그리고(151·170행)
 *   `.ob-cols` 머리글은 만든 뒤 한 번도 건드리지 않습니다.
 *   js/orderbook-tabs.js 는 패널을 **옮기기만** 하므로(innerHTML 없음)
 *   옮겨도 글자가 유지됩니다. 그래도 혹시 누가 다시 그릴 때를 대비해
 *   MutationObserver 로 한 번 더 덮습니다(값이 이미 맞으면 아무것도 안 함 →
 *   무한 루프 없음).
 *
 * 데이터를 숨기지 않습니다 — 라벨을 지우는 것이 아니라 통화 이름만 바꿔 씁니다.
 * ========================================================================= */

window.App = window.App || {};

App.ObHeaderCurrency = (function () {
  "use strict";

  /* 통화 코드 → 머리글에 쓸 단위 이름.
     KRW 값은 formatCurrencyPlain 이 "…원" 으로 찍으므로 머리글도 `원` 으로 맞춥니다. */
  var UNIT = { KRW: "원", USDT: "USDT" };

  var headEl = null;
  var observer = null;
  var applying = false;

  function currentUnit() {
    var cur = "USDT";
    try {
      if (App.Config && typeof App.Config.getDisplayCurrency === "function") {
        cur = App.Config.getDisplayCurrency() || "USDT";
      }
    } catch (e) { /* 설정을 못 읽으면 기본값(USDT)을 씁니다 */ }
    return UNIT[cur] || cur;
  }

  function findHead() {
    /* 호가창 패널의 머리글 첫 칸(= 가격 열). 최근체결 머리글(js/trades.js)은
       `가격 / 수량 / 시간` 이라 통화 표기가 없어 건드리지 않습니다. */
    return document.querySelector("#orderbook-panel .ob-header .ob-cols span");
  }

  function apply() {
    if (!headEl || !headEl.isConnected) headEl = findHead();
    if (!headEl) return;

    var want = "가격(" + currentUnit() + ")";
    if (headEl.textContent === want) return;   // 이미 맞으면 안 씁니다(루프 방지)

    applying = true;
    headEl.textContent = want;
    applying = false;
  }

  function watch() {
    if (observer || typeof MutationObserver !== "function") return;
    /* 감시 범위를 `.ob-header` 하나로 좁힙니다.
       패널 전체를 subtree 로 감시하면 호가 행이 갱신될 때마다(초당 수십 회)
       콜백이 돌아 낭비입니다. 머리글은 그 안에만 있습니다. */
    var header = document.querySelector("#orderbook-panel .ob-header");
    if (!header) return;
    observer = new MutationObserver(function () {
      if (applying) return;
      apply();
    });
    observer.observe(header, { childList: true, subtree: true, characterData: true });
  }

  function init() {
    headEl = findHead();
    if (!headEl) return;    // 마크업이 없으면 조용히 종료
    apply();
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("currency:change", apply);
    }
    watch();
  }

  return { init: init, apply: apply };
})();
