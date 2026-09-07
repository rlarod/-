/* ===========================================================================
 * tests/chart-toprow-seal.test.js
 * ===========================================================================
 * 차트 맨 윗줄 ★한 줄로 합치기★ 되돌아감 방지 봉인 (2026-09-07 차트팀 · 3단계)
 *
 * ── 무엇을 합쳤나 ──────────────────────────────────────────────────────
 *   (전) 시간 단위 줄 #interval-row  페이지 폭, 차트 카드 ★위★
 *        도구 막대   .tlc-toolbar    차트 카드 ★안★
 *   (후) .tlc-toprow 안에서 ★한 줄★. 넘치면 두 줄이 아니라 ★옆으로 밀기★
 *
 * ── 왜 (실측) ──────────────────────────────────────────────────────────
 *   트레이딩뷰 (2026-09-07 · 1440x900)
 *     맨 윗줄 52,0 1388x38 — ★한 줄에 전부★
 *     390 에서도 h38 한 줄이고 x=366 이후 ★가로 스크롤★. 두 줄이 없습니다.
 *   우리 (localhost)
 *     수정 전 360/375/390  시간단위 95px(2줄) + 도구막대 89px(2줄) = ★184px★
 *     수정 후 360/375/390  ★44px 한 줄★  (768 이상은 85px -> 40px)
 *     390 첫 화면 캔들 띠  72px -> ★213px★
 *
 * ── 이 파일이 못 박는 것 ───────────────────────────────────────────────
 *   [1] 두 파일이 index.html 에 ★한 줄씩★ · ★차례가 맞게★ 실린다
 *   [2] 수정 금지 12개(특히 js/chart.js)를 한 글자도 안 고쳤다
 *   [3] 되돌리는 방법이 세 파일에 다 적혀 있다 (rm 이 아니라 git rm)
 *   [4] 전체화면이면 ★합친 줄째로★ 차트 카드 안으로 되돌린다
 *       — .chart-panel 이 전체화면 요소라, 안 되돌리면 막대가 통째로 사라집니다
 *       — ★줄째로★ 옮겨야 밀기 표시(›)가 같이 따라갑니다. 막대만 옮겼더니
 *         표시가 페이지에 남은 빈 줄에 달려서 안 보였고, 그래서 전체화면에서는
 *         표시를 아예 껐었습니다. 그 결과 폰(Esc 키가 없습니다)에서
 *         ★나가기 단추가 화면 밖 434px★ 에 있는데 밀 수 있다는 신호가 없어
 *         ★나가는 길이 안 보였습니다★ (390x844 실측 · 2026-09-07)
 *   [5] 크기 변수 6개가 .chart-panel 이 아니라 위(:root)에 있다
 *       — 막대가 카드 밖으로 나갔으므로 카드에 있으면 var() 를 못 읽습니다
 *   [6] ∨ 메뉴가 ★화면 띠(8 ~ 바닥) 밖으로 안 나간다★ (마지막 안전망)
 *   [7] 별표(즐겨찾기)의 처음 값이 수정 전 여섯 개 그대로다
 *       — 처음 오는 회원의 첫 화면이 안 바뀌어야 합니다
 *   [8] 화면 신호를 ★body 통째로★ 보지 않는다 (초당 수십 번이라 느려집니다)
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-toprow-seal.test.js
 *   (rm 이 아닙니다 — git 에 남으면 tests-dir-hygiene 이 터집니다)
 *   tests/_order.txt 의 이 파일 줄도 같이 지웁니다.
 *
 * 이 파일은 파일만 읽습니다. 서버도 브라우저도 안 부릅니다.
 * ======================================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const REPO = process.env.REPO || path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const strip = (s) => s.replace(/[/][*][^]*?[*][/]/g, "");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}
function 절(t) { console.log("\n" + t); }

const HTML = read("index.html");
const JS = read("js/chart-toprow.js");
const JS_CODE = strip(JS);
const CSS = read("css/chart-toprow.css");
const CSS_CODE = strip(CSS);
const TOOLBAR_CSS = read("css/chart-toolbar.css");
const TOOLBAR_CODE = strip(TOOLBAR_CSS);
const MORE = read("js/interval-more.js");
const MORE_CODE = strip(MORE);

console.log("\n차트 맨 윗줄 한 줄로 합치기 봉인");

/* =========================================================================
 * [1] 실리는 차례
 * ====================================================================== */
