/* tests/order-unit-mismatch.test.js
 * 원화 모드에서 증거금이 1,500으로 한 번 더 나뉘던 버그의 재발 방지 테스트.
 *
 * 배경(2026-08-18 실측)
 *   지갑 188,905,165원 / 100배 / 96,521,700원에서 100%를 눌렀을 때
 *     의도한 증거금  119,939.79 USDT (179,909,681원)
 *     실제 진입       80.01 USDT     (120,020원)   <- 1,500배 차이
 *   원인: qty-price-order.js 의 syncMargin() 이 USDT 값을 #margin-input 에
 *         그대로 썼는데, ui.js 의 getMarginValue() 는 그 칸을 화면 통화로
 *         읽고 fromDisplayValue() 로 나눕니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
/* 2026-08-28 기록팀 — REPO 를 고정으로 박아두면 돌연변이 검증이 사본이 아니라
   진짜 저장소를 읽어서 "조용히 통과" 합니다. 실제로 두 번 속았습니다. */
const REPO = process.env.REPO || require("path").join(__dirname, "..");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m✓\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const R = 1500;

/* ui.js 의 규칙 */
function fromDisplayValue(v, cur) {
  return cur === "KRW" ? v / R : v;
}
/* 고친 뒤의 qty-price-order.js 규칙 */
function toDisplayFloor(usd, cur) {
  return cur === "KRW" ? Math.floor(usd * R) : Math.floor(usd * 100) / 100;
}

console.log("\n주문창 통화 단위 (원화 모드 1,500배 버그)");

/* ---- 왕복 변환 ---- */
["KRW", "USDT"].forEach((cur) => {
  const margin = 119939.7873;
  const written = toDisplayFloor(margin, cur);
  const readBack = fromDisplayValue(written, cur);
  ok(cur + " 모드: 써 넣은 값을 ui.js 가 읽으면 원래 증거금이 나온다", Math.abs(readBack - margin) < (cur === "KRW" ? 1 / R : 0.01), "의도 " + margin + " / 실제 " + readBack);
  ok(cur + " 모드: 버림이라 원래 값을 넘지 않는다", readBack <= margin + 1e-9, String(readBack));
});

/* ---- 버그 재현: 고치기 전 방식이면 1,500배 어긋난다 ---- */
{
  const margin = 119939.7873;
  const buggy = fromDisplayValue(margin, "KRW"); // USDT 를 그대로 써 넣었을 때
  ok("옛 방식은 원화 모드에서 1,500배 작아진다(버그 재현)", Math.abs(buggy - margin / R) < 1e-9 && Math.abs(buggy - 79.96) < 0.01, String(buggy));
  ok("그 값이 실제 화면에 찍혔던 80.01 USDT 와 같은 크기다", Math.round(buggy * R) === 119940, String(Math.round(buggy * R)));
  ok("USDT 모드에서는 옛 방식도 맞아서 못 잡았다", fromDisplayValue(margin, "USDT") === margin);
}

/* ---- 100% 가 지갑을 다 쓰는지 (원화 모드) ---- */
{
  const walletKrw = 188905165;
  const wallet = walletKrw / R;
  const price = 96521700 / R;
  const lev = 100;
  const taker = 0.0005;

  const maxMargin = wallet / (1 + lev * taker);
  const maxQty = Math.floor(((maxMargin * lev) / price) * 1e6) / 1e6;
  ok("100% 수량 186.392988 BTC", maxQty.toFixed(6) === "186.392988", maxQty.toFixed(6));

  const notional = maxQty * price;
  const written = toDisplayFloor(notional / lev, "KRW");
  const actualMargin = fromDisplayValue(written, "KRW");
  const actualFee = actualMargin * lev * taker;
  const totalKrw = Math.round((actualMargin + actualFee) * R);

  ok("증거금 칸에 원 단위로 들어간다 (179,909,680원)", written === 179909680, String(written));
  ok("실제 진입 증거금이 119,939 USDT 대", Math.floor(actualMargin) === 119939, String(actualMargin));
  ok("증거금 + 수수료가 지갑과 1원 이내로 일치", Math.abs(totalKrw - walletKrw) <= 1, totalKrw + " vs " + walletKrw);
  ok("지갑을 넘지 않는다(주문 거부 안 남)", totalKrw <= walletKrw, String(totalKrw));
}

/* ---- 지정가 가격칸도 같은 문제 ---- */
{
  /* 입력칸에는 "96,521,700원" 처럼 쉼표와 단위가 붙습니다. */
  const raw = "96,521,700원";
  const naive = parseFloat(raw);
  ok("그냥 parseFloat 하면 쉼표에서 끊겨 96 이 된다(옛 버그)", naive === 96, String(naive));

  const cleaned = parseFloat(raw.replace(/[^0-9.]/g, ""));
  ok("숫자만 남기면 96,521,700 이 나온다", cleaned === 96521700, String(cleaned));
  ok("USDT 로 되돌리면 64,347.8", Math.abs(fromDisplayValue(cleaned, "KRW") - 64347.8) < 0.01, String(fromDisplayValue(cleaned, "KRW")));
}

/* ---- 코드가 실제로 그렇게 고쳐졌는지 ---- */
{
  const qp = fs.readFileSync(path.join(REPO, "js", "qty-price-order.js"), "utf8");
  ok("syncMargin 이 화면 통화로 써 넣는다", /marginInput\.value = toDisplayFloor\(margin\)/.test(qp));
  ok("USDT 를 그대로 써 넣던 줄이 사라졌다", !/marginInput\.value = margin;/.test(qp));
  ok("지정가 가격칸에서 쉼표·단위를 걷어낸다", /replace\(\/\[\^0-9\.\]\/g, ""\)/.test(qp));
  ok("지정가 가격을 USDT 로 되돌린다", /fromDisplay\(v\)/.test(qp));
  ok("환율을 코드에 박아두지 않았다(App.Config.USD_KRW 사용)", qp.indexOf("App.Config.USD_KRW") !== -1 && !/\b1500\b/.test(qp));

  const fp = fs.readFileSync(path.join(REPO, "js", "order-fee-preview.js"), "utf8");
  ok("수수료 표시 모듈도 같은 변환을 쓴다", /App\.Config\.USD_KRW/.test(fp) && /replace\(\/\[\^0-9\.\]\/g, ""\)/.test(fp));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
