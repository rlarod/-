/* tests/max-margin-safe-seal.test.js
 * =========================================================================
 * "최대(MAX/100%) 버튼을 눌렀는데 돈이 모자란다고 한다" — 봉인 (2026-09-01)
 * =========================================================================
 * 고친 것: js/max-margin-safe.js (엔진 감싸기) + js/qty-price-order.js
 * 수정 금지 파일 js/trading.js 는 ★한 글자도 안 건드렸습니다.★
 *
 * ── 결함 두 개 ─────────────────────────────────────────────────────────
 *
 *  (가) 최대 버튼이 되돌려 계산한 값을 엔진이 스스로 거절했습니다
 *
 *       최대 버튼   margin = 잔고 / (1 + 배율 × taker)          js/trading.js:109
 *       진입 검사   margin + margin × 배율 × taker > 잔고 → 거절 js/trading.js:132
 *
 *       종이 위에서는 정확히 같습니다. 나눈 뒤 다시 곱하면 마지막 자리가 어긋납니다.
 *       실측 — 지갑 130,000 · 50배: 130,000.00000000001 > 130,000  →  거절.
 *       PM 실측 — 수정 전 ★29 / 66★ 거절 → 수정 후 ★0 / 66★.
 *       (이 파일은 지갑 목록이 조금 달라 대조군이 22건 나옵니다. 중요한 것은 ★0 이 아니라는 것★ 입니다)
 *
 *  (나) 🔴 최대 버튼을 누른 뒤 ★배율을 바꾸면★ 증거금이 반비례로 커졌습니다
 *
 *       증거금 = 수량 × 가격 ÷ 배율 입니다. 수량이 그대로면 배율이 1/5 이 될 때
 *       증거금은 ★5배★ 가 됩니다. 최대 버튼은 "누를 때의 배율" 기준이라 전제가 깨집니다.
 *
 *       PM 실측 (대표님 잔고 98,986.53 USDT)
 *         50배에서 최대 → 증거금  96,572
 *         10배로 낮춤   → 증거금 ★482,861★ → "돈이 모자랍니다"
 *         배율 조합 30개 중 ★15개 거절★
 *       PM 실측 — 수정 전 ★100 / 231★ 거절 → 수정 후 ★0 / 231★.
 *
 * ── ⭐⭐ 이 파일에서 제일 중요한 것 — [2] 입니다 ────────────────────────
 *   ★깎는 양을 사람이 고르지 않는다.★
 *   "그냥 0.999 곱하면 되잖아" 가 제일 하기 쉬운 수정이고, 제일 나쁜 수정입니다.
 *     · 여유가 모자라면 → 여전히 거절됩니다 (아무것도 안 고친 셈)
 *     · 여유가 넉넉하면 → ★회원 돈이 그만큼 안 들어갑니다★ (0.1% 면 100만에 1,000)
 *   지금 코드는 ★엔진이 실제로 쓰는 그 부등호★ 를 검사하고 통과할 때까지
 *   소수 마지막 자리만 한 칸씩 내립니다. 그래서 깎이는 양이 2^-52 수준입니다.
 *   [2] 는 그 성질을 ★행동으로★ 잽니다 — 상수 하나만 바꿔도 터집니다.
 *
 * ── 이 파일이 못 박는 것 ──────────────────────────────────────────────
 *   [1] (가) 최대 버튼 값을 엔진 부등호에 넣으면 ★항상★ 통과한다 (지갑 11 × 배율 6)
 *   [2] ⭐⭐ 깎는 양을 사람이 고르지 않는다 (임의 여유값 금지 · 회원 돈 안 남김)
 *   [3] 수수료율을 지어내지 않는다 (엔진 getSnapshot().feeRate.taker 에서 받는다)
 *   [4] ★진입 검사(부등호)는 안 건드린다★ · 돌려주는 값은 언제나 원래 값 이하
 *   [5] 못 읽으면 원래 값 그대로 (되돌림 경로)
 *   [6] 감싸는 시점 — js/trading.js ★뒤★ 여야 한다
 *   [7] (나) 최대 버튼 → 배율 변경 → 주문 이 거절되지 않는다 (실제 화면으로)
 *
 * 네트워크를 쓰지 않습니다. 진짜 js/trading.js 를 그대로 태웁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
/* 엔진과 같이 태울 것 — 목록은 tests/_engine-modules.js 한 곳에만 있습니다.
   엔진필수 = 엔진보다 ★먼저★ (엔진이 읽어감) / 엔진뒤 = 엔진 ★뒤★ (엔진을 감쌈) */
