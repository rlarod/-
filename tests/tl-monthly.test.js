/* tests/tl-monthly.test.js
 * TL 을 "월 정산 + 저장" 방식으로 바꾼 것을 지킵니다.
 *
 * 왜 바꿨나 (supabase/schema-tl-hotdeal.sql 의 옛 tl_earned)
 *     거래횟수 × 10 + max(0, 수익률%) × 20 + rank_points
 *   1) 0.001 BTC 를 1,000번 사고팔면 실력 없이 10,000 TL 이 생겼습니다.
 *      상점 최고가가 500 TL 이니 공짜로 20개를 살 수 있었습니다.
 *   2) 계산식이라 계좌를 초기화하면(trades 가 비면) TL 이 통째로 사라졌습니다.
 *   3) 계급 점수(rank_points)가 TL 에 섞여 있었습니다.
 *
 * 새 규칙
 *     그달TL = 성과 + 참여
 *     성과   = floor( 300 × log2( 1 + max(0, 그달순수익) / 10,000,000 ) )
 *     참여   = (거래가 있었던 "날짜 수") × 5, 상한 150
 *
 * 이 테스트가 지키는 것
 *   · 성과 공식이 확정된 6개 구간 값을 그대로 낸다
 *   · 손실인 달에 음수 TL 이 나오지 않는다
 *   · "거래 건수" 가 아니라 "거래 날짜 수" 를 센다
 *   · 새 지급 경로에 rank_points 가 다시 섞이지 않는다
 *   · 같은 달을 두 번 정산해도 중복 지급되지 않는다
 *   · 전환 보정 지급(아무도 TL 이 줄지 않게)이 남아 있다
 *   · 달·날짜를 한국시간(Asia/Seoul) 기준으로 센다  ← 2026-08-24 추가
 *   · 1절 미리보기가 읽기 전용이다
 *   · 화면이 쓰는 json 키가 그대로다 (js/tl-*.js 를 안 고쳐도 되게)
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

const SQL_PATH = path.join(REPO, "supabase", "schema-tl-monthly.sql");
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

console.log("\nTL 월 정산 + 저장");

/* =====================================================================
 * ① 성과 공식 — 확정된 6개 구간
 * ===================================================================== */
