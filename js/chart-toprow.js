/* =========================================================================
 * js/chart-toprow.js — App.ChartTopRow
 * =========================================================================
 * 차트 맨 윗줄 ★한 줄로 합치기★ (3단계, 2026-09-07 차트팀)
 *
 * ── 무엇을 하나 ────────────────────────────────────────────────────────
 * 따로 놀던 두 줄을 한 줄로 붙입니다. ★자리만 옮깁니다 — 지운 것이 없습니다.★
 *
 *   (전)  #interval-row   페이지 폭, 차트 카드 ★위★      1440: 1424x45
 *         .tlc-toolbar    차트 카드 ★안★                 1440:  784x40
 *   (후)  .tlc-toprow ┐
 *                     ├ .tlc-toolbar ┐
 *                     │              ├ #interval-row  (시간 단위 · 그대로)
 *                     │              ├ .tlc-sep-iv    (구분선 · 새로 하나)
 *                     │              └ 도구 단추들     (있던 그대로)
 *                     └ .tlc-more-hint  (넘칠 때만 뜨는 › 표시)
 *
 * ── 왜 (트레이딩뷰 실측 2026-09-07) ────────────────────────────────────
 *   트레이딩뷰 맨 윗줄 52,0 1388x38 — ★한 줄에 전부★
 *   390 에서도 h38 한 줄, x=366 이후 ★가로 스크롤★. 두 줄이 되는 자리가 없습니다.
 *   우리 수정 전 (localhost 실측)
 *     360/375/390   시간단위 95px(2줄) + 도구막대 89px(2줄) = ★184px★
 *     768/1440/1920 45px + 40px = 85px
 *
 * ── 수정 금지 파일을 한 글자도 안 고쳤습니다 ───────────────────────────
 *   js/chart.js:134 가 #interval-row 의 innerHTML 을 통째로 다시 씁니다.
 *   그래서 ★#interval-row 안★ 은 건드리지 않고 ★그 요소 자체★ 만 옮깁니다.
 *   요소를 옮기는 것은 innerHTML 갈아끼우기와 부딪히지 않습니다.
 *   style.css 도 안 고쳤습니다 — 덮어쓰는 규칙은 css/chart-toprow.css 안에만 있습니다.
 *
 * ── 전체화면은 자리를 되돌립니다 ───────────────────────────────────────
 *   전체화면 요소는 .chart-panel 입니다(js/chart-drawings.js:4560 requestFullscreen).
 *   막대가 그 밖에 있으면 ★전체화면에서 막대가 통째로 사라집니다.★
 *   그래서 전체화면 동안만 ★합친 줄째로★ 카드 안 맨 위로 되돌리고, 나오면 올립니다.
 *   덤 — 전에는 전체화면에서 시간 단위를 못 바꿨는데 이제 같이 들어가서 바뀝니다.
 *
 * ── ★2026-09-07 뒤늦게 고친 것 — 폰 전체화면에서 나가는 길★ ────────────
 *   처음에는 ★막대만★ 카드로 보내고 합친 줄은 페이지에 빈 채로 남겼습니다.
 *   밀기 표시(›)는 그 빈 줄에 달려 있어서 켜도 안 보이고, 그래서 아예 껐습니다.
 *   그런데 전체화면에서도 막대는 넘칩니다 — ★390 실측 보이는 폭 376 / 내용 981★.
 *   폰에는 Esc 키가 없고 iOS 는 우리 방식(data-tlc-full)이라 더 그렇습니다.
 *   「나가기」 단추가 오른쪽 ★화면 밖★ 에 있는데 밀 수 있다는 표시가 없어서
 *   ★나가는 길이 안 보였습니다★ (390x844 실측 — 단추 x=546~590, 보임 false).
 *   고친 방법 — 막대만이 아니라 ★.tlc-toprow 를 통째로★ 옮깁니다.
 *   표시가 막대와 같은 줄에 붙어 있으니 전체화면에서도 그대로 따라 들어갑니다.
 *   끝까지 밀면 여전히 사라집니다(더 없는데 있다고 하면 그게 거짓말입니다).
 *   생김새(아래 선·위 여백·차례)는 css/chart-toprow.css 의 4) 가 맞춥니다.
 *
 * ── 성능 ───────────────────────────────────────────────────────────────
 *   시세는 초당 수십 번 오지만 이 파일은 ★시세를 아예 안 봅니다.★
 *   자리 계산은 resize · 막대 스크롤 · 막대 단추 증감 때만 하고,
 *   그것도 requestAnimationFrame 으로 한 프레임에 한 번으로 묶습니다.
 *   App.ChartTopRow.measure() 로 한 번 걸리는 시간을 잽니다(performance.now).
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   ⚠ ★순서를 지키세요.★ 파일을 먼저 지우면 봉인이 그 파일을 읽다가
 *     ENOENT 로 ★터집니다★ (깔끔한 실패가 아니라 예외입니다).
 *     2026-09-07 에 PM 이 격리 사본에서 실제로 눌러 보고 잡은 자리입니다.
 *   ⚠ ★rm 이 아니라 git rm 입니다.★ rm 은 디스크에서만 지우고 git 에는
 *     남아서, tests/_order.txt 만 되돌아가면 그 파일이 "등록 안 된 정체불명
 *     파일" 이 되어 tests-dir-hygiene 이 터집니다.
 *
 *   1) ★봉인과 등록을 먼저 지웁니다★
 *        git rm -f tests/chart-toprow-seal.test.js
 *        tests/_order.txt 에서 "차트 맨 윗줄 한 줄로 합치기" 블록을 지웁니다 —
 *        주석 8줄 + 등록 한 줄 + 그 아래 빈 줄, 모두 ★10줄★ 입니다.
 *        ⚠ ★주석 8줄 중 마지막 줄에도 파일 이름이 들어 있습니다★ ("되돌리기: 이 줄과
 *          tests/…seal.test.js 를 git rm -f 로 삭제"). 파일 이름이 처음 보이는
 *          줄에서 멈추면 ★진짜 등록 줄이 남습니다★ — 2026-09-07 에 실제로
 *          그렇게 멈춰서 7줄만 지워졌습니다. ★줄 앞에 # 이 없는 줄★ 이 등록 줄입니다
 *   2) index.html 에서 아래 두 줄(과 각각의 설명 주석)을 지웁니다
 *        <link rel="stylesheet" href="css/chart-toprow.css">
 *        <script src="js/chart-toprow.js"></script>
 *   3) git rm -f css/chart-toprow.css js/chart-toprow.js
 *      ⚠ ★-f 가 필요합니다.★ 아직 커밋 전이라 두 파일이 ★색인에만 올라간 상태★ 면
 *        git rm 이 "changes staged in the index" 로 ★거절합니다★ (2026-09-07 실측).
 *        커밋된 뒤에는 -f 없이도 되지만, 둘 다 되는 -f 로 통일합니다
 *   4) css/chart-toolbar.css 의 "2026-09-07 차트팀" 세 곳과
 *      tests/chart-toolbar-seal.test.js 의 "23차" 항목을 되돌립니다
 *      ★이 둘은 짝입니다.★ 한쪽만 되돌리면 chart-toolbar-seal 이 빨개집니다
 *   5) js/stream-loading-hint.js 의 "2026-09-07 차트팀" 토막(칩 자리)도
 *      같이 되돌립니다. 그 파일 주석에 되돌리는 법이 적혀 있습니다
 *   ※ 2026-09-07 「폰 전체화면에서 나가는 길」 고침은 ★이 두 파일 안★ 에만
 *      있습니다(js/chart-toprow.js 의 applyFull·place, css/chart-toprow.css 의 4)).
 *      3) 에서 두 파일을 지우면 같이 사라지므로 따로 되돌릴 것이 없습니다.
 *      그 고침만 따로 되돌리려면 — applyFull 에서 toprow 대신 bar 를 옮기고,
 *      place 에 if (full) more = false; 를 되살리고, css 4) 의
 *      .chart-panel > .tlc-toprow 두 규칙을 지웁니다.
 *      ★그러면 폰 전체화면에서 나가기 단추에 다시 못 닿습니다.★
 *   6) ★손으로 고친 두 파일을 색인에 올립니다★
 *        git add index.html tests/_order.txt
 *      git rm 은 삭제가 저절로 올라가는데 손으로 고친 것은 안 올라갑니다.
 *      반쪽만 올라간 채로 돌리면 ★test-registry 가 "목록에는 있는데 git 에
 *      없다" 로 터집니다★ — 2026-09-07 에 실제로 눌러 보다가 여기서
 *      한 번 빨개졌습니다(220개 중 1개 실패). git add 뒤 초록이 됐습니다.
 *
 *   ── 같이 바뀌었지만 ★안 되돌려도 되는★ 두 파일 ───────────────────────
 *   js/interval-more.js (별표로 즐겨찾기) · js/chart-indicators.js (스크롤 자리)
 *   둘 다 합친 줄과 상관없이 혼자 돕니다 — 앞엣것은 #interval-row 안에서만,
 *   뒤엣것은 지표 칩 옆 단추 띠에서만 움직입니다. 합친 줄을 되돌려도 그대로
 *   동작합니다. 되돌리고 싶으면 각 파일 주석의 "되돌리는 방법" 을 보세요.
 *   (1) 에서 봉인을 지우면 이 둘을 못 박던 검사도 같이 사라집니다.)
 *
 *   ── 급할 때 (1분) ────────────────────────────────────────────────────
 *   2) 의 두 줄만 지워도 화면은 수정 전 그대로 돌아갑니다.
 *   ★단 그 상태로 npm test 를 돌리면 봉인이 빨개집니다★ — 봉인은 파일이
 *   아니라 index.html 에 실렸는지를 봅니다. 급한 불을 끈 뒤 1) 3) 4) 5) 를
 *   마저 하세요. 실행 중에 잠깐만 끄려면 콘솔에서 App.ChartTopRow.disable().
 *
 *   ── 되돌린 뒤 반드시 ─────────────────────────────────────────────────
 *   npm test 가 ★초록★ 인지 확인합니다.
 *   2026-09-07 차트팀이 별도 worktree 를 떼어 위 1)~6) 을 그대로 눌러 봤습니다 —
 *   ★223개 파일 / 223개 통과 / 실패 0 · 검사 12,010★.
 *   같은 worktree 에서 되돌리기 전(합친 상태)은 ★224/224 · 검사 12,071★ 이었습니다.
 *   (숫자는 그날 저장소의 봉인 수라 시간이 지나면 늘어납니다. 중요한 것은 ★실패 0★ 입니다)
 * ========================================================================= */

