/* tests/forced-liquidation-wipeout-seal.test.js
 * =========================================================================
 * "최대 버튼 + 100배 + 강제청산 = 지갑 전액" — 봉인 (2026-08-27)
 * =========================================================================
 *
 * ⚠ 이건 고장이 아닙니다. 지금 동작이 맞습니다.
 *   목적은 **바뀌는 것을 잡는 것**입니다. 회계가 조용히 달라지면 여기서 터집니다.
 *
 * 무슨 성질인가
 *   강제청산 1회의 실현손익 = -(margin + entryFee)
 *   최대 버튼으로 잡으면      margin + entryFee = 그때 지갑에 있던 돈 전액
 *   → 강제청산 한 번에 실현손익이 정확히 "지갑 전액"의 음수가 됩니다.
 *
 * 어디에서 나오나 (두 파일이 맞물립니다)
 *   js/trading.js:437-441  강제청산은 grossPnl = -closingMargin,
 *                          잔고를 되돌려주지 않고, fee 에는 진입수수료만 담습니다
 *   js/realized-pnl-fix.js:52  reason === "강제청산" 이면 fee 전체를
 *                          진입수수료로 보고 realizedPnl 에서 뺍니다
 *   js/trading.js:106-108  최대 버튼 = balance / (1 + leverage × taker)
 *
 * 감사팀이 -400,000 의 뿌리로 지목한 성질입니다.
 * 이 셋 중 하나만 바뀌어도 "지갑 전액" 이 깨집니다.
 *
 * 실측 (2026-08-27, 이 테스트가 실제로 계산한 값)
 *   지갑 100,000 → margin 95,238.0952 · fee 4,761.9048 → 실현손익 -100,000.00
 *   지갑 200,000 → margin 190,476.1905 · fee 9,523.8095 → 실현손익 -200,000.00
 *
 * ── ⚠️ 2026-08-31 갱신 — "0.5% 고정" 이 사라졌습니다 ────────────────────
 *   대표 결재로 js/trading.js 가 열렸습니다.
 *       대표 "ㅇㅇ 지금만 허용할테니까 바이낸스 시스템이랑 똑같이 따라해"
 *            "바이낸스 거래 시스템을 따라해 그것만 허용"
 *   [A건] 유지증거금이 ★명목 구간별★ 로 바뀌었습니다(js/risk-brackets.js).
 *   const MMR = 0.005 → const MMR_FALLBACK = 0.005 (표를 못 읽을 때만 쓰는 값).
 *
 *   ★이 봉인이 지키던 것은 "0.5%" 가 아닙니다.★
 *   지키던 것은 ─ 강제청산 한 번에 회원이 잃는 돈이 ★자기가 건 돈 딱 그만큼★
 *   이고 그 이상이 아니라는 회계 성질입니다. 0.5% 는 그 성질을 확인하려고
 *   같이 적어둔 ★그때의 숫자★ 였을 뿐입니다.
 *   그 회계 성질은 구간별로 바뀐 뒤에도 그대로입니다 — 아래에서 지갑 세 종류로
 *   다시 재서 확인했습니다. 숫자만 새 값으로 바꿉니다.
 *
 *   ── 2026-08-31 실측 (100배 · 최대 버튼 · 진입가 60,000) ──────────────
 *     지갑 100,000 → 명목  9,523,809.52 → 4구간(1%,공제 12,000)
 *                    유지증거금 83,238.10 · 청산가 59,924.40 · 버팀폭 0.126%
 *     지갑 130,000 → 명목 12,380,952.38 → 5구간(2%,공제 132,000)
 *                    유지증거금 115,619.05 · 청산가 59,960.31 · 버팀폭 0.066%
 *     지갑 138,000 → 명목 13,142,857.14 → 5구간 · 청산가 59,997.39
 *     ★지갑 138,600 부터는 아예 진입이 거절됩니다★ (아래 1-2 참조)
 *   예전에는 지갑이 얼마든 버팀폭이 0.5%(청산가 59,700) 로 똑같았습니다.
 *
 *   ── ⚠️ 이 봉인이 그동안 ★fallback 을 재고 있었습니다★ ────────────────
 *   여기 sandbox 는 js/risk-brackets.js 를 안 태웠습니다. 그래서 A건이
 *   들어온 뒤에도 이 파일만은 옛 고정값 경로(MMR_FALLBACK)를 재고 있었습니다.
 *   ★테스트는 초록인데 회원은 다르게 겪는★ 상태 — 우리가 P1 로 부르는
 *   조용한 고장입니다. 아래 boot() 에서 risk-brackets 를 같이 태워 고쳤습니다.
 *
 * ── ⚠️⚠️ 2026-08-31 갱신 [B건] — "100배 최대버튼" 이 ★이제 막히는 조합★ 입니다 ──
 *   같은 결재의 다음 건이 들어왔습니다.
 *       대표 "바이낸스 거래 시스템을 따라해 그것만 허용"
 *   [B건] 명목이 커지면 쓸 수 있는 최대 배율이 구간별로 내려갑니다
 *   (js/risk-brackets.js 의 maxLeverage). A건이 넣었던 "유지증거금 ≥ 증거금이면
 *   거부" 는 ★"구간 최대배율 초과면 거부" 로 대체★ 됐습니다.
 *
 *   그래서 이 파일이 쓰던 무대 — ★100배 + 최대 버튼★ — 이 통째로 거절됩니다.
 *   지갑 100,000 에서 최대 버튼은 명목 9,523,810 을 만드는데, 그 구간(4구간)의
 *   최대 배율은 50배라서 100배로는 아예 안 열립니다.
 *
 *   ★그런데 이 봉인이 지키던 것은 "100배" 가 아닙니다.★
 *   지키던 것은 ─ 강제청산 한 번에 회원이 잃는 돈이 ★자기가 건 돈 딱 그만큼★
 *   이고 그 이상이 아니라는 회계 성질입니다. 100배는 그 성질을 가장 극단에서
 *   확인하려고 골랐던 ★그때의 숫자★ 였을 뿐입니다.
 *
 *   ⭐ 그래서 배율만 ★50배★ 로 내려서 같은 성질을 다시 잽니다.
 *      50배는 4구간(명목 ≤ 12,000,000)의 최대 배율이라, "최대 버튼 + 그 구간에서
 *      쓸 수 있는 가장 높은 배율" 이라는 ★원래 의도 그대로★ 입니다.
 *      100배로 돌아가려고 이 숫자를 올리면 그 순간 진입이 거절되면서 터집니다.
 *
 *   ── 2026-08-31 실측 (50배 · 최대 버튼 · 진입가 60,000) ────────────────
 *     지갑  50,000 → 명목 2,439,024.39 → 3구간(0.65%, 공제 1,500)
 *                    유지증거금 14,353.6585 · 청산가 59,153.10 · 버팀폭 1.4115%
 *     지갑 100,000 → 명목 4,878,048.78 → 4구간(1%,    공제 12,000)
 *                    유지증거금 36,780.4878 · 청산가 59,252.40 · 버팀폭 1.246%
 *     지갑 200,000 → 명목 9,756,097.56 → 4구간 · 유지증거금 85,560.9756
 *     세 지갑 모두 실현손익이 정확히 -지갑 전액입니다.
 *
 *   ⚠️ B건 이후 회원은 ★예전보다 늦게★ 청산됩니다(버팀폭 0.126% → 1.246%).
 *      배율 자체가 100 → 50 으로 내려갔기 때문입니다. 이건 손해가 아니라
 *      "그 금액에서 100배를 애초에 못 건다" 는 뜻입니다.
 *
 * 네트워크를 쓰지 않습니다. 진짜 js/trading.js 와 js/realized-pnl-fix.js 를
 * 그대로 태우고, 시세만 손으로 밀어 넣어 청산가에 닿게 만듭니다.
 * (강제청산을 직접 부르지 않습니다 — 엔진이 스스로 발동시키게 둡니다)
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
 * 무대 — 거래엔진을 진짜로 띄웁니다 (계산은 하나도 흉내내지 않습니다)
 * ---------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const store = {};
  const sandbox = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0,
    clearInterval: () => {},
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

  /* 시작 잔고를 바꾸려면 저장소에 심어둡니다(엔진이 restoreFromStorage 로 읽습니다).
     엔진 안의 INITIAL_BALANCE 는 100,000 고정입니다. */
  if (opts.balance !== undefined) {
    store["btc_sim_v2_trading"] = JSON.stringify({
      version: 1, savedAt: Date.now(), state: { balance: opts.balance },
    });
  }

  const listeners = {};
  sandbox.App = {
    Bus: {
      on(e, f) { (listeners[e] = listeners[e] || []).push(f); return f; },
      off(e, f) { if (listeners[e]) listeners[e] = listeners[e].filter((x) => x !== f); },
      emit(e, p) { (listeners[e] || []).forEach((f) => f(p)); },
    },
    Config: { getActiveSymbol: () => "BTCUSDT" },
    /* App.Api 가 없으면 checkMissedFunding 이 그냥 되돌아갑니다(네트워크 0회). */
  };

  vm.createContext(sandbox);
  vm.runInContext(read("js/storage.js"), sandbox, { filename: "js/storage.js" });
  /* js/risk-brackets.js — 2026-08-31 대표 결재(바이낸스 구간별 유지증거금). index.html 은 risk-brackets → trading 순서라 여기도 같게 태웁니다. 안 태우면 이 테스트는 회원이 겪지 않는 옛 고정값(MMR_FALLBACK 0.5%) 경로를 재게 됩니다. */
  vm.runInContext(read("js/risk-brackets.js"), sandbox, { filename: "js/risk-brackets.js" });
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
  /* js/max-margin-safe.js — 2026-09-01. ★엔진을 감싸는 모듈이라 반드시 trading.js 뒤★ 입니다
     (index.html 도 1269행 trading → 1272행 max-margin-safe 순서).
     안 태우면 getMaxAffordableMargin 이 옛 값을 돌려줘, ★테스트는 거절을 보고
     회원은 통과를 겪습니다★ — 목록은 tests/_engine-modules.js 의 엔진뒤 에 있습니다. */
  vm.runInContext(read("js/max-margin-safe.js"), sandbox, { filename: "js/max-margin-safe.js" });
  vm.runInContext(read("js/realized-pnl-fix.js"), sandbox, { filename: "js/realized-pnl-fix.js" });

  sandbox.App.RealizedPnlFix.init();   // getSnapshot / Bus.emit 감싸기
  sandbox.App.Trading.init();

  const tick = (price) => sandbox.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price });
  return { S: sandbox, T: sandbox.App.Trading, tick };
}

