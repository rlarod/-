/* tests/account-isolation.test.js
 * 계정이 바뀌었을 때 앞사람 거래 데이터가 남지 않는지 검증합니다.
 *
 * 배경
 *   js/auth.js 는 로그인 시 서버 데이터로 localStorage 를 덮어씁니다.
 *   그런데 그 복원이 실패하면 catch 에서 경고만 남기고 넘어가서
 *   앞서 쓰던 데이터가 그대로 남습니다.
 *     A 로그인 -> 거래 -> 세션 만료 -> B 로그인 -> B 복원 실패
 *     -> B 가 A 의 잔고와 거래내역을 보게 됩니다.
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

/* 간단한 저장소를 만들어 실제 모듈을 돌립니다. */
function boot() {
  const store = {};
  const sandbox = {
    console: { warn() {}, log() {} },
    setTimeout: () => 0,
    document: { readyState: "complete", addEventListener() {} },
  };
  sandbox.window = sandbox;
  sandbox.App = {
    Storage: {
      save(k, v) { store[k] = JSON.parse(JSON.stringify(v)); },
      load(k) { return store[k] ? JSON.parse(JSON.stringify(store[k])) : null; },
      clear(k) { delete store[k]; },
    },
    Auth: { getNickname: () => null },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "account-isolation.js"), "utf8"), sandbox);
  return { sb: sandbox, store, AI: sandbox.App.AccountIsolation };
}

const tradeData = { closedTrades: [{ pnl: 100 }], position: null, balance: 100100 };

console.log("\n계정 분리");

/* ---------- 다른 사람으로 바뀌면 지운다 ---------- */
{
  const { sb, store, AI } = boot();
  sb.App.Auth.getNickname = () => "사용자A";
  store.trading = tradeData;
  AI.check();
  ok("주인이 기록된다", AI.readOwner() === "사용자A", String(AI.readOwner()));

  sb.App.Auth.getNickname = () => "사용자B";
  const verdict = AI.check();
  ok("계정이 바뀌면 정리한다", verdict === "다른사람 정리", verdict);
  ok("앞사람 거래 데이터가 사라진다", !store.trading);
  ok("새 주인으로 갱신된다", AI.readOwner() === "사용자B");
}

/* ---------- 같은 사람이면 지우지 않는다 ---------- */
{
  const { sb, store, AI } = boot();
  sb.App.Auth.getNickname = () => "사용자A";
  store.trading = tradeData;
  AI.check();
  const before = JSON.stringify(store.trading);
  const verdict = AI.check();
  ok("같은 사람은 그대로 둔다", verdict === "같은 사람", verdict);
  ok("데이터가 보존된다", JSON.stringify(store.trading) === before);
}

/* ---------- 비회원은 판단하지 않는다 ---------- */
{
  const { sb, store, AI } = boot();
  store.trading = tradeData;
  sb.App.Auth.getNickname = () => null;
  const verdict = AI.check();
  ok("비회원 상태에서는 손대지 않는다", verdict === "로그인 전", verdict);
  ok("비회원일 때 데이터를 지우지 않는다", !!store.trading);
}

/* ---------- 주인 표시가 없는 예전 데이터 ---------- */
{
  const { sb, store, AI } = boot();
  store.trading = tradeData;             // 주인 표시 없음
  sb.App.Auth.getNickname = () => "사용자C";
  const verdict = AI.check();
  ok("주인을 알 수 없는 거래 데이터는 정리한다", verdict === "주인불명 정리", verdict);
  ok("정리 후 현재 사람이 주인이 된다", AI.readOwner() === "사용자C");
}

/* ---------- 빈 데이터는 지울 필요가 없다 ---------- */
{
  const { sb, store, AI } = boot();
  store.trading = { closedTrades: [], position: null, pendingOrder: null };
  sb.App.Auth.getNickname = () => "사용자D";
  const verdict = AI.check();
  ok("거래 흔적이 없으면 주인만 적는다", verdict === "주인 표시", verdict);
  ok("빈 데이터는 그대로 둔다", !!store.trading);
}

/* ---------- 연결·안전 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "account-isolation.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const auth = fs.readFileSync(path.join(REPO, "js", "auth.js"), "utf8");

  ok("스크립트가 연결됐다", /js\/account-isolation\.js/.test(html));
  ok("닉네임만 저장한다(개인정보 저장 안 함)", !/password|phone|email|token/i.test(src));
  ok("거래 데이터만 지운다", /clear\(DATA_KEY\)/.test(src) && !/clear\("theme"\)|clear\("settings"\)/.test(src));
  ok("auth.js 는 건드리지 않았다", /Storage\.clear\("trading"\)/.test(auth));

  /* 로그아웃 시 원래 정리가 되는지도 함께 확인합니다. */
  ok("로그아웃할 때 거래 데이터를 지운다(기존 동작)", /async function logout[\s\S]{0,400}Storage\.clear\("trading"\)/.test(auth));
  ok("옛 익명 세션도 정리한다(기존 동작)", /is_anonymous[\s\S]{0,400}Storage\.clear\("trading"\)/.test(auth));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
