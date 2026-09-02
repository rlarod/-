/* tests/chart-alert-bulk-guard-seal.test.js
 * =========================================================================
 * ★그린 것 목록의 「전체」 단추들이 알람을 건드리지 않는다★
 *   전체 숨김 · 전체 잠금 · 전체 지우기 · 되돌리기(Ctrl+Z)
 *   + 놓친 교차 되찾기가 아직 도는가
 * =========================================================================
 * 2026-09-03 · 기록팀
 *
 * ── 왜 만드나 ─────────────────────────────────────────────────────────
 * 알람은 ★회원 돈에 닿습니다.★ 2026-09-02 14차에 P1 이 하나 났습니다 —
 * 다른 종목을 보는 동안 알람이 조용히 멈춰서, 그 사이 지나간 교차는 돌아와도
 * 영영 사라졌습니다. 오류 0건. 회원은 ★"안 울렸다 = 값이 안 닿았다"★ 로 읽습니다.
 *
 * 그 뒤 16차에 「그린 것 목록」 이 생기면서 ★전체 숨김 · 전체 잠금 ·
 * 전체 지우기★ 라는 한 번에 다 바꾸는 단추가 셋 생겼습니다.
 * 목록에는 알람도 칸을 갈라 같이 나옵니다. ★한 화면에 같이 있으니 다음에
 * 목록을 손보는 사람이 알람까지 같이 훑기 쉽습니다.★
 *
 *   숨긴 알람 = 안 보이는 알람 = 회원에게는 "없는 알람"
 *   잠긴 알람 = 못 지우는 알람 (그건 그나마 낫지만 뜻이 없습니다)
 *   지워진 알람 = ★안 울립니다★  ← 여기가 진짜 위험한 자리
 *
 * 셋 다 화면에 오류가 안 뜹니다. 전형적인 조용한 고장입니다.
 *
 * ── 이미 있는 봉인과 무엇이 다른가 (두 벌로 안 씁니다) ────────────────
 *   tests/chart-object-list-seal.test.js  [6]  알람 줄이 ★칸을 갈라 나오는가★ (화면)
 *   tests/chart-drawings.test.js          7-4  전체 지우기가 알람을 안 지우는가 (한 줄)
 *   ★이 파일★  「전체」 단추 ★넷 전부★ 를, 개수뿐 아니라 ★차트에 그은 알람 선★
 *              과 ★저장칸★ 까지 같이 봅니다. 개수만 보면 선만 사라진 고장을 놓칩니다.
 *
 * ── 어떻게 확인하나 ────────────────────────────────────────────────────
 * tests/_chart-drawings-boot.js 로 진짜 모듈을 태웁니다. 서버도 브라우저도
 * 안 부릅니다. 공개 API 와 실제 동작만 봅니다 — 줄 번호를 안 씁니다
 * (지금 수리팀이 js/chart-drawings.js 를 잡고 있습니다).
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ★사이트 코드는 한 글자도 안 건드립니다.★
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { 띄우기, SRC } = require("./_chart-drawings-boot.js");

const ESC = String.fromCharCode(27);
const OKM = ESC + "[32m" + "✓" + ESC + "[0m";
const NGM = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  " + OKM + " " + 제목); }
  else { fail++; console.log("  " + NGM + " " + 제목 + (도움말 ? "\n      -> " + 도움말 : "")); }
}
function 절(t) { console.log("\n" + t); }

console.log("\n「전체」 단추가 알람을 건드리지 않는가");

/* =====================================================================
 * [0] 준비 — 그림 셋 + 알람 둘을 얹는다
 * ===================================================================== */
const 알람가 = [79000, 78000];

function 차림(opts) {
  const t = 띄우기(opts);
  /* 그림 — 추세선 하나 · 수평선 하나 */
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("hline");
  t.톡(200, 150);
  t.M.setTool("cursor");
  알람가.forEach((p) => t.M.addAlert(p));
  return t;
}

/** 차트에 실제로 그어진 선 중 알람가에 있는 것 */
function 알람선가격(t) {
  return t.가격선().map((p) => p._o.price).filter((v) => 알람가.indexOf(v) >= 0).sort();
}
/** 저장칸에 남아 있는 알람 개수 */
function 저장알람수(t) {
  const a = t.저장소["chart-alerts"];
  if (!a || !a.bySymbol) return -1;
  let n = 0;
  Object.keys(a.bySymbol).forEach((s) => { n += (a.bySymbol[s] || []).length; });
  return n;
}

