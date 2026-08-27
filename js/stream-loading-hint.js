/* =========================================================================
 * js/stream-loading-hint.js — App.StreamLoadingHint
 * =========================================================================
 * "값이 아직 안 왔다" 를 회원에게 보여줍니다.
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────────────
 * 종목을 바꾸면 시세 칸이 전부 "-" 로 비고, 새 값이 올 때까지 3~8초
 * (거래가 뜸한 종목은 12초까지) 아무 설명이 없습니다.
 * 회원은 "고장났나" 와 "아직 안 왔나" 를 구분할 수 없습니다.
 *
 * 실측(1440, 2026-08-27, 네 종목 전환 각 1회):
 *   나스닥     마크·펀딩 3,465ms  현재가 3,569ms  24H 4칸 4,602ms
 *   삼성전자   마크·펀딩 3,610ms  현재가 4,811ms  24H 4칸 5,198ms
 *   SK하이닉스 현재가   3,332ms  마크·펀딩 3,814ms 24H 4칸 5,137ms
 *   비트코인   마크·펀딩 3,451ms  현재가 3,800ms  24H 4칸 4,714ms
 * → 칸마다 도착 시각이 다릅니다. 그래서 칸마다 따로 꺼집니다.
 *
 * ── 무엇을 얹었나 ─────────────────────────────────────────────────────
 *  1) 칸별 자리표시 막대 — 아직 안 온 칸만 얇은 회색 막대가 흐릅니다.
 *     값이 들어오는 즉시 그 칸만 원래대로 돌아옵니다.
 *  2) 연결 상태 알림칩 — 바이낸스가 "Stable connection" 을 한 곳에
 *     띄우는 것과 같은 역할입니다. 빈 칸을 봐도 "연결은 멀쩡하다" 를
 *     한 곳에서 보증합니다. 전부 도착하면 "연결됨" 을 잠깐 보여주고
 *     스스로 사라집니다.
 *
 * ── 정상(늦게 옴)과 진짜 고장을 어떻게 가르나 ─────────────────────────
 *   0~8초    회색 · "시세 받는 중 (n/9)"       ← 실측 범위(3.3~5.2초) 안. 정상
 *   8~15초   금색 · "시세가 늦습니다 · 다시 연결 중"
 *                                              ← symbol-stream-switch 의
 *                                                SOFT_MS(8000) 과 같은 선
 *   15초~    js/symbol-stream-switch.js 의 기존 경고창이 이어받습니다
 *            (CHECK_MS 15000). 알림칩은 금색으로 남습니다
 *   30초~    자리표시 막대를 끕니다 (GIVEUP_MS 와 같은 선)
 *   ws:status "stale"(6초 무신호) 은 즉시 금색 고장 문구
 *   ws:status "closed" 는 2.5초 유예 뒤에만 고장 문구
 *            (봉 간격을 바꾸면 소켓이 일부러 닫혔다 곧 열립니다 —
 *             그것까지 고장이라 하면 거짓 경보가 됩니다)
 *
 * ── 색 ────────────────────────────────────────────────────────────────
 * 확정 팔레트만 씁니다. 기다리는 중은 보조 #838DA4(조용한 회색),
 * 도착 완료는 상승 #26C281, 지연·끊김은 포인트 #F0B429.
 * 빨강(#F0506E)은 쓰지 않습니다 — 팔레트상 손익 표시 전용입니다.
 * 이모지도 안 씁니다. "오류" 라는 말도 안 씁니다(고장이 아니라 아직 안 온 것).
 *
 * ── 어느 파일도 안 건드립니다 ─────────────────────────────────────────
 * js/websocket.js · js/chart.js · js/orderbook.js 는 수정 금지 파일이고,
 * js/symbol-stream-switch.js 는 수리팀이 고치는 중이라 손대지 않습니다.
 * 여기서는 App.Bus 의 symbol:change · ws:status 신호만 받아 읽고,
 * 칸이 실제로 채워졌는지는 그 칸의 글자를 직접 보고 판단합니다
 * (MutationObserver). 그래서 어느 모듈이 값을 쓰든 상관없습니다.
 * CSS 도 style.css 에 넣지 않고 이 파일이 <style> 로 직접 넣습니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * index.html 의 <script src="js/stream-loading-hint.js"></script> 한 줄을
 * 지우면 끝입니다. 다른 파일에 남는 흔적이 없습니다.
 * ========================================================================= */
