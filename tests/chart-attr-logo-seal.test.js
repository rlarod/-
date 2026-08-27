/* ===========================================================================
 * tests/chart-attr-logo-seal.test.js
 *   차트의 트레이딩뷰 표기 링크를 "숨기지도 바꾸지도 못하게" 못 박습니다
 *
 * 2026-08-28 추가 (봉인 0건 2순위 — 본부장 지시).
 *
 * ── 이건 디자인이 아니라 남의 저작물 표기입니다 ─────────────────────────
 *
 * 차트 왼쪽 아래 작은 마크는 우리 로고가 아닙니다.
 *   요소   <a id="tv-attr-logo" href="https://www.tradingview.com/?utm_medium=lwc-link…"
 *          title="Charting by TradingView">
 *   출처   lightweight-charts 5.2.0 이 스스로 만들어 붙입니다 (우리 코드 아님)
 *   스위치 layout.attributionLogo (기본 true) — 공개 옵션이라 끄기도 쉽습니다
 *
 * 라이브러리는 Apache License 2.0 이고, 이 표기는 트레이딩뷰가 요청하는 출처
 * 표시입니다. **뗄지 말지는 개발이 정할 일이 아니라 대표가 정할 일입니다.**
 * js/chart-attr-logo.js 는 그래서 "켠 채로 자리만" 옮겼습니다.
 *
 * ── 왜 테스트가 필요한가 ────────────────────────────────────────────────
 *
 * 지금은 이 표기를 없애는 데 한 줄이면 충분하고, 어느 검사에도 안 걸립니다.
 *     css 에    a#tv-attr-logo{display:none}
 *     js 에     chart.applyOptions({ layout: { attributionLogo: false } })
 *     또는      document.getElementById("tv-attr-logo").remove()
 * 화면은 오히려 깔끔해 보이고 오류도 안 납니다. 아무도 모르는 사이에
 * 남의 저작물 표기가 사라지는 상태 — 눈에 안 보이는 고장입니다.
 *
 * ⛔ 이 파일은 읽기만 합니다. 사이트 코드는 한 글자도 안 고칩니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const 모듈경로 = "js/chart-attr-logo.js";

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++; 실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? " — " + 도움말 : ""));
  }
}
function section(t) { console.log("\n" + t); }
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const 있다 = (rel) => fs.existsSync(path.join(REPO, rel));
const 공백뺀 = (t) => t.replace(/\s+/g, "");

const 모듈 = read(모듈경로);

console.log("\n트레이딩뷰 표기 링크 봉인 (남의 저작물 표기 — 숨기지도 바꾸지도 않는다)");

/* =========================================================================
 * [1] 파일이 있고, index.html 이 부르고, git 에도 있다
 * ===================================================================== */
section("[1] 등록 · git 추적");
{
  ok(모듈경로 + " 가 있다", 있다(모듈경로));

  const html = read("index.html");
  ok("index.html 이 이 파일을 부른다",
    html.indexOf('src="' + 모듈경로 + '"') !== -1,
    "안 부르면 마크가 차트 그림 안(거래량 막대·MACD 위)으로 되돌아갑니다");

  /* 디스크엔 있는데 git 엔 없는 사고가 2026-08-27 하루에 세 번 났습니다.
     fs.existsSync 로는 못 잡아서 git 에게 직접 묻습니다.
     한글 이름이 아니어도 습관으로 -z 를 씁니다. */
  let 추적 = "";
  try {
    추적 = require("child_process")
      .execFileSync("git", ["ls-files", "-z", "--", 모듈경로], { cwd: REPO })
      .toString().split(String.fromCharCode(0)).filter((s) => s)[0] || "";
  } catch (e) { 추적 = ""; }
  ok("git 에 추적되고 있다 (clone 한 PC 에서 빈 링크가 되지 않는다)",
    추적 === 모듈경로, 추적 || "git ls-files 결과 없음");
}

/* =========================================================================
 * [2] 표기를 숨기는 방법이 이 모듈 안에 없다  ← 핵심 ①
 *
 *     "숨김" 을 만드는 길이 여럿이라 하나씩 다 막습니다.
 * ===================================================================== */
