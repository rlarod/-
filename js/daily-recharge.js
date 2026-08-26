/* =========================================================================
 * js/daily-recharge.js — App.DailyRecharge
 * =========================================================================
 * 지갑 초기화(100,000 USDT) — 한국시간 자정 기준 하루 2회.
 * 자정이 지나면 횟수가 새로 채워집니다.
 * 포지션을 들고 있으면 누를 수 없고, 정리한 뒤에만 가능합니다.
 *
 * ★ 2026-08-26 대표 지시 — 더하기에서 덮어쓰기로 바뀌었습니다.
 *   (전) 잔고 30,000 에서 두 번 누르면 230,000
 *   (후) 잔고가 얼마든 누르면 100,000
 *
 *   ⚠ 이제 잔고가 줄어들 수 있습니다.
 *     잔고 500,000 인 사람이 누르면 400,000 이 사라집니다.
 *     그래서 서버에 보내기 전에 반드시 확인 창을 띄우고,
 *     늘어날 때와 줄어들 때의 문구를 다르게 합니다.
 *     미리 보여 주는 숫자도 서버(recharge_status)가 준 값입니다.
 *
 * 금액·횟수·포지션 확인은 전부 서버(claim_daily_recharge RPC)에서 합니다.
 * 이 파일에는 금액이 숫자로 적혀 있지 않습니다 — 항상 서버 값을 씁니다.
 * 브라우저에만 기록하면 localStorage를 지우고 무한 충전할 수 있어서입니다.
 * 클라이언트는 금액을 정하지 않고, 서버가 돌려준 잔고를 반영만 합니다.
 *
 * js/trading.js(수정 금지 파일)에는 잔고를 더하는 API가 없습니다. 그래서
 * 서버에서 잔고를 올린 뒤, trading.js가 부팅 때 읽는 localStorage 값을
 * 같은 형식으로 갱신하고 새로고침합니다(auth.js가 로그인 시 하는 것과 같은 방식).
 * ========================================================================= */

window.App = window.App || {};

