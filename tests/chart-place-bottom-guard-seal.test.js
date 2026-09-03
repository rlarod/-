/* tests/chart-place-bottom-guard-seal.test.js
 * =========================================================================
 * ★화면에 무언가를 띄우는 함수는 전부 아래쪽 방어를 가져야 한다★
 *   대상: js/chart-drawings.js  (putFixed 를 부르는 자리잡기 함수 전부)
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 만드나 ─────────────────────────────────────────────────────────
 * ★같은 병이 하룻밤에 세 곳에서 나왔습니다.★ 코드가 서로 거의 같습니다.
 *
 *   placeToast   아래쪽 방어 ★있음★    ← 정답 (15차 2026-09-02 에 넣음)
 *   placeList    아래쪽 방어 ★없었음★  ← 2026-09-03 고침 (b9494d0)
 *   placeStyle   아래쪽 방어 ★없었음★  ← 2026-09-03 고침 (17차 · 수리팀)
 *
 * ⚠️ 이 파일을 만드는 동안 placeStyle 이 고쳐졌습니다. 만들던 중에는 2·4절이
 *    빨갰고(바닥 언급 0번 · 360 에서 75px 넘침), 수리팀 수정이 들어오자
 *    ★손대지 않아도★ 초록이 됐습니다. 줄 번호가 아니라 동작을 보기 때문입니다.
 *
 * 한 곳씩 고치면 ★네 번째★ 가 또 나옵니다. 그래서 봉인을 "이 함수" 가 아니라
 * ★"putFixed 를 부르는 함수 전부"★ 에 겁니다.
 *
 * ★새 함수가 생기면 손대지 않아도 검사 대상에 자동으로 들어옵니다.★
 * 이름을 손으로 적어 두면 다음 사람이 새로 만든 것을 아무도 안 봅니다.
 * (1절이 소스에서 직접 찾아냅니다. 등록표와 다르면 그 자리에서 빨개집니다)
 *
 * ── 무엇이 걸린 일인가 ────────────────────────────────────────────────
 * 폰에서 페이지를 살짝 내리면 차트 칸에 47~59px 밖에 안 남습니다. 그 자리에서
 * 아래쪽 방어가 없는 창은 ★하단 매수·매도 바 밑으로 내려가 단추가 안 눌립니다.★
 * 화면은 멀쩡해 보이고 오류도 없습니다 — 회원은 "안 눌리네" 로만 느낍니다.
 * 2026-09-03 실측(수리팀) — 그린 것 목록이 360 에서 단추 9개를 막았습니다.
 *
 * ── 어떻게 확인하나 (계산을 베끼지 않습니다) ──────────────────────────
 * 자리잡기 함수는 모듈 밖으로 안 나옵니다. 그래서 ★원본 함수 본문을 글자
 * 그대로 떼어내★ 가짜 화면 위에서 돌립니다. 테스트가 계산을 따로 베껴 쓰면
 * 원본이 바뀌어도 옛 계산만 지키게 됩니다.
 * (tests/chart-draw-list-fit.test.js · tests/chart-chip-viewport-seal.test.js 와 같은 방식)
 *
 * ★흉내가 진짜와 같은지는 3절에서 브라우저 실측값과 글자 그대로 맞춰 봅니다.★
 * 2026-09-03 수리팀이 브라우저로 잰 값 —
 *   360·y=50   그린 것 목록 615~719 (키 104)
 *   1440·y=0   그린 것 목록 688~792 (키 104)
 * 흉내가 이 값을 못 내면 아래 검사는 다 헛것이므로 3절에서 먼저 빨개집니다.
 *
 * ── ⚠️ 이 봉인이 진짜로 무는지 (돌연변이) ────────────────────────────
 * 5절이 ★자동으로★ 확인합니다 — 함수 본문의 `.bottom` 을 아주 큰 수로 바꿔
 * 태우면 ★반드시 넘쳐야★ 합니다. 안 넘치면 그 함수는 바닥을 보는 척만 하고
 * 실제로는 아무것도 안 지키는 것입니다. (앞 건에서 `A || B` 로 늘 참이던
 * 봉인이 실제로 있었습니다)
 *
 * ── 두 층으로 봅니다 ──────────────────────────────────────────────────
 *   ㉮ 창이 보이는 칸보다 ★작을 때★  — 예외 없이 전부 지켜야 합니다
 *   ㉯ 창이 보이는 칸보다 ★클 때★    — 접히거나 줄어드는 창만 지켜야 합니다
 *      ⚠️ 2026-09-03 에 ★칩 면제가 없어졌습니다★.
 *      전에는 칩(.tl-draw-chip · .tl-zoom-chip)이 white-space:nowrap 이라
 *      한 줄에서 안 늘어난다고 보고 ㉯ 에서 뺐습니다. 대표 지시로 칩 글씨를
 *      11 -> 17px 로 올리면서 칩이 차트 칸보다 넓어져 flex-wrap:wrap 을 넣었고,
 *      이제 ★두 줄이 됩니다★. 면제 근거가 사라졌습니다.
 *      실제로 그 사이에 360 · 스크롤 44 에서 칩이 하단 매수·매도 바 밑으로
 *      8.2px 내려갔습니다 — 3px 씩 261번 훑어서 잡았고 20px 로는 안 잡혔습니다.
 *      ★면제가 되살아나는지도 6절이 CSS 에서 직접 읽어 확인합니다★.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC_PATH = path.join(REPO, "js", "chart-drawings.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m" + "✓" + ESC + "[0m";
const NGM = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + OKM + " " + 제목); }
  else { fail++; console.log("  " + NGM + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

console.log("\n띄우는 함수는 전부 아래쪽 방어를 가진다 (js/chart-drawings.js)");

/* =====================================================================
 * [0] 준비 — 원본에서 함수와 상수를 글자 그대로 떼어낸다
 * ===================================================================== */
