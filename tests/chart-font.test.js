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
    lib: Object.freeze({
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
      /* 실제 라이브러리에도 있는 다른 속성들 — 프로토타입으로 읽혀야 합니다. */
      CandlestickSeries: {},
      CrosshairMode: { Normal: 1 },
    }),
    created,
  };
}

function boot(lib) {
  const SITE_FONT = "'Noto Sans KR','Spoqa Han Sans Neo',sans-serif";
  const sandbox = {
    console: { warn() {}, log() {} },
    setInterval: () => 0,
    clearInterval: () => {},
    LightweightCharts: lib,
    document: {
      readyState: "complete",
      addEventListener() {},
      documentElement: {},
    },
    /* 사이트 글꼴을 CSS 변수에서 읽어오는지 확인하기 위한 흉내 */
    getComputedStyle: () => ({ getPropertyValue: (k) => (k === "--sans" ? " " + SITE_FONT + " " : "") }),
  };
  sandbox.__SITE_FONT = SITE_FONT;
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

  /* 실제 라이브러리는 Object.freeze 상태이고 createChart 가 읽기 전용입니다
     (실측: writable=false, configurable=false, isFrozen=true).
     그냥 대입하면 예외가 나 모듈 전체가 죽습니다 — 실제로 그렇게 죽어서
     글씨가 하나도 안 커졌던 적이 있습니다. 그래서 가짜 라이브러리도
     동결해 두고 검사합니다. */
  ok("동결된 라이브러리에서도 죽지 않는다", Object.isFrozen(lib));
  ok("원본 라이브러리는 그대로 둔다(전역만 교체)", lib.createChart !== sb.LightweightCharts.createChart);
  ok("나머지 속성은 프로토타입으로 읽힌다", sb.LightweightCharts.CandlestickSeries === lib.CandlestickSeries && sb.LightweightCharts.CrosshairMode.Normal === 1);

  /* chart.js 가 하는 것과 같은 호출 — fontSize 를 안 넘깁니다 */
  const chart = sb.LightweightCharts.createChart({}, {
    autoSize: true,
    layout: { background: { color: "transparent" }, textColor: "#333" },
  });

  ok("fontSize 가 끼워 넣어진다", chart.options().layout.fontSize === CF.getFontSize(), String(chart.options().layout.fontSize));
  ok("기본값 12px 보다 크다", CF.getFontSize() > 12, String(CF.getFontSize()));
  /* 주변 UI 실측 기준 — 호가창 숫자/주문창 계좌줄이 18.5px 입니다.
     차트 축만 작으면 눈에 띄므로 그 눈높이(18px 이상)를 지킵니다. */
  ok("호가창 숫자(18.5px)와 비슷한 크기", CF.getFontSize() >= 18, String(CF.getFontSize()));
  ok("과하게 크지는 않다(22px 이하)", CF.getFontSize() <= 22, String(CF.getFontSize()));
  {
    /* CSS 에서 실제 주변 크기를 읽어 비교합니다(값이 바뀌면 같이 잡히게). */
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const ob = Number((css.match(/\.ob-row\{[\s\S]*?font-size:([\d.]+)px/) || [])[1]);
    ok("호가창 크기를 읽어왔다", ob > 0, String(ob));
    ok("차트 축이 호가창보다 작지 않다", CF.getFontSize() >= ob, CF.getFontSize() + " vs " + ob);

    /* 차트 영역 안의 이웃 — 시간 버튼(1분/5분...)과 같은 눈높이여야 합니다. */
    const iv = Number((css.match(/\n\.interval-btn\{[\s\S]*?font-size:([\d.]+)px/) || [])[1]);
    ok("시간 버튼 크기를 읽어왔다", iv > 0, String(iv));
    ok("차트 축이 시간 버튼보다 작지 않다", CF.getFontSize() >= iv, CF.getFontSize() + " vs " + iv);
  }
  ok("원래 옵션은 그대로 남는다", chart.options().autoSize === true && chart.options().layout.textColor === "#333");

  /* 글꼴도 사이트와 맞춥니다 — chart.js 는 'JetBrains Mono' 를 쓰는데
     사이트는 본문 글꼴로 통일돼 있어 차트 축만 따로 놀았습니다. */
  ok("글꼴을 CSS 변수(--sans)에서 읽어 적용한다", chart.options().layout.fontFamily === sb.__SITE_FONT, chart.options().layout.fontFamily);
  ok("글꼴 이름을 코드에 박아두지 않았다", SRC.indexOf("Noto Sans") === -1 && SRC.indexOf("Pretendard") === -1);
  ok("만든 차트를 붙잡아 둔다", CF.getCharts().length === 1);
  ok("차트가 실제로 만들어졌다", created.length === 1);

  {
    /* chart.js 가 다른 글꼴을 지정해도 사이트 글꼴로 덮어야 합니다. */
    const c2 = sb.LightweightCharts.createChart({}, { layout: { fontFamily: "'JetBrains Mono', monospace" } });
    ok("chart.js 의 JetBrains Mono 를 사이트 글꼴로 덮는다", c2.options().layout.fontFamily === sb.__SITE_FONT, c2.options().layout.fontFamily);
  }
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
