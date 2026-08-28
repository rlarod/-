/**
 * tests/market-war-power-bar.test.js
 * =========================================================================
 * 전쟁터(MARKET WAR) 힘 막대가 다시 "영구 50:50" 으로 돌아가지 않게 못박습니다.
 *
 * ── 무엇이 문제였나 (2026-08-28 수리팀 실측) ─────────────────────────
 *   js/market-war.js 의 강도(intensity)는 체결 1건마다 약 20~22 오르고
 *   초당 4.5 밖에 안 내려갑니다. 실측 체결이 초당 10건 넘게 오므로
 *   ★상승이 감소의 10~41배★ → 양쪽 다 상한 100 에 붙습니다.
 *   상한에 붙은 두 값의 비율은 정의상 언제나 50:50 입니다.
 *
 *     고치기 전 32초 16샘플  막대 폭 49.264% ~ 51.329% (평균 50.28%)
 *     같은 순간 압력 바      매수 89% / 매도 11%
 *
 *   회원은 "지금 딱 반반" 으로 잘못 읽습니다.
 *
 * ── 무엇을 지키나 ─────────────────────────────────────────────────────
 *   [1] index.html 첫 마크업이 가짜 50% 가 아니다
 *   [2] js/market-war.js 는 한 글자도 안 고쳤다(연출 무변경의 근거)
 *   [3] 계산을 두 벌 만들지 않았다 — 압력 바 것을 그대로 재사용한다
 *   [4] 50 을 지어내지 않는다 (없으면 '모름')
 *   [5] 실제로 띄워서 — 값이 있으면 채우고 없으면 '모름'
 *   [6] ★MutationObserver 되돌이가 안 난다★ (원본이 덮어도 1회로 끝남)
 *   [7] 파일이 index.html 에 실려 있고 git 에도 있다
 *   [8] main.js 부팅 목록에 있고 OrderPressureBar 뒤다
 *
 * 테스트 파일은 끝에서 process.exit(0) 을 부릅니다 (jsdom 이 안 끝납니다).
 * ========================================================================= */

const fs = require("fs");
const path = require("path");
/* execFileSync 는 쓰지 않습니다 — git 등록 검사는 html-assets-tracked 담당 */
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
const MARK_OK = "OK";
const MARK_NG = "NG";

