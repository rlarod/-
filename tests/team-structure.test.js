/* =========================================================================
 * tests/team-structure.test.js
 * =========================================================================
 * 2026-08-25 조직 개편(6팀)이 조용히 되돌아가는 것을 막습니다.
 * 2026-08-27 대표 지시로 PM 직속 "감사팀"(audit-team) 이 생겨 7팀이 됐습니다.
 *            "조직은 6팀이다" 를 못 박던 두 자리(md 파일 7개 / README 제목 "팀 6개")를
 *            사실대로 갱신했습니다. 그냥 지우지 않고 왜 바뀌었는지 여기 남깁니다.
 *
 *            실측 — 2026-08-27 12:21 .claude/agents/ 에 audit-team.md(10,556바이트)가
 *            추가되면서 md 파일이 7개 → 8개가 됐고, 옛 검사 2건이 실패했습니다.
 *
 * ⚠️ 감사팀은 다른 팀의 상사가 아닙니다. 이게 무너지면 조직이 망가집니다.
 *    감사팀은 감시 → 확인 → 판단 → PM 보고까지만 하고, 업무 배정은 오직
 *    PM 이 합니다. 그 제약이 지침에서 조용히 빠지는 것을 (11) 이 막습니다.
 *
 * ⚠️ 감사팀은 Edit·Write 를 가집니다(아주 단순한 것만 고치라고 대표가 정함).
 *    그래서 "도구가 없어야 하는 팀" 은 조사팀·점검팀 둘뿐입니다.
 *    감사팀을 그 목록에 넣으면 (2) 의 핵심 검사가 통째로 무의미해집니다.
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
 *   (1) .claude/agents/ 에 실무 6팀 + 감사팀 + README 가 있다 (md 8개)
 *   (2) [핵심] bug-hunter.md 의 tools: 에 Edit 도 Write 도 없다
 *   (3) 모든 팀 파일에 name:/description: 이 있고 name 이 파일명과 같다
 *   (4) qa-team.md 가 여섯 폭(360/375/390/768/1440/1920)을 전부 적는다
 *   (5) chart-team.md 가 js/chart.js 수정 금지 + 우회 경로를 적는다
 *   (6) CLAUDE.md 와 README.md 가 둘 다 7팀을 적는다
 *   (7) CLAUDE.md 에 2026-08-25 두 규칙이 살아 있다
 *   (8) 수정 금지 12개 파일 목록이 CLAUDE.md 에 그대로 12개다
 *   (9) 돌연변이 자체검증 — 검사 로직이 정말 잡아내는가
 *  (10) package.json 에 등록돼 있다
 *  (11) [2026-08-27 추가] 감사팀은 다른 팀의 상사가 아니다 — 제약이 살아 있는가
 *  (11-b) 감사팀 제약 문장에 대한 돌연변이 자체검증
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
/* 2026-08-27 — 지침 파일이 통째로 사라지면 read() 가 던지면서 프로세스가 죽고,
   "무엇이 왜 실패했는지" 한 줄도 안 남습니다. 실제로 감사팀 파일을 지워보는
   돌연변이 검증에서 그렇게 죽었습니다. 없으면 빈 문자열로 읽어 계속 진행합니다. */
function readOr(p, fallback) { return exists(p) ? read(p) : (fallback || ""); }

/* 실무 6팀 — 파일명(=name) 과 한글 이름. PM 아래 가로로 늘어선 팀들 */
const TEAMS = [
  { slug: "qa-team",     ko: "점검팀" },
  { slug: "bug-hunter",  ko: "조사팀" },
  { slug: "repair-team", ko: "수리팀" },
  { slug: "design-team", ko: "디자인팀" },
  { slug: "test-writer", ko: "기록팀" },
  { slug: "chart-team",  ko: "차트팀" },
];

/* 2026-08-27 신설 — 감사팀은 실무 6팀과 나란히 있지 않고 PM 직속입니다.
   실무팀 목록(TEAMS)에 섞어 넣지 않는 이유가 이것입니다. */
const AUDIT = { slug: "audit-team", ko: "감사팀" };

