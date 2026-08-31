/* js/chart-canvas-restore.js
 * =========================================================================
 * 차트가 비면 스스로 되살아납니다 (2026-08-31 수리팀)
 * =========================================================================
 *
 * 무슨 문제였나
 * -------------
 * 대표: "차트를 계속 켜놓으니까 고장나더라 / 차트가 안 보이거나 그러던데"
 *
 * 컴퓨터가 무거워지면 크롬이 캔버스 그림판(2D 그리기 판)을 회수합니다.
 * 그러면 차트 그림이 사라집니다. 호가창·시세바·버튼은 멀쩡한데
 * 차트 칸만 통째로 빕니다. 오류 메시지도 안 납니다 — 조용한 고장입니다.
 *
 * 시세가 계속 흐르면 다음 틱에 저절로 다시 그려져 0.24초 만에 돌아옵니다.
 * 그런데 시세가 끊긴 채로 회수되면 lightweight-charts 는 "값이 바뀌었을 때만"
 * 다시 그리므로 다시 그릴 이유가 없어 **영영 빈 화면**이 됩니다.
 * (조사팀 실측: 20초 뒤에도 잉크 0)
 *
 * 발생 자체는 못 막습니다 — 원인이 컴퓨터 메모리입니다.
 * 이 파일은 **비었을 때 스스로 되살아나게** 합니다.
 *
 * 어떻게 되살리나 — chart.applyOptions({})
 * ----------------------------------------
 * 라이브러리에 "다시 그려라" 를 직접 시키는 공개 명령은 없지만,
 * applyOptions() 는 옵션이 비어 있어도 전체 다시 그리기를 유발합니다.
 *
 *   2026-08-31 실측 (수리팀, 실제 크롬 1440px, 시세 차단 + 캔버스 비움 5회)
 *     비운 직후            [0, 0, 0, 0, 0, 0, 0]
 *     applyOptions({}) 뒤  [3.44, 0, 17.23, 0, 6.25, 0, 0.66]   5회 모두 복구
 *     걸린 시간            0.008 ms
 *     차트 상태 before/after 전부 동일 —
 *       scroll 0 / 보이는 구간 507~1006 / barSpacing 1.184 /
 *       rightOffset 0 / fontSize 21 / fontFamily 동일
 *
 * 조사팀은 "컨테이너 크기를 바꿨다 되돌리기(-30px)" 를 제안했지만 쓰지 않았습니다.
 *   - 눈에 보이는 크기 변화라 화면이 흔들립니다
 *   - 수리팀이 재보니 1px 로는 복구가 안 됩니다
 *     (같은 조건에서 잉크 0 -> 0. 한 프레임 띄워서 해도 0)
 *     즉 조사팀이 성공한 것은 30px 이라는 "눈에 보이는" 변화였습니다
 *   - applyOptions 는 레이아웃을 전혀 안 건드리므로 깜빡임이 원천적으로 없습니다
 *
 * 왜 preventDefault() 를 부르지 않나  ★중요★
 * ------------------------------------------
 * 조사팀 제안 ③(contextlost 에서 e.preventDefault())은 넣지 않았습니다.
 * 2D 캔버스는 WebGL 과 뜻이 정반대입니다.
 *
 *   WebGL    : preventDefault 를 불러야 복구를 시도한다
 *   2D 캔버스 : 기본이 "복구 시도"이고,
 *               preventDefault 는 "복구하지 말라" 는 뜻이다
 *
 *   MDN (HTMLCanvasElement: contextlost event) 원문 —
 *     "By default the user agent will attempt to restore the context and then
 *      fire the contextrestored event. User code can prevent the context from
 *      being restored by calling Event.preventDefault() during event handling."
 *
 * 그대로 넣었으면 대표의 빈 화면이 영구 고장이 됐을 겁니다.
 * 이 파일은 contextlost 를 듣기만 하고 기본 동작(복구 시도)을 방해하지 않습니다.
 *
 * 왜 잉크(픽셀) 검사를 주기적으로 안 하나
 * ---------------------------------------
 * 조사팀 제안 ②입니다. 비용을 재보고 뺐습니다.
 *
 *   2026-08-31 실측 (수리팀, 같은 화면)
 *     getImageData 로 본 캔버스 한 장 훑기   47.62 ms   <- 제안 ②
 *     isContextLost() 7장 전부 읽기           0.003 ms   <- 이 파일이 쓰는 것
 *     applyOptions({}) 한 번                  0.008 ms
 *
 * 47.62 ms 는 한 프레임 반이 멈추는 시간입니다.
 * 컴퓨터가 무거워서 생긴 문제를 무거운 방법으로 고치면 안 됩니다.
 * 게다가 "비었다" 를 픽셀로 판정하면 틀릴 수 있고, 틀리면 멀쩡한 차트를 계속 건드립니다.
 * 이 파일은 픽셀을 한 번도 읽지 않습니다. 브라우저가 알려주는 신호만 씁니다.
 *
 * 정상일 때 무슨 일이 일어나나
 * ----------------------------
 *   - 다시 그리기 0회. DOM 쓰기 0회. 픽셀 읽기 0회.
 *   - 5초마다 캔버스 7장의 isContextLost() 를 읽습니다 = 0.003 ms.
 *   - 탭을 떠났다 돌아올 때만 다시 그리기 1회(0.008 ms)가 일어납니다.
 *     탭이 오래 뒤에 있으면 크롬이 그림판을 버리는 일이 잦아 넣었습니다.
 *
 * 무한 반복 방지
 * --------------
 *   10초 안에 5번을 넘기면 멈추고 콘솔에 남깁니다. 다시 시작하지 않습니다.
 *   그 위에 한 판 최대 200회 상한이 하나 더 있습니다.
 *
 * 회원이 그린 선·지표·진입가 선
 * -----------------------------
 *   applyOptions({}) 는 "다시 그려라" 일 뿐 지우거나 다시 만들지 않습니다.
 *   시리즈·가격선·그린 선은 그대로 살아 있고 다시 그려집니다.
 *   위 실측에서 보이는 구간·배율·글꼴이 한 글자도 안 바뀐 것이 그 근거입니다.
 *
 * 수정 금지 파일을 건드리지 않습니다
 * ----------------------------------
 *   js/chart.js 는 한 글자도 고치지 않았습니다.
 *   차트 객체는 js/chart-font.js 가 이미 모아둔 App.ChartFont.getCharts() 에서
 *   빌려 씁니다. 새로 만들거나 가로채지 않습니다.
 *
 * ★ 되돌리는 방법 ★
 * ------------------
 *   1) index.html 에서 이 한 줄을 지웁니다
 *        <script src="js/chart-canvas-restore.js"></script>
 *   2) tests/_order.txt 에서 이 한 줄을 지웁니다
 *        chart-canvas-restore.test.js
 *   3) 파일까지 지우려면
 *        git rm js/chart-canvas-restore.js tests/chart-canvas-restore.test.js
 *   위 1)만 지워도 기능은 완전히 꺼집니다. 다른 파일에 남는 흔적이 없습니다.
 * ========================================================================= */
