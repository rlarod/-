/* =========================================================================
 * js/chart-candle-type.js — App.ChartCandleType
 * =========================================================================
 * 가로 막대의 "봉 종류" 버튼을 엽니다.
 *
 * ── 기준이 바뀌었습니다 (2026-09-02 대표 지시) ─────────────────────────
 * 처음(2026-08-28)엔 바이낸스 Original 차트의 Chart Style 창을 실측해
 * 넷(캔들·라인·바·영역)만 넣었습니다. 그때 실측 기록은 그대로 남깁니다 —
 *   binance.com/en/futures/BTCUSDT 를 1440x900 으로 열어 Original 모드의
 *   Chart Style 창을 세었더니 정확히 넷이었습니다.
 *   실측 캡처 : shots/ct5-bnf-charttype.png (목록)
 *               shots/ct5-bnf-line.png · ct5-bnf-bars.png · ct5-bnf-area.png
 *   선 색     : 캔버스 픽셀을 직접 읽어 rgb(240,185,11) = #F0B90B
 *   선 굵기   : 같은 캔버스에서 세로 한 줄씩 잉크량을 재어 2.0px
 *   Area 채움 : 선 바로 아래 알파 0.26 → 아래로 내려가며 0 에 가까워짐
 * 그 뒤 대표가
 *   "지표는 트레이딩뷰 시스템 따라가자" / "트레이딩뷰 시스템을 따라간다 이상."
 * 이라고 정했고, PM 이 ★차트 시스템 전체★ 로 확인해 주었습니다.
 * 그래서 봉 종류도 트레이딩뷰 목록을 따라 늘립니다.
 *
 *   ⚠️ 단, 경계가 겹치는 것은 거래 쪽(바이낸스)이 우선입니다.
 *      진입가·청산가·미체결·마크가격 선은 ★거래★ 라서 한 글자도 안 바꿉니다.
 *      아래 "하이킨아시는 진짜 가격이 아니다" 항목을 반드시 읽으세요.
 *
 * ── 지금 넣은 것 (10종) ───────────────────────────────────────────────
 *   캔들 · 하이킨아시 · 바 · 고저 · 라인 · 계단선 · 영역 · HLC 영역 ·
 *   기준선 · 칼럼
 *
 *   ★못 넣은 11개와 그 이유★ (트레이딩뷰 21개 중 우리 10개를 뺀 나머지)
 *     Hollow candles          라이브러리 캔들에 "몸통만 비우기" 옵션이 없습니다.
 *                             봉마다 색을 주는 방식으론 테두리만 남길 수 없어
 *                             Custom 시리즈를 새로 그려야 합니다. 다음 건.
 *     Volume candles          봉 굵기를 거래량에 따라 바꿔야 하는데
 *                             라이브러리가 굵기를 봉마다 못 줍니다. 다음 건.
 *     Line with markers       점 찍는 옵션이 라이브러리에 없습니다
 *                             (pointMarkersVisible 은 v5 라인에만 일부). 다음 건.
 *     Volume footprint        봉 안에 가격대별 체결량이 필요합니다.
 *                             ★우리에게 그 자료가 없습니다★ (바이낸스 kline 에
 *                             가격대별 체결량이 안 옵니다). 자료부터 필요합니다.
 *     Time price opportunity  마찬가지로 가격대별 시간 분포 자료가 필요합니다.
 *     Session volume profile  마찬가지.
 *     Renko / Line break /    ★봉을 새로 만드는 것★ 입니다. 시간축이 아니라
 *     Kagi / Point & figure / 가격 움직임으로 봉을 쌓아서, 봉 개수 자체가
 *     Range                   달라집니다. 시간축을 쓰는 지금 구조로는 안 됩니다.
 *                             (렌더러를 따로 만들어야 합니다) 다음 건.
 *   "없어서 못 했습니다" 를 그대로 적습니다. 대충 흉내 내지 않습니다.
 *
 * ── ⚠️⚠️ 하이킨아시는 ★진짜 가격이 아닙니다★ ─────────────────────────
 * HA종가 = (시+고+저+종)/4 처럼 ★평균낸 값★ 입니다. 그런데 진입가·청산가·
 * 미체결 주문 선은 ★진짜 가격★ 입니다. 그래서 하이킨아시로 보면 봉 몸통과
 * 청산가 선이 어긋나 보입니다. 회원이 오해하면 돈이 걸립니다.
 *
 * 그래서 이렇게 막았습니다:
 *   1) 진짜 캔들 시리즈를 ★지우지 않습니다★. 색만 투명으로 바꿔 감춥니다.
 *      진입가·TP·SL·청산가·미체결 가로선은 전부 그 시리즈에 붙어 있어서
 *      값도 위치도 그대로입니다 (우리가 만드는 시리즈에는 아무것도 안 붙습니다).
 *   2) 십자선 OHLC 범례(js/chart-ohlc-legend.js)는 ★진짜 캔들 시리즈★ 에서
 *      값을 읽습니다. 그 파일은 pane.getSeries() 의 ★첫 번째★ Candlestick 을
 *      잡는데, 그건 js/chart.js:225 가 만든 진짜 캔들입니다. 우리가 얹는
 *      하이킨아시 시리즈는 그 뒤에 붙습니다(실측: getSeries() 는 만든 순서대로
 *      돌려줍니다 — Candlestick, Histogram, <우리 것>). 그래서 범례는
 *      하이킨아시일 때도 진짜 값을 보여줍니다. 그 파일은 읽기만 했습니다.
 *   3) 얹은 시리즈는 lastValueVisible / priceLineVisible 을 끕니다.
 *      켜 두면 오른쪽 축에 ★HA 종가★ 가 현재가인 양 찍힙니다.
 *   4) 하이킨아시일 때 차트 위에 ★경고 줄★ 을 띄웁니다 (noticeText 참조).
 *   5) 지표(MA·볼린저·RSI·MACD)는 계속 ★진짜 종가★ 로 계산됩니다.
 *      트레이딩뷰는 하이킨아시를 고르면 지표도 HA 값으로 계산하지만,
 *      우리는 주문·청산이 진짜 가격 기준이라 ★거래 쪽을 우선★ 했습니다.
 *      (경계가 겹치면 거래 우선 — CLAUDE.md 규칙 그대로)
 *
 *   계산식 출처 — 트레이딩뷰 고객센터 원문(로그인 없이 열립니다)
 *   https://www.tradingview.com/support/solutions/43000619436-heikin-ashi/
 *     Open  = (Previous [Open + Close]) / 2      ← 앞 봉의 ★HA★ 시가·종가
 *     Close = (Current [Close + Open + High + Low]) / 4
 *     High  = The highest value of a recent high, open, or close
 *     Low   = The lowest value of the recent low, open, or close
 *   첫 봉은 앞 봉이 없어 HA시가 = (시 + 종) / 2 로 시작합니다(Pine 과 같음).
 *
 *   바이낸스가 하이킨아시에서 청산가 선을 어떻게 그리는지는
 *   ★확인하지 못했습니다★ — 바이낸스 Original 차트에 하이킨아시가 없고,
 *   TradingView 모드는 포지션이 있어야(=로그인) 청산가 선이 나옵니다.
 *   차트팀은 로그인하지 않습니다. 보고서 "확인 못 한 것" 에 적었습니다.
 *
 * ── 색은 우리 팔레트로 바꿔 씁니다 ────────────────────────────────────
 * 바이낸스 금색 #F0B90B 는 우리 확정 팔레트에 없습니다. 같은 자리의
 * 우리 포인트(골드) #F0B429 을 씁니다 (R 같음, G +29, B +30).
 * 오르내림 색(캔들·바·하이킨아시·고저·기준선·칼럼)은 새로 정하지 않고
 * js/chart.js 가 이미 캔들에 쓰고 있는 값을 그 자리에서 읽어옵니다.
 * 숫자를 여기 적어두면 저쪽이 바뀔 때 여기만 옛 색으로 남는
 * "조용한 고장" 이 됩니다.
 *   ※ 상승·하락색을 쓰는 이유 — 이것들은 ★지표선이 아니라 가격 그 자체★
 *     입니다. 캔들이 이미 그 색을 쓰고 있어서 같은 자리에 같은 색입니다.
 *     (지표선에 상승·하락색 금지 규칙은 지표에 대한 것입니다)
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 거기서 라이브러리
 * 공개 API 인 chart.panes()[n].getSeries() 로 캔들 시리즈를 찾습니다.
 *
 * ── ⭐ 캔들 시리즈를 갈아끼우지 않습니다 (제일 중요한 부분) ───────────
 * 시리즈를 지웠다 새로 만들면 그 시리즈에 매달린 것이 전부 떨어집니다 —
 *   · 진입가·TP·SL·청산가·미체결 가로선 (createPriceLine)
 *   · 수평선 (chart-drawings)
 *   · 추세선·피보나치·자·채널·브러시 (attachPrimitive)
 *   · MA·볼린저·RSI·MACD 가 종가를 읽어가는 자리 (candleSeries.data())
 * 그래서 캔들 시리즈는 그대로 두고, 색만 투명으로 바꿔 안 보이게 한 뒤
 * 그 위에 새 시리즈를 하나 얹습니다.
 *
 * visible:false 를 쓰지 않은 이유 — 그러면 그 시리즈에 붙은 가로선까지
 * 같이 사라집니다. 투명색은 "보이는 시리즈" 라서 가로선이 그대로 그려집니다.
 *
 * ── 새 값이 들어올 때 전체를 다시 계산하지 않습니다 ───────────────────
 * 캔들 시리즈의 setData / update 를 그 객체에서 감쌉니다.
 * chart.js 가 마지막 봉 하나를 update() 할 때 우리도 딱 그 한 봉만
 * update() 합니다. 하이킨아시도 마찬가지입니다 — HA시가는 ★앞 봉★ 값으로만
 * 정해지고 앞 봉은 이미 닫혀서 안 변하므로, 마지막 봉 하나만 다시 계산하면
 * 됩니다(계산량 O(1)). 과거 봉을 setData() 로 통째로 넣을 때만 우리도
 * 한 번 통째로 계산합니다.
 * 봉 종류가 "캔들" 이면 얹은 시리즈가 아예 없어서, 감싼 함수는
 * null 하나 보고 바로 끝납니다 (계산 0).
 *
 * ── 어디에 저장하나 ───────────────────────────────────────────────────
 * App.Storage 키 "chart-candle-type" (실제 키는 btc_sim_v2_chart-candle-type).
 * 종목·봉 간격과 상관없이 하나만 기억합니다.
 * 모르는 값이 저장돼 있으면 조용히 "캔들" 로 돌아갑니다 — 이 파일을 옛
 * 버전으로 되돌려도 회원 화면이 비지 않습니다.
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   A) 늘린 6종만 되돌리기 (하이킨아시 포함)
 *      TYPES 배열에서 heikin · highlow · step · hlcarea · baseline · columns
 *      여섯 줄을 지웁니다. 저장돼 있던 값은 isType() 에서 걸러져 "캔들" 로
 *      돌아갑니다. 다른 코드는 손댈 필요 없습니다.
 *   B) 봉 종류 기능을 통째로 되돌리기
 *      1) index.html 의 <script src="js/chart-candle-type.js"></script> 삭제
 *      2) js/chart-drawings.js 의 TOP_TOOLS 에서 candletype 의 ready:true -> false
 *      3) js/chart-drawings.js onButton() 의 candletype 네 줄 삭제
 *      4) tests/chart-toolbar-seal.test.js 의 가로 막대 준비중 개수 2 -> 3
 *      5) js/chart-candle-type.js 파일 삭제
 *      그러면 버튼이 다시 "준비중" 으로 돌아갑니다. 회원 브라우저에 남은
 *      btc_sim_v2_chart-candle-type 키는 아무 동작도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartCandleType = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다. 새 색을 만들지 않습니다. */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429"; /* 라인·영역·계단선·HLC 색 — 바이낸스 #F0B90B 자리 */

  /* 영역(Area) 채움 — 바이낸스 실측 알파 0.26 → 아래로 0 에 가깝게 */
  var AREA_TOP = "rgba(240,180,41,0.26)";
  var AREA_BOTTOM = "rgba(240,180,41,0.02)";
  /* HLC 영역의 고·저 띠 — 같은 골드를 옅게. 종가선은 진하게 그립니다 */
  var HLC_BAND = "rgba(240,180,41,0.18)";
  var LINE_WIDTH = 2; /* 바이낸스 실측 2.0px */

  var STORAGE_KEY = "chart-candle-type";
  var STYLE_ID = "chart-candle-type-style";
  var PANEL_ID = "tl-ct-menu";
  var NOTICE_ID = "tl-ct-notice";
  var TRANSPARENT = "rgba(0,0,0,0)";

  /* ⭐ 순서는 트레이딩뷰 Chart style 창 그대로입니다 (2026-09-02 실측).
     tradingview.com/chart/?symbol=BINANCE:BTCUSDT 를 1920x1080 으로 열어
     (로그인 없이 열립니다) Chart style 창을 세었더니 ★21개★ 였습니다 —
     실측 캡처 : shots/ct18-hk-tv-style-menu.png

       Bars · Candles · Hollow candles · Volume candles
       Line · Line with markers · Step line
       Area · HLC area · Baseline
       Columns · High-low
       Volume footprint · Time price opportunity · Session volume profile
       Heikin Ashi · Renko · Line break · Kagi · Point & figure · Range

     이 중 ★10개★ 를 넣었습니다. 순서를 우리 멋대로 바꾸지 않습니다 —
     트레이딩뷰를 쓰던 회원이 같은 자리에서 찾을 수 있어야 합니다.
     (하이킨아시가 아래쪽인 것도 트레이딩뷰 그대로입니다) */
  var TYPES = [
    { k: "bar", name: "바", note: "OHLC 막대" },
    { k: "candle", name: "캔들", note: "기본" },
    { k: "line", name: "라인", note: "종가만" },
    { k: "step", name: "계단선", note: "종가 계단" },
    { k: "area", name: "영역", note: "라인 + 채움" },
    { k: "hlcarea", name: "HLC 영역", note: "고·저 띠 + 종가" },
    { k: "baseline", name: "기준선", note: "위·아래 딴 색" },
    { k: "columns", name: "칼럼", note: "종가 기둥" },
    { k: "highlow", name: "고저", note: "고·저 세로칸" },
    { k: "heikin", name: "하이킨아시", note: "평균낸 봉" }
  ];

  /* 진짜 가격이 아닌 봉 — 화면에 경고를 띄웁니다 */
  var SYNTHETIC = { heikin: true };

  function isType(k) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].k === k) return true;
    return false;
  }
  function typeName(k) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].k === k) return TYPES[i].name;
    return "캔들";
  }

  /* ---------------- 상태 ---------------- */
  var chart = null;
  var candle = null; /* js/chart.js 가 만든 캔들 시리즈 — 절대 지우지 않습니다 */
  var overlay = null; /* 우리가 얹은 시리즈 */
  var overlayKind = null;
  var current = "candle";
  var candleColors = null; /* 숨기기 전의 원래 색 — 되돌릴 때 씁니다 */
  var wrapped = false;
  var panel = null;
  var anchorBtn = null;
  var docBound = false;
  var notice = null;

  /* 하이킨아시 이어달리기 값 —
     prevHA : 마지막으로 ★닫힌★ 봉의 HA 시가·종가 (이 값은 더 안 변합니다)
     curHA  : 지금 그리는 중인 마지막 봉의 HA
     curTime: 그 봉의 시각. 시각이 바뀌면 curHA 를 prevHA 로 넘깁니다 */
  var prevHA = null;
  var curHA = null;
  var curTime = null;

  /* 칼럼(히스토그램) 바닥값 — 0 부터 그리면 눈금이 0 까지 늘어납니다 */
  var colBase = null;
  /* 기준선(Baseline) 기준값 */
  var baseVal = null;

  /* =====================================================================
   * 저장
   * ===================================================================== */
  function loadSaved() {
    try {
      if (App.Storage && typeof App.Storage.load === "function") {
        var s = App.Storage.load(STORAGE_KEY);
        if (s && isType(s.type)) return s.type;
      }
    } catch (e) {
      /* 저장이 막힌 환경 — 기본값으로 */
    }
    return "candle";
  }

  function saveNow() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") {
        App.Storage.save(STORAGE_KEY, { type: current });
      }
    } catch (e) {
      /* 저장 실패는 화면 동작을 막지 않습니다 */
    }
  }

  /* =====================================================================
   * 차트·시리즈 찾기 (js/chart.js 무수정)
   *
   * ⚠️ 여기서 잡는 candle 은 ★js/chart.js 가 만든 진짜 캔들★ 이어야 합니다.
   *    getSeries() 는 만든 순서대로 돌려주고(실측), 진짜 캔들이 항상 먼저
   *    만들어지므로 첫 번째 Candlestick 이 진짜입니다.
   *    우리가 얹은 하이킨아시/고저 시리즈는 그 뒤에 붙습니다.
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
   * 캔들 시리즈의 setData / update 를 감쌉니다
   *
   * 시리즈 객체 자체에 우리 함수를 얹습니다. js/chart.js 는 자기가 들고 있는
   * 참조로 candleSeries.update(...) 를 부르므로, 부르는 순간 우리 것이
   * 먼저 잡힙니다. chart.js 는 한 글자도 안 바뀝니다.
   * ===================================================================== */
  function wrapSeries() {
    if (wrapped || !candle) return;
    if (typeof candle.setData !== "function" || typeof candle.update !== "function") return;
    var origSet = candle.setData;
    var origUpd = candle.update;
    var origApply = candle.applyOptions;

    try {
      candle.setData = function (data) {
        var r = origSet.call(candle, data);
        mirrorSetData(data);
        return r;
      };
      candle.update = function (bar) {
        var r = origUpd.call(candle, bar);
        mirrorUpdate(bar);
        return r;
      };
      /* chart.js 가 표시 통화를 바꿀 때 priceFormat 을 다시 겁니다
         (js/chart.js:170). 얹은 시리즈도 같은 형식을 따라가야 합니다. */
      if (typeof origApply === "function") {
        candle.applyOptions = function (opts) {
          var r = origApply.call(candle, opts);
          try {
            if (overlay && opts && opts.priceFormat) overlay.applyOptions({ priceFormat: opts.priceFormat });
          } catch (e) {
            /* 무시 — 얹은 시리즈는 가격표를 안 띄웁니다 */
          }
          return r;
        };
      }
      wrapped = true;
    } catch (e) {
      console.warn("[chart-candle-type.js] 캔들 시리즈를 감싸지 못했습니다:", e);
    }
  }

  /* =====================================================================
   * 하이킨아시 계산 — 트레이딩뷰 고객센터 원문 그대로
   *   HA종가 = (시 + 고 + 저 + 종) / 4
   *   HA시가 = (앞 HA시가 + 앞 HA종가) / 2      첫 봉은 (시 + 종) / 2
   *   HA고가 = max(고, HA시가, HA종가)
   *   HA저가 = min(저, HA시가, HA종가)
   * ===================================================================== */
  function haOne(b, prev) {
    var c = (b.open + b.high + b.low + b.close) / 4;
    var o = prev ? (prev.open + prev.close) / 2 : (b.open + b.close) / 2;
    var h = b.high;
    if (o > h) h = o;
    if (c > h) h = c;
    var l = b.low;
    if (o < l) l = o;
    if (c < l) l = c;
    return { time: b.time, open: o, high: h, low: l, close: c };
  }

  function haResetState() {
    prevHA = null;
    curHA = null;
    curTime = null;
  }

  function haAll(data) {
    var out = [];
    var prev = null;
    for (var i = 0; i < data.length; i++) {
      var b = data[i];
      if (!b || typeof b.close !== "number" || typeof b.open !== "number") continue;
      var v = haOne(b, prev);
      out.push(v);
      prev = v;
    }
    /* 마지막 봉은 아직 그리는 중일 수 있으니 따로 들고 있습니다 */
    if (out.length) {
      curHA = out[out.length - 1];
      curTime = curHA.time;
      prevHA = out.length > 1 ? out[out.length - 2] : null;
    } else {
      haResetState();
    }
    return out;
  }

  /* 마지막 봉 하나만 다시 계산 (계산량 O(1)) */
  function haStep(b) {
    if (curTime !== null && b.time !== curTime) {
      /* 앞 봉이 닫혔습니다 — 그 값이 이제 고정입니다 */
      prevHA = curHA;
    }
    curTime = b.time;
    curHA = haOne(b, prevHA);
    return curHA;
  }

  /* =====================================================================
   * 봉 하나를 지금 종류에 맞는 자료로 바꿉니다
   *   inc=true 면 하이킨아시는 O(1) 갱신 경로를 씁니다
   * ===================================================================== */
  function upDownColors() {
    rememberColors();
    var up = candleColors && candleColors.upColor ? candleColors.upColor : "#26C281";
    var dn = candleColors && candleColors.downColor ? candleColors.downColor : "#F0506E";
    return { up: up, down: dn };
  }

  function convOne(b, kind, inc) {
    if (kind === "bar") return b;
    if (kind === "heikin") return inc ? haStep(b) : null; /* 통째로는 haAll 이 처리 */
    if (kind === "highlow") {
      /* 고 -> 저 로 몸통을 채워 세로칸 하나로 만듭니다 (심지 길이 0) */
      var c = upDownColors();
      var col = b.close >= b.open ? c.up : c.down;
      return { time: b.time, open: b.high, high: b.high, low: b.low, close: b.low, color: col };
    }
    if (kind === "hlcarea") {
      return { time: b.time, high: b.high, low: b.low, close: b.close };
    }
    if (kind === "columns") {
      var cc = upDownColors();
      return { time: b.time, value: b.close, color: b.close >= b.open ? cc.up : cc.down };
    }
    /* line / step / area / baseline */
    return { time: b.time, value: b.close };
  }

  /* ---- 값 옮기기 ----
     바(Bar)는 캔들과 자료 모양이 같아서 그대로 넘깁니다(새로 만드는 것 0개). */
  function mirrorSetData(data) {
    if (!overlay || !data) return;
    try {
      if (overlayKind === "bar") {
        overlay.setData(data);
        return;
      }
      if (overlayKind === "heikin") {
        overlay.setData(haAll(data));
        return;
      }
      var out = [];
      for (var i = 0; i < data.length; i++) {
        var d = data[i];
        if (!d || typeof d.close !== "number") continue;
        out.push(convOne(d, overlayKind, false));
      }
      rescale(data);
      overlay.setData(out);
    } catch (e) {
      /* 무시 — 캔들 쪽은 이미 정상적으로 들어갔습니다 */
    }
  }

  function mirrorUpdate(bar) {
    if (!overlay || !bar) return;
    try {
      if (overlayKind === "bar") {
        overlay.update(bar);
        return;
      }
      if (typeof bar.close !== "number") return;
      overlay.update(convOne(bar, overlayKind, true));
    } catch (e) {
      /* 무시 */
    }
  }

  /* =====================================================================
   * 칼럼 바닥값 · 기준선 기준값
   *   ⚠️ 지금 고른 종류가 이 둘이 아니면 ★계산 자체를 안 합니다★.
   * ===================================================================== */
  function needsRange() {
    return current === "columns" || current === "baseline";
  }

  function visibleMinMax(data) {
    var d = data;
    if (!d) {
      try {
        d = candle.data();
      } catch (e) {
        d = null;
      }
    }
    if (!d || !d.length) return null;
    var from = 0;
    var to = d.length - 1;
    try {
      var r = chart.timeScale().getVisibleLogicalRange();
      if (r) {
        var a = Math.floor(r.from);
        var b = Math.ceil(r.to);
        if (a > 0) from = a;
        if (b < to) to = b;
      }
    } catch (e) {
      /* 전체로 */
    }
    if (from > to) {
      from = 0;
      to = d.length - 1;
    }
    var lo = Infinity;
    var hi = -Infinity;
    for (var i = from; i <= to; i++) {
      var x = d[i];
      if (!x || typeof x.low !== "number" || typeof x.high !== "number") continue;
      if (x.low < lo) lo = x.low;
      if (x.high > hi) hi = x.high;
    }
    if (!isFinite(lo) || !isFinite(hi)) return null;
    return { lo: lo, hi: hi };
  }

  function rescale(data) {
    if (!overlay || !needsRange()) return;
    var mm = visibleMinMax(data);
    if (!mm) return;
    var span = mm.hi - mm.lo;
    try {
      if (current === "columns") {
        var b = mm.lo - span * 0.08;
        if (colBase === null || Math.abs(b - colBase) > span * 0.01) {
          colBase = b;
          overlay.applyOptions({ base: b });
        }
      } else {
        var v = (mm.lo + mm.hi) / 2;
        if (baseVal === null || Math.abs(v - baseVal) > span * 0.005) {
          baseVal = v;
          overlay.applyOptions({ baseValue: { type: "price", price: v } });
        }
      }
    } catch (e) {
      /* 무시 */
    }
  }

  var rangeSubbed = false;
  var rangeRaf = 0;
  function watchRange() {
    if (rangeSubbed || !chart) return;
    try {
      chart.timeScale().subscribeVisibleLogicalRangeChange(function () {
        if (!needsRange() || !overlay) return; /* 꺼져 있으면 계산 0 */
        if (rangeRaf) return;
        rangeRaf = window.requestAnimationFrame(function () {
          rangeRaf = 0;
          rescale(null);
        });
      });
      rangeSubbed = true;
    } catch (e) {
      /* 무시 — 그러면 setData 때만 다시 잽니다 */
    }
  }

  /* =====================================================================
   * 캔들 숨기기 / 되살리기 — 색만 바꿉니다. 시리즈는 그대로 살아 있습니다.
   * ===================================================================== */
  function rememberColors() {
    if (candleColors || !candle) return;
    var o = null;
    try {
      o = candle.options();
    } catch (e) {
      o = null;
    }
    if (!o) return;
    candleColors = {
      upColor: o.upColor,
      downColor: o.downColor,
      borderVisible: o.borderVisible,
      borderUpColor: o.borderUpColor,
      borderDownColor: o.borderDownColor,
      wickUpColor: o.wickUpColor,
      wickDownColor: o.wickDownColor
    };
  }

  function hideCandles() {
    rememberColors();
    if (!candle) return;
    try {
      candle.applyOptions({
        upColor: TRANSPARENT,
        downColor: TRANSPARENT,
        borderVisible: false,
        borderUpColor: TRANSPARENT,
        borderDownColor: TRANSPARENT,
        wickUpColor: TRANSPARENT,
        wickDownColor: TRANSPARENT
      });
    } catch (e) {
      /* 무시 */
    }
  }

  function showCandles() {
    if (!candle || !candleColors) return;
    try {
      candle.applyOptions(candleColors);
    } catch (e) {
      /* 무시 */
    }
  }

  /* #RRGGBB -> rgba(...). 새 색을 만드는 게 아니라 같은 색의 투명도만 조절합니다. */
  function withAlpha(hex, a) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return hex;
    var n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  /* =====================================================================
   * HLC 영역 — 라이브러리에 "띠(band)" 시리즈가 없어서 직접 그립니다.
   * 공개 API 인 addCustomSeries(뷰, 옵션) 를 씁니다. seriesType() 이
   * "Custom" 이라 캔들 시리즈를 찾는 다른 모듈이 이걸 잘못 잡을 일이 없습니다.
   * ===================================================================== */
  function makeHlcView() {
    var d = null;
    var op = null;

    var renderer = {
      draw: function (target, priceToCoordinate) {
        if (!d || !d.bars || !d.bars.length || !d.visibleRange) return;
        target.useBitmapCoordinateSpace(function (scope) {
          var ctx = scope.context;
          var hr = scope.horizontalPixelRatio;
          var vr = scope.verticalPixelRatio;
          var from = d.visibleRange.from;
          var to = d.visibleRange.to;
          if (to - from < 1) return;
          var half = (d.barSpacing / 2) * hr;

          var tops = [];
          var bots = [];
          var line = [];
          for (var i = from; i < to; i++) {
            var bar = d.bars[i];
            if (!bar) continue;
            var o = bar.originalData;
            if (!o || typeof o.close !== "number") continue;
            var x = bar.x * hr;
            var yh = priceToCoordinate(o.high);
            var yl = priceToCoordinate(o.low);
            var yc = priceToCoordinate(o.close);
            if (yh === null || yl === null || yc === null) continue;
            tops.push([x, yh * vr]);
            bots.push([x, yl * vr]);
            line.push([x, yc * vr]);
          }
          if (!tops.length) return;

          /* 고·저 띠 */
          ctx.beginPath();
          ctx.moveTo(tops[0][0] - half, tops[0][1]);
          for (var a = 0; a < tops.length; a++) ctx.lineTo(tops[a][0], tops[a][1]);
          ctx.lineTo(tops[tops.length - 1][0] + half, tops[tops.length - 1][1]);
          ctx.lineTo(bots[bots.length - 1][0] + half, bots[bots.length - 1][1]);
          for (var c = bots.length - 1; c >= 0; c--) ctx.lineTo(bots[c][0], bots[c][1]);
          ctx.lineTo(bots[0][0] - half, bots[0][1]);
          ctx.closePath();
          ctx.fillStyle = (op && op.bandColor) || HLC_BAND;
          ctx.fill();

          /* 종가 선 */
          ctx.beginPath();
          ctx.moveTo(line[0][0], line[0][1]);
          for (var e = 1; e < line.length; e++) ctx.lineTo(line[e][0], line[e][1]);
          ctx.lineWidth = ((op && op.lineWidth) || LINE_WIDTH) * vr;
          ctx.strokeStyle = (op && op.lineColor) || C_POINT;
          ctx.lineJoin = "round";
          ctx.stroke();
        });
      }
    };

    return {
      priceValueBuilder: function (p) {
        return [p.low, p.high, p.close];
      },
      isWhitespace: function (p) {
        return p.close === undefined || p.close === null;
      },
      renderer: function () {
        return renderer;
      },
      update: function (data, options) {
        d = data;
        op = options;
      },
      defaultOptions: function () {
        return {
          lineColor: C_POINT,
          bandColor: HLC_BAND,
          lineWidth: LINE_WIDTH,
          lastValueVisible: false,
          priceLineVisible: false
        };
      }
    };
  }

  /* =====================================================================
   * 얹는 시리즈 만들기 / 지우기
   * ===================================================================== */
  function priceFormatNow() {
    try {
      var o = candle.options();
      return o && o.priceFormat ? o.priceFormat : null;
    } catch (e) {
      return null;
    }
  }

  function withBase(extra) {
    /* ⚠️ lastValueVisible / priceLineVisible 을 반드시 끕니다.
       켜 두면 오른쪽 축에 하이킨아시 평균값이 "현재가" 인 것처럼 찍힙니다.
       현재가 가로선과 가격표는 chart.js 가 진짜 값으로 이미 그립니다. */
    var o = { lastValueVisible: false, priceLineVisible: false };
    var pf = priceFormatNow();
    if (pf) o.priceFormat = pf;
    for (var k in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) o[k] = extra[k];
    }
    return o;
  }

  function makeOverlay(kind) {
    var LC = window.LightweightCharts;
    if (!LC || !chart || typeof chart.addSeries !== "function") return null;
    try {
      if (kind === "line" || kind === "step") {
        var op = withBase({ color: C_POINT, lineWidth: LINE_WIDTH, crosshairMarkerVisible: false });
        if (kind === "step" && LC.LineType) op.lineType = LC.LineType.WithSteps;
        return chart.addSeries(LC.LineSeries, op);
      }
      if (kind === "area") {
        return chart.addSeries(
          LC.AreaSeries,
          withBase({
            lineColor: C_POINT,
            lineWidth: LINE_WIDTH,
            topColor: AREA_TOP,
            bottomColor: AREA_BOTTOM,
            crosshairMarkerVisible: false
          })
        );
      }
      if (kind === "bar") {
        var c = upDownColors();
        return chart.addSeries(LC.BarSeries, withBase({ upColor: c.up, downColor: c.down }));
      }
      if (kind === "heikin") {
        rememberColors();
        var k = candleColors || {};
        return chart.addSeries(
          LC.CandlestickSeries,
          withBase({
            upColor: k.upColor || "#26C281",
            downColor: k.downColor || "#F0506E",
            borderVisible: k.borderVisible === undefined ? false : k.borderVisible,
            borderUpColor: k.borderUpColor || k.upColor || "#26C281",
            borderDownColor: k.borderDownColor || k.downColor || "#F0506E",
            wickUpColor: k.wickUpColor || k.upColor || "#26C281",
            wickDownColor: k.wickDownColor || k.downColor || "#F0506E"
          })
        );
      }
      if (kind === "highlow") {
        var h = upDownColors();
        return chart.addSeries(
          LC.CandlestickSeries,
          withBase({
            upColor: h.up,
            downColor: h.down,
            borderVisible: false,
            wickUpColor: TRANSPARENT,
            wickDownColor: TRANSPARENT
          })
        );
      }
      if (kind === "baseline") {
        var bc = upDownColors();
        baseVal = null;
        return chart.addSeries(
          LC.BaselineSeries,
          withBase({
            baseValue: { type: "price", price: 0 },
            topLineColor: bc.up,
            bottomLineColor: bc.down,
            topFillColor1: withAlpha(bc.up, 0.28),
            topFillColor2: withAlpha(bc.up, 0.02),
            bottomFillColor1: withAlpha(bc.down, 0.02),
            bottomFillColor2: withAlpha(bc.down, 0.28),
            lineWidth: LINE_WIDTH,
            crosshairMarkerVisible: false
          })
        );
      }
      if (kind === "columns") {
        colBase = null;
        return chart.addSeries(LC.HistogramSeries, withBase({ base: 0 }));
      }
      if (kind === "hlcarea") {
        if (typeof chart.addCustomSeries !== "function") return null;
        return chart.addCustomSeries(
          makeHlcView(),
          withBase({ lineColor: C_POINT, bandColor: HLC_BAND, lineWidth: LINE_WIDTH })
        );
      }
    } catch (e) {
      console.warn("[chart-candle-type.js] 시리즈를 만들지 못했습니다:", e);
    }
    return null;
  }

  function dropOverlay() {
    if (!overlay) return;
    try {
      chart.removeSeries(overlay);
    } catch (e) {
      /* 무시 */
    }
    overlay = null;
    overlayKind = null;
    haResetState();
    colBase = null;
    baseVal = null;
  }

  /* =====================================================================
   * "진짜 가격이 아닙니다" 안내줄
   *   ⚠️ 이 줄을 빼지 마세요. 회원이 하이킨아시 평균값을 진짜 가격으로 읽고
   *      주문을 내면 돈이 걸립니다.
   * ===================================================================== */
  function noticeText() {
    return "하이킨아시 — 평균낸 봉입니다. O·H·L·C 값과 진입가·청산가·주문은 모두 실제 가격입니다";
  }

  /* ⚠️ 문구에 "위 O·H·L·C" 라고 쓰지 않습니다.
     십자선 범례(js/chart-ohlc-legend.js:192)도 우리와 똑같이 .tlc-body 앞에
     끼워 넣어서, 누가 늦게 붙느냐에 따라 위아래가 뒤바뀝니다
     (실측 — 1920 에서는 범례가 위였고, 360 새로고침 뒤에는 안내줄이 위였습니다).
     그래서 문구를 자리와 상관없게 적고, 자리도 .tlc-body 바로 앞으로
     몇 번 다시 맞춥니다. */
  var anchorTimers = [];
  function anchorNotice() {
    var h = host();
    if (!h || !notice || !SYNTHETIC[current]) return;
    var body = h.querySelector(".tlc-body");
    if (body) {
      if (notice.nextSibling !== body) h.insertBefore(notice, body);
    } else if (notice.parentNode !== h) {
      h.appendChild(notice);
    }
  }

  function showNotice() {
    var h = host();
    if (!h) return;
    if (!notice) {
      notice = document.createElement("div");
      notice.id = NOTICE_ID;
      notice.setAttribute("role", "note");
    }
    notice.textContent = noticeText();
    anchorNotice();
    /* 범례가 우리보다 늦게 붙는 경우가 있어 두 번 더 맞춰 줍니다 */
    while (anchorTimers.length) clearTimeout(anchorTimers.pop());
    anchorTimers.push(setTimeout(anchorNotice, 600));
    anchorTimers.push(setTimeout(anchorNotice, 2500));
  }

  function hideNotice() {
    if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
  }

  function syncNotice() {
    if (SYNTHETIC[current]) showNotice();
    else hideNotice();
  }

  /* =====================================================================
   * 지금 고른 종류를 화면에 반영
   * ===================================================================== */
  function apply() {
    if (!findParts()) return false;
    wrapSeries();
    injectStyle();
    watchRange();

    if (current === "candle") {
      dropOverlay();
      showCandles();
      syncNotice();
      paintButton();
      return true;
    }

    if (overlayKind !== current) {
      dropOverlay();
      overlay = makeOverlay(current);
      overlayKind = overlay ? current : null;
      if (!overlay) {
        /* 못 만들었으면 캔들로 되돌립니다 — 빈 화면을 보여주지 않습니다 */
        current = "candle";
        showCandles();
        syncNotice();
        paintButton();
        return false;
      }
    }

    /* 지금 들어 있는 값을 한 번 옮겨 담습니다. 이 뒤로는 chart.js 가
       마지막 봉 하나를 update() 할 때마다 한 봉씩만 따라갑니다. */
    var d = null;
    try {
      d = candle.data();
    } catch (e) {
      d = null;
    }
    if (d && d.length) mirrorSetData(d);

    hideCandles();
    syncNotice();
    paintButton();
    return true;
  }

  function setType(k) {
    if (!isType(k)) return false;
    if (k === current) {
      paintButton();
      return true;
    }
    current = k;
    saveNow();
    apply();
    return true;
  }

  function getType() {
    return current;
  }

  /* 버튼 이름표를 지금 고른 것으로 맞춥니다 — 마우스를 올리면 읽힙니다 */
  function toolButton() {
    return document.querySelector('.tlc-toolbar .tlc-btn[data-tlc="candletype"]');
  }

  function paintButton() {
    var b = toolButton();
    if (!b) return;
    var label = "봉 종류 — " + typeName(current);
    b.setAttribute("title", label);
    b.setAttribute("aria-label", label);
  }

  /* =====================================================================
   * 목록 (껍데기는 fx 목록과 같은 규칙 — 확정 팔레트만 씁니다)
   * =====================================================================
   *
   * 2026-08-31 대표 "내가 글씨 크게 하라는 거 다 크게해" (★세 번째 지시★) — 다시 확대
   *   제목      20 -> 24px       닫기 ✕      20 -> 24px
   *   항목 이름 16 -> 19px(줄26) 오른쪽 설명 14 -> 17px(줄26)
   *   아래 안내 14 -> 17px       스크롤 안내 14 -> 17px
   *   점        7  -> 8px        머리 여백 10/13 -> 12/15, 줄 여백 10/13 -> 11/15
   *   창 폭     264 -> 320px   (place() 의 기본값 320 도 함께)
   * 되돌리려면 위 숫자를 화살표 왼쪽 값으로 되돌리고 폭을 264px 로
   * (아래 place() 의 "offsetWidth || 320" 도 264 로 함께 되돌립니다).
   * ⚠️ 2026-09-02 에 4종 -> 10종으로 늘렸지만 ★글씨는 한 픽셀도 줄이지
   *    않았습니다★. 대표가 작은 글씨를 못 읽습니다. 안 들어가면 place() 가
   *    목록만 잘라 스크롤로 풉니다(안내줄이 같이 뜹니다).
   * max-width:calc(100vw - 16px) 가 있어 360 폰에서도 화면 밖으로 나가지 않습니다. */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var P = "#" + PANEL_ID;
    var N = "#" + NOTICE_ID;
    var css =
      P + "{position:fixed;z-index:60;width:320px;max-width:calc(100vw - 16px);box-sizing:border-box;background:" + C_CARD + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:10px;overflow:hidden;" +
      "box-shadow:none;font-family:inherit;}" +
      P + "::before{content:\"\";position:absolute;left:0;right:0;top:0;height:1px;" +
      "background:rgba(255,255,255,.03);pointer-events:none;}" +
      P + " .tl-ct-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:12px 15px;border-bottom:1px solid " + C_BORDER + ";}" +
      P + " .tl-ct-title{font-size:24px;font-weight:700;color:" + C_TEXT + ";}" +
      P + " .tl-ct-x{background:none;border:0;color:" + C_MUTED + ";font-size:24px;line-height:1;" +
      "cursor:pointer;padding:4px 6px;border-radius:4px;font-family:inherit;}" +
      P + " .tl-ct-x:hover{color:" + C_TEXT + ";}" +
      P + " .tl-ct-row{width:100%;display:flex;align-items:center;gap:8px;background:none;" +
      "border:0;padding:11px 15px;cursor:pointer;text-align:left;font-family:inherit;}" +
      P + " .tl-ct-row:hover{background:" + C_TILE + ";}" +
      P + " .tl-ct-dot{width:8px;height:8px;border-radius:50%;flex:0 0 auto;background:" + C_BORDER + ";}" +
      P + " .tl-ct-name{flex:1 1 auto;min-width:0;font-size:19px;line-height:26px;font-weight:600;" +
      "color:" + C_MUTED + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      P + " .tl-ct-note{font-size:17px;line-height:26px;font-weight:500;color:" + C_MUTED + ";" +
      "flex:0 0 auto;opacity:.75;}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-name{color:" + C_TEXT + ";}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-dot{background:" + C_POINT + ";}" +
      P + " .tl-ct-row[aria-checked=\"true\"] .tl-ct-note{color:" + C_POINT + ";opacity:1;}" +
      P + " .tl-ct-foot{padding:9px 15px 11px;border-top:1px solid " + C_BORDER + ";" +
      "font-size:17px;color:" + C_MUTED + ";line-height:1.5;}" +
      P + " .tl-ct-list{overflow-y:auto;overscroll-behavior:contain;}" +
      P + " .tl-ct-list::-webkit-scrollbar{width:3px;}" +
      P + " .tl-ct-list::-webkit-scrollbar-thumb{background:" + C_BORDER + ";border-radius:2px;}" +
      P + " .tl-ct-list::-webkit-scrollbar-track{background:transparent;}" +
      P + " .tl-ct-hint{display:none;padding:8px 15px;border-top:1px solid " + C_BORDER + ";" +
      "font-size:17px;line-height:1.4;color:" + C_POINT + ";background:" + C_TILE + ";}" +
      /* 안내줄 — 차트를 덮지 않고 위에 한 줄로 자리를 차지합니다 */
      N + "{flex:0 0 auto;box-sizing:border-box;margin:0 0 4px;padding:7px 10px;" +
      "background:" + C_TILE + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "color:" + C_POINT + ";font-size:17px;line-height:1.35;font-weight:600;}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function host() {
    return document.querySelector(".chart-panel") || null;
  }

  function paint() {
    if (!panel) return;
    var rows = panel.querySelectorAll(".tl-ct-row");
    for (var i = 0; i < rows.length; i++) {
      var on = rows[i].getAttribute("data-k") === current;
      rows[i].setAttribute("aria-checked", on ? "true" : "false");
    }
    var foot = panel.querySelector(".tl-ct-foot");
    if (foot) {
      foot.textContent = SYNTHETIC[current]
        ? "지금 " + typeName(current) + ". 평균낸 봉이라 진짜 가격과 다릅니다."
        : "지금 " + typeName(current) + ". 종목·봉 간격을 바꿔도 그대로 갑니다.";
    }
  }

  function build() {
    injectStyle();
    var h = host();
    if (!h) return null;

    var p = document.createElement("div");
    p.id = PANEL_ID;
    p.setAttribute("role", "dialog");
    p.setAttribute("aria-label", "봉 종류 고르기");

    var head = document.createElement("div");
    head.className = "tl-ct-head";
    var t = document.createElement("span");
    t.className = "tl-ct-title";
    t.textContent = "봉 종류";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "tl-ct-x";
    x.setAttribute("aria-label", "봉 종류 목록 닫기");
    x.textContent = "✕";
    x.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
    head.appendChild(t);
    head.appendChild(x);
    p.appendChild(head);

    var list = document.createElement("div");
    list.className = "tl-ct-list";
    list.setAttribute("role", "radiogroup");

    TYPES.forEach(function (ty) {
      var row = document.createElement("button");
      row.type = "button";
      row.className = "tl-ct-row";
      row.setAttribute("role", "radio");
      row.setAttribute("data-k", ty.k);
      row.setAttribute("aria-checked", "false");

      var dot = document.createElement("span");
      dot.className = "tl-ct-dot";
      var nm = document.createElement("span");
      nm.className = "tl-ct-name";
      nm.textContent = ty.name;
      var note = document.createElement("span");
      note.className = "tl-ct-note";
      note.textContent = ty.note;

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        setType(ty.k);
        paint();
        place();
      });
      list.appendChild(row);
    });
    p.appendChild(list);

    var hint = document.createElement("div");
    hint.className = "tl-ct-hint";
    hint.textContent = "목록을 위아래로 밀면 나머지가 보입니다";
    p.appendChild(hint);

    var foot = document.createElement("div");
    foot.className = "tl-ct-foot";
    p.appendChild(foot);

    h.appendChild(p);
    return p;
  }

  /* ---------------------------------------------------------------------
   * 자리 잡기 — 화면(viewport) 기준입니다.
   * fx 목록(js/chart-indicator-menu.js)이 2026-08-27 에 폰에서 화면 밖으로
   * 나갔던 일이 있어, 그때 고친 방식을 그대로 씁니다.
   *   · position:fixed 로 화면 기준
   *   · 아래가 모자라면 버튼 위로 뒤집기
   *   · 양쪽 다 모자라면 몸통만 줄여 스크롤 + 안내줄
   *   · 폰 하단 고정 매수/매도 바(.tl-order-bar) 위로는 안 내려감
   * ------------------------------------------------------------------- */
  var EDGE = 8;

  function vpW() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }
  function vpH() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }
  function fullscreenOn() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function floorY() {
    var lim = vpH() - EDGE;
    if (fullscreenOn()) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim;
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - EDGE < lim) lim = r.top - EDGE;
    return lim;
  }

  function place() {
    if (!panel) return;
    var listEl = panel.querySelector(".tl-ct-list");
    var hintEl = panel.querySelector(".tl-ct-hint");
    if (listEl) listEl.style.maxHeight = "";
    if (hintEl) hintEl.style.display = "none";

    var TOP = EDGE;
    var BOT = floorY();
    var w = panel.offsetWidth || 320;
    var natural = panel.offsetHeight || 0;

    var br = null;
    if (anchorBtn && anchorBtn.getBoundingClientRect) {
      var b = anchorBtn.getBoundingClientRect();
      if (b.width > 0 || b.height > 0) br = b;
    }

    var left = br ? (br.left + br.right) / 2 - w / 2 : EDGE;
    var maxLeft = vpW() - w - EDGE;
    if (left > maxLeft) left = maxLeft;
    if (left < EDGE) left = EDGE;

    var below = br ? br.bottom + 4 : TOP;

    /* 지표 막대(.tl-ind-bar)는 "지금 무엇이 켜져 있나" 자리라 덮지 않습니다 */
    var indBar = document.querySelector(".tl-ind-bar");
    if (indBar && indBar.getBoundingClientRect) {
      var ir = indBar.getBoundingClientRect();
      if (ir.width > 0 && ir.height > 0 && left < ir.right && left + w > ir.left && below < ir.bottom + 4) {
        below = ir.bottom + 4;
      }
    }

    var aboveEnd = br ? br.top - 4 : TOP;
    if (aboveEnd > BOT) aboveEnd = BOT;
    if (aboveEnd < TOP) aboveEnd = TOP;
    if (below < TOP) below = TOP;

    var roomBelow = BOT - below;
    var roomAbove = aboveEnd - TOP;

    var top;
    var cap = 0;
    if (roomBelow >= natural) {
      top = below;
    } else if (roomAbove >= natural) {
      top = aboveEnd - natural;
    } else if (roomAbove > roomBelow) {
      cap = roomAbove;
      top = TOP;
    } else {
      cap = roomBelow;
      top = below;
    }

    if (cap > 0 && listEl) {
      if (hintEl) hintEl.style.display = "block";
      var chrome = panel.offsetHeight - listEl.offsetHeight;
      var avail = Math.floor(cap - chrome);
      if (avail < 48) avail = 48;
      listEl.style.maxHeight = avail + "px";
      if (top === TOP && br) top = aboveEnd - panel.offsetHeight;
    }

    var hNow = panel.offsetHeight;
    if (top + hNow > BOT) top = BOT - hNow;
    if (top < TOP) top = TOP;

    panel.style.top = Math.round(top) + "px";
    panel.style.left = Math.round(left) + "px";
    scrollToChecked(listEl);
  }

  /* 목록이 잘려 스크롤이 생겼을 때, ★지금 고른 줄★ 이 안 보이면 그 자리로
     내려 줍니다. 10종으로 늘리면서 360 폰에서 하이킨아시(맨 아래)가 화면
     밖에 있었습니다 — 아래 안내문에는 "지금 하이킨아시" 라고 적혀 있는데
     목록에서는 아무 줄에도 표시가 없어 보여 헷갈립니다. */
  function scrollToChecked(listEl) {
    if (!listEl) return;
    if (listEl.scrollHeight <= listEl.clientHeight + 1) return;
    var row = listEl.querySelector('.tl-ct-row[aria-checked="true"]');
    if (!row) return;
    var rTop = row.offsetTop;
    var rBot = rTop + row.offsetHeight;
    if (rTop < listEl.scrollTop) listEl.scrollTop = rTop;
    else if (rBot > listEl.scrollTop + listEl.clientHeight) {
      listEl.scrollTop = rBot - listEl.clientHeight;
    }
  }

  var rafId = 0;
  function replaceSoon() {
    if (!panel) return;
    if (rafId) return;
    rafId = window.requestAnimationFrame
      ? window.requestAnimationFrame(function () {
          rafId = 0;
          if (!panel) return;
          if (anchorBtn && anchorBtn.getBoundingClientRect) {
            var r = anchorBtn.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vpH()) {
              close();
              return;
            }
          }
          place();
        })
      : (place(), 0);
  }

  function onDocDown(ev) {
    if (!panel) return;
    var t = ev.target;
    if (panel.contains && panel.contains(t)) return;
    if (anchorBtn && anchorBtn.contains && anchorBtn.contains(t)) return;
    close();
  }

  function onKey(ev) {
    if (ev.key === "Escape" || ev.keyCode === 27) close();
  }

  function bindDoc(on) {
    if (on === docBound) return;
    docBound = on;
    if (on) {
      document.addEventListener("mousedown", onDocDown, true);
      document.addEventListener("keydown", onKey, true);
      window.addEventListener("resize", replaceSoon);
      window.addEventListener("scroll", replaceSoon, true);
    } else {
      document.removeEventListener("mousedown", onDocDown, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", replaceSoon);
      window.removeEventListener("scroll", replaceSoon, true);
    }
  }

  function isOpen() {
    return !!panel;
  }

  function open(btn) {
    if (panel) close();
    anchorBtn = btn || toolButton();
    panel = build();
    if (!panel) return false;
    paint();
    place();
    bindDoc(true);
    if (anchorBtn && anchorBtn.setAttribute) anchorBtn.setAttribute("aria-pressed", "true");
    return true;
  }

  function close() {
    bindDoc(false);
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    if (anchorBtn && anchorBtn.setAttribute) anchorBtn.setAttribute("aria-pressed", "false");
    anchorBtn = null;
  }

  function toggle(btn) {
    if (panel) {
      close();
      return false;
    }
    return open(btn);
  }

  /* =====================================================================
   * 시작 — 차트가 만들어질 때까지 잠깐 기다립니다.
   * ===================================================================== */
  function boot() {
    current = loadSaved();
    var tries = 0;
    var timer = setInterval(function () {
      if (findParts()) {
        clearInterval(timer);
        wrapSeries();
        if (current !== "candle") apply();
        else paintButton();
        return;
      }
      if (++tries > 200) clearInterval(timer); /* 10초 — 차트가 없는 화면 */
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    getType: getType,
    setType: setType,
    TYPES: TYPES,
    SYNTHETIC: SYNTHETIC,
    PANEL_ID: PANEL_ID,
    NOTICE_ID: NOTICE_ID,
    STORAGE_KEY: STORAGE_KEY,
    LINE_WIDTH: LINE_WIDTH,
    /* 하이킨아시 계산을 밖에서 검사할 수 있게 내줍니다 (tests 에서 씁니다) */
    heikinAshi: function (bars) {
      var out = [];
      var prev = null;
      for (var i = 0; i < bars.length; i++) {
        var v = haOne(bars[i], prev);
        out.push(v);
        prev = v;
      }
      return out;
    },
    /* 확인용 */
    getSeriesForTest: function () {
      return { chart: chart, candle: candle, overlay: overlay, kind: overlayKind, wrapped: wrapped };
    }
  };
})();
