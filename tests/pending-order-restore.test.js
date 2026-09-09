/* tests/pending-order-restore.test.js
 * ===========================================================================
 * [P1] 새로고침하면 ★미체결 지정가 주문이 사라지고, 그 돈을 되찾을 길이 없던★ 것.
 * ===========================================================================
 * 2026-09-09 — 조사팀 확신도 "확실" / PM 코드 확인 / 수리팀 수리 + 이 봉인
 *
 * ── 무엇이 일어났나 ────────────────────────────────────────────────────────
 *     증거금 1,000 · 100배 → 명목 100,000 → 진입수수료 20 (메이커 0.02%)
 *     지정가 걸기   지갑 98,980 · 총자산 99,980 (1,000 이 "묶인 증거금")
 *     ★새로고침★   지갑 98,980 · 총자산 98,980   → ★1,000 이 화면에서 증발★
 *     서버 계급자산 98,980 + 1,000 = 99,980       → ★서버가 맞고 화면이 틀림★
 *
 *   js/auth.js:415 가 hydrate 때 pendingOrder 를 null 로 덮어씁니다.
 *   js/trading.js:658-669 의 복원 코드는 멀쩡한데 ★읽을 것이 이미 없습니다.★
 *
 *   되찾을 길이 없습니다 —
 *     ① 체결 판정은 100% 브라우저 안에서만 돕니다(서버에 체결 엔진 없음).
 *        supabase/*.sql 에 orders.status 를 UPDATE 하는 곳이 0곳입니다.
 *     ② 취소 단추(js/ui.js:131 #btn-cancel-order)는 숨겨진 카드 안에만 있습니다.
 *     ③ 서버 계급 자산(schema-rank-1000.sql:263·384)은 그 margin 을 셉니다.
 *
 * ── 조사팀 확인 — 이 봉인이 왜 필요한가 ────────────────────────────────────
 *   tests/ 에서 pendingOrder 를 쓰는 파일이 20개인데,
 *   ★hydrate 가 그것을 null 로 만드는 것을 막는 봉인은 0개★ 였습니다.
 *
 * ── ⚠️ 이 봉인이 특히 못 박는 것 — ★armed★ ────────────────────────────────
 *   되살리기를 "저장 때마다 무조건" 하면 ★고치려던 것보다 더 나쁩니다.★
 *   회원이 주문을 ★취소하거나 체결돼서★ pendingOrder=null 로 정상 저장할 때
 *   주문이 되살아나 ★증거금이 두 번 잡힙니다.★
 *   그래서 [C] 와 돌연변이 ② 가 이 파일에서 제일 중요한 검사입니다.
 *
 * ── 못 박는 것 ────────────────────────────────────────────────────────────
 *   [A] 로컬에 남아 있으면 그것을 지킨다 (tp·sl·종목까지 그대로)
 *   [B] 로컬이 없으면 서버 orderHistory 의 OPEN 지정가로 조립한다
 *   [C] ★부팅 뒤에는 아예 동작하지 않는다★ (취소·체결이 되살아나지 않는다)
 *   [D] 서버가 FILLED·CANCELLED 를 알거나 포지션이 있으면 되살리지 않는다
 *   [E] 숫자 검산 — 1,000/100배 → 명목 100,000 · 수수료 20 · 총자산 99,980
 *   [F] 되살린 주문이 js/trading.js:658-669 의 검사를 실제로 통과한다
 *   [G] 잔고·거래내역·주문내역을 한 푼도 안 건드린다
 *   [H] 돌연변이 ①~④ — 되돌리면 정말 실패하는가
 *   [I] index.html 등록 · 되돌리는 방법 · 수정 금지 12개
 *
 * 이 파일은 사이트 코드를 한 글자도 안 바꿉니다. 사본에서만 돌연변이를 만듭니다.
 * ------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MODULE_REL = "js/pending-order-restore-guard.js";
const MODULE_ABS = path.join(REPO, MODULE_REL);

const ESC = String.fromCharCode(27);
const OKMARK = ESC + "[32m✓" + ESC + "[0m";
const NGMARK = ESC + "[31m✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + OKMARK + " " + name);
  } else {
    fail++;
    console.log("  " + NGMARK + " " + name + (detail ? " — " + detail : ""));
  }
}
function 절(t) {
  console.log("\n" + t);
}

const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");
const SRC = read(MODULE_REL);

/* =========================================================================
 * 가짜 App 환경 — tests/ghost-position.test.js 와 같은 모양입니다.
 * ========================================================================= */
