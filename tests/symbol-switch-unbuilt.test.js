/* tests/symbol-switch-unbuilt.test.js
 * =========================================================================
 * "종목을 바꾸는 길이 아직 없다" + "안전장치가 도장을 찍는다"
 *   2026-08-26 처음 작성 → 2026-08-27 기준 개정
 * =========================================================================
 *
 * ⭐ 이 파일은 두 가지를 못 박습니다.
 *    ① 아직 안 연 것 : 종목 전환. 열리면 실패하면서 "안전장치를 먼저 보라" 고 알립니다.
 *    ② 이미 넣은 것 : 포지션·미체결·거래내역·주문내역에 찍히는 symbol 도장.
 *                     도장이 사라지면 실패합니다.
 *
 * ── 2026-08-27 왜 기준을 바꿨나 (수리팀 지적 → 본부장 확인) ───────────────
 *   어제(2026-08-26) 만들 때는 "안전장치가 들어오면 실패하도록" 일부러 그렇게
 *   짰습니다. 그런데 안전장치가 두 번이나 라이브에 올라갔는데도 55건이 전부
 *   조용히 통과했습니다.
 *
 *       커밋 9622e15  js/symbol-guard.js        position · pendingOrder 에 도장
 *       커밋 3bce232  js/symbol-sync-bridge.js  closedTrades · orderHistory 까지 4/4
 *
 *   즉 봉인문이 "포지션에 symbol 칸이 없다" 를 현재 사실로 못 박고 있었는데,
 *   소스 기준으로만 맞고 런타임 기준으로는 틀린 상태였습니다.
 *
 *   조용히 통과한 이유 세 가지(= 우회 경로). 이번에 셋 다 막았습니다.
 *
 *     ① 하네스가 js/trading.js 만 태우고 js/symbol-guard.js 를 안 읽었습니다.
 *        → tests/harness.js 에 opts.extra 를 넣어 두 파일을 같이 태웁니다.
 *          [0] 절이 "정말 태워졌는가" 를 실행 결과(그물 1개)로 확인합니다.
 *
 *     ② [1] 이 Object.keys(App.Config) 로만 봤는데, 자물쇠가
 *        enumerable:false 라 keys 에 안 잡혔습니다.
 *        → Object.getOwnPropertyNames + 접근자(getter)까지 실제로 읽습니다.
 *          [1-ㄴ] 이 "keys 로만 보면 못 본다" 는 것 자체를 증거로 남깁니다.
 *
 *     ③ [2] 정규식이 emit("symbol:change") 리터럴만 봤습니다.
 *        변수에 담아 emit(EV) 로 쏘면 안 걸립니다.
 *        → 파일 안의 문자열 상수를 먼저 풀어낸 뒤 emit(그이름) 을 찾습니다.
 *          [2-ㄷ] 에서 그 스캐너가 진짜 잡는지 합성 소스로 자체 검증하고,
 *          거기에 더해 런타임에서 App.Bus.emit 을 감시하며 종목 UI 를
 *          전수로 눌러 보고 symbol:change 가 0건인지 봅니다.
 *
 * ── 여전히 못 박는 것 (아직 안 열림) ─────────────────────────────────────
 *     App.Config.setActiveSymbol 등 7개 이름이 없다 (자물쇠만 걸려 있다)
 *     symbol:change 를 실제로 쏘는 코드가 0곳이다 (듣는 곳만 4곳)
 *     js/symbol-selector.js       상단 드롭다운이 준비중 종목을 alert 로 막는다
 *     js/order-panel-amitalk.js   주문창 종목 목록도 똑같이 막는다
 *   ⚠ 종목 UI 가 두 곳입니다. 2026-08-26 돌연변이 M3 에서 주문창 쪽만 뚫었더니
 *     드롭다운 검사는 전부 통과했습니다. 반드시 둘 다, 전수로 봅니다.
 *
 * ── 기준이 뒤집힌 곳 ─────────────────────────────────────────────────────
 *   옛 기준: "포지션에 symbol 칸이 없다"   ← 이제 사실이 아닙니다
 *   새 기준: "안전장치가 symbol 도장을 찍는다"  ([5] 절)
 *
 * ── 종목 목록도 2026-08-27 에 바뀌었습니다 (대표 결정) ───────────────────
 *   5개(BTC/ETH/삼성/하이닉스/NDX) → 4개(비트코인/나스닥/삼성전자/SK하이닉스).
 *   이더리움 제외, 코드는 바이낸스 실제 코드(QQQUSDT·SAMSUNGUSDT·SKHYNIXUSDT).
 *   ⚠ 나스닥은 "나스닥" 으로만 씁니다 — QQQUSDT 는 지수가 아니라 ETF 라서
 *     진짜 나스닥100(29,209)과 41배 차이납니다(QQQ 717).
 *   목록 자체는 앞으로도 움직이므로, 클릭 검사는 개수를 박지 않고
 *   "등록소에 있는 준비중 종목 전부" 를 돌게 만들었습니다.
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

/* 주석(// 와 블록주석)을 걷어낸 "실제로 실행되는 본문".
   주석에 setActiveSymbol 이라고 적혀 있어도 오탐이 나지 않게 합니다. */
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

