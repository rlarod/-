/* tests/css-duplicate-rules.test.js
 * "같은 CSS 규칙이 두 벌" 을 잡습니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * docs/인계문서.md 3번: *"같은 CSS 규칙이 두 벌도 두 번 나왔습니다.
 * style.css 에 덧붙이다 보니 뒤엣것이 앞을 덮어써서 수정이 아예 안 먹혔습니다.
 * 고쳐도 화면이 안 바뀌면 grep -c 로 중복부터 확인하세요."*
 *
 * style.css 는 3,660줄이고 계속 뒤에 덧붙는 구조라, 앞에서 고친 값이 뒤에
 * 있는 같은 선택자에 덮여서 "고쳤는데 화면이 그대로"가 됩니다. 사람이
 * 눈으로 찾기 어려운 유형이라 기계로 지킵니다.
 *
 * ── 어떻게 지키는가 ────────────────────────────────────────────────────
 * 지금 style.css 에는 이미 중복이 81곳 있습니다(그중 44곳은 실제로 같은
 * 속성을 덮어쓰고 있습니다). 전부 없애는 것은 CSS 대수술이라 주말 모드에서
 * 할 일이 아닙니다. 그래서 **기준선(지금 상태)을 통째로 박아 두고, 여기서
 * 하나라도 늘거나 새 선택자가 중복되면 실패**시킵니다(래칫).
 *
 *   · 새 중복이 생기면          → 실패
 *   · 기존 중복의 개수가 늘면   → 실패 (×2 → ×3)
 *   · 새로 덮어쓰는 속성이 생기면 → 실패
 *   · 중복을 없애면             → 통과 (기준선에서 그 줄을 지우면 됩니다)
 *
 * ── 눈여겨볼 것 ────────────────────────────────────────────────────────
 * 기준선 안에 최근 사고 구역이 그대로 들어 있습니다.
 *   @media (max-width:400px) >> .stats-bar {gap}   ← 시세 바 gap 이 두 벌
 *   .top-banner-right {display}                    ← 통화 전환 버튼 숨김(TL-002)
 * 지금 문제가 되고 있진 않지만, 그 구역을 고칠 때는 반드시 두 벌을 다 보세요.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}

console.log("\n같은 CSS 규칙이 두 벌");

/* =========================================================================
 * 1) 탐지기 — CSS 를 규칙 단위로 훑습니다.
 *    @media 안팎을 구분합니다(다른 폭에서 다른 값을 주는 것은 중복이 아닙니다).
 *    쉼표로 묶인 선택자는 하나씩 따로 셉니다.
 * ========================================================================= */
