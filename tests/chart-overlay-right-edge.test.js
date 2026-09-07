/* tests/chart-overlay-right-edge.test.js
 * =========================================================================
 * 봉인 — 차트 위에 얹는 절대배치 상자는 ★오른쪽 끝★ 이 있어야 한다
 *        (명단이 아니라 ★패턴으로 훑습니다★)
 * =========================================================================
 * 2026-09-07 · 기록팀. PM 배정.
 *
 * ── 왜 이 파일이 새로 필요했나 ────────────────────────────────────────
 *   2026-09-03 에 tests/chart-pane-label-fit.test.js 로 같은 병을 봉인했습니다.
 *   그런데 ★바로 다음 날 같은 병이 다시 났고, 그 봉인이 못 잡았습니다.★
 *
 *     2026-09-03  74aa5d2   봉인 생성 — 보는 파일을 ★두 개로 적어 둠★
 *                             js/chart-indicator-kit.js  (.tl-kit-plabel)
 *                             js/chart-oscillators.js    (.tl-osc-label)
 *     2026-09-04  d7bdc66   js/chart-ohlc-legend.js 의 .tl-ohlc 가
 *                           자기 줄 -> position:absolute 로 전향
 *                             ← ★그 두 개 명단에 못 들어갔습니다★
 *     2026-09-07            폰에서 십자선으로 봉을 짚으면 OHLC 줄이 가격축을
 *                           덮어 ₩120,900,000 이 ",900,000" 으로 읽힘 (P1)
 *
 *   옛 봉인은 "이런 패턴을 찾는" 검사가 아니라 ★"이 두 파일만 보는" 명단★ 이었습니다
 *   (그 파일 71-72줄 · 90-93줄). 명단은 ★만든 날 이후에 생긴 범인을 영원히 못 잡습니다.★
 *   tests/chart-ohlc-legend.test.js 도 right·overflow·max-width·가격축을
 *   ★한 번도 안 봅니다★ (2026-09-07 grep 0건).
 *
 *   그래서 이 파일은 ★파일 이름을 적지 않습니다.★
 *   js/chart-*.js 와 css/chart-*.css 를 폴더에서 그때그때 읽어
 *   ★position:absolute 인데 오른쪽 끝이 없는 규칙을 찾아냅니다.★
 *   새 파일·새 클래스가 생기면 아무도 등록하지 않아도 자동으로 걸립니다.
 *
 * ── 고장 원리 (2026-09-03 조사팀 실측 그대로) ─────────────────────────
 *   position:absolute 인 상자에 left 만 있고 right / max-width / width 가
 *   전부 없으면, 상자 폭이 ★내용 길이 그대로★ 무한정 늘어납니다.
 *   .chart-wrap 부터 <html> 까지 13개 요소의 overflow-x 가 전부 visible 이라
 *   늘어난 만큼 문서가 옆으로 밀리고, 가격축 위로도 그대로 올라탑니다.
 *     360 · 원화 실측 — 문서 넘침 31px · MACD 이름표 폭 368px(화면 360)
 *                       그림 영역을 140px 올라타 가격축 숫자를 덮음
 *
 * ── ⚠️ 이 병은 ★브라우저로 재면 안 됩니다★ (2026-09-07 조사팀 실측) ──
 *   overflow:hidden 이 걸린 뒤에는 글자 좌표로 침범을 못 잽니다.
 *     상자는 247 에서 잘렸는데 Range.getClientRects() 는 654 를 보고했습니다
 *     (침범 +404). ★화면은 멀쩡한데 검사만 빨개집니다.★
 *   그래서 이 봉인은 브라우저도 jsdom 도 쓰지 않고 ★소스 글자만★ 읽습니다.
 *   [6] 에서 그 사실 자체를 검사합니다.
 *
 * ── 무엇을 못 박는가 ──────────────────────────────────────────────────
 *   [1] 훑개가 살아 있는가 (파일을 폴더에서 자동 수집 · 규칙을 실제로 뽑는가)
 *   [2] ★명단이 아니다★ — 옛 봉인이 보던 2개를 포함해 전수로 넓혔는가
 *   [3] ★절대배치 + 왼쪽만 있고 오른쪽 끝이 없는 규칙이 0건인가★  ← 본 검사
 *   [4] 절대배치 + nowrap 인데 overflow 가 없는 규칙이 0건인가
 *   [5] 돌연변이 — 사본에 새 규칙을 심어 진짜 잡히는지 (★사본에서★)
 *   [6] 브라우저를 안 쓴다 (위 실측 때문에)
 *   [7] 가격축을 안 덮는 유일한 확실한 길이 살아 있는가 + 정적 right 현황
 *
 * ── ⚠️ [7] 을 ★합격/불합격으로 만들지 않은 이유★ (기록팀 판단) ────────
 *   PM 이 "정적 right 값을 박아둔 것도 잡아야 하는지 판단하라" 고 했습니다.
 *   조사팀 실측 — 가격축 폭이 ★네 가지★ 입니다.
 *       USDT ≤390  75px     KRW ≤390   93px
 *       USDT ≥768 131px     KRW ≥768  169px
 *   즉 정적 right 하나로는 네 경우를 다 막을 수 없고, 확실한 길은
 *   ★JS 가 그림 영역(가운데 td) 폭을 읽어 max-width 를 넣는 것★ 하나뿐입니다.
 *
 *   그런데 "정적 right < 169 면 실패" 로 못 박으면 오늘 당장 ★세 곳★ 이 빨개집니다.
 *       .tl-ind-bar    right:138px (base) / 82px (max-width:900px)  ← 조사팀이 든 별건
 *       .tl-osc-label  right:8px
 *       .tl-kit-plabel right:8px  ← 이건 JS 가 max-width 를 따로 넣어 실제로는 안전
 *   셋 다 "화면에서 글자가 덮였다" 를 기록팀이 잰 적이 없습니다.
 *   재지도 않은 숫자로 남의 파일 셋을 빨갛게 만들면, 이 봉인은 켜자마자
 *   ★끄고 싶은 봉인★ 이 됩니다. 게다가 수리팀이 .tl-ohlc 를 right:8px 로
 *   고치면 ★고친 그 순간 다시 빨개져★ 수리를 방해합니다.
 *   그래서 [7] 은 숫자를 ★찍어서 보여만 주고★, 판정은 PM 에게 올립니다.
 *   (별건 — .tl-ind-bar 138px 이 KRW ≥768 의 169px 보다 모자랍니다)
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-overlay-right-edge.test.js
 *   그리고 tests/_order.txt 에서 이 파일 줄(과 바로 위 주석 줄)을 지웁니다.
 *   ⚠️ rm 이 아니라 ★git rm★ 입니다. rm 은 디스크에서만 지우고 git 에 남아,
 *      _order.txt 만 되돌아가면 "등록 안 된 정체불명 파일" 이 되어
 *      tests/tests-dir-hygiene.test.js 가 터집니다 (2026-09-04 CLAUDE.md).
 *
 * 서버도 브라우저도 안 부릅니다. 소스 글자만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

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

/* =======================================================================
 * 훑개 — JS 안에 문자열로 적힌 CSS 를 꺼내고, CSS 규칙으로 쪼갭니다
 * ---------------------------------------------------------------------
 * 이 저장소의 차트 모듈은 CSS 를 파일이 아니라 ★JS 문자열 이어붙이기★ 로
 * 씁니다. 그래서 ".tl-ohlc{" 같은 글자가 소스에 통째로 있지 않습니다 —
 *     "." + EL_CLASS + "{position:absolute;top:6px;left:8px;..."
 * 단순 grep 이 이 병을 못 잡아 온 진짜 이유가 이것입니다.
 * 아래는 상수(var X = "값")를 풀어 넣으면서 이어붙은 문자열을 합칩니다.
 * ======================================================================= */

