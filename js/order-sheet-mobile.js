/* =========================================================================
 * js/order-sheet-mobile.js — App.OrderSheetMobile
 * =========================================================================
 * [모바일 3단계] 폰에서 주문 패널을 "하단 고정 바 + 올라오는 시트" 로 바꿉니다.
 *
 * ── 무엇이 불편했나 (390px 실측, 2026-08-24) ──────────────────────────
 *   주문 패널이 문서 1,084px 지점부터 1,148px 을 세로로 차지합니다.
 *   문서 총 높이 4,234px 중 27% 가 주문 패널 하나입니다. 포지션·거래내역·
 *   공지·채팅을 보려면 매번 주문 패널을 통째로 스크롤해서 지나가야 합니다.
 *   바이낸스 모바일은 주문 패널을 화면에 깔아두지 않고, 화면 맨 아래
 *   [매수/롱][매도/숏] 바에서 필요할 때만 시트로 올립니다(바 높이 80px).
 *
 * ── 어떻게 하나 — ⭐ 마크업을 옮기지 않습니다 ─────────────────────────
 *   주문 패널은 js/ui.js(수정 금지)가 계속 다시 그리고, qty-price-order.js ·
 *   order-fee-preview.js · leverage-modal.js · orderbook-click-order.js 가
 *   그 안의 요소를 id 로 찾습니다. 그래서 **DOM 에서 단 하나도 옮기지 않고**,
 *   주문 패널을 감싸고 있는 원래 칼럼(.side-column)에 CSS 로
 *   position:fixed 를 걸어 화면 아래에서 올라오게만 합니다.
 *     - 닫힘: body[data-tl-order-sheet]        → .side-column display:none
 *     - 열림: body[data-tl-order-sheet="open"] → .side-column 이 시트가 됨
 *   이 모듈이 하는 일은 (1) 하단 바·가림막·시트 머리말을 새로 만들고
 *   (2) body 의 속성 한 개를 켜고 끄는 것뿐입니다. 스타일은 전부 style.css.
 *
 *   .position-section 은 걱정하지 않아도 됩니다 — js/ui.js 가 부팅 때
 *   그것을 주문 패널 밖(거래내역 탭 안)으로 옮깁니다. 390px 실측에서
 *   포지션은 2,376px 지점(거래내역 패널 안)에 있고 주문 패널 안에 없습니다.
 *   그래서 시트를 닫아도 포지션/주문내역은 페이지에 그대로 보입니다.
 *
 * ── 적용 범위 ─────────────────────────────────────────────────────────
 *   (max-width:700px) 만. 1·2단계와 같은 경계입니다.
 *   768/1440/1920 은 body 속성 자체가 안 붙어서 한 줄도 달라지지 않습니다.
 *
 * ── 기능은 하나도 바꾸지 않습니다 ─────────────────────────────────────
 *   주문 버튼·레버리지·수량 %·지정가/시장가·수수료 미리보기·압력 바 전부
 *   원래 요소 그대로입니다. 이 모듈은 어떤 주문도 넣지 않고, 어떤 값도
 *   계산하지 않습니다. "보이느냐 마느냐" 만 다룹니다.
 *
 *   딱 하나 더한 것: 폰에서 호가 행을 누르면 시트가 같이 열립니다.
 *   (orderbook-click-order.js 가 가격을 채워 넣는데, 시트가 닫혀 있으면
 *    아무 일도 안 일어난 것처럼 보이기 때문입니다. 값을 채우는 것은
 *    여전히 그 모듈이 하고, 여기서는 시트만 엽니다.)
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   index.html 의 <script src="js/order-sheet-mobile.js"> 한 줄을 지우면
 *   주문 패널이 폰에서도 다시 페이지 안에 그대로 놓입니다
 *   (style.css 의 규칙은 body 속성이 없으면 아무것도 하지 않습니다).
 *   완전히 지우려면 style.css 의 "[모바일 3단계]" 블록도 함께 지웁니다.
 * ========================================================================= */

window.App = window.App || {};

