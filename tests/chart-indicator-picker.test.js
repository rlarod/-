/* tests/chart-indicator-picker.test.js
 * =========================================================================
 * 봉인 — 지표 고르는 창(js/chart-indicator-picker.js)
 * =========================================================================
 * 2026-09-03 · 차트팀
 *
 * 대표 지시 — "지표 누르면 이런식으로 창이 뜨게해줘 아니 트레이딩뷰랑 똑같이
 * 가자니까 왜 맘대로하는거야 직접 트레이딩뷰 들어가서 실측해서 만들어"
 *
 * ── 이 봉인이 지키는 것 ─────────────────────────────────────────────────
 *   [1] 파일이 실제로 있고 index.html 이 부르고 ★git 에도 있다★
 *       (디스크엔 있는데 커밋엔 없는 조용한 고장 — CLAUDE.md 에 세 번 났다고 적힌 것)
 *   [2] ★글씨 바닥값 17px★ — 대표가 네 번 말씀하신 것. 하나라도 미만이면 빨개집니다
 *   [3] ★확정 팔레트 밖 색을 안 쓴다★ — 트레이딩뷰 색을 베끼지 않았는지
 *   [4] ★폰 하단 매수·매도 바(.tl-order-bar) 를 본다★
 *       2026-09-03 에 지표 설정판이 이것 때문에 P1 이었습니다. 같은 자리입니다
 *   [5] ★옛 메뉴 파일을 안 고쳤다★ — 감싸기만 했는지
 *   [6] 되돌리는 길(restore)이 실제로 있다
 *   [7] 지표 이름을 ★두 벌로 안 적었다★ — 틀(listDefs)에서 읽는지
 *
 * ⚠️ 줄 번호나 그때그때의 지표 개수를 박지 않습니다. 차트팀이 지표를 계속
 *    늘리는 중이라 숫자를 박으면 다음 주에 거짓말이 됩니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = process.env.REPO || path.join(__dirname, "..");
const SRC = "js/chart-indicator-picker.js";

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m✓" + ESC + "[0m";
const NGM = ESC + "[31m✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + OKM + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function 절(t) {
  console.log("\n" + t);
}

function read(rel) {
  try {
    return fs.readFileSync(path.join(REPO, rel), "utf8");
  } catch (e) {
    return null;
  }
}

/** 주석을 지운 소스. 주석에 적어 둔 예시 때문에 오탐이 나지 않게.
 *  (tests/chart-popup-floor-census.test.js 가 같은 이유로 같은 일을 합니다) */
