/* tests/recharge-reset.test.js
 * =========================================================================
 * "무료 충전(더하기)" → "지갑 초기화(덮어쓰기)" 를 지킵니다 — 2026-08-26 대표 지시
 * =========================================================================
 *
 * 대표 지시 원문
 *   "이거를 지갑 초기화로 하자 / 지갑 초기화 100,000usdt 충전
 *    두번씩 충전되고 그러니까 초기화 충전이 맞는거 같음"
 *
 * ── 무엇이 바뀌었나 ─────────────────────────────────────────────────────
 *   (전) balance = balance + 100,000   잔고 30,000 에서 두 번 → 230,000
 *   (후) balance = 100,000             잔고가 얼마든 → 100,000
 *
 * ── 이 변경이 위험한 이유 ───────────────────────────────────────────────
 *   지금까지는 잔고가 "절대 줄 수 없는" 버튼이었습니다. 이제는 줄어듭니다.
 *   잔고 500,000 인 회원이 실수로 누르면 400,000 이 사라집니다.
 *   그래서 누르기 전에 숫자로 확인 창을 띄우는 것이 이 건의 핵심입니다.
 *
 * ── 계급 회계 (여기가 제일 까다로웠습니다) ──────────────────────────────
 *   계급용 자산 = 지갑 + 묶인 증거금 − recharge_total
 *
 *   recharge_total 에는 "무상으로 받은 돈" 만 쌓습니다.
 *       받은 돈 = AMOUNT − least(AMOUNT, 이전잔고) = max(0, AMOUNT − 이전잔고)
 *
 *   · 잔고가 느는 경우 → 는 만큼 그대로 쌓여서 계급이 한 칸도 안 움직입니다
 *     (지금까지 '더하기' 였을 때와 완전히 같은 결과입니다)
 *   · 잔고가 주는 경우 → 받은 게 아니라 버린 것이므로 0 을 쌓고,
 *     지갑이 준 만큼 계급도 내려갑니다
 *     (2026-08-24 대표 결정 "계급은 지갑에 있는 돈으로 평가" 와 같은 방향)
 *
 *   ★ 왜 "recharge_total += (AMOUNT − 이전잔고)" (음수 허용) 이 아닌가
 *     음수가 되면 화면과 서버의 계급이 서로 달라집니다.
 *     js/rank.js 의 setRechargedTotal 과 서버의 rank_recharged_total() 이
 *     둘 다 음수를 0 으로 막기 때문입니다. [4] 에서 숫자로 보여 줍니다.
 *
 *   계급 공식(1000 × log2(자산/초기자금)) 은 한 글자도 바꾸지 않았습니다.
 *
 * ── 다른 테스트와 겹치지 않는 부분만 봅니다 ─────────────────────────────
 *   자정 리셋·하루 2회·초기자산 보정  → tests/recharge-rules.test.js
 *   계급표 19단계·화면↔서버 대조      → tests/rank-table.test.js
 *   서버가 금액을 정하는 구조          → tests/top-panel.test.js
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const DR_PATH = path.join(REPO, "supabase", "schema-daily-recharge.sql");
const RK_PATH = path.join(REPO, "supabase", "schema-rank-1000.sql");
const JS_PATH = path.join(REPO, "js", "daily-recharge.js");

const DR = fs.readFileSync(DR_PATH, "utf8");
const RK = fs.readFileSync(RK_PATH, "utf8");
const JS = fs.readFileSync(JS_PATH, "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

/* 주석(--)을 지운 "실제로 실행되는 본문" */
function strip(s) {
  return s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}
const DRC = strip(DR);
const RKC = strip(RK);

/* claim_daily_recharge() 본문만 잘라냅니다. */
function claimBody(src) {
  const a = src.indexOf("create or replace function public.claim_daily_recharge");
  if (a < 0) return "";
  const b = src.indexOf("grant execute on function public.claim_daily_recharge", a);
  return b < 0 ? src.slice(a) : src.slice(a, b);
}

console.log("\n지갑 초기화 (더하기 → 덮어쓰기)");

/* =========================================================================
 * [1] 서버가 덮어쓴다 — 더하기가 남아 있지 않다
 * ========================================================================= */