절("[0] 준비 — 원본에서 떼어내기");

function 함수떼기(name, src) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let k = src.indexOf("{", i);
  if (k < 0) return null;
  let depth = 0;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { k++; break; } }
  }
  return src.slice(i, k);
}

function 함수이름들(src) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}

function 상수(이름, 기본) {
  const m = new RegExp("var\\s+" + 이름 + "\\s*=\\s*(\\d+)\\s*;").exec(SRC);
  ok("상수 " + 이름 + " 를 원본에서 읽었다" + (m ? " (" + m[1] + ")" : ""), !!m,
    "이름이 바뀌었다면 이 파일도 같이 고쳐야 합니다");
  return m ? Number(m[1]) : 기본;
}

const CHIP_EDGE = 상수("CHIP_EDGE", 8);
const LIST_MAX_H = 상수("LIST_MAX_H", 240);
const LIST_ROW_H = 상수("LIST_ROW_H", 34);
/* 2026-09-03 수리팀 — 칩 글씨를 17px 로 올리면서 fitChip 이 쓰는 값이 늘었습니다 */
const CHIP_MIN_W = 상수("CHIP_MIN_W", 120);

/* 자리잡기 함수들이 같이 쓰는 도우미. 이게 없으면 떼어내도 못 돕니다 */
/* ⚠️ fitChip 이 늘었습니다 (2026-09-03) — placeChips 가 재기 전에 칩 폭을
   차트 칸 안으로 묶습니다. 여기 안 넣으면 떼어낸 placeChips 가 터집니다. */
const 도우미 = ["vpW", "vpH", "chipFloorY", "visibleBox", "putFixed", "fitChip"];
{
  const 없는것 = 도우미.filter((n) => !함수떼기(n, SRC));
  ok("도우미 " + 도우미.length + "개를 찾았다 (" + 도우미.join(" · ") + ")", 없는것.length === 0,
    "못 찾음: " + 없는것.join(", "));
}

/* =====================================================================
 * [1] ★자동 발견★ — putFixed 를 부르는 함수를 소스에서 직접 찾는다
 * ===================================================================== */
절("[1] 자동 발견 — 화면에 띄우는 함수를 소스에서 찾는다");

const 자리잡기 = 함수이름들(SRC).filter((n) => {
  if (n === "putFixed") return false;
  const b = 함수떼기(n, SRC);
  return !!b && b.indexOf("putFixed(") >= 0;
});

/* 2026-09-03 현재 알려진 것. ★새 함수가 생기면 여기서 빨개집니다★ —
   그때 할 일은 이 목록에 이름을 넣는 것이 아니라, 그 함수에 아래쪽 방어가
   있는지 보고(2·4·5절이 자동으로 검사합니다) 없으면 수리팀에 올리는 것입니다. */
const 알려진자리잡기 = ["placeChips", "placeToast", "placeStyle", "placeList"];
ok("putFixed 를 부르는 함수 " + 자리잡기.length + "개: " + 자리잡기.join(" · "),
  자리잡기.length >= 4, "하나도 못 찾았다면 putFixed 이름이 바뀐 것입니다");
