/* tests/chart-indbar-axis-clear.test.js
 * =========================================================================
 * 지표 칩 줄(.tl-ind-bar)이 ★가격축을 안 덮는가★ — ★통화가 바뀌어도★
 * =========================================================================
 * 2026-09-07 · 수리팀
 *   대상: js/chart-indbar-room.js (App.ChartIndBarRoom) + style.css 짝 블록
 *
 * ── 무슨 고장이었나 (P2 · 잠긴 P1) ─────────────────────────────────────
 *   style.css 가 칩 줄의 오른쪽 끝을 ★정적 px 두 개★ 로 막고 있었습니다.
 *       .chart-panel .chart-wrap .tl-ind-bar{right:138px;}
 *       @media (max-width:900px){ … right:82px; }
 *   그런데 이 두 숫자는 2026-08-27 에 ★달러 가격축만 재고★ 정한 값입니다
 *   (그 자리 주석의 실측표 74.5 / 130.5 가 둘 다 USDT).
 *   원화 축은 더 넓어서 여섯 폭 ★전부★ 모자랐습니다.
 *
 *   2026-09-07 실측 (지표 6개 켠 상태 · 침범 = 상자 오른끝 − 그림 오른끝)
 *       360 KRW +13.5 · 375 KRW +14.5 · 390 KRW +13.5
 *       768 KRW ★+87.5★ · 1440 KRW +32.0 · 1920 KRW +31.8
 *     768·KRW 는 ★칩 글자 자체★ 가 넘었습니다 —
 *     EMA(9) 오른끝 613.5, 그림 오른끝 583.5 → ★+30.0px★ 이 가격축 위.
 *
 *   ⚠ 오늘 아침 .tl-ohlc 에서 고친 것과 ★글자 그대로 같은 병★ 입니다(8efb985).
 *     그때는 ₩120,900,000 이 ,900,000 으로 읽혔습니다.
 *
 * ── ⭐ 여기서 ★안 보는 것★ (두 벌 금지) ───────────────────────────────
 *   · "차트 위 절대배치 상자에 오른끝이 ★있기는 한가★"
 *     -> tests/chart-overlay-right-edge.test.js 한 곳입니다. 여기서 또 안 봅니다.
 *        그 봉인은 right/max-width 가 ★있기만 하면★ 초록입니다. 즉
 *        ★right:98px 로 되돌려도 그 봉인은 안 잡습니다.★
 *   · 십자선 O·H·L·C 줄(.tl-ohlc) 의 같은 병
 *     -> tests/chart-ohlc-axis-clear.test.js 한 곳입니다.
 *   · 접기(fold) 동작 · 칩 개수 · 글씨 크기
 *     -> tests/chart-ind-bar-fold.test.js 및 각 전용 봉인 한 곳씩입니다.
 *
 * ── ⭐ 그래서 여기서는 ★그 봉인들이 못 보는 세 가지★ 만 봅니다 ────────
 *
 *   [A] ★정적 px 로 막으면 안 된다★
 *       가격축 폭은 ★통화 2 × 글씨 구간 3 = 여섯 가지★ 로 변합니다
 *       (2026-09-07 실측 — 폰 75/95 · 중간 131/131 · 768 이상 131/170).
 *       그러니 어떤 고정값도, 네 값을 적어도 언젠가 어긋납니다.
 *       여기서는 가짜 차트에 좌표를 물려 ★실제로 재서 넣는지★ 검산하고,
 *       가격축을 넓히면 ★상자도 따라 좁아지는지★ 를 봅니다.
 *
 *   [B] ★왼끝도 숫자로 박으면 안 된다★
 *       css/chart-toolbar.css 7) 에 "세로 막대를 .chart-wrap 안에 넣게 되면
 *       .tl-ind-bar{left:40px} 를 켜라" 는 ★예비 규칙★ 이 적혀 있습니다.
 *       왼끝을 8 로 박아 두면 그날 이 모듈도 같이 틀립니다.
 *
 *   [C] ★값을 … 로 자르면 안 된다★
 *       지표 이름이 잘리면 어느 지표인지 못 읽습니다(.tl-ohlc 때와 같은 판단).
 *       .tl-ind-bar 는 이미 flex-wrap:wrap 이라 좁아지면 아래로 접힙니다.
 *       "좁히는 대신 줄이 늘어나는 것을 받아들인다" 가 PM 결정이고,
 *       그 결정을 여기서 못 박습니다.
 *
 * ── 브라우저를 안 씁니다 ───────────────────────────────────────────────
 *   jsdom 에는 배치가 없어 getBoundingClientRect 가 전부 0 입니다. 그래서
 *   ★가짜 차트의 칸마다 좌표를 직접 물려★ apply() 의 셈을 검산합니다.
 *   실제 화면 침범값은 사람이 여섯 폭 × 두 통화로 따로 잽니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-indbar-axis-clear.test.js
 *   그리고 tests/_order.txt 의 이 줄을 지웁니다.
 *   ⚠ rm 이 아니라 ★git rm★ 입니다 — git 에 남으면 tests-dir-hygiene 이 터집니다.
 *   사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-indbar-room.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
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
 * 가짜 차트 — ★좌표를 직접 물립니다★
 * -------------------------------------------------------------------------
 * 진짜 차트의 칸 한 줄(tr)은 세 칸입니다: 왼축 · 그림 · 오른축(가격축).
 * 모듈은 "자식이 셋인 tr 의 가운데" 를 그림 영역으로 봅니다. 똑같이 만듭니다.
 * ========================================================================= */

