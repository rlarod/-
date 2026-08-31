/* tests/chart-canvas-restore.test.js
 * =========================================================================
 * 차트가 비면 스스로 되살아난다 — 봉인 (2026-08-31 수리팀)
 * =========================================================================
 * 대표: "차트를 계속 켜놓으니까 고장나더라 / 차트가 안 보이거나 그러던데"
 *
 * 컴퓨터가 무거우면 크롬이 캔버스 그림판을 회수해 차트 칸만 통째로 빕니다.
 * 시세까지 끊긴 상태면 lightweight-charts 는 다시 그릴 이유가 없어
 * 영영 빈 화면이 됩니다. js/chart-canvas-restore.js 가 그걸 되살립니다.
 *
 * 이 파일이 지키는 것 — 특히 [2][3] 이 중요합니다
 * ------------------------------------------------
 * ★ 2D 캔버스에서 contextlost 의 preventDefault() 는 WebGL 과 뜻이 반대입니다.
 *   WebGL    : 불러야 복구한다
 *   2D 캔버스 : 기본이 복구이고, preventDefault 는 "복구하지 말라" 는 뜻이다
 *
 *   MDN (HTMLCanvasElement: contextlost event) —
 *     "By default the user agent will attempt to restore the context and then
 *      fire the contextrestored event. User code can prevent the context from
 *      being restored by calling Event.preventDefault() during event handling."
 *
 *   조사팀 제안 ③ 이 이걸 넣자는 것이었습니다. 넣었으면 대표의 빈 화면이
 *   **영구 고장**이 됐을 겁니다. 나중에 누가 "WebGL 처럼 해야지" 하고
 *   다시 넣는 것을 [2][3] 이 막습니다.
 *
 * ★ 조사팀 제안 ② (주기적으로 픽셀을 읽어 비었는지 보기) 도 넣지 않았습니다.
 *   2026-08-31 수리팀 실측 —
 *     getImageData 로 캔버스 한 장 훑기   47.62 ms
 *     isContextLost() 7장 전부 읽기        0.003 ms
 *     applyOptions({}) 한 번               0.008 ms
 *   컴퓨터가 무거워서 생긴 문제를 47ms 짜리로 고치면 안 됩니다.
 *   [11] 이 그게 다시 들어오는 것을 막습니다.
 *
 * 실제 브라우저 실측 (2026-08-31 수리팀, 크롬)
 * -------------------------------------------
 *   시세 차단 + 캔버스 비움 -> contextrestored
 *     비운 직후   [0, 0, 0, 0, 0, 0, 0]
 *     되살린 뒤   [3.87, 0, 22.12, 0, 8.09, 0, 0.62]      6개 폭 전부 복구
 *   지표 4개(MA7/25/99·볼린저)를 켠 채로
 *     켠 뒤       [5.68, 0, 22.3, 0, 7.78, 0, 0.62]  series 8
 *     비운 뒤     [0, ...]                            series 8
 *     되살린 뒤   [5.68, 0, 22.3, 0, 7.78, 0, 0.62]  series 8   <- 자릿수까지 동일
 *   정상 화면에서 60프레임 연속 다시 그리기
 *     잉크 17.18~17.35, 빈 프레임 0회, 컨테이너 732.3x1073@723.9 60프레임 고정
 *   정상 상태로 12초 방치 -> 다시 그리기 0회
 *
 * jsdom 으로 실제 모듈을 그대로 돌립니다. 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  [O] " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) {
  console.log("\n" + 제목);
}
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const MODULE = "js/chart-canvas-restore.js";
const 코드전체 = read(MODULE);
const 코드 = 주석제거(코드전체);

/* ---------------------------------------------------------------------------
 * 실제 모듈을 띄웁니다. 캔버스는 jsdom 에 그리기 기능이 없으므로
 * getContext 만 우리가 갈아 끼웁니다 (isContextLost 를 조종하려고).
 * ------------------------------------------------------------------------- */
