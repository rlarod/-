/* =========================================================================
 * tests/no-emoji.test.js
 * =========================================================================
 * 화면에 이모지가 다시 들어오는 것을 막습니다.
 * (2026-08-25 대표 지시 · 화면 개편 1순위 — "바이낸스에는 이모지가 한 개도 없다")
 *
 * 무엇을 보나
 *   1) index.html 에서 "화면에 그려지는" 자리에 이모지가 없다
 *      (<!-- --> 주석 안은 보존용이라 검사하지 않습니다)
 *   2) 일반 모듈(수정 가능한 js/*.js)이 화면에 찍는 문자열에 이모지가 없다
 *      (/* *\/ 와 // 주석은 검사하지 않습니다 — 설명글은 남겨도 됩니다)
 *   3) 수정 금지 파일이 만드는 이모지는 js/no-emoji.js 가 지운다
 *      — 그 파일이 존재하고, index.html·main.js 에 연결돼 있어야 합니다
 *   4) 수정 금지 파일 자체는 하나도 안 고쳤다(이모지가 그대로 남아 있어야 정상)
 * ========================================================================= */

const fs = require("fs");
const path = require("path");
const REPO = process.env.REPO || path.join(__dirname, "..");

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log("  \u2713 " + name); }
  else { fail++; console.log("  X " + name + (extra ? " \u2192 " + extra : "")); }
}

/* 그림문자만. 화살표(\u2190-\u21FF, \u25B2\u25BC)·통화기호(\u20BF)·홑화살괄호는 뺐습니다 —
   숫자 옆 \u25B2\u25BC 같은 기능 기호는 이모지가 아닙니다. */
/* ✕(U+2715) 처럼 UI 기호로 쓰는 글자는 예외입니다 — 닫기 버튼 표시이고
   이모지 그림으로 그려지지 않습니다(▲▼ 와 같은 취급). */
const ALLOW = "\u2715\u2713\u2716\u00D7";
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
const EMOJI_G = new RegExp(EMOJI.source, "gu");
function findEmoji(s) {
  return (s.match(EMOJI_G) || []).filter(function (ch) { return ALLOW.indexOf(ch) === -1; });
}

const FROZEN = [
  "trading.js", "ui.js", "auth.js", "supabase-sync.js",
  "chat.js", "leaderboard.js", "admin.js", "season.js",
  "board.js", "orderbook.js", "chart.js", "websocket.js",
];

function read(p) { return fs.readFileSync(path.join(REPO, p), "utf8"); }

/* HTML 주석(<!-- -->)을 걷어냅니다 — 보존용 마크업은 화면에 안 나옵니다 */
function stripHtmlComments(s) { return s.replace(/<!--[\s\S]*?-->/g, ""); }

/* JS 주석을 걷어냅니다 — 설명글의 이모지는 화면에 안 나옵니다 */
function stripJsComments(s) {
  var out = s.replace(/\/\*[\s\S]*?\*\//g, "");
  /* 줄 주석(//) 은 줄 단위로 — 따옴표 밖에 있는 것만 자릅니다 */
  return out.split("\n").map(function (line) {
    var q = null;
    for (var k = 0; k < line.length; k++) {
      var ch = line[k];
      if (q) { if (ch === "\\") k++; else if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'" || ch === "`") { q = ch; continue; }
      if (ch === "/" && line[k + 1] === "/") return line.slice(0, k);
    }
    return line;
  }).join("\n");
}

console.log("\n[1] index.html — 화면에 그려지는 자리");
{
  const live = stripHtmlComments(read("index.html"));
  const hits = findEmoji(live);
  ok("index.html 에 이모지 0개", hits.length === 0, "남음: " + hits.join(" "));
}

console.log("\n[2] 일반 모듈이 화면에 찍는 문자열");
{
  const dir = path.join(REPO, "js");
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    if (!/\.js$/.test(f)) continue;
    if (FROZEN.indexOf(f) !== -1) continue;   // 수정 금지 파일은 [4] 에서 따로
    if (f === "no-emoji.test.js") continue;
    const code = stripJsComments(fs.readFileSync(path.join(dir, f), "utf8"));
    const hits = findEmoji(code);
    if (hits.length) bad.push(f + "(" + hits.join("") + ")");
  }
  ok("일반 모듈 코드에 이모지 0개", bad.length === 0, bad.join(", "));
}

console.log("\n[3] 수정 금지 파일이 만든 이모지는 js/no-emoji.js 가 지운다");
{
  const mod = fs.existsSync(path.join(REPO, "js/no-emoji.js")) ? read("js/no-emoji.js") : "";
  ok("js/no-emoji.js 가 있다", mod.length > 0);
  ok("index.html 이 불러온다", /<script src="js\/no-emoji\.js"><\/script>/.test(read("index.html")));
  ok("main.js 부팅 목록에 있다", /"NoEmoji"/.test(read("main.js")));
  [".board-hot-badge", ".board-popular-item", ".board-mini-stat",
   ".leaderboard-rank-badge", ".chat-event-icon", ".season-reset-banner"]
    .forEach((sel) => ok("자리 등록: " + sel, mod.indexOf('"' + sel + '"') !== -1));
  ok("빈 아이콘 칸이 벌어지지 않는다(.chat-event-icon:empty)",
    /\.chat-event-icon:empty\{display:none;\}/.test(read("style.css")));
  ok("회원이 쓴 글은 안 건드린다(제목은 맨 앞 표시만 뗀다)",
    /firstChild/.test(mod) && /nodeType !== 3/.test(mod));
}

console.log("\n[4] 수정 금지 파일은 한 글자도 안 고쳤다");
{
  const still = [];
  ["board.js", "chat.js", "leaderboard.js", "season.js"].forEach((f) => {
    if (EMOJI.test(read("js/" + f))) still.push(f);
  });
  ok("네 파일에 원래 이모지가 그대로 있다(우회로 처리했다는 증거)",
    still.length === 4, "이모지가 사라진 파일: 원본이 수정됐을 수 있음");
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음"); process.exit(1); }
console.log("전체 통과");
