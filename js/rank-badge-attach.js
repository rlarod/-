/* =========================================================================
 * js/rank-badge-attach.js — App.RankBadgeAttach
 * =========================================================================
 * 랭킹표와 실시간 채팅의 닉네임 앞에 계급장을 붙입니다.
 *
 * js/leaderboard.js 와 js/chat.js 는 수정 금지 파일이라 손대지 않습니다.
 * 그 파일들이 그린 뒤에 DOM 만 후처리합니다(이 프로젝트에서 계속 쓰던 방식).
 *
 * 계급은 새로 계산하지 않습니다.
 *   랭킹표 : 서버가 준 rank_points / rank_id 가 행에 있으면 그걸 쓰고,
 *            없으면 그 행의 수익률로 App.Rank 가 계산합니다.
 *   채팅   : 서버가 계급을 같이 주지 않으므로, 내 메시지에만 내 계급을 붙입니다.
 *            (남의 계급을 임의로 지어내지 않습니다 — 가짜 데이터 금지)
 * ========================================================================= */

window.App = window.App || {};

App.RankBadgeAttach = (function () {
  "use strict";

  var MARK = "data-rank-badge-done";

  function ready() {
    return !!(App.RankBadge && App.Rank && typeof App.Rank.calculateRank === "function");
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

      /* 행에 계급 정보가 실려 있으면 그대로 쓰고, 없으면 만들지 않습니다. */
      var rid = tr.getAttribute("data-rank-id");
      var pts = tr.getAttribute("data-rank-points");
      var rank = null;
      if (rid) rank = { rank_id: Number(rid), rank_name: tr.getAttribute("data-rank-name") || "" };
      else if (pts) rank = App.Rank.calculateRank(Number(pts));
      if (!rank) { tr.setAttribute(MARK, "1"); return; }

      var img = App.RankBadge.el(rank, "ranking", rank.rank_name);
      if (img) nickCell.insertBefore(img, nickCell.firstChild);
      tr.setAttribute(MARK, "1");
    });
  }

  /* ---------------- 실시간 채팅 ---------------- */
  function attachChat() {
    if (!ready()) return;
    var myNick = App.Auth && typeof App.Auth.getNickname === "function" ? App.Auth.getNickname() : null;
    if (!myNick) return;
    var myRank = App.Rank.getUserRank ? App.Rank.getUserRank() : null;
    if (!myRank) return;

    document.querySelectorAll(".chat-msg-nick").forEach(function (nick) {
      if (nick.getAttribute(MARK)) return;
      nick.setAttribute(MARK, "1");
      /* 내 닉네임일 때만 붙입니다 — 남의 계급은 서버가 안 주므로 지어내지 않습니다. */
      if (nick.textContent.trim() !== String(myNick).trim()) return;
      if (nick.previousElementSibling && nick.previousElementSibling.classList.contains("rank-badge")) return;
      var img = App.RankBadge.el(myRank, "chat", myRank.rank_name);
      if (img && nick.parentNode) nick.parentNode.insertBefore(img, nick);
    });
  }

  function run() {
    try { attachLeaderboard(); } catch (e) { console.warn("[rank-badge-attach.js] 랭킹표 실패:", e); }
    try { attachChat(); } catch (e) { console.warn("[rank-badge-attach.js] 채팅 실패:", e); }
  }

  function init() {
    run();
    /* 목록이 다시 그려질 때마다 따라 붙입니다. */
    var targets = ["leaderboard-body", "chat-messages"];
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

  return { init: init, run: run, attachLeaderboard: attachLeaderboard, attachChat: attachChat };
})();
