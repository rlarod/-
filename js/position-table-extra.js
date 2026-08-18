/* =========================================================================
 * js/position-table-extra.js — App.PositionTableExtra
 * =========================================================================
 * 포지션 표에 레퍼런스와 같은 칸을 채웁니다.
 *   금액(포지션 가치) · 유지증거금 · 실현손익 · 청산(시장가) 버튼
 *
 * js/ui.js(수정 금지 파일)가 기존 칸들을 그리고 있어서, 이 모듈은 ui.js가
 * 손대지 않는 새 칸만 채웁니다. 계산은 전부 App.Trading의 공개 값에서
 * 가져오고, 여기서 손익이나 잔고를 새로 계산하지 않습니다.
 *
 * 유지증거금률(MMR)은 trading.js 안의 상수라 밖에서 읽을 수 없습니다.
 * 같은 값을 여기에 또 적어두면 한쪽만 바뀌었을 때 숫자가 어긋나므로,
 * 공개 API인 calcLiquidationPrice()에서 역산해 항상 같은 값을 씁니다.
 *   long  : liq = entry × (1 − 1/lev + MMR)  →  MMR = liq/entry − 1 + 1/lev
 * ========================================================================= */

window.App = window.App || {};

App.PositionTableExtra = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 유지증거금률 역산 ---------------- */
  function getMMR() {
    if (!App.Trading || typeof App.Trading.calcLiquidationPrice !== "function") return null;
    const entry = 10000;
    const lev = 10;
    const liq = App.Trading.calcLiquidationPrice("long", entry, lev);
    if (!isFinite(liq) || liq <= 0) return null;
    const mmr = liq / entry - 1 + 1 / lev;
    // 상식적인 범위를 벗어나면 표시하지 않습니다(잘못된 숫자를 보여주느니 "-").
    return mmr >= 0 && mmr < 0.1 ? mmr : null;
  }

  /* ---------------- 표시 ---------------- */
  function fmt(v) {
    return App.Utils.formatCurrencyPlain(v);
  }

  function render() {
    if (!dom.notional) return;
    // ui.js가 TP/SL·진입수수료 칸과 부분청산 줄을 나중에 만들기 때문에,
    // 그릴 때마다 다시 확인합니다.
    hideExtraColumns();
    hideExtraRows();
    const snap = App.Trading.getSnapshot();
    const pos = snap.position;

    // 실현손익은 포지션이 없어도 계속 의미가 있는 값입니다.
    if (dom.realized) {
      dom.realized.textContent = App.Utils.formatCurrencySigned(snap.realizedPnl);
      dom.realized.className =
        "mobile-hide " +
        (snap.realizedPnl > 0 ? "pnl-positive" : snap.realizedPnl < 0 ? "pnl-negative" : "");
    }

    if (!pos) {
      dom.notional.textContent = "-";
      if (dom.maint) dom.maint.textContent = "-";
      if (dom.closeBtn) dom.closeBtn.disabled = true;
      return;
    }

    const price = snap.currentPrice;
    // 금액 = 포지션 가치(수량 × 현재가). 현재가가 아직 없으면 진입가 기준.
    const ref = price && isFinite(price) ? price : pos.entry;
    const notional = pos.qty * ref; // trading.js의 포지션 필드명은 qty
    dom.notional.textContent = fmt(notional);

    if (dom.maint) {
      const mmr = getMMR();
      dom.maint.textContent = mmr === null ? "-" : fmt(notional * mmr);
    }

    if (dom.closeBtn) dom.closeBtn.disabled = false;
  }

  /* ---------------- 레퍼런스에 없는 칸 숨김 ---------------- */
  // 레퍼런스 포지션 표의 칸 구성:
  //   종목 수량 금액 진입가 현재가 강제청산가 개시증거금 유지증거금 미실현손익 실현손익 청산
  // 우리 표에만 있던 아래 4개는 화면에서만 숨깁니다. 마크업과 ui.js의 값
  // 채우기는 그대로라, 이 배열을 비우면 즉시 다시 보입니다.
  const HIDDEN_COLUMNS = ["pos-tp", "pos-sl", "pos-entry-fee", "pos-return-rate"];

  // 레퍼런스 포지션 영역에는 부분청산 줄이 없고, 청산 칸의 지정가/시장가가
  // 그 역할을 합니다. 아래 두 줄은 화면에서만 숨깁니다(ui.js는 무수정).
  const HIDDEN_ROWS = ["partial-close-row", "partial-close-custom-row"];

  function hideExtraRows() {
    HIDDEN_ROWS.forEach((id) => {
      const row = el(id);
      if (row) row.classList.add("position-col-hidden");
    });
  }

  function hideExtraColumns() {
    const head = el("position-thead-row");
    const body = el("position-tbody-row");
    if (!head || !body) return;
    HIDDEN_COLUMNS.forEach((id) => {
      const td = el(id);
      if (!td) return; // ui.js가 아직 안 만들었으면 다음 호출 때 처리
      const idx = Array.prototype.indexOf.call(body.children, td);
      if (idx < 0) return;
      td.classList.add("position-col-hidden");
      const th = head.children[idx];
      if (th) th.classList.add("position-col-hidden");
    });
  }

  function init() {
    dom = {
      notional: el("pos-notional"),
      maint: el("pos-maint-margin"),
      realized: el("pos-realized"),
      closeBtn: el("pos-close-market"),
    };
    if (!dom.notional) return;

    if (dom.closeBtn) {
      dom.closeBtn.addEventListener("click", () => {
        // 청산은 trading.js의 기존 함수를 그대로 부릅니다(계산 로직 재구현 없음).
        const snap = App.Trading.getSnapshot();
        if (!snap.position) return;
        App.Trading.closePosition();
      });
    }

    hideExtraColumns();
    hideExtraRows();
    // ui.js가 부분청산 줄을 뒤늦게 만드는 경우가 있어 잠깐 뒤 한 번 더 확인합니다.
    setTimeout(hideExtraRows, 0);
    setTimeout(hideExtraRows, 500);

    if (App.Bus) {
      App.Bus.on("price:update", render);
      App.Bus.on("trading:persisted", render);
    }
    render();
  }

  return { init, renderForTest: render, getMMRForTest: getMMR, hiddenColumnsForTest: HIDDEN_COLUMNS };
})();
