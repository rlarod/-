/* tests/docs-staleness.test.js
 * 문서가 실제와 어긋난 채로 남는 것("낡은 문서")을 잡습니다.
 *
 * -- 왜 필요한가 ---------------------------------------------------------
 * 2026-08-25, 승인대기 문서에 "통화 전환 버튼을 되살릴지"가 대표 답변 대기로
 * 올라 있었습니다. 그런데 그건 2026-08-18 에 이미 해결된 일이었습니다.
 * 문서만 안 지워져서 대표에게 같은 걸 또 물었고, 대표가 직접 지적했습니다.
 *
 * 점검팀 전수조사에서 같은 유형이 13건 나왔고, 가장 많이 반복된 형태가 이것입니다.
 *
 *   백로그의 "상태" 줄만 해결로 바뀌고, 본문은 미해결 시절 문장 그대로 남는다.
 *
 * 문서만 읽으면 아직 안 한 일로 보이므로, 다음 회차가 같은 걸 또 올립니다.
 *
 * -- 어떻게 지키는가 -----------------------------------------------------
 * 지금 남아 있는 어긋남은 아래 KNOWN_* 목록에 통째로 박아 둡니다(래칫).
 * 지금 것을 고치는 건 본부장 일이고, 이 테스트가 하는 일은 "늘어나지 못하게"
 * 막는 것입니다.
 *
 *   . 새 어긋남이 생기면          -> 실패
 *   . 승인대기 결번이 늘면        -> 실패
 *   . 표 줄 수와 상세 수가 틀리면 -> 실패
 *   . 없는 SQL 파일을 가리키면    -> 실패
 *   . "먼저 읽어라" 파일이 늘면   -> 실패
 *   . 어긋남을 고치면             -> 통과 (목록에서 그 줄을 지우면 됩니다)
 *
 * 문서만 읽습니다. 네트워크도 jsdom 도 쓰지 않습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? "\n      " + detail : "")); }
}
function read(rel) {
  const p = path.join(REPO, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

const 백로그_경로 = "docs/백로그.md";
const 승인대기_경로 = "docs/운영기록/승인대기.md";

console.log("\n낡은 문서 (제목만 해결로 바뀌고 본문은 그대로)");

/* =========================================================================
 * 1) 백로그 항목의 "상태"와 본문이 어긋나지 않는다   <- 핵심
 * ========================================================================= */

/* 해결로 적어 놓고 본문에 남아 있으면 안 되는 말 */
const 미해결_문구 = [
  "준비됨, 미적용",          /* TL-004 실제 사례 */
  "미적용",
  "아직 안 함",              /* TL-006 실제 사례 */
  "착수하지 않습니다",        /* TL-001 실제 사례 */
  "미착수",
  "고치면 같이 해결됩니다",    /* TL-005 실제 사례 — 미래형이면 아직 안 고친 것 */
  "뒤로 미룬다",             /* TL-002 실제 사례 — 미룬 일이 해결로 적혀 있음 */
];

/* 미착수/작업 중으로 적어 놓고 본문에 있으면 안 되는 말 (거꾸로) */
const 해결_문구 = [
  "해결됨", "해결 완료", "수정 완료", "작업 완료", "이미 고쳤", "고쳤습니다",
];

const 해결_표시 = /✅|해결/;                        /* 상태 줄이 "해결"이라고 말하는가 */
const 미해결_표시 = /미착수|작업 중|대기|미배정|보류/;  /* 상태 줄이 "아직"이라고 말하는가 */

function 백로그항목들(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const L of lines) {
    if (/^##\s/.test(L)) {
      const m = L.match(/TL-(\d{3})/);
      cur = m ? { id: "TL-" + m[1], 제목: L, 줄: [] } : null;
      if (cur) out.push(cur);
    } else if (cur) {
      cur.줄.push(L);
    }
  }
  for (const s of out) {
    const i = s.줄.findIndex((l) => l.indexOf("**상태**") >= 0);
    s.상태줄 = i >= 0 ? s.줄[i] : "";
    s.본문 = s.줄.slice(i + 1).join("\n");
    s.제목영역 = s.제목 + " " + s.상태줄;
  }
  return out;
}

