/* tests/chart-font.test.js
 * 차트 축 글씨 크기(js/chart-font.js) 검증.
 *
 * 차트는 캔버스에 그려져서 CSS 로 글씨를 못 키웁니다. 라이브러리의
 * layout.fontSize 로만 바뀌는데, js/chart.js 는 수정 금지 파일이고
 * 차트 객체를 밖으로 내주지도 않습니다. 그래서 createChart 를 감싸는
 * 방식을 씁니다 — 그 감싸기가 실제로 동작하는지 가짜 라이브러리로 확인합니다.
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
    console.log("  \u001b[32m✓\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "chart-font.js"), "utf8");

/* 가짜 Lightweight Charts — createChart 가 받은 옵션을 그대로 보관합니다. */
function makeFakeLib() {
  const created = [];
  return {
    lib: {
      createChart(container, options) {
        const state = { options: JSON.parse(JSON.stringify(options || {})) };
        const chart = {
          options: () => state.options,
          applyOptions(o) {
            if (o && o.layout) Object.assign(state.options.layout || (state.options.layout = {}), o.layout);
          },
        };
        created.push({ container, chart, opts: state.options });
        return chart;
      },
    },
    created,
  };
}

function boot(lib) {
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    LightweightCharts: lib,
    document: { readyState: "complete", addEventListener() {} },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SRC, sandbox);
  return sandbox;
}

console.log("\n차트 글씨 크기");

/* ---- 기본 동작 ---- */
{
  const { lib, created } = makeFakeLib();
  const sb = boot(lib);
  const CF = sb.App.ChartFont;

  ok("모듈이 뜬다", !!CF);
  ok("라이브러리를 감쌌다", !!sb.LightweightCharts.__fontPatched);

  /* chart.js 가 하는 것과 같은 호출 — fontSize 를 안 넘깁니다 */
  const chart = sb.LightweightCharts.createChart({}, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: "#333" },
  });

  ok("fontSize 가 끼워 넣어진다", chart.options().layout.fontSize === CF.getFontSize(), String(chart.options().layout.fontSize));
  ok("기본값 12px 보다 크다", CF.getFontSize() > 12, String(CF.getFontSize()));
  ok("16px 이상으로 키웠다", CF.getFontSize() >= 16, String(CF.getFontSize()));
  ok("원래 옵션은 그대로 남는다", chart.options().autoSize === true && chart.options().layout.textColor === "#333");
  ok("만든 차트를 붙잡아 둔다", CF.getCharts().length === 1);
  ok("차트가 실제로 만들어졌다", created.length === 1);
}

/* ---- chart.js 가 직접 크기를 정하면 존중 ---- */
{
  const { lib } = makeFakeLib();
  const sb = boot(lib);
  const chart = sb.LightweightCharts.createChart({}, { layout: { fontSize: 9 } });
  ok("호출자가 fontSize 를 정했으면 덮어쓰지 않는다", chart.options().layout.fontSize === 9, String(chart.options().layout.fontSize));
}

/* ---- layout 이 아예 없을 때 ---- */
{
  const { lib } = makeFakeLib();
  const sb = boot(lib);
  const chart = sb.LightweightCharts.createChart({}, {});
  ok("layout 이 없어도 만들어 넣는다", chart.options().layout.fontSize === sb.App.ChartFont.getFontSize());
  const chart2 = sb.LightweightCharts.createChart({});
  ok("옵션 자체가 없어도 터지지 않는다", chart2.options().layout.fontSize === sb.App.ChartFont.getFontSize());
}

/* ---- 나중에 크기 바꾸기 ---- */
{
  const { lib } = makeFakeLib();
  const sb = boot(lib);
  const CF = sb.App.ChartFont;
  const chart = sb.LightweightCharts.createChart({}, {});
  CF.setFontSize(22);
  ok("이미 만들어진 차트에도 반영된다", chart.options().layout.fontSize === 22, String(chart.options().layout.fontSize));
  const chart2 = sb.LightweightCharts.createChart({}, {});
  ok("그 뒤에 만든 차트에도 반영된다", chart2.options().layout.fontSize === 22);
  CF.setFontSize(0);
  ok("0 이나 잘못된 값은 무시한다", CF.getFontSize() === 22);
  CF.setFontSize("abc");
  ok("숫자가 아니면 무시한다", CF.getFontSize() === 22);
}

/* ---- 두 번 실려도 안전 ---- */
{
  const { lib } = makeFakeLib();
  const sb = boot(lib);
  const first = sb.LightweightCharts.createChart;
  vm.runInContext(SRC, sb); // 같은 파일이 또 실린 상황
  ok("두 번 패치하지 않는다(무한 중첩 방지)", sb.LightweightCharts.createChart === first);
}

/* ---- 로드 순서 ---- */
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  /* 주석에도 파일명이 적혀 있어서 script 태그만 골라 봅니다. */
  const tags = (html.match(/<script src="[^"]+"><\/script>/g) || []);
  const at = (needle) => tags.findIndex((t) => t.indexOf(needle) !== -1);
  const lib = at("lightweight-charts");
  const font = at("js/chart-font.js");
  const chart = at("js/chart.js");
  ok("세 스크립트가 모두 연결돼 있다", lib >= 0 && font >= 0 && chart >= 0, [lib, font, chart].join(","));
  ok("라이브러리 -> chart-font.js -> chart.js 순서", lib < font && font < chart, [lib, font, chart].join(" < "));

  const chartJs = fs.readFileSync(path.join(REPO, "js", "chart.js"), "utf8");
  ok("chart.js 는 건드리지 않았다(fontSize 미지정)", chartJs.indexOf("fontSize") === -1);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
