/* tests/_chart-drawings-boot.js
 * =========================================================================
 * js/chart-drawings.js 를 브라우저 없이 띄우는 공용 도구
 * =========================================================================
 * 2026-09-02 16차 — 차트팀.
 *
 * 왜 따로 두나 — tests/chart-channel-seal.test.js 안에 같은 뼈대가 이미
 * 있는데, 그 파일은 여러선(채널) 봉인이라 손대지 않았습니다. 새 봉인이
 * 같은 뼈대를 또 베끼면 「가짜 차트가 두 벌」 이 되고, 라이브러리 쪽이
 * 바뀔 때 한쪽만 고쳐집니다. 그래서 새로 쓰는 것부터 여기로 모읍니다.
 *
 * 무엇을 흉내 내나
 *   · Lightweight Charts 의 차트·시리즈·시간축 (그린 것을 받아 두는 캔버스 포함)
 *   · App.Storage (메모리) · App.Config · App.Bus · App.ChartFont.getCharts()
 * 서버도 브라우저도 부르지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC_PATH = path.join(REPO, "js", "chart-drawings.js");
const SRC = fs.readFileSync(SRC_PATH, "utf8");

const 첫봉 = 1700000000;
const 봉간격초 = 60;
const 기준가 = 80000;

/** 캔버스 흉내 — 무엇을 그렸는지 그대로 받아 둡니다 */
function 가짜컨텍스트() {
  const 기록 = [];
  const c = {
    _기록: 기록,
    _대시: [],
    lineWidth: 1, strokeStyle: "", fillStyle: "", font: "", textBaseline: "", textAlign: "",
    beginPath() { 기록.push({ op: "begin" }); },
    closePath() { 기록.push({ op: "close" }); },
    moveTo(x, y) { 기록.push({ op: "move", x: x, y: y }); },
    lineTo(x, y) { 기록.push({ op: "line", x: x, y: y }); },
    stroke() { 기록.push({ op: "stroke", w: c.lineWidth, color: c.strokeStyle }); },
    fill() { 기록.push({ op: "fill", color: c.fillStyle }); },
    setLineDash(d) { c._대시 = (d || []).slice(); },
    arc() {}, rect() {}, fillRect() {}, strokeRect() {},
    save() {}, restore() {}, clip() {},
    fillText(s, x, y) { 기록.push({ op: "text", s: s, x: x, y: y }); },
    strokeText() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, ellipse() {},
    translate() {}, scale() {}, rotate() {},
    measureText() { return { width: 40 }; }
  };
  return c;
}

/**
 * 모듈을 하나 띄웁니다.
 *   opts.width / opts.height  창 크기 (기본 1440x900)
 *   opts.칸너비               .chart-wrap 폭 (기본 600)
 *   opts.저장소               미리 넣어 둘 App.Storage 내용
 */
