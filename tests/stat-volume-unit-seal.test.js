/* tests/stat-volume-unit-seal.test.js
 * =========================================================================
 * 24H 거래량 단위 — "삼성전자를 보는데 BTC" 가 다시 안 나오게
 * =========================================================================
 * 2026-08-28 — 본부장 배정 / 기록팀 봉인 (그전까지 봉인 0건)
 *
 * ── 무엇이 문제였나 ───────────────────────────────────────────────────
 *   js/chart.js:498 (수정 금지 파일) 이 단위를 글자로 박아 씁니다.
 *
 *     dom.statVolume.textContent = App.Utils.formatVolume(payload.volume) + " BTC";
 *
 *   비트코인 하나만 있을 때는 맞는 말이었습니다. 그런데 종목 전환이 열리면
 *   삼성전자를 보면서도 **"1.20M BTC"** 가 됩니다(2026-08-27 조사팀 실측).
 *   숫자는 주식 수량인데 이름표는 코인입니다.
 *
 *   ⚠ CLAUDE.md 기준으로 **P1** 입니다 — 오류도 안 나고 화면도 멀쩡한데
 *     회원이 **잘못된 정보로 판단**하게 만듭니다.
 *
 * ── 어떻게 고쳤나 ─────────────────────────────────────────────────────
 *   #stat-volume 그 한 칸의 textContent 접근자(setter)만 덮어씁니다.
 *   chart.js 가 값을 써넣는 그 순간 끝의 단위를 갈아끼웁니다.
 *   **js/chart.js 는 한 글자도 안 고칩니다.**
 *
 *   MutationObserver 를 안 쓴 이유 (2026-08-27 실측, 크롬):
 *     · 접근자는 틱당 DOM 쓰기 1번. 관측자는 "쓰고 → 알림 → 다시 쓰기" 로 2번
 *       실측 — 시세 틱 16회에 #stat-volume 변경 기록이 정확히 16건
 *     · 1회 평균 — 안 붙임 0.00276ms / 접근자 0.00331ms / 관측자 0.00382ms
 *     · 관측자는 **틀린 단위가 한 프레임 그려진 뒤** 고쳐집니다.
 *       접근자는 그려지기 전에 바뀌어 한 프레임도 안 보입니다
 *
 * ── 여기서 못 박는 것 ─────────────────────────────────────────────────
 *   [3] 지금(비트코인)은 화면이 한 글자도 안 바뀐다 — "132.38K BTC" 그대로
 *   [4] 주식 종목이면 "1.20M BTC" 를 "1.20M 주" 로 바꾼다          ← 핵심
 *   [5] 값이 아닌 것("-" · 빈칸)은 손대지 않는다 (조용한 고장 방지)
 *   [6] 기본이 접근자(setter) 방식이다. 한 프레임도 틀린 단위가 안 보인다
 *   [7] defineProperty 가 막히면 관측자로 자동으로 떨어진다
 *   [8] 틱당 DOM 쓰기가 1번이다 (16틱 → 16건)
 *   [9] 다른 칸은 안 건드린다
 *
 * ⚠ 가짜 DOM 만 씁니다. 서버에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = path.join(REPO, "js/stat-volume-unit.js");

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

/* MutationObserver 콜백은 마이크로태스크로 옵니다. 한 번 양보해서 받습니다.
   ⚠ 시간에 여유를 둡니다 — 전체를 한꺼번에 돌릴 때 짧게 잡으면 가끔 틀립니다. */
function 잠깐(ms) {
  return new Promise(function (r) { setTimeout(r, ms || 60); });
}

