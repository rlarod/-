/* tests/shots-gitignore-seal.test.js
 * =========================================================================
 * 캡처 폴더(shots/) 봉인 — 2026-08-28 (기록팀)
 * =========================================================================
 * 2026-08-28 .gitignore 에 shots/ 를 넣었습니다.
 *   왜 — 미추적 캡처가 687장 172MB 였습니다. `git add -A` 한 번이면
 *        저장소 역사에 영구히 박힙니다. 되돌릴 수 없습니다.
 *        CLAUDE.md 기록상 `git add -A` 사고는 이미 두 번 났습니다.
 *   이미 추적 중이던 432장은 일부러 그대로 뒀습니다 — 지난 보고의 근거입니다.
 *
 * ── 이 봉인이 지키는 것 ────────────────────────────────────────────────
 *
 * (1) shots/ 무시 규칙이 살아 있는가
 *     규칙이 빠지면 다음 `git add -A` 에서 172MB 가 역사에 박힙니다.
 *
 * (2) 이미 추적하던 432장이 통째로 빠지지 않았는가
 *     `git rm -r --cached shots/` 한 번이면 근거 캡처가 전부 사라집니다.
 *     문서는 멀쩡히 남고 링크만 빈 채로 남는 조용한 고장입니다.
 *
 * (3) ⭐ 문서가 가리키는 캡처가 실제로 git 에 있는가
 *     CLAUDE.md 규칙 — "문서가 파일을 가리키는 관계를 새로 만들면
 *     같은 검사를 같이 만듭니다." shots/ 를 무시하기 시작한 순간
 *     이 관계가 위험해졌습니다.
 *
 *     ⚠ fs.existsSync 로는 못 잡습니다. 내 컴퓨터엔 200KB 짜리가 멀쩡히
 *        있고, clone 한 PC 에서만 빈 링크가 됩니다.
 *        이 프로젝트는 집·회사 PC 이동이 실제로 있습니다.
 *
 *     2026-08-28 실측 — docs/운영기록/2026-08-27.md 가 가리키는 캡처 5장이
 *     디스크에는 있는데(각 40~225KB) git 에는 없었습니다.
 *     shots/ 를 무시하기 시작하면서 생긴 일입니다.
 *     되살리는 법:  git add -f shots/<파일명>.png
 *
 * git 을 못 부르는 환경이면 해당 검사는 건너뜁니다(거짓 통과를 만들지
 * 않으려고, 건너뛴 사실 자체를 따로 표시합니다).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

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

console.log("\n캡처 폴더(shots/) 봉인 — 2026-08-28 기록팀");

/* ── git 목록 읽기 ──────────────────────────────────────────────────── */
let git됨 = true;
function 추적목록(하위) {
  try {
    return execFileSync("git", ["ls-files", "-z", "--", 하위],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .split(String.fromCharCode(0)).filter(Boolean);
  } catch (e) { git됨 = false; return []; }
}
const 추적shots = 추적목록("shots");
const 추적집합 = new Set(추적shots);

절("[1] 무시 규칙이 살아 있다");
{
  const IG = fs.readFileSync(path.join(REPO, ".gitignore"), "utf8");
  const 줄 = IG.split(/\r?\n/).map((s) => s.trim())
    .filter((s) => s && s.charAt(0) !== "#");
  ok(".gitignore 에 shots/ 무시 규칙이 있다",
    줄.indexOf("shots/") !== -1 || 줄.indexOf("/shots/") !== -1 || 줄.indexOf("shots") !== -1,
    "빠지면 다음 git add -A 에서 172MB 가 저장소 역사에 영구히 박힙니다");

  ok(".gitignore 자체가 git 에 올라가 있다",
    !git됨 || 추적목록(".gitignore").length === 1,
    ".gitignore 가 git 에 없으면 다른 PC 에서는 무시가 안 걸립니다");

  ok("되살리는 방법이 .gitignore 에 적혀 있다 (git add -f)",
    IG.indexOf("git add -f") !== -1,
    "꼭 남겨야 할 캡처를 어떻게 올리는지 안 적혀 있으면 다음 사람이 규칙을 통째로 지웁니다");
}

절("[2] 이미 추적하던 캡처가 통째로 빠지지 않았다");
{
  /* 2026-08-28 기준 432장. 늘어나는 건 괜찮고(=git add -f 로 근거를 남긴 것),
     줄어드는 것만 막습니다. 일부러 정리하기로 하면 이 숫자를 같이 고칩니다. */
  const 기준 = 432;
  ok("추적 중인 캡처가 " + 기준 + "장 아래로 떨어지지 않았다 (지금 " + 추적shots.length + "장)",
    !git됨 || 추적shots.length >= 기준,
    "git rm -r --cached shots/ 한 번이면 지난 보고의 근거가 전부 사라집니다");
}

절("[3] 문서가 가리키는 캡처가 git 에 있다");
{
  /* docs/ 안의 문서만 봅니다. CLAUDE.md 의 shots/x.png 는 명령 예시라
     진짜 근거 캡처가 아닙니다. */
  const 문서 = [];
  (function 훑기(디렉터리) {
    let 목록 = [];
    try { 목록 = fs.readdirSync(디렉터리, { withFileTypes: true }); } catch (e) { return; }
    목록.forEach(function (e) {
      const p = path.join(디렉터리, e.name);
      if (e.isDirectory()) 훑기(p);
      else if (e.name.slice(-3) === ".md") 문서.push(p);
    });
  })(path.join(REPO, "docs"));

  ok("docs/ 안에서 문서를 찾았다 (못 찾으면 아래 검사가 공짜로 통과합니다)",
    문서.length > 0, String(문서.length) + "개");

  const 가리킨것 = new Map();   /* 캡처경로 -> 그것을 가리키는 문서들 */
  문서.forEach(function (p) {
    const s = fs.readFileSync(p, "utf8");
    const 정규 = /shots\/[A-Za-z0-9_./-]+\.(?:png|jpg|jpeg|gif)/g;
    let m;
    while ((m = 정규.exec(s)) !== null) {
      const 키 = m[0];
      if (!가리킨것.has(키)) 가리킨것.set(키, []);
      const 어디 = path.relative(REPO, p).replace(/\\/g, "/");
      if (가리킨것.get(키).indexOf(어디) === -1) 가리킨것.get(키).push(어디);
    }
  });

  ok("문서가 캡처를 가리키고 있다 (지금 " + 가리킨것.size + "개)",
    가리킨것.size > 0, "0 이면 이 검사는 아무것도 안 지킵니다");

  const 빠진것 = [];
  가리킨것.forEach(function (어디, 캡처) {
    if (!추적집합.has(캡처)) 빠진것.push(캡처 + "  <- " + 어디.join(", "));
  });

  ok("문서가 가리키는 캡처가 전부 git 에 있다 (빠진 것 " + 빠진것.length + "개)",
    !git됨 || 빠진것.length === 0,
    "디스크엔 있어도 git 에 없으면 다른 PC 에서 빈 링크입니다. " +
    "고치는 법: git add -f <파일>\n      " + 빠진것.join("\n      "));
}

절("[4] git 을 실제로 읽었는가");
{
  /* 위 검사들은 git 을 못 읽으면 조용히 통과합니다. 그 사실을 숨기지 않습니다. */
  ok("git ls-files 를 읽었다 (못 읽었으면 위 결과는 믿을 수 없습니다)",
    git됨 && 추적shots.length > 0,
    "git 을 못 불러서 [1][2][3] 이 건너뛰어졌습니다");
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
