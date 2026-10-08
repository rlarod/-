/* tests/notice-compact-seal.test.js
 * =========================================================================
 * 공지/커뮤니티 박스를 ★한 줄 띠★ 로 — 2026-10-08 PM 배정 / 수리팀 (TL-024)
 * =========================================================================
 *   대표: "업비트랑 차이가 너무 심해;; 크기부터 모든 ㄷㄷ 다 분석해서 ㄱㄱ"
 *
 *   1440 실측 — 차트가 작은 게 아니라 차트 ★위★ 가 업비트보다 591px 두꺼웠고
 *   그중 ★232px★ 이 이 공지/커뮤니티 박스였습니다(업비트는 0px).
 *   첫 화면(1440x900)에 차트가 192px 밖에 안 보였습니다.
 *   접어서 232px -> 47px (-185px) 로 줄였습니다.
 *
 * ── ⚠⚠ 이 파일이 막는 ★진짜 사고★ 세 가지 ───────────────────────────────
 *
 *   ① 공지 글을 ★지워서★ 줄이는 것
 *      높이를 줄이는 가장 쉬운 방법은 공지 목록을 잘라내는 것입니다.
 *      그런데 커밋 199fae8 에서 공지 자리가 바뀐 것을 보고 대표가
 *      "원래대로 되돌려" 라고 하셨습니다. 글·자리는 ★보존★ 이고
 *      높이만 줄이는 것이 이 건의 조건입니다.
 *      아래 [4] 가 jsdom 으로 init() 을 실제로 돌린 뒤
 *      ★li 개수와 .notice-box 개수가 그대로인지★ 셉니다.
 *
 *   ② 펼치기 버튼이 ★메뉴 줄을 덮는 것★
 *      디자인팀 시안은 펼친 상태의 접기 버튼을
 *          position:absolute; top:-40px
 *      으로 박스 ★위★ 에 띄웠습니다. 1440 실측으로 그 자리에는
 *      NAV.top-banner-nav(메뉴 줄, 아래끝 y=215)가 있습니다.
 *      그대로 올리면 ★메뉴 버튼을 못 누르게 됩니다.★
 *      오류도 안 나고 화면도 안 깨집니다 — 조용한 고장입니다.
 *      아래 [3] 이 음수 top + absolute 조합을 금지합니다.
 *
 *   ③ style.css 에 적는 것
 *      tests/css-duplicate-rules.test.js 가 style.css 만 읽어 중복 규칙
 *      개수를 고정합니다. 아래 [6] 이 새 파일에만 있는지 봅니다.
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다
 *   [2] 공지 데이터를 만드는 모듈을 ★안 고쳤다★ (지우는 코드가 아예 없다)
 *   [3] ⭐ 펼친 버튼이 음수 top 으로 위를 덮지 않는다 + 접힘은 display 로만
 *   [4] ⭐ jsdom 으로 실제로 켜 본다 — 글·박스 개수 보존 + 눌러서 펼침/접힘
 *   [5] 글씨 17px 바닥 · 그림자 없음 · 이모지 없음 · 빨강 안 씀 · 모서리 12px 이하
 *   [6] style.css 와 봉인된 CSS 를 안 건드렸다
 *   [7] index.html · main.js 등록 + git 추적 + 경로가 한 번만 나온다
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 확인만 합니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 항목 주석에 적어 뒀습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/notice-compact.css";
const JS_REL = "js/notice-compact.js";

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

console.log("\n공지 한 줄 띠 (TL-024 · 차트 위 232px -> 47px)");

/* =========================================================================
 * [1] 수정 금지 파일 12개
 * ========================================================================= */
절("[1] 수정 금지 파일 12개가 그대로다");
{
  const { BY_FILE } = require("./_locked-hashes.js");
  [
    "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
    "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
    "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
  ].forEach((f) => {
    const 실제 = crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok(f + " 가 그대로다", 실제 === BY_FILE[f],
      "기준 " + BY_FILE[f] + " / 지금 " + 실제);
  });
}

/* =========================================================================
 * [2] 공지 데이터는 한 글자도 안 건드린다
 * ========================================================================= */
