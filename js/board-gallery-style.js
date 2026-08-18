/* =========================================================================
 * js/board-gallery-style.js — App.BoardGalleryStyle
 * =========================================================================
 * 커뮤니티 목록을 갤러리형 게시판 모양으로 바꿉니다.
 *
 *   변경 전: 제목 | 글쓴이 | 추천 | 댓글 | 조회 | 작성시간
 *   변경 후: 번호 | 제목 [댓글수] | 글쓴이 | 작성일 | 조회 | 추천
 *
 * js/board.js(수정 금지 파일)가 목록을 그린 뒤, 이 모듈이 칸 순서만 바꾸고
 * 번호를 붙입니다. 글 내용·글쓴이·수치는 전부 board.js가 넣은 값 그대로이고
 * 여기서 새로 만들거나 계산하지 않습니다.
 *
 * 번호는 최신 글이 큰 번호를 갖도록 목록 길이에서 역순으로 매깁니다.
 * (DB에 글 번호 컬럼이 없어 서버 기준 번호가 아니라 화면 순번입니다.)
 * ========================================================================= */

window.App = window.App || {};

App.BoardGalleryStyle = (function () {
  "use strict";

  let observer = null;

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 헤더를 레퍼런스 순서로 ---------------- */
  function fixHead() {
    const body = el("board-list-body");
    if (!body) return;
    const table = body.closest("table");
    if (!table) return;
    const headRow = table.querySelector("thead tr");
    if (!headRow || headRow.dataset.galleryStyled === "1") return;

    headRow.innerHTML =
      '<th class="bg-no">번호</th>' +
      '<th class="bg-title">제목</th>' +
      '<th class="bg-author">글쓴이</th>' +
      '<th class="bg-date">작성일</th>' +
      '<th class="bg-view">조회</th>' +
      '<th class="bg-like">추천</th>';
    headRow.dataset.galleryStyled = "1";
    table.classList.add("board-gallery");
  }

  /* ---------------- 각 행을 레퍼런스 순서로 ---------------- */
  function fixRow(row, no) {
    if (!row || row.dataset.galleryStyled === "1") return;
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) return; // "글이 없습니다" 같은 행은 건드리지 않음

    // board.js가 넣은 값 그대로 읽습니다(새로 만들지 않음).
    const titleHtml = tds[0].innerHTML;
    const author = tds[1].textContent.trim();
    const like = tds[2].textContent.replace(/[^0-9-]/g, "");
    const comment = tds[3].textContent.replace(/[^0-9-]/g, "");
    const view = tds[4].textContent.trim();
    const date = tds[5].textContent.trim();

    row.innerHTML =
      '<td class="bg-no">' + no + "</td>" +
      '<td class="bg-title">' + titleHtml +
      (comment && comment !== "0" ? ' <span class="bg-comment">[' + comment + "]</span>" : "") +
      "</td>" +
      '<td class="bg-author">' + author + "</td>" +
      '<td class="bg-date">' + date + "</td>" +
      '<td class="bg-view">' + view + "</td>" +
      '<td class="bg-like">' + like + "</td>";
    row.dataset.galleryStyled = "1";
  }

  function apply() {
    fixHead();
    const body = el("board-list-body");
    if (!body) return;
    const rows = body.querySelectorAll("tr.board-row");
    // 최신 글이 위에 오므로 위에서부터 큰 번호를 매깁니다.
    let no = rows.length;
    rows.forEach((row) => {
      fixRow(row, no);
      no -= 1;
    });
  }

  function init() {
    const body = el("board-list-body");
    if (!body) return;

    apply();
    // board.js가 목록을 새로 그리거나 "더 보기"로 덧붙일 때마다 다시 적용합니다.
    observer = new MutationObserver(apply);
    observer.observe(body, { childList: true });
  }

  return { init, applyForTest: apply };
})();
