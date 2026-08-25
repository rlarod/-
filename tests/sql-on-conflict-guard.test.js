/* tests/sql-on-conflict-guard.test.js
 * =========================================================================
 * "on conflict do nothing" 이 아무것도 안 막던 함정
 * =========================================================================
 *
 * ── 2026-08-25 실측 ─────────────────────────────────────────────────────
 * TL 마켓 화면에 상품이 12개 떠 있었는데 실제로는 6종이었습니다.
 * 여섯 종류가 전부 두 벌씩이었습니다.
 *
 *   레버리지 x100배 이용권 · 포지션 훔쳐보기 이용권 · 코인선물 재충전 이용권
 *   시드 충전권 · 거래 수수료 할인권 · 포지션 보호권
 *
 * 원인 — supabase/schema-tl-market.sql 의 기본 상품 등록문이 이렇게 끝납니다.
 *
 *     insert into public.tl_market_products (name, ...) values (...)
 *     on conflict do nothing;
 *
 * 읽으면 "이미 있으면 건너뛴다" 로 보입니다. 그런데 tl_market_products 에는
 * 중복 방지 장치가 id(자동 생성 uuid) 하나뿐이고, INSERT 는 id 를 넣지
 * 않으므로 매번 새 uuid 가 만들어집니다. 절대 부딪히지 않으니 on conflict 절은
 * 한 번도 발동하지 않습니다. 그래서 파일을 두 번 실행하는 순간 두 벌이 됐습니다.
 *
 * ── 이 검사가 지키는 것 ─────────────────────────────────────────────────
 * 1) supabase/*.sql 안의 모든 "대상 없는 on conflict do nothing" INSERT 를
 *    찾아, 그 표에 실제로 발동할 수 있는 중복 방지 장치
 *    (unique index / unique constraint / primary key)가 있는지 확인합니다.
 *    "INSERT 가 값을 넣어주는 칸" 으로만 이루어진 것이어야 인정합니다.
 *    id 처럼 자동 생성되는 기본키는 인정하지 않습니다 — 그게 이번 함정입니다.
 * 2) 대상을 적은 on conflict (칸) 도 그 칸 조합의 장치가 실제로 있는지 봅니다.
 *    없으면 실행하는 순간 서버가 오류를 냅니다.
 * 3) 지금 이미 어긋나 있는 것은 KNOWN_보호안됨 에 적어 두고 개수를 못 늘리게
 *    막습니다(래칫). 고쳐지면 "이제 목록에서 빼라" 고 알려 줍니다.
 * 4) supabase/마켓중복정리-2026-08-25.sql 이 안전한지 같이 봅니다.
 *
 * ⚠️ 이 검사가 실패하면 SQL 을 고쳐야 한다는 뜻입니다.
 *    검사를 통과시키려고 예외 목록에 그냥 더하지 마세요.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SQL_DIR = path.join(REPO, "supabase");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* ------------------------------------------------------------------ 읽기 */

const files = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith(".sql")).sort();

/* 주석은 실행되지 않으므로 지웁니다. 지우지 않으면 마켓중복정리 파일처럼
   "설명하려고 옛 문장을 그대로 붙여 놓은" 곳이 전부 오탐이 됩니다. */
function strip(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
}

const SRC = {};       // 파일별 원문
const LIVE = {};      // 파일별 "실제로 실행되는 본문"
for (const f of files) {
  SRC[f] = fs.readFileSync(path.join(SQL_DIR, f), "utf8");
  LIVE[f] = strip(SRC[f]);
}
const ALL_LIVE = files.map((f) => LIVE[f]).join("\n;\n");