절("[2] 공지 글·개수·순서를 ★지우는 코드가 아예 없다★");
{
  /* 목록을 비우거나 줄을 떼어내는 수법 전부를 금지합니다.
     한 줄이라도 생기면 "높이는 줄었는데 공지가 사라졌다" 가 됩니다. */
  ok("버튼 자신 말고는 innerHTML 을 쓰지 않는다",
    !/\.innerHTML\s*=/.test(JS_CODE.replace(/btn\.innerHTML\s*=/g, "")),
    "다른 곳에 innerHTML 을 쓰면 공지가 날아갈 수 있습니다");
  ["removeChild", "\\.remove\\(", "\\.splice\\(", "\\.textContent\\s*=\\s*\"\""]
    .forEach((pat) => {
      ok("공지를 떼어내는 " + pat.replace(/\\/g, "") + " 를 쓰지 않는다",
        !new RegExp(pat).test(JS_CODE));
    });
  /* 버튼 안의 건수 글자만 쓰고, 공지 li 의 글자는 안 씁니다 */
  const 쓰는곳 = (JS_CODE.match(/\.textContent\s*=/g) || []).length;
  ok("textContent 를 쓰는 곳이 ★버튼 건수 한 곳뿐★ 이다 (" + 쓰는곳 + "곳)",
    쓰는곳 === 1, "공지 글에 쓰면 글이 바뀝니다");
  ok("숙주 모듈(App.NoticeBoard)을 부르지 않는다 — 읽기만 한다",
    !/App\.NoticeBoard/.test(JS_CODE));
  ok("CSS 가 font-size 를 17px 밑으로 내리지 않는다",
    !/font-size:\s*(?:[0-9]|1[0-6])px/.test(CSS_CODE),
    '대표가 "14px 도 작다" 고 세 번 말씀하셨습니다');
}

/* =========================================================================
 * [3] 펼친 버튼이 위(메뉴 줄)를 덮지 않는다
 * ========================================================================= */
절("[3] ⭐ 펼친 버튼이 메뉴 줄을 덮지 않는다");
{
  /* 시안의 top:-40px 같은 "음수 top + absolute" 를 금지합니다.
     1440 실측 — 그 자리에 NAV.top-banner-nav(아래끝 y=215)가 있습니다. */
  const 펼친블록 = (CSS_CODE.match(/\[data-nopen="1"\][^{]*\{[^}]*\}/g) || []).join("\n");
  ok("펼친 상태 규칙이 있다", 펼친블록.length > 0);
  ok("펼친 버튼에 position:absolute 를 쓰지 않는다",
    !/position:\s*absolute/.test(펼친블록),
    "absolute 로 띄우면 위의 메뉴 버튼 위에 겹쳐 메뉴를 못 누릅니다");
  ok("음수 top/margin-top 이 없다",
    !/(?:top|margin-top):\s*-/.test(펼친블록),
    "음수로 끌어올리면 메뉴 줄을 덮습니다");
  ok("접힘을 visibility·opacity·height:0 으로 숨기지 않는다 (display 만)",
    !/visibility:\s*hidden/.test(CSS_CODE) &&
    !/opacity:\s*0\b/.test(CSS_CODE) &&
    !/[^-]\bheight:\s*0\b/.test(CSS_CODE),
    "자리는 차지하면서 안 보이면 높이가 안 줄어듭니다");
  ok("접힘 높이를 ★숫자로 못박아 두었다★ (36px 띠)",
    /height:\s*36px/.test(CSS_CODE),
    "띠 높이가 사라지면 232px 로 되돌아갑니다");
}

/* =========================================================================
 * [4] jsdom 으로 실제로 켜 본다
 * ========================================================================= */
