/* ===========================================================================
 * tests/chart-timezone-order-bar-floor.test.js
 * ===========================================================================
 * 시간대 창이 폰 하단 주문막대 밑으로 내려가면 안 된다 (★짧은 화면★)
 *
 * 2026-09-03 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 ──────────────────────────────────────────────────
 *
 *   js/chart-timezone.js 의 clampMenu() 가 아래쪽을 ★vh - 8★ 로만 봤습니다.
 *   폰에는 그 위에 하단 매수/매도 바(.tl-order-bar)가 겹쳐 떠 있고,
 *   바의 z-index 는 990, 이 창은 70 이라 ★창이 바 밑에 깔립니다★.
 *
 *   더 나쁜 것은 ★스크롤도 안 생겼다는 점★ 입니다. CSS 가
 *   max-height:calc(100vh - 20px) 라 창은 "다 들어갔다" 고 여깁니다.
 *   그래서 밑에 깔린 부분을 ★손으로 꺼낼 수도 없었습니다★.
 *   오류 0건 · 화면 안 깨짐 → CLAUDE.md 가 말하는 ★조용한 고장★ 입니다.
 *
 *   수리 전 실측 (localhost, 스크롤 25px 간격 전수, 창 자연 키 608px)
 *       360x640  바닥 559 · 창 8~616 · ★+57px★
 *       375x667  바닥 586 · 창 8~616 · ★+30px★
 *       390x664  바닥 583 · 창 8~616 · ★+33px★
 *       360x800  바닥 719 · 창 74~682 ·  -37px   (안 넘침)
 *   수리 후  360x640 창 8~559(551px·안에서 스크롤) · over 0
 *           375x667 창 8~586(578px) · 390x664 창 8~583(575px) · 전부 over 0
 *           vh 800 이상은 ★키가 608 그대로★ (넉넉하면 안 건드립니다)
 *
 *   ★vh 800 에서만 재면 못 찾는 고장★ 이었습니다. 360x640 은 갤럭시 구형에서
 *   실제로 쓰는 높이입니다.
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *
 *   [0] 흉내가 진짜와 같은 답을 내는가 — 수리 전 소스로 브라우저 실측 재현
 *   [1] 짧은 화면 셋에서 바닥을 안 넘는가
 *   [2] ★키를 바닥 안으로 줄여 안에서 스크롤하게 하는가★
 *       — 이게 핵심입니다. 자리만 밀면 위아래 중 한쪽이 반드시 넘칩니다
 *         (창 608px > 쓸 수 있는 551px)
 *   [3] ★글씨를 줄여서 해결하지 않았는가★ — font-size 는 그대로여야 합니다
 *   [4] ★자리가 넉넉하면 키를 안 건드린다★ (vh 800 · 768 · 1920)
 *   [5] 주문막대가 없으면(768 이상 · display:none · 전체화면) vh-8 만 본다
 *   [6] 돌연변이 자체검증 — 두 장치를 각각 빼면 [1] 이 진짜 터지는가
 *
 * ── 어떻게 재나 ───────────────────────────────────────────────────────
 *   jsdom 은 화면을 안 그려서 rect 가 전부 0 입니다. 그래서 원본에서
 *   EDGE · menuFloorY · clampMenu 를 ★글자 그대로 떼어★ vm 에서 돌리고,
 *   창 자리는 CSS(position:absolute · right:0 · bottom:Npx)를 그대로
 *   계산해 냅니다. 흉내가 맞는지는 [0] 에서 먼저 확인합니다 —
 *   ★흉내가 틀리면 이 봉인 전체가 헛것입니다.★
 *
 *   크기는 2026-09-03 브라우저 실측입니다 (360x640 · scrollY 800)
 *       wrap(시간대 단추 줄) offsetHeight 32 · rect 523~555 · left 146 right 343
 *       창 자연 키 608 · 창 폭 300
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 *   ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js/chart-timezone.js"), "utf8");

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; 실패목록.push(제목); console.log("  X " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

/* --- 브라우저 실측 크기 (360x640 · scrollY 800 · 2026-09-03) ------------ */
const WRAP_H = 32;      /* 시간대 단추 줄 offsetHeight */
const WRAP_TOP = 523;
const WRAP_LEFT = 146;
const WRAP_RIGHT = 343;
const MENU_NAT = 608;   /* 창 자연 키 (테두리 포함) */
const MENU_W = 300;
const EDGE_기대 = 8;

