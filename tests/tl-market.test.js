/* tests/tl-market.test.js
 * TL 마켓 — 구매/보관함/사용/레버리지 게이트 검증.
 * 서버 판정 순서를 그대로 옮긴 가짜 서버로 시나리오를 돌립니다. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
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
      createElement: () => ({ set textContent(v) { this._t = v; }, get innerHTML() { return String(this._t == null ? "" : this._t); } }),
    },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", file), "utf8"), sandbox);
  return sandbox;
}

const MK = boot("tl-market.js").App.TLMarket;

function prod(over) {
  return Object.assign({
    id: "p1", name: "레버리지 x100배 이용권", description: "1일간 최대 100배",
    category: "leverage", icon: "100x", tl_price: 50, item_type: "leverage_boost",
    effect_value: 100, duration_hours: 24, stock: null, max_purchase: null,
    status: "active", is_visible: true, sort_order: 10, created_at: "2026-08-01T00:00:00Z",
  }, over || {});
}

const catalog = [
  prod(),
  prod({ id: "p2", name: "포지션 훔쳐보기 이용권", category: "position", tl_price: 100, item_type: "position_peek", duration_hours: null, sort_order: 20 }),
  prod({ id: "p3", name: "코인선물 재충전 이용권", category: "seed", tl_price: 200, item_type: "account_reset", effect_value: null, duration_hours: null, sort_order: 30 }),
  prod({ id: "p4", name: "시드 충전권", category: "seed", tl_price: 300, item_type: "seed_recharge", effect_value: 100000, duration_hours: null, sort_order: 40 }),
  prod({ id: "p5", name: "거래 수수료 할인권", category: "trade", tl_price: 250, item_type: "fee_discount", effect_value: 0.5, duration_hours: 24, sort_order: 50 }),
  prod({ id: "p6", name: "포지션 보호권", category: "trade", tl_price: 500, item_type: "liquidation_guard", duration_hours: null, sort_order: 60 }),
];

console.log("\nTL 마켓");

/* ---------- 카테고리 / 검색 / 정렬 ---------- */
{
  ok("기본은 전체 — 6개", MK.filterProducts(catalog, { category: "all" }).length === 6);
  ok("레버리지 카테고리", MK.filterProducts(catalog, { category: "leverage" }).length === 1);
  ok("자금/시드 카테고리 2개", MK.filterProducts(catalog, { category: "seed" }).length === 2);
  ok("이름으로 검색", MK.filterProducts(catalog, { search: "훔쳐보기" }).length === 1);
  ok("설명으로도 검색", MK.filterProducts(catalog, { search: "100배" }).length >= 1);
  ok("숨김 상품은 안 보인다", MK.filterProducts([prod({ is_visible: false })], {}).length === 0);

  const asc = MK.sortProducts(catalog, "tl-asc").map((p) => p.tl_price);
  ok("TL 낮은순", asc.join() === asc.slice().sort((a, b) => a - b).join(), asc.join());
  ok("TL 높은순 첫 상품이 500 TL", MK.sortProducts(catalog, "tl-desc")[0].tl_price === 500);
  const pop = MK.sortProducts(catalog, "popular").map((p) => p.sort_order);
  ok("인기순은 관리자 노출 순서", pop.join() === pop.slice().sort((a, b) => a - b).join());
}

/* ---------- 상품 상태 ---------- */
{
  ok("판매중은 구매 가능", MK.statusInfo(prod()).buyable === true);
  ok("일시중지는 '판매 준비중'", MK.statusInfo(prod({ status: "paused" })).label === "판매 준비중");
  ok("판매종료는 구매 불가", MK.statusInfo(prod({ status: "ended" })).buyable === false);
  ok("품절 상태는 구매 불가", MK.statusInfo(prod({ status: "soldout" })).buyable === false);
  ok("재고 0이면 품절", MK.statusInfo(prod({ stock: 0 })).label === "품절");
  ok("재고 null 은 무제한", MK.statusInfo(prod({ stock: null })).buyable === true);
  ok("사용기간 표시", MK.durationText(prod()) === "24시간" && MK.durationText(prod({ duration_hours: null })) === "1회 사용");
}

/* =========================================================================
 * 가짜 서버 — purchase_tl_market_item / use_user_item 판정 순서를 그대로
 * ========================================================================= */
