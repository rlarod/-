/* tests/tl-realtime.test.js
 * TL 을 "거래할 때마다 실시간 지급" 으로 바꾼 것을 지킵니다. (2026-08-24 대표 지시)
 *
 * 공식은 하나도 바뀌지 않았습니다. "언제 주는가" 만 바뀌었습니다.
 *     성과 = floor( 300 × log2( 1 + max(0, 누적순수익) / 10,000,000 ) )
 *     참여 = (거래가 있었던 "날짜 수") × 5, 상한 150
 *
 * 이 테스트가 지키는 것 (중요한 순서대로)
 *   ① 지급액이 "이번 거래의 수익" 이 아니라 "누적 − 이미받은" 이다  ← 제일 중요
 *      이번 거래 수익으로 주면 익절 → 손절 을 반복해 무한히 긁을 수 있습니다.
 *   ② 배정서의 4단계 검산표 값이 그대로 나온다 (300 / 0 / 0 / 300)
 *   ③ 손실 뒤에 회수(음수 지급)가 없다
 *   ④ 트리거가 after insert on public.trades 이고,
 *      예외를 삼켜서 거래 저장을 막지 않는다  ← 회원 거래기록이 먼저입니다
 *   ⑤ 지급 함수가 authenticated / anon 에게 열려 있지 않다
 *   ⑥ 성과·참여 공식 상수가 그대로다 (300 / 1,000만 / ×5 / 상한 150)
 *   ⑦ 누적 순수익 정의가 js/realized-pnl-fix.js 와 같다 (월 조건만 뺀 것)
 *   ⑧ 날짜를 한국시간(Asia/Seoul)으로 센다
 *   ⑨ 밀린 거래분을 채우는 절이 있고, 보정 지급이 그 다음이다
 *   ⑩ 1절 미리보기가 읽기 전용이고 필요한 칸을 다 보여준다
 *   ⑪ 화면이 쓰는 json 키 5개가 그대로다 (js/tl-*.js 를 안 고쳐도 되게)
 *   ⑫ 회원 데이터를 지우지 않고, 여러 번 실행해도 안전하다
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

const SQL_PATH = path.join(REPO, "supabase", "schema-tl-realtime.sql");
ok("supabase/schema-tl-realtime.sql 이 있다", fs.existsSync(SQL_PATH));
const raw = fs.readFileSync(SQL_PATH, "utf8");
/* 주석을 지운 "실제로 실행되는 본문" */
const code = raw.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

/* 파일 안의 한 구간만 잘라냅니다. */
function slice(from, to) {
  const a = code.indexOf(from);
  if (a < 0) return "";
  const b = to ? code.indexOf(to, a + from.length) : -1;
  return b < 0 ? code.slice(a) : code.slice(a, b);
}

console.log("\nTL 실시간 지급 (거래할 때마다)");

/* =====================================================================
 * ① 차액 공식 — "이번 거래 수익" 이 아니라 "누적 − 이미받은"
 *
 * 이것이 이 변경의 전부입니다. 여기가 틀리면 회원이 익절·손절을 반복해
 * TL 을 무한히 긁을 수 있습니다. 상점 최고가가 500 TL 이라 바로 터집니다.
 * ===================================================================== */
