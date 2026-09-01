/* tests/risk-brackets-tiered-mmr.test.js
 * =========================================================================
 * [A] 유지증거금을 바이낸스 "명목 구간별" 로 — 재발 방지 (2026-08-31)
 * =========================================================================
 * 대표 결재 — "바이낸스 거래 시스템을 따라해".
 *
 * 이 파일이 지키는 것
 *   1) 구간표(js/risk-brackets.js)가 바이낸스 2026-08-31 값 그대로인가
 *   2) 유지증거금 = 명목 × 구간MMR − 공제액   ← 공제액을 빼먹으면 여기서 터집니다
 *   3) js/trading.js 의 청산가가 그 구간값을 실제로 쓰는가
 *   4) 그 구간에서 쓸 수 없는 배율의 주문은 열리지 않는가
 *      ⚠️ 2026-08-31 [B건] 로 ★기준이 바뀌었습니다★ — 아래 참조
 *   5) 구간표가 없으면 예전 고정값(0.5%)으로 안전하게 되돌아가는가
 *
 * ── ⚠️ 2026-08-31 갱신 [B건] — 거부 기준이 바뀌었습니다 ────────────────
 *   같은 결재의 다음 건입니다.
 *       대표 "바이낸스 거래 시스템을 따라해 그것만 허용"
 *   [A건] 이 넣었던 "유지증거금 ≥ 증거금이면 거부" 가
 *   [B건] 의 "명목 구간의 최대 배율을 넘으면 거부" 로 ★대체★ 됐습니다.
 *
 *   ★약해진 게 아닙니다.★ 새 검사가 옛 검사를 완전히 포함합니다 —
 *   수리팀이 명목 1,000 ~ 20억을 훑어 (개시증거금률 − 실효 유지증거금률) 의
 *   최솟값이 ★+0.4000%★ 임을 보였습니다. 0 이하가 하나도 없으므로
 *   "구간 상한은 통과했는데 진입 즉시 청산" 인 주문은 존재하지 않습니다.
 *   그 포함 관계 자체는 tests/bracket-max-leverage-seal.test.js ⑥ 이
 *   ★매번 다시 계산해서★ 지킵니다(구간표가 바뀌면 거기서 터집니다).
 *
 *   그래서 3·4절의 무대도 바뀝니다 —
 *     3절: 4구간을 100배로 열던 것을 ★50배★ 로 (4구간 최대 배율이 50입니다)
 *     4절: 거부 사유를 "유지증거금" 이 아니라 ★"구간 최대배율"★ 로 확인
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
 * 무대 — 거래엔진 + 구간표를 진짜로 띄웁니다
 * withBrackets:false 로 주면 구간표를 뺀 옛 환경이 됩니다
 * ---------------------------------------------------------------------- */
function makeSandbox(store) {
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0,
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
  return sandbox;
}

function boot(opts) {
  opts = opts || {};
  const store = {};
  if (opts.balance !== undefined) {
    store["btc_sim_v2_trading"] = JSON.stringify({
      version: 1, savedAt: Date.now(), state: { balance: opts.balance },
    });
  }
  if (opts.saved) store["btc_sim_v2_trading"] = JSON.stringify(opts.saved);

  const sandbox = makeSandbox(store);
  vm.createContext(sandbox);
  vm.runInContext(read("js/storage.js"), sandbox, { filename: "js/storage.js" });
  if (opts.withBrackets !== false) {
    vm.runInContext(read("js/risk-brackets.js"), sandbox, { filename: "js/risk-brackets.js" });
  }
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
  sandbox.App.Trading.init();

  const tick = (price) => sandbox.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  return { S: sandbox, T: sandbox.App.Trading, RB: sandbox.App.RiskBrackets, tick };
}

/* ========================================================================
 * 1. 구간표가 바이낸스 값 그대로인가
 *    출처 2026-08-31 06:12 UTC — bapi .../common/brackets + 화면 leverage-margin
 * ====================================================================== */
