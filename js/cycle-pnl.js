/* =========================================================================
 * js/cycle-pnl.js — App.CyclePnl
 * =========================================================================
 * 랭킹·마이페이지가 같은 숫자를 보게 만듭니다.
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────────────
 * 마이페이지는 브라우저에 저장된 거래 기록을 더해서 실현손익을 보여주고,
 * 랭킹은 서버에 저장된 값을 씁니다. 둘은 동기화로 같아져야 하지만,
 * 브라우저 저장소가 지워지거나 다른 기기에서 접속하면 어긋납니다.
 * 실제로 랭킹은 큰 마이너스인데 화면은 0 원으로 보이는 일이 있었습니다.
 *
 * 그래서 마이페이지 쪽 숫자를 서버 값으로 덮어씁니다.
 * 기준이 하나면 어긋날 수가 없습니다.
 *
 * ── 매매 사이클 ────────────────────────────────────────────────────────
 * 수익률은 영구 누적이 아니라 "지금 사이클" 기준입니다.
 *   수익률 = 이번 사이클 누적 실현손익 ÷ 기준자본 × 100
 * 관리자가 계좌를 초기화하면 사이클이 끝나고 0.00% 부터 다시 시작합니다.
 * 지난 사이클의 거래 기록은 지우지 않고 사이클 번호로 구분해 보관합니다.
 * (서버 쪽은 supabase/schema-trading-cycle.sql)
 *
 * js/mypage.js·js/leaderboard.js·js/supabase-sync.js 는 건드리지 않습니다.
 * 그들이 그린 뒤의 DOM 만 손댑니다.
 * ========================================================================= */

window.App = window.App || {};

