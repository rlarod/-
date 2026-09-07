/* =========================================================================
 * js/chart-view-default.js — App.ChartViewDefault
 * =========================================================================
 * 차트를 "처음 열었을 때의 모습" 만 트레이딩뷰와 같게 맞춥니다.
 *
 *   (1) 캔들 간격(barSpacing)    1.2 -> 6.0px   (트레이딩뷰 실측값)
 *   (2) 오른쪽 여백(rightOffset) 0봉 -> 10봉    (트레이딩뷰 실측 60~62px / 6px)
 *   (3) 격자선 색               rgba(0,0,0,0.06) -> #1D273B (확정 팔레트 테두리색)
 *   (4) 축 테두리 색            rgba(0,0,0,0.10) -> #1D273B
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 왜 필요했나 — 실측 (2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────
 * 트레이딩뷰 (www.tradingview.com/chart, BINANCE:BTCUSDT.P)
 *   · 데스크톱 : 캔들 중심간격 6.0px · 몸통 5px · 오른쪽 여백 62px
 *   · 390 폭   : 캔들 중심간격 6.0px · 몸통 5px · 오른쪽 여백 60px
 *                (캡처 shots/ct-tv-390-ref.png 를 픽셀로 읽어 확인.
 *                 몸통 x = 217~221 · 223~227 · 229~233 … 6px 등간격,
 *                 마지막 몸통 중심 x=261, 그림 영역 오른쪽 끝 x=321 -> 60px)
 *     ★폭이 좁아져도 트레이딩뷰는 같은 6px 을 씁니다. 봉 수만 줄어듭니다.★
 *      그래서 우리도 폭에 따라 값을 바꾸지 않고 한 값으로 갑니다.
 *
 * 우리 차트 (변경 전)
 *   · js/chart.js 가 과거 500봉을 받은 뒤 timeScale().fitContent() 를 부릅니다.
 *     "받아온 것 전부를 화면에 넣기" 라서 간격이 1.2px 까지 눌립니다.
 *     1920 실측 : barSpacing 1.26 · 보이는 봉 499개 · 오른쪽 여백 0px
 *     몸통이 1px 이라 색만 보이고 봉의 생김새(시가·종가 몸통)가 안 보였습니다.
 *   · 격자선은 켜져 있었지만(visible:true) 색이 rgba(0,0,0,0.06) 이라
 *     배경 #0A0F1C 위에서 사실상 안 보였습니다(라이트 테마 시절 값).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 회원이 맞춰 둔 화면을 덮지 않습니다  ★중요★
 * ─────────────────────────────────────────────────────────────────────────
 * 이 파일이 손대는 순간은 ★차트가 데이터를 새로 불러와 화면을 스스로
 * 되돌리는 그 순간★ 뿐입니다. 그때는 어차피 js/chart.js 의 fitContent() 가
 * 회원의 확대·축소를 이미 지웁니다 — 그 자리를 우리 기본값으로 바꿀 뿐,
 * 회원이 맞춰 둔 것을 새로 지우는 일은 없습니다.
 *
 *   적용   (1) 페이지를 처음 열 때 (2) 종목을 바꿀 때 (3) 봉 간격을 바꿀 때
 *   안 함  시세 틱(초당 수십 번) · 회원의 확대/축소/드래그 · 과거 스크롤
 *          기간 선택(js/chart-date-range.js) · 날짜 이동(js/chart-goto-date.js)
 *          그림 도구의 "화면 되돌리기" · 리플레이(js/chart-replay.js)
 *
 * 어떻게 구분하나 — "불러오기 신호(pendingReset)" 를 세워 둔 동안에 온
 * fitContent() 한 번만 우리 것으로 봅니다. 신호는 App.Bus 의 symbol:change ·
 * interval:change 에서 서고, 한 번 쓰면 바로 내려갑니다. 다른 모듈이 부르는
 * fitContent() 는 신호가 없으니 그대로 통과합니다.
 * 또 신호가 서 있어도 ★회원이 차트를 만지면(휠·드래그·터치) 취소★ 합니다.
 *
 * 저장된 값 — 확대·축소를 저장하는 기능은 지금 이 사이트에 없습니다
 * (js 전체에서 보이는 구간을 저장소에 넣는 곳 0곳). 새로고침하면 원래도
 * fitContent 로 되돌아갔습니다. 나중에 저장 기능이 생기면 markReload() 와
 * scheduleApply() 사이에 "저장된 값이 있으면 그것을 쓴다" 한 줄만 넣으면 됩니다.
 *
 * 격자선 — js/chart-style.js(육각형 창)가 이미 주인입니다
 *   회원이 그 창에서 격자선을 저장해 뒀으면 ★색을 건드리지 않습니다★.
 *   저장한 적이 없을 때만 기본색을 #1D273B 로 올립니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * js/chart.js 는 한 글자도 고치지 않았습니다
 * ─────────────────────────────────────────────────────────────────────────
 * js/chart-font.js 가 하던 것과 같은 방법입니다 — LightweightCharts.createChart
 * 를 감싸 만들어지는 차트를 붙잡습니다(js/chart-replay.js ·
 * js/chart-position-symbol.js 도 같은 패턴). 못 감쌌을 때를 대비해
 * App.ChartFont.getCharts() 로도 한 번 더 찾습니다.
 * 바꾸는 것은 전부 공개 API(applyOptions)뿐입니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * fitContent() 는 ★그 자리에서 끝나지 않습니다★ (실측으로 알아낸 것)
 * ─────────────────────────────────────────────────────────────────────────
 * fitContent() 를 부른 직후에 읽으면 화면이 아직 안 바뀌어 있습니다.
 * 다음 그리기 차례에 처리되면서 barSpacing 옵션까지 덮어씁니다.
 *   실측 — fitContent() 직후 barSpacing 6 · 잠시 뒤 0.5 (499봉 -> 1243봉)
 * 그래서 fitContent 안에서 바로 값을 넣으면 ★조용히 되돌려집니다★.
 * 이 파일은 fitContent 뒤 두 프레임을 기다렸다가 넣고, 넣은 값이 살아 있는지
 * 다시 확인해서 안 살아 있으면 최대 3번까지 다시 넣습니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 성능
 * ─────────────────────────────────────────────────────────────────────────
 * 시세 틱에서 하는 일이 0 입니다. price/kline 이벤트를 아예 듣지 않습니다.
 * 일하는 순간은 위 3가지 경우뿐이고, 한 번에 applyOptions 한 번입니다.
 * 걸린 시간은 App.ChartViewDefault.getStats().lastApplyMs 로 볼 수 있습니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 되돌리기
 * ─────────────────────────────────────────────────────────────────────────
 *   방법 1 (코드)   git checkout <이 기능 커밋 해시>~1 -- index.html
 *                   && git rm -f js/chart-view-default.js
 *                   ※ 이 파일은 새로 만든 파일이라 rm 이 아니라 git rm 이어야
 *                     합니다. rm 은 디스크에서만 지우고 git 에는 남습니다.
 *   방법 2 (실행 중) 콘솔에서  App.ChartViewDefault.disable()
 *                   — 감싼 fitContent 를 원래 함수로 되돌리고, 격자선·축
 *                     테두리 색도 js/chart.js 의 원래 값으로 되돌립니다.
 *                     (이미 화면에 적용된 확대 배율은 회원이 마우스로 바꾸거나
 *                      종목·봉 간격을 바꾸면 원래 fitContent 화면으로 갑니다)
 * ========================================================================= */