절("[0] 준비 — 그림 3개 · 알람 2개");
{
  const t = 차림();
  ok("그림이 2개 (추세선 · 수평선)", t.도형().length + t.가로선().length === 2,
    t.도형().length + " + " + t.가로선().length);
  ok("알람이 2개 걸렸다", t.M.getAlertCount() === 2, String(t.M.getAlertCount()));
  ok("★알람은 그림 목록에 안 섞인다★ (목록 " + t.M.getListItems().length + "줄)",
    t.M.getListItems().length === 2, String(t.M.getListItems().length));
  ok("차트에 알람 선 2줄이 실제로 그어졌다 (" + 알람선가격(t).join(" · ") + ")",
    알람선가격(t).length === 2, JSON.stringify(t.가격선().map((p) => p._o.price)));
  ok("저장칸(chart-alerts)에도 2개 있다", 저장알람수(t) === 2, String(저장알람수(t)));
  ok("알람 저장칸은 그림 저장칸과 다르다 (탭 두 개일 때 알람만 다시 읽으려고)",
    t.M.ALERT_KEY !== t.M.STORAGE_KEY && !!t.저장소[t.M.ALERT_KEY] && !!t.저장소[t.M.STORAGE_KEY],
    t.M.ALERT_KEY + " vs " + t.M.STORAGE_KEY);
  t.닫기();
}

/* =====================================================================
 * [1] ★전체 숨김★ — 숨긴 알람은 「안 울렸다」 로 읽힙니다
 * ===================================================================== */
절("[1] 전체 숨김 — 그림만 숨고 알람은 그대로 보인다");
{
  const t = 차림();
  const 전선 = 알람선가격(t);
  const 켜짐 = t.M.toggleHideAll();

  ok("전체 숨김이 실제로 걸렸다 (그림 " + t.M.getHiddenCount() + "개 숨김)",
    켜짐 === true && t.M.getHiddenCount() === 2, "숨김 " + t.M.getHiddenCount());
  ok("★알람 개수가 그대로다★ (2개)", t.M.getAlertCount() === 2, String(t.M.getAlertCount()));
  ok("★차트에 그은 알람 선이 그대로 남는다★ (" + 알람선가격(t).join(" · ") + ")",
    알람선가격(t).join(",") === 전선.join(","),
    "숨었습니다 — 회원 화면에서 알람이 사라져 「안 울렸다」 로 읽힙니다: " +
    JSON.stringify(t.가격선().map((p) => p._o.price)));
  ok("★알람에 숨김 표가 안 붙는다★",
    t.M.getAlerts().every((a) => !a.h), JSON.stringify(t.M.getAlerts()));
  ok("저장칸의 알람도 그대로다", 저장알람수(t) === 2, String(저장알람수(t)));

  /* 다시 보이기 — 되돌려도 알람이 두 벌이 되거나 사라지지 않아야 합니다 */
  const 껐다 = t.M.toggleHideAll();
  ok("다시 누르면 그림이 도로 보인다", 껐다 === false && t.M.getHiddenCount() === 0,
    String(t.M.getHiddenCount()));
  ok("되돌려도 알람 선이 두 벌이 안 된다", 알람선가격(t).join(",") === 전선.join(","),
    JSON.stringify(t.가격선().map((p) => p._o.price)));
  t.닫기();
}

/* =====================================================================
 * [2] ★전체 잠금★
 * ===================================================================== */
