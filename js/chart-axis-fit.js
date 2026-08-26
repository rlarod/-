/* =========================================================================
 * js/chart-axis-fit.js — App.ChartAxisFit
 * =========================================================================
 * 좁은 화면(폰)에서 차트 오른쪽 가격축이 캔들 영역을 잡아먹는 문제를 고칩니다.
 *
 * 무슨 일이 있었나
 *   Lightweight Charts 의 가격축 폭은 우리가 정하는 값이 아니라
 *   "축 눈금 글자의 실제 폭"에서 라이브러리가 계산합니다.
 *   js/chart-font.js 가 축 글씨를 21px 로 키워 둔 탓에(데스크톱 UI 와 눈높이를
 *   맞추려고 2026-08-18 에 정한 값) 폰에서는 축이 그대로 두꺼워졌습니다.
 *
 *   실측 (360px, 원화 표시, 2026-08-26)
 *     축 174px / 캔들 154px  → 축이 캔들보다 넓음 (차트의 53%)
 *
 *   priceScale('right').applyOptions({ minimumWidth }) 로는 못 줄입니다.
 *   이름 그대로 "최소값"이라 계산된 폭을 깎지 못합니다(실행해서 확인).
 *   결국 축 글씨 크기가 유일한 손잡이입니다.
 *
 * 무엇을 하나
 *   화면 폭을 보고 App.ChartFont.setFontSize(n) 로 축 글씨만 바꿉니다.
 *   - 768 이상(데스크톱·태블릿) : 21px 그대로. 거기선 축이 문제가 아니고,
 *     chart-font.js 가 21px 로 정한 이유(주변 UI 와 눈높이)가 그대로 유효합니다.
 *   - 767 이하(폰)             : 아래 표대로 줄입니다.
 *
 *   js/chart.js 와 js/chart-font.js 는 한 글자도 건드리지 않습니다.
 *   차트 객체도 직접 잡지 않고 chart-font.js 가 이미 열어 둔
 *   App.ChartFont.setFontSize() 만 부릅니다.
 *
 * 성능
 *   시세 틱과 아무 관계가 없습니다. 창 크기가 바뀔 때만(디바운스 150ms)
 *   한 번 계산합니다. 값이 그대로면 setFontSize 도 부르지 않습니다.
 *
 * 되돌리기
 *   index.html 에서 이 파일 script 한 줄을 지우면 전부 원래대로(21px)입니다.
 *   실행 중에 되돌리려면 콘솔에서 App.ChartAxisFit.disable().
 * ========================================================================= */

window.App = window.App || {};

App.ChartAxisFit = (function () {
  "use strict";

  /* chart-font.js 가 정한 기본값. 데스크톱은 이 값을 그대로 씁니다. */
  var BASE_PX = 21;

  /* 폰 구간 표.
   * 고른 근거 — 축 폭은 화면 폭과 무관하게 "글씨 크기 × 자릿수"로만 정해집니다.
   * 원화(가장 자릿수가 긴 표시)에서 실측한 축 폭:
   *     21px→174  18→150  16→136  15→128  14→120  13→112  12→104  11→96  10→90
   * 차트 전체 폭은 (화면폭 − 좌우 여백 32px) 입니다.
   * "축이 차트의 30% 미만" 을 만족하는 가장 큰 글씨를 구간마다 골랐습니다.
   *     11px(96)  → 화면 353px 부터 30% 미만  → 360/375/390 전부 통과
   *     14px(120) → 화면 432px 부터
   *     16px(136) → 화면 486px 부터
   *     21px(174) → 화면 612px 부터  (768 은 23.6% 로 여유)
   * 여유를 두려고 각 구간의 하한을 실제 필요값보다 위에 잡았습니다. */
  var STEPS = [
    { maxWidth: 439, px: 11 },
    { maxWidth: 559, px: 14 },
    { maxWidth: 767, px: 16 },
  ];

  var enabled = true;
  var applied = null; /* 마지막으로 적용한 값 — 같으면 아무것도 안 합니다 */
  var timer = null;

  function viewportWidth() {
    try {
      return window.innerWidth || document.documentElement.clientWidth || 0;
    } catch (e) {
      return 0;
    }
  }

  /* 화면 폭 → 축 글씨 크기 */
  function sizeFor(width) {
    if (!width) return BASE_PX;
    for (var i = 0; i < STEPS.length; i++) {
      if (width <= STEPS[i].maxWidth) return STEPS[i].px;
    }
    return BASE_PX;
  }

  function apply() {
    if (!enabled) return;
    if (!App.ChartFont || typeof App.ChartFont.setFontSize !== "function") return;
    var want = sizeFor(viewportWidth());
    if (want === applied) return;
    applied = want;
    try {
      App.ChartFont.setFontSize(want);
    } catch (e) {
      console.warn("[chart-axis-fit.js] 축 글씨 적용 실패:", e);
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      timer = null;
      apply();
    }, 150);
  }

  /* 되돌리기 — 21px 로 돌리고 더는 관여하지 않습니다. */
  function disable() {
    enabled = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    applied = null;
    if (App.ChartFont && typeof App.ChartFont.setFontSize === "function") {
      App.ChartFont.setFontSize(BASE_PX);
    }
  }

  function enable() {
    enabled = true;
    applied = null;
    apply();
  }

  /* 이 파일은 js/chart.js 보다 뒤에 실리지만, chart.js 의 init() 은
     DOMContentLoaded 뒤(main.js)에 돌기 때문에 차트가 만들어지기 전에
     FONT_SIZE 를 바꿔 둘 수 있습니다. 늦게 만들어지는 차트도
     chart-font.js 가 그때의 FONT_SIZE 를 넣어 주므로 따로 손댈 게 없습니다. */
  apply();

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    document.addEventListener("DOMContentLoaded", apply);
  }

  return {
    apply: apply,
    disable: disable,
    enable: enable,
    getBaseSize: function () {
      return BASE_PX;
    },
    getAppliedSize: function () {
      return applied;
    },
    sizeFor: sizeFor,
    getSteps: function () {
      return STEPS.map(function (s) {
        return { maxWidth: s.maxWidth, px: s.px };
      });
    },
  };
})();
