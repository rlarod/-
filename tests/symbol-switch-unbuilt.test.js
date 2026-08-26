/* tests/symbol-switch-unbuilt.test.js
 * =========================================================================
 * "종목을 바꾸는 길이 아직 없다" 는 사실을 못 박습니다 — 2026-08-26
 * =========================================================================
 *
 * ⭐ 이것은 "아직 안 만든 기능은 안 만들었다는 사실을 테스트한다" 형태입니다.
 *    나중에 종목 전환을 만들면 이 파일이 실패하면서
 *    "안전장치를 먼저 넣어라" 고 알려줍니다. 그때 지우는 게 아니라,
 *    안전장치를 만든 뒤에 이 파일을 새 기준으로 고쳐 쓰면 됩니다.
 *
 * ── 왜 이 파일을 만들었나 (조사팀 2026-08-26, 확신도: 확실) ───────────────
 *   종목 추가(비트코인·나스닥·삼성전자·하이닉스) 선행조건을 조사하다 나왔습니다.
 *
 *   지금은 안전합니다. 종목을 바꾸는 함수가 아예 없기 때문입니다.
 *       App.Config.setActiveSymbol       없음
 *       symbol:change 를 쏘는 코드        0곳 (듣는 곳만 4곳)
 *       js/config.js:31 activeSymbol      대입이 그 한 줄뿐
 *       js/symbol-selector.js             mock 종목은 alert 후 return
 *
 *   그런데 이것을 지키는 테스트가 0개였습니다.
 *   누가 setActiveSymbol 을 추가하는 순간 아무 경보 없이 열립니다.
 *
 * ── 열리면 무슨 일이 나나 (조사팀이 실제로 재현) ──────────────────────────
 *   포지션에 종목 구분이 없어서, 종목이 바뀌면 다른 종목 시세로 강제청산됩니다.
 *
 *       BTC 110,000 에 10배 롱 (증거금 1,000, 청산가 99,550)
 *       → 종목만 ETHUSDT 로 바꾸고 ETH 시세 3,000 이 한 틱
 *       → 강제청산. 손익 -1,000 / ROE -100% / 잔고 100,000 → 98,995
 *          시세가 실제로 움직인 폭은 0인데 회원은 1,005 USDT 를 잃습니다.
 *
 *   [6] 절에서 이 재현을 실제 trading.js 로 다시 돌려 숫자로 남깁니다.
 *   미체결 주문은 더 나쁩니다 — 한 틱 안에 체결되고 곧바로 전액 손실입니다.
 *
 * ── 종목 UI 가 두 곳입니다 ────────────────────────────────────────────────
 *   ① js/symbol-selector.js        상단 "BTCUSDT ▾" 드롭다운
 *   ② js/order-panel-amitalk.js    주문창 안 종목 목록(#ami-symbols)
 *   한 곳만 막으면 다른 곳이 뚫립니다. 그래서 둘 다 봅니다.
 *
 * ⚠ 이 파일은 사이트 코드를 한 글자도 고치지 않습니다. 읽기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { boot, REPO } = require("./harness.js");

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

/* 주석(// 와 /* *\/)을 걷어낸 "실제로 실행되는 본문".
   주석에 setActiveSymbol 이라고 적혀 있어도 오탐이 나지 않게 합니다. */
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

const JS_DIR = path.join(REPO, "js");
const JS_FILES = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js"));

console.log("\n종목 전환 — 아직 안 열렸다는 사실을 못 박기");

/* 브라우저를 한 번만 띄워 아래 절들이 나눠 씁니다(느려지지 않게). */
const { win, App, doc } = boot();

/* =========================================================================
 * [1] App.Config 가 종목을 바꾸는 함수를 내보내지 않는다
 * ========================================================================= */
