/* =========================================================================
 * js/limit-close.js — App.LimitClose
 * =========================================================================
 * 포지션 표의 "지정가" 청산. 목표 가격을 정해두면 시세가 그 가격에 닿는
 * 순간 기존 청산 함수(App.Trading.closePosition)를 부릅니다.
 *
 * 계산을 새로 하지 않습니다 — 가격 도달 여부만 판단하고, 손익·수수료·
 * 잔고 처리는 전부 trading.js가 하던 그대로입니다.
 *
 * 판정 방향:
 *   롱  : 현재가 >= 목표가  (위로 올라와 익절하는 쪽)
 *   숏  : 현재가 <= 목표가  (아래로 내려가 익절하는 쪽)
 * 반대 방향 가격을 넣으면 즉시 청산돼 버리므로 입력 단계에서 막습니다.
 *
 * 한계(정직하게): 이 사이트의 거래 판정은 전부 브라우저에서 돌아갑니다.
 * 진입할 때 거는 TP/SL도 마찬가지라, 창을 닫아두면 동작하지 않습니다.
 * 지정가 청산도 같은 조건입니다.
 * ========================================================================= */

window.App = window.App || {};

App.LimitClose = (function () {
  "use strict";

  let dom = {};
  let target = null; // { price, side, orderId }

  function el(id) {
    return document.getElementById(id);
  }

  function fmt(v) {
    return App.Utils.formatCurrencyPlain(v);
  }

  /* ---------------- 화면 상태 ---------------- */
  function paint() {
    if (!dom.limitBtn) return;
    const pos = App.Trading.getSnapshot().position;

    // 포지션이 없으면 지정가 예약도 의미가 없습니다.
    if (!pos) {
      target = null;
      dom.limitBtn.disabled = true;
      if (dom.box) dom.box.style.display = "none";
      if (dom.active) dom.active.style.display = "none";
      return;
    }
    dom.limitBtn.disabled = false;

    if (target) {
      dom.limitBtn.style.display = "none";
      if (dom.box) dom.box.style.display = "none";
      if (dom.active) {
        dom.active.style.display = "";
        dom.activeText.textContent = "지정가 " + fmt(target.price) + " 대기";
      }
    } else {
      dom.limitBtn.style.display = "";
      if (dom.active) dom.active.style.display = "none";
    }
  }

  /* ---------------- 가격 도달 감시 ---------------- */
  function onPrice(payload) {
    if (!target) return;
    const snap = App.Trading.getSnapshot();
    const pos = snap.position;

    // 포지션이 바뀌었거나 사라졌으면 예약을 버립니다(엉뚱한 청산 방지).
    if (!pos || pos.orderId !== target.orderId) {
      target = null;
      paint();
      return;
    }

    const price = payload && isFinite(payload.price) ? payload.price : snap.currentPrice;
    if (!isFinite(price)) return;

    const reached = target.side === "long" ? price >= target.price : price <= target.price;
    if (!reached) return;

    target = null;
    App.Trading.closePosition(); // 손익 계산은 전부 trading.js 그대로
    paint();
  }

  /* ---------------- 입력 ---------------- */
  function openInput() {
    if (!dom.box) return;
    dom.box.style.display = "";
    if (dom.priceInput) {
      const snap = App.Trading.getSnapshot();
      dom.priceInput.value = isFinite(snap.currentPrice) ? String(snap.currentPrice) : "";
      dom.priceInput.focus();
    }
  }

  function apply() {
    const snap = App.Trading.getSnapshot();
    const pos = snap.position;
    if (!pos) return;

    const raw = parseFloat(String((dom.priceInput && dom.priceInput.value) || "").replace(/[^0-9.]/g, ""));
    if (!isFinite(raw) || raw <= 0) {
      alert("청산 가격을 입력해주세요.");
      return;
    }

    // 이미 닿아 있는 가격이면 지정가를 걸자마자 청산돼 시장가와 같아집니다.
    const already = pos.side === "long" ? snap.currentPrice >= raw : snap.currentPrice <= raw;
    if (already) {
      alert(
        pos.side === "long"
          ? "롱 포지션의 지정가 청산은 현재가보다 높은 가격이어야 합니다."
          : "숏 포지션의 지정가 청산은 현재가보다 낮은 가격이어야 합니다."
      );
      return;
    }

    target = { price: raw, side: pos.side, orderId: pos.orderId };
    if (dom.box) dom.box.style.display = "none";
    paint();
  }

  function clear() {
    target = null;
    paint();
  }

  function init() {
    dom = {
      limitBtn: el("pos-close-limit"),
      box: el("pos-limit-box"),
      priceInput: el("pos-limit-price"),
      applyBtn: el("pos-limit-apply"),
      cancelBtn: el("pos-limit-cancel"),
      active: el("pos-limit-active"),
      activeText: el("pos-limit-active-text"),
      clearBtn: el("pos-limit-clear"),
    };
    if (!dom.limitBtn) return;

    dom.limitBtn.addEventListener("click", openInput);
    if (dom.applyBtn) dom.applyBtn.addEventListener("click", apply);
    if (dom.cancelBtn) dom.cancelBtn.addEventListener("click", () => { dom.box.style.display = "none"; });
    if (dom.clearBtn) dom.clearBtn.addEventListener("click", clear);

    if (App.Bus) {
      App.Bus.on("price:update", onPrice);
      App.Bus.on("trading:persisted", paint);
    }
    paint();
  }

  return { init, applyForTest: apply, onPriceForTest: onPrice, getTargetForTest: () => target };
})();
