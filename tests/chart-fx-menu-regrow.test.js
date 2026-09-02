/* ===========================================================================
 * tests/chart-fx-menu-regrow.test.js
 * ===========================================================================
 * fx 지표 목록이 "열린 뒤에 줄이 늘어나도" 화면 밖으로 안 나간다
 *
 * 2026-09-02 P2 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 ──────────────────────────────────────────────────
 *
 *   js/chart-indicator-menu.js 의 open() 은 이 순서입니다.
 *       panel = build();   <- 이때 목록에는 기본 7줄만 있습니다
 *       paint();
 *       place();           <- 여기서 높이를 재고 자리를 확정합니다
 *
 *   그런데 나머지가 place() 뒤에 들어옵니다.
 *       js/chart-indicator-kit.js       injectMenuRows()  틀 지표 줄
 *       js/chart-indicator-settings.js  decorateRows()    "+ 지표 추가" 버튼
 *   둘 다 MutationObserver 라 place() 다음 마이크로태스크에 붙습니다.
 *
 *   목록 창은 position:fixed 라 top 이 옛 높이로 굳은 채 아래로만 자랍니다.
 *   place() 가 그때 "다 들어간다" 고 봤으면 max-height 도 안 걸어서
 *   안쪽 스크롤조차 안 생깁니다. 오류도 안 나고 창도 멀쩡히 보입니다 —
 *   회원은 잘린 줄 모르고 "지표가 이것뿐" 이라고 읽습니다.
 *
 *   수리 전 실측 (localhost, 1440x900, 틀 인스턴스 7개, 스크롤 y=0)
 *       place() 시점   줄 7개  · 543px · maxHeight none · 화면밖 -260
 *       500ms 뒤       줄 14개 · 943px · maxHeight none · 화면밖 +140
 *   수리 후  줄 14개 · 631px · maxHeight 411px · 안쪽스크롤 353 · 화면밖 -260
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *
 *   [1] 원본의 place() 를 글자 그대로 떼어내지 않고, 진짜 모듈을 jsdom 에
 *       띄워 open() 을 부릅니다. 그 다음 다른 파일이 하는 것과 똑같이
 *       줄과 "+ 지표 추가" 를 나중에 끼워 넣고, 창 아래끝이 화면 안인지 봅니다.
 *       계산을 베껴 쓰면 원본이 바뀌어도 테스트는 옛 계산만 지킵니다.
 *
 *   [2] "+ 지표 추가" 는 목록 바깥 형제라 몸통을 줄여도 같이 안 줄어듭니다.
 *       그 50px 까지 셈에 들어가는지 봅니다 (상시 40~50px 넘치던 것).
 *
 *   [3] 되돌이(무한 반복) 가 없는지.
 *
 *   [4] 줄이 늘었다고 창이 닫히면 안 됩니다.
 *       replaceSoon() 은 버튼이 화면 밖이면 창을 닫습니다. 그걸 그대로 쓰면
 *       줄이 늘어난 것만으로 창이 사라집니다. 그래서 따로 두었습니다.
 *
 *   [5] 창을 닫으면 감시를 끊는지.
 *
 *   [6] 돌연변이 자체검증 — 다시 자리잡는 장치를 빼면 [1] 이 진짜 터지는가.
 *
 * ── 높이는 가짜입니다 ─────────────────────────────────────────────────
 *   jsdom 은 화면을 그리지 않아 offsetHeight 가 전부 0 입니다.
 *   그래서 아래 크기표(HEAD/ROW/...)로 진짜 브라우저 실측값을 흉내 냅니다.
 *   숫자 자체가 목적이 아니라 "늘어난 뒤 다시 재는가" 가 목적입니다.
 *
 * 이 파일은 서버도 브라우저도 부르지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const 읽기 = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const SRC = 읽기("js/chart-indicator-menu.js");

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; 실패목록.push(제목); console.log("  X " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

/* --- 진짜 브라우저에서 잰 크기 (1440x900, localhost, 2026-09-02) -------- */
const HEAD = 63;   /* 제목줄        */
const ROW = 48;    /* 지표 한 줄    */
const GROUP = 30;  /* 그룹 머리     */
const HINT = 48;   /* 안내줄        */
const FOOT = 59;   /* 발            */
const ADD = 50;    /* "+ 지표 추가" */
const WIDTH = 344;