/** 소스를 훑어 문자열 토큰과 그 사이 코드 조각(gap)을 뽑습니다.
 *  주석은 통째로 건너뛰고 공백 한 칸으로 바꿉니다. */
function 토큰들(src) {
  const out = [];
  let i = 0, gap = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "/" && src[i + 1] === "*") {
      const j = src.indexOf("*/", i + 2);
      i = (j < 0 ? src.length : j + 2); gap += " "; continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      const j = src.indexOf("\n", i);
      i = (j < 0 ? src.length : j); gap += " "; continue;
    }
    /* ★정규식 리터럴은 통째로 건너뜁니다.★
       2026-09-07 실측 — 안 건너뛰었더니 /("([^"]*)"|'([^']*)')/ 같은 정규식 안의
       따옴표를 ★문자열 시작★ 으로 읽고 그 뒤가 통째로 어긋났습니다.
       이 파일 자신을 읽을 때 뼈대가 1493자로 쪼그라들었습니다(진짜는 6천 자대).
       나눗셈 / 과 구별하려고 ★앞에 뭐가 있었는지★ 를 봅니다. */
    if (c === "/") {
      const 앞 = gap.replace(/\s+$/, "");
      const 끝 = 앞.charAt(앞.length - 1);
      const 정규식자리 = 앞 === "" || "(,=:[!&|?{};+*%~^<>".indexOf(끝) >= 0 ||
        /\b(return|typeof|case|in|of|new|do|else)$/.test(앞);
      if (정규식자리) {
        let j = i + 1, 묶음 = false, 닫힘 = -1;
        while (j < src.length) {
          const d = src[j];
          if (d === "\\") { j += 2; continue; }
          if (d === "\n") break;                 /* 줄을 넘으면 정규식이 아닙니다 */
          if (d === "[") 묶음 = true;
          else if (d === "]") 묶음 = false;
          else if (d === "/" && !묶음) { 닫힘 = j; break; }
          j++;
        }
        if (닫힘 > 0) { gap += src.slice(i, 닫힘 + 1); i = 닫힘 + 1; continue; }
      }
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      let j = i + 1, val = "";
      while (j < src.length) {
        if (src[j] === "\\") { val += src[j + 1]; j += 2; continue; }
        if (src[j] === q) break;
        val += src[j]; j++;
      }
      out.push({ t: "s", v: val, q: q, gap: gap });
      gap = ""; i = j + 1; continue;
    }
    gap += c; i++;
  }
  out.push({ t: "end", gap: gap });
  return out;
}

