/* tests/price-guard.test.js
 * 이상한 시세가 거래 계산으로 들어가지 않는지 검증합니다.
 *
 * 발견했던 문제
 *   price:update 값이 검사 없이 trading.js 로 들어갔습니다.
 *     NaN  -> 미실현손익 NaN, 평가자산 NaN (화면 숫자가 전부 깨짐)
 *     음수 -> 청산가 아래로 판정되어 포지션이 강제청산됨
 *             (실제로 잃지 않은 돈이 사라짐)
 *   거래소 연결이 끊기거나 서버가 순간 이상한 값을 보낼 때 발생합니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

function boot() {
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0, clearInterval: () => {},
    document: { readyState: "complete", addEventListener() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "price-guard.js"), "utf8"), sandbox);
  return sandbox.App.PriceGuard;
}

console.log("\n시세 검사");

/* ---------- 정상 시세는 통과 ---------- */
{
  const G = boot();
  ok("첫 정상 시세 통과", G.check({ symbol: "BTCUSDT", price: 60000 }));
  ok("소폭 상승 통과", G.check({ symbol: "BTCUSDT", price: 61000 }));
  ok("소폭 하락 통과", G.check({ symbol: "BTCUSDT", price: 55000 }));
  ok("2배 상승도 통과(실제로 있을 수 있음)", G.check({ symbol: "BTCUSDT", price: 110000 }));
  ok("정상 시세는 하나도 안 버렸다", G.getDroppedCount() === 0, String(G.getDroppedCount()));
}

/* ---------- 잘못된 값은 차단 ---------- */
{
  const G = boot();
  G.check({ symbol: "BTCUSDT", price: 60000 });
  ok("0 차단", !G.check({ symbol: "BTCUSDT", price: 0 }));
  ok("음수 차단", !G.check({ symbol: "BTCUSDT", price: -100 }));
  ok("NaN 차단", !G.check({ symbol: "BTCUSDT", price: NaN }));
  ok("null 차단", !G.check({ symbol: "BTCUSDT", price: null }));
  ok("undefined 차단", !G.check({ symbol: "BTCUSDT", price: undefined }));
  ok("문자 차단", !G.check({ symbol: "BTCUSDT", price: "abc" }));
  ok("Infinity 차단", !G.check({ symbol: "BTCUSDT", price: Infinity }));
  ok("빈 값 차단", !G.check(null) && !G.check(undefined) && !G.check("x"));
  ok("마지막 정상가는 그대로 유지", G.getLastGood("BTCUSDT") === 60000);
}

/* ---------- 말도 안 되는 급등락 차단 ---------- */
{
  const G = boot();
  G.check({ symbol: "BTCUSDT", price: 60000 });
  ok("1000배 급등 차단", !G.check({ symbol: "BTCUSDT", price: 60000000 }));
  ok("1원으로 폭락 차단", !G.check({ symbol: "BTCUSDT", price: 1 }));
  ok("허용 배수 안쪽은 통과", G.check({ symbol: "BTCUSDT", price: 60000 * (G.MAX_JUMP - 1) }));
}

/* ---------- 종목별로 따로 판단 ---------- */
{
  const G = boot();
  G.check({ symbol: "BTCUSDT", price: 60000 });
  ok("다른 종목의 첫 시세는 급등으로 보지 않는다", G.check({ symbol: "ETHUSDT", price: 3000 }));
  ok("종목별 마지막 값을 따로 기억한다",
     G.getLastGood("BTCUSDT") === 60000 && G.getLastGood("ETHUSDT") === 3000);
}

/* ---------- 차단 후 회복 ---------- */
{
  const G = boot();
  G.check({ symbol: "BTCUSDT", price: 60000 });
  G.check({ symbol: "BTCUSDT", price: NaN });
  ok("이상값 뒤에도 정상 시세는 다시 통과", G.check({ symbol: "BTCUSDT", price: 61000 }));
  ok("버린 개수를 센다", G.getDroppedCount() === 1, String(G.getDroppedCount()));
}

/* ---------- 연결 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "price-guard.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const tags = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);

  ok("trading.js 보다 먼저 실린다", at("js/price-guard.js") >= 0 && at("js/price-guard.js") < at("js/trading.js"));
  ok("이벤트를 감싼다", /App\.Bus\.emit = function/.test(src));
  ok("price:update 만 검사한다", /name === "price:update"/.test(src));
  ok("두 번 감싸지 않는다", /App\.Bus\.__priceGuarded/.test(src));
  ok("버린 값을 콘솔에 남긴다", /이상한 시세를 버렸습니다/.test(src));

  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
  ok("trading.js 는 건드리지 않았다", !/PriceGuard/.test(trading));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
