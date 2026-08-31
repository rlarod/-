/* =========================================================================
 * tests/supabase-client-seal.test.js
 * 서버 연결의 유일한 입구 봉인 — js/supabase-client.js (2026-08-27)
 * =========================================================================
 *
 * 왜 만들었나
 *   41줄인데 **회원 데이터로 가는 문이 여기 하나뿐** 입니다.
 *   js 전체에서 App.SupabaseClient 를 쓰는 파일이 29개, 부르는 자리가 52곳인데
 *   실제로 client 를 만드는 곳은 이 파일 36행 딱 한 줄입니다.
 *   그런데 지키는 테스트가 0건이었습니다.
 *
 * ── 못 박는 것 두 가지가 핵심입니다 ─────────────────────────────────────
 *
 *   ⭐① 여기 들어가는 키는 publishable 키뿐이다
 *
 *      이 파일은 브라우저로 그대로 내려갑니다. 회원 누구나 볼 수 있습니다.
 *      publishable(옛 anon) 키는 그러라고 만든 키라 괜찮고, 실제 차단은
 *      Supabase 쪽 RLS 가 합니다. 하지만 여기에 service_role / secret 키가
 *      한 번이라도 들어가면 **RLS 를 통째로 무시하는 열쇠가 공개 저장소
 *      (rlarod/-, Public) 에 그대로 올라갑니다.** 회원 전원의 거래기록·
 *      개인정보가 노출되고, 지우는 것도 남이 할 수 있게 됩니다.
 *      한 번 올라가면 git 기록에 영구히 남아 키 교체 말고는 되돌릴 방법이 없습니다.
 *      "실수로 붙여넣기 한 번" 이면 끝나는 사고라 문자열 수준에서 막습니다.
 *
 *   ⭐② get() 은 client 를 딱 한 번만 만든다 (단일 인스턴스)
 *
 *      부를 때마다 새로 만들면 두 가지가 조용히 깨집니다.
 *        · 두 모듈이 get() 을 감싸서 **돌려받은 client 에 도장을 찍습니다**
 *          js/symbol-sync-bridge.js:621  종목 도장 (__symbolBridged)
 *          js/comment-fix.js:115         댓글 고쳐쓰기 (__commentFixWrapped)
 *          매번 새 client 면 도장이 매번 새로 찍히거나 사라집니다.
 *        · realtime 연결이 부를 때마다 하나씩 늘어납니다(채팅 중복 수신).
 *      오류가 안 나는 종류의 고장입니다.
 *
 * ── 겹치지 않게 확인했습니다 ────────────────────────────────────────────
 *   tests/storage-save-wrap-order.test.js 는 App.Storage.save 를 감싸는
 *   4개의 순서를 봅니다. 이 파일은 App.SupabaseClient.get 쪽이라 대상이 다릅니다.
 *   tests/symbol-sync-bridge.test.js 는 bridge 가 종목을 어떻게 찍는지를 봅니다.
 *   이 파일은 bridge 의 동작을 다시 검사하지 않고, **감쌀 수 있는 모양이
 *   유지되는지(얼리지 않았는지, 감싼 뒤에도 단일 인스턴스인지)** 만 봅니다.
 *
 * 이 테스트는 **실서버에 붙지 않습니다.** window.supabase.createClient 를
 * 가짜로 바꿔치기해서 호출 횟수만 셉니다. 네트워크 함수는 부르면 실패합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  ✓ " + 제목);
  } else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(t) { console.log("\n" + t); }

/* 이 파일의 주석에는 "service_role 키는 어디에도 없습니다" 라는 설명이
   그대로 적혀 있습니다. 문자열만 찾으면 그 주석에 걸려 오탐이 납니다.
   그래서 실제로 도는 코드만 남겨 놓고 검사합니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const REL = "js/supabase-client.js";
const SRC = read(REL);
const CODE = 주석제거(SRC);
const HTML = read("index.html");

/* =========================================================================
 * [1] 파일 구조와 실리는 순서
 * ========================================================================= */
section("[1] 파일 구조");

