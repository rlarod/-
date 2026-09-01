/* tests/bracket-max-leverage-seal.test.js
 * =========================================================================
 * [B] 명목 구간별 ★최대 배율★ — 봉인 (2026-08-31)
 * =========================================================================
 * 대표 결재 — "바이낸스 거래 시스템을 따라해 그것만 허용"
 * (A건과 같은 결재의 다음 건입니다. js/trading.js 해시 7e26f9d5… → ff3fef52…)
 *
 * ── 무엇이 바뀌었나 ───────────────────────────────────────────────────
 *   바이낸스는 주문 금액(명목)이 커질수록 쓸 수 있는 최대 배율을 낮춥니다.
 *   우리도 같은 표(js/risk-brackets.js)를 그대로 씁니다.
 *
 *     명목 ≤   300,000 → 150배   (엔진 상한 125 로 깎임)
 *     명목 ≤   800,000 → 100배
 *     명목 ≤ 3,000,000 →  75배
 *     명목 ≤12,000,000 →  50배
 *     명목 ≤70,000,000 →  25배   ... (12구간까지)
 *
 *   A건이 넣었던 "유지증거금 ≥ 증거금이면 거부" 는 ★이 규칙으로 대체★ 됐습니다.
 *   ⚠️ 지운 게 아니라 ★더 넓게 막는 것으로 바꾼 것★ 입니다. 그 포함 관계를
 *      ⑥ 에서 매번 다시 계산해서 확인합니다.
 *
 * ── ⭐⭐ 이 파일에서 제일 중요한 것 — ① 입니다 ─────────────────────────
 *   ★대표님이 지금 100배 포지션을 들고 계십니다.★
 *   B건이 "명목이 크면 100배 금지" 라는 규칙이라, 잘못 만들면 ★이미 열려 있는
 *   포지션까지 소급해서 줄이거나 청산★ 해 버릴 수 있습니다. 그건 회원 돈이
 *   사라지는 일이고 되돌릴 수 없습니다.
 *
 *   그래서 ① 은 "새 주문에만 걸린다" 를 ★코드가 아니라 실제로 열어서★ 확인합니다.
 *   B건 이전에 열린 포지션을 저장소에서 복원해 놓고, 가격을 흔들고, 절반 청산하고,
 *   전량 청산까지 해 봅니다. 어느 단계에서도 배율·수량·증거금·청산가가
 *   바뀌면 안 됩니다.
 *
 * ── 이 파일이 못 박는 것 ──────────────────────────────────────────────
 *   ① 기존 포지션은 강제로 줄지 않는다 (호출 지점이 진입 경로 2곳뿐)
 *   ② 창(js/leverage-modal.js)과 엔진이 ★같은 함수★ 를 본다
 *   ③ 수량이 없으면 상한을 안 줄인다 (모르는 걸 막지 않는다)
 *   ④ MAX_LEVERAGE(125) 를 절대 안 넘는다
 *   ⑤ 구간표를 못 읽으면 막지 않는다 (되돌림 경로)
 *   ⑥ ★대체 안전성★ — 구간 상한을 지킨 주문은 진입 즉시 청산되지 않는다
 *   ⑦ ⚠️ 화면-엔진이 아직 어긋날 수 있는 통로 두 곳 (2026-09-01 추가 · ★사실 기록★)
 *
 * 네트워크를 쓰지 않습니다. 진짜 js/trading.js 를 그대로 태웁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

/* ------------------------------------------------------------------------
 * 무대 — 거래엔진 + 구간표를 진짜로 띄웁니다 (계산은 하나도 흉내내지 않습니다)
 * withBrackets:false 로 주면 구간표를 뺀 옛 환경(되돌림 경로)이 됩니다
 * ---------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const store = {};
  if (opts.balance !== undefined) {
    store["btc_sim_v2_trading"] = JSON.stringify({
      version: 1, savedAt: Date.now(), state: { balance: opts.balance },
    });
  }
  if (opts.saved) store["btc_sim_v2_trading"] = JSON.stringify(opts.saved);

  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
    Math: Math, Date: Date, isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat,
    module: { exports: {} },
    document: { readyState: "complete", addEventListener() {} },
    localStorage: {
      getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
    },
  };
  sandbox.window = sandbox;
  const listeners = {};
  sandbox.App = {
    Bus: {
      on(e, f) { (listeners[e] = listeners[e] || []).push(f); return f; },
      off(e, f) { if (listeners[e]) listeners[e] = listeners[e].filter((x) => x !== f); },
      emit(e, p) { (listeners[e] || []).forEach((f) => f(p)); },
    },
    Config: { getActiveSymbol: () => "BTCUSDT" },
  };

  vm.createContext(sandbox);
  vm.runInContext(read("js/storage.js"), sandbox, { filename: "js/storage.js" });
  if (opts.withBrackets !== false) {
    vm.runInContext(read("js/risk-brackets.js"), sandbox, { filename: "js/risk-brackets.js" });
  }
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
  /* js/max-margin-safe.js — 2026-09-01. ★엔진을 감싸는 모듈이라 반드시 trading.js 뒤★ 입니다
     (index.html 도 1269행 trading → 1272행 max-margin-safe 순서).
     안 태우면 getMaxAffordableMargin 이 옛 값을 돌려줘, ★테스트는 거절을 보고
     회원은 통과를 겪습니다★ — 목록은 tests/_engine-modules.js 의 엔진뒤 에 있습니다. */
  vm.runInContext(read("js/max-margin-safe.js"), sandbox, { filename: "js/max-margin-safe.js" });
  sandbox.App.Trading.init();

  const tick = (price) => sandbox.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  return { S: sandbox, T: sandbox.App.Trading, RB: sandbox.App.RiskBrackets, tick };
}

