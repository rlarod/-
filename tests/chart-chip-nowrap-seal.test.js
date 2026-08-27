/* tests/chart-chip-nowrap-seal.test.js
 * =========================================================================
 * 칩은 한 줄로 둔다 — white-space:nowrap 봉인 (2026-08-28)
 * =========================================================================
 * 기록팀 / 본부장 배정. 차트팀이 360 에서 찾아 고친 것을 못 박습니다.
 *
 * ── 무슨 일이 있었나 (차트팀 실측 2026-08-28) ──────────────────────────
 *   1920 에서 보다가 360 으로 폭을 줄인 직후, **첫 확대에서만** 났습니다.
 *
 *                        고치기 전        고친 뒤
 *       칩 크기          134 x 47 (접힘)   149 x 30
 *       오른쪽 여유       0px (화면 끝)     23px
 *       차트 카드 안인가  아니오(15px 넘침)  예
 *
 *   원인 — .tl-zoom-chip 은 position:fixed 인데 white-space:nowrap 이
 *   없었습니다. 폭이 줄면 칩이 (화면폭 - left) 만큼으로 눌려 두 줄로 접히고,
 *   placeChips() 가 **그 접힌 폭(offsetWidth)을 다시 읽어** 자리를 잡습니다.
 *   자리를 잡으면 left 가 또 바뀌고, 바뀐 left 로 또 눌립니다.
 *   스스로 되풀이되는 모양이라 한 번 접히면 안 펴집니다.
 *
 *   회원 눈에는 "확대해 놓고 되돌리기 단추를 못 찾는" 상태입니다.
 *   오류도 안 나고 차트도 멀쩡합니다 — 조용한 고장입니다.
 *
 * ── 그래서 여기서 못 박는 것 ────────────────────────────────────────────
 *   [1] 실제로 화면에 들어가는 CSS 에 white-space:nowrap 이 있다
 *       ⚠ 소스에서 글자만 찾지 않습니다. 모듈을 띄워 <style> 에 최종으로
 *         박힌 것을 읽습니다. 같은 선택자를 아래에 한 벌 더 쓰면 뒤엣것이
 *         이기기 때문입니다(이 프로젝트에서 두 번 났던 유형 —
 *         tests/css-duplicate-rules.test.js 와 같은 이유).
 *   [2] 칩 높이가 한 줄(30px) 로 남는다 — 접히면 47px 이 됩니다
 *       글자 크기·줄 높이·안여백이 커지면 한 줄이어도 칩이 부풀어
 *       주문 바를 덮습니다. 그래서 재료값까지 같이 봅니다.
 *   [3] 다른 CSS 파일이 이 두 칩을 덮어쓰지 않는다
 *   [4] 접힘이 왜 되풀이되는지(placeChips 가 offsetWidth 를 읽는다)가
 *       코드에 그대로 남아 있다 — 이게 남아 있어야 nowrap 이 필수임이 설명됩니다
 *
 * 자리(좌표) 계산 자체는 tests/chart-chip-viewport-seal.test.js 가 봅니다.
 * 이 파일은 "한 줄로 남는가" 만 봅니다.
 *
 * 가짜 차트만 씁니다. 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/* -------------------------------------------------------------------------
 * 모듈을 띄워 실제로 <style> 에 박히는 CSS 를 받아옵니다
 * ----------------------------------------------------------------------- */
