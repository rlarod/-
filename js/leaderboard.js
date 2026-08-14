/* =========================================================================
 * js/leaderboard.js — App.Leaderboard
 * =========================================================================
 * "🏆 투자 랭킹" 패널. 순위/총자산/수익금/수익률은 전부 서버(뷰/함수)가
 * 계산해서 내려줍니다 — 이 파일에서 자산/손익을 새로 계산하지 않습니다.
 *
 * ── 보안 ─────────────────────────────────────────────────────────
 * 여기서 부르는 두 RPC(get_leaderboard, get_my_rank)는 둘 다
 * SECURITY DEFINER로 만들어져서 다른 사용자의 trading_accounts 행을
 * 직접 select하지 않고도 필요한 값만 안전하게 돌려줍니다.
 * user_id/이메일/인증 정보는 애초에 이 함수들의 반환 컬럼에 없어서
 * 화면에 나타날 수가 없습니다. "내 행" 강조는 user_id가 아니라
 * App.Auth.getNickname()(이미 로그인 시 확보된 값)과 닉네임을 비교해서
 * 판단합니다.
 *
 * ── "총자산" 정의(버그 수정) ──────────────────────────────────────
 * 예전엔 trading_accounts.balance(가용잔고)를 총자산으로 썼는데, 이
 * 값은 포지션 진입 시 증거금+수수료만큼 즉시 줄어들어서 "포지션을
 * 잡기만 해도 랭킹이 나빠지는" 문제가 실제로 있었습니다(실제로 재현해서
 * 확인함). 지금은 서버 뷰가 "initial_balance + realized_pnl"(청산된
 * 거래에서만 나온 손익)로 계산해서 내려줍니다 — 오픈 포지션은 청산되기
 * 전까지 랭킹에 전혀 영향을 안 줍니다. 이 파일은 서버가 이미 계산해서
 * 준 total_asset/profit_amount/roe_percent를 그대로 표시만 합니다.
 *
 * ── 갱신 시점 ────────────────────────────────────────────────────
 * 'trading:persisted'(실제 거래 이벤트 발생 시에만) 이벤트에서 재조회.
 * 'currency:change'는 재조회 없이 캐시된 데이터로 표시만 다시 계산합니다.
 * ========================================================================= */

window.App = window.App || {};

App.Leaderboard = (function () {
  "use strict";

  const TOP_N = 20;

  let dom = {};
  let lastRows = null; // currency:change 재렌더링용 캐시

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function hasSession(client) {
    try {
      const { data, error } = await client.auth.getSession();
      return !error && !!data.session;
    } catch (e) {
      return false;
    }
  }

  function fmtSignedPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (n >= 0 ? "+" : "") + Number(n).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function rankLabel(rank) {
    if (rank === 1) return '<span class="leaderboard-rank-badge rank-1">🥇 1위</span>';
    if (rank === 2) return '<span class="leaderboard-rank-badge rank-2">🥈 2위</span>';
    if (rank === 3) return '<span class="leaderboard-rank-badge rank-3">🥉 3위</span>';
    return rank + "위";
  }

  function renderMessage(msg) {
    if (dom.body) dom.body.innerHTML = '<tr class="empty"><td colspan="5">' + msg + "</td></tr>";
    if (dom.myRank) dom.myRank.textContent = "";
  }

  function render(rows) {
    lastRows = rows;
    if (!dom.body) return;
    if (!rows || rows.length === 0) {
      renderMessage("아직 랭킹 데이터가 없습니다.");
      return;
    }
    const myNickname = App.Auth ? App.Auth.getNickname() : null;

    dom.body.innerHTML = rows
      .map((r, idx) => {
        const rank = idx + 1;
        const isMe = myNickname && r.nickname === myNickname;
        const pnlClass = Number(r.roe_percent) >= 0 ? "pnl-positive" : "pnl-negative";
        return (
          '<tr class="' + (isMe ? "leaderboard-row-me" : "") + '">' +
          "<td>" + rankLabel(rank) + "</td>" +
          "<td>" + escapeHtml(r.nickname) + (isMe ? ' <span class="leaderboard-me-badge">나</span>' : "") + "</td>" +
          "<td>" + App.Utils.formatCurrency(r.total_asset) + "</td>" +
          '<td class="' + pnlClass + '">' + App.Utils.formatCurrencySigned(r.profit_amount) + "</td>" +
          '<td class="' + pnlClass + '">' + fmtSignedPercent(r.roe_percent) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  async function renderMyRankIfOutside(client, rows) {
    if (!dom.myRank) return;
    const myNickname = App.Auth ? App.Auth.getNickname() : null;
    if (!myNickname) {
      dom.myRank.textContent = "";
      return;
    }
    const inTop = rows.some((r) => r.nickname === myNickname);
    if (inTop) {
      dom.myRank.textContent = "";
      return;
    }
    try {
      const { data, error } = await client.rpc("get_my_rank");
      if (error) throw error;
      const mine = Array.isArray(data) ? data[0] : data;
      if (mine && mine.rank) {
        dom.myRank.textContent = "내 순위: " + mine.rank + "위 (" + App.Utils.formatCurrency(mine.total_asset) + ")";
      } else {
        dom.myRank.textContent = "";
      }
    } catch (e) {
      console.warn("[leaderboard.js] 내 순위 조회 실패:", e);
      dom.myRank.textContent = "";
    }
  }

  async function loadAndRender() {
    if (!dom.body) return;
    const client = sb();
    if (!client) {
      renderMessage("서버 연결을 사용할 수 없습니다.");
      return;
    }
    if (!(await hasSession(client))) {
      renderMessage("로그인 후 확인할 수 있습니다.");
      return;
    }
    try {
      const { data, error } = await client.rpc("get_leaderboard", { limit_count: TOP_N });
      if (error) throw error;
      render(data || []);
      renderMyRankIfOutside(client, data || []);
    } catch (e) {
      console.warn("[leaderboard.js] 랭킹 조회 실패:", e);
      renderMessage("랭킹을 불러오지 못했습니다.");
    }
  }

  function onCurrencyChange() {
    if (lastRows) render(lastRows); // 재조회 없이 표시만 다시 계산
  }

  function init() {
    dom = { body: el("leaderboard-body"), myRank: el("leaderboard-my-rank") };
    if (!dom.body) return;

    App.Bus.on("trading:persisted", loadAndRender);
    App.Bus.on("currency:change", onCurrencyChange);
    loadAndRender();
  }

  return { init };
})();