const { 엔진필수, 엔진뒤 } = require("./_engine-modules.js");

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
 * 무대 — 엔진 + 구간표 + 감싸는 모듈을 진짜로 띄웁니다
 * ---------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const store = {};
  if (opts.balance !== undefined) {
    store["btc_sim_v2_trading"] = JSON.stringify({
      version: 1, savedAt: Date.now(), state: { balance: opts.balance },
    });
  }
  const 경고 = [];
  const sandbox = {
    console: { log() {}, warn: (...a) => 경고.push(a.join(" ")), error() {} },
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
  /* ⭐ 태울 목록을 여기 손으로 적지 않습니다 — tests/_engine-modules.js 를 그대로 씁니다.
     손으로 적으면 목록이 늘어날 때 ★이 파일만 뒤처지고 아무도 모릅니다.★
     (2026-08-31 에 봉인 16개가 그렇게 옛 경로를 재고 있었습니다) */
  엔진필수.forEach((m) => vm.runInContext(read(m.경로), sandbox, { filename: m.경로 }));
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
  /* ⚠️ 엔진뒤 는 반드시 엔진 ★뒤★ 입니다. 앞에 태우면 App.Trading 이 아직 없어서
     조용히 아무것도 안 감쌉니다(오류도 안 납니다). [6] 에서 따로 못 박습니다. */
  if (opts.감싸기 !== false) {
    엔진뒤.forEach((m) => vm.runInContext(read(m.경로), sandbox, { filename: m.경로 }));
  }
  sandbox.App.Trading.init();

  const tick = (price) => sandbox.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  return { S: sandbox, T: sandbox.App.Trading, MMS: sandbox.App.MaxMarginSafe, tick, 경고 };
}

/* ★엔진이 실제로 쓰는 그 부등호★ (js/trading.js openPosition).
   여기 식을 엔진과 다르게 쓰면 이 봉인이 아무것도 안 지킵니다. */
function 엔진이거절하나(margin, leverage, taker, balance) {
  return margin + margin * leverage * taker > balance;
}

/* ⭐ 실측 범위를 넓게 — 잔고마다 어긋나는 자리가 달라서 하나로는 못 잡습니다.
   대표님 실제 잔고 98,986.53 을 반드시 포함시킵니다(그 값에서 15개가 거절됐습니다). */
const 지갑들 = [
  100, 1000, 9999.99, 50000, 98986.53, 100000,
  120000, 130000, 150000, 240000, 1234567.89,
];
const 배율들 = [1, 10, 25, 50, 75, 100];

/* ========================================================================
 * [1] (가) 최대 버튼 값을 엔진 부등호에 넣으면 항상 통과한다
 * ------------------------------------------------------------------------
 * PM 실측 — 수정 전 29/66 거절 → 수정 후 0/66.
 * ⚠️ 여기서 재는 것은 ★부등호 하나★ 입니다. 구간 최대배율 거절(B건)과는
 *    다른 이야기라 섞지 않습니다 — 그건 회원을 지키는 쪽이고 그대로 남아야 합니다.
 * ====================================================================== */
section("[1] (가) 최대 버튼 값이 엔진 부등호를 항상 통과한다 (지갑 11 × 배율 6 = 66)");
{
  const 거절 = [];
  let 잰횟수 = 0;
  지갑들.forEach((지갑) => {
    const env = boot({ balance: 지갑 });
    env.tick(60000);
    const taker = env.T.getSnapshot().feeRate.taker;
    배율들.forEach((배율) => {
      env.T.setLeverage(배율);
      const m = env.T.getMaxAffordableMargin();
      잰횟수++;
      if (엔진이거절하나(m, 배율, taker, 지갑)) {
        거절.push(지갑 + " · " + 배율 + "배");
      }
    });
  });
  ok("66가지를 실제로 쟀다 (0 이면 아무것도 안 잰 것)", 잰횟수 === 66, 잰횟수 + " / 66");
  ok("⭐ 거절이 0건이다 (PM 실측: 수정 전 29 / 66)",
    거절.length === 0, 거절.length + "건 거절 — " + 거절.join(", "));

  /* ⭐ 감싸기를 빼면 예전처럼 거절이 나와야 합니다.
     안 나오면 이 봉인이 ★아무것도 안 지키고 있는 것★ 입니다(고쳐지지 않은 것을
     고쳐졌다고 착각하게 만듭니다). 그래서 대조군을 같이 둡니다. */
  const 감싸기없이거절 = [];
  지갑들.forEach((지갑) => {
    const env = boot({ balance: 지갑, 감싸기: false });
    env.tick(60000);
    const taker = env.T.getSnapshot().feeRate.taker;
    배율들.forEach((배율) => {
      env.T.setLeverage(배율);
      const m = env.T.getMaxAffordableMargin();
      if (엔진이거절하나(m, 배율, taker, 지갑)) 감싸기없이거절.push(지갑 + " · " + 배율 + "배");
    });
  });
  console.log("      ℹ 감싸기 없이 재면 " + 감싸기없이거절.length + "건이 거절됩니다 (2026-09-01 실측 22 — PM 이 잰 29/66 과 지갑 목록이 달라 수가 다릅니다)");
  ok("대조군 — 감싸기를 빼면 실제로 거절이 나온다 (0 이면 이 봉인이 아무것도 안 지킵니다)",
    감싸기없이거절.length > 0,
    "감싸기 없이도 전부 통과합니다. 부등호나 최대 버튼 식이 바뀌었을 수 있습니다 — " +
      "그러면 js/max-margin-safe.js 가 더 필요 없는지 다시 보세요.");

  /* 실제로 주문까지 넣어봅니다 — 부등호만 맞추고 진입이 안 되면 소용없습니다.
     ⚠️ 구간 최대배율(B건)에 걸리는 조합은 ★다른 이유★ 이므로 따로 셉니다. */
  let 진입성공 = 0, 배율거절 = 0, 자산거절 = [];
  지갑들.forEach((지갑) => {
    배율들.forEach((배율) => {
      const env = boot({ balance: 지갑 });
      env.tick(60000);
      env.T.setLeverage(배율);
      const r = env.T.openPosition("long", env.T.getMaxAffordableMargin());
      if (r.ok !== false) 진입성공++;
      else if (String(r.error).indexOf("배율") >= 0) 배율거절++;
      else 자산거절.push(지갑 + " · " + 배율 + "배 → " + r.error);
    });
  });
  console.log("      ℹ 진입 성공 " + 진입성공 + " / 구간배율 거절 " + 배율거절 + " / 가용자산 거절 " + 자산거절.length);
  ok("⭐ '가용 자산보다 큽니다' 로 거절되는 조합이 하나도 없다",
    자산거절.length === 0, 자산거절.join("  |  "));
  ok("구간 최대배율 거절(B건)은 그대로 살아 있다 (회원을 지키는 쪽이라 없애면 안 됩니다)",
    배율거절 > 0, "0건 — B건 안전장치가 같이 사라졌을 수 있습니다");
}

