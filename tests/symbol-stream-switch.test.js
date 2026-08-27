/* tests/symbol-stream-switch.test.js
 * =========================================================================
 * 종목 전환 4번 관문 — js/symbol-stream-switch.js (2026-08-27)
 * =========================================================================
 *
 * ⭐ 이 파일이 지키는 것 — 다시 깨지면 회원이 "삼성전자"라고 적힌 화면에서
 *    비트코인 숫자를 보고 판단하게 됩니다.
 *
 *   [1] 전환 순서 — 활성 종목이 **먼저** 바뀌고, 그 다음 symbol:change,
 *       그 다음 화면 비우기, 그 다음 소켓 닫기, 마지막에 interval:change.
 *       ⚠ 순서가 뒤집히면 재접속이 "옛 종목" 주소로 붙습니다
 *         (connect() 는 재접속하는 그 순간에 getActiveSymbol() 을 읽습니다).
 *
 *   [2] ⛔ P1 — 포지션·미체결이 있으면 interval:change 를 안 쏜다.
 *       js/symbol-guard.js 는 symbol:change 만 막고 interval:change 는
 *       안 막습니다. 이걸 조건 없이 쏘면 포지션을 든 사람의 소켓만
 *       갈아타고 1번 관문을 그대로 통과합니다.
 *
 *   [3] interval:change 에 "지금 간격" 을 그대로 싣는다.
 *       1s/5s/15s 를 실으면 js/interval-guard.js 가 1m 으로 되돌립니다.
 *
 *   [4] 닫는 소켓은 fstream.binance.com 인 호가·체결 두 개뿐.
 *       Supabase 실시간 등 남의 소켓을 닫으면 안 됩니다.
 *       합본 스트림(/stream?streams=)은 interval:change 가 닫습니다.
 *
 *   [5] 화면에 남은 옛 값을 지운다 — 호가 10줄 · 최근 체결 · 마크가격 ·
 *       펀딩비 · 상단 24H 4칸 · 압력 바.
 *       ⚠ 호가 행을 innerHTML 로 지우면 안 됩니다. js/orderbook.js 가
 *         만든 행을 재사용해서(ensureRowEls) 지우면 다시 안 만들어집니다.
 *
 *   [6] ⛔ P1 — js/limit-close.js 가 종목을 본다.
 *       안 보면 다른 종목 가격으로 지정가 청산이 터집니다.
 *
 *   [7] 종목을 안 보던 나머지 두 곳(압력 바 · 호가 화살표)도 본다.
 *
 *   [8] 수정 금지 파일 12개 무수정 (md5).
 *
 * ⚠ 이 파일은 사이트 코드를 한 글자도 고치지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { boot, REPO } = require("./harness.js");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0,
  fail = 0;
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
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const EXTRA = [
  "js/symbol-guard.js",
  "js/symbol-sync-bridge.js",
  "js/symbol-stream-switch.js",
];

console.log("\n종목 전환 4번 관문 — 전환 순서 · 잠금 · 옛 값 지우기");

const { win, App, doc } = boot({ extra: EXTRA });
win.eval("App.bootApp = function(){ return true; };");
if (App.SymbolGuard) App.SymbolGuard.init();
if (App.SymbolSyncBridge) App.SymbolSyncBridge.init();
App.bootApp();

/* 소켓을 흉내냅니다 — 열려 있는 것처럼 보이고, 닫히면 기록을 남깁니다. */
const 닫힌주소 = [];
function 가짜소켓(url) {
  const s = new win.WebSocket(url);
  s.url = url;
  s.readyState = 1;
  s.close = function () {
    this.readyState = 3;
    닫힌주소.push(url);
  };
  return s;
}

/* =========================================================================
 * [0] 실려 있는가
 * ========================================================================= */
section("[0] 4번 관문이 실려 있다");
{
  ok("App.SymbolStreamSwitch 가 떠 있다", !!App.SymbolStreamSwitch);
  ok("준비됐다(getActiveSymbol 을 감쌌다)", App.SymbolStreamSwitch.isReady() === true);
  ok("index.html 이 이 파일을 싣는다",
    read("index.html").indexOf('src="js/symbol-stream-switch.js"') > 0);
  ok("main.js 가 init 목록에 넣었다", /"SymbolStreamSwitch"/.test(read("main.js")));
  ok("App.Config 에 종목 쓰기 함수를 만들지 않았다",
    typeof App.Config.setActiveSymbol === "undefined" &&
      typeof App.Config.switchSymbol === "undefined",
    "전환 통로가 둘이 되면 한쪽이 순서를 안 지킵니다");
}

