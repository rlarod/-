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
  /* 2026-08-31 — 예전에는 여기가 지갑 200,000 이었습니다.
     지금은 200,000 이 ★진입 자체가 거절★ 됩니다(아래 1-2 에서 따로 못 박습니다).
     "지갑 전액" 성질이 구간이 바뀌어도 살아있는지 봐야 하므로,
     ★다른 구간(5구간)에 떨어지는★ 지갑 130,000 으로 바꿉니다.
     100,000 은 4구간, 130,000 은 5구간이라 서로 다른 유지증거금률을 탑니다. */
  const b = 한판(130000);
  ok("지갑 130,000 — 증거금 123,809.5238", Math.abs(b.margin - 123809.5238) < 0.001, b.margin.toFixed(4));
  ok("지갑 130,000 — 진입수수료 6,190.4762", Math.abs(b.entryFee - 6190.4762) < 0.001, b.entryFee.toFixed(4));
  ok("⭐ 지갑 130,000 — 실현손익이 정확히 -130,000.00 (구간이 달라도 지갑 전액)",
    Math.abs(b.snap.realizedPnl + 130000) < 0.001, b.snap.realizedPnl.toFixed(4));
  ok("지갑 130,000 — 청산 뒤 지갑 0", Math.abs(b.snap.balance) < 1e-6, String(b.snap.balance));
}

/* ========================================================================
 * 1-2. ★새 성질★ — 유지증거금이 증거금보다 크면 진입을 거절한다 (2026-08-31)
 * ------------------------------------------------------------------------
 * 왜 이게 "회원 돈을 지키는" 쪽인가
 *   명목이 커지면 유지증거금이 증거금을 넘어섭니다. 그 상태로 열어주면
 *   ★체결되는 순간 이미 청산 조건★ 이라 회원은 아무것도 못 해보고 전액을
 *   잃습니다. 그래서 엔진이 열어주지 않고 거절합니다.
 *
 * 실측 경계 (100배 · 최대 버튼)
 *   지갑 138,000 → 명목 13,142,857.14 → 열립니다
 *   지갑 138,600 → 명목 13,200,000.00 → ★거절★ (유지증거금 132,000 = 증거금 132,000)
 *   지갑 200,000 → 명목 19,047,619.05 → 거절 (유지증거금 248,952.38 > 증거금 190,476.19)
 *   경계식 — 5구간에서 유지증거금 = 2×증거금 − 132,000 이므로
 *            증거금 ≥ 132,000, 즉 지갑 ≥ 138,600 에서 거절됩니다.
 *
 * ⚠️ 회원 눈에는 "100배가 갑자기 안 된다" 로 보입니다.
 *    바이낸스는 이럴 때 거절 대신 ★구간이 허용하는 배율로 낮춰줍니다★
 *    (5구간 최대 25배). 그 차이는 PM 에게 별건으로 올렸습니다.
 * ====================================================================== */