/* -------------------------------------------------------------------------
 * 시세 바 한 칸을 흉내 냅니다
 * -------------------------------------------------------------------------
 * 진짜 js/utils.js 를 태워서 qtyUnit 도 실제 함수로 확인합니다.
 * 종목 규격표(App.SymbolRegistry)는 필요한 것만 흉내 냅니다.
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const 마크업 = opts.칸없음
    ? "<div></div>"
    : '<div class="stats-bar">' +
      '<span class="stat-value" id="stat-volume">-</span>' +
      '<span class="stat-value" id="stat-mark-price">79,414.00</span>' +
      '<span class="stat-value" id="stat-high">80,499.90</span>' +
      "</div>";

  const dom = new JSDOM("<!doctype html><html><body>" + 마크업 + "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  const 구독 = [];
  let 활성 = opts.종목 || "BTCUSDT";
  const 규격 = {
    BTCUSDT: { unit: "BTC", type: "crypto", name: "비트코인" },
    SAMSUNGUSDT: { unit: "주", type: "stock", name: "삼성전자" },
    QQQUSDT: { unit: "주", type: "index", name: "나스닥" },
  };

  win.App = {
    Bus: {
      on(e, f) { 구독.push([e, f]); return f; },
      off() {},
      emit(e, p) { 구독.filter((c) => c[0] === e).forEach((c) => c[1](p)); },
    },
    Config: { getActiveSymbol: () => 활성, getDisplayCurrency: () => "USDT", USD_KRW: 1380 },
    SymbolRegistry: opts.규격표없음 ? undefined : { getSpec: (s) => 규격[s] || null },
  };
  win.eval(fs.readFileSync(path.join(REPO, "js/utils.js"), "utf8"));

  /* defineProperty 가 막힌 환경 흉내 — 관측자로 떨어지는지 보려고 */
  if (opts.접근자막기) {
    const 원래 = win.Object.defineProperty;
    win.Object.defineProperty = function (o, k) {
      if (k === "textContent") throw new Error("막힘");
      return 원래.apply(this, arguments);
    };
  }

  win.eval(fs.readFileSync(SRC, "utf8"));

  /* ⚠ jsdom 은 생성 직후 document.readyState 가 "loading" 이라, 모듈이 스스로
     붙는 경로(DOMContentLoaded)가 우리 검사 시점보다 늦게 옵니다.
     실제 브라우저에서는 그 경로로 붙습니다 — 아래 [0] 에서 따로 확인합니다.
     여기서는 main.js 가 하는 것과 같게 init() 을 한 번 부릅니다. */
  if (!opts.초기화안함) win.App.StatVolumeUnit.init();

  return {
    win, dom, 구독,
    App: win.App,
    모듈: win.App.StatVolumeUnit,
    칸: () => win.document.getElementById("stat-volume"),
    글자: () => {
      const e = win.document.getElementById("stat-volume");
      return e ? e.textContent : null;
    },
    종목바꾸기: (s) => { 활성 = s; },
    닫기: () => { try { win.close(); } catch (e) { /* noop */ } },
  };
}

