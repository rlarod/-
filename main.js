/* =========================================================================
 * main.js — 앱 진입점 (Composition Root)
 * =========================================================================
 * 실시간 차트(js/chart.js) + 실시간 시세/호가/체결(js/websocket.js,
 * js/orderbook.js, js/trades.js) + 모의거래 엔진(js/trading.js) +
 * 주문창 UI(js/ui.js)가 전부 이벤트 버스로 연결된 모의투자 플랫폼입니다.
 *
 * 이 파일이 하는 일은 두 가지뿐입니다.
 *   1) 전역 네임스페이스(App)와 공용 이벤트버스(App.Bus) 준비
 *   2) DOM이 준비되면 각 모듈의 init()을 순서대로 호출
 *
 * ── 데이터 흐름 요약 ─────────────────────────────────────────────
 * js/websocket.js가 Binance Futures(/market 경로 단일 연결)에서 받은
 * 값을 항상 USDT로 관리하며 여러 이벤트를 내보냅니다.
 *   'kline:update'  → { symbol, candle }               캔들(USDT)
 *   'price:update'  → { symbol, price, time }           단일 현재가(USDT)
 *   'ticker:update' → { symbol, lastPrice, ... }         24H 통계(USDT)
 *   'trade:tick'    → { symbol, price, qty, ... }        체결(js/trades.js가 구독)
 *   'funding:update'→ { symbol, fundingRate, ... }        펀딩비(markPrice 스트림)
 * js/orderbook.js는 /public 경로로 별도 WebSocket을 하나 더 열어(2026-04-23
 * 주소 개편으로 depth는 /market과 합칠 수 없음) 호가를 받습니다.
 *
 * js/trading.js는 'price:update' 하나만 구독해서 손익/청산/포지션을 전부
 * USDT로 계산하고 'trading:update'로 다시 방송합니다. js/chart.js(포지션
 * 라인)와 js/ui.js(주문창 렌더링)가 그 결과만 받아 표시하며, 화면에 KRW로
 * 보여줄지는 App.Config의 'currency:change' 이벤트로만 결정됩니다(계산에는
 * 전혀 관여하지 않음). 새 모듈을 추가할 때도 이 이벤트들만 구독하면 되고,
 * websocket.js/chart.js를 직접 고칠 필요가 없습니다.
 * ========================================================================= */

