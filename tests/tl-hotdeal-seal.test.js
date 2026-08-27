/* tests/tl-hotdeal-seal.test.js
 * supabase/schema-tl-hotdeal.sql 안의 "옛 TL 계산 함수 3개" 가 봉인된 상태를 지킵니다.
 *
 * 무슨 일이 있었나
 *   이 파일에는 옛 TL 공식이 그대로 살아 있었습니다.
 *       tl_earned() = 거래횟수 × 10 + max(0, 수익률%) × 20 + rank_points
 *   2026-08-24 대표 지시로 TL 은 실시간 지급(supabase/schema-tl-realtime.sql)으로
 *   바뀌었고, 그 파일이 위 세 함수를 다시 정의해 덮습니다.
 *
 * 왜 파일을 지우지 않았나
 *   이 파일에는 상점(tl_products · tl_purchases · tl_transactions ·
 *   purchase_tl_product · 기본 상품 등록)이 같이 들어 있습니다.
 *   앞으로도 상점을 손보려고 실행할 일이 있는 "살아 있는 파일" 입니다.
 *
 * 그래서 무엇이 위험했나 — 조용한 고장
 *   상점을 손보려고 이 파일을 다시 Run 하는 순간, TL 계산식이 옛 공식으로
 *   되돌아갑니다. 오류도 안 나고 화면도 멀쩡합니다. 거래횟수 구멍(0.001 BTC 를
 *   1,000번 사고팔면 10,000 TL)이 다시 열리는데 아무도 모릅니다.
 *
 * 어떻게 막았나
 *   그 세 함수의 정의(+ tl_balance_info 의 grant)만 주석(--)으로 막았습니다.
 *   원문은 한 글자도 지우지 않고 그대로 보존했습니다.
 *   나머지 상점 부분은 손대지 않았습니다 — 지금도 실행됩니다.
 *
 * 이 검사가 지키는 것
 *   ① 파일이 지워지지 않았다
 *   ② TL 계산 함수 3개가 실행되지 않는다 (전부 주석)
 *   ③ 옛 공식 조각이 실행되는 자리에 하나도 없다
 *   ④ 원문이 주석으로 보존돼 있다 (통째로 날린 게 아니다)
 *   ⑤ 상점 부분은 그대로 살아 있다 (실수로 파일 전체를 봉인하지 않았다)
 *   ⑥ 맨 위에 "대체됐다 / 정본으로 가라" 경고가 있다
 *   ⑦ 정본(schema-tl-realtime.sql)이 실제로 세 함수를 다시 정의한다
 *   ⑧ 옆 파일(schema-tl-market.sql)의 상점 테이블도 멀쩡하다
 *   ⑨ 봉인이 풀리면 정말 잡아낸다 (돌연변이)
 *
 * 옛 월 정산 파일(schema-tl-monthly.sql)의 봉인은 tests/tl-monthly.test.js 가,
 * 실시간 지급 동작 자체는 tests/tl-realtime.test.js 가 따로 지킵니다.
 * 이 파일은 "핫딜 파일 안의 세 함수" 만 봅니다 — 서로 겹치지 않습니다.
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

const SQL = path.join(REPO, "supabase", "schema-tl-hotdeal.sql");
const 정본경로 = path.join(REPO, "supabase", "schema-tl-realtime.sql");

/* 주석을 지운 "실제로 실행되는 본문" */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}
/* "-- " 만 떼어 봉인된 원문을 되살립니다(기록 확인용) */
function unseal(s) {
  return s.split("\n").map((l) => (l === "--" ? "" : l.replace(/^-- /, ""))).join("\n");
}

