/* =========================================================================
 * js/chat-popup.js — App.ChatPopup
 * =========================================================================
 * 대표 지시 2026-10-01 — "채팅창은 팝업창?? 같은 걸로 켯다 껏다 할수있게하고"
 *
 * 오른쪽 아래 "채팅" 버튼을 눌러 켜고, 머리글의 X 로 끕니다.
 *
 * ── ⛔ js/chat.js 를 한 글자도 안 봅니다 (수정 금지 파일) ────────────────
 *   DOM 을 ★하나도 안 옮깁니다★. #right-chat-panel 은 index.html 의
 *   .page-right 안 그 자리 그대로 있고, css/chat-popup.css 가
 *   position:fixed 로 ★보이는 자리만★ 띄웁니다.
 *   그래서 js/chat.js:285~290 이 캐시해 둔 노드 4개
 *   (chat-messages / chat-input / chat-send-btn / chat-err)가 전부 그대로이고,
 *   js/admin-chat-tools.js 의 ".page-chat-panel .chat-send-btn" 도 그대로 맞습니다.
 *
 *   시안(/tmp/tl-design-mock)처럼 document.body 로 옮기지 않은 이유는
 *   css/chat-popup.css 머리말에 적어 뒀습니다(.page-right 자손 규칙 25개).
 *
 * ── ⚠ 함정 — 열었을 때 ★맨 위(옛 메시지)★ 가 보입니다 ──────────────────
 *   js/chat.js:74 가 그릴 때마다 messages.scrollTop = messages.scrollHeight 로
 *   맨 아래로 내립니다. 그런데 팝업이 display:none 인 동안에는 scrollHeight 가
 *   0 이라 ★그 줄이 아무 일도 못 합니다★.
 *   그래서 ★열 때 여기서 직접★ 맨 아래로 내립니다(아래 맨아래로()).
 *
 * ── ⚠ js/layout-align.js 를 끕니다 ──────────────────────────────────────
 *   그 모듈이 하는 일은 단 하나 — "오른쪽 열에 세로로 서 있는 채팅의 아랫변을
 *   왼쪽 거래 행의 아랫변에 맞추기" 입니다(파일 머리말 4~5행).
 *   채팅이 팝업이 되면 ★오른쪽 열에 세로로 선 채팅 자체가 없어서★ 맞출 대상이
 *   사라집니다. 그대로 두면 1800px 이상에서 .page-chat-col 의 height 를
 *   "거래 행 높이(약 895px)" 로 밀어 넣어 ★620px 팝업 밖으로 입력칸이
 *   나갑니다★. 딸린 alignPageToChat() 도 채팅 아랫변 기준이라 같이 무의미합니다.
 *
 *   그래서 ★파일을 고치지 않고★ init 만 가로채 빈 함수로 만듭니다
 *   (js/social-login.js 가 App.Auth.init 을 가로채는 것과 같은 방식).
 *   ⚠ main.js 목록에서 "ChatPopup" 이 ★"LayoutAlign" 보다 앞★ 이어야 합니다.
 *     tests/chat-popup-seal.test.js 가 그 순서를 지킵니다.
 *   이 파일을 지우면 LayoutAlign 은 저절로 원래대로 돌아옵니다.
 *
 * ── 이모지를 쓰지 않습니다 ──────────────────────────────────────────────
 *   말풍선·X 는 인라인 SVG 입니다(currentColor 라 호버 색을 따라갑니다).
 *
 * ── 되돌리는 방법 ────────────────────────────────────────────────────────
 *   index.html 의 <script src="js/chat-popup.js"> 와
 *   <link rel="stylesheet" href="css/chat-popup.css"> 두 줄,
 *   main.js 의 "ChatPopup" 한 개를 지우면 채팅이 예전처럼 늘 펼쳐집니다.
 * ========================================================================= */
