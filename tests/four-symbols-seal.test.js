/* tests/four-symbols-seal.test.js
 * =========================================================================
 * 오늘 연 네 종목을 봉인합니다 — 2026-08-27
 * =========================================================================
 *
 * ── 무엇을 봉인하나 ─────────────────────────────────────────────────────
 * 오늘 라이브에 이 세 개가 나갔습니다.
 *
 *     ef58871  종목 목록에 나스닥·삼성전자·SK하이닉스 (잠긴 상태로)
 *     b5dcf7a  종목 전환을 엽니다 (네 종목 전부 enabled)
 *     332c32f  레버리지 100배 확정
 *
 * 이 파일은 **다시 잠기거나 어긋나는 것**을 막습니다.
 *
 *   [1] 네 종목이 전부 열려 있다 — 하나라도 false 로 돌아가면 터집니다.
 *       개수도 셉니다(5번째가 조용히 늘어나는 것도 잡습니다).
 *   [2] "나스닥" 이지 "나스닥100" 이 아니다 — js/ 와 index.html 전체를 봅니다.
 *   [3] 종목 UI 세 곳이 같은 출처(App.SymbolRegistry)를 본다.
 *   [4] 전환 통로가 App.SymbolStreamSwitch.switchTo 하나다.
 *   [5] 안전장치(js/symbol-guard.js)가 약해지지 않았다.
 *       ⚠ symbol:change 만 막고 interval:change 는 통과해야 합니다.
 *   [6] 화면 배율 상한 ≤ 엔진 상한 검사가 살아 있다(tests/symbol-spec.test.js).
 *
 * ── [2] 를 왜 이렇게까지 하나 (대표 결정 2026-08-27) ────────────────────
 *   바이낸스의 QQQUSDT 는 나스닥100 **지수**가 아니라 그 지수를 따라가는
 *   ETF(QQQ) 입니다. 2026-08-27 실측 — 지수 29,209 vs QQQ 708. 약 41배
 *   차이납니다. "지수" 라고 부르면 회원이 화면 숫자를 보고 "왜 이렇게
 *   작지?" 하고 잘못 판단합니다. 그래서 이름은 "나스닥" 하나뿐입니다.
 *
 * ── [3] 을 "보이는 줄 수" 로 봉인하지 않은 이유 ─────────────────────────
 *   2026-08-27 현재 주문창 종목 목록은 4줄 중 1줄만 보입니다
 *   (style.css:1470 이 나머지를 숨기고 있고, 디자인팀이 고치는 중입니다).
 *   그래서 "몇 줄이 보이는가" 로 못 박으면 지금도 실패하고, 디자인이
 *   바뀔 때마다 또 실패합니다. 대신 **목록의 출처가 같은가**로 봉인합니다.
 *   실제로 registry 를 한 종목짜리로 바꿔치기해서, 세 UI 가 전부 그
 *   한 종목만 그리는지 확인합니다. 한쪽이 자기 목록을 들고 있으면
 *   거기만 4줄이 남아 그 자리에서 터집니다.
 *
 * ── [5] interval:change 를 같이 검사하는 이유 ───────────────────────────
 *   안전장치는 App.Bus.emit 을 감싸서 symbol:change 를 막습니다.
 *   여기서 "종목이 바뀌면 위험하니 방송을 다 막자" 로 손이 나가면
 *   interval:change 까지 죽어서 **시간봉 버튼이 통째로 먹통**이 됩니다.
 *   화면은 멀쩡하고 오류도 안 나는 조용한 고장이라 특히 위험합니다.
 *   그래서 포지션을 든 상태에서 1분→5분을 실제로 바꿔 보고,
 *   interval:change 가 그대로 도착하는지 확인합니다.
 *
 * ⚠ 이 파일은 사이트 코드를 한 글자도 고치지 않습니다. 읽기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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

/* 주석을 지웁니다. 주석에는 설명하려고 일부러 금지어를 써 둔 곳이 있어서
   (js/symbol-registry.js 머리말이 "나스닥100 지수가 아니라" 라고 적고 있습니다)
   주석까지 보면 오탐이 납니다. `https://` 의 // 는 지우지 않습니다. */
