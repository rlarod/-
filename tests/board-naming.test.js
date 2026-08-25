/* tests/board-naming.test.js
 * "자유게시판" 이름이 두 곳에서 충돌하던 것을 막습니다.
 *
 * 무엇이 문제였나 (2026-08-25)
 *   위쪽 위젯에는 "자유게시판 준비중" 탭이 있고,
 *   아래 실제 게시판 페이지의 제목도 "자유게시판" 이었습니다.
 *   둘은 서로 아무 관계가 없습니다. 게시판은 실제로 하나뿐인데
 *   이름만 겹쳐서, 회원이 "준비중이구나" 하고 안 들어왔습니다.
 *
 *   위젯 탭(2026-08-17)이 나중에 들어온 것이고 데이터 모델상 맞으므로,
 *   옛 이름인 아래 게시판 제목을 "커뮤니티 게시판" 으로 바꿨습니다.
 *   위젯 안내문("지금은 커뮤니티 게시판 하나로 운영됩니다")과도 맞습니다.
 *
 *   js/board.js 는 수정 금지 파일이라 손대지 않았습니다 — index.html 글자만 바꿨습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const boardJs = fs.readFileSync(path.join(REPO, "js", "board.js"), "utf8");

console.log("\n게시판 이름 충돌");

/* ---------- 아래 게시판 제목 ---------- */
{
  ok('게시판 페이지 제목이 "커뮤니티 게시판" 이다',
    html.includes('<div class="field-label"><span>커뮤니티 게시판</span></div>'));

  ok('게시판 페이지 제목이 더는 "자유게시판" 이 아니다',
    !html.includes('<div class="field-label"><span>자유게시판</span></div>'),
    "위젯의 준비중 탭과 이름이 겹쳐 회원이 안 들어옵니다");

  /* 제목은 게시판 패널(#board-panel) 안에 그대로 있어야 합니다 — 지우지 않았습니다. */
  const panel = html.slice(html.indexOf('id="board-panel"'));
  ok("제목이 게시판 패널 안에 살아 있다",
    panel.indexOf("커뮤니티 게시판") > 0 && panel.indexOf("커뮤니티 게시판") < 400);
}

/* ---------- 위젯 탭은 그대로 ---------- */
{
  ok('위젯의 "자유게시판 준비중" 탭은 그대로 둔다',
    /data-tab="free">자유게시판 <span class="nav-soon-badge">준비중<\/span>/.test(html));
  ok('위젯의 "분석게시판 준비중" 탭도 그대로 둔다',
    /data-tab="analysis">분석게시판 <span class="nav-soon-badge">준비중<\/span>/.test(html));
  ok("위젯 안내문 문구와 어긋나지 않는다",
    html.includes("지금은 커뮤니티 게시판 하나로 운영됩니다"));
}

/* ---------- 이름이 다시 겹치지 않는가 ---------- */
{
  /* 주석을 뺀 본문에서 "자유게시판" 은 준비중 탭 + 안내문 두 곳뿐이어야 합니다. */
  const body = html.replace(/<!--[\s\S]*?-->/g, "");
  const count = (body.match(/자유게시판/g) || []).length;
  ok("본문에 남은 '자유게시판' 은 준비중 안내 2곳뿐이다", count === 2, "실제 " + count + "곳");
}

/* ---------- 수정 금지 파일 ---------- */
{
  const md5 = require("crypto").createHash("md5").update(fs.readFileSync(path.join(REPO, "js", "board.js"))).digest("hex");
  ok("js/board.js 를 건드리지 않았다(기준 해시)", md5 === "8b847bd8f5d8231b8dd329f8b15dbe37", md5);
  ok("board.js 는 화면 제목 글자를 만들지 않는다(HTML 만 바꾸면 된다)",
    !boardJs.includes("field-label"));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
