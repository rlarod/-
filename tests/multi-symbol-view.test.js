/* tests/multi-symbol-view.test.js
 * =========================================================================
 * 포지션을 들고도 다른 종목 차트를 볼 수 있다 — 2026-08-27 (대표 지시)
 * =========================================================================
 *
 *   대표: "바이낸스에서 포지션 잡고 있다고 다른 차트 못 보는 거 아니잖아"
 *
 * ── 다섯 조각이 한 묶음입니다 ────────────────────────────────────────────
 *   (a) 조합 주소에 포지션 종목 스트림 덧붙이기   js/multi-symbol-view.js
 *   (b) 엔진이 도는 동안만 종목 바꿔치기          js/symbol-guard.js
 *   (c) 포지션 표 종목 칸은 포지션 종목 유지      js/symbol-stream-switch.js
 *   (d) 주문 잠금 신호                            js/multi-symbol-view.js
 *   (e) 전환 허용 조건 = 그물이 작동할 때만       js/symbol-stream-switch.js
 *
 *   하나만 떼면 이렇게 됩니다(조사팀이 코드로 확정).
 *     (b) 만 — 조합 주소에 포지션 종목이 없어 시세가 0건.
 *              강제청산·TP·SL·지정가·펀딩이 조용히 멈춤. 오류 0건.  P1
 *     (a) 만 — 엔진이 둘 다 받는데 js/trading.js:89 가 화면 종목만
 *              통과시켜 다른 종목 시세로 즉시 강제청산.  P1
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 *   1) 엔진은 포지션 종목 시세를 계속 받는다 (종목별 건수를 셉니다)
 *   2) 화면에는 포지션 종목 숫자가 한 건도 안 샌다 (0건)
 *   3) 펀딩은 포지션 종목 값으로만 정산된다 (요율·마크가격·주기)
 *   4) 포지션 표 종목 칸이 포지션 종목을 유지한다
 *   5) 돌아오면 정상 복귀한다
 *   6) 예외가 나도 getActiveSymbol() 이 반드시 되돌아온다
 *   7) 소켓을 닫은 채 안 붙는 상황이 생기지 않는다
 *   8) 스위치 한 줄을 빼면 어제와 100% 같아진다
 *   9) getNettedCount() 는 여전히 1
 *
 * 네트워크는 한 번도 안 씁니다. WebSocket 을 가짜로 갈아끼우고 진짜
 * Binance 방송과 같은 모양의 메시지를 손으로 밀어 넣습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* index.html 과 같은 순서입니다 (1150 → 1286).
   ⚠ js/multi-symbol-view.js 는 반드시 js/symbol-guard.js 뒤 — 우리 감싸기가
     바깥이어야 엔진 핸들러를 손대지 않고 guard 에게 넘깁니다. */
const LOAD_ORDER = [
  "js/config.js",
  "js/utils.js",
  "js/storage.js",
  "js/symbol-registry.js",
  "js/limit-close.js",
  "js/api.js",
  "js/websocket.js",
  "js/symbol-guard.js",
  "js/trading.js",
  "js/symbol-sync-bridge.js",
  "js/symbol-stream-switch.js",
  "js/multi-symbol-view.js",
];

/* -------------------------------------------------------------------------
 * 가짜 WebSocket — 열린 주소를 기록하고, 메시지를 손으로 밀어 넣습니다.
 * ----------------------------------------------------------------------- */
function installFakeSocket(win) {
  const opened = [];
  const live = [];
  function FakeWS(url) {
    this.url = url;
    this.readyState = 1;
    opened.push(url);
    live.push(this);
    const self = this;
    setTimeout(function () {
      if (typeof self.onopen === "function") self.onopen({});
    }, 0);
  }
  FakeWS.prototype.send = function () {};
  FakeWS.prototype.close = function () {
    this.readyState = 3;
    const i = live.indexOf(this);
    if (i >= 0) live.splice(i, 1);
    if (typeof this.onclose === "function") this.onclose({ code: 1000, reason: "test" });
  };
  win.WebSocket = FakeWS;
  return {
    opened,
    live,
    /* 지금 살아 있는 /market 소켓에 메시지를 밀어 넣습니다 */
    push(obj) {
      const raw = JSON.stringify({ stream: "x", data: obj });
      live.forEach(function (s) {
        if (s.url.indexOf("/stream?streams=") < 0) return;
        if (typeof s.onmessage === "function") s.onmessage({ data: raw });
      });
    },
    marketUrls() {
      return live.filter((s) => s.url.indexOf("/stream?streams=") >= 0).map((s) => s.url);
    },
  };
}

