/* =========================================================================
 * js/symbol-stream-switch.js — App.SymbolStreamSwitch
 * =========================================================================
 * 종목 추가 4번(마지막) 관문 — "종목을 바꾸면 시세도 따라오게" (2026-08-27)
 *
 * 이 파일 하나가 실제로 종목을 전환합니다. 앞의 세 관문(symbol-guard /
 * symbol-sync-bridge / chart-symbol-switch)은 전부 "받는 쪽" 준비였고,
 * 신호를 쏘는 곳은 여기가 처음입니다.
 *
 * ⛔ 수정 금지 파일을 한 글자도 안 건드립니다.
 *    js/websocket.js · js/orderbook.js · js/chart.js · js/ui.js ·
 *    js/trading.js 전부 원본 그대로입니다. js/config.js 도 안 고쳤습니다.
 *
 * ── 세 가지를 같이 씁니다. 하나라도 빠지면 안 됩니다 ────────────────────
 *   ① App.Config.getActiveSymbol 덮어쓰기
 *      세 소켓 주소가 전부 이 함수에서 나옵니다.
 *        js/websocket.js:172       buildCombinedStreamUrl(getActiveSymbol())
 *        js/orderbook.js:68        getActiveSymbol().toLowerCase() + "@depth…"
 *        js/trade-stream-fix.js:55 getActiveSymbol().toLowerCase() + "@aggTrade"
 *
 *   ② 전역 WebSocket 을 감싸서 소켓 목록을 들고 있다가 닫기
 *      저장소 전체에서 new WebSocket 은 3곳뿐입니다
 *      (websocket.js:180 · orderbook.js:76 · trade-stream-fix.js:105).
 *      닫으면 세 모듈이 각자 onclose → scheduleReconnect 로 스스로
 *      새 주소에 다시 붙습니다.
 *
 *   ③ interval:change 를 빌려 씁니다
 *      js/websocket.js:245-248 이 재접속과 함께 liveCandle · syntheticCandle
 *      을 비웁니다. 이걸 안 비우면 옛 종목 최고가에 새 종목 종가를 섞은
 *      봉이 방송됩니다. js/chart.js:262 도 이 신호로 과거봉을 새 종목으로
 *      다시 받습니다.
 *
 *   왜 셋 다인가 — ①만으로는 소켓이 안 끊기고, ②만으로는 옛 봉 찌꺼기가
 *   남고, ③만으로는 호가·체결 소켓이 안 끊깁니다(그 둘은 interval:change
 *   를 안 듣습니다).
 *
 * ── ⛔ App.WS.init() · App.OrderBook.init() 을 다시 부르지 않습니다 ─────
 *   init() 은 옛 소켓을 안 닫고 새 소켓만 만듭니다. 옛 소켓이 살아서 같은
 *   패널에 계속 써서, #ob-asks 첫 줄이 두 종목 값 사이를 오갑니다
 *   (조사팀 실측 — 앞 20회 중 9회가 다른 종목 값). 구독과 좀비 감시
 *   타이머도 하나씩 더 늘어납니다.
 *
 * ── ⭐ 전환 순서 (이 순서여야 합니다) ───────────────────────────────────
 *   0) 문 확인 — App.SymbolGuard.isLocked() 이면 아무것도 하지 않습니다
 *   1) 활성 종목 값을 먼저 바꿉니다
 *      ⚠ 이걸 먼저 안 하면 4·5 의 재접속이 "옛 종목" 주소로 붙습니다.
 *        connect() 는 재접속하는 그 순간에 getActiveSymbol() 을 읽습니다.
 *   2) symbol:change 방송
 *   3) 화면에 남은 옛 값을 지웁니다 ← 빠지면 3초간 옛 숫자가 새 이름표를 답니다
 *   4) 호가·체결 소켓 두 개를 닫습니다 (fstream.binance.com 인 것만)
 *   5) interval:change 방송 — "지금 간격" 을 그대로 실어야 합니다
 *      ⚠ 1s/5s/15s 를 실으면 js/interval-guard.js 가 1m 으로 되돌립니다
 *   6) 새 값이 오는지 지켜보고, 안 오면 회원에게 보이게 알립니다
 *      (8초 — 콘솔에만 / 15초 — 화면에 빨간 띠. 실측 근거는 SOFT_MS 주석)
 *
 * ── ⛔ P1 — interval:change 에는 안전장치가 없습니다 ────────────────────
 *   js/symbol-guard.js 의 emit 감싸기는 symbol:change 만 막습니다
 *   (SYMBOL_EVENT 하나). interval:change 를 조건 없이 쏘면 포지션을 든
 *   사람의 소켓만 갈아타고 1번 관문을 그대로 통과합니다.
 *   그래서 이 파일은 isLocked() === false 를 확인한 뒤에만 5) 를
 *   실행합니다. 두 번 겹쳐 확인합니다 — switchTo 진입 시(0번)와
 *   interval:change 를 쏘기 직전.
 *
 *   ⚠ 정직하게 적어둡니다 — 2) 의 symbol:change 는 1) 다음이라
 *     symbol-guard 의 emit 검사(target !== activeSymbol())를 그냥 통과합니다.
 *     즉 실질적인 잠금은 이 파일의 0번 확인입니다. 그래서 두 번 겹쳤습니다.
 *
 * ── 조용한 고장을 드러냅니다 ────────────────────────────────────────────
 *   호가·체결 소켓은 재접속에 실패해도 아무 신호를 안 냅니다. 화면은
 *   멀쩡한데 거기 떠 있는 숫자가 이전 종목 값입니다(조사팀 실측 중 실제로
 *   한 번 실패 — 붙었다가 2초 만에 끊김, 받은 메시지 0건).
 *   → 15초 뒤에도 안 오면 화면 위쪽에 빨간 띠로 알립니다(8초에는 콘솔에만).
 *     값이 뒤늦게 오면 띠는 저절로 사라집니다.
 *
 * ── ⚠ 이 파일이 "하지 않는" 것 — 새로고침하면 BTCUSDT 로 돌아갑니다 ──────
 *   override 는 메모리 변수라 새로고침하면 null 이 됩니다.
 *   부팅할 때 종목을 되돌리는 코드를 일부러 안 넣었습니다(배정 범위 밖).
 *
 *       실측 2026-08-27 — 삼성전자로 바꾸고 새로고침
 *         App.Config.getActiveSymbol()        BTCUSDT      ← 되돌아감
 *         App.SymbolGuard.rememberedSymbol()  SAMSUNGUSDT  ← 값은 남아 있음
 *         App.Config.setActiveSymbol          undefined    ← 되돌릴 손잡이 없음
 *
 *   ⭐ 다만 "기억" 은 우리가 확실히 남깁니다. 3) 의 symbol:change 가
 *      js/symbol-guard.js 의 emit 감싸기를 지나면서 remember(target) 을
 *      부르고, 그 값이 localStorage(btc_sim_v2_trading_symbol)에 남습니다.
 *      실측 — 전환 직후 rememberedSymbol() 이 바로 새 종목으로 바뀌고,
 *      새로고침 뒤에도 그 값이 그대로 살아 있습니다.
 *      새로고침 뒤 청산의 종목을 되찾을 때 이 값을 믿고 써도 됩니다.
 *
 *   ⚠ 화면은 어긋나지 않습니다(전부 BTCUSDT 로 일관). 다만 삼성전자
 *     포지션을 든 채 새로고침하면 활성 종목만 BTCUSDT 가 되므로,
 *     그 상태의 청산 기록이 어느 종목으로 남는지는 이 파일 밖의 문제입니다.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/symbol-stream-switch.js"></script> 한 줄을
 *   지우면 종목 전환이 통째로 사라집니다.
 *   ⚠ 그때는 js/symbol-registry.js 의 세 종목도 enabled:false 로 같이
 *      돌려놓으세요(안 그러면 눌러도 아무 일이 안 일어납니다).
 * ========================================================================= */

