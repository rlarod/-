/* tests/ghost-position-seal.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 봉인하나 — 2026-08-26 에 고친 P1 "유령 포지션" 판정을 봉인합니다.
 *
 * 증상(대표님 겪은 그대로): 어제 청산된 포지션이 새로고침하면 되살아나
 * 첫 시세에 강제청산됩니다. 넣지도 않은 주문으로 증거금이 날아갑니다.
 *
 * js/ghost-position-guard.js 는 **셋을 전부 만족할 때만** 유령으로 봅니다.
 *
 *   (1) 전체청산이다              reason !== "부분청산"
 *   (2) 포지션보다 2초 넘게 나중이다  closeTime - openTime > 2000
 *   (3) 방향과 진입가가 같다        side 일치 + entry 일치
 *
 * ★ 이 셋이 왜 셋 다 필요한지가 이 테스트의 전부입니다.
 *   처음 잡았던 기준은 "전체청산 기록이 있으면 유령" 이었습니다.
 *   그 기준이었으면 **살아 있는 포지션을 지웠을 겁니다** —
 *   js/trading.js 414행 closePartial(ratio<1) 은 거래를 기록하면서도
 *   포지션을 그대로 남기기 때문입니다(openTime 도 안 바뀝니다).
 *   판정이 느슨해지는 쪽으로 되돌아가면 **회원 포지션이 지워집니다.**
 *
 * ── 다른 테스트와 뭐가 다른가 ────────────────────────────────────
 * tests/ghost-position.test.js 는 "지금 코드가 옳게 동작하는가" 를 봅니다.
 * 이 파일은 거기에 더해 **판정을 일부러 느슨하게 만든 판을 메모리에서 돌려
 * 진짜 포지션이 지워지는지** 확인합니다(⑥ 돌연변이). 즉 검사 하나하나가
 * 실제로 무엇을 지키고 있는지를 숫자로 증명합니다.
 * 원본 js/*.js 는 한 글자도 건드리지 않습니다 — 소스를 읽어 문자열만
 * 바꿔 vm 샌드박스에서 돌립니다.
 *
 * 못 박는 것
 *   ① 판정이 느슨해지면 실패한다 (세 조건 각각)
 *   ② 부팅 뒤에는 검사가 꺼진다 (armed:false)
 *   ③ 지운 것은 localStorage 의 "ghost-position-removed" 에 남는다
 *   ④ 청산 이벤트가 버려지지 않는다 (js/persist-sync-queue.js)
 *   ⑤ 수정 금지 12개 파일 md5
 *   ⑥ 돌연변이 자체검증 — 조건을 빼면 진짜 포지션이 지워지는 것을 확인
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}

const GUARD_PATH = path.join(REPO, "js", "ghost-position-guard.js");
const QUEUE_PATH = path.join(REPO, "js", "persist-sync-queue.js");
const STORAGE_PATH = path.join(REPO, "js", "storage.js");

const GUARD_SRC = fs.readFileSync(GUARD_PATH, "utf8");
const QUEUE_SRC = fs.readFileSync(QUEUE_PATH, "utf8");
const STORAGE_SRC = fs.readFileSync(STORAGE_PATH, "utf8");

/* =====================================================================
 * 판 만들기 — 진짜 js/storage.js 위에 걸러내기를 올린다
 *
 * 진짜 storage.js 를 같이 올리는 이유: 백업이 실제로 localStorage 의
 * 어떤 열쇠(key)로 들어가는지까지 봉인하기 위해서입니다.
 * (storage.js 가 "btc_sim_v2_" 접두어를 붙입니다)
 * ===================================================================== */
