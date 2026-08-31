/* tests/sync-guard-baseline-blindspot.test.js
 * =========================================================================
 * 저장 보호막의 사각지대 — "지금 이렇다" 기록 봉인 (2026-08-28 기록팀)
 * =========================================================================
 * ⚠️⚠️ 이 파일은 **아직 안 고친 결함을 기록**합니다.
 *      아래 [2] 는 "보호가 꺼진다" 를 기대값으로 적어 놓았습니다.
 *      **그게 옳다는 뜻이 아닙니다.** 지금 그렇다는 사실을 못 박아 둔 것입니다.
 *      고치면 [2] 가 빨갛게 터지면서 "이제 고쳐졌다" 고 알려줍니다.
 *      그때 할 일은 [2] 를 지우는 게 아니라 [3] 처럼 뒤집어 쓰는 것입니다.
 *
 * 무슨 결함인가 (2026-08-28 수리팀 발견, 미배정)
 * ---------------------------------------------
 * js/sync-guard.js 는 "이 창의 기록이 서버보다 적으면 저장을 막는" 보호막입니다.
 * 서버에 뭐가 있었는지를 먼저 읽어 기준값(serverBaseline)으로 삼습니다.
 *
 *   js/sync-guard.js:54-57
 *     realizedPnl: rows[0] && rows[0].data ? Number(rows[0].data.realized_pnl) || 0 : 0,
 *     tradeCount:  rows[1] && typeof rows[1].count === "number" ? rows[1].count : 0,
 *
 * **`.error` 를 아무도 안 봅니다.**
 * Supabase 는 조회가 실패해도 예외를 던지지 않습니다. `{ data: null, error: {...} }`
 * 로 **정상 resolve** 합니다. 그래서 권한 오류·네트워크 오류가 나면
 * `data` 가 null 이라 위 삼항식이 조용히 **0** 을 넣습니다.
 *
 *   기준값이 { realizedPnl: 0, tradeCount: 0 } 이 됩니다.
 *   -> "서버에 아무것도 없는 새 계정" 과 **글자 그대로 똑같아 보입니다.**
 *
 * 그런데 looksLikeDataLoss() 의 세 갈래가 전부 이걸 전제로 합니다 —
 *     (1) serverBaseline.tradeCount > 0 && ... && localTrades < tradeCount
 *     (2) localTrades === 0 && serverBaseline.tradeCount > 0
 *     (3) localPnl === 0 && Math.abs(serverBaseline.realizedPnl) > 1 && localTrades === 0
 * **tradeCount 가 0 이고 realizedPnl 이 0 이면 셋 다 false 입니다.**
 * 무엇이 들어와도 통과시킵니다. **네트워크·권한 오류 한 번에 보호가 조용히 꺼집니다.**
 *
 * 왜 P1 급인가 — CLAUDE.md 의 "조용한 고장" 그대로입니다.
 *   오류도 안 나고, 화면도 멀쩡하고, 회원은 보호막이 꺼진 줄 모릅니다.
 *   그 상태에서 빈 로컬이 서버를 덮으면 **회원의 거래 기록이 사라집니다.**
 *   되돌릴 수 없습니다.
 *
 * ⚠️ 실서버에 붙지 않습니다. App.SupabaseClient 를 가짜로 바꿔치기합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* -------------------------------------------------------------------------
 * 가짜 Supabase — 실서버에 붙지 않습니다.
 * ⭐ 핵심: 조회가 실패해도 **reject 하지 않고** { data:null, error } 로
 *    정상 resolve 합니다. 진짜 Supabase 가 그렇게 동작하기 때문입니다.
 *    여기서 reject 로 흉내내면 결함이 안 보입니다(그건 .catch 가 잡습니다).
 * ----------------------------------------------------------------------- */
function 가짜클라이언트(계정응답, 거래응답) {
  return {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }) },
    from: function (표이름) {
      return {
        select: function () {
          return {
            eq: function () {
              if (표이름 === "trading_accounts") {
                return { maybeSingle: () => Promise.resolve(계정응답) };
              }
              return Promise.resolve(거래응답);   // trades 는 .eq() 가 바로 결과
            },
          };
        },
      };
    },
  };
}

