/* =========================================================================
 * tests/repo-root-hygiene.test.js
 * =========================================================================
 * ★저장소 뿌리★ 에 정체불명 파일이 커밋에 들어가는 것을 막습니다.
 *
 * ── 무엇이 실제로 있었나 (2026-09-08) ──────────────────────────────────
 *   PM 이 봉인 하나를 격리해서 확인하다가 ★worktree 뿌리에 파일을 하나 흘렸고★,
 *   git add -A 로 같이 올라갔습니다. ★아무 봉인도 안 울었습니다.★
 *
 *   tests/tests-dir-hygiene.test.js 는 ★tests/ 안만★ 봅니다.
 *   그 봉인 머리글에 적힌 사고(tests/tw-probe-tmp.js)와 ★똑같은 병인데★,
 *   흘린 자리가 한 칸 위였다는 이유로 그물 밖이었습니다.
 *
 *   CLAUDE.md 도 같은 것을 두 번 적어 뒀습니다 —
 *     "여섯 팀이 같은 작업트리를 동시에 씁니다. git add -A 는 남의 미완성을
 *      같이 올립니다." (fde463a 에서 "뺐습니다" 라고 적어놓고 799e3f6 에서 반복)
 *   ★문서에 적는 것만으로는 안 막혔습니다.★ 그래서 봉인으로 옮깁니다.
 *
 * ── 왜 뿌리가 특히 나쁜가 ──────────────────────────────────────────────
 *   · 뿌리는 ★Vercel 이 그대로 서비스하는 자리★ 입니다. 흘린 파일이
 *     https://sigma-lovat-81.vercel.app/<그이름> 으로 공개됩니다.
 *     저장소가 Public 이라 지워도 git 역사에는 남습니다.
 *   · ★오류가 안 납니다.★ 화면도 멀쩡하고 npm test 도 초록입니다.
 *     아무도 안 보다가 몇 달 뒤에 "이건 뭐지" 로 발견됩니다.
 *
 * ── 여기서만 보는 것 (두 벌 금지) ──────────────────────────────────────
 *   tests/tests-dir-hygiene.test.js   ★tests/ 안★
 *   tests/shots-gitignore-seal.test.js ★shots/ 안★ (.gitignore 대상이라 별개)
 *   여기                               ★뿌리 한 칸★ — 아무도 안 보던 자리
 *   폴더 안(js/ · css/ · docs/ …)은 ★안 봅니다.★ 거기 새 파일이 생기는 것은
 *   정상이고, index.html·문서가 가리키는지는 html-assets-tracked ·
 *   docs-sql-tracked 가 따로 봅니다.
 *
 * ── ⚠️ 기준을 "지금 있는 것" 으로 잡았습니다 ──────────────────────────
 *   뿌리에는 원래 있어야 하는 파일이 있습니다(package.json · index.html …).
 *   "뿌리에 파일이 있으면 빨강" 으로 만들면 켜자마자 12개가 빨갛습니다.
 *   ★2026-09-09 실측 — git 이 추적하는 뿌리 파일이 12개, 폴더가 9개★ 입니다.
 *   그 12개를 아래 기준목록 에 이유와 함께 적었습니다. 13번째가 나타나면
 *   빨개지고, ★왜 뿌리에 있어야 하는지 적으라★ 고 시킵니다.
 *
 * ── ⚠️ 디스크에만 있는 파일은 봐줍니다. 단 .test.js 는 예외 ────────────
 *   작업 중 임시 파일은 정상입니다 — ★커밋에 들어가는 순간★ 만 막습니다
 *   (tests-dir-hygiene 과 같은 판단입니다).
 *   딱 하나, 뿌리의 .test.js 는 추적 여부와 상관없이 잡습니다.
 *   tests/_order.txt 가 tests/ 안만 등록하므로 ★뿌리의 테스트는 아무도
 *   안 돌립니다★ — 초록인데 실은 한 번도 안 돈 테스트가 됩니다(조용한 고장).
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   ① tests/_order.txt 의 등록 줄(과 그 위 주석 문단)을 지운다
 *   ② git rm -f tests/repo-root-hygiene.test.js
 *      (rm 이 아니라 git rm — git 에 남으면 tests-dir-hygiene 이 터집니다)
 *   ③ git add tests/_order.txt
 *      (안 올리면 test-registry 가 "목록엔 있는데 git 엔 없다" 로 터집니다)
 *   ★2026-09-09 별도 worktree 에서 실제로 눌러 확인했습니다 —
 *     228개 실행 / 228개 통과 → ★227개 실행 / 227개 통과 / 0개 실패★.
 *     (되돌리기 전 원래 숫자와 정확히 같습니다)★
 *   ⚠️ 다른 파일에 딸린 것이 없습니다. 이 건은 ★혼자 되돌아갑니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SELF = "repo-root-hygiene.test.js";

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
function 절(제목) {
  console.log("\n" + 제목);
}

/* =========================================================================
 * ★기준목록★ — 2026-09-09 실측. 뿌리에 추적되는 파일 12개.
 *   새 파일을 뿌리에 두려면 여기 ★이름과 이유★ 를 적어야 합니다.
 *   ⚠️ 임시 파일을 여기 적어서 통과시키는 것으로 이 봉인을 무력화하지 마세요.
 * ========================================================================= */