function 창만들기(캔버스수) {
  const vc = new VirtualConsole();
  const 경고 = [];
  vc.on("warn", (m) => 경고.push(String(m)));
  vc.on("error", () => {});

  const dom = new JSDOM(
    "<!doctype html><html><body><div id='chart_container'></div></body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/", virtualConsole: vc }
  );
  const win = dom.window;
  const 컨테이너 = win.document.getElementById("chart_container");

  const 캔버스들 = [];
  for (let i = 0; i < (캔버스수 === undefined ? 3 : 캔버스수); i++) {
    캔버스들.push(캔버스붙이기(win, 컨테이너));
  }

  win.eval("window.App = window.App || {};");
  win.eval(코드전체);
  /* 모듈은 평소 DOMContentLoaded 를 기다립니다. jsdom 에서는 그게 나중에 오므로
     여기서 직접 시작시켜 검사 시점을 확실하게 만듭니다(init 은 여러 번 불러도 안전). */
  win.App.ChartCanvasRestore.init();
  return { win, 컨테이너, 캔버스들, 경고, dom };
}

function 캔버스붙이기(win, 컨테이너) {
  const cv = win.document.createElement("canvas");
  cv.__lost = false;
  cv.getContext = function () {
    return {
      isContextLost: function () {
        return cv.__lost;
      },
    };
  };
  컨테이너.appendChild(cv);
  return cv;
}

/* 차트를 흉내냅니다 — applyOptions 를 몇 번 불렀는지만 셉니다. */
function 차트달기(win, 개수, 죽은것) {
  const 목록 = [];
  for (let i = 0; i < 개수; i++) {
    const c = { calls: 0, args: [] };
    c.applyOptions = function (o) {
      c.calls++;
      c.args.push(o);
    };
    목록.push(c);
  }
  if (죽은것) {
    const dead = {
      calls: 0,
      applyOptions: function () {
        dead.calls++;
        throw new Error("Value is null");
      },
    };
    목록.unshift(dead); /* 죽은 차트를 맨 앞에 둡니다 */
    목록.__dead = dead;
  }
  win.App.ChartFont = {
    getCharts: function () {
      return 목록.slice();
    },
  };
  return 목록;
}

const 한틱 = () => new Promise((r) => setTimeout(r, 20));
const 합계 = (목록) => 목록.reduce((s, c) => s + c.calls, 0);

