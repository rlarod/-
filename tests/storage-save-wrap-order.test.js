/* tests/storage-save-wrap-order.test.js
 * =========================================================================
 * App.Storage.save 를 감싸는 모듈들의 "순서" 를 못 박습니다 — 2026-08-27
 * =========================================================================
 *
 * ⭐ 왜 이 파일이 생겼나 (수리팀 발견, 2026-08-27)
 *   index.html 에서 App.Storage.save 에 손대는 모듈이 7군데입니다.
 *
 *       1060  js/funding-restore-guard.js   ← 감쌈(덮어씀)
 *       1196  js/symbol-guard.js            ← 감쌈(덮어씀)
 *       1239  js/chart-indicators.js        ← 부르기만 함
 *       1243  js/chart-drawings.js          ← 부르기만 함
 *       1250  js/ghost-position-guard.js    ← 감쌈(덮어씀)
 *       1261  js/symbol-sync-bridge.js      ← 감쌈(덮어씀)
 *       1265  js/chart-oscillators.js       ← 부르기만 함
 *
 *   ⚠ 줄 번호는 다른 팀이 <script> 를 넣고 빼면 계속 움직입니다.
 *     그래서 이 파일은 줄 번호가 아니라 "누가 누구보다 앞이냐" 만 봅니다.
 *
 * ── 순서가 동작을 바꿉니다 (2026-08-27 P1) ───────────────────────────────
 *   감싸기는 "나중에 실린 쪽이 바깥" 입니다. 바깥이 먼저 돕니다.
 *   그리고 두 안전장치의 stamp() 는 "값이 이미 있으면 건너뜁니다".
 *   → 먼저 찍은 쪽이 이깁니다.
 *
 *       js/symbol-guard.js       복원(armed) 구간에는 무조건 BTCUSDT 로 찍음
 *       js/symbol-sync-bridge.js 서버에서 받아 온 진짜 종목으로 찍음
 *
 *   지금은 bridge 가 guard 보다 뒤에 실려서 더 바깥이라, 서버 값이 먼저
 *   찍히고 이깁니다. 이 순서가 뒤집히면 —
 *
 *       삼성전자 포지션 보유 → 브라우저 닫고 다시 열기(로그인 복원)
 *       → guard 가 바깥이 되어 BTCUSDT 를 먼저 찍음
 *       → 삼성전자 포지션이 비트코인으로 둔갑
 *       → BTC 시세가 거래엔진을 그대로 통과 → 즉시 강제청산
 *
 *   [3] 절에서 이 뒤집힘을 실제로 재현해 숫자로 남깁니다.
 *   (정상 순서 → SAMSUNGUSDT / 역순 → BTCUSDT. 실측으로 확인했습니다.)
 *
 * ── 수리팀 보고와 다른 점 하나 (기록팀 확인) ─────────────────────────────
 *   "7개가 감싼다" 고 보고됐지만, 실제로 App.Storage.save 를 덮어쓰는 것은
 *   4개입니다. chart-indicators / chart-drawings / chart-oscillators 는
 *   자기 설정을 저장하려고 save() 를 부르기만 하고 감싸지는 않습니다.
 *   위험한 것은 "감싸는 4개의 순서" 이므로 그쪽을 엄격하게 박고,
 *   나머지 3개는 "감싸기 시작하면 실패" 하도록 반대로 못 박았습니다.
 *   (참고 — save() 를 부르기만 하는 모듈은 js 전체로 11개입니다.
 *    그 개수는 계속 늘 수 있어 기준으로 삼지 않습니다.)
 *
 * ⚠ 사이트 코드는 한 글자도 안 고칩니다. 7개가 많다는 것은 발견이지만,
 *   정리는 이번 일이 아닙니다. 지금 상태를 기준으로 박기만 합니다.
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

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* 주석을 걷어낸 실행 본문만 봅니다(주석에 App.Storage.save 라고 적힌 곳이 많습니다). */
function strip(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");
}

