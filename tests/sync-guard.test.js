/* tests/sync-guard.test.js
 * 로컬이 비었을 때 서버 기록을 지키되, 잔고 저장은 막지 않는지 검증합니다.
 *
 * 처음 만들 때 실수했습니다.
 *   trading:persisted 이벤트를 통째로 막았는데, 그 이벤트 하나에
 *   잔고·포지션·거래·주문 저장이 모두 들어 있습니다.
 *   막으니 잔고까지 서버에 안 올라가서, 새로고침할 때마다 지갑이
 *   시작값(1.5억)으로 되돌아갔습니다.
 *   지금은 이벤트는 보내되 거래 기록만 비워서 넘깁니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

function boot() {
  const sent = [];
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    document: {
      readyState: "complete", addEventListener() {},
      createElement: () => ({ className: "", innerHTML: "", addEventListener() {} }),
      getElementById: () => null, body: { appendChild() {} },
    },
    location: { reload() {} },
    module: { exports: {} },
  };
  sandbox.window = sandbox;
  sandbox.App = { Bus: { emit(n, p) { sent.push({ name: n, payload: p }); }, on() {} } };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "sync-guard.js"), "utf8"), sandbox);
  sandbox.App.SyncGuard.init();
  return { App: sandbox.App, sent, G: sandbox.App.SyncGuard };
}

console.log("\n서버 기록 보호");

/* ---------- 잔고 저장을 막으면 안 된다 ---------- */
{
  const { App, sent, G } = boot();
  G._setBaseline({ realizedPnl: -176162, tradeCount: 8 });

  App.Bus.emit("trading:persisted", { closedTrades: [], balance: 88000, realizedPnl: 0 });
  const last = sent[sent.length - 1];

  ok("유실이 의심돼도 이벤트는 전달한다", !!last && last.name === "trading:persisted");
  ok("잔고는 그대로 전달한다(안 그러면 지갑이 초기화됨)", last.payload.balance === 88000, String(last.payload.balance));
  /* 처음에는 closedTrades 를 비워서 넘겼는데, 알림 모듈이 그걸 보고
     기준을 0 으로 되돌려 같은 알림을 200번 보냈습니다(채팅 도배).
     게다가 supabase-sync 는 거래를 추가만 하고 지우지 않으므로
     그 보호는 애초에 필요 없었습니다. 지금은 알리기만 합니다. */
  ok("거래 목록을 건드리지 않는다(알림 도배 방지)", Array.isArray(last.payload.closedTrades));
  ok("막은 횟수를 센다", G.getBlockedCount() === 1);
}

/* ---------- 정상 저장은 손대지 않는다 ---------- */
{
  const { App, sent, G } = boot();
  G._setBaseline({ realizedPnl: -176162, tradeCount: 8 });

  App.Bus.emit("trading:persisted", { closedTrades: new Array(9), balance: 95000, realizedPnl: -180000 });
  const last = sent[sent.length - 1];
  ok("거래가 늘면 그대로 통과", last.payload.closedTrades.length === 9);
  ok("잔고도 그대로", last.payload.balance === 95000);
  ok("막지 않는다", G.getBlockedCount() === 0);
}

/* ---------- 유실 판정 ---------- */
{
  const { G } = boot();
  G._setBaseline({ realizedPnl: 20000000, tradeCount: 57 });

  ok("거래 늘고 손익 반영 -> 정상", !G.looksLikeDataLoss({ closedTrades: new Array(58), realizedPnl: 20100000 }));
  ok("손실이라 손익 줄어듦 -> 정상", !G.looksLikeDataLoss({ closedTrades: new Array(58), realizedPnl: 19000000 }));
  ok("거래 0건 -> 유실", G.looksLikeDataLoss({ closedTrades: [], realizedPnl: 0 }));
  ok("거래 건수가 줄어듦 -> 유실", G.looksLikeDataLoss({ closedTrades: new Array(3), realizedPnl: -155 }));
  ok("기준값이 없으면 판단하지 않는다", (() => { const b = boot(); return !b.G.looksLikeDataLoss({ closedTrades: [] }); })());
}

/* ---------- 원본을 훼손하지 않는다 ---------- */
{
  const { App, G } = boot();
  G._setBaseline({ realizedPnl: -1, tradeCount: 8 });
  const original = { closedTrades: new Array(2), balance: 77000, realizedPnl: -5 };
  App.Bus.emit("trading:persisted", original);
  ok("넘긴 원본 객체를 훼손하지 않는다", original.closedTrades.length === 2, String(original.closedTrades.length));
}

