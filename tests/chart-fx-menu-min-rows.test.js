/* ===========================================================================
 * tests/chart-fx-menu-min-rows.test.js
 * ===========================================================================
 * fx 지표 목록이 폰에서 "지표를 한 줄도" 안 보여주면 안 된다
 *
 * 2026-09-03 P1 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 ──────────────────────────────────────────────────
 *
 *   360 · 375 · 390 에서 화면을 조금 내린 뒤(scrollY 250~325) fx 를 누르면
 *   창은 멀쩡히 뜨는데 ★지표 줄이 9개 중 0개★ 보였습니다.
 *   보이는 것은 "지표" · "주 차트" · "+ 지표 추가" · 안내줄 · 발줄 뿐입니다.
 *   오류 0건 · 화면 안 깨짐 → 회원은 "지표가 하나도 없네" 로 읽습니다.
 *   CLAUDE.md 가 말하는 ★조용한 고장★ 입니다.
 *
 *   수리 전 실측 (localhost 360x800, scrollY 300, 지표 9줄)
 *       fx 버튼 262~306 · 지표막대 422~445 · 주문막대 위끝 727 (floor 719)
 *       창 449~719 (270px) · 목록 50px · ★0/9줄★ · 안 쓴 화면 441px
 *   수리 후  창 8~719 (711px) · 목록 491px · ★8/9줄★ · 안 쓴 화면 0px
 *
 *   원인은 ★두 겹★ 이었습니다. 둘 다 못 박습니다.
 *
 *     ① 최소 보장값이 38 로 ★박혀★ 있었습니다.
 *        js/chart-indicator-menu.js 26줄 주석의 "줄 한 칸 136x38"
 *        (2026-08-27 바이낸스 실측) 을 옮긴 값인데, 그 뒤 설정 톱니가 붙고
 *        글씨가 커지면서 ★줄 높이가 50px 로 자랐습니다★.
 *        38px 에는 제목줄(.tl-fx-group 39px)조차 안 들어갑니다.
 *        "최소 한 줄은 보이게" 라는 주석이 거짓말이 됐습니다.
 *
 *     ② 창이 ★버튼 한쪽 자리★ 만 봤습니다.
 *        화면에 711px(8~719) 이 있는데 아래쪽 270px 만 썼습니다.
 *        .tl-ind-bar 가 below 를 449 까지 밀어내려 아래가 270px 이 됐고,
 *        위쪽(250px)은 그보다도 좁아서 아래쪽이 뽑혔습니다.
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *
 *   [1] 고장났던 그 자리 그대로 — 360x800 · scrollY 300 · 9줄 에서
 *       ★한 줄 이상★ 이 온전히 보이는가. 0줄이면 터집니다.
 *
 *   [2] ★숫자를 다시 박으면 터집니다★ — 줄 높이를 50 -> 90 으로 키워
 *       같은 자리를 다시 잽니다. 보장값이 "재서" 나온 것이면 같이 커지고,
 *       누가 38 이나 109 를 박아 넣으면 여기서 빨개집니다.
 *       ★이 검사가 이 봉인의 핵심입니다★ — 같은 고장이 다시 나는 길은
 *       "숫자를 박는 것" 하나뿐이었습니다.
 *
 *   [3] 다음 줄이 ★걸쳐서★ 보이는가. 회원이 "밀면 더 있다" 를 알아야 합니다.
 *
 *   [4] 창이 하단 주문막대 밑으로 안 내려가는가 (floorY).
 *       넓히다가 이걸 깨면 고장을 다른 고장으로 바꾼 것입니다.
 *
 *   [5] ★자리가 넉넉하면 넓히지 않는다★ — 멀쩡한 것을 건드리면 안 됩니다.
 *       버튼에 붙어서 열리던 것은 그대로 붙어서 열려야 합니다.
 *
 *   [6] 다 들어간 때는 "밀면 나머지가 보입니다" 안내줄을 끈다.
 *       밀 것이 없는데 밀라고 하면 그것도 거짓말입니다.
 *
 *   [7] 돌연변이 자체검증 — ①과 ②의 장치를 각각 빼면 [1] 이 진짜 터지는가.
 *       고장난 코드에 돌연변이를 넣으면 고장->고장이라 아무것도 증명 못 하므로,
 *       ★지금 코드가 통과한다는 것을 먼저 확인한 뒤★ 사본을 망가뜨립니다.
 *
 * ── 높이는 가짜입니다 ─────────────────────────────────────────────────
 *   jsdom 은 화면을 그리지 않아 offsetHeight 가 전부 0 입니다.
 *   그래서 아래 크기표로 ★진짜 브라우저 실측값★ 을 흉내 냅니다.
 *   흉내가 진짜와 같은 답을 내는지는 [0] 에서 먼저 확인합니다 —
 *   흉내가 틀리면 이 봉인 전체가 헛것이 됩니다.
 *
 *   ⚠ scrollHeight 는 쓰지 않습니다. jsdom 은 늘 0 이라 "다 들어갔다" 로
 *     읽혀 검사가 조용히 헛것이 됩니다.
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

/* --- 진짜 브라우저에서 잰 크기 (360x800, localhost, 2026-09-03) ---------
   agent-browser 로 CDP 실제 클릭 후 잰 값입니다.
     머리 56 · 지표추가 50 · 안내 41 · 발 72  = chrome 220
     지표 한 줄 50 · 그룹 제목 39 · 목록 자연높이 526 (그룹2 + 줄9)         */
