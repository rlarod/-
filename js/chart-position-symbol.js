/* =========================================================================
 * js/chart-position-symbol.js — App.ChartPositionSymbol
 * =========================================================================
 * "지금 보고 있는 차트의 종목" 과 "포지션의 종목" 이 다르면
 * 포지션 가로선(진입가 · TP · SL · 청산가 · 미체결)을 그리지 않습니다.
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────────────
 * js/chart.js:454(진입가) :464(TP) :474(SL) 는 trading:update 의 position 을
 * 그대로 그립니다. 종목을 보지 않습니다.
 * js/trading.js 의 position 객체에는 애초에 symbol 칸이 없습니다(거래엔진은
 * 종목을 모릅니다). 그래서 삼성전자(193 USDT) 캔들 위에 비트코인 78,000 짜리
 * 가로선이 그대로 붙습니다.
 * 지금은 축 자동맞춤 범위 밖이라 평소엔 화면 밖이지만, 회원이 가격축을
 * 잡아 늘리면 나타납니다. 그리고 "포지션을 든 채 다른 종목 차트 보기" 가
 * 열리는 순간 정면으로 드러납니다.
 *
 * ── js/chart.js 를 한 글자도 안 고칩니다 ──────────────────────────────
 * chart.js 의 세 선은 손잡이가 그 파일 클로저 안에 있어서 밖에서 못 잡습니다.
 * 대신 만들어지는 순간을 가로채서 손잡이를 붙잡아 둡니다.
 *   LightweightCharts.createChart 를 감싼다   (js/chart-font.js 와 같은 방식)
 *     -> chart.addSeries 를 감싼다
 *       -> 캔들 시리즈의 createPriceLine 을 감싼다
 * 제목(title)이 "롱 진입가" / "숏 진입가" / "TP" / "SL" 인 것만 붙잡습니다.
 * chart.js 는 수정 금지 파일이라 이 글자가 바뀔 일이 없습니다.
 * 현재가 선(title 이 "" — js/chart.js:412)과 다른 모듈이 만드는 선은
 * 붙잡지 않습니다.
 *
 * ── 지우지 않고 "숨깁니다" ────────────────────────────────────────────
 * removePriceLine 으로 지워버리면 종목이 돌아왔을 때 chart.js 가 다시
 * 그려주지 않습니다. chart.js:449 의 trackedPositionMarker 가 이미 그
 * 포지션으로 채워져 있어 "다시 그릴 필요 없음" 으로 건너뛰기 때문입니다.
 * 그래서 선은 그대로 두고 보이지만 않게 합니다 —
 *   숨길 때   lineVisible:false · axisLabelVisible:false · 색을 투명으로
 *   되돌릴 때 처음 받았던 옵션(색 · 라벨)을 그대로 다시 넣습니다
 * 종목이 같을 때는 아무것도 건드리지 않으므로 화면이 한 픽셀도 안 바뀝니다.
 *
 * ── 포지션의 종목은 어디서 아나 — 이미 있는 것을 씁니다 ───────────────
 * js/trading.js 의 position 에는 symbol 칸이 없지만, js/symbol-guard.js 가
 * 포지션이 생길 때 딱 한 번 도장을 찍어 넣습니다(stamp / stampLazy —
 * 값이 이미 있으면 건너뛰므로 나중에 바뀌지 않습니다).
 *
 *     snapshot.position.symbol       <- 1순위
 *     snapshot.pendingOrder.symbol   <- 2순위
 *
 * 이 값은 js/symbol-guard.js 의 "3) 그물" 이 거래엔진에 넘길 시세를 고를 때
 * 쓰는 값과 같습니다(needFrom / passes). 그래서 차트에 그리는 기준과
 * 엔진이 계산하는 기준이 언제나 하나로 붙어 있습니다.
 * 우리가 따로 적어두면 기준이 두 벌이 되어 서로 어긋날 수 있습니다.
 *
 * !! App.SymbolGuard.rememberedSymbol() 을 쓰면 안 됩니다.
 *    그 값은 "마지막으로 바꾼 종목" 이라 차트만 옮겨 봐도 따라 바뀝니다.
 *
 * !! 도장이 없으면(예: symbol-guard 를 뺐을 때) 아무것도 숨기지 않습니다.
 *    "모르면 지금까지 하던 대로" 가 안전한 쪽입니다.
 *
 * ── 오늘은 화면이 안 바뀝니다 ─────────────────────────────────────────
 * 지금은 포지션을 들면 종목 전환이 막히므로(js/symbol-guard.js) 두 종목이
 * 언제나 같습니다. 즉 이 파일은 오늘 아무것도 숨기지 않습니다.
 * "포지션 든 채 다른 차트 보기" 가 열리는 날에만 작동합니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * trading:update 는 초당 수 회 옵니다. 하는 일은 스냅샷에서 symbol 을 읽어
 * 직전 값과 비교하는 것뿐이고, 같으면 그대로 돌아갑니다. 새로 만드는
 * 객체도 문자열도 없고, 저장소도 읽지 않습니다.
 * 실측(1920, 2026-08-27) — trading:update 한 번 방송에 걸리는 시간
 *   이 모듈 없음  0.983 / 1.011 / 0.943 ms
 *   이 모듈 있음  1.134 / 1.018 / 0.895 ms
 * 회차별 흔들림보다 작아서 차이가 잡히지 않습니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * index.html 의 <script src="js/chart-position-symbol.js"></script> 한 줄을
 * 지우면 완전히 원래대로 돌아갑니다(선이 다시 종목을 안 보게 됩니다).
 * js/chart-position-lines.js 쪽 되돌리기는 그 파일 주석을 보세요.
 * ========================================================================= */