ok("js/supabase-client.js 가 있다", fs.existsSync(path.join(REPO, REL)));
ok("index.html 이 이 파일을 불러온다", HTML.indexOf('src="' + REL + '"') >= 0);
ok("App.SupabaseClient 하나만 만든다", /App\.SupabaseClient\s*=\s*\(function/.test(CODE));
ok("use strict 로 돈다", /["']use strict["']/.test(CODE));
ok("Supabase CDN 스크립트보다 뒤에 실린다",
  HTML.indexOf('src="' + REL + '"') > HTML.indexOf("@supabase/supabase-js"),
  "먼저 실려도 get() 이 늦게 불리면 되지만, 순서가 뒤집힐 이유가 없습니다");
ok("js/auth.js 보다 먼저 실린다",
  HTML.indexOf('src="' + REL + '"') < HTML.indexOf('src="js/auth.js"'),
  "auth.js:50 은 App.SupabaseClient.get() 을 그대로 부릅니다(존재 확인 없이)");

/* =========================================================================
 * [2] ⭐ 키 안전 — 이 파일은 브라우저로 그대로 내려갑니다
 * ========================================================================= */
section("[2] ⭐ 키 안전");

ok("publishable 키를 쓴다", /sb_publishable_/.test(CODE),
  "지금 값이 publishable 이 아니면 즉시 확인이 필요합니다");
ok("키 이름에도 PUBLISHABLE 이라고 적혀 있다", /PUBLISHABLE/.test(CODE));
ok("service_role 이라는 말이 코드에 없다", CODE.indexOf("service_role") === -1,
  "RLS 를 통째로 무시하는 키입니다. 공개 저장소에 올라가면 회원 데이터 전체가 노출됩니다");
ok("sb_secret_ 키가 없다", CODE.indexOf("sb_secret_") === -1);
ok("SERVICE_ROLE / SECRET 이라는 이름의 상수가 없다",
  !/SERVICE_ROLE/i.test(CODE) && !/SECRET/i.test(CODE));
ok("JWT 모양의 옛 키(eyJhbGci...)가 하드코딩돼 있지 않다",
  CODE.indexOf("eyJhbGci") === -1,
  "옛 anon/service 키는 둘 다 eyJ 로 시작합니다. 눈으로는 구분이 안 갑니다");
ok("Supabase 주소가 우리 프로젝트 하나뿐이다",
  (CODE.match(/https:\/\/[a-z0-9]+\.supabase\.co/g) || []).length === 1 &&
  CODE.indexOf("https://oxpjpotilcumjqixsdxw.supabase.co") >= 0,
  "주소가 바뀌면 회원 기록이 다른 프로젝트로 갑니다");
ok("환경변수나 외부에서 키를 갈아끼우는 통로가 없다",
  !/process\.env/.test(CODE) && !/localStorage/.test(CODE) &&
  !/URLSearchParams/.test(CODE) && !/location\.search/.test(CODE),
  "주소창으로 키를 바꿔 넣을 수 있으면 아무 서버로나 회원 데이터를 보낼 수 있습니다");

/* 저장소 전체 스캔 — 다른 파일에 몰래 들어간 것도 잡습니다.
   supabase/*.sql 은 RLS 정책에서 service_role 을 정상적으로 언급하므로 제외하고,
   브라우저로 내려가는 것(js/·html)만 봅니다. */
section("[2-1] 브라우저로 내려가는 파일 전체 스캔");
{
  const 대상 = fs.readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js")
    .map((f) => "js/" + f)
    .concat(fs.readdirSync(REPO).filter((f) => f.slice(-5) === ".html"));

  const 위험 = [];
  대상.forEach((rel) => {
    const c = 주석제거(read(rel));
    if (c.indexOf("service_role") >= 0) 위험.push(rel + " (service_role)");
    if (c.indexOf("sb_secret_") >= 0) 위험.push(rel + " (sb_secret_)");
    if (c.indexOf("eyJhbGci") >= 0) 위험.push(rel + " (JWT 하드코딩)");
  });
  ok("브라우저로 내려가는 파일(" + 대상.length + "개) 어디에도 비밀 키가 없다",
    위험.length === 0, JSON.stringify(위험));

  const 만드는곳 = 대상.filter((rel) => /supabase\.createClient\s*\(/.test(주석제거(read(rel))));
  ok("createClient 를 부르는 파일이 js/supabase-client.js 하나뿐이다 (" +
    만드는곳.length + "개)",
    만드는곳.length === 1 && 만드는곳[0] === REL,
    JSON.stringify(만드는곳) + " — 두 곳이 되면 키가 두 벌이 되고 단일 인스턴스가 깨집니다");
}

/* =========================================================================
 * [3] ⭐ 단일 인스턴스 — 실제로 돌려서 횟수를 셉니다
 * ========================================================================= */
section("[3] ⭐ get() 은 client 를 딱 한 번만 만든다");

function 창만들기(opts) {
  opts = opts || {};
  const 콘솔 = { error: [], warn: [] };
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => 콘솔.error.push(String((e && e.message) || e)));
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
    url: "https://example.test/",
    virtualConsole: vc,
  });
  const win = dom.window;

  /* 진짜 서버에 붙으면 실패합니다 */
  win.fetch = () => { throw new Error("실서버에 붙으면 안 됩니다(fetch)"); };
  win.WebSocket = function () { throw new Error("실서버에 붙으면 안 됩니다(WebSocket)"); };
  win.console.error = function () {
    콘솔.error.push(Array.prototype.join.call(arguments, " "));
  };
  win.console.warn = function () {
    콘솔.warn.push(Array.prototype.join.call(arguments, " "));
  };

  const 호출 = [];
  if (opts.라이브러리없음 !== true) {
    win.supabase = {
      createClient: function (url, key) {
        호출.push({ url: url, key: key });
        return { __가짜: true, 번호: 호출.length, from: function () { return {}; } };
      },
    };
  }
  win.eval("window.App = window.App || {};");
  win.eval(SRC);
  return { win: win, App: win.App, 호출: 호출, 콘솔: 콘솔 };
}

{
  const t = 창만들기();
  const a = t.App.SupabaseClient.get();
  const b = t.App.SupabaseClient.get();
  const c = t.App.SupabaseClient.get();

  ok("get() 을 3번 불러도 createClient 는 1번만 불린다 (실제 " + t.호출.length + "번)",
    t.호출.length === 1,
    "부를 때마다 새로 만들면 realtime 연결이 계속 늘고, 감싸는 모듈의 도장이 날아갑니다");
  ok("세 번 다 같은 객체를 돌려준다", a === b && b === c);
  ok("넘기는 주소가 우리 프로젝트다",
    t.호출.length > 0 && t.호출[0].url === "https://oxpjpotilcumjqixsdxw.supabase.co",
    t.호출.length ? t.호출[0].url : "createClient 가 아예 안 불렸습니다");
  ok("넘기는 키가 publishable 키다",
    t.호출.length > 0 && String(t.호출[0].key).indexOf("sb_publishable_") === 0,
    "실제로 넘어간 값: " + (t.호출.length ? String(t.호출[0].key).slice(0, 16) + "..." : "없음"));
  ok("get 은 함수다", typeof t.App.SupabaseClient.get === "function");
  t.win.close();
}

/* 파일을 읽어도 같은 성질이 보여야 합니다 (구조 봉인) */
ok("만든 client 를 변수에 담아 둔다 (캐시)", /let\s+client\s*=\s*null/.test(CODE));
ok("이미 있으면 그대로 돌려주고 끝낸다", /if\s*\(client\)\s*return\s+client\s*;/.test(CODE));

/* =========================================================================
 * [4] 라이브러리가 없을 때 — 조용히 null. 절대 안 터진다
 * ========================================================================= */
section("[4] CDN 이 막혔을 때");
{
  const t = 창만들기({ 라이브러리없음: true });
  let 터짐 = null;
  let r1 = "안불림";
  let r2 = "안불림";
  try {
    r1 = t.App.SupabaseClient.get();
    r2 = t.App.SupabaseClient.get();
  } catch (e) {
    터짐 = e.message;
  }
  ok("Supabase 라이브러리가 없어도 안 터진다", 터짐 === null, 터짐);
  ok("null 을 돌려준다 (가짜 객체를 지어내지 않는다)", r1 === null && r2 === null,
    "여기서 빈 객체를 돌려주면 부르는 쪽 29개가 전부 조용히 헛돕니다");
  ok("경고를 한 번만 찍는다 (두 번 불러도 1건, 실제 " + t.콘솔.error.length + "건)",
    t.콘솔.error.length === 1,
    "52곳에서 부르므로 매번 찍으면 콘솔이 덮여 진짜 오류가 안 보입니다");
  ok("경고에 파일 이름이 들어 있다", (t.콘솔.error[0] || "").indexOf("supabase-client.js") >= 0,
    t.콘솔.error[0]);

  /* CDN 이 늦게 뜬 경우 — null 을 캐시해 버리면 영영 복구가 안 됩니다 */
  t.win.supabase = {
    createClient: function () { return { __늦게왔음: true }; },
  };
  const r3 = t.App.SupabaseClient.get();
  ok("CDN 이 늦게 떠도 그 다음 호출에서 정상적으로 만들어진다",
    !!(r3 && r3.__늦게왔음 === true),
    "null 을 캐시하면 한 번 실패한 순간 그 탭은 영영 로그인이 안 됩니다");
  t.win.close();
}

/* =========================================================================
 * [5] 밖으로 내주는 것은 get 하나뿐
 * ========================================================================= */
section("[5] 노출 표면");
{
  const t = 창만들기();
  const 키들 = Object.keys(t.App.SupabaseClient);
  ok("공개하는 것이 get 하나뿐이다 (지금: " + JSON.stringify(키들) + ")",
    키들.length === 1 && 키들[0] === "get",
    "키나 주소를 밖으로 내주면 다른 모듈이 client 를 따로 만들 수 있게 됩니다");
  ok("키 문자열을 공개 속성으로 내주지 않는다",
    JSON.stringify(t.App.SupabaseClient).indexOf("sb_publishable_") === -1);
  /* 2026-08-28 기록팀 — 돌연변이 검증에서 이 검사가 뚫렸습니다.
     전에는 SUPABASE_PUBLISHABLE_KEY / SUPABASE_URL 이라는 **이름 두 개**만 봤습니다.
     사본에 window.__k = "sb_publishable_..." 한 줄을 넣었더니 그대로 통과했습니다
     (종료코드 0). 이름을 바꿔 흘리면 안 잡히는, 아무것도 안 지키던 검사였습니다.
     그래서 이름이 아니라 **값**으로 봅니다 — window 와 window.App 의 데이터 속성을
     전부 훑어 키 문자열이 들어 있는지 찾습니다.
     getter 는 부르지 않습니다(부작용·느려짐). value 가 있는 것만 읽습니다. */
  function 값으로흘린곳(대상, 라벨) {
    const 찾음 = [];
    let 이름들 = [];
    try { 이름들 = Object.getOwnPropertyNames(대상); } catch (e) { return 찾음; }
    for (const n of 이름들) {
      let d;
      try { d = Object.getOwnPropertyDescriptor(대상, n); } catch (e) { continue; }
      if (!d || !("value" in d)) continue;          // getter 는 건너뛴다
      const v = d.value;
      if (typeof v !== "string") continue;
      if (v.indexOf("sb_publishable_") !== -1 || v.indexOf("oxpjpotilcumjqixsdxw") !== -1) {
        찾음.push(라벨 + "." + n);
      }
    }
    return 찾음;
  }
  const 흘린곳 = 값으로흘린곳(t.win, "window").concat(값으로흘린곳(t.App, "App"));
  ok("전역(window)에 키를 흘리지 않는다" +
      (흘린곳.length ? " (샌 곳: " + JSON.stringify(흘린곳) + ")" : ""),
    흘린곳.length === 0,
    "IIFE 안에 갇혀 있어야 합니다. 이름을 바꿔도 값으로 잡습니다");
  t.win.close();
}

/* =========================================================================
 * [6] 감쌀 수 있는 모양이 유지된다
 *     — 두 모듈이 get 을 통째로 갈아끼웁니다. 얼리면 그쪽이 조용히 죽습니다.
 * ========================================================================= */
section("[6] 감싸기 (두 모듈이 이 성질에 기대고 있습니다)");
{
  const t = 창만들기();
  ok("App.SupabaseClient 가 얼어 있지 않다 (Object.freeze 금지)",
    !Object.isFrozen(t.App.SupabaseClient),
    "js/comment-fix.js:115 와 js/symbol-sync-bridge.js:621 이 get 을 갈아끼웁니다");
  ok("get 속성이 다시 쓸 수 있게 돼 있다",
    (Object.getOwnPropertyDescriptor(t.App.SupabaseClient, "get") || {}).writable === true);

  /* 실제로 감싸 봅니다 — bridge 가 하는 것과 같은 모양.
     ⚠️ Object.freeze 가 걸리면 이 대입 자체가 던집니다(strict mode).
        try 로 받아서 "테스트가 통째로 터짐" 이 아니라 "검사 1건 실패" 로 보이게 합니다. */
  const 원래 = t.App.SupabaseClient.get;
  let 감싼횟수 = 0;
  let 감싸기실패 = null;
  try {
    t.App.SupabaseClient.get = function () {
      const c = 원래.apply(this, arguments);
      if (c && !c.__도장) { c.__도장 = true; 감싼횟수++; }
      return c;
    };
  } catch (e) {
    감싸기실패 = e.message;
  }
  ok("get 을 실제로 갈아끼울 수 있다", 감싸기실패 === null,
    감싸기실패 + " — 이러면 종목 도장(symbol-sync-bridge)과 댓글 고쳐쓰기(comment-fix)가 조용히 죽습니다");
  const a = t.App.SupabaseClient.get();
  const b = t.App.SupabaseClient.get();
  ok("감싼 뒤에도 createClient 는 여전히 1번만 불린다 (실제 " + t.호출.length + "번)",
    t.호출.length === 1);
  ok("감싼 뒤에도 같은 객체를 돌려준다 — 도장이 한 번만 찍힌다 (실제 " + 감싼횟수 + "번)",
    a === b && 감싼횟수 === 1,
    "매번 새 client 면 종목 도장(symbol-sync-bridge)이 매번 다시 찍힙니다");
  t.win.close();
}

/* 감싸는 쪽이 중복 방지 표시를 그대로 갖고 있는지 — 이게 없으면 두 겹 세 겹이 됩니다.
   (감싼 뒤의 동작 자체는 tests/symbol-sync-bridge.test.js 담당입니다) */
{
  const BR = 주석제거(read("js/symbol-sync-bridge.js"));
  const CF = 주석제거(read("js/comment-fix.js"));
  ok("js/symbol-sync-bridge.js 가 두 번 감싸지 않게 표시를 남긴다",
    /__symbolBridged/.test(BR));
  ok("js/comment-fix.js 가 두 번 감싸지 않게 표시를 남긴다",
    /__commentFixWrapped/.test(CF));
  const GD = 주석제거(read("js/chat-blackout-guard.js"));
  ok("js/chat-blackout-guard.js 가 두 번 감싸지 않게 표시를 남긴다",
    /__chatBlackoutGuardWrapped/.test(GD));

  /* ── 2 -> 3 으로 올린 이유 (2026-08-28) ────────────────────────────────
     채팅이 영구히 비는 P1 을 고치려고 js/chat-blackout-guard.js 가 늘었습니다.
     js/chat.js 는 수정 금지라 밖에서 감싸는 것 말고는 방법이 없습니다.
     수리팀이 세 겹이 안전한지 숫자로 재서 올렸고, 그 근거로 올렸습니다.

     ⚠ 개수만 세면 안 됩니다 — 셋 중 하나가 원본을 안 넘겨도 개수는 3 입니다.
     그래서 아래에서 실제로 셋을 겹쳐 올려 원본까지 닿는지 확인합니다. */
  const 감싸야할것 = [
    "chat-blackout-guard.js",   // 채팅 영구 blackout 막기
    "comment-fix.js",           // 댓글 고쳐쓰기
    "symbol-sync-bridge.js"     // 종목 도장
  ].sort();
  const 감싸는것 = fs.readdirSync(path.join(REPO, "js"))
    .filter((f) => f.slice(-3) === ".js")
    .filter((f) => /App\.SupabaseClient\.get\s*=[^=]/.test(주석제거(read("js/" + f))))
    .sort();

  ok("get 을 갈아끼우는 모듈이 정확히 이 셋이다 (지금: " + JSON.stringify(감싸는것) + ")",
    감싸는것.join(",") === 감싸야할것.join(","),
    "있어야 할 것: " + JSON.stringify(감싸야할것) +
    " — 늘거나 바뀌면 순서가 동작을 바꿉니다. tests/storage-save-wrap-order.test.js 와 같은 종류의 사고입니다");

  /* ── 세 겹이 원본까지 닿는가 ───────────────────────────────────────────
     하나라도 원본을 안 부르고 자기가 만든 것을 돌려주면, 그 아래 모듈은
     통째로 죽습니다. 오류는 안 납니다 — 종목 도장이 안 찍히거나 댓글이
     안 고쳐지는 조용한 고장이 됩니다. */
  {
    const dom = new JSDOM(
      "<!doctype html><html><body><div id=\"chat-messages\"></div></body></html>",
      { runScripts: "outside-only", url: "https://example.test/" });
    const w = dom.window;
    w.setInterval = () => 0; w.clearInterval = () => {};
    w.setTimeout = () => 0; w.clearTimeout = () => {};

    const 원본도달 = { channel: 0, removeChannel: 0, from: 0 };
    const 진짜client = {
      channel: function (t) {
        원본도달.channel++;
        return { topic: t, subscribe: function (cb) { this._h = cb; return this; } };
      },
      removeChannel: function () { 원본도달.removeChannel++; return true; },
      from: function () { 원본도달.from++; return { select: () => ({ eq: () => ({}) }) }; }
    };
    let get호출 = 0;
    w.App = { SupabaseClient: { get: function () { get호출++; return 진짜client; } } };

    let 실림오류 = null;
    try {
      감싸야할것.forEach(function (f) { w.eval(read("js/" + f)); });
    } catch (e) { 실림오류 = e.message; }
    ok("세 모듈을 한 창에 같이 올릴 수 있다", 실림오류 === null, 실림오류);

    ["ChatBlackoutGuard", "CommentFix", "SymbolSyncBridge"].forEach(function (n) {
      const m = w.App[n];
      if (m && typeof m.install === "function") { try { m.install(); } catch (e) { /* noop */ } }
    });

    const c1 = w.App.SupabaseClient.get();
    const c2 = w.App.SupabaseClient.get();
    ok("세 겹을 지나도 원본 client 그대로가 나온다 (누가 바꿔치기하지 않았다)",
      c1 === 진짜client && c2 === 진짜client,
      "누군가 원본 대신 자기가 만든 것을 돌려주고 있습니다");

    ok("세 모듈의 도장이 전부 찍힌다 (원본이 끝까지 전달됐다는 뜻입니다)",
      w.App.SupabaseClient.__chatBlackoutGuardWrapped === true &&
      w.App.SupabaseClient.__commentFixWrapped === true &&
      w.App.SupabaseClient.__symbolBridged === true,
      JSON.stringify({
        guard: !!w.App.SupabaseClient.__chatBlackoutGuardWrapped,
        commentFix: !!w.App.SupabaseClient.__commentFixWrapped,
        bridge: !!w.App.SupabaseClient.__symbolBridged
      }));

    /* install() 을 더 불러도 겹이 늘면 안 됩니다 */
    for (let i = 0; i < 5; i++) {
      ["ChatBlackoutGuard", "CommentFix", "SymbolSyncBridge"].forEach(function (n) {
        const m = w.App[n];
        if (m && typeof m.install === "function") { try { m.install(); } catch (e) { /* noop */ } }
      });
    }
    ok("install() 을 다섯 번 더 불러도 여전히 같은 원본이 나온다 (겹이 안 늘어난다)",
      w.App.SupabaseClient.get() === 진짜client);

    /* 실제 호출이 원본 함수까지 닿는지 */
    const c = w.App.SupabaseClient.get();
    c.channel("chat_messages_live_1");
    c.channel("other_topic");
    c.removeChannel({});
    c.from("comments");
    c.from("profiles");
    ok("channel / removeChannel / from 이 전부 원본까지 닿는다 (실제: " +
      JSON.stringify(원본도달) + ")",
      원본도달.channel === 2 && 원본도달.removeChannel === 1 && 원본도달.from === 2,
      "하나라도 0 이면 그 위 모듈이 원본을 안 부르고 삼키고 있습니다");

    try { w.close(); } catch (e) { /* noop */ }
  }
}

/* =========================================================================
 * [7] 이 테스트가 실서버에 붙지 않았다
 * ========================================================================= */
section("[7] 실서버 무접속");
{
  const 나 = read("tests/supabase-client-seal.test.js");
  ok("이 테스트 파일이 http/https 모듈을 부르지 않는다",
    !/require\(["']https?["']\)/.test(나));
  ok("createClient 를 가짜로 바꿔치기해서 셌다", /win\.supabase\s*=/.test(나));
}

/* =========================================================================
 * [8] 수정 금지 파일 12개
 * ========================================================================= */
section("[8] 수정 금지 파일 12개");

const 기준 = {
  "trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
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
const md5 = (f) =>
  crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
Object.keys(기준).forEach((f) => {
  ok("js/" + f + " 를 건드리지 않았다", md5(f) === 기준[f], "지금: " + md5(f));
});

/* =========================================================================
 * [9] 테스트 등록
 * ========================================================================= */
section("[9] 테스트 등록");
{
  const 파일명 = "tests/supabase-client-seal.test.js";
  let order = "";
  try { order = read("tests/_order.txt"); } catch (e) { order = ""; }
  ok("npm test 목록에 이 파일이 있다", order.indexOf(파일명) >= 0,
    "tests/_order.txt 에 한 줄 넣지 않으면 아무도 안 돌립니다");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  실패목록.forEach((s) => console.log("  - " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
