/* tests/docs-sql-tracked.test.js
 * =========================================================================
 * 대표가 여는 안내서가 가리키는 SQL 은 git 에도 있어야 한다
 * =========================================================================
 * 2026-08-27 — 감사팀 발견 / 본부장 배정 / 기록팀 봉인
 *
 * ── 무엇이 위험한가 ─────────────────────────────────────────────────────
 *
 *   tests/docs-staleness.test.js:244 는 `fs.existsSync` 만 봅니다.
 *   **git 에 추적되는지는 안 봅니다.**
 *
 *   그래서 이런 상태가 통과합니다 —
 *     내 컴퓨터에는 supabase/조회-무엇무엇.sql 이 있다   → existsSync 통과
 *     git add 를 안 해서 커밋에는 안 들어갔다            → 아무도 못 잡음
 *     문서(.md)만 커밋해 푸시했다                        → 안내서는 멀쩡히 보임
 *
 *   다른 PC 에서 clone 하면 **대표가 여는 안내서의 링크가 빈 파일**이 됩니다.
 *   오류도 안 나고 문서도 멀쩡해 보이는데 파일만 없습니다(조용한 고장).
 *
 *   ⚠ 이 프로젝트는 PC 이동이 실제로 있습니다 —
 *     docs/운영기록/집에서-이어받기-2026-08-26.md 가 그 증거입니다.
 *   ⚠ 2026-08-27 밤 하루에만 "디스크엔 있는데 git 엔 없는" 상황이 세 번 났습니다.
 *
 *   tests/html-assets-tracked.test.js 는 index.html 이 부르는 js/css 에
 *   대해 이미 `git ls-files` 로 이 검사를 합니다.
 *   **같은 방식을 문서 → SQL 에도 적용하는 것이 이 파일입니다.**
 *
 * ── 그래서 여기서 못 박는 것 ────────────────────────────────────────────
 *   ① 안내서 파일 자체가 디스크에 있고 git 에 추적된다
 *   ② 안내서가 가리키는 .sql 이 전부 디스크에 있다        (기존 검사와 같음)
 *   ③ 안내서가 가리키는 .sql 이 전부 git 에 추적된다      ← 이게 빠져 있었음
 *   ④ 운영기록 전체에서도 미추적 .sql 이 0건이다
 *   ⑤ 문서끼리 거는 .md 링크가 깨진 것이 지금보다 늘지 않는다
 *   ⑥ 자체검증 — 탐지기가 진짜 잡는가
 *
 * ── git 이 없는 환경 ───────────────────────────────────────────────────
 *   ③④ 를 건너뛰고 "git 없음" 을 화면에 남깁니다. **테스트를 죽이지 않습니다.**
 *   여기서 죽으면 tests/_run-all.js 의 뒤 파일들이 통째로 안 돌아갑니다.
 *
 * ── 한글 파일명 주의 ───────────────────────────────────────────────────
 *   `git ls-files` 는 기본값에서 한글을 "supabase/\354\241\260..." 처럼
 *   8진수로 escape 해서 뱉습니다. 그대로 비교하면 SQL 66개 중 한글 이름
 *   17개가 **전부 미추적으로 오탐**납니다.
 *   그래서 `-z`(NUL 구분, escape 없음) 로 읽고 NFC 로 정규화합니다.
 *   아래 [1] 에서 escape 가 섞여 들어오지 않았는지 직접 확인합니다.
 *
 * 이 파일은 파일만 읽습니다. 사이트 코드도 서버도 건드리지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " → " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

const 읽기 = (rel) => {
  try { return fs.readFileSync(path.join(REPO, rel), "utf8"); }
  catch (e) { return null; }
};
const NFC = (s) => (s && s.normalize ? s.normalize("NFC") : s);

/* -------------------------------------------------------------------------
 * 대표가 실제로 여는 안내서
 * -------------------------------------------------------------------------
 * 여기 적힌 것들은 "링크가 살아 있어야 하는" 문서입니다.
 * 운영기록 일일 파일(2026-08-21.md 등)은 지나간 기록이라 따로 다룹니다([4]).
 * ----------------------------------------------------------------------- */
const 안내서 = [
  "supabase/README-대표님-먼저-읽으세요.md",   /* 대표가 SQL 을 여는 출발점 */
  "supabase/README-함수중복.md",
  "docs/운영기록/승인대기.md",                  /* 대표가 결재하는 목록 */
  "docs/백로그.md",
  "docs/수리준비.md",                           /* 수리팀이 돌릴 SQL 안내 */
  "docs/인계문서.md",
  "docs/운영기록/집에서-이어받기-2026-08-26.md", /* PC 이동용 — 링크가 죽으면 이동 자체가 막힙니다 */
];