const 반올림 = (v) => Math.round(v * 10000) / 10000;

/* ========================================================================
 * 1. 최대 버튼 + 100배 + 강제청산 = 지갑 전액
 * ====================================================================== */
section("1. 최대 버튼 + 100배 + 강제청산 = 지갑 전액");

/* 배율을 인자로 받습니다. 2026-08-31 [B건] 전에는 100 고정이었는데, 이제
   그 조합이 ★구간 최대배율 초과★ 로 거절됩니다(1-2 참조). 기본값 50 은
   4구간에서 쓸 수 있는 가장 높은 배율입니다 — 원래 의도(최대 버튼 + 최고 배율)
   가 그대로 유지됩니다. */
function 한판(시작지갑, 배율) {
  const env = boot({ balance: 시작지갑 });
  env.tick(60000);
  env.T.setLeverage(배율 || 50);

  const 지갑 = env.T.getSnapshot().balance;
  const margin = env.T.getMaxAffordableMargin();
  const r = env.T.openPosition("long", margin);
  const pos = env.T.getSnapshot().position;

  /* 최대 버튼 값으로 진입이 거절되면 그 자체가 고장입니다.
     (실제로 최대 버튼 식을 메이커율로 바꿔보면 여기서 거절됩니다 —
      증거금 + 진입수수료가 지갑보다 커집니다) */
  ok("최대 버튼 값으로 진입이 된다 (지갑 " + 시작지갑 + ")", !!pos,
    r && r.error ? r.error : "포지션이 안 생겼습니다");
  if (!pos) {
    return { env, 지갑, margin, entryFee: NaN, r, t: null, snap: env.T.getSnapshot(), 실패: true };
  }

  /* 청산가 아래로 한 번 밀어 넣으면 엔진이 스스로 강제청산합니다
     (js/trading.js:494 checkTriggers). 우리가 부르지 않습니다. */
  env.tick(pos.liq - 1);

  const snap = env.T.getSnapshot();
  const t = snap.closedTrades[0];
  return { env, 지갑, margin, entryFee: pos.entryFee, r, t, snap };
}

