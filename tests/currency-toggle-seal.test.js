/* tests/currency-toggle-seal.test.js
 * =========================================================================
 * 통화 전환 버튼이 다시 사라지지 않게 — 봉인
 * =========================================================================
 * 2026-08-28 — 본부장 배정 / 기록팀 봉인 (커밋 8f27ad7 봉인 0건이었음)
 *
 * ── 무슨 일이 있었나 ───────────────────────────────────────────────────
 *
 *   2026-08-17 커밋 8fcb903 이 헤더 공지 줄에 폭을 주려고
 *   헤더 우측 덩어리 `.top-banner-right` 를 **통째로** 감췄습니다.
 *
 *   통화 전환 버튼(#currency-toggle)은 js/ui.js:224 가 `.ws-status` 옆에
 *   만들어 넣기 때문에 **하필 그 상자 안**에 생깁니다. 그래서 같이 사라졌습니다.
 *
 *   그 커밋을 쓴 사람도 알고 있었고 메시지 마지막 줄에 이렇게 적었습니다 —
 *     "필요하면 통화 버튼만 다시 노출할 수 있습니다"
 *
 *   ⚠ **그 한 줄을 적어 놓고 열흘 동안 아무도 안 봤습니다.**
 *     그 사이 통화 설정은 브라우저에 저장되므로(js/config.js),
 *     8/17 이전에 원화로 바꿔 둔 회원은 **되돌릴 버튼이 없어 원화에 갇혔습니다.**
 *     오류도 안 나고 화면도 멀쩡합니다(조용한 고장).
 *
 *   2026-08-27 커밋 8f27ad7 이 버튼만 되살렸습니다. **봉인은 0건이었습니다.**
 *
 * ── 그래서 이 파일이 하는 일 ──────────────────────────────────────────
 *   커밋 메시지에 적어 두는 것으로는 안 막힙니다. **사람이 아니라 테스트가
 *   잡아야 합니다.** 그게 이 파일의 존재 이유입니다.
 *
 *   [2] `.top-banner-right{display:none}` 으로 되돌아가면 즉시 터진다  ← 핵심
 *   [3] 연결 상태·닉네임·로그아웃은 계속 숨겨져 있다 (되살리면 "내 정보" 와 중복)
 *   [4] 마크업은 그대로 있다 — #auth-logout-btn 을 지우면 로그아웃이 죽는다
 *   [5] .ws-status 가 상자 안에 남아 있다 — 없으면 버튼이 아예 안 만들어진다
 *   [6] <html data-cur> 표식을 실제로 붙인다. 사라지면 터진다
 *   [7] 원화일 때만 호가창 글자가 좁아진다 (USDT 는 그대로)
 *   [8] 마크가격 통화 표기가 옆 항목과 같다 (₩ / $ 를 앞에)
 *
 * ⚠ 사이트 코드는 읽기만 합니다. 서버에 붙지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

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

const css원본 = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

/* 주석을 먼저 지웁니다 — 주석 안에 `.top-banner-right{display:none;}` 이
   되돌리는 방법으로 적혀 있어서, 그냥 찾으면 오탐납니다.
   (CLAUDE.md 기록: 문자열 검사는 주석 때문에 오탐이 난다) */