function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="chart-panel"></div></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;

  Object.defineProperty(win, "innerWidth", { value: 옵션.w || 1440, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: 옵션.h || 900, configurable: true });

  /* jsdom 은 크기를 모릅니다 — 위 크기표로 흉내 냅니다 */
  const El = win.HTMLElement.prototype;
  Object.defineProperty(El, "offsetWidth", {
    configurable: true,
    get() { return this.id === "tl-fx-menu" ? WIDTH : 0; }
  });
  function 자연높이(el) {
    if (el.classList.contains("tl-fx-list")) {
      let h = 0;
      for (const k of el.children) h += k.classList.contains("tl-fx-group") ? GROUP : ROW;
      return h;
    }
    if (el.classList.contains("tl-fx-head")) return HEAD;
    if (el.classList.contains("tl-fx-foot")) return FOOT;
    if (el.classList.contains("tl-fx-hint")) return el.style.display === "block" ? HINT : 0;
    if (el.classList.contains("tl-cfg-add")) return ADD;
    return 0;
  }
  Object.defineProperty(El, "offsetHeight", {
    configurable: true,
    get() {
      if (this.id === "tl-fx-menu") {
        let h = 0;
        for (const k of this.children) h += k.offsetHeight;
        return h;
      }
      let h = 자연높이(this);
      const cap = parseInt(this.style.maxHeight, 10);
      if (this.classList.contains("tl-fx-list") && isFinite(cap) && cap < h) h = cap;
      return h;
    }
  });
  /* 창의 자리 = place() 가 적어 넣은 top + 지금 높이 */
  El.getBoundingClientRect = function () {
    if (this.id === "tl-fx-menu") {
      const top = parseInt(this.style.top, 10) || 0;
      const left = parseInt(this.style.left, 10) || 0;
      const h = this.offsetHeight;
      return { top, left, right: left + WIDTH, bottom: top + h, width: WIDTH, height: h };
    }
    if (this.__rect) return this.__rect;
    return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 };
  };

  win.eval("window.App = window.App || {};");
  win.App.ChartIndicators = {
    MA_PERIODS: { ma7: 7, ma25: 25, ma99: 99 }, BB_PERIOD: 20, BB_MULT: 2,
    COLORS: { ma7: "#F0B429", ma25: "#E7ECF5", ma99: "#838DA4", bb: "#838DA4" },
    isOn: () => false, toggle: () => {}
  };
  win.App.ChartOscillators = {
    RSI_PERIOD: 14, MACD_FAST: 12, MACD_SLOW: 26, MACD_SIGNAL: 9,
    COLORS: { rsi: "#F0B429", signal: "#838DA4" },
    isOn: () => false, toggle: () => {}
  };

  win.eval(옵션.소스 || SRC);

  const btn = doc.createElement("button");
  btn.__rect = { top: 60, bottom: 90, left: 700, right: 730, width: 30, height: 30 };
  doc.body.appendChild(btn);

  return { win, doc, btn, menu: win.App.ChartIndicatorMenu };
}

/* 다른 파일이 나중에 끼워 넣는 것을 그대로 흉내 냅니다 */
function 나중에끼우기(doc, 줄수) {
  const p = doc.getElementById("tl-fx-menu");
  const list = p.querySelector(".tl-fx-list");
  for (let i = 0; i < 줄수; i++) {
    const r = doc.createElement("button");
    r.className = "tl-fx-row";
    r.setAttribute("data-kit", "1");
    list.appendChild(r);                                /* chart-indicator-kit.js */
  }
  const add = doc.createElement("button");
  add.className = "tl-cfg-add";
  list.parentNode.insertBefore(add, list.nextSibling);  /* chart-indicator-settings.js */
}

