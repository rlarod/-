/* ===========================================================================
 * tests/interval-more-order-bar-floor.test.js
 * ===========================================================================
 * 시간단위 "더보기" 메뉴가 폰 하단 주문막대 밑으로 내려가면 안 된다
 *
 * 2026-09-03 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 ──────────────────────────────────────────────────
 *
 *   js/interval-more.js 의 clampMenu() 가 세로 넘침을 ★vh - 8★ 로만 봤습니다.
 *   그런데 폰에는 그 위에 하단 매수/매도 바(.tl-order-bar)가 ★겹쳐서★ 떠
 *   있습니다. 화면 안이어도 막대에 가려 안 보입니다.
 *
 *   그래서 "아래로 넘치면 위로 뒤집는다" 는 장치가 ★발동조차 안 했습니다★.
 *   메뉴 아래끝은 vh-8 은 안 넘었으니까요.
 *
 *   수리 전 실측 (localhost, 스크롤 25px 간격 전수, 7줄 메뉴)
 *       360x800  floor 719 · 메뉴 497~729 · ★+10px★ · ★6/7줄★
 *       375x800  floor 719 · 메뉴 497~729 · ★+10px★ · ★6/7줄★
 *       390x800  floor 719 · 메뉴 466~698 ·   -21px  ·   7/7줄
 *       360x640  floor 559 · 메뉴 397~629 · ★+70px★ · ★4/7줄★
 *       375x667  floor 586 · 메뉴 422~654 · ★+68px★ · ★4/7줄★
 *       390x664  floor 583 · 메뉴 416~648 · ★+65px★ · ★4/7줄★
 *   수리 후  여섯 폭 전부 over <= -5px · ★7/7줄★
 *
 *   ★짧은 화면(vh 640)이 더 나빴습니다★ — 800 에서만 재면 +10px 로 보여
 *   "10px 이면 별것 아니다" 로 넘어갑니다. 실제로는 3줄이 더 잘렸고,
 *   800 에서 멀쩡하던 390 까지 같이 깨졌습니다.
 *   360x640 은 갤럭시 구형에서 실제로 쓰는 높이입니다.
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *
 *   [1] 고장났던 그 자리 그대로 (360x800 · floor 719) 메뉴가 바닥을 안 넘는가
 *   [2] ★짧은 화면★ (360x640 · 375x667 · 390x664) 도 안 넘는가
 *   [3] 위아래 둘 다 모자라면 바닥에 붙여 끌어올리는가
 *   [4] ★마지막 방어가 EDGE(8)★ 인가 — 메뉴가 화면 위로는 절대 안 나간다
 *   [5] ★자리가 넉넉하면 안 건드린다★ — 멀쩡한 것을 밀면 안 됩니다
 *   [6] 주문막대가 없으면(768 이상 · display:none · 전체화면) vh-8 만 본다
 *   [7] 돌연변이 자체검증 — 바닥을 vh-8 로 되돌리면 [1] 이 진짜 터지는가
 *
 * ── 높이는 가짜입니다 ─────────────────────────────────────────────────
 *   jsdom 은 화면을 그리지 않아 rect 가 전부 0 입니다. 그래서 아래 크기표로
 *   ★진짜 브라우저 실측값★ 을 흉내 냅니다. 메뉴 자리는 CSS
 *   (top:calc(100% + 4px), position:absolute) 를 그대로 계산해 냅니다.
 *   흉내가 진짜와 같은 답을 내는지는 [0] 에서 먼저 확인합니다 —
 *   흉내가 틀리면 이 봉인 전체가 헛것이 됩니다.
 *
 * 이 파일은 서버도 브라우저도 부르지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js/interval-more.js"), "utf8");

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; 실패목록.push(제목); console.log("  X " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

/* --- 진짜 브라우저에서 잰 크기 (localhost, 2026-09-03) ------------------
   agent-browser 로 실제 클릭 후 잰 값입니다.
     메뉴 236x232 (7줄 · 2열 · 마지막 1줄)  ·  더보기 버튼 줄 높이 44      */
const MENU_H = 232;
const MENU_W = 236;
const WRAP_H = 44;
const EDGE = 8;

