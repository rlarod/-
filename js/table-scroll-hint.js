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
 * ── 어디에 붙나 (2026-08-24 넓힘) ────────────────────────────────
 * 처음에는 랭킹 표에만 붙였습니다. 2026-08-24 에 하단 탭의
 * **마감손익 · 주문내역 · 자산(펀딩 정산 내역)** 표까지 넓혔습니다
 * (360 에서 마감손익이 433px, 주문내역이 97px 숨는데 신호가 없었습니다).
 *
 * 처음에 "거래내역 쪽은 js/ui.js 가 .table-scroll 을 갈아끼우니 위험하다"고
 * 적었는데 **오해였습니다.** ui.js buildTabbedPanel 은 갈아끼우지 않고
 * appendChild 로 **옮기기만** 하고(주석에도 "복제 아님"이라고 적혀 있습니다),
 * 그 이동은 UI.init() 한 번뿐입니다. 이 모듈은 그 뒤에 붙습니다(LATE_TARGETS).
 * 만약 나중에 또 옮겨져도 attach() 가 감싸개 밖으로 빠진 것을 알아보고
 * 다시 감쌉니다. ui.js 는 한 글자도 고치지 않았습니다.
 *
 * 덤으로, 표가 비었을 때 나오는 안내문("거래 내역이 없습니다.")이 표 전체 폭
 * 기준으로 가운데 정렬돼 360 에서 화면 밖으로 밀리던 것도 같이 맞췄습니다
 * (centerEmptyRow).
 *
 * ── style.css 를 안 건드리는 이유 ────────────────────────────────
 * 디자인팀이 같은 시간에 style.css 를 고치고 있어서, 이 모듈은 자기 CSS 를
 * 스스로 <style> 로 넣습니다. 모듈 파일 하나만 지우면 완전히 사라집니다.
 * ========================================================================= */

window.App = window.App || {};

