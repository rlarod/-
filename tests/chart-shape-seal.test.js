/* tests/chart-shape-seal.test.js
 * =========================================================================
 * 수직선 · 사각형 · 화살표 (18차 2026-09-03 · 차트팀)
 * =========================================================================
 * 조사팀 아침 격차표 [A] — "트레이딩뷰에는 다 있고 우리에겐 없습니다".
 * 가장 기본인 도형 셋을 열었습니다. 이 파일은 그것이 되돌아가지 않게 못 박습니다.
 *
 * ── 여기서 못 박는 것 ───────────────────────────────────────────────────
 *   [1] 도구 셋이 표에 있고, 아이콘이 디자인팀 스프라이트에 있고,
 *       ★색을 새로 만들지 않았다★ (DRAW_COLORS 8색 그대로)
 *   [2] 수직선 — 한 번 톡. 판 높이만큼 세로로. 종목 + 봉 간격별로 저장.
 *       ★수평선(가격만 씀 · 종목별)과 저장 자리가 다릅니다★
 *   [3] 사각형 — 두 번 톡. 손잡이 여덟(모서리 4 + 변 4).
 *       변 손잡이는 한 쪽만 바꿉니다. 뒤집어 그려도 같은 자리에 그립니다.
 *   [4] 화살표 — 두 번 톡. ★뒤에 찍은 점★ 에 머리가 붙습니다.
 *   [5] 잡는 반경 — 손가락 22px · 마우스 8px 이 새 도형에도 그대로.
 *       (어제 만든 끌어 옮기기와 같은 기준. 새 도형만 안 잡히면 회원이 헷갈립니다)
 *   [6] 되돌리기(Ctrl+Z) · 그린 것 목록 · 잠금 · 숨김에 셋 다 들어간다
 *   [7] 새 도형은 화면에 창을 띄우지 않는다
 *       (어젯밤 창 세 개가 아래쪽 방어 없이 나갔습니다 — 아예 창을 안 만드는 것이
 *        가장 확실한 방어라, "안 만들었다" 를 못 박아 둡니다)
 *   [8] 되돌리는 방법이 소스에 적혀 있다 · 이 파일이 _order.txt 에 있다
 *   [9] ★돌연변이★ — 장치를 빼면 반드시 빨개진다
 *
 * 가짜 차트 · 가짜 저장소만 씁니다. 서버도 브라우저도 부르지 않습니다.
 * tests/ 밖은 js/chart-drawings.js 와 assets/icons/chart-tools.svg 를 ★읽기만★ 합니다.
 *
 * ── 되돌리는 방법 ─────────────────────────────────────────────────────
 * tests/_order.txt 의 등록 줄과 이 파일을 지우면 끝입니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { 띄우기, SRC } = require("./_chart-drawings-boot.js");
const 잠긴해시 = require("./_locked-hashes.js");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SPRITE = fs.readFileSync(path.join(REPO, "assets", "icons", "chart-tools.svg"), "utf8");

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

console.log("\n수직선 · 사각형 · 화살표");

/* =========================================================================
 * [0] 수정 금지 파일을 안 건드렸다
 * ========================================================================= */
절("[0] 수정 금지 파일 그대로");
{
  const 기준 = 잠긴해시.BY_FILE;
  const 이름들 = Object.keys(기준).filter((k) => k.indexOf("js/") === 0);
  const 어긋남 = [];
  이름들.forEach(function (f) {
    const h = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    if (h !== 기준[f]) 어긋남.push(f);
  });
  ok("수정 금지 " + 이름들.length + "개가 그대로다", 어긋남.length === 0, 어긋남.join(", "));
}

/* =========================================================================
 * [1] 도구 표 · 아이콘 · 색
 * ========================================================================= */
