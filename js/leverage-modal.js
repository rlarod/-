/* =========================================================================
 * js/leverage-modal.js — App.LeverageModal
 * =========================================================================
 * 레버리지 배지를 누르면 설정 팝업이 뜨고, [확인]을 눌러야 실제로 바뀝니다.
 *
 * ── 기존 시스템을 그대로 씁니다 ─────────────────────────────────────────
 *  · 실제 변경은 App.Trading.setLeverage() 하나로만 합니다.
 *    (그 함수는 js/leverage-gate.js 가 감싸 상한을 지킵니다)
 *  · 상한은 App.LeverageGate.currentMax() — 코드에 숫자를 박지 않습니다.
 *  · 기존 슬라이더(#lev-slider)와 표시(#lev-display)는 그대로 둡니다.
 *    ui.js / qty-price-order.js 가 그 값을 계속 읽습니다.
 *
 * ── 취소하면 원래대로 ───────────────────────────────────────────────────
 *  팝업 안에서 아무리 움직여도 [확인] 전에는 실제 레버리지가 안 바뀝니다.
 *  취소 / X / ESC / 바깥 클릭 = 원래 값 유지.
 *
 * ── 열린 포지션 ─────────────────────────────────────────────────────────
 *  레버리지 변경은 "앞으로 넣을 주문"에만 적용됩니다.
 *  이미 열린 포지션의 증거금·청산가·손익은 건드리지 않습니다
 *  (trading.js 의 기존 동작 그대로 — 이 파일은 계산에 관여하지 않습니다).
 *
 * ── 명목 구간별 배율 상한 (B건, 2026-08-31 대표 결재) ───────────────────
 *  주문 금액이 커지면 바이낸스는 최대 배율을 구간별로 낮춥니다.
 *  기준은 App.Trading.bracketMaxLeverage() 하나뿐입니다 — 창과 주문이
 *  같은 함수를 봅니다. 여기서 따로 계산하지 않습니다.
 *  ⭐ 수량이 비어 있으면 상한을 줄이지 않습니다(모르는 걸 막지 않습니다).
 *  ⭐ 이미 열린 포지션은 건드리지 않습니다. 새로 여는 주문에만 적용됩니다.
 *
 * ── 되돌리는 방법 ───────────────────────────────────────────────────────
 *  git checkout -- js/leverage-modal.js js/trading.js
 *  (부분만 끄려면 이 파일의 allowedMax() 가 maxLev() 를 그대로 돌려주게
 *   바꾸면 창만 예전처럼 100배까지 보여줍니다 — 주문 거부는 그대로 남습니다)
 * ========================================================================= */

window.App = window.App || {};

