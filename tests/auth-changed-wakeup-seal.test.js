/* tests/auth-changed-wakeup-seal.test.js
 * =========================================================================
 * auth:changed 깨우기 봉인 — 2026-08-28 (기록팀)
 * =========================================================================
 * 무엇을 대비하나
 * ---------------
 * 2026-08-28 실측 — App.Bus 의 "auth:changed" 신호를 **듣는 곳이 13곳**인데
 * **쏘는 곳이 0곳**입니다. 13곳 전부가 한 번도 안 깨어난 채 자고 있습니다.
 *
 *   $ grep -rn 'auth:changed' js/ | grep 'Bus.on'        -> 13줄
 *   $ grep -rn 'auth:changed' js/ | grep 'dispatch\|emit' -> 0줄
 *
 * 수리팀이 곧 이 신호를 쏘게 만듭니다. 쏘는 순간 **13곳이 한꺼번에 깨어납니다.**
 * 그중 하나가 위험합니다 —
 *
 *   js/account-isolation.js:105   App.Bus.on("auth:changed", check);
 *
 * check() 는 조건이 맞으면 App.Storage.clear("trading") 을 부릅니다.
 * **로컬 거래 데이터를 지웁니다. 지우면 되돌릴 수 없습니다.**
 *
 * 그래서 이 파일은 "쏘기 전" 과 "쏜 뒤" 양쪽에서 똑같이 성립하는 것만 봉인합니다.
 * 발신 개수(0건)를 기대값으로 박지 않습니다 — 수리팀이 쏘는 순간 빨간 테스트가
 * 되고, 그건 잡은 게 아니라 제가 길을 막는 것입니다.
 * (2026-08-28 PM 이 빨간 테스트를 커밋한 사고가 실제로 있었습니다)
 *
 * 무엇을 보나
 * -----------
 *   [1] 듣는 곳을 **이름으로** 봉인한다 (개수만 세지 않습니다)
 *       개수만 세면 A 가 빠지고 B 가 들어와도 13 그대로라 조용히 지나갑니다.
 *   [2] ⭐ account-isolation 이 **지우면 안 되는 때** 안 지운다
 *       이게 제일 중요합니다. 지우면 되돌릴 수 없습니다.
 *   [3] 그렇다고 **지워야 할 때까지 안 지우게** 되지는 않았다 (반대 방향)
 *       [2] 만 보면 clear 를 통째로 없애버려도 통과합니다. 양쪽을 다 봅니다.
 *   [4] account-isolation 이 auth:changed 에 매다는 것이 check 바로 그것이다
 *       더 험한 것을 몰래 매달면 [2][3] 을 다 지나갑니다.
 *
 * 시간 간격은 흉내내지 않습니다. check() 를 직접 부릅니다.
 * 서버도 브라우저도 부르지 않습니다. 파일만 읽고 vm 으로 돌립니다.
 * ========================================================================= */
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

function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* =========================================================================
 * [1] 듣는 곳을 이름으로 봉인한다
 * =========================================================================
 * 개수만 세는 검사의 허점 — 한 곳이 빠지고 다른 곳이 새로 들으면 13 그대로입니다.
 * 그래서 **파일 이름 목록**을 통째로 봉인합니다.
 *
 * 목록이 바뀌면 이 테스트가 터집니다. 그때 할 일은 기대값을 그냥 맞추는 게 아니라,
 * **새로 듣기 시작한 모듈이 깨어나도 안전한지** 먼저 확인하는 것입니다.
 * 특히 그 모듈이 무언가를 지우거나 서버에 쓰지 않는지 보세요. */
절("[1] auth:changed 를 듣는 곳 — 이름으로");

const 듣는곳기대 = [
  "account-isolation.js",   // 위험 — 로컬 거래 데이터를 지웁니다
  "guest-access.js",
  "guest-leaderboard.js",
  "guest-state-guard.js",
  "inline-login.js",
  "leverage-gate.js",
  "login-required.js",
  "my-private-info.js",
  "mypage-history.js",
  "sync-guard.js",
  "tl-balance-sync.js",
  "tl-hotdeal.js",
  "tl-market.js",
];

