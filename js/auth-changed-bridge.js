/* =========================================================================
 * js/auth-changed-bridge.js — App.AuthChangedBridge
 * =========================================================================
 * TL-015 — "auth:changed 를 13곳이 구독하는데 발신이 0건"
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────────────────
 *   로그인은 js/auth.js:132 App.bootApp() 이,
 *   로그아웃은 js/auth.js:349 location.reload() 가 덮습니다.
 *   ★딱 하나 — "비회원으로 둘러보다 화면 안에서 로그인" 하는 길★ 에만
 *   새로고침이 없습니다. 그 길에서만 아래가 그대로 굳습니다.
 *
 *     js/my-private-info.js:105   마이페이지가 "로그인 후 확인할 수 있습니다" 로 남음
 *     js/mypage-history.js:216    TL·핫딜·보관함 내역 래치(loaded)가 안 풀림
 *     js/sync-guard.js:161        serverBaseline 이 영원히 null → 유실 판정을 못 함
 *
 * ── ⚠⚠ 왜 App.Bus 로 "auth:changed" 를 쏘지 않는가 ★제일 중요★ ────────
 *   쏘면 ★13곳이 한꺼번에 깨어납니다★. 그중 하나가 위험합니다 —
 *
 *     js/account-isolation.js:105   App.Bus.on("auth:changed", check);
 *
 *   check() 는 조건이 맞으면 App.Storage.clear("trading") 을 부릅니다.
 *   ★로컬 거래 데이터를 지웁니다. 지우면 되돌릴 수 없습니다.★
 *   (tests/auth-changed-wakeup-seal.test.js 머리말에 같은 경고가 있습니다)
 *
 *   그래서 조사팀 권고대로 ★쏘지 않고, 안전한 것만 이름으로 골라 직접 부릅니다★.
 *   이 파일이 도는 동안에도 13곳은 그대로 자고 있습니다 — 지금과 똑같습니다.
 *   깨어나는 것은 아래 WAKE 목록 3개뿐입니다.
 *
 *   ⛔ AccountIsolation 을 WAKE 에 넣지 마세요. 데이터가 지워집니다.
 *      넣을지 말지는 ★대표 확인 사항★ 입니다. 넣으면 아래 [금지] 검사가 터집니다.
 *
 * ── 어떻게 알아채나 ─────────────────────────────────────────────────────
 *   js/auth.js 는 ★수정 금지 파일★ 이고 App.Auth 는 init 과 getNickname 만
 *   내놓습니다. 그래서 auth.js 를 건드리지 않고 Supabase 클라이언트의
 *   auth.onAuthStateChange 를 직접 구독합니다. 타이머를 돌리지 않습니다.
 *
 *   · 맨 처음 오는 신호(INITIAL_SESSION)는 ★기억만 하고 깨우지 않습니다★.
 *     그때는 각 모듈이 이미 자기 init() 에서 한 번 불렀습니다. 두 번 부르면
 *     서버 요청만 두 배가 됩니다.
 *   · 토큰 갱신(TOKEN_REFRESHED)처럼 ★사람이 그대로면 깨우지 않습니다★.
 *   · 로그아웃(사람 → 없음)도 깨웁니다. 안 깨우면 앞 회원의 이메일·전화번호가
 *     화면에 그대로 남습니다.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *   index.html 에서 이 파일의 <script> 한 줄만 지우면 원래대로 돌아갑니다.
 *   이 파일은 다른 파일을 하나도 고치지 않았습니다.
 *
 * ⚠ 수정 금지 파일(js/auth.js 포함 12개)을 한 글자도 건드리지 않았습니다.
 * ========================================================================= */

window.App = window.App || {};

