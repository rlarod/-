/* tests/ticker-board-reality-seal.test.js
 * =========================================================================
 * 전광판 — 봉인은 초록인데 ★현실은 고장★ 이던 것을 드러냅니다
 * =========================================================================
 * 2026-10-01 — PM 배정 / 기록팀
 *
 * ── 무슨 일이 있었나 ────────────────────────────────────────────────────
 *   tests/ticker-board-seal.test.js 는 "준비중 배지가 붙는다" 를 2026-08-28
 *   부터 초록으로 지켜 왔습니다. 그런데 ★현실에서는 그 배지가 한 개도
 *   안 뜹니다.★
 *
 *   왜 못 잡았나 — 그 봉인은 가짜 SymbolRegistry 스텁을 끼웁니다.
 *
 *       tests/ticker-board-seal.test.js:87~90
 *         SymbolRegistry: { getAll: () => 종목들,
 *                           isMock: (s) => 준비중.indexOf(s) >= 0 }
 *
 *   스텁에 "준비중 종목" 을 손으로 넣어 주니 배지가 당연히 붙습니다.
 *   ★실제 js/symbol-registry.js 로는 한 번도 안 돌렸습니다.★
 *   현실에서는 그 입력이 영원히 안 나옵니다 —
 *
 *       js/symbol-registry.js:112,128,144,160  네 종목 전부 enabled:true, dataSource:"binance"
 *       js/symbol-registry.js:205  isEnabled = enabled===true && dataSource==="binance"
 *       js/symbol-registry.js:209  isMock = !isEnabled   →  ★네 종목 전부 false★
 *       js/ticker-board.js:57      isMock(...) ? "준비중" : ""   →  ★영원히 거짓★
 *
 *   테스트가 자기가 만든 세계만 본 것입니다. 이 파일은 그 구멍을 막습니다.
 *
 * ── 이 파일은 ★가짜 스텁을 쓰지 않습니다★ ──────────────────────────────
 *   index.html 1200~1203 · 1245 와 같은 순서로 ★실제 파일 4개★ 를 태웁니다.
 *
 *       js/symbol-registry.js
 *       js/market-data/binance-adapter.js
 *       js/market-data.js
 *       js/ticker-board.js
 *
 *   바꿔치기하는 것은 ★시세가 도착하는 것★ 하나뿐입니다(App.Bus 로 밀어 넣음).
 *   서버·바이낸스·Supabase 에 붙지 않습니다. 판정 로직은 전부 실제 코드입니다.
 *
 * ── ⚠️ 이 파일의 검사는 "[현황]" 입니다 ────────────────────────────────
 *   지금 상태가 고장이므로, 고장을 ★그대로 적어두고 바뀌면 터지게★ 했습니다.
 *   (tests/ticker-board-seal.test.js:155 의 "[현황] 전광판 패널은 아직 숨겨져
 *    있다" 와 같은 방식입니다)
 *
 *   조건을 느슨하게 써서 초록을 만든 것이 아닙니다 — ★고장난 값 자체를
 *   기준으로 적었습니다.★ 고치면 이 줄들이 빨강이 되고, 그때 새 기준으로
 *   바꾸면서 날짜를 적으세요. 그게 "이제 켜도 된다" 는 신호입니다.
 *
 * ── 왜 P1 인가 ──────────────────────────────────────────────────────────
 *   지금 #ticker-board-panel 은 display:none 이라 회원에게 안 보입니다.
 *   ★켜는 순간★ 4줄 중 3줄이 이유 없는 "-" 로 보이고, 그 "-" 칸에 상승
 *   초록이 칠해집니다. 오류도 안 나고 화면도 멀쩡합니다 —
 *   CLAUDE.md 가 P1 로 못 박은 "조용한 고장" 과 같은 모양입니다.
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 실행만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* index.html 과 같은 순서입니다 (1200 → 1203 → 1245).
   ⚠ ticker-board.js 는 market-data.js 뒤여야 합니다 — 앞에 두면 init() 때
     App.MarketData 가 아직 없어서 render() 가 조용히 아무것도 안 그립니다. */
const 실제파일들 = [
  "js/symbol-registry.js",
  "js/market-data/binance-adapter.js",
  "js/market-data.js",
  "js/ticker-board.js",
];

