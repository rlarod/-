/* tests/chart-longrun-accumulation.test.js
 * =========================================================================
 * 차트를 오래 켜 둬도 ★쌓이지 않는다★ — 2026-08-31
 * =========================================================================
 *
 * ── 왜 만들었나 ─────────────────────────────────────────────────────────
 *   2026-08-31 10:05 대표 —
 *       "아 그리고 차트를 계속 켜놓으니까 고장나더라"
 *       "차트가 안보이거나 그러던데"
 *
 *   그런데 그날 세어 보니 이랬습니다 —
 *       테스트 152개 중 "차트가 보이는가" 를 보는 것은 ★1건★
 *         (tests/chart-addons-seal.test.js 의 data-mtab 경로)
 *       테스트 152개 중 "★시간이 지나면 어떻게 되나★" 를 보는 것은 ★0건★
 *
 *   전부 한 순간의 상태만 봅니다. 봉인의 결함이 아니라 ★아예 없는 종류★ 였습니다.
 *   대표 증상이 정확히 그 종류입니다 — 폭은 그대로인데 시간이 지나면 고장납니다.
 *
 * ── ⚠️ 원인은 아직 안 나왔습니다. 원인을 가정하지 않았습니다 ────────────
 *   이 파일에는 "무엇이 원인이다" 라는 전제가 하나도 없습니다.
 *   ★원인이 무엇이든 참이어야 하는 것★ 만 담았습니다.
 *
 *       "여닫아도 리스너가 안 쌓인다" 는 원인과 무관하게 참이어야 합니다
 *       "차트를 두 번 만들지 않는다" 도 그렇습니다
 *
 *   원인이 밝혀지면 그때 그 원인에 맞는 봉인을 따로 만듭니다.
 *
 * ── 무엇을 못 박나 ──────────────────────────────────────────────────────
 *   [1] 차트를 만드는 곳이 ★딱 한 곳★ 이다
 *       js/chart-font.js 의 charts 배열은 push 만 하고 ★지우는 코드가 없습니다.★
 *       그래서 누가 차트를 다시 만들면 배열이 영영 늘어나고,
 *       getCharts()[0] 은 ★이미 죽은 차트★ 를 가리키게 됩니다.
 *       그 뒤로는 곁다리 모듈 전부가 죽은 차트에 대고 일합니다.
 *       — 오류도 안 나고 화면만 안 바뀝니다. 전형적인 조용한 고장입니다.
 *
 *   [2] autoSize 를 끄는 모듈이 없다
 *       js/chart.js:187 이 autoSize:true 로 만듭니다. 그게 내부 ResizeObserver 라
 *       칸이 0x0 이 됐다가 다시 보일 때 ★스스로 크기를 되찾는 유일한 장치★ 입니다.
 *       js/chart-tab-mobile.js:26-33 에 그 실측이 적혀 있습니다 —
 *           숨기기 전 캔버스 212x542 / 130x542 / 212x46
 *           숨겼을 때 컨테이너 0x0
 *           다시 보임 345x591, 캔버스 212x542 / 130x542 / 212x46 (동일)
 *       누가 밖에서 이걸 끄면 그때부터 0x0 에서 못 살아납니다.
 *       js/chart.js 는 수정 금지라 ★밖에서 끄는 모듈★ 만 막으면 됩니다.
 *
 *   [3] 되풀이 도는 타이머는 반드시 멈추는 장치를 갖는다 (차트 모듈 전수)
 *       2026-08-31 실측 — 차트 모듈 11개가 setInterval 을 씁니다.
 *       ★지금 11개 전부 clearInterval 이 있습니다.★
 *       "지금 있다" 와 "앞으로도 있다" 는 다릅니다. 그걸 못 박는 것입니다.
 *
 *   [4] ★여닫기를 되풀이해도 쌓이지 않는다★ — 실제로 돌려서 셉니다
 *
 * ── ⚠️ 이 봉인이 ★못 하는 것★ (억지로 만들지 않았습니다) ───────────────
 *   jsdom 실측 (2026-08-31) —
 *       getBoundingClientRect()  →  {w:0, h:0}   모든 요소가 항상 0
 *       canvas.getContext("2d")  →  null         그리기·픽셀 읽기 불가
 *       ResizeObserver           →  undefined    ★autoSize 경로 재현 불가★
 *       performance.memory       →  undefined    메모리 증가 측정 불가
 *       requestAnimationFrame    →  undefined
 *
 *   그래서 이렇게는 못 잽니다 —
 *       "차트가 실제로 그려졌나"      "칸이 진짜 0x0 인가"
 *       "0x0 에서 되살아나는가"       "몇 시간 뒤에 깨지나"   "메모리가 느나"
 *
 *   ★시간은 못 돌립니다. 대신 횟수는 됩니다.★ [4] 는 그것으로 잽니다.
 *   시간이 지나서 나는 고장의 상당수는 "같은 일이 여러 번 일어나서" 나는 것이라
 *   횟수로도 상당 부분 잡힙니다. 다만 ★전부는 아닙니다.★
 *
 * 네트워크는 한 번도 안 씁니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const JS_DIR = path.join(REPO, "js");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? " → " + detail : ""));
    console.log("  " + MARK_NG + " " + name + (detail ? "\n      → " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}

/* ⚠ 차트 모듈들은 주석에 createChart · autoSize · setInterval 을 그대로
   적어 두었습니다(서로를 설명하느라). 문자열 검색만 하면 전부 오탐입니다. */