section("[1] 종목을 바꾸는 함수가 없다");
{
  const keys = Object.keys(App.Config);

  ok("App.Config 를 실제로 띄웠다 (내보내는 키 " + keys.length + "개)", keys.length > 5, keys.join(","));

  /* 지금은 "읽기" 만 있고 "쓰기" 가 없습니다. */
  ok("종목 관련 키가 getActiveSymbol 하나뿐이다",
    keys.filter((k) => /symbol/i.test(k)).join(",") === "getActiveSymbol",
    "종목을 바꾸는 함수가 생겼습니다. " +
    "포지션·미체결에 symbol 을 먼저 붙이지 않으면 " +
    "다른 종목 시세로 강제청산됩니다(조사팀 2026-08-26 재현). " +
    "지금 키: " + keys.filter((k) => /symbol/i.test(k)).join(","));

  ["setActiveSymbol", "switchSymbol", "changeSymbol", "selectSymbol", "setSymbol", "useSymbol", "applySymbol"]
    .forEach((n) => {
      ok("App.Config." + n + " 이 없다", typeof App.Config[n] === "undefined",
        n + " 이 생겼습니다. 이제 안전장치를 먼저 만들어야 합니다 — " +
        "포지션·미체결에 symbol 을 붙이고, 종목이 다르면 " +
        "price:update 를 무시하게 하기 전에는 열지 마세요");
    });

  ok("지금 활성 종목은 BTCUSDT 하나다", App.Config.getActiveSymbol() === "BTCUSDT",
    String(App.Config.getActiveSymbol()));

  /* 파일 안에서도 activeSymbol 에 다시 대입하는 곳이 없어야 합니다. */
  const cfg = strip(read("js/config.js"));
  const 대입 = (cfg.match(/activeSymbol\s*=[^=]/g) || []);
  ok("js/config.js 에서 activeSymbol 대입이 처음 한 번뿐이다", 대입.length === 1,
    "대입 " + 대입.length + "군데 — 종목을 바꾸는 길이 생겼을 수 있습니다");

  /* 등록소(SymbolRegistry)도 읽기 전용입니다. */
  const rkeys = Object.keys(App.SymbolRegistry || {});
  ok("App.SymbolRegistry 도 읽기 전용이다(getAll/getBySymbol/isMock)",
    rkeys.slice().sort().join(",") === "getAll,getBySymbol,isMock", rkeys.join(","));
}

/* =========================================================================
 * [2] symbol:change 를 쏘는 코드가 0곳이다
 * ========================================================================= */
