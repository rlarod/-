/* tests/chart-popup-floor-census.test.js
 * =========================================================================
 * ★화면에 뭔가 띄우는 것★ 을 파일에 안 매이게 전부 세고,
 *   그중 몇이 폰 하단 매수·매도 바(.tl-order-bar)를 보고 있는지 못 박는다
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 만드나 — ★내 봉인이 못 보던 자리★ ─────────────────────────────
 * 어제 만든 tests/chart-place-bottom-guard-seal.test.js 는 ★putFixed 를 부르는
 * 함수★ 만 봅니다. 그런데 표정 고르는 창과 글자 입력칸은 position:absolute 라
 * putFixed 를 안 씁니다 — 그래서 봉인에 ★안 걸렸고★, 수리팀이 전수 census 로
 * 찾았을 때는 여섯 폭 전부 44px 넘쳐 360 에서 단추 여섯 개가 통째로 안 보였습니다.
 *
 * ★한 파일 안에서만 세면 다음 파일에서 또 납니다.★
 * 그래서 이 파일은 ★js/ 전체★ 를 훑어 「띄우는 것」 을 스스로 찾아냅니다.
 * 새 모듈이 창을 하나 만들면 이 파일이 손대지 않아도 그 자리에서 빨개집니다.
 *
 * ── 어떻게 세나 (이름을 손으로 안 적습니다) ───────────────────────────
 * 두 가지를 ★둘 다★ 하는 모듈이 「띄우는 것」 입니다.
 *   ㉠ CSS 를 주입하는데 position:fixed|absolute 와 z-index 가 같이 있다
 *   ㉡ JS 에서 style.top / bottom / left / right 를 실제로 정한다
 * 주석은 지우고 봅니다 — 주석에 "position:fixed" 라고 적어 둔 파일이 여럿이라
 * 안 지우면 오탐이 납니다(tests/_locked-hashes.js 를 md5 로 보는 것과 같은 이유).
 *
 * 그다음 ★화면(viewport) 기준★ 인 것만 골라냅니다(innerHeight · clientHeight 를 읽는 것).
 * 이것들만 하단 바에 물릴 수 있습니다. 칸 좌표·문서 좌표로 띄우는 것은 다릅니다.
 *
 * ── ⚠️ 이 파일이 못 박는 사실 (2026-09-03 census) ─────────────────────
 *   보호됨  js/chart-drawings.js · js/chart-candle-type.js ·
 *           js/chart-indicator-menu.js  (js/chart-replay.js 는 바를 덮는 쪽)
 *   ★안 보고 있음★  js/chart-goto-date.js · js/chart-indicator-settings.js ·
 *                    js/chart-timezone.js · js/interval-more.js
 *
 * 뒤 넷은 화면 아래끝(vh − 8)까지만 막습니다. 그런데 ≤700px 에서 화면 아래
 * 72px 는 매수·매도 바가 덮고 있고(style.css), 그 바의 z-index 는 990 이라
 * 이 창들(60 · 70 · 960)보다 ★위★ 입니다. 창의 아래쪽이 바 밑에 깔립니다.
 * ★기록팀은 사이트 코드를 못 고칩니다 — 이 사실을 숫자와 함께 적어 두고
 *   PM 에게 올립니다. 누가 고치면 4절이 빨개지고 그때 보호군으로 옮깁니다.★
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const JSDIR = path.join(REPO, "js");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m" + "✓" + ESC + "[0m";
const NGM = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + OKM + " " + 제목); }
  else { fail++; console.log("  " + NGM + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

console.log("\n화면에 띄우는 것 census — 폰 하단 매수·매도 바를 보고 있는가");

/* 주석을 뺀 「진짜 코드」. 주석에 적힌 낱말로 오탐이 나지 않게 합니다 */
function 코드만(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/* =====================================================================
 * [1] census — js/ 전체에서 「띄우는 것」 을 스스로 찾는다
 * ===================================================================== */
절("[1] census — js/ 전체를 훑어 「띄우는 것」 을 찾는다");

const 모든파일 = fs.readdirSync(JSDIR).filter((f) => /\.js$/.test(f)).sort();
ok("js/ 를 실제로 읽었다 (" + 모든파일.length + "개)", 모든파일.length > 50,
  "파일이 너무 적습니다 — 경로가 틀렸을 수 있습니다");

const 띄우는것 = [];
모든파일.forEach((f) => {
  const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, f), "utf8"));
  const 겹쳐뜸 = /position:\s*(fixed|absolute)/.test(코드) && /z-index/.test(코드);
  const 자리정함 = /\.style\.(top|bottom|left|right)\s*=/.test(코드);
  if (!겹쳐뜸 || !자리정함) return;
  띄우는것.push({
    파일: f,
    화면기준: /innerHeight|clientHeight/.test(코드),
    바를봄: /tl-order-bar/.test(코드)
  });
});