const JS_DIR = path.join(REPO, "js");
const JS_FILES = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js"));

/* 안전장치 두 겹. index.html 도 이 순서입니다(symbol-guard → symbol-sync-bridge).
   순서 자체는 tests/storage-save-wrap-order.test.js 가 따로 못 박습니다. */
const GUARDS = ["js/symbol-guard.js", "js/symbol-sync-bridge.js"];

/* App.Config 에 생길 수 있는 "종목 바꾸기" 이름들.
   js/symbol-guard.js 의 SETTER_NAMES 와 같은 목록입니다. */
const SETTER_NAMES = [
  "setActiveSymbol", "switchSymbol", "changeSymbol",
  "selectSymbol", "setSymbol", "useSymbol", "applySymbol",
];

/* 안전장치가 안 실렸을 때도 테스트가 죽지 않고 "왜 실패했는지" 를 말하게
   해 주는 껍데기입니다. 죽어 버리면 npm test 가 멈추기만 하고 이유를 못 남깁니다. */
function 안전(fn, 기본) {
  try { const v = fn(); return typeof v === "undefined" ? 기본 : v; } catch (e) { return 기본; }
}

console.log("\n종목 전환 — 아직 안 열렸다는 사실 + 안전장치 도장을 못 박기");

/* -------------------------------------------------------------------------
 * ⚠ 우회 ① 을 막는 지점 — 안전장치 두 파일을 실제로 태웁니다.
 *   js/symbol-guard.js 는 js/trading.js 가 price:update 를 구독하기 전에
 *   읽혀야 하므로 opts.extra 로 init() 전에 태웁니다(tests/harness.js 참고).
 * ----------------------------------------------------------------------- */
const { win, App, doc } = boot({ extra: GUARDS });

/* 하네스에는 App.bootApp 이 없어서 안전장치가 "복원 구간이 끝났다" 를 알
   방법이 없습니다. 실제 부팅과 같은 모양으로 만들어 줍니다.
   ⚠ 안전장치가 안 태워졌을 때 여기서 통째로 죽지 않게 방어합니다 —
      죽어 버리면 [0] 절이 "왜 안 실렸는지" 를 말할 기회를 잃습니다. */
win.eval("App.bootApp = function(){ return true; };");
if (App.SymbolGuard) App.SymbolGuard.init();
if (App.SymbolSyncBridge) App.SymbolSyncBridge.init();
App.bootApp();          // 여기서부터 armed = false (복원 구간 종료)

/* =========================================================================
 * [0] 안전장치가 정말 실려 있는가 — 우회 ① 봉인
 *     2026-08-27 이전에는 이 절이 없어서, 안전장치가 라이브에 있는데도
 *     이 테스트는 "안전장치 없는 세상" 을 보고 있었습니다.
 * ========================================================================= */
section("[0] 안전장치 두 겹이 실제로 실려 있다 (우회 ① 봉인)");
{
  ok("App.SymbolGuard 가 떠 있다",
    !!(App.SymbolGuard && typeof App.SymbolGuard.passes === "function"),
    "js/symbol-guard.js 가 안 태워졌습니다 — 이 테스트는 안전장치 없는 세상을 보게 됩니다");
  ok("App.SymbolSyncBridge 가 떠 있다",
    !!(App.SymbolSyncBridge && typeof App.SymbolSyncBridge.rewrite === "function"),
    "js/symbol-sync-bridge.js 가 안 태워졌습니다");

  /* 글자로만 확인하지 않습니다 — 그물이 실제로 걸렸는지는 숫자로 봅니다.
     getNettedCount() 가 1 이라는 것은 js/trading.js 의 price:update 구독을
     "구독하기 전에" 가로챘다는 뜻입니다(= 순서가 맞았다는 증거). */
  ok("그물이 거래엔진 구독자 1개에 걸렸다(= trading.js 보다 먼저 실렸다)",
    안전(() => App.SymbolGuard.getNettedCount(), -1) === 1,
    "그물 " + 안전(() => App.SymbolGuard.getNettedCount(), "확인 불가") + "개 — 0이면 늦게 실린 것이고, " +
    "2 이상이면 화면쪽 구독자까지 걸러져 차트·호가가 얼어붙습니다");

  /* index.html 에도 같은 순서로 실려 있어야 합니다. */
  const html = read("index.html");
  const at = (f) => html.indexOf('src="' + f + '"');
  GUARDS.forEach((g) => ok("index.html 이 " + g + " 를 싣는다", at(g) > 0, "실리지 않았습니다"));
  ok("index.html 에서 symbol-guard.js 가 trading.js 보다 앞이다",
    at("js/symbol-guard.js") > 0 && at("js/symbol-guard.js") < at("js/trading.js"),
    "뒤로 밀리면 그물이 거래엔진 구독을 못 가로챕니다");

  /* 이 테스트 파일 자신이 두 파일을 태우고 있는지 — 다음 사람이 실수로
     extra 를 지우면 2026-08-27 이전의 조용한 통과가 그대로 재발합니다. */
  const self = read("tests/symbol-switch-unbuilt.test.js");
  ok("이 테스트가 boot({ extra: GUARDS }) 로 안전장치를 태운다",
    /boot\(\{\s*extra:\s*GUARDS\s*\}\)/.test(self),
    "extra 를 빼면 우회 ① 이 그대로 되살아납니다");
}

