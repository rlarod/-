/* tests/order-pressure-unknown.test.js
 * =========================================================================
 * 매수/매도 압력 바 — 체결이 없을 때 "가짜 50:50" 을 보이지 않는다
 * =========================================================================
 * 2026-08-28 / 수리팀
 *
 * 무슨 일이 있었나 (P1 — 조용한 고장)
 *   체결이 한 건도 안 올 때 글자만 "매수 —" 로 바뀌고 ★막대는 50%/50%★ 로
 *   남아 있었습니다. index.html 의 첫 마크업도 "매수 50%" / width:50% 였습니다.
 *   오류도 안 나고 화면도 멀쩡해서, 회원은 막대를 보고 ★진짜 반반★ 으로
 *   읽고 그걸 근거로 주문을 넣습니다.
 *
 *   체결이 실제로 비는 구간이 있습니다 (조사팀 30일치)
 *     가장 긴 연속 0건  나스닥 3분 · 삼성전자 7분 · SK하이닉스 2분
 *
 * 이 파일이 지키는 것
 *   [1] index.html 첫 화면이 가짜 50% 가 아니다
 *   [2] css/order-pressure-unknown.css 가 실제로 불려 있고 git 에 있다
 *       (안 실리면 아무 일도 안 일어납니다 — 그것도 조용한 고장입니다)
 *   [3] 체결 0건이면 is-unknown 이 켜지고 막대 폭이 0 이다
 *   [4] 체결이 들어오면 is-unknown 이 꺼지고 막대가 실제 비율로 찬다
 *   [5] ★계산식은 하나도 안 바뀌었다★ — 표시만 고친 것이 맞는지 확인합니다
 *
 * ⛔ 손익·랭킹 계산식은 검사하지 않습니다. 압력 바 표시만 봅니다.
 * ⚠ 사이트 코드는 한 글자도 고치지 않습니다. 읽어서 띄우기만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

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
function section(t) { console.log("\n" + t); }
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const CSS_REL = "css/order-pressure-unknown.css";
const JS_REL = "js/order-pressure-bar.js";

/* -------------------------------------------------------------------------
 * 실제 모듈을 그대로 띄웁니다 — 동작을 흉내내지 않습니다.
 * jsdom 은 <link> 를 받아오지 않으므로 css 파일 내용을 <style> 로 넣습니다.
 * ----------------------------------------------------------------------- */
function boot() {
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
  /* 이 시험에 필요한 것만 있는 아주 작은 Bus */
  win.eval(
    "App.Bus = (function(){var m={};return {" +
      "on:function(e,f){(m[e]=m[e]||[]).push(f);}," +
      "emit:function(e,p){(m[e]||[]).forEach(function(f){f(p);});}};})();"
  );
  win.eval("App.Config = { getActiveSymbol: function(){ return 'BTCUSDT'; } };");
  win.eval(read(JS_REL));
  return win;
}

function tick(win, qty, isTakerBuy) {
  win.App.Bus.emit("trade:tick", {
    symbol: "BTCUSDT",
    qty: qty,
    isBuyerMaker: !isTakerBuy,
    time: Date.now(),
  });
}

