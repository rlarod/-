/* =========================================================================
 * js/board-paging.js — App.BoardPaging
 * =========================================================================
 * 커뮤니티 목록 아래에 페이지 번호와 검색을 붙입니다.
 *
 * js/board.js(수정 금지 파일)는 "더 보기"로 글을 계속 덧붙이는 방식입니다.
 * 이 모듈은 그렇게 불러온 글을 화면에서 페이지 단위로 나눠 보여주고,
 * 제목/내용/글쓴이로 걸러줍니다.
 *
 * 서버에 새로 질의하지 않습니다 — 이미 불러온 목록만 다룹니다. 그래서
 * 아직 안 불러온 옛날 글은 "더 보기"를 눌러 목록에 들어와야 검색됩니다.
 * (board.js를 고치지 않고 할 수 있는 범위입니다.)
 * ========================================================================= */

window.App = window.App || {};

App.BoardPaging = (function () {
  "use strict";

  const PER_PAGE = 15; // 한 페이지에 보여줄 글 수
  let page = 1;
  let keyword = "";
  let field = "title"; // title | titleContent | author
  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function rows() {
    const body = el("board-list-body");
    if (!body) return [];
    return Array.prototype.filter.call(body.querySelectorAll("tr"), (r) =>
      r.classList.contains("board-row")
    );
  }

  /* ---------------- 검색어로 거르기 ---------------- */
  function matches(row) {
    if (!keyword) return true;
    const k = keyword.toLowerCase();
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) return true;
    // 갤러리형 배치 기준: 번호 | 제목 | 글쓴이 | 작성일 | 조회 | 추천
    const title = (tds[1].textContent || "").toLowerCase();
    const author = (tds[2].textContent || "").toLowerCase();
    if (field === "author") return author.indexOf(k) !== -1;
    return title.indexOf(k) !== -1;
  }

  /* ---------------- 화면 갱신 ---------------- */
  function apply() {
    const all = rows();
    const shown = all.filter(matches);
    const totalPages = Math.max(1, Math.ceil(shown.length / PER_PAGE));
    if (page > totalPages) page = totalPages;

    const start = (page - 1) * PER_PAGE;
    const end = start + PER_PAGE;

    all.forEach((r) => (r.style.display = "none"));
    shown.slice(start, end).forEach((r) => (r.style.display = ""));

    paintPager(totalPages, shown.length);
  }

  function paintPager(totalPages, count) {
    if (!dom.pager) return;
    dom.pager.innerHTML = "";

    // 앞뒤 5개씩만 보여줍니다(글이 많아져도 줄이 길어지지 않게).
    const from = Math.max(1, page - 5);
    const to = Math.min(totalPages, from + 9);

    for (let i = from; i <= to; i++) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "board-page-btn" + (i === page ? " active" : "");
      b.textContent = String(i);
      b.addEventListener("click", () => {
        page = i;
        apply();
      });
      dom.pager.appendChild(b);
    }

    if (dom.count) {
      dom.count.textContent = keyword
        ? "검색 결과 " + count + "건"
        : "전체 " + count + "건";
    }
  }

  function search() {
    keyword = (dom.input && dom.input.value ? dom.input.value : "").trim();
    field = dom.select ? dom.select.value : "title";
    page = 1;
    apply();
  }

  /* ---------------- 마크업 ---------------- */
  function build() {
    const listView = el("board-list-view");
    if (!listView || el("board-paging")) return;

    const wrap = document.createElement("div");
    wrap.id = "board-paging";
    wrap.className = "board-paging";
    wrap.innerHTML =
      '<div class="board-page-row"><span class="board-page-count" id="board-page-count"></span>' +
      '<div class="board-page-nums" id="board-page-nums"></div></div>' +
      '<div class="board-search-row">' +
      '<select id="board-search-field">' +
      '<option value="title">제목</option>' +
      '<option value="author">글쓴이</option>' +
      "</select>" +
      '<input type="text" id="board-search-input" placeholder="검색어를 입력하세요">' +
      '<button type="button" id="board-search-btn">검색</button>' +
      "</div>";
    listView.appendChild(wrap);

    dom = {
      pager: el("board-page-nums"),
      count: el("board-page-count"),
      input: el("board-search-input"),
      select: el("board-search-field"),
    };

    el("board-search-btn").addEventListener("click", search);
    dom.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") search();
    });
    // 검색어를 지우면 바로 전체 목록으로 돌아옵니다.
    dom.input.addEventListener("input", () => {
      if (!dom.input.value.trim() && keyword) search();
    });
  }

  function init() {
    const body = el("board-list-body");
    if (!body) return;
    build();
    apply();
    // board.js가 목록을 새로 그리거나 "더 보기"로 덧붙일 때마다 다시 계산합니다.
    new MutationObserver(() => apply()).observe(body, { childList: true });
  }

  return { init, applyForTest: apply, searchForTest: search, getPageForTest: () => page };
})();