App.LeverageModal = (function () {
  "use strict";

  /* 유지증거금률 — 2026-08-31 대표 결재로 바이낸스 명목 구간표(js/risk-brackets.js)를
     따르게 됐습니다. ★구간마다 값이 달라서 고정값 하나로는 맞출 수 없습니다.★
     아래 값은 1구간(가장 작은 주문) 값이고, 주문 규모를 아직 모를 때만 씁니다.
     실제 숫자를 회원에게 보여줄 때는 엔진(App.Trading.maintenanceMargin)에서
     그때그때 받아옵니다 — 여기서 따로 계산하면 또 어긋납니다. */
  var MMR = 0.004;
  var PRESETS = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  var dom = {};
  var pending = null; // 팝업 안에서 고른 값(확인 전)
  var built = false;

  function el(id) { return document.getElementById(id); }

  function maxLev() {
    if (App.LeverageGate && typeof App.LeverageGate.currentMax === "function") {
      return App.LeverageGate.currentMax();
    }
    return 100;
  }

  /* 지금 주문의 명목(USDT) = 수량 × 가격.
     레버리지와 무관하게 정해지는 값이라, 팝업에서 배율을 움직여도 안 흔들립니다.
     수량이 아직 비어 있으면 null 을 돌려주고, 그때는 ★숫자를 말하지 않습니다.★ */
  function orderNotional() {
    var qtyEl = el("order-qty-input");
    var qty = qtyEl ? parseFloat(String(qtyEl.value).replace(/,/g, "")) : NaN;
    if (!isFinite(qty) || qty <= 0) return null;

    var price = NaN;
    if (App.Trading && typeof App.Trading.getSnapshot === "function") {
      var snap = App.Trading.getSnapshot();
      if (snap && typeof snap.currentPrice === "number") price = snap.currentPrice;
    }
    /* 지정가로 주문할 참이면 회원이 적은 그 가격이 기준입니다. */
    var limitEl = el("limit-price-input");
    if (limitEl) {
      var limit = parseFloat(String(limitEl.value).replace(/,/g, ""));
      if (isFinite(limit) && limit > 0) price = limit;
    }
    if (!isFinite(price) || price <= 0) return null;

    var n = qty * price;
    return isFinite(n) && n > 0 ? n : null;
  }

  /* 그 명목 구간의 실효 유지증거금률(공제액까지 반영된 값).
     ★엔진이 청산가를 계산할 때 쓰는 값을 그대로 받아옵니다.★
     못 받아오면 null — 그러면 숫자를 말하지 않습니다. */
  function effectiveMmr(notional) {
    if (notional === null) return null;
    if (!App.Trading || typeof App.Trading.maintenanceMargin !== "function") return null;
    var mm = App.Trading.maintenanceMargin(notional);
    if (typeof mm !== "number" || !isFinite(mm) || mm < 0) return null;
    var rate = mm / notional;
    return rate >= 0 && rate < 1 ? rate : null;
  }

  /* ── 명목 구간별 배율 상한 (2026-08-31 대표 결재 · 바이낸스 B건) ──────────
     주문 금액이 커지면 바이낸스는 쓸 수 있는 최대 배율을 낮춥니다.
     ★기준을 여기서 새로 만들지 않고 엔진(App.Trading.bracketMaxLeverage)을
       그대로 부릅니다.★ 창은 50배까지만 보여주는데 주문은 60배를 받는 식으로
       어긋나면 그것도 고장입니다.

     ⭐ 수량이 아직 없으면 null 을 돌려주고 ★상한을 줄이지 않습니다.★
        주문 금액을 모르는 상태에서 임의로 막으면 그것도 거짓말입니다. */
  function bracketMax() {
    var n = orderNotional();
    if (n === null) return null;
    if (!App.Trading || typeof App.Trading.bracketMaxLeverage !== "function") return null;
    var m = App.Trading.bracketMaxLeverage(n);
    return typeof m === "number" && isFinite(m) && m >= 1 ? Math.floor(m) : null;
  }

  /* 실제로 고를 수 있는 상한 = 이용권 상한 ∩ 명목 구간 상한 */
  function allowedMax() {
    var gate = maxLev();
    var b = bracketMax();
    return b === null ? gate : Math.min(gate, b);
  }

  function currentLev() {
    var d = el("lev-display");
    var v = d ? parseFloat(d.textContent) : NaN;
    if (!isFinite(v) || v < 1) v = 10;
    return Math.min(v, maxLev());
  }

  function build() {
    if (built) return;
    var wrap = document.createElement("div");
    wrap.className = "lev-modal";
    wrap.id = "lev-modal";
    wrap.style.display = "none";
    wrap.innerHTML =
      '<div class="lev-modal-card" role="dialog" aria-modal="true" aria-labelledby="lev-modal-title">' +
      '<div class="lev-modal-head">' +
      '<span id="lev-modal-title">레버리지 변경</span>' +
      '<button type="button" class="lev-modal-x" id="lev-modal-x" aria-label="닫기">×</button>' +
      "</div>" +
      '<div class="lev-modal-body">' +
      '<div class="lev-modal-label">레버리지 배율</div>' +
      '<div class="lev-modal-value"><b id="lev-modal-value">10</b><span>x</span></div>' +
      '<div class="lev-modal-presets" id="lev-modal-presets"></div>' +
      '<input type="range" class="lev-modal-range" id="lev-modal-range" min="1" max="100" value="10">' +
      '<div class="lev-modal-scale"><span>1x</span><span id="lev-modal-max">100x</span></div>' +
      '<div class="lev-modal-warn">' +
      '<p class="lev-modal-warn-main" id="lev-modal-warn"></p>' +
      '<p class="lev-modal-warn-sub">강제청산되면 그 포지션에 넣은 증거금을 전부 잃습니다.</p>' +
      '<p class="lev-modal-warn-sub">배율이 높을수록 넣을 수 있는 증거금 한도도 함께 줄어듭니다.</p>' +
      "</div>" +
      '<p class="lev-modal-note" id="lev-modal-note"></p>' +
      "</div>" +
      '<div class="lev-modal-foot">' +
      '<button type="button" class="lev-modal-btn lev-modal-ok" id="lev-modal-ok">확인</button>' +
      '<button type="button" class="lev-modal-btn" id="lev-modal-cancel">취소</button>' +
      "</div></div>";
    document.body.appendChild(wrap);

    dom = {
      wrap: wrap,
      value: el("lev-modal-value"),
      presets: el("lev-modal-presets"),
      range: el("lev-modal-range"),
      maxLabel: el("lev-modal-max"),
      note: el("lev-modal-note"),
      warn: el("lev-modal-warn"),
      ok: el("lev-modal-ok"),
      cancel: el("lev-modal-cancel"),
      x: el("lev-modal-x"),
    };

    dom.range.addEventListener("input", function () {
      setPending(parseInt(dom.range.value, 10));
    });
    dom.ok.addEventListener("click", apply);
    dom.cancel.addEventListener("click", close);
    dom.x.addEventListener("click", close);
    wrap.addEventListener("click", function (e) {
      if (e.target === wrap) close(); // 바깥 클릭
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && wrap.style.display !== "none") close();
    });

    built = true;
  }

  function renderPresets(maxArg) {
    var max = typeof maxArg === "number" ? maxArg : allowedMax();
    var 목록 = PRESETS.filter(function (v) { return v <= max; });
    /* ⭐ 상한 자체는 ★언제나 하나 보여줍니다.★
       구간 상한이 25배인데 프리셋이 1·10·20 에서 끊기면 회원은 25배를
       고를 방법을 못 찾습니다(슬라이더를 정확히 25에 맞춰야 함). */
    if (목록.indexOf(max) === -1) 목록.push(max);
    dom.presets.innerHTML = 목록
      .map(function (v) {
        return '<button type="button" class="lev-preset" data-v="' + v + '">' + v + "x</button>";
      })
      .join("");
    dom.presets.querySelectorAll(".lev-preset").forEach(function (b) {
      b.addEventListener("click", function () { setPending(parseInt(b.dataset.v, 10)); });
    });
  }

  function setPending(v) {
    var max = allowedMax();
    /* ⭐ 창이 열려 있는 동안 수량·가격이 바뀌어 상한이 달라졌을 수 있습니다.
       ★그때마다 눈금·슬라이더·프리셋을 다시 맞춥니다.★
       안 맞추면 회원은 100 까지 밀 수 있는 슬라이더를 보고 있는데
       주문은 25배까지만 받는 상태가 됩니다. */
    syncMax(max);
    var n = Math.max(1, Math.min(max, Math.round(Number(v) || 1)));
    pending = n;
    dom.value.textContent = String(n);
    if (Number(dom.range.value) !== n) dom.range.value = String(n);
    dom.presets.querySelectorAll(".lev-preset").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.v) === n);
    });
    /* 안내 문구 — 지어낸 숫자 없이 지금 상한만 알려줍니다. */
    var base = App.LeverageGate && App.LeverageGate.getDefaultMax ? App.LeverageGate.getDefaultMax() : max;
    var 구간상한 = bracketMax();
    var 명목 = orderNotional();
    if (구간상한 !== null && 명목 !== null && 구간상한 < maxLev()) {
      /* 주문 금액 때문에 상한이 내려간 경우 — 이유를 그대로 말합니다. */
      dom.note.textContent =
        "주문 금액 " + Math.round(명목).toLocaleString("en-US") +
        " USDT 구간이라 최대 " + 구간상한 +
        "배까지 가능합니다. 금액을 줄이면 더 높은 배율을 쓸 수 있습니다.";
    } else {
      dom.note.textContent =
        max > base
          ? "이용권 적용 중 — 최대 " + max + "배까지 사용할 수 있습니다."
          : "현재 최대 " + max + "배까지 사용할 수 있습니다.";
    }

    /* 위험 안내 — 이 배율이면 가격이 몇 % 반대로 가면 청산되는지 실제로 계산합니다.
       js/trading.js 의 청산가 공식과 같은 식입니다.
         LONG  청산가 = 진입가 × (1 − 1/배율 + 유지증거금률)
       즉 진입가 대비 (1/배율 − 유지증거금률) 만큼 반대로 움직이면 청산입니다.

       ── 2026-08-31 ─────────────────────────────────────────────────
       유지증거금률이 명목 구간별로 바뀌어, 같은 100배라도 주문이 크면
       버티는 폭이 훨씬 좁습니다(실측 0.600% → 0.126%).
       그래서 ★주문 규모를 알면 그 구간 값으로 다시 계산★ 하고,
       ★모르면 숫자를 말하지 않습니다.★ 틀린 숫자를 보여주면 회원이
       그 값을 믿고 배율을 고릅니다. */
    if (dom.warn) {
      var 청산폭 = (1 / n - MMR) * 100; // 주문 규모를 모를 때(1구간 기준)
      var 실효율 = effectiveMmr(orderNotional());
      if (실효율 !== null) 청산폭 = (1 / n - 실효율) * 100; // 알면 정확히

      if (청산폭 <= 0) {
        dom.warn.textContent = "이 배율에서는 진입 즉시 청산될 수 있습니다.";
      } else if (실효율 === null) {
        /* 주문 수량이 아직 없습니다 — 어떤 숫자를 말해도 틀립니다. */
        dom.warn.textContent =
          n + "배 — 버티는 폭은 주문 규모마다 다릅니다. 수량을 넣어주세요.";
      } else {
        var 폭글자 = 청산폭.toFixed(청산폭 < 1 ? 2 : 1) + "%";
        /* '만' 은 작을 때만 붙입니다 — "99.5%만" 은 말이 안 됩니다. */
        dom.warn.textContent = 청산폭 < 10
          ? n + "배 — 가격이 약 " + 폭글자 + "만 반대로 움직여도 강제청산됩니다."
          : n + "배 — 가격이 약 " + 폭글자 + " 반대로 움직이면 강제청산됩니다.";
      }
      dom.warn.classList.toggle("lev-modal-warn-high", n >= 20);
    }
  }

  /* 눈금·슬라이더 상한·프리셋 목록을 지금 상한에 맞춥니다.
     값이 그대로면 아무것도 다시 그리지 않습니다(누르는 중에 깜빡이지 않게). */
  var 마지막상한 = null;
  function syncMax(max) {
    if (마지막상한 === max) return;
    마지막상한 = max;
    if (dom.range) dom.range.max = String(max);
    if (dom.maxLabel) dom.maxLabel.textContent = max + "x";
    renderPresets(max);
  }

  /* 창이 열려 있는 동안 수량·가격이 바뀌면 다시 계산합니다. */
  function refresh() {
    if (!built || !dom.wrap || dom.wrap.style.display === "none") return;
    setPending(pending === null ? currentLev() : pending);
  }

  /* 수량·지정가 칸을 지켜봅니다. 창이 열려 있을 때만 일합니다. */
  var 감시붙임 = false;
  function watchOrderInputs() {
    if (감시붙임) return;
    감시붙임 = true;
    ["order-qty-input", "limit-price-input"].forEach(function (id) {
      var e = el(id);
      if (!e) return;
      e.addEventListener("input", refresh);
      e.addEventListener("change", refresh);
    });
  }

  function open() {
    build();
    watchOrderInputs();
    마지막상한 = null; // 열 때마다 새로 맞춥니다
    syncMax(allowedMax());
    setPending(currentLev());
    dom.wrap.style.display = "flex";
    setTimeout(function () { dom.ok.focus(); }, 0);
  }

  function close() {
    if (dom.wrap) dom.wrap.style.display = "none";
    pending = null;
  }

  /* 확인을 눌렀을 때만 실제로 바꿉니다. */
  function apply() {
    /* ⚠️ 확인을 누르는 ★그 순간★ 다시 잽니다. 창을 띄워둔 사이에 수량이
       커졌을 수 있고, 그러면 지금 고른 배율이 이미 못 쓰는 값입니다.
       여기서 안 깎으면 "창은 100 을 보여줬는데 주문은 거부" 가 됩니다. */
    var v = pending === null ? null : Math.max(1, Math.min(allowedMax(), pending));
    close();
    if (!v) return;
    if (App.Trading && typeof App.Trading.setLeverage === "function") {
      App.Trading.setLeverage(v);
    }
    /* 기존 슬라이더/표시도 맞춰 둡니다(ui.js 가 그 값을 읽습니다). */
    var slider = el("lev-slider");
    if (slider) {
      slider.value = String(v);
      try { slider.dispatchEvent(new Event("input", { bubbles: true })); } catch (e) { /* 무시 */ }
    }
    var disp = el("lev-display");
    if (disp) disp.textContent = String(v);
  }

  function init() {
    var badge = el("lev-mode-badge");
    if (!badge) return;
    /* 기존에는 배지를 누르면 슬라이더가 접혔다 펴졌습니다.
       이제 팝업을 띄웁니다. 슬라이더 자체는 남겨둡니다(기능 삭제 금지). */
    badge.addEventListener(
      "click",
      function (e) {
        e.stopPropagation();
        var field = el("leverage-field-top");
        if (field) field.style.display = "none"; // 옛 접이식은 닫아둡니다
        open();
      },
      true // 캡처 단계 — 기존 접이식 처리보다 먼저
    );
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init, open: open, close: close, apply: apply,
    _setPending: setPending, PRESETS: PRESETS,
    bracketMax: bracketMax, allowedMax: allowedMax, refresh: refresh,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.LeverageModal;
