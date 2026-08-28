/* =========================================================================
 * tests/stream-loading-hint-seal.test.js
 * "시세 받는 중" 표시 봉인 — js/stream-loading-hint.js (2026-08-27)
 * =========================================================================
 *
 * 왜 만들었나
 *   b5d128f 로 라이브에 나갔는데 이 모듈을 지키는 테스트가 0건이었습니다.
 *   본부장이 캡처를 눈으로 보고 라이브 확인만 한 상태였습니다.
 *
 * 이 파일이 못 박는 것 (본부장·차트팀 실측 기준)
 *
 *   1) 알림칩이 차트를 안 가린다
 *      화면 고정(position 을 fixed 로) 이 아니라 봉 간격 줄(#interval-row) 의
 *      빈 자리에 문서 좌표로 얹습니다. 줄이 안 보이면(차트 전체화면)
 *      칩도 같이 숨습니다. 여섯 폭 전부 차트와 겹침 0px 였던 이유가
 *      이 규칙이라, 규칙 쪽을 봉인합니다.
 *      주의 — 픽셀 좌표로 봉인하지 않습니다. 디자인팀이 style.css 를 만지는 중입니다.
 *
 *   2) 값이 온 칸만 막대가 꺼진다
 *      실측(1440, 2026-08-27) — 한 종목 안에서도 칸마다 도착 시각이 다릅니다.
 *        나스닥   마크·펀딩 3,465ms / 현재가 3,569ms / 24H 4칸 4,602ms
 *        삼성전자 마크·펀딩 3,610ms / 현재가 4,811ms / 24H 4칸 5,198ms
 *      최대 1.6초(3,610 → 5,198) 차이가 실제로 납니다.
 *      한 칸이 왔다고 전부 끄면 아직 안 온 칸이 "-" 인 채로 정상처럼 보입니다.
 *
 *   3) 8초를 넘으면 금색으로 바뀐다 (SOFT_MS 8000)
 *      숫자를 두 벌로 만들지 않습니다.
 *      js/symbol-stream-switch.js 의 SOFT_MS · CHECK_MS · GIVEUP_MS 와
 *      같은 선이어야 합니다. 한쪽만 고치면 8초에 금색으로 바뀐 뒤
 *      15초 경고가 안 오거나, 막대가 경고보다 먼저 꺼집니다.
 *
 *   4) 빨강을 쓰지 않는다 — 지연도 끊김도 골드 #F0B429
 *      빨강 #F0506E 는 팔레트상 손익 표시 전용입니다.
 *
 *   5) 봉 간격을 바꿔도 고장 문구가 안 뜬다
 *      봉 간격 전환은 소켓을 일부러 닫았다 다시 엽니다(ws:status closed).
 *      그것까지 고장이라고 하면 거짓 경보입니다 → 2.5초 유예.
 *
 *   6) 큰 스피너로 화면을 덮지 않는다 · 이모지 없음 · "오" 자로 시작하는
 *      그 말(코드에 못 쓰게 막는 단어)도 없음. 아직 안 온 것이지 고장이 아닙니다.
 *
 *   7) index.html 의 script 한 줄만 지우면 통째로 꺼진다
 *      CSS 도 style.css 가 아니라 이 파일이 style 태그로 직접 넣습니다.
 *
 * 이 파일은 사이트 코드를 한 글자도 고치지 않습니다. tests/ 안에서만 돕니다.
 * 네트워크에 붙지 않습니다(Supabase·바이낸스 호출 없음).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  " + MARK_OK + " " + 제목);
  } else {
    fail++;
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 주석을 걷어낸 "실제로 도는 코드" 만 남깁니다.
   이 모듈 머리말에 금지어가 설명으로 적혀 있어서 문자열만 찾으면 오탐이 납니다. */
function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

const HINT_SRC = read("js/stream-loading-hint.js");
const HINT_CODE = 주석제거(HINT_SRC);
const SWITCH_CODE = 주석제거(read("js/symbol-stream-switch.js"));
const INDEX = read("index.html");
const CSS = read("style.css");