/** 원본에서 함수를 ★글자 그대로★ 떼어냅니다 (중괄호를 세어 끝을 찾습니다) */
function 함수떼기(이름, src) {
  const i = src.indexOf("function " + 이름 + "(");
  if (i < 0) return null;
  let depth = 0, k = src.indexOf("{", i);
  if (k < 0) return null;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

/**
 * clampMenu 를 가짜 화면에서 실제로 돌립니다.
 *   vh · vw     화면 크기
 *   바          주문막대 높이 (null 이면 그 폭에 바가 없음 = 768 이상)
 *   바숨김      바가 display:none 인가
 *   wrapTop     시간대 단추 줄 위끝 (화면 기준)
 *   전체화면    document.fullscreenElement 가 있는가
 *   src         쓸 소스 (돌연변이 검증용)
 */
function 돌려보기(o) {
  const src = o.src || SRC;
  const vh = o.vh, vw = o.vw;
  const wrapTop = o.wrapTop === undefined ? WRAP_TOP : o.wrapTop;
  const wrapBottom = wrapTop + WRAP_H;

  const EDGEm = /var\s+EDGE\s*=\s*(\d+)\s*;/.exec(src);
  if (!EDGEm) return { 오류: "EDGE 를 못 찾았습니다" };
  const EDGE = Number(EDGEm[1]);

  const 바 = o.바
    ? {
        __display: o.바숨김 ? "none" : "block",
        getBoundingClientRect: () => ({ top: vh - o.바, bottom: vh, height: o.바 })
      }
    : null;

  const wrap = { offsetHeight: WRAP_H, top: wrapTop, bottom: wrapBottom,
    left: WRAP_LEFT, right: WRAP_RIGHT };

  /* CSS 를 그대로 계산합니다 — position:absolute, 기준은 #tl-tz-wrap.
     가로 : right:0 이면 오른쪽 맞춤, left:Npx 면 wrap 왼끝에서 N 만큼.
     세로 : bottom:Npx 는 wrap ★아래끝에서 위로★ N 만큼 (커질수록 위로). */
  const menu = {
    style: { right: "", left: "", top: "", bottom: "", maxHeight: "" },
    getBoundingClientRect() {
      let h = MENU_NAT;
      const cap = parseFloat(this.style.maxHeight);
      if (isFinite(cap) && cap < h) h = cap;
      let left, right;
      if (/px$/.test(this.style.left || "")) {
        left = wrap.left + parseFloat(this.style.left);
        right = left + MENU_W;
      } else {
        right = wrap.right;
        left = right - MENU_W;
      }
      const b = parseFloat(this.style.bottom) || 0;
      const bottom = wrap.bottom - b;
      return { top: bottom - h, bottom, left, right, width: MENU_W, height: h };
    }
  };

  const sb = {
    menu, wrap,
    isOpen: () => true,
    window: {
      innerWidth: vw, innerHeight: vh,
      getComputedStyle: (el) => ({ display: el.__display })
    },
    document: {
      documentElement: { clientWidth: vw, clientHeight: vh },
      fullscreenElement: o.전체화면 ? {} : null,
      webkitFullscreenElement: null,
      querySelector: (s) => (s === ".tl-order-bar" ? 바 : null)
    },
    console: { log() {}, warn() {} }
  };
  vm.createContext(sb);

  const 바닥 = 함수떼기("menuFloorY", src);
  const 클램프 = 함수떼기("clampMenu", src);
  if (!클램프) return { 오류: "clampMenu 를 못 찾았습니다" };
  const code =
    "var EDGE = " + EDGE + ";\n" +
    (바닥 || "") + "\n" + 클램프 + "\nclampMenu();\n";
  vm.runInContext(code, sb, { filename: "떼어낸-chart-timezone.js" });

  const r = menu.getBoundingClientRect();
  let floor = vh - EDGE;
  if (o.바 && !o.바숨김 && !o.전체화면) {
    if (vh - o.바 - EDGE < floor) floor = vh - o.바 - EDGE;
  }
  return {
    EDGE,
    top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height),
    floor, over: Math.round(r.bottom - floor), overTop: Math.round(EDGE - r.top),
    키줄임: menu.style.maxHeight || "",
    styleBottom: menu.style.bottom
  };
}

