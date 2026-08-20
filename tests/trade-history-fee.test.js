/* tests/trade-history-fee.test.js
 * 거래내역의 손익이 수수료를 제대로 반영하는지.
 *
 * 무엇이 틀렸나 (2026-08-20 실측으로 발견)
 *   js/trading.js 는 청산할 때 이렇게 기록합니다.
 *       pnl = 총손익 - 청산수수료      (진입 수수료는 안 뺌)
 *       fee = 진입수수료 + 청산수수료   (왕복 전체)
 *   그래서 표에서 "손익 +587, 수수료 646" 처럼 서로 안 맞아 보였습니다.
 *
 *   실제 화면 3건 검산
 *       화면 +587      실제 +264      (수수료 646 의 절반만큼 차이)
 *       화면 +37,849   실제 +34,129
 *       화면 +54,977   실제 +39,334
 *
 *   지갑 잔고는 맞습니다 — 진입 수수료는 진입할 때 이미 빠집니다.
 *   표시만 이익이 커 보였습니다.
 *
 *   js/realized-pnl-fix.js 가 누적 실현손익은 이미 바로잡았는데 표는
 *   그대로여서, 표의 합계와 누적값이 서로 달랐습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "trade-history.js"), "utf8");

/* 표가 쓰는 것과 같은 계산을 여기서 다시 해봅니다. */
const TAKER = 0.0005;
function 진입수수료(t) {
  var fee = Number(t.fee);
  if (!isFinite(fee) || fee <= 0) return 0;
  if (t.close_reason === "강제청산") return 0;
  var 청산 = Number(t.quantity) * Number(t.exit_price) * TAKER;
  if (!isFinite(청산) || 청산 < 0) return 0;
  var 진입 = fee - 청산;
  return 진입 > 0 && 진입 < fee ? 진입 : 0;
}
const 실제손익 = (t) => Number(t.pnl) - 진입수수료(t);

/* 화면에 실제로 찍혔던 3건(원화 → USDT) */
const R = 1500;
function 거래(entry, exit, margin, pnl, fee, reason) {
  const m = margin / R, e = entry / R, x = exit / R;
  return {
    entry_price: e, exit_price: x, margin: m,
    pnl: pnl / R, fee: fee / R,
    quantity: (m * 100) / e, leverage: 100,
    close_reason: reason || "수동청산",
  };
}

console.log("\n거래내역 손익 표시");

/* ---------- 실제 3건 검산 ---------- */
{
  const 건1 = 거래(107258700, 107500500, 470362453, 82465610, 47089264);
  const 건2 = 거래(104096850, 104675850, 112213768, 56772838, 11252584);
  const 건3 = 거래(104229000, 104375850, 9687540, 879834, 969436);

  ok("1건 — 손익이 진입 수수료만큼 줄어든다",
    Math.abs(실제손익(건1) - 39298) < 5, Math.round(실제손익(건1)));
  ok("2건 — 같은 규칙", Math.abs(실제손익(건2) - 34108) < 5, Math.round(실제손익(건2)));
  ok("3건 — 같은 규칙", Math.abs(실제손익(건3) - 264) < 2, Math.round(실제손익(건3)));

  /* 손익 + 수수료 = 총손익(수수료 전) 이 맞아야 셈이 맞습니다. */
  [["1건", 건1], ["2건", 건2], ["3건", 건3]].forEach(([이름, t]) => {
    const 총손익 = (t.exit_price - t.entry_price) * t.quantity;
    ok(이름 + " — 손익 + 수수료 = 수수료 전 총손익",
      Math.abs(실제손익(t) + t.fee - 총손익) < 2,
      Math.round(실제손익(t) + t.fee) + " vs " + Math.round(총손익));
  });

  /* 고치기 전 값(t.pnl)은 수수료와 셈이 안 맞았습니다. */
  const 총손익1 = (건1.exit_price - 건1.entry_price) * 건1.quantity;
  ok("고치기 전에는 셈이 안 맞았다", Math.abs(건1.pnl + 건1.fee - 총손익1) > 100,
    "이게 문제였습니다");
}

/* ---------- 강제청산은 건드리지 않는다 ---------- */
{
  /* 강제청산은 증거금 전액 손실이고 fee 에 진입 수수료만 들어갑니다.
     여기서 또 빼면 이중으로 빠집니다. */
  const 강제 = 거래(100000 * R, 99000 * R, 1000 * R, -1000 * R, 50 * R, "강제청산");
  ok("강제청산은 손익을 그대로 둔다", 실제손익(강제) === 강제.pnl);
  ok("강제청산의 진입 수수료는 0으로 본다", 진입수수료(강제) === 0);
}

/* ---------- 이상한 값에 손대지 않는다 ---------- */
{
  ok("수수료가 없으면 그대로", 실제손익({ pnl: 100, fee: 0, quantity: 1, exit_price: 100 }) === 100);
  ok("수수료가 음수면 그대로", 실제손익({ pnl: 100, fee: -5, quantity: 1, exit_price: 100 }) === 100);
  /* 옛 기록이라 계산이 어긋나면 원래 값을 보여줍니다 —
     틀린 값으로 바꾸는 것보다 낫습니다. */
  ok("계산이 어긋나면 원래 값을 보여준다",
    실제손익({ pnl: 100, fee: 1, quantity: 1000, exit_price: 100 }) === 100,
    "청산수수료가 fee 보다 크면 손대지 않습니다");
}

/* ---------- 코드에 반영됐는지 ---------- */
{
  ok("표가 진입 수수료를 계산한다", /function 진입수수료/.test(SRC));
  ok("표가 보정된 손익을 그린다", /formatCurrencySigned\(손익\)/.test(SRC));
  ok("ROE 도 보정된 손익으로 다시 낸다", /손익 \/ Number\(t\.margin\)\) \* 100/.test(SRC));
  ok("강제청산 예외가 있다", /강제청산.*return 0/.test(SRC));
  ok("수수료율을 하드코딩하지 않는다", /feeRate[\s\S]{0,40}taker/.test(SRC));

  const md5 = crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", "trading.js"))).digest("hex");
  ok("trading.js 를 건드리지 않았다", md5 === "33250202c00b097ff8344ae2ee64cbe7");
  ok("누적 실현손익 보정 모듈은 그대로 있다",
    fs.existsSync(path.join(REPO, "js", "realized-pnl-fix.js")),
    "표와 누적값이 같은 기준을 써야 합니다");
}

console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
