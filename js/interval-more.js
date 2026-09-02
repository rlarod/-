/* =========================================================================
 * js/interval-more.js — App.IntervalMore
 * =========================================================================
 * 시간 단위 버튼 줄의 "더보기" 메뉴입니다.
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────────
 * 2026-09-02 에 시간 단위를 9개 -> 16개로 늘렸습니다(js/config.js).
 * 그런데 버튼을 다 늘어놓으면 좁은 폰에서 줄이 터집니다.
 *
 *   실측 (수정 전, .interval-row 높이)
 *     360 / 375 / 390  : 보이는 버튼 6개 · 2줄 · 94px
 *     768 / 1440 / 1920: 보이는 버튼 6개 · 1줄 · 44px
 *   버튼 13개를 그대로 늘어놓으면 360 에서 4~5줄이 되어 차트를 밀어냅니다.
 *
 * ★글씨를 줄여서 해결하지 않습니다.★ 대표가 작은 글씨를 못 읽습니다
 * (팝업 글씨를 키우는 데 세 번 지시가 있었던 이력이 있습니다).
 * 이 파일의 글씨는 .interval-btn 과 똑같은 20.5px 입니다.
 *
 * ── 어떻게 푸나 (트레이딩뷰 방식) ──────────────────────────────────────
 * 트레이딩뷰도 간격 버튼을 다 늘어놓지 않습니다. 자주 쓰는 몇 개만 밖에
 * 두고 나머지는 메뉴 안입니다. 우리도 같습니다.
 *
 *   밖에 그대로   1분 · 5분 · 15분 · 1시간 · 4시간 · 1일        (수정 전과 동일)
 *   더보기 안     3분 · 30분 · 2시간 · 6시간 · 8시간 · 12시간 · 3일 · 1주 · 1개월
 *                 (8시간 · 3일은 2026-09-03 에 추가 — 바이낸스에 있는 간격입니다)
 *
 * 즉 ★수정 전 화면의 버튼 줄 높이가 늘지 않습니다.★ 늘어난 것은 "더보기"
 * 버튼 하나뿐이고, 그것도 기존 줄 안에 들어갑니다.
 *
 * ── 지우지 않고 가립니다 ───────────────────────────────────────────────
 * 더보기로 옮긴 7개도 js/chart.js 가 만든 <button> 이 DOM 에 그대로
 * 남아 있습니다. CSS 로 가릴 뿐입니다(프로젝트 규칙: 마크업 보존).
 * 밖으로 꺼내고 싶으면 아래 MORE 목록에서 빼기만 하면 됩니다.
 *
 * ── 수정 금지 파일을 건드리지 않습니다 ─────────────────────────────────
 * 버튼 줄을 만드는 것은 js/chart.js:130 renderIntervalButtons() 이고,
 * 그 파일은 수정 금지 12개에 들어 있습니다. 그래서 이 파일은
 * ★DOM 후처리 + MutationObserver★ 우회 패턴을 씁니다
 * (docs/인계문서.md 1-1). js/chart.js 는 버튼을 누를 때마다 줄의
 * innerHTML 을 통째로 새로 쓰기 때문에, 그때마다 우리 것을 다시 얹습니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/interval-more.js"></script> 한 줄 삭제
 *   2) js/config.js 의 INTERVALS 에서 2026-09-02 에 추가한 7줄 삭제
 *   1)만 지우면 16개가 전부 버튼으로 나옵니다(폰에서 줄이 터집니다).
 *   실행 중에 잠깐 끄려면 콘솔에서 App.IntervalMore.disable().
 * ========================================================================= */

window.App = window.App || {};

