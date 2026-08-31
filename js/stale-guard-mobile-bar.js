/* =========================================================================
 * js/stale-guard-mobile-bar.js — App.StaleGuardMobileBar
 * =========================================================================
 * [P3] 폰 하단 [매수/롱][매도/숏] 바가 "시세 받는 중" 에 안 잠기던 것을
 *      데스크톱 버튼과 똑같이 잠급니다. (2026-08-31, 점검팀 라이브 발견)
 *
 * ── 무엇이 문제였나 (390 실측, 종목 전환 직후 0.5~1.3초) ────────────────
 *     App.StalePriceGuard.isStale()      true    ← 장치는 정상 작동
 *     #btn-long / #btn-short  disabled   true    ← 데스크톱 버튼은 잠김
 *     .tl-order-bar-long      disabled   false   ← 폰 하단 바만 안 잠김
 *                             opacity    1       ← 흐려지지도 않음
 *
 *   js/stale-price-guard.js:404 의 lockButtons() 는 ["btn-long","btn-short"]
 *   두 id 만 잠급니다. 폰 바 버튼(js/order-sheet-mobile.js:82)은 id 가 없는
 *   클래스 기반(.tl-order-bar-btn) 이라 그 목록에 못 들어갑니다.
 *
 * ── 돈이 나가지는 않습니다 ──────────────────────────────────────────────
 *   폰 바 버튼은 data-tl-open 으로 주문 시트를 열 뿐 주문을 넣지 않고,
 *   시트 안의 확인 버튼(#btn-long/#btn-short)은 이미 잠깁니다. 그리고
 *   App.Trading.openPosition / placeLimitOrder 자체가 감싸져 있습니다
 *   (App.Trading.__staleGuardOrders === true). 그래서 P3 입니다.
 *   그래도 "눌리네" 하고 시트를 열었더니 안에서 막히면 헷갈립니다.
 *
 * ── 어떻게 하나 ────────────────────────────────────────────────────────
 *   ⭐ 잠금 판정은 한 글자도 만들지 않습니다.
 *      App.StalePriceGuard.isStale() 한 곳만 읽습니다. 여기서 다시 계산하면
 *      두 장치가 서로 다른 순간에 잠기는 더 나쁜 상태가 됩니다.
 *
 *   ⭐ 표시도 새로 만들지 않습니다.
 *      데스크톱 버튼이 잠길 때 style.css:579 가 주는 것과 같은 값을
 *      그대로 인라인으로 얹습니다.
 *        .order-btn:disabled{background:var(--surface3);color:var(--text-faint);
 *                            cursor:not-allowed;filter:none;}
 *      style.css 를 안 고치는 이유 — 여러 팀이 같은 파일을 동시에 만지고
 *      있어서, 한 줄이라도 얹으면 커밋이 섞입니다. var() 를 그대로 쓰므로
 *      나중에 팔레트가 바뀌어도 데스크톱과 같이 따라갑니다.
 *
 *   ⭐ 되돌릴 것만 되돌립니다.
 *      우리가 잠근 버튼에만 data-stale-bar-locked="1" 을 붙이고, 풀 때
 *      그 표시가 있는 것만 되돌립니다. 원래부터 못 누르던 버튼(다른 장치가
 *      잠근 것)은 건드리지도, 대신 풀어주지도 않습니다.
 *      인라인 스타일은 잠그기 직전의 style 속성 문자열을 통째로 기억했다가
 *      그대로 되돌립니다(우리가 얹은 4개만 지우는 것이 아니라 원상복구).
 *
 * ── 언제 맞추나 ────────────────────────────────────────────────────────
 *   js/stale-price-guard.js 와 같은 신호를 봅니다 — symbol:change 로 잠기고
 *   price:update 로 풀립니다. 시각·타이머로 풀지 않습니다.
 *   버스 구독 순서에 기대지 않으려고 "지금" 과 "다음 차례(setTimeout 0)"
 *   두 번 맞춥니다. 상태가 그대로면 아무것도 하지 않으므로 틱마다 불려도
 *   비용이 없습니다.
 *   바는 js/order-sheet-mobile.js 가 body 에 나중에 붙이므로, body 의
 *   직계 자식이 바뀌면 한 번 더 맞춥니다(부팅 중에 잠금 창이 열린 경우).
 *
 * ── 하지 않는 일 ──────────────────────────────────────────────────────
 *   · 잠금 판정 로직을 건드리지 않습니다(잠글 대상만 넓힙니다)
 *   · 시트를 열거나 닫지 않습니다
 *   · 마크업을 지우거나 옮기지 않습니다
 *   · 수정 금지 12개 파일을 건드리지 않습니다
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────
 *   index.html 의 <script src="js/stale-guard-mobile-bar.js"></script>
 *   한 줄을 지우면 폰 바는 예전처럼 안 잠깁니다(그 외에는 아무 차이 없음).
 *   파일까지 지우려면 그 다음에 이 파일을 지웁니다.
 *     git checkout index.html && rm js/stale-guard-mobile-bar.js
 * ========================================================================= */