/* =========================================================================
 * [1] 종목을 바꾸는 함수가 아직 없다 — 우회 ② 봉인
 *     enumerable:false 로 숨어 있어도 잡습니다.
 * ========================================================================= */
section("[1] 종목을 바꾸는 함수가 없다 (우회 ② 봉인)");
{
  /* 숨은 속성까지 전부 훑고, 접근자(getter)면 실제로 값을 읽어 봅니다.
     Object.keys 만 쓰면 enumerable:false 인 것을 통째로 놓칩니다. */
  function 종목쓰기함수(obj) {
    if (!obj || typeof obj !== "object") return [];
    const out = [];
    Object.getOwnPropertyNames(obj).forEach((k) => {
      if (!/symbol/i.test(k)) return;
      if (/^(get|is|has)/.test(k)) return;      // 읽기 전용 이름은 통과
      let v;
      try { v = obj[k]; } catch (e) { v = undefined; }
      if (typeof v === "function") out.push(k);
    });
    return out;
  }

  const 쓰기 = 종목쓰기함수(App.Config);
  ok("App.Config 에 종목을 '쓰는' 함수가 하나도 없다", 쓰기.length === 0,
    "생겼습니다: " + 쓰기.join(",") + " — 4번(시세 재연결)이 끝나기 전에 열면 " +
    "종목을 바꿔도 시세가 안 따라와 다른 종목 시세로 강제청산됩니다");

  SETTER_NAMES.forEach((n) => {
    ok("App.Config." + n + " 이 아직 undefined 다", typeof App.Config[n] === "undefined",
      n + " 이 생겼습니다. js/symbol-guard.js 가 자물쇠를 걸어 뒀으니 " +
      "감싸진 채로 생기기는 합니다만, 열기 전에 4번(시세 재연결)이 끝났는지 확인하세요");
  });

  /* App 전체를 훑습니다 — App.Config 가 아니라 다른 모듈에 만들어도 잡히게. */
  const 딴곳 = [];
  Object.keys(App).forEach((mod) => {
    const m = App[mod];
    if (!m || typeof m !== "object") return;
    SETTER_NAMES.forEach((n) => {
      let v;
      try { v = m[n]; } catch (e) { v = undefined; }
      if (typeof v === "function") 딴곳.push("App." + mod + "." + n);
    });
  });
  ok("App 어디에도 종목을 바꾸는 함수가 없다", 딴곳.length === 0, 딴곳.join(", "));

  ok("지금 활성 종목은 BTCUSDT 하나다", App.Config.getActiveSymbol() === "BTCUSDT",
    String(App.Config.getActiveSymbol()));

  /* 파일 안에서도 activeSymbol 에 다시 대입하는 곳이 없어야 합니다. */
  const cfg = strip(read("js/config.js"));
  const 대입 = (cfg.match(/activeSymbol\s*=[^=]/g) || []);
  ok("js/config.js 에서 activeSymbol 대입이 처음 한 번뿐이다", 대입.length === 1,
    "대입 " + 대입.length + "군데 — 종목을 바꾸는 길이 생겼을 수 있습니다");

  /* 등록소도 읽기 전용입니다. 읽기 함수가 느는 것 자체는 막지 않되
     (2026-08-27 에 getSpec·isEnabled·maxLeverage·common 이 늘었습니다),
     '쓰는' 이름이 생기면 잡습니다. */
  const rkeys = Object.keys(App.SymbolRegistry || {}).sort();
  const 등록소쓰기 = rkeys.filter((k) => /^(set|add|remove|delete|enable|disable|update|put)/i.test(k));
  ok("App.SymbolRegistry 는 읽기 전용이다(값을 바꾸는 함수가 없다)",
    등록소쓰기.length === 0,
    등록소쓰기.join(",") + " — set/add/enable 처럼 값을 바꾸는 함수가 생기면 종목이 열립니다");
  ok("App.SymbolRegistry 가 isEnabled/isMock 판정을 계속 내보낸다",
    typeof App.SymbolRegistry.isEnabled === "function" && typeof App.SymbolRegistry.isMock === "function",
    rkeys.join(","));
  console.log("      └ 등록소 키: " + rkeys.join(","));
}

