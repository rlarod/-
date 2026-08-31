/* tests/market-war-power-bar-burst-seal.test.js
 * =========================================================================
 * 전쟁터 힘 막대 — 부하에서 되돌이가 안 난다 (2026-08-28 기록팀)
 * =========================================================================
 * 이 파일은 tests/market-war-power-bar.test.js (수리팀, 검사 43개) 를
 * **대신하지 않습니다.** 그 파일이 못 보는 한 가지만 더 봅니다.
 *
 * 수리팀 봉인 [6] 은 체결 **한 번**에 대해 이렇게 봅니다 —
 *
 *     관찰기 콜백이 1~2회로 끝난다 (되돌이 아님)      <- 1 도 통과, 2 도 통과
 *
 * 그런데 되돌이 방지 두 겹 중 하나(observer.takeRecords())를 빼면
 * **콜백이 정확히 2회가 됩니다.** 위 검사는 그대로 통과합니다.
 * 한 번만 재면 1회와 2회를 구별할 이유가 없어 보이기 때문입니다.
 *
 * 부하를 걸면 그 차이가 드러납니다.
 *
 *   2026-08-28 실측 (수리팀, 실제 브라우저 35.3초)
 *     체결 894건 · 관찰기 콜백 894회 · 되덮기 894회 · 쓰기 896회
 *     -> 콜백 수 == 체결 수 (1.0배). 되돌이가 있었으면 수십만으로 튑니다.
 *
 *   2026-08-28 실측 (기록팀, jsdom 300건)
 *     기준선                      콜백 300 · 되덮기 300 · 쓰기 300   (1.0배)
 *     takeRecords() 를 빼면       콜백 600                          (2.0배)  <- 수리팀 검사는 통과함
 *     멱등 비교를 하나 빼면       쓰기 303                          (미세)
 *     writing 가드를 빼면         변화 없음
 *     두 겹 다 빼도               콜백 600 (무한루프까지는 아님)
 *
 * 여기서 알게 된 것 — **두 겹은 서로 예비가 아니라 하는 일이 다릅니다.**
 *     observer.takeRecords() : 관찰기가 깨는 횟수를 반으로 줄입니다 (효율)
 *     apply() 의 멱등        : 되돌이를 실제로 **끝내는** 것은 이쪽입니다 (안전)
 *   그래서 takeRecords 가 사라져도 화면은 멀쩡하고 오류도 안 납니다.
 *   조용히 두 배 일하는 상태가 됩니다. 이 파일이 그걸 잡습니다.
 *
 * 무엇을 보나
 * -----------
 *   [1] 300건을 몰아쳐도 콜백 수 == 체결 수 (1.0배)
 *   [2] 몰아친 뒤 가만히 두면 아무 일도 안 일어난다
 *   [3] 두 번째 몰아쳐도 같은 비율 — 시간이 갈수록 나빠지지 않는다 (누적 없음)
 *   [4] 되돌이 방지 두 겹이 코드에 그대로 있다
 *
 * 서버도 브라우저도 부르지 않습니다. jsdom 으로 실제 모듈을 그대로 돌립니다.
 * 시간 간격을 흉내내지 않습니다 — 실제 MutationObserver 가 실제로 돕니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  [O] " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  [X] " + 제목 + (도움말 ? " -> " + 도움말 : ""));
  }
}
function 절(제목) { console.log("\n" + 제목); }

function 주석제거(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/* 실제 모듈을 그대로 띄웁니다 — 동작을 흉내내지 않습니다.
   jsdom 은 link 를 안 받아오므로 css 를 style 로 넣습니다. */
function 창만들기(비율) {
  const vc = new VirtualConsole();          // jsdom 의 CSS 경고를 삼킵니다
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
    virtualConsole: vc,
  });
  const win = dom.window;
  const st = win.document.createElement("style");
  st.textContent = read("css/order-pressure-unknown.css");
  win.document.head.appendChild(st);
  win.eval("window.App = window.App || {};");
  win.App.OrderPressureBar = { getRatio: 비율 };
  win.eval(read("js/market-war-power-bar.js"));
  win.App.MarketWarPowerBar.init();
  return win;
}

const 한틱 = () => new Promise((r) => setTimeout(r, 0));

