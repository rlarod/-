/* =========================================================================
 * js/symbol-selector.js — App.SymbolSelector
 * =========================================================================
 * "BTCUSDT ▾" 드롭다운.
 *
 * App.SymbolRegistry(이미 존재)에 등록된 종목을 그대로 나열합니다.
 * "전환해도 되는가" 판정은 App.SymbolRegistry.isEnabled 한 곳에서만 하고,
 * 안 열린 종목은 "준비중" 배지를 붙이고 눌러도 안 바뀝니다.
 *
 * ⚠ 2026-08-27 — 실제 전환이 열렸습니다. 이 파일은 종목을 직접 바꾸지
 *   않습니다. 누른 종목을 App.SymbolStreamSwitch.switchTo() 에 넘기기만
 *   합니다. 전환 순서(활성 종목 → symbol:change → 화면 비우기 → 소켓 닫기
 *   → interval:change → 도착 확인)는 그 파일 한 곳에만 있습니다.
 *   trading.js/websocket.js/chart.js 는 여전히 이 파일이 전혀 안 건드립니다.
 * ========================================================================= */

window.App = window.App || {};

App.SymbolSelector = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function renderDropdown() {
    if (!dom.dropdown || !App.SymbolRegistry) return;
    const symbols = App.SymbolRegistry.getAll();
    const activeSymbol = App.Config ? App.Config.getActiveSymbol() : "BTCUSDT";

    dom.dropdown.innerHTML = symbols
      .map((s) => {
        const isActive = s.symbol === activeSymbol;
        // "전환해도 되는가" 판정은 App.SymbolRegistry.isEnabled 한 곳에서만 합니다.
        // 예전에는 dataSource 로 봤는데, 네 종목이 전부 실재하는 바이낸스
        // 종목(dataSource:"binance")이 되면서 그 판정이 못 쓰게 됐습니다.
        const isReady = App.SymbolRegistry.isEnabled(s.symbol);
        return (
          '<div class="symbol-option' + (isActive ? " symbol-option-active" : "") + (isReady ? "" : " symbol-option-disabled") + '" data-symbol="' + s.symbol + '">' +
          '<span class="symbol-option-name">' + s.name + '</span>' +
          '<span class="symbol-option-code">' + s.symbol + "</span>" +
          (isReady ? (isActive ? '<span class="symbol-option-badge symbol-option-badge-active">거래중</span>' : "") : '<span class="symbol-option-badge">준비중</span>') +
          "</div>"
        );
      })
      .join("");

    dom.dropdown.querySelectorAll(".symbol-option").forEach((opt) => {
      opt.addEventListener("click", () => onSelect(opt.dataset.symbol));
    });
  }

  function onSelect(symbol) {
    const meta = App.SymbolRegistry ? App.SymbolRegistry.getBySymbol(symbol) : null;
    if (!meta) return;

    if (!App.SymbolRegistry.isEnabled(symbol)) {
      // 아직 열리지 않은 종목(enabled:false). 목록에는 보이지만 안 바뀝니다.
      alert(meta.name + "은(는) 아직 준비 중입니다.");
      closeDropdown();
      return;
    }

    const active = App.Config && App.Config.getActiveSymbol ? App.Config.getActiveSymbol() : "BTCUSDT";
    if (symbol === active) {
      closeDropdown(); // 지금 보고 있는 종목을 다시 누른 것 — 닫기만 합니다
      return;
    }

    // 실제 전환은 js/symbol-stream-switch.js 한 곳에서만 합니다.
    // (활성 종목 바꾸기 → symbol:change → 화면 비우기 → 소켓 닫기 →
    //  interval:change → 3.5초 뒤 도착 확인, 이 순서를 지켜야 합니다.)
    // 포지션·미체결이 있으면 그 안에서 거부하고 안내를 띄웁니다.
    if (App.SymbolStreamSwitch && typeof App.SymbolStreamSwitch.switchTo === "function") {
      App.SymbolStreamSwitch.switchTo(symbol);
    } else {
      alert(meta.name + "은(는) 아직 준비 중입니다.");
    }
    closeDropdown();
  }

  /* 버튼 글자(index.html:315 에 BTCUSDT 로 박혀 있음)를 지금 종목으로 맞춥니다.
     열려 있는 드롭다운의 "거래중" 표시도 같이 갱신합니다. */
  function onSymbolChange() {
    const sym = App.Config && App.Config.getActiveSymbol ? App.Config.getActiveSymbol() : "";
    const label = dom.btn ? dom.btn.querySelector(".stat-label") : null;
    if (label && sym) label.textContent = sym;
    if (dom.dropdown && dom.dropdown.style.display === "block") renderDropdown();
  }

  function openDropdown() {
    renderDropdown();
    if (dom.dropdown) dom.dropdown.style.display = "block";
  }
  function closeDropdown() {
    if (dom.dropdown) dom.dropdown.style.display = "none";
  }
  function toggleDropdown(e) {
    e.stopPropagation();
    if (dom.dropdown && dom.dropdown.style.display === "block") closeDropdown();
    else openDropdown();
  }

  function init() {
    dom = {
      btn: el("symbol-select-btn"),
      dropdown: el("symbol-select-dropdown"),
    };
    if (!dom.btn || !dom.dropdown) return;

    dom.btn.addEventListener("click", toggleDropdown);
    if (App.Bus && typeof App.Bus.on === "function") App.Bus.on("symbol:change", onSymbolChange);
    onSymbolChange();
    document.addEventListener("click", (e) => {
      if (dom.dropdown.style.display === "block" && !dom.dropdown.contains(e.target) && e.target !== dom.btn) {
        closeDropdown();
      }
    });
  }

  return { init };
})();