/* -------------------------------------------------------------------------
 * 실제 스택을 그대로 띄웁니다 — 바꿔치기하는 것은 "시세 도착" 뿐입니다
 * -------------------------------------------------------------------------
 *  opts.레지스트리바꿔치기(fn)  ← [1] 끝의 대조 실험에서만 씁니다.
 *      "가짜 스텁을 끼우면 배지가 붙는다" 를 눈앞에 보여주기 위한 것이고,
 *      기본값은 ★실제 js/symbol-registry.js 그대로★ 입니다.
 * ----------------------------------------------------------------------- */
function 띄우기(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!doctype html><html><body><table><tbody id="ticker-board-body"></tbody></table></body></html>',
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  /* main.js 와 같은 App.Bus (main.js 는 스스로 부팅하므로 여기서 직접 정의) */
  win.eval([
    "window.App = window.App || {};",
    "App.Bus = (function(){",
    "  var L = {};",
    "  return {",
    "    on: function(e,f){ (L[e]=L[e]||[]).push(f); return f; },",
    "    off: function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); },",
    "    emit: function(e,p){ (L[e]||[]).forEach(function(f){ try{f(p);}catch(err){ console.error(err); } }); }",
    "  };",
    "})();",
  ].join("\n"));

  for (const f of 실제파일들) {
    try { win.eval(read(f)); }
    catch (e) { throw new Error("실제 파일 로드 실패 " + f + ": " + e.message); }
  }

  if (typeof opts.레지스트리바꿔치기 === "function") opts.레지스트리바꿔치기(win.App);

  win.App.TickerBoard.init();

  /* 시세 도착 — 실제 바이낸스 어댑터가 App.Bus 로 받는 그 모양 그대로 */
  const 시세보내기 = (symbol, price) =>
    win.App.Bus.emit("price:update", { symbol: symbol, price: price });
  const 통계보내기 = (symbol, 등락, 고, 저) =>
    win.App.Bus.emit("ticker:update", {
      symbol: symbol, priceChangePercent: 등락, highPrice: 고, lowPrice: 저, volume: 1,
    });

  const 몸통 = () => win.document.getElementById("ticker-board-body");
  const 줄 = (i) => {
    const tr = 몸통().querySelectorAll("tr")[i];
    if (!tr) return null;
    const td = Array.from(tr.querySelectorAll("td"));
    return {
      종목칸: td[0] ? td[0].textContent : null,
      현재가: td[1] ? td[1].textContent : null,
      등락률: td[2] ? td[2].textContent : null,
      등락클래스: td[2] ? td[2].className : null,
      배지: !!tr.querySelector(".ticker-board-mock-badge"),
    };
  };

  return {
    win, App: win.App, 몸통, 줄, 시세보내기, 통계보내기,
    /* render 는 밖으로 안 나와 있어서 init() 으로 다시 그립니다.
       (2초 타이머가 하나 더 걸리지만 끝에서 창을 닫고 process.exit 합니다) */
    다시그리기: () => win.App.TickerBoard.init(),
    줄수: () => 몸통().querySelectorAll("tr").length,
    배지수: () => 몸통().querySelectorAll(".ticker-board-mock-badge").length,
    닫기: () => { try { win.close(); } catch (e) { /* noop */ } },
  };
}

/* =========================================================================
 * [0] 파일 · 등록
 * ========================================================================= */