const 진입가 = 60000;

/* ========================================================================
 * ① ⭐⭐ 기존 포지션은 강제로 줄지 않는다
 * ------------------------------------------------------------------------
 * 대표님이 B건 이전에 100배로 잡아둔 포지션을 그대로 복원합니다.
 * 수리팀 실측 조건과 같은 값입니다 — 100배 · 명목 9,600,000.
 *
 * ⚠️ 여기가 빨강이면 ★배포하면 안 됩니다.★ 회원 포지션이 소급해서 바뀝니다.
 * ====================================================================== */
section("① ⭐⭐ 기존 포지션은 강제로 줄지 않는다 (대표님이 100배를 들고 계십니다)");
{
  /* B건 이전에 열린 포지션 — 명목 9,600,000 은 4구간이라 ★지금은 100배로 못 엽니다.★
     그런데 이미 열린 것은 그대로 살아 있어야 합니다. */
  const 옛포지션 = {
    side: "long", entry: 진입가, leverage: 100, margin: 96000,
    qty: 160, liq: 59524.5, tp: null, sl: null, entryFee: 4800,
  };
  const env = boot({
    saved: {
      version: 1, savedAt: Date.now(),
      state: { balance: 50000, position: JSON.parse(JSON.stringify(옛포지션)) },
    },
  });

  const p0 = env.T.getSnapshot().position;
  ok("B건 이전 100배 포지션이 살아난다", !!p0, "복원 실패");
  ok("배율이 100 그대로다 (구간 상한 50 으로 안 깎인다)", !!p0 && p0.leverage === 100,
    p0 ? String(p0.leverage) : "-");
  ok("명목이 9,600,000 그대로다 (수량 160 × 진입가 60,000)",
    !!p0 && Math.abs(p0.qty * p0.entry - 9600000) < 1e-6, p0 ? String(p0.qty * p0.entry) : "-");
  ok("증거금 96,000 그대로", !!p0 && p0.margin === 96000, p0 ? String(p0.margin) : "-");
  ok("수량 160 그대로", !!p0 && p0.qty === 160, p0 ? String(p0.qty) : "-");
  ok("저장돼 있던 청산가 59,524.5 를 소급해서 안 바꾼다",
    !!p0 && p0.liq === 59524.5, p0 ? String(p0.liq) : "-");

  /* ⚠️ 이게 진짜 확인입니다 — 지금 새로 열려고 하면 거절되는 조건입니다.
     "거절되는 조건인데 기존 것은 살아 있다" 가 이 절의 전부입니다. */
  ok("같은 조건을 ★새로★ 열면 거절된다 (즉, 소급 적용이었다면 이 포지션은 사라졌을 것)",
    env.T.bracketMaxLeverage(9600000) === 50, String(env.T.bracketMaxLeverage(9600000)));

  /* 가격이 움직여도 그대로여야 합니다 (checkTriggers 경로에 상한이 끼면 안 됩니다) */
  env.tick(60500);
  env.tick(59800);
  env.tick(60200);
  const p1 = env.T.getSnapshot().position;
  ok("가격이 위아래로 움직여도 배율·수량·증거금·청산가가 그대로다",
    !!p1 && p1.leverage === 100 && p1.qty === 160 && p1.margin === 96000 && p1.liq === 59524.5,
    p1 ? JSON.stringify({ lev: p1.leverage, qty: p1.qty, margin: p1.margin, liq: p1.liq }) : "-");

  /* 절반 청산 — 남은 포지션도 배율이 유지돼야 합니다 */
  const r반 = env.T.closePartial(0.5, "부분청산");
  const p2 = env.T.getSnapshot().position;
  ok("절반 청산이 성공한다", r반 && r반.ok !== false, JSON.stringify(r반));
  ok("절반 청산 뒤에도 남은 포지션의 배율이 100 그대로",
    !!p2 && p2.leverage === 100, p2 ? String(p2.leverage) : "포지션 없음");
  ok("절반 청산 뒤에도 청산가가 그대로 (남은 명목이 줄었다고 다시 계산하지 않는다)",
    !!p2 && p2.liq === 59524.5, p2 ? String(p2.liq) : "-");
  ok("절반 청산 뒤 수량은 80", !!p2 && Math.abs(p2.qty - 80) < 1e-9, p2 ? String(p2.qty) : "-");

  /* 전량 청산 */
  const r전 = env.T.closePosition();
  ok("전량 청산도 성공한다", r전 && r전.ok !== false, JSON.stringify(r전));
  ok("전량 청산 뒤 포지션이 사라진다", env.T.getSnapshot().position === null);
  ok("청산 기록이 두 건 남는다 (부분 + 전량)",
    env.T.getSnapshot().closedTrades.length === 2, String(env.T.getSnapshot().closedTrades.length));
}
{
  /* 강제청산 경로도 확인합니다 — 청산가에 닿아 엔진이 스스로 닫을 때
     상한 규칙이 끼어들면 안 됩니다. */
  const env = boot({
    saved: {
      version: 1, savedAt: Date.now(),
      state: {
        balance: 50000,
        position: { side: "long", entry: 진입가, leverage: 100, margin: 96000,
          qty: 160, liq: 59524.5, tp: null, sl: null, entryFee: 4800 },
      },
    },
  });
  env.tick(59524.5);
  const snap = env.T.getSnapshot();
  const t = snap.closedTrades[0] || null;
  ok("기존 100배 포지션도 저장된 청산가에서 정상적으로 강제청산된다",
    !!t && t.reason === "강제청산", t ? t.reason : "거래 없음");
  ok("강제청산도 저장돼 있던 청산가로 체결된다 (상한 규칙이 끼어들지 않는다)",
    !!t && Math.abs(t.exit - 59524.5) < 1e-9, t ? String(t.exit) : "-");
}
{
  /* ⭐ 코드 구조로도 못 박습니다 — 호출 지점이 ★진입 경로 두 곳뿐★ 이어야 합니다.
     나중에 누가 "일관성" 을 이유로 청산 경로에도 같은 검사를 넣으면
     그 순간 기존 포지션이 소급해서 깎입니다. 그때 여기서 터집니다. */
  const src = read("js/trading.js");
  const 줄들 = src.split(/\r?\n/);
  const 호출줄 = [];
  줄들.forEach((line, i) => {
    if (/bracketMaxLeverage\s*\(/.test(line) && !/function bracketMaxLeverage/.test(line)) {
      호출줄.push({ 번호: i + 1, 글: line.trim() });
    }
  });
  /* 정의부(function) 와 내보내기(exports 목록) 는 호출이 아닙니다 */
  const 실제호출 = 호출줄.filter((r) => !/^bracketMaxLeverage,$/.test(r.글));
  ok("bracketMaxLeverage 를 부르는 곳이 정확히 2곳이다",
    실제호출.length === 2,
    실제호출.map((r) => r.번호 + ": " + r.글).join("  |  ") +
      "\n         ⚠️ 늘었다면 ★어디에서★ 늘었는지 보세요. 청산·부분청산 경로에" +
      "\n            들어갔다면 기존 포지션이 소급해서 깎입니다.");

  /* 그 두 곳이 진입 경로(openPosition / placeLimitOrder) 안인지 확인합니다.
     함수 시작 위치를 찾아, 각 호출이 어느 함수 구역에 들어 있는지 봅니다. */
  const 함수시작 = (이름) => src.indexOf("function " + 이름 + "(");
  const 구역 = [
    { 이름: "openPosition", 시작: 함수시작("openPosition") },
    { 이름: "placeLimitOrder", 시작: 함수시작("placeLimitOrder") },
    { 이름: "closePartial", 시작: 함수시작("closePartial") },
    { 이름: "checkTriggers", 시작: 함수시작("checkTriggers") },
  ].filter((f) => f.시작 >= 0).sort((a, b) => a.시작 - b.시작);
  const 어느함수 = (pos) => {
    let 답 = "(함수 밖)";
    구역.forEach((f) => { if (f.시작 <= pos) 답 = f.이름; });
    return 답;
  };
  const 호출위치 = [];
  let idx = src.indexOf("bracketMaxLeverage(");
  while (idx >= 0) {
    /* 정의부 자신은 건너뜁니다 */
    if (src.slice(Math.max(0, idx - 9), idx) !== "function ") 호출위치.push(어느함수(idx));
    idx = src.indexOf("bracketMaxLeverage(", idx + 1);
  }
  ok("두 호출이 openPosition 과 placeLimitOrder 안에 있다",
    호출위치.length === 2 &&
      호출위치.indexOf("openPosition") >= 0 &&
      호출위치.indexOf("placeLimitOrder") >= 0,
    호출위치.join(", "));
  ok("★청산·부분청산 경로(closePartial)에는 없다★",
    호출위치.indexOf("closePartial") === -1, 호출위치.join(", "));
  ok("★강제청산 판정 경로(checkTriggers)에도 없다★",
    호출위치.indexOf("checkTriggers") === -1, 호출위치.join(", "));

  /* setLeverage 도 마찬가지 — 배율을 바꾼다고 기존 포지션이 흔들리면 안 됩니다. */
  const env = boot({
    saved: {
      version: 1, savedAt: Date.now(),
      state: {
        balance: 50000,
        position: { side: "long", entry: 진입가, leverage: 100, margin: 96000,
          qty: 160, liq: 59524.5, tp: null, sl: null, entryFee: 4800 },
      },
    },
  });
  env.tick(진입가);
  env.T.setLeverage(10);
  const p = env.T.getSnapshot().position;
  ok("설정 배율을 10으로 바꿔도 기존 포지션의 배율은 100 그대로",
    !!p && p.leverage === 100, p ? String(p.leverage) : "-");
}

/* ========================================================================
 * ② 창과 엔진이 ★같은 함수★ 를 본다
 * ------------------------------------------------------------------------
 * 왜 — [가] 건에서 똑같은 어긋남이 이미 났습니다. 창이 유지증거금률을 자기
 * 안에 따로 들고 있다가, 엔진이 구간별로 바뀐 뒤에도 "0.50% 버팁니다" 라고
 * 말했습니다. 회원은 그 숫자를 믿고 배율을 골랐습니다(조용한 고장, P1).
 *
 * 이번에도 창이 구간표를 따로 읽으면 같은 일이 납니다. 그래서
 * ★엔진 함수를 실제로 바꿔치기해서, 창이 그걸 부르는지★ 를 봅니다.
 * (소스에 글자가 있는지 보는 것으로는 부족합니다 — 지나가는 주석일 수 있습니다)
 * ====================================================================== */
section("② 창과 엔진이 같은 함수를 본다");
{
  const { boot: harnessBoot } = require("./harness.js");
  const env = harnessBoot({ extra: ["js/leverage-gate.js", "js/leverage-modal.js"] });
  if (env.App.LeverageGate && typeof env.App.LeverageGate.init === "function") {
    env.App.LeverageGate.init();
  }
  env.App.LeverageModal.init();
  env.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 진입가, time: Date.now() });

  ok("엔진이 bracketMaxLeverage 를 공개한다",
    typeof env.App.Trading.bracketMaxLeverage === "function",
    typeof env.App.Trading.bracketMaxLeverage);
  ok("창이 bracketMax 를 공개한다 (검사할 수 있게)",
    typeof env.App.LeverageModal.bracketMax === "function",
    typeof env.App.LeverageModal.bracketMax);

  const qty = env.doc.getElementById("order-qty-input");
  qty.value = "160";   // 명목 9,600,000 → 4구간 → 50배

  ok("바꿔치기 전 — 창이 50 을 말한다 (엔진과 같은 값)",
    env.App.LeverageModal.bracketMax() === 50, String(env.App.LeverageModal.bracketMax()));

  /* ★엔진 함수를 통째로 바꿔치기합니다.★ 창이 자기 표를 따로 들고 있다면
     여기서도 여전히 50 이 나옵니다 — 그게 우리가 막으려는 상태입니다. */
  const 진짜 = env.App.Trading.bracketMaxLeverage;
  let 불린횟수 = 0;
  let 받은명목 = null;
  env.App.Trading.bracketMaxLeverage = function (n) {
    불린횟수++;
    받은명목 = n;
    return 7;   // 표에 없는 값 — 창이 진짜로 엔진을 부르면 이게 그대로 나와야 합니다
  };
  const 바꾼뒤 = env.App.LeverageModal.bracketMax();
  ok("⭐ 엔진 함수를 바꿔치기하면 창의 답도 같이 바뀐다 (창이 따로 계산하지 않는다)",
    바꾼뒤 === 7,
    "창이 " + 바꾼뒤 + " 를 말했습니다 — 창이 구간표를 ★자기 안에 따로★ 들고 있습니다");
  ok("창이 엔진 함수를 실제로 불렀다", 불린횟수 > 0, "호출 " + 불린횟수 + "회");
  ok("창이 엔진에 넘긴 명목이 수량 × 가격이다 (9,600,000)",
    Math.abs(받은명목 - 9600000) < 1e-6, String(받은명목));

  env.App.Trading.bracketMaxLeverage = 진짜;   // 원래대로 되돌립니다
  ok("되돌린 뒤 창이 다시 50 을 말한다", env.App.LeverageModal.bracketMax() === 50,
    String(env.App.LeverageModal.bracketMax()));

  /* 창이 실제로 고를 수 있는 상한 = 이용권 상한 ∩ 구간 상한 */
  ok("창의 allowedMax 가 구간 상한을 반영한다 (50)",
    env.App.LeverageModal.allowedMax() === 50, String(env.App.LeverageModal.allowedMax()));

  /* 창이 허용한 배율은 ★주문이 반드시 받아줘야★ 합니다.
     창은 50 까지 보여주는데 주문이 40 까지만 받으면 그것도 고장입니다. */
  const 창상한 = env.App.LeverageModal.allowedMax();
  env.App.Trading.setLeverage(창상한);
  const margin = 9600000 / 창상한;
  const before = env.App.Trading.getSnapshot().balance;
  ok("창이 보여주는 최대 배율은 엔진 상한 이하다",
    창상한 <= env.App.Trading.bracketMaxLeverage(9600000),
    창상한 + " vs 엔진 " + env.App.Trading.bracketMaxLeverage(9600000));
  /* 잔고가 모자라면 다른 이유로 거절되므로, 거절 사유가 ★배율 때문★ 이
     아니라는 것만 확인합니다. */
  const r = env.App.Trading.openPosition("long", Math.min(margin, before * 0.9));
  ok("창이 허용한 배율로 넣은 주문이 ★배율 때문에★ 거절되지 않는다",
    r.ok !== false || String(r.error || "").indexOf("배율") === -1,
    String(r.error || ""));
}

