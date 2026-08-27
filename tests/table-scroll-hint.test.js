/* tests/table-scroll-hint.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 랭킹 표가 폰에서 잘리는데 **잘렸다는 신호가 없는** 것. (P2)
 *
 * 있었던 상태 (2026-08-21 실측, 비로그인, localhost:3000):
 *   폭    표 전체  보이는 폭  숨는 양   안 보이는 항목
 *   360    641px    324px    317px   수익률(전부) · 수익금 208px · 총자산 65px
 *   375    641px    339px    302px
 *   390    641px    354px    287px
 *   768/1440/1920            0px     없음
 *   → 360 은 국내에서 가장 흔한 폭인데 거기서 수익률이 통째로 안 보이고,
 *     "옆으로 더 있다"는 표시가 하나도 없었습니다.
 *
 * 이 테스트가 특히 못 박는 것 두 가지
 *   ① 힌트가 **끝까지 밀면 꺼진다** — 안 꺼지면 마지막 열을 영구히 덮습니다.
 *      (인계문서가 경고한 "화면 안에 있다 ≠ 읽을 수 있다" 유형)
 *   ② 거래내역 표(.table-scroll)에는 **손대지 않는다** —
 *      js/ui.js 302행(수정 금지)이 그 .table-scroll 을 통째로 갈아끼우므로
 *      감싸개를 씌우면 부딪칩니다.
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const MODULE_REL = "js/table-scroll-hint.js";
const modSrc = fs.readFileSync(path.join(REPO, MODULE_REL), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(REPO, "main.js"), "utf8");

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;
  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.eval("window.App=window.App||{};App.Bus={on(){},off(){},emit(){}};");
  win.eval(opts.source !== undefined ? opts.source : modSrc);
  if (opts.skipInit !== true && win.App.TableScrollHint) win.App.TableScrollHint.init();
  return { win, doc: win.document, App: win.App };
}

/* =========================================================================
 * 1) 배선
 * =======================================================================*/
console.log("\n[배선] 모듈이 실제로 로드·초기화되는가");
{
  ok("js/table-scroll-hint.js 파일이 있다", fs.existsSync(path.join(REPO, MODULE_REL)));
  ok("index.html 에 <script> 로 연결됐다", html.indexOf(MODULE_REL) !== -1);
  ok("main.js 모듈 목록에 이름이 있다", /"TableScrollHint"/.test(mainJs));
  ok(
    "랭킹 모듈(Leaderboard)보다 뒤에서 init 된다",
    mainJs.indexOf('"TableScrollHint"') > mainJs.indexOf('"Leaderboard"')
  );
  ok(
    "index.html 에서도 guest-leaderboard.js 뒤에 온다",
    html.indexOf(MODULE_REL) > html.indexOf("js/guest-leaderboard.js")
  );
}

/* =========================================================================
 * 2) "더 있나" 판단 — 순수 함수
 *    ★ 끝까지 밀면 꺼지는가 (마지막 열을 영구히 덮지 않는 근거)
 * =======================================================================*/
console.log("\n[판단] 어느 쪽에 더 있는지 숫자로 맞히는가");
{
  const h = boot();
  const d = h.App.TableScrollHint._decide;

  /* 360 실측값 그대로: 전체 641 / 보이는 폭 324 / 숨는 양 317 */
  const atStart = d(641, 324, 0);
  ok("360 실측값 · 맨 왼쪽 → 오른쪽에 더 있다", atStart.next === true);
  ok("360 실측값 · 맨 왼쪽 → 왼쪽에는 없다", atStart.prev === false);

  const mid = d(641, 324, 150);
  ok("가운데 → 양쪽 다 더 있다", mid.next === true && mid.prev === true);

  const atEnd = d(641, 324, 317);
  ok("★ 끝까지 밀면 오른쪽 힌트가 꺼진다(마지막 열을 안 덮음)", atEnd.next === false, JSON.stringify(atEnd));
  ok("끝까지 밀면 왼쪽 힌트는 켜진다(돌아갈 수 있다는 신호)", atEnd.prev === true);

  /* 소수점 반올림 여유 — 0 으로 두면 다 밀어도 안 꺼질 수 있습니다 */
  const almost = d(641, 324, 316);
  ok("1px 남으면 꺼진다(반올림 여유)", almost.next === false);
  const two = d(641, 324, 314);
  ok("3px 남으면 아직 켜져 있다", two.next === true);

  /* 넓은 화면 — 숨는 것이 없으면 양쪽 다 꺼짐 */
  const wide = d(1404, 1404, 0);
  ok("1440 실측값 · 숨는 것이 없으면 양쪽 다 꺼진다", wide.next === false && wide.prev === false);
  const wide768 = d(732, 732, 0);
  ok("768 실측값 · 숨는 것이 없으면 양쪽 다 꺼진다", wide768.next === false && wide768.prev === false);
}

