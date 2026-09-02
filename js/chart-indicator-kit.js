/* =========================================================================
 * js/chart-indicator-kit.js - App.ChartIndicatorKit   (지표 틀)
 * =========================================================================
 * 지표를 "정의 1개 + 인스턴스 N개" 로 얹는 틀입니다.
 *
 * -- 왜 이 모양인가 (2026-09-02 트레이딩뷰 실측) -----------------------
 * 트레이딩뷰 범례를 세었더니 이랬습니다.
 *     "MA 7 close 0"  "MA 25 close 0"  "MA 99 close 0"  "Volume"
 * MA7 · MA25 · MA99 는 서로 다른 지표가 아닙니다. "MA" 라는 정의 하나를
 * 기간만 달리해 세 번 얹은 것입니다. 각 줄마다 따로 숨기고 · 설정하고 ·
 * 지울 수 있고, 더보기 메뉴에 Move to(어느 칸으로) 까지 있습니다.
 *
 * 그래서 이 틀은 둘로 나눕니다.
 *     define(정의)        계산식. 프로그래머가 한 번 적습니다
 *     addInstance(정의id) 그 정의를 실제로 화면에 얹은 것 하나.
 *                         기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다
 *
 * -- 왜 틀이 먼저인가 (2026-09-02 실측) -------------------------------
 *   지표 하나 늘리는 데 손대야 할 곳   17군데
 *     js/chart-indicators.js 안에만 14군데("ma7" 이 글자로 박힌 줄)
 *   지표 하나 껐다 켜는 시간           MA7 6.51ms / MACD 3.36ms (봉 1006개)
 * 6.51ms 인 이유는 redrawAll() 이 "켠 지표 하나" 가 아니라 "켜진 것 전부" 를
 * 다시 계산하기 때문입니다. 트레이딩뷰만큼(내장 127개) 채우면 같은 방식으로
 * 한 번 누를 때마다 수백 ms - 화면 한 장이 16.7ms 이니 못 씁니다.
 * 이 틀은 "켠 인스턴스 하나만" 다시 계산합니다.
 *
 * -- 기존 7개는 한 글자도 안 건드렸습니다 -----------------------------
 * js/chart-indicators.js (MA7 · MA25 · MA99 · 볼린저 · 거래량)
 * js/chart-oscillators.js (RSI · MACD)
 * js/chart-indicator-menu.js (fx 목록)
 * 셋 다 그대로입니다. 이 파일을 지우면 어제 화면 그대로 돌아갑니다.
 *
 * -- js/chart.js 도 한 글자도 안 건드렸습니다 -------------------------
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두었기 때문에
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 캔들 · 거래량 시리즈는
 * 공개 API 인 chart.panes()[n].getSeries() 로 찾습니다.
 * 1~4단계와 같은 방식입니다.
 *
 * -- 틀이 강제하는 것 (조용히 넘어가지 않고 등록을 거부합니다) --------
 *   1) step 이 없으면 거부
 *      step 은 "마지막 봉 하나만 O(1) 로 갱신" 하는 함수입니다. 이게 없으면
 *      틱마다 전체를 다시 계산하는 지표가 되어 화면이 버벅입니다.
 *      나중에 누가 그런 지표를 몰래 끼워 넣지 못하게 틀에서 막습니다.
 *   2) seed 가 없으면 거부 (켤 때 한 번 전체 계산)
 *   3) 지표선 색 목록 밖의 색이면 거부 (아래 LINE_COLORS)
 *   4) id 가 겹치면 거부
 *
 * -- 계산이 한 곳에만 있게 --------------------------------------------
 * 봉 데이터(시각 · 시가 · 고가 · 저가 · 종가 · 거래량)는 이 파일 안에 딱
 * 한 벌만 있습니다(BarStore). 인스턴스는 그걸 읽기만 합니다. 인스턴스를
 * 100개 얹어도 배열은 한 벌이고 감시 타이머도 하나입니다.
 * 값 자체(청산가 · 손익)는 지금처럼 App.Trading 에서만 읽습니다. 이 틀은
 * 시세만 씁니다.
 *
 * -- 꺼져 있으면 계산도 하지 않습니다 ---------------------------------
 * 켜진 인스턴스가 하나도 없으면 onTick() 첫 줄에서 바로 돌아갑니다.
 * 봉 배열도 만들지 않고 감시 타이머도 안 돕니다. 기본은 전부 꺼짐입니다.
 *
 * -- fx 목록에 어떻게 끼어드나 ----------------------------------------
 * js/chart-indicator-menu.js 를 고치지 않고 두 가지만 합니다.
 *   1) App.ChartIndicators.isOn / .toggle 을 감쌉니다(함수 감싸기 패턴).
 *      목록이 mod(who).isOn(key) 로 물어보는데, 우리 인스턴스 id 면 우리가
 *      답하고 아니면 원래 함수에 그대로 넘깁니다.
 *      - 그래서 점 색 · 스위치 · 눌림 표시가 저쪽 코드로 그대로 그려집니다.
 *        우리가 CSS 를 다시 적지 않습니다(같은 값이 두 곳에 생기지 않게).
 *   2) 목록 창이 열리면 MutationObserver 로 우리 줄을 이어 붙입니다.
 * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 세기 때문에 우리
 * 것을 못 셉니다. 그대로 두면 화면이 사실과 달라지므로(EMA 를 켰는데
 * "켜진 지표 0개"), 우리가 화면에 있는 줄을 다시 세어 고쳐 적습니다.
 *
 * -- 되돌리기 ---------------------------------------------------------
 *   1) index.html 의 <script src="js/chart-indicator-kit.js"></script> 한 줄 삭제
 *   2) js/chart-indicator-kit.js 파일 삭제
 *   3) (테스트가 생겼다면) package.json 과 tests/_order.txt 의 해당 토막 삭제
 * 이 파일은 다른 파일을 하나도 고치지 않습니다. 지우면 원래 화면 그대로입니다.
 * (회원 브라우저에 남는 기록은 btc_sim_v2_chart-indicator-kit 키라
 *  그냥 남아 있어도 아무 동작도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorKit = (function () {
  "use strict";

  /* =====================================================================
   * 지표선 색 목록 - 여기 한 곳에만 적습니다. 두 벌 금지.
   *
   * 확정 팔레트 9색은 그대로입니다. 이건 "지표선 전용 색 목록" 하나를
   * 새로 만든 것이고, 2026-09-02 대표 승인 사항입니다.
   *
   * 고른 방법 - 눈대중이 아니라 계산해서 골랐습니다.
   *   조건 1  배경 #0A0F1C 과의 명암비 4.5 이상        (실측 최소 4.52)
   *   조건 2  색끼리 CIE Lab 거리 22 이상              (실측 최소 29.6)
   *   조건 3  상승 #26C281 · 하락 #F0506E 와 45 이상   (실측 최소 46.4)
   *   조건 4  초록 구간(색상 100~185도)과 빨강 구간(330~18도)은 아예 제외
   *           - 거리 숫자만 보면 순수 초록 · 빨강도 통과합니다. 그런데 그건
   *             회원이 손익 색으로 읽습니다. 그래서 색상환에서 막았습니다.
   *   조건 5  앞의 셋은 지금 쓰는 값 그대로 - 대표가 매일 보시던
   *           MA7 · MA25 · MA99 색이 갑자기 바뀌면 안 됩니다.
   *
   * 2026-08-31 에 시세선과 MA7 이 둘 다 금색이라 회원 화면의 62.7% 에서
   * 한 줄로 보였던 일이 있습니다. 그래서 색만이 아니라 선 모양(solid /
   * dashed / dotted)도 같이 골라 쓸 수 있게 했습니다.
   * ===================================================================== */
  var LINE_COLORS = [
    { key: "gold", hex: "#F0B429", name: "금색" },   /* 지금 MA(7) 색 */
    { key: "white", hex: "#E7ECF5", name: "흰색" },  /* 지금 MA(25) 색 */
    { key: "gray", hex: "#838DA4", name: "회색" },   /* 지금 MA(99) 색 */
    { key: "orange", hex: "#FF8F3C", name: "주황" },
    { key: "brown", hex: "#B99264", name: "갈색" },
    { key: "cream", hex: "#E1ED97", name: "연노랑" },
    { key: "sky", hex: "#49C9E9", name: "하늘" },
    { key: "blue", hex: "#499EE9", name: "파랑" },
    { key: "navy", hex: "#4974E9", name: "남색" },
    { key: "purple", hex: "#BA6EED", name: "보라" },
    { key: "magenta", hex: "#E637E6", name: "자홍" },
    { key: "pink", hex: "#F292DE", name: "분홍" }
  ];

  /* 눈금 · 안내선용. 값이 아니라 배경이라 팔레트 테두리색을 씁니다. */
  var GUIDE_COLOR = "#1D273B";

  function colorHexes() {
    return LINE_COLORS.map(function (c) {
      return c.hex;
    });
  }

  var ALLOWED_STYLES = ["solid", "dashed", "dotted"];
  var ALLOWED_KINDS = ["line", "hist"];
  var ALLOWED_PANES = ["main", "sub"];

  var DEFAULT_WIDTH = 1;   /* 바이낸스 · 트레이딩뷰 기본 굵기와 같은 1px */
  var PANE_RATIO = 0.32;   /* 아래 별도 칸 높이 비율 - 3단계와 같은 값 */

  var STORAGE_KEY = "chart-indicator-kit";
  var STORE_VERSION = 1;

  /* =====================================================================
   * 1. 정의 등록소 - 계산식은 여기에 한 번만
   * ===================================================================== */
  var defs = {};
  var defOrder = [];

  function isFn(v) {
    return typeof v === "function";
  }

  function copy(o) {
    var out = {};
    for (var k in o) out[k] = o[k];
    return out;
  }

  /**
   * 지표 정의 하나를 등록합니다. (계산식. 화면에 얹는 것은 addInstance)
   *
   *   id       "ema" 처럼 겹치지 않는 이름
   *   name     "EMA"            인스턴스 이름은 nameOf() 가 만듭니다
   *   note     "지수이동평균"    한 줄 설명
   *   pane     "main" | "sub"    기본으로 어디에 그릴지 (인스턴스가 덮어씀)
   *   params   { p: 9 }          설정값 기본치
   *   outputs  [{ key, kind:"line"|"hist", color, style }]
   *   nameOf(params) -> "EMA(9)"        (없으면 name 그대로)
   *   seed(bars, params, capture) -> { <outKey>: [{time,value}] }
   *            켤 때 한 번. 전체를 계산합니다.
   *            capture.state 에 "마지막으로 닫힌 봉까지의 상태" 를 넣어 줍니다.
   *   step(state, bar, params) -> { values: {<outKey>:숫자}, state: 다음상태 }
   *            틱마다. 마지막 봉 하나만. 반드시 O(1) 이어야 합니다.
   *
   * 등록되면 true, 거부되면 false (이유는 콘솔에 적습니다)
   */
  function define(def) {
    function no(why) {
      console.warn("[chart-indicator-kit] 정의 등록을 거부했습니다 - " + why, def);
      return false;
    }

    if (!def || typeof def !== "object") return no("정의가 객체가 아닙니다");
    if (!def.id || typeof def.id !== "string") return no("id 가 없습니다");
    if (defs[def.id]) return no("id 가 이미 있습니다: " + def.id);
    if (!def.name || typeof def.name !== "string") return no("name 이 없습니다: " + def.id);
    if (ALLOWED_PANES.indexOf(def.pane) < 0) return no("pane 은 main 또는 sub 여야 합니다: " + def.id);

    /* seed 와 step 은 둘 다 필수입니다.
       step 이 없으면 틱마다 전체를 다시 계산하게 되어 화면이 버벅입니다. */
    if (!isFn(def.seed)) return no("seed 가 없습니다(켤 때 전체 계산): " + def.id);
    if (!isFn(def.step)) return no("step 이 없습니다(틱마다 마지막 봉만 O(1) 갱신): " + def.id);

    if (!def.outputs || !def.outputs.length) return no("outputs 가 비었습니다: " + def.id);

    var hexes = colorHexes();
    for (var i = 0; i < def.outputs.length; i++) {
      var o = def.outputs[i];
      if (!o || !o.key) return no("outputs[" + i + "].key 가 없습니다: " + def.id);
      if (ALLOWED_KINDS.indexOf(o.kind || "line") < 0) return no("kind 는 line 또는 hist: " + def.id);
      if (hexes.indexOf(o.color) < 0) {
        return no(
          "지표선 색 목록에 없는 색입니다(" + o.color + "). 색을 늘리려면 LINE_COLORS 에 " +
          "추가하고 배경 대비 · 색끼리 거리를 다시 재야 합니다: " + def.id
        );
      }
      if (o.style && ALLOWED_STYLES.indexOf(o.style) < 0) return no("style 은 solid/dashed/dotted: " + def.id);
    }

    defs[def.id] = {
      id: def.id,
      name: def.name,
      note: def.note || "",
      pane: def.pane,
      params: def.params || {},
      outputs: def.outputs,
      nameOf: isFn(def.nameOf) ? def.nameOf : null,
      seed: def.seed,
      step: def.step
    };
    defOrder.push(def.id);
    return true;
  }

  function listDefs() {
    return defOrder.map(function (id) {
      var d = defs[id];
      return { id: d.id, name: d.name, note: d.note, pane: d.pane, params: copy(d.params) };
    });
  }

  /* =====================================================================
   * 2. 인스턴스 - "그 정의를 실제로 얹은 것 하나"
   *    기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다.
   * ===================================================================== */
  var insts = {};      /* instId -> 인스턴스 */
  var instOrder = [];
  var instSeq = 0;

  function nameOfInst(inst) {
    var d = defs[inst.def];
    if (!d) return inst.def;
    if (d.nameOf) {
      try {
        return d.nameOf(inst.params);
      } catch (e) {
        /* 이름을 못 만들면 정의 이름 그대로 */
      }
    }
    return d.name;
  }

  /**
   * 정의를 화면에 하나 얹습니다.
   *   defId  "ema"
   *   opts   { id, params:{p:9}, colors:{ema:"#49C9E9"}, style, width, pane, on }
   * 돌려주는 값 - 만들어진 인스턴스 id (실패하면 null)
   */
  function addInstance(defId, opts) {
    var d = defs[defId];
    if (!d) {
      console.warn("[chart-indicator-kit] 그런 정의가 없습니다: " + defId);
      return null;
    }
    opts = opts || {};

    var id = opts.id || defId + "-" + ++instSeq;
    if (insts[id]) {
      console.warn("[chart-indicator-kit] 인스턴스 id 가 이미 있습니다: " + id);
      return null;
    }

    var params = copy(d.params);
    var k;
    if (opts.params) for (k in opts.params) params[k] = opts.params[k];

    /* 색 - 정의의 기본색에서 시작하고, 인스턴스가 골랐으면 그걸 씁니다.
       목록 밖의 색은 조용히 넘어가지 않고 기본색으로 되돌리며 알립니다. */
    var hexes = colorHexes();
    var colors = {};
    d.outputs.forEach(function (o) {
      var want = opts.colors && opts.colors[o.key];
      if (want && hexes.indexOf(want) < 0) {
        console.warn("[chart-indicator-kit] 지표선 색 목록에 없는 색이라 기본색을 씁니다: " + want);
        want = null;
      }
      colors[o.key] = want || o.color;
    });

    var style = ALLOWED_STYLES.indexOf(opts.style) >= 0 ? opts.style : null;
    var pane = ALLOWED_PANES.indexOf(opts.pane) >= 0 ? opts.pane : d.pane;

    insts[id] = {
      id: id,
      def: defId,
      params: params,
      colors: colors,
      style: style,          /* null 이면 정의의 outputs[].style 을 씁니다 */
      width: opts.width || DEFAULT_WIDTH,
      pane: pane,
      on: !!opts.on,
      live: null
    };
    instOrder.push(id);
    return id;
  }

  function removeInstance(id) {
    if (!insts[id]) return false;
    turnOff(id);
    delete insts[id];
    var i = instOrder.indexOf(id);
    if (i >= 0) instOrder.splice(i, 1);
    saveState();
    dropButton(id);
    dropMenuRow(id);
    return true;
  }

  function listInstances() {
    return instOrder.map(function (id) {
      var it = insts[id];
      return {
        id: it.id,
        def: it.def,
        name: nameOfInst(it),
        note: defs[it.def] ? defs[it.def].note : "",
        params: copy(it.params),
        colors: copy(it.colors),
        style: it.style,
        width: it.width,
        pane: it.pane,
        on: it.on
      };
    });
  }

  /** 인스턴스의 대표색 - 목록의 점 색으로 씁니다(첫 번째 선). */
  function mainColor(it) {
    var d = defs[it.def];
    if (!d) return LINE_COLORS[0].hex;
    return it.colors[d.outputs[0].key] || d.outputs[0].color;
  }

  /* =====================================================================
   * 3. 봉 창고(BarStore) - 온 세상에 딱 한 벌
   * ===================================================================== */
  var bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
  var barsReady = false;
  var syncMark = { len: -1, first: null };

  function barAt(i) {
    return {
      time: bars.time[i],
      open: bars.open[i],
      high: bars.high[i],
      low: bars.low[i],
      close: bars.close[i],
      volume: bars.volume[i]
    };
  }

  function barCount() {
    return bars.time.length;
  }

  function clearBars() {
    bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
    barsReady = false;
    syncMark.len = -1;
    syncMark.first = null;
  }

  /** 캔들 시리즈에서 통째로 다시 읽어옵니다(켤 때 / 봉 간격 · 종목이 바뀔 때). */
  function syncBars() {
    if (!candleSeries) return false;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return false;
    }
    if (!data || !data.length) {
      clearBars();
      return false;
    }

    var n = data.length;
    var t = new Array(n), o = new Array(n), h = new Array(n);
    var l = new Array(n), c = new Array(n), v = new Array(n);
    var i;
    for (i = 0; i < n; i++) {
      t[i] = data[i].time;
      o[i] = data[i].open;
      h[i] = data[i].high;
      l[i] = data[i].low;
      c[i] = data[i].close;
      v[i] = 0;
    }

    /* 거래량은 별도 시리즈에 있습니다(chart.js 가 그렇게 만들었습니다).
       시각으로 맞춰 넣습니다. 못 읽으면 0 으로 둡니다 - 지금 등록된 EMA 는
       거래량을 안 쓰고, 나중에 쓰는 지표(OBV · MFI · VWAP)를 만들 때
       0 인지 먼저 확인하고 써야 합니다. */
    if (volumeSeries) {
      try {
        var vd = volumeSeries.data();
        if (vd && vd.length) {
          var map = {};
          for (i = 0; i < vd.length; i++) map[vd[i].time] = vd[i].value;
          for (i = 0; i < n; i++) {
            var got = map[t[i]];
            if (typeof got === "number") v[i] = got;
          }
        }
      } catch (e2) {
        /* 거래량을 못 읽으면 0 인 채로 둡니다 */
      }
    }

    bars.time = t;
    bars.open = o;
    bars.high = h;
    bars.low = l;
    bars.close = c;
    bars.volume = v;
    barsReady = true;
    syncMark.len = n;
    syncMark.first = t[0];
    return true;
  }

  /* =====================================================================
   * 4. 차트 · 시리즈 찾기 - chart.js 를 고치지 않고 공개 API 로만
   * ===================================================================== */
  var chart = null;
  var candleSeries = null;
  var volumeSeries = null;

  function LC() {
    return window.LightweightCharts;
  }

  function ensureChart() {
    if (chart && candleSeries) return true;
    if (!App.ChartFont || !isFn(App.ChartFont.getCharts)) return false;

    var charts = App.ChartFont.getCharts();
    if (!charts || !charts.length) return false;
    chart = charts[0];

    try {
      if (!isFn(chart.panes)) return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (!isFn(panes[i].getSeries)) continue;
        var arr = panes[i].getSeries();
        for (var j = 0; j < arr.length; j++) {
          var ty = arr[j].seriesType && arr[j].seriesType();
          if (ty === "Candlestick" && !candleSeries) candleSeries = arr[j];
          if (ty === "Histogram" && !volumeSeries) {
            try {
              if (arr[j].options().priceScaleId === "") volumeSeries = arr[j];
            } catch (e) {
              volumeSeries = arr[j];
            }
          }
        }
      }
    } catch (e2) {
      console.warn("[chart-indicator-kit] 시리즈를 찾지 못했습니다:", e2);
      return false;
    }
    return !!(chart && candleSeries);
  }

  /* =====================================================================
   * 5. 켜고 끄기 - 인스턴스 하나만 다시 계산합니다 (성능의 핵심)
   * ===================================================================== */
  var perf = { ticks: 0, totalMs: 0, maxMs: 0, seeds: 0, seedMs: 0, lastSeedMs: 0 };

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
  }

  function anyOn() {
    for (var i = 0; i < instOrder.length; i++) if (insts[instOrder[i]].on) return true;
    return false;
  }

  function styleOf(s) {
    var lc = LC();
    if (!lc || !lc.LineStyle) return 0;
    if (s === "dashed") return lc.LineStyle.Dashed;
    if (s === "dotted") return lc.LineStyle.Dotted;
    return lc.LineStyle.Solid;
  }

  function makePane() {
    var p = chart.addPane();
    try {
      var base = 1;
      var main = chart.panes()[0];
      if (main && isFn(main.getStretchFactor)) {
        var f = main.getStretchFactor();
        if (isFinite(f) && f > 0) base = f;
      }
      if (isFn(p.setStretchFactor)) p.setStretchFactor(base * PANE_RATIO);
    } catch (e) {
      /* 비율을 못 정하면 라이브러리 기본 높이로 둡니다 */
    }
    return p;
  }

  function addSeriesFor(it, out, pane) {
    var lc = LC();
    var kind = out.kind || "line";
    var opts = {
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: it.pane === "sub",
      crosshairMarkerVisible: false,
      color: it.colors[out.key] || out.color
    };
    if (kind === "line") {
      opts.lineWidth = it.width || DEFAULT_WIDTH;
      opts.lineStyle = styleOf(it.style || out.style);
    }
    var seriesDef = kind === "hist" ? lc.HistogramSeries : lc.LineSeries;

    if (pane && isFn(pane.addSeries)) return pane.addSeries(seriesDef, opts);
    if (pane && isFn(pane.paneIndex)) return chart.addSeries(seriesDef, opts, pane.paneIndex());
    return chart.addSeries(seriesDef, opts);
  }

  /** 인스턴스 하나를 그립니다. 다른 인스턴스는 건드리지 않습니다. */
  function turnOn(id) {
    var it = insts[id];
    if (!it || it.live) return;
    var d = defs[it.def];
    if (!d) return;
    if (!ensureChart()) return;
    if (!barsReady && !syncBars()) return;

    var n = barCount();
    if (!n) return;

    var t0 = now();

    /* 계산 먼저. 그려야 할 것이 없으면 시리즈도 만들지 않습니다. */
    var cap = {};
    var outData;
    try {
      outData = d.seed(bars, it.params, cap);
    } catch (e) {
      console.warn("[chart-indicator-kit] seed 가 실패했습니다: " + id, e);
      return;
    }
    if (!outData) return;

    var pane = it.pane === "sub" ? makePane() : null;
    var made = {};
    for (var i = 0; i < d.outputs.length; i++) {
      var out = d.outputs[i];
      try {
        made[out.key] = addSeriesFor(it, out, pane);
        made[out.key].setData(outData[out.key] || []);
      } catch (e2) {
        console.warn("[chart-indicator-kit] 선을 못 그렸습니다: " + id + "." + out.key, e2);
      }
    }

    it.live = {
      series: made,
      pane: pane,
      commit: cap.state || null,
      commitIdx: cap.state ? n - 2 : -1
    };

    var ms = now() - t0;
    perf.seeds++;
    perf.seedMs += ms;
    perf.lastSeedMs = ms;
  }

  /** 인스턴스 하나를 지웁니다. 선을 없애고 칸도 비면 없앱니다. */
  function turnOff(id) {
    var it = insts[id];
    if (!it || !it.live) return;
    var L = it.live;
    var k;
    for (k in L.series) {
      try {
        chart.removeSeries(L.series[k]);
      } catch (e) {
        /* 이미 없으면 무시 */
      }
    }
    /* 시리즈가 0개가 되면 라이브러리가 칸을 스스로 없앱니다.
       혹시 남아 있으면 직접 없앱니다(3단계에서 확인한 동작). */
    if (L.pane) {
      try {
        var idx = isFn(L.pane.paneIndex) ? L.pane.paneIndex() : -1;
        if (idx > 0 && isFn(L.pane.getSeries) && L.pane.getSeries().length === 0) {
          if (isFn(chart.removePane)) chart.removePane(idx);
        }
      } catch (e3) {
        /* 무시 */
      }
    }
    it.live = null;
  }

  /** 켜진 것 전부를 다시 그립니다(봉 간격 · 종목이 바뀌었을 때만). */
  function reseedAll() {
    var i;
    for (i = 0; i < instOrder.length; i++) turnOff(instOrder[i]);
    if (!anyOn()) {
      clearBars();
      stopTimer();
      return;
    }
    if (!ensureChart()) return;
    syncBars();
    if (!barsReady) return;
    for (i = 0; i < instOrder.length; i++) {
      if (insts[instOrder[i]].on) turnOn(instOrder[i]);
    }
  }

  /* =====================================================================
   * 6. 실시간 - 마지막 봉 하나만. 켜진 인스턴스만.
   * ===================================================================== */
  function onTick(payload) {
    /* 꺼져 있으면 여기서 끝 - 계산도 하지 않습니다 */
    if (!anyOn()) return;
    if (!payload || !payload.candle) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (!candleSeries) return;
    if (!barsReady && !syncBars()) return;

    var t0 = now();

    var c = payload.candle;
    var n = barCount();
    var lastTime = n ? bars.time[n - 1] : null;
    var newBar = false;

    if (n && c.time === lastTime) {
      bars.open[n - 1] = c.open;
      bars.high[n - 1] = c.high;
      bars.low[n - 1] = c.low;
      bars.close[n - 1] = c.close;
      bars.volume[n - 1] = c.volume;
    } else if (!n || c.time > lastTime) {
      bars.time.push(c.time);
      bars.open.push(c.open);
      bars.high.push(c.high);
      bars.low.push(c.low);
      bars.close.push(c.close);
      bars.volume.push(c.volume);
      newBar = true;
      n = barCount();
      syncMark.len = n;
    } else {
      return; /* 과거 시각이 뒤늦게 온 경우 - 무시 */
    }

    var lastBar = barAt(n - 1);

    for (var i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it.on || !it.live || !it.live.commit) continue;
      var d = defs[it.def];
      if (!d) continue;

      try {
        /* 새 봉이 생겼으면 "직전에 닫힌 봉" 을 확정 상태에 접어 넣습니다.
           확정 상태를 따로 들고 있어야 진행 중인 봉의 값이 확정값을
           오염시키지 않습니다(EMA 는 한 번 오염되면 계속 끌고 갑니다). */
        if (newBar && it.live.commitIdx === n - 3) {
          var closed = barAt(n - 2);
          var r0 = d.step(it.live.commit, closed, it.params);
          if (r0 && r0.state) {
            it.live.commit = r0.state;
            it.live.commitIdx = n - 2;
          }
        }

        var r = d.step(it.live.commit, lastBar, it.params);
        if (!r || !r.values) continue;
        for (var k in r.values) {
          if (!it.live.series[k]) continue;
          var v = r.values[k];
          if (typeof v !== "number" || !isFinite(v)) continue;
          it.live.series[k].update({ time: lastBar.time, value: v });
        }
      } catch (e) {
        /* 한 인스턴스가 실패해도 나머지는 계속 그립니다.
           다음 전체 맞춤에서 정리됩니다. */
      }
    }

    if (t0) {
      var ms = now() - t0;
      perf.ticks++;
      perf.totalMs += ms;
      if (ms > perf.maxMs) perf.maxMs = ms;
    }
  }

  /* =====================================================================
   * 7. 차트 데이터가 통째로 바뀌었는지 감시 (봉 간격 변경 / 과거 스크롤)
   *    chart.js 는 그때 setData() 를 부르는데 알려주는 신호가 없습니다.
   *    켜진 인스턴스가 있을 때만 돕니다. 타이머는 하나뿐입니다.
   * ===================================================================== */
  var timer = null;

  function checkResync() {
    if (!anyOn() || !candleSeries) return;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return;
    }
    if (!data || !data.length) return;
    if (data.length === syncMark.len && data[0].time === syncMark.first) return;
    reseedAll();
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(checkResync, 1500);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function scheduleResync() {
    if (!anyOn()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 40) {
        clearInterval(t);
        return;
      }
      var d = null;
      try {
        d = candleSeries && candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        reseedAll();
      }
    }, 100);
  }

  /* =====================================================================
   * 8. 켜기 / 끄기 / 저장
   * ===================================================================== */
  function setOn(id, on) {
    var it = insts[id];
    if (!it) return;
    on = !!on;
    if (it.on === on) return;
    it.on = on;
    saveState();

    if (on) {
      if (!ensureChart()) return;
      if (!barsReady) syncBars();
      startTimer();
      turnOn(id);
    } else {
      turnOff(id);
      if (!anyOn()) {
        clearBars();
        stopTimer();
      }
    }
    paintButtons();
    paintMenu();
  }

  function toggle(id) {
    if (!insts[id]) return;
    setOn(id, !insts[id].on);
  }

  function isOn(id) {
    return !!(insts[id] && insts[id].on);
  }

  function saveState() {
    try {
      if (!App.Storage || !isFn(App.Storage.save)) return;
      App.Storage.save(STORAGE_KEY, {
        v: STORE_VERSION,
        instances: instOrder.map(function (id) {
          var it = insts[id];
          return {
            id: it.id,
            def: it.def,
            params: it.params,
            colors: it.colors,
            style: it.style,
            width: it.width,
            pane: it.pane,
            on: it.on
          };
        })
      });
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작 */
    }
  }

  /** 저장된 것이 있으면 그걸로, 없으면 기본 인스턴스로 시작합니다. */
  function loadState(defaults) {
    var saved = null;
    try {
      if (App.Storage && isFn(App.Storage.load)) saved = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }

    if (saved && saved.v === STORE_VERSION && saved.instances && saved.instances.length) {
      var made = 0;
      saved.instances.forEach(function (s) {
        if (!s || !defs[s.def]) return; /* 정의가 사라졌으면 건너뜁니다 */
        if (addInstance(s.def, s)) made++;
      });
      if (made) return;
    }

    (defaults || []).forEach(function (d) {
      addInstance(d.def, d);
    });
  }

  /* =====================================================================
   * 9. 차트 왼쪽 위 작은 버튼 - 2 · 3단계가 만든 막대에 이어 붙입니다
   *    (저쪽 paintButtons() 는 .tl-ind-btn / .tl-osc-btn 만 훑기 때문에
   *     우리 버튼은 클래스를 따로 두어 서로 색을 안 건드립니다.)
   * ===================================================================== */
  var barEl = null;

  function injectStyle() {
    if (document.getElementById("chart-indicator-kit-style")) return;
    var css =
      ".tl-kit-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-kit-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-kit-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      ".tl-kit-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}";
    var st = document.createElement("style");
    st.id = "chart-indicator-kit-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function paintButtons() {
    if (!barEl) return;
    var kids = barEl.querySelectorAll(".tl-kit-btn");
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].getAttribute("data-kit");
      var on = isOn(id);
      kids[i].setAttribute("aria-pressed", on ? "true" : "false");
      kids[i].style.color = on ? "#E7ECF5" : "#838DA4";
      kids[i].style.borderColor = on ? "#838DA4" : "#1D273B";
      var dot = kids[i].querySelector(".tl-kit-dot");
      if (dot) dot.style.background = on ? kids[i].getAttribute("data-color") : "#1D273B";
    }
  }

  function dropButton(id) {
    if (!barEl) return;
    var b = barEl.querySelector('.tl-kit-btn[data-kit="' + id + '"]');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function buildButtons() {
    /* 2단계가 만든 막대에 붙입니다. 없으면(2단계를 지웠으면) 아무것도 안 합니다. */
    var bar = document.querySelector(".chart-panel .tl-ind-bar") || document.querySelector(".tl-ind-bar");
    if (!bar) return false;

    injectStyle();
    barEl = bar;

    instOrder.forEach(function (id) {
      if (bar.querySelector('.tl-kit-btn[data-kit="' + id + '"]')) return;
      var it = insts[id];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-kit-btn";
      btn.setAttribute("data-kit", id);
      btn.setAttribute("data-color", mainColor(it));
      btn.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span");
      dot.className = "tl-kit-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(nameOfInst(it)));
      btn.addEventListener("click", function () {
        toggle(id);
      });
      bar.appendChild(btn);
    });

    paintButtons();
    return true;
  }

  /* =====================================================================
   * 10. fx 목록에 끼어들기 - js/chart-indicator-menu.js 는 안 고칩니다
   * ===================================================================== */
  var wrapped = false;

  /** 목록이 물어보는 isOn/toggle 을 감쌉니다. 우리 인스턴스면 우리가 답합니다. */
  function wrapMenuBridge() {
    if (wrapped) return;
    var IND = App.ChartIndicators;
    if (!IND || !isFn(IND.isOn) || !isFn(IND.toggle)) return;

    var origIsOn = IND.isOn;
    var origToggle = IND.toggle;

    IND.isOn = function (key) {
      if (insts[key]) return isOn(key);
      return origIsOn.apply(this, arguments);
    };
    IND.toggle = function (key) {
      if (insts[key]) return toggle(key);
      return origToggle.apply(this, arguments);
    };
    wrapped = true;
  }

  function menuPanel() {
    return document.getElementById("tl-fx-menu");
  }

  function dropMenuRow(id) {
    var p = menuPanel();
    if (!p) return;
    var r = p.querySelector('.tl-fx-row[data-key="' + id + '"]');
    if (r && r.parentNode) r.parentNode.removeChild(r);
  }

  /** 목록 창이 열렸으면 우리 줄을 이어 붙입니다(이미 있으면 아무것도 안 함). */
  function injectMenuRows() {
    var p = menuPanel();
    if (!p) return;
    var list = p.querySelector(".tl-fx-list");
    if (!list) return;

    for (var i = 0; i < instOrder.length; i++) {
      var id = instOrder[i];
      if (list.querySelector('.tl-fx-row[data-key="' + id + '"]')) continue;
      var it = insts[id];
      var d = defs[it.def];
      if (!d) continue;

      var row = document.createElement("button");
      row.type = "button";
      /* 저쪽 클래스를 그대로 씁니다. 그래야 저쪽 CSS 와 paint() 가 그대로
         적용되고, 우리가 같은 값을 두 번 적지 않습니다.
         (paint() 가 부르는 isOn/toggle 은 위에서 감싸 두었습니다) */
      row.className = "tl-fx-row";
      row.setAttribute("data-who", "ind");
      row.setAttribute("data-key", id);
      row.setAttribute("data-color", mainColor(it));
      row.setAttribute("data-kit", "1");
      row.setAttribute("aria-pressed", isOn(id) ? "true" : "false");

      var dot = document.createElement("span");
      dot.className = "tl-fx-dot";
      if (isOn(id)) dot.style.background = mainColor(it);
      var nm = document.createElement("span");
      nm.className = "tl-fx-name";
      nm.textContent = nameOfInst(it);
      var note = document.createElement("span");
      note.className = "tl-fx-note";
      note.textContent = d.note;
      var sw = document.createElement("span");
      sw.className = "tl-fx-sw";
      sw.appendChild(document.createElement("i"));

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.appendChild(sw);

      (function (theId) {
        row.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggle(theId);
        });
      })(id);

      /* "주 차트" 무리 끝에 넣습니다 - "아래 별도 칸" 머리 바로 앞입니다. */
      var placed = false;
      if (it.pane === "main") {
        var groups = list.querySelectorAll(".tl-fx-group");
        for (var g = 0; g < groups.length; g++) {
          if (groups[g].textContent === "아래 별도 칸") {
            list.insertBefore(row, groups[g]);
            placed = true;
            break;
          }
        }
      }
      if (!placed) list.appendChild(row);
    }
  }

  /**
   * 우리 줄의 상태를 다시 칠하고, 아래 안내줄의 개수를 사실대로 고칩니다.
   *
   * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 셉니다.
   * 그대로 두면 EMA 를 켰는데 "켜진 지표 0개" 라고 적히는, 화면이 사실과
   * 다른 상태가 됩니다. 그래서 화면에 실제로 있는 줄을 다시 세어 적습니다.
   */
  function paintMenu() {
    var p = menuPanel();
    if (!p) return;

    var mine = p.querySelectorAll('.tl-fx-row[data-kit="1"]');
    for (var i = 0; i < mine.length; i++) {
      var id = mine[i].getAttribute("data-key");
      var on = isOn(id);
      mine[i].setAttribute("aria-pressed", on ? "true" : "false");
      var dot = mine[i].querySelector(".tl-fx-dot");
      if (dot) dot.style.background = on ? mine[i].getAttribute("data-color") : GUIDE_COLOR;
    }

    var foot = p.querySelector(".tl-fx-foot");
    if (!foot) return;
    var n = p.querySelectorAll('.tl-fx-row[aria-pressed="true"]').length;
    var want =
      n === 0
        ? "켜진 지표가 없습니다. 눌러서 켜면 차트에 바로 그려집니다."
        : "켜진 지표 " + n + "개. 꺼진 지표는 계산도 하지 않습니다.";
    /* 같으면 안 씁니다 - 안 그러면 아래 감시가 스스로를 다시 부릅니다 */
    if (foot.textContent !== want) foot.textContent = want;
  }

  /* 감시는 두 겹입니다. 이렇게 나눈 이유가 있습니다.
   *
   * 처음에는 .chart-panel 하나를 subtree + characterData 로 통째로 감시했는데,
   * 차트 칸 안에는 시세 · 눈금처럼 초당 수십 번 바뀌는 글자가 있어서 감시
   * 콜백이 계속 불렸습니다. 실측(1920, 봉 1001개) -
   *     통째로 감시   기존 지표 0.278ms + 기존 오실 0.167ms = 0.445ms/틱
   *     안 하던 때    기존 지표 0.161ms + 기존 오실 0.117ms = 0.278ms/틱
   * 우리 지표를 다 꺼둔 상태인데도 남의 계산이 느려졌습니다. 그래서
   *     바깥 감시  .chart-panel 의 "자식이 늘고 줄었나" 만 (subtree 없음)
   *     안쪽 감시  목록 창이 열려 있는 동안만, 그 창 안쪽만
   * 으로 나눴습니다. 목록이 닫혀 있으면 안쪽 감시는 아예 없습니다.
   * (목록 창은 .chart-panel 의 바로 밑 자식으로 붙습니다 -
   *  js/chart-indicator-menu.js 의 build() 가 h.appendChild(p) 를 합니다) */
  var hostWatcher = null;
  var panelWatcher = null;

  function onHostChange() {
    var p = menuPanel();
    if (p && !panelWatcher) {
      injectMenuRows();
      paintMenu();
      panelWatcher = new MutationObserver(function () {
        injectMenuRows();
        paintMenu();
      });
      panelWatcher.observe(p, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-pressed"],
        characterData: true
      });
    } else if (!p && panelWatcher) {
      panelWatcher.disconnect();
      panelWatcher = null;
    }
  }

  function watchMenu() {
    if (hostWatcher || typeof MutationObserver === "undefined") return;
    var host = document.querySelector(".chart-panel");
    if (!host) return;
    hostWatcher = new MutationObserver(onHostChange);
    hostWatcher.observe(host, { childList: true }); /* 자식만. subtree 안 봅니다 */
    onHostChange();
  }

  /* =====================================================================
   * 11. 여기부터 지표 정의 - 계산식은 한 지표당 한 곳에만
   *
   * 지표를 늘리려면 아래처럼 define() 한 덩어리를 더 적으면 끝입니다.
   * 위쪽 틀은 하나도 안 고칩니다.
   * ===================================================================== */

  /* -- EMA 지수이동평균 -------------------------------------------------
   * EMA(t) = 종가(t) x k + EMA(t-1) x (1-k),   k = 2 / (기간+1)
   * 첫 값은 앞 기간개의 단순평균으로 시작합니다(트레이딩뷰 · 바이낸스와 같음).
   *
   * 바이낸스 실측(2026-09-02) - EMA 기본 기간은 7 / 25 / 99 였습니다
   * (Main Indicator > EMA > "EMA - Exponential Moving Average").
   * 여기서는 증명용이라 9 와 21 을 씁니다 - 이미 있는 MA(7) · MA(25) 와
   * 겹쳐 보이지 않게 일부러 다른 기간을 골랐습니다.
   * ------------------------------------------------------------------- */
  define({
    id: "ema",
    name: "EMA",
    note: "지수이동평균",
    pane: "main",
    params: { p: 9 },
    nameOf: function (prm) {
      return "EMA(" + prm.p + ")";
    },
    outputs: [{ key: "ema", kind: "line", color: "#49C9E9", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var n = bs.close.length;
      var out = [];
      if (n < p) return { ema: out };

      var k = 2 / (p + 1);
      var sum = 0;
      var i;
      for (i = 0; i < p; i++) sum += bs.close[i];
      var e = sum / p;
      out.push({ time: bs.time[p - 1], value: e });
      if (p - 1 === n - 2) cap.state = { e: e };

      for (i = p; i < n; i++) {
        e = bs.close[i] * k + e * (1 - k);
        out.push({ time: bs.time[i], value: e });
        if (i === n - 2) cap.state = { e: e };
      }
      return { ema: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var k = 2 / (p + 1);
      var e = bar.close * k + st.e * (1 - k);
      return { values: { ema: e }, state: { e: e } };
    }
  });

  /* 처음 오는 회원에게 주는 기본 인스턴스 - 전부 꺼짐입니다.
     정의는 "ema" 하나인데 인스턴스가 둘입니다. 이것이 이번 증명입니다. */
  var DEFAULT_INSTANCES = [
    { def: "ema", id: "ema-9", params: { p: 9 }, colors: { ema: "#49C9E9" }, style: "solid", on: false },
    { def: "ema", id: "ema-21", params: { p: 21 }, colors: { ema: "#BA6EED" }, style: "solid", on: false }
  ];

  /* =====================================================================
   * 12. 시작
   * ===================================================================== */
  function init() {
    loadState(DEFAULT_INSTANCES);

    if (App.Bus && isFn(App.Bus.on)) {
      App.Bus.on("kline:update", onTick);
      App.Bus.on("symbol:change", scheduleResync);
      App.Bus.on("interval:change", scheduleResync);
    }

    wrapMenuBridge();
    watchMenu();

    /* 차트는 chart.js 가 나중에 만들고, 과거 캔들은 그보다 더 나중에
       도착합니다(REST 조회). 둘 다 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 200) {
        clearInterval(t); /* 10초 - 그래도 없으면 포기 */
        return;
      }
      wrapMenuBridge();
      watchMenu(); /* .chart-panel 이 늦게 생길 수 있어 여기서도 다시 겁니다 */
      if (!ensureChart()) return;
      if (!buildButtons()) return;
      if (!anyOn()) {
        clearInterval(t); /* 켜진 게 없으면 캔들을 기다릴 이유도 없음 */
        return;
      }
      var d = null;
      try {
        d = candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        startTimer();
        reseedAll();
        paintButtons();
      }
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    /* 틀 */
    define: define,
    addInstance: addInstance,
    removeInstance: removeInstance,
    listDefs: listDefs,
    listInstances: listInstances,
    LINE_COLORS: LINE_COLORS,
    /* 켜기 / 끄기 */
    toggle: toggle,
    setOn: setOn,
    isOn: isOn,
    /* 확인용 */
    getPerf: function () {
      return {
        ticks: perf.ticks,
        avgMs: perf.ticks ? perf.totalMs / perf.ticks : 0,
        maxMs: perf.maxMs,
        seeds: perf.seeds,
        avgSeedMs: perf.seeds ? perf.seedMs / perf.seeds : 0,
        lastSeedMs: perf.lastSeedMs
      };
    },
    resetPerf: function () {
      perf.ticks = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
      perf.seeds = 0;
      perf.seedMs = 0;
      perf.lastSeedMs = 0;
    },
    getBarsForTest: function () {
      return bars;
    },
    getInstancesForTest: function () {
      return insts;
    },
    getDefsForTest: function () {
      return defs;
    },
    onTickForTest: onTick,
    rebuildButtonsForTest: buildButtons
  };
})();
