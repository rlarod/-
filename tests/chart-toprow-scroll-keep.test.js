/* tests/chart-toprow-scroll-keep.test.js
 * =========================================================================
 * 전체화면을 오갈 때 도구 막대의 ★옆으로 민 자리★ 를 지키는가
 * =========================================================================
 * 2026-09-08 · 수리팀
 *   대상: js/chart-toprow.js (App.ChartTopRow) 의 keepScroll
 *
 * ── 무슨 고장이었나 (P2) ───────────────────────────────────────────────
 *   전체화면에 들어가면 도구 막대가 ★맨 왼쪽으로 되돌아갔습니다.★
 *   회원이 오른쪽 끝까지 밀어 놓고 전체화면을 켜면 처음으로 튕겨 나가,
 *   ★나가기 단추가 화면 밖★ 에 남습니다. 폰에는 Esc 가 없습니다.
 *
 *   2026-09-08 실측 (390 · 진짜 requestFullscreen · localhost)
 *       수정 전 : 민 자리 607 → 들어가면 ★0★ · 나와도 ★0★
 *                 나가기 단추 left 810.2 (창폭 390) → ★화면 밖 420.2px★
 *       수정 후 : 607 → 605(전체화면의 최대값) · 나온 뒤 605
 *                 나가기 단추 left 205.2 / right 249.2 → ★화면 안★
 *
 * ── 원인 ─────────────────────────────────────────────────────────────
 *   ★코드 어디에도 scrollLeft = 0 은 없습니다.★ 옆으로 밀리는 상자가
 *   합친 줄 안에 있는데 그 줄의 부모를 바꾸면 브라우저가 상자를 떼었다
 *   붙입니다. ★떼는 순간 민 자리가 사라집니다.★ DOM 이동 자체가 원인입니다.
 *   조사팀 실측 — 같은 부모·같은 자리에 다시 끼우기만 해도 607 → 0.
 *
 * ── ⭐ 여기서 ★안 보는 것★ (두 벌 금지) ───────────────────────────────
 *   · 합친 줄이 한 줄인가 · 머리 높이 · 밀기 표시(› )
 *     -> tests/chart-toprow.test.js 한 곳입니다.
 *   · 전체화면 단추의 아이콘·색
 *     -> js/chart-drawings.js 쪽 봉인 한 곳입니다.
 *   · 나가기 단추를 따로 고정 배치하는 안(안 2)
 *     -> PM 이 별건으로 미뤘습니다. 여기서 안 봅니다.
 *
 * ── ⭐ 여기서만 보는 것 ────────────────────────────────────────────────
 *   [A] 전체화면에 ★들어갈 때★ 민 자리가 지켜지는가
 *   [B] ★나올 때도★ 지켜지는가 (조사팀 실측 — 나올 때도 0 이었습니다)
 *   [C] 처음 자리를 잡을 때(build)도 지켜지는가
 *   [D] 끌 때(disable)도 지켜지는가 — 되돌리는 길이라고 잃을 이유가 없습니다
 *   [E] ★동기★ 인가 — 한 프레임이라도 미루면 회원 눈에 튀는 게 보입니다
 *   [F] 감싸지 않은 이동이 ★늘지 않는가★ (래칫)
 *
 * ── 브라우저를 안 씁니다 ───────────────────────────────────────────────
 *   jsdom 에는 스크롤이 없습니다(scrollLeft 가 늘 0). 그래서 ★브라우저가
 *   실제로 하는 일★ 을 흉내 낸 상자를 만듭니다 — 값을 기억하다가, 자기
 *   자신이나 자기를 담은 요소가 옮겨지면 0 으로 떨어집니다.
 *   실제 화면 값은 사람이 아홉 크기로 따로 쟀습니다(위 실측).
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-toprow-scroll-keep.test.js
 *   그리고 tests/_order.txt 의 이 줄을 지웁니다.
 *   ⚠ rm 이 아니라 ★git rm★ 입니다 — git 에 남으면 tests-dir-hygiene 이 터집니다.
 *   사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-toprow.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const ORDER = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
const SELF = path.basename(__filename);

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* =========================================================================
 * 가짜 화면 — ★브라우저의 스크롤 되돌아감★ 을 흉내 냅니다.
 * ========================================================================= */