/* 지침 파일 전체 = 실무 6팀 + 감사팀 */
const ALL_TEAMS = TEAMS.concat([AUDIT]);

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
console.log("tests/team-structure.test.js  --  7팀 조직 봉인 (실무 6팀 + 감사팀)");
console.log("=========================================================");

/* =====================================================================
 * (1) 팀 파일 7개 + README 가 있다
 *     2026-08-27 — 감사팀이 생겨 md 가 7개 → 8개가 됐습니다.
 * ===================================================================== */
console.log("\n(1) .claude/agents/ 구성");
ok(".claude/agents/ 디렉터리가 있다", exists(AGENTS));
ALL_TEAMS.forEach(function (t) {
  ok(t.ko + " 지침 파일이 있다 (" + t.slug + ".md)", exists(path.join(AGENTS, t.slug + ".md")));
});
ok("조직 설명 README.md 가 있다", exists(path.join(AGENTS, "README.md")));

/* 팀이 늘거나 줄지 않는다 — 지침 파일은 README 포함 8개
   (2026-08-27 갱신: 팀 6 + README = 7 이었는데 감사팀이 들어와 8이 됐습니다) */
{
  const mds = fs.readdirSync(AGENTS).filter(function (f) { return /\.md$/.test(f); }).sort();
  ok("md 파일이 정확히 8개다 (실무 6팀 + 감사팀 + README)", mds.length === 8, mds.join(", "));
  ok("그 8개가 우리가 아는 파일들뿐이다",
    mds.join(",") === ALL_TEAMS.map(function (t) { return t.slug + ".md"; })
      .concat(["README.md"]).sort().join(","), mds.join(", "));
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
  const rm = readOr(path.join(AGENTS, "README.md"));
  ok("README 가 조사팀에 고칠 도구가 없다는 것을 적고 있다",
    /도구/.test(rm) && /(없습니다|없음)/.test(rm) && /bug-hunter/.test(rm));
  ok("README 가 목록을 바꾸지 말라고 못 박았다", /바꾸지 마세요|바꾸지 않습니다/.test(rm));
  ok("README 가 -180억 재발 이력을 남기고 있다", /180억/.test(rm));
}

/* =====================================================================
 * (3) 모든 팀 파일에 name:/description: 이 있고 name 이 파일명과 같다
 * ===================================================================== */