App.CyclePnl = (function () {
  "use strict";

  var 상태 = null; // { cycle_no, initial_balance, realized_pnl, roe }

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 서버에서 읽기 ---------------- */

  async function 불러오기() {
    var client = sb();
    if (!client) return null;
    try {
      var s = await client.auth.getSession();
      var session = s && s.data ? s.data.session : null;
      if (!session || !session.user) return null;

      var res = await client
        .from("trading_accounts")
        .select("initial_balance, realized_pnl, cycle_no")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (res && res.error) throw res.error;
      if (!res || !res.data) return null;

      var base = Number(res.data.initial_balance);
      var pnl = Number(res.data.realized_pnl);

      /* 랭킹 수익금은 서버가 따로 계산합니다(0 이 바닥).
         읽지 못하면 아래에서 실제 손익으로 대신 계산합니다. */
      var 랭킹수익 = null;
      try {
        var rp = await client
          .from("ranking_profit")
          .select("ranking_profit")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (rp && !rp.error && rp.data) 랭킹수익 = Number(rp.data.ranking_profit);
      } catch (e) {
        /* 아직 SQL 을 안 돌린 서버 — 아래 대체 계산을 씁니다 */
      }
      상태 = {
        cycle_no: res.data.cycle_no || 1,
        initial_balance: base,
        realized_pnl: pnl,
        /* 랭킹 수익금 — 0 이 바닥입니다.
           거래를 시간 순으로 훑으며 누적을 쌓되 0 아래로 안 내려갑니다.
             누적 = max(0, 누적 + 이번거래손익)
           잃으면 0 으로 내려앉고, 그다음 버는 것은 바로 올라갑니다.
           마이너스를 그대로 들고 가면 -18,158,792 을 다 메우기 전까지
           아무리 벌어도 0% 라 사실상 복구가 불가능합니다(실제 상황).
           서버(ranking_profit 뷰)가 정본이고, 못 읽으면 실제 손익을
           0 에서 끊어 대신 씁니다. */
        ranking_profit: 랭킹수익 !== null ? 랭킹수익 : Math.max(0, pnl),
        roe:
          base > 0
            ? ((랭킹수익 !== null ? 랭킹수익 : Math.max(0, pnl)) / base) * 100
            : 0,
      };
      return 상태;
    } catch (e) {
      /* 아직 SQL 을 안 돌렸거나 연결이 끊긴 경우 — 화면을 건드리지 않고
         브라우저 계산값을 그대로 둡니다. 틀린 값으로 덮는 것보다 낫습니다. */
      console.warn("[cycle-pnl.js] 서버 손익을 읽지 못했습니다:", e);
      return null;
    }
  }

  /* ---------------- 마이페이지에 반영 ---------------- */

  function 금액(usd) {
    return App.Utils && App.Utils.formatCurrencySigned
      ? App.Utils.formatCurrencySigned(usd)
      : String(Math.round(usd));
  }

  /* '실현 손익(누적)' 아래에 '누적 수익률' 한 줄을 만듭니다.
     마크업을 새로 만드는 게 아니라 같은 모양의 줄을 하나 추가합니다. */
  function 수익률줄() {
    var 있는것 = el("mypage-cycle-roe");
    if (있는것) return 있는것;
    var realized = el("mypage-realized");
    if (!realized) return null;
    var item = realized.closest(".mypage-item");
    if (!item || !item.parentNode) return null;

    var row = document.createElement("div");
    row.className = "mypage-item";
    row.innerHTML =
      '<span class="mypage-item-label">누적 수익률</span>' +
      '<span class="mypage-value" id="mypage-cycle-roe">-</span>';
    item.parentNode.insertBefore(row, item.nextSibling);
    return el("mypage-cycle-roe");
  }

  function 반영() {
    if (!상태) return;

    /* 실현 손익 — 서버 값으로 덮어씁니다.
       js/mypage.js 가 브라우저 값으로 다시 그리므로, 그 뒤에 한 번 더
       덮도록 아래에서 감시합니다. */
    var realized = el("mypage-realized");
    if (realized) {
      realized.textContent = 금액(상태.realized_pnl);
      realized.className =
        "mypage-value " + (상태.realized_pnl >= 0 ? "pnl-positive" : "pnl-negative");
      realized.dataset.serverValue = "1";
    }

    var roeEl = 수익률줄();
    if (roeEl) {
      var v = 상태.roe;
      roeEl.textContent = (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
      roeEl.className = "mypage-value " + (v >= 0 ? "pnl-positive" : "pnl-negative");
    }
  }

  /* js/mypage.js 가 값을 다시 그리면 우리 숫자가 지워집니다.
     그쪽은 수정 금지가 아니지만, 건드리지 않고 뒤에서 다시 덮는 편이
     서로 영향을 주지 않아 안전합니다. */
  function 감시() {
    var realized = el("mypage-realized");
    if (!realized || typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function () {
      if (!상태) return;
      if (realized.textContent === 금액(상태.realized_pnl)) return; // 이미 우리 값
      반영();
    });
    mo.observe(realized, { childList: true, characterData: true, subtree: true });
  }

  /* ---------------- 관리자 계좌 초기화 ---------------- */

  function 관리자버튼() {
    var panel = el("admin-panel");
    if (!panel || el("admin-cycle-reset-btn")) return false;

    var wrap = document.createElement("div");
    wrap.className = "admin-tool-row";
    wrap.innerHTML =
      '<button type="button" class="admin-tool-btn admin-tool-danger" ' +
      'id="admin-cycle-reset-btn">계좌 초기화</button>' +
      '<span class="admin-tool-desc">모든 회원의 자본과 수익률을 처음으로 되돌립니다 ' +
      "(거래 기록은 보관)</span>";

    var tools = el("admin-chat-tools");
    if (tools) tools.appendChild(wrap);
    else panel.appendChild(wrap);

    el("admin-cycle-reset-btn").addEventListener("click", 초기화확인);
    return true;
  }

  function 알림(text, kind) {
    var m = el("admin-chat-msg");
    if (!m) return;
    m.textContent = text || "";
    m.className = "admin-tool-msg" + (kind ? " admin-tool-msg-" + kind : "");
  }

  function 초기화확인() {
    if (
      !window.confirm(
        "모든 회원의 자본을 100,000 USDT 로 되돌리고\n" +
          "수익률을 0.00% 부터 다시 시작합니다.\n\n" +
          "거래 기록은 지우지 않고 지난 사이클로 보관합니다.\n" +
          "진행할까요?"
      )
    )
      return;
    초기화();
  }

  async function 초기화() {
    var client = sb();
    if (!client) return 알림("로그인 서버에 연결할 수 없습니다.", "err");
    var btn = el("admin-cycle-reset-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "초기화 중...";
    }
    알림("");
    try {
      var res = await client.rpc("reset_trading_cycle", { p_base_capital: 100000 });
      if (res && res.error) throw res.error;
      var n = typeof res.data === "number" ? res.data : 0;
      알림(n.toLocaleString("ko-KR") + "명의 계좌를 초기화했습니다. 새로고침하면 반영됩니다.", "ok");
      await 불러오기();
      반영();
    } catch (e) {
      console.warn("[cycle-pnl.js] 계좌 초기화 실패:", e);
      var m = String((e && (e.message || e.details)) || "");
      알림(
        /not_admin/.test(m)
          ? "관리자만 할 수 있습니다."
          : /does not exist|schema cache|PGRST202/i.test(m)
          ? "서버 준비가 안 됐습니다 — supabase/schema-trading-cycle.sql 을 먼저 실행해주세요."
          : "실패했습니다: " + (m || "알 수 없는 오류"),
        "err"
      );
    }
    if (btn) {
      btn.disabled = false;
      btn.textContent = "계좌 초기화";
    }
  }

  /* ---------------- 시작 ---------------- */

  async function 새로고침() {
    await 불러오기();
    반영();
  }

  function init() {
    새로고침();
    감시();

    if (!관리자버튼() && typeof MutationObserver !== "undefined") {
      var mo = new MutationObserver(function () {
        if (관리자버튼()) mo.disconnect();
      });
      if (document.body) mo.observe(document.body, { childList: true, subtree: true });
    }

    /* 거래가 저장될 때마다 서버 값이 바뀌므로 다시 읽습니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      var 대기 = null;
      App.Bus.on("trading:persisted", function () {
        clearTimeout(대기);
        /* 동기화가 서버에 반영될 시간을 조금 줍니다. */
        대기 = setTimeout(새로고침, 1500);
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    불러오기: 불러오기,
    반영: 반영,
    새로고침: 새로고침,
    get상태: function () {
      return 상태;
    },
  };
})();