절("[1] index.html 에 한 줄씩, 차례가 맞게");
{
  ok("css/chart-toprow.css 가 한 줄만 실린다",
    (HTML.match(/css\/chart-toprow\.css/g) || []).length === 1);
  ok("js/chart-toprow.js 가 한 줄만 실린다",
    (HTML.match(/js\/chart-toprow\.js/g) || []).length === 1);
  /* 우리 CSS 가 도구막대 CSS 를 덮어야 하므로 ★뒤★ 여야 합니다 */
  ok("css/chart-toprow.css 가 css/chart-toolbar.css ★뒤★ 에 실린다 (덮어써야 합니다)",
    HTML.indexOf("css/chart-toprow.css") > HTML.indexOf("css/chart-toolbar.css"));
  /* 막대를 만드는 파일보다 뒤여야 자리를 옮길 대상이 있습니다 */
  ok("js/chart-toprow.js 가 도구막대를 만드는 파일 ★뒤★ 에 실린다",
    HTML.indexOf("js/chart-toprow.js") > HTML.indexOf('src="js/chart-drawings.js"'));
  ok("js/chart-toprow.js 가 js/interval-more.js ★뒤★ 에 실린다",
    HTML.indexOf("js/chart-toprow.js") > HTML.indexOf('src="js/interval-more.js"'));
  ok("두 파일이 실제로 디스크에 있다",
    fs.existsSync(path.join(REPO, "js/chart-toprow.js")) &&
    fs.existsSync(path.join(REPO, "css/chart-toprow.css")));
}

/* =========================================================================
 * [2] 수정 금지 파일 무수정
 * ====================================================================== */
절("[2] 수정 금지 파일을 한 글자도 안 고쳤다");
{
  const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, p))).digest("hex");
  /* 값은 tests/_locked-hashes.js 한 곳에서만 읽습니다 (해시를 두 벌로 두지 않습니다) */
  let LOCKED = null;
  try { LOCKED = require("./_locked-hashes.js"); } catch (e) { LOCKED = null; }
  const chartHash = LOCKED && LOCKED.BY_FILE && LOCKED.BY_FILE["js/chart.js"];
  ok("잠긴 해시 목록을 한 곳에서 읽어 왔다", !!chartHash, "tests/_locked-hashes.js 를 못 읽었습니다");
  if (chartHash) {
    ok("js/chart.js 가 기준 해시 그대로다", md5("js/chart.js") === chartHash,
      md5("js/chart.js") + " vs " + chartHash);
  }
  /* 우회 방식이 유지되는가 — 요소 ★자리만★ 옮기고 innerHTML 은 안 건드립니다 */
  ok("우리 모듈이 #interval-row 의 innerHTML 을 건드리지 않는다 (js/chart.js 가 매번 새로 씁니다)",
    !/innerHTML\s*=/.test(JS_CODE), "innerHTML 을 쓰면 chart.js 와 서로 덮어씁니다");
  ok("우리 모듈이 style.css 를 안 고친다는 근거가 주석에 있다",
    /style\.css 도 안 고쳤습니다/.test(JS));
}

/* =========================================================================
 * [3] 되돌리는 방법
 * ====================================================================== */
