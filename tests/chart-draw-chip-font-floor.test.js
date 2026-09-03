/* tests/chart-draw-chip-font-floor.test.js
 * =========================================================================
 * 봉인 — 그리기 칩 · 색굵기 창 · 글자 입력칸 · 도구막대 글씨 ★바닥 17px★
 * =========================================================================
 * 2026-09-03 · 수리팀 (22차)
 *
 * ── 왜 만드나 ──────────────────────────────────────────────────────────
 *   대표가 ★네 번째로★ 같은 말씀을 하셨습니다.
 *     "그 지표? 차트에 선? 그으면 팝업창 같은거뜨는거 다 키워조
 *      너무 안보여 글씨들이 확실히 보이게 만들어"
 *
 *   tests/chart-popup-font-floor.test.js 가 지난번 16곳을 지키고 있습니다.
 *   ★그 파일은 js/chart-drawings.js 와 css/chart-toolbar.css 를 안 봅니다.★
 *   그래서 아래 일곱 곳이 11px · 12px · 15px 로 남아 있었습니다 —
 *   제일 작은 것은 대표가 말씀하신 크기의 ★3분의 2 미만★ 입니다.
 *
 *     .tl-draw-chip            11px   그린 것 칩
 *     .tl-draw-chip button     11px   그 칩 안 단추
 *     .tl-zoom-chip            11px   확대 칩
 *     .tl-zoom-chip button     11px   그 칩 안 단추
 *     .tl-style-pick .hd       11px   색·굵기 고르는 창 제목
 *     .tl-draw-input           12px   차트에 글자 넣는 입력칸
 *     .tlc-txt (도구막대)      15px   지표 · 얼러트 · 리플레이 글자
 *
 * ── ★값을 못 박지 않습니다 — 바닥만 놓습니다★ ─────────────────────────
 *   지난 네 번의 실패 경로가 기록에 남아 있습니다 —
 *     (1) 바이낸스 14px 을 ★천장★ 으로 삼았다
 *     (2) "360 에서 안 들어가면 글씨를 줄여라" 고 지시했다
 *   그래서 이 파일은 "지금 몇 px 이냐" 를 안 봅니다. ★17 아래로 내려가면★
 *   빨개집니다. 대표가 또 "더 키워" 라고 해도 이 파일은 안 고칩니다.
 *
 * ── 무엇을 막는가 ──────────────────────────────────────────────────────
 *   [1] 일곱 자리가 전부 17px 이상이다
 *   [2] ★안 들어가면 줄 수로 푼다★ — 칩에 flex-wrap 과 폭 묶기(fitChip)가 있다
 *   [3] 입력칸은 글씨만 키우지 않고 ★폭도 같이★ 키웠다
 *   [4] 좁은 화면 @media 안에서 글씨를 ★낮추지★ 않았다
 *   [5] census — chart-*.js · chart-*.css 전체에서 17px 미만이 늘지 않는다
 *   [6] 돌연변이 자체검증 — 이 검사가 진짜로 잡는지
 *
 * ── ⚠️ 줄 번호를 손으로 안 적습니다 ────────────────────────────────────
 *   차트팀 · 디자인팀이 같은 파일을 계속 만집니다. ★선택자로 찾습니다.★
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 에서 이 파일 줄을 지우고 이 파일을 지웁니다.
 *
 * 서버도 브라우저도 안 부릅니다. 소스 글자만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

/* tests/repo-env-honored.test.js 가 이 모양을 강제합니다 */
const REPO = process.env.REPO || path.resolve(__dirname, "..");
function 읽기(p) { return fs.readFileSync(path.join(REPO, p), "utf8"); }

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

const 바닥 = 17;
const DRAW = 읽기("js/chart-drawings.js");
const TOOLBAR = 읽기("css/chart-toolbar.css");

/* ---------------------------------------------------------------------
 * CSS 가 "..." + 색이름 + "..." 로 쪼개져 붙습니다.
 * 선택자가 나오는 자리부터 규칙이 끝나는 }" 까지 잘라서 봅니다.
 * (긴 주석이 사이에 끼어 있어 「앞 400글자」 로 자르면 놓칩니다 —
 *  2026-09-03 에 실제로 놓쳐서 undefined 가 나왔습니다)
 * ------------------------------------------------------------------- */
const 닫기 = String.fromCharCode(125, 34); /* }" */
function 규칙(SRC, 선택자) {
  const i = SRC.indexOf(선택자 + "{");
  if (i < 0) return null;
  const j = SRC.indexOf(닫기, i);
  return j > i ? SRC.slice(i, j) : SRC.slice(i, i + 2000);
}
function 값(덩어리, 이름) {
  if (!덩어리) return null;
  const m = new RegExp(이름 + ":\\s*(\\d+(?:\\.\\d+)?)px").exec(덩어리);
  return m ? Number(m[1]) : null;
}

console.log("==========================================================");
console.log(" 그리기 칩 · 도구막대 글씨 바닥 " + 바닥 + "px (2026-09-03 22차)");
console.log("==========================================================");