App.IntervalMore = (function () {
  "use strict";

  /* 더보기 안으로 넣을 간격. 여기 없는 것은 지금처럼 버튼으로 남습니다.
     ⚠ "1M" 은 대문자입니다(1개월). 소문자 "1m" 은 1분이라 밖에 남습니다. */
  var MORE = ["3m", "30m", "2h", "6h", "8h", "12h", "3d", "1w", "1M"];

  var ROW_ID = "interval-row";
  var STYLE_ID = "tl-interval-more-css";
  var WRAP_CLASS = "tl-im-wrap";
  var BTN_CLASS = "tl-im-btn";
  var MENU_CLASS = "tl-im-menu";

  /* 확정 팔레트만 씁니다 (새 색을 만들지 않습니다) */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  /* 화면 가장자리에서 띄우는 여백. 아래쪽은 폰 주문 막대까지 같이 뺍니다
     (js/chart-drawings.js 의 CHIP_EDGE / chipFloorY 와 같은 값·같은 방식). */
  var EDGE = 8;

  var wrap = null;
  var menu = null;
  var btn = null;
  var observer = null;
  var painting = false;
  var off = false;
  var docBound = false;

  function row() {
    return document.getElementById(ROW_ID);
  }

  function inMore(v) {
    for (var i = 0; i < MORE.length; i++) if (MORE[i] === v) return true;
    return false;
  }

  function activeNow() {
    try {
      if (App.Config && typeof App.Config.getActiveInterval === "function") {
        return App.Config.getActiveInterval();
      }
    } catch (e) {
      /* 무시 */
    }
    return null;
  }

  function labelOf(v) {
    try {
      var list = App.Config.getIntervals();
      for (var i = 0; i < list.length; i++) if (list[i].value === v) return list[i].label;
    } catch (e) {
      /* 무시 */
    }
    return v;
  }

  /* =====================================================================
   * CSS — 글씨 크기는 .interval-btn 과 똑같이 20.5px 입니다 (안 줄입니다)
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    /* 더보기로 옮긴 것은 버튼 줄에서 가립니다(마크업은 그대로 둡니다).
       ⚠ 속성값은 대소문자를 구분합니다 — "1M"(1개월) 과 "1m"(1분)이 다릅니다. */
    var hide = [];
    for (var i = 0; i < MORE.length; i++) {
      hide.push("#" + ROW_ID + ' .interval-btn[data-interval="' + MORE[i] + '"]');
    }
    var css =
      hide.join(",") + "{display:none !important;}" +
      "." + WRAP_CLASS + "{position:relative;display:inline-flex;}" +
      "." + BTN_CLASS + "{background:" + C_TILE + ";border:1px solid " + C_BORDER + ";" +
      "color:" + C_MUTED + ";padding:6px 12px;border-radius:3px;" +
      "font-family:var(--mono);font-size:20.5px;font-weight:600;cursor:pointer;transition:.12s;}" +
      "." + BTN_CLASS + ":hover{border-color:" + C_MUTED + ";color:" + C_TEXT + ";}" +
      "." + BTN_CLASS + '[aria-expanded="true"]{border-color:' + C_MUTED + ";color:" + C_TEXT + ";}" +
      "." + BTN_CLASS + ".on{background:rgba(240,180,41,.12);border-color:" + C_POINT + ";" +
      "color:" + C_POINT + ";}" +
      "." + MENU_CLASS + "{position:absolute;left:0;top:calc(100% + 4px);z-index:60;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "padding:6px;display:flex;flex-wrap:wrap;gap:6px;width:236px;max-width:calc(100vw - 24px);" +
      /* ★안에서 스크롤★ — 아래 clampMenu() 가 바닥 기준으로 max-height 를 걸 때만
         실제로 동작합니다. 평소에는 내용만큼 커서 스크롤막대가 안 보입니다.
         글씨를 줄이는 대신 이걸 씁니다 (js/chart-timezone.js 와 같은 방식). */
      "overflow-y:auto;overscroll-behavior:contain;}" +
      "." + MENU_CLASS + " button{flex:1 1 106px;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";padding:9px 6px;border-radius:6px;" +
      "font-family:var(--mono);font-size:20.5px;font-weight:600;cursor:pointer;white-space:nowrap;}" +
      "." + MENU_CLASS + " button:hover{border-color:" + C_MUTED + ";}" +
      "." + MENU_CLASS + " button.on{background:rgba(240,180,41,.12);border-color:" + C_POINT + ";" +
      "color:" + C_POINT + ";}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* =====================================================================
   * 메뉴 열고 닫기
   * ===================================================================== */
  function isOpen() {
    return !!(menu && menu.parentNode);
  }

  function closeMenu() {
    if (menu && menu.parentNode) menu.parentNode.removeChild(menu);
    menu = null;
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!wrap || isOpen()) return;
    injectStyle();
    menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "시간 단위 더보기");
    var cur = activeNow();
    for (var i = 0; i < MORE.length; i++) {
      (function (v) {
        var b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "menuitem");
        b.setAttribute("data-im", v);
        b.textContent = labelOf(v);
        if (v === cur) b.className = "on";
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          pick(v);
        });
        menu.appendChild(b);
      })(MORE[i]);
    }
    wrap.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    clampMenu();
  }

  /* 메뉴를 화면 안으로 넣습니다. 둘 다 실제로 넘쳤던 것을 재서 고친 것입니다.
       가로 — 360px 에서 더보기 버튼이 줄 오른쪽에 있어 메뉴가 화면 밖으로
              ★28px★ 나갔습니다. 페이지에 가로 스크롤이 생겼습니다.
       세로 — 768px 에서 메뉴 아래끝이 화면 아래 ★59px★ 밖이라 마지막 항목
              "1개월" 이 접힌 자리에 있었습니다. 회원이 있는 줄도 모릅니다.
     ⚠ 당기다가 반대쪽으로 나가지 않게 8px 에서 멈춥니다. */
  /* 메뉴가 넘어가면 안 되는 ★아래쪽 바닥★ 입니다.
     화면 아래끝(vh-8)만 보면 안 됩니다 — 폰에서는 그 위에 하단 매수/매도 바
     (.tl-order-bar)가 겹쳐 떠 있어서, 화면 안이어도 막대에 가려 안 보입니다.
     실측 (수정 전) — 360x800 에서 메뉴 아래끝이 vh-8 은 안 넘었는데
     막대 기준으로는 ★+10px★ 넘어 7줄 중 1줄이 막대에 걸렸습니다.
     360x640 처럼 짧은 화면에서는 ★+70px★, 7줄 중 ★4줄만★ 보였습니다.

     그 막대는 폰에서만 나옵니다(디자인팀 CSS 의 @media max-width:700px).
     768 이상에는 아예 없고, 전체화면일 때는 화면에 안 그려지므로 세지
     않습니다. js/chart-drawings.js 의 chipFloorY() 와 같은 방식입니다. */
  function menuFloorY() {
    var lim = (document.documentElement.clientHeight || window.innerHeight || 0) - EDGE;
    if (document.fullscreenElement || document.webkitFullscreenElement) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim; /* 768 이상엔 없습니다 */
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - EDGE < lim) lim = r.top - EDGE;
    return lim;
  }

  function clampMenu() {
    if (!isOpen()) return;
    try {
      /* 가로 */
      menu.style.left = "0px";
      var vw = document.documentElement.clientWidth;
      var r = menu.getBoundingClientRect();
      var shift = 0;
      if (r.right > vw - 8) shift = (vw - 8) - r.right;
      if (r.left + shift < 8) shift = 8 - r.left;
      if (shift) menu.style.left = Math.round(shift) + "px";

      /* 세로 — 아래로 넘치고 위에 자리가 있으면 버튼 ★위쪽★ 으로 뒤집어 엽니다
         (트레이딩뷰도 화면 끝에서 이렇게 뒤집습니다)
         ⚠ 기준이 vh-8 이 아니라 ★menuFloorY()★ 입니다. 자세한 것은 그 함수 주석. */
      menu.style.top = "";
      menu.style.bottom = "";
      var floorY = menuFloorY();

      /* ★먼저 키를 쓸 수 있는 만큼으로 맞춥니다★ (2026-09-03 추가).
         이걸 안 하면 메뉴가 화면보다 크면 위로 뒤집든 바닥에 붙이든 어느 한쪽이
         반드시 잘리고, 이 메뉴는 스크롤이 없어서 ★회원이 그 줄을 꺼낼 방법이
         없습니다★ (시간대 창이 실제로 그랬습니다).
         실측 — 8시간·3일을 넣어 7줄→9줄(232px→288px)이 되자 360x640 에서
         남는 여유가 위 23px · 아래 0px 까지 줄었습니다. 지금은 안 잘리지만
         한 줄만 더 늘면 바로 잘립니다. 그래서 미리 안전망을 답니다.
         ⚠ 글씨는 한 픽셀도 안 줄입니다 — 안에서 스크롤할 뿐입니다. */
      menu.style.maxHeight = "";
      var 쓸수있는키 = floorY - EDGE;
      if (쓸수있는키 > 0 && menu.getBoundingClientRect().height > 쓸수있는키) {
        menu.style.maxHeight = Math.round(쓸수있는키) + "px";
      }

      var br = btn.getBoundingClientRect();
      var r2 = menu.getBoundingClientRect();
      if (r2.bottom > floorY) {
        if (br.top - r2.height - 4 >= EDGE) {
          /* 위로 뒤집습니다 */
          menu.style.top = "auto";
          menu.style.bottom = "calc(100% + 4px)";
        } else {
          /* 위아래 둘 다 모자랍니다 — 바닥(floorY)에 붙여 끌어올립니다.
             ★막는 차례는 위 → 아래 → EDGE★ 이고 ★마지막이 wrap 위끝이
             아니라 EDGE★ 인 것이 핵심입니다. wrap 기준으로 막으면 버튼이
             화면 아래쪽에 있을 때 메뉴가 그 자리에 갇혀 다시 주문 막대에
             걸립니다(그게 원래 증상이었습니다). */
          var wr = wrap.getBoundingClientRect();
          var want = floorY - r2.height;
          if (want < EDGE) want = EDGE;
          menu.style.top = Math.round(want - wr.top) + "px";
        }
      }
    } catch (e) {
      /* 무시 — 못 재면 원래 자리 그대로 둡니다 */
    }
  }

  function toggleMenu() {
    if (isOpen()) closeMenu();
    else openMenu();
  }

  /* 고른 간격을 실제로 적용합니다.
     js/chart.js 의 버튼 손잡이와 같은 함수를 부릅니다 — 차트 히스토리 다시
     읽기(chart.js:262)와 WS 재구독(websocket.js:244)이 여기에 달려 있습니다. */
  function pick(v) {
    closeMenu();
    try {
      if (App.Config && typeof App.Config.setActiveInterval === "function") {
        App.Config.setActiveInterval(v);
      }
    } catch (e) {
      /* 무시 */
    }
    paint();
  }

  /* =====================================================================
   * 버튼 줄에 우리 것을 얹습니다 (js/chart.js 가 다시 그려도 계속)
   * ===================================================================== */
  function paint() {
    if (off) return;
    var r = row();
    if (!r) return;
    painting = true;
    try {
      injectStyle();
      if (!wrap || wrap.parentNode !== r) {
        /* 줄이 새로 그려져 우리 것이 날아간 상태 — 새로 만들어 붙입니다 */
        closeMenu();
        wrap = document.createElement("span");
        wrap.className = WRAP_CLASS;
        btn = document.createElement("button");
        btn.type = "button";
        /* ⚠ class 에 interval-btn 을 주지 않습니다. 그 이름을 달면 js/chart.js 가
           다음 렌더에서 data-interval 없는 이 버튼에도 손잡이를 걸어
           setActiveInterval(undefined) 를 부를 수 있습니다. */
        btn.className = BTN_CLASS;
        btn.setAttribute("aria-haspopup", "true");
        btn.setAttribute("aria-expanded", "false");
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          toggleMenu();
        });
        wrap.appendChild(btn);
        r.appendChild(wrap);
      }
      var cur = activeNow();
      var on = inMore(cur);
      /* 더보기 안의 것을 고른 상태면 그 이름을 버튼에 보여 줍니다
         (트레이딩뷰도 고른 값을 버튼 자리에 그대로 보여 줍니다) */
      btn.textContent = on ? labelOf(cur) + " ⌄" : "더보기 ⌄";
      btn.className = BTN_CLASS + (on ? " on" : "");
      btn.setAttribute("title", on ? "시간 단위 — 지금 " + labelOf(cur) : "시간 단위 더보기");
      btn.setAttribute("aria-label", btn.getAttribute("title"));
      /* 줄에 남아 있는 금색 표시를 끕니다.
         js/chart.js 의 renderIntervalButtons() 는 ★자기 버튼을 눌렀을 때만★
         줄을 다시 그립니다. 더보기에서 고르면 그 함수가 안 불려서, 직전에
         눌러 둔 버튼(예 1분)이 금색으로 남은 채 더보기도 금색이 됩니다 —
         회원이 지금 어느 단위인지 헷갈립니다. 그래서 여기서 꺼 줍니다.
         ⚠ 켜는 것은 하지 않습니다. 더보기 밖의 단위는 js/chart.js 가
           다시 그리면서 스스로 켭니다(우리가 켜면 두 번 칠하게 됩니다). */
      if (on) {
        var rowBtns = r.querySelectorAll(".interval-btn[data-interval].active");
        for (var j = 0; j < rowBtns.length; j++) rowBtns[j].classList.remove("active");
      }
      if (isOpen()) {
        var items = menu.querySelectorAll("button[data-im]");
        for (var i = 0; i < items.length; i++) {
          items[i].className = items[i].getAttribute("data-im") === cur ? "on" : "";
        }
      }
    } catch (e) {
      /* 무시 — 화면은 수정 전 그대로 남습니다 */
    }
    painting = false;
  }

  function watch() {
    var r = row();
    if (!r || observer) return;
    observer = new MutationObserver(function () {
      if (painting) return;
      paint();
    });
    observer.observe(r, { childList: true });
  }

  function onDocClick(ev) {
    if (!isOpen()) return;
    if (wrap && wrap.contains(ev.target)) return;
    closeMenu();
  }
  function onKey(ev) {
    if (ev.key === "Escape") closeMenu();
  }
  function onResize() {
    if (isOpen()) clampMenu();
  }

  function disable() {
    off = true;
    closeMenu();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    wrap = null;
    btn = null;
    var s = document.getElementById(STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function init() {
    var tries = 0;
    (function waitRow() {
      tries++;
      var r = row();
      if (r && r.querySelector(".interval-btn[data-interval]")) {
        paint();
        watch();
        if (!docBound) {
          document.addEventListener("click", onDocClick, true);
          document.addEventListener("keydown", onKey, true);
          window.addEventListener("resize", onResize);
          docBound = true;
        }
        try {
          if (App.Bus && typeof App.Bus.on === "function") {
            App.Bus.on("interval:change", function () {
              paint();
            });
          }
        } catch (e) {
          /* 무시 */
        }
        return;
      }
      if (tries < 80) setTimeout(waitRow, 150);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    paint: paint,
    open: openMenu,
    close: closeMenu,
    toggle: toggleMenu,
    disable: disable,
    isOpen: isOpen,
    getMore: function () {
      return MORE.slice();
    },
    ROW_ID: ROW_ID,
    STYLE_ID: STYLE_ID
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.IntervalMore;
