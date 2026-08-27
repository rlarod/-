/* =========================================================================
 * js/stale-price-guard.js — App.StalePriceGuard
 * =========================================================================
 * [P1] 종목을 바꾼 직후 매수하면 "옛 종목 가격" 으로 체결되는 것을 막습니다.
 *      (2026-08-27, 조사팀 재현 + 본부장 라이브 확인)
 *
 * ── 무엇이 터졌나 ────────────────────────────────────────────────────────
 *   js/trading.js 는 price:update 와 funding:update 둘만 구독합니다(:671-672).
 *   symbol:change 를 안 봅니다. 그래서 종목을 바꿔도 state.currentPrice 에
 *   "옛 종목의 가격" 이 그대로 남아 있습니다.
 *
 *       SK하이닉스 화면            currentPrice = 1253.4
 *       비트코인 전환 3.2초 뒤      종목 BTCUSDT · currentPrice = 1253.4  ← 그대로
 *
 *   그 상태에서 시장가로 사면 js/trading.js:132 가
 *       const entry = state.currentPrice;
 *   를 그대로 진입가로 씁니다. 종목 확인이 없습니다(:117-122).
 *
 *       진입가 1,250.3 (비트코인인데 SK하이닉스 가격) · 수량 79.98 BTC
 *       비트코인 첫 틱 78,700 이 오면 미실현손익 +6,194,489 USDT
 *       (증거금 10,000 → 619배). 반대 방향이면 첫 틱에 증거금 전액 손실.
 *   청산하면 실현손익이 되어 랭킹·계급에 그대로 들어갑니다.
 *
 *   위험 창은 3.5~8.5초입니다. 전환은 포지션이 없을 때만 되므로
 *   js/symbol-guard.js 의 그물도 안 켜집니다(:453 need 가 null 이면 통과).
 *
 * ── 어떻게 막나 ──────────────────────────────────────────────────────────
 *   js/trading.js 는 수정 금지 파일이라 state.currentPrice 를 밖에서 못 비웁니다.
 *   그래서 "그 값을 꺼내 가는 문" 두 개를 밖에서 잠급니다.
 *
 *     1) App.Trading.getSnapshot() 이 그 창 동안 currentPrice: null 을 줍니다.
 *        ⚠ 지어낸 상태가 아닙니다. js/trading.js:61 의 초기값이 바로 null 이고
 *          (주석도 "활성 심볼의 실시간 현재가"), 새 종목의 첫 틱을 못 받은
 *          지금이 정확히 그 상태입니다. 부팅 직후와 같은 상태라 읽는 쪽은
 *          전부 이미 이 값을 다룰 줄 압니다.
 *        → js/order-panel-amitalk.js:83  ± 스텝 버튼  (base === null 이면 return)
 *        → js/qty-price-order.js:58,94   Last 버튼    (없으면 안 채움)
 *        → js/order-fee-preview.js       수수료 미리보기도 옛 가격으로 안 나옴
 *
 *     2) App.Trading.openPosition / placeLimitOrder 가 거절합니다.
 *        1) 을 어떻게든 빠져나온 경로가 있어도 여기서 돈이 안 나갑니다.
 *        js/ui.js:713-714 가 result.error 를 그대로 화면에 띄웁니다(무수정).
 *
 *   그리고 호가창에 남은 옛 종목 숫자도 같이 지웁니다(조사팀 [A]).
 *   js/order-info-panel.js:63,68 이 dataset.price 를 읽어 매수가격·매도가격
 *   칸에 옛 종목 값을 그대로 보여주고 있었습니다. dataset 을 지우면 그 두 줄의
 *   if (...dataset.price) 가 막아 "-" 로 떨어집니다.
 *   (js/orderbook.js:241 도 같은 값을 읽지만 if (!row.dataset.price) return 으로
 *    안전하게 빠져나갑니다 — 조사팀 코드 확인.)
 *
 * ── 종목이 바뀌면 "가격을 적는 칸" 세 개를 비웁니다 ──────────────────────
 *   주문가격(지정가) · 익절가(TP) · 손절가(SL).
 *   셋 다 옛 종목 가격이 남으면 회원이 잘못된 정보로 판단하게 됩니다.
 *     주문가격  옛 가격 그대로 체결됩니다 (js/trading.js:279)      → 돈이 나감  [P1]
 *     익절가    영영 도달 못 하는 값이 걸립니다                     → 조용한 고장 [P2]
 *     손절가    방향이 안 맞아 걸러집니다(js/tpsl-guard.js) — 하지만
 *               회원 화면에는 남아 있어 "걸어뒀다" 고 믿게 됩니다   → 조용한 고장 [P2]
 *   회원이 직접 친 값이라도 비웁니다. 종목이 바뀌면 그 숫자는 뜻이 없습니다.
 *   ⛔ 조용히 지우지 않습니다 — 무엇을 왜 지웠는지 안내 칸에 한 줄로 남깁니다.
 *
 * ── ⛔ 조용히 막지 않습니다 ──────────────────────────────────────────────
 *   조용히 막으면 새로운 조용한 고장이 됩니다. 세 가지를 같이 합니다.
 *     · 매수/매도 버튼을 못 누르게 하고
 *     · 버튼 위에 "○○ 시세를 받는 중입니다" 를 띄우고
 *     · 그래도 눌리면 같은 문구를 주문 오류 칸에 넣습니다
 *   창이 닫히면 세 가지를 전부 원래대로 되돌립니다(우리가 바꾼 것만).
 *
 * ── 언제 풀리나 ──────────────────────────────────────────────────────────
 *   새 종목의 price:update 가 처음 도착하는 순간입니다. 시각이나 타이머로
 *   풀지 않습니다 — 시세가 늦으면 늦는 만큼 잠겨 있는 것이 안전합니다.
 *
 * ── 다른 안전장치와의 관계 ───────────────────────────────────────────────
 *   js/multi-symbol-view.js 묶음과는 별개입니다. 저쪽은 "포지션이 있을 때",
 *   이쪽은 "포지션이 없을 때" 입니다. 서로 건드리지 않습니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 에서 <script src="js/stale-price-guard.js"></script> 한 줄을
 *   지우면 완전히 원래대로 돌아갑니다. 파일까지 지우려면 그 다음에 이 파일을
 *   지웁니다.
 * ========================================================================= */

