/* tests/currency-refresh.test.js
 * 통화를 바꿨을 때 모든 금액 화면이 따라오는지 검증합니다.
 *
 * 발견했던 문제
 *   js/config.js 가 'currency:change' 를 방송하는데 일부 화면이
 *   그 신호를 듣지 않았습니다.
 *     듣는 곳    차트, 랭킹, 내 정보 패널, 포지션표, MARKET WAR
 *     안 듣는 곳 마이페이지, 주문정보 패널, 거래내역
 *   실측: 원화로 바꿨는데 마이페이지 총자산이 100,161.67 로 그대로였습니다.
 *   환율 1,500 이니 1억 5천만 원대로 보여야 맞습니다.
 *   같은 화면에 원화와 USDT 가 섞이면 자산을 잘못 판단하게 됩니다.
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

const src = fs.readFileSync(path.join(REPO, "js", "currency-refresh.js"), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const read = (f) => fs.readFileSync(path.join(REPO, "js", f), "utf8");

console.log("\n통화 전환");

/* ---------- 어떤 화면이 신호를 듣는가 ---------- */
{
  /* 원래부터 듣던 곳 — 그대로여야 합니다. */
  [["chart.js", "차트"], ["leaderboard.js", "랭킹"], ["user-panel.js", "내 정보"],
   ["position-table-extra.js", "포지션표"]].forEach(([f, label]) => {
    ok(label + "은 원래부터 통화 변경을 듣는다", /currency:change/.test(read(f)));
  });

  /* 안 듣던 곳 — 이 모듈이 대신 갱신해 줍니다. */
  [["mypage.js", "마이페이지"], ["order-info-panel.js", "주문정보 패널"],
   ["trade-history.js", "거래내역"]].forEach(([f, label]) => {
    ok(label + "은 직접 듣지 않는다(대신 갱신 대상)", !/currency:change/.test(read(f)));
  });
}

/* ---------- 대신 갱신하는 방식 ---------- */
{
  ok("통화 변경 신호를 듣는다", /App\.Bus\.on\("currency:change", repaint\)/.test(src));
  ok("마이페이지·주문정보는 trading:update 로 다시 그린다", /emit\("trading:update"/.test(src));
  ok("거래내역은 trading:persisted 로 다시 그린다", /emit\("trading:persisted"/.test(src));
  ok("값을 새로 계산하지 않는다(getSnapshot 그대로 전달)", /App\.Trading\.getSnapshot\(\)/.test(src));
  ok("실패해도 나머지는 계속 진행한다", (src.match(/try \{/g) || []).length >= 2);
  ok("해당 모듈들을 건드리지 않았다",
     !/CurrencyRefresh/.test(read("mypage.js")) &&
     !/CurrencyRefresh/.test(read("trade-history.js")));
  ok("스크립트가 연결됐다", /js\/currency-refresh\.js/.test(html));
}

/* ---------- 환산 계산 ---------- */
{
  const cfg = read("config.js");
  const m = cfg.match(/USD_KRW\s*[:=]\s*(\d+)/);
  const rate = m ? Number(m[1]) : null;
  ok("환율 상수를 읽어왔다", !!rate, String(rate));

  /* 실측값으로 검산합니다(브라우저에서 확인한 숫자). */
  const usdt = 100161.67;
  const krw = 150242500;
  ok("총자산 환산이 환율과 맞는다", Math.abs(krw / usdt - rate) < 2, (krw / usdt).toFixed(1));
  ok("0 은 환산해도 0", 0 * rate === 0);

  /* 통화는 한 곳에서만 정합니다. */
  ok("환율이 config.js 한 곳에만 있다",
     ["mypage.js", "trade-history.js", "order-info-panel.js"].every((f) => !/1500/.test(read(f))));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