App.OrderSheetMobile = (function () {
  "use strict";

  var MQ = "(max-width:700px)";   /* 1·2단계와 같은 경계 */
  var BAR_ID = "tl-order-bar";
  var SCRIM_ID = "tl-order-scrim";
  var HEAD_CLASS = "tl-sheet-head";

  var savedScrollY = 0;

  function el(id) { return document.getElementById(id); }
  function sideColumn() { return document.querySelector(".main-grid > .side-column"); }
  function orderPanel() { return document.querySelector(".order-panel"); }

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia(MQ).matches);
  }
  function isOpen() {
    return document.body.getAttribute("data-tl-order-sheet") === "open";
  }

  /* ---------- 새로 만드는 것 (기존 요소는 건드리지 않습니다) ---------- */
  function ensureBar() {
    if (el(BAR_ID)) return el(BAR_ID);
    var bar = document.createElement("div");
    bar.id = BAR_ID;
    bar.className = "tl-order-bar";
    /* 라벨은 주문 패널 안의 버튼(매수 / Long, 매도 / Short)과 같은 뜻입니다.
       이 바를 누르면 주문이 들어가는 것이 아니라 주문창이 열립니다. */
    bar.innerHTML =
      '<button type="button" class="tl-order-bar-btn tl-order-bar-long" data-tl-open="long">매수 / 롱</button>' +
      '<button type="button" class="tl-order-bar-btn tl-order-bar-short" data-tl-open="short">매도 / 숏</button>';
    document.body.appendChild(bar);
    bar.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest("[data-tl-open]") : null;
      if (!btn) return;
      open(btn.getAttribute("data-tl-open"));
    });
    return bar;
  }

  function ensureScrim() {
    if (el(SCRIM_ID)) return el(SCRIM_ID);
    var s = document.createElement("div");
    s.id = SCRIM_ID;
    s.className = "tl-order-scrim";
    document.body.appendChild(s);
    s.addEventListener("click", function () { close(); });
    return s;
  }

  /* 시트 머리말 — .side-column 의 첫 자식으로 "추가" 합니다(이동 아님).
     데스크톱에서는 style.css 가 display:none 으로 감춥니다. */
  function ensureHead() {
    var col = sideColumn();
    if (!col) return null;
    var head = col.querySelector("." + HEAD_CLASS);
    if (head) return head;
    head = document.createElement("div");
    head.className = HEAD_CLASS;
    head.innerHTML =
      '<span class="tl-sheet-title">주문</span>' +
      /* 어느 쪽으로 열었는지 알려주는 배지. 글자는 아래 setSideBadge() 가
         채웁니다(라벨일 뿐, 어떤 값도 계산하지 않습니다). */
      '<span class="tl-sheet-side"></span>' +
      '<button type="button" class="tl-sheet-close" aria-label="주문창 닫기">✕</button>';
    col.insertBefore(head, col.firstChild);
    head.querySelector(".tl-sheet-close").addEventListener("click", function () { close(); });
    return head;
  }

  /* 시트 머리말 배지 — "지금 어느 쪽으로 열었는지"를 시트를 열자마자
     보이게 합니다. 확인 버튼(#btn-long/#btn-short)에 붙는 외곽선만으로는
     그 버튼이 화면 밖에 있을 때 아무 신호가 없었습니다.
     라벨만 바꿉니다 — 주문 로직·값과는 무관합니다. */
  function setSideBadge(side) {
    var head = document.querySelector("." + HEAD_CLASS);
    var badge = head ? head.querySelector(".tl-sheet-side") : null;
    if (!badge) return;
    if (side === "long") {
      badge.setAttribute("data-side", "long");
      badge.textContent = "매수 / 롱";
    } else if (side === "short") {
      badge.setAttribute("data-side", "short");
      badge.textContent = "매도 / 숏";
    } else {
      badge.removeAttribute("data-side");
      badge.textContent = "";
    }
  }

  /* ---------- 열기 / 닫기 ---------- */
  function open(side) {
    if (!isMobile()) return;
    var col = sideColumn();
    if (!col) return;
    ensureHead();

    savedScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.setAttribute("data-tl-order-sheet", "open");
    document.documentElement.classList.add("tl-sheet-lock");

    var panel = orderPanel();
    if (panel) {
      if (side === "long" || side === "short") panel.setAttribute("data-tl-side", side);
      else panel.removeAttribute("data-tl-side");
    }
    setSideBadge(side);
    col.scrollTop = 0;
  }

  function close() {
    if (!isOpen()) return;
    document.body.setAttribute("data-tl-order-sheet", "closed");
    document.documentElement.classList.remove("tl-sheet-lock");
    var panel = orderPanel();
    if (panel) panel.removeAttribute("data-tl-side");
    setSideBadge(null);
    /* 배경 스크롤을 잠그는 동안 위치가 밀리는 브라우저가 있어 되돌립니다 */
    window.scrollTo(0, savedScrollY);
  }

  /* ---------- 폭 / 페이지 전환에 맞춰 상태 맞추기 ---------- */
  function exchangeVisible() {
    var p = el("page-exchange");
    if (!p) return true;
    return p.style.display !== "none";
  }

  function sync() {
    var bar = ensureBar();
    ensureScrim();
    if (!isMobile()) {
      /* 데스크톱 — 속성을 전부 떼서 원래 화면 그대로 둡니다 */
      document.body.removeAttribute("data-tl-order-sheet");
      document.documentElement.classList.remove("tl-sheet-lock");
      var p0 = orderPanel();
      if (p0) p0.removeAttribute("data-tl-side");
      setSideBadge(null);
      return;
    }
    ensureHead();
    if (!document.body.hasAttribute("data-tl-order-sheet")) {
      document.body.setAttribute("data-tl-order-sheet", "closed");
    }
    /* 거래 화면이 아닐 때(게시판·랭킹·내 정보)는 매수/매도 바를 감춥니다 */
    bar.classList.toggle("tl-bar-hidden", !exchangeVisible());
  }

  function init() {
    ensureBar();
    ensureScrim();
    sync();

    window.addEventListener("resize", sync);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && isOpen()) close();
    });

    /* 호가 행 클릭 — 값은 orderbook-click-order.js 가 채웁니다.
       여기서는 폰에서 시트만 열어 그 결과가 보이게 합니다. */
    ["ob-asks", "ob-bids"].forEach(function (id) {
      var box = el(id);
      if (!box) return;
      box.addEventListener("click", function (e) {
        if (!isMobile()) return;
        if (!e.target || !e.target.closest || !e.target.closest(".ob-row")) return;
        if (!isOpen()) open(null);
      });
    });

    /* 페이지 전환(page-nav.js 가 #page-exchange 의 display 를 바꿉니다) */
    var pageEl = el("page-exchange");
    if (pageEl && window.MutationObserver) {
      new MutationObserver(sync).observe(pageEl, { attributes: true, attributeFilter: ["style"] });
    }

    /* ui.js / trades.js 가 늦게 요소를 만드는 경우에 대비해 한 번 더 맞춥니다 */
    setTimeout(sync, 1000);
    setTimeout(sync, 3000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, sync: sync, open: open, close: close, isOpen: isOpen };
})();