/* App.Storage.save = ...  (=== 비교는 빼야 합니다. typeof ... === "function" 이 흔합니다) */
const WRAP = /App\.Storage\.save\s*=(?!=)/;
const CALL = /App\.Storage\.save\s*\(/;

const JS_DIR = path.join(REPO, "js");
const JS_FILES = fs.readdirSync(JS_DIR).filter((f) => f.endsWith(".js"));

/* -------------------------------------------------------------------------
 * 2026-08-27 기준선. 이 목록이 늘거나 순서가 바뀌면 실패합니다.
 * ----------------------------------------------------------------------- */
const 감싸는모듈_기준 = [
  "js/funding-restore-guard.js",
  "js/symbol-guard.js",
  "js/ghost-position-guard.js",
  "js/symbol-sync-bridge.js",
];

/* 부르기만 하고 감싸지는 않는 것들(수리팀이 센 7개 중 나머지 3개).
   여기 있는 파일이 감싸기 시작하면 순서 문제가 하나 더 생깁니다. */
const 부르기만_기준 = [
  "js/chart-indicators.js",
  "js/chart-drawings.js",
  "js/chart-oscillators.js",
];

const 순서있는7개 = [
  "js/funding-restore-guard.js",
  "js/symbol-guard.js",
  "js/chart-indicators.js",
  "js/chart-drawings.js",
  "js/ghost-position-guard.js",
  "js/symbol-sync-bridge.js",
  "js/chart-oscillators.js",
];

const 위험문구 =
  "symbol-sync-bridge 가 symbol-guard 보다 앞으로 왔습니다. " +
  "로그인 복원 때 종목이 BTCUSDT 로 둔갑해 다른 종목 포지션이 즉시 " +
  "강제청산됩니다(2026-08-27 P1).";

console.log("\nApp.Storage.save 감싸기 — 순서가 바뀌면 포지션 종목이 둔갑한다");

/* =========================================================================
 * [1] 감싸는 모듈이 늘지 않았다
 * ========================================================================= */
section("[1] App.Storage.save 를 감싸는 모듈");
const 감싸는모듈 = JS_FILES.map((f) => "js/" + f).filter((rel) => WRAP.test(strip(read(rel))));
{
  ok("감싸는 모듈이 4개다(2026-08-27 기준선)", 감싸는모듈.length === 4,
    감싸는모듈.length + "개: " + 감싸는모듈.join(", ") +
    " — 감싸는 모듈이 늘면 순서에 따라 도장이 뒤집힙니다. " +
    "늘렸다면 index.html 에서 js/symbol-sync-bridge.js 보다 " +
    "어디에 넣었는지 확인하고 이 파일의 기준선을 같이 고치세요");

  감싸는모듈_기준.forEach((f) => {
    ok(f + " 가 감싸는 쪽에 있다", 감싸는모듈.indexOf(f) >= 0,
      "감싸기를 그만뒀습니다 — 기준선을 다시 확인하세요");
  });

  const 새로생긴 = 감싸는모듈.filter((f) => 감싸는모듈_기준.indexOf(f) < 0);
  ok("기준선에 없는 새 감싸기가 없다", 새로생긴.length === 0,
    "새로 감싸기 시작한 모듈: " + 새로생긴.join(", "));

  부르기만_기준.forEach((f) => {
    const s = strip(read(f));
    ok(f + " 는 부르기만 하고 감싸지 않는다", !WRAP.test(s) && CALL.test(s),
      WRAP.test(s) ? "감싸기 시작했습니다 — 순서 문제가 하나 더 늘었습니다" : "save() 를 더는 안 부릅니다");
  });
  console.log("      └ 감싸는 모듈: " + 감싸는모듈.join(", "));
}

/* =========================================================================
 * [2] index.html 안에서의 순서 — 여기가 핵심입니다
 * ========================================================================= */
section("[2] index.html 실리는 순서");
const html = read("index.html");
const 줄 = html.split(/\r?\n/);
function 줄번호(rel) {
  for (let i = 0; i < 줄.length; i++) {
    if (줄[i].indexOf('src="' + rel + '"') >= 0) return i + 1;
  }
  return -1;
}
{
  /* ⭐ 이번 P1 수정이 통째로 기대고 있는 한 줄입니다. */
  const g = 줄번호("js/symbol-guard.js");
  const b = 줄번호("js/symbol-sync-bridge.js");
  ok("js/symbol-guard.js 가 index.html 에 실려 있다", g > 0, "실리지 않았습니다");
  ok("js/symbol-sync-bridge.js 가 index.html 에 실려 있다", b > 0, "실리지 않았습니다");
  ok("js/symbol-sync-bridge.js 가 js/symbol-guard.js 보다 뒤에 있다 (= 더 바깥)",
    g > 0 && b > 0 && b > g,
    위험문구 + " 지금 위치: symbol-guard " + g + "행 / symbol-sync-bridge " + b + "행");

  /* 감싸는 4개 전체 순서. 하나라도 자리가 바뀌면 알려줍니다. */
  const 실린순서 = 감싸는모듈_기준
    .map((f) => ({ f: f, line: 줄번호(f) }))
    .sort((a, c) => a.line - c.line)
    .map((x) => x.f);
  ok("감싸는 4개 순서가 기준선 그대로다",
    실린순서.join(" → ") === 감싸는모듈_기준.join(" → "),
    "지금: " + 실린순서.join(" → ") + "\n     기준: " + 감싸는모듈_기준.join(" → ") +
    " — 감싸는 순서가 바뀌면 symbol 도장을 누가 먼저 찍는지가 뒤집힙니다");

  감싸는모듈_기준.forEach((f) => ok(f + " 가 index.html 에 실려 있다", 줄번호(f) > 0));

  /* 수리팀이 센 7개가 전부 실려 있고 그 상대 순서도 그대로인지. */
  const 일곱 = 순서있는7개.map((f) => ({ f: f, line: 줄번호(f) }));
  ok("7개가 전부 index.html 에 실려 있다", 일곱.every((x) => x.line > 0),
    일곱.filter((x) => x.line < 0).map((x) => x.f).join(", ") + " 가 없습니다");
  const 정렬 = 일곱.slice().sort((a, c) => a.line - c.line).map((x) => x.f);
  ok("7개의 상대 순서가 2026-08-27 그대로다", 정렬.join(" → ") === 순서있는7개.join(" → "),
    "지금: " + 정렬.join(" → "));

  /* js/symbol-guard.js 는 js/trading.js 보다 앞이어야 합니다
     (그물이 거래엔진의 price:update 구독을 가로채야 하므로). */
  ok("js/symbol-guard.js 가 js/trading.js 보다 앞이다",
    g > 0 && g < 줄번호("js/trading.js"),
    "뒤로 밀리면 그물이 거래엔진 구독을 못 가로챕니다");

  console.log("      └ 실린 줄: " + 일곱.map((x) => x.f.replace("js/", "") + " " + x.line).join(" / "));
}

/* -------------------------------------------------------------------------
 * 작은 부팅기 — 두 안전장치를 원하는 순서로 태워 봅니다.
 * (tests/harness.js 는 순서를 바꿔 태울 수 없어서 여기만 따로 만듭니다.)
 * ----------------------------------------------------------------------- */
function mini(files) {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/",
  });
  const win = dom.window;
  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.alert = (m) => { win.__lastAlert = m; };
  win.eval(
    "window.App = window.App || {};" +
    "App.Bus = (function(){ var L = {}; return {" +
    "  on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
    "  off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
    "  emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{ f(p); }catch(x){} }); }" +
    "}; })();" +
    "App.bootApp = function(){ return true; };"
  );
  ["js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js"]
    .concat(files)
    .forEach((f) => win.eval(read(f)));
  return win;
}

