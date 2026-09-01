/* =========================================================================
 * js/max-margin-safe.js — App.MaxMarginSafe
 * =========================================================================
 * "최대(MAX/100%)" 버튼이 만든 증거금을 ★엔진이 스스로 거절하던★ 문제를 막습니다.
 *
 * ── 무슨 일이 있었나 ────────────────────────────────────────────────────
 *  같은 식을 두 곳에서 따로 계산하는데 마지막 자리가 안 맞았습니다.
 *
 *     최대 버튼   margin = 잔고 / (1 + 배율 × taker)          (js/trading.js:109)
 *     진입 검사   margin + (margin × 배율) × taker > 잔고 → 거절 (js/trading.js:132)
 *
 *  종이 위에서는 정확히 같습니다. 컴퓨터 소수 계산에서는 아닙니다 —
 *  실측(지갑 130,000 · 50배): 130,000.00000000001 > 130,000  →  거절.
 *
 *  ⚠️ 되돌려 계산한 값을 다시 검사에 넣으면 어긋날 수 있다는 것이 핵심이고,
 *     "얼마나 어긋나는가" 는 잔고·배율마다 달라 예측이 안 됩니다.
 *
 * ── 어떻게 고쳤나 ───────────────────────────────────────────────────────
 *  ★깎는 양을 사람이 고르지 않습니다.★ 임의의 여유값(0.999 같은 것)을 쓰면
 *  언젠가 또 모자라거나, 회원 돈을 괜히 남깁니다.
 *
 *  대신 ★엔진이 실제로 쓰는 그 부등호 그대로★ 를 여기서 검사하고,
 *  통과할 때까지 소수 마지막 자리만 한 칸씩 내립니다.
 *
 *      while (margin + (margin × 배율) × taker > 잔고) margin = 한자리내림(margin);
 *
 *  ⭐ 수수료율은 지어내지 않고 엔진에서 받아옵니다
 *     (App.Trading.getSnapshot().feeRate.taker). 요율이 바뀌면 같이 움직입니다.
 *  ⭐ 지정가는 메이커(더 싼) 요율이라, 테이커로 맞춘 값은 지정가에도 안전합니다.
 *
 *  실측 — 깎이는 양은 상대오차 2^-52 수준(1,000,000 USDT 에서 약 0.000000002 USDT)
 *  이라 화면 표시(소수 2자리 / 원화 1원)에서는 ★한 자리도 달라지지 않습니다.★
 *
 * ── 왜 js/trading.js 를 안 고쳤나 ───────────────────────────────────────
 *  수정 금지 파일이고, 열려 있는 허가 범위는 "바이낸스 거래 규칙 A~D" 뿐입니다.
 *  이건 바이낸스 규칙이 아니라 소수 계산 문제라 허가 범위 밖입니다.
 *  그래서 ★함수 감싸기★ 로 우회합니다(js/social-login.js 와 같은 방식).
 *
 *  ⭐ 감싸는 쪽이 오히려 근본에 가깝습니다 — getMaxAffordableMargin() 을 쓰는
 *     ★모든 곳★ 이 한 번에 고쳐집니다. 지금 쓰는 곳:
 *       js/ui.js:650            MAX 칩          (수정 금지 파일 — 손댈 수 없음)
 *       js/qty-price-order.js   10/25/50/75/100% 칩 · 수량 한도
 *     한 곳만 고치면 나머지가 또 어긋납니다. (가)·B-2 때와 같은 실수입니다.
 *
 * ── 안전 ────────────────────────────────────────────────────────────────
 *  ⚠️ 이 파일은 ★진입 검사(부등호)를 절대 건드리지 않습니다.★
 *     그쪽을 느슨하게 하면 잔고보다 많이 넣을 수 있게 됩니다 — 반대 방향입니다.
 *  ⚠️ 돌려주는 값은 ★언제나 원래 값 이하★ 입니다. 커지는 경우가 없습니다.
 *  ⚠️ 스냅샷·요율을 못 읽으면 원래 값을 그대로 돌려줍니다(예전과 동일 동작).
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *  index.html 에서 <script src="js/max-margin-safe.js"></script> 한 줄을 지웁니다.
 *  완전히 지우려면  rm js/max-margin-safe.js
 * ========================================================================= */

window.App = window.App || {};

App.MaxMarginSafe = (function () {
  "use strict";

  /* 소수 마지막 자리를 한 칸 내립니다. 자리수(2^-52)에 비례해 줄이므로
     값이 크든 작든 "한 칸" 입니다. 0 밑으로는 안 내려갑니다. */
  function 한자리내림(x) {
    if (!(x > 0)) return 0;
    var 한칸 = Math.abs(x) * Number.EPSILON;
    if (!(한칸 > 0)) 한칸 = Number.MIN_VALUE;
    var y = x - 한칸;
    return y > 0 ? y : 0;
  }

  /* 엔진(js/trading.js openPosition)이 거절하는 조건 ★그대로★ 입니다.
     여기 식을 엔진과 다르게 쓰면 이 파일이 존재하는 이유가 없어집니다. */
  function 엔진이거절하나(margin, leverage, taker, balance) {
    var notional = margin * leverage;
    var entryFee = notional * taker;
    return margin + entryFee > balance;
  }

  /* 최대 32번이면 충분합니다(한 칸씩 내리는데 오차는 몇 칸 수준).
     혹시 못 맞추면 원래 값을 돌려주고 콘솔에 남깁니다 — 조용히 이상해지지 않게. */
  var 최대시도 = 32;

  function 안전값(원래값, snap) {
    if (typeof 원래값 !== "number" || !isFinite(원래값) || 원래값 <= 0) return 원래값;
    if (!snap || typeof snap.balance !== "number" || !isFinite(snap.balance)) return 원래값;
    var taker = snap.feeRate && isFinite(snap.feeRate.taker) ? snap.feeRate.taker : null;
    if (taker === null) return 원래값;
    var leverage = isFinite(snap.leverage) && snap.leverage >= 1 ? snap.leverage : 1;

    var m = 원래값;
    for (var i = 0; i < 최대시도; i++) {
      if (!엔진이거절하나(m, leverage, taker, snap.balance)) return m;
      m = 한자리내림(m);
      if (!(m > 0)) break;
    }
    if (typeof console !== "undefined" && console.warn) {
      console.warn("[max-margin-safe] 안전값을 못 찾아 원래 값을 씁니다", 원래값, snap.balance, leverage);
    }
    return 원래값;
  }

  var 감쌈 = false;

  function init() {
    if (감쌈) return;
    if (!App.Trading || typeof App.Trading.getMaxAffordableMargin !== "function") return;
    var 원래 = App.Trading.getMaxAffordableMargin;
    App.Trading.getMaxAffordableMargin = function () {
      var v = 원래.apply(App.Trading, arguments);
      try {
        return 안전값(v, App.Trading.getSnapshot());
      } catch (e) {
        return v; // 무슨 일이 있어도 원래 동작을 막지 않습니다
      }
    };
    감쌈 = true;
  }

  init(); // index.html 에서 js/trading.js 뒤에 실려 바로 감쌉니다

  return { init: init, 안전값: 안전값, 한자리내림: 한자리내림, 엔진이거절하나: 엔진이거절하나 };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.MaxMarginSafe;