(function () {
  "use strict";

  window.App = window.App || {};

  /* ---------------- 공용 이벤트 버스 ---------------- */
  App.Bus = (function () {
    const listeners = {};
    return {
      on(event, fn) {
        (listeners[event] = listeners[event] || []).push(fn);
        return fn;
      },
      off(event, fn) {
        if (!listeners[event]) return;
        listeners[event] = listeners[event].filter((f) => f !== fn);
      },
      emit(event, payload) {
        (listeners[event] || []).forEach((fn) => {
          try {
            fn(payload);
          } catch (err) {
            console.error("[App.Bus] listener error on '" + event + "':", err);
          }
        });
      },
    };
  })();

  /* ---------------- 초기화 순서 ----------------
   * Chart를 먼저 준비해서 캔들 시리즈가 만들어진 다음에
   * Trading/UI가 초기 상태를 읽고, 마지막으로 WS를 열어야
   * 모든 구독자가 준비된 상태에서 첫 tick부터 놓치지 않고 반영됩니다.
   * ------------------------------------------------ */
  /* ---------------- 부팅은 딱 한 번 (2026-08-28) ----------------
   * P1 — 두 번 부팅되면 회원 돈이 두 번 나갑니다.
   *
   * 실측(재현기, 네트워크 0) — 10배 롱 진입 뒤 "절반만 닫기" 를 한 번 누름
   *      한 번 부팅  구독자 price:update 3 / trading:update 4
   *                  closedTrades 1건 · 닫힌비율 50% · 잔고 99,492.55
   *      두 번 부팅  구독자 price:update 6 / trading:update 7
   *                  closedTrades 2건 · 닫힌비율 75% · 잔고 99,741.32
   *
   * 왜 두 배가 되나 — js/ui.js:747 injectDynamicUI() 가 멱등이라 DOM 을
   * 다시 만들지 않습니다. 그래서 두 번째 bindOrderPanel() 이 "같은 노드" 에
   * 리스너를 하나 더 붙입니다. js/ui.js:658 의 것은 화살표 함수라
   * 브라우저의 "같은 리스너 중복 등록 무시" 도 안 걸립니다.
   * 회원은 절반만 닫았다고 믿는데 거래내역에 모르는 청산이 한 줄 더 생기고,
   * 오류는 하나도 안 뜹니다(전형적인 조용한 고장).
   *
   * ⛔ js/ui.js 는 수정 금지 파일입니다. 그리고 같은 문제가 20여 모듈에
   *    똑같이 있어서 한 곳만 막아도 나머지가 남습니다. 그래서 근본 원인인
   *    "두 번 부팅" 자체를 여기 한 곳에서 막습니다.
   *
   * 부팅을 부르는 길이 셋입니다 — 셋이 서로 다른 변수를 봅니다.
   *   ① js/auth.js:43   let booted        (로그인 성공 → bootOnce)
   *   ② js/guest-access.js:121 var bootCalled  (비회원 · 세션복구 지연 재방문)
   *   ③ main.js start()  App.Auth 가 없을 때 boot() 직접 호출
   *      (Supabase 라이브러리 로드 실패)
   * ①②는 App.bootApp 을 통하지만 ③은 boot() 를 바로 부릅니다.
   * 그래서 App.bootApp 이 아니라 boot() 에 자물쇠를 겁니다 — 셋 다 지나갑니다.
   * ------------------------------------------------------------- */
  let bootDone = false;
  let bootPromise = null;

  /* 누가 두 번 불렀는지 나중에 잡을 수 있게 부른 자리를 남깁니다. */
  function calledFrom() {
    try {
      const lines = String(new Error().stack || "").split("\n").slice(2, 6);
      return lines.map((l) => l.trim()).join(" ← ") || "(호출 위치를 못 읽었습니다)";
    } catch (e) {
      return "(호출 위치를 못 읽었습니다)";
    }
  }

  function boot() {
    if (bootDone) {
      /* 조용히 넘기지 않습니다 — 두 번 부르는 길이 남아 있다는 뜻이라
         콘솔에 어디서 불렀는지 그대로 남깁니다. */
      console.warn(
        "[main.js] 이미 부팅했습니다 — 두 번째 부팅을 건너뜁니다.\n" +
        "  (그냥 두면 주문창 리스너가 두 겹이 되어 '절반만 닫기' 가 3/4 을 닫습니다)\n" +
        "  부른 곳: " + calledFrom()
      );
      return;
    }
    bootDone = true;
    bootModules();
  }

  function bootModules() {
    const modules = ["Chart", "OrderBook", "OrderbookPriceArrow", "OrderbookMarkPrice", "TradeStreamFix", "RecentTrades", "OrderbookTabs", "TradesFit", "ObHeaderCurrency","MarketWar", "OrderPressureBar", "Trading", "OrderInfoPanel", "SupabaseSync", "TradeHistory", "Leaderboard", "TableScrollHint","Chat", "TradeEventsChat", "ChatEventStyle", /* "ChatSplit" — 2026-08-24 대표 결정("B안")으로 연결 끊음.
      ⚡ 알림 띠를 없애고 알림을 다시 채팅에 보이게 했습니다.
      되살리려면 이 주석을 풀고 index.html 의 <script src="js/chat-split.js"> 도 푸세요. */
      "DailyRecharge", "PositionTableExtra", "LimitClose", "AdminMenu", "LayoutAlign", "Theme", "BoardGalleryStyle", "BoardPaging", "Admin", "Board", "MyPage", "SymbolSelector", "Rank", "NoticeBoard", "UserPanel", "AdSlots", "TickerBoard", "PageNav", "UI", "QtyPriceOrder", "AmiTalkOrderPanel", "OrderbookClickOrder", "WS",
      /* 종목 전환(4번 관문). WS 뒤에 둡니다 — 소켓 감싸기는 스크립트를 읽는 즉시
         이미 끝나 있고, 여기 init() 은 화면 글자(종목명·단위)만 맞춥니다.
         RecentTrades 가 만든 패널 제목도 같이 고치므로 그보다 뒤여야 합니다. */
      "SymbolStreamSwitch",
      /* 상품탭 줄의 종목 탭 4개. SymbolStreamSwitch 뒤여야 합니다 —
         눌렀을 때 그 모듈의 switchTo 를 그대로 부르기 때문입니다. */
      "SymbolTabs", "NoEmoji"];
    modules.forEach((name) => {
      if (App[name] && typeof App[name].init === "function") {
        // 버그 수정: 여기 try/catch가 없으면 앞쪽 모듈(예: MarketWar) 하나가
        // init() 도중 에러를 던졌을 때 forEach 전체가 멈춰서, 뒤에 있는
        // Trading/UI/WS(진짜 거래 기능)가 아예 초기화되지 않습니다.
        // 장식 기능 하나의 오류가 핵심 거래 기능을 막으면 안 됩니다.
        try {
          App[name].init();
        } catch (err) {
          console.error("[main.js] App." + name + " 초기화 실패(다른 모듈은 계속 진행):", err);
        }
      } else {
        console.warn("[main.js] App." + name + " 모듈이 없거나 init()이 없습니다.");
      }
    });
  }
  // js/auth.js(닉네임/익명 로그인 게이트)가 준비되면 이 함수를 호출해서
  // 기존 부팅 순서를 그대로 실행합니다 — boot() 자체의 내용/순서는 전혀
  // 안 바뀌었고, "언제 호출되는지"만 auth.js가 결정하게 됐습니다.
  //
  // App.bootApp 자체는 이번에 딱 하나 더 추가됐습니다: 실제 모듈을 부팅하기
  // "직전"에 App.Season.checkAndReset()을 한 번 기다립니다 — trading.js가
  // localStorage를 읽어서 메모리에 올리기 전에 시즌이 바뀌었는지 먼저
  // 확인해야 하기 때문입니다(관리자가 "전체 시즌 초기화"를 실행한 경우).
  // auth.js는 이 변경을 몰라도 됩니다 — 여전히 App.bootApp()만 호출하면 됩니다.
  App.bootApp = async function () {
    /* 두 번째로 부른 쪽도 "부팅이 끝났다" 를 기대합니다. 그래서 그냥 돌려보내지
       않고 첫 번째가 만든 약속을 그대로 돌려줍니다 — 첫 부팅이 아직
       App.Season.checkAndReset() 을 기다리는 중이라면, 두 번째로 부른 쪽도
       진짜로 끝날 때까지 같이 기다립니다(먼저 다음 일로 넘어가지 않습니다). */
    if (bootPromise) {
      console.warn(
        "[main.js] App.bootApp() 이 두 번 불렸습니다 — 첫 부팅이 끝날 때까지 같이 기다립니다(다시 부팅하지 않습니다).\n" +
        "  부른 곳: " + calledFrom()
      );
      return bootPromise;
    }
    bootPromise = (async function () {
      if (App.Season && typeof App.Season.checkAndReset === "function") {
        try {
          await App.Season.checkAndReset();
        } catch (err) {
          console.warn("[main.js] 시즌 체크 실패(기존 로컬 데이터 유지하고 계속 진행):", err);
        }
      }
      boot();
    })();
    return bootPromise;
  };

  function start() {
    // Auth 모듈이 있으면 닉네임 게이트를 먼저 거치고, 없으면(로드 실패 등)
    // 기존처럼 바로 부팅합니다 — Supabase 쪽에 문제가 생겨도 기존 로컬
    // 모의투자 기능 자체는 절대 막히지 않게 하기 위한 안전장치입니다.
    if (App.Auth && typeof App.Auth.init === "function") {
      App.Auth.init();
    } else {
      boot();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
