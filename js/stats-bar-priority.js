/* =========================================================================
 * js/stats-bar-priority.js — App.StatsBarPriority
 * =========================================================================
 * 시세 바(.stats-bar)에서 안전에 직결되는 항목이 화면 밖으로 밀려나
 * 안 보이던 문제를 고칩니다.
 *
 * ── 무슨 문제였나 ────────────────────────────────────────────────
 * .stats-bar 는 한 줄을 유지하려고 overflow-x:auto 로 되어 있고,
 * 스크롤바는 CSS 로 숨겨져 있습니다(style.css). 그래서 좁은 화면에서는
 * 뒤쪽 항목이 "옆으로 더 있다"는 신호도 없이 그냥 잘려 보입니다.
 *
 * 실측(2026-08-21):
 *   1920 → 숨겨지는 양 없음
 *   1440 → 96px  : 마크가격이 안 보임
 *    390 → 1133px: 24H 고가·저가·거래량·펀딩비·마크가격이 안 보임
 *
 * 하필 마크가격과 펀딩비가 맨 뒤에 있습니다. js/chart.js(수정 금지)가
 * statsBar.appendChild() 로 나중에 덧붙이기 때문입니다. 둘 다 안전에
 * 직결됩니다 — 마크가격은 강제청산 판정 기준가이고, 펀딩비는 실제로
 * 잔고에서 빠져나가는 금액입니다.
 *
 * ── 어떻게 고치나 ────────────────────────────────────────────────
 * 1) 순서 재배치 — 마크가격·펀딩비에 클래스만 붙여 CSS order 로 앞으로
 *    당깁니다. DOM 순서는 그대로 두므로 js/chart.js 를 건드리지 않고,
 *    되돌릴 때도 CSS 만 지우면 됩니다.
 * 2) 스크롤 힌트 — 그래도 다 못 담는 좁은 화면에서는 오른쪽에 옅은
 *    그림자를 띄워 밀 수 있다는 신호를 줍니다.
 *    (js/menu-scroll-hint.js 와 같은 방식입니다)
 *
 * 항목을 지우거나 숨기지 않습니다. 자리만 바꾸고 신호만 더합니다.
 * ========================================================================= */

window.App = window.App || {};

App.StatsBarPriority = (function () {
  "use strict";

  /* 앞으로 당길 항목 — 값 span 의 id 로 찾습니다.
     순서가 곧 우선순위입니다(앞일수록 먼저 보임). */
  var PRIORITY = [
    { id: "stat-mark-price", cls: "tl-stat-order-1" }, /* 마크가격 — 강제청산 기준가 */
    { id: "stat-funding",    cls: "tl-stat-order-2" }  /* 펀딩비 — 실제로 돈이 나감 */
  ];

  function bar() {
    return document.querySelector(".stats-bar");
  }

  /* ---------------- 1) 순서 재배치 ---------------- */
  function applyOrder() {
    var sb = bar();
    if (!sb) return;
    for (var i = 0; i < PRIORITY.length; i++) {
      var v = document.getElementById(PRIORITY[i].id);
      if (!v) continue;                       /* 아직 안 만들어졌으면 다음 기회에 */
      var block = v.closest(".stat-block");
      if (!block || block.classList.contains(PRIORITY[i].cls)) continue;
      block.classList.add(PRIORITY[i].cls);
    }
  }

  /* ---------------- 2) 스크롤 힌트 ---------------- */
  /* 힌트 그림자는 시세 바 안이 아니라 스크롤되지 않는 바깥 층에 그립니다
     (.tl-stats-hint-layer, index.html). 바 안에 넣으면 flex 항목이 되어
     항목 간격을 하나 더 만들고, 그만큼 시세 바가 넓어져 오히려 뒤쪽 항목이
     더 잘립니다. .menu-bar-inner 과 같은 방식입니다. */
  function hintLayer() {
    var sb = bar();
    return sb ? (sb.closest(".tl-stats-hint-layer") || sb) : null;
  }

  function updateHint() {
    var sb = bar();
    if (!sb) return;
    /* 남은 스크롤이 2px 넘게 있으면 더 볼 게 있다는 뜻입니다. */
    var more = sb.scrollWidth - sb.clientWidth - sb.scrollLeft > 2;
    sb.classList.toggle("has-more", more);          /* 예전 방식과의 호환 */
    var layer = hintLayer();
    if (layer && layer !== sb) layer.classList.toggle("has-more", more);
  }

  function update() {
    applyOrder();
    updateHint();
  }

  function init() {
    var sb = bar();
    if (!sb) return;
    update();
    sb.addEventListener("scroll", updateHint, { passive: true });
    window.addEventListener("resize", update);
    /* js/chart.js 가 펀딩비·마크가격을 나중에 붙입니다. 붙는 즉시 따라갑니다. */
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(update).observe(sb, { childList: true, subtree: true });
    }
    setTimeout(update, 1000);
    setTimeout(update, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, update: update, applyOrder: applyOrder, updateHint: updateHint };
})();
