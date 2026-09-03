/* ===========================================================================
 * tests/chart-ind-bar-fold.test.js
 * ===========================================================================
 * 지표 칩 줄(.tl-ind-bar)이 캔들을 덮지 않게 — 접기 버튼
 *
 * 2026-09-02 P2 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 ──────────────────────────────────────────────────
 *
 *   칩 줄은 차트 위에 겹쳐 그립니다(position:absolute). 차트를 밀어내지
 *   않으므로 칩이 늘어나도 .chart-container 는 그대로이고, 늘어난 만큼
 *   캔들이 그냥 덮입니다. 지표를 전부 꺼도 칩은 남습니다 —
 *   칩이 "켜진 목록" 이 아니라 켜고 끄는 버튼 자체라서 그게 맞습니다.
 *
 *   실측 (localhost 360x800, 2026-09-02)
 *       기본 9칩      칩 줄 76px (3줄)  주 칸 530px  가림 14.2%
 *       14칩          칩 줄 129px(5줄)  주 칸 269px  가림 47.8%
 *       22칩          칩 줄 235px(9줄)  주 칸 269px  가림 87.2%
 *   고친 뒤 (전부 한 줄 23px)
 *       기본 9칩 4.2% · 14칩 8.4% · 22칩 8.4%
 *
 * ── 트레이딩뷰를 따라간 것 ────────────────────────────────────────────
 *   트레이딩뷰도 범례를 차트 위에 겹쳐 그립니다(우리와 같음).
 *   다른 점은 범례에 접기 꺾쇠가 있다는 것뿐이라 그것만 만들었습니다.
 *   칩을 지우거나 다른 자리로 옮기지 않았습니다.
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *   [1] 세 줄 이상이면 처음부터 접혀 있다 (회원이 아직 안 눌렀을 때만)
 *   [2] 두 줄까지는 안 접는다 — 접기 버튼만 보여준다
 *   [3] 한 줄이면 접기 버튼도 안 그린다
 *       (버튼이 폭을 차지해 한 줄짜리를 두 줄로 만들면 고치려던 것을
 *        오히려 키웁니다. 실제로 1440·9칩에서 23px -> 49px 이 났습니다)
 *   [4] 접어도 칩을 지우지 않는다 — 감추기만 한다(되살릴 수 있어야 합니다)
 *   [5] 회원이 한 번 누르면 그 선택이 기억되고, 자동 판단이 그걸 덮지 않는다
 *   [6] 접힌 칸에 "지표 N" 이 나온다 (몇 개가 숨어 있는지 알 수 있게)
 *   [7] 글씨를 줄이지 않았다 — 접기 버튼 글자 크기가 옆 칩과 같다
 *   [8] 돌연변이 자체검증
 *
 * ── 높이는 가짜입니다 ─────────────────────────────────────────────────
 *   jsdom 은 화면을 그리지 않아 offsetHeight 가 0 입니다. 아래 가짜 배치가
 *   "한 줄에 몇 개" 를 정하고 실측 높이를 흉내 냅니다.
 *   ⚠️ 이 높이는 ★칩 글씨 크기에 딸린 값★ 입니다. 칩 글씨를 바꾸면 같이 바꾸세요.
 *      11px 시절 1줄 23 · 2줄 49 · 3줄 76
 *      17px 지금 1줄 31.5 · 2줄 67 · 3줄 102.5  (2026-09-03 실측, 대표 지시로 키움)
 *      js/chart-indicators.js 의 FOLD_LINE1 · FOLD_LINE2 도 같이 옮겼습니다.
 *      ★못 박는 뜻은 그대로입니다 — 세 줄부터 접는다.★
 *
 * 이 파일은 서버도 브라우저도 부르지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const 읽기 = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const SRC = 읽기("js/chart-indicators.js");

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; 실패목록.push(제목); console.log("  X " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

/* 실측 — 한 줄 31.5px, 두 줄 67px, 세 줄 102.5px
   (칩 31.5px = 17px x 1.5 + 위아래 여백 4 + 테두리 2, 줄 사이 gap 4px)
   2026-09-03 localhost 360x640 · 1440x900 둘 다 67px 로 같았습니다. */
function 높이(줄수) {
  return 줄수 <= 0 ? 0 : 35.5 * 줄수 - 4;
}