function freshEnv() {
  const store = {};
  const App = {
    Storage: {
      save(key, data) {
        store[key] = JSON.parse(JSON.stringify(data));
        return true;
      },
      load(key) {
        return store[key] === undefined ? null : JSON.parse(JSON.stringify(store[key]));
      },
    },
    Bus: { on() {}, emit() {} },
    bootApp() {
      App.__booted = true;
    },
  };
  global.window = global;
  global.App = App;
  return { App, store };
}

/* 원본 모듈 */
function loadReal() {
  delete require.cache[require.resolve(MODULE_ABS)];
  return require(MODULE_ABS);
}

/* 사본(돌연변이)을 태웁니다 — 파일로 떨어뜨리지 않고 메모리에서만 돕니다.
   runInThisContext 안에서는 module 이 없으므로 module.exports 줄은 건너뜁니다. */
function loadMutant(src) {
  const quiet = console.warn;
  console.warn = function () {};
  try {
    vm.runInThisContext(src, { filename: "<mutant>" });
  } finally {
    console.warn = quiet;
  }
  return global.App.PendingOrderRestoreGuard;
}

/* console.warn 을 잠깐 죽입니다(모듈이 일부러 시끄럽게 경고합니다). */
function quietly(fn) {
  const w = console.warn;
  console.warn = function () {};
  try {
    return fn();
  } finally {
    console.warn = w;
  }
}

/* =========================================================================
 * 표본 — 대표가 실제로 겪은 그 숫자 그대로
 * ========================================================================= */
const 초기자금 = 100000;
const 증거금 = 1000;
const 배율 = 100;
const 명목 = 증거금 * 배율;            // 100,000
const 진입수수료 = 명목 * 0.0002;      // 20  (메이커 0.02%)
const 걸린뒤잔고 = 초기자금 - 증거금 - 진입수수료; // 98,980
const T0 = 1757300000000;

const 로컬주문 = {
  id: "o" + T0,
  side: "long",
  price: 61000,
  margin: 증거금,
  leverage: 배율,
  notional: 명목,
  entryFee: 진입수수료,
  tp: 62000,
  sl: 60500,
  status: "OPEN",
  createdTime: T0,
  symbol: "SAMSUNGUSDT", // 종목까지 온전히 남아 있어야 합니다
};

/* 서버가 준 주문내역 한 줄 (js/auth.js:189-199 의 모양 그대로) */
function 서버주문(over) {
  return Object.assign(
    {
      id: "o" + T0,
      side: "long",
      type: "limit",
      price: 61000,
      margin: 증거금,
      leverage: 배율,
      status: "OPEN",
      createdTime: T0,
      filledTime: undefined,
      cancelledTime: undefined,
    },
    over || {}
  );
}

/* js/auth.js:410-419 가 저장하는 그 문서 — pendingOrder 가 null 입니다 */
function hydrate문서(over) {
  return Object.assign(
    {
      balance: 걸린뒤잔고,
      leverage: 배율,
      position: null,
      pendingOrder: null, // ★여기가 P1★
      orderHistory: [서버주문()],
      closedTrades: [],
      fundingHistory: [],
      lastSettledFundingTime: null,
    },
    over || {}
  );
}

/* js/trading.js:692-694 의 총자산 계산 그대로 (미실현 0) */
function 총자산(doc) {
  const usedMargin =
    (doc.position ? doc.position.margin : 0) + (doc.pendingOrder ? doc.pendingOrder.margin : 0);
  return doc.balance + usedMargin;
}

/* =========================================================================
 * [A] 로컬에 남아 있으면 그것을 지킨다
 * ========================================================================= */
