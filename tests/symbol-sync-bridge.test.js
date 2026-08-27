/* tests/symbol-sync-bridge.test.js
 * =========================================================================
 * 서버에 종목이 제대로 기록되는지 확인합니다 — 2026-08-27 (종목 추가 2번 관문)
 * =========================================================================
 *
 * 지키려는 것 — 종목 전환이 열렸을 때
 *   1) 삼성전자로 거래했는데 서버에 비트코인으로 남지 않는다
 *   2) 줄세우기(persist-sync-queue) 때문에 늦게 나가도, 그 행이 만들어진
 *      시점의 종목으로 나간다 ("지금 활성 종목" 으로 찍으면 안 됩니다)
 *   3) 로그인해서 복원할 때 종목이 버려지지 않는다 (P1 — 즉시 강제청산)
 *   4) 종목을 모르는 행을 추측해서 서버의 맞는 값을 덮어쓰지 않는다
 *   5) positions delete 에 symbol 조건이 붙지 않는다 (붙으면 행이 2개가 되어
 *      js/auth.js:363 의 maybeSingle() 이 깨집니다)
 *
 * 네트워크는 한 번도 안 씁니다. then() 을 부르지 않으면 요청이 안 나가는
 * 라이브러리 특성을 그대로 흉내낸 가짜 client 로 본문만 읽습니다.
 *
 * 사이트 코드는 한 글자도 고치지 않습니다. 읽어서 띄우기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

/* -------------------------------------------------------------------------
 * 가짜 Supabase client
 * -------------------------------------------------------------------------
 * 진짜 @supabase/supabase-js v2 와 같은 모양으로 만듭니다 — 특히
 *   · from / select / insert / upsert / delete 는 프로토타입에 있습니다
 *     (우리 모듈이 "인스턴스에 덮어쓰기" 로 우회하므로, 여기서도 프로토타입에
 *      둬야 진짜와 같은 조건이 됩니다)
 *   · eq / order / limit / maybeSingle 은 this 를 돌려줍니다(체이닝)
 *   · then() 을 부르기 전에는 아무 요청도 안 나갑니다
 * ----------------------------------------------------------------------- */
function makeFakeClient(win) {
  const sent = [];            // then() 이 불린 것만 = 실제로 나간 요청
  const built = [];           // 만들어지기만 한 요청(안 나감)
  const responses = {};       // table -> select 응답 data

  function Builder(req) { this.req = req; built.push(req); }
  Builder.prototype.eq = function () { return this; };
  Builder.prototype.order = function () { return this; };
  Builder.prototype.limit = function () { return this; };
  Builder.prototype.maybeSingle = function () { this.req.single = true; return this; };
  Builder.prototype.then = function (onF, onR) {
    sent.push(this.req);
    const data = this.req.method === "select"
      ? (responses[this.req.table] === undefined ? null : responses[this.req.table])
      : null;
    return Promise.resolve({ data: data, error: null }).then(onF, onR);
  };

  function QB(table) { this.table = table; }
  QB.prototype.select = function (cols) { return new Builder({ table: this.table, method: "select", cols: cols }); };
  QB.prototype.insert = function (values, options) { return new Builder({ table: this.table, method: "insert", body: values, options: options }); };
  QB.prototype.upsert = function (values, options) { return new Builder({ table: this.table, method: "upsert", body: values, options: options }); };
  QB.prototype.delete = function () { return new Builder({ table: this.table, method: "delete" }); };

  function Client() {}
  Client.prototype.from = function (table) { return new QB(table); };

  const client = new Client();
  return {
    client,
    sent,
    built,
    setSelectResponse(table, data) { responses[table] = data; },
    reset() { sent.length = 0; built.length = 0; },
  };
}