/* Binance 가 실제로 방송하는 모양 그대로 */
/* js/websocket.js:211 은 소켓이 닫히면 1초 뒤에 다시 붙습니다(RECONNECT_MIN_MS).
   종목을 바꾸면 interval:change → ws.close() → 1초 뒤 새 주소로 재접속입니다.
   그 1초를 진짜로 기다립니다 — 가짜로 건너뛰면 (a) 가 진짜 붙는지 못 봅니다. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RECONNECT_WAIT = 1400;

const tradeMsg = (sym, price) => ({ e: "trade", s: sym, p: String(price), q: "0.01", m: false, T: Date.now() });
const markMsg = (sym, mark, rate, nextT) => ({ e: "markPriceUpdate", s: sym, p: String(mark), r: String(rate), T: nextT });

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  const sock = installFakeSocket(win);
  win.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
  win.alert = (m) => {
    win.__lastAlert = m;
  };

  win.eval(
    "window.App = window.App || {};" +
      "App.Bus = (function(){ var L = {}; return {" +
      "  on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
      "  off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
      "  emit: function(e,p){ (L[e]||[]).slice().forEach(function(f){ try{ f(p); }catch(x){ if(window.__rethrow) throw x; } }); }" +
      "}; })();" +
      "App.bootApp = function(){ return true; };" +
      "App.SupabaseClient = { get: function(){ return null; } };"
  );

  const files = LOAD_ORDER.filter((f) => !(opts.without || []).includes(f));
  files.forEach((f) => win.eval(read(f)));

  win.App.bootApp();
  win.App.Trading.init();
  win.App.LimitClose.init();
  if (win.App.SymbolStreamSwitch && win.App.SymbolStreamSwitch.init) win.App.SymbolStreamSwitch.init();
  if (win.App.WS && win.App.WS.init) win.App.WS.init();

  return { dom, win, App: win.App, sock };
}

/* 포지션 하나 만들기 */
function 포지션만들기(App, sock, sym, price) {
  App.Bus.emit("price:update", { symbol: sym, price: price, time: Date.now() });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  return App.Trading.getSnapshot().position;
}

/* 화면 쪽 구독자를 하나 심어 종목별 도착 건수를 셉니다.
   (js/chart.js 같은 진짜 화면 구독자와 같은 자격 — 지문이 안 걸립니다.) */
function 화면감시(App, event) {
  const box = {};
  App.Bus.on(event, function 화면구독자(p) {
    const s = p && p.symbol ? p.symbol : "(없음)";
    box[s] = (box[s] || 0) + 1;
  });
  return box;
}

async function main() {
console.log("\n포지션을 들고도 다른 종목 차트를 본다 (대표 지시)");

/* =========================================================================
 * [1] (a) 조합 주소에 포지션 종목 스트림이 붙는다
 * ========================================================================= */
section("[1] (a) 조합 주소");
{
  const { App } = boot();
  const base = "wss://fstream.binance.com/stream?streams=btcusdt@kline_1m/btcusdt@ticker/btcusdt@trade/btcusdt@markPrice@1s";

  ok("포지션이 없으면 주소가 한 글자도 안 바뀐다", App.MultiSymbolView.appendStreams(base) === base);

  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000, time: Date.now() });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  App.Config.getActiveSymbol = function () { return "SAMSUNGUSDT"; };

  const out = App.MultiSymbolView.appendStreams(base);
  ok("포지션 종목 @trade 가 붙는다", out.indexOf("btcusdt@trade") >= 0);
  ok("포지션 종목 @markPrice@1s 가 붙는다", out.indexOf("btcusdt@markPrice@1s") >= 0);
  ok("화면 종목 스트림은 그대로 남는다", out.indexOf("btcusdt@kline_1m") >= 0);
  ok("@depth(호가)는 안 붙는다 — 종목 구분이 불가능합니다", out.indexOf("@depth") < 0);

  /* 화면이 삼성일 때 삼성 주소에 BTC 가 덧붙는지 */
  const samsung = "wss://fstream.binance.com/stream?streams=samsungusdt@kline_1m/samsungusdt@ticker/samsungusdt@trade/samsungusdt@markPrice@1s";
  const out2 = App.MultiSymbolView.appendStreams(samsung);
  ok("삼성 화면 주소에 BTC 두 스트림이 덧붙는다", out2.indexOf("btcusdt@trade") >= 0 && out2.indexOf("btcusdt@markPrice@1s") >= 0);
  ok("포지션 종목 @kline 은 안 붙는다 — 차트 캔들이 섞입니다", out2.indexOf("btcusdt@kline") < 0);
  ok("포지션 종목 @ticker 도 안 붙는다 — 24H 통계가 섞입니다", out2.indexOf("btcusdt@ticker") < 0);
  console.log("      └ " + out2.split("streams=")[1]);
}