section("[2] 숨기지 않는다");
{
  /* 주석 때문에 오탐이 나지 않게 주석을 먼저 걷습니다 — 이 모듈 주석에는
     "투명도만 낮춘다" 같은 후보 설명이 실제로 들어 있습니다. */
  function 코드만(t) {
    let out = "", i = 0;
    for (;;) {
      const a = t.indexOf("/" + "*", i);
      if (a === -1) { out += t.slice(i); break; }
      out += t.slice(i, a) + " ";
      const b = t.indexOf("*" + "/", a + 2);
      if (b === -1) break;
      i = b + 2;
    }
    return out.split(String.fromCharCode(10)).map((l) => {
      const j = l.indexOf("/" + "/");
      return j === -1 ? l : l.slice(0, j);
    }).join(String.fromCharCode(10));
  }

  const 코드 = 공백뺀(코드만(모듈));

  const 금지 = [
    "display:none", "visibility:hidden", "opacity:0;", "opacity:0}",
    "pointer-events:none", "content-visibility:hidden",
  ];
  const 걸린것 = 금지.filter((w) => 코드.indexOf(공백뺀(w)) !== -1);
  ok("모듈이 마크를 숨기는 CSS 를 쓰지 않는다", 걸린것.length === 0,
    "걸린 것: " + JSON.stringify(걸린것));

  ok("모듈이 마크를 지우지 않는다 (remove / removeChild / innerHTML)",
    코드.indexOf('getElementById("tv-attr-logo").remove') === -1 &&
    코드.indexOf("removeChild(logo)") === -1 &&
    코드.indexOf("logo.innerHTML") === -1);
  ok("모듈이 href 를 바꾸지 않는다",
    코드.indexOf("logo.href=") === -1 && 코드.indexOf('setAttribute("href"') === -1,
    "표기 링크가 다른 곳을 가리키면 출처 표시가 아니게 됩니다");
  ok("모듈이 title 을 바꾸지 않는다",
    코드.indexOf("logo.title=") === -1 && 코드.indexOf('setAttribute("title"') === -1);

  /* 투명도 — 지금 0.6 입니다. 0 이나 0.05 로 낮추면 "있지만 안 보이는" 상태가
     됩니다. 그건 숨긴 것과 같으므로 숫자로 하한을 둡니다. */
  const m = /OPACITY\s*=\s*([0-9.]+)/.exec(모듈);
  const 투명도 = m ? parseFloat(m[1]) : null;
  ok("투명도가 0.5 이상이다 (지금 " + 투명도 + ")",
    투명도 !== null && 투명도 >= 0.5,
    "낮추면 표기가 사실상 안 보입니다. 지금 값: " + 투명도);
  ok("투명도가 1 이하다 (값이 깨지지 않았다)", 투명도 !== null && 투명도 <= 1);
}

/* =========================================================================
 * [3] 라이브러리 스위치를 끄지 않는다  ← 핵심 ②
 *
 *     layout.attributionLogo: false 한 줄이면 라이브러리가 <a> 자체를
 *     아예 안 만듭니다. 그러면 [4] 의 화면 검사까지 조용히 통과합니다.
 *     css 한 줄로 숨기는 길도 같이 막습니다.
 * ===================================================================== */
section("[3] attributionLogo 스위치 · css 숨김");
{
  const js목록 = fs.readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js")
    .map((f) => "js/" + f);
  const 끈파일 = js목록.filter((rel) => 공백뺀(read(rel)).indexOf("attributionLogo:false") !== -1);
  ok("js/ 어디에도 attributionLogo:false 가 없다 (" + js목록.length + "개 확인)",
    끈파일.length === 0,
    "끈 파일: " + JSON.stringify(끈파일) +
    " — 표기를 뗄지는 대표가 정할 일입니다 (Apache-2.0 출처 표시)");

  const css목록 = ["style.css"]
    .concat(있다("css")
      ? fs.readdirSync(path.join(REPO, "css")).filter((f) => f.slice(-4) === ".css").map((f) => "css/" + f)
      : [])
    .filter(있다);
  const 숨긴css = [];
  css목록.forEach((rel) => {
    const t = 공백뺀(read(rel));
    let i = t.indexOf("tv-attr-logo");
    while (i !== -1) {
      const 끝 = t.indexOf("}", i);
      const 블록 = 끝 === -1 ? t.slice(i) : t.slice(i, 끝 + 1);
      if (/display:none|visibility:hidden|opacity:0[;}]|pointer-events:none/.test(블록)) {
        숨긴css.push(rel);
      }
      i = t.indexOf("tv-attr-logo", i + 1);
    }
  });
  ok("css 어디에도 마크를 숨기는 규칙이 없다 (" + css목록.length + "개 확인)",
    숨긴css.length === 0, "숨긴 파일: " + JSON.stringify(숨긴css));
}