/* 문서 안에서 SQL 참조를 뽑습니다. docs-staleness.test.js 와 같은 정규식입니다. */
const SQL_RE = /(?:supabase\/)?[0-9A-Za-z가-힣_\-.]+\.sql/g;

function SQL참조들(text) {
  const set = {};
  let m;
  const re = new RegExp(SQL_RE.source, "g");
  while ((m = re.exec(text)) !== null) set[m[0].replace(/^supabase\//, "")] = true;
  return Object.keys(set);
}

/* 순수 함수 — [6] 자체검증이 이걸 가짜 입력으로 직접 부릅니다.
   추적목록이 null 이면 (git 없음) 미추적 판정을 아예 하지 않습니다. */
function 어긋난SQL(문서명, text, 추적목록) {
  const 없음 = [];
  const 미추적 = [];
  for (const base of SQL참조들(text)) {
    const rel = "supabase/" + base;
    if (!fs.existsSync(path.join(REPO, rel))) 없음.push(문서명 + " -> " + base);
    else if (추적목록 && !추적목록.has(NFC(rel))) 미추적.push(문서명 + " -> " + base);
  }
  return { 없음: 없음, 미추적: 미추적 };
}

/* =========================================================================
 * [1] git 추적 목록을 읽는다
 * ========================================================================= */
절("[1] git 추적 목록 읽기");
let 추적 = null;
let git없음이유 = "";
{
  try {
    const out = cp.execFileSync("git", ["ls-files", "-z"], {
      cwd: REPO, encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
    const arr = out.split("\u0000").map((s) => s.trim()).filter(Boolean);
    if (arr.length === 0) git없음이유 = "git 저장소가 아님(추적 파일 0건)";
    else 추적 = new Set(arr.map(NFC));
  } catch (e) {
    git없음이유 = "git 을 실행할 수 없음: " +
      (e && e.message ? String(e.message).split("\n")[0] : String(e));
  }

  if (!추적) {
    console.log("  · git 검사 건너뜀 — " + git없음이유);
    ok("[건너뜀] git 추적 검사 — 이유를 남겼다", true);
  } else {
    ok("git 추적 목록을 읽었다 (" + 추적.size + "개)", 추적.size > 100, String(추적.size));

    /* -z 를 빼면 한글이 8진수 escape 로 나옵니다. 그 상태로 비교하면
       한글 SQL 17개가 전부 미추적으로 오탐납니다. 그걸 여기서 막습니다. */
    const escape섞임 = Array.from(추적).filter((f) => f.indexOf("\\3") >= 0 || /^".*"$/.test(f));
    ok("추적 목록에 8진수 escape 가 섞이지 않았다", escape섞임.length === 0,
      "git ls-files 에서 -z 를 빼면 한글 이름이 깨집니다. 예: " + escape섞임.slice(0, 2).join(", "));

    const 한글SQL = Array.from(추적).filter((f) => /^supabase\/.*[가-힣].*\.sql$/.test(f));
    ok("한글 이름 SQL 을 추적 목록에서 그대로 읽었다 (" + 한글SQL.length + "개)",
      한글SQL.length >= 10, "읽힌 개수: " + 한글SQL.length);
  }
}

/* =========================================================================
 * [2] 안내서 자체가 디스크에 있고 git 에 있다
 * ========================================================================= */
절("[2] 안내서 " + 안내서.length + "개가 디스크와 git 에 둘 다 있다");
{
  const 없음 = 안내서.filter((f) => !fs.existsSync(path.join(REPO, f)));
  ok("안내서가 전부 디스크에 있다", 없음.length === 0, "없는 문서: " + 없음.join(", "));

  if (추적) {
    const 미추적 = 안내서.filter((f) => fs.existsSync(path.join(REPO, f)) && !추적.has(NFC(f)));
    ok("안내서가 전부 git 에 추적된다", 미추적.length === 0,
      "미추적 문서: " + 미추적.join(", ") + " — 다른 PC 에서 받으면 이 안내서가 아예 없습니다");
  }
}

/* =========================================================================
 * [3] 안내서가 가리키는 SQL — 디스크 + git   ← 이 파일의 핵심
 * ========================================================================= */
절("[3] 안내서가 가리키는 .sql 이 디스크와 git 에 둘 다 있다");
{
  let 검사수 = 0;
  const 없음전체 = [];
  const 미추적전체 = [];
  for (const d of 안내서) {
    const text = 읽기(d);
    if (text === null) continue;
    검사수 += SQL참조들(text).length;
    const r = 어긋난SQL(d, text, 추적);
    없음전체.push.apply(없음전체, r.없음);
    미추적전체.push.apply(미추적전체, r.미추적);
  }

  ok("안내서에서 SQL 참조를 읽어냈다 (" + 검사수 + "건, 20건 이상)", 검사수 >= 20,
    "읽은 참조가 갑자기 줄었으면 정규식이나 문서 형식이 바뀐 것입니다: " + 검사수 + "건");
  ok("없는 .sql 을 가리키지 않는다", 없음전체.length === 0,
    "\n      - " + 없음전체.join("\n      - "));

  if (추적) {
    ok("가리키는 .sql 이 전부 git 에 추적된다", 미추적전체.length === 0,
      "미추적 " + 미추적전체.length + "건:\n      - " + 미추적전체.join("\n      - ") +
      "\n      이대로 문서만 푸시하면 다른 PC 에서 대표가 여는 링크가 빈 파일이 됩니다");
  }
}

/* =========================================================================
 * [4] 운영기록 전체 — 미추적은 0건, "없는 파일" 은 늘지만 않게
 * -------------------------------------------------------------------------
 * 운영기록 일일 파일은 지나간 기록이라 이미 지워진 SQL 을 가리키는 것이
 * 있습니다. 그건 과거 사실이므로 실패시키지 않고 **개수만** 못 박습니다.
 *
 * 2026-08-27 실측 — 없는 파일 2건, 둘 다 같은 파일입니다.
 *   docs/운영기록/2026-08-21.md   -> 랭킹-버전확인.sql
 *   docs/운영기록/진행상태.md      -> 랭킹-버전확인.sql
 * 미추적은 0건입니다.
 * ========================================================================= */
절("[4] docs/ 전체 — 미추적 .sql 0건 / 없는 .sql 이 늘지 않는다");
{
  const 알려진없음 = 2;   /* 위 주석 참조. 늘리려면 왜 늘었는지 여기 적으세요 */

  const 문서들 = [];
  (function 훑기(d) {
    const abs = path.join(REPO, d);
    if (!fs.existsSync(abs)) return;
    for (const f of fs.readdirSync(abs)) {
      const rel = d + "/" + f;
      if (fs.statSync(path.join(REPO, rel)).isDirectory()) 훑기(rel);
      else if (f.endsWith(".md")) 문서들.push(rel);
    }
  })("docs");

  ok("docs/ 안의 .md 를 훑었다 (" + 문서들.length + "개)", 문서들.length >= 10, String(문서들.length));

  const 없음 = [];
  const 미추적 = [];
  for (const d of 문서들) {
    const text = 읽기(d);
    if (text === null) continue;
    const r = 어긋난SQL(d, text, 추적);
    없음.push.apply(없음, r.없음);
    미추적.push.apply(미추적, r.미추적);
  }

  if (추적) {
    ok("docs/ 어디에서도 미추적 .sql 을 가리키지 않는다", 미추적.length === 0,
      "미추적 " + 미추적.length + "건:\n      - " + 미추적.join("\n      - "));
  }
  ok("없는 .sql 참조가 " + 알려진없음 + "건을 넘지 않는다", 없음.length <= 알려진없음,
    "지금 " + 없음.length + "건:\n      - " + 없음.join("\n      - "));
  console.log("    없는 .sql 참조: " + (없음.join(" / ") || "없음"));
}

/* =========================================================================
 * [5] 문서끼리 거는 .md 링크 — 깨진 것이 하나도 없다
 * -------------------------------------------------------------------------
 * 2026-08-27 실측 — 깨진 링크 1건이었습니다.
 *   docs/운영기록/집에서-이어받기-2026-08-26.md:4
 *     "회차 시작 지침은 `docs/진행상태.md` 입니다"   ← 없는 파일
 *   실제 위치는 docs/운영기록/진행상태.md 입니다.
 *
 * 2026-08-28 — 본부장이 직접 고쳤습니다. 실측 깨진 링크 0건.
 *   그래서 기준을 1 → 0 으로 내렸습니다. 이제 하나라도 깨지면 그 자리에서 터집니다.
 *   ⚠ 기준을 다시 올리지 마세요. 링크가 깨지면 숫자가 아니라 문서를 고칩니다.
 *     다른 PC 에서 대표가 그 링크를 눌러 빈 화면을 보는 것이 이 검사의 이유입니다.
 *
 * ⚠ [4] 의 "없는 .sql 참조 2건"(랭킹-버전확인.sql) 은 여기와 다릅니다.
 *   그건 이미 지나간 하루치 기록에 남은 흔적이라 고칠 것이 아니고,
 *   "지금보다 늘지 않는다" 로 개수만 못 박아 둡니다. 0 으로 내리지 마세요.
 * ========================================================================= */
절("[5] 문서가 거는 .md 링크가 깨진 것이 하나도 없다");
{
  const 알려진깨짐 = 0;   /* 2026-08-28 본부장이 고쳐 0 건 — 위 주석 참조 */

  const 대상 = 안내서.slice();
  const MD_RE = /(?:docs|supabase|tests)\/[0-9A-Za-z가-힣_\-.\/]+\.md/g;
  const 깨짐 = [];
  for (const d of 대상) {
    const text = 읽기(d);
    if (text === null) continue;
    const set = {};
    let m;
    const re = new RegExp(MD_RE.source, "g");
    while ((m = re.exec(text)) !== null) set[m[0]] = true;
    for (const ref of Object.keys(set)) {
      if (!fs.existsSync(path.join(REPO, ref))) 깨짐.push(d + " -> " + ref);
      else if (추적 && !추적.has(NFC(ref))) 깨짐.push(d + " -> " + ref + " (git 미추적)");
    }
  }
  ok("깨진 .md 링크가 " + 알려진깨짐 + "건을 넘지 않는다", 깨짐.length <= 알려진깨짐,
    "지금 " + 깨짐.length + "건:\n      - " + 깨짐.join("\n      - "));
  console.log("    깨진 링크: " + (깨짐.join(" / ") || "없음"));
}

/* =========================================================================
 * [6] 자체검증 — 탐지기가 진짜 잡는가
 * -------------------------------------------------------------------------
 * 진짜 문서도 진짜 git 도 건드리지 않습니다. 가짜 입력만 넣어 봅니다.
 * 이게 없으면 "검사는 하는데 아무것도 못 잡는 테스트" 가 됩니다.
 * ========================================================================= */
절("[6] 자체검증 — 일부러 어긋난 것을 넣으면 잡는가");
{
  /* (가) 디스크에 있지만 git 에 없는 SQL 을 가리키는 문서 */
  const 실제있는SQL = "schema.sql";
  const 있나 = fs.existsSync(path.join(REPO, "supabase", 실제있는SQL));
  ok("자체검증 준비 — supabase/" + 실제있는SQL + " 이 디스크에 있다", 있나);

  const 가짜추적 = new Set(["supabase/딴것.sql"]);      /* schema.sql 이 빠진 추적 목록 */
  const r1 = 어긋난SQL("가짜문서.md", "`supabase/" + 실제있는SQL + "` 을 돌리세요", 가짜추적);
  ok("-> 디스크엔 있는데 git 에 없는 SQL 을 잡는다",
    r1.없음.length === 0 && r1.미추적.length === 1, JSON.stringify(r1));

  /* (나) 아예 없는 SQL 을 가리키는 문서 */
  const r2 = 어긋난SQL("가짜문서.md", "`supabase/이런건-없습니다-9999.sql` 을 돌리세요", 추적 || 가짜추적);
  ok("-> 디스크에 없는 SQL 을 잡는다", r2.없음.length === 1 && r2.미추적.length === 0, JSON.stringify(r2));

  /* (다) 멀쩡한 경우엔 잡지 않는다 (오탐 확인) */
  const 정상추적 = new Set(["supabase/" + 실제있는SQL]);
  const r3 = 어긋난SQL("가짜문서.md", "`supabase/" + 실제있는SQL + "` 을 돌리세요", 정상추적);
  ok("-> 멀쩡한 참조는 잡지 않는다", r3.없음.length === 0 && r3.미추적.length === 0, JSON.stringify(r3));

  /* (라) 한글 이름 SQL 도 정상 판정한다 — escape 오탐 방지의 실물 확인 */
  const 한글파일 = fs.readdirSync(path.join(REPO, "supabase"))
    .filter((f) => /[가-힣]/.test(f) && /\.sql$/.test(f))[0];
  if (한글파일) {
    const r4 = 어긋난SQL("가짜문서.md", "`supabase/" + 한글파일 + "`", new Set(["supabase/" + NFC(한글파일)]));
    ok("-> 한글 이름 SQL(" + 한글파일 + ") 을 오탐하지 않는다",
      r4.없음.length === 0 && r4.미추적.length === 0, JSON.stringify(r4));
  } else {
    ok("[건너뜀] 한글 이름 SQL 이 없어 확인 못 함", true);
  }

  /* (마) git 없음일 때는 미추적 판정을 아예 하지 않는다 */
  const r5 = 어긋난SQL("가짜문서.md", "`supabase/" + 실제있는SQL + "`", null);
  ok("-> git 없음(null)이면 미추적으로 실패시키지 않는다",
    r5.없음.length === 0 && r5.미추적.length === 0, JSON.stringify(r5));
}

/* =========================================================================
 * [7] 이 파일이 npm test 에 등록돼 있다
 * ========================================================================= */
절("[7] tests/_order.txt 등록");
{
  const order = 읽기("tests/_order.txt") || "";
  ok("tests/_order.txt 에 이 파일이 있다", order.indexOf("tests/docs-sql-tracked.test.js") >= 0,
    "등록하지 않으면 npm test 가 이 파일을 돌리지 않습니다");
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") + " docs-sql-tracked — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