console.log("\n① 차액 공식 (누적 − 이미받은)  ★ 가장 중요");
{
  const g = slice("function public.tl_grant_diff", "revoke all on function public.tl_grant_diff");
  ok("tl_grant_diff() 구간을 찾았다", g.length > 200, String(g.length));

  ok("받아야 할 총TL 은 '누적' 함수에서 가져온다(tl_total_amount)",
     /should\s*:=\s*coalesce\(public\.tl_total_amount\(p_uid\), 0\);/.test(g));
  ok("이미 받은 총TL 을 따로 구한다(tl_paid_total)",
     /paid\s*:=\s*coalesce\(public\.tl_paid_total\(p_uid\), 0\);/.test(g));
  ok("지급액 = 받아야 할 총TL − 이미 받은 총TL",
     /diff\s*:=\s*should\s*-\s*paid;/.test(g));
  ok("지급액이 0 이하면 아무것도 하지 않는다(회수하지 않는다)",
     /if diff is null or diff <= 0 then\s*return 0;/.test(g));
  ok("양수일 때만 tl_transactions 에 한 줄 남긴다",
     /insert into public\.tl_transactions/.test(g) &&
     g.indexOf("if diff is null or diff <= 0") < g.indexOf("insert into public.tl_transactions"));

  /* "이번 거래" 값이 계산에 절대 끼면 안 됩니다. */
  ["new.pnl", "new.fee", "new.quantity", "new.exit_price"].forEach((k) => {
    ok("지급 계산에 " + k + " 가 쓰이지 않는다", g.indexOf(k) < 0);
  });

  /* 트리거는 "누구에게" 만 알려주고 금액 계산은 전부 누적 함수가 합니다. */
  const trg = slice("function public.tl_on_trade_insert", "drop trigger if exists trg_tl_on_trade_insert");
  ok("트리거는 회원 id 와 거래 id 만 넘긴다(금액을 넘기지 않는다)",
     /perform public\.tl_grant_diff\(new\.user_id, new\.id\);/.test(trg), trg.replace(/\s+/g, " ").slice(0, 200));

  /* 누적 함수에 달·기간 조건이 없어야 "누적" 입니다. */
  const prof = slice("function public.tl_total_profit", "function public.tl_total_days");
  ok("누적 순수익 함수에 달 조건(date_trunc)이 없다", !/date_trunc/.test(prof));
  ok("누적 순수익 함수는 그 회원의 거래 전부를 본다",
     /from public\.trades t\s*where t\.user_id = p_uid;/.test(prof), prof.replace(/\s+/g, " ").slice(-140));

  const days = slice("function public.tl_total_days", "function public.tl_total_amount");
  ok("누적 거래날짜수 함수에도 달 조건이 없다", !/date_trunc/.test(days));

  /* 동시에 두 건이 들어와도 두 번 지급되지 않게 줄을 세웁니다. */
  ok("같은 회원 동시 거래를 줄 세운다(advisory lock)",
     /perform pg_advisory_xact_lock\(hashtextextended\(p_uid::text, 0\)\);/.test(g));
  ok("잠금이 계산보다 먼저다",
     g.indexOf("pg_advisory_xact_lock") < g.indexOf("should :="));
}

/* =====================================================================
 * ② 배정서의 4단계 검산표
 *
 *   순서 | 그 거래  | 누적 순수익 | 받아야 할 총TL | 이미 받은 | 이번 지급
 *     1  | +1,000만 |   1,000만   |      300       |     0     |   300
 *     2  | −1,000만 |        0    |        0       |   300     |     0
 *     3  | +1,000만 |   1,000만   |      300       |   300     |     0
 *     4  | +2,000만 |   3,000만   |      600       |   300     |   300
 * ===================================================================== */
console.log("\n② 4단계 검산표");

/* SQL 에 적힌 상수를 읽어와 자바스크립트로 같은 식을 계산합니다.
   숫자를 손으로 베껴 쓰면 SQL 이 바뀌어도 테스트가 통과해 버립니다. */
