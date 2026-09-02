/* tests/chart-bottombar.test.js
 * =========================================================================
 * 차트 아래 줄 3종 봉인 — 표시 기간 탭 · 날짜로 가기 · 차트 표시 시간대
 * =========================================================================
 * 2026-09-02 수리팀. 세 파일이 같이 지켜야 하는 약속을 못 박습니다.
 *   js/chart-date-range.js  js/chart-goto-date.js  js/chart-timezone.js
 *
 * ── ★제일 중요한 것 [1] — 한 번에 받는 500개를 넘으면 안 됩니다★ ────────
 *   js/config.js 의 KLINE_LIMIT 은 500 이고, js/chart.js 는 간격을 바꿀 때
 *   그 개수만 한 번 받아옵니다. 더 과거는 "왼쪽 끝까지 스크롤" 해야 옵니다.
 *   그래서 "표시 기간" 탭이 500봉보다 넓은 기간을 요구하면, 회원 화면에는
 *   ★기간은 넓은데 봉은 왼쪽 일부만 있는 빈 화면★ 이 나옵니다.
 *   오류도 안 나고 회원은 고장인 줄 모릅니다 — 이 프로젝트가 P1 로 부르는
 *   "조용한 고장" 입니다.
 *
 *   그래서 여기서 ★탭마다 실제로 나눠 봅니다.★ 누가 나중에 "1D 는 1분봉이
 *   보기 좋지" 하고 바꾸면(1440봉) 그 자리에서 빨강이 뜹니다.
 *
 * ── [2] 시간 단위 글자와 겹치면 안 됩니다 ───────────────────────────────
 *   시간 단위(1분·1일·1개월)와 표시 기간(1D·1M)은 뜻이 완전히 다릅니다.
 *   ★한글로 적으면 "1일"·"1주"·"1개월" 이 글자까지 똑같아집니다.★
 *   그래서 표시 기간은 영문으로 둔 것이고, 여기서 그 약속을 지킵니다.
 *
 * ── [3] 날짜로 가기도 같은 500개 한계를 지킵니다 ───────────────────────
 *   1년 전을 1분봉으로 보려면 52만 개가 필요합니다. 절대 못 갑니다.
 *   그래서 거리에 맞는 간격을 자동으로 고르는데, 그 사다리가 언제나
 *   450봉 안에 들어오는지 1분~10년까지 실제로 눌러 봅니다.
 *
 * ── [4] 시간대는 기본이 UTC 여야 합니다 ────────────────────────────────
 *   기본값을 바꾸면 ★아무도 안 건드렸는데★ 모든 회원의 차트 눈금이 움직입니다.
 *   그건 대표에게 보고하고 정할 일이지 조용히 바뀌면 안 됩니다.
 *   (트레이딩뷰도 BINANCE:BTCUSDT.P 기본이 UTC 입니다 — 2026-09-02 실측)
 *
 * ── [5] 세 파일이 ★같은 줄★ 을 씁니다 ──────────────────────────────────
 *   줄 id 가 어긋나면 차트 아래에 줄이 두 개 세 개 생깁니다.
 *
 * ── 이 파일은 파일만 읽습니다 ───────────────────────────────────────────
 *   서버도 브라우저도 안 씁니다. jsdom 도 안 씁니다 — 아주 작은 가짜 화면을
 *   만들어 모듈을 그대로 실행하고, 모듈이 내놓은 값을 봅니다.
 *   ★소스 글자를 정규식으로 긁지 않습니다★ (긁으면 주석만 고쳐도 빨강이 뜹니다).
 *
 * 되돌리기: 이 파일과 tests/_order.txt 의 해당 줄 삭제
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m✓" + ESC + "[0m";
const NGM = ESC + "[31m✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + OKM + " " + name);
  } else {
    fail++;
    실패목록.push(name + (detail ? "  →  " + detail : ""));
    console.log("  " + NGM + " " + name + (detail ? "\n      → " + detail : ""));
  }
}

/* =======================================================================
 * 아주 작은 가짜 화면 — 모듈이 붙을 자리가 없으면 스스로 물러납니다.
 * (세 모듈 다 .chart-panel 을 못 찾으면 아무 것도 안 그립니다)
 * ===================================================================== */