/** 2026-09-07 실측 가격축 폭 (768 기준). 통화별로 다릅니다. */
const 축폭 = { USDT: 131.5, KRW: 169.5 };
const WRAP_L = 61;    /* .chart-wrap 왼끝 (768 실측) */
const WRAP_R = 753;   /* .chart-wrap 오른끝 (768 실측) */

function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"tlc-body\">" +
      "<div class=\"chart-wrap\"></div>" +
      "</div></div></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  const doc = win.document;
  win.innerWidth = 옵션.width || 768;
  win.innerHeight = 옵션.height || 900;

  const 지연 = [];
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};
  /* ★일부러 없앱니다★ — ResizeObserver 도 rAF 도 없는 브라우저에서
     apply() 가 그대로 도는지 같이 보는 것입니다. */
  win.requestAnimationFrame = undefined;
  win.ResizeObserver = undefined;
  win.fetch = undefined;

  let 통화 = 옵션.통화 || "USDT";
  let 칩왼끝 = typeof 옵션.칩왼끝 === "number" ? 옵션.칩왼끝 : WRAP_L + 8;

  const wrap = doc.querySelector(".chart-wrap");

  /* --- 칩 줄 ------------------------------------------------------------ */
  const bar = doc.createElement("div");
  bar.className = "tl-ind-bar";
  wrap.appendChild(bar);

  /* --- 차트 속 표 (왼축 · 그림 · 가격축) --------------------------------- */
  const table = doc.createElement("table");
  const tr = doc.createElement("tr");
  const 왼축 = doc.createElement("td");
  const 그림 = doc.createElement("td");
  const 가격축 = doc.createElement("td");
  tr.appendChild(왼축); tr.appendChild(그림); tr.appendChild(가격축);
  table.appendChild(tr);
  if (!옵션.표없음) wrap.appendChild(table);

  /* 그림 영역의 오른끝 = .chart-wrap 오른끝 − 가격축 폭 (통화를 따라 움직입니다) */
  function 그림오른끝() { return WRAP_R - 축폭[통화]; }

  wrap.getBoundingClientRect = function () {
    return { left: WRAP_L, right: WRAP_R, top: 0, bottom: 400, width: WRAP_R - WRAP_L, height: 400 };
  };
  bar.getBoundingClientRect = function () {
    /* 왼끝은 CSS 의 left 가 정합니다. 오른끝은 이 검사에서 안 씁니다. */
    return { left: 칩왼끝, right: 칩왼끝 + 100, top: 6, bottom: 38, width: 100, height: 32 };
  };
  왼축.getBoundingClientRect = function () {
    return { left: WRAP_L, right: WRAP_L, top: 0, bottom: 360, width: 0, height: 360 };
  };
  그림.getBoundingClientRect = function () {
    const r = 그림오른끝();
    return { left: WRAP_L, right: r, top: 0, bottom: 360, width: r - WRAP_L, height: 360 };
  };
  가격축.getBoundingClientRect = function () {
    const l = 그림오른끝();
    return { left: l, right: WRAP_R, top: 0, bottom: 360, width: WRAP_R - l, height: 360 };
  };

  /* --- App.Bus (통화 전환 신호) ----------------------------------------- */
  const 듣는이 = {};
  win.App = {
    Bus: {
      on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
      emit: function (n, p) { (듣는이[n] || []).forEach(function (f) { f(p); }); }
    }
  };

  win.eval(옵션.소스 || SRC);

  /* ⚠ JSDOM 은 readyState 가 "loading" 이라 모듈이 init() 을 DOMContentLoaded 로
     미룹니다(실제로 확인했습니다). 그러면 통화 전환 듣는이가 아직 안 붙습니다.
     진짜 브라우저에서는 저절로 붙는 자리라, 여기서는 손으로 한 번 부릅니다. */
  const M = win.App.ChartIndBarRoom;
  if (M && typeof M.init === "function") M.init();

  return {
    win: win, doc: doc, wrap: wrap, bar: bar, 그림: 그림, 지연: 지연,
    mod: function () { return win.App.ChartIndBarRoom; },
    그림오른끝: 그림오른끝,
    통화바꾸기: function (c) { 통화 = c; },
    칩왼끝옮기기: function (x) { 칩왼끝 = x; },
    /** 지금 인라인 max-width 를 숫자로 (없으면 null) */
    maxW: function () {
      const v = bar.style.maxWidth;
      if (!v) return null;
      const m = /^(-?[\d.]+)px$/.exec(v);
      return m ? parseFloat(m[1]) : v;
    },
    지연실행: function () { 지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } }); }
  };
}

