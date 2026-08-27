/* tests/orderbook-mark-price-seal.test.js
 * =========================================================================
 * 마크가격 줄 — "안 오면 빈칸" 을 못 박습니다
 * =========================================================================
 * 2026-08-27 — 본부장 배정 / 기록팀 봉인 (그전까지 봉인 0건)
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *
 * js/orderbook-mark-price.js 는 35줄짜리 표시 전용 모듈입니다.
 * chart.js 가 이미 구독하는 'funding:update' 를 **독립적으로 한 번 더**
 * 구독해서 payload.markPrice 를 화면에 적기만 합니다.
 *
 * 그래서 위험이 딱 하나입니다 —
 *
 *   이벤트가 안 오면 화면이 "-" 인 채로 가만히 있습니다.
 *   오류도 안 나고 화면도 멀쩡합니다. **회원은 고장인 줄 모릅니다.**
 *   (CLAUDE.md 가 P1 로 못 박은 "조용한 고장" 그 자체입니다.
 *    최근 체결이 영구히 비어 있던 사건과 같은 모양입니다.)
 *
 * 조용한 고장을 코드가 만들지 않게 하려면 반대로 이렇게 돼야 합니다 —
 *
 *   안 오면 **처음 값("-") 그대로**여야 한다.
 *     0 이나 NaN 이나 undefined 를 적어 놓으면 회원은 그걸 **진짜 마크가격으로
 *     믿고** 판단합니다. 빈칸은 "아직 없다" 로 읽히지만 0 은 "0원" 으로 읽힙니다.
 *
 * ── 못 박는 것 ─────────────────────────────────────────────────────────
 *   [2] 배선 — index.html 이 부르고 main.js 가 init 을 부르고 마크업이 있다
 *   [3] 구독 — 'funding:update' 를 정확히 그 이름으로 1개만 구독한다
 *   [4] 안 오면 빈칸 — 이벤트 0회면 "-" 그대로, 오류 0건    ← 핵심
 *   [5] 쓰레기값 방어 — 숫자가 아니면 화면을 아예 안 건드린다
 *   [6] 종목 — 다른 종목의 마크가격을 내 종목 칸에 적지 않는다
 *   [7] 표기 — Utils.formatCurrencyPlain 을 쓴다(옆 항목과 같은 표기)
 *   [8] 마크업이 없으면 조용히 끝내고 구독도 안 한다
 *   [9] 수정 금지 파일 12개 무변경
 *
 * ⚠ 이 파일은 가짜 Bus·가짜 Config 만 씁니다. 서버에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = path.join(REPO, "js/orderbook-mark-price.js");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* -------------------------------------------------------------------------
 * 모듈을 올릴 최소 환경
 * -------------------------------------------------------------------------
 * index.html 전체를 태우지 않습니다. 이 모듈이 실제로 쓰는 것만 흉내 냅니다 —
 * document / App.Bus / App.Config.getActiveSymbol / App.Utils.formatCurrencyPlain.
 * 진짜 Utils 를 태워서 **표기까지 실제 함수로** 확인합니다.
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const 마크업있음 = opts.마크업 !== false;
  const html = 마크업있음
    ? '<div class="ob-mark-price-row">마크가격 <b id="ob-mark-price">-</b></div>'
    : "<div></div>";

  const dom = new JSDOM("<!doctype html><html><body>" + html + "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  const 구독 = [];      /* [이벤트이름, 함수] */
  const 오류 = [];
  win.console = {
    log() {}, warn() {}, info() {}, debug() {},
    error(...a) { 오류.push(a.join(" ")); },
  };

  win.App = {
    Bus: {
      on(e, f) { 구독.push([e, f]); return f; },
      off() {},
      emit(e, p) {
        구독.filter((c) => c[0] === e).forEach((c) => {
          try { c[1](p); } catch (err) { 오류.push(String(err && err.message || err)); }
        });
      },
    },
    Config: {
      getActiveSymbol: () => opts.활성종목 || "BTCUSDT",
      getDisplayCurrency: () => opts.통화 || "USDT",
      USD_KRW: 1380,
    },
  };

  /* 진짜 js/utils.js 를 태웁니다 — 표기를 흉내 내면 확인이 무의미해집니다. */
  win.eval(fs.readFileSync(path.join(REPO, "js/utils.js"), "utf8"));
  win.eval(fs.readFileSync(SRC, "utf8"));

  return {
    win, dom, 구독, 오류,
    App: win.App,
    칸: () => win.document.getElementById("ob-mark-price"),
    글자: () => {
      const el = win.document.getElementById("ob-mark-price");
      return el ? el.textContent : null;
    },
  };
}