(async function 본체() {

/* =========================================================================
 * [0] 스스로 붙는다 — main.js 의 init 목록에 기대지 않는다
 * -------------------------------------------------------------------------
 * 이 모듈은 main.js 가 안 불러도 스스로 붙습니다.
 *   · 파일을 읽는 즉시 wire()  — App.Bus 에 symbol:change 를 건다
 *   · readyState 가 loading 이면 DOMContentLoaded 를 기다렸다 install()
 *   · 아니면 곧바로 install()
 * main.js 목록에서 이름 하나가 빠지는 사고를 이 구조가 막아 줍니다.
 * 그래서 그 구조 자체를 못 박습니다.
 * ========================================================================= */
절("[0] main.js 없이도 스스로 붙는다");
{
  const src = fs.readFileSync(SRC, "utf8");
  ok("파일을 읽는 즉시 wire() 를 부른다 (init 을 안 기다린다)",
    /\n  wire\(\);/.test(src),
    "main.js 목록에서 이름이 빠지면 종목이 바뀌어도 단위가 안 따라옵니다");
  ok("readyState 가 loading 이면 DOMContentLoaded 를 기다린다",
    /document\.readyState === "loading"/.test(src) &&
    /addEventListener\("DOMContentLoaded", init\)/.test(src));
  ok("아니면 곧바로 install() 한다", /else \{\s*install\(\);/.test(src));

  /* init() 을 한 번도 안 불러도 Bus 구독은 이미 걸려 있어야 합니다 */
  const t = 띄우기({ 초기화안함: true });
  ok("init() 을 안 불러도 symbol:change 구독이 이미 걸려 있다 (" + t.구독.length + "개)",
    t.구독.length === 1 && t.구독[0][0] === "symbol:change",
    JSON.stringify(t.구독.map((c) => c[0])));
  t.닫기();
}

/* =========================================================================
 * [1] 파일 · 실측 주석 · 배선
 * ========================================================================= */
절("[1] 파일 · 실측 주석 · 배선");
{
  ok("js/stat-volume-unit.js 가 있다", fs.existsSync(SRC));
  const src = fs.readFileSync(SRC, "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

  ok("index.html 이 이 파일을 부른다", html.indexOf('src="js/stat-volume-unit.js"') >= 0);
  ok("index.html 에 #stat-volume 칸이 있다", /id="stat-volume"/.test(html),
    "이 id 가 바뀌면 모듈이 조용히 종료하고 단위가 영영 BTC 로 남습니다");
  ok("주석에 성능 실측(0.00276 / 0.00331 / 0.00382ms)이 남아 있다",
    src.indexOf("0.00276") >= 0 && src.indexOf("0.00331") >= 0 && src.indexOf("0.00382") >= 0,
    "왜 관측자가 아닌지 숫자가 없으면 다음 사람이 관측자로 바꿔 놓습니다");
  ok("주석에 '틱 16회 → 변경 16건' 실측이 남아 있다", /16회/.test(src) && /16건/.test(src));
  ok("주석에 되돌리기가 적혀 있다", /되돌리기|되돌리는/.test(src));
  ok("js/chart.js 를 직접 고치지 않는다", /chart\.js 는 한 글자도 안 고칩니다/.test(src));
}

/* =========================================================================
 * [2] 단위는 종목 규격표에서만 읽는다
 * ========================================================================= */
절("[2] 단위는 App.Utils.qtyUnit 한 곳에서만 읽는다");
{
  const src = fs.readFileSync(SRC, "utf8");
  ok("qtyUnit 을 쓴다", /App\.Utils\.qtyUnit/.test(src));
  ok("단위 표를 여기서 새로 만들지 않는다",
    !/SAMSUNG|005930|QQQ/.test(src.slice(src.indexOf("window.App = window.App"))),
    "종목별 단위가 두 곳에 생기면 한쪽만 고쳐져 조용히 어긋납니다");

  const btc = 띄우기({ 종목: "BTCUSDT" });
  ok("BTCUSDT 의 단위가 'BTC' 다", btc.모듈.unit() === "BTC", btc.모듈.unit());
  btc.닫기();

  const sam = 띄우기({ 종목: "SAMSUNGUSDT" });
  ok("SAMSUNGUSDT 의 단위가 '주' 다", sam.모듈.unit() === "주", sam.모듈.unit());
  sam.닫기();

  const qqq = 띄우기({ 종목: "QQQUSDT" });
  ok("QQQUSDT(나스닥)의 단위가 '주' 다", qqq.모듈.unit() === "주", qqq.모듈.unit());
  qqq.닫기();

  const 모름 = 띄우기({ 종목: "듣도보도못한종목" });
  ok("모르는 종목이면 지금까지의 값 'BTC' 로 둔다", 모름.모듈.unit() === "BTC", 모름.모듈.unit());
  모름.닫기();

  const 없음 = 띄우기({ 규격표없음: true });
  ok("규격표가 아직 안 실렸어도 'BTC' 로 안전하게 둔다 (터지지 않는다)",
    없음.모듈.unit() === "BTC", 없음.모듈.unit());
  없음.닫기();
}

/* =========================================================================
 * [3] ⭐ 지금(비트코인)은 화면이 한 글자도 안 바뀐다
 * -------------------------------------------------------------------------
 * 이 모듈이 들어온 날 화면이 달라지면 안 됩니다. 달라지면 그건 다른 고장입니다.
 * ========================================================================= */
절("[3] ⭐ 비트코인일 때 화면이 한 글자도 안 바뀐다");
{
  const t = 띄우기({ 종목: "BTCUSDT" });
  const 그대로 = ["132.38K BTC", "1.20M BTC", "0.00 BTC", "79,414.00 BTC"];
  for (const v of 그대로) {
    ok("'" + v + "' → 그대로", t.모듈.retag(v) === v, "실제: '" + t.모듈.retag(v) + "'");
  }
  /* chart.js 가 쓰는 그 모양 그대로 넣어 봅니다 */
  t.칸().textContent = "132.38K BTC";
  ok("chart.js 가 써넣어도 '132.38K BTC' 그대로다", t.글자() === "132.38K BTC",
    "실제: '" + t.글자() + "'");
  t.닫기();
}

/* =========================================================================
 * [4] ⭐ 주식 종목이면 단위를 갈아끼운다
 * ========================================================================= */
절("[4] ⭐ 삼성전자를 보는데 'BTC' 가 안 나온다");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT" });

  ok("'1.20M BTC' → '1.20M 주'", t.모듈.retag("1.20M BTC") === "1.20M 주",
    "실제: '" + t.모듈.retag("1.20M BTC") + "'");
  ok("단위가 없으면 붙인다 '132.38K' → '132.38K 주'",
    t.모듈.retag("132.38K") === "132.38K 주", "실제: '" + t.모듈.retag("132.38K") + "'");
  ok("이미 맞으면 그대로 둔다 '1.20M 주'", t.모듈.retag("1.20M 주") === "1.20M 주");
  ok("다른 코인 단위도 갈아끼운다 'ETH' → '주'", t.모듈.retag("5.00K ETH") === "5.00K 주",
    "실제: '" + t.모듈.retag("5.00K ETH") + "'");

  /* chart.js 가 " BTC" 를 박아 쓰는 그 순간을 재현합니다 */
  t.칸().textContent = "1.20M BTC";
  ok("⭐ chart.js 가 '1.20M BTC' 를 써도 화면에는 '1.20M 주' 가 남는다",
    t.글자() === "1.20M 주",
    "실제: '" + t.글자() + "' — 여기가 회원이 잘못된 정보로 판단하는 자리입니다");
  ok("'BTC' 글자가 화면에 한 번도 안 남는다", t.글자().indexOf("BTC") < 0, t.글자());
  ok("숫자는 한 글자도 안 바뀐다", t.글자().replace(/[^0-9.KM]/g, "") === "1.20M",
    "실제: " + t.글자());
  t.닫기();

  /* 종목이 바뀌면 다음 시세를 안 기다리고 바로 맞춘다 */
  const t2 = 띄우기({ 종목: "BTCUSDT" });
  t2.칸().textContent = "132.38K BTC";
  ok("준비 — 비트코인 상태에서 '132.38K BTC'", t2.글자() === "132.38K BTC");
  t2.종목바꾸기("SAMSUNGUSDT");
  t2.App.Bus.emit("symbol:change", { symbol: "SAMSUNGUSDT" });
  ok("종목이 바뀌면 다음 시세를 안 기다리고 바로 '132.38K 주' 가 된다",
    t2.글자() === "132.38K 주",
    "실제: '" + t2.글자() + "' — 시세가 뜸한 종목은 한참 동안 틀린 단위가 보입니다");
  t2.닫기();
}

/* =========================================================================
 * [5] 값이 아닌 것은 손대지 않는다
 * ========================================================================= */
절("[5] 값이 아닌 것('-' · 빈칸)은 손대지 않는다");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT" });
  ok("'-' 는 그대로 (종목 전환 중 비운 상태)", t.모듈.retag("-") === "-", t.모듈.retag("-"));
  ok("빈칸은 그대로", t.모듈.retag("") === "", JSON.stringify(t.모듈.retag("")));
  ok("공백만 있어도 그대로", t.모듈.retag("   ") === "   ");
  ok("숫자가 없는 글자는 그대로 ('불러오는 중')",
    t.모듈.retag("불러오는 중") === "불러오는 중", t.모듈.retag("불러오는 중"));
  ok("null 은 null 그대로", t.모듈.retag(null) === null);
  ok("undefined 는 undefined 그대로", t.모듈.retag(undefined) === undefined);

  t.칸().textContent = "-";
  ok("'-' 를 써넣어도 '- 주' 가 되지 않는다", t.글자() === "-",
    "실제: '" + t.글자() + "' — 빈 자리에 단위를 붙이면 값이 있는 것처럼 보입니다");
  t.닫기();
}

/* =========================================================================
 * [6] ⭐ 기본은 접근자(setter) — 틀린 단위가 한 프레임도 안 보인다
 * ========================================================================= */
절("[6] ⭐ 기본 방식이 접근자(setter)다");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT" });
  ok("설치됐다", t.모듈.isInstalled() === true);
  ok("방식이 'setter' 다 (관측자가 아니다)", t.모듈.getMode() === "setter",
    "실제: " + t.모듈.getMode() +
    " — 관측자면 틀린 단위가 한 프레임 그려진 뒤 고쳐집니다");

  /* 쓴 값을 바로 다시 읽어도 이미 고쳐져 있어야 합니다(그려지기 전에 바뀜) */
  t.칸().textContent = "1.20M BTC";
  ok("⭐ 쓴 직후 곧바로 읽어도 이미 '주' 다 (한 프레임도 안 틀린다)",
    t.칸().textContent === "1.20M 주", "실제: '" + t.칸().textContent + "'");
  ok("get 도 정상 동작한다 (값을 되읽을 수 있다)", typeof t.칸().textContent === "string");
  t.닫기();
}

/* =========================================================================
 * [7] defineProperty 가 막히면 관측자로 떨어진다
 * ========================================================================= */
절("[7] 접근자가 막힌 환경이면 관측자로 자동으로 떨어진다");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT", 접근자막기: true });
  ok("그래도 설치된다 (통째로 포기하지 않는다)", t.모듈.isInstalled() === true,
    "실제 mode: " + t.모듈.getMode());
  ok("방식이 'observer' 다", t.모듈.getMode() === "observer", "실제: " + t.모듈.getMode());
  t.닫기();
}