ok("★알려진 " + 알려진자리잡기.length + "개와 같다 — 새로 생긴 것이 없다★",
  자리잡기.slice().sort().join(",") === 알려진자리잡기.slice().sort().join(","),
  "지금: " + 자리잡기.join(",") + " / 알려진: " + 알려진자리잡기.join(",") +
  "  → 새 함수가 생겼습니다. 아래 2·4·5절이 그 함수도 자동으로 검사합니다. " +
  "빨간 것이 이 줄 하나뿐이면 목록에 이름만 더하세요");

/* putFixed 를 안 쓰고 style.top 을 직접 정하는 함수도 세어 둡니다.
   이 둘은 화면(viewport)이 아니라 ★차트 칸 안 좌표★ 를 씁니다 —
   openFacePicker 는 아래쪽 방어가 있고(wr.height 로 막습니다),
   openTextInput 은 회원이 누른 자리에 붙는 입력칸이라 방어가 없습니다.
   ★새로 생기면 여기서 빨개져서 한 번은 사람이 보게 됩니다.★ */
const 칸좌표 = 함수이름들(SRC).filter((n) => {
  const b = 함수떼기(n, SRC);
  return !!b && n !== "putFixed" && /style\.top\s*=/.test(b) && b.indexOf("putFixed(") < 0;
});
ok("차트 칸 좌표로 띄우는 함수는 2개 그대로다 (" + 칸좌표.join(" · ") + ")",
  칸좌표.slice().sort().join(",") === "openFacePicker,openTextInput",
  "지금: " + 칸좌표.join(",") + " → 새로 생겼으면 아래쪽 방어가 있는지 사람이 보세요");
{
  const b = 함수떼기("openFacePicker", SRC) || "";
  ok("(견줌) openFacePicker 에는 아래쪽 방어가 있다 (wr.height 로 막는다)",
    /top\s*\+\s*bh\s*>\s*wr\.height/.test(b), "없어졌습니다");
}

/* 이 함수들이 쓰는 els.* 키를 모읍니다 — 가짜 요소를 만들 때 씁니다 */
function 쓰는요소(이름) {
  const b = 함수떼기(이름, SRC) || "";
  const out = [];
  const re = /els\.([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = re.exec(b))) if (out.indexOf(m[1]) < 0) out.push(m[1]);
  return out;
}
const 모든요소 = [];
자리잡기.forEach((n) => 쓰는요소(n).forEach((k) => { if (모든요소.indexOf(k) < 0) 모든요소.push(k); }));

/* ── 요소 크기표 ────────────────────────────────────────────────────────
 * ⚠️ 여기 숫자는 ★결과를 정하지 않습니다.★ 4절이 배수 1·2·3 으로 키를 늘려
 *    가며 재기 때문에, 정확한 실제 키를 몰라도 규칙이 깨지면 잡힙니다.
 *    (그래서 "실측이 아닌 값" 을 근거로 삼지 않습니다)
 *  키 근거
 *    list = 머리 70 + rows 102(3줄 x LIST_ROW_H) = 172  ← 2026-09-03 브라우저 실측
 *    toast = 90 (17px 글씨 세 줄. js/chart-drawings.js placeToast 주석의 실측)
 *    chip = 26 (한 줄. CSS 가 white-space:nowrap 이라 두 줄이 안 됩니다)
 *    stylePick = 143 (2026-09-03 수리팀 브라우저 실측. 줄일 곳이 없는 붙박이 창)
 *      ⚠️ 만들 때는 128 로 어림잡았다가 수리팀 실측값으로 바꿨습니다.
 *         결과는 둘 다 같았습니다 — 4절이 배수로 훑기 때문입니다. */
const 크기표 = {
  chip: { 키: 26, 폭: 200, 선택자: ".tl-draw-chip" },
  zoomChip: { 키: 26, 폭: 120, 선택자: ".tl-zoom-chip" },
  toast: { 키: 90, 폭: 314, 선택자: ".tl-draw-toast" },
  list: { 머리: 70, 폭: 360, 선택자: ".tl-draw-list" },
  listRows: { 키: 102, 폭: 344, 선택자: ".tl-draw-list .rows" },
  stylePick: { 키: 143, 폭: 300, 선택자: ".tl-style-pick" }
};
{
  const 모르는것 = 모든요소.filter((k) => !크기표[k]);
  ok("자리잡기 함수가 쓰는 요소 " + 모든요소.length + "개가 다 크기표에 있다 (" + 모든요소.join(" · ") + ")",
    모르는것.length === 0,
    "크기표에 없는 요소: " + 모르는것.join(", ") + " → 이 파일 크기표에 한 줄 더하세요");
  /* 크기표가 진짜 CSS 를 가리키는지 확인합니다 (선택자가 사라지면 빨개집니다) */
  const 없는선택자 = Object.keys(크기표).filter((k) => SRC.indexOf('"' + 크기표[k].선택자 + "{") < 0 &&
    SRC.indexOf(크기표[k].선택자 + "{") < 0);
  ok("크기표의 CSS 선택자가 전부 원본에 있다", 없는선택자.length === 0,
    "원본에 없는 선택자: " + 없는선택자.map((k) => 크기표[k].선택자).join(", "));
}