/**
 * 메뉴를 열고 자리를 잡은 결과를 돌려줍니다.
 *   vh · vw      화면 크기
 *   barTop       주문막대 위끝 (null 이면 막대 없음 = 768 이상)
 *   barHidden    막대가 display:none 인가
 *   wrapTop      더보기 버튼 위끝 (화면 기준)
 *   src          쓸 소스 (돌연변이 검증용)
 *   menuH        메뉴 높이 (기본 232)
 */
function 열어보기(o) {
  const vh = o.vh, vw = o.vw;
  const menuH = o.menuH || MENU_H;
  const wrapTop = o.wrapTop, wrapBottom = wrapTop + WRAP_H;

  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"interval-row\">" +
      "<button class=\"interval-btn\" data-interval=\"1m\">1분</button>" +
    "</div></body></html>",
    { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" }
  );
  const win = dom.window, doc = win.document;

  Object.defineProperty(win, "innerWidth", { value: vw, configurable: true });
  Object.defineProperty(win, "innerHeight", { value: vh, configurable: true });
  Object.defineProperty(doc.documentElement, "clientWidth", { value: vw, configurable: true });
  Object.defineProperty(doc.documentElement, "clientHeight", { value: vh, configurable: true });

  /* 폰 하단 매수/매도 바 — menuFloorY() 가 이걸 봅니다 */
  if (o.barTop !== null && o.barTop !== undefined) {
    const bar = doc.createElement("div");
    bar.className = "tl-order-bar";
    if (o.barHidden) bar.style.display = "none";
    bar.__rect = { top: o.barTop, bottom: vh, left: 0, right: vw, width: vw, height: vh - o.barTop };
    doc.body.appendChild(bar);
  }

  const El = win.HTMLElement.prototype;
  El.getBoundingClientRect = function () {
    if (this.classList.contains("tl-im-menu")) {
      /* CSS 를 그대로 계산합니다 — position:absolute, 기준은 .tl-im-wrap.
         style.bottom 이 calc(100% + 4px) 면 버튼 ★위★, style.top 이 px 면
         그 값만큼 wrap 위끝에서 내려온 자리, 아무것도 없으면 버튼 ★아래★
         (CSS 기본값 top:calc(100% + 4px)). */
      let top;
      if (this.style.bottom && this.style.bottom.indexOf("calc") === 0) {
        top = wrapTop - 4 - menuH;
      } else if (/px$/.test(this.style.top || "")) {
        top = wrapTop + parseFloat(this.style.top);
      } else {
        top = wrapBottom + 4;
      }
      const left = 8 + (parseFloat(this.style.left) || 0);
      return { top, bottom: top + menuH, left, right: left + MENU_W, width: MENU_W, height: menuH };
    }
    if (this.classList.contains("tl-im-wrap") || this.classList.contains("tl-im-btn")) {
      return { top: wrapTop, bottom: wrapBottom, left: 8, right: 98, width: 90, height: WRAP_H };
    }
    if (this.__rect) return this.__rect;
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  };

  win.eval("window.App = window.App || {};");
  win.App.Config = {
    getActiveInterval: function () { return "1m"; },
    setActiveInterval: function () {},
    getIntervals: function () {
      return [
        { value: "3m", label: "3분" }, { value: "30m", label: "30분" },
        { value: "2h", label: "2시간" }, { value: "6h", label: "6시간" },
        { value: "12h", label: "12시간" }, { value: "1w", label: "1주" },
        { value: "1M", label: "1개월" }
      ];
    }
  };
  win.eval(o.src || SRC);

  const IM = win.App.IntervalMore;
  IM.paint();
  IM.open();
  const menu = doc.querySelector(".tl-im-menu");
  if (!menu) return null;
  const r = menu.getBoundingClientRect();

  /* 바닥을 여기서 ★다시★ 셉니다.
     소스와 따로 계산해야 검사가 의미 있습니다 — 소스의 함수를 그대로
     불러 쓰면 소스가 틀려도 같이 틀려서 늘 통과합니다. */
  let floor = vh - EDGE;
  if (o.barTop !== null && o.barTop !== undefined && !o.barHidden) {
    if (o.barTop - EDGE < floor) floor = o.barTop - EDGE;
  }

  /* 7줄이 2열로 232px 안에 들어갑니다 (2+2+2+1 = 4단).
     단 단위로 잘리는지를 흉내 냅니다. */
  let 보이는줄 = 0;
  const 단높이 = menuH / 4;
  for (let i = 0; i < 4; i++) {
    const t = r.top + i * 단높이, b = t + 단높이;
    if (t >= EDGE - 0.5 && b <= floor + 0.5) 보이는줄 += (i === 3 ? 1 : 2);
  }

  return {
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    floor: floor, over: Math.round(r.bottom - floor),
    붙었나: !menu.style.top && !menu.style.bottom,
    뒤집혔나: (menu.style.bottom || "").indexOf("calc") === 0,
    rows: menu.querySelectorAll("button").length,
    보이는줄: 보이는줄
  };
}