/* =========================================================================
 * [1] 파일이 있다
 * ========================================================================= */
절("[1] 모듈 파일");
{
  ok("js/orderbook-mark-price.js 가 있다", fs.existsSync(SRC));
  const src = fs.readFileSync(SRC, "utf8");
  ok("35줄 안팎의 표시 전용 모듈이다", src.split(/\r?\n/).length <= 80,
    "줄 수: " + src.split(/\r?\n/).length + " — 커졌으면 표시 말고 다른 일을 하기 시작한 것입니다");
  ok("서버(fetch/WebSocket/supabase)를 직접 부르지 않는다",
    !/fetch\s*\(|new\s+WebSocket|supabase/i.test(src),
    "표시 전용 모듈이 직접 데이터를 가져오기 시작하면 chart.js 와 두 벌이 됩니다");
}

/* =========================================================================
 * [2] 배선 — 안 불리면 아무 일도 안 일어납니다
 * ========================================================================= */
절("[2] 배선 — index.html · main.js · 마크업");
{
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(REPO, "main.js"), "utf8");

  ok("index.html 이 js/orderbook-mark-price.js 를 부른다",
    html.indexOf('src="js/orderbook-mark-price.js"') >= 0);
  ok("index.html 에 <b id=\"ob-mark-price\"> 칸이 있다",
    /id="ob-mark-price"/.test(html),
    "이 id 가 바뀌면 모듈이 조용히 종료합니다 — 마크가격 줄이 영영 '-' 로 남습니다");
  ok("마크가격 칸의 처음 값이 '-' 다", /id="ob-mark-price"[^>]*>-</.test(html.replace(/\s+/g, " ")),
    "0 으로 두면 값이 안 와도 회원이 '0' 을 진짜 마크가격으로 믿습니다");
  ok("main.js 가 OrderbookMarkPrice 를 init 목록에 넣는다",
    main.indexOf('"OrderbookMarkPrice"') >= 0);
}

/* =========================================================================
 * [3] 구독 — 이름 하나 틀리면 영영 안 옵니다
 * ========================================================================= */
절("[3] funding:update 를 정확히 1개 구독한다");
{
  const t = 띄우기();
  t.App.OrderbookMarkPrice.init();

  const 이름들 = t.구독.map((c) => c[0]);
  ok("init() 뒤 구독이 정확히 1개다 (" + 이름들.length + "개)", 이름들.length === 1,
    "구독: " + JSON.stringify(이름들));
  ok("구독하는 이벤트 이름이 'funding:update' 다", 이름들[0] === "funding:update",
    "실제: " + 이름들[0] + " — 이름이 한 글자만 달라도 값이 영영 안 오고, 오류도 안 납니다");
}

/* =========================================================================
 * [4] ⭐ 안 오면 빈칸 — 이 파일의 핵심
 * ========================================================================= */