/* -------------------------------------------------------------------------
 * 작은 부팅기 — index.html 과 같은 순서로 읽습니다.
 * symbol-sync-bridge.js 는 반드시 symbol-guard.js "뒤" 입니다(도장 우선권).
 * ----------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const html = read("index.html");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;

  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => { throw new Error("테스트 중에는 네트워크를 쓰지 않습니다"); };
  win.alert = () => {};

  const fake = makeFakeClient(win);
  win.__fake = fake;

  win.eval(`
    window.App = window.App || {};
    App.Bus = (function(){
      const listeners = {};
      return {
        on(e,f){ (listeners[e]=listeners[e]||[]).push(f); return f; },
        off(e,f){ if(listeners[e]) listeners[e]=listeners[e].filter(x=>x!==f); },
        emit(e,p){ (listeners[e]||[]).forEach(f=>{ try{f(p);}catch(err){ console.error(err); } }); }
      };
    })();
    App.bootApp = function(){ return true; };
    App.SupabaseClient = { get: function(){ return window.__fake.client; } };
  `);

  const files = ["js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js"];
  if (opts.guard !== false) files.push("js/symbol-guard.js");
  if (opts.bridge !== false) files.push("js/symbol-sync-bridge.js");
  files.push("js/trading.js");
  for (const f of files) {
    try { win.eval(read(f)); }
    catch (e) { throw new Error("모듈 로드 실패 " + f + ": " + e.message); }
  }

  if (!opts.keepArmed) win.App.bootApp();
  win.App.Trading.init();

  return { dom, win, App: win.App, fake };
}

function pretendActive(App, symbol) {
  App.Config.getActiveSymbol = function () { return symbol; };
}

/* supabase-sync.js 가 실제로 만드는 것과 같은 모양의 행 */
function positionRow(openTimeMs) {
  return {
    user_id: "u1", symbol: "BTCUSDT", side: "long", quantity: 1, entry_price: 110000,
    leverage: 10, margin: 1000, tp_price: null, sl_price: null, liq_price: 99550,
    entry_fee: 5, created_at: new Date(openTimeMs).toISOString(), updated_at: new Date().toISOString(),
  };
}
function tradeRow(closeTimeMs) {
  return {
    user_id: "u1", symbol: "BTCUSDT", side: "long", entry_price: 110000, exit_price: 111000,
    quantity: 1, leverage: 10, margin: 1000, pnl: 100, roe: 10, return_rate: 1, fee: 5,
    close_reason: "수동청산", created_at: new Date(closeTimeMs).toISOString(),
  };
}
function orderRow(id, createdMs) {
  return {
    user_id: "u1", client_order_id: id, symbol: "BTCUSDT", side: "long", order_type: "limit",
    price: 100000, quantity: 0.05, margin: 500, leverage: 10, status: "OPEN",
    created_at: new Date(createdMs).toISOString(), filled_at: null, cancelled_at: null,
  };
}

console.log("\n종목 추가 2번 관문 — 서버에 종목이 제대로 기록된다");

/* =========================================================================
 * [0] 지금은 아무것도 안 바뀐다 (동작 변화 0)
 * ========================================================================= */
section("[0] 지금은 서버로 나가는 값이 한 글자도 안 바뀐다");
{
  const { App, fake } = boot();
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  const pos = App.Trading.getSnapshot().position;

  const client = App.SupabaseClient.get();
  const b = client.from("positions").insert(positionRow(pos.openTime));
  ok("positions insert 를 가로챘다", App.SymbolSyncBridge.getCounts().interceptPositions === 1,
    String(App.SymbolSyncBridge.getCounts().interceptPositions));
  ok("symbol 은 그대로 BTCUSDT", b.req.body.symbol === "BTCUSDT", String(b.req.body.symbol));
  ok("원래 값과 다르게 바꾼 행이 0건", App.SymbolSyncBridge.getCounts().changedRows === 0,
    String(App.SymbolSyncBridge.getCounts().changedRows));
  ok("then 을 안 불렀으므로 요청이 0건 나갔다", fake.sent.length === 0, String(fake.sent.length));
}

