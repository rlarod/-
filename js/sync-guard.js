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
 * ========================================================================= */

window.App = window.App || {};

App.SyncGuard = (function () {
  "use strict";

  var serverBaseline = null;   // { realizedPnl, tradeCount } — 서버에 있던 값
  var blocked = 0;
  var warned = false;

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  /* 서버에 지금 무엇이 있는지 한 번 읽어둡니다. */
  function loadBaseline() {
    var client = sb();
    if (!client) return Promise.resolve(null);
    return Promise.resolve(client.auth.getUser())
      .then(function (r) {
        var uid = r && r.data && r.data.user ? r.data.user.id : null;
        if (!uid) return null;
        return Promise.all([
          client.from("trading_accounts").select("realized_pnl").eq("user_id", uid).maybeSingle(),
          client.from("trades").select("id", { count: "exact", head: true }).eq("user_id", uid),
        ]).then(function (rows) {
          serverBaseline = {
            realizedPnl: rows[0] && rows[0].data ? Number(rows[0].data.realized_pnl) || 0 : 0,
            tradeCount: rows[1] && typeof rows[1].count === "number" ? rows[1].count : 0,
          };
          return serverBaseline;
        });
      })
      .catch(function (e) {
        console.warn("[sync-guard.js] 서버 기준값을 읽지 못했습니다(보호는 계속 시도):", e);
        return null;
      });
  }

  /* 이 저장이 기록을 크게 깎는가 */
  function looksLikeDataLoss(snap) {
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
        return undefined;   // 서버로 안 내보냅니다(로컬 저장은 이미 끝난 상태)
      }
      /* 정상 저장이면 기준값을 최신으로 올려둡니다. */
      if (name === "trading:persisted" && payload && Array.isArray(payload.closedTrades)) {
        if (!serverBaseline) serverBaseline = { realizedPnl: 0, tradeCount: 0 };
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
      App.Bus.on("auth:changed", function () { setTimeout(loadBaseline, 800); });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    loadBaseline: loadBaseline,
    looksLikeDataLoss: looksLikeDataLoss,
    getBlockedCount: function () { return blocked; },
    _setBaseline: function (b) { serverBaseline = b; },
    _getBaseline: function () { return serverBaseline; },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SyncGuard;
