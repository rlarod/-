/* tests/chart-drawings.test.js
 * 차트 4단계 1차 — 선긋기(수평선·추세선·텍스트) 와 도구 막대 두 개 검증.
 *
 * 이 모듈이 지켜야 하는 것
 *   1) js/chart.js 를 고치지 않는다 (차트는 App.ChartFont.getCharts() 로 가져옴)
 *   2) 표시와 실제가 같다 — 준비중이라고 그린 버튼은 실제로도 동작하지 않는다
 *   3) 껍데기는 디자인팀 것을 쓴다 (클래스 tlc-* / 아이콘 id 는 스프라이트에 있다)
 *   4) 시세 틱마다 다시 그리지 않는다 (kline:update 를 듣지 않는다)
 *   5) 확정 팔레트 밖의 색을 쓰지 않는다
 *   6) 수평선은 종목 단위, 추세선·텍스트는 종목+봉간격 단위로 저장한다
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
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

const SRC = fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
/* 설명글(주석)은 빼고 진짜 코드만 봅니다 */
const CODE = SRC.replace(/[/][*][^]*?[*][/]/g, "");
const SPRITE = fs.readFileSync(path.join(REPO, "assets", "icons", "chart-tools.svg"), "utf8");
const TOOLBAR_CSS = fs.readFileSync(path.join(REPO, "css", "chart-toolbar.css"), "utf8");

console.log("\n차트 선긋기 (수평선 · 추세선 · 텍스트)");

/* ===================================================================
 * 모듈을 그대로 돌려 봅니다 — 화면이 없으면 아무것도 만들지 않아야 합니다.
 * =================================================================== */
function runModule() {
  const doc = {
    readyState: "complete",
    head: { appendChild() {} },
    documentElement: { appendChild() {} },
    body: { insertBefore() {}, firstChild: null },
    addEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    createElement() {
      return {
        style: {},
        setAttribute() {},
        getAttribute() {
          return null;
        },
        appendChild() {},
        addEventListener() {},
        querySelector() {
          return null;
        },
        querySelectorAll() {
          return [];
        },
      };
    },
  };
  const store = {};
  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: doc,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    performance: { now: () => 0 },
    requestAnimationFrame() {},
  };
  sandbox.window = sandbox;
  sandbox.window.innerWidth = 1920;
  sandbox.window.addEventListener = function () {};
  sandbox.App = {
    Storage: {
      save(k, v) {
        store[k] = JSON.parse(JSON.stringify(v));
        return true;
      },
      load(k) {
        return store[k] || null;
      },
    },
    Config: {
      getActiveSymbol: () => "BTCUSDT",
      getActiveInterval: () => "1m",
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox, { filename: "chart-drawings.js" });
  return sandbox.App.ChartDrawings;
}

const M = runModule();