/* 어긋남 한 건을 "TL-004 | 미적용" 형태의 문자열로 만듭니다.
 * 항목과 문구를 함께 키로 쓰므로, 같은 항목에 새 문구가 생겨도 잡힙니다. */
function 어긋남찾기(items) {
  const hits = [];
  for (const s of items) {
    const 해결이라고함 = 해결_표시.test(s.제목영역);
    const 아직이라고함 = 미해결_표시.test(s.상태줄);
    if (해결이라고함 && !아직이라고함) {
      for (const w of 미해결_문구) if (s.본문.indexOf(w) >= 0) hits.push(s.id + " | " + w);
    } else if (아직이라고함) {
      for (const w of 해결_문구) if (s.본문.indexOf(w) >= 0) hits.push(s.id + " | (거꾸로) " + w);
    }
  }
  return hits;
}

/* 2026-08-25 현재 남아 있는 어긋남. 본부장이 고쳐야 할 목록입니다.
 * 고치면 이 줄을 지우세요. 여기 없는 것이 새로 생기면 실패합니다. */
const KNOWN_어긋남 = [
  "TL-001 | 착수하지 않습니다",
  "TL-002 | 뒤로 미룬다",
  "TL-004 | 준비됨, 미적용",
  "TL-004 | 미적용",
  "TL-005 | 고치면 같이 해결됩니다",
  "TL-006 | 아직 안 함",
];

console.log("\n[1] 백로그 — 상태 줄과 본문이 어긋나지 않는다");
{
  const text = read(백로그_경로);
  ok("docs/백로그.md 가 있다", text !== null);
  const items = text ? 백로그항목들(text) : [];
  ok("TL 항목을 읽어냈다 (14건 이상)", items.length >= 14, "읽은 건수: " + items.length);
  const 상태없음 = items.filter((s) => !s.상태줄).map((s) => s.id);
  ok("모든 항목에 상태 줄이 있다", 상태없음.length === 0, "상태 줄 없음: " + 상태없음.join(", "));

  const hits = text ? 어긋남찾기(items) : [];
  const 새것 = hits.filter((h) => KNOWN_어긋남.indexOf(h) < 0);
  ok("새로 생긴 어긋남이 없다", 새것.length === 0,
    "새 어긋남:\n      - " + 새것.join("\n      - "));

  const 고쳐진것 = KNOWN_어긋남.filter((h) => hits.indexOf(h) < 0);
  if (고쳐진것.length) {
    console.log("    (참고) 고쳐진 어긋남 " + 고쳐진것.length + "건 — KNOWN_어긋남 에서 지워도 됩니다: "
      + 고쳐진것.join(" / "));
  }
  console.log("    남아 있는 어긋남 " + hits.length + "건: " + (hits.join(" / ") || "없음"));
}

/* =========================================================================
 * 2) 승인대기 문서의 번호가 빠지지 않는다
 * ========================================================================= */

