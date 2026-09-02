/* tests/chart-period-interval-cross-seal.test.js
 * =========================================================================
 * 팀 사이에 낀 봉인 — 표시 기간 탭 9개 ↔ 시간 단위 16개가 서로 싸우지 않는지
 * =========================================================================
 * 2026-09-02 밤 · 기록팀
 *   같은 날 밤 다른 커밋으로 들어온 세 모듈이 ★같은 버튼 줄(#interval-row)★ 을
 *   같이 씁니다.
 *     js/chart.js            (수정 금지) 시간 단위 버튼 16개를 그립니다
 *     js/interval-more.js    그중 7개를 "더보기 ⌄" 안으로 ★숨깁니다★
 *     js/chart-date-range.js 표시 기간 탭 9개. 회원 대신 그 버튼을 ★눌러 줍니다★
 *
 * ── ⚠️ 아무도 안 본 자리 ───────────────────────────────────────────────
 *   표시 기간 탭 9개가 쓰는 봉 간격 중 ★5개가 더보기 안에 숨겨진 것★ 입니다.
 *       1M(2시간) · 3M(6시간) · 6M(12시간) · 5Y(1주) · ALL(1개월)
 *   js/chart-date-range.js 는 그 간격으로 바꿀 때
 *       #interval-row .interval-btn[data-interval="2h"] 를 찾아 click() 합니다.
 *   js/interval-more.js 가 그 버튼을 ★CSS 로 가리기만★ 하기 때문에 지금은 됩니다.
 *
 *   ★만약 가리는 대신 지우면(removeChild) 표시 기간 탭 5개가 조용히 죽습니다.★
 *   오류도 안 나고, 탭에 불도 들어오고, 화면만 그 기간이 아닙니다.
 *   회원은 "1개월을 보고 있다" 고 믿습니다 — 전형적인 조용한 고장입니다.
 *   두 모듈 어느 쪽 테스트도 이 관계를 안 봅니다.
 *
 * ── 또 한 자리 — 회원이 시간 단위를 직접 바꿨을 때 ─────────────────────
 *   js/chart-date-range.js 는 그 순간 기간 탭 불을 꺼야 합니다.
 *   그 판정이 ★남의 모듈의 class 이름★ 에 기대 있습니다 —
 *       t.closest("#interval-row .interval-btn") || t.closest(".tl-im-menu button")
 *   ".tl-im-menu" 는 js/interval-more.js 가 정하는 이름입니다. 저쪽이 이름을
 *   바꾸면 여기가 조용히 안 맞습니다. 그래서 아래 [3] 은 ★그 선택자를 코드에서
 *   뽑아 진짜 더보기 메뉴 단추에 대 봅니다.★ 글자만 확인하지 않습니다.
 *
 * ── 여기서 ★안 보는 것★ (두 벌 금지) ──────────────────────────────────
 *   · 기간 탭이 500봉(KLINE_LIMIT)을 넘는지, 시간대 기본값, 시간 단위 기억
 *     -> tests/chart-bottombar.test.js 한 곳입니다. 여기서 또 재지 않습니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 줄과 이 파일을 지우면 됩니다.
 *   사이트 코드는 한 글자도 건드리지 않습니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
const 실패목록 = [];
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + MARK_OK + " " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " -> " + 도움말 : ""));
    console.log("  " + MARK_NG + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }
function 읽기(f) { return fs.readFileSync(path.join(REPO, "js", f), "utf8"); }

/* =========================================================================
 * 화면 하나 — js/chart.js 가 그리는 시간 단위 줄을 그대로 흉내 냅니다
 *   (js/chart.js:137 renderIntervalButtons 의 마크업과 같은 모양)
 * ========================================================================= */
