/* =========================================================================
 * tests/chat-blackout-guard.test.js
 * =========================================================================
 * 채팅창이 "영구히 비어 버리는" 조용한 고장 (P1) 재발 방지
 *
 * ── 실제로 있었던 일 (조사팀 재현) ─────────────────────────────────────
 *   채팅 불러오기가 3초만 실패해도        글 8줄 -> 0줄
 *   연결이 정상으로 돌아온 뒤 8초         여전히 0줄
 *   그 뒤 122초(성공 조회 100회 이상)     여전히 0줄
 *   새로고침 전까지 안 돌아옵니다. 오류창도 없습니다.
 *   회원은 "글이 하나도 없구나" 로 믿습니다.
 *
 *   같이 걸려 있던 고리 — removeChannel() 이 그 채널의 subscribe 콜백을
 *   CLOSED 로 되부르고, chat.js 가 그걸 "끊겼다" 로 보고 1초 뒤 또 재연결합니다.
 *   붙을 때마다 시도횟수가 0 으로 돌아가서 간격이 1초에 고정됩니다.
 *   실측 24분 44초에 879건.
 *
 * ── 이 검사는 진짜 js/chat.js 를 jsdom 에 올려서 돌립니다 ──────────────
 *   가짜 supabase 클라이언트만 물려서, 조회 실패를 실제로 일으키고
 *   화면의 글줄 수를 셉니다. (문자열 검사가 아니라 동작 검사입니다)
 *
 * ── 지키는 것 ──────────────────────────────────────────────────────────
 *   [1] 고치기 전에는 진짜로 0줄이 된다 (재현이 살아 있는지 먼저 확인)
 *   [2] 고친 뒤에는 조회가 실패해도 글줄이 안 사라진다
 *   [3] 되살릴 줄이 없으면(부팅 때 실패) 직접 다시 불러와 그린다
 *   [4] 1초 주기 재연결 무한고리가 없다
 *   [5] 진짜 끊김(CHANNEL_ERROR)은 그대로 재연결한다 — 고리만 끊고 복구는 살린다
 *   [6] 실시간 새 글이 그대로 들어온다 — 고치려다 실시간을 죽이면 안 된다
 *   [7] 중복이 안 생긴다
 *   [8] 안내문 빨간 글씨가 계속 깜빡이지 않는다
 *   [9] js/chat.js 는 한 글자도 안 고쳤다 + index.html 이 새 모듈을 부른다
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; 실패목록.push(name); console.log("  X " + name + (detail ? " → " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 실제 서버는 구독이 붙는 데 시간이 걸립니다. 0ms 로 두면 "빨간 글씨 깜빡임" 이
   눈에 안 보일 만큼 짧아져서 검사가 무의미해집니다(실측 PM 보고 7/100). */
const SUBSCRIBE_DELAY_MS = 120;

/* ------------------------------------------------------------------ */
/* 실험대 — 진짜 chat.js + 가짜 supabase                                */
/* ------------------------------------------------------------------ */

const HTML = `<!doctype html><html><body>
  <div class="chat-messages" id="chat-messages"></div>
  <div class="chat-input-row">
    <input id="chat-input"><button id="chat-send-btn">전송</button>
  </div>
  <div class="chat-err" id="chat-err"></div>
</body></html>`;

function 메시지(n) {
  const out = [];
  for (let i = 1; i <= n; i++) {
    out.push({
      id: i,
      nickname: "회원" + i,
      message: "안녕하세요 " + i,
      created_at: new Date(Date.UTC(2026, 7, 28, 3, i)).toISOString(),
    });
  }
  return out;
}

