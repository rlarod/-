/* =========================================================================
 * js/chart-drawings.js — App.ChartDrawings
 * =========================================================================
 * 차트에 "선긋기" 를 얹습니다 (4단계 1차).
 *
 * 1차에서 실제로 되는 것
 *   · 수평선 (가격 기억용)
 *   · 추세선
 *   · 텍스트
 *   · 고른 것 지우기 / 전체 지우기
 *   · 도구 막대 접기·펴기
 *   · 브라우저 저장 — 새로고침해도 남습니다 (App.Storage)
 *
 * 2차(2026-08-26)에서 연 것 — 준비중 13개 중 4개
 *   · 피보나치 되돌림 (세로 막대)
 *   · 자 — 두 점 사이 몇 % 움직였는지 (세로 막대)
 *   · 전체화면 (가로 막대)
 *   · 카메라 — 차트를 그림 파일로 (가로 막대)
 *   왜 이 넷인가 — 바이낸스 선물 차트에서 실제로 있는 도구이고, 회원이
 *   자주 쓰는 순서로 골랐습니다. 전체화면은 차트를 크게 보는 기본 동작이고,
 *   카메라는 게시판·대화방에 자랑하려고 찍는 것이며, 자와 피보나치는
 *   되돌림·목표가를 재는 데 씁니다. 만들기 쉬운 순서로 고르지 않았습니다.
 *
 * 3차(2026-08-27)에서 연 것 — fx 지표 (가로 막대)
 *   지표 계산·그리기는 이미 다 되어 있었는데 켜는 자리가 차트 왼쪽 위 작은
 *   글자 줄 하나뿐이었습니다. 목록은 js/chart-indicator-menu.js 가 만듭니다.
 *
 * 4차(2026-08-27)에서 연 것 — 돋보기 (세로 막대)
 *   두 점을 톡 찍으면 그 구간만 보이게 확대합니다. 되돌리기·전체 버튼이
 *   차트 오른쪽 아래에 나옵니다(확대한 적이 있을 때만).
 *   되돌리려면 — LEFT_TOOLS 의 zoom ready 를 false, READY_TOOLS 와 TWO_TAP 에서
 *   zoom 을 빼고, tests/chart-toolbar-seal.test.js 의 세로 준비중 4 -> 5,
 *   tests/chart-drawings.test.js 의 readyLeft 에서 ,zoom 을 지웁니다.
 *
 * 5차(2026-08-28)에서 연 것 — 브러시 (세로 막대)
 *   끌어서 자유롭게 긋습니다. 종목 + 봉 간격별로 저장되고 새로고침해도
 *   남습니다. 브러시를 켜 둔 동안에는 차트 끌기·확대를 잠그고(안 그러면
 *   그리는 대신 차트가 끌려갑니다) 폰에서 페이지가 같이 스크롤되지 않게
 *   touch-action:none 을 겁니다. 끄면 둘 다 원래대로 되돌립니다.
 *   왼쪽 아래 칩이 "브러시 · 획 n / 되돌리기 / 끝내기" 로 바뀝니다.
 *   되돌리려면 — LEFT_TOOLS 의 brush ready 를 false, READY_TOOLS 에서
 *   brush 를 빼면 끝입니다(나머지 코드는 tool 이 "brush" 일 때만 돕니다).
 *
 * 6차(2026-08-28)에서 연 것 — 여러선 = 평행 채널 (세로 막대)
 *   세 번 톡 합니다 — ① 기준선 시작 ② 기준선 끝 ③ 마주 보는 선의 자리(폭).
 *   바이낸스 선물(트레이딩뷰 모드)의 Parallel Channel 과 같은 순서·같은
 *   생김새입니다(위·아래 두 선 + 가운데 점선 + 안쪽 옅은 채움).
 *   실측은 아래 CHANNEL_WIDTH 위쪽 주석에 숫자로 적어 두었습니다.
 *   종목 + 봉 간격별로 저장됩니다(시간에 매달린 그림이라 추세선과 같습니다).
 *   되돌리려면 — LEFT_TOOLS 의 channel ready 를 false 로, label 을 "여러선"
 *   으로 되돌리고, READY_TOOLS 에서 channel 을 빼면 끝입니다
 *   (나머지 코드는 tool 이 "channel" 일 때만 돕니다).
 *   같이 되돌릴 것 — tests/chart-toolbar-seal.test.js 의 세로 준비중 3 -> 2 와
 *   남은 이름 "channel,face,wave" -> "face,wave",
 *   tests/chart-drawings.test.js 의 readyLeft 에서 channel 을 지우기.
 *
 * 7차(2026-08-28)에서 연 것 — 봉 종류 (가로 막대)
 *   캔들 / 라인 / 바 / 영역 넷입니다. 바이낸스 선물 Original 차트의
 *   Chart Style 창에 있는 것이 정확히 이 넷이라 그대로 맞췄습니다.
 *   목록·그리기는 js/chart-candle-type.js 가 합니다(캔들 시리즈를 갈아끼우지
 *   않고 색만 투명으로 만든 뒤 위에 얹는 방식이라, 이 파일이 그려 둔
 *   수평선·추세선·채널·브러시가 그대로 남습니다).
 *   되돌리려면 — TOP_TOOLS 의 candletype ready 를 false 로, onButton() 의
 *   candletype 토막을 지우면 끝입니다.
 *
 * 8차(2026-08-28)에서 맞춘 것 — 그린 선 굵기 1px -> 2px
 *   바이낸스 선물(트레이딩뷰 모드)에서 추세선·수평선·피보나치를 실제로 긋고
 *   캔버스 픽셀을 읽어 재니 전부 2px 였습니다. 우리만 1px 이라, 6차에서
 *   이미 2px 로 맞춰 둔 평행 채널과 서로 어긋나 있었습니다.
 *   자(측정)만 1px 로 남겼습니다 — 바이낸스는 그 테두리를 아예 안 긋습니다.
 *   실측표·되돌리는 법은 LINE_WIDTH / RULER_WIDTH 주석에 적었습니다.
 *   주의 — 회원이 이미 그어 둔 선도 다음에 열 때 같이 굵어집니다(의도한 것).
 *   되돌리려면 — LINE_WIDTH 를 1 로. 저장된 그림은 그대로입니다.
 *   같이 깨질 것 — tests/chart-channel-seal.test.js 의
 *   "추세선 굵기가 바이낸스와 어긋나 있다" 검사(위 236줄 주석을 봅니다).
 *   이제 어긋나 있지 않으므로 그 검사는 사실과 맞지 않습니다.
 *
 * 아직 자리만 잡아 둔 것 (4개)
 *   세로 막대 — 파동 / 표정
 *   가로 막대 — 알람 / 육각형
 *   이 버튼들은 disabled 이고 오른쪽 위에 회색 점이 붙습니다(디자인팀 규칙).
 *   눌러도 아무 일도 일어나지 않습니다. 되는 척하지 않습니다.
 *
 * ── js/chart.js 는 한 글자도 고치지 않았습니다 ────────────────────────
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두고 있어서
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 거기서 라이브러리
 * 공개 API 인 chart.panes()[n].getSeries() 로 캔들 시리즈를 찾습니다.
 * 1단계(chart-position-lines.js) · 2단계(chart-indicators.js) 와 같은 방식입니다.
 *
 * ── 껍데기는 디자인팀 것입니다 ────────────────────────────────────────
 *   생김새   css/chart-toolbar.css      (.tlc-toolbar / .tlc-body / .tlc-rail
 *                                        .tlc-btn / .tlc-ico / .tlc-sep / .tlc-spacer)
 *   아이콘   assets/icons/chart-tools.svg  (id 는 tlc-i-*)
 * 이 파일은 그 클래스와 아이콘 id 를 그대로 씁니다. 아이콘을 새로 만들지
 * 않았고, 디자인팀 파일도 고치지 않았습니다.
 *
 * 디자인팀이 정한 뼈대에 맞추려면 .chart-wrap 이 .tlc-body 안으로 들어가야
 * 합니다. index.html 의 마크업을 고치는 대신, 이 파일이 화면이 만들어질 때
 * 한 번 옮겨 넣습니다(차트가 만들어지기 전에 끝납니다).
 *
 * ── 어떻게 그리나 ─────────────────────────────────────────────────────
 * 수평선   → 캔들 시리즈의 createPriceLine (1단계에서 검증된 방법).
 *            가격축 라벨이 따라오고, 표시 통화(원/달러)는 chart.js 가 이미
 *            걸어둔 formatter 가 알아서 바꿔줍니다. 우리가 통화를 다시
 *            계산하거나 다시 그릴 일이 없습니다.
 * 추세선·텍스트 → 라이브러리 v5 의 시리즈 프리미티브(attachPrimitive).
 *            차트가 자기 화면을 다시 그릴 때 우리 그림도 같은 붓질에
 *            함께 그려집니다. 그래서 차트를 옮기거나 확대하면 선이
 *            어긋남 없이 따라옵니다(별도 캔버스를 겹쳐 그리면 한 프레임씩
 *            밀립니다 — 그래서 겹치는 방식을 쓰지 않았습니다).
 *
 * ── 성능 ──────────────────────────────────────────────────────────────
 * 시세 틱(kline:update)을 아예 듣지 않습니다. 그릴 것이 없으면 draw() 가
 * 첫 줄에서 돌아갑니다(계산 0회). 마우스가 움직여도 긋는 중이 아니면
 * 아무 일도 하지 않습니다.
 *
 * ── 어디에 저장하나 ───────────────────────────────────────────────────
 * App.Storage 키 "chart-drawings" (실제 키는 btc_sim_v2_chart-drawings).
 *   수평선        → 종목별로 저장. 봉 간격을 바꿔도 그대로 보입니다.
 *                   (수평선은 "가격" 하나만 쓰고 시간을 안 쓰기 때문입니다)
 *   추세선·텍스트 → 종목 + 봉 간격별로 저장. 그 봉에서만 보입니다.
 *                   (시간에 매달린 그림이라 1분봉에 그은 추세선을 1일봉에
 *                    그대로 옮기면 점 하나로 뭉개집니다 — 그래서 나눴습니다)
 *
 * ── 2차만 되돌리려면 ──────────────────────────────────────────────────
 *   이 파일 안에서 네 줄만 false 로 바꾸면 다시 "준비중" 으로 돌아갑니다.
 *   (LEFT_TOOLS 의 fib · ruler, TOP_TOOLS 의 fullscreen · camera 의 ready)
 *   그리고 READY_TOOLS 에서 fib · ruler 를 빼면 자판·저장까지 완전히 닫힙니다.
 *   같이 되돌릴 것 — tests/chart-toolbar-seal.test.js 의 준비중 개수(5/4 -> 7/6),
 *   tests/chart-drawings.test.js 의 readyLeft 문자열.
 *   회원이 이미 그어 둔 피보나치·자는 저장에 남지만 그리지 않습니다(조용히 무시).
 *
 * ── 2026-08-27 에 더 손본 것(둘 다 피보나치 라벨 관련) ────────────────
 *   (1) 라벨 글자 모양을 바이낸스와 같게 — fibLabel() 한 함수.
 *       예전 모양으로 돌리려면 fibLabel 의 본문을
 *       fibName(level) + "  " + priceText 로 바꾸고,
 *       tests/chart-drawings.test.js 의 "피보나치 라벨" 두 줄을 지우면 됩니다.
 *   (2) 라벨이 겹칠 때 건너뛰기 — LABEL_GAP(14). 0 으로 두면 예전처럼
 *       일곱 줄을 다 적습니다(360 에서는 서로 겹쳐 못 읽습니다).
 *   선은 어느 쪽이든 일곱 개 다 그립니다. 저장한 자료는 건드리지 않습니다.
 *
 * ── 되돌리기(4단계까지 통째로) ────────────────────────────────────────
 *   1) index.html 의 <script src="js/chart-drawings.js"></script> 한 줄 삭제
 *   2) package.json 의 tests/chart-drawings.test.js 한 토막 삭제
 *   3) js/chart-drawings.js, tests/chart-drawings.test.js 파일 삭제
 * 다른 파일은 고치지 않았습니다. 지우면 원래 화면 그대로입니다
 * (도구 막대도 이 파일이 만들기 때문에 같이 사라집니다).
 * 회원 브라우저에 남은 그림 기록은 btc_sim_v2_chart-drawings 키라
 * 그냥 남아 있어도 아무 동작도 하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartDrawings = (function () {
  "use strict";

  /* ---------------------------------------------------------------------
   * 색 — 확정 팔레트 안에서만 고릅니다.
   *   그린 선   #F0B429 포인트(골드) — 회원이 직접 만든 것
   *   고른 것   #E7ECF5 본문        — 지금 고른 그림 하나만 밝게
   * 상승 초록(#26C281)·하락 빨강(#F0506E)은 손익 전용이라 쓰지 않습니다.
   * (하락색은 청산가 선이 이미 쓰고 있어서 헷갈립니다)
   *
   * 수평선은 점선으로 긋습니다. 1단계의 "미체결 주문" 선이 같은 골드
   * 실선이라, 선 모양으로 구분되게 했습니다.
   * ------------------------------------------------------------------- */
  var COLOR_DRAW = "#F0B429";
  var COLOR_SELECTED = "#E7ECF5";
  var C_BG = "#0D1422";
  var C_CARD = "#101727";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  /* 골드 딱지 위에 얹는 어두운 글자 — "밝은 배경에는 어두운 글자" 규칙 */
  var C_INK = "#0A0F1C";
  /* 전체화면 바탕 · 저장한 그림의 바탕 (확정 팔레트의 배경색) */
  var C_PAGE = "#0A0F1C";
  /* 자(측정) 상자 안쪽 — 포인트색을 10% 만 깔았습니다.
     바이낸스는 오를 때 초록 / 내릴 때 빨강으로 칠하지만, 우리는 그 두 색을
     손익 전용으로 못 박아 두었습니다(청산가 선이 하락색을 씁니다).
     그래서 방향은 색이 아니라 화살표와 +/- 부호로 알립니다. */
  var FILL_DRAW = "rgba(240,180,41,0.10)";

  /* ---------------- 그린 선 굵기 (8차 2026-08-28) ----------------
   * 2px — 바이낸스 선물(트레이딩뷰 모드) 그리기 도구와 같은 값입니다.
   *
   * 실측 2026-08-28 · binance.com/en/futures/BTCUSDT · 1440x900 · 1D
   *   도구를 하나씩 실제로 그린 뒤 캔버스(773x252, DPR 1) 픽셀을 직접 읽어
   *   세로 한 줄씩 몇 행이 칠해졌는지 셌습니다. 눈대중이 아닙니다.
   *
   *   추세선            #2962FF   2px   216열 중 209열이 정확히 2행
   *                                     shots/ct6-bnf-trend.png
   *   수평선            #2962FF   2px   그림 설정줄에 바이낸스가 "2px" 라고
   *                                     직접 적어 줍니다 shots/ct6-bnf-hline.png
   *   피보나치 눈금 7개  눈금마다 다름  2px   y 81·112·131·146·161·183·211 에서
   *                                     전부 2행 shots/ct6-bnf-fib.png
   *   피보나치 안내선    #808080   2px   대각 점선, y 190~191 (2행)
   *   평행 채널 위·아래  #2962FF   2px   6차에서 이미 맞춰 둔 값과 같음
   *
   * 즉 바이낸스는 그리기 도구를 전부 2px 로 긋습니다. 도구마다 다르지 않습니다.
   * 우리만 1px 이라 6차에서 맞춘 평행 채널(2px)과 서로 어긋나 있었습니다.
   *
   * 색은 그대로 둡니다 — #2962FF 파랑은 확정 팔레트에 없습니다.
   * 우리는 그린 것을 전부 포인트 금색(#F0B429) 하나로 씁니다.
   *
   * 주의 — 회원이 이미 그어 둔 선도 다음에 열 때 같이 굵어집니다. 의도한 것입니다
   *    (굵기를 저장하지 않고 그릴 때마다 이 값을 씁니다).
   *
   * 되돌리려면 — 이 값을 1 로 되돌리면 끝입니다. 저장된 그림은 그대로입니다.
   * ------------------------------------------------------------- */
  var LINE_WIDTH = 2;

  /* 자(측정)만 1px 로 남깁니다.
     바이낸스 자(Measure)는 테두리를 아예 긋지 않습니다 — 파란 채움 20% 와
     말풍선만 있습니다(2026-08-28 실측: 상자 위끝 y=122 에서 테두리 없이
     바로 채움색 27,41,77 로 들어갑니다. shots/ct6-bnf-ruler.png).
     우리는 채움이 10% 라 테두리를 없애면 상자가 잘 안 보입니다. 그래서
     테두리는 남기되, 없는 쪽에 가까운 가장 얇은 1px 로 둡니다.
     여기를 LINE_WIDTH 로 바꾸면 바이낸스(0px)와 더 멀어집니다. */
  var RULER_WIDTH = 1;

  var HIT_PX = 7; /* 이 거리 안에서 누르면 그 그림을 고른 것으로 봅니다 */

  /* ---------------- 브러시 (5차 2026-08-28) ----------------
   * 굵기 2px — 바이낸스(트레이딩뷰 모드) 브러시 기본값과 같습니다.
   *   실측 2026-08-26 shots/bnf-tv-1440.png 의 도구 설정칸 "2".
   * BRUSH_MIN_PX  이만큼 움직여야 점을 하나 더 찍습니다. 손이 떨리는 만큼
   *               전부 찍으면 한 획이 수천 점이 되어 저장이 커집니다.
   * BRUSH_MAX_PTS 한 획의 점 상한. 넘으면 더 안 찍고 그리기만 이어갑니다
   *               (획이 끊기면 회원이 고장으로 봅니다).
   * ------------------------------------------------------- */
  var BRUSH_WIDTH = 2;
  var BRUSH_MIN_PX = 2.5;
  var BRUSH_MAX_PTS = 600;

  /* ---------------- 여러선 = 평행 채널 (6차 2026-08-28) ----------------
   * 바이낸스 실측 (2026-08-28 · binance.com/en/futures/BTCUSDT · 1440px · 1D
   *              · Trading View 모드 · shots/ct4-bnf-channel.png 픽셀 측정)
   *   위·아래 선  #2962FF, 굵기 2px  (x=470 에서 y 377~379 / 447~449)
   *   가운데 선   같은 색 점선, 실측 4px 긋고 6px 띄움 (주기 10px)
   *   안쪽 채움   같은 색 20%  (바깥 24,26,32 -> 안쪽 27,41,77 로 계산 0.20)
   *   두 선 간격  x=470 에서 70px · x=520 에서 69px  (평행 확인)
   *   만드는 법   세 번 톡 (기준선 두 점 + 폭 한 점)
   *
   * 우리 값과 다른 곳 — 색만 다릅니다. 파랑은 확정 팔레트에 없습니다.
   *   선 색  #F0B429 (포인트) — 회원이 그린 것은 전부 이 색입니다
   *   굵기   2px — 바이낸스와 같게 맞췄습니다
   *          ※ 2026-08-28 8차에서 나머지 그리기 도구(LINE_WIDTH)도 전부
   *            2px 로 올려, 이제 채널과 서로 어긋나지 않습니다.
   *            그 전에는 여기만 2px 이고 나머지는 1px 이었습니다.
   *            실측표는 위 LINE_WIDTH 주석에 도구별로 적어 두었습니다.
   *   채움   금색 10% (FILL_DRAW · 자 상자와 같은 값). 바이낸스는 20% 인데
   *          금색은 파랑보다 밝아 20% 면 채널 안 캔들이 묻힙니다.
   *          20% 로 되돌리려면 아래 FILL_CHANNEL 을 따로 만들어 0.20 으로.
   * ------------------------------------------------------------------- */
  var CHANNEL_WIDTH = 2;
  var CHANNEL_DASH = [4, 6];
  var FILL_CHANNEL = FILL_DRAW;

  var STORAGE_KEY = "chart-drawings";
  var STORE_VERSION = 1;
  var SPRITE_URL = "assets/icons/chart-tools.svg";
  var RAIL_AUTO_WIDTH = 768; /* 디자인팀 CSS 의 폰 기준과 같은 값 */

  /* ---------------------------------------------------------------------
   * 도구 목록
   *   icon  — 디자인팀 스프라이트의 id (assets/icons/chart-tools.svg)
   *   ready — false 면 자리만. disabled 라 눌러도 아무 일이 없습니다.
   * ------------------------------------------------------------------- */
  var LEFT_TOOLS = [
    { k: "cursor", icon: "tlc-i-cursor", label: "커서", ready: true },
    { k: "sep1", sep: true },
    { k: "trend", icon: "tlc-i-trendline", label: "추세선", ready: true },
    { k: "hline", icon: "tlc-i-hline", label: "수평선", ready: true },
    { k: "fib", icon: "tlc-i-fib", label: "피보나치 되돌림", ready: true },
    { k: "wave", icon: "tlc-i-wave", label: "파동", ready: false },
    /* 6차(2026-08-28) — 여러선(평행 채널)을 열었습니다. 되돌리려면 이 줄의
       ready 를 false 로, label 을 "여러선" 으로 되돌립니다.
       (같이 되돌릴 것 — READY_TOOLS 의 channel, THREE_TAP) */
    { k: "channel", icon: "tlc-i-channel", label: "여러선 (평행 채널 · 세 번 톡)", ready: true },
    /* 5차(2026-08-28) — 브러시를 열었습니다. 되돌리려면 이 줄의 ready 를 false 로.
       (같이 되돌릴 것 — READY_TOOLS 의 brush) */
    { k: "brush", icon: "tlc-i-brush", label: "브러시 (끌어서 자유롭게)", ready: true },
    { k: "sep2", sep: true },
    { k: "text", icon: "tlc-i-text", label: "텍스트", ready: true },
    { k: "face", icon: "tlc-i-face", label: "표정", ready: false },
    { k: "sep3", sep: true },
    { k: "ruler", icon: "tlc-i-ruler", label: "자 (두 점 사이 측정)", ready: true },
    /* 4차(2026-08-27) — 돋보기를 열었습니다. 되돌리려면 이 줄의 ready 를 false 로.
       (같이 되돌릴 것 — READY_TOOLS 의 zoom, TWO_TAP 의 zoom) */
    { k: "zoom", icon: "tlc-i-zoom", label: "돋보기 (두 점 사이 확대)", ready: true }
  ];

  var TOP_TOOLS = [
    { k: "expand", icon: "tlc-i-chevron", label: "도구 막대 접기/펴기", ready: true },
    { k: "sep1", sep: true },
    /* 7차(2026-08-28) — 봉 종류를 열었습니다. 되돌리려면 이 줄의 ready 를 false 로.
       목록은 js/chart-candle-type.js 가 만듭니다(캔들/라인/바/영역 넷).
       (같이 되돌릴 것 — onButton() 의 candletype 토막) */
    { k: "candletype", icon: "tlc-i-candle", label: "봉 종류", ready: true },
    /* 3차(2026-08-27) — fx 를 열었습니다. 되돌리려면 이 줄의 ready 를 false 로.
       목록 자체는 js/chart-indicator-menu.js 가 만듭니다. */
    { k: "fx", icon: "tlc-i-fx", label: "fx 지표", ready: true },
    { k: "alert", icon: "tlc-i-alarm", label: "알람", ready: false },
    /* 9차(2026-08-28) — 육각형을 열었습니다. 바이낸스 Original 차트에서 이
       아이콘의 이름표가 "Chart Style"(차트 스타일) 이었습니다(실측).
       창은 js/chart-style.js 가 만듭니다. 되돌리려면 이 줄의 ready 를 false,
       label 을 "육각형" 으로 되돌리고 onButton() 의 hex 토막을 지웁니다. */
    { k: "hex", icon: "tlc-i-hexagon", label: "차트 스타일 (봉 색·격자선)", ready: true },
    { k: "spacer", spacer: true },
    { k: "fullscreen", icon: "tlc-i-fullscreen", label: "전체화면", ready: true },
    { k: "camera", icon: "tlc-i-camera", label: "카메라 (차트 그림 저장)", ready: true }
  ];

  /* 실제로 그릴 수 있는 도구 (나머지는 고를 수조차 없습니다) */
  var READY_TOOLS = { cursor: 1, trend: 1, hline: 1, text: 1, fib: 1, ruler: 1, zoom: 1, brush: 1, channel: 1 };

  /* 두 점을 찍어 "그림으로 남는" 도구 — 저장되고 나중에 다시 그려집니다 */
  var TWO_POINT = { trend: 1, fib: 1, ruler: 1 };

  /* 두 번 톡 해서 쓰는 도구 전부 (미리보기·취소가 같은 방식으로 돕니다).
     돋보기는 그림으로 남지 않아서 TWO_POINT 에는 넣지 않았습니다 —
     찍고 나면 화면만 확대되고 저장에는 아무것도 안 들어갑니다. */
  var TWO_TAP = { trend: 1, fib: 1, ruler: 1, zoom: 1 };

  /* 세 번 톡 해서 만드는 도구 — 두 점으로 기준선을 긋고, 세 번째 점이 폭을
     정합니다. 바이낸스(트레이딩뷰 모드) 평행 채널과 같은 순서입니다. */
  var THREE_TAP = { channel: 1 };

  /* 피보나치 되돌림 눈금 — 바이낸스 선물(트레이딩뷰 모드) 기본값 그대로입니다.
     2026-08-26 실측(binance.com/en/futures/BTCUSDT, 1440px, Trading View 모드):
       눈금 0 / 0.236 / 0.382 / 0.5 / 0.618 / 0.786 / 1
       라벨 "0.236 (75,314.00)" — 눈금 다음에 그 자리의 가격
       선은 찍은 두 점 사이에만 긋고 오른쪽으로 늘리지 않습니다
       0 은 나중에 찍은 점, 1 은 먼저 찍은 점 (아래 fibPrice 와 같습니다) */
  var FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

  /* 피보나치 눈금 글자끼리 이만큼은 떨어져 있어야 적습니다 (2026-08-27).
     글자 크기 12px + 위아래 1px = 14px 이면 서로 닿습니다. 360 폰에서 실제로
     네 줄이 겹쳐 못 읽었습니다. 이보다 좁으면 그 줄의 글자는 건너뜁니다. */
  var LABEL_GAP = 14;

  /* ---------------- 상태 ---------------- */
  var chart = null;
  var series = null;
  var panel = null; /* .chart-panel */
  var wrap = null; /* .chart-wrap */
  var container = null; /* #chart_container */

  var tool = "cursor";
  var store = null; /* { v, ui:{rail}, bySymbol:{ SYM:{ hlines:[], byInterval:{ IV:[] } } } } */

  var pending = null; /* 추세선 첫 점 {t,p} */
  var chanBase = null; /* 여러선 — 다 그은 기준선 {t1,p1,t2,p2}. 세 번째 점(폭)을 기다립니다 */
  var stroke = null; /* 브러시로 지금 긋고 있는 획 { pts:[{t,p}], lastX, lastY } */
  var brushSaved = null; /* 브러시를 켜기 전 차트 옵션 (끌어 옮기기/확대) */
  var brushTouch = null; /* 브러시를 켜기 전 컨테이너의 touch-action */
  var hover = null; /* 미리보기용 현재 위치 {t,p} */
  var selected = null; /* { kind:"hline"|"shape", id } */

  var priceLines = {}; /* 수평선 id -> IPriceLine */
  var requestUpdate = null; /* 프리미티브가 준 "다시 그려줘" 함수 */

  var els = {}; /* 만들어 둔 DOM */
  var toastTimer = null;
  var seq = 0;

  /* 시간축 환산에 쓰는 정보 — 그릴 것이 있을 때만 갱신합니다 */
  var meta = { first: null, last: null, count: 0, bar: 60, at: 0 };

  /* 캔들 판의 높이 — 돋보기 띠를 위아래 끝까지 그리는 데 씁니다 */
  var paneH = 0;

  /* 성능 측정 — App.ChartDrawings.getPerf() */
  var perf = { draws: 0, skipped: 0, totalMs: 0, maxMs: 0, shapes: 0 };

  function LC() {
    return window.LightweightCharts;
  }
  function nowMs() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }
  function sym() {
    try {
      return App.Config.getActiveSymbol();
    } catch (e) {
      return "BTCUSDT";
    }
  }
  function iv() {
    try {
      return App.Config.getActiveInterval();
    } catch (e) {
      return "1m";
    }
  }
  function newId() {
    seq++;
    return "d" + Date.now().toString(36) + seq.toString(36);
  }

  /* ---------------------------------------------------------------------
   * 표시 통화(달러/원)를 따라가는 가격 글자.
   * 캔들 값은 언제나 USDT 인데 회원이 보는 통화는 사람마다 다르고 도중에
   * 바뀝니다. 우리가 환율을 다시 계산하지 않고 App.Utils 에 그대로 맡깁니다
   * (계산이 두 벌이 되면 어긋납니다). 통화가 바뀌면 currency:change 를 받아
   * 다시 그립니다.
   * ------------------------------------------------------------------- */
  function fmtPrice(usd) {
    try {
      if (App.Utils && typeof App.Utils.formatCurrencyPlain === "function") {
        return App.Utils.formatCurrencyPlain(usd);
      }
    } catch (e) {
      /* 아래 기본 표기로 */
    }
    return String(Math.round(usd * 100) / 100);
  }

  /** 걸린 시간을 사람 말로 (바이낸스는 "33 bars, 33d" 로 적습니다) */
  function fmtSpan(sec) {
    var v = Math.abs(Math.round(sec));
    var d = Math.floor(v / 86400);
    var h = Math.floor((v % 86400) / 3600);
    var m = Math.floor((v % 3600) / 60);
    if (d) return d + "일" + (h ? " " + h + "시간" : "");
    if (h) return h + "시간" + (m ? " " + m + "분" : "");
    return m + "분";
  }

  /** 눈금 이름 — 0.500 이 아니라 0.5 로 */
  function fibName(level) {
    return level.toFixed(3).replace(/0+$/, "").replace(/[.]$/, "");
  }

  /** 그 눈금의 가격. 0 = 나중에 찍은 점, 1 = 먼저 찍은 점 (바이낸스와 같습니다) */
  function fibPrice(shape, level) {
    return shape.p2 + (shape.p1 - shape.p2) * level;
  }

  /* 눈금 라벨 — 바이낸스와 글자 모양까지 같게 (2026-08-27)
     바이낸스 실측: `0.236 (75,314.00)` — 눈금, 한 칸, 괄호 안에 그 자리의 가격.
     shots/bnf-fib-crop.png 에 그대로 찍혀 있습니다.
     처음(2026-08-26)에는 괄호 없이 두 칸을 띄웠는데, 바이낸스와 나란히 놓고
     보니 다르게 읽혀서 괄호로 맞췄습니다. 가격은 회원이 보는 통화를
     따라갑니다(원으로 보는 회원은 `0.236 (118,133,215원)`). */
  function fibLabel(level, priceText) {
    return fibName(level) + " (" + priceText + ")";
  }

  /* =====================================================================
   * 저장 — App.Storage
   * ===================================================================== */
  function emptyStore() {
    return { v: STORE_VERSION, ui: {}, bySymbol: {} };
  }

  function loadStore() {
    var s = null;
    try {
      if (App.Storage && typeof App.Storage.load === "function") s = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      s = null;
    }
    if (!s || typeof s !== "object" || s.v !== STORE_VERSION || !s.bySymbol) return emptyStore();
    if (!s.ui) s.ui = {};
    return s;
  }

  function saveStore() {
    try {
      if (App.Storage && typeof App.Storage.save === "function") App.Storage.save(STORAGE_KEY, store);
    } catch (e) {
      /* 저장이 안 돼도 화면은 그대로 씁니다 */
    }
  }

  function bucket(symbol) {
    if (!store) store = emptyStore();
    if (!store.bySymbol[symbol]) store.bySymbol[symbol] = { hlines: [], byInterval: {} };
    var b = store.bySymbol[symbol];
    if (!b.hlines) b.hlines = [];
    if (!b.byInterval) b.byInterval = {};
    return b;
  }

  /** 지금 보고 있는 종목의 수평선들 (봉 간격과 무관) */
  function hlines() {
    return bucket(sym()).hlines;
  }

  /** 지금 보고 있는 종목 + 봉 간격의 추세선·텍스트 */
  function shapes() {
    var b = bucket(sym());
    var key = iv();
    if (!b.byInterval[key]) b.byInterval[key] = [];
    return b.byInterval[key];
  }

  function countAll() {
    return hlines().length + shapes().length;
  }

  /* =====================================================================
   * 차트 찾기 — chart.js 를 고치지 않고 공개 API 로만
   * ===================================================================== */
  function ensureSeries() {
    if (series && chart) return true;
    if (!App.ChartFont || typeof App.ChartFont.getCharts !== "function") return false;
    var list = App.ChartFont.getCharts();
    if (!list || !list.length) return false;
    chart = list[0];
    try {
      if (typeof chart.panes !== "function") return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (typeof panes[i].getSeries !== "function") continue;
        var ss = panes[i].getSeries();
        for (var j = 0; j < ss.length; j++) {
          if (ss[j].seriesType && ss[j].seriesType() === "Candlestick") {
            series = ss[j];
            return true;
          }
        }
      }
    } catch (e) {
      console.warn("[chart-drawings.js] 캔들 시리즈를 찾지 못했습니다:", e);
    }
    return false;
  }

  /* =====================================================================
   * 좌표 바꾸기
   *   가격 <-> y : 시리즈가 그대로 해줍니다
   *   시간 <-> x : 봉 시각이면 timeToCoordinate 가 정확합니다.
   *                데이터 범위 밖(맨 왼쪽보다 과거 / 마지막 봉보다 미래)이면
   *                봉 간격이 일정하다는 성질로 논리 번호를 계산해 씁니다.
   *                (암호화폐는 24시간 내내 봉이 끊기지 않습니다)
   * ===================================================================== */
  function refreshMeta(force) {
    if (!series) return;
    var t = nowMs();
    if (!force && t - meta.at < 2000) return; /* 2초에 한 번이면 충분합니다 */
    var d;
    try {
      d = series.data();
    } catch (e) {
      return;
    }
    meta.at = t;
    if (!d || !d.length) {
      meta.count = 0;
      meta.first = null;
      meta.last = null;
      return;
    }
    meta.count = d.length;
    meta.first = d[0].time;
    meta.last = d[d.length - 1].time;
    if (d.length > 1) {
      var bar = Math.round((meta.last - meta.first) / (d.length - 1));
      if (bar > 0) meta.bar = bar;
    }
  }

  function timeToX(time) {
    if (!chart) return null;
    var ts;
    try {
      ts = chart.timeScale();
    } catch (e) {
      return null;
    }
    if (meta.first !== null && time >= meta.first && time <= meta.last) {
      var c = ts.timeToCoordinate(time);
      if (c !== null && c !== undefined) return c;
    }
    if (meta.first === null || !meta.bar) return null;
    var x = ts.logicalToCoordinate((time - meta.first) / meta.bar);
    return x === null || x === undefined ? null : x;
  }

  /** 누른 자리를 우리가 저장할 시각으로 바꿉니다 — 봉에 붙습니다 */
  function pointToTime(param) {
    if (param && typeof param.time === "number") return param.time;
    if (!param || typeof param.logical !== "number") return null;
    refreshMeta(false);
    if (meta.first === null) return null;
    return Math.round(meta.first + param.logical * meta.bar);
  }

  function priceToY(price) {
    try {
      var y = series.priceToCoordinate(price);
      return y === null || y === undefined ? null : y;
    } catch (e) {
      return null;
    }
  }

  function yToPrice(y) {
    try {
      var p = series.coordinateToPrice(y);
      return p === null || p === undefined ? null : p;
    } catch (e) {
      return null;
    }
  }

  /* =====================================================================
   * 그리기 — 라이브러리가 자기 화면을 그릴 때 같이 불립니다
   * ===================================================================== */
  function textFont() {
    var fam = "sans-serif";
    try {
      if (App.ChartFont && App.ChartFont.getSiteFontFamily) {
        var f = App.ChartFont.getSiteFontFamily();
        if (f) fam = f;
      }
    } catch (e) {
      /* 기본 글꼴 */
    }
    return "12px " + fam;
  }

  function handle(ctx, x, y) {
    ctx.fillStyle = COLOR_SELECTED;
    ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
  }

  /* ---------------------------------------------------------------------
   * 골드 딱지 — 밝은 바탕에 어두운 글자 (확정 팔레트 규칙)
   * 바이낸스는 파란 딱지(#2962FF, 글자 #FAFBFF)를 쓰는데, 그 파랑은 우리
   * 팔레트에 없어서 포인트색으로 대신했습니다. 자리·크기는 같습니다.
   * ------------------------------------------------------------------- */
  function chipText(ctx, x, y, lines, center) {
    var padX = 5;
    var lh = 14;
    var w = 0;
    var i;
    ctx.font = textFont();
    ctx.textBaseline = "middle";
    for (i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
    var bw = Math.round(w + padX * 2);
    var bh = lines.length * lh + 6;
    var bx = Math.round(center ? x - bw / 2 : x);
    var by = Math.round(y - bh);
    ctx.fillStyle = COLOR_DRAW;
    ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = C_INK;
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], bx + padX, by + 3 + lh * i + lh / 2);
  }

  /* ---------------- 피보나치 되돌림 ---------------- */
  function drawFib(ctx, s, on, preview) {
    var x1 = timeToX(s.t1);
    var x2 = timeToX(s.t2);
    var y1 = priceToY(s.p1);
    var y2 = priceToY(s.p2);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;
    var color = on ? COLOR_SELECTED : COLOR_DRAW;
    var left = Math.min(x1, x2);
    var right = Math.max(x1, x2);
    var i;
    var lastLabelY = null;

    /* 두 점을 잇는 안내선 — 바이낸스도 점선으로 그립니다 */
    ctx.strokeStyle = color;
    ctx.lineWidth = LINE_WIDTH;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    for (i = 0; i < FIB_LEVELS.length; i++) {
      var level = FIB_LEVELS[i];
      var price = fibPrice(s, level);
      var y = priceToY(price);
      if (y === null) continue;
      var edge = level === 0 || level === 1; /* 양 끝 두 줄만 실선 */
      ctx.strokeStyle = color;
      ctx.lineWidth = on ? LINE_WIDTH + 1 : LINE_WIDTH;
      ctx.setLineDash(edge ? [] : [4, 3]);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(right, y);
      ctx.stroke();
      if (preview) continue;
      /* 라벨이 서로 겹치면 아래 것만 남깁니다 (2026-08-27, 360 에서 확인)
         짧게 그은 피보나치는 눈금 7개가 좁게 몰려서, 360 폰에서 글자 네 줄이
         서로 걸쳐 하나도 못 읽는 상태가 됐습니다(실측 — 줄 간격 14px 에
         글자 높이 12px). 바이낸스는 화면이 넓어 이 일이 잘 안 생깁니다.
         선은 7개 다 그대로 긋고, 읽을 수 없게 겹치는 글자만 뺍니다. */
      if (lastLabelY !== null && Math.abs(y - lastLabelY) < LABEL_GAP) continue;
      lastLabelY = y;
      /* 라벨은 선 왼쪽 끝 위. 자리가 모자라면(원화는 글자가 깁니다) 안쪽으로 넣습니다 */
      ctx.font = textFont();
      ctx.textBaseline = "bottom";
      var txt = fibLabel(level, fmtPrice(price));
      var tw = ctx.measureText(txt).width;
      var tx = left - tw - 4;
      if (tx < 2) tx = left + 4;
      ctx.fillStyle = color;
      ctx.fillText(txt, tx, y - 2);
    }
    ctx.setLineDash([]);
    if (on) {
      handle(ctx, x1, y1);
      handle(ctx, x2, y2);
    }
  }

  /* ---------------- 자(측정) ----------------
   * 바이낸스 실측(2026-08-26): 두 점 사이를 상자로 덮고 그 위에 딱지를 얹어
   *   "14,629.50 (23.88%)" / "33 bars, 33d" / "Vol 4.9M" 세 줄을 적습니다.
   * 우리는 앞의 두 줄을 그대로 씁니다. 거래량 줄은 넣지 않았습니다 — 캔들
   * 시리즈에는 거래량이 없고(따로 있는 시리즈입니다) 없는 값을 지어내지
   * 않으려고 뺐습니다.
   * ------------------------------------------------------------------- */
  function drawRuler(ctx, s, on, preview) {
    var x1 = timeToX(s.t1);
    var x2 = timeToX(s.t2);
    var y1 = priceToY(s.p1);
    var y2 = priceToY(s.p2);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;
    var color = on ? COLOR_SELECTED : COLOR_DRAW;
    var l = Math.min(x1, x2);
    var r = Math.max(x1, x2);
    var t = Math.min(y1, y2);
    var b = Math.max(y1, y2);

    ctx.fillStyle = FILL_DRAW;
    ctx.fillRect(l, t, r - l, b - t);
    ctx.strokeStyle = color;
    /* 자만 RULER_WIDTH — 바이낸스에는 이 테두리가 아예 없습니다(위 주석 참고) */
    ctx.lineWidth = on ? RULER_WIDTH + 1 : RULER_WIDTH;
    ctx.setLineDash(preview ? [4, 4] : []);
    ctx.strokeRect(l + 0.5, t + 0.5, Math.max(0, r - l - 1), Math.max(0, b - t - 1));
    ctx.setLineDash([]);

    /* 가운데 화살표 — 어느 쪽으로 움직였는지 (색으로 알리지 않습니다) */
    var cx = Math.round((l + r) / 2);
    var up = y2 <= y1 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx, y1);
    ctx.lineTo(cx, y2);
    ctx.moveTo(cx - 4, y2 + up * 6);
    ctx.lineTo(cx, y2);
    ctx.lineTo(cx + 4, y2 + up * 6);
    ctx.stroke();

    var diff = s.p2 - s.p1;
    var pct = s.p1 ? (diff / s.p1) * 100 : 0;
    var sign = diff >= 0 ? "+" : "-";
    var bars = meta.bar ? Math.abs(Math.round((s.t2 - s.t1) / meta.bar)) : 0;
    chipText(
      ctx,
      cx,
      t - 4,
      [sign + fmtPrice(Math.abs(diff)) + "  (" + sign + Math.abs(pct).toFixed(2) + "%)",
        bars + "봉 · " + fmtSpan(s.t2 - s.t1)],
      true
    );
    if (on) {
      handle(ctx, x1, y1);
      handle(ctx, x2, y2);
    }
  }

  /* ---------------- 돋보기 미리보기 ----------------
   * 찍은 두 시각 사이를 세로 띠로 덮습니다. 가로(시간)만 확대되기 때문에
   * 상자 대신 띠로 그립니다 — 세로로 자른 것처럼 보이면 "위아래도 잘린다"고
   * 오해합니다. 가격 눈금은 라이브러리가 그 구간에 맞춰 알아서 다시 잡습니다
   * (js/chart.js 는 autoScale 을 끄지 않았습니다).
   * 바이낸스(트레이딩뷰 모드) 돋보기는 끌어서 네모를 그리는 방식인데, 우리는
   * 끌기를 차트 이동에 쓰고 있어서 다른 두 점 도구와 같이 "톡 두 번" 입니다.
   * ------------------------------------------------------------------- */
  function drawZoomBand(ctx, s) {
    var x1 = timeToX(s.t1);
    var x2 = timeToX(s.t2);
    if (x1 === null || x2 === null) return;
    var l = Math.min(x1, x2);
    var r = Math.max(x1, x2);
    var h = paneH || 0;
    ctx.fillStyle = FILL_DRAW;
    ctx.fillRect(l, 0, r - l, h);
    ctx.strokeStyle = COLOR_DRAW;
    ctx.lineWidth = LINE_WIDTH;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(l + 0.5, 0);
    ctx.lineTo(l + 0.5, h);
    ctx.moveTo(r - 0.5, 0);
    ctx.lineTo(r - 0.5, h);
    ctx.stroke();
    ctx.setLineDash([]);
    var bars = meta.bar ? Math.abs(Math.round((s.t2 - s.t1) / meta.bar)) : 0;
    if (bars > 0) chipText(ctx, Math.round((l + r) / 2), 20, [bars + "봉"], true);
  }

  /* ---------------- 브러시 한 획 ----------------
   * 점을 시각·가격으로 저장해 두었으므로, 차트를 옮기거나 확대해도 봉에
   * 붙어서 같이 움직입니다(화면 좌표로 저장하면 어긋납니다).
   * 화면 밖으로 완전히 벗어난 획은 선을 긋지 않고 건너뜁니다.
   * ------------------------------------------------------- */
  function drawBrush(ctx, s, on, preview) {
    var pts = s.pts;
    if (!pts || pts.length < 2) return;
    var i;
    var xs = [];
    var ys = [];
    var minX = Infinity;
    var maxX = -Infinity;
    for (i = 0; i < pts.length; i++) {
      var x = timeToX(pts[i].t);
      var y = priceToY(pts[i].p);
      xs.push(x);
      ys.push(y);
      if (x !== null) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (minX === Infinity) return;
    /* 판 밖으로 완전히 나간 획은 그리지 않습니다 */
    var w = 0;
    try {
      w = chart ? chart.timeScale().width() : 0;
    } catch (e) {
      w = 0;
    }
    if (w && (maxX < -8 || minX > w + 8)) return;

    ctx.strokeStyle = on ? COLOR_SELECTED : COLOR_DRAW;
    ctx.lineWidth = on ? BRUSH_WIDTH + 1 : BRUSH_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.setLineDash(preview ? [] : []);
    ctx.beginPath();
    var started = false;
    for (i = 0; i < pts.length; i++) {
      if (xs[i] === null || ys[i] === null) {
        started = false;
        continue;
      }
      if (!started) {
        ctx.moveTo(xs[i], ys[i]);
        started = true;
      } else {
        ctx.lineTo(xs[i], ys[i]);
      }
    }
    ctx.stroke();
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineJoin = "miter";
    ctx.lineCap = "butt";
    if (on) {
      if (xs[0] !== null && ys[0] !== null) handle(ctx, xs[0], ys[0]);
      var last = pts.length - 1;
      if (xs[last] !== null && ys[last] !== null) handle(ctx, xs[last], ys[last]);
    }
  }

  /* ---------------- 그림 하나 ---------------- */
  /* =====================================================================
   * 여러선 = 평행 채널 (6차 2026-08-28)
   * ---------------------------------------------------------------------
   * 저장 모양 { id, type:"channel", t1,p1, t2,p2, dp }
   *   t1,p1 ~ t2,p2  기준선 두 점 (첫 번째 · 두 번째 톡)
   *   dp             마주 보는 선까지의 "가격 차이" (세 번째 톡)
   * 왜 픽셀이 아니라 가격으로 저장하나 — 화면을 확대·축소하면 픽셀 간격은
   * 달라져야 맞습니다. 가격 차이로 들고 있으면 어느 배율에서도 같은 폭을
   * 가리킵니다(추세선을 t,p 로 저장하는 것과 같은 이유입니다).
   * ===================================================================== */

  /** 두 점을 잇는 직선의 x 자리 높이 (픽셀) */
  function lineYAt(x1, y1, x2, y2, x) {
    if (x2 === x1) return y1;
    return y1 + ((y2 - y1) * (x - x1)) / (x2 - x1);
  }

  /** 기준선에서 (t,p) 까지 떨어진 "가격 차이". 못 재면 null */
  function chanOffset(base, t, p) {
    var x1 = timeToX(base.t1);
    var x2 = timeToX(base.t2);
    var y1 = priceToY(base.p1);
    var y2 = priceToY(base.p2);
    var x = timeToX(t);
    if (x1 === null || x2 === null || y1 === null || y2 === null || x === null) return null;
    var pb = yToPrice(lineYAt(x1, y1, x2, y2, x));
    if (pb === null) return null;
    return p - pb;
  }

  function drawChannel(ctx, s, on, preview) {
    var color = on ? COLOR_SELECTED : COLOR_DRAW;
    var dp = s.dp || 0;
    var x1 = timeToX(s.t1);
    var x2 = timeToX(s.t2);
    var y1 = priceToY(s.p1);
    var y2 = priceToY(s.p2);
    var b1 = priceToY(s.p1 + dp);
    var b2 = priceToY(s.p2 + dp);
    var m1 = priceToY(s.p1 + dp / 2);
    var m2 = priceToY(s.p2 + dp / 2);
    if (x1 === null || x2 === null || y1 === null || y2 === null) return;
    if (b1 === null || b2 === null || m1 === null || m2 === null) return;

    /* 안쪽 채움 먼저 — 선이 채움 위로 올라와야 또렷합니다 */
    ctx.fillStyle = FILL_CHANNEL;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2, b2);
    ctx.lineTo(x1, b1);
    ctx.closePath();
    ctx.fill();

    /* 위·아래 두 선 */
    ctx.strokeStyle = color;
    ctx.lineWidth = on ? CHANNEL_WIDTH + 1 : CHANNEL_WIDTH;
    ctx.setLineDash(preview ? [4, 4] : []);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x1, b1);
    ctx.lineTo(x2, b2);
    ctx.stroke();

    /* 가운데 선 — 바이낸스처럼 점선 한 줄 */
    ctx.lineWidth = 1;
    ctx.setLineDash(CHANNEL_DASH);
    ctx.beginPath();
    ctx.moveTo(x1, m1);
    ctx.lineTo(x2, m2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (on) {
      handle(ctx, x1, y1);
      handle(ctx, x2, y2);
      handle(ctx, x1, b1);
      handle(ctx, x2, b2);
    }
  }

  function drawOne(ctx, s, on, preview) {
    var color = on ? COLOR_SELECTED : COLOR_DRAW;

    if (s.type === "trend") {
      var x1 = timeToX(s.t1);
      var x2 = timeToX(s.t2);
      var y1 = priceToY(s.p1);
      var y2 = priceToY(s.p2);
      if (x1 === null || x2 === null || y1 === null || y2 === null) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = on ? LINE_WIDTH + 1 : LINE_WIDTH;
      ctx.setLineDash(preview ? [4, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (on) {
        handle(ctx, x1, y1);
        handle(ctx, x2, y2);
      }
      return;
    }

    if (s.type === "text") {
      var tx = timeToX(s.t);
      var ty = priceToY(s.p);
      if (tx === null || ty === null) return;
      ctx.fillStyle = color;
      ctx.font = textFont();
      ctx.textBaseline = "middle";
      ctx.fillText(s.s, tx + 5, ty);
      if (on) {
        var w = ctx.measureText(s.s).width;
        ctx.strokeStyle = COLOR_SELECTED;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(tx + 2, ty - 9, w + 6, 18);
        ctx.setLineDash([]);
      }
      return;
    }

    if (s.type === "brush") {
      drawBrush(ctx, s, on, preview);
      return;
    }
    if (s.type === "channel") {
      drawChannel(ctx, s, on, preview);
      return;
    }
    if (s.type === "fib") {
      drawFib(ctx, s, on, preview);
      return;
    }
    if (s.type === "zoom") {
      drawZoomBand(ctx, s);
      return;
    }
    if (s.type === "ruler") drawRuler(ctx, s, on, preview);
  }

  function drawShapes(ctx) {
    var list = shapes();
    var i;

    for (i = 0; i < list.length; i++) {
      drawOne(ctx, list[i], !!(selected && selected.kind === "shape" && selected.id === list[i].id), false);
    }

    /* 브러시로 지금 긋고 있는 획 — 손을 떼기 전에도 보여야 합니다 */
    if (stroke && stroke.pts.length > 1) {
      drawOne(ctx, { type: "brush", pts: stroke.pts }, false, true);
    }

    /* 여러선 — 기준선을 긋는 중 / 폭을 고르는 중 둘 다 미리 보여줍니다 */
    if (pending && hover && tool === "channel") {
      if (chanBase) {
        var cdp = chanOffset(chanBase, hover.t, hover.p);
        if (cdp !== null) {
          drawOne(ctx, {
            type: "channel", t1: chanBase.t1, p1: chanBase.p1,
            t2: chanBase.t2, p2: chanBase.p2, dp: cdp
          }, false, true);
        }
      } else {
        drawOne(ctx, { type: "trend", t1: pending.t, p1: pending.p, t2: hover.t, p2: hover.p }, false, true);
      }
      var cx = timeToX(pending.t);
      var cy = priceToY(pending.p);
      if (cx !== null && cy !== null) handle(ctx, cx, cy);
      return;
    }

    /* 두 점 도구를 긋는 중이면 미리보기 */
    if (pending && hover && TWO_TAP[tool]) {
      drawOne(ctx, { type: tool, t1: pending.t, p1: pending.p, t2: hover.t, p2: hover.p }, false, true);
      var ax = timeToX(pending.t);
      var ay = priceToY(pending.p);
      if (ax !== null && ay !== null) handle(ctx, ax, ay);
    }
  }

  function drawFrame(target) {
    /* 그릴 것이 없으면 여기서 끝 — 계산을 하지 않습니다 */
    if (!series) return;
    var list = shapes();
    if ((!list || !list.length) && !pending && !stroke) {
      perf.skipped++;
      return;
    }
    var t0 = nowMs();
    try {
      target.useMediaCoordinateSpace(function (scope) {
        refreshMeta(false);
        if (scope.mediaSize && scope.mediaSize.height) paneH = scope.mediaSize.height;
        drawShapes(scope.context);
      });
    } catch (e) {
      /* 한 프레임 실패해도 차트는 계속 돕니다 */
    }
    var ms = nowMs() - t0;
    perf.draws++;
    perf.totalMs += ms;
    perf.shapes = list.length;
    if (ms > perf.maxMs) perf.maxMs = ms;
  }

  var paneView = {
    zOrder: function () {
      return "top";
    },
    renderer: function () {
      return { draw: drawFrame };
    }
  };

  var primitive = {
    attached: function (p) {
      requestUpdate = p && p.requestUpdate ? p.requestUpdate : null;
    },
    detached: function () {
      requestUpdate = null;
    },
    updateAllViews: function () {},
    paneViews: function () {
      return [paneView];
    }
  };

  function repaint() {
    if (requestUpdate) {
      try {
        requestUpdate();
      } catch (e) {
        /* 무시 */
      }
    }
  }

  /* =====================================================================
   * 수평선 — createPriceLine (가격축 라벨·표시 통화가 따라옵니다)
   * ===================================================================== */
  function createPriceLineFor(h) {
    var lc = LC();
    var on = !!(selected && selected.kind === "hline" && selected.id === h.id);
    try {
      priceLines[h.id] = series.createPriceLine({
        price: h.price,
        color: on ? COLOR_SELECTED : COLOR_DRAW,
        lineWidth: LINE_WIDTH,
        lineStyle: lc && lc.LineStyle ? lc.LineStyle.Dashed : 2,
        axisLabelVisible: true,
        title: ""
      });
    } catch (e) {
      console.warn("[chart-drawings.js] 수평선을 긋지 못했습니다:", e);
    }
  }

  function paintPriceLine(h) {
    var pl = priceLines[h.id];
    if (!pl) return;
    var on = !!(selected && selected.kind === "hline" && selected.id === h.id);
    try {
      pl.applyOptions({ color: on ? COLOR_SELECTED : COLOR_DRAW, lineWidth: on ? LINE_WIDTH + 1 : LINE_WIDTH });
    } catch (e) {
      /* 무시 */
    }
  }

  function removePriceLine(id) {
    if (!priceLines[id]) return;
    try {
      series.removePriceLine(priceLines[id]);
    } catch (e) {
      /* 이미 지워졌으면 무시 */
    }
    delete priceLines[id];
  }

  function clearPriceLines() {
    for (var id in priceLines) removePriceLine(id);
  }

  function syncPriceLines() {
    if (!series) return;
    var want = {};
    var list = hlines();
    var i;
    var id;
    for (i = 0; i < list.length; i++) {
      want[list[i].id] = 1;
      if (!priceLines[list[i].id]) createPriceLineFor(list[i]);
      else paintPriceLine(list[i]);
    }
    for (id in priceLines) {
      if (!want[id]) removePriceLine(id);
    }
  }

  /* =====================================================================
   * 고르기 (커서 도구) — 누른 자리에서 가장 가까운 그림
   * ===================================================================== */
  function distToSegment(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    var qx = x1 + t * dx;
    var qy = y1 + t * dy;
    return Math.sqrt((px - qx) * (px - qx) + (py - qy) * (py - qy));
  }

  function hitTest(x, y) {
    var best = null;
    var bestD = HIT_PX + 1;
    var list = shapes();
    var i;

    for (i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.type === "trend") {
        var x1 = timeToX(s.t1);
        var x2 = timeToX(s.t2);
        var y1 = priceToY(s.p1);
        var y2 = priceToY(s.p2);
        if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
        var d = distToSegment(x, y, x1, y1, x2, y2);
        if (d < bestD) {
          bestD = d;
          best = { kind: "shape", id: s.id };
        }
      } else if (s.type === "text") {
        var tx = timeToX(s.t);
        var ty = priceToY(s.p);
        if (tx === null || ty === null) continue;
        var w = 7 * (s.s ? s.s.length : 0) + 10;
        if (x >= tx && x <= tx + w && Math.abs(y - ty) <= 10) {
          bestD = 0;
          best = { kind: "shape", id: s.id };
        }
      } else if (s.type === "channel") {
        /* 위·아래·가운데 세 줄 중 가장 가까운 것 */
        var cx1 = timeToX(s.t1);
        var cx2 = timeToX(s.t2);
        var cy1 = priceToY(s.p1);
        var cy2 = priceToY(s.p2);
        var cdp = s.dp || 0;
        var cb1 = priceToY(s.p1 + cdp);
        var cb2 = priceToY(s.p2 + cdp);
        var cm1 = priceToY(s.p1 + cdp / 2);
        var cm2 = priceToY(s.p2 + cdp / 2);
        if (cx1 === null || cx2 === null || cy1 === null || cy2 === null) continue;
        if (cb1 === null || cb2 === null || cm1 === null || cm2 === null) continue;
        var cd = Math.min(
          distToSegment(x, y, cx1, cy1, cx2, cy2),
          distToSegment(x, y, cx1, cb1, cx2, cb2),
          distToSegment(x, y, cx1, cm1, cx2, cm2)
        );
        if (cd < bestD) {
          bestD = cd;
          best = { kind: "shape", id: s.id };
        }
      } else if (s.type === "brush") {
        var bp = s.pts;
        if (!bp || bp.length < 2) continue;
        var px = null;
        var py = null;
        for (var q = 0; q < bp.length; q++) {
          var qx = timeToX(bp[q].t);
          var qy = priceToY(bp[q].p);
          if (qx !== null && qy !== null && px !== null && py !== null) {
            var bd = distToSegment(x, y, px, py, qx, qy);
            if (bd < bestD) {
              bestD = bd;
              best = { kind: "shape", id: s.id };
            }
          }
          px = qx;
          py = qy;
        }
      } else if (s.type === "fib" || s.type === "ruler") {
        /* 피보나치는 눈금 줄 중 가장 가까운 것, 자는 상자 네 변 중 가장 가까운 것 */
        var ax = timeToX(s.t1);
        var bx = timeToX(s.t2);
        var ay = priceToY(s.p1);
        var by = priceToY(s.p2);
        if (ax === null || bx === null || ay === null || by === null) continue;
        var lo = Math.min(ax, bx);
        var hi = Math.max(ax, bx);
        var dm = HIT_PX + 1;
        if (s.type === "fib") {
          for (var k = 0; k < FIB_LEVELS.length; k++) {
            var fy = priceToY(fibPrice(s, FIB_LEVELS[k]));
            if (fy === null) continue;
            dm = Math.min(dm, distToSegment(x, y, lo, fy, hi, fy));
          }
        } else {
          var rt = Math.min(ay, by);
          var rb = Math.max(ay, by);
          dm = Math.min(
            distToSegment(x, y, lo, rt, hi, rt),
            distToSegment(x, y, lo, rb, hi, rb),
            distToSegment(x, y, lo, rt, lo, rb),
            distToSegment(x, y, hi, rt, hi, rb)
          );
        }
        if (dm < bestD) {
          bestD = dm;
          best = { kind: "shape", id: s.id };
        }
      }
    }

    var hs = hlines();
    for (i = 0; i < hs.length; i++) {
      var hy = priceToY(hs[i].price);
      if (hy === null) continue;
      var dd = Math.abs(hy - y);
      if (dd < bestD) {
        bestD = dd;
        best = { kind: "hline", id: hs[i].id };
      }
    }
    return best;
  }

  function findHLine(id) {
    var list = hlines();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function setSelected(sel) {
    var before = selected;
    selected = sel;
    var h;
    if (before && before.kind === "hline") {
      h = findHLine(before.id);
      if (h) paintPriceLine(h);
    }
    if (selected && selected.kind === "hline") {
      h = findHLine(selected.id);
      if (h) paintPriceLine(h);
    }
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 누르기 — 차트 위에서 일어나는 일
   * 라이브러리의 subscribeClick 이 주는 좌표를 그대로 씁니다(캔들 판 기준).
   * 끌어서 차트를 옮기는 동작은 클릭으로 오지 않아서, 도구를 켜 둔 채로도
   * 차트를 끌어 옮길 수 있습니다(실측으로 확인했습니다).
   * ===================================================================== */
  function onClick(param) {
    if (!param || !param.point) return;
    var x = param.point.x;
    var y = param.point.y;
    var price = yToPrice(y);
    var time = pointToTime(param);

    if (tool === "cursor") {
      setSelected(hitTest(x, y));
      return;
    }
    if (price === null) return;

    if (tool === "hline") {
      hlines().push({ id: newId(), type: "hline", price: price });
      saveStore();
      syncPriceLines();
      paintChip();
      setTool("cursor");
      return;
    }

    if (time === null) return;

    /* 여러선 = 평행 채널 — 세 번 톡.
       ① 기준선 시작 ② 기준선 끝 ③ 마주 보는 선의 자리(폭)
       바이낸스(트레이딩뷰 모드) Parallel Channel 과 같은 순서입니다. */
    if (THREE_TAP[tool]) {
      if (!pending) {
        pending = { t: time, p: price };
        chanBase = null;
        hover = { t: time, p: price };
        repaint();
        return;
      }
      if (!chanBase) {
        /* 한 점에 두 번 찍으면 선이 안 됩니다 — 다시 받습니다 */
        if (time === pending.t && price === pending.p) return;
        chanBase = { t1: pending.t, p1: pending.p, t2: time, p2: price };
        hover = { t: time, p: price };
        repaint();
        return;
      }
      var dp = chanOffset(chanBase, time, price);
      if (dp === null) return;
      shapes().push({
        id: newId(), type: "channel",
        t1: chanBase.t1, p1: chanBase.p1, t2: chanBase.t2, p2: chanBase.p2, dp: dp
      });
      pending = null;
      chanBase = null;
      hover = null;
      saveStore();
      paintChip();
      setTool("cursor");
      repaint();
      return;
    }

    /* 추세선 · 피보나치 · 자 — 전부 두 점을 찍어 만듭니다.
       폰에서도 그대로 됩니다(톡 두 번). 손가락으로 끄는 동안은 차트가
       움직이므로, 끌기가 아니라 "톡 두 번"으로 만들게 두었습니다. */
    if (TWO_TAP[tool]) {
      if (!pending) {
        pending = { t: time, p: price };
        hover = { t: time, p: price };
        repaint();
      } else if (tool === "zoom") {
        /* 돋보기는 그림으로 남지 않습니다 — 화면만 그 구간으로 당깁니다 */
        var zt1 = pending.t;
        pending = null;
        hover = null;
        setTool("cursor");
        repaint();
        zoomTo(zt1, time);
      } else {
        shapes().push({ id: newId(), type: tool, t1: pending.t, p1: pending.p, t2: time, p2: price });
        pending = null;
        hover = null;
        saveStore();
        paintChip();
        setTool("cursor");
        repaint();
      }
      return;
    }

    if (tool === "text") {
      openTextInput(x, y, time, price);
    }
  }

  function onCrosshairMove(param) {
    /* 긋는 중이 아니면 아무 일도 하지 않습니다 */
    if (!pending) return;
    if (!param || !param.point) return;
    var price = yToPrice(param.point.y);
    var time = pointToTime(param);
    if (price === null || time === null) return;
    hover = { t: time, p: price };
    repaint();
  }

  /* =====================================================================
   * 돋보기 — 찍은 두 시각 사이만 보이게 당깁니다
   * ---------------------------------------------------------------------
   * 라이브러리 공개 API 두 개만 씁니다.
   *   chart.timeScale().getVisibleLogicalRange()   지금 보이는 범위
   *   chart.timeScale().setVisibleLogicalRange()   그 범위로 옮기기
   * 시각(초)을 논리 번호(몇 번째 봉인가)로 바꿔 넘깁니다 — 데이터 밖(마지막 봉
   * 오른쪽 빈 자리)을 찍어도 그대로 되기 때문입니다.
   *
   * 가격 눈금은 우리가 만지지 않습니다. js/chart.js 가 autoScale 을 끄지
   * 않았기 때문에, 시간 범위를 좁히면 그 구간의 고가·저가에 맞춰 라이브러리가
   * 알아서 위아래를 다시 잡습니다(바이낸스 차트의 auto 와 같은 동작입니다).
   *
   * 되돌리기 — 확대하기 직전 범위를 쌓아 둡니다(최대 10칸).
   * "전체" 는 js/chart.js 가 과거 봉을 불러온 뒤에 하는 것과 같은
   * fitContent() 입니다(js/chart.js:314). 처음 보던 화면으로 돌아갑니다.
   * ===================================================================== */
  var ZOOM_UNDO_MAX = 10;
  var ZOOM_MIN_BARS = 3; /* 이보다 좁게 찍으면 확대하지 않고 알려만 줍니다 */
  var zoomUndo = [];

  function tScale() {
    try {
      return chart ? chart.timeScale() : null;
    } catch (e) {
      return null;
    }
  }

  function pushZoomUndo() {
    var ts = tScale();
    if (!ts || typeof ts.getVisibleLogicalRange !== "function") return;
    var r = null;
    try {
      r = ts.getVisibleLogicalRange();
    } catch (e) {
      r = null;
    }
    if (!r || typeof r.from !== "number" || typeof r.to !== "number") return;
    zoomUndo.push({ from: r.from, to: r.to });
    if (zoomUndo.length > ZOOM_UNDO_MAX) zoomUndo.shift();
  }

  function applyLogical(from, to) {
    var ts = tScale();
    if (!ts || typeof ts.setVisibleLogicalRange !== "function") return false;
    try {
      ts.setVisibleLogicalRange({ from: from, to: to });
      return true;
    } catch (e) {
      return false;
    }
  }

  function zoomTo(ta, tb) {
    refreshMeta(true);
    if (meta.first === null || !meta.bar) {
      toast("아직 봉이 없어 확대할 수 없습니다");
      return false;
    }
    var a = (Math.min(ta, tb) - meta.first) / meta.bar;
    var b = (Math.max(ta, tb) - meta.first) / meta.bar;
    var bars = Math.round(b - a);
    if (bars < ZOOM_MIN_BARS) {
      toast("두 점을 " + ZOOM_MIN_BARS + "봉 이상 벌려 찍어주세요");
      return false;
    }
    pushZoomUndo();
    if (!applyLogical(a, b)) {
      zoomUndo.pop();
      toast("이 브라우저에서는 확대가 안 됩니다");
      return false;
    }
    paintZoomChip();
    toast(bars + "봉 구간으로 확대했습니다");
    return true;
  }

  function zoomBack() {
    var prev = zoomUndo.pop();
    if (!prev) {
      paintZoomChip();
      return false;
    }
    applyLogical(prev.from, prev.to);
    paintZoomChip();
    return true;
  }

  function zoomReset() {
    var ts = tScale();
    zoomUndo.length = 0;
    if (ts && typeof ts.fitContent === "function") {
      try {
        ts.fitContent();
      } catch (e) {
        /* 무시 */
      }
    }
    paintZoomChip();
    return true;
  }

  /* ---------------- 확대 되돌리기 칩 ----------------
   * 확대한 적이 있을 때만 나옵니다. 자리는 차트 칸 오른쪽 아래 —
   * 바이낸스(트레이딩뷰 모드)가 되돌리기(auto) 버튼을 두는 자리와 같습니다
   * (2026-08-26 실측 shots/bnf-tv-1440.png — 시간축 바로 위, 오른쪽 끝).
   * 왼쪽 아래는 이미 "그린 것" 칩이 쓰고 있어서 겹치지 않습니다.
   * ------------------------------------------------------------------- */
  function buildZoomChip() {
    if (els.zoomChip || !wrap) return;
    injectStyle();
    if (!wrap.style.position) wrap.style.position = "relative";
    var chip = document.createElement("div");
    chip.className = "tl-zoom-chip";
    var label = document.createElement("span");
    label.textContent = "확대됨";
    var b1 = document.createElement("button");
    b1.type = "button";
    b1.textContent = "되돌리기";
    b1.addEventListener("click", function (ev) {
      ev.preventDefault();
      zoomBack();
    });
    var b2 = document.createElement("button");
    b2.type = "button";
    b2.textContent = "전체";
    b2.addEventListener("click", function (ev) {
      ev.preventDefault();
      zoomReset();
    });
    chip.appendChild(label);
    chip.appendChild(b1);
    chip.appendChild(b2);
    wrap.appendChild(chip);
    els.zoomChip = chip;
  }

  function paintZoomChip() {
    if (!els.zoomChip) return;
    els.zoomChip.style.display = zoomUndo.length ? "flex" : "none";
    placeSoon();
  }

  /* =====================================================================
   * 지우기
   * ===================================================================== */
  function removeSelected() {
    if (!selected) {
      toast("지울 것을 먼저 고르세요");
      return false;
    }
    var i;
    if (selected.kind === "hline") {
      var hs = hlines();
      for (i = 0; i < hs.length; i++) {
        if (hs[i].id === selected.id) {
          hs.splice(i, 1);
          break;
        }
      }
      removePriceLine(selected.id);
    } else {
      var ss = shapes();
      for (i = 0; i < ss.length; i++) {
        if (ss[i].id === selected.id) {
          ss.splice(i, 1);
          break;
        }
      }
    }
    selected = null;
    saveStore();
    syncPriceLines();
    paintButtons();
    paintChip();
    repaint();
    return true;
  }

  function clearAll() {
    hlines().length = 0;
    shapes().length = 0;
    selected = null;
    pending = null;
    chanBase = null;
    hover = null;
    cancelStroke();
    saveStore();
    clearPriceLines();
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 브러시 — 끌어서 자유롭게 (5차 2026-08-28)
   * ---------------------------------------------------------------------
   * 다른 도구는 전부 "톡 두 번" 이라 라이브러리의 subscribeClick 으로
   * 충분했는데, 브러시만은 끄는 동안의 자취가 필요해서 포인터 이벤트를
   * 직접 받습니다. 그래서 두 가지를 같이 해야 합니다.
   *
   *   ① 차트가 같이 끌려가지 않게  chart.applyOptions({handleScroll:false,
   *      handleScale:false})  — 라이브러리 공개 API 입니다. 브러시를 끄면
   *      켜기 전 값으로 되돌립니다(우리가 true 로 덮어쓰지 않습니다).
   *   ② 폰에서 페이지가 같이 스크롤되지 않게  touch-action:none
   *      — 이것만은 CSS 로 막아야 합니다. preventDefault 만으로는
   *        브라우저가 이미 스크롤을 시작한 뒤라 늦습니다.
   *      브러시를 끄면 원래 값으로 되돌립니다.
   *
   * 좌표 — 캔들 판(첫 번째 canvas)의 왼쪽 위가 (0,0) 입니다. 글자 입력칸이
   * 쓰는 paneOrigin() 과 같은 기준입니다(2026-08-28 실측: 차트칸 기준
   * (287,429) 를 누르면 판 기준 (285,420) — canvas 가 (2,9) 에 놓여 있음).
   *
   * 저장 — 점을 "시각·가격" 으로 남깁니다. 그래서 차트를 옮기거나 확대해도
   * 봉에 붙어 따라옵니다. 종목 + 봉 간격별로 나뉘어 저장됩니다(추세선과 같은
   * 칸입니다 — 1분봉에 그린 낙서가 1일봉에서 점 하나로 뭉개지지 않게).
   * ===================================================================== */
  function paneRect() {
    try {
      var cv = container ? container.querySelector("canvas") : null;
      return cv ? cv.getBoundingClientRect() : null;
    } catch (e) {
      return null;
    }
  }

  /** 판 위의 x 를 시각으로. 봉에 딱 맞추지 않습니다(맞추면 획이 계단이 됩니다) */
  function xToTime(x) {
    if (!chart) return null;
    refreshMeta(false);
    if (meta.first === null || !meta.bar) return null;
    var lg;
    try {
      lg = chart.timeScale().coordinateToLogical(x);
    } catch (e) {
      return null;
    }
    if (lg === null || lg === undefined) return null;
    return meta.first + lg * meta.bar;
  }

  function evPoint(ev) {
    var r = paneRect();
    if (!r || !r.width || !r.height) return null;
    return { x: ev.clientX - r.left, y: ev.clientY - r.top, w: r.width, h: r.height };
  }

  var strokeRaf = 0;
  function strokeRepaint() {
    if (strokeRaf) return;
    if (!window.requestAnimationFrame) {
      repaint();
      return;
    }
    strokeRaf = window.requestAnimationFrame(function () {
      strokeRaf = 0;
      repaint();
    });
  }

  function cancelStroke() {
    if (!stroke) return;
    stroke = null;
    detachStrokeMoves();
    repaint();
  }

  function onBrushDown(ev) {
    if (tool !== "brush") return;
    if (typeof ev.button === "number" && ev.button > 0) return; /* 오른쪽 버튼은 무시 */
    var pt = evPoint(ev);
    if (!pt) return;
    if (pt.x < 0 || pt.y < 0 || pt.x > pt.w || pt.y > pt.h) return; /* 가격축·시간축은 그대로 둡니다 */
    var t = xToTime(pt.x);
    var pr = yToPrice(pt.y);
    if (t === null || pr === null) return;
    stroke = { pts: [{ t: t, p: pr }], lastX: pt.x, lastY: pt.y };
    attachStrokeMoves();
    if (ev.cancelable) ev.preventDefault();
    ev.stopPropagation();
    strokeRepaint();
  }

  function onBrushMove(ev) {
    if (!stroke) return;
    var pt = evPoint(ev);
    if (!pt) return;
    var x = Math.max(0, Math.min(pt.w, pt.x));
    var y = Math.max(0, Math.min(pt.h, pt.y));
    var dx = x - stroke.lastX;
    var dy = y - stroke.lastY;
    if (dx * dx + dy * dy < BRUSH_MIN_PX * BRUSH_MIN_PX) return;
    stroke.lastX = x;
    stroke.lastY = y;
    if (stroke.pts.length < BRUSH_MAX_PTS) {
      var t = xToTime(x);
      var pr = yToPrice(y);
      if (t !== null && pr !== null) stroke.pts.push({ t: t, p: pr });
    }
    if (ev.cancelable) ev.preventDefault();
    strokeRepaint();
  }

  function onBrushUp(ev) {
    if (!stroke) return;
    var pts = stroke.pts;
    stroke = null;
    detachStrokeMoves();
    if (ev && ev.cancelable) ev.preventDefault();
    if (pts.length < 2) {
      repaint();
      toast("조금 더 길게 끌어주세요");
      return;
    }
    shapes().push({ id: newId(), type: "brush", pts: pts });
    saveStore();
    paintChip();
    repaint();
    toast(pts.length + "점짜리 획을 그렸습니다");
  }

  var strokeMovesOn = false;
  function attachStrokeMoves() {
    if (strokeMovesOn) return;
    strokeMovesOn = true;
    window.addEventListener("pointermove", onBrushMove, true);
    window.addEventListener("pointerup", onBrushUp, true);
    window.addEventListener("pointercancel", onBrushUp, true);
  }
  function detachStrokeMoves() {
    if (!strokeMovesOn) return;
    strokeMovesOn = false;
    window.removeEventListener("pointermove", onBrushMove, true);
    window.removeEventListener("pointerup", onBrushUp, true);
    window.removeEventListener("pointercancel", onBrushUp, true);
  }

  /** 옵션 값을 통째로 베낍니다 (true/false 이거나 잔가지가 있는 객체입니다) */
  function copyOpt(v) {
    if (v === null || typeof v !== "object") return v;
    var out = {};
    for (var k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = copyOpt(v[k]);
    }
    return out;
  }

  /** 브러시를 켜는 동안만 차트 끌기·페이지 스크롤을 멈춥니다 */
  function applyBrushMode(on) {
    if (!chart || !container) return;
    if (on) {
      if (brushSaved) return;
      var saved = { handleScroll: undefined, handleScale: undefined };
      try {
        var co = chart.options();
        /* 반드시 베껴 두어야 합니다. chart.options() 가 주는 것은 차트가
           들고 있는 그 객체 자체라, applyOptions 로 false 를 걸면 우리가
           들고 있던 "원래 값" 까지 같이 false 로 바뀝니다. 그러면 되돌릴 때
           false 를 다시 써 넣게 되어, 브러시를 한 번 쓰고 나면 차트를 영영
           못 끄는 조용한 고장이 납니다(2026-08-28 실측으로 잡았습니다). */
        saved.handleScroll = copyOpt(co.handleScroll);
        saved.handleScale = copyOpt(co.handleScale);
      } catch (e) {
        /* 못 읽으면 기본값(true)으로 되돌립니다 */
      }
      brushSaved = saved;
      try {
        chart.applyOptions({ handleScroll: false, handleScale: false });
      } catch (e) {
        /* 무시 — 못 막아도 그리기는 됩니다 */
      }
      brushTouch = container.style.touchAction || "";
      container.style.touchAction = "none";
      return;
    }
    if (!brushSaved) return;
    try {
      chart.applyOptions({
        handleScroll: brushSaved.handleScroll === undefined ? true : brushSaved.handleScroll,
        handleScale: brushSaved.handleScale === undefined ? true : brushSaved.handleScale
      });
    } catch (e) {
      /* 무시 */
    }
    container.style.touchAction = brushTouch || "";
    brushSaved = null;
    brushTouch = null;
  }

  /** 마지막 획 하나만 되돌립니다 (브러시를 켜 둔 동안 칩의 첫 단추) */
  function undoLastStroke() {
    var ss = shapes();
    for (var i = ss.length - 1; i >= 0; i--) {
      if (ss[i].type === "brush") {
        if (selected && selected.kind === "shape" && selected.id === ss[i].id) selected = null;
        ss.splice(i, 1);
        saveStore();
        paintButtons();
        paintChip();
        repaint();
        toast("한 획 되돌렸습니다");
        return true;
      }
    }
    toast("되돌릴 획이 없습니다");
    return false;
  }

  function brushCount() {
    var ss = shapes();
    var n = 0;
    for (var i = 0; i < ss.length; i++) if (ss[i].type === "brush") n++;
    return n;
  }

  /* =====================================================================
   * 도구 고르기
   * ===================================================================== */
  function setTool(name) {
    if (!READY_TOOLS[name]) return;
    tool = name;
    /* 도구를 바꾸면 긋다 만 것은 버립니다 (추세선을 찍다가 자로 바꾸는 경우) */
    pending = null;
    chanBase = null;
    hover = null;
    cancelStroke();
    /* 브러시일 때만 차트 끌기·페이지 스크롤을 멈춥니다(끄면 되돌립니다) */
    applyBrushMode(name === "brush");
    if (name !== "cursor") setSelected(null);
    closeTextInput();
    paintButtons();
    paintChip();
    repaint();
    /* 세 번 톡은 다른 도구와 순서가 달라서 한 줄 알려줍니다 */
    if (name === "channel") toast("세 번 톡 — 기준선 두 점, 그 다음 폭");
  }

  /* =====================================================================
   * 껍데기 — 디자인팀이 정한 뼈대 그대로 만듭니다
   *   .chart-panel
   *     ├─ .tlc-toolbar   가로 막대
   *     └─ .tlc-body      (가로줄)
   *          ├─ .tlc-rail   세로 막대
   *          └─ .chart-wrap 기존 차트 (그대로 옮겨 넣습니다)
   * ===================================================================== */
  function restructure() {
    if (els.body) return true;
    panel = document.querySelector(".chart-panel");
    wrap = panel ? panel.querySelector(".chart-wrap") : null;
    container = document.getElementById("chart_container");
    if (!panel || !wrap || !container) return false;

    var body = panel.querySelector(".tlc-body");
    if (body) {
      els.body = body;
      els.rail = panel.querySelector(".tlc-rail");
      els.bar = panel.querySelector(".tlc-toolbar");
      return true;
    }

    var bar = document.createElement("div");
    bar.className = "tlc-toolbar";
    bar.setAttribute("role", "toolbar");
    bar.setAttribute("aria-label", "차트 도구 막대");

    body = document.createElement("div");
    body.className = "tlc-body";

    var rail = document.createElement("div");
    rail.className = "tlc-rail";
    rail.setAttribute("role", "toolbar");
    rail.setAttribute("aria-label", "차트 그리기 도구");

    panel.insertBefore(bar, wrap);
    panel.insertBefore(body, wrap);
    body.appendChild(rail);
    body.appendChild(wrap); /* 여기서 차트 칸이 .tlc-body 안으로 들어갑니다 */

    els.bar = bar;
    els.body = body;
    els.rail = rail;

    fillBar(rail, LEFT_TOOLS, "tool");
    fillBar(bar, TOP_TOOLS, "top");
    applyRail();
    paintButtons();
    return true;
  }

  function fillBar(host, defs, kind) {
    defs.forEach(function (def) {
      if (def.sep) {
        var sp = document.createElement("div");
        sp.className = "tlc-sep";
        host.appendChild(sp);
        return;
      }
      if (def.spacer) {
        var sc = document.createElement("div");
        sc.className = "tlc-spacer";
        host.appendChild(sc);
        return;
      }
      host.appendChild(makeButton(def, kind));
    });
  }

  function makeButton(def, kind) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "tlc-btn";
    b.setAttribute("data-tlc", def.k);
    b.setAttribute("data-kind", kind);
    b.innerHTML =
      "<svg class=\"tlc-ico\" viewBox=\"0 0 16 16\" aria-hidden=\"true\"><use href=\"#" + def.icon + "\"></use></svg>";
    if (def.ready) {
      b.setAttribute("title", def.label);
      b.setAttribute("aria-label", def.label);
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", function (ev) {
        ev.preventDefault();
        onButton(def, kind);
      });
    } else {
      /* 아직 안 만든 것 — 디자인팀 규칙대로 disabled + data-soon
         (흐려지고 오른쪽 위에 회색 점이 붙습니다). 눌러도 아무 일 없습니다. */
      b.setAttribute("data-soon", "1");
      b.setAttribute("disabled", "disabled");
      b.setAttribute("title", def.label + " (준비중)");
      b.setAttribute("aria-label", def.label + " 준비중");
    }
    return b;
  }

  function onButton(def, kind) {
    if (kind === "tool") {
      setTool(def.k);
      return;
    }
    if (def.k === "expand") {
      toggleRail();
      return;
    }
    if (def.k === "fullscreen") {
      toggleFullscreen();
      return;
    }
    if (def.k === "camera") {
      saveImage();
      return;
    }
    /* fx 지표 — 목록은 별도 파일이 만듭니다(js/chart-indicator-menu.js).
       그 파일이 없으면 아무 일도 하지 않습니다(오류를 내지 않습니다). */
    if (def.k === "fx") {
      var menu = window.App && App.ChartIndicatorMenu;
      if (menu && typeof menu.toggle === "function") menu.toggle(barButton("fx"));
      return;
    }
    /* 봉 종류 — 목록은 별도 파일이 만듭니다(js/chart-candle-type.js).
       fx 와 같은 방식입니다. 그 파일이 없으면 아무 일도 하지 않습니다. */
    if (def.k === "candletype") {
      var ct = window.App && App.ChartCandleType;
      if (ct && typeof ct.toggle === "function") ct.toggle(barButton("candletype"));
      return;
    }
    /* 차트 스타일(육각형) — 창은 별도 파일이 만듭니다(js/chart-style.js).
       fx·봉 종류와 같은 방식입니다. 그 파일이 없으면 아무 일도 안 합니다. */
    if (def.k === "hex") {
      var cs = window.App && App.ChartStyle;
      if (cs && typeof cs.toggle === "function") cs.toggle();
    }
  }

  /* 가로 막대에서 버튼 하나를 찾아 줍니다 (목록이 붙을 자리 기준점) */
  function barButton(k) {
    if (!els.bar || !els.bar.querySelector) return null;
    return els.bar.querySelector('.tlc-btn[data-tlc="' + k + '"]');
  }

  /* ---------------- 세로 막대 접기/펴기 ----------------
   * 값은 디자인팀이 정한 대로 "on" / "off" 둘만 씁니다.
   * 처음 값은 화면 폭을 따릅니다(폰은 접힘). 한 번 누르면 그 선택을 기억합니다.
   * ------------------------------------------------------------------- */
  function railOpen() {
    if (store && store.ui && typeof store.ui.rail === "boolean") return store.ui.rail;
    return window.innerWidth >= RAIL_AUTO_WIDTH;
  }

  function applyRail() {
    if (!els.body) return;
    els.body.setAttribute("data-rail", railOpen() ? "on" : "off");
    paintButtons();
  }

  function toggleRail() {
    if (!store.ui) store.ui = {};
    store.ui.rail = !railOpen();
    saveStore();
    applyRail();
  }

  /* =====================================================================
   * 전체화면 — 차트 칸만 화면 가득
   * ---------------------------------------------------------------------
   * 바이낸스는 차트 머리줄 오른쪽 끝에 이 버튼을 둡니다(2026-08-26 실측,
   * Chart 탭 오른쪽 위). 우리 가로 막대도 오른쪽 끝이라 자리가 같습니다.
   *
   * 두 가지를 겹쳐 씁니다.
   *   1) 브라우저 전체화면(requestFullscreen) — 주소창까지 사라집니다
   *   2) 우리가 화면 전체를 덮는 방식 — 1) 이 안 되는 곳을 위한 것입니다
   *      (아이폰 사파리는 div 를 전체화면으로 만들지 못합니다)
   * 어느 쪽이든 차트 칸이 커집니다. 크기는 우리가 만지지 않습니다 —
   * chart.js 가 autoSize 로 만들어 두어서 칸이 커지면 라이브러리가 스스로
   * 다시 그립니다(js/chart.js:187).
   * ===================================================================== */
  var fullOn = false;

  function applyFull(on) {
    fullOn = !!on;
    if (panel) {
      if (fullOn) panel.setAttribute("data-tlc-full", "1");
      else panel.removeAttribute("data-tlc-full");
    }
    paintButtons();
    placeSoon();
  }

  function exitNativeFull() {
    try {
      if (document.exitFullscreen) document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (e) {
      /* 이미 나와 있으면 무시 */
    }
  }

  function toggleFullscreen() {
    if (!panel) return;
    injectStyle();
    if (fullOn) {
      applyFull(false);
      exitNativeFull();
      return;
    }
    applyFull(true);
    try {
      var r = null;
      if (panel.requestFullscreen) r = panel.requestFullscreen();
      else if (panel.webkitRequestFullscreen) r = panel.webkitRequestFullscreen();
      if (r && typeof r.catch === "function") r.catch(function () {
        /* 브라우저가 거절해도 우리 방식으로 이미 커져 있습니다 */
      });
    } catch (e) {
      /* 위와 같습니다 */
    }
    toast("전체화면 — 다시 누르거나 Esc 로 돌아옵니다");
  }

  /** 브라우저 쪽에서 빠져나왔을 때(Esc 등) 우리 상태를 맞춥니다 */
  function onFullChange() {
    var el = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (!el && fullOn) applyFull(false);
  }

  /* =====================================================================
   * 카메라 — 지금 차트를 그림 파일로
   * ---------------------------------------------------------------------
   * 라이브러리 공개 API chart.takeScreenshot() 이 차트 화면을 캔버스로
   * 내줍니다. 지표·보조지표 칸도 같은 차트의 칸(pane)이라 함께 담깁니다.
   * 아래쪽에 종목·봉 간격·시각 한 줄을 붙여 내려받게 합니다(게시판이나
   * 대화방에 올렸을 때 언제 것인지 알 수 있어야 합니다).
   * 색은 확정 팔레트만 씁니다.
   * ===================================================================== */
  function stamp(d) {
    function p2(v) {
      return (v < 10 ? "0" : "") + v;
    }
    return (
      d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) +
      " " + p2(d.getHours()) + ":" + p2(d.getMinutes())
    );
  }

  function fileStamp(d) {
    return stamp(d).replace(/[-: ]/g, "").slice(0, 13);
  }

  function download(url, name) {
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 0);
  }

  function saveImage() {
    if (!chart || typeof chart.takeScreenshot !== "function") {
      toast("이 브라우저에서는 그림 저장이 안 됩니다");
      return;
    }
    var src = null;
    try {
      src = chart.takeScreenshot();
    } catch (e) {
      src = null;
    }
    if (!src || !src.width) {
      toast("차트 그림을 만들지 못했습니다");
      return;
    }

    var pad = 6;
    var foot = 24;
    var out = document.createElement("canvas");
    out.width = src.width + pad * 2;
    out.height = src.height + pad * 2 + foot;
    var g = out.getContext("2d");
    if (!g) {
      toast("차트 그림을 만들지 못했습니다");
      return;
    }
    var now = new Date();
    g.fillStyle = C_PAGE;
    g.fillRect(0, 0, out.width, out.height);
    g.drawImage(src, pad, pad);
    g.font = textFont();
    g.textBaseline = "middle";
    g.fillStyle = C_TEXT;
    g.fillText(sym() + "  " + iv(), pad + 2, src.height + pad * 2 + foot / 2);
    g.fillStyle = C_MUTED;
    var right = stamp(now);
    g.fillText(right, out.width - pad - 2 - g.measureText(right).width, src.height + pad * 2 + foot / 2);

    var name = "TL_" + sym() + "_" + iv() + "_" + fileStamp(now) + ".png";
    try {
      if (out.toBlob) {
        out.toBlob(function (blob) {
          if (!blob) {
            toast("차트 그림을 만들지 못했습니다");
            return;
          }
          var url = URL.createObjectURL(blob);
          download(url, name);
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 5000);
          toast("차트 그림을 내려받았습니다");
        }, "image/png");
      } else {
        download(out.toDataURL("image/png"), name);
        toast("차트 그림을 내려받았습니다");
      }
    } catch (e) {
      toast("차트 그림을 내려받지 못했습니다");
    }
  }

  function paintButtons() {
    if (!els.rail) return;
    var btns = els.rail.querySelectorAll(".tlc-btn[data-kind=tool]");
    var i;
    for (i = 0; i < btns.length; i++) {
      btns[i].setAttribute("aria-pressed", btns[i].getAttribute("data-tlc") === tool ? "true" : "false");
    }
    var ex = els.bar ? els.bar.querySelector(".tlc-btn[data-tlc=expand]") : null;
    if (ex) ex.setAttribute("aria-pressed", railOpen() ? "true" : "false");
    var fs = els.bar ? els.bar.querySelector(".tlc-btn[data-tlc=fullscreen]") : null;
    if (fs) fs.setAttribute("aria-pressed", fullOn ? "true" : "false");
  }

  /* ---------------- 아이콘 스프라이트 ----------------
   * 디자인팀 파일(assets/icons/chart-tools.svg)을 그대로 한 번 받아
   * 화면 맨 앞에 숨겨 둡니다. 버튼은 그 안의 id 를 부릅니다.
   * 못 받아오면 파일을 직접 가리키는 방식으로 물러섭니다(모양은 나옵니다).
   * ------------------------------------------------------------------- */
  function loadSprite() {
    if (document.getElementById("tlc-icon-sprite")) return;
    if (typeof fetch !== "function") {
      spriteFallback();
      return;
    }
    fetch(SPRITE_URL)
      .then(function (r) {
        return r.ok ? r.text() : null;
      })
      .then(function (txt) {
        if (!txt) {
          spriteFallback();
          return;
        }
        var box = document.createElement("div");
        box.id = "tlc-icon-sprite";
        box.setAttribute("aria-hidden", "true");
        box.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
        box.innerHTML = txt.replace(/<\?xml[\s\S]*?\?>/, "");
        document.body.insertBefore(box, document.body.firstChild);
      })
      .catch(function () {
        spriteFallback();
      });
  }

  function spriteFallback() {
    var uses = document.querySelectorAll(".tlc-ico use");
    for (var i = 0; i < uses.length; i++) {
      var h = uses[i].getAttribute("href");
      if (h && h.charAt(0) === "#") uses[i].setAttribute("href", SPRITE_URL + h);
    }
  }

  /* ---------------- 내가 만든 작은 것들의 생김새 ----------------
   * 디자인팀 CSS(css/chart-toolbar.css)는 도구 막대 전용이라, 아래 세 가지
   * (지우기 칩 / 알림 한 줄 / 글자 입력칸)는 여기서 스타일을 넣습니다.
   * 확정 팔레트만 씁니다.
   * ------------------------------------------------------------------- */
  function injectStyle() {
    if (document.getElementById("chart-drawings-style")) return;
    var css =
      /* white-space:nowrap 는 꼭 있어야 합니다 — 없으면 화면 폭이 줄었을 때
         position:fixed 칩이 (화면폭 - left) 만큼으로 눌려 두 줄로 접히고,
         그 접힌 폭을 placeChips() 가 다시 읽어 자리를 잡아 오른쪽 끝에
         달라붙습니다(스스로 되풀이됨). 2026-08-28 360px 실측.
         되돌리려면 두 곳의 white-space:nowrap; 만 지우면 됩니다. */
      ".tl-draw-chip{position:fixed;left:0;top:0;z-index:6;display:none;align-items:center;white-space:nowrap;" +
      "gap:6px;padding:3px 6px;border-radius:6px;background:" + C_CARD + ";border:1px solid " + C_BORDER + ";" +
      "font-size:11px;line-height:1.6;color:" + C_MUTED + ";}" +
      ".tl-draw-chip button{border:1px solid " + C_BORDER + ";background:" + C_BG + ";color:" + C_TEXT + ";" +
      "border-radius:5px;font-size:11px;line-height:1.6;padding:1px 7px;cursor:pointer;font-family:inherit;}" +
      ".tl-draw-chip button:hover{border-color:" + C_MUTED + ";}" +
      ".tl-draw-chip button[data-dim=1]{color:" + C_MUTED + ";}" +
      ".tl-draw-chip button.on{border-color:" + COLOR_DRAW + ";color:" + COLOR_DRAW + ";}" +
      /* 확대 되돌리기 칩 — "그린 것" 칩과 같은 생김새, 자리만 오른쪽 아래 */
      ".tl-zoom-chip{position:fixed;left:0;top:0;z-index:6;display:none;align-items:center;white-space:nowrap;" +
      "gap:6px;padding:3px 6px;border-radius:6px;background:" + C_CARD + ";border:1px solid " + C_BORDER + ";" +
      "font-size:11px;line-height:1.6;color:" + C_MUTED + ";}" +
      ".tl-zoom-chip button{border:1px solid " + C_BORDER + ";background:" + C_BG + ";color:" + C_TEXT + ";" +
      "border-radius:5px;font-size:11px;line-height:1.6;padding:1px 7px;cursor:pointer;font-family:inherit;}" +
      ".tl-zoom-chip button:hover{border-color:" + C_MUTED + ";}" +
      ".tl-draw-toast{position:fixed;left:0;top:0;z-index:9;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";border-radius:6px;" +
      "padding:3px 10px;font-size:12px;line-height:1.6;pointer-events:none;display:none;}" +
      ".tl-draw-input{position:absolute;z-index:9;background:" + C_CARD + ";border:1px solid " + COLOR_DRAW + ";" +
      "color:" + C_TEXT + ";border-radius:6px;padding:2px 6px;font-size:12px;width:150px;font-family:inherit;}" +
      /* 전체화면 — css/chart-toolbar.css 와 style.css 는 한 글자도 안 고쳤습니다.
         이 규칙은 data-tlc-full 이 붙었을 때만 걸립니다(평소엔 아무 영향 없음). */
      ".chart-panel[data-tlc-full=\"1\"]{position:fixed;left:0;top:0;right:0;bottom:0;width:100vw;" +
      "height:100vh;max-height:100vh;z-index:1600;margin:0;border-radius:0;background:" + C_PAGE + ";}" +
      ".chart-panel[data-tlc-full=\"1\"] .chart-wrap{min-height:0;}" +
      ".chart-panel[data-tlc-full=\"1\"] .chart-container{height:100%;min-height:0;}";
    var st = document.createElement("style");
    st.id = "chart-drawings-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* =====================================================================
   * 칩·알림줄 자리 잡기 — 화면(viewport) 기준입니다
   * ---------------------------------------------------------------------
   * 2026-08-27 fx 목록에서 났던 것과 같은 실수를 막습니다.
   * 차트 칸은 폰에서 화면보다 훨씬 깁니다. 360x800 실측 —
   *   .chart-wrap 682~1242 (560px), 화면 800, 하단 매수/매도 바 위끝 727
   *   → 칸 오른쪽 아래(bottom:28px)에 붙이면 화면 밖 1184px 에서 열립니다.
   * 그래서 칸 rect 와 화면을 겹쳐 "실제로 보이는 네모" 를 구하고 그 안에만
   * 붙입니다. 보이는 데가 없으면 아예 숨깁니다(안 보이는 것을 그리지 않습니다).
   *
   * 하단 매수/매도 바(.tl-order-bar)는 폰에서만 나옵니다(디자인팀 CSS 의
   * @media max-width:700px). 1920·768 에서는 아예 없어서, 있는지부터 보고
   * display 도 확인한 뒤에만 셉니다. 전체화면일 때는 그 바가 화면에 안
   * 그려지므로 세지 않습니다.
   * ===================================================================== */
  var CHIP_EDGE = 8;

  function vpW() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }
  function vpH() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function chipFloorY() {
    var lim = vpH() - CHIP_EDGE;
    if (document.fullscreenElement || document.webkitFullscreenElement) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim; /* 1920·768 에는 없습니다 */
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - CHIP_EDGE < lim) lim = r.top - CHIP_EDGE;
    return lim;
  }

  /** 차트 칸에서 지금 화면에 실제로 보이는 네모. 없으면 null */
  function visibleBox() {
    if (!wrap || !wrap.getBoundingClientRect) return null;
    var r = wrap.getBoundingClientRect();
    var box = {
      top: Math.max(r.top, CHIP_EDGE),
      bottom: Math.min(r.bottom, chipFloorY()),
      left: Math.max(r.left, CHIP_EDGE),
      right: Math.min(r.right, vpW() - CHIP_EDGE)
    };
    if (box.bottom - box.top < 44 || box.right - box.left < 80) return null;
    return box;
  }

  function putFixed(el, left, top) {
    el.style.left = Math.round(left) + "px";
    el.style.top = Math.round(top) + "px";
  }

  /* 칩 두 개 — 왼쪽 아래(그린 것) · 오른쪽 아래(확대됨).
     좁아서 둘이 겹치면 확대 칩을 한 줄 위로 올립니다. */
  function placeChips() {
    var box = visibleBox();
    /* 보이는 것만 자리를 잡습니다. display 를 직접 "flex" 로 켠 것만 셉니다
       (아직 한 번도 안 그린 칩은 style.display 가 빈 문자열입니다) */
    var a = els.chip && els.chip.style.display === "flex" ? els.chip : null;
    var b = els.zoomChip && els.zoomChip.style.display === "flex" ? els.zoomChip : null;
    if (!box) {
      if (a) a.style.visibility = "hidden";
      if (b) b.style.visibility = "hidden";
      return;
    }
    var baseY = box.bottom - CHIP_EDGE;
    if (a) {
      a.style.visibility = "visible";
      putFixed(a, box.left + CHIP_EDGE, baseY - a.offsetHeight);
    }
    if (b) {
      b.style.visibility = "visible";
      var bw = b.offsetWidth;
      var bx = box.right - CHIP_EDGE - bw;
      var by = baseY - b.offsetHeight;
      if (a && bx < box.left + CHIP_EDGE + a.offsetWidth + 6) by -= a.offsetHeight + 6;
      if (bx < box.left + CHIP_EDGE) bx = box.left + CHIP_EDGE;
      if (by < box.top) by = box.top;
      putFixed(b, bx, by);
    }
  }

  function placeToast() {
    if (!els.toast || els.toast.style.display !== "block") return;
    var box = visibleBox();
    if (!box) {
      els.toast.style.visibility = "hidden";
      return;
    }
    els.toast.style.visibility = "visible";
    var w = els.toast.offsetWidth;
    var x = (box.left + box.right) / 2 - w / 2;
    if (x < box.left) x = box.left;
    if (x + w > box.right) x = box.right - w;
    putFixed(els.toast, x, box.top + CHIP_EDGE);
  }

  /* 화면이 움직이면 다시 잡습니다. 프레임당 한 번만 계산합니다. */
  var placeRaf = 0;
  function placeSoon() {
    if (placeRaf) return;
    if (!window.requestAnimationFrame) {
      placeChips();
      placeToast();
      return;
    }
    placeRaf = window.requestAnimationFrame(function () {
      placeRaf = 0;
      placeChips();
      placeToast();
    });
  }

  /* ---------------- 지우기 칩 ----------------
   * 그린 것이 하나라도 있을 때만 차트 왼쪽 아래에 나옵니다.
   * (디자인팀 스프라이트에 지우기 아이콘이 없어서 막대에 넣지 않았습니다.
   *  아이콘을 새로 만들지 않기로 했기 때문입니다. 2차에 아이콘이 오면
   *  세로 막대 아래쪽으로 옮기면 됩니다.)
   * ------------------------------------------------------------------- */
  var askingClear = false;

  function buildChip() {
    if (els.chip || !wrap) return;
    injectStyle();
    if (!wrap.style.position) wrap.style.position = "relative";
    var chip = document.createElement("div");
    chip.className = "tl-draw-chip";
    var label = document.createElement("span");
    var b1 = document.createElement("button");
    b1.type = "button";
    var b2 = document.createElement("button");
    b2.type = "button";
    b1.addEventListener("click", function () {
      if (askingClear) {
        askingClear = false;
        clearAll();
        toast("모두 지웠습니다");
        return;
      }
      /* 브러시를 켜 둔 동안은 "되돌리기" 입니다 — 폰에서 가는 획을
         손가락으로 골라 지우기가 어려워서 마지막 획을 바로 무릅니다 */
      if (tool === "brush") {
        undoLastStroke();
        return;
      }
      removeSelected();
    });
    b2.addEventListener("click", function () {
      if (askingClear) {
        askingClear = false;
        paintChip();
        return;
      }
      if (tool === "brush") {
        setTool("cursor");
        toast("브러시를 껐습니다");
        return;
      }
      askingClear = true;
      paintChip();
    });
    chip.appendChild(label);
    chip.appendChild(b1);
    chip.appendChild(b2);
    wrap.appendChild(chip);
    els.chip = chip;
    els.chipLabel = label;
    els.chipBtn1 = b1;
    els.chipBtn2 = b2;
  }

  function paintChip() {
    if (!els.chip) return;
    var n = countAll();
    if (!n && tool !== "brush") {
      askingClear = false;
      els.chip.style.display = "none";
      return;
    }
    els.chip.style.display = "flex";
    placeSoon();
    /* 브러시를 켜 둔 동안 — 되돌리기 · 끝내기.
       "끝내기" 가 있어야 폰에서 차트를 다시 끌 수 있습니다(브러시 중에는
       차트 끌기를 꺼 두기 때문입니다). */
    if (tool === "brush" && !askingClear) {
      els.chipLabel.textContent = "브러시 · 획 " + brushCount();
      els.chipBtn1.textContent = "되돌리기";
      els.chipBtn1.className = "";
      if (brushCount()) els.chipBtn1.removeAttribute("data-dim");
      else els.chipBtn1.setAttribute("data-dim", "1");
      els.chipBtn2.textContent = "끝내기";
      els.chipBtn2.className = "on";
      return;
    }
    if (askingClear) {
      els.chipLabel.textContent = "정말 모두 지울까요";
      els.chipBtn1.textContent = "지우기";
      els.chipBtn1.className = "on";
      els.chipBtn1.removeAttribute("data-dim");
      els.chipBtn2.textContent = "취소";
      els.chipBtn2.className = "";
      return;
    }
    els.chipLabel.textContent = "그린 것 " + n;
    els.chipBtn1.textContent = "고른 것 지우기";
    els.chipBtn1.className = "";
    if (selected) els.chipBtn1.removeAttribute("data-dim");
    else els.chipBtn1.setAttribute("data-dim", "1");
    els.chipBtn2.textContent = "전체 지우기";
    els.chipBtn2.className = "";
  }

  /* ---------------- 알림 한 줄 ---------------- */
  function toast(msg) {
    if (!wrap) return;
    if (!els.toast) {
      injectStyle();
      els.toast = document.createElement("div");
      els.toast.className = "tl-draw-toast";
      wrap.appendChild(els.toast);
    }
    els.toast.textContent = msg;
    els.toast.style.display = "block";
    placeToast();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (els.toast) els.toast.style.display = "none";
    }, 1600);
  }

  /* ---------------- 글자 넣기 ----------------
   * 캔들 판의 왼쪽 위가 좌표 (0,0) 이라, 입력칸을 그 자리에 맞춰 띄웁니다.
   * ------------------------------------------------------------------- */
  function paneOrigin() {
    var out = { x: 0, y: 0 };
    try {
      var cv = container.querySelector("canvas");
      if (!cv) return out;
      var r = cv.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      out.x = r.left - wr.left;
      out.y = r.top - wr.top;
    } catch (e) {
      /* 0,0 으로 둡니다 */
    }
    return out;
  }

  function closeTextInput() {
    if (els.input && els.input.parentNode) els.input.parentNode.removeChild(els.input);
    els.input = null;
  }

  function openTextInput(x, y, time, price) {
    closeTextInput();
    injectStyle();
    var o = paneOrigin();
    var inp = document.createElement("input");
    inp.type = "text";
    inp.className = "tl-draw-input";
    inp.setAttribute("maxlength", "40");
    inp.setAttribute("placeholder", "글을 쓰고 Enter");
    inp.style.left = Math.round(o.x + x) + "px";
    inp.style.top = Math.round(o.y + y - 12) + "px";
    inp.addEventListener("keydown", function (ev) {
      ev.stopPropagation();
      if (ev.key === "Enter") {
        var v = inp.value.trim();
        if (v) {
          shapes().push({ id: newId(), type: "text", t: time, p: price, s: v });
          saveStore();
          paintChip();
        }
        closeTextInput();
        setTool("cursor");
        repaint();
      } else if (ev.key === "Escape") {
        closeTextInput();
        setTool("cursor");
      }
    });
    wrap.appendChild(inp);
    els.input = inp;
    setTimeout(function () {
      try {
        inp.focus();
      } catch (e) {
        /* 무시 */
      }
    }, 0);
  }

  /* =====================================================================
   * 자판 — Delete 로 지우기, Esc 로 그리던 것 취소
   * ===================================================================== */
  function onKeyDown(ev) {
    var t = ev.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    if (ev.key === "Escape") {
      /* 브라우저 전체화면일 때의 Esc 는 브라우저가 먼저 먹습니다(이 줄까지
         오지 않습니다). 우리 방식으로 덮고 있을 때만 여기서 빠져나옵니다. */
      if (fullOn) {
        toggleFullscreen();
        return;
      }
      if (pending || chanBase) {
        pending = null;
        chanBase = null;
        hover = null;
        repaint();
      }
      askingClear = false;
      paintChip();
      closeTextInput();
      setTool("cursor");
      return;
    }
    if ((ev.key === "Delete" || ev.key === "Backspace") && selected) {
      ev.preventDefault();
      removeSelected();
    }
  }

  /* =====================================================================
   * 종목 · 봉 간격이 바뀔 때
   *   수평선        — 종목이 같으면 그대로 (봉을 바꿔도 남습니다)
   *   추세선·텍스트 — 그 봉 간격의 것만 다시 그립니다
   * ===================================================================== */
  function rescope() {
    selected = null;
    pending = null;
    chanBase = null;
    hover = null;
    cancelStroke();
    askingClear = false;
    /* 봉 간격이 바뀌면 논리 번호의 뜻이 달라집니다(1분봉 300번째 != 1일봉 300번째).
       js/chart.js 가 새로 불러온 뒤 fitContent() 를 하므로 기록만 비웁니다. */
    zoomUndo.length = 0;
    paintZoomChip();
    clearPriceLines();
    meta.at = 0;
    refreshMeta(true);
    syncPriceLines();
    paintButtons();
    paintChip();
    repaint();
  }

  /* =====================================================================
   * 시작
   * ===================================================================== */
  var started = false;

  function start() {
    if (started) return true;
    if (!ensureSeries()) return false;
    if (!restructure()) return false;
    buildChip();
    buildZoomChip();
    started = true;

    try {
      series.attachPrimitive(primitive);
    } catch (e) {
      console.warn("[chart-drawings.js] 그림판을 붙이지 못했습니다:", e);
    }
    try {
      chart.subscribeClick(onClick);
      chart.subscribeCrosshairMove(onCrosshairMove);
    } catch (e) {
      console.warn("[chart-drawings.js] 누르는 것을 받지 못했습니다:", e);
    }
    /* 브러시만 포인터를 직접 받습니다. 잡는 단계(capture)로 받아 차트가
       같이 끌려가지 않게 합니다. 브러시가 아니면 첫 줄에서 바로 돌아갑니다. */
    try {
      container.addEventListener("pointerdown", onBrushDown, true);
    } catch (e) {
      console.warn("[chart-drawings.js] 브러시를 붙이지 못했습니다:", e);
    }

    refreshMeta(true);
    syncPriceLines();
    paintChip();
    repaint();

    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", function () {
      if (!store || !store.ui || typeof store.ui.rail !== "boolean") applyRail();
      placeSoon();
    });
    /* position:fixed 라 페이지가 움직이면 칩만 따로 남습니다 — 같이 옮깁니다 */
    window.addEventListener("scroll", placeSoon, true);

    document.addEventListener("fullscreenchange", onFullChange);
    document.addEventListener("webkitfullscreenchange", onFullChange);

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", rescope);
      App.Bus.on("interval:change", rescope);
      /* 원화로 보는 회원이 있습니다. 통화가 바뀌면 피보나치·자의 글자도
         같이 바뀌어야 합니다(수평선은 가격축 라벨이라 chart.js 가 합니다). */
      App.Bus.on("currency:change", repaint);
    }
    return true;
  }

  function init() {
    store = loadStore();
    /* 껍데기는 차트가 만들어지기 전에 먼저 세웁니다.
       (차트 칸을 나중에 옮기면 차트가 한 번 다시 그려집니다) */
    restructure();
    loadSprite();
    var tries = 0;
    var timer = setInterval(function () {
      if (start() || ++tries > 200) clearInterval(timer); /* 10초까지만 기다립니다 */
    }, 50);
  }

  if (document.readyState === "loading") {
    /* 이 파일은 index.html 맨 아래에 실리므로 차트 칸 마크업은 이미 있습니다.
       main.js 가 차트를 만들기 전에 껍데기를 세워 두려고 바로 시작합니다. */
    init();
  } else {
    init();
  }

  return {
    init: init,
    setTool: setTool,
    getTool: function () {
      return tool;
    },
    removeSelected: removeSelected,
    clearAll: clearAll,
    toggleRail: toggleRail,
    isRailOpen: railOpen,
    toggleFullscreen: toggleFullscreen,
    isFullscreen: function () {
      return fullOn;
    },
    saveImage: saveImage,
    zoomTo: zoomTo,
    zoomBack: zoomBack,
    zoomReset: zoomReset,
    undoLastStroke: undoLastStroke,
    getBrushCount: brushCount,
    isBrushMode: function () {
      return !!brushSaved;
    },
    BRUSH_WIDTH: BRUSH_WIDTH,
    BRUSH_MIN_PX: BRUSH_MIN_PX,
    BRUSH_MAX_PTS: BRUSH_MAX_PTS,
    getZoomUndoDepth: function () {
      return zoomUndo.length;
    },
    ZOOM_MIN_BARS: ZOOM_MIN_BARS,
    ZOOM_UNDO_MAX: ZOOM_UNDO_MAX,
    /* 확인용 */
    getDrawings: function () {
      return { hlines: hlines().slice(), shapes: shapes().slice() };
    },
    getSelected: function () {
      return selected ? { kind: selected.kind, id: selected.id } : null;
    },
    getPerf: function () {
      return {
        draws: perf.draws,
        skipped: perf.skipped,
        avgMs: perf.draws ? perf.totalMs / perf.draws : 0,
        maxMs: perf.maxMs,
        shapes: perf.shapes
      };
    },
    resetPerf: function () {
      perf.draws = 0;
      perf.skipped = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
    },
    /* 계산부 — 테스트에서 그대로 씁니다 */
    distToSegment: distToSegment,
    fibPrice: fibPrice,
    fibName: fibName,
    fibLabel: fibLabel,
    LABEL_GAP: LABEL_GAP,
    fmtSpan: fmtSpan,
    FIB_LEVELS: FIB_LEVELS,
    TOOLS: {
      left: LEFT_TOOLS, top: TOP_TOOLS, ready: READY_TOOLS,
      twoPoint: TWO_POINT, twoTap: TWO_TAP, threeTap: THREE_TAP
    },
    /* 여러선 계산부 — 테스트에서 그대로 씁니다 */
    lineYAt: lineYAt,
    CHANNEL: { width: CHANNEL_WIDTH, dash: CHANNEL_DASH, fill: FILL_CHANNEL },
    COLORS: { draw: COLOR_DRAW, selected: COLOR_SELECTED },
    STORAGE_KEY: STORAGE_KEY
  };
})();