/* ========================================================================
 * [2] ⭐⭐ 깎는 양을 사람이 고르지 않는다
 * ------------------------------------------------------------------------
 * ⚠️ 다음 사람이 "그냥 0.999 곱하면 되잖아" 로 바꾸면 ★여기서 터져야 합니다.★
 *
 *   0.999 를 곱하면 —
 *     · 부등호는 통과합니다 (그래서 [1] 은 초록으로 지나갑니다)
 *     · 그런데 ★회원 돈 0.1% 가 안 들어갑니다★ — 100만이면 1,000 을 남깁니다
 *   그래서 [1] 만으로는 못 잡습니다. "필요한 만큼만 깎았는가" 를 따로 잽니다.
 * ====================================================================== */
section("[2] ⭐⭐ 깎는 양을 사람이 고르지 않는다");
{
  let 최대상대깎임 = 0;
  let 최악 = null;
  let 남은돈최대 = 0;
  let 남은최악 = null;
  지갑들.forEach((지갑) => {
    const 원본 = boot({ balance: 지갑, 감싸기: false });
    원본.tick(60000);
    const env = boot({ balance: 지갑 });
    env.tick(60000);
    const taker = env.T.getSnapshot().feeRate.taker;
    배율들.forEach((배율) => {
      원본.T.setLeverage(배율);
      env.T.setLeverage(배율);
      const v = 원본.T.getMaxAffordableMargin();   // 감싸기 전 값
      const m = env.T.getMaxAffordableMargin();    // 감싸기 후 값
      const 상대 = (v - m) / v;
      if (상대 > 최대상대깎임) { 최대상대깎임 = 상대; 최악 = 지갑 + " · " + 배율 + "배"; }
      /* 회원 지갑에서 실제로 ★안 쓰인 돈★ */
      const 남은돈 = 지갑 - (m + m * 배율 * taker);
      if (남은돈 > 남은돈최대) { 남은돈최대 = 남은돈; 남은최악 = 지갑 + " · " + 배율 + "배"; }
    });
  });

  console.log("      ℹ 최대 상대 깎임 " + 최대상대깎임.toExponential(3) + " (" + 최악 + ")");
  console.log("      ℹ 지갑에 남는 최대 금액 " + 남은돈최대.toExponential(3) + " USDT (" + 남은최악 + ")");

  /* 소수 마지막 자리 몇 칸이면 상대오차 1e-14 안쪽입니다(2^-52 ≈ 2.2e-16).
     0.999 를 곱하면 1e-3 이라 ★1경 배★ 차이로 여기서 터집니다. */
  ok("⭐ 깎이는 양이 상대오차 1e-14 안쪽이다 (소수 마지막 자리 수준)",
    최대상대깎임 < 1e-14,
    최대상대깎임.toExponential(6) + " (" + 최악 + ")" +
      "  ← 임의 여유값(0.999 같은 것)을 곱하면 여기서 터집니다");

  /* ⭐ 회원 돈을 남기지 않는다 — 화면 표시 단위(0.01 USDT)보다 훨씬 작아야 합니다. */
  ok("⭐ 회원 지갑에 남는 돈이 0.000001 USDT 도 안 된다 (화면 0.01 자리에서 안 보임)",
    남은돈최대 < 1e-6,
    남은돈최대 + " USDT (" + 남은최악 + ") 가 안 들어갑니다");

  /* 소스로도 확인 — "임의 여유값" 을 넣기 제일 쉬운 형태들을 막습니다.
     ⚠️ 주석은 걷어냅니다. 주석에 0.999 를 설명으로 적는 것은 자유입니다. */
  const src = read("js/max-margin-safe.js")
    .replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), " ")
    .replace(new RegExp("^\\s*//.*$", "gm"), " ");
  const 여유값 = src.match(/[*]\s*0\.9\d*|0\.9\d*\s*[*]/g) || [];
  ok("코드에 0.9xx 같은 임의 여유값 곱하기가 없다", 여유값.length === 0, 여유값.join(", "));
  ok("깎는 단위를 Number.EPSILON 으로 잡는다 (사람이 고른 숫자가 아니다)",
    /Number\.EPSILON/.test(src),
    "EPSILON 이 사라졌습니다 — 누군가 깎는 양을 손으로 정했을 수 있습니다");
  ok("엔진 부등호를 그대로 다시 쓴다 (margin + notional × taker > balance)",
    /margin \* leverage/.test(src) && /notional \* taker/.test(src) && />\s*balance/.test(src),
    "엔진과 다른 식으로 검사하면 이 파일이 존재하는 이유가 없어집니다");
  ok("무한 반복을 막는 상한이 있다", /최대시도/.test(src) && /for \(var i = 0; i < 최대시도/.test(src));

  /* 한자리내림 자체의 성질 — 반드시 ★내려가고★, 한 칸만 움직입니다. */
  const env = boot({ balance: 100000 });
  const 내림 = env.MMS.한자리내림;
  [1, 1000, 98986.53, 1e9].forEach((x) => {
    const y = 내림(x);
    ok("한자리내림(" + x + ") 이 원래보다 작다", y < x, String(y));
    ok("한자리내림(" + x + ") 이 상대오차 1e-14 안쪽으로만 내려간다", (x - y) / x < 1e-14,
      ((x - y) / x).toExponential(3));
  });
  ok("한자리내림(0) 은 0 이다 (음수로 안 내려간다)", 내림(0) === 0, String(내림(0)));
  ok("한자리내림(음수) 도 0 이다", 내림(-5) === 0, String(내림(-5)));
}