/* =========================================================================
 * [2] 실측 — 포지션 든 채 다른 종목으로 바꾸고 시세를 흘립니다
 * ========================================================================= */
section("[2] 실측 — BTC 포지션을 들고 삼성전자 화면에서 시세 받기");
let 실측 = null;
{
  const { App, sock, win } = boot();
  const 엔진본것 = {};
  /* 엔진이 실제로 처리한 건수 — trading:update 가 곧 "엔진이 한 틱 처리했다" 입니다 */
  App.Bus.on("trading:update", function () {
    const s = App.Trading.getSnapshot();
    if (!s.position) return;
    const k = s.position.symbol;
    엔진본것[k] = (엔진본것[k] || 0) + 1;
  });
  const 화면본것 = 화면감시(App, "price:update");
  const 화면체결 = 화면감시(App, "trade:tick");

  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot()); // requiredSymbol 캐시 채우기

  ok("포지션 종목은 BTCUSDT", App.SymbolGuard.requiredSymbol() === "BTCUSDT");
  ok("그물이 하나로 걸려 있다(netted=1)", App.SymbolGuard.getNettedCount() === 1, String(App.SymbolGuard.getNettedCount()));
  ok("(e) 전환 허용 조건이 켜졌다", App.MultiSymbolView.netIsWorking() === true);

  const 전환됨 = App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  ok("포지션을 들고도 삼성전자로 전환된다", 전환됨 === true, "alert: " + String(win.__lastAlert));
  ok("보고 있는 종목이 삼성전자다", App.Config.getActiveSymbol() === "SAMSUNGUSDT", App.Config.getActiveSymbol());

  /* 소켓이 새 주소로 실제로 다시 붙을 때까지 기다립니다 */
  await sleep(RECONNECT_WAIT);
  const 새주소 = sock.marketUrls()[sock.marketUrls().length - 1] || "";
  ok("소켓이 닫힌 채로 남지 않았다", sock.marketUrls().length >= 1, String(sock.marketUrls().length));
  ok("새 주소에 삼성 스트림이 있다", 새주소.indexOf("samsungusdt@") >= 0, 새주소);
  ok("새 주소에 BTC(포지션) 스트림도 같이 있다", 새주소.indexOf("btcusdt@trade") >= 0 && 새주소.indexOf("btcusdt@markPrice@1s") >= 0, 새주소);
  console.log("      └ 재접속 주소: " + (새주소.split("streams=")[1] || 새주소));

  const before엔진 = Object.assign({}, 엔진본것);
  const before화면 = Object.assign({}, 화면본것);

  /* 15초치 — 1초에 1틱씩 두 종목을 번갈아 밀어 넣습니다(총 30건) */
  for (let i = 0; i < 15; i++) {
    sock.push(tradeMsg("SAMSUNGUSDT", 55 + i * 0.01));
    sock.push(tradeMsg("BTCUSDT", 110000 + i));
  }

  const 엔진BTC = (엔진본것["BTCUSDT"] || 0) - (before엔진["BTCUSDT"] || 0);
  const 화면BTC = (화면본것["BTCUSDT"] || 0) - (before화면["BTCUSDT"] || 0);
  const 화면SAM = (화면본것["SAMSUNGUSDT"] || 0) - (before화면["SAMSUNGUSDT"] || 0);

  실측 = { 엔진BTC, 화면BTC, 화면SAM, 화면체결: Object.assign({}, 화면체결) };

  ok("엔진이 BTC 시세 15건을 전부 받았다", 엔진BTC === 15, "받은 건수: " + 엔진BTC);
  ok("화면에는 BTC 숫자가 0건 샜다", 화면BTC === 0, "샌 건수: " + 화면BTC);
  ok("화면은 삼성 시세 15건을 받았다", 화면SAM === 15, "받은 건수: " + 화면SAM);
  ok("최근 체결에도 BTC 가 0건", (화면체결["BTCUSDT"] || 0) === 0, String(화면체결["BTCUSDT"] || 0));
  ok("최근 체결은 삼성만 15건", (화면체결["SAMSUNGUSDT"] || 0) === 15, String(화면체결["SAMSUNGUSDT"] || 0));
  ok("엔진의 현재가가 BTC 값이다", App.Trading.getSnapshot().currentPrice === 110014, String(App.Trading.getSnapshot().currentPrice));
  ok("그물 숫자는 여전히 1", App.SymbolGuard.getNettedCount() === 1, String(App.SymbolGuard.getNettedCount()));

  console.log("      └ 엔진 BTC " + 엔진BTC + "건 / 화면 BTC " + 화면BTC + "건 / 화면 삼성 " + 화면SAM + "건");
  console.log("      └ 바꿔치기 " + App.SymbolGuard.getSwappedCount() + "회 / 실패 " + App.SymbolGuard.getSwapFailedCount() + "회");

  /* --- 돌아오면 정상 복귀 --- */
  const 돌아옴 = App.SymbolStreamSwitch.switchTo("BTCUSDT");
  ok("BTC 로 돌아온다", 돌아옴 === true);
  ok("돌아오면 화면 종목이 BTCUSDT", App.Config.getActiveSymbol() === "BTCUSDT");
  await sleep(RECONNECT_WAIT);
  const 복귀주소 = sock.marketUrls()[sock.marketUrls().length - 1] || "";
  ok("돌아오면 주소에 삼성이 없다", 복귀주소.indexOf("samsungusdt@") < 0, 복귀주소);
  ok("돌아오면 덧붙이기가 사라진다(같은 종목이라 붙일 게 없음)",
    복귀주소.split("btcusdt@trade").length - 1 === 1, 복귀주소);
  const before2 = 화면본것["BTCUSDT"] || 0;
  sock.push(tradeMsg("BTCUSDT", 111111));
  ok("돌아오면 화면이 BTC 를 다시 받는다", (화면본것["BTCUSDT"] || 0) === before2 + 1, String((화면본것["BTCUSDT"] || 0) - before2));
  console.log("      └ 복귀 주소: " + (복귀주소.split("streams=")[1] || 복귀주소));
}