절("[4] ⭐ 이벤트가 한 번도 안 오면 '-' 그대로다 (조용한 고장 방지)");
{
  const t = 띄우기();
  const 처음 = t.글자();
  t.App.OrderbookMarkPrice.init();

  ok("init() 만으로는 화면을 건드리지 않는다", t.글자() === 처음,
    "처음 '" + 처음 + "' → 지금 '" + t.글자() + "'");
  ok("이벤트 0회면 값이 '-' 다", t.글자() === "-",
    "실제: '" + t.글자() + "'");
  ok("0 이 적혀 있지 않다", t.글자() !== "0" && t.글자() !== "0.00",
    "0 을 적으면 회원이 '마크가격이 0원' 으로 읽습니다");
  ok("NaN / undefined / null 이 적혀 있지 않다",
    ["NaN", "undefined", "null", ""].indexOf(t.글자()) < 0, "실제: '" + t.글자() + "'");
  ok("오류를 뿜지 않는다 (0건)", t.오류.length === 0, t.오류.join(" | "));

  /* 시간이 지나도(다른 이벤트가 지나가도) 여전히 빈칸 */
  t.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 12345 });
  t.App.Bus.emit("orderbook:update", {});
  ok("다른 이벤트로는 마크가격이 채워지지 않는다", t.글자() === "-",
    "실제: '" + t.글자() + "' — funding:update 말고 다른 것으로 채우면 마크가격이 아닙니다");
}

/* =========================================================================
 * [5] 쓰레기값 방어 — 숫자가 아니면 아예 안 건드린다
 * -------------------------------------------------------------------------
 * payload.markPrice 는 chart.js 가 실어 보냅니다. 서버가 문자열("62000.5")
 * 로 주거나 필드가 빠지는 날이 옵니다. 그때 화면에 "62000.5" 나 "NaN" 이나
 * "0" 이 뜨면 안 됩니다. **빈칸이 정답입니다.**
 * ========================================================================= */
절("[5] markPrice 가 숫자가 아니면 화면을 안 건드린다");
{
  const 나쁜값 = [
    ["필드 없음", {}],
    ["undefined", { markPrice: undefined }],
    ["null", { markPrice: null }],
    ["문자열 '62000.5'", { markPrice: "62000.5" }],
    ["빈 문자열", { markPrice: "" }],
    ["NaN", { markPrice: NaN }],
    ["true", { markPrice: true }],
    ["객체", { markPrice: { v: 1 } }],
  ];
  for (const [이름, extra] of 나쁜값) {
    const t = 띄우기();
    t.App.OrderbookMarkPrice.init();
    const p = Object.assign({ symbol: "BTCUSDT" }, extra);
    t.App.Bus.emit("funding:update", p);
    ok("markPrice=" + 이름 + " → 여전히 '-' 이고 오류 0건",
      t.글자() === "-" && t.오류.length === 0,
      "글자 '" + t.글자() + "' / 오류 " + t.오류.length + "건: " + t.오류.join(" | "));
  }

  /* NaN 은 typeof 가 "number" 라 통과할 수 있습니다 — 실제로 무엇이 적히는지 확인.
     2026-08-27 실측: typeof NaN === "number" 이지만 Utils.formatCurrencyPlain 이
     isNaN 을 먼저 걸러 "-" 를 돌려주므로 화면에는 "-" 가 남습니다. 이중 방어입니다. */
  {
    const t = 띄우기();
    t.App.OrderbookMarkPrice.init();
    t.App.Bus.emit("funding:update", { symbol: "BTCUSDT", markPrice: NaN });
    ok("NaN 은 typeof 가 number 라도 화면에 'NaN' 이 안 뜬다", t.글자().indexOf("NaN") < 0,
      "실제: '" + t.글자() + "'");
  }
}

/* =========================================================================
 * [6] 종목 — 남의 종목 값을 내 칸에 적지 않는다
 * -------------------------------------------------------------------------
 * 2026-08-27 은 종목 전환(나스닥·삼성전자·SK하이닉스)이 열린 날입니다.
 * 커밋 4개가 이 구간에 몰렸습니다. 종목 표식이 빠지면 비트코인 칸에
 * 삼성전자 마크가격이 뜨는 조용한 고장이 됩니다.
 * ========================================================================= */