section("1. BTCUSDT 구간표 (바이낸스 2026-08-31)");
{
  const RB = boot().RB;
  ok("App.RiskBrackets 가 있다", !!RB);

  // [명목상한, 최대배율, MMR, 공제액]
  const EXPECT = [
    [300000, 150, 0.004, 0],
    [800000, 100, 0.005, 300],
    [3000000, 75, 0.0065, 1500],
    [12000000, 50, 0.01, 12000],
    [70000000, 25, 0.02, 132000],
    [100000000, 20, 0.025, 482000],
    [230000000, 10, 0.05, 2982000],
    [480000000, 5, 0.1, 14482000],
    [600000000, 4, 0.125, 26482000],
    [800000000, 3, 0.15, 41482000],
    [1200000000, 2, 0.25, 121482000],
    [1800000000, 1, 0.5, 421482000],
  ];
  const table = RB.tableFor("BTCUSDT");
  ok("구간이 12개다", table.length === 12, String(table.length));
  let 같음 = true;
  const 다른곳 = [];
  EXPECT.forEach((e, i) => {
    const b = table[i] || {};
    if (b.maxNotional !== e[0] || b.maxLeverage !== e[1] || b.mmr !== e[2] || b.cum !== e[3]) {
      같음 = false;
      다른곳.push("tier" + (i + 1));
    }
  });
  ok("12개 구간 값이 바이낸스와 같다", 같음, 다른곳.join(","));

  // 구간 경계 — 상한값은 그 구간에 포함됩니다
  ok("300,000 은 1구간", RB.bracketFor(300000).tier === 1, String(RB.bracketFor(300000).tier));
  ok("300,001 은 2구간", RB.bracketFor(300001).tier === 2, String(RB.bracketFor(300001).tier));
  ok("9,524,029 은 4구간", RB.bracketFor(9524029).tier === 4, String(RB.bracketFor(9524029).tier));
  ok("표를 넘는 값은 마지막 구간(가장 보수적)", RB.bracketFor(9e12).tier === 12);
  ok("이상한 값(음수·NaN)은 1구간", RB.bracketFor(-5).tier === 1 && RB.bracketFor(NaN).tier === 1);

  // 전 종목이 같은 표를 씁니다 (바이낸스에 없는 종목이라 가져올 표가 없음)
  ok("모르는 종목도 같은 표를 쓴다", RB.tableFor("005930") === RB.tableFor("BTCUSDT"));
}

/* ========================================================================
 * 2. 유지증거금 = 명목 × MMR − 공제액   ← 공제액이 핵심
 * ====================================================================== */
section("2. 유지증거금 계산 (공제액 포함)");
{
  const RB = boot().RB;

  // 대표님 포지션 — 수량 122.099494 · 진입 117,000,600원 · 환율 1500
  const 명목 = 9524029;
  const mm = RB.maintenanceMargin(명목);
  ok("대표님 포지션 유지증거금 = 83,240.29 USDT",
    Math.abs(mm - 83240.29) < 0.01, mm.toFixed(2));
  ok("원화로 약 1억 2,486만원",
    Math.abs(mm * 1500 - 124860435) < 1000, String(Math.round(mm * 1500)));

  // 공제액을 빼먹으면 95,240.29 가 나옵니다 — 12,000 만큼 과합니다
  ok("공제액을 빼먹은 값(95,240.29)이 아니다", Math.abs(mm - 명목 * 0.01) > 11999);

  // 구간이 바뀌어도 유지증거금이 뚝 끊기면 안 됩니다(바이낸스가 공제액을 두는 이유)
  const 아래 = RB.maintenanceMargin(3000000);
  const 위 = RB.maintenanceMargin(3000000.01);
  ok("구간이 바뀌어도 유지증거금이 튀지 않는다 (3,000,000 경계)",
    Math.abs(위 - 아래) < 1, 아래.toFixed(2) + " -> " + 위.toFixed(2));

  ok("1구간은 공제액 0 이라 명목 × 0.4% 그대로",
    Math.abs(RB.maintenanceMargin(100000) - 400) < 1e-9, String(RB.maintenanceMargin(100000)));
  ok("명목 0 이면 유지증거금도 0", RB.maintenanceMargin(0) === 0);
  ok("유지증거금은 음수가 되지 않는다", RB.maintenanceMargin(1) >= 0);

  // 실효 유지증거금률 = 유지증거금 / 명목 (청산가 식에 그대로 들어가는 값)
  ok("실효 유지증거금률 = 유지증거금 ÷ 명목",
    Math.abs(RB.effectiveRate(명목) - mm / 명목) < 1e-12);
}

