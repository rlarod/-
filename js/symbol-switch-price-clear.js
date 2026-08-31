/* =========================================================================
 * js/symbol-switch-price-clear.js — App.SymbolSwitchPriceClear
 * =========================================================================
 * 종목을 바꾼 직후 주문창의 "매수가격 / 매도가격" 두 칸에 ★옛 종목 숫자★가
 * 최대 1초 동안 남아 있던 것을 없앱니다.
 *
 * ── 무엇이 문제였나 (2026-08-28 디자인팀 원인 확정 + 수리팀 실측) ─────
 *   js/order-info-panel.js 는 symbol:change 를 구독하지 않습니다.
 *   1초짜리 타이머 하나만 있습니다.
 *
 *       js/order-info-panel.js:25   const REFRESH_INTERVAL_MS = 1000;
 *       js/order-info-panel.js:129  timer = setInterval(updatePreview, ...);
 *
 *   js/stale-price-guard.js 는 제 일을 합니다 — 종목이 바뀌는 순간
 *   호가 행의 dataset.price 를 즉시 지웁니다. 그런데 ★화면 글자★는
 *   다음 1초 눈금이 돌아올 때까지 옛 숫자 그대로입니다.
 *
 *   수리팀 실측 (localhost, 100ms 간격, 전환 6회):
 *       옛값 노출  1067ms / 426ms / 942ms / 335ms / 733ms / 243ms
 *       이론상 최대 1,000ms (타이머 주기)
 *
 *   예 — 비트코인(79,674.00)에서 SK하이닉스로 바꿨는데 1초 동안
 *   매수가격 칸에 79,674.00 이 그대로 보입니다. 회원은 그걸 SK하이닉스
 *   가격으로 읽습니다. 조용한 고장입니다.
 *
 *   ※ 조사팀이 보고한 "첫 체결까지 최대 15초" 와는 다른 구간입니다.
 *      0 ~ 1초        옛 종목 숫자가 보임              ← 여기가 이 파일의 담당
 *      그 뒤 ~ 첫 시세  "-" + "○○ 시세를 받는 중입니다"  ← 이미 정상
 *
 * ── ★왜 dataset 을 다시 읽지 않나★ (2026-08-28 PM 지시) ────────────────
 *   고치는 방법이 두 가지 있었습니다.
 *
 *     A) js/order-info-panel.js 가 symbol:change 때 updatePreview() 를
 *        다시 돌게 한다
 *        → updatePreview() 는 호가 행의 dataset.price 를 ★읽습니다.★
 *          stale-price-guard 가 dataset 을 지우기 ★전에★ 우리가 돌면
 *          옛 값이 다시 찍힙니다. 누가 먼저 도느냐에 결과가 달라집니다.
 *
 *     B) (이 파일) 두 칸을 곧장 "-" 로 쓴다
 *        → 아무것도 읽지 않으므로 ★누가 먼저 돌든 결과가 같습니다.★
 *
 *   그래서 B 로 했습니다. 순서 의존을 만들지 않는 쪽이 낫습니다.
 *
 * ── 무엇을 안 하나 ────────────────────────────────────────────────────
 *   · js/order-info-panel.js 를 고치지 않습니다. 1초 타이머도 그대로 둡니다
 *     (껐다 켜지 않습니다 — 우리가 만지면 그게 새 고장이 됩니다).
 *   · ★매수가격·매도가격 두 칸만★ 건드립니다.
 *     매수금액·매도금액·평가·보유·가능·수수료는 손대지 않습니다.
 *     그 값들은 종목과 무관하거나(잔고) 회원이 친 입력값(증거금×레버리지)이라
 *     종목이 바뀌어도 뜻이 그대로입니다.
 *   · 마크업을 지우지 않습니다. 글자만 "-" 로 바꿉니다.
 *     다음 1초 눈금에 새 종목 호가가 들어오면 그 자리에서 다시 채워집니다.
 *
 *   "-" 와 is-idle 은 js/order-info-panel.js 의 setValue() 가 값이 없을 때
 *   쓰는 것과 ★글자까지 같은 것★ 입니다(:53-58). 새 표시를 만들지 않았습니다.
 *
 * 되돌리려면 index.html 에서 이 파일의 <script> 한 줄만 지우면 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.SymbolSwitchPriceClear = (function () {
  "use strict";

  /* ★이 두 개만★ 입니다. 늘리지 마세요 — 다른 칸은 종목과 무관합니다. */
  var IDS = ["preview-ask-price", "preview-bid-price"];
  var EMPTY = "-"; // js/order-info-panel.js 의 setValue 가 쓰는 것과 같은 글자

  var cleared = 0; // 실제로 지운 횟수(검증용)
  var events = 0; // symbol:change 를 받은 횟수(검증용)

  function clearNow() {
    events++;
    for (var i = 0; i < IDS.length; i++) {
      var n = typeof document !== "undefined" ? document.getElementById(IDS[i]) : null;
      if (!n) continue;
      /* ★아무것도 읽지 않습니다.★ dataset 을 보면 순서에 따라 결과가
         달라집니다. 곧장 씁니다. */
      if (n.textContent !== EMPTY) {
        n.textContent = EMPTY;
        cleared++;
      }
      /* 값이 없을 때의 중립 회색 — order-info-panel.js 와 같은 규칙 */
      if (n.classList) n.classList.add("is-idle");
    }
  }

  function init() {
    if (!App.Bus || typeof App.Bus.on !== "function") return;
    App.Bus.on("symbol:change", clearNow);
  }

  return {
    init: init,
    clearNow: clearNow,
    // 검증용 — 화면에는 아무 영향이 없습니다.
    getCounters: function () {
      return { events: events, cleared: cleared };
    },
  };
})();
