/* =========================================================================
 * js/funding-qty-symbol.js — App.FundingQtySymbol
 * =========================================================================
 * 펀딩 정산 내역의 "수량" 칸이 종목을 안 보던 것 (2026-08-27, [P2] 표시 절반)
 *
 * ── 무엇이 잘못돼 있나 ────────────────────────────────────────────────
 *   js/ui.js:599   "<td>" + App.Utils.formatQty(f.positionSize) + "</td>"
 *
 *   formatQty 는 두 번째 인자(종목)를 안 주면 "지금 활성 종목" 으로
 *   떨어집니다(js/utils.js:78-80 activeSymbolOf). 그래서 삼성전자 차트를
 *   보는 동안 옛 비트코인 펀딩 행이 "0.050000 삼성전자" 로 보입니다.
 *   숫자도 단위도 그럴듯해서 회원은 고장인 줄 모릅니다.
 *
 *   짝인 거래내역 쪽(js/trade-history.js:147)은 이미 rowSymbol(t) 로
 *   고쳐졌습니다. 남은 절반이 여기입니다.
 *   기록 쪽 도장도 이미 찍힙니다 — js/symbol-sync-bridge.js 가
 *   fundingHistory 행에 f.symbol 을 남깁니다.
 *
 * ── 왜 새 파일인가 ────────────────────────────────────────────────────
 *   js/ui.js 는 수정 금지 파일입니다. 그래서 그린 뒤에 덮어씁니다
 *   (docs/인계문서.md 1-1 "DOM 후처리" 패턴).
 *
 * ── ★ 왜 MutationObserver 가 필요한가 ─────────────────────────────────
 *   js/ui.js:583-585 가 dirty check 를 합니다.
 *       if (list.length === lastFundingHistoryLength) return;
 *   즉 행 수가 바뀔 때만 다시 그립니다. 매 틱 덮이는 #pos-qty 와 다르게
 *   가격 이벤트로는 절대 다시 안 그려집니다.
 *   => 우리가 덮어쓴 값은 그대로 남습니다(경쟁하지 않습니다).
 *   => 대신 "다시 그려지는 순간" 을 이벤트로는 알 수 없으므로,
 *      tbody 의 자식이 갈릴 때(innerHTML 교체)를 관찰합니다.
 *
 *   관찰은 subtree:false 입니다. 우리가 td 안의 글자를 바꾸는 것은
 *   tbody 의 자식 목록을 안 건드리므로 되돌이(무한 루프)가 안 생깁니다.
 *
 * ── ★ 종목을 모르는 옛 행은 추측하지 않습니다 ─────────────────────────
 *   펀딩은 서버에 원본이 없습니다(js/supabase-sync.js 에 funding 표 없음).
 *   거래내역과 달리 대조할 곳이 없어서 BTCUSDT 로 채우면 그건 추측인데
 *   화면에는 사실처럼 보입니다. js/symbol-sync-bridge.js 도 같은 이유로
 *   옛 행을 비워 둡니다(tests/funding-symbol-stamp.test.js (2)(3)).
 *
 *   그래서 도장이 없는 행은 ★단위만★ 비웁니다 — "0.050000"
 *   수량 숫자 자체는 추측이 아니라 기록된 사실이라 남깁니다.
 *   (칸 전체를 "-" 로 하려면 아래 SHOW_NUMBER_WHEN_UNKNOWN 를 false 로.
 *    한 줄입니다.)
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   index.html 의 <script src="js/funding-qty-symbol.js"> 한 줄만 지우면
 *   원래대로 돌아갑니다. 다른 파일은 손대지 않았습니다.
 * ========================================================================= */

window.App = window.App || {};

