/* =========================================================================
 * js/qty-price-order.js — App.QtyPriceOrder
 * =========================================================================
 * 개미톡 스타일 "주문가격 + 주문수량(BTC)" 입력 UI.
 *
 * 핵심 원칙: ui.js는 절대 안 건드립니다. ui.js의 submit()은 여전히
 * (지금은 숨겨진) #margin-input의 값만 읽어서 App.Trading.openPosition/
 * placeLimitOrder를 그대로 호출합니다 — 이 모듈은 그 앞단에서
 *   증거금 = 수량 × 가격 ÷ 레버리지
 * 을 계산해 #margin-input에 대신 채워 넣는 "번역기" 역할만 합니다.
 * 새로운 주문 계산이 아니라, trading.js가 원래 받던 파라미터(증거금)를
 * 사용자 친화적인 입력(수량+가격)으로부터 역산하는 것뿐입니다.
 *
 * 가격 기준:
 *  - 지정가 모드: 사용자가 입력한 #limit-price-input 값
 *  - 시장가 모드: App.Trading.getSnapshot().currentPrice(실시간 시세)
 *
 * ── 퍼센트 버튼의 상한이 두 개입니다 (B-2, 2026-08-31 대표 결재) ──────────
 *  ① 지갑 상한  : App.Trading.getMaxAffordableMargin() × 배율
 *  ② 구간 상한  : 그 배율을 쓸 수 있는 마지막 구간의 명목 상한
 *                 (바이낸스 Leverage & Margin Bracket — js/risk-brackets.js)
 *  ★둘 중 작은 쪽★ 을 씁니다.
 *
 *  왜 필요한가 — B건으로 "명목이 크면 배율 상한이 내려간다" 가 들어오면서,
 *  ②를 안 보면 51배 이상에서 최대(100%) 버튼이 ★누를 때마다 거부★ 됐습니다.
 *  실측 — 지갑 100,000 · 100배 → 명목 9,523,810 을 만들어 놓고 전부 거부.
 *  바이낸스는 최대 수량 자체를 구간 상한으로 깎아서 보여줍니다
 *  (100배면 명목 800,000 = 증거금 8,000).
 *
 *  ⭐ 깎였을 때는 #qty-cap-note 로 ★왜 이 숫자인지★ 말합니다.
 *     조용히 8,000 만 넣으면 "왜 10만이 안 들어가지" 가 됩니다.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *  git checkout -- js/qty-price-order.js
 *  (부분만 끄려면 bracketMaxNotional() 이 Infinity 를 돌려주게 하면
 *   퍼센트 버튼이 예전처럼 지갑 상한만 봅니다)
 * ========================================================================= */

window.App = window.App || {};

