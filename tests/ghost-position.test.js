/* tests/ghost-position.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — "유령 청산". (P1)
 *
 * 대표님이 겪은 그대로:
 *   "오늘 주문 안 넣음. 주문하려고 했는데 포지션이 있대.
 *    근데 내 화면에는 포지션 없었거든. 어제 청산당해서.
 *    그래서 새로고침했더니 채팅창에 청산당했다고 뜨면서"
 *
 * 어제 청산된 포지션 행이 서버 positions 에 남아 있다가, 새로고침 때
 * js/auth.js 가 복원하고 js/trading.js 가 첫 시세에 강제청산합니다.
 * 회원은 넣지도 않은 주문으로 증거금을 통째로 잃습니다.
 *
 * 두 갈래로 막습니다.
 *   (A) js/ghost-position-guard.js  — 복원 단계에서 유령을 걸러낸다
 *   (B) js/persist-sync-queue.js    — 애초에 서버에 남지 않게 한다
 *       (supabase-sync.js 172행 `if (syncing) return;` 이 청산 이벤트를 버림)
 *
 * ★ 이 테스트가 특히 못 박는 것 — "진짜 포지션을 지우면 회원 돈이 날아갑니다"
 *   (1) 부분청산 뒤 살아 있는 포지션을 지우지 않는다.
 *       js/trading.js 414행 closePartial(ratio<1) 은 거래를 기록하면서도
 *       포지션을 남깁니다. 시간만 비교하면 이걸 유령으로 오판합니다.
 *   (2) 진입가/방향이 다르면 지우지 않는다 (기기 시계가 어긋난 경우 보호).
 *   (3) 부팅 뒤에는 아예 검사하지 않는다 — 회원이 방금 연 포지션은 무사.
 *   (4) 잔고·거래내역·주문내역을 건드리지 않는다.
 *   (5) 지운 것은 되살릴 수 있게 남긴다.
 *   (6) 큐가 'trading:persisted' 를 다시 방송하지 않는다 (구독자 17곳 / 채팅 도배 사고).
 *   (7) 큐가 payload 를 바꾸지 않는다 (같은 사고의 원인이었음).
 *   (8) 수정 금지 파일 12개를 안 건드린다.
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const REPO = process.env.REPO || path.resolve(__dirname, "..");

/* ---------- 가짜 App 환경 ---------- */
function freshEnv() {
  const store = {};
  const listeners = {};
  const App = {
    Storage: {
      save(key, data) { store[key] = JSON.parse(JSON.stringify(data)); return true; },
      load(key) { return store[key] === undefined ? null : store[key]; },
    },
    Bus: {
      on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); return fn; },
      emit(e, p) { (listeners[e] || []).forEach((f) => f(p)); },
    },
    bootApp() { App.__booted = true; },
  };
  global.window = global;
  global.App = App;
  return { App, store, listeners };
}

function loadModule(rel) {
  delete require.cache[require.resolve(path.join(REPO, rel))];
  return require(path.join(REPO, rel));
}

/* ---------- 표본 데이터 ---------- */
const T0 = 1756000000000;                      // 포지션을 연 시각
const GHOST_POS = {
  side: "long", entry: 61234.5, qty: 0.5, margin: 1000,
  leverage: 10, liq: 55111.1, tp: null, sl: null, entryFee: 3.06,
  openTime: T0,
};
const CLOSING_TRADE = {                        // 이 포지션을 실제로 닫은 거래
  side: "long", entry: 61234.5, exit: 60000, qty: 0.5, margin: 1000,
  leverage: 10, pnl: -620, pnlPercent: -62, fee: 6.1,
  reason: "강제청산", closeTime: T0 + 3600 * 1000,
};

function snap(over) {
  return Object.assign({
    balance: 99000, leverage: 10,
    position: JSON.parse(JSON.stringify(GHOST_POS)),
    pendingOrder: null,
    orderHistory: [{ id: "o1", side: "long" }],
    closedTrades: [JSON.parse(JSON.stringify(CLOSING_TRADE))],
    fundingHistory: [], lastSettledFundingTime: null,
  }, over || {});
}