/* =====================================================================
 * [2] 구조 — 함수마다 "바닥" 을 보고 있는가
 * ===================================================================== */
절("[2] 구조 — 자리잡기 함수마다 바닥(bottom)을 본다");

자리잡기.forEach((n) => {
  const b = 함수떼기(n, SRC) || "";
  const 바닥언급 = (b.match(/\.bottom/g) || []).length + (b.match(/chipFloorY\s*\(/g) || []).length;
  ok(n + " — 바닥을 본다 (.bottom · chipFloorY 를 " + 바닥언급 + "번 씁니다)", 바닥언급 > 0,
    "★이 함수는 화면 바닥을 아예 안 봅니다.★ 폰에서 하단 매수·매도 바 밑으로 " +
    "내려가 단추가 안 눌립니다. placeToast 와 같은 방어를 넣어야 합니다");
});

/* =====================================================================
 * [3] 흉내 맞춰보기 — 브라우저 실측과 글자 그대로 같은가
 *     여기가 틀리면 4·5절은 다 헛것입니다
 * ===================================================================== */

/* 가짜 요소.
 *   · 자기 style.maxHeight / maxWidth 를 지킵니다
 *   · ★부모-자식★ — 키가 다른 키로 시작하면(list ← listRows) 자식입니다.
 *     자식이 줄어든 만큼 부모도 줄어듭니다. 진짜 DOM 이 그렇게 움직입니다. */
function 요소들만들기(keys, 배수, 표시) {
  const els = {};
  const 자식들 = (k) => keys.filter((o) => o !== k && o.indexOf(k) === 0);
  keys.forEach((k) => {
    const t = 크기표[k] || { 키: 100, 폭: 200 };
    const 바라는키 = (t.머리 || 0) + (t.키 || 0) * 배수 +
      자식들(k).reduce((s, c) => s + ((크기표[c] || {}).키 || 0) * 배수, 0);
    const e = {
      _키: k,
      style: { display: 표시, top: "", left: "", visibility: "" },
      get offsetHeight() {
        let h = 바라는키;
        자식들(k).forEach((c) => { h -= ((크기표[c] || {}).키 || 0) * 배수 - els[c].offsetHeight; });
        const mh = parseFloat(e.style.maxHeight);
        if (!isNaN(mh)) h = Math.min(h, mh);
        return Math.round(h);
      },
      get offsetWidth() {
        let w = t.폭 || 200;
        const mw = parseFloat(e.style.maxWidth);
        if (!isNaN(mw)) w = Math.min(w, mw);
        return Math.round(w);
      }
    };
    els[k] = e;
  });
  return els;
}

/** 자리잡기 함수 하나를 가짜 화면 위에서 실제로 돌립니다.
 *  ★계산은 원본에서 떼어낸 그대로입니다 — 이 파일이 다시 쓰지 않습니다.★ */
function 돌리기(대상, 화면, 배수, 표시, 소스변형) {
  const els = 요소들만들기(모든요소, 배수, 표시);
  const 바 = 화면.바
    ? { getBoundingClientRect: () => ({ top: 화면.바.top, bottom: 화면.h, height: 화면.바.height }),
        __display: "block" }
    : null;
  const sb = {
    window: { innerWidth: 화면.w, innerHeight: 화면.h,
      getComputedStyle: (el) => ({ display: el.__display }) },
    document: { documentElement: { clientWidth: 화면.w, clientHeight: 화면.h },
      fullscreenElement: null, webkitFullscreenElement: null,
      querySelector: (s) => (s === ".tl-order-bar" ? 바 : null) },
    wrap: { getBoundingClientRect: () => 화면.wrap },
    els: els,
    console: { warn() {}, log() {} }
  };
  vm.createContext(sb);
  let code = "var CHIP_EDGE=" + CHIP_EDGE + ";var CHIP_MIN_W=" + CHIP_MIN_W + ";var LIST_MAX_H=" + LIST_MAX_H +
    ";var LIST_ROW_H=" + LIST_ROW_H + ";\n" + 도우미.map((n) => 함수떼기(n, SRC)).join("\n") + "\n";
  자리잡기.forEach((n) => {
    let t = 함수떼기(n, SRC);
    if (소스변형 && n === 대상) t = 소스변형(t);
    code += t + "\n";
  });
  vm.runInContext(code, sb, { filename: "떼어낸-자리잡기.js" });
  const vis = sb.visibleBox();
  /* 실제 순서대로 — placeSoon 은 placeChips 를 먼저 부릅니다.
     placeStyle · placeList 가 칩의 top 을 읽기 때문에 순서가 중요합니다 */
  sb.placeChips();
  if (대상 !== "placeChips") sb[대상]();
  const 잰것 = [];
  모든요소.forEach((k) => {
    const e = els[k];
    if (e.style.top === "" || e.style.visibility === "hidden") return;
    const 위 = parseFloat(e.style.top);
    잰것.push({ 키: k, 위: 위, 키높이: e.offsetHeight, 아래: 위 + e.offsetHeight,
      왼: parseFloat(e.style.left), 폭: e.offsetWidth });
  });
  return { vis: vis, 잰것: 잰것 };
}

/* 화면 7개.
 *   앞 6개는 2026-09-03 수리팀이 브라우저로 잰 ★폭마다 최악인 스크롤 자리★ 입니다
 *   (tests/chart-draw-list-fit.test.js 와 같은 값 — 두 벌로 적지 않으려고
 *    그대로 옮겨 왔습니다. 그 파일이 브라우저 실측과 대조하는 원본입니다)
 *   마지막 "넉넉" 은 평소 자리입니다 — 좁을 때만 맞추고 평소를 깨뜨리지 않게. */
const 화면들 = [
  { 이름: "360·y=50", w: 360, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 345 }, 바: { top: 727, height: 73 } },
  { 이름: "375·y=50", w: 375, h: 800, wrap: { top: 666, bottom: 1226, left: 15, right: 360 }, 바: { top: 727, height: 73 } },
  { 이름: "390·y=25", w: 390, h: 800, wrap: { top: 660, bottom: 1220, left: 15, right: 375 }, 바: { top: 727, height: 73 } },
  { 이름: "768·y=100", w: 768, h: 800, wrap: { top: 737, bottom: 1430, left: 83, right: 753 }, 바: null },
  { 이름: "1440·y=0", w: 1440, h: 800, wrap: { top: 745, bottom: 1734, left: 83, right: 799 }, 바: null },
  { 이름: "1920·y=25", w: 1920, h: 800, wrap: { top: 739, bottom: 1727, left: 83, right: 815 }, 바: null },
  { 이름: "넉넉(평소)", w: 1440, h: 900, wrap: { top: 100, bottom: 850, left: 83, right: 799 }, 바: null }
];

