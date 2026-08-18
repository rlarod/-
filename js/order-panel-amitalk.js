/* =========================================================================
 * js/order-panel-amitalk.js — App.AmiTalkOrderPanel
 * =========================================================================
 * 주문창(Order Panel)을 개미톡 레이아웃에 맞추는 "배치 전용" 모듈입니다.
 *
 * 절대 원칙:
 *  - js/ui.js, js/trading.js는 한 글자도 수정하지 않습니다.
 *  - 주문 계산/체결 로직을 새로 만들지 않습니다. 이 파일이 하는 일은
 *    (1) ui.js가 동적으로 만든 노드(#order-type-row, #limit-price-field,
 *        #tp-sl-field)를 index.html의 앵커 위치로 "옮기는" 것,
 *    (2) 개미톡에 있는 부속 UI(알림음 / ± 가격조정 / 시장가 현재가 표시 /
 *        하단 종목 스트립)를 실제 데이터·실제 이벤트에만 연결하는 것,
 *    뿐입니다. 노드를 옮겨도 ui.js는 전부 id로만 참조하므로 동작이 그대로입니다.
 *
 * 실제로 구현되지 않은 기능(재충전/아이템)은 "준비중" 배지 + 안내만 띄웁니다.
 * 환율은 데이터 소스가 없어서 표시하지 않습니다(임의 숫자 금지).
 * ========================================================================= */

window.App = window.App || {};