/* =====================================================================
 * (A) 유령 걸러내기
 * ===================================================================== */
console.log("\n[A] 유령 포지션 걸러내기");
{
  const { App, store } = freshEnv();
  const G = loadModule("js/ghost-position-guard.js");

  ok("App.Storage.save 를 감쌌다", App.Storage.__ghostGuarded === true);
  ok("복원 구간에서는 켜져 있다", G.isArmed() === true);

  const before = snap();
  App.Storage.save("trading", before);
  const saved = store["trading"];

  ok("유령 포지션이 걸러졌다 (복원돼도 강제청산이 안 일어난다)", saved.position === null,
     JSON.stringify(saved.position));
  ok("걸러낸 건수가 1 이다", G.getRemovedCount() === 1);

  /* (4) 다른 값은 그대로 */
  ok("잔고를 안 건드렸다", saved.balance === 99000, String(saved.balance));
  ok("거래내역을 안 건드렸다", saved.closedTrades.length === 1);
  ok("주문내역을 안 건드렸다", saved.orderHistory.length === 1);
  ok("레버리지를 안 건드렸다", saved.leverage === 10);

  /* (5) 되살릴 수 있게 남겼다 */
  const rec = store[G.RECOVERY_KEY];
  ok("지운 포지션을 복구용으로 남겼다", !!rec && !!rec.position, JSON.stringify(rec));
  ok("복구본이 원래 포지션과 같다", !!rec && rec.position.entry === GHOST_POS.entry &&
     rec.position.openTime === GHOST_POS.openTime);
  ok("무엇이 닫았는지도 같이 남겼다", !!rec && rec.closedByTrade.reason === "강제청산");

  /* 원본 객체를 훼손하지 않았다 */
  ok("넘겨받은 원본 객체는 그대로다 (다른 구독자 보호)", before.position !== null);
}

/* =====================================================================
 * 진짜 포지션은 절대 지우지 않는다 — 여기가 제일 중요합니다
 * ===================================================================== */
console.log("\n[A-안전] 진짜 포지션을 지우지 않는가");
{
  const { App, store } = freshEnv();
  loadModule("js/ghost-position-guard.js");

  /* (1) 부분청산 — 포지션이 살아 있는데 더 최근 거래가 있다 */
  const partial = snap({
    closedTrades: [Object.assign({}, CLOSING_TRADE, { reason: "부분청산" })],
  });
  App.Storage.save("trading", partial);
  ok("부분청산 뒤 살아 있는 포지션을 지우지 않는다 (돈이 날아갈 뻔한 경우)",
     store["trading"].position !== null);

  /* (2) 진입가가 다르다 = 다른 포지션을 닫은 거래 */
  const otherEntry = snap({
    closedTrades: [Object.assign({}, CLOSING_TRADE, { entry: 59000 })],
  });
  App.Storage.save("trading", otherEntry);
  ok("진입가가 다르면 지우지 않는다 (기기 시계 어긋남 보호)",
     store["trading"].position !== null);

  /* (2') 방향이 다르다 */
  const otherSide = snap({
    closedTrades: [Object.assign({}, CLOSING_TRADE, { side: "short" })],
  });
  App.Storage.save("trading", otherSide);
  ok("방향이 다르면 지우지 않는다", store["trading"].position !== null);

  /* 거래가 포지션보다 과거 = 정상적인 새 포지션 */
  const older = snap({
    closedTrades: [Object.assign({}, CLOSING_TRADE, { closeTime: T0 - 60000 })],
  });
  App.Storage.save("trading", older);
  ok("청산이 포지션보다 과거면 지우지 않는다 (정상적인 새 포지션)",
     store["trading"].position !== null);

  /* 거래가 하나도 없다 = 판단 불가 */
  const noTrades = snap({ closedTrades: [] });
  App.Storage.save("trading", noTrades);
  ok("거래 기록이 없으면 판단하지 않고 그대로 둔다", store["trading"].position !== null);

  /* openTime 이 없다 = 판단 불가 */
  const noTime = snap({ position: Object.assign({}, GHOST_POS, { openTime: undefined }) });
  App.Storage.save("trading", noTime);
  ok("포지션에 시각 정보가 없으면 판단하지 않고 그대로 둔다",
     store["trading"].position !== null);

  /* 시간 차이가 아주 작다 = 흔들림일 수 있다 */
  const tiny = snap({
    closedTrades: [Object.assign({}, CLOSING_TRADE, { closeTime: T0 + 500 })],
  });
  App.Storage.save("trading", tiny);
  ok("시간 차이가 2초 이하면 지우지 않는다", store["trading"].position !== null);
}