async function main() {
  /* =====================================================================
   * [1] 첫 화면 마크업 — 페이지를 열자마자 보이는 값
   * =================================================================== */
  section("[1] index.html 첫 마크업이 가짜 50% 가 아니다");
  {
    const doc = new JSDOM(read("index.html")).window.document;
    const box = doc.querySelector(".order-pressure-bar");
    const buy = doc.getElementById("order-pressure-buy");
    const sell = doc.getElementById("order-pressure-sell");
    const buyT = doc.getElementById("order-pressure-buy-text");
    const sellT = doc.getElementById("order-pressure-sell-text");

    ok("압력 바 마크업이 있다", !!box);
    ok("매수/매도 칸이 둘 다 있다 (지우지 않았다)", !!buy && !!sell);
    ok(
      "첫 화면부터 is-unknown 이 켜져 있다",
      !!box && box.classList.contains("is-unknown"),
      box ? 'class="' + box.className + '"' : "상자 없음"
    );

    const bw = buy ? buy.getAttribute("style") || "" : "";
    const sw = sell ? sell.getAttribute("style") || "" : "";
    ok("매수 막대 첫 폭이 50% 가 아니다", !/width\s*:\s*50%/.test(bw), 'style="' + bw + '"');
    ok("매도 막대 첫 폭이 50% 가 아니다", !/width\s*:\s*50%/.test(sw), 'style="' + sw + '"');
    ok(
      "매수 글자가 '매수 50%' 가 아니다",
      !!buyT && buyT.textContent.indexOf("50%") === -1,
      buyT ? buyT.textContent : "없음"
    );
    ok(
      "매도 글자가 '매도 50%' 가 아니다",
      !!sellT && sellT.textContent.indexOf("50%") === -1,
      sellT ? sellT.textContent : "없음"
    );
  }

  /* =====================================================================
   * [2] CSS 가 실제로 실려 있나 — 안 실리면 아무 일도 안 일어납니다
   * =================================================================== */
  section("[2] css/order-pressure-unknown.css 가 실제로 불리고 git 에 있다");
  {
    const html = read("index.html");
    ok("css 파일이 디스크에 있다", fs.existsSync(path.join(REPO, CSS_REL)));
    ok(
      "index.html 이 이 css 를 <link> 로 부른다",
      html.indexOf(CSS_REL) !== -1,
      "index.html 안에 " + CSS_REL + " 가 없습니다 — 있으나 마나가 됩니다"
    );

    /* 뒤에 오는 규칙이 이깁니다. style.css 보다 앞이면 안 먹습니다. */
    const iStyle = html.indexOf('href="style.css"');
    const iThis = html.indexOf(CSS_REL);
    ok(
      "style.css 보다 뒤에서 불린다 (뒤엣것이 이깁니다)",
      iStyle === -1 || (iThis !== -1 && iThis > iStyle),
      "style.css @" + iStyle + " / 이 파일 @" + iThis
    );

    /* 다른 PC 에서 빈 링크가 되지 않게 — fs.existsSync 로는 못 잡습니다 */
    let tracked = null;
    try {
      const out = execFileSync("git", ["ls-files", "-z", "--", CSS_REL], {
        cwd: REPO,
        encoding: "utf8",
      });
      tracked = out.split("\0").filter(Boolean).length > 0;
    } catch (e) {
      tracked = null;
    }
    if (tracked === null) {
      ok("git 추적 확인은 건너뜁니다 (git 을 못 불렀습니다)", true);
    } else {
      ok("css 가 git 에 추적된다 (라이브에서 404 가 되지 않게)", tracked,
        "git add " + CSS_REL + " 가 아직 안 됐습니다");
    }
  }

  /* =====================================================================
   * [3] 체결이 0건일 때
   * =================================================================== */
  section("[3] 체결 0건 — '모름' 이 눈에 보인다");
  {
    const win = boot();
    win.App.OrderPressureBar.init();

    const doc = win.document;
    const box = doc.querySelector(".order-pressure-bar");
    const buy = doc.getElementById("order-pressure-buy");
    const sell = doc.getElementById("order-pressure-sell");
    const track = doc.querySelector(".order-pressure-track");

    ok("is-unknown 이 켜진다", box.classList.contains("is-unknown"), "class=" + box.className);
    ok(
      "getRatio() 가 null 이다 (= 모름. 50 을 지어내지 않는다)",
      win.App.OrderPressureBar.getRatio() === null,
      JSON.stringify(win.App.OrderPressureBar.getRatio())
    );

    const bw = win.getComputedStyle(buy).width;
    const sw = win.getComputedStyle(sell).width;
    ok("매수 막대 폭이 0 이다 (50% 가 아니다)", bw === "0px", bw);
    ok("매도 막대 폭이 0 이다 (50% 가 아니다)", sw === "0px", sw);

    ok(
      "매수 글자가 '매수 —'",
      doc.getElementById("order-pressure-buy-text").textContent === "매수 —",
      doc.getElementById("order-pressure-buy-text").textContent
    );
    ok(
      "매도 글자가 '매도 —'",
      doc.getElementById("order-pressure-sell-text").textContent === "매도 —",
      doc.getElementById("order-pressure-sell-text").textContent
    );

    const bg = win.getComputedStyle(track).backgroundImage || "";
    ok(
      "회색 빗금이 깔린다 — '값이 없다' 가 보인다",
      bg.indexOf("repeating-linear-gradient") !== -1,
      bg.slice(0, 60) || "(없음)"
    );

    /* 글자색까지 회색이어야 합니다. '매수 —' 가 초록이면 매수가 이기는 것처럼 읽힙니다 */
    const buyTextColor = win.getComputedStyle(
      doc.querySelector(".order-pressure-bar.is-unknown .order-pressure-labels span")
    ).color;
    ok(
      "글자가 초록/빨강이 아니다 (회색 #838da4)",
      /838da4|131,\s*141,\s*164/.test(buyTextColor),
      buyTextColor
    );

    /* 기능을 지우지 않았는지 — 나중에 되살릴 수 있어야 합니다 */
    ok("매수/매도 칸이 DOM 에 그대로 남아 있다 (숨겼을 뿐 안 지웠다)", !!buy && !!sell);
  }

  /* =====================================================================
   * [4] 체결이 들어오면 원래대로 — 1초 타이머로 실제 확인
   * =================================================================== */
  section("[4] 체결이 들어오면 '모름' 이 풀리고 실제 비율로 찬다");
  {
    const win = boot();
    win.App.OrderPressureBar.init();
    const doc = win.document;
    const box = doc.querySelector(".order-pressure-bar");
    const buy = doc.getElementById("order-pressure-buy");
    const sell = doc.getElementById("order-pressure-sell");

    ok("(먼저) 체결 0건이라 is-unknown 이 켜져 있다", box.classList.contains("is-unknown"));

    /* 테이커 매수 3 / 테이커 매도 1  →  75% : 25% */
    tick(win, 3, true);
    tick(win, 1, false);

    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 1400)); // 모듈 주기 1000ms

    ok("체결이 들어온 뒤 is-unknown 이 꺼진다",
      !box.classList.contains("is-unknown"), "class=" + box.className);
    ok("매수 막대가 75% 로 찬다", buy.style.width === "75%", buy.style.width);
    ok("매도 막대가 25% 로 찬다", sell.style.width === "25%", sell.style.width);
    ok("매수 글자가 '매수 75%'",
      doc.getElementById("order-pressure-buy-text").textContent === "매수 75%",
      doc.getElementById("order-pressure-buy-text").textContent);
    ok("1초 주기 안에 되돌아왔다", Date.now() - t0 < 3000, Date.now() - t0 + "ms");

    const bg = win.getComputedStyle(doc.querySelector(".order-pressure-track")).backgroundImage || "";
    ok("빗금이 사라진다", bg.indexOf("repeating-linear-gradient") === -1, bg.slice(0, 60) || "(없음)");
  }

  /* =====================================================================
   * [5] 계산식은 하나도 안 바뀌었다 — 이번 건은 '표시만' 이어야 합니다
   * =================================================================== */
  section("[5] 계산식이 그대로다 (이번 수정은 표시만이어야 한다)");
  {
    const cases = [
      { buy: 3, sell: 1, want: 75 },
      { buy: 1, sell: 1, want: 50 },   // ★진짜 반반★ 은 그대로 50 이어야 합니다
      { buy: 1, sell: 3, want: 25 },
      { buy: 7, sell: 3, want: 70 },
      { buy: 1, sell: 0, want: 100 },
      { buy: 0, sell: 1, want: 0 },
    ];
    for (const c of cases) {
      const win = boot();
      win.App.OrderPressureBar.init();
      if (c.buy > 0) tick(win, c.buy, true);
      if (c.sell > 0) tick(win, c.sell, false);
      const r = win.App.OrderPressureBar.getRatio();
      ok(
        "매수 " + c.buy + " / 매도 " + c.sell + " → 매수 " + c.want + "%",
        !!r && r.buyPct === c.want && r.sellPct === 100 - c.want,
        JSON.stringify(r)
      );
    }

    /* 진짜 반반(1:1)일 때는 '모름' 이 아니어야 합니다 —
       '체결이 없음' 과 '반반' 을 구분하는 것이 이번 건의 핵심입니다 */
    const win = boot();
    win.App.OrderPressureBar.init();
    tick(win, 1, true);
    tick(win, 1, false);
    await new Promise((r) => setTimeout(r, 1400));
    const box = win.document.querySelector(".order-pressure-bar");
    ok(
      "★진짜 반반(1:1)은 '모름' 이 아니다★ — 둘을 구분한다",
      !box.classList.contains("is-unknown"),
      "class=" + box.className
    );
    ok("진짜 반반이면 막대가 50% 로 찬다",
      win.document.getElementById("order-pressure-buy").style.width === "50%",
      win.document.getElementById("order-pressure-buy").style.width);
  }

  /* =====================================================================
   * [6] 계산 함수 본문이 손대지 않은 그대로인지 (표시만 고쳤다는 증거)
   * =================================================================== */
  section("[6] computeRatio() 본문이 그대로다");
  {
    const src = read(JS_REL);
    ok("60초 창(WINDOW_MS = 60000)이 그대로다", /WINDOW_MS\s*=\s*60000/.test(src));
    ok("테이커 매수 판정(!p.isBuyerMaker)이 그대로다", /isBuy:\s*!p\.isBuyerMaker/.test(src));
    ok("total <= 0 이면 null 을 돌려준다 (50 을 지어내지 않는다)",
      /if\s*\(total\s*<=\s*0\)\s*return null;/.test(src));
    ok("반올림식(Math.round((buyQty / total) * 100))이 그대로다",
      /Math\.round\(\(buyQty\s*\/\s*total\)\s*\*\s*100\)/.test(src));
    /* 전쟁터 연출(js/market-war.js)은 별건이라 이번에 손대면 안 됩니다.
       주석에 이름이 나오는 것은 괜찮고, ★실제로 불러 쓰면★ 안 됩니다.
       (2026-08-21 TL-005 에서 이 값을 쓰다가 늘 50:50 이 나왔습니다) */
    const 블록주석 = new RegExp("/\\*[\\s\\S]*?\\*/", "g");
    const 줄주석 = new RegExp("^\\s*//.*$", "gm");
    const 코드만 = src.replace(블록주석, "").replace(줄주석, "");
    ok("전쟁터 강도값(getBuySellRatio)을 코드에서 다시 쓰지 않는다",
      코드만.indexOf("getBuySellRatio") === -1,
      "주석이 아니라 코드에서 getBuySellRatio 를 부르고 있습니다");
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("실패 목록:");
    failed.forEach((f) => console.log("  - " + f));
    console.log("실패 있음 ❌");
    process.exit(1);
  }
  console.log("전체 통과 ✅");
  process.exit(0); // jsdom 이 안 끝나서 명시적으로 끝냅니다
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