/* ========================================================================
 * ③ 수량이 없으면 상한을 안 줄인다
 * ------------------------------------------------------------------------
 * 주문 금액을 모르는 상태에서 임의로 막으면 그것도 거짓말입니다.
 * ([가] 건에서 배운 것과 같은 원칙 — 모르면 아무 말도 하지 않습니다)
 * ====================================================================== */
section("③ 수량이 없으면 상한을 안 줄인다");
{
  const { boot: harnessBoot } = require("./harness.js");
  const env = harnessBoot({ extra: ["js/leverage-gate.js", "js/leverage-modal.js"] });
  if (env.App.LeverageGate && typeof env.App.LeverageGate.init === "function") {
    env.App.LeverageGate.init();
  }
  env.App.LeverageModal.init();
  env.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 진입가, time: Date.now() });

  const qty = env.doc.getElementById("order-qty-input");
  qty.value = "";
  ok("수량이 비어 있으면 구간 상한은 null (모르면 안 막는다)",
    env.App.LeverageModal.bracketMax() === null, String(env.App.LeverageModal.bracketMax()));
  ok("그때 창 상한은 100 (이용권 기본값 그대로)",
    env.App.LeverageModal.allowedMax() === 100, String(env.App.LeverageModal.allowedMax()));

  env.App.LeverageModal.open();
  const 프리셋 = Array.prototype.map.call(
    env.doc.querySelectorAll("#lev-modal-presets .lev-preset"), (b) => Number(b.dataset.v));
  ok("프리셋이 1~100 전부 보인다", 프리셋.indexOf(1) >= 0 && 프리셋.indexOf(100) >= 0,
    프리셋.join(","));
  ok("프리셋에 100 초과가 없다", 프리셋.every((v) => v <= 100), 프리셋.join(","));
  ok("슬라이더 상한도 100",
    Number(env.doc.getElementById("lev-modal-range").max) === 100,
    env.doc.getElementById("lev-modal-range").max);

  /* 0 이나 글자를 넣어도 같습니다 — 못 읽으면 막지 않습니다 */
  qty.value = "0";
  ok("수량 0 도 상한을 안 줄인다", env.App.LeverageModal.bracketMax() === null,
    String(env.App.LeverageModal.bracketMax()));
  qty.value = "abc";
  ok("숫자가 아닌 수량도 상한을 안 줄인다", env.App.LeverageModal.bracketMax() === null,
    String(env.App.LeverageModal.bracketMax()));

  /* 엔진 쪽도 같은 원칙 — 명목이 이상하면 막지 않고 엔진 상한을 돌려줍니다 */
  const e = boot({ balance: 100000 });
  ok("엔진: 명목 0 이면 막지 않는다 (엔진 상한 125)", e.T.bracketMaxLeverage(0) === 125,
    String(e.T.bracketMaxLeverage(0)));
  ok("엔진: 명목이 음수면 막지 않는다", e.T.bracketMaxLeverage(-1) === 125,
    String(e.T.bracketMaxLeverage(-1)));
  ok("엔진: 명목이 숫자가 아니면 막지 않는다", e.T.bracketMaxLeverage("abc") === 125,
    String(e.T.bracketMaxLeverage("abc")));
  ok("엔진: 명목이 NaN 이어도 막지 않는다", e.T.bracketMaxLeverage(NaN) === 125,
    String(e.T.bracketMaxLeverage(NaN)));
  ok("엔진: 명목이 Infinity 여도 막지 않는다", e.T.bracketMaxLeverage(Infinity) === 125,
    String(e.T.bracketMaxLeverage(Infinity)));
}

