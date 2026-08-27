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
  vm.runInContext(read("js/trading.js"), sandbox, { filename: "js/trading.js" });
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

function 한판(시작지갑) {
  const env = boot({ balance: 시작지갑 });
  env.tick(60000);
  env.T.setLeverage(100);

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
  ok("증거금 95,238.0952 (100,000 / 1.05)", Math.abs(a.margin - 95238.0952) < 0.001, a.margin.toFixed(4));
  ok("진입수수료 4,761.9048 (증거금 × 100 × 0.05%)", Math.abs(a.entryFee - 4761.9048) < 0.001, a.entryFee.toFixed(4));
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
  const b = 한판(200000);
  ok("지갑 200,000 — 증거금 190,476.1905", Math.abs(b.margin - 190476.1905) < 0.001, b.margin.toFixed(4));
  ok("지갑 200,000 — 진입수수료 9,523.8095", Math.abs(b.entryFee - 9523.8095) < 0.001, b.entryFee.toFixed(4));
  ok("⭐ 지갑 200,000 — 실현손익이 정확히 -200,000.00",
    Math.abs(b.snap.realizedPnl + 200000) < 0.001, b.snap.realizedPnl.toFixed(4));
  ok("지갑 200,000 — 청산 뒤 지갑 0", Math.abs(b.snap.balance) < 1e-6, String(b.snap.balance));
}
{
  /* 숏도 같습니다 — 방향과 무관한 회계 성질입니다. */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(100);
  const margin = env.T.getMaxAffordableMargin();
  env.T.openPosition("short", margin);
  const pos = env.T.getSnapshot().position;
  if (pos) env.tick(pos.liq + 1);
  const snap = env.T.getSnapshot();
  const st = snap.closedTrades[0] || null;
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
  ok("(8) 유지증거금률 0.5% 고정", /const MMR = 0\.005;/.test(trading));

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
  env.T.setLeverage(100);
  const margin = env.T.getMaxAffordableMargin();
  env.T.openPosition("long", margin);
  const pos = env.T.getSnapshot().position || { liq: NaN };

  /* 100배의 버팀폭 — 유지증거금률 0.5% 고정이므로 진입가 대비 0.5% 아래가 청산가입니다.
     (바이낸스는 배율 구간마다 유지증거금률이 달라 이 폭이 다릅니다 — 계산식은
      대표 결재 항목이라 여기서는 '지금 값' 을 기록만 합니다) */
  ok("100배 롱 청산가는 진입가의 99.5%", Math.abs(pos.liq - 60000 * 0.995) < 1e-6, String(pos.liq));
  ok("버팀폭 0.5% (60,000 → 59,700)", Math.abs(pos.liq - 59700) < 1e-6, String(pos.liq));

  env.tick(pos.liq);   // 정확히 청산가에 닿아도 발동합니다
  const snap = env.T.getSnapshot();
  const t0 = snap.closedTrades[0] || null;
  ok("정확히 청산가에 닿으면 발동한다", snap.position === null && !!t0 && t0.reason === "강제청산");
  ok("청산가로 체결된 것으로 기록된다 (현재가가 아니라 pos.liq)",
    !!t0 && Math.abs(t0.exit - 59700) < 1e-6, t0 ? String(t0.exit) : "거래 없음");
  ok("ROE 는 -100%", !!t0 && Math.abs(t0.pnlPercent + 100) < 1e-9, t0 ? String(t0.pnlPercent) : "거래 없음");
  ok("자산(equity)도 0 이 된다", Math.abs(snap.equity) < 1e-6, String(snap.equity));
  ok("두 번째 강제청산은 없다 (포지션이 사라졌으므로)", snap.closedTrades.length === 1, String(snap.closedTrades.length));
}
{
  /* 강제청산이 아니면 이 성질이 적용되면 안 됩니다 — 대조군. */
  const env = boot({ balance: 100000 });
  env.tick(60000);
  env.T.setLeverage(100);
  env.T.openPosition("long", env.T.getMaxAffordableMargin());
  env.tick(60100);            // 청산가에 안 닿음
  env.T.closePosition();      // 수동청산
  const t = env.T.getSnapshot().closedTrades[0] || null;
  ok("수동청산은 reason 이 다르다", !!t && t.reason === "수동청산", t ? t.reason : "거래 없음");
  ok("수동청산은 fee 에 청산수수료가 같이 담긴다", !!t && t.fee > 4761.9048, t ? t.fee.toFixed(4) : "거래 없음");
  ok("수동청산은 증거금이 지갑으로 돌아온다", env.T.getSnapshot().balance > 90000, String(env.T.getSnapshot().balance));
}

/* ========================================================================
 * 4. 수정 금지 파일 (md5)
 * ---------------------------------------------------------------------- */
section("4. 수정 금지 파일");
{
  const crypto = require("crypto");
  const md5 = (f) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/trading.js 를 건드리지 않았다", md5("trading.js") === "33250202c00b097ff8344ae2ee64cbe7", md5("trading.js"));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
