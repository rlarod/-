/* =========================================================================
 * js/chart-indbar-room.js — App.ChartIndBarRoom
 * =========================================================================
 * 지표 칩 줄(.tl-ind-bar)을 ★그림 영역 안★ 에만 머물게 합니다.
 * 오른쪽 가격축(원화 ₩120,900,000 …) 위로 올라타지 않게 하는 것이 전부입니다.
 *
 * ── 무슨 일이 있었나 (2026-09-07) ──────────────────────────────────────
 * 오늘 아침 십자선 OHLC 줄(.tl-ohlc)에서 ★똑같은 병★ 을 고쳤습니다(8efb985).
 * 그 상자도 오른쪽 끝을 안 정해 .chart-wrap(그림 + 가격축) 끝까지 늘어나
 * ₩120,900,000 이 ,900,000 으로 읽혔습니다. 조사팀이 같은 병을 하나 더
 * 찾았고 그것이 이 칩 줄입니다.
 *
 * 칩 줄에는 오른쪽 끝이 ★있기는 했습니다★ — style.css 의 정적 px 두 개.
 *     .chart-panel .chart-wrap .tl-ind-bar{right:138px;}
 *     @media (max-width:900px){ … right:82px; }
 * 그런데 이 두 숫자는 2026-08-27 에 ★달러 가격축만 재고★ 정한 값입니다
 * (그 자리 주석의 실측표 74.5 / 130.5 가 둘 다 USDT 입니다).
 *
 * ── 정적 px 이 왜 못 쓰는 값인지 — 직접 재봤습니다 (2026-09-07) ────────
 * 가격축 폭은 ★통화 2가지 × 글씨 구간 3가지 = 6가지★ 로 변합니다.
 * 두 값(138 / 82)으로도, 네 값으로도 못 맞춥니다.
 *
 *     폭      USDT 축    KRW 축
 *     360      75.5       95.5
 *     375      76.5       96.5
 *     390      75.5       95.5
 *     700     131.5      131.5
 *     767     132.5      132.5
 *     768     131.5      169.5     ← 여기서 원화만 한 번 더 넓어집니다
 *    1440     132.0      170.0
 *    1920     131.8      169.8
 *
 * 옛 media 경계(900px)는 축이 실제로 바뀌는 자리(767/768)와도 어긋나서,
 * 768 은 ★폰용 82px★ 을 받고 있었습니다. 원화 축이 169.5 인 자리인데도요.
 *
 * 고치기 전 실측 (지표 6개 켠 상태 · 침범 = 상자 오른끝 − 그림 오른끝)
 *     360 KRW +13.5 · 375 KRW +14.5 · 390 KRW +13.5
 *     768 KRW ★+87.5★ · 1440 KRW +32.0 · 1920 KRW +31.8
 *   그중 768·KRW 는 ★칩 글자 자체★ 가 넘었습니다 — EMA(9) 오른끝 613.5,
 *   그림 오른끝 583.5 → ★+30.0px★ 이 가격축 위였습니다.
 *
 * ── 어떻게 고치나 — ★재서★ 넣습니다 ──────────────────────────────────
 * 이미 두 번 도는 처방을 그대로 씁니다. 새로 만들지 않았습니다.
 *     js/chart-indicator-kit.js:1739  positionPaneLabels()   (원조)
 *     js/chart-ohlc-legend.js         applyWidth()           (오늘 아침)
 * 차트의 칸 한 줄(tr)은 세 칸(왼축 · 그림 · 가격축)이고 ★가운데가 그림★
 * 입니다. 그 칸의 오른끝을 재서 상자의 max-width 로 넣습니다.
 * 통화를 바꾸든 창을 줄이든 저절로 따라갑니다.
 *
 * ★왼끝은 숫자로 안 적습니다.★ 상자의 지금 rect.left 를 그대로 씁니다.
 *   css/chart-toolbar.css 7) 에 "세로 막대를 .chart-wrap 안에 넣게 되면
 *   left:40px 을 켜라" 는 예비 규칙이 적혀 있습니다. left 를 8 로 박아 두면
 *   그날 이 파일도 같이 틀립니다. 재면 그런 일이 없습니다.
 *
 * ── 안 한 것 ──────────────────────────────────────────────────────────
 * · 칩을 지우지 않습니다. 글씨도 안 줄입니다.
 * · ★overflow:hidden + ellipsis 로 자르지 않습니다★ — 지표 이름이 잘리면
 *   어느 지표인지 못 읽습니다(.tl-ohlc 때와 같은 판단).
 *   .tl-ind-bar 는 이미 flex-wrap:wrap 이라 좁아지면 알아서 아래로 접힙니다.
 * · js/chart-indicators.js 를 고치지 않았습니다 — 차트팀이 같은 파일을
 *   만지는 중이라 새 모듈로 뺐습니다(수정 금지 12개는 아닙니다).
 * · 접기(fold)·칩 개수·클릭 동작에 손대지 않았습니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   index.html 의 <script src="js/chart-indbar-room.js"></script> 한 줄과
 *   style.css 의 짝 블록을 되돌립니다(보고서의 "되돌리는 방법" 참고).
 *   급하면 실행 중에 콘솔에서 App.ChartIndBarRoom.disable() 로 끕니다
 *   (인라인 max-width 를 지워 style.css 예비값으로 되돌아갑니다).
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndBarRoom = (function () {
  "use strict";

  /* 그림 영역 오른끝에서 띄우는 여백. 가격축 첫 글자(₩)에 안 닿게 하는 값입니다.
     실측(2026-09-07 · 768 KRW) — 그림 오른끝 585.5, 축 글자 시작 599.0 이라
     사이가 13.5px 입니다. 6 이면 글자에서 7.5px 남습니다. */
  var GAP = 6;
  /* 이보다 좁아지면 그냥 이만큼 씁니다. ★글씨는 줄이지 않습니다.★
     칩 하나가 제일 넓은 것이 BOLL(20, 2) 122.9px(실측)이라 그보다 조금 큽니다. */
  var MIN_W = 130;

  var bar = null;
  var wrap = null;
  var cell = null;      /* 그림 영역 칸 (가운데 td) */
  var cellRo = null;
  var chipMo = null;
  var raf = 0;
  var off = false;

  function alive(el) {
    return !!el && (el.isConnected === undefined || el.isConnected);
  }

  /** 칩 줄과 그 기준 상자(.chart-wrap)를 찾습니다. */
  function findBar() {
    if (alive(bar) && alive(wrap)) return true;
    bar = null;
    wrap = null;
    cell = null;
    var b = null;
    try {
      b = document.querySelector(".chart-panel .chart-wrap .tl-ind-bar") ||
          document.querySelector(".chart-wrap .tl-ind-bar") ||
          document.querySelector(".tl-ind-bar");
    } catch (e) {
      return false;
    }
    if (!b) return false;
    var w = b.parentNode;
    if (!w || !w.getBoundingClientRect) return false;
    bar = b;
    wrap = w;
    return true;
  }

  /** 그림 영역 칸. 차트를 다시 만들면 다시 찾습니다.
   *  세 칸(왼축 · 그림 · 가격축)짜리 tr 의 ★가운데★ 입니다. */
  function drawAreaCell() {
    if (alive(cell)) return cell;
    cell = null;
    if (!alive(wrap)) return null;
    var trs;
    try {
      trs = wrap.querySelectorAll("tr");
    } catch (e) {
      return null;
    }
    for (var i = 0; i < trs.length; i++) {
      if (trs[i].children && trs[i].children.length === 3) {
        cell = trs[i].children[1];
        break;
      }
    }
    return cell;
  }

  /** 상자를 그림 영역 안으로 좁힙니다.
   *  못 재면 아무것도 안 합니다 — style.css 의 예비 max-width 가 그대로 남습니다. */
  function apply() {
    if (off || !findBar()) return false;
    var c = drawAreaCell();
    if (!c || !c.getBoundingClientRect) return false;
    var g, br;
    try {
      g = c.getBoundingClientRect();
      br = bar.getBoundingClientRect();
    } catch (e) {
      return false;   /* 아직 화면에 안 붙었으면 다음 기회에 */
    }
    if (!g.width) return false;
    /* ★왼끝을 숫자로 안 적습니다★ — 지금 상자가 실제로 있는 자리를 씁니다.
       (맨 위 주석 참고: left 가 8 이 아닐 수 있는 예비 규칙이 있습니다) */
    var w = g.right - br.left - GAP;
    if (!(w > MIN_W)) w = MIN_W;
    var px = Math.round(w) + "px";
    if (bar.style.maxWidth !== px) bar.style.maxWidth = px;
    return true;
  }

  /* 한 프레임에 한 번만 계산합니다. resize·통화전환·칩 추가가 몰려 와도
     레이아웃을 여러 번 읽지 않습니다. */
  function schedule() {
    if (off || raf) return;
    if (!window.requestAnimationFrame) {
      apply();
      return;
    }
    raf = window.requestAnimationFrame(function () {
      raf = 0;
      apply();
    });
  }

  /* 그림 영역 폭이 달라지면 다시 잽니다 — 통화 전환 · 창 크기 · 옆 패널
     여닫기 · 전체화면을 한 번에 덮습니다.
     ⚠ 되먹임 고리가 없습니다: 칩 줄은 position:absolute 라 max-width 를
       바꿔도 그림 칸 크기에 영향을 주지 않습니다. */
  function watchCell() {
    if (cellRo || typeof window.ResizeObserver !== "function") return;
    var c = drawAreaCell();
    if (!c) return;
    try {
      cellRo = new window.ResizeObserver(schedule);
      cellRo.observe(c);
    } catch (e) {
      cellRo = null;
    }
  }

  /* 칩은 나중에도 늘어납니다(js/chart-indicator-kit.js 가 이어 붙이고,
     켠 것만 보이기가 켜졌다 꺼졌다 합니다). 그때마다 다시 잽니다.
     ★칩 줄 자신만 봅니다★ — 차트 캔버스는 안 봅니다(초당 수십 번 바뀝니다). */
  function watchChips() {
    if (chipMo || typeof MutationObserver === "undefined" || !alive(bar)) return;
    try {
      chipMo = new MutationObserver(schedule);
      chipMo.observe(bar, {
        childList: true,
        attributes: true,
        attributeFilter: ["class", "data-onlyon"]
      });
    } catch (e) {
      chipMo = null;
    }
  }

  function watchEvents() {
    if (!window.addEventListener) return;
    window.addEventListener("resize", schedule);
    try {
      if (App.Bus && typeof App.Bus.on === "function") {
        /* 통화를 바꾸면 가격축 폭이 달라집니다(원화가 더 넓습니다).
           차트가 축을 다시 그리는 데 한 박자 걸리므로 뒤에 또 잽니다 —
           ResizeObserver 가 대부분 잡아 주지만 없는 곳도 있습니다. */
        App.Bus.on("currency:change", function () {
          schedule();
          setTimeout(apply, 300);
          setTimeout(apply, 900);
        });
        /* 간격·종목을 바꾸면 값 자릿수가 달라져 축 폭이 변합니다 */
        App.Bus.on("interval:change", function () { setTimeout(apply, 600); });
        App.Bus.on("symbol:change", function () { setTimeout(apply, 600); });
      }
    } catch (e) {
      /* 무시 — resize 만으로도 대부분 따라갑니다 */
    }
  }

  /** 인라인 max-width 를 지웁니다. style.css 예비값으로 되돌아갑니다. */
  function disable() {
    off = true;
    if (cellRo) {
      try { cellRo.disconnect(); } catch (e) { /* 무시 */ }
      cellRo = null;
    }
    if (chipMo) {
      try { chipMo.disconnect(); } catch (e) { /* 무시 */ }
      chipMo = null;
    }
    if (alive(bar)) bar.style.maxWidth = "";
  }

  function init() {
    var tries = 0;
    (function wait() {
      tries++;
      if (!off && apply()) {
        watchCell();
        watchChips();
        watchEvents();
        /* 차트가 다 그려진 뒤 한 번 더 — 첫 측정 때는 축이 아직 좁을 수 있습니다 */
        setTimeout(apply, 800);
        setTimeout(apply, 2000);
        return;
      }
      if (tries < 120) setTimeout(wait, 250);
    })();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    apply: apply,
    disable: disable,
    GAP: GAP,
    MIN_W: MIN_W,
    /* 확인용 */
    getStateForTest: function () {
      return { bar: bar, wrap: wrap, cell: cell, off: off };
    },
    setElementsForTest: function (b, w, c) {
      bar = b;
      wrap = w;
      cell = c;
      off = false;
    }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.ChartIndBarRoom;