/* ========================================================================
 * ④ MAX_LEVERAGE(125) 를 절대 안 넘는다
 * ------------------------------------------------------------------------
 * 구간표 1구간은 150배입니다. 그대로 돌려주면 화면 상한이 엔진 상한(125)을
 * 넘어서, 회원은 150배로 잡은 줄 아는데 엔진이 조용히 125 로 깎습니다.
 * CLAUDE.md 가 "화면 상한 ≤ 엔진 상한" 을 못 박은 바로 그 고장입니다.
 * ====================================================================== */
section("④ 엔진 상한 125 를 절대 안 넘는다");
{
  const env = boot({ balance: 100000 });
  const RB = env.RB;
  ok("구간표 1구간은 150배라고 적혀 있다", RB.maxLeverage(100000) === 150,
    String(RB.maxLeverage(100000)));
  ok("⭐ 그래도 엔진이 돌려주는 값은 125 다 (Math.min 이 걸려 있다)",
    env.T.bracketMaxLeverage(100000) === 125, String(env.T.bracketMaxLeverage(100000)));

  /* 표 전체를 훑어 한 구간도 125 를 넘기지 않는지 확인합니다 */
  const 표 = RB.tableFor("BTCUSDT");
  const 넘는구간 = 표
    .map((b) => ({ tier: b.tier, 표값: b.maxLeverage, 엔진값: env.T.bracketMaxLeverage(b.maxNotional) }))
    .filter((r) => r.엔진값 > 125);
  ok("구간표 전체(12구간)에서 엔진값이 125 를 넘는 곳이 하나도 없다",
    넘는구간.length === 0, JSON.stringify(넘는구간));

  /* setLeverage 자체도 125 에서 멈춥니다 (CLAUDE.md 실측 — setLeverage(150) → 125) */
  env.T.setLeverage(150);
  ok("setLeverage(150) 을 불러도 엔진 실제값은 125",
    env.T.getSnapshot().leverage === 125, String(env.T.getSnapshot().leverage));
}