/* ===================================================================== */
절("[0] 흉내가 진짜와 같은 답을 내는가 (수리 전 소스로 브라우저 실측 재현)");

/* 수리 전 상태 = 바닥을 vh-8 로 보던 코드 */
const 수리전 = SRC.replace(
  "var floorY = menuFloorY();",
  "var floorY = (document.documentElement.clientHeight || window.innerHeight || 0) - 8;"
);
ok("돌연변이가 실제로 소스를 바꿨다", 수리전 !== SRC, "replace 가 안 먹었습니다");

const 전360 = 열어보기({ vw: 360, vh: 800, barTop: 727, wrapTop: 449, src: 수리전 });
ok("360x800 수리 전 — 메뉴 497~729 · floor 719 · +10px (브라우저 실측과 일치)",
  !!전360 && 전360.top === 497 && 전360.bottom === 729 && 전360.floor === 719 && 전360.over === 10,
  JSON.stringify(전360));
ok("360x800 수리 전 — 7줄 중 6줄만 보였다 (브라우저 실측과 일치)",
  !!전360 && 전360.보이는줄 === 6, 전360 && String(전360.보이는줄));

const 전640 = 열어보기({ vw: 360, vh: 640, barTop: 567, wrapTop: 349, src: 수리전 });
ok("360x640 수리 전 — 메뉴 397~629 · floor 559 · +70px (브라우저 실측과 일치)",
  !!전640 && 전640.top === 397 && 전640.bottom === 629 && 전640.floor === 559 && 전640.over === 70,
  JSON.stringify(전640));
ok("360x640 수리 전 — 7줄 중 4줄만 보였다 (브라우저 실측과 일치)",
  !!전640 && 전640.보이는줄 === 4, 전640 && String(전640.보이는줄));

/* ===================================================================== */
절("[1] 고장났던 그 자리 — 360x800 · floor 719");

const a = 열어보기({ vw: 360, vh: 800, barTop: 727, wrapTop: 449 });
ok("메뉴가 주문막대 바닥을 안 넘는다", !!a && a.over <= 0, JSON.stringify(a));
ok("메뉴가 화면 위로도 안 나간다", !!a && a.top >= EDGE, JSON.stringify(a));
ok("7줄이 전부 보인다", !!a && a.보이는줄 === 7, a && String(a.보이는줄));
ok("버튼 위쪽으로 뒤집혔다", !!a && a.뒤집혔나, JSON.stringify(a));

/* ===================================================================== */
절("[2] ★짧은 화면★ — 갤럭시 구형(640) · 아이폰 SE(667) · 아이폰(664)");

const 짧은화면 = [
  { 이름: "360x640", vw: 360, vh: 640, barTop: 567, wrapTop: 349 },
  { 이름: "375x667", vw: 375, vh: 667, barTop: 594, wrapTop: 374 },
  { 이름: "390x664", vw: 390, vh: 664, barTop: 591, wrapTop: 368 }
];
for (const s of 짧은화면) {
  const r = 열어보기(s);
  ok(s.이름 + " — 주문막대 바닥을 안 넘는다", !!r && r.over <= 0, JSON.stringify(r));
  ok(s.이름 + " — 화면 위로도 안 나간다", !!r && r.top >= EDGE, JSON.stringify(r));
  ok(s.이름 + " — 7줄이 전부 보인다", !!r && r.보이는줄 === 7, r && String(r.보이는줄));
}

/* ===================================================================== */
절("[3] 위아래 둘 다 모자라면 바닥에 붙여 끌어올린다");

