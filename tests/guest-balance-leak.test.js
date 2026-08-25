/* tests/guest-balance-leak.test.js
 * =========================================================================
 * P1 — 로그아웃 상태에서 앞사람 잔고가 네 칸에 그대로 보이던 것
 * =========================================================================
 *
 * ── 2026-08-25 실측 ─────────────────────────────────────────────────────
 * 로그인하지 않은 마이페이지에 앞사람 잔고 $5,000.00 이 그대로 떠 있었습니다.
 * 화면은 멀쩡하고 오류도 없어서, 보는 사람은 그게 자기 돈인 줄 압니다.
 * (조용한 고장 — 회원이 그 숫자를 사실로 믿고 판단합니다)
 *
 * 원인 — js/guest-state-guard.js 의 hasTradingData() 가 포지션·거래내역·
 * 미체결만 보고 잔고는 판정 대상에서 빼놨습니다. 거래를 한 번도 안 한 회원이
 * 무료 충전(js/daily-recharge.js)만 받으면 { balance: N } 하나만 저장되는데,
 * 그 상태가 "지울 것 없음" 으로 통과했습니다.
 *
 * ── 이 검사가 tests/guest-state-guard.test.js 와 다른 점 ────────────────
 * 그쪽은 가드 함수의 판정(hasLeftoverBalance / loggedIn / check)을 봅니다.
 * 여기는 판정을 안 봅니다. 실제 index.html 에 진짜 trading.js · ui.js ·
 * mypage.js 를 올려서 "화면 네 칸에 숫자가 실제로 새는지" 를 봅니다.
 * 판정이 맞아도 어느 한 칸이 다른 경로로 값을 가져오면 여전히 샙니다.
 *
 *   #mypage-equity   마이페이지 총자산
 *   #mypage-balance  마이페이지 가용 잔고
 *   #asset-equity    메인 자산탭 총자산      (ui.js 가 만듭니다)
 *   #asset-balance   메인 자산탭 가용 잔고   (ui.js 가 만듭니다)
 *
 * ⚠️ 수정 금지 파일(js/trading.js · js/ui.js)은 읽기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = path.join(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const GUARD_SRC = fs.readFileSync(path.join(REPO, "js", "guest-state-guard.js"), "utf8");

/* App.Storage 가 실제로 쓰는 localStorage 키. js/storage.js 와 같아야 합니다. */
const LS_KEY = "btc_sim_v2_trading";

/* 화면 네 칸 */
const 네칸 = ["mypage-equity", "mypage-balance", "asset-equity", "asset-balance"];

/* -------------------------------------------------------------------------
 * 진짜 사이트를 jsdom 에 올립니다. 네트워크(WS/차트/소리)만 막고,
 * 계산·표시는 실제 파일 그대로 씁니다.
 * ----------------------------------------------------------------------- */
function boot(opts) {
  opts = opts || {};
  const vc = new VirtualConsole();          // 콘솔 소음·reload 오류를 삼킵니다
  vc.on("jsdomError", () => {});
  const dom = new JSDOM(HTML, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://tl.test/",
    virtualConsole: vc,
  });
  const win = dom.window;

  if (opts.saved !== undefined) {
    win.localStorage.setItem(LS_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), state: opts.saved }));
  }

  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.alert = () => {};
  win.AudioContext = function () {
    this.state = "running"; this.currentTime = 0; this.destination = {};
    this.resume = () => {};
    this.createOscillator = () => ({ frequency: {}, connect: (n) => n, start() {}, stop() {} });
    this.createGain = () => ({
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (n) => n });
  };
  win.console = { log() {}, warn() {}, error() {}, info() {} };

  /* main.js 는 자동 부팅하므로 여기서 Bus 만 같은 모양으로 직접 만듭니다. */
  win.eval(
    "window.App = window.App || {};" +
    "App.Bus = (function(){ var L={}; return {" +
    "  on:function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
    "  off:function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
    "  emit:function(e,p){ (L[e]||[]).forEach(function(f){ try{ f(p); }catch(err){} }); }" +
    "}; })();"
  );

  for (const f of ["js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js",
    "js/trading.js", "js/ui.js", "js/mypage.js"]) {
    win.eval(fs.readFileSync(path.join(REPO, f), "utf8"));
  }
  for (const n of ["Trading", "UI", "MyPage"]) {
    if (win.App[n] && typeof win.App[n].init === "function") win.App[n].init();
  }

  /* 가격 틱 한 번 — 실제 사이트에서 매 초 일어나는 일과 같습니다. */
  win.App.Bus.emit("trading:update", win.App.Trading.getSnapshot());

  return {
    win: win,
    doc: win.document,
    읽기: function () {
      const out = {};
      for (const id of 네칸) {
        const el = win.document.getElementById(id);
        out[id] = el ? el.textContent.trim() : "(칸 없음)";
      }
      return out;
    },
  };
}