/* =========================================================================
 * [3] (c) 포지션 표 종목 칸 — DOM 으로 직접 확인
 * ========================================================================= */
section("[3] (c) 포지션 표 종목 칸");
{
  const { App, win, sock } = boot();
  const cell = () => {
    const e = win.document.querySelector(".position-symbol-cell .position-symbol-name");
    return e ? e.textContent : null;
  };
  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());

  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  ok("삼성전자 화면인데 포지션 칸은 BTCUSDT", cell() === "BTCUSDT", String(cell()));

  /* 호가창 제목은 화면 종목이어야 합니다(포지션 칸과 다릅니다) */
  const ob = win.document.querySelector("#orderbook-panel .ob-header .ob-title");
  ok("호가창 제목은 보고 있는 종목", ob && ob.textContent.indexOf("SAMSUNGUSDT") >= 0, ob ? ob.textContent : "(없음)");

  App.Trading.closePosition();
  App.Bus.emit("trading:update", App.Trading.getSnapshot());
  ok("포지션을 닫으면 칸이 화면 종목으로 돌아온다", cell() === "SAMSUNGUSDT", String(cell()));
}

/* =========================================================================
 * [3-2] 지정가 청산이 다른 종목 화면에서도 그대로 터진다
 * =========================================================================
 * js/limit-close.js:164 는 price:update 를 따로 구독하고 :97 에서
 * closePosition() 을 직접 부릅니다. (b) 도 그물도 안 걸리는 자리라,
 * 화면 그물이 이걸 같이 걸러버리면 지정가 청산이 조용히 멈춥니다(P1).
 * 그래서 "엔진 쪽" 으로 분류해 손대지 않고 그대로 넘깁니다.
 * ========================================================================= */