function 판(guardSource) {
  const ls = Object.create(null);
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: function () { return 0; },
    clearInterval: function () {},
    Promise: Promise,
  };
  ctx.window = ctx;
  ctx.localStorage = {
    setItem(k, v) { ls[k] = String(v); },
    getItem(k) { return Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null; },
    removeItem(k) { delete ls[k]; },
  };
  vm.createContext(ctx);
  vm.runInContext(STORAGE_SRC, ctx, { filename: "js/storage.js" });
  /* 걸러내기가 감쌀 대상. 이게 있어야 init() 이 setInterval 로 안 새어나갑니다. */
  ctx.App.bootApp = function () { ctx.App.__booted = true; };
  vm.runInContext(guardSource, ctx, { filename: "js/ghost-position-guard.js" });
  return {
    App: ctx.App,
    G: ctx.App.GhostPositionGuard,
    ls: ls,
    읽기(key) {
      const raw = ls["btc_sim_v2_" + key];
      return raw == null ? null : JSON.parse(raw).state;
    },
  };
}

/* ---------- 표본 ----------
 * 실제 값 모양 그대로 씁니다(진입가는 소수점까지 있는 실수). */
const T0 = 1756000000000;                       // 포지션을 연 시각
const 한시간 = 3600 * 1000;

function 포지션(over) {
  return Object.assign({
    side: "long", entry: 61234.5, qty: 0.5, margin: 1000,
    leverage: 10, liq: 55111.1, tp: null, sl: null, entryFee: 3.06,
    openTime: T0,
  }, over || {});
}
function 거래(over) {
  return Object.assign({
    side: "long", entry: 61234.5, exit: 60000, qty: 0.5, margin: 1000,
    leverage: 10, pnl: -620, pnlPercent: -62, fee: 6.1,
    reason: "강제청산", closeTime: T0 + 한시간,
  }, over || {});
}
function 스냅(pos, trades) {
  return {
    balance: 99000, leverage: 10,
    position: pos, pendingOrder: null,
    orderHistory: [{ id: "o1", side: "long" }],
    closedTrades: trades,
    fundingHistory: [], lastSettledFundingTime: null,
  };
}

/* 이 판에 이 스냅샷을 저장하면 포지션이 지워지는가 */
function 지워지나(guardSource, pos, trades) {
  const 판본 = 판(guardSource);
  판본.App.Storage.save("trading", 스냅(pos, trades));
  const saved = 판본.읽기("trading");
  return { 지워짐: saved.position === null, 판본: 판본, saved: saved };
}

/* ---------- 다섯 가지 상황 ----------
 * 첫 줄만 유령이고 나머지 넷은 전부 "살아 있는 포지션" 입니다.
 * 넷 중 하나라도 지워지면 회원 돈이 날아갑니다. */
const 상황 = {
  "진짜 유령 (전체청산·1시간 뒤·같은 방향/진입가)": {
    pos: 포지션(), trades: [거래()], 유령: true,
  },
  "부분청산만 있고 포지션은 살아 있다": {
    pos: 포지션(), trades: [거래({ reason: "부분청산" })], 유령: false,
  },
  "진입가가 다르다 (다른 기기 시계가 빠른 경우)": {
    pos: 포지션(), trades: [거래({ entry: 61000.25 })], 유령: false,
  },
  "방향이 다르다": {
    pos: 포지션(), trades: [거래({ side: "short" })], 유령: false,
  },
  "청산 기록이 포지션 연 지 2초 이내다": {
    pos: 포지션(), trades: [거래({ closeTime: T0 + 1500 })], 유령: false,
  },
};

console.log("\n유령 포지션 판정 봉인 (2026-08-26 P1)");

/* =====================================================================
 * ① 판정 — 셋을 전부 만족할 때만 지운다
 * ===================================================================== */