/* =========================================================================
 * [8] ⭐ 틱당 DOM 쓰기가 1번이다
 * -------------------------------------------------------------------------
 * 2026-08-27 실측 — 시세 틱 16회에 #stat-volume 변경 기록이 정확히 16건.
 * 관측자 방식이면 "쓰고 → 알림 → 다시 쓰기" 로 32건이 됩니다.
 * ========================================================================= */
절("[8] ⭐ 틱 16회 → 변경 16건 (관측자였다면 32건)");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT" });
  let 변경 = 0;
  const mo = new t.win.MutationObserver((recs) => { 변경 += recs.length; });
  mo.observe(t.칸(), { childList: true, characterData: true, subtree: true });

  for (let i = 0; i < 16; i++) t.칸().textContent = (i + 1) + ".00M BTC";

  /* MutationObserver 콜백은 마이크로태스크라 한 번 양보하면 도착합니다 */
  await 잠깐();
  ok("16틱에 변경 기록이 16건이다 (실제 " + 변경 + "건)", 변경 === 16,
    "실제 " + 변경 + "건 — 32건이면 관측자 방식으로 되돌아간 것입니다");
  ok("마지막 값이 '16.00M 주' 다", t.글자() === "16.00M 주", "실제: '" + t.글자() + "'");
  mo.disconnect();
  t.닫기();
}

