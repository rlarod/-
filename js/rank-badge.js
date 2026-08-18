/* =========================================================================
 * js/rank-badge.js — App.RankBadge
 * =========================================================================
 * 계급장 이미지를 사이트 어디서나 같은 방식으로 붙이는 공통 함수입니다.
 *
 * ── 기존 시스템을 재사용합니다 ─────────────────────────────────────────
 * 계급 체계(19단계)는 js/rank.js 의 RANK_TABLE 이 이미 갖고 있습니다.
 * 새 등급 체계를 만들지 않고, 그 계급에 그림만 연결합니다.
 *   App.Rank.getUserRank()  -> { rank_id, rank_name, rank_tier, points, ... }
 *   여기서는 rank_id 로 파일을 고릅니다.
 *
 * ── 이미지 ─────────────────────────────────────────────────────────────
 * assets/ranks/rank-01-private.png … rank-19-general.png
 * 계급장 한 장에 하나씩 잘라 둔 개별 파일입니다(스프라이트 아님).
 * 비율은 파일마다 다르므로 CSS 에서 높이만 정하고 가로는 auto 로 둡니다
 * — 절대 찌그러지지 않습니다.
 *
 * ── 쓰는 법 ────────────────────────────────────────────────────────────
 *   App.RankBadge.html(rankId, "chat")        -> <img> 문자열
 *   App.RankBadge.el(rankId, "ranking")       -> DOM 요소
 *   App.RankBadge.fileFor(rankId)             -> 파일 경로
 * 크기 이름: chat | community | ranking | profile  (CSS 에서 조절)
 * ========================================================================= */

window.App = window.App || {};

App.RankBadge = (function () {
  "use strict";

  var BASE = "assets/ranks/";

  /* rank_id -> 파일 이름. js/rank.js 의 RANK_TABLE 순서와 1:1 입니다. */
  var FILES = {
    1: "rank-01-private.png",
    2: "rank-02-private-first.png",
    3: "rank-03-private-class.png",
    4: "rank-04-sergeant.png",
    5: "rank-05-staff-sergeant.png",
    6: "rank-06-sergeant-major.png",
    7: "rank-07-master-sergeant.png",
    8: "rank-08-command-sergeant-major.png",
    9: "rank-09-warrant-officer.png",
    10: "rank-10-second-lieutenant.png",
    11: "rank-11-first-lieutenant.png",
    12: "rank-12-captain.png",
    13: "rank-13-major.png",
    14: "rank-14-lieutenant-colonel.png",
    15: "rank-15-colonel.png",
    16: "rank-16-brigadier-general.png",
    17: "rank-17-major-general.png",
    18: "rank-18-lieutenant-general.png",
    19: "rank-19-general.png",
  };

  var SIZES = { chat: "chat", community: "community", ranking: "ranking", profile: "profile" };

  function normalizeId(rankId) {
    /* null/undefined/"" 은 '값이 없음' 입니다. Number(null) 이 0 이라
       그대로 두면 이병 계급장이 잘못 붙습니다(테스트로 발견). */
    if (rankId === null || rankId === undefined || rankId === "") return null;
    var n = Math.round(Number(rankId));
    if (!isFinite(n)) return null;
    /* 표 밖의 숫자는 가까운 끝 계급으로 맞춥니다. */
    if (n < 1) n = 1;
    if (n > 19) n = 19;
    return FILES[n] ? n : null;
  }

  function fileFor(rankId) {
    var id = normalizeId(rankId);
    return id ? BASE + FILES[id] : null;
  }

  /* 계급 객체나 점수에서 rank_id 를 얻습니다(호출부를 편하게 하려고). */
  function idFrom(rankOrId) {
    if (rankOrId && typeof rankOrId === "object" && rankOrId.rank_id) return rankOrId.rank_id;
    if (typeof rankOrId === "number") return rankOrId;
    return null;
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function html(rankOrId, size, rankName) {
    var id = normalizeId(idFrom(rankOrId));
    if (!id) return "";
    var name = rankName || (rankOrId && rankOrId.rank_name) || "";
    var cls = "rank-badge rank-badge-" + (SIZES[size] || "community");
    return (
      '<img class="' + cls + '" src="' + BASE + FILES[id] + '"' +
      ' alt="' + esc(name) + '" title="' + esc(name) + '" loading="lazy">'
    );
  }

  function el(rankOrId, size, rankName) {
    var id = normalizeId(idFrom(rankOrId));
    if (!id) return null;
    var img = document.createElement("img");
    img.className = "rank-badge rank-badge-" + (SIZES[size] || "community");
    img.src = BASE + FILES[id];
    var name = rankName || (rankOrId && rankOrId.rank_name) || "";
    img.alt = name;
    img.title = name;
    img.loading = "lazy";
    return img;
  }

  /* 점수로 바로 계급장이 필요할 때 — 계산은 rank.js 에 맡깁니다. */
  function fromPoints(points, size) {
    if (!App.Rank || typeof App.Rank.calculateRank !== "function") return "";
    var r = App.Rank.calculateRank(points);
    return html(r, size, r.rank_name);
  }

  return {
    html: html,
    el: el,
    fileFor: fileFor,
    fromPoints: fromPoints,
    normalizeId: normalizeId,
    FILES: FILES,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.RankBadge;
