/* =========================================================================
 * js/tl-brand.js — App.TLBrand
 * =========================================================================
 * TL 브랜드 적용 중 "값"이 필요한 부분만 담당합니다.
 *
 *  - 마이페이지 "TL 잔액" 채우기
 *    새 숫자를 만들지 않습니다. 우측 내 정보 패널이 이미 쓰고 있는
 *    App.Rank.getUserRank().points 를 그대로 같은 단위로 보여줍니다.
 *    (계급 점수 = TL. 청산 거래 수와 실현 수익률로 rank.js 가 계산하는 실제 값)
 *
 *  - 로고 이미지가 없을 때의 대비
 *    파일을 못 불러오면 헤더가 비어 보이므로, 원래 텍스트 브랜드를
 *    되살려 "TL / TRADING LEAGUE"를 글자로 보여줍니다(빈 헤더 방지).
 *
 * 수정 금지 파일은 건드리지 않고 DOM 만 다룹니다.
 * ========================================================================= */

window.App = window.App || {};

App.TLBrand = (function () {
  "use strict";

  var REFRESH_INTERVAL_MS = 1000;
  var timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  /* 마이페이지 TL 잔액 — 우측 패널과 같은 출처, 같은 표기 */
  function renderTlBalance() {
    var node = el("mypage-tl");
    if (!node) return;
    if (!App.Rank || typeof App.Rank.getUserRank !== "function") {
      node.textContent = "-";
      return;
    }
    var r;
    try {
      r = App.Rank.getUserRank();
    } catch (e) {
      node.textContent = "-";
      return;
    }
    node.textContent =
      r && typeof r.points === "number" ? Math.round(r.points).toLocaleString() + " TL" : "-";
  }

  /* 로고를 못 불러왔을 때만 글자 브랜드로 대체합니다. */
  function guardLogo() {
    var brand = document.getElementById("brand-home");
    if (!brand) return;
    var imgs = brand.querySelectorAll("img");
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener("error", function () {
        if (brand.querySelector(".brand-text")) return;
        Array.prototype.forEach.call(brand.querySelectorAll("img"), function (i) {
          i.style.display = "none";
        });
        var text = document.createElement("div");
        text.className = "brand-text";
        text.innerHTML =
          '<div class="name">TL</div><div class="brand-tagline">TRADING LEAGUE · 모의투자 트레이딩 리그</div>';
        brand.appendChild(text);
        console.warn("[tl-brand.js] 로고 이미지를 불러오지 못해 글자 브랜드로 대체했습니다.");
      });
    });
  }

  /* 배너 이미지를 못 불러오면 기존 문구 소재로 되돌립니다(빈 배너 방지). */
  function guardBanner() {
    var imgs = document.querySelectorAll(".ad-creative-image .ad-banner-img");
    if (!imgs.length) return;
    Array.prototype.forEach.call(imgs, function (img) {
      img.addEventListener("error", function () {
        var box = img.closest(".ad-creative-image");
        if (box) box.classList.add("ad-banner-failed");
        console.warn("[tl-brand.js] 배너 이미지를 불러오지 못해 문구 소재로 대체했습니다.");
      });
    });
  }

  function init() {
    guardLogo();
    guardBanner();
    renderTlBalance();
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("trading:update", renderTlBalance);
      App.Bus.on("rank:ready", renderTlBalance);
    }
    timer = setInterval(renderTlBalance, REFRESH_INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { init: init, renderTlBalance: renderTlBalance };
})();