/* =========================================================================
 * 3) DOM — 감싸개와 CSS
 * =======================================================================*/
console.log("\n[DOM] 감싸개와 CSS 를 스스로 만드는가");
let layerCls = null;
{
  const h = boot();
  layerCls = h.App.TableScrollHint._LAYER_CLASS;
  const box = h.doc.querySelector("#leaderboard-panel .table-scroll");
  ok("랭킹 표의 스크롤 상자를 찾았다", !!box);
  ok("스크롤 상자가 힌트 층으로 감싸졌다", !!box && box.parentNode.classList.contains(layerCls));
  ok("감싸개가 스크롤 상자 바깥이다(안에 넣으면 같이 밀려서 소용없음)", !!box && box.parentNode !== box);
  ok("표는 그대로 감싸개 안에 있다", !!box && box.querySelector("table") !== null);
  ok("열 개수는 그대로 5개다(열을 지우지 않음)", h.doc.querySelectorAll("#leaderboard-panel thead th").length === 5);
  const heads = [...h.doc.querySelectorAll("#leaderboard-panel thead th")].map((t) => t.textContent.trim());
  ok("열 이름도 그대로다", heads.join(",") === "순위,닉네임,총자산,수익금,수익률", heads.join(","));
  ok("tbody(#leaderboard-body)는 안 건드렸다", !!h.doc.getElementById("leaderboard-body"));

  /* CSS 는 모듈이 스스로 넣습니다 — style.css 를 안 건드리기 위해 */
  const style = h.doc.getElementById("tl-table-hint-style");
  ok("모듈이 자기 <style> 을 넣는다", !!style);
  const css = style ? style.textContent : "";
  ok("기본 상태는 opacity:0 이다", /opacity:0/.test(css));
  ok("더 있을 때만 opacity:1 이 된다", /tl-has-next::after\{opacity:1/.test(css) && /tl-has-prev::before\{opacity:1/.test(css));
  ok("힌트가 클릭을 가로채지 않는다", /pointer-events:none/.test(css));
  ok("확정 팔레트를 쓴다(var(--surface), 대체값 #101727)", /var\(--surface,#101727\)/.test(css));
  ok("움직임 줄이기 설정을 존중한다", /prefers-reduced-motion/.test(css));

  /* 두 번 불러도 <style> 이 하나만 */
  h.App.TableScrollHint.init();
  ok("init 을 두 번 불러도 <style> 은 하나다", h.doc.querySelectorAll("#tl-table-hint-style").length === 1);
  ok("init 을 두 번 불러도 감싸개는 하나다", h.doc.querySelectorAll("#leaderboard-panel ." + layerCls).length <= 1);
}

/* =========================================================================
 * 4) ★ 거래내역 표는 건드리지 않는다 (js/ui.js 충돌 방지)
 * =======================================================================*/
console.log("\n[충돌 방지] 거래내역 표에는 손대지 않는가");
{
  const h = boot();
  const targets = h.App.TableScrollHint._TARGETS;
  ok("대상이 랭킹 표 하나뿐이다", targets.length === 1 && /leaderboard/.test(targets[0]), targets.join(","));
  ok("대상 선택자에 history/position 이 없다", !targets.some((t) => /history|position/i.test(t)));

  const ui = fs.readFileSync(path.join(REPO, "js/ui.js"), "utf8");
  ok(
    "js/ui.js 가 .table-scroll 을 통째로 갈아끼우는 것이 사실이다(그래서 피한 것)",
    /querySelector\(["']\.table-scroll["']\)/.test(ui)
  );
  /* ── 기준선 갱신 (2026-08-27, 디자인팀 / 본부장 지시) ──────────────
     원래 이 검사는 "랭킹 밖의 .table-scroll 은 하나도 안 감싼다" 였습니다.
     그날(2026-08-24) 기준으로는 index.html 안에 처음부터 있는 .table-scroll
     중 감싸도 되는 것이 랭킹 하나뿐이었기 때문입니다.

     2026-08-27 에 **현재 포지션 표**(#position-card .table-scroll)를 대상에
     넣으면서 이 검사가 걸렸습니다. 검사를 지우지 않고 **허용 목록 방식으로
     좁혔습니다** — 아래 ALLOWED 에 적힌 것만 감쌀 수 있고, 그 밖의 상자가
     감싸지면 여전히 실패합니다.

     왜 포지션 표를 넣었나 (실측, 포지션 1개 보유 상태를 브라우저에서 재현)
       폭    표 전체   보이는 폭   숨는 양    스크롤바 높이
        360   1594px    342px    1252px     0px  ← 밀 수 있다는 신호가 0
       1440   1594px   1422px     172px     0px
       1920   1492px   1450px      42px     0px
     전날 "더보기"로 18칸을 펼칠 수 있게 고쳤는데, 밀 수 있다는 표시가 없어
     강제청산가를 여전히 못 보는 상태였습니다.

     ⚠ 거래내역(.history-panel 의 표)은 **여전히 허용 목록에 없습니다.**
       js/ui.js 302행이 그 .table-scroll 을 querySelector 로 집어 옮기기
       때문에, 부팅 시점에 감싸면 안 됩니다(하단 탭이 만들어진 뒤에
       LATE_TARGETS 로 붙습니다). */
  const ALLOWED = ["#leaderboard-panel", "#position-card"];
  const others = [...h.doc.querySelectorAll(".table-scroll")].filter(
    (b) => !ALLOWED.some((sel) => b.closest(sel))
  );
  const wrapped = others.filter((b) => b.parentNode.classList.contains(layerCls));
  ok("허용 목록 밖의 .table-scroll 은 하나도 안 감쌌다", wrapped.length === 0, wrapped.length + "개 감쌈");

  /* 반대 방향 — 포지션 표는 **반드시** 감싸져 있어야 합니다.
     (안 감싸면 힌트가 표와 같이 밀려서 아무 소용이 없습니다) */
  const posBox = h.doc.querySelector("#position-card .table-scroll");
  ok("포지션 표의 스크롤 상자가 있다", !!posBox);
  ok(
    "★ 포지션 표가 힌트 층으로 감싸졌다",
    !!posBox && posBox.parentNode.classList.contains(layerCls)
  );
  ok(
    "포지션 표 힌트는 카드 안쪽 타일색(var(--surface2)) 변형을 쓴다",
    !!posBox && posBox.parentNode.classList.contains("tl-hint-surface2")
  );
  ok(
    "대상 목록(LATE_TARGETS)에 포지션 표가 적혀 있다",
    h.App.TableScrollHint._LATE_TARGETS.indexOf("#position-card .table-scroll") !== -1
  );
  ok(
    "포지션 표는 여전히 12칸 그대로다(열을 지우지 않음)",
    h.doc.querySelectorAll("#position-table thead th").length === 12,
    h.doc.querySelectorAll("#position-table thead th").length + "칸"
  );
  ok(
    "일괄청산 버튼이 그대로 있다(마크업 보존)",
    !!h.doc.getElementById("pos-close-all")
  );

  /* CSS 변형이 확정 팔레트 값을 쓰는지 */
  const css2 = h.doc.getElementById("tl-table-hint-style").textContent;
  ok(
    "변형 규칙이 var(--surface2) 를 쓴다(대체값 #0D1422)",
    /var\(--surface2,#0D1422\)/.test(css2)
  );
}

/* =========================================================================
 * 5) 안전 — 수정 금지 파일 / 데이터 감추기
 * =======================================================================*/
console.log("\n[안전] 수정 금지 파일 / 데이터 감추기");
{
  const FROZEN = {
    "js/leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
    "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "js/trading.js": "33250202c00b097ff8344ae2ee64cbe7",
  };
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok("수정 금지 파일이 그대로다: " + f, got === want, "지금 " + got);
  }
  /* 주석은 빼고 봅니다 — "랭킹 페이지는 처음에 display:none 입니다" 같은
     설명 주석이 있어서 날 것 그대로 grep 하면 그 설명에 걸립니다. */
  const codeOnly = modSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok("모듈 코드가 열을 숨기지 않는다(display:none 없음, 주석 제외)", !/display\s*:\s*none/.test(codeOnly));
  ok("주석을 지워도 판단 함수는 남아 있다(주석만 보고 통과한 게 아님)", /_decide/.test(codeOnly));
  ok("모듈이 표 내용을 지우지 않는다", !/innerHTML\s*=|removeChild|\.remove\(\)/.test(codeOnly));
  ok(
    "style.css 에는 이 힌트 규칙이 없다(디자인팀 파일을 안 건드림)",
    fs.readFileSync(path.join(REPO, "style.css"), "utf8").indexOf("tl-table-hint-layer") === -1
  );
}

/* =========================================================================
 * 6) 돌연변이 — 망가뜨리면 검사가 뒤집히는가
 * =======================================================================*/
console.log("\n[돌연변이] 망가뜨리면 정말 실패하는가");
{
  /* (가) 끝까지 밀어도 안 꺼지게 만든다 = 마지막 열을 영구히 덮는 버그 */
  const alwaysOn = modSrc.replace(
    "return { next: max - scrollLeft > EPS, prev: scrollLeft > EPS };",
    "return { next: true, prev: scrollLeft > EPS };"
  );
  ok("'항상 켜짐' 돌연변이를 만들었다(메모리에서만)", alwaysOn !== modSrc);
  const h1 = boot({ source: alwaysOn, skipInit: true });
  ok(
    "→ 끝까지 밀어도 안 꺼지면 ★ 검사가 실패한다(= 검사가 진짜다)",
    h1.App.TableScrollHint._decide(641, 324, 317).next === true
  );

  /* (나) 감싸지 않게 만든다 = 힌트가 내용과 같이 밀려 소용없어짐 */
  const noWrap = modSrc.replace("layer.appendChild(box);", "/* 감싸기 제거(돌연변이) */");
  ok("'감싸기 제거' 돌연변이를 만들었다", noWrap !== modSrc);
  const h2 = boot({ source: noWrap });
  const box2 = h2.doc.querySelector("#leaderboard-panel .table-scroll");
  ok("→ 감싸기를 떼면 스크롤 상자가 힌트 층 안에 없다", !box2.parentNode.classList.contains(layerCls));

  /* (다) 거래내역까지 대상에 넣는다 = ui.js 와 충돌하는 설정 */
  const wideTargets = modSrc.replace(
    'var TARGETS = ["#leaderboard-panel .table-scroll"];',
    'var TARGETS = ["#leaderboard-panel .table-scroll", "#history-panel .table-scroll"];'
  );
  ok("'거래내역까지' 돌연변이를 만들었다", wideTargets !== modSrc);
  const h3 = boot({ source: wideTargets, skipInit: true });
  const t3 = h3.App.TableScrollHint._TARGETS;
  ok("→ 대상이 늘어나면 '랭킹 하나뿐' 검사가 실패한다", !(t3.length === 1), t3.join(","));

  /* (라) CSS 주입을 뺀다 */
  const noCss = modSrc.replace("el.textContent = css;", "el.textContent = \"\";");
  const h4 = boot({ source: noCss });
  const css4 = h4.doc.getElementById("tl-table-hint-style");
  ok("→ CSS 를 비우면 규칙 검사가 실패한다", !css4 || !/tl-has-next/.test(css4.textContent));

  /* (마) 원본 파일은 그대로인지 */
  ok("원본 모듈 파일은 손대지 않았다", fs.readFileSync(path.join(REPO, MODULE_REL), "utf8") === modSrc);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) {
  console.log("전체 통과 ✅");
  process.exit(0);
} else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