/* 실제 폰 하단 바 높이 — style.css 에서 읽습니다 (숫자를 여기 안 적습니다) */
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const 바CSS = CSS.slice(CSS.indexOf(".tl-order-bar{"), CSS.indexOf(".tl-order-bar{") + 400);
const 단추CSS = CSS.slice(CSS.indexOf(".tl-order-bar-btn{"), CSS.indexOf(".tl-order-bar-btn{") + 400);
const 바높이 = parseFloat((단추CSS.match(/height:(\d+(?:\.\d+)?)px/) || [])[1]) +
  parseFloat((바CSS.match(/padding:(\d+(?:\.\d+)?)px/) || [])[1]) * 2;

/* ===================================================================== */
절("[0] 흉내가 진짜와 같은 답을 내는가 (수리 전 소스로 브라우저 실측 재현)");

ok("style.css 에서 바 높이를 읽었다 (" + 바높이 + "px · 브라우저 실측 73px)",
  isFinite(바높이) && Math.abs(바높이 - 73) <= 2, "계산 " + 바높이);

/* 수리 전 = ① 바닥을 vh-8 로 보고 ② 키를 안 줄이던 코드 */
const 수리전 = SRC
  .replace(`      menu.style.maxHeight = "";
      var 쓸수있는키 = floorY - EDGE;
      if (menu.getBoundingClientRect().height > 쓸수있는키) {
        menu.style.maxHeight = Math.round(쓸수있는키) + "px";
      }
`, `      menu.style.maxHeight = "";
`)
  .replace("var floorY = menuFloorY();",
    "var floorY = (document.documentElement.clientHeight || window.innerHeight || 0) - EDGE;");
/* ⚠ indexOf("menuFloorY()") 로는 못 가립니다 — ★주석에도 같은 글자★ 가
   있어서 늘 참이 됩니다. 실제로 바뀐 ★코드 줄★ 을 봅니다.
   (이 테스트를 쓰면서 한 번 그렇게 헛돌았습니다) */
ok("돌연변이가 실제로 소스를 두 군데 바꿨다",
  수리전 !== SRC && 수리전.indexOf("쓸수있는키") < 0 &&
  수리전.indexOf("var floorY = menuFloorY();") < 0,
  "replace 가 안 먹었습니다");

const 전 = 돌려보기({ vw: 360, vh: 640, 바: 73, wrapTop: 523, src: 수리전 });
ok("360x640 수리 전 — 창 8~616 · 키 608 · 바닥 559 · ★+57px★ (브라우저 실측과 일치)",
  !!전 && 전.top === 8 && 전.bottom === 616 && 전.h === 608 && 전.floor === 559 && 전.over === 57,
  JSON.stringify(전));
ok("360x640 수리 전 — 키를 안 줄여서 스크롤이 안 생겼다 (밑에 깔린 걸 못 꺼냄)",
  !!전 && 전.키줄임 === "", JSON.stringify(전));

const 후 = 돌려보기({ vw: 360, vh: 640, 바: 73, wrapTop: 523 });
ok("360x640 수리 후 — 창 8~559 · 키 551 · bottom -4px (브라우저 실측과 글자까지 일치)",
  !!후 && 후.top === 8 && 후.bottom === 559 && 후.h === 551 && 후.styleBottom === "-4px" &&
  후.키줄임 === "551px", JSON.stringify(후));

/* ===================================================================== */
절("[1] ★짧은 화면★ — 갤럭시 구형(640) · 아이폰 SE(667) · 아이폰(664)");