절("[A] 로컬 우선 — 새로고침해도 미체결 주문이 살아남는다");
let A저장 = null;
{
  const { App, store } = freshEnv();
  store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
  const G = loadReal();

  ok("App.Storage.save 를 감쌌다", App.Storage.__pendingOrderGuarded === true);
  ok("복원 구간에서는 켜져 있다", G.isArmed() === true);

  quietly(() => App.Storage.save("trading", hydrate문서()));
  A저장 = store["trading"];

  ok("미체결 주문이 살아남았다", !!A저장.pendingOrder, JSON.stringify(A저장.pendingOrder));
  ok("되살린 건수가 1 이다", G.getRestoredCount() === 1, String(G.getRestoredCount()));
  ok("출처가 로컬이다", G.getLastRestored().source === "로컬");
  ok("★tp 가 그대로다★ (서버엔 없는 값)", A저장.pendingOrder.tp === 62000);
  ok("★sl 이 그대로다★ (서버엔 없는 값)", A저장.pendingOrder.sl === 60500);
  ok(
    "★종목이 그대로다★ (BTCUSDT 로 둔갑하지 않는다)",
    A저장.pendingOrder.symbol === "SAMSUNGUSDT",
    String(A저장.pendingOrder.symbol)
  );
  ok("주문 id 가 그대로다", A저장.pendingOrder.id === 로컬주문.id);

  /* [G] 다른 값은 한 글자도 안 건드립니다 */
  ok("잔고를 안 건드렸다", A저장.balance === 걸린뒤잔고, String(A저장.balance));
  ok("주문내역을 안 건드렸다", A저장.orderHistory.length === 1);
  ok("거래내역을 안 건드렸다", A저장.closedTrades.length === 0);
  ok("포지션을 만들어내지 않았다", A저장.position === null);

  /* 원본 객체를 바꾸지 않는다(다른 구독자가 같은 객체를 볼 수 있음) */
  const 들어온것 = hydrate문서();
  quietly(() => G.restore(들어온것));
  ok("들어온 객체를 그 자리에서 바꾸지 않는다", 들어온것.pendingOrder === null);
}

/* =========================================================================
 * [B] 로컬이 없으면 서버 주문내역으로 조립한다 (기기를 바꾼 회원)
 * ========================================================================= */
절("[B] 서버 보조 — 기기를 바꿔 로컬이 비어도 돈은 회수한다");
let B주문 = null;
{
  const { App, store } = freshEnv();
  const G = loadReal(); // 로컬 저장소가 통째로 비어 있는 상태

  quietly(() => App.Storage.save("trading", hydrate문서()));
  const saved = store["trading"];
  B주문 = saved.pendingOrder;

  ok("서버 주문내역으로 되살렸다", !!B주문);
  ok("출처가 서버 주문내역이다", G.getLastRestored().source === "서버 주문내역");
  ok("명목 = 증거금 x 배율 로 다시 계산됐다", B주문.notional === 명목, String(B주문.notional));
  ok(
    "진입수수료 = 명목 x 0.0002 (메이커) 로 다시 계산됐다",
    B주문.entryFee === 진입수수료,
    String(B주문.entryFee)
  );
  ok("★서버에 없는 tp 를 지어내지 않았다★", B주문.tp === null);
  ok("★서버에 없는 sl 을 지어내지 않았다★", B주문.sl === null);
  ok("status 가 OPEN 이다", B주문.status === "OPEN");

  /* 여러 건이면 가장 최근 것 하나만 */
  const { App: App2, store: store2 } = freshEnv();
  loadReal();
  const 여러건 = hydrate문서({
    orderHistory: [
      서버주문({ id: "old", createdTime: T0 - 90000 }),
      서버주문({ id: "new", createdTime: T0 + 90000 }),
      서버주문({ id: "filled", createdTime: T0 + 99999, status: "FILLED" }),
      서버주문({ id: "market", createdTime: T0 + 99999, type: "market" }),
    ],
  });
  quietly(() => App2.Storage.save("trading", 여러건));
  ok("여러 건이면 가장 최근 OPEN 지정가 하나만 되살린다", store2["trading"].pendingOrder.id === "new",
    String(store2["trading"].pendingOrder && store2["trading"].pendingOrder.id));

  /* 되살릴 것이 아무것도 없으면 아무 일도 안 합니다 */
  const { App: App3, store: store3 } = freshEnv();
  loadReal();
  quietly(() => App3.Storage.save("trading", hydrate문서({ orderHistory: [] })));
  ok("되살릴 것이 없으면 null 그대로 둔다", store3["trading"].pendingOrder === null);
}

