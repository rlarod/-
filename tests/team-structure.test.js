/* =========================================================================
 * tests/team-structure.test.js
 * =========================================================================
 * 2026-08-25 조직 개편(6팀)이 조용히 되돌아가는 것을 막습니다.
 *
 * ── 개편의 핵심 ────────────────────────────────────────────────────────
 * 조사팀(bug-hunter)에는 고칠 도구가 없습니다.
 * tools: 에 Edit 도 Write 도 넣지 않은 것은 실수가 아니라 설계입니다.
 *
 * 왜 —  랭킹 -180억 건에서 원인을 확정하지 않고 세 번 고쳤다가
 *       세 번 다 엉뚱한 곳이었습니다. 조사와 수리를 분리한 것이 그 대책입니다.
 *       조사팀이 고칠 수 있게 되는 순간 개편은 무의미해집니다.
 *
 * 대표 지시 — "이게 이번 개편의 핵심이니 도구 목록을 바꾸지 마라."
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *   (1) .claude/agents/ 에 6개 팀 파일 + README 가 있다
 *   (2) [핵심] bug-hunter.md 의 tools: 에 Edit 도 Write 도 없다
 *   (3) 모든 팀 파일에 name:/description: 이 있고 name 이 파일명과 같다
 *   (4) qa-team.md 가 여섯 폭(360/375/390/768/1440/1920)을 전부 적는다
 *   (5) chart-team.md 가 js/chart.js 수정 금지 + 우회 경로를 적는다
 *   (6) CLAUDE.md 와 README.md 가 둘 다 6팀을 적는다
 *   (7) CLAUDE.md 에 2026-08-25 두 규칙이 살아 있다
 *   (8) 수정 금지 12개 파일 목록이 CLAUDE.md 에 그대로 12개다
 *   (9) 돌연변이 자체검증 — 검사 로직이 정말 잡아내는가
 *  (10) package.json 에 등록돼 있다
 *
 * ── 이 파일은 문서만 읽습니다 ──────────────────────────────────────────
 *   사이트 코드도 서버도 건드리지 않습니다. jsdom 도 쓰지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const AGENTS = path.join(REPO, ".claude", "agents");

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [O] " + name); }
  else { fail++; console.log("  [X] " + name + (detail ? " -- " + detail : "")); }
}
function read(p) { return fs.readFileSync(p, "utf8"); }
function exists(p) { return fs.existsSync(p); }

/* 팀 6개 — 파일명(=name) 과 한글 이름 */
const TEAMS = [
  { slug: "qa-team",     ko: "점검팀" },
  { slug: "bug-hunter",  ko: "조사팀" },
  { slug: "repair-team", ko: "수리팀" },
  { slug: "design-team", ko: "디자인팀" },
  { slug: "test-writer", ko: "기록팀" },
  { slug: "chart-team",  ko: "차트팀" },
];

/* ---------------------------------------------------------------------
 * 앞머리(frontmatter) 읽기 — 파일 맨 위 --- 와 --- 사이
 * ------------------------------------------------------------------- */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  return m ? m[1] : null;
}
function fmField(fmText, key) {
  if (!fmText) return null;
  const re = new RegExp("^" + key + "\\s*:\\s*(.+)$", "m");
  const m = re.exec(fmText);
  return m ? m[1].trim() : null;
}
/* tools: Bash, Read, Grep, Glob  ->  ["Bash","Read","Grep","Glob"] */
function toolList(fmText) {
  const raw = fmField(fmText, "tools");
  if (raw === null) return null;
  return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
}

console.log("\n=========================================================");
console.log("tests/team-structure.test.js  --  6팀 조직 개편 봉인");
console.log("=========================================================");

/* =====================================================================
 * (1) 팀 파일 6개 + README 가 있다
 * ===================================================================== */
console.log("\n(1) .claude/agents/ 구성");
ok(".claude/agents/ 디렉터리가 있다", exists(AGENTS));
TEAMS.forEach(function (t) {
  ok(t.ko + " 지침 파일이 있다 (" + t.slug + ".md)", exists(path.join(AGENTS, t.slug + ".md")));
});
ok("조직 설명 README.md 가 있다", exists(path.join(AGENTS, "README.md")));

/* 팀이 6개를 넘거나 모자라지 않는다 — 지침 파일은 README 포함 7개 */
{
  const mds = fs.readdirSync(AGENTS).filter(function (f) { return /\.md$/.test(f); }).sort();
  ok("md 파일이 정확히 7개다 (팀 6 + README)", mds.length === 7, mds.join(", "));
}

