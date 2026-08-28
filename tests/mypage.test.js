/* tests/mypage.test.js
 * 마이페이지 내역과 계정 관리를 검증합니다 (14순위).
 *
 * 전에는 자산 숫자만 있었습니다.
 *   총자산·잔고·증거금·손익·수수료·펀딩비·보유 TL
 * 없던 것: TL 내역, 핫딜/마켓 구매 내역, 로그아웃, 회원탈퇴
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
const strip = (s) => s.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

const sql = strip(fs.readFileSync(path.join(REPO, "supabase", "schema-mypage.sql"), "utf8"));
const js = fs.readFileSync(path.join(REPO, "js", "mypage-history.js"), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n마이페이지");

/* ---------- 지시서에 있던 항목이 다 있는가 ---------- */
{
  const need = [
    ["닉네임", /id="mypage-nickname"/],
    ["회원정보", /id="my-private-info"/],
    ["실현손익", /id="mypage-realized"/],
    ["TL 보유량", /id="mypage-tl"/],
    ["TL 내역", /id="mh-tl"/],
    ["핫딜 구매내역", /id="mh-hotdeal"/],
    ["마켓 아이템", /id="mh-market"/],
    ["로그아웃", /id="mh-logout"/],
    ["회원탈퇴", /id="mh-delete-account"/],
  ];
  need.forEach(function (n) { ok("항목이 있다: " + n[0], n[1].test(html)); });
}

/* ---------- 서버에서만 가져오는가 ---------- */
{
  /* 함수 이름을 변수로 넘기므로 rpc("이름") 형태가 아닙니다.
     이름이 코드에 있고 서버에도 그 함수가 있는지로 확인합니다. */
  ok("서버 함수로만 가져온다", /client\.rpc\(fn,/.test(js));
  ok("TL 내역", /"my_tl_history"/.test(js) && /function public\.my_tl_history/.test(sql));
  ok("핫딜 내역", /"my_hotdeal_purchases"/.test(js) && /function public\.my_hotdeal_purchases/.test(sql));
  ok("마켓 내역", /"my_market_items"/.test(js) && /my_market_items/.test(sql));
  ok("본인 것만 조회한다", (sql.match(/where t\.user_id = auth\.uid\(\)|where p\.user_id = auth\.uid\(\)|where ui\.user_id = auth\.uid\(\)/g) || []).length >= 3);
  ok("내역이 없으면 없다고 쓴다", /내역이 없습니다/.test(js) && /아이템이 없습니다/.test(js));
  ok("없는 값을 지어내지 않는다", !/샘플|예시 데이터|dummy/.test(js));
}

/* ---------- 없는 컬럼을 쓰고 있지 않은가 ---------- */
{
  /* 처음에 t.reason / t.tx_type / ui.used_at / ui.expires_at 처럼
     실제로 없는 컬럼을 써서 SQL 이 실행조차 안 됐습니다.
     (ERROR: column t.reason does not exist)
     코드가 참조하는 컬럼이 진짜 있는지 매번 대조합니다. */
  function tableColumns(name) {
    const out = new Set();
    fs.readdirSync(path.join(REPO, "supabase")).filter((f) => f.endsWith(".sql")).forEach((f) => {
      const x = fs.readFileSync(path.join(REPO, "supabase", f), "utf8");
      const i = x.indexOf("create table if not exists public." + name);
      if (i < 0) return;
      const body = x.slice(i, x.indexOf(");", i));
      (body.match(/^ {2}(\w+)\s/gm) || []).forEach((m) => out.add(m.trim()));
    });
    return out;
  }

  /* 마지막 확인 구문은 pg_proc(시스템 테이블)을 보므로 잘라냅니다.
     sql 변수는 주석이 이미 제거된 상태라 pg_proc 를 기준으로 자릅니다. */
  /* 마지막 확인 구문은 pg_proc(시스템 테이블)을 보고, 거기서도 별칭 p 를
     씁니다. p.proname 이 from 절보다 앞에 나오므로 select 부터 잘라냅니다. */
  const cut = sql.indexOf("p.proname");
  const body = cut > 0 ? sql.slice(0, sql.lastIndexOf("select", cut)) : sql;

  [["tl_transactions", "t"], ["tl_purchases", "p"],
   ["user_items", "ui"], ["item_usage_logs", "l"]].forEach(function (pair) {
    const have = tableColumns(pair[0]);
    const used = new Set([...body.matchAll(new RegExp("\\b" + pair[1] + "\\.(\\w+)", "g"))].map((m) => m[1]));
    const missing = [...used].filter((c) => !have.has(c));
    ok(pair[0] + " 컬럼이 전부 실재한다", missing.length === 0, missing.join(", "));
  });
}

/* ---------- 회원탈퇴가 안전한가 ---------- */
{
  ok("탈퇴 함수가 있다", /function public\.delete_my_account/.test(sql));
  ok("로그인한 본인만 지운다", /uid uuid := auth\.uid\(\)/.test(sql) && /delete from auth\.users where id = uid/.test(sql));
  ok("관리자는 실수로 못 지운다", /admin_cannot_delete/.test(sql));
  ok("닉네임을 직접 입력해야 진행된다", /prompt\(/.test(js) && /닉네임이 일치하지 않습니다/.test(js));
  ok("무엇이 지워지는지 미리 알린다", /되돌릴 수 없습니다/.test(js) && /상품권도 확인할 수 없게/.test(js));
  ok("화면에도 경고를 적어뒀다", /회원탈퇴 시 거래 기록[\s\S]{0,80}되돌릴 수 없습니다/.test(html));
  ok("탈퇴 후 로컬 데이터도 정리한다", /Storage\.clear\("trading"\)/.test(js));
}

/* ---------- 기존 것을 건드리지 않는가 ---------- */
{
  const mypage = fs.readFileSync(path.join(REPO, "js", "mypage.js"), "utf8");
  ok("js/mypage.js 는 그대로", !/MypageHistory/.test(mypage));
  ok("로그아웃은 기존 버튼을 재사용한다", /user-panel-logout/.test(js));
  ok("테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(sql));
  ok("없는 테이블에서도 안 터진다", /to_regclass\('public\.user_items'\)/.test(sql));
}

/* ---------- 표시 ---------- */
{
  ok("사용은 빨강, 지급은 초록", /mh-minus/.test(js) && /mh-plus/.test(js));
  ok("글자를 그대로 넣지 않는다(escape)", /function esc\(/.test(js) && /replace\(\/</.test(js));
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  ok("좁은 화면에서 표가 안 깨진다", /@media \(max-width:640px\)\{[\s\S]{0,200}\.mh-table\{min-width/.test(css));
  ok("탈퇴 버튼은 위험 색", /\.mh-btn-danger\{border-color:var\(--red\)/.test(css));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
