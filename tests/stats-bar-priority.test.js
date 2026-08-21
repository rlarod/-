/* tests/stats-bar-priority.test.js
 * 시세 바 안전 항목 노출(js/stats-bar-priority.js) 검증.
 *
 * 왜 필요한가
 *   .stats-bar 는 한 줄 유지를 위해 overflow-x:auto 이고 스크롤바가 CSS 로
 *   숨겨져 있습니다. 그래서 뒤쪽 항목은 "옆에 더 있다"는 신호도 없이 잘려
 *   보입니다. 하필 맨 뒤가 마크가격(강제청산 판정 기준가)과 펀딩비(실제로
 *   잔고에서 빠지는 금액)였습니다 — js/chart.js(수정 금지)가 나중에
 *   appendChild 로 붙이기 때문입니다.
 *
 *   페이지 전체 가로 스크롤을 보는 기존 점검법으로는 이 유형이 잡히지
 *   않습니다(넘치는 내용이 컨테이너 안에 갇히므로). 그래서 여기서 따로
 *   지킵니다.
 *
 * ── 이 테스트가 한 번 놓쳤던 것 (2026-08-21) ─────────────────────
 *   예전 판은 스크롤 힌트의 상쇄값을 이렇게 검사했습니다.
 *
 *       const gap = Number((CSS.match(/\.stats-bar\{[\s\S]*?gap:(\d+)px/)||[])[1]);
 *
 *   CSS 에서 '처음 나오는' gap(16px) 하나만 읽습니다. 실제 gap 은
 *   기본 16px / ≤700px 20px / ≤400px 10px 로 구간마다 다른데, 미디어쿼리
 *   안을 보지 않으니 틀린 전제(gap 은 늘 16px)를 놓고 검사했고, 그래서
 *   360·375px 에서 마크가격이 가려지는데도 통과했습니다.
 *
 *   그래서 이 판은 두 가지를 바꿨습니다.
 *     (1) CSS 를 미디어쿼리까지 훑어 '그 폭에서 실제로 적용되는 값'을
 *         구합니다(아래 cssValue). 구간마다 다른 값을 다 봅니다.
 *     (2) 상쇄값 산수를 맞추는 대신, 여섯 폭에서 마크가격 오른쪽 끝이
 *         힌트 앞에서 끝나는지를 실제 좌표로 계산해 봅니다(아래 5번).
 *         예전 CSS 를 넣으면 360px 에서 +26px 로 떨어집니다 — 본부장
 *         실측치와 같습니다.
 *
 * 실측(2026-08-21, 수정 후 / Chrome, http://localhost:3000, 비로그인)
 *   폭    겹침px   마크가격
 *    360  -39.8   보임
 *    375  -54.8   보임
 *    390  -69.8   보임
 *    768  -393.7  보임
 *   1440  -1065.7 보임
 *   1920  -1093.7 보임
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \x1b[32m✓\x1b[0m " + name);
  } else {
    fail++;
    console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : ""));
  }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "stats-bar-priority.js"), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const HTML = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n시세 바 — 안전 항목이 화면 밖으로 밀리지 않는가");

/* =========================================================================
 * CSS 읽기 도구 — 미디어쿼리 안까지 봅니다.
 * 예전 판이 놓친 이유가 바로 이것(첫 번째 gap 만 읽음)이라 여기서 제대로
 * 만들어 씁니다. 완전한 CSS 엔진은 아니고, 이 파일에서 쓰는 만큼만 합니다.
 * ========================================================================= */

/* 주석을 먼저 걷어냅니다 — 주석 안에도 중괄호가 들어 있습니다
   (예: "끄는 스위치" 주석). 안 걷으면 규칙으로 잘못 읽습니다. */
const CSS_NC = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/* 소스 순서를 지킨 채 [평문 / @media 블록] 으로 자릅니다.
   maxW: 그 조각이 적용되는 최대 폭. Infinity = 늘 적용, null = 이 모델이
   다루지 않는 미디어(min-width, prefers-color-scheme 등). */