let pass = 0;
let fail = 0;
const failed = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  " + MARK_OK + " " + name);
  } else {
    fail++;
    failed.push(name + (detail ? " → " + detail : ""));
    console.log("  " + MARK_NG + " " + name + (detail ? " → " + detail : ""));
  }
}
function section(t) {
  console.log("\n" + t);
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const JS_REL = "js/market-war-power-bar.js";
const OPB_REL = "js/order-pressure-bar.js";
const MW_REL = "js/market-war.js";
const CSS_REL = "css/order-pressure-unknown.css";

/* 주석을 지운 "코드만" — 주석에 이름이 나오는 것과 실제로 쓰는 것을 구분합니다. */
function codeOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

/* -------------------------------------------------------------------------
 * 실제 모듈을 그대로 띄웁니다 — 동작을 흉내내지 않습니다.
 * jsdom 은 <link> 를 안 받아오므로 css 를 <style> 로 넣습니다.
 * ----------------------------------------------------------------------- */
function boot(ratioFn) {
  const dom = new JSDOM(read("index.html"), {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/",
  });
  const win = dom.window;

  const st = win.document.createElement("style");
  st.textContent = read(CSS_REL);
  win.document.head.appendChild(st);

  win.eval("window.App = window.App || {};");
  /* 압력 바 자리에 시험용 getRatio 만 꽂습니다 —
     이 모듈이 "압력 바 것을 그대로 쓴다"는 사실 자체를 시험합니다. */
  win.App.OrderPressureBar = { getRatio: ratioFn };
  win.eval(read(JS_REL));
  win.App.MarketWarPowerBar.init();
  return win;
}

function 상태(win) {
  const d = win.document;
  return {
    buy: d.getElementById("mw-buy-pct").textContent,
    sell: d.getElementById("mw-sell-pct").textContent,
    buyW: d.getElementById("mw-power-buy").style.width,
    sellW: d.getElementById("mw-power-sell").style.width,
    bar: d.querySelector(".mw-power-bar").className,
    label: d.querySelector(".mw-power-label").className,
  };
}

const 잠깐 = () => new Promise((r) => setTimeout(r, 60));

async function main() {
  /* =====================================================================
   * [1] index.html 첫 마크업 — 페이지를 열자마자 보이는 값
   * =================================================================== */
  section("[1] index.html 첫 마크업이 가짜 50% 가 아니다");
  {
    const doc = new JSDOM(read("index.html")).window.document;
    const bar = doc.querySelector(".mw-power-bar");
    const label = doc.querySelector(".mw-power-label");
    const buy = doc.getElementById("mw-power-buy");
    const sell = doc.getElementById("mw-power-sell");
    const buyT = doc.getElementById("mw-buy-pct");
    const sellT = doc.getElementById("mw-sell-pct");

    ok("힘 막대 마크업이 있다", !!bar);
    ok("매수/매도 칸이 둘 다 있다 (지우지 않았다)", !!buy && !!sell);
    ok(
      "막대에 첫 화면부터 is-unknown 이 켜져 있다",
      !!bar && bar.classList.contains("is-unknown"),
      bar ? 'class="' + bar.className + '"' : "없음"
    );
    ok(
      "글자 줄에도 is-unknown 이 켜져 있다",
      !!label && label.classList.contains("is-unknown"),
      label ? 'class="' + label.className + '"' : "없음"
    );

    const bw = buy ? buy.getAttribute("style") || "" : "";
    const sw = sell ? sell.getAttribute("style") || "" : "";
    ok("매수 막대 첫 폭이 50% 가 아니다", !/width\s*:\s*50%/.test(bw), 'style="' + bw + '"');
    ok("매도 막대 첫 폭이 50% 가 아니다", !/width\s*:\s*50%/.test(sw), 'style="' + sw + '"');
    ok("BUY 글자가 '50%' 가 아니다", !!buyT && buyT.textContent.indexOf("50%") === -1, buyT ? buyT.textContent : "없음");
    ok("SELL 글자가 '50%' 가 아니다", !!sellT && sellT.textContent.indexOf("50%") === -1, sellT ? sellT.textContent : "없음");
  }

  /* =====================================================================
   * [2] js/market-war.js 무수정 — 연출이 안 바뀌었다는 근거
   *     (강도 상수를 건드리면 병사·무기·HUD 가 통째로 바뀝니다.
   *      2026-08-28 PM 지시로 이번 범위 밖입니다)
   * =================================================================== */
  section("[2] js/market-war.js 를 한 글자도 안 고쳤다 (연출 무변경)");
  {
    const MW = read(MW_REL);
    ok("강도 상승폭이 그대로다 (PERCENTILE_GAIN 20)", /PERCENTILE_GAIN:\s*20\b/.test(MW));
    ok("강도 상승폭이 그대로다 (FREQUENCY_GAIN 10)", /FREQUENCY_GAIN:\s*10\b/.test(MW));
    ok("강도 상승폭이 그대로다 (STREAK_GAIN 8)", /STREAK_GAIN:\s*8\b/.test(MW));
    ok("강도 감소율이 그대로다 (INTENSITY_DECAY_PER_SEC 4.5)", /INTENSITY_DECAY_PER_SEC:\s*4\.5\b/.test(MW));
    ok("무기 등급 문턱이 그대로다 (EXTREME_THRESHOLD 97)", /EXTREME_THRESHOLD:\s*97\b/.test(MW));
    ok(
      "원본의 막대 그리기 코드가 그대로 남아 있다(우회로 해결했다는 증거)",
      /buyEl\.style\.width = buyPct \+ "%"/.test(MW)
    );
    ok(
      "원본은 여전히 강도로 막대를 그린다 — 우리는 그 위를 덮을 뿐이다",
      /const total = buyIntensity \+ sellIntensity;/.test(MW)
    );
  }

  /* =====================================================================
   * [3] 계산을 두 벌 만들지 않았다
   * =================================================================== */
  section("[3] 계산을 새로 만들지 않고 압력 바 것을 그대로 쓴다");
  {
    const SRC = codeOnly(read(JS_REL));
    ok(
      "App.OrderPressureBar.getRatio() 를 부른다",
      /App\.OrderPressureBar\.getRatio\s*\(/.test(SRC),
      "계산이 두 벌이 되면 나중에 조용히 갈라집니다"
    );
    ok("자기만의 60초 창을 새로 만들지 않았다", !/60000/.test(SRC), "WINDOW_MS 를 또 정의하면 두 벌입니다");
    ok("자기만의 체결 집계를 만들지 않았다", !/isBuyerMaker/.test(SRC), "테이커 판정이 두 벌이면 갈라집니다");
    ok(
      "전쟁터 강도값(getBuySellRatio)에 기대지 않는다",
      SRC.indexOf("getBuySellRatio") === -1,
      "강도는 둘 다 상한 100 이라 늘 50:50 입니다"
    );
    /* 압력 바 쪽 정의도 그대로여야 같은 값이 나옵니다 */
    const OPB = read(OPB_REL);
    ok("압력 바의 60초 창이 그대로다", /WINDOW_MS\s*=\s*60000/.test(OPB));
    ok("압력 바가 여전히 없으면 null 을 돌려준다", /if\s*\(total\s*<=\s*0\)\s*return null;/.test(OPB));
  }

  /* =====================================================================
   * [4] 50 을 지어내지 않는다
   * =================================================================== */
  section("[4] 없을 때 50 을 지어내지 않는다");
  {
    const SRC = codeOnly(read(JS_REL));
    ok(
      "코드 어디에도 대체값 50 이 없다",
      !/:\s*50\b/.test(SRC) && !/=\s*50\b/.test(SRC),
      "50 을 지어내면 '모름'이 '반반'이 됩니다"
    );
    ok("없을 때 대시(—) 를 쓴다", SRC.indexOf('"—"') !== -1);
    ok("없을 때 is-unknown 을 켠다", SRC.indexOf("is-unknown") !== -1);
  }

  /* =====================================================================
   * [5] 실제로 띄워서 — 값이 있으면 채우고 없으면 '모름'
   * =================================================================== */
  section("[5] 실제 동작 — 값이 있을 때 / 없을 때");
  {
    const win1 = boot(() => ({ buyPct: 89, sellPct: 11 }));
    const s1 = 상태(win1);
    ok("값이 있으면 BUY 글자가 그 값이다", s1.buy === "89%", s1.buy);
    ok("값이 있으면 SELL 글자가 그 값이다", s1.sell === "11%", s1.sell);
    ok("값이 있으면 막대 폭이 그 값이다", s1.buyW === "89%" && s1.sellW === "11%", s1.buyW + " / " + s1.sellW);
    ok(
      "값이 있으면 is-unknown 이 꺼진다",
      s1.bar.indexOf("is-unknown") === -1 && s1.label.indexOf("is-unknown") === -1,
      s1.bar + " | " + s1.label
    );
    win1.App.MarketWarPowerBar.stop();
    win1.close();

    const win2 = boot(() => null);
    const s2 = 상태(win2);
    ok("값이 없으면 BUY 글자가 대시다", s2.buy === "—", s2.buy);
    ok("값이 없으면 SELL 글자가 대시다", s2.sell === "—", s2.sell);
    ok("값이 없으면 막대 폭이 0 이다 (50% 가 아니다)", s2.buyW === "0px" && s2.sellW === "0px", s2.buyW + " / " + s2.sellW);
    ok(
      "값이 없으면 is-unknown 이 켜진다",
      s2.bar.indexOf("is-unknown") !== -1 && s2.label.indexOf("is-unknown") !== -1,
      s2.bar + " | " + s2.label
    );
    win2.App.MarketWarPowerBar.stop();
    win2.close();

    /* 압력 바 모듈이 아예 없어도 터지지 않고 '모름' 이어야 합니다. */
    const dom3 = new JSDOM(read("index.html"), {
      runScripts: "outside-only",
      pretendToBeVisual: true,
      url: "https://example.test/",
    });
    dom3.window.eval("window.App = window.App || {};");
    dom3.window.eval(read(JS_REL));
    let 안터짐 = true;
    try {
      dom3.window.App.MarketWarPowerBar.init();
    } catch (e) {
      안터짐 = false;
    }
    ok("압력 바 모듈이 없어도 안 터진다", 안터짐);
    ok(
      "그때도 50 이 아니라 모름이다",
      dom3.window.document.getElementById("mw-buy-pct").textContent === "—",
      dom3.window.document.getElementById("mw-buy-pct").textContent
    );
    dom3.window.App.MarketWarPowerBar.stop();
    dom3.window.close();
  }

  /* =====================================================================
   * [6] ★되돌이가 안 난다★
   *     js/market-war.js 의 updatePowerBarDom() 이 하는 짓을 그대로 흉내내서
   *     같은 DOM 을 덮어봅니다. 우리 관찰기가 되덮되 ★1회로 끝나야★ 합니다.
   * =================================================================== */
  section("[6] MutationObserver 되돌이가 안 난다");
  {
    const win = boot(() => ({ buyPct: 70, sellPct: 30 }));
    const d = win.document;
    const c0 = win.App.MarketWarPowerBar.getCounters();

    /* 원본이 강도로 덮는 그 코드와 같은 모양 */
    d.getElementById("mw-power-buy").style.width = "49.469%";
    d.getElementById("mw-power-sell").style.width = "50.531%";
    d.getElementById("mw-buy-pct").textContent = "98%";
    d.getElementById("mw-sell-pct").textContent = "100%";

    await 잠깐();
    await 잠깐();

    const c1 = win.App.MarketWarPowerBar.getCounters();
    const s = 상태(win);

    ok("원본이 덮은 값을 되돌려 놓는다", s.buyW === "70%" && s.buy === "70%", s.buyW + " / " + s.buy);
    ok(
      "관찰기 콜백이 1~2회로 끝난다 (되돌이 아님)",
      c1.observerHits - c0.observerHits >= 1 && c1.observerHits - c0.observerHits <= 2,
      String(c1.observerHits - c0.observerHits) + "회"
    );
    ok("되덮기도 1회로 끝난다", c1.rewrites - c0.rewrites === 1, String(c1.rewrites - c0.rewrites) + "회");

    /* 아무도 안 건드리면 아무 일도 안 일어나야 합니다(멱등). */
    const c2 = win.App.MarketWarPowerBar.getCounters();
    await 잠깐();
    await 잠깐();
    const c3 = win.App.MarketWarPowerBar.getCounters();
    ok("가만히 두면 관찰기가 더 안 불린다", c3.observerHits === c2.observerHits, c2.observerHits + " → " + c3.observerHits);

    win.App.MarketWarPowerBar.stop();
    win.close();
  }

  /* =====================================================================
   * [7] 파일이 실려 있고 git 에도 있다
   *     (디스크엔 있는데 git 엔 없는 조용한 고장을 막습니다 — CLAUDE.md)
   * =================================================================== */
  section("[7] index.html 이 부르고 git 에도 있다");
  {
    const html = read("index.html");
    ok("js 파일이 디스크에 있다", fs.existsSync(path.join(REPO, JS_REL)));
    ok("index.html 이 script 로 부른다", html.indexOf(JS_REL) !== -1, "안 부르면 있으나 마나입니다");

    const iOpb = html.indexOf('src="' + OPB_REL + '"');
    const iThis = html.indexOf('src="' + JS_REL + '"');
    ok(
      "order-pressure-bar.js 뒤에 실린다 (그 계산을 쓰기 때문)",
      iOpb !== -1 && iThis !== -1 && iOpb < iThis,
      "opb=" + iOpb + " this=" + iThis
    );

    /* ★git 에 등록됐는지는 여기서 검사하지 않습니다.★
       tests/html-assets-tracked.test.js 가 index.html 이 부르는 js 를 전부
       git ls-files 로 이미 검사합니다. 여기서 또 하면 두 벌이 되고,
       무엇보다 "커밋 전에는 반드시 실패하는 검사" 가 되어 npm test 가
       늘 빨갛게 됩니다(수리팀은 git add 를 하지 않습니다). */
    console.log("  · git 등록 검사는 tests/html-assets-tracked.test.js 담당입니다");
  }

  /* =====================================================================
   * [8] main.js 부팅 목록
   * =================================================================== */
  section("[8] main.js 가 init() 을 부른다");
  {
    const MAIN = read("main.js");
    const iOpb = MAIN.indexOf('"OrderPressureBar"');
    const iThis = MAIN.indexOf('"MarketWarPowerBar"');
    ok("부팅 목록에 MarketWarPowerBar 가 있다", iThis !== -1, "없으면 init() 이 안 불려서 아무 일도 안 일어납니다");
    ok("OrderPressureBar 보다 뒤다", iOpb !== -1 && iThis !== -1 && iOpb < iThis, "opb=" + iOpb + " this=" + iThis);
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패 목록:");
    failed.forEach((f) => console.log("  - " + f));
    console.log("실패 있음");
    process.exit(1);
  }
  console.log("전부 통과");
  process.exit(0);
}

main();