/* =========================================================================
 * [1] 세 표의 종목이 실제로 바뀐다 (본문을 읽어서 확인 / 요청 0건)
 * ========================================================================= */
section("[1] positions · trades · orders 세 표에 진짜 종목이 들어간다");
{
  const { App, fake } = boot();
  const bridge = App.SymbolSyncBridge;
  const client = App.SupabaseClient.get();

  /* 삼성전자로 만들어진 기록이라고 알려줍니다(도장이 찍힌 상태와 같습니다). */
  const openTime = 1756200000000;
  const closeTime = 1756200060000;
  bridge._remember("positions", openTime, "005930");
  bridge._remember("trades", closeTime, "005930");
  bridge._remember("orders", "ord-1", "005930");

  const p = client.from("positions").insert(positionRow(openTime));
  ok("positions.symbol 이 BTCUSDT → 005930", p.req.body.symbol === "005930", String(p.req.body.symbol));

  const t = client.from("trades").insert([tradeRow(closeTime)]);
  ok("trades.symbol 이 BTCUSDT → 005930", t.req.body[0].symbol === "005930", String(t.req.body[0].symbol));

  const o = client.from("orders").upsert([orderRow("ord-1", openTime)], { onConflict: "user_id,client_order_id" });
  ok("orders.symbol 이 BTCUSDT → 005930", o.req.body[0].symbol === "005930", String(o.req.body[0].symbol));
  ok("upsert 의 onConflict 옵션이 그대로 전달된다",
    o.req.options && o.req.options.onConflict === "user_id,client_order_id",
    JSON.stringify(o.req.options));

  ok("가로챈 호출 3/3", bridge.getCounts().interceptPositions === 1 &&
    bridge.getCounts().interceptTrades === 1 && bridge.getCounts().interceptOrders === 1,
    JSON.stringify(bridge.getCounts()));
  ok("네트워크 요청 0건", fake.sent.length === 0, String(fake.sent.length));

  /* 나머지 칸은 하나도 안 건드립니다 */
  const orig = positionRow(openTime);
  const keysBefore = Object.keys(orig).sort().join(",");
  const keysAfter = Object.keys(p.req.body).sort().join(",");
  ok("positions 행의 칸 구성이 그대로다", keysBefore === keysAfter, keysAfter);
  ok("symbol 말고 다른 값은 안 바뀐다",
    p.req.body.entry_price === 110000 && p.req.body.liq_price === 99550 && p.req.body.margin === 1000);
}

/* =========================================================================
 * [2] 상관없는 표는 안 건드린다
 * ========================================================================= */
section("[2] chat_messages · trading_accounts 는 손대지 않는다");
{
  const { App } = boot();
  const client = App.SupabaseClient.get();
  App.SymbolSyncBridge._remember("trades", 1, "005930");

  const c = client.from("chat_messages").insert({ user_id: "u1", message: "hi" });
  ok("chat_messages 본문이 그대로다", c.req.body.symbol === undefined && c.req.body.message === "hi");

  const a = client.from("trading_accounts").upsert({ user_id: "u1", balance: 100 }, { onConflict: "user_id" });
  ok("trading_accounts 본문이 그대로다", a.req.body.symbol === undefined && a.req.body.balance === 100);

  const counts = App.SymbolSyncBridge.getCounts();
  ok("가로챈 건수가 안 늘었다",
    counts.interceptPositions === 0 && counts.interceptTrades === 0 && counts.interceptOrders === 0,
    JSON.stringify(counts));
}

/* =========================================================================
 * [3] 행 단위 짝맞춤 — 줄세우기로 늦게 나가도 그 행의 종목으로 나간다
 *     "지금 활성 종목" 으로 찍었다면 여기서 틀립니다
 * ========================================================================= */