function cssSegments(css) {
  const segs = [];
  let plainStart = 0;
  let i = 0;
  for (;;) {
    const at = css.indexOf("@media", i);
    if (at < 0) {
      segs.push({ maxW: Infinity, cond: "", text: css.slice(plainStart) });
      break;
    }
    const open = css.indexOf("{", at);
    if (open < 0) { segs.push({ maxW: Infinity, cond: "", text: css.slice(plainStart) }); break; }
    let depth = 0, j = open;
    for (; j < css.length; j++) {
      if (css[j] === "{") depth++;
      else if (css[j] === "}") { depth--; if (depth === 0) break; }
    }
    const cond = css.slice(at + 6, open).trim();
    const mw = (cond.match(/max-width\s*:\s*(\d+)px/) || [])[1];
    segs.push({ maxW: Infinity, cond: "", text: css.slice(plainStart, at) });
    segs.push({ maxW: mw ? Number(mw) : null, cond: cond, text: css.slice(open + 1, j) });
    plainStart = j + 1;
    i = j + 1;
  }
  return segs;
}
const SEGS = cssSegments(CSS_NC);

/* 선택자 하나의 대략적인 특정도(클래스·의사클래스 개수). 이 파일이 다루는
   규칙은 모두 클래스 기반이라 이 정도면 순서가 맞습니다. */
function spec(sel) {
  return (sel.match(/\.[A-Za-z_-][\w-]*/g) || []).length +
         (sel.match(/:(?!:)[a-z-]+/g) || []).length;
}

/* selMatch(sel) 이 true 인 규칙들 중, 폭 vw 에서 적용되는 마지막·최고
   특정도의 prop 값을 돌려줍니다. */
function cssValue(selMatch, prop, vw) {
  let best = null; /* {spec, order, value} */
  let order = 0;
  const propRe = new RegExp("(?:^|[;{])\\s*" + prop + "\\s*:\\s*([^;}]+)");
  for (const s of SEGS) {
    if (s.maxW === null) continue;            /* 이 모델이 다루지 않는 미디어 */
    if (s.maxW !== Infinity && vw > s.maxW) continue;
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(s.text))) {
      order++;
      const body = m[2];
      const pm = body.match(propRe);
      if (!pm) continue;
      for (const sel of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
        if (!selMatch(sel)) continue;
        const sp = spec(sel);
        if (!best || sp > best.spec || (sp === best.spec && order >= best.order)) {
          best = { spec: sp, order: order, value: pm[1].trim() };
        }
      }
    }
  }
  return best ? best.value : null;
}
const px = (v) => (v == null ? null : Number(String(v).replace(/[^0-9.]/g, "")));

/* ---------------- 1) 연결 ---------------- */
{
  const tags = HTML.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);
  ok("index.html 에 연결돼 있다", at("js/stats-bar-priority.js") >= 0);
}

/* ---------------- 2) 수정 금지 파일 무관 ---------------- */
{
  /* 수정 금지 파일의 모듈을 가로채거나 덮어쓰지 않는지 봅니다.
     (주석에 파일명이 적히는 건 정상이라 코드 패턴으로 검사합니다.) */
  const NS = ["App.Trading", "App.UI", "App.Auth", "App.SupabaseSync", "App.Chat",
              "App.Leaderboard", "App.Admin", "App.Season", "App.Board",
              "App.Orderbook", "App.Chart", "App.WebSocket"];
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const touches = NS.filter((n) => code.indexOf(n) !== -1);
  ok("수정 금지 모듈을 가로채거나 덮어쓰지 않는다", touches.length === 0, touches.join(", "));
  ok("DOM 만 다룬다(전역 App 은 자기 것만 만든다)",
     (code.match(/App\.[A-Za-z]+\s*=/g) || []).join(",") === "App.StatsBarPriority =");
  ok("chart.js 가 만드는 id 로만 찾는다(코드 수정 아님)",
     SRC.indexOf("stat-mark-price") !== -1 && SRC.indexOf("stat-funding") !== -1);
}

/* ---------------- 3) 배치 순서 CSS ---------------- */
{
  ok("마크가격을 앞으로 당기는 order 가 있다", /\.tl-stat-order-1\{order:-2;\}/.test(CSS));
  ok("펀딩비를 앞으로 당기는 order 가 있다", /\.tl-stat-order-2\{order:-1;\}/.test(CSS));
  ok("가격 블록은 항상 맨 앞", /\.main-price-block\{order:-3;\}/.test(CSS));
}