function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const 한줄에 = 옵션.한줄에 || 5;
  const dom = new JSDOM(
    '<!doctype html><html><body><div class="chart-panel"><div class="chart-wrap"></div></div></body></html>',
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;

  /* 칩 줄 높이 흉내 — 보이는 칩 수를 한 줄에 몇 개인지로 나눕니다 */
  Object.defineProperty(win.HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get() {
      if (String(this.className || "").indexOf("tl-ind-bar") !== 0) return 0;
      const 접힘 = String(this.className).indexOf("tl-ind-folded") !== -1;
      let 보임 = 0;
      for (const k of this.children) {
        const 접기 = String(k.className || "").indexOf("tl-ind-fold") !== -1;
        if (k.style.display === "none") continue;
        if (접힘 && !접기) continue;   /* 접히면 접기 버튼만 보입니다 */
        보임++;
      }
      return 높이(Math.ceil(보임 / 한줄에));
    }
  });

  const 저장소 = {};
  win.eval("window.App = window.App || {};");
  win.App.Storage = {
    save(k, v) { 저장소[k] = JSON.parse(JSON.stringify(v)); return true; },
    load(k) { return 저장소[k] ? JSON.parse(JSON.stringify(저장소[k])) : null; }
  };
  win.App.Bus = { on() {}, off() {}, emit() {} };
  if (옵션.저장) 저장소["chart-ind-fold"] = { folded: 옵션.저장.folded };

  win.eval(옵션.소스 || SRC);
  const M = win.App.ChartIndicators;
  /* jsdom 은 아직 DOMContentLoaded 전이라 init() 이 자동으로 안 돕니다 */
  M.init();
  M.buildButtonsForTest();   /* 차트 없이 칩 줄만 만듭니다 */

  const bar = doc.querySelector(".tl-ind-bar");
  return { win, doc, M, bar, 저장소 };
}

function 칩더넣기(doc, bar, n) {
  for (let i = 0; i < n; i++) {
    const b = doc.createElement("button");
    b.className = "tl-kit-btn";   /* js/chart-indicator-kit.js 가 이 클래스로 붙입니다 */
    bar.appendChild(b);
  }
}

function 상태(bar) {
  const fold = bar.querySelector(".tl-ind-fold");
  return {
    접힘: String(bar.className).indexOf("tl-ind-folded") !== -1,
    높이: bar.offsetHeight,
    버튼보임: !!fold && fold.style.display !== "none",
    글자: fold ? fold.textContent : "(없음)",
    칩수: bar.querySelectorAll("button").length
  };
}

function 쉬기(win, ms) { return new Promise((r) => win.setTimeout(r, ms)); }

