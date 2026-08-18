/* =========================================================================
 * js/chart-font.js — App.ChartFont
 * =========================================================================
 * 차트 축 글씨(가격 눈금 / 시간 눈금)를 키웁니다.
 *
 * 왜 이렇게 하나
 *   차트는 Lightweight Charts 가 캔버스에 직접 그립니다. 캔버스 안의 글자는
 *   CSS 로 못 키웁니다. 라이브러리의 layout.fontSize 옵션으로만 바뀝니다.
 *   그런데 js/chart.js 는 수정 금지 파일이고, 차트 객체를 밖으로 내주지도
 *   않습니다(return 은 init 뿐).
 *
 *   그래서 chart.js 가 부르는 LightweightCharts.createChart 를 감싸서
 *   옵션에 fontSize 를 끼워 넣고, 만들어진 차트 객체도 붙잡아 둡니다.
 *   chart.js 는 한 줄도 건드리지 않습니다.
 *
 *   이 파일은 반드시 라이브러리 다음, js/chart.js 앞에 실려야 합니다.
 *
 * 크기를 바꾸려면 아래 FONT_SIZE 만 고치면 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartFont = (function () {
  "use strict";

  /* 라이브러리 기본값은 12px 입니다. */
  var FONT_SIZE = 17;

  var charts = [];

  function patch() {
    if (typeof window.LightweightCharts === "undefined") return false;
    if (window.LightweightCharts.__fontPatched) return true;

    var LC = window.LightweightCharts;
    var origCreate = LC.createChart;
    if (typeof origCreate !== "function") return false;

    LC.createChart = function (container, options) {
      var opts = options || {};
      opts.layout = opts.layout || {};
      /* chart.js 가 fontSize 를 직접 정하고 있으면 그 값을 존중합니다. */
      if (opts.layout.fontSize === undefined) opts.layout.fontSize = FONT_SIZE;

      var chart = origCreate.call(this, container, opts);
      try {
        charts.push(chart);
      } catch (e) {
        /* 무시 — 글씨 크기는 이미 적용됐습니다 */
      }
      return chart;
    };

    LC.__fontPatched = true;
    return true;
  }

  /* 이미 만들어진 차트에도 적용하고 싶을 때 씁니다(크기 조절 실험용). */
  function setFontSize(px) {
    var n = Number(px);
    if (!isFinite(n) || n <= 0) return;
    FONT_SIZE = n;
    charts.forEach(function (c) {
      try {
        c.applyOptions({ layout: { fontSize: n } });
      } catch (e) {
        console.warn("[chart-font.js] 글씨 크기 적용 실패:", e);
      }
    });
  }

  /* 라이브러리가 아직 안 실렸을 수도 있어(CDN 지연 등) 잠깐 다시 시도합니다.
     chart.js 도 라이브러리가 없으면 차트를 안 만드므로, 늦게 붙어도
     그 전에 패치가 끝납니다. */
  if (!patch()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patch() || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  return {
    setFontSize: setFontSize,
    getFontSize: function () {
      return FONT_SIZE;
    },
    getCharts: function () {
      return charts.slice();
    },
  };
})();