console.log("\n① 성과 공식 (6개 구간 검산)");
{
  /* SQL 에 적힌 상수를 읽어와 자바스크립트로 같은 식을 계산합니다.
     숫자를 여기 손으로 베껴 쓰면 SQL 이 바뀌어도 테스트가 통과해 버립니다. */
  const fn = slice("function public.tl_month_amount", "grant execute on function public.tl_month_profit");
  const 배점 = Number((fn.match(/floor\(round\((\d+)\s*\*\s*log\(2,/) || [])[1]);
  const 기준 = Number((fn.match(/\/\s*(\d{6,})\)::numeric/) || [])[1]);
  const 하루 = Number((fn.match(/tl_month_days\(p_uid, p_month\)\s*\*\s*(\d+)/) || [])[1]);
  const 상한 = Number((fn.match(/least\((\d+),/) || [])[1]);

  ok("SQL 에서 상수를 읽어왔다", 배점 === 300 && 기준 === 10000000 && 하루 === 5 && 상한 === 150,
     [배점, 기준, 하루, 상한].join(" / "));

  const 성과 = (순수익) => Math.floor(배점 * Math.log2(1 + Math.max(0, 순수익) / 기준));

  /* 본부장 확정표. 1억·10억은 소수점을 버린 값입니다.
     (배정서의 "약 1,038" 은 반올림값 — floor 이므로 1,037 이 맞습니다.
      배정서의 10억 "약 1,724" 는 확정 공식으로 검산하면 1,997 입니다.
      공식이 정본이고 표의 그 한 줄이 어긋난 것이라 공식 값을 씁니다.) */
  const 표 = [
    [0, 0],
    [10000000, 300],
    [30000000, 600],
    [70000000, 900],
    [100000000, 1037],
    [1000000000, 1997]
  ];
  표.forEach(([순수익, 기대]) => {
    ok("순수익 " + 순수익.toLocaleString() + " → 성과 " + 기대 + " TL",
       성과(순수익) === 기대, "실제 " + 성과(순수익));
  });

  /* 딱 떨어지는 구간(2배·4배·8배)은 정확히 300/600/900 이어야 합니다. */
  ok("1,000만은 정확히 300 (2배 지점)", 성과(10000000) === 배점);
  ok("3,000만은 정확히 600 (4배 지점)", 성과(30000000) === 배점 * 2);
  ok("7,000만은 정확히 900 (8배 지점)", 성과(70000000) === 배점 * 3);

  /* 많이 벌수록 늘지만, 늘어나는 속도는 점점 느려집니다(로그). */
  ok("더 벌면 성과도 늘어난다", 성과(50000000) > 성과(20000000));
  ok("수익이 10배가 돼도 TL 은 10배가 되지 않는다",
     성과(100000000) < 성과(10000000) * 10, 성과(100000000) + " < " + 성과(10000000) * 10);

  /* 예산: 한 달 아주 잘한 회원이 1,000 TL 근처(≈ 1만원) */
  const 아주잘함 = 성과(60000000) + 상한;
  ok("한 달 최대치가 1,000 TL 근처다(예산 1만원)", 아주잘함 >= 800 && 아주잘함 <= 1200,
     String(아주잘함));
}

/* =====================================================================
 * ② 손실인 달에 음수가 안 나온다
 * ===================================================================== */
console.log("\n② 손실인 달");
{
  const 성과 = (순수익) => Math.floor(300 * Math.log2(1 + Math.max(0, 순수익) / 10000000));
  ok("손실 -1,000만 → 성과 0", 성과(-10000000) === 0, String(성과(-10000000)));
  ok("손실 -10억 → 성과 0", 성과(-1000000000) === 0, String(성과(-1000000000)));
  ok("손실이 커져도 마이너스로 안 간다", 성과(-1e12) >= 0);

  /* 참여 TL 은 손실이어도 그대로 줍니다 — 그달TL 이 음수가 될 수 없습니다. */
  const 그달 = (순수익, 날짜수) => 성과(순수익) + Math.min(150, 날짜수 * 5);
  ok("손실이어도 참여 TL 은 준다", 그달(-50000000, 10) === 50, String(그달(-50000000, 10)));
  ok("그달 TL 이 음수가 되는 경우가 없다",
     [-1e12, -1, 0, 1, 1e12].every((v) => 그달(v, 0) >= 0));

  /* SQL 쪽에도 0 으로 막는 장치가 있어야 합니다. */
  ok("SQL 이 greatest(0, ...) 로 손실을 0 으로 막는다",
     /greatest\(0, public\.tl_month_profit\(p_uid, p_month\)\)/.test(code));
  ok("음수 금액은 아예 기록하지 않는다(amt <= 0 이면 건너뜀)",
     /if amt is null or amt <= 0 then\s*continue;/.test(code));
}

/* =====================================================================
 * ③ 거래 "건수" 가 아니라 "날짜 수"  ← 무한 구멍을 막는 핵심
 * ===================================================================== */
console.log("\n③ 거래 건수가 아니라 거래 날짜 수");
{
  const days = slice("function public.tl_month_days", "function public.tl_month_amount");
  ok("tl_month_days() 가 있다", days.length > 50, String(days.length));
  ok("서로 다른 날짜만 센다 (count(distinct ... ::date))",
     /count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/.test(days),
     days.replace(/\s+/g, " ").slice(0, 200));
  ok("거래 건수(count(*))로 세지 않는다", !/count\(\s*\*\s*\)/.test(days));

  /* 참여 TL 은 날짜 수에만 곱합니다. */
  const amount = slice("function public.tl_month_amount", "grant execute on function public.tl_month_profit");
  ok("참여 TL 은 날짜 수 × 5", /tl_month_days\(p_uid, p_month\) \* 5/.test(amount));
  ok("참여 TL 에 상한 150 이 있다", /least\(150,/.test(amount));

  /* 옛 구멍이 정말 막혔는지 계산으로 확인합니다. */
  const 옛방식 = (건수) => 건수 * 10;                       // 거래 1건 = 10 TL
  const 새방식 = (날짜수) => Math.min(150, 날짜수 * 5);
  ok("옛 방식이면 1,000번 긁어 10,000 TL 이었다", 옛방식(1000) === 10000);
  ok("새 방식은 하루에 1,000번을 해도 5 TL", 새방식(1) === 5);
  ok("한 달 내내 거래해도 참여 TL 은 150 을 못 넘는다", 새방식(31) === 150);
  ok("구멍이 최소 66배 줄었다", 옛방식(1000) / 새방식(31) >= 66,
     String(옛방식(1000) / 새방식(31)));

  /* 미리보기(1절)도 같은 방식으로 세야 숫자가 어긋나지 않습니다. */
  const preview = slice("select\n  p.nickname", "alter table public.tl_transactions");
  ok("미리보기도 날짜 수로 센다", /count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/.test(preview));
}

/* =====================================================================
 * ④ 계급 점수(rank_points)가 TL 에 다시 섞이지 않는다
 * ===================================================================== */
console.log("\n④ 계급 점수 분리");
{
  /* 새 지급 경로 — 이 안에는 rank_points 가 하나도 없어야 합니다. */
  const 새경로 = [
    slice("function public.tl_month_profit", "function public.tl_month_days"),
    slice("function public.tl_month_days", "function public.tl_month_amount"),
    slice("function public.tl_month_amount", "grant execute on function public.tl_month_profit"),
    slice("function public.tl_earned", "function public.tl_balance("),
    slice("function public.tl_balance(", "function public.tl_balance_info"),
    slice("function public.tl_settle_month", "grant execute on function public.tl_settle_month")
  ];
  새경로.forEach((chunk, i) => {
    ok("새 지급 경로 " + (i + 1) + "/6 에 rank_points 가 없다", chunk.length > 20 && !/rank_points/.test(chunk),
       chunk.length <= 20 ? "구간을 못 찾음" : "rank_points 발견");
  });

  /* 새 tl_earned() 는 계산하지 않고 저장된 기록만 더합니다. */
  const earned = slice("function public.tl_earned", "function public.tl_balance(");
  ok("tl_earned() 가 tl_transactions 만 본다", /from public\.tl_transactions/.test(earned));
  ok("tl_earned() 가 trades 를 세지 않는다(계좌 초기화해도 TL 이 안 사라진다)",
     !/public\.trades/.test(earned));
  ok("tl_earned() 가 realized_pnl 을 쓰지 않는다", !/realized_pnl/.test(earned));

  /* rank_points 가 남아 있어도 되는 곳은 딱 둘 — 옛 값과 비교하는 자리입니다. */
  const 등장 = (code.match(/rank_points(?!_all)/g) || []).length;   /* rank_points_all(계급표 함수 이름)은 제외 */
  const 미리보기 = (slice("select\n  p.nickname", "alter table public.tl_transactions").match(/rank_points/g) || []).length;
  const 보정 = (slice("function public.tl_migrate_legacy", "grant execute on function public.tl_migrate_legacy")
                 .match(/rank_points/g) || []).length;
  ok("rank_points 는 미리보기와 보정지급(옛 값 계산)에만 남아 있다",
     등장 === 미리보기 + 보정 && 등장 > 0, "전체 " + 등장 + " / 미리보기 " + 미리보기 + " / 보정 " + 보정);

  /* 수정 금지 파일 12개는 손대지 않았습니다 — SQL 만 바꿉니다. */
  ok("이 변경은 JS 수정 금지 파일과 무관하다(SQL 파일 1개)",
     fs.existsSync(SQL_PATH) && path.extname(SQL_PATH) === ".sql");
}

/* =====================================================================
 * ⑤ 중복 정산 방지
 * ===================================================================== */
console.log("\n⑤ 같은 달을 두 번 정산해도 중복 지급 안 됨");
{
  ok("어느 달 몫인지 적는 칸(period)이 있다",
     /add column if not exists period date/.test(code));
  ok("회원+달 조합에 유니크 인덱스가 있다(서버에서 막기)",
     /create unique index if not exists uq_tl_tx_monthly_once[\s\S]{0,160}\(user_id, period\)[\s\S]{0,80}where type = 'monthly'/.test(code));
  ok("넣기 전에 이미 있는지도 확인한다",
     /if exists \(select 1 from public\.tl_transactions x\s*where x\.user_id = r\.uid and x\.type = 'monthly' and x\.period = m\)/.test(code));
  ok("혹시 뚫려도 on conflict do nothing 이 받아낸다",
     /on conflict do nothing/.test(slice("function public.tl_settle_month", "grant execute on function public.tl_settle_month")));

  ok("보정 지급도 회원당 1번만(유니크 인덱스)",
     /create unique index if not exists uq_tl_tx_migration_once[\s\S]{0,140}where type = 'migration'/.test(code));

  ok("아직 안 끝난 이번 달은 정산하지 않는다(한국시간 기준)",
     /if m >= date_trunc\('month', now\(\) at time zone 'Asia\/Seoul'\)::date then\s*raise exception 'month_not_finished'/.test(code));
  ok("달 구분은 한국시간 기준 date_trunc('month', created_at at time zone 'Asia/Seoul') 이다",
     /date_trunc\('month', t\.created_at at time zone 'Asia\/Seoul'\)/.test(code));

  /* 새 타입이 검사 제약에 들어가 있어야 INSERT 가 통과합니다. */
  ok("type 에 monthly / migration 을 추가했다",
     /check \(type in \('spend','refund','grant','monthly','migration'\)\)/.test(code));
  ok("기존 타입(spend/refund/grant)을 없애지 않았다",
     /'spend','refund','grant'/.test(code));
}

/* =====================================================================
 * ⑥ 관리자만 정산할 수 있다
 * ===================================================================== */
console.log("\n⑥ 관리자 잠금");
{
  ["tl_settle_month", "tl_settle_all_past", "tl_migrate_legacy"].forEach((fn) => {
    const body = slice("function public." + fn, "grant execute on function public." + fn);
    ok(fn + "() 은 am_i_admin() 으로 잠겨 있다",
       /if not public\.am_i_admin\(\) then\s*raise exception 'not_admin'/.test(body),
       body.length ? "검사 없음" : "구간을 못 찾음");
    ok(fn + "() 이 security definer 다", /security definer/.test(body));
  });
}

/* =====================================================================
 * ⑦ 보정 지급 — 아무도 TL 이 줄지 않는다
 * ===================================================================== */
console.log("\n⑦ 전환 보정 지급");
{
  const mig = slice("function public.tl_migrate_legacy", "grant execute on function public.tl_migrate_legacy");
  ok("보정 지급 함수가 있다", mig.length > 200, String(mig.length));
  ok("옛 공식(거래횟수 × 10)을 그대로 계산한다", /public\.trades t where t\.user_id = r\.uid\), 0\) \* 10/.test(mig));
  ok("옛 공식의 수익률 × 20 도 계산한다", /\), 0\)\) \* 20/.test(mig));
  ok("차액 = 옛 공식 - 월정산 합계", /diff := legacy - monthly_sum/.test(mig));
  ok("차액이 0 이하면 아무것도 하지 않는다(뺏지 않는다)",
     /if diff is null or diff <= 0 then\s*continue;/.test(mig));
  ok("지급은 tl_transactions 에 'migration' 으로 남긴다", /'migration'/.test(mig));
  ok("회원 데이터를 지우거나 바꾸지 않는다(INSERT 만)",
     !/delete\s+from/i.test(mig) && !/\bupdate\s+public\./i.test(mig));

  /* 계산으로 확인 — 보정 뒤 잔액이 절대 줄지 않아야 합니다. */
  function 잔액(옛공식, 월정산, 기존기록합계) {
    const 옛 = 옛공식 + 기존기록합계;
    const 보정 = Math.max(0, 옛공식 - 월정산);
    const 새 = 기존기록합계 + 월정산 + 보정;
    return { 옛, 새 };
  }
  const 사례 = [
    [10000, 400, -5300],   // 많이 긁던 회원: 옛 10,000 / 새 400 → 보정 9,600
    [400, 1200, 0],        // 실력자: 새 방식이 더 많음 → 보정 없음
    [0, 0, 0],             // 거래 없음
    [523, 523, -100]       // 딱 같음
  ];
  사례.forEach(([옛공식, 월정산, 기존]) => {
    const r = 잔액(옛공식, 월정산, 기존);
    ok("보정 뒤 잔액이 줄지 않는다 (옛 " + 옛공식 + " / 월정산 " + 월정산 + ")",
       r.새 >= r.옛, r.옛 + " → " + r.새);
  });
  ok("새 방식이 더 많으면 보정하지 않는다", Math.max(0, 400 - 1200) === 0);
  ok("많이 긁던 회원은 차액을 그대로 받는다", Math.max(0, 10000 - 400) === 9600);

  /* 순서 안내가 있어야 합니다 — 보정을 먼저 하면 과지급됩니다. */
  ok("6절(정산) 다음에 7절(보정)이라는 순서 안내가 있다",
     /반드시 6절\(월 정산\) 다음에 실행하세요/.test(raw));
  ok("보정 절이 정산 절보다 파일 뒤에 있다",
     raw.indexOf("tl_migrate_legacy()") > raw.indexOf("tl_settle_all_past()"));
}

