/* =========================================================================
 * js/table-scroll-hint.js — App.TableScrollHint
 * =========================================================================
 * 랭킹 표가 폰에서 잘려 보이는데 **잘렸다는 신호가 하나도 없던** 문제.
 *
 * ── 무슨 문제였나 (2026-08-21 실측, 비로그인) ────────────────────
 * 랭킹 표는 `.table-scroll{overflow-x:auto}` 안에 있어서 좁은 화면에서는
 * 가로로 밀어야 나머지가 보입니다. 그런데 **밀 수 있다는 표시가 없습니다.**
 *
 *   폭    표 전체  보이는 폭  숨는 양   안 보이는 항목
 *   360    641px    324px    317px   수익률(전부) · 수익금 208px · 총자산 65px
 *   375    641px    339px    302px   수익률(전부) · 수익금 193px · 총자산 50px
 *   390    641px    354px    287px   수익률(전부) · 수익금 178px · 총자산 35px
 *   768    732px    732px      0px   없음
 *  1440   1404px   1404px      0px   없음
 *
 * 360 은 국내에서 가장 흔한 폭인데, 거기서 **수익률이 통째로 안 보입니다.**
 * 회원은 표가 거기서 끝난 줄 압니다 — 화면은 멀쩡해 보이는데 정보가 없는,
 * 조용한 쪽에 가까운 상태입니다.
 *
 * ── 어떻게 고치나 ────────────────────────────────────────────────
 * `js/stats-bar-priority.js` 가 시세 바에 쓴 것과 **같은 방식**입니다.
 *   1) 스크롤 상자를 스크롤되지 않는 바깥 층으로 감쌉니다
 *      (힌트를 상자 '안'에 그리면 내용과 같이 밀려서 소용이 없습니다)
 *   2) 아직 볼 게 남은 쪽 가장자리에만 옅은 그라데이션을 띄웁니다
 *   3) 끝까지 밀면 그 쪽 힌트는 사라집니다 — 그래서 **값을 가리지 않습니다**
 *      (끝까지 민 상태에서만 마지막 칸이 가장자리에 닿는데, 그때는 힌트가 꺼짐)
 *
 * 열을 지우거나 숨기지 않습니다. 신호만 더합니다(원칙 1-2).
 *
 * ── 왜 랭킹 표만인가 ─────────────────────────────────────────────
 * `.table-scroll` 은 거래내역·호가창에서도 씁니다. 그런데 거래내역 쪽은
 * `js/ui.js` 302행(**수정 금지 파일**)이 `.table-scroll` 을 통째로 찾아
 * 갈아끼웁니다. 감싸개를 씌우면 그 교체와 부딪칩니다.
 * 랭킹 표는 index.html 에 고정으로 있고 `js/leaderboard.js` 는
 * `#leaderboard-body`(tbody)만 다시 그리므로 안전합니다.
 * 나중에 거래내역까지 넓히려면 TARGETS 에 추가하되, ui.js 의 교체 시점을
 * 먼저 확인해야 합니다.
 *
 * ── style.css 를 안 건드리는 이유 ────────────────────────────────
 * 디자인팀이 같은 시간에 style.css 를 고치고 있어서, 이 모듈은 자기 CSS 를
 * 스스로 <style> 로 넣습니다. 모듈 파일 하나만 지우면 완전히 사라집니다.
 * ========================================================================= */

window.App = window.App || {};

