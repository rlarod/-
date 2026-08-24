/* tests/rank-formula-seal.test.js
 * ⭐ 계급 계산식이 옛것으로 조용히 되돌아가는 것을 막습니다.
 *
 * ── 무슨 일이 있었나 — 실행 순서에 기대는 설계 ────────────────────────
 * rank_points_all() 이 여러 파일에 서로 다르게 정의돼 있었습니다.
 *
 *   [정본] supabase/schema-rank-1000.sql
 *          계급용 자산 = 지갑 + 묶인 증거금 − 충전받은 돈
 *          점수 = 1000 × log2(자산 / 초기자금) + 운영자 가감점
 *          2026-08-24 대표 결정 — "계급은 무조건 지갑에 있는 돈으로 평가한다"
 *          대장 = 지갑 1000억 (9381점)
 *
 *   [옛-A] supabase/schema-rank-assets.sql
 *          계급용 자산 = 초기자금 + 확정손익  → 펀딩비가 통째로 빠집니다
 *          rank_points() 와 rank_points_all() 을 둘 다 만듭니다
 *
 *   [옛-B] supabase/schema-rank-badges.sql
 *          점수 = tl_earned()  → TL 화폐 공식. 계급이 다시 TL 에 묶입니다
 *
 * 정본을 실행한 뒤 옛 파일 중 하나를 실수로 Run 하면, 모든 회원의 계급이
 * 옛 기준으로 되돌아갑니다. 오류도 안 나고 화면도 멀쩡합니다 — 조용한 고장입니다.
 * supabase/ 에 파일이 45개가 넘습니다. "순서를 지켜라" 는 언젠가 깨집니다.
 * 그래서 순서와 무관하게 안전하도록 옛 정의를 주석으로 봉인했습니다.
 *
 * ── 봉인하지 않은 파일 ─────────────────────────────────────────────────
 *   supabase/schema-guest-read.sql 은 rank_points_all() 을 "만들지 않습니다".
 *   anon 에게 실행 권한을 주기만 합니다(정본도 똑같이 줍니다).
 *   그래서 나중에 Run 해도 계급이 되돌아가지 않습니다 — 봉인하지 않았습니다.
 *   이 파일은 비회원이 랭킹·게시판·채팅을 보는 근거이므로,
 *   아래 ⑤ 에서 "실수로 막지 않았는가" 를 반대 방향으로 검사합니다.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *   ① 두 옛 파일이 지워지지 않았다 (기록으로 남긴다)
 *   ② schema-rank-assets.sql 이 계급 함수를 만들지 않는다
 *   ③ schema-rank-badges.sql 이 계급 함수를 만들지 않는다
 *   ④ 원문이 주석으로 그대로 보존돼 있다 (통째로 날린 게 아니다)
 *   ⑤ ★ 과잉 봉인 방지 — 비회원 열람(schema-guest-read.sql)이 살아 있다
 *   ⑥ 맨 위에 "대체됐다 / 정본으로 가라" 경고가 있다
 *   ⑦ 정본이 실제로 두 함수를 다시 만들고 권한도 다시 준다
 *   ⑧ 대표님 안내 파일 "3. 열 필요 없는 파일" 표에 두 파일이 들어 있다
 *   ⑨ 돌연변이 — 봉인이 풀리면 정말 잡아내는가
 *   ⑩ package.json 에 등록돼 있다
 *
 * ── 옆 봉인들과 겹치지 않습니다 ────────────────────────────────────────
 *   schema-tl-balance-fix.sql   → tests/tl-balance-fix-seal.test.js
 *   schema-tl-hotdeal.sql       → tests/tl-hotdeal-seal.test.js
 *   schema-tl-monthly.sql       → tests/tl-monthly.test.js
 *   cleanup-test-data.sql       → tests/sql-mass-delete-guard.test.js
 *   계급표 숫자(min_points)      → tests/rank-table.test.js
 *   계급장 화면 붙이기           → tests/rank-badge.test.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

const ASSETS = path.join(REPO, "supabase", "schema-rank-assets.sql");
const BADGES = path.join(REPO, "supabase", "schema-rank-badges.sql");
const GUEST  = path.join(REPO, "supabase", "schema-guest-read.sql");
const 정본경로 = path.join(REPO, "supabase", "schema-rank-1000.sql");
const 안내경로 = path.join(REPO, "supabase", "README-대표님-먼저-읽으세요.md");

/* 주석을 지운 "실제로 실행되는 본문" */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}
/* "-- " 만 떼어 봉인된 원문을 되살립니다(기록 확인용) */
function unseal(s) {
  return s.split("\n").map((l) => (l === "--" ? "" : l.replace(/^-- /, ""))).join("\n");
}
/* 세미콜론으로 나눈 "실행되는 문장" 목록 */
function 문장들(s) {
  return strip(s).split(";").map((x) => x.trim()).filter(Boolean);
}