/* =========================================================================
 * [1] 전환 순서 — 활성 종목이 먼저 바뀐다
 * ========================================================================= */
section("[1] 전환 순서 (활성 종목 → symbol:change → interval:change)");
{
  const 기록 = [];
  App.Bus.on("symbol:change", (p) => {
    기록.push({
      event: "symbol:change",
      실린종목: p && p.symbol,
      그때활성: App.Config.getActiveSymbol(),
    });
  });
  App.Bus.on("interval:change", (p) => {
    기록.push({
      event: "interval:change",
      실린간격: p && p.interval,
      그때활성: App.Config.getActiveSymbol(),
    });
  });

  const 앞 = App.Config.getActiveSymbol();
  const r = App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");

  ok("switchTo 가 true 를 돌려준다", r === true, String(r));
  ok("활성 종목이 SAMSUNGUSDT 로 바뀌었다",
    App.Config.getActiveSymbol() === "SAMSUNGUSDT",
    App.Config.getActiveSymbol() + " (이전 " + 앞 + ")");
  ok("신호 두 개가 이 순서로 날아갔다 (symbol:change → interval:change)",
    기록.length === 2 &&
      기록[0].event === "symbol:change" &&
      기록[1].event === "interval:change",
    JSON.stringify(기록));
  ok("⭐ symbol:change 가 날아갈 때 활성 종목은 이미 새 종목이다",
    기록[0] && 기록[0].그때활성 === "SAMSUNGUSDT",
    "그때 활성: " + (기록[0] && 기록[0].그때활성) +
      " — 나중에 바꾸면 재접속이 옛 종목 주소로 붙습니다");
  ok("symbol:change 에 새 종목이 실려 있다",
    기록[0] && 기록[0].실린종목 === "SAMSUNGUSDT",
    JSON.stringify(기록[0]));

  /* [3] 간격 그대로 싣기 */
  ok("interval:change 에 '지금 간격' 이 그대로 실린다",
    기록[1] && 기록[1].실린간격 === App.Config.getActiveInterval(),
    "실린 간격 " + (기록[1] && 기록[1].실린간격) +
      " / 지금 " + App.Config.getActiveInterval() +
      " — 다른 값을 실으면 js/interval-guard.js 가 1m 으로 되돌립니다");

  ok("같은 종목을 또 누르면 아무 일도 안 한다",
    App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT") === false);
  ok("등록소에 없는 종목은 거부한다",
    App.SymbolStreamSwitch.switchTo("DOGEUSDT") === false);

  App.SymbolStreamSwitch.switchTo("BTCUSDT");
  ok("BTCUSDT 로 되돌아온다", App.Config.getActiveSymbol() === "BTCUSDT");
}

/* =========================================================================
 * [2] ⛔ P1 — 포지션이 있으면 interval:change 를 안 쏜다
 * ========================================================================= */
section("[2] ⛔ P1 포지션이 있으면 전환이 통째로 막힌다");
{
  const 신호 = [];
  App.Bus.on("interval:change", () => 신호.push("interval"));
  App.Bus.on("symbol:change", () => 신호.push("symbol"));

  /* 포지션을 하나 만듭니다(실제 거래엔진 그대로). */
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 100000, time: Date.now() });
  App.Trading.openPosition("long", 1000, 10);
  const snap = App.Trading.getSnapshot();
  ok("포지션이 열렸다", !!snap.position, JSON.stringify(snap.position));
  ok("1번 관문이 잠겼다", App.SymbolGuard.isLocked() === true);

  const 앞 = App.Config.getActiveSymbol();
  const before = App.SymbolStreamSwitch.getStats().blocked;
  win.__lastAlert = null;
  const r = App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");

  ok("switchTo 가 false 를 돌려준다", r === false, String(r));
  ok("활성 종목이 안 바뀌었다", App.Config.getActiveSymbol() === 앞);
  ok("막은 횟수가 늘었다", App.SymbolStreamSwitch.getStats().blocked === before + 1);
  ok("회원에게 이유를 알린다", /포지션/.test(String(win.__lastAlert)),
    String(win.__lastAlert));
  ok("⭐ interval:change 가 한 번도 안 날아갔다",
    신호.indexOf("interval") < 0,
    JSON.stringify(신호) +
      " — js/symbol-guard.js 는 interval:change 를 안 막습니다. " +
      "이게 새면 포지션을 든 사람의 소켓만 갈아탑니다(P1)");
  ok("symbol:change 도 안 날아갔다", 신호.indexOf("symbol") < 0, JSON.stringify(신호));

  /* 소스 차원에서도 못 박습니다 — 잠금 확인 없이 쏘면 안 됩니다. */
  const src = read("js/symbol-stream-switch.js");
  ok("소스에 interval:change 를 쏘기 전 isLocked() 확인이 있다",
    /if \(isLocked\(\)\)[\s\S]{0,600}?emit\("interval:change"/.test(src),
    "isLocked() 확인 없이 interval:change 를 쏘면 1번 관문이 통째로 무의미해집니다");

  App.Trading.closePosition();
  ok("정리 — 포지션을 닫았다", App.Trading.getSnapshot().position === null);
}