function 쉬기(win, ms) {
  return new Promise((res) => win.setTimeout(res, ms));
}

function 잰다(doc, win) {
  const p = doc.getElementById("tl-fx-menu");
  if (!p) return null;
  const r = p.getBoundingClientRect();
  const list = p.querySelector(".tl-fx-list");
  return {
    줄: p.querySelectorAll(".tl-fx-row").length,
    높이: r.height, top: r.top, bottom: r.bottom,
    maxH: list.style.maxHeight || "none",
    화면밖: r.bottom - win.innerHeight,
    안내: p.querySelector(".tl-fx-hint").style.display
  };
}

(async function () {
  console.log("\nfx 지표 목록 — 열린 뒤 줄이 늘어나도 화면 밖으로 안 나간다");

  /* =======================================================================
   * [1] 나중에 줄이 붙어도 화면 안에 남는다
   * ===================================================================== */
  절('[1] place() 뒤에 줄 7개 + "+ 지표 추가" 가 붙어도 화면 안');
  {
    const t = 띄우기({ w: 1440, h: 900 });
    t.menu.open(t.btn);
    const 전 = 잰다(t.doc, t.win);
    ok("열 때는 기본 7줄이다 (다른 파일이 아직 안 붙었다)", 전.줄 === 7, String(전.줄));
    ok("그때는 다 들어가서 max-height 가 없다", 전.maxH === "none", 전.maxH);

    나중에끼우기(t.doc, 7);
    await 쉬기(t.win, 150);

    const 후 = 잰다(t.doc, t.win);
    ok("줄이 14개로 늘었다", 후.줄 === 14, String(후.줄));
    ok("창이 화면 아래로 안 넘친다 (화면밖 " + Math.round(후.화면밖) + "px, 0 이하라야 통과)",
      후.화면밖 <= 0,
      "늘어난 뒤 place() 를 다시 부르지 않으면 여기서 터집니다");
    ok("몸통에 max-height 가 걸렸다 (" + 후.maxH + ")", 후.maxH !== "none",
      "max-height 가 없으면 안쪽 스크롤도 없어 나머지 줄을 볼 방법이 없습니다");
    ok('"밀면 더 보인다" 안내줄이 켜졌다', 후.안내 === "block", 후.안내);
    ok("창 위끝이 화면 안이다 (top " + Math.round(후.top) + ")", 후.top >= 0, String(후.top));
    t.menu.close();
    t.win.close();
  }

  /* =======================================================================
   * [2] "+ 지표 추가" 는 목록 바깥 형제 — 그 높이까지 세야 한다
   * ===================================================================== */
  절('[2] "+ 지표 추가"(50px) 까지 세고 자리를 잡는다');
  {
    const t = 띄우기({ w: 1440, h: 900 });
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 7);
    await 쉬기(t.win, 150);
    const p = t.doc.getElementById("tl-fx-menu");
    const list = p.querySelector(".tl-fx-list");
    const add = p.querySelector(".tl-cfg-add");
    ok('"+ 지표 추가" 는 목록(.tl-fx-list) 의 자식이 아니다',
      !!add && add.parentNode === p && !list.contains(add),
      "구조가 바뀌었으면 이 검사의 전제를 다시 적어야 합니다");
    const r = p.getBoundingClientRect();
    const 셈 = HEAD + list.offsetHeight + HINT + FOOT + ADD;
    ok("창 높이 = 머리+몸통+안내+발+추가버튼 (" + Math.round(r.height) + " = " + 셈 + ")",
      Math.abs(r.height - 셈) < 1, Math.round(r.height) + " vs " + 셈);
    ok("그래도 화면 아래로 안 넘친다 (화면밖 " + Math.round(r.bottom - 900) + "px)",
      r.bottom - 900 <= 0,
      "추가버튼 50px 만큼 상시 넘치던 것이 이 검사입니다");
    t.menu.close();
    t.win.close();
  }

  /* =======================================================================
   * [3] 되돌이가 없다
   * ===================================================================== */
  절("[3] 무한 반복이 없다");
  {
    const t = 띄우기({ w: 1440, h: 900 });
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 7);
    await 쉬기(t.win, 300);
    const a = 잰다(t.doc, t.win);
    await 쉬기(t.win, 300);
    const b = 잰다(t.doc, t.win);
    ok("가만 두면 자리가 더 안 바뀐다 (top " + Math.round(a.top) + " -> " + Math.round(b.top) + ")",
      a.top === b.top && a.maxH === b.maxH,
      "place() 가 자기 변경에 다시 걸리면 매 프레임 흔들립니다");
    t.menu.close();
    t.win.close();
  }

  /* =======================================================================
   * [4] 줄이 늘었다고 창이 닫히면 안 된다
   * ===================================================================== */
  절("[4] 줄이 늘어도 창이 닫히지 않는다");
  {
    const t = 띄우기({ w: 360, h: 800 });
    /* 버튼이 화면 아래로 나가 있는 상황 — replaceSoon() 이면 여기서 닫힙니다 */
    t.btn.__rect = { top: 900, bottom: 930, left: 100, right: 130, width: 30, height: 30 };
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 7);
    await 쉬기(t.win, 150);
    ok("창이 그대로 열려 있다", t.menu.isOpen() === true,
      "줄이 늘어난 것만으로 창이 사라지면 회원은 눌렀는데 아무 일도 안 난 걸로 봅니다");
    const 후 = 잰다(t.doc, t.win);
    ok("그 상태에서도 화면 안이다 (화면밖 " + Math.round(후.화면밖) + "px)", 후.화면밖 <= 0);
    t.menu.close();
    t.win.close();
  }

  /* =======================================================================
   * [5] 닫으면 감시를 끊는다
   * ===================================================================== */
  절("[5] 닫으면 감시를 끊는다");
  {
    const t = 띄우기({ w: 1440, h: 900 });
    t.menu.open(t.btn);
    await 쉬기(t.win, 60);
    t.menu.close();
    ok("닫은 뒤 창이 DOM 에서 사라진다", !t.doc.getElementById("tl-fx-menu"));
    let 터짐 = null;
    try {
      const d = t.doc.createElement("div");
      t.doc.querySelector(".chart-panel").appendChild(d);
      await 쉬기(t.win, 60);
    } catch (e) { 터짐 = e; }
    ok("닫힌 뒤 DOM 이 바뀌어도 오류가 없다", 터짐 === null, String(터짐));
    t.win.close();
  }

  /* =======================================================================
   * [6] 돌연변이 자체검증
   * ===================================================================== */
  절("[6] 돌연변이 자체검증");
  {
    const 망가진 = SRC
      .replace(/\n\s*watchGrow\(true\);/, "\n")
      .replace(/\n\s*placeSoon\(\);/, "\n");
    ok("사본에서 다시 자리잡는 호출이 실제로 빠졌다", 망가진 !== SRC);

    const t = 띄우기({ w: 1440, h: 900, 소스: 망가진 });
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 7);
    await 쉬기(t.win, 150);
    const 후 = 잰다(t.doc, t.win);
    ok("-> 장치를 빼면 창이 화면 밖으로 나간다 (화면밖 " + Math.round(후.화면밖) + "px)",
      후.화면밖 > 0,
      "여기서 안 터지면 [1] 은 가짜입니다");
    t.menu.close();
    t.win.close();
  }

  /* =======================================================================
   * [7] 이 파일이 npm test 목록에 등록돼 있다
   * ===================================================================== */
  절("[7] 실행 목록 등록");
  {
    const order = 읽기("tests/_order.txt");
    ok("tests/_order.txt 에 있다",
      order.indexOf("tests/chart-fx-menu-regrow.test.js") !== -1,
      "빠지면 npm test 가 이 파일을 안 돌립니다");
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패 있음");
    실패목록.forEach((s) => console.log("  - " + s));
    process.exit(1);
  }
  console.log("전체 통과");
  process.exit(0);
})();
