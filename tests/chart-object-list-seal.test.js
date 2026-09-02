/* tests/chart-object-list-seal.test.js
 * =========================================================================
 * 그린 것 목록 · 숨김 · 잠금 · 계속 그리기 (16차 2026-09-02)
 * =========================================================================
 * 트레이딩뷰를 따라간 것입니다(대표 지시 — 차트 시스템 전체는 트레이딩뷰).
 *   Object Tree            -> 그린 것 목록
 *   hide all / lock all    -> 전체 숨김 / 전체 잠금
 *   Stay in Drawing Mode   -> 계속 그리기
 *
 * ── 여기서 못 박는 것 ───────────────────────────────────────────────────
 *   [1] 저장 칸을 늘리면서 판 번호를 올리지 않았다
 *       올리면 loadStore 가 옛 저장본을 통째로 버립니다 —
 *       회원이 그려 둔 것이 새로고침 한 번에 사라지는 조용한 고장입니다.
 *   [2] 숨기면 안 그려지고 안 잡힌다 (자료는 남는다)
 *   [3] 잠그면 「옮기기·고르기·지우기」 셋 다 막힌다
 *       ★"전체 지우기" 에도 남아야 합니다★ — 안 그러면 잠금이 뜻이 없습니다
 *   [4] 목록 창이 실제로 만들어지고, 줄마다 이름·색·단추가 있다
 *   [5] 계속 그리기 — 켜면 도구가 그대로, 끄면 커서로 돌아온다
 *   [6] 알람은 그림과 갈라서 보여준다 (숨김·잠금을 안 붙인다)
 *   [7] 글씨를 줄이지 않았다 (대표가 작은 글씨를 못 읽습니다)
 *
 * 가짜 차트 · 가짜 저장소만 씁니다. 서버도 브라우저도 부르지 않습니다.
 * tests/ 밖은 한 글자도 고치지 않았습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { 띄우기, SRC } = require("./_chart-drawings-boot.js");
const 잠긴해시 = require("./_locked-hashes.js");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

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

console.log("\n그린 것 목록 · 숨김 · 잠금 · 계속 그리기");

/* =========================================================================
 * [0] 수정 금지 파일을 안 건드렸다
 * ========================================================================= */
절("[0] 수정 금지 파일 그대로");
{
  const 기준 = 잠긴해시.BY_FILE;
  const 이름들 = Object.keys(기준).filter(function (k) { return k.indexOf("js/") === 0; });
  let 다같나 = true;
  const 어긋남 = [];
  이름들.forEach(function (f) {
    const p = path.join(REPO, f);
    const h = crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");
    if (h !== 기준[f]) { 다같나 = false; 어긋남.push(f); }
  });
  ok("수정 금지 " + 이름들.length + "개가 그대로다", 다같나, 어긋남.join(", "));
}

/* =========================================================================
 * [1] 저장 — 칸만 늘리고 판 번호는 그대로
 * ========================================================================= */
절("[1] 저장 - 판 번호를 올리지 않았다 (옛 저장본이 그대로 열려야 합니다)");
{
  const m = /var\s+STORE_VERSION\s*=\s*(\d+)\s*;/.exec(SRC);
  ok("STORE_VERSION 을 읽었다", !!m, String(m));
  ok("판 번호가 1 그대로다 (올리면 회원이 그려 둔 것이 통째로 버려집니다)",
    m && Number(m[1]) === 1, m && m[1]);

  /* 옛 저장본(숨김·잠금 칸이 아예 없는 것)이 그대로 열리는지 */
  const 저장소 = {
    "chart-drawings": {
      v: 1, ui: {},
      bySymbol: {
        BTCUSDT: {
          hlines: [{ id: "h1", type: "hline", price: 79000 }],
          byInterval: { "1m": [{ id: "s1", type: "trend", t1: 1700000600, p1: 79500, t2: 1700003000, p2: 80500 }] }
        }
      }
    }
  };
  const t = 띄우기({ 저장소: 저장소 });
  const 줄 = t.M.getListItems();
  ok("숨김·잠금 칸이 없던 옛 저장본이 그대로 열린다", 줄.length === 2, 줄.length + "줄");
  ok("칸이 없으면 안 숨김·안 잠김으로 읽는다",
    줄.every((r) => r.hidden === false && r.locked === false),
    JSON.stringify(줄.map((r) => [r.hidden, r.locked])));
  t.닫기();
}