App.AmiTalkOrderPanel = (function () {
  "use strict";

  const SOUND_PREF_KEY = "amitalk:orderSound";
  const PRICE_STEP = 0.1; // BTCUSDT 호가 단위

  let dom = {};
  let audioCtx = null;
  let lastTradeCount = null;
  let lastHasPosition = null;

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- (1) ui.js가 만든 노드를 개미톡 순서로 이동 ---------------- */
  function relocateInjectedNodes() {
    // 지정가/시장가 탭 → 알림음 체크박스와 같은 줄로
    const typeRow = el("order-type-row");
    const typeTabs = el("ami-type-tabs");
    if (typeRow && typeTabs && typeRow.parentNode !== typeTabs) {
      typeRow.style.marginBottom = "0";
      typeTabs.appendChild(typeRow);
      // 개미톡은 [지정가][시장가] 순서 — DOM 순서만 바꿉니다(활성 상태는 ui.js가 관리).
      const limitBtn = typeRow.querySelector('[data-order-type="limit"]');
      if (limitBtn) typeRow.insertBefore(limitBtn, typeRow.firstChild);
    }

    // 지정가 가격 입력 필드 → "주문가격" 자리로
    const priceField = el("limit-price-field");
    const priceAnchor = el("ami-price-anchor");
    if (priceField && priceAnchor && priceField.parentNode !== priceAnchor) {
      const label = priceField.querySelector(".field-label span");
      if (label) label.textContent = "주문가격";
      priceAnchor.appendChild(priceField);
    }

    // TP/SL → 접이식 영역 안으로
    const tpsl = el("tp-sl-field");
    const tpslAnchor = el("ami-tpsl-anchor");
    if (tpsl && tpslAnchor && tpsl.parentNode !== tpslAnchor) {
      const label = tpsl.querySelector(".field-label");
      if (label) label.style.display = "none"; // 토글 버튼에 이미 같은 문구가 있음
      tpsl.style.marginBottom = "0";
      tpslAnchor.appendChild(tpsl);
    }
  }

  /* ---------------- (2) 지정가 가격창의 ± 스텝 버튼 ---------------- */
  function injectPriceStepper() {
    const wrap = el("limit-price-field") ? el("limit-price-field").querySelector(".margin-input-wrap") : null;
    if (!wrap || el("ami-price-step")) return;
    const box = document.createElement("span");
    box.id = "ami-price-step";
    box.className = "ami-price-step";
    box.innerHTML = '<button type="button" data-step="up">+</button><button type="button" data-step="down">−</button>';
    wrap.appendChild(box);
    box.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-step]");
      const input = el("limit-price-input");
      if (!btn || !input) return;
      const cur = parseFloat(String(input.value).replace(/,/g, ""));
      const base = isNaN(cur) ? getCurrentPrice() : cur;
      if (base === null) return;
      const next = base + (btn.dataset.step === "up" ? PRICE_STEP : -PRICE_STEP);
      input.value = (next > 0 ? next : 0).toFixed(1);
      input.dispatchEvent(new Event("input", { bubbles: true })); // qty-price-order.js가 증거금 재계산
    });
  }

  /* ---------------- (3) 시장가 모드에서 실시간 현재가 표시 ---------------- */
  function getCurrentPrice() {
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    return snap && snap.currentPrice ? snap.currentPrice : null;
  }

  function isLimitMode() {
    const b = document.querySelector('.interval-btn[data-order-type="limit"]');
    return !!(b && b.classList.contains("active"));
  }

  function syncPriceFieldMode() {
    const marketField = el("ami-market-price-field");
    if (marketField) marketField.style.display = isLimitMode() ? "none" : "";
  }

  function renderMarketPrice() {
    const input = el("ami-market-price-input");
    if (!input) return;
    const p = getCurrentPrice();
    input.value = p === null ? "-" : App.Utils ? App.Utils.formatCurrencyPlain(p) : String(p);
  }

  /* ---------------- (4) 알림음 — 실제 체결 이벤트에만 반응 ---------------- */
  function beep(kind) {
    try {
      if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audioCtx = new Ctx();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = kind === "open" ? 880 : 620;
      gain.gain.setValueAtTime(0.0001, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.18);
      osc.connect(gain).connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn("[order-panel-amitalk.js] 알림음 재생 실패:", e);
    }
  }

  function soundEnabled() {
    return !!(dom.soundToggle && dom.soundToggle.checked);
  }

  // trading.js가 상태를 저장할 때마다 쏘는 기존 이벤트만 구독합니다.
  // 포지션이 새로 생기면 진입음, 거래내역이 늘어나면 청산음.
  function onTradingPersisted(snap) {
    if (!snap) return;
    const tradeCount = Array.isArray(snap.closedTrades) ? snap.closedTrades.length : 0;
    const hasPosition = !!snap.position;
    if (lastTradeCount === null) {
      lastTradeCount = tradeCount;
      lastHasPosition = hasPosition;
      return; // 첫 스냅샷(복원)은 알림 대상이 아님
    }
    if (soundEnabled()) {
      if (tradeCount > lastTradeCount) beep("close");
      else if (hasPosition && !lastHasPosition) beep("open");
    }
    lastTradeCount = tradeCount;
    lastHasPosition = hasPosition;
  }

  function initSoundToggle() {
    dom.soundToggle = el("order-sound-toggle");
    if (!dom.soundToggle) return;
    try {
      dom.soundToggle.checked = localStorage.getItem(SOUND_PREF_KEY) === "1";
    } catch (e) {
      /* localStorage 차단 환경 — 기본값(꺼짐) 사용 */
    }
    dom.soundToggle.addEventListener("change", () => {
      try {
        localStorage.setItem(SOUND_PREF_KEY, dom.soundToggle.checked ? "1" : "0");
      } catch (e) {
        /* 저장 실패해도 이번 세션 동안은 동작 */
      }
      if (dom.soundToggle.checked) beep("open"); // 켤 때 한 번 미리듣기
    });
  }

  /* ---------------- (5) 레버리지 배지 → 슬라이더 접기/펼치기 ---------------- */
  function initLeverageAccordion() {
    const badge = el("lev-mode-badge");
    const field = el("leverage-field-top");
    if (!badge || !field) return;
    /* 슬라이더는 아래 내용을 밀어내지 않도록 겹쳐 뜹니다(CSS).
       떠 있는 동안 아래 버튼을 가리므로, 바깥을 누르거나 ESC 를 누르면
       닫히게 했습니다. 배지를 다시 눌러 닫는 방식도 그대로 둡니다. */
    function isOpen() {
      return field.style.display !== "none";
    }
    function close() {
      field.style.display = "none";
    }
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      field.style.display = isOpen() ? "none" : "";
    });
    field.addEventListener("click", (e) => e.stopPropagation());
    document.addEventListener("click", () => {
      if (isOpen()) close();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isOpen()) close();
    });
    const modeBadge = el("margin-mode-badge");
    if (modeBadge) {
      modeBadge.addEventListener("click", () => {
        alert("현재는 교차(Cross) 마진만 지원합니다. 격리(Isolated) 모드는 준비중입니다.");
      });
    }
  }

  /* ---------------- (6) TP/SL 접이식 ---------------- */
  function initTpSlToggle() {
    const btn = el("ami-tpsl-toggle");
    const box = el("ami-tpsl-anchor");
    if (!btn || !box) return;
    btn.addEventListener("click", () => {
      const open = box.style.display === "none";
      box.style.display = open ? "" : "none";
      btn.classList.toggle("open", open);
    });
  }

  /* ---------------- (7) 하단 프로모션 / 종목 스트립 ---------------- */
  function initPromo() {
    // 이 영역은 이제 "하루 1회 무료 충전" 버튼이 들어갑니다(js/daily-recharge.js).
    // 예전 "준비중" 안내는 실제 버튼이 없는 경우에만 뜨도록 남겨둡니다.
    const promo = el("ami-promo");
    if (promo && !promo.querySelector("#daily-recharge-btn")) {
      promo.addEventListener("click", () => {
        alert("재충전 / 아이템 기능은 준비중입니다.");
      });
    }

    const box = el("ami-symbols");
    if (!box || !App.SymbolRegistry) return;
    const active = App.Config && App.Config.getActiveSymbol ? App.Config.getActiveSymbol() : "BTCUSDT";
    const rows = App.SymbolRegistry.getAll()
      .filter((s) => s.type === "crypto")
      .map((s) => {
        const ready = s.dataSource !== "mock";
        return (
          '<div class="ami-symbol-row' + (s.symbol === active ? " active" : "") + '" data-symbol="' + s.symbol + '">' +
          "<span>" + s.name + " (" + s.symbol + ")</span>" +
          (ready ? '<span class="ami-symbol-badge on">거래중</span>' : '<span class="ami-symbol-badge">준비중</span>') +
          "</div>"
        );
      })
      .join("");
    box.innerHTML = rows;
    box.addEventListener("click", (e) => {
      const row = e.target.closest(".ami-symbol-row");
      if (!row || row.classList.contains("active")) return;
      alert(row.textContent.trim().replace("준비중", "") + " 종목은 준비중입니다.");
    });
  }

  /* ---------------- init ---------------- */
  function init() {
    if (!el("ami-type-tabs")) return; // 주문창 마크업이 없으면 조용히 종료

    relocateInjectedNodes();
    injectPriceStepper();
    initSoundToggle();
    initLeverageAccordion();
    initTpSlToggle();
    initPromo();

    // 탭 전환 시 주문가격 필드(지정가 입력 ↔ 시장가 현재가) 전환
    document.querySelectorAll('.interval-btn[data-order-type]').forEach((btn) => {
      btn.addEventListener("click", () => setTimeout(syncPriceFieldMode, 0));
    });
    syncPriceFieldMode();

    renderMarketPrice();
    App.Bus.on("trading:update", renderMarketPrice);
    App.Bus.on("trading:persisted", onTradingPersisted);
  }

  return { init };
})();
