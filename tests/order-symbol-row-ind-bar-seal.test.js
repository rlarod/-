/* ===========================================================================
 * tests/order-symbol-row-ind-bar-seal.test.js
 *
 * 2026-08-27 에 통과시킨 화면 수정 2건을 못 박습니다.
 * 둘 다 style.css 한 곳만 고친 것이라 조용히 되돌아가기 쉽습니다.
 *
 * ── ① 주문창 종목 줄 4개가 다시 1개로 숨겨지지 않게 ────────────────────
 *
 *    2026-08-17(b6bcf9a) 에 이런 규칙이 들어갔습니다.
 *        .amitalk-order .ami-symbol-row:not(.active){display:none;}
 *    그때 이유는 "이더리움은 준비중이라 화면에서만 숨긴다" 였고,
 *    활성 아닌 줄이 이더리움 하나뿐이었습니다.
 *
 *    2026-08-27 대표 결정으로 비트코인·나스닥·삼성전자·SK하이닉스 네 종목이
 *    전부 열렸습니다(넷 다 배지가 "거래중"). 그래서 **전제가 사실이 아니게 됐고**,
 *    상단 탭은 4개인데 주문창만 1개를 보여주는 상태였습니다.
 *    회원이 주문창에서 "우리는 비트코인만 되는구나" 라고 잘못 판단하게 됩니다.
 *
 *    ⚠ 주의 — style.css 에는 그 옛 규칙이 **주석 안에** 되돌리기용으로 적혀
 *    있습니다. 그래서 문자열만 찾으면 오탐이 납니다. 주석을 걷어낸 뒤 봅니다.
 *
 * ── ② 폰에서 지표 칩이 가격축을 덮지 않게 ──────────────────────────────
 *
 *    칩 막대(.tl-ind-bar)는 js/chart-indicators.js 가 런타임에 넣는
 *    <style id="chart-indicators-style"> 에서 top/left 만 받고 오른쪽 끝이
 *    없었습니다. 그래서 폭이 내용만큼 늘어나 가격축 위로 올라탔습니다.
 *
 *    본부장 실측 (겹침 = 칩 오른쪽 끝 - 가격축 왼쪽. 0 이하라야 안 가려진 것)
 *        360   +56.3px  →  -17.7px
 *    가격축 폭이 폰 74.5px / 태블릿 이상 130.5px 이라 두 구간으로 나눴습니다.
 *
 *    js/chart-indicators.js 는 수정 금지가 아니지만 손대지 않았습니다.
 *    그 파일의 <style> 이 style.css 보다 뒤에 붙어 같은 순위면 그쪽이 이기므로,
 *    style.css 에서 한 단계 더 좁은 선택자로 덮습니다.
 *    → **이 테스트는 "선택자가 더 좁다" 까지 확인합니다.** 그게 깨지면
 *      규칙은 남아 있는데 화면에는 안 먹는 조용한 고장이 됩니다.
 *
 * ── 이 파일은 파일만 읽습니다 ─────────────────────────────────────────
 *    사이트 코드도 서버도 건드리지 않습니다. jsdom 도 안 씁니다.
 * ======================================================================== */

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(REPO, f), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  ✓ " + 제목);
  } else {
    fail++;
    실패목록.push(제목);
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function section(제목) {
  console.log("\n" + 제목);
}

/* 주석을 걷어냅니다. 되돌리기 안내가 주석에 그대로 적혀 있어서
   문자열만 찾으면 "규칙이 살아 있다" 고 잘못 읽습니다. */
function 주석빼기(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, " ");
}

const CSS_원본 = read("style.css");
const CSS = 주석빼기(CSS_원본);

/* =========================================================================
 * [1] 주문창 종목 줄 — 숨김 규칙이 살아 있으면 안 된다
 * ===================================================================== */
section("[1] 주문창 종목 줄 4개");

