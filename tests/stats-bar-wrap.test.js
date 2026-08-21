/* tests/stats-bar-wrap.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 폰에서 펀딩비가 시세 바 밖으로 밀려 안 보이는 것. (TL-001 / P2)
 *
 * 펀딩비는 8시간마다 잔고에서 **실제로 빠져나가는 돈**입니다.
 * `.stats-bar` 가 한 줄을 고집해서(style.css: flex-wrap:nowrap + overflow-x:auto)
 * 좁은 화면에서는 펀딩비가 상자 안에 갇혀 있었습니다.
 *
 * 실측 (2026-08-21, 비로그인) — 펀딩비가 보이나
 *   360 ❌  375 ❌  390 ❌  430 ❌  520 ❌  600 ❌  700 ❌  |  730 ✅  768 ✅
 *   → 안 보이는 구간이 **700px 이하**입니다.
 *
 * ★ 이 테스트가 특히 못 박는 것
 *   ① 끊는 지점이 **700px 이상**이어야 한다.
 *      docs/수리준비.md 의 준비안은 430px 이었는데, 그러면 **520~700 구간에서
 *      펀딩비가 계속 안 보입니다**(실측). 430 으로 되돌리면 실패시킵니다.
 *   ② `style.css` 를 안 건드렸다 — 디자인팀이 동시에 고치는 파일입니다.
 *   ③ `!important` 를 안 쓴다 — 순서로 이기게 해서 나중에 덮기 쉽게 둡니다.
 *   ④ 항목을 숨기지 않는다(display:none 금지). 접는 것이지 감추는 것이 아닙니다.
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const CSS_REL = "stats-bar-mobile-wrap.css";
const cssPath = path.join(REPO, CSS_REL);
const css = fs.readFileSync(cssPath, "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const styleCss = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

/* 주석을 뺀 실제 규칙만 — 설명 주석에 걸려 오판하지 않게 합니다. */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, "");

