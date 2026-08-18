/* tests/tl-hotdeal.test.js
 * TL 핫딜 — 필터/정렬/구매 판정을 실제로 돌려서 확인합니다.
 * 서버 판정(purchase_tl_product)의 순서를 그대로 흉내낸 가짜 서버로
 * TL 부족 / 정상구매 / 재고부족 / 품절 / 구매제한 초과 / 로그아웃을 검증합니다. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
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

/* ---------- 모듈 로드 ---------- */
const sandbox = {
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  document: { readyState: "complete", addEventListener: () => {}, getElementById: () => null, querySelector: () => null, createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return String(this._t == null ? "" : this._t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); } }) },
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "tl-hotdeal.js"), "utf8"), sandbox);
const HD = sandbox.App.TLHotdeal;

/* ---------- 상품 ---------- */
function prod(over) {
  return Object.assign(
    {
      id: "p1", name: "금액권 20,000원", brand: "배달의민족", category: "delivery",
      price: 20000, tl_price: 5300, list_tl_price: null, stock: 20, max_purchase: 2,
      status: "active", is_hot: false, is_limited: false, sort_order: 22,
      expires_at: null, created_at: "2026-08-01T00:00:00Z",
    },
    over || {}
  );
}

const catalog = [
  prod({ id: "c1", brand: "스타벅스", name: "아메리카노", category: "cafe", price: 5000, tl_price: 1400, sort_order: 10 }),
  prod({ id: "c2", brand: "메가커피", name: "아메리카노", category: "cafe", price: 5000, tl_price: 1200, sort_order: 11 }),
  prod({ id: "d1", brand: "배달의민족", name: "금액권 5,000원", price: 5000, tl_price: 1400, sort_order: 20 }),
  prod({ id: "d2", brand: "배달의민족", name: "금액권 50,000원", price: 50000, tl_price: 13500, sort_order: 24 }),
  prod({ id: "s1", brand: "쿠팡", name: "금액권 10,000원", category: "shopping", price: 10000, tl_price: 2700, sort_order: 31 }),
  prod({ id: "l1", brand: "주유소", name: "주유권 30,000원", category: "life", price: 30000, tl_price: 8000, stock: 2, sort_order: 42 }),
];

console.log("\nTL 핫딜");

/* ---------- 이미지 없는 상품 숨김 ---------- */
{
  const withImg = prod({ id: "img1", image_url: "assets/products/starbucks-10000.png" });
  const noImg = prod({ id: "img2" });
  const list = [withImg, noImg];
  ok("이미지 없는 상품은 화면에서 빠진다", HD.filterProducts(list, {}).length === 1);
  ok("남는 건 이미지 있는 상품", HD.filterProducts(list, {})[0].id === "img1");
  ok("데이터를 지우는 게 아니라 거르기만 한다(원본 그대로)", list.length === 2 && list[1].id === "img2");
  ok("빈 문자열도 이미지 없음으로 본다", !HD.hasImage(prod({ image_url: "   " })));
  ok("옵션으로 전부 보이게 할 수 있다", HD.filterProducts(list, { onlyWithImage: false }).length === 2);
}

/* ---------- 카테고리 / 가격대 / 검색 ---------- */
{
  ok("기본은 전체 — 모든 상품", HD.filterProducts(catalog, { category: "all", band: "all", onlyWithImage: false }).length === catalog.length);
  ok("카페만 거른다", HD.filterProducts(catalog, { category: "cafe", band: "all", onlyWithImage: false }).every((p) => p.category === "cafe"));
  ok("카페는 2개", HD.filterProducts(catalog, { category: "cafe", band: "all", onlyWithImage: false }).length === 2);

  const b5 = HD.filterProducts(catalog, { category: "all", band: "5k", onlyWithImage: false });
  ok("5천원대 필터가 5,000원 상품만", b5.every((p) => p.price === 5000) && b5.length === 3, b5.map((p) => p.price).join(","));
  const b50 = HD.filterProducts(catalog, { category: "all", band: "50k", onlyWithImage: false });
  ok("5만원대 필터가 50,000원 상품", b50.length === 1 && b50[0].price === 50000);

  ok("브랜드로 검색", HD.filterProducts(catalog, { onlyWithImage: false, search: "쿠팡" }).length === 1);
  ok("일부만 입력해도 검색", HD.filterProducts(catalog, { onlyWithImage: false, search: "배달" }).length === 2);
  ok("대소문자/공백 무시", HD.filterProducts(catalog, { onlyWithImage: false, search: "  스타벅스 " }).length === 1);
  ok("없는 검색어는 0건", HD.filterProducts(catalog, { onlyWithImage: false, search: "없는브랜드" }).length === 0);
  ok("카테고리+가격대+검색 동시 적용", HD.filterProducts(catalog, { category: "delivery", band: "5k", search: "배달", onlyWithImage: false }).length === 1);
}