window.App = window.App || {};

App.ChartTopRow = (function () {
  "use strict";

  var ROW_ID = "interval-row";
  var TOPROW_CLASS = "tlc-toprow";
  var HINT_CLASS = "tlc-more-hint";
  var SEP_CLASS = "tlc-sep tlc-sep-iv";

  var toprow = null;
  var hint = null;
  var sep = null;
  var bar = null;      /* .tlc-toolbar */
  var full = false;    /* 지금 전체화면인가 */
  var home = null;     /* 전체화면 전에 합친 줄이 있던 부모 */
  var homeNext = null; /* 그 부모 안에서 바로 다음 형제 — 나올 때 자리를 그대로 되찾습니다 */
  var off = false;
  var raf = 0;
  var lastCost = 0;    /* 마지막 자리 계산에 걸린 ms */

  function q(s) { return document.querySelector(s); }

  /* =====================================================================
   * 자리 옮기기
   * ===================================================================== */
  function build() {
    if (off) return false;
    var row = document.getElementById(ROW_ID);
    bar = q(".tlc-toolbar");
    /* 도구 막대는 js/chart-drawings.js 가 만듭니다. 아직 없으면 다음에 다시 옵니다. */
    if (!row || !bar || !row.parentNode) return false;

    if (!toprow) {
      toprow = document.createElement("div");
      toprow.className = TOPROW_CLASS;
      /* 옛 #interval-row 자리 그대로에 끼웁니다 (같은 부모 · 같은 차례).
         부모가 #page-exchange 라야 css 의 order:2 가 걸립니다. */
      row.parentNode.insertBefore(toprow, row);

      hint = document.createElement("div");
      hint.className = HINT_CLASS;
      hint.setAttribute("aria-hidden", "true");
      hint.textContent = "›";  /* › — 옆으로 더 있다는 표시 */
    }

    /* 막대는 ★언제나★ 합친 줄 안입니다. 전체화면에는 줄째로 들어갑니다
       (전에는 막대만 옮겼는데, 그러면 밀기 표시가 빈 줄에 남아 안 보였습니다) */
    if (bar.parentNode !== toprow) toprow.appendChild(bar);
    if (hint && hint.parentNode !== toprow) toprow.appendChild(hint);

    /* 시간 단위 줄을 막대 맨 앞으로 + 구분선 하나 */
    if (row.parentNode !== bar || bar.firstChild !== row) {
      bar.insertBefore(row, bar.firstChild);
    }
    if (!sep) {
      sep = document.createElement("div");
      sep.className = SEP_CLASS;
    }
    if (sep.parentNode !== bar || sep.previousSibling !== row) {
      bar.insertBefore(sep, row.nextSibling);
    }
    return true;
  }

  /* =====================================================================
   * 전체화면 — 막대를 카드 안팎으로 옮깁니다
   * ---------------------------------------------------------------------
   * .chart-panel 이 전체화면 요소라, 막대가 그 밖에 있으면 안 보입니다.
   * 우리 방식(data-tlc-full)과 브라우저 방식(fullscreenElement) 둘 다 봅니다 —
   * js/chart-drawings.js:4520 이 두 가지를 겹쳐 쓰기 때문입니다.
   * ===================================================================== */
  function isFull() {
    var p = q(".chart-panel");
    if (!p) return false;
    if (p.getAttribute && p.getAttribute("data-tlc-full") === "1") return true;
    var fe = document.fullscreenElement || document.webkitFullscreenElement || null;
    return !!fe && (fe === p || (fe.contains && fe.contains(p)));
  }

  function applyFull() {
    if (off) return;
    var now = isFull();
    if (now === full) return;
    full = now;
    var p = q(".chart-panel");
    if (!bar || !p || !toprow) return;
    if (full) {
      if (toprow.parentNode !== p) {
        /* 나올 때 제자리로 돌아오려고 지금 자리를 적어 둡니다 */
        home = toprow.parentNode;
        homeNext = toprow.nextSibling;
        p.insertBefore(toprow, p.firstChild);
      }
    } else if (home && toprow.parentNode !== home) {
      var next = (homeNext && homeNext.parentNode === home) ? homeNext : null;
      home.insertBefore(toprow, next);
    }
    /* 막대는 어느 쪽이든 합친 줄 안입니다 — 줄째로 옮기니 › 표시도 같이 따라갑니다 */
    if (bar.parentNode !== toprow) toprow.insertBefore(bar, hint || null);
    schedule();
  }

  /* =====================================================================
   * 옆으로 밀 수 있다는 표시 — ★넘칠 때만★
   * ---------------------------------------------------------------------
   * 폰 스크롤바는 밀기 전에는 안 보입니다(오버레이). 그래서 표시를 따로 답니다.
   * 끝까지 밀면 사라집니다 — 더 없는데 있다고 하면 그게 거짓말입니다.
   * ===================================================================== */
  function place() {
    if (off || !bar || !toprow) return;
    var t0 = 0;
    try { t0 = performance.now(); } catch (e) { t0 = 0; }
    var over = bar.scrollWidth - bar.clientWidth;
    var more = over > 1 && bar.scrollLeft < over - 1;
    if (more) toprow.setAttribute("data-more", "1");
    else toprow.removeAttribute("data-more");
    try { lastCost = performance.now() - t0; } catch (e) { /* 무시 */ }
  }

  function schedule() {
    if (off || raf) return;
    var rq = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    raf = rq(function () {
      raf = 0;
      place();
    });
  }

  /* =====================================================================
   * 폰 탭 — 차트 탭일 때만 보입니다
   * js/chart-tab-mobile.js 가 .main-grid 에 붙이는 data-mtab 을 그대로 옮겨 답니다.
   * ===================================================================== */
  function syncTab() {
    if (off || !toprow) return;
    var g = q(".main-grid");
    var v = g && g.getAttribute ? g.getAttribute("data-mtab") : null;
    var now = toprow.getAttribute("data-mtab");
    /* ⚠ ★같은 값이어도 setAttribute 는 변경 신호를 냅니다.★ 아래 MutationObserver 가
       그 신호를 받아 다시 이 함수를 부르면 ★무한 되풀이★ 가 됩니다.
       실제로 그렇게 만들었다가 페이지가 아예 안 뜨는 것을 확인했습니다(2026-09-07).
       그래서 ★달라졌을 때만★ 씁니다. */
    if (v === now) return;
    if (v) toprow.setAttribute("data-mtab", v);
    else toprow.removeAttribute("data-mtab");
  }

  /* =====================================================================
   * 붙잡아 두기 — 다른 파일이 DOM 을 다시 그려도 자리를 되찾습니다
   * ===================================================================== */
  var reasserting = false;
  var reRaf = 0;
  function reassertNow() {
    if (off || reasserting) return;
    reasserting = true;
    try {
      build();
      applyFull();
      syncTab();
      schedule();
    } finally {
      reasserting = false;
    }
  }
  /* 페이지 전체를 보는 감시라 신호가 ★초당 수백 번★ 옵니다(시세·호가·채팅).
     그래서 실제 일은 한 프레임에 ★한 번★ 만 합니다. */
  function reassert() {
    if (off || reRaf) return;
    var rq = window.requestAnimationFrame || function (f) { return setTimeout(f, 16); };
    reRaf = rq(function () {
      reRaf = 0;
      reassertNow();
    });
  }

  var bound = false;
  function bind() {
    if (bound || off) return;
    bound = true;
    /* ⚠ ★document.body 를 subtree 로 통째로 보지 않습니다.★
     *   처음엔 그렇게 만들었는데, 이 페이지는 시세·호가·채팅이 초당 수십 번
     *   DOM 을 갈아서 ★신호를 모으는 값만으로도★ 느려졌습니다.
     *   실측 (1440x900 · 지표 9개 다 켠 상태 · 179프레임)
     *     통째로 볼 때   평균 32.33ms · 중앙 31.1 · p95 46.2
     *     안 볼 때(끔)   평균 30.35ms · 중앙 29.8 · p95 36.7
     *   ★프레임당 2ms★ 를 우리가 먹고 있었습니다. 그래서 ★꼭 필요한 네 곳만★ 봅니다.
     *     ① 합친 줄의 부모 — 누가 우리 줄을 들어내면
     *     ② 막대 자신     — 다른 파일이 단추를 꽂으면(리플레이 등) 밀기 표시 갱신
     *     ③ .main-grid    — 폰 탭이 바뀌면 (data-mtab)
     *     ④ .chart-panel  — 전체화면이 켜지고 꺼지면 (data-tlc-full)
     *   넷 다 ★subtree 없이★ 봅니다. */
    try {
      var mo = new MutationObserver(function () { reassert(); });
      var host = toprow && toprow.parentNode;
      if (host) mo.observe(host, { childList: true });
      /* 막대는 작아서(단추 17개) 안쪽까지 봐도 쌉니다. 이름표 글자가 바뀌거나
         시간 단위 줄이 다시 그려질 때도 밀기 표시를 다시 재야 합니다. */
      if (bar) mo.observe(bar, { childList: true, subtree: true, characterData: true });
      var grid = q(".main-grid");
      if (grid) mo.observe(grid, { attributes: true, attributeFilter: ["data-mtab"] });
      var pan = q(".chart-panel");
      if (pan) mo.observe(pan, { attributes: true, attributeFilter: ["data-tlc-full"] });
    } catch (e) { /* MutationObserver 가 없는 곳이면 자리만 한 번 잡고 끝냅니다 */ }
    window.addEventListener("resize", schedule);
    document.addEventListener("fullscreenchange", reassert);
    document.addEventListener("webkitfullscreenchange", reassert);
    if (bar && bar.addEventListener) bar.addEventListener("scroll", schedule);

    /* ★뒤늦게 넓어지는 것★ 을 따라잡습니다 (2026-09-07 실측으로 잡힌 자리).
       막대 안 내용은 글꼴이 늦게 오거나 다른 파일이 단추를 꽂으면서 넓어집니다.
       그때 단추 수가 그대로면 위 감시가 안 울려서, 실제로는 넘치는데
       ★밀 수 있다는 표시가 안 뜬 채★ 로 남았습니다 —
         768 실측 : 내용 1201px / 칸 752px 인데 data-more 가 없었습니다.
       한 번 더 재는 것은 0.0014ms 라(measure 실측) 몇 번 더 재도 공짜입니다. */
    if (window.addEventListener) window.addEventListener("load", schedule);
    try {
      if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
        document.fonts.ready.then(schedule);
      }
    } catch (e) { /* 글꼴 API 가 없으면 아래 타이머만으로도 충분합니다 */ }
    [300, 1500, 4000].forEach(function (ms) { setTimeout(schedule, ms); });
  }

  function init() {
    if (off) return;
    if (build()) {
      bind();
      reassertNow();
      return;
    }
    /* 도구 막대가 아직 없습니다 — 만들어질 때까지 기다립니다 (최대 6초) */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (off) { clearInterval(t); return; }
      if (build() || tries > 100) {
        clearInterval(t);
        if (toprow) { bind(); reassertNow(); }
      }
    }, 60);
  }

  function disable() {
    off = true;
    /* 자리를 수정 전으로 되돌립니다 */
    try {
      var row = document.getElementById(ROW_ID);
      var p = q(".chart-panel");
      /* 전체화면 중이면 합친 줄이 카드 안에 있습니다 — 먼저 제자리로 되돌립니다 */
      if (toprow && home && toprow.parentNode !== home) {
        var n0 = (homeNext && homeNext.parentNode === home) ? homeNext : null;
        home.insertBefore(toprow, n0);
      }
      if (toprow && row && toprow.parentNode) toprow.parentNode.insertBefore(row, toprow);
      if (bar && p) p.insertBefore(bar, p.firstChild);
      if (sep && sep.parentNode) sep.parentNode.removeChild(sep);
      if (toprow && toprow.parentNode) toprow.parentNode.removeChild(toprow);
    } catch (e) { /* 무시 */ }
    toprow = null; hint = null; sep = null;
  }

  /** 자리 계산 한 번에 걸리는 시간(ms). 실측 보고용입니다. */
  function measure(n) {
    var k = n || 200;
    var t0 = performance.now();
    for (var i = 0; i < k; i++) place();
    var t1 = performance.now();
    return { 횟수: k, 총ms: +(t1 - t0).toFixed(2), 한번ms: +((t1 - t0) / k).toFixed(4) };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    disable: disable,
    measure: measure,
    lastCost: function () { return lastCost; }
  };
})();
