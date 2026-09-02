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
    interval: null
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
       chart.js 의 현재가 선은 제목이 빈 첫 번째 선입니다(js/chart.js:405). */
    if (e.kind === "candle" && typeof s.createPriceLine === "function" && !s.__tlReplayPL) {
      var origPL = s.createPriceLine.bind(s);
      s.createPriceLine = function (opts) {
        var ln = origPL(opts);
        try {
          priceLines.push({ line: ln, title: (opts && opts.title) || "" });
          if (!liveLine && (!opts || !opts.title)) liveLine = ln;
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
  }
  function hideBars() {
    if (ui.bar) ui.bar.style.display = "none";
    if (ui.banner) ui.banner.style.display = "none";
    if (ui.menu) ui.menu.style.display = "none";
    try { document.documentElement.removeAttribute("data-tl-replay"); } catch (e) { /* 무시 */ }
    hideLock();
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
    getEntriesForTest: function () { return reg.slice(); }
  };
})();