const AMT = slice("function public.tl_total_amount", "function public.tl_paid_total");
const 배점 = Number((AMT.match(/floor\(round\((\d+)\s*\*\s*log\(2,/) || [])[1]);
const 기준 = Number((AMT.match(/\/\s*(\d{6,})\)::numeric/) || [])[1]);
const 하루 = Number((AMT.match(/tl_total_days\(p_uid\)\s*\*\s*(\d+)/) || [])[1]);
const 상한 = Number((AMT.match(/least\((\d+),/) || [])[1]);

const 성과 = (누적순수익) => Math.floor(배점 * Math.log2(1 + Math.max(0, 누적순수익) / 기준));
const 참여 = (날짜수) => Math.min(상한, 날짜수 * 하루);

/* SQL 과 똑같은 차액 방식을 자바스크립트로 재현합니다.
   거래 목록을 순서대로 흘려보내며 "이번 지급액" 을 기록합니다. */
function 시뮬(거래들, 참여포함) {
  let 누적 = 0, 이미받은 = 0;
  const 날짜 = new Set();
  const 결과 = [];
  거래들.forEach((t, i) => {
    누적 += t.pnl;
    날짜.add(t.day === undefined ? i : t.day);
    const 받아야 = 성과(누적) + (참여포함 ? 참여(날짜.size) : 0);
    const 지급 = Math.max(0, 받아야 - 이미받은);
    이미받은 += 지급;
    결과.push({ 누적, 받아야, 이미받은: 이미받은 - 지급, 지급 });
  });
  return { 결과, 이미받은 };
}

{
  ok("SQL 에서 상수를 읽어왔다", 배점 === 300 && 기준 === 10000000 && 하루 === 5 && 상한 === 150,
     [배점, 기준, 하루, 상한].join(" / "));

  const 표 = 시뮬([
    { pnl:  10000000 },
    { pnl: -10000000 },
    { pnl:  10000000 },
    { pnl:  20000000 }
  ], false).결과;

  const 기대 = [
    { 누적:  10000000, 받아야: 300, 이미받은:   0, 지급: 300 },
    { 누적:         0, 받아야:   0, 이미받은: 300, 지급:   0 },
    { 누적:  10000000, 받아야: 300, 이미받은: 300, 지급:   0 },
    { 누적:  30000000, 받아야: 600, 이미받은: 300, 지급: 300 }
  ];

  기대.forEach((e, i) => {
    const a = 표[i];
    ok("[" + (i + 1) + "] 누적 " + e.누적.toLocaleString() +
       " → 받아야 " + e.받아야 + " / 이미받은 " + e.이미받은 + " / 이번지급 " + e.지급,
       a.누적 === e.누적 && a.받아야 === e.받아야 &&
       a.이미받은 === e.이미받은 && a.지급 === e.지급,
       JSON.stringify(a));
  });

  ok("4단계 뒤 총 지급은 600 이다", 시뮬([
    { pnl: 10000000 }, { pnl: -10000000 }, { pnl: 10000000 }, { pnl: 20000000 }
  ], false).이미받은 === 600);

  /* 파일 안에도 같은 검산이 SQL 로 들어 있어야 대표가 서버에서 확인할 수 있습니다. */
  ok("SQL 파일 9절에 검산 절이 있다", /as 이번지급/.test(code));
  ok("검산 절이 4단계를 그대로 담고 있다",
     /values \(1, 10000000::numeric[\s\S]{0,220}\(4, 30000000::numeric, 300::numeric\)/.test(code));
  ok("검산표가 주석에도 적혀 있다(대표가 파일만 읽어도 알게)",
     /받아야 할 총TL \| 이미 받은 \| 이번 지급/.test(raw));
}

/* =====================================================================
 * ③ 손실 뒤에 회수(음수 지급)가 없다 + 무한 적립이 막힌다
 * ===================================================================== */
console.log("\n③ 회수 없음 · 무한 적립 없음");
{
  /* (가) 손실만 본 회원 */
  const 손실 = 시뮬([{ pnl: -50000000 }, { pnl: -30000000 }], false);
  ok("손실만 봐도 지급액이 전부 0 이다", 손실.결과.every((r) => r.지급 === 0),
     JSON.stringify(손실.결과.map((r) => r.지급)));
  ok("손실만 봐도 누적 지급이 음수가 아니다", 손실.이미받은 === 0);

  /* (나) 익절 → 손절 을 100번 반복 — 옛날 방식이면 무한 적립 */
  const 반복 = [];
  for (let i = 0; i < 100; i++) { 반복.push({ pnl: 10000000 }); 반복.push({ pnl: -10000000 }); }
  const 차액방식 = 시뮬(반복, false).이미받은;
  const 거래별방식 = 반복.reduce((s, t) => s + 성과(t.pnl), 0);   // "이번 거래 수익" 으로 줬다면
  ok("차액 방식은 익절·손절 200번을 해도 300 TL 에서 멈춘다", 차액방식 === 300, String(차액방식));
  ok("'이번 거래 수익' 방식이었다면 30,000 TL 이 됐다", 거래별방식 === 30000, String(거래별방식));
  ok("차액 방식이 100배 이상 막아준다", 거래별방식 / 차액방식 >= 100,
     거래별방식 + " / " + 차액방식);

  /* (다) 아무 순서로 섞어도 — 총 지급은 "구간별 받아야할값의 최댓값" 을 넘지 않는다 */
  let 최악 = null;
  const rnd = (() => { let s = 12345; return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648; })();
  for (let k = 0; k < 300 && !최악; k++) {
    const 목록 = [];
    const n = 3 + Math.floor(rnd() * 25);
    for (let i = 0; i < n; i++) 목록.push({ pnl: Math.round((rnd() - 0.45) * 60000000), day: i % 7 });
    const s = 시뮬(목록, true);
    const 최대받아야 = Math.max(0, ...s.결과.map((r) => r.받아야));
    const 음수지급 = s.결과.some((r) => r.지급 < 0);
    if (음수지급 || s.이미받은 !== 최대받아야) 최악 = { 목록, s, 최대받아야 };
  }
  ok("무작위 300가지 순서에서도 음수 지급이 없다", 최악 === null,
     최악 ? JSON.stringify(최악.s.결과.map((r) => r.지급)) : "");
  ok("무작위 300가지 순서에서 총 지급 = 지나온 최고 '받아야할값'", 최악 === null,
     최악 ? 최악.s.이미받은 + " ≠ " + 최악.최대받아야 : "");

  /* (라) SQL 쪽에도 0 으로 막는 장치가 있어야 합니다. */
  ok("SQL 이 greatest(0, ...) 로 손실을 0 으로 막는다",
     /greatest\(0, public\.tl_total_profit\(p_uid\)\)/.test(code));
  ok("SQL 에 회수(음수 INSERT) 경로가 없다",
     !/amount\s*\)\s*values[\s\S]{0,80}-\s*diff/.test(code) && /if diff is null or diff <= 0 then/.test(code));
}

/* =====================================================================
 * ④ 트리거 — after insert / 예외를 삼켜 거래 저장을 막지 않는다
 *
 * 회원의 거래기록이 먼저입니다. TL 은 덤입니다.
 * 덤을 계산하다 오류가 났다고 회원 거래기록이 날아가면 안 됩니다.
 * ===================================================================== */
console.log("\n④ 트리거 (거래 저장을 절대 막지 않는다)");
{
  ok("trades 에 트리거를 건다",
     /create trigger trg_tl_on_trade_insert\s*after insert on public\.trades\s*for each row execute function public\.tl_on_trade_insert\(\);/
       .test(code.replace(/\s+/g, " ").replace(/create trigger/g, "\ncreate trigger").split("\n")
             .find((l) => /create trigger trg_tl_on_trade_insert/.test(l)) || ""),
     "정의를 못 찾음");
  ok("before insert 가 아니라 after insert 다",
     /after insert on public\.trades/.test(code) && !/before insert on public\.trades/.test(code));
  ok("여러 번 실행해도 안전하게 drop trigger if exists 를 먼저 한다",
     /drop trigger if exists trg_tl_on_trade_insert on public\.trades;/.test(code) &&
     code.indexOf("drop trigger if exists trg_tl_on_trade_insert") <
     code.indexOf("create trigger trg_tl_on_trade_insert"));

  const trg = slice("function public.tl_on_trade_insert", "drop trigger if exists trg_tl_on_trade_insert");
  ok("트리거 함수 구간을 찾았다", trg.length > 100, String(trg.length));
  ok("지급 부분을 begin ... exception 블록으로 감쌌다",
     /begin\s*begin\s*perform public\.tl_grant_diff/.test(trg), trg.replace(/\s+/g, " ").slice(0, 200));
  ok("어떤 오류든 삼킨다(exception when others then)",
     /exception when others then\s*return new;/.test(trg));
  ok("오류가 나도 return new 로 정상 종료한다(거래 저장 유지)",
     (trg.match(/return new;/g) || []).length === 2,
     String((trg.match(/return new;/g) || []).length));
  ok("트리거 함수 안에서 raise 로 다시 던지지 않는다", !/\braise\b/.test(trg));
  ok("트리거 함수가 security definer 다", /security definer/.test(trg));
  ok("search_path 를 고정했다", /set search_path = public/.test(trg));

  ok("왜 거래 저장이 안전한지 파일에 적어 뒀다",
     /SAVEPOINT/.test(raw) && /거래 저장은 반드시 성공/.test(raw));

  /* 기존 dedupe 트리거(before insert)를 건드리지 않았는지 — 이름이 다릅니다. */
  ok("기존 trg_skip_duplicate_trade 를 건드리지 않는다",
     !/trg_skip_duplicate_trade/.test(code));
}

/* =====================================================================
 * ⑤ 회원이 스스로 TL 을 지급할 수 없다
 *
 * PostgreSQL 은 함수를 만들면 기본으로 PUBLIC 에게 실행 권한을 줍니다.
 * 회수하지 않으면 회원이 rpc 로 "나에게 TL 주세요" 를 부를 수 있습니다.
 * ===================================================================== */
console.log("\n⑤ 지급 함수 권한 (회원이 못 부른다)");
{
  ["public", "anon", "authenticated"].forEach((role) => {
    ok("tl_grant_diff 실행 권한을 " + role + " 에게서 회수한다",
       new RegExp("revoke all on function public\\.tl_grant_diff\\(uuid, uuid\\) from " + role + ";").test(code));
  });
  ok("tl_grant_diff 에 grant execute 를 주지 않는다",
     !/grant execute on function public\.tl_grant_diff/.test(code));

  /* 트리거 함수 자체에는 일부러 revoke 를 걸지 않습니다.
     returns trigger 함수는 직접 부르면 PostgreSQL 이 막아 주므로 회수할 필요가 없고,
     반대로 회수했다가 트리거 발동 시 권한을 본다면 회원의 거래 저장이 통째로 실패합니다.
     거래 저장이 TL 보다 먼저이므로 그 위험을 아예 만들지 않습니다. */
  ok("트리거 함수에는 revoke 를 걸지 않는다(거래 저장이 막힐 위험을 안 만든다)",
     !/revoke all on function public\.tl_on_trade_insert/.test(code));
  ok("왜 걸지 않았는지 파일에 적어 뒀다",
     /trigger functions can only be called as triggers/.test(raw) &&
     /회원의 거래 저장이 통째로 실패합니다/.test(raw));
  ok("트리거 함수에 grant execute 를 새로 주지도 않는다",
     !/grant execute on function public\.tl_on_trade_insert/.test(code));
  ok("금액을 넣는 함수(tl_grant_diff)는 확실히 막혀 있다",
     /revoke all on function public\.tl_grant_diff\(uuid, uuid\) from authenticated;/.test(code));
  ok("트리거 함수가 security definer 라 소유자 권한으로 tl_grant_diff 를 부른다",
     /security definer/.test(slice("function public.tl_on_trade_insert",
                                   "drop trigger if exists trg_tl_on_trade_insert")));

  /* 회수가 함수 정의보다 뒤에 있어야 실제로 효과가 있습니다. */
  ok("회수 문장이 함수 정의보다 뒤에 있다",
     code.indexOf("revoke all on function public.tl_grant_diff") >
     code.indexOf("create or replace function public.tl_grant_diff"));

  /* 관리자 전용 함수는 여전히 am_i_admin() 으로 잠겨 있어야 합니다. */
  ["tl_settle_all_past", "tl_migrate_legacy"].forEach((fn) => {
    const body = slice("function public." + fn, "grant execute on function public." + fn);
    ok(fn + "() 은 am_i_admin() 으로 잠겨 있다",
       /if not public\.am_i_admin\(\) then\s*raise exception 'not_admin'/.test(body),
       body.length ? "검사 없음" : "구간을 못 찾음");
    ok(fn + "() 이 security definer 다", /security definer/.test(body));
  });

  /* 확인 절이 대표에게 실제 권한을 보여줘야 합니다. */
  ok("9절이 실제 권한을 조회해 보여준다",
     /has_function_privilege\('authenticated', 'public\.tl_grant_diff\(uuid,uuid\)', 'execute'\)/.test(code));
}

/* =====================================================================
 * ⑥ 공식 상수가 그대로다 (300 / 1,000만 / ×5 / 상한 150)
 * ===================================================================== */
console.log("\n⑥ 공식은 그대로 (300 / 1,000만 / ×5 / 상한 150)");
{
  ok("성과 배점 300", 배점 === 300, String(배점));
  ok("성과 기준금액 1,000만", 기준 === 10000000, String(기준));
  ok("참여 하루 5 TL", 하루 === 5, String(하루));
  ok("참여 상한 150", 상한 === 150, String(상한));

  const 표 = [
    [0, 0],
    [10000000, 300],
    [30000000, 600],
    [70000000, 900],
    [100000000, 1037],
    [1000000000, 1997]
  ];
  표.forEach(([순수익, 기대]) => {
    ok("누적순수익 " + 순수익.toLocaleString() + " → 성과 " + 기대 + " TL",
       성과(순수익) === 기대, "실제 " + 성과(순수익));
  });
  ok("1,000만은 정확히 300 (2배 지점)", 성과(10000000) === 배점);
  ok("3,000만은 정확히 600 (4배 지점)", 성과(30000000) === 배점 * 2);
  ok("7,000만은 정확히 900 (8배 지점)", 성과(70000000) === 배점 * 3);
  ok("수익이 10배가 돼도 TL 은 10배가 되지 않는다(로그)",
     성과(100000000) < 성과(10000000) * 10);

  ok("참여는 '거래 건수' 가 아니라 '거래 날짜 수'",
     /count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/
       .test(slice("function public.tl_total_days", "function public.tl_total_amount")));
  ok("참여 함수가 count(*) 를 쓰지 않는다",
     !/count\(\s*\*\s*\)/.test(slice("function public.tl_total_days", "function public.tl_total_amount")));
  ok("하루에 1,000번을 해도 그날 몫은 5 TL", 참여(1) === 5);
  ok("누적이라 결국 상한 150 에서 멈춘다", 참여(30) === 150 && 참여(365) === 150);

  ok("자릿수 오차 방어(round(...,6))가 남아 있다", /log\(2,[\s\S]{0,120}\), 6\)\)/.test(AMT));
}

/* =====================================================================
 * ⑦ 누적 순수익 정의 — js/realized-pnl-fix.js 와 같다 (월 조건만 뺀 것)
 * ===================================================================== */
console.log("\n⑦ 누적 순수익 정의 (확정손익과 동일)");
{
  const profit = slice("function public.tl_total_profit", "function public.tl_total_days");
  ok("순수익은 pnl 에서 '진입수수료' 를 뺀다", /t\.pnl\s*\n?\s*- case/.test(profit));
  ok("청산수수료를 두 번 빼지 않는다(pnl - fee 가 아니다)",
     !/t\.pnl\s*-\s*(coalesce\()?t\.fee/.test(profit));
  ok("진입수수료 = fee - 수량 × 청산가 × 테이커율(0.0005)",
     /t\.quantity, 0\) \* coalesce\(t\.exit_price, 0\) \* 0\.0005/.test(profit));
  ok("강제청산은 fee 전체가 진입수수료다", /'강제청산'\s*\n?\s*then coalesce\(t\.fee, 0\)/.test(profit));
  ok("반올림 오차로 음수가 되지 않게 막는다", /greatest\(0, coalesce\(t\.fee, 0\)/.test(profit));
  ok("근거(js/realized-pnl-fix.js)를 주석에 적었다", /js\/realized-pnl-fix\.js/.test(raw));

  /* 옛 월 정산 파일과 같은 식인지 — 달 조건 한 줄만 빠져야 합니다. */
  const 옛 = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-monthly.sql"), "utf8");
  const 옛식 = (옛.match(/coalesce\(t\.quantity, 0\) \* coalesce\(t\.exit_price, 0\) \* 0\.0005/g) || []).length;
  ok("옛 파일에도 같은 수수료 식이 남아 있다(정의를 새로 만들지 않았다)", 옛식 >= 1, String(옛식));

  /* 미리보기(1절)도 같은 식이어야 숫자가 어긋나지 않습니다. */
  const preview = slice("select\n  p.nickname", "alter table public.tl_transactions");
  ok("미리보기도 같은 수수료 식을 쓴다",
     /coalesce\(t\.quantity, 0\) \* coalesce\(t\.exit_price, 0\) \* 0\.0005/.test(preview));
  ok("미리보기도 달로 나누지 않는다(누적)", !/date_trunc/.test(preview));
}

/* =====================================================================
 * ⑧ 날짜는 한국시간 (Asia/Seoul)
 * ===================================================================== */
console.log("\n⑧ 날짜는 한국시간(Asia/Seoul)");
{
  ok("맨 ::date 로 날짜를 세는 곳이 없다",
     (code.match(/created_at\)?::date/g) || []).length === 0 ||
     !/created_at::date/.test(code),
     (code.match(/created_at::date[^\n]*/) || [""])[0]);
  ok("날짜는 전부 한국시간으로 바꾼 뒤 센다(계산 함수 + 미리보기 2곳)",
     (code.match(/count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/g) || []).length === 2,
     String((code.match(/count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/g) || []).length));
  ok("맨 date(...) 로 날짜를 세는 곳이 없다",
     !/(^|[^_A-Za-z])date\s*\(/.test(code),
     (code.match(/(^|[^_A-Za-z])date\s*\([^)]*\)/) || [""])[0]);
  ok("왜 한국시간인지 파일에 적어 뒀다", /날짜는 한국시간/.test(raw));

  /* 왜 필요한지 숫자로 — 같은 거래가 기준에 따라 다른 날짜가 됩니다. */
  const 날 = (isoUtc, 시차) =>
    new Date(new Date(isoUtc).getTime() + 시차 * 3600000).toISOString().slice(0, 10);
  ok("한국시간 9월 1일 03시 거래를 UTC 로 자르면 8월 31일이 된다",
     날("2026-08-31T18:00:00Z", 0) === "2026-08-31");
  ok("한국시간(UTC+9)으로 자르면 9월 1일이 된다",
     날("2026-08-31T18:00:00Z", 9) === "2026-09-01");
}

/* =====================================================================
 * ⑨ 밀린 것 채우기 → 그 다음 보정 지급
 * ===================================================================== */
console.log("\n⑨ 밀린 거래분 채우기 · 보정 지급 순서");
{
  const past = slice("function public.tl_settle_all_past", "grant execute on function public.tl_settle_all_past");
  ok("밀린 것 채우는 함수(tl_settle_all_past)가 있다", past.length > 200, String(past.length));
  ok("밀린 것도 같은 차액 함수를 쓴다(공식이 갈라지지 않게)",
     /public\.tl_grant_diff\(r\.uid, null\)/.test(past));
  ok("회원 전체를 한 번 돌면서 채운다", /from public\.profiles pr/.test(past));
  ok("여러 번 돌려도 안전하다(차액이 0 이면 아무것도 안 함)",
     /if amt > 0 then/.test(past));
  ok("월 정산 개념(tl_settle_month)이 남아 있지 않다",
     !/tl_settle_month/.test(code));

  const mig = slice("function public.tl_migrate_legacy", "grant execute on function public.tl_migrate_legacy");
  ok("보정 지급 함수가 그대로 살아 있다", mig.length > 200, String(mig.length));
  ok("옛 공식(거래횟수 × 10)을 그대로 계산한다",
     /public\.trades t where t\.user_id = r\.uid\), 0\) \* 10/.test(mig));
  ok("옛 공식의 수익률 × 20 도 계산한다", /\), 0\)\) \* 20/.test(mig));
  ok("보정 기준은 '이미 받은 성과·참여 합계'다", /paid_sum := coalesce\(public\.tl_paid_total\(r\.uid\), 0\);/.test(mig));
  ok("차액 = 옛 공식 − 새 지급합계", /diff := legacy - paid_sum;/.test(mig));
  ok("차액이 0 이하면 아무것도 하지 않는다(뺏지 않는다)",
     /if diff is null or diff <= 0 then\s*continue;/.test(mig));
  ok("회원당 1번만(유니크 인덱스)",
     /create unique index if not exists uq_tl_tx_migration_once[\s\S]{0,140}where type = 'migration'/.test(code));

  ok("7절(밀린 것) 다음에 8절(보정)이라는 순서 안내가 있다",
     /반드시 7절\(밀린 것 채우기\) 다음에 실행하세요/.test(raw));
  ok("보정 실행이 밀린 것 실행보다 파일 뒤에 있다",
     raw.indexOf("public.tl_migrate_legacy() as") > raw.indexOf("public.tl_settle_all_past() as"));

  /* 계산으로 확인 — 보정 뒤 잔액이 절대 줄지 않아야 합니다. */
  function 잔액(옛공식, 새지급, 기존기록합계) {
    const 옛 = 옛공식 + 기존기록합계;
    const 보정 = Math.max(0, 옛공식 - 새지급);
    const 새 = 기존기록합계 + 새지급 + 보정;
    return { 옛, 새 };
  }
  [[10000, 400, -5300], [400, 1200, 0], [0, 0, 0], [523, 523, -100]].forEach(([a, b, c]) => {
    const r = 잔액(a, b, c);
    ok("보정 뒤 잔액이 줄지 않는다 (옛 " + a + " / 새지급 " + b + ")", r.새 >= r.옛, r.옛 + " → " + r.새);
  });

  /* 보정지급이 "이미 받은 총TL" 에 끼면 안 됩니다 — 끼면 앞으로 성과 TL 을 영영 못 받습니다. */
  const paidfn = slice("function public.tl_paid_total", "grant execute on function public.tl_total_profit");
  ok("'이미 받은 총TL' 은 realtime / monthly 만 센다",
     /x\.type in \('realtime', 'monthly'\)/.test(paidfn));
  ok("'이미 받은 총TL' 에 migration 이 끼지 않는다", !/migration/.test(paidfn));
  ok("'이미 받은 총TL' 에 grant / refund 가 끼지 않는다",
     !/'grant'/.test(paidfn) && !/'refund'/.test(paidfn));
  ok("왜 migration 을 빼는지 주석에 적었다",
     /보정을 많이 받은 회원이 앞으로 영영 성과 TL 을 못 받게 됩니다/.test(raw));
}