/* (3) 부팅 뒤에는 검사 자체를 하지 않는다 */
console.log("\n[A-범위] 부팅 뒤에는 아예 동작하지 않는가");
{
  const { App, store } = freshEnv();
  const G = loadModule("js/ghost-position-guard.js");

  ok("App.bootApp 을 감쌌다", App.bootApp.__ghostDisarm === true);
  App.bootApp();                       // 부팅 = 복원 구간 종료
  ok("부팅하면 검사가 꺼진다", G.isArmed() === false);
  ok("원래 bootApp 이 그대로 불린다", App.__booted === true);

  App.Storage.save("trading", snap());  // 유령과 똑같은 모양이지만
  ok("부팅 뒤에는 유령 모양이어도 건드리지 않는다 (회원이 방금 연 포지션 보호)",
     store["trading"].position !== null);
  ok("부팅 뒤에는 걸러낸 건수가 안 늘어난다", G.getRemovedCount() === 0);
}

/* 다른 저장 키는 건드리지 않는다 */
{
  const { App, store } = freshEnv();
  loadModule("js/ghost-position-guard.js");
  App.Storage.save("other", snap());
  ok("'trading' 이 아닌 키는 검사하지 않는다", store["other"].position !== null);
}

/* =====================================================================
 * (B) 청산 이벤트가 버려지지 않게
 * ===================================================================== */
console.log("\n[B] 청산 이벤트가 버려지지 않는가");

/* js/supabase-sync.js 의 구조를 그대로 흉내낸 가짜 동기화기.
   이름까지 같아야 큐가 집어냅니다(onTradingPersisted). */
function makeFakeSync(applied, delayMs) {
  let syncing = false;
  async function onTradingPersisted(snapshot) {
    if (syncing) return;                    // <-- 원본 172행
    syncing = true;
    try {
      await new Promise((r) => setTimeout(r, delayMs));
      applied.push(snapshot.tag);
    } finally {
      syncing = false;
    }
  }
  return onTradingPersisted;
}

