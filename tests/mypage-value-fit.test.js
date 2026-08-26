/* tests/mypage-value-fit.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 폰에서 마이페이지 금액이 잘려 회원이 자기 돈을 못 읽는 것. (P1)
 *
 * 마이페이지 표가 폰에서도 2열이라 한 칸이 162px(360 기준)뿐이었고,
 * 값이 `overflow:hidden; text-overflow:ellipsis` 로 잘려 나갔습니다.
 *
 * 실측 (2026-08-26, 비로그인) — `scrollWidth - clientWidth`, 양수면 잘린 양
 *   폭/통화      총자산   가용잔고   화면에 보이던 것
 *   360 USDT       82       32      `$···`      ← 숫자가 한 자리도 안 보임
 *   360 KRW        93       42      `₩···`
 *   375 USDT       75       25      `$100,…`    ← `$100` 으로 오독 (천 배 차이)
 *   390 KRW        78       27      `₩150,…`
 *   768/1440/1920   0        0      정상
 *
 * 진짜 원인 — style.css 에 폰용 1열 규칙이 **이미 있었지만 죽어 있었습니다.**
 *   505행 @media (max-width:400px){ .mypage-grid{grid-template-columns:1fr} }
 *  1079행 .mypage-grid{ grid-template-columns:repeat(2,minmax(0,1fr)) }
 * 특정도가 (0,1,0)로 같은데 기본 규칙이 570줄 **아래**라 나중 것이 이깁니다.
 *
 * ★ 이 테스트가 못 박는 것
 *   ① 폰(≤400px)에서 1열이다 — 2열로 되돌리면 실패.
 *   ② 끊는 지점이 **390px 이상**이어야 한다. 360/375/390 을 전부 덮어야 합니다.
 *   ③ index.html 에서 **style.css 보다 뒤에** 불러야 한다 (순서로 이기는 구조).
 *   ④ `!important` 를 안 쓴다 — 나중에 덮기 쉽게 둡니다.
 *   ⑤ **글자 크기를 안 줄인다** — 대표 지시로 글자 축소는 되돌린 영역입니다.
 *   ⑥ **색을 안 바꾼다** — 확정 팔레트를 건드리지 않습니다.
 *   ⑦ **데이터를 숨기거나 바꾸지 않는다** — display:none / content: 금지.
 *      숫자를 줄여 쓰는(₩1.5억) 방식은 금지 사항이었습니다.
 *   ⑧ 값이 안 들어가면 잘리는 대신 아랫줄로 내려간다 (flex-wrap 안전장치).
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m\u2713\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m\u2717\u001b[0m " + name + (detail ? " \u2014 " + detail : ""));
  }
}

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const CSS_REL = "mypage-value-fit.css";
const cssPath = path.join(REPO, CSS_REL);

console.log("\n[ 마이페이지 금액 잘림 (P1) ]");

ok("고침 파일이 있다 (" + CSS_REL + ")", fs.existsSync(cssPath));
if (!fs.existsSync(cssPath)) {
  console.log("\n\ud1b5\uacfc " + pass + " / \uc2e4\ud328 " + (fail + 1));
  process.exit(1);
}

const css = fs.readFileSync(cssPath, "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
/* 설명 주석은 빼고 실제 규칙만 봅니다 — 주석 글자에 걸려 오판하지 않게. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

function mediaBlock(src, maxWidth) {
  /* 문자열로 정규식을 조립하면 이스케이프가 쉽게 깨져서, 여는 중괄호는
     indexOf 로 직접 찾습니다. */
  let head = -1;
  const needle = "max-width:";
  for (let p = 0; p < src.length; ) {
    const at = src.indexOf("@media", p);
    if (at === -1) break;
    const brace = src.indexOf("{", at);
    if (brace === -1) break;
    const cond = src.slice(at, brace);
    const w = cond.indexOf(needle);
    if (w !== -1 && parseInt(cond.slice(w + needle.length).trim(), 10) === maxWidth) {
      head = brace;
      break;
    }
    p = brace + 1;
  }
  if (head === -1) return null;
  let i = head + 1;
  let depth = 1;
  const start = i;
  while (i < src.length && depth > 0) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") depth--;
    i++;
  }
  return src.slice(start, i - 1);
}
function ruleBody(src, selector) {
  const i = src.indexOf(selector);
  if (i === -1) return null;
  const s = src.indexOf("{", i);
  const e = src.indexOf("}", s);
  return s === -1 || e === -1 ? null : src.slice(s + 1, e);
}