/* ---------- 봉인 판정 ---------- */
const 계급함수 = /create\s+or\s+replace\s+function\s+public\.(rank_points|rank_points_all|rank_assets)\s*\(/;

function assets봉인됐나(raw) {
  const live = strip(raw);
  return !계급함수.test(live)
      && !/grant\s+execute\s+on\s+function\s+public\.rank_points/.test(live);
}
function badges봉인됐나(raw) {
  const live = strip(raw);
  return !계급함수.test(live)
      && !/grant\s+execute\s+on\s+function\s+public\.rank_points/.test(live);
}

/* ---------- 비회원 열람이 살아 있나 (과잉 봉인 방지) ---------- */
const 비회원정책 = [
  ["닉네임(프로필)", "profiles_select_all", "public.profiles"],
  ["게시판 글",      "posts_select_all",    "public.posts"],
  ["댓글",           "comments_select_all", "public.post_comments"],
  ["추천",           "votes_select_all",    "public.post_votes"],
  ["실시간 채팅",    "chat_select_all",     "public.chat_messages"],
];
function 비회원열람살아있나(raw) {
  const live = strip(raw);
  const 정책OK = 비회원정책.every(([, 이름, 테이블]) =>
    new RegExp("create\\s+policy\\s+\"" + 이름 + "\"\\s+on\\s+" +
               테이블.replace(".", "\\.") + "[\\s\\S]{0,80}?for\\s+select\\s+using\\s*\\(\\s*true\\s*\\)")
      .test(live));
  const 랭킹OK = /grant\s+execute\s+on\s+function\s+public\.get_leaderboard\s+to\s+anon/.test(live)
              && /grant\s+execute\s+on\s+function\s+public\.rank_points_all\s+to\s+anon/.test(live);
  return 정책OK && 랭킹OK;
}

console.log("\n계급 계산식 봉인 (옛 공식으로 되돌아가는 것 차단)");

/* =====================================================================
 * ① 지우지 않았다
 * ===================================================================== */
console.log("\n① 지우지 않았다(기록으로 남긴다)");
ok("supabase/schema-rank-assets.sql 이 있다", fs.existsSync(ASSETS));
ok("supabase/schema-rank-badges.sql 이 있다", fs.existsSync(BADGES));
ok("supabase/schema-guest-read.sql 이 있다", fs.existsSync(GUEST));

const rawA = fs.existsSync(ASSETS) ? fs.readFileSync(ASSETS, "utf8") : "";
const rawB = fs.existsSync(BADGES) ? fs.readFileSync(BADGES, "utf8") : "";
const rawG = fs.existsSync(GUEST)  ? fs.readFileSync(GUEST,  "utf8") : "";

ok("rank-assets 내용이 비어 있지 않다", rawA.length > 2000, String(rawA.length));
ok("rank-badges 내용이 비어 있지 않다", rawB.length > 1500, String(rawB.length));

const liveA = strip(rawA), keptA = unseal(rawA);
const liveB = strip(rawB), keptB = unseal(rawB);

/* =====================================================================
 * ② schema-rank-assets.sql — 계급 함수를 만들지 않는다
 * ===================================================================== */
console.log("\n② schema-rank-assets.sql 이 계급 함수를 만들지 않는다");
ok("rank_points() 를 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.rank_points\s*\(/.test(liveA));
ok("rank_points_all() 을 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.rank_points_all\s*\(/.test(liveA));
ok("어떤 함수도 만들지 않는다", !/create\s+or\s+replace\s+function/i.test(liveA));
ok("grant 문장이 아예 없다", !/\bgrant\b/i.test(liveA));
ok("옛 공식(초기자금 + 확정손익)이 실행되는 자리에 없다",
   !/ta\.initial_balance\s*\+\s*ta\.realized_pnl/.test(liveA));
ok("함수 본문($$)이 실행되지 않는다", !/\$\$/.test(liveA));
ok("실행되는 문장이 하나도 없다", 문장들(rawA).length === 0, String(문장들(rawA).length));
ok("바꾸는 문장이 하나도 없다(create/alter/drop/insert/update/delete/truncate)",
   !/\b(create|alter|drop|insert|update|delete|truncate)\b/i.test(liveA));
ok("봉인 판정 함수도 통과", assets봉인됐나(rawA));

/* =====================================================================
 * ③ schema-rank-badges.sql — 계급 함수를 만들지 않는다
 * ===================================================================== */
console.log("\n③ schema-rank-badges.sql 이 계급 함수를 만들지 않는다");
ok("rank_points_all() 을 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.rank_points_all\s*\(/.test(liveB));
ok("어떤 함수도 만들지 않는다", !/create\s+or\s+replace\s+function/i.test(liveB));
ok("grant 문장이 아예 없다", !/\bgrant\b/i.test(liveB));
ok("TL 화폐 공식(tl_earned)이 실행되는 자리에 없다", !/tl_earned/.test(liveB));
ok("함수 본문($$)이 실행되지 않는다", !/\$\$/.test(liveB));
ok("봉인 판정 함수도 통과", badges봉인됐나(rawB));

console.log("\n③-2 읽기 전용 '확인' 은 살려 뒀다(Run 해도 목록만 나온다)");
ok("확인 select 가 살아 있다", /select \* from public\.rank_points_all\(20\)/.test(liveB));
ok("실행되는 문장은 select 하나뿐이다", 문장들(rawB).length === 1, String(문장들(rawB).length));
ok("바꾸는 문장이 하나도 없다(create/alter/drop/insert/update/delete/truncate)",
   !/\b(create|alter|drop|insert|update|delete|truncate)\b/i.test(liveB));

/* =====================================================================
 * ④ 원문이 주석으로 보존돼 있다
 * ===================================================================== */
console.log("\n④ 원문을 통째로 날린 게 아니다(기록 보존)");
ok("[assets] rank_points() 원문이 남아 있다",
   /create or replace function public\.rank_points\(p_uid uuid\)/.test(keptA));
ok("[assets] 옛 공식(초기자금 + 확정손익)이 기록에 남아 있다",
   /log\(2, \(ta\.initial_balance \+ ta\.realized_pnl\) \/ ta\.initial_balance\) \* 1000/.test(keptA));
ok("[assets] rank_points_all() 원문이 남아 있다",
   /create or replace function public\.rank_points_all\(limit_count int default 500\)/.test(keptA));
ok("[assets] grant 원문 4줄이 남아 있다",
   (keptA.match(/^grant execute on function public\.rank_points(_all)? to (authenticated|anon);$/gm) || []).length === 4,
   String((keptA.match(/^grant execute on function public\.rank_points(_all)? to (authenticated|anon);$/gm) || []).length));
ok("[assets] 왜 이렇게 고쳤는지 설명이 그대로 남아 있다",
   /지금까지 계급 점수는 "청산 1건당 10점 \+ 수익률 1%당 20점" 이었습니다/.test(rawA));

ok("[badges] rank_points_all() 원문이 남아 있다",
   /create or replace function public\.rank_points_all\(limit_count integer default 500\)/.test(keptB));
ok("[badges] 옛 공식(tl_earned)이 기록에 남아 있다",
   /select p\.nickname, public\.tl_earned\(p\.id\) as rank_points/.test(keptB));
ok("[badges] grant 원문이 남아 있다",
   /^grant execute on function public\.rank_points_all to authenticated;$/m.test(keptB));
ok("[badges] 왜 필요했는지 설명이 그대로 남아 있다",
   /남의 계급을 화면에서 지어낼 수는 없으므로/.test(rawB));

{
  /* 봉인 구간 줄 수 — 원문이 통째로 잘려나가지 않았는지 봅니다. */
  function 봉인구간(raw) {
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const s = lines.findIndex((l) => l.indexOf("봉인 시작 — 여기부터") !== -1) + 2;
    const e = lines.findIndex((l) => l.indexOf("⛔ [봉인 끝]") !== -1) - 1;
    return { n: s > 1 && e > s ? e - s : 0, 전부주석: s > 1 && e > s && lines.slice(s, e).every((l) => /^--/.test(l)) };
  }
  const a = 봉인구간(rawA), b = 봉인구간(rawB);
  ok("[assets] 봉인 구간이 40줄 이상 보존돼 있다", a.n >= 40, String(a.n));
  ok("[assets] 봉인 구간이 전부 주석이다", a.전부주석);
  ok("[badges] 봉인 구간이 12줄 이상 보존돼 있다", b.n >= 12, String(b.n));
  ok("[badges] 봉인 구간이 전부 주석이다", b.전부주석);
}

/* =====================================================================
 * ⑤ ★ 과잉 봉인 방지 — 비회원 열람이 살아 있다
 * ---------------------------------------------------------------------
 * schema-guest-read.sql 은 rank_points_all() 을 만들지 않고 권한만 줍니다.
 * 그래서 봉인 대상이 아닙니다. 실수로 막으면 비회원이 랭킹·게시판·채팅을
 * 못 보게 되므로, 여기서 반대 방향으로 지킵니다.
 * ===================================================================== */
console.log("\n⑤ 비회원 열람(schema-guest-read.sql)은 그대로 살아 있다");
ok("이 파일은 rank_points_all() 을 만들지 않는다(그래서 봉인 대상이 아니다)",
   !/create\s+or\s+replace\s+function\s+public\.rank_points_all/.test(rawG));
비회원정책.forEach(([설명, 이름, 테이블]) => {
  ok("살아 있다: " + 설명 + " 읽기 = 누구나 (" + 이름 + ")",
     new RegExp("create\\s+policy\\s+\"" + 이름 + "\"\\s+on\\s+" +
                테이블.replace(".", "\\.") + "[\\s\\S]{0,80}?for\\s+select\\s+using\\s*\\(\\s*true\\s*\\)")
       .test(strip(rawG)));
});
ok("살아 있다: 비회원 랭킹표(get_leaderboard) 실행 권한",
   /grant\s+execute\s+on\s+function\s+public\.get_leaderboard\s+to\s+anon/.test(strip(rawG)));
ok("살아 있다: 비회원 계급 점수(rank_points_all) 실행 권한",
   /grant\s+execute\s+on\s+function\s+public\.rank_points_all\s+to\s+anon/.test(strip(rawG)));
ok("실행되는 정책 문장이 10개 이상 남아 있다",
   문장들(rawG).length >= 10, String(문장들(rawG).length));
ok("쓰기 정책은 열지 않는다(insert/update/delete 정책이 없다)",
   !/for\s+(insert|update|delete)/i.test(strip(rawG)));
{
  /* 정책을 여는 문장들만 봅니다(맨 아래 확인용 select 는 제외).
     개인 정보 테이블이 여기 끼어들면 비회원에게 지갑이 열립니다. */
  const 정책문장 = 문장들(rawG).filter((s) => /^(create|drop)\s+policy/i.test(s));
  const 개인정보 = /(trading_accounts|positions|orders|trades|tl_purchases|user_items|tl_transactions)/i;
  ok("개인 정보 테이블은 열지 않는다(지갑·포지션·주문·거래기록·TL)",
     정책문장.length > 0 && !정책문장.some((s) => 개인정보.test(s)),
     정책문장.length + "개 정책문장");
}
ok("과잉 봉인 판정 함수도 통과", 비회원열람살아있나(rawG));

/* =====================================================================
 * ⑥ 맨 위 경고
 * ===================================================================== */
console.log("\n⑥ 맨 위에 경고와 안내가 있다");
[["assets", rawA, "계급 계산식은 대체됐습니다"],
 ["badges", rawB, "rank_points_all() 은 대체됐습니다"]].forEach(([이름, raw, 문구]) => {
  const 머리 = raw.slice(0, 2500);
  ok("[" + 이름 + "] 맨 위에 '대체됐습니다' 안내가 있다", /대체됐습니다/.test(머리));
  ok("[" + 이름 + "] 맨 위에 그 파일에 맞는 문구가 있다", 머리.indexOf(문구) !== -1);
  ok("[" + 이름 + "] 맨 위에 정본 파일 이름이 있다", /schema-rank-1000\.sql/.test(머리));
  ok("[" + 이름 + "] '계급은 바뀌지 않습니다' 가 있다", /계급은 바뀌지 않습니다/.test(머리));
  ok("[" + 이름 + "] 무엇이 막혔는지 함수 이름이 적혀 있다", /rank_points/.test(머리));
  ok("[" + 이름 + "] 무엇을 살려 뒀는지 적혀 있다", /그대로 살아 있나/.test(머리));
  ok("[" + 이름 + "] 실행 순서 함정을 설명한다", /순서/.test(머리));
  ok("[" + 이름 + "] 실수로 Run 하면 어떻게 되는지 적혀 있다", /실수로 이 파일을 Run 하면/.test(머리));
  ok("[" + 이름 + "] 이 테스트가 봉인을 지킨다고 적혀 있다", /rank-formula-seal\.test\.js/.test(raw));
  ok("[" + 이름 + "] ⛔ [봉인] 마커가 있다", /⛔ \[봉인\]/.test(raw) && /⛔ \[봉인 끝\]/.test(raw));
});

/* =====================================================================
 * ⑦ 정본이 두 함수를 다시 만든다
 * ===================================================================== */
console.log("\n⑦ 정본(schema-rank-1000.sql)이 계급 함수를 만든다");
ok("정본 파일이 있다", fs.existsSync(정본경로));
const 정본 = fs.existsSync(정본경로) ? fs.readFileSync(정본경로, "utf8") : "";
const 정본코드 = strip(정본);
ok("정본이 rank_assets() 를 만든다",
   /create or replace function public\.rank_assets\(/.test(정본코드));
ok("정본이 rank_points() 를 만든다",
   /create or replace function public\.rank_points\(/.test(정본코드));
ok("정본이 rank_points_all() 을 만든다",
   /create or replace function public\.rank_points_all\(/.test(정본코드));
ok("정본이 anon 에게도 권한을 준다(비회원 랭킹 계급장)",
   /grant execute on function public\.rank_points_all to anon/.test(정본코드));
ok("정본은 계급을 지갑(balance)으로 본다",
   /coalesce\(ta\.balance, 0\)/.test(정본코드));
ok("정본은 충전받은 돈을 뺀다",
   /-\s*coalesce\(ta\.recharge_total, 0\)/.test(정본코드));
ok("정본은 옛 공식(초기자금 + 확정손익)을 계급에 쓰지 않는다",
   !/ta\.initial_balance\s*\+\s*ta\.realized_pnl/.test(
     정본코드.slice(정본코드.indexOf("function public.rank_assets"),
                    정본코드.indexOf("function public.rank_points_all") + 800)));
ok("정본은 tl_earned() 를 쓰지 않는다(계급은 TL 과 분리)", !/tl_earned/.test(정본코드));
ok("정본이 옛 두 파일을 덮는다는 사실이 적혀 있다",
   /schema-rank-assets\.sql/.test(정본) && /schema-rank-badges\.sql/.test(정본));

/* =====================================================================
 * ⑧ 대표님 안내 파일
 * ===================================================================== */
console.log("\n⑧ 대표님 안내 파일 '3. 열 필요 없는 파일' 표");
ok("supabase/README-대표님-먼저-읽으세요.md 가 있다", fs.existsSync(안내경로));
const 안내 = fs.existsSync(안내경로) ? fs.readFileSync(안내경로, "utf8") : "";
{
  const 시작 = 안내.indexOf("## 3.");
  const 끝 = 안내.indexOf("## 4.");
  const 표 = 시작 >= 0 && 끝 > 시작 ? 안내.slice(시작, 끝) : "";
  ok("'3. 열 필요 없는 파일' 항목이 있다", 표.length > 100, String(표.length));
  ["schema-rank-assets.sql", "schema-rank-badges.sql"].forEach((f) => {
    ok("표에 들어 있다: supabase/" + f, 표.indexOf("supabase/" + f) !== -1);
  });
  ok("계급이 되돌아가는 것을 막았다고 적혀 있다", /계급/.test(표));
  ok("비회원 열람 파일(schema-guest-read.sql)은 '막았다' 고 적지 않았다",
     표.indexOf("schema-guest-read.sql") === -1);
}
ok("전문용어를 쓰지 않는다(마이그레이션·재정의·롤백·리팩터)",
   !/마이그레이션|재정의|리팩터|롤백/.test(안내));
{
  const 언급 = Array.from(new Set((안내.match(/supabase\/[^\s`)|]+\.(sql|md)/g) || [])));
  언급.forEach((rel) => ok("안내가 가리키는 파일이 실제로 있다: " + rel,
                          fs.existsSync(path.join(REPO, rel))));
}

/* =====================================================================
 * ⑨ 돌연변이 — 봉인이 풀리면 정말 잡는가
 * ===================================================================== */
console.log("\n⑨ 돌연변이 (봉인이 풀리면 잡는가)");
{
  ok("지금 상태는 통과한다(오탐 없음)",
     assets봉인됐나(rawA) && badges봉인됐나(rawB) && 비회원열람살아있나(rawG));

  /* --- schema-rank-assets.sql --- */
  const a1 = rawA.replace(/^-- create or replace function public\.rank_points\(p_uid uuid\)/m,
                          "create or replace function public.rank_points(p_uid uuid)");
  ok("[assets] rank_points() 주석 하나만 풀어도 잡아낸다", !assets봉인됐나(a1));

  const a2 = rawA.replace(/^-- create or replace function public\.rank_points_all/m,
                          "create or replace function public.rank_points_all");
  ok("[assets] rank_points_all() 주석 하나만 풀어도 잡아낸다", !assets봉인됐나(a2));

  const a3 = rawA.replace(/^-- grant execute on function public\.rank_points to anon;/m,
                          "grant execute on function public.rank_points to anon;");
  ok("[assets] grant 주석 하나만 풀어도 잡아낸다", !assets봉인됐나(a3));

  const a4 = rawA + "\n" + unseal(
    rawA.slice(rawA.indexOf("-- create or replace function public.rank_points(p_uid uuid)")));
  ok("[assets] 파일 맨 뒤에 옛 함수를 다시 붙여도 잡아낸다", !assets봉인됐나(a4));

  const a5 = rawA.replace(/^-- /gm, "");
  ok("[assets] 봉인을 통째로 풀어도 잡아낸다", !assets봉인됐나(a5));

  /* --- schema-rank-badges.sql --- */
  const b1 = rawB.replace(/^-- create or replace function public\.rank_points_all/m,
                          "create or replace function public.rank_points_all");
  ok("[badges] 함수 주석 하나만 풀어도 잡아낸다", !badges봉인됐나(b1));

  const b2 = rawB.replace(/^-- grant execute on function public\.rank_points_all to authenticated;/m,
                          "grant execute on function public.rank_points_all to authenticated;");
  ok("[badges] grant 주석 하나만 풀어도 잡아낸다", !badges봉인됐나(b2));

  const b3 = rawB + "\n" + unseal(
    rawB.slice(rawB.indexOf("-- create or replace function public.rank_points_all")));
  ok("[badges] 파일 맨 뒤에 옛 함수를 다시 붙여도 잡아낸다", !badges봉인됐나(b3));

  const b4 = rawB.replace(/^-- /gm, "");
  ok("[badges] 봉인을 통째로 풀어도 잡아낸다", !badges봉인됐나(b4));

  /* --- 반대 방향: 과잉 봉인 --- */
  const g1 = rawG.split("\n").map((l) => "-- " + l).join("\n");
  ok("[guest] 비회원 파일을 통째로 봉인하면 잡아낸다", !비회원열람살아있나(g1));

  const g2 = rawG.replace(/^create policy "posts_select_all"/m,
                          '-- create policy "posts_select_all"');
  ok("[guest] 게시판 읽기 정책 하나만 막아도 잡아낸다", !비회원열람살아있나(g2));

  const g3 = rawG.replace(/^grant execute on function public\.rank_points_all to anon;/m,
                          "-- grant execute on function public.rank_points_all to anon;");
  ok("[guest] 비회원 계급 권한 한 줄만 막아도 잡아낸다", !비회원열람살아있나(g3));

  const g4 = rawG.replace(/for select using \(true\);/g,
                          "for select using (auth.role() = 'authenticated');");
  ok("[guest] 읽기 조건을 '로그인만' 으로 되돌리면 잡아낸다", !비회원열람살아있나(g4));

  /* --- 봉인 대상 파일을 통째로 봉인해도 '살려 둔 것' 검사가 잡는가 --- */
  const bAll = rawB.split("\n").map((l) => "-- " + l).join("\n");
  ok("[badges] 파일 전체를 봉인해 확인 select 까지 죽이면 잡아낸다",
     !/select \* from public\.rank_points_all\(20\)/.test(strip(bAll)));
}

/* =====================================================================
 * ⑩ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑩ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
  ok("package.json 의 test 목록에 들어 있다", /tests\/rank-formula-seal\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