{
  const a = 한판(100000);
  ok("최대 버튼이 지갑을 다 쓴다 (증거금 + 진입수수료 = 지갑)",
    반올림(a.margin + a.entryFee) === 반올림(a.지갑),
    a.margin.toFixed(4) + " + " + a.entryFee.toFixed(4) + " = " + (a.margin + a.entryFee).toFixed(4) + " / 지갑 " + a.지갑);
  /* 2026-08-31 [B건] — 100배 → 50배. 최대 버튼 식은 balance / (1 + 배율 × 0.05%)
     이라 나누는 값이 1.05 에서 ★1.025★ 로 바뀝니다. 식은 그대로입니다. */
  ok("증거금 97,560.9756 (100,000 / 1.025)", Math.abs(a.margin - 97560.9756) < 0.001, a.margin.toFixed(4));
  ok("진입수수료 2,439.0244 (증거금 × 50 × 0.05%)", Math.abs(a.entryFee - 2439.0244) < 0.001, a.entryFee.toFixed(4));
  ok("진입 직후 지갑은 0", 반올림(a.env.T.getSnapshot().balance) === 0 || Math.abs(a.env.T.getSnapshot().balance) < 1e-6,
    String(a.env.T.getSnapshot().balance));

  ok("엔진이 스스로 강제청산했다", !!a.t && a.t.reason === "강제청산", a.t && a.t.reason);
  ok("강제청산은 증거금을 돌려주지 않는다 (지갑 0 그대로)",
    Math.abs(a.snap.balance) < 1e-6, String(a.snap.balance));
  ok("강제청산 거래의 fee 는 진입수수료뿐 (청산수수료 없음)",
    !!a.t && Math.abs(a.t.fee - a.entryFee) < 1e-6, a.t ? a.t.fee.toFixed(4) : "거래 없음");
  ok("강제청산 거래의 pnl 은 -증거금",
    !!a.t && Math.abs(a.t.pnl + a.margin) < 1e-6, a.t ? a.t.pnl.toFixed(4) : "거래 없음");

  /* ⭐ 이 한 줄이 이 파일의 목적입니다. */
  ok("⭐ 실현손익이 정확히 -100,000.00 (지갑 전액)",
    Math.abs(a.snap.realizedPnl + 100000) < 0.001, a.snap.realizedPnl.toFixed(4));
  ok("실현손익 = -(증거금 + 진입수수료)",
    Math.abs(a.snap.realizedPnl + (a.margin + a.entryFee)) < 1e-6, a.snap.realizedPnl.toFixed(4));
}
{
  /* ★다른 구간에서도 같은 성질이 사는지★ 를 봅니다. 이게 이 블록의 목적입니다.
     ── 이력 ──────────────────────────────────────────────────────────
       처음(2026-08-27)  지갑 200,000 · 100배
       A건(2026-08-31)   200,000 이 "유지증거금 ≥ 증거금" 으로 거절 → 130,000 으로
       B건(2026-08-31)   100배 자체가 구간 최대배율 초과로 거절 → 50배로 내리고
                         ★지갑 50,000★ 으로 바꿉니다.
     왜 50,000 인가 — 50배에서 지갑 100,000 은 명목 4,878,048(4구간)이고
     지갑 50,000 은 명목 2,439,024(★3구간★) 입니다. 유지증거금률이 1% 와
     0.65% 로 서로 달라 "구간이 달라도" 라는 말이 실제로 성립합니다.
     ⚠️ 2026-08-31 당시 50배에서 지갑 130,000 은 최대 버튼의 부동소수점 경계에
        걸려 거절됐습니다. 2026-09-01 에 js/max-margin-safe.js 로 고쳐졌습니다(1-3 참조).
        그래도 여기는 50,000 그대로 둡니다 — ★3구간이라 4구간과 다른 값을 타는★
        것이 이 블록의 목적이고, 130,000 은 같은 4구간이라 목적에 안 맞습니다. */
  const b = 한판(50000);
  ok("지갑 50,000 — 증거금 48,780.4878", Math.abs(b.margin - 48780.4878) < 0.001, b.margin.toFixed(4));
  ok("지갑 50,000 — 진입수수료 1,219.5122", Math.abs(b.entryFee - 1219.5122) < 0.001, b.entryFee.toFixed(4));
  ok("지갑 50,000 은 3구간이다 (명목 2,439,024.39 ≤ 3,000,000)",
    Math.abs(b.margin * 50 - 2439024.3902) < 0.01, (b.margin * 50).toFixed(4));
  ok("지갑 50,000 — 유지증거금 14,353.6585 (명목 × 0.65% − 공제액 1,500)",
    Math.abs(b.env.T.maintenanceMargin(b.margin * 50) - 14353.6585) < 0.001,
    b.env.T.maintenanceMargin(b.margin * 50).toFixed(4));
  ok("⭐ 지갑 50,000 — 실현손익이 정확히 -50,000.00 (구간이 달라도 지갑 전액)",
    Math.abs(b.snap.realizedPnl + 50000) < 0.001, b.snap.realizedPnl.toFixed(4));
  ok("지갑 50,000 — 청산 뒤 지갑 0", Math.abs(b.snap.balance) < 1e-6, String(b.snap.balance));
}