/* =========================================================================
 * [2] 숨김 — 안 그리고 안 잡는다. 자료는 남는다
 * ========================================================================= */
절("[2] 숨기면 안 그려지고 안 잡힌다");
{
  const t = 띄우기();
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("hline");
  /* 추세선(100,100)-(400,200)은 x=250 에서 y=150 입니다.
     수평선을 y=150 에 두면 둘이 겹쳐서 "안 잡힌다" 를 못 잽니다.
     일부러 멀리 떨어뜨립니다. */
  t.톡(200, 320);
  t.M.setTool("cursor");

  const 추세 = t.도형()[0];
  const 가로 = t.가로선()[0];
  ok("추세선 1 · 수평선 1 을 그렸다", !!추세 && !!가로,
    t.도형().length + " / " + t.가로선().length);

  const 그린것 = () => t.그리기()._기록.filter((e) => e.op === "stroke").length;
  const 그리기전 = 그린것();
  ok("숨기기 전에는 캔버스에 그린다", 그리기전 > 0, String(그리기전));
  ok("숨기기 전에는 눌러서 잡힌다", !!t.M.hitTestAt(250, 150));
  ok("수평선은 가격축 선이 하나 살아 있다",
    t.가격선().filter((p) => p._살아있나).length === 1,
    String(t.가격선().filter((p) => p._살아있나).length));

  t.M.toggleHidden("shape", 추세.id);
  ok("숨기면 캔버스에 안 그린다", 그린것() < 그리기전, 그린것() + " vs " + 그리기전);
  ok("숨기면 눌러도 안 잡힌다", !t.M.hitTestAt(250, 150));
  ok("숨겨도 자료는 그대로 남는다", t.도형().length === 1, String(t.도형().length));
  ok("숨김 표가 저장에 남는다", t.저장소["chart-drawings"].bySymbol.BTCUSDT.byInterval["1m"][0].h === 1,
    JSON.stringify(t.저장소["chart-drawings"].bySymbol.BTCUSDT.byInterval["1m"][0]));

  t.M.toggleHidden("hline", 가로.id);
  ok("수평선을 숨기면 가격축 선도 지운다",
    t.가격선().filter((p) => p._살아있나).length === 0,
    String(t.가격선().filter((p) => p._살아있나).length));

  t.M.toggleHidden("shape", 추세.id);
  ok("다시 보이게 하면 되돌아온다", 그린것() === 그리기전, 그린것() + " vs " + 그리기전);
  ok("다시 보이면 표를 지운다 (1 이 아니라 아예 없앱니다 — 저장이 커지지 않게)",
    t.저장소["chart-drawings"].bySymbol.BTCUSDT.byInterval["1m"][0].h === undefined);
  t.닫기();
}

/* =========================================================================
 * [3] 잠금 — 옮기기·고르기·지우기가 다 막힌다
 * ========================================================================= */