절("[2] 전체 잠금 — 그림만 잠기고 알람은 그대로");
{
  const t = 차림();
  const 켜짐 = t.M.toggleLockAll();
  ok("전체 잠금이 실제로 걸렸다 (그림 " + t.M.getLockedCount() + "개 잠김)",
    켜짐 === true && t.M.getLockedCount() === 2, "잠금 " + t.M.getLockedCount());
  ok("★알람 개수가 그대로다★", t.M.getAlertCount() === 2, String(t.M.getAlertCount()));
  ok("★알람에 잠금 표가 안 붙는다★ (붙으면 목록의 [지움] 이 뜻을 잃습니다)",
    t.M.getAlerts().every((a) => !a.l), JSON.stringify(t.M.getAlerts()));
  ok("잠긴 상태에서도 알람 선이 그대로다", 알람선가격(t).length === 2,
    JSON.stringify(t.가격선().map((p) => p._o.price)));

  /* 잠갔어도 알람은 목록에서 지울 수 있어야 합니다 — 알람은 그림이 아닙니다 */
  const 하나 = t.M.getAlerts()[0].id;
  t.M.toggleList();
  const 창 = t.목록창();
  const 알람줄 = 창.querySelectorAll(".row.al");
  ok("잠긴 뒤에도 목록에 알람 줄이 " + 알람줄.length + "개 나온다", 알람줄.length === 2,
    String(알람줄.length));
  t.누르기(알람줄[0].querySelector("button"));
  ok("★전체 잠금 뒤에도 알람은 지울 수 있다★ (그림이 아니니까)",
    t.M.getAlertCount() === 1, String(t.M.getAlertCount()));
  ok("지운 알람의 선만 사라진다", 알람선가격(t).length === 1,
    JSON.stringify(t.가격선().map((p) => p._o.price)));
  ok("그림은 그대로 2개 · 잠긴 채", t.도형().length + t.가로선().length === 2 &&
    t.M.getLockedCount() === 2, "그림 " + (t.도형().length + t.가로선().length));
  void 하나;
  t.닫기();
}

/* =====================================================================
 * [3] ★전체 지우기★ — 여기가 제일 위험한 자리
 * ===================================================================== */
절("[3] 전체 지우기 — 그림만 지우고 알람은 통째로 남는다");
{
  const t = 차림();
  t.M.clearAll();
  ok("안 잠근 그림은 전부 사라진다", t.도형().length + t.가로선().length === 0,
    "남음 " + (t.도형().length + t.가로선().length));
  ok("★알람 2개가 통째로 남는다★", t.M.getAlertCount() === 2, String(t.M.getAlertCount()));
  ok("★알람 선도 2줄 그대로 남는다★ (" + 알람선가격(t).join(" · ") + ")",
    알람선가격(t).length === 2,
    "선이 사라졌습니다 — 회원은 알람이 없어진 줄 압니다: " +
    JSON.stringify(t.가격선().map((p) => p._o.price)));
  ok("저장칸의 알람도 2개 그대로", 저장알람수(t) === 2, String(저장알람수(t)));
  t.닫기();
}
{
  /* 잠긴 그림이 섞여 있어도 마찬가지 — 잠금과 알람은 서로 다른 이유로 남습니다 */
  const t = 차림();
  t.M.toggleLockAll();
  t.M.clearAll();
  ok("잠근 그림은 전체 지우기에도 남는다 (잠금이 뜻이 있으려면)",
    t.도형().length + t.가로선().length === 2, "남음 " + (t.도형().length + t.가로선().length));
  ok("그때도 알람 2개가 남는다", t.M.getAlertCount() === 2, String(t.M.getAlertCount()));
  t.닫기();
}

/* =====================================================================
 * [4] ★되돌리기(Ctrl+Z)★ — 알람은 되돌리기 대상이 아니다
 *
 * 걸어 둔 알람이 Ctrl+Z 로 조용히 사라지면 회원은 "안 울렸다 = 값이 안 닿았다"
 * 로 읽습니다. 그래서 알람은 아예 되돌리기 대상에서 뺐습니다(저장칸도 따로).
 * ===================================================================== */