function makeServer(opts) {
  const s = {
    loggedIn: opts.loggedIn !== false,
    earned: opts.earned || 0,
    txs: [],
    products: JSON.parse(JSON.stringify(opts.products || [])),
    items: {},         // product_id -> {quantity, ...}
    logs: [],
    account: { balance: opts.balance || 100000, initial_balance: 100000 },
    hasPosition: !!opts.hasPosition,
    now: opts.now || Date.now(),
  };
  s.balance = () => s.earned + s.txs.reduce((a, t) => a + t.amount, 0);

  s.purchase = (pid, qty) => {
    if (!s.loggedIn) return { error: "not_logged_in" };
    if (!qty || qty < 1) return { error: "bad_quantity" };
    const p = s.products.find((x) => x.id === pid);
    if (!p) return { error: "no_product" };
    if (p.status !== "active") return { error: "not_on_sale" };
    if (p.stock !== null && p.stock !== undefined && p.stock < qty) return { error: "out_of_stock" };
    if (p.max_purchase !== null && p.max_purchase !== undefined) {
      const owned = (s.items[pid] && s.items[pid].quantity) || 0;
      const used = s.logs.filter((l) => l.product_id === pid).length;
      if (owned + used + qty > p.max_purchase) return { error: "limit_exceeded" };
    }
    const total = p.tl_price * qty;
    const bal = s.balance();
    if (bal < total) return { error: "insufficient_tl" };
    if (p.stock !== null && p.stock !== undefined) p.stock -= qty;
    if (!s.items[pid]) s.items[pid] = { product_id: pid, product_name: p.name, item_type: p.item_type, effect_value: p.effect_value, duration_hours: p.duration_hours, quantity: 0 };
    s.items[pid].quantity += qty;
    s.txs.push({ type: "spend", amount: -total, balance_after: bal - total, description: "TL 마켓 · " + p.name });
    return { data: { ok: true, spent: total, balance_after: bal - total, quantity: s.items[pid].quantity } };
  };

  s.use = (pid) => {
    if (!s.loggedIn) return { error: "not_logged_in" };
    const it = s.items[pid];
    if (!it || it.quantity < 1) return { error: "no_item" };
    let exp = null;
    if (it.duration_hours) {
      const active = s.logs.some((l) => l.item_type === it.item_type && l.expires_at && l.expires_at > s.now);
      if (active) return { error: "already_active" };
      exp = s.now + it.duration_hours * 3600000;
    }
    let balance = null;
    if (it.item_type === "seed_recharge") {
      s.account.balance += Number(it.effect_value) || 0;
      balance = s.account.balance;
    } else if (it.item_type === "account_reset") {
      if (s.hasPosition) return { error: "has_position" };
      s.account.balance = s.account.initial_balance;
      balance = s.account.balance;
    }
    it.quantity -= 1;
    s.logs.push({ product_id: pid, item_type: it.item_type, effect_value: it.effect_value, expires_at: exp });
    return { data: { ok: true, item_type: it.item_type, effect_value: it.effect_value, expires_at: exp, balance } };
  };
  return s;
}

console.log("\n  구매 / 사용 시나리오");

/* 1) TL 충분할 때 구매 -> 정상 지급 + 정상 차감 */
{
  const srv = makeServer({ earned: 1000, products: catalog });
  const r = srv.purchase("p1", 1);
  ok("TL 충분: 구매 성공", !r.error && r.data.ok, JSON.stringify(r));
  ok("TL 50 차감", srv.balance() === 950, String(srv.balance()));
  ok("아이템 1개 지급", srv.items.p1.quantity === 1);
  ok("TL 거래내역 기록(-50)", srv.txs[0].amount === -50 && /TL 마켓/.test(srv.txs[0].description));
  ok("구매만으로는 효과가 없다(사용 기록 0건)", srv.logs.length === 0);
}

/* 2) TL 부족 */
{
  const srv = makeServer({ earned: 30, products: catalog });
  ok("TL 부족: 서버가 막는다", srv.purchase("p1", 1).error === "insufficient_tl");
  ok("TL 부족: 잔액 그대로", srv.balance() === 30);
  ok("TL 부족: 아이템 미지급", !srv.items.p1);
  const pre = MK.checkPurchase(prod(), 1, 30, 0);
  ok("TL 부족: 화면이 부족액을 알려준다", !pre.ok && pre.short === 20 && pre.need === 50, JSON.stringify(pre));
}

/* 3) 아이템 사용 -> 수량 감소 + 효과 적용 */
{
  const srv = makeServer({ earned: 1000, products: catalog });
  srv.purchase("p1", 2);
  const before = srv.balance();
  const u = srv.use("p1");
  ok("사용 성공", !u.error && u.data.ok);
  ok("수량 2 -> 1", srv.items.p1.quantity === 1);
  ok("사용해도 TL은 안 깎인다", srv.balance() === before, String(srv.balance()));
  ok("사용 기록 남음", srv.logs.length === 1 && srv.logs[0].item_type === "leverage_boost");
  ok("24시간 만료 시각이 생긴다", typeof u.data.expires_at === "number" && u.data.expires_at > srv.now);
  ok("이미 적용 중이면 중복 사용 차단", srv.use("p1").error === "already_active");
  ok("없는 아이템은 사용 불가", srv.use("p6").error === "no_item");
}

