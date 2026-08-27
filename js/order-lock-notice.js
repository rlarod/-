/* =========================================================================
 * js/order-lock-notice.js — App.OrderLockNotice
 * =========================================================================
 * 대표 지시(2026-08-27):
 *   "바이낸스에서 포지션 잡고 있다고 다른 차트 못 보는 거 아니잖아"
 *
 * 예전에는 포지션이 있으면 종목 탭을 누르는 순간 window.alert 이 떠서
 * "보는 것" 자체를 거부했습니다. 막아야 하는 건 보기가 아니라 주문입니다.
 *
 *   열 것    차트 · 호가 · 최근 체결 · 지표 · 선긋기 · 시간봉 전환
 *   막을 것  주문 (매수/매도 · 지정가 · 레버리지 변경)
 *
 * 엔진에 포지션 자리가 하나뿐이라(js/trading.js) 두 번째 종목 주문은
 * 구조적으로 불가능합니다. "아직 안 연 기능" 이 아니라 "없는 기능" 이라
 * 팝업으로 그때그때 알리는 것보다 그 자리에 상시 안내를 두는 편이 맞습니다.
 * 바이낸스도 로그아웃 상태에서 주문 패널 자리에 팝업이 아니라
 * "Log In or Register Now to trade" 를 그 자리에 둡니다
 * (조사팀 캡처: shots/bh-binance-1440.png).
 *
 * ── 이 파일이 하는 일 ────────────────────────────────────────────
 *   주문 패널(.amitalk-order) 위에 덮개 한 장을 얹고, 지금 보는 종목이
 *   포지션 종목과 다를 때만 보여줍니다. 그 외에는 hidden 이라 아무 영향이 없습니다.
 *
 * ── 하지 않는 일 ────────────────────────────────────────────────
 *   · 거래 로직을 건드리지 않습니다. 잠금 판정은 js/symbol-guard.js 한 곳에서만 옵니다
 *   · 기존 마크업을 지우거나 옮기지 않습니다. 덮개 한 장을 append 할 뿐입니다
 *   · alert 을 띄우지 않습니다. 덮개가 클릭을 먼저 받아 매수/매도 버튼까지
 *     닿지 않으므로 띄울 일 자체가 없습니다
 *   · 수정 금지 12개 파일을 건드리지 않습니다
 *
 * ── 신호는 어디서 오나 ──────────────────────────────────────────
 *   App.SymbolGuard.requiredSymbol()  포지션/미체결이 걸린 종목 (없으면 null)
 *   App.SymbolGuard.blockReason()     "보유 중인 포지션이 있습니다" 등
 *   App.Config.getActiveSymbol()      지금 보고 있는 종목
 *   셋 중 하나라도 없으면 조용히 아무것도 안 합니다(부팅 순서 안전).
 *
 * ── 되돌리는 법 ────────────────────────────────────────────────
 *   index.html 의 <script src="js/order-lock-notice.js"> 한 줄을 지우면
 *   덮개가 아예 안 만들어집니다. style.css 의 ".tl-order-lock" 블록도
 *   같이 지우면 흔적이 남지 않습니다.
 * ========================================================================= */
window.App = window.App || {};