/* ========================================================================
 * 1-2. ★새 성질★ — 명목 구간의 최대 배율을 넘으면 진입을 거절한다 (2026-08-31 B건)
 * ------------------------------------------------------------------------
 * ⚠️ 이 절은 A건의 "유지증거금 ≥ 증거금이면 거절" 을 ★대체★ 한 것입니다.
 *    지웠다고 성질이 약해진 게 아닙니다 — 새 검사가 옛 검사를 ★완전히 포함★
 *    합니다. 그 포함 관계는 숫자로 증명해서
 *    tests/bracket-max-leverage-seal.test.js ⑥ 에 따로 못 박았습니다.
 *    (명목 1,000 ~ 20억을 훑어 개시증거금률 − 실효 유지증거금률 최솟값 +0.4000%.
 *     0 이하가 하나도 없으므로 "구간 상한은 통과했는데 진입 즉시 청산" 은 없습니다)
 *
 * 왜 이게 "회원 돈을 지키는" 쪽인가
 *   명목이 커질수록 청산 위험이 커지므로 바이낸스는 그 구간에서 쓸 수 있는
 *   최대 배율을 낮춥니다. 우리도 같은 표(js/risk-brackets.js)를 씁니다.
 *   상한을 넘는 주문은 받지 않고, ★왜 안 되는지 숫자로 말해주고★ 거절합니다.
 *   조용히 배율을 깎아 체결하면 회원은 자기가 건 배율로 잡은 줄 압니다.
 *
 * 실측 경계 (100배 · 최대 버튼 · 진입가 60,000)
 *   지갑  8,400 → 명목   800,000.00 → 2구간(최대 100배) → 열립니다 (경계 정확히)
 *   지갑  8,401 → 명목   800,095.24 → 3구간(최대  75배) → ★거절★
 *   지갑 100,000 → 명목 9,523,810   → 4구간(최대  50배) → 거절
 *   지갑 200,000 → 명목 19,047,619  → 5구간(최대  25배) → 거절
 * ====================================================================== */
section("1-2. 구간 최대배율을 넘으면 진입 거절 (2026-08-31 B건 새 성질)");
{
  const 열리나 = (지갑, 배율) => {
    const env = boot({ balance: 지갑 });
    env.tick(60000);
    env.T.setLeverage(배율);
    const r = env.T.openPosition("long", env.T.getMaxAffordableMargin());
    return { 열림: !!env.T.getSnapshot().position, error: (r && r.error) || "" };
  };

  const a = 열리나(8400, 100);
  ok("지갑 8,400 · 100배 는 열린다 (명목 정확히 800,000 = 2구간 상한)", a.열림, a.error);

  const b = 열리나(8401, 100);
  ok("지갑 8,401 · 100배 부터 거절된다 (명목이 3구간으로 넘어가 최대 75배)", !b.열림, "열렸습니다");

  /* ⚠️ 2026-08-31 [B건] — 예전 문구 검사는 이랬습니다:
       ok("거절 사유에 '유지증거금' 과 '배율' 이 들어 있다", ...)
     거절 ★이유 자체★ 가 바뀌었습니다. 이제 유지증거금이 아니라 구간 최대배율
     때문에 막습니다. 그래서 검사도 새 이유에 맞춥니다.
     ⭐ 여기서 정말 지키는 것은 "조용히 실패하지 않는다" 입니다 —
        회원이 읽고 ★무엇을 어떻게 고쳐야 하는지★ 알 수 있어야 합니다.
        그래서 (1) 배율이라는 말 (2) 실제 허용 배율 숫자 (3) 지금 건 배율
        (4) 무엇을 하라는 안내 — 넷을 다 요구합니다. */
  ok("거절 사유에 '배율' 이라는 말이 있다", b.error.indexOf("배율") >= 0, b.error);
  ok("거절 사유가 ★쓸 수 있는 배율(75배)★ 을 알려준다", b.error.indexOf("75배") >= 0, b.error);
  ok("거절 사유가 ★지금 건 배율(100배)★ 도 같이 말해준다", b.error.indexOf("100배") >= 0, b.error);
  ok("거절 사유가 무엇을 하라고 알려준다 (낮추거나 / 줄여주세요)",
    /낮추|줄여/.test(b.error), b.error);
  ok("거절 사유에 주문 금액이 숫자로 들어 있다", /[0-9],[0-9]{3}/.test(b.error), b.error);

  const c = 열리나(100000, 100);
  ok("지갑 100,000 · 100배 도 거절된다 (4구간 최대 50배)", !c.열림, "열렸습니다");
  ok("지갑 100,000 거절 사유는 50배를 가리킨다", c.error.indexOf("50배") >= 0, c.error);

  const d = 열리나(200000, 100);
  ok("지갑 200,000 · 100배 도 거절된다 (5구간 최대 25배)", !d.열림, "열렸습니다");
  ok("지갑 200,000 거절 사유는 25배를 가리킨다", d.error.indexOf("25배") >= 0, d.error);

  /* ⭐ 거절해 놓고 ★배율만 낮추면 바로 열려야★ 합니다.
     안 열리면 회원은 안내대로 했는데도 막힌 셈이라 그게 더 나쁜 고장입니다. */
  const e = 열리나(100000, 50);
  ok("⭐ 안내대로 50배로 낮추면 같은 지갑에서 열린다", e.열림, e.error);

  /* ⭐ 거절은 ★아무 흔적도 남기지 않아야★ 합니다.
     돈이 빠지거나 거래기록이 생기면 그게 더 나쁜 고장입니다. */
  const env = boot({ balance: 200000 });
  env.tick(60000);
  env.T.setLeverage(100);
  env.T.openPosition("long", env.T.getMaxAffordableMargin());
  const snap = env.T.getSnapshot();
  ok("거절되면 지갑이 그대로다 (수수료도 안 빠진다)", Math.abs(snap.balance - 200000) < 1e-9, String(snap.balance));
  ok("거절되면 거래기록이 안 생긴다", snap.closedTrades.length === 0, String(snap.closedTrades.length));
  ok("거절되면 포지션도 없다", snap.position === null);
}

