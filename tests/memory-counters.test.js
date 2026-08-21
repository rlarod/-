/* tests/memory-counters.test.js
 * "새로고침하면 0 이 되는 카운터"를 잡습니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * docs/인계문서.md 3번에 이 유형이 **세 번** 나왔다고 적혀 있습니다.
 *
 *   js/trade-events-chat.js  lastSeenClosedCount  같은 청산 알림이 새로고침마다 재발송
 *   js/supabase-sync.js      lastSyncedTradesCount 거래내역이 통째로 재저장 → 실서버 7,261건 중복
 *   js/cycle-pnl.js 초기 버전 캐시한 Set          창을 두 개 띄우면 서로 못 봄
 *
 * 공통 모양 — "이미 했다"를 메모리 변수 하나로만 기억합니다. 페이지를 열
 * 때마다 그 변수는 처음 값으로 돌아가므로, 이미 한 일을 다시 합니다.
 * 창을 두 개 띄우면 서로의 기억을 못 봅니다.
 *
 * 고친 방식 — 저장소(App.Storage)에 남기거나, 시각·id 같은 고유값으로
 * 판단합니다. trade-events-chat.js 는 한 걸음 더 나가서 **매번 저장소를
 * 다시 읽습니다**(메모리에 들고 있으면 창 두 개가 서로 못 보기 때문).
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) "이미 했다"를 뜻하는 이름의 모듈 변수가 저장소 없이 새로 생기면 실패
 *  (2) 이미 고친 두 곳(trade-events-chat.js, cycle-pnl.js)이 되돌아가면 실패
 *  (3) 아직 못 고친 곳(supabase-sync.js — 수정 금지)은 서버가 막고 있는지 확인
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}

console.log("\n새로고침하면 0 이 되는 카운터");

/* ── 지금 있어도 되는 것(전부 이유가 확인됨) ─────────────────────────
   여기 없는 것이 새로 생기면 실패합니다. */
const 허용목록 = [
  { 곳: "js/chat.js", 변수: "seenIds", 사유: "메시지 id(서버가 준 고유값)로 판단합니다 — 인계문서가 권하는 바로 그 방식. 새로고침하면 화면도 함께 비므로 같이 0 이 되는 것이 맞습니다" },
  { 곳: "js/chat.js", 변수: "lastSentAt", 사유: "도배 방지 간격 재기(Date.now() 와 비교). 새로고침 때 0 이어도 손해가 없습니다" },
  { 곳: "js/login-required.js", 변수: "notified", 사유: "같은 안내창이 0.8초 안에 두 번 뜨지 않게 하는 간격. 세션 안에서만 의미 있습니다" },
  { 곳: "js/multi-tab-guard.js", 변수: "notified", 사유: "이 탭에서 경고를 한 번만 띄우기 위한 표시. 탭 단위가 맞습니다" },
  { 곳: "js/supabase-sync.js", 변수: "lastSyncedTradesCount", 사유: "⚠️ 진짜 결함. 수정 금지 파일이라 서버(supabase/schema-trades-dedupe.sql)가 막습니다" },
];

/* =========================================================================
 * 1) 탐지기
 *
 * 모듈 범위(들여쓰기 2칸 — 이 저장소의 IIFE 관례)에서 선언되고,
 * 이름이 "이미 했다"를 뜻하며, 빈 상태로 시작하는 변수를 찾습니다.
 * ========================================================================= */
const 의도이름 = /^(seen|sent|notified|already|processed|handled|posted|synced|lastSeen|lastSent|lastSynced|lastNotified|lastPosted|lastHandled)\w*$|^\w*(Seen|Sent|Notified|Synced|Posted|Handled)\w*$/;
const 빈상태 = /^(0|null|false|new Set\(\)|new Map\(\)|\[\]|\{\})$/;