const css = css원본.replace(/\/\*[\s\S]*?\*\//g, "");

/* -------------------------------------------------------------------------
 * 아주 작은 CSS 읽개 — 선택자 하나에 대해 "문서 순서대로 마지막에 이긴 값"
 * -------------------------------------------------------------------------
 * 전체 캐스케이드를 흉내 내지 않습니다. **선택자 문자열이 정확히 같은**
 * 규칙들만 모아서 마지막 값을 봅니다. 이 파일이 지키려는 세 줄은
 * 전부 선택자가 정확히 일치하는 형태라 이걸로 충분합니다.
 * ----------------------------------------------------------------------- */
/* style.css 를 한 번 훑어 { 선택자, 미디어조건, 선언 } 목록으로 만듭니다.
   ⚠ 미디어쿼리를 반드시 구분합니다. 2026-08-28 첫 판에서 이걸 안 나눴다가
     @media(max-width:600px) 안의 22px 을 "기본값" 으로 읽어 헛다리를 짚었습니다.
     기본값은 미디어쿼리 **밖**의 마지막 값입니다. */
function 훑기(text) {
  const out = [];
  const 스택 = [];
  let i = 0;
  let 버퍼 = "";
  while (i < text.length) {
    const c = text[i];
    if (c === "{") {
      const 머리 = 버퍼.trim();
      버퍼 = "";
      if (머리.charAt(0) === "@") { 스택.push(머리); i++; continue; }
      let k = text.indexOf("}", i);
      if (k < 0) k = text.length;
      out.push({
        선택자들: 머리.split(",").map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean),
        미디어: 스택.filter((a) => /^@media/.test(a)).join(" ~ "),
        본문: text.slice(i + 1, k),
      });
      i = k + 1;
      continue;
    }
    if (c === "}") { 스택.pop(); 버퍼 = ""; i++; continue; }
    버퍼 += c;
    i++;
  }
  return out;
}
const 전체규칙 = 훑기(css);

/* 미디어조건을 안 주면 "미디어쿼리 밖(기본)" 만 봅니다.
   "*" 를 주면 전부, 문자열을 주면 그 조건이 들어간 블록만 봅니다. */
function 규칙들(선택자, 미디어조건) {
  return 전체규칙.filter((r) => {
    if (r.선택자들.indexOf(선택자) < 0) return false;
    if (미디어조건 === undefined) return r.미디어 === "";
    if (미디어조건 === "*") return true;
    return r.미디어.indexOf(미디어조건) >= 0;
  });
}
function 마지막값(선택자, 속성, 미디어조건) {
  let v = null;
  for (const r of 규칙들(선택자, 미디어조건)) {
    const re = new RegExp("(?:^|;)\\s*" + 속성 + "\\s*:\\s*([^;]+)", "g");
    let m;
    while ((m = re.exec(r.본문)) !== null) v = m[1].trim();
  }
  return v;
}

/* =========================================================================
 * [1] CSS 를 제대로 읽었나 (읽개 자체 확인)
 * ========================================================================= */
절("[1] 읽개 확인 — 주석을 지우고 규칙을 찾았다");
{
  ok("style.css 를 읽었다 (" + css원본.length + "자)", css원본.length > 10000);
  ok("주석을 지웠다 (지운 뒤가 더 짧다)", css.length < css원본.length,
    "주석 안의 '되돌리는 법' 예시가 그대로 검사에 걸리면 오탐납니다");
  ok(".top-banner-right 규칙을 찾았다 (" + 규칙들(".top-banner-right").length + "개)",
    규칙들(".top-banner-right").length >= 1);
}

/* =========================================================================
 * [2] ⭐ 상자를 통째로 숨기지 않는다 — 2026-08-17 재발 방지
 * ========================================================================= */