/* ========================================================================
 * 3. 거래 엔진이 그 값을 실제로 쓰는가
 * ====================================================================== */
section("3. 청산가에 구간값이 반영된다");
{
  /* ⚠️ 2026-08-31 [B건] — 100배 → ★50배★.
     지갑 100,000 을 100배로 다 쓰면 명목 9,523,810 이라 4구간(최대 50배)이고,
     이제 ★진입 자체가 거절★ 됩니다. 50배로 열어도 명목 4,878,049 라
     ★여전히 4구간★ 이므로 "4구간 값으로 계산되는가" 라는 원래 목적은 그대로입니다.
     (배율만 내렸지 재는 것은 안 바꿨습니다) */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(50);
  const margin = env.T.getMaxAffordableMargin();     // 97,560.9756
  const r열기 = env.T.openPosition("long", margin);
  const pos = env.T.getSnapshot().position;
  ok("포지션이 열린다", !!pos, (r열기 && r열기.error) || "");

  // 명목 4,878,048.78 → 4구간(MMR 1%, 공제 12,000)
  const 명목 = margin * 50;
  ok("명목이 여전히 4구간이다 (3,000,000 초과 12,000,000 이하)",
    명목 > 3000000 && 명목 <= 12000000, 명목.toFixed(2));
  const rate = env.RB.effectiveRate(명목);
  const 기대 = 60000 * (1 - 1 / 50 + rate);
  ok("50배 롱 청산가가 4구간 값으로 계산된다",
    !!pos && Math.abs(pos.liq - 기대) < 1e-6,
    pos ? pos.liq.toFixed(4) + " / 기대 " + 기대.toFixed(4) : "-");
  ok("예전 고정값(0.5%)의 59,700 이 아니다", !!pos && Math.abs(pos.liq - 59700) > 100,
    pos ? pos.liq.toFixed(2) : "-");

  /* 버팀폭 이력 — 0.500%(고정) → 0.126%(A건·100배) → ★1.246%★(B건·50배).
     넓어진 이유는 유지증거금이 느슨해져서가 아니라 ★배율이 내려갔기 때문★ 입니다.
     그 금액에서 100배를 못 거는 것이지, 위험이 줄어든 게 아닙니다. */
  const 버팀폭 = ((60000 - pos.liq) / 60000) * 100;
  ok("버팀폭 약 1.246% (①0.500% · ②0.126% 가 아니다)",
    Math.abs(버팀폭 - 1.246) < 0.005, 버팀폭.toFixed(4) + "%");
  ok("버팀폭은 반드시 0보다 크다 (진입 즉시 청산 금지)", 버팀폭 > 0, 버팀폭.toFixed(6));

  // 숏도 대칭이어야 합니다
  const e2 = boot({ balance: 100000 });
  e2.tick(60000);
  e2.T.setLeverage(50);
  const m2 = e2.T.getMaxAffordableMargin();
  e2.T.openPosition("short", m2);
  const p2 = e2.T.getSnapshot().position;
  ok("숏 청산가는 진입가 위쪽으로 같은 폭",
    !!p2 && Math.abs((p2.liq - 60000) - (60000 - pos.liq)) < 1e-6, p2 ? p2.liq.toFixed(4) : "-");

  // 작은 포지션은 1구간(0.4%) — 예전 0.5% 보다 오히려 버팀폭이 넓어집니다
  const e3 = boot({ balance: 100000 });
  e3.tick(60000);
  e3.T.setLeverage(10);
  e3.T.openPosition("long", 5000);          // 명목 50,000 = 1구간
  const p3 = e3.T.getSnapshot().position;
  ok("소액(1구간)은 MMR 0.4% 로 계산된다",
    !!p3 && Math.abs(p3.liq - 60000 * (1 - 0.1 + 0.004)) < 1e-6, p3 ? p3.liq.toFixed(4) : "-");
}

