/* ===========================================================================
 * tests/market-sale-stop-server.test.js
 *   TL 마켓 판매 중지가 ★서버에도★ 걸려 있는지 못 박습니다
 * ===========================================================================
 * 2026-09-02 · 수리팀
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────────────────
 *
 *   2026-08-31 대표님이 B안(판매 중지)을 고르셨고, 그날 ★화면★ 은 막았습니다
 *   (js/tl-market.js 의 SALE_PAUSED = true).
 *   그런데 ★서버는 열려 있었습니다★ — 2026-09-01 실서버 확인 결과
 *   '레버리지 x100배 이용권'(50 TL) 의 status 가 여전히 'active' 였습니다.
 *
 *   화면 버튼만 막은 것이라, 개발자도구를 아는 회원은
 *     supabase.rpc('purchase_tl_market_item', ...)
 *   를 직접 불러 50 TL 을 쓸 수 있었습니다. 그 아이템은 효과가 없습니다.
 *   ★TL 만 나가고 아무 일도 안 일어납니다★ (P1 — 회원이 손해를 봅니다).
 *
 * ── 그래서 여기서 못 박는 것 ───────────────────────────────────────────
 *   [1] 서버 잠금 SQL 파일이 있다
 *   [2] 그 파일이 상품 6개를 전부 'paused' 로 만든다
 *   [3] 회원 기록을 하나도 안 건드린다 (환불 C안은 대표가 안 고르셨습니다)
 *   [4] [0] 절이 읽기 전용이다
 *   [5] 되돌리기가 파일 안에 적혀 있고 ★한 줄★ 이다
 *   [6] 문법 — 괄호 짝 · 홑따옴표 짝 · case/end 짝 · 세미콜론
 *   [7] 화면 잠금과 서버 잠금이 서로 어긋나지 않는다
 *   [8] 서버 함수가 status 를 실제로 본다
 *   [9] 옛 파일과 부딪치는 것을 파일 안에 적어 두었다
 *
 * ── 대표님이 A안으로 바꾸시면 ──────────────────────────────────────────
 *   js/tl-market.js 의 SALE_PAUSED 를 false 로 바꾸시는 순간 [7] 이 실패해서
 *   "서버 되돌리기 한 줄도 같이 Run 하셔야 합니다" 를 알려줍니다.
 *   그때는 이 테스트와 tests/tl-market-sale-paused.test.js 를 같이 손보세요.
 *
 * 이 파일은 파일만 읽습니다. 사이트 코드도 서버도 건드리지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [32m✓[0m " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  [31m✗[0m " + 제목 + (도움말 ? " — " + 도움말 : ""));
  }
}

const SQL_PATH = path.join(REPO, "supabase", "schema-market-sale-stop.sql");
const UI_PATH = path.join(REPO, "js", "tl-market.js");
const MARKET_PATH = path.join(REPO, "supabase", "schema-tl-market.sql");

console.log("\nTL 마켓 — 서버 잠금 (schema-market-sale-stop.sql)");

/* =========================================================================
 * [1] 파일이 있다
 * ====================================================================== */
console.log("\n[1] 파일");
const 있다 = fs.existsSync(SQL_PATH);
ok("supabase/schema-market-sale-stop.sql 이 있다", 있다,
   "화면만 막고 서버를 안 막으면 개발자도구로 우회됩니다");

if (!있다) {
  console.log("\n파일이 없어 나머지 검사를 건너뜁니다.");
  console.log("통과 " + pass + " / 실패 " + fail);
  process.exit(1);
}

const RAW = fs.readFileSync(SQL_PATH, "utf8");
/* 주석을 지운 "실제로 도는 본문" 만 봅니다. 이 파일에는 문자열 안에 '--' 가 없습니다. */
const 실행부 = RAW.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
const 문장 = 실행부.split(";").map((s) => s.trim()).filter(Boolean);

/* =========================================================================
 * [2] 상품 6개를 전부 paused 로 만든다
 * ====================================================================== */
console.log("\n[2] 여섯 상품을 전부 막는가");
const 종류 = ["leverage_boost", "position_peek", "account_reset",
              "seed_recharge", "fee_discount", "liquidation_guard"];

const update문 = 문장.filter((s) => /^update\s/i.test(s));
ok("바꾸는 문장이 정확히 하나다", update문.length === 1,
   "찾은 개수 " + update문.length + " — 여러 개면 어디가 무엇을 바꾸는지 흐려집니다");

const U = (update문[0] || "").replace(/\s+/g, " ");
종류.forEach((t) => {
  ok(t + " 를 판매 중지에 넣었다", new RegExp("'" + t + "'").test(U));
});

ok("★leverage_boost 를 빠뜨리지 않았다★", /'leverage_boost'/.test(U),
   "지금 서버에서 유일하게 열려 있는 상품입니다. 이게 빠지면 이 작업이 무의미합니다");

ok("status 를 'paused' 로 바꾼다", /set status = 'paused'/i.test(U));
ok("상품을 지우지 않는다", !/delete\s+from/i.test(실행부),
   "나중에 A안으로 되살릴 수 있어야 합니다");
