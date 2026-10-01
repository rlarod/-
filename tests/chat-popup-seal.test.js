/* tests/chat-popup-seal.test.js
 * =========================================================================
 * 실시간 채팅 ★팝업(켜고 끄기)★ — 2026-10-01 PM 배정 / 수리팀
 * =========================================================================
 *   대표 (2026-10-01)
 *     "채팅창은 팝업창?? 같은 걸로 켯다 껏다 할수있게하고"
 *
 *   그전에는 채팅이 오른쪽 열에 ★늘 펼쳐져★ 있었습니다.
 *   이제 오른쪽 아래 "채팅" 버튼으로 켜고, 머리글 X 로 끕니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다 (특히 js/chat.js)
 *   [2] ⭐ DOM 을 ★하나도 안 옮겼다★
 *         js/chat.js:285~290 이 노드 4개를 ★객체로 캐시★ 합니다.
 *         js/admin-chat-tools.js 는 ".page-chat-panel .chat-send-btn" 을 찾습니다.
 *         index.html 마크업도 .page-right 안 그 자리 그대로여야
 *         tests/top-panel.test.js:81~86 이 통과합니다.
 *   [3] ⭐ 채팅을 ★지우지 않았다★ — 닫힘은 display:none 일 뿐이다
 *         마크업 보존 규칙(화면에서 뺄 때는 CSS 로만 숨긴다).
 *   [4] ⭐ 함정 — ★열 때 맨 아래로 직접 내린다★
 *         js/chat.js:74 가 scrollTop = scrollHeight 를 하지만,
 *         팝업이 display:none 인 동안엔 scrollHeight 가 0 이라
 *         ★그 줄이 아무 일도 못 합니다★. 열면 옛 메시지가 보입니다.
 *   [5] ⭐ js/layout-align.js 를 끈다 + main.js 순서가 그보다 앞이다
 *         안 끄면 1800px 이상에서 .page-chat-col 높이를 거래 행 높이로
 *         밀어 넣어 ★팝업 밖으로 입력칸이 나갑니다★.
 *         ⚠ 파일을 고치지 않고 init 만 가로챕니다(사회로그인과 같은 방식).
 *   [6] ⭐ JS 가 안 떠도 채팅이 ★사라지지 않는다★
 *         모든 CSS 가 html.tl-chat-ready 아래에 있어야 합니다.
 *         아니면 JS 실패 = 채팅 영구 실종 = 조용한 고장입니다.
 *   [7] 글씨 17px 바닥 · 그림자 없음(inset 선만) · 모서리 10px · 이모지 없음
 *   [8] 확정 팔레트 9색만
 *   [9] index.html · main.js 에 제대로 등록돼 있고 git 에 올라가 있다
 *  [10] 실제로 켜 본다 (jsdom) — 열기/닫기/Esc/맨아래/노드 보존
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 * ⚠ 브라우저를 띄우지 않습니다(화면 실측은 보고서의 캡처가 담당합니다).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/chat-popup.css";
const JS_REL = "js/chat-popup.js";

const CSS = read(CSS_REL);
const JS = read(JS_REL);
const HTML = read("index.html");
const MAIN = read("main.js");

/* 주석을 지운 "실제 코드" — 설명문에 적힌 글자 때문에 오판하지 않게 */
function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1");
}
const CSS_CODE = 코드만(CSS);
const JS_CODE = 코드만(JS);

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* CSS 를 "@media 조건 + 규칙" 단위로 훑습니다(아주 단순한 훑기 — 중첩 없음) */
function 규칙들(css) {
  const out = [];
  const c = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /@media([^{]+)\{([\s\S]*?)\n\}/g;
  let m;
  const 미디어구간 = [];
  while ((m = re.exec(c)) !== null) {
    미디어구간.push([m.index, m.index + m[0].length]);
    const 조건 = m[1].trim();
    const r2 = /([^{}]+)\{([^{}]*)\}/g;
    let n;
    while ((n = r2.exec(m[2])) !== null) out.push({ media: 조건, sel: n[1].trim(), body: n[2].trim() });
  }
  let 남은 = c;
  미디어구간.slice().reverse().forEach(([a, b]) => { 남은 = 남은.slice(0, a) + 남은.slice(b); });
  const r3 = /([^{}]+)\{([^{}]*)\}/g;
  let k;
  while ((k = r3.exec(남은)) !== null) out.push({ media: "", sel: k[1].trim(), body: k[2].trim() });
  return out;
}
const RULES = 규칙들(CSS);

/* ===================================================================== */
절("[1] 수정 금지 파일 12개 — 특히 js/chat.js 를 안 열었다");
{
  const 잠긴 = require("./_locked-hashes.js");
  const 표 = 잠긴.BY_FILE;   /* 해시의 단 하나의 출처 — tests/_locked-hashes.js */
  const 어긋남 = [];
  let 센것 = 0;
  Object.keys(표).forEach((rel) => {
    if (rel.indexOf("/") < 0) return;   /* BY_FILE 은 'ui.js' 짧은 이름도 같이 담고 있습니다 */
    if (typeof 표[rel] !== "string" || !/^[0-9a-f]{32}$/.test(표[rel])) return;
    센것++;
    let buf;
    try { buf = fs.readFileSync(path.join(REPO, rel)); } catch (e) { 어긋남.push(rel + "(없음)"); return; }
    if (crypto.createHash("md5").update(buf).digest("hex") !== 표[rel]) 어긋남.push(rel);
  });
  ok("수정 금지 파일 해시 표를 읽었다 (12개)", 센것 === 12, "읽은 개수: " + 센것);
  ok("수정 금지 파일 해시가 그대로다", 어긋남.length === 0, "어긋난 파일: " + 어긋남.join(", "));
  ok("새 코드가 js/chat.js 를 건드리지 않는다",
    !/App\.Chat\s*=/.test(JS_CODE) && !/App\.Chat\.\w+\s*=/.test(JS_CODE),
    "js/chat.js 는 수정 금지 파일입니다");
}

/* ===================================================================== */
절("[2] ⭐ DOM 을 하나도 안 옮겼다");
{
  ok("새 JS 가 body 에 붙이는 것은 ★떠 있는 버튼 하나뿐★ 이다",
    (JS_CODE.match(/document\.body\.appendChild\(/g) || []).length === 1,
    "채팅 패널까지 body 로 옮기면 .page-right 자손 CSS 25개가 통째로 안 먹습니다");
  ok("새 JS 가 채팅 패널(#right-chat-panel)을 옮기지 않는다",
    !/appendChild\(\s*aside\s*\)/.test(JS_CODE) &&
    !/appendChild\(\s*panel\s*\)/.test(JS_CODE) &&
    !/insertBefore\(\s*(aside|panel)\b/.test(JS_CODE),
    "tests/top-panel.test.js:81~86 이 .page-right 안을 봅니다");

  const 우측 = HTML.slice(HTML.indexOf('<aside class="page-right">'));
  ok('index.html 의 .page-right 안에 id="right-chat-panel" 이 있다',
    우측.indexOf('id="right-chat-panel"') > 0);
  ok('index.html 의 .page-right 안에 id="chat-panel" 이 있다',
    우측.indexOf('id="chat-panel"') > 0);
  ok("내 정보(notice-box) 가 채팅보다 ★위★ 다 (top-panel.test.js:86 과 같은 기준)",
    우측.indexOf("notice-box") < 우측.indexOf("side-chat-panel"));
  ok("#chat-panel 이 page-chat-panel 클래스를 그대로 갖고 있다",
    /class="panel page-chat-panel" id="chat-panel"/.test(HTML),
    "js/admin-chat-tools.js:239 가 .page-chat-panel .chat-send-btn 을 씁니다");

  ["chat-messages", "chat-input", "chat-send-btn", "chat-err"].forEach((v) => {
    ok('js/chat.js 가 캐시하는 id="' + v + '" 가 index.html 에 그대로 있다',
      HTML.indexOf('id="' + v + '"') > 0);
  });
}

/* ===================================================================== */
절("[3] ⭐ 채팅을 지우지 않았다 — 닫힘은 display:none 일 뿐");
{
  ok("닫힘은 display:none 으로만 한다(마크업 보존)",
    RULES.some((r) => /#right-chat-panel/.test(r.sel) && /display:\s*none/.test(r.body)),
    "화면에서 뺄 때는 CSS 로 숨기고 마크업은 보존합니다");
  ok("열림 규칙(html.tl-chat-open)이 있어 다시 보인다",
    RULES.some((r) => /tl-chat-open/.test(r.sel) && /display:\s*flex/.test(r.body)));
  ok("옛 접기 버튼 마크업(#chat-toggle-btn)을 지우지 않았다",
    HTML.indexOf('id="chat-toggle-btn"') > 0);
  ok("새 JS 에 removeChild / remove() / innerHTML='' 가 없다",
    !/removeChild\(/.test(JS_CODE) && !/\.remove\(\)/.test(JS_CODE) &&
    !/innerHTML\s*=\s*["']["']/.test(JS_CODE),
    "기능·데이터를 지우지 않습니다");
}

/* ===================================================================== */
절("[4] ⭐ 함정 — 열 때 맨 아래로 ★직접★ 내린다");
{
  ok("새 JS 에 scrollTop = scrollHeight 가 있다",
    /scrollTop\s*=\s*\w+\.scrollHeight/.test(JS_CODE),
    "팝업이 display:none 인 동안 js/chat.js:74 는 scrollHeight 가 0 이라 아무 일도 못 합니다");
  ok("한 번이 아니라 ★그린 뒤에도 한 번 더★ 내린다",
    /requestAnimationFrame\(맨아래로\)/.test(JS_CODE) && /setTimeout\(맨아래로/.test(JS_CODE),
    "글꼴·줄바꿈이 늦게 자리를 잡으면 한 번만으로는 어긋납니다");
}

/* ===================================================================== */
절("[5] ⭐ js/layout-align.js 를 끈다 + main.js 순서");
{
  ok("새 JS 가 App.LayoutAlign.init 을 가로챈다",
    /App\.LayoutAlign\.init\s*=\s*function/.test(JS_CODE),
    "안 끄면 1800px 이상에서 .page-chat-col 높이가 거래 행 높이로 밀려 입력칸이 팝업 밖으로 나갑니다");
  ok("applyForTest 는 그대로 둔다(기존 테스트가 직접 부릅니다)",
    !/applyForTest\s*=/.test(JS_CODE));

  /* ⚠ 주석 안에도 "LayoutAlign" 글자가 있어서, 주석을 지운 뒤에 순서를 봅니다 */
  const 목록 = 코드만(MAIN.slice(MAIN.indexOf("const modules = ["), MAIN.indexOf("modules.forEach")));
  ok('main.js 에 "ChatPopup" 이 있다', 목록.indexOf('"ChatPopup"') > 0);
  ok('"ChatPopup" 이 "LayoutAlign" ★앞★ 이다',
    목록.indexOf('"ChatPopup"') < 목록.indexOf('"LayoutAlign"'),
    "뒤에 있으면 LayoutAlign 이 먼저 켜져 .page-chat-col 에 높이를 박아 넣습니다");
  ok('"ChatPopup" 이 "Chat" ★뒤★ 다',
    목록.indexOf('"ChatPopup"') > 목록.indexOf('"Chat"'),
    "js/chat.js 가 노드를 캐시한 뒤에 켜야 합니다");
}

/* ===================================================================== */
절("[6] ⭐ JS 가 안 떠도 채팅이 사라지지 않는다");
{
  const 빗나감 = RULES
    .map((r) => r.sel.split(",").map((s) => s.trim()))
    .reduce((a, b) => a.concat(b), [])
    .filter((s) => s && !/^html\.tl-chat-(ready|open)\b/.test(s));
  ok("새 CSS 의 모든 선택자가 html.tl-chat-ready / html.tl-chat-open 아래에 있다",
    빗나감.length === 0,
    "빗나간 선택자: " + 빗나감.join(" | "));
  ok("JS 가 마크업이 없으면 ★아무것도 안 한다★ (tl-chat-ready 를 안 붙인다)",
    JS_CODE.indexOf("if (!panel || !aside) return;") > 0 &&
    JS_CODE.indexOf("if (!panel || !aside) return;") < JS_CODE.indexOf("classList.add(READY)"),
    "순서가 바뀌면 채팅이 영구히 사라집니다(조용한 고장)");
}

/* ===================================================================== */
절("[7] 글씨 17px 바닥 · 그림자 없음 · 모서리 10px · 이모지 없음");
{
  const 작은글씨 = (CSS_CODE.match(/font-size:\s*(\d+)px/g) || [])
    .filter((m) => +m.match(/(\d+)px/)[1] < 17);
  ok("17px 미만 글씨가 없다", 작은글씨.length === 0, 작은글씨.join(", "));

  const 그림자 = (CSS_CODE.match(/box-shadow:[^;]+;/g) || [])
    .filter((s) => !/inset 0 1px 0 rgba\(255,255,255,0\.03\)/.test(s));
  ok("그림자가 없다 — 카드 위 흰색 3% inset 선만 쓴다", 그림자.length === 0, 그림자.join(" "));

  const 큰모서리 = (CSS_CODE.match(/border-radius:[^;]+;/g) || [])
    .filter((s) => (s.match(/(\d+)px/g) || []).some((p) => +p.replace("px", "") > 10));
  ok("모서리가 10px 를 넘지 않는다", 큰모서리.length === 0, 큰모서리.join(" "));

  /* 주석에는 ★ ⚠ 같은 설명용 기호를 씁니다. 회원이 보는 글자는 주석 밖입니다.
     그래서 ★주석을 지운 코드★ 에만 겁니다 (upbit-layout-seal 과 같은 기준). */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("새 JS 가 만드는 글자에 이모지가 없다 (아이콘은 인라인 SVG)", !EMOJI.test(JS_CODE));
  ok("새 CSS 에 이모지가 없다", !EMOJI.test(CSS_CODE));
  ok("아이콘이 인라인 SVG 다", /<svg /.test(JS_CODE) && /stroke="currentColor"/.test(JS_CODE));
}

/* ===================================================================== */
절("[8] 확정 팔레트 9색만");
{
  const 팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5",
                  "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 쓴색 = (CSS_CODE.match(/#[0-9A-Fa-f]{3,8}\b/g) || []).map((s) => s.toUpperCase());
  const 밖 = [...new Set(쓴색)].filter((c) => 팔레트.indexOf(c) < 0);
  ok("확정 팔레트 밖의 색을 쓰지 않았다", 밖.length === 0, 밖.join(", "));
  ok("하락 빨강(#F0506E)을 손익 아닌 곳에 쓰지 않았다",
    쓴색.indexOf("#F0506E") < 0, "빨강은 손익 표시에만");
}

/* ===================================================================== */
절("[9] index.html · main.js 등록 + git 추적");
{
  ok("index.html 이 css/chat-popup.css 를 부른다", HTML.indexOf('href="css/chat-popup.css"') > 0);
  ok("index.html 이 js/chat-popup.js 를 부른다", HTML.indexOf('src="js/chat-popup.js"') > 0);
  ok("css/chat-popup.css 가 style.css 보다 ★뒤★ 다",
    HTML.indexOf('href="css/chat-popup.css"') > HTML.indexOf('href="style.css"'),
    ".page-chat-col 의 sticky/100vh 를 덮어야 합니다");

  [CSS_REL, JS_REL, "tests/chat-popup-seal.test.js"].forEach((rel) => {
    const 추적 = execFileSync("git", ["ls-files", "--", rel], { cwd: REPO }).toString().trim();
    ok(rel + " 가 git 에 올라가 있다", 추적 === rel,
      "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
  });
  ok("tests/_order.txt 에 등록돼 있다",
    read("tests/_order.txt").indexOf("tests/chat-popup-seal.test.js") > 0);
}

/* ===================================================================== */
절("[10] 실제로 켜 본다 (jsdom)");
{
  const dom = new JSDOM(HTML, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;
  win.eval("window.App = window.App || {};");
  /* 끄는 대상이 있어야 [5] 가 진짜인지 볼 수 있습니다 */
  win.eval("App.LayoutAlign = { init: function(){ window.__layoutAlignRan = true; }, applyForTest: function(){} };");
  win.eval(JS);
  const doc = win.document;

  const box = doc.getElementById("chat-messages");
  box.innerHTML = '<div class="chat-msg">가</div><div class="chat-msg">마지막</div>';
  /* jsdom 은 늘 0 이라, 실제 브라우저처럼 "내용이 칸보다 길다" 를 흉내냅니다 */
  Object.defineProperty(box, "scrollHeight", { configurable: true, value: 1234 });
  Object.defineProperty(box, "clientHeight", { configurable: true, value: 300 });
  box.scrollTop = 0;

  win.App.ChatPopup.init();
  win.App.LayoutAlign.init();   /* main.js 가 뒤이어 부르는 그 호출 */

  const html = doc.documentElement;
  ok("init 하면 html 에 tl-chat-ready 가 붙는다", html.classList.contains("tl-chat-ready"));
  ok("처음엔 ★닫혀★ 있다", !html.classList.contains("tl-chat-open"));
  ok("LayoutAlign.init 이 ★가로채져 아무 일도 안 한다★", !win.__layoutAlignRan);

  const fab = doc.getElementById("tl-chat-fab");
  ok("떠 있는 '채팅' 버튼이 생긴다", !!fab);
  ok("버튼이 <body> 직계다(본문 레이아웃을 안 건드린다)", !!fab && fab.parentNode === doc.body);
  ok("버튼 글자가 '채팅' 이다", !!fab && fab.textContent.trim() === "채팅");
  ok("버튼에 aria-expanded=false 가 있다", !!fab && fab.getAttribute("aria-expanded") === "false");
  ok("페이지가 뜰 때 버튼이 ★초점을 뺏지 않는다★",
    doc.activeElement !== fab,
    "초점을 뺏으면 아무도 안 눌렀는데 금색 테두리가 켜진 채로 뜹니다(1440 실측)");

  const closeBtn = doc.getElementById("tl-chat-pop-close");
  ok("닫기(X) 버튼이 ★이미 있는 머리글 안★ 에 생긴다",
    !!closeBtn && !!closeBtn.closest(".field-label"),
    "새 머리글을 만들면 '실시간 채팅' 제목이 두 줄 연달아 나옵니다");

  ok("켠 뒤에도 #chat-panel 이 .page-right 안에 그대로 있다",
    !!doc.querySelector(".page-right #chat-panel"));
  ok("켠 뒤에도 #right-chat-panel 이 .page-right 직계 자식이다",
    doc.getElementById("right-chat-panel").parentNode === doc.querySelector(".page-right"));
  ["chat-messages", "chat-input", "chat-send-btn", "chat-err"].forEach((v) => {
    ok("js/chat.js 가 캐시한 #" + v + " 가 document 안에 그대로 있다",
      !!doc.getElementById(v) && doc.contains(doc.getElementById(v)));
  });

  /* 열기 */
  fab.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("버튼을 누르면 html 에 tl-chat-open 이 붙는다", html.classList.contains("tl-chat-open"));
  ok("aria-expanded 가 true 로 바뀐다", fab.getAttribute("aria-expanded") === "true");
  ok("⭐ 열면 메시지 칸이 ★맨 아래★ 로 간다 (함정 2)",
    box.scrollTop === 1234,
    "scrollTop=" + box.scrollTop + " — 옛 메시지가 보이면 안 됩니다");

  /* 닫기 */
  box.scrollTop = 0;
  closeBtn.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("X 를 누르면 닫힌다", !html.classList.contains("tl-chat-open"));

  /* 다시 열기 — 닫혀 있는 동안 쌓인 새 메시지도 맨 아래가 보여야 합니다 */
  box.innerHTML += '<div class="chat-msg">새로 온 것</div>';
  fab.dispatchEvent(new win.MouseEvent("click", { bubbles: true }));
  ok("다시 열어도 맨 아래로 간다", box.scrollTop === 1234);

  /* Esc */
  doc.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  ok("Esc 로 닫힌다", !html.classList.contains("tl-chat-open"));

  /* 두 번 init 해도 버튼이 두 개가 되지 않는다 */
  win.App.ChatPopup.init();
  ok("두 번 켜도 버튼이 하나다", doc.querySelectorAll(".tl-chat-fab").length === 1);

  win.close();
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " chat-popup-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
