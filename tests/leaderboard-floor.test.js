/* tests/leaderboard-floor.test.js
 * 랭킹 누적은 0 이 바닥.
 *
 * 왜 (2026-08-20)
 *   누적 실현손익이 -18,158,792 까지 내려가 있었습니다. 이 값을 그대로
 *   들고 가면 앞으로 아무리 벌어도 그 마이너스를 다 메우기 전까지 계속
 *   0% 라서 사실상 복구가 불가능합니다.
 *
 *   앞서 손실을 0 으로 끊기만 했더니(greatest(0, realized_pnl))
 *   "잃은 사람은 0%" 는 됐지만 새로 벌어도 여전히 0% 였습니다.
 *
 *   규칙:  누적 = max(0, 누적 + 이번거래손익)
 *   잃으면 0 으로 내려앉고, 그다음 버는 것은 바로 랭킹에 올라갑니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SQL = fs.readFileSync(path.join(REPO, "supabase", "schema-leaderboard-floor.sql"), "utf8");
const SRC = fs.readFileSync(path.join(REPO, "js", "cycle-pnl.js"), "utf8");

/* 규칙 그대로 한 줄씩 세는 방법 */
function 한줄씩(pnls) {
  let c = 0;
  pnls.forEach((p) => { c = Math.max(0, c + p); });
  return c;
}
/* SQL 이 쓰는 방법 — 전체합계에서 가장 깊이 파인 지점을 끌어올림 */
function 공식(pnls) {
  let s = 0, mn = 0;
  pnls.forEach((p) => { s += p; mn = Math.min(mn, s); });
  return s - Math.min(0, mn);
}

console.log("\n랭킹 누적 — 0 이 바닥");

/* ---------- 두 방법이 같은 답을 내는가 ---------- */
{
  const 사례 = [
    ["벌기만", [10, 20, 5], 35],
    ["잃고 벌기", [10, -30, 5, 5], 10],
    ["크게 잃고 조금 벌기", [-18158792, 1000], 1000],
    ["벌고 잃고", [100, -40], 60],
    ["전부 손실", [-10, -20, -5], 0],
    ["오르내림", [50, -80, 30, -10, 60], 80],
    ["거래 없음", [], 0],
  ];
  사례.forEach(([이름, p, 정답]) => {
    ok(이름 + " → " + 정답, 한줄씩(p) === 정답 && 공식(p) === 정답,
      "한줄씩 " + 한줄씩(p) + " / 공식 " + 공식(p));
  });
}

/* ---------- 핵심 — 잃은 뒤에 벌면 바로 올라가는가 ---------- */
{
  /* 이게 이번 수정의 이유입니다. 예전 방식(그냥 합계를 0에서 끊기)에서는
     -18,158,792 뒤에 +1,000 을 벌어도 여전히 0 이었습니다. */
  const 예전방식 = (pnls) => Math.max(0, pnls.reduce((a, b) => a + b, 0));
  const 큰손실뒤수익 = [-18158792, 1000];
  ok("예전 방식은 벌어도 0 이었다", 예전방식(큰손실뒤수익) === 0);
  ok("새 방식은 번 만큼 바로 잡힌다", 한줄씩(큰손실뒤수익) === 1000);

  ok("절대 음수가 안 된다",
    [[-5], [-100, -200], [10, -50], [-1, 0, -1]].every((p) => 한줄씩(p) >= 0));
}

/* ---------- SQL 에 반영됐는가 ---------- */
{
  ok("사람별 랭킹 수익금 뷰가 있다", /create or replace view public\.ranking_profit/.test(SQL));
  ok("시간 순으로 누적을 쌓는다",
    /sum\(t\.pnl\) over \([\s\S]{0,160}order by t\.created_at/.test(SQL));
  ok("가장 깊이 파인 지점을 0 으로 끌어올린다",
    /least\(0, coalesce\(min\(누적\), 0\)\)/.test(SQL));
  ok("이번 사이클 거래만 센다",
    /coalesce\(t\.cycle_no, 1\) = coalesce\(ta\.cycle_no, 1\)/.test(SQL),
    "지난 사이클 거래가 섞이면 초기화가 의미 없어집니다");

  ok("랭킹 수익금으로 총자산을 낸다",
    /ta\.initial_balance \+ coalesce\(rp\.ranking_profit, 0\)/.test(SQL));
  ok("랭킹 수익금으로 수익률을 낸다",
    /coalesce\(rp\.ranking_profit, 0\) \/ nullif\(ta\.initial_balance, 0\)/.test(SQL));
  ok("거래가 없는 사람도 빠지지 않는다", /left join public\.ranking_profit/.test(SQL),
    "inner join 이면 거래 없는 회원이 랭킹에서 사라집니다");
  ok("내 순위도 같은 기준을 쓴다",
    (SQL.match(/coalesce\(rp\.ranking_profit, 0\) \/ nullif\(ta\.initial_balance, 0\)/g) || []).length >= 3);

  /* 실제 손익은 건드리지 않습니다. */
  ok("거래 기록을 바꾸지 않는다", !/update public\.trades|delete from public\.trades/.test(SQL));
  ok("계정의 실제 손익을 바꾸지 않는다", !/update public\.trading_accounts/.test(SQL),
    "마이페이지·거래내역에는 진짜 숫자가 나와야 합니다");
}

/* ---------- 화면도 같은 값을 쓰는가 ---------- */
{
  ok("화면이 서버 랭킹 수익금을 읽는다", /from\("ranking_profit"\)/.test(SRC));
  ok("못 읽으면 대체 계산을 쓴다", /Math\.max\(0, pnl\)/.test(SRC));
  ok("실제 손익은 따로 보관한다", /realized_pnl: pnl/.test(SRC),
    "마이페이지 실현손익에는 진짜 값이 나와야 합니다");
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
