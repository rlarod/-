/* =========================================================================
 * js/all-symbol-feed.js — App.AllSymbolFeed
 * =========================================================================
 * 네 종목 ★전부★ 의 시세(현재가·등락률)를 받아 App.Bus 로 흘려보냅니다.
 *
 * ── 왜 필요한가 ──────────────────────────────────────────────────────────
 *   js/websocket.js:173 은 App.Config.getActiveSymbol() ★한 종목★ 만 엽니다.
 *   그래서 지금 보고 있는 종목 외 3개는 값이 영원히 없습니다.
 *   바이낸스에는 값이 있습니다(2026-10-01 실측) — 우리가 안 받고 있을 뿐입니다.
 *
 *       QQQUSDT       744.35   +0.770%
 *       SAMSUNGUSDT   197.53   -0.992%
 *       SKHYNIXUSDT  1308.58   -0.955%
 *
 * ── ⛔ 이 파일은 데이터만 담당합니다. 화면을 하나도 안 건드립니다 ─────────
 *   document / DOM 접근이 ★한 줄도 없습니다★. 그리는 일은 다음 건입니다
 *   (대표님 홈페이지 전면 개편 시안이 아직 안 정해졌습니다).
 *   tests/all-symbol-feed.test.js 가 DOM 접근 0건을 봉인합니다.
 *
 * ── ⛔ 기존 조합 스트림(js/websocket.js)에 끼워 넣지 않았습니다 ──────────
 *   js/websocket.js:89~165 의 if-사슬은 kline / 24hrTicker / markPriceUpdate /
 *   trade ★네 가지만★ 처리합니다. 거기에 다른 종목을 얹으면
 *     · @ticker 를 얹으면     ticker:update 로 방송돼 24H 통계가 종목끼리 섞입니다
 *     · @miniTicker 를 얹으면 if-사슬이 조용히 버려서 App.Bus 로 안 나옵니다
 *   js/multi-symbol-view.js:26~31 주석도 같은 이유로 "붙이지 말라" 고 적어뒀습니다.
 *   그래서 ★자기 연결을 따로★ 엽니다. js/websocket.js 는 한 글자도 안 고쳤습니다.
 *
 * ── 소켓(가) vs REST 폴링(나) — 2026-10-01 둘 다 실제로 눌러보고 골랐습니다 ──
 *   골라 쓴 것 : (가) WebSocket  — 아래 숫자 때문입니다
 *
 *     (가) wss://fstream.binance.com/market/stream?streams=...@ticker 4개
 *            연결(open)까지   180 ms
 *            4종목 첫 값까지  2,040 ms (하이닉스 675 / 삼성 791 / 나스닥 1,273 / BTC 2,040)
 *            10초 메시지 수   17건 (종목당 약 2초 간격) · 버린 건수 0
 *            REST 호출 수     0건 → 레이트리밋(weight) 소모 0
 *            등락률           바이낸스가 P 필드로 ★계산해서 보내줍니다★
 *                             (우리가 다시 계산하지 않습니다 = 계산식 두 벌 방지)
 *
 *     (나) GET https://fapi.binance.com/fapi/v1/ticker/24hr
 *            종목 1개씩 4번   60 ms × 4 / 372 B × 4 / weight 1 × 4
 *            전체 목록 1번    153 ms / ★292,319 B★ / weight 40 / 787종목 중 4개만 씀
 *            symbols=[...] 로 4개만 달라고 해도 ★필터가 안 먹고 787개 전부★ 옵니다
 *                             (fapi v1 ticker/24hr 은 symbols 파라미터 미지원 — 실측)
 *            3초 간격 폴링이면 분당 80회 / weight 80. 소켓은 0.
 *
 *     → (가) 가 ①대역폭이 훨씬 작고 ②레이트리밋을 안 먹고 ③밀어주는 방식이라
 *       폴링 간격만큼 값이 늦지 않습니다. 등락률을 거래소가 계산해 주는 것도
 *       (가) 쪽입니다.
 *
 *   ⚠ ★경로를 /market 으로 써야 합니다.★ 실측에서 root(/stream?...) 로 열면
 *     소켓은 ★정상적으로 open 되고 오류도 0건인데 15초 동안 메시지가 0건★
 *     이었습니다. 전형적인 조용한 고장입니다. 끊기지도 않으니 눈치챌 방법이
 *     없습니다. tests/stream-signals.test.js 의 경로 카탈로그(@ticker→market)가
 *     이 파일도 같이 검사합니다.
 *
 *         /market/stream?...@ticker  10초 16건 · 4종목 전부  OK
 *         /stream?...@ticker         15초  0건 · 0종목       실패 (open 은 됨)
 *
 * ── 끊기면 다시 붙습니다 (조용히 죽지 않습니다) ─────────────────────────
 *   onclose 에서 1초 → 2 → 4 → 8 → 15초(상한) 로 늘려가며 다시 붙습니다.
 *   한 번 제대로 붙으면 다음 끊김에 또 1초부터 시작합니다(onopen 에서 되돌림).
 *
 *   실측 2026-10-01 — 소켓을 세 번 강제로 끊고, ★끊김을 감지한 순간부터 다시
 *   값이 들어오기까지★ 를 쟀습니다. 3번 모두 스스로 되살아났습니다.
 *
 *       1회 1,257 ms   2회 2,215 ms   3회 1,746 ms
 *       opens 4 · closes 3 · dropped 0 · 끝 상태 open
 *
 *   상태는 App.Bus "allsymbol:status" 로 나갑니다
 *   (connecting / open / closed / reconnecting / idle / unsupported).
 *   ⚠ 조용히 죽지 않는다는 뜻입니다 — 끊기면 closed 가 반드시 한 번 나갑니다.
 *
 * ── ⭐ 아직 안 옴(null) 과 진짜 0 을 구분합니다 ──────────────────────────
 *   이 프로젝트에서 조용한 고장이 가장 자주 나온 자리입니다.
 *
 *       get("QQQUSDT") === null   값이 ★아직 한 번도 안 왔습니다★
 *       get(...).price === 0      거래소가 진짜 0 을 보냈습니다
 *       has("QQQUSDT") === false  위 두 경우를 헷갈리지 않게 따로 물어보는 통로
 *
 *   숫자가 아닌 값(NaN·null·undefined)이 오면 ★저장하지 않고 버립니다★.
 *   버린 건수는 getStats().dropped 로 셉니다 — 0 으로 덮어써서 숨기지 않습니다.
 *   바이낸스가 연결마다 보내는 ★빈 프레임 1개★ 는 데이터가 아니라 keepalive 라서
 *   dropped 가 아니라 getStats().empty 로 따로 셉니다(실측 — 48프레임 중 1개).
 *   섞어 세면 멀쩡한데 "버린 게 1건 있다" 로 보여서 없는 고장을 찾게 됩니다.
 *   값이 왔지만 오래됐는지는 getAll()[심볼].ageMs 로 봅니다.
 *
 * ── 종목 목록을 여기 적지 않습니다 ──────────────────────────────────────
 *   App.SymbolRegistry(js/symbol-registry.js) 에서 읽습니다. 종목이 늘면
 *   그 파일만 고치면 이 파일은 그대로 따라갑니다.
 *
 * ── 쓰는 법 ──────────────────────────────────────────────────────────────
 *       App.Bus.on("allsymbol:ticker", function (q) {
 *         q.symbol · q.price · q.changePercent · q.high · q.low · q.receivedAt
 *       });
 *       App.AllSymbolFeed.get("QQQUSDT")   // 마지막 값 또는 null
 *       App.AllSymbolFeed.getAll()         // 전 종목 스냅샷(안 온 종목은 null)
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/all-symbol-feed.js"></script> 한 줄과
 *   main.js 의 "AllSymbolFeed" 한 개를 지웁니다. 그러면 소켓이 아예 안 열립니다.
 * ========================================================================= */
