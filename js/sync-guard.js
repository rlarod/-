/* =========================================================================
 * js/sync-guard.js — App.SyncGuard
 * =========================================================================
 * 로컬 데이터가 날아갔을 때 그 빈 값이 서버 원본까지 덮어쓰는 것을 막습니다.
 *
 * ── 무엇이 위험한가 ────────────────────────────────────────────────────
 * js/supabase-sync.js 는 로컬 스냅샷을 아무 검사 없이 서버에 upsert 합니다.
 *
 *   1) 어떤 이유로든 로컬 거래 데이터가 비워짐
 *      (시즌 버전 불일치, 브라우저 정리, 복원 실패 등)
 *   2) trading.js 가 빈 상태로 시작 — 잔고 10만, 실현손익 0
 *   3) 저장이 한 번 일어나면
 *   4) 서버의 realized_pnl 이 0 으로 덮어써집니다
 *   5) 랭킹도 realized_pnl 기준이라 순위까지 사라집니다
 *
 * 실제로 "분명 수익 2천만원이었는데 -155 로 보인다" 는 신고가
 * 이 경로일 가능성이 큽니다. 되돌릴 수 없는 손실입니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * 서버에 보내기 직전에 "이 저장이 기록을 크게 깎는가" 를 봅니다.
 *   · 서버에 이미 있는 실현손익·거래 건수를 먼저 읽어둡니다
 *   · 지금 보내려는 값이 그보다 크게 작으면 보내지 않고 경고합니다
 *   · 사용자가 실제로 손실을 봐서 줄어드는 경우는 거래 건수가 늘어나므로
 *     구분할 수 있습니다(건수가 줄면 데이터 유실입니다)
 *
 * 막을 때는 사용자에게도 알려 새로고침을 권합니다.
 * js/supabase-sync.js 와 js/trading.js 는 건드리지 않습니다.
 *
 * ── 2026-08-31 수정 — 기준값을 못 읽으면 0 이 아니라 "모름" 입니다 ────────
 *   서버 조회가 실패해도 Supabase 는 예외를 안 던지고 { data:null, error } 로
 *   정상 resolve 합니다. 그 error 를 안 봐서 기준값이 조용히 { 0, 0 } 이 되고,
 *   그러면 유실 판정 5곳이 전부 무력화돼 보호막이 조용히 꺼졌습니다.
 *   지금은 error 를 보고 "모름" 으로 두고, 서버 메시지를 콘솔에 그대로 찍고,
 *   5초·15초·45초 뒤 다시 읽습니다. 자세한 것은 아래 loadBaseline 위 주석.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   이 파일 하나만 바뀌었습니다. 되돌리면 2026-08-31 이전과 같아집니다.
 *     git checkout js/sync-guard.js
 *   (그러면 "서버 조회 실패 = 기준값 0" 인 조용한 고장도 같이 돌아옵니다)
 * ========================================================================= */

window.App = window.App || {};

