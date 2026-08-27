/* =========================================================================
 * js/symbol-sync-bridge.js — App.SymbolSyncBridge
 * =========================================================================
 * 종목 추가의 2번 관문 — "서버에 종목을 제대로 기록하기" (2026-08-27)
 *
 * 이 파일도 종목 전환을 "열지" 않습니다. 1번 관문(js/symbol-guard.js)과
 * 같은 성격의 준비 작업입니다. 지금은 거래 가능한 종목이 BTCUSDT 뿐이라
 * 서버로 나가는 값이 한 글자도 안 바뀝니다(아래 "지금은 아무것도 안 바뀝니다").
 *
 * -- 무엇이 문제인가 (조사팀 2026-08-26, 확신도: 확실) --------------------
 *   js/supabase-sync.js 의 76 / 107 / 146 행에 symbol: "BTCUSDT" 가
 *   하드코딩돼 있습니다. 종목 전환을 열면 삼성전자로 거래해도 서버에는
 *   비트코인으로 남습니다. js/supabase-sync.js 는 수정 금지 파일입니다.
 *
 * -- 어떻게 우회하나 -----------------------------------------------------
 *   App.SupabaseClient.get() 을 감싸서, 돌려주는 client 객체의 from 을
 *   교체합니다. positions / trades / orders 세 표에만 끼어들고,
 *   그 표의 insert / upsert / select 를 인스턴스에 덮어씁니다.
 *   client 객체 자체를 고쳐 쓰므로 스크립트 순서에 안 걸립니다
 *   (auth.js 가 먼저 get() 을 불러 캐시해 뒀어도 같은 객체입니다).
 *   chat_messages / trading_accounts 등 나머지 표는 손대지 않습니다.
 *
 * -- 행 단위로 짝을 맞춥니다 (지금 활성 종목으로 찍으면 안 됩니다) --------
 *   js/persist-sync-queue.js 가 동기화 핸들러를 줄 세워 나중에 실행합니다.
 *   insert 가 실제로 나가는 시점의 활성 종목은 그 행이 만들어진 시점과
 *   다를 수 있습니다. 그래서 "지금 종목" 이 아니라 행마다 짝을 찾습니다.
 *
 *       positions   created_at       <->  position.openTime
 *       trades      created_at       <->  trade.closeTime
 *       orders      client_order_id  <->  order.id
 *
 * -- 도장이 절반만 찍혀 있던 것 (조사팀 실측: 4 중 2) ---------------------
 *   js/symbol-guard.js 는 position 과 pendingOrder 에만 symbol 을 찍습니다.
 *   closedTrades[0].symbol 과 orderHistory[0].symbol 은 null 이었습니다
 *   (js/trading.js:457 unshift / js/trading.js:74 logOrder 에 그 칸이 없음).
 *   도장이 없으면 가로채도 무슨 종목으로 고쳐 쓸지 알 수 없습니다.
 *   -> 여기서 App.Storage.save("trading", ...) 를 한 겹 더 감싸 넷 다 찍습니다.
 *   js/symbol-guard.js 는 한 글자도 안 고쳤습니다(어제 게이트 2 통과분 보존).
 *
 * -- 로그인 복원에서 종목이 버려지던 P1 ----------------------------------
 *   js/auth.js:369-381 이 서버 positions 행을 로컬로 옮길 때 symbol 을 안
 *   복사합니다. 그 뒤 js/auth.js:412 의 App.Storage.save("trading", ...) 시점에는
 *   symbol-guard 가 아직 armed=true 라 무조건 BTCUSDT 로 찍습니다.
 *   (실행 순서 확인됨 — auth.js:185 hydrate -> auth.js:188 bootOnce.
 *    저장이 먼저입니다.)
 *
 *       삼성전자 포지션 보유 -> 브라우저 닫고 다시 열기
 *       -> 서버 symbol 은 맞는데 auth.js 가 안 옮김 -> BTCUSDT 로 도장
 *       -> 그물이 BTC 시세를 거래엔진에 통과 -> 삼성 포지션이 BTC 가격으로
 *          평가 -> 즉시 강제청산
 *
 *   js/auth.js 는 수정 금지 파일이라, positions/trades/orders 의 select
 *   빌더의 then 을 인스턴스에서 덮어써 응답 행의 symbol 을 기억해 둡니다.
 *   그리고 App.Storage.save 감싸기에서 symbol-guard 보다 먼저 찍습니다.
 *   (stamp 는 값이 이미 있으면 건너뛰므로 먼저 찍은 쪽이 이깁니다. 이 파일의
 *    <script> 를 symbol-guard.js 뒤에 두면 우리 wrapper 가 바깥이라 먼저 돕니다.)
 *
 * -- 하지 않은 것 --------------------------------------------------------
 *   · js/supabase-sync.js:66 의 positions delete 에 symbol 조건을 붙이지
 *     않았습니다. 이 파일은 delete 를 아예 건드리지 않습니다.
 *     조건이 없는 것이 오히려 안전판입니다 — 매번 전부 지우고 최대 1건만
 *     넣으므로 결과가 항상 0건 또는 1건입니다. 붙이는 순간 종목별로 행이 남아
 *     2행이 되고, 그때 js/auth.js:363 의 maybeSingle() 이 깨집니다.
 *   · 종목 전환을 열지 않았습니다(js/symbol-selector.js:57 "준비 중입니다" 그대로).
 *   · SQL 은 만들지 않았습니다. 세 표에 symbol 칸이 이미 있고
 *     (supabase/schema.sql:87/113/137, text not null default 'BTCUSDT'),
 *     랭킹/손익 SQL 전체에 symbol 이라는 단어가 0회 나옵니다.
 *   · 옛 기록은 그대로 둡니다. 지금까지 거래 가능한 종목이 BTCUSDT 뿐이었으니
 *     그 값이 사실입니다.
 *
 * -- orders 는 insert 가 아니라 upsert 라 특별히 조심합니다 ---------------
 *   supabase-sync.js 의 lastSyncedOrderHistoryVersion 은 메모리 변수(초기 -1)라
 *   새로고침할 때마다 이력 100건을 통째로 다시 upsert 합니다.
 *   잘못된 종목을 넣으면 서버에 이미 맞게 들어 있던 값을 덮어씁니다.
 *   -> 종목을 모르는 행은 추측하지 않고 symbol 키를 아예 뺍니다.
 *
 *   단 supabase-js v2 는 배열을 보낼 때 모든 행의 키를 합집합으로 모아
 *   ?columns=... 로 보냅니다(라이브러리 원본 확인 — insert/upsert 안에
 *   e.reduce((a,r)=>a.concat(Object.keys(r)),[]) 로 키를 모아
 *   searchParams.set("columns", ...) 합니다).
 *   그래서 한 배열 안에서 어떤 행만 symbol 을 빼면, 그 행은 NULL 로 들어가
 *   not null 제약에 걸려 배치 전체가 실패합니다.
 *   -> 한 행이라도 종목을 모르면 그 배치의 모든 행에서 symbol 을 뺍니다.
 *      그러면 columns 목록에 symbol 이 없어져
 *        · 기존 행: ON CONFLICT DO UPDATE SET 에 symbol 이 없으므로 보존
 *        · 새 행:   칼럼 기본값 'BTCUSDT' 가 들어감(= 지금과 똑같은 동작)
 *
 * -- 지금은 아무것도 안 바뀝니다 (동작 변화 0) ---------------------------
 *   거래 가능한 종목이 BTCUSDT 하나뿐이라, 짝을 맞춰 찾아낸 값도 전부
 *   "BTCUSDT" 입니다. 하드코딩된 값과 같으므로 서버로 나가는 본문이
 *   한 글자도 안 달라집니다. getCounts().changedRows 가 0 인 것으로 확인합니다.
 *
 * -- 되돌리는 방법 -------------------------------------------------------
 *   index.html 에서 <script src="js/symbol-sync-bridge.js"></script> 한 줄을
 *   지우면 완전히 원래대로 돌아갑니다. 파일까지 지우려면 그 다음에 이 파일을
 *   지웁니다. 서버 데이터는 이 파일이 있든 없든 달라지지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.SymbolSyncBridge = (function () {
  "use strict";

  /* 종목을 모르는 옛 기록이 실제로 어느 종목인가.
     2026-08-26 조사: 서버 positions/orders/trades 의 symbol 칸 값이 전부
     BTCUSDT 이고, 지금까지 거래 가능한 종목도 BTCUSDT 뿐이었습니다. */
  var DEFAULT_SYMBOL = "BTCUSDT";
  var TRADING_KEY = "trading";

  /* 우리가 끼어드는 표. 이 셋에만 supabase-sync.js 가 씁니다(나머지는 전부 읽기). */
  var POSITIONS = "positions";
  var TRADES = "trades";
  var ORDERS = "orders";
  var WATCHED = {};
  WATCHED[POSITIONS] = true;
  WATCHED[TRADES] = true;
  WATCHED[ORDERS] = true;

  /* 이 파일이 읽힌 시각. 이보다 뒤에 만들어진 기록은 "이번 세션에서 생긴 것"
     이므로 지금 활성 종목이 맞습니다. 그보다 앞이면 옛 기록입니다. */
  var PAGE_LOAD = Date.now();

  /* 행 하나하나의 종목을 기억해 두는 곳.
     · 서버 select 응답에서 담습니다(로그인 복원 P1 대응)
     · App.Storage.save / trading:persisted 스냅샷에서도 담습니다 */
  var posSym = {};    // openTime(ms)  -> symbol
  var tradeSym = {};  // closeTime(ms) -> symbol
  var orderSym = {};  // order id      -> symbol

  var armed = true;         // 복원 구간(부팅 전)인가 — symbol-guard.js 와 같은 방식
  var disarmHooked = false;

  var counts = {
    patchedClients: 0,
    capturedPositions: 0,
    capturedTrades: 0,
    capturedOrders: 0,
    interceptPositions: 0,
    interceptTrades: 0,
    interceptOrders: 0,
    rewrittenRows: 0,   // symbol 값을 실제로 써 넣은 행 수
    changedRows: 0,     // 원래 값과 "다르게" 바꾼 행 수 (지금은 0 이어야 정상)
    omittedBatches: 0,  // 종목을 몰라 symbol 키를 통째로 뺀 배치 수
    unresolvedRows: 0,  // 종목을 못 찾은 행 수
    stampPosition: 0,
    stampPendingOrder: 0,
    stampClosedTrades: 0,
    stampOrderHistory: 0
  };

  /* ------------------------------------------------------------------
   * 작은 도구들
   * ------------------------------------------------------------------ */
  function isSym(v) {
    return typeof v === "string" && v.length > 0;
  }

  function ms(iso) {
    if (typeof iso === "number") return isFinite(iso) ? iso : null;
    if (typeof iso !== "string" || !iso) return null;
    var t = new Date(iso).getTime();
    return isFinite(t) ? t : null;
  }

  function activeSymbol() {
    if (App.SymbolGuard && typeof App.SymbolGuard.activeSymbol === "function") {
      try { return App.SymbolGuard.activeSymbol(); } catch (e) { /* noop */ }
    }
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try { return App.Config.getActiveSymbol(); } catch (e) { /* noop */ }
    }
    return DEFAULT_SYMBOL;
  }

  function remember(map, key, symbol) {
    if (key === null || key === undefined || key === "") return;
    if (!isSym(symbol)) return;
    map[String(key)] = symbol;
  }

  function recall(map, key) {
    if (key === null || key === undefined || key === "") return null;
    var v = map[String(key)];
    return isSym(v) ? v : null;
  }

  /* ------------------------------------------------------------------
   * "이 기록의 포지션이 무슨 종목이었나" — 로컬에서 찾기
   * ------------------------------------------------------------------
   * 한 번 저장할 때 저장소를 최대 한 번만 읽습니다. 거래내역 200건 ·
   * 주문내역 100건을 훑기 때문에, 건마다 읽으면 새로고침이 느려집니다.
   * ------------------------------------------------------------------ */
  var passLive;     // undefined = 이번 회차에 아직 안 읽음
  var passStored;

  function beginPass() { passLive = undefined; passStored = undefined; }

  function liveDoc() {
    if (passLive !== undefined) return passLive;
    passLive = null;
    if (App.Trading && typeof App.Trading.getSnapshot === "function") {
      try { passLive = App.Trading.getSnapshot(); } catch (e) { passLive = null; }
    }
    return passLive;
  }

  function storedDoc() {
    if (passStored !== undefined) return passStored;
    passStored = null;
    if (App.Storage && typeof App.Storage.load === "function") {
      try { passStored = App.Storage.load(TRADING_KEY); } catch (e) { passStored = null; }
    }
    return passStored;
  }

  /* 문서 하나에서 포지션(없으면 미체결)의 종목을 꺼냅니다.
     openTime 을 주면 "같은 포지션" 일 때만 인정합니다. */
  function fromDoc(doc, openTime) {
    if (!doc || typeof doc !== "object") return null;
    var p = doc.position;
    if (p && typeof p === "object" && isSym(p.symbol)) {
      if (openTime === null || openTime === undefined || p.openTime === openTime) return p.symbol;
    }
    if (openTime !== null && openTime !== undefined) return null;
    var o = doc.pendingOrder;
    if (o && typeof o === "object" && isSym(o.symbol)) return o.symbol;
    return null;
  }

  /* openTime 이 정확히 같은 포지션의 종목 — 옛 기록에도 안전합니다. */
  function matchedSymbol(doc, openTime) {
    if (openTime === null || openTime === undefined) return null;
    return fromDoc(doc, openTime) || fromDoc(liveDoc(), openTime) || fromDoc(storedDoc(), openTime);
  }

  /* 지금 들고 있는 포지션(또는 미체결)의 종목.
     지금 저장 중인 문서 → 거래엔진 → 직전 저장분 순으로 봅니다.
     ⚠ 전량 청산 직후에는 앞의 둘이 비어 있고 "직전 저장분" 에만 남아 있습니다.
        이번 P1 이 딱 그 경우입니다. */
  function heldSymbol(doc) {
    return fromDoc(doc, null) || fromDoc(liveDoc(), null) || fromDoc(storedDoc(), null);
  }

  /* 종목을 모르는 기록이 실제로 어느 종목인가 — 위에서부터 "처음 나오는 값".
       1) 서버가 알려준 값                    (로그인 복원 P1)
       2) 로컬에 저장된 포지션의 symbol       ← 2026-08-27 P1 로 추가
       3) activeSymbol()                      (이번 세션에서 만들어진 기록만)
       4) DEFAULT_SYMBOL(BTCUSDT)             (옛 기록. 그때는 그 종목뿐)

     ── 2) 를 왜 넣었나 (2026-08-27 P1) ──────────────────────────────────
     삼성전자 포지션을 들고 새로고침하면 활성 종목만 BTCUSDT 로 되돌아갑니다
     (js/symbol-stream-switch.js:90-93 — 활성 종목은 저장하지 않습니다).
     그래서 그 뒤에 청산하면 closedTrades[0] 이 3) 으로 내려가 BTCUSDT 로
     찍혔습니다. 채팅 알림도 서버 trades 도 전부 비트코인으로 남았습니다
     (실측 — 네 종목 모두 BTCUSDT). 포지션에는 진짜 종목이 남아 있으므로
     그것을 먼저 봅니다.

     ⚠ 옛 기록에 "지금 활성 종목" 이나 "지금 들고 있는 포지션" 을 찍으면
        안 됩니다. 그래서 이번 세션 밖의 기록은 openTime 이 정확히 같은
        포지션일 때만 2) 를 인정하고, 아니면 그대로 4) 로 내려갑니다. */
  function resolve(map, key, createdMs, doc, openTime) {
    var fromServer = recall(map, key);
    if (fromServer) return fromServer;                                    /* 1) */

    /* 2)-a 같은 포지션인지 openTime 으로 대조합니다(옛 기록에도 안전합니다). */
    var matched = matchedSymbol(doc, openTime);
    if (matched) return matched;

    var sameSession = typeof createdMs === "number" && isFinite(createdMs) && createdMs >= PAGE_LOAD;
    if (!sameSession) return DEFAULT_SYMBOL;                              /* 4) */

    /* 2)-b 이번 세션에서 생긴 기록이면 "지금 들고 있는 포지션" 의 종목입니다.
       청산 기록(closedTrades)에는 openTime 이 없어서 이 단계가 필요합니다. */
    var held = heldSymbol(doc);
    if (held) return held;                                                /* 2) */

    return activeSymbol();                                                /* 3) */
  }

  /* ------------------------------------------------------------------
   * 도장 — 넷 다 찍습니다 (조사팀 실측 2/4 -> 4/4)
   * ------------------------------------------------------------------ */
  function stampOne(obj, symbol, counterKey) {
    if (!obj || typeof obj !== "object") return false;
    if (isSym(obj.symbol)) return false;   // 이미 찍혀 있으면 건드리지 않습니다
    if (!isSym(symbol)) return false;
    obj.symbol = symbol;
    counts[counterKey]++;
    return true;
  }

  /* ⚠ resolve() 는 "찍어야 할 때만" 부릅니다. 인자 자리에서 미리 계산하면
     이미 찍혀 있는 기록 300건에도 매번 저장소를 뒤지게 됩니다. */
  function stampTradingDoc(data) {
    if (!data || typeof data !== "object") return;
    beginPass();

    var pos = data.position;
    if (pos && typeof pos === "object") {
      if (!isSym(pos.symbol)) {
        stampOne(pos, resolve(posSym, pos.openTime, pos.openTime, data, pos.openTime), "stampPosition");
      }
      remember(posSym, pos.openTime, pos.symbol);
    }

    var po = data.pendingOrder;
    if (po && typeof po === "object") {
      var poTime = typeof po.createdTime === "number" ? po.createdTime : po.openTime;
      if (!isSym(po.symbol)) {
        stampOne(po, resolve(orderSym, po.id, poTime, data, null), "stampPendingOrder");
      }
      remember(orderSym, po.id, po.symbol);
    }

    var trades = data.closedTrades;
    if (trades && typeof trades.length === "number") {
      for (var i = 0; i < trades.length; i++) {
        var t = trades[i];
        if (!t || typeof t !== "object") continue;
        if (!isSym(t.symbol)) {
          stampOne(t, resolve(tradeSym, t.closeTime, t.closeTime, data, null), "stampClosedTrades");
        }
        remember(tradeSym, t.closeTime, t.symbol);
      }
    }

    var orders = data.orderHistory;
    if (orders && typeof orders.length === "number") {
      for (var j = 0; j < orders.length; j++) {
        var o = orders[j];
        if (!o || typeof o !== "object") continue;
        if (!isSym(o.symbol)) {
          stampOne(o, resolve(orderSym, o.id, o.createdTime, data, null), "stampOrderHistory");
        }
        remember(orderSym, o.id, o.symbol);
      }
    }
  }

  /* App.Storage.save 를 한 겹 더 감쌉니다.
     이 <script> 가 js/symbol-guard.js 뒤에 있으므로 우리가 바깥 = 먼저 돕니다.
     symbol-guard 의 stamp 는 값이 있으면 건너뛰므로, 우리가 찍은 값이 이깁니다. */
  function wrapStorage() {
    if (!App.Storage || typeof App.Storage.save !== "function") return false;
    if (App.Storage.__symbolBridged) return true;
    var orig = App.Storage.save;
    var wrapped = function (key, data) {
      if (key === TRADING_KEY && data && typeof data === "object") {
        try {
          stampTradingDoc(data);
        } catch (e) {
          console.warn("[symbol-sync-bridge.js] symbol 도장 중 오류 — 원본 그대로 저장합니다:", e);
        }
      }
      return orig.call(App.Storage, key, data);
    };
    wrapped.__symbolBridged = true;
    App.Storage.save = wrapped;
    App.Storage.__symbolBridged = true;
    return true;
  }

  /* 복원 구간이 끝나는 시점 — symbol-guard.js / ghost-position-guard.js 와 같은 방식.
     (지금은 기록용입니다. 판정은 PAGE_LOAD 비교로 합니다.) */
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
   * 서버 select 응답에서 종목을 기억해 둡니다 (로그인 복원 P1)
   * ------------------------------------------------------------------ */
  function captureRows(table, data) {
    if (!data) return;
    var rows = typeof data.length === "number" ? data : [data];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (!r || typeof r !== "object" || !isSym(r.symbol)) continue;
      if (table === POSITIONS) {
        var openTime = ms(r.created_at);
        if (openTime !== null) { remember(posSym, openTime, r.symbol); counts.capturedPositions++; }
      } else if (table === TRADES) {
        var closeTime = ms(r.created_at);
        if (closeTime !== null) { remember(tradeSym, closeTime, r.symbol); counts.capturedTrades++; }
      } else if (table === ORDERS) {
        var id = r.client_order_id || r.id;
        if (id) { remember(orderSym, id, r.symbol); counts.capturedOrders++; }
      }
    }
  }

  /* select 빌더의 then 은 프로토타입에 있습니다(자기 속성 아님).
     인스턴스에 덮어써서 응답만 훔쳐보고 그대로 흘려보냅니다.
     then 을 우리가 부르지 않으면 네트워크 요청은 나가지 않습니다
     (라이브러리 원본: 최초 then 에서 getPromise() -> execute() -> fetch). */
  function hookThen(table, builder) {
    if (!builder || typeof builder.then !== "function") return builder;
    if (builder.__symbolBridged) return builder;
    var origThen = builder.then;
    builder.then = function (onFulfilled, onRejected) {
      var p = origThen.call(this, function (res) {
        try {
          if (res && !res.error) captureRows(table, res.data);
        } catch (e) { /* 훔쳐보기 실패는 조용히 무시 — 원본 흐름을 막지 않습니다 */ }
        return res;
      });
      return p.then(onFulfilled, onRejected);
    };
    builder.__symbolBridged = true;
    return builder;
  }

  /* ------------------------------------------------------------------
   * 쓰기 가로채기 — 행 단위로 종목을 고쳐 씁니다
   * ------------------------------------------------------------------ */

  /* 행 하나에서 "이 행이 어느 종목인가"를 찾습니다. 모르면 null 을 돌려주고,
     부르는 쪽이 symbol 키를 빼는 판단을 합니다(추측하지 않습니다). */
  function symbolForRow(table, row) {
    if (!row || typeof row !== "object") return null;
    if (table === POSITIONS) return recall(posSym, ms(row.created_at));
    if (table === TRADES) return recall(tradeSym, ms(row.created_at));
    if (table === ORDERS) return recall(orderSym, row.client_order_id);
    return null;
  }

  function copyWithout(row, key) {
    var out = {};
    for (var k in row) {
      if (!Object.prototype.hasOwnProperty.call(row, k)) continue;
      if (k === key) continue;
      out[k] = row[k];
    }
    return out;
  }

  function copyWith(row, key, value) {
    var out = {};
    for (var k in row) {
      if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
    }
    out[key] = value;
    return out;
  }

  /* 배열이든 한 개든 같은 규칙으로 처리합니다.
       · 모든 행의 종목을 알면  -> 행마다 symbol 을 써 넣습니다
       · 한 행이라도 모르면     -> 그 배치 전체에서 symbol 키를 뺍니다
         (supabase-js 가 키를 합집합으로 모아 ?columns= 로 보내기 때문에,
          일부만 빼면 그 행이 NULL 로 들어가 not null 에 걸려 배치가 통째로
          실패합니다. 전부 빼면 columns 에서 빠져 기존 값이 보존됩니다.) */
  function rewrite(table, values) {
    var isArray = Array.isArray(values);
    var rows = isArray ? values : [values];
    if (!rows.length) return values;

    var found = [];
    var allKnown = true;
    var unknown = 0;
    for (var i = 0; i < rows.length; i++) {
      var s = symbolForRow(table, rows[i]);
      found.push(s);
      if (!s) { allKnown = false; unknown++; counts.unresolvedRows++; }
    }

    var out = [];
    var k;
    if (allKnown) {
      for (k = 0; k < rows.length; k++) {
        var before = rows[k] && rows[k].symbol;
        if (before === found[k]) { out.push(rows[k]); continue; }
        out.push(copyWith(rows[k], "symbol", found[k]));
        counts.rewrittenRows++;
        if (isSym(before) && before !== found[k]) counts.changedRows++;
      }
    } else {
      counts.omittedBatches++;
      console.warn(
        "[symbol-sync-bridge.js] " + table + " 에서 종목을 모르는 행이 있어 " +
        "symbol 칸을 통째로 빼고 보냅니다(서버에 이미 들어 있는 값을 덮어쓰지 않습니다). " +
        "행 " + rows.length + "개 중 " + unknown + "개 미확인."
      );
      for (k = 0; k < rows.length; k++) {
        out.push(rows[k] && typeof rows[k] === "object" ? copyWithout(rows[k], "symbol") : rows[k]);
      }
    }

    return isArray ? out : out[0];
  }

  /* ------------------------------------------------------------------
   * client 객체 고쳐 쓰기
   * ------------------------------------------------------------------ */
  function bumpIntercept(table) {
    if (table === POSITIONS) counts.interceptPositions++;
    else if (table === TRADES) counts.interceptTrades++;
    else if (table === ORDERS) counts.interceptOrders++;
  }

  function patchClient(client) {
    if (!client || typeof client.from !== "function") return client;
    if (client.__symbolBridged) return client;

    var origFrom = client.from;
    client.from = function (table) {
      var qb = origFrom.apply(this, arguments);
      if (!qb || !WATCHED[table] || qb.__symbolBridged) return qb;

      var origInsert = qb.insert;
      var origUpsert = qb.upsert;
      var origSelect = qb.select;

      if (typeof origInsert === "function") {
        qb.insert = function (values, options) {
          var fixed = values;
          try {
            fixed = rewrite(table, values);
            bumpIntercept(table);
          } catch (e) {
            console.warn("[symbol-sync-bridge.js] " + table + " insert 손질 실패 — 원본 그대로 보냅니다:", e);
            fixed = values;
          }
          return options === undefined
            ? origInsert.call(this, fixed)
            : origInsert.call(this, fixed, options);
        };
      }

      if (typeof origUpsert === "function") {
        qb.upsert = function (values, options) {
          var fixed = values;
          try {
            fixed = rewrite(table, values);
            bumpIntercept(table);
          } catch (e) {
            console.warn("[symbol-sync-bridge.js] " + table + " upsert 손질 실패 — 원본 그대로 보냅니다:", e);
            fixed = values;
          }
          return options === undefined
            ? origUpsert.call(this, fixed)
            : origUpsert.call(this, fixed, options);
        };
      }

      /* delete 는 건드리지 않습니다. positions delete 에 symbol 조건을
         붙이면 종목별로 행이 남아 auth.js:363 의 maybeSingle() 이 깨집니다. */

      if (typeof origSelect === "function") {
        qb.select = function () {
          var b = origSelect.apply(this, arguments);
          try { hookThen(table, b); } catch (e) { /* noop */ }
          return b;
        };
      }

      qb.__symbolBridged = true;
      return qb;
    };

    client.__symbolBridged = true;
    counts.patchedClients++;
    return client;
  }

  function wrapClientGetter() {
    if (!App.SupabaseClient || typeof App.SupabaseClient.get !== "function") return false;
    if (App.SupabaseClient.__symbolBridged) return true;
    var origGet = App.SupabaseClient.get;
    App.SupabaseClient.get = function () {
      var c = origGet.apply(this, arguments);
      try {
        return c ? patchClient(c) : c;
      } catch (e) {
        console.warn("[symbol-sync-bridge.js] client 고쳐쓰기 실패 — 원본 그대로 씁니다:", e);
        return c;
      }
    };
    App.SupabaseClient.__symbolBridged = true;
    return true;
  }

  /* ------------------------------------------------------------------ */
  function onSnapshot(snapshot) {
    try { stampTradingDoc(snapshot); } catch (e) { /* noop */ }
  }

  /* 'trading:persisted' 만 듣습니다 — 실제 거래 이벤트에서만 옵니다.
     'trading:update' 는 시세 틱마다 오는데, 그때마다 거래내역 200건과
     주문내역 100건을 훑을 이유가 없습니다. 어차피 js/trading.js:541 persist() 가
     App.Storage.save 를 먼저 부르고 그 다음에 이 신호를 쏘므로,
     도장은 우리 App.Storage.save 감싸기에서 이미 다 찍혀 있습니다.
     여기 구독은 그 뒤를 받치는 안전망입니다(이미 찍힌 것은 건너뜁니다). */
  function wireBus() {
    if (wireBus.done) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("trading:persisted", onSnapshot);
    wireBus.done = true;
    return true;
  }

  function tryAll() {
    var a = wrapClientGetter();
    var b = wrapStorage();
    var c = disarmOnBoot();
    var d = wireBus();
    return a && b && c && d;
  }

  function init() {
    if (tryAll()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (tryAll() || ++tries > 200) clearInterval(t);
    }, 50);
  }

  init();

  return {
    init: init,
    patchClient: patchClient,
    rewrite: rewrite,
    resolve: resolve,
    stampTradingDoc: stampTradingDoc,
    captureRows: captureRows,
    hookThen: hookThen,
    symbolForRow: symbolForRow,
    isArmed: function () { return armed; },
    _setArmed: function (v) { armed = !!v; },
    getCounts: function () {
      var out = {};
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) out[k] = counts[k];
      return out;
    },
    /* 도장 4/4 확인용 — 넷 다 찍혔는가 */
    getStampCoverage: function (doc) {
      var d = doc || null;
      if (!d && App.Trading && typeof App.Trading.getSnapshot === "function") {
        try { d = App.Trading.getSnapshot(); } catch (e) { d = null; }
      }
      if (!d) return null;
      var t0 = (d.closedTrades || [])[0];
      var o0 = (d.orderHistory || [])[0];
      return {
        position: d.position ? (isSym(d.position.symbol) ? d.position.symbol : null) : "없음",
        pendingOrder: d.pendingOrder ? (isSym(d.pendingOrder.symbol) ? d.pendingOrder.symbol : null) : "없음",
        closedTrades: t0 ? (isSym(t0.symbol) ? t0.symbol : null) : "없음",
        orderHistory: o0 ? (isSym(o0.symbol) ? o0.symbol : null) : "없음"
      };
    },
    getKnownCounts: function () {
      return {
        positions: Object.keys(posSym).length,
        trades: Object.keys(tradeSym).length,
        orders: Object.keys(orderSym).length
      };
    },
    _reset: function () {
      posSym = {}; tradeSym = {}; orderSym = {};
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] = 0;
    },
    _remember: function (kind, key, symbol) {
      remember(kind === POSITIONS ? posSym : kind === TRADES ? tradeSym : orderSym, key, symbol);
    },
    _setPageLoad: function (t) { PAGE_LOAD = t; },
    getPageLoad: function () { return PAGE_LOAD; },
    DEFAULT_SYMBOL: DEFAULT_SYMBOL,
    WATCHED_TABLES: [POSITIONS, TRADES, ORDERS]
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolSyncBridge;