/* =====================================================================
 * [1] 파일이 있고 등록돼 있는가
 * ===================================================================== */
절("[1] 파일 · 등록");
{
  ok("js/chart-indbar-room.js 가 있다", fs.existsSync(path.join(REPO, MOD)));
  ok("index.html 이 이 파일을 부른다",
    HTML.indexOf("js/chart-indbar-room.js") !== -1,
    "index.html 에 <script> 줄이 없습니다");
  ok("tests/_order.txt 에 이 봉인이 등록돼 있다",
    ORDER.indexOf("tests/" + SELF) !== -1,
    "등록 안 하면 npm test 에서 안 돌고, tests-dir-hygiene 이 정체불명 파일로 잡습니다");
  const 머리 = SRC.slice(0, 4000) + fs.readFileSync(__filename, "utf8").slice(0, 4000);
  ok("되돌리는 방법이 ★git rm★ 으로 적혀 있다",
    /git rm -f tests\/chart-indbar-axis-clear\.test\.js/.test(fs.readFileSync(__filename, "utf8")),
    "rm 으로 적으면 되돌리는 순간 npm test 가 깨집니다");
  ok("모듈 맨 위에 되돌리는 방법이 적혀 있다",
    머리.indexOf("되돌리는 방법") !== -1);
}

/* =====================================================================
 * [2] ★정적 px 로 막지 않았는가★  (이 병의 원인 그 자체)
 * ===================================================================== */
