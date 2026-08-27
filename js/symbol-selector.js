/* =========================================================================
 * js/symbol-selector.js — App.SymbolSelector
 * =========================================================================
 * "BTCUSDT ▾" 드롭다운 — 구조만 먼저 만드는 단계(다종목 실제 연동은
 * 보류 중: 삼성전자/SK하이닉스는 증권 계좌, NASDAQ은 API 키가 필요해서
 * 사용자님이 준비되면 진행하기로 함).
 *
 * App.SymbolRegistry(이미 존재)에 등록된 종목을 그대로 나열합니다.
 * BTC(dataSource:"binance")만 실제로 거래 가능하고, 나머지(mock)는
 * "준비중" 배지를 붙이고 클릭해도 아무 것도 안 바뀝니다 — trading.js/
 * websocket.js/chart.js 등 실제 거래 엔진은 이 파일이 전혀 안 건드립니다.
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
      // 아직 실제 데이터가 연결 안 된 종목 — 구조만 준비된 단계라 여기서 멈춤.
      // 거래엔진(trading.js)이 BTC 단일 종목 전제라서, 여기서 실제로
      // 전환하면 기존 포지션/계산이 깨질 수 있어 의도적으로 막아둡니다.
      alert(meta.name + "은(는) 아직 준비 중입니다. BTC만 먼저 이용해주세요.");
      closeDropdown();
      return;
    }
    // BTC(이미 활성 종목)를 다시 눌렀을 때는 그냥 닫기만 함
    closeDropdown();
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
    document.addEventListener("click", (e) => {
      if (dom.dropdown.style.display === "block" && !dom.dropdown.contains(e.target) && e.target !== dom.btn) {
        closeDropdown();
      }
    });
  }

  return { init };
})();
