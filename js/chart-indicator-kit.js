/* =========================================================================
 * js/chart-indicator-kit.js - App.ChartIndicatorKit   (지표 틀)
 * =========================================================================
 * 지표를 "정의 1개 + 인스턴스 N개" 로 얹는 틀입니다.
 *
 * -- 왜 이 모양인가 (2026-09-02 트레이딩뷰 실측) -----------------------
 * 트레이딩뷰 범례를 세었더니 이랬습니다.
 *     "MA 7 close 0"  "MA 25 close 0"  "MA 99 close 0"  "Volume"
 * MA7 · MA25 · MA99 는 서로 다른 지표가 아닙니다. "MA" 라는 정의 하나를
 * 기간만 달리해 세 번 얹은 것입니다. 각 줄마다 따로 숨기고 · 설정하고 ·
 * 지울 수 있고, 더보기 메뉴에 Move to(어느 칸으로) 까지 있습니다.
 *
 * 그래서 이 틀은 둘로 나눕니다.
 *     define(정의)        계산식. 프로그래머가 한 번 적습니다
 *     addInstance(정의id) 그 정의를 실제로 화면에 얹은 것 하나.
 *                         기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다
 *
 * -- 왜 틀이 먼저인가 (2026-09-02 실측) -------------------------------
 *   지표 하나 늘리는 데 손대야 할 곳   17군데
 *     js/chart-indicators.js 안에만 14군데("ma7" 이 글자로 박힌 줄)
 *   지표 하나 껐다 켜는 시간           MA7 6.51ms / MACD 3.36ms (봉 1006개)
 * 6.51ms 인 이유는 redrawAll() 이 "켠 지표 하나" 가 아니라 "켜진 것 전부" 를
 * 다시 계산하기 때문입니다. 트레이딩뷰만큼(내장 127개) 채우면 같은 방식으로
 * 한 번 누를 때마다 수백 ms - 화면 한 장이 16.7ms 이니 못 씁니다.
 * 이 틀은 "켠 인스턴스 하나만" 다시 계산합니다.
 *
 * -- 기존 7개는 한 글자도 안 건드렸습니다 -----------------------------
 * js/chart-indicators.js (MA7 · MA25 · MA99 · 볼린저 · 거래량)
 * js/chart-oscillators.js (RSI · MACD)
 * js/chart-indicator-menu.js (fx 목록)
 * 셋 다 그대로입니다. 이 파일을 지우면 어제 화면 그대로 돌아갑니다.
 *
 * -- js/chart.js 도 한 글자도 안 건드렸습니다 -------------------------
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두었기 때문에
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 캔들 · 거래량 시리즈는
 * 공개 API 인 chart.panes()[n].getSeries() 로 찾습니다.
 * 1~4단계와 같은 방식입니다.
 *
 * -- 틀이 강제하는 것 (조용히 넘어가지 않고 등록을 거부합니다) --------
 *   1) step 이 없으면 거부
 *      step 은 "마지막 봉 하나만 O(1) 로 갱신" 하는 함수입니다. 이게 없으면
 *      틱마다 전체를 다시 계산하는 지표가 되어 화면이 버벅입니다.
 *      나중에 누가 그런 지표를 몰래 끼워 넣지 못하게 틀에서 막습니다.
 *   2) seed 가 없으면 거부 (켤 때 한 번 전체 계산)
 *   3) 지표선 색 목록 밖의 색이면 거부 (아래 LINE_COLORS)
 *   4) id 가 겹치면 거부
 *
 * -- 계산이 한 곳에만 있게 --------------------------------------------
 * 봉 데이터(시각 · 시가 · 고가 · 저가 · 종가 · 거래량)는 이 파일 안에 딱
 * 한 벌만 있습니다(BarStore). 인스턴스는 그걸 읽기만 합니다. 인스턴스를
 * 100개 얹어도 배열은 한 벌이고 감시 타이머도 하나입니다.
 * 값 자체(청산가 · 손익)는 지금처럼 App.Trading 에서만 읽습니다. 이 틀은
 * 시세만 씁니다.
 *
 * -- 꺼져 있으면 계산도 하지 않습니다 ---------------------------------
 * 켜진 인스턴스가 하나도 없으면 onTick() 첫 줄에서 바로 돌아갑니다.
 * 봉 배열도 만들지 않고 감시 타이머도 안 돕니다. 기본은 전부 꺼짐입니다.
 *
 * -- fx 목록에 어떻게 끼어드나 ----------------------------------------
 * js/chart-indicator-menu.js 를 고치지 않고 두 가지만 합니다.
 *   1) App.ChartIndicators.isOn / .toggle 을 감쌉니다(함수 감싸기 패턴).
 *      목록이 mod(who).isOn(key) 로 물어보는데, 우리 인스턴스 id 면 우리가
 *      답하고 아니면 원래 함수에 그대로 넘깁니다.
 *      - 그래서 점 색 · 스위치 · 눌림 표시가 저쪽 코드로 그대로 그려집니다.
 *        우리가 CSS 를 다시 적지 않습니다(같은 값이 두 곳에 생기지 않게).
 *   2) 목록 창이 열리면 MutationObserver 로 우리 줄을 이어 붙입니다.
 * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 세기 때문에 우리
 * 것을 못 셉니다. 그대로 두면 화면이 사실과 달라지므로(EMA 를 켰는데
 * "켜진 지표 0개"), 우리가 화면에 있는 줄을 다시 세어 고쳐 적습니다.
 *
 * -- 2026-09-02 (6단계) 에 늘어난 것 ----------------------------------
 * 설정 창(js/chart-indicator-settings.js)이 쓸 것만 틀에 더했습니다.
 *   값 종류(Source)   SOURCES 한 곳. 종가 · 시가 · 고가 · 저가 · HL2 · HLC3 · OHLC4
 *                     정의는 bs.src / bar.src 를 읽습니다(종가면 배열을 새로 안 만듭니다)
 *   앞뒤로 밀기(Offset)  봉 개수만큼 좌우로. 봉 끝을 넘으면 마지막 간격으로 늘려 잡습니다
 *   updateInstance()  인스턴스 ★하나만★ 다시 계산. 값 다듬기(범위 · 색 · 굵기)는 여기만
 *   createInstance()  "지표 추가" - 만들고 저장하고 화면까지
 *   resetInstance()   트레이딩뷰 Defaults 자리
 *   inputsOf()        설정 창이 무엇을 그릴지. 정의가 들고 있습니다
 * 설정 창 쪽 파일에는 기간 · 색 · 범위 같은 값이 하나도 없습니다(두 벌 금지).
 * 저장 키는 그대로 btc_sim_v2_chart-indicator-kit 이고 형식도 v1 그대로라
 * 이미 저장된 인스턴스는 그대로 열립니다.
 *
 * -- 2026-09-02 (7단계) 에 늘어난 것 - ★기준선★ ----------------------
 * CCI 의 ±100, StochRSI 의 20 · 80 처럼 "값이 아니라 배경" 인 가로선입니다.
 *   guides   정의가 [{ price, style }] 로 적습니다. 색 · 굵기는 못 고릅니다
 *            (GUIDE_COLOR 한 곳). js/chart-oscillators.js:640 addGuide() 와
 *            같은 모양입니다 - #1D273B · 굵기 1 · 점선 · 축 라벨 없음
 *   ⭐ 같이 고친 것 - 정의에 모르는 칸이 오면 ★조용히 버리지 않고 알립니다.★
 *      그전에는 guides 를 적어도 define() 이 true 를 돌려주고 화면엔 아무것도
 *      안 그렸습니다. 오류 0건 · 화면 멀쩡 · 내용만 없음(조용한 고장).
 *   ⚠️ 끌 때 기준선을 ★시리즈보다 먼저★ 직접 지웁니다. removeSeries 만 해도
 *      결국 사라지지만 ★다음 번 다시 그릴 때★ 라, 그때까지 화면에 남습니다
 *      (실측 - 아래 addGuides 주석). 확인용 - getGuideCountForTest()
 *
 * -- 2026-09-02 (8단계) 에 늘어난 것 - 지표 3개 -----------------------
 *   ATR       기간 14 · RMA(와일더) · 기준선 없음 · 갈색  (트레이딩뷰 기준)
 *   StochRSI  14·14·3·3 · 기준선 20 · 80 · 남색+분홍 (바이낸스 = 트레이딩뷰)
 *   CCI       기간 20 · hlc3 · 기준선 ±100 과 0 · 보라   (트레이딩뷰 기준)
 * ★기본 인스턴스는 안 늘렸습니다★ - "지표 추가" 목록에만 나옵니다.
 * ⚠️ CCI 의 step 만 O(1) 이 아니라 O(p) 입니다. 계산식 때문이고, 왜 그래도
 *    괜찮은지는 아래 CCI 주석에 실측값과 함께 적어 두었습니다.
 *
 * -- 2026-09-02 (9단계) 에 늘어난 것 - ★색 8개★ + 지표 3개 -----------
 *   색      LINE_COLORS 가 12 -> ★20★ 색. 대표 승인(2026-09-02 "ㅇㅋ") 건입니다.
 *           확정 팔레트 9색은 그대로고 지표선 목록만 늘렸습니다. 고른 방법과
 *           실측 거리(ΔE76 · ΔE2000 · 명암비)는 LINE_COLORS 바로 위에 있습니다.
 *   점(dots) 새 그리기 방식. SAR 이 선이 아니라 점이라 길을 냈습니다.
 *           LineSeries + lineVisible:false + pointMarkersVisible:true.
 *   소수    설정값에 0.02 같은 소수를 넣을 수 있게 했습니다(inputs type:"float").
 *           그전에는 parseInt 가 0.02 를 0 으로 읽었습니다.
 *   OBV     누적거래량 · 아래 칸 · 기준선 없음 · 카키   (트레이딩뷰 ta.obv)
 *   SAR     0.02 · 0.02 · 0.2 · ★주 차트에 점★ · 연남색 (트레이딩뷰 ta.sar)
 *   VWAP    hlc3 · 하루(UTC) 기준으로 다시 셈 · 주 차트 · 진하늘 (트레이딩뷰 ta.vwap)
 *   ⚠️ OBV · VWAP 은 ★거래량이 진짜 오는지 먼저 재고★ 넣었습니다 -
 *      봉 1000개 중 0 인 봉 0개. 실측값은 volumeAllZero() 위 주석에 있습니다.
 * ★기본 인스턴스는 이번에도 안 늘렸습니다★ - "지표 추가" 목록에만 나옵니다.
 *
 * -- 되돌리기 ---------------------------------------------------------
 *   1) index.html 의 <script src="js/chart-indicator-kit.js"></script> 한 줄 삭제
 *   2) js/chart-indicator-kit.js 파일 삭제
 *   3) (테스트가 생겼다면) package.json 과 tests/_order.txt 의 해당 토막 삭제
 * 이 파일은 다른 파일을 하나도 고치지 않습니다. 지우면 원래 화면 그대로입니다.
 * (회원 브라우저에 남는 기록은 btc_sim_v2_chart-indicator-kit 키라
 *  그냥 남아 있어도 아무 동작도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorKit = (function () {
  "use strict";

  /* =====================================================================
   * 지표선 색 목록 - 여기 한 곳에만 적습니다. 두 벌 금지.
   *
   * 확정 팔레트 9색은 그대로입니다. 이건 "지표선 전용 색 목록" 하나를
   * 새로 만든 것이고, 2026-09-02 대표 승인 사항입니다.
   *
   * 고른 방법 - 눈대중이 아니라 계산해서 골랐습니다.
   *   조건 1  배경 #0A0F1C 과의 명암비 4.5 이상        (실측 최소 4.52)
   *   조건 2  색끼리 CIE Lab 거리 22 이상              (실측 최소 29.6)
   *   조건 3  상승 #26C281 · 하락 #F0506E 와 45 이상   (실측 최소 46.4)
   *   조건 4  초록 구간(색상 100~185도)과 빨강 구간(330~18도)은 아예 제외
   *           - 거리 숫자만 보면 순수 초록 · 빨강도 통과합니다. 그런데 그건
   *             회원이 손익 색으로 읽습니다. 그래서 색상환에서 막았습니다.
   *   조건 5  앞의 셋은 지금 쓰는 값 그대로 - 대표가 매일 보시던
   *           MA7 · MA25 · MA99 색이 갑자기 바뀌면 안 됩니다.
   *
   * 2026-08-31 에 시세선과 MA7 이 둘 다 금색이라 회원 화면의 62.7% 에서
   * 한 줄로 보였던 일이 있습니다. 그래서 색만이 아니라 선 모양(solid /
   * dashed / dotted)도 같이 골라 쓸 수 있게 했습니다.
   * ===================================================================== */
  var LINE_COLORS = [
    { key: "gold", hex: "#F0B429", name: "금색" },   /* 지금 MA(7) 색 */
    { key: "white", hex: "#E7ECF5", name: "흰색" },  /* 지금 MA(25) 색 */
    { key: "gray", hex: "#838DA4", name: "회색" },   /* 지금 MA(99) 색 */
    { key: "orange", hex: "#FF8F3C", name: "주황" },
    { key: "brown", hex: "#B99264", name: "갈색" },
    { key: "cream", hex: "#E1ED97", name: "연노랑" },
    { key: "sky", hex: "#49C9E9", name: "하늘" },
    { key: "blue", hex: "#499EE9", name: "파랑" },
    { key: "navy", hex: "#4974E9", name: "남색" },
    { key: "purple", hex: "#BA6EED", name: "보라" },
    { key: "magenta", hex: "#E637E6", name: "자홍" },
    { key: "pink", hex: "#F292DE", name: "분홍" },

    /* ↓ 2026-09-02 (9단계) 에 늘린 8색 - 위 12색이 꽉 찼습니다(기존 MA 3 + 정의 9).
       ⭐ 대표 승인은 2026-09-02 "차트 지표에 한해 색을 새로 만들어도 될까요" -> "ㅇㅋ".
          확정 팔레트 9색은 ★그대로★ 입니다. 늘어난 것은 이 지표선 목록뿐입니다.

       -- 어떻게 골랐나 (눈대중 아님 · 전수 계산) ---------------------------
       17,000여 개 후보(HSL 격자)를 만들어 아래를 모두 통과한 것만 남기고,
       "이미 있는 색과 가장 가까운 거리" 가 ★제일 먼 것부터★ 하나씩 여덟 번
       골랐습니다(maximin). 한 개 고를 때마다 그것까지 포함해 다시 쟀습니다.

         조건 1  배경 #0A0F1C 과 명암비 5.0 이상   (새 8색 실측 최소 5.05)
                 ⚠️ 기존 12색의 바닥은 4.52(#4974E9)였습니다. 새 색은 더 올렸습니다
         조건 2  모든 색끼리 CIE Lab 거리(ΔE76) 22 이상   (20색 실측 최소 22.01)
         조건 3  상승 #26C281 · 하락 #F0506E 와 ΔE76 46.4 이상
                 (46.4 는 기존 12색이 이미 지키던 바닥값 - #E1ED97 의 상승 거리)
         조건 4  ★색상환에서 초록 · 빨강 쪽으로 더 물러났습니다★
                 기존 규칙은 초록 100~185도 · 빨강 330~18도 제외였는데,
                 새 색은 ★24~62도 와 195~320도★ 안에서만 골랐습니다.
                 이유 - 계산만 믿고 뽑으면 hue 98도(형광 연두) · 18도(주홍) 가
                 통과합니다. 숫자로는 멀지만 ★회원 눈에는 초록 · 빨강★ 입니다

       -- 지금 제일 가까운 쌍이 어디인가 (ΔE2000 · 사람 눈에 가까운 자) ------
       ⚠️ ΔE76 만 보면 안 됩니다. 아래 두 값이 그 이유입니다.
            #BA6EED 보라 / #E637E6 자홍   ΔE76 30.76  ΔE2000 ★9.71★
            #F0B429 금색 / #FF8F3C 주황   ΔE76 29.55  ΔE2000  18.27
       ΔE76 은 보라/자홍이 더 멀다고 하는데 눈에는 그쪽이 두 배 가깝습니다.
       ★다음에 터질 자리는 보라(#BA6EED)와 자홍(#E637E6) 입니다.★ 지금은 CCI(보라)와
       KDJ 의 J(자홍)가 쓰는데 둘 다 아래 칸이라 한 칸에 같이 놓이진 않습니다.
       새로 넣은 8색은 ★그보다 멀게★ 잡았습니다 - 새 색이 낀 쌍의 최소 ΔE2000 은
       11.69(#BB81AC / #F292DE) 입니다.

       -- 20색 전수 실측 (2026-09-02 · 아래 tests 절 1 이 매번 다시 잽니다) --
            최소 ΔE76    22.01  (#4974E9 남색 / #9197F3 연남색)
            최소 ΔE2000   9.71  (#BA6EED / #E637E6 - ★기존 쌍 그대로★. 새 색이 아닙니다)
            최소 명암비    4.52  (#4974E9 - 기존 색. 새 8색의 최소는 5.05)
       ★순서를 뒤에 붙였습니다★ - suggestColor() 가 앞에서부터 고르기 때문에,
       앞에 끼워 넣으면 이미 쓰시던 분들의 자동 색이 바뀝니다. */
    { key: "yellow", hex: "#F2DF0D", name: "노랑" },
    { key: "khaki", hex: "#9FA329", name: "카키" },
    { key: "copper", hex: "#B87414", name: "구리" },
    { key: "sand", hex: "#F5D7B8", name: "모래" },
    { key: "deepsky", hex: "#258EB1", name: "진하늘" },
    { key: "periwinkle", hex: "#9197F3", name: "연남색" },
    { key: "lavender", hex: "#C1BAF3", name: "라벤더" },
    { key: "mauve", hex: "#BB81AC", name: "연자주" }
  ];

  /* 기준선(guide) 색 - 여기 한 곳에만. 값이 아니라 배경이라 팔레트 테두리색입니다.
     js/chart-oscillators.js 의 RSI 30/70 · MACD 0선이 쓰는 값과 같습니다
     (저쪽 COLORS.rsiGuide · COLORS.zero 도 #1D273B). 회원이 이미 보던 굵기 ·
     점선 그대로라 새 지표를 얹어도 화면이 낯설지 않습니다. */
  var GUIDE_COLOR = "#1D273B";
  var GUIDE_STYLE = "dashed";   /* 저쪽 addGuide() 가 LineStyle.Dashed 를 씁니다 */

  function colorHexes() {
    return LINE_COLORS.map(function (c) {
      return c.hex;
    });
  }

  var ALLOWED_STYLES = ["solid", "dashed", "dotted"];
  /* ⚠️ dots 는 2026-09-02 (9단계) 에 늘렸습니다 - SAR 때문입니다.
     트레이딩뷰 ta.sar 예시가 plot.style_cross 로 ★점★ 을 찍습니다(선이 아닙니다).
     lightweight-charts 5.2.0 에는 점 시리즈가 따로 없어서, LineSeries 의
     lineVisible:false + pointMarkersVisible:true 로 냅니다(아래 addSeriesFor).
     라이브러리 원본에서 확인한 것 - dist 안에
        n.pointMarkersVisible ? n.pointMarkersRadius || n.lineWidth/2+2 : void 0
     즉 반지름을 안 주면 굵기에서 만들어 씁니다. 우리는 직접 줍니다. */
  var ALLOWED_KINDS = ["line", "hist", "dots"];
  var ALLOWED_PANES = ["main", "sub"];

  var ALLOWED_WIDTHS = [1, 2, 3, 4];   /* 트레이딩뷰 Thickness 도 네 칸입니다 */
  var MAX_OFFSET = 500;                /* 앞뒤로 밀기 한계 */

  /* ---------------------------------------------------------------------
   * 값 종류(Source) - 트레이딩뷰 Inputs 의 Source 와 같은 목록입니다.
   * 실측(2026-09-02 · 트레이딩뷰 EMA 설정 창) - Close / Open / High / Low /
   * HL2 / HLC3 / OHLC4. 이름도 계산도 여기 한 곳에만 적습니다.
   * ------------------------------------------------------------------- */
  var SOURCES = [
    { key: "close", name: "종가", pick: function (b, i) { return b.close[i]; } },
    { key: "open", name: "시가", pick: function (b, i) { return b.open[i]; } },
    { key: "high", name: "고가", pick: function (b, i) { return b.high[i]; } },
    { key: "low", name: "저가", pick: function (b, i) { return b.low[i]; } },
    { key: "hl2", name: "(고+저)/2", pick: function (b, i) { return (b.high[i] + b.low[i]) / 2; } },
    { key: "hlc3", name: "(고+저+종)/3", pick: function (b, i) { return (b.high[i] + b.low[i] + b.close[i]) / 3; } },
    { key: "ohlc4", name: "(시+고+저+종)/4", pick: function (b, i) { return (b.open[i] + b.high[i] + b.low[i] + b.close[i]) / 4; } }
  ];

  function sourceOf(key) {
    for (var si = 0; si < SOURCES.length; si++) if (SOURCES[si].key === key) return SOURCES[si];
    return SOURCES[0];
  }

  function hasSource(key) {
    for (var si = 0; si < SOURCES.length; si++) if (SOURCES[si].key === key) return true;
    return false;
  }

  var DEFAULT_WIDTH = 1;   /* 바이낸스 · 트레이딩뷰 기본 굵기와 같은 1px */
  var PANE_RATIO = 0.32;   /* 아래 별도 칸 높이 비율 - 3단계와 같은 값 */

  /* ---------------------------------------------------------------------
   * 이미 남이 쓰고 있는 이름 - 여기 한 곳에만 적습니다.
   *
   * 2026-09-02 조사팀 지적. 아래 일곱은 js/chart-indicators.js 와
   * js/chart-oscillators.js 가 쓰는 이름입니다. 우리 인스턴스가 같은 이름을
   * 가지면, fx 목록에 끼어들려고 감싸 둔 isOn/toggle 다리가
   *     insts[key] 가 있다  ->  우리가 답한다
   * 로 갈라지기 때문에 ★MA(7) 스위치가 EMA 를 켜는★ 일이 납니다.
   * 화면은 멀쩡하고 오류도 안 나는 조용한 고장입니다.
   *
   * 지금 자동으로 붙이는 이름은 ema-1 · ema-2 라 부딪히지 않습니다. 그래도
   * 막는 이유는 두 가지입니다.
   *   1) 저장소는 ★회원 브라우저★ 에 있습니다. 손으로 고칠 수 있습니다
   *   2) 나중에 이름을 정하게 하는 화면이 생기면 그때 바로 열립니다
   * ------------------------------------------------------------------- */
  var RESERVED_IDS = ["ma7", "ma25", "ma99", "bb", "vol", "rsi", "macd"];

  function isReservedId(id) {
    return RESERVED_IDS.indexOf(id) >= 0;
  }

  /* ---------------------------------------------------------------------
   * 정의가 쓸 수 있는 칸 이름 - 여기 없는 이름이 오면 알립니다.
   *
   * ⭐ 2026-09-02 에 실제로 당한 것 - 정의에 guides 를 적어 넣었더니
   *    define() 이 ★true 를 돌려주고★ 화면엔 기준선이 하나도 안 그려졌습니다.
   *    아래 defs[def.id] = {...} 가 아는 칸만 옮겨 담는데, 모르는 칸은
   *    말없이 버렸기 때문입니다. 오류 0건 · 경고 0건 · 화면 멀쩡 · 내용만 없음.
   *    이 프로젝트가 "조용한 고장" 이라 부르는 모양 그대로입니다.
   *    다음 사람이 bands: 나 guide: 처럼 오타를 내도 똑같은 일이 납니다.
   *
   * ⚠️ 거부까지는 하지 않습니다. 칸 이름 하나 틀렸다고 지표가 통째로 안 뜨는
   *    쪽이 더 나쁩니다. 대신 ★반드시 콘솔에 남깁니다.★
   * ------------------------------------------------------------------- */
  var DEF_FIELDS = [
    "id", "name", "note", "pane", "params", "inputs", "outputs", "guides",
    "nameOf", "seed", "step", "useSource", "srcDefault", "useOffset"
  ];

  var STORAGE_KEY = "chart-indicator-kit";
  var STORE_VERSION = 1;

  /* =====================================================================
   * 1. 정의 등록소 - 계산식은 여기에 한 번만
   * ===================================================================== */
  var defs = {};
  var defOrder = [];

  function isFn(v) {
    return typeof v === "function";
  }

  function copy(o) {
    var out = {};
    for (var k in o) out[k] = o[k];
    return out;
  }

  /**
   * 지표 정의 하나를 등록합니다. (계산식. 화면에 얹는 것은 addInstance)
   *
   *   id       "ema" 처럼 겹치지 않는 이름
   *   name     "EMA"            인스턴스 이름은 nameOf() 가 만듭니다
   *   note     "지수이동평균"    한 줄 설명
   *   pane     "main" | "sub"    기본으로 어디에 그릴지 (인스턴스가 덮어씀)
   *   params   { p: 9 }          설정값 기본치
   *   outputs  [{ key, kind:"line"|"hist", color, style }]
   *   guides   [{ price, style }]       기준선. CCI 의 ±100, StochRSI 의 20·80
   *            값이 아니라 배경입니다. 색 · 굵기는 고르지 못합니다 -
   *            GUIDE_COLOR 한 곳으로 고정입니다(두 벌 금지).
   *   nameOf(params) -> "EMA(9)"        (없으면 name 그대로)
   *   seed(bars, params, capture) -> { <outKey>: [{time,value}] }
   *            켤 때 한 번. 전체를 계산합니다.
   *            capture.state 에 "마지막으로 닫힌 봉까지의 상태" 를 넣어 줍니다.
   *   step(state, bar, params) -> { values: {<outKey>:숫자}, state: 다음상태 }
   *            틱마다. 마지막 봉 하나만. 반드시 O(1) 이어야 합니다.
   *
   * 등록되면 true, 거부되면 false (이유는 콘솔에 적습니다)
   */
  function define(def) {
    function no(why) {
      console.warn("[chart-indicator-kit] 정의 등록을 거부했습니다 - " + why, def);
      return false;
    }

    if (!def || typeof def !== "object") return no("정의가 객체가 아닙니다");
    if (!def.id || typeof def.id !== "string") return no("id 가 없습니다");
    if (defs[def.id]) return no("id 가 이미 있습니다: " + def.id);
    if (!def.name || typeof def.name !== "string") return no("name 이 없습니다: " + def.id);
    if (ALLOWED_PANES.indexOf(def.pane) < 0) return no("pane 은 main 또는 sub 여야 합니다: " + def.id);

    /* 모르는 칸은 조용히 버리지 않고 알립니다 (위 DEF_FIELDS 주석 참조).
       ★거부보다 먼저★ 돌립니다 - 거부 사유 경고가 콘솔 맨 끝에 오게. */
    for (var f in def) {
      if (DEF_FIELDS.indexOf(f) < 0) {
        console.warn(
          "[chart-indicator-kit] 정의에 모르는 칸이 있어 무시합니다 - " + def.id + "." + f +
          " (쓸 수 있는 칸 - " + DEF_FIELDS.join(" · ") + ")"
        );
      }
    }

    /* seed 와 step 은 둘 다 필수입니다.
       step 이 없으면 틱마다 전체를 다시 계산하게 되어 화면이 버벅입니다. */
    if (!isFn(def.seed)) return no("seed 가 없습니다(켤 때 전체 계산): " + def.id);
    if (!isFn(def.step)) return no("step 이 없습니다(틱마다 마지막 봉만 O(1) 갱신): " + def.id);

    if (!def.outputs || !def.outputs.length) return no("outputs 가 비었습니다: " + def.id);

    var hexes = colorHexes();
    for (var i = 0; i < def.outputs.length; i++) {
      var o = def.outputs[i];
      if (!o || !o.key) return no("outputs[" + i + "].key 가 없습니다: " + def.id);
      if (ALLOWED_KINDS.indexOf(o.kind || "line") < 0) return no("kind 는 line 또는 hist: " + def.id);
      if (hexes.indexOf(o.color) < 0) {
        return no(
          "지표선 색 목록에 없는 색입니다(" + o.color + "). 색을 늘리려면 LINE_COLORS 에 " +
          "추가하고 배경 대비 · 색끼리 거리를 다시 재야 합니다: " + def.id
        );
      }
      if (o.style && ALLOWED_STYLES.indexOf(o.style) < 0) return no("style 은 solid/dashed/dotted: " + def.id);
    }

    /* 기준선 - 값이 아니라 배경입니다. 색 · 굵기는 정의가 못 고릅니다
       (GUIDE_COLOR 한 곳). 고르게 하면 지표마다 다른 회색이 생깁니다. */
    var guides = [];
    var gsrc = def.guides || [];
    for (var gi = 0; gi < gsrc.length; gi++) {
      var g = gsrc[gi];
      if (!g || typeof g.price !== "number" || !isFinite(g.price)) {
        return no("guides[" + gi + "].price 가 숫자가 아닙니다: " + def.id);
      }
      if (g.style && ALLOWED_STYLES.indexOf(g.style) < 0) {
        return no("guides[" + gi + "].style 은 solid/dashed/dotted: " + def.id);
      }
      guides.push({ price: g.price, style: g.style || GUIDE_STYLE });
    }

    /* 설정 창이 무엇을 보여줄지도 정의가 들고 있습니다. 화면 쪽 파일에
       "EMA 는 기간" 을 또 적으면 같은 값이 두 벌이 됩니다. */
    var params0 = copy(def.params || {});
    var inputs = [];
    var bad = null;
    (def.inputs || []).forEach(function (sp) {
      if (!sp || !sp.key) { bad = "inputs 에 key 가 없습니다"; return; }
      if (!(sp.key in params0)) { bad = "inputs 의 key 가 params 에 없습니다: " + sp.key; return; }
      /* ⚠️ 2026-09-02 (9단계) 에 소수(float)를 늘렸습니다 - SAR 의 0.02 때문입니다.
         그전에는 정수만 받아서 0.02 를 적으면 parseInt 가 0 으로 읽고 최솟값으로
         끌어올렸습니다(회원은 0.02 를 적었는데 다른 값이 되는 조용한 고장).
         ⚠️ 설정 창(js/chart-indicator-settings.js)은 숫자칸 step 을 "1" 로 박아
            두었습니다. 그 파일은 이번 작업에서 손대지 않기로 한 파일이라,
            ★화살표 버튼은 1씩 뜁니다.★ 손으로 0.02 를 적는 것은 됩니다(범위를
            벗어나면 아래 cleanParams 가 잘라 냅니다). 화살표까지 맞추려면
            저쪽 step 한 줄을 고쳐야 합니다 - PM 판단 사항으로 남깁니다. */
      var sptype = sp.type === "float" ? "float" : "int";
      inputs.push({
        key: sp.key,
        label: sp.label || sp.key,
        type: sptype,
        min: typeof sp.min === "number" ? sp.min : (sptype === "float" ? 0 : 1),
        max: typeof sp.max === "number" ? sp.max : 5000
      });
    });
    if (bad) return no(bad + " : " + def.id);

    if (def.useSource) {
      params0.src = hasSource(def.srcDefault) ? def.srcDefault : "close";
      inputs.push({ key: "src", label: "값 종류", type: "select" });
    }
    if (def.useOffset) {
      params0.off = 0;
      inputs.push({ key: "off", label: "앞뒤로 밀기", type: "int", min: -MAX_OFFSET, max: MAX_OFFSET });
    }

    defs[def.id] = {
      id: def.id,
      name: def.name,
      note: def.note || "",
      pane: def.pane,
      params: params0,
      inputs: inputs,
      outputs: def.outputs,
      guides: guides,
      nameOf: isFn(def.nameOf) ? def.nameOf : null,
      seed: def.seed,
      step: def.step
    };
    defOrder.push(def.id);
    return true;
  }

  /** 정의가 들고 있는 설정 항목 목록. 설정 창은 이것만 보고 그립니다. */
  function inputsOf(defId) {
    var d = defs[defId];
    if (!d) return [];
    return d.inputs.map(function (sp) {
      var r = { key: sp.key, label: sp.label, type: sp.type };
      /* ⚠️ "int 면 범위, 아니면 목록" 이었는데 float 가 생기면서 뒤집었습니다.
         그대로 뒀으면 소수칸이 값 종류 고르는 목록으로 그려졌을 것입니다. */
      if (sp.type === "select") {
        r.options = SOURCES.map(function (o) {
          return { key: o.key, name: o.name };
        });
      } else {
        r.min = sp.min;
        r.max = sp.max;
      }
      return r;
    });
  }

  /** 회원이 적어 넣은 값을 정의가 정한 범위 안으로 다듬습니다(틀에서 한 번만). */
  function cleanParams(defId, raw) {
    var d = defs[defId];
    var out = copy(d ? d.params : {});
    if (!d || !raw) return out;
    d.inputs.forEach(function (sp) {
      var v = raw[sp.key];
      if (v === undefined || v === null || v === "") return;
      if (sp.type === "select") {
        if (hasSource(v)) out[sp.key] = v;
        return;
      }
      var n = sp.type === "float" ? parseFloat(v) : parseInt(v, 10);
      if (!isFinite(n)) return;
      if (n < sp.min) n = sp.min;
      if (n > sp.max) n = sp.max;
      out[sp.key] = n;
    });
    return out;
  }

  function listDefs() {
    return defOrder.map(function (id) {
      var d = defs[id];
      return {
        id: d.id,
        name: d.name,
        note: d.note,
        pane: d.pane,
        params: copy(d.params),
        inputs: inputsOf(d.id),
        guides: d.guides.map(function (g) {
          return { price: g.price, style: g.style };
        })
      };
    });
  }

  /* =====================================================================
   * 2. 인스턴스 - "그 정의를 실제로 얹은 것 하나"
   *    기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다.
   * ===================================================================== */
  var insts = {};      /* instId -> 인스턴스 */
  var instOrder = [];
  var instSeq = 0;

  function nameOfInst(inst) {
    var d = defs[inst.def];
    if (!d) return inst.def;
    if (d.nameOf) {
      try {
        return d.nameOf(inst.params);
      } catch (e) {
        /* 이름을 못 만들면 정의 이름 그대로 */
      }
    }
    return d.name;
  }

  /**
   * 정의를 화면에 하나 얹습니다.
   *   defId  "ema"
   *   opts   { id, params:{p:9}, colors:{ema:"#49C9E9"}, style, width, pane, on }
   * 돌려주는 값 - 만들어진 인스턴스 id (실패하면 null)
   */
  function addInstance(defId, opts) {
    var d = defs[defId];
    if (!d) {
      console.warn("[chart-indicator-kit] 그런 정의가 없습니다: " + defId);
      return null;
    }
    opts = opts || {};

    var id = opts.id;
    if (id !== undefined && id !== null && (typeof id !== "string" || !id)) {
      console.warn("[chart-indicator-kit] 인스턴스 이름이 글자가 아니라 거부했습니다:", id);
      return null;
    }
    if (isReservedId(id)) {
      console.warn(
        "[chart-indicator-kit] 이미 다른 지표가 쓰는 이름이라 거부했습니다: " + id +
        " (못 쓰는 이름 - " + RESERVED_IDS.join(" · ") + ")"
      );
      return null;
    }
    if (!id) {
      /* 저장된 인스턴스가 "ema-1" 을 이미 쓰고 있을 수 있습니다.
         빈 번호가 나올 때까지 올립니다(다시 켜도 이름이 안 겹치게). */
      do {
        id = defId + "-" + ++instSeq;
      } while (insts[id] || isReservedId(id));
    }
    if (insts[id]) {
      console.warn("[chart-indicator-kit] 인스턴스 id 가 이미 있습니다: " + id);
      return null;
    }

    var params = cleanParams(defId, opts.params);

    /* 색 - 정의의 기본색에서 시작하고, 인스턴스가 골랐으면 그걸 씁니다.
       목록 밖의 색은 조용히 넘어가지 않고 기본색으로 되돌리며 알립니다. */
    var hexes = colorHexes();
    var colors = {};
    d.outputs.forEach(function (o) {
      var want = opts.colors && opts.colors[o.key];
      if (want && hexes.indexOf(want) < 0) {
        console.warn("[chart-indicator-kit] 지표선 색 목록에 없는 색이라 기본색을 씁니다: " + want);
        want = null;
      }
      colors[o.key] = want || o.color;
    });

    var style = ALLOWED_STYLES.indexOf(opts.style) >= 0 ? opts.style : null;
    var pane = ALLOWED_PANES.indexOf(opts.pane) >= 0 ? opts.pane : d.pane;

    insts[id] = {
      id: id,
      def: defId,
      params: params,
      colors: colors,
      style: style,          /* null 이면 정의의 outputs[].style 을 씁니다 */
      width: ALLOWED_WIDTHS.indexOf(opts.width | 0) >= 0 ? opts.width | 0 : DEFAULT_WIDTH,
      pane: pane,
      on: !!opts.on,
      live: null
    };
    /* 정의의 기본색끼리 겹치는 일은 없지만, opts.colors 로 들어온 색이
       다른 선과 같아질 수 있습니다(회원 경로 · 저장소에서 되살릴 때). */
    fixDupColors(insts[id], opts.colors ? Object.keys(opts.colors) : []);

    instOrder.push(id);
    return id;
  }

  function removeInstance(id) {
    if (!insts[id]) return false;
    turnOff(id);
    delete insts[id];
    var i = instOrder.indexOf(id);
    if (i >= 0) instOrder.splice(i, 1);
    saveState();
    dropButton(id);
    dropMenuRow(id);
    return true;
  }

  function listInstances() {
    return instOrder.map(function (id) {
      var it = insts[id];
      return {
        id: it.id,
        def: it.def,
        name: nameOfInst(it),
        note: defs[it.def] ? defs[it.def].note : "",
        params: copy(it.params),
        colors: copy(it.colors),
        style: it.style,
        width: it.width,
        pane: it.pane,
        on: it.on
      };
    });
  }

  /** 인스턴스의 대표색 - 목록의 점 색으로 씁니다(첫 번째 선). */
  function mainColor(it) {
    var d = defs[it.def];
    if (!d) return LINE_COLORS[0].hex;
    return it.colors[d.outputs[0].key] || d.outputs[0].color;
  }

  /* =====================================================================
   * 3. 봉 창고(BarStore) - 온 세상에 딱 한 벌
   * ===================================================================== */
  var bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
  var barsReady = false;
  var syncMark = { len: -1, first: null };

  function barAt(i) {
    return {
      time: bars.time[i],
      open: bars.open[i],
      high: bars.high[i],
      low: bars.low[i],
      close: bars.close[i],
      volume: bars.volume[i]
    };
  }

  function barCount() {
    return bars.time.length;
  }

  function clearBars() {
    bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
    barsReady = false;
    syncMark.len = -1;
    syncMark.first = null;
  }

  /** 캔들 시리즈에서 통째로 다시 읽어옵니다(켤 때 / 봉 간격 · 종목이 바뀔 때). */
  function syncBars() {
    if (!candleSeries) return false;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return false;
    }
    if (!data || !data.length) {
      clearBars();
      return false;
    }

    var n = data.length;
    var t = new Array(n), o = new Array(n), h = new Array(n);
    var l = new Array(n), c = new Array(n), v = new Array(n);
    var i;
    for (i = 0; i < n; i++) {
      t[i] = data[i].time;
      o[i] = data[i].open;
      h[i] = data[i].high;
      l[i] = data[i].low;
      c[i] = data[i].close;
      v[i] = 0;
    }

    /* 거래량은 별도 시리즈에 있습니다(chart.js 가 그렇게 만들었습니다).
       시각으로 맞춰 넣습니다. 못 읽으면 0 으로 둡니다 - 지금 등록된 EMA 는
       거래량을 안 쓰고, 나중에 쓰는 지표(OBV · MFI · VWAP)를 만들 때
       0 인지 먼저 확인하고 써야 합니다. */
    if (volumeSeries) {
      try {
        var vd = volumeSeries.data();
        if (vd && vd.length) {
          var map = {};
          for (i = 0; i < vd.length; i++) map[vd[i].time] = vd[i].value;
          for (i = 0; i < n; i++) {
            var got = map[t[i]];
            if (typeof got === "number") v[i] = got;
          }
        }
      } catch (e2) {
        /* 거래량을 못 읽으면 0 인 채로 둡니다 */
      }
    }

    bars.time = t;
    bars.open = o;
    bars.high = h;
    bars.low = l;
    bars.close = c;
    bars.volume = v;
    barsReady = true;
    syncMark.len = n;
    syncMark.first = t[0];
    return true;
  }

  /* ---------------------------------------------------------------------
   * 값 종류(Source) - 정의는 bs.src 를 읽습니다. 종가면 배열을 새로 만들지
   * 않고 있는 것을 그대로 넘깁니다(켤 때 한 번, O(n)).
   * ------------------------------------------------------------------- */
  function barsView(params) {
    var key = params && params.src;
    if (!key || key === "close") {
      bars.src = bars.close;
      return bars;
    }
    var s = sourceOf(key);
    var n = bars.close.length;
    var arr = new Array(n);
    for (var i = 0; i < n; i++) arr[i] = s.pick(bars, i);
    return {
      time: bars.time, open: bars.open, high: bars.high, low: bars.low,
      close: bars.close, volume: bars.volume, src: arr
    };
  }

  /** 마지막 봉 하나에 src 를 붙입니다. 종가면 그대로(새로 안 만듭니다). */
  function barWithSrc(bar, key) {
    if (!key || key === "close") {
      bar.src = bar.close;
      return bar;
    }
    var s = sourceOf(key);
    var one = { open: [bar.open], high: [bar.high], low: [bar.low], close: [bar.close] };
    return {
      time: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume, src: s.pick(one, 0)
    };
  }

  /* ---------------------------------------------------------------------
   * 앞뒤로 밀기(Offset) - 트레이딩뷰와 같이 "봉 개수" 만큼 좌우로 밉니다.
   * 봉 끝을 넘어가면 마지막 봉 간격으로 시각을 늘려 잡습니다.
   * ------------------------------------------------------------------- */
  function offOf(params) {
    var o = params && params.off ? params.off | 0 : 0;
    if (!isFinite(o)) return 0;
    if (o > MAX_OFFSET) return MAX_OFFSET;
    if (o < -MAX_OFFSET) return -MAX_OFFSET;
    return o;
  }

  function timeAtIndex(i) {
    var n = bars.time.length;
    if (i < 0 || !n) return null;
    if (i < n) return bars.time[i];
    if (n < 2) return null;
    var gap = bars.time[n - 1] - bars.time[n - 2];
    if (!(gap > 0)) return null;
    return bars.time[n - 1] + gap * (i - n + 1);
  }

  function timeIndexMap() {
    var m = {};
    for (var i = 0; i < bars.time.length; i++) m[bars.time[i]] = i;
    return m;
  }

  /** 켤 때 한 번. off 가 0 이면 원본 배열을 그대로 씁니다(복사 안 함). */
  function shiftPoints(arr, off, map) {
    if (!off || !arr || !arr.length) return arr || [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var at = map[arr[i].time];
      if (at === undefined) continue;
      var t = timeAtIndex(at + off);
      if (t === null) continue;
      out.push({ time: t, value: arr[i].value });
    }
    return out;
  }

  /* =====================================================================
   * 4. 차트 · 시리즈 찾기 - chart.js 를 고치지 않고 공개 API 로만
   * ===================================================================== */
  var chart = null;
  var candleSeries = null;
  var volumeSeries = null;

  function LC() {
    return window.LightweightCharts;
  }

  function ensureChart() {
    if (chart && candleSeries) return true;
    if (!App.ChartFont || !isFn(App.ChartFont.getCharts)) return false;

    var charts = App.ChartFont.getCharts();
    if (!charts || !charts.length) return false;
    chart = charts[0];

    try {
      if (!isFn(chart.panes)) return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (!isFn(panes[i].getSeries)) continue;
        var arr = panes[i].getSeries();
        for (var j = 0; j < arr.length; j++) {
          var ty = arr[j].seriesType && arr[j].seriesType();
          if (ty === "Candlestick" && !candleSeries) candleSeries = arr[j];
          if (ty === "Histogram" && !volumeSeries) {
            try {
              if (arr[j].options().priceScaleId === "") volumeSeries = arr[j];
            } catch (e) {
              volumeSeries = arr[j];
            }
          }
        }
      }
    } catch (e2) {
      console.warn("[chart-indicator-kit] 시리즈를 찾지 못했습니다:", e2);
      return false;
    }
    return !!(chart && candleSeries);
  }

  /* =====================================================================
   * 5. 켜고 끄기 - 인스턴스 하나만 다시 계산합니다 (성능의 핵심)
   * ===================================================================== */
  var perf = { ticks: 0, totalMs: 0, maxMs: 0, seeds: 0, seedMs: 0, lastSeedMs: 0 };

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
  }

  function anyOn() {
    for (var i = 0; i < instOrder.length; i++) if (insts[instOrder[i]].on) return true;
    return false;
  }

  function styleOf(s) {
    var lc = LC();
    if (!lc || !lc.LineStyle) return 0;
    if (s === "dashed") return lc.LineStyle.Dashed;
    if (s === "dotted") return lc.LineStyle.Dotted;
    return lc.LineStyle.Solid;
  }

  /** 점 반지름 - 굵기 1 이면 1.5px(지름 3px). 라이브러리 기본(굵기/2+2 = 2.5)은
   *  캔들 위에서 너무 큽니다. 트레이딩뷰 SAR 도 캔들보다 훨씬 작은 표식입니다. */
  function dotRadius(w) {
    return w / 2 + 1;
  }

  function makePane() {
    var p = chart.addPane();
    try {
      var base = 1;
      var main = chart.panes()[0];
      if (main && isFn(main.getStretchFactor)) {
        var f = main.getStretchFactor();
        if (isFinite(f) && f > 0) base = f;
      }
      if (isFn(p.setStretchFactor)) p.setStretchFactor(base * PANE_RATIO);
    } catch (e) {
      /* 비율을 못 정하면 라이브러리 기본 높이로 둡니다 */
    }
    return p;
  }

  function addSeriesFor(it, out, pane) {
    var lc = LC();
    var kind = out.kind || "line";
    var opts = {
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: it.pane === "sub",
      crosshairMarkerVisible: false,
      color: it.colors[out.key] || out.color
    };
    if (kind === "line") {
      opts.lineWidth = it.width || DEFAULT_WIDTH;
      opts.lineStyle = styleOf(it.style || out.style);
    }
    /* 점(dots) - SAR 처럼 "선이 아니라 점" 인 지표. 선은 끄고 점만 켭니다.
       ⚠️ 굵기 칸이 점 크기가 됩니다(선이 없으니 굵기가 달리 쓸 데가 없습니다).
          선모양(solid/dashed)은 점에는 뜻이 없습니다 - 설정 창에서 고를 수는
          있지만 화면은 안 바뀝니다. */
    if (kind === "dots") {
      opts.lineVisible = false;
      opts.pointMarkersVisible = true;
      opts.lineWidth = it.width || DEFAULT_WIDTH;
      opts.pointMarkersRadius = dotRadius(it.width || DEFAULT_WIDTH);
    }
    var seriesDef = kind === "hist" ? lc.HistogramSeries : lc.LineSeries;

    if (pane && isFn(pane.addSeries)) return pane.addSeries(seriesDef, opts);
    if (pane && isFn(pane.paneIndex)) return chart.addSeries(seriesDef, opts, pane.paneIndex());
    return chart.addSeries(seriesDef, opts);
  }

  /* ---------------------------------------------------------------------
   * 기준선 - CCI 의 ±100, StochRSI 의 20 · 80 처럼 "값이 아니라 배경" 인 선.
   *
   * js/chart-oscillators.js:640 addGuide() 를 그대로 따랐습니다. RSI 30/70 과
   * MACD 0선이 몇 달째 이 모양으로 돌고 있어 회원 눈이 이미 여기 맞춰져 있습니다.
   *     색 #1D273B (GUIDE_COLOR) · 굵기 1 · 점선 · 축 라벨 없음 · 제목 없음
   *
   * ⚠️ 왜 지표선(output)으로 안 그리나 - 2026-09-02 실측.
   *    봉 1006개에 기준선 2줄을 "값이 늘 같은 선" 으로 그리면 점이 ★2,012개★
   *    더 실립니다. createPriceLine 은 ★0개★ 입니다. 게다가 output 은 색 목록
   *    검사에 걸려 #1D273B 을 못 써서 밝은 지표색이 되고, lastValueVisible 때문에
   *    가격축에 100 · -100 라벨까지 붙습니다. 바이낸스도 트레이딩뷰도 안 그럽니다.
   *
   * -- 지운 자리를 ★직접★ 챙깁니다 (2026-09-02 브라우저 실측) -----------
   *    "removeSeries 만 해도 기준선이 같이 사라지나" 를 실제로 재 봤습니다.
   *    lightweight-charts 5.2.0 · 주 차트에 #1D273B 기준선 하나를 그린 뒤
   *    removePriceLine 을 ★안 부르고★ removeSeries 만 했습니다.
   *        그리기 전 0점 -> 그린 뒤 304점 -> removeSeries 직후 ★304점 그대로★
   *        -> 다시 그려진 뒤 0점
   *    지워 주기는 합니다. 다만 ★그 자리에서가 아니라 다음 번 다시 그릴 때★
   *    입니다. 그때까지는 끈 지표의 기준선이 화면에 남습니다. 그래서 여기서
   *    먼저 지웁니다 - 끄는 순간 바로 사라지게. 이미 지워졌다면 try 가
   *    삼킵니다(두 번 지워도 안전).
   *
   *    ⭐ 켰다 껐다 3회 실측 (브라우저 · 봉 1000개 · 기준선 3줄)
   *       createPriceLine 9회 · removePriceLine 9회 · 오류 0건
   *       화면의 #1D273B 점  0 -> 912 -> 0
   *       틀이 센 기준선 3 -> 0 · 칸 2 -> 1
   * ------------------------------------------------------------------- */
  function addGuides(d, target) {
    var out = [];
    if (!target || !d.guides || !d.guides.length) return out;
    for (var i = 0; i < d.guides.length; i++) {
      try {
        out.push(
          target.createPriceLine({
            price: d.guides[i].price,
            color: GUIDE_COLOR,
            lineWidth: 1,
            lineStyle: styleOf(d.guides[i].style),
            axisLabelVisible: false,
            title: ""
          })
        );
      } catch (e) {
        /* 기준선을 못 그려도 지표 자체는 그대로 동작합니다
           (js/chart-oscillators.js 도 같은 방식입니다) */
      }
    }
    return out;
  }

  /** 만든 기준선을 지웁니다. 지운 개수를 돌려줍니다(확인용). */
  function dropGuides(L) {
    if (!L || !L.guides || !L.guides.length) return 0;
    var gone = 0;
    for (var i = 0; i < L.guides.length; i++) {
      try {
        L.guideHost.removePriceLine(L.guides[i]);
        gone++;
      } catch (e) {
        /* 시리즈가 이미 없으면 기준선도 같이 사라진 것입니다 */
      }
    }
    L.guides = [];
    L.guideHost = null;
    return gone;
  }

  /** 인스턴스 하나를 그립니다. 다른 인스턴스는 건드리지 않습니다. */
  function turnOn(id) {
    var it = insts[id];
    if (!it || it.live) return;
    var d = defs[it.def];
    if (!d) return;
    if (!ensureChart()) return;
    if (!barsReady && !syncBars()) return;

    var n = barCount();
    if (!n) return;

    var t0 = now();

    /* 계산 먼저. 그려야 할 것이 없으면 시리즈도 만들지 않습니다. */
    var cap = {};
    var outData;
    try {
      outData = d.seed(barsView(it.params), it.params, cap);
    } catch (e) {
      console.warn("[chart-indicator-kit] seed 가 실패했습니다: " + id, e);
      return;
    }
    if (!outData) return;

    var off = offOf(it.params);
    var map = off ? timeIndexMap() : null;

    var pane = it.pane === "sub" ? makePane() : null;
    var made = {};
    for (var i = 0; i < d.outputs.length; i++) {
      var out = d.outputs[i];
      try {
        made[out.key] = addSeriesFor(it, out, pane);
        made[out.key].setData(shiftPoints(outData[out.key] || [], off, map));
      } catch (e2) {
        console.warn("[chart-indicator-kit] 선을 못 그렸습니다: " + id + "." + out.key, e2);
      }
    }

    /* 기준선은 첫 번째 선에 붙입니다 - 어느 선에 붙든 같은 칸의 같은 눈금이라
       화면은 같습니다. 첫 선을 못 만들었으면(위 catch) 기준선도 건너뜁니다. */
    var host = made[d.outputs[0].key] || null;

    it.live = {
      series: made,
      pane: pane,
      off: off,
      guides: addGuides(d, host),
      guideHost: host,
      commit: cap.state || null,
      commitIdx: cap.state ? n - 2 : -1
    };

    var ms = now() - t0;
    perf.seeds++;
    perf.seedMs += ms;
    perf.lastSeedMs = ms;
  }

  /** 인스턴스 하나를 지웁니다. 선을 없애고 칸도 비면 없앱니다. */
  function turnOff(id) {
    var it = insts[id];
    if (!it || !it.live) return;
    var L = it.live;

    /* ★시리즈보다 먼저★ - 시리즈를 지운 뒤엔 removePriceLine 을 부를
       손잡이가 없습니다. */
    dropGuides(L);

    var k;
    for (k in L.series) {
      try {
        chart.removeSeries(L.series[k]);
      } catch (e) {
        /* 이미 없으면 무시 */
      }
    }
    /* 시리즈가 0개가 되면 라이브러리가 칸을 스스로 없앱니다.
       혹시 남아 있으면 직접 없앱니다(3단계에서 확인한 동작). */
    if (L.pane) {
      try {
        var idx = isFn(L.pane.paneIndex) ? L.pane.paneIndex() : -1;
        if (idx > 0 && isFn(L.pane.getSeries) && L.pane.getSeries().length === 0) {
          if (isFn(chart.removePane)) chart.removePane(idx);
        }
      } catch (e3) {
        /* 무시 */
      }
    }
    it.live = null;
  }

  /** 켜진 것 전부를 다시 그립니다(봉 간격 · 종목이 바뀌었을 때만). */
  function reseedAll() {
    var i;
    for (i = 0; i < instOrder.length; i++) turnOff(instOrder[i]);
    if (!anyOn()) {
      clearBars();
      stopTimer();
      return;
    }
    if (!ensureChart()) return;
    syncBars();
    if (!barsReady) return;
    for (i = 0; i < instOrder.length; i++) {
      if (insts[instOrder[i]].on) turnOn(instOrder[i]);
    }
  }

  /* =====================================================================
   * 6. 실시간 - 마지막 봉 하나만. 켜진 인스턴스만.
   * ===================================================================== */
  function onTick(payload) {
    /* 꺼져 있으면 여기서 끝 - 계산도 하지 않습니다 */
    if (!anyOn()) return;
    if (!payload || !payload.candle) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (!candleSeries) return;
    if (!barsReady && !syncBars()) return;

    var t0 = now();

    var c = payload.candle;
    var n = barCount();
    var lastTime = n ? bars.time[n - 1] : null;
    var newBar = false;

    if (n && c.time === lastTime) {
      bars.open[n - 1] = c.open;
      bars.high[n - 1] = c.high;
      bars.low[n - 1] = c.low;
      bars.close[n - 1] = c.close;
      bars.volume[n - 1] = c.volume;
    } else if (!n || c.time > lastTime) {
      bars.time.push(c.time);
      bars.open.push(c.open);
      bars.high.push(c.high);
      bars.low.push(c.low);
      bars.close.push(c.close);
      bars.volume.push(c.volume);
      newBar = true;
      n = barCount();
      syncMark.len = n;
    } else {
      return; /* 과거 시각이 뒤늦게 온 경우 - 무시 */
    }

    var lastBar = barAt(n - 1);

    for (var i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it.on || !it.live || !it.live.commit) continue;
      var d = defs[it.def];
      if (!d) continue;

      try {
        /* 새 봉이 생겼으면 "직전에 닫힌 봉" 을 확정 상태에 접어 넣습니다.
           확정 상태를 따로 들고 있어야 진행 중인 봉의 값이 확정값을
           오염시키지 않습니다(EMA 는 한 번 오염되면 계속 끌고 갑니다). */
        if (newBar && it.live.commitIdx === n - 3) {
          var closed = barWithSrc(barAt(n - 2), it.params.src);
          var r0 = d.step(it.live.commit, closed, it.params);
          if (r0 && r0.state) {
            it.live.commit = r0.state;
            it.live.commitIdx = n - 2;
          }
        }

        var r = d.step(it.live.commit, barWithSrc(lastBar, it.params.src), it.params);
        if (!r || !r.values) continue;
        /* 밀기가 있으면 그린 자리도 그만큼 옮겨야 합니다(자리가 없으면 건너뜀) */
        var at = it.live.off ? timeAtIndex(n - 1 + it.live.off) : lastBar.time;
        if (at === null) continue;
        for (var k in r.values) {
          if (!it.live.series[k]) continue;
          var v = r.values[k];
          if (typeof v !== "number" || !isFinite(v)) continue;
          it.live.series[k].update({ time: at, value: v });
        }
      } catch (e) {
        /* 한 인스턴스가 실패해도 나머지는 계속 그립니다.
           다음 전체 맞춤에서 정리됩니다. */
      }
    }

    if (t0) {
      var ms = now() - t0;
      perf.ticks++;
      perf.totalMs += ms;
      if (ms > perf.maxMs) perf.maxMs = ms;
    }
  }

  /* =====================================================================
   * 7. 차트 데이터가 통째로 바뀌었는지 감시 (봉 간격 변경 / 과거 스크롤)
   *    chart.js 는 그때 setData() 를 부르는데 알려주는 신호가 없습니다.
   *    켜진 인스턴스가 있을 때만 돕니다. 타이머는 하나뿐입니다.
   * ===================================================================== */
  var timer = null;

  function checkResync() {
    if (!anyOn() || !candleSeries) return;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return;
    }
    if (!data || !data.length) return;
    if (data.length === syncMark.len && data[0].time === syncMark.first) return;
    reseedAll();
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(checkResync, 1500);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function scheduleResync() {
    if (!anyOn()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 40) {
        clearInterval(t);
        return;
      }
      var d = null;
      try {
        d = candleSeries && candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        reseedAll();
      }
    }, 100);
  }

  /* =====================================================================
   * 8. 켜기 / 끄기 / 저장
   * ===================================================================== */
  function setOn(id, on) {
    var it = insts[id];
    if (!it) return;
    on = !!on;
    if (it.on === on) return;
    it.on = on;
    saveState();

    if (on) {
      if (!ensureChart()) return;
      if (!barsReady) syncBars();
      startTimer();
      turnOn(id);
    } else {
      turnOff(id);
      if (!anyOn()) {
        clearBars();
        stopTimer();
      }
    }
    paintButtons();
    paintMenu();
  }

  function toggle(id) {
    if (!insts[id]) return;
    setOn(id, !insts[id].on);
  }

  function isOn(id) {
    return !!(insts[id] && insts[id].on);
  }

  /* ---------------------------------------------------------------------
   * 설정 바꾸기 - 인스턴스 ★하나만★ 다시 계산합니다.
   * 값을 다듬는 곳(범위 · 색 목록 · 굵기)은 여기 한 곳뿐입니다.
   * 화면(설정 창)은 값을 검사하지 않고 그대로 넘깁니다.
   * ------------------------------------------------------------------- */
  function updateInstance(id, patch) {
    var it = insts[id];
    if (!it || !patch) return false;
    var d = defs[it.def];
    if (!d) return false;

    if (patch.params) {
      var merged = copy(it.params);
      for (var pk in patch.params) merged[pk] = patch.params[pk];
      it.params = cleanParams(it.def, merged);
    }
    if (patch.colors) {
      var hexes = colorHexes();
      d.outputs.forEach(function (o) {
        var want = patch.colors[o.key];
        if (want && hexes.indexOf(want) >= 0) it.colors[o.key] = want;
      });
      /* 방금 고른 색이 같은 줄의 다른 선과 겹치면 그 다른 선이 비켜 줍니다 */
      fixDupColors(it, Object.keys(patch.colors));
    }
    if (patch.style && ALLOWED_STYLES.indexOf(patch.style) >= 0) it.style = patch.style;
    if (patch.width && ALLOWED_WIDTHS.indexOf(patch.width | 0) >= 0) it.width = patch.width | 0;

    if (it.on) {
      turnOff(id);
      turnOn(id);
    }
    saveState();
    refreshLabels(id);
    paintButtons();
    paintMenu();
    return true;
  }

  /** 정의의 기본값으로 되돌립니다(트레이딩뷰 Defaults 자리). */
  function resetInstance(id) {
    var it = insts[id];
    var d = it && defs[it.def];
    if (!d) return false;
    it.params = copy(d.params);
    it.style = null;
    it.width = DEFAULT_WIDTH;
    d.outputs.forEach(function (o) {
      it.colors[o.key] = o.color;
    });
    if (it.on) {
      turnOff(id);
      turnOn(id);
    }
    saveState();
    refreshLabels(id);
    paintButtons();
    paintMenu();
    return true;
  }

  /* 기존 7개가 이미 쓰고 있는 색 - MA(7) 금색 · MA(25) 흰색 · MA(99) 회색이고,
     RSI 는 흰색 · MACD 는 금색과 회색입니다(js/chart-oscillators.js).
     새로 얹는 줄에는 이 셋을 ★맨 뒤로 미룹니다.★
     ⚠️ 2026-09-02 실측 - 그 전에는 "지표 추가" 로 얹은 첫 줄이 무조건 금색이라
        MA(7) 을 켜 둔 회원 화면에서 두 선이 한 줄로 보였습니다. 2026-08-31 에
        시세선과 MA7 이 둘 다 금색이던 사고와 같은 종류입니다.
     (LINE_COLORS 의 앞 세 자리는 기존 MA 색을 그대로 두기 위한 것이라
      순서를 못 바꿉니다. 그래서 목록이 아니라 고르는 쪽에서 미룹니다) */
  var LEGACY_HEXES = ["#F0B429", "#E7ECF5", "#838DA4"];

  /** 지금 화면의 모든 선이 쓰고 있는 색 (선이 셋인 지표까지 전부 셉니다) */
  function usedColorMap() {
    var used = {};
    instOrder.forEach(function (iid) {
      var it = insts[iid];
      for (var ck in it.colors) used[it.colors[ck]] = true;
    });
    return used;
  }

  /* ---------------------------------------------------------------------
   * ⭐ 2026-09-02 (9단계) 에 잡은 것 - ★한 줄 안에서 두 선이 같은 색★
   *
   * 회원이 "지표 추가" 로 KDJ 를 얹으면 설정 창이 이 순서로 부릅니다.
   *     suggestColor()  ->  createInstance()  ->  updateInstance(첫 선 색)
   * suggestColor 는 ★아직 만들어지지 않은 그 인스턴스의 나머지 선★ 을 모릅니다.
   * 그래서 K 선에 골라 준 색이 하필 그 지표의 D 선 기본색과 같으면,
   * ★한 칸 안에서 K 와 D 가 같은 색★ 이 됩니다. 오류 0건 · 화면 멀쩡 ·
   * 회원은 선 하나만 보고 판단합니다. 2026-08-31 금색 사고와 같은 종류입니다.
   *
   * 실측(2026-09-02) - 기본 상태에서 회원 경로로 EMA · WMA · KDJ 를 차례로
   * 얹으면 KDJ 의 K 와 D 가 둘 다 #E1ED97 이 됐습니다.
   *
   * ⚠️ 회원이 방금 고른 선(keep)은 ★그대로 둡니다.★ 비켜 주는 쪽은 나머지 선입니다.
   * ⚠️ 색을 다 써버린 경우에도 ★적어도 제 줄 안에서는★ 겹치지 않게 합니다.
   *    (다른 줄과 겹치는 것은 눈으로 구분이 되지만, 한 칸 안 두 선이 같은 색이면
   *     아예 한 선으로 보입니다)
   * ------------------------------------------------------------------- */
  function pickFreeColor(banned) {
    var used = usedColorMap();
    var i, h;
    for (i = 0; i < LINE_COLORS.length; i++) {
      h = LINE_COLORS[i].hex;
      if (!banned[h] && !used[h] && LEGACY_HEXES.indexOf(h) < 0) return h;
    }
    for (i = 0; i < LINE_COLORS.length; i++) {
      h = LINE_COLORS[i].hex;
      if (!banned[h] && !used[h]) return h;
    }
    for (i = 0; i < LINE_COLORS.length; i++) {
      h = LINE_COLORS[i].hex;
      if (!banned[h]) return h;
    }
    return null;
  }

  /** 한 인스턴스 안에서 색이 겹치면 비켜 줍니다. keep 에 적힌 선은 안 건드립니다. */
  function fixDupColors(it, keep) {
    var d = defs[it.def];
    if (!d || d.outputs.length < 2) return false;

    var keepMap = {};
    (keep || []).forEach(function (k) {
      keepMap[k] = true;
    });

    /* 회원이 방금 고른 선부터 자리를 잡습니다 */
    var keys = d.outputs.map(function (o) {
      return o.key;
    });
    keys.sort(function (a, b) {
      return (keepMap[b] ? 1 : 0) - (keepMap[a] ? 1 : 0);
    });

    var seen = {};
    var changed = false;
    keys.forEach(function (k) {
      var c = it.colors[k];
      if (!seen[c]) {
        seen[c] = true;
        return;
      }
      if (keepMap[k]) return; /* 회원이 고른 선은 안 옮깁니다 */
      var next = pickFreeColor(seen);
      if (!next || next === c) return;
      it.colors[k] = next;
      seen[next] = true;
      changed = true;
    });
    return changed;
  }

  /** 아직 아무도 안 쓴 색을 하나 고릅니다(같은 색 두 줄을 막습니다). */
  function suggestColor() {
    /* 대표색만이 아니라 ★모든 선의 색★ 을 셉니다 - KDJ 처럼 선이 셋인 지표가
       생기면서, 새로 얹은 줄의 첫 선이 다른 줄의 둘째·셋째 선과 같은 색이
       될 수 있게 됐습니다. */
    var used = usedColorMap();
    var i;
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!used[LINE_COLORS[i].hex] && LEGACY_HEXES.indexOf(LINE_COLORS[i].hex) < 0) {
        return LINE_COLORS[i].hex;
      }
    }
    /* 나머지를 다 썼으면 그때 기존 7개와 같은 색도 씁니다 */
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!used[LINE_COLORS[i].hex]) return LINE_COLORS[i].hex;
    }
    return LINE_COLORS[instOrder.length % LINE_COLORS.length].hex;
  }

  /**
   * 회원이 "지표 추가" 를 눌렀을 때. 인스턴스를 만들고 저장하고 화면까지
   * 붙입니다. (addInstance 는 틀에 등록만 하고 화면은 안 건드립니다)
   */
  function createInstance(defId, opts) {
    opts = copy(opts || {});
    var want = !!opts.on;
    opts.on = false;
    var id = addInstance(defId, opts);
    if (!id) return null;
    saveState();
    buildButtons();
    injectMenuRows();
    if (want) setOn(id, true);
    paintButtons();
    paintMenu();
    return id;
  }

  /** 기간을 바꾸면 이름도 바뀝니다 - 버튼과 목록 줄의 글자를 다시 씁니다. */
  function refreshLabels(id) {
    var it = insts[id];
    if (!it) return;
    var nm = nameOfInst(it);
    var col = mainColor(it);

    if (barEl) {
      var b = barEl.querySelector('.tl-kit-btn[data-kit="' + id + '"]');
      if (b) {
        b.setAttribute("data-color", col);
        var last = b.lastChild;
        if (last && last.nodeType === 3) last.nodeValue = nm;
      }
    }
    var p = menuPanel();
    if (p) {
      var row = p.querySelector('.tl-fx-row[data-key="' + id + '"]');
      if (row) {
        row.setAttribute("data-color", col);
        var t = row.querySelector(".tl-fx-name");
        if (t) t.textContent = nm;
      }
    }
  }

  function saveState() {
    try {
      if (!App.Storage || !isFn(App.Storage.save)) return;
      App.Storage.save(STORAGE_KEY, {
        v: STORE_VERSION,
        instances: instOrder.map(function (id) {
          var it = insts[id];
          return {
            id: it.id,
            def: it.def,
            params: it.params,
            colors: it.colors,
            style: it.style,
            width: it.width,
            pane: it.pane,
            on: it.on
          };
        })
      });
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작 */
    }
  }

  /** 저장된 것이 있으면 그걸로, 없으면 기본 인스턴스로 시작합니다. */
  function loadState(defaults) {
    var saved = null;
    try {
      if (App.Storage && isFn(App.Storage.load)) saved = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }

    if (saved && saved.v === STORE_VERSION && saved.instances && saved.instances.length) {
      var made = 0;
      saved.instances.forEach(function (s) {
        if (!s || !defs[s.def]) return; /* 정의가 사라졌으면 건너뜁니다 */
        /* 저장소는 회원 브라우저에 있어 손댈 수 있습니다. 이름 검사는
           addInstance 안에서 합니다(검사가 두 곳에 생기지 않게).
           거부되면 그 줄만 버리고 나머지는 그대로 살립니다. */
        if (addInstance(s.def, s)) made++;
      });
      if (made) return;
    }

    (defaults || []).forEach(function (d) {
      addInstance(d.def, d);
    });
  }

  /* =====================================================================
   * 9. 차트 왼쪽 위 작은 버튼 - 2 · 3단계가 만든 막대에 이어 붙입니다
   *    (저쪽 paintButtons() 는 .tl-ind-btn / .tl-osc-btn 만 훑기 때문에
   *     우리 버튼은 클래스를 따로 두어 서로 색을 안 건드립니다.)
   * ===================================================================== */
  var barEl = null;

  function injectStyle() {
    if (document.getElementById("chart-indicator-kit-style")) return;
    var css =
      ".tl-kit-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-kit-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-kit-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      ".tl-kit-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}";
    var st = document.createElement("style");
    st.id = "chart-indicator-kit-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function paintButtons() {
    if (!barEl) return;
    /* 여기도 "달라진 것만" 씁니다 - 위 paintMenu 와 같은 이유입니다 */
    var kids = barEl.querySelectorAll(".tl-kit-btn");
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].getAttribute("data-kit");
      var on = isOn(id);
      var press = on ? "true" : "false";
      if (kids[i].getAttribute("aria-pressed") !== press) kids[i].setAttribute("aria-pressed", press);
      var col = on ? "#E7ECF5" : "#838DA4";
      var bor = on ? "#838DA4" : "#1D273B";
      if (kids[i].style.color !== col) kids[i].style.color = col;
      if (kids[i].style.borderColor !== bor) kids[i].style.borderColor = bor;
      var dot = kids[i].querySelector(".tl-kit-dot");
      var bg = on ? kids[i].getAttribute("data-color") : "#1D273B";
      if (dot && dot.style.background !== bg) dot.style.background = bg;
    }
  }

  function dropButton(id) {
    if (!barEl) return;
    var b = barEl.querySelector('.tl-kit-btn[data-kit="' + id + '"]');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function buildButtons() {
    /* 2단계가 만든 막대에 붙입니다. 없으면(2단계를 지웠으면) 아무것도 안 합니다. */
    var bar = document.querySelector(".chart-panel .tl-ind-bar") || document.querySelector(".tl-ind-bar");
    if (!bar) return false;

    injectStyle();
    barEl = bar;

    instOrder.forEach(function (id) {
      if (bar.querySelector('.tl-kit-btn[data-kit="' + id + '"]')) return;
      var it = insts[id];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-kit-btn";
      btn.setAttribute("data-kit", id);
      btn.setAttribute("data-color", mainColor(it));
      btn.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span");
      dot.className = "tl-kit-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(nameOfInst(it)));
      btn.addEventListener("click", function () {
        toggle(id);
      });
      bar.appendChild(btn);
    });

    paintButtons();
    return true;
  }

  /* =====================================================================
   * 10. fx 목록에 끼어들기 - js/chart-indicator-menu.js 는 안 고칩니다
   * ===================================================================== */
  var wrapped = false;

  /** 목록이 물어보는 isOn/toggle 을 감쌉니다. 우리 인스턴스면 우리가 답합니다. */
  function wrapMenuBridge() {
    if (wrapped) return;
    var IND = App.ChartIndicators;
    if (!IND || !isFn(IND.isOn) || !isFn(IND.toggle)) return;

    var origIsOn = IND.isOn;
    var origToggle = IND.toggle;

    IND.isOn = function (key) {
      if (insts[key]) return isOn(key);
      return origIsOn.apply(this, arguments);
    };
    IND.toggle = function (key) {
      if (insts[key]) return toggle(key);
      return origToggle.apply(this, arguments);
    };
    wrapped = true;
  }

  function menuPanel() {
    return document.getElementById("tl-fx-menu");
  }

  function dropMenuRow(id) {
    var p = menuPanel();
    if (!p) return;
    var r = p.querySelector('.tl-fx-row[data-key="' + id + '"]');
    if (r && r.parentNode) r.parentNode.removeChild(r);
  }

  /** 목록 창이 열렸으면 우리 줄을 이어 붙입니다(이미 있으면 아무것도 안 함). */
  function injectMenuRows() {
    var p = menuPanel();
    if (!p) return;
    var list = p.querySelector(".tl-fx-list");
    if (!list) return;

    for (var i = 0; i < instOrder.length; i++) {
      var id = instOrder[i];
      if (list.querySelector('.tl-fx-row[data-key="' + id + '"]')) continue;
      var it = insts[id];
      var d = defs[it.def];
      if (!d) continue;

      var row = document.createElement("button");
      row.type = "button";
      /* 저쪽 클래스를 그대로 씁니다. 그래야 저쪽 CSS 와 paint() 가 그대로
         적용되고, 우리가 같은 값을 두 번 적지 않습니다.
         (paint() 가 부르는 isOn/toggle 은 위에서 감싸 두었습니다) */
      row.className = "tl-fx-row";
      row.setAttribute("data-who", "ind");
      row.setAttribute("data-key", id);
      row.setAttribute("data-color", mainColor(it));
      row.setAttribute("data-kit", "1");
      row.setAttribute("aria-pressed", isOn(id) ? "true" : "false");

      var dot = document.createElement("span");
      dot.className = "tl-fx-dot";
      if (isOn(id)) dot.style.background = mainColor(it);
      var nm = document.createElement("span");
      nm.className = "tl-fx-name";
      nm.textContent = nameOfInst(it);
      var note = document.createElement("span");
      note.className = "tl-fx-note";
      note.textContent = d.note;
      var sw = document.createElement("span");
      sw.className = "tl-fx-sw";
      sw.appendChild(document.createElement("i"));

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.appendChild(sw);

      (function (theId) {
        row.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggle(theId);
        });
      })(id);

      /* "주 차트" 무리 끝에 넣습니다 - "아래 별도 칸" 머리 바로 앞입니다. */
      var placed = false;
      if (it.pane === "main") {
        var groups = list.querySelectorAll(".tl-fx-group");
        for (var g = 0; g < groups.length; g++) {
          if (groups[g].textContent === "아래 별도 칸") {
            list.insertBefore(row, groups[g]);
            placed = true;
            break;
          }
        }
      }
      if (!placed) list.appendChild(row);
    }
  }

  /**
   * 우리 줄의 상태를 다시 칠하고, 아래 안내줄의 개수를 사실대로 고칩니다.
   *
   * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 셉니다.
   * 그대로 두면 EMA 를 켰는데 "켜진 지표 0개" 라고 적히는, 화면이 사실과
   * 다른 상태가 됩니다. 그래서 화면에 실제로 있는 줄을 다시 세어 적습니다.
   */
  function paintMenu() {
    var p = menuPanel();
    if (!p) return;

    /* 값이 이미 그러면 다시 쓰지 않습니다.
       ★2026-09-02 실측으로 확인한 것★ - 같은 값이라도 setAttribute 를 하면
       aria-pressed 를 보고 있는 이 창의 감시가 다시 불립니다. 그러면
         감시 -> paintMenu -> setAttribute -> 감시 ...
       가 끝없이 돌아 화면이 멈춥니다(브라우저가 응답을 안 합니다).
       줄에 무엇을 하나라도 더 붙이면(설정 창의 아이콘 세 개처럼) 이 고리가
       시작됩니다. 그래서 "달라진 것만" 쓰도록 못 박습니다. */
    var mine = p.querySelectorAll('.tl-fx-row[data-kit="1"]');
    for (var i = 0; i < mine.length; i++) {
      var id = mine[i].getAttribute("data-key");
      var on = isOn(id);
      var want2 = on ? "true" : "false";
      if (mine[i].getAttribute("aria-pressed") !== want2) mine[i].setAttribute("aria-pressed", want2);
      var dot = mine[i].querySelector(".tl-fx-dot");
      var wantBg = on ? mine[i].getAttribute("data-color") : GUIDE_COLOR;
      if (dot && dot.style.background !== wantBg) dot.style.background = wantBg;
    }

    var foot = p.querySelector(".tl-fx-foot");
    if (!foot) return;
    var n = p.querySelectorAll('.tl-fx-row[aria-pressed="true"]').length;
    var want =
      n === 0
        ? "켜진 지표가 없습니다. 눌러서 켜면 차트에 바로 그려집니다."
        : "켜진 지표 " + n + "개. 꺼진 지표는 계산도 하지 않습니다.";
    /* 같으면 안 씁니다 - 안 그러면 아래 감시가 스스로를 다시 부릅니다 */
    if (foot.textContent !== want) foot.textContent = want;
  }

  /* 감시는 두 겹입니다. 이렇게 나눈 이유가 있습니다.
   *
   * 처음에는 .chart-panel 하나를 subtree + characterData 로 통째로 감시했는데,
   * 차트 칸 안에는 시세 · 눈금처럼 초당 수십 번 바뀌는 글자가 있어서 감시
   * 콜백이 계속 불렸습니다. 실측(1920, 봉 1001개) -
   *     통째로 감시   기존 지표 0.278ms + 기존 오실 0.167ms = 0.445ms/틱
   *     안 하던 때    기존 지표 0.161ms + 기존 오실 0.117ms = 0.278ms/틱
   * 우리 지표를 다 꺼둔 상태인데도 남의 계산이 느려졌습니다. 그래서
   *     바깥 감시  .chart-panel 의 "자식이 늘고 줄었나" 만 (subtree 없음)
   *     안쪽 감시  목록 창이 열려 있는 동안만, 그 창 안쪽만
   * 으로 나눴습니다. 목록이 닫혀 있으면 안쪽 감시는 아예 없습니다.
   * (목록 창은 .chart-panel 의 바로 밑 자식으로 붙습니다 -
   *  js/chart-indicator-menu.js 의 build() 가 h.appendChild(p) 를 합니다) */
  var hostWatcher = null;
  var panelWatcher = null;

  function onHostChange() {
    var p = menuPanel();
    if (p && !panelWatcher) {
      injectMenuRows();
      paintMenu();
      panelWatcher = new MutationObserver(function () {
        injectMenuRows();
        paintMenu();
      });
      panelWatcher.observe(p, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-pressed"],
        characterData: true
      });
    } else if (!p && panelWatcher) {
      panelWatcher.disconnect();
      panelWatcher = null;
    }
  }

  function watchMenu() {
    if (hostWatcher || typeof MutationObserver === "undefined") return;
    var host = document.querySelector(".chart-panel");
    if (!host) return;
    hostWatcher = new MutationObserver(onHostChange);
    hostWatcher.observe(host, { childList: true }); /* 자식만. subtree 안 봅니다 */
    onHostChange();
  }

  /* =====================================================================
   * 11. 여기부터 지표 정의 - 계산식은 한 지표당 한 곳에만
   *
   * 지표를 늘리려면 아래처럼 define() 한 덩어리를 더 적으면 끝입니다.
   * 위쪽 틀은 하나도 안 고칩니다.
   * ===================================================================== */

  /* -- EMA 지수이동평균 -------------------------------------------------
   * EMA(t) = 종가(t) x k + EMA(t-1) x (1-k),   k = 2 / (기간+1)
   * 첫 값은 앞 기간개의 단순평균으로 시작합니다(트레이딩뷰 · 바이낸스와 같음).
   *
   * 바이낸스 실측(2026-09-02) - EMA 기본 기간은 7 / 25 / 99 였습니다
   * (Main Indicator > EMA > "EMA - Exponential Moving Average").
   * 여기서는 증명용이라 9 와 21 을 씁니다 - 이미 있는 MA(7) · MA(25) 와
   * 겹쳐 보이지 않게 일부러 다른 기간을 골랐습니다.
   * ------------------------------------------------------------------- */
  define({
    id: "ema",
    name: "EMA",
    note: "지수이동평균",
    pane: "main",
    params: { p: 9 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      return "EMA(" + prm.p + ")";
    },
    outputs: [{ key: "ema", kind: "line", color: "#49C9E9", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;   /* 값 종류(종가 · 시가 · HL2 ...) */
      var n = src.length;
      var out = [];
      if (n < p) return { ema: out };

      var k = 2 / (p + 1);
      var sum = 0;
      var i;
      for (i = 0; i < p; i++) sum += src[i];
      var e = sum / p;
      out.push({ time: bs.time[p - 1], value: e });
      if (p - 1 === n - 2) cap.state = { e: e };

      for (i = p; i < n; i++) {
        e = src[i] * k + e * (1 - k);
        out.push({ time: bs.time[i], value: e });
        if (i === n - 2) cap.state = { e: e };
      }
      return { ema: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var k = 2 / (p + 1);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var e = x * k + st.e * (1 - k);
      return { values: { ema: e }, state: { e: e } };
    }
  });

  /* -- WMA 가중이동평균 -------------------------------------------------
   * WMA(t) = (p·값(t) + (p-1)·값(t-1) + ... + 1·값(t-p+1)) / (1+2+...+p)
   * 단순평균(MA)과 뿌리가 같고 무게만 다릅니다 - 최근 봉에 가장 큰 무게.
   *
   * 기본 길이 9 · 종가 · 밀기 0 · 굵기 1 - 트레이딩뷰 "Moving Average
   * Weighted" 기본값입니다. ⚠️ 바이낸스는 다릅니다 - 2026-09-02 에 직접
   * 열어 보니 WMA1·2·3 = 7 · 25 · 99 였습니다(MA 와 같은 칸 열 개짜리 구조).
   * ★차트 시스템은 트레이딩뷰를 따라간다★ 는 지시라 9 로 뒀습니다. 바이낸스
   * 처럼 보고 싶으면 WMA(7) · WMA(25) · WMA(99) 세 줄을 얹으면 됩니다 -
   * 이 틀이 "정의 1개 + 인스턴스 N개" 인 이유가 그것입니다.
   *
   * -- step 이 O(1) 인 이유 (이 지표의 핵심) ----------------------------
   * 그냥 하면 틱마다 p개를 다시 더해야 합니다. 아래 두 줄이면 끝납니다.
   *     분자(t) = 분자(t-1) + p·값(t) - 합(t-1)
   *     합(t)   = 합(t-1)   + 값(t)   - 값(t-p)
   * 그래서 상태가 "곧 창에서 빠질 값(oldest)" 과 최근 p개(buf) 를 들고 다닙니다.
   *
   * ⚠️ buf 를 그 자리에서 고쳐 씁니다. 그래도 되는 이유 -
   *    step 은 ★진행 중인 봉★ 때문에 같은 상태로 여러 번 불립니다. 그때
   *    덮어쓰는 칸은 st.head ★하나뿐★ 이고, 그 칸의 옛 값은 st.oldest 에
   *    따로 적어 두었습니다. 그래서 몇 번을 다시 불러도 답이 같습니다.
   *    (다음 oldest 는 ★쓴 뒤에★ 읽습니다 - 기간이 1이면 그 칸이 자기 자신입니다)
   * ------------------------------------------------------------------- */

  /** i번째 봉까지 확정된 WMA 상태. buf 는 [i-p+1 .. i] 를 시간순으로 담고
   *  head 는 "곧 빠질 칸"(= i-p+1) 을 가리킵니다. */
  function wmaState(num, sum, src, i, p) {
    var buf = new Array(p);
    for (var q = 0; q < p; q++) buf[q] = src[i - p + 1 + q];
    return { N: num, S: sum, oldest: buf[0], buf: buf, head: 0 };
  }

  define({
    id: "wma",
    name: "WMA",
    note: "가중이동평균",
    pane: "main",
    params: { p: 9 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      return "WMA(" + prm.p + ")";
    },
    outputs: [{ key: "wma", kind: "line", color: "#FF8F3C", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;
      var n = src.length;
      var out = [];
      if (n < p) return { wma: out };

      var den = (p * (p + 1)) / 2;
      var num = 0;
      var sum = 0;
      var i;
      for (i = 0; i < p; i++) {
        num += (i + 1) * src[i];
        sum += src[i];
      }
      out.push({ time: bs.time[p - 1], value: num / den });
      if (p - 1 === n - 2) cap.state = wmaState(num, sum, src, p - 1, p);

      for (i = p; i < n; i++) {
        num = num + p * src[i] - sum;
        sum = sum + src[i] - src[i - p];
        out.push({ time: bs.time[i], value: num / den });
        if (i === n - 2) cap.state = wmaState(num, sum, src, i, p);
      }
      return { wma: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var den = (p * (p + 1)) / 2;
      var num = st.N + p * x - st.S;
      var sum = st.S + x - st.oldest;

      var len = st.buf.length || 1;
      st.buf[st.head] = x;                    /* 덮어쓰는 칸은 여기 하나뿐 */
      var head = (st.head + 1) % len;
      return {
        values: { wma: num / den },
        state: { N: num, S: sum, oldest: st.buf[head], buf: st.buf, head: head }
      };
    }
  });

  /* -- KDJ -------------------------------------------------------------
   * 국내·아시아권에서 많이 쓰는 스토캐스틱 계열입니다. 선이 셋입니다.
   *
   *   RSV(t) = (종가 - 기간최저) / (기간최고 - 기간최저) x 100
   *   K = ((k-1)·이전K + RSV) / k    기본 k=3 이면  K = (2·이전K + RSV) / 3
   *   D = ((d-1)·이전D + K)  / d     기본 d=3 이면  D = (2·이전D + K)  / 3
   *   J = 3K - 2D                    시작값은 K = D = 50
   *
   * J 는 K 와 D 의 벌어짐이라 0~100 을 넘어갑니다 - 그래서 눈금을 고정하지
   * 않고 라이브러리 자동 눈금에 맡깁니다.
   *
   * ⭐ 기본값 9 · 3 · 3 의 근거 - ★2026-09-02 바이낸스 선물 차트에서 직접 열어
   *    읽은 값입니다.★ (Original 차트 > 지표 > Sub Indicator > KDJ)
   *        KDJ - Stochastic Indicator
   *        Calculating Period 9 · MA Period 1  3 · MA Period 2  3
   *    우리 이름으로는 기간 9 · K 기간 3 · D 기간 3 입니다.
   *    트레이딩뷰 ★내장★ 에는 KDJ 가 없어서(커뮤니티 지표뿐이고 기본값이
   *    제각각입니다) 회원이 실제로 보는 바이낸스 값을 따랐습니다.
   *    바이낸스 선 색은 #EB40B5 · #B385F8 · #F0B90B 세 가지였습니다 -
   *    우리는 확정 팔레트 밖 색을 못 쓰므로 LINE_COLORS 안에서 골랐습니다.
   *
   * -- 기간최고 · 기간최저를 틱마다 다시 훑지 않습니다 -------------------
   *    창에 최고값이 어느 칸인지(hiIdx) 를 같이 들고 다닙니다.
   *      · 새 값이 더 높다         -> 그 값이 새 최고 (비교 한 번)
   *      · 최고가 창에 그대로 있다  -> 그대로 (비교 한 번)
   *      · 최고이던 봉이 빠졌다     -> 그때만 창을 훑습니다
   *    보통은 O(1) 이고, 훑는 경우에도 ★봉 개수 n 이 아니라 기간 p★ 입니다.
   *    (기본 9 -> 최대 8번 비교. 1000봉을 다시 계산하는 것과 다릅니다)
   *
   * ⚠️ ring 을 그 자리에서 고쳐 쓰는 것은 위 WMA 와 같은 이유로 안전합니다.
   *    값은 상태에 적어 둔 hiMax/loMin 으로만 내고, 창을 훑는 경우는
   *    ★현재 값을 쓴 뒤★ 라 몇 번을 다시 불러도 답이 같습니다.
   * ------------------------------------------------------------------- */

  function kdjInit(m) {
    return {
      hb: new Array(m), lb: new Array(m), head: 0, cnt: 0,
      hiMax: -Infinity, hiIdx: -1, loMin: Infinity, loIdx: -1,
      k: 50, d: 50
    };
  }

  /** seed 가 잡아 두는 상태는 배열까지 복사합니다 - 뒤이어 도는 봉이
   *  같은 배열을 고쳐 쓰지 못하게. (켤 때 한 번뿐입니다) */
  function kdjCopy(st) {
    return {
      hb: st.hb.slice(), lb: st.lb.slice(), head: st.head, cnt: st.cnt,
      hiMax: st.hiMax, hiIdx: st.hiIdx, loMin: st.loMin, loIdx: st.loIdx,
      k: st.k, d: st.d
    };
  }

  /** 봉 하나를 처리합니다. seed 와 step 이 ★같은 함수★ 를 씁니다
   *  (계산이 두 벌이 되면 켤 때와 틱이 어긋납니다). */
  function kdjOne(st, high, low, close, m, m1, m2) {
    var vals = null;
    var k = st.k;
    var d = st.d;

    if (st.cnt >= m) {
      var hh = high > st.hiMax ? high : st.hiMax;
      var ll = low < st.loMin ? low : st.loMin;
      var rsv = hh > ll ? ((close - ll) / (hh - ll)) * 100 : 50;
      k = ((m1 - 1) * st.k + rsv) / m1;
      d = ((m2 - 1) * st.d + k) / m2;
      vals = { k: k, d: d, j: 3 * k - 2 * d };
    }

    var head = st.head;
    var cnt = st.cnt;
    var hiMax = st.hiMax, hiIdx = st.hiIdx;
    var loMin = st.loMin, loIdx = st.loIdx;
    var a, v;

    if (m > 0) {
      st.hb[head] = high;                     /* 덮어쓰는 칸은 여기 하나뿐 */
      st.lb[head] = low;

      if (high >= hiMax) {
        hiMax = high;
        hiIdx = head;
      } else if (hiIdx === head) {            /* 최고이던 봉이 창에서 빠졌습니다 */
        hiMax = -Infinity;
        hiIdx = -1;
        for (a = 0; a < m; a++) {
          v = st.hb[a];
          if (v === undefined) continue;
          if (v > hiMax) { hiMax = v; hiIdx = a; }
        }
      }

      if (low <= loMin) {
        loMin = low;
        loIdx = head;
      } else if (loIdx === head) {
        loMin = Infinity;
        loIdx = -1;
        for (a = 0; a < m; a++) {
          v = st.lb[a];
          if (v === undefined) continue;
          if (v < loMin) { loMin = v; loIdx = a; }
        }
      }

      head = (head + 1) % m;
      if (cnt < m) cnt++;
    }

    return {
      values: vals,
      state: {
        hb: st.hb, lb: st.lb, head: head, cnt: cnt,
        hiMax: hiMax, hiIdx: hiIdx, loMin: loMin, loIdx: loIdx, k: k, d: d
      }
    };
  }

  define({
    id: "kdj",
    name: "KDJ",
    note: "K·D·J 세 선",
    pane: "sub",
    params: { p: 9, k: 3, d: 3 },
    inputs: [
      { key: "p", label: "기간", min: 1, max: 1000 },
      { key: "k", label: "K 기간", min: 1, max: 100 },
      { key: "d", label: "D 기간", min: 1, max: 100 }
    ],
    nameOf: function (prm) {
      return "KDJ(" + prm.p + "," + prm.k + "," + prm.d + ")";
    },
    outputs: [
      { key: "k", kind: "line", color: "#499EE9", style: "solid" },
      { key: "d", kind: "line", color: "#E1ED97", style: "solid" },
      { key: "j", kind: "line", color: "#E637E6", style: "solid" }
    ],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var m1 = Math.max(1, prm.k | 0);
      var m2 = Math.max(1, prm.d | 0);
      var m = p - 1;
      var n = bs.close.length;
      var outK = [], outD = [], outJ = [];
      var st = kdjInit(m);

      for (var i = 0; i < n; i++) {
        var r = kdjOne(st, bs.high[i], bs.low[i], bs.close[i], m, m1, m2);
        st = r.state;
        if (r.values) {
          outK.push({ time: bs.time[i], value: r.values.k });
          outD.push({ time: bs.time[i], value: r.values.d });
          outJ.push({ time: bs.time[i], value: r.values.j });
        }
        if (i === n - 2) cap.state = kdjCopy(st);
      }
      return { k: outK, d: outD, j: outJ };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var r = kdjOne(
        st, bar.high, bar.low, bar.close,
        p - 1, Math.max(1, prm.k | 0), Math.max(1, prm.d | 0)
      );
      return { values: r.values || {}, state: r.state };
    }
  });

  /* -- ATR 평균실체범위 -------------------------------------------------
   * 진폭(변동성)입니다. 방향을 안 봅니다 - 얼마나 흔들리는지만 봅니다.
   *
   *   TR(t)  = max( 고-저 , |고-이전종| , |저-이전종| )
   *   ATR(t) = ((p-1)·ATR(t-1) + TR(t)) / p        <- RMA(와일더 평활)
   *   첫 값은 앞 p개 TR 의 단순평균으로 시작합니다(트레이딩뷰 ta.rma 와 같음).
   *   첫 봉의 TR 은 이전 종가가 없으므로 고-저 만 씁니다(ta.tr(true) 와 같음).
   *
   * ⭐ 기본 기간 14 · 평활 RMA - ★트레이딩뷰 기준★ 입니다.
   *    (2026-09-02 트레이딩뷰 도움말 "Average True Range (ATR)" -
   *     "14 days is the default" · "By default on TradingView the ATR is a
   *     Relative Moving Average (RMA) of the True Range")
   *    ⚠️ 앱 안 설정 창은 직접 못 열었습니다 - 지표를 얹으려면 회원가입을
   *       하라는 창이 막았고, 우리는 로그인하지 않습니다. 도움말 문서 값입니다.
   *    ⚠️ ★바이낸스에는 ATR 이 아예 없습니다★ - 2026-09-02 Original 차트에서
   *       Main 9개(MA · EMA · WMA · BOLL · VWAP · AVL · TRIX · SAR · SUPER)와
   *       Sub 10개(VOL · MACD · RSI · MFI · KDJ · OBV · CCI · StochRSI · WR · DMI)
   *       를 다 세었고 스크롤도 없었습니다(422/422 · 598/598).
   *       차트 시스템은 트레이딩뷰 관할이라 그래도 넣습니다.
   *
   * 기준선 없음 - ATR 은 늘 0 이상이고 종목 · 가격대마다 크기가 달라서
   * 고정된 눈금선이 뜻을 갖지 못합니다. 트레이딩뷰도 안 그립니다.
   *
   * -- step 이 O(1) 인 이유 -----------------------------------------------
   *    RMA 는 이전 값 하나만 있으면 됩니다. 창을 훑지 않습니다.
   *        atr = ((p-1)·이전atr + TR) / p       곱셈 1 · 덧셈 1 · 나눗셈 1
   *    TR 도 이전 종가 하나면 구해집니다. 그래서 상태가 { a, pc } 둘뿐입니다.
   *    배열이 없어서 "그 자리에서 고쳐 쓰기" 걱정도 없습니다.
   * ------------------------------------------------------------------- */

  /** 봉 하나의 TR. pc(이전 종가)가 없으면 첫 봉이라 고-저 만 씁니다. */
  function trueRange(high, low, pc) {
    var r = high - low;
    if (typeof pc !== "number") return r;
    var a = high - pc;
    if (a < 0) a = -a;
    var b = low - pc;
    if (b < 0) b = -b;
    if (a > r) r = a;
    if (b > r) r = b;
    return r;
  }

  define({
    id: "atr",
    name: "ATR",
    note: "평균실체범위 (변동성)",
    pane: "sub",
    params: { p: 14 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    nameOf: function (prm) {
      return "ATR(" + prm.p + ")";
    },
    outputs: [{ key: "atr", kind: "line", color: "#B99264", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var n = bs.close.length;
      var out = [];
      if (n < p) return { atr: out };

      var i;
      var tr = new Array(n);
      tr[0] = trueRange(bs.high[0], bs.low[0]);
      for (i = 1; i < n; i++) tr[i] = trueRange(bs.high[i], bs.low[i], bs.close[i - 1]);

      var sum = 0;
      for (i = 0; i < p; i++) sum += tr[i];
      var a = sum / p;
      out.push({ time: bs.time[p - 1], value: a });
      if (p - 1 === n - 2) cap.state = { a: a, pc: bs.close[p - 1] };

      for (i = p; i < n; i++) {
        a = ((p - 1) * a + tr[i]) / p;
        out.push({ time: bs.time[i], value: a });
        if (i === n - 2) cap.state = { a: a, pc: bs.close[i] };
      }
      return { atr: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var a = ((p - 1) * st.a + trueRange(bar.high, bar.low, st.pc)) / p;
      /* 돌려주는 상태는 "이 봉이 닫혔다면" 의 상태입니다. 진행 중인 봉에
         대해서는 틀이 이 상태를 ★버립니다★(6절 onTick). 그래서 몇 번을
         다시 불러도 st 는 그대로고 답도 같습니다. */
      return { values: { atr: a }, state: { a: a, pc: bar.close } };
    }
  });

  /* -- StochRSI 스토캐스틱 RSI -------------------------------------------
   * RSI 에 스토캐스틱을 한 번 더 씌운 것입니다. "RSI 가 요즘 값들 중 어디쯤인가"
   * 를 봅니다. 그래서 RSI 보다 빨리 끝(0 · 100)에 닿습니다.
   *
   *   RSI   = 100 - 100/(1+RS),  RS = 평균상승/평균하락 (와일더 RMA)
   *   Stoch = (RSI - RSI최저) / (RSI최고 - RSI최저) x 100    창 = 스토캐스틱 기간
   *   %K    = Stoch 의 단순평균 (K 기간)
   *   %D    = %K    의 단순평균 (D 기간)
   *
   *   ⚠️ 평균하락이 0 이면 100, 평균상승이 0 이면 0 으로 둡니다 -
   *      트레이딩뷰 ta.rsi 가 그렇게 합니다(0/0 을 식 그대로 두면 NaN).
   *
   * ⭐ 기본값 14 · 14 · 3 · 3 - ★바이낸스와 트레이딩뷰가 같습니다.★
   *    바이낸스 실측(2026-09-02 · Original 차트 > Sub Indicator > StochRSI)
   *        "StochRSI - Stochastic RSI"
   *        Length RSI 14 · Length Stoch 14 · Smooth K 3 · Smooth D 3
   *        (설정 창 입력칸 네 개를 그대로 읽었습니다)
   *    트레이딩뷰 도움말 "Stochastic RSI" - K 3 · D 3 · Source Close ·
   *        예시가 "14 Period Stoch RSI". 두 곳이 같아 고를 것이 없었습니다.
   *
   * ⭐ 기준선 20 · 80 - 트레이딩뷰 기본 밴드입니다(도움말 Upper 80 · Lower 20).
   *    RSI 의 30/70 과 다릅니다. StochRSI 가 끝에 더 자주 붙기 때문입니다.
   *
   * -- step 이 O(1) 인 이유 -----------------------------------------------
   *    ① RSI      와일더 RMA. 이전 평균 둘(상승 · 하락)만 있으면 됩니다
   *    ② RSI 최고 · 최저   KDJ 와 ★똑같은 링버퍼★ 입니다. 최고가 어느 칸인지
   *       (hiIdx)를 들고 다녀 보통 비교 한 번. 최고이던 봉이 창에서 빠질 때만
   *       훑는데, 그때도 ★봉 개수 n 이 아니라 기간 p★ 입니다
   *    ③ %K · %D  굴러가는 합. 더하고 빼면 끝
   *    평소 O(1) · 극값이 빠지는 드문 경우만 O(p). KDJ 와 같은 성질입니다.
   *
   * ⚠️ 버퍼를 그 자리에서 고쳐 쓰는 것이 왜 안전한가 (WMA · KDJ 와 같은 이유)
   *    step 은 ★진행 중인 봉★ 때문에 같은 상태로 여러 번 불립니다. 그때
   *    덮어쓰는 칸은 rb[rh] · kb[kh] · db[dh] ★세 칸뿐★ 이고, 굴러가는 합이
   *    필요로 하는 "곧 빠질 값" 은 버퍼가 아니라 st.kold · st.dold 에 ★따로★
   *    적어 두었습니다. 그래서 몇 번을 다시 불러도 답이 같습니다.
   *    (rb 는 합을 안 쓰고 최고 · 최저만 보므로 따로 적을 것이 없습니다)
   * ------------------------------------------------------------------- */

  function srsiInit(sp, kp, dp) {
    return {
      /* RSI - m 은 지금까지 본 "변화량" 개수입니다(첫 봉은 변화량이 없습니다) */
      pc: null, ag: 0, al: 0, m: 0,
      /* RSI 의 최고 · 최저 창 */
      rb: new Array(sp), rh: 0, rc: 0,
      hiMax: -Infinity, hiIdx: -1, loMin: Infinity, loIdx: -1,
      /* %K · %D 의 굴러가는 합 (kold · dold = 곧 창에서 빠질 값) */
      kb: new Array(kp), kh: 0, kc: 0, ks: 0, kold: 0,
      db: new Array(dp), dh: 0, dc: 0, ds: 0, dold: 0
    };
  }

  /** seed 가 잡아 두는 상태는 배열까지 복사합니다 - 뒤이어 도는 봉이 같은
   *  배열을 고쳐 쓰지 못하게. (켤 때 한 번뿐입니다) */
  function srsiCopy(st) {
    return {
      pc: st.pc, ag: st.ag, al: st.al, m: st.m,
      rb: st.rb.slice(), rh: st.rh, rc: st.rc,
      hiMax: st.hiMax, hiIdx: st.hiIdx, loMin: st.loMin, loIdx: st.loIdx,
      kb: st.kb.slice(), kh: st.kh, kc: st.kc, ks: st.ks, kold: st.kold,
      db: st.db.slice(), dh: st.dh, dc: st.dc, ds: st.ds, dold: st.dold
    };
  }

  /** 봉 하나를 처리합니다. seed 와 step 이 ★같은 함수★ 를 씁니다
   *  (계산이 두 벌이 되면 켤 때와 틱이 어긋납니다). */
  function srsiOne(st, close, rp, sp, kp, dp) {
    var ag = st.ag, al = st.al, m = st.m;
    var rsi = null;

    if (st.pc !== null) {
      var ch = close - st.pc;
      var up = ch > 0 ? ch : 0;
      var dn = ch < 0 ? -ch : 0;
      m++;
      if (m < rp) {
        ag += up;                       /* 아직 모으는 중 */
        al += dn;
      } else if (m === rp) {
        ag = (ag + up) / rp;            /* 앞 rp개의 단순평균으로 시작 */
        al = (al + dn) / rp;
      } else {
        ag = ((rp - 1) * ag + up) / rp; /* 와일더 RMA */
        al = ((rp - 1) * al + dn) / rp;
      }
      if (m >= rp) rsi = al === 0 ? 100 : (ag === 0 ? 0 : 100 - 100 / (1 + ag / al));
    }

    var vals = null;
    var rb = st.rb, rh = st.rh, rc = st.rc;
    var hiMax = st.hiMax, hiIdx = st.hiIdx, loMin = st.loMin, loIdx = st.loIdx;
    var kb = st.kb, kh = st.kh, kc = st.kc, ks = st.ks, kold = st.kold;
    var db = st.db, dh = st.dh, dc = st.dc, ds = st.ds, dold = st.dold;
    var a, v;

    if (rsi !== null) {
      rb[rh] = rsi;                     /* 덮어쓰는 칸은 여기 하나뿐 */

      if (rsi >= hiMax) {
        hiMax = rsi;
        hiIdx = rh;
      } else if (hiIdx === rh) {        /* 최고이던 봉이 창에서 빠졌습니다 */
        hiMax = -Infinity;
        hiIdx = -1;
        for (a = 0; a < sp; a++) {
          v = rb[a];
          if (v === undefined) continue;
          if (v > hiMax) { hiMax = v; hiIdx = a; }
        }
      }

      if (rsi <= loMin) {
        loMin = rsi;
        loIdx = rh;
      } else if (loIdx === rh) {
        loMin = Infinity;
        loIdx = -1;
        for (a = 0; a < sp; a++) {
          v = rb[a];
          if (v === undefined) continue;
          if (v < loMin) { loMin = v; loIdx = a; }
        }
      }

      rh = (rh + 1) % sp;
      if (rc < sp) rc++;

      if (rc >= sp) {
        /* 창이 한 값으로 평평하면 나눌 것이 없습니다 - 0 으로 둡니다 */
        var stoch = hiMax > loMin ? ((rsi - loMin) / (hiMax - loMin)) * 100 : 0;

        ks = ks + stoch - (kc >= kp ? kold : 0);
        kb[kh] = stoch;
        kh = (kh + 1) % kp;
        if (kc < kp) kc++;
        kold = kb[kh];                  /* 다음에 빠질 값 - ★쓴 뒤에★ 읽습니다 */

        if (kc >= kp) {
          var kv = ks / kp;
          ds = ds + kv - (dc >= dp ? dold : 0);
          db[dh] = kv;
          dh = (dh + 1) % dp;
          if (dc < dp) dc++;
          dold = db[dh];
          if (dc >= dp) vals = { k: kv, d: ds / dp };
        }
      }
    }

    return {
      values: vals,
      state: {
        pc: close, ag: ag, al: al, m: m,
        rb: rb, rh: rh, rc: rc,
        hiMax: hiMax, hiIdx: hiIdx, loMin: loMin, loIdx: loIdx,
        kb: kb, kh: kh, kc: kc, ks: ks, kold: kold,
        db: db, dh: dh, dc: dc, ds: ds, dold: dold
      }
    };
  }

  define({
    id: "srsi",
    name: "StochRSI",
    note: "RSI 에 스토캐스틱을 다시 씌운 것",
    pane: "sub",
    params: { rp: 14, sp: 14, k: 3, d: 3 },
    inputs: [
      { key: "rp", label: "RSI 기간", min: 1, max: 1000 },
      { key: "sp", label: "스토캐스틱 기간", min: 1, max: 1000 },
      { key: "k", label: "%K 기간", min: 1, max: 100 },
      { key: "d", label: "%D 기간", min: 1, max: 100 }
    ],
    nameOf: function (prm) {
      return "StochRSI(" + prm.rp + "," + prm.sp + "," + prm.k + "," + prm.d + ")";
    },
    outputs: [
      { key: "k", kind: "line", color: "#4974E9", style: "solid" },
      { key: "d", kind: "line", color: "#F292DE", style: "solid" }
    ],
    guides: [{ price: 80 }, { price: 20 }],

    seed: function (bs, prm, cap) {
      var rp = Math.max(1, prm.rp | 0);
      var sp = Math.max(1, prm.sp | 0);
      var kp = Math.max(1, prm.k | 0);
      var dp = Math.max(1, prm.d | 0);
      var n = bs.close.length;
      var outK = [], outD = [];
      var st = srsiInit(sp, kp, dp);

      for (var i = 0; i < n; i++) {
        var r = srsiOne(st, bs.close[i], rp, sp, kp, dp);
        st = r.state;
        if (r.values) {
          outK.push({ time: bs.time[i], value: r.values.k });
          outD.push({ time: bs.time[i], value: r.values.d });
        }
        if (i === n - 2) cap.state = srsiCopy(st);
      }
      return { k: outK, d: outD };
    },

    step: function (st, bar, prm) {
      var r = srsiOne(
        st, bar.close,
        Math.max(1, prm.rp | 0), Math.max(1, prm.sp | 0),
        Math.max(1, prm.k | 0), Math.max(1, prm.d | 0)
      );
      return { values: r.values || {}, state: r.state };
    }
  });

  /* -- CCI 상품채널지수 -------------------------------------------------
   *   TP  = (고 + 저 + 종) / 3                      <- 값 종류 기본이 이것입니다
   *   MD  = (1/p) · Σ |TP_i - SMA(TP,p)|             평균편차
   *   CCI = (TP - SMA(TP,p)) / (0.015 · MD)
   *
   * ⭐ 기본 기간 20 · 값 종류 (고+저+종)/3 - ★트레이딩뷰 기준★ 입니다.
   *    (2026-09-02 트레이딩뷰 도움말 "Commodity Channel Index (CCI)" -
   *     "The time period to be used in calculating the SMA portion of the
   *      CCI (20 is the default)")
   *    ⚠️ ★바이낸스는 9 입니다★ - 2026-09-02 Original 차트 > Sub Indicator >
   *       CCI 설정 창의 Length 칸을 직접 읽었습니다. 입력칸이 그것 하나뿐이었습니다.
   *       WMA 때와 같은 갈림인데, 대표 지시가 "차트 시스템은 트레이딩뷰를
   *       따라간다" 라 20 으로 갑니다. 바이낸스처럼 보고 싶으면 기간만 9 로
   *       고쳐 한 줄 더 얹으면 됩니다 - "정의 1개 + 인스턴스 N개" 인 이유입니다.
   *    ⚠️ 값 종류 - 도움말에는 "Close is the default" 라고 적혀 있는데, ★식이
   *       말해 줍니다.★ 위 TP 가 곧 (고+저+종)/3 이고, 종가로 계산하면 그건
   *       CCI 가 아닙니다. 그래서 기본을 hlc3 으로 두고, 트레이딩뷰처럼
   *       회원이 값 종류를 바꿀 수 있게 열어 두었습니다.
   *       (앱 안 설정 창은 회원가입 창이 막아 못 열었습니다 - 도움말 문서 값입니다)
   *
   * ⭐ 기준선 +100 · 0 · -100 - 식의 0.015 라는 상수가 "값이 보통 ±100 안에
   *    들어오게" 맞춘 것이라, ±100 이 이 지표의 눈금 그 자체입니다.
   *
   * ⚠️ 색 - 2026-09-02 (8단계) 에는 #BA6EED 였습니다. 그때 LINE_COLORS 12색이
   *    꽉 차서 ★기본 인스턴스 EMA(21) 와 같은 색★ 을 쓸 수밖에 없었습니다
   *    (주 차트와 아래 칸이라 같은 눈금 위엔 안 놓인다는 이유로 눈감았습니다).
   *    ⭐ 9단계에서 색이 20색이 되어 그럴 이유가 없어졌습니다. 아무도 안 쓰는
   *       #C1BAF3(라벤더)로 옮겼습니다. 이미 얹어 두신 CCI 는 색을 각자 들고
   *       있어서 그대로입니다(바뀌는 것은 앞으로 새로 얹는 것뿐입니다).
   *
   * -- ⚠️ step 이 O(1) 이 ★아닙니다★. O(p) 입니다 -----------------------
   *    이 틀의 다른 지표는 전부 O(1) 인데 CCI 만 다릅니다. 계산식 때문입니다.
   *        MD = (1/p) · Σ |TP_i - SMA|     <- 절댓값 안에 ★현재★ SMA 가 있음
   *    SMA 는 굴러가는 합으로 O(1) 인데, ★SMA 가 매 봉 바뀌면 p개 항이 전부
   *    같이 바뀝니다.★ 그래서 창을 다시 훑는 것 말고 방법이 없습니다.
   *    (KDJ · StochRSI 는 "극값이 빠질 때만" O(p) 인데 CCI 는 항상입니다)
   *
   *    ⭐ 그래서 비싼가 - 재 봤습니다. 안 비쌉니다.
   *       (틀의 step 을 그대로 20만 회 부른 실측 · 예열 뒤 · 봉 1006개)
   *          기간   2   step 0.000579 ms   초당 50틱 0.029 ms/초   한 장의 0.0035%
   *          기간   9   step 0.001936 ms   초당 50틱 0.097 ms/초   한 장의 0.0116%
   *          기간  20   step 0.003874 ms   초당 50틱 0.194 ms/초   한 장의 0.0232%
   *          기간 100   step 0.018653 ms   초당 50틱 0.933 ms/초   한 장의 0.1117%
   *       O(1) 인 다른 지표와 견주면 - EMA 0.000217 · WMA 0.000232 ·
   *       ATR 0.000226 · KDJ 0.000628 · StochRSI 0.000853 ms
   *       CCI(20)가 제일 비싸지만 그래도 ★화면 한 장의 0.02%★ 입니다.
   *    값을 근사치(제곱 기반)로 바꾸면 O(1) 이 되지만 ★트레이딩뷰와 숫자가
   *    달라집니다.★ 0.02% 를 아끼려고 값을 틀리게 만들지 않습니다.
   *    (2026-09-02 PM 결정 - "CCI 에는 O(1) 지시가 틀렸다. 그대로 진행하고
   *     주석에 근거를 적어라")
   *
   * ⚠️ 평균(SMA)도 창을 훑어 구합니다 - 굴러가는 합을 안 씁니다.
   *    처음엔 합을 굴렸는데(O(1)), 봉 1000개를 지나며 반올림 오차가 쌓여
   *    ★기간 2 에서 값이 최대 4.3e-6 어긋났습니다★(1005개 중 2개).
   *    평균편차 때문에 어차피 창을 한 바퀴 도는데, 그 김에 합도 같이 구하면
   *    오차가 사라집니다. O(p) 가 O(p) 그대로라 ★값은 공짜로 정확해집니다.★
   *    (고친 뒤 실측 - 기간 2 · 9 · 20 · 100 전부 최대 오차 2.0e-10 이하)
   *
   * ⚠️ buf 를 그 자리에서 고쳐 쓰는 것은 WMA 와 같은 이유로 안전합니다.
   *    덮어쓰는 칸은 head ★하나뿐★ 이고, 값은 그 칸까지 포함한 창 전체를
   *    다시 훑어 냅니다. 그래서 같은 상태로 몇 번을 다시 불러도 답이 같습니다.
   *    (굴러가는 합을 안 쓰니 "곧 빠질 값" 을 따로 적어 둘 일도 없습니다)
   * ------------------------------------------------------------------- */

  function cciCopy(st) {
    return { buf: st.buf.slice(), head: st.head, c: st.c };
  }

  /** 창에 값 하나를 넣고 CCI 를 냅니다. 창이 덜 찼으면 null. */
  function cciOne(st, x, p) {
    st.buf[st.head] = x;                    /* 덮어쓰는 칸은 여기 하나뿐 */
    var head = (st.head + 1) % p;
    var c = st.c < p ? st.c + 1 : st.c;

    var v = null;
    if (c >= p) {
      var i, sum = 0;
      for (i = 0; i < p; i++) sum += st.buf[i];                      /* <- O(p) */
      var sma = sum / p;
      var md = 0;
      for (i = 0; i < p; i++) md += Math.abs(st.buf[i] - sma);       /* <- O(p) */
      md /= p;
      v = md > 0 ? (x - sma) / (0.015 * md) : 0;
    }
    return { value: v, state: { buf: st.buf, head: head, c: c } };
  }

  define({
    id: "cci",
    name: "CCI",
    note: "상품채널지수",
    pane: "sub",
    params: { p: 20 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    srcDefault: "hlc3",
    nameOf: function (prm) {
      return "CCI(" + prm.p + ")";
    },
    outputs: [{ key: "cci", kind: "line", color: "#C1BAF3", style: "solid" }],
    guides: [{ price: 100 }, { price: 0, style: "dotted" }, { price: -100 }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;
      var n = src.length;
      var out = [];
      var st = { buf: new Array(p), head: 0, c: 0 };

      for (var i = 0; i < n; i++) {
        var r = cciOne(st, src[i], p);
        st = r.state;
        if (r.value !== null) out.push({ time: bs.time[i], value: r.value });
        if (i === n - 2) cap.state = cciCopy(st);
      }
      return { cci: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var r = cciOne(st, x, p);
      return { values: r.value === null ? {} : { cci: r.value }, state: r.state };
    }
  });

  /* -- 거래량을 쓰는 지표를 얹기 전에 ★반드시★ ------------------------
   * 앞 팀이 남긴 경고 - "BarStore 의 거래량이 0 으로 들어올 수 있다".
   * 0 이면 OBV 는 계속 0 을 그리고 VWAP 은 값이 아예 안 나옵니다.
   * ★오류도 경고도 안 납니다 - 이 프로젝트가 조용한 고장이라 부르는 그것입니다.★
   *
   * ⭐ 2026-09-02 브라우저 실측 (localhost · 1920 · BTCUSDT)
   *      봉 1000개 중 거래량 0 인 봉  ★0개★
   *      최소 4.198 · 최대 2,840.886 · 합 95,528.683
   *      실시간도 옵니다 - 같은 봉의 거래량이 6초 사이 59.677 -> 63.088
   *    즉 ★지금은 거래량이 진짜로 들어옵니다.★ 그래서 OBV · VWAP 을 얹었습니다.
   *
   * ⚠️ 그래도 앞으로 0 이 될 수 있습니다(chart.js 의 거래량 시리즈를 못 찾거나,
   *    시각이 안 맞아 map 이 비면 syncBars() 가 0 으로 둡니다). 그때 잠자코
   *    0 짜리 선을 그리면 회원이 그걸 사실로 믿습니다. 그래서 ★한 번은 알립니다.★
   * ------------------------------------------------------------------- */
  var volWarned = false;

  /** 봉 거래량이 전부 0 이면 true (그리지 않고 콘솔에 한 번 알립니다). */
  function volumeAllZero(bs, who) {
    var v = bs.volume || [];
    var sum = 0;
    for (var i = 0; i < v.length; i++) sum += v[i] || 0;
    if (sum > 0) return false;
    if (!volWarned) {
      volWarned = true;
      console.warn(
        "[chart-indicator-kit] 봉 " + v.length + "개의 거래량이 전부 0 이라 " + who +
        " 를 그리지 않습니다. 거래량 시리즈를 못 읽었을 수 있습니다(BarStore.syncBars)."
      );
    }
    return true;
  }

  /* -- OBV 누적거래량 (On Balance Volume) --------------------------------
   * "오른 봉의 거래량은 더하고 내린 봉의 거래량은 뺀다" 를 계속 쌓은 것입니다.
   * 값 자체(1억이든 -3억이든)에는 뜻이 없고 ★방향★ 만 봅니다. 값이 커서 주 차트에
   * 못 얹습니다(캔들 눈금이 뭉갭니다). 그래서 아래 별도 칸입니다.
   *
   * ⭐ 계산식 - 트레이딩뷰 Pine 참고서 ta.obv 를 그대로 옮겼습니다
   *    (2026-09-02 · 브라우저로 직접 열어 읽은 원문)
   *        f_obv() => ta.cum(math.sign(ta.change(close)) * volume)
   *    즉 종가가 오르면 +거래량, 내리면 -거래량, ★같으면 0★ 입니다.
   *    ⚠️ 첫 봉은 "전 봉과의 차이" 가 없어 값이 없습니다(트레이딩뷰도 둘째 봉부터
   *       그립니다). 그래서 우리도 둘째 봉부터 냅니다 - 0 을 찍어 두면 회원이
   *       "여기서 시작했다" 로 읽는데 사실이 아닙니다.
   *
   * ⚠️ 기준선 없음 - 값의 절대 크기에 뜻이 없어 0선도 뜻이 없습니다
   *    (트레이딩뷰 OBV 도 기준선을 안 그립니다).
   *
   * -- step 이 O(1) 인 이유 -------------------------------------------
   *    이전 누적값 하나와 이전 종가 하나면 끝입니다. 상태가 { o, pc } 둘뿐이고
   *    배열이 없어 "그 자리에서 고쳐 쓰기" 걱정도 없습니다.
   * ------------------------------------------------------------------- */
  function obvOne(st, close, vol) {
    var v = typeof vol === "number" && isFinite(vol) ? vol : 0;
    var o = st.o;
    if (st.pc !== null) {
      if (close > st.pc) o += v;
      else if (close < st.pc) o -= v;
    }
    return { value: st.pc === null ? null : o, state: { o: o, pc: close } };
  }

  define({
    id: "obv",
    name: "OBV",
    note: "누적거래량",
    pane: "sub",
    params: {},
    inputs: [],
    outputs: [{ key: "obv", kind: "line", color: "#9FA329", style: "solid" }],

    seed: function (bs, prm, cap) {
      var n = bs.close.length;
      var out = [];
      if (volumeAllZero(bs, "OBV")) return { obv: out };
      var st = { o: 0, pc: null };
      for (var i = 0; i < n; i++) {
        var r = obvOne(st, bs.close[i], bs.volume[i]);
        st = r.state;
        if (r.value !== null) out.push({ time: bs.time[i], value: r.value });
        if (i === n - 2) cap.state = { o: st.o, pc: st.pc };
      }
      return { obv: out };
    },

    step: function (st, bar) {
      var r = obvOne(st, bar.close, bar.volume);
      return { values: r.value === null ? {} : { obv: r.value }, state: r.state };
    }
  });

  /* -- SAR 파라볼릭 (Parabolic SAR) --------------------------------------
   * 캔들 아래에 점이 찍히면 오름세, 위에 찍히면 내림세로 읽습니다. 점이 반대쪽으로
   * 넘어가는 봉이 "뒤집힌 곳" 입니다. J. Welles Wilder 가 만든 것입니다.
   *
   * ⭐ 기본값 0.02 · 0.02 · 0.2 - 트레이딩뷰 기준입니다.
   *    (2026-09-02 · Pine 참고서 ta.sar 항목을 브라우저로 열어 읽은 원문)
   *        plot(ta.sar(0.02, 0.02, 0.2), style=plot.style_cross, linewidth=3)
   *
   * ⭐ 계산식도 같은 문서의 pine_sar() 를 ★한 줄씩 그대로★ 옮겼습니다.
   *    직접 짜면 트레이딩뷰와 값이 어긋납니다 - 특히 아래 둘이 자주 빠집니다.
   *      1) 뒤집히는 봉에서는 가속(af)을 올리지 않습니다(isFirstTrendBar)
   *      2) 나온 값을 ★직전 두 봉의 저가(또는 고가)★ 안으로 잘라 넣습니다
   *
   * ⚠️ 점입니다. 선이 아닙니다 - 트레이딩뷰가 style_cross(X 표) 로 찍습니다.
   *    lightweight-charts 5.2.0 에는 X 표가 없어 ★동그란 점★ 으로 냈습니다
   *    (kind:"dots" - 위 addSeriesFor). 선으로 이으면 뒤집히는 자리마다 캔들을
   *    가로지르는 큰 사선이 생겨서 아예 다른 그림이 됩니다.
   *
   * ⚠️ 첫 봉은 값이 없습니다(트레이딩뷰도 bar_index 1 부터 시작합니다).
   *
   * -- step 이 O(1) 인 이유 -------------------------------------------
   *    상태가 전부 숫자 하나짜리입니다 - 지금 SAR · 극값(mm) · 가속(af) ·
   *    아래냐(below) · 직전 두 봉의 고가 저가 · 직전 종가. 창을 훑지 않습니다.
   *    ⚠️ 배열이 하나도 없어서 ★진행 중인 봉으로 몇 번을 다시 불러도★ 답이
   *       같습니다(state 를 새 객체로 만들어 돌려주고 st 는 안 건드립니다).
   * ------------------------------------------------------------------- */

  /** 소수 설정값 - 없거나 이상하면 기본값으로. (SAR 의 0.02 처럼 정수가 아닌 값) */
  function fnum(v, dflt) {
    var n = typeof v === "number" ? v : parseFloat(v);
    return isFinite(n) && n > 0 ? n : dflt;
  }

  /** 봉 하나. 트레이딩뷰 pine_sar() 와 줄 순서까지 같습니다. */
  function sarOne(st, high, low, close, start, inc, mx) {
    var r = st.r, mm = st.mm, af = st.af, below = st.below;
    var first = false;
    var n = st.n;
    var value = null;

    if (n === 1) {
      /* 둘째 봉에서 방향을 정합니다 (pine - if bar_index == 1) */
      if (close > st.c1) {
        below = true;
        mm = high;
        r = st.l1;
      } else {
        below = false;
        mm = low;
        r = st.h1;
      }
      first = true;
      af = start;
    }

    if (n >= 1) {
      r = r + af * (mm - r);

      if (below) {
        if (r > low) {
          first = true;
          below = false;
          r = Math.max(high, mm);
          mm = low;
          af = start;
        }
      } else if (r < high) {
        first = true;
        below = true;
        r = Math.min(low, mm);
        mm = high;
        af = start;
      }

      if (!first) {
        if (below) {
          if (high > mm) {
            mm = high;
            af = Math.min(af + inc, mx);
          }
        } else if (low < mm) {
          mm = low;
          af = Math.min(af + inc, mx);
        }
      }

      /* ★직전 두 봉을 뚫지 못하게★ - 이걸 빼면 값이 트레이딩뷰와 어긋납니다 */
      if (below) {
        r = Math.min(r, st.l1);
        if (n > 1) r = Math.min(r, st.l2);
      } else {
        r = Math.max(r, st.h1);
        if (n > 1) r = Math.max(r, st.h2);
      }
      value = r;
    }

    return {
      value: value,
      state: {
        r: r, mm: mm, af: af, below: below, n: n + 1,
        h1: high, h2: st.h1, l1: low, l2: st.l1, c1: close
      }
    };
  }

  define({
    id: "sar",
    name: "SAR",
    note: "파라볼릭 (추세 전환점)",
    pane: "main",
    params: { start: 0.02, inc: 0.02, max: 0.2 },
    inputs: [
      { key: "start", label: "시작", type: "float", min: 0.001, max: 1 },
      { key: "inc", label: "증가", type: "float", min: 0.001, max: 1 },
      { key: "max", label: "최대", type: "float", min: 0.001, max: 1 }
    ],
    nameOf: function (prm) {
      return "SAR(" + prm.start + " · " + prm.inc + " · " + prm.max + ")";
    },
    outputs: [{ key: "sar", kind: "dots", color: "#9197F3" }],

    seed: function (bs, prm, cap) {
      var a = fnum(prm.start, 0.02), b = fnum(prm.inc, 0.02), c = fnum(prm.max, 0.2);
      var n = bs.close.length;
      var out = [];
      var st = { r: null, mm: null, af: a, below: true, n: 0, h1: null, h2: null, l1: null, l2: null, c1: null };
      for (var i = 0; i < n; i++) {
        var q = sarOne(st, bs.high[i], bs.low[i], bs.close[i], a, b, c);
        st = q.state;
        if (q.value !== null) out.push({ time: bs.time[i], value: q.value });
        if (i === n - 2) cap.state = copy(st);
      }
      return { sar: out };
    },

    step: function (st, bar, prm) {
      var q = sarOne(
        st, bar.high, bar.low, bar.close,
        fnum(prm.start, 0.02), fnum(prm.inc, 0.02), fnum(prm.max, 0.2)
      );
      return { values: q.value === null ? {} : { sar: q.value }, state: q.state };
    }
  });

  /* -- VWAP 거래량가중평균가 ---------------------------------------------
   * "오늘 이 종목을 산 사람들의 평균 매입가" 에 가장 가까운 선입니다. 거래가 많이
   * 붙은 가격일수록 무겁게 칩니다. 캔들과 같은 눈금이라 주 차트에 얹습니다.
   *
   * ⭐ 계산식 - 트레이딩뷰 도움말 VWAP 문서 그대로입니다(2026-09-02 확인)
   *        VWAP = 누적(대표가격 x 거래량) / 누적(거래량),  대표가격 = (고+저+종)/3
   *    Pine 참고서도 같습니다 - "ta.vwap - Volume Weighted Average Price.
   *    It uses hlc3 as its source series."
   *    ⭐ 값 종류는 hlc3 을 기본으로 두고 회원이 바꿀 수 있게 열어 두었습니다
   *       (도움말 - "By default, the source is hlc3, but hl2 is another common option")
   *
   * ⭐ ★하루가 바뀌면 처음부터 다시 셉니다★ - 트레이딩뷰 Anchor Period 의 기본이
   *    Session 입니다. 어제 거래를 오늘 평균에 끌고 오면 그건 VWAP 이 아닙니다.
   *    끊는 자리는 ★UTC 자정★ 입니다 - 우리 봉 시각이 바이낸스에서 오는 UTC 초라
   *    같은 자리에서 끊어야 바이낸스 화면과 맞습니다.
   *    ⚠️ 봉 간격이 1일 이상이면 봉 하나가 곧 하루라 VWAP 이 그 봉의 대표가격과
   *       같아집니다. 트레이딩뷰도 그렇습니다(그래서 일봉에서는 안 씁니다).
   *
   * ⚠️ 거래량이 0 인 봉은 평균에 아무 영향도 주지 않습니다(가중치 0). 세션 전체가
   *    0 이면 나눌 수가 없어 ★값을 안 냅니다★ - 0 이나 종가를 대신 찍어 두면
   *    회원이 그걸 VWAP 으로 믿습니다.
   *
   * -- step 이 O(1) 인 이유 -------------------------------------------
   *    상태가 { 날짜, 누적PV, 누적V } 셋뿐입니다. 날짜가 바뀌면 둘을 0 으로.
   * ------------------------------------------------------------------- */
  var DAY_SEC = 86400;

  function vwapOne(st, time, x, vol) {
    var day = Math.floor(time / DAY_SEC);
    var same = st.day === day;
    var pv = same ? st.pv : 0;
    var vv = same ? st.v : 0;
    var w = typeof vol === "number" && isFinite(vol) && vol > 0 ? vol : 0;
    pv += x * w;
    vv += w;
    return { value: vv > 0 ? pv / vv : null, state: { day: day, pv: pv, v: vv } };
  }

  define({
    id: "vwap",
    name: "VWAP",
    note: "거래량가중평균가 (하루 기준)",
    pane: "main",
    params: {},
    inputs: [],
    useSource: true,
    srcDefault: "hlc3",
    outputs: [{ key: "vwap", kind: "line", color: "#258EB1", style: "solid" }],

    seed: function (bs, prm, cap) {
      var src = bs.src || bs.close;
      var n = src.length;
      var out = [];
      if (volumeAllZero(bs, "VWAP")) return { vwap: out };
      var st = { day: null, pv: 0, v: 0 };
      for (var i = 0; i < n; i++) {
        var r = vwapOne(st, bs.time[i], src[i], bs.volume[i]);
        st = r.state;
        if (r.value !== null) out.push({ time: bs.time[i], value: r.value });
        if (i === n - 2) cap.state = { day: st.day, pv: st.pv, v: st.v };
      }
      return { vwap: out };
    },

    step: function (st, bar) {
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var r = vwapOne(st, bar.time, x, bar.volume);
      return { values: r.value === null ? {} : { vwap: r.value }, state: r.state };
    }
  });

  /* 처음 오는 회원에게 주는 기본 인스턴스 - 전부 꺼짐입니다.
     정의는 "ema" 하나인데 인스턴스가 둘입니다. 이것이 이번 증명입니다. */
  var DEFAULT_INSTANCES = [
    { def: "ema", id: "ema-9", params: { p: 9 }, colors: { ema: "#49C9E9" }, style: "solid", on: false },
    { def: "ema", id: "ema-21", params: { p: 21 }, colors: { ema: "#BA6EED" }, style: "solid", on: false }
  ];

  /* =====================================================================
   * 12. 시작
   * ===================================================================== */
  function init() {
    loadState(DEFAULT_INSTANCES);

    if (App.Bus && isFn(App.Bus.on)) {
      App.Bus.on("kline:update", onTick);
      App.Bus.on("symbol:change", scheduleResync);
      App.Bus.on("interval:change", scheduleResync);
    }

    wrapMenuBridge();
    watchMenu();

    /* 차트는 chart.js 가 나중에 만들고, 과거 캔들은 그보다 더 나중에
       도착합니다(REST 조회). 둘 다 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 200) {
        clearInterval(t); /* 10초 - 그래도 없으면 포기 */
        return;
      }
      wrapMenuBridge();
      watchMenu(); /* .chart-panel 이 늦게 생길 수 있어 여기서도 다시 겁니다 */
      if (!ensureChart()) return;
      if (!buildButtons()) return;
      if (!anyOn()) {
        clearInterval(t); /* 켜진 게 없으면 캔들을 기다릴 이유도 없음 */
        return;
      }
      var d = null;
      try {
        d = candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        startTimer();
        reseedAll();
        paintButtons();
      }
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    /* 틀 */
    define: define,
    addInstance: addInstance,
    createInstance: createInstance,
    updateInstance: updateInstance,
    resetInstance: resetInstance,
    removeInstance: removeInstance,
    listDefs: listDefs,
    listInstances: listInstances,
    inputsOf: inputsOf,
    RESERVED_IDS: RESERVED_IDS,
    suggestColor: suggestColor,
    LINE_COLORS: LINE_COLORS,
    LINE_WIDTHS: ALLOWED_WIDTHS,
    LINE_STYLES: ALLOWED_STYLES,
    SOURCES: SOURCES,
    /* 켜기 / 끄기 */
    toggle: toggle,
    setOn: setOn,
    isOn: isOn,
    /* 확인용 */
    getPerf: function () {
      return {
        ticks: perf.ticks,
        avgMs: perf.ticks ? perf.totalMs / perf.ticks : 0,
        maxMs: perf.maxMs,
        seeds: perf.seeds,
        avgSeedMs: perf.seeds ? perf.seedMs / perf.seeds : 0,
        lastSeedMs: perf.lastSeedMs
      };
    },
    resetPerf: function () {
      perf.ticks = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
      perf.seeds = 0;
      perf.seedMs = 0;
      perf.lastSeedMs = 0;
    },
    getBarsForTest: function () {
      return bars;
    },
    getInstancesForTest: function () {
      return insts;
    },
    getDefsForTest: function () {
      return defs;
    },
    /** 지금 화면에 붙어 있는 기준선 개수 - 켰다 껐다 한 뒤 0 인지 세는 용도.
     *  (끈 지표의 기준선만 남는 조용한 고장을 눈이 아니라 숫자로 잡습니다) */
    getGuideCountForTest: function () {
      var n = 0;
      for (var i = 0; i < instOrder.length; i++) {
        var L = insts[instOrder[i]].live;
        if (L && L.guides) n += L.guides.length;
      }
      return n;
    },
    onTickForTest: onTick,
    rebuildButtonsForTest: buildButtons
  };
})();