console.log("\n① 판정 — 세 조건을 전부 만족할 때만 유령이다");
{
  for (const 이름 of Object.keys(상황)) {
    const s = 상황[이름];
    const r = 지워지나(GUARD_SRC, s.pos, s.trades);
    if (s.유령) {
      ok("지운다: " + 이름, r.지워짐, "유령인데 안 지워졌습니다");
    } else {
      ok("안 지운다: " + 이름, !r.지워짐,
        "살아 있는 포지션을 지웠습니다 — 회원 증거금이 날아갑니다");
    }
  }

  /* 지울 때도 다른 값은 한 글자도 안 건드립니다. */
  const r = 지워지나(GUARD_SRC, 포지션(), [거래()]);
  ok("지울 때 잔고를 안 건드린다", r.saved.balance === 99000, String(r.saved.balance));
  ok("지울 때 거래내역을 안 건드린다", r.saved.closedTrades.length === 1);
  ok("지울 때 주문내역을 안 건드린다", r.saved.orderHistory.length === 1);
  ok("지울 때 레버리지를 안 건드린다", r.saved.leverage === 10);

  /* 증거가 모자라면 판단하지 않고 그대로 둡니다. */
  ok("포지션에 연 시각이 없으면 판단하지 않는다",
    !지워지나(GUARD_SRC, 포지션({ openTime: undefined }), [거래()]).지워짐);
  ok("거래 기록이 아예 없으면 판단하지 않는다",
    !지워지나(GUARD_SRC, 포지션(), []).지워짐);

  /* 상수 자체도 봉인합니다 — 2초를 0 으로 줄이면 시각 흔들림에 오판합니다. */
  const G = 판(GUARD_SRC).G;
  ok("여유 시간이 2초 그대로다 (TOLERANCE_MS)", G.TOLERANCE_MS === 2000, String(G.TOLERANCE_MS));
  ok("백업 열쇠 이름이 그대로다", G.RECOVERY_KEY === "ghost-position-removed", String(G.RECOVERY_KEY));
}

/* =====================================================================
 * ② 부팅 뒤에는 검사가 꺼진다
 *
 * 이 세션에서 회원이 직접 연 포지션은 절대 검사를 거치면 안 됩니다.
 * js/auth.js 는 hydrate -> bootOnce 순서라 복원 저장은 항상 부팅 전입니다.
 * ===================================================================== */
console.log("\n② 부팅 뒤에는 꺼진다 (이 세션에서 연 포지션 보호)");
{
  const p = 판(GUARD_SRC);
  ok("복원 구간에서는 켜져 있다", p.G.isArmed() === true);

  p.App.bootApp();
  ok("부팅하면 꺼진다 (armed:false)", p.G.isArmed() === false);
  ok("원래 bootApp 이 그대로 불린다", p.App.__booted === true);

  const before = p.G.getRemovedCount();
  p.App.Storage.save("trading", 스냅(포지션(), [거래()]));
  ok("부팅 뒤에는 유령 모양이어도 안 지운다", p.읽기("trading").position !== null,
    "이 세션에서 연 포지션이 지워졌습니다");
  ok("부팅 뒤에는 걸러낸 건수가 안 늘어난다", p.G.getRemovedCount() === before);

  /* 'trading' 이 아닌 열쇠는 아예 보지 않습니다. */
  const q = 판(GUARD_SRC);
  q.App.Storage.save("settings", 스냅(포지션(), [거래()]));
  ok("'trading' 이 아닌 열쇠는 검사하지 않는다", q.읽기("settings").position !== null);
}

/* =====================================================================
 * ③ 지운 것은 되살릴 수 있게 남는다
 * ===================================================================== */
console.log("\n③ 백업 — localStorage 의 ghost-position-removed");
{
  const p = 판(GUARD_SRC);
  p.App.Storage.save("trading", 스냅(포지션(), [거래()]));

  const 열쇠들 = Object.keys(p.ls);
  const 백업열쇠 = 열쇠들.filter((k) => /ghost-position-removed$/.test(k));
  ok("백업 열쇠가 localStorage 에 실제로 생겼다", 백업열쇠.length === 1, 열쇠들.join(", "));
  ok("열쇠 이름이 btc_sim_v2_ghost-position-removed 다 (storage.js 접두어 포함)",
    백업열쇠[0] === "btc_sim_v2_ghost-position-removed", String(백업열쇠[0]));

  const 백업 = p.읽기("ghost-position-removed");
  ok("백업 안에 지운 포지션이 통째로 들어 있다", !!백업 && !!백업.position);
  ok("진입가가 원본과 같다", !!백업 && 백업.position.entry === 61234.5);
  ok("연 시각이 원본과 같다", !!백업 && 백업.position.openTime === T0);
  ok("무엇이 닫았는지도 같이 남는다", !!백업 && 백업.closedByTrade.reason === "강제청산");
  ok("언제 지웠는지도 남는다", !!백업 && typeof 백업.removedAt === "number");

  /* 넘겨받은 원본 객체는 건드리지 않습니다(다른 구독자가 같은 객체를 봅니다). */
  const q = 판(GUARD_SRC);
  const 원본 = 스냅(포지션(), [거래()]);
  q.App.Storage.save("trading", 원본);
  ok("넘겨받은 원본 객체는 그대로다 (다른 구독자 보호)", 원본.position !== null);
}