/* "## (표시) 1. ..." 형태에서 번호만 뽑습니다. "처리 완료" 아래는 세지 않습니다. */
function 승인대기번호들(text) {
  const cut = text.split(/^#\s*✅?\s*처리 완료/m)[0];
  const nums = [];
  for (const L of cut.split(/\r?\n/)) {
    const m = L.match(/^##\s+(?:[^\s\d]+\s+)?(\d+)\.\s/);
    if (m) nums.push(Number(m[1]));
  }
  return nums;
}
function 결번(nums) {
  if (!nums.length) return [];
  const max = Math.max.apply(null, nums);
  const out = [];
  for (let i = 1; i <= max; i++) if (nums.indexOf(i) < 0) out.push(i);
  return out;
}

/* 2026-08-25 현재 알려진 결번. 통화 버튼 항목(4번)을 지우면서 생겼습니다. */
const KNOWN_결번 = [4];

console.log("\n[2] 승인대기 — 번호가 1부터 연속이다");
{
  const text = read(승인대기_경로);
  ok("docs/운영기록/승인대기.md 가 있다", text !== null);
  const nums = text ? 승인대기번호들(text) : [];
  ok("번호 붙은 항목을 읽어냈다 (3건 이상)", nums.length >= 3, "읽은 번호: " + nums.join(","));

  const 중복 = nums.filter((n, i) => nums.indexOf(n) !== i);
  ok("같은 번호가 두 번 쓰이지 않았다", 중복.length === 0, "중복 번호: " + 중복.join(","));
  ok("1번부터 시작한다", nums.length === 0 || nums.indexOf(1) >= 0, "번호: " + nums.join(","));

  const 빈번호 = 결번(nums);
  const 새결번 = 빈번호.filter((n) => KNOWN_결번.indexOf(n) < 0);
  ok("새 결번이 생기지 않았다", 새결번.length === 0,
    "새 결번: " + 새결번.join(",") + " (현재 번호: " + nums.join(",") + ")");
  console.log("    현재 번호 " + nums.join(",") + " / 결번 " + (빈번호.join(",") || "없음"));
}

/* =========================================================================
 * 3) "한눈에" 표 줄 수 = 아래 상세 항목 수
 * ========================================================================= */
function 한눈에줄수(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+한눈에/.test(l));
  if (start < 0) return null;
  let n = 0, 표시작 = false;
  for (let i = start + 1; i < lines.length; i++) {
    const L = lines[i].trim();
    if (/^##?\s/.test(L)) break;                       /* 다음 제목이면 끝 */
    if (!/^\|/.test(L)) { if (표시작) break; else continue; }
    표시작 = true;
    if (/^\|[\s\-:|]+\|$/.test(L)) continue;           /* 구분선 */
    n++;
  }
  return n - 1;                                        /* 머리줄 1개 제외 */
}

console.log("\n[3] 승인대기 — 표 줄 수와 상세 항목 수가 같다");
{
  const text = read(승인대기_경로) || "";
  const 표 = 한눈에줄수(text);
  const 상세 = 승인대기번호들(text).length;
  ok("'한눈에' 표를 찾았다", 표 !== null && 표 > 0, "표 줄 수: " + 표);
  ok("표 " + 표 + "줄 = 상세 " + 상세 + "개", 표 === 상세,
    "표에만 있거나 상세에만 있는 항목이 있습니다.");
}

/* =========================================================================
 * 4) 문서가 가리키는 SQL 파일이 실제로 있다
 * ========================================================================= */
console.log("\n[4] 문서가 가리키는 supabase/*.sql 이 실제로 있다");
{
  const 대상 = [승인대기_경로, 백로그_경로];
  const 없음 = [];
  let 검사수 = 0;
  for (const d of 대상) {
    const text = read(d);
    if (text === null) continue;
    const re = /(?:supabase\/)?[0-9A-Za-z가-힣_\-.]+\.sql/g;
    const set = {};
    let m;
    while ((m = re.exec(text)) !== null) set[m[0]] = true;
    for (const ref of Object.keys(set)) {
      const base = ref.replace(/^supabase\//, "");
      검사수++;
      if (!fs.existsSync(path.join(REPO, "supabase", base))) 없음.push(d + " -> " + ref);
    }
  }
  ok("SQL 참조를 읽어냈다 (5건 이상)", 검사수 >= 5, "읽은 참조: " + 검사수 + "건");
  ok("없는 SQL 파일을 가리키지 않는다", 없음.length === 0,
    "실제로 없는 파일:\n      - " + 없음.join("\n      - "));
}

/* =========================================================================
 * 5) "이 파일부터 읽어라"가 두 곳 넘게 주장하지 않는다
 * ========================================================================= */
const 먼저읽기_주장 = [
  /이 파일부터 읽/, /가장 먼저 이 파일을 읽/, /이 파일을 (?:가장 )?먼저 읽/,
];
/* 2026-08-25 현재 둘이 동시에 주장합니다. 하나로 정리되기 전까지 늘지만 않게 막습니다. */
const KNOWN_먼저읽기 = ["진행상태.md", "진행상태-야간.md"];

console.log("\n[5] 진행상태 — '먼저 읽어라'가 늘지 않는다");
{
  const dir = path.join(REPO, "docs/운영기록");
  const 주장 = [];
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (!/\.md$/.test(f)) continue;
      const t = fs.readFileSync(path.join(dir, f), "utf8");
      if (먼저읽기_주장.some((r) => r.test(t))) 주장.push(f);
    }
  }
  const 새것 = 주장.filter((f) => KNOWN_먼저읽기.indexOf(f) < 0);
  ok("'먼저 읽어라' 주장이 " + KNOWN_먼저읽기.length + "개를 넘지 않는다",
    주장.length <= KNOWN_먼저읽기.length, "지금 " + 주장.length + "개: " + 주장.join(", "));
  ok("알려지지 않은 파일이 새로 주장하지 않는다", 새것.length === 0, "새 주장: " + 새것.join(", "));
  console.log("    주장 중: " + (주장.join(", ") || "없음"));
}

/* =========================================================================
 * 6) 자체검증 — 탐지기가 진짜 잡는지 (진짜 문서는 건드리지 않습니다)
 * ========================================================================= */
console.log("\n[6] 자체검증 — 일부러 틀린 문서를 넣으면 잡는가");
{
  const 가짜해결 = [
    "## TL-999 · [P2] 가짜 항목",
    "",
    "**등록** 2026-01-01 · **상태** ✅ 해결 (테스트)",
    "",
    "### 고치는 방법 (아직 안 함)",
    "",
  ].join("\n");
  const h1 = 어긋남찾기(백로그항목들(가짜해결));
  ok("-> 제목 해결 + 본문 '아직 안 함' 을 잡는다", h1.indexOf("TL-999 | 아직 안 함") >= 0, h1.join(" / "));

  const 가짜거꾸로 = [
    "## TL-998 · [P3] 가짜 항목 2",
    "",
    "**등록** 2026-01-01 · **상태** 미착수 · **담당** 미배정",
    "",
    "이미 고쳤습니다.",
    "",
  ].join("\n");
  const h2 = 어긋남찾기(백로그항목들(가짜거꾸로));
  ok("-> 제목 미착수 + 본문 '이미 고쳤' 을 잡는다",
    h2.some((x) => x.indexOf("TL-998 | (거꾸로)") === 0), h2.join(" / "));

  const 정상 = [
    "## TL-997 · [P3] 가짜 항목 3",
    "",
    "**등록** 2026-01-01 · **상태** ✅ 해결 (테스트)",
    "",
    "고쳤고 배포까지 끝났습니다.",
    "",
  ].join("\n");
  ok("-> 멀쩡한 항목은 잡지 않는다 (오탐 없음)", 어긋남찾기(백로그항목들(정상)).length === 0);

  ok("-> 결번을 잡는다 (1,2,3,5 -> 4)", 결번([1, 2, 3, 5]).join(",") === "4");
  ok("-> 결번이 없으면 빈 목록이다 (1,2,3)", 결번([1, 2, 3]).length === 0);

  const 표세줄 = [
    "## 한눈에", "",
    "| 긴급 | 항목 |", "|---|---|", "| 높음 | 가 |", "| 중간 | 나 |", "| 낮음 | 다 |", "",
    "---", "",
    "## 🔴 1. 가", "", "## 🟠 2. 나", "",
  ].join("\n");
  ok("-> 표 3줄을 3으로 센다", 한눈에줄수(표세줄) === 3, "센 값: " + 한눈에줄수(표세줄));
  ok("-> 상세 2개를 2로 센다", 승인대기번호들(표세줄).length === 2);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