function 창만들기() {
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    setTimeout: (fn) => 0,
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
  vm.createContext(sandbox);
  vm.runInContext(read("js/sync-guard.js"), sandbox);
  return sandbox;
}

/* 로컬이 텅 빈 상태 — 이게 서버를 덮으면 회원 기록이 사라집니다. */
const 텅빈스냅 = { closedTrades: [], realizedPnl: 0, balance: 10000000 };

async function main() {
  /* =======================================================================
   * [1] 사실 확인 — 조회가 오류로 와도 기준값이 {0,0} 이 된다
   * ===================================================================== */
  절("[1] 서버 조회가 오류여도 기준값이 {0,0} 이 된다 (지금 이렇습니다)");

  const 오류 = { message: "permission denied for table trades", code: "42501" };
  const t = 창만들기();
  t.App.SupabaseClient = {
    get: () => 가짜클라이언트(
      { data: null, error: 오류 },              // 권한 오류 — reject 가 아닙니다
      { count: null, error: 오류 }
    ),
  };

  const 결과 = await t.App.SyncGuard.loadBaseline();
  const 기준값 = t.App.SyncGuard._getBaseline();

  ok("오류인데도 예외가 안 나고 기준값이 만들어진다 (" + JSON.stringify(기준값) + ")",
    !!기준값,
    "null 이면 이 결함이 아니라 다른 경로입니다");
  ok("실현손익 기준이 0 이다 (오류를 0 으로 읽었습니다)",
    !!기준값 && 기준값.realizedPnl === 0,
    "기준값: " + JSON.stringify(기준값));
  ok("거래건수 기준이 0 이다 (오류를 0 으로 읽었습니다)",
    !!기준값 && 기준값.tradeCount === 0,
    "기준값: " + JSON.stringify(기준값));
  ok("서버가 진짜 비어 있을 때와 글자 그대로 구별이 안 된다",
    JSON.stringify(기준값) === JSON.stringify({ realizedPnl: 0, tradeCount: 0 }),
    "이게 조용한 고장의 핵심입니다 — 오류인지 빈 계정인지 알 방법이 없습니다");

  /* =======================================================================
   * [2] ⚠️ 결함 기록 — 그 상태에서 보호가 꺼진다
   * =====================================================================
   * ⚠️⚠️ 아래 기대값은 **옳아서 적은 것이 아닙니다.**
   *      고치면 여기가 터집니다. 그게 정상입니다.
   *      고친 뒤에는 이 절을 지우지 말고 [3] 처럼 "막는다" 로 뒤집어 쓰고,
   *      바꾼 날짜와 이유를 여기에 남기세요. */
  절("[2] ⚠️ 그 상태에서 보호가 꺼진다 — 고쳐지면 여기가 터집니다");
  {
    const 막나 = t.App.SyncGuard.looksLikeDataLoss(텅빈스냅);
    ok("[결함] 텅 빈 로컬이 그대로 통과한다 (지금: " + (막나 ? "막음" : "통과") + ")",
      막나 === false,
      "여기가 빨갛게 터졌다면 **고쳐진 것입니다.** 축하합니다. " +
      "이 검사를 지우지 말고 [3] 처럼 '막는다' 로 뒤집어 쓰고 날짜를 남기세요");

    ok("[결함] 손익이 크게 깎여도 통과한다",
      t.App.SyncGuard.looksLikeDataLoss(
        { closedTrades: [], realizedPnl: 0, balance: 10000000 }) === false,
      "위와 같습니다 — 터졌으면 고쳐진 것입니다");
  }

  /* =======================================================================
   * [3] 반대 방향 — 조회가 정상이면 보호는 제대로 동작한다
   * =====================================================================
   * [1][2] 만 있으면 "보호막이 원래 아무것도 안 한다" 와 구별이 안 됩니다.
   * 정상 응답에서는 확실히 막는다는 것을 같이 못 박습니다. */
  절("[3] 조회가 정상이면 보호는 제대로 막는다 (보호막 자체는 살아 있습니다)");
  {
    const t2 = 창만들기();
    t2.App.SupabaseClient = {
      get: () => 가짜클라이언트(
        { data: { realized_pnl: 5230000 }, error: null },
        { count: 37, error: null }
      ),
    };
    await t2.App.SyncGuard.loadBaseline();
    const 기준2 = t2.App.SyncGuard._getBaseline();
    ok("정상 응답은 서버 값을 그대로 읽는다 (" + JSON.stringify(기준2) + ")",
      !!기준2 && 기준2.realizedPnl === 5230000 && 기준2.tradeCount === 37,
      "기준값: " + JSON.stringify(기준2));

    ok("텅 빈 로컬이 서버를 덮는 것을 막는다",
      t2.App.SyncGuard.looksLikeDataLoss(텅빈스냅) === true,
      "이게 false 면 보호막이 아예 망가진 것입니다 — 즉시 보고하세요");

    ok("거래가 37건에서 5건으로 줄어든 것도 막는다",
      t2.App.SyncGuard.looksLikeDataLoss(
        { closedTrades: new Array(5).fill({ pnl: 1 }), realizedPnl: 100 }) === true);

    ok("서버와 같은 37건은 막지 않는다 (정상 저장까지 막으면 안 됩니다)",
      t2.App.SyncGuard.looksLikeDataLoss(
        { closedTrades: new Array(37).fill({ pnl: 1 }), realizedPnl: 5230000 }) === false,
      "보호가 너무 세면 정상 거래가 저장이 안 됩니다");

    ok("서버보다 많은 40건도 막지 않는다",
      t2.App.SyncGuard.looksLikeDataLoss(
        { closedTrades: new Array(40).fill({ pnl: 1 }), realizedPnl: 6000000 }) === false);
  }

  /* =======================================================================
   * [4] 고쳐졌는지 알아보는 신호 — 코드가 .error 를 보게 되면 알려준다
   * =====================================================================
   * [2] 는 동작으로 봅니다. 이건 코드 모양으로 봅니다. 둘 다 있어야
   * "고쳤는데 테스트가 몰랐다" 도, "테스트만 고쳤다" 도 안 생깁니다. */
  절("[4] 기준값 읽는 코드가 아직 .error 를 안 본다 (고치면 여기도 터집니다)");
  {
    const 코드 = 주석제거(read("js/sync-guard.js"));
    const 기준값블록 = (코드.match(/serverBaseline\s*=\s*\{[\s\S]*?\};/) || [""])[0];

    ok("기준값을 만드는 곳을 찾았다 (" + 기준값블록.length + "자)",
      기준값블록.length > 0,
      "못 찾았으면 코드 모양이 바뀐 것입니다. [1][2] 결과를 먼저 보세요");

    ok("[결함] 기준값 만들 때 .error 를 안 본다",
      기준값블록.indexOf("error") === -1,
      "여기가 터졌다면 **고쳐진 것입니다.** [2] 도 같이 터졌는지 확인하고 " +
      "두 절을 함께 '고쳐졌다' 기준으로 다시 쓰세요");

    /* 고칠 때 참고하라고 같이 못 박아 둡니다 —
       세 갈래 전부 tradeCount/realizedPnl 이 0 이 아니어야 동작합니다. */
    const 손실판정 = (코드.match(/function looksLikeDataLoss[\s\S]*?\n  \}/) || [""])[0];
    const 전제조건수 = (손실판정.match(/serverBaseline\.(tradeCount|realizedPnl)/g) || []).length;
    ok("손실 판정이 기준값에 기대는 곳이 5곳이다 (지금 " + 전제조건수 + "곳)",
      전제조건수 === 5,
      "기준값이 {0,0} 이면 이 " + 전제조건수 + "곳이 전부 무력화됩니다. " +
      "고칠 때 '기준값을 못 읽었다' 와 '서버가 비었다' 를 구분하는 것이 핵심입니다");
  }

  console.log("\n  통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패한 것");
    실패목록.forEach((m) => console.log("  - " + m));
  }
  process.exit(fail ? 1 : 0);
}

main();