절("[3] 흉내 맞춰보기 — 2026-09-03 브라우저 실측과 같은가");
{
  /* 수리팀이 브라우저에서 잰 값 (그린 것 3개 · 고친 뒤).
     흉내가 이 값을 그대로 못 내면 아래 검사는 믿을 수 없습니다. */
  const 실측 = [
    { 화면: "360·y=50", 위: 615, 아래: 719, 왼: 23, 폭: 314 },
    { 화면: "375·y=50", 위: 615, 아래: 719, 왼: 23, 폭: 329 },
    { 화면: "390·y=25", 위: 615, 아래: 719, 왼: 23, 폭: 344 },
    { 화면: "768·y=100", 위: 688, 아래: 792, 왼: 91, 폭: 360 },
    { 화면: "1440·y=0", 위: 688, 아래: 792, 왼: 91, 폭: 360 },
    { 화면: "1920·y=25", 위: 688, 아래: 792, 왼: 91, 폭: 360 }
  ];
  실측.forEach((c) => {
    const 화면 = 화면들.filter((s) => s.이름 === c.화면)[0];
    const r = 돌리기("placeList", 화면, 1, "flex");
    const x = r.잰것.filter((e) => e.키 === "list")[0];
    ok(c.화면 + " — 목록 자리가 실측과 같다 (" + c.위 + "~" + c.아래 + " · 왼 " + c.왼 + " · 폭 " + c.폭 + ")",
      !!x && x.위 === c.위 && x.아래 === c.아래 && x.왼 === c.왼 && x.폭 === c.폭,
      x ? "흉내 " + x.위 + "~" + x.아래 + " 왼" + x.왼 + " 폭" + x.폭 : "안 놓였습니다");
  });
}

/* =====================================================================
 * [4] 행동 — 함수 전부를 7개 화면 x 키 배수 3가지로 실제로 돌린다
 * ===================================================================== */
절("[4] 행동 — 어느 함수도 화면 바닥·주문 막대 밑으로 안 내려간다");