/* ========================================================================
 * 4. 그 구간에서 쓸 수 없는 배율의 주문은 열리면 안 됩니다
 * ------------------------------------------------------------------------
 * ⚠️ 2026-08-31 [B건] — 이 절은 통째로 기준이 바뀌었습니다.
 *
 *   예전(A건) — "유지증거금 ≥ 증거금이면 거부"
 *   지금(B건) — "명목 구간의 최대 배율을 넘으면 거부"
 *
 *   왜 대체해도 되나 — 새 검사가 옛 검사를 ★완전히 포함★ 하기 때문입니다.
 *   구간 상한을 지킨 주문은 어떤 명목에서도 (개시증거금률 − 실효 유지증거금률)
 *   이 최소 +0.4000% 라서, "진입하자마자 청산" 이 애초에 나올 수 없습니다.
 *   그 증명은 tests/bracket-max-leverage-seal.test.js ⑥ 이 매번 다시 계산합니다.
 *   ⚠️ 구간표를 고치면 그 포함 관계가 깨질 수 있습니다. 그때 거기서 터집니다.
 * ====================================================================== */
section("4. 구간 최대배율을 넘는 주문은 거부한다 (2026-08-31 B건)");
{
  // 5구간(명목 70,000,000)은 최대 25배입니다. 100배로 넣으면 거부돼야 합니다.
  const env = boot({ balance: 2000000 });
  env.tick(60000);
  env.T.setLeverage(100);
  const margin = 700000;
  const 명목 = margin * 100;
  ok("이 조합의 명목은 5구간이다 (70,000,000)", 명목 === 70000000, String(명목));
  ok("5구간의 최대 배율은 25배다", env.RB.maxLeverage(명목) === 25, String(env.RB.maxLeverage(명목)));
  /* 옛 기준으로도 막혔던 주문입니다 — 대체가 ★더 넓게★ 막는다는 증거 하나입니다. */
  ok("이 조합은 옛 기준(유지증거금 ≥ 증거금)으로도 막혔었다",
    env.RB.maintenanceMargin(명목) > margin,
    env.RB.maintenanceMargin(명목).toFixed(0) + " > " + margin);

  const r = env.T.openPosition("long", margin);
  ok("시장가 주문이 거부된다", r.ok === false, JSON.stringify(r));
  /* ⚠️ 예전 검사는 사유에 '유지증거금' 이 들어 있는지 봤습니다.
     거부 ★이유 자체★ 가 바뀌었으니 검사도 새 이유로 바꿉니다.
     지키는 것은 그대로 — ★회원이 읽고 무엇을 고쳐야 할지 알 수 있는가★ 입니다. */
  ok("왜 거부됐는지 회원에게 알려준다 (배율 + 쓸 수 있는 값 25배)",
    !!r.error && r.error.indexOf("배율") >= 0 && r.error.indexOf("25배") >= 0, r.error);
  ok("거부 사유가 무엇을 하라고 알려준다", !!r.error && /낮추|줄여/.test(r.error), r.error);
  ok("거부됐으면 포지션도 안 생긴다", env.T.getSnapshot().position === null);
  ok("거부됐으면 잔고도 그대로", Math.abs(env.T.getSnapshot().balance - 2000000) < 1e-6,
    String(env.T.getSnapshot().balance));

  // 지정가도 같은 검사를 해야 합니다
  const e2 = boot({ balance: 2000000 });
  e2.tick(60000);
  e2.T.setLeverage(100);
  const r2 = e2.T.placeLimitOrder("long", 59000, margin);
  ok("지정가 주문도 거부된다", r2.ok === false, JSON.stringify(r2));
  ok("지정가 거부 사유도 같은 말을 한다", !!r2.error && r2.error.indexOf("25배") >= 0, r2.error);
  ok("지정가도 미체결 주문이 안 남는다", e2.T.getSnapshot().pendingOrder === null);

  /* ⭐ 안내대로 배율을 낮추면 같은 주문이 열려야 합니다.
     안 열리면 회원은 시킨 대로 했는데도 막힌 셈이라 그게 더 나쁜 고장입니다. */
  const e2b = boot({ balance: 2000000 });
  e2b.tick(60000);
  e2b.T.setLeverage(25);
  const r2b = e2b.T.openPosition("long", margin);
  ok("안내대로 25배로 낮추면 같은 주문이 열린다", r2b.ok !== false, r2b.error || "");

  // 정상 범위는 그대로 열려야 합니다 (과잉 차단 금지)
  const e3 = boot({ balance: 100000 });
  e3.tick(60000);
  e3.T.setLeverage(50);
  const r3 = e3.T.openPosition("long", e3.T.getMaxAffordableMargin());
  ok("정상 주문(최대 버튼 + 그 구간 최대배율 50배)은 그대로 열린다", r3.ok === true, r3.error || "");

  /* 작은 주문에서는 100배가 ★여전히 됩니다★ — 전면 금지가 아니라 구간별입니다.
     명목 800,000 이하(2구간)면 100배 그대로입니다. */
  const e4 = boot({ balance: 100000 });
  e4.tick(60000);
  e4.T.setLeverage(100);
  const r4 = e4.T.openPosition("long", 8000);   // 명목 800,000 = 2구간 상한
  ok("작은 주문(명목 800,000)은 100배가 그대로 된다", r4.ok !== false, r4.error || "");
}

