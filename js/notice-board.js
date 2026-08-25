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

  /* ── 공지는 서버에서 읽어옵니다 ──────────────────────────────────────
   * 예전에는 이 자리에 문구 4줄이 코드로 박혀 있었습니다. 관리자가 쓴 게
   * 아니라서 공지 하나 바꾸려면 코드를 고쳐야 했습니다(2026-08-25 대표 지적).
   * 이제 public.notices 표에서 읽고, 관리자 창에서 쓰고 지웁니다.
   * 서버(supabase/schema-notices.sql)를 아직 안 돌렸으면 아래 기본 문구를
   * 그대로 보여줍니다 — 화면이 비어 보이는 것보다 낫습니다. */
  const FALLBACK_NOTICES = [
    "[공지] 실제 자금이 오가지 않는 모의투자 플랫폼입니다",
  ];

  let notices = FALLBACK_NOTICES.slice();

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  async function loadNotices() {
    const client = sb();
    if (!client) return;
    try {
      const res = await client.rpc("get_notices", { limit_count: 20 });
      if (res && res.error) throw res.error;
      const rows = Array.isArray(res.data) ? res.data : [];
      /* 공지가 하나도 없으면 기본 문구를 남겨둡니다. 관리자가 전부 지웠을
         때 화면이 텅 비어 "고장난 사이트" 로 보이지 않게 합니다. */
      if (rows.length) {
        notices = rows.map((n) => "[" + (n.kind || "공지") + "] " + n.title);
      }
      renderNotices();
      renderHeaderNotice();
    } catch (e) {
      /* 서버를 못 읽으면 기본 문구 그대로 둡니다 */
      console.warn("[notice-board.js] 공지를 불러오지 못했습니다:", e);
    }
  }

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  // 헤더의 [공지] 한 줄 — 개미톡 헤더 구조. 목록 첫 줄을 그대로 재사용하며
  // 별도의 데이터를 만들지 않습니다.
  function renderHeaderNotice() {
    const box = el("header-notice-text");
    if (!box || !notices.length) return;
    const m = notices[0].match(/^\[(.+?)\]\s*(.*)$/);
    box.textContent = m ? m[2] : notices[0];
  }

  function renderNotices() {
    if (!dom.notice) return;
    dom.notice.innerHTML = notices.map((t) => {
      const m = t.match(/^\[(.+?)\]\s*(.*)$/);
      if (!m) return "<li>" + escapeHtml(t) + "</li>";
      const tagClass = m[1] === "공지" ? "notice-tag-notice" : "notice-tag-info";
      return '<li><span class="notice-line"><span class="notice-tag ' + tagClass + '">[' + escapeHtml(m[1]) + "]</span>" + escapeHtml(m[2]) + "</span></li>";
    }).join("");
  }

  // 개미톡처럼 인기글은 "인기글 N위 · 제목 · (추천수)" 형태로 순위를 매겨 표시하고,
  // 최신게시물은 제목 + 추천수만 표시합니다. 정렬/조회는 전부 board.js의 기존
  // 함수 결과를 그대로 쓰며(추천수 내림차순), 여기서 다시 계산하지 않습니다.
  function renderPostList(container, posts, emptyText, opts) {
    if (!container) return;
    const o = opts || {};
    if (!posts || posts.length === 0) {
      container.innerHTML = '<li class="notice-board-empty">' + emptyText + "</li>";
      return;
    }
    container.innerHTML = posts
      .slice(0, 5)
      .map((p, i) => {
        const rank = o.ranked ? '<span class="notice-rank">인기글 ' + (i + 1) + "위</span>" : "";
        // 개미톡처럼 제목 뒤에 댓글 수 (n), 오른쪽 끝에 추천 수를 붙입니다.
        // 두 값 모두 posts_with_meta 뷰가 이미 계산해 주는 실제 값입니다.
        const comments = Number(p.comment_count) > 0 ? '<span class="notice-comment-count">(' + p.comment_count + ")</span>" : "";
        return (
          '<li class="notice-board-post" data-id="' + p.id + '">' +
          '<span class="notice-line">' + rank + escapeHtml(p.title) + comments + "</span>" +
          '<span class="notice-board-post-likes">👍' + p.like_count + "</span></li>"
        );
      })
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
      renderPostList(dom.popular, popular, "아직 인기글이 없습니다.", { ranked: true });
    } catch (e) {
      console.warn("[notice-board.js] 게시판 목록 조회 실패:", e);
    }
  }

  // 가운데 박스가 4탭(최신게시물/인기글/자유게시판/분석게시판)이 되면서,
  // "같은 박스 안의 탭끼리만" 서로 전환하도록 구현합니다. 왼쪽(공지)과
  // 오른쪽(내 정보)은 탭이 하나뿐이라 영향을 받지 않습니다.
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
    renderHeaderNotice();
    loadNotices();      /* 서버 공지로 덮어씁니다 */
    loadBoardLists();
    bindTabs();

    /* 관리자가 공지를 올리면 접속 중인 회원 화면에도 바로 뜨게 합니다.
       실시간이 막힌 환경을 대비해 3분마다 한 번 더 확인합니다. */
    subscribeNotices();
    setInterval(loadNotices, 180000);
  }

  function subscribeNotices() {
    const client = sb();
    if (!client || typeof client.channel !== "function") return;
    try {
      client
        .channel("notices_live_" + Date.now())
        .on("postgres_changes", { event: "*", schema: "public", table: "notices" }, loadNotices)
        .subscribe();
    } catch (e) {
      /* 실시간이 막히면 위 주기 확인이 대신합니다 */
    }
  }

  // 테스트에서 목록 렌더링만 따로 검증하기 위한 통로(내부 로직은 동일 함수 사용)
  return { init, renderForTest: renderPostList, loadNotices };
})();
