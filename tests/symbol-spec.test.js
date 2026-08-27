/* tests/symbol-spec.test.js
 * =========================================================================
 * 종목 코드 4개 + 종목별 규격표를 못 박습니다 — 2026-08-27
 * =========================================================================
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────
 * 예전 js/symbol-registry.js 는 값이 전부 틀려 있었습니다.
 *
 *     {symbol:"005930", 삼성전자}   → 바이낸스 실제 코드는 SAMSUNGUSDT
 *     {symbol:"000660", SK하이닉스} → 바이낸스 실제 코드는 SKHYNIXUSDT
 *     {symbol:"NDX", NASDAQ 100}    → 바이낸스 실제 코드는 QQQUSDT
 *
 * 코드가 틀린 채로 4번(시세 재연결)을 하면 아무 시세도 안 붙습니다.
 * 그런데 이걸 지키는 테스트가 0개였습니다.
 *
 * ── 이 파일이 지키는 것 ─────────────────────────────────────────────────
 *   [1] 종목 코드 4개가 바이낸스 실제 코드다 / 옛 코드가 안 남아 있다
 *   [2] 나스닥을 "지수"라고 부르지 않는다 (QQQ 는 ETF, 41배 차이)
 *   [3] 규격표가 한 곳(App.SymbolRegistry)에만 있고 네 종목 값이 같다
 *   [4] 단위 이름만 종목마다 다르다 (삼성전자가 "BTC" 로 나오면 틀린 정보)
 *   [5] 종목 전환이 열려 있고, 열린 종목은 실제로 바뀐다 (2026-08-27 개정)
 *   [6] 가짜 시세를 만드는 어댑터가 하나도 안 만들어진다
 *   [7] ⭐ 화면 레버리지 상한이 엔진 상한(trading.js)을 넘지 않는다
 *   [8] 수정 금지 파일 무수정
 *
 * ⭐ [7] 이 이 파일에서 가장 중요합니다.
 *    js/trading.js:96 에 MAX_LEVERAGE = 125 가 박혀 있고 수정 금지입니다.
 *    화면에서 150 을 고를 수 있게 만들면 엔진이 조용히 125 로 깎습니다.
 *    회원은 150배로 잡은 줄 알지만 실제로는 125배 — 증거금도 청산가도
 *    화면과 다릅니다. "조용한 고장"이라 회원이 눈치채지 못합니다.
 *    그래서 화면 상한 > 엔진 상한이 되는 순간 이 테스트가 터집니다.
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
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

console.log("\n종목 코드 4개 + 종목별 규격표");

const { App, win, doc } = boot({
  /* ⚠ 2026-08-27 — 4번 관문을 같이 태웁니다. 안 태우면 아래 [5] 의 클릭 검사가
     App.SymbolStreamSwitch 가 없어서 "준비 중" 으로 조용히 떨어져 헛돕니다. */
  extra: ["js/symbol-guard.js", "js/symbol-stream-switch.js"],
});
["js/market-data/binance-adapter.js", "js/market-data/mock-adapter.js", "js/market-data.js",
  "js/symbol-selector.js"].forEach((f) => win.eval(read(f)));

const EXPECT = ["BTCUSDT", "QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"];

/* =========================================================================
 * [1] 종목 코드
 * ========================================================================= */
section("[1] 종목 코드 4개가 바이낸스 실제 코드다");
{
  const all = App.SymbolRegistry.getAll();
  ok("종목이 4개다", all.length === 4, String(all.length));
  ok("코드가 BTCUSDT,QQQUSDT,SAMSUNGUSDT,SKHYNIXUSDT 다",
    all.map((s) => s.symbol).join(",") === EXPECT.join(","),
    all.map((s) => s.symbol).join(","));

  /* 옛 코드가 남아 있으면 4번에서 시세가 안 붙습니다. */
  const body = strip(read("js/symbol-registry.js"));
  [["005930", "SAMSUNGUSDT"], ["000660", "SKHYNIXUSDT"], ["NDX", "QQQUSDT"]].forEach(([old, now]) => {
    ok("옛 코드 " + old + " 가 본문에 안 남아 있다 (지금은 " + now + ")",
      body.indexOf(old) < 0, "아직 " + old + " 가 있습니다");
  });
  ok("이더리움은 목록에서 빠졌다 (대표 결정)",
    !all.some((s) => s.symbol === "ETHUSDT"), "ETHUSDT 가 아직 있습니다");

  /* 이름도 확인 — 코드만 맞고 이름이 틀리면 회원이 헷갈립니다. */
  const NAME = { BTCUSDT: "비트코인", QQQUSDT: "나스닥", SAMSUNGUSDT: "삼성전자", SKHYNIXUSDT: "SK하이닉스" };
  all.forEach((s) => ok(s.symbol + " 의 이름이 " + NAME[s.symbol] + " 다", s.name === NAME[s.symbol], s.name));
}