절("[6] 활성 종목이 아닌 funding:update 는 무시한다");
{
  const t = 띄우기({ 활성종목: "BTCUSDT" });
  t.App.OrderbookMarkPrice.init();

  t.App.Bus.emit("funding:update", { symbol: "ETHUSDT", markPrice: 3000 });
  ok("다른 종목(ETHUSDT) 값은 안 적힌다", t.글자() === "-", "실제: '" + t.글자() + "'");

  t.App.Bus.emit("funding:update", { symbol: "005930", markPrice: 71000 });
  ok("다른 종목(삼성전자 005930) 값도 안 적힌다", t.글자() === "-", "실제: '" + t.글자() + "'");

  t.App.Bus.emit("funding:update", { symbol: "BTCUSDT", markPrice: 62345.678 });
  ok("활성 종목 값은 적힌다", t.글자() !== "-", "실제: '" + t.글자() + "'");

  /* 종목이 바뀐 뒤 옛 종목 값이 다시 들어와도 덮어쓰지 않는다 */
  const t2 = 띄우기({ 활성종목: "ETHUSDT" });
  t2.App.OrderbookMarkPrice.init();
  t2.App.Bus.emit("funding:update", { symbol: "ETHUSDT", markPrice: 3000 });
  const eth = t2.글자();
  t2.App.Bus.emit("funding:update", { symbol: "BTCUSDT", markPrice: 62345.678 });
  ok("종목을 바꾼 뒤 옛 종목 값이 들어와도 덮어쓰지 않는다", t2.글자() === eth,
    "'" + eth + "' 였는데 '" + t2.글자() + "' 로 바뀌었습니다");
  ok("symbol 이 없는 payload 는 무시한다 (활성 종목과 다르므로)",
    (function () {
      const t3 = 띄우기({ 활성종목: "BTCUSDT" });
      t3.App.OrderbookMarkPrice.init();
      t3.App.Bus.emit("funding:update", { markPrice: 99999 });
      return t3.글자() === "-";
    })(), "종목을 모르는 값은 어느 칸에도 적으면 안 됩니다");
}

/* =========================================================================
 * [7] 표기 — 옆 항목과 같은 포맷터를 쓴다
 * -------------------------------------------------------------------------
 * 2026-08-27 통화 전환(8f27ad7) 이 들어왔습니다. 마크가격만 다른 포맷터를
 * 쓰면 원화로 바꿨을 때 이 줄만 달러로 남습니다.
 * Utils.formatCurrencyPlain 하나만 거치면 통화 전환이 저절로 따라옵니다.
 * ========================================================================= */