/* ---------- 연결 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "sync-guard.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const tags = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);

  ok("supabase-sync 보다 먼저 실린다", at("js/sync-guard.js") >= 0 && at("js/sync-guard.js") < at("js/supabase-sync.js"));
  /* ── ⚠️ 2026-08-31 갱신 — ★주석 글자에 기대던 검사★ 였습니다 ──────────────
     예전:
         ok("이벤트를 통째로 막지 않는다(잔고 저장 보호)",
            !/return undefined;\s*\/\/ 서버로/.test(src));

     이건 ★없어야 할 것이 없다★ 를 보는 검사인데, 찾는 글자에 ★주석★ 이
     섞여 있었습니다. 그래서 누가 이벤트를 다시 막아버려도
     주석을 안 쓰거나 다르게 쓰면 ★그대로 통과★ 합니다.
     막힌 것은 오류도 안 나고 화면도 멀쩡합니다 — 회원 잔고가 조용히
     서버에 안 올라갑니다. 우리가 P1 로 부르는 조용한 고장입니다.

     같은 날 tests/mmr-fallback-blindspot.test.js 도 같은 함정을 밟았습니다
     (주석에 파일명이 있어서 로드 줄을 지워도 통과). CLAUDE.md 가 적어둔
     "문자열 검사는 못 쓴다. 주석에 파일명이 적혀 있어 오탐이 난다" 그대로입니다.

     그래서 두 가지로 바꿉니다 —
       (1) ★실제로 돌려서★ 원본 emit 이 불렸는지 본다  ← 주석과 무관
       (2) 소스는 ★주석을 걷어낸 뒤★ 본다              ← 주석과 무관 */
  {
    /* (1) 동작 — 데이터 유실로 판정해 '막은' 상황에서도 원본 emit 은 그대로 불려야 합니다.
       (막는다 = 회원에게 알린다는 뜻이지, 이벤트를 삼킨다는 뜻이 아닙니다) */
    const b = boot();
    b.G._setBaseline({ realizedPnl: 20000000, tradeCount: 57 });
    const 보낸수_전 = b.sent.length;
    const 원본payload = { closedTrades: [], balance: 88000, realizedPnl: 0 };
    b.App.Bus.emit("trading:persisted", 원본payload);
    const 마지막 = b.sent[b.sent.length - 1];
    ok("유실로 판정해도 원본 emit 이 그대로 불린다", b.sent.length === 보낸수_전 + 1,
      "보낸 수 " + 보낸수_전 + " → " + b.sent.length + " (이벤트를 삼키면 잔고가 서버에 안 올라갑니다)");
    ok("삼키지 않고 payload 를 그대로 넘긴다", !!마지막 && 마지막.payload === 원본payload);
    ok("그러면서 막은 횟수는 센다 (알리기는 한다)", b.G.getBlockedCount() === 1,
      String(b.G.getBlockedCount()));
  }
  {
    /* (2) 소스 — 주석을 걷어낸 뒤 emit 감싼 함수 안을 봅니다.
       마지막 return orig.apply(...) 말고 다른 return 이 있으면 이벤트를 삼키는 길이 생긴 것입니다. */
    const 코드만 = src
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    const 시작 = 코드만.indexOf("App.Bus.emit = function");
    const 끝 = 코드만.indexOf("return orig.apply(App.Bus, arguments);", 시작);
    ok("emit 감싼 함수를 찾았다 (구조가 바뀌면 여기서 알려줍니다)", 시작 !== -1 && 끝 > 시작,
      "시작 " + 시작 + " / 끝 " + 끝);
    if (시작 !== -1 && 끝 > 시작) {
      const 본문 = 코드만.slice(시작, 끝);
      const 이른return = 본문.match(/\breturn\b/g) || [];
      ok("이벤트를 통째로 막지 않는다 (원본 호출 전에 return 이 없다)",
        이른return.length === 0,
        "원본 emit 을 부르기 전에 return 이 " + 이른return.length + "개 있습니다 — 이벤트를 삼키면" +
          " 회원 잔고가 조용히 서버에 안 올라갑니다");
    }
  }
  ok("payload 를 바꾸지 않는다(알림 도배 방지)", !/safe\.closedTrades = \[\]/.test(src));
  ok("왜 건드리면 안 되는지 적어뒀다", /같은 알림을 200번/.test(src));
  ok("서버 기록은 추가만 되어 안전하다는 근거를 적어뒀다", /서버 기록을 지우지 않습니다/.test(src));
  ok("supabase-sync 는 건드리지 않았다", !/SyncGuard/.test(fs.readFileSync(path.join(REPO, "js", "supabase-sync.js"), "utf8")));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