/** 주석을 걷어낸 ★코드만★ 돌려줍니다.
 *  [2]·[6] 이 자기 자신을 검사할 때 씁니다 — 안 걷으면 주석에 적어 둔
 *  "getClientRects()" 같은 설명 글자를 ★코드로 잘못 읽어★ 자기가 자기한테
 *  걸립니다 (2026-09-07 에 실제로 그랬습니다). */
function 주석없이(src) {
  return 토큰들(src).map(function (t) {
    return t.gap + (t.t === "s" ? '"' + t.v + '"' : "");
  }).join("");
}

/** 주석도 ★따옴표 안 글자도★ 걷어낸 뼈대만 돌려줍니다.
 *  [6] 이 "이 봉인이 브라우저를 부르나" 를 볼 때 씁니다.
 *  ⚠ 안 걷으면 ok() 제목에 적은 "jsdom 을 부르지 않는다" 라는 ★설명 글자★ 가
 *    코드로 읽혀 자기가 자기한테 걸립니다 (2026-09-07 에 두 번 그랬습니다). */
function 뼈대(src) {
  return 토큰들(src).map(function (t) { return t.gap; }).join(" ");
}
/** require("...") 로 부른 모듈 이름을 전부 모읍니다. */
function 부른모듈(src) {
  const out = [], re = /require\(\s*("([^"]*)"|'([^']*)')\s*\)/g;
  let m;
  while ((m = re.exec(src))) out.push(m[2] !== undefined ? m[2] : m[3]);
  return out.filter(function (v, i, a) { return a.indexOf(v) === i; });
}

/** var NAME = "값"; 를 모읍니다. EL_CLASS · C_TEXT 같은 것들입니다. */
function 상수표(src) {
  const m = {};
  const re = /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*("([^"\\]*)"|'([^'\\]*)')\s*;/g;
  let x;
  while ((x = re.exec(src))) m[x[1]] = (x[3] !== undefined ? x[3] : x[4]);
  return m;
}

/* 값을 모르는 자리 표시. 선택자 안에 남아도 클래스로 안 읽힙니다. */
const 모름 = "\u0001";

/** 이어붙은 문자열 덩어리들을 하나씩 합쳐 돌려줍니다. */
function 문자열덩어리(src) {
  const 상수 = 상수표(src);
  const toks = 토큰들(src);
  const 결과 = [];
  let cur = null;
  for (let n = 0; n < toks.length; n++) {
    const tk = toks[n];
    if (tk.t !== "s") { if (cur !== null) { 결과.push(cur); cur = null; } continue; }
    let v = tk.v;
    if (tk.q === "`") {
      v = v.replace(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g, function (s, name) {
        return 상수[name] !== undefined ? 상수[name] : 모름;
      });
    }
    if (cur === null) { cur = v; continue; }
    const g = tk.gap;
    if (/^\s*\+\s*$/.test(g)) { cur += v; continue; }
    const m = /^\s*\+\s*([A-Za-z_$][\w$]*)\s*\+\s*$/.exec(g);
    if (m) { cur += (상수[m[1]] !== undefined ? 상수[m[1]] : 모름) + v; continue; }
    결과.push(cur); cur = v;
  }
  if (cur !== null) 결과.push(cur);
  return 결과;
}

/** CSS 글자를 규칙으로 쪼갭니다. @media 안쪽도 봅니다(어느 @ 안인지 같이 기록). */
function 규칙들(css) {
  const out = [];
  let i = 0, buf = "", 감싼것 = [];
  while (i < css.length) {
    const c = css[i];
    if (c === "{") {
      const 머리 = buf.trim(); buf = "";
      if (머리.charAt(0) === "@") { 감싼것.push(머리); i++; continue; }
      const j = css.indexOf("}", i + 1);
      const decl = css.slice(i + 1, j < 0 ? css.length : j);
      머리.split(",").forEach(function (한개) {
        const s = 한개.trim();
        if (s) out.push({ sel: s, decl: decl, 감싼것: 감싼것.slice() });
      });
      i = (j < 0 ? css.length : j + 1); continue;
    }
    if (c === "}") { 감싼것.pop(); buf = ""; i++; continue; }
    buf += c; i++;
  }
  return out;
}

/** 선택자가 ★실제로 꾸미는 요소★ 의 클래스 묶음을 열쇠로 만듭니다.
 *  .chart-panel .chart-wrap .tl-ind-bar  ->  "tl-ind-bar"
 *  .tl-ohlc.tl-ohlc-row                  ->  "tl-ohlc.tl-ohlc-row" (다른 열쇠)
 *  조상은 버리고 마지막 덩어리만 봅니다. 그래야 style.css 의 보강 규칙과
 *  js 의 원래 규칙이 같은 요소로 묶입니다. */