/* 4) 시드 충전권 / 재충전 이용권 */
{
  const srv = makeServer({ earned: 5000, products: catalog });
  srv.purchase("p4", 1);
  const u = srv.use("p4");
  ok("시드 충전권: 잔고가 effect_value 만큼 는다", srv.account.balance === 200000, String(srv.account.balance));
  ok("시드 충전권: 서버가 확정 잔고를 돌려준다", u.data.balance === 200000);

  const srv2 = makeServer({ earned: 5000, products: catalog, balance: 12345 });
  srv2.purchase("p3", 1);
  srv2.use("p3");
  ok("재충전 이용권: 초기 시드로 되돌린다", srv2.account.balance === 100000, String(srv2.account.balance));

  const srv3 = makeServer({ earned: 5000, products: catalog, hasPosition: true });
  srv3.purchase("p3", 1);
  ok("포지션 보유 중엔 재충전 불가", srv3.use("p3").error === "has_position");
  ok("막힌 뒤 수량 그대로", srv3.items.p3.quantity === 1);
}

/* 5) 재고 / 구매 제한 / 판매중지 */
{
  const srv = makeServer({ earned: 99999, products: [prod({ stock: 2 })] });
  ok("재고보다 많이 못 산다", srv.purchase("p1", 5).error === "out_of_stock");
  ok("재고만큼은 살 수 있다", !srv.purchase("p1", 2).error);
  ok("재고 0이 되면 더 못 산다", srv.purchase("p1", 1).error === "out_of_stock");

  const srv2 = makeServer({ earned: 99999, products: [prod({ max_purchase: 1 })] });
  ok("1인 1개: 첫 구매 성공", !srv2.purchase("p1", 1).error);
  ok("1인 1개: 두 번째는 차단", srv2.purchase("p1", 1).error === "limit_exceeded");

  const srv3 = makeServer({ earned: 99999, products: [prod({ status: "paused" })] });
  ok("일시중지 상품은 못 산다", srv3.purchase("p1", 1).error === "not_on_sale");
}

/* 6) 중복 구매 요청 */
{
  const srv = makeServer({ earned: 50, products: catalog });
  const a = srv.purchase("p1", 1);
  const b = srv.purchase("p1", 1);
  ok("잔액 딱 맞을 때 첫 요청만 성공", !a.error && b.error === "insufficient_tl");
  ok("TL이 두 번 깎이지 않는다", srv.balance() === 0, String(srv.balance()));
  ok("아이템도 1개만 지급", srv.items.p1.quantity === 1);
}

/* 7) 로그아웃 */
{
  const srv = makeServer({ loggedIn: false, earned: 99999, products: catalog });
  ok("로그아웃: 구매 차단", srv.purchase("p1", 1).error === "not_logged_in");
  ok("로그아웃: 사용 차단", srv.use("p1").error === "not_logged_in");
  ok("로그아웃 안내 문구", /로그인/.test(MK.describeServerError("not_logged_in")));
}

/* 8) 화면 값 조작 */
{
  const srv = makeServer({ earned: 10, products: catalog });
  ok("조작된 가격은 화면 판정만 통과", MK.checkPurchase(prod({ tl_price: 1 }), 1, 10, 0).ok);
  ok("서버는 진짜 가격으로 막는다", srv.purchase("p1", 1).error === "insufficient_tl");
}

/* 9) 적용 중인 효과 판정 */
{
  const future = new Date(Date.now() + 3600000).toISOString();
  const past = new Date(Date.now() - 1000).toISOString();
  ok("만료 전이면 적용 중", !!MK.activeEffect({ timed: [{ item_type: "leverage_boost", expires_at: future, effect_value: 100 }] }, "leverage_boost"));
  ok("만료됐으면 적용 안 됨", !MK.activeEffect({ timed: [{ item_type: "leverage_boost", expires_at: past }] }, "leverage_boost"));
  ok("다른 종류는 안 잡힘", !MK.activeEffect({ timed: [{ item_type: "fee_discount", expires_at: future }] }, "leverage_boost"));
}

