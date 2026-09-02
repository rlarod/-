/*
 * js/chart-ma-line-mode.js — App.ChartMaLineMode
 * ---------------------------------------------------------------------------
 * 라인(종가선) 모드일 때만 MA7 을 점선으로 그립니다.
 *
 * 왜 필요한가
 * -----------
 * 라인 모드의 시세선 색이 #F0B429 (js/chart-candle-type.js:90 C_POINT) 이고
 * MA7 색도 #F0B429 (js/chart-indicators.js:74 COLORS.ma7) 입니다. 색이 같습니다.
 * 굵기만 2px 대 1px 이라, 두 선이 가까워지면 한 줄로 보입니다.
 *
 * 디자인팀 실측(1440, 라인 모드, 캔버스 열 단위):
 *   MA7 끔 — 금색 있는 열 292, 한 덩어리 292 (100%)
 *   MA7 켬 — 금색 있는 열 292, 한 덩어리 183 (62.7%), 두 덩어리 109
 * 차트팀 재현(같은 화면, 캔버스 실픽셀 584열):
 *   MA7 끔 — 584 / 한 덩어리 581 (99.5%)
 *   MA7 켬 — 584 / 한 덩어리 329 (56.3%), 두 덩어리 252
 * → 켰는데 절반 넘는 구간에서 선이 하나로 보이고, 갈라진 곳도 색·굵기가 같아
 *   어느 쪽이 MA7 인지 알 수 없습니다.
 *
 * 무엇을 하나
 * -----------
 * MA7 선의 lineStyle 만 바꿉니다. 라인 모드면 Dashed, 아니면 Solid.
 *   · 색 그대로 (#F0B429)
 *   · 굵기 그대로 (1px)
 *   · 팔레트 무변경
 *   · 지표 계산 무변경 — 값은 chart-indicators.js 가 계산한 것을 그대로 씁니다
 *
 * 캔들 · 바 · 영역 모드에서는 손대지 않습니다 (PM 지시).
 *
 * 어떻게 붙나 — js/chart.js 도 js/chart-indicators.js 도 고치지 않았습니다
 * ---------------------------------------------------------------------------
 * App.ChartIndicators.getSeriesForTest().lines 가 chart-indicators.js 안의
 * lineSeries 객체를 그대로(같은 참조로) 내줍니다. 그 객체는 다시 대입되지 않고
 * 속성만 바뀌므로, 한 번 받아두면 항상 지금 살아있는 MA7 선을 가리킵니다.
 * 거기에 applyOptions({ lineStyle }) 만 겁니다.
 *
 * 성능
 * ----
 * 시세가 들어올 때마다 하는 일이 없습니다. onTick 에 끼어들지 않습니다.
 * 400ms 짜리 감시 하나가 "지금 MA7 선 객체" 와 "원하는 모양" 두 개를 비교만 하고,
 * 달라졌을 때만 applyOptions 를 한 번 부릅니다. 같으면 즉시 반환합니다.
 *
 * 되돌리기
 * --------
 * index.html 의 <script src="js/chart-ma-line-mode.js"></script> 한 줄을 지우면
 * MA7 은 모든 모드에서 실선으로 돌아갑니다. 다른 파일은 건드린 게 없습니다.
 * 코드를 남긴 채 끄고 싶으면 콘솔에서 App.ChartMaLineMode.disable().
 */
window.App = window.App || {};