/* ---------------- 4) 스크롤 힌트는 gap 에 기대지 않는다 ----------------
 * 힌트를 시세 바 '안'에 flex 항목으로 넣으면 항목 간격(gap)을 하나 더
 * 만들어서, 음수 margin 으로 "폭 + gap" 을 상쇄해야 합니다. 그 상쇄값은
 * 구간마다 gap 이 다르면 반드시 어긋납니다(이번 결함).
 * 그래서 힌트는 스크롤되지 않는 바깥 층에 겹쳐 그립니다.
 * ------------------------------------------------------------------- */
{
  /* 먼저, 이 파일의 CSS 읽기가 미디어쿼리 안을 실제로 보는지부터 확인합니다.
     예전 판은 여기서 16px 하나만 봤습니다. */
  const gapBands = [];
  for (const vw of [360, 390, 401, 520, 700, 1440]) {
    gapBands.push(px(cssValue((s) => s === ".stats-bar", "gap", vw)));
  }
  const distinctGaps = [...new Set(gapBands)];
  ok("시세 바 gap 을 구간별로 읽어온다(미디어쿼리 안까지)",
     distinctGaps.length >= 2 && gapBands.every((g) => g > 0),
     "폭 360/390/401/520/700/1440 → " + gapBands.join(", ") + "px");

  ok("힌트 층이 index.html 에서 시세 바를 감싼다",
     /<div class="tl-stats-hint-layer[^"]*">[\s\S]{0,600}?<div class="stats-bar/.test(HTML));

  const layerPos = cssValue((s) => s === ".tl-stats-hint-layer", "position", 1440);
  const afterPos = cssValue((s) => s === ".tl-stats-hint-layer::after", "position", 1440);
  ok("힌트는 스크롤되지 않는 바깥 층에 절대배치된다",
     layerPos === "relative" && afterPos === "absolute",
     "layer:" + layerPos + " ::after:" + afterPos);

  /* 힌트가 시세 바 안의 flex 항목으로 되돌아오면(=gap 을 다시 만들면),
     구간마다 상쇄값이 맞는지 전부 따집니다. 하나라도 어긋나면 실패입니다.
     — 예전 CSS(.stats-bar::after, margin-left:-42px/-32px)는 여기서 걸립니다. */
  let flexHintBad = [];
  for (const vw of [360, 375, 390, 430, 520, 700, 768, 1440, 1920]) {
    const w = px(cssValue((s) => s === ".stats-bar::after", "width", vw));
    if (w == null) continue;                       /* flex 항목이 아니면 검사 불필요 */
    const ml = px(cssValue((s) => s === ".stats-bar::after", "margin-left", vw));
    const gap = px(cssValue((s) => s === ".stats-bar", "gap", vw));
    if (Math.abs((ml == null ? 0 : ml) - (w + gap)) > 0.01) {
      flexHintBad.push(vw + "px: 상쇄 " + ml + " ≠ 폭 " + w + " + gap " + gap);
    }
  }
  ok("힌트가 flex 항목이면 모든 폭에서 폭+gap 을 정확히 상쇄한다",
     flexHintBad.length === 0, flexHintBad.join(" / "));

  /* 같은 CSS 규칙이 두 벌이면 뒤엣것이 앞을 덮어 수정이 안 먹습니다. */
  const dup = (CSS.match(/^\.tl-stats-hint-layer\.has-more::after\{/gm) || []).length;
  ok("has-more 규칙이 두 벌이 아니다", dup === 1, String(dup));
}

