/* tests/trading-cycle.test.js
 * 매매 사이클 기준 랭킹.
 *
 *   수익률 = 이번 사이클 누적 실현손익 ÷ 기준자본 × 100
 *
 * 지켜야 할 것
 *   1) 미실현손익은 랭킹에 안 들어간다
 *   2) 충전금액·지갑잔액을 수익으로 치지 않는다
 *   3) 랭킹과 마이페이지가 같은 값을 본다 (같은 원본)
 *   4) 새로고침·재로그인으로 초기화되지 않는다 (서버가 원본)
 *   5) 관리자 초기화 때만 0% 로 돌아간다
 *   6) 지난 사이클 거래 기록을 지우지 않는다
 *   7) 일반 회원에게 초기화 기능을 주지 않는다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SQL = fs.readFileSync(path.join(REPO, "supabase", "schema-trading-cycle.sql"), "utf8");
const LB = fs.readFileSync(path.join(REPO, "supabase", "schema-leaderboard-fix.sql"), "utf8");
const SRC = fs.readFileSync(path.join(REPO, "js", "cycle-pnl.js"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n매매 사이클 랭킹");

/* ---------- 수익률 계산 ---------- */
{
  const 수익률 = (pnl, base) => Math.round((pnl / base) * 100 * 100) / 100;
  /* 사양서 예시 그대로 검산합니다. 기준자본 1억(=100,000 USDT). */
  ok("+10,000 이면 +10%", 수익률(10000, 100000) === 10);
  ok("누적 +30,000 이면 +30%", 수익률(30000, 100000) === 30);
  ok("이후 -5,000 이면 +25%", 수익률(25000, 100000) === 25);
  ok("손실이면 음수로 나온다", 수익률(-12000, 100000) === -12);
  ok("초기화 직후는 0%", 수익률(0, 100000) === 0);

  ok("랭킹도 같은 식을 쓴다",
    /realized_pnl \/ nullif\(ta\.initial_balance, 0\)\) \* 100/.test(LB));
  ok("화면도 같은 식을 쓴다", /pnl \/ base\) \* 100/.test(SRC));
}

/* ---------- 무엇을 넣고 무엇을 빼는가 ---------- */
{
  ok("미실현손익은 넣지 않는다", !/unrealized/i.test(SQL) && !/unrealizedPnl/.test(SRC));
  ok("지갑잔고로 수익률을 내지 않는다", !/roe[\s\S]{0,80}ta\.balance/.test(LB));
  /* 무료 충전은 지갑을 늘리지만 기준자본도 실현손익도 건드리지 않습니다.
     그래서 충전만 받는다고 수익률이 오르지 않습니다. */
  const recharge = fs.readFileSync(path.join(REPO, "supabase", "schema-daily-recharge.sql"), "utf8");
  ok("무료 충전이 기준자본을 바꾸지 않는다", !/initial_balance\s*=/.test(recharge));
  ok("무료 충전이 실현손익을 바꾸지 않는다", !/realized_pnl\s*=/.test(recharge));
}

/* ---------- 한 곳에서만 값을 가져온다 ---------- */
{
  /* 마이페이지는 브라우저 저장소, 랭킹은 서버를 봤습니다. 브라우저 저장소가
     지워지거나 다른 기기로 접속하면 두 숫자가 어긋납니다(실제로 랭킹은 큰
     마이너스인데 화면은 0원이었습니다). 서버 값으로 통일합니다. */
  ok("서버 계정 표에서 읽는다", /from\("trading_accounts"\)/.test(SRC));
  ok("기준자본과 실현손익을 함께 읽는다",
    /initial_balance, realized_pnl, cycle_no/.test(SRC));
  ok("마이페이지 실현손익을 서버 값으로 덮는다", /mypage-realized/.test(SRC));
  ok("마이페이지에 누적 수익률을 보여준다", /mypage-cycle-roe/.test(SRC));
  ok("다시 그려져도 우리 값을 유지한다", /MutationObserver/.test(SRC));
  ok("서버를 못 읽으면 화면을 건드리지 않는다",
    /화면을 건드리지 않고/.test(SRC),
    "틀린 값으로 덮는 것보다 그대로 두는 편이 낫습니다");
}

/* ---------- 사이클 ---------- */
{
  ok("계정에 사이클 번호가 있다", /add column if not exists cycle_no/.test(SQL));
  ok("거래에도 사이클 번호가 붙는다",
    /alter table public\.trades[\s\S]{0,80}add column if not exists cycle_no/.test(SQL));
  ok("새 거래에 서버가 사이클 번호를 채운다",
    /set_trade_cycle[\s\S]{0,400}before insert on public\.trades/.test(SQL),
    "js/supabase-sync.js 는 수정 금지라 서버가 채워야 합니다");
  ok("끝난 사이클 성적을 보관한다", /create table if not exists public\.trading_cycles/.test(SQL));
  ok("보관할 때 그 사이클의 기준자본·손익·수익률을 남긴다",
    /base_capital[\s\S]{0,120}realized_pnl[\s\S]{0,120}roe_percent/.test(SQL));
}

/* ---------- 초기화 ---------- */
{
  const reset = SQL.slice(SQL.indexOf("function public.reset_trading_cycle"));
  ok("관리자만 초기화할 수 있다",
    /admin_users where user_id = auth\.uid\(\)[\s\S]{0,120}raise exception 'not_admin'/.test(reset));
  ok("실현손익을 0 으로 되돌린다", /realized_pnl\s*=\s*0/.test(reset));
  ok("새 기준자본을 세운다", /initial_balance\s*=\s*p_base_capital/.test(reset));
  ok("사이클 번호를 올린다", /cycle_no\s*=\s*ta\.cycle_no \+ 1/.test(reset));
  ok("거래 기록을 지우지 않는다", !/delete from public\.trades/.test(reset),
    "지난 사이클 기록은 보관해야 합니다");
  ok("열려 있던 포지션은 정리한다", /delete from public\.positions/.test(reset),
    "새 자본과 맞지 않는 포지션이 떠 있으면 안 됩니다");
  ok("Supabase 안전장치(WHERE 필수)를 지킨다", /user_id is not null/.test(reset));

  /* 일반 회원에게는 주지 않습니다. */
  ok("초기화 버튼은 관리자 창 안에만 만든다", /admin-panel/.test(SRC) && /admin-cycle-reset-btn/.test(SRC));
  ok("되돌릴 수 없는 동작이라 확인을 받는다", /confirm\(/.test(SRC));
  ok("SQL 을 안 돌렸으면 그렇게 알려준다", /schema-trading-cycle\.sql 을 먼저 실행/.test(SRC));
}

/* ---------- 수정 금지 파일 ---------- */
{
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("supabase-sync.js 를 건드리지 않았다", md5("supabase-sync.js") === "faddcbbc34b5165177ff26cb978040f8");
  ok("leaderboard.js 를 건드리지 않았다", md5("leaderboard.js") === "62e839f06e0565cca5d9216e484b6031");
  ok("season.js 를 건드리지 않았다", md5("season.js") === "9c5fbf13ced09ca2f348e48f87c78224");
  ok("index.html 에 연결돼 있다", /js\/cycle-pnl\.js/.test(HTML));
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