/* =========================================================================
 * [4] 닫는 소켓은 호가·체결 두 개뿐
 * ========================================================================= */
section("[4] 닫는 소켓 고르기 (남의 소켓을 닫으면 안 됩니다)");
{
  닫힌주소.length = 0;
  가짜소켓("wss://fstream.binance.com/public/ws/btcusdt@depth5@500ms");
  가짜소켓("wss://fstream.binance.com/market/ws/btcusdt@aggTrade");
  가짜소켓(
    "wss://fstream.binance.com/market/stream?streams=btcusdt@kline_1m/btcusdt@ticker"
  );
  가짜소켓("wss://oxpjpotilcumjqixsdxw.supabase.co/realtime/v1/websocket");

  const n = App.SymbolStreamSwitch._closeFeedSockets();

  ok("두 개만 닫았다(호가 · 체결)", n === 2, "닫은 수 " + n);
  ok("호가 소켓을 닫았다", 닫힌주소.some((u) => u.indexOf("@depth") > 0));
  ok("체결 소켓을 닫았다", 닫힌주소.some((u) => u.indexOf("@aggTrade") > 0));
  ok("⭐ 합본 스트림은 안 닫았다(interval:change 가 닫습니다)",
    !닫힌주소.some((u) => u.indexOf("/stream?streams=") > 0),
    닫힌주소.join(" , "));
  ok("⭐ Supabase 실시간 소켓은 안 닫았다",
    !닫힌주소.some((u) => u.indexOf("supabase") > 0),
    닫힌주소.join(" , ") + " — 남의 소켓을 닫으면 채팅·랭킹이 끊깁니다");

  /* 소스에서도 조건 두 개를 확인합니다. */
  const src = read("js/symbol-stream-switch.js");
  ok("소스가 fstream.binance.com 인 것만 고른다",
    /STREAM_HOST\s*=\s*"fstream\.binance\.com"/.test(src) &&
      /indexOf\(STREAM_HOST\)\s*<\s*0\)\s*return/.test(src));
  ok("소스가 합본 스트림을 건너뛴다",
    /indexOf\(COMBINED_MARK\)\s*>=\s*0\)\s*return/.test(src));
}

/* =========================================================================
 * [5] 화면에 남은 옛 값을 지운다
 * ========================================================================= */
