/* tests/chart-vol-badge-seal.test.js
 * =========================================================================
 * 거래량 마지막값 배지·점선이 ★가격축과 차트를 안 덮는가★
 * =========================================================================
 * 2026-09-08 · 수리팀
 *   대상: js/chart-vol-badge.js (App.ChartVolBadge) + index.html 등록 줄
 *
 * ── 무슨 고장이었나 (P1 · 조용한 고장) ─────────────────────────────────
 *   js/chart.js:247 이 거래량 시리즈를 만들 때 lastValueVisible /
 *   priceLineVisible 을 ★안 껐습니다★. 라이브러리 기본값이 둘 다 켜짐입니다.
 *   ★바로 위 캔들에는 껐습니다★(js/chart.js:235~236) — 거래량만 빠졌습니다.
 *
 *   그래서 두 가지가 생겼습니다.
 *     ① 가격축에 거래량 배지가 얹혀 눈금을 덮음
 *        (2026-09-08 실측 · 360 KRW — ₩118,2xx,xxx 가 "00,000" 만 읽힘)
 *     ② 차트를 ★가로지르는 가로 점선★ 이 그려짐
 *        회원이 그걸 가격선으로 읽습니다. 배지보다 이쪽이 더 나쁩니다.
 *
 *   실측 (2026-09-08 · localhost · 표본 12회씩 · 겹침 = 배지가 눈금 글자를 덮음)
 *       360 USDT 100% · 360 KRW 66.7% · 375 USDT 75% · 375 KRW 100%
 *       390 USDT 33.3% · 390 KRW 100% · 768 두 통화 100%
 *       1440 USDT 91.7% · 1440 KRW 100% · 1920 USDT 83.3% · 1920 KRW 25%
 *     점선은 여섯 폭 ★전부★ 1줄씩 (폭의 50.0~50.4% 를 채우는 점선).
 *
 * ── ⭐ 여기서 ★안 보는 것★ (두 벌 금지) ───────────────────────────────
 *   · 십자선 OHLC 줄(.tl-ohlc) 의 가격축 침범
 *     -> tests/chart-ohlc-axis-clear.test.js 한 곳입니다.
 *   · 지표 칩 줄(.tl-ind-bar) 의 가격축 침범
 *     -> tests/chart-indbar-axis-clear.test.js 한 곳입니다.
 *   · js/chart.js 가 안 바뀌었는가
 *     -> tests/_locked-hashes.js 를 보는 봉인들이 이미 봅니다.
 *   · 칩 개수 · 접기 · 켠 것만 보이기
 *     -> 각 전용 봉인 한 곳씩입니다.
 *
 * ── ⭐ 그래서 여기서는 ★이 모듈만 아는 다섯 가지★ 를 봅니다 ───────────
 *   [A] 거래량 시리즈의 배지·점선을 ★끄는가★
 *   [B] ★거래량 막대를 안 지운다★ — visible 을 건드리면 안 됩니다.
 *       (막대를 없애는 것은 고치는 게 아니라 기능을 지우는 것입니다)
 *   [C] ★오버레이 히스토그램만★ 고르는가 — 캔들·보조 pane 지표는 그대로
 *   [D] 숫자를 ★잃지 않는가★ — 칩에 값이 붙고, 칩의 원래 글자는 남는다
 *       (트레이딩뷰도 범례에 Vol 숫자가 있어서 배지가 덮여도 값을 잃지 않습니다)
 *   [E] 거래량을 끄면 값도 같이 사라지는가 (막대 없이 숫자만 남지 않게)
 *
 * ── 브라우저를 안 씁니다 ───────────────────────────────────────────────
 *   jsdom 에 가짜 차트(App.ChartFont.getCharts → panes → getSeries)를 물려
 *   모듈이 부르는 applyOptions 를 그대로 받아 적습니다.
 *   실제 화면 값은 사람이 여섯 폭 × 두 통화로 따로 쟀습니다(위 실측표).
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   git rm -f tests/chart-vol-badge-seal.test.js
 *   그리고 tests/_order.txt 의 이 줄을 지웁니다.
 *   ⚠ rm 이 아니라 ★git rm★ 입니다 — git 에 남으면 tests-dir-hygiene 이 터집니다.
 *   사이트 코드는 한 글자도 안 건드립니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MOD = "js/chart-vol-badge.js";
const SRC = fs.readFileSync(path.join(REPO, MOD), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const ORDER = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
const SELF = path.basename(__filename);

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* =========================================================================
 * 가짜 차트 — 진짜와 같은 길을 만듭니다.
 *   App.ChartFont.getCharts()[0].panes()[n].getSeries()[m]
 *     .seriesType() / .options() / .applyOptions() / .data() / .priceFormatter()
 * ========================================================================= */
