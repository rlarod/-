/* tests/realized-pnl.test.js
 * 실현손익이 '실제로 번 돈'과 일치하는지 검증합니다.
 *
 * 배경
 *   js/trading.js 는 청산 시 pnl = 총손익 - 청산수수료 만 기록하고,
 *   진입 수수료는 fee 에만 담습니다. getSnapshot().realizedPnl 은 pnl 만
 *   더하므로 진입 수수료가 빠져 실제보다 커 보였습니다.
 *   실측: 실제 156.58 / 화면 161.58 (진입수수료 5.00 차이)
 *   랭킹·계급 점수가 실현손익 기준이라 순위가 왜곡됩니다.
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

const sandbox = {
  console, setInterval: () => 0, clearInterval: () => {},
  document: { readyState: "complete", addEventListener() {} },
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "realized-pnl-fix.js"), "utf8"), sandbox);
const FIX = sandbox.App.RealizedPnlFix;

const TAKER = 0.0005;
const feeRate = { taker: TAKER, maker: 0.0002 };

/* trading.js 가 실제로 기록하는 모양 그대로 만듭니다. */
function trade(margin, lev, entry, exit, side) {
  const notional = margin * lev;
  const qty = notional / entry;
  const entryFee = notional * TAKER;
  const exitFee = qty * exit * TAKER;
  const gross = (side === "long" ? exit - entry : entry - exit) * qty;
  return { side, leverage: lev, entry, exit, qty, margin, pnl: gross - exitFee, fee: entryFee + exitFee };
}

console.log("\n실현손익 (진입 수수료 반영)");

/* ---------- 진입 수수료 되살리기 ---------- */
{
  const t = trade(1000, 10, 60000, 61000, "long");
  const got = FIX.entryFeeOf(t, feeRate);
  ok("진입 수수료를 정확히 되살린다", Math.abs(got - 5) < 0.001, got.toFixed(4));
  /* trading.js 는 forced 같은 플래그가 아니라 reason 문자열로 구분합니다
     (const isForced = reason === "강제청산").
     처음에 플래그로 찾다가 강제청산 실현손익이 -1000.47 로 기록됐습니다.
     실제 손실은 -1005(증거금 1,000 + 진입수수료 5)였습니다. */
  ok("강제청산은 reason 으로 판별한다", FIX.entryFeeOf({ reason: "강제청산", fee: 5 }, feeRate) === 5);
  ok("강제청산은 fee 전체가 진입 수수료", FIX.entryFeeOf({ forced: true, fee: 7.5 }, feeRate) === 7.5);
  {
    /* 강제청산 거래 한 건: 증거금 1,000 전액 손실 + 진입수수료 5 */
    const forced = { reason: "강제청산", qty: 10000 / 60000, entry: 60000, exit: 54300, margin: 1000, pnl: -1000, fee: 5 };
    const snap = { closedTrades: [forced], realizedPnl: -1000, feeRate };
    FIX.recompute(snap);
    ok("강제청산 실현손익 = -1005 (실제 손실과 일치)", Math.abs(snap.realizedPnl + 1005) < 0.01, snap.realizedPnl.toFixed(2));
  }
  ok("이상한 거래는 0 으로", FIX.entryFeeOf({}, feeRate) === 0 && FIX.entryFeeOf(null, feeRate) === 0);
}

/* ---------- 1회 거래 ---------- */
{
  const t = trade(1000, 10, 60000, 61000, "long");
  const snap = { closedTrades: [t], realizedPnl: t.pnl, feeRate };
  const before = snap.realizedPnl;
  FIX.recompute(snap);
  ok("보정 전 값이 실제보다 컸다", Math.abs(before - 161.58) < 0.02, before.toFixed(2));
  ok("보정 후 156.58", Math.abs(snap.realizedPnl - 156.58) < 0.02, snap.realizedPnl.toFixed(2));

  /* 실제로 번 돈 = 총손익 - 진입수수료 - 청산수수료 */
  const qty = 10000 / 60000;
  const real = (61000 - 60000) * qty - 10000 * TAKER - qty * 61000 * TAKER;
  ok("실제로 번 돈과 일치", Math.abs(snap.realizedPnl - real) < 0.01, real.toFixed(2));
}