/* 세 함수가 정말 실행되지 않는가 */
function 봉인됐나(rawText) {
  const live = strip(rawText);
  return !/create\s+or\s+replace\s+function\s+public\.tl_earned/.test(live)
      && !/create\s+or\s+replace\s+function\s+public\.tl_balance\s*\(/.test(live)
      && !/create\s+or\s+replace\s+function\s+public\.tl_balance_info/.test(live)
      && !/grant\s+execute\s+on\s+function\s+public\.tl_balance_info/.test(live);
}

/* 상점이 그대로 실행되는가 — 실수로 파일 전체를 봉인하면 여기서 걸립니다 */
const 상점필수 = [
  ["상품 테이블", /create table if not exists public\.tl_products/],
  ["구매내역 테이블", /create table if not exists public\.tl_purchases/],
  ["TL 거래내역 테이블", /create table if not exists public\.tl_transactions/],
  ["구매 함수", /create or replace function public\.purchase_tl_product/],
  ["구매 함수 권한", /grant execute on function public\.purchase_tl_product/],
  ["기본 상품 등록", /insert into public\.tl_products/],
  ["상품 등록 DO 블록", /do\s*\$\$/],
  ["rank_points 컬럼 보장", /add column if not exists rank_points/],
];
function 상점살아있나(rawText) {
  const live = strip(rawText);
  return 상점필수.every(([, re]) => re.test(live));
}

console.log("\n옛 TL 계산 함수 3개 — 봉인 확인 (schema-tl-hotdeal.sql)");

/* =====================================================================
 * ① 파일이 남아 있다
 * ===================================================================== */
console.log("\n① 지우지 않았다(상점이 들어 있는 살아 있는 파일)");
ok("supabase/schema-tl-hotdeal.sql 이 있다", fs.existsSync(SQL));
const raw = fs.existsSync(SQL) ? fs.readFileSync(SQL, "utf8") : "";
ok("내용이 비어 있지 않다", raw.length > 8000, String(raw.length));

const live = strip(raw);
const 원문 = unseal(raw);

/* =====================================================================
 * ② TL 계산 함수 3개가 실행되지 않는다
 * ===================================================================== */
console.log("\n② TL 계산 함수 3개가 실행되지 않는다");
ok("tl_earned() 를 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.tl_earned/.test(live));
ok("tl_balance() 를 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.tl_balance\s*\(/.test(live));
ok("tl_balance_info() 를 만들지 않는다",
   !/create\s+or\s+replace\s+function\s+public\.tl_balance_info/.test(live));
/* 함수가 없는데 grant 를 하면 Supabase 에서 오류가 나 뒤의 상점 문장까지 멈춥니다.
   그래서 grant 도 같이 막았습니다. */
ok("tl_balance_info 의 grant 도 같이 막았다(없는 함수에 권한 주면 오류)",
   !/grant\s+execute\s+on\s+function\s+public\.tl_balance_info/.test(live));
ok("봉인 판정 함수도 통과", 봉인됐나(raw));

/* =====================================================================
 * ③ 옛 공식 조각이 실행되는 자리에 없다
 * ===================================================================== */
console.log("\n③ 옛 공식 조각이 실행되는 자리에 없다");
ok("거래 건수 × 10 이 없다",
   !/count\(\*\) from public\.trades t where t\.user_id = p_uid\), 0\) \* 10/.test(live));
ok("수익률 × 20 이 없다",
   !/where ta\.user_id = p_uid\), 0\)\) \* 20/.test(live));
ok("계급 가감점(rank_points)을 TL 에 더하지 않는다",
   !/select pr\.rank_points from public\.profiles pr where pr\.id = p_uid/.test(live));
ok("실현손익 비율 계산이 없다",
   !/ta\.realized_pnl \/ ta\.initial_balance/.test(live));

/* =====================================================================
 * ④ 원문이 주석으로 보존돼 있다
 * ===================================================================== */
console.log("\n④ 원문을 통째로 날린 게 아니다(기록 보존)");
ok("tl_earned() 원문이 주석으로 남아 있다",
   /create or replace function public\.tl_earned\(p_uid uuid\)/.test(원문));
ok("tl_balance() 원문이 주석으로 남아 있다",
   /create or replace function public\.tl_balance\(p_uid uuid\)/.test(원문));
ok("tl_balance_info() 원문이 주석으로 남아 있다",
   /create or replace function public\.tl_balance_info\(\)/.test(원문));
ok("옛 공식(거래횟수 × 10)이 기록에 남아 있다",
   /count\(\*\) from public\.trades t where t\.user_id = p_uid\), 0\) \* 10/.test(원문));