/* =====================================================================
 * (2) [핵심] 조사팀에는 고칠 도구가 없다
 *     이 검사가 실패하면 개편이 되돌아간 것입니다.
 * ===================================================================== */
console.log("\n(2) [핵심] 조사팀(bug-hunter) 은 고칠 수 없다");
{
  const p = path.join(AGENTS, "bug-hunter.md");
  const fm = exists(p) ? frontmatter(read(p)) : null;
  const tools = toolList(fm);

  ok("bug-hunter.md 에 tools: 가 있다", tools !== null);
  ok("[핵심] tools: 에 Write 가 없다  (있으면 개편이 되돌아간 것)",
    !!tools && tools.indexOf("Write") === -1, tools ? tools.join(", ") : "tools 없음");
  ok("[핵심] tools: 에 Edit 가 없다  (있으면 개편이 되돌아간 것)",
    !!tools && tools.indexOf("Edit") === -1, tools ? tools.join(", ") : "tools 없음");
  ok("tools: 에 NotebookEdit 같은 다른 쓰기 도구도 없다",
    !!tools && !tools.some(function (x) { return /edit|write/i.test(x); }),
    tools ? tools.join(", ") : "tools 없음");
  ok("tools: 가 정확히 Bash, Read, Grep, Glob 넷이다",
    !!tools && tools.join(",") === "Bash,Read,Grep,Glob",
    tools ? tools.join(", ") : "tools 없음");

  /* 도구가 없다는 사실이 글로도 남아 있어야 나중에 실수로 지우지 않습니다 */
  const desc = fmField(fm, "description") || "";
  ok("description 에 고칠 권한이 없다고 적혀 있다", /고칠 권한이 없다/.test(desc));
  ok("description 에 도구가 없다는 말이 있다 (Edit/Write 언급)",
    /Edit/.test(desc) && /Write/.test(desc));

  const body = exists(p) ? read(p) : "";
  ok("본문에 고치지 않는다 원칙이 있다", /고치지 않는다/.test(body));
  ok("본문에 확신도(확실/유력/모름) 보고 규칙이 있다",
    /확신도/.test(body) && /확실/.test(body) && /유력/.test(body) && /모름/.test(body));
}

/* README 도 이 설계를 글로 못 박고 있어야 합니다 */
{
  const rm = read(path.join(AGENTS, "README.md"));
  ok("README 가 조사팀에 고칠 도구가 없다는 것을 적고 있다",
    /도구/.test(rm) && /(없습니다|없음)/.test(rm) && /bug-hunter/.test(rm));
  ok("README 가 목록을 바꾸지 말라고 못 박았다", /바꾸지 마세요|바꾸지 않습니다/.test(rm));
  ok("README 가 -180억 재발 이력을 남기고 있다", /180억/.test(rm));
}

/* =====================================================================
 * (3) 모든 팀 파일에 name:/description: 이 있고 name 이 파일명과 같다
 * ===================================================================== */
console.log("\n(3) 팀 파일 앞머리(name / description)");
TEAMS.forEach(function (t) {
  const p = path.join(AGENTS, t.slug + ".md");
  const text = exists(p) ? read(p) : "";
  const fm = frontmatter(text);
  const name = fmField(fm, "name");
  const desc = fmField(fm, "description");
  const tools = toolList(fm);

  ok(t.slug + ".md: 앞머리(---) 가 있다", fm !== null);
  ok(t.slug + ".md: name 이 파일명과 같다", name === t.slug, "name=" + name);
  ok(t.slug + ".md: description 이 있고 40자 이상이다",
    !!desc && desc.length >= 40, desc ? desc.length + "자" : "없음");
  ok(t.slug + ".md: tools 가 선언돼 있다", tools !== null && tools.length > 0);
});

/* 조사팀·점검팀 말고는 실제로 고칠 수 있어야 합니다 — 과잉 봉인 방지 */
console.log("\n(3-b) 과잉 봉인 방지 — 고치는 팀은 고칠 수 있다");
["repair-team", "design-team", "test-writer", "chart-team"].forEach(function (slug) {
  const fm = frontmatter(read(path.join(AGENTS, slug + ".md")));
  const tools = toolList(fm) || [];
  ok(slug + " 은 Edit 와 Write 를 가진다",
    tools.indexOf("Edit") !== -1 && tools.indexOf("Write") !== -1, tools.join(", "));
});
/* 점검팀은 찾기만 하는 팀이라 조사팀과 마찬가지로 고칠 수 없습니다 */
{
  const fm = frontmatter(read(path.join(AGENTS, "qa-team.md")));
  const tools = toolList(fm) || [];
  ok("점검팀(qa-team) 도 고치지 않는다 -- Edit/Write 없음",
    tools.indexOf("Edit") === -1 && tools.indexOf("Write") === -1, tools.join(", "));
}

