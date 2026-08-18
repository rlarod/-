/* =========================================================================
 * js/daily-recharge.js — App.DailyRecharge
 * =========================================================================
 * 하루 1회 무료 충전(100,000 USDT). 한국시간 오전 6시에 횟수가 채워집니다.
 * 포지션을 들고 있으면 충전할 수 없고, 정리한 뒤에만 가능합니다.
 *
 * 금액·횟수·포지션 확인은 전부 서버(claim_daily_recharge RPC)에서 합니다.
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
        setMsg("하루 1회 · 오전 6시 기준", false);
        return;
      }
      if (data.reason === "has_position") {
        setMsg("포지션을 정리한 뒤 충전할 수 있습니다", true);
      } else if (data.reason === "already_claimed") {
        setMsg("오늘은 이미 충전했습니다 · 오전 6시에 다시 채워집니다", true);
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
        console.warn("[daily-recharge.js] 충전 가능 여부 확인 실패:", code, msg, e);
        setMsg("충전 상태를 확인하지 못했습니다 (" + (code || "오류") + ")", true);
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
      alert("포지션을 보유 중에는 충전할 수 없습니다.\n포지션을 정리한 뒤 다시 시도해주세요.");
      return;
    }

    const client = sb();
    if (!client) {
      alert("로그인 후 이용할 수 있습니다.");
      return;
    }

    busy = true;
    setMsg("충전 중…", true);
    try {
      const { data, error } = await client.rpc("claim_daily_recharge");
      if (error) throw error;

      // 서버가 확정한 잔고를 trading.js가 읽는 형식 그대로 반영합니다.
      const saved = App.Storage.load(STORAGE_KEY) || {};
      saved.balance = Number(data.balance);
      App.Storage.save(STORAGE_KEY, saved);

      alert(
        "무료 충전 " + Number(data.amount).toLocaleString() + " USDT 완료\n" +
        "잔고: " + Number(data.balance).toLocaleString() + " USDT"
      );
      window.location.reload();
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (/has_position/.test(msg)) {
        alert("포지션을 보유 중에는 충전할 수 없습니다.");
      } else if (/already_claimed/.test(msg)) {
        alert("오늘은 이미 충전했습니다. 오전 6시에 다시 채워집니다.");
      } else if (/not_logged_in/.test(msg)) {
        alert("로그인 후 이용할 수 있습니다.");
      } else {
        alert("충전에 실패했습니다. 잠시 후 다시 시도해주세요.");
        console.warn("[daily-recharge.js] 충전 실패:", e);
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
