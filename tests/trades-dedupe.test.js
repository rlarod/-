/* tests/trades-dedupe.test.js
 * 거래내역이 중복 저장되던 문제.
 *
 * 원인 (2026-08-20 실측)
 *   js/supabase-sync.js 의 lastSyncedTradesCount 가 페이지를 열 때마다
 *   0 으로 초기화됩니다. 그래서 새로고침할 때마다 브라우저에 남아 있는
 *   거래(최대 200건)를 통째로 다시 저장했습니다.
 *   실제 서버에 7,261건 — 200건 x 약 36번 새로고침.
 *
 * js/supabase-sync.js 는 수정 금지라 서버에서 막습니다.
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

const SQL = fs.readFileSync(path.join(REPO, "supabase", "schema-trades-dedupe.sql"), "utf8");
const SYNC = fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"), "utf8");

console.log("\n거래내역 중복 저장");

/* ---------- 원인이 그대로 남아 있는지 확인 ---------- */
{
  /* 수정 금지 파일이라 고칠 수 없습니다. 원인이 남아 있다는 사실 자체를
     기록해 둡니다 — 나중에 이 파일을 고칠 수 있게 되면 여기부터 봅니다. */
  ok("동기화가 '보낸 건수'를 기억으로만 들고 있다(원인)",
    /let lastSyncedTradesCount = 0;/.test(SYNC),
    "페이지를 열 때마다 0 이 되어 전부 다시 보냅니다");
  ok("그 값을 저장소에 남기지 않는다(원인)",
    !/Storage[\s\S]{0,60}lastSyncedTradesCount/.test(SYNC));

  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"))).digest("hex");
  ok("supabase-sync.js 를 건드리지 않았다", md5 === "faddcbbc34b5165177ff26cb978040f8", md5);
}

/* ---------- 서버가 막는다 ---------- */
{
  ok("같은 사람의 같은 시각 거래를 하나로 묶는다",
    /create unique index if not exists idx_trades_user_time[\s\S]{0,120}\(user_id, created_at\)/.test(SQL));

  /* 인덱스만 있으면 중복 저장 시 오류가 나고, 화면은 '저장 실패' 로 보고
     계속 다시 시도합니다(supabase-sync.js 의 재시도 로직). 조용히 넘겨야 합니다. */
  ok("중복이 와도 오류를 내지 않는다", /return null;/.test(SQL),
    "오류를 내면 화면이 무한히 재시도합니다");
  ok("넣기 전에 검사한다", /before insert on public\.trades/.test(SQL));
  ok("이미 있는지 확인하는 조건이 맞다",
    /where user_id = new\.user_id[\s\S]{0,60}created_at = new\.created_at/.test(SQL));
}

/* ---------- 기존 중복 정리 ---------- */
{
  ok("중복을 지우되 원본 1건은 남긴다",
    /row_number\(\) over \([\s\S]{0,120}partition by user_id, created_at/.test(SQL) &&
    /rn > 1/.test(SQL),
    "가장 먼저 들어온 1건만 남깁니다");
  ok("거래를 통째로 지우지 않는다", !/delete from public\.trades\s*;/.test(SQL),
    "원본까지 지우면 되돌릴 수 없습니다");
  ok("지우기 전에 몇 건인지 확인할 방법을 안내한다", /지워질건수/.test(SQL));
  ok("실행 뒤 결과를 확인한다", /남은중복건수/.test(SQL));
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