function 띄우기(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"chart-panel\"><div class=\"chart-wrap\">" +
      "<div id=\"chart_container\"><canvas></canvas></div></div></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = opts.width || 1440;
  win.innerHeight = opts.height || 900;
  win.fetch = undefined;
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function () { return 0; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;

  const canvas = win.document.querySelector("#chart_container canvas");
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400 });
  const 칸너비 = opts.칸너비 || 600;
  win.document.querySelector(".chart-wrap").getBoundingClientRect =
    () => ({ left: 20, top: 100, right: 20 + 칸너비, bottom: 500, width: 칸너비, height: 400 });

  const 저장소 = opts.저장소 || {};
  const 구독 = [];
  let 심볼 = opts.symbol || "BTCUSDT";
  let 간격 = opts.interval || "1m";

  const 캔들 = [];
  for (let i = 0; i < 500; i++) 캔들.push({ time: 첫봉 + i * 봉간격초, open: 1, high: 2, low: 0, close: 1 });

  let 클릭콜백 = null;
  let 프리미티브 = null;
  const 가격선 = [];
  let 보이는범위 = { from: 0, to: 100 };

  const series = {
    seriesType: () => "Candlestick",
    data: () => 캔들,
    attachPrimitive: (p) => { 프리미티브 = p; if (p.attached) p.attached({ requestUpdate: function () {} }); },
    detachPrimitive: () => { 프리미티브 = null; },
    createPriceLine: (o) => {
      const pl = { _o: o, _살아있나: true, applyOptions: (n) => { Object.assign(pl._o, n); } };
      가격선.push(pl);
      return pl;
    },
    removePriceLine: (pl) => {
      const i = 가격선.indexOf(pl);
      if (i >= 0) { 가격선[i]._살아있나 = false; 가격선.splice(i, 1); }
    },
    priceToCoordinate: (p) => 기준가 - p,
    coordinateToPrice: (y) => 기준가 - y,
    applyOptions: () => {}
  };

  const chart = {
    panes: () => [{ getSeries: () => [series] }],
    subscribeClick: (f) => { 클릭콜백 = f; },
    subscribeCrosshairMove: () => {},
    unsubscribeClick: () => {},
    unsubscribeCrosshairMove: () => {},
    timeScale: () => ({
      coordinateToLogical: (x) => x / 6,
      logicalToCoordinate: (l) => l * 6,
      timeToCoordinate: () => null,
      getVisibleLogicalRange: () => ({ from: 보이는범위.from, to: 보이는범위.to }),
      setVisibleLogicalRange: (r) => { 보이는범위 = { from: r.from, to: r.to }; },
      fitContent: () => { 보이는범위 = { from: 0, to: 100 }; }
    }),
    options: () => ({
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true }
    }),
    applyOptions: () => {},
    takeScreenshot: () => ({ toDataURL: () => "" })
  };

  win.App = {
    Storage: {
      save(k, v) { 저장소[k] = JSON.parse(JSON.stringify(v)); return true; },
      load(k) { return 저장소[k] ? JSON.parse(JSON.stringify(저장소[k])) : null; }
    },
    Config: { getActiveSymbol: () => 심볼, getActiveInterval: () => 간격 },
    Bus: {
      on(e, f) { 구독.push([e, f]); return f; },
      off() {},
      emit(e, p) { 구독.filter((c) => c[0] === e).forEach((c) => c[1](p)); }
    },
    ChartFont: { getCharts: () => [chart] }
  };

  /* opts.소스 를 주면 그것을 대신 태웁니다 — 「돌연변이 자체검증」 용입니다.
     장치를 일부러 빼 본 사본을 태워서 봉인이 진짜로 터지는지 확인합니다. */
  win.eval(opts.소스 || SRC);
  const M = win.App.ChartDrawings;

  function 톡(x, y) {
    if (!클릭콜백) return;
    클릭콜백({ point: { x: x, y: y }, logical: x / 6 });
  }

  function 그리기() {
    const ctx = 가짜컨텍스트();
    if (!프리미티브) return ctx;
    프리미티브.paneViews()[0].renderer().draw({
      useMediaCoordinateSpace: (fn) => fn({ mediaSize: { width: 600, height: 400 }, context: ctx })
    });
    return ctx;
  }

  return {
    win, dom, M, 톡, 그리기, 저장소,
    첫봉, 봉간격초, 기준가,
    가격선() { return 가격선.slice(); },
    보이는범위() { return { from: 보이는범위.from, to: 보이는범위.to }; },
    보이는범위설정(f, t) { 보이는범위 = { from: f, to: t }; },
    시각(x) { return Math.round(첫봉 + (x / 6) * 봉간격초); },
    도형() { return M.getDrawings().shapes; },
    가로선() { return M.getDrawings().hlines; },
    목록창() { return win.document.querySelector(".tl-draw-list"); },
    칩() { return win.document.querySelector(".tl-draw-chip"); },
    알림() { return win.document.querySelector(".tl-draw-toast"); },
    누르기(el) { el.dispatchEvent(new win.MouseEvent("click", { bubbles: true, cancelable: true })); },
    종목바꾸기(s) { 심볼 = s; win.App.Bus.emit("symbol:change", { symbol: s }); },
    간격바꾸기(v) { 간격 = v; win.App.Bus.emit("interval:change", { interval: v }); },
    닫기() { try { win.close(); } catch (e) { /* noop */ } }
  };
}

module.exports = { 띄우기, 가짜컨텍스트, SRC, SRC_PATH, REPO, 첫봉, 봉간격초, 기준가 };
