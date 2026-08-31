/* tests/sync-guard-baseline-unknown.test.js
 * =========================================================================
 * 손실 판정 기준값 — 못 읽었으면 0 이 아니라 "모름" (2026-08-31 수리팀)
 * =========================================================================
 * ⚠️ 이 파일은 **고친 뒤의 올바른 동작**을 지킵니다.
 *    "지금 이렇다" 를 기록한 봉인은 tests/sync-guard-baseline-blindspot.test.js
 *    쪽입니다. 그 파일의 [1] 4건은 이 수정으로 터지는 것이 정상입니다
 *    (수리팀이 고치지 않고 PM 에게 보고했습니다).
 *
 * 무엇이 터져 있었나
 * ------------------
 * Supabase 는 조회가 실패해도 예외를 안 던지고 { data:null, error:{...} } 로
 * **정상 resolve** 합니다. js/sync-guard.js 는 그 .error 를 안 보고
 * data 가 null 이라는 이유로 기준값에 0 을 넣었습니다.
 *
 *     기준값 { realizedPnl: 0, tradeCount: 0 }
 *       = "서버가 텅 빈 새 계정" 과 글자 그대로 구별 불가
 *       -> looksLikeDataLoss 의 세 갈래가 전부 false
 *       -> 권한 오류·네트워크 오류 한 번에 보호막이 조용히 꺼짐
 *
 * 이 파일이 지키는 것
 * -------------------
 *   1) 조회가 오류면 기준값이 0 이 되지 않는다 — "모름"(null) 이다
 *   2) 모르는 것을 밖에서 알 수 있다 — getStatus() · 서버 메시지 그대로
 *   3) 모르면 판정하지 않는다. 다만 몇 번 넘겼는지 센다(조용히 넘기지 않음)
 *   4) ⭐ 서버가 되는 평소에는 예전과 똑같다 (기준값·판정 그대로)
 *   5) 계정 행이 없는 새 계정(정상 응답)은 0 으로 읽는 게 맞다 — 오류와 구분
 *   6) 한 번 제대로 읽은 기준값은 나중 실패가 지우지 않는다
 *   7) 판정식(5곳)은 한 글자도 안 바뀌었다
 *
 * ⚠️ 실서버에 붙지 않습니다. App.SupabaseClient 를 가짜로 바꿔치기합니다.
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
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* -------------------------------------------------------------------------
 * 가짜 Supabase — 실패해도 reject 하지 않고 { data:null, error } 로 resolve
 * 합니다. 진짜 Supabase 가 그렇게 동작하기 때문입니다.
 * ----------------------------------------------------------------------- */
function 가짜클라이언트(계정응답, 거래응답, 로그인) {
  return {
    auth: {
      getUser: () =>
        Promise.resolve(로그인 === false ? { data: { user: null } } : { data: { user: { id: "user-1" } } }),
    },
    from: function (표이름) {
      return {
        select: function () {
          return {
            eq: function () {
              if (표이름 === "trading_accounts") {
                return { maybeSingle: () => Promise.resolve(계정응답) };
              }
              return Promise.resolve(거래응답);
            },
          };
        },
      };
    },
  };
}

function 창만들기() {
  const 기록 = { error: [], warn: [], timers: [] };
  const sandbox = {
    console: {
      warn(...a) { 기록.warn.push(a.join(" ")); },
      log() {},
      error(...a) { 기록.error.push(a.join(" ")); },
    },
    setTimeout: (fn, ms) => { 기록.timers.push(ms); return 0; },
    setInterval: () => 0,
    clearInterval: () => {},
    document: {
      readyState: "complete",
      addEventListener() {},
      createElement: () => ({ className: "", innerHTML: "", addEventListener() {} }),
      getElementById: () => null,
      body: { appendChild() {} },
    },
    Promise: Promise,
  };
  sandbox.window = sandbox;
  sandbox.App = {};
  sandbox.기록 = 기록;
  vm.createContext(sandbox);
  vm.runInContext(read("js/sync-guard.js"), sandbox);
  return sandbox;
}

const 텅빈스냅 = { closedTrades: [], realizedPnl: 0, balance: 10000000 };
const 오류 = { message: "permission denied for table trades", code: "42501" };