/* =========================================================================
 * [2] 나스닥을 "지수" 라고 부르지 않는다
 *     바이낸스 QQQUSDT 는 나스닥100 지수가 아니라 그 지수를 따라가는
 *     ETF(QQQ) 입니다. 진짜 지수 29,209 vs QQQ 717 — 41배 차이납니다.
 *     "지수" 라고 쓰면 회원이 잘못된 정보로 판단하게 됩니다.
 * ========================================================================= */
section("[2] 나스닥 표기");
{
  const meta = App.SymbolRegistry.getBySymbol("QQQUSDT");
  ok("이름이 정확히 '나스닥' 이다", meta.name === "나스닥", meta.name);
  ["나스닥100", "나스닥 100", "NASDAQ", "나스닥 지수"].forEach((bad) => {
    ok("이름에 '" + bad + "' 를 쓰지 않는다", meta.name.indexOf(bad) < 0, meta.name);
  });

  /* 화면에 실제로 그려지는 글자도 봅니다. */
  App.SymbolSelector.init();
  doc.getElementById("symbol-select-btn").dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  const txt = doc.getElementById("symbol-select-dropdown").textContent;
  ok("드롭다운 글자에도 '지수' 표기가 없다",
    !/나스닥100|나스닥 100|NASDAQ|나스닥 지수/.test(txt), txt);
}

/* =========================================================================
 * [3] 규격표 — 한 곳에만 있고, 네 종목 값이 같다
 *     대표 지시(2026-08-27): "매수하는 단위도 비트코인이랑 똑같은 시스템으로 해"
 * ========================================================================= */
section("[3] 규격표 — 네 종목 값이 같다");
{
  ok("규격을 읽는 통로가 있다 (getSpec)", typeof App.SymbolRegistry.getSpec === "function");

  const 공통 = { minQty: 0.001, qtyStep: 0.001, tickSize: 0.1, minNotional: 50, qtyDecimals: 6, maxLeverage: 150 };
  EXPECT.forEach((sym) => {
    const sp = App.SymbolRegistry.getSpec(sym);
    ok(sym + " 규격을 읽을 수 있다", !!sp);
    Object.keys(공통).forEach((k) => {
      ok("  " + sym + "." + k + " = " + 공통[k], sp[k] === 공통[k], String(sp[k]));
    });
  });

  /* 모르는 종목이면 지어내지 않고 null 을 줍니다. */
  ok("등록 안 된 종목은 규격을 지어내지 않는다 (null)",
    App.SymbolRegistry.getSpec("NOPEUSDT") === null,
    String(App.SymbolRegistry.getSpec("NOPEUSDT")));

  /* 규격 숫자가 다른 파일에 또 박혀 있으면 단일 출처가 깨집니다. */
  const sel = strip(read("js/symbol-selector.js"));
  ok("symbol-selector.js 가 규격 숫자를 따로 안 들고 있다",
    !/minQty|tickSize|minNotional|maxLeverage/.test(sel),
    "규격은 App.SymbolRegistry.getSpec 으로만 읽어야 합니다");
}

/* =========================================================================
 * [4] 단위 이름만 종목마다 다르다
 *     삼성전자 수량이 "1.020000 BTC" 로 나오면 틀린 정보입니다.
 * ========================================================================= */
section("[4] 단위 이름은 종목 것으로");
{
  const UNIT = { BTCUSDT: "BTC", QQQUSDT: "주", SAMSUNGUSDT: "주", SKHYNIXUSDT: "주" };
  EXPECT.forEach((sym) => {
    ok(sym + " 의 단위 이름이 '" + UNIT[sym] + "' 다",
      App.SymbolRegistry.getSpec(sym).unit === UNIT[sym],
      App.SymbolRegistry.getSpec(sym).unit);
  });
  ok("주식·지수 종목의 단위가 BTC 가 아니다",
    ["QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"].every((s) => App.SymbolRegistry.getSpec(s).unit !== "BTC"),
    "삼성전자 수량이 BTC 로 표시되면 틀린 정보입니다");
}

