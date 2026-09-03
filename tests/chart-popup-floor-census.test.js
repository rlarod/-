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
 *   ㉡ ★자리를 정한다★ — 아래 세 갈래 중 하나면 됩니다
 *        ⓐ 명시   style.top / bottom / left / right 에 값을 넣는다
 *        ⓑ cssText  style.cssText 한 줄에 자리까지 같이 적는다
 *        ⓒ 덮개   inset:0  ★또는★  fixed 이면서 left/top/right/bottom 이 모두 0
 * 주석은 지우고 봅니다 — 주석에 "position:fixed" 라고 적어 둔 파일이 여럿이라
 * 안 지우면 오탐이 납니다(tests/_locked-hashes.js 를 md5 로 보는 것과 같은 이유).
 *
 * ── ⚠️ 2026-09-03 ★갈래를 ⓑⓒ 로 넓혔습니다★ (11 → 14개) ──────────────
 * 처음 만들 때는 ⓐ 하나만 봤습니다. 그래서 ★세 모듈이 레이더 밖★ 이었습니다.
 *   js/chart-style.js           화면 네 변을 0 으로 묶는 전체 덮개 (자리 잡는 코드가 아예 없음)
 *   js/symbol-stream-switch.js  cssText 한 줄로 만드는 상단 경고 토스트
 *   js/jitter-probe.js          cssText 한 줄로 만드는 오른쪽 아래 개발용 상자
 *
 * ⚠️ ★ⓒ 를 inset:0 만으로 두면 chart-style.js 는 여전히 안 잡힙니다★ —
 *   그 파일은 inset 을 안 쓰고 left/top/right/bottom 을 따로 0 으로 적습니다.
 *   실제로 확인하고 두 갈래를 ★둘 다★ 넣었습니다.
 *
 * ★기준을 무르게 한 것이 아닙니다.★ 걸리는 그물을 넓힌 것이고,
 * 새로 걸린 셋은 6·7절에서 갈래별로 ★따로 더 엄하게★ 봅니다.
 *
 * 그다음 ★화면(viewport) 기준★ 인 것만 골라냅니다(innerHeight · clientHeight 를 읽는 것).
 * 이것들만 하단 바에 물릴 수 있습니다. 칸 좌표·문서 좌표로 띄우는 것은 다릅니다.
 *
 * ── ⚠️ 이 파일이 못 박는 사실 (2026-09-03 census) ─────────────────────
 *   보호됨  js/chart-drawings.js · js/chart-candle-type.js ·
 *           js/chart-indicator-menu.js · js/interval-more.js · js/chart-timezone.js ·
 *           ★js/chart-goto-date.js★ · ★js/chart-indicator-settings.js★
 *           (js/chart-replay.js 는 바를 덮는 쪽)
 *   ★안 보고 있음★  ★없습니다 — 2026-09-03 에 0 이 됐습니다★
 *
 * ⚠ js/interval-more.js 는 2026-09-03 수리팀이 고쳐 보호군으로 옮겼습니다.
 *   그전 실측 — 360x800 에서 메뉴가 바닥을 +10px 넘어 7줄 중 1줄이 바에
 *   걸렸고, 짧은 화면(360x640)에서는 +70px · 4줄만 보였습니다.
 *   지금은 menuFloorY() 가 바를 봅니다. 2·3절이 회귀를 막습니다.
 *
 * ⚠ js/chart-timezone.js 도 같은 날 같은 팀이 고쳤습니다.
 *   그전 실측 — 창 키 608px 인데 360x640 바닥 559 · 창 8~616 로 ★+57px★.
 *   ★스크롤도 안 생겨서 밑에 깔린 부분을 손으로 못 꺼냈습니다★
 *   (CSS max-height 가 calc(100vh - 20px) 라 "다 들어갔다" 고 여겼습니다).
 *   지금은 menuFloorY() 로 바닥을 잡고 키도 그 안으로 줄입니다.
 *   ★자리 잡기와 키 줄이기를 같이 보는 것은 그쪽 전용 봉인★
 *   tests/chart-timezone-order-bar-floor.test.js 가 합니다.
 *   여기서는 바닥 함수만 봅니다(두 벌로 안 봅니다 — 5절 참조).
 *
 * ⚠ js/chart-indicator-settings.js · js/chart-goto-date.js 도 2026-09-03 에
 *   수리팀이 고쳐 보호군으로 옮겼습니다. ★둘 다 돈이 오가는 자리였습니다.★
 *     설정판 — 360x640 에서 단추줄(기본값·취소·확인) 세 개가 통째로 바 밑에 깔려
 *              elementFromPoint("확인" 한가운데) 가 tl-order-bar-short 를 돌려줬습니다.
 *              ★"확인" 을 누르면 매도/숏 주문창이 열립니다★ (겹침 52px · P1).
 *     날짜 창 — 눕힌 화면 640x360 에서 "이동" 자리에 매수/롱 (겹침 69px · P3).
 *   지금은 둘 다 floorY() 로 바를 봅니다. 2절이 회귀를 막습니다.
 *
 * ★4절은 이제 비었습니다.★ 화면 기준인데 바를 안 보는 것이 0 개입니다 —
 *   하나라도 늘면 그건 전부 ★새 구멍★ 이고 그 자리에서 빨개집니다.
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