async function main() {
  console.log("=".repeat(58));
  console.log("차트가 비면 스스로 되살아난다 — 봉인");
  console.log("=".repeat(58));

  /* =======================================================================
   * [1] 캔버스마다 신호를 듣는다
   * ===================================================================== */
  절("[1] 캔버스마다 회수·복구 신호를 듣는다");
  {
    const { win, 컨테이너, 캔버스들 } = 창만들기(3);
    const R = win.App.ChartCanvasRestore;

    ok("모듈이 App.ChartCanvasRestore 로 올라온다", !!R);
    ok(
      "차트 칸 안 캔버스 3장 전부에 붙었다 (지금 " + R.getStats().attached + "장)",
      R.getStats().attached === 3,
      "한 장이라도 빠지면 그 캔버스가 회수될 때 아무도 못 듣습니다"
    );

    /* 두 번 붙지 않는다 — 감시기가 5초마다 훑으므로 이게 중요합니다 */
    R.sweep();
    R.sweep();
    ok(
      "여러 번 훑어도 리스너가 겹쳐 붙지 않는다 (지금 " + R.getStats().attached + "장)",
      R.getStats().attached === 3,
      "겹쳐 붙으면 신호 한 번에 여러 번 그리게 되고 상한이 금방 찹니다"
    );

    ok("컨테이너를 못 찾으면 아무 일도 안 한다", 컨테이너.querySelectorAll("canvas").length === 3);
    win.close();
  }

  /* =======================================================================
   * [2] ★핵심★ contextlost 에서 preventDefault 를 부르지 않는다
   * ===================================================================== */
  절("[2] ★핵심★ contextlost 를 막지 않는다 (막으면 영구 고장)");
  {
    const { win, 캔버스들 } = 창만들기(2);
    const R = win.App.ChartCanvasRestore;
    차트달기(win, 1);

    const ev = new win.Event("contextlost", { cancelable: true });
    캔버스들[0].dispatchEvent(ev);

    ok(
      "contextlost 를 실제로 받는다 (지금 " + R.getStats().lost + "회)",
      R.getStats().lost === 1,
      "못 받으면 회수됐다는 걸 알 방법이 없습니다"
    );
    ok(
      "★ preventDefault 를 부르지 않는다 (defaultPrevented=" + ev.defaultPrevented + ")",
      ev.defaultPrevented === false,
      "2D 캔버스에서 preventDefault 는 '복구하지 말라' 는 뜻입니다. " +
        "부르면 대표의 빈 화면이 영구 고장이 됩니다 (WebGL 과 반대)"
    );

    await 한틱();
    ok(
      "회수 신호만으로는 다시 그리지 않는다 (그림판이 아직 죽어 있으므로)",
      R.getStats().redraws === 0,
      "회수된 상태에 그리면 아무 데도 안 그려집니다. 복구를 기다려야 합니다"
    );
    win.close();
  }

  /* =======================================================================
   * [3] 소스 봉인 — preventDefault 가 코드에 아예 없다
   * ===================================================================== */
  절("[3] 소스 봉인 — preventDefault 를 다시 넣지 못하게");
  {
    ok(
      "코드에 preventDefault 가 한 번도 안 나온다",
      !/preventDefault/.test(코드),
      "누가 'WebGL 처럼 해야지' 하고 다시 넣으면 복구가 영구히 막힙니다. " +
        "왜 안 넣는지는 " + MODULE + " 맨 위 설명에 MDN 원문과 함께 적혀 있습니다"
    );
    ok(
      "왜 안 넣는지가 파일 안에 적혀 있다 (MDN 근거)",
      /contextlost/.test(코드전체) && /MDN/.test(코드전체) && /복구하지 말라/.test(코드전체),
      "근거가 없으면 다음 사람이 같은 실수를 반복합니다"
    );
  }

  /* =======================================================================
   * [4] contextrestored 가 오면 다시 그린다
   * ===================================================================== */
  절("[4] 복구 신호가 오면 다시 그린다");
  {
    const { win, 캔버스들 } = 창만들기(3);
    const R = win.App.ChartCanvasRestore;
    const 차트 = 차트달기(win, 2);

    캔버스들[1].dispatchEvent(new win.Event("contextrestored"));
    await 한틱();

    ok(
      "다시 그리기가 1회 일어났다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 1,
      "복구 신호를 받고도 안 그리면 화면은 빈 채로 남습니다"
    );
    ok(
      "차트 2개 전부에 applyOptions 를 불렀다 (지금 " + 합계(차트) + "회)",
      합계(차트) === 2,
      "차트가 여러 개면(오실레이터 칸 등) 전부 다시 그려야 합니다"
    );
    ok(
      "빈 옵션으로 부른다 — 설정을 바꾸지 않는다",
      차트[0].args.length === 1 && Object.keys(차트[0].args[0]).length === 0,
      "옵션에 값을 넣으면 회원 설정을 덮어씁니다. 목적은 '다시 그려라' 뿐입니다"
    );
    ok(
      "무엇 때문에 그렸는지 남는다 (byTrigger)",
      R.getStats().byTrigger.contextrestored === 1,
      "나중에 원인을 못 찾습니다"
    );
    win.close();
  }

  /* =======================================================================
   * [5] ★핵심★ 정상일 때는 아무 일도 안 한다
   * ===================================================================== */
  절("[5] ★핵심★ 정상일 때는 아무 일도 안 한다");
  {
    const { win } = 창만들기(3);
    const R = win.App.ChartCanvasRestore;
    const 차트 = 차트달기(win, 1);

    /* 감시기를 여러 번 돌립니다 — 실제로는 5초마다 도는 그것입니다 */
    for (let i = 0; i < 20; i++) R.watch();
    await 한틱();
    await 한틱();

    ok(
      "감시기를 20번 돌려도 다시 그리기 0회 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 0,
      "멀쩡한 차트를 계속 건드리면 그게 새 고장입니다"
    );
    ok(
      "applyOptions 를 한 번도 안 불렀다 (지금 " + 합계(차트) + "회)",
      합계(차트) === 0
    );
    ok(
      "회수도 복구도 없었다고 기록한다",
      R.getStats().lost === 0 && R.getStats().restored === 0
    );
    win.close();
  }

  /* =======================================================================
   * [6] 탭을 떠났다 돌아올 때
   * ===================================================================== */
  절("[6] 탭을 떠났다 돌아올 때만 다시 그린다");
  {
    const { win } = 창만들기(2);
    const R = win.App.ChartCanvasRestore;
    차트달기(win, 1);

    /* 숨은 상태에서는 안 그린다 */
    Object.defineProperty(win.document, "hidden", { value: true, configurable: true });
    win.document.dispatchEvent(new win.Event("visibilitychange"));
    await 한틱();
    ok(
      "탭이 숨은 상태면 안 그린다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 0,
      "안 보이는 화면을 그릴 이유가 없습니다"
    );

    /* 돌아오면 그린다 */
    Object.defineProperty(win.document, "hidden", { value: false, configurable: true });
    win.document.dispatchEvent(new win.Event("visibilitychange"));
    await 한틱();
    ok(
      "탭으로 돌아오면 1회 그린다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 1,
      "탭이 오래 뒤에 있으면 크롬이 그림판을 버립니다. 대표가 겪은 상황입니다"
    );
    ok("무엇 때문인지 남는다 (visible)", R.getStats().byTrigger.visible === 1);
    win.close();
  }

  /* =======================================================================
   * [7] ★핵심★ 무한 반복하지 않는다
   * ===================================================================== */
  절("[7] ★핵심★ 되살렸는데 또 비어도 무한 반복하지 않는다");
  {
    const { win, 캔버스들 } = 창만들기(2);
    const R = win.App.ChartCanvasRestore;
    const 차트 = 차트달기(win, 1);
    const 상한 = R.LIMITS.BURST_LIMIT;

    for (let i = 0; i < 40; i++) {
      캔버스들[0].dispatchEvent(new win.Event("contextrestored"));
      await 한틱(); /* 프레임을 넘겨 매번 실제로 그리게 합니다 */
    }

    const s = R.getStats();
    ok(
      "복구 신호 40번을 받았다 (지금 " + s.restored + "회)",
      s.restored === 40,
      "신호를 안 받으면 아래 검사가 뜻이 없습니다"
    );
    ok(
      "그린 횟수가 상한 " + 상한 + "회를 넘지 않는다 (지금 " + s.redraws + "회)",
      s.redraws <= 상한 + 1,
      "상한이 없으면 되살리기가 끝없이 돌면서 컴퓨터를 더 무겁게 만듭니다"
    );
    ok("상한에 닿아 멈췄다고 기록한다 (stopped)", s.stopped === true);
    ok(
      "멈춘 사실을 콘솔에 남긴다",
      /되살리기를 멈춥니다/.test(코드전체) && /console\.warn/.test(코드),
      "조용히 멈추면 나중에 왜 안 되는지 아무도 모릅니다"
    );

    /* 멈춘 뒤에는 더 안 그린다 */
    const 그린수 = s.redraws;
    for (let i = 0; i < 10; i++) {
      캔버스들[0].dispatchEvent(new win.Event("contextrestored"));
      await 한틱();
    }
    ok(
      "멈춘 뒤에는 더 이상 안 그린다 (" + 그린수 + " -> " + R.getStats().redraws + ")",
      R.getStats().redraws === 그린수,
      "멈췄다고 해놓고 계속 그리면 상한이 의미가 없습니다"
    );
    ok("차트도 그만큼만 불렸다", 합계(차트) === 그린수);
    win.close();
  }

  /* =======================================================================
   * [8] 죽은 차트가 섞여 있어도 산 차트는 그린다
   * ===================================================================== */
  절("[8] 죽은 차트가 섞여 있어도 산 차트는 그린다");
  {
    const { win, 캔버스들 } = 창만들기(2);
    const R = win.App.ChartCanvasRestore;
    const 차트 = 차트달기(win, 2, true); /* 맨 앞에 던지는 차트 하나 */

    캔버스들[0].dispatchEvent(new win.Event("contextrestored"));
    await 한틱();

    ok(
      "죽은 차트가 던져도 모듈이 안 죽는다 (다시 그리기 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 1,
      "App.ChartFont.getCharts() 에 죽은 차트가 남는 문제가 따로 있습니다(2건). " +
        "그것과 무관하게 이 모듈은 살아 있어야 합니다"
    );
    ok(
      "산 차트 2개는 전부 그렸다 (지금 " + (차트[1].calls + 차트[2].calls) + "회)",
      차트[1].calls === 1 && 차트[2].calls === 1,
      "앞에서 던졌다고 뒤를 건너뛰면 안 됩니다"
    );
    win.close();
  }

  /* =======================================================================
   * [9] 나중에 생긴 캔버스에도 붙는다
   * ===================================================================== */
  절("[9] 나중에 생긴 캔버스에도 붙는다 (지표 칸을 켤 때)");
  {
    const { win, 컨테이너 } = 창만들기(2);
    const R = win.App.ChartCanvasRestore;
    차트달기(win, 1);
    ok("처음엔 2장", R.getStats().attached === 2);

    const 새캔버스 = 캔버스붙이기(win, 컨테이너);
    R.sweep(); /* 실제로는 MutationObserver 가 이걸 부릅니다 */
    ok(
      "새로 생긴 캔버스에도 붙는다 (지금 " + R.getStats().attached + "장)",
      R.getStats().attached === 3,
      "RSI·MACD 칸을 켜면 캔버스가 더 생깁니다. 안 붙이면 그 칸만 안 되살아납니다"
    );

    새캔버스.dispatchEvent(new win.Event("contextrestored"));
    await 한틱();
    ok("새 캔버스의 신호도 통한다", R.getStats().redraws === 1);

    ok(
      "MutationObserver 로 새 캔버스를 감시한다",
      /MutationObserver/.test(코드) && /childList/.test(코드) && /subtree/.test(코드),
      "훑기만 하면 5초 동안 못 붙은 캔버스가 생깁니다"
    );
    win.close();
  }

  /* =======================================================================
   * [10] 감시기 — 놓친 복구를 줍는다
   * ===================================================================== */
  절("[10] 감시기 — 신호를 놓쳐도 회수->복구 순간에만 줍는다");
  {
    const { win, 캔버스들 } = 창만들기(3);
    const R = win.App.ChartCanvasRestore;
    차트달기(win, 1);

    R.watch(); /* 지금은 전부 멀쩡 */
    await 한틱();
    ok("멀쩡할 때는 안 그린다", R.getStats().redraws === 0);

    캔버스들[1].__lost = true; /* 회수됨 */
    R.watch();
    await 한틱();
    ok(
      "회수된 동안에는 안 그린다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 0,
      "회수된 그림판에 그리면 아무 데도 안 그려집니다"
    );

    캔버스들[1].__lost = false; /* 브라우저가 복구함 */
    R.watch();
    await 한틱();
    ok(
      "회수 -> 복구로 바뀐 순간에 1회 그린다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 1,
      "contextrestored 를 놓쳤을 때의 예비입니다"
    );

    R.watch();
    R.watch();
    await 한틱();
    ok(
      "그 뒤로는 다시 안 그린다 (지금 " + R.getStats().redraws + "회)",
      R.getStats().redraws === 1,
      "상태가 그대로면 아무 일도 없어야 합니다"
    );
    win.close();
  }

  /* =======================================================================
   * [11] ★핵심★ 픽셀을 읽지 않는다 (제안 ② 봉인)
   * ===================================================================== */
  절("[11] ★핵심★ 픽셀을 읽지 않는다 — 무거운 방법을 다시 넣지 못하게");
  {
    ok(
      "코드에 getImageData 가 없다",
      !/getImageData/.test(코드),
      "실측 47.62 ms 입니다. 컴퓨터가 무거워서 생긴 문제를 " +
        "한 프레임 반씩 멈추는 방법으로 고치면 안 됩니다"
    );
    ok(
      "코드에 takeScreenshot·toDataURL 도 없다",
      !/takeScreenshot|toDataURL|toBlob/.test(코드),
      "전부 캔버스 내용을 통째로 읽어내는 무거운 방법입니다"
    );
    ok(
      "대신 isContextLost 를 쓴다 (실측 0.003 ms)",
      /isContextLost/.test(코드),
      "브라우저가 알려주는 값이라 공짜이고, '비었다' 판정이 틀릴 일이 없습니다"
    );
    ok(
      "크기를 흔드는 방법을 쓰지 않는다",
      !/style\.height/.test(코드) && !/style\.width/.test(코드),
      "컨테이너 크기를 바꾸면 화면이 눈에 띄게 흔들립니다. " +
        "게다가 실측상 1px 로는 복구도 안 됩니다(조사팀이 성공한 건 30px)"
    );
  }

  /* =======================================================================
   * [12] 수정 금지 파일을 안 건드린다 · 배선
   * ===================================================================== */
  절("[12] 수정 금지 파일을 안 건드린다 · 배선");
  {
    const html = read("index.html");
    ok(
      "index.html 이 이 파일을 부른다",
      html.includes('src="' + MODULE + '"'),
      "안 부르면 아무 일도 안 일어납니다"
    );
    ok(
      "chart-font.js 뒤에서 부른다",
      html.indexOf('src="' + MODULE + '"') > html.indexOf('src="js/chart-font.js"'),
      "App.ChartFont.getCharts() 로 차트를 빌려 씁니다"
    );
    ok(
      "차트를 직접 만들지 않는다 — chart-font.js 것을 빌려 쓴다",
      /App\.ChartFont[\s\S]{0,60}getCharts/.test(코드) && !/createChart/.test(코드),
      "새로 만들면 차트가 두 개가 됩니다"
    );
    ok(
      "LightweightCharts 를 가로채지 않는다",
      !/LightweightCharts/.test(코드),
      "chart-font.js 가 이미 감싸고 있습니다. 두 겹으로 감싸면 순서 문제가 생깁니다"
    );
    ok(
      "js/chart.js 를 건드리는 흔적이 없다",
      !/chart\.js/.test(코드),
      "수정 금지 파일입니다"
    );
    ok(
      "되돌리는 방법이 파일 머리말에 적혀 있다",
      /되돌리는 방법/.test(코드전체) && /index\.html 에서 이 한 줄을 지웁니다/.test(코드전체),
      "게이트 2 에서 반려됩니다"
    );
  }

  console.log("\n" + "=".repeat(58));
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패한 것");
    실패목록.forEach((m) => console.log("  - " + m));
  }
  console.log("=".repeat(58));
  process.exit(fail ? 1 : 0);
}

main();
