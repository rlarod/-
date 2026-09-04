/* ===========================================================================
 * tests/chart-settings-goto-order-bar-floor.test.js
 * ===========================================================================
 * 지표 설정판 · 날짜 창이 폰 하단 주문막대 밑으로 내려가면 안 된다
 *
 * 2026-09-03 수리 봉인 — 수리팀.
 *
 * ── 무엇이 고장났었나 (둘 다 ★돈이 오가는 자리★) ─────────────────────
 *
 *   ① P1  js/chart-indicator-settings.js  place()
 *      아래쪽을 ★window.innerHeight★ 로만 봤습니다. 폰에는 그 위에 하단
 *      매수/매도 바(.tl-order-bar)가 겹쳐 떠 있고 z-index 가 990,
 *      설정판은 960 이라 ★판이 바 밑에 깔립니다★.
 *      깔린 것이 하필 ★단추줄(기본값·취소·확인) 세 개 전부★ 였습니다.
 *
 *      수리 전 실측 (localhost · 로그인 없이 재현)
 *          360x640  바 윗변 567 · 판 226~632 · 단추 577~619 · ★겹침 52px★
 *          375x667  바 윗변 594 · 단추 577~619 · ★겹침 52px★
 *          390x844  바 윗변 771 · ★겹침 52px★
 *          768 / 1440 / 1920  바가 display:none → 겹침 0 (정상)
 *      ★document.elementFromPoint("확인" 한가운데) 가
 *        tl-order-bar-btn tl-order-bar-short 를 돌려줬습니다.★
 *      회원은 "확인을 눌렀다" 고 믿는데 ★매도/숏 주문창★ 이 열립니다.
 *      오류 0건 · 화면 안 깨짐 → CLAUDE.md 가 말하는 ★조용한 고장★ 이고,
 *      돈이 오가는 자리라 P1 입니다. 24개 단추 중 15개가 가려져 있었습니다.
 *      판 안쪽 스크롤로도 못 꺼냅니다 — 단추줄은 flex 바닥 고정입니다.
 *
 *   ② P3  js/chart-goto-date.js  clampPanel()
 *      같은 원인. 세로 화면은 멀쩡하고 ★폰을 눕혔을 때★ 납니다.
 *          640x360  바 윗변 287 · 창 110~356 · ★겹침 69px★ → "이동" 자리에 매수/롱
 *          667x375  바 윗변 302 · 창 117~364 · ★겹침 62px★ → "이동" 자리에 매도/숏
 *      ⚠️ 원인이 처음 본 것과 달랐습니다. "창이 너무 커서" 가 아니라
 *         ★기준으로 삼은 버튼 자체가 바보다 아래★ 였습니다
 *         (640x360 에서 버튼 윗변 362 인데 화면이 360 입니다).
 *         그래서 "버튼 위에 놓으면 된다" 가 성립하지 않습니다.
 *
 * ── 무엇을 못 박나 ────────────────────────────────────────────────────
 *   [0] ★흉내가 진짜와 같은 답을 내는가★ — 수리 전·후 소스로 브라우저 실측 재현
 *       흉내가 틀리면 이 봉인 전체가 헛것입니다. 그래서 제일 먼저 봅니다
 *   [1] 설정판이 짧은 화면 셋에서 바닥을 안 넘는가
 *   [2] 설정판이 ★키도 같이 줄이는가★ — 자리만 밀고 maxHeight 를 그대로 두면
 *       판이 안 밀리고 안쪽만 잘립니다 (chart-timezone.js 가 빠졌던 함정)
 *   [3] 날짜 창이 ★눕힌 화면★ 에서 바닥을 안 넘는가
 *   [4] 날짜 창이 위로도 아래로도 안 들어가면 ★줄이고 스크롤★ 시키는가
 *   [5] 바가 없으면(넓은 화면 · display:none · 전체화면) ★전과 똑같이★ 둔다
 *   [6] 글씨를 줄여서 해결하지 않았다 — font-size 는 그대로여야 한다
 *   [7] 돌연변이 자체검증 — 바닥을 vh 로 되돌리면 [1] · [3] 이 진짜 터지는가
 *
 * ── 어떻게 재나 ───────────────────────────────────────────────────────
 *   jsdom 은 화면을 안 그려서 rect 가 전부 0 입니다. 그래서 원본에서
 *   floorY · place · clampPanel 을 ★글자 그대로 떼어★ vm 에서 돌리고,
 *   자리는 CSS 규칙을 그대로 계산해 냅니다.
 *     설정판   position:fixed  → style.top 이 그대로 화면 좌표
 *     날짜 창  position:absolute · bottom:calc(100% + Npx)
 *              → 창 아래끝 = 버튼 윗변 − N   (100% = 감싼 span = 버튼)
 *                 top:calc(100% + Npx) 면 창 윗끝 = 버튼 아래끝 + N
 *   키는 maxHeight 가 걸리면 그만큼 줄어드는 것으로 봅니다(브라우저와 같음).
 *
 *   ⚠️ 값을 손으로 안 적습니다 — ★원본에서 떼어 씁니다.★
 *      저쪽 여백이 8 → 12 로 바뀌면 이 파일이 먼저 빨개져 사람이 다시 재게 됩니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 *   tests/_order.txt 에서 이 파일 줄을 지우고 이 파일을 지웁니다.
 *
 * 이 파일은 서버도 브라우저도 부르지 않습니다. 소스 글자만 읽어 vm 에서 돌립니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ⚠️ tests/repo-env-honored.test.js 가 이 모양을 강제합니다 */