/* =========================================================================
 * [4] 실제로 띄워서 — 링크는 그대로 남고 자리만 옮긴다
 *
 *   가짜 차트를 만들어 모듈을 태웁니다. 실제 lightweight-charts 구조와 같습니다 —
 *   .tv-lightweight-charts > table > tr, 마지막 tr 이 시간축 띠,
 *   그 줄의 마지막 td 가 "가격축 아래 빈 칸" 입니다.
 *
 *   심는 크기는 360 폭 상황을 본떴습니다.
 *     시간축 띠 높이 29px · 가격축 아래 빈 칸 75px
 *       → 이 두 값은 js/chart-attr-logo.js 주석에 적힌 2026-08-27 실측값입니다
 *     캔들 칸 폭 285px
 *       → 360 - 75 로 제가 맞춘 값입니다(브라우저로 다시 재지는 않았습니다)
 *   여기서 나오는 결과가 bottom -24px (띠 세로 가운데) · left 305px (빈 칸 가운데)
 *   입니다. 이 두 숫자를 봉인해 두면 자리 계산식이 조용히 바뀔 때 걸립니다.
 * ===================================================================== */
section("[4] 실제 동작 — 링크는 그대로, 자리만 옮긴다");
{
  const HTML =
    "<!doctype html><html><head></head><body>" +
    '<div class="tv-lightweight-charts"><table>' +
    '<tr><td id="host"><a id="tv-attr-logo" ' +
    'href="https://www.tradingview.com/?utm_medium=lwc-link&utm_source=x" ' +
    'title="Charting by TradingView"></a></td><td id="pane-axis"></td></tr>' +
    '<tr id="axis-row"><td id="axis-left"></td><td id="corner"></td></tr>' +
    "</table></div></body></html>";

  const dom = new JSDOM(HTML, {
    runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/",
  });
  const win = dom.window;
  const doc = win.document;

  /* jsdom 은 화면이 없어 크기가 전부 0 입니다. 실측값을 그대로 심습니다. */
  function 크기(id, w, h) {
    doc.getElementById(id).getBoundingClientRect = function () {
      return { width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0 };
    };
  }
  크기("host", 285, 300);
  크기("axis-row", 360, 29);
  크기("corner", 75, 29);
  크기("axis-left", 285, 29);

  win.eval(모듈);
  const M = win.App.ChartAttrLogo;

  ok("App.ChartAttrLogo 가 만들어졌다", !!M);
  ok("기본은 켜져 있다 (표기를 끄고 시작하지 않는다)", M.isEnabled() === true);

  const 적용 = M.apply();
  ok("자리 계산이 성공한다", 적용 === true, String(적용));
  ok("bottom = -24px (시간축 띠의 세로 가운데)", M.getBottom() === -24, String(M.getBottom()));
  ok("left = 305px (가격축 아래 빈 칸의 가로 가운데)", M.getLeft() === 305, String(M.getLeft()));

  const root = doc.documentElement;
  ok("CSS 변수 --tl-attr-logo-bottom 이 실제로 걸렸다",
    root.style.getPropertyValue("--tl-attr-logo-bottom") === "-24px",
    JSON.stringify(root.style.getPropertyValue("--tl-attr-logo-bottom")));
  ok("CSS 변수 --tl-attr-logo-left 가 실제로 걸렸다",
    root.style.getPropertyValue("--tl-attr-logo-left") === "305px",
    JSON.stringify(root.style.getPropertyValue("--tl-attr-logo-left")));

  /* 링크가 손상되지 않았는지 — 저작물 표기의 핵심입니다 */
  const a = doc.getElementById("tv-attr-logo");
  ok("표기 <a> 가 화면에서 사라지지 않았다", !!a && !!a.parentNode);
  ok("href 가 트레이딩뷰를 그대로 가리킨다",
    !!a && a.getAttribute("href").indexOf("https://www.tradingview.com/") === 0,
    a ? a.getAttribute("href") : "(없음)");
  ok("title 이 'Charting by TradingView' 그대로다",
    !!a && a.getAttribute("title") === "Charting by TradingView",
    a ? a.getAttribute("title") : "(없음)");

  /* 모듈이 넣은 style 규칙 자체를 읽습니다 */
  const st = doc.getElementById("tl-attr-logo-style");
  ok("모듈이 자기 style 을 넣었다", !!st);
  const 규칙 = st ? 공백뺀(st.textContent) : "";
  ok("규칙이 a#tv-attr-logo 를 겨냥한다", 규칙.indexOf("a#tv-attr-logo{") === 0, 규칙);
  ok("규칙에 opacity:0.6 이 있다 (숨김이 아니라 낮춤)", 규칙.indexOf("opacity:0.6") !== -1, 규칙);
  ok("규칙에 display:none 이 없다", 규칙.indexOf("display:none") === -1, 규칙);
  ok("규칙에 visibility:hidden 이 없다", 규칙.indexOf("visibility:hidden") === -1, 규칙);
  ok("규칙에 pointer-events:none 이 없다 (링크를 누를 수 있어야 합니다)",
    규칙.indexOf("pointer-events:none") === -1, 규칙);
  ok("라이브러리 <style> 을 이기려고 !important 를 쓴다",
    규칙.indexOf("!important") !== -1,
    "라이브러리가 body 안에 늦게 넣는 규칙이라 순서만으로는 못 이깁니다");

  /* 빈 칸이 마크보다 좁으면 욕심내지 않고 원래 왼쪽(8px)으로 돌아갑니다 */
  크기("corner", 30, 29);
  M.refresh();
  M.apply();
  ok("빈 칸이 마크(35px)보다 좁으면 원래 왼쪽 8px 로 돌아간다",
    M.getLeft() === 8, String(M.getLeft()));

  /* 되돌리기 수단이 실제로 동작하는지 — 모듈 주석에 적힌 disable() */
  M.disable();
  ok("disable() 이 style 을 걷어낸다 (되돌리기가 실제로 된다)",
    !doc.getElementById("tl-attr-logo-style"));
  ok("disable() 뒤에도 표기 <a> 자체는 남는다 (자리만 원래대로 돌아갈 뿐)",
    !!doc.getElementById("tv-attr-logo"));

  win.close();
}