/* ---- ① 폰에서 1열 ---- */
const bps = [...rules.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
ok("폰 구간 @media 가 있다", bps.length > 0, JSON.stringify(bps));

const phoneBp = bps.length ? Math.max(...bps) : 0;
ok("끊는 지점이 390px 이상이다 (360/375/390 을 전부 덮는다)", phoneBp >= 390, "지금 " + phoneBp);

const phoneBlock = bps.length ? mediaBlock(rules, phoneBp) : null;
ok("폰 구간 블록을 읽었다", !!phoneBlock);

const gridBody = phoneBlock ? ruleBody(phoneBlock, ".mypage-grid") : null;
ok("폰 구간에 .mypage-grid 규칙이 있다", !!gridBody);
ok(
  "폰에서 표가 1열이다 (2열이면 값이 잘린다)",
  !!gridBody && /grid-template-columns:\s*1fr\s*;?\s*$/m.test(gridBody.trim()),
  gridBody && gridBody.trim()
);
ok(
  "폰 구간에 2열(repeat(2 / 1fr 1fr)이 남아 있지 않다",
  !!gridBody && !/repeat\(\s*2|1fr\s+1fr/.test(gridBody)
);

/* 1열이 되면 홀수 칸의 세로 구분선이 오른쪽 끝에 홀로 남습니다. */
ok(
  "1열에서 오른쪽 세로 구분선을 뺐다",
  !!phoneBlock && /nth-child\(odd\)[^{]*\{[^}]*border-right:\s*none/.test(phoneBlock)
);

/* ---- ② 안전장치: 잘리는 대신 줄바꿈 ---- */
const itemBody = ruleBody(rules, ".mypage-item");
ok(
  "값이 안 들어가면 아랫줄로 내려간다 (flex-wrap:wrap)",
  !!itemBody && /flex-wrap:\s*wrap/.test(itemBody),
  itemBody && itemBody.trim()
);
const valBody = ruleBody(rules, ".mypage-value");
ok(
  "값 칸이 남는 자리를 채운다 (flex 지정) — 내려간 줄에서도 우측 정렬 유지",
  !!valBody && /flex:\s*1\s+1\s+auto/.test(valBody),
  valBody && valBody.trim()
);

/* ---- ③ 불러오는 순서 ---- */
const linkRe = new RegExp('<link[^>]+href="' + CSS_REL + '"');
ok("index.html 이 이 파일을 불러온다", linkRe.test(html));
const posFix = html.search(linkRe);
const posStyle = html.indexOf('href="style.css"');
ok(
  "style.css 보다 뒤에서 불러온다 (순서로 이겨야 1열이 먹는다)",
  posStyle !== -1 && posFix > posStyle,
  "style.css@" + posStyle + " vs fix@" + posFix
);

/* ---- ④~⑦ 하지 말아야 할 것 ---- */
ok("!important 를 쓰지 않는다", !/!important/.test(rules));
ok("글자 크기를 건드리지 않는다 (대표 지시로 글자 축소는 되돌린 영역)", !/font-size/.test(rules));
ok("색을 건드리지 않는다 (확정 팔레트 보존)", !/(^|[^-\w])color\s*:/.test(rules));
ok("항목을 숨기지 않는다 (display:none 금지)", !/display:\s*none/.test(rules));
ok(
  "CSS 로 값을 바꿔치기하지 않는다 (content: 금지 — 숫자 축약 방지)",
  !/content\s*:/.test(rules)
);

/* ---- 수정 금지 12개 파일을 안 건드렸다 ---- */
const FORBIDDEN = [
  "js/trading.js", "js/ui.js", "js/auth.js", "js/supabase-sync.js",
  "js/chat.js", "js/leaderboard.js", "js/admin.js", "js/season.js",
  "js/board.js", "js/orderbook.js", "js/chart.js", "js/websocket.js",
];
ok(
  "고침이 CSS 한 파일 + index.html <link> 한 줄로 끝난다 (JS 무수정)",
  !/\.js/.test(rules)
);
ok("수정 금지 파일 12개를 이 고침이 요구하지 않는다", FORBIDDEN.every((f) => !rules.includes(f)));

/* ---- 돌연변이 검사: 검사기가 실제로 잡는지 ---- */
console.log("\n[ 돌연변이 검사 — 되돌리면 정말 실패하는가 ]");
{
  /* (가) 2열로 되돌린다 */
  const back2 = rules.replace(/grid-template-columns:\s*1fr\s*;/, "grid-template-columns:1fr 1fr;");
  ok("'2열로 되돌리기' 돌연변이를 만들었다", back2 !== rules);
  const mb = mediaBlock(back2, phoneBp);
  const gb = mb ? ruleBody(mb, ".mypage-grid") : null;
  ok("→ 2열로 되돌리면 1열 검사가 실패한다", !(gb && /grid-template-columns:\s*1fr\s*;?\s*$/m.test(gb.trim())));

  /* (나) 끊는 지점을 낮춰 390 을 놓친다 */
  const bp320 = rules.replace(/max-width:\s*\d+px/, "max-width: 320px");
  const b320 = Math.max(...[...bp320.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((m) => Number(m[1])));
  ok("→ 끊는 지점을 320 으로 낮추면 '390 이상' 검사가 실패한다", !(b320 >= 390), "지금 " + b320);

  /* (다) 글자를 줄여서 해결하려 한다 */
  const shrink = rules.replace(".mypage-value {", ".mypage-value {\n  font-size: 11px;");
  ok("'글자 줄이기' 돌연변이를 만들었다", shrink !== rules);
  ok("→ 글자를 줄이면 글자 크기 검사가 실패한다", /font-size/.test(shrink));

  /* (라) 숫자를 축약해서 보여주려 한다 */
  const abbr = rules.replace(".mypage-value {", '.mypage-value::after { content: "억"; }\n.mypage-value {');
  ok("'숫자 축약' 돌연변이를 만들었다", abbr !== rules);
  ok("→ content: 로 값을 바꾸면 축약 금지 검사가 실패한다", /content\s*:/.test(abbr));

  /* (마) !important 로 밀어붙인다 */
  const bang = rules.replace("flex-wrap: wrap", "flex-wrap: wrap !important");
  ok("→ !important 를 넣으면 그 검사가 실패한다", /!important/.test(bang));

  /* (바) 원본 파일은 그대로인지 */
  ok("원본 CSS 파일은 손대지 않았다", fs.readFileSync(cssPath, "utf8") === css);
}

console.log("\n==========================================================");
console.log("\ud1b5\uacfc " + pass + " / \uc2e4\ud328 " + fail);
if (fail === 0) {
  console.log("\uc804\uccb4 \ud1b5\uacfc \u2705");
  process.exit(0);
} else {
  console.log("\uc2e4\ud328 \uc788\uc74c \u274c");
  process.exit(1);
}