절("[3] 잠그면 옮기기·고르기·지우기가 막힌다");
{
  const t = 띄우기();
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("trend");
  t.톡(100, 300);
  t.톡(400, 340);
  t.M.setTool("cursor");
  ok("추세선 두 개를 그렸다", t.도형().length === 2, String(t.도형().length));

  const a = t.도형()[0];
  const b = t.도형()[1];
  t.M.toggleLocked("shape", a.id);
  ok("잠금 표가 저장에 남는다",
    t.저장소["chart-drawings"].bySymbol.BTCUSDT.byInterval["1m"][0].l === 1);
  ok("잠근 것은 눌러도 안 잡힌다 (그래서 끌어 옮길 수도 없습니다)",
    !t.M.hitTestAt(250, 150), JSON.stringify(t.M.hitTestAt(250, 150)));
  ok("안 잠근 것은 그대로 잡힌다", !!t.M.hitTestAt(250, 320));
  ok("잠긴 것은 캔버스에 그대로 그린다 (숨김과 다릅니다)",
    t.그리기()._기록.filter((e) => e.op === "stroke").length >= 2);

  ok("잠긴 것은 목록에서 지우려 해도 거절한다", t.M.removeItem("shape", a.id) === false);
  ok("거절해도 그림은 그대로다", t.도형().length === 2, String(t.도형().length));

  /* ★가장 중요한 줄★ — 전체 지우기에도 잠긴 것은 남습니다 */
  t.M.clearAll();
  ok("전체 지우기에도 잠긴 것은 남는다", t.도형().length === 1 && t.도형()[0].id === a.id,
    t.도형().map((s) => s.id).join(","));
  ok("안 잠근 것은 전체 지우기로 사라진다", !t.도형().some((s) => s.id === b.id));

  t.M.toggleLocked("shape", a.id);
  ok("자물쇠를 풀면 그때 지워진다", t.M.removeItem("shape", a.id) === true && t.도형().length === 0,
    String(t.도형().length));
  t.닫기();
}

/* =========================================================================
 * [3-2] 전체 숨김 · 전체 잠금 (트레이딩뷰 hide all · lock all)
 * ========================================================================= */
절("[3-2] 전체 숨김 · 전체 잠금");
{
  const t = 띄우기();
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("hline");
  t.톡(200, 150);
  t.M.setTool("cursor");

  ok("처음에는 숨김 0 · 잠금 0", t.M.getHiddenCount() === 0 && t.M.getLockedCount() === 0);
  t.M.toggleHideAll();
  ok("전체 숨김을 누르면 전부 숨는다", t.M.getHiddenCount() === 2, String(t.M.getHiddenCount()));
  t.M.toggleHideAll();
  ok("한 번 더 누르면 전부 다시 보인다", t.M.getHiddenCount() === 0, String(t.M.getHiddenCount()));

  t.M.toggleLockAll();
  ok("전체 잠금을 누르면 전부 잠긴다", t.M.getLockedCount() === 2, String(t.M.getLockedCount()));
  t.M.clearAll();
  ok("전부 잠긴 상태에서 전체 지우기를 해도 하나도 안 지워진다",
    t.도형().length + t.가로선().length === 2,
    t.도형().length + " + " + t.가로선().length);
  t.M.toggleLockAll();
  ok("한 번 더 누르면 전부 풀린다", t.M.getLockedCount() === 0, String(t.M.getLockedCount()));
  t.닫기();
}

/* =========================================================================
 * [4] 목록 창 — 실제로 만들어지고 줄마다 이름·색·단추가 있다
 * ========================================================================= */
