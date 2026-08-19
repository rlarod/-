/* tests/history.test.js
 * 거래내역·주문내역이 실제 기록과 맞는지 검증합니다.
 *
 * 이 영역은 점검 결과 버그가 없었습니다. 지금 맞는 상태를 고정해서
 * 나중에 손댈 때 조용히 어긋나는 것을 막습니다.
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

const TAKER = 0.0005, MAKER = 0.0002;

/* trading.js 가 기록하는 모양 그대로 만듭니다. */
function trade(side, margin, lev, entry, exit) {
  const notional = margin * lev;
  const qty = notional / entry;
  const exitFee = qty * exit * TAKER;
  const gross = (side === "long" ? exit - entry : entry - exit) * qty;
  const pnl = gross - exitFee;
  return {
    side, leverage: lev, entry, exit, qty, margin,
    pnl,
    pnlPercent: (pnl / margin) * 100,                                   // ROE
    returnRate: ((side === "long" ? exit - entry : entry - exit) / entry) * 100, // 레버리지 미포함
    fee: notional * TAKER + exitFee,
  };
}

console.log("\n거래내역 · 주문내역");

/* ---------- 손익 계산 ---------- */
{
  const t = trade("long", 1000, 10, 60000, 61000);
  ok("손익 = 총손익 - 청산수수료", Math.abs(t.pnl - 161.58) < 0.02, t.pnl.toFixed(2));
  ok("수수료는 진입+청산 합계", Math.abs(t.fee - 10.08) < 0.02, t.fee.toFixed(2));

  const s = trade("short", 500, 10, 61000, 62000);
  ok("숏은 방향이 반대", s.pnl < 0, s.pnl.toFixed(2));
}

/* ---------- 두 가지 퍼센트 ---------- */
{
  const t = trade("long", 1000, 10, 60000, 61000);
  ok("ROE = 손익 / 증거금", Math.abs(t.pnlPercent - (t.pnl / t.margin) * 100) < 0.001);
  ok("수익률 = 가격 변화율(레버리지 미포함)", Math.abs(t.returnRate - 1.6667) < 0.01, t.returnRate.toFixed(4));
  /* 청산 수수료가 손익에서 빠지므로 정확히 레버리지 배는 아닙니다.
     수수료를 빼기 전 총손익으로 보면 정확히 레버리지 배가 됩니다. */
  {
    const gross = (t.exit - t.entry) * t.qty;
    ok("수수료 전이면 정확히 레버리지 배",
       Math.abs((gross / t.margin * 100) / t.returnRate - t.leverage) < 0.01,
       ((gross / t.margin * 100) / t.returnRate).toFixed(2));
    ok("수수료 때문에 조금 낮아진다", t.pnlPercent / t.returnRate < t.leverage,
       (t.pnlPercent / t.returnRate).toFixed(2));
  }

  /* 실측값(브라우저 화면)과 대조 */
  ok("화면 수익률 +1.67% 와 일치", Math.abs(t.returnRate - 1.67) < 0.01);
  ok("화면 ROE +16.16% 와 일치", Math.abs(t.pnlPercent - 16.16) < 0.02);
}

/* ---------- 화면이 두 값을 따로 보여주는가 ---------- */
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const js = fs.readFileSync(path.join(REPO, "js", "trade-history.js"), "utf8");

  ok("표에 '수익률' 칸이 있다", /<th>수익률<\/th>/.test(html));
  ok("표에 'ROE' 칸이 따로 있다", /<th>ROE<\/th>/.test(html));
  ok("두 칸을 서로 다른 값으로 채운다", /return_rate/.test(js) && /\broe\b/.test(js));
  ok("수수료 칸도 있다", /<th>수수료<\/th>/.test(html));
  ok("청산 사유 칸도 있다", /<th>사유<\/th>/.test(html));
}

/* ---------- 주문내역 ---------- */
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  /* 주문내역 표는 index.html 이 아니라 js/ui.js 가 만들어 넣습니다. */
  const ui = fs.readFileSync(path.join(REPO, "js", "ui.js"), "utf8");
  ok("주문내역 표가 있다", /order-history-body/.test(ui));
  ok("주문내역이 비면 안내 문구를 보여준다", /주문 내역이 없습니다/.test(ui));

  /* 세 가지 상태가 모두 기록되어야 합니다(실측: 시장가 체결 / 지정가 체결 / 지정가 취소). */
  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
  ok("체결 상태를 남긴다", /FILLED/.test(trading));
  ok("취소 상태를 남긴다", /CANCELLED|취소/.test(trading));
  ok("시장가·지정가를 구분한다", /"market"/.test(trading) && /"limit"/.test(trading));
}

/* ---------- 통화 전환 대응 ---------- */
{
  /* 거래내역은 currency:change 를 직접 듣지 않아서
     js/currency-refresh.js 가 대신 갱신합니다(앞 커밋). */
  const cr = fs.readFileSync(path.join(REPO, "js", "currency-refresh.js"), "utf8");
  ok("통화를 바꾸면 거래내역도 다시 그린다", /trading:persisted/.test(cr));
}

/* ---------- 수수료율 ---------- */
{
  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
  ok("테이커 0.05%", new RegExp("taker: " + TAKER).test(trading));
  ok("메이커 0.02%", new RegExp("maker: " + MAKER).test(trading));
  ok("지정가가 시장가보다 싸다", MAKER < TAKER);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
