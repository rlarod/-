/* =========================================================================
 * js/symbol-search.js — App.SymbolSearch
 * =========================================================================
 * 오른쪽 종목 목록(#tl-sym-list) ★맨 위★ 에 검색칸을 답니다.
 * 사양서(TL-024) 7번 — "마켓 목록 검색 · 향후 종목 추가를 고려해 컴포넌트화".
 *
 * ── 안 js/upbit-right-column.js 를 한 글자도 고치지 않았습니다 ───────────
 *   그 파일은 tests/upbit-layout-seal.test.js 가 통째로 읽어 검사합니다.
 *   그래서 ★별도 모듈★ 로 카드 안에 칸만 끼워 넣습니다(우회 패턴 — 인계문서 1-1).
 *
 * ── 함정 — classList 로 숨기면 ★1초 뒤에 되살아납니다★ ──────────────────
 *   js/upbit-right-column.js:206~207 (renderSymbols)
 *       if (s.symbol === act) tr.className = "tl-sym-row is-active";
 *       else                  tr.className = "tl-sym-row";
 *   이 두 줄이 tr.className 을 ★통째로 덮습니다★. 그리고 renderSymbols() 는
 *   시세가 올 때마다 + MIRROR_MS(1000ms) 마다 돕니다.
 *
 *       X  tr.classList.add("is-hidden")   → 1초 뒤 저절로 다시 나타남
 *       O  tr.style.display = "none"       → className 을 안 건드려 살아남음
 *
 *   ★우리는 tr.style.display 를 골랐습니다.★ 이유 —
 *     1) js/upbit-right-column.js 를 ★안 여는★ 유일한 방법입니다.
 *        classList.toggle 로 바꾸는 쪽은 그 파일을 고쳐야 하고,
 *        봉인 테스트가 그 파일 본문을 글자로 읽습니다.
 *     2) inline style 은 renderSymbols() 가 쓰는 className · textContent 와
 *        ★겹치지 않습니다★. 둘이 서로를 덮을 일이 없습니다.
 *     3) 마크업을 지우지 않습니다 — 검색어를 비우면 그대로 돌아옵니다
 *        (확정 규칙: 화면에서 뺄 때는 숨기고 마크업은 보존).
 *
 * ── 빈 화면을 만들지 않습니다 ───────────────────────────────────────────
 *   하나도 안 맞으면 "찾는 종목이 없습니다" 를 적습니다. 이 프로젝트에서
 *   가장 자주 난 사고가 ★조용한 고장★ 입니다(아무 말 없는 빈 칸).
 *
 * ── 향후 종목이 늘어도 되게 ──────────────────────────────────────────────
 *   종목 이름을 이 파일에 적지 않습니다. tbody 의 tr[data-symbol] 을 그때그때
 *   훑고, 한글 이름은 App.SymbolRegistry 에서 읽습니다(단일 출처).
 *   줄이 새로 생기면 MutationObserver 가 검색어를 다시 적용합니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 의 <script src="js/symbol-search.js"></script> 한 줄과
 *   main.js 의 "SymbolSearch" 한 개를 지우면 칸이 사라집니다.
 * ========================================================================= */