/* ---------- 여러 거래 (수익 + 손실) ---------- */
{
  const ts = [
    trade(1000, 10, 60000, 61000, "long"),
    trade(500, 10, 61000, 62000, "short"),
    trade(800, 10, 62000, 63000, "long"),
  ];
  const snap = { closedTrades: ts, realizedPnl: ts.reduce((a, t) => a + t.pnl, 0), feeRate };
  FIX.recompute(snap);

  let real = 0;
  ts.forEach((t) => {
    const gross = (t.side === "long" ? t.exit - t.entry : t.entry - t.exit) * t.qty;
    real += gross - t.fee; // 진입+청산 수수료 모두 뺀 값
  });
  ok("3회 거래(수익·손실 섞임)도 실제와 일치", Math.abs(snap.realizedPnl - real) < 0.01,
     snap.realizedPnl.toFixed(2) + " vs " + real.toFixed(2));
  ok("손실 거래가 포함돼도 보정 방향이 맞다", snap.realizedPnl < ts.reduce((a, t) => a + t.pnl, 0));
}

/* ---------- 거래가 없을 때 ---------- */
{
  const snap = { closedTrades: [], realizedPnl: 0, feeRate };
  FIX.recompute(snap);
  ok("거래가 없으면 0 그대로", snap.realizedPnl === 0);
  ok("closedTrades 가 없어도 안 터진다", FIX.recompute({ realizedPnl: 5 }).realizedPnl === 5);
}

/* ---------- 두 번 보정하지 않는다 ---------- */
{
  const t = trade(1000, 10, 60000, 61000, "long");
  const snap = { closedTrades: [t], realizedPnl: t.pnl, feeRate };
  FIX.recompute(snap);
  const once = snap.realizedPnl;
  /* getSnapshot 은 매번 새 객체를 만들므로 같은 객체를 두 번 보정할 일은
     없지만, 혹시 그래도 값이 폭주하지 않는지 확인합니다. */
  FIX.recompute(snap);
  ok("같은 값을 두 번 빼면 그만큼만 줄어든다(폭주 없음)", Math.abs(once - snap.realizedPnl - 5) < 0.01);
}

/* ---------- 연결 확인 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "realized-pnl-fix.js"), "utf8");
  ok("getSnapshot 을 감싼다", /App\.Trading\.getSnapshot = function/.test(src));
  /* getSnapshot 만 감싸면 부족합니다. trading.js 는 자기 안에서
     getSnapshot() 을 불러 Bus 로 뿌리는데, 그 호출은 모듈 내부라
     밖에서 감싼 함수를 타지 않습니다.
     실측: 스냅샷 69.58 인데 마이페이지는 77.08 을 표시했습니다.
     trading:persisted 는 서버 저장(realized_pnl)으로 이어지고
     그 값이 랭킹 기준이라 순위까지 어긋납니다. */
  ok("이벤트도 감싼다", /App\.Bus\.emit = function/.test(src));
  ok("화면 갱신 이벤트를 보정한다", /"trading:update"/.test(src));
  ok("서버 저장 이벤트도 보정한다", /"trading:persisted"/.test(src));
  ok("이벤트를 두 번 감싸지 않는다", /App\.Bus\.__realizedPnlFixed/.test(src));
  ok("다른 이벤트는 건드리지 않는다", /FIXED_EVENTS\.indexOf\(name\) !== -1/.test(src));
  ok("두 번 감싸지 않는다", /__realizedPnlFixed/.test(src));
  ok("실패해도 원래 값을 돌려준다", /보정 실패 — 원래 값 사용/.test(src));

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const tags = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);
  ok("trading.js 다음에 실린다", at("js/realized-pnl-fix.js") > at("js/trading.js"));

  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
  ok("trading.js 는 건드리지 않았다", /realizedPnl \+= t\.pnl/.test(trading));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