section("[2] symbol:change 신호를 쏘는 곳이 없다");
{
  const EMIT = /emit\s*\(\s*["']symbol:change["']/;
  const ON = /on\s*\(\s*["']symbol:change["']/;

  const 쏘는곳 = [];
  const 듣는곳 = [];
  JS_FILES.forEach((f) => {
    const src = strip(read("js/" + f));
    if (EMIT.test(src)) 쏘는곳.push("js/" + f);
    if (ON.test(src)) 듣는곳.push("js/" + f);
  });
  const html = strip(read("index.html"));
  if (EMIT.test(html)) 쏘는곳.push("index.html");

  ok("symbol:change 를 쏘는 코드가 0곳이다", 쏘는곳.length === 0,
    "생겼습니다: " + 쏘는곳.join(", ") + " — 이 신호가 날아오는 순간 " +
    "차트·지표가 다른 종목으로 갈아탑니다. " +
    "포지션·미체결 안전장치가 먼저입니다(조사팀 2026-08-26 재현)");

  /* 듣는 곳은 있습니다 — "안 오는 신호를 기다리는 중" 이라는 현재 사실입니다.
     이게 0이 되면 누가 정리한 것이니 그것도 알려줘야 합니다. */
  ok("듣는 곳은 그대로 있다(" + 듣는곳.length + "곳, 안 오는 신호를 기다리는 중)",
    듣는곳.length >= 1, 듣는곳.join(", "));

  /* 배선을 미리 해 두고 신호만 안 쏘는 상태라, 나중에 쏘기 시작하면
     이 파일들이 한꺼번에 반응합니다. 어디인지 기록해 둡니다. */
  console.log("      └ 듣는 곳: " + 듣는곳.join(", "));
}

/* =========================================================================
 * [3] 종목 UI ① — 상단 드롭다운(js/symbol-selector.js)
 * ========================================================================= */
section("[3] 종목 UI ① 상단 드롭다운");
{
  const sel = strip(read("js/symbol-selector.js"));
  ok("mock 종목이면 alert 로 알린다", /dataSource === "mock"/.test(sel) && /alert\(/.test(sel));
  ok("alert 뒤에 return 으로 멈춘다", /alert\([\s\S]{0,200}?return;/.test(sel),
    "return 이 없으면 알림만 띄우고 그대로 진행합니다");
  ok("이 파일이 종목을 실제로 바꾸지 않는다", !/setActiveSymbol|symbol:change/.test(sel),
    "종목을 바꾸는 호출이 들어왔습니다");

  /* 글자만 보지 않고 실제로 눌러 봅니다. */
  win.eval(read("js/symbol-selector.js"));
  App.SymbolSelector.init();
  const btn = doc.getElementById("symbol-select-btn");
  ok("드롭다운 버튼이 화면에 있다", !!btn);
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const dd = doc.getElementById("symbol-select-dropdown");
  const opts = dd.querySelectorAll(".symbol-option");
  ok("종목 5개가 나열된다", opts.length === 5, String(opts.length));
  ok("BTC 말고는 전부 '준비중' 배지다",
    dd.querySelectorAll(".symbol-option-disabled").length === 4,
    String(dd.querySelectorAll(".symbol-option-disabled").length));

  win.__lastAlert = null;
  dd.querySelector('[data-symbol="ETHUSDT"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("이더리움을 눌러도 '준비 중' 안내만 뜬다", /준비 중/.test(String(win.__lastAlert)),
    String(win.__lastAlert));
  ok("눌러도 활성 종목이 안 바뀐다", App.Config.getActiveSymbol() === "BTCUSDT",
    "바뀌었습니다: " + App.Config.getActiveSymbol() +
    " — 보유 중인 포지션이 다른 종목 시세로 강제청산됩니다");

  /* 삼성전자(주식)·NASDAQ(지수)도 같은지 확인 — 암호화폐만 막으면 안 됩니다. */
  ["005930", "000660", "NDX"].forEach((s) => {
    btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true })); // 다시 열기
    win.__lastAlert = null;
    const el = dd.querySelector('[data-symbol="' + s + '"]');
    el.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok(s + " 를 눌러도 종목이 안 바뀐다",
      App.Config.getActiveSymbol() === "BTCUSDT" && /준비 중/.test(String(win.__lastAlert)),
      String(win.__lastAlert));
  });
}

/* =========================================================================
 * [4] 종목 UI ② — 주문창 안 종목 목록(js/order-panel-amitalk.js)
 *     ⚠ 종목 UI 가 두 곳입니다. 한 곳만 보면 다른 곳이 뚫립니다.
 * ========================================================================= */
section("[4] 종목 UI ② 주문창 종목 목록");
{
  const amit = strip(read("js/order-panel-amitalk.js"));
  ok("주문창에도 종목 목록(#ami-symbols)이 있다", /ami-symbols/.test(amit));
  ok("주문창 종목 목록이 '준비중' 안내만 하고 끝난다",
    /종목은 준비중입니다/.test(amit) && /alert\(/.test(amit));
  ok("주문창 종목 목록이 종목을 실제로 바꾸지 않는다",
    !/setActiveSymbol|symbol:change/.test(amit),
    "종목을 바꾸는 호출이 들어왔습니다");

  const box = doc.getElementById("ami-symbols");
  const rows = box.querySelectorAll(".ami-symbol-row");
  ok("주문창에 종목 줄이 그려져 있다", rows.length >= 2, String(rows.length));
  win.__lastAlert = null;
  box.querySelector('.ami-symbol-row[data-symbol="ETHUSDT"]')
    .dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("주문창에서 이더리움을 눌러도 안내만 뜬다", /준비중/.test(String(win.__lastAlert)),
    String(win.__lastAlert));
  ok("주문창에서 눌러도 활성 종목이 안 바뀐다", App.Config.getActiveSymbol() === "BTCUSDT",
    "바뀌었습니다: " + App.Config.getActiveSymbol());
}

/* =========================================================================
 * [5] 포지션·미체결에 symbol 이 아직 없다 (현재 사실)
 *     생기면 실패합니다 → "안전장치가 들어왔다" 는 신호입니다.
 * ========================================================================= */
section("[5] 포지션·미체결에 symbol 이 없다");
{
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);

  const r = App.Trading.openPosition("long", 1000);
  ok("실제 trading.js 로 포지션이 열렸다", r.ok === true, r.error || "");
  const posKeys = Object.keys(App.Trading.getSnapshot().position || {});
  ok("포지션에 symbol 칸이 없다(현재 사실)", posKeys.indexOf("symbol") === -1,
    "symbol 이 생겼습니다 — 안전장치가 들어온 것으로 보입니다. " +
    "이제 종목 전환을 여는 것을 검토해도 됩니다. 이 파일을 새 기준으로 고쳐 주세요");
  console.log("      └ 포지션 칸: " + posKeys.join(","));

  App.Trading.closePosition();
  const r2 = App.Trading.placeLimitOrder("long", 100000, 1000);
  ok("실제 trading.js 로 미체결 주문이 걸렸다", r2.ok === true, r2.error || "");
  const ordKeys = Object.keys(App.Trading.getSnapshot().pendingOrder || {});
  ok("미체결 주문에 symbol 칸이 없다(현재 사실)", ordKeys.indexOf("symbol") === -1,
    "symbol 이 생겼습니다 — 안전장치가 들어온 것으로 보입니다");
  console.log("      └ 미체결 칸: " + ordKeys.join(","));

  App.Trading.cancelPendingOrder();

  /* 시세를 받을 때 종목을 확인하기는 합니다 — 다만 '지금 활성 종목' 과만 비교합니다.
     즉 활성 종목이 바뀌면 그 즉시 새 종목 시세가 옛 포지션에 그대로 들어옵니다. */
  const trading = strip(read("js/trading.js"));
  ok("시세는 '지금 활성 종목' 과만 대조한다(포지션의 종목이 아니라)",
    /payload\.symbol !== cfg\(\)\.getActiveSymbol\(\)/.test(trading),
    "이 문장이 바뀌었으면 안전장치가 들어왔거나 망가졌습니다");
  ok("포지션을 만드는 곳에 symbol 을 넣지 않는다",
    !/state\.position = \{[\s\S]{0,400}?symbol/.test(trading));
}

/* =========================================================================
 * [6] 열리면 무슨 일이 나는지 — 조사팀 재현을 숫자로 남깁니다
 *     ⚠ 이건 "지금 고장" 이 아니라 "열면 이렇게 된다" 는 근거입니다.
 * ========================================================================= */
section("[6] 열리면 어떻게 되는가 (조사팀 재현)");
{
  const t = boot(); // 깨끗한 계정으로 다시
  t.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  t.App.Trading.setLeverage(10);
  const 시작잔고 = t.App.Trading.getSnapshot().balance;
  const opened = t.App.Trading.openPosition("long", 1000);
  ok("BTC 110,000 에 10배 롱(증거금 1,000) 진입", opened.ok === true, opened.error || "");
  ok("청산가가 99,550 이다", opened.ok && Math.round(opened.position.liq) === 99550,
    opened.ok ? String(opened.position.liq) : "");

  /* 종목만 ETHUSDT 로 바뀌었다고 가정합니다.
     활성 종목이 바뀌면 trading.js 의 종목 대조를 그대로 통과하므로,
     ETH 시세(3,000)가 BTC 포지션에 곧장 들어옵니다. */
  t.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 3000 });
  const s = t.App.Trading.getSnapshot();
  const 청산 = (s.closedTrades || [])[0] || null;

  ok("한 틱 만에 포지션이 사라진다", s.position === null);
  ok("사유가 '강제청산' 이다", 청산 && 청산.reason === "강제청산",
    청산 ? 청산.reason : "기록 없음");
  ok("손익 -1,000 (증거금 전액)", 청산 && 청산.pnl === -1000, 청산 ? String(청산.pnl) : "");
  ok("ROE -100%", 청산 && 청산.pnlPercent === -100, 청산 ? String(청산.pnlPercent) : "");
  ok("잔고가 100,000 → 98,995 (수수료 포함 1,005 손실)",
    시작잔고 === 100000 && Math.round(s.balance) === 98995,
    시작잔고 + " → " + s.balance);
  console.log("      └ BTC 시세는 한 푼도 안 움직였는데 1,005 USDT 가 사라집니다");
}

/* =========================================================================
 * [7] 종목 목록의 현재 사실
 * ========================================================================= */
section("[7] 종목 목록의 현재 사실");
{
  const all = App.SymbolRegistry.getAll();
  ok("등록소에 종목 5개가 있다", all.length === 5, String(all.length));
  ok("실제 시세가 붙은 종목은 BTCUSDT 하나뿐이다",
    all.filter((s) => s.dataSource !== "mock").map((s) => s.symbol).join(",") === "BTCUSDT",
    all.filter((s) => s.dataSource !== "mock").map((s) => s.symbol).join(","));
  ["ETHUSDT", "005930", "000660", "NDX"].forEach((s) => {
    ok(s + " 는 아직 mock 이다", App.SymbolRegistry.isMock(s) === true,
      s + " 가 실제 시세로 바뀌었습니다. " +
      "포지션·미체결 안전장치가 같이 들어갔는지 확인하세요");
  });
  ok("mock 종목의 가짜 시세를 만드는 코드가 없다",
    !JS_FILES.some((f) => /mockPrice|fakePrice|randomPrice/.test(strip(read("js/" + f)))),
    "가짜 시세를 실제 시세처럼 보이면 안 됩니다");
}

/* =========================================================================
 * [8] 수정 금지 파일을 건드리지 않았다
 *     (문자열이 아니라 md5 로 봅니다 — 주석에 파일명이 있어 오탐이 납니다)
 * ========================================================================= */
section("[8] 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
   ["chart.js", "02ddcb000d577131f797143d08c09123"],
   ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"]].forEach(([f, h]) => {
    ok(f + " 를 건드리지 않았다", md5(f) === h, md5(f));
  });
}

/* =========================================================================
 * [9] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const pkg = read("package.json");
  ok("package.json 의 test 목록에 이 파일이 있다",
    pkg.indexOf("tests/symbol-switch-unbuilt.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다.
   npm test 는 && 로 이어져 있어, 안 끝나면 뒤 테스트가 전부 안 돌아갑니다. */
process.exit(0);