ok("조건 없는 UPDATE 가 아니다", /\bwhere\b/i.test(U) && /item_type in \(/i.test(U),
   "WHERE 없는 UPDATE 는 서버가 거부하고, 애초에 위험합니다");
ok("이미 paused 인 줄은 건드리지 않는다", /status <> 'paused'/i.test(U),
   "여러 번 Run 해도 updated_at 이 안 흔들립니다");

/* 이 파일이 스스로 다시 열어버리면 안 됩니다.
   (옛 파일 schema-market-pause-unbuilt.sql 의 [3] 이 그렇게 되돌립니다) */
ok("실행되는 문장에 status='active' 로 되돌리는 것이 없다",
   !/set status = 'active'/i.test(실행부),
   "되돌리기는 주석 안에만 있어야 합니다. 실행부에 있으면 잠금이 스스로 풀립니다");

/* =========================================================================
 * [3] 회원 기록을 안 건드린다
 * ====================================================================== */
console.log("\n[3] 회원 기록");
const 회원표 = ["user_items", "item_usage_logs", "tl_transactions",
                "tl_purchases", "trading_accounts", "profiles"];
회원표.forEach((t) => {
  const 위험 = new RegExp("(update|insert\\s+into|delete\\s+from)\\s+public\\." + t + "\\b", "i");
  ok(t + " 를 바꾸지 않는다 (읽기만)", !위험.test(실행부),
     "환불(C안)은 대표님이 고르지 않으셨습니다");
});
ok("바꾸는 표는 tl_market_products 하나뿐",
   (실행부.match(/update\s+public\.(\w+)/gi) || []).every((m) => /tl_market_products/i.test(m)));
ok("TRUNCATE / DROP 이 없다", !/\b(truncate|drop)\b/i.test(실행부));

/* =========================================================================
 * [4] [0] 절이 읽기 전용이다
 * ====================================================================== */
console.log("\n[4] [0] 번은 읽기만 하는가");
ok("[0] 번이 읽기 전용이라고 파일 맨 위에 적혀 있다",
   /\[0\][\s\S]{0,400}읽기/.test(RAW.slice(0, 2000)) || /읽기만[\s\S]{0,200}\[0\]/.test(RAW.slice(0, 2000)),
   "대표님이 지금 상태를 먼저 눈으로 보셔야 합니다");

const zero절 = RAW.split(/^-- \[1\]/m)[0];
const zero실행 = zero절.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
ok("[0] 절 안에 바꾸는 문장이 하나도 없다",
   !/^\s*(update|insert|delete|alter|create|drop)\b/im.test(zero실행),
   "여기서 무언가 바뀌면 '먼저 보시고 정하세요' 가 거짓말이 됩니다");
ok("[0] 절이 실제로 조회를 한다", /select/i.test(zero실행));
ok("[0] 절이 '지금 몇 개가 열려 있는지' 를 세어 보여준다",
   /count\(\*\) filter \(where status = 'active'\)/i.test(zero실행));

/* =========================================================================
 * [5] 되돌리기 — ★한 줄★
 * ====================================================================== */
console.log("\n[5] 되돌리기");
ok("되돌리는 방법이 파일 머리말에 있다",
   /되돌리는 방법/.test(RAW.slice(0, 3000)),
   "머리말에 없으면 대표님이 파일 끝까지 내려가야 압니다");
ok("[되돌리기] 절이 파일 끝에 있다", /\[되돌리기\]/.test(RAW));

/* 주석으로 적힌 되돌리기 update 가 leverage_boost 하나만 되살리는지 */
const 되돌리기 = RAW.match(/set status = 'active'[\s\S]{0,160}?;/g) || [];
ok("되돌리기 문장이 파일 안에 적혀 있다", 되돌리기.length >= 1);
ok("되돌리기가 leverage_boost 하나만 되살린다",
   되돌리기.every((s) => /item_type = 'leverage_boost'/.test(s)),
   "돌리기 직전 상태는 leverage_boost 만 active 였습니다. 6개 전부 켜면 원상복구가 아닙니다");
ok("되돌리기도 조건 없는 UPDATE 가 아니다",
   되돌리기.every((s) => /\bwhere\b/i.test(s)));
ok("되돌릴 때 화면 잠금(SALE_PAUSED)도 같이 풀라고 적혀 있다",
   /\[되돌리기\][\s\S]*SALE_PAUSED/.test(RAW),
   "한쪽만 풀면 화면과 서버가 서로 다른 말을 합니다");

/* =========================================================================
 * [6] 문법
 * ====================================================================== */
console.log("\n[6] 문법 (대표님이 편집기에서 오류를 보시지 않게)");
const 따옴표 = (실행부.match(/'/g) || []).length;
ok("홑따옴표 짝이 맞는다", 따옴표 % 2 === 0, "개수 " + 따옴표);

let depth = 0, 괄호오류 = false;
for (const ch of 실행부) {
  if (ch === "(") depth++;
  else if (ch === ")") { depth--; if (depth < 0) { 괄호오류 = true; break; } }
}
ok("괄호 짝이 맞는다", depth === 0 && !괄호오류, "최종 depth " + depth);

const cases = (실행부.match(/\bcase\b/gi) || []).length;
const ends = (실행부.match(/\bend\b/gi) || []).length;
ok("case 와 end 개수가 같다", cases === ends, "case " + cases + " / end " + ends);

ok("실행되는 문장이 모두 세미콜론으로 끝난다", 실행부.trim().endsWith(";"),
   "마지막 문장에 ; 이 빠지면 편집기가 오류를 냅니다");
ok("문장이 전부 select 또는 update 로 시작한다",
   문장.every((s) => /^(select|update)\b/i.test(s)),
   문장.filter((s) => !/^(select|update)\b/i.test(s)).map((s) => s.slice(0, 40)).join(" | "));
/* CTE 를 안 씁니다 — 쓰면 with a as (...), b as (...) 연결에서 쉼표 실수가 납니다 */
ok("CTE(with) 를 쓰지 않는다", !/^\s*with\s+\w+\s+as\s*\(/im.test(실행부),
   "쉼표 하나로 전체가 깨지는 구조를 일부러 피했습니다");

/* =========================================================================
 * [7] 화면 잠금과 서버 잠금이 어긋나지 않는다
 * ====================================================================== */
console.log("\n[7] 화면 잠금과 짝이 맞는가");
const UI = fs.readFileSync(UI_PATH, "utf8");
const 화면잠금 = /var SALE_PAUSED = true;/.test(UI);
ok("js/tl-market.js 의 SALE_PAUSED 가 true 다", 화면잠금,
   "false 로 바꾸셨다면 서버도 [되돌리기] 한 줄을 Run 하셔야 합니다");
ok("화면이 잠겨 있으면 서버 잠금 SQL 도 leverage_boost 를 막는다",
   !화면잠금 || /'leverage_boost'/.test(U),
   "둘이 어긋나면 회원이 보는 것과 서버가 하는 일이 달라집니다");
ok("화면 파일이 '서버도 막아야 한다' 는 사실을 알고 있다",
   /purchase_tl_market_item[\s\S]{0,200}서버/.test(UI) || /서버에서 tl_market_products\.status/.test(UI),
   "js/tl-market.js 의 주석에 이미 적혀 있어야 합니다");

/* =========================================================================
 * [8] 서버 함수가 status 를 실제로 본다
 * ====================================================================== */
console.log("\n[8] 서버가 paused 를 거절하는가");
const MARKET = fs.readFileSync(MARKET_PATH, "utf8");
ok("purchase_tl_market_item 이 status 를 검사한다",
   /if prod\.status <> 'active' then raise exception 'not_on_sale'/.test(MARKET),
   "이 검사가 없으면 status 를 paused 로 바꿔도 아무 소용이 없습니다");
ok("use_user_item 은 status 를 보지 않는다(이미 산 회원은 계속 쓸 수 있어야 함)",
   !/create or replace function public\.use_user_item[\s\S]*?tl_market_products[\s\S]*?\$\$;/.test(MARKET),
   "여기서 status 를 보게 되면 판매 중지가 보관함까지 막아버립니다");
ok("[0] 절이 서버 함수 본문을 직접 확인한다",
   /not_on_sale/.test(zero실행) && /pg_get_functiondef/.test(zero실행),
   "저장소 파일과 서버가 다를 수 있어서, 서버 본문을 봐야 확정됩니다");

/* =========================================================================
 * [9] 옛 파일과 부딪치는 것을 적어 두었다
 * ====================================================================== */
console.log("\n[9] 옛 파일과의 충돌 경고");
const 옛파일 = fs.readFileSync(path.join(REPO, "supabase", "schema-market-pause-unbuilt.sql"), "utf8");
const 옛파일이되살린다 = /set status = 'active'[\s\S]{0,80}item_type = 'leverage_boost'/.test(옛파일);
ok("옛 파일이 leverage_boost 를 되살리는 것이 사실이다", 옛파일이되살린다,
   "사실이 바뀌었으면 새 파일의 경고문도 같이 고쳐야 합니다");
ok("새 파일에 그 충돌이 적혀 있다",
   !옛파일이되살린다 || /schema-market-pause-unbuilt\.sql[\s\S]{0,600}다시 Run/.test(RAW),
   "그 파일을 다시 돌리면 이 잠금이 조용히 풀립니다");

/* =========================================================================
 * [10] 자기 등록
 * ====================================================================== */
console.log("\n[10] 자기 등록");
const ORDER = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
ok("tests/_order.txt 에 등록돼 있다",
   ORDER.includes("tests/market-sale-stop-server.test.js"),
   "등록 안 하면 npm test 가 이 파일을 안 돕니다");

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록");
  실패목록.forEach((s) => console.log("  · " + s));
  console.log("실패 있음 ❌");
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
