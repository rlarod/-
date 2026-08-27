/* =========================================================================
 * js/chart-position-lines.js — App.ChartPositionLines
 * =========================================================================
 * 차트에 "청산가 가로선" 과 "미체결 지정가 주문 가로선" 을 얹습니다.
 *
 * ── 왜 별도 파일인가 ──────────────────────────────────────────────────
 * js/chart.js 는 수정 금지 파일입니다. 그 파일은 진입가·TP·SL 선까지만
 * 그리고, 청산가와 미체결 주문은 그리지 않습니다.
 * 그래서 chart.js 를 한 글자도 건드리지 않고 그 위에 얹습니다.
 *
 * ── 이미 있는 것은 다시 그리지 않습니다 ───────────────────────────────
 *   진입가 (js/chart.js:454)  TP (:464)  SL (:474)  현재가 (:378)
 *   → 여기서는 손대지 않습니다. 또 그리면 선이 두 벌이 됩니다.
 *   여기서 새로 그리는 것은 아래 셋뿐입니다.
 *     1) 청산가            (position.liq)
 *     2) 미체결 지정가 진입 (snapshot.pendingOrder)
 *     3) 지정가 청산 예약   (App.LimitClose 의 목표가)
 *
 * ── 값을 다시 계산하지 않습니다 ───────────────────────────────────────
 * 청산가는 js/trading.js 의 calcLiquidationPrice 결과를 그대로 읽어
 * 그리기만 합니다. 계산식이 두 벌이 되면 화면과 실제가 어긋납니다.
 *
 * ── 차트는 어떻게 가져오나 ────────────────────────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받을 수 있습니다.
 * 거기서 라이브러리 공개 API 인 chart.panes()[n].getSeries() 로 캔들
 * 시리즈를 찾아, 그 시리즈에 가로선(createPriceLine)만 붙입니다.
 * chart.js 의 코드도, 캔들 시리즈의 설정(옵션)도 고치지 않습니다.
 *
 * (처음엔 우리 전용 빈 LineSeries 를 만들어 붙였는데, 데이터가 한 점도
 *  없는 시리즈는 가격→좌표 변환 기준값이 없어서 가로선이 화면에 아예
 *  안 그려졌습니다. 실측으로 확인했습니다.)
 *
 * ── 표시 통화 ─────────────────────────────────────────────────────────
 * 캔들 데이터는 항상 USDT 입니다(js/chart.js:155). 화면 표시 통화는
 * 회원마다 다릅니다(원화로 보는 회원이 있습니다).
 *   · 가격축 라벨 → 캔들 시리즈의 priceFormat.formatter 가 바꿔줍니다
 *     (js/chart.js 가 통화 전환 때 이미 다시 걸어줍니다)
 *   · 선 위의 글자(title) → 통화가 바뀌면 여기서 다시 씁니다
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * trading:update 는 시세 틱마다(초당 수십 번) 옵니다. 그래서 값이
 * 그대로면 아무것도 하지 않습니다(문자열 조립·객체 생성도 하지 않음).
 * js/chart.js:449 의 trackedPositionMarker 와 같은 방식입니다.
 *
 * ── 종목이 다르면 안 그립니다 (2026-08-27) ───────────────────────────
 * 차트에 그려진 종목이 포지션의 종목이 아니면 세 선을 다 내립니다.
 * 판단은 js/chart-position-symbol.js 한 곳에서만 하고 여기서는 결과만
 * 읽습니다(symbolMatches). 그 파일이 없으면 지금까지처럼 그대로 그립니다.
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 * index.html 의 <script src="js/chart-position-lines.js"></script> 한 줄을
 * 지우면 원래대로 돌아갑니다. 이 파일은 다른 파일을 고치지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartPositionLines = (function () {
  "use strict";

  /* 확정 팔레트에서만 고릅니다. 새 색을 만들지 않습니다.
       하락 #F0506E — 청산가
       포인트 #F0B429 — 미체결(아직 일어나지 않은 예약) */
  var COLOR_LIQ = "#F0506E";
  var COLOR_PENDING = "#F0B429";

  /* 청산가는 하락색 캔들(#F6465D)과 색이 비슷해서 1px 이면 묻힙니다.
     사이트의 다른 선은 전부 1px 이라, 2px 로 두면 굵기만으로 구분됩니다. */
  var WIDTH_LIQ = 2;
  var WIDTH_PENDING = 1;

  /* 선 위 글자에 가격까지 적을지 여부.
     true  — "청산가 108,194,922원"  (가격축 라벨과 숫자가 두 번 나옵니다)
     false — "청산가"                (기존 진입가·TP·SL 과 같은 모양)
     한 글자만 바꾸면 됩니다. */
  var SHOW_PRICE_IN_TITLE = true;

  /* 좁은 화면에서는 가격을 빼고 이름만 적습니다.
     실측(2026-08-25, 360px): "미체결 롱 78,575.32" 라벨이 차트 폭보다 길어
     왼쪽 글자가 잘렸습니다. 가격은 가격축 라벨에 그대로 나오므로
     이름만 남겨도 잃는 정보가 없습니다.
     기준 600px — 360/375/390/768 중 768만 가격까지 나옵니다. */
  var NARROW_LIMIT = 600;

  var chart = null;
  var series = null; // chart.js 가 만든 캔들 시리즈 (찾아서 쓰기만 합니다)

  var lines = { liq: null, pending: null, limitClose: null };

  /* 마지막으로 그린 값. 이것과 같으면 아무 일도 하지 않습니다. */
  var drawn = {
    liqPrice: null,
    liqSide: null,
    pendingId: null,
    pendingPrice: null,
    pendingSide: null,
    lcOrderId: null,
    lcPrice: null,
    lcSide: null,
  };

  function fmt(usd) {
    try {
      if (App.Utils && typeof App.Utils.formatCurrencyPlain === "function") {
        return App.Utils.formatCurrencyPlain(usd);
      }
    } catch (e) {
      /* 아래 기본 표기로 */
    }
    return String(usd);
  }

  function LC() {
    return window.LightweightCharts;
  }

  /* ---------------- 시리즈 찾기 ----------------
   * chart.js 가 만든 캔들 시리즈를 라이브러리 공개 API 로 찾습니다.
   * 옵션을 바꾸지 않고, 가로선만 붙입니다.
   * ------------------------------------------------------------------- */
  function ensureSeries() {
    if (series) return true;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return false;

    var charts = App.ChartFont.getCharts();
    if (!charts || !charts.length) return false;

    chart = charts[0];
    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          if (list[j].seriesType && list[j].seriesType() === "Candlestick") {
            series = list[j];
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("[chart-position-lines.js] 캔들 시리즈를 찾지 못했습니다:", e);
      return false;
    }
    return false;
  }

  /* ---------------- 선 하나 만들기/지우기 ---------------- */
  function removeLine(key) {
    if (!lines[key]) return;
    try {
      series.removePriceLine(lines[key]);
    } catch (e) {
      /* 이미 지워진 경우 무시 */
    }
    lines[key] = null;
  }

  function createLine(key, price, color, width, dashed, title) {
    removeLine(key);
    var lc = LC();
    try {
      lines[key] = series.createPriceLine({
        price: price,
        color: color,
        lineWidth: width,
        lineStyle: dashed ? lc.LineStyle.Dashed : lc.LineStyle.Solid,
        axisLabelVisible: true,
        title: title,
      });
    } catch (e) {
      console.warn("[chart-position-lines.js] 선을 그리지 못했습니다:", e);
      lines[key] = null;
    }
  }

  /* ---------------- 제목(선 위 글자) ---------------- */
  function wideEnough() {
    try {
      var box = document.getElementById("chart_container");
      if (!box) return false;
      return box.getBoundingClientRect().width >= NARROW_LIMIT;
    } catch (e) {
      return false;
    }
  }

  function withPrice(label, price) {
    return SHOW_PRICE_IN_TITLE && wideEnough() ? label + " " + fmt(price) : label;
  }
  function liqTitle(side, price) {
    return withPrice("청산가", price);
  }
  function pendingTitle(side, price) {
    return withPrice("미체결 " + (side === "long" ? "롱" : "숏"), price);
  }
  function limitCloseTitle(side, price) {
    return withPrice("지정가 청산", price);
  }

  /* ---------------- 미체결 지정가 청산 예약 읽기 ----------------
   * js/limit-close.js 가 들고 있는 목표가입니다(포지션당 하나).
   * 없으면 null 입니다. 읽기만 합니다.
   * ------------------------------------------------------------------- */
  /* ---------------- 차트 종목 == 포지션 종목 인가 ----------------
   * 판단은 js/chart-position-symbol.js 가 합니다(포지션이 어느 종목에서
   * 열렸는지 그 파일이 적어 둡니다). 여기서는 결과만 읽습니다.
   * 그 파일이 없으면 true 를 돌려 지금까지의 동작을 그대로 둡니다.
   * ------------------------------------------------------------------- */
  function symbolMatches() {
    try {
      if (App.ChartPositionSymbol && typeof App.ChartPositionSymbol.matches === "function") {
        return !!App.ChartPositionSymbol.matches();
      }
    } catch (e) {
      /* 판단을 못 하면 지금까지처럼 그립니다 */
    }
    return true;
  }

  function readLimitClose() {
    try {
      if (App.LimitClose && typeof App.LimitClose.getTargetForTest === "function") {
        return App.LimitClose.getTargetForTest() || null;
      }
    } catch (e) {
      /* 무시 */
    }
    return null;
  }

  /* ---------------- 본체 ----------------
   * 시세 틱마다 불립니다. 바뀐 것만 손댑니다.
   * ------------------------------------------------------------------- */
  function apply(snapshot) {
    if (!snapshot) return;
    if (!ensureSeries()) return;

    var pos = snapshot.position || null;
    var pending = snapshot.pendingOrder || null;
    var lc = readLimitClose();

    /* 지금 보고 있는 차트가 포지션의 종목이 아니면 세 선을 다 내립니다.
       삼성전자(193 USDT) 캔들에 비트코인 청산가 71,100 짜리 가로선이
       붙으면 회원이 그 값을 삼성전자 청산가로 읽습니다.
       판단은 js/chart-position-symbol.js 한 곳에서만 합니다 — 여기서
       종목을 또 따지면 기준이 두 벌이 됩니다.
       그 파일이 없으면(스크립트를 뺐으면) 지금까지처럼 그대로 그립니다. */
    if (!symbolMatches()) {
      pos = null;
      pending = null;
      lc = null;
    }

    /* --- 1. 청산가 --- */
    var liqPrice = pos && typeof pos.liq === "number" && isFinite(pos.liq) ? pos.liq : null;
    var liqSide = pos ? pos.side : null;
    if (liqPrice !== drawn.liqPrice || liqSide !== drawn.liqSide) {
      if (liqPrice === null) {
        removeLine("liq");
      } else {
        createLine("liq", liqPrice, COLOR_LIQ, WIDTH_LIQ, false, liqTitle(liqSide, liqPrice));
      }
      drawn.liqPrice = liqPrice;
      drawn.liqSide = liqSide;
    }

    /* --- 2. 미체결 지정가 진입 주문 --- */
    var pId = pending ? pending.id : null;
    var pPrice = pending && typeof pending.price === "number" ? pending.price : null;
    var pSide = pending ? pending.side : null;
    if (pId !== drawn.pendingId || pPrice !== drawn.pendingPrice || pSide !== drawn.pendingSide) {
      if (pPrice === null) {
        removeLine("pending");
      } else {
        createLine("pending", pPrice, COLOR_PENDING, WIDTH_PENDING, true, pendingTitle(pSide, pPrice));
      }
      drawn.pendingId = pId;
      drawn.pendingPrice = pPrice;
      drawn.pendingSide = pSide;
    }

    /* --- 3. 지정가 청산 예약 --- */
    var lcId = lc ? lc.orderId : null;
    var lcPrice = lc && typeof lc.price === "number" ? lc.price : null;
    var lcSide = lc ? lc.side : null;
    if (lcId !== drawn.lcOrderId || lcPrice !== drawn.lcPrice || lcSide !== drawn.lcSide) {
      if (lcPrice === null) {
        removeLine("limitClose");
      } else {
        createLine("limitClose", lcPrice, COLOR_PENDING, WIDTH_PENDING, true, limitCloseTitle(lcSide, lcPrice));
      }
      drawn.lcOrderId = lcId;
      drawn.lcPrice = lcPrice;
      drawn.lcSide = lcSide;
    }
  }

  /* ---------------- 선 위 글자 다시 쓰기 ----------------
   * 통화가 바뀌거나(원화↔USDT) 화면 폭이 바뀌었을 때 부릅니다.
   * 가격축 라벨은 캔들 시리즈의 priceFormat 이 바꿔줍니다(js/chart.js 담당).
   * 선 위 글자만 여기서 다시 씁니다.
   * 값(USDT)은 그대로 두고 표시만 바꿉니다.
   * ------------------------------------------------------------------- */
  function retitle() {
    if (!series) return;
    try {
      if (lines.liq && drawn.liqPrice !== null) {
        lines.liq.applyOptions({ title: liqTitle(drawn.liqSide, drawn.liqPrice) });
      }
      if (lines.pending && drawn.pendingPrice !== null) {
        lines.pending.applyOptions({ title: pendingTitle(drawn.pendingSide, drawn.pendingPrice) });
      }
      if (lines.limitClose && drawn.lcPrice !== null) {
        lines.limitClose.applyOptions({ title: limitCloseTitle(drawn.lcSide, drawn.lcPrice) });
      }
    } catch (e) {
      /* 무시 */
    }
  }

  /* 로그아웃/계정 전환처럼 스냅샷이 아예 사라지는 경우를 위한 전체 지우기 */
  function clearAll() {
    if (!series) return;
    removeLine("liq");
    removeLine("pending");
    removeLine("limitClose");
    drawn.liqPrice = null;
    drawn.liqSide = null;
    drawn.pendingId = null;
    drawn.pendingPrice = null;
    drawn.pendingSide = null;
    drawn.lcOrderId = null;
    drawn.lcPrice = null;
    drawn.lcSide = null;
  }

  function currentSnapshot() {
    try {
      if (App.Trading && typeof App.Trading.getSnapshot === "function") return App.Trading.getSnapshot();
    } catch (e) {
      /* 무시 */
    }
    return null;
  }

  function init() {
    if (!App.Bus || typeof App.Bus.on !== "function") return;

    App.Bus.on("trading:update", apply);
    /* 지정가 청산 예약(js/limit-close.js)은 자체 이벤트가 없어서,
       같은 틱마다 오는 trading:update 안에서 함께 확인합니다(위 apply).
       저장/복원 직후에도 한 번 맞춰줍니다. */
    App.Bus.on("trading:persisted", apply);
    App.Bus.on("currency:change", retitle);

    /* 화면 폭이 바뀌면(회전·창 크기 조절) 라벨 길이를 다시 정합니다.
       연속으로 오는 resize 는 마지막 것만 처리합니다. */
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = null;
        retitle();
      }, 200);
    });

    /* 차트는 chart.js 가 나중에 만듭니다. 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var timer = setInterval(function () {
      if (ensureSeries()) {
        clearInterval(timer);
        apply(currentSnapshot());
      } else if (++tries > 200) {
        clearInterval(timer);
      }
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    apply: apply,
    clearAll: clearAll,
    refreshCurrency: retitle,
    retitle: retitle,
    getLinesForTest: function () {
      return { liq: lines.liq, pending: lines.pending, limitClose: lines.limitClose };
    },
    getDrawnForTest: function () {
      return {
        liqPrice: drawn.liqPrice,
        liqSide: drawn.liqSide,
        pendingId: drawn.pendingId,
        pendingPrice: drawn.pendingPrice,
        pendingSide: drawn.pendingSide,
        lcOrderId: drawn.lcOrderId,
        lcPrice: drawn.lcPrice,
        lcSide: drawn.lcSide,
      };
    },
    getSeriesForTest: function () {
      return series;
    },
  };
})();