function fakeEl() {
  return {
    style: {},
    dataset: {},
    children: [],
    className: "",
    id: "",
    textContent: "",
    innerHTML: "",
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    removeChild() {},
    setAttribute() {},
    getAttribute() {
      return null;
    },
    addEventListener() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    },
    click() {},
    focus() {},
    scrollIntoView() {},
  };
}

function boot(opts) {
  opts = opts || {};
  const doc = {
    readyState: "complete",
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
      return fakeEl();
    },
    head: fakeEl(),
    documentElement: fakeEl(),
    body: fakeEl(),
  };
  const win = {
    App: {},
    document: doc,
    addEventListener() {},
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Intl,
    Date,
  };
  win.window = win;
  const ctx = vm.createContext(win);
  ctx.console = { log() {}, warn() {}, error() {} };

  /* 가짜 저장칸 — 회원 브라우저의 localStorage 자리입니다.
     opts.store 에 값을 넣으면 "이미 골라 저장해 둔 회원" 이 됩니다. */
  const store = Object.assign({}, opts.store || {});
  win.App.Storage = {
    load(k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    save(k, v) {
      store[k] = v;
    },
    clear(k) {
      delete store[k];
    },
  };

  /* 가짜 Bus */
  const subs = {};
  win.App.Bus = {
    on(name, fn) {
      (subs[name] = subs[name] || []).push(fn);
    },
    emit(name, payload) {
      (subs[name] || []).forEach(function (fn) {
        fn(payload);
      });
    },
  };

  /* 가짜 TL-004 방어 장치.
     ⚠ 막힌 간격 목록을 여기에 손으로 적지 않고 js/interval-guard.js 에서
       ★그대로 읽어옵니다.★ 그 파일이 목록을 바꾸면 이 검사도 같이 따라갑니다. */
  if (opts.guard !== false) {
    const guardSrc = fs.readFileSync(path.join(REPO, "js/interval-guard.js"), "utf8");
    const m = guardSrc.match(/var BLOCKED = [{]([^}]*)[}]/);
    const blocked = {};
    if (m) {
      m[1].split(",").forEach(function (piece) {
        const mm = piece.match(/"([^"]+)"[ ]*:[ ]*true/);
        if (mm) blocked[mm[1]] = true;
      });
    }
    win.App.IntervalGuard = {
      isBlocked(v) {
        return !!blocked[v];
      },
      getBlocked() {
        return Object.keys(blocked);
      },
    };
  }

  [
    "js/config.js",
    "js/interval-remember.js",
    "js/chart-date-range.js",
    "js/chart-goto-date.js",
    "js/chart-timezone.js",
  ].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(REPO, f), "utf8"), ctx, { filename: f });
  });
  ctx.App.__store = store;
  return ctx.App;
}

const App = boot();
const Config = App.Config;
const DR = App.ChartDateRange;
const GD = App.ChartGotoDate;
const TZ = App.ChartTimezone;

const INTERVALS = Config.getIntervals();
function iv(value) {
  for (let i = 0; i < INTERVALS.length; i++) if (INTERVALS[i].value === value) return INTERVALS[i];
  return null;
}

console.log("\n차트 아래 줄 — 표시 기간 · 날짜로 가기 · 시간대");

/* =======================================================================
 * [0] 세 모듈이 다 실렸는가
 * ===================================================================== */
console.log("\n[0] 세 모듈이 실린다");
ok("App.ChartDateRange 가 있다", !!DR);
ok("App.ChartGotoDate 가 있다", !!GD);
ok("App.ChartTimezone 가 있다", !!TZ);
ok("App.Config.KLINE_LIMIT 을 읽을 수 있다", typeof Config.KLINE_LIMIT === "number", String(Config.KLINE_LIMIT));