section("[1] 서버가 잔고를 덮어쓴다");
{
  [["schema-daily-recharge.sql", DRC], ["schema-rank-1000.sql", RKC]].forEach(([name, code]) => {
    const body = claimBody(code);
    ok(name + " 에서 claim_daily_recharge 를 찾았다", body.length > 300, String(body.length));
    ok(name + ": 잔고를 덮어쓴다 (balance = AMOUNT)",
      /set\s+balance\s*=\s*AMOUNT\s*,/.test(body),
      "덮어쓰지 않으면 두 번 누를 때 두 번 쌓입니다");
    ok(name + ": 더하기(balance = balance + AMOUNT)가 남아 있지 않다",
      !/balance\s*=\s*balance\s*\+/.test(body.replace(/\s+/g, " ")),
      "이게 남아 있으면 대표 지시 전으로 되돌아간 것입니다");
    ok(name + ": 금액은 여전히 서버 상수다",
      /AMOUNT constant numeric := \d+;/.test(body),
      "브라우저가 금액을 정하면 조작됩니다");
    ok(name + ": WHERE 없는 UPDATE 가 아니다",
      /where user_id = uid/.test(body));
  });
}

/* =========================================================================
 * [2] 두 파일의 함수 본문이 글자 하나까지 같다
 * ========================================================================= */
section("[2] 같은 함수가 두 파일에 있다 — 둘이 어긋나지 않는다");
{
  /* 어느 파일을 나중에 실행했느냐에 따라 서버 동작이 달라지는 문제입니다
     (docs/인계문서.md 6번). 본문이 같으면 순서가 상관없어집니다. */
  /* $$ 와 $fn$ 는 본문을 감싸는 표시일 뿐이라 같은 것으로 봅니다. */
  const norm = (t) => claimBody(t)
    .replace(/\$[A-Za-z_]*\$/g, "$Q$")
    .replace(/\s+/g, " ").trim();
  const a = norm(DRC);
  const b = norm(RKC);
  ok("두 파일의 claim_daily_recharge 본문이 같다", a === b,
    a === b ? "" : "길이 " + a.length + " vs " + b.length);
  ok("두 파일 모두 recharge_total 누계를 쌓는다",
    /recharge_total = coalesce\(recharge_total, 0\) \+ AMOUNT/.test(claimBody(DRC)) &&
    /recharge_total = coalesce\(recharge_total, 0\) \+ AMOUNT/.test(claimBody(RKC)));
  ok("두 파일 모두 recharge_total 칸을 만든다(어느 쪽을 먼저 돌려도 됨)",
    /add column if not exists recharge_total/.test(DRC) &&
    /add column if not exists recharge_total/.test(RKC));
}

/* =========================================================================
 * [3] 계급 회계 — 서버 식을 그대로 옮겨 계산합니다
 * ========================================================================= */
section("[3] 계급 회계 (recharge_total)");

/* SQL 에서 금액을 읽어옵니다. 테스트에 숫자를 베껴 적지 않습니다. */
const AMOUNT = Number((/AMOUNT constant numeric := (\d+);/.exec(claimBody(DRC)) || [])[1]);
const 배점 = Number((/log\(2,[^)]*\)[^*]*\* (\d+)/.exec(RK) || [])[1]);
const 초기자금 = Number((/select (\d+)::numeric;/.exec(
  fs.readFileSync(path.join(REPO, "supabase", "schema-initial-balance.sql"), "utf8")) || [])[1]);

/* 서버 claim_daily_recharge() 를 그대로 옮긴 것 */
function 초기화(acc) {
  const old = acc.balance;
  acc.balance = AMOUNT;
  acc.recharge_total = acc.recharge_total + AMOUNT - Math.min(AMOUNT, Math.max(0, old));
  return acc;
}
/* 서버 rank_assets() 를 그대로 옮긴 것 */
function 자산(acc) {
  return Math.max(0, acc.balance + (acc.margin || 0) - acc.recharge_total);
}
/* 서버 rank_points() 의 계급 몫 (운영자 가감점 제외) */
function 점수(acc) {
  const a = 자산(acc);
  return a > 0 ? Math.max(0, Math.log2(a / 초기자금) * 배점) : 0;
}

{
  ok("SQL 에서 금액을 읽어왔다 = " + AMOUNT, AMOUNT === 100000, String(AMOUNT));
  ok("SQL 에서 계급 배점을 읽어왔다 = " + 배점, 배점 === 1000, String(배점));
  ok("SQL 에서 초기자금을 읽어왔다 = " + 초기자금, 초기자금 === 100000, String(초기자금));
}