(function () {
  "use strict";

  window.App = window.App || {};
  if (App.SymbolSearch) return;

  var CARD_ID  = "tl-sym-list";
  var BODY_ID  = "tl-sym-body";
  var WRAP_ID  = "tl-symsearch";
  var INPUT_ID = "tl-symsearch-input";
  var EMPTY_ID = "tl-symsearch-empty";

  var started = false;
  var query = "";

  function id(v) { return document.getElementById(v); }

  /* 비교용으로 다듬습니다. 공백·대소문자만 없애고 글자는 그대로 둡니다. */
  function norm(v) {
    return String(v == null ? "" : v).toLowerCase().replace(/\s+/g, "");
  }

  /* 한 줄의 "검색 대상 글자" — 종목코드 + 한글이름.
     이름은 App.SymbolRegistry(단일 출처)에서 읽고, 없으면 화면 글자로 떨어집니다. */
  function haystack(tr) {
    var sym = tr.getAttribute("data-symbol") || "";
    var name = "";
    try {
      var reg = App.SymbolRegistry;
      if (reg && typeof reg.getBySymbol === "function") {
        var s = reg.getBySymbol(sym);
        if (s && s.name) name = s.name;
      }
    } catch (e) { /* noop */ }
    if (!name) {
      var krEl = tr.querySelector(".tl-sym-kr");
      if (krEl) name = krEl.textContent || "";
    }
    return norm(sym) + "|" + norm(name);
  }

  /* ---------------- 검색칸 만들기 ---------------- */

  function svgIcon() {
    /* 이모지 금지 — 인라인 SVG 로 그립니다(확정 규칙). */
    var NS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", "0 0 18 18");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");

    var c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", "7.6");
    c.setAttribute("cy", "7.6");
    c.setAttribute("r", "5");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "currentColor");
    c.setAttribute("stroke-width", "1.7");

    var l = document.createElementNS(NS, "line");
    l.setAttribute("x1", "11.4");
    l.setAttribute("y1", "11.4");
    l.setAttribute("x2", "15.6");
    l.setAttribute("y2", "15.6");
    l.setAttribute("stroke", "currentColor");
    l.setAttribute("stroke-width", "1.7");
    l.setAttribute("stroke-linecap", "round");

    svg.appendChild(c);
    svg.appendChild(l);
    return svg;
  }

  function build(card) {
    if (id(WRAP_ID)) return true;

    var wrap = document.createElement("div");
    wrap.className = "tl-symsearch";
    wrap.id = WRAP_ID;

    var icon = document.createElement("span");
    icon.className = "tl-symsearch-ico";
    icon.appendChild(svgIcon());

    var input = document.createElement("input");
    input.type = "text";
    input.id = INPUT_ID;
    input.className = "tl-symsearch-input";
    input.placeholder = "종목 검색";
    input.setAttribute("aria-label", "종목 검색");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");

    wrap.appendChild(icon);
    wrap.appendChild(input);

    /* 표 ★위★ 자리 — 카드 맨 앞에 끼웁니다(표 머리글이 제목 역할이라 그 앞) */
    card.insertBefore(wrap, card.firstChild);

    /* 하나도 안 맞을 때의 한 줄. 빈 화면을 만들지 않습니다. */
    if (!id(EMPTY_ID)) {
      var empty = document.createElement("div");
      empty.className = "tl-symsearch-empty";
      empty.id = EMPTY_ID;
      empty.hidden = true;
      empty.textContent = "찾는 종목이 없습니다.";
      var note = id("tl-sym-note");
      if (note && note.parentNode === card) card.insertBefore(empty, note);
      else card.appendChild(empty);
    }

    input.addEventListener("input", function () {
      query = norm(input.value);
      apply();
    });

    return true;
  }

  /* ---------------- 거르기 ---------------- */

  function rows() {
    var tbody = id(BODY_ID);
    if (!tbody) return [];
    var list = tbody.querySelectorAll("tr[data-symbol]");
    return Array.prototype.slice.call(list);
  }

  function apply() {
    var list = rows();
    if (!list.length) return;

    var shown = [];
    list.forEach(function (tr) {
      var hit = !query || haystack(tr).indexOf(query) >= 0;
      /* ★className 을 건드리지 않습니다★ — renderSymbols() 가 1초마다 덮습니다 */
      tr.style.display = hit ? "" : "none";
      if (hit) shown.push(tr);
    });

    /* 마지막 ★보이는★ 줄의 아래 선을 없앱니다.
       .tl-sym-table tr:last-child td{border-bottom:0} 는 "숨은 줄" 도 마지막으로
       세기 때문에, 거른 뒤에는 선이 하나 남아 보입니다.
       inline style 로 두므로 renderSymbols() 의 className 덮기와 안 겹칩니다. */
    list.forEach(function (tr) {
      Array.prototype.forEach.call(tr.cells, function (td) {
        td.style.borderBottom = "";
      });
    });
    if (shown.length) {
      Array.prototype.forEach.call(shown[shown.length - 1].cells, function (td) {
        td.style.borderBottom = "0";
      });
    }

    var empty = id(EMPTY_ID);
    if (empty) empty.hidden = shown.length > 0;

    var tbody = id(BODY_ID);
    if (tbody) tbody.setAttribute("data-visible-rows", String(shown.length));
  }

  /* ---------------- 켜기 ---------------- */

  function start() {
    var card = id(CARD_ID);
    if (!card) return false;
    build(card);
    apply();

    /* 줄이 새로 생기거나 사라지면 검색어를 다시 적용합니다
       (향후 종목 추가 대비 — 지금은 4줄이 고정이라 거의 안 돕니다). */
    var tbody = id(BODY_ID);
    if (tbody && typeof MutationObserver === "function") {
      new MutationObserver(function () { apply(); })
        .observe(tbody, { childList: true });
    }
    return true;
  }

  function init() {
    if (started) return;
    started = true;
    if (start()) return;

    /* 카드가 아직 없으면(모듈 순서가 바뀐 경우) 몇 번만 더 두드립니다.
       영원히 돌지 않게 횟수를 셉니다. */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (start() || tries >= 20) clearInterval(t);
    }, 250);
  }

  App.SymbolSearch = {
    init: init,
    /* 테스트에서 들여다보는 통로 */
    apply: apply,
    setQuery: function (v) { query = norm(v); apply(); },
    getQuery: function () { return query; },
    visibleCount: function () {
      return rows().filter(function (tr) { return tr.style.display !== "none"; }).length;
    }
  };
})();
