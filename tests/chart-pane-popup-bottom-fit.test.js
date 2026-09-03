/* tests/chart-pane-popup-bottom-fit.test.js
 * =========================================================================
 * 「차트 칸 좌표로 띄우는 것」 둘도 주문 막대 밑으로 안 내려간다 — 2026-09-03
 *   대상: js/chart-drawings.js  (openFacePicker · openTextInput)
 * =========================================================================
 * ── 왜 이 둘만 따로 보나 ──────────────────────────────────────────────
 *
 * 차트 위에 겹쳐 뜨는 것은 크게 두 갈래입니다.
 *
 *   ㉠ 화면(viewport) 좌표로 띄우는 것   position:fixed · putFixed() 를 부름
 *      칩 · 알림줄 · 색굵기 창 · 그린 것 목록
 *      → tests/chart-place-bottom-guard-seal.test.js 가 통째로 봅니다
 *
 *   ㉡ ★차트 칸(wrap) 좌표로 띄우는 것★  position:absolute · style.top 을 직접 정함
 *      ★표정 고르는 창(.tl-face-pick) · 글자 입력칸(.tl-draw-input)★  ← 이 파일
 *
 * ㉡ 은 putFixed 를 안 부르므로 ㉠ 의 봉인에 ★안 걸립니다.★ 그런데 차트 칸은
 * 560~989px 로 폰 화면보다 훨씬 길어서, 「차트 칸 안에 있다」 와 「화면에
 * 보인다」 가 전혀 다릅니다. 차트 칸 안에 얌전히 있어도 ★하단 매수·매도 바
 * 밑에 깔려 통째로 안 보일 수 있습니다.★
 *
 * ── 2026-09-03 실측 (수리팀 · 전수 조사) ──────────────────────────────
 * 스크롤을 25px 간격으로 훑어 폭마다 최악 자리를 찾고, 그 자리에서 화면에
 * 보이는 차트 바닥을 실제로 눌러 창을 띄운 값입니다.
 *
 *   표정 고르는 창 — ★여섯 폭 전부 44px 넘침★
 *     360/375/390  누른 곳 713 → 창 721~771 (막대 위끝 727 보다 44px 아래)
 *                  ★캡처로 확인 — 여섯 단추가 하나도 안 보임★
 *     768/1440/1920 창 894~944 (화면 900 밖으로 44px)
 *     고친 뒤 — 670~720 / 664~714 / 841~891 / 828~878  전부 안쪽
 *
 *   글자 입력칸 — ★방어가 하나도 없었습니다★
 *     360  누른 곳 725 → 칸 713~736 (막대 위끝 727 보다 9px 아래)
 *          오른쪽 끝 360 = 화면 끝, 차트 칸 밖으로 75px
 *     768/1440/1920  칸 877~900 (화면 아래끝에 딱 붙음, 여유 0)
 *     고친 뒤 — 여섯 폭 모두 막대 위 −8px · 차트 칸 안 −4px
 *
 * ⚠️ ★최악 자리는 스크롤을 훑어야 나옵니다.★ 차트가 화면 가운데 있을 때
 *    재면 그냥 통과합니다.
 *
 * ── 고친 방법 ─────────────────────────────────────────────────────────
 * 바닥을 「차트 칸 아래끝」 과 ★「화면에 보이는 바닥」★ 둘 중 위쪽으로 잡습니다.
 *   chipFloorY() 는 화면 기준이고 top 은 차트 칸 기준이라 wr.top 을 빼서 옮깁니다.
 *   표정 창 — ⓐ 누른 곳 위로 뒤집기 → ⓑ 그래도 넘치면 눌러 앉히기 → ⓒ 차트 칸 위끝(4)
 *   입력칸 — 눌러 앉히기 → 차트 칸 위끝(4). 가로도 같이 막습니다(원래 없었음)
 * ★글씨·단추 크기는 안 건드립니다. 자리만 옮깁니다.★
 * 글자가 찍히는 자리는 누른 곳의 (시각, 가격) 이라 그대로입니다 — 입력칸만 옮깁니다.
 *
 * ⚠️ openFacePicker 의 `if (wr.height && top + bh > wr.height - 4)` 한 줄은
 *    ★일부러 그대로 남겼습니다.★ chart-place-bottom-guard-seal 이 그 줄을
 *    「아래쪽 방어가 살아 있는지」 의 표식으로 씁니다. 지우면 그쪽이 빨개집니다.
 *
 * ── 어떻게 확인하나 (계산을 베끼지 않습니다) ──────────────────────────
 * 두 함수를 ★원본에서 글자 그대로 떼어내★ 가짜 화면 위에서 진짜로 돌립니다.
 * 1절에서 ★고치기 전 계산이 브라우저 실측과 글자 그대로 같은지★ 를 먼저 맞춰
 * 봅니다 — 가짜 화면이 진짜와 다르면 거기서 먼저 빨개집니다.
 *
 * ── 이 파일은 사이트도 서버도 건드리지 않습니다 ───────────────────────
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [32m✓[0m " + 제목); }
  else { fail++; console.log("  [31m✗[0m " + 제목 + (도움말 ? " — " + 도움말 : "")); }
}
function 절(제목) { console.log("\n" + 제목); }

console.log("\n차트 칸 좌표로 띄우는 둘도 주문 막대 밑으로 안 내려간다");

/* =====================================================================
 * [0] 준비 — 원본에서 글자 그대로 떼어낸다
 * ===================================================================== */
