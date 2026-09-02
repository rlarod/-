/* ===========================================================================
 * tests/auth-changed-bridge.test.js
 *   TL-015 — 화면 안에서 로그인했을 때 굳어 있던 3곳을 깨웁니다
 * ===========================================================================
 * 2026-09-02 · 수리팀
 *
 * ── 무엇을 대비하나 ────────────────────────────────────────────────────
 *
 *   2026-08-28 실측 — App.Bus 의 "auth:changed" 를 듣는 곳이 13곳인데
 *   쏘는 곳이 0곳이었습니다. 13곳 전부가 한 번도 안 깨어난 채 자고 있습니다.
 *
 *   js/auth-changed-bridge.js 는 ★그 신호를 쏘지 않습니다★.
 *   쏘면 13곳이 한꺼번에 깨어나고, 그중 js/account-isolation.js 의 check() 가
 *   App.Storage.clear("trading") 으로 ★로컬 거래기록을 지웁니다(되돌릴 수 없음)★.
 *
 *   대신 안전한 3곳만 이름으로 골라 직접 부릅니다.
 *
 * ── 그래서 여기서 못 박는 것 ───────────────────────────────────────────
 *   [1] 깨우는 목록이 정확히 그 3개다 (이름으로)
 *   [2] ⭐⭐ ★AccountIsolation 을 절대 안 부른다★  — 제일 중요합니다
 *   [3] ⭐ App.Bus 로 "auth:changed" 를 쏘지 않는다 (13곳이 계속 자고 있어야 함)
 *   [4] 첫 신호에는 안 깨운다 (모듈들이 이미 자기 init 에서 불렀습니다)
 *   [5] 같은 사람이면 안 깨운다 (토큰 갱신마다 서버를 두드리면 안 됩니다)
 *   [6] ⭐ ★비회원 → 로그인★ 이면 깨운다 — 이게 고치려던 바로 그 길입니다
 *   [7] 로그아웃(회원 → 비회원)도 깨운다 (앞 회원 이메일이 남으면 안 됩니다)
 *   [8] 하나가 실패해도 나머지는 계속 부른다
 *   [9] 부르는 함수 이름이 ★진짜 모듈에 실제로 있는 이름★ 이다
 *  [10] 수정 금지 파일을 안 건드린다 / index.html 에 실릴 자리
 *
 * 서버도 브라우저도 부르지 않습니다. 파일만 읽고 vm 으로 돌립니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

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

const SRC_PATH = path.join(REPO, "js", "auth-changed-bridge.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

/* =========================================================================
 * 가짜 환경 — 진짜 브라우저도 진짜 서버도 쓰지 않습니다
 * ====================================================================== */
function 만들기(옵션) {
  const o = 옵션 || {};
  const 부른것 = [];
  const 쏜것 = [];
  let 신호콜백 = null;

  const App = {
    SupabaseClient: {
      get: function () {
        if (o.클라이언트없음) return null;
        return {
          auth: {
            onAuthStateChange: function (cb) { 신호콜백 = cb; return { data: {} }; }
          }
        };
      }
    },
    Bus: {
      on: function () {},
      off: function () {},
      emit: function (name, payload) { 쏜것.push({ name: name, payload: payload }); }
    },
    SyncGuard: {
      loadBaseline: function () {
        부른것.push("SyncGuard.loadBaseline");
        return o.SyncGuard실패 ? Promise.reject(new Error("일부러 실패")) : Promise.resolve(null);
      }
    },
    MyPrivateInfo: {
      load: function () {
        부른것.push("MyPrivateInfo.load");
        if (o.MyPrivateInfo예외) throw new Error("일부러 예외");
        return Promise.resolve(null);
      }
    },
    MypageHistory: {
      load: function () { 부른것.push("MypageHistory.load"); return Promise.resolve(); }
    },
    /* ⛔ 이게 불리면 로컬 거래기록이 지워집니다. 불리는지 지켜봅니다. */
    AccountIsolation: {
      check: function () { 부른것.push("AccountIsolation.check"); },
      init: function () {}
    },
    Storage: {
      clear: function (k) { 부른것.push("Storage.clear(" + k + ")"); }
    }
  };

  const 타이머 = [];
  const window = { App: App };
  const sandbox = {
    window: window,
    App: App,
    document: {
      readyState: "complete",
      addEventListener: function () {},
      getElementById: function () { return null; }
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: function (fn, ms) { 타이머.push({ fn: fn, ms: ms }); return 타이머.length; },
    clearTimeout: function () {},
    Promise: Promise
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "js/auth-changed-bridge.js" });

  return {
    App: sandbox.App,
    다리: sandbox.App.AuthChangedBridge,
    부른것: 부른것,
    쏜것: 쏜것,
    타이머: 타이머,
    신호: function (event, session) {
      if (!신호콜백) throw new Error("아직 구독하지 않았습니다");
      return 신호콜백(event, session);
    },
    구독했나: function () { return !!신호콜백; }
  };
}

