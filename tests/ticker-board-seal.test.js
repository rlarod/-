/* tests/ticker-board-seal.test.js
 * =========================================================================
 * 전광판 — "값이 안 오는 종목" 을 회원이 오해하지 않게
 * =========================================================================
 * 2026-08-28 — 본부장 배정 / 기록팀 봉인 (그전까지 봉인 0건)
 *
 * ── 이 화면이 하는 일 ─────────────────────────────────────────────────
 *   js/ticker-board.js 는 여러 종목을 표로 한 줄씩 보여줍니다.
 *   trading.js / websocket.js / chart.js 는 전혀 안 건드리고,
 *   어댑터가 이미 내주는 getPrice() · getMarketStats() 만 읽어 **표시만** 합니다.
 *
 * ── 무엇이 위험한가 ───────────────────────────────────────────────────
 *   아직 시세가 안 붙은 종목은 값이 계속 "-" 로만 보입니다.
 *   **이유를 같이 적어주지 않으면 회원이 "거래가 뜸한가" 로 오해합니다.**
 *   CLAUDE.md 가 P1 로 못 박은 "조용한 고장" 과 같은 모양입니다 —
 *   최근 체결 목록이 영구히 비어 있었는데 회원은 그걸 사실로 믿었던 사건.
 *
 *   그래서 이 표는 그런 종목에 **"준비중" 배지**를 붙입니다.
 *   그리고 그 판정을 **App.SymbolRegistry 한 곳에서만** 합니다.
 *   판정이 두 곳에 생기면 한쪽만 고쳐져 조용히 어긋납니다.
 *
 * ── 못 박는 것 ────────────────────────────────────────────────────────
 *   [3] 준비중 종목에는 배지가 붙는다                          ← 핵심
 *   [4] 실전 종목에는 배지가 안 붙는다 (멀쩡한 종목을 겁주지 않는다)
 *   [5] 값이 없으면 0 이 아니라 "-" 로 보인다                  ← 핵심
 *   [6] 판정을 여기서 새로 만들지 않는다 (isMock 한 곳)
 *   [7] 어댑터가 없는 종목은 그 줄만 건너뛰고 표는 계속 그린다
 *   [8] 상승·하락 색이 서로 다르다 (빨강은 손익 표시에만)
 *   [9] 값을 새로 계산하지 않는다 — 어댑터가 준 것을 그대로 보여준다
 *
 * ⚠ 가짜 어댑터만 씁니다. 서버·시세에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC = path.join(REPO, "js/ticker-board.js");

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
 * 전광판을 흉내 냅니다
 * -------------------------------------------------------------------------
 * 종목 목록·어댑터를 통째로 갈아끼울 수 있게 만들어서, "준비중" 판정과
 * 빈 값 표시를 실제 render() 로 확인합니다.
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const 마크업 = opts.칸없음
    ? "<div></div>"
    : '<table><tbody id="ticker-board-body"></tbody></table>';

  const dom = new JSDOM("<!doctype html><html><body>" + 마크업 + "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  const 종목들 = opts.종목들 || [
    { symbol: "BTCUSDT", name: "비트코인" },
    { symbol: "SAMSUNGUSDT", name: "삼성전자" },
    { symbol: "QQQUSDT", name: "나스닥" },
  ];
  const 준비중 = opts.준비중 || ["SAMSUNGUSDT", "QQQUSDT"];
  const 시세 = opts.시세 || {
    BTCUSDT: { price: 78864.12, stats: { changePercent: 1.234, high24h: 79299.8, low24h: 77500 } },
    SAMSUNGUSDT: { price: null, stats: { changePercent: null, high24h: null, low24h: null } },
    QQQUSDT: { price: null, stats: { changePercent: null, high24h: null, low24h: null } },
  };

  win.App = {
    Bus: { on() {}, off() {}, emit() {} },
    SymbolRegistry: {
      getAll: () => 종목들,
      isMock: (s) => 준비중.indexOf(s) >= 0,
    },
    MarketData: {
      getAdapter: (s) => {
        if (opts.어댑터없음 && opts.어댑터없음.indexOf(s) >= 0) return null;
        const v = 시세[s] || { price: null, stats: {} };
        return { getPrice: () => v.price, getMarketStats: () => v.stats };
      },
    },
  };

  /* 2초 타이머를 몇 개 거는지 셉니다 — 화면이 없는데도 걸면 영원히 헛돕니다 */
  const 타이머들 = [];
  const 원래setInterval = win.setInterval;
  win.setInterval = function (fn, ms) {
    타이머들.push(ms);
    return 원래setInterval.call(win, fn, ms);
  };

  win.eval(fs.readFileSync(SRC, "utf8"));
  if (!opts.초기화안함) win.App.TickerBoard.init();

  const 몸통 = () => win.document.getElementById("ticker-board-body");
  return {
    win, dom, App: win.App, 모듈: win.App.TickerBoard, 몸통, 타이머들,
    줄들: () => (몸통() ? Array.from(몸통().querySelectorAll("tr")) : []),
    줄: (i) => {
      const tr = 몸통().querySelectorAll("tr")[i];
      if (!tr) return null;
      const td = Array.from(tr.querySelectorAll("td"));
      return {
        종목칸: td[0] ? td[0].textContent : null,
        현재가: td[1] ? td[1].textContent : null,
        등락률: td[2] ? td[2].textContent : null,
        고가: td[3] ? td[3].textContent : null,
        저가: td[4] ? td[4].textContent : null,
        등락클래스: td[2] ? td[2].className : null,
        배지: !!tr.querySelector(".ticker-board-mock-badge"),
        배지글자: tr.querySelector(".ticker-board-mock-badge")
          ? tr.querySelector(".ticker-board-mock-badge").textContent : null,
      };
    },
    닫기: () => { try { win.close(); } catch (e) { /* noop */ } },
  };
}