const js파일들 = fs.readdirSync(path.join(REPO, "js"))
  .filter((f) => f.slice(-3) === ".js")
  .sort();

const 실제듣는곳 = js파일들.filter((f) => {
  const 코드 = 주석제거(fs.readFileSync(path.join(REPO, "js", f), "utf8"));
  /* Bus.on("auth:changed", ...) — 주석에 적힌 설명은 위에서 걷어냈습니다 */
  return /Bus\s*\.\s*on\s*\(\s*["']auth:changed["']/.test(코드);
});

ok("듣는 곳이 " + 듣는곳기대.length + "곳이다 (지금 " + 실제듣는곳.length + "곳)",
  실제듣는곳.length === 듣는곳기대.length,
  "늘었으면 새로 듣는 모듈이 깨어나도 안전한지 먼저 확인하세요");

const 새로생긴것 = 실제듣는곳.filter((f) => 듣는곳기대.indexOf(f) === -1);
const 사라진것 = 듣는곳기대.filter((f) => 실제듣는곳.indexOf(f) === -1);

ok("듣는 곳 이름이 그대로다" +
    (새로생긴것.length ? " (새로 생김: " + JSON.stringify(새로생긴것) + ")" : "") +
    (사라진것.length ? " (사라짐: " + JSON.stringify(사라진것) + ")" : ""),
  새로생긴것.length === 0 && 사라진것.length === 0,
  "개수만 세면 하나 빠지고 하나 들어와도 13 그대로라 조용히 지나갑니다");

ok("위험한 곳(account-isolation.js)이 목록에 있다",
  실제듣는곳.indexOf("account-isolation.js") !== -1,
  "이게 사라졌다면 파일 이름이 바뀐 것입니다. 아래 [2][3] 이 헛돌고 있는지 확인하세요");

/* =========================================================================
 * [2][3] account-isolation 을 실제로 돌려 본다
 * ========================================================================= */

/* 실제 모듈을 돌립니다. 시간 간격은 흉내내지 않습니다 —
   setTimeout 은 0 을 돌려주는 껍데기로 두고 check() 를 직접 부릅니다. */
function 창만들기() {
  const 저장소 = {};
  const clear기록 = [];
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    setTimeout: () => 0,
    document: { readyState: "complete", addEventListener() {} },
  };
  sandbox.window = sandbox;
  const 매단것 = [];
  sandbox.App = {
    Storage: {
      save(k, v) { 저장소[k] = JSON.parse(JSON.stringify(v)); },
      load(k) { return 저장소[k] ? JSON.parse(JSON.stringify(저장소[k])) : null; },
      clear(k) { clear기록.push(k); delete 저장소[k]; },
    },
    Auth: { getNickname: () => null },
    Bus: { on(이름, fn) { 매단것.push({ 이름, fn }); } },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "account-isolation.js"), "utf8"), sandbox);
  return { sb: sandbox, 저장소, clear기록, 매단것, AI: sandbox.App.AccountIsolation };
}

/* 주인 표시를 먼저 심는다.
   ⚠️ 순서가 중요합니다 — 거래 데이터를 먼저 넣고 check() 를 부르면
   주인 표시가 없는 상태라 "주인불명 정리" 로 **정상적으로** 지워집니다.
   그러면 그 뒤 검사는 이미 빈 저장소를 보게 됩니다.
   (2026-08-28 실제로 이 순서를 틀려서 검사 3개가 헛돌았습니다) */
function 주인심기(t, 이름) {
  t.sb.App.Auth.getNickname = () => 이름;
  t.저장소.trading = { closedTrades: [], position: null, balance: 10000000 };
  const v = t.AI.check();                 // -> "주인 표시"
  if (v !== "주인 표시") throw new Error("주인심기 실패: " + v);
  t.clear기록.length = 0;
}