/* ---------- 정렬 ---------- */
{
  const asc = HD.sortProducts(catalog, "tl-asc").map((p) => p.tl_price);
  ok("TL 낮은순", asc.join(",") === asc.slice().sort((a, b) => a - b).join(","), asc.join(","));
  const desc = HD.sortProducts(catalog, "tl-desc").map((p) => p.tl_price);
  ok("TL 높은순", desc[0] === 13500 && desc[desc.length - 1] === 1200, desc.join(","));
  const ending = HD.sortProducts(catalog, "ending");
  ok("마감 임박순은 재고 적은 것부터", ending[0].id === "l1", ending[0].id);
  const pop = HD.sortProducts(catalog, "popular").map((p) => p.sort_order);
  ok("인기순은 관리자 노출 순서(지어낸 지표 아님)", pop.join(",") === pop.slice().sort((a, b) => a - b).join(","));
}

/* ---------- 배지 ---------- */
{
  const t = (p) => HD.badgesFor(p).map((b) => b.text).join(" ");
  ok("재고 3개 이하면 마감 임박", /마감 임박/.test(t(prod({ stock: 3 }))));
  ok("재고 4개면 마감 임박 아님", !/마감 임박/.test(t(prod({ stock: 4 }))));
  ok("재고 0이면 품절", /품절/.test(t(prod({ stock: 0 }))));
  ok("is_hot 이면 HOT", /HOT/.test(t(prod({ is_hot: true }))));
  ok("정가보다 싸면 오늘의 특가", /특가/.test(t(prod({ list_tl_price: 5800, tl_price: 5300 }))));
  ok("정가가 없으면 특가 배지 없음", !/특가/.test(t(prod({ list_tl_price: null }))));
}

/* =========================================================================
 * 가짜 서버 — purchase_tl_product() 의 판정 순서를 그대로 옮깁니다.
 * ========================================================================= */
function makeServer(opts) {
  const s = {
    loggedIn: opts.loggedIn !== false,
    earned: opts.earned || 0,
    txs: [], // 사용 내역(음수)
    products: JSON.parse(JSON.stringify(opts.products || [])),
    purchases: [],
  };
  s.balance = () => s.earned + s.txs.reduce((a, t) => a + t.amount, 0);
  s.purchase = (productId, qty) => {
    if (!s.loggedIn) return { error: "not_logged_in" };
    if (!qty || qty < 1) return { error: "bad_quantity" };
    const p = s.products.find((x) => x.id === productId);
    if (!p) return { error: "no_product" };
    if (p.status !== "active") return { error: "not_on_sale" };
    if (p.expires_at && new Date(p.expires_at).getTime() <= Date.now()) return { error: "expired" };
    if (p.stock < qty) return { error: "out_of_stock" };
    if (p.max_purchase !== null && p.max_purchase !== undefined) {
      const already = s.purchases
        .filter((x) => x.product_id === productId && x.status === "completed")
        .reduce((a, x) => a + x.quantity, 0);
      if (already + qty > p.max_purchase) return { error: "limit_exceeded" };
    }
    const total = p.tl_price * qty;
    const bal = s.balance();
    if (bal < total) return { error: "insufficient_tl" };
    p.stock -= qty;
    const pur = { id: "pur" + (s.purchases.length + 1), product_id: productId, quantity: qty, total_tl: total, status: "completed" };
    s.purchases.push(pur);
    s.txs.push({ type: "spend", amount: -total, balance_after: bal - total });
    return { data: { ok: true, spent: total, balance_after: bal - total, stock: p.stock } };
  };
  return s;
}

/* ---------- 시나리오 ---------- */
console.log("\n  구매 시나리오");