App.QtyPriceOrder = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  function isLimitMode() {
    const limitBtn = document.querySelector('.interval-btn[data-order-type="limit"]');
    return !!(limitBtn && limitBtn.classList.contains("active"));
  }

  /* 표시 통화 ↔ 내부 단위(USDT) 변환 — ui.js의 toDisplayValue/fromDisplayValue와
     같은 규칙입니다. 이 파일이 읽고 쓰는 입력칸(#limit-price-input, #margin-input)은
     전부 "화면에 보이는 통화" 기준이고, 계산 엔진은 전부 USDT입니다. */
  function toDisplayFloor(usdValue) {
    if (!App.Config || typeof App.Config.getDisplayCurrency !== "function") return usdValue;
    if (App.Config.getDisplayCurrency() === "KRW") return Math.floor(usdValue * App.Config.USD_KRW);
    return Math.floor(usdValue * 100) / 100;
  }
  function fromDisplay(displayValue) {
    if (!App.Config || typeof App.Config.getDisplayCurrency !== "function") return displayValue;
    if (App.Config.getDisplayCurrency() === "KRW") return displayValue / App.Config.USD_KRW;
    return displayValue;
  }

  function getEffectivePrice() {
    if (isLimitMode()) {
      // 입력칸에는 "96,521,700원"처럼 쉼표·단위가 붙어 있습니다. 그냥 parseFloat하면
      // 쉼표 앞에서 끊겨 96이 됩니다. 숫자만 남긴 뒤 USDT로 되돌립니다.
      const raw = (dom.priceInput && dom.priceInput.value) || "";
      const v = parseFloat(String(raw).replace(/[^0-9.]/g, ""));
      return isNaN(v) || v <= 0 ? null : fromDisplay(v);
    }
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    return snap && snap.currentPrice ? snap.currentPrice : null;
  }

  function getLeverage() {
    const levDisplay = el("lev-display");
    const v = levDisplay ? parseFloat(levDisplay.textContent) : NaN;
    return isNaN(v) || v <= 0 ? 1 : v;
  }

  /* 이 배율을 쓸 수 있는 ★명목 상한★ (USDT).
     ★기준을 여기서 새로 만들지 않고 엔진에게 직접 묻습니다★ —
     각 구간의 명목 상한을 App.Trading.bracketMaxLeverage() 에 넣어보고,
     이 배율을 아직 허용하는 마지막 구간까지만 인정합니다.
     그래야 "버튼이 만든 수량" 과 "주문이 받아주는 수량" 이 같은 기준이 됩니다.

     표나 엔진이 없으면 Infinity — ★막지 않습니다.★ (예전과 똑같이 동작) */
  function bracketMaxNotional(leverage) {
    const RB = App.RiskBrackets;
    if (!RB || typeof RB.tableFor !== "function") return Infinity;
    if (!App.Trading || typeof App.Trading.bracketMaxLeverage !== "function") return Infinity;
    const table = RB.tableFor();
    if (!table || !table.length) return Infinity;
    let cap = 0;
    for (let i = 0; i < table.length; i++) {
      /* 구간이 뒤로 갈수록 허용 배율이 내려갑니다. 처음 막히는 곳에서 멈춥니다
         (표가 그 순서가 아니더라도 ★더 보수적인 쪽★ 으로 답이 나옵니다). */
      if (App.Trading.bracketMaxLeverage(table[i].maxNotional) < leverage) break;
      cap = table[i].maxNotional;
    }
    return cap;
  }

  function 돈(v) { return Math.round(v).toLocaleString("en-US"); }

  /* 이 주문 금액에서 쓸 수 있는 최대 배율 — 엔진에게 그대로 묻습니다. */
  function 허용배율(notional) {
    if (!App.Trading || typeof App.Trading.bracketMaxLeverage !== "function") return null;
    const m = App.Trading.bracketMaxLeverage(notional);
    return typeof m === "number" && isFinite(m) && m >= 1 ? Math.floor(m) : null;
  }

  /* ⭐ 왜 이 숫자인지 회원에게 말해줍니다. 세 가지 경우가 있습니다.
       (1) 방금 수량을 깎았다        → 무엇을 왜 깎았는지
       (2) 지금 수량이 한도를 넘었다  → ★주문 버튼까지 가기 전에★ 여기서 알려줍니다
       (3) 구간 때문에 최대가 낮다    → 최대가 얼마인지
     지갑 때문에 걸린 것이면 아무 말도 안 합니다(예전 그대로). */
  function updateCapNote(줄임안내) {
    const note = el("qty-cap-note");
    if (!note) return;
    const 보조 = "#838DA4", 경고 = "#F0B429"; // 확정 팔레트. 빨강은 손익 전용이라 안 씁니다
    const price = getEffectivePrice();
    const leverage = getLeverage();
    if (!price || !App.Trading) { note.textContent = ""; return; }
    const 구간명목 = bracketMaxNotional(leverage);
    if (!isFinite(구간명목)) { note.textContent = ""; return; }

    if (줄임안내) { note.style.color = 경고; note.textContent = 줄임안내; return; }

    const qty = dom.qtyInput ? parseFloat(dom.qtyInput.value) : NaN;
    if (!isNaN(qty) && qty > 0 && qty * price > 구간명목) {
      const 쓸수있는배율 = 허용배율(qty * price);
      note.style.color = 경고;
      note.textContent =
        "지금 수량은 주문 금액 " + 돈(qty * price) + " USDT 입니다. " +
        "이 금액에서는 최대 " + (쓸수있는배율 || 1) + "배까지만 됩니다(지금 " + leverage + "배). " +
        "배율을 " + (쓸수있는배율 || 1) + "배 이하로 낮추거나 수량을 줄여주세요.";
      return;
    }

    const 지갑명목 = App.Trading.getMaxAffordableMargin() * leverage;
    if (구간명목 >= 지갑명목) { note.textContent = ""; return; }
    note.style.color = 보조;
    note.textContent =
      leverage + "배에서는 주문 금액이 " + 돈(구간명목) +
      " USDT 까지라 최대 수량이 여기까지입니다. 배율을 낮추면 더 넣을 수 있습니다.";
  }

  /* 입력을 끝냈을 때(칸을 벗어나거나 엔터) 한도까지 깎습니다.
     ⚠️ 타이핑 중에는 안 건드립니다 — "10" 을 치는 중에 값이 바뀌면 못 씁니다.
     바이낸스도 수량 자체를 한도로 잘라서 보여줍니다. */
  function clampQtyToBracket() {
    if (!dom.qtyInput || !App.Trading) return;
    const price = getEffectivePrice();
    const leverage = getLeverage();
    if (!price) return;
    /* 한도는 두 개입니다 — ★퍼센트 버튼과 완전히 같은 계산★ 입니다.
       하나라도 빠뜨리면 "버튼으로는 되는데 손으로 치면 거부" 가 됩니다. */
    const 구간명목 = bracketMaxNotional(leverage);
    const 지갑명목 = App.Trading.getMaxAffordableMargin() * leverage;
    const 한도명목 = Math.min(구간명목, 지갑명목);
    if (!isFinite(한도명목) || 한도명목 <= 0) return;
    const qty = parseFloat(dom.qtyInput.value);
    if (isNaN(qty) || qty <= 0) return;
    const 한도수량 = Math.floor((한도명목 / price) * 1e6) / 1e6;
    if (qty <= 한도수량) return;
    dom.qtyInput.value = 한도수량.toFixed(6);
    syncMargin();
    /* 어느 한도에 걸렸는지 ★구분해서★ 말합니다. 회원이 할 일이 다릅니다 —
       배율을 낮출 일인지, 자산을 더 넣을 일인지. */
    updateCapNote(
      구간명목 <= 지갑명목
        ? leverage + "배 한도에 맞춰 수량을 " + 한도수량.toFixed(6) + " 로 줄였습니다 " +
          "(이 배율의 주문 금액 한도 " + 돈(구간명목) + " USDT). 더 넣으려면 배율을 낮춰주세요."
        : "가진 자산에 맞춰 수량을 " + 한도수량.toFixed(6) + " 로 줄였습니다 " +
          "(지금 넣을 수 있는 주문 금액 " + 돈(지갑명목) + " USDT)."
    );
  }

  // 수량(BTC) + 가격 + 레버리지로부터 증거금을 역산해서, ui.js가 읽는
  // 기존 #margin-input에 채워 넣습니다(새 계산이 아니라 값 변환).
  //
  // 버그 수정(2026-08-18): 여기서 USDT 값을 그대로 써 넣었는데, ui.js의
  // getMarginValue()는 이 칸을 "화면 통화"로 읽고 fromDisplayValue()로 나눕니다.
  // 그래서 원화 모드에서 증거금이 1,500으로 한 번 더 나뉘었습니다.
  // 실측: 100% 클릭 시 119,939.79 USDT 의도 -> 실제 진입 80.01 USDT.
  // ui.js와 같은 규칙으로 화면 통화 단위를 써 넣어 맞춥니다.
  function syncMargin() {
    const marginInput = el("margin-input");
    if (!marginInput || !dom.qtyInput) return;
    const qty = parseFloat(dom.qtyInput.value);
    const price = getEffectivePrice();
    const leverage = getLeverage();
    if (!isNaN(qty) && qty > 0 && price) {
      const notional = qty * price;
      const margin = notional / leverage;
      // 반올림하면 한계선을 위로 넘어 "증거금+수수료가 자산보다 큼"으로
      // 거부되므로 ui.js의 MAX 버튼과 똑같이 항상 버림합니다.
      marginInput.value = toDisplayFloor(margin);
    } else {
      marginInput.value = "0";
    }
    updateCapNote();
  }

  function onLastClick() {
    const snap = App.Trading ? App.Trading.getSnapshot() : null;
    if (dom.priceInput && snap && snap.currentPrice) {
      dom.priceInput.value = App.Utils ? App.Utils.formatCurrencyPlain(snap.currentPrice) : snap.currentPrice;
      syncMargin();
    }
  }

  function onPercentClick(pct) {
    const price = getEffectivePrice();
    if (!price || !App.Trading) return;
    const maxMargin = App.Trading.getMaxAffordableMargin();
    const leverage = getLeverage();
    /* ★지갑 상한과 구간 상한 중 작은 쪽★ (B-2). 구간 상한을 안 보면
       51배 이상에서 이 버튼이 만든 수량을 주문이 매번 거부합니다. */
    const 지갑수량 = (maxMargin * leverage) / price;
    const 구간수량 = bracketMaxNotional(leverage) / price;
    const maxQty = Math.min(지갑수량, 구간수량);

    // toFixed(6)는 반올림이라 100%에서 최대치를 아주 조금 넘길 수 있습니다.
    // 그러면 "증거금과 수수료를 합친 금액이 가용 자산보다 큽니다"로 진입이
    // 거부됩니다(실측: 0.0009 USDT 초과). 올림이 아니라 버림으로 맞춥니다.
    const raw = (maxQty * pct) / 100;
    const floored = Math.floor(raw * 1e6) / 1e6;
    dom.qtyInput.value = floored.toFixed(6);
    syncMargin();
  }

  function injectLastButton() {
    const priceField = el("limit-price-field");
    if (!priceField || el("qty-price-last-btn")) return;
    const wrap = priceField.querySelector(".margin-input-wrap");
    if (!wrap) return;
    const btn = document.createElement("button");
    btn.id = "qty-price-last-btn";
    btn.type = "button";
    btn.className = "qty-price-last-btn";
    btn.textContent = "Last";
    btn.addEventListener("click", onLastClick);
    wrap.appendChild(btn);
    dom.priceInput = el("limit-price-input");
    if (dom.priceInput) dom.priceInput.addEventListener("input", syncMargin);
  }

  // 수량 뒤 단위 이름. App.Utils가 없던 시절 동작("BTC")으로 안전하게 떨어집니다.
  function unitLabel() {
    return App.Utils && App.Utils.qtyUnit ? App.Utils.qtyUnit() : "BTC";
  }

  function injectQtyField() {
    const anchor = el("qty-price-order-anchor");
    if (!anchor) return;
    anchor.innerHTML =
      '<div class="field">' +
      '<div class="field-label"><span>주문수량</span></div>' +
      '<div class="margin-input-wrap">' +
      '<input type="text" inputmode="decimal" id="order-qty-input" placeholder="0.000000">' +
      // 단위 이름은 종목 규격표에서 읽습니다(App.Utils.qtyUnit → SymbolRegistry.getSpec().unit).
      // 자릿수는 종목과 무관하게 6자리 고정이라 placeholder 는 그대로입니다.
      '<span id="order-qty-unit">' + unitLabel() + "</span>" +
      "</div>" +
      '<div class="chip-row" id="qty-percent-row">' +
      '<div class="chip" data-pct="10">10%</div>' +
      '<div class="chip" data-pct="25">25%</div>' +
      '<div class="chip" data-pct="50">50%</div>' +
      '<div class="chip" data-pct="75">75%</div>' +
      '<div class="chip" data-pct="100">100%</div>' +
      "</div>" +
      /* 구간 상한 때문에 수량이 깎였을 때만 글자가 들어갑니다(평소 빈 칸).
         css 파일을 건드리지 않으려고 스타일을 여기 붙였습니다 —
         확정 팔레트의 보조색(#838DA4)입니다. */
      '<div id="qty-cap-note" style="margin-top:6px;font-size:14px;line-height:1.5;' +
      'color:#838DA4;word-break:keep-all;"></div>' +
      "</div>";
    dom.qtyInput = el("order-qty-input");
    dom.qtyInput.addEventListener("input", syncMargin);
    /* ⭐ 입력을 마치면 그 배율의 한도까지 깎습니다(주문 버튼까지 안 가게).
       버튼을 누르면 브라우저가 먼저 칸을 벗어나게 하므로 change 가 먼저 옵니다. */
    dom.qtyInput.addEventListener("change", clampQtyToBracket);
    dom.qtyInput.addEventListener("blur", clampQtyToBracket);

    document.querySelectorAll("#qty-percent-row .chip").forEach((chip) => {
      chip.addEventListener("click", () => onPercentClick(parseFloat(chip.dataset.pct)));
    });
  }

  function bindOrderTypeTabs() {
    // 지정가/시장가 탭 전환 시 가격 기준이 바뀌므로 증거금도 재계산합니다.
    // ui.js가 이미 만들어둔 탭 버튼에 리스너를 하나 더 추가하는 것뿐이라
    // ui.js의 기존 클릭 핸들러와 서로 간섭하지 않습니다.
    document.querySelectorAll('.interval-btn[data-order-type]').forEach((btn) => {
      btn.addEventListener("click", () => setTimeout(syncMargin, 0));
    });
  }

  function init() {
    injectQtyField();
    injectLastButton();
    bindOrderTypeTabs();
    if (!dom.qtyInput) return; // 마크업 없으면 조용히 종료

    // 레버리지 슬라이더도 이미 ui.js가 리스너를 갖고 있지만, 여기서도
    // 하나 더 추가해서 레버리지 변경 시 증거금 재계산이 되게 합니다.
    const levSlider = el("lev-slider");
    if (levSlider) levSlider.addEventListener("input", () => setTimeout(syncMargin, 0));

    /* 배율이 바뀌면 지금 수량이 그 배율의 한도를 넘을 수 있습니다.
       ⚠️ 여기서는 ★깎지 않고 알려만 줍니다★ — 회원이 넣은 수량을 배율 변경만으로
          말없이 바꾸면 그것도 놀랍니다. 깎는 것은 수량 칸을 직접 만졌을 때만 합니다.
       (레버리지 창은 애초에 못 쓰는 배율을 안 보여줍니다 — js/leverage-modal.js) */
    const levDisplay = el("lev-display");
    if (levDisplay && typeof MutationObserver === "function") {
      new MutationObserver(() => setTimeout(syncMargin, 0))
        .observe(levDisplay, { childList: true, characterData: true, subtree: true });
    }

    /* 종목이 바뀌면 수량 단위 이름도 같이 바뀝니다(BTC → 주).
       2026-08-27 실측 — 이걸 안 하면 삼성전자로 바꾼 뒤에도 주문수량 칸이
       "0.000000 BTC" 로 남아 회원이 단위를 오해합니다. 숫자 규격(0.001·6자리)은
       네 종목이 같으므로 이름만 다시 씁니다. */
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", () => {
        const unitEl = el("order-qty-unit");
        if (unitEl) unitEl.textContent = unitLabel();
        syncMargin();
      });
    }

    syncMargin();
  }

  return { init };
})();
