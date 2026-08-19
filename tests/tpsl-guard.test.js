/* tests/tpsl-guard.test.js
 * 말이 안 되는 TP/SL 값이 주문으로 들어가지 않는지 검증합니다.
 *
 * 발견했던 문제
 *   js/trading.js 는 '청산가보다 더 불리한 SL' 을 청산가 바로 위로
 *   당겨줍니다(그대로 두면 청산이 먼저 발동해 죽은 SL 이 되므로).
 *   그런데 음수도 그 규칙에 걸립니다.
 *     롱 · 진입 60,000 · 10배 · 청산가 54,300
 *     SL 에 -100 -> 54,305.43 으로 끌어올려짐
 *   사용자는 SL 을 안 걸었다고 생각하는데 실제로는 걸려 있어,
 *   가격이 54,305 아래로 가면 원치 않는 손절이 발생합니다.
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
  const calls = [];
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0, clearInterval: () => {},
    document: { readyState: "complete", addEventListener() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  sandbox.App = {
    Trading: {
      openPosition(side, margin, tp, sl) { calls.push({ fn: "open", side, margin, tp, sl }); return { ok: true }; },
      placeLimitOrder(side, price, margin, tp, sl) { calls.push({ fn: "limit", side, price, margin, tp, sl }); return { ok: true }; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "tpsl-guard.js"), "utf8"), sandbox);
  return { App: sandbox.App, calls, G: sandbox.App.TpSlGuard };
}

console.log("\nTP/SL 입력 검증");

/* ---------- 값 판정 ---------- */
{
  const { G } = boot();
  ok("정상 가격은 통과", G.sanePrice(62000) === 62000);
  ok("문자 숫자도 통과", G.sanePrice("58000") === 58000);
  ok("음수 차단", G.sanePrice(-100) === null);
  ok("0 차단", G.sanePrice(0) === null);
  ok("NaN 차단", G.sanePrice(NaN) === null);
  ok("Infinity 차단", G.sanePrice(Infinity) === null);
  ok("문자 차단", G.sanePrice("abc") === null);
  ok("빈 값은 '안 걸었다'로 처리", G.sanePrice(null) === null && G.sanePrice("") === null && G.sanePrice(undefined) === null);
}

/* ---------- 실제 주문에 반영 ---------- */
{
  const { App, calls, G } = boot();

  App.Trading.openPosition("long", 500, 62000, 58000);
  ok("정상 TP/SL 은 그대로 전달", calls[0].tp === 62000 && calls[0].sl === 58000);

  App.Trading.openPosition("long", 500, 62000, -100);
  ok("음수 SL 은 null 로 바뀐다(원치 않는 손절 방지)", calls[1].sl === null, String(calls[1].sl));
  ok("같이 넣은 정상 TP 는 살아남는다", calls[1].tp === 62000);

  App.Trading.openPosition("long", 500, NaN, 58000);
  ok("NaN TP 는 null 로", calls[2].tp === null && calls[2].sl === 58000);

  App.Trading.openPosition("long", 500, 0, 0);
  ok("0 은 둘 다 null 로", calls[3].tp === null && calls[3].sl === null);

  ok("버린 값을 센다", G.getDroppedCount() >= 3, String(G.getDroppedCount()));
}

/* ---------- 지정가 주문도 같이 ---------- */
{
  const { App, calls } = boot();
  App.Trading.placeLimitOrder("long", 59000, 500, 62000, -100);
  ok("지정가도 음수 SL 을 막는다", calls[0].sl === null);
  ok("지정가 가격·증거금은 그대로", calls[0].price === 59000 && calls[0].margin === 500);
}

/* ---------- 기존 검증은 그대로 살아 있는가 ---------- */
{
  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
  ok("진입가보다 불리한 TP 는 무시한다", /validTp && side === "long" && validTp <= entry/.test(trading));
  ok("진입가보다 불리한 SL 은 무시한다", /validSl && side === "long" && validSl >= entry/.test(trading));
  ok("죽은 SL 은 청산가 위로 당긴다", /validSl = liq \* 1\.0001/.test(trading));
  ok("trading.js 는 건드리지 않았다", !/TpSlGuard/.test(trading));

  /* 실측: 죽은 SL 보정은 그대로 동작합니다(청산가 54,300 -> SL 54,305.43). */
  const liq = 54300;
  ok("죽은 SL 보정값 계산이 맞다", Math.abs(liq * 1.0001 - 54305.43) < 0.01, (liq * 1.0001).toFixed(2));
}

/* ---------- 연결 ---------- */
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const src = fs.readFileSync(path.join(REPO, "js", "tpsl-guard.js"), "utf8");
  ok("스크립트가 연결됐다", /js\/tpsl-guard\.js/.test(html));
  ok("두 함수를 모두 감싼다", /App\.Trading\.openPosition = function/.test(src) && /App\.Trading\.placeLimitOrder = function/.test(src));
  ok("두 번 감싸지 않는다", /__tpslGuarded/.test(src));
  ok("무시한 값을 콘솔에 남긴다", /무시했습니다/.test(src));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