function 열쇠(sel) {
  const 조각 = sel.trim().split(/\s*[>+~]\s*|\s+/);
  let 끝 = 조각[조각.length - 1] || "";
  끝 = 끝.replace(/\[[^\]]*\]/g, "");
  끝 = 끝.replace(/::?[A-Za-z-]+(\([^)]*\))?/g, "");
  const cls = (끝.match(/\.[A-Za-z0-9_-]+/g) || []).map(function (x) { return x.slice(1); });
  if (!cls.length) return "@" + sel.trim();
  return cls.sort().join(".");
}

function 있나(decl, 속성) {
  return new RegExp("(?:^|[;{])\\s*" + 속성 + "\\s*:").test(decl);
}
function 값(decl, 속성) {
  const m = new RegExp("(?:^|[;{])\\s*" + 속성 + "\\s*:\\s*([^;}]+)").exec(decl);
  return m ? m[1].trim() : null;
}

/* =======================================================================
 * 파일 모으기 — ★이름을 여기 적지 않습니다.★ 폴더를 읽습니다.
 * ======================================================================= */
function 폴더에서(하위, 무늬) {
  const dir = path.join(REPO, 하위);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return 무늬.test(f); })
    .map(function (f) { return 하위 + "/" + f; }).sort();
}

const 원본파일 = 폴더에서("js", /^chart-.*\.js$/).concat(폴더에서("css", /^chart-.*\.css$/));
const 보강파일 = 원본파일.concat(폴더에서("css", /\.css$/)).concat(["style.css"])
  .filter(function (v, i, a) { return a.indexOf(v) === i; });

function 소스맵만들기() {
  const m = {};
  보강파일.forEach(function (p) {
    const 전체 = path.join(REPO, p);
    if (fs.existsSync(전체)) m[p] = fs.readFileSync(전체, "utf8");
  });
  return m;
}

/** 소스맵 하나에서 CSS 규칙을 전부 뽑습니다.
 *  ★디스크가 아니라 넘겨준 글자만 봅니다★ — 그래서 [5] 돌연변이를
 *  진짜 파일을 안 건드리고 사본으로 돌릴 수 있습니다. */
function 규칙수집(소스맵) {
  const 전부 = [];
  Object.keys(소스맵).forEach(function (p) {
    const src = 소스맵[p];
    if (/\.js$/.test(p)) {
      문자열덩어리(src).forEach(function (덩어리) {
        if (!/\{[^{}]*:[^{}]*\}/.test(덩어리)) return;   /* CSS 처럼 안 생긴 것은 버립니다 */
        규칙들(덩어리).forEach(function (r) { r.file = p; 전부.push(r); });
      });
    } else {
      규칙들(src).forEach(function (r) { r.file = p; 전부.push(r); });
    }
  });
  전부.forEach(function (r) { r.key = 열쇠(r.sel); });
  return 전부;
}

/** 같은 요소를 꾸미는 ★어느 파일의★ 규칙이든 오른쪽 끝을 주면 인정합니다.
 *  .tl-ind-bar 는 js 에 left 만 있고 style.css 가 right:138px 을 줍니다 —
 *  한 파일만 보면 멀쩡한 것을 잘못 잡습니다. */
const 오른쪽끝속성 = ["right", "max-width", "width", "inset", "inset-inline-end"];
function 오른쪽끝있나(전부, key) {
  return 전부.some(function (r) {
    if (r.key !== key) return false;
    if (r.감싼것.length) return false;   /* @media 안에서만 준 것은 그 폭에서만 유효 */
    return 오른쪽끝속성.some(function (p) { return 있나(r.decl, p); });
  });
}
function 넘침막았나(전부, key) {
  return 전부.some(function (r) {
    if (r.key !== key) return false;
    const v = 값(r.decl, "overflow") || 값(r.decl, "overflow-x") || "";
    return /hidden|clip|auto|scroll/.test(v);
  });
}

/** ★줄바꿈으로 푸는 상자는 [4] 에서 빼 줍니다.★
 *  2026-09-07 실측 — 수리팀이 .tl-ohlc 를 max-width + flex-wrap:wrap 으로
 *  고쳤습니다. 이 줄은 ★값 자체가 내용★ 이라 … 로 자르면 십자선의 쓸모가
 *  사라지므로, 자르지 않고 아래로 접는 쪽을 골랐습니다.
 *  그런 상자에까지 overflow:hidden 을 요구하면 ★맞는 고침을 틀렸다고 하는★
 *  검사가 됩니다. white-space:nowrap 은 칸 하나가 안 쪼개지게 하는 것이고,
 *  상자 전체가 못 접히는 것과는 다릅니다.
 *
 *  ⚠️ 이 예외가 없으면 ★봉인 두 개가 서로 싸웁니다.★
 *     tests/chart-ohlc-axis-clear.test.js 는 같은 .tl-ohlc 에 대해
 *     "overflow:hidden 이 ★없어야★ 한다 · text-overflow 가 ★없어야★ 한다" 를
 *     못 박고 있습니다(조사팀 B안 금지 — 값이 … 로 잘리면 십자선의 쓸모가
 *     사라지므로). 예외 없이 만들었다면 어느 쪽을 고쳐도 다른 쪽이 빨개져
 *     ★고칠 수 없는 상태★ 가 됩니다. 2026-09-07 에 실제로 그렇게 될 뻔했습니다. */