절("[1] 도구 표 · 아이콘 · 색");
{
  const t = 띄우기();
  const 셋 = ["vline", "rect", "arrow"];
  const 왼쪽 = t.M.TOOLS.left.filter((x) => !x.sep && !x.spacer);

  셋.forEach(function (k) {
    const d = 왼쪽.filter((x) => x.k === k)[0];
    ok(k + " 가 세로 막대에 있다", !!d, "없음");
    ok(k + " 가 준비중이 아니다 (ready:true)", !!d && d.ready === true);
    ok(k + " 가 READY_TOOLS 에 있다", !!t.M.TOOLS.ready[k]);
    ok(k + " 아이콘이 디자인팀 스프라이트에 있다",
      !!d && SPRITE.indexOf("id=\"" + d.icon + "\"") !== -1, d ? d.icon : "");
    t.M.setTool("cursor");
    t.M.setTool(k);
    ok(k + " 가 실제로 켜진다", t.M.getTool() === k, t.M.getTool());
  });

  ok("사각형·화살표는 두 점 도구다 (TWO_POINT)",
    !!t.M.TOOLS.twoPoint.rect && !!t.M.TOOLS.twoPoint.arrow);
  ok("수직선은 두 점 도구가 아니다 (한 번 톡)", !t.M.TOOLS.twoPoint.vline);

  /* 색을 새로 만들지 않았다 — 셋 다 지금 고른 색(기본 금색)으로 나옵니다 */
  t.M.setTool("vline");
  t.톡(120, 200);
  t.M.setTool("rect");
  t.톡(200, 100);
  t.톡(320, 260);
  t.M.setTool("arrow");
  t.톡(400, 300);
  t.톡(500, 300);
  const 쓰인색 = t.도형().map((s) => s.c);
  const 목록색 = t.M.DRAW_COLORS.map((c) => c.hex);
  ok("새 도형 셋이 전부 DRAW_COLORS 안의 색을 쓴다 (새 색을 안 만들었다)",
    쓰인색.length === 3 && 쓰인색.every((c) => 목록색.indexOf(c) !== -1), JSON.stringify(쓰인색));
  ok("사각형 안쪽 채움은 자(ruler) 상자와 같은 10% 다 (진하기를 두 벌로 안 만들었다)",
    t.M.RECT_FILL_A === 0.1, String(t.M.RECT_FILL_A));
  ok("채움색은 고른 색을 옅게 한 것이다 (금색으로 굳어 있지 않다)",
    t.M.fillOf("#BA94DB", 0.1) === "rgba(186,148,219,0.1)", t.M.fillOf("#BA94DB", 0.1));
  t.닫기();
}

/* =========================================================================
 * [2] 수직선
 * ========================================================================= */
절("[2] 수직선 - 한 번 톡 · 판 높이만큼");
{
  const t = 띄우기();
  t.M.setTool("vline");
  t.톡(120, 200);
  const s = t.도형()[0];
  ok("한 번 톡으로 생긴다", t.도형().length === 1, String(t.도형().length));
  ok("종류가 vline 이다", !!s && s.type === "vline", s && s.type);
  ok("시각을 저장한다", !!s && s.t === t.시각(120), s && String(s.t));
  ok("가격도 같이 저장한다 (손잡이 높이·통째로 옮기기가 씁니다)",
    !!s && typeof s.p === "number", s && String(s.p));

  const 획 = t.그리기()._기록;
  const 움직임 = 획.filter((e) => e.op === "move");
  const 선 = 획.filter((e) => e.op === "line");
  ok("세로로 긋는다 (x 가 같고 y 만 다르다)",
    움직임.length === 1 && 선.length === 1 && 움직임[0].x === 선[0].x && 움직임[0].y !== 선[0].y,
    JSON.stringify([움직임[0], 선[0]]));
  ok("판 높이(0~400) 끝까지 긋는다",
    움직임[0].y === 0 && 선[0].y === 400, JSON.stringify([움직임[0].y, 선[0].y]));
  ok("누른 자리의 x(120)에 긋는다", 움직임[0].x === 120, String(움직임[0].x));

  /* 저장 자리 — 수평선은 종목별, 수직선은 종목 + 봉 간격별 */
  const 통 = t.저장소["chart-drawings"].bySymbol.BTCUSDT;
  ok("수직선은 봉 간격 칸(byInterval)에 들어간다",
    통.byInterval["1m"].length === 1 && 통.byInterval["1m"][0].type === "vline",
    JSON.stringify(통.byInterval["1m"]));
  ok("수직선이 수평선 칸(hlines)에 들어가지 않는다", 통.hlines.length === 0,
    String(통.hlines.length));
  t.간격바꾸기("1h");
  ok("봉 간격을 바꾸면 그 봉의 것만 보인다 (1시간봉에는 없다)",
    t.도형().length === 0, String(t.도형().length));
  t.간격바꾸기("1m");
  ok("1분봉으로 돌아오면 그대로 있다", t.도형().length === 1, String(t.도형().length));
  t.닫기();
}