const 짧은화면 = [
  { 이름: "360x640", vw: 360, vh: 640, wrapTop: 523 },
  { 이름: "375x667", vw: 375, vh: 667, wrapTop: 550 },
  { 이름: "390x664", vw: 390, vh: 664, wrapTop: 547 }
];
const 짧은결과 = 짧은화면.map((s) => {
  const r = 돌려보기({ vw: s.vw, vh: s.vh, 바: 73, wrapTop: s.wrapTop });
  ok(s.이름 + " — 주문막대 바닥을 안 넘는다", !!r && r.over <= 0, JSON.stringify(r));
  ok(s.이름 + " — 화면 위로도 안 나간다", !!r && r.top >= EDGE_기대, JSON.stringify(r));
  return r;
});

/* ===================================================================== */
절("[2] ★키를 바닥 안으로 줄여 안에서 스크롤하게 한다★ (이 봉인의 핵심)");

짧은화면.forEach((s, i) => {
  const r = 짧은결과[i];
  ok(s.이름 + " — 키가 쓸 수 있는 만큼(" + (r.floor - r.EDGE) + "px)으로 줄었다",
    !!r && r.h === r.floor - r.EDGE, JSON.stringify(r));
  ok(s.이름 + " — 자연 키(" + MENU_NAT + ")보다 작아졌으니 안에서 스크롤된다",
    !!r && r.h < MENU_NAT && r.키줄임 !== "", JSON.stringify(r));
});

/* ===================================================================== */
절("[3] ★글씨를 줄여서 해결하지 않았는가★ — 확정된 글자 크기 그대로");