/* =========================================================================
 * [5] 종목 전환 — 2026-08-27 기준 개정
 *     옛 기준: "아직 잠겨 있다(BTCUSDT 만 열림)"
 *     새 기준: 4번 관문(js/symbol-stream-switch.js)이 들어와 네 종목이
 *              열렸습니다. 그래서 "열렸다면 눌렀을 때 정말 바뀌는가" 와
 *              "배지가 사실과 같은가" 를 봅니다.
 *     ⚠ 옛 기준을 그냥 지우지 않았습니다 — 잠긴 종목이 다시 생기면
 *        그 종목은 여전히 "준비 중" 으로 막혀야 합니다(아래 두 갈래).
 * ========================================================================= */
section("[5] 종목 전환 — 열린 종목은 바뀌고, 잠긴 종목은 막힌다");
{
  const 열린 = EXPECT.filter((s) => App.SymbolRegistry.isEnabled(s));
  const 잠긴 = EXPECT.filter((s) => !App.SymbolRegistry.isEnabled(s));

  ok("네 종목이 전부 열려 있다(4번 관문 완료)",
    열린.join(",") === "BTCUSDT,QQQUSDT,SAMSUNGUSDT,SKHYNIXUSDT",
    열린.join(",") + " — 목록이 바뀌었으면 여기 기준도 사실대로 고치세요");
  ok("전환 통로는 App.SymbolStreamSwitch.switchTo 하나다",
    typeof App.SymbolStreamSwitch.switchTo === "function" &&
      typeof App.Config.setActiveSymbol === "undefined",
    "App.Config.setActiveSymbol 이 생겼습니다 — 전환 경로가 둘이 되면 " +
    "한쪽이 전환 순서를 안 지킵니다");

  const btn = doc.getElementById("symbol-select-btn");
  const dd = doc.getElementById("symbol-select-dropdown");
  btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("드롭다운에 4줄이 뜬다", dd.querySelectorAll(".symbol-option").length === 4,
    String(dd.querySelectorAll(".symbol-option").length));

  /* (가) 잠긴 종목 — 눌러도 "준비 중" 만 뜨고 안 바뀐다 */
  잠긴.forEach((sym) => {
    btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    win.__lastAlert = null;
    const 앞 = App.Config.getActiveSymbol();
    dd.querySelector('[data-symbol="' + sym + '"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok(sym + " 는 잠겨 있어 눌러도 '준비 중' 만 뜨고 안 바뀐다",
      /준비 중/.test(String(win.__lastAlert)) && App.Config.getActiveSymbol() === 앞,
      String(win.__lastAlert) + " / 활성종목=" + App.Config.getActiveSymbol());
  });

  /* (나) 열린 종목 — 눌렀으면 실제로 바뀌어야 한다 */
  열린.forEach((sym) => {
    if (sym === App.Config.getActiveSymbol()) return;
    btn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    dd.querySelector('[data-symbol="' + sym + '"]').dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
    ok(sym + " 를 누르면 실제로 " + sym + " 로 바뀐다",
      App.Config.getActiveSymbol() === sym,
      "활성종목=" + App.Config.getActiveSymbol() +
      " — 안 바뀌면 회원은 이름만 바뀐 옛 종목 숫자를 봅니다");
  });
  App.SymbolStreamSwitch.switchTo("BTCUSDT");

  /* 종목 UI 가 두 곳입니다 — 주문창 목록도 같은 판정이어야 합니다. */
  const box = doc.getElementById("ami-symbols");
  const rows = box.querySelectorAll(".ami-symbol-row");
  ok("주문창 종목 목록에도 4줄이 뜬다", rows.length === 4, String(rows.length));
  ok("주문창 '거래중' 배지 수가 열린 종목 수와 같다",
    box.querySelectorAll(".ami-symbol-badge.on").length === 열린.length,
    String(box.querySelectorAll(".ami-symbol-badge.on").length) + " vs 열린 종목 " + 열린.length +
    " — 배지가 사실과 다르면 회원이 잘못 판단합니다");
}

/* =========================================================================
 * [6] 가짜 시세를 만들지 않는다
 *     네 종목 다 진짜 바이낸스 종목이라 mock-adapter 를 태울 이유가 없습니다.
 *     시세가 아직 안 오는 종목은 값이 없는 채로 둡니다(지어내지 않습니다).
 * ========================================================================= */