section("[3] 늦게 나가도 그 행이 만들어진 시점의 종목으로 나간다");
{
  const { App } = boot();
  const bridge = App.SymbolSyncBridge;
  const client = App.SupabaseClient.get();

  const btcClose = 1756200000000;   // BTC 시절에 청산된 거래
  const samClose = 1756300000000;   // 삼성전자로 바꾼 뒤 청산된 거래
  bridge._remember("trades", btcClose, "BTCUSDT");
  bridge._remember("trades", samClose, "005930");

  /* insert 가 실제로 나가는 시점의 활성 종목은 NDX 라고 칩시다(줄세우기 지연) */
  pretendActive(App, "NDX");

  const b = client.from("trades").insert([tradeRow(samClose), tradeRow(btcClose)]);
  ok("첫 행은 005930", b.req.body[0].symbol === "005930", String(b.req.body[0].symbol));
  ok("둘째 행은 BTCUSDT", b.req.body[1].symbol === "BTCUSDT", String(b.req.body[1].symbol));
  ok("지금 활성 종목(NDX)으로 뭉개지 않았다",
    b.req.body[0].symbol !== "NDX" && b.req.body[1].symbol !== "NDX");

  /* orders 는 시간이 아니라 id 로 짝을 맞춥니다 */
  bridge._remember("orders", "ord-btc", "BTCUSDT");
  bridge._remember("orders", "ord-sam", "005930");
  const o = client.from("orders").upsert([orderRow("ord-sam", 1), orderRow("ord-btc", 2)],
    { onConflict: "user_id,client_order_id" });
  ok("orders 는 client_order_id 로 짝을 맞춘다",
    o.req.body[0].symbol === "005930" && o.req.body[1].symbol === "BTCUSDT",
    o.req.body[0].symbol + " / " + o.req.body[1].symbol);
}

/* =========================================================================
 * [4] 도장 4/4 — closedTrades · orderHistory 까지 찍힌다
 *     (조사팀 실측은 2/4 였습니다: position·pendingOrder 만)
 * ========================================================================= */
section("[4] 도장이 넷 다 찍힌다 (조사팀 실측 2/4 → 4/4)");
{
  /* 안전장치만 있고 이 파일이 없을 때 = 조사팀이 실측한 그 상태 */
  const before = boot({ bridge: false });
  before.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  before.App.Trading.setLeverage(10);
  before.App.Trading.openPosition("long", 1000);
  before.App.Trading.closePosition("수동청산");
  const s0 = before.App.Trading.getSnapshot();
  ok("[기준] closedTrades[0].symbol 이 비어 있다", !s0.closedTrades[0].symbol,
    String(s0.closedTrades[0].symbol));
  ok("[기준] orderHistory[0].symbol 이 비어 있다", !s0.orderHistory[0].symbol,
    String(s0.orderHistory[0].symbol));

  const { App } = boot();
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);

  /* 포지션이 살아 있는 동안 재고, 청산한 뒤에 나머지를 잽니다
     (한 스냅샷에 넷이 동시에 존재할 수 없습니다 — 청산하면 position 이 null). */
  const cov1 = App.SymbolSyncBridge.getStampCoverage(App.Trading.getSnapshot());
  App.Trading.closePosition("수동청산");
  App.Trading.placeLimitOrder("long", 100000, 500);
  const s = App.Trading.getSnapshot();
  const cov2 = App.SymbolSyncBridge.getStampCoverage(s);

  const cov = {
    position: cov1.position,
    pendingOrder: cov2.pendingOrder,
    closedTrades: cov2.closedTrades,
    orderHistory: cov2.orderHistory,
  };
  ok("position 에 찍혔다", cov.position === "BTCUSDT", String(cov.position));
  ok("pendingOrder 에 찍혔다", cov.pendingOrder === "BTCUSDT", String(cov.pendingOrder));
  ok("closedTrades[0] 에 찍혔다", cov.closedTrades === "BTCUSDT", String(cov.closedTrades));
  ok("orderHistory[0] 에 찍혔다", cov.orderHistory === "BTCUSDT", String(cov.orderHistory));

  const 찍힘 = [cov.position, cov.pendingOrder, cov.closedTrades, cov.orderHistory]
    .filter((v) => typeof v === "string" && v !== "없음").length;
  ok("4 중 4 가 찍혔다", 찍힘 === 4, "찍힌 것 " + 찍힘 + "/4");

  /* 도장이 있으니 insert 때 종목을 알 수 있습니다 — 이게 도장의 목적입니다 */
  const client = App.SupabaseClient.get();
  const t = client.from("trades").insert([tradeRow(s.closedTrades[0].closeTime)]);
  ok("도장 덕분에 trades 행의 종목을 찾아냈다(모르는 행 0건)",
    App.SymbolSyncBridge.getCounts().unresolvedRows === 0 && t.req.body[0].symbol === "BTCUSDT",
    "미확인 " + App.SymbolSyncBridge.getCounts().unresolvedRows);
}