window.App = window.App || {};

App.StreamLoadingHint = (function () {
  "use strict";

  /* ── 확정 팔레트 ───────────────────────────────────────────────── */
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_SUB = "#838DA4";
  var C_UP = "#26C281";
  var C_GOLD = "#F0B429";

  /* ── 시각 기준선 (symbol-stream-switch.js 와 같은 선에 맞춥니다) ── */
  var SLOW_MS = 8000; /* 여기부터 "늦습니다" (SOFT_MS) */
  var STOP_BAR_MS = 30000; /* 여기서 자리표시 막대를 끕니다 (GIVEUP_MS) */
  var OK_HOLD_MS = 1500; /* "연결됨" 을 보여주는 시간 */
  var CLOSED_GRACE_MS = 2500; /* 봉 간격 바꿀 때 소켓이 잠깐 닫히는 것은 무시 */
  var FIND_TRY = 60; /* 늦게 생기는 칸을 찾는 횟수 (60 x 250ms = 15초) */
  var FIND_EVERY_MS = 250;

  /* ── 지켜보는 칸 ───────────────────────────────────────────────
     stat-funding · stat-mark-price 는 js/chart.js 가 나중에 만듭니다.
     그래서 처음에 못 찾으면 계속 찾습니다. */
  var CELL_IDS = [
    "stat-price",
    "stat-change",
    "stat-high",
    "stat-low",
    "stat-volume",
    "stat-funding",
    "stat-mark-price",
    "ob-current-price",
    "ob-mark-price",
  ];

  var STYLE_ID = "tl-stream-loading-hint-style";
  var CHIP_ID = "tl-stream-hint";

  var cells = []; /* { id, el, observer, waiting, lastW } */
  var chip = null;
  var chipDot = null;
  var chipText = null;

  var armedAt = 0;
  var chipState = ""; /* "" | wait | slow | ok | fault */
  var okTimer = null;
  var slowTimer = null;
  var stopBarTimer = null;
  var closedTimer = null;
  var faultReason = "";
  var started = false;

  /* 실측용 기록 — 브라우저 콘솔에서 App.StreamLoadingHint.getLog() */
  var log = { armedAt: 0, symbol: "", arrivals: {} };

  /* ------------------------------------------------------------------
   * 1) CSS — style.css 를 건드리지 않으려고 여기서 직접 넣습니다
   * ------------------------------------------------------------------ */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = [
      /* 아직 안 온 칸 — 글자는 안 보이게 하고 그 자리에 얇은 막대를 흘립니다.
         막대는 position:absolute 라 흐름에서 빠집니다 → 줄 높이가 안 변합니다
         (칸이 위아래로 튀는 것을 막습니다). 가로 폭은 JS 가 min-width 로
         미리 잡아둡니다(아래 rememberWidth 설명 참조). */
      "[data-tl-wait='1']{color:transparent!important;position:relative;}",
      "[data-tl-wait='1']::after{content:'';position:absolute;left:0;top:50%;" +
        "transform:translateY(-50%);width:100%;min-width:34px;" +
        "height:11px;border-radius:4px;pointer-events:none;" +
        "background-color:" +
        C_TILE +
        ";background-image:linear-gradient(90deg," +
        C_TILE +
        " 0%," +
        C_BORDER +
        " 50%," +
        C_TILE +
        " 100%);background-size:220% 100%;" +
        "animation:tl-wait-flow 1.5s linear infinite;}",
      "@keyframes tl-wait-flow{0%{background-position:220% 0}100%{background-position:-220% 0}}",

      /* 마크가격 <b> 는 inline 이라 min-width 가 안 먹습니다 — 잠깐만 블록으로 */
      "#ob-mark-price[data-tl-wait='1']{display:inline-block;}",

      /* 현재가 줄은 '현재가 -' 라 라벨까지 같이 지워집니다.
         글자를 0 으로 접고 라벨을 다시 그려 넣습니다. 높이는 JS 가
         minHeight 로 붙잡아 두어서 줄이 안 줄어듭니다. */
      "#ob-current-price[data-tl-wait='1']{font-size:0!important;}",
      "#ob-current-price[data-tl-wait='1']::before{content:'현재가';color:" +
        C_SUB +
        ";font-size:14px;font-weight:400;vertical-align:middle;margin-right:8px;}",
      "#ob-current-price[data-tl-wait='1']::after{position:static;transform:none;" +
        "display:inline-block;vertical-align:middle;width:104px;min-width:104px;height:13px;}",

      /* 연결 상태 알림칩.
         ⭐ 차트를 절대 가리지 않으려고 화면 고정(fixed)을 쓰지 않습니다.
         봉 간격 줄(#interval-row) 의 빈 자리에 문서 좌표로 얹습니다.
         그 줄은 시세 바 바로 아래·차트 바로 위라, 칸이 비는 것을 보는
         회원의 눈이 이미 가 있는 자리입니다. 자리를 차지하지 않으므로
         (position:absolute) 차트가 아래로 밀리지도 않습니다. */
      "#" +
        CHIP_ID +
        "{position:absolute;left:0;top:0;z-index:60;display:none;" +
        "align-items:center;gap:7px;box-sizing:border-box;" +
        "background:" +
        C_CARD +
        ";border:1px solid " +
        C_BORDER +
        ";border-radius:10px;color:" +
        C_TEXT +
        ";font-size:12px;line-height:1.35;padding:6px 10px;" +
        "box-shadow:none;pointer-events:none;opacity:0;transition:opacity .22s linear;}",
      "#" + CHIP_ID + ".tl-on{display:flex;opacity:1;}",
      "#" +
        CHIP_ID +
        " .tl-sh-dot{flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:" +
        C_SUB +
        ";}",
      "#" + CHIP_ID + " .tl-sh-text{white-space:nowrap;}",
      "#" +
        CHIP_ID +
        ".tl-wait .tl-sh-dot{background:" +
        C_SUB +
        ";animation:tl-dot-breathe 1.5s ease-in-out infinite;}",
      "#" + CHIP_ID + ".tl-wait .tl-sh-text{color:" + C_SUB + ";}",
      "#" + CHIP_ID + ".tl-ok .tl-sh-dot{background:" + C_UP + ";}",
      "#" + CHIP_ID + ".tl-ok .tl-sh-text{color:" + C_SUB + ";}",
      "#" + CHIP_ID + ".tl-slow{border-color:" + C_GOLD + ";}",
      "#" +
        CHIP_ID +
        ".tl-slow .tl-sh-dot{background:" +
        C_GOLD +
        ";animation:tl-dot-breathe 1.5s ease-in-out infinite;}",
      "#" + CHIP_ID + ".tl-slow .tl-sh-text{color:" + C_TEXT + ";}",
      "#" + CHIP_ID + ".tl-fault{border-color:" + C_GOLD + ";}",
      "#" + CHIP_ID + ".tl-fault .tl-sh-dot{background:" + C_GOLD + ";}",
      "#" + CHIP_ID + ".tl-fault .tl-sh-text{color:" + C_TEXT + ";}",
      "@keyframes tl-dot-breathe{0%,100%{opacity:1}50%{opacity:.3}}",

      /* 움직임을 싫어하는 회원 설정을 존중합니다 */
      "@media (prefers-reduced-motion:reduce){[data-tl-wait='1']::after{animation:none}" +
        "#" +
        CHIP_ID +
        " .tl-sh-dot{animation:none!important}}",
    ].join("\n");
    (document.head || document.documentElement).appendChild(s);
  }

  /* ------------------------------------------------------------------
   * 2) 알림칩
   * ------------------------------------------------------------------ */
  function ensureChip() {
    if (chip && chip.isConnected) return chip;
    chip = document.createElement("div");
    chip.id = CHIP_ID;
    chip.setAttribute("role", "status");
    chip.setAttribute("aria-live", "polite");
    chipDot = document.createElement("span");
    chipDot.className = "tl-sh-dot";
    chipText = document.createElement("span");
    chipText.className = "tl-sh-text";
    chip.appendChild(chipDot);
    chip.appendChild(chipText);
    document.body.appendChild(chip);
    return chip;
  }

  function setChip(state, text) {
    ensureChip();
    if (okTimer) {
      clearTimeout(okTimer);
      okTimer = null;
    }
    chipState = state;
    chip.className = "";
    if (!state) {
      chip.classList.remove("tl-on");
      return;
    }
    chipText.textContent = text;
    chip.classList.add("tl-on", "tl-" + state);
    placeChip();
  }

  /* 알림칩 자리 잡기 — 봉 간격 줄의 마지막 버튼 오른쪽 빈 자리에 놓습니다.
     문서 좌표(position:absolute)라 페이지와 같이 스크롤되고,
     흐름에서 빠져 있어 차트를 아래로 밀지 않습니다.
     실측 — 1440: 마지막 버튼(1일) 오른쪽으로 994px 이 빕니다.
            360 : 줄이 두 줄로 접히고 둘째 줄 오른쪽으로 205px 이 빕니다. */
  function placeChip() {
    if (!chip || !chip.classList.contains("tl-on")) return;
    var row = document.getElementById("interval-row");
    var rr = row ? row.getBoundingClientRect() : null;
    /* 봉 간격 줄이 없거나 안 보이면(차트 전체화면 등) 알림칩도 숨깁니다.
       엉뚱한 자리에 남아 차트를 가리는 것을 막습니다. */
    if (!rr || rr.width <= 0 || rr.height <= 0) {
      chip.classList.remove("tl-on");
      return;
    }
    var sx = window.pageXOffset || 0;
    var sy = window.pageYOffset || 0;

    /* 마지막 줄에 있는 버튼을 찾습니다 (줄이 접히면 둘째 줄이 됩니다) */
    var last = null;
    for (var i = 0; i < row.children.length; i++) {
      var b = row.children[i].getBoundingClientRect();
      if (b.width <= 0) continue;
      if (
        !last ||
        b.bottom > last.bottom + 1 ||
        (Math.abs(b.bottom - last.bottom) <= 1 && b.right > last.right)
      ) {
        last = b;
      }
    }
    var lineTop = last ? last.top : rr.top;
    var lineH = last ? last.height : rr.height;
    var freeFrom = last ? last.right + 10 : rr.left;

    chip.style.maxWidth = Math.max(120, Math.round(rr.right - rr.left)) + "px";
    var w = chip.offsetWidth;
    var h = chip.offsetHeight;
    /* 마지막 버튼 바로 오른쪽에 붙입니다(줄의 일부처럼 읽히게).
       그 자리에 안 들어가면 줄 오른쪽 끝에 맞춥니다. */
    var left = freeFrom;
    if (left + w > rr.right) left = Math.max(rr.left, rr.right - w);
    chip.style.left = Math.round(left + sx) + "px";
    chip.style.top = Math.round(lineTop + sy + (lineH - h) / 2) + "px";
  }

  function hideChip() {
    chipState = "";
    if (!chip) return;
    chip.classList.remove("tl-on");
  }

  function waitingCount() {
    var n = 0;
    for (var i = 0; i < cells.length; i++) if (cells[i].waiting) n++;
    return n;
  }

  function refreshChip() {
    if (faultReason) return; /* 고장 문구가 우선입니다 */
    var left = waitingCount();
    if (left === 0) {
      if (armedAt === 0) return;
      armedAt = 0;
      clearTimers();
      setChip("ok", "연결됨");
      okTimer = setTimeout(hideChip, OK_HOLD_MS);
      return;
    }
    var done = cells.length - left;
    var slow = chipState === "slow" || (armedAt && Date.now() - armedAt >= SLOW_MS);
    /* 숫자(n/9)를 같이 적습니다 — 멈춰 있는 것과 진행 중인 것을 회원이
       눈으로 구분할 수 있는 유일한 단서입니다. */
    if (slow) {
      setChip("slow", "시세가 늦습니다 · 다시 연결 중 (" + done + "/" + cells.length + ")");
    } else {
      setChip("wait", "시세 받는 중 (" + done + "/" + cells.length + ")");
    }
  }

  function clearTimers() {
    if (slowTimer) {
      clearTimeout(slowTimer);
      slowTimer = null;
    }
    if (stopBarTimer) {
      clearTimeout(stopBarTimer);
      stopBarTimer = null;
    }
  }

  /* ------------------------------------------------------------------
   * 3) 칸 — "숫자가 들어왔나" 는 그 칸의 글자를 직접 보고 판단합니다.
   *    어느 모듈이 값을 쓰든(orderbook.js 는 300ms 로 묶어서 씁니다)
   *    화면에 실제로 보이는 것과 어긋나지 않습니다.
   * ------------------------------------------------------------------ */
  function hasValue(el) {
    return /[0-9]/.test(el.textContent || "");
  }

  /* 값이 들어 있을 때의 칸 너비를 기억해 둡니다.
     "-" 한 글자만 남으면 칸이 5px 로 쪼그라들어서, 막대가 옆 칸 라벨 위로
     삐져나갑니다(1440 실측에서 실제로 그랬습니다). 그래서 기다리는 동안
     "곧 들어올 값이 쓸 만큼" 을 min-width 로 미리 잡아둡니다.
     값이 도착해도 폭이 그대로라 화면이 튀지 않습니다. */
  function rememberWidth(cell) {
    var w = cell.el.getBoundingClientRect().width;
    if (w > 8) cell.lastW = w;
  }

  function markWaiting(cell) {
    if (cell.waiting) return;
    if (hasValue(cell.el)) rememberWidth(cell);
    cell.waiting = true;
    if (cell.id === "ob-current-price") {
      /* 글자를 0 으로 접기 전에 지금 높이를 붙잡아 둡니다 (줄이 안 줄어들게) */
      var h = cell.el.offsetHeight;
      if (h > 0) cell.el.style.minHeight = h + "px";
    } else {
      var w = Math.min(Math.max(cell.lastW || 56, 34), 150);
      cell.el.style.minWidth = Math.round(w) + "px";
    }
    cell.el.setAttribute("data-tl-wait", "1");
    watch(cell);
  }

  function unmark(cell) {
    cell.el.removeAttribute("data-tl-wait");
    if (cell.id === "ob-current-price") cell.el.style.minHeight = "";
    else cell.el.style.minWidth = "";
  }

  function markArrived(cell) {
    if (!cell.waiting) return;
    cell.waiting = false;
    unmark(cell);
    rememberWidth(cell);
    unwatch(cell);
    if (armedAt) log.arrivals[cell.id] = Date.now() - armedAt;
    refreshChip();
  }

  /* 막대만 끄고(30초) 알림칩은 계속 설명합니다 */
  function stopBars() {
    for (var i = 0; i < cells.length; i++) {
      if (!cells[i].waiting) continue;
      unmark(cells[i]);
    }
  }

  function watch(cell) {
    if (cell.observer || typeof MutationObserver !== "function") return;
    cell.observer = new MutationObserver(function () {
      if (!cell.waiting) return;
      if (hasValue(cell.el)) markArrived(cell);
    });
    cell.observer.observe(cell.el, { childList: true, characterData: true, subtree: true });
  }

  function unwatch(cell) {
    if (!cell.observer) return;
    cell.observer.disconnect();
    cell.observer = null;
  }

  function byId(id) {
    for (var i = 0; i < cells.length; i++) if (cells[i].id === id) return cells[i];
    return null;
  }

  function findCells() {
    var tries = 0;
    var t = setInterval(function () {
      for (var i = 0; i < CELL_IDS.length; i++) {
        var id = CELL_IDS[i];
        if (byId(id)) continue;
        var el = document.getElementById(id);
        if (!el) continue;
        var cell = { id: id, el: el, observer: null, waiting: false, lastW: 0 };
        cells.push(cell);
        if (hasValue(el)) {
          rememberWidth(cell);
          continue;
        }
        /* 지금 비어 있으면(첫 접속 직후) 바로 기다림 표시 */
        if (!armedAt) {
          armedAt = Date.now();
          log.armedAt = armedAt;
          log.arrivals = {};
          slowTimer = setTimeout(function () {
            if (waitingCount() > 0) refreshChip();
          }, SLOW_MS + 30);
          stopBarTimer = setTimeout(stopBars, STOP_BAR_MS);
        }
        markWaiting(cell);
        refreshChip();
      }
      if (++tries >= FIND_TRY || cells.length === CELL_IDS.length) clearInterval(t);
    }, FIND_EVERY_MS);
  }

  /* ------------------------------------------------------------------
   * 4) 전환 시작 — 모든 칸을 기다림으로 돌립니다
   * ------------------------------------------------------------------ */
  function arm(symbol) {
    clearTimers();
    armedAt = Date.now();
    log.armedAt = armedAt;
    log.symbol = symbol || "";
    log.arrivals = {};
    for (var i = 0; i < cells.length; i++) markWaiting(cells[i]);
    slowTimer = setTimeout(function () {
      if (waitingCount() > 0) refreshChip();
    }, SLOW_MS + 30);
    stopBarTimer = setTimeout(stopBars, STOP_BAR_MS);
    refreshChip();
  }

  /* ------------------------------------------------------------------
   * 5) 진짜 고장 — ws:status
   * ------------------------------------------------------------------ */
  function onWsStatus(p) {
    var state = p && p.state;
    if (state === "stale") {
      if (closedTimer) {
        clearTimeout(closedTimer);
        closedTimer = null;
      }
      faultReason = "stale";
      setChip("fault", "시세 신호가 끊겼습니다 — 다시 연결하는 중");
      return;
    }
    if (state === "closed") {
      /* 봉 간격을 바꾸면 소켓이 일부러 닫혔다 곧 열립니다.
         그 짧은 닫힘까지 고장이라고 하면 거짓 경보가 됩니다. */
      if (closedTimer) return;
      closedTimer = setTimeout(function () {
        closedTimer = null;
        faultReason = "closed";
        setChip("fault", "시세 연결이 끊겼습니다 — 다시 연결하는 중");
      }, CLOSED_GRACE_MS);
      return;
    }
    /* open / connecting → 고장 해제 */
    if (closedTimer) {
      clearTimeout(closedTimer);
      closedTimer = null;
    }
    if (!faultReason) return;
    faultReason = "";
    if (waitingCount() > 0) refreshChip();
    else {
      setChip("ok", "연결됨");
      okTimer = setTimeout(hideChip, OK_HOLD_MS);
    }
  }

  /* ------------------------------------------------------------------
   * 6) 시작
   * ------------------------------------------------------------------ */
  function init() {
    if (started) return;
    started = true;
    injectStyle();
    ensureChip();
    findCells();
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("symbol:change", function (p) {
        arm((p && p.symbol) || "");
      });
      App.Bus.on("ws:status", onWsStatus);
    }
    /* 창 폭이 바뀌면 봉 간격 줄이 접혔다 펴집니다 — 알림칩도 따라갑니다 */
    window.addEventListener("resize", placeChip);

    /* 안전망 — 이벤트를 하나도 못 받는 상황에서도 화면 글자만 보고
       늦게 채워진 칸을 풀어줍니다. 1초에 한 번, 기다리는 칸이 있을 때만. */
    setInterval(function () {
      if (waitingCount() === 0) return;
      for (var i = 0; i < cells.length; i++) {
        if (cells[i].waiting && hasValue(cells[i].el)) markArrived(cells[i]);
      }
      placeChip();
    }, 1000);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
  }

  return {
    init: init,
    /* 실측·테스트용 */
    getLog: function () {
      return { armedAt: log.armedAt, symbol: log.symbol, arrivals: log.arrivals };
    },
    getState: function () {
      return {
        chip: chipState,
        fault: faultReason,
        waiting: waitingCount(),
        total: cells.length,
        armedAt: armedAt,
      };
    },
    getCellIds: function () {
      return CELL_IDS.slice();
    },
    _arm: arm,
    _onWsStatus: onWsStatus,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.StreamLoadingHint;