App.ChartMaLineMode = (function () {
  "use strict";

  /* 이 모드에서만 점선으로 바꿉니다. 캔들·바·영역은 손대지 않습니다. */
  var DASH_WHEN = { line: true };

  /* 감시 주기. 종목·봉 간격이 바뀌면 chart-indicators.js 가 MA7 선을 지웠다
     새로 만듭니다. 새로 만들어진 선은 실선이므로 다시 점선으로 돌려놔야 합니다. */
  var WATCH_MS = 400;

  var enabled = true;
  var timer = null;
  var lines = null; // chart-indicators.js 의 lineSeries (같은 참조)
  var lastSeries = null; // 마지막으로 손댄 선 객체
  var lastStyle = null; // 그때 걸어준 모양
  var applyCount = 0; // 확인용 — applyOptions 를 실제로 부른 횟수
  var wrapped = { setType: false, setOn: false, toggle: false };

  function LC() {
    return window.LightweightCharts;
  }

  /* LineStyle 은 라이브러리 enum 입니다. 없으면 v5 기준 숫자로 물러섭니다. */
  function styleSolid() {
    var lc = LC();
    return lc && lc.LineStyle ? lc.LineStyle.Solid : 0;
  }

  function styleDashed() {
    var lc = LC();
    return lc && lc.LineStyle ? lc.LineStyle.Dashed : 2;
  }

  function currentType() {
    var m = App.ChartCandleType;
    if (!m || typeof m.getType !== "function") return "candle";
    try {
      return m.getType();
    } catch (e) {
      return "candle";
    }
  }

  function wantedStyle() {
    return DASH_WHEN[currentType()] ? styleDashed() : styleSolid();
  }

  /* chart-indicators.js 안의 선 목록을 한 번만 받아 둡니다. */
  function grabLines() {
    if (lines) return lines;
    var m = App.ChartIndicators;
    if (!m || typeof m.getSeriesForTest !== "function") return null;
    try {
      var s = m.getSeriesForTest();
      if (s && s.lines) lines = s.lines;
    } catch (e) {
      /* 아직 준비 전 */
    }
    return lines;
  }

  /* ---------------------------------------------------------------------
   * 지금 화면의 MA(7) 선 하나 — ★어느 모듈이 그렸든★ 찾아냅니다.
   *
   * 2026-09-02 (11단계) 에 MA(7) 이 js/chart-indicators.js 에서 지표 틀
   * (js/chart-indicator-kit.js)로 옮겨졌습니다. 옮긴 뒤에는 옛 선이 아예
   * 안 그려지므로, 여기서 옛 자리만 보고 있으면 라인 모드에서 시세선
   * (금색 2px)과 MA(7)(금색 1px)이 ★다시 한 줄로 보입니다★ — 이 파일이
   * 생긴 바로 그 사고입니다.
   *
   * ⚠️ 여기서 바꾼 것은 "어느 선인가" 하나뿐입니다. ★언제 점선으로 할지★
   *    (DASH_WHEN) 는 그대로 이 파일 한 곳에만 있습니다. 두 벌 금지.
   * 틀이 없거나(파일을 지웠거나) 아직 안 옮겼으면 옛 자리를 그대로 봅니다.
   * ------------------------------------------------------------------- */
  function ma7Series() {
    var K = App.ChartIndicatorKit;
    if (K && typeof K.getMovedMa7Series === "function") {
      try {
        var moved = K.getMovedMa7Series();
        if (moved) return moved;
      } catch (e) {
        /* 틀이 아직 준비 전 — 옛 자리로 물러섭니다 */
      }
    }
    var L = grabLines();
    return L ? L.ma7 || null : null;
  }

  /* 핵심 — 값싼 비교 두 번. 달라졌을 때만 손댑니다. */
  function sync() {
    if (!enabled) return false;

    var s = ma7Series();
    if (!s) {
      /* MA7 이 꺼져 있음 — 다음에 새로 켜지면 새 객체라 다시 걸립니다 */
      lastSeries = null;
      lastStyle = null;
      return false;
    }

    var want = wantedStyle();
    if (s === lastSeries && want === lastStyle) return false; // 바뀐 게 없음

    try {
      s.applyOptions({ lineStyle: want });
      lastSeries = s;
      lastStyle = want;
      applyCount++;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 봉 종류·지표 토글은 즉시 반영합니다(감시 주기를 기다리지 않게). */
  function wrapOnce() {
    var ct = App.ChartCandleType;
    if (ct && !wrapped.setType && typeof ct.setType === "function") {
      var origSetType = ct.setType;
      ct.setType = function () {
        var r = origSetType.apply(this, arguments);
        sync();
        return r;
      };
      wrapped.setType = true;
    }

    var ind = App.ChartIndicators;
    if (ind && !wrapped.setOn && typeof ind.setOn === "function") {
      var origSetOn = ind.setOn;
      ind.setOn = function () {
        var r = origSetOn.apply(this, arguments);
        sync();
        return r;
      };
      wrapped.setOn = true;
    }
    if (ind && !wrapped.toggle && typeof ind.toggle === "function") {
      var origToggle = ind.toggle;
      ind.toggle = function () {
        var r = origToggle.apply(this, arguments);
        sync();
        return r;
      };
      wrapped.toggle = true;
    }
  }

  function start() {
    if (timer) return;
    timer = setInterval(function () {
      wrapOnce(); // 늦게 올라오는 모듈도 잡습니다
      sync();
    }, WATCH_MS);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function enable() {
    enabled = true;
    lastSeries = null;
    lastStyle = null;
    start();
    sync();
  }

  function disable() {
    enabled = false;
    stop();
    /* 실선으로 되돌려 놓습니다 */
    var s0 = ma7Series();
    if (s0) {
      try {
        s0.applyOptions({ lineStyle: styleSolid() });
      } catch (e) {
        /* 무시 */
      }
    }
    lastSeries = null;
    lastStyle = null;
  }

  function init() {
    wrapOnce();
    /* 종목·봉 간격이 바뀌면 선이 새로 만들어집니다 — 몇 번 더 눌러 줍니다 */
    if (App.Bus && typeof App.Bus.on === "function") {
      var kick = function () {
        sync();
        setTimeout(sync, 120);
        setTimeout(sync, 600);
      };
      try {
        App.Bus.on("symbol:change", kick);
        App.Bus.on("interval:change", kick);
      } catch (e) {
        /* 무시 */
      }
    }
    start();
    sync();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    sync: sync,
    enable: enable,
    disable: disable,
    DASH_WHEN: DASH_WHEN,
    WATCH_MS: WATCH_MS,
    /* 확인용 */
    getStateForTest: function () {
      return {
        enabled: enabled,
        type: currentType(),
        want: wantedStyle(),
        applied: lastStyle,
        hasMa7: !!ma7Series(),
        applyCount: applyCount,
        wrapped: { setType: wrapped.setType, setOn: wrapped.setOn, toggle: wrapped.toggle }
      };
    }
  };
})();
