/* =========================================================================
 * js/symbol-guard.js — App.SymbolGuard
 * =========================================================================
 * 종목 전환 안전장치 (2026-08-26, [P1] 선행조건)
 *
 * ⚠ 이 파일은 종목 전환을 "열지" 않습니다. 열렸을 때 회원 돈이 사라지지
 *    않도록 미리 자물쇠를 걸어두는 것뿐입니다. 지금 화면 동작은 한 군데도
 *    바뀌지 않습니다(아래 "지금은 아무 일도 안 합니다" 참조).
 *
 * ── 무엇을 막나 (조사팀 2026-08-26 재현, 확신도: 확실) ────────────────────
 *   포지션·미체결 주문에 "어느 종목인지" 가 안 적혀 있습니다.
 *   그래서 활성 종목이 바뀌면 다른 종목 시세가 그대로 옛 포지션에 들어갑니다.
 *
 *       BTC 110,000 에 10배 롱 (증거금 1,000, 청산가 99,550)
 *       → 활성 종목만 ETHUSDT 로 바꾸고 ETH 시세 3,000 이 한 틱
 *       → 강제청산. 손익 -1,000 / ROE -100% / 잔고 100,000 → 98,995
 *          BTC 시세는 한 푼도 안 움직였는데 1,005 USDT 가 사라집니다.
 *
 *   터지는 줄은 js/trading.js:494 (강제청산) 이고, 원인은 js/trading.js:89
 *   의 대조가 "내 포지션의 종목" 이 아니라 "지금 활성 종목" 이라는 점입니다.
 *   js/trading.js · js/auth.js · js/websocket.js · js/config.js 는 전부
 *   수정 금지 파일이라 바깥에서만 막습니다.
 *
 * ── 세 겹 ────────────────────────────────────────────────────────────────
 *   1) 문   — 포지션이나 미체결이 있으면 종목 전환 자체를 거부합니다.
 *             · App.Config 의 종목 변경 함수 이름 7개에 미리 자물쇠를 겁니다.
 *               (아직 그런 함수가 없으므로, "생기는 순간 잠긴 채로 생기게"
 *                합니다. 우리가 함수를 만들지는 않습니다 — 없을 땐 계속
 *                undefined 입니다.)
 *             · symbol:change 방송도 같은 조건으로 막습니다(듣는 곳 4곳).
 *             · 종목 UI 두 곳(상단 드롭다운 · 주문창 목록)의 클릭도 막습니다.
 *   2) 도장 — 포지션·미체결에 symbol 을 찍습니다(App.Storage.save 감싸기).
 *             js/auth.js 가 서버에서 복원할 때 빠뜨리는 것을 auth.js 무수정으로
 *             되살립니다.
 *   3) 그물 — 1) 이 뚫렸을 때만 켜지는 마지막 방어. 내 포지션의 종목과 다른
 *             price:update 를 "거래엔진에게만" 안 보이게 합니다.
 *
 * ── 3) 그물의 부작용을 어떻게 다뤘나 ─────────────────────────────────────
 *   조사팀이 걱정한 것: price:update 를 통째로 버리면 BTC 포지션을 든 채
 *   다른 종목 화면을 볼 때 그 종목 현재가 선까지 멈춥니다.
 *   그래서 App.Bus.emit 을 막지 않고, App.Bus.on 을 감싸서
 *   trading.js 의 구독자 하나만 걸러냅니다.
 *   차트·호가·최근체결·현재가 표시는 전부 그대로 받습니다.
 *   (같은 방식이 js/persist-sync-queue.js:126-140 에 이미 있습니다.)
 *
 *   ⚠ 2026-08-27 실측으로 잡은 것 — "onPriceUpdate 라는 이름" 으로 고르면
 *     안 됩니다. 같은 이름의 구독자가 5개(거래엔진·차트·호가·전황·호가화살표)
 *     라서 시세 53틱에 265건(=5배)이 걸렸습니다. 그물이 켜지는 순간 화면이
 *     통째로 얼어붙는, 바로 그 부작용이 실제로 나 있었습니다.
 *     지금은 본문 지문(checkTriggers/checkPendingOrder)으로 거래엔진 하나만
 *     고릅니다. getNettedCount() 가 1 이 아니면 잘못된 것입니다.
 *
 * ── 종목을 어디에 저장하나 ───────────────────────────────────────────────
 *   App.Storage.save("trading_symbol", ...) → localStorage 키
 *   "btc_sim_v2_trading_symbol". 키에 "trading" 이 들어가야
 *   js/multi-tab-guard.js:105 의 다른 탭 감시에 걸립니다("settings" 에
 *   넣으면 다른 탭 경고가 한 번도 안 뜹니다).
 *   ⚠ 값이 실제로 바뀔 때만 씁니다. 부팅할 때마다 쓰면 다른 탭이
 *      storage 이벤트를 받고 새로고침해서 탭끼리 서로 되새로고침합니다
 *      (multi-tab-guard.js:88 — 작업 중이 아니면 reload).
 *
 * ── 지금은 아무 일도 안 합니다 (동작 변화 0) ─────────────────────────────
 *   · 종목 변경 함수가 아직 없으므로 1) 은 잠긴 문 앞에 서 있기만 합니다.
 *   · UI 두 곳은 "활성 종목과 다르고 + 준비중(mock) 이 아닌" 종목을 눌렀을
 *     때만 막는데, 지금 그런 종목이 0개입니다("준비 중입니다" 안내 그대로).
 *   · 도장은 지금도 BTCUSDT 하나만 찍습니다.
 *   · 그물은 내 포지션 종목과 시세 종목이 다를 때만 켜지는데, 지금은
 *     BTCUSDT 밖에 없어서 한 건도 안 버립니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/symbol-guard.js"></script> 한 줄을 지우면
 *   완전히 원래대로 돌아갑니다. 파일까지 지우려면 그 다음에 이 파일을 지웁니다.
 *   (localStorage 의 btc_sim_v2_trading_symbol 은 남아도 아무도 안 읽습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.SymbolGuard = (function () {
  "use strict";

  /* 종목을 모르는 옛 기록·서버 복원분이 실제로 어느 종목인가.
     2026-08-26 조사: 서버 positions·orders·trades 의 symbol 칸 값이 전부
     BTCUSDT 이고, 지금까지 거래 가능한 종목도 BTCUSDT 뿐이었습니다. */
  var DEFAULT_SYMBOL = "BTCUSDT";

  var TRADING_KEY = "trading";          // trading.js 의 저장 문서 이름
  var SYMBOL_KEY = "trading_symbol";    // 우리 문서. "trading" 이 들어가야 다른 탭 감시에 걸립니다
  var SYMBOL_EVENT = "symbol:change";   // 문자열로만 씁니다 — 우리는 이 신호를 쏘지 않습니다
  var PRICE_EVENT = "price:update";
  var TRADING_HANDLER = "onPriceUpdate"; // js/trading.js:671 이 등록하는 함수 이름

  /* ⚠ 이름만 보면 안 됩니다 — onPriceUpdate 라는 이름의 구독자가 5개입니다.
     js/trading.js:88 · js/chart.js:393 · js/orderbook.js:212 ·
     js/market-war.js:651 · js/orderbook-price-arrow.js:21
     이름만으로 고르면 차트·호가·전황까지 같이 걸러져서, 그물이 켜지는 순간
     화면이 통째로 얼어붙습니다(2026-08-27 실측: 시세 53틱에 265건이 걸렸습니다
     = 5배. 그물이 구독자 5개를 전부 감싸고 있었습니다).
     그래서 "거래엔진만" 을 본문으로 가려냅니다. 아래 두 함수는 강제청산·미체결
     체결 경로라 js/trading.js 의 onPriceUpdate 에만 있습니다.
     js/trading.js 는 수정 금지 파일(md5 고정)이라 이 지문은 변하지 않습니다. */
  var ENGINE_MARKS = ["checkTriggers(", "checkPendingOrder("];

  function isEngineHandler(fn) {
    if (typeof fn !== "function" || fn.name !== TRADING_HANDLER) return false;
    var src;
    try { src = Function.prototype.toString.call(fn); } catch (e) { return false; }
    for (var i = 0; i < ENGINE_MARKS.length; i++) {
      if (src.indexOf(ENGINE_MARKS[i]) < 0) return false;
    }
    return true;
  }

  /* App.Config 에 생길 수 있는 "종목 바꾸기" 이름들.
     tests/symbol-switch-unbuilt.test.js 가 감시하는 목록과 같습니다. */
  var SETTER_NAMES = [
    "setActiveSymbol", "switchSymbol", "changeSymbol",
    "selectSymbol", "setSymbol", "useSymbol", "applySymbol",
  ];

  var blocked = 0;      // 막은 전환 횟수
  var dropped = 0;      // 그물이 버린 시세 틱 수
  var stamped = 0;      // symbol 을 찍은 횟수
  var nettedCount = 0;  // 그물을 씌운 구독자 수 — 거래엔진 하나(1)여야 정상입니다
  var lastBlockReason = "";
  var bypass = false;   // 우리가 스스로 되돌릴 때만 잠깐 열립니다
  var armed = true;     // 복원 구간(부팅 전)인가 — ghost-position-guard.js 와 같은 방식
  var legacyStampDone = false;
  var cachedNeed = null;
  var lastAlertAt = 0;

  /* ------------------------------------------------------------------
   * 공통 판정
   * ------------------------------------------------------------------ */
  function snapshot() {
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return null;
    try {
      return App.Trading.getSnapshot();
    } catch (e) {
      return null;
    }
  }

  /* 종목을 바꾸면 안 되는 상태인가 — ① 미체결만 있는 사람도 포함합니다.
     포지션만 보면 미체결 주문이 그냥 통과하고, 종목이 바뀐 뒤 한 틱 만에
     체결되면서 곧바로 전액 손실이 납니다(조사팀 재현). */
  function isLocked() {
    var s = snapshot();
    if (!s) return false; // 거래엔진이 아직 없으면 잠글 것도 없습니다
    return !!(s.position || s.pendingOrder);
  }

  function activeSymbol() {
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try { return App.Config.getActiveSymbol(); } catch (e) { /* noop */ }
    }
    return DEFAULT_SYMBOL;
  }

  function blockReason() {
    var s = snapshot();
    if (!s) return "";
    if (s.position && s.pendingOrder) return "보유 중인 포지션과 미체결 주문이 있습니다";
    if (s.position) return "보유 중인 포지션이 있습니다";
    if (s.pendingOrder) return "미체결 주문이 있습니다";
    return "";
  }

  function message(target) {
    return (
      (target ? target + " 로 바꿀 수 없습니다. " : "지금은 종목을 바꿀 수 없습니다. ") +
      blockReason() +
      ". 다른 종목 시세로 강제청산될 수 있어 막았습니다. " +
      "포지션을 정리하거나 미체결 주문을 취소한 뒤에 바꿔주세요."
    );
  }

  function notify(target) {
    var msg = message(target);
    console.warn("[symbol-guard.js] " + msg);
    /* 같은 안내가 연달아 여러 번 뜨지 않게 합니다. */
    var now = Date.now();
    if (now - lastAlertAt > 3000 && typeof window.alert === "function") {
      lastAlertAt = now;
      try { window.alert(msg); } catch (e) { /* noop */ }
    }
  }

  /* ------------------------------------------------------------------
   * 1) 문 — 전환 거부
   * ------------------------------------------------------------------ */

  /* 종목이 실제로 바뀌었을 때만 기록합니다(부팅 때는 안 씁니다). */
  function remember(symbol) {
    if (!App.Storage || typeof App.Storage.save !== "function") return;
    try {
      var prev = App.Storage.load(SYMBOL_KEY);
      if (prev && prev.symbol === symbol) return;
      App.Storage.save(SYMBOL_KEY, { symbol: symbol });
    } catch (e) { /* noop */ }
  }

  function rememberedSymbol() {
    if (!App.Storage || typeof App.Storage.load !== "function") return null;
    try {
      var v = App.Storage.load(SYMBOL_KEY);
      return v && typeof v.symbol === "string" ? v.symbol : null;
    } catch (e) {
      return null;
    }
  }

  /* 들어온 값을 종목 이름으로 해석합니다("ETHUSDT" 또는 {symbol:"ETHUSDT"}). */
  function toSymbol(v) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && typeof v.symbol === "string") return v.symbol;
    return null;
  }

  function wrapOne(name, original) {
    var guarded = function (value) {
      var target = toSymbol(value);
      if (!bypass && target && target !== activeSymbol() && isLocked()) {
        blocked++;
        lastBlockReason = blockReason();
        notify(target);
        return undefined; // 전환하지 않습니다
      }
      var out = original.apply(this === guarded ? App.Config : this, arguments);
      if (target) remember(target);
      return out;
    };
    guarded.__symbolGuarded = true;
    guarded.__symbolGuardName = name;
    return guarded;
  }

  /* 아직 없는 함수에 미리 자물쇠를 걸어둡니다.
     · 값이 안 들어오면 계속 undefined 입니다(우리가 함수를 만들지 않습니다).
     · enumerable:false 라 Object.keys(App.Config) 에도 안 보입니다.
     · 누군가 App.Config.setActiveSymbol = fn 을 하는 순간 감싼 것으로 바뀝니다. */
  function armConfig() {
    if (!App.Config || typeof App.Config !== "object") return false;
    if (App.Config.__symbolGuarded) return true;
    var store = {};
    var okAny = false;

    SETTER_NAMES.forEach(function (name) {
      var existing = App.Config[name];
      if (typeof existing === "function") store[name] = wrapOne(name, existing);
      try {
        Object.defineProperty(App.Config, name, {
          configurable: true,
          enumerable: false,
          get: function () { return store[name]; },
          set: function (fn) {
            store[name] = typeof fn === "function" && !fn.__symbolGuarded ? wrapOne(name, fn) : fn;
          },
        });
        okAny = true;
      } catch (e) {
        console.warn("[symbol-guard.js] App.Config." + name + " 에 자물쇠를 못 걸었습니다:", e);
      }
    });

    if (okAny) {
      try {
        Object.defineProperty(App.Config, "__symbolGuarded", {
          value: true, enumerable: false, configurable: true, writable: true,
        });
      } catch (e) { /* noop */ }
    }
    return okAny;
  }

  /* 종목 UI 두 곳(상단 드롭다운 · 주문창 목록)의 클릭을 같은 판정으로 막습니다.
     ④ 한 곳만 막으면 다른 곳이 뚫립니다. 문서 단계(capture)에서 잡으므로 두
     목록이 다시 그려져도 계속 유효합니다.
     ⚠ 지금 화면은 전혀 안 바뀝니다 — 아래 세 조건을 다 넘는 종목이 0개입니다. */
  function onCaptureClick(e) {
    var t = e && e.target;
    if (!t || typeof t.closest !== "function") return;
    var row = t.closest(".symbol-option, .ami-symbol-row");
    if (!row) return;
    var target = row.getAttribute("data-symbol");
    if (!target) return;
    if (target === activeSymbol()) return;              // 바뀌는 게 없습니다
    if (App.SymbolRegistry && App.SymbolRegistry.isMock(target)) return; // "준비 중입니다" 안내 그대로
    if (!isLocked()) return;                            // 포지션·미체결 없음 → 통과

    blocked++;
    lastBlockReason = blockReason();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    if (typeof e.preventDefault === "function") e.preventDefault();
    notify(target);
  }

  function armUi() {
    if (!document || typeof document.addEventListener !== "function") return false;
    if (armUi.done) return true;
    document.addEventListener("click", onCaptureClick, true);
    armUi.done = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 2) 도장 — 포지션·미체결에 symbol 찍기
   * ------------------------------------------------------------------ */

  /* 종목을 모르는 기록이 실제로 어느 종목인가:
     · 복원 구간(부팅 전) = js/auth.js 가 서버에서 가져온 것.
       auth.js 는 symbol 을 안 실어오므로 서버 사실(BTCUSDT)로 찍습니다.
       여기서 "지금 활성 종목" 으로 찍으면, 종목을 바꿔놓고 로그인했을 때
       BTC 포지션에 다른 종목 도장이 찍혀 ② 가 그대로 터집니다.
     · 부팅 뒤 = trading.js 가 방금 만든 것이므로 지금 활성 종목입니다. */
  function symbolFor(duringRestore) {
    return duringRestore ? DEFAULT_SYMBOL : activeSymbol();
  }

  function stamp(obj, symbol) {
    if (!obj || typeof obj !== "object") return false;
    if (typeof obj.symbol === "string" && obj.symbol) return false;
    obj.symbol = symbol;
    stamped++;
    return true;
  }

  function stampBoth(holder, duringRestore) {
    if (!holder || typeof holder !== "object") return;
    var sym = symbolFor(duringRestore);
    stamp(holder.position, sym);
    stamp(holder.pendingOrder, sym);
  }

  function wrapStorage() {
    if (!App.Storage || typeof App.Storage.save !== "function") return false;
    if (App.Storage.__symbolGuarded) return true;
    var orig = App.Storage.save;
    App.Storage.save = function (key, data) {
      if (key === TRADING_KEY && data && typeof data === "object") {
        try {
          stampBoth(data, armed);
        } catch (e) {
          console.warn("[symbol-guard.js] symbol 도장 중 오류 — 원본 그대로 저장합니다:", e);
        }
      }
      return orig.call(App.Storage, key, data);
    };
    App.Storage.__symbolGuarded = true;
    return true;
  }

  /* 복원 구간이 끝나는 시점 — ghost-position-guard.js:215-227 과 같은 방식 */
  var disarmHooked = false;
  function disarmOnBoot() {
    if (disarmHooked) return true;
    if (!App.bootApp) return false;
    var orig = App.bootApp;
    App.bootApp = function () {
      armed = false;
      return orig.apply(this, arguments);
    };
    disarmHooked = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 3) 그물 — 거래엔진에게만 다른 종목 시세를 안 보여줍니다
   * ------------------------------------------------------------------ */
  function needFrom(s) {
    if (!s) return null;
    if (s.position && typeof s.position.symbol === "string") return s.position.symbol;
    if (s.pendingOrder && typeof s.pendingOrder.symbol === "string") return s.pendingOrder.symbol;
    return null;
  }

  function requiredSymbol() {
    if (cachedNeed !== null) return cachedNeed;
    return needFrom(snapshot());
  }

  function passes(payload) {
    if (!payload || typeof payload.symbol !== "string") return true;
    var need = requiredSymbol();
    if (!need) return true;              // 포지션·미체결이 없으면 걸러낼 것도 없습니다
    return payload.symbol === need;
  }

  function makeNet(fn) {
    var netted = function (payload) {
      if (!passes(payload)) {
        dropped++;
        if (dropped <= 5) {
          console.warn(
            "[symbol-guard.js] 내 포지션은 " + requiredSymbol() + " 인데 " +
            payload.symbol + " 시세가 들어왔습니다 — 거래엔진에는 넘기지 않습니다(강제청산 방지). " +
            "화면(차트·호가·현재가)에는 그대로 전달됩니다."
          );
        }
        return undefined;
      }
      return fn.apply(this, arguments);
    };
    netted.__symbolNet = true;
    return netted;
  }

  function wrapBusOn() {
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    if (App.Bus.__symbolGuardedOn) return true;
    var origOn = App.Bus.on;
    App.Bus.on = function (event, fn) {
      if (event === PRICE_EVENT && isEngineHandler(fn) && !fn.__symbolNet) {
        nettedCount++;
        return origOn.call(App.Bus, event, makeNet(fn));
      }
      /* 그 밖의 구독자(차트·호가·UI)는 손대지 않습니다. */
      return origOn.call(App.Bus, event, fn);
    };
    App.Bus.__symbolGuardedOn = true;
    return true;
  }

  /* symbol:change 방송도 같은 조건으로 막습니다(듣는 곳이 4곳입니다). */
  function wrapBusEmit() {
    if (!App.Bus || typeof App.Bus.emit !== "function") return false;
    if (App.Bus.__symbolGuardedEmit) return true;
    var orig = App.Bus.emit;
    App.Bus.emit = function (name, payload) {
      if (name === SYMBOL_EVENT && !bypass) {
        var target = toSymbol(payload);
        if (target && target !== activeSymbol() && isLocked()) {
          blocked++;
          lastBlockReason = blockReason();
          notify(target);
          return undefined;
        }
        if (target) remember(target);
      }
      return orig.apply(App.Bus, arguments);
    };
    App.Bus.__symbolGuardedEmit = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 부팅 직후 한 번 — 옛 기록에 도장 찍기 + 어긋난 종목 되돌리기
   * ------------------------------------------------------------------ */
  function onTradingUpdate(s) {
    /* 아직 symbol 이 없는 것에 도장을 찍습니다. 여기 오는 것은 두 가지뿐입니다.
       · 종목 구분이 없던 시절의 옛 기록(저장소에서 막 복원된 것)
         → 그때는 거래 가능한 종목이 BTCUSDT 뿐이었고, 지금 활성 종목도
           BTCUSDT 입니다(종목을 바꾸려면 문을 통과해야 하는데, 옛 기록이
           있다는 것은 아직 한 번도 안 바꿨다는 뜻입니다).
       · 방금 만들어진 포지션(persist 직전의 잠깐)
         → 지금 활성 종목이 맞습니다.
       두 경우 모두 "지금 활성 종목" 이 정답이라 한 가지로 처리합니다.
       서버에서 온 것은 이미 App.Storage.save 단계에서 BTCUSDT 로 찍혀
       들어오므로 여기서는 손대지 않습니다(stamp 는 값이 있으면 건너뜁니다). */
    try { stampBoth(s, false); } catch (e) { /* noop */ }
    if (!legacyStampDone) {
      legacyStampDone = true;
      try { realign(s); } catch (e) { /* noop */ }
    }
    cachedNeed = needFrom(s);
  }

  /* ② 로그인 복원 — 종목을 바꿔놓고 로그인하면 활성 종목과 포지션 종목이
     어긋난 채로 시작합니다. 되돌릴 손잡이(setActiveSymbol 등)가 있으면
     되돌리고, 없으면 3) 그물이 받아냅니다(포지션이 얼 뿐, 잘못 청산되지
     않습니다). */
  function realign(s) {
    var need = needFrom(s);
    if (!need || need === activeSymbol()) return;
    var setter = null;
    for (var i = 0; i < SETTER_NAMES.length; i++) {
      var fn = App.Config ? App.Config[SETTER_NAMES[i]] : null;
      if (typeof fn === "function") { setter = fn; break; }
    }
    if (!setter) {
      console.warn(
        "[symbol-guard.js] 활성 종목(" + activeSymbol() + ")과 내 포지션 종목(" + need + ")이 다릅니다. " +
        "되돌릴 함수가 없어 그물로만 막습니다 — 거래엔진은 " + need + " 시세만 받습니다."
      );
      return;
    }
    bypass = true;
    try { setter.call(App.Config, need); } finally { bypass = false; }
    console.warn("[symbol-guard.js] 활성 종목을 내 포지션 종목(" + need + ")으로 되돌렸습니다.");
  }

  /* ------------------------------------------------------------------ */
  function wireBus() {
    if (wireBus.done) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    var okOn = wrapBusOn();
    var okEmit = wrapBusEmit();
    if (!okOn || !okEmit) return false;
    App.Bus.on("trading:update", onTradingUpdate);
    App.Bus.on("trading:persisted", function (s) { cachedNeed = needFrom(s); });
    wireBus.done = true;
    return true;
  }

  function tryAll() {
    var a = wireBus();
    var b = wrapStorage();
    var c = disarmOnBoot();
    var d = armConfig();
    return a && b && c && d;
  }

  function init() {
    if (tryAll()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (tryAll() || ++tries > 200) clearInterval(t);
    }, 50);
  }

  /* App.Bus.on 감싸기는 js/trading.js 가 구독하기 전에 끝나야 하므로
     스크립트를 읽는 즉시 실행합니다(부팅은 DOMContentLoaded 이후입니다). */
  init();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", armUi);
  else armUi();

  return {
    init: init,
    armUi: armUi,
    isLocked: isLocked,
    blockReason: blockReason,
    message: message,
    requiredSymbol: requiredSymbol,
    passes: passes,
    activeSymbol: activeSymbol,
    rememberedSymbol: rememberedSymbol,
    getBlockedCount: function () { return blocked; },
    getDroppedCount: function () { return dropped; },
    getStampedCount: function () { return stamped; },
    getNettedCount: function () { return nettedCount; },
    isEngineHandler: isEngineHandler,
    getLastBlockReason: function () { return lastBlockReason; },
    isArmed: function () { return armed; },
    _setArmed: function (v) { armed = !!v; },
    _reset: function () { blocked = 0; dropped = 0; stamped = 0; lastBlockReason = ""; lastAlertAt = 0; },
    DEFAULT_SYMBOL: DEFAULT_SYMBOL,
    SYMBOL_KEY: SYMBOL_KEY,
    SETTER_NAMES: SETTER_NAMES.slice(),
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolGuard;