/* 접히지 않는(=칸보다 커질 수 없는) 요소. 근거는 6절이 CSS 에서 읽어 확인합니다.
 *
 * ⚠️ 2026-09-03 수리팀 — ★flex-wrap:wrap 을 같이 봅니다★.
 *   전에는 white-space:nowrap 하나만 보고 "이 칩은 한 줄이라 칸보다 커질 수
 *   없다" 고 면제해 줬습니다. 대표 지시로 칩 글씨를 11 -> 17px 로 올리면서
 *   칩이 차트 칸보다 넓어져(360 실측 409.9px) flex-wrap:wrap 을 넣었습니다.
 *   이제 칩은 ★두 줄이 됩니다★ — nowrap 은 남아 있지만 그건 낱말이 갈리는
 *   것을 막을 뿐이고, 단추 단위로는 접힙니다.
 *   nowrap 만 보고 그대로 두면 이 봉인이 ★칩을 계속 면제★ 해서,
 *   실제로 났던 「주문 막대 밑 8.2px」 를 못 잡습니다.
 *   (360 · 스크롤 44 · 3px 씩 261번 훑어서 잡았습니다. 20px 로는 안 잡혔습니다) */
function 안접힘(키) {
  const t = 크기표[키];
  if (!t) return false;
  const i = SRC.indexOf('"' + t.선택자 + "{");
  if (i < 0) return false;
  const 규칙 = SRC.slice(i, i + 400);
  if (규칙.indexOf("flex-wrap:wrap") >= 0) return false; /* 접힙니다 — 면제 없음 */
  return 규칙.indexOf("white-space:nowrap") >= 0;
}

const 배수들 = [1, 2, 3];
자리잡기.forEach((n) => {
  let 잰횟수 = 0;
  let 넘친것 = [];
  let 위로나간것 = [];
  let 큰창넘침 = [];
  화면들.forEach((화면) => {
    배수들.forEach((배수) => {
      /* display 를 뭐라고 켜는지는 함수마다 다릅니다(flex · block).
         둘 다 태워 보고 ★실제로 놓인 쪽★ 만 셉니다 — 새 함수가 생겨도 됩니다 */
      ["flex", "block"].forEach((표시) => {
        const r = 돌리기(n, 화면, 배수, 표시);
        r.잰것.forEach((x) => {
          /* placeChips 는 늘 먼저 돌기 때문에 대상 함수가 안 건드린 칩도 잡힙니다.
             그건 placeChips 차례에 이미 세므로 여기서는 대상 함수가 쓰는 것만 봅니다 */
          if (쓰는요소(n).indexOf(x.키) < 0) return;
          if (n !== "placeChips" && (x.키 === "chip" || x.키 === "zoomChip")) return;
          잰횟수++;
          const 칸키 = r.vis.bottom - r.vis.top;
          const 넘침 = x.아래 - r.vis.bottom;
          const 딱지 = 화면.이름 + " x" + 배수 + " " + x.키 + "(키 " + x.키높이 + ")";
          if (넘침 > 0) {
            if (x.키높이 <= 칸키) 넘친것.push(딱지 + " 넘침 " + 넘침 + "px");
            else if (!안접힘(x.키)) 큰창넘침.push(딱지 + " 넘침 " + 넘침 + "px (칸 " + 칸키 + ")");
          }
          if (x.위 < CHIP_EDGE) 위로나간것.push(딱지 + " 위끝 " + x.위);
        });
      });
    });
  });
  ok(n + " — " + 잰횟수 + "번 재서 ★창이 칸보다 작을 때★ 한 번도 안 넘쳤다",
    넘친것.length === 0, 넘친것.slice(0, 4).join(" / "));
  ok(n + " — ★창이 칸보다 클 때도★ 안 넘쳤다 (접히는 창만 해당)",
    큰창넘침.length === 0,
    "★아래쪽 방어가 없습니다★ — " + 큰창넘침.slice(0, 4).join(" / ") +
    "  placeToast 처럼 [위 막기 → 아래 막기 → 화면 위끝(CHIP_EDGE) 막기] 차례로 넣어야 합니다");
  ok(n + " — 화면 위(" + CHIP_EDGE + "px)로도 안 나갔다", 위로나간것.length === 0,
    위로나간것.slice(0, 4).join(" / "));
});

/* 놓인 것이 하나도 없으면 위 검사는 전부 공짜로 통과합니다 — 그물을 답니다 */
{
  let 총잰횟수 = 0;
  자리잡기.forEach((n) => {
    화면들.forEach((화면) => ["flex", "block"].forEach((표시) => {
      총잰횟수 += 돌리기(n, 화면, 1, 표시).잰것.length;
    }));
  });
  ok("★검사가 헛돌지 않았다★ — 실제로 놓인 창을 " + 총잰횟수 + "번 쟀다", 총잰횟수 >= 30,
    "너무 적습니다. display 조건이 바뀌어 아무것도 안 놓였을 수 있습니다");
}