function 접히는상자인가(decl) {
  if (/display\s*:\s*[a-z-]*grid/.test(decl)) return true;
  return /display\s*:\s*[a-z-]*flex/.test(decl) && /flex-wrap\s*:\s*wrap/.test(decl);
}

/** 훑기 결과 — 원본파일 에서 나온 절대배치 규칙과 그 판정 */
function 훑기(소스맵) {
  const 전부 = 규칙수집(소스맵);
  /* ★position:fixed 는 일부러 뺐습니다★ (2026-09-07 실측).
     넣었더니 5건이 걸렸는데 전부 오탐이었습니다 —
       .tl-draw-chip · .tl-zoom-chip · .tl-draw-toast · .tl-style-pick · .tl-room-toast
     다섯 다 "position:fixed;left:0;top:0" 로 적어 두고 ★JS 가 그때그때
     화면 좌표를 넣어 띄우는★ 떠다니는 쪽지입니다. 기준이 .chart-wrap 이 아니라
     화면이라 가격축을 덮는 이 병과 뿌리가 다릅니다.
     이 봉인은 ★차트 칸 위에 얹히는 absolute★ 만 봅니다. */
  const 절대 = 전부.filter(function (r) {
    return 원본파일.indexOf(r.file) >= 0 && /position\s*:\s*absolute/.test(r.decl);
  });
  const 오른쪽없음 = [], 넘침없음 = [], 정적right = [];
  절대.forEach(function (r) {
    const 왼쪽 = 있나(r.decl, "left") || 있나(r.decl, "inset-inline-start");
    if (왼쪽 && !오른쪽끝있나(전부, r.key)) 오른쪽없음.push(r);
    if (/white-space\s*:\s*nowrap/.test(r.decl) && !접히는상자인가(r.decl) &&
        !넘침막았나(전부, r.key)) 넘침없음.push(r);
    전부.forEach(function (x) {
      if (x.key !== r.key || x.감싼것.length) return;
      const v = 값(x.decl, "right");
      if (v && /^-?\d+(\.\d+)?px$/.test(v)) 정적right.push({ key: r.key, file: x.file, 값: v });
    });
  });
  return { 전부: 전부, 절대: 절대, 오른쪽없음: 오른쪽없음, 넘침없음: 넘침없음, 정적right: 정적right };
}

function 줄(r) { return r.file + "  " + r.sel.replace(/\u0001/g, "?").slice(0, 48); }

console.log("==========================================================");
console.log(" 차트 위 절대배치 — 오른쪽 끝이 있는가 (2026-09-07 · 패턴 훑기)");
console.log("==========================================================");

const 결과 = 훑기(소스맵만들기());

/* ===================================================================== */
절("[1] 훑개가 살아 있는가");
{
  ok("차트 소스를 ★폴더에서★ 모았다 (" + 원본파일.length + "개)",
    원본파일.length >= 20,
    "js/chart-*.js 와 css/chart-*.css 가 " + 원본파일.length + "개뿐입니다 — 수집이 깨졌습니다");
  ok("보강까지 합쳐 " + 보강파일.length + "개 파일에서 CSS 규칙 " + 결과.전부.length + "개를 읽었다",
    결과.전부.length >= 300,
    "규칙이 " + 결과.전부.length + "개밖에 안 읽혔습니다. JS 문자열 잇기 해석이 깨졌습니다");
  ok("그중 절대배치 규칙 " + 결과.절대.length + "개를 골라냈다",
    결과.절대.length >= 12,
    "절대배치가 " + 결과.절대.length + "개뿐입니다 — 훑개가 헛돌면 위반도 0 으로 나옵니다");
  /* JS 문자열 잇기를 실제로 풀었는지 — 못 풀면 아래 전부가 조용히 0 이 됩니다 */
  const 이어붙인것 = 결과.전부.some(function (r) { return r.file === "js/chart-ohlc-legend.js"; });
  ok("★\".\" + EL_CLASS + \"{...\" 처럼 이어붙인 CSS 도 풀어서 읽는다★",
    이어붙인것,
    "js/chart-ohlc-legend.js 에서 규칙을 하나도 못 읽었습니다 — grep 으로는 안 보이는 형태입니다");
}

