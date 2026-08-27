/* =========================================================================
 * js/chart-symbol-switch.js — App.ChartSymbolSwitch
 * =========================================================================
 * 종목이 바뀔 때 차트가 이전 종목 값을 한 톨도 안 남기게 하는 안전장치.
 * (종목 추가 4번 관문 — 차트 쪽. 2026-08-27)
 *
 * ⚠ 이 파일은 종목 전환을 "열지" 않습니다. symbol:change 를 쏘지 않습니다.
 *    받는 쪽만 준비합니다. 쏘는 것은 수리팀(3·4번) 몫입니다.
 *    지금은 그 신호를 쏘는 코드가 0곳이라, 이 파일이 실려도 화면 동작이
 *    한 군데도 안 바뀝니다(아래 "지금은 아무 일도 안 합니다").
 *
 * ── 왜 필요한가 (2026-08-27 실측으로 재현) ───────────────────────────────
 *   가격대가 종목마다 크게 다릅니다. 실측값:
 *       BTCUSDT     78,864 달러
 *       SAMSUNGUSDT    194 달러      406배
 *       QQQUSDT        717 달러      110배
 *   이전 종목 값이 한 줄이라도 남으면 가격축이 그 값까지 늘어나서,
 *   새 종목 캔들이 바닥에 눌린 실선 한 줄로 뭉개집니다.
 *
 *   실제로 재현한 고장 (shots/sym4/before-1440-mixed.png):
 *       1) 과거 봉을 더 받는 중(왼쪽 끝까지 스크롤)에 종목을 바꿨습니다
 *       2) js/chart.js:363 loadMoreHistory 의 응답이 3.2초 뒤 도착했는데,
 *          그 사이 종목이 바뀐 것을 아무도 모릅니다
 *       3) js/chart.js:369  allCandles = filtered.concat(allCandles)
 *          → BTC 500봉 + 삼성전자 500봉이 한 차트에 붙었습니다
 *       4) 캔들 1000개, 값 범위 187.5 ~ 79,299.8. 가격축이 125,000 까지
 *          늘어나고 삼성전자 봉은 전부 바닥의 가는 선이 됐습니다
 *       5) 8.9초 뒤에도 그대로였습니다 — 저절로 낫지 않습니다
 *       6) 콘솔 오류 0건. 화면은 멀쩡해 보입니다(조용한 고장)
 *
 * ── 무엇을 하나 — 두 가지뿐입니다 ────────────────────────────────────────
 *   1) 종목이 바뀌면 차트의 모든 시리즈를 즉시 비웁니다
 *      캔들·거래량뿐 아니라 MA·볼린저·RSI·MACD 까지 전부입니다.
 *      ⚠ 캔들만 비우면 소용없습니다 — 실측: 캔들만 비웠더니 MA·볼린저가
 *        같은 가격축에 남아 축이 142,242 ~ -108,934 로 그대로였습니다.
 *      비우고 나면 지표 모듈들이 "캔들이 아직 없다"고 판단해 이전 종목
 *      값으로 다시 그리지 않고 새 데이터를 기다립니다
 *      (js/chart-indicators.js:595 · js/chart-oscillators.js:1008 —
 *       둘 다 candleSeries.data().length 를 보고 기다립니다. 안 비우면
 *       옛 종목 캔들이 그대로 있어서 그걸로 지표를 그립니다).
 *
 *   2) 철 지난 과거봉 응답을 차트에 못 들어가게 막습니다
 *      App.Api.fetchKlines 를 감쌉니다(js/api.js 는 안 고칩니다).
 *        · 최초 로딩(인자 3개)   — 응답 시점에 종목이 이미 바뀌었으면 버립니다
 *        · 이어붙이기(인자 4개)  — "이 종목의 최초 로딩이 성공으로 끝났을 때"
 *                                 에만 통과시킵니다. 그 밖에는 아예 요청도
 *                                 안 보내고 거절합니다
 *      인자 개수로 둘을 가르는 이유: js/chart.js 는 수정 금지 파일이라
 *      어느 함수가 불렀는지 알 방법이 이것뿐입니다.
 *        js/chart.js:305 loadHistory      → fetchKlines(sym, iv, limit)
 *        js/chart.js:369 loadMoreHistory  → fetchKlines(sym, iv, limit, endTime)
 *
 * ── 버릴 때 "거절" 과 "영원히 안 끝냄" 을 구분한 이유 ────────────────────
 *   js/chart.js 를 못 고치니, 그쪽 .then/.catch 가 무슨 짓을 하는지 보고
 *   부작용이 없는 쪽을 골랐습니다.
 *     · loadMoreHistory 의 catch — isLoadingMore=false 로 되돌리고 로그만
 *       남깁니다. 거절해도 안전합니다. 오히려 거절해야 빗장이 풀립니다
 *     · loadHistory 의 catch — 화면 상태를 "과거 캔들 조회 실패" 로 바꿉니다.
 *       철 지난 응답 때문에 그 빨간 문구를 띄우면 안 됩니다.
 *       그래서 거절이 아니라 "영원히 안 끝나는 약속" 으로 버립니다.
 *       (loadHistory 에는 isLoadingMore 같은 빗장이 없어서, 안 끝내도
 *        다음 로딩을 막지 않습니다. 확인하고 골랐습니다.)
 *
 * ── 안 한 것 ─────────────────────────────────────────────────────────────
 *   · 진입가·TP·SL·현재가 가로선은 안 건드립니다.
 *     실측: 가로선(createPriceLine)은 가격축 자동맞춤에 안 들어갑니다.
 *     빈 축에 194 짜리 캔들만 두고 78,900 가로선을 붙였다 뗐는데 축이
 *     194.59~193.15 로 똑같았습니다. 그래서 옛 종목 가로선이 남아도
 *     화면 밖으로 나갈 뿐 축을 망가뜨리지 않습니다.
 *     게다가 js/symbol-guard.js:429 가 포지션·미체결이 있으면 종목 전환
 *     자체를 막으므로, 옛 종목 포지션선을 든 채 넘어갈 수가 없습니다.
 *   · 그린 선(수평선·추세선·피보나치·자)은 이미 종목별로 나뉘어 있습니다
 *     (js/chart-drawings.js:321 store.bySymbol[symbol]). 손대지 않습니다.
 *   · js/chart.js 안의 allCandles 배열은 밖에서 못 비웁니다. 대신 위 2)로
 *     그 배열에 다른 종목이 섞여 들어가는 길을 막았습니다.
 *
 * ── 성능 ─────────────────────────────────────────────────────────────────
 *   시세 틱마다 하는 일이 0 입니다. 이 파일은 symbol:change / interval:change
 *   때만 움직입니다. fetchKlines 감싸기는 함수 호출 한 겹(과거봉 조회는
 *   페이지당 몇 번뿐)이라 초당 수십 번 오는 kline 경로와 무관합니다.
 *
 * ── 지금은 아무 일도 안 합니다 ───────────────────────────────────────────
 *   symbol:change 를 쏘는 코드가 아직 0곳입니다. interval:change 때는
 *   "이어붙이기 빗장" 이 잠깐 잠겼다가 최초 로딩이 끝나면서 바로 풀리는데,
 *   그 사이 loadMoreHistory 는 원래도 allCandles 가 빌 때까지 아무 일도
 *   안 하므로 동작이 같습니다(실측으로 확인).
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/chart-symbol-switch.js"></script> 한 줄을
 *   지우면 완전히 원래대로 돌아갑니다. 이 파일은 다른 파일을 안 고칩니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartSymbolSwitch = (function () {
  "use strict";

  /* 버릴 응답에 붙이는 표시. 콘솔에서 "이건 우리가 일부러 버린 것" 으로 읽힙니다. */
  var STALE_MARK = "[chart-symbol-switch] 철 지난 과거봉 응답을 버렸습니다";

  /* 최초 로딩이 성공으로 끝난 종목. 이 종목에만 이어붙이기를 허용합니다.
     null 이면 "아직 아무 종목도 온전히 안 실렸다" 는 뜻입니다. */
  var loadedSymbol = null;

  var stats = {
    cleared: 0,        // 종목이 바뀌어 비운 횟수
    clearedSeries: 0,  // 그때 비운 시리즈 개수(누적)
    droppedFull: 0,    // 철 지나서 버린 최초 로딩 응답
    blockedMore: 0,    // 아예 안 보낸 이어붙이기 요청
    staleMore: 0,      // 보냈는데 돌아오는 사이 종목이 바뀐 이어붙이기 응답
    lastSymbol: null,
    lastClearedSeries: 0,
  };

  function activeSymbol() {
    try {
      return App.Config && typeof App.Config.getActiveSymbol === "function"
        ? App.Config.getActiveSymbol()
        : null;
    } catch (e) {
      return null;
    }
  }

  /* -----------------------------------------------------------------------
   * 1) 차트의 모든 시리즈 비우기
   *    차트 객체는 js/chart-font.js 가 LightweightCharts.createChart 를
   *    감싸서 붙잡아 둔 것을 그대로 받아옵니다(js/chart.js 무수정).
   *    시리즈는 라이브러리 공개 API 인 chart.panes()[n].getSeries() 로 찾습니다.
   * --------------------------------------------------------------------- */
  function eachSeries(fn) {
    var charts = [];
    try {
      if (App.ChartFont && typeof App.ChartFont.getCharts === "function") {
        charts = App.ChartFont.getCharts() || [];
      }
    } catch (e) {
      return 0;
    }
    var touched = 0;
    for (var c = 0; c < charts.length; c++) {
      var panes;
      try {
        if (typeof charts[c].panes !== "function") continue;
        panes = charts[c].panes();
      } catch (e) {
        continue;
      }
      for (var p = 0; p < panes.length; p++) {
        var list;
        try {
          if (typeof panes[p].getSeries !== "function") continue;
          list = panes[p].getSeries();
        } catch (e) {
          continue;
        }
        for (var s = 0; s < list.length; s++) {
          try {
            if (fn(list[s])) touched++;
          } catch (e) {
            /* 시리즈 하나가 말썽이어도 나머지는 계속 비웁니다 */
          }
        }
      }
    }
    return touched;
  }

  function clearAllSeries() {
    return eachSeries(function (series) {
      var d = series.data();
      if (!d || !d.length) return false;
      series.setData([]);
      return true;
    });
  }

  /** 차트에 남아 있는 점의 총개수 — "확실히 비웠다" 를 숫자로 보일 때 씁니다. */
  function countPoints() {
    var total = 0;
    eachSeries(function (series) {
      var d = series.data();
      total += d ? d.length : 0;
      return false;
    });
    return total;
  }

  /* -----------------------------------------------------------------------
   * 2) 철 지난 과거봉 응답 막기 — App.Api.fetchKlines 감싸기
   * --------------------------------------------------------------------- */
  function wrapFetchKlines() {
    if (!App.Api || typeof App.Api.fetchKlines !== "function") return false;
    if (App.Api.fetchKlines.__symbolSwitchWrapped) return true;

    var orig = App.Api.fetchKlines;

    function wrapped(symbol, interval, limit, endTime) {
      var args = arguments;

      /* ── 이어붙이기(js/chart.js:369 loadMoreHistory) ────────────────── */
      if (endTime) {
        if (symbol !== loadedSymbol) {
          /* 이 종목의 최초 로딩이 아직 안 끝났습니다. 지금 받아오면
             js/chart.js 의 allCandles 앞에 다른 종목 봉이 붙습니다.
             거절하면 js/chart.js:372 catch 가 isLoadingMore 를 풀어줍니다. */
          stats.blockedMore++;
          return Promise.reject(new Error(STALE_MARK + " (이어붙이기 차단: " + symbol + ")"));
        }
        return orig.apply(App.Api, args).then(function (rows) {
          if (symbol !== activeSymbol() || symbol !== loadedSymbol) {
            stats.staleMore++;
            throw new Error(STALE_MARK + " (이어붙이기 응답: " + symbol + ")");
          }
          return rows;
        });
      }

      /* ── 최초 로딩(js/chart.js:305 loadHistory) ─────────────────────── */
      return orig.apply(App.Api, args).then(
        function (rows) {
          if (symbol !== activeSymbol()) {
            /* 돌아오는 사이에 종목이 또 바뀌었습니다. 거절하면 js/chart.js:315
               catch 가 화면을 "과거 캔들 조회 실패" 로 바꿔버리므로, 거절하지
               않고 영원히 안 끝나는 약속으로 조용히 버립니다. */
            stats.droppedFull++;
            return new Promise(function () {});
          }
          loadedSymbol = symbol; // 이제부터 이 종목은 이어붙이기 허용
          return rows;
        },
        function (err) {
          /* 최초 로딩이 실패하면 js/chart.js 의 allCandles 에는 이전 종목이
             그대로 남아 있습니다. 이어붙이기를 계속 막아야 그 배열 앞에
             새 종목 봉이 붙는 사고가 안 납니다. */
          if (symbol === activeSymbol()) loadedSymbol = null;
          throw err;
        }
      );
    }

    wrapped.__symbolSwitchWrapped = true;
    App.Api.fetchKlines = wrapped;
    return true;
  }

  /* -----------------------------------------------------------------------
   * 신호 받기
   * --------------------------------------------------------------------- */
  function onSymbolChange(payload) {
    var next = payload && payload.symbol ? payload.symbol : activeSymbol();
    loadedSymbol = null; // 새 종목의 최초 로딩이 성공할 때까지 이어붙이기 잠금
    var n = clearAllSeries();
    stats.cleared++;
    stats.clearedSeries += n;
    stats.lastSymbol = next;
    stats.lastClearedSeries = n;
  }

  function onIntervalChange() {
    /* 봉 간격이 바뀌면 js/chart.js 가 과거를 처음부터 다시 받습니다.
       그 사이 이어붙이기가 끼어들면 1분봉과 1시간봉이 섞입니다.
       종목이 바뀐 게 아니므로 시리즈는 비우지 않습니다(지표가 그대로
       다시 맞춰집니다 — 원래 동작). 빗장만 잠갔다가 곧 풀립니다. */
    loadedSymbol = null;
  }

  var bound = false;
  function bindBus() {
    if (bound) return false;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("symbol:change", onSymbolChange);
    App.Bus.on("interval:change", onIntervalChange);
    bound = true;
    return true;
  }

  function init() {
    wrapFetchKlines();
    bindBus();
  }

  /* App.Api 와 App.Bus 는 이 파일보다 먼저 실립니다(index.html 순서).
     그래도 확실히 하려고, 아직 없으면 잠깐만 기다렸다 다시 겁니다. */
  (function boot() {
    var okApi = wrapFetchKlines();
    var okBus = bindBus();
    if (okApi && okBus) return;
    var tries = 0;
    var timer = setInterval(function () {
      var a = wrapFetchKlines();
      var b = bindBus();
      if ((a && b) || ++tries > 200) clearInterval(timer); /* 10초까지만 */
    }, 50);
  })();

  return {
    init: init,
    /* 확인용 — 테스트와 실측에서 그대로 씁니다 */
    getStats: function () {
      var out = {};
      for (var k in stats) out[k] = stats[k];
      out.loadedSymbol = loadedSymbol;
      return out;
    },
    getLoadedSymbol: function () {
      return loadedSymbol;
    },
    countPoints: countPoints,
    clearAllSeries: clearAllSeries,
    onSymbolChangeForTest: onSymbolChange,
    STALE_MARK: STALE_MARK,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChartSymbolSwitch;