/* ========================================================================
 * ⑤ 구간표를 못 읽으면 막지 않는다 (되돌림 경로)
 * ------------------------------------------------------------------------
 * index.html 에서 <script src="js/risk-brackets.js"> 한 줄을 지우면 이 상태입니다.
 * 그때 ★모든 주문이 거절되면★ 사이트가 통째로 멈춥니다. 막지 말아야 합니다.
 * ====================================================================== */
section("⑤ 구간표가 없으면 막지 않는다 (되돌림 경로)");
{
  const env = boot({ balance: 100000, withBrackets: false });
  ok("구간표가 안 실렸다", !env.RB);
  ok("구간 상한이 엔진 상한(125)으로 되돌아간다",
    env.T.bracketMaxLeverage(9600000) === 125, String(env.T.bracketMaxLeverage(9600000)));

  env.tick(진입가);
  env.T.setLeverage(100);
  const r = env.T.openPosition("long", env.T.getMaxAffordableMargin());
  ok("표가 없으면 100배 주문이 그대로 열린다 (막지 않는다)",
    r.ok !== false, r.error || "");
  ok("그때 청산가는 예전 고정값 0.5% 기준 59,700",
    Math.abs(env.T.getSnapshot().position.liq - 59700) < 1e-6,
    String(env.T.getSnapshot().position.liq));

  /* 표는 있는데 maxLeverage 만 이상한 값을 돌려줄 때도 막지 않아야 합니다 */
  const e2 = boot({ balance: 100000 });
  e2.S.App.RiskBrackets.maxLeverage = () => NaN;
  ok("표가 NaN 을 돌려줘도 막지 않는다 (125)", e2.T.bracketMaxLeverage(9600000) === 125,
    String(e2.T.bracketMaxLeverage(9600000)));
  const e3 = boot({ balance: 100000 });
  e3.S.App.RiskBrackets.maxLeverage = () => 0;
  ok("표가 0 을 돌려줘도 막지 않는다 (1 미만은 무시하고 125)",
    e3.T.bracketMaxLeverage(9600000) === 125, String(e3.T.bracketMaxLeverage(9600000)));
}

