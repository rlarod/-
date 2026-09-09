/* =========================================================================
 * tests/chart-series-axis-badge-seal.test.js
 * =========================================================================
 * ★시리즈를 새로 만들 때 마지막값 배지와 가로 점선을 껐는가★ 를 소스 글자로 봅니다.
 *
 * ── 왜 만들었나 — 가격축이 가려지는 병이 사흘에 세 번 났습니다 ──────────
 *   2026-09-07  .tl-ohlc      십자선 OHLC 줄이 가격축을 덮음  (8efb985) ★대표가 캡처로 잡으심★
 *   2026-09-07  .tl-ind-bar   지표 칩 줄이 가격축을 덮음      (c3dfca3)
 *   2026-09-08  ★거래량 배지 + 차트를 가로지르는 가짜 가격선★ (053bfea) ★P1★
 *
 *   앞 둘과 세 번째는 ★병이 다릅니다★.
 *     앞 둘    ★배치★ 문제 — position:absolute 인데 오른끝이 없음.
 *              → tests/chart-overlay-right-edge.test.js 가 CSS 규칙으로 잡습니다.
 *     세 번째  ★기본값★ 문제 — addSeries 에 옵션을 안 적어 라이브러리 기본값이 켜짐.
 *              → 캔버스에 ctx.fillText 로 찍히므로 ★선택자도 CSS 규칙도 없습니다★.
 *                CSS 를 아무리 훑어도 영원히 안 잡힙니다.
 *
 *   그래서 이 봉인은 ★화면★ 이 아니라 ★소스에 그 옵션을 적었는가★ 를 봅니다.
 *
 * ── 무엇이 났었나 (2026-09-08 · P1 조용한 고장) ────────────────────────
 *   js/chart.js:247 이 거래량 시리즈에만 두 옵션을 안 적었습니다.
 *   ★바로 위 캔들(225~236)에는 둘 다 껐습니다★ — 거래량만 빠졌습니다.
 *   라이브러리(lightweight-charts 5.2.0) 기본값이 ★둘 다 true★ 입니다.
 *     ① 거래량 배지가 가격축 눈금을 덮음
 *        (360 KRW 실측 — ₩118,2xx,xxx 가 "00,000" 만 읽힘)
 *     ② 차트를 ★가로지르는 가로 점선★ 이 그려져 회원이 가격선으로 읽음
 *   수리팀 실측(2026-09-08 · 표본 12회씩) 겹침 —
 *     360 USDT 100% · 360 KRW 66.7% · 375 USDT 75% · 375 KRW 100% ·
 *     390 USDT 33.3% · 390 KRW 100% · 768 두 통화 100% · 1440 USDT 91.7% ·
 *     1440 KRW 100% · 1920 USDT 83.3% · 1920 KRW 25%.
 *     점선은 여섯 폭 ★전부★ 1줄(폭의 50.0~50.4%).
 *
 * ── 여기서만 보는 것 (두 벌 금지) ──────────────────────────────────────
 *   tests/chart-vol-badge-seal.test.js 는 ★그 우회 모듈이 제대로 도는가★ 를
 *   가짜 차트를 태워서 봅니다(applyOptions 기록·칩 값·visible 안 건드림 …).
 *   여기는 ★소스 전체에 같은 구멍이 또 생기지 않는가★ 만 봅니다. 겹치지 않습니다.
 *   딱 하나 겹쳐 보이는 것이 [4] 의 index.html 순서인데, 저쪽은
 *   "chart-font·chart-indicators 뒤" 를 보고 여기는 ★"잠긴 원본 파일 뒤"★ 를 봅니다.
 *   원본보다 앞에 실리면 끄기가 원본에 덮여 되살아납니다 — 저쪽엔 그 검사가 없습니다.
 *
 * ── ★브라우저를 안 씁니다★ ────────────────────────────────────────────
 *   캔버스 위 실제 겹침을 픽셀로 재는 검사는 ★일부러 안 만들었습니다★.
 *   조사팀 실측 — overflow:hidden 뒤에서 좌표가 247 을 654 로 보고합니다.
 *   ★화면은 멀쩡한데 검사만 빨개집니다.★ (tests/chart-indbar-axis-clear [6] 참조)
 *
 * ── ⚠️ js/chart.js 는 수정 금지 파일입니다 ────────────────────────────
 *   ★읽기만 합니다.★ 그래서 247행은 "옵션을 적으라" 고 요구할 수 없습니다.
 *   대신 ★밖에서 끄는 모듈과 짝★ 인지를 요구합니다([4]).
 *   "안 적었으면 무조건 빨강" 으로 만들면 켜자마자 못 고치는 빨강이 됩니다.
 *
 * ── 착수 전 실측 (2026-09-09 기록팀) ───────────────────────────────────
 *   js/ 전체 addSeries·addCustomSeries 호출 ★16곳★.
 *   두 옵션을 안 적은 곳은 ★js/chart.js:247 단 1곳★ 이고, 그 1곳이 이번 P1 입니다.
 *   보조지표(RSI·MACD·kit 의 EMA/WMA/KDJ/ATR/StochRSI/CCI …)는 ★전부 적어 뒀습니다★
 *   — 같은 병이 더 있지는 않았습니다.
 *   ⚠️ 보조 pane 지표는 lastValueVisible 이 ★true★ 인 것이 있습니다
 *      (RSI · MACD 선 · kit 의 it.pane==="sub"). 그건 ★자기 칸의 축★ 이라
 *      메인 가격축을 안 덮습니다. 트레이딩뷰도 그렇습니다. 그래서 값은 안 따집니다.
 *      값으로 따지는 것은 [5] 의 priceLineVisible 하나뿐입니다 —
 *      그건 어느 칸에서든 ★차트를 가로지르는 선★ 이라 늘 틀립니다(지금 0곳).
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   ① tests/_order.txt 의 등록 줄(과 그 위 주석 문단)을 지운다
 *   ② git rm -f tests/chart-series-axis-badge-seal.test.js
 *      (rm 이 아닙니다 — git 에 남으면 tests-dir-hygiene 이 터집니다)
 *   ③ git add tests/_order.txt
 *      (안 올리면 test-registry 가 "목록엔 있는데 git 엔 없다" 로 터집니다)
 *   ④ tests/chart-overlay-right-edge.test.js 머리글에서 이 파일을 가리키는
 *      줄을 지운다. ★이것만은 테스트가 안 깨집니다★ — 주석이라 아무 봉인도
 *      안 울고, 없어진 파일을 가리키는 안내만 조용히 남습니다.
 *   ★2026-09-09 별도 worktree 에서 ①②③ 을 실제로 눌러 확인했습니다 —
 *     229개 실행 / 229개 통과 → ★228개 실행 / 228개 통과 / 0개 실패★.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const JS = path.join(REPO, "js");
const SELF = "chart-series-axis-badge-seal.test.js";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  \x1b[32m✓\x1b[0m " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  \x1b[31m✗\x1b[0m " + 제목 + (도움말 ? "\n      " + 도움말 : ""));
  }
}

/* =====================================================================
 * 잠긴 파일 — 값은 tests/_locked-hashes.js 한 곳에서만 읽습니다.
 * (2026-08-31 — 해시를 48곳에 흩뿌렸다가 한꺼번에 터진 뒤 만든 규칙)
 * ===================================================================== */