절("[4] ⭐ 실제로 켜 본다 — 공지 보존 + 눌러서 펼침/접힘");
{
  const li = (t) =>
    "<li><span class=\"notice-line\"><span class=\"notice-tag\">[\uacf5\uc9c0]</span>" +
    t + "</span></li>";
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
    "<nav class=\"top-banner-nav\">\ubba4</nav>" +
    "<div class=\"notice-board-wrap\">" +
      "<div class=\"notice-box\"><div class=\"notice-board-tabs\">" +
        "<button class=\"notice-tab-btn active\" data-tab=\"notice\">1</button>" +
        "<button class=\"notice-tab-btn\" data-tab=\"latest\">2</button>" +
      "</div>" +
      "<ul class=\"notice-board-list\" id=\"notice-list-notice\">" +
        li("\uac00") + li("\ub098") + li("\ub2e4") + li("\ub77c") + li("\ub9c8") +
      "</ul>" +
      "<ul class=\"notice-board-list\" id=\"notice-list-latest\"></ul></div>" +
      "<div class=\"notice-box\"><div class=\"notice-board-tabs\">" +
        "<button class=\"notice-tab-btn active\" data-tab=\"popular\">3</button>" +
      "</div><ul class=\"notice-board-list\" id=\"notice-list-popular\"></ul></div>" +
    "</div></body></html>",
    { runScripts: "outside-only" }
  );
  const w = dom.window;
  const 글수 = () => w.document.querySelectorAll("#notice-list-notice li").length;
  const 박스수 = () =>
    w.document.querySelectorAll(".notice-board-wrap > .notice-box").length;
  const 글내용 = () =>
    [].map.call(w.document.querySelectorAll("#notice-list-notice li"),
                (x) => x.textContent).join("|");

  const 켜기전글 = 글내용();

  w.App = {};
  w.eval(JS);
  w.App.NoticeCompact.init();

  ok("모듈이 켜졌다 (html[data-ncompact])",
    w.document.documentElement.getAttribute("data-ncompact") === "1");
  ok("접힌 상태로 시작한다 (data-nopen 없음)",
    w.document.documentElement.getAttribute("data-nopen") === null);

  ok("⭐ 공지 글 5줄이 ★그대로 있다★ (" + 글수() + "줄)", 글수() === 5,
    "높이는 줄었는데 공지가 사라지면 그게 더 나쁩니다");
  ok("⭐ 공지 글 내용이 한 글자도 안 바뀌었다", 글내용() === 켜기전글);
  ok("⭐ .notice-box 가 ★2개 그대로★ 다 (" + 박스수() + "개)", 박스수() === 2,
    "버튼이 .notice-box 로 들어가면 레이아웃 칼럼 수가 틀어집니다");
  ok("탭 버튼(data-tab)도 그대로 있다",
    w.document.querySelectorAll(".notice-tab-btn[data-tab]").length === 3);

  const btn = w.document.querySelector(".notice-fold-btn");
  ok("펼치기 버튼이 ★하나★ 생겼다",
    !!btn && w.document.querySelectorAll(".notice-fold-btn").length === 1);
  ok("버튼이 .notice-board-wrap 의 ★마지막 자식★ 이다",
    !!btn && btn.parentElement.classList.contains("notice-board-wrap") &&
    btn.parentElement.lastElementChild === btn);
  ok("버튼이 남은 건수를 알려준다 (+4)",
    !!btn && btn.querySelector(".nfb-count").textContent === "+4",
    "지금: " + (btn && btn.querySelector(".nfb-count").textContent));
  ok("버튼에 이모지가 없다 (인라인 SVG)",
    !!btn && !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(btn.textContent) &&
    !!btn.querySelector("svg"));
  ok("버튼이 type=button 이다 (폼 전송 사고 방지)",
    !!btn && btn.getAttribute("type") === "button");

  /* 눌러서 펼치고, 다시 눌러서 접는다 */
  btn.dispatchEvent(new w.Event("click", { bubbles: true }));
  ok("⭐ 누르면 펼쳐진다 (data-nopen=1)",
    w.document.documentElement.getAttribute("data-nopen") === "1");
  ok("펼쳐도 공지 글이 그대로다", 글내용() === 켜기전글);
  ok("펼치면 버튼이 접기 로 바뀐다",
    btn.querySelector(".nfb-count").textContent === "접기");
  ok("aria-expanded 가 true 다", btn.getAttribute("aria-expanded") === "true");

  btn.dispatchEvent(new w.Event("click", { bubbles: true }));
  ok("⭐ 다시 누르면 접힌다",
    w.document.documentElement.getAttribute("data-nopen") === null);
  ok("접은 뒤에도 공지 글이 그대로다", 글내용() === 켜기전글);
  ok("접으면 건수가 돌아온다 (+4)",
    btn.querySelector(".nfb-count").textContent === "+4");

  /* 두 번 켜도 버튼이 두 개가 되지 않는다 */
  w.App.NoticeCompact.init();
  ok("두 번 켜도 버튼이 하나다 (부팅 재시도 대비)",
    w.document.querySelectorAll(".notice-fold-btn").length === 1);

  /* 거래 화면이 아니면(wrap 이 없으면) 아무 일도 안 한다 */
  const dom2 = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only" });
  dom2.window.App = {};
  dom2.window.eval(JS);
  let 터짐 = null;
  try { dom2.window.App.NoticeCompact.init(); } catch (e) { 터짐 = e.message; }
  ok("공지 박스가 없는 화면에서 조용히 넘어간다",
    터짐 === null &&
    dom2.window.document.documentElement.getAttribute("data-ncompact") === null,
    터짐 || "");

  dom.window.close();
  dom2.window.close();
}