절("[3] 되돌리는 방법이 적혀 있다");
{
  ok("js/chart-toprow.js 에 되돌리는 방법이 있다", /되돌리는 방법/.test(JS));
  ok("css/chart-toprow.css 에 되돌리는 방법이 있다", /되돌리는 방법/.test(CSS));
  ok("되돌리기에 rm 이 아니라 ★git rm -f★ 라고 적혀 있다 (rm 은 git 에 남아 위생 봉인이 터집니다)",
    /git rm -f css\/chart-toprow\.css js\/chart-toprow\.js/.test(JS) &&
    /git rm -f css\/chart-toprow\.css js\/chart-toprow\.js/.test(CSS),
    "커밋 전(색인에만 올라간 상태)에는 -f 가 없으면 git 이 거절합니다 — 2026-09-07 실측");
  /* ★되돌리기를 실제로 눌러 보다가 걸린 두 함정입니다.★ 안내에 안 적으면 다음 사람이
     같은 자리에서 또 멈춥니다 — 되돌리기는 제일 급한 순간에만 눌립니다. */
  ok("-f 가 왜 필요한지가 두 파일에 다 적혀 있다",
    /색인에만 올라간 상태/.test(JS) && /색인에만 올라간 상태/.test(CSS));
  ok("tests/_order.txt 에서 지울 줄 수가 ★10줄★ 로 적혀 있다 (주석 8 + 등록 1 + 빈 줄 1)",
    /★10줄★/.test(JS) && /★10줄★/.test(CSS),
    "9줄로 적으면 등록 줄이 남습니다 — 주석 마지막 줄에도 파일 이름이 들어 있습니다");
  ok("css/chart-toolbar.css 를 어디까지 되돌려야 하는지 세 곳이 다 적혀 있다",
    /2026-09-07 차트팀/.test(CSS) && /:root/.test(CSS) && /flex-wrap:wrap; overflow:visible;/.test(CSS));
}

/* =========================================================================
 * [4] 전체화면 — 막대를 카드 안으로 되돌린다
 * ====================================================================== */
절("[4] 전체화면이면 합친 줄째로 차트 카드 안으로 돌아간다");
{
  ok("전체화면 여부를 우리 방식(data-tlc-full)으로 본다",
    /data-tlc-full/.test(JS_CODE));
  ok("브라우저 방식(fullscreenElement)도 같이 본다",
    /fullscreenElement/.test(JS_CODE) && /webkitFullscreenElement/.test(JS_CODE));
  ok("전체화면이면 ★합친 줄째로★ .chart-panel 맨 앞으로 옮긴다 (막대만 옮기면 › 표시가 빈 줄에 남습니다)",
    /insertBefore\(toprow,\s*p\.firstChild\)/.test(JS_CODE),
    "막대만 옮기면 폰에서 나가는 길이 안 보입니다 (390 실측 — 나가기 단추 x=810, 보임 false)");
  ok("나올 때 돌아갈 자리를 적어 둔다 (부모 + 다음 형제)",
    /home\s*=\s*toprow\.parentNode/.test(JS_CODE) && /homeNext\s*=\s*toprow\.nextSibling/.test(JS_CODE),
    "부모만 기억하면 다시 붙일 때 차례가 바뀝니다");
  ok("나오면 그 자리로 되돌린다",
    /home\.insertBefore\(toprow,\s*next\)/.test(JS_CODE));
  ok("막대는 어느 쪽이든 합친 줄 안이다",
    /toprow\.insertBefore\(bar,\s*hint/.test(JS_CODE));
  /* ★이 건이 회귀였습니다.★ 전체화면이라고 표시를 끄면 나가는 길이 사라집니다 */
  ok("★전체화면이라고 밀기 표시(›)를 끄지 않는다★",
    !/if\s*\(full\)\s*more\s*=\s*false/.test(JS_CODE),
    "폰에는 Esc 가 없어 나가기 단추까지 옆으로 밀어야 닿습니다 (전체화면 390 실측 — 보이는 폭 376 / 내용 981)");
  ok("끝까지 밀면 표시가 사라진다 (더 없는데 있다고 하면 거짓말입니다)",
    /bar\.scrollLeft\s*<\s*over\s*-\s*1/.test(JS_CODE));
  ok("fullscreenchange 를 듣는다 (Esc 로 나가도 맞춥니다)",
    /"fullscreenchange"/.test(JS_CODE) && /"webkitfullscreenchange"/.test(JS_CODE));
  /* 카드 안으로 돌아갔을 때 수정 전과 같은 모습이어야 합니다 */
  ok("카드 안일 때 아래 선이 살아난다 (.chart-panel > .tlc-toolbar)",
    /\.chart-panel\s*>\s*\.tlc-toolbar\s*\{[^}]*border-bottom\s*:\s*1px/.test(CSS_CODE));
  ok("카드 안에 들어간 합친 줄의 생김새 규칙이 있다 (맨 위 · 안 늘어남 · 위 여백 0)",
    /\.chart-panel\s*>\s*\.tlc-toprow\s*\{[^}]*order\s*:\s*-1[^}]*\}/.test(CSS_CODE) &&
    /\.chart-panel\s*>\s*\.tlc-toprow\s*\{[^}]*flex\s*:\s*0 0 auto[^}]*\}/.test(CSS_CODE) &&
    /\.chart-panel\s*>\s*\.tlc-toprow\s*\{[^}]*margin-top\s*:\s*0[^}]*\}/.test(CSS_CODE),
    "flex:0 0 auto 가 없으면 세로로 늘어나 차트를 밀어냅니다");
  ok("카드 안에서도 막대 아래 선이 살아난다 (.chart-panel > .tlc-toprow > .tlc-toolbar)",
    /\.chart-panel\s*>\s*\.tlc-toprow\s*>\s*\.tlc-toolbar\s*\{[^}]*border-bottom\s*:\s*1px/.test(CSS_CODE));
  ok("왜 줄째로 옮기는지가 숫자와 함께 적혀 있다 (다음 사람이 '막대만' 으로 되돌리지 않게)",
    /376px \/ 내용 981px/.test(CSS) && /Esc/.test(CSS));
}

