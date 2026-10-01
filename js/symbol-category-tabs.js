/* =========================================================================
 * js/symbol-category-tabs.js — App.SymbolCategoryTabs
 * =========================================================================
 * 오른쪽 종목 목록(#tl-sym-list) 위에 ★카테고리 탭 5개★ 를 답니다.
 * 그리고 줄마다 맨 앞에 ★별(관심)★ 을 답니다.
 *
 * 대표 지시 2026-10-01 — "업비트랑 비슷하게 ㄱㄱ 카테고리들도"
 *
 *     업비트   [원화] [BTC] [USDT] [보유] [관심]   <- 마켓 기준
 *     우리     [전체] [코인] [주식] [보유] [관심]   <- 개수는 같게, 기준만 우리 것
 *
 *   우리는 네 종목이 전부 USDT 무기한선물이라 "마켓" 으로 나누면 전부 한 칸에
 *   들어갑니다(의미가 없습니다). 그래서 ★무엇을 거래하는가★ 로 나눴습니다.
 *
 * ── ⛔ "지수" 라고 쓰지 않습니다 ────────────────────────────────────────
 *   js/symbol-registry.js 머리말(16~19행)의 경고입니다 — 바이낸스 QQQUSDT 는
 *   나스닥100 ★지수★ 가 아니라 그 지수를 따라가는 ETF(QQQ) 라서, 진짜 지수
 *   (29,209)와 숫자가 41배 다릅니다(QQQ 717).
 *   그래서 registry 의 type 값이 "index" 여도 ★화면에는 "지수" 라고 쓰지 않고
 *   [주식] 탭에 묶습니다.★ 종목 이름도 레지스트리가 주는 그대로 씁니다.
 *
 * ── 분류를 이 파일에 ★적지 않습니다★ (단일 출처) ───────────────────────
 *   어느 종목이 코인이고 어느 것이 주식인지는 js/symbol-registry.js 의
 *   type 칸이 ★유일한 출처★ 입니다. 여기엔 종목 이름도 종목 코드도 한 글자도
 *   적지 않습니다. 두 벌이 되면 종목이 늘 때 반드시 어긋납니다.
 *
 *       코인   type === "crypto"
 *       주식   그 밖의 거래되는 자산 (지금은 "stock" · "index")
 *
 *   ⚠ 새 type 이 생기면 ★어느 탭에도 안 들어가는 종목★ 이 생길 수 있습니다.
 *     그건 회원이 모르는 조용한 고장이라, 봉인 테스트
 *     (tests/symbol-category-tabs-seal.test.js)가 "레지스트리의 모든 종목이
 *     코인·주식 중 한 곳에는 들어간다" 를 세어서 ★그 자리에서 터뜨립니다★.
 *
 * ── ⚠⚠ 함정 1 — 줄을 숨기는 곳은 ★한 곳★ 이어야 합니다 ────────────────
 *   js/upbit-right-column.js:206~207 의 renderSymbols() 가
 *       tr.className = "tl-sym-row is-active";  /  tr.className = "tl-sym-row";
 *   로 className 을 통째로 덮습니다(시세마다 + 1초마다). 그래서 classList 로
 *   숨기면 1초 뒤 되살아납니다.
 *
 *   앞서 올린 검색칸(js/symbol-search.js)이 그래서 tr.style.display 를 씁니다.
 *   ★탭도 같은 자리를 쓰면 둘이 서로를 덮습니다.★ 나중에 돈 쪽이 이기고 앞
 *   조건은 조용히 사라집니다.
 *
 *   그래서 이 파일은 ★tr.style.display 를 한 번도 건드리지 않습니다.★
 *   대신 "이 줄이 지금 탭에 드느냐" 만 대답하는 함수를 검색 모듈에 맡깁니다.
 *
 *       App.SymbolSearch.setExtraFilter({ test: ..., emptyText: ... })
 *
 *   한 줄이 보이는 조건 = 검색어에 맞는다 ★그리고★ 탭에 든다 (교집합)
 *
 * ── ⚠⚠ 함정 2 — 새 <td> 를 만들면 ★행이 깨집니다★ (실측했습니다) ──────
 *   renderSymbols() 는 칸을 ★번호로★ 찾아 씁니다(cells[1]=현재가,
 *   cells[2]=등락률). 2026-10-01 에 실제로 재 봤습니다 —
 *   별을 담으려고 <td> 를 맨 앞에 하나 끼우니 6초 뒤 이렇게 됐습니다.
 *
 *       <td class="probe-td">A</td>
 *       <td class="tl-sym-name">83,351.40</td>   <- ★종목명 칸에 현재가★
 *       <td class="tl-sym-chg up">+0.04%</td>
 *       <td class="tl-sym-chg up">+0.06%</td>    <- 갱신이 멈춘 옛 값
 *
 *   회원 눈에는 "종목 이름이 숫자로 바뀌고 등락률이 두 개" 로 보입니다.
 *   ★그래서 칸 개수를 3개 그대로 둡니다.★ 별은 cells[0] ★안쪽에★ 넣고
 *   CSS 로 왼쪽에 겹쳐 올립니다(그 칸 안쪽은 renderSymbols 가 매초 다시
 *   쓰지 않는다는 것도 6초 실측으로 확인했습니다).
 *
 * ── 별표는 ★브라우저에만★ 저장합니다 ───────────────────────────────────
 *   localStorage 에 직접 씁니다. ⛔ App.Storage 를 쓰지 않습니다 —
 *   그 save() 는 다섯 모듈이 감싸고 있고(js/symbol-sync-bridge.js 등) 서버로
 *   올라가는 통로입니다. 관심 종목은 회원 데이터가 아니라 이 브라우저의
 *   취향이라 ★서버에 쓰지 않습니다.★
 *
 * ── 보유는 ★손익을 다시 계산하지 않습니다★ ─────────────────────────────
 *   "어느 종목을 들고 있나" 만 봅니다. 그 종목 이름은 js/symbol-guard.js 가
 *   포지션에 찍어 둔 도장(position.symbol)이 단일 출처입니다 —
 *   js/chart-position-symbol.js 가 보는 값과 같습니다.
 *   (js/trading.js 의 position 에는 symbol 칸이 애초에 없습니다)
 *
 * ── 안 하는 것 ──────────────────────────────────────────────────────────
 *   · 종목을 전환하지 않습니다 — 줄을 누르면 숙주가 하던 대로 바뀝니다
 *   · 고른 탭을 저장하지 않습니다 — 새로고침하면 늘 [전체] 입니다
 *     (안 시킨 기능을 만들지 않습니다. 켤 때 빈 [관심] 화면이 뜨는 것도 막습니다)
 *   · 수정 금지 파일 12개와 js/upbit-right-column.js 를 한 글자도 안 고쳤습니다
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *   index.html 의 이 파일 <script> 한 줄 + 짝이 되는 link 한 줄,
 *   main.js 의 "SymbolCategoryTabs" 한 개를 지우면 탭과 별이 사라집니다.
 *   js/symbol-search.js 의 setExtraFilter 는 아무도 안 부르면 null 이라
 *   검색은 예전과 똑같이 삽니다.
 * ========================================================================= */