const 기준목록 = {
  ".gitattributes": "줄바꿈 고정(* text=auto eol=lf). 2026-08-21 대표 승인 — 새로 clone 하면 수정 금지 12개가 전부 '변경됨' 으로 보이던 것",
  ".gitignore": "node_modules · package-lock.json · shots/",
  "CLAUDE.md": "PM 지침. 대표 문서입니다",
  "index.html": "사이트 그 자체. 빌드 도구가 없어 여기서 js/css 를 직접 부릅니다",
  "main.js": "부팅 순서 — App.<이름>.init() 을 차례로 부릅니다",
  "package.json": "npm test 가 tests/_run-all.js 를 부르는 자리",
  "style.css": "본 스타일 시트. index.html 이 뿌리 이름으로 부릅니다",
  "vercel.json": "Vercel 배포 설정. main 에 푸시하면 이 설정으로 반영됩니다",
  /* ⚠️ 아래 셋은 css/ 안이 아니라 뿌리에 있습니다. index.html 이 뿌리 이름으로
     부르고 있어 옮기면 링크가 끊깁니다. 옮기는 것은 별건이라 여기서 안 건드립니다.
     (옮길 때는 index.html 도 같이 고쳐야 하고 html-assets-tracked 가 지켜봅니다) */
  "mypage-value-fit.css": "마이페이지 값 넘침 — index.html 이 뿌리 이름으로 부릅니다",
  "stats-bar-desktop-wrap.css": "시세 바 줄바꿈(데스크톱) — 위와 같음",
  "stats-bar-mobile-wrap.css": "시세 바 줄바꿈(모바일) — 위와 같음",
  "오픈전-점검보고서.md": "정식 오픈 전 점검 결과. 지난 보고의 근거라 지우면 기록이 끊깁니다",
};

/* 뿌리에 있어야 하는 폴더 — 2026-09-09 실측 9개 */
const 기준폴더 = {
  ".claude": "팀 지침(.claude/agents/)",
  assets: "이미지 등",
  css: "스타일",
  docs: "인계문서 · 운영기록 · 백로그",
  js: "모듈",
  scripts: "dev-server 등",
  shots: "화면 캡처 — 2026-08-28 이후 .gitignore. 이미 추적 중인 것은 그대로 둡니다",
  supabase: "SQL",
  tests: "봉인",
};

/* =========================================================================
 * git 이 추적하는 것 걷기
 *   ⚠️ -z 를 씁니다 — 한글 이름(오픈전-점검보고서.md)이 있어서 그냥 ls-files 로
 *      읽으면 "\354\230\244…" 처럼 8진수로 따옴표에 싸여 나옵니다.
 *      docs-sql-tracked 가 같은 이유로 -z 를 씁니다.
 * ========================================================================= */
let 추적전체 = [];
let git됨 = true;
try {
  추적전체 = execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
} catch (e) {
  git됨 = false;
}

const 뿌리파일 = 추적전체.filter((f) => f.indexOf("/") === -1).sort();
const 뿌리폴더 = Array.from(
  new Set(추적전체.filter((f) => f.indexOf("/") >= 0).map((f) => f.slice(0, f.indexOf("/"))))
).sort();

console.log("==========================================================");
console.log(" 저장소 뿌리 위생 — 흘린 파일이 커밋에 들어갔는가");
console.log("==========================================================");

절("[1] 훑개가 살아 있는가");
{
  ok("git ls-files 를 읽었다", git됨, "git 을 못 불렀습니다 — 이 봉인은 아무것도 못 봅니다");
  ok(
    "추적되는 파일이 넉넉히 있다 (" + 추적전체.length + "개)",
    추적전체.length > 200,
    "너무 적습니다 — 훑개가 헛돌면 위반도 0 으로 나옵니다"
  );
  ok(
    "뿌리 파일을 " + 뿌리파일.length + "개 걷었다",
    뿌리파일.length > 0,
    "0 이면 걷기가 깨진 것입니다"
  );
  ok(
    "한글 이름을 안 깨뜨리고 읽었다 (ls-files -z)",
    뿌리파일.every((f) => f.indexOf("\\3") === -1 && f.charAt(0) !== '"'),
    "8진수로 싸인 이름이 있습니다: " +
      JSON.stringify(뿌리파일.filter((f) => f.charAt(0) === '"')) +
      "  → git ls-files -z 로 읽어야 합니다"
  );
}

