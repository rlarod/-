/* =========================================================================
 * js/my-private-info.js — App.MyPrivateInfo
 * =========================================================================
 * 마이페이지에 '내 계정 정보' 를 보여줍니다.
 *
 * 무엇을 보여주나
 *   로그인 방식(카카오/네이버/전화번호/닉네임), 이메일,
 *   전화번호(가려서), 인증 여부, 가입일
 *
 * 전화번호는 서버에서 이미 010-****-5678 형태로 가려서 옵니다.
 * 전체 번호는 화면으로 내려오지 않습니다 — 본인이라도 마찬가지입니다.
 * (전체가 필요한 상황이 아직 없고, 화면에 있으면 새어나갈 길만 늘어납니다)
 *
 * 아직 정보가 없으면(닉네임+비밀번호로만 가입한 기존 회원) 그 사실을
 * 그대로 알립니다. 없는 값을 지어내지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.MyPrivateInfo = (function () {
  "use strict";

  var BOX_ID = "my-private-info";
  var loaded = false;

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  function providerLabel(p) {
    switch (String(p || "")) {
      case "kakao": return "카카오";
      case "naver": return "네이버";
      case "phone": return "전화번호";
      case "password": return "닉네임 + 비밀번호";
      default: return p ? p : "닉네임 + 비밀번호";
    }
  }

  function fmtDate(v) {
    if (!v) return "-";
    try {
      var d = new Date(v);
      return d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") +
             "." + String(d.getDate()).padStart(2, "0");
    } catch (e) {
      return "-";
    }
  }

  function row(label, value) {
    return '<div class="mpi-row"><span class="mpi-label">' + label +
           '</span><span class="mpi-value">' + value + "</span></div>";
  }

  function render(info) {
    var box = document.getElementById(BOX_ID);
    if (!box) return;

    if (!info || info.logged_in !== true) {
      box.innerHTML = '<p class="mpi-empty">로그인 후 확인할 수 있습니다.</p>';
      return;
    }

    if (info.has_info !== true) {
      /* 소셜 로그인 전에 가입한 회원은 아직 개인정보가 없습니다.
         없는 값을 지어내지 않고 그대로 알립니다. */
      box.innerHTML =
        row("로그인 방식", "닉네임 + 비밀번호") +
        '<p class="mpi-empty">연락처 정보가 등록되어 있지 않습니다.</p>';
      return;
    }

    var html = row("로그인 방식", providerLabel(info.provider));
    if (info.email) html += row("이메일", info.email);
    if (info.phone_masked) {
      html += row("전화번호", info.phone_masked +
        (info.phone_verified ? ' <span class="mpi-ok">인증됨</span>' : ' <span class="mpi-no">미인증</span>'));
    }
    html += row("가입일", fmtDate(info.created_at));
    box.innerHTML = html;
  }

  function load() {
    var client = sb();
    if (!client) { render(null); return Promise.resolve(null); }
    return Promise.resolve(client.rpc("my_private_info"))
      .then(function (r) {
        loaded = true;
        render(r && r.data);
        return r && r.data;
      })
      .catch(function (e) {
        console.warn("[my-private-info.js] 계정 정보 조회 실패:", e);
        var box = document.getElementById(BOX_ID);
        if (box) box.innerHTML = '<p class="mpi-empty">계정 정보를 불러오지 못했습니다.</p>';
        return null;
      });
  }

  function init() {
    if (!document.getElementById(BOX_ID)) return;
    load();
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", function () { loaded = false; load(); });
    }
    /* 마이페이지를 열 때 아직 안 불러왔으면 불러옵니다. */
    var nav = document.getElementById("page-nav-mypage");
    if (nav) nav.addEventListener("click", function () { if (!loaded) load(); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, load: load, render: render, providerLabel: providerLabel };
})();