window.App = window.App || {};

App.ChartPositionSymbol = (function () {
  "use strict";

  /* js/chart.js 가 포지션 선에 붙이는 제목. 이 넷만 붙잡습니다. */
  var POSITION_TITLES = { "롱 진입가": 1, "숏 진입가": 1, TP: 1, SL: 1 };

  var DEFAULT_SYMBOL = "BTCUSDT";

  /* 숨길 때 쓰는 투명색. lineVisible 을 못 알아듣는 판이라도 이걸로 사라집니다. */
  var TRANSPARENT = "rgba(0,0,0,0)";

  var tracked = []; // { line, color, axisLabelVisible, hidden }
  var posSymbol = null; // 포지션의 종목 (모르면 null)
  var testOverride = null; // 점검용으로 손으로 넣은 값
  var hiddenNow = false; // 지금 숨겨 놓은 상태인가
  var stats = { hidden: 0, shown: 0, tracked: 0, changed: 0 };

  /* ------------------------------------------------------------------
   * 종목 읽기
   * ------------------------------------------------------------------ */
  function activeSymbol() {
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try {
        return App.Config.getActiveSymbol();
      } catch (e) {
        /* noop */
      }
    }
    return DEFAULT_SYMBOL;
  }

  /* js/symbol-guard.js 가 찍어 둔 도장을 읽습니다. 없으면 null. */
  function symbolOf(snap) {
    if (!snap) return null;
    var p = snap.position;
    if (p && typeof p.symbol === "string" && p.symbol) return p.symbol;
    var o = snap.pendingOrder;
    if (o && typeof o.symbol === "string" && o.symbol) return o.symbol;
    return null;
  }

  /* 차트 종목과 포지션 종목이 같은가.
     모르면(포지션이 없거나 도장이 안 찍혔으면) "같다" 로 봅니다 —
     그릴 선이 없거나, 판단할 근거가 없으면 지금까지 하던 대로 둡니다. */
  function matches() {
    var sym = testOverride !== null ? testOverride : posSymbol;
    if (!sym) return true;
    return sym === activeSymbol();
  }

  /* ------------------------------------------------------------------
   * chart.js 가 만든 선 붙잡기
   * ------------------------------------------------------------------ */
  function untrack(line) {
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].line === line) {
        tracked.splice(i, 1);
        return;
      }
    }
  }

  function applyOne(t, hide) {
    if (t.hidden === hide) return;
    try {
      if (hide) {
        t.line.applyOptions({ lineVisible: false, axisLabelVisible: false, color: TRANSPARENT });
        stats.hidden++;
      } else {
        t.line.applyOptions({
          lineVisible: true,
          axisLabelVisible: t.axisLabelVisible,
          color: t.color,
        });
        stats.shown++;
      }
      t.hidden = hide;
    } catch (e) {
      /* 이미 지워진 선이면 목록에서 뺍니다 */
      untrack(t.line);
    }
  }

  function track(line, opts) {
    if (!line) return;
    for (var i = 0; i < tracked.length; i++) {
      if (tracked[i].line === line) return;
    }
    var rec = {
      line: line,
      color: opts && opts.color,
      axisLabelVisible: !!(opts && opts.axisLabelVisible),
      hidden: false,
    };
    tracked.push(rec);
    stats.tracked++;
    /* 지금 다른 종목을 보고 있으면 그려지자마자 숨깁니다(한 프레임도 안 보이게). */
    if (hiddenNow) applyOne(rec, true);
  }

  /* 종목 상태가 바뀌었을 때만 손댑니다. */
  function refresh(force) {
    var hide = !matches();
    if (!force && hide === hiddenNow) return;
    hiddenNow = hide;
    for (var i = tracked.length - 1; i >= 0; i--) applyOne(tracked[i], hide);

    /* 우리 모듈이 그리는 선(청산가·미체결)도 같이 다시 판단하게 합니다. */
    if (App.ChartPositionLines && typeof App.ChartPositionLines.apply === "function") {
      try {
        App.ChartPositionLines.apply(
          App.Trading && typeof App.Trading.getSnapshot === "function"
            ? App.Trading.getSnapshot()
            : null
        );
      } catch (e) {
        /* noop */
      }
    }
  }

  /* ------------------------------------------------------------------
   * 라이브러리 감싸기 — js/chart.js 앞에서 실려야 합니다
   * ------------------------------------------------------------------ */
  var patched = false;

  function hookSeries(s) {
    if (!s || typeof s.createPriceLine !== "function") return s;
    if (s.__posSymbolHooked) return s;
    try {
      if (typeof s.seriesType === "function" && s.seriesType() !== "Candlestick") return s;
    } catch (e) {
      /* 종류를 못 읽으면 그냥 겁니다 — 제목으로 한 번 더 거릅니다 */
    }

    var origCreate = s.createPriceLine;
    var origRemove = s.removePriceLine;

    s.createPriceLine = function (opts) {
      var line = origCreate.apply(this, arguments);
      try {
        if (opts && POSITION_TITLES[opts.title]) track(line, opts);
      } catch (e) {
        /* noop — 선 자체는 정상입니다 */
      }
      return line;
    };
    if (typeof origRemove === "function") {
      s.removePriceLine = function (line) {
        try {
          untrack(line);
        } catch (e) {
          /* noop */
        }
        return origRemove.apply(this, arguments);
      };
    }
    s.__posSymbolHooked = true;
    return s;
  }

  function hookChart(chart) {
    if (!chart || typeof chart.addSeries !== "function") return chart;
    if (chart.__posSymbolHooked) return chart;
    var origAdd = chart.addSeries;
    chart.addSeries = function () {
      var s = origAdd.apply(this, arguments);
      try {
        hookSeries(s);
      } catch (e) {
        /* noop */
      }
      return s;
    };
    chart.__posSymbolHooked = true;
    return chart;
  }

  function patch() {
    if (patched) return true;
    var LC = window.LightweightCharts;
    if (!LC || typeof LC.createChart !== "function") return false;

    var origCreate = LC.createChart;
    var wrapped = function () {
      var chart = origCreate.apply(LC, arguments);
      try {
        hookChart(chart);
      } catch (e) {
        /* noop — 차트 자체는 정상입니다 */
      }
      return chart;
    };

    /* 라이브러리 객체는 동결돼 있어 대입이 안 됩니다.
       js/chart-font.js 와 같이 원본을 프로토타입 삼은 새 객체로 가립니다.
       chart-font.js 가 이미 한 번 가려 놨으면 그 위에 한 겹 더 얹습니다. */
    try {
      var proxy = Object.create(LC);
      Object.defineProperty(proxy, "createChart", {
        value: wrapped,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      window.LightweightCharts = proxy;
    } catch (e) {
      console.warn("[chart-position-symbol.js] 라이브러리를 감싸지 못했습니다:", e);
      return false;
    }
    patched = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 포지션의 종목 적어두기
   * ------------------------------------------------------------------ */
  /* 틱마다 불립니다. 값이 그대로면 문자열 비교 한 번에서 끝납니다 —
     새로 만드는 객체도 문자열도 없습니다. */
  function onTradingUpdate(snap) {
    var sym = symbolOf(snap);
    if (sym === posSymbol) return;
    posSymbol = sym;
    stats.changed++;
    refresh();
  }

  /* ------------------------------------------------------------------ */
  function init() {
    patch();
    if (!App.Bus || typeof App.Bus.on !== "function") return;

    App.Bus.on("trading:update", onTradingUpdate);
    App.Bus.on("trading:persisted", onTradingUpdate);
    App.Bus.on("symbol:change", function () {
      refresh();
    });

    /* 부팅 직후 스냅샷이 이미 있으면 한 번 맞춰둡니다. */
    try {
      if (App.Trading && typeof App.Trading.getSnapshot === "function") {
        onTradingUpdate(App.Trading.getSnapshot());
      }
    } catch (e) {
      /* noop */
    }
  }

  /* 감싸기는 js/chart.js 가 차트를 만들기 전이어야 하므로 읽는 즉시 겁니다. */
  if (!patch()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patch() || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    matches: matches,
    getPositionSymbol: function () {
      return posSymbol;
    },
    isHidden: function () {
      return hiddenNow;
    },
    getTrackedCount: function () {
      return tracked.length;
    },
    getStats: function () {
      return {
        hidden: stats.hidden,
        shown: stats.shown,
        tracked: stats.tracked,
        changed: stats.changed,
      };
    },
    refresh: refresh,
    /* 점검용 — chart.js 가 그린 선들이 지금 어떤 상태인지 그대로 읽습니다. */
    getTrackedForTest: function () {
      return tracked.map(function (t) {
        var o = null;
        try {
          o = typeof t.line.options === "function" ? t.line.options() : null;
        } catch (e) {
          /* noop */
        }
        return {
          hidden: t.hidden,
          title: o && o.title,
          price: o && o.price,
          color: o && o.color,
          lineVisible: o && o.lineVisible,
          axisLabelVisible: o && o.axisLabelVisible,
        };
      });
    },
    /* 점검용 — 포지션 종목을 손으로 넣어 봅니다.
       null 을 넣으면 다시 스냅샷의 도장을 따릅니다. */
    _setPositionSymbolForTest: function (sym) {
      testOverride = sym || null;
      refresh(true);
      return testOverride !== null ? testOverride : posSymbol;
    },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChartPositionSymbol;