App.FundingQtySymbol = (function () {
  "use strict";

  var BODY_ID = "funding-history-body";
  var QTY_COL = 2;                       // 정산시각 · 방향 · [수량] · 마크가격 · 펀딩비율 · 정산금액
  var SHOW_NUMBER_WHEN_UNKNOWN = true;   // false 로 두면 도장 없는 행은 "-"

  var body = null;
  var observer = null;
  var tries = 0;
  var MAX_TRIES = 120;                   // 0.5초 × 120 = 60초까지 기다립니다

  var counts = { repaints: 0, rewritten: 0, unknownRows: 0 };

  function decimals() {
    var d = App.Utils && typeof App.Utils.QTY_DECIMALS === "number" ? App.Utils.QTY_DECIMALS : 6;
    return d;
  }

  /* 단위 없이 숫자만 — formatQty 의 앞부분과 같은 모양입니다. */
  function numberOnly(n) {
    if (n === null || n === undefined || typeof n !== "number" || !isFinite(n)) return "-";
    var d = decimals();
    return n.toLocaleString("ko-KR", { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function cellText(f) {
    if (!f || typeof f !== "object") return null;
    var qty = f.positionSize;
    if (typeof f.symbol === "string" && f.symbol) {
      if (App.Utils && typeof App.Utils.formatQty === "function") {
        return App.Utils.formatQty(qty, f.symbol);
      }
      return numberOnly(qty);
    }
    counts.unknownRows++;
    return SHOW_NUMBER_WHEN_UNKNOWN ? numberOnly(qty) : "-";
  }

  /* 화면에 그려진 행 i 는 fundingHistory[i] 입니다
     (js/ui.js:591 list.slice(0, 50) 을 순서 그대로 map 합니다). */
  function history() {
    if (App.Trading && typeof App.Trading.getSnapshot === "function") {
      try {
        var snap = App.Trading.getSnapshot();
        if (snap && Array.isArray(snap.fundingHistory)) return snap.fundingHistory;
      } catch (e) { /* noop */ }
    }
    return null;
  }

  function repaint() {
    if (!body) return 0;
    var list = history();
    if (!list) return 0;
    var rows = body.children;
    var changed = 0;
    for (var i = 0; i < rows.length; i++) {
      var tr = rows[i];
      if (!tr || tr.className === "empty") continue;      // "내역이 없습니다" 줄
      var cell = tr.children ? tr.children[QTY_COL] : null;
      if (!cell) continue;
      var f = list[i];
      if (!f) continue;                                   // 짝을 못 찾으면 손대지 않습니다
      var text = cellText(f);
      if (text === null) continue;
      if (cell.textContent !== text) {
        cell.textContent = text;
        changed++;
      }
    }
    counts.repaints++;
    counts.rewritten += changed;
    return changed;
  }

  function attach() {
    if (body) return true;
    var el = document.getElementById(BODY_ID);
    if (!el) return false;
    body = el;
    if (typeof MutationObserver === "function") {
      observer = new MutationObserver(function () { repaint(); });
      /* subtree:false — td 글자를 바꾸는 우리 자신을 다시 부르지 않습니다. */
      observer.observe(body, { childList: true });
    }
    repaint();
    return true;
  }

  function poll() {
    if (attach()) return;
    if (++tries >= MAX_TRIES) return;
    setTimeout(poll, 500);
  }

  function init() {
    poll();
    if (App.Bus && typeof App.Bus.on === "function") {
      /* 실제 거래·정산이 있을 때만 옵니다(가격 틱마다 오지 않습니다).
         패널이 늦게 만들어진 경우의 보험이자, 도장이 방금 찍힌 행 반영용. */
      App.Bus.on("trading:persisted", function () {
        if (attach()) repaint();
      });
      /* 종목을 바꾸면 js/ui.js 는 다시 안 그리지만(행 수 그대로),
         혹시 다른 모듈이 다시 그렸을 때를 대비해 한 박자 뒤 확인합니다. */
      App.Bus.on("symbol:change", function () {
        setTimeout(function () { if (attach()) repaint(); }, 0);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    repaintForTest: repaint,
    cellTextForTest: cellText,
    countsForTest: function () { return counts; },
    QTY_COL: QTY_COL
  };
})();
