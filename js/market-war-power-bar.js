/* =========================================================================
 * js/market-war-power-bar.js — App.MarketWarPowerBar
 * =========================================================================
 * 전쟁터(MARKET WAR) 상단의 BUY/SELL 힘 막대 ★표시만★ 바로잡습니다.
 *
 * ── 무엇이 문제였나 (2026-08-28 수리팀 실측) ─────────────────────────
 *   js/market-war.js:626-638 updatePowerBarDom() 은 막대 폭을
 *   buyIntensity / (buyIntensity + sellIntensity) 로 그립니다.
 *
 *   그런데 강도(intensity)는 체결 1건마다 약 20~22 씩 오르고
 *   (js/market-war.js:496-499, PERCENTILE_GAIN 20 + FREQUENCY_GAIN 10
 *    + STREAK_GAIN 8) 초당 4.5 밖에 안 내려갑니다
 *   (INTENSITY_DECAY_PER_SEC).
 *
 *   실측(localhost, BTC, 65.9초) — 체결 매수 2.20건/초 · 매도 8.40건/초
 *     상승  매수 약 45/초 · 매도 약 185/초
 *     감소  양쪽 다 4.5/초        → ★상승이 감소의 10~41배★
 *   그래서 양쪽 다 Math.min(100, ...) 상한에 3~5초 만에 붙고 계속 붙어
 *   있습니다. 상한에 붙은 두 값의 비율은 ★정의상 언제나 50:50★ 입니다.
 *
 *     32초 16샘플 막대 폭   49.264% ~ 51.329%  (평균 50.28%)
 *     같은 순간 압력 바     매수 89% / 매도 11%   ← 실제로는 매수 압도
 *
 *   회원은 "지금 딱 반반이구나" 로 잘못 읽습니다. 조용한 고장입니다.
 *
 *   더 나쁜 쪽은 index.html 이었습니다. updatePowerBarDom() 은
 *   onTradeTick 안(501행)에서만 불립니다 — 체결 스트림이 죽으면 한 번도
 *   안 불려서 마크업에 박아둔 "50%" / width:50% 가 ★영구히★ 남습니다.
 *   TL-004(체결 0건) 때가 정확히 그 상태였습니다.
 *
 * ── 어떻게 고쳤나 ─────────────────────────────────────────────────────
 *   js/market-war.js 는 ★한 글자도 안 고쳤습니다.★
 *   강도값(buyIntensity/sellIntensity)도 안 건드립니다 — 그래서 병사 수,
 *   무기 등급, HUD 상태, 화면 흔들림 같은 ★연출은 하나도 안 바뀝니다.★
 *   (강도 상수 GAIN·DECAY 를 건드리면 연출이 통째로 바뀝니다. 그건
 *    대표 결재 항목이라 이번 범위 밖입니다 — 2026-08-28 PM 지시)
 *
 *   여기서는 mw-* DOM 을 뒤에서 덮어씁니다.
 *     · 계산은 ★새로 만들지 않고★ js/order-pressure-bar.js 의
 *       App.OrderPressureBar.getRatio() 를 그대로 재사용합니다.
 *       두 벌이 되면 나중에 조용히 갈라지기 때문입니다.
 *       정의: 최근 60초 테이커 매수 체결량 vs 테이커 매도 체결량.
 *     · 값이 없으면 50 을 지어내지 않고 '모름'(회색 빗금 + "—")입니다.
 *       모양은 압력 바와 같은 것을 씁니다(css/order-pressure-unknown.css).
 *
 *   updatePowerBarDom() 이 체결마다(초당 10건 내외) 같은 DOM 을 다시
 *   덮으므로 MutationObserver 로 되덮습니다.
 *
 * ── ★무한 되돌이가 안 나는 이유★ ────────────────────────────────────
 *   두 겹으로 막았습니다. 둘 중 하나만 있어도 안 돕니다.
 *
 *   (1) apply() 가 ★멱등★ 입니다 — 지금 값과 목표값이 같으면 아무것도
 *       쓰지 않습니다. 그래서 우리가 쓴 뒤 관찰기가 한 번 더 불려도
 *       두 번째 apply() 는 쓰기가 0 이고 거기서 끝납니다(최대 1회 추가).
 *   (2) 우리가 쓰는 동안 writing=true 로 두고, 빠져나오기 직전에
 *       observer.takeRecords() 로 큐를 비웁니다. 우리가 만든 변경 기록이
 *       사라지므로 관찰기 콜백이 애초에 안 불립니다.
 *
 *   실측 카운터를 밖으로 내놓습니다 — getCounters().rewrites 가
 *   "관찰기 때문에 다시 쓴 횟수" 입니다. tests/market-war-power-bar.test.js
 *   가 이 값이 폭주하지 않는지 검사합니다.
 *
 * 되돌리려면: index.html 의 이 파일 <script> 한 줄만 지우면 원래(강도 기반)
 * 막대로 즉시 돌아갑니다. 자세한 순서는 보고서에 있습니다.
 * ========================================================================= */

window.App = window.App || {};