function 주석뺀(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

console.log("\n지표 고르는 창 봉인 (트레이딩뷰 실측 이식)");

const src = read(SRC);
const html = read("index.html");
const 알맹이 = src ? 주석뺀(src) : "";

/* =======================================================================
 * [1] 있는가 · 불리는가 · git 에 있는가
 * ===================================================================== */
절("[1] 파일 · index.html · git");
{
  ok("js/chart-indicator-picker.js 가 있다", !!src);
  ok("index.html 이 이 파일을 부른다", !!html && html.indexOf(SRC) >= 0);

  /* ⚠️ fs.existsSync 로는 못 잡습니다 — git ls-files 로 봐야 합니다.
     "내 컴퓨터엔 있는데 clone 한 PC 에선 빈 링크" 가 이 프로젝트에서 세 번 났습니다. */
  let tracked = "";
  try {
    tracked = execFileSync("git", ["ls-files", SRC], { cwd: REPO, encoding: "utf8" }).trim();
  } catch (e) {
    tracked = "";
  }
  ok("git 에도 올라와 있다 (clone 한 PC 에서 빈 링크가 안 되게)", tracked === SRC,
    tracked ? "git 이 돌려준 값: " + tracked : "git ls-files 가 비었습니다 — 아직 add 안 된 상태일 수 있습니다");

  /* 실리는 순서 — 틀과 옛 메뉴보다 ★뒤★ 여야 감쌀 대상이 이미 있습니다 */
  if (html) {
    const iP = html.indexOf(SRC);
    const iMenu = html.indexOf("js/chart-indicator-menu.js");
    const iKit = html.indexOf("js/chart-indicator-kit.js");
    ok("옛 메뉴(chart-indicator-menu.js)보다 뒤에 실린다", iMenu >= 0 && iP > iMenu,
      "menu=" + iMenu + " picker=" + iP);
    ok("틀(chart-indicator-kit.js)보다 뒤에 실린다", iKit >= 0 && iP > iKit,
      "kit=" + iKit + " picker=" + iP);
  }
}

/* =======================================================================
 * [2] ★글씨 바닥값 17px★ — 대표가 네 번 말씀하신 것
 *
 * 트레이딩뷰가 14px 인 자리도 우리는 17px 이 바닥입니다.
 * "트레이딩뷰가 13px 니까 13px" 로 되돌리는 순간 빨개집니다.
 * ===================================================================== */
절("[2] ★팝업 글씨 바닥값 17px★ (한도 0)");
{
  const 바닥 = 17;
  const 작은것 = [];
  const re = /font-size:\s*([0-9.]+)px/g;
  let m;
  while ((m = re.exec(알맹이)) !== null) {
    const v = parseFloat(m[1]);
    if (v < 바닥) 작은것.push(v + "px");
  }
  ok("17px 미만 font-size 가 하나도 없다", 작은것.length === 0,
    작은것.length ? "찾은 것: " + 작은것.join(" · ") : "");

  /* 실제로 쓰는 크기가 무엇인지 눈에 보이게 남깁니다 */
  const 크기 = [...new Set((알맹이.match(/font-size:\s*[0-9.]+px/g) || [])
    .map((s) => s.replace(/\s+/g, "")))].sort();
  console.log("      쓰는 크기 — " + (크기.join(" · ") || "(없음)"));

  /* 돌연변이 — 일부러 16px 을 끼워 넣으면 위 검사가 터지는가 */
  const 가짜 = 알맹이 + '".tl-ipick-x{font-size:16px;}"';
  let 가짜작은 = 0;
  const re2 = /font-size:\s*([0-9.]+)px/g;
  let m2;
  while ((m2 = re2.exec(가짜)) !== null) if (parseFloat(m2[1]) < 바닥) 가짜작은++;
  ok("★돌연변이★ 16px 을 끼우면 [2] 가 잡는다", 가짜작은 === 1, "잡은 개수 " + 가짜작은);
}

/* =======================================================================
 * [3] 확정 팔레트 — 트레이딩뷰 색을 베끼지 않았는가
 * ===================================================================== */
절("[3] 확정 팔레트 밖 색 금지");
{
  const 팔레트 = [
    "#0A0F1C", "#101727", "#0D1422", "#1D273B",
    "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"
  ];
  const 쓴색 = [...new Set((알맹이.match(/#[0-9A-Fa-f]{6}\b/g) || []).map((s) => s.toUpperCase()))];
  const 밖 = 쓴색.filter((c) => 팔레트.indexOf(c) < 0);
  ok("확정 팔레트 9색 밖의 색을 안 쓴다", 밖.length === 0, 밖.join(" "));
  console.log("      쓰는 색 — " + 쓴색.join(" "));

  /* 트레이딩뷰가 실제로 쓰던 값이 그대로 들어오면 바로 잡습니다.
     실측(2026-09-03) — 피봇선 #FB8C00 · 파란 작성자 링크 계열 #2962FF */
  ["#FB8C00", "#2962FF", "#089981", "#F23645"].forEach((c) => {
    ok("트레이딩뷰 색 " + c + " 을 안 베꼈다", 알맹이.toUpperCase().indexOf(c) < 0);
  });
}

/* =======================================================================
 * [4] ★폰 하단 매수·매도 바를 본다★
 *
 * 2026-09-03 P1 — 지표 설정판의 단추줄이 통째로 바 밑에 깔려
 * "확인" 을 눌렀다고 믿는데 ★매도/숏 주문창★ 이 열렸습니다. 같은 자리입니다.
 * ===================================================================== */
절("[4] 폰 하단 매수·매도 바(.tl-order-bar) 밑으로 안 내려간다");
{
  ok("소스가 .tl-order-bar 를 실제로 본다", 알맹이.indexOf(".tl-order-bar") >= 0);
  ok("화면 높이(innerHeight)를 기준으로 잰다", /innerHeight/.test(알맹이));
  ok("바가 display:none 이면 안 센다", /display\s*===?\s*["']none["']/.test(알맹이));
  ok("전체화면일 때는 바를 안 센다", /fullscreen/i.test(알맹이));
  ok("잰 값으로 ★키(height)까지★ 줄인다 (자리만 밀면 안쪽이 잘립니다)",
    /Math\.min\(\s*H\s*,/.test(알맹이) || /Math\.min\(H,/.test(알맹이));
}

/* =======================================================================
 * [5] 옛 메뉴 · 수정 금지 파일을 안 고쳤는가
 * ===================================================================== */
절("[5] 감싸기만 했는가 (옛 파일 무수정)");
{
  ok("옛 메뉴의 open 을 감싼다", /ChartIndicatorMenu/.test(알맹이) && /prevOpen/.test(알맹이));
  ok("옛 메뉴의 toggle 을 감싼다", /prevToggle/.test(알맹이));

  /* 이 파일이 옛 메뉴나 chart.js 를 직접 고치는 코드를 들고 있지 않은지 */
  ok("js/chart.js 를 건드리는 코드가 없다", 알맹이.indexOf("js/chart.js") < 0);

  /* 옛 메뉴 파일이 이 작업으로 바뀌지 않았는지 — 그 파일의 공개 API 가 그대로인지 */
  const menu = read("js/chart-indicator-menu.js");
  ok("옛 메뉴 파일이 아직 open/close/toggle 을 그대로 내준다",
    !!menu && /open:\s*open/.test(menu) && /toggle:\s*toggle/.test(menu));
  ok("옛 메뉴 파일에 picker 를 부르는 줄이 새로 안 생겼다",
    !!menu && menu.indexOf("ChartIndicatorPicker") < 0);
}

/* =======================================================================
 * [6] 되돌리는 길
 * ===================================================================== */
절("[6] 되돌리기");
{
  ok("restore() 를 내준다", /restore:\s*restore/.test(알맹이));
  ok("restore 가 옛 open 을 되돌려 놓는다", /M\.open\s*=\s*prevOpen/.test(알맹이));
  ok("restore 가 옛 toggle 을 되돌려 놓는다", /M\.toggle\s*=\s*prevToggle/.test(알맹이));
  ok("되돌리는 방법이 파일 맨 위에 적혀 있다",
    !!src && src.indexOf("되돌리기") >= 0 && src.indexOf("restore()") >= 0);
}

/* =======================================================================
 * [7] 지표 이름을 ★두 벌로 안 적었는가★
 *
 * 이 프로젝트가 여러 번 당한 모양입니다 — 같은 값이 두 곳에 생기면
 * 한쪽만 고쳐져서 어느 쪽이 사실인지 알 수 없게 됩니다.
 * ===================================================================== */
절("[7] 지표 이름을 두 벌로 안 적었는가");
{
  ok("틀(listDefs)에서 읽는다", /listDefs\s*\(/.test(알맹이));

  /* 틀에 있는 정의 이름이 이 파일에 글자로 박혀 있으면 두 벌입니다.
     ★목록은 틀에서 그때그때 가져옵니다★ — 여기서 세지 않습니다. */
  const kit = read("js/chart-indicator-kit.js");
  const 이름들 = [...new Set(
    [...(kit || "").matchAll(/^\s*name:\s*"([^"]+)"/gm)].map((m) => m[1])
  )];
  const 박힌것 = 이름들.filter((n) => {
    if (n.length < 3) return false; /* MA · CCI 같은 두세 글자는 우연히 겹칩니다 */
    return 알맹이.indexOf('"' + n + '"') >= 0;
  });
  ok("지표 이름이 이 파일에 글자로 안 박혀 있다", 박힌것.length === 0, 박힌것.join(" · "));
  console.log("      틀이 든 정의 이름 " + 이름들.length + "개를 그대로 읽습니다");

  ok("색도 틀이 고르게 맡긴다 (색 규칙을 두 벌로 안 만듦)",
    /createInstance\s*\(/.test(알맹이) && !/LINE_COLORS\s*=/.test(알맹이));
}

/* =======================================================================
 * [8] 검색 · 즐겨찾기가 실제로 있는가
 * ===================================================================== */
절("[8] 검색 · 즐겨찾기");
{
  ok("이름으로 거를 수 있다", /matches\s*\(/.test(알맹이) && /indexOf\(q\)/.test(알맹이));
  ok("설명·id 로도 걸린다", /d\.note/.test(알맹이) && /d\.id/.test(알맹이));
  ok("즐겨찾기를 App.Storage 로 저장한다", /App\.Storage/.test(알맹이));
  ok("저장소를 새로 만들지 않았다 (localStorage 직접 호출 없음)",
    알맹이.indexOf("localStorage") < 0);
  ok("우리에 데이터가 없는 칸(내 스크립트·에디터즈 픽 등)을 빈 채로 안 보여준다",
    알맹이.indexOf("내 스크립트") < 0 && 알맹이.indexOf("에디터즈") < 0);
}

/* ===================================================================== */
console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록");
  실패목록.forEach((s) => console.log("  · " + s));
  process.exit(1);
}
