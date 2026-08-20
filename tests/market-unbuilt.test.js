/* tests/market-unbuilt.test.js
 * TL 마켓에서 "돈만 받고 아무 일도 안 일어나는" 상품이 팔리지 않게 합니다.
 *
 * 배경 (2026-08-20)
 *   마켓에 상품 6개가 등록돼 있는데 실제로 효과가 있는 건 하나뿐이었습니다.
 *   나머지를 열어두면 손님이 TL 을 내고 아무 일도 일어나지 않습니다.
 *
 * 이 테스트는 "효과를 구현한 코드가 있는지" 를 직접 확인합니다.
 * 나중에 기능을 만들면 이 테스트가 알아서 통과하고, 그때 판매를 켜면 됩니다.
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

const PAUSE = fs.readFileSync(path.join(REPO, "supabase", "schema-market-pause-unbuilt.sql"), "utf8");
const MARKET = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-market.sql"), "utf8");
const UI = fs.readFileSync(path.join(REPO, "js", "tl-market.js"), "utf8");

/* js 폴더 전체에서 그 효과를 실제로 쓰는 코드가 있는지 봅니다.
   상품을 정의만 해두고 쓰는 곳이 없으면 '효과 없음' 입니다. */
function 구현됐나(itemType) {
  const dir = path.join(REPO, "js");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .some((f) => fs.readFileSync(path.join(dir, f), "utf8").includes(itemType));
}

console.log("\nTL 마켓 — 효과 없는 상품");

/* ---------- 어떤 효과가 실제로 있는가 ---------- */
{
  ok("레버리지 이용권은 실제로 동작한다", 구현됐나("leverage_boost"),
    "js/leverage-gate.js 가 상한을 올려줍니다");

  ["position_peek", "account_reset", "seed_recharge", "fee_discount", "liquidation_guard"]
    .forEach((t) => {
      /* 구현되면 이 검사가 실패합니다 — 그때 판매를 켜면 됩니다.
         '아직 안 만들었다' 는 사실을 코드로 붙잡아 둡니다. */
      ok(t + " 는 아직 효과가 없다(그래서 판매 중지)", !구현됐나(t),
        "구현했다면 이 테스트를 지우고 판매를 켜세요");
    });
}

/* ---------- 판매 중지 ---------- */
{
  ["position_peek", "account_reset", "seed_recharge", "fee_discount", "liquidation_guard"]
    .forEach((t) => {
      ok(t + " 를 판매 중지 목록에 넣었다", new RegExp("'" + t + "'").test(PAUSE));
    });
  ok("판매만 멈추고 상품을 지우지 않는다",
    /set status = 'paused'/.test(PAUSE) && !/delete from public\.tl_market_products/.test(PAUSE),
    "나중에 기능을 만들면 되살려야 합니다");
  ok("되는 상품은 판매를 유지한다",
    /set status = 'active'[\s\S]{0,80}item_type = 'leverage_boost'/.test(PAUSE));
  /* 주석에는 표 이름이 나올 수 있으므로, 실제로 고치는 문장만 봅니다. */
  const 실행문 = PAUSE.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  ok("이미 산 사람의 기록은 건드리지 않는다",
    !/tl_purchases|tl_transactions/.test(실행문),
    "구매 기록과 쓴 TL 은 그대로 둡니다");
  ok("고치는 표는 상품 표 하나뿐",
    (실행문.match(/update public\.(\w+)/g) || []).every((m) => /tl_market_products/.test(m)));
}

/* ---------- 실제로 못 사게 되는가 ---------- */
{
  /* 화면에서 버튼만 막으면 우회할 수 있으므로 서버도 막아야 합니다. */
  ok("서버가 판매중이 아닌 상품을 거절한다",
    /if prod\.status <> 'active' then raise exception 'not_on_sale'/.test(MARKET));
  ok("화면도 판매 중지를 표시한다",
    /st === "paused"[\s\S]{0,80}buyable: false/.test(UI));
  ok("판매 중지 상품은 '판매 준비중' 으로 보인다", /판매 준비중/.test(UI));
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
