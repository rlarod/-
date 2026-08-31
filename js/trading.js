/* =========================================================================
 * js/trading.js — App.Trading
 * =========================================================================
 * 모의주문 엔진입니다. 실제 Binance로는 어떤 주문도 보내지 않습니다.
 *
 * ── 통화 모델 (이번 단계에서 바뀐 핵심) ─────────────────────────────
 * 이 파일의 잔고/증거금/진입가/청산가/손익은 전부 USDT 단위입니다.
 * websocket.js가 이제 원화 환산 없이 USDT 그대로 'price:update'를
 * 내보내므로, 이 파일은 코드를 한 줄도 바꾸지 않고도(원래부터 통화에
 * 무관한 순수 계산이었음) 자동으로 USDT 기준 엔진이 되었습니다. 화면에
 * KRW로 보여주는 건 순전히 ui.js/chart.js가 App.Utils.formatCurrency로
 * "표시할 때만" 환산하는 것이고, 여기 저장되는 숫자는 항상 USDT입니다.
 *
 * 이번 단계 범위:
 *   - 총자산(USDT), 레버리지, 증거금, 롱/숏 진입(시장가/지정가), 포지션 수량 계산
 *   - 한 번에 하나의 포지션 또는 하나의 미체결 지정가 주문만 허용
 *   - 실시간 손익(PnL) / ROE(=손익률) / 총자산(Equity) 계산
 *   - 포지션 종료(수동청산·자유 비율 부분청산), 청산가 도달 시 자동 강제청산, 거래내역
 *   - TP(익절)/SL(손절) 도달 시 자동 종료
 *   - 거래 수수료 — 시장가는 테이커, 지정가(미체결 대기)는 메이커 수수료로 예약(0.02%/0.05%)
 *   - 실제 Binance 펀딩비 정산 (markPrice 스트림 기반, 중복 정산 방지, 재접속 시 놓친
 *     정산 REST로 1회 확인)
 *   - 브라우저 영구 저장 (js/storage.js에 완전히 위임, 'trading' 키 사용)
 *
 * ── 지정가 주문 동작 방식 ─────────────────────────────────────────
 * placeLimitOrder()로 주문을 넣으면 즉시 체결되지 않고 state.pendingOrder에
 * "미체결" 상태로 대기합니다(증거금+메이커 수수료는 이 시점에 이미 예약/차감).
 * 매 가격 틱마다 checkPendingOrder()가 체결 조건(롱은 현재가 ≤ 지정가,
 * 숏은 현재가 ≥ 지정가)을 검사해서, 조건이 맞으면 "지정가 그대로" 포지션을
 * 생성합니다(시장가처럼 현재가로 체결되지 않음). cancelPendingOrder()로
 * 언제든 취소하면 예약했던 증거금+수수료가 그대로 환불됩니다.
 *
 * TODO(다음 단계): 평균 진입가/추가 진입(포지션이 있을 때 같은 방향으로 더
 * 진입해서 평균단가를 재계산하는 기능)은 이번 스펙에 포함되지 않아 아직 없음
 * — 지금은 이미 포지션이 있으면 신규 진입 자체가 막혀 있습니다.
 * ========================================================================= */