window.App = window.App || {};

App.ChartViewDefault = (function () {
  "use strict";

  /* ---- 트레이딩뷰 실측값 (위 주석의 근거) ---- */
  var BAR_SPACING = 6;    /* 캔들 중심 간격 px */
  var RIGHT_OFFSET = 10;  /* 마지막 캔들 오른쪽 빈 공간(봉 수) = 60px */

  /* ---- 확정 팔레트 ---- */
  var GRID_COLOR = "#1D273B";   /* 테두리색 — 새 색을 만들지 않습니다 */
  var BORDER_COLOR = "#1D273B";

  /* js/chart.js 가 쓰던 원래 값 — disable() 에서 되돌릴 때 씁니다 */
  var ORIG_GRID = "rgba(0,0,0,0.06)";
  var ORIG_BORDER = "rgba(0,0,0,0.10)";

  /* 격자선의 주인 — js/chart-style.js 의 저장 키 */
  var STYLE_KEY = "chart-style";

  var enabled = true;
  var hooked = [];          /* 이미 감싼 차트 */
  var pendingReset = true;  /* 처음 열 때 한 번은 우리 기본값으로 */
  var userTouched = false;  /* 회원이 차트를 만졌으면 이번 신호는 버립니다 */
  var fallbackTimer = null;
  var busDone = false;
  var stats = {
    applied: 0, skippedUserTouched: 0, retries: 0,
    lastApplyMs: 0, lastBarSpacing: null, lastRightOffset: null,
    gridApplied: false, gridSkippedByMember: false, hookedBy: null
  };

  /* =====================================================================
   * 차트 잡기 — createChart 감싸기 (chart.js 무수정)
   * ===================================================================== */
  function patchLibrary() {
    if (typeof window.LightweightCharts === "undefined") return false;
    var LC = window.LightweightCharts;
    if (LC.__viewDefaultPatched) return true;
    if (typeof LC.createChart !== "function") return false;

    var origCreate = LC.createChart;
    function wrappedCreate(container, options) {
      var c = origCreate.call(LC, container, options);
      try { hookChart(c); } catch (e) { /* 무시 — 차트 자체는 정상입니다 */ }
      return c;
    }
    try {
      var proxy = Object.create(LC);
      Object.defineProperty(proxy, "createChart", {
        value: wrappedCreate, writable: true, configurable: true, enumerable: true
      });
      Object.defineProperty(proxy, "__viewDefaultPatched", {
        value: true, writable: true, configurable: true, enumerable: false
      });
      window.LightweightCharts = proxy;
      if (!stats.hookedBy) stats.hookedBy = "createChart";
    } catch (e) {
      console.warn("[chart-view-default.js] 라이브러리를 감싸지 못했습니다 — getCharts() 로 찾습니다.", e);
      return false;
    }
    return true;
  }

  /* 못 감쌌거나 차트가 이미 만들어진 뒤에 실렸을 때를 위한 두 번째 길 */
  function sweepExisting() {
    if (!window.App || !App.ChartFont || typeof App.ChartFont.getCharts !== "function") return;
    var list = [];
    try { list = App.ChartFont.getCharts() || []; } catch (e) { list = []; }
    for (var i = 0; i < list.length; i++) {
      try { hookChart(list[i]); } catch (e) { /* 무시 */ }
    }
  }

  function isHooked(chart) {
    for (var i = 0; i < hooked.length; i++) if (hooked[i].chart === chart) return true;
    return false;
  }

  function hookChart(chart) {
    if (!chart || isHooked(chart)) return;
    if (typeof chart.timeScale !== "function") return;

    var ts = chart.timeScale();
    if (!ts || typeof ts.fitContent !== "function") return;

    var rec = { chart: chart, ts: ts, origFit: ts.fitContent };
    /* fitContent 를 감쌉니다 — 원래 동작은 그대로 부르고, 그 뒤에만 우리 값을
       얹습니다. (fitContent 는 다음 프레임에 처리되므로 scheduleApply 참고) */
    ts.fitContent = function () {
      var r = rec.origFit.apply(ts, arguments);
      if (enabled && pendingReset && !userTouched) {
        pendingReset = false;
        clearFallback();
        scheduleApply(rec, 0);
      }
      return r;
    };
    hooked.push(rec);
    if (!stats.hookedBy) stats.hookedBy = "getCharts";

    watchUserInput(chart);
    applyStatic(chart);   /* 격자선·축 테두리 색은 지금 바로 */
    armFallback();        /* fitContent 가 안 오는 봉 간격(5초·15초)을 위해 */
  }

  /* =====================================================================
   * 회원이 차트를 만졌는지 — 만졌으면 이번 불러오기 신호는 버립니다
   * ===================================================================== */
  function watchUserInput(chart) {
    var el = null;
    try { el = chart.chartElement(); } catch (e) { el = null; }
    if (!el || el.__tlViewDefaultWatched) return;
    var mark = function () { userTouched = true; };
    el.addEventListener("wheel", mark, { passive: true });
    el.addEventListener("pointerdown", mark, { passive: true });
    el.addEventListener("touchstart", mark, { passive: true });
    el.__tlViewDefaultWatched = true;
  }

  /* =====================================================================
   * 격자선 · 축 테두리 (한 번만. 시세와 무관)
   * ===================================================================== */
  function memberOwnsGrid() {
    try {
      if (!App.Storage || typeof App.Storage.load !== "function") return false;
      var s = App.Storage.load(STYLE_KEY);
      if (!s || typeof s !== "object") return false;
      /* 육각형 창에서 격자선을 저장해 둔 회원 — 그 뜻을 그대로 둡니다 */
      return ("gridV" in s) || ("gridH" in s) || ("gridColor" in s);
    } catch (e) {
      return false;
    }
  }

  function applyStatic(chart) {
    if (!enabled || !chart) return false;
    var opts = {
      rightPriceScale: { borderColor: BORDER_COLOR },
      timeScale: { borderColor: BORDER_COLOR }
    };
    if (memberOwnsGrid()) {
      stats.gridSkippedByMember = true;
    } else {
      /* visible 은 건드리지 않습니다 — 원래도 true 였고(실측), 색만 안 보였습니다 */
      opts.grid = { vertLines: { color: GRID_COLOR }, horzLines: { color: GRID_COLOR } };
      stats.gridApplied = true;
    }
    try {
      chart.applyOptions(opts);
      return true;
    } catch (e) {
      console.warn("[chart-view-default.js] 격자선·축 색 적용 실패:", e);
      return false;
    }
  }

  /* =====================================================================
   * 캔들 간격 · 오른쪽 여백
   * fitContent 가 다음 프레임에 처리되므로 두 프레임 뒤에 넣고, 살아남았는지
   * 확인해서 안 살아남았으면 최대 3번까지 다시 넣습니다.
   * ===================================================================== */
  function raf(fn) {
    if (typeof window.requestAnimationFrame === "function") return window.requestAnimationFrame(fn);
    return setTimeout(fn, 16);
  }

  function scheduleApply(rec, tryNo) {
    raf(function () {
      raf(function () {
        if (!enabled) return;
        if (userTouched) { stats.skippedUserTouched++; return; }
        applyView(rec, tryNo);
      });
    });
  }

  function applyView(rec, tryNo) {
    var t0 = (window.performance && performance.now) ? performance.now() : 0;
    var ok = false;
    try {
      rec.ts.applyOptions({ barSpacing: BAR_SPACING, rightOffset: RIGHT_OFFSET });
      var o = rec.ts.options();
      ok = Math.abs(o.barSpacing - BAR_SPACING) < 0.01 && Math.abs(o.rightOffset - RIGHT_OFFSET) < 0.01;
      stats.lastBarSpacing = o.barSpacing;
      stats.lastRightOffset = o.rightOffset;
    } catch (e) {
      console.warn("[chart-view-default.js] 캔들 간격 적용 실패:", e);
      return;
    }
    var t1 = (window.performance && performance.now) ? performance.now() : 0;
    stats.lastApplyMs = Math.round((t1 - t0) * 1000) / 1000;
    stats.applied++;

    if (!ok && tryNo < 3) {
      stats.retries++;
      scheduleApply(rec, tryNo + 1);
    }
  }

  /* =====================================================================
   * 불러오기 신호
   * ===================================================================== */
  function markReload() {
    pendingReset = true;
    userTouched = false;
    armFallback();
  }

  /* 5초·15초처럼 바이낸스에 과거 데이터가 없는 간격은 js/chart.js 가
     fitContent() 를 부르지 않고 끝납니다(빈 차트에서 시작). 그때도 간격은
     맞춰 줘야 하므로, 신호가 선 뒤 1.2초 안에 fitContent 가 안 오면
     그냥 넣습니다. 회원이 그 사이에 차트를 만졌으면 넣지 않습니다. */
  function armFallback() {
    clearFallback();
    if (!enabled) return;
    fallbackTimer = setTimeout(function () {
      fallbackTimer = null;
      if (!enabled || !pendingReset || userTouched || hooked.length === 0) return;
      pendingReset = false;
      scheduleApply(hooked[0], 0);
    }, 1200);
  }

  function clearFallback() {
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
  }

  function listenBus() {
    if (!window.App || !App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("symbol:change", markReload);
    App.Bus.on("interval:change", markReload);
    return true;
  }

  function listenBusOnce() {
    if (busDone) return;
    if (listenBus()) busDone = true;
  }

  /* =====================================================================
   * 켜기 / 끄기
   * ===================================================================== */
  function disable() {
    enabled = false;
    clearFallback();
    for (var i = 0; i < hooked.length; i++) {
      var rec = hooked[i];
      try { rec.ts.fitContent = rec.origFit; } catch (e) { /* 무시 */ }
      try {
        rec.chart.applyOptions({
          grid: { vertLines: { color: ORIG_GRID }, horzLines: { color: ORIG_GRID } },
          rightPriceScale: { borderColor: ORIG_BORDER },
          timeScale: { borderColor: ORIG_BORDER }
        });
      } catch (e) { /* 무시 */ }
    }
    return true;
  }

  function enable() {
    enabled = true;
    markReload();
    for (var i = 0; i < hooked.length; i++) applyStatic(hooked[i].chart);
    return true;
  }

  /* =====================================================================
   * 시작
   * ===================================================================== */
  function boot() {
    patchLibrary();
    listenBusOnce();
    sweepExisting();
    /* 라이브러리·차트가 늦게 붙는 경우(CDN 지연)를 대비해 잠깐만 더 찾습니다.
       차트를 잡으면 멈춥니다 — 계속 도는 타이머를 남기지 않습니다. */
    var tries = 0;
    var timer = setInterval(function () {
      patchLibrary();
      listenBusOnce();
      sweepExisting();
      if (hooked.length > 0 || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  boot();

  return {
    disable: disable,
    enable: enable,
    apply: function () { markReload(); if (hooked[0]) scheduleApply(hooked[0], 0); },
    isEnabled: function () { return enabled; },
    getStats: function () {
      return {
        applied: stats.applied, retries: stats.retries,
        skippedUserTouched: stats.skippedUserTouched,
        lastApplyMs: stats.lastApplyMs,
        lastBarSpacing: stats.lastBarSpacing, lastRightOffset: stats.lastRightOffset,
        gridApplied: stats.gridApplied, gridSkippedByMember: stats.gridSkippedByMember,
        hookedCharts: hooked.length, hookedBy: stats.hookedBy,
        pendingReset: pendingReset, userTouched: userTouched
      };
    },
    /* 확인용 — 트레이딩뷰 실측에서 온 값입니다 */
    VALUES: { barSpacing: BAR_SPACING, rightOffset: RIGHT_OFFSET, grid: GRID_COLOR, border: BORDER_COLOR }
  };
})();