/* 진짜처럼 보이는 거래 데이터 — 이게 지워지면 회원 기록이 날아간 것입니다. */
function 거래데이터() {
  return {
    closedTrades: [{ pnl: 1240000 }, { pnl: -310000 }],
    position: { symbol: "BTCUSDT", qty: 0.4 },
    balance: 10930000,
  };
}

절("[2] 지우면 안 되는 때 — 안 지운다");
{
  /* (가) 같은 사람이 다시 로그인 — 가장 흔한 경우입니다.
     auth:changed 가 쏘이기 시작하면 이 경로가 제일 자주 지나갑니다. */
  const t = 창만들기();
  주인심기(t, "김갱");
  t.저장소.trading = 거래데이터();
  const 판정 = t.AI.check();                       // 같은 사람으로 한 번 더
  ok("같은 사람이 다시 깨워도 안 지운다 (판정: " + 판정 + ")",
    판정 === "같은 사람" && t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록) + " — 되돌릴 수 없습니다");
  ok("같은 사람일 때 거래 데이터가 그대로 남아 있다",
    !!(t.저장소.trading && t.저장소.trading.closedTrades.length === 2),
    "closedTrades 2건과 잔고 10,930,000 이 그대로여야 합니다");
}
{
  /* (나) 로그아웃 순간 — 닉네임이 없어집니다.
     auth:changed 는 로그아웃에도 쏘입니다. 여기서 지우면 최악입니다. */
  const t = 창만들기();
  주인심기(t, "김갱");
  t.저장소.trading = 거래데이터();
  t.sb.App.Auth.getNickname = () => null;          // 로그아웃
  const 판정 = t.AI.check();
  ok("로그아웃해도 안 지운다 (판정: " + 판정 + ")",
    판정 === "로그인 전" && t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록));
  ok("로그아웃 뒤에도 거래 데이터가 남아 있다",
    !!(t.저장소.trading && t.저장소.trading.balance === 10930000),
    "로그아웃은 남의 데이터라는 뜻이 아닙니다");
}
{
  /* (다) 로그인 복구가 늦어 닉네임이 잠깐 빈 문자열인 순간.
     auth:changed 가 이 타이밍에 쏘일 수 있습니다. */
  const t = 창만들기();
  주인심기(t, "김갱");
  t.저장소.trading = 거래데이터();
  t.sb.App.Auth.getNickname = () => "   ";         // 공백만
  const 판정 = t.AI.check();
  ok("닉네임이 아직 안 왔을 때(공백)도 안 지운다 (판정: " + 판정 + ")",
    판정 === "로그인 전" && t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록) +
    " — 공백을 사람 이름으로 치면 모든 회원의 데이터가 남의 것이 됩니다");
}
{
  /* (라) 앞뒤 공백만 다른 같은 이름 */
  const t = 창만들기();
  주인심기(t, "김갱");
  t.저장소.trading = 거래데이터();
  t.sb.App.Auth.getNickname = () => "  김갱  ";
  const 판정 = t.AI.check();
  ok("앞뒤 공백만 다른 같은 이름은 같은 사람이다 (판정: " + 판정 + ")",
    판정 === "같은 사람" && t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록));
}
{
  /* (마) 주인 표시가 없는 예전 데이터인데 거래 흔적도 없는 경우 — 지울 게 없습니다 */
  const t = 창만들기();
  t.sb.App.Auth.getNickname = () => "김갱";
  t.저장소.trading = { closedTrades: [], position: null, balance: 10000000 };
  const 판정 = t.AI.check();
  ok("거래 흔적이 없으면 지우지 않고 주인만 적는다 (판정: " + 판정 + ")",
    판정 === "주인 표시" && t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록));
}
{
  /* (바) 같은 사람으로 auth:changed 를 여러 번 쏴도 마찬가지.
     수리팀이 쏘기 시작하면 연달아 여러 번 쏘일 수 있습니다. */
  const t = 창만들기();
  주인심기(t, "김갱");
  t.저장소.trading = 거래데이터();
  const 매단것 = t.매단것.filter((x) => x.이름 === "auth:changed");
  ok("account-isolation 이 auth:changed 에 실제로 매달았다 (" + 매단것.length + "개)",
    매단것.length === 1,
    "0개면 아래 '실제로 쏴 본다' 가 아무것도 안 하고 통과합니다");
  for (let i = 0; i < 10; i++) 매단것.forEach((x) => x.fn());   // 실제로 10번 쏜다
  ok("같은 사람으로 10번 쏴도 한 번도 안 지운다",
    t.clear기록.length === 0,
    "지운 것: " + JSON.stringify(t.clear기록));
  ok("10번 쏜 뒤에도 거래 데이터가 그대로다",
    !!(t.저장소.trading && t.저장소.trading.closedTrades.length === 2 &&
       t.저장소.trading.balance === 10930000),
    "closedTrades 2건 · 잔고 10,930,000 이 그대로여야 합니다");
}