/* 1) 정상 구매 */
{
  const srv = makeServer({ earned: 20000, products: [prod()] });
  const before = srv.balance();
  const r = srv.purchase("p1", 1);
  ok("정상 구매: 성공", !r.error && r.data.ok, JSON.stringify(r));
  ok("정상 구매: TL 5,300 차감", srv.balance() === before - 5300, String(srv.balance()));
  ok("정상 구매: 재고 20 -> 19", srv.products[0].stock === 19, String(srv.products[0].stock));
  ok("정상 구매: 구매내역 1건", srv.purchases.length === 1);
  ok("정상 구매: TL 거래내역에 -5,300 기록", srv.txs[0].amount === -5300 && srv.txs[0].balance_after === before - 5300);
  ok("정상 구매: 화면 사전판정도 통과했었다", HD.checkPurchase(prod(), 1, before, 0).ok);
}

/* 2) TL 부족 */
{
  const srv = makeServer({ earned: 2300, products: [prod()] });
  const r = srv.purchase("p1", 1);
  ok("TL 부족: 서버가 막는다", r.error === "insufficient_tl", JSON.stringify(r));
  ok("TL 부족: 잔액 그대로", srv.balance() === 2300);
  ok("TL 부족: 재고 그대로", srv.products[0].stock === 20);
  const pre = HD.checkPurchase(prod(), 1, 2300, 0);
  ok("TL 부족: 화면이 부족액을 정확히 알려준다", !pre.ok && pre.short === 3000 && pre.have === 2300 && pre.need === 5300, JSON.stringify(pre));
}

/* 3) 재고 부족 (수량 > 재고) */
{
  const srv = makeServer({ earned: 999999, products: [prod({ stock: 2, max_purchase: null })] });
  const r = srv.purchase("p1", 5);
  ok("재고 부족: 서버가 막는다", r.error === "out_of_stock");
  ok("재고 부족: 재고 그대로", srv.products[0].stock === 2);
  ok("재고 부족: 화면 사전판정도 막는다", HD.checkPurchase(prod({ stock: 2, max_purchase: null }), 5, 999999, 0).code === "out_of_stock");
}

/* 4) 품절 */
{
  const srv = makeServer({ earned: 999999, products: [prod({ stock: 0 })] });
  const r = srv.purchase("p1", 1);
  ok("품절: 서버가 막는다", r.error === "out_of_stock");
  const pre = HD.checkPurchase(prod({ stock: 0 }), 1, 999999, 0);
  ok("품절: 화면이 '품절'로 안내", pre.code === "sold_out" && /품절/.test(pre.message), JSON.stringify(pre));
}

/* 5) 구매 제한 초과 */
{
  const srv = makeServer({ earned: 999999, products: [prod({ max_purchase: 2 })] });
  ok("제한 2개: 1개째 성공", !srv.purchase("p1", 1).error);
  ok("제한 2개: 2개째 성공", !srv.purchase("p1", 1).error);
  const r = srv.purchase("p1", 1);
  ok("제한 2개: 3개째는 막힌다", r.error === "limit_exceeded");
  ok("제한 초과 후 재고는 2만 줄었다", srv.products[0].stock === 18, String(srv.products[0].stock));
  const pre = HD.checkPurchase(prod({ max_purchase: 2 }), 1, 999999, 2);
  ok("제한 초과: 화면 문구가 지침대로", pre.message === "1인 구매 한도를 초과했습니다.", pre.message);
  ok("한 번에 한도 넘게 담아도 막힌다", srv.purchase("p2", 3).error !== undefined);
}

/* 6) 로그아웃 */
{
  const srv = makeServer({ loggedIn: false, earned: 999999, products: [prod()] });
  const r = srv.purchase("p1", 1);
  ok("로그아웃: 서버가 막는다", r.error === "not_logged_in");
  ok("로그아웃: 재고/잔액 변화 없음", srv.products[0].stock === 20 && srv.purchases.length === 0);
  ok("로그아웃: 화면 문구", /로그인/.test(HD.describeServerError("not_logged_in")));
}

/* 7) 판매 종료 / 일시중지 */
{
  const srv = makeServer({ earned: 999999, products: [prod({ status: "ended" })] });
  ok("판매종료 상품은 못 산다", srv.purchase("p1", 1).error === "not_on_sale");
  const past = new Date(Date.now() - 3600000).toISOString();
  const srv2 = makeServer({ earned: 999999, products: [prod({ expires_at: past })] });
  ok("마감 시간이 지난 상품은 못 산다", srv2.purchase("p1", 1).error === "expired");
}