/* ========================================================================
 * 1-3. ⭐ 고쳐짐 — 최대 버튼 값을 엔진이 거절하던 것 (2026-09-01)
 * ------------------------------------------------------------------------
 * ⚠️ 이 절은 하루 만에 ★뒤집힌 절★ 입니다. 그 이력을 지우지 않고 남깁니다.
 *
 *   2026-08-31  기록팀이 "아직 안 고쳐졌다" 는 ★사실★ 을 봉인했습니다.
 *               (거절되는 것이 옳다고 못 박은 게 아닙니다 — 지금 그렇다고만)
 *   2026-09-01  수리팀이 js/max-margin-safe.js 로 고쳤습니다.
 *               그 순간 이 절이 "열렸습니다 — ★고쳐진 것 같습니다★" 로 터졌고,
 *               실패 메시지가 ★무엇을 어떻게 뒤집으라고★ 알려줬습니다.
 *               ⭐ "안 만든 기능을 테스트로 남긴다" 가 실제로 일한 사례입니다.
 *
 * ── 무엇이 문제였나 ──────────────────────────────────────────────────
 *   최대 버튼   margin = 잔고 / (1 + 배율 × taker)          (js/trading.js:109)
 *   진입 검사   margin + margin × 배율 × taker > 잔고 → 거절 (js/trading.js:132)
 *   종이 위에서는 정확히 같은데, 나눈 뒤 다시 곱하면 마지막 자리가 어긋납니다.
 *   실측 — 지갑 130,000 · 50배에서 130,000.00000000001 > 130,000  →  거절.
 *
 *   회원 눈에는 ★"최대 버튼을 눌렀는데 돈이 모자란다고 한다"★ 로 보였습니다.
 *   PM 실측 — 대표님 잔고 98,986.53 에서 배율 조합 30개 중 ★15개★ 가 거절.
 *
 * ── 어떻게 고쳤나 ────────────────────────────────────────────────────
 *   js/trading.js 는 수정 금지 파일이고 허가 범위(바이낸스 A~D)도 아니라
 *   ★함수 감싸기★ 로 우회했습니다 — js/max-margin-safe.js.
 *   ⚠️ 이 파일은 ★js/trading.js 뒤★ 에 태워야 합니다. 앞에 태우면 App.Trading 이
 *      아직 없어서 조용히 아무것도 안 감쌉니다. 목록은 tests/_engine-modules.js.
 *
 * ⭐ 자세한 성질(깎는 양을 사람이 고르지 않는다 · 진입 검사는 안 건드린다 ·
 *    최대 버튼 뒤 배율을 바꿔도 안 거절된다)은
 *    ★tests/max-margin-safe-seal.test.js★ 가 따로 못 박습니다.
 *    여기서는 "이 봉인이 옛 사실을 들고 있지 않다" 만 확인합니다.
 * ====================================================================== */