절("[3] 지워야 할 때는 여전히 지운다 (반대 방향)");
/* [2] 만 보면 clear 를 통째로 없애버려도 전부 통과합니다.
   그러면 남의 거래 데이터가 그대로 보이는 원래 버그로 되돌아갑니다.
   그래서 반대 방향도 같이 봉인합니다. */
{
  const t = 창만들기();
  주인심기(t, "사용자A");
  t.저장소.trading = 거래데이터();
  t.sb.App.Auth.getNickname = () => "사용자B";     // 진짜 다른 사람
  const 판정 = t.AI.check();
  ok("다른 사람으로 바뀌면 지운다 (판정: " + 판정 + ")",
    판정 === "다른사람 정리" && t.clear기록.indexOf("trading") !== -1,
    "안 지우면 B 가 A 의 잔고와 거래내역을 봅니다");
  ok("지운 뒤 주인이 새 사람으로 바뀐다",
    t.AI.readOwner() === "사용자B", String(t.AI.readOwner()));
}
{
  const t = 창만들기();
  t.sb.App.Auth.getNickname = () => "김갱";
  t.저장소.trading = 거래데이터();                 // 주인 표시 없이 거래 흔적만 있음
  const 판정 = t.AI.check();
  ok("주인을 알 수 없는 거래 데이터는 지운다 (판정: " + 판정 + ")",
    판정 === "주인불명 정리" && t.clear기록.indexOf("trading") !== -1,
    "누구 것인지 모르는 잔고를 그대로 보여주면 안 됩니다");
}

/* =========================================================================
 * [4] auth:changed 에 매다는 것이 check 바로 그것이다
 * =========================================================================
 * [2][3] 은 check() 를 직접 불러서 봤습니다. 그런데 auth:changed 에 check 가 아니라
 * 더 험한 것(예: 무조건 clear)을 매달아 두면 [2][3] 을 전부 지나갑니다. */
절("[4] 매달아 둔 것이 check 그 자체다");
{
  const t = 창만들기();
  const 매단것 = t.매단것.filter((x) => x.이름 === "auth:changed");
  ok("auth:changed 에 매단 것이 정확히 하나다 (" + 매단것.length + "개)",
    매단것.length === 1,
    "여러 개면 그중 하나가 몰래 지울 수 있습니다");
  ok("그것이 밖으로 내주는 check 와 같은 함수다",
    매단것.length === 1 && 매단것[0].fn === t.AI.check,
    "다른 함수를 매달면 위 [2][3] 이 검사하지 않은 길이 생깁니다");

  const 코드 = 주석제거(fs.readFileSync(path.join(REPO, "js", "account-isolation.js"), "utf8"));
  const clear횟수 = (코드.match(/Storage\s*\.\s*clear\s*\(/g) || []).length;
  ok("Storage.clear 를 부르는 곳이 2곳뿐이다 (지금 " + clear횟수 + "곳)",
    clear횟수 === 2,
    "늘었으면 새로 생긴 지우는 길이 위 [2] 로 막혀 있는지 확인하세요. " +
    "지금 2곳은 '주인불명 정리' 와 '다른사람 정리' 입니다");
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패한 것");
  실패목록.forEach((m) => console.log("  - " + m));
}
process.exit(fail ? 1 : 0);