const HEAD = 56;
const GROUP = 39;
const HINT = 41;
const FOOT = 72;
const ADD = 50;
const WIDTH = 344;

/* 고장났던 그 자리 그대로 (360x800 · scrollY 300) */
const 폰 = {
  w: 360, h: 800,
  주문막대: { top: 727, bottom: 800 },   /* floorY() = 727 - 8 = 719 */
  지표막대: { top: 422, bottom: 445 },
  fx버튼:  { top: 262, bottom: 306, left: 116, right: 160 }
};

function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const ROW = 옵션.줄높이 || 50;
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="chart-panel"></div></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;

  Object.defineProperty(win, "innerWidth", { value: 옵션.w || 폰.w, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: 옵션.h || 폰.h, configurable: true });

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
    /* ⚠ 줄·제목줄에도 키를 줘야 합니다. 0 으로 두면 minListH() 가
         "못 쟀다" 로 빠져 되돌림값(50)을 쓰고, [2] 가 아무것도 안 지킵니다.
         (실제로 이 테스트를 쓰면서 한 번 그렇게 헛돌았습니다) */
    if (el.classList.contains("tl-fx-group")) return GROUP;
    if (el.classList.contains("tl-fx-row")) return ROW;
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

  /* 폰의 하단 매수/매도 바 — floorY() 가 이걸 봅니다 */
  if (!옵션.막대없음) {
    const bar = doc.createElement("div");
    bar.className = "tl-order-bar";
    bar.__rect = {
      top: 폰.주문막대.top, bottom: 폰.주문막대.bottom,
      left: 0, right: 옵션.w || 폰.w,
      width: 옵션.w || 폰.w, height: 폰.주문막대.bottom - 폰.주문막대.top
    };
    doc.body.appendChild(bar);
  }
  /* "지금 무엇이 켜져 있나" 막대 — 아래로 열 때 이걸 안 덮습니다 */
  if (!옵션.지표막대없음) {
    const ib = 옵션.지표막대 || 폰.지표막대;
    const 폭 = 옵션.w || 폰.w;
    const ind = doc.createElement("div");
    ind.className = "tl-ind-bar";
    /* 실제 지표 막대는 차트 칸 가로를 다 씁니다.
       좁게 잡으면 place() 의 「가로로 겹치나」 검사에 안 걸려
       막대를 안 피하게 되고, 그러면 고장 자리가 재현되지 않습니다. */
    ind.__rect = {
      top: ib.top, bottom: ib.bottom,
      left: 0, right: 폭, width: 폭,
      height: ib.bottom - ib.top
    };
    doc.body.appendChild(ind);
  }

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
  const b = 옵션.버튼 || 폰.fx버튼;
  btn.__rect = {
    top: b.top, bottom: b.bottom, left: b.left, right: b.right,
    width: b.right - b.left, height: b.bottom - b.top
  };
  doc.body.appendChild(btn);

  return { win, doc, btn, ROW, menu: win.App.ChartIndicatorMenu };
}