App.Trading = (function () {
  "use strict";

  const INITIAL_BALANCE = 100000; // 총자산 초기값: 100,000 USDT
  // 유지증거금률 — 2026-08-31 대표 결재로 바이낸스 구간표(js/risk-brackets.js)를 따릅니다.
  // 명목 구간마다 유지증거금률과 공제액이 달라, 더 이상 고정값 하나가 아닙니다.
  // 아래 값은 그 표를 못 읽었을 때만 쓰는 예전 고정값입니다(그 경우 동작이 예전 그대로).
  const MMR_FALLBACK = 0.005;
  const MIN_QTY = 0.0001; // 최소 주문 수량(BTC) — 이 밑으로 남으면 의미가 없어 전체청산으로 처리
  // Binance Futures(USDⓈ-M) 일반 사용자 기준 수수료: 메이커 0.02% / 테이커 0.05%.
  // 하나의 설정값으로만 관리합니다 — 다른 곳에 하드코딩하지 않습니다.
  const FEE_RATE = {
    taker: 0.0005,
    maker: 0.0002,
  };
  const STORAGE_KEY = "trading";

  const state = {
    balance: INITIAL_BALANCE, // 가용 자산(USDT)
    leverage: 10,
    position: null, // 한 번에 하나만 보유
    pendingOrder: null, // 한 번에 하나만 대기 가능한 미체결 지정가 주문
    orderHistory: [], // 주문 생성/체결/취소 로그 (OPEN → FILLED | CANCELLED), 최근 순
    closedTrades: [], // 종료된 거래 내역 (최근 순)
    fundingHistory: [], // 펀딩비 정산 로그 (최근 순)
    lastSettledFundingTime: null, // 마지막으로 정산 완료한 fundingTime — 중복 정산 방지
    currentPrice: null, // 활성 심볼의 실시간 현재가(USDT)
  };
  const MAX_ORDER_HISTORY = 100; // 메모리 누수 방지 상한
  const MAX_FUNDING_HISTORY = 100;
  // 버그 수정: closedTrades(거래내역)만 상한이 없어서 아주 오래 쓰면 무한정
  // 쌓이는 걸 UI 정리하다가 발견했습니다. orderHistory/fundingHistory와
  // 동일한 방식으로 상한을 둡니다.
  const MAX_CLOSED_TRADES = 200;
  // orderHistory는 closedTrades와 달리 "제자리에서 상태만 바뀌는"(OPEN→FILLED/CANCELLED)
  // 경우가 있어서, 배열 길이만 비교하는 dirty-check로는 변경을 놓칩니다. 그래서 push든
  // 상태 변경이든 이 값을 항상 올려서, ui.js가 "버전이 바뀌었을 때만" 다시 그리게 합니다.
  let orderHistoryVersion = 0;

  function logOrder(entry) {
    state.orderHistory.unshift(entry);
    if (state.orderHistory.length > MAX_ORDER_HISTORY) state.orderHistory.length = MAX_ORDER_HISTORY;
    orderHistoryVersion++;
  }
  function findOrderLog(id) {
    return state.orderHistory.find((o) => o.id === id) || null;
  }

  function cfg() {
    return App.Config;
  }

  /* ---------------- 실시간 가격 수신 (단일 소스, USDT) ---------------- */
  function onPriceUpdate(payload) {
    if (payload.symbol !== cfg().getActiveSymbol()) return;
    state.currentPrice = payload.price;
    checkPendingOrder();
    checkTriggers();
    App.Bus.emit("trading:update", getSnapshot());
  }

  const MAX_LEVERAGE = 125; // Binance Futures 실제 상한과 동일하게 맞춤
  function setLeverage(lev) {
    // 버그 수정: 검증 없이 그대로 저장했었음 — UI 슬라이더가 1~100으로 막아주고
    // 있긴 하지만, 엔진 자체가 잘못된 값을 걸러내지 못하면 나중에 다른 호출
    // 경로가 생겼을 때 그대로 뚫립니다. 실제로 leverage=0을 넣어보니 청산가가
    // -Infinity, 수량이 0이 되는 걸 테스트로 확인해서 여기서 직접 막습니다.
    if (typeof lev !== "number" || !isFinite(lev) || lev < 1) return;
    state.leverage = Math.min(MAX_LEVERAGE, Math.floor(lev));
  }

  function getMaxAffordableMargin() {
    const leverage = state.leverage || 1;
    return state.balance / (1 + leverage * FEE_RATE.taker);
  }

  /* ---------------- 진입 (시장가) ----------------
   * side: 'long' | 'short', margin: 증거금(USDT)
   * tp/sl: 선택 사항(USDT 가격) — 도달 시 자동 종료
   * ------------------------------------------------ */
  function openPosition(side, margin, tp, sl) {
    if (state.position) {
      return { ok: false, error: "이미 보유 중인 포지션이 있습니다. 한 번에 하나의 포지션만 가능합니다." };
    }
    if (state.pendingOrder) {
      return { ok: false, error: "대기 중인 지정가 주문이 있습니다. 먼저 취소해주세요." };
    }
    if (state.currentPrice === null) {
      return { ok: false, error: "아직 실시간 시세를 받지 못했습니다." };
    }
    if (!margin || margin <= 0) {
      return { ok: false, error: "증거금을 입력해주세요." };
    }
    const notional = margin * state.leverage;
    const entryFee = notional * FEE_RATE.taker;
    if (margin + entryFee > state.balance) {
      return { ok: false, error: "증거금과 수수료를 합친 금액이 가용 자산보다 큽니다." };
    }
    // 구간별 유지증거금이 증거금 이상이면 진입하는 순간 이미 청산 조건입니다.
    // 그대로 열면 회원 증거금이 즉시 사라지므로 여기서 막습니다.
    const maintAtOpen = maintenanceMargin(notional);
    if (maintAtOpen >= margin) {
      return {
        ok: false,
        error:
          "이 금액 구간에서는 배율이 너무 높습니다 — 유지증거금(" +
          maintAtOpen.toFixed(2) +
          " USDT)이 증거금보다 커서 진입 즉시 청산됩니다. 배율이나 증거금을 낮춰주세요.",
      };
    }

    const entry = state.currentPrice; // 사용자가 가격을 입력하지 않고 현재 실시간 가격으로 자동 진입
    const leverage = state.leverage;
    const qty = notional / entry;
    const liq = calcLiquidationPrice(side, entry, leverage, notional);

    let validTp = tp || null;
    let validSl = sl || null;
    if (validTp && side === "long" && validTp <= entry) validTp = null;
    if (validTp && side === "short" && validTp >= entry) validTp = null;
    if (validSl && side === "long" && validSl >= entry) validSl = null;
    if (validSl && side === "short" && validSl <= entry) validSl = null;
    // 버그 수정: SL이 청산가보다 더 불리한 값이면(LONG인데 SL이 liq보다 낮음 등)
    // 실제로는 청산이 먼저 발동해서 SL이 영원히 발동 안 되는 "죽은 SL"이 됩니다.
    // 테스트로 실제 재현해서 확인했습니다. 청산가 바로 위/아래로 당겨줍니다.
    if (validSl && side === "long" && validSl <= liq) validSl = liq * 1.0001;
    if (validSl && side === "short" && validSl >= liq) validSl = liq * 0.9999;

    state.balance -= margin + entryFee;
    const orderId = "o" + Date.now();
    state.position = {
      side,
      entry,
      leverage,
      margin,
      qty,
      liq,
      tp: validTp,
      sl: validSl,
      entryFee,
      openTime: Date.now(),
      orderId,
    };
    logOrder({
      id: orderId,
      side,
      type: "market",
      price: entry,
      margin,
      leverage,
      status: "FILLED",
      createdTime: Date.now(),
      filledTime: Date.now(),
    });

    App.Bus.emit("trading:update", getSnapshot());
    persist();
    return { ok: true, position: state.position };
  }

  /* ---------------- 진입 (지정가) ----------------
   * side: 'long' | 'short', price: 지정가(USDT), margin: 증거금(USDT)
   * 즉시 체결되지 않고 미체결 상태로 대기하다가, 가격이 지정가에
   * 도달하면 checkPendingOrder()가 그 가격 그대로 포지션을 만듭니다.
   * 대기하는 동안 증거금+수수료(메이커 요율)를 미리 예약(차감)해둡니다.
   * ------------------------------------------------------------------ */
  function placeLimitOrder(side, price, margin, tp, sl) {
    if (state.position) {
      return { ok: false, error: "이미 보유 중인 포지션이 있습니다. 한 번에 하나만 가능합니다." };
    }
    if (state.pendingOrder) {
      return { ok: false, error: "이미 대기 중인 지정가 주문이 있습니다. 먼저 취소해주세요." };
    }
    if (!price || price <= 0) {
      return { ok: false, error: "지정가를 입력해주세요." };
    }
    if (!margin || margin <= 0) {
      return { ok: false, error: "증거금을 입력해주세요." };
    }
    const leverage = state.leverage;
    const notional = margin * leverage;
    const entryFee = notional * FEE_RATE.maker; // 지정가(미체결 대기)는 메이커로 간주
    if (margin + entryFee > state.balance) {
      return { ok: false, error: "증거금과 수수료를 합친 금액이 가용 자산보다 큽니다." };
    }
    // 시장가와 같은 이유 — 유지증거금이 증거금 이상이면 체결되는 순간 청산됩니다.
    const maintAtOrder = maintenanceMargin(notional);
    if (maintAtOrder >= margin) {
      return {
        ok: false,
        error:
          "이 금액 구간에서는 배율이 너무 높습니다 — 유지증거금(" +
          maintAtOrder.toFixed(2) +
          " USDT)이 증거금보다 커서 체결 즉시 청산됩니다. 배율이나 증거금을 낮춰주세요.",
      };
    }

    let validTp = tp || null;
    let validSl = sl || null;
    if (validTp && side === "long" && validTp <= price) validTp = null;
    if (validTp && side === "short" && validTp >= price) validTp = null;
    if (validSl && side === "long" && validSl >= price) validSl = null;
    if (validSl && side === "short" && validSl <= price) validSl = null;
    // 시장가 진입과 동일한 버그 수정 — 지정가 체결가(price) 기준으로 청산가를
    // 미리 계산해서, SL이 청산가보다 불리하면 발동 불가능한 "죽은 SL"이 되므로
    // 청산가 바로 위/아래로 당겨줍니다.
    const limitLiq = calcLiquidationPrice(side, price, leverage, notional);
    if (validSl && side === "long" && validSl <= limitLiq) validSl = limitLiq * 1.0001;
    if (validSl && side === "short" && validSl >= limitLiq) validSl = limitLiq * 0.9999;

    state.balance -= margin + entryFee;
    state.pendingOrder = {
      id: "o" + Date.now(),
      side,
      price,
      margin,
      leverage,
      notional,
      entryFee,
      tp: validTp,
      sl: validSl,
      status: "OPEN",
      createdTime: Date.now(),
    };
    logOrder({
      id: state.pendingOrder.id,
      side,
      type: "limit",
      price,
      margin,
      leverage,
      status: "OPEN",
      createdTime: Date.now(),
      filledTime: null,
      cancelledTime: null,
    });

    App.Bus.emit("trading:update", getSnapshot());
    persist();
    return { ok: true, order: state.pendingOrder };
  }

  function cancelPendingOrder() {
    const order = state.pendingOrder;
    if (!order) return { ok: false, error: "취소할 미체결 주문이 없습니다." };
    // 예약해뒀던 증거금+수수료를 그대로 환불
    state.balance += order.margin + order.entryFee;
    const log = findOrderLog(order.id);
    if (log) {
      log.status = "CANCELLED";
      log.cancelledTime = Date.now();
      orderHistoryVersion++;
    }
    state.pendingOrder = null;
    App.Bus.emit("trading:update", getSnapshot());
    persist();
    return { ok: true };
  }

  // 매 가격 틱마다 호출 — 지정가 체결 조건을 검사해서 맞으면 "지정가 그대로" 포지션을 만듭니다.
  function checkPendingOrder() {
    const order = state.pendingOrder;
    if (!order || state.currentPrice === null || state.position) return;
    const price = state.currentPrice;

    const filled = order.side === "long" ? price <= order.price : price >= order.price;
    if (!filled) return;

    const fillPrice = order.price; // 지정가 주문은 지정한 가격 그대로 체결됩니다(현재가가 아님)
    const qty = order.notional / fillPrice;
    const liq = calcLiquidationPrice(order.side, fillPrice, order.leverage, order.notional);

    state.position = {
      side: order.side,
      entry: fillPrice,
      leverage: order.leverage,
      margin: order.margin,
      qty,
      liq,
      tp: order.tp,
      sl: order.sl,
      entryFee: order.entryFee,
      openTime: Date.now(),
      filledFromLimit: true,
      orderId: order.id,
    };
    const log = findOrderLog(order.id);
    if (log) {
      log.status = "FILLED";
      log.filledTime = Date.now();
      orderHistoryVersion++;
    }
    state.pendingOrder = null;
    persist();
  }

  /* =========================================================================
   * 펀딩비 정산 — 요구사항에 따라 별도 함수로 분리했습니다(trading.js 여기저기에
   * 흩어놓지 않음). 실제 Binance 데이터만 사용하고, 가짜 값은 절대 만들지 않습니다.
   *
   * ── 정산 시점을 알아내는 방법 ─────────────────────────────────────
   * markPrice 스트림(js/websocket.js가 'funding:update'로 중계)은 초당 한 번씩
   * "다음 정산 시각(nextFundingTime)"과 "그 시점에 적용될 예상 펀딩비율"을 계속
   * 보내줍니다. nextFundingTime이 이전에 받았던 값보다 커지는 순간 = 방금 그
   * 이전 시각에 실제로 정산이 일어났다는 뜻입니다. 그래서 "직전까지 받았던
   * fundingRate/markPrice"를 그 정산에 적용합니다 — 임의로 만든 값이 아니라
   * Binance가 실제로 방송했던 값입니다.
   *
   * ── 방향 ─────────────────────────────────────────────────────────
   * fundingRate > 0 이면 롱이 숏에게 지급(롱 잔고 감소), 숏이 수령(숏 잔고 증가).
   * fundingRate < 0 이면 반대입니다. 공식: fundingFee = ∓qty × markPrice × fundingRate
   * (롱은 부호 −, 숏은 부호 +)
   * ========================================================================= */
  let lastKnownFundingTime = null;
  let lastKnownFundingRate = null;
  let lastKnownMarkPrice = null;

  function calcFundingFee(pos, markPrice, fundingRate) {
    const sign = pos.side === "long" ? -1 : 1;
    return sign * pos.qty * markPrice * fundingRate;
  }

  function settleFunding(fundingTime, fundingRate, markPrice) {
    if (!state.position) return; // 요구사항: 포지션이 없으면 정산하지 않음
    if (fundingRate === null || fundingRate === undefined || markPrice === null || markPrice === undefined) return;
    // 요구사항: 동일한 펀딩 이벤트를 두 번 정산하지 않음 (새로고침/재접속 후에도)
    if (state.lastSettledFundingTime !== null && fundingTime <= state.lastSettledFundingTime) return;

    const pos = state.position;
    const fundingFee = calcFundingFee(pos, markPrice, fundingRate);
    // 잔고는 "내가 들고 있는 돈"이라 음수가 될 수 없습니다.
    // 100%로 진입해 잔고가 0에 가까울 때 펀딩비를 그대로 빼면 마이너스가
    // 됐습니다(실측: -526 USDT). 0에서 멈춥니다.
    // 실제 거래소는 부족분을 증거금에서 차감하지만, 그건 청산 로직과 얽혀
    // 있어 여기서는 건드리지 않습니다.
    state.balance = Math.max(0, state.balance + fundingFee);
    state.lastSettledFundingTime = fundingTime;

    state.fundingHistory.unshift({
      fundingTime,
      fundingRate,
      positionSide: pos.side,
      positionSize: pos.qty,
      markPrice,
      fundingFee,
      timestamp: Date.now(),
    });
    if (state.fundingHistory.length > MAX_FUNDING_HISTORY) state.fundingHistory.length = MAX_FUNDING_HISTORY;

    App.Bus.emit("trading:update", getSnapshot());
    persist();
  }

  // websocket.js의 markPrice 스트림을 그대로 받아서, "다음 정산 시각이 앞으로
  // 넘어갔는지"만 감지합니다 — 넘어갔다면 그 직전 값으로 실제 정산을 수행합니다.
  function onFundingUpdate(payload) {
    if (payload.symbol !== cfg().getActiveSymbol()) return;
    if (lastKnownFundingTime !== null && payload.nextFundingTime > lastKnownFundingTime) {
      settleFunding(lastKnownFundingTime, lastKnownFundingRate, lastKnownMarkPrice);
    }
    lastKnownFundingTime = payload.nextFundingTime;
    lastKnownFundingRate = payload.fundingRate;
    lastKnownMarkPrice = payload.markPrice;
  }

  // 새로고침/재접속 사이(브라우저를 닫고 있던 동안)에 실제로 정산됐어야 할
  // 펀딩을 놓쳤는지, 시작할 때 딱 한 번 REST로 확인합니다(폴링 아님).
  function checkMissedFunding() {
    if (!App.Api || !App.Api.fetchLatestFundingRate) return;
    App.Api.fetchLatestFundingRate(cfg().getActiveSymbol())
      .then((rows) => {
        if (!rows || rows.length === 0) return;
        const latest = rows[rows.length - 1];
        if (latest.fundingTime > Date.now()) return; // 아직 발생하지 않은 미래 시각이면 무시
        settleFunding(latest.fundingTime, latest.fundingRate, latest.markPrice);
      })
      .catch((err) => {
        console.warn("[trading.js] 놓친 펀딩 확인 실패(무시하고 계속 진행):", err);
      });
  }

  /* ---------------- 유지증거금 (바이낸스 구간별) ----------------
   * 유지증거금 = 명목 × 구간 유지증거금률 − 구간 공제액   (js/risk-brackets.js)
   * 표를 못 읽으면 예전 고정값(MMR_FALLBACK)으로 되돌아갑니다.
   * ------------------------------------------------ */
  function maintenanceMargin(notional) {
    if (typeof notional !== "number" || !isFinite(notional) || notional <= 0) return 0;
    const RB = App.RiskBrackets;
    if (RB && typeof RB.maintenanceMargin === "function") {
      const mm = RB.maintenanceMargin(notional);
      if (typeof mm === "number" && isFinite(mm) && mm >= 0) return mm;
    }
    return notional * MMR_FALLBACK;
  }
  // 유지증거금 ÷ 명목 — 청산가 식에 넣는 실효 유지증거금률(공제액이 이미 반영됨)
  function maintenanceMarginRate(notional) {
    if (typeof notional !== "number" || !isFinite(notional) || notional <= 0) return MMR_FALLBACK;
    return maintenanceMargin(notional) / notional;
  }

  /* ---------------- 청산가 계산 (별도 함수로 분리) ----------------
   * LONG  : entry × (1 − 1/leverage + 실효 유지증거금률)
   * SHORT : entry × (1 + 1/leverage − 실효 유지증거금률)
   * notional(명목)을 넘기면 그 구간의 유지증거금률·공제액이 반영됩니다.
   * 안 넘기면 구간을 고를 수 없어 예전 고정값으로 계산합니다.
   * ------------------------------------------------ */
  function calcLiquidationPrice(side, entry, leverage, notional) {
    const mmr = maintenanceMarginRate(notional);
    if (side === "long") return entry * (1 - 1 / leverage + mmr);
    return entry * (1 + 1 / leverage - mmr);
  }

  /* ---------------- 전체 종료 ----------------
   * reason: '수동청산'(기본) | '강제청산' | '익절(TP)' | '손절(SL)' | '부분청산'
   * ------------------------------------------------ */
  function closePosition(reason) {
    return closePartial(1, reason); // 비율 1(100%) = 전체청산
  }

  /* ---------------- 부분/전체 청산 (통합 구현) ----------------
   * ratio: 0~1 사이의 청산 비율. 1이면 포지션이 완전히 사라지고(state.position=null),
   * 1 미만이면 남은 수량으로 포지션이 계속 유지되며 진입가/레버리지/청산가는
   * 그대로 두고 margin/qty만 비율만큼 줄입니다(나머지 포지션 조건 유지).
   * ------------------------------------------------------------------- */
  function closePartial(ratio, reason) {
    const pos = state.position;
    if (!pos) {
      return { ok: false, error: "보유 중인 포지션이 없습니다." };
    }
    // 요구사항 2 검증: 0% 이하 금지, 100% 초과 금지
    if (typeof ratio !== "number" || isNaN(ratio) || ratio <= 0) {
      return { ok: false, error: "청산 비율은 0%보다 커야 합니다." };
    }
    if (ratio > 1) {
      return { ok: false, error: "청산 비율은 100%를 초과할 수 없습니다." };
    }
    // 남는 수량이 최소 주문 수량 미만이면 의미가 없으므로 전체청산으로 처리
    const remainingQty = pos.qty * (1 - ratio);
    if (ratio < 1 && remainingQty < MIN_QTY) {
      ratio = 1;
    }

    const isForced = reason === "강제청산";
    const exitPrice = isForced ? pos.liq : state.currentPrice !== null ? state.currentPrice : pos.entry;

    const closingQty = pos.qty * ratio;
    const closingMargin = pos.margin * ratio;
    const closingEntryFee = pos.entryFee * ratio;

    // 청산되는 부분에 대한 손익만 계산 (전체 포지션이 아니라 이번에 닫는 수량 기준)
    const grossPnl = isForced
      ? -closingMargin
      : (pos.side === "long" ? exitPrice - pos.entry : pos.entry - exitPrice) * closingQty;

    let exitFee = 0;
    let netPnl = grossPnl;
    if (!isForced) {
      exitFee = closingQty * exitPrice * FEE_RATE.taker;
      netPnl = grossPnl - exitFee;
      state.balance += closingMargin + netPnl;
    }
    // 강제청산은 청산되는 증거금 전액 손실 처리 — 돌려주지 않음

    const pnlPercent = closingMargin > 0 ? (netPnl / closingMargin) * 100 : 0; // ROE
    const returnRate = pos.entry > 0 ? ((pos.side === "long" ? exitPrice - pos.entry : pos.entry - exitPrice) / pos.entry) * 100 : 0; // 레버리지 미포함 일반 수익률(신규)
    const totalFee = isForced ? closingEntryFee : closingEntryFee + exitFee;

    state.closedTrades.unshift({
      side: pos.side,
      leverage: pos.leverage,
      entry: pos.entry,
      exit: exitPrice,
      qty: closingQty,
      margin: closingMargin,
      pnl: netPnl,
      pnlPercent, // ROE(%) = 실현손익 / 청산된 증거금 × 100 — 기존 이름/의미 유지
      returnRate, // 레버리지 미포함 일반 수익률(%) — 신규 필드
      fee: totalFee,
      reason: reason || (ratio < 1 ? "부분청산" : "수동청산"),
      closeTime: Date.now(),
    });
    if (state.closedTrades.length > MAX_CLOSED_TRADES) state.closedTrades.length = MAX_CLOSED_TRADES;

    if (ratio >= 1) {
      state.position = null;
    } else {
      // 남은 포지션: 진입가/레버리지/청산가/TP/SL은 그대로 유지, 수량/증거금/수수료만 축소
      pos.qty -= closingQty;
      pos.margin -= closingMargin;
      pos.entryFee -= closingEntryFee;
    }

    App.Bus.emit("trading:update", getSnapshot());
    persist();
    return { ok: true };
  }

  /* ---------------- 트리거 체크 (청산가 → TP → SL 순으로 우선순위) ---------------- */
  function checkTriggers() {
    const pos = state.position;
    if (!pos || state.currentPrice === null) return;
    const price = state.currentPrice;

    const liqHit = pos.side === "long" ? price <= pos.liq : price >= pos.liq;
    if (liqHit) return closePosition("강제청산");

    if (pos.tp) {
      const tpHit = pos.side === "long" ? price >= pos.tp : price <= pos.tp;
      if (tpHit) return closePosition("익절(TP)");
    }
    if (pos.sl) {
      const slHit = pos.side === "long" ? price <= pos.sl : price >= pos.sl;
      if (slHit) return closePosition("손절(SL)");
    }
  }

  /* ---------------- 손익(PnL) 계산 ----------------
   * LONG  : (현재가격 - 진입가격) × 수량
   * SHORT : (진입가격 - 현재가격) × 수량
   * 레버리지는 별도로 곱하지 않습니다 — qty가 이미 margin×leverage/entry로
   * 계산되어 있으므로 qty를 그대로 곱하는 것만으로 레버리지가 반영됩니다.
   * ------------------------------------------------ */
  function calcPnl(pos, currentPrice) {
    if (!pos || currentPrice === null) return 0;
    const diff = pos.side === "long" ? currentPrice - pos.entry : pos.entry - currentPrice;
    return diff * pos.qty;
  }

  // ROE(자기자본이익률) = 미실현손익 / 증거금 × 100
  function calcRoe(pos, pnl) {
    if (!pos || pos.margin <= 0) return 0;
    return (pnl / pos.margin) * 100;
  }

  /* ---------------- 일반 수익률(레버리지 미포함, 기초자산 가격변동률) ----------------
   * 버그 수정: 지금까지 화면에 "손익률"이라는 이름으로 실제로는 ROE(증거금
   * 대비, 레버리지 반영)를 보여주고 있었습니다. 그래서 100배 레버리지로
   * 진입 직후 가격이 거의 안 움직여도 화면엔 "손익률 +80%" 같은 숫자가
   * 떴습니다 — 계산 자체(calcRoe)는 ROE로서는 맞는 값이라 안 건드리고,
   * 레버리지를 아예 곱하지 않는 완전히 별개의 값을 새로 추가합니다.
   *
   * LONG  : (현재가 - 진입가) / 진입가 × 100
   * SHORT : (진입가 - 현재가) / 진입가 × 100
   * ------------------------------------------------------------------- */
  function calcReturnRate(pos, currentPrice) {
    if (!pos || pos.entry <= 0 || currentPrice === null) return 0;
    const diff = pos.side === "long" ? currentPrice - pos.entry : pos.entry - currentPrice;
    return (diff / pos.entry) * 100;
  }

  /* ---------------- 브라우저 영구 저장 ---------------- */
  function persist() {
    if (!App.Storage) return;
    App.Storage.save(STORAGE_KEY, {
      balance: state.balance,
      leverage: state.leverage,
      position: state.position,
      pendingOrder: state.pendingOrder,
      orderHistory: state.orderHistory,
      closedTrades: state.closedTrades,
      fundingHistory: state.fundingHistory,
      lastSettledFundingTime: state.lastSettledFundingTime,
    });
    // persist()는 실제 거래 이벤트(진입/체결/청산/취소/펀딩정산)에서만 호출되고
    // 매 가격 틱마다는 절대 호출되지 않습니다 — 그래서 이 지점이 정확히
    // "DB에 써야 할 순간"입니다. 계산은 전혀 안 하고 그냥 이미 계산된
    // 스냅샷을 방송만 합니다(js/supabase-sync.js가 구독).
    App.Bus.emit("trading:persisted", getSnapshot());
  }

  function restoreFromStorage() {
    if (!App.Storage) return;
    let saved;
    try {
      saved = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      console.warn("[trading.js] 저장된 데이터를 불러오지 못했습니다 — 초기값으로 시작합니다:", e);
      return;
    }
    if (!saved || typeof saved !== "object") return;

    if (typeof saved.balance === "number" && isFinite(saved.balance)) {
      state.balance = saved.balance;
    }
    if (typeof saved.leverage === "number" && isFinite(saved.leverage) && saved.leverage >= 1) {
      state.leverage = Math.min(MAX_LEVERAGE, saved.leverage);
    }
    if (saved.position && typeof saved.position === "object") {
      const p = saved.position;
      const isValidPosition =
        (p.side === "long" || p.side === "short") &&
        typeof p.entry === "number" && isFinite(p.entry) &&
        typeof p.qty === "number" && isFinite(p.qty) &&
        typeof p.margin === "number" && isFinite(p.margin) &&
        typeof p.leverage === "number" && isFinite(p.leverage) &&
        typeof p.liq === "number" && isFinite(p.liq);
      if (isValidPosition) {
        // 버그 수정: entryFee가 없거나 손상됐으면 0으로 안전하게 대체합니다.
        // (예전엔 검증 없이 그대로 썼는데, undefined일 경우 closePartial()에서
        // closingEntryFee = pos.entryFee * ratio 가 NaN이 되어 거래내역의
        // "수수료" 열이 NaN으로 표시되는 버그가 있었습니다.)
        if (typeof p.entryFee !== "number" || !isFinite(p.entryFee)) p.entryFee = 0;
        state.position = p;
      }
    }
    if (saved.pendingOrder && typeof saved.pendingOrder === "object") {
      const o = saved.pendingOrder;
      const isValidOrder =
        (o.side === "long" || o.side === "short") &&
        typeof o.price === "number" && isFinite(o.price) &&
        typeof o.margin === "number" && isFinite(o.margin) &&
        typeof o.leverage === "number" && isFinite(o.leverage) &&
        typeof o.notional === "number" && isFinite(o.notional);
      if (isValidOrder) {
        if (typeof o.entryFee !== "number" || !isFinite(o.entryFee)) o.entryFee = 0; // 버그 수정: 위와 동일한 이유
        state.pendingOrder = o;
      }
    }
    if (Array.isArray(saved.orderHistory)) {
      state.orderHistory = saved.orderHistory.filter((o) => o && typeof o === "object").slice(0, MAX_ORDER_HISTORY);
    }
    if (Array.isArray(saved.closedTrades)) {
      state.closedTrades = saved.closedTrades.filter((t) => t && typeof t === "object").slice(0, MAX_CLOSED_TRADES);
    }
    if (Array.isArray(saved.fundingHistory)) {
      state.fundingHistory = saved.fundingHistory.filter((f) => f && typeof f === "object").slice(0, MAX_FUNDING_HISTORY);
    }
    // 중복 정산 방지의 핵심 — 이 값을 복구하지 못하면 새로고침할 때마다 같은
    // 펀딩 이벤트를 또 정산해버릴 수 있습니다.
    if (typeof saved.lastSettledFundingTime === "number" && isFinite(saved.lastSettledFundingTime)) {
      state.lastSettledFundingTime = saved.lastSettledFundingTime;
    }
  }

  /* ---------------- 조회 ---------------- */
  function getSnapshot() {
    const pos = state.position;
    const unrealizedPnl = pos ? calcPnl(pos, state.currentPrice) : 0;
    const roe = pos ? calcRoe(pos, unrealizedPnl) : 0;
    const returnRate = pos ? calcReturnRate(pos, state.currentPrice) : 0; // 레버리지 미포함 일반 수익률(버그 수정으로 신규 추가)
    const usedMargin = (pos ? pos.margin : 0) + (state.pendingOrder ? state.pendingOrder.margin : 0);
    // 총자산(Equity) = 가용 잔고 + 사용 중 증거금(포지션+미체결) + 미실현 손익 (전부 USDT)
    const equity = state.balance + usedMargin + unrealizedPnl;
    // 자산 탭용 누적 지표 — 거래내역(closedTrades)에서 실현손익/누적수수료를 합산
    let realizedPnl = 0;
    let totalFeesPaid = 0;
    state.closedTrades.forEach((t) => {
      realizedPnl += t.pnl;
      totalFeesPaid += t.fee;
    });
    let totalFundingPaid = 0; // 음수면 순지급, 양수면 순수령
    state.fundingHistory.forEach((f) => {
      totalFundingPaid += f.fundingFee;
    });

    return {
      balance: state.balance,
      equity,
      usedMargin,
      leverage: state.leverage,
      position: state.position,
      pendingOrder: state.pendingOrder,
      orderHistory: state.orderHistory,
      orderHistoryVersion,
      closedTrades: state.closedTrades,
      fundingHistory: state.fundingHistory,
      totalFundingPaid,
      currentPrice: state.currentPrice,
      unrealizedPnl,
      pnlPercent: roe, // ROE(%) — 기존 이름/의미 그대로 유지(다른 모듈이 참조 중이라 안 바꿈)
      roe,
      returnRate, // 레버리지 미포함 일반 수익률(%) — 신규 필드
      realizedPnl,
      totalFeesPaid,
      feeRate: FEE_RATE,
    };
  }

  function init() {
    restoreFromStorage();
    checkMissedFunding(); // 오프라인 동안 놓친 펀딩 정산이 있는지 시작할 때 한 번 확인
    App.Bus.on("price:update", onPriceUpdate);
    App.Bus.on("funding:update", onFundingUpdate);
    App.Bus.emit("trading:update", getSnapshot());
  }

  return {
    init,
    setLeverage,
    getMaxAffordableMargin,
    openPosition,
    placeLimitOrder,
    cancelPendingOrder,
    closePosition,
    closePartial,
    calcLiquidationPrice,
    maintenanceMargin,
    getSnapshot,
  };
})();
