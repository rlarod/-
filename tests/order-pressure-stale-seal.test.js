/* tests/order-pressure-stale-seal.test.js
 * =========================================================================
 * 매수/매도 압력 바 — "값이 있다가 끊긴 뒤" 를 못 박습니다 (2026-08-28)
 * =========================================================================
 * 기록팀 / 본부장 배정.
 *
 * ── 왜 이 파일을 따로 만들었나 ─────────────────────────────────────────
 *   수리팀이 만든 tests/order-pressure-unknown.test.js 는
 *   "0건 -> 모름" 과 "체결이 오면 실제 비율로 찬다" 를 잘 봅니다.
 *   ★진짜 반반(1:1)은 모름이 아니다★ 도 반 클래스·막대 50% 두 가지로
 *   제대로 걸려 있습니다. 그 부분은 여기서 다시 하지 않습니다.
 *
 *   빠져 있던 것은 **반대 방향**입니다 —
 *   값이 한 번 차고 나서 체결이 끊기면 다시 '모름' 으로 돌아가는가.
 *
 *   조사팀 30일치 실측 — 연속 0건 구간이 실제로 있습니다.
 *       나스닥 3분 · 삼성전자 7분 · SK하이닉스 2분
 *   이때 막대가 3분 전 비율(예: 매수 75%)을 그대로 들고 있으면,
 *   회원은 그 숫자를 **지금 값으로 믿고** 주문을 넣습니다.
 *   화면도 멀쩡하고 오류도 없습니다 — 처음 건과 똑같은 조용한 고장이고,
 *   등급도 같습니다(P1 — 회원이 잘못된 정보로 판단하게 만드는 것).
 *
 * ── 여기서 못 박는 것 ───────────────────────────────────────────────────
 *   [1] 60초가 지난 체결만 남으면 다시 '모름' 으로 돌아온다
 *   [2] 오래된 체결이 최근 비율에 섞이지 않는다 (60초 창이 진짜로 잘린다)
 *   [3] 종목을 바꾸면 옛 종목 비율이 그 자리에서 사라진다 (1초를 기다리지 않는다)
 *   [4] 다른 종목 체결로는 '모름' 이 풀리지 않는다
 *   [5] 수량이 0·음수·숫자가 아닌 체결로는 '모름' 이 풀리지 않는다
 *
 * ── 왜 시간을 뒤로 돌리지 않고 '오래된 시각' 을 넣나 ────────────────────
 *   모듈이 p.time 을 그대로 씁니다. 그래서 60초를 실제로 기다리지 않고
 *   "3분 전에 온 체결" 을 그대로 재현할 수 있습니다.
 *   ⚠ 시간에 여유를 둡니다 — 전체를 한꺼번에 돌릴 때 짧게 잡으면 가끔 틀립니다.
 *
 * ⛔ 손익·랭킹 계산식은 건드리지도 검사하지도 않습니다. 표시만 봅니다.
 * ⚠ 사이트 코드는 한 글자도 안 고칩니다. 서버에도 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/order-pressure-unknown.css";
const JS_REL = "js/order-pressure-bar.js";

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

/* 실제 모듈을 그대로 띄웁니다 — 동작을 흉내내지 않습니다 */
function 띄우기() {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/"
  });
  const win = dom.window;
  const st = win.document.createElement("style");
  st.textContent = read(CSS_REL);
  win.document.head.appendChild(st);

  win.eval("window.App = window.App || {};");
  win.eval(
    "App.Bus = (function(){var m={};return {" +
      "on:function(e,f){(m[e]=m[e]||[]).push(f);}," +
      "emit:function(e,p){(m[e]||[]).forEach(function(f){f(p);});}};})();"
  );
  win.eval("App.Config = { getActiveSymbol: function(){ return window.__sym || 'BTCUSDT'; } };");
  win.eval(read(JS_REL));
  win.App.OrderPressureBar.init();
  return win;
}

/** 체결 하나. 몇 초 전 것인지(초전)와 종목을 골라 넣을 수 있습니다 */
function 체결(win, 수량, 테이커매수, 옵션) {
  옵션 = 옵션 || {};
  win.App.Bus.emit("trade:tick", {
    symbol: 옵션.symbol || "BTCUSDT",
    qty: 수량,
    isBuyerMaker: !테이커매수,
    time: Date.now() - (옵션.초전 || 0) * 1000
  });
}