(function () {
  "use strict";

  window.App = window.App || {};
  if (App.AllSymbolFeed) return; /* 두 번 켜면 소켓이 두 개 열립니다 */

  /* 구독할 스트림 종류. "@ticker" 는 /market 경로입니다
     (tests/stream-signals.test.js 의 카탈로그와 같은 짝) */
  var STREAM_SUFFIX = "@ticker";

  /* App.Config 에서 주소를 뽑아 쓰고(단일 출처), 못 뽑으면 이 값을 씁니다.
     ⚠ /market 이어야 합니다 — 위 설명의 실측(root 는 0건) 참고 */
  var URL_PREFIX_FALLBACK = "wss://fstream.binance.com/market/stream?streams=";

  var RECONNECT_MIN_MS = 1000;
  var RECONNECT_MAX_MS = 15000;

  var quotes = {};       /* 심볼 -> 값. ★한 번도 안 온 심볼은 키가 아예 없습니다★ */
  var ws = null;
  var reconnectDelay = RECONNECT_MIN_MS;
  var reconnectTimer = null;
  var state = "idle";    /* idle | connecting | open | closed | unsupported */
  var started = false;
  var stats = {
    messages: 0,   /* 쓸 수 있는 값으로 받아들인 건수 */
    dropped: 0,    /* 숫자가 아니어서 버린 건수 — 0 으로 숨기지 않습니다 */
    empty: 0,      /* 빈 프레임(바이낸스가 보내는 무해한 keepalive). 아래 설명 참고 */
    opens: 0,
    closes: 0,
    lastMessageAt: null,
    lastOpenAt: null,
  };

  /* ---------------- 작은 도구 ---------------- */

  /* 숫자로 바꿀 수 없으면 ★null★ 을 줍니다. 0 으로 지어내지 않습니다. */
  function num(v) {
    if (v === null || v === undefined || v === "") return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function now() {
    return Date.now();
  }

  function emit(event, payload) {
    if (App.Bus && typeof App.Bus.emit === "function") App.Bus.emit(event, payload);
  }

  /* 종목 목록 — App.SymbolRegistry 가 단일 출처입니다.
     dataSource 를 보는 것은 "어느 거래소에 물어볼지" 를 고르는 일입니다
     (화면의 준비중 판정이 아닙니다 — 그 판정은 isMock() 담당). */
  function targetSymbols() {
    var reg = App.SymbolRegistry;
    if (!reg || typeof reg.getAll !== "function") return [];
    var out = [];
    reg.getAll().forEach(function (s) {
      if (s && s.symbol && s.dataSource === "binance") out.push(s.symbol);
    });
    return out;
  }

  function buildUrl(list) {
    var prefix = URL_PREFIX_FALLBACK;
    try {
      if (App.Config && typeof App.Config.buildCombinedStreamUrl === "function" && list.length) {
        var u = App.Config.buildCombinedStreamUrl(list[0]);
        var i = u.indexOf("/stream?");
        if (i > 0) prefix = u.slice(0, i) + "/stream?streams=";
      }
    } catch (e) {
      /* 주소를 못 뽑으면 위 기본값을 씁니다 */
    }
    var streams = list.map(function (s) {
      return String(s).toLowerCase() + STREAM_SUFFIX;
    });
    return prefix + streams.join("/");
  }

  function setState(next, extra) {
    state = next;
    var payload = { state: next };
    if (extra) {
      for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) payload[k] = extra[k];
    }
    emit("allsymbol:status", payload);
  }

  /* ---------------- 받은 값 해석 ---------------- */

  /* 바이낸스 24hrTicker 한 건을 우리 형태로 바꿉니다.
     쓸 수 없는 값이면 null 을 돌려줍니다(저장도 방송도 안 합니다). */
  function toQuote(d) {
    if (!d || typeof d !== "object") return null;
    var symbol = d.s;
    if (!symbol || typeof symbol !== "string") return null;
    var price = num(d.c);
    if (price === null) return null; /* 현재가가 없으면 쓸 수 없습니다 */
    return {
      symbol: symbol,
      price: price,
      changePercent: num(d.P), /* 바이낸스가 계산해 준 값. 우리가 다시 계산하지 않습니다 */
      change: num(d.p),
      open: num(d.o),
      high: num(d.h),
      low: num(d.l),
      quoteVolume: num(d.q),
      volume: num(d.v),
      eventTime: num(d.E),
      receivedAt: now(),
      source: "ws",
    };
  }

  function handleMessage(raw) {
    /* ⚠ 바이낸스는 연결마다 ★빈 프레임 한 개★ 를 보냅니다 (2026-10-01 실측 —
       48프레임 중 1개가 길이 0 의 빈 문자열). 데이터가 아니라 keepalive 라서
       dropped 로 세지 않고 empty 로 따로 셉니다. 섞어서 세면 "버린 게 1건
       있다" 로 보여서 다음 사람이 없는 고장을 찾습니다. */
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      stats.empty++;
      return;
    }
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (e) {
      stats.dropped++;
      return;
    }
    var d = msg && msg.data ? msg.data : msg;
    var q = toQuote(d);
    if (!q) {
      stats.dropped++;
      return;
    }
    quotes[q.symbol] = q;
    stats.messages++;
    stats.lastMessageAt = q.receivedAt;
    emit("allsymbol:ticker", q);
  }

  /* ---------------- 연결 ---------------- */

  function clearReconnect() {
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (!started) return;
    clearReconnect();
    var wait = reconnectDelay;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      connect();
    }, wait);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
    emit("allsymbol:status", { state: "reconnecting", afterMs: wait });
  }

  function connect() {
    if (!started) return;
    var list = targetSymbols();
    if (!list.length) {
      /* 종목 목록이 없으면 주소를 지어내지 않습니다 — 조용히 멈추지 말고 알립니다 */
      setState("closed", { reason: "App.SymbolRegistry 에서 종목을 못 읽었습니다" });
      return;
    }

    var url = buildUrl(list);
    setState("connecting", { url: url, symbols: list.slice() });

    var socket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      setState("closed", { reason: e && e.message ? e.message : String(e) });
      scheduleReconnect();
      return;
    }
    ws = socket;

    socket.onopen = function () {
      if (ws !== socket) return;
      reconnectDelay = RECONNECT_MIN_MS;
      stats.opens++;
      stats.lastOpenAt = now();
      setState("open", { symbols: list.slice() });
    };
    socket.onmessage = function (evt) {
      if (ws !== socket) return;
      handleMessage(evt.data);
    };
    socket.onerror = function () {
      if (ws !== socket) return;
      try {
        socket.close();
      } catch (e) {
        /* noop */
      }
    };
    socket.onclose = function (evt) {
      if (ws !== socket) return;
      ws = null;
      stats.closes++;
      setState("closed", { code: evt && evt.code !== undefined ? evt.code : null });
      scheduleReconnect();
    };
  }

  /* ---------------- 밖에서 쓰는 통로 ---------------- */

  /* 마지막 값. ★한 번도 안 왔으면 null★ (진짜 0 은 {price:0} 으로 옵니다) */
  function get(symbol) {
    if (!symbol) return null;
    var q = quotes[symbol];
    return q ? q : null;
  }

  /* 값이 한 번이라도 왔는지. null 과 0 을 헷갈리지 않게 따로 둔 통로입니다. */
  function has(symbol) {
    return !!(symbol && quotes[symbol]);
  }

  /* 전 종목 스냅샷. 안 온 종목도 ★키는 있고 값이 null★ 입니다 —
     "종목이 없다" 와 "값이 안 왔다" 를 구분할 수 있게. */
  function getAll() {
    var out = {};
    var t = now();
    targetSymbols().forEach(function (s) {
      var q = quotes[s];
      if (!q) {
        out[s] = null;
        return;
      }
      var copy = {};
      for (var k in q) if (Object.prototype.hasOwnProperty.call(q, k)) copy[k] = q[k];
      copy.ageMs = t - q.receivedAt;
      out[s] = copy;
    });
    return out;
  }

  function isConnected() {
    return state === "open";
  }

  function getState() {
    return state;
  }

  function getStats() {
    var o = {};
    for (var k in stats) if (Object.prototype.hasOwnProperty.call(stats, k)) o[k] = stats[k];
    return o;
  }

  function start() {
    if (started) return;
    if (typeof WebSocket !== "function") {
      /* 테스트(jsdom) 처럼 WebSocket 이 없는 곳에서는 조용히 아무것도 안 합니다 */
      setState("unsupported");
      return;
    }
    started = true;
    reconnectDelay = RECONNECT_MIN_MS;
    connect();
  }

  function stop() {
    started = false;
    clearReconnect();
    var socket = ws;
    ws = null;
    if (socket) {
      try {
        socket.close();
      } catch (e) {
        /* noop */
      }
    }
    setState("idle");
  }

  App.AllSymbolFeed = {
    init: start,
    start: start,
    stop: stop,
    get: get,
    has: has,
    getAll: getAll,
    isConnected: isConnected,
    getState: getState,
    getStats: getStats,
  };
})();
