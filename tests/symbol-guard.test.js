/* tests/symbol-guard.test.js
 * =========================================================================
 * 종목 전환 안전장치(js/symbol-guard.js)가 실제로 막는지 확인합니다 — 2026-08-26
 * =========================================================================
 *
 * 지키려는 것 — 종목이 바뀌어도 다른 종목 시세로 강제청산되지 않는다.
 *
 *   조사팀 재현(2026-08-26, 확신도: 확실)
 *     BTC 110,000 에 10배 롱(증거금 1,000, 청산가 99,550)
 *     → 활성 종목만 ETHUSDT 로 바꾸고 ETH 시세 3,000 한 틱
 *     → 강제청산. 손익 -1,000 / ROE -100% / 잔고 100,000 → 98,995
 *
 *   이 파일은 같은 상황을 안전장치 있음/없음 두 벌로 돌려서 숫자를 비교합니다.
 *
 * 다섯 구멍을 각각 봅니다.
 *   ① 미체결 주문만 있는 사람      → [3]
 *   ② 로그인 복원(서버에서 온 것)  → [7]
 *   ③ 다른 탭                      → [8]
 *   ④ 종목 UI 두 곳                → [9]
 *   ⑤ 늦게 터짐(재연결 때)         → [6] 에서 100틱을 계속 흘려봅니다
 *
 * ⚠ 사이트 코드는 한 글자도 고치지 않습니다. 읽어서 띄우기만 합니다.
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
 * 작은 부팅기 — tests/harness.js 와 같은 방식이되, 안전장치를 켜고 끌 수
 * 있게 만들었습니다(있음/없음 비교를 해야 해서 harness 를 그대로 못 씁니다).
 * 순서가 중요합니다: symbol-guard.js 는 trading.js 가 price:update 를
 * 구독하기 전에 읽혀야 합니다(index.html 도 같은 순서로 넣었습니다).
 * ----------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const withGuard = opts.guard !== false;
  const html = read("index.html");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;

  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.__alerts = [];
  win.alert = (m) => { win.__alerts.push(m); win.__lastAlert = m; };

  /* main.js 와 동일한 App.Bus + App.bootApp 자리(안전장치가 복원 구간을
     구분할 때 App.bootApp 을 감쌉니다). */
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
  `);

  const files = ["js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js"];
  if (withGuard) files.push("js/symbol-guard.js");
  files.push("js/trading.js");
  for (const f of files) {
    try { win.eval(read(f)); }
    catch (e) { throw new Error("모듈 로드 실패 " + f + ": " + e.message); }
  }

  /* 실제 부팅과 같은 순서: 복원 구간이 끝났다고 알린 뒤 Trading.init() */
  if (!opts.keepArmed) win.App.bootApp();
  win.App.Trading.init();
  if (withGuard && win.App.SymbolGuard) win.App.SymbolGuard.armUi();

  return { dom, win, App: win.App, doc: win.document };
}

/* 활성 종목이 바뀐 상황을 흉내냅니다 — 지금은 종목을 바꾸는 함수가 없으므로
   "문이 열렸다면" 을 이렇게 만듭니다(config.js 는 손대지 않습니다). */
function pretendActive(App, symbol) {
  App.Config.getActiveSymbol = function () { return symbol; };
}

function openLong(App, price, margin, leverage) {
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  App.Trading.setLeverage(leverage);
  return App.Trading.openPosition("long", margin);
}

console.log("\n종목 전환 안전장치 — 다른 종목 시세로 청산되지 않는다");

/* =========================================================================
 * [0] 안전장치가 없을 때 실제로 터진다 (비교 기준)
 * ========================================================================= */
section("[0] 안전장치 없음 — 조사팀 재현이 그대로 재현된다");
let 기준_총자산 = null;
{
  const { App } = boot({ guard: false });
  const 시작잔고 = App.Trading.getSnapshot().balance;
  const opened = openLong(App, 110000, 1000, 10);
  ok("BTC 110,000 에 10배 롱 진입", opened.ok === true, opened.error || "");
  ok("청산가 99,550", Math.round(opened.position.liq) === 99550, String(opened.position.liq));

  pretendActive(App, "ETHUSDT");
  App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });

  const s = App.Trading.getSnapshot();
  const 청산 = (s.closedTrades || [])[0] || null;
  기준_총자산 = s.equity;
  ok("포지션이 한 틱에 사라진다", s.position === null);
  ok("사유가 강제청산", 청산 && 청산.reason === "강제청산", 청산 ? 청산.reason : "기록 없음");
  ok("손익 -1,000 / ROE -100%", 청산 && 청산.pnl === -1000 && 청산.pnlPercent === -100,
    청산 ? 청산.pnl + " / " + 청산.pnlPercent : "");
  ok("잔고 100,000 → 98,995", 시작잔고 === 100000 && Math.round(s.balance) === 98995,
    시작잔고 + " → " + s.balance);
}

/* =========================================================================
 * [1] 안전장치가 있으면 안 터진다 (같은 상황, 같은 숫자로 비교)
 * ========================================================================= */
section("[1] 안전장치 있음 — 같은 상황에서 포지션이 살아남는다");
{
  const { App } = boot();
  const 시작잔고 = App.Trading.getSnapshot().balance;
  const opened = openLong(App, 110000, 1000, 10);
  ok("BTC 110,000 에 10배 롱 진입", opened.ok === true, opened.error || "");

  pretendActive(App, "ETHUSDT");
  App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });

  const s = App.Trading.getSnapshot();
  ok("포지션이 그대로 살아 있다", s.position !== null, "사라졌습니다");
  ok("강제청산 기록이 없다", (s.closedTrades || []).length === 0, String((s.closedTrades || []).length));
  /* 총자산(잔고 + 묶인 증거금 + 미실현)으로 비교합니다.
     잔고만 보면 둘 다 98,995 로 같아 보입니다 — 안전장치가 없으면 증거금
     1,000 이 통째로 날아가 총자산이 98,995 가 되고, 있으면 증거금이 그대로
     묶여 있어 99,995 입니다(진입수수료 5 만 나간 상태). */
  ok("총자산 98,995(안전장치 없음) → 99,995(있음) — 1,000 USDT 를 지켰다",
    Math.round(기준_총자산) === 98995 && Math.round(s.equity) === 99995,
    "기준 " + Math.round(기준_총자산) + " / 지금 " + Math.round(s.equity));
  ok("잔고에서 나간 것은 증거금 1,000 + 진입수수료 5 뿐이다",
    Math.round(s.balance) === Math.round(시작잔고 - 1000 - 5), String(s.balance));
  ok("그물이 시세를 버렸다고 셌다", App.SymbolGuard.getDroppedCount() >= 1,
    String(App.SymbolGuard.getDroppedCount()));
  ok("내 포지션 종목은 BTCUSDT 로 남아 있다", s.position.symbol === "BTCUSDT", String(s.position.symbol));
}

/* =========================================================================
 * [2] 도장 — 포지션·미체결에 symbol 이 찍힌다
 * ========================================================================= */
section("[2] 포지션·미체결에 symbol 이 찍힌다");
{
  const { App } = boot();
  openLong(App, 110000, 1000, 10);
  const p = App.Trading.getSnapshot().position;
  ok("포지션에 symbol 칸이 있다", typeof p.symbol === "string", String(p && p.symbol));
  ok("값이 BTCUSDT 다", p.symbol === "BTCUSDT", String(p.symbol));
  App.Trading.closePosition("수동청산");

  App.Trading.placeLimitOrder("long", 100000, 500);
  const o = App.Trading.getSnapshot().pendingOrder;
  ok("미체결 주문에 symbol 칸이 있다", o && typeof o.symbol === "string", String(o && o.symbol));
  ok("값이 BTCUSDT 다", o && o.symbol === "BTCUSDT", String(o && o.symbol));
}

/* =========================================================================
 * [3] ① 미체결 주문만 있어도 잠긴다
 *     — "포지션이 있으면 막는다" 로만 만들면 여기서 그냥 통과합니다
 * ========================================================================= */
section("[3] ① 미체결 주문만 있어도 종목 전환이 막힌다");
{
  const { App } = boot();
  ok("아무것도 없을 때는 안 잠긴다", App.SymbolGuard.isLocked() === false);

  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);
  const r = App.Trading.placeLimitOrder("long", 100000, 500);
  ok("지정가 주문이 들어갔다(포지션은 없음)", r.ok === true && App.Trading.getSnapshot().position === null,
    r.error || "");
  ok("미체결만 있어도 잠긴다", App.SymbolGuard.isLocked() === true);
  ok("사유가 '미체결 주문이 있습니다'", App.SymbolGuard.blockReason() === "미체결 주문이 있습니다",
    App.SymbolGuard.blockReason());

  /* 미체결만 있는 상태에서도 다른 종목 시세가 거래엔진에 안 들어가야 합니다.
     들어가면 한 틱에 체결되고 곧바로 전액 손실입니다. */
  pretendActive(App, "ETHUSDT");
  App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });
  const s = App.Trading.getSnapshot();
  ok("다른 종목 시세로 체결되지 않는다", s.pendingOrder !== null && s.position === null,
    "pendingOrder=" + !!s.pendingOrder + " position=" + !!s.position);

  App.Trading.cancelPendingOrder();
  ok("취소하면 다시 안 잠긴다", App.SymbolGuard.isLocked() === false);
}

/* =========================================================================
 * [4] 문 — 나중에 종목 변경 함수가 생겨도 잠긴 채로 생긴다
 * ========================================================================= */
section("[4] 종목 변경 함수가 생겨도 잠긴 채로 생긴다");
{
  const { App } = boot();
  ok("지금은 App.Config.setActiveSymbol 이 없다(우리가 만들지 않는다)",
    typeof App.Config.setActiveSymbol === "undefined", typeof App.Config.setActiveSymbol);
  ok("Object.keys(App.Config) 에도 안 보인다",
    Object.keys(App.Config).filter((k) => /symbol/i.test(k)).join(",") === "getActiveSymbol",
    Object.keys(App.Config).filter((k) => /symbol/i.test(k)).join(","));

  /* 누군가 나중에 이렇게 추가한다고 가정합니다. */
  let 실제로바뀐횟수 = 0;
  App.Config.setActiveSymbol = function (s) { 실제로바뀐횟수++; return s; };

  ok("추가되면 감싸진 함수가 된다", typeof App.Config.setActiveSymbol === "function");

  App.Config.setActiveSymbol("ETHUSDT");
  ok("포지션이 없으면 전환은 통과한다", 실제로바뀐횟수 === 1, String(실제로바뀐횟수));

  openLong(App, 110000, 1000, 10);
  App.SymbolGuard._reset();
  App.Config.setActiveSymbol("ETHUSDT");
  ok("포지션이 있으면 전환이 거부된다", 실제로바뀐횟수 === 1, String(실제로바뀐횟수));
  ok("막은 횟수가 1이다", App.SymbolGuard.getBlockedCount() === 1, String(App.SymbolGuard.getBlockedCount()));
  ok("회원에게 이유를 알린다", /포지션/.test(String(App.SymbolGuard.message("ETHUSDT"))),
    App.SymbolGuard.message("ETHUSDT"));
}

/* =========================================================================
 * [5] symbol:change 방송도 같은 조건으로 막힌다 (듣는 곳이 4곳입니다)
 * ========================================================================= */
section("[5] symbol:change 방송 차단");
{
  const { App } = boot();
  let 들은횟수 = 0;
  App.Bus.on("symbol:change", function () { 들은횟수++; });

  App.Bus.emit("symbol:change", { symbol: "ETHUSDT" });
  ok("포지션이 없으면 방송이 지나간다", 들은횟수 === 1, String(들은횟수));

  openLong(App, 110000, 1000, 10);
  App.Bus.emit("symbol:change", { symbol: "ETHUSDT" });
  ok("포지션이 있으면 방송이 막힌다", 들은횟수 === 1, String(들은횟수));
}

/* =========================================================================
 * [6] ⑤ 늦게 터지는 경우 — 틱이 계속 들어와도 안 터진다
 *     (실제로는 재연결·좀비감시 때 터집니다. 여기서는 틱을 계속 흘려봅니다)
 * ========================================================================= */
section("[6] ⑤ 다른 종목 시세가 계속 들어와도 안 터진다");
{
  const { App } = boot();
  openLong(App, 110000, 1000, 10);
  pretendActive(App, "ETHUSDT");
  for (let i = 0; i < 100; i++) {
    App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 + i });
  }
  const s = App.Trading.getSnapshot();
  ok("100틱을 받아도 포지션이 살아 있다", s.position !== null);
  ok("100틱 전부 버렸다", App.SymbolGuard.getDroppedCount() === 100,
    String(App.SymbolGuard.getDroppedCount()));

  /* 부작용 확인 — 화면 쪽 구독자는 그대로 받아야 합니다.
     (BTC 포지션을 든 채 다른 종목 화면을 봐도 현재가 선이 멈추면 안 됩니다) */
  let 화면이받은횟수 = 0;
  App.Bus.on("price:update", function chartLike() { 화면이받은횟수++; });
  for (let i = 0; i < 10; i++) App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3100 + i });
  ok("차트·호가 같은 다른 구독자는 그대로 다 받는다", 화면이받은횟수 === 10, String(화면이받은횟수));
  ok("그 사이에도 포지션은 살아 있다", App.Trading.getSnapshot().position !== null);

  /* 내 종목 시세는 정상적으로 들어와야 합니다(막느라 다 막으면 안 됩니다). */
  pretendActive(App, "BTCUSDT");
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 111000 });
  ok("내 종목(BTCUSDT) 시세는 그대로 반영된다",
    App.Trading.getSnapshot().currentPrice === 111000,
    String(App.Trading.getSnapshot().currentPrice));
}

/* =========================================================================
 * [7] ② 로그인 복원 — 서버에서 온 포지션은 BTCUSDT 로 찍힌다
 *     auth.js:368-382 가 symbol 을 안 실어옵니다. 그 저장을 가로채 찍습니다.
 *     ⚠ 이때 "지금 활성 종목" 으로 찍으면 안 됩니다 — 종목을 바꿔놓고
 *        로그인하면 BTC 포지션에 다른 종목 도장이 찍혀 그대로 터집니다.
 * ========================================================================= */
section("[7] ② 로그인 복원(서버에서 온 포지션)");
{
  /* 부팅 전(복원 구간) 상태로 띄웁니다. */
  const { App, win } = boot({ keepArmed: true });
  ok("복원 구간이다", App.SymbolGuard.isArmed() === true);

  /* 비회원 상태에서 종목만 바꿔둔 상황 */
  pretendActive(App, "ETHUSDT");

  /* auth.js 가 하는 것과 같은 저장 — symbol 이 없습니다 */
  App.Storage.save("trading", {
    balance: 98000,
    leverage: 10,
    position: { side: "long", entry: 110000, leverage: 10, margin: 1000, qty: 0.0909, liq: 99550, entryFee: 5.5, openTime: Date.now(), orderId: "srv1" },
    pendingOrder: null,
    orderHistory: [], closedTrades: [], fundingHistory: [], lastSettledFundingTime: null,
  });
  const saved = App.Storage.load("trading");
  ok("서버에서 온 포지션에 symbol 이 찍혔다", saved.position.symbol === "BTCUSDT",
    String(saved.position.symbol));
  ok("활성 종목(ETHUSDT)이 아니라 서버 사실(BTCUSDT)로 찍는다",
    saved.position.symbol !== "ETHUSDT", String(saved.position.symbol));

  /* 이제 부팅합니다 — trading.js 가 이 포지션을 복원합니다. */
  App.bootApp();
  App.Trading.init();
  const s = App.Trading.getSnapshot();
  ok("복원된 포지션의 종목이 BTCUSDT 다", s.position && s.position.symbol === "BTCUSDT",
    s.position ? String(s.position.symbol) : "포지션 없음");

  /* 활성 종목은 ETHUSDT 인데 포지션은 BTCUSDT — ETH 시세가 들어와도 안 터져야 합니다. */
  App.Bus.emit("price:update", { symbol: "ETHUSDT", price: 3000 });
  ok("어긋난 상태에서도 강제청산되지 않는다", App.Trading.getSnapshot().position !== null);
  ok("어긋났다는 사실을 셌다", App.SymbolGuard.getDroppedCount() >= 1,
    String(App.SymbolGuard.getDroppedCount()));
  void win;
}

/* =========================================================================
 * [7-b] 종목 구분이 없던 옛 기록(localStorage)도 BTCUSDT 로 찍힌다
 * ========================================================================= */
section("[7-b] 옛 기록(symbol 없음)도 BTCUSDT 로 찍힌다");
{
  const { App, win } = boot({ keepArmed: true });

  /* 안전장치가 없던 시절 저장된 모양 그대로, 도장을 거치지 않고 직접 넣습니다.
     (js/storage.js 의 접두어 btc_sim_v2_ + 문서 이름 trading) */
  const prefix = (read("js/storage.js").match(/KEY_PREFIX\s*=\s*"([^"]+)"/) || [])[1];
  ok("js/storage.js 의 접두어를 읽었다(" + prefix + ")", !!prefix, String(prefix));
  win.localStorage.setItem(prefix + "trading", JSON.stringify({
    version: 1, savedAt: Date.now(),
    state: {
      balance: 98000, leverage: 10,
      position: { side: "long", entry: 110000, leverage: 10, margin: 1000, qty: 0.0909, liq: 99550, entryFee: 5.5, openTime: Date.now(), orderId: "old1" },
      pendingOrder: null, orderHistory: [], closedTrades: [], fundingHistory: [], lastSettledFundingTime: null,
    },
  }));

  App.bootApp();
  App.Trading.init();
  const s = App.Trading.getSnapshot();
  ok("옛 포지션이 복원된다", s.position !== null, "복원 실패");
  ok("symbol 이 없던 옛 기록에도 복원 직후 BTCUSDT 도장이 찍힌다",
    s.position && s.position.symbol === "BTCUSDT", s.position ? String(s.position.symbol) : "");
}

/* =========================================================================
 * [8] ③ 다른 탭 — 종목을 어느 키에 저장하나
 * ========================================================================= */
section("[8] ③ 다른 탭 감시에 걸리는 키에 저장한다");
{
  const { App } = boot();
  const KEY_HINT = "trading"; // js/multi-tab-guard.js:40
  ok("저장 문서 이름에 'trading' 이 들어간다",
    String(App.SymbolGuard.SYMBOL_KEY).indexOf(KEY_HINT) !== -1, App.SymbolGuard.SYMBOL_KEY);

  const guardSrc = read("js/multi-tab-guard.js");
  ok("multi-tab-guard.js 가 그 글자로 거른다는 사실 확인",
    /KEY_HINT\s*=\s*"trading"/.test(guardSrc) && /indexOf\(KEY_HINT\)\s*===\s*-1/.test(guardSrc));

  const storageSrc = read("js/storage.js");
  const m = storageSrc.match(/KEY_PREFIX\s*=\s*"([^"]+)"/);
  ok("실제 localStorage 키가 " + (m ? m[1] : "?") + App.SymbolGuard.SYMBOL_KEY + " 다",
    !!m && (m[1] + App.SymbolGuard.SYMBOL_KEY).indexOf(KEY_HINT) !== -1,
    m ? m[1] + App.SymbolGuard.SYMBOL_KEY : "");

  /* 부팅만 해서는 쓰지 않습니다 — 쓰면 다른 탭이 storage 이벤트를 받고
     새로고침해서(multi-tab-guard.js:88) 탭끼리 서로 되새로고침합니다. */
  ok("부팅만 해서는 이 키를 쓰지 않는다", App.SymbolGuard.rememberedSymbol() === null,
    String(App.SymbolGuard.rememberedSymbol()));

  /* 실제로 종목이 바뀌면 그때 씁니다. */
  App.Config.setActiveSymbol = function (s) { return s; };
  App.Config.setActiveSymbol("ETHUSDT");
  ok("종목이 실제로 바뀌면 그때 쓴다", App.SymbolGuard.rememberedSymbol() === "ETHUSDT",
    String(App.SymbolGuard.rememberedSymbol()));
}

/* =========================================================================
 * [9] ④ 종목 UI 가 두 곳 — 둘 다 같은 판정으로 막힌다
 * ========================================================================= */
section("[9] ④ 종목 UI 두 곳 모두 막힌다");
{
  const { App, doc, win } = boot();
  ok("상단 드롭다운 자리가 index.html 에 있다", !!doc.getElementById("symbol-select-dropdown"));
  ok("주문창 종목 목록 자리가 index.html 에 있다", !!doc.getElementById("ami-symbols"));

  /* 지금은 BTCUSDT 말고 전부 준비중(mock) 이라 아무것도 안 막힙니다.
     종목이 열린 뒤를 흉내내기 위해 ETHUSDT 만 준비 완료로 바꿔 봅니다. */
  const origIsMock = App.SymbolRegistry.isMock;
  App.SymbolRegistry.isMock = function (s) { return s === "ETHUSDT" ? false : origIsMock(s); };

  ["symbol-option", "ami-symbol-row"].forEach(function (cls) {
    const row = doc.createElement("div");
    row.className = cls;
    row.setAttribute("data-symbol", "ETHUSDT");
    doc.body.appendChild(row);

    let 원래핸들러가불렸나 = 0;
    row.addEventListener("click", function () { 원래핸들러가불렸나++; });

    /* 포지션이 없으면 그냥 지나갑니다(지금 화면 동작 그대로) */
    if (App.Trading.getSnapshot().position) App.Trading.closePosition("정리");
    if (App.Trading.getSnapshot().pendingOrder) App.Trading.cancelPendingOrder();
    App.SymbolGuard._reset();
    row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok("." + cls + " — 포지션이 없으면 막지 않는다",
      원래핸들러가불렸나 === 1 && App.SymbolGuard.getBlockedCount() === 0,
      원래핸들러가불렸나 + " / " + App.SymbolGuard.getBlockedCount());

    /* 포지션이 생기면 클릭 자체가 원래 핸들러까지 못 갑니다 */
    openLong(App, 110000, 1000, 10);
    App.SymbolGuard._reset();
    row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok("." + cls + " — 포지션이 있으면 막는다",
      원래핸들러가불렸나 === 1 && App.SymbolGuard.getBlockedCount() === 1,
      원래핸들러가불렸나 + " / " + App.SymbolGuard.getBlockedCount());
    App.Trading.closePosition("정리");
  });

  App.SymbolRegistry.isMock = origIsMock;
}

/* =========================================================================
 * [10] 지금 화면 동작은 하나도 안 바뀐다
 *      (준비중 종목을 눌렀을 때의 안내를 우리가 가로채면 안 됩니다)
 * ========================================================================= */
section("[10] 지금 화면 동작은 그대로다");
{
  const { App, doc, win } = boot();
  openLong(App, 110000, 1000, 10);
  App.SymbolGuard._reset();

  ["symbol-option", "ami-symbol-row"].forEach(function (cls) {
    const row = doc.createElement("div");
    row.className = cls;
    row.setAttribute("data-symbol", "ETHUSDT"); // 지금은 mock
    doc.body.appendChild(row);
    let 불렸나 = 0;
    row.addEventListener("click", function () { 불렸나++; });
    row.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok("." + cls + " — 준비중(mock) 종목 클릭은 그대로 지나간다", 불렸나 === 1, String(불렸나));
  });
  ok("막은 횟수 0", App.SymbolGuard.getBlockedCount() === 0, String(App.SymbolGuard.getBlockedCount()));

  /* BTCUSDT 정상 거래가 평소처럼 동작하는지 */
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 99000 });
  const s = App.Trading.getSnapshot();
  ok("내 종목 시세로는 강제청산이 정상 작동한다", s.position === null && (s.closedTrades[0] || {}).reason === "강제청산",
    s.position ? "아직 있음" : String((s.closedTrades[0] || {}).reason));
}

/* =========================================================================
 * [11] 우리가 종목 전환을 열지 않았다
 * ========================================================================= */
section("[11] 종목 전환을 열지 않았다");
{
  const src = read("js/symbol-guard.js").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
  ok("symbol:change 를 쏘지 않는다", !/emit\s*\(\s*["']symbol:change["']/.test(src));
  ok("종목 변경 함수를 만들지 않는다(대입 없음)",
    !/App\.Config\.setActiveSymbol\s*=\s*function/.test(src));
  const sel = read("js/symbol-selector.js");
  ok("js/symbol-selector.js 의 '준비 중입니다' 안내가 그대로다", /준비 중입니다/.test(sel));
}

/* =========================================================================
 * [12] 수정 금지 파일을 건드리지 않았다
 * ========================================================================= */
section("[12] 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
   ["ui.js", "333fc427e75b47b306699c92aa4e7b50"],
   ["auth.js", "9cec9a7257eb54f379bf72e14e21e463"],
   ["supabase-sync.js", "faddcbbc34b5165177ff26cb978040f8"],
   ["chat.js", "a93dfaa7f82ce72a914b270acb3650bb"],
   ["leaderboard.js", "62e839f06e0565cca5d9216e484b6031"],
   ["admin.js", "424e4c63ec1cd24681c4f27f60aee2fa"],
   ["season.js", "9c5fbf13ced09ca2f348e48f87c78224"],
   ["board.js", "8b847bd8f5d8231b8dd329f8b15dbe37"],
   ["orderbook.js", "fa5f77dc5108133128f85ba5ab3f096e"],
   ["chart.js", "02ddcb000d577131f797143d08c09123"],
   ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"]].forEach(([f, h]) => {
    ok(f + " 를 건드리지 않았다", md5(f) === h, md5(f));
  });
}

/* =========================================================================
 * [13] index.html 에 실려 있고, trading.js 보다 먼저 읽힌다
 * ========================================================================= */
section("[13] index.html 순서");
{
  const html = read("index.html");
  const g = html.indexOf('src="js/symbol-guard.js"');
  const t = html.indexOf('src="js/trading.js"');
  ok("index.html 에 symbol-guard.js 가 있다", g >= 0);
  ok("trading.js 보다 먼저 읽힌다", g >= 0 && t >= 0 && g < t, g + " < " + t);
}

/* =========================================================================
 * [14] npm test 목록 등록
 * ========================================================================= */
section("[14] 테스트 등록");
{
  const pkg = read("package.json");
  ok("package.json 의 test 목록에 이 파일이 있다",
    pkg.indexOf("tests/symbol-guard.test.js") >= 0, "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