절("[0] 준비 — 원본에서 계산부를 그대로 떼어낸다");

const 필요함수 = ["vpW", "vpH", "chipFloorY", "openFacePicker", "openTextInput"];

function 함수떼기(name) {
  const i = SRC.indexOf("function " + name + "(");
  if (i < 0) return null;
  let k = SRC.indexOf("{", i);
  if (k < 0) return null;
  let depth = 0;
  for (; k < SRC.length; k++) {
    const c = SRC[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { k++; break; } }
  }
  return SRC.slice(i, k);
}

const 조각 = {};
let 다떼었다 = true;
for (const n of 필요함수) {
  조각[n] = 함수떼기(n);
  if (!조각[n]) 다떼었다 = false;
}
ok("계산 함수 " + 필요함수.length + "개를 원본에서 찾았다", 다떼었다,
  "못 찾은 것: " + 필요함수.filter((n) => !조각[n]).join(", "));

const mEdge = /var\s+CHIP_EDGE\s*=\s*(\d+)\s*;/.exec(SRC);
ok("상수 CHIP_EDGE 가 원본에 있다", !!mEdge, String(mEdge));
const CHIP_EDGE = mEdge ? Number(mEdge[1]) : 8;

/* 실측한 요소 크기 (2026-09-03 브라우저) */
const 표정크기 = { w: 260, h: 50 }; /* 단추 40 × 6 + 사이 2 × 5 + 안여백 8 + 테두리 2 */

/* ⚠️ 입력칸 크기는 ★17차(글씨 12px · 폭 150px) 시절 값★ 입니다. 일부러 둡니다.
 *   아래 [1] 이 「고치기 전 계산이 그때 브라우저와 글자 그대로 같은가」 를 보는데,
 *   그 브라우저 실측이 12px 시절에 찍힌 것이라 크기를 바꾸면 대조가 깨집니다.
 *   ★막는 논리(위·아래·좌우 자르기)는 크기와 상관없이 같습니다★ —
 *   그래서 이 값으로 논리를 검사하고, ★지금 크기★ 는 아래 [8] 이 따로 봅니다.
 *   22차 2026-09-03 에 대표 지시로 글씨 17px · 폭 200px 이 됐습니다
 *   (브라우저 실측 offsetWidth 200 · offsetHeight 31, border-box). */
const 입력크기 = { w: 150, h: 23 };
/* 지금 실제로 화면에 뜨는 크기 — [8] 이 씁니다 (2026-09-03 22차 브라우저 실측) */
const 입력지금 = { w: 200, h: 31, 글씨: 17 };

/* ---------------------------------------------------------------------
 * 가짜 화면 — 진짜 함수를 그대로 돌립니다.
 *   두 함수 다 자리를 (o.x + x) · (o.y + y) 로만 씁니다.
 *   그래서 paneOrigin 을 {0,0} 으로 두고 누른 곳을 그대로 넣습니다.
 * ------------------------------------------------------------------- */
