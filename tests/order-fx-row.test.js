/* tests/order-fx-row.test.js
 * =========================================================================
 * 주문 정보 패널 "환율" 줄 — 2026-08-26 대표 지시
 *   "환율 1500원을 필요총액 대신 넣자"
 *
 * 이 검사가 지키는 것
 *   1. 환율 줄이 주문창에 있고, 문구가 "1,500원 / 1 USDT" 다
 *      (달러가 아니라 USDT 입니다. 우리가 곱하는 값이 USDT 입니다)
 *   2. 숫자 1500 을 화면 코드에 새로 적지 않는다 — App.Config.USD_KRW 만 읽는다
 *      (나중에 대표가 값을 바꾸면 js/config.js 한 곳만 고치면 되게)
 *   3. js/config.js 의 USD_KRW 는 1500 그대로다 (대표 결정 — 고정 환율)
 *   4. 필요총액 줄을 지우지 않았다 — 감추기만 했고 계산도 계속 돈다
 *      (되돌릴 수 있어야 합니다)
 *   5. 환율 줄 때문에 주문창이 커지지 않는다
 *      기본 여백을 그대로 두면 1440 에서 8px 넘쳐 주문창 아래가 잘렸습니다(실측).
 *      그래서 필요총액 줄이 쓰던 것과 같은 여백 규칙을 씁니다.
 *   6. 글자 크기·색은 위 두 줄(강제청산·수수료)과 같다 — 새 CSS 는 여백만 건드린다
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { boot, REPO } = require("./harness");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const feeJs = fs.readFileSync(path.join(REPO, "js", "order-fee-preview.js"), "utf8");
const configJs = fs.readFileSync(path.join(REPO, "js", "config.js"), "utf8");
const fxCssPath = path.join(REPO, "css", "order-fx-row.css");
const fxCss = fs.existsSync(fxCssPath) ? fs.readFileSync(fxCssPath, "utf8") : "";

/* 주석을 뺀 알맹이만 봅니다(주석에 적힌 설명용 숫자는 하드코딩이 아닙니다) */
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}
function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, "");
}

console.log("\n[1m주문창 환율 줄[0m");

/* ---- 1. 마크업 ---- */
{
  const bare = stripHtmlComments(html);
  const row = bare.match(/<div class="order-account-row order-fx-row">[\s\S]*?<\/div>/);
  ok("index.html 에 환율 줄이 있다", !!row, "order-fx-row 를 못 찾음");
  if (row) {
    ok("라벨이 '환율' 이다", /<span>환율<\/span>/.test(row[0]), row[0]);
    ok("값 자리는 #acc-fx-rate 다", /id="acc-fx-rate"/.test(row[0]), row[0]);
    ok("환율 숫자를 index.html 에 적지 않았다", !/\d/.test(row[0]), row[0]);
  }
  ok(
    "환율 줄이 수수료 줄 바로 뒤에 있다(강제청산 · 수수료 · 환율 순서)",
    bare.indexOf('id="acc-fx-rate"') > bare.indexOf('id="acc-fee-rate"') &&
      bare.indexOf('id="acc-fee-rate"') > bare.indexOf("강제청산")
  );
  ok("css/order-fx-row.css 가 연결돼 있다", html.indexOf('href="css/order-fx-row.css"') !== -1);
}

/* ---- 2. 1500 을 새로 적지 않았다 ---- */
{
  const code = stripJsComments(feeJs);
  ok("환율값을 App.Config.USD_KRW 에서 읽는다", /App\.Config\.USD_KRW/.test(code));
  ok(
    "order-fee-preview.js 에 환율 숫자를 박아두지 않았다",
    !/\b1500\b/.test(code) && !/1,500/.test(code),
    "1500 이 코드에 직접 적혀 있음"
  );
  ok("index.html 에도 환율 숫자를 박아두지 않았다", !/1,500\s*원/.test(stripHtmlComments(html)));
  ok("css 에도 환율 숫자를 박아두지 않았다", !/1,500/.test(stripCssComments(fxCss)));
}

/* ---- 3. config 의 환율은 1500 고정 (대표 결정) ---- */
{
  ok("js/config.js 의 USD_KRW 가 1500 그대로다", /const USD_KRW = 1500;/.test(configJs));
  ok("USD_KRW 를 App.Config 로 내보낸다", /\n\s*USD_KRW,/.test(configJs));
}