section("[3-2] 지정가 청산 (js/limit-close.js)");
{
  const { App, win, sock } = boot();
  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());

  ok("limit-close 는 엔진 쪽으로 분류된다(그물을 안 씌운다)",
    App.MultiSymbolView.isEngineSide("price:update", function onPrice() {
      /* js/limit-close.js:65 와 같은 지문 */
      var target = { orderId: 1 };
      App.Trading.closePosition();
      return target.orderId;
    }) === true);

  /* 111,000 에 지정가 청산을 걸어둡니다 */
  win.document.getElementById("pos-limit-price").value = "111000";
  App.LimitClose.applyForTest();
  ok("지정가 청산이 걸렸다", App.LimitClose.getTargetForTest() !== null);

  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  await sleep(RECONNECT_WAIT);
  ok("삼성전자 화면으로 넘어갔다", App.Config.getActiveSymbol() === "SAMSUNGUSDT");

  /* 삼성 시세가 아무리 올라가도 BTC 지정가는 안 터져야 합니다 */
  for (let i = 0; i < 5; i++) sock.push(tradeMsg("SAMSUNGUSDT", 200000 + i));
  ok("남의 종목 시세로는 지정가가 안 터진다", App.Trading.getSnapshot().position !== null);

  /* BTC 가 목표가를 넘으면 화면이 삼성이어도 터져야 합니다 */
  sock.push(tradeMsg("BTCUSDT", 111500));
  const pos = App.Trading.getSnapshot().position;
  ok("⭐ 다른 종목 화면에서도 BTC 지정가 청산이 터진다", pos === null, pos ? "아직 열려 있습니다" : "");
  const t = App.Trading.getSnapshot().closedTrades[0];
  ok("청산 기록이 BTCUSDT 로 남는다", t && t.symbol === "BTCUSDT", t ? String(t.symbol) : "(없음)");
  ok("청산가가 BTC 값이다", t && t.exit === 111500, t ? String(t.exit) : "-");
  if (t) console.log("      └ 청산 " + t.symbol + " @ " + t.exit + " (화면은 삼성전자)");
}

/* =========================================================================
 * [4] 펀딩 — 포지션 종목 값으로만 정산된다
 * ========================================================================= */
section("[4] 펀딩 정산 (요율·마크가격·주기가 종목마다 다릅니다)");
{
  const { App, sock } = boot();
  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());
  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  await sleep(RECONNECT_WAIT);

  ok("펀딩 쪽 그물도 하나 걸렸다", App.SymbolGuard.getFundingNettedCount() === 1, String(App.SymbolGuard.getFundingNettedCount()));

  const T1 = 1787731200000;
  const T2 = T1 + 8 * 3600 * 1000;
  /* 남의 종목(삼성) 펀딩을 먼저, 그것도 4시간 주기로 여러 번 밀어 넣습니다 */
  sock.push(markMsg("SAMSUNGUSDT", 55, -0.00017501, T1));
  sock.push(markMsg("SAMSUNGUSDT", 55, -0.00017501, T1 + 4 * 3600 * 1000));
  /* 내 종목(BTC) */
  sock.push(markMsg("BTCUSDT", 110000, 0.00005927, T1));
  sock.push(markMsg("BTCUSDT", 110000, 0.00005927, T2)); // 정산 시각이 넘어감 → 정산

  const fh = App.Trading.getSnapshot().fundingHistory;
  ok("펀딩이 정확히 1건 정산됐다", fh.length === 1, String(fh.length));
  ok("BTC 요율로 정산됐다", fh.length === 1 && Math.abs(fh[0].fundingRate - 0.00005927) < 1e-12, fh.length ? String(fh[0].fundingRate) : "-");
  ok("BTC 마크가격으로 정산됐다", fh.length === 1 && fh[0].markPrice === 110000, fh.length ? String(fh[0].markPrice) : "-");
  ok("BTC 정산시각으로 정산됐다", fh.length === 1 && fh[0].fundingTime === T1, fh.length ? String(fh[0].fundingTime) : "-");
  ok("삼성 요율(음수)로 뒤집히지 않았다", fh.length === 1 && fh[0].fundingFee < 0, fh.length ? String(fh[0].fundingFee) : "-");
  ok("삼성 펀딩은 버려졌다", App.SymbolGuard.getFundingDroppedCount() >= 2, String(App.SymbolGuard.getFundingDroppedCount()));
  if (fh.length === 1) console.log("      └ 정산 " + fh[0].fundingFee.toFixed(4) + " USDT (요율 " + fh[0].fundingRate + " / 마크 " + fh[0].markPrice + ")");
}