"use strict";

window.App = window.App || {};

App.ChartCanvasRestore = (function () {
  var CONTAINER_ID = "chart_container";

  var WATCH_MS = 5000; /* isContextLost() 훑는 주기 — 0.003ms 짜리입니다 */
  var BURST_LIMIT = 5; /* 10초 안에 5번까지 */
  var BURST_WINDOW_MS = 10000;
  var HARD_CAP = 200; /* 한 판 전체 상한 */
  var FIND_TRIES = 200; /* 컨테이너를 찾을 때까지 50ms * 200 = 10초 */

  var container = null;
  var timer = null;
  var findTimer = null;
  var pending = false;
  var warnedNoChart = false;
  var recent = [];

  var stats = {
    attached: 0, /* 리스너를 붙인 캔버스 수 */
    lost: 0, /* contextlost 를 받은 횟수 */
    restored: 0, /* contextrestored 를 받은 횟수 */
    redraws: 0, /* 실제로 다시 그린 횟수 */
    blocked: 0, /* 상한에 걸려 안 그린 횟수 */
    stopped: false, /* 상한에 닿아 멈췄나 */
    byTrigger: {},
  };

  /* ---------------- 차트 목록 ---------------- */

  /* js/chart-font.js 가 모아둔 목록을 빌려 씁니다.
     죽은 차트가 섞여 있어도 아래 redraw() 가 한 개씩 try 로 감쌉니다. */
  function getCharts() {
    try {
      if (App.ChartFont && typeof App.ChartFont.getCharts === "function") {
        return App.ChartFont.getCharts() || [];
      }
    } catch (e) {
      /* 무시 */
    }
    return [];
  }

  /* ---------------- 상한 ---------------- */

  function allow() {
    var now = Date.now();
    while (recent.length && now - recent[0] > BURST_WINDOW_MS) recent.shift();
    if (stats.redraws >= HARD_CAP) return false;
    if (recent.length >= BURST_LIMIT) return false;
    recent.push(now);
    return true;
  }

  function stop(trigger) {
    if (stats.stopped) return;
    stats.stopped = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    console.warn(
      "[chart-canvas-restore] 되살리기를 멈춥니다 — " +
        BURST_WINDOW_MS / 1000 +
        "초 안에 " +
        BURST_LIMIT +
        "번을 넘겼습니다. 다시 그려도 계속 비는 상태로 보입니다. (마지막 신호: " +
        trigger +
        ", 지금까지 " +
        stats.redraws +
        "회) 새로고침하면 다시 시작합니다."
    );
  }

  /* ---------------- 다시 그리기 ---------------- */

  function redraw(trigger) {
    if (stats.stopped) {
      stats.blocked++;
      return false;
    }
    if (!allow()) {
      stats.blocked++;
      stop(trigger);
      return false;
    }

    var charts = getCharts();
    if (!charts.length) {
      stats.blocked++;
      recent.pop(); /* 아무것도 안 했으니 횟수에서 뺍니다 */
      if (!warnedNoChart) {
        warnedNoChart = true;
        console.warn(
          "[chart-canvas-restore] 되살릴 차트를 못 찾았습니다 (App.ChartFont.getCharts() 가 비었습니다)."
        );
      }
      return false;
    }

    var drawn = 0;
    for (var i = 0; i < charts.length; i++) {
      try {
        charts[i].applyOptions({}); /* 전체 다시 그리기. 상태는 안 바뀝니다 */
        drawn++;
      } catch (e) {
        /* 이미 지워진 차트 — 조용히 건너뜁니다 */
      }
    }

    if (!drawn) {
      recent.pop();
      stats.blocked++;
      return false;
    }

    stats.redraws++;
    stats.byTrigger[trigger] = (stats.byTrigger[trigger] || 0) + 1;
    return true;
  }

  /* 같은 프레임에 신호가 여러 개 와도 한 번만 그립니다. */
  function schedule(trigger) {
    if (stats.stopped || pending) return;
    pending = true;
    var run = function () {
      pending = false;
      redraw(trigger);
    };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  /* ---------------- 캔버스 신호 듣기 ---------------- */

  function onLost() {
    stats.lost++;
    /* ★ preventDefault() 를 부르지 않습니다.
       2D 캔버스에서 그것은 "복구하지 말라" 는 뜻입니다 (맨 위 설명 참조). */
    console.warn("[chart-canvas-restore] 차트 그림판이 회수됐습니다 — 브라우저 복구를 기다립니다.");
  }

  function onRestored() {
    stats.restored++;
    schedule("contextrestored");
  }

  function attach(cv) {
    if (!cv || cv.__tlCtxHooked) return false;
    cv.__tlCtxHooked = true;
    cv.addEventListener("contextlost", onLost);
    cv.addEventListener("contextrestored", onRestored);
    stats.attached++;
    return true;
  }

  /* 지표 창을 켜면 캔버스가 나중에 더 생깁니다. 새로 생긴 것에도 붙입니다. */
  function sweep() {
    if (!container) return 0;
    var list = container.querySelectorAll("canvas");
    var n = 0;
    for (var i = 0; i < list.length; i++) if (attach(list[i])) n++;
    return n;
  }

  /* ---------------- 감시 (픽셀을 읽지 않습니다) ---------------- */

  /* contextrestored 를 놓친 경우(리스너를 붙이기 전에 회수됐다든지)를 위한 예비입니다.
     "회수됨 -> 회수 안 됨" 으로 바뀐 순간에만 다시 그립니다. */
  function watch() {
    if (stats.stopped || !container) return;
    sweep();

    var list = container.querySelectorAll("canvas");
    var revived = false;
    for (var i = 0; i < list.length; i++) {
      var cv = list[i];
      var lost;
      try {
        var ctx = cv.getContext("2d");
        if (!ctx || typeof ctx.isContextLost !== "function") continue;
        lost = ctx.isContextLost();
      } catch (e) {
        continue;
      }
      if (cv.__tlWasLost && !lost) revived = true;
      cv.__tlWasLost = lost;
    }
    if (revived) schedule("watchdog");
  }

  /* ---------------- 시작 ---------------- */

  function bind() {
    /* 탭을 떠났다 돌아왔을 때. 오래 뒤에 있으면 크롬이 그림판을 버립니다. */
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule("visible");
    });
    /* 뒤로가기 복원(bfcache) */
    window.addEventListener("pageshow", function (e) {
      if (e && e.persisted) schedule("pageshow");
    });

    /* 캔버스가 나중에 더 생겨도 놓치지 않게 */
    if (typeof window.MutationObserver === "function") {
      var mo = new window.MutationObserver(function () {
        sweep();
      });
      mo.observe(container, { childList: true, subtree: true });
    }

    sweep();
    timer = setInterval(watch, WATCH_MS);
  }

  function init() {
    if (container) return true;
    container = document.getElementById(CONTAINER_ID);
    if (!container) return false;
    bind();
    return true;
  }

  /* 차트 컨테이너가 생길 때까지 잠깐 기다립니다. */
  function start() {
    if (init()) return;
    var tries = 0;
    findTimer = setInterval(function () {
      if (init() || ++tries > FIND_TRIES) {
        clearInterval(findTimer);
        findTimer = null;
      }
    }, 50);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }

  return {
    init: init,
    sweep: sweep,
    watch: watch,
    redraw: redraw,
    getStats: function () {
      return {
        attached: stats.attached,
        lost: stats.lost,
        restored: stats.restored,
        redraws: stats.redraws,
        blocked: stats.blocked,
        stopped: stats.stopped,
        byTrigger: JSON.parse(JSON.stringify(stats.byTrigger)),
      };
    },
    /* 테스트용 — 상한을 다시 열어둡니다. 회원 화면에서는 아무도 안 부릅니다. */
    reset: function () {
      recent = [];
      stats.attached = 0;
      stats.lost = 0;
      stats.restored = 0;
      stats.redraws = 0;
      stats.blocked = 0;
      stats.stopped = false;
      stats.byTrigger = {};
      warnedNoChart = false;
    },
    LIMITS: {
      WATCH_MS: WATCH_MS,
      BURST_LIMIT: BURST_LIMIT,
      BURST_WINDOW_MS: BURST_WINDOW_MS,
      HARD_CAP: HARD_CAP,
    },
  };
})();