/* fixed 이면서 네 변이 모두 0 — 「화면 전체를 덮는 것」.
   inset:0 과 뜻은 같지만 글자가 달라 따로 봅니다(★이것 없으면 chart-style.js 를 놓칩니다★).
   사이에 다른 속성이 끼어도 잡히게 여유를 두되, 문자열 하나 안에서만 찾습니다. */
const 네변0 = /position:\s*fixed[\s\S]{0,160}?left:\s*0[\s\S]{0,160}?top:\s*0[\s\S]{0,160}?right:\s*0[\s\S]{0,160}?bottom:\s*0/;

/** js/ 전체를 훑어 「띄우는 것」 을 찾습니다.
 *  갈래 = { 명시, cssText, 덮개 } — ★돌연변이 검사에서 갈래를 하나씩 꺼 봅니다★ */
function 훑기(갈래) {
  const 목록 = [];
  모든파일.forEach((f) => {
    const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, f), "utf8"));
    const 겹쳐뜸 = /position:\s*(fixed|absolute)/.test(코드) && /z-index/.test(코드);
    if (!겹쳐뜸) return;
    const 명시 = /\.style\.(top|bottom|left|right)\s*=/.test(코드);
    const css텍스트 = /\.style\.cssText\s*=/.test(코드);
    const inset0 = /inset:\s*0/.test(코드);
    const 화면덮개 = 네변0.test(코드);
    const 덮개 = inset0 || 화면덮개;
    const 자리정함 =
      (갈래.명시 && 명시) || (갈래.cssText && css텍스트) || (갈래.덮개 && 덮개);
    if (!자리정함) return;
    목록.push({
      파일: f, 명시: 명시, cssText: css텍스트, 덮개: 덮개,
      화면덮개: 화면덮개, 칸덮개: inset0 && !화면덮개,
      화면기준: /innerHeight|clientHeight/.test(코드),
      바를봄: /tl-order-bar/.test(코드)
    });
  });
  return 목록;
}

const 갈래전부 = { 명시: true, cssText: true, 덮개: true };
const 띄우는것 = 훑기(갈래전부);

띄우는것.forEach((m) => {
  console.log("      · " + m.파일.padEnd(30) +
    " 갈래=" + [m.명시 ? "명시" : "", m.cssText ? "cssText" : "", m.덮개 ? "덮개" : ""]
      .filter(Boolean).join("+").padEnd(18) +
    " 화면기준=" + (m.화면기준 ? "O" : "-") +
    "  주문막대=" + (m.바를봄 ? "O" : "★안 봄★"));
});

/* 2026-09-03 현재 알려진 것. ★새 모듈이 창을 만들면 여기서 빨개집니다★ —
   그때 할 일은 이름만 더하는 게 아니라, 그 창이 화면 기준인지 보고
   화면 기준이면 하단 바를 보는지 확인하는 것입니다(2·4절이 자동으로 검사합니다). */
