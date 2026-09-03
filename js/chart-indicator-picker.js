/* =========================================================================
 * js/chart-indicator-picker.js — App.ChartIndicatorPicker
 * =========================================================================
 * "fx 지표" 버튼을 누르면 뜨는 ★지표 고르는 창★ 입니다.
 * 트레이딩뷰의 "Indicators, metrics, and strategies" 창을 그대로 따라갑니다.
 *
 * -- 대표 지시 (2026-09-03) -------------------------------------------
 *   "지표 누르면 이런식으로 창이 뜨게해줘 아니 트레이딩뷰랑 똑같이 가자니까
 *    왜 맘대로하는거야 직접 트레이딩뷰 들어가서 실측해서 만들어"
 *
 * -- ★실측★ 2026-09-03 · tradingview.com/chart/ 에서 직접 재고 옮겼습니다 --
 * 로그인하지 않았습니다. 지표 창은 ★로그인 없이 열립니다★ (가입 벽은 커뮤니티
 * 스크립트를 실제로 얹을 때 뜹니다). 창을 연 뒤 DOM 을 그대로 재서 아래 표를
 * 만들었습니다. 눈대중이 아니라 getBoundingClientRect · getComputedStyle 값입니다.
 *
 *   화면 1600x1000 · 창은 가로세로 ★가운데★ (창 중심 800,500 = 화면 중심)
 *
 *   +- 트레이딩뷰 실측 --------------+- 우리 값 ----------------------+
 *   | 창            840 x 638        | 1020 x 775   (x1.214)          |
 *   | 안쪽 여백     20               | 24                             |
 *   | 제목          20px / 600 / 28  | 24px / 700                     |
 *   | 닫기 X        34 x 34          | 40 x 40                        |
 *   | 검색칸        800 x 40 · r8    | 972 x 49 · r10                 |
 *   | 검색 글씨     16px             | 19px                           |
 *   | 돋보기        28 x 28          | 30 x 30  (직접 그림)           |
 *   | 왼쪽 세로줄   폭 200           | 244                            |
 *   |  묶음 제목    30px 칸 / 11px   | 36px 칸 / 17px (바닥값)        |
 *   |  항목         40px 칸 / 14px   | 48px 칸 / 18px · r10           |
 *   |  항목 아이콘  28 x 28 · x+8    | 30 x 30 · x+8                  |
 *   |  선택 표시    판 깔림 + 600    | 타일 + 700                     |
 *   | 가운데 틈     200 -> 610 = 10  | 12                             |
 *   | 목록 머리글   11px / 16        | 17px                           |
 *   | 목록 줄       32px 간격 / 14px | 40px / 18px                    |
 *   | 줄 왼쪽 들여  40 (즐겨찾기 별) | 44 (별 자리)                   |
 *   | 배지          8px / 700        | 13px / 700                     |
 *   +--------------------------------+--------------------------------+
 *
 * ⚠️ ★글씨 크기만은 트레이딩뷰를 안 따릅니다.★ 대표가 네 번 말씀하신
 *    "팝업 글씨 바닥값 17px" 이 우선입니다. 트레이딩뷰가 14px 인 자리도
 *    우리는 17~18px 이고, 그만큼 창을 1.214배로 키웠습니다.
 *    ★바닥값은 바닥이지 목표가 아닙니다★ — 위아래 위계를 살리려고
 *    묶음 제목 17 · 항목 18 · 제목 24 로 층을 뒀습니다.
 *
 * ⚠️ ★색은 트레이딩뷰를 안 베낍니다.★ 확정 팔레트만 씁니다.
 * ⚠️ ★아이콘도 안 가져옵니다.★ 전부 이 파일 안에서 직접 그린 svg 입니다.
 *
 * -- 아직 안 만든 것 (PM 을 거쳐 대표 판단 대기) -----------------------
 * 트레이딩뷰 왼쪽 줄에는 이것도 있습니다 —
 *     내 스크립트 · 구매됨 · 에디터즈 픽 · 탑 · 트렌드 · 시장
 * 전부 트레이딩뷰의 ★사용자 스크립트 · 장터★ 기능이라 우리엔 데이터가
 * 아예 없습니다. 빈 목록을 보여주면 회원이 "고장났나" 로 읽습니다
 * (이 프로젝트가 말하는 조용한 고장). 그래서 ★지금은 안 그립니다.★
 * 어떻게 할지는 보고서에 세 안을 적어 올렸습니다.
 *
 * -- js/chart.js 도 js/chart-indicator-menu.js 도 안 건드렸습니다 -------
 * 옛 메뉴의 공개 함수 open / toggle 을 ★감싸서★ 우리 창을 대신 엽니다
 * (docs/인계문서.md 1-1 의 "함수 감싸기" 패턴).
 *   되돌리기 — index.html 에서 이 파일 <script> 한 줄을 지우면 옛 메뉴가
 *   그대로 다시 뜹니다. 콘솔에서 App.ChartIndicatorPicker.restore() 도 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorPicker = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다 */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  var STYLE_ID = "tl-ipick-css";
  var WRAP_ID = "tl-ipick-wrap";
  var STORAGE_KEY = "chart-indicator-favs";

  /* 실측에서 옮긴 크기 — 한 곳에만 적습니다(두 벌 금지) */
  var W = 1020;         /* 트레이딩뷰 840 x 1.214 */
  var H = 775;          /* 트레이딩뷰 638 x 1.214 */
  var EDGE = 16;        /* 화면 가장자리에서 띄우는 최소 여백 */

  var wrap = null;
  var open_ = false;
  var section = "builtin";   /* builtin | favs */
  var query = "";
  var favs = {};
  var wrapped = false;
  var prevOpen = null;
  var prevToggle = null;

  /* =====================================================================
   * 즐겨찾기 — App.Storage 로 저장합니다(저장소를 새로 만들지 않습니다)
   * ===================================================================== */
  function loadFavs() {
    try {
      var raw = App.Storage && App.Storage.load ? App.Storage.load(STORAGE_KEY) : null;
      var st = raw && raw.state ? raw.state : raw;
      if (st && typeof st === "object") favs = st;
    } catch (e) {
      favs = {};
    }
  }

  function saveFavs() {
    try {
      if (App.Storage && App.Storage.save) App.Storage.save(STORAGE_KEY, favs);
    } catch (e) {
      /* 저장 못 해도 창은 그대로 씁니다 */
    }
  }

  /* =====================================================================
   * 아이콘 — ★직접 그립니다.★ 트레이딩뷰 파일을 가져오지 않습니다
   * ===================================================================== */
  function svg(inner, size) {
    var s = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s +
      '" fill="none" stroke="currentColor" stroke-width="1.7" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }
  var IC_SEARCH = svg('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>', 22);
  var IC_CLOSE = svg('<path d="M6 6l12 12M18 6L6 18"/>', 22);
  /* 별 — 즐겨찾기. 채우기는 CSS 가 켭니다 */
  var STAR_D = "M12 3.6l2.6 5.3 5.8.85-4.2 4.1 1 5.75L12 16.9l-5.2 2.7 1-5.75-4.2-4.1 5.8-.85z";
  var IC_STAR = svg('<path d="' + STAR_D + '"/>', 20);
  /* 왼쪽 줄 아이콘 */
  var IC_TECH = svg('<path d="M3 17l4.5-5 3.5 3.5L20 6"/><path d="M3 21h18"/>', 22);

  /* =====================================================================
   * 자리 — ★폰 하단 매수·매도 바(.tl-order-bar) 밑으로 안 들어갑니다★
   *
   * js/chart-indicator-menu.js:423 floorY() 와 ★같은 방식★ 입니다.
   * 2026-09-03 에 지표 설정판이 바로 이것 때문에 P1 이었습니다.
   * ===================================================================== */
  function vpH() {
    return window.innerHeight || document.documentElement.clientHeight || 800;
  }
  function vpW() {
    return window.innerWidth || document.documentElement.clientWidth || 1024;
  }
  function fullscreenOn() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }
  function floorY() {
    var lim = vpH() - EDGE;
    if (fullscreenOn()) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim;
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

  /** 창이 실제로 쓸 수 있는 크기. 화면과 하단 바 안으로 반드시 들어갑니다. */
  function fitBox() {
    var top = EDGE;
    var bottom = floorY();
    var availH = Math.max(220, bottom - top);
    var availW = Math.max(240, vpW() - EDGE * 2);
    return { w: Math.min(W, availW), h: Math.min(H, availH), top: top, avail: availH };
  }

  function place() {
    if (!wrap) return;
    var panel = wrap.querySelector(".tl-ipick");
    if (!panel) return;
    var b = fitBox();
    panel.style.width = b.w + "px";
    panel.style.height = b.h + "px";
    /* 위아래 가운데 — 단, 하단 바 위 영역 안에서만 */
    var y = Math.max(EDGE, EDGE + (b.avail - b.h) / 2);
    panel.style.marginTop = Math.round(y) + "px";
    panel.style.marginBottom = EDGE + "px";
  }

  /* =====================================================================
   * CSS — 위 실측 표의 값을 그대로 옮긴 것입니다
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = [
      "#" + WRAP_ID + "{position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;",
      "  display:flex;align-items:flex-start;justify-content:center;",
      "  background:rgba(10,15,28,.72);}",
      "#" + WRAP_ID + ".tl-ipick-off{display:none;}",

      ".tl-ipick{display:flex;flex-direction:column;box-sizing:border-box;",
      "  background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;",
      "  padding:24px;overflow:hidden;",
      "  box-shadow:inset 0 1px 0 rgba(255,255,255,.03);}",

      ".tl-ipick-head{display:flex;align-items:center;gap:12px;flex:0 0 auto;}",
      ".tl-ipick-title{flex:1 1 auto;color:" + C_TEXT + ";font-size:24px;font-weight:700;",
      "  line-height:34px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".tl-ipick-x{flex:0 0 auto;width:40px;height:40px;display:flex;align-items:center;",
      "  justify-content:center;background:transparent;border:0;border-radius:10px;",
      "  color:" + C_MUTED + ";cursor:pointer;padding:0;}",
      ".tl-ipick-x:hover{background:" + C_TILE + ";color:" + C_TEXT + ";}",

      ".tl-ipick-search{flex:0 0 auto;display:flex;align-items:center;gap:10px;margin-top:24px;",
      "  height:49px;padding:0 14px;box-sizing:border-box;background:" + C_TILE + ";",
      "  border:1px solid " + C_BORDER + ";border-radius:10px;color:" + C_MUTED + ";}",
      ".tl-ipick-search input{flex:1 1 auto;min-width:0;background:transparent;border:0;outline:none;",
      "  color:" + C_TEXT + ";font-size:19px;line-height:26px;font-family:inherit;}",
      ".tl-ipick-search input::placeholder{color:" + C_MUTED + ";}",

      ".tl-ipick-body{flex:1 1 auto;display:flex;gap:12px;margin-top:20px;min-height:0;}",

      ".tl-ipick-rail{flex:0 0 244px;width:244px;overflow-y:auto;overflow-x:hidden;}",
      ".tl-ipick-gl{height:36px;display:flex;align-items:center;color:" + C_MUTED + ";",
      "  font-size:17px;font-weight:700;letter-spacing:.04em;padding:0 8px;box-sizing:border-box;}",
      ".tl-ipick-nav{display:flex;align-items:center;gap:8px;height:48px;padding:0 8px;",
      "  box-sizing:border-box;border-radius:10px;color:" + C_TEXT + ";font-size:18px;",
      "  background:transparent;border:0;width:100%;cursor:pointer;text-align:left;",
      "  font-family:inherit;}",
      ".tl-ipick-nav:hover{background:" + C_TILE + ";}",
      ".tl-ipick-nav[aria-selected=true]{background:" + C_TILE + ";font-weight:700;}",
      ".tl-ipick-nav i{flex:0 0 30px;width:30px;height:30px;display:flex;align-items:center;",
      "  justify-content:center;color:" + C_MUTED + ";}",
      ".tl-ipick-nav[aria-selected=true] i{color:" + C_POINT + ";}",

      ".tl-ipick-main{flex:1 1 auto;display:flex;flex-direction:column;min-width:0;min-height:0;}",
      ".tl-ipick-colh{flex:0 0 auto;height:34px;display:flex;align-items:center;padding:0 44px;",
      "  color:" + C_MUTED + ";font-size:17px;font-weight:700;box-sizing:border-box;}",
      ".tl-ipick-list{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;min-height:0;}",

      ".tl-ipick-row{display:flex;align-items:center;gap:10px;min-height:40px;width:100%;",
      "  padding:0 8px;box-sizing:border-box;background:transparent;border:0;border-radius:8px;",
      "  color:" + C_TEXT + ";font-size:18px;cursor:pointer;text-align:left;font-family:inherit;}",
      ".tl-ipick-row:hover{background:" + C_TILE + ";}",
      ".tl-ipick-star{flex:0 0 26px;width:26px;height:26px;display:flex;align-items:center;",
      "  justify-content:center;background:transparent;border:0;padding:0;cursor:pointer;",
      "  color:" + C_BORDER + ";border-radius:6px;}",
      ".tl-ipick-star:hover{color:" + C_MUTED + ";}",
      ".tl-ipick-star[aria-pressed=true]{color:" + C_POINT + ";}",
      ".tl-ipick-star[aria-pressed=true] svg{fill:" + C_POINT + ";}",
      ".tl-ipick-nm{flex:0 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".tl-ipick-note{flex:0 1 auto;color:" + C_MUTED + ";font-size:17px;",
      "  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".tl-ipick-on{flex:0 0 auto;margin-left:auto;color:" + C_POINT + ";font-size:17px;",
      "  font-weight:700;}",

      ".tl-ipick-empty{padding:24px 8px;color:" + C_MUTED + ";font-size:18px;line-height:1.6;}",

      /* 폰 — 왼쪽 세로줄을 가로 칩 줄로 눕힙니다.
         360 에서 244px 짜리 세로줄을 두면 목록이 남는 폭이 없습니다. */
      "@media (max-width:760px){",
      "  .tl-ipick{padding:16px;}",
      "  .tl-ipick-body{flex-direction:column;gap:10px;margin-top:14px;}",
      "  .tl-ipick-rail{flex:0 0 auto;width:auto;display:flex;gap:8px;overflow-x:auto;",
      "    overflow-y:hidden;padding-bottom:2px;}",
      "  .tl-ipick-gl{display:none;}",
      "  .tl-ipick-nav{width:auto;flex:0 0 auto;height:44px;padding:0 14px;white-space:nowrap;",
      "    background:" + C_TILE + ";}",
      "  .tl-ipick-nav[aria-selected=true]{background:" + C_BORDER + ";}",
      "  .tl-ipick-colh{padding:0 8px;}",
      "  .tl-ipick-note{display:none;}",
      "  .tl-ipick-title{font-size:20px;}",
      "  .tl-ipick-search{height:44px;margin-top:14px;}",
      "}"
    ].join("");
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    document.head.appendChild(st);
  }

  /* =====================================================================
   * 목록 — ★지표 이름을 여기에 다시 적지 않습니다.★
   * 틀(App.ChartIndicatorKit)이 들고 있는 정의를 그대로 읽습니다(두 벌 금지).
   * ===================================================================== */
  function defs() {
    try {
      var K = App.ChartIndicatorKit;
      if (K && K.listDefs) return K.listDefs() || [];
    } catch (e) {
      /* 틀이 아직 안 실렸을 수 있습니다 */
    }
    return [];
  }

  function matches(d, q) {
    if (!q) return true;
    var hay = (d.name + " " + (d.note || "") + " " + d.id).toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function visibleRows() {
    var q = query.trim().toLowerCase();
    var all = defs();
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var d = all[i];
      if (section === "favs" && !favs[d.id]) continue;
      if (!matches(d, q)) continue;
      out.push(d);
    }
    return out;
  }

  /* =====================================================================
   * 그리기
   * ===================================================================== */
  function build() {
    injectStyle();
    wrap = document.createElement("div");
    wrap.id = WRAP_ID;
    wrap.className = "tl-ipick-off";
    wrap.innerHTML =
      '<div class="tl-ipick" role="dialog" aria-modal="true" aria-label="인디케이터, 메트릭 및 스트래티지">' +
        '<div class="tl-ipick-head">' +
          '<div class="tl-ipick-title">인디케이터, 메트릭 및 스트래티지</div>' +
          '<button type="button" class="tl-ipick-x" aria-label="닫기">' + IC_CLOSE + "</button>" +
        "</div>" +
        '<div class="tl-ipick-search">' + IC_SEARCH +
          '<input type="text" placeholder="찾기" aria-label="지표 찾기">' +
        "</div>" +
        '<div class="tl-ipick-body">' +
          '<div class="tl-ipick-rail"></div>' +
          '<div class="tl-ipick-main">' +
            '<div class="tl-ipick-colh">이름</div>' +
            '<div class="tl-ipick-list"></div>' +
          "</div>" +
        "</div>" +
      "</div>";
    document.body.appendChild(wrap);

    wrap.querySelector(".tl-ipick-x").addEventListener("click", close);
    /* 바깥 어두운 곳을 누르면 닫힙니다 (트레이딩뷰와 같습니다) */
    wrap.addEventListener("mousedown", function (e) {
      if (e.target === wrap) close();
    });
    var inp = wrap.querySelector(".tl-ipick-search input");
    inp.addEventListener("input", function () {
      query = inp.value || "";
      paintList();
    });
    window.addEventListener("resize", function () {
      if (open_) place();
    });
    document.addEventListener("keydown", function (e) {
      if (open_ && e.key === "Escape") close();
    });
  }

  function paintRail() {
    var rail = wrap.querySelector(".tl-ipick-rail");
    var items = [
      { g: "퍼스널", key: "favs", label: "즐겨찾기", icon: IC_STAR },
      { g: "빌트인", key: "builtin", label: "기술적 지표", icon: IC_TECH }
    ];
    var html = "";
    var lastG = null;
    items.forEach(function (it) {
      if (it.g !== lastG) {
        html += '<div class="tl-ipick-gl">' + it.g + "</div>";
        lastG = it.g;
      }
      html += '<button type="button" class="tl-ipick-nav" data-sec="' + it.key +
        '" aria-selected="' + (section === it.key) + '"><i>' + it.icon + "</i>" +
        "<span>" + it.label + "</span></button>";
    });
    rail.innerHTML = html;
    rail.querySelectorAll(".tl-ipick-nav").forEach(function (b) {
      b.addEventListener("click", function () {
        section = b.getAttribute("data-sec");
        paintRail();
        paintList();
      });
    });
  }

  function onCount(defId) {
    try {
      var K = App.ChartIndicatorKit;
      if (!K || !K.listInstances) return 0;
      var n = 0;
      K.listInstances().forEach(function (i) {
        if (i.def === defId && i.on) n++;
      });
      return n;
    } catch (e) {
      return 0;
    }
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function paintList() {
    var list = wrap.querySelector(".tl-ipick-list");
    var rows = visibleRows();
    if (!rows.length) {
      list.innerHTML = '<div class="tl-ipick-empty">' +
        (section === "favs"
          ? "즐겨찾기가 비어 있습니다. 목록에서 별을 누르면 여기에 모입니다."
          : "찾는 지표가 없습니다.") + "</div>";
      return;
    }
    var html = "";
    rows.forEach(function (d) {
      var n = onCount(d.id);
      html += '<div class="tl-ipick-row" data-def="' + esc(d.id) + '" role="button" tabindex="0">' +
        '<button type="button" class="tl-ipick-star" data-fav="' + esc(d.id) + '" ' +
          'aria-pressed="' + (favs[d.id] ? "true" : "false") + '" aria-label="즐겨찾기">' + IC_STAR + "</button>" +
        '<span class="tl-ipick-nm">' + esc(d.name) + "</span>" +
        (d.note ? '<span class="tl-ipick-note">' + esc(d.note) + "</span>" : "") +
        (n ? '<span class="tl-ipick-on">켜짐 ' + n + "</span>" : "") +
        "</div>";
    });
    list.innerHTML = html;

    list.querySelectorAll(".tl-ipick-star").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var id = b.getAttribute("data-fav");
        if (favs[id]) delete favs[id];
        else favs[id] = 1;
        saveFavs();
        paintList();
      });
    });
    list.querySelectorAll(".tl-ipick-row").forEach(function (r) {
      r.addEventListener("click", function () {
        add(r.getAttribute("data-def"));
      });
    });
  }

  /** 줄을 누르면 그 지표를 ★한 줄 얹습니다★ — 트레이딩뷰와 같습니다.
   *  색은 틀의 createInstance 가 알아서 고릅니다(색 고르는 규칙을 두 벌로
   *  안 만들려고 여기서 안 고릅니다). */
  function add(defId) {
    try {
      var K = App.ChartIndicatorKit;
      if (!K || !K.createInstance) return;
      K.createInstance(defId, { on: true });
      paintList();
    } catch (e) {
      console.warn("[chart-indicator-picker] 지표를 얹지 못했습니다 - " + defId, e);
    }
  }

  /* =====================================================================
   * 열고 닫기
   * ===================================================================== */
  function open() {
    if (!wrap) build();
    loadFavs();
    open_ = true;
    wrap.className = "";
    paintRail();
    paintList();
    place();
    var inp = wrap.querySelector(".tl-ipick-search input");
    if (inp) {
      inp.value = query;
      try { inp.focus(); } catch (e) {}
    }
  }

  function close() {
    if (!wrap) return;
    open_ = false;
    wrap.className = "tl-ipick-off";
  }

  function toggle() {
    if (open_) close();
    else open();
  }

  /* =====================================================================
   * 옛 메뉴를 ★감쌉니다★ — js/chart-indicator-menu.js 는 한 글자도 안 고칩니다
   * ===================================================================== */
  function wrapOldMenu() {
    var M = App.ChartIndicatorMenu;
    if (!M || wrapped) return false;
    prevOpen = M.open;
    prevToggle = M.toggle;
    M.open = function () { open(); };
    M.toggle = function () { toggle(); };
    wrapped = true;
    return true;
  }

  /** 되돌리기 — 옛 메뉴가 그대로 다시 뜹니다 */
  function restore() {
    var M = App.ChartIndicatorMenu;
    if (!M || !wrapped) return false;
    if (prevOpen) M.open = prevOpen;
    if (prevToggle) M.toggle = prevToggle;
    wrapped = false;
    close();
    return true;
  }

  function init() {
    loadFavs();
    if (wrapOldMenu()) return;
    /* 옛 메뉴가 아직 안 실렸으면 잠깐 기다립니다 (10초까지) */
    var n = 0;
    var t = setInterval(function () {
      if (wrapOldMenu() || ++n > 100) clearInterval(t);
    }, 100);
  }

  return {
    init: init,
    open: open,
    close: close,
    toggle: toggle,
    restore: restore,
    isOpen: function () { return open_; },
    /* 확인용 */
    WRAP_ID: WRAP_ID,
    STORAGE_KEY: STORAGE_KEY,
    floorYForTest: floorY,
    fitBoxForTest: fitBox,
    visibleRowsForTest: visibleRows,
    setQueryForTest: function (q) { query = q; },
    setSectionForTest: function (s) { section = s; },
    getFavsForTest: function () { return favs; }
  };
})();

/* 옛 메뉴를 감싸는 일은 파일이 실리는 즉시 시작합니다.
   도구막대(js/chart-drawings.js)가 누를 때마다 App.ChartIndicatorMenu.toggle 을
   ★그때그때 다시 읽기★ 때문에, 우리가 먼저 바꿔 두기만 하면 됩니다. */
if (typeof document !== "undefined") App.ChartIndicatorPicker.init();
