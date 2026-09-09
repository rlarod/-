/* =========================================================================
 * js/pending-order-restore-guard.js — App.PendingOrderRestoreGuard
 * =========================================================================
 * [P1] 새로고침하면 ★미체결 지정가 주문이 사라지고, 그 돈을 되찾을 길이
 *      없던★ 것을 막습니다. (2026-09-09)
 *
 * ── 무엇이 일어났나 (조사팀 확신도 "확실", PM 코드 확인) ─────────────────
 *
 *     증거금 1,000 · 100배 → 명목 100,000 → 진입수수료 20 (메이커 0.02%)
 *
 *     지정가 걸기    지갑 -1,020 · 총자산 표시는 그대로
 *                    (1,000 이 "묶인 증거금" 으로 잡힘 — js/trading.js:692)
 *     ★새로고침★    지갑 -1,020 · 총자산 표시 = 지갑
 *                    → ★-1,020 이 그냥 사라짐★
 *     서버 계급 자산  지갑 + 1,000  → -20 만 줄어듦
 *
 *   화면과 서버가 정확히 margin 만큼 어긋납니다. ★서버가 맞고 화면이 틀립니다.★
 *
 * ── 왜 P1 인가 — 돈을 되찾을 길이 없습니다 ───────────────────────────────
 *   ① 체결이 영영 안 됩니다.
 *      js/trading.js:287-288 checkPendingOrder() 는 state.pendingOrder 가
 *      null 이면 그 자리에서 돌아갑니다. 체결 판정은 ★100% 브라우저 안에서만★
 *      돕니다 — supabase/*.sql 어디에도 orders.status 를 UPDATE 하는 곳이
 *      없습니다('FILLED' 는 CHECK 제약과 주석에만 나옵니다).
 *      → 서버 orders 행이 status='OPEN' 인 채로 영원히 남습니다.
 *   ② 취소 단추가 화면에 아예 없습니다.
 *      js/ui.js:131 의 #btn-cancel-order 는 ★#pending-order-card 안에★
 *      만들어지는데, js/ui.js:424 가 그 카드를 display:none 으로 숨깁니다.
 *      콘솔로 직접 불러도 js/trading.js:269 가 "취소할 미체결 주문이
 *      없습니다" 를 돌려줍니다.
 *   ③ 서버 계급 자산은 그 돈을 셉니다
 *      (supabase/schema-rank-1000.sql:263 · :384 — status='OPEN' 의 margin 합).
 *
 *   지금 몇 명이 이 상태인지는 supabase/check-stranded-orders.sql 로 봅니다
 *   (읽기 전용).
 *
 * ── 원인은 ★순서★ 입니다 ────────────────────────────────────────────────
 *     js/auth.js:185  await hydrateLocalStateFromSupabase(...)  ← 매 로드마다
 *     js/auth.js:188  bootOnce();                                ← 그 다음에 부팅
 *     js/auth.js:415  pendingOrder: null,   ← 여기서 지워집니다
 *
 *   js/trading.js:658-669 의 복원 코드는 멀쩡히 있는데 ★읽을 것이 이미
 *   없습니다.★ js/auth.js 주석은 "클라우드 스키마에 1:1 로 없는 필드가 있어"
 *   라고 적혀 있지만, 실제로 서버에 없는 것은 tp·sl 둘뿐입니다.
 *   notional·entryFee 는 margin × leverage · notional × 0.0002 로 정확히
 *   다시 계산됩니다.
 *
 * ── 어떻게 막나 (PM 결정 = 안 C · 로컬 우선 + 서버 보조) ─────────────────
 *   js/auth.js 는 수정 금지라 손대지 않습니다.
 *   js/funding-restore-guard.js 와 같은 자리(App.Storage.save 감싸기)에서
 *   저장 직전에 끼어듭니다.
 *
 *     ① 로컬에 pendingOrder 가 남아 있으면  → ★그것을 지킵니다★
 *        (tp·sl·symbol 까지 완전합니다)
 *     ② 로컬에 없으면 → 들어온 orderHistory(서버가 준 것) 에서
 *        status==='OPEN' && type==='limit' 인 ★가장 최근 1건★ 으로 조립합니다
 *        notional = margin × leverage,  entryFee = notional × 0.0002
 *        tp·sl 은 서버에 없으므로 null 입니다
 *
 *   ★왜 ① 이 먼저인가★ — ② 만 하면 tp·sl 이 유실되고, 종목이 항상
 *   BTCUSDT 로 복원됩니다(js/supabase-sync.js:147 이 symbol 을 'BTCUSDT' 로
 *   하드코딩합니다 — 삼성전자 주문이 비트코인이 됩니다. js/symbol-guard.js 가
 *   이미 겪은 P1 과 같은 병입니다). 로컬을 먼저 보면 그 위험이 없고,
 *   로컬이 없을 때(=기기를 바꾼 회원)만 서버로 최소한 돈을 회수합니다.
 *
 * ── ⚠️ armed 가 없으면 ★더 큰 사고★ 입니다 ─────────────────────────────
 *   js/funding-restore-guard.js 는 저장 때마다 ★무조건★ 돕니다.
 *   그 방식을 그대로 pendingOrder 에 쓰면, 회원이 주문을 ★취소하거나 체결돼서★
 *   pendingOrder = null 로 정상 저장할 때 ★주문이 되살아나 증거금이 두 번
 *   잡힙니다.★ 고치려던 것보다 더 나쁜 고장입니다.
 *
 *   그래서 js/ghost-position-guard.js:216-227 disarmOnBoot() 와 똑같이
 *   App.bootApp 을 감싸 ★복원 구간에서만★ 켭니다.
 *   js/auth.js 는 hydrate → bootOnce 순서라 ★복원 저장은 항상 부팅 전★ 이고,
 *   회원이 이 세션에서 직접 건 주문·취소·체결은 ★전부 부팅 후★ 이므로
 *   이 검사를 한 번도 거치지 않습니다.
 *
 * ── 안전장치 — 서버 orderHistory 를 증거로 씁니다 ────────────────────────
 *   되살리기 전에 "다른 기기에서 이미 처리된 주문인가" 를 확인합니다.
 *
 *     같은 id 가 FILLED 또는 CANCELLED       → ★되살리지 않습니다★
 *     들어온 position.orderId 가 그 id 와 같다 → ★되살리지 않습니다★ (체결됨)
 *     들어온 position 이 있다                  → ★되살리지 않습니다★
 *         (거래엔진은 포지션과 미체결을 동시에 가질 수 없습니다 —
 *          js/trading.js:121-124 · :199-204. 포지션이 있다는 것은 그 주문이
 *          이미 체결됐거나 애초에 공존할 수 없었다는 뜻입니다)
 *     OPEN 이거나 항목이 없다                  → 되살립니다
 *
 * ── 잔고는 한 푼도 건드리지 않습니다 ─────────────────────────────────────
 *   증거금+수수료는 주문을 걸 때 이미 balance 에서 빠졌고(js/trading.js:236),
 *   그 값이 그대로 서버 accounts.balance 에 올라가 있습니다.
 *   그래서 pendingOrder 만 되살리면 "묶인 증거금" 이 제자리로 돌아와
 *   총자산 표시가 서버와 다시 맞습니다.
 *
 * ── 수정 금지 파일 ───────────────────────────────────────────────────────
 *   js/auth.js · js/trading.js · js/ui.js · js/supabase-sync.js 를 한 글자도
 *   건드리지 않았습니다. App.Storage.save 를 감싸는 것으로만 끼어듭니다.
 *
 * ── ⚠️ index.html 에서의 자리 ────────────────────────────────────────────
 *   js/symbol-sync-bridge.js ★바로 뒤★ 여야 합니다.
 *   감싸기는 나중에 실린 쪽이 바깥이고 바깥이 먼저 돕니다. 우리가 가장
 *   바깥이라야, 우리가 되살린 pendingOrder 를 symbol-sync-bridge·symbol-guard
 *   가 ★같은 저장 한 번 안에서★ 보고 종목 도장을 찍어 줍니다.
 *   (tests/storage-save-wrap-order.test.js 가 이 순서를 못 박습니다)
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 의 이 파일 <script> 한 줄을 지우면 즉시 원래대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.PendingOrderRestoreGuard = (function () {
  "use strict";

  var STORAGE_KEY = "trading";     // js/trading.js:53 과 같은 값
  var MAKER_FEE_RATE = 0.0002;     // js/trading.js:51 FEE_RATE.maker
  var LIMIT_TYPE = "limit";        // js/trading.js:254 logOrder({ type: "limit" })
  var OPEN = "OPEN";
  var FILLED = "FILLED";
  var CANCELLED = "CANCELLED";

  var armed = true;          // ★복원 구간에서만 true★
  var restoredCount = 0;
  var lastRestored = null;   // 진단용 — 무엇을 되살렸는가
  var lastSkip = null;       // 진단용 — 되살리지 않은 이유
  var origSave = null;
  var disarmHooked = false;

  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  /* 서버 numeric 은 문자열로 올 때가 있어 숫자로 맞춰 봅니다.
     숫자로 못 만들면 null 입니다(추측하지 않습니다). */
  function toNum(v) {
    if (typeof v === "number") return isFinite(v) ? v : null;
    if (typeof v === "string" && v.trim() !== "") {
      var n = Number(v);
      return isFinite(n) ? n : null;
    }
    return null;
  }

  function isSide(v) {
    return v === "long" || v === "short";
  }

  /* js/trading.js:660-666 의 검사와 ★같은 조건★ 입니다.
     여기서 통과시켜도 저쪽에서 떨어지면 되살린 의미가 없습니다. */
  function isValidOrder(o) {
    if (!o || typeof o !== "object") return false;
    return (
      isSide(o.side) &&
      num(o.price) !== null && o.price > 0 &&
      num(o.margin) !== null && o.margin > 0 &&
      num(o.leverage) !== null && o.leverage > 0 &&
      num(o.notional) !== null && o.notional > 0
    );
  }

  function isValidPosition(p) {
    if (!p || typeof p !== "object") return false;
    return isSide(p.side) && num(p.entry) !== null && num(p.margin) !== null;
  }

  /* ---------------------------------------------------------------------
   * ② 서버가 준 orderHistory 에서 미체결 지정가 1건을 조립합니다.
   *    서버에 없는 것은 만들어내지 않습니다 — tp·sl 은 null 입니다.
   * ------------------------------------------------------------------- */
  function fromOrderHistory(orderHistory) {
    if (!Array.isArray(orderHistory)) return null;
    var best = null;
    for (var i = 0; i < orderHistory.length; i++) {
      var o = orderHistory[i];
      if (!o || typeof o !== "object") continue;
      if (o.status !== OPEN) continue;
      if (o.type !== LIMIT_TYPE) continue;
      if (!isSide(o.side)) continue;

      var price = toNum(o.price);
      var margin = toNum(o.margin);
      var leverage = toNum(o.leverage);
      if (price === null || price <= 0) continue;
      if (margin === null || margin <= 0) continue;
      if (leverage === null || leverage <= 0) continue;

      var createdTime = toNum(o.createdTime);
      if (createdTime === null) createdTime = 0;
      if (best === null || createdTime > best.createdTime) {
        var notional = margin * leverage;
        best = {
          id: o.id,
          side: o.side,
          price: price,
          margin: margin,
          leverage: leverage,
          notional: notional,
          entryFee: notional * MAKER_FEE_RATE, // 지정가 = 메이커 (js/trading.js:213)
          tp: null,   // 서버 orders 에 칸이 없습니다. 추측하지 않습니다
          sl: null,
          status: OPEN,
          createdTime: createdTime,
        };
      }
    }
    return best;
  }

  /* ---------------------------------------------------------------------
   * ① 로컬에 남아 있는 pendingOrder 를 그대로 씁니다(tp·sl·symbol 포함).
   *    값을 두 벌로 두지 않으려고 사본을 따로 안 들고 저장소를 읽습니다.
   * ------------------------------------------------------------------- */
  function fromLocal() {
    if (!App.Storage || typeof App.Storage.load !== "function") return null;
    var doc;
    try {
      doc = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      return null;
    }
    if (!doc || typeof doc !== "object") return null;
    if (!isValidOrder(doc.pendingOrder)) return null;

    /* 얕은 복사 — 다른 구독자가 같은 객체를 보고 있을 수 있습니다. */
    var src = doc.pendingOrder;
    var copy = {};
    for (var k in src) {
      if (Object.prototype.hasOwnProperty.call(src, k)) copy[k] = src[k];
    }
    /* 손상된 값만 다시 계산합니다(원래 값이 멀쩡하면 손대지 않습니다). */
    if (num(copy.notional) === null || copy.notional <= 0) copy.notional = copy.margin * copy.leverage;
    if (num(copy.entryFee) === null) copy.entryFee = copy.notional * MAKER_FEE_RATE;
    return copy;
  }

  /* ---------------------------------------------------------------------
   * 안전장치 — 되살리면 안 되는 증거가 서버 쪽에 있는가.
   * 증거가 있으면 그 이유(문자열)를, 없으면 null 을 돌려줍니다.
   * ------------------------------------------------------------------- */
  function refuseReason(order, incoming) {
    if (!order) return "되살릴 주문이 없습니다";
    if (!incoming || typeof incoming !== "object") return null;

    /* 포지션이 있으면 공존할 수 없는 상태입니다(js/trading.js:121-124 · :199-204) */
    if (isValidPosition(incoming.position)) {
      if (incoming.position.orderId && incoming.position.orderId === order.id) {
        return "다른 기기에서 이미 체결됐습니다(position.orderId 가 같습니다)";
      }
      return "이미 포지션이 있습니다 — 미체결과 포지션은 동시에 존재할 수 없습니다";
    }

    /* 서버 주문내역이 이 주문의 끝을 알고 있으면 그쪽이 사실입니다 */
    var list = incoming.orderHistory;
    if (Array.isArray(list) && order.id) {
      for (var i = 0; i < list.length; i++) {
        var o = list[i];
        if (!o || typeof o !== "object" || o.id !== order.id) continue;
        if (o.status === FILLED) return "다른 기기에서 이미 체결됐습니다(서버 주문내역 FILLED)";
        if (o.status === CANCELLED) return "다른 기기에서 이미 취소됐습니다(서버 주문내역 CANCELLED)";
      }
    }
    return null;
  }

  /* ---------------------------------------------------------------------
   * 저장 직전 한 번. 원본 객체는 건드리지 않고 얕은 복사본을 돌려줍니다.
   * ------------------------------------------------------------------- */
  function restore(incoming) {
    if (!incoming || typeof incoming !== "object") return incoming;
    if (isValidOrder(incoming.pendingOrder)) return incoming; // 이미 들어 있으면 손대지 않습니다

    var order = fromLocal();
    var source = "로컬";
    if (!order) {
      order = fromOrderHistory(incoming.orderHistory);
      source = "서버 주문내역";
    }
    if (!order) return incoming;

    var reason = refuseReason(order, incoming);
    if (reason) {
      lastSkip = { order: order, source: source, reason: reason };
      console.warn(
        "[pending-order-restore-guard.js] 미체결 주문을 되살리지 않았습니다 — " + reason + "."
      );
      return incoming;
    }

    var copy = {};
    for (var k in incoming) {
      if (Object.prototype.hasOwnProperty.call(incoming, k)) copy[k] = incoming[k];
    }
    copy.pendingOrder = order;

    restoredCount++;
    lastRestored = { order: order, source: source };
    console.warn(
      "[pending-order-restore-guard.js] 새로고침에 지워질 뻔한 미체결 지정가 주문을 지켰습니다(" +
        source + "). " +
        order.side + " 지정가=" + order.price +
        " 증거금=" + order.margin +
        " 배율=" + order.leverage +
        " 명목=" + order.notional +
        " 진입수수료=" + order.entryFee +
        (source === "서버 주문내역" ? " (tp·sl 은 서버에 없어 비어 있습니다)" : "")
    );
    return copy;
  }

  function wrapStorage() {
    if (!App.Storage || typeof App.Storage.save !== "function") return false;
    if (App.Storage.__pendingOrderGuarded) return true;
    origSave = App.Storage.save;
    App.Storage.save = function (key, data) {
      if (armed && key === STORAGE_KEY && data && typeof data === "object") {
        try {
          data = restore(data);
        } catch (e) {
          console.warn("[pending-order-restore-guard.js] 검사 중 오류 — 원본 그대로 저장합니다:", e);
        }
      }
      return origSave.call(App.Storage, key, data);
    };
    App.Storage.__pendingOrderGuarded = true;
    return true;
  }

  /* 부팅이 시작되면 복원 구간이 끝난 것이므로 검사를 끕니다.
     js/ghost-position-guard.js:216-227 · js/symbol-guard.js 와 같은 방식입니다.
     함수에 붙인 표시가 아니라 모듈 안의 플래그로 중복 감싸기를 막습니다
     (js/guest-access.js 도 App.bootApp 을 감싸기 때문입니다). */
  function disarmOnBoot() {
    if (disarmHooked) return true;
    if (!App.bootApp) return false;
    var orig = App.bootApp;
    var wrapped = function () {
      armed = false;
      return orig.apply(this, arguments);
    };
    wrapped.__pendingOrderDisarm = true;
    App.bootApp = wrapped;
    disarmHooked = true;
    return true;
  }

  function init() {
    var a = wrapStorage();
    var b = disarmOnBoot();
    if (a && b) return;
    var tries = 0;
    var t = setInterval(function () {
      var x = wrapStorage();
      var y = disarmOnBoot();
      if ((x && y) || ++tries > 100) clearInterval(t);
    }, 50);
  }

  /* 스크립트가 읽히는 즉시 감쌉니다 — js/auth.js 의 복원 저장은
     await 뒤라서 항상 이 시점보다 나중입니다. */
  init();

  return {
    init: init,
    restore: restore,
    fromLocal: fromLocal,
    fromOrderHistory: fromOrderHistory,
    refuseReason: refuseReason,
    isValidOrder: isValidOrder,
    getRestoredCount: function () { return restoredCount; },
    getLastRestored: function () { return lastRestored; },
    getLastSkip: function () { return lastSkip; },
    isArmed: function () { return armed; },
    _setArmed: function (v) { armed = !!v; },
    MAKER_FEE_RATE: MAKER_FEE_RATE,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.PendingOrderRestoreGuard;