절("[4] 목록 창 (트레이딩뷰 Object Tree)");
{
  const t = 띄우기({ width: 360, 칸너비: 330 });
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("hline");
  t.톡(200, 150);
  t.M.setTool("cursor");

  ok("처음에는 목록이 닫혀 있다", !t.M.isListOpen() && !t.목록창());
  t.M.toggleList();
  const box = t.목록창();
  ok("목록 창이 생긴다", !!box && t.M.isListOpen());

  const rows = box.querySelectorAll(".row");
  ok("그린 것 수만큼 줄이 나온다 (2줄)", rows.length === 2, rows.length + "줄");
  ok("수평선이 먼저 나온다 (종목 단위라 봉을 바꿔도 남는 것)",
    rows[0].querySelector(".nm").textContent.indexOf("수평선") === 0,
    rows[0].querySelector(".nm").textContent);
  ok("추세선 줄에 이름이 적힌다",
    rows[1].querySelector(".nm").textContent === "추세선",
    rows[1].querySelector(".nm").textContent);
  ok("줄마다 색 점이 있다",
    Array.from(rows).every((r) => !!r.querySelector(".dot")));
  ok("색 점이 그림 색과 같다",
    rows[1].querySelector(".dot").style.background.length > 0,
    rows[1].querySelector(".dot").style.background);

  const 단추 = Array.from(rows[1].querySelectorAll("button")).map((b) => b.textContent);
  ok("줄마다 [숨김] [잠금] [지움] 세 단추가 있다",
    단추.join(",") === "숨김,잠금,지움", 단추.join(","));

  const 머리단추 = Array.from(box.querySelectorAll(".hd button")).map((b) => b.textContent);
  ok("머리에 [전체 숨김] [전체 잠금] [닫기] 가 있다",
    머리단추.join(",") === "전체 숨김,전체 잠금,닫기", 머리단추.join(","));

  /* 실제로 눌러서 도는지 — 표시만 바꾸고 아무 일도 안 하는 단추를 막습니다 */
  t.누르기(rows[1].querySelectorAll("button")[0]);
  ok("[숨김] 을 누르면 실제로 숨는다", t.M.getHiddenCount() === 1, String(t.M.getHiddenCount()));
  ok("누른 뒤 그 줄이 [보임] 으로 바뀐다",
    t.목록창().querySelectorAll(".row")[1].querySelectorAll("button")[0].textContent === "보임",
    t.목록창().querySelectorAll(".row")[1].querySelectorAll("button")[0].textContent);
  t.누르기(t.목록창().querySelectorAll(".row")[1].querySelectorAll("button")[1]);
  ok("[잠금] 을 누르면 실제로 잠긴다", t.M.getLockedCount() === 1, String(t.M.getLockedCount()));

  /* 그림이 하나도 없어도 창이 비어 보이면 안 됩니다 */
  /* 위에서 한 줄씩 숨기고 잠갔습니다. 전체 토글은 "하나라도 안 걸린 게
     있으면 전부 건다" 라서 한 번으로는 안 풀립니다 — 두 번 눌러 풉니다. */
  t.M.toggleLockAll();
  t.M.toggleLockAll();
  t.M.toggleHideAll();
  t.M.toggleHideAll();
  t.M.clearAll();
  ok("다 지우면 '아직 그린 것이 없습니다' 를 적는다",
    !!t.목록창() && !!t.목록창().querySelector(".none"),
    t.목록창() ? t.목록창().textContent.slice(0, 40) : "창 없음");

  t.M.toggleList();
  ok("한 번 더 누르면 닫힌다", !t.M.isListOpen() && !t.목록창());
  t.닫기();
}

/* =========================================================================
 * [4-2] 칩 이름표를 눌러서 연다 (칩에 단추를 더 붙이지 않았다)
 * ========================================================================= */
절("[4-2] 칩 이름표로 연다 - 360 에서 칩이 넓어지면 안 됩니다");
{
  const t = 띄우기({ width: 360, 칸너비: 330 });
  t.M.setTool("hline");
  t.톡(200, 150);
  t.M.setTool("cursor");

  const chip = t.칩();
  const 이름표 = chip.querySelector("button.lbl");
  ok("칩 이름표가 누를 수 있는 단추다", !!이름표);
  ok("이름표에 무엇을 하는 단추인지 적혀 있다",
    이름표.getAttribute("aria-label") === "그린 것 목록 열기",
    이름표.getAttribute("aria-label"));
  ok("이름표 글자는 그대로 span 안에 있다 (읽는 쪽이 안 바뀝니다)",
    !!이름표.querySelector("span") && chip.querySelector("span").textContent.indexOf("그린 것") === 0,
    chip.querySelector("span").textContent);
  const 일하는단추 = Array.from(chip.querySelectorAll("button")).filter((b) => b.className.indexOf("lbl") === -1);
  ok("칩에 일하는 단추가 늘지 않았다 (12차 실측 - 세 개면 360 에서 넘칩니다)",
    일하는단추.length <= 3, 일하는단추.length + "개");
  t.누르기(이름표);
  ok("이름표를 누르면 목록이 열린다", t.M.isListOpen());
  t.닫기();
}