(function () {
  "use strict";

  window.App = window.App || {};
  if (App.ChatPopup) return;

  var READY = "tl-chat-ready";
  var OPEN = "tl-chat-open";

  var fab = null;
  var closeBtn = null;
  var started = false;

  function root() { return document.documentElement; }
  function id(v) { return document.getElementById(v); }
  function 열렸나() { return root().classList.contains(OPEN); }

  /* ---------------- 아이콘 (인라인 SVG — 이모지 아님) ---------------- */

  var 말풍선 =
    '<svg viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor"' +
    ' stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    '<path d="M2.25 3.25h11.5v7.5H7l-3.25 2.6v-2.6H2.25z"/>' +
    '<path d="M5 6.5h6"/><path d="M5 8.5h4"/></svg>';

  var 엑스 =
    '<svg viewBox="0 0 16 16" width="18" height="18" fill="none" stroke="currentColor"' +
    ' stroke-width="1.6" stroke-linecap="round" aria-hidden="true" focusable="false">' +
    '<path d="M4 4l8 8"/><path d="M12 4l-8 8"/></svg>';

  /* ---------------- 맨 아래로 (함정 2) ----------------
     팝업이 닫혀 있는 동안 쌓인 메시지는 js/chat.js 가 맨 아래로 못 내렸습니다
     (display:none 이면 scrollHeight 가 0). 열리고 나서 직접 내립니다.
     한 번만으로는 글꼴·이미지가 늦게 자리를 잡으면 어긋나므로 세 번 겹칩니다. */
  function 맨아래로() {
    var box = id("chat-messages");
    if (!box) return;
    box.scrollTop = box.scrollHeight;
  }

  function 열기(v, 사용자가눌렀나) {
    var on = !!v;
    root().classList.toggle(OPEN, on);
    if (fab) fab.setAttribute("aria-expanded", on ? "true" : "false");
    var panel = id("chat-panel");
    if (panel) panel.setAttribute("aria-hidden", on ? "false" : "true");

    if (on) {
      맨아래로();
      if (window.requestAnimationFrame) window.requestAnimationFrame(맨아래로);
      setTimeout(맨아래로, 80);
    } else if (fab && 사용자가눌렀나) {
      /* 닫으면 다시 버튼으로 초점을 돌려줍니다(키보드 사용자).
         ⚠ ★사용자가 직접 닫았을 때만★ 입니다. 페이지가 처음 뜰 때 부르는
            열기(false) 에서도 초점을 주면, 아무도 안 눌렀는데 버튼에
            금색 테두리(:focus-visible)가 켜진 채로 화면이 뜹니다(1440 실측). */
      try { fab.focus({ preventScroll: true }); } catch (e) { fab.focus(); }
    }
  }

  /* ---------------- 떠 있는 버튼 ---------------- */

  function 버튼만들기() {
    if (id("tl-chat-fab")) return id("tl-chat-fab");
    var b = document.createElement("button");
    b.type = "button";
    b.id = "tl-chat-fab";
    b.className = "tl-chat-fab";
    b.setAttribute("aria-controls", "chat-panel");
    b.setAttribute("aria-expanded", "false");
    b.setAttribute("aria-label", "실시간 채팅 열기");
    b.innerHTML = 말풍선 + "<span>채팅</span>";
    b.addEventListener("click", function () { 열기(!열렸나(), true); });
    document.body.appendChild(b);
    return b;
  }

  /* ---------------- 닫기 버튼 ----------------
     새 머리글을 만들지 않고 ★이미 있는 .field-label★ 안에 넣습니다.
     거기에 "실시간 채팅" 글자가 이미 있어서, 머리글을 또 만들면 제목이
     두 줄 연달아 나옵니다. */
  function 닫기버튼만들기() {
    if (id("tl-chat-pop-close")) return id("tl-chat-pop-close");
    var panel = id("chat-panel");
    var head = panel ? panel.querySelector(".field-label") : null;
    if (!head) return null;
    var b = document.createElement("button");
    b.type = "button";
    b.id = "tl-chat-pop-close";
    b.className = "tl-chat-pop-close";
    b.setAttribute("aria-label", "채팅 닫기");
    b.innerHTML = 엑스;
    b.addEventListener("click", function () { 열기(false, true); });
    head.appendChild(b);
    return b;
  }

  /* ---------------- js/layout-align.js 끄기 (위 머리말 참고) ---------------- */
  function 자리맞춤_끄기() {
    if (!App.LayoutAlign || App.LayoutAlign.__chatPopupOff) return;
    App.LayoutAlign.__chatPopupOff = true;
    /* 파일은 한 글자도 안 고치고 init 만 빈 함수로 바꿉니다.
       applyForTest 는 그대로 둡니다(기존 테스트가 직접 부릅니다). */
    App.LayoutAlign.init = function () {};
  }

  function init() {
    if (started) return;
    var panel = id("chat-panel");
    var aside = id("right-chat-panel");
    /* 채팅 마크업이 없으면 ★아무것도 하지 않습니다★.
       html 에 tl-chat-ready 를 안 붙이므로 CSS 도 한 줄도 안 걸립니다. */
    if (!panel || !aside) return;
    started = true;

    자리맞춤_끄기();

    root().classList.add(READY);
    fab = 버튼만들기();
    closeBtn = 닫기버튼만들기();
    열기(false);

    /* Esc 로 닫기 */
    document.addEventListener("keydown", function (e) {
      if (!열렸나()) return;
      if (e.key === "Escape" || e.key === "Esc") 열기(false, true);
    });
  }

  App.ChatPopup = {
    init: init,
    open: function () { 열기(true, true); },
    close: function () { 열기(false, true); },
    toggle: function () { 열기(!열렸나(), true); },
    isOpen: 열렸나,
    scrollToBottomForTest: 맨아래로
  };
})();