App.TableScrollHint = (function () {
  "use strict";

  /* 힌트를 붙일 스크롤 상자. 늘리려면 여기에 선택자만 추가합니다. */
  var TARGETS = ["#leaderboard-panel .table-scroll"];

  var LAYER_CLASS = "tl-table-hint-layer";
  var STYLE_ID = "tl-table-hint-style";
  /* 남은 스크롤이 이보다 크면 "더 있다"로 봅니다.
     소수점 반올림 때문에 0 으로 두면 다 밀어도 힌트가 안 꺼질 수 있습니다. */
  var EPS = 2;

  var layers = [];

  /* ---------------- CSS ---------------- */
  /* 색은 확정 팔레트를 그대로 씁니다 — 카드 배경 var(--surface) 로 흐려집니다.
     var 가 없을 때를 대비해 #101727(확정 팔레트 '카드')을 대체값으로 둡니다. */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      "." + LAYER_CLASS + "{position:relative;}" +
      "." + LAYER_CLASS + "::before," +
      "." + LAYER_CLASS + "::after{" +
        "content:\"\";position:absolute;top:0;bottom:0;width:26px;" +
        "pointer-events:none;opacity:0;transition:opacity .2s ease;z-index:2;}" +
      "." + LAYER_CLASS + "::after{right:0;" +
        "background:linear-gradient(to right, rgba(16,23,39,0), var(--surface,#101727));}" +
      "." + LAYER_CLASS + "::before{left:0;" +
        "background:linear-gradient(to left, rgba(16,23,39,0), var(--surface,#101727));}" +
      /* 아직 볼 게 남은 쪽만 켭니다. 끝까지 밀면 꺼져서 값을 안 가립니다. */
      "." + LAYER_CLASS + ".tl-has-next::after{opacity:1;}" +
      "." + LAYER_CLASS + ".tl-has-prev::before{opacity:1;}" +
      /* 시세 바 힌트는 좁은 화면에서 12px 로 얇아집니다. 표는 그렇게 하지
         않습니다 — 이유가 다릅니다.
           시세 바: 힌트가 마크가격을 '영구히' 덮을 수 있어 얇게 해야 했습니다.
           표     : 끝까지 밀면 힌트가 꺼지므로 마지막 열을 영구히 덮지
                   않습니다(실측 겹침 0). 그래서 잘 보이는 폭을 유지합니다.
         360 에서 12px 로 해 봤더니 잘린 숫자("$510,0") 옆에서 너무 옅어
         "옆에 더 있다"가 읽히지 않았습니다. */
      /* 움직임을 줄여달라고 한 회원에게는 전환 효과를 끕니다. */
      "@media (prefers-reduced-motion:reduce){." + LAYER_CLASS + "::before," +
        "." + LAYER_CLASS + "::after{transition:none;}}";
    var el = document.createElement("style");
    el.id = STYLE_ID;
    el.textContent = css;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ---------------- 감싸개 ---------------- */
  function wrap(box) {
    if (!box || !box.parentNode) return null;
    var parent = box.parentNode;
    if (parent.classList && parent.classList.contains(LAYER_CLASS)) return parent; /* 이미 감쌈 */
    var layer = document.createElement("div");
    layer.className = LAYER_CLASS;
    parent.insertBefore(layer, box);
    layer.appendChild(box);
    return layer;
  }

  /* ---------------- 갱신 ---------------- */
  function updateOne(entry) {
    var box = entry.box;
    var layer = entry.layer;
    if (!box || !box.isConnected || !layer) return;

    /* 화면에 안 떠 있으면(랭킹 페이지가 display:none) 폭이 0 이라 판단할 수
       없습니다. 이럴 땐 둘 다 끄고 넘어갑니다 — 켜 둔 채로 두면 페이지를
       열자마자 잘못된 힌트가 잠깐 보입니다. */
    if (!box.offsetParent && box.clientWidth === 0) {
      layer.classList.remove("tl-has-next", "tl-has-prev");
      return;
    }

    var max = box.scrollWidth - box.clientWidth;
    var left = box.scrollLeft;
    layer.classList.toggle("tl-has-next", max - left > EPS);
    layer.classList.toggle("tl-has-prev", left > EPS);
  }

  function update() {
    for (var i = 0; i < layers.length; i++) updateOne(layers[i]);
  }

  /* ---------------- 붙이기 ---------------- */
  function attach(sel) {
    var box = document.querySelector(sel);
    if (!box) return;
    for (var i = 0; i < layers.length; i++) if (layers[i].box === box) return; /* 중복 방지 */
    var layer = wrap(box);
    if (!layer) return;
    var entry = { box: box, layer: layer };
    layers.push(entry);
    box.addEventListener("scroll", function () { updateOne(entry); }, { passive: true });

    /* 표 내용이 바뀌면 열 너비가 달라집니다(랭킹은 tbody 만 다시 그림). */
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function () { updateOne(entry); })
        .observe(box, { childList: true, subtree: true, characterData: true });
    }
    updateOne(entry);
  }

  function init() {
    injectStyle();
    for (var i = 0; i < TARGETS.length; i++) attach(TARGETS[i]);
    if (!layers.length) return;

    window.addEventListener("resize", update);

    /* 랭킹 페이지는 처음에 display:none 입니다. 보이게 되는 순간 다시 재야
       하는데, page-nav.js 가 style 속성을 바꾸는 방식이라 그걸 지켜봅니다. */
    var page = document.getElementById("page-ranking");
    if (page && typeof MutationObserver !== "undefined") {
      new MutationObserver(function () {
        update();
        /* 페이지가 뜨자마자는 아직 표가 그려지는 중일 수 있습니다. */
        setTimeout(update, 60);
        setTimeout(update, 400);
      }).observe(page, { attributes: true, attributeFilter: ["style", "class"] });
    }

    /* 서버에서 순위가 늦게 도착하는 경우까지 덮습니다. */
    setTimeout(update, 1000);
    setTimeout(update, 3000);
  }

  return {
    init: init,
    update: update,
    /* 테스트에서 쓰는 순수 함수 — "더 있나"를 숫자만으로 판단합니다. */
    _decide: function (scrollWidth, clientWidth, scrollLeft) {
      var max = scrollWidth - clientWidth;
      return { next: max - scrollLeft > EPS, prev: scrollLeft > EPS };
    },
    _LAYER_CLASS: LAYER_CLASS,
    _TARGETS: TARGETS
  };
})();