띄우는것.forEach((m) => {
  console.log("      · " + m.파일 + "  화면기준=" + (m.화면기준 ? "O" : "-") +
    "  주문막대=" + (m.바를봄 ? "O" : "★안 봄★"));
});

/* 2026-09-03 현재 알려진 것. ★새 모듈이 창을 만들면 여기서 빨개집니다★ —
   그때 할 일은 이름만 더하는 게 아니라, 그 창이 화면 기준인지 보고
   화면 기준이면 하단 바를 보는지 확인하는 것입니다(2·4절이 자동으로 검사합니다). */
const 알려진띄우는것 = [
  "chart-candle-type.js", "chart-drawings.js", "chart-goto-date.js",
  "chart-indicator-kit.js", "chart-indicator-menu.js", "chart-indicator-settings.js",
  "chart-oscillators.js", "chart-replay.js", "chart-timezone.js",
  "interval-more.js", "stream-loading-hint.js"
];
ok("★띄우는 모듈이 알려진 " + 알려진띄우는것.length + "개 그대로다★",
  띄우는것.map((m) => m.파일).join(",") === 알려진띄우는것.join(","),
  "지금: " + 띄우는것.map((m) => m.파일).join(",") +
  "\n         알려진: " + 알려진띄우는것.join(",") +
  "\n         → 새 창이 생겼습니다. 화면 기준이면 ★하단 매수·매도 바★ 를 보게 해야 합니다");

const 화면기준 = 띄우는것.filter((m) => m.화면기준);
const 칸좌표 = 띄우는것.filter((m) => !m.화면기준);
ok("화면(viewport) 기준으로 띄우는 것 " + 화면기준.length + "개 · 그 밖 " + 칸좌표.length + "개",
  화면기준.length + 칸좌표.length === 띄우는것.length);

/* 칸·문서 좌표로 띄우는 것은 하단 바와 사정이 다릅니다.
   ★그래도 여기 적어 둡니다★ — 표정 창이 바로 이 갈래에서 났습니다.
     chart-indicator-kit / chart-oscillators  칸 위끝에 붙는 이름표 (아래로 안 자람)
     chart-replay                             차트 칸 안 조작막대·안내줄 (2절에서 따로 봅니다)
     stream-loading-hint                      문서 좌표. 페이지와 같이 스크롤됨 */
ok("칸·문서 좌표로 띄우는 것이 알려진 4개 그대로다 (" + 칸좌표.map((m) => m.파일).join(" · ") + ")",
  칸좌표.map((m) => m.파일).sort().join(",") ===
    "chart-indicator-kit.js,chart-oscillators.js,chart-replay.js,stream-loading-hint.js",
  "새로 생겼으면 ★차트 칸 아래끝·화면 아래끝을 둘 다 보는지★ 사람이 확인해야 합니다 " +
  "(tests/chart-pane-popup-bottom-fit.test.js 가 그 갈래의 본보기입니다)");

/* =====================================================================
 * [2] 보호군 — 하단 바를 보는 모듈은 계속 봐야 한다 (회귀 봉인)
 * ===================================================================== */
절("[2] 보호군 — 하단 매수·매도 바를 보는 모듈");

const 보호군 = 화면기준.filter((m) => m.바를봄).map((m) => m.파일);
const 알려진보호군 = ["chart-candle-type.js", "chart-drawings.js", "chart-indicator-menu.js"];
ok("화면 기준이면서 바를 보는 것이 " + 알려진보호군.length + "개 그대로다 (" + 보호군.join(" · ") + ")",
  보호군.slice().sort().join(",") === 알려진보호군.join(","),
  "지금: " + 보호군.join(",") + " / 알려진: " + 알려진보호군.join(","));

/* js/chart-replay.js 는 화면 기준 자리잡기가 아니라 ★바를 덮는★ 쪽입니다
   (리플레이 중 주문 막기). 갈래가 달라 보호군에 안 넣고 여기서 따로 봅니다. */
{
  const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, "chart-replay.js"), "utf8"));
  ok("(따로) js/chart-replay.js 는 바를 ★덮어★ 리플레이 중 주문을 막는다",
    /tl-order-bar/.test(코드) && /tl-rp-mlock/.test(코드),
    "덮개가 없어지면 리플레이 중에 폰에서 진짜 주문이 들어갑니다");
}