/* =====================================================================
 * [5] ★돌연변이★ — 바닥을 안 보게 만들면 반드시 넘쳐야 한다
 * ===================================================================== */
절("[5] 돌연변이 — 바닥(.bottom)을 못 보게 하면 반드시 넘친다");

/* 사본만 고칩니다. ★원본 파일은 안 건드립니다★ (지금 다른 팀이 잡고 있습니다)
   바닥 값을 ★아주 아래(1e9)★ 로 바꿔 "바닥이 없는 셈" 으로 만듭니다.
   [주의] 처음에 undefined 로 바꿨더니 계산이 NaN 이 되고, NaN 비교는 늘 거짓이라
   ★안 넘친 것처럼 보였습니다.★ 그 상태로 뒀으면 placeChips 검사가 통째로
   헛것이 될 뻔했습니다 (2026-09-03 만드는 중에 잡았습니다). */
function 바닥지우기(본문) {
  return 본문
    .replace(/\b[A-Za-z_$][\w$]*\.bottom\b/g, "(1e9)")
    .replace(/chipFloorY\s*\(\s*\)/g, "(1e9)");
}
자리잡기.forEach((n) => {
  let 넘친적 = 0;
  let 잰적 = 0;
  let 숫자아님 = 0;
  화면들.forEach((화면) => {
    배수들.forEach((배수) => {
      ["flex", "block"].forEach((표시) => {
        let r;
        try {
          r = 돌리기(n, 화면, 배수, 표시, 바닥지우기);
        } catch (e) { return; }
        const 정상 = 돌리기(n, 화면, 배수, 표시);
        r.잰것.forEach((x) => {
          if (쓰는요소(n).indexOf(x.키) < 0) return;
          if (n !== "placeChips" && (x.키 === "chip" || x.키 === "zoomChip")) return;
          const 성한것 = 정상.잰것.filter((e) => e.키 === x.키)[0];
          잰적++;
          if (!isFinite(x.아래)) { 숫자아님++; return; }
          /* ★성한 코드가 이미 넘치는 자리는 돌연변이 검증이 성립하지 않습니다.★
             (고장난 채로 "바꿔도 넘친다" 는 아무것도 증명하지 못합니다) */
          if (!성한것 || 성한것.아래 > 정상.vis.bottom) return;
          if (x.아래 > 정상.vis.bottom) 넘친적++;
        });
      });
    });
  });
  ok(n + " — 바닥을 못 보게 하면 넘친다 (" + 잰적 + "번 중 " + 넘친적 + "번)", 넘친적 > 0,
    "★이 봉인이 이 함수에 대해서는 아무것도 안 지키고 있습니다.★ 둘 중 하나입니다 — " +
    "① 바닥을 지워도 결과가 같다(애초에 바닥을 안 봅니다) " +
    "② 성한 코드가 이미 넘치고 있어서 견줄 것이 없다(4절이 같이 빨갛습니다)");
  ok(n + " — 돌연변이가 숫자를 망가뜨리지 않았다 (NaN " + 숫자아님 + "번)", 숫자아님 === 0,
    "NaN 이 나오면 비교가 늘 거짓이라 ★안 넘친 것처럼 보입니다★ — 돌연변이 방식을 고쳐야 합니다");
});

/* 반대쪽 그물 — 지금 소스로는 4절이 통과해야 합니다(위에서 이미 봤습니다).
   여기서는 "고친 함수" 인 placeList 가 정말로 아래쪽 방어 덕에 통과하는지
   ★그 한 줄만 지워서★ 확인합니다. 한 줄의 값을 재는 것이 아니라
   ★그 줄이 있고 없고로 결과가 달라지는지★ 를 봅니다. */
{
  const 한줄지우기 = (본문) =>
    본문.replace(/\n\s*if \(top \+ box\.offsetHeight > vis\.bottom\)[^\n]*\n/, "\n");
  const 화면 = 화면들[0];
  const 전 = 돌리기("placeList", 화면, 1, "flex", 한줄지우기);
  const 후 = 돌리기("placeList", 화면, 1, "flex");
  const a = 전.잰것.filter((e) => e.키 === "list")[0];
  const b = 후.잰것.filter((e) => e.키 === "list")[0];
  ok("placeList 의 아래 막는 한 줄을 지우면 값이 달라진다 (" +
    (a ? a.위 + "~" + a.아래 : "?") + " -> " + (b ? b.위 + "~" + b.아래 : "?") + ")",
    !!a && !!b && a.아래 !== b.아래,
    "그 줄이 아무 일도 안 하고 있습니다 — 방어가 다른 곳에서 되고 있거나, 줄 모양이 바뀌었습니다");
}