/* =========================================================================
 * [5] 실행 목록 등록
 * ===================================================================== */
section("[5] 실행 목록 등록");
{
  const 목록 = read("tests/_order.txt").split(String.fromCharCode(10)).map((s) => s.trim());
  ok("tests/_order.txt 에 등록됐다",
    목록.indexOf("tests/chart-attr-logo-seal.test.js") !== -1,
    "안 넣으면 npm test 가 이 파일을 안 돌립니다");
}

/* =========================================================================
 * [6] 돌연변이 자체검증 — 위 검사들이 진짜 잡는가
 *     (판정에 쓰는 식을 그대로 가져와 가짜 입력을 먹입니다)
 * ===================================================================== */
section("[6] 돌연변이 자체검증");
{
  function 숨김검사(t) {
    const c = 공백뺀(t);
    return ["display:none", "visibility:hidden", "pointer-events:none"]
      .filter((w) => c.indexOf(w) !== -1);
  }
  ok("(자체검증) display:none 을 넣으면 잡아낸다",
    숨김검사("a#tv-attr-logo{ display: none; }").length === 1);
  ok("(자체검증) pointer-events:none 을 넣으면 잡아낸다",
    숨김검사("a#tv-attr-logo{ pointer-events : none }").length === 1);
  ok("(자체검증) 정상 규칙은 안 잡는다",
    숨김검사("a#tv-attr-logo{opacity:0.6 !important;}").length === 0);

  const 스위치검사 = (t) => 공백뺀(t).indexOf("attributionLogo:false") !== -1;
  ok("(자체검증) attributionLogo: false 를 잡아낸다",
    스위치검사("chart.applyOptions({ layout: { attributionLogo : false } })"));
  ok("(자체검증) attributionLogo: true 는 안 잡는다",
    !스위치검사("layout: { attributionLogo: true }"));

  const 투명도읽기 = (t) => {
    const m = /OPACITY\s*=\s*([0-9.]+)/.exec(t);
    return m ? parseFloat(m[1]) : null;
  };
  ok("(자체검증) 투명도를 0 으로 낮추면 하한에 걸린다",
    투명도읽기("var OPACITY = 0;") === 0 && !(투명도읽기("var OPACITY = 0;") >= 0.5));
  ok("(자체검증) 지금 값 0.6 은 하한을 넘는다", 투명도읽기("var OPACITY = 0.6;") >= 0.5);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