function 띄우기(옵션) {
  옵션 = 옵션 || {};
  const dom = new JSDOM(
    "<!doctype html><html><body>" +
      "<div class=\"interval-row page-center\" id=\"interval-row\"></div>" +
      "<div class=\"chart-panel\"><div class=\"tlc-body\">" +
      "<div class=\"chart-wrap\"><div id=\"chart_container\"></div></div></div></div>" +
      "</body></html>",
    { runScripts: "outside-only", url: "https://example.test/" }
  );
  const win = dom.window;
  win.innerWidth = 옵션.width || 1440;
  win.innerHeight = 옵션.height || 900;
  const 지연 = [];
  win.setInterval = function (fn) { fn(); return 0; };
  win.clearInterval = function () {};
  win.setTimeout = function (fn) { 지연.push(fn); return 지연.length; };
  win.clearTimeout = function () {};
  win.requestAnimationFrame = undefined;
  win.fetch = undefined;

  /* js/config.js 를 그대로 태웁니다 — 간격 목록을 베끼지 않으려고 */
  win.App = {};
  win.eval(읽기("config.js"));

  let 활성 = "1m";
  const 원래setActive = win.App.Config.setActiveInterval;
  const 눌린것 = [];
  win.App.Config.getActiveInterval = function () { return 활성; };
  win.App.Config.setActiveInterval = function (v) {
    활성 = v;
    눌린것.push(v);
    if (typeof 원래setActive === "function") { try { 원래setActive(v); } catch (e) { /* 무시 */ } }
    return v;
  };
  const 듣는이 = {};
  win.App.Bus = {
    on: function (n, f) { (듣는이[n] = 듣는이[n] || []).push(f); },
    emit: function (n, p) { (듣는이[n] || []).forEach(function (f) { f(p); }); }
  };
  win.App.Storage = {
    load: function (k, d) { return d; },
    save: function () {}
  };

  /* js/chart.js 가 하는 일 — 간격 버튼 16개를 그립니다 */
  const row = win.document.getElementById("interval-row");
  win.App.Config.getIntervals().forEach(function (iv) {
    const b = win.document.createElement("button");
    b.className = "interval-btn" + (iv.value === 활성 ? " active" : "");
    b.setAttribute("data-interval", iv.value);
    b.textContent = iv.label;
    b.addEventListener("click", function () {
      win.App.Config.setActiveInterval(iv.value);
      win.App.Bus.emit("interval:change", { interval: iv.value });
    });
    row.appendChild(b);
  });

  win.eval(읽기("interval-more.js"));
  const ev = win.document.createEvent("Event");
  ev.initEvent("DOMContentLoaded", true, true);
  win.document.dispatchEvent(ev);
  지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });

  return {
    win: win, dom: dom, row: row, 눌린것: 눌린것, 지연: 지연,
    IM: win.App.IntervalMore,
    Config: win.App.Config,
    지금간격: function () { return 활성; },
    스타일글: function () {
      const ss = win.document.querySelectorAll("style");
      let out = "";
      for (let i = 0; i < ss.length; i++) out += ss[i].textContent + "\n";
      return out;
    },
    닫기: function () { dom.window.close(); }
  };
}

console.log("\n표시 기간 탭 <-> 시간 단위 (같은 버튼 줄을 세 모듈이 같이 씁니다)");

/* =========================================================================
 * [1] 표시 기간 탭이 쓰는 간격 중 몇 개가 더보기 안에 숨어 있나
 * ========================================================================= */
const DR소스 = 읽기("chart-date-range.js");
/* TABS 를 코드에서 읽어옵니다 — 이 모듈은 차트가 있어야 뜨므로 목록만 뽑습니다.
   ⚠️ 뽑은 개수가 0 이면 아래가 전부 헛검사이므로 그것부터 확인합니다. */
const 탭간격 = (function () {
  const 조각 = DR소스.slice(DR소스.indexOf("var TABS = ["), DR소스.indexOf("var off = false"));
  const out = [];
  const re = /interval:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(조각))) out.push(m[1]);
  return out;
})();