/* ===================================================================== */
절("[1] 일곱 자리가 전부 " + 바닥 + "px 이상인가");
const 자리 = [
  [".tl-draw-chip", "그린 것 칩"],
  [".tl-draw-chip button", "그린 것 칩 안 단추"],
  [".tl-zoom-chip", "확대 칩"],
  [".tl-zoom-chip button", "확대 칩 안 단추"],
  [".tl-style-pick .hd", "색·굵기 창 제목"],
  [".tl-draw-input", "차트에 글자 넣는 입력칸"]
];
자리.forEach(function (쌍) {
  const sel = 쌍[0], 무엇 = 쌍[1];
  const v = 값(규칙(DRAW, sel), "font-size");
  ok(무엇 + " (" + sel + ")", v !== null && v >= 바닥,
    v === null ? "선택자를 못 찾았습니다 — 이름이 바뀌었나요?" : "지금 " + v + "px");
});
{
  /* 도구막대는 보통 CSS 파일이라 선택자 모양이 다릅니다 */
  const i = TOOLBAR.indexOf(".tlc-txt,");
  ok("도구막대 글자 규칙(.tlc-txt)을 찾았다", i >= 0, "선택자가 바뀌었습니다");
  if (i >= 0) {
    const m = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(TOOLBAR.slice(i, i + 400));
    ok("도구막대 글자 (.tlc-txt · 지표 · 얼러트 · 리플레이)",
      !!m && Number(m[1]) >= 바닥, m ? "지금 " + m[1] + "px" : "font-size 가 없습니다");
  }
}

