/* =========================================================================
 * js/rank-badge-attach.js — App.RankBadgeAttach
 * =========================================================================
 * 랭킹표와 실시간 채팅의 닉네임 앞에 계급장을 붙입니다.
 *
 * js/leaderboard.js 와 js/chat.js 는 수정 금지 파일이라 손대지 않습니다.
 * 그 파일들이 그린 뒤에 DOM 만 후처리합니다(이 프로젝트에서 계속 쓰던 방식).
 *
 * 계급 점수는 서버에서 받아옵니다.
 *   public.rank_points_all() -> [{ nickname, rank_points }]
 *   그 점수를 js/rank.js 의 RANK_TABLE 로 계급으로 바꿉니다.
 *   화면에서 점수를 지어내지 않습니다(가짜 데이터 금지).
 *   서버 함수가 아직 없으면(SQL 미실행) 내 계급만 붙이고 조용히 넘어갑니다.
 * ========================================================================= */

window.App = window.App || {};

App.RankBadgeAttach = (function () {
  "use strict";

  var MARK = "data-rank-badge-done";

  var rankByNick = null;   // { 닉네임: 계급객체 }
  var loading = false;
  var loadFailed = false;

  function ready() {
    return !!(App.RankBadge && App.Rank && typeof App.Rank.calculateRank === "function");
  }

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  /* 서버에서 닉네임별 계급 점수를 한 번 받아 지도를 만듭니다. */
  function loadRanks() {
    if (loading || loadFailed) return Promise.resolve(rankByNick);
    var client = sb();
    if (!client || !ready()) return Promise.resolve(null);
    loading = true;
    return Promise.resolve(client.rpc("rank_points_all"))
      .then(function (r) {
        if (r.error) throw r.error;
        var map = {};
        (r.data || []).forEach(function (row) {
          if (!row || !row.nickname) return;
          map[String(row.nickname).trim()] = App.Rank.calculateRank(Number(row.rank_points) || 0);
        });
        rankByNick = map;
        loading = false;
        run();
        return map;
      })
      .catch(function (e) {
        loading = false;
        loadFailed = true;   // 계속 재시도하지 않습니다
        console.warn(
          "[rank-badge-attach.js] 계급 점수를 못 받았습니다 — 내 계급장만 표시합니다. " +
          "(supabase/schema-rank-badges.sql 실행 필요)", e
        );
        return null;
      });
  }

  /* 닉네임으로 계급 찾기 — 서버 지도에 없으면 내 것만 확인합니다. */
  function rankOf(nickname) {
    var n = String(nickname || "").trim();
    if (!n) return null;
    if (rankByNick && rankByNick[n]) return rankByNick[n];
    var myNick = App.Auth && typeof App.Auth.getNickname === "function" ? App.Auth.getNickname() : null;
    if (myNick && String(myNick).trim() === n && App.Rank.getUserRank) return App.Rank.getUserRank();
    return null;
  }

  /* ---------------- 랭킹표 ---------------- */
  function attachLeaderboard() {
    if (!ready()) return;
    var body = document.getElementById("leaderboard-body");
    if (!body) return;
    body.querySelectorAll("tr").forEach(function (tr) {
      if (tr.getAttribute(MARK) || tr.classList.contains("empty")) return;
      var cells = tr.querySelectorAll("td");
      if (cells.length < 2) return;
      var nickCell = cells[1];
      if (nickCell.querySelector(".rank-badge")) { tr.setAttribute(MARK, "1"); return; }

      /* 닉네임으로 계급을 찾습니다. '나' 배지 같은 덧붙은 글자는 떼고 봅니다. */
      var nick = nickCell.textContent.replace(/나\s*$/, "").trim();
      var rank = rankOf(nick);
      if (!rank) return;   // 모르면 아무것도 붙이지 않습니다(잘못된 계급장 방지)

      var img = App.RankBadge.el(rank, "ranking", rank.rank_name);
      if (img) {
        /* 계급장과 닉네임을 한 줄로 놓기 위해 이 칸에만 표시를 남깁니다
           (leaderboard.js 는 수정 금지라 CSS 로만 정렬합니다). */
        nickCell.classList.add("leaderboard-nick-cell");
        nickCell.insertBefore(img, nickCell.firstChild);
      }
      tr.setAttribute(MARK, "1");
    });
  }

  /* ---------------- 실시간 채팅 ---------------- */
  function attachChat() {
    if (!ready()) return;
    document.querySelectorAll(".chat-msg-nick").forEach(function (nick) {
      if (nick.getAttribute(MARK)) return;
      var rank = rankOf(nick.textContent);
      if (!rank) return;   // 아직 모르면 표시하지 않습니다(다음 갱신 때 붙습니다)
      nick.setAttribute(MARK, "1");
      if (nick.previousElementSibling && nick.previousElementSibling.classList.contains("rank-badge")) return;
      var img = App.RankBadge.el(rank, "chat", rank.rank_name);
      if (img && nick.parentNode) nick.parentNode.insertBefore(img, nick);
    });
  }

  /* ---------------- 커뮤니티(게시판 댓글) ---------------- */
  function attachBoard() {
    if (!ready()) return;
    document.querySelectorAll(".board-comment-meta .chat-msg-nick").forEach(function (nick) {
      if (nick.getAttribute("data-rank-board-done")) return;
      var rank = rankOf(nick.textContent);
      if (!rank) return;
      nick.setAttribute("data-rank-board-done", "1");
      var img = App.RankBadge.el(rank, "community", rank.rank_name);
      if (img && nick.parentNode) nick.parentNode.insertBefore(img, nick);
    });
  }

  function run() {
    try { attachLeaderboard(); } catch (e) { console.warn("[rank-badge-attach.js] 랭킹표 실패:", e); }
    try { attachChat(); } catch (e) { console.warn("[rank-badge-attach.js] 채팅 실패:", e); }
    try { attachBoard(); } catch (e) { console.warn("[rank-badge-attach.js] 커뮤니티 실패:", e); }
  }

  function init() {
    loadRanks();
    run();
    /* 목록이 다시 그려질 때마다 따라 붙입니다. */
    var targets = ["leaderboard-body", "chat-messages", "board-comments-list"];
    targets.forEach(function (id) {
      var node = document.getElementById(id);
      if (!node || typeof MutationObserver === "undefined") return;
      new MutationObserver(function () { run(); }).observe(node, { childList: true, subtree: true });
    });
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("rank:ready", run);
      App.Bus.on("trading:update", run);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init, run: run, loadRanks: loadRanks, rankOf: rankOf,
    attachLeaderboard: attachLeaderboard, attachChat: attachChat, attachBoard: attachBoard,
    _setMap: function (m) { rankByNick = m; },
  };
})();