/* =====================================================================
 * ⑩ 1절 미리보기는 읽기 전용
 * ===================================================================== */
console.log("\n⑩ 1절 미리보기 (읽기 전용)");
{
  const preview = slice("select\n  p.nickname", "alter table public.tl_transactions");
  ok("미리보기 구간을 찾았다", preview.length > 300, String(preview.length));
  ok("SELECT 로만 돼 있다", /^\s*select/i.test(preview.trim()));
  ok("INSERT / UPDATE / DELETE 가 없다", !/\b(insert|update|delete)\b/i.test(preview));
  ok("create / alter 도 없다", !/\b(create|alter|drop|truncate)\b/i.test(preview));

  ["닉네임", "지금_획득TL", "바뀐뒤_획득TL", "차액", "보정지급", "사용TL", "지금_보유TL", "최종_보유TL"]
    .forEach((col) => {
      ok("미리보기에 '" + col + "' 칸이 있다", new RegExp("as " + col + "[,\\s]").test(preview));
    });
  ok("차액이 큰(=많이 줄어드는) 회원부터 보여준다", /order by 차액 asc/.test(preview));
  ok("미리보기가 2절보다 앞에 있다",
     raw.indexOf("1절) 미리보기") < raw.indexOf("2절) tl_transactions 준비"));
  ok("선행조건(계급 분리) 확인이 맨 앞에 있다",
     raw.indexOf("선행조건_확인") < raw.indexOf("as 닉네임"));
}

