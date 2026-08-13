/* =========================================================================
 * js/leaderboard.js — App.Leaderboard
 * =========================================================================
 * "🏆 투자 랭킹" 패널. trading.js/supabase-sync.js가 이미 관리하는
 * trading_accounts.balance를 기준으로 순위를 보여줍니다 — 이 파일에서
 * 자산/손익을 새로 계산하지 않습니다(전부 서버의 뷰/함수가 계산해서
 * 내려줌).
 *
 * ── 보안 ─────────────────────────────────────────────────────────
 * 여기서 부르는 두 RPC(get_leaderboard, get_my_rank)는 둘 다
 * SECURITY DEFINER로 만들어져서 다른 사용자의 trading_accounts 행을
 * 직접 select하지 않고도 "닉네임 + 수익률 + 총자산"만 안전하게 돌려줍니다.
 * user_id/이메일/인증 정보는 애초에 이 함수들의 반환 컬럼에 없어서
 * 화면에 나타날 수가 없습니다. "내 행" 강조는 user_id가 아니라
 * App.Auth.getNickname()(이미 로그인 시 확보된 값)과 닉네임을 비교해서
 * 판단합니다.
 *
 * ── "총자산" 정의 ────────────────────────────────────────────────
 * trading_accounts.balance(가용잔고) 기준입니다. 포지션 보유 중에는 그
 * 증거금만큼 실제보다 낮게 보일 수 있습니다(청산되면 정산되어 다시
 * 정확해짐) — 이건 스키마에 실시간 미실현손익을 반영한 진짜 총자산을
 * 저장하는 컬럼이 없고, 가격 틱마다 DB에 쓰지 않기 위한 의도적인 선택입니다.
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

  function renderMessage(msg) {
    if (dom.body) dom.body.innerHTML = '<tr class="empty"><td colspan="4">' + msg + "</td></tr>";
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
          "<td>" + rank + "위</td>" +
          "<td>" + escapeHtml(r.nickname) + (isMe ? ' <span class="leaderboard-me-badge">나</span>' : "") + "</td>" +
          "<td>" + App.Utils.formatCurrency(r.balance) + "</td>" +
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
        dom.myRank.textContent = "내 순위: " + mine.rank + "위 (" + App.Utils.formatCurrency(mine.balance) + ")";
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