/* vh 400 · floor 332 — 아래로 열면 430 까지 넘치고, 위로는 자리가 없습니다 */
const c = 열어보기({ vw: 360, vh: 400, barTop: 340, wrapTop: 150 });
ok("바닥에 딱 붙는다 (over === 0)", !!c && c.over === 0, JSON.stringify(c));
ok("뒤집지 않았다 (위에 자리가 없으므로)", !!c && !c.뒤집혔나, JSON.stringify(c));
ok("붙박이 자리를 벗어나 자기 자리를 잡았다", !!c && !c.붙었나, JSON.stringify(c));

/* ===================================================================== */
절("[4] ★마지막 방어가 EDGE(8)★ — 메뉴가 화면 위로는 절대 안 나간다");

/* 바닥에 붙이면 top 이 음수가 되는 자리.
   wrap 위끝이 아니라 8 에서 멈춰야 합니다. */
const d = 열어보기({ vw: 360, vh: 280, barTop: 240, wrapTop: 120 });
ok("top 이 8 아래로 안 내려간다", !!d && d.top >= EDGE, JSON.stringify(d));
ok("top 이 정확히 EDGE 다", !!d && d.top === EDGE, JSON.stringify(d));

/* ===================================================================== */
절("[5] ★자리가 넉넉하면 안 건드린다★ — 멀쩡한 것을 밀지 않는다");

const e = 열어보기({ vw: 1920, vh: 1080, barTop: null, wrapTop: 606 });
ok("1920x1080 — 버튼 아래에 그대로 붙어서 열린다", !!e && e.붙었나, JSON.stringify(e));
ok("1920x1080 — 안 넘친다", !!e && e.over <= 0, JSON.stringify(e));

const f = 열어보기({ vw: 390, vh: 800, barTop: 727, wrapTop: 418 });
ok("390x800 — 원래 멀쩡하던 자리를 그대로 둔다", !!f && f.붙었나 && f.over <= 0, JSON.stringify(f));

/* ===================================================================== */
절("[6] 주문막대가 없으면 vh-8 만 본다 (768 이상 · display:none)");

const g = 열어보기({ vw: 768, vh: 1024, barTop: null, wrapTop: 679 });
ok("768 — 막대가 없으니 바닥은 vh-8 (1016)", !!g && g.floor === 1016, JSON.stringify(g));
ok("768 — 안 넘친다", !!g && g.over <= 0, JSON.stringify(g));

const h = 열어보기({ vw: 360, vh: 800, barTop: 727, barHidden: true, wrapTop: 449 });
ok("막대가 display:none 이면 세지 않는다 (바닥 792)", !!h && h.floor === 792, JSON.stringify(h));
ok("막대가 숨겨졌으면 밀지 않는다", !!h && h.붙었나 && h.over <= 0, JSON.stringify(h));

/* ===================================================================== */
절("[7] 돌연변이 자체검증 — 장치를 빼면 [1] · [4] 가 진짜 터지는가");

ok("지금 소스는 [1] 을 통과한다 (먼저 확인)", !!a && a.over <= 0 && a.보이는줄 === 7);

const 돌1 = 열어보기({ vw: 360, vh: 800, barTop: 727, wrapTop: 449, src: 수리전 });
ok("바닥을 vh-8 로 되돌리면 360x800 이 다시 넘친다",
  !!돌1 && 돌1.over > 0, "안 터졌습니다 — 이 봉인이 헛것입니다: " + JSON.stringify(돌1));

const 수리전2 = SRC.replace("if (want < EDGE) want = EDGE;", "if (want < wr.top) want = wr.top;");
ok("돌연변이2 가 실제로 소스를 바꿨다", 수리전2 !== SRC);
const 돌2 = 열어보기({ vw: 360, vh: 280, barTop: 240, wrapTop: 120, src: 수리전2 });
ok("마지막 방어를 wrap 위끝으로 바꾸면 [4] 가 터진다 (다시 막대에 걸린다)",
  !!돌2 && 돌2.over > 0, "안 터졌습니다: " + JSON.stringify(돌2));

/* ===================================================================== */
console.log("\n" + "=".repeat(60));
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 목록:");
  실패목록.forEach(function (t) { console.log("  - " + t); });
}
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);