(async function () {
  console.log("\n지표 칩 줄 — 세 줄부터는 접어서 캔들을 덮지 않는다");

  /* =====================================================================
   * [1] 세 줄이면 처음부터 접혀 있다
   * =================================================================== */
  절("[1] 세 줄이면 처음부터 접힘");
  {
    const t = 띄우기({ 한줄에: 3 });          /* 기본 칩 5개 -> 2줄 */
    칩더넣기(t.doc, t.bar, 4);                 /* 9개 -> 3줄 */
    await 쉬기(t.win, 60);
    const s = 상태(t.bar);
    ok("칩이 9개다", s.칩수 === 10, String(s.칩수) + " (접기 버튼 포함 10)");
    ok("접혀 있다", s.접힘 === true);
    ok("한 줄로 줄었다 (" + s.높이 + "px, 세 줄이면 " + 높이(3) + "px)", s.높이 === 높이(1), String(s.높이));
    ok("접기 버튼이 보인다", s.버튼보임 === true);
    t.win.close();
  }

  /* =====================================================================
   * [2] 두 줄까지는 안 접는다
   * =================================================================== */
  절("[2] 두 줄까지는 그냥 둔다 (버튼만 보여준다)");
  {
    const t = 띄우기({ 한줄에: 5 });          /* 칩 5개 -> 1줄 */
    칩더넣기(t.doc, t.bar, 4);                 /* 9개 -> 2줄 */
    await 쉬기(t.win, 60);
    const s = 상태(t.bar);
    ok("안 접혔다", s.접힘 === false);
    ok("두 줄 그대로다 (" + s.높이 + "px)", s.높이 === 높이(2), String(s.높이));
    ok("접기 버튼은 보인다 (회원이 직접 접을 수 있게)", s.버튼보임 === true);
    t.win.close();
  }

  /* =====================================================================
   * [3] 한 줄이면 접기 버튼도 안 그린다
   * =================================================================== */
  절("[3] 한 줄이면 접기 버튼을 안 그린다");
  {
    const t = 띄우기({ 한줄에: 20 });         /* 칩 5개 -> 1줄 */
    await 쉬기(t.win, 60);
    const s = 상태(t.bar);
    ok("안 접혔다", s.접힘 === false);
    ok("접기 버튼이 안 보인다", s.버튼보임 === false,
      "버튼이 폭을 차지해 한 줄짜리를 두 줄로 만들면 고치려던 것을 키웁니다");
    ok("높이가 한 줄 그대로다 (" + s.높이 + "px)", s.높이 === 높이(1), String(s.높이));
    ok("그래도 버튼은 DOM 에 남아 있다 (지우지 않았다)",
      !!t.bar.querySelector(".tl-ind-fold"));
    t.win.close();
  }

  /* =====================================================================
   * [4] 접어도 칩을 지우지 않는다
   * =================================================================== */
  절("[4] 접어도 칩을 지우지 않는다 (감추기만)");
  {
    const t = 띄우기({ 한줄에: 3 });
    칩더넣기(t.doc, t.bar, 4);
    await 쉬기(t.win, 60);
    ok("접힌 상태다", 상태(t.bar).접힘 === true);
    ok("칩 9개가 DOM 에 그대로 있다",
      t.bar.querySelectorAll("button:not(.tl-ind-fold)").length === 9,
      String(t.bar.querySelectorAll("button:not(.tl-ind-fold)").length));
    ok("감추는 것은 CSS 한 줄이다 (.tl-ind-folded)",
      /\.tl-ind-bar\.tl-ind-folded > \*\{display:none;\}/.test(SRC.replace(/"\s*\+\s*\n?\s*"/g, "")),
      "규칙을 못 찾았습니다 — 마크업을 지우는 방식으로 바뀌었는지 확인하세요");
    t.win.close();
  }

  /* =====================================================================
   * [5] 회원이 고른 것이 자동 판단보다 우선한다
   * =================================================================== */
  절("[5] 회원이 고른 것이 우선");
  {
    /* 회원이 "펴 둠" 을 저장한 채로 세 줄짜리 화면을 엽니다 */
    const t = 띄우기({ 한줄에: 3, 저장: { folded: false } });
    칩더넣기(t.doc, t.bar, 4);
    await 쉬기(t.win, 60);
    ok("세 줄인데도 접히지 않는다 (회원 선택 존중)", 상태(t.bar).접힘 === false);

    /* 직접 눌러서 접습니다 */
    t.bar.querySelector(".tl-ind-fold").click();
    ok("누르면 접힌다", 상태(t.bar).접힘 === true);
    ok("선택이 저장된다", t.저장소["chart-ind-fold"] &&
      t.저장소["chart-ind-fold"].folded === true,
      JSON.stringify(t.저장소["chart-ind-fold"]));

    /* 칩이 더 늘어도 회원 선택을 덮지 않습니다 */
    칩더넣기(t.doc, t.bar, 6);
    await 쉬기(t.win, 60);
    ok("칩이 더 늘어도 회원 선택 그대로다", 상태(t.bar).접힘 === true);
    t.win.close();
  }

  /* =====================================================================
   * [6] 접힌 칸에 몇 개가 숨어 있는지 나온다
   * =================================================================== */
  절("[6] 접힌 칸에 \"지표 N\"");
  {
    const t = 띄우기({ 한줄에: 3 });
    칩더넣기(t.doc, t.bar, 9);   /* 5 + 9 = 14 */
    await 쉬기(t.win, 60);
    const s = 상태(t.bar);
    ok("접혔다", s.접힘 === true);
    ok('글자가 "지표 14" 를 담고 있다 (지금 "' + s.글자 + '")',
      /지표\s*14/.test(s.글자), s.글자);
    ok("접기 버튼 자신은 개수에서 뺀다", !/지표\s*15/.test(s.글자), s.글자);
    t.win.close();
  }

  /* =====================================================================
   * [7] 글씨를 줄이지 않았다
   * =================================================================== */
  절("[7] 글씨 크기 — 옆 칩과 같다");
  {
    const 붙인 = SRC.replace(/"\s*\+\s*\n?\s*"/g, "");
    const 칩 = (붙인.match(/\.tl-ind-btn\{[^}]*font-size:(\d+)px/) || [])[1];
    const 접기 = (붙인.match(/\.tl-ind-fold\{[^}]*font-size:(\d+)px/) || [])[1];
    ok("칩 글자 크기를 읽었다 (" + 칩 + "px)", 칩 !== undefined);
    ok("접기 버튼 글자 크기를 읽었다 (" + 접기 + "px)", 접기 !== undefined);
    ok("접기 버튼이 옆 칩보다 작지 않다", Number(접기) >= Number(칩),
      "대표가 작은 글씨를 못 읽습니다 — 줄이지 않습니다");
  }

  /* =====================================================================
   * [8] 돌연변이 자체검증 — 접기를 빼면 [1] 이 정말 터지는가
   * =================================================================== */
  절("[8] 돌연변이 자체검증");
  {
    const 망가진 = SRC.replace(/\n\s*refreshFold\(\);\n\s*watchChips\(\);/, "\n");
    ok("사본에서 접기 장치가 실제로 빠졌다", 망가진 !== SRC);
    const t = 띄우기({ 한줄에: 3, 소스: 망가진 });
    칩더넣기(t.doc, t.bar, 4);
    await 쉬기(t.win, 60);
    const s = 상태(t.bar);
    ok("-> 빼면 세 줄 그대로다 (" + s.높이 + "px)", s.높이 >= 높이(3),
      "여기서 안 터지면 [1] 은 가짜입니다");
    t.win.close();
  }

  /* =====================================================================
   * [9] 실행 목록 등록
   * =================================================================== */
  절("[9] 실행 목록 등록");
  {
    const order = 읽기("tests/_order.txt");
    ok("tests/_order.txt 에 있다",
      order.indexOf("tests/chart-ind-bar-fold.test.js") !== -1,
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