/* chart-indicator-kit.js 와 chart-indicator-settings.js 가
   place() ★뒤에★ 끼워 넣는 것을 그대로 흉내 냅니다 */
function 나중에끼우기(doc, 줄수) {
  const p = doc.getElementById("tl-fx-menu");
  const list = p.querySelector(".tl-fx-list");
  for (let i = 0; i < 줄수; i++) {
    const r = doc.createElement("button");
    r.className = "tl-fx-row";
    r.setAttribute("data-kit", "1");
    list.appendChild(r);
  }
  const add = doc.createElement("button");
  add.className = "tl-cfg-add";
  list.parentNode.insertBefore(add, list.nextSibling);
}

const 쉬기 = (win, ms) => new Promise((res) => win.setTimeout(res, ms));

/* 목록 칸 안에서 ★온전히★ 보이는 지표 줄이 몇 개인가.
   브라우저가 하는 것과 같습니다 — 위에서부터 쌓다가 칸 높이를 넘으면 잘립니다. */
function 잰다(doc, win, ROW) {
  const p = doc.getElementById("tl-fx-menu");
  if (!p) return null;
  const list = p.querySelector(".tl-fx-list");
  const 칸높이 = list.offsetHeight;
  let y = 0, 온전한줄 = 0, 걸친줄 = 0, 자연 = 0;
  for (const k of list.children) {
    const h = k.classList.contains("tl-fx-group") ? GROUP : ROW;
    const 줄인가 = k.classList.contains("tl-fx-row");
    if (줄인가) {
      if (y + h <= 칸높이 + 0.5) 온전한줄++;
      if (y < 칸높이 - 0.5 && y + h > 칸높이 + 0.5) 걸친줄++;
    }
    y += h; 자연 += h;
  }
  const r = p.getBoundingClientRect();
  return {
    전체줄: p.querySelectorAll(".tl-fx-row").length,
    온전한줄, 걸친줄, 칸높이, 목록자연높이: 자연,
    창높이: r.height, top: r.top, bottom: r.bottom,
    안내: p.querySelector(".tl-fx-hint").style.display
  };
}

/* 하단 주문막대를 뺀 "내려가도 되는 마지노선" — 원본 floorY() 와 같은 규칙 */
const FLOOR = 폰.주문막대.top - 8;   /* 719 */
const TOPEDGE = 8;