/* =======================================================================
 * [1] ⭐ 표시 기간 탭 — 한 번에 받는 봉 수를 넘지 않는다
 * ===================================================================== */
console.log("\n[1] ⭐ 표시 기간 탭이 " + Config.KLINE_LIMIT + "봉을 넘지 않는다");
{
  const LIMIT = Config.KLINE_LIMIT;
  ok("탭이 9개다 (트레이딩뷰와 같은 구성)", DR.TABS.length === 9, "지금 " + DR.TABS.length + "개");

  DR.TABS.forEach(function (t) {
    const def = iv(t.interval);
    ok(
      t.id + " 의 봉 간격 " + t.interval + " 이 js/config.js 에 있다",
      !!def,
      def ? "" : "INTERVALS 에 없는 값입니다"
    );
    if (!def) return;
    /* ★비-native 간격(1초·5초·15초)은 REST 에 과거 데이터가 아예 없습니다.★
       그걸 고르면 차트가 빈 채로 시작합니다 — 조용한 고장입니다. */
    ok(t.id + " 의 봉 간격이 native 다 (과거 데이터가 있는 간격)", def.native === true);

    if (t.seconds === null) return; /* ALL — 있는 데까지라 개수 제한이 없습니다 */
    const 기간 = t.seconds === "ytd" ? 366 * 86400 : t.seconds; /* YTD 는 최대 366일 */
    const 봉 = Math.ceil(기간 / def.seconds);
    ok(
      t.id + " 는 " + 봉 + "봉 (" + LIMIT + " 이하)",
      봉 <= LIMIT,
      봉 > LIMIT ? "한 번에 못 받아 화면이 비게 됩니다" : ""
    );
  });
}

/* =======================================================================
 * [2] 표시 기간 글자가 시간 단위 글자와 겹치지 않는다
 * ===================================================================== */
console.log("\n[2] 표시 기간 글자가 시간 단위 글자와 안 겹친다");
{
  const 단위글자 = INTERVALS.map(function (x) {
    return x.label;
  });
  DR.TABS.forEach(function (t) {
    ok(
      "표시 기간 '" + t.id + "' 이 시간 단위 이름과 다르다",
      단위글자.indexOf(t.id) === -1,
      "시간 단위에도 같은 글자가 있습니다"
    );
  });
  const ids = DR.TABS.map(function (t) {
    return t.id;
  });
  ok("표시 기간 탭 이름이 서로 겹치지 않는다", new Set(ids).size === ids.length);
}

/* =======================================================================
 * [3] ⭐ 날짜로 가기 — 어떤 날짜를 골라도 한 번에 받을 수 있는 간격을 고른다
 * ===================================================================== */
console.log("\n[3] ⭐ 날짜로 가기가 고르는 간격");
{
  const 거리들 = [
    ["1분", 60],
    ["1시간", 3600],
    ["하루", 86400],
    ["3일", 3 * 86400],
    ["한 달", 30 * 86400],
    ["6개월", 180 * 86400],
    ["1년", 365 * 86400],
    ["5년", 1825 * 86400],
    ["10년", 3650 * 86400],
  ];
  거리들.forEach(function (row) {
    const value = GD.pickInterval(row[1]);
    const def = iv(value);
    ok(row[0] + " 전 → " + value + " 이 js/config.js 에 있다", !!def);
    if (!def) return;
    ok(row[0] + " 전 → " + value + " 이 native 다", def.native === true);
    const 봉 = Math.ceil(row[1] / def.seconds);
    ok(
      row[0] + " 전 → " + 봉 + "봉 (" + Config.KLINE_LIMIT + " 이하)",
      봉 <= Config.KLINE_LIMIT,
      봉 > Config.KLINE_LIMIT ? "한 번에 못 받습니다" : ""
    );
  });
}

/* =======================================================================
 * [4] 시간대 — 기본값은 UTC
 * ===================================================================== */