/* ---------------- 5) 여섯 폭에서 마크가격이 힌트에 가리지 않는다 ----------------
 * jsdom 에는 레이아웃이 없어 CSS 값(위 cssValue 로 구간별로 읽은 실제 값)에
 * 브라우저에서 잰 글자 폭을 곱해 마크가격 오른쪽 끝을 계산합니다.
 *
 * 글자 폭 기준값 — Chrome / http://localhost:3000 / 비로그인 / 2026-08-21 실측
 *   대표가격 "$74,757.70"  182.7px @ font-size 34px  → 1px 당 5.3735
 *   라벨     "마크가격"      55.2px @ font-size 15px  → 1px 당 3.6800
 *   마크값   "74,757.60"    86.1px @ font-size 18px  → 1px 당 4.7833
 * 시세 바 좌표 — 내용 시작 x=9(테두리 1px 포함), 보이는 오른쪽 끝은
 *   min(창폭 - 10, 1458)  (1458 = --content-max 로 잘리는 지점)
 * 이 모델을 실측과 맞춰 보면 360px 298.26 vs 298.2, 768px 338.38 vs 338.3 로
 * 0.1px 안쪽입니다.
 * ------------------------------------------------------------------- */
{
  const PRICE_PER_FS = 182.7 / 34;
  const LABEL_PER_FS = 55.2 / 15;
  const VALUE_PER_FS = 86.1 / 18;
  const CONTENT_LEFT = 9;
  const BORDER = 1;
  const MAX_RIGHT = 1458;

  /* 각 값은 CSS 에서 그 폭에 실제로 적용되는 것을 읽습니다.
     누가 gap·여백·글씨 크기를 바꾸면 이 계산이 따라 움직입니다. */
  function markPriceRight(vw) {
    const gap = px(cssValue((s) => s === ".stats-bar", "gap", vw));
    const blockPr = px(cssValue(
      (s) => s === ".stat-block" || /^\.stats-bar\s*>\s*\.stat-block$/.test(s),
      "padding-right", vw));
    const priceFs = px(cssValue((s) => /^\.main-price-block\s+\.stat-value\.price$/.test(s),
      "font-size", vw));
    const labelFs = px(cssValue((s) => s === ".stat-label", "font-size", vw));
    const valueFs = px(cssValue((s) => s === ".stat-value", "font-size", vw));
    const innerGap = px(cssValue((s) => /^\.stat-block:not\(\.main-price-block\)$/.test(s),
      "gap", vw));
    return {
      x: CONTENT_LEFT + priceFs * PRICE_PER_FS + blockPr + BORDER + gap +
         labelFs * LABEL_PER_FS + innerGap + valueFs * VALUE_PER_FS,
      parts: { gap, blockPr, priceFs, labelFs, valueFs, innerGap }
    };
  }
  function hintWidth(vw) {
    /* 바깥 층이든(현재) 시세 바 안이든(예전) 실제로 덮는 폭을 봅니다. */
    const a = px(cssValue((s) => s === ".tl-stats-hint-layer::after", "width", vw));
    const b = px(cssValue((s) => s === ".stats-bar::after", "width", vw));
    return a != null ? a : (b != null ? b : 0);
  }

  console.log("\n  폭    힌트  마크끝    한계    겹침px  판정");
  for (const vw of [360, 375, 390, 768, 1440, 1920]) {
    const m = markPriceRight(vw);
    const w = hintWidth(vw);
    const limit = Math.min(vw - 10, MAX_RIGHT) - w;
    const overlap = m.x - limit;
    const bad = Object.entries(m.parts).filter(([, v]) => v == null || !isFinite(v));
    console.log("  " + String(vw).padEnd(6) + String(w).padEnd(6) +
                m.x.toFixed(1).padEnd(10) + limit.toFixed(1).padEnd(8) +
                (overlap > 0 ? "+" : "") + overlap.toFixed(1));
    ok("  " + vw + "px — 마크가격이 힌트에 가리지 않는다",
       bad.length === 0 && overlap <= 0,
       bad.length ? "CSS 값을 못 읽음: " + bad.map(([k]) => k).join(",")
                  : "겹침 +" + overlap.toFixed(1) + "px (한계 " + limit.toFixed(1) +
                    ", 마크끝 " + m.x.toFixed(1) + ")");
  }
}

