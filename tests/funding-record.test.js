/* tests/funding-record.test.js
 * 펀딩비 기록이 '실제로 낸 금액'과 맞는지 검증합니다.
 *
 * 발견했던 문제
 *   js/trading.js 는 잔고가 모자라면 0 에서 멈추는데
 *     state.balance = Math.max(0, state.balance + fundingFee);
 *   기록에는 전액을 낸 것처럼 남깁니다.
 *   실측(잔고 1.49 · 명목가 995,010 · 펀딩율 1%)
 *     발생 -9,950.10 / 실제 -1.49 / 기록 -9,950.10
 *   누적 펀딩비가 실제 낸 돈보다 커집니다.
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

function boot() {
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0, clearInterval: () => {},
    document: { readyState: "complete", addEventListener() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "funding-record-fix.js"), "utf8"), sandbox);
  return sandbox.App.FundingRecordFix;
}

console.log("\n펀딩비 기록");

/* ---------- 잔고가 모자란 경우 ---------- */
{
  const F = boot();
  /* 첫 갱신으로 직전 잔고를 알려줍니다. */
  F.reconcile({ balance: 1.49, fundingHistory: [] });
  /* 정산 후: 잔고 0, 기록은 -9950.10 */
  const snap = { balance: 0, fundingHistory: [{ fundingFee: -9950.1, fundingTime: 1 }] };
  F.reconcile(snap);

  const f = snap.fundingHistory[0];
  ok("기록을 실제 낸 금액으로 맞춘다", Math.abs(f.fundingFee + 1.49) < 0.01, String(f.fundingFee));
  ok("못 낸 금액을 따로 남긴다", Math.abs(f.unpaidFee - 9948.61) < 0.01, String(f.unpaidFee));
  ok("못 낸 금액 합계를 낼 수 있다", Math.abs(F.totalUnpaid(snap) - 9948.61) < 0.01);
}

/* ---------- 정상 상황은 건드리지 않는다 ---------- */
{
  const F = boot();
  F.reconcile({ balance: 1000, fundingHistory: [] });
  const snap = { balance: 999, fundingHistory: [{ fundingFee: -1, fundingTime: 1 }] };
  F.reconcile(snap);
  const f = snap.fundingHistory[0];
  ok("전액 냈으면 기록 그대로", f.fundingFee === -1, String(f.fundingFee));
  ok("못 낸 금액 표시가 없다", f.unpaidFee === undefined);
  ok("못 낸 합계는 0", F.totalUnpaid(snap) === 0);
}

/* ---------- 펀딩 수령(양수)은 손대지 않는다 ---------- */
{
  const F = boot();
  F.reconcile({ balance: 1000, fundingHistory: [] });
  const snap = { balance: 1001, fundingHistory: [{ fundingFee: 1, fundingTime: 1 }] };
  F.reconcile(snap);
  ok("수령 기록은 그대로", snap.fundingHistory[0].fundingFee === 1);
  ok("수령에는 못 낸 금액이 없다", snap.fundingHistory[0].unpaidFee === undefined);
}

/* ---------- 같은 기록을 두 번 손대지 않는다 ---------- */
{
  const F = boot();
  F.reconcile({ balance: 1.49, fundingHistory: [] });
  const snap = { balance: 0, fundingHistory: [{ fundingFee: -9950.1, fundingTime: 1 }] };
  F.reconcile(snap);
  const once = snap.fundingHistory[0].fundingFee;
  F.reconcile(snap);
  F.reconcile(snap);
  ok("여러 번 불러도 값이 변하지 않는다", snap.fundingHistory[0].fundingFee === once, String(snap.fundingHistory[0].fundingFee));
}

/* ---------- 이상한 입력 ---------- */
{
  const F = boot();
  ok("펀딩 기록이 없어도 안 터진다", F.reconcile({ balance: 100, fundingHistory: [] }).balance === 100);
  ok("스냅샷이 없어도 안 터진다", F.reconcile(null) === null && F.reconcile(undefined) === undefined);
  ok("fundingHistory 가 배열이 아니어도 안 터진다", F.reconcile({ balance: 1, fundingHistory: "x" }).balance === 1);
  ok("못 낸 합계 계산도 안전하다", F.totalUnpaid({ fundingHistory: null }) === 0);
}

/* ---------- 연결·범위 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "funding-record-fix.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");

  ok("스크립트가 연결됐다", /js\/funding-record-fix\.js/.test(html));
  ok("이벤트를 감싼다", /App\.Bus\.emit = function/.test(src));
  ok("두 번 감싸지 않는다", /App\.Bus\.__fundingRecordFixed/.test(src));
  ok("trading.js 는 건드리지 않았다", /Math\.max\(0, state\.balance \+ fundingFee\)/.test(trading));
  ok("증거금은 손대지 않는다(청산 로직 보호)", !/margin\s*[-+]=/.test(src));
  ok("남은 한계를 주석에 적어뒀다", /운영 판단 필요/.test(src));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