function 기억변수찾기(src, 파일명) {
  /* 주석은 지우되 줄 수는 그대로 둡니다. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
  const 저장소씀 = /App\.Storage|localStorage|sessionStorage/.test(code);
  const out = [];
  code.split(/\r?\n/).forEach((line, i) => {
    const m = /^ {2}(?:let|var|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;,]+)[;,]/.exec(line);
    if (!m) return;
    if (!의도이름.test(m[1])) return;
    if (!빈상태.test(m[2].trim())) return;
    out.push({ 파일: 파일명, 줄: i + 1, 변수: m[1], 시작값: m[2].trim(), 저장소: 저장소씀, 코드: line.trim() });
  });
  return out;
}

console.log("\n  [자체검증] 탐지기가 실제로 잡는가");
{
  const 잡힘 = (s) => 기억변수찾기(s, "t").length;
  ok("supabase-sync 유형을 잡는다", 잡힘("  let lastSyncedTradesCount = 0;") === 1);
  ok("trade-events-chat 예전 유형을 잡는다", 잡힘("  var lastSeenClosedCount = 0;") === 1);
  ok("cycle-pnl 예전 유형(캐시한 Set)을 잡는다", 잡힘("  var seen = new Set();") === 1);
  ok("함수 안(들여쓰기 4칸)의 지역 변수는 세지 않는다", 잡힘("    var seen = new Set();") === 0);
  ok("이름이 '이미 했다'가 아니면 세지 않는다", 잡힘("  let lastPricePayload = null;") === 0);
  ok("빈 상태로 시작하지 않으면 세지 않는다", 잡힘("  var seenKey = \"chat-event-seen\";") === 0);
  ok("주석 안의 예시는 세지 않는다", 잡힘("  /* let lastSeenCount = 0; */\n  var a = 1;") === 0);
}

/* =========================================================================
 * 2) 실제 코드 스캔
 * ========================================================================= */
console.log("\n  [실제 코드] js/ 전체 스캔");
let 전체 = [];
{
  for (const f of fs.readdirSync(path.join(REPO, "js"))) {
    if (!f.endsWith(".js")) continue;
    전체 = 전체.concat(기억변수찾기(fs.readFileSync(path.join(REPO, "js", f), "utf8"), "js/" + f));
  }
  전체.forEach((v) => console.log("    " + v.파일 + ":" + v.줄 + "  " + v.코드 + "   [저장소사용=" + v.저장소 + "]"));

  const 허용키 = 허용목록.map((e) => e.곳 + "|" + e.변수);
  const 새것 = 전체.filter((v) => 허용키.indexOf(v.파일 + "|" + v.변수) < 0);
  ok("허용 목록에 없는 기억 변수가 새로 생기지 않았다", 새것.length === 0,
    새것.map((v) => v.파일 + ":" + v.줄 + " " + v.변수).join(" / "));
  ok("허용 목록이 5건을 넘지 않는다(새 허용 추가 금지)", 허용목록.length <= 5, String(허용목록.length));
  허용목록.forEach((e) => console.log("    · 허용 " + e.곳 + " " + e.변수 + " — " + e.사유));
}

/* =========================================================================
 * 3) 이미 고친 곳이 되돌아가지 않았는가
 * ========================================================================= */