const 상자 = (win) => win.document.querySelector(".order-pressure-bar");
const 매수바 = (win) => win.document.getElementById("order-pressure-buy");
const 매도바 = (win) => win.document.getElementById("order-pressure-sell");
const 매수글 = (win) => win.document.getElementById("order-pressure-buy-text").textContent;
const 기다리기 = (ms) => new Promise((r) => setTimeout(r, ms));

(async function 본체() {
console.log("\n압력 바 — 값이 있다가 끊긴 뒤 (2026-08-28)");

/* =========================================================================
 * [1] 값이 찼다가 체결이 끊기면 다시 모름으로 돌아온다
 * ========================================================================= */
절("[1] 체결이 끊기면 다시 '모름' 으로 돌아온다 (나스닥 3분 공백)");
{
  const win = 띄우기();

  /* 먼저 실제 비율로 채웁니다 — 매수 3 / 매도 1 = 75% */
  체결(win, 3, true);
  체결(win, 1, false);
  await 기다리기(1500); /* 모듈 주기 1000ms. 넉넉히 잡습니다 */
  ok("(먼저) 막대가 75% 로 차 있다", 매수바(win).style.width === "75%", 매수바(win).style.width);
  ok("(먼저) 모름 표시가 꺼져 있다", !상자(win).classList.contains("is-unknown"));

  /* 이제 3분(180초) 동안 체결이 하나도 안 옵니다.
     모듈은 p.time 으로 60초 창을 자르므로, 180초 전 체결만 남은 상태를
     그대로 재현합니다. 아까 넣은 두 건도 60초 창 밖으로 나가야 합니다. */
  const win2 = 띄우기();
  체결(win2, 3, true, { 초전: 180 });
  체결(win2, 1, false, { 초전: 180 });
  await 기다리기(1500);

  ok("3분 전 체결만 있으면 getRatio() 가 null 이다 (75% 를 계속 붙들지 않는다)",
    win2.App.OrderPressureBar.getRatio() === null,
    JSON.stringify(win2.App.OrderPressureBar.getRatio()));
  ok("모름 표시가 다시 켜진다", 상자(win2).classList.contains("is-unknown"),
    "class=" + 상자(win2).className);
  ok("매수 막대가 0 으로 돌아온다 (옛 비율이 남지 않는다)",
    win2.getComputedStyle(매수바(win2)).width === "0px", win2.getComputedStyle(매수바(win2)).width);
  ok("매도 막대도 0 으로 돌아온다",
    win2.getComputedStyle(매도바(win2)).width === "0px", win2.getComputedStyle(매도바(win2)).width);
  ok("글자도 '매수 —' 로 돌아온다", 매수글(win2) === "매수 —", 매수글(win2));

  const bg = win2.getComputedStyle(win2.document.querySelector(".order-pressure-track")).backgroundImage || "";
  ok("빗금이 다시 깔린다 (값이 없다는 것이 눈에 보인다)",
    bg.indexOf("repeating-linear-gradient") !== -1, bg.slice(0, 60) || "(없음)");
}

/* =========================================================================
 * [2] 60초 창이 진짜로 잘린다
 * ========================================================================= */
절("[2] 오래된 체결이 지금 비율에 섞이지 않는다");
{
  const win = 띄우기();
  /* 3분 전에 매도가 100 쏟아졌고, 방금 매수가 3 들어왔습니다.
     60초 창이 안 잘리면 매수 3%(거의 매도 일색)로 보입니다. */
  체결(win, 100, false, { 초전: 180 });
  체결(win, 3, true);
  await 기다리기(1500);

  const r = win.App.OrderPressureBar.getRatio();
  ok("최근 60초 것만 센다 — 매수 100% 가 나온다", !!r && r.buyPct === 100, JSON.stringify(r));
  ok("막대도 100% 로 찬다", 매수바(win).style.width === "100%", 매수바(win).style.width);

  /* 경계 — 59초 전 것은 아직 창 안입니다 (60초를 59초로 줄이면 여기서 걸립니다) */
  /* ⚠ 시간에 여유를 둡니다 — 기다리는 1.5초도 창을 갉아먹습니다.
     처음에 59초로 뒀더니 59 + 1.5 = 60.5초가 되어 창 밖으로 나갔습니다
     (2026-08-28 실측, 이 파일 만들다가 걸린 것입니다). 50초로 넉넉히 둡니다. */
  const win2 = 띄우기();
  체결(win2, 1, true, { 초전: 50 });
  await 기다리기(1500);
  ok("50초 전 체결은 아직 창 안이다 (창을 함부로 줄이면 여기서 걸립니다)",
    win2.App.OrderPressureBar.getRatio() !== null,
    JSON.stringify(win2.App.OrderPressureBar.getRatio()));

  const win3 = 띄우기();
  체결(win3, 1, true, { 초전: 70 });
  await 기다리기(1500);
  ok("70초 전 체결은 창 밖이다", win3.App.OrderPressureBar.getRatio() === null,
    JSON.stringify(win3.App.OrderPressureBar.getRatio()));
}

/* =========================================================================
 * [3] 종목을 바꾸면 그 자리에서 비워진다
 * ========================================================================= */
절("[3] 종목 전환 — 옛 종목 비율이 새 종목 이름표 아래 남지 않는다");
{
  const win = 띄우기();
  체결(win, 3, true);
  체결(win, 1, false);
  await 기다리기(1500);
  ok("(먼저) BTC 비율 75% 가 차 있다", 매수바(win).style.width === "75%", 매수바(win).style.width);

  win.__sym = "QQQUSDT";
  win.App.Bus.emit("symbol:change", { symbol: "QQQUSDT" });

  /* 여기서 기다리지 않습니다 — 1초 주기를 기다리면 그 1초 동안 회원은
     나스닥 이름표 아래에서 비트코인 비율을 봅니다 */
  ok("종목을 바꾼 그 자리에서 모름으로 돌아간다 (1초를 기다리지 않는다)",
    상자(win).classList.contains("is-unknown"), "class=" + 상자(win).className);
  /* jsdom 은 width:0 을 "0px" 로 되돌려 줍니다. 숫자로 봅니다. */
  ok("막대도 그 자리에서 0 이 된다", parseFloat(매수바(win).style.width) === 0, 매수바(win).style.width);
  ok("글자도 그 자리에서 '매수 —' 가 된다", 매수글(win) === "매수 —", 매수글(win));
  ok("getRatio() 도 null 이다", win.App.OrderPressureBar.getRatio() === null,
    JSON.stringify(win.App.OrderPressureBar.getRatio()));
}

/* =========================================================================
 * [4] 다른 종목 체결로는 모름이 풀리지 않는다
 * ========================================================================= */
절("[4] 다른 종목 체결이 섞이지 않는다");
{
  const win = 띄우기(); /* 활성 종목은 BTCUSDT */
  체결(win, 5, true, { symbol: "QQQUSDT" });
  체결(win, 5, false, { symbol: "SAMSUNGUSDT" });
  await 기다리기(1500);
  ok("다른 종목 체결만 오면 여전히 모름이다",
    win.App.OrderPressureBar.getRatio() === null,
    JSON.stringify(win.App.OrderPressureBar.getRatio()));
  ok("모름 표시도 켜진 채다", 상자(win).classList.contains("is-unknown"));

  체결(win, 5, true); /* 이제 진짜 BTC 체결 */
  await 기다리기(1500);
  ok("내 종목 체결이 오면 그때 풀린다", win.App.OrderPressureBar.getRatio() !== null,
    JSON.stringify(win.App.OrderPressureBar.getRatio()));
  ok("섞이지 않았으므로 매수 100% 다",
    win.App.OrderPressureBar.getRatio().buyPct === 100,
    JSON.stringify(win.App.OrderPressureBar.getRatio()));
}

/* =========================================================================
 * [5] 빈 체결로 모름이 풀리지 않는다
 * ========================================================================= */
절("[5] 수량이 없는 체결로는 '모름' 이 풀리지 않는다");
{
  const win = 띄우기();
  체결(win, 0, true);
  체결(win, -3, false);
  체결(win, NaN, true);
  체결(win, undefined, false);
  체결(win, "이상한값", true);
  win.App.Bus.emit("trade:tick", null);
  await 기다리기(1500);

  ok("수량 0·음수·숫자가 아닌 체결은 세지 않는다 (가짜로 모름이 풀리면 안 됩니다)",
    win.App.OrderPressureBar.getRatio() === null,
    JSON.stringify(win.App.OrderPressureBar.getRatio()));
  ok("모름 표시가 그대로 켜져 있다", 상자(win).classList.contains("is-unknown"),
    "class=" + 상자(win).className);
  ok("막대도 0 그대로다", win.getComputedStyle(매수바(win)).width === "0px",
    win.getComputedStyle(매수바(win)).width);
}

/* ========================================================================= */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  - " + s));
  console.log("order-pressure-stale-seal - 실패");
  process.exit(1);
}
console.log("order-pressure-stale-seal - 전체 통과");
process.exit(0);
})();
