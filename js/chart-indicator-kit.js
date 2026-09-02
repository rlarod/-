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
 * -- 기존 7개 파일은 한 글자도 안 건드렸습니다 -------------------------
 * js/chart-indicators.js (MA7 · MA25 · MA99 · 볼린저 · 거래량)
 * js/chart-oscillators.js (RSI · MACD)
 * js/chart-indicator-menu.js (fx 목록)
 * 셋 다 파일 자체는 그대로입니다. 이 파일을 지우면 원래 화면으로 돌아갑니다.
 *
 * ⚠️ 다만 2026-09-02 (11단계) 부터 ★MA 세 줄은 이 틀이 그립니다.★
 *    옛 파일을 고친 것이 아니라, 켤 때 옛 모듈의 공개 함수(setOn)로 옛 선을
 *    끄고 우리 줄을 옛 자리에 끼웁니다. 자세한 것은 아래 12.5절.
 *    되돌리기 - 콘솔에서 App.ChartIndicatorKit.restoreLegacyMA() 뒤 새로고침.
 * ⚠️ 2026-09-02 (12단계) 부터 ★볼린저 한 줄도 이 틀이 그립니다.★ 아래 12.6절.
 *    되돌리기 - 콘솔에서 App.ChartIndicatorKit.restoreLegacyBB() 뒤 새로고침.
 *    ★거래량 · RSI · MACD 는 아직 옛 모듈이 그립니다.★
 *
 * ⭐ 2026-09-03 (13단계) - RSI · MACD 를 옮기기 ★전에★ 틀에 없던 셋을 냈습니다.
 *    그냥 옮기면 지금 화면보다 나빠지는 것들입니다. 아래 13.1 · 13.2 · 13.3 절.
 *      13.1 scale     아래 칸 눈금 고정 (RSI 0~100). 없으면 30·70 기준선이
 *                     화면 밖으로 나가고 눈금이 매 틱 출렁입니다
 *      13.2 칸 이름표  "RSI(14)  56.9" 처럼 ★값이 같이 뜨는 줄★.
 *                     아래 칸 지표 일곱 개(KDJ·ATR·StochRSI·CCI·OBV·
 *                     Stochastic·ADX)에 이 줄이 없었습니다
 *      13.3 unit      값이 ★가격★ 인 지표는 표시 통화를 따라갑니다.
 *                     ★ATR 이 원화 회원 화면에 USDT 숫자로 떠 있었습니다★
 *    되돌리기 (13단계만) - 아래 셋을 지우면 12단계 화면 그대로입니다.
 *      1) DEF_FIELDS 에서 "scale" · "unit" 두 글자를 빼고,
 *         define() 안의 13.1 · 13.3 검사 두 토막과 defs[] 의 scale · unit 두 줄을 지웁니다
 *      2) 13.2 절(칸 이름표) 전체와, turnOn · turnOff · onTick · checkResync ·
 *         refreshLabels 안의 ensurePaneLabel / dropPaneLabel / positionPaneLabels /
 *         paintPaneLabels / refreshPaneLabelName 호출을 지웁니다
 *         injectStyle 의 .tl-kit-plabel CSS 두 줄과 init 의 currency:change 한 줄도 같이
 *      3) atr 정의의 unit: "price" 한 줄을 지웁니다
 *    tests/chart-indicator-pane-kit.test.js 와 tests/_order.txt 의 그 줄도 같이 지웁니다.
 *    ⚠️ 파일 전체를 되돌리면 11 · 12단계(MA · 볼린저 옮기기)까지 같이 풀립니다.
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
 * -- 2026-09-02 (11단계) - ★옛 MA 세 줄을 이 틀로 옮겼습니다★ ----------
 *   왜         조사팀 [A] 최우선. fx 목록 9줄 중 설정 버튼이 붙은 줄이 2줄뿐
 *              이었습니다. MA(7)·MA(25)·MA(99) 는 기간도 색도 굵기도 코드에
 *              박혀 있어 회원이 하나도 못 바꿨습니다(트레이딩뷰는 전부 바꿈).
 *   무엇을      정의 "ma" ★하나★ + 인스턴스 ★셋★ (ma-7 · ma-25 · ma-99).
 *              이제 기간 · 값 종류 · 밀기 · 색 20 · 굵기 4 · 선 모양 3 을 고릅니다.
 *   안 바꾼 것  기간 7·25·99 · 색 금/흰/회 · 굵기 1 · 실선 · ★계산값(오차 0)★
 *              더하는 순서까지 옛 computeSMA 와 같게 맞췄습니다(아래 ma 정의).
 *   옮기기      12.5절. 옛 켜짐/꺼짐을 옛 모듈에게 물어(getState) 그대로 옮기고,
 *              옛 선을 끄고(setOn), fx 목록·칩 줄에서 옛 줄을 빼고 그 자리에
 *              우리 줄을 끼웁니다. ★한 번만★ 하고 표시를 저장합니다.
 *   아직 안 옮긴 것  볼린저 · 거래량 · RSI · MACD. 다음 단계입니다.
 *
 * -- 2026-09-02 (12단계) 에 옮겨 온 것 - ★옛 볼린저★ -------------------
 *   무엇을      정의 "bb" ★하나★ + 인스턴스 ★하나★ (bb-20).
 *              이제 기간 · 표준편차 배수 · 값 종류 · 밀기 · 색 · 굵기 ·
 *              선 모양을 회원이 고칩니다(옛 것은 전부 코드에 박혀 있었습니다).
 *   안 바꾼 것  기간 20 · 배수 2 · 색 #838DA4 셋 · ★점선★ · 굵기 1 ·
 *              ★계산값(오차 0)★. 더하는 순서까지 옛 computeBB 와 같습니다.
 *              표준편차는 ★모집단★(÷p) 그대로입니다.
 *   옮기기      12.6절. 12.5절(MA)과 순서·안전장치가 같습니다.
 *   ⚠️ 아직 안 옮긴 것  거래량 · RSI · MACD.
 *      ⭐ 이 중 ★RSI 는 2026-09-03 (12.7절) 에 옮겼습니다.★ 아래 블록 참조.
 *      거래량은 chart.js 가 만든 시리즈를 켜고 끄는 것이라 "우리가 그리는"
 *      이 틀과 뿌리가 다릅니다(새로 그리면 막대가 두 벌).
 *      RSI · MACD 는 이 틀에 아직 없는 것 셋을 씁니다 -
 *      ① 눈금 0~100 고정(autoscaleInfoProvider) ② 칸 이름표(값이 같이 뜸)
 *      ③ 표시 통화를 따라가는 숫자 형식(MACD 는 가격 차이라 원화로 봅니다).
 *      셋을 이 틀에 먼저 내지 않고 옮기면 회원 화면이 달라집니다.
 *
 * -- 2026-09-03 (12.7단계) 에 옮겨 온 것 - ★옛 RSI(14)★ ----------------
 *   무엇을      정의 "rsi" ★하나★ + 인스턴스 ★하나★ (rsi-14).
 *               ★옛 모듈이 다릅니다★ - js/chart-oscillators.js(3단계)가
 *               그리던 것입니다. MA · 볼린저는 js/chart-indicators.js 였습니다.
 *   안 바꾼 것  기간 14 · 색 #E7ECF5 · 실선 · 굵기 1 · 기준선 70 · 30 ·
 *               눈금 0~100 고정 · 여백 0.12 · ★계산값(옛 computeRSI 와 오차 0)★
 *   이제 되는 것 기간 · 값 종류 · 색 20 · 굵기 4 · 선 모양 3 을 회원이 고릅니다
 *               (옛 RSI 는 전부 코드에 박혀 있어 하나도 못 바꿨습니다)
 *   옮기기      12.7절. 12.5 · 12.6절과 순서·안전장치가 같습니다.
 *   되돌리기    콘솔에서 App.ChartIndicatorKit.restoreLegacyRSI() 뒤 새로고침.
 *
 * -- 2026-09-03 (12.8단계) 에 옮겨 온 것 - ★옛 MACD(12,26,9)★ --------------
 *   무엇을      정의 "macd" ★하나★ + 인스턴스 ★하나★ (macd-12-26-9).
 *               RSI 와 같은 js/chart-oscillators.js 것입니다.
 *               ★이 틀에서 막대(kind:"hist") 를 쓰는 첫 지표★ 입니다 -
 *               틀에 길만 있고 아무도 안 써 본 길이었습니다.
 *   안 바꾼 것  12/26/9 · 색 셋(#838DA4 막대 · #E7ECF5 MACD · #F0B429 신호선) ·
 *               굵기 1 실선 · 0선 · 여백 0.15 · ★계산값(옛 computeMACD 와 오차 0)★
 *   ⭐ unit: "price" - MACD 는 ★가격 차이★ 라 표시 통화를 따라갑니다.
 *      옛 모듈의 macdPriceFormat() 이 하던 일을 틀의 13.3 이 대신합니다.
 *      안 붙이면 원화 회원 화면에 USDT 숫자가 뜹니다(ATR 과 같은 조용한 고장).
 *   이제 되는 것 빠른·느린·신호선 기간 · 값 종류 · 색 20 · 굵기 4 · 선 모양 3
 *   옮기기      12.8절. 12.5 ~ 12.7절과 순서·안전장치가 같습니다.
 *   되돌리기    콘솔에서 App.ChartIndicatorKit.restoreLegacyMACD() 뒤 새로고침.
 *   ⚠️ 아직 안 옮긴 것  거래량.
 *
 * -- 2026-09-02 (10단계) 에 늘어난 것 - 지표 4개 + ★색 겹침 마무리★ ----
 *   Stochastic  %K 14 · 다듬기 1 · %D 3 · 기준선 20 · 80   (트레이딩뷰 내장)
 *   ADX / DMI   DI 14 · ADX 14 · 기준선 없음               (트레이딩뷰 도움말)
 *   Supertrend  ATR 10 · 배수 3 · ★뒤집히는 자리에서 선이 끊김★ (Pine ta.supertrend 원문)
 *   Ichimoku    9 · 26 · 52 · 밀기 26 · ★구름(면) 포함★     (트레이딩뷰 도움말 + 실측)
 * ★기본 인스턴스는 이번에도 안 늘렸습니다★ - "지표 추가" 목록에만 나옵니다.
 *
 *   ⭐ 틀에 새로 낸 길 세 가지
 *      ① outputs[].shift   ★선 하나만★ 앞뒤로 밀기. 일목 선행스팬 +26 ·
 *                          후행스팬 -26. 숫자 또는 설정값을 받는 함수.
 *                          회원이 고르는 밀기(off)와 ★더해집니다.★
 *                          "아직 없는 시간에 점 찍기" 는 3절 timeAtIndex 가
 *                          이미 하던 일이라(마지막 봉 간격만큼 늘려 잡음)
 *                          새로 만들 것이 없었습니다.
 *      ② step 이 ★null★ 을 내면 "여기는 비운다"  Supertrend 가 뒤집히는
 *                          자리에서 선을 끊는 데 씁니다. seed 는 값 없는 점
 *                          ({time} 만)을 찍습니다.
 *      ③ clouds            선 두 개 ★사이를 칠하는 면★. 라이브러리에 면
 *                          시리즈가 없어서 ★공개 API 인 시리즈 덧그리개
 *                          (attachPrimitive)★ 로 냈습니다. guides 와 같은
 *                          모양으로 정의가 한 줄만 적습니다.
 *                          ★색은 새로 안 만들었습니다★ - 그 두 선의 색을
 *                          옅게(18%) 깝니다. 실측은 CLOUD_ALPHA 주석에.
 *                          확인용 - getCloudCountForTest · getCloudStatForTest
 *
 *   ⭐ 색 겹침을 마저 잡았습니다 (기록팀이 찾아 준 것)
 *      · 남아 있던 것 - ★얹는 순서★ 를 바꾸면 겹쳤습니다. 설정 창이 첫 선
 *        색만 바꿔 줘서, 선이 여럿인 지표(KDJ 3선 · 일목 5선)를 나중에 얹으면
 *        둘째 · 셋째 선이 정의 기본색 그대로 이미 쓰인 색을 집었습니다.
 *      · 고친 곳 세 군데 (전부 이 파일)
 *          autoColors()      createInstance 가 ★모든 출력선★ 을 채웁니다
 *          paneGroupOf()     색이 다 찼을 때 ★같은 바닥★ 만 피하면 되게
 *                            (아래 칸 지표는 켤 때 자기 칸을 새로 만듭니다)
 *          suggestColor()    다 찼을 때 아무 색이나 내던 물러설 자리를,
 *                            ★주 차트에 없는 색★ 으로 바꿨습니다
 *      · 실측 (정의 13개 · 회원 경로 그대로 · 무작위 600순서)
 *          고치기 전   같은 바닥 겹침 287 / 600
 *          고친 뒤     같은 바닥 겹침   0 / 600  (결정적 순서 15가지도 0)
 *      ⚠️ 선 26개 · 색 20개라 ★화면 전체★ 에서 다 다르게는 못 합니다.
 *         다른 칸끼리 같은 색인 것은 남습니다 - 같은 눈금 위에 안 놓이므로
 *         한 줄로 보이지 않습니다. 색을 더 늘리는 것도 재 봤는데,
 *         조건을 지키며 10색을 더 뽑으면 ΔE2000 바닥이 9.71 -> ★6.61★ 로
 *         내려앉습니다(사람 눈에 거의 같은 색 쌍이 생깁니다). 그래서
 *         ★색을 늘리지 않고 같은 바닥만 지키는 쪽★ 을 골랐습니다.
 *
 * -- 되돌리기 ---------------------------------------------------------
 *   ⚠️ 11단계(MA 옮기기) 부터는 ★순서★ 가 있습니다.
 *   0) 먼저 콘솔에서  App.ChartIndicatorKit.restoreLegacyMA()  → 새로고침
 *      그리고     App.ChartIndicatorKit.restoreLegacyBB()  → 새로고침
 *      그리고     App.ChartIndicatorKit.restoreLegacyRSI() → 새로고침
 *      그리고     App.ChartIndicatorKit.restoreLegacyMACD() → 새로고침
 *      (안 하면 옛 MA · 옛 볼린저가 꺼진 채로 남습니다 - 이 파일이 옛 모듈의
 *       setOn 으로 꺼 두었기 때문입니다. 회원마다 브라우저에서 한 번씩 해야
 *       합니다. 못 하면 회원이 fx 목록에서 다시 켜면 됩니다.)
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
    "id", "name", "note", "pane", "params", "inputs", "outputs", "guides", "clouds",
    "nameOf", "seed", "step", "useSource", "srcDefault", "useOffset", "band",
    /* 2026-09-03 (13단계) - 두 칸이 늘었습니다. 아래 13.1 · 13.3 절 참조.
       scale  아래 칸의 세로 눈금을 고정합니다 (RSI 의 0~100)
       unit   그 지표의 값이 ★가격★ 이라 표시 통화를 따라갑니다 (ATR · MACD) */
    "scale", "unit"
  ];

  /* ---------------------------------------------------------------------
   * 13.3 ★값의 단위★ - 표시 통화를 따라갈 것인가
   *
   * 캔들 데이터는 ★항상 USDT★ 입니다(js/chart.js:155). 그런데 화면 표시 통화는
   * 회원마다 다릅니다 - 원화로 보는 회원이 있습니다(App.Config.getDisplayCurrency).
   *
   * ⚠️ ATR 과 MACD 는 ★가격★ 입니다. ATR(14) 이 120.45 라면 "120.45 USDT" 라는
   *    뜻인데, 원화로 보는 회원 화면에도 그냥 120.45 로 떴습니다 -
   *    오류 0건 · 화면 멀쩡 · 회원은 그게 USDT 인 줄 모릅니다.
   *    이 프로젝트가 "조용한 고장" 이라 부르는 그 모양입니다.
   *
   *    unit: "price" 를 적어 두면 눈금 라벨도 칸 이름표도 표시 통화를 따라가고,
   *    통화를 바꾸면 그 자리에서 다시 씁니다(아래 applyCurrency).
   *
   * ⚠️ 아무 지표에나 붙이면 안 됩니다.
   *      가격이다   (붙인다)   ATR · MACD
   *      가격이 아니다         RSI · KDJ · CCI · Stochastic · ADX  (0~100 · 지수)
   *                            OBV                                  (거래량 누적)
   *    OBV 에 붙이면 거래량이 원화로 환산돼 ★뜻이 없는 숫자★ 가 됩니다.
   *
   * ⚠️ 주 칸(main)에는 붙이지 않습니다. 거기 선들은 캔들과 같은 가격축을 쓰고,
   *    그 축의 글자는 js/chart.js 가 이미 통화에 맞춰 만듭니다(두 벌 금지).
   * ------------------------------------------------------------------- */
  var ALLOWED_UNITS = ["price"];

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
      /* 선 하나만 앞뒤로 밀기 - 일목균형표의 선행스팬(+26) · 후행스팬(-26).
         회원이 고치는 "앞뒤로 밀기(off)" 와 ★더해집니다.★ 이건 정의가 못 바꾸는
         그 지표의 성질이고, off 는 회원 취향입니다. */
      if (o.shift !== undefined && !isFn(o.shift)) {
        if (typeof o.shift !== "number" || !isFinite(o.shift) || (o.shift | 0) !== o.shift) {
          return no("outputs[" + i + "].shift 은 정수 봉 개수(또는 설정값을 받는 함수)여야 합니다: " + def.id);
        }
        if (o.shift > MAX_OFFSET || o.shift < -MAX_OFFSET) return no("shift 이 너무 큽니다: " + def.id);
      }
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

    /* =====================================================================
     * 13.1 ★눈금 고정★ - scale: { min, max, top, bottom }
     *
     * 왜 필요한가 - RSI 는 0~100 이 정해진 지표입니다. 눈금을 데이터에만
     * 맞추면 값이 40~60 사이에서 놀 때 눈금이 40~60 으로 좁아지고,
     * 30 · 70 기준선이 ★화면 밖★ 으로 나갑니다. 기준선이 없으면 RSI 를
     * 읽을 수가 없습니다(과매수 · 과매도가 그 두 줄이라서).
     * 게다가 눈금이 매 틱 출렁여서 선이 위아래로 춤춥니다.
     *
     * 바이낸스 선물 · 트레이딩뷰 둘 다 RSI 칸을 0~100 으로 잡습니다.
     * js/chart-oscillators.js:702 가 몇 달째 이 방식으로 돌고 있습니다 -
     * ★같은 방식★ 을 틀로 옮겨온 것이고, 새로 만든 것이 아닙니다.
     *
     *   min · max    있으면 그 범위로 고정합니다(autoscaleInfoProvider)
     *   top · bottom 칸 위 · 아래 여백 비율(0~0.45). 없으면 라이브러리 기본
     *
     * ⚠️ 주 칸(main)에는 못 씁니다 - 캔들과 같은 가격축이라 0~100 으로
     *    고정하면 캔들이 사라집니다. 그래서 아래에서 거부합니다.
     * ===================================================================== */
    var scale = null;
    if (def.scale !== undefined && def.scale !== null) {
      var sc = def.scale;
      if (typeof sc !== "object") return no("scale 은 객체여야 합니다: " + def.id);
      if (def.pane !== "sub") return no("scale 은 아래 칸(sub) 지표에만 씁니다: " + def.id);
      var hasMin = sc.min !== undefined && sc.min !== null;
      var hasMax = sc.max !== undefined && sc.max !== null;
      if (hasMin !== hasMax) return no("scale 의 min 과 max 는 같이 적어야 합니다: " + def.id);
      if (hasMin) {
        if (typeof sc.min !== "number" || !isFinite(sc.min)) return no("scale.min 이 숫자가 아닙니다: " + def.id);
        if (typeof sc.max !== "number" || !isFinite(sc.max)) return no("scale.max 가 숫자가 아닙니다: " + def.id);
        if (sc.max <= sc.min) return no("scale.max 가 scale.min 보다 커야 합니다: " + def.id);
      }
      var mar = {};
      var mbad = null;
      ["top", "bottom"].forEach(function (mk) {
        if (sc[mk] === undefined || sc[mk] === null) return;
        if (typeof sc[mk] !== "number" || !isFinite(sc[mk]) || sc[mk] < 0 || sc[mk] > 0.45) {
          mbad = "scale." + mk + " 은 0 이상 0.45 이하여야 합니다";
          return;
        }
        mar[mk] = sc[mk];
      });
      if (mbad) return no(mbad + ": " + def.id);
      scale = {
        min: hasMin ? sc.min : null,
        max: hasMin ? sc.max : null,
        top: mar.top === undefined ? null : mar.top,
        bottom: mar.bottom === undefined ? null : mar.bottom
      };
    }

    /* 13.3 값의 단위 - 위 ALLOWED_UNITS 주석 참조 */
    var unit = null;
    if (def.unit !== undefined && def.unit !== null) {
      if (ALLOWED_UNITS.indexOf(def.unit) < 0) {
        return no("unit 은 " + ALLOWED_UNITS.join(" · ") + " 중 하나여야 합니다(" + def.unit + "): " + def.id);
      }
      if (def.pane !== "sub") return no("unit 은 아래 칸(sub) 지표에만 씁니다: " + def.id);
      unit = def.unit;
    }

    /* 구름(면) - 선 두 개 ★사이를 칠하는 것★. 일목균형표의 구름입니다.
       색은 못 고릅니다 - 그 두 선의 색을 그대로 옅게 씁니다(아래 cloudFill).
       새 색을 만들지 않으려고 이렇게 했습니다. */
    var clouds = [];
    var outKeys = {};
    for (var oi = 0; oi < def.outputs.length; oi++) outKeys[def.outputs[oi].key] = true;
    var csrc = def.clouds || [];
    for (var ci = 0; ci < csrc.length; ci++) {
      var cl = csrc[ci];
      if (!cl || !outKeys[cl.a] || !outKeys[cl.b]) {
        return no("clouds[" + ci + "] 의 a · b 가 outputs 에 없습니다: " + def.id);
      }
      if (cl.a === cl.b) return no("clouds[" + ci + "] 의 a 와 b 가 같습니다: " + def.id);
      clouds.push({ a: cl.a, b: cl.b });
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
      clouds: clouds,
      nameOf: isFn(def.nameOf) ? def.nameOf : null,
      /* ★밴드★ - 위·중간·아래처럼 ★같은 뜻의 선 묶음★ 이라 한 색으로 그립니다.
         트레이딩뷰도 밴드는 한 덩어리로 봅니다. 이 표시가 있으면
         autoColors 가 선마다 다른 색을 뿌리지 않고 ★한 색을 함께★ 줍니다.
         ⚠️ 아무 지표에나 붙이면 안 됩니다 - KDJ 의 K·D·J 처럼 ★뜻이 다른★
            선은 색으로 갈려야 합니다. tests/chart-indicator-color-collision.test.js
            가 "밴드로 선언한 정의" 목록을 따로 들고 이 값과 대조합니다. */
      band: !!def.band,
      /* 13.1 눈금 고정 · 13.3 값의 단위 - 위 검사에서 다듬은 값만 담습니다 */
      scale: scale,
      unit: unit,
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
        band: !!d.band,
        params: copy(d.params),
        inputs: inputsOf(d.id),
        unit: d.unit,
        scale: d.scale ? copy(d.scale) : null,
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

    /* ⭐ ★태생값★ - 이 줄이 ★처음 얹혔을 때의 모습★ 입니다. 설정 창의
       "기본값" 버튼이 되돌아갈 자리이고, 여기 말고 다른 곳에 두지 않습니다.
       (자세한 것은 아래 defaultsOf / resetInstance 의 주석) */
    insts[id].born = bornOf(id, opts.born);

    instOrder.push(id);
    return id;
  }

  /* =====================================================================
   * ⭐⭐ 태생값(born) - "기본값" 버튼이 되돌아갈 자리
   *
   * -- 2026-09-02 (13단계) 에 라이브에서 잡힌 것 -------------------------
   * 설정 창의 "기본값" 을 누르면 ★정의(define)의 기본값★ 으로 되돌아갔습니다.
   * 그런데 옮겨 온 줄들은 ★자기만의 태생값★ 이 따로 있습니다.
   *     ma-25   전 기간 25 · 흰 #E7ECF5   ->  후 기간 9 · ★금 #F0B429★
   *     ma-99   전 기간 99 · 회 #838DA4   ->  후 기간 9 · ★금 #F0B429★
   *     ema-21  전 기간 21 · #BA6EED      ->  후 기간 9 · ★#49C9E9★
   * 되돌린 뒤 MA(7)(금색)과 ★한 줄로 보였습니다★ - 오류 0건 · 화면 멀쩡.
   * 2026-08-31 "시세선과 MA7 이 둘 다 금색" 과 같은 계열입니다.
   *
   * -- 그래서 인스턴스가 자기 태생값을 들고 다닙니다 ---------------------
   * 만들어질 때의 기간 · 색 · 굵기 · 선 모양을 그대로 적어 두고, "기본값" 은
   * ★그 값★ 으로 되돌립니다. 회원이 새로 얹은 줄은 태생값이 곧 정의 기본값이라
   * 지금과 똑같이 동작합니다.
   *
   * ⚠️ 회원이 바꿔 둔 값은 건드리지 않습니다 - "기본값" 을 누를 때만 돌아갑니다.
   * ⚠️ 저장칸에 같이 넣습니다. 안 넣으면 새로고침 한 번에 태생값을 잊습니다.
   *    ★옛 회원 브라우저에는 태생값이 없습니다★ - 그때는 아래 defaultsOf 가
   *    기본 인스턴스 목록(DEFAULT_INSTANCES)에서 찾아 되살립니다.
   * ===================================================================== */

  /** 저장된(또는 갓 만든) 태생값을 깨끗하게 다듬습니다. */
  function bornOf(id, raw) {
    var it = insts[id];
    var d = it && defs[it.def];
    if (!d) return null;

    /* 저장칸은 회원 브라우저에 있어 손댈 수 있습니다 - 그대로 믿지 않습니다 */
    var src = raw && typeof raw === "object" ? raw : null;
    if (!src) {
      var seed = defaultsOf(it.def, id);
      src = seed || { params: it.params, colors: it.colors, style: it.style, width: it.width };
    }

    var hexes = colorHexes();
    var colors = {};
    d.outputs.forEach(function (o) {
      var want = src.colors && src.colors[o.key];
      colors[o.key] = want && hexes.indexOf(want) >= 0 ? want : o.color;
    });

    return {
      params: cleanParams(it.def, src.params),
      colors: colors,
      style: ALLOWED_STYLES.indexOf(src.style) >= 0 ? src.style : null,
      width: ALLOWED_WIDTHS.indexOf(src.width | 0) >= 0 ? src.width | 0 : DEFAULT_WIDTH
    };
  }

  /** 옛 회원 브라우저용 - 기본 인스턴스 목록에서 그 줄의 태생값을 찾습니다.
   *  없으면 null(= 정의 기본값이 곧 태생값. 회원이 새로 얹은 줄이 그렇습니다). */
  function defaultsOf(defId, id) {
    for (var i = 0; i < DEFAULT_INSTANCES.length; i++) {
      var s = DEFAULT_INSTANCES[i];
      if (s.id !== id || s.def !== defId) continue;
      return { params: s.params, colors: s.colors, style: s.style, width: s.width };
    }
    return movedDefaultsOf(defId, id);
  }

  /* ⭐ 옮겨 온 줄 중 ★기본 인스턴스 목록(DEFAULT_INSTANCES)에 없는 것★ 의 태생값.
     12.7절 RSI 가 그렇습니다(왜 안 넣었는지는 그 절에 적었습니다).
     "기본값" 버튼이 돌아갈 자리는 그래도 있어야 합니다 - 옮길 때 쓴 값 그대로
     ★여기 한 곳★ 에서 답합니다(MOVED_RSI 를 다시 읽습니다. 값 두 벌 금지).
     ⚠️ 이게 없으면 옛 저장값에 태생값이 없는 회원이 "기본값" 을 눌렀을 때
        그때 화면에 있던 값이 태생값으로 굳습니다(어젯밤 P2 와 같은 계열). */
  function movedDefaultsOf(defId, id) {
    if (defId === "rsi" && id === MOVED_RSI.id) {
      return {
        params: { p: MOVED_RSI.p },
        colors: { rsi: MOVED_RSI.hex },
        style: "solid",
        width: DEFAULT_WIDTH
      };
    }
    /* 12.8절 MACD 도 같은 이유로 기본 목록에 없습니다 */
    if (defId === "macd" && id === MOVED_MACD.id) {
      return {
        params: { fast: MOVED_MACD.fast, slow: MOVED_MACD.slow, sig: MOVED_MACD.sig },
        colors: copy(MOVED_MACD.colors),
        style: "solid",
        width: DEFAULT_WIDTH
      };
    }
    return null;
  }

  /** 그 선이 실제로 그려지는 선 모양 - 인스턴스가 정한 것이 우선입니다
   *  (addSeriesFor 의 styleOf(it.style || out.style) 와 같은 순서). */
  function styleKeyOf(it, out) {
    return it.style || out.style || "solid";
  }

  /** 같은 칸에서 ★색도 선 모양도 같은★ 다른 줄이 쓰고 있는 색.
   *  점선 ↔ 실선은 눈으로 갈리므로 한 줄로 안 봅니다(볼린저 ↔ MA(99)). */
  function lookAlikeMap(it, styleKey) {
    var group = paneGroupOf(it);
    var m = {};
    instOrder.forEach(function (iid) {
      if (iid === it.id) return;
      var o = insts[iid];
      if (!o || paneGroupOf(o) !== group) return;
      var od = defs[o.def];
      if (!od) return;
      od.outputs.forEach(function (x) {
        if (styleKeyOf(o, x) !== styleKey) return;
        m[o.colors[x.key]] = true;
      });
    });
    return m;
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

  /** 켤 때 한 번. off 가 0 이면 원본 배열을 그대로 씁니다(복사 안 함).
   *  ⚠️ value 가 없는 점(빈 점)도 그대로 옮깁니다 - Supertrend 처럼 ★끊어 그려야★
   *     하는 지표가 { time } 만 있는 점으로 구멍을 냅니다(라이브러리 whitespace).
   *     값을 넣어 버리면 끊긴 자리가 이어져 화면을 가로지릅니다. */
  function shiftPoints(arr, off, map) {
    if (!off || !arr || !arr.length) return arr || [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var at = map[arr[i].time];
      if (at === undefined) continue;
      var t = timeAtIndex(at + off);
      if (t === null) continue;
      if (typeof arr[i].value === "number") out.push({ time: t, value: arr[i].value });
      else out.push({ time: t });
    }
    return out;
  }

  /** 정의가 그 선에만 걸어 둔 밀기 (일목 선행스팬 +26 · 후행스팬 -26).
   *  밀기가 설정값을 따라가는 지표(일목의 "밀기 26")가 있어서 함수도 받습니다. */
  function shiftOfOut(out, prm) {
    if (!out) return 0;
    var v = out.shift;
    if (isFn(v)) {
      try {
        v = v(prm || {});
      } catch (e) {
        return 0;
      }
    }
    if (typeof v !== "number" || !isFinite(v)) return 0;
    v = v | 0;
    if (v > MAX_OFFSET) return MAX_OFFSET;
    if (v < -MAX_OFFSET) return -MAX_OFFSET;
    return v;
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

  /* ---------------------------------------------------------------------
   * 13.3 표시 통화 - 값이 ★가격★ 인 지표(unit:"price")의 숫자 만들기
   *
   * js/chart-oscillators.js:604 macdPriceFormat() 과 ★같은 방식★ 입니다.
   * 데이터는 그대로 두고(항상 USDT) 보이는 글자만 바꿉니다.
   * 계산식을 우리가 다시 쓰지 않습니다 - App.Utils 하나만 부릅니다.
   * ------------------------------------------------------------------- */
  function isKRW() {
    try {
      return !!(App.Config && isFn(App.Config.getDisplayCurrency) && App.Config.getDisplayCurrency() === "KRW");
    } catch (e) {
      return false;
    }
  }

  /** 가격 한 개를 표시 통화 글자로. App.Utils 가 없으면 숫자 그대로. */
  function priceText(v) {
    if (v === null || v === undefined || typeof v !== "number" || !isFinite(v)) return "-";
    try {
      if (App.Utils && isFn(App.Utils.formatCurrencyPlain)) return App.Utils.formatCurrencyPlain(v);
    } catch (e) {
      /* 아래 기본 표시로 */
    }
    return v.toFixed(2);
  }

  function priceUnitFormat() {
    return {
      type: "custom",
      minMove: isKRW() ? 1 : 0.01,
      formatter: priceText
    };
  }

  /** 13.1 눈금 고정 - 데이터와 상관없이 늘 같은 범위를 돌려줍니다 */
  function fixedScaleProvider(sc) {
    return function () {
      return { priceRange: { minValue: sc.min, maxValue: sc.max } };
    };
  }

  /** 13.1 칸 위·아래 여백. 시리즈 하나에만 걸면 그 칸 전체에 걸립니다. */
  function applyScaleMargins(host, d) {
    if (!host || !d || !d.scale) return false;
    var m = {};
    if (d.scale.top !== null) m.top = d.scale.top;
    if (d.scale.bottom !== null) m.bottom = d.scale.bottom;
    if (m.top === undefined && m.bottom === undefined) return false;
    try {
      host.priceScale().applyOptions({ scaleMargins: m });
      return true;
    } catch (e) {
      return false;
    }
  }

  function addSeriesFor(it, out, pane) {
    var lc = LC();
    var d = defs[it.def];
    var kind = out.kind || "line";
    var opts = {
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: it.pane === "sub",
      crosshairMarkerVisible: false,
      color: it.colors[out.key] || out.color
    };
    /* 13.3 값이 가격이면 눈금 글자가 표시 통화를 따라갑니다 (ATR · MACD) */
    if (d && d.unit === "price") opts.priceFormat = priceUnitFormat();
    /* 13.1 눈금 고정 (RSI 0~100). 아래 칸에서만 - 위에서 main 은 거부합니다 */
    if (d && d.scale && d.scale.min !== null) opts.autoscaleInfoProvider = fixedScaleProvider(d.scale);
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

  /* =====================================================================
   * 13.2 ★칸 이름표★ - "RSI(14)  56.9" 처럼 ★값이 같이 뜨는 줄★
   *
   * -- 왜 필요한가 ------------------------------------------------------
   * 아래 칸에 지표를 켜면 선만 뜨고 ★그 선이 무엇인지도, 지금 값이 얼마인지도★
   * 안 보였습니다(KDJ · ATR · StochRSI · CCI · OBV · Stochastic · ADX 일곱 개).
   * 칩 줄에 이름이 있긴 하지만 차트 맨 위라 아래 칸과 멀고, 값은 아예 없습니다.
   * 트레이딩뷰는 칸마다 왼쪽 위에 "이름 + 지금 값" 을 띄웁니다. 차트 시스템은
   * 트레이딩뷰를 따라간다는 지시(2026-09-02)에 맞춥니다.
   *
   * -- 라이브러리 DOM 을 건드리지 않습니다 -------------------------------
   * js/chart-oscillators.js:521 이 몇 달째 쓰고 있는 방식 그대로입니다.
   * pane.getHTMLElement() 는 이 번들에서 null 을 돌려줍니다(3단계 실측).
   * 그래서 차트가 만든 표의 줄(tr) 위치를 ★재서★ .chart-wrap 위에 얹기만 합니다.
   * 라이브러리가 만든 요소 안에 아무것도 넣지 않습니다.
   *
   * -- 글씨 크기 12px - ★재서 골랐습니다★ (2026-09-03 실측) ---------------
   * 트레이딩뷰 실측(1920 · BINANCE:BTCUSDT.P) - 지표 상태줄 "Vol · BTC 117.26 K"
   *   font-size 13px · weight 400 · 줄 높이 24px · 칸 왼쪽에서 8px
   * 우리도 왼쪽 8px 은 같습니다. 글씨만 12px 입니다 - 13px 이 안 되는 이유는
   * ★360 에서 가격축에 닿기 때문★ 입니다.
   *   360 실측 (가장 긴 이름 StochRSI(14,14,3,3) + 값 2개 · 칸 폭 330px ·
   *             가격축 왼끝 258.5px)
   *     11px  글자폭 215.0  축까지 여유 35.5px
   *     12px  글자폭 215.0  축까지 여유 35.5px   <- ★폭이 안 늘고 글자만 커집니다★
   *     13px  글자폭 244.0  축까지 여유  6.5px   <- 이름이 조금만 길어도 물립니다
   *   고정폭 글꼴이라 11px 과 12px 의 한 글자 폭이 둘 다 7px 입니다.
   *   ★같은 자리에서 글씨만 커지는 공짜 한 칸★ 이라 12px 로 올렸습니다.
   * 옛 아래칸 이름표(.tl-osc-label 10px)보다 2px 큽니다. ★줄인 것이 없습니다.★
   * pointer-events:none 이라 눌러야 할 것을 가리지 않고, 한 줄 높이만 씁니다.
   *
   * -- 성능 -------------------------------------------------------------
   * 글자는 ★초당 5번까지만★ 다시 씁니다(옛 모듈과 같은 200ms). 시세는 그보다
   * 훨씬 자주 옵니다. 값 자체는 onTick 이 이미 계산한 것을 받아 적기만 합니다 -
   * 이름표 때문에 다시 계산하는 것은 없습니다.
   * ===================================================================== */
  var paneLabelPaintAt = 0;

  function chartWrap() {
    return document.querySelector(".chart-panel .chart-wrap") || document.querySelector(".chart-wrap");
  }

  /** 칸마다 한 줄(tr). 맨 마지막 줄은 시간축이라 뺍니다. */
  function paneRows() {
    try {
      var el = chart && isFn(chart.chartElement) ? chart.chartElement() : null;
      if (!el) return [];
      var rows = el.querySelectorAll("tr");
      var out = [];
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].children && rows[i].children.length === 3) out.push(rows[i]);
      }
      if (out.length) out.pop();
      return out;
    } catch (e) {
      return [];
    }
  }

  /** 값 한 개를 글자로. 가격이면 표시 통화를 따라갑니다(13.3). */
  function valueText(d, v) {
    if (v === null || v === undefined || typeof v !== "number" || !isFinite(v)) return "-";
    if (d && d.unit === "price") return priceText(v);
    return v.toFixed(2);
  }

  /** 켤 때 seed 결과에서 "지금 값" 을 꺼냅니다(뒤에서부터 첫 숫자). */
  function lastValueOf(arr) {
    if (!arr || !arr.length) return null;
    for (var i = arr.length - 1; i >= 0; i--) {
      var v = arr[i] && arr[i].value;
      if (typeof v === "number" && isFinite(v)) return v;
    }
    return null;
  }

  function ensurePaneLabel(it) {
    if (!it || it.pane !== "sub" || !it.live || it.live.label) return;
    var d = defs[it.def];
    if (!d) return;
    var wrap = chartWrap();
    if (!wrap) return;
    injectStyle();
    try {
      var el = document.createElement("div");
      el.className = "tl-kit-plabel";
      el.setAttribute("data-kit", it.id);
      var nm = document.createElement("span");
      nm.className = "tl-kit-pname";
      nm.textContent = nameOfInst(it);
      el.appendChild(nm);
      var parts = {};
      for (var i = 0; i < d.outputs.length; i++) {
        var o = d.outputs[i];
        var b = document.createElement("b");
        b.style.color = it.colors[o.key] || o.color;
        b.textContent = "-";
        el.appendChild(b);
        parts[o.key] = b;
      }
      wrap.appendChild(el);
      it.live.label = { el: el, parts: parts };
    } catch (e) {
      /* 이름표를 못 만들어도 지표 자체는 그대로 그려집니다 */
    }
  }

  function dropPaneLabel(it) {
    if (!it || !it.live || !it.live.label) return;
    var el = it.live.label.el;
    it.live.label = null;
    try {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    } catch (e) {
      /* 무시 */
    }
  }

  /** 칸이 늘거나 줄면 자리가 밀립니다. 그때마다 다시 잽니다. */
  function positionPaneLabels() {
    var i;
    var any = false;
    for (i = 0; i < instOrder.length; i++) {
      var t = insts[instOrder[i]];
      if (t && t.live && t.live.label) { any = true; break; }
    }
    if (!any) return;
    var wrap = chartWrap();
    if (!wrap) return;
    var rows = paneRows();
    if (!rows.length) return;
    var wr;
    try {
      wr = wrap.getBoundingClientRect();
    } catch (e) {
      return;   /* 아직 화면에 안 붙었으면 다음 기회에 */
    }
    for (i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it || !it.live || !it.live.label || !it.live.pane) continue;
      var idx = -1;
      try {
        idx = isFn(it.live.pane.paneIndex) ? it.live.pane.paneIndex() : -1;
      } catch (e) {
        idx = -1;
      }
      if (idx < 0 || idx >= rows.length) continue;
      var r = rows[idx].getBoundingClientRect();
      it.live.label.el.style.top = Math.round(r.top - wr.top + 2) + "px";
    }
  }

  /** 이름표의 숫자를 다시 씁니다. force 가 아니면 초당 5번까지만. */
  function paintPaneLabels(force) {
    var t = Date.now();
    if (!force && t - paneLabelPaintAt < 200) return;
    paneLabelPaintAt = t;
    for (var i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it || !it.on || !it.live || it.pane !== "sub") continue;
      ensurePaneLabel(it);
      if (!it.live.label) continue;
      var d = defs[it.def];
      var vals = it.live.vals || {};
      var parts = it.live.label.parts;
      for (var k in parts) {
        var txt = valueText(d, vals[k]);
        if (parts[k].textContent !== txt) parts[k].textContent = txt;
      }
    }
  }

  /** 이름표에 적힌 이름을 다시 씁니다(기간을 바꾸면 이름이 바뀝니다). */
  function refreshPaneLabelName(it) {
    if (!it || !it.live || !it.live.label) return;
    var nm = it.live.label.el.querySelector(".tl-kit-pname");
    if (nm) nm.textContent = nameOfInst(it);
  }

  /* ---------------------------------------------------------------------
   * 13.3 표시 통화가 바뀌면 - 값이 가격인 지표만 다시 씁니다.
   * 데이터는 한 점도 안 건드립니다. 눈금 글자와 이름표 글자만 바뀝니다.
   * ------------------------------------------------------------------- */
  function applyCurrency() {
    var f = null;
    for (var i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it || !it.live) continue;
      var d = defs[it.def];
      if (!d || d.unit !== "price") continue;
      if (!f) f = priceUnitFormat();
      for (var k in it.live.series) {
        try {
          it.live.series[k].applyOptions({ priceFormat: f });
        } catch (e) {
          /* 하나가 실패해도 나머지는 바꿉니다 */
        }
      }
    }
    paintPaneLabels(true);
  }



  /* ---------------------------------------------------------------------
   * 구름 - ★선 두 개 사이를 칠하는 것★. 일목균형표의 구름입니다.
   *
   * ⚠️ lightweight-charts 5.2.0 에는 "면" 시리즈가 없습니다. 대신 ★시리즈에
   *    덧그리개(primitive)를 붙이는 길★ 이 열려 있습니다. 라이브러리 원본에서
   *    확인한 것 (dist 안) -
   *        attachPrimitive(t){this.ae.hl(t),t.attached&&t.attached({chart:...,series:this,...})}
   *        detachPrimitive(t){...}
   *    그리고 paneViews / zOrder / useMediaCoordinateSpace 가 다 들어 있습니다.
   *    그래서 새 그리기 방식을 만들지 않고 ★공개 API 로만★ 칠합니다.
   *
   * ⭐ 색을 ★새로 만들지 않습니다.★ 트레이딩뷰는 구름을 초록 · 빨강으로 칠하는데
   *    우리 규칙에서 상승 #26C281 · 하락 #F0506E 는 지표에 못 씁니다(손익 색과
   *    헷갈립니다). 그래서 ★그 두 선이 이미 쓰고 있는 색★ 을 옅게(알파 0.13)
   *    깔았습니다. 위에 있는 선의 색으로 칠하므로 "어느 쪽이 위인가" 는
   *    트레이딩뷰와 똑같이 색으로 읽힙니다. 새 hex 는 한 개도 안 늘었습니다.
   *
   * ⚠️ 캔들 뒤에 깝니다(zOrder "bottom"). 캔들을 덮으면 시세를 가립니다.
   * ------------------------------------------------------------------- */
  /* ⭐ 얼마나 옅게 깔 것인가 - ★트레이딩뷰는 10% 입니다.★
   *    내장 일목의 fill 이 color.rgb(67,160,71, ★90★) 인데, Pine 의 넷째 값은
   *    "투명도" 라 0 이 불투명 · 100 이 안 보임입니다. 90 이면 알파 0.10 입니다.
   *
   * ⚠️ 우리는 ★18%★ 입니다. 더 진하게 한 이유가 있습니다 - 실측입니다.
   *    트레이딩뷰의 두 구름색은 초록 · 빨강이라 ★색상환에서 정반대★ 입니다.
   *    10% 만 깔아도 "초록 구름 / 빨강 구름" 이 갈라집니다.
   *    우리는 그 둘을 지표에 못 씁니다(손익 색). 라벤더 · 주황으로 냈는데
   *    같은 10% 로는 배경(#0A0F1C) 위에서 ★둘 다 회색★ 으로 보였습니다.
   *
   *    ⚠️ 깔리는 바닥은 #0A0F1C 가 아니라 ★카드색 #101727★ 입니다 - 차트
   *       캔버스 자체는 투명하고(실측 rgba(0,0,0,0)) 그 뒤 .chart-panel 의
   *       배경이 비칩니다. 그래서 아래 숫자는 #101727 위에 깐 값입니다.
   *
   *        짙기   라벤더가 위        주황이 위        두 색 차이
   *        10%    (34, 39, 59)      (40, 35, 41)     ( 6, -4, -18)  <- 둘 다 회색
   *        18%    (48, 52, 76)      (59, 45, 43)     (11, -8, -33)  <- 갈라집니다
   *       처음에 주황 대신 모래(#F5D7B8)를 썼을 때는 18% 라도
   *        18%    (48, 52, 76)      (57, 58, 65)     ( 9,  6, -11)  <- 여전히 회색
   *       이라 색을 바꿨습니다. 짙기만 올려서는 안 됐습니다.
   *
   *    브라우저 실측(2026-09-02 · 봉 1000개 전체 · 1920) - 캔버스에서 실제로
   *        194,188,244 알파 46/255(=0.18)  7,628 픽셀   (라벤더 구름)
   *        255,144,61  알파 46/255(=0.18)  6,715 픽셀   (주황 구름)
   *
   *    ★색을 새로 만들지 않고★ 짙기만 올려서 트레이딩뷰가 색으로 주는 정보
   *    ("A 가 위냐 B 가 위냐")를 그대로 살렸습니다. */
  var CLOUD_ALPHA = 0.18;

  function rgba(hex, a) {
    var h = String(hex).replace("#", "");
    if (h.length !== 6) return "rgba(120,120,120," + a + ")";
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }

  /** 점들을 "위아래가 안 바뀌는 토막" 으로 끊습니다. 색이 거기서 바뀝니다. */
  function cloudRuns(pts) {
    var runs = [];
    var cur = null;
    var sign = 0;
    for (var i = 0; i < pts.length; i++) {
      var q = pts[i];
      if (typeof q.a !== "number" || typeof q.b !== "number") {
        if (cur && cur.length > 1) runs.push({ up: sign > 0, pts: cur });
        cur = null;
        continue;
      }
      var sg = q.a >= q.b ? 1 : -1;
      if (!cur) {
        cur = [q];
        sign = sg;
      } else if (sg === sign) {
        cur.push(q);
      } else {
        cur.push(q);                       /* 넘어가는 봉은 양쪽에 다 넣습니다 */
        runs.push({ up: sign > 0, pts: cur });
        cur = [q];
        sign = sg;
      }
    }
    if (cur && cur.length > 1) runs.push({ up: sign > 0, pts: cur });
    return runs;
  }

  function makeCloud(getPts, getColors) {
    var host = null;
    var stat = { draws: 0, ms: 0, maxMs: 0 };

    function draw(target) {
      if (!host || !host.chart || !host.series) return;
      var pts = getPts();
      if (!pts || pts.length < 2) return;
      var ts;
      try {
        ts = host.chart.timeScale();
      } catch (e) {
        return;
      }
      if (!ts) return;
      var t0 = now();
      var col = getColors();
      var runs = cloudRuns(pts);

      target.useMediaCoordinateSpace(function (scope) {
        var ctx = scope.context;
        for (var r = 0; r < runs.length; r++) {
          var run = runs[r].pts;
          var xs = [], ya = [], yb = [];
          for (var i = 0; i < run.length; i++) {
            var x = ts.timeToCoordinate(run[i].time);
            var pa = host.series.priceToCoordinate(run[i].a);
            var pb = host.series.priceToCoordinate(run[i].b);
            if (x === null || pa === null || pb === null) continue;
            xs.push(x); ya.push(pa); yb.push(pb);
          }
          if (xs.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(xs[0], ya[0]);
          for (var j = 1; j < xs.length; j++) ctx.lineTo(xs[j], ya[j]);
          for (var k = xs.length - 1; k >= 0; k--) ctx.lineTo(xs[k], yb[k]);
          ctx.closePath();
          ctx.fillStyle = rgba(runs[r].up ? col.a : col.b, CLOUD_ALPHA);
          ctx.fill();
        }
      });

      var ms = now() - t0;
      stat.draws++;
      stat.ms += ms;
      if (ms > stat.maxMs) stat.maxMs = ms;
    }

    var view = {
      renderer: function () {
        return { draw: draw };
      },
      zOrder: function () {
        return "bottom";
      }
    };

    return {
      paneViews: function () {
        return [view];
      },
      attached: function (h) {
        host = h;
      },
      detached: function () {
        host = null;
      },
      statForTest: stat
    };
  }

  /** 두 선의 점 배열을 시각으로 맞춰 { time, a, b } 로 잇습니다(켤 때 한 번). */
  function joinCloudPoints(arrA, arrB) {
    var mb = {};
    var i;
    for (i = 0; i < arrB.length; i++) {
      if (typeof arrB[i].value === "number") mb[arrB[i].time] = arrB[i].value;
    }
    var out = [];
    for (i = 0; i < arrA.length; i++) {
      var v = arrA[i].value;
      var w = mb[arrA[i].time];
      if (typeof v !== "number" || typeof w !== "number") continue;
      out.push({ time: arrA[i].time, a: v, b: w });
    }
    return out;
  }

  /** 마지막 점 하나만 고쳐 씁니다(틱마다). 새 시각이면 뒤에 붙입니다. */
  function upsertCloudPoint(pts, time, a, b) {
    if (typeof a !== "number" || typeof b !== "number") return;
    var last = pts.length ? pts[pts.length - 1] : null;
    if (last && last.time === time) {
      last.a = a;
      last.b = b;
      return;
    }
    if (last && time < last.time) return;
    pts.push({ time: time, a: a, b: b });
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
    /* 정의가 선마다 따로 걸어 둔 밀기가 있으면 off 가 0 이어도 자리표가 필요합니다 */
    var anyShift = false;
    for (var si = 0; si < d.outputs.length; si++) {
      if (shiftOfOut(d.outputs[si], it.params)) anyShift = true;
    }
    var map = off || anyShift ? timeIndexMap() : null;

    var pane = it.pane === "sub" ? makePane() : null;
    var made = {};
    var shown = {};
    /* 13.2 칸 이름표에 적을 "지금 값" - 방금 계산한 것에서 꺼내 씁니다.
       이름표 때문에 다시 계산하는 것은 한 번도 없습니다. */
    var vals0 = {};
    for (var i = 0; i < d.outputs.length; i++) {
      var out = d.outputs[i];
      vals0[out.key] = lastValueOf(outData[out.key]);
      try {
        made[out.key] = addSeriesFor(it, out, pane);
        shown[out.key] = shiftPoints(outData[out.key] || [], off + shiftOfOut(out, it.params), map);
        made[out.key].setData(shown[out.key]);
      } catch (e2) {
        console.warn("[chart-indicator-kit] 선을 못 그렸습니다: " + id + "." + out.key, e2);
      }
    }

    /* 기준선은 첫 번째 선에 붙입니다 - 어느 선에 붙든 같은 칸의 같은 눈금이라
       화면은 같습니다. 첫 선을 못 만들었으면(위 catch) 기준선도 건너뜁니다. */
    var host = made[d.outputs[0].key] || null;

    /* 구름 - 두 선 사이를 칠합니다. 붙이는 자리는 a 선입니다(그 선의 눈금을 씁니다) */
    var clouds = [];
    for (var q = 0; q < d.clouds.length; q++) {
      var spec = d.clouds[q];
      var hs = made[spec.a];
      if (!hs) continue;
      try {
        var pts = joinCloudPoints(shown[spec.a] || [], shown[spec.b] || []);
        var prim = makeCloud(
          (function (arr) {
            return function () { return arr; };
          })(pts),
          (function (sp) {
            return function () {
              return { a: it.colors[sp.a], b: it.colors[sp.b] };
            };
          })(spec)
        );
        hs.attachPrimitive(prim);
        clouds.push({ spec: spec, prim: prim, host: hs, pts: pts });
      } catch (ec) {
        console.warn("[chart-indicator-kit] 구름을 못 그렸습니다: " + id, ec);
      }
    }

    it.live = {
      series: made,
      pane: pane,
      off: off,
      shifts: (function () {
        var m = {};
        d.outputs.forEach(function (o) { m[o.key] = shiftOfOut(o, it.params); });
        return m;
      })(),
      clouds: clouds,
      guides: addGuides(d, host),
      guideHost: host,
      /* 13.2 칸 이름표 - 아래 칸 지표에만 붙습니다 */
      label: null,
      vals: vals0,
      commit: cap.state || null,
      commitIdx: cap.state ? n - 2 : -1
    };

    /* 13.1 칸 위·아래 여백 (scale.top · scale.bottom 을 적은 지표만) */
    applyScaleMargins(host, d);

    /* 13.2 이름표를 붙이고 자리를 잡습니다. 칸이 하나 늘었으니 ★다른 칸의
       이름표도★ 아래로 밀립니다 - 그래서 전부 다시 잽니다. */
    ensurePaneLabel(it);
    positionPaneLabels();
    paintPaneLabels(true);

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

    /* 13.2 칸 이름표를 먼저 뗍니다 - 칸이 사라진 뒤에 떼면 "끈 지표의
       이름표만 허공에 남는" 조용한 고장이 됩니다. */
    dropPaneLabel(it);

    /* ★시리즈보다 먼저★ - 시리즈를 지운 뒤엔 removePriceLine 을 부를
       손잡이가 없습니다. */
    dropGuides(L);

    /* 구름도 시리즈보다 먼저 뗍니다 - 기준선과 같은 이유입니다 */
    if (L.clouds) {
      for (var ci = 0; ci < L.clouds.length; ci++) {
        try {
          L.clouds[ci].host.detachPrimitive(L.clouds[ci].prim);
        } catch (ec) {
          /* 이미 없으면 무시 */
        }
      }
      L.clouds = [];
    }

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
    /* 칸이 하나 줄었으니 남은 이름표들이 위로 올라옵니다 */
    positionPaneLabels();
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
        /* 밀기가 있으면 그린 자리도 그만큼 옮겨야 합니다(자리가 없으면 건너뜀).
           선마다 다른 밀기(일목 선행 +26 · 후행 -26)도 여기서 더해집니다. */
        var base = it.live.off;
        for (var k in r.values) {
          if (!it.live.series[k]) continue;
          var sh = base + (it.live.shifts[k] || 0);
          var at = sh ? timeAtIndex(n - 1 + sh) : lastBar.time;
          if (at === null) continue;
          var v = r.values[k];
          /* ★null 은 "여기는 비운다"★ 입니다 - Supertrend 가 뒤집히는 자리에서
             선을 끊는 데 씁니다. 값을 안 보내면 지난 값이 그대로 남습니다. */
          if (v === null) {
            it.live.series[k].update({ time: at });
            continue;
          }
          if (typeof v !== "number" || !isFinite(v)) continue;
          it.live.vals[k] = v;   /* 13.2 이름표가 받아 적을 값 */
          it.live.series[k].update({ time: at, value: v });
        }
        /* 구름도 마지막 점 하나만 고칩니다 */
        if (it.live.clouds && it.live.clouds.length) {
          for (var cq = 0; cq < it.live.clouds.length; cq++) {
            var cc = it.live.clouds[cq];
            var csh = base + (it.live.shifts[cc.spec.a] || 0);
            var cat = csh ? timeAtIndex(n - 1 + csh) : lastBar.time;
            if (cat === null) continue;
            upsertCloudPoint(cc.pts, cat, r.values[cc.spec.a], r.values[cc.spec.b]);
          }
        }
      } catch (e) {
        /* 한 인스턴스가 실패해도 나머지는 계속 그립니다.
           다음 전체 맞춤에서 정리됩니다. */
      }
    }

    /* 13.2 이름표 숫자 - 초당 5번까지만 다시 씁니다 */
    paintPaneLabels(false);

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
    /* 13.2 창 크기 · 칸 높이가 바뀌면 이름표 자리도 바뀝니다.
       옛 모듈(js/chart-oscillators.js:899)도 같은 자리에서 같은 일을 합니다. */
    positionPaneLabels();
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

    /* ⭐ ★정의 기본값이 아니라 이 줄의 태생값★ 으로 되돌립니다 (위 born 주석).
       태생값이 없는 옛 저장분은 bornOf 가 만들어 둡니다. */
    var b = it.born || bornOf(id, null);
    it.born = b;
    it.params = cleanParams(it.def, b.params);
    it.style = b.style;
    it.width = b.width;
    d.outputs.forEach(function (o) {
      it.colors[o.key] = b.colors[o.key] || o.color;
    });

    /* ⭐ 되돌린 색이 ★같은 칸 · 같은 선 모양★ 인 다른 줄과 같으면 빈 색으로
       옮깁니다. 안 하면 "기본값을 눌렀더니 딴 지표와 한 줄로 보이는" 길이
       그대로 남습니다(2026-08-31 부터 이 계열이 네 번째입니다).
       ⚠️ 한 인스턴스 안에서 ★일부러 같은 색★ 인 것(볼린저 위·중간·아래)은
          ★같은 색인 채로 함께★ 옮깁니다 - 밴드가 세 색으로 갈라지면 안 됩니다. */
    var 옮김 = {};
    var 찜 = {};
    d.outputs.forEach(function (o) {
      var c = it.colors[o.key];
      if (옮김[c]) {
        it.colors[o.key] = 옮김[c];
        return;
      }
      if (!lookAlikeMap(it, styleKeyOf(it, o))[c]) {
        옮김[c] = c;
        찜[c] = true;
        return;
      }
      var next = pickFreeColor(찜, it.id, paneGroupOf(it));
      옮김[c] = next || c;
      it.colors[o.key] = 옮김[c];
      찜[옮김[c]] = true;
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

  /** 지금 화면의 모든 선이 쓰고 있는 색 (선이 셋인 지표까지 전부 셉니다)
   *  skipId 를 주면 그 인스턴스만 빼고 셉니다 - 방금 만든 줄이 "아직 안 정한
   *  기본색" 으로 제 자리를 스스로 막는 것을 피하려고 씁니다(아래 autoColors). */
  function usedColorMap(skipId, group) {
    var used = {};
    instOrder.forEach(function (iid) {
      if (iid === skipId) return;
      var it = insts[iid];
      if (group && paneGroupOf(it) !== group) return;
      for (var ck in it.colors) used[it.colors[ck]] = true;
    });
    return used;
  }

  /* ---------------------------------------------------------------------
   * ★한 칸(그리는 바닥) 에 실제로 같이 놓이는 선이 어느 것인가★
   *
   * 색이 겹쳐서 회원이 손해를 보는 것은 ★두 선이 같은 눈금 위에 나란히★
   * 있을 때입니다. 서로 다른 칸에 있으면 같은 색이어도 한 선으로 안 보입니다.
   *
   * 실측(2026-09-02 · 5절 turnOn) - 아래 칸 지표는 켤 때마다 makePane() 으로
   * ★자기 칸을 새로 만듭니다.★ 그래서 아래 칸 지표끼리는 절대 같은 칸에
   * 안 놓입니다. 같은 바닥을 나눠 쓰는 것은 ★주 차트에 얹는 것들끼리★ 입니다.
   *
   *     주 차트   EMA · WMA · SAR · VWAP · Supertrend(2선) · 일목(5선)
   *               + 기존 MA7 · MA25 · MA99 · 볼린저    -> 다 같은 바닥
   *     아래 칸   KDJ · ATR · StochRSI · CCI · OBV · Stochastic · DMI
   *               -> ★하나에 칸 하나★. 이웃이 자기 선들뿐입니다
   *
   * ⚠️ 그래도 ★먼저는 화면 전체에서 안 겹치는 색★ 을 찾습니다. 목록 창의
   *    점 색이 줄마다 달라야 고르기 쉽기 때문입니다. 칸을 보는 것은 색이
   *    다 떨어졌을 때의 ★물러설 자리★ 입니다(아래 pickFreeColor 3 · 4번째 훑기).
   * ------------------------------------------------------------------- */
  function paneGroupOf(it) {
    return it.pane === "sub" ? "sub:" + it.id : "main";
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
  function pickFreeColor(banned, skipId, group) {
    var used = usedColorMap(skipId);
    var i, h;
    /* 1 · 2 - 화면 어디에서도 안 쓰는 색 (기존 MA 색은 맨 뒤로 미룹니다) */
    for (i = 0; i < LINE_COLORS.length; i++) {
      h = LINE_COLORS[i].hex;
      if (!banned[h] && !used[h] && LEGACY_HEXES.indexOf(h) < 0) return h;
    }
    for (i = 0; i < LINE_COLORS.length; i++) {
      h = LINE_COLORS[i].hex;
      if (!banned[h] && !used[h]) return h;
    }
    /* 3 · 4 - 색이 다 찼습니다. ★같은 칸에만 없으면★ 씁니다(위 paneGroupOf).
       ⚠️ 선이 색보다 빨리 늡니다 - 정의 13개면 선이 26개인데 색은 20개입니다.
          여기서 그냥 아무 색이나 집으면 ★같은 칸 안에서★ 두 선이 한 줄로
          보입니다. 다른 칸과 겹치는 것은 눈으로 구분이 됩니다. */
    if (group) {
      var mine = usedColorMap(skipId, group);
      for (i = 0; i < LINE_COLORS.length; i++) {
        h = LINE_COLORS[i].hex;
        if (!banned[h] && !mine[h] && LEGACY_HEXES.indexOf(h) < 0) return h;
      }
      for (i = 0; i < LINE_COLORS.length; i++) {
        h = LINE_COLORS[i].hex;
        if (!banned[h] && !mine[h]) return h;
      }
    }
    /* 5 - 같은 칸에도 자리가 없습니다. 적어도 ★제 줄 안에서는★ 안 겹치게 */
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
    /* ★밴드는 일부러 한 색★ 입니다 - 여기서 갈라 놓으면 안 됩니다 */
    if (d.band) return false;

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
      var next = pickFreeColor(seen, it.id, paneGroupOf(it));
      if (!next || next === c) return;
      it.colors[k] = next;
      seen[next] = true;
      changed = true;
    });
    return changed;
  }

  /* ---------------------------------------------------------------------
   * ⭐ 2026-09-02 (10단계) 에 잡은 것 - ★얹는 순서를 바꾸면 나던 색 겹침★
   *
   * 9단계에서 고친 것은 "★한 줄 안에서★ 두 선이 같은 색" 뿐이었습니다.
   * 남아 있던 것은 ★줄과 줄 사이★ 입니다.
   *
   *   회원이 "지표 추가" 로 얹으면 설정 창이 이 순서로 부릅니다.
   *       suggestColor()  ->  createInstance()  ->  updateInstance(★첫 선만★)
   *   즉 ★둘째 · 셋째 선은 정의에 적힌 기본색 그대로★ 얹힙니다. 그 기본색을
   *   앞서 얹은 다른 줄이 이미 쓰고 있으면 두 선이 한 줄로 보입니다.
   *
   *   제일 짧은 재현 - ATR -> SAR -> CCI -> KDJ (네 번)
   *       CCI 가 자동으로 #E1ED97 을 받고, 뒤에 얹은 KDJ 의 D 선이 정의
   *       기본색 #E1ED97 그대로 -> ★둘 다 아래 칸에서 같은 색★
   *   실측(2026-09-02 · 기록팀) - 무작위 순서 600가지 중 같은 칸 겹침 131 ·
   *       어디서든 겹침 214 / 결정적 순서 11가지 중 같은 칸 7 · 전체 8
   *
   * ⚠️ 왜 설정 창(js/chart-indicator-settings.js)이 아니라 여기서 고치나
   *    ① 저쪽은 이번 작업에서 손대지 않기로 한 파일입니다
   *    ② 설정 창 말고 다른 경로로 얹어도(스크립트 · 나중에 생길 화면) 같이
   *       안전해야 합니다. 색을 고르는 규칙이 두 곳에 생기면 또 어긋납니다
   *
   * ⚠️ ★회원이 직접 고른 색은 안 건드립니다.★ given(opts.colors 로 들어온 키)
   *    은 그대로 두고, 자동으로 준 나머지 선만 비켜 줍니다.
   * ⚠️ ★저장소에서 되살릴 때(loadState)는 부르지 않습니다.★ 저장된 색은 회원이
   *    보던 색이라, 새로고침할 때마다 색이 바뀌면 그게 더 나쁜 고장입니다.
   *    그래서 addInstance 가 아니라 createInstance("지표 추가")에만 답니다.
   * ------------------------------------------------------------------- */
  function autoColors(id, given) {
    var it = insts[id];
    var d = it && defs[it.def];
    if (!d) return false;

    /* ★밴드★ - 선마다 다른 색을 뿌리지 않고 ★한 색을 셋 다★ 줍니다.
       회원이 색을 하나라도 골랐으면 그 색으로 통일합니다. 안 골랐으면
       정의 기본색이 비어 있을 때 그대로 쓰고, 이미 쓰이면 빈 색을 찾습니다. */
    if (d.band) {
      var pick = null;
      if (given) {
        for (var gk in given) {
          if (it.colors[gk]) { pick = it.colors[gk]; break; }
        }
      }
      if (!pick) {
        var base = it.colors[d.outputs[0].key] || d.outputs[0].color;
        pick = usedColorMap(id)[base] ? pickFreeColor({}, id, paneGroupOf(it)) || base : base;
      }
      var moved = false;
      d.outputs.forEach(function (o) {
        if (it.colors[o.key] !== pick) moved = true;
        it.colors[o.key] = pick;
      });
      return moved;
    }

    var givenMap = {};
    (given ? Object.keys(given) : []).forEach(function (k) {
      givenMap[k] = true;
    });

    /* 회원이 정한 선의 색부터 자리를 잡습니다(그 색은 이 줄 안에서 금지색) */
    var banned = {};
    d.outputs.forEach(function (o) {
      if (givenMap[o.key]) banned[it.colors[o.key]] = true;
    });

    var group = paneGroupOf(it);
    var changed = false;
    d.outputs.forEach(function (o) {
      if (givenMap[o.key]) return;
      /* ⭐ ★정의가 정해 둔 기본색이 비어 있으면 그대로 씁니다.★
         정의의 색은 아무렇게나 고른 것이 아닙니다 - DMI 는 트레이딩뷰와 같은
         파랑 · 주황이고, 일목의 선행스팬 두 색은 ★구름 색으로도 쓰입니다★
         (밝고 옅어야 캔들 뒤에 깔았을 때 읽힙니다). 자리가 비어 있는데도
         목록 앞에서부터 다시 고르면 그 뜻이 다 없어집니다.
         ⚠️ 나 자신은 빼고 셉니다 - 아직 안 정한 내 기본색이 내 자리를 막지 않게. */
      var cur = it.colors[o.key];
      var used = usedColorMap(id);
      if (cur && !banned[cur] && !used[cur]) {
        banned[cur] = true;
        return;
      }
      var next = pickFreeColor(banned, id, group);
      if (!next) {
        banned[cur] = true;                /* 색을 다 썼으면 있는 색 그대로 */
        return;
      }
      if (next !== cur) changed = true;
      it.colors[o.key] = next;
      banned[next] = true;
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
    /* ⭐ 색이 ★다 찼을 때★ (2026-09-02 10단계에 고친 자리)
       설정 창은 이 값을 받아서 createInstance ★뒤에★ 첫 선에 덮어씌웁니다
       (js/chart-indicator-settings.js:601-611). 그래서 여기서 아무 색이나
       돌려주면 틀이 방금 잘 골라 준 색을 ★도로 망칩니다.★
       실측(2026-09-02 · 정의 13개 · 무작위 600순서) - 고치기 전 같은 바닥
       겹침 287, 고친 뒤 0.
       ★제일 붐비는 바닥(주 차트)에 없는 색★ 을 고릅니다. 아래 칸 지표는
       켤 때 자기 칸을 새로 만들어서 이웃이 자기 선들뿐입니다(paneGroupOf). */
    var onMain = usedColorMap(null, "main");
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!onMain[LINE_COLORS[i].hex] && LEGACY_HEXES.indexOf(LINE_COLORS[i].hex) < 0) {
        return LINE_COLORS[i].hex;
      }
    }
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!onMain[LINE_COLORS[i].hex]) return LINE_COLORS[i].hex;
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
    /* ★모든 선★ 에 아직 안 쓰인 색을 채웁니다(위 autoColors 주석 - 10단계).
       회원이 opts.colors 로 준 선은 그대로 둡니다. */
    autoColors(id, opts.colors);
    /* ⚠️ 태생값을 ★여기서 다시★ 찍습니다 - autoColors 가 색을 바꾼 뒤라야
       "기본값" 이 ★처음 화면에 나왔던 그 색★ 으로 돌아갑니다. 앞에서 찍은
       값(정의 기본색)으로 두면 되돌릴 때 다른 줄과 같은 색이 될 수 있습니다. */
    if (insts[id]) insts[id].born = bornOf(id, { params: insts[id].params, colors: insts[id].colors, style: insts[id].style, width: insts[id].width });
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
    /* 13.2 아래 칸 이름표에도 같은 이름이 적혀 있습니다 */
    refreshPaneLabelName(it);
  }

  /* ---------------------------------------------------------------------
   * ★옛 MA 를 틀로 옮겼다는 표시★ - 저장칸은 ★새로 만들지 않았습니다.★
   * 틀이 이미 쓰는 한 칸(btc_sim_v2_chart-indicator-kit) 안에 같이 넣습니다.
   * 칸을 새로 만들면 "이 회원이 무엇을 켜 뒀나" 를 두 곳에서 읽게 됩니다.
   *   { ma:true, at:옮긴시각, legacy0:{ma7,ma25,ma99} }
   * legacy0 은 ★옮기기 직전 옛 켜짐/꺼짐★ 입니다 - 되돌릴 때 씁니다.
   * ------------------------------------------------------------------- */
  var movedState = null;

  function saveState() {
    try {
      if (!App.Storage || !isFn(App.Storage.save)) return;
      App.Storage.save(STORAGE_KEY, {
        v: STORE_VERSION,
        moved: movedState,
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
            on: it.on,
            born: it.born      /* ★태생값★ - 안 넣으면 새로고침 한 번에 잊습니다 */
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

    /* ★옮겼다는 표시는 인스턴스보다 먼저 읽습니다.★ 저장된 인스턴스가
       하나도 없어도(회원이 전부 지웠어도) 다시 옮기면 안 됩니다 -
       두 번 옮기면 회원이 지운 MA 줄이 되살아납니다. */
    if (saved && saved.v === STORE_VERSION && saved.moved && (saved.moved.ma || saved.moved.bb || saved.moved.rsi)) {
      movedState = saved.moved;
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
      ".tl-kit-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}" +
      /* 13.2 칸 이름표 - 차트 위에 얹기만 합니다(라이브러리 DOM 은 안 건드립니다).
         ⚠️ pointer-events:none - 이름표가 차트 조작을 먹으면 안 됩니다.
         ⚠️ 글씨 11px - 칩 줄과 같은 크기. 좁은 화면에서 줄이지 않습니다. */
      ".tl-kit-plabel{position:absolute;left:8px;z-index:3;pointer-events:none;" +
      "font-size:12px;font-weight:600;line-height:1.4;color:#838DA4;white-space:nowrap;" +
      "font-family:'JetBrains Mono',ui-monospace,monospace;}" +
      ".tl-kit-plabel b{font-weight:600;margin-left:6px;}";
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
      var anchorChip = legacyAnchor(bar, id, "chip");
      if (anchorChip) bar.insertBefore(btn, anchorChip);
      else bar.appendChild(btn);
    });

    /* 옛 MA 칩도 우리 칩을 다 끼운 뒤에 뺍니다(위 fx 목록과 같은 이유) */
    dropLegacyChips(bar);

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

      /* ★옮겨 온 MA 는 옛 줄이 있던 그 자리에★ 끼웁니다(순서가 바뀌면
         회원 눈에는 줄이 뒤섞인 것으로 보입니다). 옛 줄은 아래에서 뺍니다. */
      var placed = false;
      var anchorRow = legacyAnchor(list, id, "row");
      if (anchorRow) {
        list.insertBefore(row, anchorRow);
        placed = true;
      }
      if (!placed && it.pane === "main") {
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

    /* 옛 MA 줄은 여기서 뺍니다 - ★우리 줄을 다 끼운 뒤★ 입니다.
       먼저 빼면 끼울 자리를 잃습니다. */
    dropLegacyMenuRows();
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

  /* -- MA 단순이동평균 --------------------------------------------------
   * ★2026-09-02 (11단계) 에 js/chart-indicators.js 에서 ★옮겨 온★ 것입니다.
   *
   *   MA(t) = 최근 p개 값의 산술평균
   *
   * -- 왜 옮겼나 (조사팀 [A] 최우선) ------------------------------------
   * fx 목록 9줄 가운데 설정 버튼이 붙은 줄이 2줄뿐이었습니다. MA(7)·MA(25)·
   * MA(99) 는 기간도 색도 굵기도 코드에 박혀 있어 회원이 하나도 못 바꿨습니다.
   * 트레이딩뷰는 전부 바꿉니다. 틀로 옮기면 그날로 다 바뀝니다.
   *
   * -- 옮기면서 ★하나도 안 바꾼 것★ ------------------------------------
   *   기간   7 · 25 · 99          (바이낸스 기본값 그대로)
   *   색     #F0B429 · #E7ECF5 · #838DA4   (지금 회원이 보던 색 그대로)
   *   굵기   1px                  (DEFAULT_WIDTH 와 같은 값)
   *   모양   실선
   *   계산   ★더하는 순서까지★ 옛 computeSMA 와 같습니다(아래 seed 주석).
   *
   * -- ⚠️ 더하는 순서를 왜 맞췄나 --------------------------------------
   * 같은 평균이라도 어떤 순서로 더하느냐에 따라 마지막 자리 수가 달라집니다
   * (부동소수점). 옛 js/chart-indicators.js:135 computeSMA 는
   *     한 번 훑으며 sum += 종가[i], i>=p 이면 sum -= 종가[i-p]
   * 였습니다. 여기서도 ★글자 그대로 같은 순서★ 로 더합니다. 그래서 옮기기
   * 전후 값이 소수점 끝자리까지 같습니다 - 값 대조 테스트가 그것을 봅니다.
   *
   * -- step 이 O(1) 인 이유 ---------------------------------------------
   *     합(t) = 합(t-1) + 값(t) - 값(t-p)
   * 그래서 상태가 "곧 창에서 빠질 값(oldest)" 과 최근 p개(buf) 를 들고 다닙니다.
   * WMA 와 같은 모양입니다(위 wmaState 주석에 왜 buf 를 그 자리에서 고쳐 써도
   * 되는지 적어 두었습니다 - 덮어쓰는 칸이 st.head 하나뿐이라 그렇습니다).
   * ------------------------------------------------------------------- */

  /** i번째 봉까지 확정된 SMA 상태. buf 는 [i-p+1 .. i] 를 시간순으로 담고
   *  head 는 "곧 빠질 칸"(= i-p+1) 을 가리킵니다. */
  function smaState(sum, src, i, p) {
    var buf = new Array(p);
    for (var q = 0; q < p; q++) buf[q] = src[i - p + 1 + q];
    return { S: sum, oldest: buf[0], buf: buf, head: 0 };
  }

  /* -- ⚠️ "지표 추가" 로 ★새로 얹을 때★ 의 기본 기간은 9 입니다 ---------
   * 옮겨 온 세 줄(7 · 25 · 99)과 다릅니다. 헷갈리기 쉬워서 적어 둡니다.
   *   옮겨 온 세 줄   7 · 25 · 99   ★바이낸스★ 기본값. 회원이 보던 그대로라
   *                                 바꾸면 안 됩니다(아래 MOVED_MA).
   *   새로 얹는 줄    9             ★트레이딩뷰★ "Moving Average" 기본값.
   *                                 대표 지시 - 차트 시스템은 트레이딩뷰를
   *                                 따라갑니다. 바로 위 WMA 도 같은 이유로 9.
   *
   * 트레이딩뷰 도움말 원문 확인 (2026-09-02)
   *   https://www.tradingview.com/support/solutions/43000502589-moving-average/
   *   Length "9 days is the default" · Source "Close is the default" ·
   *   Offset "0 is the default"  -> 우리 설정 창의 세 칸과 같습니다
   *   (기간 · 값 종류 · 앞뒤로 밀기). 모양 쪽도 트레이딩뷰가 색 · 굵기 ·
   *   선 모양 셋을 주는데 우리도 셋 다 줍니다(색 20 · 굵기 4 · 모양 3).
   * 설정 창의 "기본값" 을 누르면 9 로 돌아가는 것도 트레이딩뷰와 같습니다.
   * 바이낸스처럼 보고 싶으면 7 · 25 · 99 세 줄을 얹으면 됩니다 - 이 틀이
   * "정의 1개 + 인스턴스 N개" 인 이유가 그것입니다.
   * ------------------------------------------------------------------- */
  define({
    id: "ma",
    name: "MA",
    note: "이동평균",
    pane: "main",
    params: { p: 9 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      return "MA(" + prm.p + ")";
    },
    outputs: [{ key: "ma", kind: "line", color: "#F0B429", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;   /* 값 종류(종가 · 시가 · HL2 ...) */
      var n = src.length;
      var out = [];
      if (n < p) return { ma: out };

      /* ★옛 computeSMA 와 같은 순서로 더합니다★ - 위 주석 참조 */
      var sum = 0;
      for (var i = 0; i < n; i++) {
        sum += src[i];
        if (i >= p) sum -= src[i - p];
        if (i < p - 1) continue;
        out.push({ time: bs.time[i], value: sum / p });
        if (i === n - 2) cap.state = smaState(sum, src, i, p);
      }
      return { ma: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var sum = st.S + x - st.oldest;

      var len = st.buf.length || 1;
      st.buf[st.head] = x;                    /* 덮어쓰는 칸은 여기 하나뿐 */
      var head = (st.head + 1) % len;
      return {
        values: { ma: sum / p },
        state: { S: sum, oldest: st.buf[head], buf: st.buf, head: head }
      };
    }
  });

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

  /* -- BOLL 볼린저밴드 --------------------------------------------------
   * 중간선 = 기간 p 단순이동평균,  위/아래 = 중간선 ± k × 표준편차
   *
   * ⭐ 이것은 ★새 지표가 아니라 옮겨 온 것★ 입니다.
   *    js/chart-indicators.js 의 computeBB() 가 그리던 그 선입니다.
   *    회원이 지금 보고 있는 그대로여야 합니다 - 색 · 선모양 · 값 전부.
   *      색      위 · 중간 · 아래 ★셋 다★ #838DA4 (보조색)
   *      선모양  ★점선★ (실선인 MA(99) 와 모양으로 구분됩니다)
   *      기본값  기간 20 · 배수 2   (바이낸스 BOLL 기본값 = 트레이딩뷰 기본값)
   *    ⚠️ 색을 바꾸지 마세요. 회원이 바꾸고 싶으면 설정 창에서 바꿉니다.
   *
   * -- 표준편차는 ★모집단★ 입니다 (÷p, ÷(p-1) 아님) ---------------------
   *    옛 stdevOfWindow() 가 Math.sqrt(acc / period) 였습니다. 트레이딩뷰
   *    ta.stdev 도 모집단입니다. ÷(p-1) 로 바꾸면 밴드 폭이 미세하게 넓어져
   *    회원 화면의 선 자리가 조용히 움직입니다.
   *
   * -- step 이 하는 일의 양 ---------------------------------------------
   *    합계는 O(1) 입니다(빠질 값 하나 빼고 새 값 하나 더하기).
   *    ★표준편차만 창 p개를 훑습니다★ - 평균이 매 틱 달라지므로 (x-평균)²
   *    을 누적해 둘 수 없습니다. 기본 20이면 틱마다 뺄셈·곱셈 20번입니다.
   *    ⚠️ 이것은 ★옛 모듈과 똑같은 양★ 입니다(js/chart-indicators.js:425
   *       도 매 틱 stdevOfWindow 로 20개를 훑었습니다). 늘어난 게 아닙니다.
   *       봉 1000개를 다시 계산하는 것과는 다릅니다.
   *
   * ⚠️ buf 를 그 자리에서 고쳐 쓰는 것은 위 MA · WMA 와 같은 이유로 안전합니다
   *    (덮어쓰는 칸은 st.head 하나뿐이고 그 칸의 옛 값은 st.oldest 에 있습니다).
   *    표준편차를 훑을 때는 ★쓴 뒤★ 의 buf 를 ★시간순★ 으로 읽습니다 -
   *    새 head 부터 한 바퀴가 곧 오래된 것 → 새 것 순서입니다.
   * ------------------------------------------------------------------- */

  /** 창 [end-p+1 .. end] 의 모집단 표준편차. 옛 stdevOfWindow() 와 같은 순서. */
  function stdevWindow(src, end, p, mean) {
    var acc = 0;
    for (var i = end - p + 1; i <= end; i++) {
      var d = src[i] - mean;
      acc += d * d;
    }
    return Math.sqrt(acc / p);
  }

  define({
    id: "bb",
    name: "BOLL",
    note: "볼린저밴드",
    pane: "main",
    /* ★밴드★ - 위·중간·아래는 한 덩어리라 ★한 색★ 으로 그립니다.
       회원이 지금 보고 있는 화면(#838DA4 점선 셋)이 그렇고, 트레이딩뷰도
       밴드를 한 덩어리로 봅니다. 이 표시가 없으면 틀이 선마다 다른 색을
       뿌려서, 회원이 볼린저를 새로 얹으면 알록달록해집니다. */
    band: true,
    params: { p: 20, k: 2 },
    inputs: [
      { key: "p", label: "기간", min: 1, max: 1000 },
      { key: "k", label: "표준편차 배수", type: "float", min: 0.1, max: 50 }
    ],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      /* ★옛 fx 목록 줄과 글자까지 같습니다★ - js/chart-indicator-menu.js:139
         가 "BOLL(" + 기간 + ", " + 배수 + ")" 로 적고 있었습니다. */
      return "BOLL(" + prm.p + ", " + prm.k + ")";
    },
    outputs: [
      /* 옛 모듈이 만든 순서 그대로 - 위 · 중간 · 아래 (색이 셋 다 같아
         겹쳐 보이는 순서는 화면에 안 드러나지만, 순서를 맞춰 둡니다) */
      { key: "upper", kind: "line", color: "#838DA4", style: "dashed" },
      { key: "middle", kind: "line", color: "#838DA4", style: "dashed" },
      { key: "lower", kind: "line", color: "#838DA4", style: "dashed" }
    ],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var k = typeof prm.k === "number" && isFinite(prm.k) ? prm.k : 2;
      var src = bs.src || bs.close;
      var n = src.length;
      var up = [], mid = [], lo = [];
      if (n < p) return { upper: up, middle: mid, lower: lo };

      /* ★옛 computeBB 와 같은 순서로 더합니다★ - 순서가 다르면 소수점
         끝자리가 갈라져 "값이 조금 다른" 조용한 차이가 납니다. */
      var sum = 0;
      for (var i = 0; i < n; i++) {
        sum += src[i];
        if (i >= p) sum -= src[i - p];
        if (i < p - 1) continue;
        var mean = sum / p;
        var sd = stdevWindow(src, i, p, mean);
        mid.push({ time: bs.time[i], value: mean });
        up.push({ time: bs.time[i], value: mean + k * sd });
        lo.push({ time: bs.time[i], value: mean - k * sd });
        if (i === n - 2) cap.state = smaState(sum, src, i, p);
      }
      return { upper: up, middle: mid, lower: lo };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var k = typeof prm.k === "number" && isFinite(prm.k) ? prm.k : 2;
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var sum = st.S + x - st.oldest;

      var len = st.buf.length || 1;
      st.buf[st.head] = x;                    /* 덮어쓰는 칸은 여기 하나뿐 */
      var head = (st.head + 1) % len;

      /* 새 head 부터 한 바퀴 = 오래된 것 → 새 것 (옛 stdevOfWindow 와 같은 순서) */
      var mean = sum / p;
      var acc = 0;
      for (var q = 0; q < len; q++) {
        var d = st.buf[(head + q) % len] - mean;
        acc += d * d;
      }
      var sd = Math.sqrt(acc / p);

      return {
        values: { upper: mean + k * sd, middle: mean, lower: mean - k * sd },
        state: { S: sum, oldest: st.buf[head], buf: st.buf, head: head }
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
    /* ⭐ 2026-09-03 (13단계) ATR 값은 ★가격★ 입니다 - "ATR(14) = 120.45" 는
       120.45 USDT 라는 뜻입니다. 그런데 원화로 보는 회원 화면에도 그냥
       120.45 로 떴습니다(오류 0건 · 화면 멀쩡 · 회원은 모름).
       unit 을 적으면 눈금 글자와 칸 이름표가 표시 통화를 따라갑니다.
       계산값은 한 자리도 안 바뀝니다 - 보이는 글자만 바뀝니다. (13.3절) */
    unit: "price",
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


  /* -- 굴러가는 최고 · 최저 창 (Stochastic · 일목균형표가 같이 씁니다) -------
   * "지금 봉을 포함한 최근 p봉의 최고가 · 최저가" 를 O(1) 로 들고 다닙니다.
   * 최고가 어느 칸인지(hiIdx)를 같이 적어 두어, 보통은 비교 한 번입니다.
   * 최고이던 봉이 창에서 빠질 때만 훑는데 그때도 ★봉 개수 n 이 아니라 기간 p★
   * 입니다. KDJ · StochRSI 가 쓰던 방식과 같은 것을 함수로 뽑았습니다.
   *
   * ⚠️ 그 자리에서 고쳐 쓰는 칸은 hb[head] · lb[head] ★두 칸뿐★ 이고 둘 다
   *    들어온 상태(st)로 정해지는 자리라, 진행 중인 봉으로 몇 번을 다시 불러도
   *    답이 같습니다(KDJ 주석과 같은 이유).
   * ⚠️ ★KDJ 와 다른 점★ - KDJ 는 "직전 p-1봉" 창이라 지금 봉을 따로 비교하는데,
   *    여기는 ta.stoch · 일목처럼 ★지금 봉을 창에 넣고 나서★ 읽습니다.
   * --------------------------------------------------------------------- */

  function rollInit(p) {
    return {
      hb: new Array(p), lb: new Array(p), head: 0, cnt: 0,
      hiMax: -Infinity, hiIdx: -1, loMin: Infinity, loIdx: -1
    };
  }

  function rollCopy(st) {
    return {
      hb: st.hb.slice(), lb: st.lb.slice(), head: st.head, cnt: st.cnt,
      hiMax: st.hiMax, hiIdx: st.hiIdx, loMin: st.loMin, loIdx: st.loIdx
    };
  }

  /** 봉 하나를 창에 넣습니다. 돌려주는 상태의 hiMax · loMin 이 "지금 봉 포함" 값입니다. */
  function rollPush(st, high, low, p) {
    var head = st.head;
    var hiMax = st.hiMax, hiIdx = st.hiIdx;
    var loMin = st.loMin, loIdx = st.loIdx;
    var a, v;

    st.hb[head] = high;
    st.lb[head] = low;

    if (high >= hiMax) {
      hiMax = high;
      hiIdx = head;
    } else if (hiIdx === head) {
      hiMax = -Infinity;
      hiIdx = -1;
      for (a = 0; a < p; a++) {
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
      for (a = 0; a < p; a++) {
        v = st.lb[a];
        if (v === undefined) continue;
        if (v < loMin) { loMin = v; loIdx = a; }
      }
    }

    return {
      hb: st.hb, lb: st.lb,
      head: (head + 1) % p,
      cnt: st.cnt < p ? st.cnt + 1 : p,
      hiMax: hiMax, hiIdx: hiIdx, loMin: loMin, loIdx: loIdx
    };
  }

  /* -- Stochastic 스토캐스틱 --------------------------------------------
   * "지금 종가가 최근 p봉의 폭에서 어디쯤인가" 를 0~100 으로 봅니다. 위쪽에
   * 붙으면 최근 고점 근처, 아래쪽에 붙으면 최근 저점 근처입니다.
   *
   * ⭐ 계산식 - ★트레이딩뷰 Pine 참고서 ta.stoch 원문★ (2026-09-02 브라우저로
   *    직접 열어 읽었습니다)
   *        "Stochastic. It is calculated by a formula:
   *         100 * (close - lowest(low, length)) / (highest(high, length) - lowest(low, length))"
   *    창에 ★지금 봉이 들어갑니다★ (lowest/highest 가 현재 봉을 포함합니다).
   *
   * ⭐ 기본값 14 · 1 · 3 - 트레이딩뷰 내장 Stochastic 의 기본입니다.
   *        %K Length 14 · %K Smoothing 1 · %D Smoothing 3
   *        k = ta.sma(ta.stoch(close, high, low, periodK), smoothK)
   *        d = ta.sma(k, periodD)
   *    ⚠️ Smoothing 이 1 이면 평균을 안 낸 날것입니다(트레이딩뷰의 "Fast").
   *       그래서 %K 가 톱니처럼 보입니다 - 고장이 아닙니다.
   *    ⚠️ 바이낸스에는 그냥 Stochastic 이 ★없습니다★ - 2026-09-02 앞 팀이 센
   *       Sub 10개(VOL · MACD · RSI · MFI · KDJ · OBV · CCI · StochRSI · WR · DMI)
   *       에 KDJ 와 StochRSI 만 있었습니다. 차트 시스템은 트레이딩뷰 관할이라 넣습니다.
   *
   * ⭐ 기준선 20 · 80 - 트레이딩뷰 내장이 hline(80) · hline(20) 을 그립니다.
   *    (RSI 의 30/70 과 다릅니다)
   *
   * ⚠️ 창이 평평하면(고 == 저) 나눌 것이 없습니다. 0 으로 둡니다 - 같은 파일의
   *    StochRSI 와 같은 처리입니다(두 지표가 다르게 굴면 그게 더 헷갈립니다).
   *
   * -- step 이 O(1) 인 이유 ---------------------------------------------
   *    최고 · 최저는 위 rollPush(보통 비교 한 번), %K · %D 는 굴러가는 합입니다.
   *    ⚠️ 덮어쓰는 칸은 hb[head] · lb[head] · kb[kh] · db[dh] 네 칸뿐이고,
   *       "곧 빠질 값" 은 버퍼가 아니라 kold · dold 에 따로 적어 두었습니다.
   *       그래서 진행 중인 봉으로 몇 번을 다시 불러도 답이 같습니다.
   * --------------------------------------------------------------------- */

  function stochInit(p, kp, dp) {
    return {
      w: rollInit(p),
      kb: new Array(kp), kh: 0, kc: 0, ks: 0, kold: 0,
      db: new Array(dp), dh: 0, dc: 0, ds: 0, dold: 0
    };
  }

  function stochCopy(st) {
    return {
      w: rollCopy(st.w),
      kb: st.kb.slice(), kh: st.kh, kc: st.kc, ks: st.ks, kold: st.kold,
      db: st.db.slice(), dh: st.dh, dc: st.dc, ds: st.ds, dold: st.dold
    };
  }

  /** 봉 하나. seed 와 step 이 ★같은 함수★ 를 씁니다. */
  function stochOne(st, high, low, close, p, kp, dp) {
    var w = rollPush(st.w, high, low, p);
    var vals = null;

    var kb = st.kb, kh = st.kh, kc = st.kc, ks = st.ks, kold = st.kold;
    var db = st.db, dh = st.dh, dc = st.dc, ds = st.ds, dold = st.dold;

    if (w.cnt >= p) {
      var raw = w.hiMax > w.loMin ? ((close - w.loMin) / (w.hiMax - w.loMin)) * 100 : 0;

      ks = ks + raw - (kc >= kp ? kold : 0);
      kb[kh] = raw;
      kh = (kh + 1) % kp;
      if (kc < kp) kc++;
      kold = kb[kh];                    /* 다음에 빠질 값 - ★쓴 뒤에★ 읽습니다 */

      if (kc >= kp) {
        var kv = ks / kp;
        /* ⚠️ %K 는 %D 보다 (다듬기 - 1)봉 ★먼저★ 나옵니다. 트레이딩뷰도 그렇게
           그립니다(plot 이 둘로 나뉘어 있고 각자 na 가 끝나는 자리가 다릅니다).
           기본값 1 · 3 이면 %K 가 두 봉 먼저 시작합니다. */
        vals = { k: kv };
        ds = ds + kv - (dc >= dp ? dold : 0);
        db[dh] = kv;
        dh = (dh + 1) % dp;
        if (dc < dp) dc++;
        dold = db[dh];
        if (dc >= dp) vals.d = ds / dp;
      }
    }

    return {
      values: vals,
      state: {
        w: w,
        kb: kb, kh: kh, kc: kc, ks: ks, kold: kold,
        db: db, dh: dh, dc: dc, ds: ds, dold: dold
      }
    };
  }

  define({
    id: "stoch",
    name: "Stochastic",
    note: "최근 폭에서 종가의 자리 (%K · %D)",
    pane: "sub",
    params: { p: 14, k: 1, d: 3 },
    inputs: [
      { key: "p", label: "%K 기간", min: 1, max: 1000 },
      { key: "k", label: "%K 다듬기", min: 1, max: 100 },
      { key: "d", label: "%D 다듬기", min: 1, max: 100 }
    ],
    nameOf: function (prm) {
      return "Stoch(" + prm.p + "," + prm.k + "," + prm.d + ")";
    },
    outputs: [
      { key: "k", kind: "line", color: "#499EE9", style: "solid" },
      { key: "d", kind: "line", color: "#FF8F3C", style: "solid" }
    ],
    guides: [{ price: 80 }, { price: 20 }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var kp = Math.max(1, prm.k | 0);
      var dp = Math.max(1, prm.d | 0);
      var n = bs.close.length;
      var outK = [], outD = [];
      var st = stochInit(p, kp, dp);

      for (var i = 0; i < n; i++) {
        var r = stochOne(st, bs.high[i], bs.low[i], bs.close[i], p, kp, dp);
        st = r.state;
        if (r.values) {
          if (typeof r.values.k === "number") outK.push({ time: bs.time[i], value: r.values.k });
          if (typeof r.values.d === "number") outD.push({ time: bs.time[i], value: r.values.d });
        }
        if (i === n - 2) cap.state = stochCopy(st);
      }
      return { k: outK, d: outD };
    },

    step: function (st, bar, prm) {
      var r = stochOne(
        st, bar.high, bar.low, bar.close,
        Math.max(1, prm.p | 0), Math.max(1, prm.k | 0), Math.max(1, prm.d | 0)
      );
      return { values: r.values || {}, state: r.state };
    }
  });


  /* -- 와일더 평활(RMA) - ADX · Supertrend 가 같이 씁니다 -----------------
   *   첫 값은 앞 len개의 단순평균, 그 뒤로는 ((len-1)·이전 + 새값) / len.
   *   트레이딩뷰 ta.rma 와 같습니다(이 파일의 ATR 이 쓰던 식을 함수로 뽑았습니다).
   *   ⚠️ 상태를 ★새 객체로★ 돌려줍니다 - 진행 중인 봉으로 몇 번을 다시 불러도
   *      들어온 상태가 안 바뀌어 답이 같습니다.
   * --------------------------------------------------------------------- */
  function rmaInit() {
    return { v: 0, n: 0 };
  }

  function rmaPush(st, x, len) {
    var n = st.n + 1;
    var v;
    if (n < len) v = st.v + x;              /* 아직 모으는 중(합) */
    else if (n === len) v = (st.v + x) / len;
    else v = ((len - 1) * st.v + x) / len;
    return { v: v, n: n };
  }

  function rmaVal(st, len) {
    return st.n >= len ? st.v : null;
  }

  /* -- ADX / DMI 방향성지수 ---------------------------------------------
   * "추세가 있느냐(ADX)" 와 "어느 쪽이냐(+DI · -DI)" 를 같이 봅니다.
   * ADX 는 방향을 안 봅니다 - 세기만 봅니다. J. Welles Wilder 가 만들었습니다.
   *
   *   UpMove   = 지금 고가 - 직전 고가
   *   DownMove = 직전 저가 - 지금 저가
   *   +DM = (UpMove > DownMove 그리고 UpMove > 0) 이면 UpMove, 아니면 0
   *   -DM = (DownMove > UpMove 그리고 DownMove > 0) 이면 DownMove, 아니면 0
   *   +DI = 100 · RMA(+DM, len) / RMA(TR, len)
   *   -DI = 100 · RMA(-DM, len) / RMA(TR, len)
   *   DX  = |+DI - -DI| / (+DI + -DI)          (합이 0 이면 1 로 나눕니다)
   *   ADX = 100 · RMA(DX, sig)
   *
   * ⭐ 기본값 14 · 14 - ★트레이딩뷰 기준★ 입니다.
   *    (2026-09-02 트레이딩뷰 도움말 "Directional Movement Index (DMI)" -
   *     Default Input Values : ADX Length 14 · DI Length 14)
   *    ⚠️ 그 도움말은 평활을 "Exponential Moving Average" 라고 뭉뚱그려 적었는데,
   *       ★와일더 평활(RMA)★ 이 맞습니다. Pine 참고서 ta.rma 가 alpha = 1/length
   *       이고, ta.ema 는 alpha = 2/(length+1) 로 ★다른 함수★ 입니다. 원래
   *       와일더가 정의한 것이 1/length 이고 트레이딩뷰 내장도 ta.rma 를 씁니다.
   *    ⚠️ Pine 참고서 ta.dmi 항목에는 ★계산식 예제가 없습니다★ (2026-09-02
   *       브라우저로 열어 확인 - SYNTAX · ARGUMENTS · EXAMPLE 만 있고 pine_dmi
   *       같은 "같은 것을 파인으로 쓰면" 토막이 없습니다). 그래서 위 식은
   *       도움말 문서 + ta.rma 정의를 맞춰 쓴 것입니다.
   *    ⚠️ 참고서 EXAMPLE 의 17 · 14 는 ★예제용 숫자★ 이지 기본값이 아닙니다
   *       (input.int(17, title="DI Length")). 기본값은 도움말의 14 · 14 입니다.
   *    ⚠️ 바이낸스에도 DMI 가 있습니다(Sub Indicator 목록). 차트 시스템은
   *       트레이딩뷰 관할이라 트레이딩뷰 값을 따릅니다.
   *
   * ⚠️ 기준선을 ★안 그립니다★ - 트레이딩뷰 내장 DMI 에는 hline 이 하나도
   *    없습니다(Stochastic 의 20 · 80, RSI 의 30 · 70 과 다릅니다).
   *    "ADX 25 위면 추세" 는 널리 쓰이는 관습이지 트레이딩뷰가 그려 주는 선이
   *    아닙니다. 그리고 싶으면 정의에 guides 한 줄이면 됩니다.
   *
   * ⚠️ TR 이 0 인 구간(고 == 저 == 직전 종가)에서는 나눌 수가 없습니다.
   *    트레이딩뷰가 fixnan 으로 ★직전 값을 그대로 끌고 갑니다.★ 같게 했습니다.
   *
   * -- step 이 O(1) 인 이유 ---------------------------------------------
   *    RMA 네 개(+DM · -DM · TR · DX)와 직전 봉의 고 · 저 · 종뿐입니다.
   *    배열이 하나도 없어서 창을 훑는 일이 아예 없습니다.
   * --------------------------------------------------------------------- */

  function dmiInit() {
    return {
      ph: null, pl: null, pc: null,
      dp: rmaInit(), dm: rmaInit(), tr: rmaInit(), ax: rmaInit(),
      lp: null, lm: null
    };
  }

  /** 봉 하나. seed 와 step 이 ★같은 함수★ 를 씁니다. */
  function dmiOne(st, high, low, close, len, sig) {
    if (st.ph === null) {
      /* 첫 봉은 직전 봉이 없어 +DM · -DM · TR 이 없습니다(트레이딩뷰도 na) */
      return {
        values: null,
        state: {
          ph: high, pl: low, pc: close,
          dp: st.dp, dm: st.dm, tr: st.tr, ax: st.ax, lp: st.lp, lm: st.lm
        }
      };
    }

    var up = high - st.ph;
    var down = st.pl - low;
    var pdm = up > down && up > 0 ? up : 0;
    var mdm = down > up && down > 0 ? down : 0;

    var dpS = rmaPush(st.dp, pdm, len);
    var dmS = rmaPush(st.dm, mdm, len);
    var trS = rmaPush(st.tr, trueRange(high, low, st.pc), len);
    var axS = st.ax;
    var lp = st.lp, lm = st.lm;
    var vals = null;

    var trur = rmaVal(trS, len);
    if (trur !== null) {
      var plus = trur > 0 ? (100 * rmaVal(dpS, len)) / trur : lp;
      var minus = trur > 0 ? (100 * rmaVal(dmS, len)) / trur : lm;
      if (plus !== null && minus !== null) {
        lp = plus;
        lm = minus;
        vals = { plus: plus, minus: minus };
        var sum = plus + minus;
        axS = rmaPush(st.ax, Math.abs(plus - minus) / (sum === 0 ? 1 : sum), sig);
        var av = rmaVal(axS, sig);
        if (av !== null) vals.adx = 100 * av;
      }
    }

    return {
      values: vals,
      state: {
        ph: high, pl: low, pc: close,
        dp: dpS, dm: dmS, tr: trS, ax: axS, lp: lp, lm: lm
      }
    };
  }

  define({
    id: "dmi",
    name: "ADX / DMI",
    note: "추세의 세기와 방향 (+DI · -DI · ADX)",
    pane: "sub",
    params: { len: 14, sig: 14 },
    inputs: [
      { key: "len", label: "DI 기간", min: 1, max: 1000 },
      { key: "sig", label: "ADX 다듬기", min: 1, max: 1000 }
    ],
    nameOf: function (prm) {
      return "DMI(" + prm.len + "," + prm.sig + ")";
    },
    /* 트레이딩뷰 예제가 +DI 파랑 · -DI 주황 · ADX 빨강입니다. 앞의 둘은 그대로
       두고 ADX 만 노랑으로 바꿨습니다 - ★빨강은 손익 표시에만★ 쓰는 규칙 때문입니다. */
    outputs: [
      { key: "plus", kind: "line", color: "#499EE9", style: "solid" },
      { key: "minus", kind: "line", color: "#FF8F3C", style: "solid" },
      { key: "adx", kind: "line", color: "#F2DF0D", style: "solid" }
    ],

    seed: function (bs, prm, cap) {
      var len = Math.max(1, prm.len | 0);
      var sig = Math.max(1, prm.sig | 0);
      var n = bs.close.length;
      var oP = [], oM = [], oA = [];
      var st = dmiInit();

      for (var i = 0; i < n; i++) {
        var r = dmiOne(st, bs.high[i], bs.low[i], bs.close[i], len, sig);
        st = r.state;
        if (r.values) {
          oP.push({ time: bs.time[i], value: r.values.plus });
          oM.push({ time: bs.time[i], value: r.values.minus });
          if (typeof r.values.adx === "number") oA.push({ time: bs.time[i], value: r.values.adx });
        }
        if (i === n - 2) cap.state = st;
      }
      return { plus: oP, minus: oM, adx: oA };
    },

    step: function (st, bar, prm) {
      var r = dmiOne(st, bar.high, bar.low, bar.close, Math.max(1, prm.len | 0), Math.max(1, prm.sig | 0));
      return { values: r.values || {}, state: r.state };
    }
  });

  /* -- Supertrend -------------------------------------------------------
   * ATR 만큼 떨어진 자리에 "따라오는 선" 을 하나 긋습니다. 선이 캔들 아래면
   * 오름세, 위면 내림세입니다. 뒤집히는 봉에서 선이 반대쪽으로 건너뜁니다.
   *
   * ⭐ 계산식 - ★트레이딩뷰 Pine 참고서 ta.supertrend 원문 pine_supertrend()★
   *    을 한 줄씩 옮겼습니다 (2026-09-02 브라우저로 직접 열어 읽은 원문).
   *        src = hl2
   *        atr = ta.atr(atrPeriod)
   *        upperBand = src + factor * atr
   *        lowerBand = src - factor * atr
   *        lowerBand := lowerBand > prevLowerBand or close[1] < prevLowerBand ? lowerBand : prevLowerBand
   *        upperBand := upperBand < prevUpperBand or close[1] > prevUpperBand ? upperBand : prevUpperBand
   *        if na(atr[1])                            _direction := 1
   *        else if prevSuperTrend == prevUpperBand  _direction := close > upperBand ? -1 : 1
   *        else                                     _direction := close < lowerBand ? 1 : -1
   *        superTrend := _direction == -1 ? lowerBand : upperBand
   *    ⚠️ 직접 짜면 어긋납니다 - 자주 빠지는 것이 ★밴드를 한쪽으로만 조이는★
   *       두 줄(:= 로 다시 대입하는 부분)입니다. 이걸 빼면 선이 캔들을 파고듭니다.
   *
   * ⭐ 기본값 ATR 10 · 배수 3 - 같은 문서의 예제가 ta.supertrend(3, 10) 입니다.
   *    ⚠️ 바이낸스에도 SUPER 가 있습니다(Main Indicator). 차트 시스템은
   *       트레이딩뷰 관할이라 트레이딩뷰 값을 따릅니다.
   *
   * ⚠️⚠️ ★뒤집히는 자리에서 선이 끊어져야 합니다.★ 이어 그리면 화면을 가로지르는
   *    큰 사선이 생겨 아예 다른 그림이 됩니다. 트레이딩뷰도 ★선을 둘로 나눠★
   *    그립니다 - plot(direction < 0 ? supertrend : na, "Up direction", ...) 과
   *    plot(direction > 0 ? supertrend : na, "Down direction", ...), 둘 다
   *    style=plot.style_linebr(선 끊기) 입니다. 우리도 선 두 개로 냅니다.
   *    비는 자리에는 ★값 없는 점({time} 만)★ 을 찍어 구멍을 냅니다.
   *
   * ⚠️ 색 - 트레이딩뷰는 초록 · 빨강인데 우리는 그 둘을 지표에 못 씁니다
   *    (손익 색과 헷갈립니다). 하늘 · 분홍으로 냈습니다. 방향은 여전히 색으로
   *    구분되고, 어차피 두 선이 ★같은 자리에 같이 있는 일이 없습니다.★
   *
   * -- step 이 O(1) 인 이유 ---------------------------------------------
   *    상태가 전부 숫자입니다 - ATR 하나, 위 · 아래 밴드, 방향, 지금 선, 직전 종가.
   *    창을 훑지 않고 배열도 없습니다.
   * --------------------------------------------------------------------- */

  function superInit() {
    return { atr: rmaInit(), pc: null, upper: 0, lower: 0, dir: 0, st: null, on: false };
  }

  /** 봉 하나. seed 와 step 이 ★같은 함수★ 를 씁니다. */
  function superOne(state, high, low, close, p, f) {
    var atrS = rmaPush(state.atr, trueRange(high, low, state.pc), p);
    var atr = rmaVal(atrS, p);

    if (atr === null) {
      /* ATR 이 아직 없습니다. 트레이딩뷰도 이 구간엔 아무것도 안 그립니다. */
      return {
        values: null,
        state: { atr: atrS, pc: close, upper: 0, lower: 0, dir: 0, st: null, on: false }
      };
    }

    var src = (high + low) / 2;
    var rawUp = src + f * atr;
    var rawLo = src - f * atr;
    var pUp = state.upper;
    var pLo = state.lower;
    var pc = state.pc;

    var lower = rawLo > pLo || pc < pLo ? rawLo : pLo;
    var upper = rawUp < pUp || pc > pUp ? rawUp : pUp;

    var dir;
    if (!state.on) dir = 1;                       /* na(atr[1]) 인 첫 봉 */
    else if (state.st === pUp) dir = close > upper ? -1 : 1;
    else dir = close < lower ? 1 : -1;

    var line = dir === -1 ? lower : upper;

    return {
      values: { up: dir < 0 ? line : null, dn: dir > 0 ? line : null },
      state: { atr: atrS, pc: close, upper: upper, lower: lower, dir: dir, st: line, on: true }
    };
  }

  define({
    id: "supertrend",
    name: "Supertrend",
    note: "ATR 로 따라오는 추세선",
    pane: "main",
    params: { p: 10, f: 3 },
    inputs: [
      { key: "p", label: "ATR 기간", min: 1, max: 1000 },
      { key: "f", label: "배수", type: "float", min: 0.1, max: 100 }
    ],
    nameOf: function (prm) {
      return "Supertrend(" + prm.p + "," + prm.f + ")";
    },
    outputs: [
      { key: "up", kind: "line", color: "#49C9E9", style: "solid" },
      { key: "dn", kind: "line", color: "#F292DE", style: "solid" }
    ],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var f = fnum(prm.f, 3);
      var n = bs.close.length;
      var oU = [], oD = [];
      var state = superInit();

      for (var i = 0; i < n; i++) {
        var r = superOne(state, bs.high[i], bs.low[i], bs.close[i], p, f);
        state = r.state;
        if (r.values) {
          /* 값이 없는 쪽에는 ★값 없는 점★ 을 찍습니다 - 여기서 끊어야
             뒤집히는 자리에 사선이 안 생깁니다(위 주석). */
          if (r.values.up === null) oU.push({ time: bs.time[i] });
          else oU.push({ time: bs.time[i], value: r.values.up });
          if (r.values.dn === null) oD.push({ time: bs.time[i] });
          else oD.push({ time: bs.time[i], value: r.values.dn });
        }
        if (i === n - 2) cap.state = state;
      }
      return { up: oU, dn: oD };
    },

    step: function (state, bar, prm) {
      var r = superOne(state, bar.high, bar.low, bar.close, Math.max(1, prm.p | 0), fnum(prm.f, 3));
      return { values: r.values || {}, state: r.state };
    }
  });


  /* -- Ichimoku Cloud 일목균형표 ---------------------------------------
   * 선 다섯 개와 ★구름★ 하나로 이뤄집니다. 1960년대에 호소다 고이치가
   * 만들었습니다(트레이딩뷰 도움말 History 절).
   *
   *   전환선 (Conversion) = (최근 9봉 최고 + 최근 9봉 최저) / 2
   *   기준선 (Base)       = (최근 26봉 최고 + 최근 26봉 최저) / 2
   *   선행스팬A (Span A)  = (전환선 + 기준선) / 2        ★26봉 앞으로 밀어★ 그림
   *   선행스팬B (Span B)  = (최근 52봉 최고 + 최저) / 2   ★26봉 앞으로 밀어★ 그림
   *   후행스팬 (Lagging)  = 종가                          ★26봉 뒤로 밀어★ 그림
   *   구름 (Kumo)         = 선행스팬A 와 B ★사이를 칠한 면★
   *
   * ⭐ 기본값 9 · 26 · 52 · 26 과 미는 방향 - ★트레이딩뷰 도움말 원문★ 입니다
   *    (2026-09-02 · "Ichimoku Cloud" 지원 문서를 브라우저로 열어 읽었습니다)
   *        "calculate the Leading Span A ... plot this data point 26 periods
   *         in the future."
   *        "calculate Leading Span B, and again, plot this data point 26
   *         periods in the future as well."
   *        "plot the closing price 26 periods in the past on your chart."
   *        "the cloud is green when Leading Span A is above Leading Span B
   *         and is red when Leading Span B is above Leading Span A."
   *    ⚠️ 바이낸스에는 일목균형표가 ★없습니다★ - 2026-09-02 앞 팀이 Original
   *       차트의 Main 9개 · Sub 10개를 다 세었는데 거기 없었습니다.
   *       차트 시스템은 트레이딩뷰 관할이라 트레이딩뷰만 보고 맞췄습니다.
   *
   * ⚠️⚠️ ★처음 해 보는 것 두 가지가 여기 있습니다.★
   *
   *  ① 앞으로 밀어 그리기 (아직 없는 시간에 점 찍기)
   *     선행스팬은 ★지금 마지막 봉보다 26봉 미래★ 에 그려집니다. 그 시각은
   *     아직 봉이 없습니다. 틀은 이미 그 길이 있었습니다 - timeAtIndex() 가
   *     봉 끝을 넘어가면 ★마지막 봉 간격만큼 늘려★ 시각을 만들어 줍니다
   *     (3절. "앞뒤로 밀기(Offset)" 를 만들 때 낸 길입니다).
   *     이번에 새로 낸 것은 ★선마다 다른 밀기★ 입니다 - outputs[].shift.
   *     회원이 고르는 밀기(off)와 ★더해집니다.★ off 는 취향이고 shift 는
   *     그 지표의 성질입니다.
   *
   *  ② 구름 (두 선 사이를 칠하기)
   *     틀의 outputs 에는 "면" 이 없었습니다. 라이브러리에도 면 시리즈가
   *     없습니다. 대신 ★시리즈에 덧그리개를 붙이는 공개 API★ 가 있어서
   *     (attachPrimitive / paneViews / zOrder / useMediaCoordinateSpace -
   *      dist 안에서 직접 확인) 그걸로 칠했습니다. 정의는 clouds 한 줄만 적습니다.
   *     ⭐ ★색을 새로 만들지 않았습니다.★ 트레이딩뷰는 초록 · 빨강인데 우리는
   *        그 둘을 지표에 못 씁니다. 그래서 ★선행스팬 두 선이 이미 쓰는 색★ 을
   *        알파 0.13 으로 깔았습니다. 위에 있는 쪽 색으로 칠하므로 "A 가 위냐
   *        B 가 위냐" 는 트레이딩뷰와 똑같이 색으로 읽힙니다.
   *
   * ⭐ ★밀기가 26 이냐 25 냐 - 재서 26 으로 확인했습니다★ (2026-09-02)
   *    내장 소스에 plot(..., offset = displacement ★- 1★) 이라 화면상 25봉이라는
   *    말이 돌아서, 넘겨짚지 않고 ★트레이딩뷰 차트를 열어 픽셀로 쟀습니다.★
   *    (로그인 없이 되는 위젯 - s.tradingview.com/widgetembed 에 BINANCE:BTCUSDT
   *     1시간봉 + IchimokuCloud@tv-basicstudies. 범례가 "Ichimoku 9 26 52 26" 이라
   *     기본값 9 · 26 · 52 · 26 도 같이 확인됐습니다)
   *
   *        봉 간격                     5.5924 px  (캔들 212개를 양끝으로 나눔)
   *        마지막 캔들 x               1181       (전환선 · 기준선이 끝나는 자리와 같음)
   *        후행스팬이 끝나는 x         1035
   *        뒤처진 거리                 146 px  =  ★26.11 봉★
   *          25봉이면 1041.2 (7px 어긋남) · 26봉이면 1035.6 (0.6px)  ->  ★26★
   *        구름 오른쪽 끝 x            1325  =  마지막 캔들에서 25.75봉 앞
   *          (26봉이면 1326.4. 그림 영역 오른쪽 끝에 걸려 잘린 값이라 아래쪽 값입니다)
   *
   *    그래서 ★26★ 이 맞습니다. 도움말 문장("plot this data point 26 periods in
   *    the future")과도 같습니다. 회원이 설정에서 고칠 수 있게 열어 두었습니다.
   *
   * ⚠️ 선이 다섯이라 색을 다섯 씁니다. 트레이딩뷰 기본색과 맞춰 보면 -
   *        전환선 파랑(#2962FF -> #499EE9)          같은 계열
   *        기준선 진빨강(#B71C1C -> #BB81AC 연자주)  ★빨강 금지라 바꿈★
   *        후행스팬 초록(#43A047 -> #9FA329 카키)    ★초록 금지라 바꿈★
   *        선행A 연초록(#A5D6A7 -> #C1BAF3 라벤더)   ★초록 금지라 바꿈★
   *        선행B 연빨강(#EF9A9A -> #FF8F3C 주황)     ★빨강 금지라 바꿈★
   *    ⚠️ 선행 두 색만은 ★구름 색으로도 쓰입니다.★ 그래서 서로 ★색상환에서
   *       멀리★ 떨어진 것으로 골랐습니다(라벤더는 찬 쪽 · 주황은 따뜻한 쪽).
   *       처음엔 라벤더 · 모래(#F5D7B8)로 했는데 브라우저에서 보니 ★구름이
   *       둘 다 회색★ 이었습니다 - 두 색이 다 옅고 가까워서입니다.
   *       실측은 CLOUD_ALPHA 주석에 적어 두었습니다.
   *
   * -- step 이 O(1) 인 이유 ---------------------------------------------
   *    최고 · 최저 창 세 개(9 · 26 · 52)뿐이고 전부 위 rollPush 입니다.
   *    보통 비교 한 번, 극값이 창에서 빠질 때만 그 창 길이만큼 훑습니다.
   * --------------------------------------------------------------------- */

  function ichiInit(a, b, c) {
    return { wa: rollInit(a), wb: rollInit(b), wc: rollInit(c) };
  }

  function ichiCopy(st) {
    return { wa: rollCopy(st.wa), wb: rollCopy(st.wb), wc: rollCopy(st.wc) };
  }

  /** 봉 하나. seed 와 step 이 ★같은 함수★ 를 씁니다. */
  function ichiOne(st, high, low, close, a, b, c) {
    var wa = rollPush(st.wa, high, low, a);
    var wb = rollPush(st.wb, high, low, b);
    var wc = rollPush(st.wc, high, low, c);

    var vals = { lag: close };                       /* 후행스팬은 종가 그대로 */
    var conv = wa.cnt >= a ? (wa.hiMax + wa.loMin) / 2 : null;
    var base = wb.cnt >= b ? (wb.hiMax + wb.loMin) / 2 : null;

    if (conv !== null) vals.conv = conv;
    if (base !== null) vals.base = base;
    if (conv !== null && base !== null) vals.spanA = (conv + base) / 2;
    if (wc.cnt >= c) vals.spanB = (wc.hiMax + wc.loMin) / 2;

    return { values: vals, state: { wa: wa, wb: wb, wc: wc } };
  }

  define({
    id: "ichimoku",
    name: "Ichimoku Cloud",
    note: "일목균형표 (전환 · 기준 · 구름 · 후행)",
    pane: "main",
    params: { conv: 9, base: 26, spanB: 52, disp: 26 },
    inputs: [
      { key: "conv", label: "전환선", min: 1, max: 1000 },
      { key: "base", label: "기준선", min: 1, max: 1000 },
      { key: "spanB", label: "선행스팬B", min: 1, max: 1000 },
      { key: "disp", label: "밀기", min: 1, max: 500 }
    ],
    nameOf: function (prm) {
      return "Ichimoku(" + prm.conv + "," + prm.base + "," + prm.spanB + "," + prm.disp + ")";
    },
    outputs: [
      { key: "conv", kind: "line", color: "#499EE9", style: "solid" },
      { key: "base", kind: "line", color: "#BB81AC", style: "solid" },
      {
        key: "spanA", kind: "line", color: "#C1BAF3", style: "solid",
        shift: function (prm) { return Math.max(1, prm.disp | 0); }
      },
      {
        key: "spanB", kind: "line", color: "#FF8F3C", style: "solid",
        shift: function (prm) { return Math.max(1, prm.disp | 0); }
      },
      {
        key: "lag", kind: "line", color: "#9FA329", style: "solid",
        shift: function (prm) { return -Math.max(1, prm.disp | 0); }
      }
    ],
    clouds: [{ a: "spanA", b: "spanB" }],

    seed: function (bs, prm, cap) {
      var a = Math.max(1, prm.conv | 0);
      var b = Math.max(1, prm.base | 0);
      var c = Math.max(1, prm.spanB | 0);
      var n = bs.close.length;
      var out = { conv: [], base: [], spanA: [], spanB: [], lag: [] };
      var st = ichiInit(a, b, c);

      for (var i = 0; i < n; i++) {
        var r = ichiOne(st, bs.high[i], bs.low[i], bs.close[i], a, b, c);
        st = r.state;
        var t = bs.time[i];
        for (var k in r.values) out[k].push({ time: t, value: r.values[k] });
        if (i === n - 2) cap.state = ichiCopy(st);
      }
      return out;
    },

    step: function (st, bar, prm) {
      var r = ichiOne(
        st, bar.high, bar.low, bar.close,
        Math.max(1, prm.conv | 0), Math.max(1, prm.base | 0), Math.max(1, prm.spanB | 0)
      );
      return { values: r.values, state: r.state };
    }
  });

  /* -- RSI 상대강도지수 --------------------------------------------------
   * ⭐ 2026-09-03 (12.7절) 에 ★옛 js/chart-oscillators.js 에서 옮겨 온★ 것입니다.
   *    새로 만든 지표가 아닙니다 - 계산식도 색도 기준선도 옛 것 그대로입니다.
   *
   *   변화량 = 종가(t) - 종가(t-1)
   *   평균상승 · 평균하락 = 와일더 평활(RMA)
   *       첫 값은 앞 p개 변화량의 ★단순평균★ 으로 시작합니다
   *       그 뒤   ((p-1)·이전평균 + 이번값) / p
   *   RSI = 100 - 100/(1 + 평균상승/평균하락)
   *
   * ⚠️ 0 으로 나누는 자리를 ★옛 것과 똑같이★ 둡니다 (js/chart-oscillators.js:197)
   *       평균하락 0 이고 평균상승 0    ->  50   (아예 안 움직인 구간)
   *       평균하락 0 이고 평균상승 있음 ->  100
   *    ⚠️ 같은 파일의 StochRSI(srsiOne)는 ★다르게★ 둡니다(0 · 100). 트레이딩뷰
   *       ta.rsi 를 따른 것입니다. 여기서 그걸 따라가면 옛 RSI 와 값이 어긋나
   *       회원 화면이 조용히 바뀝니다. ★옮기기는 값이 같은 것이 먼저입니다.★
   *
   * ⭐ 기본 기간 14 · 기준선 70 · 30 - 바이낸스 · 트레이딩뷰가 같습니다.
   *    (옛 파일 주석에 그때 실측이 적혀 있습니다 - RSI_PERIOD 14 · 70 / 30)
   * ⭐ 눈금 0~100 고정 - 13.1절. 안 고정하면 값이 40~60 에서 놀 때 눈금이
   *    거기에 맞춰 좁아지고 ★70 · 30 기준선이 화면 밖으로 나갑니다.★
   *    여백 0.12 도 옛 것 그대로입니다(js/chart-oscillators.js:709).
   * ⚠️ unit 은 ★안 붙입니다★ - RSI 는 0~100 지수라 통화가 아닙니다.
   *    붙이면 원화 회원 화면에 "₩56" 이 뜹니다(ATR 과 정반대의 조용한 고장).
   *
   * -- step 이 O(1) 인 이유 -----------------------------------------------
   *    와일더 평활은 이전 평균 둘(상승 · 하락)과 이전 종가 하나면 됩니다.
   *    창을 훑지 않습니다. 상태가 { ag, al, pc } 셋뿐이고 배열이 없어서
   *    "그 자리에서 고쳐 쓰기" 걱정도 없습니다 - 진행 중인 봉 때문에 같은
   *    상태로 몇 번을 다시 불려도 답이 같습니다(새 객체를 돌려줍니다).
   * ------------------------------------------------------------------- */

  /** 와일더 한 걸음 - 옛 js/chart-oscillators.js:186 rsiStep 과 같은 식입니다. */
  function rsiWilder(st, x, p) {
    var ch = x - st.pc;
    var gain = ch > 0 ? ch : 0;
    var loss = ch < 0 ? -ch : 0;
    return {
      ag: (st.ag * (p - 1) + gain) / p,
      al: (st.al * (p - 1) + loss) / p,
      pc: x
    };
  }

  /** 옛 rsiValue 와 같습니다 - 0 나눗셈 자리까지 그대로. */
  function rsiValueOf(st) {
    if (st.al === 0) return st.ag === 0 ? 50 : 100;
    return 100 - 100 / (1 + st.ag / st.al);
  }

  define({
    id: "rsi",
    name: "RSI",
    note: "상대강도",
    pane: "sub",
    /* 13.1 눈금 고정 - 위 주석 참조. 옛 autoscaleInfoProvider + scaleMargins */
    scale: { min: 0, max: 100, top: 0.12, bottom: 0.12 },
    params: { p: 14 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    nameOf: function (prm) {
      return "RSI(" + prm.p + ")";
    },
    outputs: [{ key: "rsi", kind: "line", color: "#E7ECF5", style: "solid" }],
    /* 기준선 70 · 30 - 옛 RSI_UPPER · RSI_LOWER 그대로. 색 · 굵기는 GUIDE_COLOR */
    guides: [{ price: 70 }, { price: 30 }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;
      var n = src.length;
      var out = [];
      /* 옛 computeRSI 와 같은 조건 - 변화량이 p개는 있어야 첫 값이 나옵니다 */
      if (n < p + 1) return { rsi: out };

      var g = 0;
      var l = 0;
      var i;
      var ch;
      for (i = 1; i <= p; i++) {
        ch = src[i] - src[i - 1];
        if (ch > 0) g += ch;
        else l -= ch;
      }
      var st = { ag: g / p, al: l / p, pc: src[p] };
      out.push({ time: bs.time[p], value: rsiValueOf(st) });
      if (p === n - 2) cap.state = { ag: st.ag, al: st.al, pc: st.pc };

      for (i = p + 1; i < n; i++) {
        st = rsiWilder(st, src[i], p);
        out.push({ time: bs.time[i], value: rsiValueOf(st) });
        /* 확정 상태 - "마지막으로 닫힌 봉까지" 입니다. 진행 중인 봉이
           확정값을 오염시키면 평활이 계속 그 오차를 끌고 갑니다. */
        if (i === n - 2) cap.state = { ag: st.ag, al: st.al, pc: st.pc };
      }
      return { rsi: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var ns = rsiWilder(st, x, p);
      return { values: { rsi: rsiValueOf(ns) }, state: ns };
    }
  });

  /* -- MACD 이동평균수렴확산 ---------------------------------------------
   * ⭐ 2026-09-03 (12.8절) 에 ★옛 js/chart-oscillators.js 에서 옮겨 온★ 것입니다.
   *    새로 만든 지표가 아닙니다 - 계산식도 색도 기준선도 옛 것 그대로입니다.
   *
   *   MACD   = EMA(빠른) - EMA(느린)
   *   신호선 = MACD 의 EMA(신호)
   *   막대   = MACD - 신호선          ★이 틀에서 kind:"hist" 를 쓰는 첫 지표★
   *
   * ⚠️ 시작값을 ★옛 것과 똑같이★ 둡니다 (js/chart-oscillators.js:257 computeMACD)
   *      빠른 EMA  앞 fast개의 단순평균으로 시작한 뒤 [fast, slow) 구간만 평활
   *      느린 EMA  앞 slow개의 단순평균 (그 자리에서 바로 씀 - 평활 안 함)
   *      신호선    처음 signal개 MACD 값의 ★단순평균★ 으로 시작
   *    즉 첫 봉(i = slow-1)에서 빠른 EMA 는 c[0..slow-2] 까지, 느린 EMA 는
   *    c[0..slow-1] 까지 먹은 상태입니다. ★고르지 않아 보이지만 옛 것 그대로★
   *    입니다 - 여기를 "정리" 하면 회원이 보던 선이 조용히 달라집니다.
   *
   * ⭐ 기본 12 / 26 / 9 - 바이낸스 선물 차트 · 트레이딩뷰가 같습니다
   *    (옛 파일 MACD_FAST · MACD_SLOW · MACD_SIGNAL 그대로)
   * ⭐ unit: "price" ★필수★ - MACD 는 ★가격 차이★ 입니다(EMA 뺄셈).
   *    안 붙이면 원화로 보는 회원 화면에 USDT 숫자가 그대로 뜹니다.
   *    2026-09-03 에 ATR 이 정확히 그 상태였습니다(오류 0건 · 화면 멀쩡 ·
   *    회원은 그게 USDT 인 줄 모름). 옛 모듈은 macdPriceFormat() 이 같은 일을
   *    하고 있었습니다 - 옮기면서 그 일을 틀의 unit 으로 넘깁니다.
   * ⚠️ 눈금은 ★고정하지 않습니다★ (scale.min/max 없음). RSI 와 다릅니다 -
   *    MACD 는 정해진 범위가 없는 가격 차이라 0~100 같은 틀을 씌우면 선이
   *    화면 밖으로 나갑니다. 대신 옛 것과 같은 위·아래 여백 0.15 만 겁니다.
   *    0선은 막대(hist)가 늘 0 에서 자라기 때문에 눈금 안에 들어옵니다
   *    (HistogramSeries 는 base 0 을 눈금 계산에 포함합니다 - 아래 실측 주석).
   *
   * -- 출력 순서가 ★그리는 순서★ 입니다 ---------------------------------
   *    막대 → MACD → 신호선. 막대를 먼저 만들어야 선이 그 위에 옵니다
   *    (옛 파일 733줄 주석과 같은 이유). 트레이딩뷰 내장 MACD 도 plot 순서가
   *    Histogram → MACD → Signal 이라 범례 숫자 순서까지 같아집니다.
   *
   * -- step 이 O(1) 인 이유 -----------------------------------------------
   *    EMA 세 개(빠른 · 느린 · 신호선)는 직전 값만 있으면 다음 값이 나옵니다.
   *    창을 훑지 않습니다. 상태가 { emaFast, emaSlow, sig } 셋뿐이고 배열이
   *    없어서 같은 상태로 몇 번 다시 불려도 답이 같습니다(새 객체를 냅니다).
   * ------------------------------------------------------------------- */

  /** MACD 한 걸음 - 옛 js/chart-oscillators.js:235 macdStep 과 같은 식입니다. */
  function macdOne(st, x, fast, slow, signal) {
    var kf = 2 / (fast + 1);
    var ks = 2 / (slow + 1);
    var kg = 2 / (signal + 1);
    var ef = x * kf + st.emaFast * (1 - kf);
    var es = x * ks + st.emaSlow * (1 - ks);
    var m = ef - es;
    var sg = st.sig === null || st.sig === undefined ? null : m * kg + st.sig * (1 - kg);
    return {
      values: { macd: m, signal: sg, hist: sg === null ? null : m - sg },
      state: { emaFast: ef, emaSlow: es, sig: sg }
    };
  }

  define({
    id: "macd",
    name: "MACD",
    note: "이동평균수렴확산",
    pane: "sub",
    /* 13.3 값이 가격 차이라 표시 통화를 따라갑니다 - 위 주석 참조 */
    unit: "price",
    /* 13.1 범위는 안 고정하고 여백만 - 옛 scaleMargins {top:0.15, bottom:0.15} */
    scale: { top: 0.15, bottom: 0.15 },
    params: { fast: 12, slow: 26, sig: 9 },
    inputs: [
      { key: "fast", label: "빠른 기간", min: 1, max: 1000 },
      { key: "slow", label: "느린 기간", min: 1, max: 1000 },
      { key: "sig", label: "신호선", min: 1, max: 1000 }
    ],
    useSource: true,
    nameOf: function (prm) {
      return "MACD(" + prm.fast + "," + prm.slow + "," + prm.sig + ")";
    },
    /* 색 셋은 ★지금 회원이 보던 그 색★ 입니다 - 옛 COLORS.hist · macd · signal */
    outputs: [
      { key: "hist", kind: "hist", color: "#838DA4" },
      { key: "macd", kind: "line", color: "#E7ECF5", style: "solid" },
      { key: "signal", kind: "line", color: "#F0B429", style: "solid" }
    ],
    /* 0선 - 옛 addGuide(series.macd, 0, COLORS.zero) 그대로 (#1D273B 점선) */
    guides: [{ price: 0 }],

    seed: function (bs, prm, cap) {
      var fast = Math.max(1, prm.fast | 0);
      var slow = Math.max(1, prm.slow | 0);
      var signal = Math.max(1, prm.sig | 0);
      var src = bs.src || bs.close;
      var n = src.length;
      var out = { macd: [], signal: [], hist: [] };
      if (n < slow) return out;

      var kf = 2 / (fast + 1);
      var ks = 2 / (slow + 1);
      var kg = 2 / (signal + 1);
      var i;
      var sum = 0;

      /* 빠른 EMA - 앞 fast개 단순평균으로 시작해 [fast, slow) 만 평활 */
      for (i = 0; i < fast; i++) sum += src[i];
      var ef = sum / fast;
      for (i = fast; i < slow; i++) ef = src[i] * kf + ef * (1 - kf);

      /* 느린 EMA - 앞 slow개 단순평균 */
      sum = 0;
      for (i = 0; i < slow; i++) sum += src[i];
      var es = sum / slow;

      var sig = null;
      var seedSum = 0;
      var seedCount = 0;

      for (i = slow - 1; i < n; i++) {
        if (i > slow - 1) {
          ef = src[i] * kf + ef * (1 - kf);
          es = src[i] * ks + es * (1 - ks);
        }
        var m = ef - es;

        if (sig === null) {
          seedSum += m;
          seedCount++;
          if (seedCount === signal) sig = seedSum / signal;
        } else {
          sig = m * kg + sig * (1 - kg);
        }

        out.macd.push({ time: bs.time[i], value: m });
        if (sig !== null) {
          out.signal.push({ time: bs.time[i], value: sig });
          out.hist.push({ time: bs.time[i], value: m - sig });
        }

        /* 확정 상태 - "마지막으로 닫힌 봉까지". 신호선이 아직 자리를 못 잡았으면
           실시간 한 걸음도 못 하므로 넘기지 않습니다(옛 것과 같은 판단). */
        if (i === n - 2) cap.state = sig === null ? null : { emaFast: ef, emaSlow: es, sig: sig };
      }
      return out;
    },

    step: function (st, bar, prm) {
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      return macdOne(
        st, x,
        Math.max(1, prm.fast | 0), Math.max(1, prm.slow | 0), Math.max(1, prm.sig | 0)
      );
    }
  });

  /* ---------------------------------------------------------------------
   * 옛 MA 를 대신하는 인스턴스 - ★여기 한 곳에만★ 적습니다.
   *
   * 옛 이름(ma7 · ma25 · ma99)은 RESERVED_IDS 라 쓸 수 없습니다. 일부러
   * 그렇게 막아 두었습니다 - 같은 이름이면 fx 목록의 다리가 갈라져서
   * "MA(7) 스위치가 딴 것을 켜는" 조용한 고장이 납니다. 그래서 ma-7 입니다.
   *
   * 색 세 개는 ★지금 회원이 보던 그 색★ 입니다. 바꾸지 마세요.
   *   MA(7)  #F0B429 금색   MA(25) #E7ECF5 흰색   MA(99) #838DA4 회색
   * ------------------------------------------------------------------- */
  var MOVED_MA = [
    { old: "ma7", id: "ma-7", p: 7, hex: "#F0B429" },
    { old: "ma25", id: "ma-25", p: 25, hex: "#E7ECF5" },
    { old: "ma99", id: "ma-99", p: 99, hex: "#838DA4" }
  ];

  /* ---------------------------------------------------------------------
   * 옛 볼린저를 대신하는 인스턴스 - ★여기 한 곳에만★ 적습니다. (12.6절)
   *
   * 옛 이름 "bb" 는 RESERVED_IDS 라 쓸 수 없습니다(MA 와 같은 이유).
   * 색 셋은 ★지금 회원이 보던 그 색★ 입니다 - 위 · 중간 · 아래 전부
   * 보조색 #838DA4 에 ★점선★. 바꾸지 마세요.
   * 기간 20 · 배수 2 는 옛 BB_PERIOD · BB_MULT 그대로입니다.
   * ------------------------------------------------------------------- */
  var MOVED_BB = { old: "bb", id: "bb-20", p: 20, k: 2, hex: "#838DA4" };

  /* ---------------------------------------------------------------------
   * 옛 RSI 를 대신하는 인스턴스 - ★여기 한 곳에만★ 적습니다. (12.7절)
   *
   * 옛 이름 "rsi" 는 RESERVED_IDS 라 쓸 수 없습니다(MA · 볼린저와 같은 이유).
   * 색은 ★지금 회원이 보던 그 색★ 입니다 - 본문색 #E7ECF5 실선 굵기 1.
   * 기간 14 는 옛 RSI_PERIOD 그대로입니다. 바꾸지 마세요.
   *
   * ⚠️ 옛 RSI 는 js/chart-indicators.js 가 아니라 ★js/chart-oscillators.js★
   *    가 그립니다. 그래서 켜짐/꺼짐을 묻는 곳도, 끄는 곳도 저 모듈입니다.
   * ------------------------------------------------------------------- */
  var MOVED_RSI = { old: "rsi", id: "rsi-14", p: 14, hex: "#E7ECF5" };

  /* ---------------------------------------------------------------------
   * 옛 MACD 를 대신하는 인스턴스 - ★여기 한 곳에만★ 적습니다. (12.8절)
   *
   * 옛 이름 "macd" 는 RESERVED_IDS 라 쓸 수 없습니다(MA · 볼린저 · RSI 와 같은 이유).
   * 색 셋은 ★지금 회원이 보던 그 색★ 입니다 - 막대 #838DA4 · MACD #E7ECF5 ·
   * 신호선 #F0B429, 전부 굵기 1 실선. 12 / 26 / 9 도 옛 값 그대로입니다.
   *
   * ⚠️ 옛 MACD 도 RSI 와 같은 js/chart-oscillators.js 것입니다.
   * ------------------------------------------------------------------- */
  var MOVED_MACD = {
    old: "macd",
    id: "macd-12-26-9",
    fast: 12,
    slow: 26,
    sig: 9,
    colors: { hist: "#838DA4", macd: "#E7ECF5", signal: "#F0B429" }
  };

  /* 처음 오는 회원에게 주는 기본 인스턴스 - 전부 꺼짐입니다.
     정의는 "ema" 하나인데 인스턴스가 둘입니다. 이것이 8단계의 증명이었습니다.
     ⭐ 2026-09-02 (11단계) 에 MA 세 줄이 늘었습니다 - ★늘린 것이 아니라
        옛 js/chart-indicators.js 의 MA(7)·MA(25)·MA(99) 를 옮겨 온 것★ 입니다.
        옛 줄은 fx 목록과 칩 줄에서 빼기 때문에(아래 12.5절) 회원이 보는
        줄 수는 그대로입니다. 셋 다 ★꺼짐★ 으로 시작하는 것도 그대로입니다
        (옮길 때 회원이 켜 두었던 것은 12.5절이 그대로 다시 켭니다). */
  var DEFAULT_INSTANCES = [
    { def: "ma", id: "ma-7", params: { p: 7 }, colors: { ma: "#F0B429" }, style: "solid", on: false },
    { def: "ma", id: "ma-25", params: { p: 25 }, colors: { ma: "#E7ECF5" }, style: "solid", on: false },
    { def: "ma", id: "ma-99", params: { p: 99 }, colors: { ma: "#838DA4" }, style: "solid", on: false },
    {
      /* ⭐ 2026-09-02 (12단계) - 옛 볼린저를 옮겨 온 줄입니다(아래 12.6절).
         MA 세 줄과 같은 이유로 늘어난 것이 아닙니다 - 옛 줄이 빠집니다.
         자리도 옛 fx 목록 그대로 MA(99) 다음입니다. */
      def: "bb",
      id: "bb-20",
      params: { p: 20, k: 2 },
      colors: { upper: "#838DA4", middle: "#838DA4", lower: "#838DA4" },
      style: "dashed",
      on: false
    },
    { def: "ema", id: "ema-9", params: { p: 9 }, colors: { ema: "#49C9E9" }, style: "solid", on: false },
    { def: "ema", id: "ema-21", params: { p: 21 }, colors: { ema: "#BA6EED" }, style: "solid", on: false }
  ];

  /* =====================================================================
   * 12.5 ★옛 MA(7)·MA(25)·MA(99) 를 이 틀로 옮기기★  - 한 번만
   *
   * -- 이 절에서 제일 위험한 것 -----------------------------------------
   * 회원 브라우저에는 이미 "MA7 켬 · 볼린저 끔" 같은 상태가 옛 칸
   * (btc_sim_v2_chart-indicators)에 저장돼 있습니다. 틀로 옮기면 저장칸이
   * 달라지므로, ★켜 두었던 것이 꺼진 채로 굳을 수★ 있습니다. 그래서
   *   1) 옛 켜짐/꺼짐을 ★먼저 읽고★
   *   2) 그대로 새 인스턴스에 옮겨 켜고
   *   3) ★그 다음에★ 옛 선을 끕니다 (안 끄면 같은 선이 두 벌 그려집니다)
   * 순서로만 합니다. 하나라도 못 하면 아무것도 안 하고 다음 기회를 봅니다.
   *
   * -- 옛 켜짐/꺼짐을 ★저장칸이 아니라 옛 모듈에게★ 묻습니다 -----------
   * App.ChartIndicators.getState() 로 묻습니다. 옛 저장칸을 우리가 직접
   * 열지 않습니다 - 한 칸의 주인은 하나여야 합니다(그 칸에 쓰지도 않습니다.
   * 끄는 것도 저쪽 setOn() 을 불러 ★저쪽이 저쪽 칸에★ 쓰게 합니다).
   * 아직 옛 모듈이 상태를 안 읽었으면(state 가 비어 있으면) ★옮기지 않고★
   * 다음 기회를 봅니다 - 그때 옮기면 켜 두었던 것이 꺼짐으로 굳습니다.
   *
   * -- 회원이 보는 줄 수는 그대로입니다 ---------------------------------
   * 옛 줄 셋을 fx 목록과 칩 줄에서 ★빼고★, 우리 줄 셋을 ★그 자리에★
   * 끼웁니다(순서까지 같습니다). js/chart-indicator-menu.js 와
   * js/chart-indicators.js 는 한 글자도 안 고쳤습니다 - 화면에 그려진 뒤에
   * 우리가 DOM 을 정리합니다(인계문서 1-1 의 "DOM 후처리" 패턴).
   *
   * -- 되돌리기 ---------------------------------------------------------
   * 콘솔에서  App.ChartIndicatorKit.restoreLegacyMA()  → 새로고침.
   * 옮기기 직전의 옛 켜짐/꺼짐(legacy0)이 그대로 돌아옵니다.
   * ===================================================================== */
  function legacyIND() {
    return App.ChartIndicators || null;
  }

  /** 이미 옮겼나 */
  function movedMA() {
    return !!(movedState && movedState.ma);
  }

  /** 옛 켜짐/꺼짐. 아직 못 읽는 상태면 null 을 돌려줍니다(그때는 안 옮깁니다). */
  function readLegacyMA() {
    var IND = legacyIND();
    if (!IND || !isFn(IND.getState)) return null;
    var g;
    try {
      g = IND.getState();
    } catch (e) {
      return null;
    }
    if (!g || typeof g !== "object") return null;
    /* 옛 모듈이 아직 init() 을 안 지났으면 state 가 null 이라 빈 객체가 옵니다 */
    if (!("ma7" in g)) return null;
    return { ma7: !!g.ma7, ma25: !!g.ma25, ma99: !!g.ma99 };
  }

  function moveLegacyMA(quiet) {
    if (movedMA()) return false;
    var old = readLegacyMA();
    if (!old) return false;   /* 아직 못 읽음 - 다음 기회에 */

    MOVED_MA.forEach(function (m) {
      if (insts[m.id]) {
        insts[m.id].on = !!old[m.old];
        return;
      }
      addInstance("ma", {
        id: m.id,
        params: { p: m.p },
        colors: { ma: m.hex },
        style: "solid",
        width: DEFAULT_WIDTH,
        on: !!old[m.old]
      });
    });

    /* 옛 선 끄기 - ★우리 인스턴스를 다 만든 뒤에★ 합니다 */
    var IND = legacyIND();
    if (IND && isFn(IND.setOn)) {
      MOVED_MA.forEach(function (m) {
        try {
          IND.setOn(m.old, false);
        } catch (e) {
          /* 못 꺼도 화면은 돕니다 - 그 경우 선이 두 벌 보이므로 아래 경고를 남깁니다 */
        }
      });
    }

    movedState = movedState || {};
    movedState.ma = true;
    movedState.at = Date.now();
    movedState.legacy0 = old;
    saveState();

    /* 옮긴 직후에 화면도 맞춥니다(다음 감시를 기다리지 않게).
       ⚠️ quiet 이면 안 그립니다 - 아래 moveLegacyAll() 이 ★둘 다 옮긴 뒤★
          한 번만 그리려고 씁니다. 하나씩 그리면 아직 안 옮긴 쪽의 줄이
          "옛 자리" 를 못 찾아 목록 맨 뒤로 밀립니다(실제로 그랬습니다). */
    if (!quiet) {
      buildButtons();
      injectMenuRows();
      paintMenu();
    }
    return true;
  }

  /** 되돌리기 - 우리 MA 줄 셋을 지우고 옛 켜짐/꺼짐을 되살립니다. */
  function restoreLegacyMA() {
    if (!movedMA()) return false;
    var old = movedState.legacy0 || { ma7: false, ma25: false, ma99: false };
    MOVED_MA.forEach(function (m) {
      if (insts[m.id]) removeInstance(m.id);
    });
    var IND = legacyIND();
    if (IND && isFn(IND.setOn)) {
      MOVED_MA.forEach(function (m) {
        try {
          IND.setOn(m.old, !!old[m.old]);
        } catch (e) {
          /* 무시 */
        }
      });
    }
    /* ⚠️ movedState 를 통째로 비우면 ★볼린저 · RSI 표시까지★ 지워져서, 다음
       새로고침에 그것들이 다시 옮겨집니다(회원이 지운 줄이 되살아납니다).
       그래서 ★자기 표시만★ 내리고 남의 표시는 그대로 둡니다.
       ⚠️ 2026-09-03 (12.7절) 에 여기를 고쳤습니다 - 그전에는 볼린저 표시만
          손으로 다시 만들어 담아서, RSI 표시가 조용히 사라졌습니다. */
    movedState.ma = false;
    movedState.legacy0 = null;
    if (!movedState.bb && !movedState.rsi && !movedState.macd) movedState = null;
    saveState();
    /* 옛 줄·옛 칩은 ★새로고침하면★ 그대로 돌아옵니다(옛 모듈이 다시 그립니다) */
    return true;
  }

  /* =====================================================================
   * 12.6 ★옛 볼린저(BOLL 20, 2) 를 이 틀로 옮기기★  - 한 번만
   *
   * 위 12.5절(MA)과 ★같은 순서·같은 안전장치★ 입니다. 다른 점만 적습니다.
   *   · 옛 켜짐/꺼짐도 같은 App.ChartIndicators.getState() 에서 읽습니다
   *     (볼린저는 MA 와 같은 파일·같은 저장칸에 있습니다)
   *   · 줄이 셋(위·중간·아래)이지만 회원에게는 ★스위치 하나★ 입니다 -
   *     틀에서도 인스턴스 하나에 선 셋이라 그대로입니다
   *   · 색·선모양을 안 바꿉니다 - #838DA4 점선 셋 그대로입니다
   *
   * -- 되돌리기 ---------------------------------------------------------
   * 콘솔에서  App.ChartIndicatorKit.restoreLegacyBB()  → 새로고침.
   * 옮기기 직전의 옛 켜짐/꺼짐(legacyBB)이 그대로 돌아옵니다.
   * ===================================================================== */
  function movedBB() {
    return !!(movedState && movedState.bb);
  }

  /** 옛 볼린저 켜짐/꺼짐. 아직 못 읽는 상태면 null(그때는 안 옮깁니다). */
  function readLegacyBB() {
    var IND = legacyIND();
    if (!IND || !isFn(IND.getState)) return null;
    var g;
    try {
      g = IND.getState();
    } catch (e) {
      return null;
    }
    if (!g || typeof g !== "object") return null;
    if (!("bb" in g)) return null;
    return { bb: !!g.bb };
  }

  function moveLegacyBB(quiet) {
    if (movedBB()) return false;
    var old = readLegacyBB();
    if (!old) return false;   /* 아직 못 읽음 - 다음 기회에 */

    if (insts[MOVED_BB.id]) {
      insts[MOVED_BB.id].on = !!old.bb;
    } else {
      addInstance("bb", {
        id: MOVED_BB.id,
        params: { p: MOVED_BB.p, k: MOVED_BB.k },
        colors: { upper: MOVED_BB.hex, middle: MOVED_BB.hex, lower: MOVED_BB.hex },
        style: "dashed",
        width: DEFAULT_WIDTH,
        on: !!old.bb
      });
    }

    /* 옛 선 끄기 - ★우리 인스턴스를 만든 뒤에★ 합니다(안 끄면 두 벌) */
    var IND = legacyIND();
    if (IND && isFn(IND.setOn)) {
      try {
        IND.setOn(MOVED_BB.old, false);
      } catch (e) {
        /* 못 꺼도 화면은 돕니다 - 그 경우 선이 두 벌 보입니다 */
      }
    }

    movedState = movedState || {};
    movedState.bb = true;
    movedState.bbAt = Date.now();
    movedState.legacyBB = { bb: !!old.bb };
    saveState();

    if (!quiet) {
      buildButtons();
      injectMenuRows();
      paintMenu();
    }
    return true;
  }

  /** 옮길 것을 ★다 옮긴 뒤★ 화면을 한 번만 맞춥니다.
   *  순서가 중요합니다 - 줄을 하나 끼울 때마다 "옛 줄이 있던 자리" 를
   *  찾는데, 아직 안 옮긴 쪽의 옛 줄이 살아 있어야 그 앞에 끼울 수 있습니다. */
  function moveLegacyAll() {
    var a = moveLegacyMA(true);
    var b = moveLegacyBB(true);
    var c = moveLegacyRSI(true);   /* 12.7절 - 옛 모듈이 다릅니다(오실레이터) */
    var e = moveLegacyMACD(true); /* 12.8절 - RSI 와 같은 오실레이터 모듈 */
    if (!a && !b && !c && !e) return false;
    buildButtons();
    injectMenuRows();
    paintMenu();
    return true;
  }

  /** 되돌리기 - 우리 볼린저 줄을 지우고 옛 켜짐/꺼짐을 되살립니다. */
  function restoreLegacyBB() {
    if (!movedBB()) return false;
    var old = (movedState && movedState.legacyBB) || { bb: false };
    if (insts[MOVED_BB.id]) removeInstance(MOVED_BB.id);
    var IND = legacyIND();
    if (IND && isFn(IND.setOn)) {
      try {
        IND.setOn(MOVED_BB.old, !!old.bb);
      } catch (e) {
        /* 무시 */
      }
    }
    movedState.bb = false;
    movedState.legacyBB = null;
    if (!movedState.ma && !movedState.rsi && !movedState.macd) movedState = null;
    saveState();
    return true;
  }

  /* =====================================================================
   * 12.7 ★옛 RSI(14) 를 이 틀로 옮기기★  - 한 번만
   *
   * 위 12.5절(MA) · 12.6절(볼린저)과 ★같은 순서·같은 안전장치★ 입니다.
   * 다른 점만 적습니다.
   *
   *   · 옛 모듈이 ★다릅니다★ - js/chart-oscillators.js (App.ChartOscillators).
   *     켜짐/꺼짐도 저쪽 getState() 에서 읽고, 끄는 것도 저쪽 setOn() 입니다.
   *     저쪽 저장칸(btc_sim_v2_chart-oscillators)을 우리가 직접 열지 않습니다 -
   *     한 칸의 주인은 하나여야 합니다.
   *   · 옛 칩의 ★생김새가 다릅니다★ - 2단계 칩은 .tl-ind-btn[data-ind],
   *     3단계 칩은 .tl-osc-btn[data-osc] 입니다(서로 색을 안 건드리려고 클래스를
   *     따로 둔 것입니다). 그래서 아래 legacyChipSel() 이 짝마다 갈라 씁니다.
   *     fx 목록 줄은 둘 다 .tl-fx-row[data-key] 라 같습니다.
   *   · 옛 아래칸 이름표(.tl-osc-label "RSI 14  56.90")는 옛 모듈이 RSI 를
   *     그릴 때만 만듭니다. 옮긴 뒤에는 안 그리므로 저절로 안 생깁니다.
   *     대신 13.2절 칸 이름표가 같은 자리에 뜹니다.
   *
   * -- 안 바꾼 것 -------------------------------------------------------
   *   기간 14 · 색 #E7ECF5 · 실선 · 굵기 1 · 기준선 70 · 30 (#1D273B 점선) ·
   *   눈금 0~100 고정 · 칸 위아래 여백 0.12 · ★계산값(옛 computeRSI 와 오차 0)★
   *   더하는 순서와 0 나눗셈 처리까지 옛 것과 같게 맞췄습니다(아래 rsi 정의).
   *
   * -- 달라진 것 (숫자로 적습니다) --------------------------------------
   *   칩 글자   "RSI"      ->  "RSI(14)"        (MA · 볼린저를 옮길 때와 같습니다.
   *                                              기간을 회원이 고칠 수 있게 돼서
   *                                              이름에 기간이 들어갑니다)
   *   칸 이름표 10px       ->  12px            (13.2절 - 옛 것보다 2px 큽니다)
   *   칸 높이   0.30       ->  0.32            (PANE_RATIO. 틀이 쓰는 값 하나로
   *                                              모읍니다 - KDJ · CCI 와 같은 높이)
   *   설정 버튼 없음       ->  있음            (기간 · 값 종류 · 색 · 굵기 · 선모양)
   *
   * -- 왜 DEFAULT_INSTANCES 에 안 넣었나 --------------------------------
   *   MA · 볼린저와 다르게 ★기본 인스턴스 목록에 넣지 않았습니다.★
   *   넣으면 처음 오는 회원의 기본 줄에 ma-25(#E7ECF5 실선)와 rsi-14(#E7ECF5
   *   실선)가 ★같은 색 같은 선모양★ 으로 나란히 서고, 그것을 세는 봉인
   *   (tests/chart-indicator-color-collision.test.js [3] "기본 인스턴스끼리는
   *   색이 안 겹친다")이 빨개집니다. 색을 바꾸면 봉인은 통과하지만 ★회원이
   *   보던 RSI 선 색이 바뀝니다.★ 옮기기의 첫 번째 원칙(화면이 안 바뀌게)이
   *   먼저라, 색을 그대로 두고 기본 목록에 안 넣는 쪽을 골랐습니다.
   *   줄은 아래 moveLegacyRSI() 가 만들어 끼웁니다 - 회원이 보는 줄 수는
   *   그대로입니다(옛 줄이 빠지고 우리 줄이 그 자리에 들어갑니다).
   *   태생값("기본값" 버튼이 돌아갈 자리)은 movedDefaultsOf() 가 답합니다.
   *
   * -- 되돌리기 ---------------------------------------------------------
   * 콘솔에서  App.ChartIndicatorKit.restoreLegacyRSI()  → 새로고침.
   * 옮기기 직전의 옛 켜짐/꺼짐(legacyRSI)이 그대로 돌아옵니다.
   * ===================================================================== */
  function legacyOSC() {
    return App.ChartOscillators || null;
  }

  function movedRSI() {
    return !!(movedState && movedState.rsi);
  }

  /** 옛 RSI 켜짐/꺼짐. 아직 못 읽는 상태면 null(그때는 안 옮깁니다). */
  function readLegacyRSI() {
    var OSC = legacyOSC();
    if (!OSC || !isFn(OSC.getState)) return null;
    var g;
    try {
      g = OSC.getState();
    } catch (e) {
      return null;
    }
    if (!g || typeof g !== "object") return null;
    /* 옛 모듈이 아직 init() 을 안 지났으면 state 가 null 이라 빈 객체가 옵니다 */
    if (!("rsi" in g)) return null;
    return { rsi: !!g.rsi };
  }

  function moveLegacyRSI(quiet) {
    if (movedRSI()) return false;
    var old = readLegacyRSI();
    if (!old) return false;   /* 아직 못 읽음 - 다음 기회에 */

    if (insts[MOVED_RSI.id]) {
      insts[MOVED_RSI.id].on = !!old.rsi;
    } else {
      addInstance("rsi", {
        id: MOVED_RSI.id,
        params: { p: MOVED_RSI.p },
        colors: { rsi: MOVED_RSI.hex },
        style: "solid",
        width: DEFAULT_WIDTH,
        on: !!old.rsi
      });
    }

    /* 옛 선 끄기 - ★우리 인스턴스를 만든 뒤에★ 합니다(안 끄면 두 벌) */
    var OSC = legacyOSC();
    if (OSC && isFn(OSC.setOn)) {
      try {
        OSC.setOn(MOVED_RSI.old, false);
      } catch (e) {
        /* 못 꺼도 화면은 돕니다 - 그 경우 선이 두 벌 보입니다 */
      }
    }

    movedState = movedState || {};
    movedState.rsi = true;
    movedState.rsiAt = Date.now();
    movedState.legacyRSI = { rsi: !!old.rsi };
    saveState();

    if (!quiet) {
      buildButtons();
      injectMenuRows();
      paintMenu();
    }
    return true;
  }

  /** 되돌리기 - 우리 RSI 줄을 지우고 옛 켜짐/꺼짐을 되살립니다. */
  function restoreLegacyRSI() {
    if (!movedRSI()) return false;
    var old = (movedState && movedState.legacyRSI) || { rsi: false };
    if (insts[MOVED_RSI.id]) removeInstance(MOVED_RSI.id);
    var OSC = legacyOSC();
    if (OSC && isFn(OSC.setOn)) {
      try {
        OSC.setOn(MOVED_RSI.old, !!old.rsi);
      } catch (e) {
        /* 무시 */
      }
    }
    movedState.rsi = false;
    movedState.legacyRSI = null;
    if (!movedState.ma && !movedState.bb && !movedState.macd) movedState = null;
    saveState();
    /* 옛 줄·옛 칩은 ★새로고침하면★ 그대로 돌아옵니다(옛 모듈이 다시 그립니다) */
    return true;
  }

  /* =====================================================================
   * 12.8 ★옛 MACD(12, 26, 9) 를 이 틀로 옮기기★  - 한 번만
   *
   * 위 12.7절(RSI)과 ★같은 순서·같은 안전장치★ 입니다. 옛 모듈도 같습니다
   * (js/chart-oscillators.js · App.ChartOscillators · 칩이 data-osc).
   * 다른 점만 적습니다.
   *
   *   · ★막대(kind:"hist") 를 쓰는 첫 지표★ 입니다. 틀에 길만 나 있고
   *     아무도 안 써 본 길이었습니다(ALLOWED_KINDS 에 hist 는 처음부터 있었고
   *     addSeriesFor 가 HistogramSeries 를 고르는 줄도 있었지만, 그 줄을 타는
   *     정의가 하나도 없었습니다). 실제로 태워 본 결과는 아래 실측에 적습니다.
   *   · 값이 ★가격 차이★ 라 unit: "price" 를 붙였습니다. 옛 모듈의
   *     macdPriceFormat() 이 하던 일을 틀이 대신합니다(같은 일 두 벌 금지).
   *
   * -- 안 바꾼 것 -------------------------------------------------------
   *   12 / 26 / 9 · 색 셋(#838DA4 막대 · #E7ECF5 MACD · #F0B429 신호선) ·
   *   굵기 1 실선 · 0선(#1D273B 점선) · 칸 위아래 여백 0.15 ·
   *   ★계산값(옛 computeMACD 와 오차 0)★ · 그리는 순서(막대가 선 아래)
   *
   * -- 달라진 것 (숫자로 적습니다) --------------------------------------
   *   칩 글자    "MACD"        ->  "MACD(12,26,9)"   (MA · 볼린저 · RSI 때와 같습니다)
   *   칩 점 색   #F0B429 금색  ->  #838DA4 회색
   *              ⚠️ 점 색은 ★첫 번째 출력선★ 을 따릅니다(mainColor). 막대를
   *                 먼저 그려야 선이 그 위에 오기 때문에 첫 줄이 막대입니다.
   *                 옛 칩은 신호선 색을 손으로 적어 두었습니다(BUTTONS).
   *   칸 이름표  "MACD 12 26 9  1.34  1.46"  ->  값이 ★셋★ (막대 · MACD · 신호선)
   *              트레이딩뷰 내장 MACD 도 Histogram · MACD · Signal 셋을 띄웁니다
   *   이름표 글씨 10px -> 12px  ·  칸 높이 0.30 -> 0.32   (12.7절과 같은 이유)
   *   설정 버튼  없음 -> 있음   (빠른 · 느린 · 신호선 기간 · 값 종류 · 색 · 굵기 · 선모양)
   *
   * -- 왜 DEFAULT_INSTANCES 에 안 넣었나 --------------------------------
   *   12.7절(RSI)과 같은 이유입니다 - MACD 선도 #E7ECF5 실선이라 기본 줄의
   *   ma-25(#E7ECF5 실선)와 ★같은 색 같은 선모양★ 이 됩니다. 색을 바꾸면
   *   회원이 보던 MACD 선 색이 바뀝니다. 화면이 안 바뀌는 쪽을 골랐습니다.
   *   줄은 아래 moveLegacyMACD() 가 만들어 옛 자리에 끼웁니다.
   *
   * -- 되돌리기 ---------------------------------------------------------
   * 콘솔에서  App.ChartIndicatorKit.restoreLegacyMACD()  → 새로고침.
   * 옮기기 직전의 옛 켜짐/꺼짐(legacyMACD)이 그대로 돌아옵니다.
   * ===================================================================== */
  function movedMACD() {
    return !!(movedState && movedState.macd);
  }

  /** 옛 MACD 켜짐/꺼짐. 아직 못 읽는 상태면 null(그때는 안 옮깁니다). */
  function readLegacyMACD() {
    var OSC = legacyOSC();
    if (!OSC || !isFn(OSC.getState)) return null;
    var g;
    try {
      g = OSC.getState();
    } catch (e) {
      return null;
    }
    if (!g || typeof g !== "object") return null;
    if (!("macd" in g)) return null;
    return { macd: !!g.macd };
  }

  function moveLegacyMACD(quiet) {
    if (movedMACD()) return false;
    var old = readLegacyMACD();
    if (!old) return false;   /* 아직 못 읽음 - 다음 기회에 */

    if (insts[MOVED_MACD.id]) {
      insts[MOVED_MACD.id].on = !!old.macd;
    } else {
      addInstance("macd", {
        id: MOVED_MACD.id,
        params: { fast: MOVED_MACD.fast, slow: MOVED_MACD.slow, sig: MOVED_MACD.sig },
        colors: copy(MOVED_MACD.colors),
        style: "solid",
        width: DEFAULT_WIDTH,
        on: !!old.macd
      });
    }

    /* 옛 선 끄기 - ★우리 인스턴스를 만든 뒤에★ 합니다(안 끄면 두 벌) */
    var OSC = legacyOSC();
    if (OSC && isFn(OSC.setOn)) {
      try {
        OSC.setOn(MOVED_MACD.old, false);
      } catch (e) {
        /* 못 꺼도 화면은 돕니다 - 그 경우 선이 두 벌 보입니다 */
      }
    }

    movedState = movedState || {};
    movedState.macd = true;
    movedState.macdAt = Date.now();
    movedState.legacyMACD = { macd: !!old.macd };
    saveState();

    if (!quiet) {
      buildButtons();
      injectMenuRows();
      paintMenu();
    }
    return true;
  }

  /** 되돌리기 - 우리 MACD 줄을 지우고 옛 켜짐/꺼짐을 되살립니다. */
  function restoreLegacyMACD() {
    if (!movedMACD()) return false;
    var old = (movedState && movedState.legacyMACD) || { macd: false };
    if (insts[MOVED_MACD.id]) removeInstance(MOVED_MACD.id);
    var OSC = legacyOSC();
    if (OSC && isFn(OSC.setOn)) {
      try {
        OSC.setOn(MOVED_MACD.old, !!old.macd);
      } catch (e) {
        /* 무시 */
      }
    }
    movedState.macd = false;
    movedState.legacyMACD = null;
    if (!movedState.ma && !movedState.bb && !movedState.rsi) movedState = null;
    saveState();
    /* 옛 줄·옛 칩은 ★새로고침하면★ 그대로 돌아옵니다(옛 모듈이 다시 그립니다) */
    return true;
  }

  /** 지금 옮겨진 짝 목록 - [{ old, id, who }]. 아래 세 함수가 이것만 봅니다.
   *  (옮긴 것이 늘어도 여기 한 곳만 늘면 됩니다 - 같은 목록 두 벌 금지) */
  function movedPairs() {
    var out = [];
    if (movedMA()) {
      for (var i = 0; i < MOVED_MA.length; i++) {
        out.push({ old: MOVED_MA[i].old, id: MOVED_MA[i].id, who: "ind" });
      }
    }
    if (movedBB()) out.push({ old: MOVED_BB.old, id: MOVED_BB.id, who: "ind" });
    /* 12.7절 - 옛 RSI 는 오실레이터 모듈 것이라 칩 생김새가 다릅니다 */
    if (movedRSI()) out.push({ old: MOVED_RSI.old, id: MOVED_RSI.id, who: "osc" });
    /* 12.8절 - 옛 MACD 도 오실레이터 모듈 것입니다 */
    if (movedMACD()) out.push({ old: MOVED_MACD.old, id: MOVED_MACD.id, who: "osc" });
    return out;
  }

  /** 그 짝의 ★옛 칩★ 을 가리키는 선택자 - 여기 한 곳에만 적습니다(두 벌 금지).
   *  2단계 칩 .tl-ind-btn[data-ind] · 3단계 칩 .tl-osc-btn[data-osc] */
  function legacyChipSel(m) {
    return m.who === "osc"
      ? '.tl-osc-btn[data-osc="' + m.old + '"]'
      : '.tl-ind-btn[data-ind="' + m.old + '"]';
  }

  /** 그 짝의 ★옛 fx 목록 줄★ - 2단계도 3단계도 data-key 로 같습니다 */
  function legacyRowSel(m) {
    return '.tl-fx-row[data-key="' + m.old + '"]';
  }

  /** 옛 줄(fx 목록) 을 화면에서 뺍니다 - 옮긴 뒤에만 */
  function dropLegacyMenuRows() {
    var pairs = movedPairs();
    if (!pairs.length) return;
    var p = menuPanel();
    if (!p) return;
    pairs.forEach(function (m) {
      var r = p.querySelector(legacyRowSel(m));
      if (r && r.parentNode) r.parentNode.removeChild(r);
    });
  }

  /** 옛 칩(차트 왼쪽 위) 을 화면에서 뺍니다 - 옮긴 뒤에만 */
  function dropLegacyChips(bar) {
    if (!bar) return;
    movedPairs().forEach(function (m) {
      var b = bar.querySelector(legacyChipSel(m));
      if (b && b.parentNode) b.parentNode.removeChild(b);
    });
  }

  /** 우리 줄을 ★옛 줄이 있던 자리에★ 끼우려고 그 자리를 찾습니다.
   *  kind - "row"(fx 목록) 또는 "chip"(차트 왼쪽 위 칩 줄)
   *  ⚠️ 2026-09-03 (12.7절) 에 선택자를 짝이 들고 있게 바꿨습니다. 그전에는
   *     "row 가 아니면 data-ind" 였는데, 옛 RSI 칩은 data-osc 라 못 찾습니다
   *     (오류 0건 · 줄만 목록 맨 뒤로 밀리는 조용한 고장). */
  function legacyAnchor(root, id, kind) {
    if (!root) return null;
    var pairs = movedPairs();
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].id !== id) continue;
      return root.querySelector(kind === "row" ? legacyRowSel(pairs[i]) : legacyChipSel(pairs[i]));
    }
    return null;
  }

  /* =====================================================================
   * 12. 시작
   * ===================================================================== */
  function init() {
    loadState(DEFAULT_INSTANCES);
    /* 옛 MA 옮기기 - 옛 모듈이 이미 상태를 읽었으면 여기서 끝납니다.
       아직이면 아래 준비 타이머가 될 때까지 다시 시도합니다(12.5절). */
    moveLegacyAll(); /* 옛 MA(12.5절) · 볼린저(12.6절) · RSI(12.7절) · MACD(12.8절) */

    if (App.Bus && isFn(App.Bus.on)) {
      App.Bus.on("kline:update", onTick);
      App.Bus.on("symbol:change", scheduleResync);
      App.Bus.on("interval:change", scheduleResync);
      /* 13.3 표시 통화가 바뀌면 값이 ★가격★ 인 지표의 글자만 다시 씁니다 */
      App.Bus.on("currency:change", applyCurrency);
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
      moveLegacyAll(); /* 옛 모듈이 늦게 올라오는 경우 (12.5 ~ 12.8절) */
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
    /* 옛 MA 옮기기 (12.5절) */
    restoreLegacyMA: restoreLegacyMA,
    isMovedForTest: movedMA,
    moveLegacyMAForTest: moveLegacyMA,
    MOVED_MA: MOVED_MA,
    /* 옛 볼린저 옮기기 (12.6절) */
    restoreLegacyBB: restoreLegacyBB,
    isMovedBBForTest: movedBB,
    moveLegacyBBForTest: moveLegacyBB,
    MOVED_BB: MOVED_BB,
    /* 옛 RSI 옮기기 (12.7절) */
    restoreLegacyRSI: restoreLegacyRSI,
    isMovedRSIForTest: movedRSI,
    moveLegacyRSIForTest: moveLegacyRSI,
    MOVED_RSI: MOVED_RSI,
    /* 옛 MACD 옮기기 (12.8절) */
    restoreLegacyMACD: restoreLegacyMACD,
    isMovedMACDForTest: movedMACD,
    moveLegacyMACDForTest: moveLegacyMACD,
    MOVED_MACD: MOVED_MACD,
    /** 라인(종가선) 모드에서 점선으로 바꿀 MA(7) 선.
     *  js/chart-ma-line-mode.js 가 옛 MA7 선 대신 이것을 봅니다 -
     *  옮긴 뒤에는 옛 선이 아예 안 그려지므로, 안 넘겨주면 라인 모드에서
     *  시세선(금색 2px)과 MA(7)(금색 1px)이 다시 한 줄로 보입니다. */
    getMovedMa7Series: function () {
      if (!movedMA()) return null;
      var it = insts[MOVED_MA[0].id];
      if (!it || !it.live || !it.live.series) return null;
      return it.live.series.ma || null;
    },
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
    /** 지금 화면에 붙어 있는 구름 개수 - 껐을 때 0 인지 세는 용도.
     *  (끈 지표의 구름만 남는 조용한 고장을 눈이 아니라 숫자로 잡습니다) */
    getCloudCountForTest: function () {
      var n = 0;
      for (var i = 0; i < instOrder.length; i++) {
        var L = insts[instOrder[i]].live;
        if (L && L.clouds) n += L.clouds.length;
      }
      return n;
    },
    /** 구름을 한 번 칠하는 데 걸린 시간 - 화면이 다시 그려질 때마다 도는 곳이라
     *  숫자로 지켜봅니다. { draws, ms, maxMs } */
    getCloudStatForTest: function () {
      var acc = { draws: 0, ms: 0, maxMs: 0 };
      for (var i = 0; i < instOrder.length; i++) {
        var L = insts[instOrder[i]].live;
        if (!L || !L.clouds) continue;
        for (var j = 0; j < L.clouds.length; j++) {
          var st = L.clouds[j].prim.statForTest;
          acc.draws += st.draws;
          acc.ms += st.ms;
          if (st.maxMs > acc.maxMs) acc.maxMs = st.maxMs;
        }
      }
      return acc;
    },
    getGuideCountForTest: function () {
      var n = 0;
      for (var i = 0; i < instOrder.length; i++) {
        var L = insts[instOrder[i]].live;
        if (L && L.guides) n += L.guides.length;
      }
      return n;
    },
    onTickForTest: onTick,
    rebuildButtonsForTest: buildButtons,
    /* 13.2 칸 이름표 - 화면에 몇 개 붙어 있고 무슨 글자가 적혔는지.
       (끈 지표의 이름표만 남는 조용한 고장을 눈이 아니라 숫자로 잡습니다) */
    getPaneLabelsForTest: function () {
      var out = [];
      for (var i = 0; i < instOrder.length; i++) {
        var it = insts[instOrder[i]];
        if (!it || !it.live || !it.live.label) continue;
        var vals = {};
        for (var k in it.live.label.parts) vals[k] = it.live.label.parts[k].textContent;
        var nm = it.live.label.el.querySelector('.tl-kit-pname');
        out.push({
          id: it.id,
          name: nm ? nm.textContent : '',
          top: it.live.label.el.style.top,
          values: vals
        });
      }
      return out;
    },
    repositionPaneLabelsForTest: positionPaneLabels,
    paintPaneLabelsForTest: paintPaneLabels,
    /* 13.3 표시 통화가 바뀌었을 때 도는 곳 */
    applyCurrencyForTest: applyCurrency,
    priceUnitFormatForTest: priceUnitFormat
  };
})();