/* ── 글자가 아니라 ★동작★ 으로 봅니다 ────────────────────────────────
 * 각 모듈에서 바닥선을 정하는 함수를 ★원본에서 글자 그대로 떼어★ 가짜 화면
 * 위에서 돌립니다. 이 파일이 계산을 베껴 쓰지 않습니다 — 베껴 쓰면 원본이
 * 바뀌어도 옛 계산만 지키게 됩니다. */
function 함수떼기(name, src) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let k = src.indexOf("{", i);
  if (k < 0) return null;
  let depth = 0;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

/** 그 모듈의 바닥 함수를 가짜 화면에서 돌립니다.
 *  화면: { h, 바 } — 바가 null 이면 그 폭에는 바가 없는 것(데스크톱)입니다. */
function 바닥재기(파일, 바닥함수, 여백이름, 화면, 소스변형) {
  const SRC = fs.readFileSync(path.join(JSDIR, 파일), "utf8");
  const 여백m = new RegExp("var\\s+" + 여백이름 + "\\s*=\\s*(\\d+)\\s*;").exec(SRC);
  if (!여백m) return { 오류: 여백이름 + " 을 못 찾았습니다" };
  const 여백 = Number(여백m[1]);
  const 도우미 = ["vpH", "fullscreenOn"].filter((n) => 함수떼기(n, SRC));
  const 바 = 화면.바
    ? { getBoundingClientRect: () => ({ top: 화면.h - 화면.바, height: 화면.바 }), __display: "block" }
    : null;
  const sb = {
    window: { innerHeight: 화면.h, getComputedStyle: (el) => ({ display: el.__display }) },
    document: {
      documentElement: { clientHeight: 화면.h },
      fullscreenElement: 화면.전체화면 ? {} : null,
      webkitFullscreenElement: null,
      querySelector: (s) => (s === ".tl-order-bar" ? 바 : null)
    },
    console: { warn() {}, log() {} }
  };
  vm.createContext(sb);
  let 본문 = 함수떼기(바닥함수, SRC);
  if (!본문) return { 오류: 바닥함수 + " 를 못 찾았습니다" };
  if (소스변형) 본문 = 소스변형(본문);
  const code = "var " + 여백이름 + "=" + 여백 + ";\n" +
    도우미.map((n) => 함수떼기(n, SRC)).join("\n") + "\n" + 본문 + "\n";
  vm.runInContext(code, sb, { filename: "떼어낸-" + 파일 });
  return { 값: sb[바닥함수](), 여백: 여백 };
}

/* 폰 하단 바 크기는 ★style.css 에서 읽습니다★ — 숫자를 여기 적지 않습니다 */
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const 바CSS = CSS.slice(CSS.indexOf(".tl-order-bar{"), CSS.indexOf(".tl-order-bar{") + 400);
const 단추CSS = CSS.slice(CSS.indexOf(".tl-order-bar-btn{"), CSS.indexOf(".tl-order-bar-btn{") + 400);
const 단추키 = parseFloat((단추CSS.match(/height:(\d+(?:\.\d+)?)px/) || [])[1]);
const 바여백 = parseFloat((바CSS.match(/padding:(\d+(?:\.\d+)?)px/) || [])[1]);
const 바높이 = 단추키 + 바여백 * 2;
ok("style.css 에서 바 높이를 읽었다 (단추 " + 단추키 + " + 위아래 여백 " + 바여백 + "x2 = " + 바높이 + "px)",
  isFinite(바높이) && 바높이 > 40, "단추키=" + 단추키 + " 여백=" + 바여백);
/* 2026-09-03 수리팀 브라우저 실측 — 800px 화면에서 바 top 727 · height 73.
   위 계산과 어긋나면 CSS 가 바뀐 것이므로 여기서 먼저 알게 됩니다. */
ok("★계산한 바 높이가 2026-09-03 브라우저 실측 73px 과 맞다★ (오차 2px 안)",
  Math.abs(바높이 - 73) <= 2, "계산 " + 바높이 + " vs 실측 73");

const 대상 = [
  { 파일: "chart-drawings.js", 함수: "chipFloorY", 여백: "CHIP_EDGE" },
  { 파일: "chart-candle-type.js", 함수: "floorY", 여백: "EDGE" },
  { 파일: "chart-indicator-menu.js", 함수: "floorY", 여백: "EDGE" }
];
const 폰화면 = { h: 800, 바: 바높이 };
const 데스크 = { h: 900, 바: null };