{
  /* 늘어나는 경우 — 계급이 한 칸도 안 움직여야 합니다. */
  const acc = { balance: 30000, recharge_total: 0, margin: 0 };
  const before = 점수(acc);
  초기화(acc);
  ok("잔고 30,000 → 100,000 이 된다", acc.balance === 100000, String(acc.balance));
  ok("받은 돈 70,000 이 누계에 쌓인다", acc.recharge_total === 70000, String(acc.recharge_total));
  ok("계급 점수가 그대로다(늘어나도 계급을 살 수 없다)",
    Math.abs(점수(acc) - before) < 1e-9, before + " → " + 점수(acc));

  /* 두 번 눌러도 결과가 같습니다 — 이것이 대표가 고치라고 한 것입니다. */
  초기화(acc);
  ok("두 번 눌러도 잔고는 100,000 그대로(예전에는 230,000 이었다)",
    acc.balance === 100000, String(acc.balance));
  ok("두 번째에는 받은 돈이 0 이라 누계가 안 는다",
    acc.recharge_total === 70000, String(acc.recharge_total));
  ok("두 번 눌러도 계급이 안 움직인다",
    Math.abs(점수(acc) - before) < 1e-9, before + " → " + 점수(acc));
}

{
  /* 줄어드는 경우 — 버린 것이므로 계급이 내려갑니다. */
  const acc = { balance: 500000, recharge_total: 0, margin: 0 };
  const before = 자산(acc);
  초기화(acc);
  ok("잔고 500,000 → 100,000 이 된다", acc.balance === 100000, String(acc.balance));
  ok("받은 돈이 0 이라 누계가 안 는다(버린 것이다)",
    acc.recharge_total === 0, String(acc.recharge_total));
  ok("계급용 자산이 400,000 줄어든다", before - 자산(acc) === 400000,
    before + " → " + 자산(acc));
  ok("그래서 계급 점수도 내려간다", 점수(acc) < Math.log2(before / 초기자금) * 배점);
}

{
  /* 누계는 절대 줄지 않습니다 — 아무 순서로 눌러도. */
  let 최소 = Infinity;
  const acc = { balance: 0, recharge_total: 0, margin: 0 };
  [0, 30000, 100000, 500000, 1, 99999, 100001, 2000000].forEach((b) => {
    acc.balance = b;
    const 이전 = acc.recharge_total;
    초기화(acc);
    최소 = Math.min(최소, acc.recharge_total, acc.recharge_total - 이전);
  });
  ok("누계와 그 증가분이 한 번도 음수가 되지 않는다", 최소 >= 0, String(최소));
}

/* =========================================================================
 * [4] 본부장 제안(음수 허용)이 왜 안 되는지 — 숫자로 남깁니다
 * ========================================================================= */