/* 서버에서 삼성전자 포지션을 받아 온 상황을 만듭니다.
   (js/auth.js 가 symbol 을 안 옮기는 것이 이 P1 의 출발점입니다.) */
const 열린시각 = 1700000000000;
function 복원해보기(files) {
  const w = mini(files);
  w.App.SymbolSyncBridge._remember("positions", 열린시각, "SAMSUNGUSDT");
  const doc = { position: { openTime: 열린시각, side: "long", entry: 70000 } };
  w.App.Storage.save("trading", doc);   // js/auth.js:412 가 하는 그 저장
  return { win: w, symbol: doc.position.symbol };
}

/* =========================================================================
 * [3] 순서를 실제로 뒤집어 보고 무슨 일이 나는지 숫자로 남깁니다
 * ========================================================================= */
section("[3] 순서를 뒤집으면 실제로 종목이 둔갑한다");
{
  /* 정상 — index.html 과 같은 순서(guard 먼저 → bridge 가 더 바깥) */
  const 정상 = 복원해보기(["js/symbol-guard.js", "js/symbol-sync-bridge.js"]);
  ok("정상 순서에서는 서버가 준 종목(SAMSUNGUSDT)이 살아남는다",
    정상.symbol === "SAMSUNGUSDT",
    "찍힌 종목: " + String(정상.symbol));
  ok("정상 순서에서는 bridge 의 감싸기가 가장 바깥이다",
    정상.win.App.Storage.save.__symbolBridged === true,
    "바깥이 bridge 가 아닙니다 — 도장 순서가 뒤집힙니다");
  ok("정상 순서에서도 guard 는 여전히 복원 구간(armed)이다",
    정상.win.App.SymbolGuard.isArmed() === true,
    "armed 가 false 면 이 재현이 성립하지 않습니다");

  /* 역순 — bridge 를 먼저, guard 를 나중에(= guard 가 더 바깥) */
  const 역순 = 복원해보기(["js/symbol-sync-bridge.js", "js/symbol-guard.js"]);
  ok("역순이면 삼성전자 포지션이 BTCUSDT 로 둔갑한다(= 막아야 할 것)",
    역순.symbol === "BTCUSDT",
    "찍힌 종목: " + String(역순.symbol) +
    " — 둔갑이 안 일어난다면 두 파일의 도장 규칙이 바뀐 것입니다. " +
    "이 테스트의 전제를 다시 확인하세요");
  ok("역순이면 bridge 의 감싸기가 바깥이 아니다",
    !역순.win.App.Storage.save.__symbolBridged,
    "역순인데 bridge 가 바깥입니다");

  console.log("      └ 정상 순서 → " + 정상.symbol + " / 역순 → " + 역순.symbol);
  console.log("      └ 역순이면 삼성전자 포지션이 비트코인 시세로 평가돼 즉시 강제청산됩니다");
}