절("[0] 파일 · 등록");
{
  실제파일들.forEach((f) =>
    ok(f + " 가 있다", fs.existsSync(path.join(REPO, f)),
      "없으면 이 파일의 모든 검사가 뜻을 잃습니다"));

  const order = read("tests/_order.txt");
  ok("tests/_order.txt 에 이 파일이 등록돼 있다",
    order.indexOf("tests/ticker-board-reality-seal.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌리고, tests/test-registry.test.js 가 터집니다");
}

/* =========================================================================
 * [1] ⭐ ★진짜 레지스트리★ 로 isMock() 을 실제로 불러 봅니다
 * ========================================================================= */
절("[1] ⭐ 가짜 스텁이 아니라 실제 js/symbol-registry.js 로 돌립니다");
{
  const t = 띄우기();
  const 레지 = t.App.SymbolRegistry;

  ok("App.SymbolRegistry 가 실제 파일에서 실렸다",
    !!레지 && typeof 레지.getAll === "function" && typeof 레지.isMock === "function");

  const 종목들 = 레지.getAll();
  const 코드들 = 종목들.map((s) => s.symbol);
  ok("[현황] 등록 종목은 4개다 — " + 코드들.join(" · "), 종목들.length === 4,
    "실제 " + 종목들.length + "개: " + 코드들.join(", ") +
    " — 종목이 늘거나 줄었으면 아래 [현황] 줄들을 전부 다시 재고 날짜를 적으세요");

  /* ★핵심★ — 각 종목에 실제 isMock() 을 불러 봅니다 */
  const 준비중으로판정된종목 = 종목들
    .filter((s) => 레지.isMock(s.symbol) === true)
    .map((s) => s.symbol);
  const 판정표 = 종목들.map((s) => s.symbol + "=" + 레지.isMock(s.symbol)).join(" ");

  /* ──────────────────────────────────────────────────────────────────────
     [현황] 2026-10-01 — 등록 종목 4개가 전부 enabled:true 라 isMock() 이
            전부 false. 따라서 "준비중" 배지는 한 개도 안 뜬다. 전광판은 지금
            화면에서 숨겨져 있어 회원에게는 안 보이지만, ★켜는 순간 3/4 줄이
            이유 없는 "-" 로 보인다 (P1)★
            시세 공급원이 붙거나 enabled 가 바뀌면 이 줄을 새 기준으로 고치고
            날짜를 적을 것.
     ────────────────────────────────────────────────────────────────────── */
  ok("[현황] 2026-10-01 — 실제 isMock() 이 ★4개 전부 false★ 다 (" + 판정표 + ")",
    준비중으로판정된종목.length === 0,
    "준비중으로 판정된 종목: " + JSON.stringify(준비중으로판정된종목) +
    " — 하나라도 생겼으면 배지가 실제로 뜨기 시작한 것입니다. " +
    "이 줄을 새 기준으로 고치고 왜 바뀌었는지 날짜와 함께 적으세요");

  const 전부열림 = 종목들.every((s) => s.enabled === true && s.dataSource === "binance");
  ok('[현황] 4개 전부 enabled:true · dataSource:"binance" 다 (그래서 isMock 이 false)',
    전부열림,
    "값: " + JSON.stringify(종목들.map((s) => [s.symbol, s.enabled, s.dataSource])));

  /* isMock 이 isEnabled 의 반대라는 관계 자체는 그대로여야 합니다 */
  ok("isMock(symbol) 은 isEnabled(symbol) 의 정확한 반대다",
    종목들.every((s) => 레지.isMock(s.symbol) === !레지.isEnabled(s.symbol)),
    "판정이 두 갈래로 갈라지면 화면마다 다른 답을 보여줍니다");

  /* ★핵심★ — 실제 스택으로 그린 표에 배지가 몇 개 붙는지 */
  ok("실제 스택으로 4줄이 그려졌다", t.줄수() === 4, "실제 " + t.줄수() + "줄");
  ok("[현황] ★'준비중' 배지가 한 개도 안 붙는다★ (" + t.배지수() + "개)",
    t.배지수() === 0,
    "배지가 붙기 시작했으면 고쳐진 것입니다 — 이 줄을 '4줄 중 N줄에 붙는다' 로 " +
    "바꾸고 날짜를 적으세요. 그리고 tests/ticker-board-seal.test.js [3] 과 " +
    "숫자가 맞는지 같이 확인하세요");
  t.닫기();

  /* ── 대조 실험 — 가짜 스텁을 끼우면 "초록" 이 된다는 증거 ─────────────
     tests/ticker-board-seal.test.js 가 쓰는 것과 같은 모양의 스텁입니다.
     같은 js/ticker-board.js 인데 배지가 붙습니다. 즉 그 봉인이 초록인 이유는
     코드가 멀쩡해서가 아니라 ★입력을 손으로 만들어 줬기 때문★ 입니다. */
  const t2 = 띄우기({
    레지스트리바꿔치기: (App) => {
      const 원래 = App.SymbolRegistry;
      App.SymbolRegistry = {
        getAll: 원래.getAll,
        getBySymbol: 원래.getBySymbol,
        isEnabled: (s) => s === "BTCUSDT",
        isMock: (s) => s !== "BTCUSDT", // ← 봉인 파일의 스텁과 같은 모양
      };
    },
  });
  ok("(대조) 가짜 스텁을 끼우면 같은 코드에서 배지가 3개 붙는다 — " +
    "★옛 봉인이 초록이던 이유★", t2.배지수() === 3,
    "실제 " + t2.배지수() + "개. 여기가 0 이면 이 대조 실험 자체가 틀렸습니다");
  t2.닫기();
}

/* =========================================================================
 * [2] ⭐ 값이 없는데 ★초록★ 이 칠해집니다
 * -------------------------------------------------------------------------
 *   js/ticker-board.js:48
 *       const changeClass = stats.changePercent >= 0 ? "pnl-positive" : "pnl-negative";
 *   null >= 0 은 ★true★ 입니다(null 이 숫자 0 으로 바뀝니다).
 *   그래서 값이 안 온 칸은 "-" 를 적으면서 ★상승(초록)★ 으로 칠해집니다.
 *   조사팀이 실제 HTML 에서 확인했습니다 — <td class="pnl-positive">-</td>
 *
 *   ⚠ 확정 팔레트는 건드리지 않습니다. 상승 #26C281 · 하락 #F0506E 그대로이고,
 *     여기서 보는 것은 ★값이 없을 때 둘 다 아니어야 한다★ 하나뿐입니다.
 * ========================================================================= */
절("[2] ⭐ 값이 없는 칸에 상승·하락 색이 칠해지는 것");
{
  /* 자바스크립트 사실을 먼저 적어 둡니다 — 다음 사람이 "왜?" 를 안 찾게 */
  ok("(사실) null >= 0 은 true 다 — 그래서 빈 값이 ★상승★ 으로 칠해진다",
    (null >= 0) === true);
  ok("(사실) undefined >= 0 은 false 다 — 그래서 빈 값이 ★하락(빨강)★ 으로 칠해진다",
    (undefined >= 0) === false);
  ok("(사실) NaN >= 0 은 false 다", (NaN >= 0) === false);

  /* 현실 재현 — 실제 스택에 BTC 시세만 밀어 넣습니다.
     라이브에서 4종목 중 BTC 하나만 값이 옵니다. */
  const t = 띄우기();
  t.시세보내기("BTCUSDT", 78864.12);
  t.통계보내기("BTCUSDT", 1.234, 79299.8, 77500);
  t.다시그리기();

  const btc = t.줄(0);
  ok("BTC 줄은 값이 정상으로 보인다 (" + btc.현재가 + " / " + btc.등락률 + ")",
    btc.현재가 === "78,864.12" && btc.등락률 === "+1.23%",
    JSON.stringify(btc) + " — 여기가 깨지면 아래 비교가 뜻을 잃습니다");
  ok("BTC 줄은 상승이라 pnl-positive 가 맞다", btc.등락클래스 === "pnl-positive",
    btc.등락클래스);

  const 나머지 = [1, 2, 3].map(t.줄);
  ok("[현황] 나머지 3줄은 값이 안 와서 현재가·등락률이 '-' 다",
    나머지.every((r) => r.현재가 === "-" && r.등락률 === "-"),
    JSON.stringify(나머지.map((r) => [r.현재가, r.등락률])) +
    " — 시세 공급원이 붙어 값이 오기 시작했으면 이 줄을 새 기준으로 고치고 날짜를 적으세요");

  /* ──────────────────────────────────────────────────────────────────────
     [현황] 2026-10-01 — 값이 ★없는★ 칸("-")에 상승(pnl-positive, 초록)이
            칠해진다. null >= 0 이 true 라서 그렇다. 회원은 "-" 인데 초록이라
            오르는 중으로 읽는다. 고쳐지면 이 줄이 빨강이 되니, 그때
            "값이 없으면 상승도 하락도 아니다" 를 새 기준으로 적을 것.
     ────────────────────────────────────────────────────────────────────── */
  ok("[현황] ★값이 없는 '-' 칸에 상승(초록 pnl-positive)이 칠해진다★ — 고장입니다",
    나머지.every((r) => r.등락클래스 === "pnl-positive"),
    "실제 클래스: " + JSON.stringify(나머지.map((r) => r.등락클래스)) +
    " — 고쳐졌으면(둘 다 아님) 이 줄을 아래 '올바른등락클래스' 기준으로 " +
    "바꾸고 날짜를 적으세요");

  /* undefined 가 오면 반대로 ★빨강★ 이 됩니다. 빨강은 손익 표시에만 쓰는
     색인데, 값이 없는 칸에 칠해집니다. 같은 "없음" 이 색이 두 가지입니다. */
  t.통계보내기("SAMSUNGUSDT", undefined, undefined, undefined);
  t.다시그리기();
  const 삼성 = t.줄(2);
  ok("[현황] 같은 '없음' 인데 undefined 면 ★하락(빨강 pnl-negative)★ 이 된다",
    삼성.등락률 === "-" && 삼성.등락클래스 === "pnl-negative",
    JSON.stringify(삼성) +
    " — null 은 초록, undefined 는 빨강. '없음' 의 색이 두 가지라는 뜻입니다");
  t.닫기();

  /* 고쳐졌을 때의 기준을 ★한 곳★ 에 적어 둡니다.
     지금 코드가 이 기준을 안 지키고 있다는 것까지 같이 못 박습니다. */
  function 올바른등락클래스(v) {
    if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) return "";
    return v >= 0 ? "pnl-positive" : "pnl-negative";
  }
  ok("(기준) 값이 없으면 상승도 하락도 아니다 (빈 클래스)",
    올바른등락클래스(null) === "" && 올바른등락클래스(undefined) === "" &&
    올바른등락클래스(NaN) === "");
  ok("(기준) 값이 있으면 지금처럼 상승·하락으로 나눈다",
    올바른등락클래스(1.5) === "pnl-positive" && 올바른등락클래스(-1.5) === "pnl-negative");
  ok("(기준) 값이 진짜 0 이면 상승이다 ('없음' 과 '0' 은 다르다)",
    올바른등락클래스(0) === "pnl-positive");

  const 지금코드 = read("js/ticker-board.js");
  ok("[현황] js/ticker-board.js 는 아직 이 기준을 안 쓴다 (null 검사 없이 >= 0)",
    /changePercent\s*>=\s*0\s*\?/.test(지금코드),
    "코드가 바뀌었습니다 — 이 줄과 위 [현황] 두 줄을 같이 새 기준으로 고치세요");
}