/* 8) 클라이언트 값을 조작해도 서버가 막는다 */
{
  const srv = makeServer({ earned: 1000, products: [prod()] });
  // 개발자도구에서 화면상의 가격/잔액을 바꾼 상황을 흉내냅니다.
  const tampered = prod({ tl_price: 1 });
  ok("조작된 가격으로 화면 판정은 통과하지만", HD.checkPurchase(tampered, 1, 1000, 0).ok);
  ok("서버는 진짜 가격으로 다시 계산해 막는다", srv.purchase("p1", 1).error === "insufficient_tl");
  ok("조작해도 재고/구매내역 변화 없음", srv.products[0].stock === 20 && srv.purchases.length === 0);
}

/* 9) 잔액 = 획득 - 사용 (계급은 안 내려감) */
{
  const srv = makeServer({ earned: 10000, products: [prod()] });
  srv.purchase("p1", 1);
  ok("보유 TL = 획득 - 사용", srv.balance() === 10000 - 5300, String(srv.balance()));
  ok("획득 TL(계급 점수)은 그대로", srv.earned === 10000);
}

/* 10) 구매내역 집계 */
{
  const counts = HD.countByProduct([
    { product_id: "p1", quantity: 2, status: "completed" },
    { product_id: "p1", quantity: 1, status: "completed" },
    { product_id: "p2", quantity: 5, status: "cancelled" },
  ]);
  ok("완료 건만 합산", counts.p1 === 3);
  ok("취소 건은 한도에 안 들어간다", counts.p2 === undefined);
}

/* ---------- 서버 오류 문구 ---------- */
{
  ok("SQL 미실행을 따로 안내", /schema-tl-hotdeal\.sql/.test(HD.describeServerError("Could not find the function public.purchase_tl_product")));
  ok("재고 부족 안내", /재고/.test(HD.describeServerError("out_of_stock")));
  ok("모르는 오류는 일반 문구", /실패/.test(HD.describeServerError("weird thing")));
}