/* 확정 팔레트 (CLAUDE.md) */
const 팔레트 = [
  "#0A0F1C",
  "#101727",
  "#0D1422",
  "#1D273B",
  "#E7ECF5",
  "#838DA4",
  "#26C281",
  "#F0B429",
];
const 손익빨강 = "#F0506E";
/* 코드에 있으면 안 되는 말 — 아직 안 온 것을 고장이라 부르지 않기 위해 */
const 금지어_고장 = "오류"; /* 오+류 */

function 상수(code, 이름) {
  const m = new RegExp("var\\s+" + 이름 + "\\s*=\\s*(\\d+)").exec(code);
  return m ? Number(m[1]) : null;
}

console.log("\n시세 로딩 표시 봉인 — js/stream-loading-hint.js");

/* =========================================================================
 * jsdom 부팅 — index.html 만 올리고 이 모듈 하나만 태웁니다.
 * (다른 팀이 동시에 만지는 모듈을 안 태워야, 실패가 뜨면 원인이 여기입니다)
 * ========================================================================= */
const dom = new JSDOM(INDEX, {
  runScripts: "outside-only",
  pretendToBeVisual: true,
  url: "https://example.test/",
});
const win = dom.window;
const doc = win.document;
win.WebSocket = function () {
  this.close = () => {};
  this.send = () => {};
};
win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
win.eval(
  "window.App = window.App || {};" +
    "App.Bus = (function(){" +
    "  var L = {};" +
    "  return {" +
    "    on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; }," +
    "    off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); }," +
    "    emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{f(p);}catch(err){} }); }" +
    "  };" +
    "})();"
);
win.eval(HINT_SRC);
const Hint = win.App.StreamLoadingHint;
if (Hint && typeof Hint.init === "function") Hint.init();

/* 봉 간격 버튼은 js/chart.js 가 나중에 만듭니다 — 여기서 흉내만 냅니다.
   (테스트가 자기 DOM 을 만드는 것이지 사이트 코드를 고치는 게 아닙니다) */