ok("옛 공식(수익률 × 20)이 기록에 남아 있다",
   /where ta\.user_id = p_uid\), 0\)\) \* 20/.test(원문));
ok("grant 원문도 남아 있다",
   /grant execute on function public\.tl_balance_info to authenticated;/.test(원문));
{
  /* 봉인 구간의 줄 수 — 원문(61줄)이 통째로 잘려나가지 않았는지 봅니다. */
  const lines = raw.split("\n");
  const s = lines.findIndex((l) => l.indexOf("봉인 시작 — 여기부터") !== -1) + 2;
  const e = lines.findIndex((l) => l.indexOf("⛔ [봉인 끝]") !== -1) - 1;
  const 봉인줄수 = s > 1 && e > s ? e - s : 0;
  ok("봉인 구간이 55줄 이상 보존돼 있다", 봉인줄수 >= 55, String(봉인줄수));
  ok("봉인 구간이 전부 주석이다",
     s > 1 && e > s && lines.slice(s, e).every((l) => /^--/.test(l)));
}

/* =====================================================================
 * ⑤ 상점은 그대로 살아 있다
 * ===================================================================== */
console.log("\n⑤ 상점은 그대로 살아 있다(이 파일은 계속 실행됩니다)");
상점필수.forEach(([name, re]) => ok("실행됨: " + name, re.test(live)));
ok("RLS 가 세 테이블 모두에 켜진다", (live.match(/enable row level security/g) || []).length >= 3);
ok("상품 조회 정책이 살아 있다", /tl_products_select_all/.test(live));
ok("상품 쓰기는 관리자만(정책 살아 있음)", /tl_products_admin_write/.test(live));
ok("구매 함수가 서버에서 잔액을 직접 계산한다", /bal := public\.tl_balance\(uid\)/.test(live));
ok("기본 상품이 그대로 등록된다(스타벅스·배달의민족·쿠팡)",
   /'스타벅스'/.test(live) && /'배달의민족'/.test(live) && /'쿠팡'/.test(live));
ok("중복 등록을 막는 on conflict 가 살아 있다", /on conflict do nothing/.test(live));
ok("마지막 확인용 select 가 살아 있다", /select category, count\(\*\)/.test(live));
ok("여전히 테이블을 지우지 않는다", !/\b(drop\s+table|truncate)\b/i.test(live));
ok("상점 판정 함수도 통과", 상점살아있나(raw));

/* =====================================================================
 * ⑥ 맨 위 경고
 * ===================================================================== */
console.log("\n⑥ 맨 위에 경고와 안내가 있다");
const 머리 = raw.slice(0, 2000);
ok("맨 위에 '대체됐습니다' 안내가 있다", /대체됐습니다/.test(머리));
ok("맨 위에 정본 파일 이름이 있다", /schema-tl-realtime\.sql/.test(머리));
ok("'실행해도 TL 계산식은 바뀌지 않습니다' 가 있다", /TL 계산식은 바뀌지 않습니다/.test(머리));
ok("'상점 부분만 적용됩니다' 가 있다", /상점 부분만 적용됩니다/.test(머리));
ok("바꾸려면 어디로 가야 하는지 적혀 있다", /schema-tl-realtime\.sql 을 실행하세요/.test(머리));
ok("무엇이 막혔는지 세 함수 이름이 적혀 있다",
   /tl_earned/.test(머리) && /tl_balance/.test(머리) && /tl_balance_info/.test(머리));
ok("처음 세팅하는 서버의 실행 순서가 적혀 있다", /실행 순서/.test(머리));
ok("이 테스트가 봉인을 지킨다고 적혀 있다", /tl-hotdeal-seal\.test\.js/.test(raw));

/* =====================================================================
 * ⑦ 정본이 세 함수를 실제로 정의한다
 * ===================================================================== */