/* =========================================================================
 * [3] 사각형
 * ========================================================================= */
절("[3] 사각형 - 두 번 톡 · 손잡이 여덟");
{
  const t = 띄우기();
  t.M.setTool("rect");
  t.톡(200, 100);
  ok("한 번만 톡 하면 아직 안 생긴다", t.도형().length === 0, String(t.도형().length));
  t.톡(320, 260);
  const s = t.도형()[0];
  ok("두 번 톡 하면 생긴다", t.도형().length === 1 && s.type === "rect", s && s.type);

  const 기록 = t.그리기()._기록;
  const 네모 = 기록.filter((e) => e.op === "strokeRect")[0];
  const 채움 = 기록.filter((e) => e.op === "fillRect")[0];
  ok("두 점을 마주 보는 모서리로 네모를 그린다",
    !!네모 && 네모.x === 200 && 네모.y === 100 && 네모.w === 120 && 네모.h === 160,
    JSON.stringify(네모));
  ok("안쪽을 옅게 채운다", !!채움 && /^rgba\(/.test(채움.color), 채움 && 채움.color);
  ok("채움이 테두리보다 먼저다 (테두리를 덮지 않는다)",
    기록.findIndex((e) => e.op === "fillRect") < 기록.findIndex((e) => e.op === "strokeRect"));

  const 손잡이 = t.M.shapeHandles(s);
  ok("손잡이가 여덟 개다 (모서리 4 + 변 4)", 손잡이.length === 8,
    손잡이.map((h) => h.k).join(","));
  const 자리 = 손잡이.map((h) => h.k).sort().join(",");
  ok("모서리 넷 · 변 넷이 이름 그대로 있다", 자리 === "a,ab,b,ba,eA,eB,eL,eR", 자리);

  const 왼변 = 손잡이.filter((h) => h.k === "eL")[0];
  ok("왼쪽 변 손잡이는 두 점의 가운데 높이에 있다",
    Math.abs(왼변.p - (s.p1 + s.p2) / 2) < 1e-6, String(왼변.p));
  const 위변 = 손잡이.filter((h) => h.k === "eA")[0];
  ok("위 변 손잡이는 두 점의 가운데 시각에 있다",
    Math.abs(위변.t - (s.t1 + s.t2) / 2) < 1e-6, String(위변.t));

  /* 거꾸로 그려도 같은 네모 */
  const u = 띄우기();
  u.M.setTool("rect");
  u.톡(320, 260);
  u.톡(200, 100);
  const 거꾸로 = u.그리기()._기록.filter((e) => e.op === "strokeRect")[0];
  ok("거꾸로(오른아래 -> 왼위) 그려도 같은 자리에 그린다",
    !!거꾸로 && 거꾸로.x === 200 && 거꾸로.y === 100 && 거꾸로.w === 120 && 거꾸로.h === 160,
    JSON.stringify(거꾸로));
  u.닫기();

  /* 잡히는 곳 — 네 변. 안쪽은 안 잡습니다(큰 네모가 차트 끌기를 통째로 막습니다) */
  ok("위 변을 누르면 잡힌다", !!t.M.hitTestAt(260, 100));
  ok("아래 변을 누르면 잡힌다", !!t.M.hitTestAt(260, 260));
  ok("왼 변을 누르면 잡힌다", !!t.M.hitTestAt(200, 180));
  ok("오른 변을 누르면 잡힌다", !!t.M.hitTestAt(320, 180));
  ok("안쪽 한가운데는 안 잡힌다 (차트를 그대로 끌 수 있어야 합니다)",
    !t.M.hitTestAt(260, 180));
  t.닫기();
}

/* =========================================================================
 * [4] 화살표
 * ========================================================================= */
절("[4] 화살표 - 뒤에 찍은 점에 머리");
{
  const t = 띄우기();
  t.M.setTool("arrow");
  t.톡(400, 300);
  ok("한 번만 톡 하면 아직 안 생긴다", t.도형().length === 0, String(t.도형().length));
  t.톡(500, 300);
  const s = t.도형()[0];
  ok("두 번 톡 하면 생긴다", t.도형().length === 1 && s.type === "arrow", s && s.type);

  const 기록 = t.그리기()._기록;
  const 채움 = 기록.filter((e) => e.op === "fill");
  ok("머리를 색으로 채운다 (선만 긋고 끝내지 않는다)", 채움.length === 1, String(채움.length));

  /* 머리 삼각형 — 채우기 직전의 move/line 셋 */
  const 채움자리 = 기록.findIndex((e) => e.op === "fill");
  const 삼각 = 기록.slice(0, 채움자리).filter((e) => e.op === "move" || e.op === "line").slice(-3);
  ok("머리 꼭짓점이 뒤에 찍은 점(500,300)이다",
    삼각[0].x === 500 && 삼각[0].y === 300, JSON.stringify(삼각[0]));
  ok("머리가 먼저 찍은 점 쪽(왼쪽)으로 벌어진다",
    삼각[1].x < 500 && 삼각[2].x < 500, JSON.stringify([삼각[1].x, 삼각[2].x]));
  ok("머리가 선 위아래로 갈라진다", (삼각[1].y - 300) * (삼각[2].y - 300) < 0,
    JSON.stringify([삼각[1].y, 삼각[2].y]));

  const 머리길이 = Math.sqrt(Math.pow(500 - 삼각[1].x, 2) + Math.pow(300 - 삼각[1].y, 2));
  ok("기본 굵기 2px 에서 머리 길이가 12px 이다 (트레이딩뷰 화살표 실측값)",
    Math.abs(머리길이 - 12) < 0.001, 머리길이.toFixed(3) + "px");
  ok("머리 길이 값을 적은 곳이 한 곳뿐이다 (ARROW)",
    t.M.ARROW.head + t.M.ARROW.headPerWidth * 2 === 12,
    JSON.stringify(t.M.ARROW));

  const 손잡이 = t.M.shapeHandles(s).map((h) => h.k).sort().join(",");
  ok("손잡이가 양 끝 둘이다", 손잡이 === "a,b", 손잡이);
  ok("선 위를 누르면 잡힌다", !!t.M.hitTestAt(450, 300));
  ok("선에서 먼 곳은 안 잡힌다", !t.M.hitTestAt(450, 360));

  /* 짧게 톡 찍었을 때 머리가 선보다 길어지지 않는다 */
  const u = 띄우기();
  u.M.setTool("arrow");
  u.톡(400, 300);
  u.톡(404, 300);
  const 짧은기록 = u.그리기()._기록;
  const 짧은채움 = 짧은기록.findIndex((e) => e.op === "fill");
  const 짧은삼각 = 짧은기록.slice(0, 짧은채움).filter((e) => e.op === "move" || e.op === "line").slice(-3);
  const 짧은머리 = Math.sqrt(Math.pow(404 - 짧은삼각[1].x, 2) + Math.pow(300 - 짧은삼각[1].y, 2));
  ok("아주 짧게 그으면 머리가 선 길이(4px)까지만 커진다",
    짧은머리 <= 4.0001, 짧은머리.toFixed(3) + "px");
  u.닫기();
  t.닫기();
}

/* =========================================================================
 * [5] 잡는 반경 — 손가락 22 · 마우스 8
 * ========================================================================= */
절("[5] 잡는 반경 - 새 도형도 같은 기준");
{
  const t = 띄우기();
  ok("손가락 반경이 22px 그대로다", t.M.GRAB_TOUCH === 22, String(t.M.GRAB_TOUCH));
  ok("마우스 반경이 8px 그대로다", t.M.GRAB_MOUSE === 8, String(t.M.GRAB_MOUSE));

  t.M.setTool("vline");
  t.톡(120, 200);
  t.M.setTool("rect");
  t.톡(200, 100);
  t.톡(320, 260);
  t.M.setTool("arrow");
  t.톡(400, 300);
  t.톡(500, 300);
  t.M.setTool("cursor");

  /* 20px 떨어진 자리 — 손가락(22)으로는 잡히고 마우스(8)로는 안 잡혀야 합니다 */
  const 셋 = [
    ["수직선", 140, 40],
    ["사각형", 260, 80],
    ["화살표", 450, 320]
  ];
  셋.forEach(function (c) {
    ok(c[0] + " — 20px 떨어져도 손가락(22px)이면 잡힌다",
      !!t.M.hitTestAt(c[1], c[2], t.M.GRAB_TOUCH),
      JSON.stringify(t.M.hitTestAt(c[1], c[2], t.M.GRAB_TOUCH)));
    ok(c[0] + " — 같은 자리를 마우스(8px)로는 안 잡는다 (빈 곳에서 차트가 끌려야 합니다)",
      !t.M.hitTestAt(c[1], c[2], t.M.GRAB_MOUSE),
      JSON.stringify(t.M.hitTestAt(c[1], c[2], t.M.GRAB_MOUSE)));
  });
  t.닫기();
}

/* =========================================================================
 * [6] 되돌리기 · 목록 · 잠금 · 숨김
 * ========================================================================= */
절("[6] 되돌리기 · 목록 · 잠금 · 숨김에 셋 다 들어간다");
{
  const t = 띄우기();
  t.M.setTool("vline");
  t.톡(120, 200);
  t.M.setTool("rect");
  t.톡(200, 100);
  t.톡(320, 260);
  t.M.setTool("arrow");
  t.톡(400, 300);
  t.톡(500, 300);
  t.M.setTool("cursor");

  const 줄 = t.M.getListItems();
  const 종류 = 줄.map((r) => r.type).sort().join(",");
  ok("그린 것 목록에 셋이 다 뜬다", 종류 === "arrow,rect,vline", 종류);
  const 이름 = 줄.map((r) => r.name).sort().join(",");
  ok("목록에 한글 이름으로 뜬다 (수직선 · 사각형 · 화살표)",
    이름 === "사각형,수직선,화살표", 이름);

  ok("되돌리기 칸이 셋 쌓였다", t.M.getUndoDepth() === 3, String(t.M.getUndoDepth()));
  t.M.undo();
  ok("Ctrl+Z 한 번에 화살표가 사라진다", t.도형().length === 2, String(t.도형().length));
  t.M.redo();
  ok("다시하기로 돌아온다", t.도형().length === 3, String(t.도형().length));

  /* 숨김 */
  const 네모 = t.도형().filter((s) => s.type === "rect")[0];
  const 네모칠 = () => t.그리기()._기록.filter((e) => e.op === "strokeRect").length;
  ok("숨기기 전에는 네모를 그린다", 네모칠() === 1, String(네모칠()));
  t.M.toggleHidden("shape", 네모.id);
  ok("숨기면 네모를 안 그린다", 네모칠() === 0, String(네모칠()));
  ok("숨기면 눌러도 안 잡힌다", !t.M.hitTestAt(260, 100));
  ok("숨겨도 자료는 남는다", t.도형().length === 3, String(t.도형().length));
  t.M.toggleHidden("shape", 네모.id);

  /* 잠금 */
  const 세로 = t.도형().filter((s) => s.type === "vline")[0];
  ok("잠그기 전에는 잡힌다", !!t.M.hitTestAt(120, 40));
  t.M.toggleLocked("shape", 세로.id);
  ok("잠그면 안 잡힌다 (고르기·옮기기·지우기가 다 막힙니다)", !t.M.hitTestAt(120, 40));
  t.M.clearAll();
  t.M.clearAll(); /* 한 번은 물어보기, 두 번째가 실제 지우기 */
  ok("전체 지우기를 해도 잠긴 수직선은 남는다",
    t.도형().length === 1 && t.도형()[0].type === "vline",
    JSON.stringify(t.도형().map((s) => s.type)));
  t.닫기();
}

/* =========================================================================
 * [7] 새 도형은 창을 띄우지 않는다
 * ========================================================================= */
절("[7] 창을 안 띄운다 (아래쪽 방어가 필요한 것을 아예 안 만듭니다)");
{
  const t = 띄우기();
  const 셈 = () => t.win.document.querySelectorAll("body > *").length;
  const 앞 = 셈();
  t.M.setTool("vline");
  t.톡(120, 200);
  t.M.setTool("rect");
  t.톡(200, 100);
  t.톡(320, 260);
  t.M.setTool("arrow");
  t.톡(400, 300);
  t.톡(500, 300);
  ok("셋을 다 그려도 body 에 새 창이 안 생긴다", 셈() === 앞, 앞 + " -> " + 셈());
  ok("글자 입력칸이 안 뜬다", !t.win.document.querySelector(".tl-draw-text-input"));
  ok("표정 고르는 창이 안 뜬다", !t.win.document.querySelector(".tl-face-pick"));
  t.닫기();
}

/* =========================================================================
 * [8] 되돌리는 방법 · 등록
 * ========================================================================= */
절("[8] 되돌리는 방법 · 등록");
{
  ok("소스에 되돌리는 방법이 적혀 있다 (LEFT_TOOLS · READY_TOOLS · TWO_POINT · TWO_TAP)",
    /되돌리려면[\s\S]{0,200}LEFT_TOOLS 의 vline · rect · arrow/.test(SRC));
  ok("스프라이트 아이콘 세 줄도 되돌릴 것에 적혀 있다",
    /tlc-i-vline[\s\S]{0,140}tlc-i-arrow/.test(SRC));
  const 순서 = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    순서.indexOf("tests/chart-shape-seal.test.js") !== -1);
}