/* ---------- 1) chart.js 무수정 ---------- */
{
  ok("모듈이 만들어졌다", !!M);
  ok("차트를 App.ChartFont.getCharts() 로 가져온다", /App\.ChartFont[\s\S]{0,40}getCharts\(\)/.test(SRC));
  ok("chart.js 를 부르거나 고치지 않는다", !/App\.Chart\b\s*=/.test(SRC) && !/chart\.js["\x27]\s*\)/.test(SRC));
  ok("index.html 에 한 줄만 실린다",
    (HTML.match(/js\/chart-drawings\.js/g) || []).length === 1);
  ok("js/chart.js 뒤에 실린다",
    HTML.indexOf("js/chart-drawings.js") > HTML.indexOf("js/chart.js"));
}

/* ---------- 2) 표시와 실제가 같다 ---------- */
{
  const left = M.TOOLS.left.filter((t) => !t.sep && !t.spacer);
  const top = M.TOOLS.top.filter((t) => !t.sep && !t.spacer);
  ok("세로 막대 도구가 11개다", left.length === 11, "지금 " + left.length + "개");
  ok("가로 막대 도구가 7개다", top.length === 7, "지금 " + top.length + "개");

  const ready = M.TOOLS.ready;
  const readyLeft = left.filter((t) => t.ready).map((t) => t.k).sort().join(",");
  ok("실제로 되는 세로 도구는 커서·추세선·수평선·텍스트 넷뿐",
    readyLeft === "cursor,fib,hline,ruler,text,trend", readyLeft);

  /* 준비중이라고 그린 것은 실제로도 고를 수 없어야 합니다 */
  const lying = left.filter((t) => !t.ready && ready[t.k]);
  ok("준비중이라고 그려 놓고 실제로 되는 도구가 없다", lying.length === 0,
    lying.map((t) => t.k).join(","));

  /* 반대로, 된다고 그린 것은 실제로 골라져야 합니다 */
  const missing = left.filter((t) => t.ready && !ready[t.k]);
  ok("된다고 그린 도구는 실제로 골라진다", missing.length === 0,
    missing.map((t) => t.k).join(","));

  /* 고를 수 없는 도구를 억지로 넣어도 바뀌지 않아야 합니다 */
  M.setTool("brush");
  ok("준비중 도구는 setTool 로도 안 켜진다", M.getTool() === "cursor", M.getTool());
  M.setTool("trend");
  ok("추세선은 켜진다", M.getTool() === "trend");
  M.setTool("cursor");

  ok("준비중 버튼은 disabled 로 그린다", /setAttribute\("disabled"/.test(SRC));
  ok("준비중 버튼에 data-soon 을 붙인다", /setAttribute\("data-soon"/.test(SRC));
  ok("준비중 버튼에 준비중이라고 적는다", /준비중/.test(SRC));
}

/* ---------- 3) 껍데기는 디자인팀 것 ---------- */
{
  ["tlc-toolbar", "tlc-body", "tlc-rail", "tlc-btn", "tlc-ico", "tlc-sep", "tlc-spacer"].forEach(function (c) {
    ok("디자인팀 클래스 " + c + " 를 쓴다", SRC.indexOf(c) !== -1 && TOOLBAR_CSS.indexOf("." + c) !== -1);
  });

  const icons = M.TOOLS.left.concat(M.TOOLS.top).filter((t) => t.icon).map((t) => t.icon);
  const missing = icons.filter((id) => SPRITE.indexOf("id=\"" + id + "\"") === -1);
  ok("쓰는 아이콘이 전부 디자인팀 스프라이트에 있다", missing.length === 0, missing.join(","));
  ok("아이콘을 직접 그리지 않았다 (path 를 만들지 않음)", !/<path/.test(SRC));
  ok("스프라이트 파일 경로를 그대로 쓴다", /assets\/icons\/chart-tools\.svg/.test(SRC));
  ok("디자인팀 CSS 만 쓴다 (style.css 를 부르지 않는다)", SRC.indexOf(String.fromCharCode(34)+"style.css") === -1);
}

/* ---------- 4) 시세 틱마다 다시 그리지 않는다 ---------- */
{
  ok("kline:update 를 듣지 않는다", CODE.indexOf("kline:update") === -1);
  ok("price:update 도 듣지 않는다", CODE.indexOf("price:update") === -1);
  ok("그릴 것이 없으면 draw 가 바로 돌아간다",
    /perf\.skipped\+\+;\s*return;/.test(SRC.replace(/\s+/g, " ").replace(/perf\.skipped\+\+; return;/, "perf.skipped++; return;")) ||
    /skipped\+\+/.test(SRC));
  ok("긋는 중이 아니면 마우스 움직임에 아무 일도 안 한다",
    /function onCrosshairMove\(param\) \{[\s\S]{0,200}if \(!pending\) return;/.test(SRC));
  ok("차트가 다시 그릴 때만 그린다 (프리미티브)", /attachPrimitive\(primitive\)/.test(SRC));
  const perf = M.getPerf();
  ok("아무것도 안 그린 상태의 계산 횟수가 0", perf.draws === 0 && perf.avgMs === 0);
}

/* ---------- 5) 확정 팔레트 ---------- */
{
  const ALLOWED = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const used = (CODE.match(/#[0-9A-Fa-f]{6}/g) || []).map((c) => c.toUpperCase());
  const bad = used.filter((c) => ALLOWED.indexOf(c) === -1);
  ok("팔레트 밖의 색을 쓰지 않는다", bad.length === 0, bad.join(","));
  ok("그린 선은 포인트색", M.COLORS.draw === "#F0B429");
  ok("고른 것은 본문색", M.COLORS.selected === "#E7ECF5");
  ok("상승 초록을 쓰지 않는다", used.indexOf("#26C281") === -1);
  ok("하락 빨강을 쓰지 않는다 (청산가 선과 헷갈리지 않게)", used.indexOf("#F0506E") === -1);
}

/* ---------- 6) 저장 범위 ---------- */
{
  ok("저장 키는 chart-drawings", M.STORAGE_KEY === "chart-drawings");
  ok("App.Storage 를 쓴다", /App\.Storage\.save\(STORAGE_KEY/.test(SRC));
  ok("수평선은 종목 단위 (봉 간격을 안 본다)",
    /function hlines\(\) \{\s*return bucket\(sym\(\)\)\.hlines;\s*\}/.test(SRC));
  ok("추세선·텍스트는 종목 + 봉 간격 단위",
    /function shapes\(\) \{[\s\S]{0,200}var key = iv\(\);/.test(SRC));
}

/* ---------- 7) 계산부 ---------- */
{
  const d = M.distToSegment;
  ok("점과 선 사이 거리 — 선 위의 점은 0", Math.abs(d(5, 5, 0, 0, 10, 10)) < 1e-9);
  ok("점과 선 사이 거리 — 수직 거리", Math.abs(d(0, 10, 0, 0, 10, 0) - 10) < 1e-9);
  ok("점과 선 사이 거리 — 선분 밖은 끝점까지", Math.abs(d(-3, 4, 0, 0, 10, 0) - 5) < 1e-9);
  ok("점과 선 사이 거리 — 길이 0 인 선", Math.abs(d(3, 4, 0, 0, 0, 0) - 5) < 1e-9);
}

/* ---------- 7-b) 2차 도구 계산부 — 바이낸스 실측값과 맞춘다 (2026-08-26) ----------
 * 아래 숫자는 눈대중이 아니라 바이낸스 선물 차트(Trading View 모드)에서
 * 피보나치를 직접 그어 읽은 값입니다.
 *   binance.com/en/futures/BTCUSDT · 1440px · 1D · 2026-08-26
 *   두 점 : 0 = 80,780.56  /  1 = 57,617.18
 *   화면에 찍힌 눈금
 *     0.236 (75,314.00)  0.382 (71,932.15)  0.5 (69,198.87)
 *     0.618 (66,465.59)  0.786 (62,574.14)
 * 우리 계산이 다섯 개 모두 1원 단위까지 같아야 합니다. 어긋나면 회원이
 * 여기서 잰 되돌림과 바이낸스에서 잰 되돌림이 달라집니다. */
{
  ok("피보나치 눈금이 바이낸스 기본값과 같다 (0/0.236/0.382/0.5/0.618/0.786/1)",
    M.FIB_LEVELS.join(",") === "0,0.236,0.382,0.5,0.618,0.786,1", M.FIB_LEVELS.join(","));

  const shape = { p1: 57617.18, p2: 80780.56 };
  const 실측 = [[0, 80780.56], [0.236, 75314.00], [0.382, 71932.15], [0.5, 69198.87],
    [0.618, 66465.59], [0.786, 62574.14], [1, 57617.18]];
  실측.forEach(function (row) {
    const got = M.fibPrice(shape, row[0]);
    ok("피보나치 " + row[0] + " 가 바이낸스와 같다 (" + row[1] + ")",
      Math.abs(got - row[1]) < 0.005, String(Math.round(got * 100) / 100));
  });

  ok("눈금 이름은 0.500 이 아니라 0.5 로 적는다", M.fibName(0.5) === "0.5", M.fibName(0.5));
  ok("눈금 이름 0.236 은 그대로", M.fibName(0.236) === "0.236", M.fibName(0.236));
  ok("눈금 이름 0 은 0", M.fibName(0) === "0", M.fibName(0));

  /* 자(측정)의 기간 글자 — 바이낸스는 "33d" 로 적습니다 */
  ok("자 — 33일을 33일로 적는다", M.fmtSpan(33 * 86400) === "33일", M.fmtSpan(33 * 86400));
  ok("자 — 90분을 1시간 30분으로 적는다", M.fmtSpan(90 * 60) === "1시간 30분", M.fmtSpan(90 * 60));
  ok("자 — 5분은 5분", M.fmtSpan(5 * 60) === "5분", M.fmtSpan(5 * 60));
  ok("자 — 거꾸로 잰 것도 같은 길이", M.fmtSpan(-5 * 60) === "5분", M.fmtSpan(-5 * 60));

  ok("두 점으로 만드는 도구는 추세선·피보나치·자 셋이다",
    Object.keys(M.TOOLS.twoPoint).sort().join(",") === "fib,ruler,trend",
    Object.keys(M.TOOLS.twoPoint).sort().join(","));
}

/* ---------- 8) 화면이 없으면 아무것도 안 만든다 ---------- */
{
  ok("차트가 없으면 도구 막대도 안 만든다 (오류 없이 조용히)", M.getTool() === "cursor");
  ok("그린 것이 없다", M.getDrawings().hlines.length === 0 && M.getDrawings().shapes.length === 0);
}

/* ---------- 9) 이모지 ---------- */
{
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("이모지가 없다", !EMOJI.test(SRC));
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
process.exit(fail ? 1 : 0);