const 알려진띄우는것 = [
  "chart-candle-type.js", "chart-drawings.js", "chart-goto-date.js",
  "chart-indicator-kit.js", "chart-indicator-menu.js", "chart-indicator-settings.js",
  "chart-oscillators.js", "chart-replay.js", "chart-style.js", "chart-timezone.js",
  "interval-more.js", "jitter-probe.js", "stream-loading-hint.js",
  "symbol-stream-switch.js"
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

/* ── 화면 기준이 아닌 것을 ★갈래별로 나눠★ 둡니다 ──────────────────────
 * 하단 바와 사정이 저마다 달라서, 한 덩어리로 두면 "왜 안 봐도 되는지" 가 사라집니다.
 * 2026-09-03 에 ⓑcssText·ⓒ덮개 를 넓히며 4 → 7 개가 됐습니다. */
const 화면덮개군 = 칸좌표.filter((m) => m.화면덮개).map((m) => m.파일);
const 칸덮개군 = 칸좌표.filter((m) => m.칸덮개).map((m) => m.파일);
const cssText군 = 칸좌표.filter((m) => !m.덮개 && !m.명시 && m.cssText).map((m) => m.파일);
const 칸문서좌표군 = 칸좌표.filter((m) => !m.덮개 && m.명시).map((m) => m.파일);

ok("화면 기준이 아닌 " + 칸좌표.length + "개가 갈래 넷으로 다 나뉜다 " +
  "(화면덮개 " + 화면덮개군.length + " · 칸덮개 " + 칸덮개군.length +
  " · cssText " + cssText군.length + " · 칸/문서좌표 " + 칸문서좌표군.length + ")",
  화면덮개군.length + 칸덮개군.length + cssText군.length + 칸문서좌표군.length === 칸좌표.length,
  "어느 갈래에도 안 들어간 것이 있습니다 — 사람이 보고 갈래를 정해야 합니다: " +
  칸좌표.map((m) => m.파일).join(","));

/* ㉠ 화면 전체를 덮는 것 — 바를 ★가리는 게 아니라 덮습니다★ (6절에서 안전 근거를 봅니다) */
ok("★화면 전체를 덮는 것이 알려진 1개 그대로다★ (" + 화면덮개군.join(" · ") + ")",
  화면덮개군.join(",") === "chart-style.js",
  "지금: " + 화면덮개군.join(",") + " → 새로 생겼으면 ★6절 형식으로★ " +
  "z-index·안쪽 스크롤·키 묶임을 확인해야 합니다");

/* ㉡ 차트 칸만 덮는 것 — 화면이 아니라 칸 안입니다 (2절에서 따로 봅니다) */
ok("차트 칸만 덮는 것이 알려진 1개 그대로다 (" + 칸덮개군.join(" · ") + ")",
  칸덮개군.join(",") === "chart-replay.js");

/* ㉢ cssText 한 줄로 만드는 것 — 7절에서 갈래별로 봅니다 */
ok("cssText 로만 자리를 정하는 것이 알려진 2개 그대로다 (" + cssText군.join(" · ") + ")",
  cssText군.slice().sort().join(",") === "jitter-probe.js,symbol-stream-switch.js",
  "지금: " + cssText군.join(",") + " → 새로 생겼으면 ★화면 아래쪽에 붙는지★ 를 " +
  "먼저 보세요. 아래에 붙으면 매수·매도 바와 겹칩니다");

/* ㉣ 칸·문서 좌표. ★여기 적어 둡니다★ — 표정 창이 바로 이 갈래에서 났습니다.
     chart-indicator-kit / chart-oscillators  칸 위끝에 붙는 이름표 (아래로 안 자람)
     stream-loading-hint                      문서 좌표. 페이지와 같이 스크롤됨 */
ok("칸·문서 좌표로 띄우는 것이 알려진 3개 그대로다 (" + 칸문서좌표군.join(" · ") + ")",
  칸문서좌표군.slice().sort().join(",") ===
    "chart-indicator-kit.js,chart-oscillators.js,stream-loading-hint.js",
  "새로 생겼으면 ★차트 칸 아래끝·화면 아래끝을 둘 다 보는지★ 사람이 확인해야 합니다 " +
  "(tests/chart-pane-popup-bottom-fit.test.js 가 그 갈래의 본보기입니다)");

/* ── ★규칙 돌연변이★ — 갈래를 하나 끄면 그 파일이 레이더에서 사라져야 한다 ──
 * 원본 파일을 안 건드리고 ★훑는 규칙만★ 꺼서 확인합니다(다른 팀이 파일을 잡고 있습니다).
 * 안 사라지면 그 갈래는 아무것도 안 잡고 있는 것입니다. */
{
  const 덮개끔 = 훑기({ 명시: true, cssText: true, 덮개: false }).map((m) => m.파일);
  ok("★ⓒ덮개 갈래를 끄면 chart-style.js 가 레이더에서 사라진다★",
    덮개끔.indexOf("chart-style.js") < 0 && 덮개끔.length === 띄우는것.length - 1,
    "덮개 갈래가 헛돌고 있습니다 — 지금: " + 덮개끔.length + "개");

  const cssText끔 = 훑기({ 명시: true, cssText: false, 덮개: true }).map((m) => m.파일);
  ok("★ⓑcssText 갈래를 끄면 jitter-probe.js · symbol-stream-switch.js 둘이 사라진다★",
    cssText끔.indexOf("jitter-probe.js") < 0 &&
    cssText끔.indexOf("symbol-stream-switch.js") < 0 &&
    cssText끔.length === 띄우는것.length - 2,
    "cssText 갈래가 헛돌고 있습니다 — 지금: " + cssText끔.length + "개");

  /* ⚠️ inset:0 만으로는 chart-style.js 를 ★못 잡습니다★. 그 파일은 네 변을 따로 적습니다.
     이 검사가 「네변0 갈래를 지우면 안 된다」 를 못 박습니다. */
  const style코드 = 코드만(fs.readFileSync(path.join(JSDIR, "chart-style.js"), "utf8"));
  ok("★chart-style.js 는 inset:0 을 안 써서 네변0 갈래가 없으면 못 잡는다★",
    !/inset:\s*0/.test(style코드) && 네변0.test(style코드),
    "저쪽이 inset:0 으로 바뀌었으면 이 주석을 고치세요 — 잡히는 것은 그대로입니다");

  const 명시끔 = 훑기({ 명시: false, cssText: true, 덮개: true }).map((m) => m.파일);
  ok("ⓐ명시 갈래를 끄면 " + (띄우는것.length - 명시끔.length) + "개가 사라진다 (갈래가 살아 있다)",
    명시끔.length < 띄우는것.length);
}

/* =====================================================================
 * [2] 보호군 — 하단 바를 보는 모듈은 계속 봐야 한다 (회귀 봉인)
 * ===================================================================== */
절("[2] 보호군 — 하단 매수·매도 바를 보는 모듈");

const 보호군 = 화면기준.filter((m) => m.바를봄).map((m) => m.파일);
const 알려진보호군 = [
  "chart-candle-type.js", "chart-drawings.js",
  /* 2026-09-03 수리팀이 고쳐 4절에서 옮겨 왔습니다 (P1 · P3)
     chart-indicator-settings.js — 설정판 단추줄 세 개가 바 밑에 깔려
       "확인" 자리에서 ★매도/숏★ 이 눌렸습니다 (360x640 겹침 52px)
     chart-goto-date.js — 눕힌 화면에서 "이동" 자리에 ★매수/롱★
       (640x360 겹침 69px). 둘 다 floorY() 로 바를 봅니다 */
  "chart-goto-date.js", "chart-indicator-menu.js", "chart-indicator-settings.js",
  /* 2026-09-03 수리팀이 고쳐 4절에서 옮겨 왔습니다 (둘 다 menuFloorY) */
  "chart-timezone.js", "interval-more.js"
];
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
  { 파일: "chart-indicator-menu.js", 함수: "floorY", 여백: "EDGE" },
  { 파일: "interval-more.js", 함수: "menuFloorY", 여백: "EDGE" },
  { 파일: "chart-timezone.js", 함수: "menuFloorY", 여백: "EDGE" }
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
절("[4] 아직 하단 바를 안 보는 것 (PM 보고용 · 고쳐지면 여기가 빨개집니다)");

const 미보호 = 화면기준.filter((m) => !m.바를봄).map((m) => m.파일);
/* ⚠️ 2026-09-03 — ★비었습니다.★ 마지막 둘(chart-goto-date · chart-indicator-settings)을
   수리팀이 고쳐 2절 보호군으로 옮겼습니다. 이 절이 예고한 대로입니다.
   이제 이 줄은 "새 구멍이 뚫렸는지" 를 보는 자리입니다 —
   ★하나라도 늘면 그건 전부 새 구멍입니다.★ */
const 알려진미보호 = [];
ok("★화면 기준인데 바를 안 보는 것이 " + 알려진미보호.length + "개다★ (" +
  (미보호.length ? 미보호.join(" · ") : "없음") + ")",
  미보호.slice().sort().join(",") === 알려진미보호.slice().sort().join(","),
  "지금: " + 미보호.join(",") + " / 알려진: " + 알려진미보호.join(",") +
  "\n         → 늘었으면 ★새 구멍★ 입니다. 고쳐서 2절 알려진보호군 으로 옮기세요");

/* ⚠️ 2026-09-03 — 아래 두 덩이는 ★남은 것이 있을 때만★ 봅니다.
   지금은 0 개라 빈 배열에 대고 "다 그렇다" 를 물으면 ★무조건 초록★ 이 됩니다.
   그건 확인이 아니라 거짓 안심입니다 — "창 아래 64px 이 깔린다" 는 말도
   이제 사실이 아닙니다. 그래서 감싸 두고, 비었으면 비었다고 적습니다.
   새 구멍이 생겨 4절이 다시 채워지면 이 덩이들이 저절로 살아납니다. */
if (!알려진미보호.length) {
  ok("남은 것이 없어 「얼마나 깔리나」 · 「바보다 아래인가」 는 잴 것이 없다", true);
} else {
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
  ok("남은 " + 알려진미보호.length + "개 다 화면 아래끝에서 8px 만 남긴다 (" +
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
  ok("★남은 " + 알려진미보호.length + "개 다 바(z " + 바Z + ")보다 아래라 실제로 밑에 깔립니다★ (" +
    밑에깔림.join(" · ") + ")",
    밑에깔림.length === 알려진미보호.length,
    "지금 밑에 깔리는 것: " + 밑에깔림.join(",") +
    " → 하나가 바보다 위로 올라갔으면 「깔림」 은 풀리지만 「가림」 은 남습니다");
}
}

/* =====================================================================
 * [5] ★전체 덮개 갈래★ — js/chart-style.js
 *
 * 이 창은 「바를 가린다」 가 아니라 ★바 위를 통째로 덮습니다★. 갈래가 달라서
 * 4절(가려짐 계산)이 아니라 여기서 따로 봅니다. 안전하려면 셋이 다 있어야 합니다.
 *   ㉠ 바보다 ★위★ 에 있을 것        — 아니면 창이 떠 있는데 밑의 매수·매도가 눌립니다
 *   ㉡ 화면 높이 안으로 ★묶일 것★     — 아니면 아래가 화면 밖으로 나갑니다
 *   ㉢ 안에서 ★스크롤될 것★          — 넘치는 내용을 손으로 꺼낼 수 있어야 합니다
 * ⚠️ ㉢ 이 없어서 실제로 당한 적이 있습니다 — js/chart-timezone.js 가
 *   360x640 에서 +57px 넘쳤는데 스크롤이 안 생겨 밑을 못 꺼냈습니다(위 머리말 참조).
 * ===================================================================== */
절("[5] 전체 덮개 갈래 — js/chart-style.js (바를 가리는 게 아니라 덮는 쪽)");
{
  const F = "chart-style.js";
  const 코드 = 코드만(fs.readFileSync(path.join(JSDIR, F), "utf8"));
  const 바Z0 = Number((바CSS.match(/z-index:(\d+)/) || [])[1]);

  ok(F + " — 화면 네 변(left·top·right·bottom)을 0 으로 묶어 전체를 덮는다",
    네변0.test(코드), "덮개가 아니게 되면 1절 갈래 분류부터 다시 해야 합니다");

  /* 덮개 자신의 z 는 「fixed 네 변 0」 이 적힌 그 규칙 안에서 읽습니다.
     파일 안 다른 z-index(예: 안쪽 조각)를 잘못 집으면 비교가 무의미해집니다. */
  const 덮개규칙 = (코드.match(/position:\s*fixed;[^"']*?bottom:\s*0;[^"']*/) || [])[0] || "";
  const 덮개Z = Number((덮개규칙.match(/z-index:\s*(\d+)/) || [])[1]);
  ok(F + " — 덮개 규칙에서 z-index 를 읽었다 (" + 덮개Z + ")", isFinite(덮개Z) && 덮개Z > 0,
    "규칙 안에 z-index 가 없습니다: " + 덮개규칙.slice(0, 80));
  ok("★" + F + " 덮개(z " + 덮개Z + ") 가 매수·매도 바(z " + 바Z0 + ")보다 위다★",
    isFinite(덮개Z) && isFinite(바Z0) && 덮개Z > 바Z0,
    "창이 떠 있는데 아래 매수·매도 단추가 눌립니다 — 폰에서 진짜 주문이 들어갑니다. " +
    "지금 덮개 " + 덮개Z + " vs 바 " + 바Z0);
  /* 로그인 게이트(1000)보다는 아래여야 합니다 — 원본 주석에 근거가 적혀 있습니다 */
  ok(F + " — 그래도 로그인 게이트(1000)보다는 아래다 (" + 덮개Z + " < 1000)",
    isFinite(덮개Z) && 덮개Z < 1000,
    "게이트를 덮으면 로그인 안 한 사람이 설정을 만집니다");

  ok("★" + F + " — 상자 키가 화면 안으로 묶인다 (max-height:100%)★",
    /\.tl-cs-box\{[^"']*max-height:\s*100%/.test(코드),
    "묶이지 않으면 내용이 길 때 아래가 화면 밖으로 나갑니다");
  ok("★" + F + " — 안쪽 칸이 스크롤된다 (.tl-cs-pane overflow-y:auto)★",
    /\.tl-cs-pane\{[^"']*overflow-y:\s*auto/.test(코드),
    "스크롤이 없으면 넘친 부분을 손으로 못 꺼냅니다 (chart-timezone.js 가 그랬습니다)");

  /* ★그래서 이 파일은 하단 바를 안 봐도 됩니다★ — 4절 미보호군에 안 넣는 근거입니다.
     조건이 하나라도 깨지면 위 검사들이 먼저 빨개져서 사람이 다시 재게 됩니다. */
  /* ★그래서 이 파일은 4절 「아직 안 보는 것」 에 안 들어갑니다★ —
     4절은 화면 기준으로 ★자리를 잡는★ 창만 셉니다. 덮개는 자리를 안 잡습니다.
     화면 높이를 읽기 시작하면(= 자리를 잡기 시작하면) 4절로 옮겨져 거기서 빨개집니다. */
  ok(F + " — 4절 미보호군에 안 들어간다 (화면 높이를 읽어 자리를 잡지 않으므로)",
    !/innerHeight|clientHeight/.test(코드) && 알려진미보호.indexOf(F) < 0,
    "화면 높이를 읽기 시작했으면 자리를 잡는 창입니다 — 4절에서 하단 바를 봐야 합니다");
}

/* =====================================================================
 * [6] ★cssText 갈래★ — 상단 토스트와 개발용 상자
 * ===================================================================== */
절("[6] cssText 갈래 — symbol-stream-switch(상단 토스트) · jitter-probe(개발용)");
{
  /* ── ㉠ js/symbol-stream-switch.js — 시세를 못 받았을 때 뜨는 경고 토스트 ──
   * ★위에 붙습니다(top:8px).★ 아래로 자라지 않으니 하단 바와 만나지 않습니다.
   * 면제 근거는 「위에 붙어 있다」 이므로, 그것이 바뀌면 여기가 빨개져야 합니다. */
  const S = "symbol-stream-switch.js";
  const s코드 = 코드만(fs.readFileSync(path.join(JSDIR, S), "utf8"));
  const 토스트 = (s코드.match(/cssText\s*=\s*\[[\s\S]{0,700}?\]\.join\(";"\)/) || [])[0] || "";
  ok(S + " — 경고 토스트를 cssText 로 만든다 (그래서 ⓐ명시 갈래로는 안 잡혔습니다)",
    토스트.length > 0 && /position:fixed/.test(토스트),
    "cssText 모양이 바뀌었습니다 — 아래 검사의 근거가 사라집니다");
  ok("★" + S + " 토스트는 화면 ★위쪽★ 에 붙는다 (top 고정 · bottom 안 씀)★",
    /"top:\s*\d+px"/.test(토스트) && !/"bottom:/.test(토스트),
    "아래쪽에 붙게 바뀌었으면 ★매수·매도 바와 겹칩니다★ — 그때는 바를 봐야 합니다");
  ok(S + " — 그래서 하단 바를 안 봐도 된다 (근거: 위에 붙고 아래로 안 자람)", true);

  /* ── ㉡ js/jitter-probe.js — ★면제. 근거를 적습니다★ ──────────────────
   * 이 상자는 right:10px · bottom:10px 라 ★아래쪽에 붙습니다★. 자리만 보면
   * 매수·매도 바와 정면으로 겹칩니다. 그런데도 안 보는 이유는 하나뿐입니다 —
   * ★주소에 ?jitter=1 을 붙였을 때만 켜지고, 회원에게는 절대 안 보입니다.★
   * 개발자가 화면 흔들림을 잴 때 쓰는 도구입니다.
   *
   * ⚠️ ★면제를 그냥 믿지 않습니다.★ 그 「켜짐 조건」 이 살아 있는지를 검사합니다.
   *    누가 조건을 지우면 회원 화면에 뜨게 되고, 그 순간 이 절이 빨개집니다.
   *    그때 할 일은 면제를 지우고 하단 바를 보게 하는 것입니다. */
  const J = "jitter-probe.js";
  const j코드 = 코드만(fs.readFileSync(path.join(JSDIR, J), "utf8"));
  ok("★" + J + " 는 아래쪽에 붙는다 (bottom · right) — 자리만 보면 바와 겹칩니다★",
    /cssText\s*=\s*[\s\S]{0,200}?bottom:\s*\d+px/.test(j코드),
    "자리가 바뀌었으면 아래 면제 근거를 다시 써야 합니다");
  ok("★" + J + " 는 ?jitter=1 일 때만 켜진다 (회원 노출 없음) — ★이것이 면제 근거★",
    /jitter=1/.test(j코드) && /location\.search/.test(j코드),
    "켜짐 조건이 사라졌습니다 — ★회원 화면 오른쪽 아래에 개발용 상자가 뜹니다.★ " +
    "면제를 지우고 하단 바를 보게 해야 합니다");
  /* 꺼져 있을 때 상자를 아예 안 만드는지 — 조건만 있고 실행이 새면 소용없습니다 */
  ok(J + " — 꺼져 있으면 아무것도 안 만든다 (ON 이 거짓이면 즉시 빠져나감)",
    /if\s*\(\s*!\s*ON\s*\)\s*return/.test(j코드),
    "ON 검사가 없으면 조건이 있어도 상자가 만들어질 수 있습니다");
  /* ⚠️ index.html 에도 ★주석을 지우고★ 봅니다. 1147줄에 "?jitter=1 을 붙였을 때만
     켜집니다" 라는 ★설명 주석★ 이 있어, 안 지우면 오탐으로 빨개집니다
     (실제로 처음 쓸 때 이걸로 한 번 빨개졌습니다 — js 쪽 코드만() 과 같은 이유). */
  const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8")
    .replace(/<!--[\s\S]*?-->/g, " ");
  ok(J + " — 회원용 화면(index.html)이 스스로 ?jitter=1 을 켜지 않는다 (주석 뺀 뒤 확인)",
    HTML.indexOf("jitter=1") < 0,
    "index.html 이 스스로 ?jitter=1 을 켜면 ★회원 모두에게★ 개발용 상자가 보입니다");
}

/* =====================================================================
 * [7] 앞 봉인들과 겹치지 않게 — 무엇을 누가 보는지 적어 둔다
 * ===================================================================== */
절("[7] 봉인 나눠 맡기 — 같은 것을 두 벌로 안 봅니다");
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
 * [8] 등록
 * ===================================================================== */
절("[8] 등록");
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
