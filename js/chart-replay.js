/* =========================================================================
 * js/chart-replay.js — App.ChartReplay
 * =========================================================================
 * 리플레이 (트레이딩뷰 Bar replay) — 과거 어느 시점으로 돌아가 봉을 하나씩
 * 앞으로 넘기며 다시 봅니다.
 *
 * ── 제일 먼저 읽을 것 — 왜 주문을 막는가 ──────────────────────────────
 * 트레이딩뷰는 순수 차트라 리플레이 중에도 주문을 막지 않습니다.
 * 트레이딩뷰 고객센터 원문 (2026-09-02 확인, 로그인 없이 열립니다):
 *   "trading orders (Paper Trading and other brokers) are executed based on
 *    real-time data"
 *   https://www.tradingview.com/support/solutions/43000474024/
 * 즉 트레이딩뷰에서는 과거 봉을 보는 동안 주문이 "지금 시세" 로 체결됩니다.
 * 트레이딩뷰 스스로도 이것을 문제로 보고 "Bar Replay 의 거래 설정을 넓히는
 * 중" 이라고 적어두었습니다 (43000744131).
 *
 * 우리는 차트와 주문창이 한 화면에 있습니다. 그대로 두면 회원이 과거 가격을
 * 보고 지금 시세로 주문하게 됩니다. 그건 회원 돈입니다.
 * 바이낸스 선물 거래화면은 Original 도 Trading View 모드도 리플레이 버튼이
 * 아예 없습니다 (2026-09-02 실측 — shots/ctreplay-binance-02-tvmode.png).
 * CLAUDE.md 의 "경계가 겹치는 것은 거래 쪽이 우선" 에 따라 이렇게 정했습니다.
 *
 *   1) 포지션이나 미체결 주문이 하나라도 있으면 리플레이를 시작하지 않습니다
 *      (그래야 "닫기까지 막혀 못 빠져나오는" 상황이 아예 안 생깁니다)
 *   2) 리플레이 중에는 App.Trading 의 주문 함수를 감싸 전부 거부합니다
 *      — js/login-required.js 가 비회원에게 쓰는 것과 같은 방법입니다
 *   3) 주문창을 덮개로 덮고 "리플레이 끄기" 버튼을 그 자리에 둡니다
 *   4) 차트 위에 "리플레이 중 — 과거 화면입니다" 를 상시 띄웁니다
 *   5) 리플레이 중에 포지션이 생기면(다른 탭 등) 즉시 리플레이를 끕니다
 *   6) chart.js 가 그리는 빨간 현재가 선은 리플레이 중에 감춥니다
 *      (과거 봉 위에 지금 가격선이 떠 있으면 그것부터 오해를 부릅니다)
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸둔 것과 똑같은
 * 방법으로 한 겹 더 감쌉니다. 그래서 chart.js 가 만드는 차트 객체와
 * 시리즈(캔들·거래량)를 만들어지는 순간 붙잡습니다.
 *   · 시리즈의 setData / update / data 를 그 객체에서 감쌉니다
 *   · chart.js 는 자기가 들고 있는 참조로 부르므로 우리 것이 먼저 잡힙니다
 * 이 파일은 반드시 라이브러리 다음, js/chart.js 앞에 실려야 합니다.
 *
 * ── 실시간 시세가 끼어드는 것을 어떻게 막나 ───────────────────────────
 * 실측(2026-09-02) — 봉을 100개 잘라내고 5초 두었더니 chart.js 가 실시간
 * update() 로 지금 봉을 도로 붙여 801 -> 802 개가 됐습니다(가운데는 빈 채로).
 * 그래서 리플레이 중에는 update() 를 삼킵니다. 다만 버리지 않고 장부(data)에
 * 기록해서, 리플레이를 끄면 그동안 들어온 값까지 한 번에 되돌립니다.
 *
 * App.Bus 에 가짜 이벤트를 쏘지 않습니다 — price:update 를 흉내내면
 * js/trading.js 가 그 값을 현재가로 믿어 손익·청산가가 틀어집니다.
 *
 * ── 지표·그린 선은 같이 움직입니다 ────────────────────────────────────
 * 캔들뿐 아니라 차트에 있는 모든 시리즈를 같은 방식으로 다룹니다.
 * 지표선도 리플레이 시점까지만 보이고, 한 봉 나아가면 그 시리즈의 그 시각
 * 점 하나만 붙입니다 (계산량 O(1) — 전체를 다시 계산하지 않습니다).
 * 리플레이 중에 새로 켠 지표도 따라오도록, 리플레이 중 candleSeries.data()
 * 는 자른 것이 아니라 원래 전체를 돌려줍니다 (지표는 제 값으로 계산하고,
 * 화면에 보이는 범위만 우리가 자릅니다).
 * 그려둔 선(수평선·추세선)은 시리즈에 붙어 있어 그대로 남습니다.
 *
 * ── 되돌리는 법 ───────────────────────────────────────────────────────
 *   index.html 의 <script src="js/chart-replay.js"> 한 줄을 지우면 됩니다.
 *   버튼도 리플레이도 아예 안 만들어지고, 다른 파일은 건드리지 않았습니다.
 *   화면에서 임시로 끄려면 콘솔에서 App.ChartReplay.disable() 입니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartReplay = (function () {
  "use strict";

  /* ---------------- 확정 팔레트 (새 색을 만들지 않습니다) ---------------- */
  var C = {
    card: "#101727",
    tile: "#0D1422",
    line: "#1D273B",
    text: "#E7ECF5",
    sub: "#838DA4",
    gold: "#F0B429",
    down: "#F0506E"
  };

  /* 배속 — 1x 는 한 봉에 1초입니다 (트레이딩뷰도 배속 목록으로 고릅니다) */
  var SPEEDS = [0.5, 1, 2, 3, 5, 10];
  var BASE_MS = 1000;
  var SPEED_KEY = "chart-replay-speed";

  var off = false; /* disable() 로 완전히 끕니다 */

  var state = {
    on: false,
    picking: false,
    playing: false,
    cutTime: null,
    speed: 1,
    timer: null,
    symbol: null,
    interval: null,
    /* 리플레이를 켤 때 차트가 보고 있던 가로 자리 (오른쪽 끝에서 몇 봉).
       끌 때 이 값으로 되돌립니다 — 아래 「끄면 보던 자리로」 참조 */
    scroll0: null
  };

  var perf = { steps: 0, stepMs: 0, stepMax: 0, applyMs: 0, applyMax: 0, ticks: 0, tickMs: 0 };
  function resetPerf() {
    perf = { steps: 0, stepMs: 0, stepMax: 0, applyMs: 0, applyMax: 0, ticks: 0, tickMs: 0 };
  }

  /* ---------------- 시리즈 장부 ----------------
   * 시리즈마다 "화면에 넣은 값의 사본" 을 들고 있습니다.
   * 리플레이를 끄면 이 사본을 그대로 다시 넣어 현재로 돌아옵니다.
   * ------------------------------------------------------------------- */
  var chart = null;
  var reg = [];
  var priceLines = [];
  var liveLine = null;
  /* 현재가 선을 알아보는 표식. js/chart.js:50 COLORS.current 와 같은 값입니다.
     제목으로 찍으면 안 됩니다 — 회원이 그은 수평선도 title:"" 이고
     (js/chart-drawings.js:1922) 저장된 것이 먼저 되살아나 그쪽이 잡혔습니다. */
  var LIVE_LINE_COLOR = "#FF5252";

  function entryOf(s) {
    for (var i = 0; i < reg.length; i++) if (reg[i].s === s) return reg[i];
    return null;
  }
  function entryByKind(k) {
    for (var i = 0; i < reg.length; i++) if (reg[i].kind === k) return reg[i];
    return null;
  }

  function timeOf(p) {
    return p && typeof p.time === "number" ? p.time : null;
  }

  function mergePoint(e, p) {
    var t = timeOf(p);
    if (t === null) return;
    var d = e.data;
    var last = d.length ? d[d.length - 1] : null;
    if (last && last.time === t) d[d.length - 1] = p;
    else if (!last || t > last.time) d.push(p);
    else {
      for (var i = d.length - 1; i >= 0; i--) {
        if (d[i].time === t) { d[i] = p; break; }
        if (d[i].time < t) { d.splice(i + 1, 0, p); break; }
      }
    }
    if (e.byTime) e.byTime.set(t, p);
  }

  function byTime(e) {
    if (!e.byTime) {
      e.byTime = new Map();
      for (var i = 0; i < e.data.length; i++) {
        var t = timeOf(e.data[i]);
        if (t !== null) e.byTime.set(t, e.data[i]);
      }
    }
    return e.byTime;
  }

  function cutOf(e) {
    var out = [];
    var d = e.data;
    for (var i = 0; i < d.length; i++) {
      var t = timeOf(d[i]);
      if (t === null || t > state.cutTime) break;
      out.push(d[i]);
    }
    return out;
  }

  function indexOfTime(d, t) {
    var lo = 0, hi = d.length - 1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      var v = timeOf(d[m]);
      if (v === t) return m;
      if (v < t) lo = m + 1;
      else hi = m - 1;
    }
    return -1;
  }

  /* ---------------- 시리즈 감싸기 ----------------
   * 남이 나중에 또 감쌌으면(예: js/chart-candle-type.js 의 봉 종류 바꾸기)
   * 리플레이를 켤 때 그 위에 다시 감싸 맨 바깥이 됩니다.
   * 옛 껍질은 통과만 시킵니다(active=false).
   * ------------------------------------------------------------------- */
  function wrapSeries(s, kind) {
    if (off || !s || typeof s.setData !== "function" || typeof s.update !== "function") return null;
    var old = entryOf(s);
    if (old && s.setData === old.wrapSet && s.update === old.wrapUpd) return old;

    var e = {
      s: s,
      kind: kind || (old && old.kind) || "aux",
      data: old ? old.data : [],
      byTime: old ? old.byTime : null,
      active: true,
      set: s.setData.bind(s),
      upd: s.update.bind(s),
      readData: typeof s.data === "function" ? s.data.bind(s) : null
    };
    e.wrapSet = function (d) { return onSetData(e, d); };
    e.wrapUpd = function (p) { return onUpdate(e, p); };

    try {
      s.setData = e.wrapSet;
      s.update = e.wrapUpd;
      if (e.kind === "candle" && e.readData) {
        e.wrapRead = function () { return onReadData(e); };
        s.data = e.wrapRead;
      }
    } catch (err) {
      return null;
    }

    if (old) {
      old.active = false;
      var at = reg.indexOf(old);
      if (at >= 0) reg.splice(at, 1);
    }
    reg.push(e);

    /* 가로선(진입가·현재가 등)이 만들어지는 것을 지켜봅니다.
       chart.js 의 현재가 선은 색이 LIVE_LINE_COLOR 인 선입니다(js/chart.js:405). */
    if (e.kind === "candle" && typeof s.createPriceLine === "function" && !s.__tlReplayPL) {
      var origPL = s.createPriceLine.bind(s);
      s.createPriceLine = function (opts) {
        var ln = origPL(opts);
        try {
          priceLines.push({ line: ln, title: (opts && opts.title) || "", color: (opts && opts.color) || "" });
          if (!liveLine && opts && String(opts.color).toUpperCase() === LIVE_LINE_COLOR) liveLine = ln;
        } catch (err2) { /* 무시 */ }
        return ln;
      };
      s.__tlReplayPL = true;
    }
    return e;
  }

  function onSetData(e, d) {
    if (!e.active) return e.set(d);
    if (!state.on) {
      e.data = Array.isArray(d) ? d.slice() : [];
      e.byTime = null;
      return e.set(d);
    }
    var t0 = performance.now();
    e.data = Array.isArray(d) ? d.slice() : [];
    e.byTime = null;
    if (symbolChanged()) { stop(false); return e.set(d); }
    var r = e.set(cutOf(e));
    perf.ticks++; perf.tickMs += performance.now() - t0;
    if (e.kind === "candle") reanchor();
    return r;
  }

  function onUpdate(e, p) {
    if (!e.active) return e.upd(p);
    if (!state.on) { mergePoint(e, p); return e.upd(p); }
    /* 리플레이 중 — 값은 장부에만 적고 화면에는 넣지 않습니다 */
    var t0 = performance.now();
    mergePoint(e, p);
    perf.ticks++; perf.tickMs += performance.now() - t0;
    return undefined;
  }

  /* 리플레이 중에도 "자료 전체" 를 묻는 쪽(지표 계산)에는 전체를 줍니다 */
  function onReadData(e) {
    if (state.on && e.active) return e.data.slice();
    return e.readData();
  }

  /* 과거를 더 불러오면 배열 앞이 늘어납니다 — 자를 시각은 그대로 둡니다 */
  function reanchor() {
    var cand = entryByKind("candle");
    if (!cand || state.cutTime === null) return;
    if (indexOfTime(cand.data, state.cutTime) < 0) stop(true);
  }

  function symbolChanged() {
    try {
      return (
        (state.symbol && App.Config.getActiveSymbol() !== state.symbol) ||
        (state.interval && App.Config.getActiveInterval() !== state.interval)
      );
    } catch (e) {
      return false;
    }
  }

  /* ---------------- 라이브러리 가로채기 (chart.js 무수정) ---------------- */
  function patchLibrary() {
    if (off) return true;
    if (typeof window.LightweightCharts === "undefined") return false;
    var LC = window.LightweightCharts;
    if (LC.__replayPatched) return true;
    if (typeof LC.createChart !== "function") return false;

    var origCreate = LC.createChart;
    function wrappedCreate(container, options) {
      var c = origCreate.call(LC, container, options);
      try { catchChart(c); } catch (e) { /* 무시 */ }
      return c;
    }
    try {
      var proxy = Object.create(LC);
      Object.defineProperty(proxy, "createChart", {
        value: wrappedCreate, writable: true, configurable: true, enumerable: true
      });
      Object.defineProperty(proxy, "__replayPatched", {
        value: true, writable: true, configurable: true, enumerable: false
      });
      window.LightweightCharts = proxy;
    } catch (e) {
      console.warn("[chart-replay.js] 라이브러리를 감싸지 못했습니다 — 리플레이를 만들지 않습니다.", e);
      off = true;
      return true;
    }
    return true;
  }

  function catchChart(c) {
    if (chart) return;
    chart = c;
    if (typeof c.addSeries !== "function") return;
    var origAdd = c.addSeries.bind(c);
    c.addSeries = function () {
      var s = origAdd.apply(null, arguments);
      try {
        var t = s.seriesType && s.seriesType();
        var kind =
          t === "Candlestick" ? (entryByKind("candle") ? "aux" : "candle")
            : t === "Histogram" ? (entryByKind("volume") ? "aux" : "volume")
              : "aux";
        wrapSeries(s, kind);
      } catch (e) { /* 무시 */ }
      return s;
    };
  }

  /* 나중에 다른 모듈이 만든 시리즈(지표선 등)까지 빠짐없이 잡습니다 */
  function scanSeries() {
    if (!chart || typeof chart.panes !== "function") return;
    try {
      var panes = chart.panes();
      var live = [];
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          live.push(list[j]);
          if (!entryOf(list[j])) wrapSeries(list[j], null);
        }
      }
      /* 없어진 시리즈(지표를 끈 경우)는 장부에서 뺍니다 */
      for (var k = reg.length - 1; k >= 0; k--) {
        if (live.indexOf(reg[k].s) < 0) reg.splice(k, 1);
      }
    } catch (e) { /* 무시 */ }
  }

  /* 리플레이를 켤 때 우리 껍질을 맨 바깥으로 다시 올립니다 */
  function ensureOutermost() {
    scanSeries();
    var snapshot = reg.slice();
    for (var i = 0; i < snapshot.length; i++) wrapSeries(snapshot[i].s, snapshot[i].kind);
  }

  /* =====================================================================
   * 주문 막기 — js/trading.js 는 건드리지 않고 함수만 감쌉니다
   * ===================================================================== */
  var GUARDED = ["openPosition", "placeLimitOrder", "closePosition", "closePartial", "cancelPendingOrder"];
  var guardInstalled = false;

  function installOrderGuard() {
    if (guardInstalled || !App.Trading || App.Trading.__replayGuarded) return;
    GUARDED.forEach(function (name) {
      var orig = App.Trading[name];
      if (typeof orig !== "function") return;
      App.Trading[name] = function () {
        if (state.on) {
          notice("리플레이 중에는 주문할 수 없습니다.\n지금 차트는 과거 화면이라 시세가 다릅니다.\n주문하려면 리플레이를 끄세요.");
          return null;
        }
        return orig.apply(App.Trading, arguments);
      };
    });
    App.Trading.__replayGuarded = true;
    guardInstalled = true;
  }

  var lastNotice = 0;
  function notice(msg) {
    var now = Date.now();
    if (now - lastNotice < 800) return;
    lastNotice = now;
    try { window.alert(msg); } catch (e) { /* 무시 */ }
  }

  function accountBusy() {
    try {
      var s = App.Trading.getSnapshot();
      return !!(s && (s.position || s.pendingOrder));
    } catch (e) {
      return false;
    }
  }

  /* =====================================================================
   * 리플레이 켜고 끄기
   * ===================================================================== */
  function canStart() {
    if (off) return "리플레이가 꺼져 있습니다";
    var cand = entryByKind("candle");
    if (!cand || cand.data.length < 10) return "차트 자료가 아직 없습니다";
    if (accountBusy()) return "포지션이나 미체결 주문이 있으면 리플레이를 쓸 수 없습니다";
    return null;
  }

  function start(cutTime) {
    var why = canStart();
    if (why) { toast(why); return false; }
    var cand = entryByKind("candle");
    var i = indexOfTime(cand.data, cutTime);
    if (i < 0) {
      for (i = cand.data.length - 1; i >= 0; i--) if (timeOf(cand.data[i]) <= cutTime) break;
    }
    if (i < 1) { toast("더 오른쪽 봉을 골라주세요"); return false; }
    if (i >= cand.data.length - 1) { toast("맨 끝 봉입니다. 더 왼쪽을 골라주세요"); return false; }

    ensureOutermost();
    state.on = true;
    state.scroll0 = scrollPos();
    state.cutTime = timeOf(cand.data[i]);
    try {
      state.symbol = App.Config.getActiveSymbol();
      state.interval = App.Config.getActiveInterval();
    } catch (e) { /* 무시 */ }

    var t0 = performance.now();
    applyAll();
    var ms = performance.now() - t0;
    perf.applyMs = ms;
    perf.applyMax = Math.max(perf.applyMax, ms);

    hideLiveLine(true);
    installOrderGuard();
    showBars();
    refresh();
    return true;
  }

  function stop(restoreData) {
    if (!state.on) { setPicking(false); return false; }
    pause();
    state.on = false;
    state.cutTime = null;
    if (restoreData !== false) {
      for (var i = 0; i < reg.length; i++) {
        try { reg[i].set(reg[i].data.slice()); } catch (e) { /* 무시 */ }
      }
      restoreScroll(); /* 봉을 되돌린 다음에 자리를 되돌립니다 (순서 중요) */
    } else {
      state.scroll0 = null; /* 종목·봉간격이 바뀐 것이라 옛 자리는 버립니다 */
    }
    hideLiveLine(false);
    hideBars();
    refresh();
    return true;
  }

  function applyAll() {
    for (var i = 0; i < reg.length; i++) {
      try { reg[i].set(cutOf(reg[i])); } catch (e) { /* 무시 */ }
    }
  }

  function stepForward() {
    if (!state.on) return false;
    var cand = entryByKind("candle");
    if (!cand) return false;
    var t0 = performance.now();
    var i = indexOfTime(cand.data, state.cutTime);
    if (i < 0 || i >= cand.data.length - 1) { pause(); toast("마지막 봉입니다"); return false; }
    var next = timeOf(cand.data[i + 1]);
    state.cutTime = next;
    for (var k = 0; k < reg.length; k++) {
      var e = reg[k];
      var pt = byTime(e).get(next);
      if (pt) { try { e.upd(pt); } catch (err) { /* 무시 */ } }
    }
    var ms = performance.now() - t0;
    perf.steps++;
    perf.stepMs += ms;
    perf.stepMax = Math.max(perf.stepMax, ms);
    keepInView(i + 1);
    refresh();
    return true;
  }

  function stepBack() {
    if (!state.on) return false;
    var cand = entryByKind("candle");
    if (!cand) return false;
    var i = indexOfTime(cand.data, state.cutTime);
    if (i <= 1) { toast("더 뒤로 갈 수 없습니다"); return false; }
    state.cutTime = timeOf(cand.data[i - 1]);
    var t0 = performance.now();
    applyAll(); /* 넣은 점을 하나만 빼는 방법이 없어 통째로 다시 넣습니다 */
    var ms = performance.now() - t0;
    perf.applyMs = ms;
    perf.applyMax = Math.max(perf.applyMax, ms);
    refresh();
    return true;
  }

  function play() {
    if (!state.on || state.playing) return;
    state.playing = true;
    var delay = Math.max(40, Math.round(BASE_MS / state.speed));
    state.timer = setInterval(function () {
      if (!stepForward()) pause();
    }, delay);
    refresh();
  }

  function pause() {
    state.playing = false;
    if (state.timer) { clearInterval(state.timer); state.timer = null; }
    refresh();
  }

  function setSpeed(v) {
    var n = Number(v);
    if (SPEEDS.indexOf(n) < 0) return;
    state.speed = n;
    try { if (App.Storage && App.Storage.save) App.Storage.save(SPEED_KEY, n); } catch (e) { /* 무시 */ }
    if (state.playing) { pause(); play(); }
    refresh();
  }

  /* =====================================================================
   * 끄면 보던 자리로 (2026-09-02)
   * ---------------------------------------------------------------------
   * 먼 과거에서 리플레이를 끄면 차트가 오른쪽 끝으로 안 돌아왔습니다.
   *
   * 실측 (2026-09-02 · 1440 · localhost)
   *   기준(리플레이 안 켬)            오른쪽 빈 칸   2px   scrollPosition 0
   *   280봉 전 + 5봉 진행 (리플레이 중)              scrollPosition 124.75
   *   그대로 끔                       오른쪽 빈 칸 144px   scrollPosition 124.75
   *
   * 왜 그런가 — 아래 keepInView 가 새 봉을 화면 안으로 데려올 때 마지막 봉을
   * 가로 75% 자리에 둡니다. 그러면 오른쪽에 ★보이는 폭의 25%★ 만큼 빈
   * 칸이 생기고(위 실측 124.75봉), 그 값은 시간축이 "오른쪽 끝에서 몇 봉"
   * 으로 기억합니다. 리플레이를 끄고 봉을 다 되돌려도 그 빈 칸은 그대로
   * 남습니다. 값은 다 맞고 화면 자리만 안 돌아오는 것이라 더 헷갈립니다.
   *
   * 그래서 켤 때의 자리를 적어 두었다가 끌 때 그대로 되돌립니다.
   * 봉 개수가 늘어도(실시간으로 한 봉 더 생겨도) "오른쪽 끝에서 몇 봉" 은
   * 그대로라 이 값을 씁니다.
   * ===================================================================== */
  function scrollPos() {
    try {
      var v = chart.timeScale().scrollPosition();
      return typeof v === "number" && isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function restoreScroll() {
    if (state.scroll0 === null) return false;
    var to = state.scroll0;
    state.scroll0 = null;
    try {
      chart.timeScale().scrollToPosition(to, false); /* false = 애니메이션 없이 */
      return true;
    } catch (e) {
      return false;
    }
  }

  /* 새로 나온 봉이 화면 밖이면 따라갑니다 */
  function keepInView(lastLogical) {
    try {
      var ts = chart.timeScale();
      var r = ts.getVisibleLogicalRange();
      if (!r) return;
      if (lastLogical > r.to - 1 || lastLogical < r.from) {
        var span = r.to - r.from;
        ts.setVisibleLogicalRange({ from: lastLogical - span * 0.75, to: lastLogical + span * 0.25 });
      }
    } catch (e) { /* 무시 */ }
  }

  function hideLiveLine(hide) {
    if (!liveLine) return;
    try {
      liveLine.applyOptions(
        hide ? { lineVisible: false, axisLabelVisible: false } : { lineVisible: true, axisLabelVisible: true }
      );
    } catch (e) { /* 무시 */ }
  }

  /* =====================================================================
   * 화면 — style.css 는 건드리지 않고 이 파일이 스스로 넣습니다
   * ===================================================================== */
  var ui = {};
  var STYLE_ID = "tl-replay-style";

  function css() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      /* 차트칸이 화면보다 길 때(지표 칸을 켜면 그렇습니다) 안내줄과 조작 막대가
         화면 밖으로 나가지 않도록 위·아래에 붙여 둡니다(sticky).
         트레이딩뷰는 차트가 창에 딱 맞아 늘 보이지만 우리는 페이지가 깁니다. */
      ".tl-rp-layer{position:absolute; inset:0; pointer-events:none; z-index:18;" +
      " display:flex; flex-direction:column;}",
      ".tl-rp-fill{flex:1 1 auto; min-height:0;}",
      ".tl-rp-pickline{position:absolute; top:0; bottom:0; width:0; border-left:1px dashed " + C.gold + "; display:none;}",
      ".tl-rp-hint{position:sticky; top:8px; align-self:center; margin:8px;" +
      " background:" + C.card + "; border:1px solid " + C.gold + "; color:" + C.text + ";" +
      " border-radius:10px; padding:8px 14px; font-size:16px; line-height:1.35;}",
      ".tl-rp-banner{position:sticky; top:8px; margin:8px; display:none;" +
      " background:" + C.card + "; border:1px solid " + C.gold + "; border-radius:10px;" +
      " padding:9px 12px; color:" + C.text + "; font-size:16px; line-height:1.4;" +
      " word-break:keep-all; text-align:center;}",
      ".tl-rp-banner b{color:" + C.gold + "; font-weight:700;}",
      ".tl-rp-banner .l1{display:block;}",
      ".tl-rp-banner .l2{display:block; color:" + C.sub + "; font-size:15px;}",
      /* 시·고·저·종은 가격 그 자체라 캔들과 같은 상승·하락색을 씁니다
         (지표선에 상승·하락색을 쓰지 않는 규칙은 지표에 대한 것입니다) */
      ".tl-rp-banner .ohlc{margin-left:6px;}",
      ".tl-rp-banner .ohlc.up{color:#26C281;}",
      ".tl-rp-banner .ohlc.down{color:#F0506E;}",
      ".tl-rp-bar{position:sticky; bottom:14px; align-self:center; margin:0 0 14px; display:none;" +
      " align-items:center; gap:4px; pointer-events:auto; max-width:96%;" +
      " background:" + C.card + "; border:1px solid " + C.line + "; border-radius:10px; padding:6px 8px;}",
      /* 「그린 것 목록」이 열리면 비켜 세우거나(위로) 잠깐 접습니다.
         inline 의 display:flex 를 이겨야 해서 !important 를 씁니다
         — 아래 「그린 것 목록과 자리 다툼」 주석을 보세요 */
      ".tl-rp-bar.tl-rp-folded{display:none !important;}",
      ".tl-rp-b{width:38px; height:38px; display:inline-flex; align-items:center; justify-content:center;" +
      " background:transparent; border:0; border-radius:6px; color:" + C.text + "; cursor:pointer; padding:0;}",
      ".tl-rp-b:hover{background:rgba(255,255,255,.06);}",
      ".tl-rp-b svg{width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.8;" +
      " stroke-linecap:round; stroke-linejoin:round;}",
      ".tl-rp-b.on{color:" + C.gold + "; background:" + C.tile + ";}",
      ".tl-rp-speed{min-width:54px; height:38px; padding:0 10px; background:" + C.tile + "; color:" + C.text + ";" +
      " border:1px solid " + C.line + "; border-radius:6px; font-size:15px; cursor:pointer;}",
      ".tl-rp-date{color:" + C.sub + "; font-size:15px; padding:0 8px; white-space:nowrap;}",
      /* 배속 목록은 조작 막대 바로 위에 붙습니다(막대가 sticky 라 같이 따라옵니다) */
      ".tl-rp-menu{position:absolute; bottom:100%; left:50%; transform:translateX(-50%);" +
      " margin-bottom:8px; background:" + C.card + "; border:1px solid " + C.line + ";" +
      " border-radius:10px; padding:4px; display:none; pointer-events:auto;}",
      ".tl-rp-menu button{display:block; width:100%; background:transparent; border:0; color:" + C.text + ";" +
      " font-size:16px; padding:9px 20px; text-align:left; cursor:pointer; border-radius:6px;}",
      ".tl-rp-menu button:hover{background:" + C.tile + ";}",
      ".tl-rp-menu button.on{color:" + C.gold + "; font-weight:700;}",
      ".tl-rp-lock{position:absolute; inset:0; z-index:40;" +
      " background:rgba(10,15,28,.88); border-radius:10px;}",
      /* 주문창은 세로로 아주 깁니다(1920 실측 1150px). 가운데 정렬하면 안내가
         화면 아래로 내려가 안 보입니다 — 스크롤을 따라다니게 붙여 둡니다. */
      ".tl-rp-lockbox{position:sticky; top:70px; display:flex; flex-direction:column;" +
      " align-items:center; gap:12px; text-align:center; padding:24px 16px;}",
      ".tl-rp-lock .t{color:" + C.gold + "; font-size:21px; font-weight:700; line-height:1.4; word-break:keep-all;}",
      ".tl-rp-lock .s{color:" + C.text + "; font-size:17px; line-height:1.55; word-break:keep-all;}",
      ".tl-rp-lock button{margin-top:4px; background:" + C.gold + "; color:#0A0F1C; border:0; border-radius:8px;" +
      " padding:12px 22px; font-size:17px; font-weight:700; cursor:pointer;}",
      /* 리플레이 중에는 십자선 OHLC 범례를 감춥니다.
         그 줄은 App.Bus 의 kline:update(실시간)로 값을 채워서, 과거 화면 위에
         지금 봉의 값을 보여줍니다. 우리가 그 파일을 고칠 수 없고 값을 바꿔
         넣을 방법도 없어서, 대신 같은 값을 아래 안내줄에 우리가 적습니다. */
      'html[data-tl-replay="on"] .tl-ohlc{display:none;}',
      ".tl-rp-toast{position:sticky; bottom:74px; align-self:center; margin:0 0 4px;" +
      " background:" + C.card + "; border:1px solid " + C.down + "; color:" + C.text + ";" +
      " border-radius:10px; padding:10px 16px; font-size:16px; line-height:1.4; max-width:88%;" +
      " word-break:keep-all; text-align:center; display:none;}",
      ".tl-rp-banner .n{display:none;}",
      /* 폰(360)에서는 안내줄을 짧게 — 차트가 작아서 넉 줄이 되면 봉을 덮습니다.
         글씨는 줄이지 않고 ★글자 수★ 를 줄입니다 (시·고·저를 접고 종가만). */
      "@media (max-width:560px){" +
      " .tl-rp-date{display:none;}" +
      " .tl-rp-b{width:34px; height:34px;}" +
      " .tl-rp-hint{font-size:15px; padding:7px 10px; max-width:92%; text-align:center;}" +
      " .tl-rp-banner{font-size:15px; padding:7px 9px; margin:6px;}" +
      " .tl-rp-banner .w{display:none;} .tl-rp-banner .n{display:inline;}" +
      " .tl-rp-lock .t{font-size:19px;} .tl-rp-lock .s{font-size:16px;} }",
      /* 폰의 아래 고정 주문 막대(.tl-order-bar)는 주문창과 다른 자리에 있습니다.
         리플레이 중에는 그 위를 덮어 누르지 못하게 합니다. */
      ".tl-rp-mlock{position:fixed; z-index:9000; display:flex; align-items:center;" +
      " justify-content:center; gap:10px; background:rgba(10,15,28,.94);" +
      " border-top:1px solid " + C.gold + "; color:" + C.gold + "; font-size:16px;" +
      " font-weight:700; text-align:center; padding:8px 10px; word-break:keep-all;}",
      ".tl-rp-mlock button{background:" + C.gold + "; color:#0A0F1C; border:0; border-radius:8px;" +
      " padding:10px 14px; font-size:16px; font-weight:700; cursor:pointer; white-space:nowrap;}"
    ].join("\n");
    document.head.appendChild(s);
  }

  function svg(paths) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + paths + "</svg>";
  }
  var ICON = {
    replay: '<path d="M11 6 5 12l6 6"/><path d="M19 6l-6 6 6 6"/>',
    back: '<path d="M15 6 9 12l6 6"/><path d="M6 5v14"/>',
    fwd: '<path d="M9 6l6 6-6 6"/><path d="M18 5v14"/>',
    play: '<path d="M8 5.5 18 12 8 18.5z"/>',
    pause: '<path d="M9 5v14"/><path d="M15 5v14"/>',
    pick: '<path d="M12 3v18"/><path d="M7 8h10"/>',
    close: '<path d="M6 6l12 12"/><path d="M18 6 6 18"/>'
  };

  function chartWrap() {
    return document.querySelector(".chart-wrap");
  }

  function buildLayer() {
    var wrap = chartWrap();
    if (!wrap || ui.layer) return;
    css();
    if (getComputedStyle(wrap).position === "static") wrap.style.position = "relative";

    var layer = document.createElement("div");
    layer.className = "tl-rp-layer";
    layer.innerHTML =
      '<div class="tl-rp-pickline"></div>' +
      '<div class="tl-rp-banner"></div>' +
      '<div class="tl-rp-fill"></div>' +
      '<div class="tl-rp-toast"></div>' +
      '<div class="tl-rp-bar">' +
      '<div class="tl-rp-menu"></div>' +
      '<button type="button" class="tl-rp-b" data-a="pick" title="시작점 다시 고르기">' + svg(ICON.pick) + "</button>" +
      '<button type="button" class="tl-rp-b" data-a="back" title="한 봉 뒤로">' + svg(ICON.back) + "</button>" +
      '<button type="button" class="tl-rp-b" data-a="play" title="재생 / 멈춤">' + svg(ICON.play) + "</button>" +
      '<button type="button" class="tl-rp-b" data-a="fwd" title="한 봉 앞으로">' + svg(ICON.fwd) + "</button>" +
      '<button type="button" class="tl-rp-speed" data-a="speed">1x</button>' +
      '<span class="tl-rp-date"></span>' +
      '<button type="button" class="tl-rp-b" data-a="off" title="리플레이 끄기">' + svg(ICON.close) + "</button>" +
      "</div>";
    wrap.appendChild(layer);

    ui.layer = layer;
    ui.pickline = layer.querySelector(".tl-rp-pickline");
    ui.banner = layer.querySelector(".tl-rp-banner");
    ui.toast = layer.querySelector(".tl-rp-toast");
    ui.menu = layer.querySelector(".tl-rp-menu");
    ui.bar = layer.querySelector(".tl-rp-bar");
    ui.fill = layer.querySelector(".tl-rp-fill");
    ui.speed = layer.querySelector(".tl-rp-speed");
    ui.date = layer.querySelector(".tl-rp-date");
    ui.playBtn = layer.querySelector('[data-a="play"]');

    layer.addEventListener("click", function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest("[data-a]") : null;
      if (b) {
        var a = b.getAttribute("data-a");
        if (a === "play") { if (state.playing) pause(); else play(); }
        else if (a === "fwd") { pause(); stepForward(); }
        else if (a === "back") { pause(); stepBack(); }
        else if (a === "off") { stop(true); }
        else if (a === "pick") { pause(); stop(true); setPicking(true); }
        else if (a === "speed") { toggleMenu(); }
        return;
      }
      var v = ev.target && ev.target.closest ? ev.target.closest("[data-v]") : null;
      if (v) {
        setSpeed(Number(v.getAttribute("data-v")));
        ui.menu.style.display = "none";
      }
    });

    buildMenu();
  }

  function buildMenu() {
    if (!ui.menu) return;
    ui.menu.innerHTML = SPEEDS.map(function (v) {
      return '<button type="button" data-v="' + v + '"' + (v === state.speed ? ' class="on"' : "") + ">" + v + "x</button>";
    }).join("");
  }

  function toggleMenu() {
    if (!ui.menu) return;
    var open = ui.menu.style.display === "block";
    buildMenu();
    ui.menu.style.display = open ? "none" : "block";
  }

  var toastTimer = null;
  function toast(msg) {
    buildLayer();
    if (!ui.toast) return;
    ui.toast.textContent = msg;
    ui.toast.style.display = "block";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { if (ui.toast) ui.toast.style.display = "none"; }, 3200);
  }

  /* ---------------- 시작점 고르기 ---------------- */
  var clickHandler = null;
  var moveHandler = null;

  function setPicking(v) {
    buildLayer();
    if (v) {
      var why = canStart();
      if (why) { toast(why); return; }
    }
    state.picking = !!v;
    if (!chart) return;
    if (state.picking) {
      clickHandler = function (p) {
        if (!p || typeof p.time !== "number") return;
        setPicking(false);
        start(p.time);
      };
      moveHandler = function (p) {
        if (!ui.pickline) return;
        if (!p || !p.point) { ui.pickline.style.display = "none"; return; }
        ui.pickline.style.display = "block";
        ui.pickline.style.left = p.point.x + "px";
      };
      try {
        chart.subscribeClick(clickHandler);
        chart.subscribeCrosshairMove(moveHandler);
      } catch (e) { /* 무시 */ }
      showHint();
    } else {
      try {
        if (clickHandler) chart.unsubscribeClick(clickHandler);
        if (moveHandler) chart.unsubscribeCrosshairMove(moveHandler);
      } catch (e) { /* 무시 */ }
      clickHandler = null;
      moveHandler = null;
      if (ui.pickline) ui.pickline.style.display = "none";
      hideHint();
    }
    refresh();
  }

  function showHint() {
    hideHint();
    if (!ui.layer) return;
    ui.hint = document.createElement("div");
    ui.hint.className = "tl-rp-hint";
    ui.hint.textContent = "리플레이를 시작할 봉을 클릭하세요 (Esc 로 취소)";
    if (ui.fill) ui.layer.insertBefore(ui.hint, ui.fill);
    else ui.layer.appendChild(ui.hint);
    placeBanner(); /* 도움말도 지표 칩 줄을 덮지 않게 */
  }
  function hideHint() {
    if (ui.hint && ui.hint.parentNode) ui.hint.parentNode.removeChild(ui.hint);
    ui.hint = null;
  }

  /* ---------------- 리플레이 중 표시 ---------------- */
  function showBars() {
    buildLayer();
    if (ui.bar) ui.bar.style.display = "flex";
    if (ui.banner) ui.banner.style.display = "block";
    try { document.documentElement.setAttribute("data-tl-replay", "on"); } catch (e) { /* 무시 */ }
    showLock();
    showMobileLock();
    watchDrawList(true);
    relayout();
  }
  function hideBars() {
    watchDrawList(false);
    unplaceBar();
    if (ui.bar) ui.bar.style.display = "none";
    if (ui.banner) {
      ui.banner.style.display = "none";
      ui.banner.style.marginTop = "";
      ui.banner.style.top = "";
    }
    if (ui.menu) ui.menu.style.display = "none";
    try { document.documentElement.removeAttribute("data-tl-replay"); } catch (e) { /* 무시 */ }
    hideLock();
  }

  /* =====================================================================
   * 「그린 것 목록」과 자리 다툼 (2026-09-02)
   * ---------------------------------------------------------------------
   * js/chart-drawings.js 의 그린 것 목록(.tl-draw-list · z-index 8)은 그리기
   * 칩 바로 위에서 위로 자랍니다. 조작 막대는 차트 아래쪽 가운데에 붙어 있어
   * 둘이 같은 자리를 씁니다. 리플레이 층은 z-index 18 이라 목록을 덮습니다.
   *
   * 실측 (2026-09-02 · 그린 것 3개 · localhost)
   *   1440  목록 91,706~451,946   막대 231,834~652,886   겹침 220 x 52px
   *   360   목록 23,652~337,824   막대  49,734~311,786   겹침 262 x 52px
   *   두 폭 다 숨김·잠금·지움 세 단추가 막혔습니다
   *   (elementFromPoint 가 tl-rp-bar · tl-rp-speed 를 잡습니다)
   *
   * js/chart-drawings.js 는 한 글자도 열지 않습니다. 나중에 생긴 리플레이가
   * 비킵니다 — 목록은 늘 쓰는 것이고 리플레이는 껐다 켜는 것이라서입니다.
   *
   *   ① 목록 위로 올려서 피할 수 있으면 올립니다 (넓은 화면)
   *      자리(sticky bottom:14px)는 그대로 두고 transform 으로만 밀어
   *      올립니다. 그래야 목록을 닫으면 원래 자리로 정확히 돌아옵니다.
   *   ② 올릴 자리가 없으면 잠깐 접습니다 (폰).
   *      360 실측 — 차트에서 화면에 보이는 높이가 148px 인데 목록이 172px
   *      이라 위로도 아래로도 비킬 곳이 없습니다.
   *      목록을 닫으면 그 자리에서 도로 나옵니다.
   *
   * 접어도 없어지는 기능은 없습니다 — 도구막대의 리플레이 단추(끄기)와
   * 키보드(← → Space)는 접힌 동안에도 그대로 듣습니다.
   * 글씨는 한 글자도 줄이지 않았습니다.
   * ===================================================================== */
  var LIST_GAP = 8;      /* 목록과 막대 사이 최소 틈 */
  var LIST_HEAD_GAP = 6; /* 안내줄 아래 최소 틈 */
  var place = { folded: false, lift: 0, watching: false, raf: 0, mo: null };

  /** 지금 화면에 실제로 떠 있는 「그린 것 목록」. 없거나 감춰져 있으면 null */
  function drawListEl() {
    var el = document.querySelector(".tl-draw-list");
    if (!el) return null;
    try {
      var st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return null;
    } catch (e) { /* 무시 */ }
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return el;
  }

  /** 막대가 올라갈 수 있는 맨 위 — 차트 칸 위끝과 안내줄 아래 중 더 아래쪽 */
  function barTopLimit() {
    var wrap = chartWrap();
    var top = 0;
    if (wrap) top = Math.max(wrap.getBoundingClientRect().top, 0);
    var head = null;
    if (ui.banner && ui.banner.style.display !== "none") head = ui.banner;
    else if (ui.hint) head = ui.hint;
    if (head) {
      var r = head.getBoundingClientRect();
      if (r.height) top = Math.max(top, r.bottom + LIST_HEAD_GAP);
    }
    return top;
  }

  function unplaceBar() {
    place.folded = false;
    place.lift = 0;
    if (!ui.bar) return;
    ui.bar.style.transform = "";
    ui.bar.className = "tl-rp-bar";
  }

  /** 목록과 겹치면 위로 올리고, 올릴 자리가 없으면 접습니다 */
  function placeBar() {
    if (!ui.bar) return;
    if (!state.on) { unplaceBar(); return; }
    /* 지난번에 민 만큼이 섞이지 않게 먼저 제자리로 돌려놓고 잽니다 */
    unplaceBar();

    var list = drawListEl();
    if (!list) return;
    var b = ui.bar.getBoundingClientRect();
    if (!b.width || !b.height) return;
    var l = list.getBoundingClientRect();
    if (Math.min(b.right, l.right) - Math.max(b.left, l.left) <= 0) return;
    if (Math.min(b.bottom, l.bottom) - Math.max(b.top, l.top) <= 0) return;

    var lift = Math.ceil(b.bottom - (l.top - LIST_GAP));
    if (ui.menu) ui.menu.style.display = "none";
    if (lift > 0 && b.top - lift >= barTopLimit()) {
      place.lift = lift;
      ui.bar.style.transform = "translateY(" + (-lift) + "px)";
      return;
    }
    place.folded = true;
    ui.bar.className = "tl-rp-bar tl-rp-folded";
  }

  /* =====================================================================
   * 안내줄 ↔ 지표 칩 줄 (2026-09-02)
   * ---------------------------------------------------------------------
   * 지표 칩 줄(js/chart-indicators.js · .tl-ind-bar · z-index 6)은 차트 칸
   * 왼쪽 위에 절대자리(top:6px)로 붙어 있습니다. 리플레이 안내줄도 같은
   * 자리에서 시작해서 칩 줄을 통째로 덮었습니다.
   *
   * 실측 (2026-09-02 · 360 · localhost · 칩 줄 접힌 상태)
   *   칩 줄   23,62~263,85 (23px)   안내줄 21,62~339,120 (58px)
   *   겹침 240 x 22.5px = ★칩 줄 전체★
   *
   * ⚠️ 이게 왜 나쁘냐면 — 안내줄은 pointer-events:none 이라 ★누르면 뒤에
   *    있는 칩이 눌립니다★. 회원은 안내줄을 눌렀는데 지표 목록이 펼쳐집니다.
   *    "안 보이는데 눌린다" 라서 회원이 고장인 줄도 모릅니다.
   *
   * 고치는 법 — 안내줄을 칩 줄 ★아래로 내립니다★.
   *   · 칩 줄은 한 글자도 안 건드립니다 (접지도 않습니다 — 회원이 켜둔 것)
   *   · 안내줄 글씨도 안 줄입니다. 자리만 내립니다
   *   · 칩 줄을 접고 펴면 높이가 23 ↔ 76px 로 바뀌므로 그때마다 다시 잽니다
   * ===================================================================== */
  var BANNER_GAP = 6;

  /** 지금 화면에 떠 있는 지표 칩 줄. 없거나 감춰져 있으면 null */
  function indBarEl() {
    var el = document.querySelector(".tl-ind-bar");
    if (!el) return null;
    try {
      var st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden") return null;
    } catch (e) { /* 무시 */ }
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return el;
  }

  /** 지금 위쪽에 떠 있는 우리 줄 — 리플레이 중이면 안내줄, 고르는 중이면 도움말 */
  function headEl() {
    if (ui.banner && ui.banner.style.display !== "none") return ui.banner;
    if (ui.hint) return ui.hint;
    return null;
  }

  function overlaps(a, b) {
    return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0;
  }
  function numStyle(el, name, dflt) {
    try {
      var v = parseFloat(getComputedStyle(el)[name]);
      return isNaN(v) ? dflt : v;
    } catch (e) {
      return dflt;
    }
  }

  /** 안내줄이 지표 칩 줄을 덮으면 그만큼 내립니다 */
  function placeBanner() {
    var head = headEl();
    if (!head) return;
    /* 지난번에 내린 만큼이 섞이지 않게 먼저 제자리로 돌려놓고 잽니다 */
    head.style.marginTop = "";
    head.style.top = "";
    var ind = indBarEl();
    if (!ind) return;
    var h = head.getBoundingClientRect();
    if (!h.width || !h.height) return;
    if (!overlaps(h, ind.getBoundingClientRect())) return;

    /* ① 차트 칸이 다 보일 때 — 위쪽 여백으로 내립니다 */
    var i = ind.getBoundingClientRect();
    var need = Math.ceil(i.bottom + BANNER_GAP - h.top);
    if (need > 0) head.style.marginTop = (numStyle(head, "marginTop", 8) + need) + "px";

    /* ② 페이지를 내려서 안내줄이 화면 위에 붙어 있을 때(sticky)는 ①이 안
       먹습니다. 붙은 자리(top)를 그만큼 내려 줍니다. 칩 줄이 화면 밖으로
       완전히 나가면 위에서 되돌려 놓으므로 원래 자리로 돌아옵니다. */
    var h2 = head.getBoundingClientRect();
    var i2 = ind.getBoundingClientRect();
    if (!overlaps(h2, i2)) return;
    var need2 = Math.ceil(i2.bottom + BANNER_GAP - h2.top);
    if (need2 > 0) head.style.top = (numStyle(head, "top", 8) + need2) + "px";
  }

  /** 위(안내줄)부터 맞추고 아래(막대)를 맞춥니다 — 막대가 안내줄 자리를 봅니다 */
  function relayout() {
    placeBanner();
    placeBar();
  }

  function placeBarSoon() {
    if (place.raf) return;
    place.raf = 1;
    var run = function () { place.raf = 0; relayout(); };
    if (window.requestAnimationFrame) window.requestAnimationFrame(run);
    else setTimeout(run, 16);
  }

  /* 목록은 생겼다 없어졌다 하고(단추를 누르면 안이 다시 그려집니다) 자리도
     스크롤을 따라 움직입니다. 그래서 셋 다 봅니다 —
     ① 차트 칸에 목록이 붙고 떨어지는 것  ② 페이지 스크롤  ③ 창 크기 */
  function watchDrawList(on) {
    on = !!on;
    if (on === place.watching) return;
    place.watching = on;
    if (on) {
      var wrap = chartWrap();
      if (wrap && window.MutationObserver && !place.mo) {
        place.mo = new MutationObserver(placeBarSoon);
        place.mo.observe(wrap, { childList: true, subtree: true });
      }
      window.addEventListener("scroll", placeBarSoon, true);
      window.addEventListener("resize", placeBarSoon, false);
    } else {
      if (place.mo) { try { place.mo.disconnect(); } catch (e) { /* 무시 */ } place.mo = null; }
      window.removeEventListener("scroll", placeBarSoon, true);
      window.removeEventListener("resize", placeBarSoon, false);
    }
  }

  function showLock() {
    var panel = document.querySelector(".amitalk-order");
    if (!panel || ui.lock) return;
    css();
    if (getComputedStyle(panel).position === "static") panel.style.position = "relative";
    var d = document.createElement("div");
    d.className = "tl-rp-lock";
    d.innerHTML =
      '<div class="tl-rp-lockbox">' +
      '<div class="t">리플레이 중에는 주문할 수 없습니다</div>' +
      '<div class="s">지금 차트는 과거 화면입니다.<br>보이는 값이 지금 시세와 달라서 주문을 막았습니다.</div>' +
      '<button type="button">리플레이 끄기</button>' +
      "</div>";
    d.querySelector("button").addEventListener("click", function () { stop(true); });
    panel.appendChild(d);
    ui.lock = d;
  }
  function hideLock() {
    if (ui.lock && ui.lock.parentNode) ui.lock.parentNode.removeChild(ui.lock);
    ui.lock = null;
    hideMobileLock();
  }

  /* 폰에서는 주문창(.amitalk-order)이 접혀 있고(실측 360: 0 x 0),
     아래 고정 막대 .tl-order-bar 의 매수/매도 버튼이 주문 입구입니다.
     그 막대를 덮습니다. 막대가 없는 폭(데스크톱)에서는 아무것도 안 합니다. */
  function showMobileLock() {
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || ui.mlock) return;
    var r = bar.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    css();
    var d = document.createElement("div");
    d.className = "tl-rp-mlock";
    d.style.left = Math.round(r.left) + "px";
    d.style.width = Math.round(r.width) + "px";
    d.style.top = Math.round(r.top) + "px";
    d.style.height = Math.round(r.height) + "px";
    d.innerHTML = '<span>리플레이 중 · 주문 불가</span><button type="button">리플레이 끄기</button>';
    d.querySelector("button").addEventListener("click", function () { stop(true); });
    document.body.appendChild(d);
    ui.mlock = d;
  }
  function hideMobileLock() {
    if (ui.mlock && ui.mlock.parentNode) ui.mlock.parentNode.removeChild(ui.mlock);
    ui.mlock = null;
  }

  /* 시간대는 차트 시간축과 같은 것을 씁니다.
     ⚠ App.ChartTimezone.getZone() 은 ★목록의 id★("LOCAL"/"KST"...)를 돌려줍니다.
       그대로 Intl 에 넣으면 RangeError 라 시각이 엉뚱한 형식으로 나옵니다(실측).
       ZONES 에서 진짜 시간대 이름(tz)을 찾아 씁니다. LOCAL 이면 null = 내 시간. */
  function zoneId() {
    try {
      var TZ = App.ChartTimezone;
      if (!TZ || typeof TZ.getZone !== "function") return null;
      var z = TZ.getZone();
      if (!z) return null;
      if (typeof z === "object") return z.tz || null;
      var list = TZ.ZONES || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === z) return list[i].tz || null;
      return null;
    } catch (e) { return null; }
  }

  /* "2026-09-02 19:52" — 트레이딩뷰 리플레이 라벨과 같은 24시간 표기입니다.
     ko-KR 로 그냥 format 하면 "2026. 9. 2. 오후 7:52:00" 처럼 길어져
     360 에서 안내줄이 한 줄 더 늘어납니다(실측). 그래서 직접 조립합니다. */
  function fmtTime(sec) {
    var d = new Date(sec * 1000);
    var opt = {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    };
    var tz = zoneId();
    if (tz) opt.timeZone = tz;
    try {
      var p = {};
      new Intl.DateTimeFormat("en-GB", opt).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
      if (p.year && p.month && p.day && p.hour && p.minute) {
        return p.year + "-" + p.month + "-" + p.day + " " + p.hour + ":" + p.minute;
      }
      return new Intl.DateTimeFormat("ko-KR", opt).format(d);
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function refresh() {
    if (ui.btn) ui.btn.setAttribute("aria-pressed", state.on || state.picking ? "true" : "false");
    if (!ui.layer) return;
    if (ui.playBtn) {
      ui.playBtn.innerHTML = svg(state.playing ? ICON.pause : ICON.play);
      ui.playBtn.classList.toggle("on", state.playing);
    }
    if (ui.speed) ui.speed.textContent = state.speed + "x";
    var when = state.cutTime ? fmtTime(state.cutTime) : "";
    if (ui.date) ui.date.textContent = when;
    if (ui.banner) {
      ui.banner.innerHTML =
        '<span class="l1"><b>리플레이 중</b> ' + esc(when) + " " + ohlcText() + "</span>" +
        '<span class="l2"><span class="w">과거 화면입니다. 지금 시세가 아니고, 주문할 수 없습니다.</span>' +
        '<span class="n">과거 화면 · 주문 불가</span></span>';
    }
    /* 값이 바뀌면 안내줄 높이도 바뀝니다 — 지표 칩 줄을 다시 안 덮게 잽니다 */
    placeBanner();
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* 지금 리플레이 중인 봉의 시가·고가·저가·종가.
     값 표기는 App.Utils 를 그대로 씁니다 — 표시 통화(USDT/원)를 따라갑니다. */
  function ohlcText() {
    var cand = entryByKind("candle");
    if (!cand || state.cutTime === null) return "";
    var b = byTime(cand).get(state.cutTime);
    if (!b || typeof b.close !== "number") return "";
    function m(v) {
      try {
        if (App.Utils && App.Utils.formatCurrencyPlain) return App.Utils.formatCurrencyPlain(v);
      } catch (e) { /* 무시 */ }
      return String(v);
    }
    var dir = b.close > b.open ? "up" : b.close < b.open ? "down" : "";
    /* 좁은 화면에서는 종가만 남깁니다 (아래 media query) */
    return '<span class="ohlc ' + dir + '">' +
      '<span class="w">시 ' + m(b.open) + " 고 " + m(b.high) + " 저 " + m(b.low) + " </span>" +
      "종 " + m(b.close) + "</span>";
  }

  /* ---------------- 가로 막대 버튼 ---------------- */
  function attachButton() {
    if (off) return;
    var bar = document.querySelector(".tlc-toolbar");
    if (!bar) return;
    if (ui.btn && bar.contains(ui.btn)) return;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tlc-btn";
    b.setAttribute("aria-pressed", "false");
    b.setAttribute("title", "리플레이 (과거로 돌아가 한 봉씩 다시 보기)");
    b.innerHTML = '<svg class="tlc-ico" viewBox="0 0 24 24">' + ICON.replay + "</svg>";
    b.addEventListener("click", function () {
      if (state.on) { stop(true); return; }
      if (state.picking) { setPicking(false); return; }
      setPicking(true);
    });

    /* 트레이딩뷰와 같은 자리 — 알람 다음입니다 */
    var after = null;
    var btns = bar.querySelectorAll(".tlc-btn");
    for (var i = 0; i < btns.length; i++) {
      var t = btns[i].getAttribute("title") || "";
      if (t.indexOf("알람") === 0) after = btns[i];
    }
    if (after && after.nextSibling) bar.insertBefore(b, after.nextSibling);
    else if (after) bar.appendChild(b);
    else {
      var sp = bar.querySelector(".tlc-spacer");
      if (sp) bar.insertBefore(b, sp);
      else bar.appendChild(b);
    }
    ui.btn = b;
    refresh();
  }

  /* ---------------- 키보드 ---------------- */
  function onKey(ev) {
    if (off) return;
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (ev.key === "Escape") {
      if (state.picking) { setPicking(false); ev.preventDefault(); }
      return;
    }
    if (!state.on) return;
    if (ev.key === "ArrowRight") { pause(); stepForward(); ev.preventDefault(); }
    else if (ev.key === "ArrowLeft") { pause(); stepBack(); ev.preventDefault(); }
    else if (ev.key === " " || ev.code === "Space") { if (state.playing) pause(); else play(); ev.preventDefault(); }
  }

  /* ---------------- 시작 ---------------- */
  var keepTimer = null;

  function boot() {
    try {
      var v = App.Storage && App.Storage.load ? App.Storage.load(SPEED_KEY, 1) : 1;
      if (SPEEDS.indexOf(Number(v)) >= 0) state.speed = Number(v);
    } catch (e) { /* 무시 */ }

    keepTimer = setInterval(function () {
      if (off) return;
      attachButton();
      if (!state.on) { scanSeries(); return; }
      /* 리플레이 중 — 덮개가 사라졌거나(다시 그려짐) 자리가 바뀌었으면 다시 붙입니다 */
      if (!ui.lock || !ui.lock.isConnected) { ui.lock = null; showLock(); }
      relayout(); /* 목록·칩 줄이 바뀌는 것을 놓쳤을 때의 안전망 */
      var bar = document.querySelector(".tl-order-bar");
      if (bar) {
        var r = bar.getBoundingClientRect();
        if (!ui.mlock || !ui.mlock.isConnected) { ui.mlock = null; showMobileLock(); }
        else if (Math.abs(parseFloat(ui.mlock.style.top) - r.top) > 1 ||
          Math.abs(parseFloat(ui.mlock.style.width) - r.width) > 1) {
          hideMobileLock();
          showMobileLock();
        }
      }
    }, 1000);

    document.addEventListener("keydown", onKey, false);

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", function () { if (state.on) stop(false); setPicking(false); });
      App.Bus.on("interval:change", function () { if (state.on) stop(false); setPicking(false); });
      /* 표시 통화(USDT/원)가 바뀌면 안내줄의 시·고·저·종도 같이 바뀝니다 */
      App.Bus.on("currency:change", function () { if (state.on) refresh(); });
      /* 안전장치 — 리플레이 중에 포지션이 생기면(다른 탭 등) 바로 끕니다 */
      App.Bus.on("trading:update", function (s) {
        if (state.on && s && (s.position || s.pendingOrder)) {
          stop(true);
          toast("포지션이 생겨 리플레이를 껐습니다");
        }
      });
    }
    installOrderGuard();
    attachButton();
  }

  if (!patchLibrary()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patchLibrary() || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  function disable() {
    stop(true);
    setPicking(false);
    off = true;
    /* 되풀이 타이머를 멈춥니다 — 오래 켜 두면 조금씩 느려집니다 */
    if (keepTimer) { clearInterval(keepTimer); keepTimer = null; }
    if (ui.btn && ui.btn.parentNode) ui.btn.parentNode.removeChild(ui.btn);
    if (ui.layer && ui.layer.parentNode) ui.layer.parentNode.removeChild(ui.layer);
    hideLock();
    ui = {};
  }

  return {
    start: start,
    stop: stop,
    stepForward: stepForward,
    stepBack: stepBack,
    play: play,
    pause: pause,
    setSpeed: setSpeed,
    setPicking: setPicking,
    disable: disable,
    isOn: function () { return state.on; },
    isPicking: function () { return state.picking; },
    getState: function () {
      return { on: state.on, picking: state.picking, playing: state.playing, cutTime: state.cutTime, speed: state.speed };
    },
    getPerf: function () { return JSON.parse(JSON.stringify(perf)); },
    resetPerf: resetPerf,
    SPEEDS: SPEEDS,
    GUARDED_FOR_TEST: GUARDED,
    getSeriesCountForTest: function () { return reg.length; },
    /* 「그린 것 목록」과 자리 다툼 — 확인용 */
    placeBarForTest: placeBar,
    placeBannerForTest: placeBanner,
    relayoutForTest: relayout,
    getBarPlacementForTest: function () { return { folded: place.folded, lift: place.lift }; },
    /* 끄면 보던 자리로 — 확인용 */
    getScrollMarkForTest: function () { return state.scroll0; },
    LIST_GAP: LIST_GAP,
    getEntriesForTest: function () { return reg.slice(); }
  };
})();