/* ========================================================================
 * ⑥ ⭐ 대체 안전성 — 구간 상한을 지킨 주문은 진입 즉시 청산되지 않는다
 * ------------------------------------------------------------------------
 * A건이 넣었던 "유지증거금 ≥ 증거금이면 거부" 를 B건이 지웠습니다.
 * 지워도 되는 이유는 ★새 검사가 옛 검사를 완전히 포함★ 하기 때문입니다.
 *
 * 무슨 뜻인가 —
 *   개시증거금 = 명목 / 배율          → 개시증거금률 = 1 / 배율
 *   유지증거금 = 명목 × MMR − 공제액  → 실효 유지증거금률 = 유지증거금 / 명목
 *   "진입 즉시 청산" 은 유지증거금 ≥ 증거금, 즉
 *   실효 유지증거금률 ≥ 개시증거금률 인 경우입니다.
 *   그러니 (개시증거금률 − 실효 유지증거금률) 이 항상 ★양수★ 이면
 *   그런 주문은 애초에 존재할 수 없습니다.
 *
 * 수리팀 실측 — 명목 1,000 ~ 20억을 훑어 최솟값 ★+0.4000%★.
 *
 * ⚠️⚠️ 나중에 구간표(js/risk-brackets.js)를 고치면 이 값이 음수가 될 수 있습니다.
 *      그러면 "구간 상한은 통과했는데 진입하자마자 청산" 인 주문이 생기고,
 *      A건이 막던 것이 되살아납니다. ★그때 여기서 터져야 합니다.★
 *      그래서 숫자를 외워두지 않고 ★매번 다시 계산★ 합니다.
 * ====================================================================== */