console.log("\n[4] 차트 표시 시간대");
{
  /* ★2026-09-02 PM 결정 — 기본값이 UTC → "내 컴퓨터 시간" 으로 바뀌었습니다.★
     UTC 로 두면 차트(UTC)와 거래내역(내 컴퓨터 시간)이 9시간 어긋난 채로 남아,
     회원이 체결 시각의 봉을 ★엉뚱한 자리★ 에서 찾게 됩니다(P1).
     여기서 못 박는 것 — 이 기본값이 ★조용히 되돌아가지 않게★. */
  ok("기본값이 '내 컴퓨터 시간' 이다 (거래내역과 같은 시각)", TZ.getZone() === "LOCAL", TZ.getZone());
  ok("첫 번째 항목이 기본값과 같다", TZ.ZONES[0] && TZ.ZONES[0].id === "LOCAL");
  ok("UTC 도 목록에 그대로 있다", TZ.ZONES.some(function (z) { return z.id === "UTC"; }));
  const ids = TZ.ZONES.map(function (z) {
    return z.id;
  });
  ok("시간대 이름이 서로 겹치지 않는다", new Set(ids).size === ids.length);
  ok("한국 시간을 고를 수 있다 (거래내역과 맞추려면 필요)", ids.indexOf("KST") !== -1);

  TZ.ZONES.forEach(function (z) {
    if (!z.tz) return; /* 내 컴퓨터 시간 — 브라우저가 알려줍니다 */
    let good = true;
    try {
      new Intl.DateTimeFormat("en-GB", { timeZone: z.tz }).format(new Date());
    } catch (e) {
      good = false;
    }
    ok(z.label + " (" + z.tz + ") 가 실제로 있는 시간대다", good);
  });

  /* 서울은 UTC+9 로 9시간 앞이어야 합니다 — 계산이 뒤집히면 여기서 잡힙니다 */
  const ms = Date.UTC(2026, 8, 2, 10, 27, 0);
  function 시(tz) {
    const f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    });
    return f.format(new Date(ms));
  }
  ok("같은 순간이 UTC 10:27 · 서울 19:27 이다", 시("UTC") === "10:27" && 시("Asia/Seoul") === "19:27",
    시("UTC") + " / " + 시("Asia/Seoul"));
}

/* =======================================================================
 * [4-2] ⭐ 이미 골라 저장해 둔 회원의 선택이 기본값보다 우선
 * ===================================================================== */
console.log("");
console.log("[4-2] ⭐ 저장해 둔 시간대가 기본값을 이긴다");
{
  const A = boot({ store: { "chart-timezone": { zone: "UTC" } } });
  ok("UTC 를 골라 뒀으면 새로고침해도 UTC 다", A.ChartTimezone.getZone() === "UTC", A.ChartTimezone.getZone());
  const B = boot({ store: { "chart-timezone": { zone: "NY" } } });
  ok("뉴욕을 골라 뒀으면 뉴욕이다", B.ChartTimezone.getZone() === "NY", B.ChartTimezone.getZone());
  const C = boot({ store: { "chart-timezone": { zone: "없는값" } } });
  ok("저장값이 이상하면 기본값으로 간다", C.ChartTimezone.getZone() === "LOCAL", C.ChartTimezone.getZone());
}

/* =======================================================================
 * [4-3] ⭐ 시간 단위 기억하기 (js/interval-remember.js)
 * ===================================================================== */