/* =====================================================================
 * (4) qa-team.md 가 여섯 폭을 전부 적는다
 *     세 폭(1920/1440/390)만 보다가 360·375 가 게이트 2에서 걸린 이력이 있습니다
 * ===================================================================== */
console.log("\n(4) 점검팀 -- 표준 점검 폭 여섯 개");
{
  const qa = read(path.join(AGENTS, "qa-team.md"));
  ["360", "375", "390", "768", "1440", "1920"].forEach(function (w) {
    ok("qa-team.md 에 " + w + " 가 있다", new RegExp("\\b" + w + "\\b").test(qa));
  });
  ok("qa-team.md 가 여섯 크기임을 명시한다", /여섯/.test(qa));
  ok("qa-team.md 가 360 부터 맞춘다고 적는다", /360[^\n]*(부터|가장 흔)/.test(qa));
  ok("qa-team.md 가 390 만으로 통과시키지 않는다고 적는다",
    /390에서 됐다|390 에서 됐다/.test(qa));
}

/* =====================================================================
 * (5) chart-team.md -- js/chart.js 수정 금지 + 우회 경로
 * ===================================================================== */
console.log("\n(5) 차트팀 -- chart.js 우회");
{
  const ct = read(path.join(AGENTS, "chart-team.md"));
  ok("chart-team.md 가 js/chart.js 를 수정 금지로 명시한다",
    /js\/chart\.js[\s\S]{0,80}수정 금지|수정 금지[\s\S]{0,80}js\/chart\.js/.test(ct));
  ok("chart-team.md 가 우회 경로 App.ChartFont.getCharts() 를 적는다",
    /App\.ChartFont\.getCharts\(\)/.test(ct));
  ok("chart-team.md 가 chart.js 를 고쳐서 노출하는 것을 금지한다",
    /chart\.js[^\n]*금지/.test(ct));
  ok("chart-team.md 에 수정 금지 12개 목록이 들어 있다",
    /js\/trading\.js/.test(ct) && /js\/websocket\.js/.test(ct));
}

/* =====================================================================
 * (6) CLAUDE.md 와 README.md 가 둘 다 6팀을 적는다
 * ===================================================================== */