절("[2] ⭐ .top-banner-right 를 다시 통째로 숨기지 않는다");
{
  const 상자 = 마지막값(".top-banner-right", "display");
  ok("`.top-banner-right` 의 display 가 flex 다", 상자 === "flex",
    "지금 값: " + 상자 + " — none 이면 2026-08-17 상태로 되돌아간 것이고, " +
    "원화로 바꿔 둔 회원이 다시 원화에 갇힙니다");
  ok("`.top-banner-right{display:none}` 규칙이 한 개도 없다",
    규칙들(".top-banner-right").every((r) => !/display\s*:\s*none/.test(r.본문)),
    "주석이 아니라 실제 규칙에 none 이 있습니다");

  const 안쪽 = 마지막값(".top-banner-right > *", "display");
  ok("`.top-banner-right > *` 의 display 가 none 이다 (안쪽은 계속 숨김)",
    안쪽 === "none", "지금 값: " + 안쪽 +
    " — 8fcb903 의 목적(헤더 우측을 치워 공지 줄에 폭을 주기)이 사라집니다");

  const 버튼 = 마지막값(".top-banner-right > #currency-toggle", "display");
  ok("`.top-banner-right > #currency-toggle` 의 display 가 flex 다 (버튼만 되살림)",
    버튼 === "flex", "지금 값: " + 버튼);

  ok("세 줄이 다 있다 (하나만 빠져도 버튼이 사라지거나 헤더가 도로 넓어집니다)",
    상자 === "flex" && 안쪽 === "none" && 버튼 === "flex",
    "상자 " + 상자 + " / 안쪽 " + 안쪽 + " / 버튼 " + 버튼);

  /* 나중에 누가 #currency-toggle 을 다시 숨기는 규칙을 덧붙이는 것도 막습니다.
     (id 선택자라 특이도가 높아 순서와 무관하게 이깁니다 — 그래서 값만 봅니다) */
  const 숨김규칙 = ["#currency-toggle", ".top-banner-right > #currency-toggle"]
    .filter((s) => /none/.test(String(마지막값(s, "display"))));
  ok("#currency-toggle 을 숨기는 규칙이 없다", 숨김규칙.length === 0,
    "숨기는 선택자: " + 숨김규칙.join(", "));

  /* 같은 선택자가 세 벌이 되는 것도 막습니다 — 뒤엣것이 앞을 덮어
     "고쳤는데 안 먹는" 상태가 이 프로젝트에서 두 번 났습니다. */
  const 벌수 = 규칙들(".top-banner-right").length;
  ok(".top-banner-right 규칙이 2벌 이하다 (" + 벌수 + "벌: 기본 + 미디어쿼리)",
    벌수 <= 2, "지금 " + 벌수 + "벌 — 늘어나면 어느 것이 이기는지 아무도 모릅니다");
}

/* =========================================================================
 * [3] 연결 상태·닉네임·로그아웃은 계속 숨겨져 있다
 * -------------------------------------------------------------------------
 * 되살리면 "내 정보" 패널과 같은 내용이 두 군데 나옵니다.
 * ========================================================================= */
절("[3] 연결 상태 · 닉네임 · 로그아웃은 계속 숨겨져 있다");
{
  /* ⚠ 특이도가 같으면 **문서 순서**가 결정합니다. 여기가 딱 그 경우입니다 —
       style.css:328   .ws-status{display:flex}             특이도 (0,0,1,0)
       style.css:2347  .top-banner-right > *{display:none}  특이도 (0,0,1,0)
     (자식 결합자 > 와 * 는 특이도가 0 이라 둘 다 "클래스 하나" 짜리입니다)
     지금은 숨기는 쪽이 **뒤에** 있어서 이깁니다.
     누가 .ws-status 규칙을 아래로 옮기기만 해도 연결 상태가 헤더에 다시
     나타납니다. 값만 보면 그걸 못 잡아서 순서를 봅니다. */
  const 숨김위치 = 전체규칙.findIndex((r) =>
    r.선택자들.indexOf(".top-banner-right > *") >= 0 && /display\s*:\s*none/.test(r.본문));
  ok("안쪽을 숨기는 규칙(.top-banner-right > *)을 찾았다", 숨김위치 >= 0);

  const 볼것 = [".ws-status", ".auth-user-badge", "#auth-user-badge",
    "#auth-logout-btn", ".top-banner-right > .ws-status", ".top-banner-right .ws-status"];
  const 늦은것 = [];
  전체규칙.forEach((r, idx) => {
    if (!볼것.some((sel) => r.선택자들.indexOf(sel) >= 0)) return;
    const m = /(?:^|;)\s*display\s*:\s*([^;]+)/.exec(r.본문);
    if (!m) return;
    if (m[1].trim() === "none") return;
    if (idx > 숨김위치) 늦은것.push(r.선택자들.join(",") + " -> display:" + m[1].trim());
  });
  ok("숨김 규칙보다 뒤에서 다시 보이게 하는 규칙이 없다", 늦은것.length === 0,
    "뒤에 있는 것: " + 늦은것.join(" / ") +
    " — 되살아나면 내 정보 패널과 같은 내용이 헤더에 한 번 더 나옵니다");

  ok(".ws-status 의 display:flex 규칙이 숨김 규칙보다 앞에 있다 (그래서 안 보인다)",
    전체규칙.findIndex((r) => r.선택자들.indexOf(".ws-status") >= 0) < 숨김위치,
    "순서가 뒤집히면 연결 상태 줄이 헤더에 다시 나타납니다");

  /* #currency-toggle 은 id 라 특이도가 높아 순서와 무관하게 이깁니다.
     그래서 [2] 에서 값만 봤습니다. 여기서 그 사실을 한 번 못 박습니다. */
  ok("통화 버튼만 id 선택자로 되살린다 (순서에 안 흔들리게)",
    전체규칙.some((r) => r.선택자들.indexOf(".top-banner-right > #currency-toggle") >= 0),
    "클래스로 되살리면 특이도가 같아져 순서 한 번 바뀔 때 또 사라집니다");
}