console.log("");
console.log("[4-3] ⭐ 시간 단위 기억하기");
{
  const A = boot();
  ok("저장한 적이 없으면 js/config.js 기본값(1분) 그대로", A.Config.getActiveInterval() === "1m", A.Config.getActiveInterval());
  ok("아무것도 안 되살렸다고 답한다", A.IntervalRemember.getRestored() === null);

  const B = boot({ store: { "chart-interval": { interval: "15m" } } });
  ok("저장해 둔 15분으로 열린다", B.Config.getActiveInterval() === "15m", B.Config.getActiveInterval());

  const C = boot({ store: { "chart-interval": { interval: "2h" } } });
  ok("더보기 안에 있는 2시간도 되살아난다", C.Config.getActiveInterval() === "2h", C.Config.getActiveInterval());

  /* ★TL-004★ — 1초·5초·15초는 시세 신호가 0회라 강제청산·손절·익절이 조용히
     멈춥니다. 저장칸에 남아 있어도 ★되살리면 안 됩니다.★ */
  const blockedList = boot().IntervalGuard.getBlocked();
  ok("막힌 간격 목록을 js/interval-guard.js 에서 읽어왔다", blockedList.length > 0, blockedList.join(","));
  blockedList.forEach(function (v) {
    const D = boot({ store: { "chart-interval": { interval: v } } });
    ok(v + " 는 되살리지 않는다 (TL-004 — 강제청산·손절이 멈추는 간격)",
      D.Config.getActiveInterval() === "1m", D.Config.getActiveInterval());
    ok(v + " 를 만나면 저장칸도 1분으로 고쳐 둔다 (다음에 또 시도하지 않게)",
      D.__store["chart-interval"] && D.__store["chart-interval"].interval === "1m",
      JSON.stringify(D.__store["chart-interval"]));
  });

  const E = boot({ store: { "chart-interval": { interval: "없는간격" } } });
  ok("목록에 없는 값이면 그냥 기본값으로 둔다", E.Config.getActiveInterval() === "1m", E.Config.getActiveInterval());

  /* 버튼 · 더보기 · 표시 기간 탭 · 날짜로 가기 — 전부 이 한 길을 지납니다 */
  const F = boot();
  F.Config.setActiveInterval("4h");
  ok("간격이 바뀌면 저장된다", F.__store["chart-interval"] && F.__store["chart-interval"].interval === "4h",
    JSON.stringify(F.__store["chart-interval"]));
  F.Config.setActiveInterval("1d");
  ok("다시 바뀌면 새 값으로 덮인다", F.__store["chart-interval"].interval === "1d",
    JSON.stringify(F.__store["chart-interval"]));
}

/* =======================================================================
 * [5] 세 파일이 같은 줄을 쓴다
 * ===================================================================== */
console.log("\n[5] 세 파일이 차트 아래 ★같은 줄★ 을 쓴다");
{
  const 줄 = DR.BAR_ID;
  ok("표시 기간이 쓰는 줄 id 가 있다", typeof 줄 === "string" && 줄.length > 0, String(줄));
  ["js/chart-goto-date.js", "js/chart-timezone.js"].forEach(function (f) {
    const src = fs.readFileSync(path.join(REPO, f), "utf8");
    ok(f + " 도 같은 줄(" + 줄 + ")을 쓴다", src.indexOf('"' + 줄 + '"') !== -1);
  });
}

/* =======================================================================
 * [6] index.html 이 세 파일을 부른다
 * ===================================================================== */
console.log("\n[6] index.html 이 세 파일을 부른다");
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  ["js/chart-date-range.js", "js/chart-goto-date.js", "js/chart-timezone.js"].forEach(function (f) {
    ok(f + " 를 부른다", html.indexOf('src="' + f + '"') !== -1);
  });

  /* ★순서가 중요합니다★ — 시간 단위 기억은 js/config.js 뒤, js/chart.js 앞이어야
     합니다. 뒤로 밀리면 1분봉을 받았다가 저장된 간격으로 ★다시 받습니다★. */
  const i기억 = html.indexOf('src="js/interval-remember.js"');
  const i설정 = html.indexOf('src="js/config.js"');
  const i차트 = html.indexOf('src="js/chart.js"');
  ok("js/interval-remember.js 를 부른다", i기억 !== -1);
  ok("js/config.js 보다 뒤에 있다", i설정 !== -1 && i기억 > i설정);
  ok("js/chart.js 보다 ★앞★ 에 있다 (한 번만 불러오게)", i차트 !== -1 && i기억 < i차트);
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach(function (s) {
    console.log("  · " + s);
  });
}
process.exit(fail ? 1 : 0);