절("[1] 표시 기간 탭이 쓰는 봉 간격");
const t1 = 띄우기();
const 더보기목록 = t1.IM.getMore();
{
  ok("표시 기간 탭의 봉 간격을 읽어 왔다 (9개)", 탭간격.length === 9, 탭간격.join(","));
  ok("더보기 목록을 공개 API 로 읽어 왔다 (" + 더보기목록.length + "개)",
    더보기목록.length >= 7, 더보기목록.join(","));

  const 숨은것 = 탭간격.filter(function (v) { return 더보기목록.indexOf(v) >= 0; });
  console.log("      (실측 — 기간 탭 " + 탭간격.length + "개 중 " + 숨은것.length +
    "개가 더보기 안에 숨은 간격입니다: " + Array.from(new Set(숨은것)).join(",") + ")");
  ok("기간 탭 중 더보기에 숨은 간격을 쓰는 것이 실제로 있다 (없으면 이 파일이 헛검사)",
    숨은것.length >= 1, 숨은것.join(","));

  ok("기간 탭이 쓰는 간격이 전부 js/config.js 목록 안에 있다",
    탭간격.every(function (v) {
      return t1.Config.getIntervals().some(function (iv) { return iv.value === v; });
    }),
    탭간격.filter(function (v) {
      return !t1.Config.getIntervals().some(function (iv) { return iv.value === v; });
    }).join(","));
}

/* =========================================================================
 * [2] 더보기는 버튼을 ★가리기만★ 한다 — 지우면 기간 탭이 조용히 죽습니다
 * ========================================================================= */
절("[2] 더보기가 버튼을 지우지 않고 가리기만 한다");
{
  const 전체 = t1.Config.getIntervals().map(function (iv) { return iv.value; });
  const 남은버튼 = Array.prototype.map.call(
    t1.row.querySelectorAll(".interval-btn[data-interval]"),
    function (b) { return b.getAttribute("data-interval"); }
  );
  ok("버튼이 하나도 안 사라졌다 (" + 남은버튼.length + "개 / 간격 " + 전체.length + "개)",
    전체.every(function (v) { return 남은버튼.indexOf(v) >= 0; }),
    전체.filter(function (v) { return 남은버튼.indexOf(v) < 0; }).join(","));

  const css = t1.스타일글();
  const 안가린것 = 더보기목록.filter(function (v) {
    return css.indexOf('.interval-btn[data-interval="' + v + '"]') < 0;
  });
  ok("더보기로 옮긴 것은 CSS 로 가린다 (display:none)",
    안가린것.length === 0 && /display:none/.test(css), 안가린것.join(","));

  /* 표시 기간 탭이 하는 그대로 — 숨은 버튼을 프로그램으로 눌러 봅니다 */
  const 못누른것 = [];
  탭간격.forEach(function (v) {
    const b = t1.row.querySelector('.interval-btn[data-interval="' + v + '"]');
    if (!b) { 못누른것.push(v + ":버튼없음"); return; }
    b.click();
    if (t1.지금간격() !== v) 못누른것.push(v + ":눌러도 안 바뀜(" + t1.지금간격() + ")");
  });
  ok("기간 탭 9개가 쓰는 간격 버튼을 전부 대신 누를 수 있다",
    못누른것.length === 0, 못누른것.join(" / "));

  ok("대신 누른 횟수가 기간 탭 수와 같다 (" + t1.눌린것.length + "회)",
    t1.눌린것.length === 탭간격.length, t1.눌린것.join(","));
}

/* =========================================================================
 * [3] 회원이 더보기에서 고르면 기간 탭 불이 꺼져야 한다
 *   그 판정에 쓰는 선택자를 ★코드에서 뽑아 진짜 메뉴 단추에 대 봅니다.★
 * ========================================================================= */