function 주입된CSS(폭) {
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"chart-wrap\">" +
      "<div id=\"chart_container\"><canvas></canvas></div></div></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = 폭 || 360;
  win.innerHeight = 800;
  win.fetch = undefined;
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.requestAnimationFrame = undefined;

  const 캔들 = [];
  for (let i = 0; i < 300; i++) 캔들.push({ time: 1700000000 + i * 60, open: 1, high: 2, low: 0, close: 1 });
  const series = {
    seriesType: () => "Candlestick",
    data: () => 캔들,
    attachPrimitive: () => {},
    createPriceLine: () => ({}),
    removePriceLine: () => {},
    priceToCoordinate: (p) => 80000 - p,
    coordinateToPrice: (y) => 80000 - y
  };
  const chart = {
    panes: () => [{ getSeries: () => [series] }],
    subscribeClick: () => {},
    subscribeCrosshairMove: () => {},
    timeScale: () => ({
      coordinateToLogical: (x) => x / 6,
      logicalToCoordinate: (l) => l * 6,
      timeToCoordinate: () => null,
      getVisibleLogicalRange: () => ({ from: 0, to: 100 }),
      setVisibleLogicalRange: () => {},
      fitContent: () => {}
    }),
    options: () => ({ handleScroll: true, handleScale: true }),
    applyOptions: () => {}
  };

  win.App = {
    Storage: { save: () => true, load: () => null },
    Config: { getActiveSymbol: () => "BTCUSDT", getActiveInterval: () => "1m" },
    Bus: { on: () => {}, off: () => {}, emit: () => {} },
    ChartFont: { getCharts: () => [chart] }
  };
  win.eval(SRC);

  const st = win.document.getElementById("chart-drawings-style");
  const css = st ? st.textContent : "";
  const 칩있음 = !!win.document.querySelector(".tl-draw-chip");
  try { win.close(); } catch (e) { /* noop */ }
  return { css, 칩있음 };
}

/** 선택자의 규칙을 "나온 순서대로 전부" 뽑습니다 (뒤엣것이 이깁니다) */
function 규칙들(css, 선택자) {
  const out = [];
  const 안전 = 선택자.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("(^|[},])\\s*" + 안전 + "\\s*\\{([^}]*)\\}", "g");
  let m;
  while ((m = re.exec(css)) !== null) out.push(m[2]);
  return out;
}
function 속성(규칙, 이름) {
  const m = 규칙 && 규칙.match(new RegExp("(^|;)\\s*" + 이름 + "\\s*:\\s*([^;]+)"));
  return m ? m[2].trim() : null;
}
const 숫자 = (v) => (v === null ? NaN : parseFloat(v));

console.log("\n칩 접힘 봉인 — white-space:nowrap (2026-08-28 360 실측)");

const { css: CSS, 칩있음 } = 주입된CSS(360);

/* =========================================================================
 * [0] 준비
 * ========================================================================= */
절("[0] 준비 — 모듈이 실제로 style 을 넣는다");
{
  ok("모듈이 chart-drawings-style 을 화면에 넣는다", CSS.length > 0, CSS.length + "글자");
  ok("칩이 실제로 만들어진다", 칩있음);
}

/* =========================================================================
 * [1] white-space:nowrap — 최종 규칙 기준
 * ========================================================================= */
절("[1] 두 칩 모두 한 줄로 못 박혀 있다");
[".tl-draw-chip", ".tl-zoom-chip"].forEach(function (sel) {
  const rs = 규칙들(CSS, sel);
  ok(sel + " 규칙이 있다", rs.length >= 1, rs.length + "개");
  const 마지막 = rs[rs.length - 1];
  ok(sel + " 의 최종 규칙에 white-space:nowrap 이 있다 (없으면 폭이 줄 때 두 줄로 접힙니다)",
    속성(마지막, "white-space") === "nowrap", 속성(마지막, "white-space") || "없음");
  ok(sel + " 은 position:fixed 다 (fixed + 접힘 이 짝이라 nowrap 이 필수입니다)",
    속성(마지막, "position") === "fixed", 속성(마지막, "position") || "없음");
  /* 같은 선택자를 여러 번 쓰면 뒤엣것이 이깁니다. 두 벌이면 전부 nowrap 이어야 안전합니다 */
  const 어긋남 = rs.filter((r) => 속성(r, "white-space") !== null && 속성(r, "white-space") !== "nowrap");
  ok(sel + " 규칙이 여러 벌이어도 nowrap 을 뒤집는 것이 없다", 어긋남.length === 0,
    어긋남.join(" / "));
});

/* =========================================================================
 * [2] 한 줄 높이 30px — 접히면 47px 이었습니다
 * ========================================================================= */