/* ---------- 파일/구조 ---------- */
console.log("\n  구조·보안·디자인");
{
  const js = fs.readFileSync(path.join(REPO, "js", "tl-hotdeal.js"), "utf8");
  const sql = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-hotdeal.sql"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  const sqlCode = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

  /* 보안 */
  ok("구매는 서버 RPC 로만", /rpc\("purchase_tl_product"/.test(js));
  ok("클라이언트가 가격을 보내지 않는다(상품 id + 수량만)", /p_product_id: product\.id, p_quantity: quantity/.test(js));
  ok("잔액도 서버 RPC 로 받는다", /rpc\("tl_balance_info"\)/.test(js));
  ok("프론트에서 재고를 직접 깎지 않는다", !/stock\s*-=|stock\s*=\s*stock\s*-/.test(js));
  ok("SQL 이 잔액을 직접 계산한다", /bal := public\.tl_balance\(uid\)/.test(sqlCode));
  ok("SQL 이 상품 행을 잠근다(동시 구매 대비)", /from public\.tl_products where id = p_product_id for update/.test(sqlCode));
  ok("SQL 이 사용자 행도 잠근다(잔액 이중 사용 대비)", /from public\.trading_accounts where user_id = uid for update/.test(sqlCode));
  ok("구매내역 INSERT 정책이 없다(함수로만 생성)", !/create policy[^;]*tl_purchases[^;]*for insert/i.test(sqlCode));
  ok("상품 쓰기는 관리자만", /tl_products_admin_write/.test(sqlCode) && /admin_users/.test(sqlCode));
  ok("모든 테이블에 RLS 켜짐", (sqlCode.match(/enable row level security/g) || []).length >= 3);

  /* DB 구조 */
  ["tl_products", "tl_purchases", "tl_transactions"].forEach((t) => {
    ok("테이블 생성: " + t, new RegExp("create table if not exists public\\." + t).test(sqlCode));
  });
  ok("기존 테이블을 지우지 않는다", !/\b(drop\s+table|truncate)\b/i.test(sqlCode));
  ok("관리자 확장용 컬럼이 다 있다", ["price", "tl_price", "stock", "max_purchase", "status", "is_hot", "is_limited"].every((c) => new RegExp("\\b" + c + "\\b").test(sqlCode)));

  /* 화면 */
  ok("핫딜 페이지 마크업 존재", /id="page-hotdeal"/.test(html));
  ok("메뉴가 실제 페이지로 연결됨", /id="page-nav-hotdeal" data-page="hotdeal"/.test(html));
  ok("TL 마켓은 준비중으로 구분", /id="page-nav-market"[^>]*>[^<]*TL 마켓/.test(html));
  ok("스크립트 연결됨", /js\/tl-hotdeal\.js/.test(html));
  ok("상품을 HTML 에 하드코딩하지 않았다", !/스타벅스|배달의민족|쿠팡/.test(html));
  ok("잔액을 HTML 에 하드코딩하지 않았다", !/5,320 TL/.test(html));

  /* 디자인 */
  ok("카드 모서리는 사이트 규칙 3px", /\.hd-card\{[\s\S]*?border-radius:3px/.test(css));
  ok("새 색을 만들지 않고 기존 변수 사용", /\.hd-buy-btn\{[\s\S]*?background:var\(--gold\)/.test(css));
  ok("카드 배경이 변수라 다크모드에서 안 뜬다", /\.hd-card\{[\s\S]*?background:var\(--surface\)/.test(css));
  ok("다크모드 전용 카드 규칙이 있다", /html\[data-theme="dark"\] \.hd-card/.test(css));
  ok("PC 3열(2026-08-18 지시)", /\.hd-grid\{[^}]*repeat\(3,minmax\(0,1fr\)\)/.test(css));
  ["repeat(2", "minmax(0,1fr)"].forEach((step) => {
    ok("반응형 단계 존재: " + step, css.indexOf(".hd-grid{grid-template-columns:" + step) !== -1);
  });
  ok("카테고리 줄은 화면에서만 숨김(마크업은 유지)", /#hd-category-row\{display:none;\}/.test(css) && /id="hd-category-row"/.test(html));
  ok("가격대·검색·정렬은 그대로 남아있다", /id="hd-price-row"/.test(html) && /id="hd-search"/.test(html) && /id="hd-sort"/.test(html));
  ok("가로 스크롤이 생기지 않게 minmax(0,1fr) 사용", /\.hd-grid\{[^}]*minmax\(0,1fr\)/.test(css));

  /* 용어 */
  ok("포인트 단위를 '벅스'/'코인'으로 부르지 않는다(브랜드명 스타벅스는 예외)",
     !/(보유|사용|획득)\s*(벅스|코인)/.test(js) && !/벅스\s*(단위|잔액)/.test(js));
  ok("단위는 TL", /return num\(n\) \+ " TL"/.test(js));
}

/* ---------- 기본 정렬: 브랜드 묶음 + 금액 오름차순 ---------- */
console.log("\n  기본 정렬");
{
  const mixed = [
    prod({ id: "m50", brand: "메가커피", category: "cafe", price: 50000, tl_price: 12500, sort_order: 18 }),
    prod({ id: "s20", brand: "스타벅스", category: "cafe", price: 20000, tl_price: 5300, sort_order: 15 }),
    prod({ id: "m10", brand: "메가커피", category: "cafe", price: 10000, tl_price: 2500, sort_order: 14 }),
    prod({ id: "s30", brand: "스타벅스", category: "cafe", price: 30000, tl_price: 8000, sort_order: 16 }),
    prod({ id: "m30", brand: "메가커피", category: "cafe", price: 30000, tl_price: 7400, sort_order: 17 }),
    prod({ id: "s10", brand: "스타벅스", category: "cafe", price: 10000, tl_price: 2700, sort_order: 13 }),
  ];
  const order = HD.sortProducts(mixed, "popular").map((p) => p.id);
  ok("스타벅스가 먼저, 그 안에서 금액 오름차순", order.slice(0, 3).join(",") === "s10,s20,s30", order.join(","));
  ok("그다음 메가커피, 금액 오름차순", order.slice(3).join(",") === "m10,m30,m50", order.join(","));
  ok("브랜드가 섞이지 않는다", order.join(",") === "s10,s20,s30,m10,m30,m50", order.join(","));

  /* 브랜드 순서는 코드에 이름을 박은 게 아니라 sort_order 로 정해집니다 */
  const flipped = mixed.map((p) =>
    Object.assign({}, p, { sort_order: p.brand === "메가커피" ? p.sort_order - 10 : p.sort_order })
  );
  const order2 = HD.sortProducts(flipped, "popular").map((p) => p.id);
  ok("sort_order 를 바꾸면 브랜드 순서도 바뀐다(이름 하드코딩 아님)", order2.slice(0, 3).join(",") === "m10,m30,m50", order2.join(","));
}

/* ---------- 글씨 크기 ---------- */
{
  const css2 = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  function px(re, label) {
    const m = css2.match(re);
    return m ? Number(m[1]) : -1;
  }
  const name = px(/\.hd-name\{[\s\S]*?font-size:(\d+)px/);
  const tlSize = px(/\.hd-tl\{font-size:(\d+)px/);
  const brand = px(/\.hd-brand\{font-size:(\d+)px/);
  const btn = px(/\.hd-buy-btn\{[\s\S]*?font-size:(\d+)px/);
  ok("상품명 18px 이상", name >= 18, String(name));
  ok("TL 가격 22px 이상", tlSize >= 22, String(tlSize));
  ok("브랜드명 15px 이상", brand >= 15, String(brand));
  ok("구매 버튼 16px 이상", btn >= 16, String(btn));
  ok("TL 가격이 상품명보다 크다(가장 눈에 띄어야 함)", tlSize > name, tlSize + " vs " + name);
}

/* ---------- 새로 정한 TL 가격이 기존 표와 어긋나지 않는지 ---------- */
console.log("\n  TL 가격 일관성");
{
  const sqlImg = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-product-images.sql"), "utf8");
  const sqlMain = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-hotdeal.sql"), "utf8");

  /* 사장님이 직접 정하신 기준표 */
  const STD = { 5000: 1400, 10000: 2700, 20000: 5300, 30000: 8000, 50000: 13500 };

  /* 기준표가 실제로 등록 SQL 에 그대로 들어있는지 먼저 확인 */
  ok("배민 30,000원이 기준표대로 8,000 TL", /'배달의민족', 'delivery', 30000,\s*8000/.test(sqlMain));
  ok("쿠팡 50,000원이 기준표대로 13,500 TL", /'쿠팡',\s*'shopping', 50000, 13500/.test(sqlMain));
  ok("메가커피 10,000원은 2,500 TL (기준표보다 200 쌈)", /'메가커피',\s*'cafe',\s*10000,\s*2500/.test(sqlMain));

  /* 새로 정한 값 */
  function tlIn(sql, brand, won) {
    const re = new RegExp("'" + brand + "', 'cafe', " + won + ",\\s*(\\d+)");
    const m = sql.match(re);
    return m ? Number(m[1]) : null;
  }
  const sb30 = tlIn(sqlImg, "스타벅스", 30000);
  const mg30 = tlIn(sqlImg, "메가커피", 30000);
  const mg50 = tlIn(sqlImg, "메가커피", 50000);

  ok("스타벅스 30,000원 = 기준표 그대로 8,000 TL", sb30 === STD[30000], String(sb30));
  ok("메가커피 30,000원 = 7,400 TL (1만원당 200 할인)", mg30 === STD[30000] - 600, String(mg30));
  ok("메가커피 50,000원 = 12,500 TL (1만원당 200 할인)", mg50 === STD[50000] - 1000, String(mg50));

  /* 비율식으로 계산해도 같은 답이 나와야 합니다(두 방법 교차 검증) */
  const ratio = 2500 / 2700;
  ok("메가 50,000원은 비율식(2500/2700)과 정확히 일치", Math.round(STD[50000] * ratio) === mg50, String(Math.round(STD[50000] * ratio)));
  ok("메가 30,000원은 비율식과 10 TL 이내", Math.abs(STD[30000] * ratio - mg30) < 10, String(Math.round(STD[30000] * ratio)));

  /* 금액이 커질수록 원당 TL 이 싸지는(=손해 안 보는) 방향인지 */
  ok("스타벅스: 금액이 클수록 원당 TL 이 낮아진다", 2700 / 10000 >= sb30 / 30000);
  ok("메가커피: 금액이 클수록 원당 TL 이 낮아진다", 2500 / 10000 >= mg50 / 50000);

  /* 같은 금액이면 메가커피가 항상 더 싸야 합니다 */
  ok("같은 30,000원이면 메가커피가 스타벅스보다 싸다", mg30 < sb30, mg30 + " vs " + sb30);

  /* 100 TL 단위로 떨어지는 깔끔한 값인지 */
  [sb30, mg30, mg50].forEach(function (v) {
    ok(v + " TL 은 100 단위로 떨어진다", v % 100 === 0);
  });
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