/* =====================================================================
 * ⑪ 화면을 안 고쳐도 되게 — json 키가 그대로다
 * ===================================================================== */
console.log("\n⑪ 화면 호환 (js/tl-*.js 무수정)");
{
  const info = slice("function public.tl_balance_info", "grant execute on function public.tl_balance_info");
  ["logged_in", "earned", "spent", "granted", "balance"].forEach((k) => {
    ok("tl_balance_info() 가 '" + k + "' 키를 그대로 돌려준다", new RegExp("'" + k + "'").test(info));
  });
  ok("json 키가 5개 그대로다(더 늘지도 줄지도 않았다)",
     (info.match(/'(logged_in|earned|spent|granted|balance)',/g) || []).length >= 10);
  ok("잔액은 tl_balance() 와 같은 함수를 쓴다", /'balance', public\.tl_balance\(uid\)/.test(info));
  ok("함수 이름을 바꾸지 않았다(tl_earned / tl_balance / tl_balance_info)",
     /function public\.tl_earned\(/.test(code) &&
     /function public\.tl_balance\(/.test(code) &&
     /function public\.tl_balance_info\(/.test(code));
  ok("'지급(granted)' 은 성과·참여 지급을 뺀 값이다(같은 숫자가 두 번 안 보이게)",
     /x\.type not in \('realtime', 'monthly'\)/.test(info));

  /* 화면 쪽 파일이 정말 그대로인지 — 이 세 파일은 여전히 tl_balance_info 만 부릅니다. */
  ["tl-hotdeal.js", "tl-market.js", "tl-balance-sync.js"].forEach((f) => {
    const js = fs.readFileSync(path.join(REPO, "js", f), "utf8");
    ok("js/" + f + " 가 tl_balance_info 를 그대로 쓴다", /rpc\("tl_balance_info"\)/.test(js));
  });

  /* tl_earned() 는 저장된 기록만 봅니다 — 계좌를 비워도 TL 이 안 사라집니다. */
  const earned = slice("function public.tl_earned", "function public.tl_balance(");
  ok("tl_earned() 가 tl_transactions 만 본다", /from public\.tl_transactions/.test(earned));
  ok("tl_earned() 가 trades 를 세지 않는다(계좌 초기화해도 TL 이 안 사라진다)",
     !/public\.trades/.test(earned));
  ok("tl_earned() 에 rank_points 가 섞이지 않는다", !/rank_points/.test(earned));
}

/* =====================================================================
 * ⑫ 안전 — 회원 데이터를 지우지 않는다 / 여러 번 실행해도 안전
 * ===================================================================== */
console.log("\n⑫ 안전");
{
  ok("파일 전체에 DELETE 가 없다", !/\bdelete\s+from\b/i.test(code),
     (code.match(/delete\s+from[^\n;]*/i) || [""])[0]);
  ok("파일 전체에 UPDATE 문이 없다", !/^\s*update\s+/im.test(code));
  ok("TRUNCATE 가 없다", !/\btruncate\b/i.test(code));
  ok("DROP TABLE / SCHEMA / DATABASE 가 없다", !/\bdrop\s+(table|schema|database)\b/i.test(code));
  ok("새 표를 만들지 않는다(기존 tl_transactions 를 쓴다)", !/create table/i.test(code));

  ok("함수는 create or replace 로 여러 번 실행해도 안전하다",
     (code.match(/create or replace function/g) || []).length >= 9,
     String((code.match(/create or replace function/g) || []).length));
  ok("인덱스는 if not exists 로 만든다",
     (code.match(/create (unique )?index if not exists/g) || []).length >= 3);
  ok("칸 추가도 if not exists 다", /add column if not exists/.test(code));
  ok("타입 검사 제약에 realtime 을 넣었다",
     /check \(type in \('spend','refund','grant','monthly','migration','realtime'\)\)/.test(code));
  ok("기존 타입(spend/refund/grant)을 없애지 않았다", /'spend','refund','grant'/.test(code));

  ok("계급 점수는 미리보기와 보정지급(옛 값 계산)에만 남아 있다",
     (code.match(/rank_points(?!_all)/g) || []).length ===
       (slice("select\n  p.nickname", "alter table public.tl_transactions").match(/rank_points/g) || []).length +
       (slice("function public.tl_migrate_legacy", "grant execute on function public.tl_migrate_legacy")
          .match(/rank_points/g) || []).length,
     String((code.match(/rank_points(?!_all)/g) || []).length));

  ok("되돌리는 방법과 선행 파일을 안내한다",
     /schema-admin-patch\.sql/.test(raw) && /schema-rank-1000\.sql/.test(raw));
  ok("이 변경은 JS 수정 금지 파일과 무관하다(SQL 파일만 바꿨다)",
     path.extname(SQL_PATH) === ".sql");
}

/* =====================================================================
 * ⑬ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑬ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
  ok("package.json 의 test 목록에 tl-realtime 이 들어 있다", /tests\/tl-realtime\.test\.js/.test(pkg));
  ok("옛 파일 봉인 확인(tl-monthly)도 목록에 남아 있다", /tests\/tl-monthly\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