console.log("\n(3) 팀 파일 앞머리(name / description)");
ALL_TEAMS.forEach(function (t) {
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

/* 조사팀·점검팀 말고는 실제로 고칠 수 있어야 합니다 — 과잉 봉인 방지
   2026-08-27 — 감사팀도 여기 들어갑니다. 대표가 "아주 단순한 것만" 고치라고
   Edit·Write 를 준 팀입니다. 감사팀을 아래 "고칠 수 없는 팀" 쪽으로 옮기면
   (2) 의 핵심 검사와 뜻이 뒤섞여 무의미해집니다. */
console.log("\n(3-b) 과잉 봉인 방지 — 고치는 팀은 고칠 수 있다");
["repair-team", "design-team", "test-writer", "chart-team", "audit-team"].forEach(function (slug) {
  const fm = frontmatter(readOr(path.join(AGENTS, slug + ".md")));
  const tools = toolList(fm) || [];
  ok(slug + " 은 Edit 와 Write 를 가진다",
    tools.indexOf("Edit") !== -1 && tools.indexOf("Write") !== -1, tools.join(", "));
});
/* 점검팀은 찾기만 하는 팀이라 조사팀과 마찬가지로 고칠 수 없습니다 */
{
  const fm = frontmatter(readOr(path.join(AGENTS, "qa-team.md")));
  const tools = toolList(fm) || [];
  ok("점검팀(qa-team) 도 고치지 않는다 -- Edit/Write 없음",
    tools.indexOf("Edit") === -1 && tools.indexOf("Write") === -1, tools.join(", "));
}

/* 고칠 도구가 없는 팀이 정확히 누구인지 목록으로 못 박습니다.
   ─ 감사팀이 실수로 이 목록에 들어가도(= 도구를 뺏겨도),
     반대로 조사팀이 목록에서 빠져나가도(= 도구가 생겨도) 여기서 걸립니다. */
{
  const noEdit = ALL_TEAMS.filter(function (t) {
    const tools = toolList(frontmatter(readOr(path.join(AGENTS, t.slug + ".md")))) || [];
    return !tools.some(function (x) { return /edit|write/i.test(x); });
  }).map(function (t) { return t.slug; }).sort();

  ok("고칠 도구가 없는 팀은 조사팀·점검팀 둘뿐이다",
    noEdit.join(",") === "bug-hunter,qa-team", noEdit.join(", ") || "없음");
  ok("감사팀은 그 목록에 없다 (Edit/Write 를 가진 팀이다)",
    noEdit.indexOf("audit-team") === -1, noEdit.join(", "));
}

/* =====================================================================
 * (4) qa-team.md 가 여섯 폭을 전부 적는다
 *     세 폭(1920/1440/390)만 보다가 360·375 가 게이트 2에서 걸린 이력이 있습니다
 * ===================================================================== */
console.log("\n(4) 점검팀 -- 표준 점검 폭 여섯 개");
{
  const qa = readOr(path.join(AGENTS, "qa-team.md"));
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
  const ct = readOr(path.join(AGENTS, "chart-team.md"));
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
 * (6) CLAUDE.md 와 README.md 가 둘 다 7팀을 적는다
 *     2026-08-27 갱신 — 감사팀 신설로 6팀 → 7팀.
 *     옛 검사("README.md 제목이 팀 6개 다") 를 그냥 지우지 않고 새 기준으로 바꿉니다.
 * ===================================================================== */
console.log("\n(6) CLAUDE.md 와 README.md 가 같은 7팀을 적는다");
{
  const claude = read(path.join(REPO, "CLAUDE.md"));
  const rm = readOr(path.join(AGENTS, "README.md"));

  ALL_TEAMS.forEach(function (t) {
    ok("CLAUDE.md 에 " + t.ko + "(" + t.slug + ") 가 있다",
      claude.indexOf(t.ko) !== -1 && claude.indexOf(t.slug) !== -1);
  });
  TEAMS.forEach(function (t) {
    ok("README.md 에 " + t.ko + "(" + t.slug + ") 가 있다",
      rm.indexOf(t.ko) !== -1 && rm.indexOf(t.slug) !== -1);
  });
  /* 감사팀은 실무 6팀 표가 아니라 조직도 쪽에 들어갔습니다(PM 직속)

     2026-08-28 명칭 변경 — 조직도 줄이 이렇게 바뀌었습니다(대표 지시).
        전   ...             사업본부장 ── 감사팀
        후   ...       프로젝트 매니저 (PM) ── 감사팀
     검사하는 것은 이름이 아니라 "감사팀이 실무 6팀 옆에 나란히 있지 않고
     꼭대기 한 칸 아래에 따로 붙어 있다" 는 구조입니다. 뜻은 그대로 두고
     이름만 옮겼습니다. 그냥 지우지 않고 왜 바뀌었는지 여기 남깁니다. */
  ok("README.md 조직도에 감사팀이 PM 직속으로 그려져 있다",
    /PM[^\n]*감사팀/.test(rm));

  ok("README.md 제목이 팀 7개 다  (2026-08-27: 팀 6개 -> 팀 7개)", /팀 7개/.test(rm));
  ok("README.md 에 옛 '팀 6개' 가 남아 있지 않다", !/팀 6개/.test(rm));

  ok("CLAUDE.md 조직 제목이 '팀 — 7팀' 이다", /##\s*팀\s*—\s*7팀/.test(claude));
  ok("CLAUDE.md 조직도에 감사팀이 PM 직속으로 그려져 있다",
    /PM[^\n]*감사팀/.test(claude));
  ok("CLAUDE.md 팀 표에 감사팀 줄이 있다", /\|\s*\*\*감사팀\*\*\s*\|/.test(claude));
  ok("CLAUDE.md 팀 표가 감사팀은 배정을 안 한다고 적는다",
    /\|\s*\*\*감사팀\*\*\s*\|[^\n]*배정은 안 함/.test(claude));
  ok("CLAUDE.md 운영기록 양식에 감사팀 줄이 있다", /^- 감사팀: 0$/m.test(claude));
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
  const pkg = read(path.join(REPO, "tests", "_order.txt")); /* 2026-08-27 — 실행 목록이 package.json 에서 tests/_order.txt 로 옮겨졌습니다 */
  ok("npm test 목록(tests/_order.txt)에 들어 있다", /tests\/team-structure\.test\.js/.test(pkg));
}

/* =====================================================================
 * (11) [2026-08-27 추가] 감사팀은 다른 팀의 상사가 아니다
 *
 *      대표 지시문에 여러 번 강조된 제약입니다. 이게 지침에서 조용히 빠지면
 *      감사팀이 다른 팀에 직접 지시하기 시작하고, 게이트 1·2 가 우회됩니다.
 *      그러면 "PM 이 재현하고 PM 이 검증한다" 는 구조 자체가 무너집니다.
 *
 *      또 하나 — 감사팀은 "모든 팀을 계속 일하게" 하는 것이 목적이라,
 *      제약이 없으면 가치 없는 업무를 만들어내는 조직이 됩니다.
 *      그래서 "쓸데없는 업무를 만들지 않는다" 를 가장 무겁게 봅니다.
 * ===================================================================== */
console.log("\n(11) 감사팀 제약 -- 상사가 아니다 / 일을 만들지 않는다");
{
  const a = readOr(path.join(AGENTS, AUDIT.slug + ".md"));
  const fm = frontmatter(a);
  const desc = fmField(fm, "description") || "";

  /* --- 11-1 위치: PM 직속이다 --------------------------------------
     2026-08-28 대표 지시로 "사업본부장" 이 "프로젝트 매니저(PM)" 이 됐습니다.
     지키는 뜻은 그대로 — 감사팀은 실무 6팀과 나란히 있지 않고 꼭대기에 직속입니다.
     "PM 직속" / "PM직속" 둘 다 받되, 직속이라는 말 자체가 빠지면 잡습니다. */
  ok("감사팀이 PM 직속이라고 적혀 있다", /PM\s*직속/.test(a));
  ok("description 에도 직속이라고 적혀 있다", /PM\s*직속/.test(desc));

  /* --- 11-2 [핵심] 지시·배정을 하지 않는다 -------------------------- */
  ok("[핵심] '다른 팀의 상사가 아니다' 가 살아 있다", /다른 팀의 상사가 아니다/.test(a));
  /* 2026-08-28 — "사업본부장" → "PM". 지키는 뜻은 한 글자도 안 바뀌었습니다.
     감사팀이 다른 팀에 일을 시키지 못하게 막는 문장입니다.
     "PM 이" / "PM이" 둘 다 받습니다(문서마다 띄어쓰기가 다릅니다). */
  ok("[핵심] '업무 배정은 오직 PM 이' 라는 문장이 살아 있다",
    /업무 배정은[\s\S]{0,20}오직[\s\S]{0,20}PM\s*이/.test(a),
    "이 문장이 빠지면 감사팀이 다른 팀에 직접 지시하기 시작합니다");
  ok("description 이 '직접 지시하거나 업무를 배정하지 않는다' 를 적는다",
    /직접 지시하거나 업무를 배정하지 않는다/.test(desc));

  /* 하지 않는 것 네 가지가 그대로 남아 있는가 */
  [
    ["다른 팀에게 직접 지시", /직접 지시/],
    ["업무 배정",            /업무 배정/],
    ["우선순위 강제 변경",   /우선순위 강제 변경/],
    ["게이트 우회",          /게이트 우회/],
  ].forEach(function (p) {
    ok("금지 항목 '" + p[0] + "' 가 남아 있다", p[1].test(a));
  });
  ok("금지 항목들이 '절대 하지 않는 것' 절 안에 있다",
    /##\s*⛔?\s*절대 하지 않는 것[\s\S]{0,400}우선순위 강제 변경/.test(a));

  /* 역할은 보고까지 — 감시 → 확인 → 판단 → 보고 */
  ok("역할이 '감시 → 확인 → 판단 → 보고' 로 끝난다고 적는다",
    /감시\s*→\s*확인\s*→\s*판단\s*→[^\n]*보고/.test(a));
  ok("나쁜 예/좋은 예로 '팀에게 말하지 말고 PM 에게 보고' 를 보여준다",
    /나쁜 예[^\n]*고쳐/.test(a) && /좋은 예[^\n]*PM\s*에게/.test(a));

  /* --- 11-3 [핵심] 자기 수정을 스스로 승인하지 않는다 --------------- */
  ok("[핵심] '자기 수정을 스스로 승인하지 않는다' 가 살아 있다",
    /자기 수정을 스스로 승인하지 않는다/.test(a));
  ok("직접 고쳐도 게이트 2를 받는다고 적는다", /직접 고쳐도[^\n]*게이트 2/.test(a));
  ok("직접 고칠 수 있는 범위를 '아주 단순하고 명백한 것만' 으로 좁힌다",
    /아주 단순하고 명백한 것만/.test(a));
  ok("기존 관문을 우회하지 않는다고 적는다", /우회하지 않는다/.test(a));
  ok("게이트 1(PM 재현) 과 게이트 2(PM 검증) 를 둘 다 적는다",
    /게이트 1[^\n]*재현/.test(a) && /게이트 2[^\n]*검증/.test(a));

  /* --- 11-4 [핵심] 쓸데없는 업무를 만들지 않는다 --------------------
     ⚠️ 이게 제일 중요합니다. 안 지키면 감사팀이 일을 만들어내는 조직이 됩니다. */
  ok("[핵심] '쓸데없는 (일|업무) 을 만들지 않는다' 가 살아 있다",
    /쓸데없는 (일을|업무를) 만들지 않는다/.test(a));
  ok("[핵심] 그 말이 두 곳 이상(절 제목 + 마무리)에 있다",
    (a.match(/쓸데없는 (일을|업무를) 만들지 않는다/g) || []).length >= 2,
    (a.match(/쓸데없는 (일을|업무를) 만들지 않는다/g) || []).length + "곳");
  ok("'멀쩡한 기능을 바꾸지 않는다' 가 있다", /멀쩡한 기능을 바꾸지 않는다/.test(a));
  ok("'취향으로 뜯어고치지 않는다' 가 있다", /취향으로 뜯어고치지 않는다/.test(a));
  ok("'이 업무가 TL 에 실제로 어떤 가치를 더하는가' 질문이 있다",
    /가치를 더하는가/.test(a));
  ok("가치가 없으면 '유의미한 추가 업무 없음' 으로 정직하게 적는다고 한다",
    /유의미한 추가 업무 없음/.test(a));
  ok("'문제를 찾으려고 문제를 만들지 않는다' 가 있다",
    /문제를 찾으려고 문제를 만들지 않는다/.test(a));
  ok("'문제 없음' 이 정상적인 결과라고 적는다", /정상적인 감사 결과/.test(a));
  ok("느린 것과 노는 것을 구분한다고 적는다",
    /느리다는 이유만으로[^\n]*놀고 있다/.test(a));

  /* --- 11-5 절대 안 고치는 것: 수정 금지 12개 · 회원 데이터 · SQL --- */
  ok("수정 금지 파일 12개를 감사팀도 안 고친다고 적는다",
    /수정 금지 (파일 )?12개/.test(a) && /(절대 안 고친다|절대 직접 고치지 않는)/.test(a));
  ok("해시로 확인하는 법(md5sum -c /tmp/baseline.md5) 이 적혀 있다",
    /md5sum -c \/tmp\/baseline\.md5/.test(a));
  ok("회원 데이터를 지우거나 초기화하지 않는다고 적는다",
    /회원 데이터[\s\S]{0,60}지우지 않는다[\s\S]{0,40}초기화하지 않는다/.test(a));
  ok("SQL 을 직접 실행하지 않는다고 적는다",
    /SQL[\s\S]{0,30}직접 실행하지 않는다/.test(a));
  ok("로그인하지 않고 비밀번호를 입력하지 않는다고 적는다",
    /로그인[\s\S]{0,40}비밀번호를 입력하지 않는다/.test(a));
  ok("손익·랭킹·청산 계산식은 직접 고치지 않는다고 적는다",
    /손익 계산식/.test(a) && /랭킹 계산식/.test(a) && /청산 계산식/.test(a));

  /* --- 11-6 감사 대상은 여섯 팀 전부다 ------------------------------ */
  TEAMS.forEach(function (t) {
    ok("감사 대상에 " + t.ko + " 이 들어 있다", a.indexOf(t.ko) !== -1);
  });
  ok("감사 결과 다섯 가지(PASS/PARTIAL/FAIL/BLOCKED/NO ISSUE) 가 있다",
    /PASS/.test(a) && /PARTIAL/.test(a) && /FAIL/.test(a) &&
    /BLOCKED/.test(a) && /NO ISSUE/.test(a));
  ok("완료 보고를 그대로 믿지 않는다고 적는다",
    /완료 보고를 그대로 믿지 않는다/.test(a));
  ok("확인 못 한 것은 확인 못 했다고 보고한다고 적는다",
    /확인 못 한 것은 확인 못 했다고 보고한다/.test(a));
}

/* =====================================================================
 * (11-b) 감사팀 제약에 대한 돌연변이 자체검증
 *        실제 파일은 건드리지 않고, 같은 정규식에 "제약이 빠진 지침" 을 넣어
 *        정말 실패로 잡히는지 확인합니다.
 * ===================================================================== */
console.log("\n(11-b) 감사팀 제약 돌연변이 자체검증 (실제 파일은 건드리지 않음)");
{
  const 배정 = /업무 배정은[\s\S]{0,20}오직[\s\S]{0,20}PM\s*이/;
  const 자기승인 = /자기 수정을 스스로 승인하지 않는다/;
  const 쓸데없는 = /쓸데없는 (일을|업무를) 만들지 않는다/;

  ok("진짜 문장은 통과한다 (업무 배정 — 띄어 쓴 판)",
    배정.test("업무 배정은 **오직 PM 이** 한다."));
  ok("진짜 문장은 통과한다 (업무 배정 — 붙여 쓴 판)",
    배정.test("업무 배정은 **오직 PM이** 한다."));
  ok("'업무 배정은 PM 이' 를 지우면 잡아낸다",
    !배정.test("업무 배정은 감사팀이 상황을 보고 한다."));
  /* 2026-08-28 — 옛 이름으로 되돌아가는 것도 잡습니다. 명칭만 되돌려 놓고
     지침을 안 고치면 이 검사가 그 자리에서 빨개집니다. */
  ok("옛 이름(사업본부장) 으로 되돌아가면 잡아낸다",
    !배정.test("업무 배정은 **오직 사업본부장이** 한다."));
  ok("'오직' 만 빼고 슬쩍 흐려도 잡아낸다",
    !배정.test("업무 배정은 상황에 따라 감사팀도 할 수 있다."));

  ok("진짜 문장은 통과한다 (자기 승인)",
    자기승인.test("직접 고쳐도 PM의 게이트 2를 받는다. 자기 수정을 스스로 승인하지 않는다."));
  ok("'자기 수정을 스스로 승인하지 않는다' 를 지우면 잡아낸다",
    !자기승인.test("직접 고친 것은 감사팀이 스스로 확인하고 넘어간다."));

  ok("진짜 문장은 통과한다 (쓸데없는 업무)",
    쓸데없는.test("그러나 쓸데없는 업무를 만들지 않는다"));
  ok("'쓸데없는 업무를 만들지 않는다' 를 지우면 잡아낸다",
    !쓸데없는.test("팀이 놀지 않게 업무를 계속 만들어 낸다"));

  /* 도구 목록 — 감사팀과 조사팀을 헷갈리면 검사가 통째로 무의미해집니다 */
  function noEditOf(fmBody) {
    const t = toolList(fmBody) || [];
    return !t.some(function (x) { return /edit|write/i.test(x); });
  }
  ok("감사팀 tools 는 Edit/Write 를 가진 것이 정상이다",
    !noEditOf("name: audit-team\ntools: Bash, Read, Grep, Glob, Edit, Write"));
  ok("감사팀에서 Edit/Write 가 사라지면 잡아낸다",
    noEditOf("name: audit-team\ntools: Bash, Read, Grep, Glob"));
  ok("조사팀에 Write 가 몰래 생기면 여전히 잡아낸다  (기존 검사 보존)",
    !noEditOf("name: bug-hunter\ntools: Bash, Read, Grep, Glob, Write"));
}

console.log("\n=========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과");
else { console.log("실패 있음"); process.exit(1); }
process.exit(0);
