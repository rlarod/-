/* =========================================================================
 * js/guest-leaderboard.js — App.GuestLeaderboard
 * =========================================================================
 * 로그인하지 않은 사람에게도 🏆 랭킹을 보여줍니다.
 *
 * ── 무엇이 문제였나 (TL-006) ───────────────────────────────────────────
 * 서버는 이미 비회원에게 열려 있습니다.
 *   supabase/schema-guest-read.sql:54
 *   grant execute on function public.get_leaderboard to anon;
 * 비로그인 상태에서 직접 불러보면 오류 없이 행이 옵니다(실측: 3행).
 *
 * 그런데 화면이 막고 있었습니다.
 *   js/leaderboard.js:140  (수정 금지 파일)
 *   if (!(await hasSession(client))) { renderMessage("로그인 후 확인할 수
 *   있습니다."); return; }   ← 서버를 부르지도 않고 끝냅니다.
 *
 * 그래서 링크를 받고 처음 들어온 사람에게 이 사이트의 핵심(경쟁)이
 * 안 보였습니다. 1440px 실측으로 랭킹 페이지 높이 177px, 숫자 0개.
 *
 * ── 어떻게 고치나 ──────────────────────────────────────────────────────
 * js/leaderboard.js 는 한 글자도 고치지 않습니다. 이 저장소가 계속 쓰던
 * 우회 방식(별도 모듈 + DOM 후처리 + MutationObserver)을 씁니다.
 *
 *   1) 비로그인일 때만 동작합니다. 로그인 상태면 아무 일도 하지 않고
 *      원본(js/leaderboard.js)에 전부 맡깁니다 — 회원 화면은 1px도
 *      달라지지 않아야 합니다.
 *   2) get_leaderboard 를 직접 불러 같은 <tbody id="leaderboard-body"> 에
 *      원본 render() 와 똑같은 마크업으로 그립니다.
 *   3) 원본이 "로그인 후 확인할 수 있습니다."로 다시 덮으면
 *      MutationObserver 가 보고 다시 채웁니다.
 *   4) 랭킹 페이지를 열 때마다, 그리고 로그인/로그아웃 시 다시 판단합니다.
 *
 * 계급장은 js/rank-badge-attach.js 가 leaderboard-body 를 지켜보다가
 * 알아서 붙입니다(rank_points_all 도 anon 에 열려 있습니다).
 * 확실히 하려고 그릴 때마다 run() 을 한 번 더 부릅니다.
 *
 * ── 공개 범위 ──────────────────────────────────────────────────────────
 * 랭킹만 공개 정보입니다. 거래내역·개인정보·TL 잔액은 이 파일이 손대지
 * 않습니다 — 각각 js/trade-history.js, js/my-private-info.js,
 * js/tl-hotdeal.js, js/tl-market.js 가 계속 막습니다.
 *
 * ── 되돌리려면 ─────────────────────────────────────────────────────────
 * index.html 에서 이 파일의 <script> 한 줄을 지우면 예전 동작으로
 * 완전히 돌아갑니다(파일을 지워도 됩니다). 다른 파일은 안 건드립니다.
 * ========================================================================= */

window.App = window.App || {};