/* =========================================================================
 * [9] 다른 칸은 안 건드린다 · 칸이 없으면 조용히 끝낸다
 * ========================================================================= */
절("[9] 다른 칸은 안 건드린다 · 칸이 없으면 조용히 끝낸다");
{
  const t = 띄우기({ 종목: "SAMSUNGUSDT" });
  const 마크 = t.win.document.getElementById("stat-mark-price");
  const 고가 = t.win.document.getElementById("stat-high");
  마크.textContent = "79,414.00";
  고가.textContent = "80,499.90";
  t.칸().textContent = "1.20M BTC";
  ok("마크가격 칸에 단위가 안 붙는다", 마크.textContent === "79,414.00", 마크.textContent);
  ok("24H 고가 칸에 단위가 안 붙는다", 고가.textContent === "80,499.90", 고가.textContent);
  t.닫기();

  const t2 = 띄우기({ 칸없음: true });
  let 던짐 = null;
  try { t2.모듈.init(); t2.모듈.apply(); } catch (e) { 던짐 = e; }
  ok("#stat-volume 이 없어도 오류를 던지지 않는다", 던짐 === null, 던짐 && 던짐.message);
  ok("설치되지 않은 상태로 남는다", t2.모듈.isInstalled() === false,
    "mode: " + t2.모듈.getMode());
  t2.닫기();
}

/* =========================================================================
 * [10] 구독 — 시세 틱마다 하는 일이 없다
 * ========================================================================= */
절("[10] symbol:change 만 구독한다 (시세 틱 경로에 안 끼어든다)");
{
  const t = 띄우기();
  const 이름들 = t.구독.map((c) => c[0]);
  ok("구독이 symbol:change 하나뿐이다 (" + 이름들.length + "개)",
    이름들.length === 1 && 이름들[0] === "symbol:change", JSON.stringify(이름들));
  ok("price:update · ticker:update 를 구독하지 않는다",
    이름들.indexOf("price:update") < 0 && 이름들.indexOf("ticker:update") < 0);

  t.모듈.init(); t.모듈.init();
  ok("init() 을 여러 번 불러도 구독이 늘지 않는다 (" + t.구독.length + "개)",
    t.구독.length === 1, JSON.stringify(t.구독.map((c) => c[0])));
  t.닫기();
}

/* =========================================================================
 * [11] 수정 금지 파일 12개
 * ========================================================================= */
절("[11] 수정 금지 파일 12개가 그대로다");
{
  const 기준 = {
    "trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
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
  ok("12개 전부 기준 해시와 같다 (특히 chart.js:498)", 다름.length === 0,
    "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [12] tests/_order.txt 등록
 * ========================================================================= */
절("[12] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/stat-volume-unit-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " stat-volume-unit-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);

})();
