/* tests/trade-history-symbol-unit.test.js
 * =========================================================================
 * 거래내역 수량 단위는 "그 거래의 종목" 을 따른다 — 2026-08-27 [P2]
 * =========================================================================
 *
 * ── 무엇이 고장나 있었나 ──────────────────────────────────────────────────
 *   삼성전자로 바꾼 뒤 거래내역을 열면 과거 비트코인 거래가 "0.050000 주".
 *
 *       js/trade-history.js:123   App.Utils.formatQty(t.quantity)
 *                                                     ↑ 종목을 안 넘김
 *
 *   App.Utils.formatQty(n, symbol) 는 symbol 이 없으면 App.Config 의
 *   "지금 활성 종목" 으로 떨어집니다(js/utils.js:78-80). 거래내역은
 *   "지금 무슨 종목을 보고 있는가" 가 아니라 "그 거래가 무슨 종목이었나"
 *   를 써야 하는 표입니다.
 *
 *   실측(고치기 전) — 활성 종목을 삼성전자로 두면 네 종목 거래가 전부 "주".
 *   숫자도 화면도 멀쩡해서 회원은 고장인 줄 모르고 그대로 믿습니다.
 *
 * ── 이 파일이 지키는 것 ──────────────────────────────────────────────────
 *   1) 거래의 종목대로 단위가 나온다 (BTCUSDT→BTC, 나머지 셋→주)
 *   2) 활성 종목을 무엇으로 바꿔도 같은 거래는 같은 단위로 나온다
 *   3) 종목 칸이 없거나 빈 옛 기록은 BTCUSDT(=BTC) 로 떨어진다
 *      — 그때는 거래 가능한 종목이 BTCUSDT 뿐이었으므로 그것이 사실입니다.
 *        여기서 "지금 활성 종목" 으로 떨어지면 안 됩니다(그게 이 버그입니다)
 *   4) 자릿수는 종목별로 나누지 않는다 — 대표 지시(2026-08-27)
 *      "매수하는 단위도 비트코인이랑 똑같은 시스템으로 해"
 *   5) 안내문에 BTCUSDT 가 박혀 있지 않다 (네 종목이 열렸습니다)
 *   6) 종목 이름 규칙 — "나스닥100" · "나스닥 지수" · "NASDAQ" 금지
 *
 * 네트워크는 한 번도 안 씁니다. 사이트 코드는 읽어서 띄우기만 합니다.
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

/* -------------------------------------------------------------------------
 * 작은 부팅기 — 서버 거래내역 패널만 띄웁니다.
 * ----------------------------------------------------------------------- */
function boot() {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () {
    this.close = () => {};
    this.send = () => {};
  };
  win.fetch = () => {
    throw new Error("테스트 중에는 네트워크를 쓰지 않습니다");
  };
  win.alert = () => {};
  win.eval(
    "window.App = window.App || {};" +
      "App.Bus = (function(){ var L = {}; return {" +
      "  on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
      "  off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
      "  emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{ f(p); }catch(x){} }); }" +
      "}; })();" +
      "App.bootApp = function(){ return true; };" +
      "App.SupabaseClient = { get: function(){ return null; } };"
  );
  ["js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js", "js/trade-history.js"].forEach((f) =>
    win.eval(read(f))
  );
  return { win: win, App: win.App, doc: win.document };
}

function setActive(App, symbol) {
  App.Config.getActiveSymbol = function () {
    return symbol;
  };
}

/* js/supabase-sync.js 가 실제로 넣는 것과 같은 모양의 서버 trades 행.
   symbol 이 null 이면 칸 자체를 넣지 않습니다(옛 기록). */
function 서버거래(symbol, qty) {
  const t = {
    user_id: "u1",
    side: "long",
    entry_price: 110000,
    exit_price: 111000,
    quantity: qty === undefined ? 0.05 : qty,
    leverage: 10,
    margin: 1000,
    pnl: 100,
    roe: 10,
    return_rate: 1,
    fee: 5,
    close_reason: "수동청산",
    created_at: new Date(1756200000000).toISOString(),
  };
  if (symbol !== null) t.symbol = symbol;
  return t;
}

/* 수량 칸(5번째 <td>)에 실제로 찍힌 글자를 읽습니다. */
function 수량칸(활성종목, rows) {
  const { App, doc } = boot();
  const tbody = doc.getElementById("cloud-history-body");
  if (!tbody) throw new Error("#cloud-history-body 가 index.html 에 없습니다");
  App.TradeHistory.init();
  setActive(App, 활성종목);
  App.TradeHistory.renderRows(rows);
  return Array.prototype.slice.call(tbody.querySelectorAll("tr")).map(function (tr) {
    return tr.children[4].textContent;
  });
}

const 네종목 = [
  ["BTCUSDT", "BTC"],
  ["QQQUSDT", "주"],
  ["SAMSUNGUSDT", "주"],
  ["SKHYNIXUSDT", "주"],
];

console.log("\n거래내역 수량 단위는 '그 거래의 종목' 을 따른다 [P2]");

/* =========================================================================
 * [1] 거래의 종목대로 나온다 (활성 종목은 삼성전자로 둔 채)
 * ========================================================================= */
section("[1] 활성 종목을 삼성전자로 둔 채 — 거래마다 제 단위가 나온다");
{
  const rows = 네종목.map(function (p) {
    return 서버거래(p[0]);
  });
  const 결과 = 수량칸("SAMSUNGUSDT", rows);
  네종목.forEach(function (p, i) {
    ok(p[0] + " 거래는 '" + p[1] + "' 로 나온다", 결과[i] === "0.050000 " + p[1], 결과[i]);
  });
  console.log("      └ " + 결과.join(" / "));
}

