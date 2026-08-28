/* tests/guest-state-guard.test.js
 * 로그아웃 버튼을 안 누르고 나갔을 때 남는 거래 데이터를 정리하는 장치.
 *
 * 가장 중요한 것
 *   회원 데이터를 절대 지우면 안 됩니다.
 *   회원이 접속하는 순간에도 잠깐은 "로그인 안 된 상태"로 보이기 때문에,
 *   화면 상태가 아니라 로그인 서버 응답만 믿어야 합니다.
 *   확신이 없으면(서버에 못 물어보면) 남기는 쪽이 정답입니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "guest-state-guard.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 거래 흔적이 있는 상태 하나 */
function 거래데이터() {
  return {
    balance: 12345,
    position: { symbol: "BTCUSDT", side: "long", qty: 179.48 },
    closedTrades: [{ pnl: -8079358 }],
  };
}

/* opts.session   : getSession 이 돌려줄 값 (null = 비회원)
 * opts.sessionErr: getSession 이 오류를 돌려줌
 * opts.throws    : getSession 이 터짐
 * opts.noClient  : Supabase 에 연결 못 하는 상황
 * opts.data      : 시작할 때 들어 있는 거래 데이터
 * opts.reloaded  : 이미 한 번 새로고침한 상태 */
function boot(opts) {
  opts = opts || {};
  /* jsdom 은 location.reload 를 바꿔치기할 수 없게 막아둡니다.
     대신 실제로 부르면 "navigation" 오류를 내보내므로 그걸 셉니다. */
  const reloads = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => {
    if (/navigation|reload/i.test(String(e && e.message))) reloads.push(1);
  });
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://tl.test/index.html", virtualConsole: vc });
  const win = dom.window;
  const store = {};

  if (opts.data !== undefined) store.trading = opts.data;
  if (opts.owner !== undefined) store["trading-owner"] = { nickname: opts.owner };
  if (opts.settings !== undefined) store.settings = opts.settings;

  win.App = {
    Storage: {
      load: (k) => (k in store ? store[k] : null),
      save: (k, v) => { store[k] = v; return true; },
      clear: (k) => { delete store[k]; return true; },
    },
  };
  win.console = { warn() {}, log() {}, error() {} };

  if (!opts.noClient) {
    win.App.SupabaseClient = {
      get: () => ({
        auth: {
          getSession: async () => {
            if (opts.throws) throw new Error("네트워크 끊김");
            if (opts.sessionErr) return { data: { session: null }, error: { message: "실패" } };
            return { data: { session: opts.session === undefined ? null : opts.session }, error: null };
          },
        },
      }),
    };
  }

  if (opts.reloaded) win.sessionStorage.setItem("tl_guest_state_cleared", "1");

  win.eval(SRC);
  return { win, store, reloads, G: win.App.GuestStateGuard };
}

const 회원세션 = { user: { id: "u1" } };