window.App = window.App || {};

App.StaleGuardMobileBar = (function () {
  "use strict";

  var BTN_SELECTOR = ".tl-order-bar-btn";
  var LOCK_ATTR = "data-stale-bar-locked";

  /* 데스크톱 버튼이 잠길 때 style.css:579 (.order-btn:disabled) 가 주는 것과
     같은 값입니다. 새 표시가 아닙니다. */
  var LOCK_STYLE = [
    ["background", "var(--surface3)"],
    ["color", "var(--text-faint)"],
    ["cursor", "not-allowed"],
    ["filter", "none"]
  ];

  var enabled = true;         /* 측정용 꺼짐 스위치 — 아래 _setEnabled 주석 참조 */
  var locked = [];            /* [{ el, style }] — 우리가 잠근 것만 */
  var applied = null;         /* 마지막으로 반영한 상태(true/false/null) */
  var counts = { locks: 0, unlocks: 0, lockedBtns: 0 };

  function guard() {
    return App.StalePriceGuard || null;
  }

  /* 잠금 판정은 여기서 하지 않습니다 — 한 곳에서만 읽어옵니다. */
  function isStale() {
    var g = guard();
    if (!g || typeof g.isStale !== "function") return false;
    try { return !!g.isStale(); } catch (e) { return false; }
  }

  function buttons() {
    if (typeof document === "undefined" || !document.querySelectorAll) return [];
    var list;
    try { list = document.querySelectorAll(BTN_SELECTOR); } catch (e) { return []; }
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[i]);
    return out;
  }

  function lock() {
    var btns = buttons();
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      if (b.disabled) continue;                 /* 원래부터 못 누르던 것은 그대로 둡니다 */
      if (b.getAttribute(LOCK_ATTR) === "1") continue;
      locked.push({ el: b, style: b.getAttribute("style") });
      b.disabled = true;
      b.setAttribute(LOCK_ATTR, "1");
      b.setAttribute("aria-disabled", "true");
      for (var j = 0; j < LOCK_STYLE.length; j++) {
        b.style.setProperty(LOCK_STYLE[j][0], LOCK_STYLE[j][1]);
      }
      counts.lockedBtns++;
    }
  }

  function unlock() {
    for (var i = 0; i < locked.length; i++) {
      var b = locked[i].el;
      if (!b || b.getAttribute(LOCK_ATTR) !== "1") continue;
      b.disabled = false;
      b.removeAttribute(LOCK_ATTR);
      b.removeAttribute("aria-disabled");
      /* 잠그기 직전 모습 그대로 되돌립니다.
         (빈 문자열이면 속성 자체를 뗍니다 — style="" 를 남기지 않습니다) */
      if (locked[i].style) b.setAttribute("style", locked[i].style);
      else b.removeAttribute("style");
    }
    locked = [];
  }

  function sync() {
    var want = enabled && isStale();
    if (want) {
      /* 잠금 중에는 매번 훑습니다 — 바가 늦게 만들어질 수 있습니다 */
      lock();
      if (applied !== true) { counts.locks++; applied = true; }
      return;
    }
    if (applied === false && locked.length === 0) return;
    unlock();
    if (applied !== false) { counts.unlocks++; applied = false; }
  }

  /* 버스 구독 순서에 기대지 않습니다 — 지금 한 번, 다음 차례에 한 번 */
  function syncSoon() {
    sync();
    if (typeof setTimeout === "function") setTimeout(sync, 0);
  }

  var wired = false;
  function wireBus() {
    if (wired) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("symbol:change", syncSoon);
    App.Bus.on("price:update", syncSoon);
    wired = true;
    return true;
  }

  var observed = false;
  function observeBody() {
    if (observed) return true;
    if (typeof document === "undefined" || !document.body || !window.MutationObserver) return false;
    /* 하단 바는 order-sheet-mobile.js 가 body 에 append 합니다(직계 자식만 봅니다) */
    new MutationObserver(function () { sync(); }).observe(document.body, { childList: true });
    observed = true;
    return true;
  }

  function tryAll() {
    var a = wireBus();
    var b = observeBody();
    sync();
    return a && b;
  }

  function init() {
    if (tryAll()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (tryAll() || ++tries > 200) clearInterval(t);
    }, 50);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    init: init,
    sync: sync,
    isLocked: function () { return locked.length > 0; },
    lockedCount: function () { return locked.length; },
    getCounts: function () {
      var o = {};
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) o[k] = counts[k];
      return o;
    },
    _reset: function () { unlock(); applied = null; },
    /* 측정용 — 파일을 고치지 않고 "고치기 전" 화면을 그대로 재현합니다.
       끄면 우리가 잠근 것만 되돌리고 아무것도 안 합니다(예전 동작).
       평소 코드에서는 아무도 부르지 않습니다. */
    _setEnabled: function (v) {
      enabled = !!v;
      if (!enabled) { unlock(); applied = null; }
      else sync();
    },
    _isEnabled: function () { return enabled; }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.StaleGuardMobileBar;