/* ===================================================================== */
절("[2] ★안 들어가면 글씨가 아니라 줄 수로 푼다★");
{
  [".tl-draw-chip", ".tl-zoom-chip"].forEach(function (sel) {
    const r = 규칙(DRAW, sel);
    ok(sel + " 에 flex-wrap:wrap 이 있다 (17px 이면 360 에서 한 줄에 안 들어갑니다)",
      !!r && r.indexOf("flex-wrap:wrap") >= 0, "없습니다");
    ok(sel + " 에 white-space:nowrap 이 남아 있다 (한글이 낱말 가운데서 갈리지 않게)",
      !!r && r.indexOf("white-space:nowrap") >= 0, "없습니다");
  });
  ok("fitChip() 이 있다 — 칩을 차트 칸 폭 안으로 묶습니다",
    /function\s+fitChip\s*\(/.test(DRAW), "없습니다");
  ok("fitChip 이 재기 전에 left 를 0 으로 되돌린다",
    DRAW.indexOf("el.style.left = \"0px\";") >= 0,
    "★안 되돌리면 스스로 되풀이됩니다★ — 폭 없는 fixed 칸은 (화면폭 - left) 로 재집니다");
  ok("fitChip 이 max-width 를 넣는다", DRAW.indexOf("el.style.maxWidth =") >= 0, "없습니다");
  ok("placeChips 가 두 칩 모두에 fitChip 을 부른다",
    DRAW.indexOf("if (a) fitChip(a, box);") >= 0 && DRAW.indexOf("if (b) fitChip(b, box);") >= 0,
    "안 부르면 칩이 차트 칸 밖으로 나갑니다");
  ok("칩이 두 줄이 되어도 하단 매수·매도 바 밑으로 안 가게 막는다 (아래 막기)",
    DRAW.indexOf("if (ay + a.offsetHeight > box.bottom)") >= 0 &&
    DRAW.indexOf("if (by + b.offsetHeight > box.bottom)") >= 0,
    "★고치기 전 360·스크롤 44 에서 8.2px 내려갔습니다★ (3px 씩 261번 훑어서 잡음)");
}

/* ===================================================================== */
절("[3] ★입력칸은 글씨만 키우지 않았다★ — 폭도 같이");
{
  const r = 규칙(DRAW, ".tl-draw-input");
  const 글씨 = 값(r, "font-size");
  const 폭 = 값(r, "width");
  ok("입력칸 폭이 200px 이상이다", 폭 !== null && 폭 >= 200,
    폭 === null ? "width 를 못 찾았습니다" : "지금 " + 폭 + "px");
  /* 17px 한글 한 글자 ≈ 글씨 크기. 안쪽 폭(폭 - 좌우여백 12 - 테두리 2)이
     적어도 열 글자는 돼야 합니다 — 안 그러면 보이는 글자 수가 옛날보다 줄어듭니다.
     (12px · 150px 시절 안쪽 136px 에 한글 약 11자가 들어갔습니다) */
  ok("입력칸에 한글 열 글자가 들어간다 (안쪽 폭 ≥ 글씨 × 10)",
    글씨 !== null && 폭 !== null && (폭 - 14) >= 글씨 * 10,
    폭 === null ? "폭을 못 찾았습니다" : "안쪽 " + (폭 - 14) + "px · 필요 " + (글씨 * 10) + "px");
  ok("누른 곳에 맞출 때 ★그때그때 잰 키★ 를 쓴다 (ih / 2)",
    DRAW.indexOf("var itop = o.y + y - ih / 2;") >= 0,
    "숫자를 손으로 적으면 다음에 글씨를 키울 때 또 어긋납니다 (22차 전에는 -12 였습니다)");
}

/* ===================================================================== */
절("[4] ★좁은 화면이라고 글씨를 줄이지 않았는가★ — 지난 네 번의 실패 경로");
{
  [["js/chart-drawings.js", DRAW], ["css/chart-toolbar.css", TOOLBAR]].forEach(function (쌍) {
    const 이름 = 쌍[0], SRC = 쌍[1];
    const 나쁨 = /@media[^{]*max-width[^]{0,1400}?font-size:\s*(?:[0-9]|1[0-5])px/.test(SRC);
    ok(이름 + " 의 좁은 폭 @media 가 글씨를 낮추지 않는다", !나쁨,
      "@media max-width 근처에 15px 이하가 있습니다 — 줄이지 말고 폭·줄 수·스크롤로 푸세요");
  });
}

/* ===================================================================== */
절("[5] census — chart-*.js · chart-*.css 에서 " + 바닥 + "px 미만이 늘지 않는다");
{
  /* ⚠️ 한도 3 은 js/chart-drawings.js 의 LIST_FONT(15px · 그린 것 목록 창) 셋입니다.
     ★2026-09-03 수리팀 배정(칩 6곳 + 도구막대 1곳)에 안 들어 있어 안 건드렸습니다.★
     PM 에게 따로 보고했습니다. 배정이 오면 그때 17 로 올리면 되고,
     ★그때 이 검사는 손댈 필요가 없습니다★ — 개수가 줄어드는 것은 통과입니다. */
  const 한도 = 3;
  const 파일들 = [];
  ["js", "css"].forEach(function (d) {
    fs.readdirSync(path.join(REPO, d)).forEach(function (n) {
      if (/^chart-.*\.(js|css)$/.test(n)) 파일들.push(d + "/" + n);
    });
  });
  ok("chart-* 파일을 찾았다 (20개 이상)", 파일들.length >= 20, 파일들.length + "개");

  const 미만 = [];
  let 선언수 = 0;
  파일들.forEach(function (rel) {
    const src = 읽기(rel);
    const 상수 = {};
    const cre = /var\s+([A-Z0-9_]+)\s*=\s*(\d+(?:\.\d+)?)\s*;/g;
    let cm;
    while ((cm = cre.exec(src))) 상수[cm[1]] = Number(cm[2]);
    src.split(/\r?\n/).forEach(function (ln, i) {
      const re = /font-size\s*:\s*([^;"'}]*)/g;
      let m;
      while ((m = re.exec(ln))) {
        const raw = m[1].trim();
        let px = null;
        const lit = raw.match(/^(\d+(?:\.\d+)?)px/);
        if (lit) px = Number(lit[1]);
        else {
          const t = ln.slice(m.index).match(/font-size\s*:\s*"\s*\+\s*([A-Z0-9_]+)\s*\+\s*"px/);
          if (t && 상수[t[1]] !== undefined) px = 상수[t[1]];
        }
        if (px === null) continue;
        선언수++;
        if (px < 바닥) 미만.push(rel + ":" + (i + 1) + " " + px + "px");
      }
    });
  });
  ok("font-size 를 90개 이상 읽었다 (검사가 헛돌지 않았다)", 선언수 >= 90, 선언수 + "개");
  ok(바닥 + "px 미만이 " + 한도 + "곳 이하다 (★늘리지 마세요★)",
    미만.length <= 한도, "지금 " + 미만.length + "곳 — " + 미만.join(" / "));
  /* 하드 바닥 — 예외 없이 15 아래는 안 됩니다 */
  const 너무작음 = 미만.filter(function (s) {
    return Number(/(\d+(?:\.\d+)?)px$/.exec(s)[1]) < 15;
  });
  ok("어느 chart-* 파일에도 15px 미만이 없다", 너무작음.length === 0, 너무작음.join(" / "));
}

/* ===================================================================== */
절("[6] 돌연변이 — 이 검사가 진짜로 잡는가");
{
  /* 글씨를 11px 로 되돌린 사본을 만들어, [1] 이 그걸 잡는지 봅니다.
     ★진짜 파일은 안 건드립니다 — 문자열 사본입니다.★ */
  const 가짜 = DRAW.replace("font-size:17px;line-height:1.6", "font-size:11px;line-height:1.6");
  ok("사본이 실제로 달라졌다 (돌연변이가 헛돌지 않았다)", 가짜 !== DRAW, "치환이 안 됐습니다");
  const v = 값(규칙(가짜, ".tl-draw-chip"), "font-size");
  ok("글씨를 11px 로 되돌리면 [1] 이 잡는다", v !== null && v < 바닥, "지금 " + v + "px");

  const 가짜2 = DRAW.replace("el.style.maxWidth =", "el.style.__maxWidth =");
  ok("fitChip 의 폭 묶기를 지우면 [2] 가 잡는다",
    가짜2 !== DRAW && 가짜2.indexOf("el.style.maxWidth =") < 0, "치환이 안 됐습니다");
}

/* ===================================================================== */
절("[7] 등록 — npm test 로 실제로 돌아가는가");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-draw-chip-font-floor.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach(function (s) { console.log("  - " + s); });
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