절("[4] 되돌리기 · 다시하기 — 알람을 안 건드린다");
{
  const t = 차림();
  const 전 = t.M.getAlertCount();
  const 전선 = 알람선가격(t);
  const 깊이 = t.M.getUndoDepth();
  ok("되돌릴 것이 쌓여 있다 (" + 깊이 + "단계)", 깊이 > 0, String(깊이));

  /* 있는 만큼 다 되돌립니다 — 한 번만 눌러 보고 넘어가면 「마지막 한 번」 을 놓칩니다 */
  for (let i = 0; i < 깊이 + 3; i++) t.M.undo();
  ok("그림은 되돌려져 사라진다", t.도형().length + t.가로선().length === 0,
    "남음 " + (t.도형().length + t.가로선().length));
  ok("★끝까지 되돌려도 알람 " + 전 + "개가 그대로다★", t.M.getAlertCount() === 전,
    String(t.M.getAlertCount()));
  ok("★알람 선도 그대로다★", 알람선가격(t).join(",") === 전선.join(","),
    JSON.stringify(t.가격선().map((p) => p._o.price)));

  for (let i = 0; i < 깊이 + 3; i++) t.M.redo();
  ok("다시하기로 그림이 돌아온다", t.도형().length + t.가로선().length === 2,
    "지금 " + (t.도형().length + t.가로선().length));
  ok("★다시하기도 알람을 안 건드린다★ (두 벌이 되지도 않습니다)",
    t.M.getAlertCount() === 전 && 알람선가격(t).join(",") === 전선.join(","),
    t.M.getAlertCount() + " / " + JSON.stringify(알람선가격(t)));
  t.닫기();
}
{
  /* 진짜 자판으로도 확인합니다 — 위는 함수를 직접 불렀습니다.
     자판 길에만 알람이 딸려 들어가는 경우를 못 보면 안 됩니다. */
  const t = 차림();
  const 전 = t.M.getAlertCount();
  const K = (key, opts) => {
    const ev = new t.win.KeyboardEvent("keydown",
      Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}));
    t.win.document.dispatchEvent(ev);
  };
  K("z", { ctrlKey: true });
  K("z", { ctrlKey: true });
  ok("Ctrl+Z 자판으로도 그림이 되돌려진다",
    t.도형().length + t.가로선().length < 2, "지금 " + (t.도형().length + t.가로선().length));
  ok("★Ctrl+Z 자판 길로도 알람이 안 사라진다★", t.M.getAlertCount() === 전,
    String(t.M.getAlertCount()));
  t.닫기();
}

/* =====================================================================
 * [5] ★놓친 교차 되찾기가 아직 도는가★ (14차 P1 의 되돌아감 방지)
 * ===================================================================== */
절("[5] 놓친 교차 되찾기 — 자리를 비운 사이 지나간 값을 되찾는다");
{
  const t = 띄우기();
  t.M.setTool("cursor");
  t.M.addAlert(79000);

  /* 세 시간 전에 걸어 두고 그동안 이 종목을 안 봤다고 칩니다.
     ⚠️ 시간을 빠듯하게 잡으면 전체를 한꺼번에 돌릴 때 흔들립니다 — 넉넉히 잡습니다. */
  const 세시간 = 3 * 60 * 60 * 1000;
  const 옛 = Date.now() - 세시간;
  t.M.getAlerts()[0].at = 옛;
  t.M.markSeenForTest("BTCUSDT", 옛);

  const 부른것 = [];
  t.win.App.Api = {
    fetchKlines: function (s, iv, lim) { 부른것.push({ 종목: s, 간격: iv, 개수: lim }); return Promise.resolve([]); }
  };
  /* 되찾기는 잠깐 뒤에 돕니다(catchUpSoon). 가짜 창의 setTimeout 은 아무것도
     안 하므로, 여기서만 「바로 돌게」 바꿔 끼웁니다. */
  t.win.setTimeout = function (fn) { fn(); return 1; };
  t.win.clearTimeout = function () {};

  t.종목바꾸기("BTCUSDT");
  ok("★자리를 비운 뒤 돌아오면 지난 봉을 실제로 받아 온다★ (" +
    (부른것[0] ? 부른것[0].종목 + " " + 부른것[0].간격 + " " + 부른것[0].개수 + "개" : "안 불렀습니다") + ")",
    부른것.length === 1,
    "App.Api.fetchKlines 를 안 불렀습니다 — ★14차에 막은 P1 이 되돌아갔습니다★");
  ok("종목 · 봉간격 · 개수 세 가지만 넘긴다 (회원 정보 0)",
    부른것.length === 1 && Object.keys(부른것[0]).length === 3 &&
    부른것[0].종목 === "BTCUSDT" && typeof 부른것[0].개수 === "number",
    JSON.stringify(부른것[0]));

  /* 세 시간이면 어느 봉으로 훑는지 — 구간표에서 고릅니다(숫자를 안 적습니다) */
  const 층 = t.M.catchTier(세시간 / 60000);
  ok("세 시간 비운 것은 " + 층.iv + " 봉으로 훑는다 (구간표에서 고름)",
    !!층 && 부른것[0].간격 === 층.iv, JSON.stringify(층));
  ok("한 번에 받는 봉 수가 상한(" + t.M.CATCHUP.limit + ") 안이다",
    부른것[0].개수 <= t.M.CATCHUP.limit, String(부른것[0].개수));
  t.닫기();
}
{
  /* 되찾은 교차는 ★늦음★ 이라고 표시합니다 — 지금 울린 것과 가려야 합니다 */
  const t = 띄우기();
  t.M.setTool("cursor");
  const a = t.M.addAlert(79000);
  const 옛 = Date.now() - 3 * 60 * 60 * 1000;
  t.M.getAlerts()[0].at = 옛;
  const 봉 = [{ time: Math.floor(옛 / 1000) + 600, open: 78000, high: 80000, low: 77000, close: 79500 }];
  const 늦은것 = t.M.applyCatchUpForTest("BTCUSDT", 봉, 옛 - 1000, false);
  ok("지나간 봉을 훑어 놓친 교차를 찾아낸다 (" + (늦은것 || []).length + "개)",
    (늦은것 || []).length === 1, JSON.stringify(늦은것));
  const 뒤 = t.M.getAlerts()[0];
  ok("★되찾은 것은 「늦음」 이라고 적는다★ (지금 울린 것과 가리려고)",
    t.M.alertTitleForTest(뒤) === "알람 울림(늦음)", t.M.alertTitleForTest(뒤));
  ok("한 번 울린 알람은 다시 안 울린다", 뒤.done === true, JSON.stringify(뒤));
  void a;
  t.닫기();
}