const 잠긴파일 = Object.keys(require("./_locked-hashes.js").BY_FILE)
  .filter((k) => k.indexOf("/") !== -1);

/* =====================================================================
 * ★잠긴 파일의 예외 표★
 * ---------------------------------------------------------------------
 * 수정 금지 파일이라 옵션을 못 적는 자리입니다. 여기 적힌 자리만
 * "밖에서 끄는 모듈" 로 대신할 수 있습니다. 표에 없는 자리가 나오면 빨강입니다.
 *
 * ⚠️ 줄 번호로 적지 않았습니다 — 대표 결재로 파일이 열리면 줄이 밀립니다.
 *    "어느 파일의 어느 시리즈" 로 적습니다.
 * ===================================================================== */
const 잠긴예외 = [
  {
    파일: "js/chart.js",
    시리즈: "HistogramSeries",
    무엇: "거래량(오버레이 Histogram) — 2026-09-08 P1",
    우회모듈: "js/chart-vol-badge.js",
  },
];

/* =====================================================================
 * 아주 작은 훑개 — 괄호 짝을 세어 인자를 가릅니다.
 * (문자열·주석 안의 괄호는 건너뜁니다)
 * ===================================================================== */
function 짝맞추기(src, i) {
  const 여는 = src[i];
  const 닫는 = { "(": ")", "{": "}", "[": "]" }[여는];
  if (!닫는) return -1;
  let d = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      k++;
      while (k < src.length && src[k] !== q) {
        if (src[k] === "\\") k++;
        k++;
      }
      continue;
    }
    if (c === "/" && src[k + 1] === "/") {
      while (k < src.length && src[k] !== "\n") k++;
      continue;
    }
    if (c === "/" && src[k + 1] === "*") {
      const e = src.indexOf("*/", k + 2);
      if (e < 0) return -1;
      k = e + 1;
      continue;
    }
    if (c === 여는) d++;
    else if (c === 닫는) {
      d--;
      if (d === 0) return k;
    }
  }
  return -1;
}

