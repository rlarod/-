/* =========================================================================
 * js/chart.js — App.Chart
 * =========================================================================
 * Lightweight Charts로 캔들을 직접 그립니다(TradingView Embed 사용 안 함).
 * 과거 500개 1분봉은 REST로 먼저 채우고, 그 이후는 websocket.js가 내보내는
 * 'kline:update' 이벤트로만 실시간 갱신합니다 — 즉 차트가 쓰는 가격과
 * (나중에 추가될) 거래 계산이 쓰는 가격은 항상 같은 'price:update' 이벤트에서
 * 나온 동일한 숫자입니다.
 *
 * 이번 단계에는 별도 ui.js가 없으므로, 화면 상단 통계 바(현재가/변동률/
 * 고가/저가/거래량)와 연결 상태 표시도 이 파일이 함께 담당합니다.
 * 다음 단계에서 롱/숏 UI가 추가되면 이 렌더링 부분은 js/ui.js로 분리할
 * 예정이며, 계산 로직(chart.js가 하는 캔들 렌더링)과는 애초에 분리되어
 * 있으므로 그때도 이 파일의 차트 관련 코드는 그대로 남습니다.
 * ========================================================================= */

App.Chart = (function () {
  "use strict";

  let chart = null;
  let candleSeries = null;
  let volumeSeries = null;
  let currentPriceLine = null;
  let lastPricePayload = null; // 통화 전환 시 재표시를 위한 캐시
  let lastTickerPayload = null;

  // 진입가/TP/SL 라인 — 포지션이 열리면 그려지고 닫히면 자동으로 제거됩니다.
  const positionLines = { entry: null, tp: null, sl: null };
  let trackedPositionMarker = null; // 지금 그려진 라인이 "어느 포지션" 것인지 구분(openTime)

  // 과거 스크롤(무한 로딩)을 위해 지금까지 불러온 캔들을 배열로 직접 들고 있습니다.
  // Lightweight Charts의 update()는 맨 뒤에 추가/수정만 가능하고 앞쪽에 데이터를
  // 끼워 넣을 수 없어서, 더 오래된 데이터를 받으면 이 배열 앞에 합친 뒤
  // setData()로 통째로 다시 넣어줍니다.
  let allCandles = [];
  let isLoadingMore = false;
  let reachedHistoryStart = false; // 이 심볼의 가장 오래된 캔들까지 다 불러왔는지
  // 메모리 누수 방지(버그#4): 장시간 세션(특히 1초봉)에서 allCandles가 계속
  // 늘어나기만 하는 걸 막기 위한 상한. 과거 스크롤은 그대로 동작하되(오래된
  // 쪽을 불러오면 최신 쪽에서 잘라냄), 화면에 보이는 범위는 이 개수로 충분합니다.
  const MAX_CANDLES_IN_MEMORY = 5000;

  const COLORS = {
    up: "#0ECB81", // Binance 기본 배색: 상승 = 초록
    down: "#F6465D", // 하락 = 빨강
    volUp: "rgba(14,203,129,0.5)",
    volDown: "rgba(246,70,93,0.5)",
    grid: "rgba(255,255,255,0.05)",
    text: "#8791A8",
    current: "#FF5252", // 요청: 현재가 선은 빨간색 하나만
    entryLine: "#E3B341", // 진입가 라인(골드) — 현재가 라인(빨강)과 구분되도록
    tpLine: "#34D399", // TP(익절) 라인 — 초록
    slLine: "#FB923C", // SL(손절) 라인 — 주황
  };

  function el(id) {
    return document.getElementById(id);
  }

  /* ---------------- DOM 참조 (상단 통계 바 / 연결 상태) ---------------- */
  let dom = {};
  function cacheDom() {
    // 펀딩비/다음 펀딩까지 표시용 stat-block을 기존 stats-bar에 끼워 넣음
    // (요구사항 3: "가능한 데이터는 Binance 실시간 데이터를 사용, 없는 항목은
    // 가짜 숫자로 채우지 않는다" — markPrice 스트림의 실제 펀딩비율만 사용합니다)
    const statsBar = document.querySelector(".stats-bar");
    if (statsBar && !el("stat-funding")) {
      const block = document.createElement("div");
      block.className = "stat-block";
      block.innerHTML =
        '<span class="stat-label">펀딩비 (다음 정산까지)</span>' +
        '<span class="stat-value" id="stat-funding">-</span>';
      statsBar.appendChild(block);
    }
    // 마크가격(Mark Price) — 바이낸스처럼 심볼 정보 근처에 상시 노출.
    // 같은 markPrice 스트림을 이미 받고 있어서(펀딩비와 동일 이벤트),
    // 별도 요청 없이 표시만 추가합니다 — 실제 Binance 값 그대로.
    if (statsBar && !el("stat-mark-price")) {
      const block = document.createElement("div");
      block.className = "stat-block";
      block.innerHTML =
        '<span class="stat-label">마크가격</span>' +
        '<span class="stat-value" id="stat-mark-price">-</span>';
      statsBar.appendChild(block);
    }

    dom = {
      chartContainer: el("chart_container"),
      statPrice: el("stat-price"),
      statChange: el("stat-change"),
      statHigh: el("stat-high"),
      statLow: el("stat-low"),
      statVolume: el("stat-volume"),
      statFunding: el("stat-funding"),
      statMarkPrice: el("stat-mark-price"),
      wsDot: el("ws-dot"),
      wsStatusText: el("ws-status-text"),
      lastUpdateText: el("last-update-text"),
      intervalRow: el("interval-row"),
    };
  }

  /* ---------------- 펀딩비/마크가격 (요구사항 17: 구조 + 실제 데이터) ----------------
   * websocket.js가 같은 /market 연결에서 markPrice 스트림을 받아 내보내는
   * 'funding:update'를 그대로 표시합니다. 실제 Binance 값만 쓰고, 잔고에
   * 자동으로 반영하는 로직은 TODO로 남겨뒀습니다(트레이딩 엔진에 미구현).
   * ------------------------------------------------------------------- */
  function onFundingUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    if (dom.statFunding) {
      const pct = (payload.fundingRate * 100).toFixed(4) + "%";
      const remainMs = payload.nextFundingTime - Date.now();
      const remainStr = remainMs > 0 ? formatRemain(remainMs) : "-";
      dom.statFunding.textContent = pct + " (" + remainStr + ")";
      dom.statFunding.classList.toggle("up", payload.fundingRate >= 0);
      dom.statFunding.classList.toggle("down", payload.fundingRate < 0);
    }
    if (dom.statMarkPrice && App.Utils && typeof payload.markPrice === "number") {
      dom.statMarkPrice.textContent = App.Utils.formatCurrencyPlain(payload.markPrice);
    }
  }
  function formatRemain(ms) {
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h + "시간 " + m + "분";
  }

  /* ---------------- 시간 단위(1분/5분/1시간 ...) 선택 버튼 ---------------- */
  function renderIntervalButtons() {
    if (!dom.intervalRow) return;
    const intervals = App.Config.getIntervals();
    const active = App.Config.getActiveInterval();
    dom.intervalRow.innerHTML = intervals
      .map(
        (iv) =>
          '<button class="interval-btn' +
          (iv.value === active ? " active" : "") +
          '" data-interval="' +
          iv.value +
          '">' +
          iv.label +
          "</button>"
      )
      .join("");
    dom.intervalRow.querySelectorAll(".interval-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        App.Config.setActiveInterval(btn.dataset.interval);
        renderIntervalButtons(); // active 표시 갱신
      });
    });
  }

  /* ---------------- 통화 표시 전환 ----------------
   * 캔들 데이터(allCandles, candleSeries에 들어가는 값)는 항상 USDT입니다.
   * KRW로 보여줄 땐 데이터를 바꾸지 않고, Lightweight Charts의 custom
   * priceFormat.formatter로 "표시 문자열만" 바꿉니다 — 가격축, 현재가
   * 라인, 진입가/TP/SL 라인, 크로스헤어 툴팁이 전부 이 formatter 하나로
   * 동시에 바뀝니다.
   * ------------------------------------------------------------------- */
  function currencyPriceFormat() {
    return {
      type: "custom",
      minMove: App.Config.getDisplayCurrency() === "KRW" ? 1 : 0.01,
      formatter: (price) => App.Utils.formatCurrencyPlain(price),
    };
  }

  function onCurrencyChange() {
    if (candleSeries) candleSeries.applyOptions({ priceFormat: currencyPriceFormat() });
    // 상단 통계바(현재가/고가/저가)도 즉시 재표시
    if (lastPricePayload) onPriceUpdate(lastPricePayload);
    if (lastTickerPayload) onTickerUpdate(lastTickerPayload);
  }

  /* ---------------- 차트 초기화 ---------------- */
  function init() {
    cacheDom();
    if (!dom.chartContainer) return;

    if (typeof LightweightCharts === "undefined") {
      setWsStatus("fail", "차트 라이브러리 로드 실패");
      return;
    }

    chart = LightweightCharts.createChart(dom.chartContainer, {
      autoSize: true, // 컨테이너 크기에 자동으로 맞춰 리사이즈
      layout: {
        background: { color: "transparent" },
        textColor: COLORS.text,
        fontFamily: "'JetBrains Mono', ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        visible: true,
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
        visible: true,
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
      },
      // 마우스 휠 확대/축소, 드래그 이동이 모두 켜져 있는 상태(기본값을 명시적으로 지정)
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
      kineticScroll: { mouse: true, touch: true },
    });

    candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderVisible: false,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceScaleId: "right",
      // Lightweight Charts가 캔들 시리즈에 자동으로 그려주는 "마지막 값 선"을 끔.
      // 이게 켜져 있으면 우리가 직접 만드는 현재가 선(아래 updateCurrentPriceLine)과
      // 겹쳐서 화면에 선이 2개로 보였음 — 현재가 선 하나만 남기기 위해 비활성화.
      priceLineVisible: false,
      lastValueVisible: false,
      // 원화는 소수점(센트) 개념이 없으므로 정수 단위로 표시
      priceFormat: currencyPriceFormat(),
    });
    // 캔들 가격 스케일은 아래쪽 22%를 거래량 막대에 내어줌 (Binance처럼 캔들 아래 거래량 표시)
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.06, bottom: 0.24 },
    });

    // 거래량 히스토그램: websocket.js가 이미 kline의 거래량(candle.volume)을 함께
    // 보내주고 있었는데 이전 버전은 이 값을 버리고 있었습니다 — 이번에 추가.
    volumeSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // 캔들과 별개의 오버레이 스케일 (같은 pane 하단에 표시)
    });
    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    loadHistory(App.Config.getActiveSymbol());

    App.Bus.on("kline:update", onKlineUpdate);
    App.Bus.on("ticker:update", onTickerUpdate);
    App.Bus.on("price:update", onPriceUpdate);
    App.Bus.on("ws:status", onWsStatus);
    App.Bus.on("symbol:change", (p) => loadHistory(p.symbol));
    App.Bus.on("interval:change", () => loadHistory(App.Config.getActiveSymbol()));
    App.Bus.on("trading:update", onTradingUpdate);
    App.Bus.on("currency:change", onCurrencyChange);
    App.Bus.on("funding:update", onFundingUpdate);

    renderIntervalButtons();

    // 왼쪽 끝(가장 오래된 캔들 근처)까지 스크롤/줌 아웃하면 이전 페이지를 이어서 불러옴
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      if (range.from < 10) {
        loadMoreHistory();
      }
    });
  }

  /* ---------------- 과거 500개 1분봉 로드 ---------------- */
  function applyCandlesToChart() {
    candleSeries.setData(
      allCandles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }))
    );
    volumeSeries.setData(
      allCandles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? COLORS.volUp : COLORS.volDown,
      }))
    );
  }

  function loadHistory(symbol) {
    reachedHistoryStart = false;
    const interval = App.Config.getActiveInterval();

    // 요구사항 1: REST는 "최초 캔들 로딩" 전용입니다. 다만 5초/15초처럼 Binance가
    // 애초에 제공하지 않는 간격은 REST에도 그 데이터가 없으므로, 빈 차트에서
    // 시작해 실시간 체결(trade)로 캔들이 쌓이는 것을 그대로 보여줍니다.
    if (!App.Config.isNativeInterval(interval)) {
      allCandles = [];
      applyCandlesToChart();
      reachedHistoryStart = true; // 과거 스크롤도 요청하지 않도록 막음 (REST에 데이터가 없음)
      return;
    }

    App.Api.fetchKlines(symbol, interval, App.Config.KLINE_LIMIT)
      .then((candles) => {
        // REST 응답도 websocket.js와 동일하게 원본 USDT 값 그대로 저장합니다
        // (allCandles는 항상 USDT 기준 — 화면 표시만 currency formatter가 환산).
        allCandles = candles.slice();
        applyCandlesToChart();
        // setData 직후엔 화면이 기본 줌 상태라 방금 불러온 과거 500개 봉이
        // 화면 밖에 있을 수 있습니다. 불러온 전체 범위가 바로 보이도록 맞춰줍니다.
        chart.timeScale().fitContent();
      })
      .catch((err) => {
        console.error("[chart.js] 과거 캔들 조회 실패:", err);
        setWsStatus("fail", "과거 캔들 조회 실패");
      });
  }

  /* ---------------- 과거로 스크롤 시 이전 페이지 이어서 불러오기 ----------------
   * Binance REST klines는 한 번에 최대 1500개까지만 주기 때문에, "전체 과거"를
   * 한 번에 다 받아올 수는 없습니다(1분봉이면 특히). 대신 실제 거래소들이 쓰는
   * 방식과 동일하게, 왼쪽 끝까지 스크롤하면 그 시점 이전 데이터를 추가로 요청해서
   * 앞에 이어붙입니다 — 계속 스크롤하면 그 심볼의 상장 시점까지 전부 갈 수 있습니다.
   * -------------------------------------------------------------------------- */
  function loadMoreHistory() {
    if (isLoadingMore || reachedHistoryStart || allCandles.length === 0) return;
    isLoadingMore = true;

    const symbol = App.Config.getActiveSymbol();
    const oldestTime = allCandles[0].time; // 초 단위
    const endTime = oldestTime * 1000 - 1; // ms, 현재 가장 오래된 캔들 "이전"을 요청

    App.Api.fetchKlines(symbol, App.Config.getActiveInterval(), App.Config.KLINE_LIMIT, endTime)
      .then((olderCandles) => {
        isLoadingMore = false;
        const filtered = (olderCandles || []).filter((c) => c.time < oldestTime);
        if (filtered.length === 0) {
          reachedHistoryStart = true; // 더 이상 과거 데이터가 없음 (상장 시점 도달)
          return;
        }
        allCandles = filtered.concat(allCandles);
        applyCandlesToChart();
      })
      .catch((err) => {
        isLoadingMore = false;
        console.error("[chart.js] 과거 데이터 추가 조회 실패:", err);
      });
  }

  /* ---------------- 실시간 캔들 갱신 (요구사항 2, 5, 6) ----------------
   * websocket.js가 이 candle 객체를 만들 때 trade 스트림을 직접 집계하지 않고,
   * Binance kline_1m 스트림이 보내주는 k.o/k.h/k.l/k.c/k.v 값을 그대로
   * 옮겨 담을 뿐입니다(js/websocket.js 참고). 여기서는 그 값을 받아
   * candleSeries.update()/volumeSeries.update()로 반영하기만 합니다.
   * 새 1분이 시작되면 k.t(캔들 시작 시각)가 바뀌므로 Lightweight Charts가
   * 자동으로 새 캔들을 만들고, 같은 분 안에서는 마지막 캔들이 계속
   * update()로만 갱신됩니다.
   * ------------------------------------------------------------------ */
  function onKlineUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    const c = payload.candle;
    candleSeries.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    volumeSeries.update({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? COLORS.volUp : COLORS.volDown,
    });

    // allCandles(로컬 보관 배열)도 함께 갱신 — 나중에 loadMoreHistory가 과거 데이터를
    // 이 배열 앞에 합쳐서 setData()로 다시 그릴 때, 최신 진행 중인 캔들이 그대로 살아있게 하기 위함
    const last = allCandles[allCandles.length - 1];
    if (last && last.time === c.time) {
      last.open = c.open;
      last.high = c.high;
      last.low = c.low;
      last.close = c.close;
      last.volume = c.volume;
    } else if (!last || c.time > last.time) {
      allCandles.push({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume });
      // 새 봉이 생길 때마다(1초봉이면 초당 발생 가능) 계속 늘어나기만 하는 걸 막음.
      // 과거 스크롤로 불러온 데이터(loadMoreHistory)는 여기서 자르지 않습니다 —
      // 그건 사용자가 직접 요청한 유한한 동작이라 별개입니다.
      if (allCandles.length > MAX_CANDLES_IN_MEMORY) {
        allCandles.shift();
      }
    }
  }

  /* ---------------- 현재 가격선 (요구사항 9) ---------------- */
  function onPriceUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    lastPricePayload = payload;
    updateCurrentPriceLine(payload.price);
    if (dom.statPrice) dom.statPrice.textContent = App.Utils.formatCurrency(payload.price);
    // 실시간으로 값이 계속 갱신되고 있는지 눈으로 바로 확인할 수 있도록 시각을 찍음
    if (dom.lastUpdateText) dom.lastUpdateText.textContent = App.Utils.nowStr();
  }

  function updateCurrentPriceLine(price) {
    if (!candleSeries) return;
    if (!currentPriceLine) {
      currentPriceLine = candleSeries.createPriceLine({
        price: price,
        color: COLORS.current,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Solid,
        axisLabelVisible: true,
        title: "",
      });
    } else {
      currentPriceLine.applyOptions({ price: price });
    }
  }

  /* ---------------- 진입가 / TP / SL 라인 (포지션에 연동) ----------------
   * App.Trading이 내보내는 'trading:update' 스냅샷의 position 정보만 보고
   * 그립니다 — 계산은 하지 않고 그리기만 합니다. 새 포지션이 열리면(openTime이
   * 바뀌면) 기존 라인을 지우고 새로 그리고, 포지션이 없어지면 전부 지웁니다.
   * ------------------------------------------------------------------- */
  function clearPositionLines() {
    if (!candleSeries) return;
    Object.keys(positionLines).forEach((key) => {
      if (positionLines[key]) {
        try {
          candleSeries.removePriceLine(positionLines[key]);
        } catch (e) {
          /* 이미 제거된 경우 무시 */
        }
        positionLines[key] = null;
      }
    });
  }

  function onTradingUpdate(snapshot) {
    if (!candleSeries) return;
    const pos = snapshot.position;

    if (!pos) {
      if (trackedPositionMarker !== null) {
        clearPositionLines();
        trackedPositionMarker = null;
      }
      return;
    }

    if (pos.openTime === trackedPositionMarker) return; // 같은 포지션이 계속 유지 중 — 다시 그릴 필요 없음

    clearPositionLines();
    trackedPositionMarker = pos.openTime;

    positionLines.entry = candleSeries.createPriceLine({
      price: pos.entry,
      color: COLORS.entryLine,
      lineWidth: 1,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: (pos.side === "long" ? "롱" : "숏") + " 진입가",
    });

    if (pos.tp) {
      positionLines.tp = candleSeries.createPriceLine({
        price: pos.tp,
        color: COLORS.tpLine,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: "TP",
      });
    }
    if (pos.sl) {
      positionLines.sl = candleSeries.createPriceLine({
        price: pos.sl,
        color: COLORS.slLine,
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: "SL",
      });
    }
  }

  /* ---------------- 상단 24H 통계 (요구사항 10) ---------------- */
  function onTickerUpdate(payload) {
    if (payload.symbol !== App.Config.getActiveSymbol()) return;
    lastTickerPayload = payload;
    if (!dom.statChange) return;

    const pct = payload.priceChangePercent;
    dom.statChange.textContent = App.Utils.formatPercent(pct);
    dom.statChange.classList.toggle("up", pct >= 0);
    dom.statChange.classList.toggle("down", pct < 0);

    dom.statHigh.textContent = App.Utils.formatCurrency(payload.highPrice);
    dom.statLow.textContent = App.Utils.formatCurrency(payload.lowPrice);
    dom.statVolume.textContent = App.Utils.formatVolume(payload.volume) + " BTC";
  }

  /* ---------------- 연결 상태 표시 (요구사항 6) ---------------- */
  function setWsStatus(kind, text) {
    if (!dom.wsDot) return;
    dom.wsDot.classList.remove("ok", "fail", "pending");
    dom.wsDot.classList.add(kind);
    dom.wsStatusText.textContent = text;
  }

  function onWsStatus(payload) {
    if (payload.state === "connecting") setWsStatus("pending", "연결 중...");
    else if (payload.state === "open") setWsStatus("ok", "실시간 연결됨");
    else if (payload.state === "stale") setWsStatus("pending", "응답 지연 — 재연결 대기 중");
    else setWsStatus("fail", "연결 끊김 (재연결 시도 중)");
  }

  return {
    init,
  };
})();