section("[4] 음수 누계를 쓰면 화면과 서버의 계급이 달라진다");
{
  /* 제안: recharge_total += (AMOUNT − 이전잔고), 음수 허용 */
  const 이전잔고 = 500000;
  const 음수누계 = 0 + (AMOUNT - 이전잔고);
  ok("제안대로면 누계가 음수가 된다", 음수누계 === -400000, String(음수누계));

  /* 서버 rank_assets() 는 그 음수를 그대로 뺍니다(= 더해집니다). */
  const 서버자산 = Math.max(0, AMOUNT + 0 - 음수누계);
  /* 화면(js/rank.js)과 rank_recharged_total() 은 음수를 0 으로 막습니다. */
  const 화면자산 = Math.max(0, AMOUNT + 0 - Math.max(0, 음수누계));
  ok("서버 자산과 화면 자산이 달라진다", 서버자산 !== 화면자산,
    "서버 " + 서버자산 + " / 화면 " + 화면자산);
  ok("차이가 정확히 버린 금액만큼이다", 서버자산 - 화면자산 === 400000,
    String(서버자산 - 화면자산));

  /* 그 clamp 가 실제로 코드에 있는지 확인합니다 — 이 근거가 사라지면 안 됩니다. */
  const rankJs = fs.readFileSync(path.join(REPO, "js", "rank.js"), "utf8");
  ok("화면(js/rank.js)이 음수 충전액을 0 으로 막는다",
    /Math\.max\(0,/.test(rankJs) && /rechargedTotal/.test(rankJs));
  const rechargedFn = RK.slice(RK.indexOf("function public.rank_recharged_total"),
    RK.indexOf("grant execute on function public.rank_recharged_total"));
  ok("서버(rank_recharged_total)도 음수를 0 으로 막는다", /greatest\(0,/.test(rechargedFn));
  ok("그래서 우리 방식은 누계를 절대 음수로 만들지 않는다",
    /least\(AMOUNT, greatest\(0, old_balance\)\)/.test(claimBody(DRC)),
    "max(0, AMOUNT − 이전잔고) 형태여야 합니다");
}

/* =========================================================================
 * [5] 확인 창 — 얼마가 어떻게 되는지 숫자로 보여준다
 * ========================================================================= */
section("[5] 누르기 전에 숫자로 확인한다");
{
  ok("확인 창을 띄운다(window.confirm)", /window\.confirm\(ask\)/.test(JS),
    "확인 없이 누르면 번 돈이 사라집니다");
  ok("확인 창이 서버에 보내기 전에 뜬다",
    JS.indexOf("window.confirm(ask)") < JS.indexOf('rpc("claim_daily_recharge")'));
  ok("지금 잔고와 바뀔 잔고를 함께 보여준다",
    /won\(before\)/.test(JS) && /won\(target\)/.test(JS));

  /* 늘어날 때 / 줄어들 때 문구가 달라야 합니다. */
  ok("늘어날 때와 줄어들 때를 나눈다", /if \(diff > 0\)/.test(JS) && /else if \(diff < 0\)/.test(JS));
  ok("늘어날 때는 '늘어납니다' 라고 한다", /USDT 가 늘어납니다/.test(JS));
  ok("줄어들 때는 '사라집니다' 라고 한다", /USDT 가 사라집니다/.test(JS));
  ok("줄어들 때는 되돌릴 수 없다고 알린다", /되돌릴 수 없습니다/.test(JS));
  ok("잔고가 같을 때도 안내가 따로 있다", /이미 .*USDT 입니다/.test(JS));

  /* 숫자를 못 받으면 진행하지 않아야 합니다. */
  ok("잔고를 못 받으면 아예 진행하지 않는다",
    /!Number\.isFinite\(before\) \|\| !Number\.isFinite\(target\)/.test(JS),
    "얼마가 사라지는지 모르는 채로 누르게 하면 안 됩니다");

  /* 금액은 서버가 정합니다. */
  ok("브라우저가 금액을 정하지 않는다(파일에 100000 이 없다)",
    !/100000/.test(JS.replace(/100,000/g, "")),
    "숫자가 박혀 있으면 서버와 어긋날 수 있습니다");
  ok("초기화 금액을 서버(recharge_status)에서 받아온다",
    /rpc\("recharge_status"\)/.test(JS) && /st\.data\.target/.test(JS));
  ok("서버가 target 을 실제로 돌려준다", /'target', AMOUNT/.test(DRC));
  ok("서버가 지금 잔고도 돌려준다", /'balance', bal/.test(DRC));
  ok("recharge_status 의 금액이 claim 의 금액과 같은 값이다",
    (DRC.match(/AMOUNT constant numeric := (\d+);/g) || []).every(
      (m) => Number(/(\d+)/.exec(m)[1]) === AMOUNT),
    "두 곳이 어긋나면 확인 창 숫자가 거짓말이 됩니다");
}

/* =========================================================================
 * [6] 끝난 뒤에도 서버 숫자로 알려준다
 * ========================================================================= */
section("[6] 끝난 뒤 안내");
{
  ok("서버가 얼마나 움직였는지 알려준다(delta)", /'delta', AMOUNT - old_balance/.test(DRC));
  ok("서버가 무상으로 준 금액도 알려준다(granted)", /'granted', AMOUNT - least/.test(DRC));
  ok("화면이 그 값을 그대로 쓴다", /Number\(data\.delta\)/.test(JS));
  ok("늘었는지 줄었는지 글자로 알려준다",
    /USDT 가 늘었습니다/.test(JS) && /USDT 가 줄었습니다/.test(JS));
  ok("서버가 확정한 잔고를 그대로 반영한다", /saved\.balance = Number\(data\.balance\)/.test(JS));
  ok("실패하면 서버 메시지를 그대로 보여준다", /초기화에 실패했습니다: " \+ msg/.test(JS),
    "'실패했습니다' 만 띄우면 원인을 못 찾습니다");
}

/* =========================================================================
 * [7] 바꾸지 말라고 한 것은 그대로다
 * ========================================================================= */
section("[7] 그대로 두라고 한 것");
{
  ok("하루 2회 제한 그대로", /recharge_max_per_day[\s\S]{0,200}select 2;/.test(DRC));
  ok("자정(한국시간) 리셋 그대로",
    /date_trunc\('day', now\(\) at time zone 'Asia\/Seoul'\)\) at time zone 'Asia\/Seoul'/.test(DRC));
  ok("포지션 보유 중 금지 그대로", /has_position/.test(claimBody(DRC)) && /public\.positions/.test(claimBody(DRC)));
  ok("동시 요청 이중 실행 방지 그대로", /for update/.test(claimBody(DRC)));
  ok("계급 공식(log2 × 배점)을 안 건드렸다", /log\(2,/.test(RK) && /\* 1000/.test(RK));
  ok("계급용 자산 식을 안 건드렸다", /-\s*coalesce\(ta\.recharge_total/.test(RK));
  ok("회원 기록을 지우는 문장이 없다",
    !/\b(drop\s+table|truncate|delete\s+from)\b/i.test(DRC));
  ok("여러 번 실행해도 안전하다(create or replace / if not exists)",
    /create or replace function public\.claim_daily_recharge/.test(DRC) &&
    /add column if not exists/.test(DRC));
}

/* =========================================================================
 * [8] 버튼 글씨
 * ========================================================================= */
section("[8] 버튼 글씨");
{
  /* 버튼 안에 줄바꿈 막는 span 이 들어 있어서, 태그를 빼고 글자만 봅니다. */
  const 버튼글씨 = (function () {
    const m = /<button[^>]*id="daily-recharge-btn"[^>]*>([\s\S]*?)<\/button>/.exec(HTML);
    return m ? m[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() : "";
  })();
  ok("버튼이 '지갑 초기화 100,000 USDT 충전' 이다",
    버튼글씨 === "지갑 초기화 100,000 USDT 충전", 버튼글씨);
  ok("긴 글씨가 단어 중간에서 잘리지 않게 묶어 둔다",
    /white-space:nowrap[^>]*>100,000 USDT 충전</.test(HTML),
    "1440 에서 충전 이 충 / 전 으로 쪼개졌습니다");
  ok("버튼에 '무료 충전' 이 남아 있지 않다",
    !/무료 충전 100,000 USDT/.test(HTML));
  ok("버튼은 여전히 기본 비활성이다(서버가 허용해야 열림)",
    /id="daily-recharge-btn" disabled/.test(HTML));
  ok("마크업을 지우지 않았다(되살릴 수 있다)",
    /id="daily-recharge-btn"/.test(HTML) && /id="daily-recharge-note"/.test(HTML));
  const LR = fs.readFileSync(path.join(REPO, "js", "login-required.js"), "utf8");
  ok("로그인 안내 문구도 '지갑 초기화' 다",
    /\{ id: "daily-recharge-btn", label: "지갑 초기화" \}/.test(LR));
}

/* =========================================================================
 * [9] 검사기 자체 확인
 * ========================================================================= */
section("[9] 검사기 자체 확인");
{
  ok("더하기로 되돌리면 잡아낸다",
    /balance\s*=\s*balance\s*\+/.test("     set balance = balance + AMOUNT,"));
  ok("멀쩡한 지금 문장은 안 잡는다",
    !/balance\s*=\s*balance\s*\+/.test("     set balance = AMOUNT,"));
  /* 음수 허용식과 우리 식이 늘어나는 경우엔 같고 줄어드는 경우엔 다릅니다. */
  const 우리 = (old) => AMOUNT - Math.min(AMOUNT, Math.max(0, old));
  const 제안 = (old) => AMOUNT - old;
  ok("늘어나는 경우 두 방식이 같다", 우리(30000) === 제안(30000), 우리(30000) + " vs " + 제안(30000));
  ok("줄어드는 경우 두 방식이 다르다", 우리(500000) !== 제안(500000), 우리(500000) + " vs " + 제안(500000));
}

/* =========================================================================
 * [10] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[10] 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다",
    pkg.indexOf("tests/recharge-reset.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
  ["tests/recharge-rules.test.js", "tests/rank-table.test.js", "tests/top-panel.test.js"].forEach((f) => {
    ok("겹침 담당 파일이 그대로 있다: " + f, fs.existsSync(path.join(REPO, f)));
  });
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