const 사람A = { user: { id: "AAAA-1111" } };
const 사람B = { user: { id: "BBBB-2222" } };

console.log("\nTL-015 — 화면 안 로그인 깨우기 (js/auth-changed-bridge.js)");

/* =========================================================================
 * [1] 깨우는 목록
 * ====================================================================== */
절("[1] 깨우는 목록이 정확히 그 3개인가");
{
  const t = 만들기();
  ok("App.AuthChangedBridge 가 만들어졌다", !!t.다리);
  const 이름들 = (t.다리.WAKE || []).map((x) => x["모듈"] + "." + x["함수"]).sort();
  ok("깨우는 대상이 3개다 (" + 이름들.length + "개)", 이름들.length === 3, 이름들.join(", "));
  ["MyPrivateInfo.load", "MypageHistory.load", "SyncGuard.loadBaseline"].forEach((n) => {
    ok("깨우는 목록에 " + n + " 이 있다", 이름들.indexOf(n) !== -1, 이름들.join(", "));
  });
  ok("깨우는 이유가 항목마다 적혀 있다",
    (t.다리.WAKE || []).every((x) => typeof x["왜"] === "string" && x["왜"].length > 5),
    "다음 사람이 왜 이 셋인지 알 수 있어야 합니다");
}

/* =========================================================================
 * [2] ⭐⭐ AccountIsolation 을 절대 안 부른다
 * ====================================================================== */
절("[2] ⭐⭐ 로컬 거래기록을 지우는 것을 절대 안 부르는가 (제일 중요)");
{
  const t = 만들기();
  t.신호("INITIAL_SESSION", null);      // 비회원으로 시작
  t.신호("SIGNED_IN", 사람A);           // 화면 안에서 로그인
  t.신호("SIGNED_IN", 사람B);           // 다른 사람으로 바뀜 (제일 위험한 상황)
  t.신호("SIGNED_OUT", null);

  ok("AccountIsolation.check 를 한 번도 안 불렀다",
    t.부른것.indexOf("AccountIsolation.check") === -1,
    "부른 것: " + t.부른것.join(", "));
  ok("App.Storage.clear 를 한 번도 안 불렀다",
    !t.부른것.some((c) => c.indexOf("Storage.clear") === 0),
    "지우면 되돌릴 수 없습니다");

  const 금지 = t.다리.NEVER || [];
  ok("금지 목록에 AccountIsolation 이 적혀 있다", 금지.indexOf("AccountIsolation") !== -1,
    금지.join(", "));
  ok("금지 목록과 깨우는 목록이 겹치지 않는다",
    (t.다리.WAKE || []).every((x) => 금지.indexOf(x["모듈"]) === -1));
  /* 소스에도 못 박아 둡니다 — 누가 WAKE 에 넣으면 눈에 띄게 */
  ok("소스에 '지우면 되돌릴 수 없습니다' 경고가 있다",
    /되돌릴 수 없습니다/.test(SRC) && /account-isolation/.test(SRC));
}

/* =========================================================================
 * [3] ⭐ App.Bus 로 auth:changed 를 쏘지 않는다
 * ====================================================================== */