function strip(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

/* js/ 아래 모든 .js (하위 폴더 포함) + index.html + main.js */
function allSources() {
  const out = [];
  (function walk(dir) {
    fs.readdirSync(path.join(REPO, dir), { withFileTypes: true }).forEach((e) => {
      const rel = dir + "/" + e.name;
      if (e.isDirectory()) walk(rel);
      else if (/\.js$/.test(e.name)) out.push(rel);
    });
  })("js");
  return out.concat(["main.js", "index.html"]);
}

const EXPECT = ["BTCUSDT", "QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"];
const NAME = { BTCUSDT: "비트코인", QQQUSDT: "나스닥", SAMSUNGUSDT: "삼성전자", SKHYNIXUSDT: "SK하이닉스" };
/* 종목 UI 세 곳입니다. js/order-panel-amitalk.js:236 주석은 아직 "두 곳" 이라고
   적혀 있지만, 2026-08-27 js/symbol-tabs.js 가 들어오면서 세 곳이 됐습니다. */
const UI_FILES = ["js/symbol-selector.js", "js/order-panel-amitalk.js", "js/symbol-tabs.js"];

console.log("\n네 종목 개방 봉인 (비트코인·나스닥·삼성전자·SK하이닉스)");

/* 4번 관문(js/symbol-stream-switch.js)까지 같이 태웁니다. 안 태우면 전환이
   "준비 중" 으로 조용히 떨어져 아래 검사가 헛돕니다. */
const main = boot({ extra: ["js/symbol-guard.js", "js/symbol-stream-switch.js"] });
UI_FILES.concat(["js/market-data/binance-adapter.js", "js/market-data/mock-adapter.js", "js/market-data.js"])
  .forEach((f) => { try { main.win.eval(read(f)); } catch (e) { /* 이미 태워진 것 */ } });
main.App.SymbolSelector.init();
main.App.SymbolTabs.init();

/* =========================================================================
 * [1] 네 종목이 전부 열려 있다 (개수까지)
 * ========================================================================= */
section("[1] 네 종목이 전부 열려 있다");
{
  const R = main.App.SymbolRegistry;
  const all = R.getAll();

  ok("종목이 정확히 4개다 (5번째가 조용히 늘지 않았다)", all.length === 4,
    String(all.length) + "개입니다 — 늘리거나 줄였으면 대표 결정 사항입니다");
  ok("코드가 BTCUSDT,QQQUSDT,SAMSUNGUSDT,SKHYNIXUSDT 다 (순서까지)",
    all.map((s) => s.symbol).join(",") === EXPECT.join(","),
    all.map((s) => s.symbol).join(","));

  EXPECT.forEach((sym) => {
    const meta = R.getBySymbol(sym);
    ok(sym + "(" + NAME[sym] + ") 의 enabled 가 true 다", !!meta && meta.enabled === true,
      meta ? String(meta.enabled) + " — false 로 되돌리면 눌러도 '준비 중' 만 뜹니다" : "없는 종목");
    ok(sym + " 의 dataSource 가 binance 다 (가짜 시세를 안 만든다)",
      !!meta && meta.dataSource === "binance", meta ? String(meta.dataSource) : "없는 종목");
    ok(sym + " 가 isEnabled()=true / isMock()=false 다",
      R.isEnabled(sym) === true && R.isMock(sym) === false,
      "isEnabled=" + R.isEnabled(sym) + " isMock=" + R.isMock(sym));
  });

  ok("열린 종목 수가 4다", EXPECT.filter((s) => R.isEnabled(s)).length === 4,
    String(EXPECT.filter((s) => R.isEnabled(s)).length));

  /* 소스에 enabled:false 가 하나도 없어야 합니다. 런타임 값만 보면
     "네 종목은 true 인데 5번째만 false" 같은 상태를 놓칠 수 있습니다. */
  const regSrc = strip(read("js/symbol-registry.js"));
  ok("js/symbol-registry.js 본문에 enabled:false 가 없다",
    !/enabled\s*:\s*false/.test(regSrc), "잠긴 종목이 다시 생겼습니다");
  ok("본문의 enabled:true 개수가 4다",
    (regSrc.match(/enabled\s*:\s*true/g) || []).length === 4,
    String((regSrc.match(/enabled\s*:\s*true/g) || []).length));

  /* 얼려 뒀는지 — 밖에서 실수로 못 잠그게 합니다. */
  const btc = R.getBySymbol("BTCUSDT");
  try { btc.enabled = false; } catch (e) { /* strict 모드면 여기서 막힘 */ }
  ok("밖에서 enabled 를 바꿔도 안 바뀐다 (Object.freeze)",
    R.getBySymbol("BTCUSDT").enabled === true && R.isEnabled("BTCUSDT") === true,
    "얼음이 풀렸습니다 — 다른 모듈이 몰래 종목을 잠글 수 있습니다");
}

/* =========================================================================
 * [2] "나스닥" 이지 "나스닥100" 이 아니다 (대표 결정)
 * ========================================================================= */
section("[2] 나스닥 표기 — js/ 와 index.html 전체");
{
  const BAD = /나스닥\s*100|나스닥\s*지수|NASDAQ/;
  const BAD_G = /나스닥\s*100|나스닥\s*지수|NASDAQ/g;

  ok("규격표의 이름이 정확히 '나스닥' 이다",
    main.App.SymbolRegistry.getBySymbol("QQQUSDT").name === "나스닥",
    main.App.SymbolRegistry.getBySymbol("QQQUSDT").name);

  const 걸린곳 = [];
  allSources().forEach((rel) => {
    const m = strip(read(rel)).match(BAD_G);
    if (m) 걸린곳.push(rel + " (" + m.join(", ") + ")");
  });
  ok("사이트 코드 어디에도 '나스닥100' / '나스닥 지수' / 'NASDAQ' 이 없다",
    걸린곳.length === 0,
    걸린곳.join(" · ") + " — QQQ 는 지수가 아니라 ETF 라 숫자가 41배 다릅니다" +
    "(지수 29,209 vs QQQ 708). '지수' 라고 쓰면 회원이 잘못 판단합니다");

  /* ⚠ 스캐너 자체검증 — 진짜 잡는지 합성 소스로 확인합니다.
     이게 없으면 정규식이 잘못돼도 "전부 통과" 로 보입니다. */
  ["나스닥100", "나스닥 100", "나스닥지수", "나스닥 지수", "NASDAQ 100"].forEach((bad) => {
    ok("  (자체검증) '" + bad + "' 는 스캐너에 걸린다", BAD.test('name: "' + bad + '"'), "못 잡습니다");
  });
  ok("  (자체검증) 정상 표기 '나스닥' 은 안 걸린다", !BAD.test('name: "나스닥"'), "오탐입니다");

  /* 화면에 실제로 그려진 글자도 봅니다. */
  const btn = main.doc.getElementById("symbol-select-btn");
  btn.dispatchEvent(new main.win.MouseEvent("click", { bubbles: true }));
  const 화면글자 =
    main.doc.getElementById("symbol-select-dropdown").textContent + " " +
    (main.doc.getElementById("ami-symbols") || { textContent: "" }).textContent + " " +
    Array.prototype.map.call(main.doc.querySelectorAll(".symbol-tab-btn"), (b) => b.textContent).join(" ");
  ok("화면에 그려진 글자에도 금지 표기가 없다", !BAD.test(화면글자), 화면글자.slice(0, 200));
  ok("세 UI 모두에 '나스닥' 이 실제로 그려진다",
    (화면글자.match(/나스닥/g) || []).length >= 3,
    (화면글자.match(/나스닥/g) || []).length + "곳");
}

/* =========================================================================
 * [3] 종목 UI 세 곳이 같은 출처를 본다
 *     js/order-panel-amitalk.js:236 주석 —
 *     "종목 UI 는 두 곳이고 둘 다 같은 목록·같은 판정이어야 합니다"
 *     (2026-08-27 js/symbol-tabs.js 가 들어와 세 곳이 됐습니다)
 * ========================================================================= */
section("[3] 종목 UI 세 곳이 같은 출처(App.SymbolRegistry)를 본다");
{
  /* (가) 소스 — 셋 다 registry 를 읽고, 자기 목록을 안 들고 있다 */
  UI_FILES.forEach((f) => {
    const src = strip(read(f));
    ok(f + " 가 App.SymbolRegistry.getAll() 로 목록을 읽는다",
      /App\.SymbolRegistry\.getAll\s*\(/.test(src), "자기 목록을 따로 들고 있으면 어긋납니다");
    ok(f + " 가 App.SymbolRegistry.isEnabled() 로 판정한다",
      /SymbolRegistry\.isEnabled\s*\(|App\.SymbolRegistry\s*&&\s*App\.SymbolRegistry\.isEnabled/.test(src),
      "dataSource 로 보면 네 종목이 전부 binance 라 잠긴 종목도 '거래중' 으로 보입니다");
    /* BTCUSDT 는 기본값(fallback)으로 쓰이므로 허용합니다. 나머지 세 코드가
       파일에 박혀 있으면 그건 자기 목록을 들고 있다는 뜻입니다. */
    ["QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT"].forEach((sym) => {
      ok("  " + f + " 에 " + sym + " 가 박혀 있지 않다", src.indexOf(sym) < 0,
        "종목 코드를 화면 파일에 박으면 규격표를 고쳐도 안 따라옵니다");
    });
  });

  /* (나) 런타임 — 규격표를 바꿔치기하면 세 UI 가 전부 따라온다.
     ⚠ "몇 줄이 보이는가" 가 아니라 "무엇을 그리는가" 로 봅니다
        (지금 주문창은 style.css:1470 때문에 4줄 중 1줄만 보입니다). */
  const t = boot({ extra: ["js/symbol-guard.js", "js/symbol-stream-switch.js"] });
  UI_FILES.forEach((f) => { try { t.win.eval(read(f)); } catch (e) { /* 이미 태워짐 */ } });
  t.App.SymbolSelector.init();
  t.App.SymbolTabs.init();

  const 드롭다운 = () => {
    const b = t.doc.getElementById("symbol-select-btn");
    b.dispatchEvent(new t.win.MouseEvent("click", { bubbles: true })); // 닫기
    b.dispatchEvent(new t.win.MouseEvent("click", { bubbles: true })); // 열기(다시 그림)
    return Array.prototype.map.call(
      t.doc.querySelectorAll("#symbol-select-dropdown .symbol-option"), (e) => e.getAttribute("data-symbol"));
  };
  const 주문창 = () => Array.prototype.map.call(
    t.doc.querySelectorAll("#ami-symbols .ami-symbol-row"), (e) => e.getAttribute("data-symbol"));
  const 탭 = () => Array.prototype.map.call(
    t.doc.querySelectorAll(".symbol-tab-btn"), (e) => e.getAttribute("data-symbol"));

  ok("바꿔치기 전 — 세 곳이 같은 4종목을 그린다",
    드롭다운().join(",") === EXPECT.join(",") &&
    주문창().join(",") === EXPECT.join(",") &&
    탭().join(",") === EXPECT.join(","),
    "드롭다운=" + 드롭다운().join(",") + " / 주문창=" + 주문창().join(",") + " / 탭=" + 탭().join(","));

  /* 규격표를 "봉인시험 한 종목" 으로 바꿔치기합니다. */
  const FAKE = [{
    symbol: "ZZZTESTUSDT", name: "봉인시험", type: "crypto",
    dataSource: "binance", enabled: true, spec: { unit: "ZZZ" },
  }];
  const 원본 = t.App.SymbolRegistry;
  t.App.SymbolRegistry = {
    getAll: () => FAKE.slice(),
    getBySymbol: (s) => FAKE.filter((x) => x.symbol === s)[0] || null,
    getSpec: () => null,
    isEnabled: (s) => s === "ZZZTESTUSDT",
    isMock: (s) => s !== "ZZZTESTUSDT",
    maxLeverage: () => null,
    common: () => ({}),
  };
  t.App.SymbolSelector.init();
  t.App.SymbolTabs.init();
  t.App.AmiTalkOrderPanel.init();

  ok("드롭다운이 규격표를 그대로 따라온다", 드롭다운().join(",") === "ZZZTESTUSDT",
    드롭다운().join(",") + " — 드롭다운이 자기 목록을 들고 있습니다");
  ok("주문창 목록이 규격표를 그대로 따라온다", 주문창().join(",") === "ZZZTESTUSDT",
    주문창().join(",") + " — 주문창이 자기 목록을 들고 있습니다");
  ok("상품탭이 규격표를 그대로 따라온다", 탭().join(",") === "ZZZTESTUSDT",
    탭().join(",") + " — 상품탭이 자기 목록을 들고 있습니다");

  /* 판정(열림/잠김)도 같은 출처인지 — 전부 잠그면 세 곳 다 '준비중' 이어야 합니다. */
  t.App.SymbolRegistry.isEnabled = () => false;
  t.App.SymbolRegistry.isMock = () => true;
  t.App.SymbolSelector.init();
  t.App.SymbolTabs.init();
  t.App.AmiTalkOrderPanel.init();
  드롭다운();
  const 준비중 = {
    드롭다운: t.doc.querySelectorAll("#symbol-select-dropdown .symbol-option-badge").length,
    주문창: t.doc.querySelectorAll("#ami-symbols .ami-symbol-badge:not(.on)").length,
    탭: t.doc.querySelectorAll(".symbol-tab-btn .nav-soon-badge").length,
  };
  ok("잠그면 세 곳 모두 '준비중' 으로 바뀐다 (판정 출처도 하나)",
    준비중.드롭다운 >= 1 && 준비중.주문창 >= 1 && 준비중.탭 >= 1,
    JSON.stringify(준비중) + " — 0 인 곳은 자기 판정을 따로 하고 있습니다");
  t.App.SymbolRegistry = 원본;
}

/* =========================================================================
 * [4] 전환 통로가 하나 — App.SymbolStreamSwitch.switchTo
 * ========================================================================= */
section("[4] 전환 통로가 App.SymbolStreamSwitch.switchTo 하나다");
{
  ok("App.SymbolStreamSwitch.switchTo 가 있다",
    typeof main.App.SymbolStreamSwitch.switchTo === "function");
  /* ⚠ getOwnPropertyNames 로 이름만 세면 안 됩니다. js/symbol-guard.js 가
     "누가 나중에 만들면 감싸겠다" 는 덫(접근자)을 미리 깔아 두기 때문에
     setActiveSymbol · setSymbol 이라는 이름 자체는 이미 존재합니다
     (2026-08-27 실측 — SETTER_NAMES 7개 중 2개가 이름으로 잡힙니다).
     실제로 값이 들어 있는지(=두 번째 통로가 생겼는지)를 봐야 합니다. */
  const 살아있는setter = main.App.SymbolGuard.SETTER_NAMES
    .filter((n) => typeof main.App.Config[n] !== "undefined");
  ok("App.Config 에 종목을 바꾸는 setter 가 없다",
    typeof main.App.Config.setActiveSymbol === "undefined" && 살아있는setter.length === 0,
    살아있는setter.join(",") + " — 두 번째 전환 경로가 생기면 안전장치(js/symbol-guard.js)의 " +
    "전환 순서를 우회합니다");

  /* (가) 소스 — symbol:change 를 쏘는 파일이 하나뿐이다.
     변수·객체 속성에 담아 쏘는 것도 잡습니다(리터럴만 보면 우회됩니다). */
  function emit쏘는곳(src) {
    const hits = [];
    if (/emit\s*\(\s*["']symbol:change["']/.test(src)) hits.push('리터럴 emit("symbol:change")');
    const names = [];
    let m;
    const re = /([A-Za-z_$][\w$]*)\s*[:=]\s*["']symbol:change["']/g;
    while ((m = re.exec(src))) if (names.indexOf(m[1]) < 0) names.push(m[1]);
    names.forEach((n) => {
      const r = new RegExp("emit\\s*\\(\\s*(?:[\\w$]+\\s*\\.\\s*)*" + n + "\\b");
      if (r.test(src)) hits.push("상수 " + n + " 을(를) emit 으로 씀");
    });
    return hits;
  }
  const 쏘는곳 = [];
  allSources().forEach((rel) => {
    if (emit쏘는곳(strip(read(rel))).length) 쏘는곳.push(rel);
  });
  ok("symbol:change 를 쏘는 파일이 js/symbol-stream-switch.js 하나다",
    쏘는곳.join(",") === "js/symbol-stream-switch.js",
    쏘는곳.join(",") + " — 두 곳이 쏘면 전환 순서(활성종목→비우기→소켓→간격)가 깨집니다");

  ok("  (자체검증) 변수에 담아 쏘는 것도 스캐너가 잡는다",
    emit쏘는곳('var EV = "symbol:change"; App.Bus.emit(EV, s);').length === 1, "못 잡습니다");
  ok("  (자체검증) 듣기만 하는 코드는 안 걸린다",
    emit쏘는곳('App.Bus.on("symbol:change", f);').length === 0, "오탐입니다");

  /* switchTo 를 정의하는 파일도 하나여야 합니다(같은 이름의 두 번째 통로 금지). */
  const 정의한곳 = allSources().filter((rel) =>
    /function\s+switchTo\s*\(|switchTo\s*[:=]\s*function|switchTo\s*[:=]\s*\(/.test(strip(read(rel))));
  ok("switchTo 를 정의하는 파일도 js/symbol-stream-switch.js 하나다",
    정의한곳.join(",") === "js/symbol-stream-switch.js", 정의한곳.join(","));

  /* (나) 런타임 — 세 UI 를 실제로 눌러 보고 전부 switchTo 를 거치는지 봅니다. */
  const s = boot({ extra: ["js/symbol-guard.js", "js/symbol-stream-switch.js"] });
  UI_FILES.forEach((f) => { try { s.win.eval(read(f)); } catch (e) { /* 이미 태워짐 */ } });
  s.App.SymbolSelector.init();
  s.App.SymbolTabs.init();

  const 호출 = [];
  const 원래switchTo = s.App.SymbolStreamSwitch.switchTo;
  s.App.SymbolStreamSwitch.switchTo = function (sym) { 호출.push(sym); return true; };
  const 바뀐횟수 = { v: 0 };
  s.App.Bus.on("symbol:change", () => { 바뀐횟수.v++; });

  const btn = s.doc.getElementById("symbol-select-btn");
  btn.dispatchEvent(new s.win.MouseEvent("click", { bubbles: true }));
  s.doc.querySelector('#symbol-select-dropdown [data-symbol="QQQUSDT"]')
    .dispatchEvent(new s.win.MouseEvent("click", { bubbles: true }));
  ok("드롭다운 클릭이 switchTo 를 거친다", 호출.join(",") === "QQQUSDT", 호출.join(","));

  호출.length = 0;
  s.doc.querySelector('#ami-symbols [data-symbol="SAMSUNGUSDT"]')
    .dispatchEvent(new s.win.MouseEvent("click", { bubbles: true }));
  ok("주문창 목록 클릭이 switchTo 를 거친다", 호출.join(",") === "SAMSUNGUSDT", 호출.join(","));

  호출.length = 0;
  s.doc.querySelector('.symbol-tab-btn[data-symbol="SKHYNIXUSDT"]')
    .dispatchEvent(new s.win.MouseEvent("click", { bubbles: true }));
  ok("상품탭 클릭이 switchTo 를 거친다", 호출.join(",") === "SKHYNIXUSDT", 호출.join(","));

  ok("세 UI 중 어느 것도 종목을 직접 바꾸지 않는다",
    바뀐횟수.v === 0 && s.App.Config.getActiveSymbol() === "BTCUSDT",
    "symbol:change " + 바뀐횟수.v + "회 / 활성종목=" + s.App.Config.getActiveSymbol() +
    " — switchTo 를 가로챘는데도 종목이 바뀌었다면 두 번째 경로가 있는 것입니다");
  s.App.SymbolStreamSwitch.switchTo = 원래switchTo;
}

/* =========================================================================
 * [5] 안전장치(js/symbol-guard.js)가 약해지지 않았다
 *     ⚠ 수리팀이 이 파일의 "청산 기록 종목 이름" 을 고치는 중입니다
 *        (2026-08-27). 아래가 실패하면 그 작업 중일 수 있으니 그대로
 *        보고하고 판단은 본부장에게 넘깁니다.
 * ========================================================================= */
section("[5] 안전장치 — 그물 1개 · 잠금 · symbol:change 만 막기");
{
  const g = boot({ extra: ["js/symbol-guard.js", "js/symbol-stream-switch.js"] });
  const G = g.App.SymbolGuard;

  ok("시세가 거래엔진으로 흘러가는 통로가 정확히 1개다 (getNettedCount)",
    G.getNettedCount() === 1,
    String(G.getNettedCount()) + " — 0 이면 그물이 안 씌워진 것이고, 2 이상이면 " +
    "같은 틱이 두 번 들어가 청산이 부풀거나 차트가 얼어붙습니다");
  ok("isLocked() 가 살아 있다", typeof G.isLocked === "function");
  ok("포지션·미체결이 없으면 안 잠긴다", G.isLocked() === false, String(G.isLocked()));

  /* 포지션을 엽니다 — 이 상태에서 종목이 바뀌면 남의 종목 시세로 청산됩니다. */
  g.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  g.App.Trading.setLeverage(10);
  const opened = g.App.Trading.openPosition("long", 1000);
  ok("BTC 110,000 에 10배 롱 진입", opened.ok === true, opened.error || "");
  ok("포지션이 있으면 잠긴다", G.isLocked() === true, String(G.isLocked()));

  /* (가) symbol:change 는 막힌다 */
  let 종목신호 = 0;
  g.App.Bus.on("symbol:change", () => { 종목신호++; });
  const 막기전 = G.getBlockedCount();
  g.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" });
  ok("잠긴 상태에서 symbol:change 방송이 막힌다", 종목신호 === 0, String(종목신호) + "회 도착했습니다");
  ok("막았다는 사실을 센다", G.getBlockedCount() === 막기전 + 1,
    막기전 + " → " + G.getBlockedCount());
  ok("switchTo 로도 종목이 안 바뀐다", g.App.Config.getActiveSymbol() === "BTCUSDT",
    (g.App.SymbolStreamSwitch.switchTo("QQQUSDT"), g.App.Config.getActiveSymbol()));

  /* (나) ⚠ interval:change 는 그대로 통과해야 한다 — 시간봉 버튼이 죽는 자리 */
  let 간격신호 = 0;
  let 받은간격 = null;
  g.App.Bus.on("interval:change", (d) => { 간격신호++; 받은간격 = d && d.interval; });
  g.App.Config.setActiveInterval("5m");
  ok("잠긴 상태에서도 시간봉 전환(interval:change)은 통과한다", 간격신호 === 1,
    String(간격신호) + "회 — 0 이면 시간봉 버튼이 통째로 먹통입니다(조용한 고장)");
  ok("간격 값이 그대로 실려 온다 (5m)", 받은간격 === "5m", String(받은간격));
  ok("실제 활성 간격도 바뀐다", g.App.Config.getActiveInterval() === "5m",
    g.App.Config.getActiveInterval());
  g.App.Config.setActiveInterval("1m");

  /* (다) 종목과 무관한 다른 방송도 안 막힌다 */
  let 기타 = 0;
  g.App.Bus.on("currency:change", () => { 기타++; });
  g.App.Bus.emit("currency:change", { currency: "KRW" });
  ok("종목과 무관한 방송(currency:change)도 그대로 통과한다", 기타 === 1, String(기타));

  /* 소스에서도 확인 — 안전장치는 interval:change 를 아예 몰라야 합니다.
     런타임만 보면 "symbol 이 안 실린 방송이라 우연히 통과" 하는 경우가 있어
     막는 코드가 들어와도 안 걸릴 수 있습니다(2026-08-27 돌연변이 검증에서
     실제로 그런 무해한 변이가 있었습니다). 그래서 글자로도 못 박습니다. */
  ok("js/symbol-guard.js 본문이 interval:change 를 아예 안 건드린다",
    strip(read("js/symbol-guard.js")).indexOf("interval:change") < 0,
    "안전장치가 간격 방송에 손대면 시간봉 버튼이 죽습니다(조용한 고장)");

  /* (라) 내 종목 시세는 그대로 엔진에 도착하고, 남의 종목 시세는 버려진다 */
  const 버리기전 = G.getDroppedCount();
  g.App.Bus.emit("price:update", { symbol: "QQQUSDT", price: 700 });
  ok("남의 종목 시세는 엔진에 안 들어간다 (포지션이 살아 있다)",
    g.App.Trading.getSnapshot().position !== null, "강제청산됐습니다");
  ok("버렸다는 사실을 센다", G.getDroppedCount() > 버리기전,
    버리기전 + " → " + G.getDroppedCount());
  g.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 111000 });
  ok("내 종목 시세는 그대로 반영된다",
    Math.round(g.App.Trading.getSnapshot().position.pnl) !== 0,
    String(g.App.Trading.getSnapshot().position.pnl));

  /* (마) 포지션을 닫으면 다시 열린다 */
  g.App.Trading.closePosition();
  ok("포지션을 닫으면 잠금이 풀린다", G.isLocked() === false, String(G.isLocked()));
  종목신호 = 0;
  g.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" });
  ok("잠금이 풀리면 symbol:change 가 지나간다", 종목신호 === 1, String(종목신호));
}

/* =========================================================================
 * [6] 화면 배율 상한 ≤ 엔진 상한 검사가 살아 있다
 *     실제 검사는 tests/symbol-spec.test.js [7] 이 합니다(1~1000 을 실제로
 *     눌러서 잽니다). 여기서는 그 검사가 지워지지 않았는지만 확인합니다.
 * ========================================================================= */
section("[6] 화면 배율 상한 검사가 살아 있다");
{
  const spec = read("tests/symbol-spec.test.js");
  ok("tests/symbol-spec.test.js 가 있다", spec.length > 0);
  /* ⚠ 설명 문구가 아니라 "실제로 비교하는 줄" 이 남아 있는지 봅니다.
     문구만 찾으면 주석·안내문에 걸려서, 검사를 지워도 통과합니다
     (2026-08-27 돌연변이 검증에서 실제로 그랬습니다). */
  ok("  화면 상한 ≤ 엔진 상한 비교가 남아 있다",
    /화면최대\s*<=\s*엔진최대/.test(spec) && /setLeverage\s*\(/.test(spec),
    "이 검사를 지우면 화면에서 150배를 고를 수 있게 돼도 아무도 안 잡습니다");
  ok("  package.json 에 symbol-spec.test.js 가 등록돼 있다",
    read("tests/_order.txt").indexOf("tests/symbol-spec.test.js") >= 0);

  /* 값도 가볍게 한 번 더 봅니다(엔진 상한은 소스의 상수를 읽습니다). */
  const engine = parseInt((read("js/trading.js").match(/MAX_LEVERAGE\s*=\s*(\d+)/) || [])[1], 10);
  const lm = read("js/leverage-modal.js");
  const presets = ((lm.match(/var PRESETS\s*=\s*\[([^\]]*)\]/) || [])[1] || "")
    .split(",").map((x) => parseInt(x, 10)).filter((n) => isFinite(n));
  const sliderMax = parseInt((lm.match(/class="lev-modal-range"[^>]*max="(\d+)"/) || [])[1], 10);
  const 화면최대 = Math.max.apply(null, presets.concat([sliderMax || 0]));
  ok("엔진 상한을 읽었다 (js/trading.js MAX_LEVERAGE = " + engine + ")", engine === 125, String(engine));
  ok("화면 상한(" + 화면최대 + ") 이 100 이고 엔진 상한(" + engine + ") 을 안 넘는다",
    화면최대 === 100 && 화면최대 <= engine,
    "화면=" + 화면최대 + " 엔진=" + engine + " — 대표 결정(2026-08-27)은 100배입니다. " +
    "화면이 엔진보다 높으면 회원은 그 배율로 잡은 줄 아는데 엔진이 조용히 깎습니다");
}

/* =========================================================================
 * [7] 수정 금지 파일 12개 무수정
 * ========================================================================= */
section("[7] 수정 금지 파일 12개");
{
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
 * [8] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[8] 테스트 등록");
{
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다",
    read("tests/_order.txt").indexOf("tests/four-symbols-seal.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