{
  /* 2026-09-03 확정값. 이 창은 제목 17 · 항목 19 · 설명 17 입니다.
     좁은 화면이 안 들어간다고 여기를 낮추면 이 검사가 빨개집니다.
     ⚠️ 2026-09-03 — 설명이 15 였는데 대표가 ★네 번째★ 로 "안 보인다" 고 하셔서
        17 로 올렸습니다. 그때 이 검사가 "15px 그대로다" 로 못 박혀 있어 빨개졌습니다.
        ★막으려던 것은 줄이는 것이지 키우는 것이 아니었습니다.★
        그래서 ★바닥값(이 값 이상)★ 으로 바꿉니다. 낮추면 여전히 빨개지고,
        대표가 또 "키워" 라고 해도 이 파일을 고칠 일이 없습니다. */
  /* ⚠ CSS 는 "..." + 색이름 + "..." 로 ★쪼개져 붙습니다★.
     정규식 하나로 훑으면 따옴표에서 끊깁니다. 선택자 자리부터 잘라서
     그 안의 첫 font-size 를 봅니다. */
  function 글씨크기(선택자) {
    const i = SRC.indexOf(선택자 + "{");
    if (i < 0) return null;
    const m = /font-size:(\d+(?:\.\d+)?)px/.exec(SRC.slice(i, i + 500));
    return m ? Number(m[1]) : null;
  }
  const 기대 = [
    { 무엇: "제목 .tl-tz-title", 선택자: ".tl-tz-menu .tl-tz-title", 값: 17 },
    { 무엇: "항목 button", 선택자: ".tl-tz-menu button", 값: 19 },
    { 무엇: "설명 button i", 선택자: ".tl-tz-menu button i", 값: 17 }
  ];
  기대.forEach((t) => {
    const 지금 = 글씨크기(t.선택자);
    ok("시간대 창 " + t.무엇 + " 글씨가 " + t.값 + "px 이상이다",
      지금 !== null && 지금 >= t.값, 지금 === null ? "못 찾았습니다" : "지금 " + 지금 + "px");
  });
  ok("좁은 화면 전용으로 글씨를 낮추는 @media 가 안 생겼다",
    !/tl-tz-menu[^"]*font-size:1[0-4]px/.test(SRC),
    "14px 이하가 생겼습니다 — 대표가 작은 글씨를 못 읽습니다");
}

/* ===================================================================== */
절("[4] ★자리가 넉넉하면 키를 안 건드린다★ — 멀쩡한 것을 줄이면 안 됩니다");

const 넉넉 = [
  { 이름: "360x800 (폰·바 있음)", vw: 360, vh: 800, 바: 73, wrapTop: 683 },
  { 이름: "768x1024 (바 없음)", vw: 768, vh: 1024, 바: null, wrapTop: 907 },
  { 이름: "1920x1080 (바 없음)", vw: 1920, vh: 1080, 바: null, wrapTop: 963 }
];
넉넉.forEach((s) => {
  const r = 돌려보기(s);
  ok(s.이름 + " — 키가 " + MENU_NAT + " 그대로다 (안 줄임)",
    !!r && r.h === MENU_NAT && r.키줄임 === "", JSON.stringify(r));
  ok(s.이름 + " — 그래도 안 넘친다", !!r && r.over <= 0 && r.top >= EDGE_기대, JSON.stringify(r));
});

/* ===================================================================== */
절("[5] 주문막대가 없으면 vh-8 만 본다 (768 이상 · display:none · 전체화면)");

{
  const a = 돌려보기({ vw: 768, vh: 640, 바: null, wrapTop: 523 });
  ok("768x640 — 바가 없으니 바닥은 vh-8 (632)", !!a && a.floor === 632, JSON.stringify(a));
  ok("768x640 — 키를 안 줄인다 (608 <= 624)", !!a && a.h === MENU_NAT, JSON.stringify(a));

  const b = 돌려보기({ vw: 360, vh: 640, 바: 73, 바숨김: true, wrapTop: 523 });
  ok("바가 display:none 이면 세지 않는다 (바닥 632)", !!b && b.floor === 632, JSON.stringify(b));
  ok("바가 숨겨졌으면 키를 안 줄인다", !!b && b.h === MENU_NAT, JSON.stringify(b));

  const c = 돌려보기({ vw: 360, vh: 640, 바: 73, 전체화면: true, wrapTop: 523 });
  ok("전체화면이면 바를 안 센다 (바가 안 그려집니다 · 바닥 632)",
    !!c && c.floor === 632 && c.h === MENU_NAT, JSON.stringify(c));
}

/* ===================================================================== */
절("[6] 돌연변이 자체검증 — 장치를 하나씩 빼면 [1] 이 진짜 터지는가");

ok("지금 소스는 [1] 을 통과한다 (먼저 확인)",
  짧은결과.every((r) => r && r.over <= 0 && r.top >= EDGE_기대));

{
  /* ① 바닥만 되돌리기 (키 줄이기는 남김) */
  const 돌1소스 = SRC.replace("var floorY = menuFloorY();",
    "var floorY = (document.documentElement.clientHeight || window.innerHeight || 0) - EDGE;");
  ok("돌연변이① 이 소스를 바꿨다", 돌1소스 !== SRC);
  const 돌1 = 돌려보기({ vw: 360, vh: 640, 바: 73, wrapTop: 523, src: 돌1소스 });
  ok("바닥을 vh-8 로 되돌리면 360x640 이 다시 넘친다 (+" + (돌1 && 돌1.over) + ")",
    !!돌1 && 돌1.over > 0, "안 터졌습니다 — 봉인이 헛것입니다: " + JSON.stringify(돌1));

  /* ② 키 줄이기만 빼기 (바닥은 남김) */
  const 돌2소스 = SRC.replace(`      var 쓸수있는키 = floorY - EDGE;
      if (menu.getBoundingClientRect().height > 쓸수있는키) {
        menu.style.maxHeight = Math.round(쓸수있는키) + "px";
      }
`, "");
  ok("돌연변이② 가 소스를 바꿨다", 돌2소스 !== SRC && 돌2소스.indexOf("쓸수있는키") < 0);
  const 돌2 = 돌려보기({ vw: 360, vh: 640, 바: 73, wrapTop: 523, src: 돌2소스 });
  ok("★키를 안 줄이면 자리만 밀어도 위쪽이 넘친다★ (위로 " + (돌2 && 돌2.overTop) + "px)",
    !!돌2 && (돌2.over > 0 || 돌2.overTop > 0),
    "안 터졌습니다 — 키 줄이기가 아무것도 안 하고 있습니다: " + JSON.stringify(돌2));
}

/* ===================================================================== */
절("[7] 등록");
{
  const 목록 = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    목록.indexOf("tests/chart-timezone-order-bar-floor.test.js") >= 0);
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") >= 0);
}

/* ===================================================================== */
console.log("\n" + "=".repeat(60));
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 목록:");
  실패목록.forEach(function (t) { console.log("  - " + t); });
}
console.log("=".repeat(60));
process.exit(fail ? 1 : 0);