/* =========================================================================
 * [5] 계속 그리기 (트레이딩뷰 Stay in Drawing Mode)
 * ========================================================================= */
절("[5] 계속 그리기");
{
  const t = 띄우기();
  ok("처음에는 꺼져 있다", t.M.isStayOn() === false);

  /* 꺼져 있으면 — 하나 긋고 커서로 돌아옵니다 (지금까지의 동작) */
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  ok("꺼져 있으면 하나 긋고 커서로 돌아온다", t.M.getTool() === "cursor", t.M.getTool());

  t.M.toggleStay();
  ok("켜면 켜진다", t.M.isStayOn() === true);
  t.M.setTool("trend");
  t.톡(100, 300);
  t.톡(400, 340);
  ok("켜면 하나 긋고도 추세선 그대로다", t.M.getTool() === "trend", t.M.getTool());
  ok("그래도 그림은 제대로 만들어진다", t.도형().length === 2, String(t.도형().length));
  t.톡(150, 350);
  t.톡(450, 380);
  ok("연달아 하나 더 그을 수 있다", t.도형().length === 3, String(t.도형().length));

  /* 수평선도 같습니다 */
  t.M.setTool("hline");
  t.톡(200, 150);
  ok("수평선도 그대로 남는다", t.M.getTool() === "hline", t.M.getTool());
  t.톡(200, 180);
  ok("연달아 수평선 두 개", t.가로선().length === 2, String(t.가로선().length));

  /* 그림이 아닌 도구에는 안 겁니다 */
  ok("돋보기·알람·브러시·커서에는 계속 그리기를 안 건다",
    Object.keys(t.M.NO_STAY).sort().join(",") === "alert,brush,cursor,zoom",
    Object.keys(t.M.NO_STAY).sort().join(","));
  t.M.setTool("alert");
  t.톡(200, 200);
  ok("알람은 하나 걸면 커서로 돌아온다 (실수로 여러 개 걸리지 않게)",
    t.M.getTool() === "cursor", t.M.getTool());

  t.M.toggleStay();
  ok("끄면 꺼진다", t.M.isStayOn() === false);
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  ok("끄면 다시 커서로 돌아온다", t.M.getTool() === "cursor", t.M.getTool());

  ok("켠 것이 저장에 남는다 (새로고침해도 그대로)",
    t.저장소["chart-drawings"].ui.stay === 0, String(t.저장소["chart-drawings"].ui.stay));
  t.닫기();
}
{
  /* 새로 띄웠을 때 저장에서 되살아나는지 */
  const 저장소 = { "chart-drawings": { v: 1, ui: { stay: 1 }, bySymbol: {} } };
  const t = 띄우기({ 저장소: 저장소 });
  ok("켜 둔 채 새로고침하면 그대로 켜져 있다", t.M.isStayOn() === true);
  t.닫기();
}

/* =========================================================================
 * [6] 알람은 그림과 갈라서 보여준다
 * ========================================================================= */
절("[6] 알람은 그림이 아니다 - 칸을 갈라 적는다");
{
  const t = 띄우기();
  t.M.setTool("trend");
  t.톡(100, 100);
  t.톡(400, 200);
  t.M.setTool("cursor");
  t.M.addAlert(81000);
  t.M.toggleList();

  const box = t.목록창();
  const sec = box.querySelector(".sec");
  ok("알람 칸의 머리글이 따로 있다", !!sec, box.textContent.slice(0, 60));
  ok("머리글에 '그림이 아닙니다' 라고 적는다",
    !!sec && sec.textContent.indexOf("그림이 아닙니다") !== -1, sec && sec.textContent);
  ok("머리글에 '여기서 지우면 알람이 사라집니다' 라고 적는다",
    !!sec && sec.textContent.indexOf("지우면 알람이 사라집니다") !== -1, sec && sec.textContent);

  const 알람줄 = box.querySelectorAll(".row.al");
  ok("알람 줄이 나온다", 알람줄.length === 1, String(알람줄.length));
  const 알람단추 = Array.from(알람줄[0].querySelectorAll("button")).map((b) => b.textContent);
  ok("알람 줄에는 [지움] 만 있다 (숨김·잠금을 안 붙입니다)",
    알람단추.join(",") === "지움", 알람단추.join(","));
  ok("알람은 그림 수에 안 섞인다", t.M.getListItems().length === 1, String(t.M.getListItems().length));

  t.누르기(알람줄[0].querySelector("button"));
  ok("[지움] 을 누르면 알람이 사라진다", t.M.getAlertCount() === 0, String(t.M.getAlertCount()));
  ok("그림은 그대로다", t.도형().length === 1, String(t.도형().length));
  t.닫기();
}