function 규칙들(cssText) {
  const c = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const list = [];
  const ctx = [];
  let buf = "";
  for (let i = 0; i < c.length; i++) {
    const ch = c[i];
    if (ch === "{") {
      const head = buf.trim().replace(/\s+/g, " ");
      buf = "";
      if (/^@/.test(head)) { ctx.push(head); continue; }   /* @media / @supports … */
      let d = 1, j = i + 1;
      for (; j < c.length && d > 0; j++) { if (c[j] === "{") d++; else if (c[j] === "}") d--; }
      const body = c.slice(i + 1, j - 1);
      const props = (body.match(/(?:^|[;{])\s*(-{0,2}[a-zA-Z][\w-]*)\s*:/g) || [])
        .map((s) => s.replace(/[^a-zA-Z-]/g, ""));
      for (const sel of head.split(",").map((s) => s.trim()).filter(Boolean)) {
        list.push({ key: (ctx.length ? ctx.join(" >> ") + " >> " : "") + sel, props: props });
      }
      i = j - 1;
      continue;
    } else if (ch === "}") { if (ctx.length) ctx.pop(); buf = ""; continue; }
    buf += ch;
  }
  return list;
}

/* 중복 목록과 "실제로 덮어쓰는 속성" 목록을 만듭니다. */
function 검사(cssText) {
  const byKey = new Map();
  for (const r of 규칙들(cssText)) {
    if (!byKey.has(r.key)) byKey.set(r.key, []);
    byKey.get(r.key).push(r.props);
  }
  const 중복 = [], 덮어씀 = [];
  for (const [k, arr] of byKey) {
    if (arr.length < 2) continue;
    중복.push(k + " ×" + arr.length);
    const 본것 = new Set(), 겹침 = new Set();
    for (const p of arr) for (const x of p) { if (본것.has(x)) 겹침.add(x); 본것.add(x); }
    if (겹침.size) 덮어씀.push(k + " {" + [...겹침].sort().join(",") + "}");
  }
  중복.sort(); 덮어씀.sort();
  return { 중복, 덮어씀 };
}

/* =========================================================================
 * 2) 자체검증 — 탐지기가 실제로 잡는가 (합성 CSS)
 * ========================================================================= */
console.log("\n  [자체검증] 탐지기가 실제로 잡는가");
{
  ok("같은 선택자가 두 번 나오면 잡는다",
    검사(".a{color:red;}\n.b{color:blue;}\n.a{color:green;}").중복.join() === ".a ×2");
  ok("그 둘이 같은 속성을 건드리면 '덮어씀'으로도 잡는다",
    검사(".a{color:red;}\n.a{color:green;}").덮어씀.join() === ".a {color}");
  ok("서로 다른 속성이면 중복이되 덮어쓰지는 않는다고 본다",
    검사(".a{color:red;}\n.a{margin:0;}").덮어씀.length === 0);
  ok("폭이 다르면(미디어쿼리) 중복이 아니다",
    검사(".a{gap:16px;}\n@media (max-width:400px){.a{gap:10px;}}").중복.length === 0);
  ok("같은 미디어쿼리 안에서 두 번이면 잡는다",
    검사("@media (max-width:400px){.a{gap:10px;}}\n@media (max-width:400px){.a{gap:2px;}}").중복.join() === "@media (max-width:400px) >> .a ×2");
  ok("쉼표로 묶인 선택자도 하나씩 센다",
    검사(".a,.b{color:red;}\n.b{color:blue;}").중복.join() === ".b ×2");
  ok("세 번이면 ×3 으로 센다",
    검사(".a{color:red;}\n.a{color:blue;}\n.a{color:green;}").중복.join() === ".a ×3");
  ok("주석 안의 규칙은 세지 않는다",
    검사(".a{color:red;}\n/* .a{color:blue;} */").중복.length === 0);
  ok("CSS 변수 재정의도 덮어쓰기로 잡는다",
    검사(":root{--x:1px;}\n:root{--x:2px;}").덮어씀.join() === ":root {--x}");
}

/* =========================================================================
 * 3) 기준선 — 2026-08-21 style.css 의 현재 중복 상태
 *    여기서 늘어나면 실패합니다. 줄이면(중복을 없애면) 여기서 지우세요.
 * ========================================================================= */
const 중복_기준선 = [
  "#board-back-btn ×2",
  "#orderbook-tabs-content.ob-stacked > #orderbook-panel ×3",
  "#orderbook-tabs-content.ob-stacked > #recent-trades-panel ×3",
  "#orderbook-tabs-content.ob-stacked ×3",
  ".ad-creative::after ×2",
  ".ad-creative::before ×2",
  ".admin-confirm-cancel-btn ×2",
  ".admin-confirm-ok-btn ×2",
  ".amitalk-order .ami-promo ×3",
  ".amitalk-order .ami-symbol-badge ×2",
  ".amitalk-order .ami-symbol-row ×2",
  ".board-comments-section ×2",
  ".board-detail-actions ×2",
  ".board-detail-content ×2",
  ".board-detail-meta ×2",
  ".board-detail-title ×2",
  ".board-search-row input ×2",
  ".board-vote-btn ×2",
  ".board-vote-row ×2",
  ".chat-err ×2",
  ".chat-msg ×2",
  ".chat-msg-event .chat-msg-text ×2",
  ".chat-msg-event ×3",
  ".event-banner ×2",
  ".event-banner::after ×2",
  ".event-banner::before ×2",
  ".lev-modal-note ×2",
  ".margin-mode-badge ×2",
  ".menu-bar-inner ×2",
  ".ob-cum ×2",
  ".ob-qty ×2",
  ".orderbook-tabs-wrap ×3",
  ".page-left .app ×3",
  ".page-left .exchange-main ×2",
  ".page-left .exchange-shell ×2",
  ".page-left .notice-board-wrap ×2",
  ".page-right #user-panel-equity ×2",
  ".page-right #user-panel-points ×2",
  ".page-right .chat-msg-event .chat-msg-text ×2",
  ".page-right .chat-msg-event ×2",
  ".page-right .chat-msg-event.chat-event-liq .chat-msg-text ×2",
  ".page-right .chat-msg-event.chat-event-liq ×2",
  ".page-right .up-currency button ×2",
  ".page-right ×2",
  ".pos-close-btn ×2",
  ".position-table .position-symbol-sub ×2",
  ".position-table td ×4",
  ".position-table td:last-child ×2",
  ".position-table th ×3",
  ".position-table th:last-child ×3",
  ".position-table ×2",
  ".rank-badge ×2",
  ".side-ad-panel ×3",
  ".social-login-btn ×2",
  ".social-login-btn:active ×2",
  ".top-banner-nav-btn.nav-coming-soon ×2",
  ".top-banner-right ×2",
  ".top-mode-row ×2",
  ".up-avatar ×2",
  ".up-login-input ×2",
  ".up-login-input:focus ×2",
  ".up-login-submit ×2",
  ".up-login-toggle ×2",
  ".up-nav button ×2",
  ".user-panel-guest ×2",
  ":root ×2",
  "@media (max-width:1799px) >> .position-card .table-scroll > .position-table ×2",
  "@media (max-width:400px) >> .stats-bar ×2",
  "@media (min-width:1800px) >> .notice-board-wrap > .notice-box > .notice-board-list ×2",
  "@media (min-width:1800px) >> .page-right .up-head ×2",
  "@media (min-width:1800px) >> .page-right .up-nav button ×2",
  "@media (min-width:1800px) >> .page-right .up-nick ×2",
  "@media (min-width:1800px) >> .page-right .up-rank-name ×2",
  "@media (min-width:1800px) >> .page-right > .user-panel-box > .user-panel-body ×3",
  "@media (min-width:1800px) and (max-width:2200px) >> .position-table td ×2",
  "@media (min-width:1800px) and (max-width:2200px) >> .position-table th ×2",
  "body ×2",
  'html[data-theme="dark"] .menu-bar ×2',
  'html[data-theme="dark"] .notice-box ×2',
  'html[data-theme="dark"] .page-right .page-chat-panel > .field-label ×2',
  'html[data-theme="dark"] .panel ×2',
];

const 덮어씀_기준선 = [
  "#orderbook-tabs-content.ob-stacked {gap}",
  ".amitalk-order .ami-promo {align-items,background,border,display,gap,padding}",
  ".amitalk-order .ami-symbol-badge {position}",
  ".amitalk-order .ami-symbol-row {justify-content}",
  ".board-detail-actions {display,gap}",
  ".board-detail-content {border-bottom,color,font-size,line-height}",
  ".board-detail-meta {color,font-size}",
  ".board-detail-title {color,font-size,font-weight}",
  ".board-vote-btn {font-size,padding}",
  ".board-vote-row {display,gap,justify-content}",
  ".chat-err {min-height}",
  ".chat-msg-event {text-align}",
  ".event-banner {display}",
  ".lev-modal-note {color,font-size}",
  ".orderbook-tabs-wrap {margin-bottom}",
  ".page-left .app {max-width}",
  ".page-left .exchange-main {max-width}",
  ".page-right #user-panel-equity {color}",
  ".page-right #user-panel-points {color}",
  ".page-right .chat-msg-event {border-left,padding}",
  ".page-right .chat-msg-event.chat-event-liq .chat-msg-text {color,font-weight}",
  ".page-right .up-currency button {font-size}",
  ".pos-close-btn {font-size,padding}",
  ".position-table td {font-size}",
  ".position-table th {font-size}",
  ".rank-badge {align-items,display,vertical-align}",
  ".side-ad-panel {overflow}",
  ".social-login-btn {gap,letter-spacing}",
  ".social-login-btn:active {transform}",
  ".top-banner-right {display}",
  ".up-avatar {display}",
  ".up-login-input:focus {border-color}",
  ".up-login-submit {font-size}",
  ".up-nav button {gap}",
  ".user-panel-guest {padding}",
  ":root {--surface}",
  "@media (max-width:1799px) >> .position-card .table-scroll > .position-table {min-width}",
  "@media (max-width:400px) >> .stats-bar {gap}",
  "@media (min-width:1800px) >> .page-right .up-nav button {font-size}",
  "@media (min-width:1800px) >> .page-right .up-nick {font-size}",
  "@media (min-width:1800px) >> .page-right .up-rank-name {font-size}",
  "@media (min-width:1800px) >> .page-right > .user-panel-box > .user-panel-body {justify-content}",
  'html[data-theme="dark"] .menu-bar {background}',
  'html[data-theme="dark"] .page-right .page-chat-panel > .field-label {background}',
];

/* =========================================================================
 * 4) 실제 style.css 검사
 * ========================================================================= */
console.log("\n  [실제 CSS] style.css");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
{
  const r = 검사(CSS);
  console.log("    중복 선택자 " + r.중복.length + "곳 / 그중 실제로 덮어쓰는 것 " + r.덮어씀.length + "곳");

  const 새중복 = r.중복.filter((x) => 중복_기준선.indexOf(x) < 0);
  const 새덮어씀 = r.덮어씀.filter((x) => 덮어씀_기준선.indexOf(x) < 0);
  새중복.forEach((x) => console.log("    새 중복 → " + x));
  새덮어씀.forEach((x) => console.log("    새 덮어씀 → " + x));

  ok("기준선에 없는 새 중복이 없다", 새중복.length === 0, 새중복.join(" / "));
  ok("기준선에 없는 새 덮어쓰기가 없다", 새덮어씀.length === 0, 새덮어씀.join(" / "));
  ok("중복이 81곳을 넘지 않는다", r.중복.length <= 81, String(r.중복.length));
  ok("덮어쓰기가 44곳을 넘지 않는다", r.덮어씀.length <= 44, String(r.덮어씀.length));

  const 사라진 = 중복_기준선.filter((x) => r.중복.indexOf(x) < 0);
  if (사라진.length) {
    console.log("    ↓ 없어진 중복 — 기준선에서 지워도 됩니다");
    사라진.forEach((x) => console.log("      · " + x));
  }
}

/* =========================================================================
 * 5) 최근 사고 구역은 따로 이름을 불러 둡니다
 * ========================================================================= */
console.log("\n  [사고 구역] 시세 바 · 스크롤 힌트");
{
  const r = 검사(CSS);
  const 시세바관련 = r.중복.filter((x) => /stats-bar|stat-block|stat-label|stat-value|tl-stats-hint/.test(x));
  시세바관련.forEach((x) => console.log("    · " + x));

  ok("스크롤 힌트 층은 한 벌이다",
    r.중복.every((x) => x.indexOf("tl-stats-hint-layer") < 0),
    시세바관련.join(" / "));
  ok("시세 바 항목(.stat-block/.stat-label/.stat-value)은 한 벌이다",
    r.중복.every((x) => !/\.stat-(block|label|value)\b/.test(x)),
    시세바관련.join(" / "));
  ok("시세 바 중복은 기준선에 적힌 것(@400 의 gap) 하나뿐이다",
    시세바관련.length === 1 && 시세바관련[0] === "@media (max-width:400px) >> .stats-bar ×2",
    시세바관련.join(" / "));
}

/* =========================================================================
 * 6) 돌연변이 검사 — 규칙을 두 벌로 만들면 정말 잡히는가
 *    (style.css 는 안 고칩니다. 읽어온 문자열 뒤에 붙여서만 봅니다.)
 * ========================================================================= */
console.log("\n  [돌연변이] 두 벌을 만들면 정말 실패하는가");
{
  /* (가) 맨 뒤에 시세 바 규칙을 덧붙인다 — "덧붙이다 뒤엣것이 앞을 덮는" 그 모양 */
  {
    const r = 검사(CSS + "\n.stats-bar{gap:99px;}\n");
    const 새중복 = r.중복.filter((x) => 중복_기준선.indexOf(x) < 0);
    ok("→ .stats-bar 를 뒤에 덧붙이면 새 중복으로 잡힌다",
      새중복.indexOf(".stats-bar ×2") >= 0, 새중복.join(" / "));
    const 새덮어씀 = r.덮어씀.filter((x) => 덮어씀_기준선.indexOf(x) < 0);
    ok("→ 그 gap 이 앞의 gap 을 덮는다는 것도 잡는다",
      새덮어씀.indexOf(".stats-bar {gap}") >= 0, 새덮어씀.join(" / "));
  }

  /* (나) 미디어쿼리 안에 덧붙인다 — 이번 stats-bar-priority 사고와 같은 자리 */
  {
    const r = 검사(CSS + "\n@media (max-width:700px){.stats-bar{gap:1px;}}\n");
    const 새중복 = r.중복.filter((x) => 중복_기준선.indexOf(x) < 0);
    ok("→ 미디어쿼리 안에 덧붙여도 잡힌다",
      새중복.indexOf("@media (max-width:700px) >> .stats-bar ×2") >= 0, 새중복.join(" / "));
  }

  /* (다) 스크롤 힌트를 두 벌로 만든다 */
  {
    const r = 검사(CSS + "\n.tl-stats-hint-layer::after{width:1px;}\n");
    ok("→ 스크롤 힌트를 두 벌로 만들면 '한 벌이다' 검사가 실패한다",
      r.중복.some((x) => x.indexOf("tl-stats-hint-layer") >= 0));
  }

  /* (라) 이미 중복인 것을 한 벌 더 늘린다 — 개수까지 세는지 확인 */
  {
    const r = 검사(CSS + "\n.position-table td{font-size:9px;}\n");
    const 새중복 = r.중복.filter((x) => 중복_기준선.indexOf(x) < 0);
    ok("→ 이미 중복인 것이 ×4 에서 ×5 로 늘어도 잡힌다",
      새중복.indexOf(".position-table td ×5") >= 0, 새중복.join(" / "));
  }

  /* (마) 팔레트(:root)를 다시 정의한다 — 확정 팔레트가 조용히 바뀌는 경로 */
  {
    const r = 검사(CSS + "\n:root{--surface:#123456;--text:#ffffff;}\n");
    const 새중복 = r.중복.filter((x) => 중복_기준선.indexOf(x) < 0);
    ok("→ :root 를 한 벌 더 넣으면 잡힌다", 새중복.indexOf(":root ×3") >= 0, 새중복.join(" / "));
  }

  /* (바) 아무것도 안 바꾸면 통과한다 — 오탐이 없는지 */
  {
    const r = 검사(CSS);
    ok("→ 그대로 두면 새 중복이 0 이다",
      r.중복.filter((x) => 중복_기준선.indexOf(x) < 0).length === 0);
  }
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