/* =====================================================================
 * ⑤ 수정 금지 12개 파일 md5 (문자열 검사는 오탐이 나서 못 씁니다)
 * ===================================================================== */
console.log("\n⑤ 수정 금지 파일 12개");
{
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
    "chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
    "season.js": "9c5fbf13ced09ca2f348e48f87c78224",
    "board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
    "orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "chart.js": "02ddcb000d577131f797143d08c09123",
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  const 어긋남 = [];
  for (const f of Object.keys(기준)) {
    const h = crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
    if (h !== 기준[f]) 어긋남.push(f + " " + h);
  }
  ok("12개 파일이 기준 해시 그대로다", 어긋남.length === 0, 어긋남.join(" / "));
}

/* =====================================================================
 * ⑥ 돌연변이 자체검증 (걸러내기)
 *
 * 판정을 일부러 느슨하게 만든 판을 메모리에서 돌려,
 * **살아 있는 포지션이 지워지는지** 확인합니다.
 * 안 지워지면 그 조건은 아무것도 지키고 있지 않다는 뜻입니다.
 * 원본 파일은 건드리지 않습니다(문자열만 바꿔 vm 에서 실행).
 * ===================================================================== */
console.log("\n⑥ 돌연변이 — 조건을 빼면 진짜 포지션이 지워지는가");
{
  const 돌연변이들 = [
    {
      이름: "(1) 부분청산 제외를 뺀다",
      전: "if (trade.reason === PARTIAL_REASON) return false;",
      후: "if (false) return false;",
      상황: "부분청산만 있고 포지션은 살아 있다",
    },
    {
      이름: "(2) 2초 여유를 0 으로 줄인다",
      전: "var TOLERANCE_MS = 2000;",
      후: "var TOLERANCE_MS = 0;",
      상황: "청산 기록이 포지션 연 지 2초 이내다",
    },
    {
      이름: "(3-a) 진입가 검사를 뺀다",
      전: "if (!sameEntry(trade.entry, position.entry)) return false;",
      후: "if (false) return false;",
      상황: "진입가가 다르다 (다른 기기 시계가 빠른 경우)",
    },
    {
      이름: "(3-b) 방향 검사를 뺀다",
      전: "if (trade.side !== position.side) return false;",
      후: "if (false) return false;",
      상황: "방향이 다르다",
    },
  ];

  for (const m of 돌연변이들) {
    const 원 = GUARD_SRC.split(m.전).length - 1;
    ok(m.이름 + " — 바꿀 자리를 정확히 1군데 찾았다", 원 === 1, "찾은 곳 " + 원 + "군데");
    const 변 = GUARD_SRC.replace(m.전, m.후);
    ok(m.이름 + " — 돌연변이를 만들었다", 변 !== GUARD_SRC);

    const s = 상황[m.상황];
    const r = 지워지나(변, s.pos, s.trades);
    ok(m.이름 + " → 살아 있는 포지션이 지워진다 (검사가 값을 한다)", r.지워짐,
      "조건을 빼도 결과가 같습니다 — 이 검사는 아무것도 안 지키고 있습니다");
  }

  /* 백업 없이 지우면 잡히는가 */
  {
    const 전 = "    stash(evidence);";
    const 원 = GUARD_SRC.split(전).length - 1;
    ok("(백업) 지우기 전 보관하는 줄을 1군데 찾았다", 원 === 1, "찾은 곳 " + 원 + "군데");
    const 변 = GUARD_SRC.replace(전, "");
    const r = 지워지나(변, 포지션(), [거래()]);
    ok("(백업) 보관을 빼면 지우기는 그대로 된다", r.지워짐);
    ok("(백업) → 그때 localStorage 에 백업이 없다 (③ 검사가 값을 한다)",
      Object.keys(r.판본.ls).filter((k) => /ghost-position-removed$/.test(k)).length === 0,
      "보관을 빼도 백업이 남았습니다 — ③ 이 아무것도 안 지킵니다");
  }

  /* 부팅해도 안 꺼지게 만들면 잡히는가 */
  {
    const 전 = "      armed = false;";
    const 원 = GUARD_SRC.split(전).length - 1;
    ok("(부팅) 검사를 끄는 줄을 1군데 찾았다", 원 === 1, "찾은 곳 " + 원 + "군데");
    const 변 = GUARD_SRC.replace(전, "");
    const p = 판(변);
    p.App.bootApp();
    ok("(부팅) 끄기를 빼면 부팅 뒤에도 켜져 있다", p.G.isArmed() === true);
    p.App.Storage.save("trading", 스냅(포지션(), [거래()]));
    ok("(부팅) → 이 세션에서 연 포지션이 지워진다 (② 검사가 값을 한다)",
      p.읽기("trading").position === null,
      "끄기를 빼도 결과가 같습니다 — ② 가 아무것도 안 지킵니다");
  }
}