절("[2] 정적 px 이 남아 있지 않은가");
{
  /* style.css 의 옛 두 줄이 사라졌는지 — 남아 있으면 max-width 와 ★둘 다★
     걸려 상자가 이중으로 좁아집니다(PM 지시). */
  ok("style.css 에 .tl-ind-bar 의 정적 right 규칙이 없다",
    !/\.tl-ind-bar\s*\{[^}]*(^|[^-])right\s*:\s*\d/m.test(CSS),
    "옛 right:138px / right:82px 이 남아 있습니다 — 걷어내세요");
  ok("옛 값 right:138px 이 규칙으로 안 남아 있다",
    CSS.indexOf(".tl-ind-bar{right:138px;}") === -1);
  ok("옛 값 right:82px 이 규칙으로 안 남아 있다",
    CSS.indexOf(".tl-ind-bar{right:82px;}") === -1);

  /* 예비값은 남아 있어야 합니다 — js 가 못 잴 때 쓰는 길입니다 */
  ok("style.css 에 ★예비★ max-width 가 남아 있다",
    /\.tl-ind-bar\s*\{[^}]*max-width\s*:/.test(CSS),
    "js 가 못 잴 때 오른쪽 끝이 통째로 없어집니다");

  /* 모듈이 축 폭을 숫자로 박아 두지 않았는지 (주석의 실측표는 빼고 봅니다) */
  const 뼈대 = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("모듈 코드(주석 뺀 뼈대)에 가격축 폭 숫자가 안 박혀 있다",
    !/\b(75|82|93|95|131|138|169|170)\b/.test(뼈대),
    "축 폭을 코드에 적으면 통화만 바꿔도 어긋납니다");
  ok("모듈이 그림 칸을 ★재서★ 씁니다 (getBoundingClientRect + 자식 셋인 tr)",
    /children\.length\s*===\s*3/.test(뼈대) && /getBoundingClientRect/.test(뼈대),
    "재는 코드가 없습니다");
}

/* =====================================================================
 * [3] ★실제로 재서 넣는가★ — 가짜 차트로 검산
 * ===================================================================== */
절("[3] 그림 영역을 재서 max-width 를 넣는가");
{
  const t = 띄우기({ 통화: "USDT" });
  const 잰값 = t.mod().apply();
  ok("apply() 가 성공한다 (rAF·ResizeObserver 없는 브라우저에서도)", 잰값 === true);

  const GAP = t.mod().GAP;
  const 기대 = Math.round(t.그림오른끝() - (WRAP_L + 8) - GAP);
  ok("USDT — max-width 가 「그림 오른끝 − 칩 왼끝 − 여백」 과 같다 (" + 기대 + "px)",
    t.maxW() === 기대,
    "잰 값: " + t.maxW() + " / 기대: " + 기대);

  ok("★상자 오른끝이 그림 영역 안★ 이다 (침범 " +
      ((WRAP_L + 8 + t.maxW()) - t.그림오른끝()).toFixed(1) + "px ≤ 0)",
    (WRAP_L + 8 + t.maxW()) <= t.그림오른끝(),
    "가격축 위로 올라탑니다");
}

/* =====================================================================
 * [4] ★통화가 바뀌면 따라가는가★ — 정적 px 이면 여기서 터집니다
 * ===================================================================== */
절("[4] 통화 전환 — 가격축이 넓어지면 상자도 좁아지는가");
{
  const t = 띄우기({ 통화: "USDT" });
  t.mod().apply();
  /* init() 이 걸어 둔 「조금 뒤 한 번 더」 를 ★먼저 비웁니다★.
     안 비우면 그 늦은 재측정이 통화 전환을 대신 따라가 버려서,
     "통화 전환 길이 끊겼다" 를 이 검사가 못 보게 됩니다([8] 다 참고). */
  t.지연실행();
  const 달러 = t.maxW();

  t.통화바꾸기("KRW");
  t.win.App.Bus.emit("currency:change", { currency: "KRW" });
  t.지연실행();                      /* setTimeout 재측정까지 돌립니다 */
  const 원화 = t.maxW();

  const 축차 = 축폭.KRW - 축폭.USDT;   /* 38 */
  ok("원화로 바꾸면 상자가 ★가격축이 넓어진 만큼★ 좁아진다 (" +
      달러 + " -> " + 원화 + ", 차이 " + (달러 - 원화) + " ≈ 축 차이 " + 축차 + ")",
    Math.abs((달러 - 원화) - 축차) <= 1,
    "통화를 바꿔도 안 따라갑니다 — 정적 px 이거나 다시 재는 길이 없습니다");

  ok("원화에서도 상자 오른끝이 그림 영역 안이다",
    (WRAP_L + 8 + 원화) <= t.그림오른끝(),
    "원화에서 가격축을 덮습니다 — ★이번 사고가 바로 이것★ 입니다");

  /* 다시 달러로 — 되돌아와야 합니다 */
  t.통화바꾸기("USDT");
  t.win.App.Bus.emit("currency:change", { currency: "USDT" });
  t.지연실행();
  ok("달러로 되돌리면 상자도 원래 폭으로 돌아온다", t.maxW() === 달러,
    "한 방향으로만 좁아지고 안 돌아옵니다");
}