const 숨김규칙 = /\.ami-symbol-row:not\(\.active\)[^{]*\{[^}]*display\s*:\s*none/;

/* 되돌리는 방법이 주석에 남아 있어야 합니다 (본부장 게이트 2 항목) */
const 종목주석 = (CSS_원본.match(/\/\*[\s\S]*?\*\//g) || []).filter((c) =>
  /ami-symbol-row/.test(c)
);
ok("style.css 주석에 종목 줄 숨김을 왜 걷었는지와 되돌리는 방법이 적혀 있다",
  종목주석.some((c) => /되돌리/.test(c)),
  "되돌리는 방법이 없으면 나중에 아무도 원상복구를 못 합니다");

ok("살아 있는 CSS 에는 .ami-symbol-row:not(.active){display:none} 이 없다",
  !숨김규칙.test(CSS),
  "이 줄이 돌아오면 주문창이 다시 1종목만 보여줍니다. " +
  "상단 탭은 4개인데 주문창만 1개라 회원이 잘못 판단합니다");

/* 다른 방법으로 숨기는 것도 막습니다 (visibility/opacity/height 0) */
const 종목줄규칙들 = [];
const re = /([^{}]*\.ami-symbol-row[^{}]*)\{([^}]*)\}/g;
let m;
while ((m = re.exec(CSS)) !== null) 종목줄규칙들.push({ 선택자: m[1].trim(), 본문: m[2] });

ok("주문창 종목 줄 규칙이 실제로 있다 (" + 종목줄규칙들.length + "개)",
  종목줄규칙들.length > 0);

const 숨긴것 = 종목줄규칙들.filter(
  (r) =>
    /:not\(\.active\)/.test(r.선택자) &&
    (/display\s*:\s*none/.test(r.본문) ||
      /visibility\s*:\s*hidden/.test(r.본문) ||
      /opacity\s*:\s*0(\D|$)/.test(r.본문) ||
      /height\s*:\s*0(\D|$)/.test(r.본문))
);
ok("활성 아닌 종목 줄을 다른 방법(투명·높이0)으로도 감추지 않는다",
  숨긴것.length === 0,
  JSON.stringify(숨긴것));

/* 화면에 그리는 쪽도 4개를 다 그리는지 — 숨김이 CSS 밖으로 옮겨가지 않게 */
const 주문판 = read("js/order-panel-amitalk.js");
ok("주문창이 종목 목록을 돌면서 줄을 만든다", /ami-symbol-row/.test(주문판));
ok("활성이 아닌 줄을 자바스크립트에서 걸러내지 않는다",
  !/filter\([^)]*active[^)]*\)[\s\S]{0,80}ami-symbol-row/.test(주문판),
  "CSS 에서 걷어낸 숨김이 자바스크립트로 옮겨가면 결과는 똑같습니다");

/* =========================================================================
 * [2] 지표 칩이 가격축을 덮지 않는다
 * ===================================================================== */
section("[2] 지표 칩(.tl-ind-bar) 오른쪽 끝");

const 데스크톱 = CSS.match(/\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{([^}]*)\}/);
ok("데스크톱 규칙이 있다 (.chart-panel .chart-wrap .tl-ind-bar)", !!데스크톱,
  "규칙이 없으면 칩 막대가 내용만큼 늘어나 가격축 위로 올라탑니다");

/* ⚠★2026-09-07 수리팀 — 여기 세 검사의 ★재는 방법★ 이 바뀌었습니다★
 * -------------------------------------------------------------------------
 * 2026-08-27 에는 오른쪽 끝을 정적 px 두 개(데스크톱 138 / ≤900px 82)로
 * 막았고, 이 검사도 그 두 숫자가 있는지를 봤습니다.
 *
 * 그런데 그 두 값은 ★달러 가격축만 재고★ 정한 것이었습니다(위 머리글의
 * 74.5 / 130.5 가 둘 다 USDT). 원화 축은 더 넓어서 여섯 폭 ★전부★ 모자랐습니다.
 *   2026-09-07 실측 (침범 = 상자 오른끝 − 그림 오른끝)
 *     360 KRW +13.5 · 375 KRW +14.5 · 390 KRW +13.5
 *     768 KRW ★+87.5★ · 1440 KRW +32.0 · 1920 KRW +31.8
 *   768·KRW 는 ★칩 글자★ EMA(9) 가 +30.0px 가격축 위로 넘었습니다.
 *
 * 게다가 media 경계 900px 는 축이 실제로 바뀌는 자리(767/768)와도 어긋나서,
 * ★768 이 폰용 82px 을 받고 있었습니다★ (원화 축이 169.5 인 자리인데도요).
 *
 * 가격축 폭은 통화 2 × 글씨 구간 3 = ★여섯 가지★ 입니다. 두 값으로도,
 * 네 값으로도 못 맞춥니다. 그래서 ★재서 넣는 방식★ 으로 바꿨습니다 —
 *   js/chart-indbar-room.js 가 그림 칸을 재어 인라인 max-width 로 넣고,
 *   style.css 의 한 줄은 ★예비값★ 으로만 남습니다.
 *
 * ★이 절의 뜻은 그대로입니다★ — "칩이 가격축을 덮지 않는가".
 * 바뀐 것은 그것을 무엇으로 확인하느냐뿐입니다.
 * 실제 침범 숫자를 검산하는 것은 tests/chart-indbar-axis-clear.test.js 입니다. */