async function main() {
  /* =======================================================================
   * [1] 조회가 오류면 기준값이 0 이 되지 않는다
   * ===================================================================== */
  절("[1] 조회가 오류면 기준값이 0 이 아니라 '모름' 이다");
  {
    const t = 창만들기();
    t.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: null, error: 오류 }, { count: null, error: 오류 }),
    };
    await t.App.SyncGuard.loadBaseline();
    const 기준 = t.App.SyncGuard._getBaseline();

    ok("기준값이 { 0, 0 } 이 아니다", JSON.stringify(기준) !== JSON.stringify({ realizedPnl: 0, tradeCount: 0 }),
      "0 으로 두면 '서버가 텅 빈 새 계정' 과 구별이 안 됩니다");
    ok("기준값이 '모름'(null) 이다", 기준 === null, JSON.stringify(기준));
    ok("isBaselineKnown() 이 false 다", t.App.SyncGuard.isBaselineKnown() === false);
    ok("state 가 '실패' 다", t.App.SyncGuard.getStatus().state === "실패",
      JSON.stringify(t.App.SyncGuard.getStatus()));
  }

  /* =======================================================================
   * [2] 모르는 것을 밖에서 알 수 있다 — 오류를 감추지 않는다
   * ===================================================================== */
  절("[2] 오류를 감추지 않는다 (서버가 준 말 그대로)");
  {
    const t = 창만들기();
    t.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: null, error: 오류 }, { count: null, error: 오류 }),
    };
    await t.App.SyncGuard.loadBaseline();
    const 상태 = t.App.SyncGuard.getStatus();

    ok("getStatus().error 에 서버 메시지가 그대로 들어 있다",
      String(상태.error).indexOf("permission denied for table trades") >= 0, JSON.stringify(상태));
    ok("콘솔에도 서버 메시지를 그대로 찍는다",
      t.기록.error.join(" ").indexOf("permission denied for table trades") >= 0,
      JSON.stringify(t.기록.error));
    ok("'실패했습니다' 로 뭉개지 않는다",
      t.기록.error.join(" ").indexOf("판정을 하지 않습니다") >= 0,
      "무엇이 꺼졌는지도 같이 알려야 합니다");
    ok("다시 읽으려고 예약한다(5초)", t.기록.timers.indexOf(5000) >= 0, JSON.stringify(t.기록.timers));
  }

  /* =======================================================================
   * [3] 모르면 판정하지 않는다 — 다만 조용히 넘기지는 않는다
   * ===================================================================== */
  절("[3] 모르면 판정하지 않는다 (넘긴 횟수는 센다)");
  {
    const t = 창만들기();
    t.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: null, error: 오류 }, { count: null, error: 오류 }),
    };
    await t.App.SyncGuard.loadBaseline();

    ok("모르는 상태에서는 '잃었다' 고 하지 않는다",
      t.App.SyncGuard.looksLikeDataLoss(텅빈스냅) === false,
      "모르는데 경고를 띄우면 멀쩡한 회원이 놀랍니다");
    ok("모르는 채로 넘긴 횟수를 센다", t.App.SyncGuard.getStatus().skippedUnknown === 1,
      JSON.stringify(t.App.SyncGuard.getStatus()));
    t.App.SyncGuard.looksLikeDataLoss(텅빈스냅);
    ok("두 번 넘기면 2 가 된다", t.App.SyncGuard.getStatus().skippedUnknown === 2);
  }

  /* =======================================================================
   * [4] ⭐ 서버가 되는 평소에는 예전과 똑같다
   * ===================================================================== */
  절("[4] ⭐ 평소(정상 응답)에는 기준값도 판정도 예전 그대로");
  {
    const t = 창만들기();
    t.App.SupabaseClient = {
      get: () => 가짜클라이언트(
        { data: { realized_pnl: 5230000 }, error: null },
        { count: 37, error: null }
      ),
    };
    await t.App.SyncGuard.loadBaseline();
    const 기준 = t.App.SyncGuard._getBaseline();

    ok("실현손익을 서버 값 그대로 읽는다(5,230,000)", 기준 && 기준.realizedPnl === 5230000, JSON.stringify(기준));
    ok("거래 건수를 서버 값 그대로 읽는다(37)", 기준 && 기준.tradeCount === 37, JSON.stringify(기준));
    ok("어디서 온 값인지 적어둔다(source=server)", 기준 && 기준.source === "server");
    ok("state 가 '읽음' 이다", t.App.SyncGuard.getStatus().state === "읽음");
    ok("텅 빈 로컬은 유실로 판정한다", t.App.SyncGuard.looksLikeDataLoss(텅빈스냅) === true);
    ok("37 → 5 건으로 줄어든 것도 유실로 판정한다",
      t.App.SyncGuard.looksLikeDataLoss({ closedTrades: new Array(5).fill({ pnl: 1 }), realizedPnl: 100 }) === true);
    ok("같은 37건은 막지 않는다",
      t.App.SyncGuard.looksLikeDataLoss({ closedTrades: new Array(37).fill({ pnl: 1 }), realizedPnl: 5230000 }) === false);
    ok("정상일 때는 넘긴 횟수가 안 늘어난다", t.App.SyncGuard.getStatus().skippedUnknown === 0);
    ok("정상일 때는 다시 읽으려고 예약하지 않는다", t.기록.timers.indexOf(5000) === -1, JSON.stringify(t.기록.timers));
  }

  /* =======================================================================
   * [5] 오류와 "진짜 비어 있음" 을 구분한다
   * ===================================================================== */
  절("[5] 오류와 '진짜 비어 있는 새 계정' 을 구분한다");
  {
    /* 계정 행이 아직 없는 새 계정 — 오류가 아니라 정상 응답입니다 */
    const t = 창만들기();
    t.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: null, error: null }, { count: 0, error: null }),
    };
    await t.App.SyncGuard.loadBaseline();
    const 기준 = t.App.SyncGuard._getBaseline();
    ok("새 계정(정상 응답)은 { 0, 0 } 으로 읽는다", !!기준 && 기준.realizedPnl === 0 && 기준.tradeCount === 0,
      JSON.stringify(기준));
    ok("그때는 state 가 '읽음' 이다(오류와 다름)", t.App.SyncGuard.getStatus().state === "읽음");

    /* 오류는 없는데 건수를 못 받은 경우 — 0 으로 두지 않습니다 */
    const t2 = 창만들기();
    t2.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: { realized_pnl: 100 }, error: null }, { count: null, error: null }),
    };
    await t2.App.SyncGuard.loadBaseline();
    ok("건수를 못 받으면(count 가 null) 모름으로 둔다", t2.App.SyncGuard._getBaseline() === null,
      JSON.stringify(t2.App.SyncGuard._getBaseline()));

    /* 로그아웃 — 오류가 아니라 '기준값이 없는 상태' 입니다 */
    const t3 = 창만들기();
    t3.App.SupabaseClient = {
      get: () => 가짜클라이언트({ data: null, error: null }, { count: 0, error: null }, false),
    };
    await t3.App.SyncGuard.loadBaseline();
    ok("로그아웃 상태는 '모름' 이고 오류가 아니다",
      t3.App.SyncGuard._getBaseline() === null && t3.App.SyncGuard.getStatus().state === "모름",
      JSON.stringify(t3.App.SyncGuard.getStatus()));
    ok("로그아웃일 때는 다시 읽으려고 예약하지 않는다",
      t3.기록.timers.indexOf(5000) === -1, JSON.stringify(t3.기록.timers));
  }

  /* =======================================================================
   * [6] 한 번 제대로 읽은 기준값은 나중 실패가 지우지 않는다
   * ===================================================================== */
  절("[6] 잘 읽어둔 기준값을 나중 실패가 지우지 않는다");
  {
    const t = 창만들기();
    let 실패로바꾸기 = false;
    t.App.SupabaseClient = {
      get: () => 실패로바꾸기
        ? 가짜클라이언트({ data: null, error: 오류 }, { count: null, error: 오류 })
        : 가짜클라이언트({ data: { realized_pnl: 5230000 }, error: null }, { count: 37, error: null }),
    };
    await t.App.SyncGuard.loadBaseline();
    실패로바꾸기 = true;
    await t.App.SyncGuard.loadBaseline();

    const 기준 = t.App.SyncGuard._getBaseline();
    ok("먼저 읽어둔 서버 값이 그대로 남아 있다", !!기준 && 기준.tradeCount === 37, JSON.stringify(기준));
    ok("그래서 보호가 계속 동작한다", t.App.SyncGuard.looksLikeDataLoss(텅빈스냅) === true,
      "오래된 값이라도 '모름' 보다는 낫습니다");
    ok("다만 마지막 조회가 실패했다는 것은 남긴다", t.App.SyncGuard.getStatus().state === "실패");
  }

  /* =======================================================================
   * [7] 판정식은 한 글자도 안 바꿨다
   * ===================================================================== */
  절("[7] 손익·유실 판정식 자체는 그대로");
  {
    const 코드 = 주석제거(read("js/sync-guard.js"));
    const 손실판정 = (코드.match(/function looksLikeDataLoss[\s\S]*?\n  \}/) || [""])[0];
    const 전제조건수 = (손실판정.match(/serverBaseline\.(tradeCount|realizedPnl)/g) || []).length;
    ok("기준값에 기대는 곳이 그대로 5곳이다 (지금 " + 전제조건수 + "곳)", 전제조건수 === 5);
    ok("200건 상한 규칙 그대로", /serverBaseline\.tradeCount < 200/.test(손실판정));
    ok("거래 0건인데 서버에 기록 있으면 유실 규칙 그대로",
      /localTrades === 0 && serverBaseline\.tradeCount > 0/.test(손실판정));
    ok("실현손익 0 규칙 그대로",
      /Math\.abs\(serverBaseline\.realizedPnl\) > 1/.test(손실판정));

    /* 기준값을 만드는 곳이 .error 를 실제로 본다 */
    ok("기준값을 만들기 전에 .error 를 본다",
      /var err = acc\.error \|\| trd\.error/.test(코드),
      "이게 없으면 이 수정이 사라진 것입니다");
    ok("실패를 0 으로 두지 않는다",
      !/serverBaseline\s*=\s*\{\s*realizedPnl:\s*rows\[0\]/.test(코드));

    /* 수정 금지 파일은 안 건드렸다 */
    ok("supabase-sync.js 는 여전히 이 모듈을 모른다",
      !/SyncGuard/.test(read("js/supabase-sync.js")));
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패한 것");
    실패목록.forEach((m) => console.log("  - " + m));
    console.log("실패 있음 ❌");
  } else {
    console.log("전체 통과 ✅");
  }
  process.exit(fail ? 1 : 0);
}

main();
