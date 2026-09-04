/* tests/chart-indicator-picker.test.js
 * =========================================================================
 * 봉인 — 지표 고르는 창(js/chart-indicator-picker.js)
 * =========================================================================
 * 2026-09-03 · 차트팀
 *
 * 대표 지시 — "지표 누르면 이런식으로 창이 뜨게해줘 아니 트레이딩뷰랑 똑같이
 * 가자니까 왜 맘대로하는거야 직접 트레이딩뷰 들어가서 실측해서 만들어"
 *
 * ── 이 봉인이 지키는 것 ─────────────────────────────────────────────────
 *   [1] 파일이 실제로 있고 index.html 이 부르고 ★git 에도 있다★
 *       (디스크엔 있는데 커밋엔 없는 조용한 고장 — CLAUDE.md 에 세 번 났다고 적힌 것)
 *   [2] ★글씨 바닥값 17px★ — 대표가 네 번 말씀하신 것. 하나라도 미만이면 빨개집니다
 *   [3] ★확정 팔레트 밖 색을 안 쓴다★ — 트레이딩뷰 색을 베끼지 않았는지
 *   [4] ★폰 하단 매수·매도 바(.tl-order-bar) 를 본다★
 *       2026-09-03 에 지표 설정판이 이것 때문에 P1 이었습니다. 같은 자리입니다
 *   [5] ★옛 메뉴 파일을 안 고쳤다★ — 감싸기만 했는지
 *   [6] 되돌리는 길(restore)이 실제로 있다
 *   [7] 지표 이름을 ★두 벌로 안 적었다★ — 틀(listDefs)에서 읽는지
 *
 * ⚠️ 줄 번호나 그때그때의 지표 개수를 박지 않습니다. 차트팀이 지표를 계속
 *    늘리는 중이라 숫자를 박으면 다음 주에 거짓말이 됩니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SRC = "js/chart-indicator-picker.js";

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m✓" + ESC + "[0m";
const NGM = ESC + "[31m✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + OKM + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function 절(t) {
  console.log("\n" + t);
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch (e) {
    return null;
  }
}

/** 주석을 지운 소스. 주석에 적어 둔 예시 때문에 오탐이 나지 않게.
 *  (tests/chart-popup-floor-census.test.js 가 같은 이유로 같은 일을 합니다) */
function 주석뺀(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

console.log("\n지표 고르는 창 봉인 (트레이딩뷰 실측 이식)");

const src = read(SRC);
const html = read("index.html");
const 알맹이 = src ? 주석뺀(src) : "";

/* =======================================================================
 * [1] 있는가 · 불리는가 · git 에 있는가
 * ===================================================================== */
절("[1] 파일 · index.html · git");
{
  ok("js/chart-indicator-picker.js 가 있다", !!src);
  ok("index.html 이 이 파일을 부른다", !!html && html.indexOf(SRC) >= 0);

  /* ⚠️ fs.existsSync 로는 못 잡습니다 — git ls-files 로 봐야 합니다.
     "내 컴퓨터엔 있는데 clone 한 PC 에선 빈 링크" 가 이 프로젝트에서 세 번 났습니다. */
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", SRC], { cwd: REPO, encoding: "utf8" }).trim();
  } catch (e) {
    tracked = "";
  }
  ok("git 에도 올라와 있다 (clone 한 PC 에서 빈 링크가 안 되게)", tracked === SRC,
    tracked ? "git 이 돌려준 값: " + tracked : "git ls-files 가 비었습니다 — 아직 add 안 된 상태일 수 있습니다");

  /* 실리는 순서 — 틀과 옛 메뉴보다 ★뒤★ 여야 감쌀 대상이 이미 있습니다 */
  if (html) {
    const iP = html.indexOf(SRC);
    const iMenu = html.indexOf("js/chart-indicator-menu.js");
    const iKit = html.indexOf("js/chart-indicator-kit.js");
    ok("옛 메뉴(chart-indicator-menu.js)보다 뒤에 실린다", iMenu >= 0 && iP > iMenu,
      "menu=" + iMenu + " picker=" + iP);
    ok("틀(chart-indicator-kit.js)보다 뒤에 실린다", iKit >= 0 && iP > iKit,
      "kit=" + iKit + " picker=" + iP);
  }
}

