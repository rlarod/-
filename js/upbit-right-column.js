/* =========================================================================
 * js/upbit-right-column.js — App.UpbitRightColumn
 * =========================================================================
 * 업비트식 개편(★안 B★) 의 오른쪽 400px 열에 카드 두 개를 넣습니다.
 *
 *     1) 종목 목록 4줄   App.AllSymbolFeed 의 시세를 그대로 보여줍니다
 *     2) 내 포지션 요약   아래 주문창의 #position-card 글자를 ★비춰줍니다★
 *
 * ── ⛔ 숫자를 하나도 계산하지 않습니다 ───────────────────────────────────
 *   손익·수익률·등락률을 다시 계산하지 않습니다. 계산식은 대표 결재 항목입니다
 *   (docs/인계문서.md 3번). 등락률은 바이낸스가 보내준 값(P 필드)을 그대로,
 *   손익은 이미 화면에 그려진 글자를 그대로 가져옵니다.
 *
 * ── ⛔ 기존 DOM 을 옮기지 않습니다 ───────────────────────────────────────
 *   .page-right 맨 위에 새 카드 두 개를 ★끼워 넣기만★ 합니다.
 *   #ticker-board-panel(전광판)은 건드리지 않습니다 — 그쪽을 켜려면
 *   js/symbol-registry.js 의 isMock() 과 js/ticker-board.js:57 의 "준비중" 조건을
 *   먼저 고쳐야 하고(지금은 배지가 영원히 0개), 그러면
 *   tests/ticker-board-reality-seal.test.js 의 [현황] 기준이 빨개집니다(기록팀 건).
 *   그래서 ★전광판을 켜지 않고 새 목록을 따로★ 만들었습니다.
 *
 * ── ⚠ main.js 목록에서 "UI" ★뒤★ 에 둡니다 ─────────────────────────────
 *   App.UI.init() 이 historyPanel.innerHTML = "" 로 통째로 비웁니다.
 *   이 모듈은 포지션 글자를 읽으므로 UI 가 자리를 다 잡은 뒤에 켜야 합니다.
 *
 * ── ⚠ "아직 안 옴(null)" 과 "진짜 0" 을 구분해서 보여줍니다 ─────────────
 *   이 프로젝트에서 가장 자주 난 사고가 ★조용한 고장★ 입니다.
 *   그냥 "-" 만 두면 회원이 고장인 줄 모르고 그 화면을 사실로 믿습니다.
 *
 *     App.AllSymbolFeed.get(심볼) === null   아직 한 번도 안 왔습니다
 *                                            → "불러오는 중" + 아래 안내 한 줄
 *     .price === 0                           거래소가 진짜 0 을 보냈습니다
 *                                            → 숫자 0 을 그대로 보여줍니다
 *
 *   PM 라이브 실측 — 나스닥·삼성전자는 첫 값까지 ★약 40초★ 걸립니다
 *   (거래가 뜸해서 @ticker 가 드물게 옵니다). BTC·SK하이닉스는 10초 안입니다.
 *   소켓이 끊기면 allsymbol:status 로 closed 가 반드시 한 번 나오므로,
 *   그때는 "시세 연결이 끊겨 다시 붙는 중입니다" 를 적습니다(조용히 안 죽습니다).
 *
 * ── ⚠ js/market-data/binance-adapter.js 를 쓰지 않았습니다 ──────────────
 *   그쪽은 아직 BTC 만 봅니다.
 *   App.MarketData.getAdapter("QQQUSDT").getPrice() 는 지금도 null 입니다.
 *   그래서 App.Bus "allsymbol:ticker" 를 직접 듣습니다.
 *
 * ── 줄을 누르면 종목이 바뀝니다 ──────────────────────────────────────────
 *   새 전환 경로를 만들지 않았습니다. 상품탭의 종목 탭(js/symbol-tabs.js:119)과
 *   ★같은 통로★ 인 App.SymbolStreamSwitch.switchTo() 하나만 부릅니다.
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 의 <script src="js/upbit-right-column.js"></script> 한 줄과
 *   main.js 의 "UpbitRightColumn" 한 개를 지우면 카드 두 개가 사라집니다.
 * ========================================================================= */