/* ---------- 레버리지 게이트 ---------- */
console.log("\n  레버리지 게이트");
{
  const sbx = boot("leverage-gate.js");
  const LG = sbx.App.LeverageGate;
  /* 2026-08-18 지시: 지금은 모두에게 100배를 엽니다.
     나중에 DEFAULT_MAX 를 50 으로 내리면 이용권 구조가 그대로 살아납니다. */
  ok("기본 상한 100배 (현재 운영값)", LG.currentMax() === 100, String(LG.currentMax()));
  LG.setDefaultMax(50);
  ok("설정값을 50으로 내리면 50배 제한", LG.currentMax() === 50, String(LG.currentMax()));
  LG._setBoost(100, new Date(Date.now() + 3600000).toISOString());
  ok("50배 제한에서 이용권 사용 중 100배", LG.currentMax() === 100, String(LG.currentMax()));
  LG._setBoost(100, new Date(Date.now() - 1000).toISOString());
  ok("만료되면 다시 50배", LG.currentMax() === 50, String(LG.currentMax()));
  LG._setBoost(20, new Date(Date.now() + 3600000).toISOString());
  ok("기본보다 낮은 값으로는 안 내려간다", LG.currentMax() === 50, String(LG.currentMax()));
  LG.setDefaultMax(100);

  const gate = fs.readFileSync(path.join(REPO, "js", "leverage-gate.js"), "utf8");
  ok("App.Trading.setLeverage 를 감싼다", /App\.Trading\.setLeverage = function/.test(gate));
  ok("보유 포지션을 건드리지 않는다(청산/종료 호출 없음)", !/closePosition|closePartial/.test(gate));
  ok("상한 여부는 서버 RPC 로 확인", /rpc\("active_user_effects"\)/.test(gate));
}

/* ---------- 구조 / 보안 / 디자인 ---------- */
console.log("\n  구조·보안·디자인");
{
  const js = fs.readFileSync(path.join(REPO, "js", "tl-market.js"), "utf8");
  const sql = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-market.sql"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  const sqlCode = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");

  ok("구매는 서버 RPC 로만", /rpc\("purchase_tl_market_item"/.test(js));
  ok("사용도 서버 RPC 로만", /rpc\("use_user_item"/.test(js));
  ok("클라이언트가 가격을 보내지 않는다", /p_product_id: product\.id, p_quantity: quantity/.test(js));
  ok("프론트에서 수량을 직접 깎지 않는다", !/quantity\s*-=|quantity\s*=\s*quantity\s*-/.test(js));
  ok("SQL 이 잔액을 직접 계산", /bal := public\.tl_balance\(uid\)/.test(sqlCode));
  ok("SQL 이 사용자 행을 잠근다(중복 차감 방지)", /trading_accounts where user_id = uid for update/.test(sqlCode));
  ok("SQL 이 상품 행도 잠근다", /tl_market_products where id = p_product_id for update/.test(sqlCode));
  ok("보관함 INSERT 정책 없음(함수로만)", !/create policy[^;]*user_items[^;]*for insert/i.test(sqlCode));

  ["tl_market_products", "user_items", "item_usage_logs"].forEach((t) => {
    ok("테이블 생성: " + t, new RegExp("create table if not exists public\\." + t).test(sqlCode));
  });
  ok("TL 거래내역은 기존 테이블 재사용(중복 생성 안 함)", !/create table if not exists public\.tl_transactions/.test(sqlCode) && /insert into public\.tl_transactions/.test(sqlCode));
  ok("핫딜 테이블을 건드리지 않는다", !/tl_products\b/.test(sqlCode) && !/tl_purchases/.test(sqlCode));
  ok("기존 테이블을 지우지 않는다", !/\b(drop\s+table|truncate)\b/i.test(sqlCode));
  ok("관리자 확장용 컬럼이 다 있다", ["tl_price", "item_type", "effect_value", "duration_hours", "stock", "status", "max_purchase", "is_visible"].every((c) => new RegExp("\\b" + c + "\\b").test(sqlCode)));
  ok("가격을 코드에 박지 않았다", !/50 TL|100 TL|200 TL|300 TL|250 TL|500 TL/.test(js));

  ok("마켓 페이지 마크업 존재", /id="page-market"/.test(html));
  ok("메뉴가 실제 페이지로 연결", /id="page-nav-market" data-page="market"/.test(html));
  ok("메뉴 이름이 TL 마켓", /TL 마켓/.test(html));
  ok("'벅스' 표기를 쓰지 않는다", !/벅스/.test(js) && !/벅스/.test(sql));
  ok("스크립트 연결됨", /js\/tl-market\.js/.test(html) && /js\/leverage-gate\.js/.test(html));
  ok("상품을 HTML 에 하드코딩하지 않았다", !/레버리지 x100배 이용권/.test(html));

  ok("핫딜 카드 스타일을 재사용한다", /class="hd-card mk-card/.test(js));
  ok("새 색을 만들지 않고 기존 변수 사용", /\.mk-icon\{[^}]*color:var\(--gold\)/.test(css));
  ok("다크모드 자동 대응(배경이 변수)", /\.mk-active\{[\s\S]*?background:var\(--surface2\)/.test(css));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