/* ---------------- 6) 실제 동작 (jsdom) ---------------- */
{
  const dom = new JSDOM(
    '<div class="tl-stats-hint-layer page-center">' +
    '<div class="stats-bar page-center">' +
    '  <div class="stat-block main-price-block"><span class="stat-value" id="stat-price">-</span></div>' +
    '  <div class="stat-block"><span class="stat-label">24H 고가</span><span class="stat-value" id="stat-high">-</span></div>' +
    "</div></div>",
    { runScripts: "outside-only", pretendToBeVisual: true }
  );
  const win = dom.window;
  win.eval(SRC);   /* jsdom 은 win.eval 로 올립니다(tests/harness.js 와 동일) */
  const SBP = win.App.StatsBarPriority;
  const bar = win.document.querySelector(".stats-bar");
  const layer = win.document.querySelector(".tl-stats-hint-layer");

  ok("모듈이 뜬다", !!SBP);

  /* chart.js 는 나중에 펀딩비·마크가격을 덧붙입니다. 그 전에는 조용해야 합니다. */
  ok("아직 없는 항목에 대해 터지지 않는다", bar.querySelectorAll(".tl-stat-order-1").length === 0);

  /* chart.js 가 하는 것과 똑같이 뒤에 붙입니다. */
  const mk = (label, id) => {
    const b = win.document.createElement("div");
    b.className = "stat-block";
    b.innerHTML = '<span class="stat-label">' + label + '</span><span class="stat-value" id="' + id + '">-</span>';
    bar.appendChild(b);
    return b;
  };
  const fund = mk("펀딩비 (다음 정산까지)", "stat-funding");
  const mark = mk("마크가격", "stat-mark-price");

  SBP.applyOrder();
  ok("마크가격 블록에 우선 클래스가 붙는다", mark.classList.contains("tl-stat-order-1"));
  ok("펀딩비 블록에 우선 클래스가 붙는다", fund.classList.contains("tl-stat-order-2"));
  ok("DOM 순서는 그대로다(마크업 보존)", bar.lastElementChild === mark);

  /* 두 번 돌려도 클래스가 겹쳐 붙지 않아야 합니다(MutationObserver 로 자주 불림). */
  SBP.applyOrder();
  ok("여러 번 불려도 클래스가 한 번만 붙는다",
     (mark.className.match(/tl-stat-order-1/g) || []).length === 1);

  /* 스크롤 힌트 — jsdom 은 실제 레이아웃이 없어 값을 직접 넣어 확인합니다. */
  Object.defineProperty(bar, "scrollWidth", { value: 1500, configurable: true });
  Object.defineProperty(bar, "clientWidth", { value: 400, configurable: true });
  bar.scrollLeft = 0;
  SBP.updateHint();
  ok("숨겨진 내용이 있으면 힌트를 켠다", layer.classList.contains("has-more"));

  bar.scrollLeft = 1100; /* 끝까지 밀었을 때 */
  SBP.updateHint();
  ok("끝까지 밀면 힌트를 끈다", !layer.classList.contains("has-more"));

  /* 항목을 지우거나 숨기지 않습니다 — 원칙 1-2 */
  ok("항목을 하나도 지우지 않았다", bar.querySelectorAll(".stat-block").length === 4);
  ok("display:none 을 쓰지 않는다", SRC.indexOf("display") === -1 && SRC.indexOf("remove()") === -1);
}

/* ---------------- 7) 힌트 층이 없는 예전 마크업 ---------------- */
{
  /* 감싸개가 없어도(다른 페이지·예전 캐시) 터지지 않고 시세 바에 표시합니다. */
  const dom = new JSDOM(
    '<div class="stats-bar"><div class="stat-block"><span class="stat-value" id="stat-price">-</span></div></div>',
    { runScripts: "outside-only", pretendToBeVisual: true }
  );
  const win = dom.window;
  win.eval(SRC);
  const bar = win.document.querySelector(".stats-bar");
  Object.defineProperty(bar, "scrollWidth", { value: 1500, configurable: true });
  Object.defineProperty(bar, "clientWidth", { value: 400, configurable: true });
  bar.scrollLeft = 0;
  win.App.StatsBarPriority.updateHint();
  ok("감싸개가 없어도 터지지 않는다", bar.classList.contains("has-more"));
}

/* ---------------- 8) 시세 바가 없는 페이지 ---------------- */
{
  const dom = new JSDOM("<div></div>", { runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  let threw = false;
  try { win.eval(SRC); win.App.StatsBarPriority.update(); } catch (e) { threw = true; }
  ok("시세 바가 없어도 터지지 않는다", !threw);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다(tests/README.md). */
process.exit(0);