const 내용폭 = 1000;
const 칸폭 = 390;
const 최대 = 내용폭 - 칸폭;   /* 610 */

function 띄우기() {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      '<div class="main-grid" data-mtab="chart">' +
      '<div id="page-exchange">' +
      '<div class="chart-panel">' +
      '<div class="tlc-toolbar"><button class="tlc-btn">A</button></div>' +
      '<div class="chart-wrap"></div>' +
      "</div>" +
      '<div id="interval-row"><button>1분</button></div>' +
      "</div></div></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;
  const bar = doc.querySelector(".tlc-toolbar");

  /* --- 옆으로 밀리는 상자 흉내 ------------------------------------------ */
  let v = 0;
  Object.defineProperty(bar, "scrollLeft", {
    configurable: true,
    get: function () { return v; },
    set: function (x) {
      const n = Number(x);
      v = isNaN(n) ? 0 : Math.max(0, Math.min(n, 최대));
    }
  });
  Object.defineProperty(bar, "scrollWidth", { configurable: true, get: function () { return 내용폭; } });
  Object.defineProperty(bar, "clientWidth", { configurable: true, get: function () { return 칸폭; } });

  /* --- ★브라우저가 실제로 하는 일★ — 떼었다 붙이면 0 -------------------- */
  let 되돌아간횟수 = 0;
  const P = win.Node.prototype;
  ["appendChild", "insertBefore", "removeChild", "replaceChild"].forEach(function (name) {
    const orig = P[name];
    P[name] = function (node) {
      const 옮김 = !!(node && node.nodeType === 1 &&
        (node === bar || (node.contains && node.contains(bar))));
      const r = orig.apply(this, arguments);
      if (옮김) { v = 0; 되돌아간횟수++; }
      return r;
    };
  });

  /* --- 시간 --------------------------------------------------------------- */
  const 지연 = [];
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};
  /* ★일부러 없앱니다★ — rAF 가 없어도 그대로 도는지 같이 봅니다 */
  win.requestAnimationFrame = undefined;

  win.eval(SRC);

  const M = win.App.ChartTopRow;
  if (M && typeof M.init === "function") M.init();

  return {
    win: win, doc: doc, bar: bar, mod: M,
    panel: doc.querySelector(".chart-panel"),
    toprow: function () { return doc.querySelector(".tlc-toprow"); },
    민자리: function () { return bar.scrollLeft; },
    되돌아간횟수: function () { return 되돌아간횟수; },
    /* 전체화면은 .chart-panel 의 data-tlc-full 로 켜고 끕니다
       (js/chart-drawings.js:4533 이 실제로 그렇게 씁니다) */
    전체화면: function (on) {
      const p = doc.querySelector(".chart-panel");
      if (on) p.setAttribute("data-tlc-full", "1");
      else p.removeAttribute("data-tlc-full");
      /* MutationObserver 는 다음 마이크로태스크라 여기서는 직접 부릅니다 —
         진짜 브라우저에서는 저절로 도는 자리입니다. */
      M.init();
    }
  };
}

/* ========================================================================= */
절("[준비] 가짜 상자가 진짜처럼 되돌아가는가");

{
  const t = 띄우기();
  t.bar.scrollLeft = 999;
  ok("끝까지 밀면 최대값에서 멈춘다 (" + 최대 + ")", t.민자리() === 최대,
    "지금 " + t.민자리());
  const 앞 = t.되돌아간횟수();
  /* 같은 부모·같은 자리에 다시 끼워도 0 이 됩니다 — 조사팀 실측 ① */
  const p = t.bar.parentNode;
  p.insertBefore(t.bar, t.bar.nextSibling);
  ok("★옮기기만 해도 0 이 된다★ (조사팀 실측 ①과 같은 모양)",
    t.민자리() === 0 && t.되돌아간횟수() === 앞 + 1,
    "흉내가 진짜와 다르면 아래 검사가 다 의미 없습니다");
}

절("[A][B] 전체화면을 오갈 때 지켜지는가");