function 시리즈(type, opts, data) {
  const o = Object.assign({}, opts);
  const 기록 = [];
  return {
    seriesType: function () { return type; },
    options: function () { return Object.assign({}, o); },
    applyOptions: function (p) {
      기록.push(Object.assign({}, p));
      for (const k in p) o[k] = p[k];
    },
    data: function () { return (data || []).slice(); },
    priceFormatter: function () {
      return { format: function (v) { return "★" + v + "★"; } };
    },
    적용기록: 기록
  };
}

function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    "<!doctype html><html><head></head><body>" +
      '<div class="chart-panel"><div class="chart-wrap">' +
      '<div class="tl-ind-bar">' +
      '<button class="tl-ind-btn" data-ind="ma7" aria-pressed="false">MA 7</button>' +
      '<button class="tl-ind-btn" data-ind="vol" aria-pressed="' +
      (옵션.volOff ? "false" : "true") + '"><span class="tl-ind-dot"></span>거래량</button>' +
      "</div></div></div></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;

  const 지연 = [];
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.setInterval = function () { return 0; };
  win.clearInterval = function () {};

  const 거래량 = 시리즈("Histogram", { priceScaleId: "", visible: true },
    (옵션.데이터 === null ? [] : (옵션.데이터 || [{ time: 1, value: 11 }, { time: 2, value: 63.55 }])));
  const 캔들 = 시리즈("Candlestick", { priceScaleId: "right", lastValueVisible: false, priceLineVisible: false });
  /* 보조 pane 지표(MACD 등)도 Histogram 입니다 — ★이건 건드리면 안 됩니다★ */
  const 보조 = 시리즈("Histogram", { priceScaleId: "macd", visible: true, lastValueVisible: true, priceLineVisible: true });

  const 듣는이 = {};
  win.App = {
    ChartFont: {
      getCharts: function () {
        if (옵션.차트없음) return [];
        return [{
          panes: function () {
            return [
              { getSeries: function () { return [캔들, 거래량]; } },
              { getSeries: function () { return [보조]; } }
            ];
          }
        }];
      }
    },
    Bus: {
      on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
      emit: function (n, p) { (듣는이[n] || []).forEach(function (f) { f(p); }); }
    },
    Config: { getActiveSymbol: function () { return "BTCUSDT"; }, getDisplayCurrency: function () { return "USDT"; } }
  };

  win.eval(SRC);
  const M = win.App.ChartVolBadge;
  /* JSDOM 은 readyState 가 "loading" 이라 DOMContentLoaded 를 기다립니다.
     진짜 브라우저에서는 저절로 도는 자리라 여기서 손으로 한 번 부릅니다. */
  if (M && typeof M.init === "function") M.init();

  return {
    win: win, mod: M, 거래량: 거래량, 캔들: 캔들, 보조: 보조, 지연: 지연, 듣는이: 듣는이,
    칩: win.document.querySelector('.tl-ind-btn[data-ind="vol"]'),
    값: function () {
      const el = win.document.querySelector("." + M.VAL_CLASS);
      return el ? el.textContent : null;
    }
  };
}

/* ========================================================================= */
절("[A] 거래량 배지·점선을 끄는가");

{
  const t = 띄우기();
  const o = t.거래량.options();
  ok("lastValueVisible 을 false 로 껐다", o.lastValueVisible === false,
    "지금 " + o.lastValueVisible + " — 가격축에 거래량 배지가 그대로 찍힙니다");
  ok("priceLineVisible 을 false 로 껐다", o.priceLineVisible === false,
    "지금 " + o.priceLineVisible + " — 차트를 가로지르는 가로 점선이 그대로 남습니다");
  ok("applyOptions 를 실제로 한 번은 불렀다", t.거래량.적용기록.length >= 1);
}

