/* tests/ad-banner-off-seal.test.js
 * =========================================================================
 * 광고 배너 끄기 봉인 — 2026-08-28 (기록팀)
 * =========================================================================
 * 2026-08-27 대표가 상단 광고 배너를 끄기로 정했습니다(A안).
 * 기능은 하나도 지우지 않았습니다 — 마크업(#top-ad-banner)은 그대로 두고
 * css/ad-banner-off.css 한 장이 화면에서만 접습니다.
 *
 * ── 왜 봉인이 필요한가 ─────────────────────────────────────────────────
 *
 * (1) 대표 결정이 <link> 한 줄에 걸려 있습니다.
 *     index.html 에서 그 한 줄이 조용히 빠지면 배너가 그대로 되살아납니다.
 *     오류도 안 나고 테스트도 안 깨집니다 — 대표가 라이브에서 보고 알게 됩니다.
 *
 * (2) 같은 곳을 건드리는 CSS 가 일곱 벌 있습니다. 2026-08-28 실측 —
 *
 *         css/ad-banner-off.css      10줄   링크 1   ← 지금 실리는 것
 *         css/ad-banner.css          34줄   링크 0
 *         css/ad-banner-b-rev2.css   97줄   링크 0
 *         css/ad-banner-line.css     81줄   링크 0
 *         css/ad-banner-slim.css     14줄   링크 0
 *         css/ad-banner-status.css   79줄   링크 0
 *         css/ad-banner-strip.css    15줄   링크 0
 *
 *     일곱 벌 전부가 #top-ad-banner 를 건드립니다(style.css 까지 여덟 곳).
 *     둘을 같이 걸면 뒤엣것이 앞을 덮습니다. 이 프로젝트에서 "같은 CSS 규칙이
 *     두 벌" 사고는 이미 두 번 났고, 그때마다 수정이 안 먹는 것처럼 보였습니다.
 *     (tests/css-duplicate-rules.test.js 가 생긴 이유입니다)
 *
 *     여섯 벌은 고르다 만 시안입니다. 지우지 않고 기록으로 남깁니다.
 *     ⚠ 그래서 이 봉인은 "있어야 한다" 가 아니라 "실리면 안 된다" 만 봅니다.
 *        나중에 정리하기로 하면 지워도 이 봉인은 안 깨집니다.
 *
 * (3) "index.html 에 없으면 안 실린다" 가 참이려면, 어디서도 CSS 를 코드로
 *     끼워 넣지 않아야 합니다. 2026-08-28 확인 — js/ 안에 stylesheet 링크를
 *     만드는 코드가 한 곳도 없습니다. 그 사실도 같이 못 박습니다.
 *     (생기면 이 봉인의 전제가 무너지므로 그때 알아야 합니다)
 *
 * 서버도 브라우저도 부르지 않습니다. 파일만 읽습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const HTML = read("index.html");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/** index.html 이 실제로 <link> 로 부르는 css 목록 */
function 링크된CSS() {
  const 나온것 = [];
  const 정규 = /<link[^>]+href\s*=\s*["']([^"']+\.css)["'][^>]*>/gi;
  let m;
  while ((m = 정규.exec(HTML)) !== null) 나온것.push(m[1]);
  return 나온것;
}

const 링크 = 링크된CSS();
const 켜는것 = "css/ad-banner-off.css";

console.log("\n광고 배너 끄기 봉인 — 2026-08-27 대표 결정 (2026-08-28 기록팀)");

/* =========================================================================
 * [1] 대표 결정 — 배너는 꺼져 있다
 * ========================================================================= */
절("[1] 배너를 접는 CSS 가 실려 있다");
{
  ok("index.html 이 " + 켜는것 + " 를 부른다 (2026-08-27 대표 결정)",
    링크.indexOf(켜는것) !== -1,
    "이 한 줄이 빠지면 배너가 그대로 되살아납니다");
  ok("한 번만 부른다", 링크.filter((f) => f === 켜는것).length === 1,
    String(링크.filter((f) => f === 켜는것).length) + "번");

  const OFF = read(켜는것);
  ok("그 파일이 실제로 배너를 숨긴다 (#top-ad-banner 를 display:none 으로)",
    /#top-ad-banner\s*\{[^}]*display\s*:\s*none/.test(OFF),
    "파일은 실려 있는데 내용이 바뀌면 배너가 조용히 돌아옵니다");
  ok("되돌리는 방법이 그 파일에 적혀 있다",
    OFF.indexOf("되돌리기") !== -1 && OFF.indexOf("link") !== -1);
  ok("왜 껐는지 근거가 적혀 있다 (바이낸스·업비트에 가로 배너가 0개)",
    OFF.indexOf("바이낸스") !== -1 && OFF.indexOf("업비트") !== -1);
}