/* =========================================================================
 * [4] 마크업은 그대로 둔다 (숨기는 것과 지우는 것은 다르다)
 * -------------------------------------------------------------------------
 * #auth-logout-btn 은 "내 정보" 패널의 로그아웃이 대신 눌러주는 대상입니다.
 * 지우면 로그아웃이 조용히 동작하지 않습니다. 숨겨진 요소도 .click() 은 됩니다.
 * ========================================================================= */
절("[4] 마크업은 지우지 않는다 (숨김 ≠ 삭제)");
{
  ok("index.html 에 .top-banner-right 상자가 있다", /class="top-banner-right"/.test(html));
  ok("index.html 에 #auth-logout-btn 이 남아 있다", /id="auth-logout-btn"/.test(html),
    "지우면 '내 정보' 패널의 로그아웃이 누를 대상이 없어져 조용히 안 됩니다");
  ok("index.html 에 #auth-user-badge 가 남아 있다", /id="auth-user-badge"/.test(html));
  ok("index.html 에 #ws-status-text 가 남아 있다", /id="ws-status-text"/.test(html));
}

/* =========================================================================
 * [5] ⭐ 통화 버튼이 생길 자리 — .ws-status 가 상자 안에 있어야 한다
 * -------------------------------------------------------------------------
 * js/ui.js:222  document.querySelector(".ws-status")
 * js/ui.js:231  wsStatus.parentNode.insertBefore(wrap, wsStatus.nextSibling)
 * js/ui.js 는 수정 금지 파일이라 못 고칩니다. 그래서 **마크업 쪽이 어긋나면**
 * 버튼이 아예 안 만들어집니다 — 오류도 없이 그냥 없습니다(조용한 고장).
 * ========================================================================= */
절("[5] ⭐ .ws-status 가 .top-banner-right 안에 있다 (버튼이 생길 자리)");
{
  const m = html.match(/<div class="top-banner-right">([\s\S]*?)<\/div>\s*<\/div>/);
  ok("index.html 에서 .top-banner-right 안쪽을 읽었다", !!m);
  const 안쪽 = m ? m[1] : "";
  ok("그 안에 .ws-status 가 있다", /class="ws-status"/.test(안쪽),
    "js/ui.js 가 .ws-status 옆에 버튼을 꽂습니다. 이게 없으면 버튼이 안 생깁니다");
  ok("그 안에 auth-user-badge 도 같이 있다", /id="auth-user-badge"/.test(안쪽));

  const ui = fs.readFileSync(path.join(REPO, "js/ui.js"), "utf8");
  ok("js/ui.js 가 #currency-toggle 을 .ws-status 옆에 만든다",
    /querySelector\("\.ws-status"\)/.test(ui) && /wrap\.id = "currency-toggle"/.test(ui));
  ok("js/ui.js 가 버튼 두 개(USDT · KRW)를 만든다",
    /id="btn-cur-usdt"/.test(ui) && /id="btn-cur-krw"/.test(ui));
  ok("만들 때 인라인으로도 display:flex 를 준다 (두 겹 안전장치)",
    /wrap\.style\.cssText = "display:flex/.test(ui),
    "CSS 세 줄이 깨져도 인라인이 한 번 더 막아 줍니다");
}