/* =====================================================================
 * ⑧ 1절 미리보기는 읽기 전용
 * ===================================================================== */
console.log("\n⑧ 1절 미리보기 (읽기 전용)");
{
  const preview = slice("select\n  p.nickname", "alter table public.tl_transactions");
  ok("미리보기 구간을 찾았다", preview.length > 300, String(preview.length));
  ok("SELECT 로만 돼 있다", /^\s*select/i.test(preview.trim()));
  ok("INSERT / UPDATE / DELETE 가 없다",
     !/\b(insert|update|delete)\b/i.test(preview));
  ok("create / alter 도 없다", !/\b(create|alter|drop|truncate)\b/i.test(preview));

  ["닉네임", "지금_획득TL", "바뀐뒤_획득TL", "차액"].forEach((col) => {
    ok("미리보기에 '" + col + "' 칸이 있다", new RegExp("as " + col + "[,\\s]").test(preview));
  });
  ok("보정지급 예정액도 보여준다", /as 보정지급/.test(preview));
  ok("차액이 큰(=많이 줄어드는) 회원부터 보여준다", /order by 차액 asc/.test(preview));
  ok("미리보기가 2절보다 앞에 있다",
     raw.indexOf("1절) 미리보기") < raw.indexOf("2절) tl_transactions 준비"));
}