App.OrderLockNotice = (function () {
  "use strict";

  var PANEL_SEL = ".amitalk-order";
  var POLL_MS = 1000;

  var root = null;
  var els = null;
  var timer = null;
  var lastKey = "";

  /* ------------------------------------------------------------------
   * 값 읽기 — 없으면 null. 우리가 만들어내지 않습니다.
   * ------------------------------------------------------------------ */
  function requiredSymbol() {
    if (!App.SymbolGuard || typeof App.SymbolGuard.requiredSymbol !== "function") return null;
    try { return App.SymbolGuard.requiredSymbol() || null; } catch (e) { return null; }
  }

  function activeSymbol() {
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try { return App.Config.getActiveSymbol() || null; } catch (e) { /* noop */ }
    }
    return null;
  }

  function blockReason() {
    if (!App.SymbolGuard || typeof App.SymbolGuard.blockReason !== "function") return "";
    try { return App.SymbolGuard.blockReason() || ""; } catch (e) { return ""; }
  }

  /* 화면에 쓰는 이름은 등록소 한 곳에서만 가져옵니다.
     여기서 문자열을 새로 만들지 않습니다("나스닥100" 같은 이름이 생기는 걸 막습니다). */
  function displayName(sym) {
    if (!sym) return "";
    if (App.SymbolRegistry && typeof App.SymbolRegistry.getBySymbol === "function") {
      try {
        var spec = App.SymbolRegistry.getBySymbol(sym);
        if (spec && spec.name) return spec.name;
      } catch (e) { /* noop */ }
    }
    return sym;
  }

  /* 조사 "으로/로" — 받침이 있으면 "으로", 없거나 ㄹ 받침이면 "로".
     비트코인->으로, 나스닥->으로, 삼성전자->로, SK하이닉스->로 */
  function ro(word) {
    if (!word) return "로";
    var c = word.charCodeAt(word.length - 1);
    if (c < 0xac00 || c > 0xd7a3) return "로"; // 한글 음절이 아니면 그냥 "로"
    var jong = (c - 0xac00) % 28;
    return jong === 0 || jong === 8 ? "로" : "으로";
  }

  /* ------------------------------------------------------------------
   * 덮개 만들기 — 한 번만
   * ------------------------------------------------------------------ */
  function build() {
    var panel = document.querySelector(PANEL_SEL);
    if (!panel) return false;
    if (root && panel.contains(root)) return true;

    root = document.createElement("div");
    root.className = "tl-order-lock";
    root.setAttribute("hidden", "");
    root.innerHTML =
      '<div class="tl-order-lock-card" role="status" aria-live="polite">' +
        '<p class="tl-order-lock-now"></p>' +
        '<p class="tl-order-lock-main"></p>' +
        '<p class="tl-order-lock-why"></p>' +
        '<button type="button" class="tl-order-lock-btn"></button>' +
        '<p class="tl-order-lock-ok">차트 · 호가 · 최근 체결은 그대로 보실 수 있습니다</p>' +
      "</div>";

    panel.appendChild(root);

    els = {
      panel: panel,
      now: root.querySelector(".tl-order-lock-now"),
      main: root.querySelector(".tl-order-lock-main"),
      why: root.querySelector(".tl-order-lock-why"),
      btn: root.querySelector(".tl-order-lock-btn"),
    };

    /* 덮개 아무 데나 눌러도 아무 일이 없게 — 뒤의 매수/매도로 넘어가지 않습니다 */
    root.addEventListener("click", function (e) { e.stopPropagation(); });

    els.btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var need = requiredSymbol();
      if (!need) return;
      /* 실제 전환은 늘 한 통로로만 — js/symbol-stream-switch.js */
      if (App.SymbolStreamSwitch && typeof App.SymbolStreamSwitch.switchTo === "function") {
        App.SymbolStreamSwitch.switchTo(need);
      }
    });

    return true;
  }

  /* ------------------------------------------------------------------
   * 상태 반영
   * ------------------------------------------------------------------ */
  function update() {
    if (!build()) return;

    var need = requiredSymbol();
    var now = activeSymbol();
    var on = !!(need && now && need !== now);

    if (!on) {
      if (!root.hasAttribute("hidden")) {
        root.setAttribute("hidden", "");
        els.panel.removeAttribute("data-tl-order-locked");
      }
      lastKey = "";
      return;
    }

    var key = need + ">" + now + "|" + blockReason();
    if (key === lastKey && !root.hasAttribute("hidden")) return;
    lastKey = key;

    var needName = displayName(need);
    var nowName = displayName(now);

    els.now.textContent = "지금은 " + nowName + " 차트를 보고 있습니다";
    els.main.textContent = "주문은 " + needName + "에서만 할 수 있습니다";
    els.why.textContent = blockReason();
    els.btn.textContent = needName + ro(needName) + " 돌아가기";

    root.removeAttribute("hidden");
    els.panel.setAttribute("data-tl-order-locked", "1");
  }

  /* ------------------------------------------------------------------
   * 시작
   * ------------------------------------------------------------------ */
  function init() {
    if (!document || !document.querySelector) return;
    update();

    if (App.Bus && typeof App.Bus.on === "function") {
      ["symbol:change", "trading:update", "trading:persisted"].forEach(function (ev) {
        try { App.Bus.on(ev, update); } catch (e) { /* noop */ }
      });
    }
    /* 이벤트를 놓쳐도 화면이 어긋난 채로 남지 않게 하는 보조 장치입니다.
       하는 일은 함수 두 개를 읽어 문자열 하나를 비교하는 것뿐입니다. */
    if (timer) clearInterval(timer);
    timer = setInterval(update, POLL_MS);
  }

  return {
    init: init,
    update: update,
    isShown: function () { return !!(root && !root.hasAttribute("hidden")); },
    _ro: ro,
    _displayName: displayName,
  };
})();

/* 스스로 켭니다 — js/main.js 를 건드리지 않기 위해서입니다.
   main.js 는 여러 팀이 같이 만지는 파일이라 한 줄이라도 덜 건드리는 편이 안전합니다.
   init() 은 여러 번 불려도 안전합니다(덮개는 한 번만 만들고 타이머는 갈아끼웁니다). */
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { App.OrderLockNotice.init(); });
  } else {
    App.OrderLockNotice.init();
  }
}

if (typeof module !== "undefined" && module.exports) module.exports = App.OrderLockNotice;