/* =======================================================================
 * [2] ★글씨 바닥값 17px★ — 대표가 네 번 말씀하신 것
 *
 * 트레이딩뷰가 14px 인 자리도 우리는 17px 이 바닥입니다.
 * "트레이딩뷰가 13px 니까 13px" 로 되돌리는 순간 빨개집니다.
 * ===================================================================== */
절("[2] ★팝업 글씨 바닥값 17px★ (한도 0)");
{
  const 바닥 = 17;
  const 작은것 = [];
  const re = /font-size:\s*([0-9.]+)px/g;
  let m;
  while ((m = re.exec(알맹이)) !== null) {
    const v = parseFloat(m[1]);
    if (v < 바닥) 작은것.push(v + "px");
  }
  ok("17px 미만 font-size 가 하나도 없다", 작은것.length === 0,
    작은것.length ? "찾은 것: " + 작은것.join(" · ") : "");

  /* 실제로 쓰는 크기가 무엇인지 눈에 보이게 남깁니다 */
  const 크기 = [...new Set((알맹이.match(/font-size:\s*[0-9.]+px/g) || [])
    .map((s) => s.replace(/\s+/g, "")))].sort();
  console.log("      쓰는 크기 — " + (크기.join(" · ") || "(없음)"));

  /* 돌연변이 — 일부러 16px 을 끼워 넣으면 위 검사가 터지는가 */
  const 가짜 = 알맹이 + '".tl-ipick-x{font-size:16px;}"';
  let 가짜작은 = 0;
  const re2 = /font-size:\s*([0-9.]+)px/g;
  let m2;
  while ((m2 = re2.exec(가짜)) !== null) if (parseFloat(m2[1]) < 바닥) 가짜작은++;
  ok("★돌연변이★ 16px 을 끼우면 [2] 가 잡는다", 가짜작은 === 1, "잡은 개수 " + 가짜작은);
}

/* =======================================================================
 * [3] 확정 팔레트 — 트레이딩뷰 색을 베끼지 않았는가
 *
 * ⚠️ 2026-09-04 · 감사팀이 구멍을 찾아와 기록팀이 다시 썼습니다.
 *
 *    그전 검사는 정규식 하나뿐이었습니다 —  /#[0-9A-Fa-f]{6}\b/
 *    즉 ★색★ 이 아니라 ★여섯 글자★ 를 보고 있었습니다.
 *    감사팀이 사본에 넣어 ★초록으로 통과시킨 것★ (실측):
 *        var x = "rgb(91,156,246)";   ← 트레이딩뷰 링크색 #5B9CF6 과 같은 색
 *        var y = "#5AF";              ← 3자리, #55AAFF. 역시 팔레트 밖
 *    같은 색을 6자리로 적으면 빨간색 + 종료코드 1 로 제대로 잡혔습니다.
 *    ★표기만 바꾸면 지나가던 것입니다.★
 *
 * ── 왜 정규식을 늘리지 않고 "정규화" 로 갔나 ─────────────────────────────
 *    정규식을 늘리면 표기가 하나 늘 때마다 구멍이 하나 생깁니다.
 *    (3자리 · 4자리 · 8자리 · rgb · rgba · hsl · hsla · 공백 구분 · 슬래시
 *     알파 · deg/turn/rad · % 성분 … 이미 열 가지가 넘습니다)
 *    그래서 어떤 표기로 적혀 있든 ★#RRGGBB 한 모양으로 바꾼 뒤★ 팔레트와
 *    맞춥니다. 표기가 새로 생겨도 색뽑기() 한 곳만 고치면 됩니다.
 *
 *    · 투명도(알파)는 떼고 봅니다 — #5B9CF6FF 도 #5B9CF6 도 같은 색을 칠합니다.
 *      알파를 붙였다고 봐주면 다시 글자 검사로 돌아갑니다.
 *      단 ★알파가 0 이면 아무것도 안 칠하므로 세지 않습니다★ (rgba(0,0,0,0)).
 *    · 예외는 ★하나★ 입니다 — 카드 위쪽 흰색 3% 얇은 선(box-shadow inset).
 *      CLAUDE.md 확정 팔레트 항목이 "그림자 대신 이것만" 이라고 정해 둔 것이고,
 *      이 소스도 242줄에서 실제로 씁니다. 예외 범위는 아래 네 줄로 못 박았습니다
 *    · 못 알아본 토큰은 버립니다 — querySelector("#tl-ipick") 같은 것이
 *      색으로 잡히면 안 되기 때문입니다. 16진수 글자로만 이뤄진 3·4·6·8자리만 색으로 봅니다.
 *
 * ── 아직 못 잡는 것 (다음 사람에게) ─────────────────────────────────────
 *    · 이름색(red · dodgerblue) → 아래 ②에서 CSS 값 자리만 따로 봅니다
 *    · 값을 계산으로 만드는 것 ("#" + a + b, String.fromCharCode…) → 못 잡습니다
 *      정적 검사로는 한계입니다. 그건 눈으로 보는 수밖에 없습니다
 * ===================================================================== */
