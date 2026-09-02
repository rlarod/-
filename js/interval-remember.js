/* =========================================================================
 * js/interval-remember.js — App.IntervalRemember
 * =========================================================================
 * 새로고침해도 ★시간 단위(1분·5분·1시간…)★ 를 기억합니다.
 *
 * ── 왜 만들었나 ────────────────────────────────────────────────────────
 * 2026-09-02 점검팀 발견 [P3] — 차트에서 새로고침 뒤 살아나는 것과 아닌 것.
 *
 *   살아남   지표 · 지표 색·설정 · 가격축(로그/퍼센트) · 봉 종류 · 그림 · 알람
 *   ★안 살아남★  시간 단위 하나. 무조건 1분으로 돌아갑니다
 *
 * js/ 전체에서 활성 간격을 저장하는 코드가 ★0곳★ 이었습니다
 * (js/config.js:131  let activeInterval = "1m"; 이 매번 처음부터 시작).
 * 트레이딩뷰·바이낸스는 둘 다 기억합니다.
 *
 * ── 어떻게 하나 ────────────────────────────────────────────────────────
 *   저장   App.Bus 의 "interval:change" 를 듣고 App.Storage 에 적습니다.
 *          ★어떤 경로로 바뀌든★ 다 잡힙니다 — 버튼 · 더보기 메뉴 ·
 *          표시 기간 탭(js/chart-date-range.js) · 날짜로 가기 · 콘솔.
 *   되살림 ★이 파일이 실리는 순간★(js/chart.js 의 init 보다 먼저) 활성 간격을
 *          바꿔 둡니다. 그래서 js/chart.js 는 처음부터 그 간격으로 한 번만
 *          불러옵니다 — ★1분봉을 받았다가 다시 받는 낭비가 없습니다.★
 *
 * ── ⚠ 표시 기간 탭과 싸우지 않게 ───────────────────────────────────────
 * js/chart-date-range.js 의 기간 탭은 봉 간격을 같이 바꿉니다(1M → 2시간).
 * 그것도 그냥 "회원이 고른 간격" 으로 보고 똑같이 저장합니다.
 *   · 되살리는 것은 ★간격뿐★ 입니다. 기간(화면 범위)은 되살리지 않습니다 —
 *     그래서 새로고침 뒤에 탭 불이 꺼져 있고 화면도 기본 범위입니다.
 *     ★"탭은 1M 인데 화면은 아닌" 어긋난 상태를 만들지 않으려고 일부러 그렇게★
 *     했습니다.
 *   · 되살리는 일은 ★페이지가 열릴 때 딱 한 번★ 이라, 그 뒤에 탭이 무엇을
 *     하든 끼어들지 않습니다.
 *
 * ── ⚠ 1초·5초·15초는 되살아나지 않습니다 (그게 맞습니다) ───────────────
 * js/interval-guard.js 가 그 세 개를 막고 있습니다(TL-004 — 그 간격에서는
 * 시세 신호가 0회라 강제청산·손절·익절이 조용히 멈춥니다).
 * 그 파일이 setActiveInterval 을 감싸고 있어서, 우리가 되살리려 해도
 * ★그 자리에서 1분으로 되돌아갑니다.★ 목록을 여기에 다시 적지 않았습니다 —
 * 두 곳에 적으면 한쪽만 고쳐서 어긋납니다.
 *
 * ── 수정 금지 파일을 건드리지 않습니다 ─────────────────────────────────
 *   js/config.js · js/chart.js 무수정. 공개된 함수만 부릅니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   1) index.html 에서 <script src="js/interval-remember.js"></script> 한 줄 삭제
 *   2) rm js/interval-remember.js
 *   3) 회원 브라우저에 남는 값은 localStorage 의 btc_sim_v2_chart-interval
 *      하나뿐이고, 파일이 없으면 아무도 읽지 않습니다
 *   실행 중에 잠깐 끄려면 콘솔에서 App.IntervalRemember.disable()
 * ========================================================================= */

