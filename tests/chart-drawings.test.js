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

const REPO = process.env.REPO || path.join(__dirname, "..");
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
  /* 2026-09-03 18차 — 차트팀이 수직선·사각형·화살표 셋을 열어 11 -> 14 가 됐습니다.
     기준을 낮추거나 올린 것이 아니라 "지금 무엇이 있는지" 로 맞춘 것입니다.
     LEFT_TOOLS 를 직접 열어 sep 를 뺀 도구가 14개임을 세고 적었습니다. */
  ok("세로 막대 도구가 14개다", left.length === 14, "지금 " + left.length + "개");
  ok("가로 막대 도구가 7개다", top.length === 7, "지금 " + top.length + "개");

  const ready = M.TOOLS.ready;
  const readyLeft = left.filter((t) => t.ready).map((t) => t.k).sort().join(",");
  /* 2026-08-28 5차 — 차트팀이 브러시(brush)를 열어 일곱 -> 여덟이 됐습니다.
     2026-08-28 6차 — 여러선(channel · 평행 채널)을 열어 여덟 -> 아홉이 됐습니다.
     기준을 낮춘 것이 아니라 "지금 무엇이 열려 있는지" 로 맞춘 것입니다.
     열린 도구가 또 늘면 이 문자열에 그 이름을 넣고 날짜·이유를 여기 적으세요.
     (2026-08-27 4차에서 zoom 이 들어온 것과 같은 방식입니다)
     2026-09-02 10·11차 — 파동(wave)·표정(face)을 열어 아홉 -> 열하나가 됐습니다.
     이제 세로 막대에 준비중은 하나도 없습니다.
     확인한 자리 — js/chart-drawings.js 의 LEFT_TOOLS 를 직접 열어 ready:false 가
     하나도 없음을 보고 맞췄습니다. READY_TOOLS 에도 wave · face 가 들어왔습니다. */
  /* 2026-09-03 18차 — 수직선(vline)·사각형(rect)·화살표(arrow) 를 열어
     열하나 -> 열넷이 됐습니다. 조사팀 아침 격차표 [A] 건입니다
     (트레이딩뷰에는 있는데 우리에게만 없던 가장 기본 도형 셋). */
  ok("세로 도구 열네 개가 전부 실제로 된다 (2026-09-03 수직선·사각형·화살표를 열어 준비중 0)",
    readyLeft === "arrow,brush,channel,cursor,face,fib,hline,rect,ruler,text,trend,vline,wave,zoom", readyLeft);

  /* 준비중이라고 그린 것은 실제로도 고를 수 없어야 합니다 */
  const lying = left.filter((t) => !t.ready && ready[t.k]);
  ok("준비중이라고 그려 놓고 실제로 되는 도구가 없다", lying.length === 0,
    lying.map((t) => t.k).join(","));

  /* 반대로, 된다고 그린 것은 실제로 골라져야 합니다 */
  const missing = left.filter((t) => t.ready && !ready[t.k]);
  ok("된다고 그린 도구는 실제로 골라진다", missing.length === 0,
    missing.map((t) => t.k).join(","));

  /* 2026-09-02 — wave · face 가 열려 세로 막대의 준비중이 0 이 됐습니다.
     앞선 검사가 "둘 다 열리면 이 검사를 지우지 말고 '준비중 도구가 하나도
     없다' 를 대신 못 박으세요" 라고 적어 두었기에 그대로 따랐습니다.
     대신 두 가지를 봅니다 —
       ① 도구 표에 준비중(ready:false)이 하나도 없다
       ② 표에 없는 이름을 억지로 넣어도 안 켜진다 (READY_TOOLS 관문이 살아 있다) */
  {
    const soonLeft = left.filter((t) => !t.ready).map((t) => t.k);
    const soonTop = top.filter((t) => !t.ready).map((t) => t.k);
    ok("세로 막대에 준비중 도구가 하나도 없다", soonLeft.length === 0, soonLeft.join(","));
    ok("가로 막대에 준비중 도구가 하나도 없다", soonTop.length === 0, soonTop.join(","));
  }
  M.setTool("cursor");
  M.setTool("이런도구는없다");
  ok("도구 표에 없는 이름은 setTool 로도 안 켜진다", M.getTool() === "cursor", M.getTool());
  M.setTool("trend");
  ok("추세선은 켜진다", M.getTool() === "trend");
  /* 반대쪽도 봅니다 — 열었다고 적은 도구는 실제로 켜져야 합니다 (2026-08-28 brush) */
  M.setTool("brush");
  ok("브러시는 실제로 켜진다 (2026-08-28 5차에서 열림)", M.getTool() === "brush", M.getTool());
  M.setTool("channel");
  ok("여러선은 실제로 켜진다 (2026-08-28 6차에서 열림)", M.getTool() === "channel", M.getTool());
  M.setTool("wave");
  ok("파동은 실제로 켜진다 (2026-09-02 10차에서 열림)", M.getTool() === "wave", M.getTool());
  M.setTool("face");
  ok("표정은 실제로 켜진다 (2026-09-02 11차에서 열림)", M.getTool() === "face", M.getTool());
  M.setTool("alert");
  ok("알람은 실제로 켜진다 (2026-09-02 12차에서 열림)", M.getTool() === "alert", M.getTool());
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