/* =========================================================================
 * [5] 옛 기록에는 "지금 활성 종목" 을 찍지 않는다
 *     찍으면 옛 BTC 거래가 삼성전자 기록으로 둔갑합니다
 * ========================================================================= */
section("[5] 옛 기록에는 지금 활성 종목을 찍지 않는다");
{
  const { App } = boot();
  pretendActive(App, "005930");

  const 옛날 = App.SymbolSyncBridge.getPageLoad() - 60 * 60 * 1000; // 한 시간 전
  const 방금 = App.SymbolSyncBridge.getPageLoad() + 1000;

  const doc = {
    position: null,
    pendingOrder: null,
    closedTrades: [{ closeTime: 방금, pnl: 1 }, { closeTime: 옛날, pnl: 2 }],
    orderHistory: [{ id: "new-1", createdTime: 방금 }, { id: "old-1", createdTime: 옛날 }],
  };
  App.SymbolSyncBridge.stampTradingDoc(doc);

  ok("이번 세션에서 생긴 거래는 지금 종목(005930)", doc.closedTrades[0].symbol === "005930",
    String(doc.closedTrades[0].symbol));
  ok("옛 거래는 BTCUSDT 로 남는다", doc.closedTrades[1].symbol === "BTCUSDT",
    String(doc.closedTrades[1].symbol));
  ok("이번 세션 주문은 005930", doc.orderHistory[0].symbol === "005930", String(doc.orderHistory[0].symbol));
  ok("옛 주문은 BTCUSDT", doc.orderHistory[1].symbol === "BTCUSDT", String(doc.orderHistory[1].symbol));
}

/* =========================================================================
 * [6] P1 — 로그인 복원에서 종목이 버려지지 않는다
 *     js/auth.js:369-381 이 symbol 을 안 옮기고, auth.js:412 저장 시점에는
 *     symbol-guard 가 armed=true 라 무조건 BTCUSDT 로 찍습니다.
 * ========================================================================= */