const REPO = process.env.REPO || path.resolve(__dirname, "..");
function 읽기(p) {
  return fs.readFileSync(path.join(REPO, p), "utf8");
}

let pass = 0, fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else { fail++; 실패목록.push(제목); console.log("  X " + 제목 + (도움말 ? " -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

const 글씨단위 = require("./_font-size.js");

const SET_FILE = "js/chart-indicator-settings.js";
const GD_FILE = "js/chart-goto-date.js";
const SET_SRC = 읽기(SET_FILE);
const GD_SRC = 읽기(GD_FILE);

/* ---------------------------------------------------------------------
 * 원본에서 함수를 ★글자 그대로★ 떼어 냅니다.
 * 중괄호 짝을 세서 자릅니다 — 정규식으로 끝을 찾으면 안쪽 } 에서 끊깁니다.
 * ------------------------------------------------------------------- */
function 함수떼기(src, 이름) {
  const 시작 = src.indexOf("function " + 이름 + "(");
  if (시작 < 0) return null;
  let i = src.indexOf("{", 시작);
  if (i < 0) return null;
  let 깊이 = 0;
  for (let k = i; k < src.length; k++) {
    const c = src[k];
    if (c === "{") 깊이++;
    else if (c === "}") {
      깊이--;
      if (깊이 === 0) return src.slice(시작, k + 1);
    }
  }
  return null;
}

const SET_floorY = 함수떼기(SET_SRC, "floorY");
const SET_place = 함수떼기(SET_SRC, "place");
const GD_floorY = 함수떼기(GD_SRC, "floorY");
const GD_clamp = 함수떼기(GD_SRC, "clampPanel");

/* ---------------------------------------------------------------------
 * 가짜 화면 — 필요한 것만 만듭니다
 * ------------------------------------------------------------------- */
function 상자(h) {
  const st = {};
  return {
    style: st,
    _자연키: h,
    get offsetWidth() { return 300; },
    get offsetHeight() {
      const mh = parseFloat(st.maxHeight);
      return isFinite(mh) ? Math.min(this._자연키, mh) : this._자연키;
    }
  };
}
function 사각(t, b, w) {
  return { top: t, bottom: b, left: 0, right: w || 300, width: w || 300, height: b - t };
}

/** 설정판 place() 를 돌려 판의 화면 좌표를 돌려줍니다 */
function 설정판(옵션, 소스floorY, 소스place) {
  const box = 상자(옵션.판키);
  const anchor = { getBoundingClientRect: () => 사각(옵션.앵커윗변, 옵션.앵커윗변 + 32) };
  const bar = 옵션.바윗변 === null ? null : {
    getBoundingClientRect: () => 사각(옵션.바윗변, 옵션.바윗변 + 72, 옵션.vw)
  };
  const sb = {
    window: {
      innerWidth: 옵션.vw, innerHeight: 옵션.vh,
      getComputedStyle: () => ({ display: 옵션.바display || "flex" })
    },
    document: {
      documentElement: { clientWidth: 옵션.vw, clientHeight: 옵션.vh },
      fullscreenElement: 옵션.전체화면 ? {} : null,
      webkitFullscreenElement: null,
      querySelector: (s) => (s === ".tl-order-bar" ? bar : null)
    },
    Math: Math, parseFloat: parseFloat, isFinite: isFinite
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(소스floorY + "\n" + 소스place + "\nplace(__box, __anchor);",
    Object.assign(sb, { __box: box, __anchor: anchor }),
    { filename: "떼어낸-place.js" });
  const top = parseFloat(box.style.top);
  return { top: top, bottom: top + box.offsetHeight, 키: box.offsetHeight, maxH: box.style.maxHeight };
}

/** 날짜 창 clampPanel() 을 돌려 창의 화면 좌표를 돌려줍니다 */
function 날짜창(옵션, 소스floorY, 소스clamp) {
  const st = {};
  const 키 = () => {
    const mh = parseFloat(st.maxHeight);
    return isFinite(mh) ? Math.min(옵션.창키, mh) : 옵션.창키;
  };
  /* CSS 를 그대로 계산합니다 (position:absolute, 100% = 감싼 span = 버튼) */
  function 자리() {
    const N = (v) => {
      const m = /calc\(100% \+ (-?[\d.]+)px\)/.exec(v || "");
      return m ? parseFloat(m[1]) : null;
    };
    const t = N(st.top), b = N(st.bottom);
    if (t !== null) { const top = 옵션.버튼아래 + t; return { top: top, bottom: top + 키() }; }
    const n = b === null ? 6 : b; /* 인라인이 비면 CSS 기본 calc(100% + 6px) */
    const bottom = 옵션.버튼위 - n;
    return { top: bottom - 키(), bottom: bottom };
  }
  const panel = { style: st, getBoundingClientRect: () => { const r = 자리(); return 사각(r.top, r.bottom); } };
  const btn = { getBoundingClientRect: () => 사각(옵션.버튼위, 옵션.버튼아래) };
  const bar = 옵션.바윗변 === null ? null : {
    getBoundingClientRect: () => 사각(옵션.바윗변, 옵션.바윗변 + 72, 옵션.vw)
  };
  const sb = {
    window: {
      innerWidth: 옵션.vw, innerHeight: 옵션.vh,
      getComputedStyle: () => ({ display: 옵션.바display || "flex" })
    },
    document: {
      documentElement: { clientWidth: 옵션.vw, clientHeight: 옵션.vh },
      fullscreenElement: 옵션.전체화면 ? {} : null,
      webkitFullscreenElement: null,
      querySelector: (s) => (s === ".tl-order-bar" ? bar : null)
    },
    Math: Math, parseFloat: parseFloat, isFinite: isFinite,
    panel: panel, btn: btn, isOpen: () => true
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(소스floorY + "\n" + 소스clamp + "\nclampPanel();", sb,
    { filename: "떼어낸-clampPanel.js" });
  const r = 자리();
  return { top: r.top, bottom: r.bottom, 키: 키(), maxH: st.maxHeight, of: st.overflowY };
}

console.log("==========================================================");
console.log(" 지표 설정판 · 날짜 창 — 하단 주문막대 바닥 봉인");
console.log("==========================================================");

절("[0] ★흉내가 진짜와 같은 답을 내는가★ — 브라우저 실측 재현");
{
  ok("원본에서 " + SET_FILE + " 의 floorY · place 를 떼어냈다", !!(SET_floorY && SET_place),
    "함수 이름이 바뀌었습니다");
  ok("원본에서 " + GD_FILE + " 의 floorY · clampPanel 을 떼어냈다", !!(GD_floorY && GD_clamp),
    "함수 이름이 바뀌었습니다");

  if (SET_floorY && SET_place) {
    /* 실측 390x844 · macd — 앵커 윗변 430 · 판 자연키 406 · 바 윗변 771
       브라우저가 낸 답: 판 357~763 · maxHeight 755px */
    const a = 설정판({ vw: 390, vh: 844, 판키: 406, 앵커윗변: 430, 바윗변: 771 }, SET_floorY, SET_place);
    ok("설정판 390x844 재현 — 판 357~763 · maxHeight 755px (지금 " +
      a.top + "~" + a.bottom + " · " + a.maxH + ")",
      a.top === 357 && a.bottom === 763 && a.maxH === "755px",
      "흉내가 브라우저와 다릅니다 — 이 봉인 전체가 헛것이 됩니다");

    /* 수리 전 소스로 돌리면 실측 그대로 나와야 합니다 (360x640 · bb-20)
       옛 place: maxHeight = vh - 16, 바닥 = vh - 8 → 판 226~632 */
    const 옛place =
      "function place(box, anchor){var m=8;var vw=window.innerWidth;var vh=window.innerHeight;" +
      "box.style.maxHeight=vh-m*2+'px';var w=box.offsetWidth||400;var h=box.offsetHeight||400;" +
      "var left,top;var r=anchor.getBoundingClientRect();left=r.left+r.width/2-w/2;top=r.top;" +
      "if(left+w>vw-m)left=vw-m-w;if(left<m)left=m;" +
      "if(top+h>vh-m)top=vh-m-h;if(top<m)top=m;" +
      "box.style.left=Math.round(left)+'px';box.style.top=Math.round(top)+'px';}";
    const b = 설정판({ vw: 360, vh: 640, 판키: 406, 앵커윗변: 254, 바윗변: 567 },
      "function floorY(m){return 0;}", 옛place);
    ok("★수리 전★ 소스로 돌리면 실측 그대로 판 226~632 가 나온다 (지금 " +
      b.top + "~" + b.bottom + ")",
      b.top === 226 && b.bottom === 632,
      "옛 동작 재현이 안 됩니다 — 무엇을 고쳤는지 증명할 수 없습니다");
    ok("★수리 전★ 은 바(567)를 " + (b.bottom - 567) + "px 넘었다 (실측 단추 겹침 52px 과 같은 원인)",
      b.bottom - 567 === 65);
  }

  if (GD_floorY && GD_clamp) {
    /* 실측 640x360 — 버튼 362~394 · 창 자연키 246 · 바 윗변 287
       브라우저가 낸 답: 창 33~279 */
    const a = 날짜창({ vw: 640, vh: 360, 창키: 246, 버튼위: 362, 버튼아래: 394, 바윗변: 287 },
      GD_floorY, GD_clamp);
    ok("날짜 창 640x360 재현 — 창 33~279 (지금 " + a.top + "~" + a.bottom + ")",
      a.top === 33 && a.bottom === 279,
      "흉내가 브라우저와 다릅니다");

    /* 수리 전 clampPanel — 아래로 뒤집는 조건만 있고 바를 모릅니다 → 창 110~356 */
    const 옛clamp =
      "function clampPanel(){if(!isOpen())return;" +
      "var vh=document.documentElement.clientHeight;var br=btn.getBoundingClientRect();" +
      "var r2=panel.getBoundingClientRect();" +
      "if(r2.top<8&&br.bottom+r2.height+6<=vh-8){panel.style.bottom='auto';" +
      "panel.style.top='calc(100% + 6px)';}}";
    const b = 날짜창({ vw: 640, vh: 360, 창키: 246, 버튼위: 362, 버튼아래: 394, 바윗변: 287 },
      "function floorY(m){return 0;}", 옛clamp);
    ok("★수리 전★ 소스로 돌리면 실측 그대로 창 110~356 이 나온다 (지금 " +
      b.top + "~" + b.bottom + ")",
      b.top === 110 && b.bottom === 356,
      "옛 동작 재현이 안 됩니다");
    ok("★수리 전★ 은 바(287)를 " + (b.bottom - 287) + "px 넘었다 (실측 겹침 69px)",
      b.bottom - 287 === 69);
  }
}

/* 원본에서 여백을 읽습니다 — 숫자를 손으로 안 적습니다 */
const 여백 = (function () {
  const m = /function place\(box, anchor\) \{\s*var m = (\d+);/.exec(SET_SRC);
  return m ? Number(m[1]) : null;
})();

절("[1] 설정판이 짧은 화면에서 바닥을 안 넘는가");
{
  ok("원본에서 여백을 읽었다 (m=" + 여백 + ")", 여백 !== null, "place() 모양이 바뀌었습니다");
  const 폰 = [
    { vw: 360, vh: 640, 바윗변: 567 },
    { vw: 375, vh: 667, 바윗변: 594 },
    { vw: 390, vh: 844, 바윗변: 771 }
  ];
  폰.forEach((v) => {
    /* 앵커를 화면 아래쪽까지 훑어 ★한 자리라도★ 넘는 곳이 없는지 봅니다 */
    let 최악 = -1e9, 최악앵커 = null, 위잘림 = -1e9;
    for (let a = 0; a <= v.vh; a += 10) {
      const r = 설정판({ vw: v.vw, vh: v.vh, 판키: 406, 앵커윗변: a, 바윗변: v.바윗변 },
        SET_floorY, SET_place);
      const over = r.bottom - v.바윗변;
      if (over > 최악) { 최악 = over; 최악앵커 = a; }
      위잘림 = Math.max(위잘림, 0 - r.top);
    }
    ok(v.vw + "x" + v.vh + " — 앵커를 " + 0 + "~" + v.vh + " 로 훑어도 바(" + v.바윗변 +
      ")를 안 넘는다 (최악 " + 최악 + "px @앵커 " + 최악앵커 + ")",
      최악 <= -여백, "바를 " + 최악 + "px 넘습니다");
    ok(v.vw + "x" + v.vh + " — 위로도 안 잘린다 (최악 " + 위잘림 + "px)",
      위잘림 <= -여백, "화면 위로 " + 위잘림 + "px 잘립니다");
  });
}

절("[2] ★설정판이 키도 같이 줄이는가★ — 자리만 밀면 안쪽이 잘립니다");
{
  /* 바가 있으면 maxHeight 가 「바닥 − 여백」 이어야 합니다 */
  const r = 설정판({ vw: 360, vh: 640, 판키: 900, 앵커윗변: 300, 바윗변: 567 }, SET_floorY, SET_place);
  const 기대 = 567 - 여백 - 여백;
  ok("바가 있으면 maxHeight 가 바닥에 맞춰 줄어든다 (기대 " + 기대 + "px · 지금 " + r.maxH + ")",
    r.maxH === 기대 + "px",
    "maxHeight 를 안 줄이면 판이 안 밀리고 안쪽만 잘립니다");
  ok("키가 큰 판도 바를 안 넘는다 (아래끝 " + r.bottom + " ≤ " + (567 - 여백) + ")",
    r.bottom <= 567 - 여백);
  ok("키가 큰 판도 위로 안 잘린다 (윗변 " + r.top + " ≥ " + 여백 + ")", r.top >= 여백);
}

절("[3] 날짜 창이 눕힌 화면에서 바닥을 안 넘는가");
{
  const 가로 = [
    { vw: 640, vh: 360, 바윗변: 287, 버튼위: 362 },
    { vw: 667, vh: 375, 바윗변: 302, 버튼위: 377 }
  ];
  가로.forEach((v) => {
    const r = 날짜창({ vw: v.vw, vh: v.vh, 창키: 246, 버튼위: v.버튼위, 버튼아래: v.버튼위 + 32, 바윗변: v.바윗변 },
      GD_floorY, GD_clamp);
    ok(v.vw + "x" + v.vh + " — 창이 바(" + v.바윗변 + ")를 안 넘는다 (아래끝 " + r.bottom + ")",
      r.bottom <= v.바윗변 - 8, "바를 " + (r.bottom - v.바윗변) + "px 넘습니다");
    ok(v.vw + "x" + v.vh + " — 창이 위로 안 잘린다 (윗변 " + r.top + ")",
      r.top >= 8, "화면 위로 " + (0 - r.top) + "px 잘립니다");
  });
}

절("[4] ★위로도 아래로도 안 들어가면 줄이고 스크롤시키는가★");
{
  /* 아주 짧은 화면 — 창(246)이 위에도 아래에도 통째로는 안 들어갑니다 */
  const r = 날짜창({ vw: 640, vh: 300, 창키: 246, 버튼위: 200, 버튼아래: 232, 바윗변: 230 },
    GD_floorY, GD_clamp);
  ok("둘 다 모자라면 maxHeight 를 준다 (지금 " + (r.maxH || "없음") + ")",
    !!r.maxH && parseFloat(r.maxH) > 0,
    "★잘린 채 그냥 남습니다★ — 이게 고치기 전의 갈래였습니다");
  ok("그때 창 안에서 스크롤되게 한다 (overflow-y=" + (r.of || "없음") + ")",
    r.of === "auto", "스크롤이 안 생기면 밑에 깔린 부분을 손으로 못 꺼냅니다");
  ok("줄인 뒤에도 바(230)를 안 넘는다 (아래끝 " + r.bottom + ")", r.bottom <= 230 - 8);
  ok("줄인 뒤에도 위로 안 잘린다 (윗변 " + r.top + ")", r.top >= 8);
}

절("[5] ★바가 없으면 전과 똑같이 둔다★ (넓은 화면 · display:none · 전체화면)");
{
  /* 바가 아예 없을 때 = 옛 계산과 같아야 합니다: maxHeight = vh - 2m */
  const 경우 = [
    { 이름: "바 자체가 없다", opt: { 바윗변: null } },
    { 이름: "바가 display:none", opt: { 바윗변: 500, 바display: "none" } },
    { 이름: "전체화면", opt: { 바윗변: 500, 전체화면: true } }
  ];
  경우.forEach((c) => {
    const r = 설정판(Object.assign({ vw: 1440, vh: 900, 판키: 406, 앵커윗변: 500 }, c.opt),
      SET_floorY, SET_place);
    ok("설정판 — " + c.이름 + " 이면 maxHeight 가 vh-" + (여백 * 2) + " 그대로다 (" + r.maxH + ")",
      r.maxH === (900 - 여백 * 2) + "px",
      "넓은 화면 동작이 달라졌습니다 — 회귀입니다");
  });
  경우.forEach((c) => {
    const r = 날짜창(Object.assign({ vw: 1440, vh: 900, 창키: 246, 버튼위: 700, 버튼아래: 732 }, c.opt),
      GD_floorY, GD_clamp);
    ok("날짜 창 — " + c.이름 + " 이면 버튼 위 기본 자리 그대로다 (아래끝 " + r.bottom + " = 700-6)",
      r.bottom === 694 && !r.maxH,
      "넓은 화면 동작이 달라졌습니다 — 회귀입니다");
  });
}

절("[6] 글씨를 줄여서 해결하지 않았는가");
{
  /* 푸는 순서는 ① 자리 ② 키 줄이고 스크롤 … ★글씨는 최후★ 입니다.
     이 두 파일의 font-size 는 전부 17px 이상이어야 합니다. */
  [[SET_FILE, SET_SRC], [GD_FILE, GD_SRC]].forEach(([f, src]) => {
    const 값 = (src.match(/font-size:\s*(\d+(?:\.\d+)?)px/g) || [])
      .map((s) => Number(/(\d+(?:\.\d+)?)/.exec(s)[1]));
    const 작음 = 값.filter((v) => v < 17);
    ok(f.replace("js/", "") + " 에 17px 미만 글씨가 없다 (" + 값.length + "곳 확인)",
      작음.length === 0, "작은 값: " + 작음.join(",") + "px — 글씨로 때우지 마세요");
  });
}

절("[7] 돌연변이 자체검증 — 바닥을 vh 로 되돌리면 진짜 터지는가");
{
  const 가짜floorY = "function floorY(m){return (window.innerHeight||0)-m;}";

  const a = 설정판({ vw: 360, vh: 640, 판키: 406, 앵커윗변: 254, 바윗변: 567 }, 가짜floorY, SET_place);
  ok("설정판 — 바닥이 바를 잊으면 [1] 이 빨개진다 (아래끝 " + a.bottom + " > " + (567 - 여백) + ")",
    a.bottom > 567 - 여백,
    "안 잡혔습니다 — [1] 이 헛돕니다");

  const b = 날짜창({ vw: 640, vh: 360, 창키: 246, 버튼위: 362, 버튼아래: 394, 바윗변: 287 },
    가짜floorY, GD_clamp);
  ok("날짜 창 — 바닥이 바를 잊으면 [3] 이 빨개진다 (아래끝 " + b.bottom + " > " + (287 - 8) + ")",
    b.bottom > 287 - 8,
    "안 잡혔습니다 — [3] 이 헛돕니다");

  /* 키 줄이기를 빼면 [2] 가 터지는가 */
  const 키안줄임 = SET_place.replace(/box\.style\.maxHeight = [^;]+;/,
    "box.style.maxHeight = (window.innerHeight - m * 2) + 'px';");
  ok("설정판 place() 에서 maxHeight 줄을 실제로 찾아 바꿨다", 키안줄임 !== SET_place,
    "모양이 바뀌어 돌연변이를 못 만들었습니다");
  const c = 설정판({ vw: 360, vh: 640, 판키: 900, 앵커윗변: 300, 바윗변: 567 }, SET_floorY, 키안줄임);
  ok("키를 안 줄이면 [2] 가 빨개진다 (maxHeight " + c.maxH + " ≠ " + (567 - 여백 * 2) + "px)",
    c.maxH !== (567 - 여백 * 2) + "px");

  ok("함수 이름이 없으면 null 이 나온다 (조용히 통과하지 않는다)",
    함수떼기("function 다른것(){}", "floorY") === null);
}

절("[8] 실행 목록 등록");
{
  const order = 읽기("tests/_order.txt");
  ok("tests/_order.txt 에 있다",
    order.indexOf("tests/chart-settings-goto-order-bar-floor.test.js") !== -1,
    "빠지면 npm test 가 이 파일을 안 돌립니다");
}


/* ===================================================================== */
절("[9] ★px 말고 다른 단위로 우회하지 않았는가★");
{
/* ⚠️ 2026-09-04 기록팀 — ★이 파일의 글씨 검사들이 px 라고 적힌 것만 셌습니다.★
     1.0625rem(=17px) · 1em · 120% · 13pt · 4vw · calc() · clamp() 로 적으면
     바닥값 검사를 통째로 빠져나갑니다. 대표가 글씨 크기로 네 번 지적하신 자리입니다.

     ★실측 (2026-09-04, 사본에서 · 진짜 파일은 안 건드렸습니다)★
       js/chart-indicator-kit.js 사본의 .tl-kit-btn 맨 앞에
           font-size:clamp(11px, 2vw, 17px)   ← 360 에서는 11px 로 그려집니다
       를 끼웠더니, 옛 검사는 ★옆 규칙의 17px 을 대신 읽어★ "17px" 이라 보고하고
       그대로 초록이었습니다. 0.6875rem(=11px) 도 똑같이 17 로 읽혔습니다.
       17px 미만 개수 검사도 원본 0 · clamp 사본 0 · rem 사본 0 으로 같았습니다.

     ★환산이 아니라 "px 로만 적어라" 로 못 박은 이유★ — rem·em·%·vw·ch·clamp 는
     화면·부모·글꼴·회원 브라우저 설정에 따라 달라져 정적으로 px 을 못 냅니다.
     우리 규칙은 ★가장 좁은 360 에서도 17px★ 이라, 좁아지면 작아지는 표기는
     애초에 쓰면 안 되는 것입니다. 자세한 근거는 tests/_font-size.js 머리말.

     판정은 tests/_font-size.js 한 곳에만 있습니다. 아래 자체검증 줄을 같이 두어,
     그 한 곳을 헐겁게 고쳐 봉인 9개를 한꺼번에 눈멀게 하는 것을 막습니다. */
  const 검 = 글씨단위.자체검증();
  ok("단위 판정기가 표본 " + 검.표본수 + "개를 다 맞춘다 (tests/_font-size.js)",
    검.전부통과, 검.설명);

  /* ⚠️ .tl-cfg-chip 의 font-size:0 은 봐줍니다 — 26x26 색 네모의 글자를 숨기는
     관용구라 회원이 읽는 글씨가 아니고, 0 은 어느 화면에서도 0 입니다.
     (판정 근거는 tests/_font-size.js 머리말 "봐주는 것은 딱 둘") */
  [[SET_FILE, SET_SRC], [GD_FILE, GD_SRC]].forEach(([f, src]) => {
    const 위반 = 글씨단위.단위위반(src);
    const 선언수 = 글씨단위.선언들(src).length;
    ok(f.replace("js/", "") + " 의 font-size 를 px 로만 적었다 (" + 선언수 + "곳 확인)",
      위반.length === 0, 글씨단위.요약(위반));
    ok(f.replace("js/", "") + " 에서 font-size 선언을 5개 이상 읽었다", 선언수 >= 5,
      선언수 + "개 — 검사가 헛도는지 봅니다");
  });
}

/* ===================================================================== */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것:");
  실패목록.forEach((s) => console.log("  · " + s));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
