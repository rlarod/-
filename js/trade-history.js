/* =========================================================================
 * js/trade-history.js — App.TradeHistory
 * =========================================================================
 * Supabase public.trades 테이블에 저장된 "서버 거래내역"을 조회해서
 * 화면에 보여줍니다. trading.js의 계산 결과를 다시 계산하지 않고,
 * DB에서 받은 값을 그대로 표시만 합니다.
 *
 * ── 기존 기능과의 관계 ───────────────────────────────────────────
 * ui.js의 기존 "거래내역" 탭(로컬 closedTrades/localStorage 기반)은
 * 전혀 건드리지 않습니다. 이 모듈은 완전히 독립된 새 패널
 * (#cloud-history-panel)을 별도로 렌더링합니다 — 로컬 거래내역 기능을
 * 대체하는 게 아니라 "서버에도 저장돼 있다"는 걸 보여주는 용도입니다.
 *
 * ── 데이터 조회 ──────────────────────────────────────────────────
 * 현재 로그인 세션의 auth.uid() 기준으로만 조회합니다(RLS의
 * trades_select_own 정책이 이미 이걸 강제하지만, 코드에서도 명시적으로
 * .eq('user_id', ...)를 걸어서 이중으로 안전하게 합니다). 세션이 없으면
 * 조회 자체를 하지 않습니다.
 *
 * ── 갱신 시점 ────────────────────────────────────────────────────
 * 최초 로딩 시 1회 조회하고, 이후 'trading:persisted'(실제 거래 이벤트
 * 발생 시에만 발생 — js/supabase-sync.js와 동일한 신호) 이벤트가 오면
 * 다시 조회합니다. 가격 틱마다 조회하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.TradeHistory = (function () {
  "use strict";

  const MAX_ROWS = 100;

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function getUserId(client) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return data.session.user.id;
    } catch (e) {
      return null;
    }
  }

  function fmtDateTime(iso) {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, "0");
    return pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
  }
  function fmtSignedPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (n >= 0 ? "+" : "") + Number(n).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function renderRows(rows) {
    if (!dom.body) return;
    if (!rows || rows.length === 0) {
      dom.body.innerHTML = '<tr class="empty"><td colspan="11">아직 거래내역이 없습니다.</td></tr>';
      return;
    }
    dom.body.innerHTML = rows
      .map((t) => {
        const pnlClass = Number(t.pnl) >= 0 ? "pnl-positive" : "pnl-negative";
        const reasonClass = t.close_reason === "강제청산" ? "reason-forced" : "";
        return (
          "<tr>" +
          '<td style="font-family:var(--sans)">' + fmtDateTime(t.created_at) + "</td>" +
          '<td><span class="badge ' + t.side + '">' + (t.side === "long" ? "LONG" : "SHORT") + "</span></td>" +
          "<td>" + App.Utils.formatCurrencyPlain(t.entry_price) + "</td>" +
          "<td>" + App.Utils.formatCurrencyPlain(t.exit_price) + "</td>" +
          "<td>" + App.Utils.formatQty(t.quantity) + "</td>" +
          "<td>" + t.leverage + "x</td>" +
          "<td>" + App.Utils.formatCurrency(t.margin) + "</td>" +
          '<td class="' + pnlClass + '">' + App.Utils.formatCurrencySigned(t.pnl) + "</td>" +
          '<td class="' + pnlClass + '">' + fmtSignedPercent(t.roe) + "</td>" +
          "<td>" + App.Utils.formatCurrency(t.fee) + "</td>" +
          '<td><span class="badge-reason ' + reasonClass + '">' + (t.close_reason || "-") + "</span></td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function renderMessage(msg) {
    if (!dom.body) return;
    dom.body.innerHTML = '<tr class="empty"><td colspan="11">' + msg + "</td></tr>";
  }

  async function loadAndRender() {
    if (!dom.body) return;
    const client = sb();
    if (!client) {
      renderMessage("서버 연결을 사용할 수 없습니다.");
      return;
    }
    const userId = await getUserId(client);
    if (!userId) {
      // 요구사항: 로그인 세션이 없으면 조회 자체를 하지 않음
      renderMessage("로그인 후 확인할 수 있습니다.");
      return;
    }

    try {
      const { data, error } = await client
        .from("trades")
        .select("*")
        .eq("user_id", userId) // RLS가 이미 강제하지만 명시적으로도 걸어둠
        .order("created_at", { ascending: false })
        .limit(MAX_ROWS);
      if (error) throw error;
      renderRows(data);
    } catch (e) {
      console.warn("[trade-history.js] 거래내역 조회 실패:", e);
      renderMessage("거래내역을 불러오지 못했습니다.");
    }
  }

  function init() {
    dom = { body: el("cloud-history-body") };
    if (!dom.body) return; // 패널 DOM이 없으면(예: index.html 미반영) 조용히 종료

    App.Bus.on("trading:persisted", loadAndRender); // 실제 거래 이벤트가 있을 때만 재조회(틱마다 X)
    loadAndRender();
  }

  return { init };
})();