section("⑥ ⭐ 대체 안전성 — 구간 상한을 지키면 진입 즉시 청산이 없다");
{
  const env = boot({ balance: 100000 });
  const RB = env.RB;

  /* 명목 1,000 ~ 20억을 훑습니다. 구간 경계 바로 앞·뒤도 반드시 포함시킵니다 —
     최솟값은 대개 경계에서 나옵니다. */
  const 후보 = [];
  for (let n = 1000; n <= 2000000000; n *= 1.05) 후보.push(n);
  RB.tableFor("BTCUSDT").forEach((b) => {
    후보.push(b.maxNotional - 0.01, b.maxNotional, b.maxNotional + 0.01);
  });
  후보.push(1000, 2000000000);

  let 최솟값 = Infinity;
  let 최소명목 = null;
  let 음수건수 = 0;
  후보.forEach((n) => {
    if (!(n > 0)) return;
    const cap = env.T.bracketMaxLeverage(n);       // 그 명목에서 쓸 수 있는 최대 배율
    const 개시율 = 1 / cap;                         // 최악의 경우 = 상한을 꽉 채워 씀
    const 유지율 = RB.effectiveRate(n);
    const 여유 = 개시율 - 유지율;
    if (여유 < 최솟값) { 최솟값 = 여유; 최소명목 = n; }
    if (여유 <= 0) 음수건수++;
  });

  console.log("      ℹ 훑은 명목 " + 후보.length + "개 · 최소 여유 " +
    (최솟값 * 100).toFixed(4) + "% (명목 " + Math.round(최소명목).toLocaleString("en-US") + ")");

  ok("⭐ (개시증거금률 − 실효 유지증거금률) 이 어디서도 0 이하가 아니다",
    음수건수 === 0,
    음수건수 + "곳에서 0 이하입니다 — ★구간 상한을 지켰는데도 진입 즉시 청산되는 주문★ 이" +
      "\n         생겼습니다. 구간표를 고치셨다면 되돌리거나, A건의 '유지증거금 ≥ 증거금 거부'" +
      "\n         를 다시 넣어야 합니다. 이 봉인이 지키는 것이 정확히 그 상황입니다.");
  ok("최소 여유가 수리팀 실측(+0.4000%)과 같다",
    Math.abs(최솟값 * 100 - 0.4) < 0.0001, (최솟값 * 100).toFixed(6) + "%");

  /* ★말이 아니라 실제로 열어서★ 확인합니다 — 각 구간의 상한을 꽉 채워
     주문을 넣고, 열린 포지션의 청산가가 진입가 반대편에 있는지 봅니다.
     (청산가가 진입가에 닿아 있거나 넘어가 있으면 진입 즉시 청산입니다) */
  let 즉시청산 = 0;
  let 열어본판 = 0;
  RB.tableFor("BTCUSDT").forEach((b) => {
    const 명목 = b.maxNotional;                      // 그 구간에서 가장 위험한 지점
    const cap = env.T.bracketMaxLeverage(명목);
    const margin = 명목 / cap;
    const e = boot({ balance: margin * 2 + 명목 * 0.001 });
    e.tick(진입가);
    e.T.setLeverage(cap);
    const r = e.T.openPosition("long", margin);
    const pos = e.T.getSnapshot().position;
    if (!pos) return;                                 // 잔고 등 다른 이유로 못 열면 건너뜁니다
    열어본판++;
    if (pos.liq >= 진입가) 즉시청산++;
  });
  ok("구간별 상한을 꽉 채운 주문을 실제로 열어봤다 (한 판도 못 열면 아무것도 안 잰 것)",
    열어본판 >= 8, 열어본판 + "판");
  ok("⭐ 그렇게 연 포지션 중 청산가가 진입가에 닿아 있는 것이 하나도 없다",
    즉시청산 === 0, 즉시청산 + "판이 진입 즉시 청산 상태였습니다");
}

/* ========================================================================
 * ⑦ ⚠️ 화면과 엔진이 어긋날 수 있는 통로 두 곳 — ★지금 사실★ 을 적어둡니다
 * ------------------------------------------------------------------------
 * ⛔ 이건 "이게 옳다" 고 못 박는 게 아닙니다. 수리팀이 B건 작업 중에 옆에서
 *    발견한 것을 ★지금 그렇다는 사실★ 로 남기는 것입니다.
 *    막히면 이 검사가 실패하면서 "이제 막혔다" 고 알려줍니다.
 *
 * ⭐ 왜 굳이 적어두나 — 2026-08-31 ~ 09-01 이틀 사이에 ★같은 종류★ 로 세 번 당했습니다.
 *      (가) 창은 0.50% 라고 말하는데 엔진은 0.126% 에서 청산
 *      (나) 최대 버튼이 만든 값을 엔진이 거절
 *      B건  창은 100배를 보여주는데 주문은 50배까지만 받음
 *    전부 ★같은 값을 두 곳에서 따로 계산★ 해서 난 일입니다.
 *    CLAUDE.md 도 "화면 상한이 엔진 상한보다 높으면 조용한 고장" 이라고 못 박습니다.
 *    그래서 남은 통로도 소리 없이 사라지지 않게 적어둡니다.
 * ====================================================================== */