/* ========================================================================
 * 5. 구간표가 없으면 예전 고정값으로 안전하게 되돌아간다
 *    (index.html 에서 script 한 줄을 지우면 이 상태가 됩니다)
 * ====================================================================== */
section("5. 구간표가 없을 때 (되돌리기 경로)");
{
  const env = boot({ balance: 100000, withBrackets: false });
  ok("구간표가 안 실렸다", !env.RB);
  env.tick(60000);
  env.T.setLeverage(100);
  env.T.openPosition("long", env.T.getMaxAffordableMargin());
  const pos = env.T.getSnapshot().position;
  ok("예전 고정값 0.5% 로 계산된다 (59,700)",
    !!pos && Math.abs(pos.liq - 59700) < 1e-6, pos ? pos.liq.toFixed(4) : "-");
  ok("표가 없어도 청산가는 유한한 값이다", !!pos && isFinite(pos.liq));
}

/* ========================================================================
 * 6. 저장 구조를 바꾸지 않았다 (기존 포지션이 깨지면 안 됩니다)
 * ====================================================================== */
section("6. 기존 포지션 보호");
{
  const src = read("js/trading.js");
  ok("포지션에 구간·공제액을 저장하지 않는다 (계산할 때 구합니다)",
    !/state\.position = \{[\s\S]{0,400}(tier|cum|bracket)/.test(src));

  // 예전에 저장된 포지션(구간 정보가 없는 옛 구조)이 그대로 살아나야 합니다
  const env = boot({
    saved: {
      version: 1, savedAt: Date.now(),
      state: {
        balance: 1000,
        position: {
          side: "long", entry: 60000, leverage: 100, margin: 95238.0952,
          qty: 158.7301, liq: 59700, tp: null, sl: null, entryFee: 4761.9048,
        },
      },
    },
  });
  const pos = env.T.getSnapshot().position;
  ok("예전 포지션이 그대로 살아난다", !!pos && pos.entry === 60000 && pos.qty === 158.7301);
  ok("예전 포지션의 청산가는 저장된 값 그대로 (소급해서 안 바꿉니다)",
    !!pos && pos.liq === 59700, pos ? String(pos.liq) : "-");
}

/* ========================================================================
 * 7. 배포 경로 — git 에 없으면 라이브에서 404 입니다
 * ====================================================================== */
section("7. 배포 경로");
{
  const html = read("index.html");
  ok("index.html 이 risk-brackets.js 를 부른다", /src="js\/risk-brackets\.js"/.test(html));
  ok("trading.js 보다 먼저 불린다",
    html.indexOf("js/risk-brackets.js") < html.indexOf('src="js/trading.js"'));

  const { execSync } = require("child_process");
  let tracked = "";
  try {
    tracked = execSync("git ls-files js/risk-brackets.js", { cwd: REPO }).toString().trim();
  } catch (e) { tracked = ""; }
  ok("js/risk-brackets.js 가 git 에 들어가 있다 (없으면 라이브에서 404)",
    tracked === "js/risk-brackets.js",
    tracked || "git 에 없음 — PM 이 커밋할 때 git add js/risk-brackets.js 필요");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
