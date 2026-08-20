/* =========================================================================
 * js/guest-state-guard.js — App.GuestStateGuard
 * =========================================================================
 * 로그인하지 않았는데 앞사람의 잔고·포지션이 화면에 남아 있는 것을 막습니다.
 *
 * ── 무엇이 문제였나 ─────────────────────────────────────────────────────
 * 거래 데이터는 브라우저 안(localStorage)에 남습니다.
 * js/auth.js 의 로그아웃 버튼은 그 데이터를 지우지만, 사람들은 로그아웃을
 * 잘 누르지 않습니다. 그냥 탭을 닫습니다. 세션이 만료돼도 마찬가지입니다.
 *
 *   로그인 -> 거래 -> [로그아웃 버튼]  : 지워짐
 *   로그인 -> 거래 -> 탭 닫기·세션만료 : 그대로 남음  ← 이 경우
 *
 * 그러면 다음에 그 컴퓨터를 켠 사람이 남의 포지션을 봅니다.
 * 공용 컴퓨터라면 그대로 남의 성적이 노출됩니다.
 *
 * ── 왜 비회원의 거래 데이터는 항상 찌꺼기인가 ───────────────────────────
 * js/login-required.js 가 매수·매도 버튼을 회원에게만 열어 줍니다.
 * 비회원은 애초에 포지션을 잡을 수 없습니다.
 * 그러므로 "로그인 안 된 상태에 거래 데이터가 있다" = "지난 사람의 흔적"
 * 입니다.
 *
 * ── 가장 조심해야 할 것 ─────────────────────────────────────────────────
 * 회원이 접속하는 순간에도 아주 잠깐은 "로그인 안 된 상태"로 보입니다.
 * 그 타이밍에 지우면 진짜 회원 데이터가 날아갑니다.
 * 그래서 화면 상태가 아니라 로그인 서버에 직접 물어봅니다.
 *   · 세션이 있다        -> 회원입니다. 절대 지우지 않습니다.
 *   · 세션이 없다        -> 확실한 비회원입니다. 그때만 지웁니다.
 *   · 물어볼 수 없다     -> 판단을 미룹니다. 지우지 않습니다.
 * 확신이 없으면 남겨두는 쪽을 택합니다. 잘못 지우는 것이 훨씬 나쁩니다.
 *
 * ── 지운 뒤에 새로고침하는 이유 ─────────────────────────────────────────
 * js/trading.js 는 이미 옛 데이터를 메모리에 올린 상태이고, 다음 저장 때
 * 그대로 다시 써 버립니다. 그래서 지운 직후 페이지를 한 번 다시 엽니다.
 * 새로고침이 반복되지 않도록 표시를 남깁니다.
 *
 * 수정 금지 파일(js/auth.js, js/trading.js)은 건드리지 않습니다.
 * 지우는 것은 거래 데이터와 주인 표시뿐이고, 화면 설정(테마·표시 통화)은
 * 그대로 둡니다.
 * ========================================================================= */

window.App = window.App || {};

App.GuestStateGuard = (function () {
  "use strict";

  var DATA_KEY = "trading";        // 잔고·포지션·거래내역
  var OWNER_KEY = "trading-owner"; // 이 데이터가 누구 것인지 (account-isolation.js 와 같은 키)
  var RELOAD_FLAG = "tl_guest_state_cleared"; // 새로고침 반복 방지

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  /* 지울 만한 거래 흔적이 있는지 — 빈 초기 상태는 지울 것도 없습니다. */
  function hasTradingData() {
    if (!App.Storage) return false;
    var d = App.Storage.load(DATA_KEY);
    if (!d) return false;
    var trades = Array.isArray(d.closedTrades) ? d.closedTrades.length : 0;
    return !!(d.position || trades > 0 || d.pendingOrder);
  }

  /* 로그인 서버에 직접 물어봅니다.
     true = 회원, false = 확실한 비회원, null = 알 수 없음 */
  async function loggedIn() {
    var client = sb();
    if (!client || !client.auth || typeof client.auth.getSession !== "function") return null;
    try {
      var res = await client.auth.getSession();
      if (res && res.error) return null;              // 물어보다 실패 — 판단 보류
      var session = res && res.data ? res.data.session : null;
      return !!(session && session.user);
    } catch (e) {
      console.warn("[guest-state-guard.js] 로그인 상태를 확인하지 못해 그대로 둡니다:", e);
      return null;                                     // 알 수 없으면 남깁니다
    }
  }

  function alreadyReloaded() {
    try {
      return window.sessionStorage.getItem(RELOAD_FLAG) === "1";
    } catch (e) {
      return false;
    }
  }

  function markReloaded() {
    try {
      window.sessionStorage.setItem(RELOAD_FLAG, "1");
    } catch (e) {
      /* sessionStorage 가 막힌 환경 — 새로고침은 건너뜁니다(무한 반복 방지) */
    }
  }

  /* 회원으로 확인되면 표시를 지웁니다.
     그래야 나중에 로그아웃하고 다시 들어왔을 때 정상 동작합니다. */
  function clearReloadFlag() {
    try {
      window.sessionStorage.removeItem(RELOAD_FLAG);
    } catch (e) {
      /* noop */
    }
  }

  async function check() {
    if (!App.Storage) return "저장소 없음";
    if (!hasTradingData()) return "지울 것 없음";

    var member = await loggedIn();
    if (member === true) {
      clearReloadFlag();
      return "회원 — 그대로 둠";
    }
    if (member === null) return "확인 불가 — 그대로 둠";

    /* 여기까지 왔으면 확실한 비회원인데 거래 데이터가 남아 있습니다. */
    App.Storage.clear(DATA_KEY);
    App.Storage.clear(OWNER_KEY);
    console.warn(
      "[guest-state-guard.js] 로그인하지 않은 상태에 지난 거래 데이터가 남아 있어 정리했습니다."
    );

    /* trading.js 가 메모리의 옛 데이터를 다시 저장하기 전에 페이지를 다시 엽니다. */
    if (alreadyReloaded()) return "정리함(새로고침 생략)";
    markReloaded();
    try {
      window.location.reload();
    } catch (e) {
      console.warn("[guest-state-guard.js] 새로고침 실패(다음 방문 때 정리됩니다):", e);
    }
    return "정리함";
  }

  function init() {
    check();
    /* 로그인 복구가 늦게 끝나는 경우가 있어 한 번 더 확인합니다.
       늦게 확인하는 쪽은 "회원이었다"로 밝혀질 수 있어 더 안전합니다. */
    setTimeout(check, 2500);
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", check);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    check: check,
    hasTradingData: hasTradingData,
    loggedIn: loggedIn,
  };
})();