(async function run() {
  console.log("\n비회원 거래 데이터 정리");

  /* ---------- 절대 지우면 안 되는 경우들 ---------- */
  {
    const { store, reloads, G } = boot({ session: 회원세션, data: 거래데이터() });
    const r = await G.check();
    ok("로그인한 회원의 데이터는 지우지 않는다", !!store.trading, r);
    ok("회원일 때는 새로고침도 하지 않는다", reloads.length === 0);
  }
  {
    const { store, reloads, G } = boot({ noClient: true, data: 거래데이터() });
    const r = await G.check();
    ok("로그인 서버에 못 물어보면 그대로 둔다", !!store.trading, r);
    ok("못 물어봤을 때 새로고침하지 않는다", reloads.length === 0);
  }
  {
    const { store, G } = boot({ sessionErr: true, data: 거래데이터() });
    const r = await G.check();
    ok("확인 요청이 실패하면 그대로 둔다", !!store.trading, r);
  }
  {
    const { store, G } = boot({ throws: true, data: 거래데이터() });
    const r = await G.check();
    ok("확인 중 오류가 나도 그대로 둔다(터지지 않는다)", !!store.trading, r);
  }

  /* ---------- 지워야 하는 경우 ---------- */
  {
    const { store, reloads, G } = boot({ session: null, data: 거래데이터(), owner: "앞사람" });
    const r = await G.check();
    ok("비회원인데 남아 있으면 지운다", !store.trading, r);
    ok("주인 표시도 같이 지운다", !store["trading-owner"]);
    ok("지운 뒤 페이지를 다시 연다", reloads.length === 1,
      "trading.js 가 메모리의 옛 데이터를 다시 저장하기 전에 열어야 합니다");
  }
  {
    /* 화면 설정은 개인 거래 기록이 아니므로 남깁니다. */
    const { store, G } = boot({ session: null, data: 거래데이터(), settings: { displayCurrency: "USDT" } });
    await G.check();
    ok("테마·표시 통화 같은 화면 설정은 건드리지 않는다", !!store.settings);
  }

  /* ---------- 지울 것이 없을 때 ---------- */
  {
    const { reloads, G } = boot({ session: null });
    const r = await G.check();
    ok("거래 데이터가 아예 없으면 아무것도 안 한다", r === "지울 것 없음", r);
    ok("괜히 새로고침하지 않는다", reloads.length === 0);
  }
  {
    /* 시작 잔고 그대로 = 아무도 아무것도 안 한 상태입니다.
       (예전에는 여기 150000000 이 들어 있었는데, 그건 기본값이 아니라
        앞사람이 남긴 잔고와 구분이 안 되는 값이었습니다.) */
    const 빈상태 = { balance: 100000, position: null, closedTrades: [] };
    const { store, reloads, G } = boot({ session: null, data: 빈상태 });
    const r = await G.check();
    ok("거래 흔적 없는 초기 상태는 지우지 않는다", !!store.trading, r);
    ok("초기 상태에서는 새로고침하지 않는다", reloads.length === 0);
  }

  /* ---------- 잔고만 남은 찌꺼기 (2026-08-25 P1) ----------
   * js/daily-recharge.js 는 무료 충전 뒤 { balance: N } 만 저장합니다.
   * 거래를 한 번도 안 한 회원이 충전만 받고 로그아웃 없이 탭을 닫으면
   * 잔고 하나만 남고, 예전 가드는 이걸 "지울 것 없음" 으로 통과시켰습니다.
   * 그 결과 다음 사람의 마이페이지 총자산·가용잔고와 메인 자산탭에
   * 앞사람 잔고가 그대로 보였습니다. */
  {
    const 충전만 = {
      balance: 5000, leverage: 10, position: null, pendingOrder: null,
      orderHistory: [], closedTrades: [], fundingHistory: [], lastSettledFundingTime: 0,
    };
    const { store, G } = boot({ session: null, data: 충전만 });
    const r = await G.check();
    ok("잔고만 남아 있어도 정리한다(무료 충전 뒤 탭 닫기)", !store.trading, r);
  }
  {
    const { store, G } = boot({ session: null, data: { balance: 250000, closedTrades: [] } });
    await G.check();
    ok("기본값보다 많은 잔고도 정리한다", !store.trading);
  }
  {
    /* 가장 중요 — 회원의 잔고는 절대 지우지 않습니다. */
    const { store, reloads, G } = boot({ session: 회원세션, data: { balance: 5000, closedTrades: [] } });
    const r = await G.check();
    ok("로그인한 회원의 잔고는 지우지 않는다", !!store.trading, r);
    ok("회원 잔고에는 새로고침도 하지 않는다", reloads.length === 0);
  }
  {
    const { store, G } = boot({ noClient: true, data: { balance: 5000, closedTrades: [] } });
    const r = await G.check();
    ok("잔고만 남았어도 로그인 확인이 안 되면 그대로 둔다", !!store.trading, r,
      "로그인 직후 잠깐 비회원으로 보이는 구간에서 지우면 회원 데이터가 날아갑니다");
  }
  {
    const { store, G } = boot({ sessionErr: true, data: { balance: 5000, closedTrades: [] } });
    await G.check();
    ok("확인 요청이 실패하면 잔고도 그대로 둔다", !!store.trading);
  }
  {
    /* 판단 함수 자체 */
    const { G } = boot({ session: null });
    ok("시작 잔고는 찌꺼기가 아니다", G.hasLeftoverBalance({ balance: 100000 }) === false);
    ok("시작 잔고 문자열도 찌꺼기가 아니다", G.hasLeftoverBalance({ balance: "100000" }) === false);
    ok("기본값과 다른 잔고는 찌꺼기다", G.hasLeftoverBalance({ balance: 5000 }) === true);
    ok("잔고 칸 자체가 없으면 판단하지 않는다", G.hasLeftoverBalance({ closedTrades: [] }) === false);
    ok("숫자가 아니면 판단하지 않는다", G.hasLeftoverBalance({ balance: "알수없음" }) === false);
    ok("빈 값이어도 터지지 않는다", G.hasLeftoverBalance(null) === false);
    ok("기준 잔고는 trading.js 의 초기자산과 같다", G.DEFAULT_BALANCE === 100000);
  }
  {
    /* 미체결 지정가만 걸어둔 것도 지난 사람의 흔적입니다. */
    const { store, G } = boot({ session: null, data: { pendingOrder: { price: 100 }, closedTrades: [] } });
    await G.check();
    ok("미체결 주문만 남아 있어도 정리한다", !store.trading);
  }
  {
    /* 청산 후 거래내역만 남은 경우도 남의 성적입니다. */
    const { store, G } = boot({ session: null, data: { position: null, closedTrades: [{ pnl: 1 }] } });
    await G.check();
    ok("거래내역만 남아 있어도 정리한다", !store.trading);
  }

  /* ---------- 새로고침이 반복되지 않는다 ---------- */
  {
    const { store, reloads, G } = boot({ session: null, data: 거래데이터(), reloaded: true });
    const r = await G.check();
    ok("이미 한 번 새로고침했으면 또 하지 않는다", reloads.length === 0, r);
    ok("그래도 데이터는 지운다", !store.trading);
  }
  {
    const b = boot({ session: null, data: 거래데이터() });
    await b.G.check();
    b.store.trading = 거래데이터();   // 다시 생겼다고 가정
    await b.G.check();
    ok("연속 호출에도 새로고침은 한 번뿐이다", b.reloads.length === 1, "실제 " + b.reloads.length + "회");
  }

  /* ---------- 회원으로 확인되면 표시를 되돌린다 ---------- */
  {
    const { win, G } = boot({ session: 회원세션, data: 거래데이터(), reloaded: true });
    await G.check();
    ok("회원으로 확인되면 새로고침 표시를 지운다",
      win.sessionStorage.getItem("tl_guest_state_cleared") === null,
      "안 지우면 나중에 로그아웃했을 때 정리가 안 됩니다");
  }

  /* ---------- 판단 함수 자체 ---------- */
  {
    const { G } = boot({ session: 회원세션 });
    ok("세션이 있으면 회원", (await G.loggedIn()) === true);
  }
  {
    const { G } = boot({ session: null });
    ok("세션이 없으면 비회원", (await G.loggedIn()) === false);
  }
  {
    const { G } = boot({ noClient: true });
    ok("물어볼 수 없으면 '모름'(비회원으로 단정하지 않는다)", (await G.loggedIn()) === null,
      "여기서 false 를 돌려주면 회원 데이터가 지워집니다");
  }
  {
    const { G } = boot({ sessionErr: true });
    ok("응답이 오류면 '모름'", (await G.loggedIn()) === null);
  }

  /* ---------- 수정 금지 파일 ---------- */
  {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok("index.html 에 연결돼 있다", html.includes("js/guest-state-guard.js"));
    ok("account-isolation.js 와 같은 저장 키를 쓴다(둘이 어긋나면 안 됨)",
      SRC.includes('"trading-owner"') &&
      fs.readFileSync(path.join(REPO, "js", "account-isolation.js"), "utf8").includes('"trading-owner"'));
    ok("auth.js 를 건드리지 않았다",
      !fs.readFileSync(path.join(REPO, "js", "auth.js"), "utf8").includes("guest-state-guard"));
    const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
    ok("trading.js 를 건드리지 않았다", !trading.includes("guest-state-guard"));
    ok("가드의 기준 잔고가 trading.js 의 초기자산과 어긋나지 않는다",
      /const INITIAL_BALANCE = 100000/.test(trading) && /var DEFAULT_BALANCE = 100000/.test(SRC),
      "trading.js 의 INITIAL_BALANCE 가 바뀌면 guest-state-guard.js 의 DEFAULT_BALANCE 도 같이 바꿔야 합니다");
  }

  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
})();
