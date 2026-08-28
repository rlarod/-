/* tests/interval-native-truth.test.js
 * ⭐ 조용한 고장 — "없는 간격을 있다고 적어두면 신호가 0회가 된다"
 *
 * ── 왜 필요한가 (2026-08-28 실측) ───────────────────────────────────────
 * js/config.js 의 INTERVALS 에서 1s 가 native: true 였습니다. 사실이 아닙니다.
 *
 *   REST  GET /fapi/v1/klines?symbol=BTCUSDT&interval=1s
 *         → 400 {"code":-1120,"msg":"Invalid interval."}
 *   WS    btcusdt@kline_1s → 15초 동안 kline 0건
 *         (같은 연결의 @ticker 는 같은 15초에 8건 정상 · 연결 오류·종료 없음)
 *   비교  btcusdt@kline_1m → 같은 방식으로 15초에 33건
 *
 * 바이낸스는 없는 스트림 이름을 받아도 오류를 내지 않고 연결을 유지합니다.
 * 그래서 native: true 로 두면 이렇게 됩니다 —
 *   · js/config.js  buildCombinedStreamUrl() 이 @kline_1s 를 주소에 넣는다
 *   · 그 스트림은 한 건도 안 온다 (오류 없음, 연결 정상)
 *   · js/trade-stream-fix.js 는 isNativeInterval() 이 true 라서 그냥 빠져나간다
 *     → 합성 봉도 안 만든다
 *   · 결과: price:update 0회 → 손익·강제청산·TP/SL·지정가 체결이 조용히 멈춤
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) native: true 로 표시한 간격이 바이낸스 선물 kline 목록에 실제로 있는가
 *  (2) 1s 는 반드시 비-native 여야 한다 (되돌리면 여기서 터진다)
 *  (3) 비-native 간격은 주소에서 kline 이 빠지고, 체결로 봉을 만드는
 *      경로(js/trade-stream-fix.js)가 살아 있는가
 *  (4) 이 수정이 1초·5초·15초 버튼을 되살리지 않았는가
 *      (style.css 가림 + js/interval-guard.js 되돌리기 둘 다 그대로)
 *
 * tests/stream-signals.test.js 도 같은 위반을 잡지만, 그쪽은 'native:1s' 를
 * 알려진예외로 등록해 두고 통과시킵니다. 예외가 남아 있는 한 되돌려도 안
 * 잡힙니다. 그래서 예외 목록과 무관하게 못을 박는 이 파일을 따로 둡니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const CONFIG_SRC = fs.readFileSync(path.join(REPO, "js", "config.js"), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}

/* 바이낸스 선물(fapi/fstream)이 실제로 주는 kline 간격.
   2026-08-28 실측으로 1s 가 없다는 것만 확인했고, 나머지는 코드가 이미 쓰고
   있는 값입니다. 여기에 없는 이름을 native 로 적으면 (1) 에서 걸립니다. */
const 선물_KLINE_간격 = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
];

/* config.js 소스(원본이든 망가뜨린 사본이든)를 jsdom 에 올려 App.Config 를
   돌려줍니다. 파일은 건드리지 않습니다 — 읽어온 문자열만 씁니다. */