절("[7] 표기 — Utils.formatCurrencyPlain 을 쓴다 (통화 전환 따라감)");
{
  const src = fs.readFileSync(SRC, "utf8");
  ok("소스가 formatCurrencyPlain 을 쓴다", src.indexOf("formatCurrencyPlain") >= 0);
  ok("자기만의 통화 계산(USD_KRW / toFixed / * 1380)을 하지 않는다",
    !/USD_KRW|toFixed\s*\(|1380/.test(src),
    "직접 환산하면 환율이 바뀔 때 이 줄만 옛 환율로 남습니다");

  const usdt = 띄우기({ 통화: "USDT" });
  usdt.App.OrderbookMarkPrice.init();
  usdt.App.Bus.emit("funding:update", { symbol: "BTCUSDT", markPrice: 62345.678 });
  ok("USDT 일 때 '62,345.68' 로 적힌다", usdt.글자() === "62,345.68", "실제: '" + usdt.글자() + "'");
  ok("USDT 일 때 원화 표기가 안 붙는다",
    usdt.글자().indexOf("원") < 0 && usdt.글자().indexOf("₩") < 0, "실제: '" + usdt.글자() + "'");

  const krw = 띄우기({ 통화: "KRW" });
  krw.App.OrderbookMarkPrice.init();
  krw.App.Bus.emit("funding:update", { symbol: "BTCUSDT", markPrice: 62345.678 });
  /* 2026-08-28 디자인팀 — 원화 표기를 "₩ 앞" 하나로 통일했습니다(전에는 "…원").
     검사 내용은 같습니다 — 원화일 때 원화 표기가 붙는가. */
  ok("KRW 일 때 '₩' 가 붙는다", /^₩/.test(krw.글자()), "실제: '" + krw.글자() + "'");
  ok("KRW 일 때 '원' 이 뒤에 남지 않는다(두 방식이 섞이면 안 됩니다)",
    !/원$/.test(krw.글자()), "실제: '" + krw.글자() + "'");
  ok("KRW 일 때 달러 기호가 안 붙는다", krw.글자().indexOf("$") < 0, "실제: '" + krw.글자() + "'");
  ok("USDT 표기와 KRW 표기가 서로 다르다", usdt.글자() !== krw.글자(),
    "같으면 통화 전환이 이 줄에 안 먹은 것입니다");
}

/* =========================================================================
 * [8] 마크업이 없으면 조용히 끝낸다 (구독도 안 한다)
 * -------------------------------------------------------------------------
 * 구독만 해두고 dom.markPrice 가 null 이면 체결마다 헛돌기만 합니다.
 * 지금 코드는 구독 전에 빠져나갑니다. 그 순서를 못 박습니다.
 * ========================================================================= */
절("[8] 마크업이 없으면 조용히 끝내고 구독도 안 한다");
{
  const t = 띄우기({ 마크업: false });
  let 던짐 = null;
  try { t.App.OrderbookMarkPrice.init(); } catch (e) { 던짐 = e; }
  ok("마크업이 없어도 오류를 던지지 않는다", 던짐 === null, 던짐 && 던짐.message);
  ok("마크업이 없으면 구독하지 않는다 (" + t.구독.length + "개)", t.구독.length === 0,
    "구독: " + JSON.stringify(t.구독.map((c) => c[0])) +
    " — 없는 칸에 쓰려고 체결마다 헛도는 구독이 남습니다");
  ok("오류 로그 0건", t.오류.length === 0, t.오류.join(" | "));
}

/* =========================================================================
 * [9] 수정 금지 파일 12개
 * -------------------------------------------------------------------------
 * 이 모듈의 존재 이유가 "chart.js 를 안 건드리고 마크가격을 표시하는 것" 이라
 * 여기서 같이 확인합니다. 문자열 검색이 아니라 md5 로 봅니다
 * (주석에 파일명이 적혀 있어 문자열 검사는 오탐납니다).
 * ========================================================================= */
절("[9] 수정 금지 파일 12개가 그대로다");
{
  const 기준 = {
    "trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "auth.js": "9cec9a7257eb54f379bf72e14e21e463",
    "supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
    "chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
    "leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
    "season.js": "9c5fbf13ced09ca2f348e48f87c78224",
    "board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
    "orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "chart.js": "02ddcb000d577131f797143d08c09123",
    "websocket.js": "1a914631175760e0b0cb5144bc11b59e",
  };
  const md5 = (f) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  const 다름 = Object.keys(기준).filter((f) => md5(f) !== 기준[f]);
  ok("12개 전부 기준 해시와 같다 (특히 chart.js · orderbook.js)", 다름.length === 0,
    "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [10] tests/_order.txt 등록
 * ========================================================================= */
절("[10] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/orderbook-mark-price-seal.test.js") >= 0,
    "등록하지 않으면 npm test 가 이 파일을 돌리지 않습니다");
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " orderbook-mark-price-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창이 타이머를 붙들고 있어 이걸 빼면 프로세스가 안 끝납니다. */
process.exit(fail > 0 ? 1 : 0);