/* =========================================================================
 * [2] 활성 종목을 바꿔도 흔들리지 않는다
 * ========================================================================= */
section("[2] 활성 종목을 무엇으로 바꿔도 같은 거래는 같은 단위");
{
  네종목.forEach(function (거래) {
    const 본것 = 네종목.map(function (활성) {
      return 수량칸(활성[0], [서버거래(거래[0])])[0];
    });
    const 전부같나 = 본것.every(function (x) {
      return x === "0.050000 " + 거래[1];
    });
    ok(거래[0] + " 거래는 활성 종목 4가지 모두에서 '" + 거래[1] + "'", 전부같나, 본것.join(" / "));
  });
}

/* =========================================================================
 * [3] 옛 기록은 BTCUSDT 로 떨어진다 (활성 종목으로 떨어지면 안 됩니다)
 * ========================================================================= */
section("[3] 종목 칸이 없는 옛 기록");
{
  네종목.forEach(function (활성) {
    const 칸없음 = 수량칸(활성[0], [서버거래(null)])[0];
    const 빈값 = 수량칸(활성[0], [서버거래("")])[0];
    ok("활성=" + 활성[0] + " 에서도 옛 기록(칸 없음)은 BTC", 칸없음 === "0.050000 BTC", 칸없음);
    ok("활성=" + 활성[0] + " 에서도 옛 기록(빈 문자열)은 BTC", 빈값 === "0.050000 BTC", 빈값);
  });

  const th = read("js/trade-history.js");
  ok("옛 기록이 떨어질 곳이 BTCUSDT 로 못 박혀 있다", /DEFAULT_SYMBOL = "BTCUSDT"/.test(th), "이걸 없애면 옛 기록이 활성 종목으로 흔들립니다");
  ok("수량 칸에 그 거래의 종목을 넘긴다", /formatQty\(t\.quantity, rowSymbol\(t\)\)/.test(th), "종목을 안 넘기면 활성 종목으로 떨어집니다");
}

/* =========================================================================
 * [4] 자릿수는 종목별로 나누지 않는다 (대표 지시 2026-08-27)
 * ========================================================================= */
section("[4] 자릿수는 네 종목이 똑같다 — 바뀌는 것은 이름뿐");
{
  const 소수점 = 네종목.map(function (p) {
    const txt = 수량칸("BTCUSDT", [서버거래(p[0], 1.5)])[0];
    return (txt.split(" ")[0].split(".")[1] || "").length;
  });
  ok("네 종목 모두 소수점 6자리", 소수점.every(function (d) { return d === 6; }), 소수점.join(","));
  ok("App.Utils.QTY_DECIMALS 가 6 하나뿐이다", /QTY_DECIMALS = 6/.test(read("js/utils.js")));
  /* 주석에는 "일부러 안 읽는다" 는 설명이 있으므로 주석을 걷어내고 봅니다. */
  const 주석빼기 = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
  const utils없는주석 = read("js/utils.js").replace(주석빼기, " ");
  ok("규격표의 qtyDecimals 를 실제로 읽지는 않는다", utils없는주석.indexOf("qtyDecimals") < 0, "종목별로 자릿수를 나누면 대표 지시와 어긋납니다");
}

/* =========================================================================
 * [5] 안내문에 BTCUSDT 가 박혀 있지 않다
 * ========================================================================= */
section("[5] 안내문 — 네 종목이 열렸습니다");
{
  const html = read("index.html");
  const 안내 = (html.match(/<div class="disclaimer[\s\S]*?<\/div>/) || [""])[0];
  ok("안내문을 찾았다", 안내.length > 0);
  ok("안내문에 BTCUSDT 가 박혀 있지 않다", 안내.indexOf("BTCUSDT") < 0, "네 종목이 열렸는데 비트코인만 쓴다고 적혀 있습니다");
  ok("Binance Futures 시세를 쓴다는 사실은 그대로 남아 있다", /Binance Futures/.test(안내));
  ok("모의투자라는 안내는 그대로 남아 있다", /모의투자/.test(안내) && /실제 주문은 전송되지 않습니다/.test(안내));
}

/* =========================================================================
 * [6] 종목 이름 규칙
 * ========================================================================= */
section("[6] 종목 이름 — '나스닥' 만 씁니다");
{
  ["index.html", "js/trade-history.js", "js/utils.js"].forEach(function (f) {
    const s = read(f);
    ok(f + " 에 금지 문구가 없다", !/나스닥100|나스닥\s*지수|NASDAQ/.test(s), "허용은 '나스닥' 하나뿐입니다");
  });
}

/* =========================================================================
 * [7] 수정 금지 파일 12개
 * ========================================================================= */
section("[7] 수정 금지 파일 12개");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [
    ["trading.js", require("./_locked-hashes.js").TRADING],  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
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
 * [8] 테스트 등록
 *     기록팀이 사슬을 package.json → tests/_order.txt 로 옮기는 중이라
 *     둘 중 어디에 있어도 통과하게 봅니다.
 * ========================================================================= */
section("[8] 테스트 등록");
{
  const 파일명 = "tests/trade-history-symbol-unit.test.js";
  const pkg = read("package.json");
  let order = "";
  try {
    order = read("tests/_order.txt");
  } catch (e) {
    order = "";
  }
  ok("테스트 목록(package.json 또는 tests/_order.txt)에 이 파일이 있다", pkg.indexOf(파일명) >= 0 || order.indexOf(파일명) >= 0, "어느 쪽에도 없습니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
process.exit(fail === 0 ? 0 : 1);