App.TableScrollHint = (function () {
  "use strict";

  /* 힌트를 붙일 스크롤 상자. 늘리려면 여기에 선택자만 추가합니다.
     처음부터 index.html 에 있는 것들 — 부팅 때 바로 붙입니다. */
  var TARGETS = ["#leaderboard-panel .table-scroll"];

  /* 늦게 생기는 것들 — js/ui.js 가 하단 탭(포지션/미체결/주문내역/마감손익/자산)을
     만든 뒤에야 존재합니다. main.js 의 초기화 순서상 이 모듈이 UI 보다 먼저
     돌기 때문에, 여기 것들은 UI 가 만든 다음에 다시 붙입니다(아래 attachAll).

     2026-08-24 실측 (360x800, 비로그인) — 붙이기 전
       마감손익  보이는 폭 342 / 내용 폭 775 → 433px 숨음, 신호 없음
                (진입가까지만 보이고 종료가·증거금·손익·수익률·수수료가 화면 밖)
       주문내역  보이는 폭 342 / 내용 폭 439 →  97px 숨음, 신호 없음

     ⚠ 위 파일 머리말에 "거래내역 쪽은 ui.js 가 .table-scroll 을 갈아끼워서
     위험하다"고 적어 뒀는데, 실제 코드(js/ui.js buildTabbedPanel)를 다시 읽어
     보니 **갈아끼우는 게 아니라 appendChild 로 옮기기만** 합니다. 게다가 그
     이동은 UI.init() 한 번뿐이고 이 모듈은 그 뒤에 붙으므로 부딪히지 않습니다.
     혹시 나중에 다시 옮겨지더라도 attach() 가 감싸개 밖으로 빠진 것을 보고
     다시 감쌉니다. */
  var LATE_TARGETS = [
    "#tab-panel-history .table-scroll",   /* 마감손익 */
    "#tab-panel-orders .table-scroll",    /* 주문내역 */
    "#tab-panel-assets .table-scroll"     /* 자산 — 펀딩 정산 내역 */
  ];

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
    centerEmptyRow(box);
  }

  /* ---------------- 빈 표 안내문 ----------------
   * 표가 비었을 때 나오는 한 줄(예: "거래 내역이 없습니다.")은 colspan 셀이라
   * **표 전체 폭(775px)** 기준으로 가운데 정렬됩니다. 보이는 폭이 342px 뿐인
   * 360 화면에서는 글자가 387px 지점에 놓여 오른쪽 끝에 "거래 " 조각만
   * 보였습니다.
   *
   * 셀의 오른쪽 안쪽 여백을 "숨는 양"만큼 주면, 글자가 놓이는 칸이
   * 보이는 폭과 같아져 **보이는 화면 기준으로 가운데**에 옵니다.
   * 글자를 바꾸거나 줄이지 않고 여백만 씁니다.
   *
   * 표가 다시 그려지면 이 여백은 사라지지만, 아래 MutationObserver 가
   * updateOne 을 다시 불러서 도로 맞춥니다. */
  function centerEmptyRow(box) {
    var td = box.querySelector("tr.empty > td");
    if (!td) return;
    if (!box.clientWidth) return;
    var over = box.scrollWidth - box.clientWidth;
    var want = over > EPS ? over + "px" : "";
    /* 값이 같으면 아예 쓰지 않습니다 — 같은 값을 다시 써도 "바뀌었다"로
       잡히는 감시자가 있어서, 그러면 되풀이가 생깁니다. */
    if (td.style.paddingRight !== want) td.style.paddingRight = want;
  }

  function update() {
    for (var i = 0; i < layers.length; i++) updateOne(layers[i]);
  }

  /* ---------------- 붙이기 ---------------- */
  function attach(sel) {
    var box = document.querySelector(sel);
    if (!box) return;
    for (var i = 0; i < layers.length; i++) {
      if (layers[i].box !== box) continue;
      /* 이미 감싼 상자입니다. 감싸개 안에 그대로 있으면 할 일이 없습니다. */
      if (box.parentNode === layers[i].layer) return;
      /* 누군가 상자를 감싸개 밖으로 옮겼으면 다시 감싸기만 합니다
         (표를 새로 만들지 않습니다 — 같은 DOM 노드 그대로입니다). */
      var again = wrap(box);
      if (again) { layers[i].layer = again; updateOne(layers[i]); }
      return;
    }
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

  /* 지금 화면에 있는 대상 전부에 붙입니다. 여러 번 불러도 안전합니다. */
  function attachAll() {
    var i;
    for (i = 0; i < TARGETS.length; i++) attach(TARGETS[i]);
    for (i = 0; i < LATE_TARGETS.length; i++) attach(LATE_TARGETS[i]);
    update();
  }

  function init() {
    injectStyle();
    attachAll();

    window.addEventListener("resize", update);

    /* 하단 탭 — js/ui.js 가 만든 뒤에 붙여야 합니다(이 모듈이 먼저 돕니다).
       또 탭은 처음에 display:none 이라 폭이 0 이고, 보이게 된 다음에야
       "얼마나 숨었는지"를 잴 수 있습니다. 그래서 탭이 바뀔 때마다 다시 잽니다. */
    var historyPanel = document.querySelector(".history-panel");
    if (historyPanel && typeof MutationObserver !== "undefined") {
      /* ⚠ style 은 감시하지 않습니다. 빈 안내문 가운데 맞춤이 td 의 style 을
         쓰는데, 그걸 감시하면 "고침 → 감지 → 다시 고침" 이 끝없이 돕니다.
         탭 전환은 class 로 일어나므로 class + 내용 변화만 봅니다.
         또 시세가 바뀔 때마다 표가 다시 그려지므로 80ms 로 묶어서 한 번만
         처리합니다(그냥 두면 초당 수십 번 다시 잽니다). */
      var pending = null;
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () {
          pending = null;
          attachAll();
        }, 80);
      }).observe(historyPanel, {
        childList: true, subtree: true, attributes: true, attributeFilter: ["class"]
      });
    }
    /* ui.js 가 탭을 만드는 시점을 놓치지 않도록 몇 번 더 시도합니다. */
    setTimeout(attachAll, 0);
    setTimeout(attachAll, 300);
    setTimeout(attachAll, 1200);
    setTimeout(attachAll, 3000);

    if (!layers.length) return;

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
    _TARGETS: TARGETS,
    _LATE_TARGETS: LATE_TARGETS,
    _attachAll: attachAll
  };
})();