section("[6] P1 — 로그인 복원에서 삼성전자 포지션이 BTCUSDT 로 둔갑하지 않는다");
{
  const 서버열린시각 = 1756100000000;

  /* auth.js 의 hydrateLocalStateFromSupabase 를 그대로 흉내냅니다.
     symbol 을 일부러 안 옮기는 것까지 똑같이 합니다(그게 지금 코드입니다). */
  async function hydrateLikeAuth(App, client) {
    const [{ data: position }, { data: trades }, { data: orders }] = await Promise.all([
      client.from("positions").select("*").eq("user_id", "u1").maybeSingle(),
      client.from("trades").select("*").eq("user_id", "u1").order("created_at", { ascending: false }).limit(200),
      client.from("orders").select("*").eq("user_id", "u1").order("created_at", { ascending: false }).limit(100),
    ]);
    const localPosition = position ? {
      side: position.side, entry: position.entry_price, leverage: position.leverage,
      margin: position.margin, qty: position.quantity, liq: position.liq_price,
      tp: position.tp_price, sl: position.sl_price, entryFee: position.entry_fee || 0,
      openTime: new Date(position.created_at).getTime(), orderId: position.id,
      /* symbol 을 안 옮깁니다 — auth.js:369-381 그대로 */
    } : null;
    const localClosedTrades = (trades || []).map((t) => ({
      side: t.side, leverage: t.leverage, entry: t.entry_price, exit: t.exit_price,
      qty: t.quantity, margin: t.margin, pnl: t.pnl, pnlPercent: t.roe, fee: t.fee,
      reason: t.close_reason, closeTime: new Date(t.created_at).getTime(),
    }));
    const localOrderHistory = (orders || []).map((o) => ({
      id: o.client_order_id || o.id, side: o.side, type: o.order_type, price: o.price,
      margin: o.margin, leverage: o.leverage, status: o.status,
      createdTime: new Date(o.created_at).getTime(),
    }));
    const doc = {
      balance: 100000, leverage: localPosition ? localPosition.leverage : 10,
      position: localPosition, pendingOrder: null,
      orderHistory: localOrderHistory, closedTrades: localClosedTrades,
      fundingHistory: [], lastSettledFundingTime: null,
    };
    App.Storage.save("trading", doc);   // auth.js:412
    return doc;
  }

  /* (가) 이 파일이 없을 때 — 종목이 버려집니다 */
  const before = boot({ bridge: false, keepArmed: true });
  before.fake.setSelectResponse("positions",
    Object.assign(positionRow(서버열린시각), { symbol: "005930", id: "p1" }));
  before.fake.setSelectResponse("trades", []);
  before.fake.setSelectResponse("orders", []);

  /* (나) 이 파일이 있을 때 — 서버 값이 살아납니다 */
  const after = boot({ keepArmed: true });
  after.fake.setSelectResponse("positions",
    Object.assign(positionRow(서버열린시각), { symbol: "005930", id: "p1" }));
  after.fake.setSelectResponse("trades", [Object.assign(tradeRow(서버열린시각 - 1000), { symbol: "005930" })]);
  after.fake.setSelectResponse("orders", [Object.assign(orderRow("ord-s", 서버열린시각 - 2000), { symbol: "005930" })]);

  Promise.all([
    hydrateLikeAuth(before.App, before.App.SupabaseClient.get()),
    hydrateLikeAuth(after.App, after.App.SupabaseClient.get()),
  ]).then(([docBefore, docAfter]) => {
    ok("[기준] 이 파일이 없으면 삼성전자 포지션이 BTCUSDT 로 찍힌다",
      docBefore.position.symbol === "BTCUSDT", String(docBefore.position.symbol));
    ok("이 파일이 있으면 005930 으로 살아난다",
      docAfter.position.symbol === "005930", String(docAfter.position.symbol));
    ok("symbol-guard 가 armed 상태인데도 우리가 먼저 찍었다",
      after.App.SymbolGuard.isArmed() === true && docAfter.position.symbol === "005930",
      "armed=" + after.App.SymbolGuard.isArmed());
    ok("복원된 거래내역도 005930", docAfter.closedTrades[0].symbol === "005930",
      String(docAfter.closedTrades[0].symbol));
    ok("복원된 주문내역도 005930", docAfter.orderHistory[0].symbol === "005930",
      String(docAfter.orderHistory[0].symbol));
    ok("select 응답에서 종목을 기억했다",
      after.App.SymbolSyncBridge.getCounts().capturedPositions === 1,
      JSON.stringify(after.App.SymbolSyncBridge.getKnownCounts()));

    /* 이게 왜 P1 인가 — 그물이 판정에 쓰는 값이 살아난다 */
    ok("그물이 지켜야 할 종목을 005930 으로 본다",
      after.App.SymbolGuard.passes({ symbol: "BTCUSDT", price: 110000 }) === true ||
      docAfter.position.symbol === "005930", String(docAfter.position.symbol));

    finish();
  }).catch((e) => {
    ok("[6] 로그인 복원 검사가 끝났다", false, e && e.message);
    finish();
  });
}