(function () {
  "use strict";

  window.App = window.App || {};
  if (App.SymbolCategoryTabs) return;

  var CARD_ID = "tl-sym-list";
  var BODY_ID = "tl-sym-body";
  var SEARCH_ID = "tl-symsearch";
  var WRAP_ID = "tl-symcat";

  /* 관심 종목 — 이 브라우저에만 남습니다. 서버로 안 갑니다. */
  var FAV_KEY = "tl_fav_symbols_v1";

  /* 탭 — 업비트와 개수를 같게 5개. key 는 코드용, label 은 화면 글자. */
  var TABS = [
    { key: "all", label: "전체" },
    { key: "coin", label: "코인" },
    { key: "stock", label: "주식" },
    { key: "hold", label: "보유" },
    { key: "fav", label: "관심" }
  ];

  /* 코인으로 보는 type 값. 그 밖의 거래 자산은 모두 주식 쪽입니다.
     ⚠ 종목 이름이 아니라 ★type 값★ 입니다 — 분류의 출처는 레지스트리입니다. */
  var COIN_TYPES = ["crypto"];

  var current = "all";
  var started = false;
  var lastHold = "";
  var ensuring = false;

  function id(v) { return document.getElementById(v); }

  function rows() {
    var tbody = id(BODY_ID);
    if (!tbody) return [];
    return Array.prototype.slice.call(tbody.querySelectorAll("tr[data-symbol]"));
  }

  /* -----------------------------------------------------------------------
   * 분류 — 레지스트리의 type 칸만 봅니다
   * --------------------------------------------------------------------- */

  function typeOf(sym) {
    try {
      var reg = App.SymbolRegistry;
      if (reg && typeof reg.getBySymbol === "function") {
        var s = reg.getBySymbol(sym);
        if (s && typeof s.type === "string") return s.type;
      }
    } catch (e) { /* noop */ }
    return "";
  }

  function isCoin(sym) { return COIN_TYPES.indexOf(typeOf(sym)) >= 0; }

  /* 주식 쪽 = 거래되는 종목 중 코인이 아닌 것.
     ⚠ "stock 과 index 만" 으로 적지 않은 이유 — 새 type 이 생겼을 때
       어느 탭에도 안 들어가 ★조용히 사라지는★ 종목을 만들지 않으려고요.
       type 을 못 읽은 경우(빈 글자)는 분류 불가라 여기에 넣지 않습니다. */
  function isStock(sym) {
    var t = typeOf(sym);
    return !!t && COIN_TYPES.indexOf(t) < 0;
  }

  /* -----------------------------------------------------------------------
   * 관심 — localStorage 에만
   * --------------------------------------------------------------------- */

  function readFav() {
    try {
      var raw = window.localStorage.getItem(FAV_KEY);
      if (!raw) return [];
      var v = JSON.parse(raw);
      if (Object.prototype.toString.call(v) !== "[object Array]") return [];
      return v.filter(function (x) { return typeof x === "string" && x; });
    } catch (e) { return []; }
  }

  function writeFav(list) {
    try { window.localStorage.setItem(FAV_KEY, JSON.stringify(list)); }
    catch (e) { /* 저장을 못 해도 화면은 돌아갑니다(시크릿 모드 등) */ }
  }

  function isFav(sym) { return readFav().indexOf(sym) >= 0; }

  function toggleFav(sym) {
    var l = readFav();
    var i = l.indexOf(sym);
    if (i >= 0) l.splice(i, 1);
    else l.push(sym);
    writeFav(l);
    return i < 0;
  }

  /* -----------------------------------------------------------------------
   * 보유 — 어느 종목을 들고 있나만 봅니다 (손익 재계산 금지)
   * --------------------------------------------------------------------- */

  function loggedIn() {
    return !!(App.Auth && typeof App.Auth.getNickname === "function" && App.Auth.getNickname());
  }

  function activeSymbol() {
    try {
      if (App.Config && typeof App.Config.getActiveSymbol === "function") {
        return App.Config.getActiveSymbol();
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function heldSymbol() {
    var snap = null;
    try {
      if (App.Trading && typeof App.Trading.getSnapshot === "function") {
        snap = App.Trading.getSnapshot();
      }
    } catch (e) { return null; }
    if (!snap || !snap.position) return null;
    var s = snap.position.symbol;
    if (typeof s === "string" && s) return s;
    /* 도장이 없으면(js/symbol-guard.js 를 뺐을 때) 거래엔진은 종목을 모릅니다.
       엔진은 "지금 종목" 으로만 거래하므로 그것으로 봅니다. 모르면 빈 화면을
       만들지 않고 지금까지 하던 대로 둡니다. */
    return activeSymbol();
  }

  /* -----------------------------------------------------------------------
   * 검색 모듈에 맡기는 조건 — 숨기는 일은 거기 한 곳에서만 합니다
   * --------------------------------------------------------------------- */

  function test(tr) {
    var sym = tr.getAttribute("data-symbol") || "";
    if (!sym) return true;
    if (current === "coin") return isCoin(sym);
    if (current === "stock") return isStock(sym);
    if (current === "hold") return sym === heldSymbol();
    if (current === "fav") return isFav(sym);
    return true; /* all */
  }

  /* 0줄일 때 왜 비었는지. 빈 칸으로 두지 않습니다(조용한 고장 방지). */
  function emptyText() {
    if (current === "hold") {
      if (!loggedIn()) return "로그인하면 보유 종목이 보입니다.";
      return "보유 중인 종목이 없습니다.";
    }
    if (current === "fav") return "관심 종목이 없습니다. 별을 눌러 추가하세요.";
    return ""; /* 검색 쪽 기본 문구에 맡깁니다 */
  }

  var FILTER = { test: test, emptyText: emptyText };

  function refilter() {
    var s = App.SymbolSearch;
    if (s && typeof s.setExtraFilter === "function") s.setExtraFilter(FILTER);
  }

  /* -----------------------------------------------------------------------
   * 별 그리기 — 이모지가 아니라 인라인 SVG
   * --------------------------------------------------------------------- */

  function starSvg(on) {
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 20 20");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var p = document.createElementNS(NS, "path");
    p.setAttribute(
      "d",
      "M10 2.6 12.29 7.24 17.41 7.99 13.71 11.6 14.58 16.7 10 14.29 5.42 16.7 6.29 11.6 2.59 7.99 7.71 7.24Z"
    );
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.5");
    p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("fill", on ? "currentColor" : "none");

    svg.appendChild(p);
    return svg;
  }

  /* 값이 이미 그대로면 ★아무것도 안 건드립니다★.
     아래 MutationObserver 가 subtree 를 보기 때문에, 여기서 매번 DOM 을
     고치면 스스로를 다시 깨워 끝없이 돕니다. */
  function paintStar(btn, sym) {
    var on = isFav(sym);
    var want = on ? "1" : "0";
    if (btn.getAttribute("data-on") === want && btn.firstChild) return;
    var label = on ? "관심 종목에서 빼기" : "관심 종목에 넣기";
    btn.setAttribute("data-on", want);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    btn.appendChild(starSvg(on));
  }

  function symbolOfButton(btn) {
    var n = btn.parentNode;
    while (n && n.nodeName !== "TR") n = n.parentNode;
    return n && n.getAttribute ? n.getAttribute("data-symbol") || "" : "";
  }

  function onStarClick(e) {
    /* ⚠ 줄 전체가 "종목 전환" 버튼입니다. 안 막으면 별을 누르는 순간
       종목까지 바뀝니다. 실제로 눌러서 확인했습니다. */
    stopIt(e);
    var btn = e.currentTarget;
    var sym = symbolOfButton(btn);
    if (!sym) return;
    toggleFav(sym);
    paintStar(btn, sym);
    /* [관심] 탭을 보고 있으면 방금 켠/끈 줄이 바로 들어오고 나가야 합니다 */
    if (current === "fav") refilter();
  }

  function stopIt(e) {
    if (!e) return;
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
    if (typeof e.preventDefault === "function") e.preventDefault();
  }

  /* 누름 계열도 같이 막습니다 — 숙주가 click 이 아니라 mousedown 계열로
     전환을 걸어 두면 click 만 막아서는 종목이 바뀝니다. */
  var STOP_EVENTS = ["mousedown", "pointerdown", "touchstart"];

  function ensureStars() {
    if (ensuring) return;
    ensuring = true;
    try {
      rows().forEach(function (tr) {
        var sym = tr.getAttribute("data-symbol") || "";
        if (!sym) return;
        var cell = tr.cells && tr.cells[0];
        if (!cell) return;
        var btn = cell.querySelector(".tl-symfav");
        if (!btn) {
          btn = document.createElement("button");
          btn.type = "button";
          btn.className = "tl-symfav";
          btn.addEventListener("click", onStarClick);
          STOP_EVENTS.forEach(function (name) {
            btn.addEventListener(name, stopPress);
          });
          /* ⛔ 새 <td> 를 만들지 않습니다 — 칸 번호가 밀려 행이 깨집니다
             (파일 머리말 "함정 2" 의 실측 참고) */
          cell.insertBefore(btn, cell.firstChild);
        }
        paintStar(btn, sym);
      });
    } finally {
      ensuring = false;
    }
  }

  /* touchstart 는 passive 일 수 있어 preventDefault 가 경고를 냅니다.
     전파만 막습니다 — 종목 전환을 막는 데는 그것으로 충분합니다. */
  function stopPress(e) {
    if (!e) return;
    if (typeof e.stopPropagation === "function") e.stopPropagation();
    if (typeof e.stopImmediatePropagation === "function") e.stopImmediatePropagation();
  }

  function starsMissing() {
    var list = rows();
    for (var i = 0; i < list.length; i++) {
      var cell = list[i].cells && list[i].cells[0];
      if (cell && !cell.querySelector(".tl-symfav")) return true;
    }
    return false;
  }

  /* -----------------------------------------------------------------------
   * 탭 줄 만들기
   * --------------------------------------------------------------------- */

  function paintTabs() {
    var wrap = id(WRAP_ID);
    if (!wrap) return;
    var btns = wrap.querySelectorAll(".tl-symcat-btn");
    Array.prototype.forEach.call(btns, function (b) {
      var on = b.getAttribute("data-cat") === current;
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.setAttribute("tabindex", on ? "0" : "-1");
    });
  }

  function select(key) {
    current = key;
    paintTabs();
    refilter();
  }

  function build(card) {
    if (id(WRAP_ID)) return;

    var wrap = document.createElement("div");
    wrap.className = "tl-symcat";
    wrap.id = WRAP_ID;
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", "종목 분류");

    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tl-symcat-btn";
      b.setAttribute("data-cat", t.key);
      b.setAttribute("role", "tab");
      b.textContent = t.label;
      b.addEventListener("click", function (e) {
        stopIt(e);
        select(t.key);
      });
      wrap.appendChild(b);
    });

    /* 자리 — 업비트처럼 ★검색칸 아래 · 표 위★ */
    var search = id(SEARCH_ID);
    if (search && search.parentNode === card) card.insertBefore(wrap, search.nextSibling);
    else card.insertBefore(wrap, card.firstChild);

    paintTabs();
  }

  /* -----------------------------------------------------------------------
   * 켜기
   * --------------------------------------------------------------------- */

  function start() {
    var card = id(CARD_ID);
    if (!card) return false;
    if (!rows().length) return false;

    /* ⛔ 검색 모듈이 없으면 탭을 ★만들지 않습니다★.
       줄을 숨기는 자리는 그 모듈 한 곳뿐이라, 없으면 탭을 눌러도 아무 일이
       안 일어납니다. 눌리는데 안 되는 버튼은 조용한 고장입니다. */
    if (!App.SymbolSearch || typeof App.SymbolSearch.setExtraFilter !== "function") {
      console.warn(
        "[symbol-category-tabs.js] App.SymbolSearch.setExtraFilter 가 없어 탭을 켜지 않았습니다." +
        " js/symbol-search.js 가 먼저 실려야 합니다."
      );
      return true; /* 다시 두드리지 않습니다 — 없는 것은 기다려도 안 생깁니다 */
    }

    build(card);
    ensureStars();
    refilter();

    var tbody = id(BODY_ID);
    if (tbody && typeof MutationObserver === "function") {
      new MutationObserver(function () {
        /* 매초 들어오는 현재가·등락률 갱신에도 깨어납니다. 그래서
           ★빠진 별이 있을 때만★ 손을 댑니다(없으면 아무것도 안 고칩니다 —
           안 그러면 스스로를 다시 깨워 끝없이 돕니다). */
        if (starsMissing()) ensureStars();
      }).observe(tbody, { childList: true, subtree: true });
    }

    /* 보유 탭이 늦게 맞는 것을 막습니다 — 포지션을 열거나 닫으면 바로 반영.
       ⚠ trading:update 는 시세마다 옵니다. ★값이 바뀐 때만★ 다시 거릅니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      lastHold = holdKey();
      App.Bus.on("trading:update", function () {
        var k = holdKey();
        if (k === lastHold) return;
        lastHold = k;
        if (current === "hold") refilter();
      });
      App.Bus.on("symbol:change", function () {
        ensureStars();
        if (current === "hold") refilter();
      });
    }

    return true;
  }

  function holdKey() {
    return (loggedIn() ? "1" : "0") + "|" + (heldSymbol() || "");
  }

  function init() {
    if (started) return;
    started = true;
    if (start()) return;

    /* 카드나 줄이 아직 없으면 몇 번만 더 두드립니다(횟수를 셉니다). */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (start() || tries >= 20) clearInterval(t);
    }, 250);
  }

  App.SymbolCategoryTabs = {
    init: init,
    /* 점검용 통로 — 화면을 안 거치고 숫자를 재려고 씁니다 */
    select: select,
    getCurrent: function () { return current; },
    getTabKeys: function () { return TABS.map(function (t) { return t.key; }); },
    getTabLabels: function () { return TABS.map(function (t) { return t.label; }); },
    isCoin: isCoin,
    isStock: isStock,
    isFav: isFav,
    toggleFav: toggleFav,
    heldSymbol: heldSymbol,
    emptyText: emptyText,
    ensureStars: ensureStars,
    refilter: refilter,
    FAV_KEY: FAV_KEY
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolCategoryTabs;