window.App = window.App || {};

App.SymbolStreamSwitch = (function () {
  "use strict";

  var STREAM_HOST = "fstream.binance.com";
  var COMBINED_MARK = "/stream?streams="; // 합본(kline·ticker·markPrice) — 5) 가 처리
  /* 새 값이 오는지 보는 시간 — 두 단계입니다.
     ⚠ 처음에 3.5초 하나로 잡았다가 실측에서 헛경보가 났습니다. 재접속은
        "1초 기다렸다가 다시 붙기"(RECONNECT_MIN_MS) 인데다, js/websocket.js 의
        좀비 감시가 interval:change 로 lastMessageAt=0 이 된 직후 2초마다
        "데이터 없음" 으로 판단해 갓 붙은 소켓을 한 번 더 끊는 경우가 있어
        재접속이 1.6배씩 밀립니다(websocket.js 원본 동작, 간격을 바꿀 때도 같음).
     실측(1440, 로컬) — 첫 값 도착 2.0초 / 3.6초 / 5.1초 / 10.0초.
     그래서 8초에는 콘솔에만 적고, 15초까지 안 오면 화면에 띄웁니다.
     진짜 실패는 영영 안 오므로 15초로 늦춰도 놓치지 않습니다. */
  var SOFT_MS = 8000;  // 콘솔 경고만
  var CHECK_MS = 15000; // 회원에게 보이는 경고
  var RECHECK_MS = 1000; // 늦게 온 값으로 경고를 지우는 주기
  var GIVEUP_MS = 30000; // 이만큼 지나면 다시 재보지 않습니다

  var origGetActiveSymbol = null;
  var override = null; // null 이면 원본 값(BTCUSDT)을 그대로 씁니다
  var sockets = []; // { ws, url }
  var seq = 0; // 전환 회차
  var got = { feed: false, book: false, trade: false };
  var watchTimer = null;
  var softTimer = null;
  var recheckTimer = null;
  var alertBox = null;
  var stats = { switches: 0, blocked: 0, failed: 0, closed: 0 };
  var lastMissing = [];

  /* ------------------------------------------------------------------
   * 공통
   * ------------------------------------------------------------------ */
  function baseSymbol() {
    if (origGetActiveSymbol) {
      try {
        return origGetActiveSymbol.call(App.Config);
      } catch (e) {
        /* noop */
      }
    }
    return "BTCUSDT";
  }

  function activeSymbol() {
    if (override) return override;
    if (origGetActiveSymbol) return baseSymbol();
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try {
        return App.Config.getActiveSymbol();
      } catch (e) {
        /* noop */
      }
    }
    return "BTCUSDT";
  }

  function isLocked() {
    if (!App.SymbolGuard || typeof App.SymbolGuard.isLocked !== "function") return false;
    try {
      return !!App.SymbolGuard.isLocked();
    } catch (e) {
      return false;
    }
  }

  /* ⭐ (e) 포지션을 들고도 다른 종목을 "볼" 수 있는가 — 2026-08-27
     한 줄짜리 스위치(js/multi-symbol-view.js)가 없으면 언제나 false 라
     어제와 100% 같습니다.

     그물이 진짜로 작동하는 것을 확인한 뒤에만 엽니다.
       requiredSymbol() !== null   내 포지션 종목을 알고 있다
       getNettedCount() === 1      시세 통로가 정확히 하나로 걸려 있다
     포지션은 있는데 requiredSymbol() 이 아직 null 인 짧은 창이 실제로
     있습니다(복원 직후 ~ 첫 trading:update). 그 창에서는 false 라
     오늘과 똑같이 막힙니다 — 안전한 쪽입니다. */
  function multiViewOn() {
    return !!(
      App.MultiSymbolView &&
      typeof App.MultiSymbolView.isOn === "function" &&
      App.MultiSymbolView.isOn()
    );
  }

  function canViewOther() {
    if (!multiViewOn()) return false;
    try {
      return !!App.MultiSymbolView.netIsWorking();
    } catch (e) {
      return false; /* 못 읽으면 안 여는 쪽으로 */
    }
  }

  function symbolName(sym) {
    if (App.SymbolRegistry && typeof App.SymbolRegistry.getBySymbol === "function") {
      var m = App.SymbolRegistry.getBySymbol(sym);
      if (m && m.name) return m.name;
    }
    return sym;
  }

  function qs(sel) {
    try {
      return document.querySelector(sel);
    } catch (e) {
      return null;
    }
  }
  function qsa(sel) {
    try {
      return Array.prototype.slice.call(document.querySelectorAll(sel));
    } catch (e) {
      return [];
    }
  }

  /* ------------------------------------------------------------------
   * ① App.Config.getActiveSymbol 덮어쓰기
   * ------------------------------------------------------------------ */
  function installConfigHook() {
    if (!App.Config || typeof App.Config.getActiveSymbol !== "function") return false;
    if (App.Config.getActiveSymbol.__streamSwitch) return true;

    var d = Object.getOwnPropertyDescriptor(App.Config, "getActiveSymbol");
    if (d && d.writable === false && !d.set) {
      console.error(
        "[symbol-stream-switch.js] App.Config.getActiveSymbol 을 덮어쓸 수 없습니다 — 종목 전환을 열지 않습니다."
      );
      return false;
    }

    origGetActiveSymbol = App.Config.getActiveSymbol;
    var hooked = function () {
      if (override) return override;
      return origGetActiveSymbol.apply(this, arguments);
    };
    hooked.__streamSwitch = true;
    try {
      App.Config.getActiveSymbol = hooked;
    } catch (e) {
      console.error("[symbol-stream-switch.js] getActiveSymbol 덮어쓰기 실패:", e);
      return false;
    }
    return App.Config.getActiveSymbol === hooked;
  }

  /* ------------------------------------------------------------------
   * ② 전역 WebSocket 감싸기 — 소켓 목록만 들고 있습니다
   * ------------------------------------------------------------------ */
  function prune() {
    var CLOSED = 3;
    sockets = sockets.filter(function (r) {
      return r.ws && r.ws.readyState !== CLOSED;
    });
  }

  function track(ws, url) {
    sockets.push({ ws: ws, url: String(url || "") });
    if (sockets.length > 30) prune();
  }

  function installSocketTracker() {
    var Native = window.WebSocket;
    if (typeof Native !== "function") return false;
    if (Native.__streamSwitch) return true;

    function Tracked(url, protocols) {
      var s = arguments.length > 1 ? new Native(url, protocols) : new Native(url);
      try {
        track(s, url);
      } catch (e) {
        /* 추적에 실패해도 소켓 자체는 정상 동작합니다 */
      }
      return s;
    }
    Tracked.prototype = Native.prototype;
    Tracked.__streamSwitch = true;
    Tracked.__native = Native;
    /* readyState 상수를 그대로 물려줍니다 —
       js/websocket.js 의 좀비 감시가 WebSocket.OPEN 을 씁니다. */
    ["CONNECTING", "OPEN", "CLOSING", "CLOSED"].forEach(function (k) {
      try {
        Tracked[k] = Native[k];
      } catch (e) {
        /* noop */
      }
    });

    try {
      window.WebSocket = Tracked;
    } catch (e) {
      console.error("[symbol-stream-switch.js] WebSocket 감싸기 실패:", e);
      return false;
    }
    return true;
  }

  /* 호가·체결 소켓만 닫습니다.
     ⚠ fstream.binance.com 이 아닌 소켓(Supabase 실시간 등)은 절대 안 닫습니다.
     ⚠ 합본 스트림은 5) 의 interval:change 가 닫습니다(봉 찌꺼기까지 같이
        비워야 하기 때문입니다). */
  function closeFeedSockets() {
    prune();
    var n = 0;
    sockets.forEach(function (r) {
      if (r.url.indexOf(STREAM_HOST) < 0) return;
      if (r.url.indexOf(COMBINED_MARK) >= 0) return;
      try {
        r.ws.close();
        n++;
      } catch (e) {
        /* noop — onclose 가 재연결을 처리합니다 */
      }
    });
    stats.closed += n;
    return n;
  }

  function openFeedUrls() {
    prune();
    return sockets
      .filter(function (r) {
        return r.url.indexOf(STREAM_HOST) >= 0 && r.ws.readyState === 1;
      })
      .map(function (r) {
        return r.url;
      });
  }

  /* ------------------------------------------------------------------
   * 3) 화면에 남은 옛 값 지우기
   * ------------------------------------------------------------------ */
  function blankRows(sel) {
    qsa(sel).forEach(function (row) {
      [".ob-price", ".ob-qty", ".ob-cum"].forEach(function (c) {
        var s = row.querySelector(c);
        if (s) s.textContent = "";
      });
      var bar = row.querySelector(".ob-depth-bar");
      if (bar) bar.style.width = "0%";
      /* 행 자체는 지우지 않습니다 — js/orderbook.js·js/trades.js 가 만든 행을
         재사용하기 때문에(ensureRowEls), 지우면 다시 안 만들어집니다. */
    });
  }

  function setText(sel, text) {
    var e = qs(sel);
    if (e) e.textContent = text;
  }

  function clearStaleScreen() {
    /* 호가 10줄 + 최근 체결 */
    blankRows("#ob-asks .ob-row");
    blankRows("#ob-bids .ob-row");
    blankRows("#recent-trades-list .ob-row");

    /* 호가 현재가 · 화살표 · 마크가격 */
    setText("#ob-current-price", "현재가 -");
    setText("#ob-price-arrow", "");
    setText("#ob-mark-price", "-");

    /* 압력 바 — "모름" 상태로. 50:50 을 지어내지 않습니다 */
    setText("#order-pressure-buy-text", "매수 —");
    setText("#order-pressure-sell-text", "매도 —");
    var bb = qs("#order-pressure-buy");
    var sb = qs("#order-pressure-sell");
    if (bb) bb.style.width = "50%";
    if (sb) sb.style.width = "50%";

    /* 상단 현재가 + 24H 4칸 + 마크가격 · 펀딩비.
       ⚠ 마크가격·펀딩비 칸은 index.html 에 없고 js/chart.js 가 만들어 붙입니다.
         2026-08-27 실측 — 이 둘을 빼먹으니 360 화면에서 삼성전자 이름표 아래에
         "마크가격 78,646.10"(비트코인 값)이 그대로 남았습니다. 마크가격은
         강제청산 판정 기준가라 회원이 가장 오해하기 쉬운 숫자입니다. */
    [
      "#stat-price",
      "#stat-change",
      "#stat-high",
      "#stat-low",
      "#stat-volume",
      "#stat-mark-price",
      "#stat-funding",
    ].forEach(function (s) {
      setText(s, "-");
    });
    var ch = qs("#stat-change");
    if (ch) ch.classList.remove("up", "down");
  }

  /* ------------------------------------------------------------------
   * 3-2) 제목 글자 — index.html 에 박힌 BTCUSDT
   * ------------------------------------------------------------------ */
  /* 포지션 표 종목 칸에 무엇을 쓸 것인가.
     포지션(또는 미체결)이 있으면 그 종목, 없으면 보고 있는 종목입니다. */
  function positionCellSymbol(screenSymbol) {
    if (App.SymbolGuard && typeof App.SymbolGuard.requiredSymbol === "function") {
      try {
        var need = App.SymbolGuard.requiredSymbol();
        if (typeof need === "string" && need) return need;
      } catch (e) {
        /* 못 읽으면 화면 종목으로 — 오늘과 같습니다 */
      }
    }
    return screenSymbol;
  }

  /* 포지션 종목이 바뀌거나 포지션이 사라지면 그 칸만 다시 씁니다.
     (전환을 안 해도 값이 맞아야 하므로 방송에 붙여둡니다.) */
  function refreshPositionCell() {
    setText(".position-symbol-cell .position-symbol-name", positionCellSymbol(activeSymbol()));
  }

  function applyLabels(sym) {
    var s = sym || activeSymbol();

    /* index.html:315 상단 종목명 버튼 */
    setText("#symbol-select-btn .stat-label", s);

    /* index.html:401 호가창 (BTCUSDT) */
    setText("#orderbook-panel .ob-header .ob-title", "호가창 (" + s + ")");

    /* js/trades.js 가 만드는 패널 제목 — 최근 체결 (BTCUSDT) */
    setText("#recent-trades-panel .ob-header .ob-title", "최근 체결 (" + s + ")");

    /* index.html:568 포지션 표 종목 칸.
       그리는 쪽 js/ui.js 는 수정 금지라 DOM 을 밖에서 고쳐 씁니다.

       ⚠ 2026-08-27 정정 — 예전에는 여기에 "포지션이 있으면 전환 자체가
         막히므로 이 값은 언제나 포지션의 종목과 같습니다" 라고 적혀
         있었습니다. 포지션을 들고도 다른 차트를 볼 수 있게 연 순간
         그 말이 거짓이 됐습니다(대표 지시).

       포지션 표는 "지금 보고 있는 종목" 이 아니라 "내가 들고 있는 종목" 을
       보여줘야 합니다. 화면 종목으로 덮으면 회원이 삼성전자 화면을 보는
       동안 BTC 포지션이 삼성전자 포지션으로 보입니다 — 오류도 안 나고
       화면도 멀쩡한 조용한 고장이라, 회원은 그걸 사실로 믿고 판단합니다.
       포지션이 없을 때만 화면 종목을 씁니다(빈 표의 안내 값). */
    setText(".position-symbol-cell .position-symbol-name", positionCellSymbol(s));

    /* 호가창 머리글의 수량 단위(BTC/주)는 js/ob-header-currency.js 담당 */
    if (App.ObHeaderCurrency && typeof App.ObHeaderCurrency.apply === "function") {
      try {
        App.ObHeaderCurrency.apply();
      } catch (e) {
        /* noop */
      }
    }
  }

  /* js/chart.js 가 24H 거래량 뒤에 " BTC" 를 글자로 붙입니다(수정 금지).
     그린 뒤에 단위만 바꿔 씁니다. 값이 이미 맞으면 아무것도 안 하므로
     무한 루프가 없습니다. */
  var volObserver = null;
  var volApplying = false;
  function fixVolumeUnit() {
    /* ⚠ 2026-08-27 — 이 칸의 담당은 차트팀의 js/stat-volume-unit.js 입니다.
       그 파일이 #stat-volume 의 textContent 접근자를 덮어써서 chart.js 가
       쓰는 그 순간에 단위를 갈아끼웁니다(틀린 글자가 한 프레임도 안 보임).
       그 모듈이 살아 있으면 여기서는 손대지 않습니다 — 같은 칸을 두 곳에서
       쓰면 누가 이겼는지 알 수 없게 됩니다.
       그 모듈이 없거나(스크립트를 뺐거나) 설치에 실패했을 때만 우리가 덮습니다. */
    if (App.StatVolumeUnit && typeof App.StatVolumeUnit.isInstalled === "function") {
      try {
        if (App.StatVolumeUnit.isInstalled()) return;
      } catch (err) {
        /* 상태를 못 읽으면 우리가 덮습니다 */
      }
    }
    var e = qs("#stat-volume");
    if (!e) return;
    var txt = e.textContent || "";
    if (!txt || txt === "-") return;
    var unit = "BTC";
    if (App.Utils && typeof App.Utils.qtyUnit === "function") {
      try {
        unit = App.Utils.qtyUnit() || "BTC";
      } catch (err) {
        /* noop */
      }
    }
    var want = txt.replace(/\s+(BTC|주|[A-Z]{2,6})\s*$/, "") + " " + unit;
    if (txt === want) return;
    volApplying = true;
    e.textContent = want;
    volApplying = false;
  }
  function watchVolume() {
    if (volObserver || typeof MutationObserver !== "function") return;
    var e = qs("#stat-volume");
    if (!e) return;
    volObserver = new MutationObserver(function () {
      if (volApplying) return;
      fixVolumeUnit();
    });
    volObserver.observe(e, { childList: true, characterData: true, subtree: true });
  }

  /* ------------------------------------------------------------------
   * 6) 조용한 고장을 드러냅니다
   * ------------------------------------------------------------------ */
  function ensureAlertBox() {
    if (alertBox && alertBox.isConnected) return alertBox;
    alertBox = document.createElement("div");
    alertBox.id = "symbol-stream-alert";
    alertBox.setAttribute("role", "alert");
    alertBox.style.cssText = [
      "position:fixed",
      "left:50%",
      "transform:translateX(-50%)",
      "top:8px",
      "z-index:99999",
      "width:92vw",
      "max-width:560px",
      "box-sizing:border-box",
      "background:#101727",
      "border:1px solid #F0506E",
      "border-radius:10px",
      "color:#E7ECF5",
      "font-size:13px",
      "line-height:1.5",
      "padding:10px 12px",
      "display:none",
    ].join(";");
    document.body.appendChild(alertBox);
    return alertBox;
  }

  function showFailure(sym, missing) {
    var box = ensureAlertBox();
    box.innerHTML = "";
    var t = document.createElement("span");
    t.textContent =
      symbolName(sym) +
      " 시세를 못 받았습니다 (" +
      missing.join(" · ") +
      "). 지금 보이는 숫자는 " +
      symbolName(sym) +
      " 값이 아닐 수 있습니다 — 다시 연결하는 중입니다.";
    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "닫기";
    btn.style.cssText =
      "margin-left:10px;background:#1D273B;border:0;border-radius:6px;color:#E7ECF5;font-size:12px;padding:3px 8px;cursor:pointer";
    btn.addEventListener("click", hideFailure);
    box.appendChild(t);
    box.appendChild(btn);
    box.style.display = "";
  }

  function hideFailure() {
    if (alertBox) alertBox.style.display = "none";
  }

  function missingNow() {
    var out = [];
    if (!got.feed) out.push("현재가·캔들");
    if (!got.book) out.push("호가");
    if (!got.trade) out.push("최근 체결");
    return out;
  }

  function startWatch(sym) {
    if (watchTimer) clearTimeout(watchTimer);
    if (softTimer) clearTimeout(softTimer);
    if (recheckTimer) clearInterval(recheckTimer);
    got = { feed: false, book: false, trade: false };
    var mySeq = seq;
    var started = Date.now();

    /* 1단계 — 콘솔에만 남깁니다(회원 화면은 안 건드립니다).
       재접속이 원래 느린 경우와 진짜 실패를 가르는 근거가 됩니다. */
    softTimer = setTimeout(function () {
      if (mySeq !== seq) return;
      var m = missingNow();
      if (m.length === 0) return;
      console.warn(
        "[symbol-stream-switch.js] " + sym + " — " + SOFT_MS + "ms 안에 " + m.join(" · ") +
          " 가 아직 안 왔습니다(재접속 대기 중일 수 있음). 열려 있는 주소: " +
          openFeedUrls().join(" , ")
      );
    }, SOFT_MS);

    /* 2단계 — 여기까지 안 오면 조용한 고장입니다. 회원에게 보이게 알립니다. */
    watchTimer = setTimeout(function () {
      if (mySeq !== seq) return;
      var missing = missingNow();
      lastMissing = missing.slice();
      if (missing.length === 0) return;
      stats.failed++;
      console.error(
        "[symbol-stream-switch.js] " +
          sym +
          " 로 바꿨는데 " +
          CHECK_MS +
          "ms 안에 " +
          missing.join(" · ") +
          " 가 한 건도 안 왔습니다. 열려 있는 주소: " +
          openFeedUrls().join(" , ")
      );
      showFailure(sym, missing);

      recheckTimer = setInterval(function () {
        if (mySeq !== seq) {
          clearInterval(recheckTimer);
          return;
        }
        var still = missingNow();
        if (still.length === 0) {
          lastMissing = [];
          hideFailure();
          clearInterval(recheckTimer);
          return;
        }
        lastMissing = still.slice();
        showFailure(sym, still);
        if (Date.now() - started > GIVEUP_MS + CHECK_MS) clearInterval(recheckTimer);
      }, RECHECK_MS);
    }, CHECK_MS);
  }

  /* 도착 표시 — 종목이 맞는 것만 셉니다 */
  function markFeed(p) {
    if (p && typeof p.symbol === "string" && p.symbol !== activeSymbol()) return;
    got.feed = true;
  }
  function markTrade(p) {
    if (p && typeof p.symbol === "string" && p.symbol !== activeSymbol()) return;
    got.trade = true;
  }
  /* orderbook:update 에는 종목이 안 실려 옵니다(js/orderbook.js).
     그래서 "지금 새 종목 depth 주소로 열린 소켓이 있는가" 로 대신 확인합니다. */
  function markBook() {
    var sym = activeSymbol().toLowerCase();
    var urls = openFeedUrls();
    for (var i = 0; i < urls.length; i++) {
      if (urls[i].indexOf("@depth") >= 0 && urls[i].indexOf(sym) >= 0) {
        got.book = true;
        return;
      }
    }
  }

  /* ------------------------------------------------------------------
   * 전환 본체
   * ------------------------------------------------------------------ */
  function switchTo(symbol) {
    if (typeof symbol !== "string" || !symbol) return false;

    /* 0) 문 확인 — 여기서 끝나면 아래를 하나도 안 합니다.

       ⭐ 2026-08-27 대표 지시로 "종목 보기" 는 엽니다.
          "바이낸스에서 포지션 잡고 있다고 다른 차트 못 보는 거 아니잖아"
          막을 대상이 "종목 보기" 가 아니라 "주문" 으로 바뀌었습니다.
          차트·호가·최근체결·지표·선긋기는 전부 열립니다.
          주문은 엔진이 구조적으로 한 종목만 들 수 있어서 그대로 막힙니다
          (js/trading.js:116 · :119 — 열 수 있는 게 아니라 없는 기능입니다). */
    if (isLocked() && !canViewOther()) {
      stats.blocked++;
      /* 여기 오는 경우는 두 가지입니다.
         · 기능이 꺼져 있음(js/multi-symbol-view.js 를 뺐음) → 어제 그대로 안내
         · 그물이 아직 안 걸린 아주 짧은 창(복원 직후 ~ 첫 trading:update)
           → 잠깐만 기다리면 됩니다. 옛 안내문("포지션을 정리하세요")은
             이제 틀린 말이라 쓰지 않습니다. */
      var 준비중 = multiViewOn();
      var msg = 준비중
        ? "잠시 후 다시 눌러주세요 — 포지션 보호 장치가 준비 중입니다."
        : (App.SymbolGuard && typeof App.SymbolGuard.message === "function"
            ? App.SymbolGuard.message(symbolName(symbol))
            : "지금은 종목을 바꿀 수 없습니다.");
      console.warn("[symbol-stream-switch.js] " + msg);
      try {
        window.alert(msg);
      } catch (e) {
        /* noop */
      }
      return false;
    }
    if (!App.SymbolRegistry || !App.SymbolRegistry.isEnabled(symbol)) {
      console.warn("[symbol-stream-switch.js] " + symbol + " 은(는) 아직 열려 있지 않습니다.");
      return false;
    }
    if (symbol === activeSymbol()) return false;
    if (!origGetActiveSymbol) {
      console.error("[symbol-stream-switch.js] 준비가 안 됐습니다(getActiveSymbol 미연결).");
      return false;
    }

    var from = activeSymbol();
    seq++;
    stats.switches++;
    hideFailure();

    /* 1) 활성 종목 값을 먼저 바꿉니다 (재접속이 새 주소로 붙게) */
    override = symbol === baseSymbol() ? null : symbol;

    /* 2) symbol:change 방송 */
    var before =
      App.SymbolGuard && App.SymbolGuard.getBlockedCount ? App.SymbolGuard.getBlockedCount() : 0;
    App.Bus.emit("symbol:change", { symbol: symbol, from: from });
    var after =
      App.SymbolGuard && App.SymbolGuard.getBlockedCount ? App.SymbolGuard.getBlockedCount() : 0;
    if (after > before) {
      /* 1번 관문이 막았습니다 — 되돌리고 끝냅니다 */
      override = from === baseSymbol() ? null : from;
      console.warn("[symbol-stream-switch.js] 1번 관문이 전환을 막았습니다 — 되돌렸습니다.");
      return false;
    }

    /* 3) 화면에 남은 옛 값을 지웁니다 */
    clearStaleScreen();
    applyLabels(symbol);

    /* 4) 호가·체결 소켓 닫기 */
    var closed = closeFeedSockets();

    /* 5) interval:change — ⛔ 잠금을 한 번 더 확인한 뒤에만 쏩니다.
          js/symbol-guard.js 는 이 신호를 안 막습니다(P1).

          ⚠⚠ 2026-08-27 — 여기는 위 0) 이 먼저 막아줘서 지금까지 한 번도
             안 닿던 곳입니다. 종목 보기를 여는 순간 여기가 "첫 실행 지점"
             이 됩니다. 그리고 바로 위 4) 에서 호가·체결 소켓을 이미
             닫았습니다. 예전처럼 그냥 return false 하면
             소켓은 닫혔는데 새로 안 붙습니다 — 호가·최근체결이 영영 빈
             채로 남는 조용한 고장입니다.
             그래서 빠져나갈 때도 반드시 다시 붙입니다(원래 종목으로 되돌린
             뒤 interval:change 를 쏩니다). */
    var iv =
      App.Config && typeof App.Config.getActiveInterval === "function"
        ? App.Config.getActiveInterval()
        : "1m";

    if (isLocked() && !canViewOther()) {
      stats.blocked++;
      console.error(
        "[symbol-stream-switch.js] interval:change 직전에 보호 장치가 풀렸습니다 — " +
          from + " 로 되돌리고 소켓을 다시 붙입니다(닫힌 채로 두지 않습니다)."
      );
      override = from === baseSymbol() ? null : from;
      applyLabels(from);
      App.Bus.emit("interval:change", { interval: iv });
      return false;
    }

    App.Bus.emit("interval:change", { interval: iv });

    /* 6) 새 값이 오는지 지켜봅니다 */
    startWatch(symbol);

    console.log(
      "[symbol-stream-switch.js] " +
        from +
        " → " +
        symbol +
        " (간격 " +
        iv +
        " 유지, 닫은 소켓 " +
        closed +
        "개)"
    );
    return true;
  }

  /* ------------------------------------------------------------------ */
  var wired = false;
  function wire() {
    if (wired) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("price:update", markFeed);
    App.Bus.on("kline:update", markFeed);
    App.Bus.on("ticker:update", markFeed);
    App.Bus.on("trade:tick", markTrade);
    App.Bus.on("orderbook:update", markBook);
    App.Bus.on("ticker:update", fixVolumeUnit);
    /* 포지션 표 종목 칸은 전환과 무관하게 늘 포지션 종목이어야 합니다. */
    App.Bus.on("trading:update", refreshPositionCell);
    App.Bus.on("trading:persisted", refreshPositionCell);
    wired = true;
    return true;
  }

  var ready = false;
  function boot() {
    var a = installSocketTracker();
    var b = installConfigHook();
    var c = wire();
    ready = !!(a && b && c);
    return ready;
  }

  function init() {
    boot();
    applyLabels();
    fixVolumeUnit();
    watchVolume();
  }

  /* 소켓 감싸기는 어떤 소켓보다 먼저여야 하므로 스크립트를 읽는 즉시 실행합니다
     (소켓은 전부 main.js boot() = DOMContentLoaded 뒤에 만들어집니다). */
  boot();
  if (!ready) {
    var tries = 0;
    var t = setInterval(function () {
      if (boot() || ++tries > 200) clearInterval(t);
    }, 50);
  }

  return {
    init: init,
    switchTo: switchTo,
    isReady: function () {
      return ready;
    },
    getActiveSymbol: activeSymbol,
    applyLabels: applyLabels,
    clearStaleScreen: clearStaleScreen,
    getStats: function () {
      return {
        switches: stats.switches,
        blocked: stats.blocked,
        failed: stats.failed,
        closed: stats.closed,
      };
    },
    getTrackedCount: function () {
      prune();
      return sockets.length;
    },
    getOpenFeedUrls: openFeedUrls,
    getArrivals: function () {
      return { feed: got.feed, book: got.book, trade: got.trade };
    },
    getLastMissing: function () {
      return lastMissing.slice();
    },
    _closeFeedSockets: closeFeedSockets,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolStreamSwitch;