/* 가짜 클라이언트 — supabase-js 의 "내가 지운 채널이 CLOSED 를 되쏜다" 를 그대로 흉내냅니다 */
function makeClient(state) {
  const stats = { selects: 0, channels: 0, removes: 0, closedFired: 0 };
  const channels = [];

  function makeChannel(topic) {
    const ch = {
      topic,
      _cb: null,
      _handler: null,
      on(evt, opts, handler) { ch._handler = handler; return ch; },
      subscribe(cb) {
        ch._cb = cb;
        setTimeout(() => { if (ch._cb) ch._cb("SUBSCRIBED"); }, SUBSCRIBE_DELAY_MS);
        return ch;
      },
    };
    return ch;
  }

  const client = {
    stats,
    channels,
    from() {
      const qb = {
        select() { return qb; },
        order() { return qb; },
        limit() { return qb; },
        then(onOk, onNg) {
          stats.selects++;
          const res = state.fail
            ? { data: null, error: { message: "네트워크 실패(테스트)" } }
            : { data: state.rows.slice().reverse(), error: null };
          return Promise.resolve(res).then(onOk, onNg);
        },
      };
      return qb;
    },
    channel(topic) {
      stats.channels++;
      const ch = makeChannel(topic);
      channels.push(ch);
      return ch;
    },
    removeChannel(ch) {
      stats.removes++;
      /* supabase-js 와 동일 — 지우면 그 채널 콜백이 CLOSED 로 불립니다 */
      if (ch && ch._cb) { stats.closedFired++; ch._cb("CLOSED"); }
    },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  };
  return client;
}

async function boot(opts) {
  const state = { fail: !!opts.failFromStart, rows: 메시지(opts.count || 8) };
  const dom = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;
  const client = makeClient(state);

  win.App = { SupabaseClient: { get: () => client } };
  win.console = console;

  win.eval(fs.readFileSync(path.join(REPO, "js", "chat.js"), "utf8"));
  if (opts.guard) {
    win.eval(fs.readFileSync(path.join(REPO, "js", "chat-blackout-guard.js"), "utf8"));
    win.App.ChatBlackoutGuard.init();
  }
  await win.App.Chat.init();
  await sleep(60);
  return { dom, win, client, state };
}

function 줄수(win) { return win.document.querySelectorAll("#chat-messages .chat-msg").length; }
function 안내문(win) {
  const e = win.document.querySelector("#chat-messages .chat-empty");
  return e ? e.textContent : "";
}

/* 실패 -> 재연결 -> 회복 이라는 실제 흐름을 그대로 태웁니다 */
async function 조회실패후회복(t, 표본수) {
  const before = 줄수(t.win);

  t.state.fail = true;
  t.client.channels[0]._cb("CHANNEL_ERROR");   // 진짜 끊김 1회
  await sleep(1300);                            // chat.js 의 재연결(1초) + 실패한 재조회
  const during = 줄수(t.win);

  t.state.fail = false;                         // 연결 회복
  /* 표본을 뜨면서 기다립니다 — 빨간 글씨가 몇 번 보이는지도 같이 셉니다 */
  let 빨간글씨 = 0;
  const n = 표본수 || 100;
  for (let i = 0; i < n; i++) {
    if ((t.win.document.getElementById("chat-err").textContent || "").length > 0) 빨간글씨++;
    await sleep(50);
  }
  return { before, during, after: 줄수(t.win), 빨간글씨, 표본: n };
}