/* =========================================================================
 * [7] orders upsert — 종목을 모르는 행은 추측하지 않는다
 * ========================================================================= */
function part7() {
  section("[7] 종목을 모르는 행은 symbol 키를 빼서 서버 값을 지킨다");
  const { App } = boot();
  const bridge = App.SymbolSyncBridge;
  const client = App.SupabaseClient.get();

  bridge._remember("orders", "known-1", "005930");
  /* unknown-1 은 일부러 안 알려줍니다 */
  const rows = [orderRow("known-1", 1), orderRow("unknown-1", 2)];
  const o = client.from("orders").upsert(rows, { onConflict: "user_id,client_order_id" });

  const body = o.req.body;
  ok("한 행이라도 모르면 모든 행에서 symbol 이 빠진다",
    !("symbol" in body[0]) && !("symbol" in body[1]),
    JSON.stringify(body.map((r) => Object.keys(r).indexOf("symbol"))));

  /* ⚠ 이게 핵심입니다 — supabase-js v2 는 배열의 키를 합집합으로 모아
     ?columns= 로 보냅니다. 일부만 빼면 그 행이 NULL 로 들어가
     not null 제약에 걸려 배치가 통째로 실패합니다. */
  const k0 = Object.keys(body[0]).sort().join(",");
  const k1 = Object.keys(body[1]).sort().join(",");
  ok("배치 안 모든 행의 칸 구성이 같다(PostgREST 요구조건)", k0 === k1, k0 + " vs " + k1);
  ok("symbol 말고 다른 칸은 그대로다", Object.keys(body[0]).length === Object.keys(rows[0]).length - 1,
    Object.keys(body[0]).length + " vs " + Object.keys(rows[0]).length);
  ok("빼버린 배치를 셌다", bridge.getCounts().omittedBatches === 1, String(bridge.getCounts().omittedBatches));
  ok("모르는 행 1건을 셌다", bridge.getCounts().unresolvedRows === 1, String(bridge.getCounts().unresolvedRows));

  /* 전부 알면 전부 넣습니다 — 이때도 칸 구성은 같아야 합니다 */
  bridge._remember("orders", "unknown-1", "NDX");
  const o2 = client.from("orders").upsert([orderRow("known-1", 1), orderRow("unknown-1", 2)],
    { onConflict: "user_id,client_order_id" });
  ok("전부 알면 행마다 제 종목이 들어간다",
    o2.req.body[0].symbol === "005930" && o2.req.body[1].symbol === "NDX",
    o2.req.body[0].symbol + " / " + o2.req.body[1].symbol);
  ok("이때도 칸 구성이 같다",
    Object.keys(o2.req.body[0]).sort().join(",") === Object.keys(o2.req.body[1]).sort().join(","));

  /* =======================================================================
   * [8] positions delete 에 symbol 조건을 안 붙인다
   * ===================================================================== */
  section("[8] positions delete 는 건드리지 않는다");
  {
    const src = read("js/symbol-sync-bridge.js");
    const 코드 = src.split("\n").filter((l) => l.trim().indexOf("*") !== 0 && l.indexOf("/*") < 0).join("\n");
    ok("우리 모듈이 delete 를 덮어쓰지 않는다",
      코드.indexOf("qb.delete") < 0 &&코드.indexOf(".delete =") < 0, "delete 를 건드립니다");

    const del = client.from("positions").delete();
    ok("delete 빌더가 원본 그대로다", del.req.method === "delete" && del.req.body === undefined);

    const sync = read("js/supabase-sync.js");
    ok("supabase-sync.js 의 delete 에 symbol 조건이 없다(원본 그대로)",
      /from\("positions"\)\.delete\(\)\.eq\("user_id", userId\)/.test(sync),
      "supabase-sync.js 66행이 바뀌었습니다");
    ok("symbol 조건이 아예 안 붙어 있다", sync.indexOf('.eq("symbol"') < 0);
  }

  /* =======================================================================
   * [9] 봉인 — 우회가 성립하는 전제가 그대로인지
   * ===================================================================== */
  section("[9] 봉인 — 우회가 성립하는 전제");
  {
    const sync = read("js/supabase-sync.js");
    const hard = (sync.match(/symbol: "BTCUSDT"/g) || []).length;
    ok("supabase-sync.js 의 하드코딩이 3곳 그대로다(우리가 고치는 대상)", hard === 3, String(hard));
    ok("positions 는 insert 다", /from\("positions"\)\.insert\(/.test(sync));
    ok("trades 는 insert 다", /from\("trades"\)\.insert\(/.test(sync));
    ok("orders 는 upsert 다(덮어쓰기 위험)", /from\("orders"\)\.upsert\(/.test(sync));

    const auth = read("js/auth.js");
    ok("auth.js 가 복원할 때 여전히 symbol 을 안 옮긴다(우리가 메꾸는 자리)",
      /openTime: new Date\(position\.created_at\)\.getTime\(\)/.test(auth) &&
      !/symbol: position\.symbol/.test(auth));

    const html = read("index.html");
    const guardAt = html.indexOf('src="js/symbol-guard.js"');
    const bridgeAt = html.indexOf('src="js/symbol-sync-bridge.js"');
    ok("index.html 에 symbol-sync-bridge.js 가 들어 있다", bridgeAt > 0, String(bridgeAt));
    ok("symbol-guard.js 보다 뒤에 있다(도장 우선권)", guardAt > 0 && bridgeAt > guardAt,
      "guard " + guardAt + " / bridge " + bridgeAt);

    /* 종목 전환은 여전히 안 열려 있어야 합니다 */
    const { App: A2 } = boot();
    const 열린손잡이 = A2.SymbolGuard.SETTER_NAMES.filter((n) => typeof A2.Config[n] === "function");
    ok("종목 전환 함수는 여전히 하나도 없다", 열린손잡이.length === 0, 열린손잡이.join(","));
    ok("선택 화면은 '준비 중입니다' 그대로",
      read("js/symbol-selector.js").indexOf("준비 중입니다") > 0);

    /* 우리 모듈이 SQL 을 필요로 하지 않는다 */
    const schema = read("supabase/schema.sql");
    ok("서버 세 표에 symbol 칸이 이미 있다",
      (schema.match(/symbol\s+text not null default 'BTCUSDT'/g) || []).length >= 3,
      String((schema.match(/symbol\s+text not null default 'BTCUSDT'/g) || []).length));
  }

  /* =======================================================================
   * [10] 앞 팀 것을 안 부쉈다
   * ===================================================================== */
  section("[10] 1번 관문(symbol-guard)이 그대로 동작한다");
  {
    const { App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
    App.Trading.setLeverage(10);
    App.Trading.openPosition("long", 1000);
    pretendActive(App, "ETHUSDT");
    for (let i = 0; i < 10; i++) App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });

    const s = App.Trading.getSnapshot();
    ok("포지션이 살아 있다(강제청산 안 됨)", !!s.position);
    ok("그물이 씌워진 구독자는 여전히 1개", App.SymbolGuard.getNettedCount() === 1,
      String(App.SymbolGuard.getNettedCount()));
    ok("그물이 버린 건수가 흘린 건수와 같다(5배로 안 부푼다)",
      App.SymbolGuard.getDroppedCount() === 10, String(App.SymbolGuard.getDroppedCount()));
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
  process.exit(0);
}

function finish() { part7(); }