{
  const t = 띄우기();
  t.bar.scrollLeft = 최대;
  ok("들어가기 전 민 자리 = " + 최대, t.민자리() === 최대);

  t.전체화면(true);
  ok("합친 줄이 .chart-panel 안으로 들어갔다", t.toprow().parentNode === t.panel,
    "이동이 안 일어났으면 이 검사는 아무것도 안 봅니다");
  ok("[A] ★들어가도 민 자리가 그대로다★", t.민자리() === 최대,
    "지금 " + t.민자리() + " — 0 이면 나가기 단추가 화면 밖으로 나갑니다");

  t.전체화면(false);
  ok("합친 줄이 원래 자리로 돌아왔다", t.toprow().parentNode !== t.panel);
  ok("[B] ★나올 때도 그대로다★", t.민자리() === 최대,
    "지금 " + t.민자리());
}

{
  /* 끝까지가 아니라 ★중간★ 이어도 그 자리 그대로여야 합니다
     (2026-09-08 실측 — 300 에서 들어가고 나와도 300) */
  const t = 띄우기();
  t.bar.scrollLeft = 300;
  t.전체화면(true);
  const 안 = t.민자리();
  t.전체화면(false);
  ok("중간(300)에서 들어가고 나와도 300 그대로", 안 === 300 && t.민자리() === 300,
    "들어간 뒤 " + 안 + " · 나온 뒤 " + t.민자리());
}

{
  /* 두 번 연속 (2026-09-08 실측 — 두 번 다 605 유지) */
  const t = 띄우기();
  t.bar.scrollLeft = 최대;
  let 값 = [];
  for (let i = 0; i < 2; i++) {
    t.전체화면(true); 값.push(t.민자리());
    t.전체화면(false); 값.push(t.민자리());
  }
  ok("두 번 연속 오가도 계속 지켜진다", 값.every(function (x) { return x === 최대; }),
    "값 " + JSON.stringify(값));
}

절("[C] 처음 자리를 잡을 때(build)도 지켜지는가");

{
  /* 막대를 합친 줄 안으로 처음 옮기는 그 순간에도 같은 병이 있습니다.
     (다른 파일이 DOM 을 다시 그리면 build 가 다시 돕니다) */
  const t = 띄우기();
  t.bar.scrollLeft = 최대;
  const tr = t.toprow();
  /* 막대를 밖으로 빼내 build 가 다시 끌어들이게 만듭니다 */
  t.panel.appendChild(t.bar);
  t.bar.scrollLeft = 최대;
  t.mod.init();
  ok("막대가 다시 합친 줄 안으로 들어왔다", t.bar.parentNode === tr || t.bar.parentNode === t.toprow());
  ok("[C] build 의 이동에서도 민 자리가 그대로다", t.민자리() === 최대,
    "지금 " + t.민자리());
}

절("[D] 끌 때(disable)도 지켜지는가");

{
  const t = 띄우기();
  t.bar.scrollLeft = 최대;
  t.mod.disable();
  ok("disable 이 막대를 .chart-panel 로 되돌렸다", t.bar.parentNode === t.panel);
  ok("[D] 되돌리는 길에서도 민 자리가 그대로다", t.민자리() === 최대,
    "지금 " + t.민자리());
}

절("[E] ★동기★ 인가 · [F] 감싸지 않은 이동이 늘지 않았는가");

{
  /* keepScroll 의 본문을 떼어 봅니다 */
  const i = SRC.indexOf("function keepScroll(");
  ok("keepScroll 이 있다", i !== -1);
  const 본문 = SRC.slice(i, SRC.indexOf("\n  }", i));
  ok("keepScroll 안에서 setTimeout 을 안 쓴다", !/setTimeout/.test(본문),
    "한 프레임 미루면 회원 눈에 ★한 번 튀었다 돌아오는 것★ 이 보입니다");
  ok("keepScroll 안에서 requestAnimationFrame 을 안 쓴다",
    !/requestAnimationFrame/.test(본문), "위와 같습니다");
  ok("옮기기 전에 읽고 옮긴 뒤에 되돌린다",
    /keep\s*=\s*bar\.scrollLeft/.test(본문) && /bar\.scrollLeft\s*=\s*keep/.test(본문),
    "읽는 곳·쓰는 곳이 있어야 합니다");
  ok("원래 0 이었으면 굳이 쓰지 않는다", /if\s*\(!keep\)\s*return/.test(본문),
    "쓸데없는 쓰기는 브라우저가 다시 그리게 만듭니다");
}