/* =====================================================================
 * ④ 청산 이벤트가 버려지지 않는다 (js/persist-sync-queue.js)
 *
 * js/supabase-sync.js 172행 `if (syncing) return;` 이 앞 동기화가 도는 동안
 * 들어온 스냅샷을 통째로 버립니다. 진입 -> 곧바로 청산 -> 조용해짐 순서면
 * 서버 positions 에 닫힌 포지션이 그대로 남고, 그게 유령이 됩니다.
 * 비동기라 이 절만 마지막에 돕니다.
 * ===================================================================== */
function 큐판(queueSource) {
  const 등록 = [];
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    setInterval: function () { return 0; },
    clearInterval: function () {},
    Promise: Promise,
    setTimeout: setTimeout,
  };
  ctx.window = ctx;
  ctx.App = {
    Bus: {
      on(e, fn) { 등록.push([e, fn]); return fn; },
      emit(e, p) { 등록.forEach((r) => { if (r[0] === e) r[1](p); }); },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(queueSource, ctx, { filename: "js/persist-sync-queue.js" });
  return { App: ctx.App, Q: ctx.App.PersistSyncQueue, 등록: 등록 };
}

const 쉬기 = (ms) => new Promise((r) => setTimeout(r, ms));

/* 진입 -> 곧바로 청산. 원본 핸들러는 느립니다(네트워크 왕복 4번). */
async function 청산이_서버에_반영되나(queueSource) {
  const p = 큐판(queueSource);
  const 반영 = [];
  /* 이름이 중요합니다 — 큐는 이 이름으로 supabase-sync 의 구독 함수를 찾습니다. */
  async function onTradingPersisted(snapshot) {
    반영.push(snapshot.position);
    await 쉬기(40);
  }
  p.App.Bus.on("trading:persisted", onTradingPersisted);
  p.App.Bus.emit("trading:persisted", 스냅(포지션(), []));            // 진입
  p.App.Bus.emit("trading:persisted", 스냅(null, [거래()]));          // 곧바로 청산
  await 쉬기(500);   // 넉넉히 (다른 테스트와 같이 돌 때 흔들리지 않게)
  return { 반영: 반영, Q: p.Q, p: p };
}

(async function () {
  console.log("\n④ 청산 이벤트가 버려지지 않는다 (저장 큐)");

  const r = await 청산이_서버에_반영되나(QUEUE_SRC);
  ok("큐가 supabase-sync 의 구독 함수를 집어냈다", r.Q.isAttached() === true);
  ok("동기화가 최소 한 번은 돌았다", r.반영.length >= 1, String(r.반영.length));
  /* 스냅샷은 매번 "전체 상태" 라서 중간 것을 건너뛰어도 정보가 안 사라집니다.
     그래서 큐는 겹친 것을 합쳐 "가장 마지막 것" 하나만 보냅니다.
     중요한 것은 개수가 아니라 **마지막 상태(청산)가 반드시 반영되는가** 입니다. */
  ok("마지막 상태(청산)가 서버에 반영된다 (닫힌 포지션이 안 남는다)",
    r.반영[r.반영.length - 1] === null,
    "마지막 반영이 청산이 아닙니다 — 청산이 버려졌습니다");
  ok("네트워크를 아낀다 (겹친 것을 합쳐 2번을 넘지 않는다)",
    r.반영.length <= 2, String(r.반영.length));
  ok("겹쳐 들어온 건수를 셌다 (원래 코드였다면 버려졌을 건수)",
    r.Q.getQueuedCount() >= 1, String(r.Q.getQueuedCount()));

  /* 큐가 하면 안 되는 것 두 가지 (2026 채팅 200번 도배 사고의 원인).
     주석에 그 사고 설명이 적혀 있어 오탐이 납니다 — 주석을 지우고 봅니다. */
  const 큐본문 = QUEUE_SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  ok("큐가 App.Bus.emit 을 부르지 않는다 (구독자 17곳)", !/Bus\.emit/.test(큐본문));
  ok("큐가 payload 의 closedTrades 를 건드리지 않는다",
    !/closedTrades\s*=/.test(큐본문));

  /* supabase-sync 쪽 이름이 바뀌면 큐가 조용히 안 붙습니다 — 그걸 잡습니다. */
  const syncSrc = fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"), "utf8");
  ok("supabase-sync.js 에 onTradingPersisted 이름이 그대로 있다",
    /function onTradingPersisted\s*\(/.test(syncSrc));
  ok("supabase-sync.js 가 아직 청산 이벤트를 버린다 (그래서 큐가 필요하다)",
    /if\s*\(\s*syncing\s*\)\s*return\s*;/.test(syncSrc));

  /* ---- 돌연변이 (큐) ----
     원래 버그를 되살린 판. 청산이 버려지는지 확인합니다. */
  console.log("\n⑥ 돌연변이 — 큐가 이벤트를 버리게 만들면 잡히는가");
  const 전 = "      latest = snapshot;";
  const 원 = QUEUE_SRC.split(전).length - 1;
  ok("(큐) 줄세우는 자리를 1군데 찾았다", 원 === 1, "찾은 곳 " + 원 + "군데");
  const 변 = QUEUE_SRC.replace(전, "      if (running || hasLatest) return;\n      latest = snapshot;");
  const m = await 청산이_서버에_반영되나(변);
  ok("(큐) → 버리게 만들면 청산이 서버에 안 올라간다 (④ 검사가 값을 한다)",
    m.반영[m.반영.length - 1] !== null,
    "버리게 만들어도 결과가 같습니다 — ④ 가 아무것도 안 지킵니다");

  /* ---- 두 파일이 실제로 화면에 실리는가 ---- */
  console.log("\n⑦ index.html 이 두 파일을 부른다");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  /* main.js 는 js/ 가 아니라 저장소 루트에 있습니다 (index.html 1043행). */
  const posStorage = html.indexOf('src="js/storage.js"');
  const posGuard = html.indexOf('src="js/ghost-position-guard.js"');
  const posMain = html.indexOf('src="main.js"');
  const posQueue = html.indexOf('src="js/persist-sync-queue.js"');
  ok("걸러내기를 부른다", posGuard > 0);
  ok("저장 큐를 부른다", posQueue > 0);
  ok("걸러내기가 storage.js 뒤에 온다 (App.Storage 가 있어야 감싼다)",
    posStorage > 0 && posGuard > posStorage);
  ok("저장 큐가 main.js 뒤에 온다 (App.Bus 가 있어야 감싼다)",
    posMain > 0 && posQueue > posMain);

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  console.log(fail === 0 ? "전체 통과 ✅" : "실패 있음 ❌");
  process.exit(fail === 0 ? 0 : 1);
})();