section("1-3. ⭐ 고쳐짐 — 최대 버튼 값을 엔진이 거절하던 것 (2026-09-01)");
{
  const 열리나 = (지갑, 배율) => {
    const env = boot({ balance: 지갑 });
    env.tick(60000);
    env.T.setLeverage(배율);
    const r = env.T.openPosition("long", env.T.getMaxAffordableMargin());
    return { 열림: !!env.T.getSnapshot().position, error: (r && r.error) || "" };
  };

  /* 2026-08-31 에 거절되던 바로 그 조합입니다. 이제 열려야 합니다. */
  const x = 열리나(130000, 50);
  ok("⭐ 지갑 130,000 · 50배 최대 버튼이 이제 열린다 (2026-08-31 에는 거절됐습니다)",
    x.열림, x.error);

  /* 그날 함께 거절되던 지갑들 — 전부 열려야 합니다.
     실측(2026-08-31) — 5만·10만·20만은 열렸고 12만·13만·15만·24만은 거절됐습니다. */
  const 그날거절 = [120000, 130000, 150000, 240000];
  const 아직거절 = 그날거절.filter((w) => !열리나(w, 50).열림);
  ok("⭐ 그날 거절되던 지갑 4종(12만·13만·15만·24만)이 전부 열린다",
    아직거절.length === 0, "아직 거절: " + 아직거절.join(", "));

  /* 그날 잘 되던 것도 그대로여야 합니다 (고치면서 다른 걸 깨뜨리지 않았는지) */
  const 그날정상 = [50000, 100000, 200000];
  const 이제거절 = 그날정상.filter((w) => !열리나(w, 50).열림);
  ok("그날 잘 되던 지갑 3종(5만·10만·20만)도 그대로 열린다",
    이제거절.length === 0, "새로 거절: " + 이제거절.join(", "));

  /* ⭐ 고쳤다고 해서 ★구간 상한 거절까지★ 없어지면 안 됩니다.
     그건 회원을 지키는 쪽이라 그대로 남아 있어야 합니다. */
  const y = 열리나(130000, 100);
  ok("구간 최대배율 거절은 그대로 살아 있다 (지갑 130,000 · 100배는 여전히 거절)",
    !y.열림, "열렸습니다 — B건의 안전장치가 같이 사라졌습니다");
  ok("그 거절 사유는 '가용 자산' 이 아니라 ★배율★ 쪽이다",
    y.error.indexOf("배율") >= 0 && y.error.indexOf("가용 자산") === -1, y.error);

  /* 감싸는 모듈이 실제로 태워졌는지 — 안 태우면 위 검사가 옛 동작을 잽니다 */
  const env = boot({ balance: 130000 });
  ok("js/max-margin-safe.js 가 이 무대에 실제로 태워졌다",
    !!env.S.App.MaxMarginSafe,
    "안 태우면 이 절은 ★회원이 안 겪는 옛 경로★ 를 재게 됩니다 (tests/_engine-modules.js 의 엔진뒤)");
}
{
  /* 숏도 같습니다 — 방향과 무관한 회계 성질입니다. (2026-08-31 B건: 100 → 50배) */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(50);
  const margin = env.T.getMaxAffordableMargin();
  env.T.openPosition("short", margin);
  const pos = env.T.getSnapshot().position;
  /* ⚠️ 예전에는 if (pos) 로만 감싸서, 진입이 거절되면 이 검사가 ★조용히
     아무것도 안 하고★ 지나갔습니다. B건으로 100배가 막히자 실제로 그럴
     뻔했습니다. 열렸는지부터 못 박습니다. */
  ok("숏도 50배 최대 버튼으로 열린다", !!pos, "숏 포지션이 안 생겼습니다");
  if (pos) env.tick(pos.liq + 1);
  const snap = env.T.getSnapshot();
  const st = snap.closedTrades[0] || null;
  ok("숏 청산가는 60,747.60 (롱 59,252.40 과 진입가 기준 대칭)",
    !!pos && Math.abs(pos.liq - 60747.6) < 1e-4, pos ? String(pos.liq) : "포지션 없음");
  ok("숏도 강제청산 실현손익이 -100,000.00",
    !!st && st.reason === "강제청산" && Math.abs(snap.realizedPnl + 100000) < 0.001,
    st ? snap.realizedPnl.toFixed(4) : "거래 없음");
}

/* ========================================================================
 * 2. 왜 정확히 지갑 전액이 되는가 — 세 조각을 따로 못 박습니다
 * ------------------------------------------------------------------------
 * 하나만 바뀌어도 위 결과가 깨집니다. 그때 "어디가 바뀌었는지" 를 바로
 * 알 수 있게 조각별로 나눠 둡니다.
 * ====================================================================== */
