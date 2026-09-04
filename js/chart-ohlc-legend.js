/* =========================================================================
 * js/chart-ohlc-legend.js — App.ChartOhlcLegend
 * =========================================================================
 * 차트 왼쪽 위에 지금 보고 있는 봉의 시가·고가·저가·종가와 변동을 보여 줍니다.
 * ★차트 시스템은 트레이딩뷰를 따라갑니다★ (2026-09-02 대표 지시).
 *
 * ── 트레이딩뷰 실측 (2026-09-02, 로그아웃 상태) ───────────────────────
 * www.tradingview.com/chart/?symbol=BINANCE:BTCUSDT 를 1440x900 으로 열어
 * 범례 글자와 계산된 CSS 를 그대로 읽었습니다.
 *
 *   O 77,439.01   H 77,792.00   L 76,718.48   C 76,826.46   −612.54 (−0.79%)
 *
 *   · 이름표 O H L C 는 본문색, 숫자는 ★봉 방향 색★ 입니다
 *     (그날 내림봉이라 숫자가 rgb(242,54,69) 빨강이었습니다)
 *   · 글씨 13px / weight 400
 *   · ★변동은 "종가 − 시가" 입니다★ — 앞 봉 종가가 아닙니다.
 *     그 자리에서 검산했습니다 : 76,826.46 − 77,439.01 = −612.55 ≈ −612.54
 *     퍼센트도 시가 기준입니다 : −612.54 / 77,439.01 = −0.791% ≈ −0.79%
 *     ⚠ 이건 추측이 아니라 실제 화면 숫자로 확인한 것입니다. 앞 봉 종가로
 *       계산하면 부호가 봉 색과 어긋나 회원이 고장으로 봅니다.
 *
 * ── 트레이딩뷰와 일부러 다르게 한 것 ──────────────────────────────────
 *   글씨 크기   트레이딩뷰 13px  ->  우리 17px
 *     대표가 작은 글씨를 못 읽습니다. 팝업 글씨를 키우라는 지시가 세 번
 *     있었습니다(MEMORY: "팝업창 글씨는 아직 작다"). 트레이딩뷰를 천장으로
 *     쓰지 않습니다. 색·순서·계산식은 트레이딩뷰 그대로입니다.
 *   놓는 자리   트레이딩뷰는 차트 ★위에 겹쳐★ 그립니다  ->  우리는 ★자기 줄★
 *     360px 에서 차트를 가리면 안 된다는 조건이 있었습니다. 겹쳐 그리면
 *     반드시 봉을 덮습니다(그 폭에서는 지표 칩 .tl-ind-bar 가 이미 위쪽
 *     76px 을 덮고 있습니다). 그래서 도구 막대와 차트 사이에 자기 줄로
 *     넣습니다 — 어느 폭에서도 봉을 ★0px★ 가립니다.
 *
 * ── 값이 어디서 오나 ──────────────────────────────────────────────────
 *   십자선을 움직이는 중 : chart.subscribeCrosshairMove 가 준 그 봉
 *   십자선이 차트 밖     : ★마지막 봉★ (트레이딩뷰와 같습니다)
 *   마지막 봉 갱신       : App.Bus 의 "kline:update" 를 그대로 씁니다.
 *                          js/chart.js 가 캔들을 그릴 때 쓰는 바로 그 값이라
 *                          화면과 이 줄이 어긋나지 않습니다.
 *   숫자 표기            : App.Utils.formatCurrencyPlain — USDT/KRW 전환이
 *                          가격축·이 줄에 동시에 먹습니다.
 *
 * ── 수정 금지 파일을 건드리지 않습니다 ─────────────────────────────────
 * js/chart.js 는 열지 않았습니다. 차트 객체는 이미 자리잡힌 우회로인
 * App.ChartFont.getCharts() 로 받고, 라이브러리 공개 API 인
 * subscribeCrosshairMove 만 씁니다.
 * js/chart-indicator-kit.js(지표 칩)·js/chart-drawings.js(그리기) 도
 * 건드리지 않습니다 — 우리 줄은 그 둘과 자리가 겹치지 않습니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * 십자선은 마우스가 움직일 때마다 불립니다. 그래서 ★값이 그대로면 화면을
 * 안 건드립니다★ (마지막에 그린 봉을 기억해 두고 비교). 시세 틱마다 하는
 * 일은 문자열 4개 만들기가 전부입니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/chart-ohlc-legend.js"></script> 한 줄
 *   삭제. 그러면 이 줄이 사라지고 차트 높이가 그만큼 돌아옵니다.
 *   실행 중에 잠깐 끄려면 콘솔에서 App.ChartOhlcLegend.disable().
 * ========================================================================= */

