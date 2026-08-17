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
    "[공지] 실제 자금이 오가지 않는 모의투자 플랫폼입니다",
    "[공지] 랭킹은 청산된 거래(실현 손익) 기준으로 계산됩니다",
    "[안내] 전쟁터에서 실시간 매수/매도 세력 대결을 확인해보세요",
    "[안내] 마이페이지에서 내 자산 현황을 한눈에 확인하세요",
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
    dom.notice.innerHTML = STATIC_NOTICES.map((t) => {
      const m = t.match(/^\[(.+?)\]\s*(.*)$/);
      if (!m) return "<li>" + escapeHtml(t) + "</li>";
      const tagClass = m[1] === "공지" ? "notice-tag-notice" : "notice-tag-info";
      return '<li><span class="notice-line"><span class="notice-tag ' + tagClass + '">[' + escapeHtml(m[1]) + "]</span>" + escapeHtml(m[2]) + "</span></li>";
    }).join("");
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

  // 상단이 4분할(공지 / 최신게시물 / 인기글 / 내 정보)이 되면서 각 목록이
  // 자기 칼럼을 하나씩 갖게 됐습니다. 즉 서로 숨겼다 보였다 할 일이 없습니다.
  // 다만 나중에 다시 한 박스에 여러 탭을 넣더라도 동작하도록, "같은 박스 안에
  // 있는 탭끼리만" 토글하게 구현해둡니다(다른 칼럼은 영향받지 않음).
  function switchTab(tabName, btn) {
    const box = btn ? btn.closest(".notice-box") : null;
    if (!box) return;
    const tabsInBox = box.querySelectorAll(".notice-tab-btn[data-tab]");
    if (tabsInBox.length < 2) return; // 탭이 하나뿐인 칼럼은 토글할 것이 없음
    tabsInBox.forEach((b) => {
      const list = el("notice-list-" + b.dataset.tab);
      if (list) list.style.display = b.dataset.tab === tabName ? "" : "none";
      b.classList.toggle("active", b.dataset.tab === tabName);
    });
  }

  function bindTabs() {
    document.querySelectorAll(".notice-tab-btn[data-tab]").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab, btn));
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