절("[2] ★뿌리에 정체불명 파일이 커밋에 들어가 있나★  ← 본 검사");
{
  const 정체불명 = 뿌리파일.filter(
    (f) => !Object.prototype.hasOwnProperty.call(기준목록, f)
  );
  정체불명.forEach((f) => console.log("      · " + f));
  ok(
    "뿌리에 정체불명 파일이 없다 (추적 " + 뿌리파일.length + "개 검사)",
    정체불명.length === 0,
    "이런 파일이 커밋에 들어 있습니다: " +
      JSON.stringify(정체불명) +
      "\n      → 흘린 임시 파일이면 git rm --cached <파일> 로 빼세요." +
      "\n      → 정말 뿌리에 있어야 하면 이 봉인의 기준목록 에 ★이름과 이유★ 를 적으세요." +
      "\n      ⚠️ 뿌리는 Vercel 이 그대로 서비스하는 자리이고 저장소는 Public 입니다"
  );

  const 사라진것 = Object.keys(기준목록).filter((f) => 뿌리파일.indexOf(f) === -1);
  ok(
    "기준목록에 적힌 " + Object.keys(기준목록).length + "개가 전부 아직 있다",
    사라진것.length === 0,
    "없어졌습니다: " +
      JSON.stringify(사라진것) +
      "\n      → 일부러 지웠으면 기준목록에서도 지우세요. 목록이 낡으면 아무도 안 믿습니다"
  );

  ok(
    "기준목록이 불필요하게 커지지 않았다 (지금 " +
      Object.keys(기준목록).length + "개, 상한 14)",
    Object.keys(기준목록).length <= 14,
    "임시 파일을 목록에 적어서 통과시키는 것으로 이 봉인을 무력화하지 마세요. " +
      "상한을 올릴 때는 ★왜 늘렸는지★ 를 여기 같이 적으세요"
  );

  ok(
    "기준목록의 모든 줄에 ★이유★ 가 적혀 있다",
    Object.keys(기준목록).every((f) => String(기준목록[f]).trim().length >= 8),
    "이유가 빈 줄: " +
      JSON.stringify(Object.keys(기준목록).filter((f) => String(기준목록[f]).trim().length < 8)) +
      "\n      → 이름만 적으면 다음 사람이 '이게 왜 여기 있지' 를 또 물어야 합니다"
  );
}

절("[3] 뿌리 폴더가 늘지 않았나");
{
  const 새폴더 = 뿌리폴더.filter((d) => !Object.prototype.hasOwnProperty.call(기준폴더, d));
  ok(
    "뿌리에 정체불명 폴더가 없다 (" + 뿌리폴더.length + "개 검사)",
    새폴더.length === 0,
    "새 폴더: " +
      JSON.stringify(새폴더) +
      "\n      → 통째로 흘린 폴더일 수 있습니다. 맞는 폴더면 기준폴더 에 이유와 함께 적으세요"
  );
  const 사라진폴더 = Object.keys(기준폴더).filter((d) => 뿌리폴더.indexOf(d) === -1);
  ok(
    "기준폴더 " + Object.keys(기준폴더).length + "개가 전부 아직 있다",
    사라진폴더.length === 0,
    "없어졌습니다: " + JSON.stringify(사라진폴더)
  );
}