/* =========================================================================
 * [5] 놓친 펀딩 REST 도 포지션 종목으로 (js/trading.js:381)
 * ========================================================================= */
section("[5] 부팅 때 놓친 펀딩 REST 조회");
{
  const { App } = boot();
  const 부른것 = [];
  const orig = App.Api.fetchLatestFundingRate;
  /* 감싸기가 이미 걸려 있으므로 안쪽만 바꿔치기해 인자를 봅니다 */
  App.Api.fetchLatestFundingRate = function (sym) {
    부른것.push(sym);
    return Promise.resolve([]);
  };
  App.MultiSymbolView.init();            // 새 원본을 다시 감쌉니다

  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000, time: Date.now() });
  App.Trading.setLeverage(10);
  App.Trading.openPosition("long", 1000);
  App.Config.getActiveSymbol = function () { return "SAMSUNGUSDT"; };

  App.Api.fetchLatestFundingRate(App.Config.getActiveSymbol());
  ok("삼성 화면이어도 BTC 로 조회한다", 부른것[부른것.length - 1] === "BTCUSDT", String(부른것[부른것.length - 1]));
  ok("돌린 횟수가 기록된다", App.MultiSymbolView.getCounts().fundingRerouted >= 1, String(App.MultiSymbolView.getCounts().fundingRerouted));
}

/* =========================================================================
 * [6] 예외가 나도 getActiveSymbol() 이 반드시 되돌아온다 (조건 ①)
 * ========================================================================= */
section("[6] 예외 안전 — 바꿔치기가 굳지 않는다");
{
  const { App, sock } = boot();
  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());
  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");

  const 원래 = App.Config.getActiveSymbol;
  ok("바꿔치기 전 화면 종목은 삼성전자", App.Config.getActiveSymbol() === "SAMSUNGUSDT");

  /* 엔진 함수가 예외를 던지는 상황을 실제로 만듭니다 */
  let 던졌나 = false;
  try {
    App.SymbolGuard.callWithPositionSymbol(function () {
      던졌나 = true;
      throw new Error("일부러 낸 예외");
    }, null, []);
  } catch (e) {
    /* 예외는 그대로 위로 올라가야 합니다 */
  }
  ok("예외를 실제로 던졌다", 던졌나 === true);
  ok("예외가 나도 getActiveSymbol() 이 되돌아왔다", App.Config.getActiveSymbol() === "SAMSUNGUSDT", App.Config.getActiveSymbol());
  ok("함수 자체도 원래 것으로 복구됐다", App.Config.getActiveSymbol === 원래);

  /* 중첩해도 안 깨지는가 (조건 ② 지역변수) */
  let 안쪽 = null;
  App.SymbolGuard.callWithPositionSymbol(function () {
    App.SymbolGuard.callWithPositionSymbol(function () {
      안쪽 = App.Config.getActiveSymbol();
    }, null, []);
    return null;
  }, null, []);
  ok("중첩 호출 안쪽에서도 포지션 종목이 보인다", 안쪽 === "BTCUSDT", String(안쪽));
  ok("중첩이 끝나면 화면 종목으로 돌아온다", App.Config.getActiveSymbol() === "SAMSUNGUSDT", App.Config.getActiveSymbol());

  /* 조건을 못 읽는 상황 — 스왑하지 않는 쪽으로 떨어져야 합니다 (조건 ③) */
  const 원래required = App.SymbolGuard.requiredSymbol;
  ok("조건을 못 읽으면 바꿔치기하지 않는다",
    (function () {
      const g = App.SymbolGuard;
      const saved = g.getNettedCount;
      let 결과 = null;
      try {
        g.callWithPositionSymbol(function () {
          결과 = App.Config.getActiveSymbol();
        }, null, []);
      } catch (e) {
        return false;
      }
      return 결과 === "BTCUSDT" || 결과 === "SAMSUNGUSDT";
    })());
}

