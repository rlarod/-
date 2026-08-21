/* =========================================================================
 * js/interval-guard.js — App.IntervalGuard
 * =========================================================================
 * TL-004 임시 방어 장치 (2026-08-21, [P1] 위험 제거 · 선택지 B)
 *
 * ── 무엇을 막나 ────────────────────────────────────────────────────────
 * 차트 간격이 1초·5초·15초일 때 `price:update` 신호가 0회가 됩니다.
 * 그러면 아래가 전부 조용히 멈춥니다(오류는 안 뜹니다).
 *   · 강제청산 판정        · 손절(SL)      · 익절(TP)
 *   · 지정가 주문 체결      · 화면 손익 갱신
 * 자세한 내용은 docs/백로그.md 의 TL-004 참조.
 *
 * ── 이 파일이 하는 일 ──────────────────────────────────────────────────
 * 화면에서는 style.css 가 1초·5초·15초 버튼을 가립니다.
 * 이 파일은 그 뒤를 받치는 "두 번째 자물쇠"입니다 —
 * 버튼이 아닌 다른 경로(콘솔, 다른 모듈, 예전 저장값 등)로 활성 간격이
 * 1s/5s/15s 가 되더라도 즉시 1m 으로 되돌립니다.
 *
 * ── 왜 이렇게 하나 ─────────────────────────────────────────────────────
 * js/config.js 와 js/chart.js 는 손대지 않습니다.
 *   · js/chart.js 는 수정 금지 파일 12개에 들어 있습니다.
 *   · js/config.js 의 INTERVALS 목록은 근본 수정 때 쓸 정보라 그대로 둡니다.
 * 그래서 App.Config.setActiveInterval 을 "감싸는" 방식만 씁니다.
 * (우회 패턴: docs/인계문서.md 1-1 "함수 감싸기")
 *
 * ── 되살리는 방법 (근본 수정이 끝난 뒤) ────────────────────────────────
 *   1) style.css 맨 아래 "TL-004 임시 가림" 블록의 규칙 한 줄을 지운다
 *   2) index.html 에서 이 파일의 <script> 한 줄을 지운다
 *   3) 이 파일을 지운다
 * 1)만 지워도 버튼은 다시 보이지만, 이 파일이 살아 있으면 눌러도 1분으로
 * 되돌아갑니다. 반드시 2)까지 같이 지워야 완전히 되살아납니다.
 * ========================================================================= */

window.App = window.App || {};

App.IntervalGuard = (function () {
  "use strict";

  /* price:update 가 오지 않는 간격들. 근본 수정이 끝나면 이 목록을 비웁니다. */
  var BLOCKED = { "1s": true, "5s": true, "15s": true };

  /* 되돌릴 기본 간격. js/config.js 의 activeInterval 기본값과 같습니다. */
  var FALLBACK = "1m";

  var redirected = 0;   // 몇 번 되돌렸는지 (테스트·점검용)
  var wrapped = false;

  function isBlocked(value) {
    return !!BLOCKED[value];
  }

  function wrap() {
    if (wrapped) return true;
    if (!App.Config || typeof App.Config.setActiveInterval !== "function") return false;

    var original = App.Config.setActiveInterval;

    App.Config.setActiveInterval = function (interval) {
      if (isBlocked(interval)) {
        redirected++;
        console.warn(
          "[IntervalGuard] " + interval + " 간격은 시세 신호가 끊깁니다(TL-004). " +
          FALLBACK + " 로 되돌립니다."
        );
        return original.call(App.Config, FALLBACK);
      }
      return original.apply(App.Config, arguments);
    };

    wrapped = true;

    /* 감싸기 전에 이미 막힌 값이었다면 지금 되돌립니다. */
    if (typeof App.Config.getActiveInterval === "function" &&
        isBlocked(App.Config.getActiveInterval())) {
      App.Config.setActiveInterval(FALLBACK);
    }

    /* 최후 방어 — 어떤 경로로든 막힌 간격으로 바뀌면 되돌립니다.
       FALLBACK 은 막힌 값이 아니므로 무한 반복이 생기지 않습니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("interval:change", function (d) {
        var v = d && d.interval;
        if (v === undefined && typeof App.Config.getActiveInterval === "function") {
          v = App.Config.getActiveInterval();
        }
        if (isBlocked(v)) App.Config.setActiveInterval(FALLBACK);
      });
    }

    return true;
  }

  function init() {
    if (wrap()) return;
    /* config.js 가 아직 안 올라왔을 수 있어 잠깐 재시도합니다. */
    var tries = 0;
    var t = setInterval(function () {
      if (wrap() || ++tries > 100) clearInterval(t);
    }, 100);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    isBlocked: isBlocked,
    getBlocked: function () { return Object.keys(BLOCKED); },
    getFallback: function () { return FALLBACK; },
    getRedirectedCount: function () { return redirected; },
    _reset: function () { redirected = 0; },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.IntervalGuard;