function 인자쪼개기(안) {
  const out = [];
  let d = 0;
  let s = 0;
  for (let k = 0; k < 안.length; k++) {
    const c = 안[k];
    if (c === '"' || c === "'" || c === "`") {
      const q = c;
      k++;
      while (k < 안.length && 안[k] !== q) {
        if (안[k] === "\\") k++;
        k++;
      }
      continue;
    }
    if (c === "/" && 안[k + 1] === "/") {
      while (k < 안.length && 안[k] !== "\n") k++;
      continue;
    }
    if (c === "/" && 안[k + 1] === "*") {
      const e = 안.indexOf("*/", k + 2);
      if (e < 0) break;
      k = e + 1;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") d++;
    else if (c === ")" || c === "}" || c === "]") d--;
    else if (c === "," && d === 0) {
      out.push(안.slice(s, k).trim());
      s = k + 1;
    }
  }
  const 끝 = 안.slice(s).trim();
  if (끝) out.push(끝);
  return out;
}

function 함수들(src) {
  const out = [];
  const re = /function\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const p = src.indexOf("(", m.index);
    const pc =짝맞추기(src, p);
    if (pc < 0) continue;
    const b = src.indexOf("{", pc);
    if (b < 0) continue;
    const bc = 짝맞추기(src, b);
    if (bc < 0) continue;
    out.push({
      이름: m[1],
      인자: 인자쪼개기(src.slice(p + 1, pc)),
      정의시작: m.index,
      몸시작: b,
      몸끝: bc,
    });
  }
  return out;
}

/** 그 자리가 주석 줄인가 — ★주석을 걷어내려고만★ 씁니다.
 *  ⚠️ 주석 ★내용★ 을 검사하지 않습니다. 주석에 기대는 검사는 코드가 되살아나도
 *     초록으로 넘어갑니다(tests/comment-anchor-guard.test.js 가 지키는 규칙).
 *  ⚠️ 정규식으로 안 쓰고 글자 비교로 씁니다 — 정규식으로 쓰면 그 봉인이
 *     "주석 글자를 검사 대상으로 삼았다" 로 읽습니다(2026-09-09 실제로 걸렸습니다). */
function 주석줄(src, i) {
  const s = src.lastIndexOf("\n", i) + 1;
  let e = src.indexOf("\n", i);
  if (e < 0) e = src.length;
  const t = src.slice(s, e).replace(/^[ \t]+/, "");
  return t.charAt(0) === "*" || t.slice(0, 2) === "//" || t.slice(0, 2) === "/*";
}

function 줄번호(src, i) {
  return src.slice(0, i).split("\n").length;
}

/** 이 파일 안의 addSeries / addCustomSeries 호출 전부 */
function 호출들(src) {
  const out = [];
  const re = /\.(addSeries|addCustomSeries)\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    if (주석줄(src, m.index)) continue;
    const p = m.index + m[0].length - 1;
    const pc = 짝맞추기(src, p);
    if (pc < 0) continue;
    const 인자 = 인자쪼개기(src.slice(p + 1, pc));
    out.push({
      이름: m[1],
      위치: m.index,
      줄: 줄번호(src, m.index),
      인자: 인자,
      정의식: 인자[0] || "",
      옵션식: 인자[1] || "",
    });
  }
  return out;
}

function 감싼함수들(src, i) {
  return 함수들(src)
    .filter((f) => f.몸시작 < i && i < f.몸끝)
    .sort((a, b) => b.몸시작 - a.몸시작);
}

/**
 * 옵션 인자가 가리키는 ★실제 글자★ 를 찾아냅니다.
 *   { … }            → 그대로
 *   도우미({ … })     → 도우미 함수 몸 + 넘긴 글자   (js/chart-candle-type.js withBase)
 *   지역변수          → 그 변수를 만든 자리로 따라감 (js/chart-indicator-kit.js opts)
 *   함수 인자         → ★통로★ 로 보고 부르는 곳을 전부 따라감 (js/chart-oscillators.js addTo)
 *
 * ⚠️ 못 따라가면 ★통과가 아니라 빨강★ 입니다. 관대하게 넘기면 그 자리가
 *    사각지대가 됩니다 (tests/mmr-fallback-blindspot.test.js 가 남긴 교훈).
 */