section("[5] 전환 직후 화면에 옛 값이 안 남는다");
{
  /* 옛 종목 값을 화면에 심습니다(js/orderbook.js 가 그린 모양 그대로). */
  const asks = doc.getElementById("ob-asks");
  asks.innerHTML =
    '<div class="ob-row ob-ask">' +
    '<span class="ob-depth-bar" style="width:80%"></span>' +
    '<span class="ob-price">78,690.50</span>' +
    '<span class="ob-qty">1.234</span>' +
    '<span class="ob-cum">9.99</span>' +
    "</div>";
  const 행 = asks.querySelector(".ob-row");

  doc.getElementById("ob-current-price").textContent = "현재가 78,690.00";
  doc.getElementById("ob-mark-price").textContent = "78,646.10";
  doc.getElementById("stat-price").textContent = "$78,690.00";
  doc.getElementById("stat-volume").textContent = "128.85K BTC";
  /* 마크가격·펀딩비 칸은 js/chart.js 가 만들어 붙입니다 — 없으면 만들어 둡니다. */
  ["stat-mark-price", "stat-funding"].forEach((id) => {
    if (!doc.getElementById(id)) {
      const s = doc.createElement("span");
      s.id = id;
      doc.body.appendChild(s);
    }
    doc.getElementById(id).textContent = "78,646.10";
  });
  const buyTxt = doc.getElementById("order-pressure-buy-text");
  if (buyTxt) buyTxt.textContent = "매수 73%";

  App.SymbolStreamSwitch.clearStaleScreen();

  ok("호가 가격 칸이 비었다", 행.querySelector(".ob-price").textContent === "",
    행.querySelector(".ob-price").textContent);
  ok("호가 수량·누적 칸도 비었다",
    행.querySelector(".ob-qty").textContent === "" &&
      행.querySelector(".ob-cum").textContent === "");
  ok("깊이 막대가 0% 다", 행.querySelector(".ob-depth-bar").style.width === "0%");
  ok("⭐ 호가 행 자체는 안 지웠다(지우면 다시 안 만들어집니다)",
    asks.querySelectorAll(".ob-row").length === 1,
    "행 " + asks.querySelectorAll(".ob-row").length + "개 — js/orderbook.js 의 " +
      "ensureRowEls 는 arr.length < count 일 때만 만들어서, DOM 만 비우면 영원히 빈 호가창이 됩니다");
  ok("호가 현재가가 지워졌다",
    doc.getElementById("ob-current-price").textContent === "현재가 -");
  ok("호가 마크가격이 지워졌다", doc.getElementById("ob-mark-price").textContent === "-");
  ok("상단 현재가가 지워졌다", doc.getElementById("stat-price").textContent === "-");
  ok("24H 거래량이 지워졌다", doc.getElementById("stat-volume").textContent === "-");
  ok("⭐ 상단 마크가격이 지워졌다",
    doc.getElementById("stat-mark-price").textContent === "-",
    "2026-08-27 실측 — 이걸 빼먹으니 삼성전자 이름표 아래에 " +
      "'마크가격 78,646.10'(비트코인 값)이 그대로 남았습니다. 강제청산 판정 기준가입니다");
  ok("상단 펀딩비가 지워졌다", doc.getElementById("stat-funding").textContent === "-");
  if (buyTxt) {
    ok("압력 바가 '모름' 으로 돌아갔다(50:50 을 지어내지 않는다)",
      buyTxt.textContent === "매수 —", buyTxt.textContent);
  }
}

/* =========================================================================
 * [5-ㄴ] 제목 글자가 지금 종목을 따라간다
 * ========================================================================= */
section("[5-ㄴ] index.html 에 박힌 BTCUSDT 글자가 따라온다");
{
  App.SymbolStreamSwitch.switchTo("SAMSUNGUSDT");
  App.SymbolStreamSwitch.applyLabels();

  const 버튼 = doc.querySelector("#symbol-select-btn .stat-label");
  const 호가제목 = doc.querySelector("#orderbook-panel .ob-header .ob-title");
  const 포지션칸 = doc.querySelector(".position-symbol-cell .position-symbol-name");

  ok("상단 종목명 버튼(index.html:315)", 버튼 && 버튼.textContent === "SAMSUNGUSDT",
    버튼 && 버튼.textContent);
  ok("호가창 제목(index.html:401)",
    호가제목 && 호가제목.textContent === "호가창 (SAMSUNGUSDT)",
    호가제목 && 호가제목.textContent);
  ok("포지션 표 종목 칸(index.html:568 — js/ui.js 무수정 DOM 후처리)",
    포지션칸 && 포지션칸.textContent === "SAMSUNGUSDT",
    포지션칸 && 포지션칸.textContent);

  /* 수량 단위 — 삼성전자는 "주" 입니다("1.020000 BTC" 는 틀린 정보). */
  ok("수량 단위가 종목 규격표를 따른다", App.Utils.qtyUnit() === "주",
    App.Utils.qtyUnit());
  if (App.ObHeaderCurrency) {
    App.ObHeaderCurrency.apply();
    const cols = doc.querySelectorAll("#orderbook-panel .ob-header .ob-cols span");
    ok("호가 머리글 수량(주) (index.html:402)",
      cols[1] && cols[1].textContent === "수량(주)", cols[1] && cols[1].textContent);
    ok("호가 머리글 총수량(주)",
      cols[2] && cols[2].textContent === "총수량(주)", cols[2] && cols[2].textContent);
  }
  const 단위 = doc.getElementById("order-qty-unit");
  ok("주문수량 칸 단위도 따라온다", 단위 && 단위.textContent === "주",
    단위 && 단위.textContent);

  App.SymbolStreamSwitch.switchTo("BTCUSDT");
  App.SymbolStreamSwitch.applyLabels();
  ok("BTCUSDT 로 돌아오면 단위도 BTC 로 돌아온다",
    App.Utils.qtyUnit() === "BTC" && 단위.textContent === "BTC",
    App.Utils.qtyUnit() + " / " + 단위.textContent);
}

/* =========================================================================
 * [6] ⛔ P1 — js/limit-close.js 가 종목을 본다
 * ========================================================================= */