/* =========================================================================
 * [3] ⭐ 앞으로 ★가짜 스텁만으로 끝내지 못하게★
 * -------------------------------------------------------------------------
 *   이번 사고의 진짜 원인입니다. 전광판을 검사하는 테스트가 전부 스텁만
 *   쓰면, 현실에서 조건이 영원히 거짓이어도 아무도 모릅니다.
 *
 *   그래서 — ★전광판을 검사하는 테스트 중 최소 1개는 실제
 *   js/symbol-registry.js 를 태워야 한다★ 로 못 박습니다.
 *   (지금은 이 파일이 그 1개입니다. 이 파일이 지워지면 그 자리에서 터집니다)
 * ========================================================================= */
절("[3] ⭐ 전광판 검사에 '실제 레지스트리' 가 최소 1개 있어야 한다");
{
  const 테스트파일들 = fs.readdirSync(path.join(REPO, "tests"))
    .filter((f) => f.slice(-8) === ".test.js");

  /* ⚠ 주석을 먼저 지웁니다. 안 지우면 ★설명에만 경로를 적어 놓은 파일★ 이
     "실제로 태운다" 로 세어집니다. 이 파일 머리말에도 js/symbol-registry.js 가
     여러 번 적혀 있어서, 주석을 세면 이 검사가 그대로 가짜가 됩니다.
     (tests/four-symbols-seal.test.js 도 같은 이유로 주석을 지우고 봅니다) */
  function 주석제거(본문) {
    return 본문
      .replace(/\/\*[\s\S]*?\*\//g, " ")          // /* ... */ 통째로
      .split("\n")
      .filter((줄) => {
        const t = 줄.trim();
        return t.indexOf("//") !== 0 && t.indexOf("*") !== 0;
      })
      .join("\n");
  }

  /* 판정기 — 아래에서 이 함수들이 진짜 잡는지 돌연변이로 다시 시험합니다 */
  function 전광판테스트인가(본문) {
    return /js[/]ticker-board\.js/.test(본문) || /ticker-board-mock-badge/.test(본문);
  }
  function 실제레지스트리를태우나(본문) {
    return /js[/]symbol-registry\.js/.test(주석제거(본문));
  }
  function 구멍찾기(파일들, 본문읽기) {
    const 전광판 = 파일들.filter((f) => 전광판테스트인가(본문읽기(f)));
    const 실제 = 전광판.filter((f) => 실제레지스트리를태우나(본문읽기(f)));
    return { 전광판: 전광판, 실제: 실제, 구멍: 실제.length === 0 };
  }

  const 본문읽기 = (f) => read("tests/" + f);
  const 결과 = 구멍찾기(테스트파일들, 본문읽기);

  ok("전광판을 검사하는 테스트가 있다 (" + 결과.전광판.length + "개) — " +
     결과.전광판.join(" / "), 결과.전광판.length > 0);
  ok("★그중 실제 js/symbol-registry.js 를 태우는 것이 최소 1개 있다★ (" +
     결과.실제.length + "개)", !결과.구멍,
    "전부 가짜 스텁만 씁니다 — 2026-10-01 과 똑같은 사고가 다시 납니다. " +
    "실제 레지스트리로 돌리는 검사를 최소 1개 남겨 두세요");
  ok("이 파일 자신이 그 1개로 세어진다",
    결과.실제.indexOf("ticker-board-reality-seal.test.js") >= 0,
    "세어진 파일: " + JSON.stringify(결과.실제));

  /* 참고 — 스텁으로 isMock 을 흉내 내는 파일(실패 아님, 보이기용) */
  const 스텁쓰는파일 = 결과.전광판.filter((f) => /isMock\s*:/.test(본문읽기(f)));
  if (스텁쓰는파일.length) {
    console.log("    (참고) isMock 을 스텁으로 흉내 내는 전광판 테스트 " +
      스텁쓰는파일.length + "개 — " + 스텁쓰는파일.join(" / ") +
      " : 스텁 자체는 괜찮습니다. ★실제 레지스트리 검사가 같이 있어야★ 합니다");
  }

  /* ── 돌연변이 자체검증 — 위 판정기가 정말 잡는가 ───────────────────── */
  const 가짜본문 = {
    "a.test.js": 'win.eval(read("js/ticker-board.js")); isMock: () => true',
    "b.test.js": "전광판과 무관한 테스트",
    "c.test.js": 'win.eval(read("js/ticker-board.js")); win.eval(read("js/symbol-registry.js"));',
    /* 주석에만 경로를 적어 둔 파일 — 실제로는 스텁만 씁니다 */
    "d.test.js": '/* js/symbol-registry.js 를 참고했습니다 */\nwin.eval(read("js/ticker-board.js"));',
  };
  const 가짜읽기 = (f) => 가짜본문[f];
  ok("(돌연변이) 스텁만 쓰는 파일뿐이면 '구멍' 이라고 잡는다",
    구멍찾기(["a.test.js", "b.test.js"], 가짜읽기).구멍 === true,
    "여기서 못 잡으면 위 검사는 아무것도 안 지킵니다");
  ok("(돌연변이) 실제 레지스트리를 태우는 파일이 있으면 통과시킨다",
    구멍찾기(["a.test.js", "c.test.js"], 가짜읽기).구멍 === false);
  ok("(돌연변이) ★주석에만★ 경로를 적어 둔 파일은 '태운다' 로 세지 않는다",
    구멍찾기(["d.test.js"], 가짜읽기).구멍 === true,
    "주석을 세면 이 검사는 글자 찾기일 뿐이고, 스텁만 쓰는 봉인을 그대로 통과시킵니다");
  ok("(돌연변이) 전광판과 무관한 파일을 전광판 테스트로 세지 않는다",
    전광판테스트인가(가짜본문["b.test.js"]) === false);

  /* 옛 봉인이 아직 제자리에 있는지 — 이 파일은 그것을 ★대신하지 않고 보탭니다★ */
  ok("tests/ticker-board-seal.test.js 가 그대로 있다 (이 파일은 대체가 아니라 보탬)",
    fs.existsSync(path.join(REPO, "tests/ticker-board-seal.test.js")),
    "그 파일의 [5][6][7][8] 은 지금도 유효한 봉인입니다. 지우지 마세요");
}

/* =========================================================================
 * [4] 수정 금지 파일 12개
 * ========================================================================= */
절("[4] 수정 금지 파일 12개가 그대로다");
{
  const 잠긴 = require("./_locked-hashes.js");
  const 기준 = Object.assign({}, 잠긴.잠긴11, { "js/trading.js": 잠긴.TRADING });
  const md5 = (rel) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, rel))).digest("hex");

  ok("기준 해시가 12개다", Object.keys(기준).length === 12,
    "실제 " + Object.keys(기준).length + "개");
  const 다름 = Object.keys(기준).filter((f) => md5(f) !== 기준[f]);
  ok("12개 전부 기준 해시와 같다", 다름.length === 0,
    "달라진 파일: " + 다름.join(", "));
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " ticker-board-reality-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창이 2초 타이머(REFRESH_INTERVAL_MS)를 붙들고 있어서, 이게 없으면
   프로세스가 안 끝나고 뒤의 테스트가 통째로 실행되지 않습니다. */
process.exit(fail > 0 ? 1 : 0);