function config올리기(src) {
  const dom = new JSDOM("<div></div>", { runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  win.eval("window.App={Bus:{on(){},off(){},emit(){}},Storage:null};");
  win.eval(src);
  return win.App.Config;
}

function 거짓native(intervals) {
  return intervals
    .filter((iv) => iv && iv.native === true && 선물_KLINE_간격.indexOf(iv.value) < 0)
    .map((iv) => iv.value);
}

console.log("\n없는 간격을 native 라고 적어두지 않았는가");

/* =========================================================================
 * 1) 탐지기 자체 검증 — 합성 입력으로 먼저 확인합니다
 * ========================================================================= */
console.log("\n  [탐지기] 합성 입력");
ok("1s 를 native 라고 하면 잡는다",
  거짓native([{ value: "1s", native: true }]).join() === "1s");
ok("1s 가 비-native 면 안 잡는다",
  거짓native([{ value: "1s", native: false }]).length === 0);
ok("실제로 있는 간격은 안 잡는다",
  거짓native([{ value: "1m", native: true }, { value: "4h", native: true }, { value: "1d", native: true }]).length === 0);
ok("5s 를 native 라고 해도 잡는다",
  거짓native([{ value: "5s", native: true }]).join() === "5s");

/* =========================================================================
 * 2) 실제 js/config.js
 * ========================================================================= */
console.log("\n  [실제 코드] js/config.js");
{
  const C = config올리기(CONFIG_SRC);
  ok("App.Config 가 뜬다", !!C && typeof C.getIntervals === "function");

  const 간격 = C.getIntervals();
  const 위반 = 거짓native(간격);
  ok("native 로 표시한 간격이 전부 바이낸스 선물에 있다", 위반.length === 0, "거짓 native: " + 위반.join(", "));

  const 초1 = 간격.filter((iv) => iv.value === "1s")[0];
  ok("1s 항목이 목록에 그대로 있다(지우지 않았다)", !!초1);
  ok("1s 는 비-native 다", !!초1 && 초1.native === false, JSON.stringify(초1));
  ok("isNativeInterval('1s') 가 false 다", C.isNativeInterval("1s") === false);
  ok("isNativeInterval('1m') 는 true 다(멀쩡한 것까지 뒤집지 않았다)", C.isNativeInterval("1m") === true);
  ok("5s·15s 는 그대로 비-native 다",
    C.isNativeInterval("5s") === false && C.isNativeInterval("15s") === false);

  /* 주소 — 비-native 면 kline 을 아예 넣지 않습니다(config.js 의 규칙). */
  C.setActiveInterval("1s");
  const url1s = C.buildCombinedStreamUrl("BTCUSDT");
  C.setActiveInterval("1m");
  const url1m = C.buildCombinedStreamUrl("BTCUSDT");

  console.log("    1s 주소 : " + url1s);
  console.log("    1m 주소 : " + url1m);

  ok("1s 주소에 kline_1s 가 없다(오지도 않는 스트림을 요청하지 않는다)",
    url1s.indexOf("@kline_1s") < 0, url1s);
  ok("1s 주소에도 체결(@trade)·시세(@ticker) 는 그대로 있다",
    url1s.indexOf("@trade") >= 0 && url1s.indexOf("@ticker") >= 0, url1s);
  ok("1m 주소에는 kline_1m 이 있다", url1m.indexOf("@kline_1m") >= 0, url1m);
  ok("간격 이름과 seconds 가 맞는다(1s=1)", !!초1 && 초1.seconds === 1);
}

/* =========================================================================
 * 3) 비-native 가 되면 누가 봉을 만드나 — js/trade-stream-fix.js
 * ========================================================================= */
console.log("\n  [만드는 쪽] js/trade-stream-fix.js");
{
  const TSF = fs.readFileSync(path.join(REPO, "js", "trade-stream-fix.js"), "utf8");
  ok("native 간격이면 빠져나간다(이중 방송 방지)",
    /isNativeInterval\(interval\)\)\s*return;/.test(TSF));
  ok("비-native 면 합성 봉을 만든다", /synthetic\s*=\s*\{/.test(TSF));
  ok("합성 봉을 kline:update 로 내보낸다", /emit\("kline:update"/.test(TSF));
  ok("현재가도 내보낸다(손익·강제청산의 입력)", /emit\("price:update"/.test(TSF));
  ok("간격 초를 config 에서 가져온다(1s → 1초 버킷)",
    /intervalToSeconds\(interval\)/.test(TSF));
}

/* =========================================================================
 * 4) 버튼을 되살리지 않았는가 — 자물쇠 두 개가 그대로여야 합니다
 * ========================================================================= */
console.log("\n  [자물쇠] 1초·5초·15초 버튼은 계속 막혀 있어야 한다");
{
  const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  ok("style.css 가 1s/5s/15s 버튼을 계속 가린다",
    /\.interval-btn\[data-interval="1s"\][\s\S]{0,120}display:\s*none/.test(CSS));

  const GUARD = fs.readFileSync(path.join(REPO, "js", "interval-guard.js"), "utf8");
  ok("js/interval-guard.js 가 아직 1s 를 막는다", /"1s":\s*true/.test(GUARD));
  ok("js/interval-guard.js 가 아직 5s·15s 도 막는다",
    /"5s":\s*true/.test(GUARD) && /"15s":\s*true/.test(GUARD));

  const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  ok("index.html 이 interval-guard.js 를 계속 불러온다",
    HTML.indexOf("js/interval-guard.js") >= 0);
}

/* =========================================================================
 * 5) 돌연변이 — 되돌리면 정말 실패하는가
 * ========================================================================= */
console.log("\n  [돌연변이] 1s 를 native 로 되돌려 본다");
{
  const 망친소스 = CONFIG_SRC.replace(
    '{ value: "1s", label: "1초", seconds: 1, native: false }',
    '{ value: "1s", label: "1초", seconds: 1, native: true }'
  );
  ok("돌연변이 준비 — 사본을 만들었다(원본 파일은 안 건드림)", 망친소스 !== CONFIG_SRC);

  const C = config올리기(망친소스);
  ok("→ 되돌리면 '거짓 native' 로 잡힌다", 거짓native(C.getIntervals()).join() === "1s");
  ok("→ 되돌리면 isNativeInterval('1s') 가 true 가 된다", C.isNativeInterval("1s") === true);

  C.setActiveInterval("1s");
  const 망친주소 = C.buildCombinedStreamUrl("BTCUSDT");
  ok("→ 되돌리면 오지도 않는 @kline_1s 를 주소에 다시 넣는다",
    망친주소.indexOf("@kline_1s") >= 0, 망친주소);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다(tests/README.md). */
process.exit(0);