/* =========================================================================
 * [5] 크기 변수가 카드 밖에서도 읽힌다
 * ====================================================================== */
절("[5] 크기 변수 6개가 .chart-panel 밖(:root)에 있다");
{
  const 이름들 = ["tlc-bar-h", "tlc-rail-w", "tlc-btn", "tlc-ico", "tlc-stroke", "tlc-bar-h-m"];
  /* .chart-panel{ ... } 블록만 도려내서 그 안에 크기 변수가 없는지 봅니다 */
  const panelBlocks = [];
  const re = /\.chart-panel\s*\{/g;
  let m;
  while ((m = re.exec(TOOLBAR_CODE))) {
    let d = 1, i = m.index + m[0].length;
    for (; i < TOOLBAR_CODE.length && d > 0; i++) {
      if (TOOLBAR_CODE[i] === "{") d++;
      else if (TOOLBAR_CODE[i] === "}") d--;
    }
    panelBlocks.push(TOOLBAR_CODE.slice(m.index, i));
  }
  const panelText = panelBlocks.join("\n");
  이름들.forEach(function (n) {
    ok("--" + n + " 가 .chart-panel 안에 없다 (막대가 카드 밖이라 거기 있으면 0px 로 무너집니다)",
      panelText.indexOf("--" + n + ":") === -1 && panelText.indexOf("--" + n + " :") === -1,
      "지금 .chart-panel 안에 있습니다");
    ok("--" + n + " 가 어딘가에 선언돼 있다",
      new RegExp("--" + n + "\\s*:").test(TOOLBAR_CODE));
  });
  ok(":root 선언이 있다", /:root\s*\{/.test(TOOLBAR_CODE));
  ok("왜 옮겼는지가 주석에 남아 있다 (다음 사람이 되돌리지 않게)",
    /선언 자리를 \.chart-panel 에서 :root 로 옮겼습니다/.test(TOOLBAR_CSS));
}

/* =========================================================================
 * [6] ∨ 메뉴가 화면 띠 밖으로 안 나간다
 * ====================================================================== */
절("[6] 시간 단위 ∨ 메뉴 — 마지막 안전망");
{
  ok("자리를 다 잡은 뒤 ★한 번 더★ 화면 띠 안인지 본다",
    /r3\.bottom\s*>\s*floorY[\s\S]{0,40}r3\.top\s*<\s*EDGE/.test(MORE_CODE),
    "아래끝만 보면 위로 나가는 자리를 못 잡습니다 (360x640 에서 663자리)");
  ok("위끝이 아래끝보다 세다 (둘 다 모자라면 위를 지킵니다)",
    /if \(want2 < EDGE\) want2 = EDGE;/.test(MORE_CODE));
  ok("왜 필요했는지가 숫자로 적혀 있다",
    /663자리/.test(MORE) && /800x360/.test(MORE),
    "근거 숫자가 없으면 다음 사람이 '쓸데없는 방어' 로 읽고 지웁니다");
  ok("메뉴가 막대에 안 잘리게 하는 규칙이 있다 (.tl-im-wrap 의 자리 기준을 막대 밖으로)",
    /\.tl-im-wrap\s*\{\s*position\s*:\s*static/.test(CSS_CODE),
    "이게 없으면 막대(overflow-x:auto)가 메뉴를 40px 에서 잘라 한 줄도 안 보입니다");
}

/* =========================================================================
 * [7] 별표 — 처음 값이 수정 전 그대로
 * ====================================================================== */
절("[7] 별표(즐겨찾기)");
{
  const m = MORE_CODE.match(/FAV_DEFAULT\s*=\s*\[([^\]]*)\]/);
  const def = m ? m[1].replace(/["'\s]/g, "").split(",").filter(Boolean) : [];
  ok("처음 별표가 수정 전 여섯 개 그대로다 (첫 화면이 안 바뀝니다)",
    def.join(",") === "1m,5m,15m,1h,4h,1d", def.join(","));
  ok("별표를 App.Storage 에 저장한다 (새로고침해도 남습니다)",
    /App\.Storage[\s\S]{0,60}save\(FAV_KEY/.test(MORE_CODE));
  ok("막아 둔 간격(1초·5초·15초)은 메뉴에도 안 넣는다",
    /App\.IntervalGuard[\s\S]{0,60}getBlocked/.test(MORE_CODE),
    "막힌 간격을 고를 수 있게 두면 강제청산이 멈춥니다 (TL-004)");
  /* 별을 글자로 찍으면 tests/no-emoji.test.js 가 막습니다(U+2600~U+27BF).
     실제로 여기서 한 번 빨개졌습니다. 그래서 ★단추 안에 글자를 안 넣습니다.★
     (주석 산문의 ★ 는 이 프로젝트 어느 파일에나 있어서 세지 않습니다) */
  ok("별 단추에 글자를 안 넣는다 (SVG 로만 그립니다)",
    !/star.textContent/.test(MORE_CODE) && /star.innerHTML !== STAR_SVG/.test(MORE_CODE));
  ok("별은 SVG 로 그린다 (새 아이콘 파일을 안 만듭니다)",
    /STAR_SVG/.test(MORE_CODE) && /<svg viewBox="0 0 24 24"/.test(MORE_CODE));
  ok("글씨를 안 줄였다 — 메뉴 글씨가 20.5px 그대로다",
    (MORE_CODE.match(/font-size:([\d.]+)px/g) || []).every((s) => s === "font-size:20.5px"),
    (MORE_CODE.match(/font-size:([\d.]+)px/g) || []).join(" / "));
}

/* =========================================================================
 * [8] 성능 — 화면 신호를 통째로 보지 않는다
 * ====================================================================== */
절("[8] 성능");
{
  ok("MutationObserver 가 document.body 를 subtree 로 보지 않는다",
    !/observe\(\s*document\.body\s*,[^)]*subtree/.test(JS_CODE),
    "시세·호가·채팅이 초당 수십 번 DOM 을 갈아서 프레임당 2ms 를 먹었습니다(실측)");
  ok("자리 계산을 한 프레임에 한 번으로 묶는다 (requestAnimationFrame)",
    /requestAnimationFrame/.test(JS_CODE));
  ok("같은 값이면 setAttribute 를 안 한다 (무한 되풀이 막기)",
    /if \(v === now\) return;/.test(JS_CODE),
    "같은 값이어도 변경 신호가 나서 페이지가 아예 안 뜬 적이 있습니다");
  ok("시세를 아예 안 본다 (초당 수십 번 오는 신호)",
    !/App\.Bus|onTick|price/.test(JS_CODE));
  ok("걸린 시간을 잴 수 있다 (measure)", /measure/.test(JS_CODE) && /performance\.now/.test(JS_CODE));
}

/* =========================================================================
 * [9] 등록
 * ====================================================================== */
절("[9] 등록");
{
  const order = read("tests/_order.txt");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-toprow-seal.test.js") !== -1);
  ok("되돌리기에 git rm 이라고 적혀 있다", /git rm -f tests\/chart-toprow-seal\.test\.js/.test(read("tests/chart-toprow-seal.test.js")));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail > 0) { console.log("실패 있음"); process.exit(1); }