/* 체결이 한 번 올 때마다 원본(js/market-war.js)이 막대를 자기 값으로 덮습니다.
   그 덮는 모양을 그대로 흉내냅니다 — 수리팀 봉인 [6] 과 같은 방식입니다. */
async function 몰아치기(win, 횟수) {
  const d = win.document;
  for (let i = 0; i < 횟수; i++) {
    d.getElementById("mw-power-buy").style.width = (40 + (i % 10)) + "%";
    d.getElementById("mw-power-sell").style.width = (60 - (i % 10)) + "%";
    d.getElementById("mw-buy-pct").textContent = (40 + (i % 10)) + "%";
    d.getElementById("mw-sell-pct").textContent = (60 - (i % 10)) + "%";
    await 한틱();                            // MutationObserver 가 실제로 돌 틈을 줍니다
  }
  await 한틱();
  await 한틱();
}

async function main() {
  const win = 창만들기(() => ({ buy: 0.7, sell: 0.3 }));
  await 한틱();

  /* =======================================================================
   * [1] 몰아쳐도 콜백 수 == 체결 수
   * ===================================================================== */
  절("[1] 300건을 몰아쳐도 콜백이 체결 수만큼만 (되돌이 아님)");

  const N1 = 300;
  const a0 = win.App.MarketWarPowerBar.getCounters();
  const t0 = Date.now();
  await 몰아치기(win, N1);
  const a1 = win.App.MarketWarPowerBar.getCounters();
  const 걸린 = Date.now() - t0;

  const 콜백1 = a1.observerHits - a0.observerHits;
  const 되덮기1 = a1.rewrites - a0.rewrites;
  const 쓰기1 = a1.writes - a0.writes;

  console.log("      체결 " + N1 + "건 / " + 걸린 + "ms — 콜백 " + 콜백1 +
    " · 되덮기 " + 되덮기1 + " · 쓰기 " + 쓰기1);

  ok("관찰기 콜백이 체결 수와 같다 (" + 콜백1 + " / " + N1 + " = " +
      (콜백1 / N1).toFixed(2) + "배)",
    콜백1 === N1,
    "2배면 observer.takeRecords() 가 빠진 것입니다. 화면은 멀쩡하고 오류도 안 나지만 " +
    "관찰기가 두 배로 깹니다. 수십 배면 되돌이입니다");

  ok("되덮기가 체결 수와 같다 (" + 되덮기1 + " / " + N1 + ")",
    되덮기1 === N1,
    "원본이 덮을 때마다 정확히 한 번씩만 되돌려 놓아야 합니다");

  /* 쓰기는 1초짜리 새로고침 타이머(REFRESH_MS=1000)가 같이 도는 동안 몇 번
     더 붙을 수 있어 여유를 둡니다. 실측은 정확히 N 이었습니다. */
  ok("쓰기가 체결 수 근처다 (" + 쓰기1 + " / " + N1 + ")",
    쓰기1 >= N1 && 쓰기1 <= N1 + 10,
    "크게 늘었으면 apply() 가 값이 같은데도 매번 쓰고 있는 것입니다(멱등 깨짐)");

  /* =======================================================================
   * [2] 몰아친 뒤 가만히 두면 멈춘다
   * ===================================================================== */
  절("[2] 몰아친 뒤 가만히 두면 아무 일도 안 일어난다");
  {
    const b0 = win.App.MarketWarPowerBar.getCounters();
    for (let i = 0; i < 20; i++) await 한틱();
    const b1 = win.App.MarketWarPowerBar.getCounters();
    ok("아무도 안 건드리면 관찰기가 더 안 불린다 (" +
        b0.observerHits + " -> " + b1.observerHits + ")",
      b1.observerHits === b0.observerHits,
      "부하 뒤에 혼자 계속 돌면 폰 배터리를 먹습니다");
    ok("아무도 안 건드리면 되덮기도 안 늘어난다 (" +
        b0.rewrites + " -> " + b1.rewrites + ")",
      b1.rewrites === b0.rewrites);
  }

  /* =======================================================================
   * [3] 두 번째로 몰아쳐도 같은 비율 — 누적되지 않는다
   * =====================================================================
   * "페이지를 열 때마다 0이 되는 카운터" 의 반대쪽입니다.
   * 관찰기나 청취자를 체결마다 하나씩 더 붙이는 식으로 새면
   * 두 번째 부하에서 비율이 올라갑니다. 한 번만 재면 절대 안 보입니다. */
  절("[3] 두 번째로 몰아쳐도 비율이 그대로다 (관찰기가 새지 않는다)");
  {
    const N2 = 100;
    const c0 = win.App.MarketWarPowerBar.getCounters();
    await 몰아치기(win, N2);
    const c1 = win.App.MarketWarPowerBar.getCounters();
    const 콜백2 = c1.observerHits - c0.observerHits;
    const 되덮기2 = c1.rewrites - c0.rewrites;
    console.log("      두 번째 체결 " + N2 + "건 — 콜백 " + 콜백2 + " · 되덮기 " + 되덮기2);
    ok("두 번째 부하도 콜백이 체결 수와 같다 (" + 콜백2 + " / " + N2 + " = " +
        (콜백2 / N2).toFixed(2) + "배)",
      콜백2 === N2,
      "첫 번째보다 비율이 올랐으면 관찰기나 청취자가 쌓이고 있는 것입니다");
    ok("두 번째 부하도 되덮기가 체결 수와 같다 (" + 되덮기2 + " / " + N2 + ")",
      되덮기2 === N2);
  }

  win.App.MarketWarPowerBar.stop();
  win.close();

  /* =======================================================================
   * [4] 되돌이 방지 두 겹이 코드에 그대로 있다
   * =====================================================================
   * 위 [1]~[3] 은 지금 이 코드가 잘 돈다는 것만 봅니다. 누가 takeRecords 를
   * 빼면 [1] 이 잡아주지만, 왜 필요한지 모르면 또 빼게 됩니다.
   * 그래서 두 겹이 있다는 사실 자체를 근거와 함께 못 박습니다. */
  절("[4] 되돌이 방지 두 겹이 코드에 그대로 있다");
  {
    const 코드 = 주석제거(read("js/market-war-power-bar.js"));

    ok("observer.takeRecords() 로 우리가 만든 변경 기록을 버린다",
      /observer\s*\.\s*takeRecords\s*\(\s*\)/.test(코드),
      "이게 빠지면 관찰기가 두 배로 깹니다 (실측 300 -> 600). " +
      "MutationObserver 콜백은 마이크로태스크라 writing 플래그를 내리는 것만으로는 늦습니다");

    ok("우리가 쓰는 동안임을 표시하는 플래그(writing)를 쓴다",
      /writing\s*=\s*true/.test(코드) && /writing\s*=\s*false/.test(코드),
      "우리가 쓴 것을 남이 쓴 것으로 오해하면 스스로를 계속 되덮습니다");

    ok("관찰기 콜백이 그 플래그를 먼저 본다",
      /if\s*\(\s*writing\s*\)\s*return/.test(코드),
      "이 한 줄이 우리가 쓴 것을 걸러냅니다");

    /* 되돌이를 실제로 끝내는 것은 멱등입니다 — 값이 같으면 안 씁니다.
       두 겹을 다 빼도 무한루프가 안 났던 이유가 이것입니다(2026-08-28 실측). */
    const 같으면안쓴다 = (코드.match(/!==\s*d\.(buyW|sellW|buyT|sellT)/g) || []).length;
    ok("값이 이미 같으면 안 쓴다 — 되돌이를 끝내는 것은 이쪽입니다 (지금 " +
        같으면안쓴다 + "곳)",
      같으면안쓴다 === 4,
      "무조건 쓰면 쓸 때마다 새 변경 기록이 생겨 되돌이가 안 끝납니다. " +
      "지금 4곳은 매수폭 · 매도폭 · 매수글자 · 매도글자입니다");

    ok("apply() 가 바뀐 게 있을 때만 쓰기 횟수를 센다",
      /if\s*\(\s*changed\s*\)\s*writes\+\+/.test(코드),
      "안 바뀌었는데 세면 위 [1] 의 쓰기 숫자가 뜻을 잃습니다");
  }

  console.log("\n  통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패한 것");
    실패목록.forEach((m) => console.log("  - " + m));
  }
  process.exit(fail ? 1 : 0);
}

main();