/* =========================================================================
 * [2] 기능은 지우지 않았다 — 마크업은 그대로
 * ========================================================================= */
절("[2] 마크업은 그대로 남아 있다 (되돌릴 수 있어야 합니다)");
{
  ok("#top-ad-banner 마크업이 index.html 에 그대로 있다",
    HTML.indexOf("id=\"top-ad-banner\"") !== -1,
    "마크업까지 지우면 link 한 줄로는 되돌릴 수 없습니다");
  ok("index.html 에 이 결정이 누구 것인지 적혀 있다",
    HTML.indexOf("대표 결정") !== -1 && HTML.indexOf("A안") !== -1);
}

/* =========================================================================
 * [3] 시안 여섯 벌은 실리지 않는다 — 두 벌이 붙으면 서로 덮습니다
 * ========================================================================= */
절("[3] 고르다 만 시안 CSS 가 실리지 않는다");
{
  /* 파일 목록을 직접 읽습니다 — 새 시안이 늘어도 자동으로 걸립니다 */
  const 배너CSS = fs.readdirSync(path.join(REPO, "css"))
    .filter((f) => f.indexOf("ad-banner") === 0 && f.slice(-4) === ".css")
    .map((f) => "css/" + f)
    .sort();

  ok("css/ 안에 ad-banner 로 시작하는 CSS 를 찾았다 (지금 " + 배너CSS.length + "벌)",
    배너CSS.length >= 1, JSON.stringify(배너CSS));

  const 실린배너 = 배너CSS.filter((f) => 링크.indexOf(f) !== -1);
  ok("배너 CSS 중 실리는 것은 정확히 한 벌이다 (지금: " + JSON.stringify(실린배너) + ")",
    실린배너.length === 1 && 실린배너[0] === 켜는것,
    "두 벌이 실리면 뒤엣것이 앞을 덮습니다. " +
    "이 프로젝트에서 이미 두 번 났던 사고입니다 (tests/css-duplicate-rules.test.js)");

  배너CSS.filter((f) => f !== 켜는것).forEach(function (f) {
    ok(f + " 는 실리지 않는다 (고르다 만 시안)", 링크.indexOf(f) === -1,
      "실으려면 " + 켜는것 + " 를 먼저 빼야 합니다 — 둘 다 #top-ad-banner 를 건드립니다");
  });
}

/* =========================================================================
 * [4] "index.html 에 없으면 안 실린다" 가 참인가
 * ========================================================================= */
절("[4] CSS 를 코드로 끼워 넣는 곳이 없다 (위 [3] 의 전제)");
{
  const js목록 = fs.readdirSync(path.join(REPO, "js")).filter((f) => f.slice(-3) === ".js");
  const 끼워넣는것 = js목록.filter(function (f) {
    const s = read("js/" + f);
    /* 주석은 빼고 봅니다 — 파일 이름이 설명에 적혀 있어 오탐이 납니다 */
    const 코드 = s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    return /createElement\(\s*["']link["']\s*\)/.test(코드) ||
      /rel\s*=\s*["']stylesheet["']/.test(코드);
  });
  ok("js/ 안에 stylesheet 링크를 만드는 코드가 없다 (지금: " + JSON.stringify(끼워넣는것) + ")",
    끼워넣는것.length === 0,
    "생기면 [3] 의 '실리지 않는다' 가 더 이상 참이 아닙니다 — 그 파일도 같이 봐야 합니다");
}

/* =========================================================================
 * [5] git 에 올라가 있는가 — 실리는 한 벌만은 반드시
 * ========================================================================= */
절("[5] 실리는 CSS 가 git 에 올라가 있다");
{
  let 추적목록 = "";
  let git됨 = true;
  try {
    추적목록 = execFileSync("git", ["ls-files", "-z", "--", "css", "index.html"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { git됨 = false; }
  const 추적 = new Set(추적목록.split(String.fromCharCode(0)).filter(Boolean));

  /* fs.existsSync 로는 못 잡습니다 — 내 컴퓨터엔 있고 git 엔 없으면
     clone 한 PC 와 라이브에서만 404 입니다. */
  ok(켜는것 + " 가 git 에 올라가 있다",
    !git됨 || 추적.has(켜는것),
    "git 에 없으면 라이브에서 이 파일이 404 라 배너가 되살아납니다");

  링크.forEach(function (f) {
    if (f.indexOf("ad-banner") === -1) return;
    ok(f + " 가 git 에 올라가 있다", !git됨 || 추적.has(f));
  });
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