const 데스크톱maxw = 데스크톱 && (데스크톱[1].match(/max-width\s*:\s*([^;]+)/) || [])[1];
ok("예비 오른쪽 끝(max-width)이 있다 (지금 " + 데스크톱maxw + ")",
  !!데스크톱maxw,
  "js 가 못 잴 때 오른쪽 끝이 통째로 없어집니다");
ok("예비값이 가장 넓은 가격축(원화 170px)을 견딘다",
  !!데스크톱maxw && (() => {
    const n = (데스크톱maxw.match(/(\d+)px/) || [])[1];
    return n !== undefined && Number(n) >= 170;
  })(),
  "실측 — 원화 축이 768 이상에서 169.5~170px 입니다. 이보다 작으면 또 덮습니다");
ok("옛 정적 right 가 남아 있지 않다 (max-width 와 ★둘 다★ 걸리면 이중으로 좁아짐)",
  !/right\s*:\s*\d/.test(데스크톱 ? 데스크톱[1] : ""),
  "right 와 max-width 를 같이 두면 상자가 두 번 깎입니다");

/* ★구간을 안 나눴는지★ — 옛 900px 경계가 축이 바뀌는 자리(767/768)와
   어긋난 것이 이 병의 절반이었습니다. 경계를 없애면 그 실수가 안 납니다. */
function 칩이든좁은블록(css) {
  const 전체 = css.match(/@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\n\}/g) || [];
  return 전체.filter((b) => /\.tl-ind-bar\{/.test(b));
}
ok("≤900px 로 구간을 다시 나누지 않았다",
  칩이든좁은블록(CSS).length === 0,
  "옛 경계 900px 는 축이 바뀌는 자리(767/768)와 어긋나 768 이 폰 값을 받았습니다");

/* ★진짜 오른쪽 끝은 재서 넣습니다★ — 그 길이 살아 있는지 봅니다.
   이게 없어지면 style.css 예비값만 남아 폰에서 필요 이상으로 좁아집니다. */
const 재는모듈 = "js/chart-indbar-room.js";
ok("그림 영역을 재서 넣는 모듈이 있다 (" + 재는모듈 + ")",
  fs.existsSync(path.join(REPO, 재는모듈)),
  "이 모듈이 없으면 통화를 바꿀 때 다시 어긋납니다");
ok("index.html 이 그 모듈을 부른다",
  read("index.html").indexOf(재는모듈) !== -1,
  "파일만 있고 안 부르면 아무 일도 안 합니다 — 전형적인 조용한 고장입니다");

/* 칩을 지우거나 감추는 방식으로 '해결' 하지 않았는지 */
ok("칩을 감추는 방식으로 때우지 않았다",
  !(데스크톱 && /display\s*:\s*none|visibility\s*:\s*hidden/.test(데스크톱[1])),
  "칩을 숨기면 지표를 켜고 끌 수 없게 됩니다. 줄만 접혀야 합니다");