/* ===================================================================== */
절("[2] ★명단이 아니라 패턴★ — 옛 봉인이 못 잡은 것을 잡는가");
{
  /* 옛 봉인(2026-09-03)은 파일 두 개를 글자로 적어 뒀습니다.
     그 다음 날 생긴 세 번째 범인은 명단에 못 들어갔습니다. */
  const 옛봉인 = path.join(REPO, "tests", "chart-pane-label-fit.test.js");
  const 옛소스 = fs.existsSync(옛봉인) ? fs.readFileSync(옛봉인, "utf8") : "";
  const 옛명단 = (옛소스.match(/js\/chart-[a-z-]+\.js/g) || [])
    .filter(function (v, i, a) { return a.indexOf(v) === i; });
  ok("옛 봉인은 차트 파일 " + 옛명단.length + "개만 이름으로 봤다 (2026-09-03)",
    옛명단.length > 0 && 옛명단.length <= 3,
    "옛 봉인을 못 읽었습니다: " + 옛봉인);
  옛명단.forEach(function (f) {
    ok("그 " + f + " 는 지금도 훑는다 (좁아지지 않았다)",
      원본파일.indexOf(f) >= 0, "수집에서 빠졌습니다");
  });
  ok("우리는 " + 원본파일.length + "개를 훑는다 — 옛 명단보다 " +
    (원본파일.length - 옛명단.length) + "개 넓다",
    원본파일.length > 옛명단.length + 10);

  /* 2026-09-04 에 생긴 그 파일이 ★아무도 등록하지 않았는데★ 잡혀 있어야 합니다 */
  const 새범인 = 결과.절대.filter(function (r) { return r.file === "js/chart-ohlc-legend.js"; });
  ok("2026-09-04 에 생긴 js/chart-ohlc-legend.js 의 절대배치 규칙이 ★자동으로★ 훑기에 들어왔다",
    새범인.length >= 1,
    "이게 0 이면 이 봉인도 옛 봉인과 똑같은 사각지대를 갖습니다");

  /* 이 파일 자체가 명단이 아님을 못 박습니다 —
     검사 대상 파일 이름을 글자로 몇 개나 적었는지 셉니다. */
  const 자기소스 = fs.readFileSync(__filename, "utf8");
  const 몸통 = 주석없이(자기소스.slice(자기소스.indexOf('"use strict";')));
  const 박힌이름 = (몸통.match(/js\/chart-[a-z-]+\.js|css\/chart-[a-z-]+\.css/g) || [])
    .filter(function (v, i, a) { return a.indexOf(v) === i; });
  ok("이 봉인의 검사 코드에 차트 파일 이름이 " + 박힌이름.length + "개만 적혀 있다 (전부 " +
    원본파일.length + "개인데)",
    박힌이름.length <= 3,
    "명단으로 돌아갔습니다: " + 박힌이름.join(", "));
  ok("파일 목록을 readdirSync 로 그때그때 읽는다",
    /readdirSync/.test(몸통), "목록을 글자로 적으면 다음 새 파일을 또 놓칩니다");
}

/* ===================================================================== */
절("[3] ★절대배치인데 오른쪽 끝이 없는 규칙이 0건인가★  ← 본 검사");
{
  결과.오른쪽없음.forEach(function (r) {
    console.log("      · " + 줄(r) + "   (left 만 있고 right/max-width/width 가 없음)");
  });
  ok("오른쪽 끝 없는 절대배치 " + 결과.오른쪽없음.length + "건",
    결과.오른쪽없음.length === 0,
    "★상자가 글자 길이 그대로 늘어나 문서를 밀고 가격축을 덮습니다.★ " +
    "right(또는 max-width/width) 를 주세요. 걸린 것: " +
    결과.오른쪽없음.map(줄).join(" | "));
}

/* ===================================================================== */
절("[4] 절대배치 + nowrap 인데 넘침을 안 막은 규칙이 0건인가");
{
  /* right 만 주고 overflow 를 안 주면 상자는 멈춰도 ★글자가 그대로 삐져나갑니다★.
     2026-09-03 봉인도 같은 이유로 overflow:hidden 을 같이 요구했습니다. */
  결과.넘침없음.forEach(function (r) {
    console.log("      · " + 줄(r) + "   (white-space:nowrap 인데 overflow 가 없음)");
  });
  ok("nowrap 인데 overflow 를 안 막은 절대배치 " + 결과.넘침없음.length + "건",
    결과.넘침없음.length === 0,
    "글자가 상자 밖으로 그대로 흘러 가격축을 덮습니다. overflow:hidden + " +
    "text-overflow:ellipsis 를 같이 주세요. 걸린 것: " +
    결과.넘침없음.map(줄).join(" | "));
}