/* -------------------------------------------------------------------------
 * [1-ㄴ] 우회 ② 를 눈으로 남깁니다 — "keys 로만 보면 못 본다"
 *   자물쇠(enumerable:false)가 걸려 있다는 것은 이제 지켜야 할 사실이라
 *   여기서 같이 못 박습니다. 자물쇠가 풀리면 실패합니다.
 * ----------------------------------------------------------------------- */
section("[1-ㄴ] 자물쇠는 Object.keys 에 안 보인다 (그래서 옛 검사가 뚫렸다)");
{
  const keys = Object.keys(App.Config);
  const names = Object.getOwnPropertyNames(App.Config);

  ok("Object.keys 에는 setActiveSymbol 이 안 보인다", keys.indexOf("setActiveSymbol") === -1,
    "보인다면 자물쇠 방식이 바뀐 것입니다 — 검사 기준을 다시 확인하세요");
  ok("Object.getOwnPropertyNames 에는 보인다(= 우리 검사는 잡는다)",
    names.indexOf("setActiveSymbol") >= 0,
    "자물쇠가 사라졌습니다 — js/symbol-guard.js 의 armConfig 가 안 돌았습니다");

  const d = Object.getOwnPropertyDescriptor(App.Config, "setActiveSymbol");
  ok("자물쇠가 접근자(getter/setter)로 걸려 있다",
    !!(d && typeof d.get === "function" && typeof d.set === "function"),
    JSON.stringify(d ? Object.keys(d) : null));
  ok("자물쇠는 enumerable:false 다", !!(d && d.enumerable === false), String(d && d.enumerable));
  ok("App.Config.__symbolGuarded 표식이 있다", App.Config.__symbolGuarded === true,
    "표식이 없으면 자물쇠가 안 걸린 것입니다");

  SETTER_NAMES.forEach((n) => {
    ok(n + " 에도 자물쇠가 걸려 있다",
      names.indexOf(n) >= 0 && typeof App.Config[n] === "undefined",
      "이름 목록에 없습니다 — 한 이름만 빠져도 그 이름으로 뚫립니다");
  });
  console.log("      └ keys " + keys.length + "개 / getOwnPropertyNames " + names.length + "개");
}

/* =========================================================================
 * [2] symbol:change 를 쏘는 코드가 0곳이다 — 우회 ③ 봉인
 *     변수·객체 속성에 담아 쏘는 것도 잡습니다.
 * ========================================================================= */
section("[2] symbol:change 신호를 쏘는 곳이 없다 (우회 ③ 봉인)");

/* 파일 안의 문자열 상수를 먼저 풀어낸 뒤 emit(그이름) 을 찾습니다.
     var EV = "symbol:change";  App.Bus.emit(EV, s);      ← 옛 검사는 못 잡음
     const E = { CHG: "symbol:change" }; Bus.emit(E.CHG); ← 이것도 못 잡음 */