section("[6] ⛔ P1 지정가 청산이 다른 종목 가격에 안 터진다");
{
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 100000, time: Date.now() });
  App.Trading.openPosition("long", 1000, 10);
  ok("BTC 롱 포지션을 열었다", !!App.Trading.getSnapshot().position);
  ok("포지션에 BTCUSDT 도장이 찍혀 있다",
    App.Trading.getSnapshot().position.symbol === "BTCUSDT",
    String(App.Trading.getSnapshot().position.symbol));

  /* 목표가 101,000 짜리 지정가 청산을 겁니다(화면 입력과 같은 경로). */
  const btn = doc.getElementById("pos-close-limit");
  const input = doc.getElementById("pos-limit-price");
  const apply = doc.getElementById("pos-limit-apply");
  if (btn && input && apply) {
    btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    input.value = "101000";
    apply.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  }
  const 예약 = App.LimitClose.getTargetForTest();
  ok("지정가 청산 예약을 걸었다(목표가 101,000)",
    !!예약 && 예약.price === 101000,
    JSON.stringify(예약) + " — 예약이 안 걸리면 아래 검사가 헛돕니다");

  /* ⛔ 다른 종목이 목표가를 넘겨도 청산되면 안 됩니다. */
  App.Bus.emit("trading:update", App.Trading.getSnapshot()); // 캐시 갱신
  App.Bus.emit("price:update", { symbol: "SAMSUNGUSDT", price: 999999, time: Date.now() });
  ok("⭐ 다른 종목(SAMSUNGUSDT) 가격에는 청산이 안 터진다",
    App.Trading.getSnapshot().position !== null,
    "다른 종목 가격으로 지정가 청산이 터졌습니다(P1)");

  /* 같은 종목이면 정상 동작해야 합니다 — 막느라 기능을 죽이면 안 됩니다. */
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 101500, time: Date.now() });
  ok("같은 종목(BTCUSDT) 가격에는 정상적으로 청산된다",
    App.Trading.getSnapshot().position === null,
    "종목 확인을 넣다가 기능 자체를 막아버렸습니다");

  const src = read("js/limit-close.js");
  ok("소스가 payload.symbol 과 포지션 종목을 대조한다",
    /posSymbol[\s\S]{0,200}?tickSymbol[\s\S]{0,120}?return/.test(src),
    "종목 대조가 없습니다");
}

/* =========================================================================
 * [7] 종목을 안 보던 나머지 두 곳
 * ========================================================================= */
section("[7] 압력 바 · 호가 화살표도 종목을 본다");
{
  const bar = read("js/order-pressure-bar.js");
  ok("압력 바가 trade:tick 의 종목을 본다",
    /p\.symbol !== App\.Config\.getActiveSymbol\(\)/.test(bar),
    "옛 종목 체결이 60초간 비율에 섞입니다");
  ok("압력 바가 symbol:change 때 모아둔 체결을 버린다",
    /symbol:change[\s\S]{0,120}?onSymbolChange/.test(bar) && /ticks = \[\]/.test(bar));

  const arrow = read("js/orderbook-price-arrow.js");
  ok("호가 화살표가 price:update 의 종목을 본다",
    /payload\.symbol !== App\.Config\.getActiveSymbol\(\)/.test(arrow));
  ok("호가 화살표가 symbol:change 때 비교 기준을 버린다",
    /symbol:change[\s\S]{0,160}?lastPrice = null/.test(arrow),
    "옛 종목 가격과 비교하면 방향이 틀립니다");
}

/* =========================================================================
 * [8] 수정 금지 파일 12개
 * ========================================================================= */
section("[8] 수정 금지 파일 12개 (md5)");
{
  const crypto = require("crypto");
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
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
  ].forEach(([f, h]) => ok(f + " 를 건드리지 않았다", md5(f) === h, md5(f)));
  /* js/config.js 는 수정 금지 12개가 아니지만, 이번 작업에서 안 고쳤습니다. */
  ok("js/config.js 에 종목 바꾸기 함수를 넣지 않았다",
    !/setActiveSymbol|switchSymbol/.test(read("js/config.js")),
    "config.js 를 고쳐서 바꾸면 되돌리기가 <script> 한 줄로 안 끝납니다");
}

/* =========================================================================
 * [9] 테스트 등록
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const pkg = JSON.parse(read("package.json"));
  ok("package.json 의 test 목록에 이 파일이 있다",
    String(pkg.scripts.test).indexOf("tests/symbol-stream-switch.test.js") > 0,
    "등록 안 하면 npm test 에서 안 돕니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
process.exit(fail === 0 ? 0 : 1);