대상.forEach((t) => {
  const 폰 = 바닥재기(t.파일, t.함수, t.여백, 폰화면);
  const 데 = 바닥재기(t.파일, t.함수, t.여백, 데스크);
  const 전체 = 바닥재기(t.파일, t.함수, t.여백, { h: 800, 바: 바높이, 전체화면: true });
  if (폰.오류 || 데.오류) {
    ok(t.파일 + " — 바닥 함수를 떼어냈다", false, 폰.오류 || 데.오류);
    return;
  }
  const 기대폰 = 폰화면.h - 바높이 - 폰.여백;
  ok(t.파일 + " · " + t.함수 + "() — ★폰에서 바 위(" + 기대폰 + ")에서 멈춘다★",
    폰.값 === 기대폰, "지금 " + 폰.값 + " (기대 " + 기대폰 + ")");
  ok(t.파일 + " — 바가 없는 폭에서는 화면 아래끝까지 쓴다 (" + (데스크.h - 데.여백) + ")",
    데.값 === 데스크.h - 데.여백, "지금 " + 데.값);
  ok(t.파일 + " — 전체화면일 때는 바를 안 센다 (바가 안 그려집니다)",
    전체.값 === 폰화면.h - 폰.여백, "지금 " + 전체.값);
});

/* =====================================================================
 * [3] ★돌연변이★ — 바를 못 보게 하면 반드시 값이 달라져야 한다
 * ===================================================================== */
절("[3] 돌연변이 — 바를 못 찾게 하면 바닥이 내려간다");

/* 사본만 고칩니다. ★원본 파일은 안 건드립니다★ (다른 팀이 잡고 있습니다)
   [주의] 값을 undefined 로 만들면 계산이 NaN 이 되고 NaN 비교는 늘 거짓이라
   ★안 바뀐 것처럼★ 보입니다. 그래서 「바를 아예 못 찾은 것」 으로 만듭니다 —
   결과가 반드시 숫자로 남습니다. (2026-09-03 앞 건에서 실제로 당한 함정) */
function 바지우기(본문) {
  return 본문.replace(/document\.querySelector\(\s*"\.tl-order-bar"\s*\)/g, "null");
}
대상.forEach((t) => {
  const 성한 = 바닥재기(t.파일, t.함수, t.여백, 폰화면);
  const 변이 = 바닥재기(t.파일, t.함수, t.여백, 폰화면, 바지우기);
  ok(t.파일 + " — 바를 못 찾게 하면 바닥이 " + 성한.값 + " -> " + 변이.값 + " 로 내려간다",
    isFinite(성한.값) && isFinite(변이.값) && 변이.값 > 성한.값,
    "안 달라졌습니다 — ★이 검사가 아무것도 안 지키고 있습니다★");
  ok(t.파일 + " — 돌연변이가 숫자를 망가뜨리지 않았다 (NaN 아님)",
    isFinite(변이.값), "NaN 이면 비교가 늘 거짓이라 봉인이 죽습니다: " + 변이.값);
});

/* =====================================================================
 * [4] ★아직 안 보는 넷★ — 지금 사실을 숫자와 함께 적어 둔다
 *
 * 기록팀은 사이트 코드를 못 고칩니다. 고치는 것은 수리팀 일이고, 이 절은
 * ★고쳐졌는지 아닌지를 다음 사람이 한눈에 알게★ 하는 자리입니다.
 * 넷 중 하나라도 바를 보게 되면 이 절이 빨개지고, 그때 그 이름을 2절
 * 알려진보호군 으로 옮기면 됩니다. ★기준을 낮추는 것이 아닙니다★ —
 * 「아직 안 됐다」 를 사실로 못 박아 두는 것입니다.
 * ===================================================================== */
절("[4] 아직 하단 바를 안 보는 넷 (PM 보고용 · 고쳐지면 여기가 빨개집니다)");

const 미보호 = 화면기준.filter((m) => !m.바를봄).map((m) => m.파일);
const 알려진미보호 = [
  "chart-goto-date.js", "chart-indicator-settings.js", "chart-timezone.js", "interval-more.js"
];
ok("★아직 안 보는 것이 알려진 " + 알려진미보호.length + "개 그대로다★ (" + 미보호.join(" · ") + ")",
  미보호.slice().sort().join(",") === 알려진미보호.slice().sort().join(","),
  "지금: " + 미보호.join(",") + " / 알려진: " + 알려진미보호.join(",") +
  "\n         → 하나가 고쳐졌으면 2절 알려진보호군 으로 옮기세요. " +
  "새로 하나가 늘었으면 그건 ★새 구멍★ 입니다");