function 가짜요소(tag) {
  const el = {
    tagName: (tag || "div").toUpperCase(),
    className: "", type: "", value: "",
    style: {}, children: [],
    setAttribute: function () {},
    addEventListener: function () {},
    focus: function () {},
    appendChild: function (c) { this.children.push(c); }
  };
  Object.defineProperty(el, "offsetWidth", {
    get: function () {
      if (this.className === "tl-face-pick") return 표정크기.w;
      if (this.className === "tl-draw-input") return 입력크기.w;
      return 0;
    }
  });
  Object.defineProperty(el, "offsetHeight", {
    get: function () {
      if (this.className === "tl-face-pick") return 표정크기.h;
      if (this.className === "tl-draw-input") return 입력크기.h;
      return 0;
    }
  });
  return el;
}

function 돌리기(설정, 무엇) {
  const 바 = 설정.barTop
    ? { getBoundingClientRect: function () {
          return { top: 설정.barTop, bottom: 설정.h, height: 설정.h - 설정.barTop };
        }, __display: "flex" }
    : null;

  const document = {
    documentElement: { clientWidth: 설정.w, clientHeight: 설정.h },
    fullscreenElement: null,
    webkitFullscreenElement: null,
    querySelector: function (s) { return s === ".tl-order-bar" ? 바 : null; },
    createElement: function (t) { return 가짜요소(t); }
  };
  const window = {
    innerWidth: 설정.w,
    innerHeight: 설정.h,
    getComputedStyle: function (el) { return { display: el.__display }; }
  };
  const wrap = {
    children: [],
    appendChild: function (c) { this.children.push(c); },
    getBoundingClientRect: function () {
      return {
        top: 설정.wrap.top, left: 0, width: 설정.wrap.width, height: 설정.wrap.height,
        bottom: 설정.wrap.top + 설정.wrap.height, right: 설정.wrap.width
      };
    }
  };

  const sandbox = {
    window: window, document: document, wrap: wrap,
    els: {},
    /* 실행되는 잔가지들 — 자리 계산과 상관없는 것은 아무 일도 안 하게 둡니다 */
    closeFacePicker: function () {},
    closeTextInput: function () {},
    injectStyle: function () {},
    paneOrigin: function () { return { x: 0, y: 0 }; },
    facePickCanvas: function () { return 가짜요소("canvas"); },
    FACE_KINDS: [1, 2, 3, 4, 5, 6].map(function (i) { return { k: "f" + i, label: "표정" + i }; }),
    setTimeout: function () {},
    console: { warn: function () {}, log: function () {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    "var CHIP_EDGE=" + CHIP_EDGE + ";\n" +
    필요함수.map(function (n) { return 조각[n]; }).join("\n"),
    sandbox, { filename: "pane-popup-lifted.js" }
  );

  if (무엇 === "표정") sandbox.openFacePicker(설정.sx, 설정.sy, 0, 0);
  else sandbox.openTextInput(설정.sx, 설정.sy, 0, 0);

  const el = 무엇 === "표정" ? sandbox.els.facePick : sandbox.els.input;
  const 크기 = 무엇 === "표정" ? 표정크기 : 입력크기;
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  return {
    칸left: left, 칸top: top,
    화면top: 설정.wrap.top + top,
    화면bottom: 설정.wrap.top + top + 크기.h,
    칸right: left + 크기.w,
    크기: 크기
  };
}

/* 고치기 전 계산 — ★2026-09-03 이전의 원본 두 줄을 그대로 옮겨 적은 것입니다.★
   1절에서 이것이 브라우저 실측과 같은지 맞춰 봅니다(가짜 화면 검증용).
   이 함수는 검사 대상이 아니라 「그때는 이랬다」 를 재현하는 자입니다. */
function 옛계산(설정, 무엇) {
  const wr = 설정.wrap;
  if (무엇 === "표정") {
    const bw = 표정크기.w, bh = 표정크기.h;
    let left = 설정.sx + 8, top = 설정.sy + 8;
    if (wr.width && left + bw > wr.width - 4) left = wr.width - bw - 4;
    if (left < 4) left = 4;
    if (wr.height && top + bh > wr.height - 4) top = 설정.sy - bh - 8;
    if (top < 4) top = 4;
    return { 칸left: left, 칸top: top };
  }
  return { 칸left: 설정.sx, 칸top: 설정.sy - 12 };
}

/* =====================================================================
 * 2026-09-03 브라우저 실측 그대로 (폭마다 최악 스크롤 자리)
 *   sx · sy = 그때 코드가 실제로 받은 「누른 곳」. 고치기 전 값에서 되뽑았습니다
 *             (표정 sy = 전top − 8 · 입력칸 sy = 전top + 12).
 *   후브라우저 = 고친 뒤 브라우저에서 다시 잰 값. ★기하가 같은 것만 적습니다.★
 * ===================================================================== */
const 표정실측 = [
  { 이름: "360 · y=50", w: 360, h: 800, barTop: 727, wrap: { top: 666, width: 330, height: 560 },
    sx: 310, sy: 47, 전: { 칸left: 66, 칸top: 55 }, 후브라우저: { 칸left: 66, 칸top: 4 } },
  { 이름: "375 · y=50", w: 375, h: 800, barTop: 727, wrap: { top: 666, width: 345, height: 560 },
    sx: 325, sy: 47, 전: { 칸left: 81, 칸top: 55 }, 후브라우저: { 칸left: 81, 칸top: 4 } },
  { 이름: "390 · y=25", w: 390, h: 800, barTop: 727, wrap: { top: 660, width: 360, height: 560 },
    sx: 340, sy: 53, 전: { 칸left: 96, 칸top: 61 }, 후브라우저: { 칸left: 96, 칸top: 4 } },
  { 이름: "768 · y=0", w: 768, h: 900, barTop: null, wrap: { top: 837, width: 670, height: 693 },
    sx: 650, sy: 49, 전: { 칸left: 406, 칸top: 57 }, 후브라우저: { 칸left: 406, 칸top: 4 } },
  { 이름: "1440 · y=0", w: 1440, h: 900, barTop: null, wrap: { top: 745, width: 716, height: 989 },
    sx: 696, sy: 141, 전: { 칸left: 452, 칸top: 149 }, 후브라우저: { 칸left: 452, 칸top: 83 } },
  { 이름: "1920 · y=0", w: 1920, h: 900, barTop: null, wrap: { top: 764, width: 732, height: 989 },
    sx: 712, sy: 122, 전: { 칸left: 468, 칸top: 130 }, 후브라우저: { 칸left: 468, 칸top: 64 } }
];

const 입력실측 = [
  { 이름: "360 · y=75", w: 360, h: 800, barTop: 727, wrap: { top: 641, width: 330, height: 560 },
    sx: 255, sy: 84, 전: { 칸left: 255, 칸top: 72 }, 후브라우저: { 칸left: 176, 칸top: 55 } },
  { 이름: "375 · y=75", w: 375, h: 800, barTop: 727, wrap: { top: 641, width: 345, height: 560 },
    sx: 265, sy: 84, 전: { 칸left: 265, 칸top: 72 }, 후브라우저: { 칸left: 191, 칸top: 55 } },
  { 이름: "390 · y=25", w: 390, h: 800, barTop: 727, wrap: { top: 660, width: 360, height: 560 },
    sx: 281, sy: 65, 전: { 칸left: 281, 칸top: 53 }, 후브라우저: { 칸left: 206, 칸top: 36 } },
  /* 아래 셋은 고친 뒤 다시 잴 때 ★최악 스크롤 자리가 달라져서★ 차트 칸 위치가
     바뀌었습니다. 그래서 「후브라우저」 를 적지 않고 ★범위만★ 봅니다.
     (없는 숫자를 지어내지 않습니다) */
  { 이름: "768 · y=25", w: 768, h: 900, barTop: null, wrap: { top: 803, width: 670, height: 693 },
    sx: 535, sy: 86, 전: { 칸left: 535, 칸top: 74 }, 후브라우저: null },
  { 이름: "1440 · y=25", w: 1440, h: 900, barTop: null, wrap: { top: 711, width: 716, height: 989 },
    sx: 581, sy: 178, 전: { 칸left: 581, 칸top: 166 }, 후브라우저: null },
  { 이름: "1920 · y=25", w: 1920, h: 900, barTop: null, wrap: { top: 730, width: 732, height: 989 },
    sx: 597, sy: 159, 전: { 칸left: 597, 칸top: 147 }, 후브라우저: null }
];

/* =====================================================================
 * [1] 가짜 화면이 진짜와 같은가 — 여기가 틀리면 아래는 다 헛것입니다
 * ===================================================================== */
절("[1] 가짜 화면 맞춰보기 — 고치기 전 계산이 브라우저 실측과 글자 그대로 같은가");

[["표정", 표정실측], ["글자 입력칸", 입력실측]].forEach(function (pair) {
  const 무엇 = pair[0] === "표정" ? "표정" : "글자";
  pair[1].forEach(function (c) {
    const 옛 = 옛계산(c, 무엇);
    ok(pair[0] + " " + c.이름 + " — 옛 계산이 실측과 같다 (왼 " + c.전.칸left + " · 위 " + c.전.칸top + ")",
      옛.칸left === c.전.칸left && 옛.칸top === c.전.칸top,
      "재현 왼" + 옛.칸left + " 위" + 옛.칸top);
  });
});

/* =====================================================================
 * [2] 고쳐진 것 — 여섯 폭 모두 화면 안 · 주문 막대 위
 * ===================================================================== */
절("[2] 표정 고르는 창 — 여섯 폭 모두 화면 안, 주문 막대 위");

표정실측.forEach(function (c) {
  const r = 돌리기(c, "표정");
  const 막대위끝 = c.barTop || c.h;
  ok(c.이름 + " — ★주문 막대(또는 화면) 밑으로 안 내려간다★ (아래끝 " +
    r.화면bottom + " ≤ " + 막대위끝 + ")",
    r.화면bottom <= 막대위끝, "밑으로 " + (r.화면bottom - 막대위끝) + "px");
  ok(c.이름 + " — 화면 아래로 안 넘친다 (아래끝 " + r.화면bottom + " ≤ " + c.h + ")",
    r.화면bottom <= c.h, "넘침 " + (r.화면bottom - c.h) + "px");
  ok(c.이름 + " — 차트 칸 위끝(4) 위로 안 나간다", r.칸top >= 4, "칸top " + r.칸top);
  ok(c.이름 + " — 차트 칸 오른쪽으로 안 나간다 (" + r.칸right + " ≤ " + c.wrap.width + ")",
    r.칸right <= c.wrap.width, "밖으로 " + (r.칸right - c.wrap.width));
  ok(c.이름 + " — 창이 작아지지 않는다 (단추 크기 그대로 260×50)",
    r.크기.w === 260 && r.크기.h === 50, JSON.stringify(r.크기));
  if (c.후브라우저) {
    ok(c.이름 + " — ★브라우저 실측과 글자 그대로 같다★ (왼 " + c.후브라우저.칸left +
      " · 위 " + c.후브라우저.칸top + ")",
      r.칸left === c.후브라우저.칸left && r.칸top === c.후브라우저.칸top,
      "흉내 왼" + r.칸left + " 위" + r.칸top);
  }
});

절("[3] 글자 입력칸 — 여섯 폭 모두 화면 안, 주문 막대 위");

입력실측.forEach(function (c) {
  const r = 돌리기(c, "글자");
  const 막대위끝 = c.barTop || c.h;
  ok(c.이름 + " — ★주문 막대(또는 화면) 밑으로 안 내려간다★ (아래끝 " +
    r.화면bottom + " ≤ " + 막대위끝 + ")",
    r.화면bottom <= 막대위끝, "밑으로 " + (r.화면bottom - 막대위끝) + "px");
  ok(c.이름 + " — 차트 칸 위끝(4) 위로 안 나간다", r.칸top >= 4, "칸top " + r.칸top);
  ok(c.이름 + " — ★차트 칸 오른쪽으로 안 나간다★ (" + r.칸right + " ≤ " + c.wrap.width +
    ") · 전에는 " + (c.전.칸left + 입력크기.w) + " 로 " +
    (c.전.칸left + 입력크기.w - c.wrap.width) + "px 나갔습니다",
    r.칸right <= c.wrap.width, "밖으로 " + (r.칸right - c.wrap.width));
  ok(c.이름 + " — 자리를 잡는다고 입력칸을 줄이지 않는다 (" +
    입력크기.w + "×" + 입력크기.h + " 그대로)",
    r.크기.w === 입력크기.w && r.크기.h === 입력크기.h, JSON.stringify(r.크기));
  if (c.후브라우저) {
    ok(c.이름 + " — ★브라우저 실측과 글자 그대로 같다★ (왼 " + c.후브라우저.칸left +
      " · 위 " + c.후브라우저.칸top + ")",
      r.칸left === c.후브라우저.칸left && r.칸top === c.후브라우저.칸top,
      "흉내 왼" + r.칸left + " 위" + r.칸top);
  }
});

/* =====================================================================
 * [4] 고치기 전과 견주기 — 봉인이 무엇을 막는지 숫자로 남깁니다
 * ===================================================================== */
절("[4] 고치기 전 값과 견주기 (그때는 이만큼 내려갔습니다)");

[["표정", 표정실측, "표정"], ["글자 입력칸", 입력실측, "글자"]].forEach(function (t) {
  t[1].forEach(function (c) {
    const 막대위끝 = c.barTop || c.h;
    const 전아래 = c.wrap.top + c.전.칸top + (t[2] === "표정" ? 표정크기.h : 입력크기.h);
    const 전넘침 = 전아래 - 막대위끝;
    const r = 돌리기(c, t[2]);
    const 후넘침 = r.화면bottom - 막대위끝;
    ok(t[0] + " " + c.이름 + " — 전 " + 전넘침 + "px 내려감 → 후 " + 후넘침 + "px",
      후넘침 <= 전넘침 && 후넘침 <= 0,
      "아직 " + 후넘침 + "px");
  });
});

/* =====================================================================
 * [5] 자리가 넉넉하면 원래대로 — 누른 곳에 그대로 붙는다
 * ===================================================================== */
절("[5] 자리가 넉넉하면 예전처럼 누른 곳에 붙는다 (한 번 밀린 채 굳지 않는다)");
{
  /* 차트 칸이 화면 안에 통째로 보이고 위쪽을 누른 경우 */
  const 넉넉 = { 이름: "넉넉", w: 1440, h: 900, barTop: null,
    wrap: { top: 100, width: 716, height: 700 }, sx: 200, sy: 200 };
  const f = 돌리기(넉넉, "표정");
  ok("표정 — 누른 곳 오른쪽 아래에 그대로 (왼 208 · 위 208)",
    f.칸left === 208 && f.칸top === 208, "왼" + f.칸left + " 위" + f.칸top);
  const t = 돌리기(넉넉, "글자");
  /* 위쪽은 「누른 곳에서 칸 키의 절반만큼」 위입니다.
     22차 2026-09-03 이전에는 소스에 -12 가 손으로 적혀 있었습니다 —
     12px 글씨일 때 칸 키(23px)의 절반이라는 뜻이었습니다.
     글씨를 17px 로 올리자 칸이 31px 이 되어 그 값이 뜻을 잃었습니다.
     소스가 이제 ih / 2 를 쓰므로, 여기도 ★숫자를 다시 안 적고★ 끌어냅니다. */
  const 기대위 = Math.round(넉넉.sy - 입력크기.h / 2);
  ok("입력칸 — 누른 곳에 그대로 (왼 " + 넉넉.sx + " · 위 " + 기대위 + " = 누른 곳 - 칸 키의 절반)",
    t.칸left === 넉넉.sx && t.칸top === 기대위, "왼" + t.칸left + " 위" + t.칸top);
}

/* =====================================================================
 * [6] 전체화면이면 주문 막대를 안 센다 (chipFloorY 가 이미 그렇게 합니다)
 * ===================================================================== */
절("[6] 전체화면일 때는 매수·매도 바를 세지 않는다");
{
  /* 전체화면에서는 바가 화면에 안 그려지므로 화면 아래끝까지 씁니다.
     chipFloorY 가 document.fullscreenElement 를 보고 판단합니다 —
     여기서는 「바를 display:none 으로 둔 것」 과 같은 상태로 확인합니다. */
  const 전체 = { 이름: "전체화면", w: 360, h: 800, barTop: null,
    wrap: { top: 0, width: 360, height: 800 }, sx: 100, sy: 700 };
  const r = 돌리기(전체, "표정");
  ok("바가 없으면 화면 아래끝(792)까지 쓴다 (아래끝 " + r.화면bottom + " ≤ 792)",
    r.화면bottom <= 800 - CHIP_EDGE, "아래끝 " + r.화면bottom);
  ok("그래도 위로는 안 나간다", r.칸top >= 4, "칸top " + r.칸top);
}

/* =====================================================================
 * [7] 소스 — 되돌림 방지
 * ===================================================================== */
절("[7] 소스 — 고친 방식이 되돌아가지 않게");
{
  const 표 = 조각.openFacePicker || "";
  const 입 = 조각.openTextInput || "";

  ok("표정 창이 chipFloorY() 를 본다 (화면에 보이는 바닥을 안다)",
    /chipFloorY\(\)/.test(표), "안 봅니다 — 차트 칸만 보면 막대 밑으로 내려갑니다");
  ok("입력칸이 chipFloorY() 를 본다",
    /chipFloorY\(\)/.test(입), "안 봅니다");
  ok("표정 창이 차트 칸 기준으로 옮겨 쓴다 (wr.top 을 뺀다)",
    /chipFloorY\(\)\s*-\s*wr\.top/.test(표), "없음");
  ok("입력칸도 차트 칸 기준으로 옮겨 쓴다 (wr2.top 을 뺀다)",
    /chipFloorY\(\)\s*-\s*wr2\.top/.test(입), "없음");

  ok("★표정 창의 옛 방어 한 줄이 그대로 남아 있다★ " +
    "(chart-place-bottom-guard-seal 이 이 줄을 표식으로 씁니다)",
    /top\s*\+\s*bh\s*>\s*wr\.height/.test(표), "지웠습니다 — 그쪽 봉인이 빨개집니다");

  ok("입력칸이 가로도 막는다 (전에는 화면 밖으로 나갔습니다)",
    /ileft\s*\+\s*iw\s*>\s*wr2\.width/.test(입), "없음");
  ok("입력칸이 세로도 막는다",
    /itop\s*\+\s*ih\s*>\s*i바닥/.test(입), "없음");

  ok("★글씨·크기는 안 건드린다★ — 표정 창",
    !/fontSize|font-size|style\.width|style\.height/.test(표), "크기를 건드립니다");
  ok("★글씨·크기는 안 건드린다★ — 입력칸",
    !/fontSize|font-size|style\.width\s*=|style\.height\s*=/.test(입), "크기를 건드립니다");

  ok("입력칸은 붙인 뒤에 자리를 잡는다 (붙이기 전에는 키·폭이 0 입니다)",
    입.indexOf("wrap.appendChild(inp)") >= 0 &&
    입.indexOf("wrap.appendChild(inp)") < 입.indexOf("inp.style.top ="),
    "붙이기 전에 자리를 잡으면 offsetHeight 가 0 이라 못 막습니다");

  /* 차트 칸 좌표로 띄우는 것이 셋째가 생기면 여기서 빨개집니다 */
  const 이름들 = (SRC.match(/function\s+([A-Za-z_$][\w$]*)\s*\(/g) || [])
    .map(function (s) { return s.replace(/function\s+/, "").replace(/\s*\($/, ""); });
  const 칸좌표 = 이름들.filter(function (n) {
    const b = 함수떼기(n) || "";
    return b && n !== "putFixed" && /style\.top\s*=/.test(b) && b.indexOf("putFixed(") < 0;
  });
  ok("차트 칸 좌표로 띄우는 함수는 2개 그대로다 (" + 칸좌표.join(" · ") + ")",
    칸좌표.slice().sort().join(",") === "openFacePicker,openTextInput",
    "지금: " + 칸좌표.join(",") + " → 새로 생겼으면 ★chipFloorY 로 바닥을 보는지★ " +
    "사람이 보고 이 줄을 고치세요");
}

/* =====================================================================
 * [8] 돌연변이 자체검증 — 방어를 빼면 반드시 빨개진다
 * ===================================================================== */
절("[8] 돌연변이 — 방어를 빼면 정말 넘치는가");
{
  const c = 표정실측[0];
  const 옛 = 옛계산(c, "표정");
  const 막대 = c.barTop;
  const 옛아래 = c.wrap.top + 옛.칸top + 표정크기.h;
  ok("옛 계산이면 360 에서 막대 밑으로 " + (옛아래 - 막대) + "px 내려간다 (44 여야 함)",
    옛아래 - 막대 === 44, "지금 " + (옛아래 - 막대));
  const 지금 = 돌리기(c, "표정");
  ok("지금 계산이면 막대 위 " + (지금.화면bottom - 막대) + "px 이다",
    지금.화면bottom - 막대 < 0, "지금 " + (지금.화면bottom - 막대));

  const c2 = 입력실측[0];
  const 옛2 = 옛계산(c2, "글자");
  const 옛아래2 = c2.wrap.top + 옛2.칸top + 입력크기.h;
  ok("옛 계산이면 360 에서 입력칸이 막대 밑으로 " + (옛아래2 - c2.barTop) + "px 내려간다 (9 여야 함)",
    옛아래2 - c2.barTop === 9, "지금 " + (옛아래2 - c2.barTop));
  ok("옛 계산이면 입력칸이 차트 칸 오른쪽으로 " + (옛2.칸left + 입력크기.w - c2.wrap.width) + "px 나간다",
    옛2.칸left + 입력크기.w > c2.wrap.width, "안 나갑니다");
}

/* =====================================================================
 * [10] ★지금 입력칸이 대표가 읽을 수 있는 크기인가★ (22차 2026-09-03)
 * ---------------------------------------------------------------------
 * 위 [1]~[8] 은 17차(12px · 150px) 실측을 replay 해서 ★막는 논리★ 를 봅니다.
 * 이 절은 ★지금 화면에 실제로 뜨는 크기★ 를 봅니다.
 *
 * 대표가 네 번째로 말씀하셨습니다 —
 *   "팝업창 같은거뜨는거 다 키워조 너무 안보여 글씨들이 확실히 보이게 만들어"
 * 12px 은 대표가 말씀하신 크기의 3분의 2 도 안 됩니다.
 *
 * ⚠️ 글씨만 키우고 폭을 두면 ★보이는 글자 수가 줄어듭니다★ —
 *   17px 에서 한글 10자 = 156px 이라 150px 칸에는 9자밖에 안 들어갑니다
 *   (maxlength 는 40자입니다). 그래서 폭도 같이 봅니다.
 * ===================================================================== */
절("[10] 지금 입력칸 크기 — 글씨 " + 입력지금.글씨 + "px · 폭 " + 입력지금.w + "px");
{
  const i = SRC.indexOf(".tl-draw-input{");
  ok(".tl-draw-input 규칙을 찾았다", i >= 0, "선택자가 바뀌었나요?");
  /* ⚠️ 400 글자로 자르면 안 됩니다 — 이 규칙은 "..." + 색이름 + "..." 로 쪼개져
     있고 사이에 긴 주석이 들어 있습니다. 규칙이 끝나는 }" 까지 잘라서 봅니다. */
  const 끝 = i >= 0 ? SRC.indexOf(String.fromCharCode(125, 34), i) : -1;
  const 규칙 = i >= 0 && 끝 > i ? SRC.slice(i, 끝) : "";
  const 글씨 = (new RegExp("font-size:\\s*(\\d+)px").exec(규칙) || [])[1];
  const 폭 = (new RegExp("width:\\s*(\\d+)px").exec(규칙) || [])[1];
  ok("입력칸 글씨가 " + 입력지금.글씨 + "px 이상이다 (★줄이지 마세요★)",
    Number(글씨) >= 입력지금.글씨, "지금 " + 글씨 + "px");
  ok("입력칸 폭이 " + 입력지금.w + "px 이상이다 (글씨만 키우면 보이는 글자 수가 줄어듭니다)",
    Number(폭) >= 입력지금.w, "지금 " + 폭 + "px");

  /* ★손으로 적은 절반값이 다시 들어오지 않게★ —
     22차 이전에는 `o.y + y - 12` 였습니다. 12 는 「12px 글씨일 때 칸 키 23 의 절반」
     이라는 뜻이었는데, 글씨를 키우자 뜻을 잃고 칸이 3.5px 위로 떴습니다. */
  const 입 = 조각.openTextInput || "";
  ok("누른 곳에 세로로 맞출 때 ★그때그때 잰 키★ 를 쓴다 (ih / 2)",
    입.indexOf("var itop = o.y + y - ih / 2;") >= 0,
    "숫자를 손으로 적으면 다음에 글씨를 키울 때 또 어긋납니다");
  ok("키를 재는 줄이 자리 잡는 줄보다 ★먼저★ 온다",
    입.indexOf("inp.offsetHeight") >= 0 &&
    입.indexOf("inp.offsetHeight") < 입.indexOf("var itop ="),
    "키를 재기 전에 쓰면 ih 가 undefined 입니다");
}

/* =====================================================================
 * [9] 내가 목록에 등록돼 있다
 * ===================================================================== */
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-pane-popup-bottom-fit.test.js") >= 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