/* =========================================================================
 * [4] 두 안전장치의 도장 규칙이 그대로다 (위 재현의 전제)
 * ========================================================================= */
section("[4] 도장 규칙 — '값이 있으면 건너뛴다' 가 유지된다");
{
  const guard = strip(read("js/symbol-guard.js"));
  const bridge = strip(read("js/symbol-sync-bridge.js"));

  ok("guard 의 stamp 는 값이 있으면 건너뛴다",
    /if \(typeof obj\.symbol === "string" && obj\.symbol\) return false;/.test(guard),
    "먼저 찍은 값을 덮어쓰기 시작하면 순서 규칙이 통째로 뒤집힙니다");
  ok("bridge 의 stampOne 도 값이 있으면 건너뛴다",
    /if \(isSym\(obj\.symbol\)\) return false;/.test(bridge),
    "먼저 찍은 값을 덮어쓰기 시작하면 순서 규칙이 통째로 뒤집힙니다");
  ok("guard 는 복원 구간에 BTCUSDT 로 찍는다",
    /return duringRestore \? DEFAULT_SYMBOL : activeSymbol\(\);/.test(guard),
    "이 규칙이 바뀌면 [3] 의 재현이 성립하지 않습니다");
  ok("두 파일의 기본 종목이 BTCUSDT 로 같다",
    /DEFAULT_SYMBOL = "BTCUSDT"/.test(guard) && /DEFAULT_SYMBOL = "BTCUSDT"/.test(bridge));
  ok("bridge 가 자기 감싸기에 __symbolBridged 표식을 단다",
    /wrapped\.__symbolBridged = true/.test(bridge),
    "표식이 없으면 '누가 바깥인가' 를 확인할 방법이 없어집니다");
}

/* =========================================================================
 * [5] 되돌리는 방법이 두 파일에 적혀 있다
 * ========================================================================= */
section("[5] 되돌리는 방법");
{
  ["js/symbol-guard.js", "js/symbol-sync-bridge.js"].forEach((f) => {
    const src = read(f);
    ok(f + " 에 되돌리는 방법이 적혀 있다",
      /되돌리는 방법/.test(src) && src.indexOf('<script src="' + f + '">') >= 0,
      "한 줄 지우면 원래대로 돌아간다는 설명이 있어야 합니다");
  });
}

/* =========================================================================
 * [6] 수정 금지 파일 12개를 건드리지 않았다
 * ========================================================================= */
section("[6] 수정 금지 파일 12개");
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
 * [7] npm test 목록에 등록돼 있다
 * ========================================================================= */
section("[7] 테스트 등록");
{
  const pkg = read("tests/_order.txt"); /* 2026-08-27 — 실행 목록이 package.json 에서 tests/_order.txt 로 옮겨졌습니다 */
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다",
    pkg.indexOf("tests/storage-save-wrap-order.test.js") >= 0,
    "목록에 없으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
process.exit(0);
