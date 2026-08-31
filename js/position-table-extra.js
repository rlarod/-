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
 * 유지증거금은 2026-08-31 대표 결재로 바이낸스 구간표를 따릅니다.
 *   유지증거금 = 명목 × 구간 유지증거금률 − 구간 공제액   (js/risk-brackets.js)
 * 구간마다 값이 달라 고정값 하나로는 표시할 수 없습니다. 같은 값을 여기에
 * 또 적으면 한쪽만 바뀌었을 때 숫자가 어긋나므로, trading.js 의 공개 API
 * maintenanceMargin() 을 그대로 씁니다.
 * 그것도 없는 아주 옛 버전에서는 예전처럼 calcLiquidationPrice() 에서 역산합니다.
 *   long  : liq = entry × (1 − 1/lev + MMR)  →  MMR = liq/entry − 1 + 1/lev
 * ========================================================================= */

window.App = window.App || {};

App.PositionTableExtra = (function () {
  "use strict";

  let dom = {};

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- 지금 포지션의 명목(USDT) ---------------- */
  // 구간을 고르려면 명목이 필요합니다. render() 와 같은 기준(수량 × 현재가)을 씁니다.
  function currentNotional() {
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return null;
    const snap = App.Trading.getSnapshot();
    const pos = snap && snap.position;
    if (!pos) return null;
    const price = snap.currentPrice;
    const ref = price && isFinite(price) ? price : pos.entry;
    const n = pos.qty * ref;
    return isFinite(n) && n > 0 ? n : null;
  }

  /* ---------------- 유지증거금률(구간별) ---------------- */
  function getMMR(notional) {
    const n = typeof notional === "number" && isFinite(notional) && notional > 0 ? notional : currentNotional();
    const RB = App.RiskBrackets;
    if (RB && typeof RB.mmr === "function" && n) {
      const r = RB.mmr(n);
      if (isFinite(r) && r > 0 && r < 1) return r;
    }
    // 구간표를 못 읽을 때만 — 예전 방식(공개 API에서 역산)
    if (!App.Trading || typeof App.Trading.calcLiquidationPrice !== "function") return null;
    const entry = 10000;
    const lev = 10;
    const liq = App.Trading.calcLiquidationPrice("long", entry, lev);
    if (!isFinite(liq) || liq <= 0) return null;
    const mmr = liq / entry - 1 + 1 / lev;
    // 상식적인 범위를 벗어나면 표시하지 않습니다(잘못된 숫자를 보여주느니 "-").
    return mmr >= 0 && mmr < 0.1 ? mmr : null;
  }

  /* ---------------- 유지증거금(USDT) ---------------- */
  // 공제액까지 반영된 값은 거래 엔진만 알고 있으므로 그 값을 그대로 씁니다.
  function getMaintenanceMargin(notional) {
    if (App.Trading && typeof App.Trading.maintenanceMargin === "function") {
      const mm = App.Trading.maintenanceMargin(notional);
      if (typeof mm === "number" && isFinite(mm) && mm >= 0) return mm;
    }
    const mmr = getMMR(notional);
    return mmr === null ? null : notional * mmr;
  }

  /* ---------------- 표시 ---------------- */
  function fmt(v) {
    return App.Utils.formatCurrencyPlain(v);
  }

  /* ---------------- USDT + KRW 두 줄 표기 ---------------- */
  // 레퍼런스는 금액 칸마다 USDT 값 아래에 =원화를 함께 보여줍니다.
  // 환율은 App.Config.USD_KRW 하나만 씁니다(다른 곳에 또 적지 않음).
  // 1억 이상은 "3.08억", 1만 이상은 "3,085만", 그 미만은 그대로.
  function shortKrw(n) {
    const abs = Math.abs(n);
    if (abs >= 100000000) return (n / 100000000).toFixed(2) + "억";
    if (abs >= 10000) return Math.round(n / 10000).toLocaleString("ko-KR") + "만";
    return n.toLocaleString("ko-KR");
  }

  function money(usd, opts) {
    const o = opts || {};
    if (usd === null || usd === undefined || !isFinite(usd)) return "-";

    // 진입가·현재가·강제청산가는 ui.js가 선택된 통화로 그립니다.
    // 여기만 USDT로 고정하면 한 표 안에서 단위가 섞여 값을 오해하게 됩니다.
    // 선택된 통화를 첫 줄에, 나머지 통화를 둘째 줄에 둡니다.
    const krwMode = !!(App.Config && App.Config.getDisplayCurrency() === "KRW");
    const sign = o.signed && usd > 0 ? "+" : "";
    // 소수 4자리는 칸을 크게 잡아먹어 글자를 키울 수 없었습니다.
    // 값이 클수록 소수 자리를 줄입니다(10만 이상이면 소수 없이).
    const abs = Math.abs(usd);
    const dp = abs >= 100000 ? 0 : abs >= 1000 ? 2 : 4;
    const usdt =
      sign + usd.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + " USDT";
    // 원화는 자릿수가 길어(3억이면 9자리) 칸을 잡아먹습니다.
    // 억/만 단위로 줄여 표시해 글자를 키울 여유를 만듭니다.
    const krwNum = Math.round(usd * App.Config.USD_KRW);
    const krwSign = sign && krwNum > 0 ? "+" : "";
    /* 2026-08-28 디자인팀 — 원화 "값" 은 기호를 앞에 붙입니다(₩120,317,550).
       위 fmt()/App.Utils.formatCurrencyPlain 과 같은 규칙이라 같은 표 안에서
       진입가와 금액이 같은 모양이 됩니다. 축약형도 "$3.08M" 과 같은 꼴로
       "₩3.08억" 이 됩니다. 되돌리려면 `"₩" +` 를 빼고 뒤에 + "원" 을 붙입니다. */
    const krwFull = krwSign + "₩" + krwNum.toLocaleString("ko-KR");
    const krwShort = "≈" + krwSign + "₩" + shortKrw(krwNum);

    // 원화 모드: 원화가 주(主), USDT가 보조
    if (krwMode) return { usdt: krwFull, krw: "≈" + usdt };
    return { usdt: usdt, krw: krwShort };
  }

  function paintMoney(cell, usd, opts) {
    if (!cell) return;
    const m = money(usd, opts);
    if (m === "-") {
      cell.textContent = "-";
      return;
    }
    cell.innerHTML = "";
    const a = document.createElement("div");
    a.className = "pos-money-usdt";
    a.textContent = m.usdt;
    const b = document.createElement("div");
    b.className = "pos-money-krw";
    b.textContent = m.krw;
    cell.appendChild(a);
    cell.appendChild(b);
  }

  /* ---------------- 탭 이름을 레퍼런스와 맞춤 ---------------- */
  // ui.js가 만든 탭입니다. 마크업을 지우지 않고 글자만 바꾸고,
  // 레퍼런스에 없는 "자산" 탭은 화면에서만 숨깁니다.
  function renameTabs() {
    // ui.js가 만든 탭 줄 — 포지션 탭 버튼의 부모로 찾습니다(클래스명에 의존 안 함).
    const anchor = el("tab-btn-position");
    const row = anchor ? anchor.parentElement : null;
    if (!row) return;
    // ui.js가 개수를 갱신하면서 글자를 매번 다시 쓰므로, 한 번만 바꾸면
    // 원래 이름으로 돌아갑니다. 그릴 때마다 다시 적용합니다.
    Array.prototype.forEach.call(row.children, (btn) => {
      const tab = btn.dataset.tab;
      const txt = btn.textContent.trim();
      if (tab === "pending" && txt.indexOf("미체결주문") !== 0) {
        btn.textContent = txt.replace("미체결", "미체결주문");
      }
      // 레퍼런스의 주문내역/마감손익에는 개수가 붙지 않습니다.
      if (tab === "orders" && txt !== "주문내역") btn.textContent = "주문내역";
      if (tab === "history" && txt !== "마감손익") btn.textContent = "마감손익";
      if (tab === "assets") btn.classList.add("ref-tab-hidden");
    });
  }

  function render() {
    if (!dom.notional) return;
    // ui.js가 TP/SL·진입수수료 칸과 부분청산 줄을 나중에 만들기 때문에,
    // 그릴 때마다 다시 확인합니다.
    hideExtraColumns();
    hideExtraRows();
    renameTabs();
    // 원화 모드는 가격 자릿수가 길어 칸 배분이 달라야 합니다(CSS에서 처리).
    document.documentElement.setAttribute(
      "data-currency",
      App.Config && App.Config.getDisplayCurrency() === "KRW" ? "KRW" : "USDT"
    );
    const snap = App.Trading.getSnapshot();
    const pos = snap.position;

    // 실현손익은 포지션이 없어도 계속 의미가 있는 값입니다.
    if (dom.realized) {
      paintMoney(dom.realized, snap.realizedPnl, { signed: true });
      dom.realized.className =
        "mobile-hide " +
        (snap.realizedPnl > 0 ? "pnl-positive" : snap.realizedPnl < 0 ? "pnl-negative" : "");
    }

    // 개시증거금 · 미실현손익은 ui.js가 채운 뒤라 여기서 두 줄 표기로 바꿉니다.
    // (ui.js는 수정 금지 파일이라 출력 형식을 바꿀 수 없어, 그린 뒤에 다시 씁니다.)
    if (dom.marginCell) paintMoney(dom.marginCell, pos ? pos.margin : null);
    // 미실현손익도 같은 이유로 칸을 통째로 비우지 않습니다.
    // #pos-pnl / #pos-pnl-pct 는 ui.js가 값을 쓰는 요소라 그대로 두고,
    // 글자만 USDT 표기로 바꾸고 원화 줄을 아래에 덧붙입니다.
    if (dom.pnlEl && pos) {
      const m = money(snap.unrealizedPnl, { signed: true });
      dom.pnlEl.textContent = m === "-" ? "-" : m.usdt;
      if (dom.pnlPctEl) dom.pnlPctEl.textContent = App.Utils.formatPercent(snap.roe);
      if (dom.pnlCell) {
        let krw = dom.pnlCell.querySelector(".pos-money-krw");
        if (!krw) {
          krw = document.createElement("div");
          krw.className = "pos-money-krw";
          dom.pnlCell.appendChild(krw);
        }
        krw.textContent = m === "-" ? "" : m.krw;
      }
    }

    // 일괄청산 버튼은 포지션이 있을 때만 의미가 있습니다.
    if (dom.closeAllBtn) dom.closeAllBtn.disabled = !pos;

    if (!pos) {
      dom.notional.textContent = "-";
      if (dom.maint) dom.maint.textContent = "-";
      if (dom.closeBtn) dom.closeBtn.disabled = true;
      return;
    }

    // 수량 — 레퍼런스는 단위 없이 숫자만 보여줍니다(224.354).
    // ui.js가 "+16.011486 BTC"로 써두면 칸이 부족해 잘리므로 단위만 뗍니다.
    // 방향(+/-)과 색은 ui.js가 넣은 그대로 유지합니다.
    if (dom.qtyCell) {
      const t = dom.qtyCell.textContent;
      if (t.indexOf(" BTC") !== -1) dom.qtyCell.textContent = t.replace(/\s*BTC\s*$/, "");
    }

    // 종목 부제 — 레퍼런스의 "Isolated 93.00x" 자리.
    // 우리 주문창은 교차(Cross) 방식이라 그대로 적습니다(없는 방식을 적지 않음).
    //
    // 주의: 이 칸 안에는 ui.js가 값을 쓰는 #pos-leverage 가 들어 있습니다.
    // textContent로 통째로 덮어쓰면 그 요소가 사라지고, ui.js가 거기에 값을
    // 넣다가 멈춰 뒤에 오는 수량·강제청산가가 비어버립니다(실제로 재현됨).
    // 그래서 #pos-leverage 는 그대로 두고 주변 글자만 바꿉니다.
    if (dom.levEl) {
      dom.levEl.textContent = Number(pos.leverage).toFixed(2) + "x";
      if (dom.symbolSub && dom.symbolSub.firstChild !== dom.prefixNode) {
        dom.symbolSub.insertBefore(dom.prefixNode, dom.symbolSub.firstChild);
      }
      // "· 무기한" 같은 뒤쪽 텍스트는 레퍼런스에 없으므로 비웁니다.
      let n = dom.levEl.nextSibling;
      while (n) {
        const next = n.nextSibling;
        dom.symbolSub.removeChild(n);
        n = next;
      }
    }

    const price = snap.currentPrice;
    // 금액 = 포지션 가치(수량 × 현재가). 현재가가 아직 없으면 진입가 기준.
    const ref = price && isFinite(price) ? price : pos.entry;
    const notional = pos.qty * ref; // trading.js의 포지션 필드명은 qty
    paintMoney(dom.notional, notional);

    if (dom.maint) {
      const maint = getMaintenanceMargin(notional);
      if (maint === null) dom.maint.textContent = "-";
      else paintMoney(dom.maint, maint);
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
  const HIDDEN_ROWS = [
    "partial-close-row",
    "partial-close-custom-row",
    // 레퍼런스 포지션 영역에는 표 아래 상시 거래내역이 없습니다.
    // 같은 내용은 "마감손익" 탭에서 볼 수 있어 화면에서만 숨깁니다.
    "cloud-history-panel",
  ];

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
      marginCell: el("pos-margin"),
      pnlCell: el("pos-pnl-cell"),
      symbolSub: document.querySelector(".position-symbol-sub"),
      levEl: el("pos-leverage"),
      qtyCell: el("pos-qty"),
      pnlEl: el("pos-pnl"),
      pnlPctEl: el("pos-pnl-pct"),
      prefixNode: document.createTextNode("Cross "),
      closeAllBtn: el("pos-close-all"),
    };
    if (!dom.notional) return;

    if (dom.closeAllBtn) {
      dom.closeAllBtn.addEventListener("click", () => {
        // 포지션이 하나뿐인 구조라 시장가 전체청산과 같은 동작입니다.
        if (!App.Trading.getSnapshot().position) return;
        App.Trading.closePosition();
      });
    }

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
      // 통화를 바꾸면 표의 단위도 함께 바뀌어야 합니다.
      // ui.js도 같은 이벤트로 개시증거금·미실현손익을 다시 그리므로,
      // 그 뒤에 우리가 덮어쓰도록 한 박자 늦게 실행합니다.
      App.Bus.on("currency:change", () => setTimeout(render, 0));
    }
    render();
  }

  return { init, renderForTest: render, getMMRForTest: getMMR, hiddenColumnsForTest: HIDDEN_COLUMNS };
})();