section("⑦ ⚠️ 화면-엔진이 어긋날 수 있는 통로 (지금 사실 기록)");
{
  const { boot: harnessBoot } = require("./harness.js");

  /* ── (1) 저장된 배율이 100 을 넘으면 엔진만 그 값을 씁니다 ────────────
     js/leverage-gate.js 는 화면(#lev-display · #lev-slider)만 100 으로 조입니다.
     엔진 쪽은 setLeverage 를 감싸서 막는데, ★복원은 setLeverage 를 안 거칩니다.★
     그래서 저장소에 125 가 들어 있으면 엔진만 125 가 됩니다.

     실측(2026-09-01) — 저장 배율 125 로 복원 → 엔진 125 / 슬라이더 max 100.
     회원이 화면에서 도달할 수 있는 값이 아니라 ★지금은 안 터집니다.★
     다만 화면이 100 인데 엔진이 125 면 명목이 25% 더 커지고 청산가도 가까워집니다. */
  const env = harnessBoot({ balance: 100000, extra: ["js/leverage-gate.js"] });
  if (env.App.LeverageGate && typeof env.App.LeverageGate.init === "function") {
    env.App.LeverageGate.init();
  }
  env.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 진입가, time: Date.now() });

  ok("화면 경로로는 100 을 못 넘는다 (게이트가 setLeverage 를 감싼다)",
    (function () { env.App.Trading.setLeverage(125); return env.App.Trading.getSnapshot().leverage; })() === 100,
    String(env.App.Trading.getSnapshot().leverage));
  ok("슬라이더 상한도 100 이다",
    Number(env.doc.getElementById("lev-slider").max) === 100,
    env.doc.getElementById("lev-slider").max);

  /* ⚠️ 저장소 복원 경로 — ★setLeverage 를 안 거칩니다.★
     harness 는 스크립트가 실린 뒤에야 손댈 수 있어 복원 순간을 못 잡습니다.
     그래서 엔진만 직접 띄워서 확인합니다. */
  {
    /* 저장 배율 125 를 심고 엔진만 띄웁니다 — 게이트 없이도 엔진은 125 를 받습니다 */
    const vm2 = require("vm");
    const store = {
      btc_sim_v2_trading: JSON.stringify({
        version: 1, savedAt: Date.now(), state: { balance: 100000, leverage: 125 },
      }),
    };
    const sb = {
      console: { log() {}, warn() {}, error() {} },
      setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
      JSON: JSON, Object: Object, Array: Array, String: String, Number: Number,
      Math: Math, Date: Date, isFinite: isFinite, isNaN: isNaN, parseFloat: parseFloat,
      module: { exports: {} },
      document: { readyState: "complete", addEventListener() {} },
      localStorage: {
        getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; },
      },
    };
    sb.window = sb;
    const L2 = {};
    sb.App = {
      Bus: { on(e, f) { (L2[e] = L2[e] || []).push(f); }, off() {}, emit(e, p) { (L2[e] || []).forEach((f) => f(p)); } },
      Config: { getActiveSymbol: () => "BTCUSDT" },
    };
    vm2.createContext(sb);
    ["js/storage.js", "js/risk-brackets.js", "js/trading.js"].forEach((f) =>
      vm2.runInContext(read(f), sb, { filename: f }));
    sb.App.Trading.init();
    ok("⚠️ 저장소에 125 가 들어 있으면 엔진은 그 값을 그대로 쓴다 (복원은 setLeverage 를 안 거침)",
      sb.App.Trading.getSnapshot().leverage === 125,
      String(sb.App.Trading.getSnapshot().leverage) +
        " — 100 이 나왔다면 ★복원 경로도 조여진 것★ 입니다. 축하합니다. 이 검사를" +
        "\n         '복원해도 100 을 넘지 않는다' 로 뒤집고 위 주석을 '막힘(날짜)' 로 옮겨주세요.");
    ok("그때 화면 상한(100)보다 엔진이 크다 — 이것이 어긋남의 정의다",
      sb.App.Trading.getSnapshot().leverage > 100);
  }

  /* ── (2) js/ui.js 의 MAX 칩은 구간 상한을 모릅니다 ──────────────────
     js/ui.js:646 의 .chip[data-margin="max"] 는 지갑 상한만 봅니다.
     그 칩이 든 #margin-field-hidden 이 display:none 이라 ★회원에게 안 보입니다.★
     js/ui.js 는 수정 금지 파일이라 손댈 수 없고, 되살리려면 감싸야 합니다.

     실측(2026-09-01) — 그 칩을 눌러 나온 증거금 95,238.09 (명목 9,523,809) 로
     100배 주문을 넣으면 ★"최대 50배까지만 가능합니다" 로 거절★ 됩니다. */
  const 칸 = env.doc.getElementById("margin-field-hidden");
  ok("MAX 칩이 든 칸이 아직 화면에서 숨겨져 있다 (그래서 지금은 안 터진다)",
    !!칸 && /display\s*:\s*none/.test(칸.getAttribute("style") || ""),
    (칸 && 칸.getAttribute("style")) +
      "\n         ⚠️ 이 칸을 되살렸다면 ★MAX 칩이 구간 상한을 모른다★ 는 문제가 바로 드러납니다." +
      "\n         js/ui.js 는 수정 금지 파일이라, js/qty-price-order.js 처럼 감싸서 고쳐야 합니다.");

  const 칩 = env.doc.querySelector('.chip[data-margin="max"]');
  ok("그 칩 자체는 아직 남아 있다 (마크업을 지운 게 아니다)", !!칩);

  if (칩) {
    env.App.Trading.setLeverage(100);
    칩.dispatchEvent(new env.win.Event("click", { bubbles: true }));
    const m = parseFloat(env.doc.getElementById("margin-input").value);
    const r = env.App.Trading.openPosition("long", m);
    ok("⚠️ 그 칩이 넣은 값으로 100배 주문을 넣으면 지금은 거절된다 (구간 상한을 모름)",
      r.ok === false && String(r.error).indexOf("배율") >= 0,
      (r.ok === false ? r.error : "주문이 통과했습니다 — ★고쳐진 것 같습니다.★ 축하합니다.") +
        "\n         통과했다면 이 검사를 '거절되지 않는다' 로 뒤집고 위 주석을 '고쳐짐(날짜)' 로 옮겨주세요.");
    ok("그 값은 지갑 상한으로는 맞다 (틀린 게 아니라 ★구간만 안 본다★)",
      Math.abs(m - 95238.09) < 0.5, String(m));
  }
}

/* ========================================================================
 * ⑧ 수정 금지 파일 (md5)
 * ---------------------------------------------------------------------- */
section("⑧ 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  /* 해시 값은 tests/_locked-hashes.js 한 곳에만 있습니다 — 여기 글자로 안 적습니다.
     (48개 파일에 흩어져 있던 것을 2026-08-31 에 한 곳으로 모았습니다) */
  ok("js/trading.js 가 결재기록에 적힌 그 판이다",
    md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