/* =====================================================================
 * [5] ★왼끝을 숫자로 박지 않았는가★
 *     css/chart-toolbar.css 7) 의 예비 규칙(left:40px)이 켜지는 날을 대비합니다
 * ===================================================================== */
절("[5] 왼끝도 재는가 (left 가 8 이 아닐 수 있습니다)");
{
  const t = 띄우기({ 통화: "KRW", 칩왼끝: WRAP_L + 8 });
  t.mod().apply();
  const 왼끝8 = t.maxW();

  t.칩왼끝옮기기(WRAP_L + 40);       /* .tlc-rail 이 안으로 들어온 날 */
  t.win.App.Bus.emit("currency:change", { currency: "KRW" });
  t.지연실행();
  const 왼끝40 = t.maxW();

  ok("칩 줄이 오른쪽으로 32px 밀리면 max-width 도 32px 줄어든다 (" +
      왼끝8 + " -> " + 왼끝40 + ")",
    왼끝8 - 왼끝40 === 32,
    "왼끝을 8 로 박아 두면 그날 상자가 32px 더 삐져나갑니다");

  ok("밀린 뒤에도 상자 오른끝이 그림 영역 안이다",
    (WRAP_L + 40 + 왼끝40) <= t.그림오른끝());
}

/* =====================================================================
 * [6] ★자르지 않는가★ — 지표 이름이 … 로 잘리면 안 됩니다
 * ===================================================================== */