/* =====================================================================
 * [6] ⭐⭐ 돌연변이 — 위 검사들이 진짜로 무는가
 *
 * ★원본 파일은 한 글자도 안 건드립니다.★ 소스를 읽어 ★사본만★ 고쳐서
 * 태웁니다(tests/_chart-drawings-boot.js 가 그러라고 opts.소스 를 내줍니다).
 * ⚠️ 지금 수리팀이 js/chart-drawings.js 를 잡고 있습니다 — 파일을 만지면 안 됩니다.
 * ===================================================================== */
절("[6] 돌연변이 — 일부러 알람까지 건드리게 만들면 위가 빨개지는가");

function 사본(바꾸기) {
  const s = 바꾸기(SRC);
  if (s === SRC) return null; /* 바꿀 자리를 못 찾았습니다 */
  return s;
}

{
  /* ㉠ 전체 지우기가 알람까지 지우게 만든다 */
  const 고침 = 사본((s) => s.replace(
    "  function clearAll() {\n    pushUndo();",
    "  function clearAll() {\n    pushUndo();\n    alertList().length = 0; clearAlertLines(); saveAlerts();"
  ));
  ok("돌연변이 ㉠ 을 만들 자리를 찾았다 (clearAll)", !!고침,
    "clearAll 의 첫 줄 모양이 바뀌었습니다 — 이 돌연변이를 다시 맞춰야 합니다");
  if (고침) {
    let 결과 = null;
    try {
      const t = 차림({ 소스: 고침 });
      t.M.clearAll();
      결과 = { 알람: t.M.getAlertCount(), 선: 알람선가격(t).length };
      t.닫기();
    } catch (e) { 결과 = { 오류: String(e.message || e) }; }
    ok("★전체 지우기가 알람을 지우게 하면 [3] 이 빨개진다★ (" + JSON.stringify(결과) + ")",
      !!결과 && !결과.오류 && 결과.알람 === 0,
      "안 지워졌습니다 — [3] 이 무엇을 지키는지 다시 봐야 합니다: " + JSON.stringify(결과));
  }
}