/* =========================================================================
 * [9] 돌연변이 — 장치를 빼면 반드시 빨개진다
 * ========================================================================= */
절("[9] 돌연변이 - 빼면 터진다");
{
  /* ㉮ hitTest 에서 사각형 가지를 빼면 → 변을 눌러도 안 잡혀야 합니다 */
  const 자른것 = SRC.replace(
    "      } else if (s.type === \"rect\") {",
    "      } else if (s.type === \"__없는것__\") {"
  );
  ok("사본에서 사각형 hitTest 가지를 뺐다", 자른것 !== SRC);
  const a = 띄우기({ 소스: 자른것 });
  a.M.setTool("rect");
  a.톡(200, 100);
  a.톡(320, 260);
  ok("가지를 빼면 사각형이 안 잡힌다 (이 검사가 진짜로 뭅니다)",
    !a.M.hitTestAt(260, 100), JSON.stringify(a.M.hitTestAt(260, 100)));
  a.닫기();

  /* ㉯ shapeHandles 에서 사각형 가지를 빼면 → 손잡이가 0 이어야 합니다 */
  /* 「모서리 4」 까지 붙여 잘라 냅니다 — 그냥 한 줄만 쓰면 hitTest 쪽 가지가
     먼저 걸립니다(그 줄이 이 글자를 통째로 품고 있습니다) */
  const 손잡이가지 = "    } else if (s.type === \"rect\") {\n      /* 모서리 4";
  const 자른것2 = SRC.replace(손잡이가지,
    손잡이가지.replace("\"rect\"", "\"__없는것__\""));
  ok("사본에서 사각형 손잡이 가지를 뺐다", 자른것2 !== SRC);
  const b = 띄우기({ 소스: 자른것2 });
  b.M.setTool("rect");
  b.톡(200, 100);
  b.톡(320, 260);
  ok("가지를 빼면 손잡이가 하나도 없다", b.M.shapeHandles(b.도형()[0]).length === 0,
    String(b.M.shapeHandles(b.도형()[0]).length));
  b.닫기();

  /* ㉰ 화살표 머리를 안 채우면 → fill 이 0 이어야 합니다 */
  const 자른것3 = SRC.replace("      ctx.fill();\n    }\n    if (on) {\n      handle(ctx, x1, y1);\n      handle(ctx, x2, y2);\n    }\n  }\n\n  function drawOne",
    "      /* 머리 없음 */\n    }\n    if (on) {\n      handle(ctx, x1, y1);\n      handle(ctx, x2, y2);\n    }\n  }\n\n  function drawOne");
  ok("사본에서 화살표 머리 채우기를 뺐다", 자른것3 !== SRC);
  const c = 띄우기({ 소스: 자른것3 });
  c.M.setTool("arrow");
  c.톡(400, 300);
  c.톡(500, 300);
  ok("머리를 빼면 채우기가 0 이다 (그냥 선이 됩니다)",
    c.그리기()._기록.filter((e) => e.op === "fill").length === 0);
  c.닫기();

  ok("원본 js/chart-drawings.js 는 그대로다 (사본만 고쳤습니다)",
    fs.readFileSync(path.join(REPO, "js", "chart-drawings.js"), "utf8") === SRC);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패한 것");
  실패목록.forEach((m) => console.log("  - " + m));
  process.exit(1);
}
console.log("전체 통과");
