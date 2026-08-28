/* tests/order-fee-preview.test.js
 * 100% 버튼이 지갑을 다 쓰는지, 그리고 주문창 진입수수료 표시가 맞는지 검증합니다.
 * 사장님이 올려주신 화면 값(2026-08-18)을 기준으로 삼습니다. */
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

const R = 1500; // USD_KRW
const TAKER = 0.0005;
const MAKER = 0.0002;

/* trading.js 의 getMaxAffordableMargin() 과 같은 식 */
function maxAffordableMargin(balance, leverage) {
  return balance / (1 + leverage * TAKER);
}
/* qty-price-order.js 의 onPercentClick() 과 같은 식 */
function qtyForPercent(balance, leverage, price, pct) {
  const maxQty = (maxAffordableMargin(balance, leverage) * leverage) / price;
  return Math.floor(((maxQty * pct) / 100) * 1e6) / 1e6;
}

console.log("\n100% 주문과 진입수수료");

/* ---- 실제 화면 값 재현 ---- */
{
  const walletKrw = 188905165;
  const priceKrw = 96521700;
  const wallet = walletKrw / R;
  const price = priceKrw / R;
  const lev = 100;

  const qty = qtyForPercent(wallet, lev, price, 100);
  ok("100% 수량이 화면과 일치 (186.392988 BTC)", qty.toFixed(6) === "186.392988", qty.toFixed(6));

  const notional = qty * price;
  const margin = notional / lev;
  const fee = notional * TAKER;

  ok("증거금 179,909,681원", Math.round(margin * R) === 179909681, String(Math.round(margin * R)));
  ok("진입수수료 8,995,484원", Math.round(fee * R) === 8995484, String(Math.round(fee * R)));
  ok("증거금 + 수수료 = 지갑 전액 (188,905,165원)", Math.round((margin + fee) * R) === walletKrw, String(Math.round((margin + fee) * R)));

  /* 지갑 전액을 증거금으로 쓰면 trading.js 가 거부합니다 */
  const naiveQty = (wallet * lev) / price;
  const naiveNotional = naiveQty * price;
  ok("지갑 전액을 증거금으로 쓰면 수수료까지 합쳐 잔고를 넘는다(거부됨)", naiveNotional / lev + naiveNotional * TAKER > wallet);
  ok("그때 초과액이 수수료와 같다", Math.round(naiveNotional * TAKER * R) === Math.round((naiveNotional / lev + naiveNotional * TAKER - wallet) * R));
}

/* ---- 레버리지별로 남는 몫이 달라진다 ---- */
{
  const wallet = 100000;
  [1, 10, 100].forEach((lev) => {
    const m = maxAffordableMargin(wallet, lev);
    const fee = m * lev * TAKER;
    ok("레버리지 " + lev + "배: 증거금+수수료가 정확히 지갑", Math.abs(m + fee - wallet) < 1e-9, String(m + fee));
  });
  ok("1배에서는 거의 전액이 증거금(수수료 0.05%)", Math.abs(maxAffordableMargin(wallet, 1) - wallet / 1.0005) < 1e-9);
  ok("100배에서는 증거금이 지갑의 1/1.05", Math.abs(maxAffordableMargin(wallet, 100) - wallet / 1.05) < 1e-9);
}

/* ---- 부분 퍼센트 ---- */
{
  const wallet = 100000;
  const price = 60000;
  const lev = 100;
  const full = qtyForPercent(wallet, lev, price, 100);
  [10, 25, 50, 75].forEach((pct) => {
    const q = qtyForPercent(wallet, lev, price, pct);
    ok(pct + "% 수량이 100%의 " + pct + "% (버림 오차 이내)", Math.abs(q - (full * pct) / 100) < 2e-6, q + " vs " + (full * pct) / 100);
  });
  ok("버림이라 100%가 최대치를 넘지 않는다", full * price / lev + full * price * TAKER <= wallet + 1e-9);
}

/* ---- 지정가는 메이커 요율 ---- */
{
  const qty = 1;
  const price = 60000;
  ok("메이커 수수료가 테이커보다 싸다", qty * price * MAKER < qty * price * TAKER);
  ok("메이커 0.02% = 12 USDT / 테이커 0.05% = 30 USDT", qty * price * MAKER === 12 && qty * price * TAKER === 30);
}

/* ---- 모듈이 실제로 그렇게 쓰였는지 ---- */
{
  const js = fs.readFileSync(path.join(REPO, "js", "order-fee-preview.js"), "utf8");
  ok("수량은 order-qty-input 에서 읽는다", js.indexOf('el("order-qty-input")') !== -1);
  ok("요율은 snapshot.feeRate 에서 읽는다(하드코딩 아님)", /snap\.feeRate\.(maker|taker)/.test(js));
  ok("수수료율을 코드에 박아두지 않았다", !/0\.0005|0\.0002/.test(js));
  ok("지정가/시장가로 메이커·테이커를 구분한다", /isLimitMode/.test(js) && /maker/.test(js) && /taker/.test(js));
  ok("가용 잔고 초과 시 경고를 띄운다", /order-fee-warn|acc-fee-warn/.test(js));
  /* 2026-08-18: 두 줄이면 주문창이 40px 넘쳐 스크롤이 생겼습니다(실측).
     한 줄로 합치고 소수 2자리로 줄여 잘림 없이 들어가게 했습니다. */
  ok("수수료·필요총액을 한 줄에 넣는다(주문창 스크롤 방지)", /order-fee-row/.test(js) && (js.match(/order-account-row/g) || []).length <= 2);
  ok("값은 소수 2자리 — 4자리면 좁은 주문창에서 잘림", /plain\(o\.total, 2\)/.test(js) && /plain\(o\.fee, 2\)/.test(js));
  ok("라벨은 짧게(길면 값이 잘림), 설명은 title 로", /title="증거금 \+ 진입수수료/.test(js) && />필요총액</.test(js));

  const cssFee = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  ok("이 줄만 여백을 줄여 높이를 맞춘다", /\.order-account-row\.order-fee-row\{padding-top:0;padding-bottom:0;\}/.test(cssFee));

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  ok("index.html 에 모듈이 연결됐다", html.indexOf("js/order-fee-preview.js") !== -1);
  ok("qty-price-order.js 뒤에 로드된다", html.indexOf("js/order-fee-preview.js") > html.indexOf("js/qty-price-order.js"));
  ok("충전 주석도 자정 기준으로 갱신됐다", html.indexOf("오전 6시(한국시간) 기준으로 횟수가 채워집니다") === -1);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