절("[3] 기간 탭이 듣는 선택자가 진짜 더보기 메뉴와 맞는다");
{
  /* 설명글은 빼고 진짜 코드에서만 뽑습니다 */
  const DR코드 = DR소스.replace(/[/][*][^]*?[*][/]/g, "");
  const 선택자들 = [];
  const re = /closest\(\s*"([^"]+)"\s*\)/g;
  let m;
  while ((m = re.exec(DR코드))) 선택자들.push(m[1]);
  ok("기간 탭 코드에서 선택자를 뽑았다 (" + 선택자들.length + "개)",
    선택자들.length >= 2, 선택자들.join(" | "));

  t1.IM.open();
  const 메뉴 = t1.win.document.querySelector("[role=\"menu\"]");
  ok("더보기 메뉴가 실제로 열렸다", !!메뉴);
  const 메뉴단추 = 메뉴 ? 메뉴.querySelector("button[data-im]") : null;
  ok("메뉴 안에 고를 단추가 있다", !!메뉴단추, 메뉴 && 메뉴.innerHTML.slice(0, 80));

  const 맞는것 = 선택자들.filter(function (sel) {
    try { return !!(메뉴단추 && 메뉴단추.closest(sel)); } catch (e) { return false; }
  });
  ok("뽑은 선택자 중 하나가 ★진짜 메뉴 단추★ 를 잡는다 (이름이 어긋나면 여기서 터집니다)",
    맞는것.length >= 1,
    "뽑은 것: " + 선택자들.join(" | ") + " / 메뉴 class=" + (메뉴 && 메뉴.className));

  /* 줄에 있는 보통 버튼도 잡아야 합니다 */
  const 줄버튼 = t1.row.querySelector(".interval-btn[data-interval]");
  const 줄맞는것 = 선택자들.filter(function (sel) {
    try { return !!(줄버튼 && 줄버튼.closest(sel)); } catch (e) { return false; }
  });
  ok("뽑은 선택자 중 하나가 ★버튼 줄의 보통 버튼★ 도 잡는다",
    줄맞는것.length >= 1, 선택자들.join(" | "));

  /* 그리고 실제로 눌러 봤을 때 간격이 바뀌어야 합니다 (죽은 단추가 아님) */
  if (메뉴단추) {
    const 값 = 메뉴단추.getAttribute("data-im");
    메뉴단추.click();
    t1.지연.splice(0).forEach(function (f) { try { f(); } catch (e) { /* 무시 */ } });
    ok("더보기에서 고르면 그 간격으로 바뀐다 (" + 값 + ")",
      t1.지금간격() === 값, t1.지금간격());
  }
}

/* =========================================================================
 * [4] 대문자 M 과 소문자 m — 한 글자 차이로 한 달과 1분이 뒤바뀝니다
 * ========================================================================= */
절("[4] 1M(한 달)과 1m(1분)을 안 헷갈린다");
{
  const t = 띄우기();
  const 큰M = t.row.querySelector('.interval-btn[data-interval="1M"]');
  const 작은m = t.row.querySelector('.interval-btn[data-interval="1m"]');
  ok("두 버튼이 따로 있다", !!큰M && !!작은m && 큰M !== 작은m);
  ok("이름이 다르다 (" + (큰M && 큰M.textContent) + " / " + (작은m && 작은m.textContent) + ")",
    !!큰M && !!작은m && 큰M.textContent !== 작은m.textContent);
  ok("더보기가 숨기는 것은 대문자 1M 뿐이다 (1분은 줄에 남아 있어야 합니다)",
    t.IM.getMore().indexOf("1M") >= 0 && t.IM.getMore().indexOf("1m") < 0,
    t.IM.getMore().join(","));
  const css = t.스타일글();
  ok("가리는 CSS 도 대문자 1M 만 겨눈다",
    css.indexOf('data-interval="1M"') >= 0 && css.indexOf('data-interval="1m"') < 0,
    "1m 까지 가리면 회원이 1분봉을 못 고릅니다");
  if (큰M) 큰M.click();
  ok("대문자 1M 을 누르면 한 달이 된다", !!큰M && t.지금간격() === "1M",
    큰M ? t.지금간격() : "1M 버튼이 아예 없습니다");
  t.닫기();
}

/* =========================================================================
 * [5] 등록
 * ========================================================================= */
절("[5] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-period-interval-cross-seal.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌립니다");
  const 나 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", 나.indexOf("되돌리는 방법") >= 0);
}

t1.닫기();

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n  실패한 것:");
  실패목록.forEach(function (s) { console.log("   - " + s); });
}
process.exit(fail ? 1 : 0);
