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
 * ★2026-09-07 — 어느 것을 밖에 둘지를 ★회원이 별표로 정합니다.★
 *   전에는 파일에 6개를 손으로 박아 뒀습니다. 이제 ∨ 메뉴 안 모든 줄에
 *   별(☆/★)이 있고, 켠 것만 줄에 나옵니다.
 *
 *   밖에 그대로   ★별표한 것★ (처음 값은 1분·5분·15분·1시간·4시간·1일 —
 *                 2026-09-07 이전에 박혀 있던 그 여섯 개와 글자 단위로 같습니다.
 *                 그래서 ★처음 오는 회원의 화면은 한 픽셀도 안 바뀝니다★)
 *   ∨ 메뉴 안     나머지 전부. 별표를 켜고 끄는 자리도 여기입니다
 *   ∨ 버튼        지금 고른 단위가 별표 밖이면 그 이름을 보여 줍니다
 *                 (= 트레이딩뷰의 "기본 버튼 1개". 별표를 다 꺼도 늘 한 자리)
 *   저장          App.Storage 의 "chart_interval_favs" 한 칸
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

  /* =====================================================================
   * 별표(즐겨찾기) — 2026-09-07 차트팀 (트레이딩뷰 방식)
   * ---------------------------------------------------------------------
   * 전에는 밖에 남길 6개를 ★파일에 손으로 박아★ 뒀습니다. 이제 회원이 정합니다.
   *
   *   밖(줄에 그대로)   회원이 ★별표한 것★
   *   ∨ 메뉴 안         나머지 전부 + 별표 켜고 끄기
   *   ∨ 버튼 자체       지금 고른 단위가 별표 밖이면 ★그 이름★ 을 보여 줍니다
   *                     (= 트레이딩뷰의 "기본 버튼 1개". 별표를 다 꺼도
   *                       지금 단위는 늘 한 자리 보입니다)
   *
   * ★처음 오는 회원의 화면은 수정 전과 한 픽셀도 다르지 않습니다★ —
   * 기본 별표가 예전에 박혀 있던 그 6개(1분·5분·15분·1시간·4시간·1일)입니다.
   *
   * 되돌리는 방법 — 아래 FAV_DEFAULT 를 그대로 두고 이 토막을
   *   var MORE = ["3m","30m","2h","6h","8h","12h","3d","1w","1M"];
   * 한 줄로 되돌린 뒤 inMore() 를 옛 반복문으로 되돌리면 됩니다.
   * 회원이 저장해 둔 별표는 App.Storage 의 "chart_interval_favs" 한 칸뿐입니다.
   * ===================================================================== */
  var FAV_KEY = "chart_interval_favs";
  /* ⚠ 이 6개가 2026-09-07 이전에 밖에 남아 있던 것과 ★글자 단위로 같습니다★.
     여기를 바꾸면 처음 오는 회원의 첫 화면이 바뀝니다. */
  var FAV_DEFAULT = ["1m", "5m", "15m", "1h", "4h", "1d"];
  var favs = null;

  /** 못 고르게 막아 둔 간격(1초·5초·15초 — TL-004). 메뉴에도 안 넣습니다. */
  function blocked() {
    try {
      if (App.IntervalGuard && typeof App.IntervalGuard.getBlocked === "function") {
        return App.IntervalGuard.getBlocked();
      }
    } catch (e) {
      /* 무시 */
    }
    return [];
  }

  function getFavs() {
    if (favs) return favs;
    var v = null;
    try {
      if (App.Storage && typeof App.Storage.load === "function") v = App.Storage.load(FAV_KEY);
    } catch (e) {
      v = null;
    }
    favs = (v && v.length !== undefined) ? Array.prototype.slice.call(v) : FAV_DEFAULT.slice();
    return favs;
  }

  function saveFavs() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") App.Storage.save(FAV_KEY, favs);
    } catch (e) {
      /* 저장을 못 해도 이번 판에서는 그대로 씁니다 */
    }
  }

  function isFav(v) {
    var f = getFavs();
    for (var i = 0; i < f.length; i++) if (f[i] === v) return true;
    return false;
  }

  /** 별표를 켜고 끕니다. 켜면 줄에 나오고, 끄면 메뉴 안으로 들어갑니다. */
  function toggleFav(v) {
    var f = getFavs();
    var at = -1;
    for (var i = 0; i < f.length; i++) if (f[i] === v) at = i;
    if (at >= 0) f.splice(at, 1);
    else f.push(v);
    saveFavs();
    refreshHideCss();
    paint();
  }

  /** 지금 ∨ 메뉴 안에 들어가 있는 간격들 (= 별표 안 한 것) */
  function moreList() {
    var out = [];
    var all = [];
    try {
      all = App.Config.getIntervals();
    } catch (e) {
      all = [];
    }
    var bl = blocked();
    for (var i = 0; i < all.length; i++) {
      var v = all[i].value;
      if (bl.indexOf(v) >= 0) continue;   /* 막아 둔 간격은 애초에 없는 셈 */
      if (!isFav(v)) out.push(v);
    }
    return out;
  }

  var ROW_ID = "interval-row";
  var STYLE_ID = "tl-interval-more-css";
  /* 별표에 따라 다시 쓰이는 스타일은 따로 둡니다 (위 injectStyle 주석 참고) */
  var HIDE_STYLE_ID = "tl-interval-more-hide-css";
  var WRAP_CLASS = "tl-im-wrap";
  var BTN_CLASS = "tl-im-btn";
  var MENU_CLASS = "tl-im-menu";
  var ROW_CLASS = "tl-im-row";
  var STAR_CLASS = "tl-im-star";

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

  /** 이 간격이 ∨ 메뉴 안에 있나 (= 별표를 안 한 것) */
  function inMore(v) {
    return !isFav(v);
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
   * ---------------------------------------------------------------------
   * 스타일이 ★두 장★ 입니다.
   *   STYLE_ID       생김새 — 한 번만 넣고 안 바뀝니다
   *   HIDE_STYLE_ID  ★별표에 따라 바뀌는 것★ — 줄에서 무엇을 가릴지
   * 별표를 켜고 끌 때마다 뒤엣것만 다시 씁니다(앞엣것은 그대로 둡니다).
   * 나눠 두지 않으면 별표를 눌러도 화면이 안 바뀝니다 —
   * 옛 injectStyle() 은 "이미 있으면 그냥 돌아가는" 구조였습니다.
   * ===================================================================== */

  /** 별표 안 한 것을 줄에서 가립니다. 마크업은 그대로 둡니다(지우지 않습니다). */
  function refreshHideCss() {
    var list = moreList();
    var hide = [];
    /* ⚠ 속성값은 대소문자를 구분합니다 — "1M"(1개월) 과 "1m"(1분)이 다릅니다. */
    for (var i = 0; i < list.length; i++) {
      hide.push("#" + ROW_ID + ' .interval-btn[data-interval="' + list[i] + '"]');
    }
    var css = hide.length ? hide.join(",") + "{display:none !important;}" : "";
    var s = document.getElementById(HIDE_STYLE_ID);
    if (!s) {
      s = document.createElement("style");
      s.id = HIDE_STYLE_ID;
      (document.head || document.documentElement).appendChild(s);
    }
    if (s.textContent !== css) s.textContent = css;
  }

  function injectStyle() {
    refreshHideCss();
    if (document.getElementById(STYLE_ID)) return;
    /* ── ∨ 메뉴 크기 (트레이딩뷰 실측 2026-09-07 · 1440) ────────────────────
     *   트레이딩뷰   폭 180px · 행 32px · 별 24x24 · 글씨 14px
     *   우리         폭 200px · 행 38px · 별 24x24 · 글씨 ★20.5px★
     *   ⚠ 글씨를 트레이딩뷰의 14px 로 내리지 않았습니다 (대표가 네 번 지적하신 자리).
     *     20.5px 글줄이 30px 이라 32px 행에 넣으면 위아래 여백이 1px 씩만 남습니다.
     *     그래서 행만 32 -> 38 로 올렸습니다(30 + 3 + 3 + 테두리 2).
     *     폭도 "12시간"(20.5px 고정폭 5글자 = 62px) + 별 24 + 여백이 180 에
     *     안 들어가서 200 으로 올렸습니다. ★키운 쪽으로만 벗어났습니다.★
     * ------------------------------------------------------------------ */
    var css =
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
      "padding:6px;display:flex;flex-wrap:wrap;gap:6px;width:200px;max-width:calc(100vw - 24px);" +
      /* ★안에서 스크롤★ — 아래 clampMenu() 가 바닥 기준으로 max-height 를 걸 때만
         실제로 동작합니다. 평소에는 내용만큼 커서 스크롤막대가 안 보입니다.
         글씨를 줄이는 대신 이걸 씁니다 (js/chart-timezone.js 와 같은 방식). */
      "overflow-y:auto;overscroll-behavior:contain;}" +
      /* 한 줄 = [이름 단추][별 단추]. 한 칸(row)씩 세로로 쌓입니다. */
      "." + MENU_CLASS + " ." + ROW_CLASS + "{flex:1 1 100%;display:flex;align-items:stretch;gap:4px;}" +
      "." + MENU_CLASS + " button{flex:1 1 auto;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";padding:3px 8px;border-radius:6px;" +
      "font-family:var(--mono);font-size:20.5px;font-weight:600;cursor:pointer;white-space:nowrap;" +
      "text-align:left;min-height:38px;}" +
      "." + MENU_CLASS + " button:hover{border-color:" + C_MUTED + ";}" +
      "." + MENU_CLASS + " button.on{background:rgba(240,180,41,.12);border-color:" + C_POINT + ";" +
      "color:" + C_POINT + ";}" +
      /* 별 단추 — ★24x24★ (트레이딩뷰 실측과 같은 크기).
         ⚠ ★ / ☆ 글자를 안 씁니다 — tests/no-emoji.test.js 가 U+2600~U+27BF 를
           이모지로 보고 막습니다(실제로 여기서 한 번 빨개졌습니다).
           새 아이콘 파일도 안 만듭니다. 별 모양은 아래 SVG path 한 줄입니다.
         켜짐 = 속을 채우고 골드, 꺼짐 = 테두리만 보조색. 확정 팔레트 두 가지뿐입니다. */
      "." + MENU_CLASS + " button." + STAR_CLASS + "{flex:0 0 auto;width:34px;min-width:34px;" +
      "padding:0;display:flex;align-items:center;justify-content:center;" +
      "color:" + C_MUTED + ";background:transparent;}" +
      "." + MENU_CLASS + " button." + STAR_CLASS + " svg{width:24px;height:24px;display:block;}" +
      "." + MENU_CLASS + " button." + STAR_CLASS + " path{fill:none;stroke:currentColor;" +
      "stroke-width:1.6;stroke-linejoin:round;}" +
      "." + MENU_CLASS + " button." + STAR_CLASS + '[aria-pressed="true"]{color:' + C_POINT + ";}" +
      "." + MENU_CLASS + " button." + STAR_CLASS + '[aria-pressed="true"] path{fill:currentColor;}' +
      "." + MENU_CLASS + " button." + STAR_CLASS + ":hover{border-color:" + C_MUTED + ";}";
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

  /* 메뉴에 넣을 간격 — ★전부★ 입니다 (막아 둔 1초·5초·15초만 뺍니다).
     별표한 것도 넣습니다 — 안 그러면 켠 별표를 다시 끌 방법이 없습니다. */
  function menuList() {
    var all = [];
    try {
      all = App.Config.getIntervals();
    } catch (e) {
      all = [];
    }
    var bl = blocked();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (bl.indexOf(all[i].value) >= 0) continue;
      out.push(all[i].value);
    }
    return out;
  }

  function openMenu() {
    if (!wrap || isOpen()) return;
    injectStyle();
    menu = document.createElement("div");
    menu.className = MENU_CLASS;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "시간 단위");
    var cur = activeNow();
    var list = menuList();
    for (var i = 0; i < list.length; i++) {
      (function (v) {
        /* 한 줄 = [이름 단추][별 단추] (트레이딩뷰와 같은 짜임) */
        var rowEl = document.createElement("div");
        rowEl.className = ROW_CLASS;

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

        var star = document.createElement("button");
        star.type = "button";
        star.className = STAR_CLASS;
        star.setAttribute("data-fav", v);
        paintStar(star, v);
        star.addEventListener("click", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
          toggleFav(v);
          paintStar(star, v);
        });

        rowEl.appendChild(b);
        rowEl.appendChild(star);
        menu.appendChild(rowEl);
      })(list[i]);
    }
    wrap.appendChild(menu);
    btn.setAttribute("aria-expanded", "true");
    clampMenu();
  }

  /* 별 모양 하나. 24x24 자리에 그립니다(트레이딩뷰 실측과 같은 크기).
     채움/테두리는 위 CSS 가 aria-pressed 로 갈라 줍니다 — 여기서는 모양만 냅니다. */
  var STAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M12 3.2l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17.1 6.6 20l1-6.1L3.2 9.6l6.1-.9z"/>' +
    "</svg>";

  /** 별 하나의 모습을 지금 상태에 맞춥니다. 채움 = 줄에 있음 / 테두리 = 메뉴 안 */
  function paintStar(star, v) {
    var on = isFav(v);
    if (star.innerHTML !== STAR_SVG) star.innerHTML = STAR_SVG;
    star.setAttribute("aria-pressed", on ? "true" : "false");
    var t = on ? labelOf(v) + " — 줄에서 빼기" : labelOf(v) + " — 줄에 두기";
    star.setAttribute("title", t);
    star.setAttribute("aria-label", t);
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

      /* ★마지막 안전망 (2026-09-07 차트팀)★ — 앞의 계산이 어떤 답을 내든
       * ★결과가 화면 띠(8 ~ 바닥) 안인지 마지막에 한 번 더 봅니다.★
       * 구멍이 두 개 있었습니다.
       *
       (가) ★위로 나가는 것을 아무도 안 봤습니다.★ 여태 "아래로 넘치면" 만 봤고,
       *      아래가 남으면 그대로 뒀습니다. 메뉴가 짧을 때(7줄 232px)는 아래 넘침이
       *      먼저 걸려 같이 눌러앉혀졌기 때문에 안 드러났습니다.
       * (나) ★위로 뒤집은 결과를 아무도 안 봤습니다.★ "위에 자리가 있나" 를
       *      단추 위쪽 거리로만 재는데, ★단추가 화면 아래쪽 밖★ 이면 그 거리가
       *      커서 "자리 있음" 이 됩니다. 실측 800x360(폰 눕힘) 스크롤 0 —
       *      단추가 y678(화면 360 밖)이라 메뉴가 330~674 로 열렸습니다.
       *      화면 아래 ★+322px★ 입니다. 이건 수정 전에도 같았습니다(메뉴 232px 이던
       *      시절에도 442~674 로 열렸습니다).
       *
       * 2026-09-07 에 메뉴가 ★15줄(별표 포함 전체 간격)★ 로 길어지면서
       * max-height 가 화면 띠에 딱 맞게 잘라 줍니다. 그러면 아래 넘침이
       * ★영원히 안 걸리고★, 페이지를 내릴수록 메뉴가 위로 계속 올라갑니다.
       *
       *   실측 (localhost, 3px 간격 전수 훑기)
       *     360x640  821자리 중 ★663자리★ 에서 위로 나감 (최대 수백 px)
       *     375x812  770자리 중 ★622자리★
       *     예 — 360x640 스크롤 486 : 메뉴 -7~544 · 바닥 559 (아래는 15px 남음)
       *   고친 뒤  두 크기 다 ★0자리★.
       *
       * max-height 가 이미 "띠보다 크지 않게" 잘라 두므로, 위끝을 8 로 올려도
       * 아래끝이 바닥을 다시 넘지 않습니다(높이 <= 바닥-8 이라서). */
      var r3 = menu.getBoundingClientRect();
      if (r3.bottom > floorY + 0.5 || r3.top < EDGE - 0.5) {
        var wr3 = wrap.getBoundingClientRect();
        var want2 = r3.top;
        if (r3.bottom > floorY) want2 = floorY - r3.height; /* 아래끝 맞추기 */
        if (want2 < EDGE) want2 = EDGE;                     /* ★위끝이 이깁니다★ */
        menu.style.bottom = "";
        menu.style.top = Math.round(want2 - wr3.top) + "px";
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
    var h = document.getElementById(HIDE_STYLE_ID);
    if (h && h.parentNode) h.parentNode.removeChild(h);
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
    /* 지금 ∨ 메뉴 안에 들어가 있는 간격들 (= 별표 안 한 것).
       2026-09-07 이전에는 파일에 박아 둔 고정 목록이었습니다. */
    getMore: moreList,
    getFavs: function () {
      return getFavs().slice();
    },
    toggleFav: toggleFav,
    isFav: isFav,
    FAV_KEY: FAV_KEY,
    FAV_DEFAULT: FAV_DEFAULT.slice(),
    ROW_ID: ROW_ID,
    STYLE_ID: STYLE_ID
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.IntervalMore;