ok("칩 막대가 여전히 두 줄로 접힐 수 있다 (flex-wrap:wrap)",
  /\.tl-ind-bar\{[^}]*flex-wrap:wrap/.test(read("js/chart-indicators.js").replace(/\s*\+\s*\n\s*"/g, "")),
  "wrap 이 아니면 폭이 좁아질 때 칩이 잘려 나갑니다");

/* =========================================================================
 * [3] 선택자가 런타임 <style> 보다 좁아야 실제로 먹는다
 *
 *     js/chart-indicators.js 가 넣는 <style> 은 style.css 보다 뒤에 붙습니다.
 *     같은 순위면 뒤엣것이 이기므로, 우리 규칙이 더 좁아야 합니다.
 *     (이 프로젝트에서 "같은 규칙 두 벌" 로 이미 두 번 당했습니다 —
 *      tests/css-duplicate-rules.test.js 참조)
 * ===================================================================== */
section("[3] 선택자 순위");

const 런타임 = read("js/chart-indicators.js");
ok("런타임 <style> 은 여전히 .tl-ind-bar 한 개 클래스로만 잡는다",
  /"\.tl-ind-bar\{position:absolute/.test(런타임),
  "런타임 쪽 선택자가 좁아지면 style.css 가 져서 규칙이 안 먹습니다");

function 클래스수(선택자) {
  return (선택자.match(/\./g) || []).length;
}
ok("style.css 쪽 선택자가 더 좁다 (클래스 3개 > 1개)",
  클래스수(".chart-panel .chart-wrap .tl-ind-bar") > 클래스수(".tl-ind-bar"));

ok("런타임 <style> 이 오른쪽 끝을 직접 정하지 않는다",
  !/"\.tl-ind-bar\{[^"]*right:/.test(런타임),
  "양쪽이 같은 값을 정하면 나중에 한쪽만 고쳐서 어긋납니다");

/* =========================================================================
 * [4] 돌연변이 자체검증 — 위 검사가 정말 잡는가
 *
 *     style.css 사본을 메모리에서만 망가뜨립니다. 파일은 건드리지 않습니다.
 * ===================================================================== */
section("[4] 돌연변이 자체검증");

const 망가뜨린1 = 주석빼기(
  CSS_원본 + "\n.amitalk-order .ami-symbol-row:not(.active){display:none;}\n"
);
ok("→ 숨김 규칙을 되돌리면 [1] 이 실패한다", 숨김규칙.test(망가뜨린1),
  "여기서 못 잡으면 [1] 은 가짜입니다");

/* 2026-09-07 — [2] 가 정적 px 검사에서 「예비 max-width + 재는 모듈」 검사로
   바뀌었으므로, 돌연변이도 같이 바꿉니다. 뜻은 그대로 —
   ★[2] 가 진짜로 잡는지 스스로 증명한다★ 입니다. */
const 망가뜨린2 = CSS.replace(
  /\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{[^}]*\}/,
  ".chart-panel .chart-wrap .tl-ind-bar{max-width:calc(100% - 90px);}"
);
const 망가뜨린2값 = (망가뜨린2.match(
  /\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{[^}]*max-width\s*:[^;]*?(\d+)px/) || [])[1];
ok("→ 예비값을 원화 축(170px)보다 좁게 되돌리면 [2] 가 실패한다",
  망가뜨린2값 !== undefined && Number(망가뜨린2값) < 170,
  "여기서 못 잡으면 [2] 는 가짜입니다");

const 망가뜨린3 = CSS.replace(
  /\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{[^}]*\}/,
  ".chart-panel .chart-wrap .tl-ind-bar{right:138px;}"
);
ok("→ 옛 정적 right 로 되돌리면 [2] 가 실패한다",
  /\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{[^}]*right\s*:\s*\d/.test(망가뜨린3) &&
    !/\.chart-panel\s+\.chart-wrap\s+\.tl-ind-bar\{[^}]*max-width/.test(망가뜨린3),
  "정적 px 으로 되돌아가는 것이 ★이번 사고의 원인★ 입니다");

const 망가뜨린4 = read("index.html").replace(/<script src="js\/chart-indbar-room\.js"><\/script>/, "");
ok("→ index.html 에서 재는 모듈을 빼면 [2] 가 실패한다",
  망가뜨린4.indexOf("js/chart-indbar-room.js") === -1 &&
    read("index.html").indexOf("js/chart-indbar-room.js") !== -1,
  "파일만 있고 안 부르는 조용한 고장을 못 잡습니다");

/* =========================================================================
 * 마무리
 * ===================================================================== */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