console.log("\n(6) CLAUDE.md 와 README.md 가 같은 6팀을 적는다");
{
  const claude = read(path.join(REPO, "CLAUDE.md"));
  const rm = read(path.join(AGENTS, "README.md"));

  TEAMS.forEach(function (t) {
    ok("CLAUDE.md 에 " + t.ko + "(" + t.slug + ") 가 있다",
      claude.indexOf(t.ko) !== -1 && claude.indexOf(t.slug) !== -1);
  });
  TEAMS.forEach(function (t) {
    ok("README.md 에 " + t.ko + "(" + t.slug + ") 가 있다",
      rm.indexOf(t.ko) !== -1 && rm.indexOf(t.slug) !== -1);
  });
  ok("README.md 제목이 팀 6개 다", /팀 6개/.test(rm));
  ok("CLAUDE.md 가 지침 위치(.claude/agents/) 를 알려준다",
    /\.claude\/agents\//.test(claude));
}

/* =====================================================================
 * (7) CLAUDE.md 에 2026-08-25 두 규칙이 살아 있다
 * ===================================================================== */
console.log("\n(7) 2026-08-25 새 규칙 두 개");
{
  const claude = read(path.join(REPO, "CLAUDE.md"));

  /* 규칙 1 — 조사 없이 수리팀에 배정하지 않는다 */
  ok("규칙1 제목(조사 없이 고치지 않는다) 이 있다", /조사 없이 고치지 않는다/.test(claude));
  ok("규칙1: 바로 수리팀에 배정하지 않는다고 적는다",
    /바로 수리팀에 배정하지 않/.test(claude));
  ok("규칙1: 확신도 확실 뒤에 배정한다고 적는다",
    /확신도[^\n]*확실[\s\S]{0,60}배정/.test(claude));
  ok("규칙1: -180억 세 번 헛수고 이력이 적혀 있다",
    /180억/.test(claude) && /세 번 다 엉뚱한 곳/.test(claude));
  ok("규칙1: 조사팀 도구 목록을 바꾸지 않는다고 못 박았다",
    /도구 목록을 바꾸지 않습니다|도구 목록을 바꾸지 마/.test(claude));

  /* 규칙 2 — 완료 보고에 실측 숫자 */
  ok("규칙2 제목(완료 보고에는 실측 숫자를 반드시 붙인다) 이 있다",
    /완료 보고에는 실측 숫자를 반드시 붙인다/.test(claude));
  ok("규칙2: 숫자 없는 완료 보고는 하지 않는다고 적는다",
    /숫자 없는 완료 보고는 하지 않습니다/.test(claude));
  ok("규칙2: 고친 사람이 아니라 점검팀이 잰 숫자라고 적는다",
    /점검팀이 따로 잰 숫자/.test(claude));
}

/* =====================================================================
 * (8) 수정 금지 12개 파일 목록이 CLAUDE.md 에 그대로 12개다
 * ===================================================================== */
console.log("\n(8) 수정 금지 파일 12개");
{
  const claude = read(path.join(REPO, "CLAUDE.md"));
  const FROZEN = [
    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
    "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
    "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
  ];
  ok("CLAUDE.md 에 수정 금지 파일 12개 제목이 있다", /수정 금지 파일 12개/.test(claude));

  /* 제목 아래 목록 블록만 잘라서 확인합니다 */
  const secStart = claude.indexOf("## 수정 금지 파일 12개");
  const sec = secStart === -1 ? "" : claude.slice(secStart, secStart + 2000);
  FROZEN.forEach(function (f) {
    ok("목록에 " + f + " 가 있다", sec.indexOf(f) !== -1);
  });
  const found = FROZEN.filter(function (f) { return sec.indexOf(f) !== -1; });
  ok("빠짐없이 정확히 12개다", found.length === 12, found.length + "개");

  /* 기준 해시도 12줄 그대로 남아 있어야 게이트 2가 돌아갑니다 */
  const hashes = sec.match(/^[0-9a-f]{32}\s+js\/[a-z-]+\.js$/gm) || [];
  ok("기준 md5 해시가 12줄 그대로 있다", hashes.length === 12, hashes.length + "줄");
  ok("한 글자도 고치지 않는다는 문장이 있다", /한 글자도 고치지 않습니다/.test(sec));
}

/* =====================================================================
 * (9) 돌연변이 자체검증 -- 이 검사가 정말 잡아내는가
 *     실제 파일은 건드리지 않고, 같은 파서에 틀린 내용을 넣어 봅니다.
 * ===================================================================== */
console.log("\n(9) 돌연변이 자체검증 (실제 파일은 건드리지 않음)");
{
  function toolsOf(fmBody) { return toolList(fmBody) || []; }
  const GOOD  = "name: bug-hunter\ntools: Bash, Read, Grep, Glob";
  const BAD_W = "name: bug-hunter\ntools: Bash, Read, Grep, Glob, Write";
  const BAD_E = "name: bug-hunter\ntools: Bash, Read, Edit, Grep, Glob";

  ok("정상 목록은 통과한다",
    toolsOf(GOOD).indexOf("Write") === -1 && toolsOf(GOOD).indexOf("Edit") === -1);
  ok("Write 를 몰래 넣으면 잡아낸다", toolsOf(BAD_W).indexOf("Write") !== -1);
  ok("Edit 를 몰래 넣으면 잡아낸다", toolsOf(BAD_E).indexOf("Edit") !== -1);
  ok("NotebookEdit 같은 변종도 잡아낸다",
    toolsOf("tools: Bash, NotebookEdit").some(function (x) { return /edit|write/i.test(x); }));
  ok("name 이 파일명과 어긋나면 잡아낸다", fmField("name: bug-hunterX", "name") !== "bug-hunter");
  ok("tools 줄이 통째로 사라지면 잡아낸다", toolList("name: bug-hunter") === null);
}

/* =====================================================================
 * (10) package.json 에 등록돼 있다 -- 안 넣으면 아무도 안 돌립니다
 * ===================================================================== */
console.log("\n(10) 테스트 등록");
{
  const pkg = read(path.join(REPO, "package.json"));
  ok("package.json 의 test 목록에 들어 있다", /tests\/team-structure\.test\.js/.test(pkg));
}

console.log("\n=========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과");
else { console.log("실패 있음"); process.exit(1); }
process.exit(0);