절("[4] ★뿌리의 .test.js★ — 아무도 안 돌리는 테스트");
{
  /* 추적 여부와 상관없이 디스크를 봅니다. 뿌리에 있으면 tests/_order.txt 가
     등록을 못 하므로 npm test 가 영원히 안 돌립니다. */
  let 디스크뿌리 = [];
  try {
    디스크뿌리 = fs
      .readdirSync(REPO, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name);
  } catch (e) {
    디스크뿌리 = [];
  }
  ok("뿌리를 디스크에서 읽었다 (" + 디스크뿌리.length + "개)", 디스크뿌리.length > 0);

  const 뿌리테스트 = 디스크뿌리.filter((f) => f.slice(-8) === ".test.js");
  ok(
    "뿌리에 .test.js 가 없다",
    뿌리테스트.length === 0,
    JSON.stringify(뿌리테스트) +
      "\n      → tests/ 로 옮기고 tests/_order.txt 에 등록하세요." +
      "\n      ⚠️ 뿌리에 두면 ★아무도 안 돌립니다★ — 초록인데 한 번도 안 돈 테스트가 됩니다"
  );

  /* 추적되는 것 중 임시 이름 — tests-dir-hygiene 과 같은 낱말 판정입니다.
     ⚠️ 부분 문자열로 안 봅니다. "template" 안에 "temp" 가 있습니다. */
  const 금지낱말 = ["tmp", "temp", "scratch", "backup", "bak", "copy", "사본", "test1", "asdf", "untitled"];
  const 걸린것 = [];
  뿌리파일.forEach((f) => {
    const 낱말 = f.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
    금지낱말.forEach((w) => {
      if (낱말.indexOf(w) !== -1) 걸린것.push(f + " (" + w + ")");
    });
  });
  ok(
    "추적되는 뿌리 파일 이름에 임시 낱말이 없다",
    걸린것.length === 0,
    JSON.stringify(걸린것)
  );

  const 금지꼬리 = [".orig", ".rej", ".bak", ".swp", ".log", "~"];
  const 꼬리걸림 = 뿌리파일.filter((f) => 금지꼬리.some((s) => f.slice(-s.length) === s));
  ok("추적되는 뿌리 파일에 편집 찌꺼기 확장자가 없다", 꼬리걸림.length === 0, JSON.stringify(꼬리걸림));
}

절("[5] 등록");
{
  const ORDER = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다", ORDER.indexOf("tests/" + SELF) !== -1);
  const 자기 = fs.readFileSync(__filename, "utf8");
  ok(
    "되돌리는 방법이 rm 이 아니라 ★git rm★ 으로 적혀 있다",
    /git rm -f tests\/repo-root-hygiene\.test\.js/.test(자기),
    "rm 은 디스크에서만 지웁니다 — git 에 남으면 tests-dir-hygiene 이 터집니다"
  );
}

절("[6] 돌연변이 자체검증 — 진짜로 잡는가");
{
  /* ★진짜 파일을 만들지 않습니다.★ 목록에 가짜 이름을 하나 끼워 넣어 셈만 합니다.
     (뿌리에 파일을 흘리지 않으려고 만든 봉인이 뿌리에 파일을 흘리면 안 됩니다) */
  const 가짜 = 뿌리파일.concat(["rec-probe-tmp.js"]);
  const 걸림 = 가짜.filter((f) => !Object.prototype.hasOwnProperty.call(기준목록, f));
  ok(
    "① 뿌리에 흘린 파일을 [2] 가 잡는다",
    걸림.length === 1 && 걸림[0] === "rec-probe-tmp.js",
    "지금 " + JSON.stringify(걸림)
  );

  const 가짜2 = 뿌리파일.concat(["chart-vol-badge.test.js"]);
  ok(
    "② 뿌리에 흘린 .test.js 를 [4] 가 잡는다",
    가짜2.filter((f) => f.slice(-8) === ".test.js").length === 1
  );

  const 가짜3 = ["my-temp-thing.js"];
  const 낱말걸림 = 가짜3.filter((f) =>
    f.toLowerCase().split(/[^a-z0-9가-힣]+/).indexOf("temp") !== -1
  );
  ok("③ 임시 낱말이 든 이름을 [4] 가 잡는다", 낱말걸림.length === 1);

  /* ★안 걸려야 하는 쪽★ — "template" 안의 "temp" 로 오탐이 나면 안 됩니다 */
  const 착한 = ["order-template.js", "stats-bar-mobile-wrap.css", "오픈전-점검보고서.md"];
  const 오탐 = 착한.filter((f) => {
    const 낱말 = f.toLowerCase().split(/[^a-z0-9가-힣]+/).filter(Boolean);
    return ["tmp", "temp", "bak", "copy", "사본"].some((w) => 낱말.indexOf(w) !== -1);
  });
  ok("④ template · 한글 이름이 오탐으로 안 걸린다", 오탐.length === 0, JSON.stringify(오탐));

  /* ★안 걸려야 하는 쪽★ — 폴더 안(js/ · docs/)은 이 봉인이 아예 안 봅니다 */
  ok(
    "⑤ 폴더 안 파일은 안 본다 (js/… docs/… 를 뿌리로 세지 않았다)",
    뿌리파일.every((f) => f.indexOf("/") === -1) && 추적전체.length > 뿌리파일.length
  );
}

console.log(
  "\n" +
    (fail ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m") +
    " repo-root-hygiene — 통과 " + pass + " / 실패 " + fail
);
if (fail) {
  console.log("\n실패 목록:");
  실패목록.forEach(function (m) {
    console.log("  - " + m);
  });
}
process.exit(fail ? 1 : 0);