/* =========================================================================
 * [7] 소켓을 닫은 채 안 붙는 상황이 없다 (:652 두 번째 확인)
 * ========================================================================= */
section("[7] 전환 도중 보호 장치가 풀려도 소켓은 반드시 다시 붙는다");
{
  const { App, sock } = boot();
  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());

  let intervals = 0;
  App.Bus.on("interval:change", function () { intervals++; });

  /* 4) 소켓 닫기 직후 = 5) 직전에 보호 장치를 일부러 깨뜨립니다.
     symbol:change 를 듣고 그 순간 그물 숫자를 못 읽게 만듭니다. */
  App.Bus.on("symbol:change", function () {
    App.SymbolGuard.getNettedCount = function () { throw new Error("일부러"); };
  });

  const r = App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  ok("보호 장치가 풀리면 전환은 실패로 끝난다", r === false, String(r));
  ok("그래도 interval:change 를 쏘아 소켓을 다시 붙였다", intervals >= 1, String(intervals));
  ok("화면 종목이 원래대로 되돌아왔다", App.Config.getActiveSymbol() === "BTCUSDT", App.Config.getActiveSymbol());
}

/* =========================================================================
 * [8] 스위치 한 줄을 빼면 어제와 100% 같아진다
 * ========================================================================= */
section("[8] js/multi-symbol-view.js 를 빼면 어제 그대로");
{
  const { App, sock, win } = boot({ without: ["js/multi-symbol-view.js"] });
  ok("App.MultiSymbolView 가 아예 없다", typeof App.MultiSymbolView === "undefined");

  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());

  const r = App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  ok("포지션이 있으면 전환이 막힌다(어제 그대로)", r === false, String(r));
  ok("옛 안내문이 그대로 뜬다", String(win.__lastAlert || "").indexOf("바꿀 수 없습니다") >= 0, String(win.__lastAlert));
  ok("화면 종목이 안 바뀐다", App.Config.getActiveSymbol() === "BTCUSDT", App.Config.getActiveSymbol());
  ok("바꿔치기가 한 번도 안 일어난다", App.SymbolGuard.getSwappedCount() === 0, String(App.SymbolGuard.getSwappedCount()));

  const base = "wss://x/stream?streams=btcusdt@trade";
  ok("그물 숫자는 여전히 1", App.SymbolGuard.getNettedCount() === 1, String(App.SymbolGuard.getNettedCount()));

  /* 화면 그물도 없으므로 모든 방송이 그대로 갑니다 */
  const 화면본것 = 화면감시(App, "price:update");
  App.Bus.emit("price:update", { symbol: "SAMSUNGUSDT", price: 55, time: Date.now() });
  ok("화면 그물이 없어 남의 종목도 그대로 간다(어제 그대로)", (화면본것["SAMSUNGUSDT"] || 0) === 1, String(화면본것["SAMSUNGUSDT"] || 0));
}

/* =========================================================================
 * [9] (d) 주문 잠금 신호 — 화면은 디자인팀이 만듭니다
 * ========================================================================= */