/* ===================================================================== */
절("[5] 돌연변이 — 이 검사가 진짜로 잡는가 (★사본에서★)");
{
  /* 진짜 파일은 한 글자도 안 건드립니다. 메모리 위 사본만 고칩니다. */
  const 원본맵 = 소스맵만들기();

  /* (가) 앞으로 생길 ★새 파일·새 클래스★ 를 흉내 냅니다.
     이게 잡혀야 "명단이 아니라 패턴" 이 사실입니다. */
  const 사본가 = Object.assign({}, 원본맵);
  const 심을파일 = 원본파일.filter(function (p) { return /\.js$/.test(p); })[0];
  사본가[심을파일] = 원본맵[심을파일] +
    "\nvar 가짜 = \".tl-brand-new-label{position:absolute;left:8px;top:6px;white-space:nowrap;}\";\n";
  const 결과가 = 훑기(사본가);
  ok("사본이 실제로 달라졌다 (돌연변이가 헛돌지 않았다)",
    사본가[심을파일] !== 원본맵[심을파일]);
  ok("★없던 클래스를 새로 심으면 [3] 이 잡는다★ — 등록 없이도 걸립니다",
    결과가.오른쪽없음.length === 결과.오른쪽없음.length + 1 &&
    결과가.오른쪽없음.some(function (r) { return /brand-new-label/.test(r.sel); }),
    "못 잡습니다 — 이 봉인도 명단과 다를 게 없습니다");
  ok("같은 것을 [4] 도 잡는다 (nowrap + overflow 없음)",
    결과가.넘침없음.some(function (r) { return /brand-new-label/.test(r.sel); }),
    "못 잡습니다");

  /* (나) 이미 고쳐 둔 .tl-kit-plabel 에서 right 를 도로 빼 봅니다.
     = 2026-09-03 이전 상태로 되돌리기. */
  const 사본나 = Object.assign({}, 원본맵);
  const KIT = "js/chart-indicator-kit.js";
  사본나[KIT] = (원본맵[KIT] || "").replace("position:absolute;left:8px;right:8px;",
    "position:absolute;left:8px;");
  ok("2026-09-03 이전 상태를 사본으로 되돌렸다", 사본나[KIT] !== 원본맵[KIT],
    "치환이 안 됐습니다 — 원본 글자가 바뀌었나요? 이 돌연변이는 헛돕니다");
  const 결과나 = 훑기(사본나);
  ok("★옛 버그를 되돌리면 잡는다★ (.tl-kit-plabel 에서 right 제거)",
    결과나.오른쪽없음.some(function (r) { return /kit-plabel/.test(r.sel); }),
    "못 잡습니다");

  /* (다) 교차 파일 보강을 진짜로 읽는지.
     .tl-ind-bar 는 js 에 left 만 있고 style.css 가 right 를 줍니다.
     그 한 줄을 사본에서 지우면 잡혀야 하고, 안 지우면 안 잡혀야 합니다. */
  ok("지금 .tl-ind-bar 는 안 잡힌다 (style.css 가 right 를 주므로 — 오탐 아님)",
    !결과.오른쪽없음.some(function (r) { return /ind-bar/.test(r.sel); }),
    "한 파일만 보면 멀쩡한 것을 잘못 잡습니다");
  const 사본다 = Object.assign({}, 원본맵);
  사본다["style.css"] = (원본맵["style.css"] || "")
    .replace(".chart-panel .chart-wrap .tl-ind-bar{right:138px;}", "");
  ok("style.css 보강 한 줄을 사본에서 지웠다", 사본다["style.css"] !== 원본맵["style.css"],
    "치환이 안 됐습니다");
  const 결과다 = 훑기(사본다);
  ok("★다른 파일의 보강이 사라지면 잡는다★ — 파일 하나만 보고 있지 않다는 증거",
    결과다.오른쪽없음.some(function (r) { return /ind-bar/.test(r.sel); }),
    "교차 파일 보강을 안 읽고 있습니다");

  /* 진짜 파일이 그대로인지 확인 — 사본에서만 놀았다는 것을 스스로 증명합니다 */
  const 다시읽기 = 소스맵만들기();
  ok("검사가 끝난 뒤에도 진짜 파일이 한 글자도 안 바뀌었다",
    보강파일.every(function (p) { return 다시읽기[p] === 원본맵[p]; }),
    "★사본이 아니라 진짜 파일을 건드렸습니다★");
}

