/* =========================================================================
 * js/notice-board.js — App.NoticeBoard
 * =========================================================================
 * 상단 3컬럼 공지 영역(개미톡 참고): 공지사항 / 최신게시물 / 인기글.
 *
 * "최신게시물"/"인기글"은 절대 가짜 데이터를 안 씁니다 — 이미 만들어둔
 * App.Board.getLatestPosts()/getPopularPosts()를 그대로 호출해서 실제
 * Supabase 게시글 데이터를 가져옵니다(board.js 로직 중복 구현 없음).
 * "공지사항"만 사이트 자체 안내문이라 정적 문구입니다(실제 게시판
 * 데이터가 아니라고 명확히 구분됨 — 다른 두 칼럼과 섞이지 않음).
 * ========================================================================= */

window.App = window.App || {};

App.NoticeBoard = (function () {
  "use strict";

  const STATIC_NOTICES = [
    "이 사이트는 실제 자금이 오가지 않는 모의투자 플랫폼입니다.",
    "🏆 랭킹은 청산된 거래(실현 손익) 기준으로만 계산됩니다.",
    "⚔ 전쟁터에서 실시간 매수/매도 세력 대결을 확인해보세요.",
    "👤 마이페이지에서 내 자산 현황을 한눈에 확인할 수 있습니다.",
  ];

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function renderNotices() {
    if (!dom.notice) return;
    dom.notice.innerHTML = STATIC_NOTICES.map((t) => "<li>" + escapeHtml(t) + "</li>").join("");
  }

  function renderPostList(container, posts, emptyText) {
    if (!container) return;
    if (!posts || posts.length === 0) {
      container.innerHTML = '<li class="notice-board-empty">' + emptyText + "</li>";
      return;
    }
    container.innerHTML = posts
      .slice(0, 5)
      .map((p) => '<li class="notice-board-post" data-id="' + p.id + '">' + escapeHtml(p.title) + '<span class="notice-board-post-likes">👍' + p.like_count + "</span></li>")
      .join("");
    container.querySelectorAll(".notice-board-post").forEach((li) => {
      li.addEventListener("click", () => {
        // 게시판 페이지로 이동 후, 클릭한 그 글을 바로 열기(board.js의 기존 openDetail 재사용, 새 로직 없음)
        const boardBtn = el("page-nav-board");
        if (boardBtn) boardBtn.click();
        if (App.Board && typeof App.Board.openDetail === "function") {
          App.Board.openDetail(li.dataset.id);
        }
      });
    });
  }

  async function loadBoardLists() {
    if (!App.Board) return;
    try {
      const [latest, popular] = await Promise.all([App.Board.getLatestPosts(0), App.Board.getPopularPosts()]);
      renderPostList(dom.latest, latest, "아직 게시글이 없습니다.");
      renderPostList(dom.popular, popular, "아직 인기글이 없습니다.");
    } catch (e) {
      console.warn("[notice-board.js] 게시판 목록 조회 실패:", e);
    }
  }

  function switchTab(tabName) {
    if (tabName !== "notice" && tabName !== "latest") return; // 인기글은 왼쪽 박스와 무관, 오른쪽 박스의 유일한 실제 탭이라 토글 불필요
    if (dom.notice) dom.notice.style.display = tabName === "notice" ? "" : "none";
    if (dom.latest) dom.latest.style.display = tabName === "latest" ? "" : "none";
    document.querySelectorAll('.notice-tab-btn[data-tab="notice"], .notice-tab-btn[data-tab="latest"]').forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabName);
    });
  }

  function bindTabs() {
    document.querySelectorAll(".notice-tab-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
  }

  function init() {
    dom = {
      notice: el("notice-list-notice"),
      latest: el("notice-list-latest"),
      popular: el("notice-list-popular"),
    };
    if (!dom.notice) return; // 마크업 없으면 조용히 종료

    renderNotices();
    loadBoardLists();
    bindTabs();
  }

  return { init };
})();
