/* =========================================================================
 * js/chart-drawings.js — App.ChartDrawings
 * =========================================================================
 * 차트에 "선긋기" 를 얹습니다 (4단계 1차).
 *
 * 1차에서 실제로 되는 것
 *   · 수평선 (가격 기억용)
 *   · 추세선
 *   · 텍스트
 *   · 고른 것 지우기 / 전체 지우기
 *   · 도구 막대 접기·펴기
 *   · 브라우저 저장 — 새로고침해도 남습니다 (App.Storage)
 *
 * 자리만 잡아 둔 것 (2차)
 *   세로 막대 — 여러 수평선(피보나치) / 파동 / 여러선 / 브러시 / 표정 / 자 / 돋보기
 *   가로 막대 — 봉 종류 / fx 지표 / 알람 / 육각형 / 전체화면 / 카메라
 *   이 버튼들은 disabled 이고 오른쪽 위에 회색 점이 붙습니다(디자인팀 규칙).
 *   눌러도 아무 일도 일어나지 않습니다. 되는 척하지 않습니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 거기서 라이브러리
 * 공개 API 인 chart.panes()[n].getSeries() 로 캔들 시리즈를 찾습니다.
 * 1단계(chart-position-lines.js) · 2단계(chart-indicators.js) 와 같은 방식입니다.
 *
 * ── 껍데기는 디자인팀 것입니다 ────────────────────────────────────────
 *   생김새   css/chart-toolbar.css      (.tlc-toolbar / .tlc-body / .tlc-rail
 *                                        .tlc-btn / .tlc-ico / .tlc-sep / .tlc-spacer)
 *   아이콘   assets/icons/chart-tools.svg  (id 는 tlc-i-*)
 * 이 파일은 그 클래스와 아이콘 id 를 그대로 씁니다. 아이콘을 새로 만들지
 * 않았고, 디자인팀 파일도 고치지 않았습니다.
 *
 * 디자인팀이 정한 뼈대에 맞추려면 .chart-wrap 이 .tlc-body 안으로 들어가야
 * 합니다. index.html 의 마크업을 고치는 대신, 이 파일이 화면이 만들어질 때
 * 한 번 옮겨 넣습니다(차트가 만들어지기 전에 끝납니다).
 *
 * ── 어떻게 그리나 ─────────────────────────────────────────────────────
 * 수평선   → 캔들 시리즈의 createPriceLine (1단계에서 검증된 방법).
 *            가격축 라벨이 따라오고, 표시 통화(원/달러)는 chart.js 가 이미
 *            걸어둔 formatter 가 알아서 바꿔줍니다. 우리가 통화를 다시
 *            계산하거나 다시 그릴 일이 없습니다.
 * 추세선·텍스트 → 라이브러리 v5 의 시리즈 프리미티브(attachPrimitive).
 *            차트가 자기 화면을 다시 그릴 때 우리 그림도 같은 붓질에
 *            함께 그려집니다. 그래서 차트를 옮기거나 확대하면 선이
 *            어긋남 없이 따라옵니다(별도 캔버스를 겹쳐 그리면 한 프레임씩
 *            밀립니다 — 그래서 겹치는 방식을 쓰지 않았습니다).
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * 시세 틱(kline:update)을 아예 듣지 않습니다. 그릴 것이 없으면 draw() 가
 * 첫 줄에서 돌아갑니다(계산 0회). 마우스가 움직여도 긋는 중이 아니면
 * 아무 일도 하지 않습니다.
 *
 * ── 어디에 저장하나 ───────────────────────────────────────────────────
 * App.Storage 키 "chart-drawings" (실제 키는 btc_sim_v2_chart-drawings).
 *   수평선        → 종목별로 저장. 봉 간격을 바꿔도 그대로 보입니다.
 *                   (수평선은 "가격" 하나만 쓰고 시간을 안 쓰기 때문입니다)
 *   추세선·텍스트 → 종목 + 봉 간격별로 저장. 그 봉에서만 보입니다.
 *                   (시간에 매달린 그림이라 1분봉에 그은 추세선을 1일봉에
 *                    그대로 옮기면 점 하나로 뭉개집니다 — 그래서 나눴습니다)
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-drawings.js"></script> 한 줄 삭제
 *   2) package.json 의 tests/chart-drawings.test.js 한 토막 삭제
 *   3) js/chart-drawings.js, tests/chart-drawings.test.js 파일 삭제
 * 다른 파일은 고치지 않았습니다. 지우면 원래 화면 그대로입니다
 * (도구 막대도 이 파일이 만들기 때문에 같이 사라집니다).
 * 회원 브라우저에 남은 그림 기록은 btc_sim_v2_chart-drawings 키라
 * 그냥 남아 있어도 아무 동작도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartDrawings = (function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 색 — 확정 팔레트 안에서만 고릅니다.
   *   그린 선   #F0B429 포인트(골드) — 회원이 직접 만든 것
   *   고른 것   #E7ECF5 본문        — 지금 고른 그림 하나만 밝게
   * 상승 초록(#26C281)·하락 빨강(#F0506E)은 손익 전용이라 쓰지 않습니다.
   * (하락색은 청산가 선이 이미 쓰고 있어서 헷갈립니다)
   *
   * 수평선은 점선으로 긋습니다. 1단계의 "미체결 주문" 선이 같은 골드
   * 실선이라, 선 모양으로 구분되게 했습니다.
   * ------------------------------------------------------------------- */
  var COLOR_DRAW = "#F0B429";
  var COLOR_SELECTED = "#E7ECF5";
  var C_BG = "#0D1422";
  var C_CARD = "#101727";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";

  var LINE_WIDTH = 1;
  var HIT_PX = 7; /* 이 거리 안에서 누르면 그 그림을 고른 것으로 봅니다 */

  var STORAGE_KEY = "chart-drawings";
  var STORE_VERSION = 1;
  var SPRITE_URL = "assets/icons/chart-tools.svg";
  var RAIL_AUTO_WIDTH = 768; /* 디자인팀 CSS 의 폰 기준과 같은 값 */

  /* ---------------------------------------------------------------------
   * 도구 목록
   *   icon  — 디자인팀 스프라이트의 id (assets/icons/chart-tools.svg)
   *   ready — false 면 자리만. disabled 라 눌러도 아무 일이 없습니다.
   * ------------------------------------------------------------------- */
  var LEFT_TOOLS = [
    { k: "cursor", icon: "tlc-i-cursor", label: "커서", ready: true },
    { k: "sep1", sep: true },
    { k: "trend", icon: "tlc-i-trendline", label: "추세선", ready: true },
    { k: "hline", icon: "tlc-i-hline", label: "수평선", ready: true },
    { k: "fib", icon: "tlc-i-fib", label: "여러 수평선(피보나치)", ready: false },
    { k: "wave", icon: "tlc-i-wave", label: "파동", ready: false },
    { k: "channel", icon: "tlc-i-channel", label: "여러선", ready: false },
    { k: "brush", icon: "tlc-i-brush", label: "브러시", ready: false },
    { k: "sep2", sep: true },
    { k: "text", icon: "tlc-i-text", label: "텍스트", ready: true },
    { k: "face", icon: "tlc-i-face", label: "표정", ready: false },
    { k: "sep3", sep: true },
    { k: "ruler", icon: "tlc-i-ruler", label: "자", ready: false },
    { k: "zoom", icon: "tlc-i-zoom", label: "돋보기", ready: false }
  ];

  var TOP_TOOLS = [
    { k: "expand", icon: "tlc-i-chevron", label: "도구 막대 접기/펴기", ready: true },
    { k: "sep1", sep: true },
    { k: "candletype", icon: "tlc-i-candle", label: "봉 종류", ready: false },
    { k: "fx", icon: "tlc-i-fx", label: "fx 지표", ready: false },
    { k: "alert", icon: "tlc-i-alarm", label: "알람", ready: false },
    { k: "hex", icon: "tlc-i-hexagon", label: "육각형", ready: false },
    { k: "spacer", spacer: true },
    { k: "fullscreen", icon: "tlc-i-fullscreen", label: "전체화면", ready: false },
    { k: "camera", icon: "tlc-i-camera", label: "카메라", ready: false }
  ];

  /* 실제로 그릴 수 있는 도구 (나머지는 고를 수조차 없습니다) */
  var READY_TOOLS = { cursor: 1, trend: 1, hline: 1, text: 1 };

  /* ---------------- 상태 ---------------- */
  var chart = null;
  var series = null;
  var panel = null; /* .chart-panel */
  var wrap = null; /* .chart-wrap */
  var container = null; /* #chart_container */

  var tool = "cursor";
  var store = null; /* { v, ui:{rail}, bySymbol:{ SYM:{ hlines:[], byInterval:{ IV:[] } } } } */

  var pending = null; /* 추세선 첫 점 {t,p} */
  var hover = null; /* 미리보기용 현재 위치 {t,p} */
  var selected = null; /* { kind:"hline"|"shape", id } */

  var priceLines = {}; /* 수평선 id -> IPriceLine */
  var requestUpdate = null; /* 프리미티브가 준 "다시 그려줘" 함수 */

  var els = {}; /* 만들어 둔 DOM */
  var toastTimer = null;
  var seq = 0;

  /* 시간축 환산에 쓰는 정보 — 그릴 것이 있을 때만 갱신합니다 */
  var meta = { first: null, last: null, count: 0, bar: 60, at: 0 };

  /* 성능 측정 — App.ChartDrawings.getPerf() */
  var perf = { draws: 0, skipped: 0, totalMs: 0, maxMs: 0, shapes: 0 };

  function LC() {
    return window.LightweightCharts;
  }
  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function sym() {
    try {
      return App.Config.getActiveSymbol();
    } catch (e) {
      return "BTCUSDT";
    }
  }
  function iv() {
    try {
      return App.Config.getActiveInterval();
    } catch (e) {
      return "1m";
    }
  }
  function newId() {
    seq++;
    return "d" + Date.now().toString(36) + seq.toString(36);
  }

  /* =====================================================================
   * 저장 — App.Storage
   * ===================================================================== */
  function emptyStore() {
    return { v: STORE_VERSION, ui: {}, bySymbol: {} };
  }

  function loadStore() {
    var s = null;
    try {
      if (App.Storage && typeof App.Storage.load === "function") s = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      s = null;
    }
    if (!s || typeof s !== "object" || s.v !== STORE_VERSION || !s.bySymbol) return emptyStore();
    if (!s.ui) s.ui = {};
    return s;
  }

  function saveStore() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") App.Storage.save(STORAGE_KEY, store);
    } catch (e) {
      /* 저장이 안 돼도 화면은 그대로 씁니다 */
    }
  }

  function bucket(symbol) {
    if (!store) store = emptyStore();
    if (!store.bySymbol[symbol]) store.bySymbol[symbol] = { hlines: [], byInterval: {} };
    var b = store.bySymbol[symbol];
    if (!b.hlines) b.hlines = [];
    if (!b.byInterval) b.byInterval = {};
    return b;
  }

  /** 지금 보고 있는 종목의 수평선들 (봉 간격과 무관) */
  function hlines() {
    return bucket(sym()).hlines;
  }

  /** 지금 보고 있는 종목 + 봉 간격의 추세선·텍스트 */
  function shapes() {
    var b = bucket(sym());
    var key = iv();
    if (!b.byInterval[key]) b.byInterval[key] = [];
    return b.byInterval[key];
  }

  function countAll() {
    return hlines().length + shapes().length;
  }

  /* =====================================================================
   * 차트 찾기 — chart.js 를 고치지 않고 공개 API 로만
   * ===================================================================== */
  function ensureSeries() {
    if (series && chart) return true;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return false;
    var list = App.ChartFont.getCharts();
    if (!list || !list.length) return false;
    chart = list[0];
    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var ss = panes[i].getSeries();
        for (var j = 0; j < ss.length; j++) {
          if (ss[j].seriesType && ss[j].seriesType() === "Candlestick") {
            series = ss[j];
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("[chart-drawings.js] 캔들 시리즈를 찾지 못했습니다:", e);
    }
    return false;
  }

  /* =====================================================================
   * 좌표 바꾸기
   *   가격 <-> y : 시리즈가 그대로 해줍니다
   *   시간 <-> x : 봉 시각이면 timeToCoordinate 가 정확합니다.
   *                데이터 범위 밖(맨 왼쪽보다 과거 / 마지막 봉보다 미래)이면
   *                봉 간격이 일정하다는 성질로 논리 번호를 계산해 씁니다.
   *                (암호화폐는 24시간 내내 봉이 끊기지 않습니다)
   * ===================================================================== */
  function refreshMeta(force) {
    if (!series) return;
    var t = nowMs();
    if (!force && t - meta.at < 2000) return; /* 2초에 한 번이면 충분합니다 */
    var d;
    try {
      d = series.data();
    } catch (e) {
      return;
    }
    meta.at = t;
    if (!d || !d.length) {
      meta.count = 0;
      meta.first = null;
      meta.last = null;
      return;
    }
    meta.count = d.length;
    meta.first = d[0].time;
    meta.last = d[d.length - 1].time;
    if (d.length > 1) {
      var bar = Math.round((meta.last - meta.first) / (d.length - 1));
      if (bar > 0) meta.bar = bar;
    }
  }

  function timeToX(time) {
    if (!chart) return null;
    var ts;
    try {
      ts = chart.timeScale();
    } catch (e) {
      return null;
    }
    if (meta.first !== null && time >= meta.first && time <= meta.last) {
      var c = ts.timeToCoordinate(time);
      if (c !== null && c !== undefined) return c;
    }
    if (meta.first === null || !meta.bar) return null;
    var x = ts.logicalToCoordinate((time - meta.first) / meta.bar);
    return x === null || x === undefined ? null : x;
  }

  /** 누른 자리를 우리가 저장할 시각으로 바꿉니다 — 봉에 붙습니다 */
  function pointToTime(param) {
    if (param && typeof param.time === "number") return param.time;
    if (!param || typeof param.logical !== "number") return null;
    refreshMeta(false);
    if (meta.first === null) return null;
    return Math.round(meta.first + param.logical * meta.bar);
  }

  function priceToY(price) {
    try {
      var y = series.priceToCoordinate(price);
      return y === null || y === undefined ? null : y;
    } catch (e) {
      return null;
    }
  }

  function yToPrice(y) {
    try {
      var p = series.coordinateToPrice(y);
      return p === null || p === undefined ? null : p;
    } catch (e) {
      return null;
    }
  }

  /* =====================================================================
   * 그리기 — 라이브러리가 자기 화면을 그릴 때 같이 불립니다
   * ===================================================================== */
  function textFont() {
    var fam = "sans-serif";
    try {
      if (App.ChartFont && App.ChartFont.getSiteFontFamily) {
        var f = App.ChartFont.getSiteFontFamily();
        if (f) fam = f;
      }
    } catch (e) {
      /* 기본 글꼴 */
    }
    return "12px " + fam;
  }

  function handle(ctx, x, y) {
    ctx.fillStyle = COLOR_SELECTED;
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  }

  function drawShapes(ctx) {
    var list = shapes();
    var i;

    for (i = 0; i < list.length; i++) {
      var s = list[i];
      var on = !!(selected && selected.kind === "shape" && selected.id === s.id);
      var color = on ? COLOR_SELECTED : COLOR_DRAW;

      if (s.type === "trend") {
        var x1 = timeToX(s.t1);
        var x2 = timeToX(s.t2);
        var y1 = priceToY(s.p1);
        var y2 = priceToY(s.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        ctx.strokeStyle = color;
        ctx.lineWidth = on ? LINE_WIDTH + 1 : LINE_WIDTH;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (on) {
          handle(ctx, x1, y1);
          handle(ctx, x2, y2);
        }
      } else if (s.type === "text") {
        var tx = timeToX(s.t);
        var ty = priceToY(s.p);
        if (tx === null || ty === null) continue;
        ctx.fillStyle = color;
        ctx.font = textFont();
        ctx.textBaseline = "middle";
        ctx.fillText(s.s, tx + 5, ty);
        if (on) {
          var w = ctx.measureText(s.s).width;
          ctx.strokeStyle = COLOR_SELECTED;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.strokeRect(tx + 2, ty - 9, w + 6, 18);
          ctx.setLineDash([]);
        }
      }
    }

    /* 추세선을 긋는 중이면 미리보기(점선) */
    if (pending && hover) {
      var ax = timeToX(pending.t);
      var ay = priceToY(pending.p);
      var bx = timeToX(hover.t);
      var by = priceToY(hover.p);
      if (ax !== null && ay !== null && bx !== null && by !== null) {
        ctx.strokeStyle = COLOR_DRAW;
        ctx.lineWidth = LINE_WIDTH;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        handle(ctx, ax, ay);
      }
    }
  }

  function drawFrame(target) {
    /* 그릴 것이 없으면 여기서 끝 — 계산을 하지 않습니다 */
    if (!series) return;
    var list = shapes();
    if ((!list || !list.length) && !pending) {
      perf.skipped++;
      return;
    }
    var t0 = nowMs();
    try {
      target.useMediaCoordinateSpace(function (scope) {
        refreshMeta(false);
        drawShapes(scope.context);
      });
    } catch (e) {
      /* 한 프레임 실패해도 차트는 계속 돕니다 */
    }
    var ms = nowMs() - t0;
    perf.draws++;
    perf.totalMs += ms;
    perf.shapes = list.length;
    if (ms > perf.maxMs) perf.maxMs = ms;
  }

  var paneView = {
    zOrder: function () {
      return "top";
    },
    renderer: function () {
      return { draw: drawFrame };
    }
  };

  var primitive = {
    attached: function (p) {
      requestUpdate = p && p.requestUpdate ? p.requestUpdate : null;
    },
    detached: function () {
      requestUpdate = null;
    },
    updateAllViews: function () {},
    paneViews: function () {
      return [paneView];
    }
  };

  function repaint() {
    if (requestUpdate) {
      try {
        requestUpdate();
      } catch (e) {
        /* 무시 */
      }
    }
  }

  /* =====================================================================
   * 수평선 — createPriceLine (가격축 라벨·표시 통화가 따라옵니다)
   * ===================================================================== */
  function createPriceLineFor(h) {
    var lc = LC();
    var on = !!(selected && selected.kind === "hline" && selected.id === h.id);
    try {
      priceLines[h.id] = series.createPriceLine({
        price: h.price,
        color: on ? COLOR_SELECTED : COLOR_DRAW,
        lineWidth: LINE_WIDTH,
        lineStyle: lc && lc.LineStyle ? lc.LineStyle.Dashed : 2,
        axisLabelVisible: true,
        title: ""
      });
    } catch (e) {
      console.warn("[chart-drawings.js] 수평선을 긋지 못했습니다:", e);
    }
  }

  function paintPriceLine(h) {
    var pl = priceLines[h.id];
    if (!pl) return;
    var on = !!(selected && selected.kind === "hline" && selected.id === h.id);
    try {
      pl.applyOptions({ color: on ? COLOR_SELECTED : COLOR_DRAW, lineWidth: on ? LINE_WIDTH + 1 : LINE_WIDTH });
    } catch (e) {
      /* 무시 */
    }
  }

  function removePriceLine(id) {
    if (!priceLines[id]) return;
    try {
      series.removePriceLine(priceLines[id]);
    } catch (e) {
      /* 이미 지워졌으면 무시 */
    }
    delete priceLines[id];
  }

  function clearPriceLines() {
    for (var id in priceLines) removePriceLine(id);
  }

  function syncPriceLines() {
    if (!series) return;
    var want = {};
    var list = hlines();
    var i;
    var id;
    for (i = 0; i < list.length; i++) {
      want[list[i].id] = 1;
      if (!priceLines[list[i].id]) createPriceLineFor(list[i]);
      else paintPriceLine(list[i]);
    }
    for (id in priceLines) {
      if (!want[id]) removePriceLine(id);
    }
  }

  /* =====================================================================
   * 고르기 (커서 도구) — 누른 자리에서 가장 가까운 그림
   * ===================================================================== */
  function distToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var qx = x1 + t * dx;
    var qy = y1 + t * dy;
    return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
  }

  function hitTest(x, y) {
    var best = null;
    var bestD = HIT_PX + 1;
    var list = shapes();
    var i;

    for (i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.type === "trend") {
        var x1 = timeToX(s.t1);
        var x2 = timeToX(s.t2);
        var y1 = priceToY(s.p1);
        var y2 = priceToY(s.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        var d = distToSegment(x, y, x1, y1, x2, y2);
        if (d < bestD) {
          bestD = d;
          best = { kind: "shape", id: s.id };
        }
      } else if (s.type === "text") {
        var tx = timeToX(s.t);
        var ty = priceToY(s.p);
        if (tx === null || ty === null) continue;
        var w = 7 * (s.s ? s.s.length : 0) + 10;
        if (x >= tx && x <= tx + w && Math.abs(y - ty) <= 10) {
          bestD = 0;
          best = { kind: "shape", id: s.id };
        }
      }
    }

    var hs = hlines();
    for (i = 0; i < hs.length; i++) {
      var hy = priceToY(hs[i].price);
      if (hy === null) continue;
      var dd = Math.abs(hy - y);
      if (dd < bestD) {
        bestD = dd;
        best = { kind: "hline", id: hs[i].id };
      }
    }
    return best;
  }

  function findHLine(id) {
    var list = hlines();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function setSelected(sel) {
    var before = selected;
    selected = sel;
    var h;
    if (before && before.kind === "hline") {
      h = findHLine(before.id);
      if (h) paintPriceLine(h);
    }
    if (selected && selected.kind === "hline") {
      h = findHLine(selected.id);
      if (h) paintPriceLine(h);
    }
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 누르기 — 차트 위에서 일어나는 일
   * 라이브러리의 subscribeClick 이 주는 좌표를 그대로 씁니다(캔들 판 기준).
   * 끌어서 차트를 옮기는 동작은 클릭으로 오지 않아서, 도구를 켜 둔 채로도
   * 차트를 끌어 옮길 수 있습니다(실측으로 확인했습니다).
   * ===================================================================== */
  function onClick(param) {
    if (!param || !param.point) return;
    var x = param.point.x;
    var y = param.point.y;
    var price = yToPrice(y);
    var time = pointToTime(param);

    if (tool === "cursor") {
      setSelected(hitTest(x, y));
      return;
    }
    if (price === null) return;

    if (tool === "hline") {
      hlines().push({ id: newId(), type: "hline", price: price });
      saveStore();
      syncPriceLines();
      paintChip();
      setTool("cursor");
      return;
    }

    if (time === null) return;

    if (tool === "trend") {
      if (!pending) {
        pending = { t: time, p: price };
        hover = { t: time, p: price };
        repaint();
      } else {
        shapes().push({ id: newId(), type: "trend", t1: pending.t, p1: pending.p, t2: time, p2: price });
        pending = null;
        hover = null;
        saveStore();
        paintChip();
        setTool("cursor");
        repaint();
      }
      return;
    }

    if (tool === "text") {
      openTextInput(x, y, time, price);
    }
  }

  function onCrosshairMove(param) {
    /* 긋는 중이 아니면 아무 일도 하지 않습니다 */
    if (!pending) return;
    if (!param || !param.point) return;
    var price = yToPrice(param.point.y);
    var time = pointToTime(param);
    if (price === null || time === null) return;
    hover = { t: time, p: price };
    repaint();
  }

  /* =====================================================================
   * 지우기
   * ===================================================================== */
  function removeSelected() {
    if (!selected) {
      toast("지울 것을 먼저 고르세요");
      return false;
    }
    var i;
    if (selected.kind === "hline") {
      var hs = hlines();
      for (i = 0; i < hs.length; i++) {
        if (hs[i].id === selected.id) {
          hs.splice(i, 1);
          break;
        }
      }
      removePriceLine(selected.id);
    } else {
      var ss = shapes();
      for (i = 0; i < ss.length; i++) {
        if (ss[i].id === selected.id) {
          ss.splice(i, 1);
          break;
        }
      }
    }
    selected = null;
    saveStore();
    syncPriceLines();
    paintButtons();
    paintChip();
    repaint();
    return true;
  }

  function clearAll() {
    hlines().length = 0;
    shapes().length = 0;
    selected = null;
    pending = null;
    hover = null;
    saveStore();
    clearPriceLines();
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 도구 고르기
   * ===================================================================== */
  function setTool(name) {
    if (!READY_TOOLS[name]) return;
    tool = name;
    if (name !== "trend") {
      pending = null;
      hover = null;
    }
    if (name !== "cursor") setSelected(null);
    closeTextInput();
    paintButtons();
    repaint();
  }

  /* =====================================================================
   * 껍데기 — 디자인팀이 정한 뼈대 그대로 만듭니다
   *   .chart-panel
   *     ├─ .tlc-toolbar   가로 막대
   *     └─ .tlc-body      (가로줄)
   *          ├─ .tlc-rail   세로 막대
   *          └─ .chart-wrap 기존 차트 (그대로 옮겨 넣습니다)
   * ===================================================================== */
  function restructure() {
    if (els.body) return true;
    panel = document.querySelector(".chart-panel");
    wrap = panel ? panel.querySelector(".chart-wrap") : null;
    container = document.getElementById("chart_container");
    if (!panel || !wrap || !container) return false;

    var body = panel.querySelector(".tlc-body");
    if (body) {
      els.body = body;
      els.rail = panel.querySelector(".tlc-rail");
      els.bar = panel.querySelector(".tlc-toolbar");
      return true;
    }

    var bar = document.createElement("div");
    bar.className = "tlc-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "차트 도구 막대");

    body = document.createElement("div");
    body.className = "tlc-body";

    var rail = document.createElement("div");
    rail.className = "tlc-rail";
    rail.setAttribute("role", "toolbar");
    rail.setAttribute("aria-label", "차트 그리기 도구");

    panel.insertBefore(bar, wrap);
    panel.insertBefore(body, wrap);
    body.appendChild(rail);
    body.appendChild(wrap); /* 여기서 차트 칸이 .tlc-body 안으로 들어갑니다 */

    els.bar = bar;
    els.body = body;
    els.rail = rail;

    fillBar(rail, LEFT_TOOLS, "tool");
    fillBar(bar, TOP_TOOLS, "top");
    applyRail();
    paintButtons();
    return true;
  }

  function fillBar(host, defs, kind) {
    defs.forEach(function (def) {
      if (def.sep) {
        var sp = document.createElement("div");
        sp.className = "tlc-sep";
        host.appendChild(sp);
        return;
      }
      if (def.spacer) {
        var sc = document.createElement("div");
        sc.className = "tlc-spacer";
        host.appendChild(sc);
        return;
      }
      host.appendChild(makeButton(def, kind));
    });
  }

  function makeButton(def, kind) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tlc-btn";
    b.setAttribute("data-tlc", def.k);
    b.setAttribute("data-kind", kind);
    b.innerHTML =
      "<svg class=\"tlc-ico\" viewBox=\"0 0 16 16\" aria-hidden=\"true\"><use href=\"#" + def.icon + "\"></use></svg>";
    if (def.ready) {
      b.setAttribute("title", def.label);
      b.setAttribute("aria-label", def.label);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        onButton(def, kind);
      });
    } else {
      /* 아직 안 만든 것 — 디자인팀 규칙대로 disabled + data-soon
         (흐려지고 오른쪽 위에 회색 점이 붙습니다). 눌러도 아무 일 없습니다. */
      b.setAttribute("data-soon", "1");
      b.setAttribute("disabled", "disabled");
      b.setAttribute("title", def.label + " (준비중)");
      b.setAttribute("aria-label", def.label + " 준비중");
    }
    return b;
  }

  function onButton(def, kind) {
    if (kind === "tool") {
      setTool(def.k);
      return;
    }
    if (def.k === "expand") toggleRail();
  }

  /* ---------------- 세로 막대 접기/펴기 ----------------
   * 값은 디자인팀이 정한 대로 "on" / "off" 둘만 씁니다.
   * 처음 값은 화면 폭을 따릅니다(폰은 접힘). 한 번 누르면 그 선택을 기억합니다.
   * ------------------------------------------------------------------- */
  function railOpen() {
    if (store && store.ui && typeof store.ui.rail === "boolean") return store.ui.rail;
    return window.innerWidth >= RAIL_AUTO_WIDTH;
  }

  function applyRail() {
    if (!els.body) return;
    els.body.setAttribute("data-rail", railOpen() ? "on" : "off");
    paintButtons();
  }

  function toggleRail() {
    if (!store.ui) store.ui = {};
    store.ui.rail = !railOpen();
    saveStore();
    applyRail();
  }

  function paintButtons() {
    if (!els.rail) return;
    var btns = els.rail.querySelectorAll(".tlc-btn[data-kind=tool]");
    var i;
    for (i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-tlc") === tool ? "true" : "false");
    }
    var ex = els.bar ? els.bar.querySelector(".tlc-btn[data-tlc=expand]") : null;
    if (ex) ex.setAttribute("aria-pressed", railOpen() ? "true" : "false");
  }

  /* ---------------- 아이콘 스프라이트 ----------------
   * 디자인팀 파일(assets/icons/chart-tools.svg)을 그대로 한 번 받아
   * 화면 맨 앞에 숨겨 둡니다. 버튼은 그 안의 id 를 부릅니다.
   * 못 받아오면 파일을 직접 가리키는 방식으로 물러섭니다(모양은 나옵니다).
   * ------------------------------------------------------------------- */
  function loadSprite() {
    if (document.getElementById("tlc-icon-sprite")) return;
    if (typeof fetch !== "function") {
      spriteFallback();
      return;
    }
    fetch(SPRITE_URL)
      .then(function (r) {
        return r.ok ? r.text() : null;
      })
      .then(function (txt) {
        if (!txt) {
          spriteFallback();
          return;
        }
        var box = document.createElement("div");
        box.id = "tlc-icon-sprite";
        box.setAttribute("aria-hidden", "true");
        box.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
        box.innerHTML = txt.replace(/<\?xml[\s\S]*?\?>/, "");
        document.body.insertBefore(box, document.body.firstChild);
      })
      .catch(function () {
        spriteFallback();
      });
  }

  function spriteFallback() {
    var uses = document.querySelectorAll(".tlc-ico use");
    for (var i = 0; i < uses.length; i++) {
      var h = uses[i].getAttribute("href");
      if (h && h.charAt(0) === "#") uses[i].setAttribute("href", SPRITE_URL + h);
    }
  }

  /* ---------------- 내가 만든 작은 것들의 생김새 ----------------
   * 디자인팀 CSS(css/chart-toolbar.css)는 도구 막대 전용이라, 아래 세 가지
   * (지우기 칩 / 알림 한 줄 / 글자 입력칸)는 여기서 스타일을 넣습니다.
   * 확정 팔레트만 씁니다.
   * ------------------------------------------------------------------- */
  function injectStyle() {
    if (document.getElementById("chart-drawings-style")) return;
    var css =
      ".tl-draw-chip{position:absolute;left:8px;bottom:28px;z-index:6;display:none;align-items:center;" +
      "gap:6px;padding:3px 6px;border-radius:6px;background:" + C_CARD + ";border:1px solid " + C_BORDER + ";" +
      "font-size:11px;line-height:1.6;color:" + C_MUTED + ";}" +
      ".tl-draw-chip button{border:1px solid " + C_BORDER + ";background:" + C_BG + ";color:" + C_TEXT + ";" +
      "border-radius:5px;font-size:11px;line-height:1.6;padding:1px 7px;cursor:pointer;font-family:inherit;}" +
      ".tl-draw-chip button:hover{border-color:" + C_MUTED + ";}" +
      ".tl-draw-chip button[data-dim=1]{color:" + C_MUTED + ";}" +
      ".tl-draw-chip button.on{border-color:" + COLOR_DRAW + ";color:" + COLOR_DRAW + ";}" +
      ".tl-draw-toast{position:absolute;top:8px;left:50%;transform:translateX(-50%);z-index:9;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";border-radius:6px;" +
      "padding:3px 10px;font-size:12px;line-height:1.6;pointer-events:none;display:none;}" +
      ".tl-draw-input{position:absolute;z-index:9;background:" + C_CARD + ";border:1px solid " + COLOR_DRAW + ";" +
      "color:" + C_TEXT + ";border-radius:6px;padding:2px 6px;font-size:12px;width:150px;font-family:inherit;}";
    var st = document.createElement("style");
    st.id = "chart-drawings-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ---------------- 지우기 칩 ----------------
   * 그린 것이 하나라도 있을 때만 차트 왼쪽 아래에 나옵니다.
   * (디자인팀 스프라이트에 지우기 아이콘이 없어서 막대에 넣지 않았습니다.
   *  아이콘을 새로 만들지 않기로 했기 때문입니다. 2차에 아이콘이 오면
   *  세로 막대 아래쪽으로 옮기면 됩니다.)
   * ------------------------------------------------------------------- */
  var askingClear = false;

  function buildChip() {
    if (els.chip || !wrap) return;
    injectStyle();
    if (!wrap.style.position) wrap.style.position = "relative";
    var chip = document.createElement("div");
    chip.className = "tl-draw-chip";
    var label = document.createElement("span");
    var b1 = document.createElement("button");
    b1.type = "button";
    var b2 = document.createElement("button");
    b2.type = "button";
    b1.addEventListener("click", function () {
      if (askingClear) {
        askingClear = false;
        clearAll();
        toast("모두 지웠습니다");
        return;
      }
      removeSelected();
    });
    b2.addEventListener("click", function () {
      if (askingClear) {
        askingClear = false;
        paintChip();
        return;
      }
      askingClear = true;
      paintChip();
    });
    chip.appendChild(label);
    chip.appendChild(b1);
    chip.appendChild(b2);
    wrap.appendChild(chip);
    els.chip = chip;
    els.chipLabel = label;
    els.chipBtn1 = b1;
    els.chipBtn2 = b2;
  }

  function paintChip() {
    if (!els.chip) return;
    var n = countAll();
    if (!n) {
      askingClear = false;
      els.chip.style.display = "none";
      return;
    }
    els.chip.style.display = "flex";
    if (askingClear) {
      els.chipLabel.textContent = "정말 모두 지울까요";
      els.chipBtn1.textContent = "지우기";
      els.chipBtn1.className = "on";
      els.chipBtn1.removeAttribute("data-dim");
      els.chipBtn2.textContent = "취소";
      els.chipBtn2.className = "";
      return;
    }
    els.chipLabel.textContent = "그린 것 " + n;
    els.chipBtn1.textContent = "고른 것 지우기";
    els.chipBtn1.className = "";
    if (selected) els.chipBtn1.removeAttribute("data-dim");
    else els.chipBtn1.setAttribute("data-dim", "1");
    els.chipBtn2.textContent = "전체 지우기";
    els.chipBtn2.className = "";
  }

  /* ---------------- 알림 한 줄 ---------------- */
  function toast(msg) {
    if (!wrap) return;
    if (!els.toast) {
      injectStyle();
      els.toast = document.createElement("div");
      els.toast.className = "tl-draw-toast";
      wrap.appendChild(els.toast);
    }
    els.toast.textContent = msg;
    els.toast.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (els.toast) els.toast.style.display = "none";
    }, 1600);
  }

  /* ---------------- 글자 넣기 ----------------
   * 캔들 판의 왼쪽 위가 좌표 (0,0) 이라, 입력칸을 그 자리에 맞춰 띄웁니다.
   * ------------------------------------------------------------------- */
  function paneOrigin() {
    var out = { x: 0, y: 0 };
    try {
      var cv = container.querySelector("canvas");
      if (!cv) return out;
      var r = cv.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      out.x = r.left - wr.left;
      out.y = r.top - wr.top;
    } catch (e) {
      /* 0,0 으로 둡니다 */
    }
    return out;
  }

  function closeTextInput() {
    if (els.input && els.input.parentNode) els.input.parentNode.removeChild(els.input);
    els.input = null;
  }

  function openTextInput(x, y, time, price) {
    closeTextInput();
    injectStyle();
    var o = paneOrigin();
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "tl-draw-input";
    inp.setAttribute("maxlength", "40");
    inp.setAttribute("placeholder", "글을 쓰고 Enter");
    inp.style.left = Math.round(o.x + x) + "px";
    inp.style.top = Math.round(o.y + y - 12) + "px";
    inp.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        var v = inp.value.trim();
        if (v) {
          shapes().push({ id: newId(), type: "text", t: time, p: price, s: v });
          saveStore();
          paintChip();
        }
        closeTextInput();
        setTool("cursor");
        repaint();
      } else if (ev.key === "Escape") {
        closeTextInput();
        setTool("cursor");
      }
    });
    wrap.appendChild(inp);
    els.input = inp;
    setTimeout(function () {
      try {
        inp.focus();
      } catch (e) {
        /* 무시 */
      }
    }, 0);
  }

  /* =====================================================================
   * 자판 — Delete 로 지우기, Esc 로 그리던 것 취소
   * ===================================================================== */
  function onKeyDown(ev) {
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (ev.key === "Escape") {
      if (pending) {
        pending = null;
        hover = null;
        repaint();
      }
      askingClear = false;
      paintChip();
      closeTextInput();
      setTool("cursor");
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && selected) {
      ev.preventDefault();
      removeSelected();
    }
  }

  /* =====================================================================
   * 종목 · 봉 간격이 바뀔 때
   *   수평선        — 종목이 같으면 그대로 (봉을 바꿔도 남습니다)
   *   추세선·텍스트 — 그 봉 간격의 것만 다시 그립니다
   * ===================================================================== */
  function rescope() {
    selected = null;
    pending = null;
    hover = null;
    askingClear = false;
    clearPriceLines();
    meta.at = 0;
    refreshMeta(true);
    syncPriceLines();
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 시작
   * ===================================================================== */
  var started = false;

  function start() {
    if (started) return true;
    if (!ensureSeries()) return false;
    if (!restructure()) return false;
    buildChip();
    started = true;

    try {
      series.attachPrimitive(primitive);
    } catch (e) {
      console.warn("[chart-drawings.js] 그림판을 붙이지 못했습니다:", e);
    }
    try {
      chart.subscribeClick(onClick);
      chart.subscribeCrosshairMove(onCrosshairMove);
    } catch (e) {
      console.warn("[chart-drawings.js] 누르는 것을 받지 못했습니다:", e);
    }

    refreshMeta(true);
    syncPriceLines();
    paintChip();
    repaint();

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", function () {
      if (!store || !store.ui || typeof store.ui.rail !== "boolean") applyRail();
    });

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", rescope);
      App.Bus.on("interval:change", rescope);
    }
    return true;
  }

  function init() {
    store = loadStore();
    /* 껍데기는 차트가 만들어지기 전에 먼저 세웁니다.
       (차트 칸을 나중에 옮기면 차트가 한 번 다시 그려집니다) */
    restructure();
    loadSprite();
    var tries = 0;
    var timer = setInterval(function () {
      if (start() || ++tries > 200) clearInterval(timer); /* 10초까지만 기다립니다 */
    }, 50);
  }

  if (document.readyState === "loading") {
    /* 이 파일은 index.html 맨 아래에 실리므로 차트 칸 마크업은 이미 있습니다.
       main.js 가 차트를 만들기 전에 껍데기를 세워 두려고 바로 시작합니다. */
    init();
  } else {
    init();
  }

  return {
    init: init,
    setTool: setTool,
    getTool: function () {
      return tool;
    },
    removeSelected: removeSelected,
    clearAll: clearAll,
    toggleRail: toggleRail,
    isRailOpen: railOpen,
    /* 확인용 */
    getDrawings: function () {
      return { hlines: hlines().slice(), shapes: shapes().slice() };
    },
    getSelected: function () {
      return selected ? { kind: selected.kind, id: selected.id } : null;
    },
    getPerf: function () {
      return {
        draws: perf.draws,
        skipped: perf.skipped,
        avgMs: perf.draws ? perf.totalMs / perf.draws : 0,
        maxMs: perf.maxMs,
        shapes: perf.shapes
      };
    },
    resetPerf: function () {
      perf.draws = 0;
      perf.skipped = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
    },
    /* 계산부 — 테스트에서 그대로 씁니다 */
    distToSegment: distToSegment,
    TOOLS: { left: LEFT_TOOLS, top: TOP_TOOLS, ready: READY_TOOLS },
    COLORS: { draw: COLOR_DRAW, selected: COLOR_SELECTED },
    STORAGE_KEY: STORAGE_KEY
  };
})();