/* =========================================================================
 * [7] 글씨를 줄이지 않았다
 * ========================================================================= */
절("[7] 목록 글씨 - 대표가 작은 글씨를 못 읽습니다");
{
  const t = 띄우기({ width: 360, 칸너비: 330 });
  ok("목록 글씨가 15px 아래로 안 내려간다", t.M.LIST_FONT >= 15, String(t.M.LIST_FONT));
  ok("줄 높이가 손가락으로 누를 만하다 (30px 이상)", t.M.LIST_ROW_H >= 30, String(t.M.LIST_ROW_H));

  const css = t.win.document.getElementById("chart-drawings-style");
  ok("목록 CSS 를 화면에 실제로 넣었다", !!css && css.textContent.indexOf(".tl-draw-list{") !== -1);
  const 덩어리 = css ? css.textContent : "";
  const 목록css = 덩어리.slice(덩어리.indexOf(".tl-draw-list{"), 덩어리.indexOf(".tl-draw-list{") + 300);
  const 글자 = parseFloat((목록css.match(/font-size:(\d+(?:\.\d+)?)px/) || [])[1]);
  ok("CSS 글씨가 LIST_FONT 와 같다 (적는 곳은 한 곳뿐)", 글자 === t.M.LIST_FONT,
    글자 + " vs " + t.M.LIST_FONT);
  ok("좁으면 글씨를 줄이지 않고 안에서 세로로 스크롤한다",
    덩어리.indexOf("overflow-y:auto") !== -1);
  ok("목록 자리잡기(placeList)에서 글씨 크기를 만지지 않는다",
    !/function placeList\(\)[^]*?\n {2}\}/.test(SRC) ||
    !/function placeList\(\)[^]*?fontSize[^]*?\n {2}\}/.test(SRC));
  t.닫기();
}

/* =========================================================================
 * [7-2] 돌연변이 자체검증 — 장치를 빼면 진짜로 터지나
 * -------------------------------------------------------------------------
 * 위 검사들이 "늘 통과하는 검사" 가 아닌지 확인합니다.
 * 소스 사본에서 장치를 한 줄씩 빼고 다시 태워, 같은 자리에서 실패하는지 봅니다.
 * (원본 파일은 손대지 않습니다. 문자열 사본만 씁니다)
 * ========================================================================= */