const ROW_RECT = { left: 16, right: 1424, top: 300, bottom: 328, width: 1408, height: 28 };
const BTN_RECT = { left: 440, right: 500, top: 300, bottom: 328, width: 60, height: 28 };
const 빈RECT = { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
function rect(o) {
  return function () {
    return {
      left: o.left,
      right: o.right,
      top: o.top,
      bottom: o.bottom,
      width: o.width,
      height: o.height,
      x: o.left,
      y: o.top,
      toJSON: function () {
        return o;
      },
    };
  };
}
const row = doc.getElementById("interval-row");
let 줄보임 = true;
row.getBoundingClientRect = function () {
  return 줄보임 ? rect(ROW_RECT)() : rect(빈RECT)();
};
const btn = doc.createElement("button");
btn.textContent = "1분";
btn.getBoundingClientRect = rect(BTN_RECT);
row.appendChild(btn);

/* 칸은 250ms 짜리 탐색 주기(FIND_EVERY_MS)로 하나씩 잡힙니다.
   시간을 빠듯하게 잡으면 전체를 한꺼번에 돌릴 때 가끔 0개로 읽힙니다 —
   실제로 처음 만들 때 그렇게 헛돌았습니다. 넉넉히 기다립니다. */
async function 칸찾기대기(최소, 제한ms) {
  const 끝 = Date.now() + 제한ms;
  while (Date.now() < 끝) {
    if (Hint.getState().total >= 최소) return true;
    await sleep(100);
  }
  return false;
}

async function main() {
  await 칸찾기대기(5, 8000);

  /* =======================================================================
   * [0] 7) 실려 있는가 · 한 줄로 꺼지는가
   * ======================================================================= */
  section("[0] index.html script 한 줄만 지우면 통째로 꺼진다");
  {
    const 줄수 = (INDEX.match(/js\/stream-loading-hint\.js/g) || []).length;
    ok("index.html 이 이 파일을 싣는다", 줄수 >= 1);
    ok(
      "index.html 에 딱 한 줄만 있다",
      줄수 === 1,
      "지금 " + 줄수 + "줄 — 한 줄만 지워서는 안 꺼집니다"
    );
    ok(
      "main.js 의 init 목록에 넣지 않았다",
      read("main.js").indexOf("StreamLoadingHint") === -1,
      "main.js 에 넣으면 script 를 지웠을 때 main.js 가 없는 모듈을 부릅니다"
    );

    const 남의파일 = fs
      .readdirSync(path.join(REPO, "js"))
      .filter((f) => f.slice(-3) === ".js" && f !== "stream-loading-hint.js")
      .filter((f) => 주석제거(read("js/" + f)).indexOf("StreamLoadingHint") >= 0);
    ok("다른 js 파일이 이 모듈에 기대지 않는다", 남의파일.length === 0, 남의파일.join(", "));

    ok(
      "style.css 에 이 모듈의 CSS 가 없다 (모듈이 직접 style 태그로 넣는다)",
      CSS.indexOf("tl-stream-hint") === -1 && CSS.indexOf("data-tl-wait") === -1,
      "style.css 로 옮기면 script 한 줄을 지워도 규칙이 남습니다"
    );
    ok("모듈이 style 태그를 직접 넣었다", !!doc.getElementById("tl-stream-loading-hint-style"));
    ok("App.StreamLoadingHint 가 떠 있다", !!Hint);
  }

  const STYLE = doc.getElementById("tl-stream-loading-hint-style").textContent;

  /* =======================================================================
   * [1] 알림칩이 차트를 안 가린다
   * ======================================================================= */
  section("[1] 알림칩이 차트를 가리지 않는다");
  {
    ok(
      "화면 고정을 쓰지 않는다",
      HINT_CODE.indexOf("position:fixed") === -1 && STYLE.indexOf("position:fixed") === -1,
      "고정이면 스크롤해도 따라다니며 차트 위에 눌러앉습니다"
    );
    ok(
      "칩은 문서 좌표(position 을 absolute 로)로 얹는다",
      /#tl-stream-hint\{[^}]*position:absolute/.test(STYLE)
    );
    ok(
      "칩이 클릭을 가로채지 않는다(pointer-events 를 none 으로)",
      /#tl-stream-hint\{[^}]*pointer-events:none/.test(STYLE)
    );
    ok(
      "그림자를 쓰지 않는다",
      /#tl-stream-hint\{[^}]*box-shadow:none/.test(STYLE),
      "확정 팔레트 규칙 — 그림자 금지"
    );
    ok(
      "화면 전체를 덮는 값(inset / 100vw / 100vh)이 없다",
      !/inset\s*:/.test(STYLE) && STYLE.indexOf("100vw") === -1 && STYLE.indexOf("100vh") === -1
    );

    /* 봉 간격 줄이 보일 때 — 줄의 세로 띠 안, 마지막 버튼 오른쪽에 놓입니다 */
    줄보임 = true;
    Hint._arm("BTCUSDT");
    await sleep(50);
    const chip = doc.getElementById("tl-stream-hint");
    ok(
      "칩이 body 에 붙는다 (차트 컨테이너 안이 아니다)",
      !!chip && chip.parentNode === doc.body,
      "차트 안에 넣으면 차트가 자기 크기를 다시 잴 때 같이 흔들립니다"
    );
    const left = parseFloat(chip.style.left);
    const top = parseFloat(chip.style.top);
    ok(
      "칩이 마지막 봉 간격 버튼 오른쪽 빈 자리에 붙는다",
      left >= BTN_RECT.right,
      "left=" + left + " (버튼 오른쪽 끝 " + BTN_RECT.right + ")"
    );
    ok("칩이 봉 간격 줄 오른쪽 밖으로 안 나간다", left <= ROW_RECT.right, "left=" + left);
    ok(
      "칩이 봉 간격 줄의 세로 띠 안에 있다 (차트 위가 아니다)",
      top >= ROW_RECT.top - 1 && top <= ROW_RECT.bottom + 1,
      "top=" + top + " (줄 " + ROW_RECT.top + "~" + ROW_RECT.bottom + ")"
    );

    /* 봉 간격 줄이 안 보이면(차트 전체화면 등) 칩도 숨습니다 */
    줄보임 = false;
    Hint._arm("BTCUSDT");
    await sleep(50);
    ok(
      "봉 간격 줄이 안 보이면 칩도 숨는다",
      !doc.getElementById("tl-stream-hint").classList.contains("tl-on"),
      "줄이 사라졌는데 칩만 남으면 그 자리가 곧 차트입니다"
    );
    줄보임 = true;
  }

  /* =======================================================================
   * [2] 값이 온 칸만 꺼진다
   * ======================================================================= */
  section("[2] 값이 온 칸만 막대가 꺼진다 (칸마다 최대 1.6초 차이)");
  {
    Hint._arm("BTCUSDT");
    await sleep(50);
    const 전체 = Hint.getState().total;
    ok("지켜보는 칸이 다섯 개 이상 잡혔다", 전체 >= 5, "total=" + 전체);
    ok(
      "전환하면 모든 칸이 기다림으로 돌아간다",
      Hint.getState().waiting === 전체,
      "waiting=" + Hint.getState().waiting + " / total=" + 전체
    );
    ok(
      "칸에 기다림 표시가 붙었다",
      doc.getElementById("stat-price").getAttribute("data-tl-wait") === "1"
    );

    /* 한 칸에만 값을 넣습니다 */
    doc.getElementById("stat-price").textContent = "68,123.4";
    await sleep(120);
    ok(
      "값이 온 칸만 막대가 꺼진다",
      doc.getElementById("stat-price").getAttribute("data-tl-wait") === null
    );
    ok(
      "아직 안 온 칸은 그대로 기다린다",
      doc.getElementById("stat-high").getAttribute("data-tl-wait") === "1",
      "한 칸이 왔다고 전부 끄면 '-' 인 칸이 정상처럼 보입니다"
    );
    ok(
      "남은 칸 수가 정확히 1 줄었다",
      Hint.getState().waiting === 전체 - 1,
      "waiting=" + Hint.getState().waiting
    );
    const 칩글 = doc.querySelector("#tl-stream-hint .tl-sh-text").textContent;
    ok("칩이 진행 숫자를 보여준다 (1/" + 전체 + ")", 칩글.indexOf("1/" + 전체) >= 0, 칩글);

    /* 나머지를 채우면 "연결됨" 이 잠깐 뜨고 스스로 사라집니다 */
    Hint.getCellIds().forEach(function (id) {
      const el = doc.getElementById(id);
      if (el) el.textContent = "1";
    });
    await sleep(200);
    ok("전부 도착하면 기다리는 칸이 0 이 된다", Hint.getState().waiting === 0);
    ok(
      "전부 도착하면 '연결됨' 을 보여준다",
      Hint.getState().chip === "ok",
      "chip=" + Hint.getState().chip
    );
    await sleep(2200);
    ok(
      "'연결됨' 은 스스로 사라진다 (OK_HOLD_MS 1500)",
      !doc.getElementById("tl-stream-hint").classList.contains("tl-on")
    );
  }

  /* =======================================================================
   * [3] 시각 기준선을 두 벌로 만들지 않는다
   * ======================================================================= */
  section("[3] 8초 · 30초 — symbol-stream-switch.js 와 같은 선");
  {
    const SLOW = 상수(HINT_CODE, "SLOW_MS");
    const STOP = 상수(HINT_CODE, "STOP_BAR_MS");
    const HOLD = 상수(HINT_CODE, "OK_HOLD_MS");
    const SOFT = 상수(SWITCH_CODE, "SOFT_MS");
    const CHECK = 상수(SWITCH_CODE, "CHECK_MS");
    const GIVEUP = 상수(SWITCH_CODE, "GIVEUP_MS");

    ok("symbol-stream-switch 의 SOFT_MS 를 읽었다", SOFT === 8000, String(SOFT));
    ok("symbol-stream-switch 의 CHECK_MS 를 읽었다", CHECK === 15000, String(CHECK));
    ok("symbol-stream-switch 의 GIVEUP_MS 를 읽었다", GIVEUP === 30000, String(GIVEUP));
    ok(
      "8초에 금색으로 바뀐다 (SLOW_MS = SOFT_MS)",
      SLOW === SOFT,
      "SLOW_MS=" + SLOW + " SOFT_MS=" + SOFT
    );
    ok(
      "막대는 30초에 끈다 (STOP_BAR_MS = GIVEUP_MS)",
      STOP === GIVEUP,
      "STOP_BAR_MS=" + STOP + " GIVEUP_MS=" + GIVEUP
    );
    ok(
      "금색 → 경고창 → 막대끄기 순서가 유지된다",
      SLOW < CHECK && CHECK < STOP,
      SLOW + " < " + CHECK + " < " + STOP
    );
    ok("'연결됨' 표시는 잠깐만 (0 < OK_HOLD_MS <= 3000)", HOLD > 0 && HOLD <= 3000, String(HOLD));

    /* 같은 숫자를 코드 여기저기 흩어 놓으면 한쪽만 고쳐집니다 */
    const 셈 = (s, n) => (s.match(new RegExp("\\b" + n + "\\b", "g")) || []).length;
    ok(
      "8000 이 코드에 딱 한 번만 나온다 (상수 정의)",
      셈(HINT_CODE, 8000) === 1,
      "지금 " + 셈(HINT_CODE, 8000) + "번 — 숫자를 흩어 놓으면 한쪽만 고쳐집니다"
    );
    ok(
      "30000 이 코드에 딱 한 번만 나온다 (상수 정의)",
      셈(HINT_CODE, 30000) === 1,
      "지금 " + 셈(HINT_CODE, 30000) + "번"
    );
  }

  /* =======================================================================
   * [4] 빨강 금지 — 지연·끊김도 골드
   * ======================================================================= */
  section("[4] 빨강을 쓰지 않는다 (빨강은 손익 전용)");
  {
    ok("코드에 손익 빨강 " + 손익빨강 + " 이 없다", HINT_CODE.toUpperCase().indexOf(손익빨강) === -1);
    ok("넣은 CSS 에도 빨강이 없다", STYLE.toUpperCase().indexOf(손익빨강) === -1);

    const 색들 = STYLE.toUpperCase().match(/#[0-9A-F]{3,8}\b/g) || [];
    const 밖 = 색들.filter((c) => 팔레트.indexOf(c) === -1);
    ok("쓰는 색이 전부 확정 팔레트 안이다", 밖.length === 0, "팔레트 밖: " + 밖.join(", "));

    /* 지연·끊김은 골드입니다 — 회색(기다림) / 초록(도착) 과 구분되어야 합니다 */
    const 금색블록 = STYLE.split("\n")
      .filter((l) => /\.tl-slow|\.tl-fault/.test(l))
      .join("\n");
    ok(
      "지연(.tl-slow) 과 끊김(.tl-fault) 이 골드 #F0B429 를 쓴다",
      금색블록.toUpperCase().indexOf("#F0B429") >= 0
    );
    ok(
      "기다림(.tl-wait) 은 조용한 회색 #838DA4 를 쓴다",
      STYLE.split("\n")
        .filter((l) => /\.tl-wait/.test(l))
        .join("\n")
        .toUpperCase()
        .indexOf("#838DA4") >= 0
    );
  }

  /* =======================================================================
   * [5] 봉 간격을 바꿔도 고장 문구가 안 뜬다
   * ======================================================================= */
  section("[5] 봉 간격 전환(closed 뒤 곧 open)을 고장이라 하지 않는다");
  {
    const GRACE = 상수(HINT_CODE, "CLOSED_GRACE_MS");
    ok("closed 유예가 2.5초다", GRACE === 2500, String(GRACE));

    const chipText = () => doc.querySelector("#tl-stream-hint .tl-sh-text").textContent;

    Hint._onWsStatus({ state: "closed" });
    ok(
      "closed 를 받아도 그 자리에서 고장이라 하지 않는다",
      Hint.getState().fault === "",
      "fault=" + Hint.getState().fault
    );
    await sleep(500);
    ok("0.5초 뒤에도 고장 문구가 없다", Hint.getState().fault === "");
    ok("0.5초 뒤 화면에 '끊겼' 이 없다", chipText().indexOf("끊겼") === -1, chipText());

    /* 봉 간격 전환은 곧 다시 열립니다 */
    Hint._onWsStatus({ state: "open" });
    await sleep(3000);
    ok(
      "다시 열렸으면 유예가 지나도 고장 문구가 안 뜬다",
      Hint.getState().fault === "",
      "fault=" + Hint.getState().fault + " — 봉 간격을 바꿀 때마다 거짓 경보가 뜹니다"
    );
    ok("다시 열린 뒤 화면에도 '끊겼' 이 없다", chipText().indexOf("끊겼") === -1, chipText());

    /* 진짜 무신호(stale)는 즉시 알립니다 */
    Hint._onWsStatus({ state: "stale" });
    ok("stale(6초 무신호)은 즉시 알린다", Hint.getState().fault === "stale");
    ok(
      "고장 문구도 골드다 (빨강 아님)",
      doc.getElementById("tl-stream-hint").classList.contains("tl-fault")
    );
    ok("고장 문구에 금지어를 안 쓴다", chipText().indexOf(금지어_고장) === -1, chipText());
    ok("고장 문구가 다시 연결 중임을 알린다", chipText().indexOf("다시 연결") >= 0, chipText());
    Hint._onWsStatus({ state: "open" });
    await sleep(50);
    ok("다시 열리면 고장 표시가 풀린다", Hint.getState().fault === "");
  }

  /* =======================================================================
   * [6] 큰 스피너 · 이모지 · 금지어
   * ======================================================================= */
  section("[6] 화면을 덮지 않는다 · 이모지 없음 · 금지어 없음");
  {
    ok(
      "코드 어디에도 금지어가 없다",
      HINT_CODE.indexOf(금지어_고장) === -1,
      "아직 안 온 것이지 고장이 아닙니다"
    );
    const 이모지 = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/u;
    ok("코드에 이모지가 없다", !이모지.test(HINT_CODE));
    ok("넣은 CSS 에도 이모지가 없다", !이모지.test(STYLE));
    ok("alert 을 쓰지 않는다", HINT_CODE.indexOf("alert(") === -1);
    ok(
      "기다림 표시는 칸 안에서만 그린다 ([data-tl-wait] 로만 지정)",
      /\[data-tl-wait='1'\]::after/.test(STYLE)
    );

    /* 지켜보는 칸이 시세 칸 밖으로 번지지 않게 */
    const 허용 = Hint.getCellIds();
    const 표시된칸 = Array.prototype.map.call(
      doc.querySelectorAll("[data-tl-wait]"),
      (e) => e.id
    );
    const 번짐 = 표시된칸.filter((id) => 허용.indexOf(id) === -1);
    ok("기다림 표시가 시세 칸 밖으로 안 번진다", 번짐.length === 0, 번짐.join(", "));
    ok(
      "움직임을 싫어하는 설정을 존중한다 (prefers-reduced-motion)",
      STYLE.indexOf("prefers-reduced-motion") >= 0
    );
  }

  /* =======================================================================
   * [7] 수정 금지 파일 12개
   * ======================================================================= */
  section("[7] 수정 금지 파일 12개 무수정");
  {
    const md5 = (f) =>
      crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
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
  }

  /* =======================================================================
   * [8] 테스트 등록
   * ======================================================================= */
  section("[8] 테스트 등록");
  {
    const 파일명 = "tests/stream-loading-hint-seal.test.js";
    let order = "";
    try {
      order = read("tests/_order.txt");
    } catch (e) {
      order = "";
    }
    ok(
      "npm test 목록에 이 파일이 있다",
      order.indexOf(파일명) >= 0 || read("package.json").indexOf(파일명) >= 0,
      "tests/_order.txt 에 한 줄 넣지 않으면 아무도 안 돌립니다"
    );
  }
}

main()
  .then(function () {
    console.log("\n==========================================================");
    console.log("통과 " + pass + " / 실패 " + fail);
    console.log(fail === 0 ? "전체 통과" : "실패 있음");
    process.exit(fail === 0 ? 0 : 1);
  })
  .catch(function (e) {
    console.error(e);
    process.exit(1);
  });