section("2. 세 조각");
{
  const trading = read("js/trading.js");
  ok("(1) 최대 버튼 = balance / (1 + leverage × 테이커율)",
    /return state\.balance \/ \(1 \+ leverage \* FEE_RATE\.taker\);/.test(trading),
    "이 식이 바뀌면 '지갑을 딱 맞게 쓰는' 성질이 사라집니다");
  ok("(2) 강제청산 손익 = -청산되는 증거금",
    /const grossPnl = isForced\s*\n?\s*\? -closingMargin/.test(trading.replace(/\r/g, "")),
    "강제청산 총손익 식");
  ok("(3) 강제청산은 잔고를 되돌려주지 않는다 (if (!isForced) 안에서만 환급)",
    /if \(!isForced\) \{[\s\S]{0,240}state\.balance \+= closingMargin \+ netPnl;/.test(trading));
  ok("(4) 강제청산 fee 에는 진입수수료만 담긴다",
    /const totalFee = isForced \? closingEntryFee : closingEntryFee \+ exitFee;/.test(trading));
  ok("(5) 강제청산 여부는 reason 문자열로 판별한다",
    /const isForced = reason === "강제청산";/.test(trading),
    "플래그로 바꾸면 realized-pnl-fix 가 못 알아봅니다");
  ok("(6) 청산가 도달이 TP·SL 보다 먼저 발동한다",
    trading.indexOf('closePosition("강제청산")') < trading.indexOf('closePosition("익절(TP)")'));
  ok("(7) 수수료율 테이커 0.05% / 메이커 0.02% (바이낸스 일반 사용자)",
    /taker: 0\.0005,/.test(trading) && /maker: 0\.0002,/.test(trading));
  /* ── (8) 2026-08-31 갱신 — "0.5% 고정" 은 ★없어진 성질★ 입니다 ────────────
     예전: ok("(8) 유지증거금률 0.5% 고정", /const MMR = 0\.005;/.test(trading));
     대표 결재로 유지증거금이 명목 구간별(js/risk-brackets.js)로 바뀌었습니다.
     값만 바꾸면(0.005 → 0.01 같은 식) 거짓말이 됩니다 — 구간마다 다르니까요.
     그래서 ★"고정값이 아니다" 라는 사실 자체★ 를 못 박습니다.

     ⭐ 수리팀이 잘한 것 — const MMR = 0.005; 를 일부러 안 남겼습니다.
        남겼으면 이 봉인이 초록으로 통과했겠지만, 지키던 성질은 이미 사라진
        뒤라 ★거짓 초록★ 이 됩니다. 이름을 MMR_FALLBACK 으로 바꿔서 봉인이
        정직하게 터지도록 뒀습니다. 갱신도 같은 기준으로 합니다. */
  ok("(8-a) 고정 유지증거금률(const MMR = 0.005)이 더 이상 없다",
    !/const MMR = 0\.005;/.test(trading),
    "0.5% 고정이 되살아났습니다 — 구간표(js/risk-brackets.js)가 무시되고 있을 수 있습니다");
  ok("(8-b) 남은 0.005 는 표를 못 읽을 때만 쓰는 예비값이다",
    /const MMR_FALLBACK = 0\.005;/.test(trading),
    "예비값이 사라지면 표를 못 읽는 순간 청산가가 NaN 이 됩니다");
  ok("(8-c) 유지증거금을 구간표(App.RiskBrackets)에서 가져온다",
    /App\.RiskBrackets/.test(trading) && /RB\.maintenanceMargin/.test(trading),
    "엔진이 구간표를 안 보면 회원은 화면과 다른 시점에 청산됩니다");
  ok("(8-d) 청산가 계산이 명목(notional)을 받는다",
    /function calcLiquidationPrice\(side, entry, leverage, notional\)/.test(trading),
    "명목을 안 받으면 구간을 고를 수 없어 조용히 예비값으로 계산됩니다");

  /* (8-e) ⭐ 이 봉인이 원래 지키려던 것 — 숫자가 아니라 ★성질★ 입니다.
     "청산 때 회원이 잃는 돈은 자기가 건 돈 딱 그만큼이고 그 이상이 아니다."
     구간별로 바뀌어도 이건 그대로여야 합니다. 소스가 아니라 ★실제로 돌려서★ 봅니다. */
  {
    /* ⚠️⚠️ 2026-08-31 [B건] — 여기에 ★조용한 구멍★ 이 있었습니다.
       예전 코드는 진입이 거절되면 if (!pos) return false 로 넘어갔습니다.
       B건으로 100배가 전부 거절되자 세 판 모두 그냥 통과 — ★아무것도 안 재면서
       초록★ 이 됩니다. 우리가 P1 로 부르는 조용한 고장을 테스트가 저지른 셈입니다.
       그래서 (1) 배율을 50 으로 내려 실제로 열리게 하고
             (2) ★몇 판이 실제로 열렸는지★ 를 따로 셉니다. */
    const 지갑들 = [50000, 100000, 200000];   // 3구간 · 4구간 · 4구간(더 큰 명목)
    let 열린판 = 0;
    const 손실이건돈을넘는가 = 지갑들.some((지갑) => {
      const env = boot({ balance: 지갑 });
      env.tick(60000);
      env.T.setLeverage(50);
      const margin = env.T.getMaxAffordableMargin();
      env.T.openPosition("long", margin);
      const pos = env.T.getSnapshot().position;
      if (!pos) return false;
      열린판++;
      env.tick(pos.liq - 1);
      const snap = env.T.getSnapshot();
      /* 잃은 돈이 지갑보다 크거나, 지갑이 음수로 내려가면 '건 돈' 을 넘은 것입니다 */
      return snap.realizedPnl < -지갑 - 0.001 || snap.balance < -1e-6;
    });
    ok("(8-e-0) 세 판이 실제로 열렸다 (안 열리면 아래 검사가 아무것도 안 잽니다)",
      열린판 === 지갑들.length, 열린판 + " / " + 지갑들.length + " 판만 열렸습니다");
    ok("(8-e) ⭐ 구간이 바뀌어도 강제청산 손실이 '건 돈' 을 넘지 않는다 (지갑 5만·10만·20만 · 50배)",
      !손실이건돈을넘는가,
      "회원이 건 돈보다 더 잃었습니다 — 이게 이 봉인의 진짜 목적입니다");
  }

  const fix = read("js/realized-pnl-fix.js");
  ok("(9) 강제청산이면 fee 전체를 진입수수료로 본다",
    /if \(trade\.reason === "강제청산" \|\| trade\.forced \|\| trade\.isForced\) return fee;/.test(fix),
    "여기서 청산수수료를 또 빼면 실현손익이 -1000.47 처럼 어긋납니다(2026 재발 사례)");
  ok("(10) 실현손익에서 진입수수료 합계를 뺀다",
    /snap\.realizedPnl = \(Number\(snap\.realizedPnl\) \|\| 0\) - entryFees;/.test(fix));
}

/* ========================================================================
 * 3. 이 성질이 회원 눈에 어떻게 보이나 — 같이 못 박습니다
 * ====================================================================== */
section("3. 회원이 보는 값");
{
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(50);          // 2026-08-31 [B건] — 이 금액에서 100배는 거절됩니다
  const margin = env.T.getMaxAffordableMargin();
  env.T.openPosition("long", margin);
  const pos = env.T.getSnapshot().position || { liq: NaN };
  /* ⚠️ 아래 숫자 검사들은 포지션이 없으면 NaN 끼리 비교하며 조용히 빨강이 됩니다.
     "왜 빨강인지" 를 바로 알 수 있게 열렸는지부터 따로 못 박습니다. */
  ok("50배 최대 버튼으로 포지션이 열린다", !!env.T.getSnapshot().position,
    "안 열리면 아래 청산가·버팀폭 값은 전부 의미가 없습니다");

  /* ── 2026-08-31 [B건] 갱신 — 버팀폭 0.500% → 0.126% → ★1.246%★ ──────────
     세 판이 있었습니다. 헷갈리니 순서대로 적어둡니다.

       ① 처음        100배 · 유지증거금률 0.5% 고정 → 청산가 59,700.00 (0.500%)
       ② A건(구간별) 100배 · 4구간(1%, 공제 12,000) → 청산가 59,924.40 (0.126%)
       ③ B건(구간상한) ★100배 자체가 안 됩니다★ → 50배로 내려서 잽니다

     지금(③) 숫자가 나오는 과정 —
       증거금 97,560.9756 × 50배 = 명목 4,878,048.7805
       → 4구간 (유지증거금률 1%, 공제액 12,000)
       → 유지증거금 = 4,878,048.7805 × 0.01 − 12,000 = 36,780.4878
       → 실효 유지증거금률 = 36,780.4878 ÷ 4,878,048.7805 = 0.0075400
       → 청산가 = 60,000 × (1 − 1/50 + 0.00754) = 59,252.40
       → 버팀폭 (60,000 − 59,252.40) ÷ 60,000 = ★1.246%★

     ⚠️ ②보다 넓어진 이유는 유지증거금이 느슨해져서가 아닙니다.
        ★배율이 100 → 50 으로 내려갔기 때문★ 입니다. 같은 4구간이라
        유지증거금률(실효 0.754%)은 ②의 0.874% 보다 오히려 낮은데, 이건
        명목이 절반이라 공제액 12,000 이 상대적으로 크게 먹혀서입니다.

     ⚠️ 회원 눈에는 "이 금액에서는 100배를 못 건다" 로 보입니다.
        대표 결재("바이낸스를 따라해") 사항이라 이 봉인은 막지 않고
        ★새 값을 기록★ 합니다. 값이 또 조용히 바뀌면 여기서 터집니다.

     대표님이 들고 계신 기존 100배 포지션은 ★그대로 유지됩니다.★
     (B건은 새로 여는 주문에만 걸립니다 — tests/bracket-max-leverage-seal.test.js ①) */
  ok("명목이 4구간이다 (4,878,048.78 은 3,000,000 초과 12,000,000 이하)",
    Math.abs(margin * 50 - 4878048.7805) < 0.01, (margin * 50).toFixed(4));
  ok("유지증거금 36,780.4878 (명목 × 1% − 공제액 12,000)",
    Math.abs(env.T.maintenanceMargin(margin * 50) - 36780.4878) < 0.001,
    env.T.maintenanceMargin(margin * 50).toFixed(4));
  ok("50배 롱 청산가 59,252.40 (①59,700 도 ②59,924.40 도 아니다)",
    Math.abs(pos.liq - 59252.4) < 1e-4, String(pos.liq));
  ok("버팀폭 1.246% (①0.500% · ②0.126% 가 아니다)",
    Math.abs(((60000 - pos.liq) / 60000) * 100 - 1.246) < 0.001,
    (((60000 - pos.liq) / 60000) * 100).toFixed(4) + "%");

  env.tick(pos.liq);   // 정확히 청산가에 닿아도 발동합니다
  const snap = env.T.getSnapshot();
  const t0 = snap.closedTrades[0] || null;
  ok("정확히 청산가에 닿으면 발동한다", snap.position === null && !!t0 && t0.reason === "강제청산");
  ok("청산가로 체결된 것으로 기록된다 (현재가가 아니라 pos.liq)",
    !!t0 && Math.abs(t0.exit - 59252.4) < 1e-4, t0 ? String(t0.exit) : "거래 없음");
  ok("ROE 는 -100%", !!t0 && Math.abs(t0.pnlPercent + 100) < 1e-9, t0 ? String(t0.pnlPercent) : "거래 없음");
  ok("자산(equity)도 0 이 된다", Math.abs(snap.equity) < 1e-6, String(snap.equity));
  ok("두 번째 강제청산은 없다 (포지션이 사라졌으므로)", snap.closedTrades.length === 1, String(snap.closedTrades.length));
}
{
  /* 강제청산이 아니면 이 성질이 적용되면 안 됩니다 — 대조군. */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(50);      // 2026-08-31 [B건] — 100배는 이 금액에서 거절됩니다
  env.T.openPosition("long", env.T.getMaxAffordableMargin());
  env.tick(60100);            // 청산가(59,252.40)에 안 닿음
  env.T.closePosition();      // 수동청산
  const t = env.T.getSnapshot().closedTrades[0] || null;
  ok("수동청산은 reason 이 다르다", !!t && t.reason === "수동청산", t ? t.reason : "거래 없음");
  ok("수동청산은 fee 에 청산수수료가 같이 담긴다 (진입수수료 2,439.0244 보다 크다)",
    !!t && t.fee > 2439.0244, t ? t.fee.toFixed(4) : "거래 없음");
  ok("수동청산은 증거금이 지갑으로 돌아온다", env.T.getSnapshot().balance > 90000, String(env.T.getSnapshot().balance));
}

/* ========================================================================
 * 4. 수정 금지 파일 (md5)
 * ---------------------------------------------------------------------- */
section("4. 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/trading.js 를 건드리지 않았다", md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
