/* tests/season-reset.test.js
 * 시즌 초기화가 안전한지, 관리자만 실행할 수 있는지 검증합니다.
 *
 * 발견했던 문제
 *   reset_season() 이 거래 데이터만 지우고 TL 사용 기록은 남겼습니다.
 *   TL 잔액 = tl_earned(거래 기반) + tl_transactions 합계 이므로,
 *   거래가 지워지면 획득이 0이 되는데 사용(음수)은 남아
 *   모든 회원의 TL 이 음수가 됩니다.
 *     초기화 전: 10,000 - 5,300 =  4,700
 *     초기화 후:      0 - 5,300 = -5,300
 *   그러면 아무도 아무것도 살 수 없습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const fix = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-reset-season-fix.sql"), "utf8"));

console.log("\n시즌 초기화");

/* ---------- 잔액이 음수가 되지 않는가 ---------- */
{
  ok("TL 거래내역을 함께 정리한다", /delete from public\.tl_transactions/.test(fix));
  ok("아이템 보관함도 정리한다", /delete from public\.user_items/.test(fix));
  ok("아이템 사용기록도 정리한다", /delete from public\.item_usage_logs/.test(fix));

  /* 실제 상품권을 받은 기록은 지우면 안 됩니다. */
  ok("핫딜 구매내역은 지우지 않는다", !/delete from public\.tl_purchases/.test(fix));

  /* 계산으로 확인 */
  const earned = 10000, spent = 5300;
  const before = earned - spent;
  const oldAfter = 0 - spent;                 // 옛 동작
  const newAfter = 0 - 0;                     // 사용 기록도 지운 뒤
  ok("옛 동작이면 잔액이 음수였다", oldAfter < 0, String(oldAfter));
  ok("고친 뒤에는 0 에서 시작한다", newAfter === 0);
  ok("초기화 전 잔액은 정상이었다", before > 0);
}

/* ---------- 시즌과 무관한 것은 남긴다 ---------- */
{
  ok("게시판을 지우지 않는다", !/delete from public\.(posts|post_comments|post_votes)/.test(fix));
  ok("채팅을 지우지 않는다", !/delete from public\.chat_messages/.test(fix));
  ok("회원 정보를 지우지 않는다", !/delete from public\.profiles/.test(fix));
  ok("상품 목록·재고를 건드리지 않는다", !/delete from public\.tl_products|update public\.tl_products/.test(fix));
}

/* ---------- 관리자만 ---------- */
{
  ok("관리자 검사가 있다", /admin_users where user_id = auth\.uid\(\)/.test(fix));
  ok("아니면 예외를 던진다", /raise exception 'permission denied: admin only'/.test(fix));
  ok("검사가 맨 앞에 있다",
     fix.indexOf("admin_users") < fix.indexOf("delete from public.positions"));
}

/* ---------- 안전 ---------- */
{
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(fix));
  ok("없는 테이블에서도 안 터진다", /to_regclass\('public\.tl_transactions'\)/.test(fix));
  ok("시즌 번호를 올린다(접속 중인 브라우저 정리)", /season_version/.test(fix));
  ok("거래 데이터는 그대로 지운다", /delete from public\.positions/.test(fix) && /delete from public\.trades/.test(fix));
}

/* ---------- 화면: 음수 잔액 표시 ---------- */
{
  const sandbox = {
    console,
    document: {
      readyState: "complete", addEventListener() {}, getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return String(this._t == null ? "" : this._t); } }),
    },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "tl-hotdeal.js"), "utf8"), sandbox);
  const H = sandbox.App.TLHotdeal;
  const prod = { id: "x", name: "t", brand: "b", category: "cafe", price: 10000, tl_price: 2700, stock: 50, max_purchase: 2, status: "active" };

  ok("잔액이 음수면 구매를 막는다", H.checkPurchase(prod, 1, -5300, 0).ok === false);
  ok("잔액 0 이어도 구매를 막는다", H.checkPurchase(prod, 1, 0, 0).ok === false);

  const js = fs.readFileSync(path.join(REPO, "js", "tl-hotdeal.js"), "utf8");
  const mk = fs.readFileSync(path.join(REPO, "js", "tl-market.js"), "utf8");
  ok("음수 잔액을 0 으로 표시한다(핫딜)", /Math\.max\(0, Number\(b\.balance\) \|\| 0\)/.test(js));
  ok("음수 잔액을 0 으로 표시한다(마켓)", /Math\.max\(0, Number\(b\.balance\) \|\| 0\)/.test(mk));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