function emit쏘는곳(src) {
  const hits = [];
  if (/emit\s*\(\s*["']symbol:change["']/.test(src)) hits.push('리터럴 emit("symbol:change")');

  const names = [];
  let m;
  /* var/let/const 대입도, 객체 속성(키: 값)도 같은 모양으로 잡힙니다. */
  const re = /([A-Za-z_$][\w$]*)\s*[:=]\s*["']symbol:change["']/g;
  while ((m = re.exec(src))) if (names.indexOf(m[1]) < 0) names.push(m[1]);

  names.forEach((n) => {
    /* emit(EV) · emit(EVENTS.EV) · emit( App.EV ) 전부 걸립니다. */
    const r = new RegExp("emit\\s*\\(\\s*(?:[\\w$]+\\s*\\.\\s*)*" + n + "\\b");
    if (r.test(src)) hits.push("상수 " + n + " 을(를) emit 으로 씀");
  });
  return hits;
}

{
  const ON = /on\s*\(\s*["']symbol:change["']/;
  const 쏘는곳 = [];
  const 듣는곳 = [];

  JS_FILES.map((f) => "js/" + f).concat(["index.html"]).forEach((rel) => {
    const src = strip(read(rel));
    const hit = emit쏘는곳(src);
    if (hit.length) 쏘는곳.push(rel + " (" + hit.join(" / ") + ")");
    if (ON.test(src)) 듣는곳.push(rel);
  });

  ok("symbol:change 를 쏘는 코드가 0곳이다", 쏘는곳.length === 0,
    "생겼습니다: " + 쏘는곳.join(", ") + " — 이 신호가 날아오는 순간 " +
    "차트·지표가 다른 종목으로 갈아탑니다. 4번(시세 재연결)이 먼저입니다");

  /* 듣는 곳은 있습니다 — "안 오는 신호를 기다리는 중" 이라는 현재 사실입니다. */
  ok("듣는 곳은 그대로 있다(" + 듣는곳.length + "곳, 안 오는 신호를 기다리는 중)",
    듣는곳.length >= 1, 듣는곳.join(", "));
  console.log("      └ 듣는 곳: " + 듣는곳.join(", "));
}

/* -------------------------------------------------------------------------
 * [2-ㄷ] 스캐너 자체 검증 — 이 검사가 진짜 잡는지 합성 소스로 확인합니다.
 *   여기가 통과해야 위 [2] 의 "0곳" 이 의미가 있습니다.
 *   (2026-08-27 이전 정규식은 아래 2·3·4번을 못 잡았습니다.)
 * ----------------------------------------------------------------------- */
section("[2-ㄷ] 스캐너가 정말 잡는지 (합성 소스로 자체 검증)");
{
  ok("① 리터럴로 쏘면 잡는다",
    emit쏘는곳('App.Bus.emit("symbol:change", s);').length > 0);
  ok("② 변수에 담아 쏘면 잡는다 (옛 정규식이 놓치던 것)",
    emit쏘는곳('var EV = "symbol:change";\nApp.Bus.emit(EV, s);').length > 0);
  ok("③ 객체 속성에 담아 쏘면 잡는다",
    emit쏘는곳('const E = { CHG: "symbol:change" };\nApp.Bus.emit(E.CHG, s);').length > 0);
  ok("④ 작은따옴표로 써도 잡는다",
    emit쏘는곳("let ev = 'symbol:change'; Bus.emit( ev , s);").length > 0);
  ok("듣기만 하는 코드는 안 잡는다(오탐 없음)",
    emit쏘는곳('App.Bus.on("symbol:change", f);').length === 0);
  ok("이름만 담아두고 안 쏘면 안 잡는다(js/symbol-guard.js 가 이 모양)",
    emit쏘는곳('var SYMBOL_EVENT = "symbol:change";\nif (name === SYMBOL_EVENT) return;').length === 0);
}

/* -------------------------------------------------------------------------
 * 런타임 감시기 — 아래 [3][4] 에서 UI 를 눌러 보는 동안 실제로
 * symbol:change 가 날아가는지 셉니다. 글자 검사로 못 잡는 길까지 막습니다.
 * ----------------------------------------------------------------------- */
const 쏜신호 = [];
{
  const orig = App.Bus.emit;
  App.Bus.emit = function (name) {
    if (name === "symbol:change") 쏜신호.push(Array.prototype.slice.call(arguments));
    return orig.apply(App.Bus, arguments);
  };
}

/* 클릭 한 번을 흉내냅니다. */
function click(el) {
  el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true }));
}

const 준비중종목 = App.SymbolRegistry.getAll()
  .filter((s) => !App.SymbolRegistry.isEnabled(s.symbol))
  .map((s) => s.symbol);
const 거래중종목 = App.SymbolRegistry.getAll()
  .filter((s) => App.SymbolRegistry.isEnabled(s.symbol))
  .map((s) => s.symbol);

/* =========================================================================
 * [3] 종목 UI ① — 상단 드롭다운(js/symbol-selector.js)
 * ========================================================================= */
section("[3] 종목 UI ① 상단 드롭다운");
{
  const sel = strip(read("js/symbol-selector.js"));
  ok("아직 안 열린 종목이면 alert 로 알린다",
    /isEnabled\(symbol\)/.test(sel) && /alert\(/.test(sel),
    "판정이 App.SymbolRegistry.isEnabled 한 곳에서 나와야 합니다 — dataSource 로 보면 " +
    "네 종목이 전부 binance 라 전부 '거래중' 으로 잘못 표시됩니다");
  ok("alert 뒤에 return 으로 멈춘다", /alert\([\s\S]{0,200}?return;/.test(sel),
    "return 이 없으면 알림만 띄우고 그대로 진행합니다");
  ok("이 파일이 종목을 실제로 바꾸지 않는다",
    !/setActiveSymbol|switchSymbol|changeSymbol/.test(sel) && emit쏘는곳(sel).length === 0,
    "종목을 바꾸는 호출이 들어왔습니다");

  /* 글자만 보지 않고 실제로 눌러 봅니다. */
  win.eval(read("js/symbol-selector.js"));
  App.SymbolSelector.init();
  const btn = doc.getElementById("symbol-select-btn");
  ok("드롭다운 버튼이 화면에 있다", !!btn);
  click(btn);
  const dd = doc.getElementById("symbol-select-dropdown");
  const opts = dd.querySelectorAll(".symbol-option");

  /* 개수를 숫자로 박지 않습니다 — 목록은 대표 결정으로 계속 움직입니다.
     대신 "등록소에 있는 만큼 그대로 나온다" 를 봅니다. */
  ok("등록소 종목이 빠짐없이 나열된다(" + opts.length + "개)",
    opts.length === App.SymbolRegistry.getAll().length,
    opts.length + " vs 등록소 " + App.SymbolRegistry.getAll().length);
  ok("준비중 배지가 준비중 종목 수와 같다(" + 준비중종목.length + "개)",
    dd.querySelectorAll(".symbol-option-disabled").length === 준비중종목.length,
    String(dd.querySelectorAll(".symbol-option-disabled").length));

  /* 2026-08-27 대표 결정 — 나스닥은 "나스닥" 으로만 씁니다.
     QQQUSDT 는 지수가 아니라 그 지수를 따라가는 ETF 라서,
     진짜 나스닥100(29,209)과 41배 차이납니다(QQQ 717). */
  ok("나스닥을 '지수'라고 쓰지 않는다",
    !/나스닥100|NASDAQ|나스닥 지수/.test(dd.textContent),
    "QQQUSDT 는 지수가 아니라 ETF 입니다: " + dd.textContent);

  /* 준비중 종목을 하나도 빠짐없이 눌러 봅니다.
     암호화폐만 막고 주식·지수를 놓치는 일이 없게 전수로 돕니다. */
  준비중종목.forEach((s) => {
    click(btn); // 다시 열기 (준비중을 누르면 닫힙니다)
    win.__lastAlert = null;
    const el = dd.querySelector('[data-symbol="' + s + '"]');
    if (!el) { ok(s + " 줄이 드롭다운에 있다", false, "없습니다"); return; }
    click(el);
    ok(s + " 를 눌러도 '준비 중' 안내만 뜨고 종목이 안 바뀐다",
      /준비 중/.test(String(win.__lastAlert)) && App.Config.getActiveSymbol() === "BTCUSDT",
      "안내: " + String(win.__lastAlert) + " / 활성: " + App.Config.getActiveSymbol() +
      " — 바뀌었다면 보유 중인 포지션이 다른 종목 시세로 강제청산됩니다");
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
  ok("주문창도 등록소 판정(isEnabled)으로 거래중을 가른다",
    /App\.SymbolRegistry\.isEnabled\(/.test(amit),
    "주문창과 드롭다운이 서로 다른 기준을 쓰면 한쪽이 잘못된 배지를 보여줍니다");
  ok("주문창 종목 목록이 종목을 실제로 바꾸지 않는다",
    !/setActiveSymbol|switchSymbol|changeSymbol/.test(amit) && emit쏘는곳(amit).length === 0,
    "종목을 바꾸는 호출이 들어왔습니다");

  const box = doc.getElementById("ami-symbols");
  const rows = box.querySelectorAll(".ami-symbol-row");
  ok("주문창 목록이 드롭다운과 같은 개수다(" + rows.length + "줄)",
    rows.length === App.SymbolRegistry.getAll().length,
    rows.length + " vs 등록소 " + App.SymbolRegistry.getAll().length +
    " — 두 UI 목록이 어긋나면 회원이 한쪽만 보고 잘못 판단합니다");

  준비중종목.forEach((s) => {
    win.__lastAlert = null;
    const el = box.querySelector('.ami-symbol-row[data-symbol="' + s + '"]');
    if (!el) { ok(s + " 줄이 주문창에 있다", false, "없습니다"); return; }
    click(el);
    ok("주문창에서 " + s + " 를 눌러도 안내만 뜨고 종목이 안 바뀐다",
      /준비중/.test(String(win.__lastAlert)) && App.Config.getActiveSymbol() === "BTCUSDT",
      "안내: " + String(win.__lastAlert) + " / 활성: " + App.Config.getActiveSymbol());
  });
}

/* -------------------------------------------------------------------------
 * [4-ㄹ] 위에서 UI 를 다 눌러 보는 동안 symbol:change 가 한 번도 안 날아갔다.
 *   글자 검사가 아니라 실제 실행 결과입니다.
 * ----------------------------------------------------------------------- */
section("[4-ㄹ] 두 UI 를 다 눌러도 symbol:change 가 0건");
{
  ok("눌러 본 준비중 종목이 1개 이상이다(클릭 검사가 헛돌지 않았다)",
    준비중종목.length >= 1,
    "준비중 종목이 0개면 위 클릭 검사가 아무것도 안 한 것입니다");
  ok("종목 UI 두 곳을 전수로 눌렀는데 symbol:change 가 0건이다", 쏜신호.length === 0,
    쏜신호.length + "건 날아갔습니다: " + JSON.stringify(쏜신호).slice(0, 200));
  console.log("      └ 눌러 본 준비중 종목: " + 준비중종목.join(", "));
}

/* =========================================================================
 * [5] ⭐ 기준이 뒤집힌 곳 — 안전장치가 symbol 도장을 찍는다
 *     2026-08-26 판: "포지션에 symbol 칸이 없다" ← 이제 사실이 아닙니다.
 *     커밋 9622e15(position·pendingOrder) + 3bce232(closedTrades·orderHistory)
 * ========================================================================= */
section("[5] 안전장치가 symbol 도장을 찍는다 (도장이 사라지면 실패)");
{
  App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  App.Trading.setLeverage(10);

  const r = App.Trading.openPosition("long", 1000);
  ok("실제 trading.js 로 포지션이 열렸다", r.ok === true, r.error || "");

  const pos = App.Trading.getSnapshot().position || {};
  ok("포지션에 symbol 도장이 찍혀 있다", pos.symbol === "BTCUSDT",
    "도장: " + String(pos.symbol) + " — 사라졌습니다. js/symbol-guard.js 또는 " +
    "js/symbol-sync-bridge.js 가 안 실렸거나 App.Storage.save 감싸기가 깨졌습니다. " +
    "도장이 없으면 다른 종목 시세로 강제청산되는 것을 막을 수 없습니다");
  console.log("      └ 포지션 칸: " + Object.keys(pos).join(","));

  App.Trading.closePosition();

  const r2 = App.Trading.placeLimitOrder("long", 100000, 1000);
  ok("실제 trading.js 로 미체결 주문이 걸렸다", r2.ok === true, r2.error || "");
  const ord = App.Trading.getSnapshot().pendingOrder || {};
  ok("미체결 주문에도 symbol 도장이 찍혀 있다", ord.symbol === "BTCUSDT",
    "도장: " + String(ord.symbol));
  console.log("      └ 미체결 칸: " + Object.keys(ord).join(","));

  App.Trading.cancelPendingOrder();

  /* 2번 관문(js/symbol-sync-bridge.js)이 나머지 둘까지 채워 4/4 입니다.
     조사팀 실측으로 2026-08-27 이전에는 4 중 2 였습니다
     (closedTrades[0].symbol 과 orderHistory[0].symbol 이 null). */
  const cov = 안전(() => App.SymbolSyncBridge.getStampCoverage(), null);
  ok("도장이 4칸 전부 찍힌다(position·pendingOrder·closedTrades·orderHistory)",
    !!cov && cov.closedTrades === "BTCUSDT" && cov.orderHistory === "BTCUSDT",
    JSON.stringify(cov) + " — null 인 칸이 도장이 빠진 곳입니다(조사팀 실측 4중 2였던 자리)");
  console.log("      └ 도장 4칸: " + JSON.stringify(cov));

  const bc = 안전(() => App.SymbolSyncBridge.getCounts(), {});
  const 브리지도장 = Object.keys(bc).reduce((a, k) => a + (/^stamp/.test(k) ? bc[k] : 0), 0);
  const 가드도장 = 안전(() => App.SymbolGuard.getStampedCount(), 0);
  ok("안전장치가 실제로 도장을 찍은 횟수가 1회 이상이다", 가드도장 + 브리지도장 > 0,
    "guard " + 가드도장 + " / bridge " + 브리지도장);

  /* 시세를 받을 때 종목을 확인하기는 합니다 — 다만 '지금 활성 종목' 과만
     비교합니다. 이 문장이 그대로여야 그물(3겹)의 전제가 유지됩니다. */
  const trading = strip(read("js/trading.js"));
  ok("거래엔진은 여전히 '지금 활성 종목' 과만 대조한다(포지션의 종목이 아니라)",
    /payload\.symbol !== cfg\(\)\.getActiveSymbol\(\)/.test(trading),
    "이 문장이 바뀌었으면 js/symbol-guard.js 의 그물 전제가 무너집니다");
  ok("js/trading.js 는 여전히 포지션에 symbol 을 안 넣는다(도장은 바깥에서 찍는다)",
    !/state\.position = \{[\s\S]{0,400}?symbol/.test(trading),
    "수정 금지 파일이 바뀌었습니다");
}

/* =========================================================================
 * [6] 왜 이걸 지켜야 하나 — 안전장치가 없으면 이렇게 됩니다
 *     ⚠ "지금 고장" 이 아니라 "안전장치를 빼면 이렇게 된다" 는 근거입니다.
 * ========================================================================= */
section("[6] 안전장치가 없을 때 (조사팀 2026-08-26 재현)");
{
  const t = boot(); // 안전장치를 안 태운 깨끗한 계정
  t.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  t.App.Trading.setLeverage(10);
  const 시작잔고 = t.App.Trading.getSnapshot().balance;
  const opened = t.App.Trading.openPosition("long", 1000);
  ok("BTC 110,000 에 10배 롱(증거금 1,000) 진입", opened.ok === true, opened.error || "");
  ok("청산가가 99,550 이다", opened.ok && Math.round(opened.position.liq) === 99550,
    opened.ok ? String(opened.position.liq) : "");
  ok("안전장치 없이는 포지션에 symbol 도장이 없다(도장을 바깥에서 찍는다는 증거)",
    typeof (t.App.Trading.getSnapshot().position || {}).symbol === "undefined",
    "js/trading.js 자체가 바뀌었습니다");

  /* 종목만 바뀌었다고 가정합니다. 활성 종목이 바뀌면 trading.js 의 종목
     대조를 그대로 통과하므로, 다른 종목 시세가 BTC 포지션에 곧장 들어옵니다. */
  t.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 3000 });
  const s = t.App.Trading.getSnapshot();
  const 청산 = (s.closedTrades || [])[0] || null;

  ok("한 틱 만에 포지션이 사라진다", s.position === null);
  ok("사유가 '강제청산' 이다", 청산 && 청산.reason === "강제청산", 청산 ? 청산.reason : "기록 없음");
  ok("손익 -1,000 (증거금 전액)", 청산 && 청산.pnl === -1000, 청산 ? String(청산.pnl) : "");
  ok("ROE -100%", 청산 && 청산.pnlPercent === -100, 청산 ? String(청산.pnlPercent) : "");
  ok("잔고가 100,000 → 98,995 (수수료 포함 1,005 손실)",
    시작잔고 === 100000 && Math.round(s.balance) === 98995, 시작잔고 + " → " + s.balance);
  console.log("      └ BTC 시세는 한 푼도 안 움직였는데 1,005 USDT 가 사라집니다");
}

/* -------------------------------------------------------------------------
 * [6-ㅁ] 안전장치를 태우면 같은 시세가 거래엔진까지 안 갑니다.
 * ----------------------------------------------------------------------- */
section("[6-ㅁ] 안전장치를 태우면 다른 종목 시세가 거래엔진까지 안 간다");
{
  const g = boot({ extra: GUARDS });
  g.win.eval("App.bootApp = function(){ return true; };");
  if (g.App.SymbolGuard) g.App.SymbolGuard.init();
  g.App.bootApp();

  g.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 110000 });
  g.App.Trading.setLeverage(10);
  const o = g.App.Trading.openPosition("long", 1000);
  ok("BTC 포지션을 열었다", o.ok === true, o.error || "");
  ok("포지션 종목이 BTCUSDT 로 도장 찍혀 있다",
    (g.App.Trading.getSnapshot().position || {}).symbol === "BTCUSDT");

  const 버린수 = () => 안전(() => g.App.SymbolGuard.getDroppedCount(), -1);
  const 전 = 버린수();
  /* 준비중 종목 하나로 시세를 흘려 봅니다(지금은 안 오지만, 열렸을 때의 모양). */
  const 남의종목 = 준비중종목[0] || "QQQUSDT";
  for (let i = 0; i < 5; i++) g.App.Bus.emit("price:update", { symbol: 남의종목, price: 3000 });

  ok("그물이 " + 남의종목 + " 시세 5건을 거래엔진 앞에서 버렸다",
    버린수() - 전 === 5,
    "버린 건수 " + (버린수() - 전) + "건 — " +
    "5보다 크면 화면쪽 구독자까지 걸러진 것이라 차트·호가가 얼어붙습니다");
  ok("포지션이 살아 있다(강제청산 안 됨)", g.App.Trading.getSnapshot().position !== null,
    "그물이 뚫렸습니다");
}

/* =========================================================================
 * [7] 종목 목록의 현재 사실 (2026-08-27 대표 결정)
 * ========================================================================= */
section("[7] 종목 목록의 현재 사실");
{
  const all = App.SymbolRegistry.getAll();
  ok("등록소에 종목 4개가 있다", all.length === 4, String(all.length));
  ok("네 종목 코드가 바이낸스 실제 코드다",
    all.map((s) => s.symbol).join(",") === "BTCUSDT,QQQUSDT,SAMSUNGUSDT,SKHYNIXUSDT",
    all.map((s) => s.symbol).join(","));
  ok("실제로 전환 가능한(enabled) 종목은 BTCUSDT 하나뿐이다",
    거래중종목.join(",") === "BTCUSDT",
    거래중종목.join(",") + " — 종목이 열렸습니다. 4번(시세 재연결)이 끝났는지, " +
    "그리고 포지션 도장이 그 종목으로 제대로 찍히는지 먼저 확인하세요");
  준비중종목.forEach((s) => {
    ok(s + " 는 아직 잠겨 있다", App.SymbolRegistry.isMock(s) === true,
      s + " 가 열렸습니다. 포지션·미체결 안전장치가 같이 들어갔는지 확인하세요");
  });
  ok("mock 종목의 가짜 시세를 만드는 코드가 없다",
    !JS_FILES.some((f) => /mockPrice|fakePrice|randomPrice/.test(strip(read("js/" + f)))),
    "가짜 시세를 실제 시세처럼 보이면 안 됩니다");
  console.log("      └ 등록소: " + all.map((s) => s.name + "(" + s.symbol + ")").join(", "));
}

/* =========================================================================
 * [8] 수정 금지 파일 12개를 건드리지 않았다
 *     (문자열이 아니라 md5 로 봅니다 — 주석에 파일명이 있어 오탐이 납니다)
 * ========================================================================= */
section("[8] 수정 금지 파일 12개");
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
   ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"]].forEach(function (p) {
    ok(p[0] + " 를 건드리지 않았다", md5(p[0]) === p[1], md5(p[0]));
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