App.DailyRecharge = (function () {
  "use strict";

  const STORAGE_KEY = "trading";
  let dom = {};
  let busy = false;

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  /* 숫자를 1,234 처럼 보여 줍니다. 값이 이상하면 빈 글자를 돌려
     엉터리 숫자가 확인 창에 뜨지 않게 합니다. */
  function won(n) {
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString() : "";
  }

  function setMsg(text, disabled) {
    if (!dom.btn) return;
    dom.btn.disabled = !!disabled;
    if (dom.note) dom.note.textContent = text || "";
  }

  /* ---------------- 버튼 상태 갱신 ---------------- */
  async function refresh() {
    if (!dom.btn) return;
    const client = sb();
    if (!client) {
      // 서버에 물어볼 수 없으면 버튼을 열지 않습니다(무제한 충전 방지).
      setMsg("로그인 후 이용할 수 있습니다", true);
      return;
    }
    try {
      const { data, error } = await client.rpc("recharge_status");
      if (error) throw error;
      if (!data) return;

      if (data.can_claim) {
        // 서버가 알려준 남은 횟수를 그대로 씁니다(임의로 지어내지 않습니다).
        const left = Number(data.remaining);
        const max = Number(data.max_per_day);
        setMsg(
          Number.isFinite(left) && Number.isFinite(max)
            ? "오늘 " + left + "/" + max + "회 남음 · 자정 기준"
            : "자정 기준",
          false
        );
        return;
      }
      if (data.reason === "has_position") {
        setMsg("포지션을 정리한 뒤 초기화할 수 있습니다", true);
      } else if (data.reason === "already_claimed") {
        setMsg("오늘 초기화를 다 썼습니다 · 자정에 다시 채워집니다", true);
      } else {
        setMsg("로그인 후 이용할 수 있습니다", true);
      }
    } catch (e) {
      // 서버에 물어보지 못하면 버튼을 열어두지 않습니다(오작동 방지).
      // 원인별로 다르게 안내합니다 — 대부분은 SQL 미적용입니다.
      const code = String((e && e.code) || "");
      const msg = String((e && e.message) || e);
      const missing =
        code === "PGRST202" || code === "42883" ||
        /could not find the function|does not exist|schema cache/i.test(msg);

      if (missing) {
        console.warn(
          "[daily-recharge.js] 서버 함수가 없습니다. " +
          "supabase/schema-daily-recharge.sql 을 Supabase SQL Editor에서 실행해주세요.", e
        );
        setMsg("서버 설정이 아직 적용되지 않았습니다", true);
      } else {
        console.warn("[daily-recharge.js] 초기화 가능 여부 확인 실패:", code, msg, e);
        setMsg("초기화 상태를 확인하지 못했습니다 (" + (code || "오류") + ")", true);
      }
    }
  }

  /* ---------------- 충전 실행 ---------------- */
  async function claim() {
    if (busy) return;

    // 서버가 최종 판단하지만, 서버에 물어보기 전에 화면에서도 먼저 막아줍니다.
    // (연결이 없을 때도 안내가 뜨도록 서버 확인보다 앞에 둡니다.)
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    if (snap && snap.position) {
      alert("포지션을 보유 중에는 지갑을 초기화할 수 없습니다.\n포지션을 정리한 뒤 다시 시도해주세요.");
      return;
    }

    const client = sb();
    if (!client) {
      alert("로그인 후 이용할 수 있습니다.");
      return;
    }

    /* ★ 누르기 전에 "얼마가 어떻게 되는지" 를 숫자로 보여 줍니다.
       지금 잔고와 초기화 금액은 서버가 알려 줍니다(브라우저가 정하지 않습니다).
       이걸 건너뛰면 번 돈을 실수로 날릴 수 있습니다. */
    let before = null;
    let target = null;
    try {
      const st = await client.rpc("recharge_status");
      if (st.error) throw st.error;
      if (st.data) {
        before = Number(st.data.balance);
        target = Number(st.data.target);
      }
    } catch (e) {
      console.warn("[daily-recharge.js] 확인 전 잔고 조회 실패:", e);
    }

    if (!Number.isFinite(before) || !Number.isFinite(target)) {
      /* 서버가 숫자를 안 줄 땐 그냥 진행하지 않습니다.
         얼마가 사라지는지 모르는 채로 누르게 하면 안 됩니다. */
      alert(
        "지금 잔고를 확인하지 못했습니다.\n" +
        "지갑 초기화는 잔고를 덮어쓰기 때문에 돈이 줄어들 수 있습니다.\n" +
        "잠시 뒤에 다시 시도해주세요."
      );
      refresh();
      return;
    }

    const diff = target - before;
    let ask;
    if (diff > 0) {
      ask =
        "지갑을 " + won(target) + " USDT 로 초기화합니다.\n\n" +
        "지금 잔고 " + won(before) + " USDT → " + won(target) + " USDT\n" +
        won(diff) + " USDT 가 늘어납니다.\n\n" +
        "계속할까요?";
    } else if (diff < 0) {
      ask =
        "지갑을 " + won(target) + " USDT 로 초기화합니다.\n\n" +
        "지금 잔고 " + won(before) + " USDT → " + won(target) + " USDT\n" +
        won(-diff) + " USDT 가 사라집니다. 되돌릴 수 없습니다.\n\n" +
        "정말 계속할까요?";
    } else {
      ask =
        "지금 잔고가 이미 " + won(target) + " USDT 입니다.\n\n" +
        "초기화해도 잔고는 그대로이고 오늘 남은 횟수만 줄어듭니다.\n\n" +
        "계속할까요?";
    }
    if (!window.confirm(ask)) return;

    busy = true;
    setMsg("초기화 중…", true);
    try {
      const { data, error } = await client.rpc("claim_daily_recharge");
      if (error) throw error;

      // 서버가 확정한 잔고를 trading.js가 읽는 형식 그대로 반영합니다.
      const saved = App.Storage.load(STORAGE_KEY) || {};
      saved.balance = Number(data.balance);
      App.Storage.save(STORAGE_KEY, saved);

      const left = Number(data.remaining);
      const max = Number(data.max_per_day);
      /* 끝난 뒤에도 서버가 확정한 숫자로 보여 줍니다. */
      const moved = Number(data.delta);
      alert(
        "지갑 초기화 완료\n" +
        (Number.isFinite(moved) && moved !== 0
          ? (moved > 0 ? won(moved) + " USDT 가 늘었습니다.\n"
                       : won(-moved) + " USDT 가 줄었습니다.\n")
          : "") +
        "잔고: " + won(data.balance) + " USDT" +
        (Number.isFinite(left) && Number.isFinite(max)
          ? "\n오늘 남은 초기화: " + left + "/" + max + "회"
          : "")
      );
      window.location.reload();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/has_position/.test(msg)) {
        alert("포지션을 보유 중에는 지갑을 초기화할 수 없습니다.");
      } else if (/already_claimed/.test(msg)) {
        alert("오늘 초기화를 다 썼습니다. 자정에 다시 채워집니다.");
      } else if (/not_logged_in/.test(msg)) {
        alert("로그인 후 이용할 수 있습니다.");
      } else {
        alert("초기화에 실패했습니다: " + msg);
        console.warn("[daily-recharge.js] 초기화 실패:", e);
      }
      busy = false;
      refresh();
      return;
    }
    busy = false;
  }

  function init() {
    dom = {
      btn: document.getElementById("daily-recharge-btn"),
      note: document.getElementById("daily-recharge-note"),
    };
    if (!dom.btn) return; // 마크업 없으면 조용히 종료

    dom.btn.addEventListener("click", claim);

    // 포지션을 열거나 정리할 때마다 버튼 상태를 다시 확인합니다.
    if (App.Bus) App.Bus.on("trading:persisted", refresh);
    refresh();
  }

  return { init, refreshForTest: refresh };
})();