window.App = window.App || {};

App.ChartOhlcLegend = (function () {
  "use strict";

  var STYLE_ID = "tl-ohlc-legend-css";
  var EL_CLASS = "tl-ohlc";

  /* 확정 팔레트. 상승·하락색은 ★봉의 방향★ 이라 여기 써도 되는 자리입니다
     (지시문: "봉의 방향이니 손익 색 용도가 맞습니다"). */
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_BORDER = "#1D273B";
  var C_UP = "#26C281";
  var C_DOWN = "#F0506E";

  var chart = null;
  var candle = null;
  var el = null;
  var parts = null;      /* 값이 들어가는 span 들 */
  var lastBar = null;    /* 십자선이 차트 밖일 때 보여 줄 봉 */
  var shownKey = "";     /* 마지막으로 그린 내용 — 같으면 화면을 안 건드립니다 */
  var subscribed = false;
  var off = false;
  var hoverBar = null;   /* 십자선이 짚고 있는 봉 (없으면 null) */

  /* =====================================================================
   * 차트·시리즈 찾기 (js/chart-style.js 와 같은 방식)
   * ===================================================================== */
  function findParts() {
    if (chart && candle) return true;
    var charts = [];
    try {
      if (App.ChartFont && typeof App.ChartFont.getCharts === "function") {
        charts = App.ChartFont.getCharts() || [];
      }
    } catch (e) {
      return false;
    }
    if (!charts.length) return false;
    chart = charts[0];
    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var list = panes[i].getSeries();
        for (var j = 0; j < list.length; j++) {
          var t = list[j].seriesType && list[j].seriesType();
          if (t === "Candlestick" && !candle) candle = list[j];
        }
      }
    } catch (e) {
      return false;
    }
    return !!candle;
  }

  /* =====================================================================
   * 화면
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      /* ── 2단계 (2026-09-04) — ★자기 줄에서 차트 안 겹침으로★ ──────────
         트레이딩뷰 실측(2026-09-04, 1440): 범례가 차트판(top 42) 안 top 46 에
         겹쳐 있고, 차트를 ★0px★ 밀어냅니다. 우리는 여기까지 자기 줄이라
         차트를 데스크톱 35 · 폰 60 만큼 밀어냈습니다.
         지표 칩 줄(.tl-ind-bar)과 같은 방식으로 얹습니다 — 그 줄도 원래부터
         차트 위에 겹쳐 그립니다(js/chart-indicators.js 13절).
         ⚠ 글자를 고르거나 긁을 일이 없으므로 pointer-events 를 끕니다 —
           안 끄면 이 투명한 상자가 캔들 위 십자선·드래그를 먹습니다. */
      "." + EL_CLASS + "{position:absolute;top:6px;left:8px;z-index:6;" +
      "pointer-events:none;display:flex;flex-wrap:wrap;" +
      "align-items:baseline;gap:2px 14px;padding:0;" +
      "font-family:var(--mono);font-size:17px;line-height:1.35;" +
      "color:" + C_TEXT + ";white-space:nowrap;}" +
      "." + EL_CLASS + " .k{color:" + C_MUTED + ";margin-right:3px;font-weight:600;}" +
      "." + EL_CLASS + " .v{font-weight:600;}" +
      "." + EL_CLASS + " .up{color:" + C_UP + ";}" +
      "." + EL_CLASS + " .down{color:" + C_DOWN + ";}" +
      /* 좁은 화면에서는 절대 변동값을 감춥니다(퍼센트는 남습니다).
         ★지우는 게 아니라 가리는 것★ 입니다 — 마크업은 그대로 있습니다.
         이걸 안 하면 360 에서 줄이 3줄이 되어 차트를 그만큼 밀어냅니다. */
      /* 예비 길 — .chart-wrap 을 못 찾았을 때만 쓰는 ★예전 모양★(자기 줄) */
      "." + EL_CLASS + ".tl-ohlc-row{position:static;padding:5px 2px 6px;" +
      "pointer-events:auto;border-bottom:1px solid " + C_BORDER + ";margin-bottom:4px;}" +
      /* ── 좁은 화면 (2026-09-04, 2단계) ────────────────────────────────
         2단계에서 이 줄이 차트 ★위로 올라왔기 때문에★, 두 줄이 되면 캔들을
         그만큼 덮습니다(360 실측 48). 자기 줄이던 때는 안 덮었습니다.
         트레이딩뷰도 좁아지면 O·H·L 을 먼저 감춥니다 —
         실측(2026-09-04): .valueItem-quatTGAC 다섯 칸 중 O·H·L 셋에만
         unimportant-quatTGAC 가 붙어 있고,
         .hideUniportantValueItems ... .unimportant{display:none} 규칙이 있습니다.
         ★다만 우리는 한 가지를 더 합니다★ — 십자선이 실제로 봉을 짚고 있는
         동안에는 O·H·L 을 다시 보여 줍니다(tl-ohlc-live). 폰에서 봉을 눌러
         값을 읽는 것이 이 줄의 주된 쓸모라, 그것까지 없애면 기능이 줄어듭니다. */
      "@media (max-width:767px){." + EL_CLASS + " .abs{display:none;}" +
      "." + EL_CLASS + " .ohlc-min{display:none;}" +
      "." + EL_CLASS + ".tl-ohlc-live .ohlc-min{display:inline;}}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /** 이 줄의 높이를 .chart-wrap 에 알립니다.
   *  지표 칩 줄(js/chart-indicators.js 의 .tl-ind-bar)이 이 값만큼 아래에서
   *  시작합니다 — 안 알리면 둘이 ★같은 자리에 겹쳐★ 글자가 포개집니다.
   *  값은 CSS 변수 한 개(--tl-ohlc-h)로만 주고받습니다. 두 파일이 서로의
   *  숫자를 베껴 적지 않게 하려는 것입니다(어긋나면 바로 겹칩니다). */
  function publishHeight() {
    if (!el || !el.parentNode || !el.parentNode.style) return;
    var h = 0;
    try {
      h = Math.round(el.offsetHeight || 0);
    } catch (e) {
      return;
    }
    if (!h) return;
    if (el.parentNode.style.getPropertyValue("--tl-ohlc-h") === h + "px") return;
    el.parentNode.style.setProperty("--tl-ohlc-h", h + "px");
  }

  function item(key) {
    var wrap = document.createElement("span");
    var k = document.createElement("span");
    k.className = "k";
    k.textContent = key;
    var v = document.createElement("span");
    v.className = "v";
    v.textContent = "-";
    wrap.appendChild(k);
    wrap.appendChild(v);
    return { wrap: wrap, v: v };
  }

  var reflowRaf = 0;
  function watchReflow() {
    if (!window.addEventListener) return;
    window.addEventListener("resize", function () {
      if (reflowRaf) return;
      if (!window.requestAnimationFrame) {
        publishHeight();
        return;
      }
      reflowRaf = window.requestAnimationFrame(function () {
        reflowRaf = 0;
        publishHeight();
      });
    });
  }

  function build() {
    var panel = document.querySelector(".chart-panel");
    /* 2단계 — 차트 ★안★ 에 얹습니다. .chart-wrap 은 js/chart-indicators.js 가
       이미 position:relative 로 만들어 두는 자리입니다(지표 칩 줄과 같은 기준점).
       못 찾으면 예전처럼 자기 줄로 넣습니다 — 화면이 비는 것보다 낫습니다. */
    var wrap = panel && (panel.querySelector(".chart-wrap") || null);
    var body = panel && panel.querySelector(".tlc-body");
    if (!panel || (!wrap && !body)) return false;
    injectStyle();
    el = document.createElement("div");
    el.className = EL_CLASS;
    el.setAttribute("aria-label", "지금 보고 있는 봉의 시가·고가·저가·종가");

    /* 트레이딩뷰와 같은 순서·같은 이름표입니다 */
    parts = {
      o: item("O"),
      h: item("H"),
      l: item("L"),
      c: item("C")
    };
    /* O·H·L 은 좁은 화면에서 먼저 접히는 칸입니다(위 CSS 주석 참고).
       C 와 변동은 늘 남습니다 — 트레이딩뷰와 같은 고르기입니다. */
    parts.o.wrap.className = "ohlc-min";
    parts.h.wrap.className = "ohlc-min";
    parts.l.wrap.className = "ohlc-min";
    el.appendChild(parts.o.wrap);
    el.appendChild(parts.h.wrap);
    el.appendChild(parts.l.wrap);
    el.appendChild(parts.c.wrap);

    var chg = document.createElement("span");
    chg.className = "chg";
    var abs = document.createElement("span");
    abs.className = "v abs";
    abs.textContent = "-";
    var pct = document.createElement("span");
    pct.className = "v pct";
    pct.textContent = "-";
    pct.style.marginLeft = "6px";
    chg.appendChild(abs);
    chg.appendChild(pct);
    el.appendChild(chg);
    parts.abs = abs;
    parts.pct = pct;

    if (wrap) {
      if (!wrap.style.position) wrap.style.position = "relative";
      wrap.appendChild(el);
      publishHeight();
      watchReflow();
    } else {
      /* 예비 길 — 예전과 같은 자기 줄 */
      el.className = EL_CLASS + " tl-ohlc-row";
      panel.insertBefore(el, body);
    }
    return true;
  }

  /* =====================================================================
   * 값 그리기
   * ===================================================================== */
  function money(v) {
    try {
      if (App.Utils && typeof App.Utils.formatCurrencyPlain === "function") {
        return App.Utils.formatCurrencyPlain(v);
      }
    } catch (e) {
      /* 무시 */
    }
    return String(v);
  }

  /* 변동은 트레이딩뷰와 똑같이 ★종가 − 시가★ 입니다(위 실측 참조).
     ⚠ 손익·랭킹 계산식과는 아무 상관이 없습니다. 이 줄은 화면 표시 전용이고
       어떤 값도 저장하거나 서버로 보내지 않습니다. */
  function paint() {
    if (off || !el || !parts) return;
    var b = hoverBar || lastBar;
    if (!b) return;
    var diff = b.close - b.open;
    var pct = b.open ? (diff / b.open) * 100 : 0;
    var dir = diff > 0 ? "up" : diff < 0 ? "down" : "";
    var key = b.open + "|" + b.high + "|" + b.low + "|" + b.close + "|" +
      (App.Config && App.Config.getDisplayCurrency ? App.Config.getDisplayCurrency() : "") +
      /* 십자선이 짚었는지도 열쇠에 넣습니다 — 값이 같아도 O·H·L 을 폈다
         접었다 해야 하는데, 안 넣으면 아래 "같으면 안 그림" 에 걸립니다. */
      "|" + (hoverBar ? "1" : "0");
    if (key === shownKey) return;
    shownKey = key;
    /* 십자선이 봉을 짚는 동안에는 좁은 화면에서도 O·H·L 을 펼칩니다 */
    var live = EL_CLASS + (hoverBar ? " tl-ohlc-live" : "");
    if (el.className !== live && el.className.indexOf("tl-ohlc-row") === -1) el.className = live;
    /* 값이 바뀌면 줄 수가 달라질 수 있습니다(숫자가 길어져 줄바꿈).
       그때마다 지표 칩 줄이 내려앉을 자리를 다시 알립니다. */
    publishHeight();

    parts.o.v.textContent = money(b.open);
    parts.h.v.textContent = money(b.high);
    parts.l.v.textContent = money(b.low);
    parts.c.v.textContent = money(b.close);
    parts.o.v.className = "v " + dir;
    parts.h.v.className = "v " + dir;
    parts.l.v.className = "v " + dir;
    parts.c.v.className = "v " + dir;

    /* 부호는 트레이딩뷰처럼 진짜 빼기 기호(−, U+2212)를 씁니다 */
    var sign = diff > 0 ? "+" : diff < 0 ? "−" : "";
    parts.abs.textContent = sign + money(Math.abs(diff));
    parts.abs.className = "v abs " + dir;
    parts.pct.textContent =
      "(" + sign + Math.abs(pct).toLocaleString("ko-KR", {
        minimumFractionDigits: 2, maximumFractionDigits: 2
      }) + "%)";
    parts.pct.className = "v pct " + dir;
  }

  function isBar(d) {
    return !!(d && typeof d.open === "number" && typeof d.high === "number" &&
      typeof d.low === "number" && typeof d.close === "number");
  }

  /* 마지막 봉을 한 번 읽어 옵니다 (간격을 바꾼 직후처럼 시세가 아직 안 왔을 때) */
  function readLastBar() {
    if (!findParts()) return;
    try {
      var d = candle.data();
      if (d && d.length && isBar(d[d.length - 1])) {
        lastBar = d[d.length - 1];
        paint();
      }
    } catch (e) {
      /* 무시 */
    }
  }

  function subscribe() {
    if (subscribed || !findParts()) return;
    try {
      chart.subscribeCrosshairMove(function (param) {
        if (off) return;
        var d = null;
        try {
          if (param && param.time && param.seriesData && typeof param.seriesData.get === "function") {
            d = param.seriesData.get(candle);
          }
        } catch (e) {
          d = null;
        }
        /* 십자선이 차트 밖이면 마지막 봉으로 되돌립니다 (트레이딩뷰와 같음) */
        hoverBar = isBar(d) ? d : null;
        paint();
      });
      subscribed = true;
    } catch (e) {
      /* 무시 — 못 걸어도 마지막 봉은 계속 보입니다 */
    }
  }

  function onKline(payload) {
    if (off) return;
    try {
      if (!payload || !payload.candle) return;
      if (App.Config && typeof App.Config.getActiveSymbol === "function" &&
          payload.symbol !== App.Config.getActiveSymbol()) return;
      if (!isBar(payload.candle)) return;
      lastBar = payload.candle;
      if (!hoverBar) paint();
    } catch (e) {
      /* 무시 */
    }
  }

  function disable() {
    off = true;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null;
    parts = null;
    var s = document.getElementById(STYLE_ID);
    if (s && s.parentNode) s.parentNode.removeChild(s);
  }

  function init() {
    var tries = 0;
    (function wait() {
      tries++;
      if (findParts()) {
        if (!el && !build()) {
          if (tries < 80) setTimeout(wait, 250);
          return;
        }
        subscribe();
        readLastBar();
        try {
          if (App.Bus && typeof App.Bus.on === "function") {
            App.Bus.on("kline:update", onKline);
            /* 간격을 바꾸면 봉이 통째로 새로 들어옵니다 — 조금 뒤 한 번 읽습니다 */
            App.Bus.on("interval:change", function () {
              hoverBar = null;
              shownKey = "";
              setTimeout(readLastBar, 900);
            });
            /* 통화(USDT/KRW)를 바꾸면 같은 봉이라도 표기가 달라집니다 */
            App.Bus.on("currency:change", function () {
              shownKey = "";
              paint();
            });
          }
        } catch (e) {
          /* 무시 */
        }
        return;
      }
      if (tries < 80) setTimeout(wait, 250);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    disable: disable,
    paint: paint,
    EL_CLASS: EL_CLASS,
    STYLE_ID: STYLE_ID,
    /* 확인용 */
    getStateForTest: function () {
      return { chart: chart, candle: candle, el: el, lastBar: lastBar, hoverBar: hoverBar, subscribed: subscribed };
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChartOhlcLegend;