/* ---------- 5) 확정 팔레트 + 그리기 색 목록 ---------- */
{
  /* 2026-09-02 (13차) — 대표 승인 "차트 지표에 한해 색을 새로 만들어도 될까요" -> "ㅇㅋ".
     확정 팔레트 9색은 그대로입니다. 늘어난 것은 "그리기 선 색 목록" 하나뿐입니다.
     그래서 여기서 두 가지를 봅니다.
       1) 코드에 쓰인 색이 [확정 팔레트 + 모듈이 스스로 밝힌 목록] 안인가
          -> 목록에 안 적고 코드에 색을 슬쩍 넣으면 여기서 걸립니다
       2) 그 목록이 규칙을 실제로 지키는가 (바로 아래 5-2 절에서 매번 다시 잽니다) */
  const ALLOWED = ["#0A0F1C", "#101727", "#0D1422", "#1D273B", "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 그리기 = M.DRAW_COLORS.map((c) => c.hex.toUpperCase()).concat([M.ALERT_COLOR.toUpperCase()]);
  const used = (CODE.match(/#[0-9A-Fa-f]{6}/g) || []).map((c) => c.toUpperCase());
  const bad = used.filter((c) => ALLOWED.indexOf(c) === -1 && 그리기.indexOf(c) === -1);
  ok("확정 팔레트 9색은 그대로다 (하나도 안 바뀌었다)",
    ALLOWED.every((c) => c === c.toUpperCase()) && ALLOWED.length === 9);
  ok("팔레트 밖 · 그리기 목록 밖의 색을 쓰지 않는다", bad.length === 0, bad.join(","));
  ok("상승 · 하락색을 그리기 목록에 넣지 않았다 (손익 색과 헷갈립니다)",
    그리기.indexOf("#26C281") === -1 && 그리기.indexOf("#F0506E") === -1, 그리기.join(","));
  ok("알람 색은 그리기 목록에 없다 (연파랑 가로선은 언제나 알람입니다)",
    M.DRAW_COLORS.every((c) => c.hex.toUpperCase() !== M.ALERT_COLOR.toUpperCase()), M.ALERT_COLOR);
}

/* ---------- 5-2) 그리기 색 목록이 규칙을 지키는가 (매번 다시 잽니다) ----------
 * 눈대중이 아니라 계산으로 봅니다. js/chart-indicator-kit.js 의 지표선 20색을
 * 읽기만 해서 견줍니다 — 지표팀이 우리 색과 가까운 색을 넣으면 여기가 깨집니다.
 * 기준 10.48 은 2026-09-02 차트팀이 잰 값이고, 지표 20색끼리의 최소(9.71)보다
 * 멀리 잡은 값입니다.
 * -------------------------------------------------------------------------- */
{
  const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : Math.pow((c / 255 + 0.055) / 1.055, 2.4));
  const lum = (h) => { const p = rgb(h).map(lin); return 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; };
  const 명암비 = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const lab = (h) => {
    const p = rgb(h).map(lin);
    const g = (c) => (c > 0.008856 ? Math.cbrt(c) : 7.787 * c + 16 / 116);
    const X = g((0.4124 * p[0] + 0.3576 * p[1] + 0.1805 * p[2]) / 0.95047);
    const Y = g(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]);
    const Z = g((0.0193 * p[0] + 0.1192 * p[1] + 0.9505 * p[2]) / 1.08883);
    return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
  };
  function de2000(h1, h2) {
    const A = lab(h1), B = lab(h2);
    const C1 = Math.hypot(A[1], A[2]), C2 = Math.hypot(B[1], B[2]), Cb = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    const a1 = (1 + G) * A[1], a2 = (1 + G) * B[1];
    const Cp1 = Math.hypot(a1, A[2]), Cp2 = Math.hypot(a2, B[2]);
    const hp = (x, y) => { if (x === 0 && y === 0) return 0; const t = (Math.atan2(y, x) * 180) / Math.PI; return t < 0 ? t + 360 : t; };
    const h1p = hp(a1, A[2]), h2p = hp(a2, B[2]);
    const dL = B[0] - A[0], dC = Cp2 - Cp1;
    let dh = 0;
    if (Cp1 * Cp2 !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
    const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh * Math.PI) / 360);
    const Lb = (A[0] + B[0]) / 2, Cbp = (Cp1 + Cp2) / 2;
    let hb;
    if (Cp1 * Cp2 === 0) hb = h1p + h2p;
    else { hb = h1p + h2p; if (Math.abs(h1p - h2p) > 180) hb += hb < 360 ? 360 : -360; hb /= 2; }
    const T = 1 - 0.17 * Math.cos(((hb - 30) * Math.PI) / 180) + 0.24 * Math.cos((2 * hb * Math.PI) / 180)
      + 0.32 * Math.cos(((3 * hb + 6) * Math.PI) / 180) - 0.2 * Math.cos(((4 * hb - 63) * Math.PI) / 180);
    const dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2));
    const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
    const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
    const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
    return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2) + Rt * (dC / Sc) * (dH / Sh));
  }

  const KIT = fs.readFileSync(path.join(REPO, "js", "chart-indicator-kit.js"), "utf8");
  const 지표목록 = (KIT.slice(KIT.indexOf("var LINE_COLORS = ["), KIT.indexOf("var GUIDE_COLOR"))
    .match(/#[0-9A-Fa-f]{6}/g) || []).map((c) => c.toUpperCase());
  ok("지표선 색 목록을 읽어 왔다 (읽기만 합니다 — 고치지 않습니다)", 지표목록.length >= 12, 지표목록.length + "색");

  const 새색 = M.DRAW_COLORS.map((c) => c.hex.toUpperCase())
    .filter((c) => c !== "#F0B429").concat([M.ALERT_COLOR.toUpperCase()]);

  let 최소 = Infinity, 짝 = "";
  새색.forEach((c) => 지표목록.forEach((r) => {
    const d = de2000(c, r);
    if (d < 최소) { 최소 = d; 짝 = c + " / " + r; }
  }));
  ok("새로 만든 색이 지표선 20색과 ΔE2000 10 이상 떨어져 있다", 최소 >= 10,
    "최소 " + 최소.toFixed(2) + " (" + 짝 + ")");

  const 전부 = M.DRAW_COLORS.map((c) => c.hex.toUpperCase()).concat([M.ALERT_COLOR.toUpperCase()]);
  let 서로 = Infinity, 서로짝 = "";
  for (let i = 0; i < 전부.length; i++) {
    for (let j = i + 1; j < 전부.length; j++) {
      const d = de2000(전부[i], 전부[j]);
      if (d < 서로) { 서로 = d; 서로짝 = 전부[i] + " / " + 전부[j]; }
    }
  }
  ok("우리 색끼리도 ΔE2000 10 이상 떨어져 있다", 서로 >= 10, "최소 " + 서로.toFixed(2) + " (" + 서로짝 + ")");

  let 대비 = Infinity, 대비색 = "";
  전부.forEach((c) => { const v = 명암비(c, "#0A0F1C"); if (v < 대비) { 대비 = v; 대비색 = c; } });
  ok("배경 #0A0F1C 위에서 다 읽힌다 (명암비 4.5 이상)", 대비 >= 4.5, "최소 " + 대비.toFixed(2) + " (" + 대비색 + ")");

  let 손익 = Infinity, 손익짝 = "";
  전부.forEach((c) => ["#26C281", "#F0506E"].forEach((r) => {
    const d = de2000(c, r);
    if (d < 손익) { 손익 = d; 손익짝 = c + " / " + r; }
  }));
  ok("상승 · 하락색과 ΔE2000 25 이상 떨어져 있다 (손익 색과 헷갈리면 안 됩니다)",
    손익 >= 25, "최소 " + 손익.toFixed(2) + " (" + 손익짝 + ")");

  ok("알람 색이 금색과 확실히 다르다 (금색 네 겹을 푼 것이 이번 건의 핵심)",
    de2000(M.ALERT_COLOR, "#F0B429") >= 30, de2000(M.ALERT_COLOR, "#F0B429").toFixed(2));
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

  /* 2026-08-27 — 라벨 글자 모양까지 바이낸스와 같게 맞췄습니다.
     바이낸스 화면(shots/bnf-fib-crop.png): "0.236 (75,314.00)"
     처음에는 괄호 없이 두 칸을 띄웠는데, 나란히 놓고 보니 달라서 고쳤습니다.
     이 검사를 지우지 마세요 — 괄호가 빠지면 바이낸스와 다르게 읽힙니다. */
  ok("피보나치 라벨이 바이낸스 글자 모양과 같다 (0.236 (75,314.00))",
    M.fibLabel(0.236, "75,314.00") === "0.236 (75,314.00)", M.fibLabel(0.236, "75,314.00"));
  ok("원으로 보는 회원도 같은 모양", M.fibLabel(0.618, "118,345,200원") === "0.618 (118,345,200원)",
    M.fibLabel(0.618, "118,345,200원"));

  ok("눈금 이름은 0.500 이 아니라 0.5 로 적는다", M.fibName(0.5) === "0.5", M.fibName(0.5));
  ok("눈금 이름 0.236 은 그대로", M.fibName(0.236) === "0.236", M.fibName(0.236));
  ok("눈금 이름 0 은 0", M.fibName(0) === "0", M.fibName(0));

  /* 자(측정)의 기간 글자 — 바이낸스는 "33d" 로 적습니다 */
  ok("자 — 33일을 33일로 적는다", M.fmtSpan(33 * 86400) === "33일", M.fmtSpan(33 * 86400));
  ok("자 — 90분을 1시간 30분으로 적는다", M.fmtSpan(90 * 60) === "1시간 30분", M.fmtSpan(90 * 60));
  ok("자 — 5분은 5분", M.fmtSpan(5 * 60) === "5분", M.fmtSpan(5 * 60));
  ok("자 — 거꾸로 잰 것도 같은 길이", M.fmtSpan(-5 * 60) === "5분", M.fmtSpan(-5 * 60));

  /* 2026-09-03 18차 — 사각형·화살표가 들어와 셋 -> 다섯이 됐습니다.
     둘 다 "두 점을 찍어 그림으로 남는" 도구라 같은 길을 그대로 탑니다. */
  ok("두 점으로 만드는 도구는 추세선·피보나치·자·사각형·화살표 다섯이다",
    Object.keys(M.TOOLS.twoPoint).sort().join(",") === "arrow,fib,rect,ruler,trend",
    Object.keys(M.TOOLS.twoPoint).sort().join(","));
}

/* ---------- 7-1) 돋보기 (2026-08-27) ---------- */
{
  /* 2026-09-03 18차 — 사각형·화살표가 들어와 넷 -> 여섯이 됐습니다. */
  ok("두 번 톡 하는 도구는 추세선·피보나치·자·돋보기·사각형·화살표 여섯이다",
    Object.keys(M.TOOLS.twoTap).sort().join(",") === "arrow,fib,rect,ruler,trend,zoom",
    Object.keys(M.TOOLS.twoTap).sort().join(","));

  /* 돋보기는 그림이 아닙니다 — 저장에 남으면 새로고침 때 유령이 생깁니다 */
  ok("돋보기는 저장되는 그림(twoPoint)이 아니다", !M.TOOLS.twoPoint.zoom);

  ok("돋보기를 고를 수 있다", (M.setTool("zoom"), M.getTool() === "zoom"), M.getTool());
  M.setTool("cursor");

  ok("확대 되돌리기 칸은 처음에 비어 있다", M.getZoomUndoDepth() === 0, String(M.getZoomUndoDepth()));
  ok("되돌릴 것이 없으면 false 를 돌려준다 (오류를 내지 않습니다)", M.zoomBack() === false);
  ok("너무 좁게 찍은 것은 확대하지 않는다 (최소 봉 수가 정해져 있다)",
    typeof M.ZOOM_MIN_BARS === "number" && M.ZOOM_MIN_BARS >= 2, String(M.ZOOM_MIN_BARS));
  ok("되돌리기 칸은 무한정 쌓이지 않는다", M.ZOOM_UNDO_MAX > 0 && M.ZOOM_UNDO_MAX <= 50, String(M.ZOOM_UNDO_MAX));

  /* 차트가 없을 때(테스트 환경) 불러도 조용히 실패해야 합니다 */
  ok("차트가 없으면 확대는 조용히 실패한다", M.zoomTo(0, 100000) === false);

  /* 확정 팔레트 밖의 색을 새로 만들지 않았는지 */
  ok("확대 칩 CSS 가 있다", /tl-zoom-chip{/.test(SRC));
  /* 칩은 화면(viewport) 기준이어야 합니다 — 2026-08-27 fx 목록에서 났던 일
     (차트 칸이 화면보다 길어서 칸 기준으로 잡으면 폰에서 화면 밖으로 나갑니다) */
  ok("칩·알림줄은 position:fixed 로 화면 기준으로 잡는다",
    /.tl-zoom-chip{position:fixed/.test(SRC) &&
    /.tl-draw-chip{position:fixed/.test(SRC) &&
    /.tl-draw-toast{position:fixed/.test(SRC));
  ok("하단 매수·매도 바를 같이 재고, 없는 폭(1920·768)도 견딘다",
    /tl-order-bar/.test(SRC) && /display === "none"/.test(SRC));
  ok("스크롤·크기변경 때 칩을 다시 잡는다",
    SRC.indexOf(String.fromCharCode(34) + "scroll" + String.fromCharCode(34) + ", placeSoon") !== -1 &&
    SRC.indexOf("placeSoon()") !== -1);
}

/* ---------- 7-2) 파동 (2026-09-02 10차) ---------- */
{
  ok("파동은 여러 번 톡 하는 도구다",
    Object.keys(M.TOOLS.multiTap || {}).sort().join(",") === "wave",
    Object.keys(M.TOOLS.multiTap || {}).join(","));
  ok("두 점·세 점 도구에는 안 들어간다 (섞이면 두 번째 점에서 끝나 버립니다)",
    !M.TOOLS.twoTap.wave && !M.TOOLS.threeTap.wave && !M.TOOLS.twoPoint.wave);

  /* 트레이딩뷰 공개 문서(Drawings-List, 2026-09-02 확인)의 엘리엇 도구 다섯 중
     둘을 만들었습니다 — impulse(12345) 와 correction(ABC).
     앱 실측이 아닙니다(도구 막대를 쓰려면 로그인해야 합니다). */
  ok("이름표 묶음이 둘이다 (12345 / ABC)",
    Object.keys(M.WAVE_SETS).sort().join(",") === "abc,impulse",
    Object.keys(M.WAVE_SETS).join(","));
  ok("충격파동 이름표는 1·2·3·4·5", M.WAVE_SETS.impulse.join(",") === "1,2,3,4,5",
    M.WAVE_SETS.impulse.join(","));
  ok("조정파동 이름표는 A·B·C", M.WAVE_SETS.abc.join(",") === "A,B,C", M.WAVE_SETS.abc.join(","));
  ok("기본은 충격파동(12345)", M.getWaveSet() === "impulse", M.getWaveSet());
  /* 첫 점은 파동의 시작이라 이름표가 없습니다 — 그래서 점 수 = 이름표 + 1 */
  ok("충격파동은 점 여섯 개까지", M.waveMax() === 6, String(M.waveMax()));
  M.toggleWaveSet();
  ok("조정파동으로 바꿀 수 있다", M.getWaveSet() === "abc", M.getWaveSet());
  ok("조정파동은 점 네 개까지", M.waveMax() === 4, String(M.waveMax()));
  M.toggleWaveSet();
  ok("다시 누르면 되돌아온다", M.getWaveSet() === "impulse", M.getWaveSet());
  ok("찍은 점이 없으면 되돌릴 것도 없다 (오류를 내지 않는다)", M.undoWavePoint() === false);
  ok("점 없이 끝내도 오류가 없다", M.finishWave() === false);
  M.setTool("cursor");
}

/* ---------- 7-3) 표정 (2026-09-02 11차) ---------- */
{
  ok("여섯 가지다", M.FACE_KINDS.length === 6, String(M.FACE_KINDS.length));
  const keys = M.FACE_KINDS.map((f) => f.k).sort().join(",");
  ok("종류가 정해져 있다", keys === "cry,flat,frown,smile,surprise,wink", keys);
  ok("저마다 한글 이름이 붙어 있다 (마우스를 올리면 읽힙니다)",
    M.FACE_KINDS.every((f) => typeof f.label === "string" && f.label.length > 0));
  /* 트레이딩뷰는 Twemoji 그림 파일을 쓰지만 우리는 캔버스에 선으로 긋습니다 —
     남의 그림 묶음을 받지 않기로 했고, 이모지 글자는 이 파일에 못 넣습니다. */
  ok("그림 파일을 받아 오지 않는다 (선으로 긋습니다)",
    CODE.indexOf("twemoji") === -1 && CODE.indexOf("Twemoji") === -1 &&
    !/new Image\(/.test(CODE));
  ok("고르는 창 단추는 40px 이상이다 (폰에서 손가락으로 누릅니다)",
    M.FACE_BTN >= 40, String(M.FACE_BTN));
  /* 여섯 개가 360 폭 차트 칸(약 330px) 안에 들어가야 합니다 */
  ok("고르는 창이 360 차트 칸(330px) 안에 들어간다",
    M.FACE_BTN * 6 + 20 <= 330, String(M.FACE_BTN * 6 + 20));
}

/* ---------- 7-4) 알람 (2026-09-02 12차) ----------
 * PM 지시로 열었습니다. 경계가 지시에 함께 왔고, 그 경계를 여기서 못 박습니다.
 *   되는 것   : 가격 선 + 화면 알림줄 · 소리 · 브라우저 알림 (전부 무료)
 *   안 되는 것 : 알람이 주문을 내는 것 / 자동매매 / 돈 드는 발송 서비스
 * 이 검사를 지우지 마세요 — 지우면 다음 사람이 알람에 주문을 붙일 수 있습니다. */
{
  ok("알람 저장칸은 그림과 다른 칸이다 (탭 두 개일 때 알람만 다시 읽으려고)",
    M.ALERT_KEY === "chart-alerts" && M.ALERT_KEY !== M.STORAGE_KEY, M.ALERT_KEY);
  ok("처음엔 알람이 없다", M.getAlertCount() === 0, String(M.getAlertCount()));
  ok("소리는 켜져 있는 것이 처음값", M.isAlertSoundOn() === true);
  M.toggleAlertSound();
  ok("소리를 끌 수 있다", M.isAlertSoundOn() === false);
  M.toggleAlertSound();
  ok("다시 켤 수 있다", M.isAlertSoundOn() === true);

  const a = M.addAlert(70000);
  ok("알람을 걸 수 있다", M.getAlertCount() === 1 && a.price === 70000, String(M.getAlertCount()));
  ok("조건은 교차 하나다", a.cond === "cross", a.cond);
  ok("걸자마자 울린 상태가 아니다", a.done === false);
  ok("그림 저장칸에는 안 들어간다 (그림이 아닙니다)",
    M.getDrawings().hlines.length === 0 && M.getDrawings().shapes.length === 0);

  /* 교차 — 지난 값과 지금 값 사이에 끼면 울립니다. 처음 한 번은 기준이 없어 안 울립니다 */
  M.onTickerForTest({ symbol: "BTCUSDT", lastPrice: 69000 });
  ok("시세가 한 번만 오면 안 울린다 (견줄 지난 값이 없어서)", M.getAlerts()[0].done === false);
  M.onTickerForTest({ symbol: "BTCUSDT", lastPrice: 69500 });
  ok("안 지나갔으면 안 울린다", M.getAlerts()[0].done === false);
  M.onTickerForTest({ symbol: "BTCUSDT", lastPrice: 70500 });
  ok("지나가면 울린다", M.getAlerts()[0].done === true);
  M.onTickerForTest({ symbol: "BTCUSDT", lastPrice: 69000 });
  M.onTickerForTest({ symbol: "BTCUSDT", lastPrice: 71000 });
  ok("한 번 울린 알람은 다시 안 울린다", M.getAlerts().filter((x) => x.done).length === 1);

  M.addAlert(72000);
  M.onTickerForTest({ symbol: "ETHUSDT", lastPrice: 999999 });
  ok("다른 종목 시세로는 안 울린다", M.getAlerts().filter((x) => !x.done).length === 1);
  ok("울린 것만 치울 수 있다", M.clearFiredAlerts() === 1 && M.getAlertCount() === 1,
    String(M.getAlertCount()));

  /* 그림을 다 지워도 알람은 남아야 합니다 — 걸어 둔 알람이 조용히 사라지면
     회원은 "안 울렸다" 가 아니라 "가격이 안 닿았다" 로 읽습니다(조용한 고장) */
  M.clearAll();
  ok("그림 전체 지우기가 알람을 지우지 않는다", M.getAlertCount() === 1, String(M.getAlertCount()));

  /* --- 경계 --- */
  ok("알람이 주문을 내지 않는다 (App.Trading 을 아예 부르지 않는다)",
    CODE.indexOf("App.Trading") === -1);
  const 주문말 = ["openPosition", "placeOrder", "submitOrder", "closePosition", "setLeverage", "market\u0042uy"];
  const 걸린것 = 주문말.filter((w) => CODE.indexOf(w) !== -1);
  ok("주문을 내는 이름을 아무것도 부르지 않는다", 걸린것.length === 0, 걸린것.join(","));
  /* --- 바깥으로 나가는 길 (2026-09-02 14차에서 봉인을 더 세게 했습니다) ---
   * 12차 검사는 "fetch( 가 하나뿐" 이라고 개수만 셌습니다.
   * 14차에서 놓친 알람을 되찾으려고 App.Api.fetchKlines 를 부르게 됐는데,
   * 그 글자 안에는 "fetch(" 가 없습니다("fetchKlines(" 입니다).
   * 그래서 「옛 검사에 걸리지 않고 조용히 지나갔습니다」.
   * 개수 세기를 버리고 「나가는 길을 이름까지 적어 대조」하는 방식으로 바꿉니다.
   * 여기 안 적힌 길이 하나라도 생기면 그 자리에서 터집니다. */
  {
    const 길 = (CODE.match(/[\w.]*fetch\w*\s*\(/g) || []).map((c) => c.replace(/\s+/g, ""));
    const 이름 = Array.from(new Set(길)).sort().join(" ");
    ok("바깥으로 나가는 길은 적어 둔 두 개뿐이다 (아이콘 파일 · 바이낸스 공개 봉)",
      이름 === "App.Api.fetchKlines( fetch(", 이름);
    ok("그중 fetch( 는 우리 아이콘 파일이다", /fetch\(SPRITE_URL\)/.test(CODE));
    /* 봉을 받는 길은 js/chart.js 가 차트를 채울 때 쓰는 것과 같은 공개 읽기입니다.
       종목 · 봉간격 · 개수 세 가지만 넘깁니다 — 회원 정보를 보내지 않습니다. */
    ok("봉을 받을 때 종목·봉간격·개수만 넘긴다 (회원 정보 0)",
      /App\.Api\.fetchKlines\(\s*\w+\s*,\s*\w+\.iv\s*,\s*\w+\s*\)/.test(CODE));
    /* 읽기만 합니다. 올려 보내는 흔적(방식 지정 · 인증 · 쿠키)이 없어야 합니다.
       주의 — body 라는 낱말은 안 봅니다. 브라우저 알림 옵션이 body 를 쓰는데
       그건 바깥으로 나가는 것이 아니라 화면에 띄우는 글입니다. */
    ok("무언가 올려 보내지 않는다 (방식 지정 · 인증 · 쿠키가 없다)",
      CODE.indexOf("XMLHttpRequest") === -1 && CODE.indexOf("sendBeacon") === -1 &&
      CODE.indexOf("POST") === -1 && CODE.indexOf("Authorization") === -1 &&
      !/\bmethod\s*:/.test(CODE) && !/\bcredentials\s*:/.test(CODE) &&
      !/\bheaders\s*:/.test(CODE));
  }
  ok("서버에 저장하지 않는다 (이 브라우저에만 남습니다)",
    CODE.indexOf("supabase") === -1 && CODE.indexOf("Supabase") === -1);

  /* --- 화면에 적는 안내 (2026-09-02 14차에서 봉인을 더 세게 했습니다) ---
   * 12차 검사는 SRC(설명글 포함)에 "창을 닫으면 못 알립니다" 가 있는지만 봤습니다.
   * 그러면 그 말이 「주석에만 남아 있어도 통과」합니다 — 실제로 14차에서
   * 문구를 바꾸자 화면에서는 사라졌는데 옛 검사는 초록으로 지나갔습니다.
   * 이제 「진짜 코드에서, 두 가지 사실을 다 적는지」 를 봅니다.
   *   1) 지금 보는 창·종목에서만 실시간으로 운다
   *   2) 놓친 것은 돌아오면 알려준다
   * 1만 있으면 "그럼 못 알리는구나" 로 끝나고, 2만 있으면 "자리를 비워도
   * 제때 울리겠구나" 로 잘못 읽습니다. 둘 다 있어야 합니다. */
  ok("안내가 두 줄로 있고 서로 다르다",
    !!M.ALERT_NOTE_1 && !!M.ALERT_NOTE_2 && M.ALERT_NOTE_1 !== M.ALERT_NOTE_2,
    M.ALERT_NOTE_1 + " / " + M.ALERT_NOTE_2);
  ok("첫 줄 — 이 창 · 이 종목에서만 운다고 적는다",
    /이 창/.test(M.ALERT_NOTE_1) && /이 종목/.test(M.ALERT_NOTE_1) && /울립니다/.test(M.ALERT_NOTE_1),
    M.ALERT_NOTE_1);
  ok("둘째 줄 — 놓친 것은 돌아오면 알려준다고 적는다",
    /놓친/.test(M.ALERT_NOTE_2) && /돌아오면/.test(M.ALERT_NOTE_2) && /알려/.test(M.ALERT_NOTE_2),
    M.ALERT_NOTE_2);
  ok("칩이 그 두 줄을 실제로 그린다 (주석이 아니라 코드에서)",
    /paintAlertNote\(an\)/.test(CODE) && /ALERT_NOTE_1/.test(CODE) && /ALERT_NOTE_2/.test(CODE));
  /* 진짜 코드(설명글 제외)에서 한 번씩만 나와야 합니다 — 두 벌이 되면
     한쪽만 고치고 화면과 검사가 어긋납니다. 설명글의 인용은 셈에서 뺍니다. */
  ok("안내 글자를 적은 곳은 한 곳뿐이다 (두 벌 금지)",
    (CODE.split(M.ALERT_NOTE_1).length - 1) === 1 && (CODE.split(M.ALERT_NOTE_2).length - 1) === 1,
    (CODE.split(M.ALERT_NOTE_1).length - 1) + " / " + (CODE.split(M.ALERT_NOTE_2).length - 1));
  ok("글씨를 줄이지 않았다 (칩은 그대로 11px)",
    /\.tl-draw-chip\{[^}]*font-size:11px/.test(SRC));
  ok("브라우저 알림을 거절해도 화면 알림줄은 돈다 (권한 확인 뒤에만 알림을 만든다)",
    /Notification\.permission !== "granted"/.test(CODE));
  ok("소리는 파일을 받지 않고 브라우저가 만든다 (용량 0 · 돈 0)",
    /createOscillator\(\)/.test(CODE) && !/[.](mp3|wav|ogg|m4a)["\x27)]/.test(CODE));
  ok("다른 탭이 바꾸면 알람만 다시 읽는다 (두 번 울리지 않게)",
    /addEventListener\("storage", onAlertStorage\)/.test(CODE));
  ok("시세는 초당 한 번 오는 ticker:update 로만 받는다",
    CODE.indexOf("ticker:update") !== -1);
}

/* ---------- 7-5) 놓친 교차 되찾기 (2026-09-02 14차 · P1) ----------
 * 무엇이 P1 이었나 — 다른 종목을 보는 동안 알람이 조용히 멈췄고, 그 사이
 * 지나간 교차는 돌아와도 영영 사라졌습니다. 화면에 오류가 하나도 안 나서
 * 회원은 "안 울렸다 = 가격이 안 닿았다" 로 읽습니다.
 * (PM 이 라이브에서 재현 · 점검팀 실측 2026-09-02 10:22~10:24)
 *
 * 여기서는 그물망(REST) 없이 계산부만 봅니다 — findCross · applyCatchUp.
 * 봉을 직접 만들어 넣으므로 바이낸스가 죽어 있어도 이 검사는 돕니다. */
{
  const 분 = 60000;
  const 봉 = (t, lo, hi) => ({ time: Math.floor(t / 1000), open: lo, high: hi, low: lo, close: hi });

  /* --- findCross : 봉 하나의 고가·저가 안에 알람가가 들어오면 지난 것 --- */
  const 기준 = 1000000 * 분; /* 아무 시각이나 */
  const 목록 = [
    봉(기준 - 2 * 분, 100, 110), /* 지켜보던 때 — 세면 안 됩니다 */
    봉(기준 + 1 * 분, 100, 101),
    봉(기준 + 2 * 분, 100, 120), /* 여기서 지났습니다 */
    봉(기준 + 3 * 분, 100, 130)
  ];
  ok("지나간 봉을 찾는다", M.findCross(목록, 115, 기준) === 기준 + 2 * 분,
    String(M.findCross(목록, 115, 기준)));
  ok("가장 먼저 지난 봉을 집는다 (나중 봉이 아니라)",
    M.findCross(목록, 125, 기준) === 기준 + 3 * 분, String(M.findCross(목록, 125, 기준)));
  ok("안 닿았으면 못 찾는다", M.findCross(목록, 200, 기준) === null);
  ok("지켜보던 때의 봉은 안 센다 (알람을 걸기 전 값으로 헛알람이 납니다)",
    M.findCross(목록, 105, 기준 + 4 * 분) === null);
  ok("걸친 봉도 안 센다 — 봉이 시작한 시각이 기준 뒤인 것만 본다",
    M.findCross([봉(기준 - 1 * 분, 100, 130)], 115, 기준) === null);
  ok("봉이 없으면 조용히 null", M.findCross([], 115, 기준) === null && M.findCross(null, 115, 기준) === null);

  /* --- applyCatchUp : 찾은 것을 "늦은 알림" 으로 표시 --- */
  const 앞 = M.getAlertCount();
  const b1 = M.addAlert(115);
  b1.at = 기준; /* 이 알람은 기준 시각에 걸었다고 칩니다 */
  const 늦은 = M.applyCatchUpForTest("BTCUSDT", 목록, 기준, false);
  ok("놓친 교차를 되찾아 울린 것으로 바꾼다", 늦은.length === 1 && 늦은[0].id === b1.id,
    String(늦은.length));
  ok("늦게 찾은 것이라고 표시한다 (지금 울린 것과 갈라야 합니다)",
    b1.done === true && b1.late === true && b1.lateAt === 기준 + 2 * 분,
    JSON.stringify({ done: b1.done, late: b1.late, lateAt: b1.lateAt }));
  ok("선 이름표가 다르다 — 늦은 것은 (늦음) 이 붙는다",
    M.alertTitleForTest(b1) === "알람 울림(늦음)" &&
    M.alertTitleForTest({ done: true }) === "알람 울림" &&
    M.alertTitleForTest({ done: false }) === "알람",
    M.alertTitleForTest(b1));
  ok("소리도 다르다 — 늦은 것은 낮은 소리 세 번",
    M.LATE_HZ !== M.BEEP_HZ && M.LATE_HZ < M.BEEP_HZ && M.LATE_BEEPS === 3,
    M.LATE_HZ + "Hz x" + M.LATE_BEEPS);
  ok("한 번 되찾은 것은 다시 안 울린다",
    M.applyCatchUpForTest("BTCUSDT", 목록, 기준, false).length === 0);

  /* 알람을 건 시각보다 앞선 교차는 세지 않습니다 (헛알람 방지) */
  const b2 = M.addAlert(115);
  b2.at = 기준 + 4 * 분; /* 다 지나간 뒤에 걸었습니다 — 이 뒤로는 봉이 없습니다 */
  ok("알람을 건 뒤의 교차만 센다",
    M.applyCatchUpForTest("BTCUSDT", 목록, 기준, false).length === 0 && b2.done === false);
  b2.done = true;
  M.clearFiredAlerts();
  ok("정리했다", M.getAlertCount() === 앞, String(M.getAlertCount()));

  /* --- 얼마나 거슬러 올라가나 --- */
  ok("8시간까지는 1분봉으로 본다", M.catchTier(1).iv === "1m" && M.catchTier(480).iv === "1m");
  ok("5일까지는 15분봉", M.catchTier(481).iv === "15m" && M.catchTier(7200).iv === "15m");
  ok("그보다 오래면 4시간봉", M.catchTier(7201).iv === "4h" && M.catchTier(999999).iv === "4h");
  ok("가장 오래 거슬러 올라가는 것은 60일이다",
    M.CATCHUP.maxMs === 60 * 24 * 60 * 60 * 1000, String(M.CATCHUP.maxMs));
  /* 어느 구간이든 한 번 요청으로 끝나야 합니다 — 바이낸스 상한 안쪽 */
  {
    const 넘침 = M.CATCHUP.tiers.filter((t) => Math.ceil(t.maxMin / t.min) + 3 > M.CATCHUP.limit);
    ok("어느 구간이든 봉 요청 한 번으로 끝난다 (500개 안쪽)", 넘침.length === 0,
      넘침.map((t) => t.iv).join(","));
    const 끝 = M.CATCHUP.tiers[M.CATCHUP.tiers.length - 1];
    ok("가장 성긴 봉이 60일을 덮는다", 끝.maxMin * 60000 >= M.CATCHUP.maxMs,
      끝.maxMin + "분 vs " + M.CATCHUP.maxMs / 60000 + "분");
  }

  /* --- 되찾기도 주문을 내지 않습니다 (12차 경계 그대로) --- */
  ok("되찾기가 주문을 내지 않는다", CODE.indexOf("App.Trading") === -1);
  ok("되찾기는 봉을 읽기만 한다 (되돌리기 Ctrl+Z 와 얽히지 않는다)",
    !/pushUndo\(\)[^]{0,400}applyCatchUp/.test(CODE) && !/applyCatchUp[^]{0,400}pushUndo\(\)/.test(CODE));
}

/* ---------- 7-6) 알림줄 글씨 (15차 2026-09-02) ----------
 * 대표가 작은 글씨를 못 읽습니다. 팝업창 글씨를 키우는 데 세 번 걸렸고,
 * 그때 원인이 「바이낸스 글씨를 천장으로 삼은 것」 과
 * 「안 들어가면 글씨를 줄인 것」 이었습니다.
 * 이 봉인은 「다시 줄이는 것」 을 막습니다.
 * ------------------------------------------------------------------ */
{
  ok("알림줄 글씨는 15px 아래로 내려가지 않는다",
    M.TOAST_FONT >= M.TOAST_MIN_FONT && M.TOAST_MIN_FONT >= 15,
    M.TOAST_FONT + "px (하한 " + M.TOAST_MIN_FONT + "px)");
  ok("알림줄 글씨는 OHLC 범례와 같은 17px 이다", M.TOAST_FONT === 17, String(M.TOAST_FONT));

  /* 알림줄 CSS 한 덩어리를 떼어 봅니다 */
  const TOAST_CSS = (SRC.match(/[.]tl-draw-toast\{[^]*?display:none;\}/) || [""])[0];
  ok("알림줄 CSS 를 실제로 찾았다", TOAST_CSS.length > 0);

  /* 값을 적는 곳이 한 곳이어야 합니다 — CSS 에 숫자를 또 박으면 두 벌이 됩니다 */
  ok("알림줄 글씨 크기는 TOAST_FONT 한 곳에서만 나온다",
    /font-size:" [+] TOAST_FONT [+] "px/.test(SRC) && !/font-size:\d/.test(TOAST_CSS),
    TOAST_CSS.slice(0, 60));

  /* 「안 들어가면 글씨를 줄인다」 를 코드에 다시 넣지 못하게 막습니다.
     알림줄 자리를 잡는 placeToast 안에서 글씨 크기를 만지면 안 됩니다. */
  const PLACE = (CODE.match(/function placeToast\(\)[^]*?\n  \}/) || [""])[0];
  ok("placeToast 를 실제로 찾았다", PLACE.length > 0);
  ok("자리를 잡을 때 글씨 크기를 줄이지 않는다 (줄 수·자리로 푼다)",
    PLACE.length > 0 && PLACE.indexOf("fontSize") === -1 && PLACE.indexOf("font-size") === -1);
  ok("좁으면 폭을 묶어 여러 줄로 접는다", /maxWidth/.test(PLACE));

  /* 폭을 재기 전에 left 를 되돌립니다 — 안 그러면 잰 값이 실제보다 좁게 나와
     알림줄이 오른쪽으로 밀립니다 (360 실측 268px 로 재고 실제로는 314px). */
  ok("폭을 재기 전에 left 를 0 으로 되돌린다",
    /style\.left = "0px";[^]{0,120}offsetWidth/.test(PLACE));
  /* 아래로 삐져나가면 위로 올립니다 — 360 에서 하단 매수·매도 바를 덮었습니다 */
  ok("아래로 삐져나가면 위로 밀어 올린다",
    /offsetHeight/.test(PLACE) && /box\.bottom - h/.test(PLACE));

  /* 한글 줄바꿈 — 낱말째 넘깁니다 */
  ok("한글이 낱말 가운데서 갈리지 않는다 (word-break:keep-all)",
    /word-break:keep-all/.test(TOAST_CSS));
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
