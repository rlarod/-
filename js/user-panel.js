/* =========================================================================
 * js/user-panel.js — App.UserPanel
 * =========================================================================
 * 상단 3분할 중 오른쪽 칼럼 — 로그인 사용자 정보 패널.
 *
 * 기존 시스템을 그대로 재사용합니다(새로 만드는 것 없음):
 *   닉네임      App.Auth.getNickname()
 *   총자산/손익  App.Trading.getSnapshot() + 'trading:update' 구독
 *   계급        App.Rank.getUserRank()
 *   로그아웃    기존 #auth-logout-btn 을 클릭시킴(auth.js의 로그아웃 그대로)
 *   마이페이지  기존 #page-nav-mypage 를 클릭시킴(page-nav.js 그대로)
 * auth.js / trading.js / leaderboard.js 등 수정 금지 파일은 읽기만 합니다.
 *
 * 표시 값 기준
 *   총자산 = equity (미실현 포함 평가자산, 주문창의 "평가"와 같은 값)
 *   수익금 = realizedPnl (청산으로 확정된 손익만 — 프로젝트 핵심 원칙)
 *   수익률 = realizedPnl / 100,000 × 100 (랭킹 뷰와 같은 산식)
 * "리워드/보유 코인"은 이 프로젝트에 실제 기능·데이터가 없어서 임의의 숫자를
 * 만들지 않고 "준비중"으로 표시합니다.
 * ========================================================================= */

window.App = window.App || {};

App.UserPanel = (function () {
  "use strict";

  const INITIAL_BALANCE = 100000; // trading.js와 동일 기준(수익률 분모)
  const AUTH_POLL_MS = 1000; // auth.js가 로그인/로그아웃 이벤트를 쏘지 않아서 상태만 확인

  let dom = {};
  let lastNickname = null;
  let pollTimer = null;

  function el(id) {
    return document.getElementById(id);
  }
  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function isLoggedIn() {
    return !!(App.Auth && App.Auth.getNickname && App.Auth.getNickname());
  }

  /* ---------------- 렌더 ---------------- */
  function renderLoggedOut() {
    if (!dom.body) return;
    dom.body.innerHTML =
      '<div class="user-panel-guest">' +
      '<div class="user-panel-guest-icon">🪖</div>' +
      '<p class="user-panel-guest-text">로그인이 필요합니다.</p>' +
      '<div class="user-panel-guest-actions">' +
      '<button type="button" class="user-panel-btn user-panel-btn-primary" id="user-panel-login">로그인</button>' +
      '<button type="button" class="user-panel-btn" id="user-panel-signup">회원가입</button>' +
      "</div></div>";
    const go = () => {
      // 기존 로그인 화면(auth.js의 게이트)을 그대로 띄웁니다.
      const gate = el("auth-gate");
      if (gate) gate.style.display = "flex";
      const input = el("auth-nickname-input");
      if (input) input.focus();
    };
    const l = el("user-panel-login");
    const s = el("user-panel-signup");
    if (l) l.addEventListener("click", go);
    if (s) s.addEventListener("click", go);
  }

  function renderShell(nickname, rank) {
    dom.body.innerHTML =
      '<div class="user-panel-head">' +
      '<span class="user-panel-avatar">' + escapeHtml(nickname.slice(0, 1)) + "</span>" +
      '<span class="user-panel-id">' +
      App.Rank.renderBadge(rank, { size: 18 }) +
      '<span class="user-panel-rank rank-tier-text-' + rank.rank_tier + '">' + escapeHtml(rank.rank_name) + "</span>" +
      '<span class="user-panel-nick">' + escapeHtml(nickname) + "</span>" +
      "</span></div>" +
      '<div class="user-panel-stats">' +
      '<div class="user-panel-row"><span>총자산</span><b id="user-panel-equity">-</b></div>' +
      '<div class="user-panel-row"><span>수익금</span><b id="user-panel-profit">-</b></div>' +
      '<div class="user-panel-row"><span>수익률</span><b id="user-panel-roe">-</b></div>' +
      '<div class="user-panel-row"><span>리워드</span><b class="user-panel-soon">준비중</b></div>' +
      "</div>" +
      '<div class="user-panel-next" id="user-panel-next"></div>' +
      '<div class="user-panel-actions">' +
      '<button type="button" class="user-panel-btn" id="user-panel-mypage">마이페이지</button>' +
      '<button type="button" class="user-panel-btn" id="user-panel-logout">로그아웃</button>' +
      "</div>";

    const my = el("user-panel-mypage");
    if (my) {
      my.addEventListener("click", () => {
        const btn = el("page-nav-mypage");
        if (btn) btn.click(); // 기존 페이지 전환 로직 그대로 사용
        else alert("마이페이지는 현재 메뉴에서 숨김 상태입니다.");
      });
    }
    const out = el("user-panel-logout");
    if (out) {
      out.addEventListener("click", () => {
        const btn = el("auth-logout-btn");
        if (btn) btn.click(); // auth.js의 기존 로그아웃 그대로
      });
    }
  }

  function renderStats(snapshot) {
    const eq = el("user-panel-equity");
    if (!eq || !snapshot) return;
    const realized = snapshot.realizedPnl || 0;
    const roe = (realized / INITIAL_BALANCE) * 100;

    eq.textContent = App.Utils.formatCurrency(snapshot.equity);

    const profit = el("user-panel-profit");
    profit.textContent = App.Utils.formatCurrencySigned(realized);
    profit.className = realized > 0 ? "pnl-positive" : realized < 0 ? "pnl-negative" : "";

    const roeEl = el("user-panel-roe");
    roeEl.textContent = App.Utils.formatPercent(roe);
    roeEl.className = roe > 0 ? "pnl-positive" : roe < 0 ? "pnl-negative" : "";

    const next = el("user-panel-next");
    if (next) {
      const rank = App.Rank.getUserRank(snapshot);
      next.textContent = rank.next_rank_name
        ? rank.next_rank_name + "까지 " + Math.ceil(rank.points_to_next) + "점"
        : "최고 계급입니다";
    }
  }

  function render() {
    if (!dom.body) return;
    if (!isLoggedIn()) {
      if (lastNickname !== null) {
        lastNickname = null;
        renderLoggedOut();
      }
      return;
    }
    const nickname = App.Auth.getNickname();
    const snapshot = App.Trading ? App.Trading.getSnapshot() : null;
    const rank = App.Rank.getUserRank(snapshot);
    // 계급이 바뀌면 헤더도 다시 그려야 하므로 닉네임+계급을 함께 비교
    const key = nickname + "|" + rank.rank_id;
    if (key !== lastNickname) {
      lastNickname = key;
      renderShell(nickname, rank);
    }
    renderStats(snapshot);
  }

  function init() {
    dom = { body: el("user-panel-body") };
    if (!dom.body) return; // 마크업 없으면 조용히 종료

    lastNickname = "__init__";
    render();
    App.Bus.on("trading:update", render);
    App.Bus.on("rank:ready", render);
    // auth.js가 로그인/로그아웃 이벤트를 쏘지 않으므로 상태만 주기적으로 확인합니다.
    pollTimer = setInterval(render, AUTH_POLL_MS);
  }

  return { init };
})();