/* ===================================================================== */
절("[6] 브라우저를 안 쓴다 (overflow:hidden 이면 글자 좌표로 못 잽니다)");
{
  /* 2026-09-07 조사팀 실측 — 상자는 247 에서 잘렸는데
     Range.getClientRects() 는 654 를 보고했습니다(침범 +404).
     그 방식으로 봉인을 만들면 화면이 멀쩡한데 검사만 빨개집니다. */
  const 자기소스 = fs.readFileSync(__filename, "utf8");
  const 날것 = 자기소스.slice(자기소스.indexOf('"use strict";'));
  const 몸통 = 주석없이(날것);
  const 뼈 = 뼈대(날것);

  /* 부르는 모듈이 파일 읽기 둘뿐이면 브라우저도 서버도 못 부릅니다.
     낱말 하나하나를 찾는 것보다 이쪽이 셉니다 — 앞으로 어떤 이름이
     생기든 목록 밖이면 걸립니다. */
  const 허용모듈 = ["fs", "path"];
  const 모듈 = 부른모듈(몸통);
  ok("부르는 모듈이 [" + 모듈.join(", ") + "] 뿐이다 — 브라우저도 서버도 안 씁니다",
    모듈.length > 0 && 모듈.every(function (m) { return 허용모듈.indexOf(m) >= 0; }),
    "글자 좌표로 재면 overflow:hidden 뒤에는 상자 247 을 654 로 보고합니다(+404)");
  /* ⚠ 찾을 낱말을 ★쪼개서 이어 붙입니다.★ 통째로 적으면 그 글자가 바로
     이 파일의 코드가 되어 ★자기가 자기한테 걸립니다★ — 2026-09-07 에
     정규식으로 적었다가 실제로 그랬습니다. */
  const 금지 = ["docu" + "ment", "win" + "dow", "getBounding" + "ClientRect",
    "getClient" + "Rects", "fet" + "ch(", "XMLHttp" + "Request", "Supa" + "base"];
  const 걸린것 = 금지.filter(function (w) { return 뼈.indexOf(w) >= 0; });
  ok("코드 뼈대에 브라우저·서버 물건이 없다 (걸린 것 " + 걸린것.length + "개)",
    걸린것.length === 0,
    "이 봉인은 소스 글자만 읽어야 합니다: " + 걸린것.join(", "));

  /* 위 두 줄은 걷어내기가 실제로 됐을 때만 뜻이 있습니다.
     그래서 ★표식★ 을 심어 두 단계를 따로 확인합니다.
     아래 낱말은 이 주석에만 있습니다 -> 주석표식AAA */
  const 표식B = "문자열표식BBB";
  ok("주석을 진짜로 걷었다 (주석에만 있는 낱말이 사라졌다)",
    몸통.indexOf("주석표식" + "AAA") < 0 && 날것.indexOf("주석표식" + "AAA") > 0,
    "주석이 남아 있으면 위 검사는 ★설명 글자를 보고★ 판정합니다");
  ok("따옴표 안 글자는 몸통엔 남기고 뼈대에선 걷었다 (표식 하나로 두 단계 확인)",
    몸통.indexOf(표식B) > 0 && 뼈.indexOf(표식B) < 0,
    "뼈대에 문자열이 남으면 ok() 제목에 적은 설명이 코드로 읽힙니다");
  ok("걷어낸 뒤에도 검사할 코드가 남아 있다 (원본 " + 날것.length + " > 주석뺀 " +
    몸통.length + " > 뼈대 " + 뼈.length + "자)",
    뼈.length > 1000 && 뼈.length < 몸통.length && 몸통.length < 날것.length,
    "다 걷어내 버리면 위 검사는 아무것도 안 보고 늘 통과합니다");
}

/* ===================================================================== */
절("[7] 가격축을 안 덮는 확실한 길이 살아 있는가 (+ 정적 right 현황)");
{
  /* 가격축 폭은 ★네 가지★ 입니다 (2026-09-07 조사팀 실측).
       USDT ≤390  75px     KRW ≤390   93px
       USDT ≥768 131px     KRW ≥768  169px
     정적 right 하나로는 네 경우를 다 못 막습니다. 확실한 길은 JS 가
     그림 영역(가운데 td) 폭을 읽어 max-width 를 넣는 것 하나뿐입니다.
     그 길이 살아 있는지만 검사하고, 개별 right 값 판정은 [7] 머리말대로
     PM 에게 올립니다(합격/불합격으로 안 만듭니다). */
  const 소스맵 = 소스맵만들기();
  const 그림영역읽기 = Object.keys(소스맵).some(function (p) {
    return /\.js$/.test(p) && /style\.maxWidth\s*=/.test(소스맵[p]) &&
      /children\[1\]/.test(소스맵[p]);
  });
  ok("차트 모듈 어딘가에 ★그림 영역 폭을 읽어 max-width 를 넣는★ 길이 남아 있다",
    그림영역읽기,
    "가격축을 확실히 피하는 유일한 방법입니다. 사라지면 정적 right 로만 남습니다");

  const 본것 = {};
  const 목록 = 결과.정적right.filter(function (x) {
    const k = x.key + "|" + x.file + "|" + x.값;
    if (본것[k]) return false; 본것[k] = 1; return true;
  });
  console.log("      — 정적 right 로만 오른쪽을 막은 자리 (판정 없음 · 숫자만) —");
  console.log("        가격축 실측: USDT ≤390 75 / KRW ≤390 93 / USDT ≥768 131 / KRW ≥768 169");
  목록.forEach(function (x) {
    const n = parseFloat(x.값);
    console.log("        ." + x.key + "  right:" + x.값 + "  (" + x.file + ")  " +
      (n >= 169 ? "가장 넓은 가격축(169)보다 큼" : "169 보다 작음 — 통화·폭에 따라 모자랄 수 있음"));
  });
  ok("정적 right 현황을 " + 목록.length + "건 찍었다 (PM 판단용)", 목록.length >= 0);
}

/* ===================================================================== */
절("[8] 등록 — npm test 로 실제로 돌아가는가");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-overlay-right-edge.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  const 자기소스 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다", 자기소스.indexOf("되돌리는 방법") > 0);
  ok("되돌리기가 rm 이 아니라 ★git rm★ 이다",
    /git rm -f tests\/chart-overlay-right-edge\.test\.js/.test(자기소스),
    "rm 은 git 에 파일을 남겨 tests-dir-hygiene 를 터뜨립니다 (2026-09-04)");
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