console.log("\n  [되돌아가지 않았는가]");
{
  /* (가) js/trade-events-chat.js — 청산 알림 중복 */
  const TEC = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");
  ok("청산 알림이 '이미 알림' 표시를 저장소에 남긴다",
    /App\.Storage\.save\(SEEN_KEY/.test(TEC));
  ok("저장소를 매번 다시 읽는다(창 두 개가 서로 볼 수 있게)",
    /function loadSeen\(\)[\s\S]{0,400}App\.Storage\.load\(SEEN_KEY\)/.test(TEC) &&
    /function markSeen\(times\) \{\s*\n\s*var s = loadSeen\(\);/.test(TEC),
    "한 번 읽어 메모리에 들고 있으면(캐시) 다른 창이 표시한 것을 못 봅니다");
  ok("건수가 아니라 청산 '시각'으로 판단한다",
    /trade\.closeTime/.test(TEC) && !/lastSeenClosedCount/.test(TEC),
    "건수는 새로고침하면 0 이 되지만 시각은 값 자체가 고유합니다");
  ok("저장이 실패해도 조용히 넘어간다(화면이 무한 재시도하지 않게)",
    /catch \(e\) \{[\s\S]{0,120}\}/.test(TEC));

  /* (나) js/cycle-pnl.js — 창 두 개가 서로 못 보던 캐시 */
  const CP = fs.readFileSync(path.join(REPO, "js", "cycle-pnl.js"), "utf8");
  ok("사이클 손익이 메모리 캐시가 아니라 서버 값을 본다",
    /client\s*\n?\s*\.from\(/.test(CP) || /\.rpc\(/.test(CP));
  ok("사이클 손익에 '이미 했다' 기억 변수가 없다",
    기억변수찾기(CP, "js/cycle-pnl.js").length === 0);

  /* (다) js/supabase-sync.js — 수정 금지. 원인이 남아 있고 서버가 막습니다. */
  const SS = fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"), "utf8");
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"))).digest("hex");
  ok("supabase-sync.js 를 건드리지 않았다", md5 === "faddcbbc34b5165177ff26cb978040f8", md5);
  ok("원인이 아직 그대로다(수정 금지라 못 고침)", /let lastSyncedTradesCount = 0;/.test(SS));
  const SQL_PATH = path.join(REPO, "supabase", "schema-trades-dedupe.sql");
  ok("그래서 서버가 막는 파일이 있다", fs.existsSync(SQL_PATH));
  if (fs.existsSync(SQL_PATH)) {
    const SQL = fs.readFileSync(SQL_PATH, "utf8");
    ok("서버가 같은 사람의 같은 시각 거래를 하나로 묶는다",
      /unique index[\s\S]{0,160}\(user_id, created_at\)/.test(SQL));
  }
}

/* =========================================================================
 * 4) 돌연변이 검사 — 버그를 되돌리면 정말 실패하는가
 *    (파일은 하나도 안 고칩니다. 읽어온 문자열만 바꿔 검사합니다.)
 * ========================================================================= */
console.log("\n  [돌연변이] 버그를 다시 넣으면 정말 실패하는가");
{
  const TEC = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");

  /* (가) 예전 방식으로 되돌린다 — 건수를 메모리에 들고 있기 */
  {
    const 망친 = TEC.replace("var SEEN_KEY = \"chat-event-seen\";",
      "var SEEN_KEY = \"chat-event-seen\";\n  var lastSeenClosedCount = 0;");
    const v = 기억변수찾기(망친, "js/trade-events-chat.js");
    const 허용키 = 허용목록.map((e) => e.곳 + "|" + e.변수);
    ok("→ lastSeenClosedCount 를 되살리면 허용 목록 밖 위반으로 잡힌다",
      v.length === 1 && 허용키.indexOf(v[0].파일 + "|" + v[0].변수) < 0,
      JSON.stringify(v.map((x) => x.변수)));
  }

  /* (나) 저장소 저장을 지운다 — 새로고침하면 다시 알림 */
  {
    const 망친 = TEC.replace(/App\.Storage\.save\(SEEN_KEY/g, "노op(SEEN_KEY");
    ok("→ 저장을 지우면 '저장소에 남긴다' 검사가 실패한다",
      !/App\.Storage\.save\(SEEN_KEY/.test(망친));
  }

  /* (다) 저장소를 한 번만 읽고 메모리에 들고 있게 바꾼다 — 창 두 개 문제 재발 */
  {
    const 망친 = TEC.replace(/function markSeen\(times\) \{\s*\n\s*var s = loadSeen\(\);/,
      "var 캐시 = null;\n  function markSeen(times) {\n    var s = 캐시 || (캐시 = loadSeen());");
    ok("→ 캐시 돌연변이가 실제로 적용됐다(사본에서만)", /캐시 \|\| \(캐시 = loadSeen\(\)\)/.test(망친));
    ok("→ 캐시를 끼워 넣으면 '매번 다시 읽는다' 검사가 실패한다",
      !/function markSeen\(times\) \{\s*\n\s*var s = loadSeen\(\);/.test(망친),
      "원본은 markSeen 이 loadSeen() 을 그때그때 부릅니다");
  }

  /* (라) 시각 대신 건수로 판단하게 되돌린다 */
  {
    const 망친 = TEC.replace(/trade\.closeTime/g, "목록길이");
    ok("→ 청산 시각 대신 건수로 판단하면 '시각으로 판단한다' 검사가 실패한다",
      !/trade\.closeTime/.test(망친));
  }

  /* (마) 다른 파일에 새 기억 변수를 들여온다 */
  {
    const v = 기억변수찾기("(function(){\n  var alreadySentToday = false;\n})();", "js/새모듈.js");
    const 허용키 = 허용목록.map((e) => e.곳 + "|" + e.변수);
    ok("→ 새 모듈이 기억 변수를 들여오면 잡힌다",
      v.length === 1 && 허용키.indexOf(v[0].파일 + "|" + v[0].변수) < 0);
  }
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