{
  /* ㉡ 전체 숨김이 알람 선까지 걷어가게 만든다.
     ★개수는 그대로인데 선만 사라지는★ 고장입니다 — 개수만 세는 검사는 이걸 놓칩니다. */
  const 고침 = 사본((s) => s.replace(
    "  function toggleHideAll() {\n    var on = toggleAllFlag(\"h\");",
    "  function toggleHideAll() {\n    var on = toggleAllFlag(\"h\");\n    if (on) clearAlertLines();"
  ));
  ok("돌연변이 ㉡ 을 만들 자리를 찾았다 (toggleHideAll)", !!고침,
    "toggleHideAll 의 모양이 바뀌었습니다 — 이 돌연변이를 다시 맞춰야 합니다");
  if (고침) {
    let 결과 = null;
    try {
      const t = 차림({ 소스: 고침 });
      t.M.toggleHideAll();
      결과 = { 알람: t.M.getAlertCount(), 선: 알람선가격(t).length };
      t.닫기();
    } catch (e) { 결과 = { 오류: String(e.message || e) }; }
    ok("★알람 선만 걷어가면 [1] 의 「선이 그대로」 가 빨개진다★ (" + JSON.stringify(결과) + ")",
      !!결과 && !결과.오류 && 결과.알람 === 2 && 결과.선 === 0,
      "개수는 그대로인데 선만 사라지는 고장을 못 잡습니다: " + JSON.stringify(결과));
  }
}

{
  /* ㉢ 되돌리기가 알람까지 되돌리게 만든다 */
  const 고침 = 사본((s) => s.replace(
    "  function restoreDraw(str) {\n    var o;",
    "  function restoreDraw(str) {\n    alertList().length = 0; clearAlertLines(); saveAlerts();\n    var o;"
  ));
  ok("돌연변이 ㉢ 을 만들 자리를 찾았다 (restoreDraw)", !!고침,
    "restoreDraw 의 모양이 바뀌었습니다 — 이 돌연변이를 다시 맞춰야 합니다");
  if (고침) {
    let 결과 = null;
    try {
      const t = 차림({ 소스: 고침 });
      t.M.undo();
      결과 = { 알람: t.M.getAlertCount() };
      t.닫기();
    } catch (e) { 결과 = { 오류: String(e.message || e) }; }
    ok("★Ctrl+Z 가 알람을 지우게 하면 [4] 가 빨개진다★ (" + JSON.stringify(결과) + ")",
      !!결과 && !결과.오류 && 결과.알람 === 0,
      "안 지워졌습니다: " + JSON.stringify(결과));
  }
}

{
  /* ㉣ 되찾기를 끊는다 — [5] 가 반드시 빨개져야 합니다 */
  const 고침 = 사본((s) => s.replace(/\n(\s*)catchUpSoon\(\);/g, "\n$1/* 끊음 */"));
  ok("돌연변이 ㉣ 를 만들 자리를 찾았다 (catchUpSoon 호출)", !!고침,
    "catchUpSoon 을 부르는 자리가 없어졌습니다 — 그 자체가 [5] 의 되돌아감입니다");
  if (고침) {
    let 부른수 = -1;
    try {
      const t = 띄우기({ 소스: 고침 });
      t.M.setTool("cursor");
      t.M.addAlert(79000);
      const 옛 = Date.now() - 3 * 60 * 60 * 1000;
      t.M.getAlerts()[0].at = 옛;
      t.M.markSeenForTest("BTCUSDT", 옛);
      const 부른것 = [];
      t.win.App.Api = { fetchKlines: function () { 부른것.push(1); return Promise.resolve([]); } };
      t.win.setTimeout = function (fn) { fn(); return 1; };
      t.win.clearTimeout = function () {};
      t.종목바꾸기("BTCUSDT");
      부른수 = 부른것.length;
      t.닫기();
    } catch (e) { 부른수 = -2; }
    ok("★되찾기를 끊으면 봉을 안 받아 온다 — [5] 가 빨개진다★ (호출 " + 부른수 + "번)",
      부른수 === 0,
      "끊었는데도 불렀습니다 — [5] 가 다른 길을 보고 있거나 검사가 헛돕니다");
  }
}

/* =====================================================================
 * [7] 등록
 * ===================================================================== */
절("[7] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-alert-bulk-guard-seal.test.js") >= 0,
    "등록 안 하면 아무도 안 돌립니다");
  ok("되돌리는 방법이 이 파일 맨 위에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리는 방법") > 0);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
