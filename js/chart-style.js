/* =========================================================================
 * js/chart-style.js — App.ChartStyle
 * =========================================================================
 * 가로 막대의 "육각형" 버튼을 엽니다 (준비중 2개 중 하나).
 *
 * ── 육각형이 무엇인가 (2026-08-28 바이낸스 실측) ──────────────────────
 * binance.com/en/futures/BTCUSDT 를 1440x900 으로 직접 열어(로그아웃 상태)
 * 가로 막대의 아이콘을 하나씩 짚어 이름표를 읽었습니다.
 *
 *   x=249 Time Tools · x=281 Compare · x=313 Technical Indicator
 *   x=345 (봉 종류 고르기) · x=377 Chart Style ← 육각형 · x=409 설정
 *
 * 즉 육각형 = **Chart Style**(차트 스타일) 창입니다. 무엇을 그리는 도구가
 * 아니라 "차트 생김새를 바꾸는 창" 입니다.
 *   캡처 — shots/ct8-bnf-hex-panel.png (봉 탭) · shots/ct8-bnf-hex-bg.png (배경 탭)
 *
 * 바이낸스 창의 구성 (실측 그대로)
 *   왼쪽 탭 : Symbol / Background
 *   Symbol  : Chart(Candle·Line·Bars·Area) / Bullish Candle Stick(Solid·Hollow)
 *             Candle Stick(오름·내림 색) / Borders(색) / Wick(색)
 *             Trade Marker(B/S·Arrows)
 *   Background : Color / Vert Grid Lines(체크+색) / Horz Grid Lines(체크+색)
 *   맨 아래  : Reset · Save
 *
 * 로그인 없이 열립니다(로그아웃 상태에서 실제로 열어 확인). Original 모드
 * 전용입니다 — Trading View 모드로 바꾸면 가로 막대에서 육각형이 사라집니다
 * (그 모드 아이콘 전부를 훑어 육각형 path 가 없음을 확인).
 *
 * ── 회원이 왜 쓰나 ────────────────────────────────────────────────────
 * 캔들 색과 격자선은 "보는 눈" 을 바꿉니다. 색약이라 초록·빨강 구분이 힘든
 * 회원, 속빈 캔들(윤곽선만)로 봐야 눌림목이 보이는 회원, 격자선이 있어야
 * 가격 눈금을 가늠하는 회원이 있습니다. 바이낸스에서 이렇게 맞춰 놓고
 * 쓰던 사람이 여기 오면 화면이 달라 보여 손이 어긋납니다.
 *
 * ── 우리 차트에서 실제로 달랐던 것 (격자선) ───────────────────────────
 * 바이낸스 Original 다크 차트의 격자선을 캔버스 픽셀로 읽었습니다.
 *   가로선 : rgb(50,60,70) = #323C46, 1px, 세로 간격 52.6px
 *            (y=50/51 · 103/104 · 156 · 208/209 · 261/262 실측)
 *   세로선 : 같은 색 (x=155/156 에서 확인 — 날짜 눈금 자리)
 * 우리 차트는 js/chart.js:48 에서 grid 색이 rgba(0,0,0,0.06) 입니다.
 * 배경 #0A0F1C 위에 검정 6% 라서 사실상 안 보입니다(라이트 테마 때 값이
 * 남은 것으로 보입니다). 그래서 이 창의 격자선은 켜면 팔레트 테두리색
 * #1D273B 로 그립니다.
 *   ⚠ 기본값은 지금 화면 그대로(격자선 꺼짐)입니다. 아무도 이 창을 열지
 *     않으면 차트는 오늘과 한 픽셀도 다르지 않습니다. 바이낸스는 기본이
 *     켜짐이지만, 기본값을 바꾸는 것은 모든 회원 화면이 같이 바뀌는 일이라
 *     본부장 판단으로 남겨 두고 보고만 합니다.
 *
 * ── 넣지 않은 것 · 왜 ─────────────────────────────────────────────────
 *   · Trade Marker(B/S·Arrows) — 내 체결 자리를 봉 위에 찍는 것입니다.
 *     로그인해야 값이 있어 차트팀이 확인할 수 없고, 우리는 이미 진입가·
 *     TP·SL·청산가 가로선(js/chart-position-lines.js)이 그 자리를 대신
 *     하고 있습니다. 만들기 전에 본부장 판단이 필요합니다.
 *   · Background 의 배경색 — 우리는 다크 하나로만 운영합니다(CLAUDE.md).
 *     줄은 바이낸스와 같은 자리에 두되 "다크 고정" 이라고 적어 둡니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두어서
 * App.ChartFont.getCharts() 로 차트 객체를 받고, 라이브러리 공개 API 인
 * chart.panes()[n].getSeries() 로 캔들 시리즈를 찾습니다. 바꾸는 것은
 * 전부 공개 API 인 applyOptions 뿐입니다(시리즈를 지우거나 새로 만들지
 * 않습니다 — 그러면 가로선·그림이 전부 떨어집니다).
 *
 * ── 봉 종류(js/chart-candle-type.js)와 부딪히지 않게 ──────────────────
 * 라인·바·영역일 때 그 파일이 캔들을 "투명" 으로 만들어 숨깁니다. 그 상태에서
 * 우리가 색을 칠하면 숨겨 둔 캔들이 다시 나타납니다. 그래서
 *   1) 봉 종류가 "캔들" 일 때만 캔들 색을 칠합니다
 *   2) App.ChartCandleType.setType 을 밖에서 감싸, 캔들로 되돌아오는
 *      순간 우리 색을 다시 칠합니다
 * 그 파일도 한 글자 안 고쳤습니다.
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * 시세가 들어올 때 하는 일이 0 입니다. 회원이 창에서 무엇을 고른 그 순간에만
 * applyOptions 를 한 번 부릅니다. 지표처럼 봉마다 계산하는 것이 없습니다.
 *
 * ── 어디에 저장하나 ───────────────────────────────────────────────────
 * App.Storage 키 "chart-style" (실제 키 btc_sim_v2_chart-style).
 * 종목·봉 간격과 무관하게 하나만 기억합니다 — 바이낸스도 Chart Style 을
 * 종목별로 두지 않습니다(창 안내문 "Chart Style will take precedence over
 * Layout Settings"). 봉 종류(7차)와 같은 규칙입니다.
 *
 * ── 되돌리기 ──────────────────────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-style.js"></script> 삭제
 *   2) js/chart-drawings.js 의 TOP_TOOLS 에서 hex 의 ready:true -> false,
 *      label 을 "육각형" 으로 되돌리기
 *   3) js/chart-drawings.js onButton() 의 hex 토막 삭제
 *   4) js/chart-style.js 파일 삭제
 * 회원 브라우저에 남은 btc_sim_v2_chart-style 키는 아무 일도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartStyle = (function () {
  "use strict";

  /* 확정 팔레트만 씁니다. 새 색을 만들지 않습니다. */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";
  var C_BG = "#0A0F1C";

  var STORAGE_KEY = "chart-style";
  var STYLE_ID = "chart-style-css";
  var PANEL_ID = "tl-cs-modal";
  var TRANSPARENT = "rgba(0,0,0,0)";

  /* 격자선을 켤 때 쓰는 기본색 — 팔레트 테두리색입니다.
     (바이낸스 실측은 #323C46 이지만 우리 배경 #0A0F1C 에는 이쪽이 맞습니다) */
  var GRID_DEFAULT = C_BORDER;

  /* ---------------- 상태 ---------------- */
  var chart = null;
  var candle = null;
  var base = null;   /* js/chart.js 가 만들어 둔 처음 값 — 되돌리기 기준 */
  var st = null;     /* 지금 화면에 적용된 값 */
  var saved = null;  /* 마지막으로 저장된 값 (저장 없이 닫으면 여기로 돌아갑니다) */
  var modal = null;
  var tab = "candle";
  var wrappedType = false;
  var docBound = false;

  function clone(o) {
    var out = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    return out;
  }
  function same(a, b) {
    if (!a || !b) return false;
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k) && a[k] !== b[k]) return false;
    return true;
  }

  /* =====================================================================
   * 차트·시리즈 찾기 (js/chart.js 무수정 — 봉 종류 파일과 같은 방식)
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

  /* 처음 값을 그 자리에서 읽어옵니다.
     숫자를 여기 적어 두면 js/chart.js 가 바뀔 때 여기만 옛 색으로 남는
     "조용한 고장" 이 됩니다. 그래서 절대 적지 않습니다. */
  function readBase() {
    if (base) return base;
    if (!findParts()) return null;
    var o = null;
    try {
      o = candle.options();
    } catch (e) {
      o = null;
    }
    if (!o) return null;
    var up = o.upColor;
    var dn = o.downColor;
    base = {
      hollow: false,
      up: hex6(up),
      down: hex6(dn),
      borderOn: !!o.borderVisible,
      /* 지금은 테두리가 꺼져 있어(js/chart.js borderVisible:false) 라이브러리
         기본 테두리색(#26a69a/#ef5350)이 그대로 들어 있습니다. 그 색을 그대로
         쓰면 회원이 테두리를 켜는 순간 엉뚱한 청록색이 나옵니다 —
         꺼져 있을 때는 봉 색과 같은 색에서 시작합니다. */
      borderUp: hex6(o.borderVisible ? (o.borderUpColor || up) : up),
      borderDown: hex6(o.borderVisible ? (o.borderDownColor || dn) : dn),
      wickUp: hex6(o.wickUpColor || up),
      wickDown: hex6(o.wickDownColor || dn),
      gridV: false,
      gridH: false,
      gridColor: GRID_DEFAULT.toLowerCase()
    };
    return base;
  }

  /* <input type="color"> 는 #rrggbb 만 받습니다. rgb()/rgba() 도 들어올 수
     있어서 한 번 걸러 줍니다(못 읽으면 팔레트 값으로). */
  function hex6(v) {
    if (typeof v !== "string") return C_MUTED.toLowerCase();
    var s = v.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
    if (/^#[0-9a-fA-F]{3}$/.test(s)) {
      return ("#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3]).toLowerCase();
    }
    var m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) return ("#" + two(m[1]) + two(m[2]) + two(m[3])).toLowerCase();
    return C_MUTED.toLowerCase();
  }
  function two(n) {
    var x = Math.max(0, Math.min(255, parseInt(n, 10) || 0)).toString(16);
    return x.length === 1 ? "0" + x : x;
  }

  /* =====================================================================
   * 저장
   * ===================================================================== */
  var KEYS = ["hollow", "up", "down", "borderOn", "borderUp", "borderDown",
              "wickUp", "wickDown", "gridV", "gridH", "gridColor"];

  function loadSaved() {
    try {
      if (!App.Storage || typeof App.Storage.load !== "function") return null;
      var s = App.Storage.load(STORAGE_KEY);
      if (!s || typeof s !== "object") return null;
      var b = readBase();
      if (!b) return null;
      var out = clone(b);
      for (var i = 0; i < KEYS.length; i++) {
        var k = KEYS[i];
        if (!(k in s)) continue;
        if (typeof b[k] === "boolean") out[k] = !!s[k];
        else if (typeof s[k] === "string" && /^#[0-9a-fA-F]{6}$/.test(s[k])) out[k] = s[k].toLowerCase();
      }
      return out;
    } catch (e) {
      return null;
    }
  }

  function saveNow() {
    try {
      if (!App.Storage) return;
      var b = readBase();
      if (b && same(st, b)) {
        /* 기본값 그대로면 저장할 것이 없습니다 */
        if (typeof App.Storage.clear === "function") App.Storage.clear(STORAGE_KEY);
        saved = clone(st);
        return;
      }
      var pack = {};
      for (var i = 0; i < KEYS.length; i++) pack[KEYS[i]] = st[KEYS[i]];
      if (typeof App.Storage.save === "function") App.Storage.save(STORAGE_KEY, pack);
      saved = clone(st);
    } catch (e) {
      /* 저장이 막힌 환경 — 화면 동작은 그대로 둡니다 */
    }
  }

  /* =====================================================================
   * 적용 — 회원이 고른 그 순간에만 부릅니다 (시세마다 하는 일 0)
   * ===================================================================== */
  function candleTypeNow() {
    try {
      if (App.ChartCandleType && typeof App.ChartCandleType.getType === "function") {
        return App.ChartCandleType.getType();
      }
    } catch (e) {
      /* 없으면 캔들로 봅니다 */
    }
    return "candle";
  }

  function applyAll() {
    if (!st || !findParts()) return false;
    /* 라인·바·영역이면 캔들은 숨겨져 있습니다. 여기서 색을 칠하면
       숨겨 둔 캔들이 다시 나타납니다 — 그래서 캔들일 때만 칠합니다. */
    if (candleTypeNow() === "candle") {
      try {
        candle.applyOptions({
          upColor: st.hollow ? TRANSPARENT : st.up,
          downColor: st.down,
          borderVisible: !!(st.borderOn || st.hollow),
          borderUpColor: st.borderOn ? st.borderUp : st.up,
          borderDownColor: st.borderOn ? st.borderDown : st.down,
          wickUpColor: st.wickUp,
          wickDownColor: st.wickDown
        });
      } catch (e) {
        /* 무시 — 격자선은 계속 시도합니다 */
      }
    }
    try {
      chart.applyOptions({
        grid: {
          vertLines: { color: st.gridColor, visible: !!st.gridV },
          horzLines: { color: st.gridColor, visible: !!st.gridH }
        }
      });
    } catch (e) {
      /* 무시 */
    }
    return true;
  }

  /* 봉 종류가 캔들로 되돌아오는 순간 우리 색을 다시 칠합니다.
     (그 파일은 숨기기 전 "처음 색" 을 기억해 두었다가 되돌립니다) */
  function wrapCandleType() {
    if (wrappedType) return;
    var ct = window.App && App.ChartCandleType;
    if (!ct || typeof ct.setType !== "function") return;
    var orig = ct.setType;
    try {
      ct.setType = function () {
        var r = orig.apply(ct, arguments);
        try {
          if (st && candleTypeNow() === "candle") applyAll();
        } catch (e) {
          /* 무시 */
        }
        return r;
      };
      wrappedType = true;
    } catch (e) {
      /* 무시 — 못 감싸도 창은 그대로 동작합니다 */
    }
  }

  /* =====================================================================
   * 창 (확정 팔레트 · 그림자 없음 · 모서리 10px)
   *
   * 바이낸스 실측(1440px) 과 우리 값
   *   창 크기      660x580        ->  최대 560 (폭 좁으면 화면 - 32)
   *   모서리       16px           ->  10px  (CLAUDE.md 상한 12px)
   *   왼쪽 탭 열   156px          ->  128px
   *   줄 간격      52px           ->  44px
   *   컨트롤 높이  32px           ->  30px
   *   색 타일      32x32(안 24)   ->  28x28(안 20)
   *   버튼         136x40 br6     ->  높이 36 br6
   *   제목         20px/600       ->  15px/700
   *   이름표       14px           ->  12px
   *   저장 버튼    #FCD535 + 어두운 글자 -> #F0B429 + #0A0F1C (같은 규칙)
   * 작게 줄인 이유 — 우리 차트 칸이 바이낸스보다 좁고, 360 폰에서 16px
   * 컨트롤이 들어가면 오른쪽이 잘립니다.
   * ===================================================================== */
  /* 2026-08-31 대표 "다 키워줘 / 여전히 작다" (두 번째 지시) — 글자 확대
     제목 18 -> 20px / 닫기 ✕ 16 -> 20px / 왼쪽 탭 14 -> 16px
     항목 이름 14 -> 16px / 아래 설명 12 -> 14px / 맨 아래 설명 12 -> 14px
     고른값 표시 12.5 -> 14px / 선택 상자 13.5 -> 16px(높이 34 -> 40)
     체크박스 글자 13.5 -> 16px(네모 14 -> 17) / 버튼 14 -> 16px(높이 42 -> 48)
     되돌리려면 화살표 왼쪽 값으로. 창 폭(620px)과 색은 그대로입니다. */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var P = "#" + PANEL_ID;
    var css =
      /* z-index 995 — 폰 하단 매수/매도 바(990)보다 위, 로그인 게이트(1000)보다
         아래입니다(style.css:4311 의 규칙과 같은 줄에 맞춘 값). 80 으로 두었더니
         360 폰에서 창이 떠 있는데도 아래 매수/매도 버튼이 눌리는 상태였습니다. */
      P + "{position:fixed;left:0;top:0;right:0;bottom:0;z-index:995;display:flex;" +
      "align-items:center;justify-content:center;background:rgba(10,15,28,.72);" +
      "font-family:inherit;padding:16px;}" +
      P + " .tl-cs-box{width:620px;max-width:100%;max-height:100%;background:" + C_CARD + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:10px;overflow:hidden;display:flex;" +
      "flex-direction:column;position:relative;}" +
      P + " .tl-cs-box::before{content:\"\";position:absolute;left:0;right:0;top:0;height:1px;" +
      "background:rgba(255,255,255,.03);pointer-events:none;}" +
      P + " .tl-cs-head{display:flex;align-items:center;justify-content:space-between;" +
      "padding:12px 16px;border-bottom:1px solid " + C_BORDER + ";flex:0 0 auto;}" +
      P + " .tl-cs-title{font-size:20px;font-weight:700;color:" + C_TEXT + ";}" +
      P + " .tl-cs-x{background:none;border:0;color:" + C_MUTED + ";font-size:20px;line-height:1;" +
      "cursor:pointer;padding:4px 6px;border-radius:4px;font-family:inherit;}" +
      P + " .tl-cs-x:hover{color:" + C_TEXT + ";}" +
      P + " .tl-cs-body{display:flex;min-height:0;flex:1 1 auto;}" +
      P + " .tl-cs-tabs{width:144px;flex:0 0 144px;border-right:1px solid " + C_BORDER + ";" +
      "background:" + C_TILE + ";padding:8px 0;}" +
      P + " .tl-cs-tab{width:100%;display:block;background:none;border:0;text-align:left;" +
      "padding:12px 14px;font-size:16px;font-weight:600;color:" + C_MUTED + ";cursor:pointer;" +
      "font-family:inherit;}" +
      P + " .tl-cs-tab[aria-selected=\"true\"]{color:" + C_TEXT + ";background:" + C_CARD + ";}" +
      P + " .tl-cs-pane{flex:1 1 auto;min-width:0;overflow-y:auto;overscroll-behavior:contain;" +
      "padding:11px 16px 16px;}" +
      P + " .tl-cs-pane::-webkit-scrollbar{width:3px;}" +
      P + " .tl-cs-pane::-webkit-scrollbar-thumb{background:" + C_BORDER + ";border-radius:2px;}" +
      P + " .tl-cs-row{display:flex;align-items:center;gap:10px;min-height:44px;}" +
      P + " .tl-cs-label{flex:1 1 auto;min-width:0;font-size:16px;line-height:1.4;color:" + C_TEXT + ";}" +
      P + " .tl-cs-sub{display:block;font-size:14px;line-height:1.45;color:" + C_MUTED + ";margin-top:3px;}" +
      P + " .tl-cs-ctl{flex:0 0 auto;display:flex;align-items:center;gap:6px;}" +
      P + " select.tl-cs-sel{height:40px;min-width:124px;background:" + C_TILE + ";color:" + C_TEXT + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:6px;font-size:16px;font-family:inherit;" +
      "padding:0 8px;cursor:pointer;}" +
      P + " .tl-cs-sw{width:28px;height:28px;border-radius:6px;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";display:inline-flex;align-items:center;justify-content:center;" +
      "cursor:pointer;padding:0;position:relative;}" +
      P + " .tl-cs-sw i{display:block;width:20px;height:20px;border-radius:4px;}" +
      P + " .tl-cs-sw input{position:absolute;left:0;top:0;width:100%;height:100%;opacity:0;" +
      "cursor:pointer;border:0;padding:0;}" +
      P + " .tl-cs-chk{display:inline-flex;align-items:center;gap:8px;font-size:16px;color:" + C_TEXT + ";" +
      "cursor:pointer;}" +
      P + " .tl-cs-chk input{accent-color:" + C_POINT + ";width:17px;height:17px;cursor:pointer;}" +
      P + " .tl-cs-note{font-size:14px;line-height:1.55;color:" + C_MUTED + ";padding-top:8px;" +
      "border-top:1px solid " + C_BORDER + ";margin-top:6px;}" +
      P + " .tl-cs-foot{display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;" +
      "border-top:1px solid " + C_BORDER + ";flex:0 0 auto;}" +
      P + " .tl-cs-btn{height:48px;min-width:112px;border-radius:6px;border:1px solid " + C_BORDER + ";" +
      "background:" + C_TILE + ";color:" + C_TEXT + ";font-size:16px;font-weight:600;cursor:pointer;" +
      "font-family:inherit;padding:0 16px;}" +
      P + " .tl-cs-btn.on{background:" + C_POINT + ";border-color:" + C_POINT + ";color:" + C_BG + ";}" +
      P + " .tl-cs-fixed{font-size:14px;color:" + C_MUTED + ";}" +
      "@media (max-width:520px){" +
      P + "{padding:8px;}" +
      P + " .tl-cs-body{flex-direction:column;}" +
      P + " .tl-cs-tabs{width:100%;flex:0 0 auto;display:flex;border-right:0;" +
      "border-bottom:1px solid " + C_BORDER + ";padding:0;}" +
      P + " .tl-cs-tab{width:auto;flex:1 1 0;text-align:center;padding:11px 6px;}" +
      P + " .tl-cs-row{flex-wrap:wrap;min-height:0;padding:9px 0;gap:8px;}" +
      P + " .tl-cs-label{flex:1 1 100%;}" +
      P + " select.tl-cs-sel{min-width:108px;}" +
      "}";
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  function host() {
    /* 전체화면일 때도 보이도록 차트 칸 안에 넣습니다
       (전체화면이 되는 것은 .chart-panel 입니다 — js/chart-drawings.js) */
    return document.querySelector(".chart-panel") || document.body;
  }

  function swatch(key, label) {
    var b = document.createElement("span");
    b.className = "tl-cs-sw";
    b.setAttribute("title", label);
    var i = document.createElement("i");
    i.style.background = st[key];
    var inp = document.createElement("input");
    inp.type = "color";
    inp.value = st[key];
    inp.setAttribute("aria-label", label);
    inp.setAttribute("data-cs", key);
    inp.addEventListener("input", function () {
      st[key] = hex6(inp.value);
      i.style.background = st[key];
      applyAll();
    });
    b.appendChild(i);
    b.appendChild(inp);
    return b;
  }

  function row(label, sub) {
    var r = document.createElement("div");
    r.className = "tl-cs-row";
    var l = document.createElement("div");
    l.className = "tl-cs-label";
    l.appendChild(document.createTextNode(label));
    if (sub) {
      var s = document.createElement("span");
      s.className = "tl-cs-sub";
      s.textContent = sub;
      l.appendChild(s);
    }
    var c = document.createElement("div");
    c.className = "tl-cs-ctl";
    r.appendChild(l);
    r.appendChild(c);
    r.ctl = c;
    return r;
  }

  function select(options, value, onChange) {
    var s = document.createElement("select");
    s.className = "tl-cs-sel";
    for (var i = 0; i < options.length; i++) {
      var o = document.createElement("option");
      o.value = options[i].k;
      o.textContent = options[i].name;
      if (options[i].k === value) o.selected = true;
      s.appendChild(o);
    }
    s.addEventListener("change", function () {
      onChange(s.value);
    });
    return s;
  }

  function checkbox(on, label, onChange) {
    var w = document.createElement("label");
    w.className = "tl-cs-chk";
    var c = document.createElement("input");
    c.type = "checkbox";
    c.checked = !!on;
    c.setAttribute("aria-label", label);
    c.addEventListener("change", function () {
      onChange(c.checked);
    });
    var t = document.createElement("span");
    t.textContent = label;
    w.appendChild(c);
    w.appendChild(t);
    return w;
  }

  function paintPane() {
    if (!modal) return;
    var pane = modal.querySelector(".tl-cs-pane");
    if (!pane) return;
    pane.innerHTML = "";
    var tabs = modal.querySelectorAll(".tl-cs-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-tab") === tab ? "true" : "false");
    }

    if (tab === "candle") {
      /* 1) 봉 종류 — 목록은 js/chart-candle-type.js 가 들고 있습니다 */
      var types = [];
      try {
        if (App.ChartCandleType && App.ChartCandleType.TYPES) {
          for (var t = 0; t < App.ChartCandleType.TYPES.length; t++) {
            types.push({ k: App.ChartCandleType.TYPES[t].k, name: App.ChartCandleType.TYPES[t].name });
          }
        }
      } catch (e) {
        types = [];
      }
      if (types.length) {
        var r0 = row("봉 종류", "캔들일 때만 아래 색이 적용됩니다");
        r0.ctl.appendChild(select(types, candleTypeNow(), function (v) {
          try {
            App.ChartCandleType.setType(v);
          } catch (e) {
            /* 무시 */
          }
          paintPane();
        }));
        pane.appendChild(r0);
      }

      /* 2) 상승봉 채움 / 속빈 */
      var r1 = row("상승봉", "속빈 = 윤곽선만 (바이낸스 Hollow)");
      r1.ctl.appendChild(select(
        [{ k: "solid", name: "채움" }, { k: "hollow", name: "속빈" }],
        st.hollow ? "hollow" : "solid",
        function (v) {
          st.hollow = v === "hollow";
          applyAll();
        }
      ));
      pane.appendChild(r1);

      /* 3) 봉 색 */
      var r2 = row("봉 색", "왼쪽 상승 · 오른쪽 하락");
      r2.ctl.appendChild(swatch("up", "상승 봉 색"));
      r2.ctl.appendChild(swatch("down", "하락 봉 색"));
      pane.appendChild(r2);

      /* 4) 테두리 */
      var r3 = row("테두리", "지금 화면은 테두리 없음이 기본입니다");
      r3.ctl.appendChild(checkbox(st.borderOn, "보이기", function (on) {
        st.borderOn = on;
        applyAll();
        paintPane();
      }));
      if (st.borderOn) {
        r3.ctl.appendChild(swatch("borderUp", "상승 테두리 색"));
        r3.ctl.appendChild(swatch("borderDown", "하락 테두리 색"));
      }
      pane.appendChild(r3);

      /* 5) 심지 */
      var r4 = row("심지", "봉 위아래 꼬리");
      r4.ctl.appendChild(swatch("wickUp", "상승 심지 색"));
      r4.ctl.appendChild(swatch("wickDown", "하락 심지 색"));
      pane.appendChild(r4);

      var n = document.createElement("div");
      n.className = "tl-cs-note";
      n.textContent =
        "바이낸스 같은 자리에 있는 체결 표시(Trade Marker)는 넣지 않았습니다 — " +
        "우리는 진입가·TP·SL·청산가 가로선이 그 자리를 대신합니다.";
      pane.appendChild(n);
      return;
    }

    /* 배경 탭 */
    var b0 = row("배경색", "다크 하나로만 운영합니다");
    var fx = document.createElement("span");
    fx.className = "tl-cs-fixed";
    fx.textContent = "고정 " + C_BG;
    b0.ctl.appendChild(fx);
    pane.appendChild(b0);

    var b1 = row("세로 격자선", "봉 시간 눈금 자리");
    b1.ctl.appendChild(checkbox(st.gridV, "켜기", function (on) {
      st.gridV = on;
      applyAll();
    }));
    pane.appendChild(b1);

    var b2 = row("가로 격자선", "가격 눈금 자리");
    b2.ctl.appendChild(checkbox(st.gridH, "켜기", function (on) {
      st.gridH = on;
      applyAll();
    }));
    pane.appendChild(b2);

    /* 색은 세로·가로가 같이 바뀝니다 — 바이낸스는 줄마다 따로 고르게 해
       두었지만, 세로만 다른 색으로 해 둔 화면을 본 적이 없어 한 줄로
       합쳤습니다. 나누려면 gridColor 를 둘로 쪼개면 됩니다. */
    var b3 = row("격자선 색", "세로·가로가 함께 바뀝니다");
    b3.ctl.appendChild(swatch("gridColor", "격자선 색"));
    pane.appendChild(b3);

    var n2 = document.createElement("div");
    n2.className = "tl-cs-note";
    n2.textContent =
      "바이낸스는 격자선이 처음부터 켜져 있고 색은 #323C46 입니다(실측). " +
      "우리는 지금 화면을 그대로 두려고 꺼짐으로 시작합니다.";
    pane.appendChild(n2);
  }

  function build() {
    injectStyle();
    var wrap = document.createElement("div");
    wrap.id = PANEL_ID;
    wrap.addEventListener("mousedown", function (ev) {
      if (ev.target === wrap) close();
    });

    var box = document.createElement("div");
    box.className = "tl-cs-box";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "차트 스타일");

    var head = document.createElement("div");
    head.className = "tl-cs-head";
    var ti = document.createElement("span");
    ti.className = "tl-cs-title";
    ti.textContent = "차트 스타일";
    var x = document.createElement("button");
    x.type = "button";
    x.className = "tl-cs-x";
    x.setAttribute("aria-label", "차트 스타일 닫기");
    x.textContent = "✕";
    x.addEventListener("click", function () {
      close();
    });
    head.appendChild(ti);
    head.appendChild(x);
    box.appendChild(head);

    var body = document.createElement("div");
    body.className = "tl-cs-body";
    var tabs = document.createElement("div");
    tabs.className = "tl-cs-tabs";
    tabs.setAttribute("role", "tablist");
    [{ k: "candle", name: "봉" }, { k: "bg", name: "배경" }].forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tl-cs-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("data-tab", d.k);
      b.setAttribute("aria-selected", d.k === tab ? "true" : "false");
      b.textContent = d.name;
      b.addEventListener("click", function () {
        tab = d.k;
        paintPane();
      });
      tabs.appendChild(b);
    });
    var pane = document.createElement("div");
    pane.className = "tl-cs-pane";
    body.appendChild(tabs);
    body.appendChild(pane);
    box.appendChild(body);

    var foot = document.createElement("div");
    foot.className = "tl-cs-foot";
    var reset = document.createElement("button");
    reset.type = "button";
    reset.className = "tl-cs-btn";
    reset.textContent = "되돌리기";
    reset.addEventListener("click", function () {
      var b = readBase();
      if (!b) return;
      st = clone(b);
      applyAll();
      paintPane();
    });
    var save = document.createElement("button");
    save.type = "button";
    save.className = "tl-cs-btn on";
    save.textContent = "저장";
    save.addEventListener("click", function () {
      saveNow();
      close(true);
    });
    foot.appendChild(reset);
    foot.appendChild(save);
    box.appendChild(foot);

    wrap.appendChild(box);
    host().appendChild(wrap);
    return wrap;
  }

  function onKey(ev) {
    if (ev.key === "Escape" && modal) close();
  }

  /* =====================================================================
   * 열기 / 닫기
   * ===================================================================== */
  function open() {
    if (modal) return true;
    if (!readBase()) return false;
    wrapCandleType();
    st = clone(st || saved || base);
    modal = build();
    paintPane();
    if (!docBound) {
      document.addEventListener("keydown", onKey, true);
      docBound = true;
    }
    paintButton();
    return true;
  }

  function close(kept) {
    if (!modal) return;
    if (!kept) {
      /* 저장을 안 눌렀으면 마지막으로 저장된 값(없으면 처음 값)으로 되돌립니다 */
      st = clone(saved || base);
      applyAll();
    }
    if (modal.parentNode) modal.parentNode.removeChild(modal);
    modal = null;
    paintButton();
  }

  function toggle() {
    if (modal) close();
    else open();
  }

  function isOpen() {
    return !!modal;
  }

  function toolButton() {
    return document.querySelector('.tlc-toolbar .tlc-btn[data-tlc="hex"]');
  }

  function paintButton() {
    var b = toolButton();
    if (!b) return;
    var on = st && base && !same(st, base);
    var label = "차트 스타일" + (on ? " — 바꾼 값 있음" : "");
    b.setAttribute("title", label);
    b.setAttribute("aria-label", label);
  }

  /* =====================================================================
   * 시작 — 저장해 둔 것이 있으면 그것만 적용합니다.
   * 아무것도 없으면 차트를 건드리지 않습니다(오늘 화면 그대로).
   * ===================================================================== */
  function init() {
    var tries = 0;
    (function wait() {
      tries++;
      if (findParts() && readBase()) {
        var s = loadSaved();
        if (s) {
          saved = clone(s);
          st = clone(s);
          wrapCandleType();
          applyAll();
        }
        paintButton();
        return;
      }
      if (tries < 40) setTimeout(wait, 250);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    apply: applyAll,
    PANEL_ID: PANEL_ID,
    STORAGE_KEY: STORAGE_KEY,
    /* 확인용 */
    getStateForTest: function () {
      return { base: base, st: st, saved: saved, chart: chart, candle: candle, wrappedType: wrappedType };
    }
  };
})();