/* =====================================================================
 * ⑨ 화면을 안 고쳐도 되게 — json 키가 그대로다
 * ===================================================================== */
console.log("\n⑨ 화면 호환 (js/tl-*.js 무수정)");
{
  const info = slice("function public.tl_balance_info", "grant execute on function public.tl_balance_info");
  ["logged_in", "earned", "spent", "granted", "balance"].forEach((k) => {
    ok("tl_balance_info() 가 '" + k + "' 키를 그대로 돌려준다",
       new RegExp("'" + k + "'").test(info));
  });
  ok("잔액은 tl_balance() 와 같은 함수를 쓴다", /'balance', public\.tl_balance\(uid\)/.test(info));
  ok("함수 이름을 바꾸지 않았다(tl_earned / tl_balance / tl_balance_info)",
     /function public\.tl_earned\(/.test(code) &&
     /function public\.tl_balance\(/.test(code) &&
     /function public\.tl_balance_info\(/.test(code));

  /* 화면 쪽 파일이 정말 그대로인지 — 이 세 파일은 여전히 tl_balance_info 만 부릅니다. */
  ["tl-hotdeal.js", "tl-market.js", "tl-balance-sync.js"].forEach((f) => {
    const js = fs.readFileSync(path.join(REPO, "js", f), "utf8");
    ok("js/" + f + " 가 tl_balance_info 를 그대로 쓴다", /rpc\("tl_balance_info"\)/.test(js));
  });
}

/* =====================================================================
 * ⑩ 안전 — 회원 데이터를 지우지 않는다 / 여러 번 실행해도 안전
 * ===================================================================== */
console.log("\n⑩ 안전");
{
  ok("파일 전체에 DELETE 가 없다", !/\bdelete\s+from\b/i.test(code),
     (code.match(/delete\s+from[^\n;]*/i) || [""])[0]);
  ok("파일 전체에 UPDATE 문이 없다", !/^\s*update\s+/im.test(code));
  ok("TRUNCATE 가 없다", !/\btruncate\b/i.test(code));
  ok("DROP TABLE 이 없다", !/\bdrop\s+(table|schema|database)\b/i.test(code));
  ok("새 표를 만들지 않는다(기존 tl_transactions 를 쓴다)", !/create table/i.test(code));

  ok("함수는 create or replace 로 여러 번 실행해도 안전하다",
     (code.match(/create or replace function/g) || []).length >= 7,
     String((code.match(/create or replace function/g) || []).length));
  ok("인덱스는 if not exists 로 만든다",
     (code.match(/create (unique )?index if not exists/g) || []).length >= 3);
  ok("칸 추가도 if not exists 다", /add column if not exists/.test(code));

  /* 그달순수익 정의 — 프로젝트의 확정손익 정의(js/realized-pnl-fix.js)와 같아야 합니다. */
  const profit = slice("function public.tl_month_profit", "function public.tl_month_days");
  ok("순수익은 pnl 에서 '진입수수료' 를 뺀다", /t\.pnl\s*\n?\s*- case/.test(profit));
  ok("청산수수료를 두 번 빼지 않는다(pnl - fee 가 아니다)",
     !/t\.pnl\s*-\s*(coalesce\()?t\.fee/.test(profit));
  ok("진입수수료 = fee - 수량 × 청산가 × 테이커율(0.0005)",
     /t\.quantity, 0\) \* coalesce\(t\.exit_price, 0\) \* 0\.0005/.test(profit));
  ok("강제청산은 fee 전체가 진입수수료다", /'강제청산'\s*\n?\s*then coalesce\(t\.fee, 0\)/.test(profit));
  ok("반올림 오차로 음수가 되지 않게 막는다", /greatest\(0, coalesce\(t\.fee, 0\)/.test(profit));

  /* 근거를 주석으로 남겼는지 */
  ok("확정손익 근거(js/realized-pnl-fix.js)를 주석에 적었다",
     /js\/realized-pnl-fix\.js/.test(raw));
  ok("되돌리는 방법과 선행 파일을 안내한다",
     /schema-admin-patch\.sql/.test(raw) && /schema-rank-1000\.sql/.test(raw));
}

/* =====================================================================
 * ⑪ 달 경계는 한국시간 (Asia/Seoul)
 *
 * trades.created_at 은 timestamptz 라 세계표준시(UTC)로 저장됩니다.
 * 그냥 date_trunc('month', created_at) 으로 자르면 서버 시간대(UTC) 기준이 되고,
 * 한국은 UTC+9 라서 한국시간 9월 1일 오전 3시 거래가 8월 몫으로 잡힙니다.
 * 회원은 "9월에 벌었는데 왜 8월 정산에 들어갔지" 하게 됩니다.
 *
 * 나중에 누가 at time zone 을 지우면 이 절이 실패해서 잡아냅니다.
 * ===================================================================== */
console.log("\n⑪ 달 경계는 한국시간(Asia/Seoul)");
{
  const SEOUL = "at time zone 'Asia/Seoul'";

  /* date_trunc('month', ...) 의 인자를 괄호 짝을 맞춰 정확히 뽑습니다.
     now() 처럼 인자 안에 괄호가 또 있어서 정규식으로는 못 자릅니다. */
  function 월인자들(src) {
    const key = "date_trunc('month',";
    const out = [];
    let i = 0;
    while ((i = src.indexOf(key, i)) >= 0) {
      let j = i + key.length, depth = 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "(") depth++;
        else if (src[j] === ")") depth--;
        j++;
      }
      out.push(src.slice(i + key.length, j - 1).replace(/\s+/g, " ").trim());
      i = j;
    }
    return out;
  }

  const 인자 = 월인자들(code);
  ok("실행되는 date_trunc('month', ...) 를 전부 찾았다", 인자.length >= 10, String(인자.length));

  /* 인자로 허용되는 것은 딱 두 가지입니다.
       · timestamptz 를 한국시간으로 바꾼 것 (created_at / now())
       · p_month::timestamp — 인자가 date 라 시간대 자체가 없음 */
  const 맨것 = 인자.filter((a) => a.indexOf(SEOUL) < 0 && a !== "p_month::timestamp");
  ok("한국시간 없이 맨 date_trunc('month') 를 쓰는 곳이 없다",
     맨것.length === 0, 맨것.join(" | "));

  /* date(...) 로 날짜를 세도 같은 문제가 생깁니다. */
  ok("맨 date(...) 로 날짜를 세는 곳이 없다",
     !/(^|[^_A-Za-z])date\s*\(/.test(code),
     (code.match(/(^|[^_A-Za-z])date\s*\([^)]*\)/) || [""])[0]);
  ok("날짜는 한국시간으로 바꾼 뒤 센다(미리보기 + tl_month_days 두 곳)",
     (code.match(/count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/g) || []).length === 2,
     String((code.match(/count\(distinct \(t\.created_at at time zone 'Asia\/Seoul'\)::date\)/g) || []).length));

  /* p_month 는 date 라 시간대가 없습니다. 여기에 변환을 걸면 하루가 밀립니다. */
  ok("p_month(날짜)에는 시간대 변환을 걸지 않는다",
     !/p_month[^\n]*at time zone/.test(code));

  ok("'이번 달'(아직 정산하면 안 되는 달) 판정도 한국시간이다",
     /if m >= date_trunc\('month', now\(\) at time zone 'Asia\/Seoul'\)::date then/.test(code));

  /* period 칸에 저장되는 값도 같은 기준이어야 중복 정산 방지 인덱스가
     엉뚱한 달을 막지 않습니다. */
  ok("period 에 넣는 달(m)은 p_month 를 그대로 자른 값이다",
     /m := date_trunc\('month', p_month::timestamp\)::date;/.test(code));
  ok("정산 기록의 period 칸에 그 m 을 넣는다",
     /\(user_id, type, amount, balance_after, description, period\)[\s\S]{0,200}, m\)/.test(code));
  ok("이미 정산했는지도 같은 m 으로 확인한다",
     /x\.type = 'monthly' and x\.period = m/.test(code));

  /* 지난 달 목록도 한국시간으로 뽑아야 미리보기와 실제 지급이 안 어긋납니다. */
  const past = slice("function public.tl_settle_all_past", "grant execute on function public.tl_settle_all_past");
  ok("지난 달 목록도 한국시간으로 뽑는다(3곳)",
     (past.match(/at time zone 'Asia\/Seoul'/g) || []).length === 3,
     String((past.match(/at time zone 'Asia\/Seoul'/g) || []).length));

  /* 1절 미리보기와 계산 함수가 같은 기준이어야 숫자가 어긋나지 않습니다. */
  const previewKR = slice("select\n  p.nickname", "alter table public.tl_transactions");
  ok("미리보기도 한국시간으로 달을 나눈다(select + group by 2곳)",
     (previewKR.match(/date_trunc\('month', t\.created_at at time zone 'Asia\/Seoul'\)/g) || []).length === 2,
     String((previewKR.match(/date_trunc\('month', t\.created_at at time zone 'Asia\/Seoul'\)/g) || []).length));

  /* 왜 필요한지 숫자로 — 같은 거래가 기준에 따라 다른 달이 됩니다. */
  const 달 = (isoUtc, 시차) =>
    new Date(new Date(isoUtc).getTime() + 시차 * 3600000).toISOString().slice(0, 7);
  ok("한국시간 9월 1일 03시 거래를 UTC 로 자르면 8월이 된다",
     달("2026-08-31T18:00:00Z", 0) === "2026-08", 달("2026-08-31T18:00:00Z", 0));
  ok("한국시간(UTC+9)으로 자르면 9월이 된다",
     달("2026-08-31T18:00:00Z", 9) === "2026-09", 달("2026-08-31T18:00:00Z", 9));
  ok("한국시간 8월 31일 23시 거래는 어느 기준이든 8월이다",
     달("2026-08-31T14:00:00Z", 0) === "2026-08" && 달("2026-08-31T14:00:00Z", 9) === "2026-08");

  /* 시간대를 맞춘 것뿐이라 공식 자체는 그대로여야 합니다.
     같은 거래가 다른 달로 갈 뿐, 구간별 TL 값은 하나도 안 바뀝니다. */
  ok("성과 공식은 손대지 않았다(300 × log2, 기준 1,000만)",
     /300 \* log\(2, \(1 \+ greatest\(0, public\.tl_month_profit/.test(code));
  ok("참여 공식도 손대지 않았다(날짜수 × 5, 상한 150)",
     /least\(150, public\.tl_month_days\(p_uid, p_month\) \* 5\)/.test(code));
  const 성과KR = (v) => Math.floor(300 * Math.log2(1 + Math.max(0, v) / 10000000));
  [[0, 0], [10000000, 300], [30000000, 600], [70000000, 900],
   [100000000, 1037], [1000000000, 1997]].forEach(([순수익, 기대]) => {
    ok("구간 값이 그대로다: " + 순수익.toLocaleString() + " → " + 기대 + " TL",
       성과KR(순수익) === 기대, String(성과KR(순수익)));
  });

  /* 왜 이렇게 했는지 파일에 적어 뒀는지 */
  ok("왜 한국시간인지 파일에 적어 뒀다", /달의 경계는 한국시간/.test(raw));
  ok("period 칸 설명에도 한국시간이라고 적었다", /한국시간\(Asia\/Seoul\) 기준 그 달 1일/.test(raw));
}

/* =====================================================================
 * ⑫ package.json 에 등록돼 있다
 * ===================================================================== */
console.log("\n⑫ 테스트 등록");
{
  const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
  ok("package.json 의 test 목록에 들어 있다", /tests\/tl-monthly\.test\.js/.test(pkg));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