/* =====================================================================
 * [6] ★면제가 없어졌습니다★ — 칩도 4절 ㉯ 를 그대로 받습니다
 * ---------------------------------------------------------------------
 * 2026-09-03 수리팀. 대표가 네 번째로 "팝업창 글씨가 안 보인다" 고 하셔서
 * 칩 글씨를 11 -> 17px 로 올렸습니다. 그러면서 칩이 차트 칸보다 넓어져
 * flex-wrap:wrap 으로 두 줄이 됐고, ★면제의 근거가 사라졌습니다★.
 *
 * 그때 실제로 이런 일이 났습니다 (고치기 전 실측) —
 *   360 · 스크롤 44 에서 보이는 칸이 47px 밖에 안 남는데 칩은 63.2px 이라,
 *   placeChips 의 위 막기가 칩을 도로 아래로 밀어
 *   ★하단 매수·매도 바 밑으로 8.2px★ 내려갔습니다 (44 · 47 · 50 세 자리).
 *   ⚠️ 20px 씩 훑었을 때는 한 번도 안 잡혔습니다. 3px 로 훑어야 나왔습니다.
 *
 * 그래서 이 절은 이제 ★면제가 다시 살아나지 않는지★ 를 봅니다.
 * ===================================================================== */
절("[6] 면제가 없어졌다 — 칩도 아래 막기를 받는다");
["chip", "zoomChip"].forEach((k) => {
  ok(크기표[k].선택자 + " 는 이제 면제가 아니다 (flex-wrap:wrap 이라 접힙니다)",
    !안접힘(k),
    "★면제가 되살아났습니다.★ 글씨를 줄이거나 flex-wrap 을 지워 면제로 돌아가면 " +
    "대표가 다섯 번째로 '글씨가 안 보인다' 고 하십니다. 줄 수로 푸세요");
});
{
  /* 4절이 칩을 진짜로 재고 있는지 — 면제였을 때는 안 재고 넘어갔습니다 */
  const r = 돌리기("placeChips", 화면들[0], 3, "flex");
  const x = r.잰것.filter((e) => e.키 === "chip")[0];
  ok("칩이 세 줄(키 " + (x ? x.키높이 : "?") + ")이 되어도 주문 막대 밑으로 안 내려간다",
    !!x && x.아래 - r.vis.bottom <= 0,
    x ? (x.아래 - r.vis.bottom) + "px 내려갔습니다 — placeChips 의 아래 막기를 확인하세요" : "칩을 못 쟀습니다");
  /* ⚠️ 정규식 대신 글자 찾기를 씁니다 — 이 파일은 여러 손을 거치면서
     역슬래시가 한 번 날아간 적이 있습니다(2026-09-03). 글자 찾기는 안 날아갑니다 */
  const 아래막기A = "if (ay + a.offsetHeight > box.bottom) ay = box.bottom - a.offsetHeight;";
  const 아래막기B = "if (by + b.offsetHeight > box.bottom) by = box.bottom - b.offsetHeight;";
  const 위끝막기A = "if (ay < CHIP_EDGE) ay = CHIP_EDGE;";
  const 위끝막기B = "if (by < CHIP_EDGE) by = CHIP_EDGE;";
  ok("placeChips 안에 아래 막기 두 줄이 있다 (그린 것 칩 · 확대 칩)",
    SRC.indexOf(아래막기A) >= 0 && SRC.indexOf(아래막기B) >= 0,
    "아래 막기가 없어졌습니다 — placeToast · placeStyle 과 같은 차례로 넣으세요");
  ok("아래 막기 ★뒤에★ 화면 위끝(CHIP_EDGE) 막기가 온다",
    SRC.indexOf(위끝막기A) > SRC.indexOf(아래막기A) &&
    SRC.indexOf(위끝막기B) > SRC.indexOf(아래막기B),
    "차례가 다릅니다 — [위 막기 -> 아래 막기 -> 화면 위끝] 이어야 합니다");
}
/* =====================================================================
 * [7] 등록 — 이 파일이 npm test 로 실제로 돌아가는가
 * ===================================================================== */
절("[7] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-place-bottom-guard-seal.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 을 안 쓰지만 규칙대로 명시적으로 끝냅니다 */
process.exit(0);