절("[3] 확정 팔레트 밖 색 금지 (표기가 달라도 잡는다)");
{
  const 팔레트 = [
    "#0A0F1C", "#101727", "#0D1422", "#1D273B",
    "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"
  ];

  const 클램프 = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const 두자리 = (v) => (v < 16 ? "0" : "") + v.toString(16).toUpperCase();
  const 묶기 = (r, g, b) => "#" + 두자리(클램프(r)) + 두자리(클램프(g)) + 두자리(클램프(b));

  /** "128" · "50%" 를 0~255 로 */
  function 성분(s) {
    s = String(s).trim();
    if (s.slice(-1) === "%") return (parseFloat(s) * 255) / 100;
    return parseFloat(s);
  }
  /** "214.8" · "214.8deg" · "0.6turn" · "3.7rad" · "238grad" 를 도(°)로 */
  function 각도(s) {
    s = String(s).trim().toLowerCase();
    const v = parseFloat(s);
    if (s.indexOf("turn") >= 0) return v * 360;
    if (s.indexOf("grad") >= 0) return v * 0.9;
    if (s.indexOf("rad") >= 0) return (v * 180) / Math.PI;
    return v; /* deg 또는 단위 없음 */
  }
  /** hsl → rgb (CSS 표준 식 그대로) */
  function hslRGB(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = s / 100;
    l = l / 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; } else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
    return 묶기((r + m) * 255, (g + m) * 255, (b + m) * 255);
  }

  /** 이름색 — 전부는 아니고 ★어두운 배경에서 실제로 쓰고 싶어질 만한 것★ 만.
   *  148개를 다 적으면 "black" 같은 흔한 낱말이 코드에 섞여 오탐이 납니다.
   *  그래서 ②에서 ★CSS 값 자리★ 에 붙은 것만 봅니다. */
  const 이름색 = {
    red: "#FF0000", blue: "#0000FF", green: "#008000", lime: "#00FF00",
    orange: "#FFA500", gold: "#FFD700", yellow: "#FFFF00", cyan: "#00FFFF",
    aqua: "#00FFFF", magenta: "#FF00FF", fuchsia: "#FF00FF", purple: "#800080",
    violet: "#EE82EE", pink: "#FFC0CB", teal: "#008080", navy: "#000080",
    white: "#FFFFFF", black: "#000000", gray: "#808080", grey: "#808080",
    silver: "#C0C0C0", dodgerblue: "#1E90FF", royalblue: "#4169E1",
    cornflowerblue: "#6495ED", deepskyblue: "#00BFFF", steelblue: "#4682B4",
    crimson: "#DC143C", tomato: "#FF6347", coral: "#FF7F50",
    seagreen: "#2E8B57", limegreen: "#32CD32", darkorange: "#FF8C00"
  };
  /* 색이 아닌 CSS 값 — 여기 있는 것은 그냥 넘어갑니다 */
  const 색아님 = ["transparent", "none", "inherit", "initial", "unset", "currentcolor", "auto"];

  /** 소스에서 색을 전부 뽑아 {표기, 값} 으로 돌려줍니다. 값은 늘 #RRGGBB 입니다. */
  function 색뽑기(text) {
    const out = [];
    let m;

    /* ① # 표기 — 3 · 4 · 6 · 8 자리.
       토큰을 ★통째로★ 떼어 길이를 봅니다. {6} 만 보면 #5AF 가 지나갑니다.
       (querySelector("#tl-ipick") 처럼 16진수가 아닌 글자가 섞이면 버립니다) */
    const hre = /#([0-9A-Za-z_-]*)/g;
    while ((m = hre.exec(text)) !== null) {
      const t = m[1];
      if (!t || !/^[0-9A-Fa-f]+$/.test(t)) continue;
      if (t.length === 3 || t.length === 4) {
        out.push({
          표기: m[0],
          값: 묶기(parseInt(t[0] + t[0], 16), parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16))
        });
      } else if (t.length === 6 || t.length === 8) {
        out.push({
          표기: m[0],
          값: 묶기(parseInt(t.slice(0, 2), 16), parseInt(t.slice(2, 4), 16), parseInt(t.slice(4, 6), 16))
        });
      }
    }

    /* ② rgb() rgba() hsl() hsla() — 쉼표든 공백이든 슬래시든, 대문자든 소문자든 */
    const fre = /\b(rgba?|hsla?)\s*\(([^()]*)\)/gi;
    while ((m = fre.exec(text)) !== null) {
      const 이름 = m[1].toLowerCase();
      const 인자 = m[2].split(/[\s,/]+/).map((s) => s.trim()).filter((s) => s.length);
      if (인자.length < 3) continue;
      if (인자.length >= 4) {
        /* 알파 0 이면 아무것도 안 칠합니다 — 색으로 세지 않습니다 */
        const a = 인자[3].slice(-1) === "%" ? parseFloat(인자[3]) / 100 : parseFloat(인자[3]);
        if (a === 0) continue;
      }
      /* ★얇은 흰 선 예외★ — CLAUDE.md 확정 팔레트 항목:
         "그림자를 쓰지 않습니다. 대신 카드 위쪽에 흰색 3% 얇은 선(inset)만 넣습니다"
         이건 팔레트 위반이 아니라 ★프로젝트가 정해 둔 카드 윗선★ 입니다.
         범위를 좁게 둡니다 — 흰색이고 · 알파 6% 이하이고 · box-shadow inset 일 때만.
         color:rgba(255,255,255,.03) 처럼 다른 자리에 쓰면 그대로 빨개집니다. */
      const 앞 = text.slice(Math.max(0, m.index - 80), m.index);
      const 흰 = 성분(인자[0]) === 255 && 성분(인자[1]) === 255 && 성분(인자[2]) === 255;
      const 알파 = 인자.length >= 4
        ? (인자[3].slice(-1) === "%" ? parseFloat(인자[3]) / 100 : parseFloat(인자[3]))
        : 1;
      if (이름 === "rgba" && 흰 && 알파 <= 0.06 && /box-shadow[^;{}]*inset/.test(앞)) continue;

      if (이름[0] === "r") {
        out.push({ 표기: m[0], 값: 묶기(성분(인자[0]), 성분(인자[1]), 성분(인자[2])) });
      } else {
        out.push({ 표기: m[0], 값: hslRGB(각도(인자[0]), parseFloat(인자[1]), parseFloat(인자[2])) });
      }
    }

    /* ③ 이름색 — ★CSS 값 자리에 붙은 것만★ 봅니다.
       코드 어디에나 있는 "red" 라는 낱말까지 잡으면 오탐이 납니다. */
    const nre = /(?:^|[;{"'\s])(?:color|background|background-color|border-color|border-top-color|border-bottom-color|border-left-color|border-right-color|fill|stroke|outline-color|caret-color)\s*:\s*([A-Za-z]+)/g;
    while ((m = nre.exec(text)) !== null) {
      const w = m[1].toLowerCase();
      if (색아님.indexOf(w) >= 0) continue;
      if (이름색[w]) out.push({ 표기: m[1], 값: 이름색[w] });
    }
    return out;
  }

  const 뽑힘 = 색뽑기(알맹이);
  const 쓴색 = [...new Set(뽑힘.map((c) => c.값))];
  const 밖 = 쓴색.filter((c) => 팔레트.indexOf(c) < 0);
  ok("확정 팔레트 9색 밖의 색을 안 쓴다", 밖.length === 0,
    밖.map((c) => c + " (원문: " +
      [...new Set(뽑힘.filter((x) => x.값 === c).map((x) => x.표기))].join(" · ") + ")").join(" / "));
  console.log("      쓰는 색 — " + (쓴색.join(" ") || "(없음)"));

  /* 트레이딩뷰가 실제로 쓰던 값이 그대로 들어오면 바로 잡습니다.
     실측(2026-09-03) — 피봇선 #FB8C00 · 파란 작성자 링크 계열 #2962FF
     #5B9CF6 은 2026-09-04 감사팀이 우회에 쓴 링크색입니다.
     ★이제는 글자가 아니라 정규화한 값으로 봅니다★ — rgb() 로 적어도 잡힙니다. */
  const 쓴색집합 = new Set(쓴색);
  ["#FB8C00", "#2962FF", "#089981", "#F23645", "#5B9CF6"].forEach((c) => {
    ok("트레이딩뷰 색 " + c + " 을 안 베꼈다 (어떤 표기로 적어도)", !쓴색집합.has(c));
  });

  /* ── ★돌연변이 자체검증★ ───────────────────────────────────────────────
     아래 표기를 실제로 넣어 보고 ① 같은 색으로 정규화되는지 ② 팔레트 밖으로
     잡히는지 둘 다 봅니다. 하나라도 놓치면 이 봉인은 그 표기에 대해
     ★아무것도 지키지 않는 것★ 입니다.
     2026-09-04 이전 봉인은 첫 줄(6자리) 하나만 잡고 나머지를 전부 놓쳤습니다. */
  const 밖인가 = (글자) => 색뽑기(글자).map((c) => c.값).filter((v) => 팔레트.indexOf(v) < 0).length > 0;
  const 파랑표기 = [
    ['"#5B9CF6"', "6자리 (옛 봉인도 잡던 것)"],
    ['"#5b9cf6"', "소문자"],
    ['"#5B9CF6FF"', "8자리 · 알파 붙임"],
    ['"rgb(91,156,246)"', "rgb — ★감사팀이 통과시킨 그 줄★"],
    ['"RGB( 91 , 156 , 246 )"', "대문자 + 공백 낀 것"],
    ['"rgba(91,156,246,.8)"', "rgba"],
    ['"rgb(91 156 246)"', "공백 구분 (요즘 표기)"],
    ['"rgb(35.7%,61.2%,96.5%)"', "% 성분"],
    ['"hsl(214.8,89.6%,66.1%)"', "hsl"],
    ['"hsla(214.8deg 89.6% 66.1% / 80%)"', "hsla + deg + 슬래시"]
  ];
  파랑표기.forEach((p) => {
    const 값 = 색뽑기(p[0]).map((c) => c.값);
    ok("★돌연변이★ " + p[1] + " → #5B9CF6 으로 잡는다", 값.indexOf("#5B9CF6") >= 0,
      "잡은 값: " + (값.join(",") || "(하나도 못 잡았습니다 — 이 표기는 무방비입니다)"));
  });
  ok("★돌연변이★ 3자리 " + '"#5AF"' + " 가 #55AAFF 로 잡히고 팔레트 밖이다",
    색뽑기('"#5AF"').map((c) => c.값).indexOf("#55AAFF") >= 0 && 밖인가('"#5AF"'),
    "감사팀이 통과시킨 두 번째 줄입니다");
  ok("★돌연변이★ 이름색 " + '"color:dodgerblue"' + " 도 팔레트 밖으로 잡힌다",
    밖인가('a{color:dodgerblue;}'));
  ok("★돌연변이★ 거의 같은 색(hsl 반올림) 도 팔레트 밖으로 잡힌다",
    밖인가('"hsl(215,90%,66%)"'));

  /* 반대쪽 — 팔레트 색과 색 아닌 것에 ★거짓 경보★ 가 안 나야 합니다.
     오탐이 나면 다음 사람이 봉인을 통째로 꺼버립니다. */
  ok("(오탐) 팔레트 색은 어떤 표기로 적어도 통과한다",
    !밖인가('"#0A0F1C" "#0a0f1c" "rgb(10,15,28)" "#101727FF"'));
  ok("(오탐) id 선택자 · transparent 는 색으로 안 센다",
    색뽑기('querySelector("#tl-ipick-wrap"); "background:transparent;"').length === 0);
  ok("(오탐) 알파 0 은 아무것도 안 칠하므로 안 센다",
    색뽑기('"background:rgba(0,0,0,0);"').length === 0);

  /* ── 얇은 흰 선(inset) 예외의 ★경계★ ────────────────────────────────────
     CLAUDE.md 가 허락한 것은 "카드 위쪽 흰색 3% 얇은 선(inset)" 하나뿐입니다.
     예외가 넓어지면 rgba 가 통째로 자유통행증이 됩니다. 네 줄로 못 박습니다. */
  ok("(예외) 카드 윗선 box-shadow:inset 흰색 3% 는 통과한다",
    !밖인가('.c{box-shadow:inset 0 1px 0 rgba(255,255,255,.03);}'),
    "CLAUDE.md 확정 팔레트 항목이 허락한 유일한 흰색입니다");
  ok("★돌연변이★ 같은 흰색이라도 box-shadow 가 아니면 잡는다",
    밖인가('.c{color:rgba(255,255,255,.03);}'));
  ok("★돌연변이★ box-shadow inset 이라도 흰색이 아니면 잡는다",
    밖인가('.c{box-shadow:inset 0 1px 0 rgba(91,156,246,.03);}'));
  ok("★돌연변이★ box-shadow inset 흰색이라도 진하면(50%) 잡는다",
    밖인가('.c{box-shadow:inset 0 1px 0 rgba(255,255,255,.5);}'));
}

/* =======================================================================
 * [4] ★폰 하단 매수·매도 바를 본다★
 *
 * 2026-09-03 P1 — 지표 설정판의 단추줄이 통째로 바 밑에 깔려
 * "확인" 을 눌렀다고 믿는데 ★매도/숏 주문창★ 이 열렸습니다. 같은 자리입니다.
 * ===================================================================== */
절("[4] 폰 하단 매수·매도 바(.tl-order-bar) 밑으로 안 내려간다");
{
  ok("소스가 .tl-order-bar 를 실제로 본다", 알맹이.indexOf(".tl-order-bar") >= 0);
  ok("화면 높이(innerHeight)를 기준으로 잰다", /innerHeight/.test(알맹이));
  ok("바가 display:none 이면 안 센다", /display\s*===?\s*["']none["']/.test(알맹이));
  ok("전체화면일 때는 바를 안 센다", /fullscreen/i.test(알맹이));
  ok("잰 값으로 ★키(height)까지★ 줄인다 (자리만 밀면 안쪽이 잘립니다)",
    /Math\.min\(\s*H\s*,/.test(알맹이) || /Math\.min\(H,/.test(알맹이));
}

/* =======================================================================
 * [5] 옛 메뉴 · 수정 금지 파일을 안 고쳤는가
 * ===================================================================== */
절("[5] 감싸기만 했는가 (옛 파일 무수정)");
{
  ok("옛 메뉴의 open 을 감싼다", /ChartIndicatorMenu/.test(알맹이) && /prevOpen/.test(알맹이));
  ok("옛 메뉴의 toggle 을 감싼다", /prevToggle/.test(알맹이));

  /* 이 파일이 옛 메뉴나 chart.js 를 직접 고치는 코드를 들고 있지 않은지 */
  ok("js/chart.js 를 건드리는 코드가 없다", 알맹이.indexOf("js/chart.js") < 0);

  /* 옛 메뉴 파일이 이 작업으로 바뀌지 않았는지 — 그 파일의 공개 API 가 그대로인지 */
  const menu = read("js/chart-indicator-menu.js");
  ok("옛 메뉴 파일이 아직 open/close/toggle 을 그대로 내준다",
    !!menu && /open:\s*open/.test(menu) && /toggle:\s*toggle/.test(menu));
  ok("옛 메뉴 파일에 picker 를 부르는 줄이 새로 안 생겼다",
    !!menu && menu.indexOf("ChartIndicatorPicker") < 0);
}

/* =======================================================================
 * [6] 되돌리는 길
 * ===================================================================== */
절("[6] 되돌리기");
{
  ok("restore() 를 내준다", /restore:\s*restore/.test(알맹이));
  ok("restore 가 옛 open 을 되돌려 놓는다", /M\.open\s*=\s*prevOpen/.test(알맹이));
  ok("restore 가 옛 toggle 을 되돌려 놓는다", /M\.toggle\s*=\s*prevToggle/.test(알맹이));
  ok("되돌리는 방법이 파일 맨 위에 적혀 있다",
    !!src && src.indexOf("되돌리기") >= 0 && src.indexOf("restore()") >= 0);
}

/* =======================================================================
 * [7] 지표 이름을 ★두 벌로 안 적었는가★
 *
 * 이 프로젝트가 여러 번 당한 모양입니다 — 같은 값이 두 곳에 생기면
 * 한쪽만 고쳐져서 어느 쪽이 사실인지 알 수 없게 됩니다.
 * ===================================================================== */
절("[7] 지표 이름을 두 벌로 안 적었는가");
{
  ok("틀(listDefs)에서 읽는다", /listDefs\s*\(/.test(알맹이));

  /* 틀에 있는 정의 이름이 이 파일에 글자로 박혀 있으면 두 벌입니다.
     ★목록은 틀에서 그때그때 가져옵니다★ — 여기서 세지 않습니다. */
  const kit = read("js/chart-indicator-kit.js");
  const 이름들 = [...new Set(
    [...(kit || "").matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((m) => m[1])
  )];
  const 박힌것 = 이름들.filter((n) => {
    if (n.length < 3) return false; /* MA · CCI 같은 두세 글자는 우연히 겹칩니다 */
    return 알맹이.indexOf('"' + n + '"') >= 0;
  });
  ok("지표 이름이 이 파일에 글자로 안 박혀 있다", 박힌것.length === 0, 박힌것.join(" · "));
  console.log("      틀이 든 정의 이름 " + 이름들.length + "개를 그대로 읽습니다");

  ok("색도 틀이 고르게 맡긴다 (색 규칙을 두 벌로 안 만듦)",
    /createInstance\s*\(/.test(알맹이) && !/LINE_COLORS\s*=/.test(알맹이));
}

/* =======================================================================
 * [8] 검색 · 즐겨찾기가 실제로 있는가
 * ===================================================================== */
절("[8] 검색 · 즐겨찾기");
{
  ok("이름으로 거를 수 있다", /matches\s*\(/.test(알맹이) && /indexOf\(q\)/.test(알맹이));
  ok("설명·id 로도 걸린다", /d\.note/.test(알맹이) && /d\.id/.test(알맹이));
  ok("즐겨찾기를 App.Storage 로 저장한다", /App\.Storage/.test(알맹이));
  ok("저장소를 새로 만들지 않았다 (localStorage 직접 호출 없음)",
    알맹이.indexOf("localStorage") < 0);
  ok("우리에 데이터가 없는 칸(내 스크립트·에디터즈 픽 등)을 빈 채로 안 보여준다",
    알맹이.indexOf("내 스크립트") < 0 && 알맹이.indexOf("에디터즈") < 0);
}

/* =======================================================================
 * [9] 2026-09-03 손질 — 디자인팀이 트레이딩뷰를 재서 넘긴 것
 *
 * 이 절이 지키는 것은 "예쁘냐" 가 아니라 ★되돌아가지 않느냐★ 입니다.
 * 딤을 다시 넣거나, 폰에서 키보드를 다시 튀어나오게 하거나, 검색을 다시
 * 분류 안으로 가두면 여기서 빨개집니다.
 * ===================================================================== */
절("[9] 트레이딩뷰 실측 반영 (2026-09-03)");
{
  /* ① 뒤 배경 어둡게 하기(딤) — 트레이딩뷰는 α=0 입니다.
     실측 근거 — 창 밖 TL 로고 픽셀이 딤이 있을 때 rgb(7,64,90),
     없앤 뒤 rgb(1,191,250). 0.28*191 + 0.72*15 = 64.3 으로 α .72 와 딱 맞습니다. */
  const 딤 = 알맹이.match(/background:\s*rgba\([^)]*\)/g) || [];
  ok("덮개에 rgba 딤이 없다", 딤.length === 0, 딤.join(" · "));
  ok("덮개 배경이 transparent 다", 알맹이.replace(/\s/g, "").indexOf("background:transparent;}") >= 0);

  /* ★덮개 요소 자체는 남아야 합니다★ — 바깥 클릭으로 닫는 동작을 그것이 잡습니다 */
  ok("바깥을 누르면 닫는 동작이 살아 있다",
    /e\.target\s*===\s*wrap/.test(알맹이) && /mousedown/.test(알맹이));

  /* ④ 검색칸 자동 포커스 — ★768 이상에서만★ */
  ok("창을 열면 검색칸에 커서를 준다", /\.focus\(\)/.test(알맹이));
  ok("★768 미만에서는 커서를 안 준다★ (폰 키보드)",
    /vpW\(\)\s*>=\s*768/.test(알맹이),
    "폭 조건 없이 focus() 하면 360 에서 키보드가 화면 절반을 덮습니다");

  /* ⑤ 검색 하이라이트 — 굵기만. 색을 늘리지 않았는지 */
  ok("맞은 글자를 굵게 칠하는 자리가 있다", 알맹이.indexOf("tl-ipick-hit") >= 0);
  ok("굵기 600 이다", 알맹이.replace(/\s/g, "").indexOf(".tl-ipick-hit{font-weight:600;}") >= 0);
  {
    const hit = 알맹이.match(/\.tl-ipick-hit\{[^}]*\}/);
    ok("하이라이트에 ★색을 안 넣었다★ (파랑을 새로 만들지 않음)",
      !!hit && hit[0].indexOf("color") < 0, hit ? hit[0] : "규칙을 못 찾음");
  }
  ok("먼저 자르고 그 다음 escape 한다 (태그가 안 깨지게)", /esc\(t\.slice\(/.test(알맹이));

  /* ⑥ 검색은 왼쪽 분류를 무시한다 */
  ok("검색 중인지 판별하는 자리가 있다", /function searching\(\)/.test(알맹이));
  ok("★검색 중에는 분류(favs)로 안 거른다★",
    /!wide\s*&&\s*section\s*===\s*"favs"/.test(알맹이),
    "즐겨찾기를 고른 채 검색하면 즐겨찾기 밖 지표가 안 나옵니다");
  ok("검색 중에는 왼쪽 선택 표시가 해제된다",
    /!searching\(\)\s*&&\s*section\s*===\s*it\.key/.test(알맹이));

  /* ② ③ 크기 · 모서리 — 말없이 바뀌는 것을 잡습니다 */
  {
    const w = 알맹이.match(/var W = (\d+);/);
    const h = 알맹이.match(/var H = (\d+);/);
    ok("창 크기가 1020 x 775 그대로다 (실측으로 940x700 대신 고른 값)",
      !!w && !!h && w[1] === "1020" && h[1] === "775",
      (w ? w[1] : "?") + " x " + (h ? h[1] : "?"));
    const r = [...알맹이.matchAll(/border-radius:(\d+)px/g)].map((m) => parseInt(m[1], 10));
    const 넘는것 = r.filter((v) => v > 12);
    ok("모서리가 12px 를 안 넘는다 (표준 10 · 상한 12)", 넘는것.length === 0, 넘는것.join(","));
  }

  /* 768 실측 — 이름이 설명보다 먼저 잘리면 안 됩니다 */
  ok("이름 칸은 안 줄어든다 (설명이 먼저 줄어듦)",
    알맹이.indexOf(".tl-ipick-nm{flex:0 0 auto") >= 0,
    "768 에서 Ichimoku Cloud 가 133>120 으로 잘렸던 자리입니다");
}

/* ===================================================================== */
console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록");
  실패목록.forEach((s) => console.log("  · " + s));
  process.exit(1);
}

process.exit(0);