(function () {
  "use strict";

  window.App = window.App || {};
  if (App.UpbitRightColumn) return;

  var SYM_CARD_ID = "tl-sym-list";
  var POS_CARD_ID = "tl-pos-card";
  var MIRROR_MS = 1000;   /* 포지션 글자 비추기 — Bus 를 놓쳤을 때의 그물 */

  var started = false;
  var feedState = "idle";

  /* ---------------- 작은 도구 ---------------- */

  function $(sel) { return document.querySelector(sel); }
  function id(v) { return document.getElementById(v); }
  function text(sel) {
    var n = $(sel);
    return n ? String(n.textContent || "").trim() : "";
  }

  /* 쉼표 형식만 입힙니다. 자릿수를 바꾸거나 반올림하지 않습니다. */
  function fmtPrice(v, decimals) {
    var d = typeof decimals === "number" ? decimals : 2;
    try {
      return Number(v).toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d
      });
    } catch (e) {
      return String(v);
    }
  }

  /* 바이낸스가 보내준 등락률(P)을 ★그대로★ 적습니다. 다시 계산하지 않습니다. */
  function fmtPercent(v) {
    var n = Number(v);
    if (!isFinite(n)) return "";
    var s = n.toFixed(2) + "%";
    return n > 0 ? "+" + s : s;
  }

  function symbols() {
    var reg = App.SymbolRegistry;
    if (!reg || typeof reg.getAll !== "function") return [];
    return reg.getAll();
  }

  function activeSymbol() {
    try {
      if (App.Config && typeof App.Config.getActiveSymbol === "function") {
        return App.Config.getActiveSymbol();
      }
    } catch (e) { /* noop */ }
    return "";
  }

  /* ---------------- 1) 종목 목록 ---------------- */

  function buildSymbolCard(right) {
    if (id(SYM_CARD_ID)) return id(SYM_CARD_ID);

    var card = document.createElement("div");
    card.className = "panel tl-sym-list";
    card.id = SYM_CARD_ID;

    /* 카드 제목을 따로 두지 않습니다 — 표 머리글(종목 | 현재가 | 등락률)이
       그 역할을 합니다. 둘 다 두면 "종목" 이 두 줄 연달아 나옵니다(1440 실측). */
    var table = document.createElement("table");
    table.className = "tl-sym-table";
    var thead = document.createElement("thead");
    var htr = document.createElement("tr");
    ["종목", "현재가", "등락률"].forEach(function (label) {
      var th = document.createElement("th");
      th.textContent = label;
      htr.appendChild(th);
    });
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = document.createElement("tbody");
    tbody.id = "tl-sym-body";
    symbols().forEach(function (s) {
      var tr = document.createElement("tr");
      tr.className = "tl-sym-row";
      tr.setAttribute("data-symbol", s.symbol);

      var tdName = document.createElement("td");
      tdName.className = "tl-sym-name";
      var kr = document.createElement("span");
      kr.className = "tl-sym-kr";
      kr.textContent = s.name;
      var code = document.createElement("span");
      code.className = "tl-sym-code";
      code.textContent = s.symbol;
      tdName.appendChild(kr);
      tdName.appendChild(code);

      var tdPrice = document.createElement("td");
      tdPrice.className = "tl-sym-price";
      var tdChg = document.createElement("td");
      tdChg.className = "tl-sym-chg";

      tr.appendChild(tdName);
      tr.appendChild(tdPrice);
      tr.appendChild(tdChg);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    card.appendChild(table);

    /* 값이 안 온 줄이 있을 때만 보이는 안내. 숫자를 지어내는 대신 말로 적습니다. */
    var note = document.createElement("div");
    note.className = "tl-sym-note";
    note.id = "tl-sym-note";
    note.hidden = true;
    card.appendChild(note);

    right.insertBefore(card, right.firstChild);

    /* 줄을 누르면 종목 전환 — 상품탭 종목 탭과 같은 통로(switchTo) 하나만 씁니다 */
    tbody.addEventListener("click", function (ev) {
      var t = ev.target;
      var tr = null;
      while (t && t !== tbody) {
        if (t.getAttribute && t.getAttribute("data-symbol")) { tr = t; break; }
        t = t.parentNode;
      }
      if (!tr) return;
      var sym = tr.getAttribute("data-symbol");
      if (!sym || sym === activeSymbol()) return;
      if (App.SymbolStreamSwitch && typeof App.SymbolStreamSwitch.switchTo === "function") {
        App.SymbolStreamSwitch.switchTo(sym);
      }
    });

    return card;
  }

  function renderSymbols() {
    var tbody = id("tl-sym-body");
    if (!tbody) return;
    var feed = App.AllSymbolFeed;
    var act = activeSymbol();
    var waiting = [];

    symbols().forEach(function (s) {
      var tr = tbody.querySelector('tr[data-symbol="' + s.symbol + '"]');
      if (!tr) return;
      var tdPrice = tr.cells[1];
      var tdChg = tr.cells[2];

      if (s.symbol === act) tr.className = "tl-sym-row is-active";
      else tr.className = "tl-sym-row";

      /* ★null 과 0 을 구분합니다★ — get() 이 null 이면 "아직 안 온" 것입니다 */
      var q = feed && typeof feed.get === "function" ? feed.get(s.symbol) : null;
      if (!q || q.price === null || q.price === undefined) {
        waiting.push(s.name);
        while (tdPrice.firstChild) tdPrice.removeChild(tdPrice.firstChild);
        var wait = document.createElement("span");
        wait.className = "tl-sym-wait";
        wait.textContent = "불러오는 중";
        tdPrice.appendChild(wait);
        tdChg.textContent = "";
        tdChg.className = "tl-sym-chg";
        return;
      }

      var decimals = s.spec && typeof s.spec.priceDecimals === "number" ? s.spec.priceDecimals : 2;
      tdPrice.textContent = fmtPrice(q.price, decimals);

      var p = Number(q.changePercent);
      if (!isFinite(p)) {
        tdChg.textContent = "";
        tdChg.className = "tl-sym-chg";
      } else {
        tdChg.textContent = fmtPercent(p);
        /* 상승은 초록 #26C281, 하락은 빨강 #F0506E — 시세·손익 표시에만 쓰는 색입니다 */
        tdChg.className = "tl-sym-chg " + (p > 0 ? "up" : p < 0 ? "down" : "flat");
      }
    });

    renderNote(waiting);
  }

  /* 비어 있는 이유를 ★말로★ 적습니다. 이게 없으면 조용한 고장이 됩니다. */
  function renderNote(waiting) {
    var note = id("tl-sym-note");
    if (!note) return;
    if (feedState === "closed" || feedState === "reconnecting") {
      note.hidden = false;
      note.textContent = "시세 연결이 끊겨 다시 붙는 중입니다. 잠시만 기다려 주세요.";
      return;
    }
    if (feedState === "unsupported") {
      note.hidden = false;
      note.textContent = "이 브라우저에서는 실시간 시세를 열 수 없습니다.";
      return;
    }
    if (!waiting.length) {
      note.hidden = true;
      note.textContent = "";
      return;
    }
    note.hidden = false;
    note.textContent =
      waiting.join(" · ") + " 의 첫 시세를 기다리는 중입니다. " +
      "거래가 뜸한 종목은 40초쯤 걸립니다.";
  }

  /* ---------------- 2) 내 포지션 요약 ---------------- */

  function buildPositionCard(right) {
    if (id(POS_CARD_ID)) return id(POS_CARD_ID);

    var card = document.createElement("div");
    card.className = "panel tl-pos";
    card.id = POS_CARD_ID;
    card.innerHTML =
      '<div class="field-label"><span>내 포지션</span></div>' +
      '<div class="tl-pos-empty" id="tl-pos-empty">보유 중인 포지션이 없습니다.</div>' +
      '<div class="tl-pos-body" id="tl-pos-body" hidden>' +
        '<div class="tl-pos-head"><b id="tl-pos-sym">-</b><span id="tl-pos-side"></span></div>' +
        '<div class="tl-pos-pnl" id="tl-pos-pnl">-</div>' +
        '<div class="tl-pos-rows">' +
          '<div><span>진입가</span><b id="tl-pos-entry">-</b></div>' +
          '<div><span>현재가</span><b id="tl-pos-cur">-</b></div>' +
        '</div>' +
      '</div>' +
      '<div class="tl-pos-note">자세한 표는 <b>주문창 아래 포지션</b> 칸에 그대로 있습니다.</div>';

    /* 종목 목록 바로 다음 자리 (종목 → 포지션 → 내 정보 → 채팅) */
    var symCard = id(SYM_CARD_ID);
    if (symCard && symCard.nextSibling) right.insertBefore(card, symCard.nextSibling);
    else if (symCard) right.appendChild(card);
    else right.insertBefore(card, right.firstChild);
    return card;
  }

  /* 아래 포지션 표의 ★글자를 그대로★ 비춥니다. 숫자를 다시 만들지 않습니다. */
  function mirrorPosition() {
    var body = id("tl-pos-body");
    var empty = id("tl-pos-empty");
    if (!body || !empty) return;

    var card = id("position-card");
    var on = !!(card && card.style && card.style.display !== "none");
    body.hidden = !on;
    empty.hidden = on;
    if (!on) return;

    id("tl-pos-sym").textContent = text(".position-symbol-name") || "-";
    id("tl-pos-entry").textContent = text("#pos-entry") || "-";
    id("tl-pos-cur").textContent = text("#pos-current") || "-";

    var pct = text("#pos-pnl-pct");
    var out = id("tl-pos-pnl");
    out.textContent = (text("#pos-pnl") || "-") + (pct ? " (" + pct + ")" : "");
    /* 색(pnl-positive / pnl-negative)도 원본이 쓰는 클래스를 그대로 물려받습니다 */
    var src = id("pos-pnl");
    out.className = "tl-pos-pnl" + (src && src.className ? " " + src.className : "");

    var badge = id("pos-side-badge");
    var side = id("tl-pos-side");
    side.textContent = badge ? String(badge.textContent || "").trim() : "";
    side.className = badge ? badge.className : "";
  }

  /* ---------------- 켜기 ---------------- */

  function init() {
    if (started) return;
    var right = $(".page-right");
    if (!right) return;
    started = true;

    buildSymbolCard(right);
    buildPositionCard(right);

    if (App.AllSymbolFeed && typeof App.AllSymbolFeed.getState === "function") {
      feedState = App.AllSymbolFeed.getState();
    }

    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("allsymbol:ticker", renderSymbols);
      App.Bus.on("allsymbol:status", function (p) {
        if (p && p.state) feedState = p.state;
        renderSymbols();
      });
      /* 보고 있는 종목이 바뀌면 강조 줄도 따라갑니다 */
      App.Bus.on("symbol:change", renderSymbols);
      App.Bus.on("trading:update", mirrorPosition);
      App.Bus.on("trading:persisted", mirrorPosition);
    }

    renderSymbols();
    mirrorPosition();

    /* Bus 를 놓쳤을 때의 그물. 1초마다 글자만 다시 맞춥니다
       (DOM 을 다시 만들지 않으므로 포커스·스크롤을 건드리지 않습니다). */
    setInterval(function () {
      renderSymbols();
      mirrorPosition();
    }, MIRROR_MS);
  }

  App.UpbitRightColumn = {
    init: init,
    /* 테스트에서 들여다보는 통로 */
    renderSymbols: renderSymbols,
    mirrorPosition: mirrorPosition
  };
})();