(async function run() {
  /* ============================================================== [1] */
  section("[1] 고치기 전 — 재현이 살아 있나 (이게 실패하면 검사 자체가 무의미합니다)");

  const 전 = await boot({ guard: false, count: 8 });
  ok("처음에 8줄이 보인다", 줄수(전.win) === 8, String(줄수(전.win)));
  const r전 = await 조회실패후회복(전, 100);
  console.log("     실측(고치기 전): " + r전.before + "줄 -> " + r전.during + "줄 -> 회복 5초 뒤 " + r전.after +
    "줄 / 조회 " + 전.client.stats.selects + "회 / 채널 " + 전.client.stats.channels +
    "개 / 빨간글씨 " + r전.빨간글씨 + "/" + r전.표본);

  ok("(고치기 전) 조회가 실패하면 글줄이 전부 사라진다", r전.during === 0, String(r전.during));
  ok("(고치기 전) 연결이 돌아오고 조회에 성공해도 0줄 그대로다", r전.after === 0, String(r전.after));
  ok("(고치기 전) 성공 조회가 여러 번 있었는데도 0줄이다",
    전.client.stats.selects >= 3 && r전.after === 0, "조회 " + 전.client.stats.selects + "회");
  ok("(고치기 전) 1초 주기 재연결 무한고리가 돈다",
    전.client.stats.channels >= 4, "채널 " + 전.client.stats.channels + "개");
  전.dom.window.close();

  /* ============================================================== [2] */
  section("[2] 고친 뒤 — 글줄이 사라지지 않는다");

  const 후 = await boot({ guard: true, count: 8 });
  ok("처음에 8줄이 보인다", 줄수(후.win) === 8, String(줄수(후.win)));
  const r후 = await 조회실패후회복(후, 100);
  console.log("     실측(고친 뒤): " + r후.before + "줄 -> " + r후.during + "줄 -> 회복 5초 뒤 " + r후.after +
    "줄 / 조회 " + 후.client.stats.selects + "회 / 채널 " + 후.client.stats.channels +
    "개 / 빨간글씨 " + r후.빨간글씨 + "/" + r후.표본);

  ok("조회가 실패해도 글줄이 남는다", r후.during === 8, String(r후.during));
  ok("연결이 돌아온 뒤에도 8줄 그대로다", r후.after === 8, String(r후.after));
  ok('"채팅을 불러오지 못했습니다." 안내문이 화면에 남지 않는다',
    안내문(후.win).indexOf("불러오지 못했습니다") === -1, 안내문(후.win));
  ok("되살리기가 실제로 일어났다", 후.win.App.ChatBlackoutGuard.stats.restoreEvents >= 1,
    JSON.stringify(후.win.App.ChatBlackoutGuard.stats));

  /* ============================================================== [4] */
  section("[4] 1초 주기 재연결 무한고리가 없다");

  ok("내가 지운 채널이 되쏘는 CLOSED 를 막았다",
    후.win.App.ChatBlackoutGuard.stats.swallowedCloses >= 1,
    "막은 횟수 " + 후.win.App.ChatBlackoutGuard.stats.swallowedCloses);
  ok("채널이 계속 늘어나지 않는다 (5초 뒤에도 3개 이하)",
    후.client.stats.channels <= 3, "채널 " + 후.client.stats.channels + "개");
  ok("조회 횟수가 폭주하지 않는다 (5초에 4회 이하)",
    후.client.stats.selects <= 4, "조회 " + 후.client.stats.selects + "회");
  ok("고치기 전보다 채널 수가 확실히 줄었다",
    후.client.stats.channels < 전.client.stats.channels,
    후.client.stats.channels + " vs " + 전.client.stats.channels);

  /* ============================================================== [8] */
  section("[8] 빨간 글씨가 계속 깜빡이지 않는다");
  ok("(고치기 전) 안내문이 표본 100회 중 여러 번 깜빡인다", r전.빨간글씨 >= 1,
    r전.빨간글씨 + "/100");
  ok("(고친 뒤) 표본 100회 중 한 번도 안 깜빡인다", r후.빨간글씨 === 0,
    r후.빨간글씨 + "/100 (고치기 전 " + r전.빨간글씨 + "/100)");
  ok("회복 뒤에는 안내문이 남아 있지 않다",
    (후.win.document.getElementById("chat-err").textContent || "") === "",
    후.win.document.getElementById("chat-err").textContent);

  /* ============================================================== [6] */
  section("[6] 실시간이 그대로 살아 있다 (제일 중요 — 고치려다 죽이면 안 됩니다)");

  const 살아있는채널 = 후.client.channels[후.client.channels.length - 1];
  ok("구독 중인 채널이 있다", !!(살아있는채널 && 살아있는채널._handler));
  살아있는채널._handler({ new: { id: 9001, nickname: "새사람", message: "실시간 도착", created_at: new Date().toISOString() } });
  await sleep(30);
  ok("실시간으로 온 새 글이 화면에 붙는다", 줄수(후.win) === 9, String(줄수(후.win)));
  ok("새 글 내용이 실제로 보인다",
    후.win.document.getElementById("chat-messages").textContent.indexOf("실시간 도착") !== -1);

  /* ============================================================== [7] */
  section("[7] 중복이 안 생긴다");
  {
    const texts = Array.from(후.win.document.querySelectorAll("#chat-messages .chat-msg-text")).map((e) => e.textContent);
    const uniq = new Set(texts);
    ok("같은 글이 두 번 그려지지 않았다", texts.length === uniq.size, texts.length + " vs " + uniq.size);
  }
  후.dom.window.close();

  /* ============================================================== [5] */
  section("[5] 진짜 끊김은 그대로 재연결한다 (고리만 끊고 복구는 살립니다)");
  {
    const t = await boot({ guard: true, count: 3 });
    const 전채널 = t.client.stats.channels;
    t.client.channels[t.client.channels.length - 1]._cb("CHANNEL_ERROR");
    await sleep(1300);
    ok("스스로 끊긴 채널은 재연결로 이어진다", t.client.stats.channels === 전채널 + 1,
      전채널 + " -> " + t.client.stats.channels);
    ok("재연결 뒤 글줄이 그대로다", 줄수(t.win) === 3, String(줄수(t.win)));
    t.dom.window.close();
  }

  /* ============================================================== [3] */
  section("[3] 부팅 때부터 못 불러온 경우 — 직접 다시 불러온다");
  {
    const t = await boot({ guard: true, count: 5, failFromStart: true });
    ok("처음에는 0줄이고 안내문이 뜬다",
      줄수(t.win) === 0 && 안내문(t.win).indexOf("불러오지 못했습니다") !== -1,
      줄수(t.win) + " / " + 안내문(t.win));
    t.state.fail = false;
    await sleep(1500);   // 첫 재조회는 1초 뒤
    console.log("     실측(부팅 실패): 0줄 -> " + 줄수(t.win) + "줄");
    ok("스스로 다시 불러와 5줄을 그린다", 줄수(t.win) === 5, String(줄수(t.win)));
    ok("안내문이 사라진다", 안내문(t.win).indexOf("불러오지 못했습니다") === -1, 안내문(t.win));

    /* 그 뒤 chat.js 가 같은 글을 또 그려도 중복이 안 남아야 합니다 */
    t.client.channels[t.client.channels.length - 1]._cb("CHANNEL_ERROR");
    await sleep(1300);
    const texts = Array.from(t.win.document.querySelectorAll("#chat-messages .chat-msg-text")).map((e) => e.textContent);
    ok("chat.js 가 나중에 같은 글을 그려도 중복이 안 남는다",
      texts.length === new Set(texts).size && texts.length === 5,
      texts.length + "줄 / 서로 다른 " + new Set(texts).size + "줄");
    t.dom.window.close();
  }

  /* ============================================================== [9] */
  section("[9] 수정 금지 파일 무수정 + 연결 확인");
  {
    const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, p))).digest("hex");
    ok("js/chat.js 가 기준 해시 그대로다", md5("js/chat.js") === "a93dfaa7f82ce72a914b270acb3650bb", md5("js/chat.js"));
    /* ⭐ fs.existsSync 로는 "디스크엔 있고 git 엔 없는 파일" 을 못 잡습니다.
       내 PC 에서만 열리고 clone 한 PC 에서는 404 가 되는 조용한 고장입니다.
       (CLAUDE.md 2026-08-27 · 하루에 세 번 났습니다) */
    let 추적목록 = null;
    try {
      추적목록 = new Set(
        require("child_process")
          .execFileSync("git", ["ls-files", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 40 * 1024 * 1024 })
          .split("\0").filter(Boolean)
      );
    } catch (e) { 추적목록 = null; }
    if (!추적목록 || 추적목록.size === 0) {
      ok("[건너뜀] git 추적 검사 — git 저장소가 아닙니다", true);
    } else {
      ok("js/chat-blackout-guard.js 가 git 에 추적되고 있다",
        추적목록.has("js/chat-blackout-guard.js"),
        "디스크에는 있어도 git 에 없으면 라이브에서 404 입니다 — 커밋할 때 이 파일 이름을 꼭 넣어주세요");
    }
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok("index.html 이 새 모듈을 부른다", html.indexOf('src="js/chat-blackout-guard.js"') !== -1);
    ok("chat.js 보다 뒤에서 부른다",
      html.indexOf('src="js/chat-blackout-guard.js"') > html.indexOf('src="js/chat.js"'));
    const order = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
    ok("이 검사가 tests/_order.txt 에 등록돼 있다",
      order.indexOf("tests/chat-blackout-guard.test.js") !== -1,
      "등록하지 않으면 npm test 에서 안 돌 수 있습니다");
    const src = fs.readFileSync(path.join(REPO, "js", "chat-blackout-guard.js"), "utf8");
    ok("되살릴 때 다시 조회하지 않는다 (중복 원천 차단)",
      src.indexOf("box.appendChild(removedRows[k])") !== -1);
    /* 주석은 설명글이라 검사에서 뺍니다 — 실제로 도는 본문만 봅니다 */
    const 본문 = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    ok('"아직 대화가 없습니다" 는 되살리지 않는다 (관리자 초기화 보호)',
      본문.indexOf("아직 대화가") === -1 && 본문.indexOf("LOAD_FAIL_TEXT") !== -1,
      "되살리기 조건은 \"채팅을 불러오지 못했습니다.\" 하나뿐이어야 합니다");
  }

  /* ============================================================= [10] */
  section("[10] 세 겹 감싸기가 안전한가 (App.SupabaseClient.get 을 감싸는 모듈이 3개가 됐습니다)");
  {
    /* index.html 순서 그대로 —
       chat-blackout-guard(1117) -> comment-fix(1123) -> symbol-sync-bridge(1297) */
    const vc = new (require("jsdom").VirtualConsole)();
    vc.on("jsdomError", () => {});
    const d = new JSDOM("<!doctype html><html><body><div id='chat-messages'></div></body></html>",
      { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/", virtualConsole: vc });
    const w = d.window;
    w.console = { log() {}, warn() {}, error() {} };

    let created = 0;
    const raw = { channel: 0, removeChannel: 0, from: 0 };
    w.supabase = {
      createClient() {
        created++;
        const c = {
          from() { raw.from++; const qb = { select() { return qb; }, order() { return qb; }, limit() { return qb; }, eq() { return qb; }, in() { return qb; }, then(f) { return Promise.resolve({ data: [], error: null }).then(f); } }; return qb; },
          channel(topic) { raw.channel++; const ch = { topic, on() { return ch; }, subscribe(cb) { ch._cb = cb; return ch; } }; return ch; },
          removeChannel(ch) { raw.removeChannel++; if (ch && ch._cb) ch._cb("CLOSED"); },
          auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
        };
        return c;
      },
    };

    const 순서 = ["js/supabase-client.js", "js/chat-blackout-guard.js", "js/comment-fix.js", "js/symbol-sync-bridge.js"];
    let 로드성공 = 0;
    for (const f of 순서) {
      try { w.eval(fs.readFileSync(path.join(REPO, f), "utf8")); 로드성공++; } catch (e) { /* 아래에서 실패로 잡힙니다 */ }
    }
    ok("네 파일이 index.html 순서대로 전부 실린다", 로드성공 === 4, 로드성공 + "/4");

    /* 부팅이 두 번 되는 상황 — 감싸기를 여러 번 불러도 겹치면 안 됩니다 */
    for (let i = 0; i < 5; i++) { w.App.ChatBlackoutGuard.install(); w.App.CommentFix.install(); }

    const c1 = w.App.SupabaseClient.get();
    const c2 = w.App.SupabaseClient.get();
    const c3 = w.App.SupabaseClient.get();
    ok("client 는 여전히 딱 한 번만 만들어진다", created === 1, "createClient " + created + "회");
    ok("몇 번을 불러도 같은 객체다", c1 === c2 && c2 === c3);
    ok("세 모듈의 도장이 전부 찍힌다 (하나라도 원본을 안 넘기면 뒤엣것이 죽습니다)",
      !!c1.__chatBlackoutGuardPatched && !!c1.__commentFixPatched && !!c1.__symbolBridged,
      JSON.stringify({ guard: !!c1.__chatBlackoutGuardPatched, commentFix: !!c1.__commentFixPatched, bridge: !!c1.__symbolBridged }));
    ok("감싸기를 5번씩 더 불러도 두 겹으로 안 감긴다",
      !!w.App.SupabaseClient.__chatBlackoutGuardWrapped && !!w.App.SupabaseClient.__commentFixWrapped);

    const ch = c1.channel("chat_messages_live_1");
    let 콜백도달 = null;
    ch.subscribe((s) => { 콜백도달 = s; });
    c1.removeChannel(ch);
    const 다른채널 = c1.channel("other_topic_1");
    c1.from("post_comments").select("*, profiles(nickname)");
    c1.from("chat_messages").select("*").order("created_at").limit(50);

    ok("감싼 뒤에도 원본 channel/removeChannel/from 이 그대로 불린다",
      raw.channel === 2 && raw.removeChannel === 1 && raw.from === 2, JSON.stringify(raw));
    ok("내가 지운 채널의 CLOSED 만 삼킨다",
      콜백도달 === null && w.App.ChatBlackoutGuard.stats.swallowedCloses === 1,
      "도달=" + 콜백도달 + " 삼킨수=" + w.App.ChatBlackoutGuard.stats.swallowedCloses);
    ok("채팅이 아닌 채널(other_topic)은 아예 감싸지 않는다", 다른채널.__chatGuardWrapped === undefined);
    ok("이 모듈은 client.from 을 건드리지 않는다 (comment-fix / symbol-sync-bridge 와 안 겹칩니다)",
      fs.readFileSync(path.join(REPO, "js", "chat-blackout-guard.js"), "utf8").indexOf("client.from =") === -1);
    d.window.close();
  }

  /* ============================================================= [11] */
  section("[11] 내가 지운 줄을 내가 되살리는 되돌이가 없다 (2026-08-28 기록팀 지적)");
  {
    const d = new JSDOM("<!doctype html><html><body><div id='chat-messages'></div></body></html>",
      { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
    const w = d.window;
    w.App = { SupabaseClient: { get: () => null } };
    w.console = { log() {}, warn() {}, error() {} };
    w.eval(fs.readFileSync(path.join(REPO, "js", "chat-blackout-guard.js"), "utf8"));
    w.App.ChatBlackoutGuard.init();

    const box = w.document.getElementById("chat-messages");
    const 우리줄 = (t) => {
      const r = w.document.createElement("div");
      r.className = "chat-msg";
      r.setAttribute("data-chat-guard", "1");
      r.innerHTML = '<span class="chat-msg-nick">회원1</span><span class="chat-msg-time">12:00</span><div class="chat-msg-text">' + t + "</div>";
      return r;
    };
    box.appendChild(우리줄("가"));
    box.appendChild(우리줄("나"));
    await sleep(30);

    /* chat.js 가 같은 글을 다시 그리는 것과, 조회 실패 안내가 같은 묶음에 겹치는 순간 */
    const chatRow = w.document.createElement("div");
    chatRow.className = "chat-msg";
    chatRow.innerHTML = '<span class="chat-msg-nick">회원1</span><span class="chat-msg-time">12:00</span><div class="chat-msg-text">가</div>';
    box.appendChild(chatRow);
    const empty = w.document.createElement("div");
    empty.className = "chat-empty";
    empty.textContent = "채팅을 불러오지 못했습니다.";
    box.appendChild(empty);
    await sleep(120);

    const texts = Array.from(box.querySelectorAll(".chat-msg-text")).map((e) => e.textContent);
    ok("중복으로 걷어낸 줄이 되살아나지 않는다",
      texts.filter((t) => t === "가").length === 1, JSON.stringify(texts));
    ok("되살리기가 헛돌지 않는다 (restoreEvents 상한)",
      w.App.ChatBlackoutGuard.stats.restoreEvents <= 1,
      "restoreEvents=" + w.App.ChatBlackoutGuard.stats.restoreEvents);
    d.window.close();
  }

  console.log("\n통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 목록: " + 실패목록.join(", ")); process.exit(1); }
  process.exit(0);
})().catch((e) => {
  console.log("  X 검사 도중 오류: " + (e && e.stack || e));
  console.log("\n통과 " + pass + " / 실패 " + (fail + 1));
  process.exit(1);
});
