/* tests/chart-pane-label-fit.test.js
 * =========================================================================
 * 봉인 — 칸 이름표가 ★문서를 옆으로 밀지 않고 · 가격축을 안 덮는다★
 * =========================================================================
 * 2026-09-03 · 수리팀 (22차). 조사팀이 한 줄까지 짚어 준 것을 못 박습니다.
 *
 * ── 무슨 일이 있었나 (2026-09-03 13:33 실측) ──────────────────────────
 *   js/chart-indicator-kit.js 의 .tl-kit-plabel 에 ★오른쪽 끝이 없었습니다★.
 *     left 만 있고 right 도 max-width 도 없음.
 *   position:absolute + white-space:nowrap 이면 상자 폭이 ★글자 길이 그대로★
 *   무한정 늘어납니다. .chart-wrap 부터 <html> 까지 13개 요소의 overflow-x 가
 *   전부 visible 이라, 늘어난 만큼 문서가 그대로 옆으로 밀립니다.
 *   절대배치라 부모의 ★레이아웃 폭★ 은 안 밀리고 ★스크롤 넘침 영역★ 이 밀립니다 —
 *   그래서 min-width:0 은 이 건과 무관합니다(이미 붙어 있는데도 밀렸습니다).
 *
 *   360 · 원화 실측
 *     고치기 전   문서 넘침 31px · MACD 이름표 폭 368px · 오른끝 391 (화면 360)
 *                 그림 영역(오른끝 252)을 ★140px★ 올라타 가격축 숫자를 덮음
 *                 MACD 만이 아님 — StochRSI +74 · KDJ +40 · DMI +40
 *     고친 뒤     문서 넘침 0 · 그림 영역 넘침 -5 (여섯 폭 · 원화/달러 전부)
 *
 *   ★넘침 문턱은 32자★ 입니다. MACD(12,26,9) 가 13자 고정이라 값 셋의 합이
 *   19자 이상이면 밀립니다. 원화 MACD 는 보통 21자라 ★평소에 밀렸고★,
 *   달러는 28자라 안 밀렸습니다 — 그래서 달러로만 보면 안 보이는 고장이었습니다.
 *
 * ── ★같은 병을 이미 고친 선례가 있습니다★ ────────────────────────────
 *   style.css 의 .tl-ind-bar (2026-08-27) — 칩 막대가 똑같이 left 만 있어
 *   가격축을 덮던 것을 right:138px + @media(max-width:900px){right:82px} 로
 *   막았습니다. 이름표는 그때 없던 요소라 같은 처방을 못 받았습니다.
 *
 * ── ⚠️ 쌍둥이가 하나 더 있습니다 ──────────────────────────────────────
 *   js/chart-oscillators.js 의 .tl-osc-label 이 ★글자까지 똑같습니다★.
 *   지금 화면에는 0개입니다(지표틀이 옛 칩을 걷어감). 그렇지만
 *   ★지표틀 초기화가 실패한 회원 브라우저에서는 되살아나 똑같이 밀립니다.★
 *   그래서 둘 다 봅니다.
 *
 * ── 무엇을 못 박는가 ──────────────────────────────────────────────────
 *   [1] 두 이름표 모두 오른쪽 끝(right)과 overflow:hidden 이 있다
 *   [2] ★글씨로 풀지 않았다★ — 17px 그대로다 (대표가 네 번 말씀하신 것)
 *   [3] positionPaneLabels 가 ★그림 영역(가운데 td)★ 폭을 읽어 max-width 를 넣는다
 *   [4] 왼쪽 여백 상수가 CSS 와 짝이 맞는다 (한쪽만 바뀌면 조용히 어긋납니다)
 *   [5] 돌연변이 — 이 검사가 진짜로 잡는지
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 에서 이 파일 줄을 지우고 이 파일을 지웁니다.
 *
 * 서버도 브라우저도 안 부릅니다. 소스 글자만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

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

const 글씨단위 = require("./_font-size.js");

const KIT = 읽기("js/chart-indicator-kit.js");
const OSC = 읽기("js/chart-oscillators.js");

/* 규칙 한 덩어리를 잘라냅니다. CSS 가 "..." + 색 + "..." 로 쪼개져 있어
   }" 까지 잘라서 봅니다. */
const 닫기 = String.fromCharCode(125, 34); /* }" */
function 규칙(SRC, 선택자) {
  const i = SRC.indexOf(선택자 + "{");
  if (i < 0) return null;
  const j = SRC.indexOf(닫기, i);
  return j > i ? SRC.slice(i, j) : null;
}

console.log("==========================================================");
console.log(" 칸 이름표 — 문서를 안 밀고 가격축을 안 덮는다 (2026-09-03 22차)");
console.log("==========================================================");

