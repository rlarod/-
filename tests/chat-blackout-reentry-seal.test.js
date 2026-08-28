/* tests/chat-blackout-reentry-seal.test.js
 * =========================================================================
 * 채팅 되살리기 모듈 봉인 — 2026-08-28 (기록팀)
 *   대상: js/chat-blackout-guard.js  (App.ChatBlackoutGuard)
 * =========================================================================
 * 이 파일은 tests/chat-blackout-guard.test.js 와 겹치지 않습니다.
 *
 *   수리팀 파일   "고치기 전 / 고친 뒤" 를 마주 놓고 재는 검사
 *   이 파일       그 고침이 되돌아가지 못하게 못 박는 검사
 *                 되돌이 상한 · 채널 표시값 · git 추적
 *
 *   같은 파일에 넣지 않은 이유는 수리팀이 지금도 그 파일을 만지고 있어서
 *   서로 덮어쓰기 때문입니다.
 *
 * ── (1) 되돌이 구멍 — 내가 지운 줄을 내가 되살리는 고리 ────────────────
 *
 *   dropOurDuplicates() 가 우리 임시줄을 지우면, 그 삭제가 곧바로
 *   관찰기에 "사라진 글줄" 로 잡힙니다. 그때 마침 실패 안내가 떠 있으면
 *   방금 내가 일부러 지운 줄을 내가 되살립니다.
 *
 *   2026-08-28 실측 — 같은 글 5줄을 두 판에 똑같이 넣고 재었습니다.
 *
 *       고친 뒤(__guardDropped 표시 있음)   줄 5개    중복 0   되살리기 0회
 *       그 검사만 뺀 판                     줄 10개   중복 5   되살리기 1회
 *
 *   중복 5줄은 회원 눈에 같은 말이 두 번 적힌 채팅으로 보입니다.
 *   오류도 안 나고 빨간 글씨도 없습니다. 조용한 고장입니다.
 *
 * ── (2) 되살리기가 폭주하지 않는다 ─────────────────────────────────────
 *
 *   되살리기는 실패 횟수만큼만 일어나야 합니다. 한 번의 실패가 여러 번의
 *   되살리기를 부르면 그것이 무한고리의 씨앗입니다.
 *   2026-08-28 실측 — 실패 5회 -> 되살리기 정확히 5회 / 글 8줄 그대로.
 *
 * ── (3) "내가 지운 채널" 표시가 실제로 걸린다 ──────────────────────────
 *
 *   1초 주기 재연결 고리를 끊는 장치입니다.
 *   시간 간격은 흉내 내지 않습니다 — 1초 주기 루프는 supabase-js 안쪽이라
 *   가짜 채널로는 언제나 성공해서 아무것도 안 지킵니다(차트 채널 봉인 때
 *   같은 함정). 대신 표시가 걸리는가 / 안 걸린 채널은 그대로 통과하는가 를
 *   값으로 봅니다. 진짜 끊김의 자동 재연결은 살아 있어야 합니다.
 *
 * 서버도 브라우저도 부르지 않습니다. 가짜 클라이언트만 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chat-blackout-guard.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

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
const 잠깐 = () => new Promise((r) => setTimeout(r, 0));

const 가드줄고르기 = ".chat-msg[data-chat-guard='1']";

/** 채팅칸 하나짜리 빈 창에 모듈을 띄웁니다. */
function 띄우기(모듈소스) {
  const dom = new JSDOM(
    "<!doctype html><html><body><div id=\"chat-messages\"></div></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.App = {};
  win.App.SupabaseClient = { get: () => null };   /* 진짜 서버는 절대 안 부릅니다 */
  win.eval(모듈소스 || SRC);
  win.App.ChatBlackoutGuard.init();
  return {
    win: win,
    d: win.document,
    box: win.document.getElementById("chat-messages"),
    G: win.App.ChatBlackoutGuard,
    닫기: function () { try { win.close(); } catch (e) { /* noop */ } }
  };
}

/** chat.js 가 그리는 글줄과 같은 모양. 가드=true 면 우리가 그린 임시줄입니다. */
function 글줄(t, 본문, 가드) {
  const r = t.d.createElement("div");
  r.className = "chat-msg";
  if (가드) r.setAttribute("data-chat-guard", "1");
  const 조각 = [["chat-msg-nick", "갑"], ["chat-msg-time", "10:00"], ["chat-msg-text", 본문]];
  for (let i = 0; i < 조각.length; i++) {
    const e = t.d.createElement("span");
    e.className = 조각[i][0];
    e.textContent = 조각[i][1];
    r.appendChild(e);
  }
  return r;
}

/** chat.js 의 renderEmpty 가 남기는 안내문 */
function 실패안내(t) {
  const r = t.d.createElement("div");
  r.className = "chat-empty";
  r.textContent = t.G.LOAD_FAIL_TEXT;
  return r;
}

const 줄수 = (t) => t.box.querySelectorAll(".chat-msg").length;
const 가드줄수 = (t) => t.box.querySelectorAll(가드줄고르기).length;
const 본문들 = (t) => Array.prototype.slice
  .call(t.box.querySelectorAll(".chat-msg-text")).map((e) => e.textContent);
const 중복수 = (a) => a.length - new Set(a).size;

console.log("\n채팅 되살리기 모듈 봉인 — 되돌이 · 채널표시 · git추적 (2026-08-28)");

/* =========================================================================
 * [0] 수정 금지 파일 · git 추적
 * ========================================================================= */
절("[0] 수정 금지 파일 · git 에 실제로 올라가 있는가");
{
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  ok("js/chat.js 를 한 글자도 안 고쳤다 (밖에서 감싸는 방식이 지켜지고 있다)",
    md5("chat.js") === "a93dfaa7f82ce72a914b270acb3650bb", md5("chat.js"));

  /* ── fs.existsSync 로는 못 잡습니다 ──────────────────────────────────
     내 컴퓨터에 파일이 있어도 git 에 없으면 라이브에서 404 입니다.
     2026-08-28 실제로 이 모듈이 그 상태였습니다 — index.html 은 부르는데
     git 에는 없었습니다. 화면도 문서도 멀쩡하고 clone 한 PC 에서만 깨집니다. */
  let 추적목록 = "";
  let git됨 = true;
  try {
    추적목록 = execFileSync("git", ["ls-files", "-z", "--", "js", "css"],
      { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) { git됨 = false; }
  const 추적 = new Set(추적목록.split(String.fromCharCode(0)).filter(Boolean));

  ok("git ls-files 를 읽을 수 있다 (못 읽으면 아래 검사가 무의미합니다)",
    git됨 && 추적.size > 0, "추적 " + 추적.size + "개");
  ok(MOD + " 가 git 에 올라가 있다 (fs.existsSync 로는 못 잡는 자리입니다)",
    !git됨 || 추적.has(MOD),
    "디스크엔 있는데 git 에 없으면 라이브에서 404 입니다");

  const 부름 = "src=\"" + MOD + "\"";
  ok("index.html 이 이 모듈을 부른다", HTML.indexOf(부름) !== -1);
  ok("index.html 에 한 줄만 실린다 (두 번 실리면 감싸기가 두 겹입니다)",
    HTML.split(부름).length - 1 === 1, String(HTML.split(부름).length - 1));
  ok("js/chat.js 보다 뒤에서 부른다 (먼저 부르면 감쌀 대상이 아직 없습니다)",
    HTML.indexOf(부름) > HTML.indexOf("src=\"js/chat.js\""));
}

/* ── 되돌이가 터지는 바로 그 상황 ────────────────────────────────────
   우리 임시줄이 화면에 있고, 실패 안내가 떠 있는 상태에서
   chat.js 가 같은 글을 그립니다. 중복 걷어내기와 되살리기가 겹칩니다. */
async function 되돌이상황(모듈소스) {
  const t = 띄우기(모듈소스);
  for (let i = 0; i < 5; i++) t.box.appendChild(글줄(t, "글" + i, true));
  await 잠깐(); await 잠깐();
  t.box.appendChild(실패안내(t));
  await 잠깐(); await 잠깐();
  for (let i = 0; i < 5; i++) t.box.appendChild(글줄(t, "글" + i));
  for (let k = 0; k < 30; k++) await 잠깐();
  return t;
}

/** chat.js 가 조회에 회수만큼 잇따라 실패하는 상황 */
async function 실패반복(회수) {
  const t = 띄우기();
  for (let i = 0; i < 8; i++) t.box.appendChild(글줄(t, "글" + i));
  await 잠깐(); await 잠깐();
  for (let n = 0; n < 회수; n++) {
    t.box.innerHTML = "";                     /* renderEmpty 흉내 */
    t.box.appendChild(실패안내(t));
    await 잠깐(); await 잠깐();
  }
  for (let k = 0; k < 10; k++) await 잠깐();
  return t;
}

/** 서버에 안 붙는 가짜 클라이언트 */
function 가짜클라이언트() {
  const 만들어진 = [];
  return {
    지운것: [],
    만들어진: 만들어진,
    channel: function (topic) {
      const ch = {
        topic: topic,
        _handler: null,
        subscribe: function (cb) { ch._handler = cb; return ch; }
      };
      만들어진.push(ch);
      return ch;
    },
    removeChannel: function (ch) { this.지운것.push(ch); return true; }
  };
}

/* 관찰기가 비동기라 이어서 돌립니다 */
(async function () {
  /* =======================================================================
   * [1] 되돌이 — 내가 지운 줄을 내가 되살리지 않는다
   * ===================================================================== */
  절("[1] 되돌이 — 중복 걷어낸 줄이 되살아나지 않는다");
  {
    const t = await 되돌이상황();
    const 본문 = 본문들(t);
    ok("우리 임시줄 5 + chat.js 5 를 넣으면 화면에 5줄만 남는다",
      줄수(t) === 5, String(줄수(t)) + "줄 — " + 본문.join(","));
    ok("같은 말이 두 번 보이지 않는다 (중복 0)",
      중복수(본문) === 0, "중복 " + 중복수(본문) + "개 — " + 본문.join(","));
    ok("중복 걷어내기는 실제로 일어났다 (안 일어나면 위 검사가 공짜로 통과합니다)",
      t.G.stats.dedupedRows === 5, String(t.G.stats.dedupedRows));
    ok("내가 지운 줄을 되살리지 않았다 (되살리기 0회)",
      t.G.stats.restoreEvents === 0, String(t.G.stats.restoreEvents) + "회");
    ok("우리 임시줄은 화면에 하나도 안 남는다 (chat.js 것만 남습니다)",
      가드줄수(t) === 0, String(가드줄수(t)));
    t.닫기();
  }
  {
    /* ── 이 봉인이 진짜 잡는지 스스로 확인합니다 ───────────────────────
       막는 검사 한 줄을 뺀 판을 만들어 돌려 봅니다.
       빼면 중복 5줄이 생겨야 정상입니다. 안 생기면 위 검사들은
       아무것도 안 지키고 있다는 뜻이라 여기서 실패로 알립니다. */
    const 표시검사 = SRC.indexOf("!n.__guardDropped") !== -1;
    ok("되돌이를 막는 표시 검사가 코드에 있다 (일부러 지운 줄 걸러내기)",
      표시검사, "이 검사가 없으면 중복 5줄이 생깁니다");

    if (표시검사) {
      const 구멍 = SRC.replace(/ &&\s*\n\s*!n\.__guardDropped\) \{[^\n]*\n/, ") {\n");
      const 만들어짐 = 구멍 !== SRC && 구멍.indexOf("!n.__guardDropped") === -1;
      ok("검사만 뺀 판을 실제로 만들었다 (못 만들면 아래 확인이 무의미합니다)", 만들어짐);
      if (만들어짐) {
        const t2 = await 되돌이상황(구멍);
        const 본문2 = 본문들(t2);
        ok("검사를 빼면 중복 5줄이 생긴다 — 이 봉인이 지키는 것이 이것입니다",
          중복수(본문2) === 5 && 줄수(t2) === 10,
          "줄 " + 줄수(t2) + " / 중복 " + 중복수(본문2) + " — 0 이면 봉인이 헛돌고 있습니다");
        t2.닫기();
      }
    }
  }

  /* =======================================================================
   * [1-2] 되살릴 때 다시 조회하지 않는다 — 이 설계의 핵심
   * =======================================================================
   * 감사팀이 이렇게 걱정했습니다 —
   *   "다시 조회해서 그리면 chat.js 의 seenIds 와 어긋난다"
   * 맞는 걱정입니다. 그런데 이 모듈은 다시 조회하지 않습니다.
   * renderEmpty() 가 방금 떼어낸 **그 DOM 노드 자체**를 도로 붙입니다.
   * 그래서 화면과 seenIds 가 늘 1:1 이고, seenIds 를 건드릴 일이 없습니다.
   *
   * 나중에 누가 "다시 조회하는 게 낫겠는데" 하고 바꾸면 감사팀 우려가
   * 그대로 실현됩니다 — 받아온 글은 seenIds 에 이미 있어서 화면에 안 그려지고,
   * 채팅은 다시 영구히 빈 채로 남습니다.
   * 그래서 "같은 노드가 돌아오는가" 를 객체 동일성으로 못 박습니다.
   * ===================================================================== */
  절("[1-2] 되살릴 때 다시 조회하지 않고 원래 노드를 되붙인다");
  {
    const t = 띄우기();
    const 원래노드 = [];
    for (let i = 0; i < 4; i++) {
      const r = 글줄(t, "글" + i);
      원래노드.push(r);
      t.box.appendChild(r);
    }
    await 잠깐(); await 잠깐();

    t.box.innerHTML = "";                       /* chat.js 의 renderEmpty 흉내 */
    t.box.appendChild(실패안내(t));
    for (let k = 0; k < 20; k++) await 잠깐();

    const 지금노드 = Array.prototype.slice.call(t.box.querySelectorAll(".chat-msg"));
    ok("4줄이 그대로 돌아왔다", 지금노드.length === 4, String(지금노드.length));
    ok("돌아온 것이 새로 만든 줄이 아니라 원래 그 노드다 (다시 조회하지 않았다는 증거)",
      지금노드.length === 4 && 지금노드.every((n, i) => n === 원래노드[i]),
      "새 노드로 바뀌었으면 어딘가에서 다시 조회해 그린 것입니다 — " +
      "그러면 chat.js 의 seenIds 와 어긋나 채팅이 다시 영구히 빕니다");
    ok("우리 표식(data-chat-guard)이 붙지 않는다 (chat.js 가 그린 줄 그대로입니다)",
      가드줄수(t) === 0, String(가드줄수(t)));
    ok("되살리는 동안 서버를 부르지 않았다 (직접 조회 0회)",
      t.G.stats.refetches === 0, String(t.G.stats.refetches) + "회");
    ok("직접 그린 줄도 0줄이다", t.G.stats.refetchRows === 0, String(t.G.stats.refetchRows));
    t.닫기();
  }
  {
    /* 코드에도 근거가 남아 있어야 다음 사람이 안 바꿉니다 */
    ok("다시 조회하지 않는다는 근거가 코드에 적혀 있다",
      SRC.indexOf("다시 조회하지 않") !== -1 || SRC.indexOf("다시 조회하지 않습니다") !== -1,
      "이 근거가 없으면 다음 사람이 '다시 불러오면 되잖아' 하고 바꿉니다");
    ok("seenIds 와 어긋나지 않는다는 설명이 남아 있다",
      SRC.indexOf("seenIds") !== -1);
  }

  /* =======================================================================
   * [2] 되살리기 폭주 방지
   * ===================================================================== */
  절("[2] 되살리기가 실패 횟수만큼만 일어난다");
  {
    const t = await 실패반복(5);
    ok("실패 5회 뒤에도 글 8줄이 그대로 있다", 줄수(t) === 8, String(줄수(t)));
    ok("되살리기가 정확히 5회다 (더 많으면 고리가 돌고 있는 것입니다)",
      t.G.stats.restoreEvents === 5, String(t.G.stats.restoreEvents) + "회");
    ok("되살린 줄 수가 8 x 5 = 40 이다 (줄이 불어나지 않는다)",
      t.G.stats.restoredRows === 40, String(t.G.stats.restoredRows));
    ok("실패 안내가 화면에 남아 있지 않다", !t.box.querySelector(".chat-empty"));
    ok("중복이 생기지 않았다", 중복수(본문들(t)) === 0, 본문들(t).join(","));
    t.닫기();
  }
  {
    const t = await 실패반복(1);
    ok("실패 1회면 되살리기도 1회다", t.G.stats.restoreEvents === 1,
      String(t.G.stats.restoreEvents));
    t.닫기();
  }

  /* =======================================================================
   * [3] 채널 표시 — 내가 지운 채널만 삼킨다
   * ===================================================================== */
  절("[3] 채널 표시 — 내가 지운 채널만 삼킨다");
  {
    const t = 띄우기();
    const c = 가짜클라이언트();
    t.G.patchClient(c);

    ok("같은 클라이언트를 두 번 감싸지 않는다",
      t.G.patchClient(c) === c && c.__chatBlackoutGuardPatched === true);

    const 받은 = [];
    const ch = c.channel("chat_messages_live_1").subscribe(function (st) { 받은.push(st); });

    ok("채팅 채널이 감싸졌다", ch.__chatGuardWrapped === true);
    ok("아직 안 지운 채널은 표시가 없다", !ch.__chatGuardRemoved);

    ch._handler("SUBSCRIBED");
    ok("정상 알림은 chat.js 에 그대로 전달된다", 받은.join(",") === "SUBSCRIBED", 받은.join(","));

    /* 진짜 끊김은 반드시 통과시켜야 자동 재연결이 살아 있습니다 */
    ch._handler("CHANNEL_ERROR");
    ok("내가 안 지운 채널이 스스로 끊긴 것은 통과시킨다 (진짜 재연결은 살아 있어야 합니다)",
      받은.join(",") === "SUBSCRIBED,CHANNEL_ERROR", 받은.join(","));
    ch._handler("CLOSED");
    ok("내가 안 지운 채널의 CLOSED 도 통과시킨다",
      받은[받은.length - 1] === "CLOSED", 받은.join(","));

    const 삼킨전 = t.G.stats.swallowedCloses;
    c.removeChannel(ch);
    ok("removeChannel 을 부르면 내가 지웠다는 표시가 걸린다",
      ch.__chatGuardRemoved === true, "표시가 안 걸리면 되쏘는 CLOSED 를 못 막습니다");

    const 개수전 = 받은.length;
    ch._handler("CLOSED");
    ok("내가 지운 채널이 되쏘는 CLOSED 는 chat.js 에 전달하지 않는다 (1초 고리의 시작점)",
      받은.length === 개수전, 받은.join(","));
    ok("삼킨 횟수를 세어 둔다 (실측할 수 있어야 합니다)",
      t.G.stats.swallowedCloses === 삼킨전 + 1, String(t.G.stats.swallowedCloses));

    /* 채팅과 무관한 채널은 건드리지 않습니다 */
    const 받은2 = [];
    const other = c.channel("presence_room_9").subscribe(function (st) { 받은2.push(st); });
    ok("채팅 채널이 아니면 감싸지 않는다 (다른 기능의 채널을 건드리지 않습니다)",
      !other.__chatGuardWrapped);
    c.removeChannel(other);
    other._handler("CLOSED");
    ok("채팅 밖 채널은 지운 뒤에도 알림이 그대로 간다", 받은2.join(",") === "CLOSED", 받은2.join(","));
    t.닫기();
  }
  {
    const t = 띄우기();
    const c = 가짜클라이언트();
    t.win.App.SupabaseClient = { get: () => c };
    ok("install() 이 성공한다", t.G.install() === true);
    ok("get() 이 돌려주는 클라이언트가 감싸져 나온다",
      t.win.App.SupabaseClient.get().__chatBlackoutGuardPatched === true);
    ok("get 을 두 번 감싸지 않는다",
      t.G.install() === true && t.win.App.SupabaseClient.__chatBlackoutGuardWrapped === true);
    t.닫기();
  }

  /* =======================================================================
   * [4] 시간 간격은 흉내 내지 않는다
   * ===================================================================== */
  절("[4] 시간 간격은 흉내 내지 않는다");
  {
    /* 1초 주기 재연결 루프는 supabase-js 안쪽입니다. 가짜 채널은 _handler 를
       직접 부르므로 흉내 내면 언제나 통과합니다 — 그런 검사는 아무것도
       안 지킵니다. 그래서 [3] 에서 표시값으로 봤습니다.
       여기서는 이 파일이 그 함정에 다시 빠지지 않았는지만 확인합니다. */
    /* 찾을 낱말을 쪼개서 이어 붙입니다. 그냥 적으면 이 검사 자신이
       그 낱말을 품게 되어 언제나 실패합니다(처음에 실제로 그랬습니다). */
    const 이파일 = fs.readFileSync(__filename, "utf8");
    const 금지낱말 = [["useFake", "Timers"].join(""), ["clock", ".tick"].join("")];
    const 걸린것 = 금지낱말.filter((w) => 이파일.indexOf(w) !== -1);
    ok("이 봉인은 가짜 시계를 쓰지 않는다", 걸린것.length === 0,
      "1초 주기는 라이브러리 안쪽이라 흉내 내면 언제나 통과합니다 — 걸린 낱말: " + 걸린것.join(","));
    ok("되살리기 지연표가 코드에 그대로 있다 (1초·3초·6초, 최대 3번)",
      SRC.indexOf("REFETCH_DELAYS = [1000, 3000, 6000]") !== -1,
      "간격을 재지는 않지만 값이 바뀌면 알아야 합니다");
  }

  console.log("\n  통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("\n실패한 것");
    실패목록.forEach((s) => console.log("  - " + s));
  }
  process.exit(fail ? 1 : 0);
})();