/* =========================================================================
 * [C] ★제일 중요★ — 부팅 뒤에는 아예 동작하지 않는다
 * ========================================================================= */
절("[C] ★armed★ — 취소·체결한 주문이 되살아나지 않는다");
{
  const { App, store } = freshEnv();
  const G = loadReal();

  /* 복원 구간: 되살립니다 */
  quietly(() => App.Storage.save("trading", hydrate문서()));
  ok("복원 구간에서는 되살렸다", !!store["trading"].pendingOrder);

  /* 부팅 — 여기서 꺼집니다 */
  App.bootApp();
  ok("부팅하면 꺼진다", G.isArmed() === false);
  ok("부팅 자체는 그대로 일어난다", App.__booted === true);

  /* 회원이 주문을 취소 — js/trading.js:279 처럼 pendingOrder=null 로 저장 */
  const 취소후 = {
    balance: 초기자금, // 증거금+수수료를 환불받은 상태 (js/trading.js:272)
    leverage: 배율,
    position: null,
    pendingOrder: null,
    orderHistory: [서버주문({ status: "CANCELLED", cancelledTime: T0 + 1000 })],
    closedTrades: [],
    fundingHistory: [],
    lastSettledFundingTime: null,
  };
  quietly(() => App.Storage.save("trading", 취소후));
  ok(
    "★취소한 주문이 되살아나지 않는다★ (증거금 이중 차감 방지)",
    store["trading"].pendingOrder === null,
    JSON.stringify(store["trading"].pendingOrder)
  );
  ok("되살린 건수가 늘지 않았다", G.getRestoredCount() === 1, String(G.getRestoredCount()));
  ok("환불된 잔고가 그대로다", store["trading"].balance === 초기자금);

  /* 체결된 경우도 같습니다 */
  const 체결후 = {
    balance: 걸린뒤잔고,
    leverage: 배율,
    position: { side: "long", entry: 61000, qty: 1.639, margin: 증거금, leverage: 배율, liq: 60400, entryFee: 진입수수료, openTime: T0 + 5000, orderId: 로컬주문.id },
    pendingOrder: null,
    orderHistory: [서버주문({ status: "FILLED", filledTime: T0 + 5000 })],
    closedTrades: [],
    fundingHistory: [],
    lastSettledFundingTime: null,
  };
  quietly(() => App.Storage.save("trading", 체결후));
  ok("★체결된 주문이 되살아나지 않는다★", store["trading"].pendingOrder === null);

  /* 소스에도 armed 조건이 실제로 걸려 있는가 */
  ok(
    "저장 감싸기에 armed 조건이 붙어 있다",
    /if\s*\(\s*armed\s*&&\s*key\s*===\s*STORAGE_KEY/.test(SRC)
  );
  ok("App.bootApp 을 감싸 스스로 끈다", /App\.bootApp\s*=\s*wrapped/.test(SRC) && /armed\s*=\s*false/.test(SRC));
}

/* =========================================================================
 * [D] 안전장치 — 다른 기기에서 이미 처리된 주문은 되살리지 않는다
 * ========================================================================= */
절("[D] 안전장치 — 서버 주문내역·포지션을 증거로 본다");
{
  function 되살렸나(문서) {
    const { App, store } = freshEnv();
    store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
    loadReal();
    quietly(() => App.Storage.save("trading", 문서));
    return !!store["trading"].pendingOrder;
  }

  ok(
    "서버가 FILLED 라고 하면 되살리지 않는다",
    되살렸나(hydrate문서({ orderHistory: [서버주문({ status: "FILLED", filledTime: T0 + 5000 })] })) === false
  );
  ok(
    "서버가 CANCELLED 라고 하면 되살리지 않는다",
    되살렸나(hydrate문서({ orderHistory: [서버주문({ status: "CANCELLED", cancelledTime: T0 + 5000 })] })) === false
  );
  ok(
    "포지션의 orderId 가 같으면 되살리지 않는다 (다른 기기에서 체결됨)",
    되살렸나(
      hydrate문서({
        position: { side: "long", entry: 61000, margin: 증거금, leverage: 배율, orderId: 로컬주문.id },
      })
    ) === false
  );
  ok(
    "포지션이 있으면 되살리지 않는다 (미체결과 포지션은 공존 불가)",
    되살렸나(
      hydrate문서({
        position: { side: "short", entry: 59000, margin: 500, leverage: 10, orderId: "다른것" },
      })
    ) === false
  );
  ok("서버가 OPEN 이라고 하면 되살린다", 되살렸나(hydrate문서()) === true);
  ok("서버 주문내역에 아예 없어도 되살린다(동기화가 아직 안 된 경우)",
    되살렸나(hydrate문서({ orderHistory: [] })) === true);
}

/* =========================================================================
 * [E] 숫자 검산 — 대표가 겪은 그 숫자
 * ========================================================================= */
절("[E] 숫자 검산 — 1,000 / 100배");
{
  const 수정전 = hydrate문서();                    // pendingOrder 가 null 인 채로
  const 수정후 = A저장;                            // [A] 가 되살린 결과
  const 서버계급자산 = 걸린뒤잔고 + 증거금;        // schema-rank-1000.sql:263·384

  console.log("      └ 지정가 걸기 전 잔고     : " + 초기자금);
  console.log("      └ 지정가 걸고 난 뒤 잔고  : " + 걸린뒤잔고 + "  (-" + (증거금 + 진입수수료) + ")");
  console.log("      └ 새로고침 뒤 총자산(전)  : " + 총자산(수정전));
  console.log("      └ 새로고침 뒤 총자산(후)  : " + 총자산(수정후));
  console.log("      └ 서버 계급 자산          : " + 서버계급자산);

  ok("명목 = 100,000", 명목 === 100000, String(명목));
  ok("진입수수료 = 20 (메이커 0.02%)", 진입수수료 === 20, String(진입수수료));
  ok("주문 뒤 잔고 = 98,980", 걸린뒤잔고 === 98980, String(걸린뒤잔고));
  ok("★수정 전★ 총자산 = 98,980 (묶인 증거금 1,000 이 증발)", 총자산(수정전) === 98980, String(총자산(수정전)));
  ok("★수정 후★ 총자산 = 99,980", 총자산(수정후) === 99980, String(총자산(수정후)));
  ok("★수정 후 총자산 = 서버 계급 자산★ (화면과 서버가 다시 맞는다)", 총자산(수정후) === 서버계급자산);
  ok("수정 전 어긋난 폭이 정확히 margin 이었다", 서버계급자산 - 총자산(수정전) === 증거금);
  ok("잔고 자체는 전·후가 같다 (돈을 만들어내지 않는다)", 수정전.balance === 수정후.balance);
  ok(
    "취소하면 되돌려받을 금액 = 증거금 + 진입수수료 = 1,020",
    수정후.pendingOrder.margin + 수정후.pendingOrder.entryFee === 1020,
    String(수정후.pendingOrder.margin + 수정후.pendingOrder.entryFee)
  );
}

/* =========================================================================
 * [F] 되살린 주문이 js/trading.js 의 검사를 실제로 통과하는가
 * ========================================================================= */
절("[F] js/trading.js:658-669 의 복원 검사를 통과한다");
{
  const trading = read("js/trading.js");
  const 블록 = trading.slice(trading.indexOf("if (saved.pendingOrder"), trading.indexOf("if (Array.isArray(saved.orderHistory)"));
  ok("js/trading.js 에서 미체결 복원 블록을 찾았다", 블록.length > 100 && 블록.indexOf("isValidOrder") >= 0);

  /* 저쪽이 요구하는 칸을 소스에서 그대로 뽑습니다 — 손으로 베끼지 않습니다. */
  const 요구칸 = [];
  const re = /typeof o\.(\w+) === "number"/g;
  let m;
  while ((m = re.exec(블록)) !== null) if (요구칸.indexOf(m[1]) < 0) 요구칸.push(m[1]);
  ok("요구하는 숫자 칸을 뽑아냈다 (" + 요구칸.join(", ") + ")", 요구칸.length >= 4);

  [["로컬", A저장.pendingOrder], ["서버", B주문]].forEach(function (짝) {
    const 이름 = 짝[0];
    const o = 짝[1];
    ok(이름 + " 로 되살린 주문의 side 가 long/short 다", o.side === "long" || o.side === "short");
    요구칸.forEach(function (k) {
      if (k === "entryFee") return; // 저쪽은 없으면 0 으로 대체합니다
      ok(
        이름 + " 로 되살린 주문의 " + k + " 가 유한한 숫자다",
        typeof o[k] === "number" && isFinite(o[k]),
        String(o[k])
      );
    });
    ok(이름 + " 로 되살린 주문의 entryFee 가 유한한 숫자다", typeof o.entryFee === "number" && isFinite(o.entryFee));
  });

  /* 메이커 요율이 js/trading.js 와 같은 값인가 */
  const maker = /maker:\s*([0-9.]+)/.exec(trading);
  ok("js/trading.js 에서 메이커 요율을 읽었다", !!maker);
  ok(
    "우리 모듈의 메이커 요율이 js/trading.js 와 같다 (" + (maker && maker[1]) + ")",
    !!maker && Number(maker[1]) === loadReal().MAKER_FEE_RATE
  );
}

/* =========================================================================
 * [H] 돌연변이 — 되돌리면 정말 실패하는가 (사본에서만)
 * ========================================================================= */
절("[H] 돌연변이 검사 — 사본에서만 망가뜨려 봅니다");
{
  /* ① 복원 코드를 지우면 잡히는가 */
  {
    const 사본 = SRC.replace("data = restore(data);", "/* 돌연변이① 복원 제거 */");
    ok("① 복원 코드를 지운 사본을 만들었다", 사본 !== SRC);
    const { App, store } = freshEnv();
    store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
    loadMutant(사본);
    quietly(() => App.Storage.save("trading", hydrate문서()));
    ok("① -> 미체결 주문이 사라진다 (봉인 [A] 가 잡는다)", store["trading"].pendingOrder === null);
  }

  /* ② ★제일 중요★ armed 를 항상 켜두면 취소·체결 뒤에도 되살아나는가 */
  {
    const 사본 = SRC.replace(
      "if (armed && key === STORAGE_KEY",
      "if (key === STORAGE_KEY /* 돌연변이② armed 제거 */"
    );
    ok("② armed 를 없앤 사본을 만들었다", 사본 !== SRC && 사본.indexOf("armed && key") < 0);

    const { App, store } = freshEnv();
    store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
    const M = loadMutant(사본);
    quietly(() => App.Storage.save("trading", hydrate문서()));
    App.bootApp();
    ok("② -> 부팅해도 꺼지긴 한다(플래그는 살아 있다)", M.isArmed() === false);

    /* 회원이 취소 — 정상이라면 null 로 남아야 합니다 */
    const 취소후 = {
      balance: 초기자금,
      leverage: 배율,
      position: null,
      pendingOrder: null,
      orderHistory: [],
      closedTrades: [],
      fundingHistory: [],
      lastSettledFundingTime: null,
    };
    quietly(() => App.Storage.save("trading", 취소후));
    ok(
      "② -> ★취소한 주문이 되살아난다 (증거금 이중 차감)★ — 봉인 [C] 가 잡는다",
      store["trading"].pendingOrder !== null,
      "되살아나지 않았습니다 — 돌연변이가 병을 못 만들었다는 뜻이라 [C] 가 무의미해집니다"
    );
    if (store["trading"].pendingOrder) {
      const 잘못된총자산 = 총자산(store["trading"]);
      console.log("      └ ② 가 만드는 병: 총자산 " + 초기자금 + " → " + 잘못된총자산 + " (증거금 " + 증거금 + " 이 다시 묶임)");
      ok("② -> 그때 총자산이 " + (초기자금 + 증거금) + " 로 부풀어 오른다", 잘못된총자산 === 초기자금 + 증거금);
    }
  }

  /* ③ FILLED/CANCELLED 인데 되살리면 잡히는가 */
  {
    const 사본 = SRC.replace(
      'if (o.status === FILLED) return "다른 기기에서 이미 체결됐습니다(서버 주문내역 FILLED)";',
      "/* 돌연변이③ FILLED 무시 */"
    ).replace(
      'if (o.status === CANCELLED) return "다른 기기에서 이미 취소됐습니다(서버 주문내역 CANCELLED)";',
      "/* 돌연변이③ CANCELLED 무시 */"
    );
    ok("③ 서버 증거 검사를 없앤 사본을 만들었다", 사본 !== SRC);
    const { App, store } = freshEnv();
    store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
    loadMutant(사본);
    quietly(() =>
      App.Storage.save(
        "trading",
        hydrate문서({ orderHistory: [서버주문({ status: "CANCELLED", cancelledTime: T0 + 5000 })] })
      )
    );
    ok(
      "③ -> 다른 기기에서 취소한 주문이 되살아난다 — 봉인 [D] 가 잡는다",
      store["trading"].pendingOrder !== null
    );
  }

  /* ④ 지금 원본 → 결함 0 */
  {
    const { App, store } = freshEnv();
    store["trading"] = { balance: 걸린뒤잔고, pendingOrder: JSON.parse(JSON.stringify(로컬주문)) };
    const G = loadReal();
    quietly(() => App.Storage.save("trading", hydrate문서()));
    const 복원됨 = !!store["trading"].pendingOrder;
    App.bootApp();
    quietly(() =>
      App.Storage.save("trading", {
        balance: 초기자금, leverage: 배율, position: null, pendingOrder: null,
        orderHistory: [], closedTrades: [], fundingHistory: [], lastSettledFundingTime: null,
      })
    );
    const 되살아남 = store["trading"].pendingOrder !== null;
    ok("④ 원본 — 복원은 되고", 복원됨);
    ok("④ 원본 — 취소 뒤에는 안 되살아난다", 되살아남 === false);
    ok("④ 원본 — 되살린 건수가 정확히 1", G.getRestoredCount() === 1, String(G.getRestoredCount()));
  }
}

/* =========================================================================
 * [I] 등록 · 되돌리는 방법 · 수정 금지 12개
 * ========================================================================= */
절("[I] 등록 · 되돌리는 방법 · 수정 금지 파일");
{
  const html = read("index.html");
  ok("index.html 이 이 모듈을 부른다", html.indexOf('src="' + MODULE_REL + '"') >= 0);

  const 줄 = html.split(/\r?\n/);
  const 번호 = (rel) => {
    for (let i = 0; i < 줄.length; i++) if (줄[i].indexOf('src="' + rel + '"') >= 0) return i + 1;
    return -1;
  };
  ok(
    "★js/symbol-sync-bridge.js 보다 뒤다★ (가장 바깥이라야 종목 도장이 찍힌다)",
    번호(MODULE_REL) > 0 && 번호("js/symbol-sync-bridge.js") > 0 && 번호(MODULE_REL) > 번호("js/symbol-sync-bridge.js"),
    "지금: bridge " + 번호("js/symbol-sync-bridge.js") + " / 우리 " + 번호(MODULE_REL)
  );
  ok("js/auth.js 보다 뒤다 (복원 저장 전에 감싸기가 끝난다)", 번호(MODULE_REL) > 번호("js/auth.js"));

  ok("모듈에 되돌리는 방법이 적혀 있다", /되돌리는 방법/.test(SRC));
  ok("수정 금지 파일을 안 건드렸다고 적혀 있다", /수정 금지 파일/.test(SRC));

  const 등록 = read("tests/_order.txt");
  ok("npm test 목록(tests/_order.txt)에 이 파일이 있다", 등록.indexOf("tests/pending-order-restore.test.js") >= 0);

  /* 수정 금지 12개 md5 — 단 하나의 출처(tests/_locked-hashes.js)를 씁니다 */
  const crypto = require("crypto");
  const BY_FILE = require(path.join(REPO, "tests/_locked-hashes.js")).BY_FILE;
  let 맞음 = 0, 전체 = 0;
  Object.keys(BY_FILE).forEach(function (rel) {
    if (rel.indexOf("js/") !== 0) return; // BY_FILE 은 "ui.js" 짧은 이름도 같이 담습니다
    전체++;
    const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, rel))).digest("hex");
    if (md5 === BY_FILE[rel]) 맞음++;
    else console.log("      ! " + rel + " 가 바뀌었습니다: " + md5);
  });
  ok("수정 금지 파일 " + 전체 + "개가 전부 그대로다", 전체 === 12 && 맞음 === 전체, 맞음 + "/" + 전체);
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