section("1-2. 유지증거금 ≥ 증거금 이면 진입 거절 (2026-08-31 새 성질)");
{
  const 열리나 = (지갑) => {
    const env = boot({ balance: 지갑 });
    env.tick(60000);
    env.T.setLeverage(100);
    const r = env.T.openPosition("long", env.T.getMaxAffordableMargin());
    return { 열림: !!env.T.getSnapshot().position, error: (r && r.error) || "" };
  };

  const a = 열리나(138000);
  ok("지갑 138,000 은 아직 열린다 (경계 바로 아래)", a.열림, a.error);

  const b = 열리나(138600);
  ok("지갑 138,600 부터 거절된다 (유지증거금 132,000 = 증거금 132,000)", !b.열림, "열렸습니다");
  ok("거절 사유에 '유지증거금' 과 '배율' 이 들어 있다",
    b.error.indexOf("유지증거금") >= 0 && b.error.indexOf("배율") >= 0, b.error);

  const c = 열리나(200000);
  ok("지갑 200,000 도 거절된다 (유지증거금 248,952.38 > 증거금 190,476.19)", !c.열림, "열렸습니다");

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
    const 손실이건돈을넘는가 = [50000, 100000, 130000].some((지갑) => {
      const env = boot({ balance: 지갑 });
      env.tick(60000);
      env.T.setLeverage(100);
      const margin = env.T.getMaxAffordableMargin();
      env.T.openPosition("long", margin);
      const pos = env.T.getSnapshot().position;
      if (!pos) return false;
      env.tick(pos.liq - 1);
      const snap = env.T.getSnapshot();
      /* 잃은 돈이 지갑보다 크거나, 지갑이 음수로 내려가면 '건 돈' 을 넘은 것입니다 */
      return snap.realizedPnl < -지갑 - 0.001 || snap.balance < -1e-6;
    });
    ok("(8-e) ⭐ 구간이 바뀌어도 강제청산 손실이 '건 돈' 을 넘지 않는다 (지갑 5만·10만·13만)",
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
  env.T.setLeverage(100);
  const margin = env.T.getMaxAffordableMargin();
  env.T.openPosition("long", margin);
  const pos = env.T.getSnapshot().position || { liq: NaN };

  /* ── 2026-08-31 갱신 — 버팀폭이 0.500% → 0.126% 로 좁아졌습니다 ──────────
     예전: 유지증거금률 0.5% 고정 → 청산가 59,700 (버팀폭 0.500%)
     지금: 명목이 구간을 고릅니다.
           증거금 95,238.0952 × 100배 = 명목 9,523,809.52
           → 4구간 (유지증거금률 1%, 공제액 12,000)
           → 유지증거금 = 9,523,809.52 × 0.01 − 12,000 = 83,238.0952
           → 실효 유지증거금률 = 83,238.0952 ÷ 9,523,809.52 = 0.0087400
           → 청산가 = 60,000 × (1 − 1/100 + 0.0087400) = 59,924.40
           → 버팀폭 (60,000 − 59,924.40) ÷ 60,000 = ★0.126%★

     ⚠️ 회원이 예전보다 ★빨리 청산됩니다.★ 0.500% → 0.126% 로 4배 가까이
        좁아졌습니다. 대표 결재("바이낸스를 따라해") 사항이라 이 봉인은
        막지 않고 ★새 값을 기록★ 합니다. 값이 또 조용히 바뀌면 여기서 터집니다.

     대표님 실제 포지션으로 확인한 값도 같은 4구간입니다 —
        명목 9,524,029 USDT → 4구간 → 유지증거금 83,240.29 USDT → 버팀폭 0.126% */
  ok("명목이 4구간이다 (9,523,809.52 ≤ 12,000,000)",
    Math.abs(margin * 100 - 9523809.5238) < 0.01, (margin * 100).toFixed(4));
  ok("유지증거금 83,238.0952 (명목 × 1% − 공제액 12,000)",
    Math.abs(env.T.maintenanceMargin(margin * 100) - 83238.0952) < 0.001,
    env.T.maintenanceMargin(margin * 100).toFixed(4));
  ok("100배 롱 청산가 59,924.40 (예전 59,700 이 아니다)",
    Math.abs(pos.liq - 59924.4) < 1e-4, String(pos.liq));
  ok("버팀폭 0.126% (예전 0.500%)",
    Math.abs(((60000 - pos.liq) / 60000) * 100 - 0.126) < 0.001,
    (((60000 - pos.liq) / 60000) * 100).toFixed(4) + "%");

  env.tick(pos.liq);   // 정확히 청산가에 닿아도 발동합니다
  const snap = env.T.getSnapshot();
  const t0 = snap.closedTrades[0] || null;
  ok("정확히 청산가에 닿으면 발동한다", snap.position === null && !!t0 && t0.reason === "강제청산");
  ok("청산가로 체결된 것으로 기록된다 (현재가가 아니라 pos.liq)",
    !!t0 && Math.abs(t0.exit - 59924.4) < 1e-4, t0 ? String(t0.exit) : "거래 없음");
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
  ok("js/trading.js 를 건드리지 않았다", md5("trading.js") === require("./_locked-hashes.js").TRADING, md5("trading.js"));  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(0);