/* ========================================================================
 * [3] 수수료율을 지어내지 않는다
 * ------------------------------------------------------------------------
 * 요율을 여기 적어두면 요율이 바뀌는 날 조용히 어긋납니다([가] 건이 그랬습니다).
 * ★엔진 함수를 바꿔치기해서 실제로 따라오는지★ 봅니다 — 글자 검사로는 부족합니다.
 * ====================================================================== */
section("[3] 수수료율을 엔진에서 받는다");
{
  /* ⚠️ 무대를 아무 데나 잡으면 안 됩니다 — ★실제로 깎이는 조합★ 이어야
     "요율을 따라간다" 를 잴 수 있습니다. 안 깎이는 조합(예: 지갑 100,000 · 50배)
     에서는 요율을 어떻게 넣어도 값이 그대로라 ★아무것도 안 재게 됩니다.★
     2026-09-01 실측 — 지갑 130,000 · 50배에서 2.910e-11 만큼 깎입니다.

     ⚠️ 요율을 10배로 부풀리는 방식도 안 됩니다. 22% 나 초과하면 소수 마지막
        자리를 32번 내려도 못 맞춰서 ★원래 값을 그대로 돌려주는 되돌림 경로★ 로
        빠집니다([5] 가 지키는 그 동작입니다). 그래서 ★요율 0★ 과 비교합니다. */
  const env = boot({ balance: 130000 });
  env.tick(60000);
  env.T.setLeverage(50);
  const snap = env.T.getSnapshot();
  ok("엔진 스냅샷이 feeRate.taker 를 준다", typeof snap.feeRate.taker === "number",
    JSON.stringify(snap.feeRate));

  const 원래값 = 130000 / (1 + 50 * snap.feeRate.taker);
  const 진짜요율 = env.MMS.안전값(원래값, snap);
  const 요율0 = env.MMS.안전값(원래값, { balance: 130000, leverage: 50, feeRate: { taker: 0 } });
  ok("무대가 실제로 깎이는 조합이다 (안 깎이면 아래 검사가 아무것도 안 잽니다)",
    진짜요율 < 원래값, 진짜요율 + " vs " + 원래값);
  ok("⭐ 요율을 0 으로 주면 깎지 않는다 (수수료를 지어내지 않고 받은 값을 쓴다)",
    요율0 === 원래값, 요율0 + " vs " + 원래값);
  ok("⭐ 진짜 요율일 때만 깎인다 (요율에 따라 답이 달라진다)",
    진짜요율 < 요율0, 진짜요율 + " vs " + 요율0);

  /* 요율을 못 읽으면 ★원래 값 그대로★ — 지어낸 값으로 계산하지 않습니다. */
  const v = 12345.6789;
  ok("feeRate 가 없으면 원래 값을 그대로 돌려준다",
    env.MMS.안전값(v, { balance: 100000, leverage: 10 }) === v);
  ok("feeRate.taker 가 숫자가 아니면 원래 값을 그대로 돌려준다",
    env.MMS.안전값(v, { balance: 100000, leverage: 10, feeRate: { taker: "0.0005" } }) === v);

  const src = read("js/max-margin-safe.js");
  ok("소스가 getSnapshot().feeRate.taker 를 읽는다",
    /feeRate\s*&&\s*isFinite\(snap\.feeRate\.taker\)/.test(src) && /getSnapshot\(\)/.test(src));
  ok("소스에 수수료율 숫자를 적어두지 않았다 (0.0005 · 0.0002)",
    !/0\.0005|0\.0002/.test(src.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), " ")),
    "요율이 바뀌는 날 조용히 어긋납니다");
}

