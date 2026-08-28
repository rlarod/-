/* tests/sync-columns.test.js
 * 서버에 보내는 컬럼이 실제 테이블에 다 있는지 검증합니다.
 *
 * 발견했던 문제
 *   js/supabase-sync.js 가 trades 에 return_rate 를 함께 보내는데
 *   테이블에 그 컬럼이 없었습니다. 컬럼 하나가 없으면 insert 전체가
 *   거부되므로 청산 기록이 단 한 건도 저장되지 않았습니다.
 *
 *   그래서 새로고침하면 서버에서 '거래 0건' 으로 복원되고,
 *   실현손익이 0 이 된 뒤 그 값이 다시 서버에 저장돼
 *   '수익 2천만원이 -155 로 바뀌는' 일이 벌어졌습니다.
 *
 *   컬럼을 추가하는 패치 파일은 있었지만 실행되지 않았습니다.
 *   코드와 스키마가 어긋나면 조용히 실패하므로 테스트로 잡습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const sync = fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"), "utf8");

/* supabase 폴더 전체에서 테이블의 컬럼을 모읍니다
   (create table + 나중에 추가한 alter table 패치까지). */
function columnsOf(table) {
  const cols = new Set();
  fs.readdirSync(path.join(REPO, "supabase"))
    .filter((f) => f.endsWith(".sql"))
    .forEach((f) => {
      const s = fs.readFileSync(path.join(REPO, "supabase", f), "utf8");

      const i = s.indexOf("create table if not exists public." + table);
      if (i >= 0) {
        const body = s.slice(i, s.indexOf(");", i));
        (body.match(/^\s{2}(\w+)\s/gm) || []).forEach((m) => cols.add(m.trim()));
      }
      const re = new RegExp("alter table public\\." + table +
        "\\s+add column if not exists\\s+(\\w+)", "gi");
      let m;
      while ((m = re.exec(s)) !== null) cols.add(m[1]);
    });
  return cols;
}

/* supabase-sync.js 가 특정 테이블로 보내는 컬럼을 뽑습니다. */
function sentColumns(marker) {
  const i = sync.indexOf(marker);
  if (i < 0) return new Set();
  const block = sync.slice(i, sync.indexOf("}", sync.indexOf("{", i) + 1) + 1);
  const out = new Set();
  (block.match(/^\s+(\w+):/gm) || []).forEach((m) => out.add(m.trim().replace(":", "")));
  return out;
}

console.log("\n서버 저장 컬럼");

/* ---------- 청산 기록 ---------- */
{
  const have = columnsOf("trades");
  const send = sentColumns("const rows = newTrades.map");

  ok("trades 테이블 정의를 찾았다", have.size > 5, String(have.size));
  ok("보내는 컬럼을 찾았다", send.size > 5, String(send.size));

  const missing = [...send].filter((c) => !have.has(c));
  ok("보내는 컬럼이 전부 테이블에 있다", missing.length === 0,
     missing.length ? "없는 컬럼: " + missing.join(", ") : "");

  /* 이번에 문제였던 컬럼을 콕 집어 확인합니다. */
  ok("return_rate 컬럼이 있다(이게 없어서 전 거래 저장 실패)", have.has("return_rate"));
  ok("return_rate 를 추가하는 패치가 저장소에 있다",
     fs.existsSync(path.join(REPO, "supabase", "schema-return-rate-patch.sql")));
}

/* ---------- 계정 ---------- */
{
  const have = columnsOf("trading_accounts");
  const send = sentColumns("async function syncAccount");
  const missing = [...send].filter((c) => !have.has(c));
  ok("계정 저장 컬럼이 전부 있다", missing.length === 0,
     missing.length ? "없는 컬럼: " + missing.join(", ") : "");
}

/* ---------- 포지션 ---------- */
{
  const have = columnsOf("positions");
  const send = sentColumns("async function syncPosition");
  const missing = [...send].filter((c) => !have.has(c));
  ok("포지션 저장 컬럼이 전부 있다", missing.length === 0,
     missing.length ? "없는 컬럼: " + missing.join(", ") : "");
}

/* ---------- 주문 ---------- */
{
  const have = columnsOf("orders");
  const send = sentColumns("async function syncOrderHistory");
  const missing = [...send].filter((c) => !have.has(c));
  ok("주문 저장 컬럼이 전부 있다", missing.length === 0,
     missing.length ? "없는 컬럼: " + missing.join(", ") : "");
}

/* ---------- upsert 를 방해하는 트리거가 없는가 ---------- */
{
  /* trg_force_starting_balance 는 BEFORE INSERT 트리거인데,
     앱은 잔고를 upsert(INSERT ... ON CONFLICT DO UPDATE)로 저장합니다.
     PostgreSQL 은 충돌 확인 '전에' BEFORE INSERT 를 실행하므로,
     트리거가 balance 를 시작값으로 덮으면 갱신이 통째로 무효가 됩니다.
     실제로 그래서 새로고침마다 지갑이 1.5억으로 돌아갔습니다. */
  const files = fs.readdirSync(path.join(REPO, "supabase")).filter((f) => f.endsWith(".sql"));
  const all = files.map((f) => fs.readFileSync(path.join(REPO, "supabase", f), "utf8")).join("\n");
  const code = all.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

  ok("잔고를 upsert 로 저장한다", /trading_accounts"\)\.upsert/.test(sync));
  ok("시작값 강제 트리거가 기존 계정을 건드리지 않는다",
     /if exists \(select 1 from public\.trading_accounts t where t\.user_id = new\.user_id\) then\s*\n\s*return new;/.test(code));
  ok("신규 계정에는 여전히 시작값을 준다",
     /new\.initial_balance := public\.starting_balance\(\)/.test(code));
  ok("해결 SQL 이 저장소에 있다",
     fs.existsSync(path.join(REPO, "supabase", "지갑초기화-해결.sql")));
}

/* ---------- 실패를 조용히 넘기지 않는가 ---------- */
{
  /* 저장이 실패해도 콘솔에만 남고 사용자는 모릅니다.
     최소한 다음에 다시 시도는 해야 합니다. */
  ok("저장 실패 시 다음번에 다시 시도한다",
     /lastSyncedTradesCount를 안 올려서 다음번에 다시 시도/.test(sync));
  ok("실패를 콘솔에 남긴다", /trades 동기화 실패/.test(sync));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