App.GuestLeaderboard = (function () {
  "use strict";

  var TOP_N = 20;              /* 원본과 같은 수 */
  var REFETCH_MS = 30000;      /* 같은 데이터를 너무 자주 다시 받지 않습니다 */

  var rows = null;        /* 마지막으로 받은 행 (통화 전환 시 재사용) */
  var fetchedAt = 0;
  var isGuest = null;     /* null = 아직 모름 / true = 비회원 / false = 로그인 */
  var fetching = false;
  var writing = false;    /* 우리가 쓰는 중 — 우리 관찰자가 우리 글씨에 반응하지 않게 */
  var timer = null;
  var started = false;

  function bodyEl() {
    return document.getElementById("leaderboard-body");
  }

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  /* ── 로그인 여부 ──────────────────────────────────────────────────────
     닉네임이 이미 있으면 그것만으로 로그인입니다(동기 판정, 즉시 손 뗌).
     없으면 세션을 확인합니다 — 원본 hasSession() 과 같은 방법입니다.
     확인이 실패하면 '로그인'으로 봅니다: 모르면 아무것도 안 하는 쪽이
     안전합니다(회원 화면을 건드릴 위험이 0). */
  function loggedInSync() {
    return !!(App.Auth && typeof App.Auth.getNickname === "function" && App.Auth.getNickname());
  }

  function checkGuest() {
    if (loggedInSync()) { isGuest = false; return Promise.resolve(false); }
    var client = sb();
    if (!client || !client.auth || typeof client.auth.getSession !== "function") {
      isGuest = false;
      return Promise.resolve(false);
    }
    return Promise.resolve(client.auth.getSession())
      .then(function (r) {
        isGuest = !(r && r.data && r.data.session) && !loggedInSync();
        return isGuest;
      })
      .catch(function () { isGuest = false; return false; });
  }

  /* ── 원본 js/leaderboard.js 의 표시 규칙을 그대로 따라합니다 ────────── */
  function fmtSignedPercent(n) {
    if (n === null || n === undefined || isNaN(n)) return "-";
    return (n >= 0 ? "+" : "") + Number(n).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
  }

  function rankLabel(rank) {
    if (rank === 1) return '<span class="leaderboard-rank-badge rank-1">🥇 1위</span>';
    if (rank === 2) return '<span class="leaderboard-rank-badge rank-2">🥈 2위</span>';
    if (rank === 3) return '<span class="leaderboard-rank-badge rank-3">🥉 3위</span>';
    return rank + "위";
  }

  function escapeHtml(s) {
    var div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }

  function rowsHtml(list) {
    /* 비회원이라 '나' 강조는 나올 수 없지만, 원본과 코드가 어긋나지 않게
       같은 방식으로 계산합니다. */
    var myNickname = App.Auth && typeof App.Auth.getNickname === "function" ? App.Auth.getNickname() : null;
    return list
      .map(function (r, idx) {
        var rank = idx + 1;
        var isMe = myNickname && r.nickname === myNickname;
        var pnlClass = Number(r.roe_percent) >= 0 ? "pnl-positive" : "pnl-negative";
        return (
          '<tr class="' + (isMe ? "leaderboard-row-me" : "") + '">' +
          "<td>" + rankLabel(rank) + "</td>" +
          "<td>" + escapeHtml(r.nickname) + (isMe ? ' <span class="leaderboard-me-badge">나</span>' : "") + "</td>" +
          "<td>" + App.Utils.formatCurrency(r.total_asset) + "</td>" +
          '<td class="' + pnlClass + '">' + App.Utils.formatCurrencySigned(r.profit_amount) + "</td>" +
          '<td class="' + pnlClass + '">' + fmtSignedPercent(r.roe_percent) + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function emptyHtml(msg) {
    return '<tr class="empty"><td colspan="5">' + msg + "</td></tr>";
  }

  /* 지금 표가 '잠금/안내 문구'만 있는 상태인가 — 진짜 순위가 있으면 안 덮습니다. */
  function isBlocked() {
    var b = bodyEl();
    if (!b) return false;
    if (b.querySelector("tr:not(.empty)")) return false;   /* 실제 순위가 그려져 있음 */
    return true;                                            /* 비었거나 empty 안내 한 줄 */
  }

  function paint() {
    var b = bodyEl();
    if (!b || isGuest !== true || !rows) return;
    if (!App.Utils || typeof App.Utils.formatCurrency !== "function") return;  /* 아직 준비 전 */
    var html = rows.length ? rowsHtml(rows) : emptyHtml("아직 랭킹 데이터가 없습니다.");
    if (b.innerHTML === html) return;
    writing = true;
    try {
      b.innerHTML = html;
      /* 원본은 비회원에게 '내 순위'를 비워둡니다 — 그대로 둡니다. */
      var mine = document.getElementById("leaderboard-my-rank");
      if (mine && mine.textContent) mine.textContent = "";
    } finally {
      writing = false;
    }
    /* 계급장 붙이기 — 관찰자가 알아서 돌지만 확실히 한 번 더 부릅니다. */
    if (App.RankBadgeAttach && typeof App.RankBadgeAttach.run === "function") {
      try { App.RankBadgeAttach.run(); } catch (e) { /* 무시 */ }
    }
  }

  function load(force) {
    if (isGuest !== true) return Promise.resolve(null);
    if (fetching) return Promise.resolve(rows);
    if (!force && rows && Date.now() - fetchedAt < REFETCH_MS) return Promise.resolve(rows);
    var client = sb();
    if (!client || typeof client.rpc !== "function") return Promise.resolve(null);
    fetching = true;
    return Promise.resolve(client.rpc("get_leaderboard", { limit_count: TOP_N }))
      .then(function (r) {
        fetching = false;
        if (r && r.error) throw r.error;
        rows = (r && r.data) || [];
        fetchedAt = Date.now();
        paint();
        return rows;
      })
      .catch(function (e) {
        fetching = false;
        /* 못 받으면 원본이 넣어둔 문구를 그대로 둡니다 — 가짜 숫자를
           만들지 않습니다. */
        console.warn("[guest-leaderboard.js] 비회원 랭킹 조회 실패:", e);
        return null;
      });
  }

  /* 한 박자 뒤에 한 번만 — 관찰자가 여러 번 울려도 한 번만 처리합니다.
     (관찰자 콜백은 우리가 쓴 직후에도 늦게 도착하므로, 되돌이 방지는
      writing 깃발이 아니라 isBlocked() 판정이 담당합니다.) */
  var pendingForce = false;
  function schedule(force) {
    if (force) pendingForce = true;
    if (timer) return;
    timer = setTimeout(function () {
      timer = null;
      var f = pendingForce;
      pendingForce = false;
      refresh(f);
    }, 0);
  }

  function refresh(force) {
    checkGuest().then(function (guest) {
      if (!guest) return;             /* 로그인 상태면 원본에 맡깁니다 */
      if (rows && isBlocked()) paint();   /* 이미 받아둔 것부터 즉시 채웁니다 */
      /* 다시 받을지는 load() 가 판단합니다(30초 안에는 그대로 씁니다) —
         탭을 빠르게 왔다 갔다 해도 서버를 계속 부르지 않습니다. */
      load(force).then(function () { if (isBlocked()) paint(); });
    });
  }

  /* 랭킹 페이지가 열릴 때마다 다시 봅니다. */
  function watchPage() {
    var page = document.getElementById("page-ranking");
    if (!page || typeof MutationObserver === "undefined") return;
    new MutationObserver(function () {
      if (page.style.display !== "none") schedule(false);
    }).observe(page, { attributes: true, attributeFilter: ["style"] });
  }

  /* 원본이 표를 다시 그리면(= 잠금 문구로 덮으면) 다시 채웁니다. */
  function watchBody() {
    var b = bodyEl();
    if (!b || typeof MutationObserver === "undefined") return;
    new MutationObserver(function () {
      if (writing) return;
      if (isGuest !== true) return;   /* 로그인 화면은 절대 안 건드립니다 */
      if (!isBlocked()) return;       /* 진짜 순위가 있으면 그대로 둡니다 */
      /* 이미 받아둔 행이 있으면 이 자리에서 바로 채웁니다.
         세션 재확인(비동기)을 기다리면 그동안 잠금 문구가 깜빡입니다 —
         실제로 1920px 에서 잠금 문구가 잠깐 보였습니다. */
      if (rows) paint();
      schedule(false);
    }).observe(b, { childList: true });
  }

  function init() {
    if (started) return;
    started = true;
    if (!bodyEl()) return;            /* 마크업이 없으면 조용히 종료 */

    watchBody();
    watchPage();

    if (App.Bus && typeof App.Bus.on === "function") {
      /* 로그인/로그아웃 — 다시 판단합니다.
         로그인하면 checkGuest() 가 false 가 되어 이 모듈은 손을 뗍니다. */
      App.Bus.on("auth:changed", function () { isGuest = null; rows = null; schedule(true); });
      /* 통화(USDT/KRW) 전환 — 원본은 캐시가 없어 비회원 표를 못 고칩니다. */
      App.Bus.on("currency:change", function () { if (isGuest === true && rows) paint(); });
      /* 거래가 저장되면 원본이 표를 다시 그립니다(비회원에겐 잠금 문구) */
      App.Bus.on("trading:persisted", function () { schedule(false); });
    }

    /* 세션 복구에 시간이 걸립니다 — 원본이 그린 뒤에도 확인합니다. */
    refresh(true);
    setTimeout(function () { refresh(false); }, 1200);
    setTimeout(function () { refresh(false); }, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    refresh: refresh,
    paint: paint,
    load: load,
    isBlocked: isBlocked,
    _state: function () { return { isGuest: isGuest, rows: rows }; },
  };
})();
