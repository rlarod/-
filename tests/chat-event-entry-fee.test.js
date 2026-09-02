/* ===========================================================================
 * tests/chat-event-entry-fee.test.js
 * 채팅 청산 알림이 진입 수수료를 뺀 금액으로 말하는지 봉인합니다
 * ===========================================================================
 *
 * ── 무엇이 실제로 있었나 (2026-09-02 대표 지적) ─────────────────────────
 *   채팅   "김갱님이 BTC 매도 포지션을 +26,798,630원 익절했습니다"
 *
 *   그 숫자는 t.pnl 이었습니다. js/trading.js 가 청산 때 넣는 값은
 *       t.pnl = 총손익 − (청산수수료만)
 *   이라 진입 수수료가 아직 안 빠져 있습니다.
 *   이 프로젝트는 이미 그 값을 "틀렸다" 고 판정하고 우회 모듈까지
 *   만들어 뒀습니다 — js/realized-pnl-fix.js.
 *
 *   부풀어 보이는 정도는 100배에서 증거금의 5% 입니다.
 *   더 나쁜 것은 경계입니다. 100배에서 ROE 5% 미만이면
 *   실제로는 지갑이 줄었는데 채팅이 "익절했습니다 +얼마" 라고 말합니다.
 *   회원이 손해를 이익으로 읽습니다(P1).
 *
 * ── 이 파일이 못 박는 것 ────────────────────────────────────────────────
 *   [1] 금액이 t.pnl 이 아니라 (t.pnl − 진입수수료) 다
 *   [2] 익절/손절 판정도 같은 보정값 기준이다
 *       — 금액만 고치고 판정을 t.pnl 로 두면 "−금액 익절했습니다" 가 납니다
 *   [3] 강제청산 금액도 진입 수수료를 포함한 실제 손실이다
 *   [4] App.RealizedPnlFix 가 없으면 옛 동작 그대로다 (조용히 0 으로 만들지 않음)
 *   [5] 진입 수수료를 여기서 새로 계산하지 않는다 — 보정 모듈을 그대로 쓴다
 *       (같은 값 두 벌이 생기면 화면마다 숫자가 갈라집니다)
 *
 * ── 이 파일은 사이트 코드를 고치지 않습니다 ─────────────────────────────
 *   jsdom 안에서 두 모듈을 올려놓고 채팅에 나가는 문장만 읽습니다.
 *   서버에도 붙지 않습니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  o " + name); }
  else { fail++; console.log("  x " + name + (detail ? " — " + detail : "")); }
}

const CHAT_SRC = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");
const FIX_SRC = fs.readFileSync(path.join(REPO, "js", "realized-pnl-fix.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeBus() {
  const handlers = {};
  return {
    on: (k, f) => { (handlers[k] = handlers[k] || []).push(f); },
    emit: (k, v) => { (handlers[k] || []).forEach((f) => f(v)); },
  };
}

/* opts.보정모듈 === false 면 js/realized-pnl-fix.js 를 안 올립니다
   (그 파일이 index.html 에서 빠지거나 늦게 올라오는 상황 재현). */
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://tl.test/" });
  const win = dom.window;
  const sent = [];
  const store = {};

  win.App = {
    Bus: makeBus(),
    Config: { USD_KRW: 1500 },
    Auth: { getNickname: () => "김갱" },
    /* 보정 모듈이 init 을 끝내도록 최소한의 Trading 만 둡니다
       (없으면 100번 재시도 타이머가 계속 돕니다). */
    Trading: { getSnapshot: () => ({ closedTrades: [] }) },
    Storage: {
      load: (k) => (k in store ? store[k] : null),
      save: (k, v) => { store[k] = v; return true; },
      clear: (k) => { delete store[k]; return true; },
    },
    SupabaseClient: {
      get: () => ({
        auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }) },
        from: () => ({ insert: async (row) => { sent.push(row); return { error: null }; } }),
      }),
    },
  };
  win.console = { warn() {}, log() {}, error() {} };

  if (opts.보정모듈 !== false) win.eval(FIX_SRC);
  win.eval(CHAT_SRC);
  win.App.TradeEventsChat.init();
  return { win, sent, bus: win.App.Bus };
}

const 수수료 = { taker: 0.0005, maker: 0.0002 };
const 앞으로 = (ms) => Date.now() + 60000 + (ms || 0);

/* trading.js 가 실제로 기록하는 모양 그대로 한 건을 만듭니다.
   (js/trading.js closePartial — pnl = 총손익 − 청산수수료, fee = 진입 + 청산) */
function 거래(o) {
  const side = o.side || "long";
  const 진입수수료 = o.qty * o.entry * 수수료.taker;
  const 청산수수료 = o.qty * o.exit * 수수료.taker;
  const 총손익 = (side === "long" ? o.exit - o.entry : o.entry - o.exit) * o.qty;
  return {
    side, leverage: 100, entry: o.entry, exit: o.exit, qty: o.qty, margin: o.margin,
    pnl: 총손익 - 청산수수료,
    fee: 진입수수료 + 청산수수료,
    reason: "수동청산",
    closeTime: o.closeTime || 앞으로(),
    _진입수수료: 진입수수료,
    _실제지갑증가: 총손익 - 청산수수료 - 진입수수료,
  };
}