console.log("\n⑦ 정본(schema-tl-realtime.sql)이 세 함수를 만든다");
ok("정본 파일이 있다", fs.existsSync(정본경로));
const 정본 = fs.existsSync(정본경로) ? fs.readFileSync(정본경로, "utf8") : "";
const 정본코드 = strip(정본);
ok("정본이 tl_earned() 를 만든다", /create or replace function public\.tl_earned\(/.test(정본코드));
ok("정본이 tl_balance() 를 만든다", /create or replace function public\.tl_balance\(/.test(정본코드));
ok("정본이 tl_balance_info() 를 만든다", /create or replace function public\.tl_balance_info\(/.test(정본코드));
ok("정본이 tl_balance_info 에 권한을 준다",
   /grant execute on function public\.tl_balance_info\(\) to authenticated/.test(정본코드));
{
  const s = 정본코드.indexOf("function public.tl_earned");
  const e = 정본코드.indexOf("function public.tl_balance(");
  const 정본earned = s >= 0 && e > s ? 정본코드.slice(s, e) : "";
  ok("정본 tl_earned() 구간을 찾았다", 정본earned.length > 50, String(정본earned.length));
  ok("정본 tl_earned() 는 거래 건수를 세지 않는다", !/public\.trades/.test(정본earned));
  ok("정본 tl_earned() 는 수익률을 쓰지 않는다", !/realized_pnl/.test(정본earned));
  ok("정본 tl_earned() 는 계급 점수를 섞지 않는다", !/rank_points/.test(정본earned));
  ok("정본 tl_earned() 는 지급 기록만 더한다", /from public\.tl_transactions/.test(정본earned));
}

/* =====================================================================
 * ⑧ 옆 파일(TL 마켓)은 건드리지 않았다
 * ===================================================================== */
console.log("\n⑧ 옆 파일(schema-tl-market.sql)은 그대로다");
{
  const m = path.join(REPO, "supabase", "schema-tl-market.sql");
  ok("schema-tl-market.sql 이 있다", fs.existsSync(m));
  const mCode = fs.existsSync(m) ? strip(fs.readFileSync(m, "utf8")) : "";
  ok("tl_market_products 테이블이 그대로 실행된다",
     /create table if not exists public\.tl_market_products/.test(mCode));
}

/* =====================================================================
 * ⑨ 돌연변이 — 봉인이 풀리면 정말 잡는가
 * ===================================================================== */
console.log("\n⑨ 돌연변이 (봉인이 풀리면 잡는가)");
{
  ok("지금 상태는 통과한다(오탐 없음)", 봉인됐나(raw) && 상점살아있나(raw));

  const a = raw.replace(/^-- create or replace function public\.tl_earned/m,
                        "create or replace function public.tl_earned");
  ok("tl_earned 주석 하나만 풀어도 잡아낸다", !봉인됐나(a));

  const b = raw.replace(/^-- create or replace function public\.tl_balance\(/m,
                        "create or replace function public.tl_balance(");
  ok("tl_balance 주석 하나만 풀어도 잡아낸다", !봉인됐나(b));

  const c = raw.replace(/^-- create or replace function public\.tl_balance_info/m,
                        "create or replace function public.tl_balance_info");
  ok("tl_balance_info 주석 하나만 풀어도 잡아낸다", !봉인됐나(c));

  const d = raw.replace(/^-- grant execute on function public\.tl_balance_info/m,
                        "grant execute on function public.tl_balance_info");
  ok("grant 주석만 풀어도 잡아낸다", !봉인됐나(d));

  const e = raw + "\n" + unseal(raw.slice(raw.indexOf("-- create or replace function public.tl_earned")));
  ok("파일 맨 뒤에 옛 함수를 다시 붙여도 잡아낸다", !봉인됐나(e));

  /* 반대 방향 — 실수로 파일 전체를 봉인해 상점까지 죽이면 잡아냅니다 */
  const 전체봉인 = raw.split("\n").map((l) => "-- " + l).join("\n");
  ok("파일 전체를 봉인해 버리면 상점 검사가 잡아낸다", !상점살아있나(전체봉인));
  ok("상점 테이블 하나만 주석 처리해도 잡아낸다",
     !상점살아있나(raw.replace(/^create table if not exists public\.tl_purchases/m,
                              "-- create table if not exists public.tl_purchases")));
}

/* =====================================================================
 * ⑩ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑩ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("npm test 목록(tests/_order.txt)에 들어 있다", /tests\/tl-hotdeal-seal\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