/* =========================================================================
 * [5] 디자인 확정값
 * ========================================================================= */
절("[5] 글씨 17px 바닥 · 그림자 없음 · 빨강 안 씀 · 모서리 12px 이하");
{
  ok("그림자를 쓰지 않는다", !/box-shadow/.test(CSS_CODE),
    "확정 팔레트 규칙 — 그림자 대신 흰색 3% inset 선만");
  ok("빨강을 쓰지 않는다 — 빨강은 손익 표시 전용",
    !/var\(--red/.test(CSS_CODE) && !/#F0506E/i.test(CSS_CODE));
  const 모서리 = (CSS_CODE.match(/border-radius:\s*(\d+)px/g) || [])
    .map((s) => parseInt(s.replace(/\D/g, ""), 10));
  ok("모서리가 전부 12px 이하다 (" + (모서리.join(",") || "없음") + ")",
    모서리.every((n) => n <= 12));
  ok("CSS 에 새 색을 만들지 않았다 (확정 팔레트 변수만)",
    !/#[0-9a-fA-F]{3,8}\b/.test(CSS_CODE),
    "하드코딩된 색: " + (CSS_CODE.match(/#[0-9a-fA-F]{3,8}\b/g) || []).join(","));
  ok("이모지를 쓰지 않는다",
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/u.test(CSS_CODE + JS_CODE));
}

/* =========================================================================
 * [6] 봉인된 CSS 를 안 건드렸다
 * ========================================================================= */
절("[6] style.css · 봉인 CSS 를 안 건드렸다");
{
  ok("style.css 에 data-ncompact 규칙이 없다 (새 파일에만 있다)",
    !/data-ncompact/.test(read("style.css")),
    "tests/css-duplicate-rules.test.js 가 style.css 의 중복 규칙 수를 고정합니다");
  ok("css/upbit-layout.css 에도 없다",
    !/data-ncompact/.test(read("css/upbit-layout.css")));
  ok("--tl-chart-row 를 건드리지 않는다",
    !/--tl-chart-row/.test(CSS_CODE),
    "차트 행 높이를 건드리면 autoSize:true 와 맞물려 차트가 무한히 커집니다");
}

/* =========================================================================
 * [7] index.html · main.js 등록 + git 추적
 * ========================================================================= */
절("[7] index.html · main.js 등록 + git 추적");
{
  ok("index.html 이 새 CSS 를 부른다", HTML.includes("href=\"" + CSS_REL + "\""));
  ok("index.html 이 새 모듈을 부른다", HTML.includes("src=\"" + JS_REL + "\""));
  ok("새 CSS 가 style.css 보다 ★뒤★ 에 있다",
    HTML.indexOf(CSS_REL) > HTML.indexOf("style.css"),
    "앞에 있으면 !important 없이는 못 이깁니다");
  [CSS_REL, JS_REL].forEach((rel) => {
    const n = HTML.split(rel).length - 1;
    ok("index.html 에 " + rel + " 가 ★한 번만★ 나온다 (" + n + "회)", n === 1,
      "주석에 경로를 또 적으면 2회가 됩니다");
  });

  const 목록 = MAIN.slice(MAIN.indexOf("const modules = ["),
                         MAIN.indexOf("modules.forEach"));
  ok("main.js 에 NoticeCompact 가 있다", 목록.indexOf("\"NoticeCompact\"") > 0);
  ok("NoticeCompact 가 NoticeBoard ★뒤★ 에 있다",
    목록.indexOf("\"NoticeCompact\"") > 목록.indexOf("\"NoticeBoard\""),
    "앞에 두면 첫 건수를 셀 때 목록이 아직 비어 있습니다");

  [CSS_REL, JS_REL].forEach((rel) => {
    const 추적 = execFileSync("git", ["ls-files", "--", rel], { cwd: REPO })
      .toString().trim();
    ok(rel + " 가 git 에 올라가 있다", 추적 === rel,
      "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
  });

  ok("_order.txt 에 이 파일이 등록돼 있다",
    read("tests/_order.txt").includes("tests/notice-compact-seal.test.js"),
    "등록 안 하면 npm test 가 이 파일을 안 돌립니다");
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " notice-compact-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