절("[3] ⭐ 방송(App.Bus)으로 쏘지 않는가 — 13곳이 계속 자고 있어야 합니다");
{
  const t = 만들기();
  t.신호("INITIAL_SESSION", null);
  t.신호("SIGNED_IN", 사람A);
  t.신호("SIGNED_OUT", null);
  ok("App.Bus.emit 를 한 번도 안 불렀다", t.쏜것.length === 0,
    t.쏜것.map((x) => x.name).join(", "));
  ok("소스에 Bus.emit(\"auth:changed\") 가 없다",
    !/Bus\s*\.\s*emit\s*\(\s*["']auth:changed["']/.test(SRC),
    "쏘면 13곳이 한꺼번에 깨어납니다");
}

/* =========================================================================
 * [4] 첫 신호에는 안 깨운다
 * ====================================================================== */
절("[4] 첫 신호(페이지 열 때)에는 안 깨우는가");
{
  const t = 만들기();
  ok("실리자마자 구독한다", t.구독했나());
  ok("구독 상태를 밖에서 볼 수 있다", t.다리.isSubscribed() === true);

  const 결과 = t.신호("INITIAL_SESSION", 사람A);
  ok("첫 신호는 '기억만' 이라고 알려준다", /기억만/.test(결과), 결과);
  ok("첫 신호에 아무것도 안 불렀다", t.부른것.length === 0, t.부른것.join(", "));
  ok("깨운 횟수가 0 이다", t.다리.getStats().wakes === 0);
}

/* =========================================================================
 * [5] 같은 사람이면 안 깨운다
 * ====================================================================== */
절("[5] 토큰이 갱신돼도(사람이 같으면) 안 깨우는가");
{
  const t = 만들기();
  t.신호("INITIAL_SESSION", 사람A);
  const r1 = t.신호("TOKEN_REFRESHED", 사람A);
  const r2 = t.신호("USER_UPDATED", 사람A);
  ok("같은 사람이면 '깨우지 않음' 이라고 알려준다", /깨우지 않음/.test(r1), r1);
  ok("두 번 더 와도 마찬가지다", /깨우지 않음/.test(r2), r2);
  ok("아무것도 안 불렀다", t.부른것.length === 0, t.부른것.join(", "));
}

/* =========================================================================
 * [6] ⭐ 비회원 → 로그인 (고치려던 바로 그 길)
 * ====================================================================== */
절("[6] ⭐ 비회원으로 둘러보다 화면 안에서 로그인하면 깨우는가");
{
  const t = 만들기();
  t.신호("INITIAL_SESSION", null);            // 비회원으로 페이지 열기
  ok("비회원 상태에서는 아직 아무것도 안 불렀다", t.부른것.length === 0);

  const 결과 = t.신호("SIGNED_IN", 사람A);     // 화면 안에서 로그인
  ok("깨웠다고 알려준다", 결과 === "깨움", 결과);
  ok("★마이페이지 개인정보를 다시 읽는다★",
    t.부른것.indexOf("MyPrivateInfo.load") !== -1,
    "안 부르면 '로그인 후 확인할 수 있습니다' 가 그대로 남습니다");
  ok("★TL·핫딜·보관함 내역을 다시 읽는다★",
    t.부른것.indexOf("MypageHistory.load") !== -1);
  ok("★서버 기준값을 다시 읽는다★",
    t.부른것.indexOf("SyncGuard.loadBaseline") !== -1,
    "안 부르면 serverBaseline 이 영원히 null 입니다");
  ok("정확히 3개만 불렀다 (" + t.부른것.length + "개)", t.부른것.length === 3,
    t.부른것.join(", "));
  ok("깨운 횟수가 1 이다", t.다리.getStats().wakes === 1);
  ok("지금 로그인한 사람을 기억한다", t.다리.getStats().lastUid === "AAAA-1111");
}

/* =========================================================================
 * [7] 로그아웃도 깨운다
 * ====================================================================== */
절("[7] 로그아웃해도 깨우는가 — 앞 회원 정보가 남으면 안 됩니다");
{
  const t = 만들기();
  t.신호("INITIAL_SESSION", 사람A);
  t.부른것.length = 0;
  const 결과 = t.신호("SIGNED_OUT", null);
  ok("로그아웃에도 깨운다", 결과 === "깨움", 결과);
  ok("개인정보 칸을 다시 그린다", t.부른것.indexOf("MyPrivateInfo.load") !== -1,
    "안 그리면 앞 회원의 이메일·전화번호가 화면에 남습니다");
}

/* =========================================================================
 * [8] 하나가 실패해도 나머지는 계속 부른다
 * ====================================================================== */
절("[8] 하나가 실패해도 나머지를 계속 부르는가");
{
  const t1 = 만들기({ SyncGuard실패: true });
  t1.신호("INITIAL_SESSION", null);
  t1.신호("SIGNED_IN", 사람A);
  ok("Promise 가 거부돼도 나머지 2개를 부른다",
    t1.부른것.indexOf("MyPrivateInfo.load") !== -1 &&
    t1.부른것.indexOf("MypageHistory.load") !== -1,
    t1.부른것.join(", "));

  const t2 = 만들기({ MyPrivateInfo예외: true });
  t2.신호("INITIAL_SESSION", null);
  t2.신호("SIGNED_IN", 사람A);
  ok("예외가 나도 나머지를 부른다",
    t2.부른것.indexOf("MypageHistory.load") !== -1, t2.부른것.join(", "));
  ok("예외가 밖으로 새어나가지 않는다", true, "여기까지 왔으면 안 터진 것입니다");
}

/* =========================================================================
 * [8-2] 아직 안 실린 모듈이 있어도 안 터진다
 * ====================================================================== */
절("[8-2] 깨울 모듈이 아직 안 실렸어도 안 터지는가");
{
  const t = 만들기();
  delete t.App.MypageHistory;
  t.신호("INITIAL_SESSION", null);
  t.신호("SIGNED_IN", 사람A);
  ok("없는 모듈은 조용히 건너뛴다", t.부른것.length === 2, t.부른것.join(", "));
}

/* =========================================================================
 * [8-3] Supabase 클라이언트가 아직 없으면 다시 시도한다
 * ====================================================================== */
절("[8-3] Supabase 가 아직 준비 안 됐을 때");
{
  const t = 만들기({ 클라이언트없음: true });
  ok("구독하지 못했다고 정직하게 알린다", t.다리.isSubscribed() === false);
  ok("다시 시도할 타이머를 걸었다", t.타이머.length >= 1,
    "한 번 실패하고 영영 포기하면 조용한 고장이 됩니다");
  ok("영원히 재시도하지는 않는다", /MAX_RETRY/.test(SRC));
}

/* =========================================================================
 * [9] 부르는 이름이 진짜 모듈에 실제로 있는가
 * ====================================================================== */
절("[9] 부르는 함수가 진짜 모듈에 있는 이름인가");
{
  const 진짜 = {
    SyncGuard: { 파일: "js/sync-guard.js", 함수: "loadBaseline" },
    MyPrivateInfo: { 파일: "js/my-private-info.js", 함수: "load" },
    MypageHistory: { 파일: "js/mypage-history.js", 함수: "load" }
  };
  Object.keys(진짜).forEach((모듈) => {
    const info = 진짜[모듈];
    const src = fs.readFileSync(path.join(REPO, info.파일), "utf8");
    ok(info.파일 + " 이 App." + 모듈 + " 을 내놓는다",
      new RegExp("App\\." + 모듈 + "\\s*=\\s*\\(function").test(src));
    ok(info.파일 + " 이 " + info.함수 + " 를 밖으로 내놓는다",
      new RegExp("return\\s*\\{[\\s\\S]{0,400}\\b" + info.함수 + "\\b").test(src),
      "이름이 바뀌면 다리가 조용히 아무것도 안 하게 됩니다");
  });
  /* mypage-history.load() 는 loaded 를 다시 true 로 만들고 실제로 다시 읽습니다.
     'if (loaded) return' 같은 조기 반환이 생기면 다리가 무의미해집니다. */
  const mh = fs.readFileSync(path.join(REPO, "js", "mypage-history.js"), "utf8");
  ok("mypage-history.load() 에 'loaded 면 그냥 나가기' 가 없다",
    !/function load\(\)\s*\{[\s\S]{0,120}if\s*\(\s*loaded\s*\)\s*return/.test(mh),
    "생기면 다리가 불러도 아무 일이 안 일어납니다");
}

/* =========================================================================
 * [10] 안 건드린 것 / 실릴 자리
 * ====================================================================== */
절("[10] 안 건드린 것 / index.html 에 실릴 자리");
{
  ok("소스가 js/auth.js 를 고치지 않는다(수정 금지 파일)",
    !/App\.Auth\s*\.\s*\w+\s*=/.test(SRC),
    "auth.js 는 수정 금지입니다. 감싸지도 않았습니다");
  ok("타이머로 로그인 상태를 계속 훑지 않는다",
    !/setInterval/.test(SRC),
    "폴링을 걸면 배터리와 서버를 계속 씁니다");
  ok("되돌리는 방법이 파일 머리말에 있다", /되돌리는 방법/.test(SRC));

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const 실렸나 = /<script[^>]+src=["']js\/auth-changed-bridge\.js["']/.test(html);
  if (!실렸나) {
    console.log("  · ⏸ index.html 에 아직 안 실렸습니다. 차트팀 작업이 끝난 뒤 PM 이 한 줄만 넣으면 됩니다:");
    console.log("      <script src=\"js/auth-changed-bridge.js\"></script>   (js/mypage-history.js 뒤)");
  }
  /* 지금은 안 실려 있는 것이 정상이라 빨간 테스트로 만들지 않습니다.
     실린 뒤에는 순서를 지켜야 하므로 그때부터 아래가 진짜 검사가 됩니다. */
  ok("실렸다면 js/supabase-client.js 보다 뒤에 있다",
    !실렸나 || html.indexOf("js/auth-changed-bridge.js") > html.indexOf("js/supabase-client.js"),
    "App.SupabaseClient 가 먼저 있어야 구독할 수 있습니다");
  ok("실렸다면 js/mypage-history.js 보다 뒤에 있다",
    !실렸나 || html.indexOf("js/auth-changed-bridge.js") > html.indexOf("js/mypage-history.js"),
    "깨울 모듈이 먼저 실려 있어야 합니다");
}

/* =========================================================================
 * [11] 자기 등록
 * ====================================================================== */
절("[11] 자기 등록");
{
  const ORDER = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    ORDER.includes("tests/auth-changed-bridge.test.js"));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록");
  실패목록.forEach((s) => console.log("  · " + s));
  console.log("실패 있음 ❌");
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