window.App = window.App || {};

App.IntervalRemember = (function () {
  "use strict";

  var STORAGE_KEY = "chart-interval";

  var off = false;
  var bound = false;
  var restored = null; /* 무엇을 되살렸는지 (점검용) */

  function known(value) {
    try {
      var list = App.Config.getIntervals();
      for (var i = 0; i < list.length; i++) if (list[i].value === value) return true;
    } catch (e) {
      /* 무시 */
    }
    return false;
  }

  function load() {
    try {
      if (!App.Storage || typeof App.Storage.load !== "function") return null;
      var s = App.Storage.load(STORAGE_KEY);
      return s && s.interval ? s.interval : null;
    } catch (e) {
      return null;
    }
  }

  function save(value) {
    try {
      if (!App.Storage || typeof App.Storage.save !== "function") return;
      App.Storage.save(STORAGE_KEY, { interval: value });
    } catch (e) {
      /* 무시 — 저장이 안 돼도 화면은 그대로 돕니다 */
    }
  }

  /* =====================================================================
   * 되살리기 — ★js/chart.js 가 첫 캔들을 받기 전★ 에 끝나야 합니다
   * ===================================================================== */
  function restore() {
    if (off) return false;
    var want = load();
    if (!want) return false;
    if (!known(want)) return false; /* 목록에서 없어진 값이면 그냥 둡니다 */

    /* ★막힌 간격은 아예 되살리지 않습니다★ (1초·5초·15초 — TL-004).
       ⚠ 목록을 여기에 다시 적지 않고 js/interval-guard.js 에게 ★물어봅니다★.
         두 곳에 적으면 한쪽만 고쳐서 어긋납니다.
       ⚠ 왜 물어봐야 하나 — 그 파일은 DOMContentLoaded 에 setActiveInterval 을
         감쌉니다. 이 파일은 그보다 ★먼저★ 실리므로, 그냥 부르면 감싸기 전이라
         1초가 잠깐 걸렸다가 나중에 1분으로 튕깁니다(실측으로 확인했습니다).
         회원 화면에서는 빈 차트가 한 번 번쩍입니다. 그래서 미리 거릅니다. */
    try {
      if (App.IntervalGuard && typeof App.IntervalGuard.isBlocked === "function") {
        if (App.IntervalGuard.isBlocked(want)) {
          save(App.Config.getActiveInterval()); /* 다음에 또 시도하지 않게 고쳐 둡니다 */
          return false;
        }
      }
    } catch (e) {
      /* 무시 — 아래에서 그대로 진행합니다 */
    }

    try {
      if (App.Config.getActiveInterval() === want) return true;
      App.Config.setActiveInterval(want);
      /* 그래도 무언가가 되돌렸으면 저장칸을 실제 값에 맞춥니다 */
      var now = App.Config.getActiveInterval();
      if (now !== want) save(now);
      restored = now;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* =====================================================================
   * 저장 걸기
   * ===================================================================== */
  function bind() {
    if (bound || off) return false;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    App.Bus.on("interval:change", function (d) {
      if (off) return;
      var v = d && d.interval;
      if (v === undefined) {
        try {
          v = App.Config.getActiveInterval();
        } catch (e) {
          return;
        }
      }
      if (v && known(v)) save(v);
    });
    bound = true;
    return true;
  }

  function init() {
    restore();
    if (bind()) return;
    /* App.Bus 가 아직 없으면 잠깐 다시 시도합니다 */
    var n = 0;
    var t = setInterval(function () {
      if (off || bind() || ++n > 100) clearInterval(t);
    }, 100);
  }

  init();

  return {
    STORAGE_KEY: STORAGE_KEY,
    /* 실제로 되살아난 간격. 아무 것도 안 했으면 null 입니다 */
    getRestored: function () {
      return restored;
    },
    /* 점검·테스트용 */
    forceRestore: restore,
    disable: function () {
      off = true;
    },
  };
})();
