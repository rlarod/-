/* =========================================================================
 * js/persist-sync-queue.js — App.PersistSyncQueue
 * =========================================================================
 * [P1 재발 방지] 청산 이벤트가 서버에 안 올라가고 통째로 버려지던 것.
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────────
 * js/supabase-sync.js 172행:
 *
 *     async function onTradingPersisted(snapshot) {
 *       const client = sb();
 *       if (!client) return;
 *       if (syncing) return;      // <-- 여기서 스냅샷이 그냥 사라집니다
 *       syncing = true;
 *       ...
 *
 * 원래 주석은 "그다음 이벤트 때 최신 스냅샷으로 다시 맞춰짐" 이라고 적혀
 * 있지만, **그다음 이벤트가 안 오면 영영 안 맞춰집니다.**
 *
 * 청산은 보통 이렇게 몰려서 일어납니다.
 *   진입 -> persist  (동기화 시작, 네트워크 왕복 4번: account/position/trades/orders)
 *   곧바로 청산 -> persist  (아직 syncing=true -> **버려짐**)
 *   그리고 조용해짐 (다음 이벤트 없음)
 *
 * 그러면 서버 positions 에는 **닫힌 포지션 행이 그대로 남습니다.**
 * 다음 새로고침 때 그 행이 복원돼서 유령 청산이 일어납니다
 * (증상과 걸러내기는 js/ghost-position-guard.js 참고).
 *
 * ── 어떻게 고치나 ────────────────────────────────────────────────
 * 이벤트를 버리지 않고 **줄을 세웁니다.**
 * 앞의 동기화가 끝난 뒤에 가장 마지막 스냅샷으로 한 번 더 부릅니다.
 * 우리가 겹쳐서 부르지 않으므로 `if (syncing) return;` 이 **아예 걸리지
 * 않습니다.** supabase-sync.js 는 한 글자도 안 고칩니다.
 *
 * ── 왜 "가장 마지막 것 하나"만 보내도 되나 ───────────────────────
 * 스냅샷은 매번 **전체 상태**입니다. 누적본이라 중간 것을 건너뛰어도
 * 정보가 사라지지 않습니다.
 *   · syncAccount   — 최신 잔고로 upsert. 최신 것 하나면 충분
 *   · syncPosition  — delete 후 최신 포지션만 insert. 최신 것 하나면 충분
 *   · syncNewTrades — closedTrades 는 계속 쌓이는 목록이고 lastSyncedTradesCount
 *                     와 비교해 "늘어난 만큼"을 넣습니다. 중간 스냅샷을 건너뛰어도
 *                     마지막 스냅샷에 그 거래들이 다 들어 있습니다
 *   · syncOrderHistory — orderHistoryVersion 버전 비교. 최신 것 하나면 충분
 * 그래서 네트워크를 아끼면서도 최종 상태는 반드시 서버에 반영됩니다.
 *
 * ── 절대 하지 않은 것 ────────────────────────────────────────────
 * · **App.Bus.emit 을 다시 부르지 않습니다.** 'trading:persisted' 구독자가
 *   17곳이라, 다시 방송하면 전부 두 번씩 돕니다.
 * · **payload 를 건드리지 않습니다.** 예전에 js/sync-guard.js 가 payload 의
 *   closedTrades 를 비워서 넘겼다가, js/trade-events-chat.js 가 기준을 0 으로
 *   되돌리고 200건을 전부 새 거래로 착각해 **채팅에 같은 알림을 200번**
 *   보낸 사고가 있었습니다. 여기서는 받은 스냅샷을 그대로 넘깁니다.
 * · 다른 구독자에게는 아무 영향이 없습니다. 우리가 감싸는 것은
 *   **supabase-sync 의 구독 함수 하나뿐**입니다.
 *
 * ── 어떻게 그 함수만 집어내나 ────────────────────────────────────
 * App.Bus.on 을 잠깐 감싸서, 'trading:persisted' 에 등록되는 함수 중
 * 이름이 onTradingPersisted 인 것만 줄세우기 판으로 바꿔치기합니다.
 * (이름이 바뀌면 조용히 실패하지 않도록 tests/ghost-position.test.js 가
 *  supabase-sync.js 안에 그 이름이 그대로 있는지 확인합니다.)
 * 다른 구독자는 손대지 않고 그대로 통과시킵니다.
 *
 * ── 순서 ─────────────────────────────────────────────────────────
 * App.SupabaseSync.init() 은 main.js 의 boot() 안에서 불리고, boot() 은
 * 로그인이 끝난 뒤에 실행됩니다. 이 파일은 스크립트가 읽히는 즉시
 * App.Bus.on 을 감싸므로 항상 먼저입니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────
 * index.html 의 이 파일 <script> 한 줄을 지우면 즉시 원래대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.PersistSyncQueue = (function () {
  "use strict";

  var EVENT = "trading:persisted";
  var TARGET_NAME = "onTradingPersisted";   // js/supabase-sync.js 169행

  var queued = 0;      // 겹쳐서 들어와 줄을 선 횟수 (원래대로면 버려졌을 것)
  var ran = 0;         // 실제로 원본을 부른 횟수
  var wrappedTarget = null;

  /* 원본 핸들러 하나를 "겹치지 않게 + 마지막 것만" 부르는 함수로 바꿉니다. */
  function makeQueued(orig) {
    var running = false;
    var latest = null;
    var hasLatest = false;

    function drain() {
      if (running) return;
      running = true;
      Promise.resolve()
        .then(function step() {
          if (!hasLatest) return null;
          var snap = latest;
          latest = null;
          hasLatest = false;
          ran++;
          return Promise.resolve()
            .then(function () { return orig(snap); })
            .catch(function (e) {
              console.warn("[persist-sync-queue.js] 동기화 중 오류(다음 저장 때 다시 맞춰집니다):", e);
            })
            .then(step);
        })
        .catch(function (e) {
          console.warn("[persist-sync-queue.js] 대기열 처리 중 오류:", e);
        })
        .then(function () {
          running = false;
          /* 처리 도중에 새로 들어온 것이 있으면 한 번 더 돕니다. */
          if (hasLatest) drain();
        });
    }

    function queuedHandler(snapshot) {
      if (running || hasLatest) queued++;   // 원래 코드였다면 버려졌을 건수
      latest = snapshot;                     // payload 는 그대로. 절대 안 건드립니다
      hasLatest = true;
      drain();
    }
    queuedHandler.__persistQueued = true;
    return queuedHandler;
  }

  function wrapBusOn() {
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    if (App.Bus.__persistQueueWrapped) return true;
    var origOn = App.Bus.on;
    App.Bus.on = function (event, fn) {
      if (event === EVENT && typeof fn === "function" && fn.name === TARGET_NAME && !fn.__persistQueued) {
        wrappedTarget = makeQueued(fn);
        return origOn.call(App.Bus, event, wrappedTarget);
      }
      /* 그 밖의 구독자는 손대지 않고 그대로 넘깁니다. */
      return origOn.call(App.Bus, event, fn);
    };
    App.Bus.__persistQueueWrapped = true;
    return true;
  }

  function init() {
    if (wrapBusOn()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (wrapBusOn() || ++tries > 100) clearInterval(t);
    }, 50);
  }

  init();

  return {
    init: init,
    makeQueued: makeQueued,
    isAttached: function () { return !!wrappedTarget; },
    getQueuedCount: function () { return queued; },
    getRanCount: function () { return ran; },
    EVENT: EVENT,
    TARGET_NAME: TARGET_NAME,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.PersistSyncQueue;