{
  /* 이미 꺼져 있으면 다시 안 부릅니다 — 차트를 괜히 다시 그리지 않게 */
  const t = 띄우기();
  const n = t.거래량.적용기록.length;
  t.mod.silenceAxis();
  ok("이미 꺼져 있으면 applyOptions 를 또 부르지 않는다", t.거래량.적용기록.length === n,
    "또 불렀습니다 — 차트를 쓸데없이 다시 그립니다");
}

절("[B] ★거래량 막대를 안 지운다★");

{
  const t = 띄우기();
  ok("visible 을 건드리지 않았다", t.거래량.options().visible === true,
    "막대를 숨기면 고친 게 아니라 기능을 지운 것입니다");
  const 건드림 = t.거래량.적용기록.some(function (p) {
    return Object.prototype.hasOwnProperty.call(p, "visible");
  });
  ok("applyOptions 에 visible 을 한 번도 안 넣었다", !건드림,
    "js/chart-indicators.js 의 거래량 켜기/끄기와 싸우게 됩니다");
  ok("소스에 setData/update 로 데이터를 건드리는 곳이 없다",
    !/\.setData\s*\(|\.update\s*\(/.test(SRC),
    "이 모듈은 그리기 옵션만 만집니다");
}

절("[C] ★오버레이 히스토그램만★ 고르는가");

{
  const t = 띄우기();
  ok("캔들 시리즈를 안 건드렸다", t.캔들.적용기록.length === 0,
    "캔들은 js/chart.js 가 이미 껐습니다");
  ok("보조 pane 히스토그램(priceScaleId 있음)을 안 건드렸다", t.보조.적용기록.length === 0,
    "MACD 같은 보조 지표의 축 라벨까지 꺼버립니다");
  ok("고른 시리즈가 오버레이 거래량이다",
    t.mod.getStateForTest().series === t.거래량);
  ok("소스가 priceScaleId 로 오버레이를 가려낸다", /priceScaleId/.test(SRC));
}

절("[D] 숫자를 잃지 않는가 — 칩에 값이 붙는다");

{
  const t = 띄우기();
  ok("칩 안에 값 상자가 생겼다", t.값() !== null,
    "가격축 배지를 껐는데 칩에도 값이 없으면 ★회원이 거래량 숫자를 잃습니다★");
  ok("값이 시리즈 서식(priceFormatter)으로 찍힌다", t.값() === "★63.55★",
    "지금 " + JSON.stringify(t.값()) + " — 배지에 찍히던 글자를 그대로 써야 합니다");
  ok("칩의 원래 글자 「거래량」이 그대로 있다", /거래량/.test(t.칩.textContent),
    "칩 글자를 지우면 어느 지표인지 못 읽습니다");
  ok("점 표시(.tl-ind-dot)를 안 지웠다", !!t.칩.querySelector(".tl-ind-dot"));
  ok("칩을 새로 만들지 않고 있던 것에 덧붙인다",
    !/createElement\(\s*["']button["']\s*\)/.test(SRC),
    "js/chart-indicators.js 가 만든 칩을 그대로 씁니다");
}

{
  /* 새 값이 오면 따라 바뀌어야 합니다 (kline:update) */
  const t = 띄우기();
  t.win.App.Bus.emit("kline:update", { symbol: "BTCUSDT", candle: { volume: 1234 } });
  ok("kline:update 로 값이 갱신된다", t.값() === "★1234★",
    "지금 " + JSON.stringify(t.값()));
  t.win.App.Bus.emit("kline:update", { symbol: "ETHUSDT", candle: { volume: 9 } });
  ok("다른 종목 신호는 무시한다", t.값() === "★1234★",
    "js/chart.js:363 과 같은 판정이어야 합니다");
}

{
  /* 서식 함수가 없는 판에서도 숫자를 잃지 않아야 합니다 */
  const t = 띄우기();
  const s = t.mod.getStateForTest().series;
  s.priceFormatter = undefined;
  ok("priceFormatter 가 없으면 예비 서식으로 K/M 을 만든다",
    t.mod.format(1500) === "1.5K" && t.mod.format(63.55) === "63.55" &&
    t.mod.format(2500000) === "2.5M",
    "지금 " + [t.mod.format(1500), t.mod.format(63.55), t.mod.format(2500000)].join(" / "));
}

절("[E] 거래량을 끄면 값도 같이 사라진다");

{
  const t = 띄우기({ volOff: true });
  ok("칩이 꺼져 있으면 값이 비어 있다", t.값() === "",
    "막대가 없는데 숫자만 남으면 그게 더 헷갈립니다 — 지금 " + JSON.stringify(t.값()));
  t.칩.setAttribute("aria-pressed", "true");
  t.mod.paint();
  ok("다시 켜면 값이 돌아온다", t.값() === "★63.55★", "지금 " + JSON.stringify(t.값()));
}

절("[F] 되돌릴 수 있는가 · 못 재도 안 죽는가");

{
  const t = 띄우기();
  t.mod.disable();
  ok("disable() 하면 칩의 값 상자가 사라진다", t.값() === null);
  const o = t.거래량.options();
  ok("disable() 하면 배지·점선이 원래대로 돌아온다",
    o.lastValueVisible === true && o.priceLineVisible === true,
    "되돌릴 길이 없으면 사고 났을 때 못 되돌립니다");
}

{
  const t = 띄우기({ 차트없음: true });
  ok("차트를 못 찾아도 예외가 안 난다", t.mod.getStateForTest().series === null);
  ok("차트가 없으면 값도 안 만든다", t.값() === null);
}

{
  const t = 띄우기({ 데이터: null });
  ok("데이터가 비어 있어도 예외가 안 난다", true);
}

절("[G] 등록 · 자리");

{
  ok("index.html 이 이 모듈을 부른다",
    HTML.indexOf('src="js/chart-vol-badge.js"') !== -1,
    "부르는 줄이 없으면 아무 일도 안 일어납니다");
  const iFont = HTML.indexOf('src="js/chart-font.js"');
  const iInd = HTML.indexOf('src="js/chart-indicators.js"');
  const iMe = HTML.indexOf('src="js/chart-vol-badge.js"');
  ok("chart-font.js 뒤에 있다", iFont !== -1 && iMe > iFont,
    "차트를 못 찾습니다");
  ok("chart-indicators.js 뒤에 있다", iInd !== -1 && iMe > iInd,
    "칩이 아직 없어서 값을 못 붙입니다");
  ok("tests/_order.txt 에 등록돼 있다", ORDER.indexOf("tests/" + SELF) !== -1,
    "등록이 빠지면 test-registry 가 터집니다");
}

절("[H] 돌연변이 자체검증 — 진짜로 잡는가");

{
  /* 옵션을 끄는 줄을 지운 사본을 만들어, [A] 가 빨개지는지 봅니다 */
  const 사본 = SRC.replace(
    /s\.applyOptions\(\{ lastValueVisible: false, priceLineVisible: false \}\);/,
    "/* 지움 */"
  );
  ok("돌연변이 사본이 원본과 다르다", 사본 !== SRC);
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { runScripts: "outside-only" });
  const win = dom.window;
  win.setTimeout = function () { return 0; };
  const vol = 시리즈("Histogram", { priceScaleId: "", visible: true }, []);
  win.App = {
    ChartFont: { getCharts: function () { return [{ panes: function () { return [{ getSeries: function () { return [vol]; } }]; } }]; } },
    Bus: { on: function () {}, emit: function () {} }
  };
  win.eval(사본);
  win.App.ChartVolBadge.init();
  ok("★끄는 줄을 지우면 배지가 안 꺼진다★ (봉인이 진짜로 본다)",
    vol.options().lastValueVisible === undefined || vol.options().lastValueVisible !== false);
}

/* ========================================================================= */
console.log("\n" + (fail === 0 ? MARK_OK : MARK_NG) +
  " chart-vol-badge-seal — 통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록:");
  실패목록.forEach(function (m) { console.log("  - " + m); });
}
process.exitCode = fail ? 1 : 0;
process.exit(fail ? 1 : 0);