section("[6] 가짜 시세 금지");
{
  let mock생성 = 0;
  const orig = win.App.MarketDataAdapters.Mock.create;
  win.App.MarketDataAdapters.Mock.create = function (s) { mock생성++; return orig(s); };
  EXPECT.forEach((s) => App.MarketData.getAdapter(s));
  ok("mock 어댑터가 한 번도 안 만들어진다", mock생성 === 0, String(mock생성) + "번 만들어졌습니다");
  EXPECT.forEach((s) => {
    const a = App.MarketData.getAdapter(s);
    ok(s + " 어댑터가 가짜가 아니다 (isMock=false)", a.isMock === false, String(a.isMock));
  });
  ok("아직 시세가 안 오는 종목은 값이 없다(지어내지 않는다)",
    ["QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"].every((s) => App.MarketData.getAdapter(s).getPrice() === null),
    "없는 시세에 숫자가 들어갔습니다");
  win.App.MarketDataAdapters.Mock.create = orig;
}

/* =========================================================================
 * [7] ⭐ 화면 레버리지 상한이 엔진 상한을 넘지 않는다
 *     넘으면 회원이 150배로 잡은 줄 알지만 엔진은 125배로 처리합니다.
 *     화면과 실제가 다른 "조용한 고장" 이라 회원이 눈치채지 못합니다.
 * ========================================================================= */
section("[7] 화면 레버리지 상한 ≤ 엔진 상한");
{
  /* 엔진 상한을 글자로 읽지 않고 실제로 눌러서 잽니다. */
  function 엔진이받는최대() {
    let hi = 1;
    for (let v = 1; v <= 1000; v++) {
      App.Trading.setLeverage(v);
      const got = App.Trading.getSnapshot().leverage;
      if (got > hi) hi = got;
    }
    return hi;
  }
  const 엔진최대 = 엔진이받는최대();
  ok("엔진(js/trading.js)이 실제로 받는 최대 배율을 쟀다 = " + 엔진최대, 엔진최대 >= 1);

  /* 화면 쪽 상한 — 프리셋과 슬라이더 max 둘 다 봅니다. */
  const lm = read("js/leverage-modal.js");
  const presetLine = (lm.match(/var PRESETS\s*=\s*\[([^\]]*)\]/) || [])[1] || "";
  const presets = presetLine.split(",").map((x) => parseInt(x, 10)).filter((n) => isFinite(n));
  const sliderMax = parseInt((lm.match(/class="lev-modal-range"[^>]*max="(\d+)"/) || [])[1], 10);
  const 화면최대 = Math.max.apply(null, presets.concat([sliderMax || 0]));

  ok("프리셋을 읽었다 (" + presets.join(",") + ")", presets.length > 0);
  ok("화면 상한(" + 화면최대 + ") 이 엔진 상한(" + 엔진최대 + ") 을 넘지 않는다",
    화면최대 <= 엔진최대,
    "화면에서 " + 화면최대 + "배를 고를 수 있는데 엔진은 " + 엔진최대 + "배로 깎습니다. " +
    "회원이 잘못된 배율/청산가를 보게 됩니다. js/trading.js 의 MAX_LEVERAGE 를 " +
    "먼저 풀어야 하는데 그 파일은 수정 금지 + 대표 결재 항목입니다");

  /* 레버리지 게이트(App.LeverageGate)도 엔진을 넘지 않아야 합니다. */
  const gateMax = App.LeverageGate && App.LeverageGate.currentMax ? App.LeverageGate.currentMax() : null;
  if (gateMax !== null) {
    ok("LeverageGate 상한(" + gateMax + ") 도 엔진 상한을 안 넘는다", gateMax <= 엔진최대, String(gateMax));
  }

  /* 규격표의 maxLeverage 는 "대표가 정한 목표값" 이라 엔진보다 클 수 있습니다.
     그 경우 화면에 그대로 쓰면 안 되므로, 규격표를 화면 상한으로 직접
     끌어다 쓰는 코드가 없는지 확인합니다. */
  ok("규격표의 maxLeverage 를 화면 상한으로 바로 갖다 쓰지 않는다",
    !/maxLeverage/.test(strip(lm)),
    "js/leverage-modal.js 가 규격표 maxLeverage(150)를 그대로 쓰면 " +
    "엔진 상한(" + 엔진최대 + ")과 어긋납니다");
}

/* =========================================================================
 * [8] 수정 금지 파일 무수정
 * ========================================================================= */
section("[8] 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  [["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
    ["ui.js", "333fc427e75b47b306699c92aa4e7b50"],
    ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"],
    ["chart.js", "02ddcb000d577131f797143d08c09123"]].forEach(([f, h]) => {
    ok(f + " 를 건드리지 않았다", md5(f) === h, md5(f));
  });
}

/* =========================================================================
 * [9] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[9] 테스트 등록");
{
  ok("package.json 의 test 목록에 이 파일이 있다",
    read("package.json").indexOf("tests/symbol-spec.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
