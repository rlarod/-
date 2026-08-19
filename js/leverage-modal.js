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
 * ========================================================================= */

window.App = window.App || {};

App.LeverageModal = (function () {
  "use strict";

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

  function renderPresets() {
    var max = maxLev();
    dom.presets.innerHTML = PRESETS.filter(function (v) { return v <= max; })
      .map(function (v) {
        return '<button type="button" class="lev-preset" data-v="' + v + '">' + v + "x</button>";
      })
      .join("");
    dom.presets.querySelectorAll(".lev-preset").forEach(function (b) {
      b.addEventListener("click", function () { setPending(parseInt(b.dataset.v, 10)); });
    });
  }

  function setPending(v) {
    var max = maxLev();
    var n = Math.max(1, Math.min(max, Math.round(Number(v) || 1)));
    pending = n;
    dom.value.textContent = String(n);
    if (Number(dom.range.value) !== n) dom.range.value = String(n);
    dom.presets.querySelectorAll(".lev-preset").forEach(function (b) {
      b.classList.toggle("active", Number(b.dataset.v) === n);
    });
    /* 안내 문구 — 지어낸 숫자 없이 지금 상한만 알려줍니다. */
    var base = App.LeverageGate && App.LeverageGate.getDefaultMax ? App.LeverageGate.getDefaultMax() : max;
    dom.note.textContent =
      max > base
        ? "이용권 적용 중 — 최대 " + max + "배까지 사용할 수 있습니다."
        : "현재 최대 " + max + "배까지 사용할 수 있습니다.";
  }

  function open() {
    build();
    var max = maxLev();
    dom.range.max = String(max);
    dom.maxLabel.textContent = max + "x";
    renderPresets();
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
    var v = pending;
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

  return { init: init, open: open, close: close, apply: apply, _setPending: setPending, PRESETS: PRESETS };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.LeverageModal;