/* =========================================================================
 * [1] 파일 · 배선
 * ========================================================================= */
절("[1] 파일 · 배선");
{
  ok("js/ticker-board.js 가 있다", fs.existsSync(SRC));
  const src = fs.readFileSync(SRC, "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const main = fs.readFileSync(path.join(REPO, "main.js"), "utf8");

  ok("index.html 이 이 파일을 부른다", html.indexOf('src="js/ticker-board.js"') >= 0);
  ok("index.html 에 #ticker-board-body 가 있다", /id="ticker-board-body"/.test(html),
    "이 id 가 바뀌면 표가 조용히 빈 채로 남습니다");
  ok("main.js 가 TickerBoard 를 init 목록에 넣는다", main.indexOf('"TickerBoard"') >= 0);
  ok("main.js 의 init 목록에 딱 한 번만 들어 있다",
    (main.match(/"TickerBoard"/g) || []).length === 1,
    "두 번이면 2초 타이머가 두 개 돌아 표를 두 배로 다시 그립니다");

  /* 2026-08-28 현재 이 화면은 style="display:none" 으로 감춰져 있습니다(코드 보존).
     사실을 그대로 적어 둡니다 — 나중에 켜면 이 검사가 실패하면서 알려줍니다. */
  ok("[현황] 전광판 패널은 아직 화면에서 숨겨져 있다",
    /id="ticker-board-panel"[^>]*style="display:none;"/.test(html),
    "켜졌으면 이 줄을 새 기준으로 바꾸고 왜 켰는지 날짜와 함께 적으세요");

  ok("2초마다 다시 그린다", /REFRESH_INTERVAL_MS = 2000/.test(src),
    "값을 줄이면 안 보이는 화면 때문에 계속 DOM 을 다시 그립니다");

  /* 소스만 보지 않고 실제로 거는지도 봅니다 */
  const t0 = 띄우기();
  ok("init() 이 2000ms 타이머를 정확히 1개 건다", t0.타이머들.length === 1 && t0.타이머들[0] === 2000,
    "건 타이머: " + JSON.stringify(t0.타이머들));
  t0.닫기();
  ok("서버(fetch/WebSocket/supabase)를 직접 부르지 않는다",
    !/fetch\s*\(|new\s+WebSocket|supabase/i.test(src),
    "표시 전용 화면이 직접 데이터를 가져오면 시세 경로가 두 벌이 됩니다");
}

/* =========================================================================
 * [2] 판정은 App.SymbolRegistry 한 곳에서만
 * ========================================================================= */
절("[2] '준비중' 판정을 여기서 새로 만들지 않는다");
{
  const src = fs.readFileSync(SRC, "utf8");
  const 코드 = src.slice(src.indexOf("window.App = window.App"));
  ok("App.SymbolRegistry.isMock 을 쓴다", /App\.SymbolRegistry\.isMock\(/.test(코드));
  ok("dataSource 를 직접 보고 판정하지 않는다", !/dataSource/.test(코드),
    "판정이 두 곳에 생기면 한쪽만 고쳐져 조용히 어긋납니다");
  ok("종목 이름을 코드에 박아 판정하지 않는다",
    !/"BTCUSDT"|'BTCUSDT'|SAMSUNGUSDT|QQQUSDT/.test(코드),
    "종목이 늘 때마다 이 파일을 고쳐야 하게 됩니다");
}

/* =========================================================================
 * [3] ⭐ 준비중 종목에는 배지가 붙는다
 * ========================================================================= */
절("[3] ⭐ 아직 시세가 안 붙은 종목에 '준비중' 배지가 붙는다");
{
  const t = 띄우기();
  ok("줄이 3개 그려졌다", t.줄들().length === 3, "실제 " + t.줄들().length + "줄");

  const 삼성 = t.줄(1);
  ok("삼성전자 줄에 배지가 붙었다", 삼성.배지 === true,
    "배지가 없으면 값이 '-' 인 이유를 회원이 알 수 없어 '거래가 뜸한가' 로 오해합니다");
  ok("배지 글자가 '준비중' 이다", 삼성.배지글자 === "준비중", "실제: " + 삼성.배지글자);
  ok("나스닥 줄에도 배지가 붙었다", t.줄(2).배지 === true);
  ok("종목 이름이 그대로 보인다 (삼성전자)", 삼성.종목칸.indexOf("삼성전자") >= 0, 삼성.종목칸);
  ok("종목 코드도 같이 보인다 (SAMSUNGUSDT)", 삼성.종목칸.indexOf("SAMSUNGUSDT") >= 0, 삼성.종목칸);
  t.닫기();
}

/* =========================================================================
 * [4] 실전 종목에는 배지가 안 붙는다
 * ========================================================================= */
절("[4] 실전 종목(비트코인)에는 배지가 안 붙는다");
{
  const t = 띄우기();
  const btc = t.줄(0);
  ok("비트코인 줄에 배지가 없다", btc.배지 === false,
    "멀쩡히 돌아가는 종목에 '준비중' 이 붙으면 회원이 거래를 접습니다");
  ok("비트코인 현재가가 실제 값으로 보인다 (78,864.12)", btc.현재가 === "78,864.12", btc.현재가);
  ok("등락률이 +1.23% 다 (소수 2자리 · 부호 붙임)", btc.등락률 === "+1.23%", btc.등락률);
  ok("24H 고가가 79,299.80 이다", btc.고가 === "79,299.80", btc.고가);
  t.닫기();

  /* 준비중 종목이 실전으로 열리면 배지가 저절로 사라져야 합니다 */
  const t2 = 띄우기({ 준비중: [] });
  ok("규격표에서 준비중이 풀리면 배지가 사라진다 (파일을 안 고쳐도)",
    t2.줄들().every((tr) => !tr.querySelector(".ticker-board-mock-badge")),
    "여기서 파일을 또 고쳐야 하면 판정이 두 곳에 있는 것입니다");
  t2.닫기();
}

/* =========================================================================
 * [5] ⭐ 값이 없으면 0 이 아니라 "-"
 * -------------------------------------------------------------------------
 * 0 을 적으면 회원은 "현재가 0원" 으로 읽습니다. 빈 값은 "-" 여야 합니다.
 * ========================================================================= */
절("[5] ⭐ 값이 없으면 0 이 아니라 '-' 로 보인다");
{
  const t = 띄우기();
  const 삼성 = t.줄(1);
  ok("현재가가 '-' 다", 삼성.현재가 === "-", "실제: '" + 삼성.현재가 + "'");
  ok("등락률이 '-' 다", 삼성.등락률 === "-", "실제: '" + 삼성.등락률 + "'");
  ok("고가가 '-' 다", 삼성.고가 === "-", "실제: '" + 삼성.고가 + "'");
  ok("저가가 '-' 다", 삼성.저가 === "-", "실제: '" + 삼성.저가 + "'");
  ok("0 · 0.00 · NaN 이 적혀 있지 않다",
    [삼성.현재가, 삼성.등락률, 삼성.고가, 삼성.저가]
      .every((v) => ["0", "0.00", "0.00%", "NaN", "NaN%", "undefined", "null"].indexOf(v) < 0),
    JSON.stringify(삼성));
  t.닫기();

  /* 값이 undefined 로 와도 같아야 합니다 */
  const t2 = 띄우기({
    종목들: [{ symbol: "XUSDT", name: "무언가" }],
    준비중: ["XUSDT"],
    시세: { XUSDT: { price: undefined, stats: {} } },
  });
  const x = t2.줄(0);
  ok("값이 undefined 여도 '-' 로 보인다",
    x.현재가 === "-" && x.등락률 === "-" && x.고가 === "-" && x.저가 === "-",
    JSON.stringify(x));
  t2.닫기();

  /* 값이 진짜 0 이면 0 을 보여줘야 합니다 — "없음" 과 "0" 은 다릅니다 */
  const t3 = 띄우기({
    종목들: [{ symbol: "ZUSDT", name: "영" }],
    준비중: [],
    시세: { ZUSDT: { price: 0, stats: { changePercent: 0, high24h: 0, low24h: 0 } } },
  });
  const z = t3.줄(0);
  ok("값이 진짜 0 이면 '0.00' 을 보여준다 ('없음' 과 구별한다)",
    z.현재가 === "0.00" && z.등락률 === "+0.00%", JSON.stringify(z));
  t3.닫기();
}

/* =========================================================================
 * [6] 상승·하락 색이 서로 다르다
 * -------------------------------------------------------------------------
 * 확정 팔레트 — 빨강(#F0506E)은 손익 표시에만 씁니다. 여기가 그 자리입니다.
 * ========================================================================= */
절("[6] 상승 · 하락 색이 서로 다르다");
{
  const t = 띄우기({
    종목들: [{ symbol: "UP", name: "오름" }, { symbol: "DOWN", name: "내림" }],
    준비중: [],
    시세: {
      UP: { price: 100, stats: { changePercent: 2.5, high24h: 101, low24h: 99 } },
      DOWN: { price: 100, stats: { changePercent: -2.5, high24h: 101, low24h: 99 } },
    },
  });
  const 위 = t.줄(0);
  const 아래 = t.줄(1);
  ok("오름은 pnl-positive 다", 위.등락클래스 === "pnl-positive", 위.등락클래스);
  ok("내림은 pnl-negative 다", 아래.등락클래스 === "pnl-negative", 아래.등락클래스);
  ok("두 색 이름이 서로 다르다", 위.등락클래스 !== 아래.등락클래스);
  ok("오름은 '+2.50%'", 위.등락률 === "+2.50%", 위.등락률);
  ok("내림은 '-2.50%' (부호를 두 번 안 붙인다)", 아래.등락률 === "-2.50%", 아래.등락률);
  t.닫기();
}

/* =========================================================================
 * [7] 어댑터가 없는 종목은 그 줄만 건너뛴다
 * ========================================================================= */
절("[7] 어댑터가 없는 종목이 있어도 표 전체가 안 죽는다");
{
  const t = 띄우기({ 어댑터없음: ["SAMSUNGUSDT"] });
  ok("줄이 2개만 그려진다 (없는 것만 빠진다)", t.줄들().length === 2,
    "실제 " + t.줄들().length + "줄");
  ok("비트코인 줄은 정상으로 남는다", t.줄(0).현재가 === "78,864.12", t.줄(0).현재가);
  ok("나스닥 줄도 남는다 (배지 포함)", t.줄(1).배지 === true);
  t.닫기();

  /* 규격표나 어댑터 자체가 아직 없으면 그냥 아무것도 안 합니다 */
  const t2 = 띄우기({ 초기화안함: true });
  delete t2.App.SymbolRegistry;
  let 던짐 = null;
  try { t2.모듈.init(); } catch (e) { 던짐 = e; }
  ok("규격표가 아직 안 실렸어도 오류를 던지지 않는다", 던짐 === null, 던짐 && 던짐.message);
  ok("그때는 표를 비운 채로 둔다 (엉뚱한 값을 채우지 않는다)", t2.줄들().length === 0,
    "실제 " + t2.줄들().length + "줄");
  t2.닫기();

  const t3 = 띄우기({ 칸없음: true, 초기화안함: true });
  let 던짐3 = null;
  try { t3.모듈.init(); } catch (e) { 던짐3 = e; }
  ok("#ticker-board-body 가 없어도 조용히 끝낸다", 던짐3 === null, 던짐3 && 던짐3.message);
  /* 화면이 없는데 2초 타이머만 걸어 두면 아무도 안 보는 화면을 위해
     영원히 헛돕니다. 조용히 끝낸다는 것은 타이머도 안 건다는 뜻입니다. */
  ok("그때 2초 타이머도 걸지 않는다 (" + t3.타이머들.length + "개)", t3.타이머들.length === 0,
    "건 타이머: " + JSON.stringify(t3.타이머들));
  t3.닫기();
}

/* =========================================================================
 * [8] 값을 새로 계산하지 않는다
 * -------------------------------------------------------------------------
 * 어댑터가 준 숫자를 그대로 보여줍니다. 여기서 환산·보정하면 시세가 두 벌이 됩니다.
 * ========================================================================= */
절("[8] 값을 새로 계산하지 않는다 (어댑터가 준 것 그대로)");
{
  const src = fs.readFileSync(SRC, "utf8");
  const 코드 = src.slice(src.indexOf("window.App = window.App"));
  ok("환율(USD_KRW)을 여기서 곱하지 않는다", !/USD_KRW|1380/.test(코드));
  ok("등락률을 여기서 다시 계산하지 않는다",
    !/high24h\s*-\s*low24h|\/\s*prev|\* 100/.test(코드),
    "어댑터가 주는 changePercent 를 그대로 씁니다");

  /* 어댑터가 이상한 값을 줘도 화면이 안 깨지는지 */
  const t = 띄우기({
    종목들: [{ symbol: "W", name: "이상" }],
    준비중: [],
    시세: { W: { price: NaN, stats: { changePercent: NaN, high24h: NaN, low24h: NaN } } },
  });
  const w = t.줄(0);
  ok("등락률이 NaN 이면 '-' 로 보인다", w.등락률 === "-", "실제: '" + w.등락률 + "'");
  ok("화면에 'NaN%' 이 뜨지 않는다", String(w.등락률).indexOf("NaN") < 0, w.등락률);
  t.닫기();
}

/* =========================================================================
 * [9] 수정 금지 파일 12개
 * ========================================================================= */
절("[9] 수정 금지 파일 12개가 그대로다");
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
  ok("12개 전부 기준 해시와 같다 (특히 websocket.js · chart.js)", 다름.length === 0,
    "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [10] tests/_order.txt 등록
 * ========================================================================= */
절("[10] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/ticker-board-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " ticker-board-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* init() 이 2초짜리 setInterval 을 걸어 둡니다. 이게 없으면 프로세스가 안 끝납니다. */
process.exit(fail > 0 ? 1 : 0);