절("[6] 값을 자르지 않는가 (PM 결정: 좁히고 줄이 늘어나는 것을 받아들인다)");
{
  const t = 띄우기({});
  t.mod().apply();
  const st = t.bar.style;
  ok("모듈이 overflow 를 안 건드린다", !st.overflow && !st.overflowX,
    "overflow:hidden 이면 지표 이름이 잘려 어느 지표인지 못 읽습니다");
  ok("모듈이 text-overflow 를 안 건드린다", !st.textOverflow,
    "… 로 자르면 안 됩니다");
  ok("모듈이 white-space 를 안 건드린다", !st.whiteSpace,
    "nowrap 을 걸면 flex-wrap:wrap 이 무력해져 한 줄로 삐져나갑니다");
  ok("모듈이 font-size 를 안 건드린다", !st.fontSize,
    "글씨를 줄여서 맞추면 안 됩니다 (대표 지시: 글씨를 키웠던 자리입니다)");
  ok("모듈이 손대는 인라인 속성은 max-width 하나뿐이다",
    Array.prototype.slice.call(st).every(function (p) { return p === "max-width"; }),
    "지금 걸린 속성: " + Array.prototype.slice.call(st).join(", "));

  const 뼈대 = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("모듈 뼈대에 ellipsis · nowrap · display:none 이 없다",
    !/ellipsis|nowrap|display\s*[:=]\s*["']?none/.test(뼈대),
    "칩을 감추거나 자르는 코드가 들어왔습니다");
}

/* =====================================================================
 * [7] 못 잴 때 ★조용히 망가지지 않는가★
 * ===================================================================== */
절("[7] 못 잴 때 — 예비값을 남기고 물러나는가");
{
  const t = 띄우기({ 표없음: true });     /* 차트가 아직 안 그려진 상태 */
  ok("그림 칸을 못 찾으면 apply() 가 false 를 준다", t.mod().apply() === false);
  ok("그때 인라인 max-width 를 ★안 건드린다★ (style.css 예비값이 남습니다)",
    t.maxW() === null,
    "엉뚱한 값을 넣으면 예비값보다 나쁩니다");

  const u = 띄우기({});
  u.mod().apply();
  ok("disable() 을 부르면 인라인 max-width 가 지워진다 (되돌리는 길)",
    (function () { u.mod().disable(); return u.maxW() === null; })(),
    "실행 중에 끄는 길이 없습니다");
}

/* =====================================================================
 * [8] ★돌연변이★ — 옛 방식으로 되돌리면 진짜로 잡히는가
 *     (봉인이 "그냥 초록" 인지 아닌지를 스스로 증명합니다)
 * ===================================================================== */
절("[8] 돌연변이 — 옛 버그를 되돌리면 잡히는가");
{
  /** 소스를 바꿔 끼운 뒤 [4]번 검사를 다시 돌려 ★빨강이 나오는지★ 봅니다 */
  function 통화따라감(소스) {
    const t = 띄우기({ 통화: "USDT", 소스: 소스 });
    if (t.mod().apply() !== true) return "apply 실패";
    t.지연실행();          /* init() 의 늦은 재측정을 먼저 비웁니다 (위 [4] 주석 참고) */
    const 달러 = t.maxW();
    t.통화바꾸기("KRW");
    t.win.App.Bus.emit("currency:change", { currency: "KRW" });
    t.지연실행();
    const 원화 = t.maxW();
    return Math.abs((달러 - 원화) - (축폭.KRW - 축폭.USDT)) <= 1;
  }

  ok("지금 소스는 통화를 따라간다 (기준선)", 통화따라감(SRC) === true);

  /* (가) 옛 버그 그대로 — 정적 px 로 되돌립니다 */
  const 돌연1 = SRC.replace(
    "var w = g.right - br.left - GAP;",
    "var w = 671 - br.left;"
  );
  ok("소스가 실제로 바뀌었다 (가)", 돌연1 !== SRC, "치환이 안 됐습니다");
  ok("★정적 px 로 되돌리면 잡는다★ (right:138px 시절)", 통화따라감(돌연1) !== true,
    "정적 px 을 못 잡습니다 — 이 봉인은 아무것도 안 지킵니다");

  /* (나) .chart-wrap 을 자로 쓰는 착각 — 가격축까지 포함해서 재는 경우.
     .tl-leg-acts(js/chart-indicators.js:1080)가 지금 이 착각을 하고 있습니다. */
  const 돌연2 = SRC.replace(
    "var c = drawAreaCell();",
    "var c = wrap;"
  );
  ok("소스가 실제로 바뀌었다 (나)", 돌연2 !== SRC, "치환이 안 됐습니다");
  ok("★.chart-wrap 을 자로 쓰면 잡는다★ (가격축까지 재는 착각)",
    통화따라감(돌연2) !== true,
    ".chart-wrap 은 그림 + 가격축이라 통화를 바꿔도 폭이 그대로입니다");

  /* (다) 다시 재는 길을 끊는 경우 — 첫 측정만 하고 통화 전환을 무시 */
  const 돌연3 = SRC.replace(/App\.Bus\.on\("currency:change"[\s\S]*?\}\);\n/, "");
  ok("소스가 실제로 바뀌었다 (다)", 돌연3 !== SRC, "치환이 안 됐습니다");
  ok("★통화 전환에 다시 재는 길을 끊으면 잡는다★", 통화따라감(돌연3) !== true,
    "ResizeObserver 가 없는 브라우저에서 통화를 바꾸면 그대로 덮습니다");

  /* 진짜 파일이 그대로인지 — 사본에서만 놀았다는 증거 */
  ok("검사가 끝난 뒤에도 진짜 모듈이 한 글자도 안 바뀌었다",
    fs.readFileSync(path.join(REPO, MOD), "utf8") === SRC,
    "★사본이 아니라 진짜 파일을 건드렸습니다★");
}

/* ===================================================================== */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach(function (s) { console.log("  - " + s); });
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