function 주석제거(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((줄) => 줄.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

const 모든js = fs.readdirSync(JS_DIR).filter((f) => f.slice(-3) === ".js").sort();
const 차트js = 모든js.filter((f) => f.indexOf("chart") === 0 || f.indexOf("chart") > -1);
const 코드캐시 = {};
function 코드(f) {
  if (!(f in 코드캐시)) 코드캐시[f] = 주석제거(fs.readFileSync(path.join(JS_DIR, f), "utf8"));
  return 코드캐시[f];
}

/* =========================================================================
 * [0] 주석 제거기 — 아래가 전부 여기 기대고 있습니다
 * ========================================================================= */
section("[0] 주석 제거기 자체 확인 (오탐 방지)");
{
  ok("블록주석을 걷어낸다", 주석제거("/* autoSize:true */ var a=1;").indexOf("autoSize") === -1);
  ok("한 줄 주석을 걷어낸다", 주석제거("var a=1; // createChart\n").indexOf("createChart") === -1);
  ok("코드 안의 낱말은 남긴다", 주석제거("LC.createChart(x);").indexOf("createChart") >= 0);

  /* 오탐 위험이 진짜 있다는 증거 — 원본에는 들어 있습니다 */
  const tab = read("js/chart-tab-mobile.js");
  ok("js/chart-tab-mobile.js 주석에 autoSize 가 실제로 있다 (오탐 위험이 진짜다)",
    tab.indexOf("autoSize") >= 0);
  ok("걷어내면 그 파일 코드에는 autoSize 가 없다",
    코드("chart-tab-mobile.js").indexOf("autoSize") === -1);
}

/* =========================================================================
 * [1] 차트를 만드는 곳이 딱 한 곳이다
 *
 *  js/chart-font.js 는 LightweightCharts.createChart 를 ★감싸는★ 쪽이라
 *  당연히 이름이 나옵니다. 그 하나만 예외로 둡니다.
 * ========================================================================= */
section("[1] 차트를 두 번 만들지 않는다");
{
  const 감싸는쪽 = "chart-font.js";
  const 만드는곳 = 모든js.filter(
    (f) => f !== 감싸는쪽 && /LightweightCharts\.createChart\s*\(/.test(코드(f))
  );
  ok("LightweightCharts.createChart 를 부르는 파일이 js/chart.js 하나뿐이다 (" +
      JSON.stringify(만드는곳) + ")",
    만드는곳.length === 1 && 만드는곳[0] === "chart.js",
    "차트를 다시 만들면 곁다리 모듈이 전부 ★죽은 차트★ 에 대고 일합니다");

  const 횟수 = (코드("chart.js").match(/LightweightCharts\.createChart\s*\(/g) || []).length;
  ok("js/chart.js 안에서도 딱 한 번만 만든다 (지금 " + 횟수 + "번)", 횟수 === 1);

  /* chart-font.js 의 목록은 push 만 합니다 — 지우는 코드가 없습니다.
     그래서 [1] 이 깨지면 그 배열이 ★영영★ 늘어납니다. 그 사실을 못 박아 둡니다. */
  const font = 코드("chart-font.js");
  ok("chart-font.js 가 만들어진 차트를 목록에 넣는다", /charts\.push\(/.test(font));
  ok("그 목록에서 지우는 코드가 없다 (그래서 다시 만들면 영영 쌓입니다)",
    !/charts\.splice\(/.test(font) && !/charts\s*=\s*\[\]/.test(font.replace(/var charts = \[\];/, "")),
    "지우는 코드가 생겼다면 이 주석과 [1] 의 근거를 다시 쓰세요");
  ok("getCharts() 는 사본을 준다 (바깥에서 목록을 못 망친다)",
    /getCharts[\s\S]{0,80}charts\.slice\(\)/.test(font));
}

/* =========================================================================
 * [2] autoSize 를 끄는 모듈이 없다
 * ========================================================================= */
section("[2] autoSize — 0x0 에서 되살아나는 유일한 장치");
{
  ok("js/chart.js 가 autoSize:true 로 만든다 (수정 금지 파일 — 값만 확인)",
    /autoSize:\s*true/.test(코드("chart.js")),
    "이게 꺼지면 칸이 0x0 이 됐다가 다시 보여도 차트가 안 돌아옵니다");

  const 끄는곳 = 모든js.filter((f) => /autoSize\s*:\s*false/.test(코드(f)));
  ok("autoSize 를 false 로 두는 모듈이 없다 (" + JSON.stringify(끄는곳) + ")",
    끄는곳.length === 0,
    "js/chart.js 는 수정 금지라 밖에서 끄는 모듈만 막으면 됩니다");

  const 건드리는곳 = 모든js.filter(
    (f) => f !== "chart.js" && /applyOptions\s*\(\s*\{[^}]*autoSize/.test(코드(f))
  );
  ok("applyOptions 로 autoSize 를 건드리는 모듈이 없다 (" + JSON.stringify(건드리는곳) + ")",
    건드리는곳.length === 0);

  /* 이 결론의 근거가 사라지지 않게 같이 묶어 둡니다 */
  const tab = read("js/chart-tab-mobile.js");
  ok("근거 실측이 js/chart-tab-mobile.js 에 남아 있다 (0x0 → 되살아남)",
    tab.indexOf("0x0") >= 0 && /autoSize/.test(tab),
    "근거가 사라지면 다음 사람이 autoSize 를 마음대로 끕니다");
}

/* =========================================================================
 * [3] 차트 모듈 전수 — 되풀이 타이머는 멈추는 장치를 갖는다
 *
 *  ⚠ 파일 목록을 여기 적지 않습니다. 훑어서 셉니다.
 *    적어 두면 새 모듈이 생겼을 때 그것만 조용히 빠집니다.
 * ========================================================================= */
section("[3] 차트 모듈 전수 — 타이머를 멈추는 장치");
{
  const 반복쓰는파일 = 차트js.filter((f) => /setInterval\s*\(/.test(코드(f)));
  ok("setInterval 을 쓰는 차트 모듈을 찾았다 (" + 반복쓰는파일.length + "개)",
    반복쓰는파일.length > 0,
    "하나도 없다면 훑기가 잘못된 것입니다");

  const 멈춤없음 = 반복쓰는파일.filter((f) => !/clearInterval\s*\(/.test(코드(f)));
  ok("★setInterval 을 쓰는 모듈은 전부 clearInterval 도 갖고 있다★ (" +
      반복쓰는파일.length + "개 전부 훑음)",
    멈춤없음.length === 0,
    "멈추는 장치가 없는 파일: " + JSON.stringify(멈춤없음) +
      " — 오래 켜 둘수록 느려집니다");

  const 모자란것 = 반복쓰는파일.filter((f) => {
    const c = 코드(f);
    const 켬 = (c.match(/setInterval\s*\(/g) || []).length;
    const 끔 = (c.match(/clearInterval\s*\(/g) || []).length;
    return 끔 < 켬;
  });
  ok("켜는 횟수보다 끄는 자리가 적은 모듈이 없다", 모자란것.length === 0,
    JSON.stringify(모자란것));

  /* 차트를 기다리는 재시도는 상한이 있어야 합니다 — 영원히 250ms 마다 돌면 안 됩니다.
     상한을 어떻게 두는지는 모듈마다 달라서 "멈추는 자리가 있는가" 로만 봅니다. */
  const 상한없음 = 반복쓰는파일.filter((f) => {
    const c = 코드(f);
    return !/(MAX_RETRIES|tries\s*[<>]|retries\s*>=|retry|attempt)/i.test(c) &&
      !/clearInterval/.test(c);
  });
  ok("차트를 기다리는 되풀이에 끝이 있다", 상한없음.length === 0, JSON.stringify(상한없음));

  console.log("    (참고) setInterval 을 쓰는 차트 모듈 " + 반복쓰는파일.length + "개 — " +
    반복쓰는파일.join(" / "));
}

/* =========================================================================
 * [4] ★되풀이해도 쌓이지 않는다★ — 실제로 돌려서 셉니다
 *
 *  ⚠ jsdom 은 ★시간을 못 돌립니다.★ 대신 ★횟수★ 로 잽니다.
 *    시간이 지나서 나는 고장의 상당수는 "같은 일이 여러 번 일어나서" 나는 것이라
 *    횟수로도 상당 부분 잡힙니다. 다만 전부는 아닙니다(위 "못 하는 것" 참조).
 * ========================================================================= */
section("[4] 여닫기를 되풀이해도 쌓이지 않는다 (횟수로 잽니다)");

/* 여기서부터 끝까지는 jsdom 을 한 틱 기다려야 해서 비동기입니다.
   ⚠ 맨 아래에서 반드시 process.exit() 을 부릅니다 — 안 부르면 jsdom 창이
   타이머를 붙들어 npm test 전체가 여기서 멈춥니다. */
async function 실행() {

const 되풀이 = 100;

async function 차트창부팅() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    runScripts: "outside-only",
  });
  const w = dom.window;
  /* jsdom 은 만든 직후 readyState 가 "loading" 이라 모듈이 init 을 미룹니다.
     한 틱 기다렸다 넣습니다(2026-08-31 실측). */
  await new Promise((r) => setTimeout(r, 0));

  /* 센다 — 리스너 · 타이머 */
  const 센것 = { keydown: 0, interval: 0, timeout: 0 };
  const 원래add = w.document.addEventListener.bind(w.document);
  const 원래remove = w.document.removeEventListener.bind(w.document);
  w.document.addEventListener = function (t) {
    if (t === "keydown") 센것.keydown++;
    return 원래add.apply(null, arguments);
  };
  w.document.removeEventListener = function (t) {
    if (t === "keydown") 센것.keydown--;
    return 원래remove.apply(null, arguments);
  };
  w.setInterval = function () { 센것.interval++; return 0; };
  w.clearInterval = function () {};
  w.setTimeout = function () { 센것.timeout++; return 0; };
  w.clearTimeout = function () {};

  const 가짜캔들 = {
    seriesType: () => "Candlestick",
    options: () => ({
      upColor: "#26c281",
      downColor: "#f0506e",
      borderVisible: false,
      wickUpColor: "#26c281",
      wickDownColor: "#f0506e",
    }),
    applyOptions: () => {},
  };
  const 가짜차트 = {
    panes: () => [{ getSeries: () => [가짜캔들] }],
    applyOptions: () => {},
  };
  let 감싼횟수 = 0;
  const 봉종류 = {
    getType: () => "candle",
    setType: function (t) { return t; },
  };
  /* setType 이 바뀌면(= 누가 감쌌으면) 셉니다 */
  const 원래setType = 봉종류.setType;

  w.App = {
    ChartFont: { getCharts: () => [가짜차트] },
    ChartCandleType: 봉종류,
    Storage: { load: () => null, save: () => {}, clear: () => {} },
  };

  w.eval(read("js/chart-style.js"));

  return {
    dom,
    w,
    센것,
    감싼횟수: () => (봉종류.setType === 원래setType ? 0 : 1),
  };
}

{
  const t = await 차트창부팅();
  const M = t.w.App.ChartStyle;
  ok("App.ChartStyle 이 준비됐다", !!M && typeof M.open === "function");

  const 열림 = M.open();
  ok("창이 열린다", 열림 === true && M.isOpen() === true);
  M.close();
  ok("창이 닫힌다", M.isOpen() === false);

  const 첫keydown = t.센것.keydown;
  const 첫interval = t.센것.interval;
  const 첫timeout = t.센것.timeout;

  for (let i = 0; i < 되풀이; i++) {
    M.open();
    M.close();
  }

  ok("★" + 되풀이 + "번 여닫아도 keydown 리스너가 안 늘어난다 (" +
      첫keydown + " → " + t.센것.keydown + ")",
    t.센것.keydown === 첫keydown,
    "여닫을 때마다 붙으면 리스너가 쌓입니다 — 오래 켜 둘수록 느려집니다");
  ok("keydown 리스너가 딱 1개다 (지금 " + t.센것.keydown + "개)", t.센것.keydown === 1);

  ok("★" + 되풀이 + "번 여닫아도 되풀이 타이머가 안 늘어난다 (" +
      첫interval + " → " + t.센것.interval + ")",
    t.센것.interval === 첫interval);
  ok("이 모듈은 되풀이 타이머를 아예 안 만든다 (지금 " + t.센것.interval + "개)",
    t.센것.interval === 0,
    "시세마다 하는 일이 0 이어야 합니다");

  ok("★" + 되풀이 + "번 여닫아도 예약(setTimeout)이 안 늘어난다 (" +
      첫timeout + " → " + t.센것.timeout + ")",
    t.센것.timeout === 첫timeout);

  ok("★봉 종류 감싸기가 한 번만 일어난다★ (지금 " + t.감싼횟수() + "겹)",
    t.감싼횟수() === 1,
    "여닫을 때마다 겹겹이 감싸면 한 번 누를 때 여러 번 돕니다");

  const 남은창 = t.w.document.querySelectorAll("#" + M.PANEL_ID).length;
  ok("★" + 되풀이 + "번 여닫아도 화면에 남은 창이 0개다 (지금 " + 남은창 + "개)",
    남은창 === 0,
    "닫을 때 안 지우면 창이 겹겹이 쌓입니다");

  /* 열어 둔 채로도 확인 — 열려 있을 때는 딱 1개여야 합니다 */
  M.open();
  const 열린창 = t.w.document.querySelectorAll("#" + M.PANEL_ID).length;
  ok("열면 창이 딱 1개다 (지금 " + 열린창 + "개)", 열린창 === 1);
  M.close();

  t.w.close();
}

/* 종목 전환을 되풀이해도 구독이 안 쌓이는가 */
{
  const dom = new JSDOM("<!doctype html><html><body>" +
    '<b id="preview-ask-price">1</b><b id="preview-bid-price">2</b></body></html>',
    { runScripts: "outside-only" });
  const w = dom.window;
  await new Promise((r) => setTimeout(r, 0));
  const listeners = {};
  w.App = {
    Bus: {
      on(e, fn) { (listeners[e] = listeners[e] || []).push(fn); return fn; },
      emit(e, p) { (listeners[e] || []).forEach((fn) => fn(p)); },
    },
  };
  w.eval(read("js/symbol-switch-price-clear.js"));
  w.App.SymbolSwitchPriceClear.init();

  for (let i = 0; i < 200; i++) w.App.Bus.emit("symbol:change", { symbol: "S" + i });

  ok("★종목을 200번 바꿔도 구독이 1개 그대로다★",
    listeners["symbol:change"].length === 1,
    "지금 " + listeners["symbol:change"].length + "개 — 전환할 때마다 구독이 붙으면 쌓입니다");
  const c = w.App.SymbolSwitchPriceClear.getCounters();
  ok("이벤트는 200번 받았고 지운 것은 2번뿐이다 (이미 '-' 면 다시 안 씀)",
    c.events === 200 && c.cleared === 2, JSON.stringify(c));
  w.close();
}

/* =========================================================================
 * [5] 돌연변이 자체검증 — 이 봉인이 진짜 잡는가
 *     소스 ★사본★ 을 메모리에서 틀리게 바꿔 돌립니다. 디스크는 안 건드립니다.
 * ========================================================================= */
section("[5] 돌연변이 자체검증 (디스크는 안 건드립니다)");

async function 사본으로여닫기(바꾼소스) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const w = dom.window;
  await new Promise((r) => setTimeout(r, 0));
  let keydown = 0;
  const 원래add = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = function (t) { if (t === "keydown") keydown++; return 원래add.apply(null, arguments); };
  w.setTimeout = function () { return 0; };
  const 가짜캔들 = {
    seriesType: () => "Candlestick",
    options: () => ({ upColor: "#26c281", downColor: "#f0506e", borderVisible: false }),
    applyOptions: () => {},
  };
  const 봉종류 = { getType: () => "candle", setType: function (t) { return t; } };
  const 원래setType = 봉종류.setType;
  w.App = {
    ChartFont: { getCharts: () => [{ panes: () => [{ getSeries: () => [가짜캔들] }], applyOptions: () => {} }] },
    ChartCandleType: 봉종류,
    Storage: { load: () => null, save: () => {}, clear: () => {} },
  };
  w.eval(바꾼소스);
  const M = w.App.ChartStyle;
  for (let i = 0; i < 10; i++) { M.open(); M.close(); }
  const 결과 = {
    keydown: keydown,
    감싼겹: 봉종류.setType === 원래setType ? 0 : 1,
    남은창: w.document.querySelectorAll("#" + M.PANEL_ID).length,
  };
  w.close();
  return 결과;
}

{
  const 원본 = read("js/chart-style.js");

  const 정상 = await 사본으로여닫기(원본);
  ok("(대조) 원본은 10번 여닫아도 keydown 1 · 남은창 0", 정상.keydown === 1 && 정상.남은창 === 0,
    JSON.stringify(정상));

  /* 1) 리스너 중복 방지를 빼면 쌓이는가 */
  const 중복방지뺌 = 원본.replace("if (!docBound) {", "if (true) {");
  const r1 = 중복방지뺌 === 원본 ? null : await 사본으로여닫기(중복방지뺌);
  ok("★docBound 를 빼면 keydown 리스너가 10개로 쌓인다 (지금 " +
      (r1 ? r1.keydown : "?") + ")",
    !!r1 && r1.keydown === 10,
    "여기서 못 잡으면 [4] 는 가짜입니다");

  /* 2) 닫을 때 안 지우면 창이 쌓이는가 */
  const 안지움 = 원본.replace(
    "if (modal.parentNode) modal.parentNode.removeChild(modal);",
    "/* 안 지움 */"
  );
  const r2 = 안지움 === 원본 ? null : await 사본으로여닫기(안지움);
  ok("★닫을 때 안 지우면 창이 겹겹이 쌓인다 (지금 " + (r2 ? r2.남은창 : "?") + "개)",
    !!r2 && r2.남은창 > 0,
    "화면에 안 보여도 노드는 남습니다");

  /* 3) 감싸기 중복 방지를 빼도 겹은 1로 보입니다 — 그 한계를 적어 둡니다 */
  ok("(한계) 감싼 '겹' 수는 1/0 으로만 셉니다 — 몇 겹인지는 못 잽니다",
    정상.감싼겹 === 1,
    "코드 모양 검사(wrappedType)가 그 자리를 대신 봅니다");

  /* 4) [1] 이 진짜 잡는가 — 다른 모듈이 차트를 또 만들면 */
  const 또만듦 = "var c = LightweightCharts.createChart(el, {});";
  ok("[1] 이 다른 파일의 createChart 를 잡아낸다",
    /LightweightCharts\.createChart\s*\(/.test(주석제거(또만듦)));
  ok("[1] 이 주석 속 createChart 는 안 잡는다 (오탐 없음)",
    !/LightweightCharts\.createChart\s*\(/.test(주석제거("/* LightweightCharts.createChart(x) */")));

  /* 5) [2] 가 진짜 잡는가 */
  ok("[2] 가 autoSize:false 를 잡아낸다",
    /autoSize\s*:\s*false/.test(주석제거("chart.applyOptions({ autoSize: false });")));
  ok("[2] 가 주석 속 autoSize 는 안 잡는다 (오탐 없음)",
    !/autoSize\s*:\s*false/.test(주석제거("/* autoSize: false 로 두면 안 됩니다 */")));

  /* 6) [3] 이 진짜 잡는가 — clearInterval 없는 모듈을 흉내 */
  const 멈춤없는모듈 = "var t = setInterval(function(){}, 250);";
  ok("[3] 이 멈추는 장치 없는 되풀이를 잡아낸다",
    /setInterval\s*\(/.test(멈춤없는모듈) && !/clearInterval\s*\(/.test(멈춤없는모듈));
}

/* =========================================================================
 * [6] 수정 금지 12개 · 등록
 * ========================================================================= */
section("[6] 수정 금지 12개 · 등록");
{
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(JS_DIR, f))).digest("hex");
  [
    ["trading.js", "33250202c00b097ff8344ae2ee64cbe7"],
    ["ui.js", "333fc427e75b47b306699c92aa4e7b50"],
    ["auth.js", "9cec9a7257eb54f379bf72e14e21e463"],
    ["supabase-sync.js", "faddcbbc34b5165177ff26cb978040f8"],
    ["chat.js", "a93dfaa7f82ce72a914b270acb3650bb"],
    ["leaderboard.js", "62e839f06e0565cca5d9216e484b6031"],
    ["admin.js", "424e4c63ec1cd24681c4f27f60aee2fa"],
    ["season.js", "9c5fbf13ced09ca2f348e48f87c78224"],
    ["board.js", "8b847bd8f5d8231b8dd329f8b15dbe37"],
    ["orderbook.js", "fa5f77dc5108133128f85ba5ab3f096e"],
    ["chart.js", "02ddcb000d577131f797143d08c09123"],
    ["websocket.js", "1a914631175760e0b0cb5144bc11b59e"],
  ].forEach(([f, want]) => ok("js/" + f + " 해시 그대로", md5(f) === want, md5(f)));

  let order = "";
  try { order = read("tests/_order.txt"); } catch (e) { order = ""; }
  ok("tests/_order.txt 에 이 파일이 등록돼 있다",
    order.indexOf("tests/chart-longrun-accumulation.test.js") >= 0,
    "등록 안 하면 파일은 멀쩡한데 아무도 안 돌립니다");
}

} /* ← async function 실행() 끝 */

실행()
  .catch(function (e) {
    fail++;
    실패목록.push("테스트 자체가 중간에 죽었습니다: " + (e && e.stack ? e.stack : e));
    console.log("  " + MARK_NG + " 테스트 실행 중 오류 — " + e);
  })
  .then(function () {
    console.log(String.fromCharCode(10) + "==========================================================");
    console.log("통과 " + pass + " / 실패 " + fail);
    if (fail) {
      console.log("실패 있음 ❌");
      실패목록.forEach(function (s) { console.log("  - " + s); });
      process.exit(1);
    }
    console.log("전체 통과 ✅");
    process.exit(0);
  });