절("[2] 칩 높이가 한 줄로 남는다 (실측 30px / 접혔을 때 47px)");
{
  const 칩 = 규칙들(CSS, ".tl-draw-chip").pop();
  const 단추 = 규칙들(CSS, ".tl-draw-chip button").pop();

  const 글자 = 숫자(속성(칩, "font-size"));
  const 줄높이 = 숫자(속성(칩, "line-height"));
  const 안여백 = (속성(칩, "padding") || "").split(/\s+/).map(parseFloat);
  const 테두리 = 숫자((속성(칩, "border") || "").split(/\s+/)[0]);
  const 단추글자 = 숫자(속성(단추, "font-size"));
  const 단추줄 = 숫자(속성(단추, "line-height"));
  const 단추여백 = (속성(단추, "padding") || "").split(/\s+/).map(parseFloat);
  const 단추테 = 숫자((속성(단추, "border") || "").split(/\s+/)[0]);

  ok("칩 글자는 11px 다", 글자 === 11, String(글자));
  ok("칩 줄 높이는 1.6 이다", 줄높이 === 1.6, String(줄높이));
  ok("칩 위아래 안여백은 3px 다", 안여백[0] === 3, JSON.stringify(안여백));
  ok("칩 테두리는 1px 다", 테두리 === 1, String(테두리));
  ok("단추 글자도 11px 다", 단추글자 === 11, String(단추글자));

  /* 한 줄 높이 = 테두리 2 + 위아래 안여백 6 + 안에서 제일 높은 것(단추) */
  const 단추높이 = 단추글자 * 단추줄 + 단추여백[0] * 2 + 단추테 * 2;
  const 한줄 = 테두리 * 2 + 안여백[0] * 2 + 단추높이;
  ok("계산한 한 줄 높이가 차트팀 실측 30px 과 맞는다 (28~32)",
    한줄 >= 28 &&한줄 <= 32, 한줄.toFixed(1) + "px");
  ok("두 줄로 접히면 40px 를 넘는다 (실측 47px — 이래서 카드 밖으로 나갔습니다)",
    한줄 + 단추높이 > 40, (한줄 + 단추높이).toFixed(1) + "px");

  /* 칩이 세로로 늘어나면 폰에서 주문 바를 덮습니다(360 실측 — 칩은 주문바 55px 위) */
  ok("칩 높이를 키우는 값이 들어오지 않았다 (한 줄이 36px 를 넘지 않는다)",
    한줄 <= 36, 한줄.toFixed(1) + "px");
}

/* =========================================================================
 * [3] 다른 CSS 가 이 칩을 덮어쓰지 않는다
 * ========================================================================= */
절("[3] 다른 파일이 칩을 덮지 않는다");
{
  const 후보 = ["style.css", "css/chart-toolbar.css"];
  후보.forEach(function (f) {
    const p = path.join(REPO, f);
    const s = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    ok(f + " 는 .tl-draw-chip 을 건드리지 않는다 (건드리면 어느 쪽이 이길지 알 수 없습니다)",
      s.indexOf("tl-draw-chip") === -1);
    ok(f + " 는 .tl-zoom-chip 을 건드리지 않는다", s.indexOf("tl-zoom-chip") === -1);
  });
}

/* =========================================================================
 * [4] 왜 되풀이되는지가 코드·주석에 남아 있다
 * ========================================================================= */
절("[4] 되풀이되는 구조와 되돌리는 방법이 남아 있다");
{
  ok("placeChips 가 칩의 실제 폭(offsetWidth)을 읽어 자리를 잡는다 — 그래서 접히면 되풀이됩니다",
    /var bw = b\.offsetWidth/.test(SRC));
  ok("접힌 칩이 왼쪽으로 밀려나지 않게 막는 줄이 있다",
    /if \(bx < box\.left \+ CHIP_EDGE\) bx = box\.left \+ CHIP_EDGE;/.test(SRC));
  ok("주석에 white-space:nowrap 이 왜 꼭 있어야 하는지 적혀 있다",
    /white-space:nowrap 는 꼭 있어야 합니다/.test(SRC));
  ok("주석에 되풀이된다는 설명이 있다 (스스로 되풀이됨)",
    /되풀이/.test(SRC));
  ok("주석에 360px 실측이라고 적혀 있다",
    /2026-08-28 360px 실측/.test(SRC));
  ok("주석에 되돌리는 방법이 적혀 있다",
    /되돌리려면 두 곳의 white-space:nowrap; 만 지우면 됩니다/.test(SRC));
}

/* ========================================================================= */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  - " + s));
  console.log("chart-chip-nowrap-seal - 실패");
  process.exit(1);
}
console.log("chart-chip-nowrap-seal - 전체 통과");
process.exit(0);