function 옵션글자(src, 식, 위치, 깊이) {
  깊이 = 깊이 || 0;
  식 = (식 || "").trim();
  if (깊이 > 5) return { 상태: "못품", 출처: "따라가기가 너무 깊습니다", 글: [] };
  if (!식) return { 상태: "못품", 출처: "옵션 인자를 아예 안 넘겼습니다", 글: [] };
  /* 글 은 ★갈래★ 목록입니다. 갈래 하나하나가 "이 호출이 탈 수 있는 길" 이고,
     갈래마다 두 옵션이 들어 있어야 통과입니다.
       직접 적음 / 도우미 / 지역변수 → 갈래 1개
       ★통로★(함수 인자로 받은 옵션)  → 부르는 곳마다 갈래 1개 */
  if (식[0] === "{") return { 상태: "찾음", 출처: "그 자리에 직접 적음", 글: [식] };

  const fns = 함수들(src);

  const 부름 = 식.match(/^([A-Za-z_$][\w$]*)\s*\(/);
  if (부름) {
    const fn = fns.find((f) => f.이름 === 부름[1]);
    if (!fn) return { 상태: "못품", 출처: "도우미 " + 부름[1] + " 를 못 찾음", 글: [] };
    /* 도우미 몸과 넘긴 글자를 ★한 갈래로 합칩니다★ — 둘 중 어디에 적혀
       있어도 됩니다 (js/chart-candle-type.js 는 withBase() 안에 적어 뒀습니다) */
    return {
      상태: "찾음",
      출처: "도우미 " + 부름[1] + "()",
      글: [src.slice(fn.몸시작, fn.몸끝 + 1) + "\n" + 식],
    };
  }

  if (/^[A-Za-z_$][\w$]*$/.test(식)) {
    const 체인 = 감싼함수들(src, 위치);
    for (const fn of 체인) {
      const 몸 = src.slice(fn.몸시작, fn.몸끝 + 1);
      const dm = 몸.match(new RegExp("(?:var|let|const)\\s+" + 식 + "\\s*=\\s*"));
      if (!dm) continue;
      const 시작 = fn.몸시작 + dm.index + dm[0].length;
      let 끝;
      if (src[시작] === "{" || src[시작] === "[") {
        끝 = 짝맞추기(src, 시작) + 1;
      } else {
        const pi = src.indexOf("(", 시작);
        let nl = src.indexOf("\n", 시작);
        if (nl < 0) nl = src.length;
        끝 = pi >= 0 && pi < nl ? 짝맞추기(src, pi) + 1 : nl;
      }
      if (끝 <= 시작) return { 상태: "못품", 출처: "변수 " + 식 + " 의 만든 자리를 못 읽음", 글: [] };
      const r = 옵션글자(src, src.slice(시작, 끝), 위치, 깊이 + 1);
      /* 만든 뒤 opts.xxx = … 로 더 붙이는 경우까지 ★같은 갈래 안에서★ 봅니다.
         ⚠️ 함수 몸을 통째로 붙이지 않습니다 — 그러면 같은 함수 안 ★다른★
            객체에 적힌 글자에 걸려 통과해 버립니다(사각지대). 그 변수에 대한
            대입문만 골라 "키:" 모양으로 바꿔 붙입니다. */
      if (r.상태 === "찾음") {
        const 대입 = (몸.match(new RegExp("\\b" + 식 + "\\.[\\w$]+\\s*=", "g")) || [])
          .map((s) => s.slice(식.length + 1).replace(/\s*=$/, ":"))
          .join("\n");
        if (대입) r.글 = r.글.map((g) => g + "\n" + 대입);
      }
      return r;
    }
    const 안 = 체인[0];
    if (안) {
      const idx = 안.인자.findIndex((a) => a.trim() === 식);
      if (idx >= 0) {
        const re = new RegExp("(^|[^\\w$.])" + 안.이름 + "\\s*\\(", "g");
        let mm;
        const 모음 = [];
        let 수 = 0;
        while ((mm = re.exec(src))) {
          const p = src.indexOf("(", mm.index);
          if (p < 0) continue;
          if (mm.index >= 안.정의시작 && mm.index <= 안.몸시작) continue; /* 정의 자신 */
          if (주석줄(src, mm.index)) continue;
          const pc = 짝맞추기(src, p);
          if (pc < 0) continue;
          const a = 인자쪼개기(src.slice(p + 1, pc));
          if (a.length <= idx) continue;
          수++;
          const r = 옵션글자(src, a[idx], mm.index, 깊이 + 1);
          if (r.상태 !== "찾음") {
            return {
              상태: "못품",
              출처: "통로 " + 안.이름 + "() 을 " + 줄번호(src, mm.index) + "행에서 부르는데 못 품",
              글: [],
            };
          }
          모음.push(r.글.join("\n"));
        }
        if (수 === 0) {
          return { 상태: "못품", 출처: "통로 " + 안.이름 + "() 을 부르는 곳이 0곳", 글: [] };
        }
        return { 상태: "찾음", 출처: "통로 " + 안.이름 + "() — 부르는 곳 " + 수 + "곳", 글: 모음 };
      }
    }
  }
  return { 상태: "못품", 출처: "모양을 모릅니다: " + 식.slice(0, 40), 글: [] };
}

function 키있나(글목록, 키) {
  const re = new RegExp("(^|[^\\w$])" + 키 + "\\s*:");
  return 글목록.every((g) => re.test(g));
}

/* =====================================================================
 * js/ 아래 모든 .js 를 훑습니다 (js/market-data/ 같은 아래 칸도)
 * ===================================================================== */
function 자바스크립트파일들(디렉터리, 접두) {
  let out = [];
  for (const 이름 of fs.readdirSync(디렉터리)) {
    const 전체 = path.join(디렉터리, 이름);
    const st = fs.statSync(전체);
    if (st.isDirectory()) out = out.concat(자바스크립트파일들(전체, 접두 + 이름 + "/"));
    else if (이름.endsWith(".js")) out.push({ 상대: "js/" + 접두 + 이름, 전체: 전체 });
  }
  return out;
}

const 파일들 = 자바스크립트파일들(JS, "");
const 조사 = [];
for (const f of 파일들) {
  const src = fs.readFileSync(f.전체, "utf8");
  for (const c of 호출들(src)) {
    const r = 옵션글자(src, c.옵션식, c.위치);
    조사.push({
      파일: f.상대,
      줄: c.줄,
      이름: c.이름,
      정의식: c.정의식,
      옵션식: c.옵션식,
      결과: r,
      잠김: 잠긴파일.indexOf(f.상대) !== -1,
      last: r.상태 === "찾음" && 키있나(r.글, "lastValueVisible"),
      price: r.상태 === "찾음" && 키있나(r.글, "priceLineVisible"),
    });
  }
}

console.log("\n=== chart-series-axis-badge-seal ===");
console.log("  훑은 js 파일 " + 파일들.length + "개 / 시리즈 만드는 호출 " + 조사.length + "곳\n");

/* =====================================================================
 * [1] 훑개 자체 점검 — 훑개가 고장나면 아무것도 안 보고 초록이 됩니다
 * ===================================================================== */
console.log("[1] 훑개가 살아 있는가");
{
  const chartjs = 조사.filter((x) => x.파일 === "js/chart.js");
  ok(
    "js/chart.js 에서 시리즈 만드는 곳을 2곳 찾았다 (캔들 · 거래량)",
    chartjs.length === 2,
    "지금 " + chartjs.length + "곳. js/chart.js 는 ★수정 금지 파일이라 안 바뀝니다★ — " +
      "2가 아니면 봉인의 훑개가 고장난 것입니다"
  );
  ok(
    "그 2곳이 CandlestickSeries 와 HistogramSeries 다",
    chartjs.some((x) => /CandlestickSeries/.test(x.정의식)) &&
      chartjs.some((x) => /HistogramSeries/.test(x.정의식)),
    "지금 " + JSON.stringify(chartjs.map((x) => x.정의식))
  );
  ok(
    "차트 모듈 여러 곳에서 호출을 찾았다 (한 파일만 보고 있지 않다)",
    new Set(조사.map((x) => x.파일)).size >= 4,
    "지금 " + new Set(조사.map((x) => x.파일)).size + "개 파일"
  );
}

/* =====================================================================
 * [2] 옵션을 어디서 만드는지 ★전부 따라갈 수 있어야★ 합니다
 * ===================================================================== */
console.log("\n[2] 옵션 글자를 다 읽어냈는가");
{
  const 못품 = 조사.filter((x) => x.결과.상태 !== "찾음");
  ok(
    "옵션을 못 따라간 호출이 없다",
    못품.length === 0,
    못품.map((x) => x.파일 + ":" + x.줄 + " (" + x.결과.출처 + ")").join(" / ") +
      "\n      → 옵션을 ★그 자리에 직접★ 적거나, 한 도우미 함수로 모아 주세요. " +
      "봉인이 못 읽으면 그 자리가 사각지대가 됩니다"
  );
}

/* =====================================================================
 * [3] ★잠기지 않은 파일★ 은 두 옵션을 반드시 명시한다
 *     — 값이 무엇인지는 안 따집니다. "적었는가" 만 봅니다.
 *       (보조 pane 지표는 lastValueVisible:true 가 맞습니다 — 머리글 참조)
 * ===================================================================== */
console.log("\n[3] 시리즈마다 두 옵션을 적었는가 (잠기지 않은 파일)");
{
  const 대상 = 조사.filter((x) => !x.잠김 && x.결과.상태 === "찾음");
  const 빠짐 = 대상.filter((x) => !x.last || !x.price);
  ok(
    "lastValueVisible 을 안 적은 호출이 없다 (" + 대상.length + "곳 확인)",
    대상.every((x) => x.last),
    대상.filter((x) => !x.last).map((x) => x.파일 + ":" + x.줄).join(" / ") +
      "\n      → 안 적으면 라이브러리 기본값 true 가 켜져 ★가격축 눈금을 배지가 덮습니다★"
  );
  ok(
    "priceLineVisible 을 안 적은 호출이 없다 (" + 대상.length + "곳 확인)",
    대상.every((x) => x.price),
    대상.filter((x) => !x.price).map((x) => x.파일 + ":" + x.줄).join(" / ") +
      "\n      → 안 적으면 기본값 true 가 켜져 ★차트를 가로지르는 가짜 가격선★ 이 생깁니다"
  );
  ok("빠진 곳 합계가 0곳이다", 빠짐.length === 0, "지금 " + 빠짐.length + "곳");
}

/* =====================================================================
 * [4] ★잠긴 파일★ 에서 안 적은 자리는 반드시 "밖에서 끄는 모듈" 과 짝
 * ===================================================================== */
console.log("\n[4] 잠긴 파일의 빈자리는 우회 모듈과 짝인가");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
{
  const 빈자리 = 조사.filter((x) => x.잠김 && x.결과.상태 === "찾음" && (!x.last || !x.price));

  ok(
    "잠긴 파일에서 안 적은 자리가 예외 표에 있는 것뿐이다",
    빈자리.every((x) =>
      잠긴예외.some((e) => e.파일 === x.파일 && x.정의식.indexOf(e.시리즈) !== -1)
    ),
    빈자리
      .filter((x) => !잠긴예외.some((e) => e.파일 === x.파일 && x.정의식.indexOf(e.시리즈) !== -1))
      .map((x) => x.파일 + ":" + x.줄 + " " + x.정의식)
      .join(" / ") +
      "\n      → 잠긴 파일이라 못 고칩니다. ★밖에서 끄는 모듈★ 을 만들고 이 봉인의 " +
      "잠긴예외 표에 적으세요"
  );

  /* 예외 표에 적힌 자리는 ★지금도 진짜 비어 있어야★ 합니다.
     원본이 고쳐져 채워졌다면 우회 모듈이 필요 없어진 것이니 알려줍니다. */
  for (const e of 잠긴예외) {
    const 그자리 = 조사.filter((x) => x.파일 === e.파일 && x.정의식.indexOf(e.시리즈) !== -1);
    ok(
      "예외 표의 자리를 소스에서 찾았다 — " + e.파일 + " / " + e.시리즈,
      그자리.length === 1,
      "지금 " + 그자리.length + "곳"
    );
    ok(
      "그 자리가 지금도 두 옵션을 안 적은 상태다 (" + e.무엇 + ")",
      그자리.length === 1 && (!그자리[0].last || !그자리[0].price),
      "원본이 채워졌습니다. ★대표 결재로 잠긴 파일이 열린 것★ 이라면 " +
        "우회 모듈 " + e.우회모듈 + " 과 이 예외 줄을 같이 지워도 됩니다"
    );

    /* --- 우회 모듈이 살아 있는가 --- */
    const 모듈경로 = path.join(REPO, e.우회모듈);
    ok("우회 모듈이 디스크에 있다 — " + e.우회모듈, fs.existsSync(모듈경로));

    let 추적됨 = false;
    try {
      추적됨 =
        execFileSync("git", ["ls-files", "--", e.우회모듈], { cwd: REPO, encoding: "utf8" })
          .trim() !== "";
    } catch (err) {
      추적됨 = false;
    }
    ok(
      "우회 모듈이 git 에 올라가 있다",
      추적됨,
      "디스크엔 있는데 git 엔 없으면 ★clone 한 PC 에서만★ 배지가 되살아납니다 (조용한 고장)"
    );

    const 모듈 = fs.existsSync(모듈경로) ? fs.readFileSync(모듈경로, "utf8") : "";
    ok(
      "우회 모듈이 lastValueVisible 을 false 로 끈다",
      /lastValueVisible\s*:\s*false/.test(모듈),
      "js/chart.js 를 못 고치니 ★여기서 끄는 것이 유일한 길★ 입니다"
    );
    ok(
      "우회 모듈이 priceLineVisible 을 false 로 끈다",
      /priceLineVisible\s*:\s*false/.test(모듈),
      "안 끄면 차트를 가로지르는 가짜 가격선이 그대로 남습니다"
    );
    ok(
      "우회 모듈이 applyOptions 로 실제로 적용한다",
      /applyOptions\s*\(/.test(모듈),
      "글자만 있고 적용을 안 하면 아무 일도 안 일어납니다"
    );

    /* --- index.html 에서 ★원본보다 뒤★ 에 실리는가 --- */
    const 나 = HTML.indexOf('src="' + e.우회모듈 + '"');
    const 원본 = HTML.indexOf('src="' + e.파일 + '"');
    ok("index.html 이 우회 모듈을 부른다", 나 !== -1, "안 부르면 아무 일도 안 합니다");
    ok("index.html 이 원본 " + e.파일 + " 도 부른다", 원본 !== -1);
    ok(
      "★우회 모듈이 " + e.파일 + " 보다 뒤★ 에 실린다",
      나 !== -1 && 원본 !== -1 && 나 > 원본,
      "앞에 실리면 원본이 나중에 시리즈를 만들면서 배지가 되살아납니다. " +
        "지금 우회 " + 나 + " · 원본 " + 원본
    );
  }
}

/* =====================================================================
 * [5] ★가짜 가격선★ 래칫 — priceLineVisible 을 true 로 켠 곳은 0곳
 *     (2026-09-09 실측 0곳. 어느 칸에서든 차트를 가로지르는 선이라 늘 틀립니다)
 * ===================================================================== */
console.log("\n[5] 가짜 가격선을 일부러 켠 곳이 없는가");
{
  const 켠곳 = 조사.filter(
    (x) => x.결과.상태 === "찾음" && x.결과.글.some((g) => /priceLineVisible\s*:\s*true/.test(g))
  );
  ok(
    "addSeries 옵션에 priceLineVisible: true 를 적은 곳이 0곳이다",
    켠곳.length === 0,
    켠곳.map((x) => x.파일 + ":" + x.줄).join(" / ") +
      "\n      → 회원이 그 점선을 ★가격선으로 읽습니다★ (2026-09-08 P1 의 ② 가 그거였습니다)"
  );
}

/* =====================================================================
 * [6] addSeries 를 ★감싸는★ 모듈이 옵션을 흘리지 않는가
 *     js/chart-position-symbol.js · js/chart-replay.js 가 감쌉니다.
 *     인자를 그대로 안 넘기면 옵션이 통째로 사라져 배지가 되살아납니다.
 * ===================================================================== */
console.log("\n[6] addSeries 를 감싸는 곳이 옵션을 흘리지 않는가");
{
  const 감싼곳 = [];
  for (const f of 파일들) {
    const src = fs.readFileSync(f.전체, "utf8");
    const re = /\.addSeries\s*=\s*function\s*\(([^)]*)\)/g;
    let m;
    while ((m = re.exec(src))) {
      if (주석줄(src, m.index)) continue;
      const b = src.indexOf("{", m.index);
      const bc = 짝맞추기(src, b);
      감싼곳.push({
        파일: f.상대,
        줄: 줄번호(src, m.index),
        인자: m[1].trim(),
        몸: bc > b ? src.slice(b, bc + 1) : "",
      });
    }
  }
  ok(
    "감싸는 곳을 2곳 찾았다 (chart-position-symbol · chart-replay)",
    감싼곳.length >= 2,
    "지금 " + 감싼곳.length + "곳: " + 감싼곳.map((x) => x.파일 + ":" + x.줄).join(" / ")
  );
  for (const w of 감싼곳) {
    ok(
      w.파일 + ":" + w.줄 + " 이 인자를 그대로 넘긴다",
      w.인자 === "" && /\.apply\s*\(\s*[^,]+,\s*arguments\s*\)/.test(w.몸),
      "인자를 하나씩 받아 다시 넘기면 ★옵션이 조용히 사라집니다★. " +
        "지금 인자=" + JSON.stringify(w.인자)
    );
  }
}

/* =====================================================================
 * [7] 등록 — npm test 가 파일을 자동으로 찾지 않습니다
 * ===================================================================== */
console.log("\n[7] 등록");
{
  const ORDER = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", ORDER.indexOf("tests/" + SELF) !== -1);
}

/* =====================================================================
 * [8] 돌연변이 자체검증 — 봉인이 진짜로 보는가
 *     ★사본에서만 합니다. 진짜 파일은 한 글자도 안 건드립니다.★
 * ===================================================================== */
console.log("\n[8] 돌연변이 자체검증 — 진짜로 잡는가");
{
  /* ⚠️ 파일이 없으면 ★예외로 터지지 않게★ 합니다. 터지면 그 자리에서 멈춰
     아래 검사가 통째로 안 돌고, 무엇이 잘못됐는지도 안 보입니다.
     (2026-09-07 차트팀 3단계가 되돌리기에서 ENOENT 로 터져 반려된 그 모양입니다) */
  const 예 = 잠긴예외[0];
  const 모듈길 = path.join(REPO, 예.우회모듈);
  const 있음 = fs.existsSync(모듈길);
  ok(
    "돌연변이를 걸 우회 모듈이 있다 — " + 예.우회모듈,
    있음,
    "없으면 [4] 가 이미 빨갛습니다. 여기서는 예외를 내지 않고 넘어갑니다"
  );

  if (있음) {
    /* ① 우회 모듈에서 끄는 줄을 지운 사본 */
    const 원본 = fs.readFileSync(모듈길, "utf8");
    const 사본 = 원본
      .split("\n")
      .filter((ln) => !/applyOptions\(\{\s*lastValueVisible:\s*false/.test(ln))
      .join("\n");
    ok("① 돌연변이 사본이 원본과 다르다", 사본 !== 원본);
    ok(
      "① 끄는 줄을 지우면 [4] 가 빨개진다",
      !/lastValueVisible\s*:\s*false/.test(사본) || !/priceLineVisible\s*:\s*false/.test(사본),
      "지운 사본에서도 검사가 통과하면 [4] 는 아무것도 안 지키고 있는 것입니다"
    );
  }

  /* ② index.html 에서 우회 모듈을 원본 ★앞★ 으로 옮긴 사본 */
  const 줄 = '<script src="' + 예.우회모듈 + '"></script>';
  const 원본줄 = '<script src="' + 예.파일 + '"></script>';
  const HTML2 = HTML.replace(줄 + "\n", "").replace(원본줄, 줄 + "\n" + 원본줄);
  const 나2 = HTML2.indexOf('src="' + 예.우회모듈 + '"');
  const 원본2 = HTML2.indexOf('src="' + 예.파일 + '"');
  ok("② 사본이 원본 HTML 과 다르다", HTML2 !== HTML);
  ok(
    "② 우회 모듈을 " + 예.파일 + " 앞으로 옮기면 [4] 가 빨개진다",
    !(나2 !== -1 && 원본2 !== -1 && 나2 > 원본2),
    "순서를 뒤집어도 통과하면 순서 검사가 죽어 있는 것입니다"
  );

  /* ③ 옵션을 안 적은 시리즈를 새로 만든 가짜 소스 */
  const 가짜 =
    "function makeX(){ return chart.addSeries(LC.LineSeries, { color: '#F0B429' }); }";
  const r = 옵션글자(가짜, 호출들(가짜)[0].옵션식, 호출들(가짜)[0].위치);
  ok(
    "③ 옵션을 안 적은 새 시리즈를 [3] 이 잡는다",
    r.상태 === "찾음" && !키있나(r.글, "lastValueVisible") && !키있나(r.글, "priceLineVisible"),
    "새로 만든 시리즈가 안 걸리면 [3] 은 지금 상태만 외우고 있는 것입니다"
  );

  /* ④ ★안 걸려야 하는 쪽★ — 제대로 적은 시리즈는 통과해야 합니다 */
  const 착한 =
    "function makeY(){ return chart.addSeries(LC.LineSeries, " +
    "{ color: '#F0B429', lastValueVisible: false, priceLineVisible: false }); }";
  const r2 = 옵션글자(착한, 호출들(착한)[0].옵션식, 호출들(착한)[0].위치);
  ok(
    "④ 제대로 적은 시리즈는 안 걸린다 (오탐 아님)",
    r2.상태 === "찾음" && 키있나(r2.글, "lastValueVisible") && 키있나(r2.글, "priceLineVisible")
  );

  /* ⑤ ★안 걸려야 하는 쪽★ — 주석 안의 addSeries 예시는 안 셉니다 */
  const 주석 =
    "/* volumeSeries = chart.addSeries(LC.HistogramSeries, {\n" +
    " *   priceFormat: { type: 'volume' } });\n */\nvar a = 1;";
  ok("⑤ 주석 안의 addSeries 예시는 안 센다", 호출들(주석).length === 0, "지금 " + 호출들(주석).length + "곳");
}

console.log(
  "\n" +
    (fail ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m") +
    " chart-series-axis-badge-seal — 통과 " + pass + " / 실패 " + fail
);
if (fail) {
  console.log("\n실패 목록:");
  실패목록.forEach(function (m) {
    console.log("  - " + m);
  });
}
process.exit(fail ? 1 : 0);
