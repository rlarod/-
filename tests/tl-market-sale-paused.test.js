/* tests/tl-market-sale-paused.test.js
 * ---------------------------------------------------------------
 * 지키는 것 — TL 마켓 "판매 중지" (2026-08-31 대표 결정 · 승인대기 4번)
 *
 * 왜 멈췄나
 *   마켓에서 살 수 있는 유일한 상품 '레버리지 x100배 이용권' 이 아무 효과가
 *   없습니다. js/leverage-gate.js 의 DEFAULT_MAX 가 이미 100 이라, 50 TL 을
 *   내고 사도 상한이 그대로 100 입니다. 회원이 TL 만 잃습니다.
 *
 * 대표가 고른 것
 *   B — "일단 상품을 내려서 못 사게 한다"
 *   (A 진짜로 작동하게 / C 이미 산 회원에게 TL 환불 은 고르지 않으셨습니다)
 *
 * 이 파일이 잡는 것
 *   1) 판매 중지가 켜져 있는 동안 어떤 상품도 살 수 없다
 *   2) 회원이 "왜" 못 사는지 알 수 있다 (버튼만 회색이면 고장인 줄 압니다)
 *   3) 상품을 지우지 않았다 — 카드는 그대로 보인다
 *   4) statusInfo() (서버가 알려준 상품 상태) 는 그대로 살아 있다
 *      — 나중에 되살릴 때 서버 상태를 다시 읽어야 합니다
 *   5) 되돌리는 방법이 한 곳에 있다 (SALE_PAUSED 한 글자)
 *
 * ⚠ 이건 화면 잠금입니다. 개발자도구로 purchase_tl_market_item 을 직접 부르면
 *   서버는 여전히 받습니다. 완전히 막으려면 tl_market_products.status 를
 *   'paused' 로 바꿔야 합니다 — 그건 대표가 SQL 을 돌려야 하는 일입니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [32m✓[0m " + name); }
  else { fail++; console.log("  [31m✗[0m " + name + (detail ? " — " + detail : "")); }
}

function boot(file) {
  const sandbox = {
    console,
    setInterval: () => 0,
    clearInterval: () => {},
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById: () => null,
      querySelector: () => null,
      createElement: () => ({ style: {}, set textContent(v) { this._t = v; } }),
    },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", file), "utf8"), sandbox);
  return sandbox;
}

const MK = boot("tl-market.js").App.TLMarket;
const SRC = fs.readFileSync(path.join(REPO, "js", "tl-market.js"), "utf8");

function prod(over) {
  return Object.assign({
    id: "p1", name: "레버리지 x100배 이용권", tl_price: 50, item_type: "leverage_boost",
    status: "active", stock: null, max_purchase: null, is_visible: true,
  }, over || {});
}

console.log("\nTL 마켓 — 판매 중지 (대표 결정 B)");

/* ---------- 1. 판매 중지가 켜져 있다 ---------- */
{
  ok("판매 중지가 켜져 있다", MK.isSalePaused() === true,
    "js/tl-market.js 의 SALE_PAUSED 가 false 입니다. 대표가 A 로 바꾸셨다면 " +
    "이 테스트도 함께 지워야 합니다 — 그때는 이 파일이 잘못된 것이 아니라 " +
    "결정이 바뀐 것입니다.");
}

/* ---------- 2. 어떤 상품도 살 수 없다 ---------- */
{
  const 경우 = [
    ["판매중(active)", prod()],
    ["재고 무제한", prod({ stock: null })],
    ["재고 넉넉", prod({ stock: 999 })],
    ["구매한도 없음", prod({ max_purchase: null })],
    ["다른 상품", prod({ id: "p9", item_type: "seed_recharge", tl_price: 300 })],
  ];
  경우.forEach(([이름, p]) => {
    const st = MK.saleInfo(p);
    ok("살 수 없다 — " + 이름, st.buyable === false, JSON.stringify(st));
  });
  ok("판매 중지라고 표시한다", MK.saleInfo(prod()).paused === true);
}

/* ---------- 3. 회원이 "왜" 못 사는지 알 수 있다 ---------- */
{
  const st = MK.saleInfo(prod());
  ok("카드에 상태 배지가 붙는다", !!st.badge && String(st.badge).trim().length > 0,
    "badge=" + st.badge);
  ok("버튼 글자가 비어 있지 않다", !!st.label && String(st.label).trim().length > 0,
    "label=" + st.label);

  const why = MK.pausedText();
  ok("왜 못 사는지 설명하는 문장이 있다", typeof why === "string" && why.length >= 30,
    "지금: " + JSON.stringify(why));
  ok("설명에 TL 이 사라지지 않는다는 안심이 들어 있다", /TL/.test(why),
    "회원이 가장 먼저 걱정하는 것은 '내 TL 은 어떻게 되나' 입니다.");
  ok("설명이 화면에 실제로 그려진다", /renderPausedNote\s*\(\)/.test(SRC) &&
    /renderPausedNote\(\);/.test(SRC),
    "함수만 만들고 render() 에서 안 부르면 회원은 못 봅니다.");
}

/* ---------- 4. 상품을 지우지 않았다 ---------- */
{
  ok("카드 그리는 코드가 그대로 있다", /function productCard\(/.test(SRC));
  ok("카드가 saleInfo 를 본다", /function productCard\([\s\S]{0,200}?saleInfo\(p\)/.test(SRC),
    "productCard 가 statusInfo 만 보면 판매 중지가 카드에 안 나타납니다.");
  ok("구매 확인창에도 잠금이 있다", /function openConfirm\([\s\S]{0,300}?if \(SALE_PAUSED\)/.test(SRC),
    "버튼을 안 그려도, 다른 곳에서 openConfirm 을 부르면 뚫립니다.");
  ok("보관함 [사용하기] 는 막지 않았다", /mk-use/.test(SRC),
    "이미 산 회원의 아이템까지 못 쓰게 하면 그건 대표가 안 고르신 안입니다.");
}

/* ---------- 5. 서버 상태 읽기가 살아 있다 ---------- */
{
  ok("statusInfo 는 그대로다 — 판매중 상품을 판매중으로 읽는다",
    MK.statusInfo(prod()).buyable === true,
    "statusInfo 를 같이 잠그면 나중에 되살릴 때 서버 상태를 못 읽습니다.");
  ok("statusInfo 는 서버의 paused 도 그대로 읽는다",
    MK.statusInfo(prod({ status: "paused" })).buyable === false);
}

/* ---------- 6. 되돌리는 방법이 한 곳에 있다 ---------- */
{
  const 선언 = SRC.match(/var SALE_PAUSED = (true|false);/g) || [];
  ok("SALE_PAUSED 선언이 정확히 한 곳이다", 선언.length === 1,
    "지금 " + 선언.length + "곳 — 두 곳이면 한 곳만 고치고 안 바뀌었다고 헤맵니다.");
  ok("되돌리는 방법이 주석에 적혀 있다",
    /되돌리기[\s\S]{0,200}SALE_PAUSED[\s\S]{0,60}false/.test(SRC),
    "대표가 A(진짜로 작동하게)로 바꾸실 수 있습니다. 그때 무엇을 되돌리는지 " +
    "파일 안에 적혀 있어야 합니다.");
  ok("화면 잠금일 뿐이라는 것이 주석에 적혀 있다",
    /purchase_tl_market_item[\s\S]{0,200}(서버|paused)/.test(SRC),
    "개발자도구로 서버를 직접 부르면 뚫립니다. 다음 사람이 '완전히 막혔다' 고 " +
    "오해하지 않게 적어둬야 합니다.");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