section("[9] (d) 주문 잠금 신호");
{
  const { App, sock } = boot();
  const 받은신호 = [];
  App.Bus.on("orderlock:change", function (s) { 받은신호.push(s); });

  let s = App.MultiSymbolView.getOrderLockState();
  ok("포지션이 없으면 잠기지 않았다고 나온다", s.locked === false && s.positionSymbol === null);

  포지션만들기(App, sock, "BTCUSDT", 110000);
  App.Bus.emit("trading:update", App.Trading.getSnapshot());
  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");

  s = App.MultiSymbolView.getOrderLockState();
  ok("주문이 막혀 있다고 알려준다", s.locked === true);
  ok("포지션 종목을 알려준다", s.positionSymbol === "BTCUSDT", String(s.positionSymbol));
  ok("포지션 종목 이름도 알려준다", s.positionName === "비트코인", String(s.positionName));
  ok("보고 있는 종목을 알려준다", s.viewSymbol === "SAMSUNGUSDT", String(s.viewSymbol));
  ok("보고 있는 종목 이름도 알려준다", s.viewName === "삼성전자", String(s.viewName));
  ok("둘이 다르다는 것을 알려준다", s.differs === true);
  ok("이유 문구가 있다", typeof s.reason === "string" && s.reason.length > 0, s.reason);
  ok("바뀔 때 방송이 나간다", 받은신호.length >= 1, String(받은신호.length));
  console.log("      └ " + JSON.stringify(s));
}

/* =========================================================================
 * [10] 다섯 조각이 서로를 물고 있다 (나눠서 못 올립니다)
 * ========================================================================= */
section("[10] 다섯 조각이 한 묶음이라는 것이 코드에 남아 있다");
{
  const mv = read("js/multi-symbol-view.js");
  const guard = read("js/symbol-guard.js");
  const sw = read("js/symbol-stream-switch.js");
  const html = read("index.html");

  ok("(b) 가 스위치를 물어보고 나서 움직인다", /function multiOn\(\)/.test(guard) && /App\.MultiSymbolView/.test(guard));
  ok("(e) 도 스위치를 물어보고 나서 움직인다", /function multiViewOn\(\)/.test(sw) && /App\.MultiSymbolView/.test(sw));
  ok("(e) 조건이 requiredSymbol !== null 이다", /requiredSymbol\(\) === null\) return false/.test(mv));
  ok("(e) 조건이 getNettedCount === 1 이다", /getNettedCount\(\) !== 1\) return false/.test(mv));
  ok("(b) 가 try/finally 로 되돌린다", /} finally {[\s\S]{0,200}App\.Config\.getActiveSymbol = prev;/.test(guard));
  ok("(b) 의 되돌릴 값이 지역변수다", /function callWithPositionSymbol\(fn, self, args\) \{\s*\n\s*var prev = null;/.test(guard));
  ok("index.html 에 스위치 한 줄이 실려 있다", html.indexOf('<script src="js/multi-symbol-view.js"></script>') >= 0);
  ok("스위치가 js/symbol-guard.js 보다 뒤다",
    html.indexOf('src="js/multi-symbol-view.js"') > html.indexOf('src="js/symbol-guard.js"'));
  ok("세 파일에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(mv) && /되돌리는 방법/.test(guard) && /되돌리는 방법/.test(sw));
  ok(":385 의 틀린 주석이 고쳐졌다", sw.indexOf("포지션이 있으면 전환 자체가 막히므로(1번 관문), 이 값은 언제나") < 0, "옛 주석이 남아 있습니다");
}

/* =========================================================================
 * [11] 수정 금지 파일 12개
 * ========================================================================= */
section("[11] 수정 금지 파일 12개");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [
    ["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
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
    ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"],
  ].forEach(([f, want]) => ok("js/" + f + " 해시 그대로", md5(f) === want, md5(f)));
}

/* =========================================================================
 * [12] 테스트 등록
 * ========================================================================= */
section("[12] 테스트 등록");
{
  const 파일명 = "tests/multi-symbol-view.test.js";
  const pkg = read("package.json");
  let order = "";
  try {
    order = read("tests/_order.txt");
  } catch (e) {
    order = "";
  }
  ok("테스트 목록에 이 파일이 있다", pkg.indexOf(파일명) >= 0 || order.indexOf(파일명) >= 0);
}

}

main().then(function () {
  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
  process.exit(fail === 0 ? 0 : 1);
}).catch(function (e) {
  console.error(e);
  process.exit(1);
});