/* ========================================================================
 * [4] ★진입 검사(부등호)는 안 건드린다★
 * ------------------------------------------------------------------------
 * ⚠️ 그쪽을 느슨하게 하면 ★잔고보다 많이 넣을 수 있게★ 됩니다. 반대 방향입니다.
 *    이 파일이 하는 일은 "넣는 값을 조금 낮추는 것" 뿐이어야 합니다.
 * ====================================================================== */
section("[4] 진입 검사는 안 건드린다 · 값은 언제나 원래 이하");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/trading.js 가 결재기록에 적힌 그 판이다 (부등호를 손대지 않았다)",
    md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));

  const src = read("js/max-margin-safe.js");
  ok("openPosition·placeLimitOrder 를 감싸지 않는다 (감싸는 것은 최대 버튼 하나뿐)",
    !/openPosition\s*=/.test(src) && !/placeLimitOrder\s*=/.test(src));
  ok("감싸는 대상이 getMaxAffordableMargin 하나다",
    (src.match(/App\.Trading\.[A-Za-z]+\s*=/g) || []).join(",") ===
      "App.Trading.getMaxAffordableMargin =",
    (src.match(/App\.Trading\.[A-Za-z]+\s*=/g) || []).join(","));

  /* 값이 ★커지는★ 경우가 하나도 없어야 합니다 */
  let 커진것 = [];
  지갑들.forEach((지갑) => {
    const 원본 = boot({ balance: 지갑, 감싸기: false });
    const env = boot({ balance: 지갑 });
    원본.tick(60000); env.tick(60000);
    배율들.forEach((배율) => {
      원본.T.setLeverage(배율); env.T.setLeverage(배율);
      if (env.T.getMaxAffordableMargin() > 원본.T.getMaxAffordableMargin()) {
        커진것.push(지갑 + " · " + 배율 + "배");
      }
    });
  });
  ok("⭐ 돌려주는 값이 언제나 원래 값 이하다 (커지는 경우가 없다)",
    커진것.length === 0, 커진것.join(", "));

  /* 잔고보다 많이 넣으려는 주문은 ★여전히 거절★ 되어야 합니다 */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(10);
  const r = env.T.openPosition("long", 100001);
  ok("잔고보다 큰 증거금은 여전히 거절된다", r.ok === false, JSON.stringify(r));
  ok("그 거절 사유는 '가용 자산' 쪽이다", String(r.error).indexOf("가용 자산") >= 0, r.error);
  const r2 = env.T.openPosition("long", env.T.getMaxAffordableMargin() * 1.0000001);
  ok("최대치를 아주 조금만 넘겨도 거절된다 (부등호가 느슨해지지 않았다)",
    r2.ok === false, JSON.stringify(r2));
}

/* ========================================================================
 * [5] 못 읽으면 원래 값 그대로 (되돌림 경로)
 * ====================================================================== */
