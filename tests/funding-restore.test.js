/* tests/funding-restore.test.js
 * 새로고침할 때마다 펀딩비가 다시 지급되지 않는지 검증합니다.
 *
 * 발견했던 문제
 *   js/auth.js 는 로그인 시 서버 데이터로 로컬을 채우면서
 *     lastSettledFundingTime: null
 *     fundingHistory: []
 *   로 비워버립니다.
 *   lastSettledFundingTime 은 '펀딩비를 어디까지 정산했는지' 표시라,
 *   비면 trading.js 가 '아직 정산 안 했다' 고 보고 다시 정산합니다.
 *   그래서 포지션을 들고 새로고침할 때마다 펀딩비가 또 지급됐습니다.
 *   실측: 새로고침 1회당 잔고 약 50만원 증가.
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
  const store = {};
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0, clearInterval: () => {},
    document: { readyState: "complete", addEventListener() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  sandbox.App = {
    Storage: {
      save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
      load(k) { return store[k] ? JSON.parse(JSON.stringify(store[k])) : null; },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "funding-restore-guard.js"), "utf8"), sandbox);
  return { App: sandbox.App, store, G: sandbox.App.FundingRestoreGuard };
}

console.log("\n펀딩 정산 기록 보존");

/* ---------- 복원이 비워도 지킨다 ---------- */
{
  const { App, store, G } = boot();
  App.Storage.save("trading", {
    balance: 90000, lastSettledFundingTime: 1700000000000,
    fundingHistory: [{ fundingFee: -10 }],
  });
  /* auth.js 가 복원하며 비우는 상황 */
  App.Storage.save("trading", { balance: 88000, lastSettledFundingTime: null, fundingHistory: [] });

  ok("정산 시각을 지킨다(중복 지급 방지)", store.trading.lastSettledFundingTime === 1700000000000,
     String(store.trading.lastSettledFundingTime));
  ok("펀딩 기록도 지킨다", store.trading.fundingHistory.length === 1);
  ok("잔고는 새 값으로 갱신된다", store.trading.balance === 88000, String(store.trading.balance));
  ok("지킨 횟수를 센다", G.getKeptCount() === 1);
}

/* ---------- 진짜 새 정산은 반영한다 ---------- */
{
  const { App, store } = boot();
  App.Storage.save("trading", { lastSettledFundingTime: 1700000000000, fundingHistory: [{ fundingFee: -10 }] });
  App.Storage.save("trading", { lastSettledFundingTime: 1700000999999, fundingHistory: [{ fundingFee: -20 }] });
  ok("새 정산 시각으로 갱신된다", store.trading.lastSettledFundingTime === 1700000999999);
  ok("새 펀딩 기록으로 갱신된다", store.trading.fundingHistory[0].fundingFee === -20);
}

/* ---------- 처음 시작하는 사람 ---------- */
{
  const { App, store } = boot();
  App.Storage.save("trading", { balance: 100000, lastSettledFundingTime: null, fundingHistory: [] });
  ok("기존 값이 없으면 그대로 저장", store.trading.lastSettledFundingTime === null);
  ok("빈 기록도 그대로", store.trading.fundingHistory.length === 0);
}

/* ---------- 다른 키는 손대지 않는다 ---------- */
{
  const { App, store } = boot();
  App.Storage.save("theme", { value: "dark" });
  App.Storage.save("theme", { value: "light" });
  ok("거래 데이터가 아니면 그대로 덮어쓴다", store.theme.value === "light");
}

/* ---------- 이상한 입력 ---------- */
{
  const { G } = boot();
  ok("빈 값 판정", G.isEmpty(null) && G.isEmpty(undefined) && G.isEmpty([]));
  ok("있는 값 판정", !G.isEmpty(123) && !G.isEmpty([1]));
  ok("객체가 아니면 그대로 돌려준다", G.merge(null, {}) === null && G.merge("x", {}) === "x");
  ok("기존 값이 없어도 안 터진다", !!G.merge({ a: 1 }, null));
}

/* ---------- 연결 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "funding-restore-guard.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const auth = fs.readFileSync(path.join(REPO, "js", "auth.js"), "utf8");
  const tags = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);

  /* auth.js 가 복원하며 값을 비우므로, 그보다 먼저 실려서 감싸야 합니다.
     이 저장소에서는 storage.js 가 auth.js 보다 뒤에 실리므로,
     감쌀 대상이 아직 없을 수 있습니다 — 모듈이 재시도로 붙습니다. */
  ok("auth.js 보다 먼저 실린다", at("js/funding-restore-guard.js") < at("js/auth.js"),
     at("js/funding-restore-guard.js") + " vs " + at("js/auth.js"));
  ok("Storage 가 늦게 와도 재시도해서 붙는다", /setInterval\(function \(\) \{\s*\n\s*if \(wrap\(\) \|\| \+\+tries > 100\)/.test(src));
  ok("바로 한 번 시도한다", /\/\* Storage 는 아주 일찍 필요하므로 지금 바로 감쌉니다\. \*\/\s*\n\s*init\(\);/.test(src));
  ok("두 번 감싸지 않는다", /__fundingGuarded/.test(src));
  ok("auth.js 는 건드리지 않았다", /lastSettledFundingTime: null/.test(auth) && !/FundingRestoreGuard/.test(auth));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
