/* =========================================================================
 * js/ghost-position-guard.js — App.GhostPositionGuard
 * =========================================================================
 * [P1] "유령 청산" — 이미 청산된 포지션이 서버에 남아 있다가, 새로고침하면
 * 되살아나서 첫 시세에 즉시 강제청산되는 것.
 *
 * ── 대표님이 겪은 그대로 ─────────────────────────────────────────
 *   "오늘 주문 안 넣음. 주문하려고 했는데 포지션이 있대.
 *    근데 내 화면에는 포지션 없었거든. 어제 청산당해서.
 *    그래서 새로고침했더니 채팅창에 청산당했다고 뜨면서"
 *
 * 어제 청산된 포지션의 행이 서버 positions 에 남아 있었고,
 * js/auth.js 의 hydrateLocalStateFromSupabase() 가 그것을 그대로 복원해서
 * localStorage 에 넣습니다. 그다음 js/trading.js 가 그 포지션을 메모리에
 * 올리고, 첫 price:update 에서 checkTriggers() 가 청산가를 지나쳤다고 보고
 * 강제청산합니다. 회원은 넣지도 않은 주문으로 증거금을 통째로 잃습니다.
 *
 * ── 왜 서버에 남았나 (다른 파일에서 고칩니다) ────────────────────
 * js/supabase-sync.js 172행 `if (syncing) return;` 이 청산 이벤트를 통째로
 * 버리기 때문입니다. 그 재발 방지는 js/persist-sync-queue.js 가 맡습니다.
 * 이 파일은 이미 남아 있는 유령을 복원 단계에서 걸러내는 쪽입니다.
 *
 * ── 어떻게 걸러내나 ──────────────────────────────────────────────
 * 이 사이트는 포지션을 한 번에 하나만 가질 수 있습니다
 * (js/trading.js 의 state.position 은 단수, 서버도 maybeSingle()).
 * 그래서 다음이 성립합니다.
 *
 *   살아 있는 포지션이라면, 그 포지션이 열린 시각 이후에
 *   "전체청산" 거래가 기록돼 있을 수 없다.
 *   (전체청산은 같은 함수 안에서 state.position = null 로 만든다)
 *
 * 그러므로 포지션이 열린 뒤에 전체청산 거래가 있으면 그 포지션은 유령입니다.
 *
 * ── 그냥 시간만 비교하면 진짜 포지션을 지웁니다 ──────────────────
 * 두 가지 함정이 있어서 시간 비교만으로는 안 됩니다.
 *
 *  (1) 부분청산 — js/trading.js 414행 closePartial(ratio) 은 ratio<1 이면
 *      거래를 기록하면서도 포지션을 그대로 둡니다(openTime 도 안 바뀜).
 *      즉 살아 있는 포지션인데도 "더 최근의 거래"가 존재합니다.
 *      -> reason 이 "부분청산" 인 거래는 증거에서 제외합니다.
 *      (closePartial 은 남는 수량이 최소치 미만이면 ratio 를 1 로 올리지만
 *       reason 은 "부분청산" 그대로입니다. 그 경우 유령을 못 잡을 뿐,
 *       진짜 포지션을 지우지는 않습니다 — 안전한 쪽으로 틀립니다.)
 *
 *  (2) 기기 사이 시계 차이 — 폰 시계가 5분 빠르면, 폰에서 청산한 거래의
 *      시각이 PC 에서 새로 연 포지션보다 미래로 기록될 수 있습니다.
 *      시간만 보면 살아 있는 포지션을 유령으로 오판합니다.
 *      -> 시간 말고 신원 증거를 하나 더 요구합니다.
 *
 * 그래서 아래 셋을 전부 만족할 때만 유령으로 봅니다.
 *
 *   (1) 그 거래가 전체청산이다            reason !== "부분청산"
 *   (2) 그 거래가 포지션보다 나중이다      closeTime > openTime + 2초
 *   (3) 그 거래가 바로 이 포지션을 닫은 거래로 보인다
 *       — side 가 같고 entry(진입가)가 같다
 *
 * (3) 이 핵심입니다. 진입가는 소수점까지 있는 실수라 남남인 포지션끼리
 * 우연히 일치할 일이 사실상 없습니다. 시계가 어긋나도 (3) 이 막아줍니다.
 * 애매하면 지우지 않습니다. 증거가 하나라도 모자라면 그대로 둡니다.
 *
 * ── 언제만 동작하나 (영향 범위 제한) ─────────────────────────────
 * 복원 구간에서만 동작합니다. App.bootApp() 이 불리는 순간 스스로 꺼집니다.
 * 즉 회원이 이 세션에서 직접 연 포지션은 절대 이 검사를 거치지 않습니다.
 * (js/auth.js 는 hydrate -> bootOnce 순서라 복원 저장은 항상 부팅 전입니다.)
 *
 * ── 지운 것을 되살릴 수 있게 ─────────────────────────────────────
 * 걸러낸 포지션은 버리지 않고 localStorage 의 "ghost-position-removed" 에
 * 통째로 남깁니다. 혹시 오판이었으면 그 값으로 되돌릴 수 있습니다.
 * 잔고·거래내역·주문내역은 한 글자도 건드리지 않습니다.
 * (유령이 맞다면 청산될 때 이미 증거금이 정산됐으므로 잔고는 그대로가 맞습니다.)
 *
 * ── 수정 금지 파일 ───────────────────────────────────────────────
 * js/auth.js · js/trading.js · js/supabase-sync.js 는 건드리지 않았습니다.
 * App.Storage.save 를 감싸는 방식으로만 끼어듭니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────
 * index.html 의 이 파일 <script> 한 줄을 지우면 즉시 원래대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.GhostPositionGuard = (function () {
  "use strict";

  var STORAGE_KEY = "trading";              // js/trading.js 50행과 같은 값
  var RECOVERY_KEY = "ghost-position-removed";
  var PARTIAL_REASON = "부분청산";           // js/trading.js 461행
  var TOLERANCE_MS = 2000;                  // 같은 기기 안에서의 시각 흔들림 흡수
  var ENTRY_EPSILON = 1e-6;                 // 진입가 비교(실수 왕복 오차)

  var armed = true;      // 복원 구간에서만 true
  var removedCount = 0;
  var lastRemoved = null;
  var origSave = null;   // 감싸기 전의 App.Storage.save
  var disarmHooked = false; // App.bootApp 을 이미 감쌌는가

  function num(v) {
    return typeof v === "number" && isFinite(v) ? v : null;
  }

  /* 두 진입가가 사실상 같은가 — DB numeric 왕복 오차만 흡수합니다. */
  function sameEntry(a, b) {
    var x = num(a), y = num(b);
    if (x === null || y === null) return false;
    if (x === y) return true;
    var scale = Math.max(Math.abs(x), Math.abs(y), 1);
    return Math.abs(x - y) / scale < ENTRY_EPSILON;
  }

  /* 이 거래가 "바로 이 포지션을 닫은 전체청산" 으로 보이는가 */
  function closesThisPosition(trade, position) {
    if (!trade || typeof trade !== "object") return false;
    if (!position || typeof position !== "object") return false;
    if (trade.reason === PARTIAL_REASON) return false;           // (1) 부분청산 제외
    var closeTime = num(trade.closeTime);
    var openTime = num(position.openTime);
    if (closeTime === null || openTime === null) return false;
    if (closeTime - openTime <= TOLERANCE_MS) return false;      // (2) 시간 증거
    if (trade.side !== position.side) return false;              // (3) 신원 증거
    if (!sameEntry(trade.entry, position.entry)) return false;
    return true;
  }

  /* 유령이면 근거를 담은 객체를, 아니면 null 을 돌려줍니다. */
  function findGhostEvidence(snapshot) {
    if (!snapshot || typeof snapshot !== "object") return null;
    var position = snapshot.position;
    if (!position || typeof position !== "object") return null;
    if (num(position.openTime) === null) return null;            // 시각을 모르면 판단 불가 -> 둔다
    var trades = snapshot.closedTrades;
    if (!Array.isArray(trades) || trades.length === 0) return null;

    for (var i = 0; i < trades.length; i++) {
      if (closesThisPosition(trades[i], position)) {
        return {
          position: position,
          trade: trades[i],
          heldMs: trades[i].closeTime - position.openTime,
        };
      }
    }
    return null;
  }

  function rawSave(key, data) {
    if (origSave) return origSave.call(App.Storage, key, data);
    return App.Storage.save(key, data);
  }

  function stash(evidence) {
    try {
      rawSave(RECOVERY_KEY, {
        removedAt: Date.now(),
        position: evidence.position,
        closedByTrade: evidence.trade,
      });
    } catch (e) {
      /* 보관에 실패해도 걸러내기는 그대로 진행합니다 */
    }
  }

  /* 저장 직전에 유령을 걸러냅니다. 원본 객체는 건드리지 않고 얕은 복사본을
     만들어 position 만 null 로 바꿉니다 — 다른 구독자가 같은 객체를 보고
     있을 수 있기 때문입니다. */
  function sanitize(data) {
    var evidence = findGhostEvidence(data);
    if (!evidence) return data;

    removedCount++;
    lastRemoved = evidence;
    stash(evidence);

    console.warn(
      "[ghost-position-guard.js] 이미 청산된 포지션이 복원되려 해서 걸러냈습니다(유령 청산 방지). " +
        "side=" + evidence.position.side +
        " 진입가=" + evidence.position.entry +
        " 연 시각=" + new Date(evidence.position.openTime).toISOString() +
        " 이 포지션을 닫은 거래=" + new Date(evidence.trade.closeTime).toISOString() +
        " (" + evidence.trade.reason + "). " +
        "되살리려면 localStorage 의 " + RECOVERY_KEY + " 를 보세요."
    );

    var copy = {};
    for (var k in data) {
      if (Object.prototype.hasOwnProperty.call(data, k)) copy[k] = data[k];
    }
    copy.position = null;
    return copy;
  }

  function wrapStorage() {
    if (!App.Storage || typeof App.Storage.save !== "function") return false;
    if (App.Storage.__ghostGuarded) return true;
    origSave = App.Storage.save;
    App.Storage.save = function (key, data) {
      if (armed && key === STORAGE_KEY && data && typeof data === "object") {
        try {
          data = sanitize(data);
        } catch (e) {
          console.warn("[ghost-position-guard.js] 검사 중 오류 — 원본 그대로 저장합니다:", e);
        }
      }
      return origSave.call(App.Storage, key, data);
    };
    App.Storage.__ghostGuarded = true;
    return true;
  }

  /* 부팅이 시작되면 복원 구간이 끝난 것이므로 검사를 끕니다.
     js/guest-access.js 도 같은 방식으로 App.bootApp 을 감쌉니다. */
  /* js/guest-access.js 도 App.bootApp 을 감쌉니다. 그쪽이 나중에 한 번 더
     감싸면 우리 표시(__ghostDisarm)가 바깥 함수에서는 안 보입니다. 그래도
     안쪽의 우리 함수는 그대로 불리므로 다시 감쌀 필요가 없습니다.
     함수에 붙인 표시 대신 모듈 안의 플래그로 판단합니다(중복 감싸기 방지). */
  function disarmOnBoot() {
    if (disarmHooked) return true;
    if (!App.bootApp) return false;
    var orig = App.bootApp;
    var wrapped = function () {
      armed = false;
      return orig.apply(this, arguments);
    };
    wrapped.__ghostDisarm = true;
    App.bootApp = wrapped;
    disarmHooked = true;
    return true;
  }

  function init() {
    var okStorage = wrapStorage();
    var okBoot = disarmOnBoot();
    if (okStorage && okBoot) return;
    var tries = 0;
    var t = setInterval(function () {
      var a = wrapStorage();
      var b = disarmOnBoot();
      if ((a && b) || ++tries > 100) clearInterval(t);
    }, 50);
  }

  /* 스크립트가 읽히는 즉시 감쌉니다 — js/auth.js 의 복원 저장은
     DOMContentLoaded 이후에 일어나므로 이 시점이면 충분히 빠릅니다. */
  init();

  return {
    init: init,
    findGhostEvidence: findGhostEvidence,
    closesThisPosition: closesThisPosition,
    sanitize: sanitize,
    getRemovedCount: function () { return removedCount; },
    getLastRemoved: function () { return lastRemoved; },
    isArmed: function () { return armed; },
    _setArmed: function (v) { armed = !!v; },
    RECOVERY_KEY: RECOVERY_KEY,
    TOLERANCE_MS: TOLERANCE_MS,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.GhostPositionGuard;