App.AuthChangedBridge = (function () {
  "use strict";

  /* -----------------------------------------------------------------------
   * 깨울 대상 — ★이름으로 못 박습니다. 여기 없는 것은 부르지 않습니다.★
   * 늘리려면 "그 함수가 무엇을 지우는가" 를 먼저 확인하세요.
   * --------------------------------------------------------------------- */
  var WAKE = [
    { 모듈: "SyncGuard", 함수: "loadBaseline",
      왜: "로그인 뒤 서버 기준값을 다시 읽습니다 (js/sync-guard.js:161)" },
    { 모듈: "MyPrivateInfo", 함수: "load",
      왜: "'로그인 후 확인할 수 있습니다' 가 굳어 있던 것 (js/my-private-info.js:105)" },
    { 모듈: "MypageHistory", 함수: "load",
      왜: "TL·핫딜·보관함 내역 래치를 되돌립니다 (js/mypage-history.js:216)" }
  ];

  /* ⛔ 일부러 뺀 것. 여기 있는 이름은 ★절대 WAKE 에 넣지 않습니다★.
     App.AccountIsolation.check() 는 App.Storage.clear("trading") 으로
     로컬 거래기록을 지웁니다. 되돌릴 수 없어서 대표 확인 사항입니다. */
  var NEVER = ["AccountIsolation"];

  var RETRY_MS = 500;   /* Supabase 클라이언트가 아직 없을 때 다시 시도하는 간격 */
  var MAX_RETRY = 10;   /* 500ms × 10 = 5초까지만. 그 뒤에는 조용히 포기합니다 */

  /* undefined = 아직 신호를 한 번도 못 받음 / null = 비회원 / 문자열 = 그 회원
     ⚠ "첫 신호를 봤나" 를 따로 변수로 두지 않습니다. 새로고침하면 0 이 되는
        기억 변수가 하나 느는 셈이라, undefined 를 그 표시로 씁니다. */
  var lastUid;
  var wakes = 0;            /* 실제로 깨운 횟수 */
  var calls = 0;            /* 실제로 부른 함수 개수 (누적) */
  var subscribed = false;
  var retries = 0;
  var lastReason = "아직 없음";

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  function uidOf(session) {
    return (session && session.user && session.user.id) || null;
  }

  /* -----------------------------------------------------------------------
   * 안전 목록만 직접 부릅니다. App.Bus 로 쏘지 않습니다.
   * 하나가 실패해도 나머지는 계속 부릅니다 — 오류는 감추지 않고 그대로 찍습니다.
   * --------------------------------------------------------------------- */
  function wake(why) {
    wakes++;
    lastReason = why;
    WAKE.forEach(function (t) {
      /* 금지 목록이 실수로 섞였으면 그 자리에서 멈춥니다(데이터가 지워집니다) */
      if (NEVER.indexOf(t.모듈) !== -1) {
        console.error(
          "[auth-changed-bridge.js] App." + t.모듈 + " 은 깨우면 안 되는 모듈입니다. " +
          "로컬 거래기록이 지워집니다. 건너뜁니다."
        );
        return;
      }
      var m = App[t.모듈];
      if (!m || typeof m[t.함수] !== "function") return;   /* 아직 안 실렸으면 조용히 넘어갑니다 */
      try {
        calls++;
        var r = m[t.함수]();
        if (r && typeof r.catch === "function") {
          r.catch(function (e) {
            console.warn(
              "[auth-changed-bridge.js] App." + t.모듈 + "." + t.함수 + "() 실패: " +
              ((e && e.message) || e)
            );
          });
        }
      } catch (e) {
        console.warn(
          "[auth-changed-bridge.js] App." + t.모듈 + "." + t.함수 + "() 예외: " +
          ((e && e.message) || e)
        );
      }
    });
  }

  /* -----------------------------------------------------------------------
   * Supabase 가 주는 신호 한 건을 처리합니다.
   * 무엇을 했는지 글자로 돌려줍니다(테스트가 이 값을 봅니다).
   * --------------------------------------------------------------------- */
  function handle(event, session) {
    var uid = uidOf(session);

    if (lastUid === undefined) {
      /* 페이지를 막 열었을 때입니다. 각 모듈이 이미 자기 init() 에서 불렀습니다. */
      lastUid = uid;
      return "첫 확인 — 기억만 하고 깨우지 않음";
    }

    if (uid === lastUid) {
      /* 토큰 갱신 등. 사람이 안 바뀌었으면 아무것도 안 합니다. */
      return "같은 사람 — 깨우지 않음";
    }

    var before = lastUid;
    lastUid = uid;
    wake((event || "auth") + " · " + (before ? "회원" : "비회원") + " → " + (uid ? "회원" : "비회원"));
    return "깨움";
  }

  /* --------------------------------------------------------------------- */
  function init() {
    if (subscribed) return true;
    var client = sb();
    if (!client || !client.auth || typeof client.auth.onAuthStateChange !== "function") {
      if (retries++ < MAX_RETRY) setTimeout(init, RETRY_MS);
      return false;
    }
    try {
      client.auth.onAuthStateChange(function (event, session) { return handle(event, session); });
    } catch (e) {
      console.warn("[auth-changed-bridge.js] 로그인 신호를 구독하지 못했습니다: " +
                   ((e && e.message) || e));
      return false;
    }
    subscribed = true;
    return true;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    handle: handle,
    WAKE: WAKE,
    NEVER: NEVER,
    isSubscribed: function () { return subscribed; },
    getStats: function () {
      return { wakes: wakes, calls: calls, lastUid: lastUid || null, why: lastReason };
    },
    /* 테스트가 상태를 되돌릴 수 있게 합니다. 화면 코드는 쓰지 않습니다. */
    _reset: function () {
      lastUid = undefined; wakes = 0; calls = 0;
      subscribed = false; retries = 0; lastReason = "아직 없음";
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.AuthChangedBridge;
