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

  // 개미톡 사용자 패널 구조: 헤더(아바타+계급+닉네임+진행률) → 2×2 값 표 → 하단 링크 줄.
  // 값 4칸은 전부 App.Trading.getSnapshot()의 실제 값이고, 진행률은 계급 점수에서
  // 계산한 실제 비율입니다. 실제 기능이 없는 항목(리워드/쪽지)은 하단에 "준비중"으로만 둡니다.
  function renderShell(nickname, rank) {
    dom.body.innerHTML =
      '<div class="up-head">' +
      '<span class="up-avatar">' + escapeHtml(nickname.slice(0, 1)) + "</span>" +
      '<span class="up-who">' +
      App.Rank.renderBadge(rank, { size: 17 }) +
      '<span class="up-rank rank-tier-text-' + rank.rank_tier + '">' + escapeHtml(rank.rank_name) + "</span>" +
      '<span class="up-nick">' + escapeHtml(nickname) + "</span>" +
      "</span>" +
      '<span class="up-progress" id="user-panel-progress" title="다음 계급까지 진행률">' +
      '<span class="up-progress-fill" id="user-panel-progress-fill"></span>' +
      '<span class="up-progress-text" id="user-panel-progress-text">-</span>' +
      "</span></div>" +

      '<div class="up-grid">' +
      // 라벨은 레퍼런스(개미톡)의 선물 / 벅스 / USDT / 지갑 구성을 따릅니다.
      //   선물   = 선물 계좌 평가자산   (레퍼런스와 동일 이름)
      //   포인트 = 계급 점수            (레퍼런스의 "벅스" 자리 — 우리 실제 값)
      //   USDT   = 주문 가능 잔고       (레퍼런스와 동일 이름)
      //   수익률 = 실현 수익률          (레퍼런스의 "지갑"에 해당하는 데이터가 없어 유지)
      '<span class="up-label">선물</span><b class="up-value" id="user-panel-equity">-</b>' +
      '<span class="up-label">포인트</span><b class="up-value" id="user-panel-points">-</b>' +
      '<span class="up-label">USDT</span><b class="up-value" id="user-panel-available">-</b>' +
      '<span class="up-label">수익률</span><b class="up-value" id="user-panel-roe">-</b>' +
      "</div>" +

      '<div class="up-nav">' +
      '<button type="button" data-nav="ranking">랭킹</button>' +
      '<button type="button" data-nav="board">커뮤니티</button>' +
      '<button type="button" data-nav="mypage">내정보</button>' +
      '<button type="button" class="up-nav-soon" data-nav="reward">리워드<span class="up-soon-badge">준비중</span></button>' +
      '<button type="button" class="up-nav-soon" data-nav="message">쪽지<span class="up-soon-badge">준비중</span></button>' +
      '<button type="button" data-nav="logout">로그아웃</button>' +
      "</div>";

    // 하단 링크는 전부 기존 버튼을 대신 눌러주는 방식 — 새 화면 전환 로직 없음.
    const PROXY = { ranking: "page-nav-ranking", board: "page-nav-board", mypage: "page-nav-mypage", logout: "auth-logout-btn" };
    dom.body.querySelectorAll(".up-nav button").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.nav;
        if (key === "reward" || key === "message") {
          alert(key === "reward" ? "리워드 기능은 준비중입니다." : "쪽지 기능은 준비중입니다.");
          return;
        }
        const target = el(PROXY[key]);
        if (target) target.click();
        else alert("해당 메뉴는 현재 화면에서 숨김 상태입니다.");
      });
    });
  }

  function renderStats(snapshot) {
    const eq = el("user-panel-equity");
    if (!eq || !snapshot) return;
    const realized = snapshot.realizedPnl || 0;
    const roe = (realized / INITIAL_BALANCE) * 100;

    eq.textContent = App.Utils.formatCurrency(snapshot.equity);
    el("user-panel-available").textContent = App.Utils.formatCurrency(snapshot.balance);

    // 포인트 = 계급 점수(js/rank.js가 청산 거래 수와 실현 수익률로 계산하는 실제 값).
    // 없는 수치를 지어내지 않고, 이미 계급 계산에 쓰는 값을 그대로 보여줍니다.
    const pointsEl = el("user-panel-points");
    if (pointsEl) {
      const r = App.Rank ? App.Rank.getUserRank(snapshot) : null;
      pointsEl.textContent = r && typeof r.points === "number" ? Math.round(r.points).toLocaleString() + " P" : "-";
    }

    const roeEl = el("user-panel-roe");
    roeEl.textContent = App.Utils.formatPercent(roe);
    roeEl.className = "up-value " + (roe > 0 ? "pnl-positive" : roe < 0 ? "pnl-negative" : "");

    // 다음 계급까지 진행률 — 현재 계급 구간 안에서 몇 %인지(실제 점수 기준)
    const rank = App.Rank.getUserRank(snapshot);
    const table = App.Rank.getRankTable();
    const cur = table.find((r) => r.rank_id === rank.rank_id);
    const next = table.find((r) => r.rank_id === rank.rank_id + 1);
    let pct = 100;
    if (next) {
      const span = next.min_points - cur.min_points;
      pct = span > 0 ? Math.max(0, Math.min(100, ((rank.points - cur.min_points) / span) * 100)) : 0;
    }
    const fill = el("user-panel-progress-fill");
    const text = el("user-panel-progress-text");
    if (fill) fill.style.width = pct.toFixed(0) + "%";
    if (text) text.textContent = next ? pct.toFixed(0) + "%" : "MAX";
    const wrap = el("user-panel-progress");
    if (wrap) wrap.title = next ? next.rank_name + "까지 " + Math.ceil(rank.points_to_next) + "점" : "최고 계급입니다";
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