App.MarketWarPowerBar = (function () {
  "use strict";

  const REFRESH_MS = 1000; // 압력 바와 같은 주기

  let dom = {};
  let timer = null;
  let observer = null;
  let writing = false;

  // 검증용 카운터 — 화면에는 아무 영향이 없습니다.
  let writes = 0; // 실제로 DOM 을 바꾼 횟수
  let rewrites = 0; // 그 중 "관찰기가 깨워서" 다시 덮은 횟수
  let observerHits = 0; // 관찰기 콜백이 불린 횟수

  function el(id) {
    return document.getElementById(id);
  }

  /* 계산은 압력 바 것을 그대로 씁니다(두 벌 금지).
     없거나 터지면 null → '모름'. 절대 50 을 지어내지 않습니다. */
  function readRatio() {
    if (!App.OrderPressureBar || typeof App.OrderPressureBar.getRatio !== "function") return null;
    let r = null;
    try {
      r = App.OrderPressureBar.getRatio();
    } catch (err) {
      return null;
    }
    if (!r || typeof r.buyPct !== "number" || !isFinite(r.buyPct)) return null;
    return r;
  }

  /* 지금 화면이 어떤 모습이어야 하는지 — 순수 함수입니다(DOM 을 안 건드림). */
  function desired() {
    const r = readRatio();
    if (!r) return { unknown: true, buyW: "0px", sellW: "0px", buyT: "—", sellT: "—" };
    return {
      unknown: false,
      buyW: r.buyPct + "%",
      sellW: r.sellPct + "%",
      buyT: r.buyPct + "%",
      sellT: r.sellPct + "%",
    };
  }

  /* ★멱등★ — 같으면 안 씁니다. 되돌이가 안 나는 근거입니다. */
  function apply() {
    if (!dom.buyBar || !dom.sellBar) return false;
    const d = desired();
    let changed = false;

    writing = true;
    try {
      if (dom.buyBar.style.width !== d.buyW) {
        dom.buyBar.style.width = d.buyW;
        changed = true;
      }
      if (dom.sellBar.style.width !== d.sellW) {
        dom.sellBar.style.width = d.sellW;
        changed = true;
      }
      if (dom.buyText && dom.buyText.textContent !== d.buyT) {
        dom.buyText.textContent = d.buyT;
        changed = true;
      }
      if (dom.sellText && dom.sellText.textContent !== d.sellT) {
        dom.sellText.textContent = d.sellT;
        changed = true;
      }
      if (dom.bar && dom.bar.classList.contains("is-unknown") !== d.unknown) {
        dom.bar.classList.toggle("is-unknown", d.unknown);
        changed = true;
      }
      if (dom.label && dom.label.classList.contains("is-unknown") !== d.unknown) {
        dom.label.classList.toggle("is-unknown", d.unknown);
        changed = true;
      }
    } finally {
      /* 우리가 방금 만든 변경 기록을 버리고 나서 flag 를 내립니다.
         (MutationObserver 콜백은 마이크로태스크라 그냥 내리면 늦습니다) */
      if (observer) observer.takeRecords();
      writing = false;
    }

    if (changed) writes++;
    return changed;
  }

  function onMutation() {
    if (writing) return; // 우리가 쓴 것 — 볼 필요 없습니다
    observerHits++;
    if (apply()) rewrites++;
  }

  function init() {
    dom = {
      buyBar: el("mw-power-buy"),
      sellBar: el("mw-power-sell"),
      buyText: el("mw-buy-pct"),
      sellText: el("mw-sell-pct"),
      bar: null,
      label: null,
    };
    if (!dom.buyBar || !dom.sellBar) return; // 마크업 없으면 조용히 종료

    dom.bar =
      (dom.buyBar.closest && dom.buyBar.closest(".mw-power-bar")) ||
      dom.buyBar.parentElement ||
      null;
    dom.label =
      (dom.buyText && dom.buyText.closest && dom.buyText.closest(".mw-power-label")) ||
      document.querySelector(".mw-power-label");

    apply();

    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(onMutation);
      /* 폭(style)과 '모름' 표시(class) 를 봅니다. */
      if (dom.bar) {
        observer.observe(dom.bar, {
          attributes: true,
          attributeFilter: ["style", "class"],
          subtree: true,
        });
      }
      /* 글자는 textContent 로 바뀌므로 childList 를 봐야 합니다. */
      if (dom.label) {
        observer.observe(dom.label, {
          attributes: true,
          attributeFilter: ["class"],
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    }

    /* 체결이 끊겨 60초가 지나면 스스로 '모름' 으로 내려가야 하므로
       관찰기와 별개로 주기적으로도 한 번씩 맞춥니다. */
    timer = setInterval(apply, REFRESH_MS);
  }

  function stop() {
    if (observer) observer.disconnect();
    observer = null;
    if (timer) clearInterval(timer);
    timer = null;
  }

  return {
    init: init,
    stop: stop,
    // 검증용 — 화면에 그리는 것과 같은 값/횟수를 그대로 돌려줍니다.
    getDesired: desired,
    getCounters: function () {
      return { writes: writes, rewrites: rewrites, observerHits: observerHits };
    },
  };
})();
