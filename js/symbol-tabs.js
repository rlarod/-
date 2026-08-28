/* =========================================================================
 * js/symbol-tabs.js — App.SymbolTabs
 * =========================================================================
 * 상품탭 줄(index.html:288 `.product-tabs`)에 **종목 탭 4개**를 넣습니다.
 *   [비트코인] [나스닥] [삼성전자] [SK하이닉스]
 *
 * ── 왜 만들었나 (대표 지시 2026-08-27) ─────────────────────────────────
 * 대표: "여기다 종목 만들어 넣자"
 * 그 줄은 원래 분류 탭(모의투자·해외선물·선물거래) 자리였는데, 준비중인
 * 둘이 style.css 에서 display:none 이라 `선물거래` 하나만 남아 오른쪽이
 * 통째로 비어 있었습니다(360 실측: 줄 안쪽 폭 344px 중 99.9px 만 사용).
 * (그 버튼 이름은 2026-08-28 대표 지시로 `코인선물` -> `선물거래` 가 됐습니다.
 *  네 종목이 전부 무기한 선물인데 코인이 아닌 것이 셋이라 이름이 사실과 달랐습니다)
 *
 * 분류 버튼 3개는 **마크업을 그대로 두고 CSS 로만 숨깁니다**
 * (style.css `.product-tabs > .product-tab-btn{display:none;}`).
 * 나스닥·삼성전자는 코인이 아니라서 같은 줄에 나란히 두면 분류가
 * 어긋나기 때문에, 줄의 성격을 "분류 줄"에서 "종목 줄"로 바꾼 것입니다.
 *
 * ── ⛔ 새 전환 경로를 만들지 않습니다 ──────────────────────────────────
 * 종목 UI 가 이미 두 곳(시세 바 드롭다운 js/symbol-selector.js,
 * 주문창 목록 js/order-panel-amitalk.js)이라 세 번째가 되는 자리입니다.
 * 그래서 이 파일은 **자기 판단을 하나도 하지 않습니다.**
 *
 *   "바꿔도 되나" 판정  → App.SymbolRegistry.isEnabled()  (단일 출처)
 *   실제 전환          → App.SymbolStreamSwitch.switchTo() (단일 통로)
 *   지금 종목          → App.Config.getActiveSymbol()
 *   갱신 신호          → App.Bus "symbol:change"
 *
 * js/symbol-selector.js 의 onSelect 와 **판정 순서·문구까지 같습니다.**
 * 그래서 안 열린 종목(enabled:false)을 누르면 드롭다운과 똑같이
 * "…은(는) 아직 준비 중입니다." 안내만 나오고 아무것도 안 바뀝니다.
 * 전환이 열리고 닫히는 것도 저절로 따라옵니다 — 이 파일은 enabled 값을
 * 읽기만 하지 갖고 있지 않습니다.
 *
 * ── 드롭다운과 어긋나지 않는 이유 ──────────────────────────────────────
 * 활성 표시를 이 파일이 기억하지 않고 App.Config.getActiveSymbol() 을
 * 그때그때 읽습니다. 드롭다운(symbol-selector.js)도 같은 값을 읽습니다.
 * 어느 쪽에서 바꾸든 symbol:change 한 신호로 둘이 같이 다시 그려집니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 * index.html 의 <script src="js/symbol-tabs.js"> 한 줄과 main.js 부팅
 * 목록의 "SymbolTabs" 를 지우면 탭이 사라집니다. 분류 버튼 3개를 다시
 * 보이게 하려면 style.css 의 `.product-tabs > .product-tab-btn{display:none;}`
 * 한 줄을 지우세요(마크업은 처음부터 하나도 안 지웠습니다).
 * ========================================================================= */

window.App = window.App || {};

App.SymbolTabs = (function () {
  "use strict";

  var ROW_SEL = ".product-tabs";
  var BTN_CLASS = "symbol-tab-btn";

  var row = null;

  function activeSymbol() {
    return App.Config && typeof App.Config.getActiveSymbol === "function"
      ? App.Config.getActiveSymbol()
      : "BTCUSDT";
  }

  /* 판정은 App.SymbolRegistry.isEnabled 한 곳에서만 합니다(드롭다운과 같은 값). */
  function isReady(symbol) {
    return !!(App.SymbolRegistry && App.SymbolRegistry.isEnabled(symbol));
  }

  /* ---------------- 그리기 ---------------- */
  function render() {
    if (!row || !App.SymbolRegistry) return;
    var symbols = App.SymbolRegistry.getAll();
    var active = activeSymbol();

    /* 우리가 만든 탭만 지웁니다 — 분류 버튼(.product-tab-btn) 마크업은
       CSS 로 숨겨져 있을 뿐 DOM 에 그대로 남아 있어야 합니다. */
    var old = row.querySelectorAll("." + BTN_CLASS);
    for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);

    symbols.forEach(function (s) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = BTN_CLASS + (s.symbol === active ? " active" : "");
      btn.dataset.symbol = s.symbol;
      /* 이름은 종목 규격표(App.SymbolRegistry)에서 읽습니다 — 화면에 이름을
         직접 박으면 "나스닥100" 같은 다른 이름이 생깁니다. */
      btn.appendChild(document.createTextNode(s.name));
      if (!isReady(s.symbol)) {
        /* 미구현 표기는 사이트 공통 배지(.nav-soon-badge)를 그대로 씁니다. */
        var badge = document.createElement("span");
        badge.className = "nav-soon-badge";
        badge.textContent = "준비중";
        btn.appendChild(badge);
      }
      if (s.symbol === active) btn.setAttribute("aria-current", "true");
      btn.addEventListener("click", function () {
        onSelect(s.symbol);
      });
      row.appendChild(btn);
    });
  }

  /* ---------------- 누름 ----------------
   * js/symbol-selector.js 의 onSelect 와 같은 순서·같은 문구입니다.
   * 여기서 종목을 직접 바꾸지 않습니다. */
  function onSelect(symbol) {
    var meta = App.SymbolRegistry ? App.SymbolRegistry.getBySymbol(symbol) : null;
    if (!meta) return;

    if (!isReady(symbol)) {
      /* 아직 열리지 않은 종목(enabled:false) — 탭에는 보이지만 안 바뀝니다. */
      alert(meta.name + "은(는) 아직 준비 중입니다.");
      return;
    }
    if (symbol === activeSymbol()) return; /* 지금 보고 있는 종목 */

    /* 실제 전환은 js/symbol-stream-switch.js 한 곳에서만 합니다.
       포지션·미체결이 있으면 그 안에서 거부하고 안내를 띄웁니다. */
    if (App.SymbolStreamSwitch && typeof App.SymbolStreamSwitch.switchTo === "function") {
      App.SymbolStreamSwitch.switchTo(symbol);
    } else {
      alert(meta.name + "은(는) 아직 준비 중입니다.");
    }
  }

  /* ---------------- 초기화 ---------------- */
  function init() {
    row = document.querySelector(ROW_SEL);
    if (!row) return;
    render();
    /* 어디서 바꾸든(탭·드롭다운·주문창) 이 신호 하나로 같이 갱신됩니다. */
    if (App.Bus && typeof App.Bus.on === "function") App.Bus.on("symbol:change", render);
  }

  return {
    init: init,
    /* 테스트에서 쓰는 통로 — 화면을 다시 그리는 것 말고는 아무 일도 안 합니다. */
    _render: render,
    _BTN_CLASS: BTN_CLASS
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.SymbolTabs;