/* 얼마나 깔리나 — CSS 에서 읽은 값으로 계산합니다(숫자를 안 적습니다) */
{
  /* 이 넷은 전부 화면 아래끝에서 8px 을 남깁니다 (원본에서 읽어 확인).
     숫자를 그대로 쓴 곳도 있고 이름을 붙여 쓴 곳(vh - m)도 있어 둘 다 봅니다.
     ★여기 8 을 적어 두는 게 아니라 원본에서 읽습니다★ — 저쪽이 12 로 바뀌면
     가려지는 양도 달라지므로 이 줄이 먼저 빨개져서 사람이 다시 재게 됩니다. */
  const 여백들 = 알려진미보호.map((f) => {
    const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, f), "utf8"));
    const 숫자 = /\bvh\s*-\s*(\d+)\b/.exec(코드);
    if (숫자) return { 파일: f, 여백: Number(숫자[1]) };
    const 이름 = /\bvh\s*-\s*([A-Za-z_$][\w$]*)\b/.exec(코드);
    if (!이름) return { 파일: f, 여백: null };
    const 값 = new RegExp("var\\s+" + 이름[1] + "\\s*=\\s*(\\d+)\\s*;").exec(코드);
    return { 파일: f, 여백: 값 ? Number(값[1]) : null };
  });
  const 다8 = 여백들.every((x) => x.여백 === 8);
  ok("넷 다 화면 아래끝에서 8px 만 남긴다 (" +
    여백들.map((x) => x.파일.replace(".js", "") + ":" + x.여백).join(" · ") + ")", 다8,
    "여백이 달라졌습니다 — 아래 가려짐 계산을 다시 해야 합니다");
  const 가려짐 = 바높이 - 8;
  ok("★그래서 ≤700px 에서 창 아래 " + 가려짐 + "px 이 매수·매도 바 밑에 깔립니다★ " +
    "(바 " + 바높이 + "px − 남긴 여백 8px)", 가려짐 > 0,
    "가려짐이 0 이면 이 절을 지워도 됩니다");
}

/* z-index — 바(990)가 이 창들보다 위라야 「깔린다」 가 성립합니다.
   창이 바보다 위면 겹쳐도 눌리기는 합니다(보기 나쁠 뿐). 근거를 확인해 둡니다. */
{
  const 바Z = Number((바CSS.match(/z-index:(\d+)/) || [])[1]);
  ok("매수·매도 바의 z-index 를 style.css 에서 읽었다 (" + 바Z + ")", isFinite(바Z) && 바Z > 0);
  const 밑에깔림 = [];
  알려진미보호.forEach((f) => {
    const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, f), "utf8"));
    const zs = (코드.match(/z-index:\s*(\d+)/g) || []).map((s) => Number(s.replace(/\D/g, "")));
    const 최대 = zs.length ? Math.max.apply(null, zs) : 0;
    if (최대 < 바Z) 밑에깔림.push(f.replace(".js", "") + ":" + 최대);
  });
  ok("★넷 다 바(z " + 바Z + ")보다 아래라 실제로 밑에 깔립니다★ (" + 밑에깔림.join(" · ") + ")",
    밑에깔림.length === 알려진미보호.length,
    "지금 밑에 깔리는 것: " + 밑에깔림.join(",") +
    " → 하나가 바보다 위로 올라갔으면 「깔림」 은 풀리지만 「가림」 은 남습니다");
}

/* =====================================================================
 * [5] 앞 봉인들과 겹치지 않게 — 무엇을 누가 보는지 적어 둔다
 * ===================================================================== */
절("[5] 봉인 나눠 맡기 — 같은 것을 두 벌로 안 봅니다");
{
  const 있다 = (f) => fs.existsSync(path.join(__dirname, f));
  ok("putFixed 갈래는 tests/chart-place-bottom-guard-seal.test.js 가 본다",
    있다("chart-place-bottom-guard-seal.test.js"));
  ok("칸 좌표 갈래는 tests/chart-pane-popup-bottom-fit.test.js 가 본다",
    있다("chart-pane-popup-bottom-fit.test.js"));
  ok("겹쳐 뜨는 것끼리 싸우는지는 tests/chart-overlay-4way-census.test.js 가 본다",
    있다("chart-overlay-4way-census.test.js"));
  ok("이 파일은 ★파일에 안 매인 census 와 하단 바★ 만 본다 (계산을 다시 안 씁니다)", true);
}

/* =====================================================================
 * [6] 등록
 * ===================================================================== */
절("[6] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-popup-floor-census.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