section("[5] 못 읽으면 막지 않는다");
{
  const env = boot({ balance: 100000 });
  const v = 4321.1234;
  ok("스냅샷이 없으면 원래 값", env.MMS.안전값(v, null) === v);
  ok("잔고가 숫자가 아니면 원래 값", env.MMS.안전값(v, { balance: "x", feeRate: { taker: 0.0005 } }) === v);
  ok("원래 값이 0 이면 그대로 0", env.MMS.안전값(0, { balance: 100, feeRate: { taker: 0.0005 } }) === 0);
  ok("원래 값이 숫자가 아니면 그대로", env.MMS.안전값("abc", { balance: 100, feeRate: { taker: 0.0005 } }) === "abc");
  ok("배율이 없으면 1배로 보고 계산한다 (막지 않는다)",
    typeof env.MMS.안전값(100, { balance: 1000, feeRate: { taker: 0.0005 } }) === "number");

  /* 감싸기 자체가 두 번 걸리지 않아야 합니다 (두 번 감싸면 두 번 깎입니다) */
  const 한번 = env.T.getMaxAffordableMargin();
  env.MMS.init();
  env.MMS.init();
  ok("init 을 여러 번 불러도 두 번 감싸지 않는다", env.T.getMaxAffordableMargin() === 한번,
    env.T.getMaxAffordableMargin() + " vs " + 한번);

  /* 모듈이 아예 없어도 사이트는 예전처럼 돌아야 합니다 */
  const 없이 = boot({ balance: 100000, 감싸기: false });
  없이.tick(60000);
  없이.T.setLeverage(10);
  ok("모듈이 없어도 최대 버튼 값이 나온다 (되돌리기 경로)",
    없이.T.getMaxAffordableMargin() > 0, String(없이.T.getMaxAffordableMargin()));
}

/* ========================================================================
 * [6] 감싸는 시점 — js/trading.js ★뒤★ 여야 한다
 * ------------------------------------------------------------------------
 * 먼저 실리면 App.Trading 이 아직 없어서 ★조용히 아무 일도 안 합니다.★
 * 오류가 안 나기 때문에 알아채기가 가장 어렵습니다.
 * ====================================================================== */
section("[6] 감싸는 시점");
{
  const html = read("index.html");
  const tr = html.indexOf('src="js/trading.js"');
  const ms = html.indexOf('src="js/max-margin-safe.js"');
  ok("index.html 이 js/max-margin-safe.js 를 부른다", ms !== -1,
    "안 부르면 라이브에서 회원만 옛 동작을 겪습니다");
  ok("⭐ index.html 이 엔진보다 ★뒤에★ 부른다", ms > tr, "max-margin-safe " + ms + " / trading " + tr);

  /* 테스트 무대에서도 같은 순서여야 합니다 — 목록 한 곳에 등록돼 있는지 */
  ok("tests/_engine-modules.js 의 엔진뒤 목록에 등록돼 있다",
    엔진뒤.some((m) => m.경로 === "js/max-margin-safe.js"),
    엔진뒤.map((m) => m.경로).join(", ") +
      "\n         → 등록 안 하면 새 테스트가 이 모듈을 빼먹어도 아무도 못 잡습니다.");
  ok("등록에 이유가 적혀 있다",
    엔진뒤.every((m) => typeof m.이유 === "string" && m.이유.length > 20));

  /* ⭐ 순서를 뒤집으면 정말로 조용히 아무 일도 안 하는지 — 직접 해봅니다.
     "조용히" 를 말로만 적어두면 다음 사람이 안 믿습니다. */
  const store = {};
  const sandbox = {
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
  sandbox.window = sandbox;
  const L = {};
  sandbox.App = {
    Bus: { on(e, f) { (L[e] = L[e] || []).push(f); }, off() {}, emit(e, p) { (L[e] || []).forEach((f) => f(p)); } },
    Config: { getActiveSymbol: () => "BTCUSDT" },
  };
  /* 깎임이 ★실제로 일어나는★ 잔고를 심습니다 (130,000 · 50배에서 2.910e-11 깎임).*/
  store["btc_sim_v2_trading"] = JSON.stringify({
    version: 1, savedAt: Date.now(), state: { balance: 130000 },
  });
  vm.createContext(sandbox);
  vm.runInContext(read("js/storage.js"), sandbox, { filename: "js/storage.js" });
  vm.runInContext(read("js/risk-brackets.js"), sandbox, { filename: "js/risk-brackets.js" });
  let 터졌나 = false;
  try {
    /* ★일부러★ 엔진보다 먼저 태웁니다 */
    vm.runInContext(read("js/max-margin-safe.js"), sandbox, { filename: "js/max-margin-safe.js" });
  } catch (e) { 터졌나 = true; }
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
  sandbox.App.Trading.init();
  sandbox.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000 });
  sandbox.App.Trading.setLeverage(50);

  ok("먼저 태워도 오류는 안 난다 (그래서 알아채기 어렵습니다)", !터졌나);
  /* ⚠️ 비교는 ★실제로 깎이는 조합★ 에서 해야 합니다. 지갑 100,000 · 50배는
     원래 안 깎이는 자리라, 거기서 재면 "순서가 상관없다" 는 거짓 결론이 납니다.
     (처음에 그렇게 써서 실제로 빨강이 났습니다 — 2026-09-01) */
  const 뒤집힌값 = sandbox.App.Trading.getMaxAffordableMargin();
  const 제대로 = boot({ balance: 130000 });
  제대로.tick(60000);
  제대로.T.setLeverage(50);
  ok("⭐ 순서를 뒤집으면 감싸지지 않아 옛 값이 나온다 (조용한 고장)",
    뒤집힌값 !== 제대로.T.getMaxAffordableMargin(),
    "뒤집힌 " + 뒤집힌값 + " / 제대로 " + 제대로.T.getMaxAffordableMargin() +
      "\n         두 값이 같으면 순서가 상관없다는 뜻이라, [6] 을 다시 봐야 합니다.");
}