/* ===================================================================== */
절("[1] 두 이름표 모두 ★오른쪽 끝★ 이 있는가");
const 이름표들 = [
  ["js/chart-indicator-kit.js", KIT, ".tl-kit-plabel", "지표틀 칸 이름표 (지금 쓰는 것)"],
  ["js/chart-oscillators.js", OSC, ".tl-osc-label", "옛 오실레이터 칸 이름표 (잠들어 있는 쌍둥이)"]
];
이름표들.forEach(function (행) {
  const 파일 = 행[0], SRC = 행[1], sel = 행[2], 무엇 = 행[3];
  const r = 규칙(SRC, sel);
  ok(무엇 + " 규칙을 찾았다 (" + sel + ")", !!r, "선택자가 바뀌었나요?");
  if (!r) return;
  ok(sel + " 에 position:absolute 가 있다 (이게 있어야 이 고장이 납니다)",
    r.indexOf("position:absolute") >= 0, "없습니다");
  ok(sel + " 에 ★right 가 있다★ — 없으면 상자가 글자 길이 그대로 늘어납니다",
    /(^|[;{"])right:/.test(r),
    "★고치기 전 상태입니다.★ 360 원화에서 문서가 31px 옆으로 밀립니다");
  ok(sel + " 에 overflow:hidden 이 있다 — right 만 주면 여전히 삐져나갑니다",
    r.indexOf("overflow:hidden") >= 0, "없습니다");
  ok(sel + " 에 text-overflow:ellipsis 가 있다 — 잘린 것을 … 로 알려줍니다",
    r.indexOf("text-overflow:ellipsis") >= 0,
    "없으면 그냥 뚝 끊겨서 회원이 잘린 줄 모릅니다");
  ok(sel + " 에 white-space:nowrap 이 남아 있다",
    r.indexOf("white-space:nowrap") >= 0,
    "지표 이름에 띄어쓰기가 없어 nowrap 을 풀어도 안 접힙니다 — 푸는 것은 답이 아닙니다");
});

/* ===================================================================== */
절("[2] ★글씨로 풀지 않았는가★ — 대표가 네 번 말씀하신 17px");
{
  const 바닥 = 17;
  이름표들.forEach(function (행) {
    const SRC = 행[1], sel = 행[2];
    const r = 규칙(SRC, sel);
    if (!r) return;
    const m = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(r);
    ok(sel + " 글씨가 " + 바닥 + "px 이상이다",
      !!m && Number(m[1]) >= 바닥,
      m ? "지금 " + m[1] + "px — ★안 들어간다고 줄이면 안 됩니다★" : "font-size 가 없습니다");
  });
}

/* ===================================================================== */
절("[3] 그림 영역(가운데 td) 폭을 읽어 max-width 를 넣는가");
{
  /* 이름표는 .chart-wrap(그림 + 가격축 전체) 안에 있습니다.
     right 만으로는 「차트 칸 밖으로 안 나간다」 까지고,
     「가격축을 안 덮는다」 는 가운데 td 를 읽어야 압니다. */
  const i = KIT.indexOf("function positionPaneLabels(");
  ok("positionPaneLabels 를 찾았다", i >= 0, "이름이 바뀌었나요?");
  const 몸 = i >= 0 ? KIT.slice(i, i + 3000) : "";
  ok("가운데 칸(children[1])을 읽는다 — 세 칸 중 가운데가 그림 영역입니다",
    /children\s*&&\s*rows\[idx\]\.children\[1\]/.test(몸) || /children\[1\]/.test(몸),
    "안 읽으면 이름표가 가격축 위로 올라탑니다 (360 원화에서 140px 올라탔습니다)");
  ok("max-width 를 넣는다", /style\.maxWidth\s*=/.test(몸), "없습니다");
  ok("세로 자리(top)도 그대로 잡는다 (원래 있던 것을 안 지웠다)",
    /style\.top\s*=/.test(몸), "없어졌습니다");
  ok("wr.left 를 기준으로 옮겨 쓴다 (화면 좌표를 차트 칸 좌표로)",
    /wr\.left/.test(몸), "안 빼면 스크롤·여백만큼 어긋납니다");
}

/* ===================================================================== */
절("[4] 왼쪽 여백 상수가 CSS 와 짝이 맞는가");
{
  /* PLABEL_LEFT 는 CSS 의 left 값과 같아야 합니다.
     한쪽만 바꾸면 이름표가 그림 영역보다 그만큼 더 나가거나 덜 나갑니다 —
     ★오류도 안 나고 화면도 멀쩡한 조용한 어긋남★ 입니다. */
  const m상수 = /var\s+PLABEL_LEFT\s*=\s*(\d+)\s*;/.exec(KIT);
  ok("PLABEL_LEFT 상수가 있다", !!m상수, "positionPaneLabels 가 쓰는 값입니다");
  const r = 규칙(KIT, ".tl-kit-plabel");
  const mCss = r ? /(?:^|[;{"])left:\s*(\d+)px/.exec(r) : null;
  ok("CSS 의 left 값을 읽었다", !!mCss, "left 가 없어졌습니다");
  if (m상수 && mCss) {
    ok("PLABEL_LEFT(" + m상수[1] + ") 와 CSS left(" + mCss[1] + ") 가 같다",
      Number(m상수[1]) === Number(mCss[1]),
      "★한쪽만 바뀌었습니다.★ 이름표가 그림 영역 경계와 어긋납니다");
  }
  ok("PLABEL_MIN_W 가 있다 — 아주 좁아도 ★글씨는 안 줄입니다★",
    /var\s+PLABEL_MIN_W\s*=\s*\d+\s*;/.test(KIT), "없습니다");
}

/* ===================================================================== */
절("[5] 돌연변이 — 이 검사가 진짜로 잡는가");
{
  /* right 를 지운 사본을 만들어 [1] 이 잡는지 봅니다.
     ★진짜 파일은 안 건드립니다 — 문자열 사본입니다.★ */
  const 가짜 = KIT.replace("position:absolute;left:8px;right:8px;", "position:absolute;left:8px;");
  ok("사본이 실제로 달라졌다 (돌연변이가 헛돌지 않았다)", 가짜 !== KIT, "치환이 안 됐습니다");
  const r = 규칙(가짜, ".tl-kit-plabel");
  ok("right 를 지우면 [1] 이 잡는다", !!r && !/(^|[;{"])right:/.test(r),
    "★못 잡습니다 — 검사가 헛돕니다★");

  const 가짜2 = KIT.replace("style.maxWidth =", "style.__maxWidth =");
  ok("max-width 를 지우면 [3] 이 잡는다",
    가짜2 !== KIT && !/style\.maxWidth\s*=/.test(가짜2.slice(가짜2.indexOf("function positionPaneLabels("))),
    "못 잡습니다");
}

/* ===================================================================== */
절("[6] 등록 — npm test 로 실제로 돌아가는가");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-pane-label-fit.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}


/* ===================================================================== */
절("[7] ★px 말고 다른 단위로 우회하지 않았는가★");
{
/* ⚠️ 2026-09-04 기록팀 — ★이 파일의 글씨 검사들이 px 라고 적힌 것만 셌습니다.★
     1.0625rem(=17px) · 1em · 120% · 13pt · 4vw · calc() · clamp() 로 적으면
     바닥값 검사를 통째로 빠져나갑니다. 대표가 글씨 크기로 네 번 지적하신 자리입니다.

     ★실측 (2026-09-04, 사본에서 · 진짜 파일은 안 건드렸습니다)★
       js/chart-indicator-kit.js 사본의 .tl-kit-btn 맨 앞에
           font-size:clamp(11px, 2vw, 17px)   ← 360 에서는 11px 로 그려집니다
       를 끼웠더니, 옛 검사는 ★옆 규칙의 17px 을 대신 읽어★ "17px" 이라 보고하고
       그대로 초록이었습니다. 0.6875rem(=11px) 도 똑같이 17 로 읽혔습니다.
       17px 미만 개수 검사도 원본 0 · clamp 사본 0 · rem 사본 0 으로 같았습니다.

     ★환산이 아니라 "px 로만 적어라" 로 못 박은 이유★ — rem·em·%·vw·ch·clamp 는
     화면·부모·글꼴·회원 브라우저 설정에 따라 달라져 정적으로 px 을 못 냅니다.
     우리 규칙은 ★가장 좁은 360 에서도 17px★ 이라, 좁아지면 작아지는 표기는
     애초에 쓰면 안 되는 것입니다. 자세한 근거는 tests/_font-size.js 머리말.

     판정은 tests/_font-size.js 한 곳에만 있습니다. 아래 자체검증 줄을 같이 두어,
     그 한 곳을 헐겁게 고쳐 봉인 9개를 한꺼번에 눈멀게 하는 것을 막습니다. */
  const 검 = 글씨단위.자체검증();
  ok("단위 판정기가 표본 " + 검.표본수 + "개를 다 맞춘다 (tests/_font-size.js)",
    검.전부통과, 검.설명);

  [["js/chart-indicator-kit.js", KIT], ["js/chart-oscillators.js", OSC]].forEach(function (행) {
    const 위반 = 글씨단위.단위위반(행[1]);
    ok(행[0].replace("js/", "") + " 의 font-size 를 px 로만 적었다",
      위반.length === 0, 글씨단위.요약(위반));
  });
  const 선언수 = 글씨단위.선언들(KIT).length + 글씨단위.선언들(OSC).length;
  ok("두 파일에서 font-size 선언을 4개 이상 읽었다 (" + 선언수 + "개)", 선언수 >= 4);
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