{
  /* [F] 래칫 — 감싸지 않은 이동 줄은 지금 3곳입니다.
     ① build 가 ★빈★ 합친 줄을 처음 끼우는 곳 (그때는 막대가 아직 안 들어 있습니다)
     ②③ disable 안의 두 줄 — 블록 전체를 keepScroll 로 한 번에 감쌌습니다.
     새로 생기면(4곳 이상) 그 길로 민 자리가 0 이 됩니다. */
  const 줄 = SRC.split("\n");
  const 이동 = [];
  줄.forEach(function (l, n) {
    if (/(appendChild\(bar\)|insertBefore\(bar[,)]|insertBefore\(toprow[,)])/.test(l) &&
        l.indexOf("keepScroll") === -1) {
      이동.push((n + 1) + ": " + l.trim());
    }
  });
  ok("[F] keepScroll 로 안 감싼 이동이 3곳을 안 넘는다 (지금 " + 이동.length + "곳)",
    이동.length <= 3, "\n         " + 이동.join("\n         "));
  ok("전체화면 들어가기·나오기·막대 되찾기 세 곳이 모두 감싸져 있다",
    (SRC.match(/keepScroll\(function \(\) \{ p\.insertBefore\(toprow/) || []).length === 1 &&
    (SRC.match(/keepScroll\(function \(\) \{ home\.insertBefore\(toprow/) || []).length === 1 &&
    (SRC.match(/keepScroll\(function \(\) \{ toprow\.insertBefore\(bar/) || []).length === 1);
}

절("[G] 등록");

{
  ok("tests/_order.txt 에 등록돼 있다", ORDER.indexOf("tests/" + SELF) !== -1,
    "등록이 빠지면 test-registry 가 터집니다");
}

절("[H] 돌연변이 자체검증 — 진짜로 잡는가");

{
  /* 되돌리는 줄을 지운 사본에서 [A] 가 빨개져야 합니다 */
  const 사본 = SRC.replace(/if \(bar && bar\.scrollLeft !== keep\) bar\.scrollLeft = keep;/,
    "/* 지움 */");
  ok("돌연변이 사본이 원본과 다르다", 사본 !== SRC);

  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      '<div class="main-grid"><div id="page-exchange">' +
      '<div class="chart-panel"><div class="tlc-toolbar"><button>A</button></div></div>' +
      '<div id="interval-row"><button>1분</button></div>' +
      "</div></div></body></html>",
    { runScripts: "outside-only" }
  );
  const win = dom.window;
  const bar = win.document.querySelector(".tlc-toolbar");
  let v = 0;
  Object.defineProperty(bar, "scrollLeft", {
    configurable: true,
    get: function () { return v; },
    set: function (x) { v = Math.max(0, Math.min(Number(x) || 0, 최대)); }
  });
  Object.defineProperty(bar, "scrollWidth", { configurable: true, get: function () { return 내용폭; } });
  Object.defineProperty(bar, "clientWidth", { configurable: true, get: function () { return 칸폭; } });
  const P = win.Node.prototype;
  ["appendChild", "insertBefore", "removeChild"].forEach(function (name) {
    const orig = P[name];
    P[name] = function (node) {
      const 옮김 = !!(node && node.nodeType === 1 && (node === bar || (node.contains && node.contains(bar))));
      const r = orig.apply(this, arguments);
      if (옮김) v = 0;
      return r;
    };
  });
  win.setTimeout = function () { return 0; };
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};
  win.requestAnimationFrame = undefined;
  win.eval(사본);
  win.App.ChartTopRow.init();
  bar.scrollLeft = 최대;
  win.document.querySelector(".chart-panel").setAttribute("data-tlc-full", "1");
  win.App.ChartTopRow.init();
  ok("★되돌리는 줄을 지우면 0 이 된다★ (봉인이 진짜로 본다)", bar.scrollLeft === 0,
    "지금 " + bar.scrollLeft);
}

/* ========================================================================= */
console.log("\n" + (fail === 0 ? MARK_OK : MARK_NG) +
  " chart-toprow-scroll-keep — 통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록:");
  실패목록.forEach(function (m) { console.log("  - " + m); });
}
process.exitCode = fail ? 1 : 0;
process.exit(fail ? 1 : 0);