/* =========================================================================
 * [6] ⭐ <html data-cur> 표식 — 사라지면 터진다
 * -------------------------------------------------------------------------
 * CSS 는 칸 안의 글자가 원화인지 알 수 없습니다.
 * js/currency-refresh.js 가 표식만 붙여 주고, 좁히는 일은 style.css 가 합니다.
 * **표식 이름이 한 글자만 달라져도 원화 화면이 통째로 두 줄로 접힙니다.**
 * ========================================================================= */
절("[6] ⭐ <html data-cur> 표식을 실제로 붙인다");
{
  const dom = new JSDOM("<!doctype html><html><head></head><body>" +
    '<div class="stats-bar"><span id="stat-mark-price">-</span></div></body></html>',
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;
  let 통화 = "USDT";
  win.App = {
    Bus: { on() {}, off() {}, emit() {} },
    Config: { getDisplayCurrency: () => 통화, USD_KRW: 1380 },
    Trading: { getSnapshot: () => ({}) },
  };
  win.eval(fs.readFileSync(path.join(REPO, "js/currency-refresh.js"), "utf8"));
  const 모듈 = win.App.CurrencyRefresh;
  ok("js/currency-refresh.js 가 App.CurrencyRefresh 를 만든다", !!모듈);

  모듈.markCurrency();
  ok("USDT 일 때 <html data-cur=\"USDT\">", win.document.documentElement.getAttribute("data-cur") === "USDT",
    "실제: " + win.document.documentElement.getAttribute("data-cur"));

  통화 = "KRW";
  모듈.markCurrency();
  ok("KRW 일 때 <html data-cur=\"KRW\">", win.document.documentElement.getAttribute("data-cur") === "KRW",
    "실제: " + win.document.documentElement.getAttribute("data-cur"));

  /* 붙이는 이름과 CSS 가 보는 이름이 같아야 합니다 */
  const KRW규칙수 = (css.match(/html\[data-cur="KRW"\]/g) || []).length;
  ok("style.css 에 html[data-cur=\"KRW\"] 규칙이 5개 이상 있다 (" + KRW규칙수 + "개)",
    KRW규칙수 >= 5, "지금 " + KRW규칙수 + "개 — 규칙이 사라지면 원화 화면이 다시 두 줄로 접힙니다");
  ok("js 가 붙이는 표식 이름이 data-cur 로 CSS 와 같다",
    /setAttribute\("data-cur"/.test(fs.readFileSync(path.join(REPO, "js/currency-refresh.js"), "utf8")),
    "data-currency 와 헷갈리기 쉽습니다 — 그건 포지션 표가 쓰는 다른 표식입니다");

  /* data-currency(포지션 표)와 data-cur(호가창)은 서로 다른 표식입니다.
     둘을 하나로 합치려다 한쪽이 조용히 죽는 일이 없게 둘 다 살아 있는지 봅니다. */
  ok("data-currency 표식(포지션 표)도 따로 살아 있다",
    /html\[data-currency="KRW"\]/.test(css),
    "두 표식은 붙이는 모듈이 다릅니다(position-table-extra.js vs currency-refresh.js)");
  dom.window.close();
}

/* =========================================================================
 * [7] ⭐ 원화일 때만 좁아진다 — USDT 는 안 바뀐다
 * -------------------------------------------------------------------------
 * 2026-08-27 실측 (1440 · 호가창 가격 칸)
 *   USDT  "79,458.20"      글자 93.8px  / 칸 93.8px / 칸높이 24px / 행 34px
 *   원    "119,220,900원"  글자 135.3px / 칸 117px  / 칸높이 48px / 행 58px
 *   → 칸 117px 에 글자 135.3px 이라 "원" 이 둘째 줄로 밀렸습니다.
 * ========================================================================= */
절("[7] ⭐ 원화일 때만 호가창 글자가 좁아진다 (USDT 는 그대로)");
{
  const 뽑기 = (sel, prop, 미디어) => {
    const v = 마지막값(sel, prop, 미디어);
    return v === null ? null : parseFloat(v);
  };
  const 기본행 = 뽑기(".ob-row", "font-size");           /* 미디어쿼리 밖 기본값은 없을 수 있음 */
  const KRW행 = 뽑기('html[data-cur="KRW"] .ob-row', "font-size");
  const KRW메인 = 뽑기('html[data-cur="KRW"] .main-grid .ob-row', "font-size");
  /* ⚠ .main-grid .ob-row 의 기본값은 @media (min-width:1301px) 안에 있습니다(style.css:4075).
     원화 규칙(5002행)은 미디어쿼리 밖이지만 특이도가 3(속성+클래스+클래스)이라
     2(클래스+클래스)인 기본값을 어느 폭에서든 이깁니다.
     2026-08-28 첫 판에서 미디어를 안 나누고 읽어 null 이 나왔습니다. */
  const 메인기본 = 뽑기(".main-grid .ob-row", "font-size", "min-width:1301px");
  const 현재가기본 = 뽑기(".ob-current-price", "font-size");
  const KRW현재가 = 뽑기('html[data-cur="KRW"] .ob-current-price', "font-size");

  ok("KRW 호가줄 글자 크기가 정해져 있다 (" + KRW행 + "px)", KRW행 === 15, "실제: " + KRW행);
  ok("KRW 메인 호가줄이 16px 이다", KRW메인 === 16, "실제: " + KRW메인);
  ok("메인 호가줄 기본이 20px 이다 (USDT 는 안 바뀜)", 메인기본 === 20, "실제: " + 메인기본);
  ok("⭐ 원화가 기본보다 작다 (" + KRW메인 + "px < " + 메인기본 + "px)", KRW메인 < 메인기본,
    "원화가 기본보다 크거나 같으면 '원' 이 다시 둘째 줄로 밀립니다");
  ok("현재가 기본이 24px 이다", 현재가기본 === 24, "실제: " + 현재가기본);
  ok("원화 현재가가 19px 로 더 작다", KRW현재가 === 19 && KRW현재가 < 현재가기본,
    "실제: " + KRW현재가);
  ok("마크가격 줄도 원화일 때 좁아진다 (13px)",
    뽑기('html[data-cur="KRW"] .ob-mark-price-row', "font-size") === 13,
    "실제: " + 뽑기('html[data-cur="KRW"] .ob-mark-price-row', "font-size"));

  /* 줄바꿈 금지 — 크기를 줄여도 nowrap 이 없으면 폭이 조금만 좁아지면 또 접힙니다 */
  const nowrap = [
    'html[data-cur="KRW"] .ob-row .ob-price',
    'html[data-cur="KRW"] .ob-current-price',
    'html[data-cur="KRW"] .ob-mark-price-row',
  ].filter((s) => String(마지막값(s, "white-space")) === "nowrap");
  ok("원화일 때 가격 · 현재가 · 마크가격이 white-space:nowrap 이다 (" + nowrap.length + "/3)",
    nowrap.length === 3, "빠진 것이 있습니다: " + nowrap.join(", "));

  /* USDT 전용으로 글자를 건드리는 규칙이 새로 생기지 않게 */
  ok("html[data-cur=\"USDT\"] 로 크기를 바꾸는 규칙이 없다",
    !/html\[data-cur="USDT"\][^{]*\{[^}]*font-size/.test(css),
    "USDT 는 원래 한 줄에 들어갑니다. 건드리면 멀쩡한 화면이 바뀝니다");

  /* 실측 주석 보존 */
  ok("style.css 주석에 실측(135.3px / 117px)이 남아 있다",
    css원본.indexOf("135.3") >= 0 && css원본.indexOf("117px") >= 0,
    "왜 줄였는지 숫자가 없으면 다음 사람이 '글씨가 작다' 며 되돌립니다");
}

/* =========================================================================
 * [8] 마크가격 통화 표기가 옆 항목과 같다
 * -------------------------------------------------------------------------
 * 2026-08-27 실측 (1440)
 *   원화   현재가 ₩119,220,150 · 24H 고가 ₩120,749,850   ← 기호가 앞
 *          마크가격 119,223,981원                          ← 단위가 뒤   ✗
 *   USDT   현재가 $79,419.70                               ← 기호가 앞
 *          마크가격 79,414.00                               ← 표시 없음  ✗
 * ========================================================================= */
절("[8] 마크가격 통화 표기가 옆 항목과 같다 (₩ / $ 를 앞에)");
{
  function 고쳐보기(통화, 처음글자) {
    const dom = new JSDOM("<!doctype html><html><body>" +
      '<div class="stats-bar"><span id="stat-mark-price">' + 처음글자 + "</span></div>" +
      "</body></html>", { runScripts: "outside-only", url: "https://example.test/" });
    const win = dom.window;
    win.App = {
      Bus: { on() {}, off() {}, emit() {} },
      Config: { getDisplayCurrency: () => 통화, USD_KRW: 1380 },
      Trading: { getSnapshot: () => ({}) },
    };
    win.eval(fs.readFileSync(path.join(REPO, "js/currency-refresh.js"), "utf8"));
    win.App.CurrencyRefresh.fixMarkPriceUnit();
    const 결과 = win.document.getElementById("stat-mark-price").textContent;
    dom.window.close();
    return 결과;
  }

  ok("원화 '119,223,981원' → '₩119,223,981'",
    고쳐보기("KRW", "119,223,981원") === "₩119,223,981", "실제: " + 고쳐보기("KRW", "119,223,981원"));
  ok("USDT '79,414.00' → '$79,414.00'",
    고쳐보기("USDT", "79,414.00") === "$79,414.00", "실제: " + 고쳐보기("USDT", "79,414.00"));
  ok("숫자는 한 글자도 안 바뀐다 (자릿수 그대로)",
    고쳐보기("KRW", "119,223,981원").replace(/[^0-9,]/g, "") === "119,223,981",
    "실제: " + 고쳐보기("KRW", "119,223,981원"));

  ok("이미 맞으면 그대로 둔다 (₩)", 고쳐보기("KRW", "₩119,223,981") === "₩119,223,981");
  ok("이미 맞으면 그대로 둔다 ($)", 고쳐보기("USDT", "$79,414.00") === "$79,414.00");
  ok("'-' 같은 자리표시자는 건드리지 않는다", 고쳐보기("USDT", "-") === "-",
    "빈 자리에 '$-' 를 적으면 값이 있는 것처럼 보입니다");
  ok("빈 칸도 건드리지 않는다", 고쳐보기("USDT", "") === "");
  ok("숫자로 시작하지 않는 글자는 그대로 둔다 (통화를 막 바꾼 직후)",
    고쳐보기("KRW", "$79,414.00") === "$79,414.00",
    "기호를 뗐다 붙이면 관찰자가 자기 글씨를 다시 보고 틀린 기호를 붙일 수 있습니다");

  const src = fs.readFileSync(path.join(REPO, "js/currency-refresh.js"), "utf8");
  ok("이미 맞으면 아무것도 쓰지 않는다 (무한 루프 방지 장치가 있다)",
    /if \(t\.charAt\(0\) === sign\) return;/.test(src),
    "MutationObserver 가 자기 글씨를 다시 보고 끝없이 돌 수 있습니다");
  ok("js/chart.js 를 열지 않고 바깥에서 고친다고 적혀 있다",
    /수정 금지 12개 파일/.test(src));
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
  ok("12개 전부 기준 해시와 같다 (특히 ui.js — 통화 버튼을 만드는 곳)",
    다름.length === 0, "달라진 파일: " + 다름.join(", "));
}

/* =========================================================================
 * [10] tests/_order.txt 등록
 * ========================================================================= */
절("[10] tests/_order.txt 등록");
{
  const order = fs.readFileSync(path.join(REPO, "tests/_order.txt"), "utf8");
  ok("tests/_order.txt 에 이 파일이 있다",
    order.indexOf("tests/currency-toggle-seal.test.js") >= 0);
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " currency-toggle-seal — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail > 0 ? 1 : 0);