/* 문장에서 금액(원)만 뽑습니다.
   딱 떨어지는 문자열 비교는 못 씁니다 — 같은 수를 다른 순서로 더하면
   부동소수점 끝자리가 달라져 45,052 와 45,053 처럼 1원이 어긋납니다.
   실제로 이 테스트를 처음 돌렸을 때 그 1원 때문에 빨강이 났습니다. */
function 금액추출(m) {
  const hit = /([+-])([0-9,]+)원/.exec(m || "");
  if (!hit) return null;
  return (hit[1] === "-" ? -1 : 1) * Number(hit[2].replace(/,/g, ""));
}
const 가깝나 = (a, b) => a !== null && Math.abs(a - b) <= 2;   // 1원 반올림 차이 허용

const 원 = (usd) => {
  const won = Math.round(usd * 1500);
  const sign = won > 0 ? "+" : won < 0 ? "-" : "";
  return sign + Math.abs(won).toLocaleString("ko-KR") + "원";
};

async function 문장(opts, t) {
  const b = boot(opts);
  b.bus.emit("trading:persisted", { closedTrades: [t], feeRate: 수수료 });
  await sleep(60);
  return b.sent.length ? b.sent[0].message : "";
}

(async function run() {
  console.log("\n채팅 청산 알림 — 진입 수수료");

  /* ---------- [1] 금액 ---------- */
  {
    // 100배 · 증거금 1,000 · 100,000 -> 100,200 (long)
    const t = 거래({ entry: 100000, exit: 100200, qty: 1, margin: 1000 });
    const m = await 문장({}, t);
    ok("진입 수수료를 뺀 금액으로 말한다", 가깝나(금액추출(m), t._실제지갑증가 * 1500),
      m + "  (기대 " + 원(t._실제지갑증가) + ")");
    ok("보정 전 금액(t.pnl)은 쓰지 않는다", !가깝나(금액추출(m), t.pnl * 1500),
      "t.pnl " + 원(t.pnl) + " 이 그대로 나갔습니다: " + m);
    ok("이익이면 익절이라고 적는다", m.indexOf("익절") !== -1, m);
  }

  /* ---------- [2] 익절/손절 경계 — 제일 중요한 것 ---------- */
  {
    /* 총손익 70 · 청산수수료 50.035 -> t.pnl = +19.965 (옛 코드는 "익절")
       진입수수료 50 을 빼면 -30.035 -> 실제로는 돈이 줄었습니다 */
    const t = 거래({ entry: 100000, exit: 100070, qty: 1, margin: 1000 });
    const m = await 문장({}, t);
    ok("t.pnl 이 양수인 상황을 실제로 만들었다", t.pnl > 0, String(t.pnl));
    ok("실제 지갑은 줄어든 상황이다", t._실제지갑증가 < 0, String(t._실제지갑증가));
    ok("손해를 익절이라고 말하지 않는다", m.indexOf("익절") === -1, m);
    ok("손절이라고 적는다", m.indexOf("손절") !== -1, m);
    ok("금액도 마이너스로 적는다",
      금액추출(m) < 0 && 가깝나(금액추출(m), t._실제지갑증가 * 1500),
      m + "  (기대 " + 원(t._실제지갑증가) + ")");
  }

  /* ---------- [3] 강제청산 ---------- */
  {
    /* 강제청산은 trading.js 가 fee 에 진입 수수료만 담고 pnl 은 -증거금 입니다.
       실제 손실은 증거금 + 진입수수료 라서, 옛 문구는 손실을 적게 말했습니다. */
    const t = {
      side: "short", leverage: 100, entry: 100000, exit: 101000, qty: 1, margin: 1000,
      pnl: -1000, fee: 50, reason: "강제청산", closeTime: 앞으로(10),
    };
    const m = await 문장({}, t);
    ok("강제청산도 알린다", m.indexOf("강제청산") !== -1, m);
    ok("강제청산 손실에 진입 수수료가 들어 있다", 가깝나(금액추출(m), -1050 * 1500),
      m + "  (기대 " + 원(-1050) + ")");
    ok("증거금만 말하지 않는다", !가깝나(금액추출(m), -1000 * 1500), m);
  }

  /* ---------- [4] 보정 모듈이 없을 때 ---------- */
  {
    const t = 거래({ entry: 100000, exit: 100200, qty: 1, margin: 1000, closeTime: 앞으로(20) });
    const m = await 문장({ 보정모듈: false }, t);
    ok("보정 모듈이 없으면 옛 동작 그대로", 가깝나(금액추출(m), t.pnl * 1500),
      m + "  (기대 " + 원(t.pnl) + ")");
    /* 보정 모듈이 없다고 조용히 0 원으로 만들면 그것도 거짓말입니다.
       문장 자체가 안 나가는 것도 안 됩니다(청산을 아무도 모르게 됩니다). */
    ok("조용히 0 원으로 만들지 않는다", m !== "" && 금액추출(m) !== 0, m);
  }

  /* ---------- [5] 값을 두 벌 만들지 않는다 ---------- */
  {
    ok("보정 모듈의 entryFeeOf 를 그대로 쓴다",
      /App\.RealizedPnlFix/.test(CHAT_SRC) && /entryFeeOf\s*\(/.test(CHAT_SRC),
      "채팅 파일이 App.RealizedPnlFix.entryFeeOf 를 부르지 않습니다");
    ok("진입 수수료를 여기서 새로 계산하지 않는다",
      CHAT_SRC.indexOf("0.0005") === -1 && !/qty\s*\*/.test(CHAT_SRC),
      "채팅 파일 안에 수수료 계산이 생겼습니다 — 같은 값이 두 벌이 됩니다");
    ok("금액을 t.pnl 로 직접 만들지 않는다",
      CHAT_SRC.indexOf("formatKrwSigned(t.pnl)") === -1, "formatKrwSigned(t.pnl) 이 남아 있습니다");
    ok("익절/손절 판정을 t.pnl 로 하지 않는다",
      !/if\s*\(\s*t\.pnl\s*>=\s*0\s*\)/.test(CHAT_SRC), "if (t.pnl >= 0) 이 남아 있습니다");
  }

  /* ---------- [6] 펀딩비는 이 금액에 ★안 들어갑니다★ (2026-09-02 기록) ----------
   * 고치라는 뜻이 아니라 ★지금 이렇다★ 는 사실을 남기는 것입니다.
   *
   * js/trading.js 는 펀딩비를 지갑에서 ★바로★ 빼고(state.balance · 361행)
   * state.fundingHistory 에 따로 적습니다(364행). 거래기록 t 에는 펀딩비 칸
   * 자체가 없습니다. 그래서 포지션을 오래 들고 있어 펀딩비를 낸 회원은
   * ★채팅이 말한 금액과 실제 지갑 변화가 다릅니다.★
   *
   * 나중에 '채팅 금액에 펀딩비까지 넣자' 로 정하면 이 검사가 터지면서
   * ★이제 기준을 바꿔야 한다★ 고 알려줍니다. 그때 [6] 을 새 기준으로 고칩니다.
   */
  {
    const t1 = 거래({ entry: 100000, exit: 100200, qty: 1, margin: 1000, closeTime: 앞으로(30) });
    const 기본 = 금액추출(await 문장({}, t1));

    const t2 = Object.assign(
      거래({ entry: 100000, exit: 100200, qty: 1, margin: 1000, closeTime: 앞으로(40) }),
      { fundingFee: -300, funding: -300, fundingPaid: -300 }
    );
    const 펀딩있음 = 금액추출(await 문장({}, t2));

    ok("[기록] 거래기록에 펀딩비를 붙여도 채팅 금액은 그대로다 — 펀딩비는 안 들어갑니다",
      기본 !== null && 가깝나(펀딩있음, 기본),
      "펀딩비 없음 " + 기본 + " vs 펀딩비 -300 " + 펀딩있음);
    ok("[기록] 채팅 파일이 펀딩비를 아예 안 본다",
      CHAT_SRC.indexOf("funding") === -1 && CHAT_SRC.indexOf("펀딩") === -1,
      "채팅 파일에 펀딩비가 생겼습니다 — [6] 을 새 기준으로 바꾸세요");
    ok("[기록] 진입 수수료 보정 모듈도 펀딩비를 안 본다",
      FIX_SRC.indexOf("funding") === -1 && FIX_SRC.indexOf("펀딩") === -1,
      "보정 모듈에 펀딩비가 생겼습니다 — [6] 을 새 기준으로 바꾸세요");
  }

  /* ---------- 손대면 안 되는 것 ---------- */
  {
    const crypto = require("crypto");
    const md5 = (f) => crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
    const LOCKED = require("./_locked-hashes.js");
    ok("trading.js 를 건드리지 않았다", md5("trading.js") === LOCKED.TRADING, md5("trading.js"));
    ok("ui.js 를 건드리지 않았다", md5("ui.js") === "333fc427e75b47b306699c92aa4e7b50", md5("ui.js"));
    ok("chat.js 를 건드리지 않았다", md5("chat.js") === "a93dfaa7f82ce72a914b270acb3650bb", md5("chat.js"));
    ok("supabase-sync.js 를 건드리지 않았다",
      md5("supabase-sync.js") === "faddcbbc34b5165177ff26cb978040f8", md5("supabase-sync.js"));
  }

  /* ---------- 등록 확인 ---------- */
  {
    const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
    ok("이 파일이 tests/_order.txt 에 등록돼 있다",
      order.indexOf("tests/chat-event-entry-fee.test.js") !== -1,
      "등록 안 하면 npm test 가 안 돌립니다");
  }

  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음"); process.exit(1); }
  console.log("전체 통과");
  process.exit(0);
})();