(async function () {
  console.log("\nfx 지표 목록 — 폰에서 지표를 한 줄도 안 보여주면 안 된다");

  /* =======================================================================
   * [0] 흉내가 진짜와 같은 답을 내는가
   *     이게 틀리면 아래 검사가 전부 헛것입니다.
   * ===================================================================== */
  절("[0] 가짜 화면이 브라우저 실측과 같은 답을 내는가");
  {
    const t = 띄우기({});
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 2);
    await 쉬기(t.win, 150);
    const m = 잰다(t.doc, t.win, t.ROW);

    ok("지표 줄이 9개다 (브라우저 실측과 같음)", m.전체줄 === 9, String(m.전체줄));
    ok("목록 자연높이가 526~530 이다 (브라우저 실측 526)",
      m.목록자연높이 >= 520 && m.목록자연높이 <= 535, String(m.목록자연높이));
    const chrome = m.창높이 - m.칸높이;
    /* 브라우저 220, 가짜 화면 219 — 차이 1px 은 창 테두리(1px)입니다.
       흉내는 테두리를 안 그리므로 1px 여유를 둡니다. */
    ok("chrome(머리+추가+안내+발) 이 219~220 이다 (브라우저 실측 220, 테두리 1px 차이)",
      chrome >= 219 && chrome <= 220, String(chrome));
    ok("창 아래끝이 브라우저 실측(719) 과 같다", m.bottom === FLOOR, String(m.bottom));
    ok("창 높이가 브라우저 실측(711) 과 같다", m.창높이 === 711, String(m.창높이));
    t.menu.close(); t.win.close();
  }

  /* =======================================================================
   * [1] 고장났던 그 자리에서 한 줄 이상 보인다
   * ===================================================================== */
  절("[1] 360x800 · scrollY 300 · 9줄 — 지표가 한 줄 이상 온전히 보인다");
  {
    const t = 띄우기({});
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 2);
    await 쉬기(t.win, 150);
    const m = 잰다(t.doc, t.win, t.ROW);

    ok("★지표 줄이 0개가 아니다★ (온전히 " + m.온전한줄 + "/" + m.전체줄 + "줄)",
      m.온전한줄 >= 1,
      "0줄이면 회원은 '지표 기능이 없구나' 로 결론냅니다 — 조용한 고장입니다");
    ok("수리 전(0줄) 보다 나아졌다 — 8줄 이상 보인다 (" + m.온전한줄 + "줄)",
      m.온전한줄 >= 8,
      "브라우저 실측 8/9줄. 이보다 적으면 화면을 덜 쓴 것입니다");
    t.menu.close(); t.win.close();
  }

  /* =======================================================================
   * [2] ★숫자를 다시 박으면 터진다★ — 줄 높이를 키워서 확인
   * ===================================================================== */
  절("[2] 줄 높이가 또 자라도 따라온다 (38 처럼 박아 넣으면 여기서 터짐)");
  {
    for (const 줄높이 of [50, 70, 90]) {
      const t = 띄우기({ 줄높이 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);

      ok("줄 높이 " + 줄높이 + "px 에서도 한 줄 이상 온전히 보인다 (" +
        m.온전한줄 + "줄 · 목록 " + m.칸높이 + "px)",
        m.온전한줄 >= 1,
        "보장 높이를 「재지 않고」 숫자로 박으면 줄이 자랄 때 여기서 터집니다");
      ok("줄 높이 " + 줄높이 + "px — 목록 칸이 제목줄+한 줄(" +
        (GROUP + 줄높이) + "px) 보다 크다 (" + m.칸높이 + "px)",
        m.칸높이 >= GROUP + 줄높이,
        "제목줄(.tl-fx-group " + GROUP + "px)을 빼먹으면 첫 줄이 잘립니다 — 이게 원래 고장이었습니다");
      t.menu.close(); t.win.close();
    }
  }

  /* =======================================================================
   * [2-2] ★숫자를 박으면 여기서 터집니다★
   *   [2] 는 넓히기가 늘 이겨서 need 값 자체를 구별하지 못합니다.
   *   그래서 "넓힐지 말지" 가 need 로 갈리는 자리를 따로 만듭니다.
   *     지표막대를 340~366 에 두면 아래 자리가 349px 이 되고
   *     cap - chrome = 130 이 됩니다.
   *       줄 50px -> need 109  : 130 >= 109 이라 안 넓힘. 목록 130px (한 줄+걸침)
   *       줄 90px -> need 165  : 130 <  165 이라 넓힘.   목록 492px (다섯 줄)
   *   여기에 109 를 박아 넣으면 줄 90px 에서 안 넓혀 목록이 130px 에 머물고
   *   제목줄 39 + 줄 90 = 129 라 ★한 줄이 간신히★ 들어갑니다 -> 아래 검사가 터집니다.
   * ===================================================================== */
  절("[2-2] 넓힐지 말지가 「잰 값」 으로 갈린다 (109 를 박아도 터짐)");
  {
    for (const 줄높이 of [50, 90]) {
      const t = 띄우기({ 줄높이, 지표막대: { top: 340, bottom: 366 } });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      const 최소 = GROUP + Math.ceil(줄높이 * 1.4);
      ok("줄 " + 줄높이 + "px — 목록이 제목줄+한 줄+걸침(" + 최소 + "px) 이상이다 (" +
        m.칸높이 + "px · " + m.온전한줄 + "줄)",
        m.칸높이 >= 최소,
        "need 를 「재지 않고」 숫자로 박으면 줄이 자랄 때 여기서 터집니다");
      t.menu.close(); t.win.close();
    }
  }

  /* =======================================================================
   * [3] 다음 줄이 걸쳐 보인다 ("밀면 더 있다" 를 알 수 있게)
   * ===================================================================== */
  절("[3] 다음 줄이 걸쳐 보여서 「밀면 더 있다」 를 알 수 있다");
  {
    const t = 띄우기({});
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 2);
    await 쉬기(t.win, 150);
    const m = 잰다(t.doc, t.win, t.ROW);
    ok("잘린 줄이 걸쳐 보이거나, 아니면 다 보인다 (걸친 " + m.걸친줄 +
      " · 온전 " + m.온전한줄 + "/" + m.전체줄 + ")",
      m.걸친줄 >= 1 || m.온전한줄 === m.전체줄,
      "딱 떨어지게 자르면 회원은 나머지가 있는 줄 모릅니다");
    ok("안내줄이 켜져 있다 (아직 다 안 보이므로)", m.안내 === "block", m.안내);
    t.menu.close(); t.win.close();
  }

  /* =======================================================================
   * [4] 넓히더라도 하단 주문막대 밑으로는 안 내려간다
   * ===================================================================== */
  절("[4] 넓혀도 하단 매수/매도 바 밑으로 안 내려간다");
  {
    for (const 줄높이 of [50, 90]) {
      const t = 띄우기({ 줄높이 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      ok("줄 " + 줄높이 + "px — 창 아래끝(" + m.bottom + ") 이 주문막대 위(" +
        FLOOR + ") 안이다", m.bottom <= FLOOR,
        "고장을 다른 고장으로 바꾸면 안 됩니다");
      ok("줄 " + 줄높이 + "px — 창 위끝(" + m.top + ") 이 화면 안이다",
        m.top >= TOPEDGE - 0.5, String(m.top));
      t.menu.close(); t.win.close();
    }
  }

  /* =======================================================================
   * [5] 자리가 넉넉하면 넓히지 않는다 (멀쩡한 것을 건드리지 않는다)
   * ===================================================================== */
  절("[5] 자리가 넉넉하면 지금까지처럼 버튼에 붙어서 열린다");
  {
    /* 큰 화면 · 버튼이 위쪽 · 지표막대 없음 -> 아래로 다 들어갑니다 */
    const t = 띄우기({
      w: 1440, h: 1400, 막대없음: true, 지표막대없음: true,
      버튼: { top: 60, bottom: 90, left: 700, right: 730 }
    });
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 2);
    await 쉬기(t.win, 150);
    const m = 잰다(t.doc, t.win, t.ROW);

    ok("창 위끝이 버튼 아래 4px 에 붙는다 (top " + m.top + ", 기대 94)",
      m.top === 94,
      "자리가 넉넉한데 화면 전체로 넓히면 멀쩡하던 것을 건드린 것입니다");
    ok("자를 필요가 없으니 지표가 전부 보인다 (" + m.온전한줄 + "/" + m.전체줄 + ")",
      m.온전한줄 === m.전체줄, m.온전한줄 + "/" + m.전체줄);
    t.menu.close(); t.win.close();
  }

  /* =======================================================================
   * [6] 다 들어가면 "밀면 나머지가 보입니다" 를 끈다
   * ===================================================================== */
  절("[6] 다 들어간 때는 안내줄을 끈다 (밀 것이 없는데 밀라고 하지 않는다)");
  {
    /* 한쪽 자리로는 모자라 넓히지만, 넓히면 전부 들어가는 크기 */
    /* 브라우저 실측 자리 그대로 — 1440x800 · scrollY 325 (주문막대 없음)
       fx 버튼 319~379 · 지표막대 426~475 -> 넓히면 9줄이 전부 들어갑니다 */
    const t = 띄우기({
      w: 1440, h: 800, 막대없음: true,
      지표막대: { top: 426, bottom: 475 },
      버튼: { top: 319, bottom: 379, left: 700, right: 760 }
    });
    t.menu.open(t.btn);
    나중에끼우기(t.doc, 2);
    await 쉬기(t.win, 150);
    const m = 잰다(t.doc, t.win, t.ROW);

    if (m.온전한줄 === m.전체줄) {
      ok("다 보이면 안내줄이 꺼진다 (" + m.안내 + ")", m.안내 === "none",
        "밀 것이 없는데 「밀면 나머지가 보입니다」 라고 하면 그것도 거짓말입니다");
    } else {
      ok("아직 잘렸으므로 안내줄은 켜져 있다 (" + m.안내 + ")", m.안내 === "block", m.안내);
    }
    t.menu.close(); t.win.close();
  }

  /* =======================================================================
   * [7] 돌연변이 자체검증
   *     ⚠ 먼저 "지금 코드가 통과한다" 를 확인했습니다([1]).
   *       고장난 코드에 돌연변이를 넣으면 고장->고장이라 아무 증명도 안 됩니다.
   * ===================================================================== */
  절("[7] 돌연변이 — 장치를 빼면 [1] 이 진짜 터지는가");
  {
    /* ① 옛날처럼 "38" 을 박아 넣는다 */
    const 옛38 = SRC.replace(
      /var need = minListH\(listEl\);/,
      "var need = 38;"
    );
    ok("사본에서 need 를 38 로 되돌렸다", 옛38 !== SRC, "치환 실패 — 검사가 헛것이 됩니다");
    {
      const t = 띄우기({ 소스: 옛38 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      ok("-> 38 로 박으면 지표가 " + m.온전한줄 + "줄로 줄어든다 (8줄 미만이라야 증명됨)",
        m.온전한줄 < 8,
        "여기가 안 터지면 [2] 가 아무것도 안 지키고 있다는 뜻입니다");
      t.menu.close(); t.win.close();
    }

    /* ①-2 38 대신 109 를 박아도 (지금 줄 높이엔 맞는 값) 터지는가 */
    const 박은109 = SRC.replace(/var need = minListH\(listEl\);/, "var need = 109;");
    ok("사본에서 need 를 109 로 박았다", 박은109 !== SRC, "치환 실패");
    {
      const t = 띄우기({ 줄높이: 90, 지표막대: { top: 340, bottom: 366 }, 소스: 박은109 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      ok("-> 109 를 박으면 줄 90px 에서 목록이 " + m.칸높이 + "px 로 주저앉는다 (165 미만이라야 증명됨)",
        m.칸높이 < GROUP + Math.ceil(90 * 1.4),
        "여기가 안 터지면 [2-2] 가 아무것도 안 지키고 있다는 뜻입니다");
      t.menu.close(); t.win.close();
    }

    /* ② 화면 전체로 넓히는 장치를 뺀다 */
    const 안넓힘 = SRC.replace(
      /if \(cap - chrome < need && BOT - TOP > cap\) \{/,
      "if (false) {"
    );
    ok("사본에서 화면 전체로 넓히는 장치를 뺐다", 안넓힘 !== SRC, "치환 실패");
    {
      const t = 띄우기({ 소스: 안넓힘 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      ok("-> 안 넓히면 지표가 " + m.온전한줄 + "줄뿐이다 (8줄 미만이라야 증명됨)",
        m.온전한줄 < 8,
        "여기가 안 터지면 넓히는 장치가 아무 일도 안 하고 있다는 뜻입니다");
      ok("-> 그래도 NaN 은 없다 (칸높이 " + m.칸높이 + ")",
        isFinite(m.칸높이) && isFinite(m.창높이),
        "NaN 이면 모든 비교가 거짓이 되어 검사가 조용히 헛것이 됩니다");
      t.menu.close(); t.win.close();
    }

    /* ③ 둘 다 뺀다 = 수리 전 상태 -> 0줄이 재현돼야 합니다 */
    const 수리전 = 안넓힘.replace(/var need = minListH\(listEl\);/, "var need = 38;");
    {
      const t = 띄우기({ 소스: 수리전 });
      t.menu.open(t.btn);
      나중에끼우기(t.doc, 2);
      await 쉬기(t.win, 150);
      const m = 잰다(t.doc, t.win, t.ROW);
      ok("★수리 전 상태를 되살리면 지표가 0줄이 된다★ (" + m.온전한줄 +
        "줄 · 목록 " + m.칸높이 + "px · 창 " + m.창높이 + "px)",
        m.온전한줄 === 0,
        "브라우저 실측(0/9줄 · 목록 50px · 창 270px)이 가짜 화면에서도 재현돼야 " +
        "이 봉인이 진짜 그 고장을 지키는 것입니다");
      t.menu.close(); t.win.close();
    }
  }

  /* =======================================================================
   * [8] 실행 목록 등록
   * ===================================================================== */
  절("[8] 실행 목록 등록");
  {
    const 목록 = 읽기("tests/_order.txt");
    ok("tests/_order.txt 에 있다",
      목록.includes("tests/chart-fx-menu-min-rows.test.js"),
      "등록 안 하면 npm test 가 이 파일을 안 돌립니다");
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패 있음");
    실패목록.forEach((t) => console.log("  - " + t));
    process.exit(1);
  }
  console.log("전체 통과");
  process.exit(0);
})();