const norm = (t) => String(t).replace(/"/g, "").replace(/^public\./i, "").toLowerCase();
const cols = (s) => String(s).split(",").map((c) => c.trim().replace(/"/g, "").toLowerCase()).filter(Boolean);

/* ------------------------------------------- 표마다 어떤 중복 방지 장치가 있나
 * 아래 세 군데를 모읍니다.
 *   create table  : 칸 옆의 unique / primary key, 표 아래의 unique(...) / primary key(...)
 *   create unique index ... on 표 (칸들)
 *   alter table 표 add constraint ... unique (칸들) / primary key (칸들)
 * 각 항목은 "이 칸들이 같으면 서버가 거부한다" 는 뜻의 칸 목록입니다.
 * 자동 생성값(default)이 붙은 칸은 INSERT 가 값을 안 주면 절대 안 부딪히는데,
 * 그건 아래 "부분집합" 판정에서 자연히 걸러집니다.
 */
function uniqueKeysByTable() {
  const map = {};
  const add = (t, list) => {
    const k = norm(t);
    if (!k || !list.length) return;
    (map[k] = map[k] || []).push(list);
  };

  /* create table <t> ( ... ) — 괄호 짝을 세어 본문을 정확히 자릅니다. */
  const tRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?([\w."]+)\s*\(/gi;
  let m;
  while ((m = tRe.exec(ALL_LIVE)) !== null) {
    const table = m[1];
    let i = tRe.lastIndex, depth = 1;
    while (i < ALL_LIVE.length && depth > 0) {
      const ch = ALL_LIVE[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;
      i++;
    }
    const body = ALL_LIVE.slice(tRe.lastIndex, i - 1);

    /* 최상위 쉼표로만 자릅니다(check(...) 안의 쉼표에 속지 않게). */
    const parts = [];
    let d = 0, cur = "";
    for (const ch of body) {
      if (ch === "(") d++;
      if (ch === ")") d--;
      if (ch === "," && d === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    parts.push(cur);

    for (const raw of parts) {
      const p = raw.trim();
      if (!p) continue;
      let g = /^unique\s*\(([^)]*)\)/i.exec(p);
      if (g) { add(table, cols(g[1])); continue; }
      g = /^primary\s+key\s*\(([^)]*)\)/i.exec(p);
      if (g) { add(table, cols(g[1])); continue; }
      g = /^constraint\s+\S+\s+(?:unique|primary\s+key)\s*\(([^)]*)\)/i.exec(p);
      if (g) { add(table, cols(g[1])); continue; }
      /* 칸 정의 — 이름이 맨 앞이고 뒤에 unique / primary key 가 붙은 경우 */
      const name = /^([\w"]+)\s/.exec(p);
      if (name && /\b(unique|primary\s+key)\b/i.test(p)) add(table, [name[1].replace(/"/g, "").toLowerCase()]);
    }
  }

  /* create unique index ... on <t> (칸들) */
  const iRe = /create\s+unique\s+index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?\S+\s+on\s+([\w."]+)\s*\(([^)]*)\)/gi;
  while ((m = iRe.exec(ALL_LIVE)) !== null) add(m[1], cols(m[2]));

  /* alter table <t> add constraint ... unique/primary key (칸들) */
  const aRe = /alter\s+table\s+(?:only\s+)?([\w."]+)\s+add\s+constraint\s+\S+\s+(?:unique|primary\s+key)\s*\(([^)]*)\)/gi;
  while ((m = aRe.exec(ALL_LIVE)) !== null) add(m[1], cols(m[2]));

  return map;
}
const UNIQ = uniqueKeysByTable();

/* --------------------------------------------------- on conflict 쓰는 INSERT
 * insert into <표> (칸들) ... on conflict [ (칸들) | on constraint x ] do ...
 * VALUES 안의 괄호를 넘어가야 하므로 "insert into ~ 다음 세미콜론까지" 를 봅니다.
 * (문자열 안의 세미콜론은 이 저장소의 SQL 에는 없습니다.)
 */
function onConflictInserts(text, file) {
  const out = [];
  const re = /insert\s+into\s+([\w."]+)\s*\(([^)]*)\)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const end = text.indexOf(";", re.lastIndex);
    const stmt = text.slice(m.index, end === -1 ? text.length : end);
    const oc = /on\s+conflict\s*(?:\(([^)]*)\)|on\s+constraint\s+(\S+))?\s*(?:where\s+[\s\S]*?)?\s*do\s+(nothing|update)/i.exec(stmt);
    if (!oc) continue;
    out.push({
      file: file,
      table: norm(m[1]),
      insertCols: cols(m[2]),
      target: oc[1] ? cols(oc[1]) : null,
      constraintName: oc[2] || null,
      action: oc[3].toLowerCase(),
      line: text.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

const INSERTS = [];
for (const f of files) INSERTS.push.apply(INSERTS, onConflictInserts(LIVE[f], f));

/* 그 표의 장치 하나라도 "INSERT 가 값을 주는 칸" 으로만 이루어져 있으면
   on conflict 가 실제로 발동할 수 있습니다. */
function protectedBy(ins) {
  const keys = UNIQ[ins.table] || [];
  return keys.filter((k) => k.every((c) => ins.insertCols.indexOf(c) !== -1));
}

/* ----------------------------------------------------------- 이미 알려진 것
 * 지금 저장소에 남아 있는 "안전한 척하지만 아무것도 안 막는" INSERT 입니다.
 * 본부장 보고 대상이고, 여기 개수는 절대 늘릴 수 없습니다(래칫).
 *
 * 2026-08-25 확인 — public.tl_products (TL 핫딜 상품) 에는 중복 방지 장치가
 * id(자동 uuid) 밖에 없습니다. 마켓과 정확히 같은 함정입니다.
 *   supabase/schema-tl-hotdeal.sql        상품 23줄
 *   supabase/schema-tl-product-images.sql 상품  3줄
 * 두 파일 중 하나라도 두 번 실행되면 핫딜 상품이 두 벌이 됩니다.
 * 고치려면 마켓과 같은 방식으로
 *   create unique index ... on public.tl_products (brand, name);
 * 를 걸면 됩니다(브랜드가 달라도 이름이 같은 상품이 있어 name 하나로는 안 됩니다).
 * 고친 뒤에는 아래 줄을 지워야 이 검사가 통과합니다.
 * ------------------------------------------------------------------------ */
const KNOWN_보호안됨 = [
  "schema-tl-hotdeal.sql::tl_products",
  "schema-tl-product-images.sql::tl_products",
];

/* ========================================================================= */

console.log("\non conflict do nothing — 정말 막고 있나");

section("[1] 검사 대상을 실제로 찾았다");
ok("supabase 폴더에 SQL 파일이 있다", files.length >= 30, "찾은 개수 " + files.length);
ok("on conflict 를 쓰는 INSERT 를 찾았다", INSERTS.length >= 6, "찾은 개수 " + INSERTS.length);
ok("표별 중복 방지 장치 목록을 만들었다", Object.keys(UNIQ).length >= 8,
  "표 " + Object.keys(UNIQ).length + "개");
ok("문제의 그 INSERT(tl_market_products)를 실제로 집어냈다",
  INSERTS.some((i) => i.table === "tl_market_products" && i.target === null && i.action === "nothing"),
  "schema-tl-market.sql 의 기본 상품 등록문을 못 찾으면 이 검사는 헛돕니다");

section("[2] 대상 없는 on conflict do nothing — 진짜 발동하는가");
const bare = INSERTS.filter((i) => i.target === null && !i.constraintName && i.action === "nothing");
ok("대상 없는 on conflict do nothing 이 셋 이상 있다", bare.length >= 3, "개수 " + bare.length);

const 미보호 = [];
for (const ins of bare) {
  const keys = protectedBy(ins);
  const id = ins.file + "::" + ins.table;
  const 알려짐 = KNOWN_보호안됨.indexOf(id) !== -1;
  if (keys.length === 0) {
    미보호.push(id);
    if (알려짐) {
      /* 이미 본부장에게 보고된 건입니다. 눈에 보이게 남깁니다. */
      ok("[" + ins.file + ":" + ins.line + "] " + ins.table +
        " 은 아직 막혀 있지 않다 (알려진 함정 · 본부장 보고분)", true);
    } else {
      ok("[" + ins.file + ":" + ins.line + "] " + ins.table + " 에 실제 중복 방지 장치가 있다", false,
        "on conflict do nothing 이 한 번도 발동하지 않습니다. " +
        "파일을 두 번 실행하면 그대로 두 벌이 됩니다. " +
        "가진 장치=" + JSON.stringify(UNIQ[ins.table] || []) +
        " / INSERT 가 주는 칸=" + JSON.stringify(ins.insertCols));
    }
  } else {
    ok("[" + ins.file + ":" + ins.line + "] " + ins.table + " 은 " +
      JSON.stringify(keys[0]) + " 로 진짜 막힌다", true);
    if (알려짐) {
      ok("[" + id + "] 고쳐졌으니 KNOWN_보호안됨 에서 빼라", false,
        "이제 보호되고 있습니다. 이 파일 위쪽 KNOWN_보호안됨 목록에서 그 줄을 지우세요");
    }
  }
}

section("[3] 래칫 — 알려진 함정이 늘어나지 않았다");
ok("미보호 INSERT 가 " + KNOWN_보호안됨.length + "건을 넘지 않는다",
  미보호.length <= KNOWN_보호안됨.length,
  "지금 " + 미보호.length + "건: " + JSON.stringify(미보호));
ok("새로 생긴 미보호 INSERT 가 없다",
  미보호.every((id) => KNOWN_보호안됨.indexOf(id) !== -1),
  "목록에 없는 것: " + JSON.stringify(미보호.filter((id) => KNOWN_보호안됨.indexOf(id) === -1)));

section("[4] tl_market_products — 이번에 막은 그 표");
const 마켓파일 = "마켓중복정리-2026-08-25.sql";
ok("supabase/" + 마켓파일 + " 이 있다", files.indexOf(마켓파일) !== -1);
const 마켓정리 = LIVE[마켓파일] || "";
ok("그 파일이 tl_market_products(name) 에 unique 를 건다",
  /create\s+unique\s+index[\s\S]{0,120}?on\s+public\.tl_market_products\s*\(\s*name\s*\)/i.test(마켓정리),
  "이게 있어야 schema-tl-market.sql 의 on conflict do nothing 이 비로소 동작합니다");
ok("여러 번 실행해도 안전하게 if not exists 를 붙였다",
  /create\s+unique\s+index\s+if\s+not\s+exists/i.test(마켓정리));
ok("tl_market_products 의 unique 가 name 하나다(상품 이름 기준)",
  (UNIQ["tl_market_products"] || []).some((k) => k.length === 1 && k[0] === "name"));
ok("schema-tl-market.sql 의 상품 등록문이 name 을 넣는다(그래서 이제 부딪힌다)",
  INSERTS.some((i) => i.file === "schema-tl-market.sql" && i.table === "tl_market_products" &&
    i.insertCols.indexOf("name") !== -1));

section("[5] 대상을 적은 on conflict (칸) — 그 조합이 진짜 있는가");
const targeted = INSERTS.filter((i) => i.target && i.target.length);
ok("대상을 적은 on conflict 가 셋 이상 있다", targeted.length >= 3, "개수 " + targeted.length);
for (const ins of targeted) {
  const keys = UNIQ[ins.table] || [];
  const 맞음 = keys.some((k) =>
    k.length === ins.target.length && k.every((c) => ins.target.indexOf(c) !== -1));
  ok("[" + ins.file + ":" + ins.line + "] " + ins.table + " (" + ins.target.join(",") + ") 조합이 실제로 있다",
    맞음,
    "이 조합의 unique/primary key 가 없으면 실행하는 순간 서버가 오류를 냅니다. " +
    "가진 장치=" + JSON.stringify(keys));
}

section("[6] 마켓중복정리 파일이 안전한가");
/* 문장 단위로 자릅니다. 주석은 이미 지워져 있습니다. */
const 정리문장 = 마켓정리.split(";").map((s) => s.trim()).filter(Boolean);
const 삭제문 = 정리문장.filter((s) => /^delete\s+from/i.test(s));
ok("DELETE 가 있다(정리를 하긴 한다)", 삭제문.length >= 1, "개수 " + 삭제문.length);
ok("WHERE 없는 DELETE 가 없다", 삭제문.every((s) => /\bwhere\b/i.test(s)),
  "WHERE 없이 지우면 상품이 전부 사라집니다");
ok("사실상 전체를 지우는 WHERE 도 없다",
  삭제문.every((s) => !/\bwhere\b\s+(?:[\w."]+\s+is\s+not\s+null|true|1\s*=\s*1)\s*$/i.test(s)));
ok("TRUNCATE / DROP TABLE 이 없다",
  !/\btruncate\b/i.test(마켓정리) && !/\bdrop\s+(table|schema|database)\b/i.test(마켓정리));

/* 회원 표는 한 줄도 건드리면 안 됩니다. 읽기(select ... from)는 허용하고
   지우기·바꾸기만 봅니다. */
const 회원표 = ["user_items", "tl_transactions", "profiles", "trades", "trading_accounts",
  "positions", "orders", "tl_purchases"];
for (const t of 회원표) {
  const re = new RegExp("(delete\\s+from|truncate\\s+(?:table\\s+)?|update\\s+)(?:public\\.)?" + t + "\\b", "i");
  ok("회원 표를 지우거나 바꾸지 않는다: " + t, !re.test(마켓정리));
}
ok("auth.users 를 건드리지 않는다", !/auth\.users/i.test(마켓정리));
ok("구매 이력이 걸린 상품은 남긴다(not exists ... user_items)",
  /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.user_items/i.test(마켓정리),
  "이 조건이 빠지면 회원이 산 상품이 지워집니다");
ok("남길 줄을 고를 때도 구매 이력이 1순위다",
  /row_number\(\)[\s\S]{0,400}user_items[\s\S]{0,160}desc/i.test(마켓정리));
ok("한 덩어리로 처리한다(begin ... commit)",
  /^\s*begin\s*;?\s*$/im.test(마켓정리) && /^\s*commit\s*;?\s*$/im.test(마켓정리),
  "중간에 끊기면 절반만 지워진 상태가 됩니다");
ok("임시 표는 커밋과 함께 사라진다(on commit drop)",
  (마켓정리.match(/create\s+temporary\s+table[\s\S]{0,120}?on\s+commit\s+drop/gi) || []).length >= 2);
ok("되돌리는 방법이 파일에 적혀 있다",
  /되돌리기/.test(SRC[마켓파일]) &&
  /drop\s+index\s+tl_market_products_name_uniq/i.test(SRC[마켓파일]));
ok("대표님이 무엇을 하실지 파일에 적혀 있다", /대표님이 하실 일/.test(SRC[마켓파일]));
ok("왜 두 벌이 됐는지 원인이 파일에 적혀 있다",
  /on conflict do nothing/i.test(SRC[마켓파일]) && /아무것도 막지 못/.test(SRC[마켓파일]));

section("[7] 검사기 자체 확인 (오탐·미탐)");
{
  const 가짜 = "create table if not exists public.foo_bar (\n" +
    "  id uuid primary key default gen_random_uuid(),\n" +
    "  name text not null\n" +
    ");\n" +
    "insert into public.foo_bar (name) values ('x') on conflict do nothing;\n";
  const hits = onConflictInserts(strip(가짜), "가짜.sql");
  ok("자동 uuid 기본키만 있는 표의 INSERT 를 집어낸다",
    hits.length === 1 && hits[0].table === "foo_bar" && hits[0].target === null);
  /* foo_bar 는 실제 저장소에 없으므로 장치 목록이 비어 있습니다 */
  ok("그 INSERT 는 '보호 안 됨' 으로 판정된다", protectedBy(hits[0]).length === 0);
}
{
  const 주석뿐 = strip("-- insert into public.zzz (a) values (1) on conflict do nothing;");
  ok("주석 안의 문장은 세지 않는다(오탐 없음)",
    onConflictInserts(주석뿐, "가짜2.sql").length === 0);
}
{
  /* 진짜로 막히는 모양은 "보호됨" 으로 나와야 합니다(미탐 확인). */
  const tmp = onConflictInserts(
    strip("insert into public.tl_market_products (name) values ('x') on conflict do nothing;"), "가짜3.sql");
  ok("이름 unique 가 걸린 표는 '보호됨' 으로 판정된다", protectedBy(tmp[0]).length >= 1);
  const tmp2 = onConflictInserts(
    strip("insert into public.tl_market_products (category) values ('x') on conflict do nothing;"), "가짜4.sql");
  ok("unique 칸(name)을 안 넣는 INSERT 는 '보호 안 됨' 으로 판정된다", protectedBy(tmp2[0]).length === 0,
    "칸을 안 주면 그 unique 는 절대 부딪히지 않습니다");
}
ok("지금 저장소 상태에서 알려진 것 말고는 걸리는 게 없다",
  미보호.filter((id) => KNOWN_보호안됨.indexOf(id) === -1).length === 0,
  JSON.stringify(미보호));

section("[8] package.json 에 들어 있다");
{
  const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
  ok("npm test 목록에 이 파일이 있다", pkg.includes("tests/sql-on-conflict-guard.test.js"),
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