/* ---- 탐지기 ---- */
function breakpoints(src) {
  return [...src.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
}
function blockFor(src, selector) {
  const i = src.indexOf(selector);
  if (i === -1) return null;
  const s = src.indexOf("{", i);
  const e = src.indexOf("}", s);
  return s === -1 || e === -1 ? null : src.slice(s + 1, e);
}

/* 실측표 — 펀딩비가 보이던 폭 / 안 보이던 폭 (2026-08-21) */
const HIDDEN_AT = [360, 375, 390, 430, 520, 600, 700]; // 펀딩비 안 보임
const OK_AT = [730, 768, 1440, 1920];                   // 펀딩비 보임

/* =========================================================================
 * 1) 배선
 * =======================================================================*/
console.log("\n[배선] 새 CSS 가 style.css 뒤에 실린다");
{
  ok(CSS_REL + " 파일이 있다", fs.existsSync(cssPath));
  ok("index.html 에 <link> 로 연결됐다", html.indexOf(CSS_REL) !== -1);
  const iStyle = html.indexOf('href="style.css"');
  const iMine = html.indexOf('href="' + CSS_REL + '"');
  ok("style.css 보다 뒤에 온다(순서로 이겨야 함)", iStyle !== -1 && iMine !== -1 && iMine > iStyle,
    "style.css " + iStyle + " / " + CSS_REL + " " + iMine);
  ok("<link rel=\"stylesheet\"> 로 불러온다", new RegExp('rel="stylesheet"[^>]*' + CSS_REL.replace(".", "\\.")).test(html) ||
    new RegExp(CSS_REL.replace(".", "\\.") + '"[^>]*>').test(html));
}

/* =========================================================================
 * 2) ★ 끊는 지점 — 700px 이상이어야 한다
 * =======================================================================*/
console.log("\n[끊는 지점] 펀딩비가 안 보이던 구간을 전부 덮는가");
const bps = breakpoints(rules);
{
  ok("미디어쿼리가 있다", bps.length > 0);
  const bp = Math.max(...bps);
  ok("끊는 지점이 하나로 정해져 있다", new Set(bps).size === 1, "찾은 값: " + bps.join(","));
  ok(
    "★ 끊는 지점이 700px 이상이다(준비안의 430px 이면 520~700 이 안 고쳐짐)",
    bp >= 700,
    "지금 " + bp + "px"
  );
  for (const w of HIDDEN_AT) {
    ok("펀딩비가 안 보이던 " + w + "px 가 적용 범위 안이다", w <= bp, "끊는 지점 " + bp);
  }
  ok(
    "펀딩비가 이미 보이던 730px 은 건드리지 않는다(넓은 화면 무변화)",
    bp < 730,
    "지금 " + bp + "px — 730 까지 접으면 멀쩡한 구간을 바꾸는 것"
  );
  for (const w of OK_AT) {
    ok("펀딩비가 보이던 " + w + "px 는 적용 범위 밖이다", w > bp);
  }
}

/* =========================================================================
 * 3) 실제로 접는가
 * =======================================================================*/
console.log("\n[규칙] 한 줄 고집을 실제로 푸는가");
{
  const bar = blockFor(rules, ".stats-bar");
  ok(".stats-bar 규칙이 있다", bar !== null);
  ok("flex-wrap 을 wrap 으로 바꾼다", /flex-wrap:\s*wrap/.test(bar || ""));
  ok("overflow-x 를 visible 로 바꾼다(상자 안에 가두지 않음)", /overflow-x:\s*visible/.test(bar || ""));
  ok("줄 사이 간격(row-gap)을 준다", /row-gap:\s*\d+px/.test(bar || ""));
  ok(
    "가로 간격(gap)은 건드리지 않는다(style.css 의 구간별 값 20/10/6px 을 그대로 씀)",
    !/[^-]gap:\s*\d+px/.test((bar || "").replace(/row-gap:\s*\d+px/g, "")),
    bar
  );
  ok("접으면 스크롤 힌트를 끈다(깜박임 방지)", /tl-stats-hint-layer::after/.test(rules) && /display:\s*none/.test(rules));
  ok("줄 끝에 홀로 남는 구분선을 없앤다", /border-right:\s*none/.test(rules));

  /* style.css 쪽 전제가 아직 사실인지 — 사실이 아니면 이 파일이 무의미해집니다 */
  ok("style.css 는 여전히 flex-wrap:nowrap 이다(우리가 뒤집는 대상)", /flex-wrap:nowrap/.test(styleCss));
  ok("style.css 는 여전히 overflow-x:auto 이다", /overflow-x:auto/.test(styleCss));
}

/* =========================================================================
 * 4) 안전 — 감추지 않기 / style.css 안 건드리기 / !important 안 쓰기
 * =======================================================================*/
console.log("\n[안전] 감추지 않는가 · 남의 파일을 안 건드렸는가");
{
  ok(
    "★ style.css 에는 이 수정이 없다(디자인팀 파일을 안 건드림)",
    styleCss.indexOf("stats-bar-mobile-wrap") === -1 && !/flex-wrap:\s*wrap[^;]*;\s*[^}]*overflow-x:\s*visible/.test(styleCss)
  );
  ok("!important 를 쓰지 않는다(순서로 이김 — 나중에 덮기 쉬움)", !/!important/.test(rules));

  /* 항목을 숨기면 안 됩니다. 유일하게 허용되는 display:none 은
     스크롤 힌트(::after) 하나뿐입니다 — 그건 데이터가 아니라 장식입니다. */
  const noneRules = [...rules.matchAll(/([^{}]+)\{[^}]*display:\s*none[^}]*\}/g)].map((m) => m[1].trim());
  ok("display:none 이 붙은 선택자가 하나뿐이다", noneRules.length === 1, noneRules.join(" | "));
  ok(
    "★ 그 하나가 스크롤 힌트(::after)다 — 항목이 아니다",
    noneRules.length === 1 && /::after/.test(noneRules[0]) && !/stat-block|stat-value|stat-label/.test(noneRules[0]),
    noneRules[0]
  );
  ok("stat-block 을 숨기지 않는다", !/\.stat-block[^{]*\{[^}]*display:\s*none/.test(rules));
  ok("stat-value / stat-label 을 숨기지 않는다", !/stat-(value|label)[^{]*\{[^}]*display:\s*none/.test(rules));
  ok("글자를 잘라 감추지 않는다(text-overflow/ellipsis 없음)", !/text-overflow|ellipsis/.test(rules));
  ok("폭이나 글자 크기를 0 으로 만들지 않는다", !/(width|font-size):\s*0/.test(rules));
}

/* =========================================================================
 * 5) 수정 금지 파일
 * =======================================================================*/
console.log("\n[안전] 수정 금지 파일 확인");
{
  const FROZEN = {
    "js/chart.js": "02ddcb000d577131f797143d08c09123",   /* 펀딩비 라벨을 만드는 곳 */
    "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "js/trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "js/websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok("수정 금지 파일이 그대로다: " + f, got === want, "지금 " + got);
  }
  ok(
    "라벨을 바꾸는 별도 모듈을 만들지 않았다(24H 기간 표시를 지우지 않으려고)",
    !fs.existsSync(path.join(REPO, "js/stat-label-narrow.js"))
  );
}

/* =========================================================================
 * 6) 돌연변이 — 망가뜨리면 검사가 뒤집히는가
 * =======================================================================*/
console.log("\n[돌연변이] 망가뜨리면 정말 실패하는가");
{
  /* (가) 준비안대로 430px 으로 되돌린다 = 520~700 이 안 고쳐지는 상태 */
  const bp430 = rules.replace(/max-width:\s*\d+px/, "max-width: 430px");
  ok("430px 돌연변이를 만들었다(메모리에서만)", bp430 !== rules);
  const b430 = Math.max(...breakpoints(bp430));
  ok("→ 430px 이면 ★ '700 이상' 검사가 실패한다(= 검사가 진짜다)", !(b430 >= 700), "지금 " + b430);
  const stillBroken = HIDDEN_AT.filter((w) => w > b430);
  ok("→ 430px 이면 " + stillBroken.join("/") + " 가 안 고쳐진 채 남는다", stillBroken.length === 3, stillBroken.join(","));

  /* (나) 접기를 빼고 항목을 숨기는 방식으로 바꾼다 = 데이터 감추기 */
  const hideIt = rules.replace(/flex-wrap:\s*wrap/, "flex-wrap: nowrap").replace(
    /border-right:\s*none/, "display: none"
  );
  ok("'항목 숨기기' 돌연변이를 만들었다", hideIt !== rules);
  const noneSel = [...hideIt.matchAll(/([^{}]+)\{[^}]*display:\s*none[^}]*\}/g)].map((m) => m[1].trim());
  ok("→ 항목에 display:none 이 붙으면 '하나뿐' 검사가 실패한다", noneSel.length !== 1, noneSel.join(" | "));
  ok("→ 그리고 stat-block 숨김 검사도 실패한다", /\.stat-block[^{]*\{[^}]*display:\s*none/.test(hideIt));

  /* (다) !important 를 넣는다 */
  const bang = rules.replace("flex-wrap: wrap", "flex-wrap: wrap !important");
  ok("→ !important 를 넣으면 그 검사가 실패한다", /!important/.test(bang));

  /* (라) 넓은 화면까지 접게 만든다 = 멀쩡한 구간을 바꾸는 것 */
  const bp1200 = rules.replace(/max-width:\s*\d+px/, "max-width: 1200px");
  const b1200 = Math.max(...breakpoints(bp1200));
  ok("→ 1200px 까지 접으면 '730 은 건드리지 않는다' 검사가 실패한다", !(b1200 < 730), "지금 " + b1200);

  /* (마) 원본 파일은 그대로인지 */
  ok("원본 CSS 파일은 손대지 않았다", fs.readFileSync(cssPath, "utf8") === css);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) {
  console.log("전체 통과 ✅");
  process.exit(0);
} else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