/* ========================================================================
 * [7] (나) 최대 버튼 → 배율 변경 → 주문 이 거절되지 않는다
 * ------------------------------------------------------------------------
 * ⭐ 여기만 ★진짜 화면(index.html + 주문 패널)★ 으로 잽니다.
 *    부등호만 맞춰놓고 화면 흐름이 깨져 있으면 회원은 그대로 막힙니다.
 *
 * PM 실측 (대표님 잔고 98,986.53)
 *   50배에서 최대 → 증거금 96,572 → 10배로 낮춤 → 증거금 482,861 → 거절
 *   수정 전 100 / 231 거절 → 수정 후 0 / 231
 *
 * ⚠️ 배율 변경은 MutationObserver + setTimeout 으로 처리됩니다(비동기).
 *    그래서 이 절만 async 로 돌리고, 끝난 뒤 결과를 합쳐 출력합니다.
 * ====================================================================== */
async function 절7() {
  section("[7] (나) 최대 버튼 → 배율 변경 → 주문");
  const { boot: harnessBoot } = require("./harness.js");
  const 다음틱 = () => new Promise((r) => setTimeout(r, 0));

  const 지갑목록 = [98986.53, 100000, 130000, 240000];
  const 배율쌍 = [[50, 10], [100, 10], [100, 25], [75, 25], [50, 25], [25, 100], [10, 100]];

  let 시도 = 0;
  const 실패 = [];
  let 지갑초과 = 0;
  let 옛고장재현 = 0;
  let 대표님실측 = null;

  for (const 지갑 of 지갑목록) {
    const env = harnessBoot({ balance: 지갑 });
    const doc = env.doc;
    const App = env.App;
    const 가격 = 60000;

    for (const [L1, L2] of 배율쌍) {
      /* 포지션이 남아 있으면 다음 주문이 "이미 보유 중" 으로 막힙니다 */
      if (App.Trading.getSnapshot().position) App.Trading.closePosition();
      App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 가격, time: Date.now() });

      /* ① 배율 L1 로 맞춥니다 (화면 표시 + 엔진 둘 다 — 회원이 창에서 확인을 누른 것) */
      App.Trading.setLeverage(L1);
      doc.getElementById("lev-display").textContent = String(L1);
      await 다음틱();

      /* ② 최대(100%) 버튼 */
      const chip = doc.querySelector('#qty-percent-row .chip[data-pct="100"]');
      chip.dispatchEvent(new env.win.Event("click", { bubbles: true }));
      await 다음틱();
      const qty1 = parseFloat(doc.getElementById("order-qty-input").value);
      const margin1 = (qty1 * 가격) / L1;

      /* ③ 배율을 L2 로 바꿉니다 — 여기가 (나) 의 핵심입니다 */
      App.Trading.setLeverage(L2);
      doc.getElementById("lev-display").textContent = String(L2);
      await 다음틱();
      await 다음틱();

      const qty2 = parseFloat(doc.getElementById("order-qty-input").value);
      const margin2 = (qty2 * 가격) / L2;

      /* ⚠️⚠️ 2026-09-01 — 처음에 "증거금이 커지면 안 된다" 로 썼다가 20건이
         빨강이 났습니다. ★그건 틀린 성질이었습니다.★
         배율이 낮아지면 수수료(명목 × 0.05%)가 줄어서 같은 지갑으로 넣을 수 있는
         증거금은 ★원래 조금 커집니다★ (50배 96,572 → 10배 98,494). 정상입니다.
         진짜 고장은 "커진다" 가 아니라 ★지갑을 넘어선다★ 였습니다 —
         수량을 그대로 두면 증거금 = 수량 × 가격 ÷ 배율 이 배율에 반비례해
         98,986 짜리 지갑에 482,861 이 들어갔습니다.
         그래서 재는 것을 ★지갑을 넘느냐★ 로 바꿉니다. */
      const 수수료2 = qty2 * 가격 * App.Trading.getSnapshot().feeRate.taker;
      if (margin2 + 수수료2 > 지갑 + 1e-9) 지갑초과++;

      /* 대조군 — ★수량을 다시 안 맞췄다면★ 증거금이 얼마였을지.
         그 값이 지갑을 넘는 조합이 실제로 있어야 이 절이 뭔가를 재는 것입니다. */
      const 안맞췄다면 = (qty1 * 가격) / L2;
      if (안맞췄다면 > 지갑) {
        옛고장재현++;
        if (지갑 === 98986.53 && L1 === 50 && L2 === 10) {
          대표님실측 = { 옛증거금: 안맞췄다면, 새증거금: margin2, 지갑: 지갑, margin1: margin1 };
        }
      }

      /* ④ 그 상태로 주문 */
      시도++;
      const r = App.Trading.openPosition("long", margin2);
      if (r.ok === false) {
        실패.push(지갑 + " · " + L1 + "→" + L2 + "배: " + r.error);
      }
    }
  }

  console.log("      ℹ " + 시도 + "가지 조합을 실제 화면으로 눌러봤습니다");
  ok("조합을 실제로 눌러봤다 (0 이면 아무것도 안 잰 것)", 시도 === 지갑목록.length * 배율쌍.length,
    시도 + " / " + 지갑목록.length * 배율쌍.length);
  ok("⭐⭐ 최대 버튼 뒤 배율을 바꿔도 주문이 거절되지 않는다 (PM 실측: 수정 전 100 / 231)",
    실패.length === 0, 실패.length + "건 거절\n         " + 실패.join("\n         "));
  ok("⭐⭐ 배율을 바꾼 뒤 증거금 + 수수료가 지갑을 넘지 않는다",
    지갑초과 === 0,
    지갑초과 + "건에서 지갑을 넘었습니다 — 배율을 1/5 로 낮추면 증거금이 5배가 되던 " +
      "그 문제입니다(대표님 잔고 실측 96,572 → 482,861).");

  /* 대조군 — 고치기 전이었다면 실제로 지갑을 넘었을 조합이 있어야 합니다.
     0 이면 이 절이 ★아무 고장도 재현하지 못한 것★ 이라 통과에 뜻이 없습니다. */
  console.log("      ℹ 수량을 다시 안 맞췄다면 지갑을 넘었을 조합 " + 옛고장재현 + "건");
  ok("대조군 — 수량을 다시 안 맞췄다면 지갑을 넘었을 조합이 실제로 있다",
    옛고장재현 > 0,
    "0건 — 고장을 재현조차 못 했습니다. 이 절의 통과는 아무 뜻이 없습니다.");

  /* ⭐ PM 이 대표님 잔고로 잰 그 숫자를 그대로 못 박습니다.
     96,572 / 482,861 은 보고서에 적힌 값이고, 여기서 매번 다시 계산합니다. */
  ok("대표님 잔고 98,986.53 · 50→10배 조합을 실제로 재현했다", !!대표님실측,
    "그 조합이 대조군에 안 잡혔습니다");
  if (대표님실측) {
    console.log("      ℹ 대표님 잔고 실측 — 50배 증거금 " + 대표님실측.margin1.toFixed(0) +
      " / 수량 그대로 10배면 " + 대표님실측.옛증거금.toFixed(0) +
      " / 지금 " + 대표님실측.새증거금.toFixed(0) + " (지갑 " + 대표님실측.지갑 + ")");
    ok("50배 최대 버튼 증거금이 96,572 (PM 실측과 같다)",
      Math.abs(대표님실측.margin1 - 96572) < 1, 대표님실측.margin1.toFixed(2));
    ok("수량을 안 맞췄다면 증거금이 482,861 이었다 (PM 실측과 같다)",
      Math.abs(대표님실측.옛증거금 - 482861) < 1, 대표님실측.옛증거금.toFixed(2));
    ok("⭐ 지금은 증거금이 지갑 이하다 (482,861 → " + 대표님실측.새증거금.toFixed(0) + ")",
      대표님실측.새증거금 <= 대표님실측.지갑, 대표님실측.새증거금.toFixed(2));
  }

  /* 수량을 다시 맞추는 자리가 ★한 곳★ 인지 — 두 곳에서 따로 계산하면 또 어긋납니다 */
  const src = read("js/qty-price-order.js");
  ok("배율이 바뀌면 수량 칸을 만졌을 때와 ★같은 함수★ 로 다시 맞춘다",
    /function onLeverageChanged\(\) \{[\s\S]{0,120}clampQtyToBracket\(\);/.test(src),
    "배율 변경 경로가 따로 계산하면 (가) 때와 같은 어긋남이 다시 납니다");
  ok("최대 버튼도 지갑 상한과 구간 상한 중 ★작은 쪽★ 을 쓴다",
    /Math\.min\(지갑수량, 구간수량\)/.test(src));
}

절7()
  .catch((e) => { fail++; console.log("  " + MARK_NG + " [7] 이 예외로 끝났습니다 — " + e.message); })
  .then(() => {
    console.log("\n==========================================================");
    console.log("통과 " + pass + " / 실패 " + fail);
    if (fail === 0) console.log("전체 통과 ✅");
    else { console.log("실패 있음 ❌"); process.exit(1); }
    /* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
    process.exit(0);
  });