/* 가드만 따로 돌립니다(진짜 사이트 창과 섞지 않습니다).
   opts.session: null=비회원 / 객체=회원 / opts.noClient=물어볼 수 없음 */
function 가드실행(saved, opts) {
  opts = opts || {};
  const vc = new VirtualConsole();
  vc.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://tl.test/index.html", virtualConsole: vc });
  const win = dom.window;
  const store = { trading: saved };
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
          getSession: async () => ({
            data: { session: opts.session === undefined ? null : opts.session }, error: null }),
        },
      }),
    };
  }
  win.eval(GUARD_SRC);
  return { store: store, G: win.App.GuestStateGuard, win: win };
}

/* 앞사람이 무료 충전만 받고 탭을 닫은 상태 — 실제로 만들어지는 모양입니다. */
function 충전만남은상태() {
  return {
    balance: 5000, leverage: 10, position: null, pendingOrder: null,
    orderHistory: [], closedTrades: [], fundingHistory: [], lastSettledFundingTime: 0,
  };
}

const 회원세션 = { user: { id: "u1" } };

(async function run() {
  console.log("\n비로그인 잔고 노출 — 화면 네 칸");

  /* ------------------------------------------------------------------ */
  section("[1] 재현 — 정리 안 하면 네 칸 전부 샌다");
  {
    const b = boot({ saved: 충전만남은상태() });
    const v = b.읽기();
    for (const id of 네칸) {
      ok("#" + id + " 에 앞사람 잔고가 그대로 뜬다: " + v[id],
        v[id] === "$5,000.00",
        "이 칸이 5,000 을 안 보여주면 이 검사 자체가 헛돕니다(실제 " + v[id] + ")");
    }
    ok("네 칸이 전부 같은 값이다(같은 한 곳에서 온다)",
      네칸.every((id) => v[id] === v[네칸[0]]));
  }

  /* ------------------------------------------------------------------ */
  section("[2] 가드가 지운 뒤 — 네 칸 어디에도 안 남는다");
  {
    const g = 가드실행(충전만남은상태(), { session: null });
    const r = await g.G.check();
    ok("비회원이면 잔고만 남은 찌꺼기도 정리한다", !g.store.trading, r);

    /* 정리 후에는 저장된 것이 없는 상태로 페이지가 다시 열립니다. */
    const b = boot({});                    // 저장된 것 없음
    const v = b.읽기();
    for (const id of 네칸) {
      ok("#" + id + " 은 시작 잔고로 돌아온다: " + v[id], v[id] === "$100,000.00", "실제 " + v[id]);
    }
    ok("네 칸 어디에도 5,000 이라는 숫자가 없다",
      네칸.every((id) => v[id].indexOf("5,000.00") === -1));
    const 본문 = b.doc.body.textContent;
    ok("페이지 어디에도 $5,000.00 이 남아 있지 않다", 본문.indexOf("$5,000.00") === -1);
  }

  /* ------------------------------------------------------------------ */
  section("[3] 회원 것은 절대 안 지운다 — 네 칸이 그대로여야 한다");
  {
    const g = 가드실행(충전만남은상태(), { session: 회원세션 });
    await g.G.check();
    ok("로그인한 회원의 잔고는 남는다", !!g.store.trading);
    const b = boot({ saved: g.store.trading });
    const v = b.읽기();
    ok("회원 화면에는 자기 잔고가 그대로 보인다", v["mypage-balance"] === "$5,000.00", v["mypage-balance"]);
    ok("메인 자산탭도 마찬가지다", v["asset-balance"] === "$5,000.00", v["asset-balance"]);
  }
  {
    const g = 가드실행(충전만남은상태(), { noClient: true });
    await g.G.check();
    ok("로그인 확인이 안 되면(null) 지우지 않는다", !!g.store.trading,
      "여기서 지우면 로그인 복구 중인 회원의 잔고가 날아갑니다");
    const v = boot({ saved: g.store.trading }).읽기();
    ok("확인 불가일 때 네 칸이 전부 살아 있다",
      네칸.every((id) => v[id] === "$5,000.00"), JSON.stringify(v));
  }

  /* ------------------------------------------------------------------ */
  section("[4] 찌꺼기가 들어가는 자리와 가드가 지우는 자리가 같은가");
  {
    const recharge = fs.readFileSync(path.join(REPO, "js", "daily-recharge.js"), "utf8");
    ok("무료 충전이 쓰는 저장 자리가 'trading' 이다",
      /const\s+STORAGE_KEY\s*=\s*"trading"/.test(recharge));
    ok("무료 충전은 balance 만 덮어쓴다(그래서 잔고 하나만 남는다)",
      /saved\.balance\s*=\s*Number\(data\.balance\)/.test(recharge));
    ok("가드가 지우는 자리도 'trading' 이다",
      /var\s+DATA_KEY\s*=\s*"trading"/.test(GUARD_SRC),
      "둘이 어긋나면 지워도 값이 그대로 남습니다");
    const storage = fs.readFileSync(path.join(REPO, "js", "storage.js"), "utf8");
    ok("실제 브라우저 저장 이름이 이 검사가 쓰는 것과 같다",
      storage.indexOf('KEY_PREFIX = "btc_sim_v2_"') !== -1,
      "접두어가 바뀌면 이 검사의 seed 가 헛돌아 통과만 하게 됩니다");
  }

  /* ------------------------------------------------------------------ */
  section("[5] 네 칸이 전부 한 곳에서 값을 받는가");
  {
    const ui = fs.readFileSync(path.join(REPO, "js", "ui.js"), "utf8");
    const mypage = fs.readFileSync(path.join(REPO, "js", "mypage.js"), "utf8");
    ok("메인 자산탭 두 칸이 index.html 이 아니라 ui.js 가 만든다",
      ui.indexOf('id="asset-equity"') !== -1 && ui.indexOf('id="asset-balance"') !== -1);
    ok("마이페이지 두 칸이 index.html 에 있다",
      HTML.indexOf('id="mypage-equity"') !== -1 && HTML.indexOf('id="mypage-balance"') !== -1);
    ok("마이페이지는 trading:update 로만 값을 받는다(따로 읽지 않는다)",
      /App\.Bus\.on\("trading:update"/.test(mypage) && !/Storage\.load/.test(mypage),
      "따로 저장소를 읽으면 가드가 지워도 그 칸만 살아남습니다");
    ok("마이페이지는 계산하지 않고 snapshot 값을 그대로 쓴다",
      /dom\.equity\.textContent\s*=\s*App\.Utils\.formatCurrency\(snapshot\.equity\)/.test(mypage) &&
      /dom\.balance\.textContent\s*=\s*App\.Utils\.formatCurrency\(snapshot\.balance\)/.test(mypage));
    ok("가드는 index.html 에 연결돼 있다", HTML.indexOf("js/guest-state-guard.js") !== -1);
  }

  /* ------------------------------------------------------------------ */
  section("[6] 기준값이 어긋나지 않았다");
  {
    const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");
    ok("trading.js 의 시작 자산은 100,000 이다", /const INITIAL_BALANCE = 100000/.test(trading));
    ok("가드의 기준 잔고도 100,000 이다", /var DEFAULT_BALANCE = 100000/.test(GUARD_SRC),
      "둘이 어긋나면 시작 잔고를 찌꺼기로 오해해 회원 데이터를 지웁니다");
    ok("가드가 잔고까지 보는지 실제로 확인한다(hasTradingData 안에서 호출)",
      /function hasTradingData\(\)[\s\S]{0,400}hasLeftoverBalance\(d\)/.test(GUARD_SRC),
      "여기서 hasLeftoverBalance 가 빠지면 2026-08-25 P1 이 그대로 재발합니다");
  }

  /* ------------------------------------------------------------------ */
  section("[7] 수정 금지 파일을 건드리지 않았다");
  {
    const crypto = require("crypto");
    const md5 = (f) => crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
    const 기준 = {
      "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
      "ui.js": "333fc427e75b47b306699c92aa4e7b50",
      "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    };
    for (const f of Object.keys(기준)) {
      ok(f + " 를 한 글자도 안 고쳤다", md5(f) === 기준[f], "지금 " + md5(f));
    }
  }

  /* ------------------------------------------------------------------ */
  section("[8] package.json 에 들어 있다");
  {
    const pkg = fs.readFileSync(path.join(REPO, "package.json"), "utf8");
    ok("npm test 목록에 이 파일이 있다", pkg.includes("tests/guest-balance-leak.test.js"),
      "목록에 없으면 아무도 안 돌립니다");
  }

  console.log("\n통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
  process.exit(0);
})();