App.SyncGuard = (function () {
  "use strict";

  var serverBaseline = null;   // { realizedPnl, tradeCount, source } — 서버에 있던 값
                               // null 이면 "모름" 입니다. ⛔ 0 이 아닙니다.
  var blocked = 0;
  var warned = false;

  /* ------------------------------------------------------------------
   * 기준값을 "못 읽었다" 와 "서버가 비어 있다" 를 구분합니다 (2026-08-31)
   * ------------------------------------------------------------------
   * ── 무엇이 터져 있었나 (기록팀 봉인 tests/sync-guard-baseline-blindspot) ──
   *   Supabase 는 조회가 실패해도 예외를 던지지 않습니다.
   *   { data: null, error: {...} } 로 **정상 resolve** 합니다.
   *   그런데 여기서 .error 를 아무도 안 봐서, 권한 오류·네트워크 오류가 나면
   *   data 가 null 이라는 이유로 기준값이 조용히 { 0, 0 } 이 됐습니다.
   *
   *     기준값 { realizedPnl: 0, tradeCount: 0 }
   *       -> "서버에 아무것도 없는 새 계정" 과 글자 그대로 똑같아 보입니다
   *       -> looksLikeDataLoss 의 세 갈래가 전부 false
   *       -> 오류 한 번에 보호막이 조용히 꺼집니다 (전형적인 조용한 고장)
   *
   * ── 어떻게 고쳤나 ────────────────────────────────────────────────
   *   실패를 0 으로 두지 않습니다. **"모름"(null) 으로 둡니다.**
   *   그리고 모름일 때 무엇을 할지 한 곳에서 정합니다 — 아래 참조.
   *
   * ── 모를 때 어떻게 하나 — "판정하지 않는다" ─────────────────────
   *   손실 판정이 기준값에 기대는 곳이 5곳인데, 모르는 상태에서는
   *   그 5곳 전부 판정하지 않고 넘깁니다(looksLikeDataLoss 가 false).
   *
   *     · 모르는데 "잃었다" 고 하면  → 멀쩡한 회원에게 "기록이 사라졌으니
   *       새로고침하라" 는 안내가 뜹니다. 실제로 아무 일도 안 일어났는데
   *       회원을 놀래키고, 오프라인·권한오류 때마다 뜹니다
   *     · 모르는데 "안 잃었다" 고 하면 → 그동안 보호가 꺼져 있습니다
   *
   *   둘 다 나쁩니다. 그래서 **모르는 시간을 짧게 만드는 쪽**을 골랐습니다.
   *     1) 실패하면 서버가 준 메시지를 그대로 콘솔에 찍습니다(감추지 않습니다)
   *     2) 5초 · 15초 · 45초 뒤 다시 읽습니다
   *     3) 지금 상태를 밖에서 볼 수 있게 합니다 — getStatus()
   *        (모르는 동안 몇 번 그냥 넘겼는지도 셉니다: skippedUnknown)
   *   "모르는 채로 계속 통과시키되, 아무도 모르게는 두지 않는다" 입니다.
   *
   *   ⚠ 모를 때 아예 "저장을 막는" 선택지도 있습니다. 그건 회원 화면에
   *     경고를 띄우는 동작이라 PM 결정 사항으로 올렸습니다. 여기서
   *     임의로 정하지 않았습니다.
   * ------------------------------------------------------------------ */
  var baselineState = "모름";        // "모름" | "읽음" | "실패"
  var baselineWhy = "아직 안 읽었습니다";
  var lastError = null;
  var skippedUnknown = 0;            // 모르는 채로 그냥 통과시킨 횟수
  var retryAt = 0;                   // 다음 재시도까지 몇 번째인지
  var RETRY_MS = [5000, 15000, 45000];

  /* ⛔ 여기서 serverBaseline 을 { 0, 0 } 으로 만들지 않습니다.
        그게 지금 고치는 그 고장입니다. 이전에 제대로 읽어둔 값이 있으면
        그것도 지우지 않습니다(오래된 값이라도 모름보다는 낫습니다). */
  function markUnknown(why, err) {
    baselineState = err ? "실패" : "모름";
    baselineWhy = why;
    lastError = err || null;
  }

  function scheduleRetry() {
    if (retryAt >= RETRY_MS.length) return;
    var ms = RETRY_MS[retryAt++];
    setTimeout(loadBaseline, ms);
  }

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  /* 서버에 지금 무엇이 있는지 한 번 읽어둡니다. */
  function loadBaseline() {
    var client = sb();
    if (!client) {
      markUnknown("서버에 연결돼 있지 않습니다(App.SupabaseClient 없음)");
      return Promise.resolve(null);
    }
    return Promise.resolve(client.auth.getUser())
      .then(function (r) {
        var uid = r && r.data && r.data.user ? r.data.user.id : null;
        if (!uid) {
          /* 로그인 상태가 아니면 서버에 기준값 자체가 없습니다.
             오류가 아니므로 다시 읽지 않습니다(로그인하면 auth:changed 로 옵니다). */
          markUnknown("로그인 상태가 아닙니다");
          return null;
        }
        return Promise.all([
          client.from("trading_accounts").select("realized_pnl").eq("user_id", uid).maybeSingle(),
          client.from("trades").select("id", { count: "exact", head: true }).eq("user_id", uid),
        ]).then(function (rows) {
          var acc = rows[0] || {};
          var trd = rows[1] || {};
          /* ⭐ 여기가 이번에 고친 곳 — .error 를 봅니다.
             Supabase 는 실패해도 예외를 안 던지고 error 를 담아 정상 resolve 합니다. */
          var err = acc.error || trd.error || null;
          if (err) {
            markUnknown("서버 조회 실패: " + (err.message || err), err);
            /* 오류를 감추지 않습니다 — 서버가 준 말을 그대로 보여줍니다 */
            console.error(
              "[sync-guard.js] 서버 기준값을 못 읽었습니다. 읽을 때까지 이 창에서는 " +
              "기록 유실 판정을 하지 않습니다: " + (err.message || err)
            );
            scheduleRetry();
            return null;
          }
          /* 오류는 없는데 건수를 못 받은 경우도 "모름" 입니다(0 이 아닙니다).
             (계정 행이 없는 것은 정상입니다 — 새 계정이면 실현손익 0 이 맞습니다) */
          if (typeof trd.count !== "number") {
            markUnknown("거래 건수를 못 읽었습니다(count 가 숫자가 아님)");
            console.error(
              "[sync-guard.js] 거래 건수를 못 읽었습니다. 읽을 때까지 이 창에서는 " +
              "기록 유실 판정을 하지 않습니다."
            );
            scheduleRetry();
            return null;
          }
          serverBaseline = {
            realizedPnl: acc.data ? Number(acc.data.realized_pnl) || 0 : 0,
            tradeCount: trd.count,
            source: "server",
          };
          baselineState = "읽음";
          baselineWhy = "서버에서 읽었습니다";
          lastError = null;
          retryAt = 0;
          return serverBaseline;
        });
      })
      .catch(function (e) {
        markUnknown("서버 기준값 조회 중 예외: " + ((e && e.message) || e), e);
        console.error(
          "[sync-guard.js] 서버 기준값을 읽지 못했습니다. 읽을 때까지 이 창에서는 " +
          "기록 유실 판정을 하지 않습니다: " + ((e && e.message) || e)
        );
        scheduleRetry();
        return null;
      });
  }

  /* 이 저장이 기록을 크게 깎는가 */
  function looksLikeDataLoss(snap) {
    /* 기준값을 모르면 판정하지 않습니다(위 "모를 때 어떻게 하나" 참조).
       그냥 넘기되 몇 번 넘겼는지는 세어 둡니다 — 아무도 모르게 두지 않으려고. */
    if (!serverBaseline && snap) skippedUnknown++;
    if (!serverBaseline || !snap) return false;

    var localTrades = Array.isArray(snap.closedTrades) ? snap.closedTrades.length : 0;
    var localPnl = Number(snap.realizedPnl) || 0;

    /* 거래 건수가 서버보다 적으면 로컬이 유실된 것입니다.
       (정상 사용에서는 건수가 줄어들지 않습니다 — 상한에 걸리기 전까지)
       상한(200건)에 닿은 경우는 제외합니다. */
    if (serverBaseline.tradeCount > 0 && serverBaseline.tradeCount < 200 &&
        localTrades < serverBaseline.tradeCount) {
      return true;
    }

    /* 거래가 하나도 없는데 서버에는 기록이 있으면 확실히 유실입니다. */
    if (localTrades === 0 && serverBaseline.tradeCount > 0) return true;

    /* 실현손익이 갑자기 0 이 됐는데 서버에는 값이 있던 경우 */
    if (localPnl === 0 && Math.abs(serverBaseline.realizedPnl) > 1 && localTrades === 0) return true;

    return false;
  }

  function tellUser() {
    if (warned) return;
    warned = true;
    console.warn(
      "[sync-guard.js] 이 창의 기록이 서버보다 적어 저장을 막았습니다. " +
      "새로고침하면 서버의 기록을 다시 불러옵니다."
    );
    try {
      if (App.GuestAccess || true) {
        var bar = document.createElement("div");
        bar.className = "multi-tab-banner";
        bar.innerHTML =
          '<span class="mtb-text">이 창의 거래 기록이 서버보다 적습니다. ' +
          "서버 기록을 지우지 않도록 저장을 멈췄습니다. 새로고침해 주세요.</span>" +
          '<button type="button" class="mtb-btn" id="sg-reload">새로고침</button>';
        document.body.appendChild(bar);
        var btn = document.getElementById("sg-reload");
        if (btn) btn.addEventListener("click", function () { window.location.reload(); });
      }
    } catch (e) {
      /* 안내 실패해도 보호는 이미 됐습니다 */
    }
  }

  function wrap() {
    if (!App.Bus || typeof App.Bus.emit !== "function") return false;
    if (App.Bus.__syncGuarded) return true;
    var orig = App.Bus.emit;
    App.Bus.emit = function (name, payload) {
      if (name === "trading:persisted" && looksLikeDataLoss(payload)) {
        blocked++;
        tellUser();
        /* 여기서 payload 를 건드리면 안 됩니다.
           처음에는 closedTrades 를 빈 목록으로 바꿔 넘겼는데,
           js/trade-events-chat.js 가 그걸 보고 '기록이 0건이 됐다' 며
           기준을 0 으로 되돌렸습니다. 그다음 200건이 들어오자 전부
           새 거래로 착각해 같은 알림을 200번 보냈습니다(채팅 도배).

           게다가 그 보호는 애초에 필요 없었습니다.
           js/supabase-sync.js 의 syncNewTrades 는 '늘어난 만큼만 추가'
           할 뿐 서버 기록을 지우지 않습니다. 로컬이 비어도 서버의
           거래 기록은 그대로 남습니다.

           그래서 지금은 알리기만 하고 값은 그대로 흘려보냅니다. */
      }

      /* 정상 저장이면 기준값을 최신으로 올려둡니다.
         ⚠ 이렇게 만들어진 기준값은 **서버에서 읽은 값이 아니라 이 창의 값**입니다.
            서버 기준값을 못 읽었을 때도 "이 창 안에서 기록이 줄어드는 것" 은
            잡을 수 있어서 예전 그대로 둡니다. 다만 서버에서 읽은 것과
            헷갈리지 않게 source 로 구분해 둡니다(getStatus 로 볼 수 있습니다). */
      if (name === "trading:persisted" && payload && Array.isArray(payload.closedTrades)) {
        if (!serverBaseline) serverBaseline = { realizedPnl: 0, tradeCount: 0, source: "local" };
        serverBaseline.realizedPnl = Number(payload.realizedPnl) || 0;
        serverBaseline.tradeCount = Math.max(serverBaseline.tradeCount, payload.closedTrades.length);
      }
      return orig.apply(App.Bus, arguments);
    };
    App.Bus.__syncGuarded = true;
    return true;
  }

  function init() {
    wrap();
    if (!App.Bus || !App.Bus.__syncGuarded) {
      var tries = 0;
      var t = setInterval(function () {
        if (wrap() || ++tries > 100) clearInterval(t);
      }, 100);
    }
    /* 로그인 복구가 끝난 뒤 서버 기준값을 읽습니다. */
    setTimeout(loadBaseline, 2500);
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", function () {
        retryAt = 0;              /* 로그인 상태가 바뀌면 재시도 횟수를 새로 셉니다 */
        setTimeout(loadBaseline, 800);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    loadBaseline: loadBaseline,
    looksLikeDataLoss: looksLikeDataLoss,
    getBlockedCount: function () { return blocked; },
    /* 지금 보호막이 켜져 있는지 밖에서 볼 수 있게 합니다.
       known:false 면 이 창에서는 유실 판정을 하지 않고 있다는 뜻입니다. */
    getStatus: function () {
      return {
        state: baselineState,                  // "모름" | "읽음" | "실패"
        known: !!serverBaseline,
        why: baselineWhy,
        error: lastError ? String(lastError.message || lastError) : null,
        source: serverBaseline ? serverBaseline.source || null : null,
        skippedUnknown: skippedUnknown,
      };
    },
    isBaselineKnown: function () { return !!serverBaseline; },
    _setBaseline: function (b) { serverBaseline = b; },
    _getBaseline: function () { return serverBaseline; },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SyncGuard;