/* ---- 4. 필요총액을 지우지 않았다 ---- */
{
  ok("필요총액 마크업이 그대로 살아 있다", />필요총액</.test(feeJs));
  ok("필요총액 값 칸(#acc-order-total)도 그대로다", /id="acc-order-total"/.test(feeJs));
  ok("화면에서는 감추기만 했다(display:none)", /feeRow\.style\.display\s*=\s*"none"/.test(feeJs));
  ok("필요총액 계산 코드를 지우지 않았다", /plain\(o\.total, 2\)/.test(feeJs) && /plain\(o\.fee, 2\)/.test(feeJs));
}

/* ---- 5. 새 CSS 는 여백만 건드린다 ---- */
{
  const body = stripCssComments(fxCss).trim();
  ok(
    "환율 줄 여백을 필요총액 줄과 같게 맞췄다",
    /\.amitalk-order \.ami-acc-sub \.order-account-row\.order-fx-row\{padding-top:0;padding-bottom:0;\}/.test(body),
    body
  );
  ok("글자 크기를 건드리지 않는다", !/font-size/.test(body), body);
  ok("색을 건드리지 않는다", !/color\s*:/.test(body), body);
  ok("숨기지 않는다(display 를 건드리지 않는다)", !/display\s*:/.test(body), body);
  ok("규칙이 한 줄뿐이다(딴 데 영향 없음)", body.split("}").filter((s) => s.trim()).length === 1, body);
  ok("이모지 없음", !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fxCss));
}

/* ---- 6. 실제로 띄워서 확인 ---- */
{
  const c = boot();
  c.win.eval(feeJs);
  /* 하네스는 DOMContentLoaded 를 기다리지 않으므로 다른 모듈처럼 직접 부릅니다 */
  c.App.OrderFeePreview.init();
  const doc = c.doc;
  const rate = c.App.Config.USD_KRW;
  const slot = doc.getElementById("acc-fx-rate");

  ok("환율 칸이 화면에 만들어졌다", !!slot);
  ok(
    "표시 문구가 '" + rate.toLocaleString("ko-KR") + "원 / 1 USDT'",
    slot && slot.textContent === rate.toLocaleString("ko-KR") + "원 / 1 USDT",
    slot ? slot.textContent : "(없음)"
  );
  ok("'달러' 가 아니라 'USDT' 로 쓴다", slot && slot.textContent.indexOf("USDT") !== -1 && slot.textContent.indexOf("달러") === -1);

  /* 값이 config 를 따라간다 — 1500 을 어딘가에 박아뒀으면 여기서 걸립니다 */
  c.App.Config.USD_KRW = 1234;
  c.App.OrderFeePreview.renderFxRate();
  ok("config 값을 바꾸면 화면도 따라 바뀐다(하드코딩 아님)", slot.textContent === "1,234원 / 1 USDT", slot.textContent);
  c.App.Config.USD_KRW = rate;
  c.App.OrderFeePreview.renderFxRate();

  /* 필요총액 줄 — 감춰져 있지만 살아 있고 계산도 계속 돈다 */
  const feeRow = doc.querySelector(".order-fee-row");
  ok("필요총액 줄이 DOM 에 남아 있다", !!feeRow);
  ok("필요총액 줄은 감춰져 있다", feeRow && feeRow.style.display === "none", feeRow ? feeRow.style.display : "(없음)");

  c.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 68394, time: Date.now() });
  const qty = doc.getElementById("order-qty-input");
  qty.value = "0.5";
  qty.dispatchEvent(new c.win.Event("input", { bubbles: true }));
  c.App.OrderFeePreview.render();
  const total = doc.getElementById("acc-order-total").textContent;
  ok("감춘 뒤에도 필요총액 계산은 그대로 돈다(되돌리면 바로 보임)", total !== "-" && total.length > 0, total);

  /* 수량이 비면 "-" 가 맞습니다 — 고장이 아니라 계산할 값이 없는 상태입니다 */
  qty.value = "";
  qty.dispatchEvent(new c.win.Event("input", { bubbles: true }));
  c.App.OrderFeePreview.render();
  ok("수량이 비면 필요총액은 '-' (고장 아님)", doc.getElementById("acc-order-total").textContent === "-");
  ok("수량이 비어도 환율은 계속 보인다", doc.getElementById("acc-fx-rate").textContent.indexOf("USDT") !== -1);

  /* 주문 정보 패널 줄 순서 */
  const labels = [...doc.querySelectorAll(".ami-acc-sub .order-account-row")].map((r) => r.querySelector("span").textContent);
  ok("보조 정보 줄 순서: 강제청산 · 수수료 · 환율 · (감춘)필요총액", labels.join(",") === "강제청산,수수료,환율,필요총액", labels.join(","));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
process.exit(0);