window.App = window.App || {};

App.StalePriceGuard = (function () {
  "use strict";

  var NOTICE_ID = "stale-price-notice";
  var LIMIT_INPUT_ID = "limit-price-input";   // js/ui.js:91 이 만드는 지정가 주문가격 칸
  var TP_INPUT_ID = "tp-input";               // js/ui.js:106 익절가(TP)
  var SL_INPUT_ID = "sl-input";               // js/ui.js:110 손절가(SL)

  /* 종목이 바뀌면 비우는 칸들 — 셋 다 "가격" 을 넣는 칸이라 종목이 바뀌면 뜻이 없습니다.
     여기 적힌 순서가 그대로 안내 문구에 적히는 순서입니다. */
  var CLEARABLE = [
    { id: LIMIT_INPUT_ID, label: "주문가격",   counter: "clearedLimitPrice" },
    { id: TP_INPUT_ID,    label: "익절가(TP)", counter: "clearedTp" },
    { id: SL_INPUT_ID,    label: "손절가(SL)", counter: "clearedSl" }
  ];

  var stale = false;        // 지금 "새 종목 시세를 기다리는 중" 인가
  var waitingFor = null;    // 무슨 종목의 첫 틱을 기다리는가
  var since = 0;

  /* 종목이 바뀌어 우리가 비운 값들 [{id,label,value}].
     회원이 그 칸에 다시 입력할 때까지 안내가 남습니다. */
  var cleared = [];
  var clearedFor = null;
  var selfEdit = false;   // 우리가 낸 input 이벤트를 우리가 다시 듣지 않게

  var counts = {
    windows: 0,          // 창이 열린 횟수
    clearedLimitPrice: 0,// 지정가 주문가격 칸을 비운 횟수
    clearedTp: 0,        // 익절가(TP) 칸을 비운 횟수
    clearedSl: 0,        // 손절가(SL) 칸을 비운 횟수
    clearedFields: 0,    // 비운 칸 수 합계
    blockedOrders: 0,    // 막은 주문 수
    blockedMarket: 0,
    blockedLimit: 0,
    nulledSnapshots: 0,  // currentPrice 를 null 로 돌려준 횟수
    clearedRows: 0,      // dataset.price 를 지운 호가 행 수
    lastWindowMs: 0      // 마지막 창이 몇 ms 열려 있었나
  };

  function isSym(v) { return typeof v === "string" && v.length > 0; }

  function activeSymbol() {
    if (App.Config && typeof App.Config.getActiveSymbol === "function") {
      try { return App.Config.getActiveSymbol(); } catch (e) { /* noop */ }
    }
    return null;
  }

  function symbolName(sym) {
    if (!isSym(sym)) return "새 종목";
    if (App.SymbolRegistry && typeof App.SymbolRegistry.getBySymbol === "function") {
      try {
        var m = App.SymbolRegistry.getBySymbol(sym);
        if (m && m.name) return m.name;
      } catch (e) { /* noop */ }
    }
    return sym;
  }

  function message() {
    return symbolName(waitingFor) + " 시세를 받는 중입니다. 잠시 뒤에 주문할 수 있습니다.";
  }

  /* 칸을 비운 이유. 회원이 그 칸에 다시 입력할 때까지 남습니다.
     여러 칸을 비웠으면 한 줄에 모아 적습니다 — 안내가 세 줄로 늘어나지 않게. */
  function clearedMessage() {
    if (cleared.length === 0) return "";
    var parts = [];
    for (var i = 0; i < cleared.length; i++) parts.push(cleared[i].label + " " + cleared[i].value);
    return "종목이 " + symbolName(clearedFor) + " 로 바뀌어 " + parts.join(" · ") +
      " 을(를) 지웠습니다. 새 종목 가격으로 다시 입력해 주세요.";
  }

  function clearedValueOf(id) {
    for (var i = 0; i < cleared.length; i++) if (cleared[i].id === id) return cleared[i].value;
    return null;
  }

  /* 회원이 그 칸을 다시 채웠으면 안내에서 뺍니다. */
  function forgetCleared(id) {
    var before = cleared.length;
    var out = [];
    for (var i = 0; i < cleared.length; i++) if (cleared[i].id !== id) out.push(cleared[i]);
    cleared = out;
    if (cleared.length === 0) clearedFor = null;
    return cleared.length !== before;
  }

  /* 안내 칸에 지금 보여줄 줄들 */
  function noticeLines() {
    var out = [];
    if (stale) out.push(message());
    var c = clearedMessage();
    if (c) out.push(c);
    return out;
  }

  function isStale() { return stale; }

  /* ------------------------------------------------------------------
   * 창 열기 / 닫기
   * ------------------------------------------------------------------ */
  function toSymbol(v) {
    if (typeof v === "string") return v;
    if (v && typeof v === "object" && isSym(v.symbol)) return v.symbol;
    return null;
  }

  function open(symbol) {
    var target = toSymbol(symbol) || activeSymbol();
    if (!isSym(target)) return;
    waitingFor = target;
    if (!stale) {
      stale = true;
      since = Date.now();
      counts.windows++;
    }
    clearOrderbookPrices();
    clearPriceFields();
    paint();
  }

  function close() {
    if (!stale) return;
    counts.lastWindowMs = Date.now() - since;
    stale = false;
    waitingFor = null;
    paint();
  }

  /* 새 종목의 첫 시세가 오면 창을 닫습니다. 타이머로 풀지 않습니다. */
  function onPrice(payload) {
    if (!stale) return;
    if (!payload || !isSym(payload.symbol)) return;
    if (payload.symbol !== waitingFor) return;
    close();
  }

  /* ------------------------------------------------------------------
   * [A] 호가창에 남은 옛 종목 값 지우기
   * ------------------------------------------------------------------
   * js/symbol-stream-switch.js 의 blankRows() 가 글자는 지우지만
   * dataset.price 는 남깁니다. 그 값을 js/order-info-panel.js:63,68 이
   * 읽어 매수가격·매도가격 칸에 옛 종목 숫자를 그대로 보여줍니다.
   * ------------------------------------------------------------------ */
  function clearOrderbookPrices() {
    if (typeof document === "undefined" || !document.querySelectorAll) return;
    var rows;
    try {
      rows = document.querySelectorAll("#ob-asks > *, #ob-bids > *");
    } catch (e) {
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r && r.dataset && r.dataset.price !== undefined) {
        delete r.dataset.price;
        counts.clearedRows++;
      }
    }
  }

  /* ------------------------------------------------------------------
   * 🔴 [P1 후속] 지정가 주문가격 칸을 비웁니다 (2026-08-27 점검팀 라이브)
   * ------------------------------------------------------------------
   * 위의 잠금은 "새 종목 첫 시세 도착" 에 풀립니다(약 4초). 그런데 지정가
   * 칸에는 회원이 Last 버튼 등으로 채워둔 "옛 종목 가격" 이 그대로 남아
   * 있어서, 잠금이 풀린 뒤 그 값 그대로 주문이 통과합니다.
   * 즉 위험 창이 4초가 아니라 무기한이었습니다.
   *
   *   라이브 실측(1440) — 비트코인에서 Last 로 78,758 을 채우고 SK하이닉스로 전환
   *       +1.5초 / +5.5초 / +15.5초   주문가격 78,758.00 그대로 (62.9배)
   *
   *   그 상태로 주문이 들어가면 js/trading.js:279 가
   *       const fillPrice = order.price;   ← 지정가 "그대로" 체결
   *   를 씁니다. 시장가로 안 바뀝니다. 하네스 실측 —
   *       지정가 78,758 → 진입가 78,758 → 같은 틱에 강제청산
   *       손익 −1,000 USDT (증거금 전액). 실현손익이라 랭킹·계급에 들어갑니다.
   *
   * 그래서 종목이 바뀌면 그 칸을 비웁니다. 회원이 직접 친 값이라도 종목이
   * 바뀌면 의미가 없으므로 비우는 것이 맞습니다.
   * ⛔ 조용히 지우지 않습니다 — 무엇을 왜 지웠는지 안내 칸에 남깁니다.
   *
   * ------------------------------------------------------------------
   * 🔴 [P2 조용한 고장] 익절가(TP)·손절가(SL) 칸도 같이 비웁니다
   *    (2026-08-27, 본부장 배정)
   * ------------------------------------------------------------------
   * 지정가 칸과 정확히 같은 자리입니다. 다만 터지는 모양이 다릅니다.
   *
   *   비트코인(78,758) 화면에서 TP 78,900 / SL 78,600 을 채워두고
   *   SK하이닉스로 전환 → 매수
   *       진입가  1,253.2   (정상 — 위의 잠금이 옛 가격을 막습니다)
   *       tp      78,900    ← 남습니다. 롱인데 실제가 1,253 이라 영영 도달 못 함
   *       sl      null      ← js/tpsl-guard.js + js/trading.js 가 방향으로 걸러냄
   *
   * 즉시 청산이 나지는 않습니다. 대신 "익절을 걸어뒀는데 영영 안 걸리는"
   * 조용한 고장이 남습니다. 회원은 익절이 걸려 있다고 믿고 판단합니다.
   * (화면에도 tp 78,900 이 그대로 보입니다 — 고장인 줄 모릅니다.)
   *
   * 세 칸을 같은 규칙으로 다룹니다 — CLEARABLE 목록 하나로 묶었습니다.
   * ------------------------------------------------------------------ */
  function clearPriceFields() {
    for (var i = 0; i < CLEARABLE.length; i++) clearOneField(CLEARABLE[i]);
  }

  function clearOneField(spec) {
    var input = el(spec.id);
    if (!input) return;
    var v = String(input.value === undefined || input.value === null ? "" : input.value).trim();
    if (!v) return;

    forgetCleared(spec.id);            // 같은 칸이면 마지막 값만 기억합니다
    cleared.push({ id: spec.id, label: spec.label, value: v });
    clearedFor = waitingFor;
    counts[spec.counter]++;
    counts.clearedFields++;
    selfEdit = true;
    try {
      input.value = "";
      /* 파생값(증거금·수량)을 다시 계산하게 알려줍니다 — js/qty-price-order.js 가 듣습니다.
         안 쏘면 칸만 비고 그 아래 숫자는 옛 가격으로 계산된 채 남습니다. */
      if (typeof window.Event === "function") {
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      }
    } catch (e) {
      /* 이벤트를 못 쏘더라도 값은 이미 비웠습니다 */
    } finally {
      selfEdit = false;
    }
  }

  function isClearableId(id) {
    for (var i = 0; i < CLEARABLE.length; i++) if (CLEARABLE[i].id === id) return true;
    return false;
  }

  /* 회원이 그 칸에 다시 입력하면 그 칸 안내만 거둡니다.
     (호가창을 눌러 TP 를 채우는 경로도 여기로 옵니다 — js/orderbook.js:242 가
      같은 input 이벤트를 bubbles 로 쏩니다.) */
  function onAnyInput(e) {
    if (selfEdit) return;
    var t = e && e.target;
    if (!t || !t.id || !isClearableId(t.id)) return;
    if (!forgetCleared(t.id)) return;
    paint();
  }

  var inputHooked = false;
  function hookInput() {
    if (inputHooked || typeof document === "undefined" || !document.addEventListener) return false;
    document.addEventListener("input", onAnyInput, true);
    inputHooked = true;
    return true;
  }

  /* ------------------------------------------------------------------
   * 화면 — 버튼 잠그고 이유를 보여줍니다
   * ------------------------------------------------------------------ */
  function el(id) {
    return typeof document !== "undefined" && document.getElementById ? document.getElementById(id) : null;
  }

  /* 우리가 잠근 버튼만 기억합니다 — 원래부터 못 누르던 버튼은 안 건드립니다. */
  var lockedBtns = [];

  function lockButtons() {
    ["btn-long", "btn-short"].forEach(function (id) {
      var b = el(id);
      if (!b || b.disabled) return;
      b.disabled = true;
      b.setAttribute("data-stale-locked", "1");
      lockedBtns.push(b);
    });
  }

  function unlockButtons() {
    lockedBtns.forEach(function (b) {
      if (b.getAttribute("data-stale-locked") === "1") {
        b.disabled = false;
        b.removeAttribute("data-stale-locked");
      }
    });
    lockedBtns = [];
  }

  /* 안내는 별도 칸에 띄웁니다.
     · #order-err 은 주문 오류(빨강)용이라 "기다리는 중" 안내에 쓰지 않습니다
       (확정 팔레트 — 빨강은 손익 표시에만).
     · style.css 는 다른 팀이 만지고 있어 인라인으로만 칠합니다.
       색은 확정 팔레트 값 그대로입니다(카드안타일 · 테두리 · 포인트). */
  function ensureNotice() {
    var box = el(NOTICE_ID);
    if (box) return box;
    var anchor = el("order-err");
    if (!anchor || !anchor.parentNode) return null;
    box = document.createElement("div");
    box.id = NOTICE_ID;
    box.setAttribute("role", "status");
    box.style.cssText =
      "display:none;margin:6px 0 0;padding:7px 9px;border-radius:10px;" +
      "background:#0D1422;border:1px solid #1D273B;color:#F0B429;" +
      "font-size:12px;line-height:1.45;";
    anchor.parentNode.insertBefore(box, anchor);
    return box;
  }

  function paint() {
    var box = ensureNotice();
    if (stale) lockButtons();
    else unlockButtons();

    if (!box) return;
    var lines = noticeLines();
    if (lines.length === 0) {
      box.textContent = "";
      box.style.display = "none";
      return;
    }
    /* 여러 줄이면 줄바꿈해서 보여줍니다(innerHTML 안 씁니다). */
    box.textContent = "";
    for (var i = 0; i < lines.length; i++) {
      if (i > 0) box.appendChild(document.createElement("br"));
      box.appendChild(document.createTextNode(lines[i]));
    }
    box.style.display = "";
  }

  /* ------------------------------------------------------------------
   * 1) getSnapshot — 그 창 동안 currentPrice 는 null 입니다
   * ------------------------------------------------------------------ */
  function wrapSnapshot() {
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return false;
    if (App.Trading.getSnapshot.__staleGuard) return true;
    var orig = App.Trading.getSnapshot;
    var wrapped = function () {
      var s = orig.apply(App.Trading, arguments);
      if (!stale || !s || typeof s !== "object") return s;
      if (s.currentPrice === null || s.currentPrice === undefined) return s;
      counts.nulledSnapshots++;
      /* 원본 객체를 고치지 않고 얕은 사본을 줍니다 — 엔진 내부 값은 그대로입니다. */
      var out = {};
      for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out[k] = s[k];
      out.currentPrice = null;
      return out;
    };
    wrapped.__staleGuard = true;
    App.Trading.getSnapshot = wrapped;
    return true;
  }

  /* ------------------------------------------------------------------
   * 2) 주문 자체를 거절합니다 (돈이 나가는 마지막 문)
   * ------------------------------------------------------------------ */
  function wrapOrders() {
    if (!App.Trading) return false;
    if (App.Trading.__staleGuardOrders) return true;
    var okAny = false;

    [["openPosition", "blockedMarket"], ["placeLimitOrder", "blockedLimit"]].forEach(function (pair) {
      var name = pair[0];
      var counter = pair[1];
      var orig = App.Trading[name];
      if (typeof orig !== "function" || orig.__staleGuard) return;
      var wrapped = function () {
        if (stale) {
          counts.blockedOrders++;
          counts[counter]++;
          var msg = message();
          console.warn("[stale-price-guard.js] " + name + " 을 막았습니다 — " + msg);
          paint();
          /* js/ui.js:713-714 가 이 문구를 그대로 화면에 띄웁니다(무수정). */
          return { ok: false, error: msg };
        }
        return orig.apply(App.Trading, arguments);
      };
      wrapped.__staleGuard = true;
      App.Trading[name] = wrapped;
      okAny = true;
    });

    if (okAny) App.Trading.__staleGuardOrders = true;
    return okAny;
  }

  /* ------------------------------------------------------------------ */
  var wired = false;
  function wireBus() {
    if (wired) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("symbol:change", function (p) { open(p); });
    App.Bus.on("price:update", onPrice);
    wired = true;
    return true;
  }

  function tryAll() {
    var a = wireBus();
    var b = wrapSnapshot();
    var c = wrapOrders();
    var d = hookInput();
    return a && b && c && d;
  }

  function init() {
    if (!tryAll()) {
      var tries = 0;
      var t = setInterval(function () {
        if (tryAll() || ++tries > 200) clearInterval(t);
      }, 50);
    }
    if (typeof document !== "undefined") {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", paint);
      } else {
        paint();
      }
    }
  }

  init();

  return {
    init: init,
    isStale: isStale,
    getWaitingFor: function () { return waitingFor; },
    message: message,
    getCounts: function () {
      var o = {};
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) o[k] = counts[k];
      return o;
    },
    getElapsedMs: function () { return stale ? Date.now() - since : 0; },
    getClearedPrice: function () { return clearedValueOf(LIMIT_INPUT_ID); },
    getClearedTp: function () { return clearedValueOf(TP_INPUT_ID); },
    getClearedSl: function () { return clearedValueOf(SL_INPUT_ID); },
    getCleared: function () {
      var out = [];
      for (var i = 0; i < cleared.length; i++) {
        out.push({ id: cleared[i].id, label: cleared[i].label, value: cleared[i].value });
      }
      return out;
    },
    clearedMessage: clearedMessage,
    noticeLines: noticeLines,
    _open: open,
    _close: close,
    _reset: function () {
      stale = false;
      waitingFor = null;
      cleared = [];
      clearedFor = null;
      for (var k in counts) if (Object.prototype.hasOwnProperty.call(counts, k)) counts[k] = 0;
      unlockButtons();
    },
    NOTICE_ID: NOTICE_ID
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.StalePriceGuard;