절("[7-2] 돌연변이 자체검증 - 장치를 빼면 터지나");
{
  function 뺀사본(찾을것, 바꿀것, 이름) {
    const n = SRC.split(찾을것).length - 1;
    if (n !== 1) return { 오류: 이름 + " 를 소스에서 딱 한 번 못 찾았습니다 (" + n + "번)" };
    return { 소스: SRC.replace(찾을것, 바꿀것) };
  }

  /* (1) hitTest 의 숨김·잠금 건너뛰기를 빼면 — 숨긴 것이 다시 잡혀야 합니다 */
  {
    const m = 뺀사본("      if (isHidden(s) || isLocked(s)) continue;\n", "", "hitTest 건너뛰기");
    ok("사본에서 hitTest 건너뛰기를 실제로 뺐다", !m.오류, m.오류);
    if (!m.오류) {
      const t = 띄우기({ 소스: m.소스 });
      t.M.setTool("trend");
      t.톡(100, 100);
      t.톡(400, 200);
      t.M.setTool("cursor");
      t.M.toggleHidden("shape", t.도형()[0].id);
      ok("-> 빼면 숨긴 것이 다시 잡힌다 (그래서 이 검사는 진짜다)",
        !!t.M.hitTestAt(250, 150), JSON.stringify(t.M.hitTestAt(250, 150)));
      t.닫기();
    }
  }

  /* (2) clearAll 의 keepLocked 를 옛 방식으로 되돌리면 — 잠근 것도 지워져야 합니다 */
  {
    const m = 뺀사본(
      "    keepLocked(hlines());\n    keepLocked(shapes());",
      "    hlines().length = 0;\n    shapes().length = 0;",
      "clearAll 의 잠금 지키기");
    ok("사본에서 '전체 지우기가 잠금을 지키는' 장치를 실제로 뺐다", !m.오류, m.오류);
    if (!m.오류) {
      const t = 띄우기({ 소스: m.소스 });
      t.M.setTool("trend");
      t.톡(100, 100);
      t.톡(400, 200);
      t.M.setTool("cursor");
      t.M.toggleLocked("shape", t.도형()[0].id);
      t.M.clearAll();
      ok("-> 빼면 잠근 것도 전체 지우기에 같이 날아간다",
        t.도형().length === 0, String(t.도형().length));
      t.닫기();
    }
  }

  /* (3) finishDraw 를 옛 방식(늘 커서로)으로 되돌리면 — 계속 그리기가 안 먹어야 합니다 */
  {
    const m = 뺀사본(
      "  function finishDraw() {\n    if (!stayMode || NO_STAY[tool] || !READY_TOOLS[tool]) {",
      "  function finishDraw() {\n    if (true) {",
      "finishDraw 의 계속 그리기");
    ok("사본에서 계속 그리기를 실제로 뺐다", !m.오류, m.오류);
    if (!m.오류) {
      const t = 띄우기({ 소스: m.소스 });
      t.M.toggleStay();
      t.M.setTool("trend");
      t.톡(100, 100);
      t.톡(400, 200);
      ok("-> 빼면 계속 그리기를 켜도 커서로 돌아간다",
        t.M.getTool() === "cursor", t.M.getTool());
      t.닫기();
    }
  }

  /* (4) 숨긴 수평선의 가격축 선을 안 지우면 — 선이 살아 있어야 합니다 */
  {
    const m = 뺀사본("      if (isHidden(list[i])) continue;\n      want[list[i].id] = 1;",
      "      want[list[i].id] = 1;", "숨긴 수평선 지우기");
    ok("사본에서 '숨긴 수평선의 가격축 선 지우기' 를 실제로 뺐다", !m.오류, m.오류);
    if (!m.오류) {
      const t = 띄우기({ 소스: m.소스 });
      t.M.setTool("hline");
      t.톡(200, 150);
      t.M.setTool("cursor");
      t.M.toggleHidden("hline", t.가로선()[0].id);
      ok("-> 빼면 숨겼는데도 가격축 선이 남는다 (회원 눈에는 안 숨은 것)",
        t.가격선().filter((p) => p._살아있나).length === 1,
        String(t.가격선().filter((p) => p._살아있나).length));
      t.닫기();
    }
  }
}

/* =========================================================================
 * [8] 이모지가 없다 (프로젝트 규칙)
 * ========================================================================= */
절("[8] 이모지");
{
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]/u;
  ok("js/chart-drawings.js 에 이모지가 없다", !EMOJI.test(SRC));
}

/* ---------- 실행 목록 등록 ---------- */
절("[9] 실행 목록 등록");
{
  const 목록 = fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8");
  ok("tests/_order.txt 에 있다", 목록.indexOf("tests/chart-object-list-seal.test.js") !== -1);
}

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (실패목록.length) {
  console.log("\n실패한 것");
  실패목록.forEach((s) => console.log("  - " + s));
}
process.exit(fail ? 1 : 0);
