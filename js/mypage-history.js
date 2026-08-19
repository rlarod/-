/* =========================================================================
 * js/mypage-history.js — App.MypageHistory
 * =========================================================================
 * 마이페이지에 내역과 계정 관리를 붙입니다 (14순위).
 *
 * 지금 마이페이지에는 자산 숫자만 있습니다.
 *   총자산, 잔고, 증거금, 손익, 수수료, 펀딩비, 보유 TL
 *
 * 여기서 더하는 것
 *   TL 내역 (획득/사용)
 *   핫딜 구매 내역
 *   마켓 아이템 보관함
 *   로그아웃 / 회원탈퇴
 *
 * 모두 서버 함수로만 가져옵니다. 없는 값을 지어내지 않고,
 * 내역이 없으면 없다고 그대로 씁니다.
 *
 * js/mypage.js 는 자산 숫자를 담당합니다 — 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.MypageHistory = (function () {
  "use strict";

  var loaded = false;

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  function el(id) { return document.getElementById(id); }

  function fmtTime(v) {
    if (!v) return "-";
    try {
      var d = new Date(v);
      return String(d.getMonth() + 1).padStart(2, "0") + "." +
             String(d.getDate()).padStart(2, "0") + " " +
             String(d.getHours()).padStart(2, "0") + ":" +
             String(d.getMinutes()).padStart(2, "0");
    } catch (e) { return "-"; }
  }

  function fmtTL(n) {
    var v = Number(n) || 0;
    var sign = v > 0 ? "+" : "";
    return sign + Math.round(v).toLocaleString() + " TL";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function empty(msg) {
    return '<p class="mh-empty">' + esc(msg) + "</p>";
  }

  function table(headers, rows) {
    if (!rows.length) return null;
    return '<table class="mh-table"><thead><tr>' +
      headers.map(function (h) { return "<th>" + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.join("") +
      "</tbody></table>";
  }

  /* ---------------- TL 내역 ---------------- */
  function renderTL(rows) {
    var box = el("mh-tl");
    if (!box) return;
    if (!rows || !rows.length) { box.innerHTML = empty("TL 내역이 없습니다."); return; }
    var body = rows.map(function (r) {
      var amt = Number(r["금액"]) || 0;
      var cls = amt < 0 ? "mh-minus" : "mh-plus";
      return "<tr><td>" + fmtTime(r["발생시각"]) + "</td>" +
             "<td>" + esc(r["구분"]) + "</td>" +
             '<td class="' + cls + '">' + fmtTL(amt) + "</td>" +
             "<td>" + esc(r["사유"]) + "</td></tr>";
    });
    box.innerHTML = table(["시각", "구분", "금액", "사유"], body) || empty("TL 내역이 없습니다.");
  }

  /* ---------------- 핫딜 구매 내역 ---------------- */
  function renderHotdeal(rows) {
    var box = el("mh-hotdeal");
    if (!box) return;
    if (!rows || !rows.length) { box.innerHTML = empty("핫딜 구매 내역이 없습니다."); return; }
    var body = rows.map(function (r) {
      return "<tr><td>" + fmtTime(r["구매시각"]) + "</td>" +
             "<td>" + esc(r["브랜드"]) + " " + esc(r["상품명"]) + "</td>" +
             "<td>" + (Number(r["수량"]) || 1) + "개</td>" +
             '<td class="mh-minus">' + Math.round(Number(r["사용TL"]) || 0).toLocaleString() + " TL</td>" +
             "<td>" + esc(r["상태"]) + "</td></tr>";
    });
    box.innerHTML = table(["시각", "상품", "수량", "사용 TL", "상태"], body) ||
                    empty("핫딜 구매 내역이 없습니다.");
  }

  /* ---------------- 마켓 보관함 ---------------- */
  function renderMarket(rows) {
    var box = el("mh-market");
    if (!box) return;
    if (!rows || !rows.length) { box.innerHTML = empty("보유한 아이템이 없습니다."); return; }
    var body = rows.map(function (r) {
      return "<tr><td>" + fmtTime(r["구매시각"]) + "</td>" +
             "<td>" + esc(r["아이템"]) + "</td>" +
             "<td>" + (Number(r["수량"]) || 1) + "개</td>" +
             "<td>" + esc(r["상태"]) + "</td>" +
             "<td>" + (r["마지막사용"] ? fmtTime(r["마지막사용"]) : "-") + "</td></tr>";
    });
    box.innerHTML = table(["구매", "아이템", "수량", "상태", "마지막 사용"], body) ||
                    empty("보유한 아이템이 없습니다.");
  }

  /* ---------------- 불러오기 ---------------- */
  function loadOne(client, fn, render, label) {
    return Promise.resolve(client.rpc(fn, { limit_count: 50 }))
      .then(function (r) {
        if (r && r.error) throw r.error;
        render(r && r.data);
      })
      .catch(function (e) {
        console.warn("[mypage-history.js] " + label + " 조회 실패:", e);
        render(null);
      });
  }

  function load() {
    var client = sb();
    if (!client) return Promise.resolve();
    loaded = true;
    return Promise.all([
      loadOne(client, "my_tl_history", renderTL, "TL 내역"),
      loadOne(client, "my_hotdeal_purchases", renderHotdeal, "핫딜 구매"),
      loadOne(client, "my_market_items", renderMarket, "마켓 보관함"),
    ]);
  }

  /* ---------------- 회원탈퇴 ---------------- */
  function bindDelete() {
    var btn = el("mh-delete-account");
    if (!btn || btn.getAttribute("data-bound")) return;
    btn.setAttribute("data-bound", "1");

    btn.addEventListener("click", async function () {
      var nick = App.Auth && App.Auth.getNickname ? App.Auth.getNickname() : "";
      if (!nick) { alert("로그인 후 이용할 수 있습니다."); return; }

      /* 되돌릴 수 없으므로 닉네임을 직접 입력하게 합니다. */
      var typed = prompt(
        "회원탈퇴는 되돌릴 수 없습니다.\n\n" +
        "거래 기록, 보유 TL, 구매 내역, 작성한 글이 모두 삭제됩니다.\n" +
        "핫딜로 받은 상품권도 확인할 수 없게 됩니다.\n\n" +
        "정말 탈퇴하시려면 닉네임을 그대로 입력해주세요: " + nick
      );
      if (typed === null) return;
      if (String(typed).trim() !== String(nick).trim()) {
        alert("닉네임이 일치하지 않습니다. 탈퇴를 취소했습니다.");
        return;
      }

      var client = sb();
      if (!client) { alert("서버에 연결할 수 없습니다."); return; }

      btn.disabled = true;
      try {
        var r = await client.rpc("delete_my_account");
        var d = r && r.data;
        if (r && r.error) throw r.error;
        if (!d || d.ok !== true) {
          var msg = d && d.error === "admin_cannot_delete"
            ? "관리자 계정은 탈퇴할 수 없습니다."
            : "탈퇴에 실패했습니다: " + ((d && d.error) || "알 수 없는 오류");
          alert(msg);
          btn.disabled = false;
          return;
        }
        if (App.Storage) App.Storage.clear("trading");
        alert("탈퇴가 완료되었습니다. 그동안 이용해주셔서 감사합니다.");
        try { await client.auth.signOut(); } catch (e) { /* 무시 */ }
        window.location.reload();
      } catch (e) {
        console.warn("[mypage-history.js] 탈퇴 실패:", e);
        alert("탈퇴 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        btn.disabled = false;
      }
    });
  }

  /* ---------------- 로그아웃 ---------------- */
  function bindLogout() {
    var btn = el("mh-logout");
    if (!btn || btn.getAttribute("data-bound")) return;
    btn.setAttribute("data-bound", "1");
    btn.addEventListener("click", function () {
      /* 기존 로그아웃 버튼이 있으면 그대로 씁니다(같은 처리를 두 벌 만들지 않습니다). */
      var original = document.getElementById("user-panel-logout") ||
                     document.querySelector(".up-nav-btn-logout");
      if (original) { original.click(); return; }
      var client = sb();
      if (client) client.auth.signOut().finally(function () { window.location.reload(); });
    });
  }

  function init() {
    if (!el("mh-tl")) return;
    bindDelete();
    bindLogout();

    var nav = el("page-nav-mypage");
    if (nav) nav.addEventListener("click", function () { if (!loaded) load(); });

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", function () { loaded = false; });
      /* 거래나 구매가 끝나면 내역이 바뀌므로 다음에 열 때 다시 받습니다. */
      App.Bus.on("trading:persisted", function () { loaded = false; });
    }

    /* 마이페이지가 이미 열려 있으면 바로 불러옵니다. */
    var page = el("page-mypage");
    if (page && getComputedStyle(page).display !== "none") load();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, load: load, renderTL: renderTL, renderHotdeal: renderHotdeal, renderMarket: renderMarket };
})();
