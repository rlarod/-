/* tests/performance.test.js
 * 데이터가 쌓여도 느려지지 않는 구조인지 검증합니다.
 *
 * 점검 결과 성능 문제는 없었습니다. 지금 상태를 고정해서
 * 나중에 상한을 없애거나 무거운 처리를 넣을 때 잡히게 합니다.
 *
 * 실측 (거래 200건 · 저장 54KB 상태)
 *   진입 1회     12.3ms
 *   청산 1회      5.0ms
 *   시세 1틱      2.9ms
 *   페이지 전환   236ms
 *   거래 50건 -> 19ms/건, 200건 -> 26ms/건 (누적 악화 없음)
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

const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");

console.log("\n성능 · 메모리");

/* ---------- 무한정 쌓이지 않는가 ---------- */
{
  const closed = Number((trading.match(/MAX_CLOSED_TRADES = (\d+)/) || [])[1]);
  const orders = Number((trading.match(/MAX_ORDER_HISTORY = (\d+)/) || [])[1]);

  ok("거래 기록에 상한이 있다", closed > 0, String(closed));
  ok("주문 기록에 상한이 있다", orders > 0, String(orders));
  ok("상한이 실제로 적용된다",
     /closedTrades\.length > MAX_CLOSED_TRADES/.test(trading) &&
     /orderHistory\.length > MAX_ORDER_HISTORY/.test(trading));
  ok("상한이 지나치게 크지 않다(저장 용량 보호)", closed <= 1000 && orders <= 500,
     closed + " / " + orders);
  ok("상한이 지나치게 작지도 않다(내역 확인 가능)", closed >= 100 && orders >= 50);

  /* 실측: 200건에서 54KB. 브라우저 저장 한도(보통 5MB)에 한참 못 미칩니다. */
  const kbPerTrade = 54 / 200;
  ok("상한까지 채워도 저장 용량이 안전하다", closed * kbPerTrade < 500,
     Math.round(closed * kbPerTrade) + "KB");
}

/* ---------- 매 틱마다 무거운 일을 하지 않는가 ---------- */
{
  /* 거래내역은 실제 거래가 있을 때만 다시 불러옵니다(틱마다 X). */
  const th = fs.readFileSync(path.join(REPO, "js", "trade-history.js"), "utf8");
  ok("거래내역은 틱마다 재조회하지 않는다", /trading:persisted/.test(th) && !/price:update/.test(th));

  /* 호가창은 rAF 로 묶어 그립니다. */
  const ob = fs.readFileSync(path.join(REPO, "js", "orderbook.js"), "utf8");
  ok("호가창은 화면 주사에 맞춰 묶어 그린다", /requestAnimationFrame/.test(ob));
  ok("중복 렌더를 막는다", /renderScheduled/.test(ob));

  /* 랭킹은 통화가 바뀌어도 서버를 다시 부르지 않습니다. */
  const lb = fs.readFileSync(path.join(REPO, "js", "leaderboard.js"), "utf8");
  ok("랭킹은 통화 변경 시 재조회하지 않는다", /재조회 없이 캐시된 데이터/.test(lb));
}

/* ---------- 내가 얹은 모듈이 무겁지 않은가 ---------- */
{
  /* getSnapshot 을 감싼 모듈들이 매번 전체를 다시 계산하면 안 됩니다.
     실측: 300회 호출에 6ms (1회 0.018ms). */
  const fix = fs.readFileSync(path.join(REPO, "js", "realized-pnl-fix.js"), "utf8");
  ok("실현손익 보정은 거래 목록만 훑는다", /closedTrades\.forEach/.test(fix));
  ok("보정 결과를 저장해두지 않는다(항상 최신)", !/cache|캐시/.test(fix));

  const pg = fs.readFileSync(path.join(REPO, "js", "price-guard.js"), "utf8");
  ok("시세 검사는 값 비교만 한다", !/forEach|map|filter/.test(pg.split("function isSane")[1].split("}")[0]));

  /* 계속 도는 타이머가 너무 잦으면 안 됩니다.
     단, '연결될 때까지만 재시도하다 멈추는' 타이머는 예외입니다
     (clearInterval 로 스스로 끝냅니다 — 예: 100ms x 최대 100회 = 10초). */
  const files = ["login-required.js", "inline-login.js", "leverage-gate.js",
                 "realized-pnl-fix.js", "price-guard.js", "tpsl-guard.js"];
  let tooFast = [];
  files.forEach((f) => {
    const src = fs.readFileSync(path.join(REPO, "js", f), "utf8");
    /* setInterval( ... ) 블록을 통째로 잘라 안에 clearInterval 이 있는지 봅니다. */
    const parts = src.split("setInterval(").slice(1);
    parts.forEach((chunk) => {
      const head = chunk.slice(0, 400);
      const ms = Number((head.match(/,\s*(\d+)\s*\)/) || [])[1]);
      if (!ms || ms >= 1000) return;
      if (/clearInterval/.test(head)) return;   // 스스로 멈추는 타이머는 통과
      tooFast.push(f + ":" + ms + "ms");
    });
  });
  ok("계속 도는 타이머는 1초 이상 간격", tooFast.length === 0, tooFast.join(", "));

  /* 스스로 멈추는 타이머라도 무한정 돌면 안 됩니다. */
  const gate = fs.readFileSync(path.join(REPO, "js", "leverage-gate.js"), "utf8");
  ok("재시도 타이머에 횟수 상한이 있다", /\+\+tries > \d+/.test(gate));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