(async () => {
  /* 고치기 전 — 겹쳐 들어오면 버려진다 */
  {
    const { App } = freshEnv();
    const applied = [];
    App.Bus.on("trading:persisted", makeFakeSync(applied, 30));
    App.Bus.emit("trading:persisted", { tag: "진입" });
    App.Bus.emit("trading:persisted", { tag: "청산" });   // 겹침
    await new Promise((r) => setTimeout(r, 200));
    ok("[고치기 전] 청산 이벤트가 버려진다 (문제 재현)",
       applied.length === 1 && applied[0] === "진입", JSON.stringify(applied));
  }

  /* 고친 뒤 — 줄을 서서 마지막 상태가 반드시 반영된다 */
  let Q;
  {
    const { App } = freshEnv();
    Q = loadModule("js/persist-sync-queue.js");
    const applied = [];
    App.Bus.on("trading:persisted", makeFakeSync(applied, 30));
    ok("큐가 supabase-sync 의 구독 함수를 집어냈다", Q.isAttached() === true);

    App.Bus.emit("trading:persisted", { tag: "진입" });
    App.Bus.emit("trading:persisted", { tag: "청산" });   // 겹침
    await new Promise((r) => setTimeout(r, 300));
    ok("[고친 뒤] 청산 상태가 서버에 반영된다",
       applied[applied.length - 1] === "청산", JSON.stringify(applied));
    ok("겹쳐 들어온 건수를 셌다", Q.getQueuedCount() >= 1, String(Q.getQueuedCount()));
    ok("원본이 겹쳐서 불리지 않았다", applied.length <= 2, JSON.stringify(applied));
  }

  /* 여러 번 몰아쳐도 마지막이 반영된다 */
  {
    const { App } = freshEnv();
    loadModule("js/persist-sync-queue.js");
    const applied = [];
    App.Bus.on("trading:persisted", makeFakeSync(applied, 10));
    for (let i = 1; i <= 8; i++) App.Bus.emit("trading:persisted", { tag: "s" + i });
    await new Promise((r) => setTimeout(r, 400));
    ok("8번 몰아쳐도 마지막 상태가 반영된다",
       applied[applied.length - 1] === "s8", JSON.stringify(applied));
  }

  /* (6)(7) 다른 구독자 보호 */
  {
    const { App } = freshEnv();
    loadModule("js/persist-sync-queue.js");
    const applied = [];
    const seen = [];
    App.Bus.on("trading:persisted", makeFakeSync(applied, 10));
    /* 채팅처럼 payload 를 보는 다른 구독자 */
    function otherSubscriber(p) { seen.push(p); }
    App.Bus.on("trading:persisted", otherSubscriber);

    const payload = { tag: "x", closedTrades: [1, 2, 3] };
    App.Bus.emit("trading:persisted", payload);
    App.Bus.emit("trading:persisted", payload);
    await new Promise((r) => setTimeout(r, 200));

    ok("다른 구독자는 방송된 횟수만큼만 받는다 (다시 방송하지 않는다)",
       seen.length === 2, "받은 횟수 " + seen.length);
    ok("다른 구독자가 받은 payload 가 원본 그대로다", seen[0] === payload);
    ok("payload 의 closedTrades 를 건드리지 않았다",
       payload.closedTrades.length === 3);
  }

  /* 이름이 다른 구독자는 감싸지 않는다 */
  {
    const { App } = freshEnv();
    const Q2 = loadModule("js/persist-sync-queue.js");
    function somethingElse() {}
    const returned = App.Bus.on("trading:persisted", somethingElse);
    ok("supabase-sync 가 아닌 구독자는 그대로 등록된다", returned === somethingElse);
    ok("그 경우 큐는 붙지 않는다", Q2.isAttached() === false);
  }

  /* ---------- 소스 수준 검사 ---------- */
  console.log("\n[C] 소스 검사 — 우회 구조가 유지되는가");

  const syncSrc = fs.readFileSync(path.join(REPO, "js/supabase-sync.js"), "utf8");
  ok("supabase-sync.js 에 onTradingPersisted 이름이 그대로 있다 (큐가 이 이름으로 찾는다)",
     /async function onTradingPersisted\s*\(/.test(syncSrc));
  ok("supabase-sync.js 가 그 함수를 trading:persisted 에 등록한다",
     /App\.Bus\.on\(\s*["']trading:persisted["']\s*,\s*onTradingPersisted\s*\)/.test(syncSrc));
  ok("supabase-sync.js 에 버리는 코드가 아직 있다 (그래서 우회가 필요하다)",
     /if\s*\(syncing\)\s*return;/.test(syncSrc));

  const guardSrc = fs.readFileSync(path.join(REPO, "js/ghost-position-guard.js"), "utf8");
  const queueSrc = fs.readFileSync(path.join(REPO, "js/persist-sync-queue.js"), "utf8");
  const guardCode = guardSrc.replace(/\/\*[\s\S]*?\*\//g, "");
  const queueCode = queueSrc.replace(/\/\*[\s\S]*?\*\//g, "");

  ok("(6) 큐가 App.Bus.emit 을 부르지 않는다 (구독자 17곳 / 채팅 200번 도배 사고)",
     !/Bus\.emit/.test(queueCode));
  ok("(7) 큐가 payload 를 만들거나 바꾸지 않는다",
     !/closedTrades\s*=/.test(queueCode));
  ok("걸러내기가 잔고를 건드리지 않는다", !/\.balance\s*=/.test(guardCode));
  ok("걸러내기가 거래내역을 건드리지 않는다", !/closedTrades\s*=/.test(guardCode));
  ok("걸러내기가 서버에 직접 쓰지 않는다 (supabase 호출 없음)",
     !/from\(["']positions["']\)|\.delete\(/.test(guardCode));

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  ok("index.html 이 걸러내기를 불러온다", /<script src="js\/ghost-position-guard\.js">/.test(html));
  ok("index.html 이 큐를 불러온다", /<script src="js\/persist-sync-queue\.js">/.test(html));
  const posMain = html.indexOf('src="main.js"');
  const posStorage = html.indexOf('src="js/storage.js"');
  const posGuard = html.indexOf('src="js/ghost-position-guard.js"');
  const posQueue = html.indexOf('src="js/persist-sync-queue.js"');
  ok("걸러내기가 storage.js 뒤에 온다 (App.Storage 가 있어야 감싼다)", posGuard > posStorage);
  ok("큐가 main.js 뒤에 온다 (App.Bus 가 있어야 감싼다)", posQueue > posMain);

  /* (8) 수정 금지 12개 */
  const FORBIDDEN = [
    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
    "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
    "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
  ];
  const HASHES = {
    "js/trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
    "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "js/auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    "js/supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
    "js/chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "js/leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "js/admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
    "js/season.js": "9c5fbf13ced09ca2f348e48f87c78224",
    "js/board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
    "js/orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "js/chart.js": "02ddcb000d577131f797143d08c09123",
    "js/websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  const crypto = require("crypto");
  let mismatch = [];
  FORBIDDEN.forEach((f) => {
    const buf = fs.readFileSync(path.join(REPO, f));
    const md5 = crypto.createHash("md5").update(buf).digest("hex");
    if (md5 !== HASHES[f]) mismatch.push(f);
  });
  ok("(8) 수정 금지 파일 12개가 그대로다", mismatch.length === 0, mismatch.join(", "));

  /* ---------- 돌연변이 검사 ---------- */
  console.log("\n[D] 돌연변이 검사 — 되돌리면 정말 실패하는가");
  {
    /* 부분청산 제외를 없애면? */
    const noPartial = guardCode.replace(/if \(trade\.reason === PARTIAL_REASON\) return false;/, "");
    ok("'부분청산 제외' 돌연변이를 만들었다", noPartial !== guardCode);
    ok("-> 제외가 사라지면 소스 검사로 잡힌다",
       !/PARTIAL_REASON\) return false/.test(noPartial));

    /* 신원 증거(진입가)를 없애면? */
    const noEntry = guardCode.replace(/if \(!sameEntry\(trade\.entry, position\.entry\)\) return false;/, "");
    ok("'진입가 검사 제거' 돌연변이를 만들었다", noEntry !== guardCode);
    ok("-> 진입가 검사가 사라지면 소스 검사로 잡힌다", !/sameEntry\(trade\.entry/.test(noEntry));

    /* 큐가 다시 방송하게 만들면? */
    const reemit = queueCode.replace("drain();", "App.Bus.emit(EVENT, snapshot); drain();");
    ok("'다시 방송' 돌연변이를 만들었다", reemit !== queueCode);
    ok("-> 다시 방송하면 (6) 검사가 실패한다", /Bus\.emit/.test(reemit));
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail === 0) {
    console.log("전체 통과 ✅");
    process.exit(0);
  } else {
    console.log("실패 있음 ❌");
    process.exit(1);
  }
})();
