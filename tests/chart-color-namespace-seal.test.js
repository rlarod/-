/* tests/chart-color-namespace-seal.test.js
 * =========================================================================
 * 팀 사이에 낀 봉인 — 차트 위 선 색이 ★반대 방향으로도★ 안 겹치는지
 * =========================================================================
 * 2026-09-02 밤 · 기록팀
 *
 * ── 지금 차트 위에 색이 세 무리 있습니다 ───────────────────────────────
 *     지표선   js/chart-indicator-kit.js  LINE_COLORS      (12 -> 20색)
 *     그림선   js/chart-drawings.js       DRAW_COLORS      (8색)
 *     알람선   js/chart-drawings.js       ALERT_COLOR      (1색, 연파랑)
 *   회원 눈에는 ★전부 그냥 차트 위의 선★ 입니다. 색이 겹치면 추세선인지
 *   이동평균선인지 구분이 안 됩니다.
 *   (2026-08-31 에 시세선과 MA7 이 둘 다 금색이라 회원 화면의 62.7% 에서
 *    한 줄로 보였던 일이 있습니다 — 그때는 두 벌이 아니라 한 벌 안의 사고였습니다)
 *
 * ── ⚠️ 지금까지 한쪽 방향만 있었습니다 ─────────────────────────────────
 *   tests/chart-drawings.test.js 가
 *       "새로 만든 색(그림·알람)이 지표선 20색과 ΔE2000 10 이상 떨어져 있다"
 *   를 봅니다. ★그리기 팀이 색을 늘릴 때★ 는 걸립니다.
 *
 *   그런데 ★지표 팀이 색을 늘릴 때★ 는 아무것도 안 걸립니다.
 *   tests/chart-indicator-kit-seal.test.js [1] 과
 *   tests/chart-indicator-color-collision.test.js 는 둘 다
 *   ★지표 목록 안에서만★ 재고, 그림색·알람색은 쳐다보지도 않습니다.
 *   색은 오늘 밤 12 -> 20 으로 늘었고 앞으로 또 늘어납니다.
 *   그때 새 지표색이 그림색과 같아도 ★모든 테스트가 초록★ 입니다.
 *
 *   그래서 이 파일은 ★반대 방향★ 을 봅니다 — 지표색 하나하나를
 *   그림색 8개 · 알람색 1개와 견줍니다.
 *
 * ── ⭐ 지금 허용된 겹침은 ★금색 하나뿐★ 입니다 ────────────────────────
 *   #F0B429 은 확정 팔레트의 포인트색이고, 지표 목록의 첫 색(MA7)이자
 *   그림 목록의 첫 색(지금까지 쓰던 기본 그림색)입니다.
 *   그건 이미 그런 상태로 배포됐고, 이 봉인이 바꿀 일이 아닙니다.
 *   ★다만 두 번째 겹침이 생기는 순간 여기서 터집니다.★
 *   (tests/chart-drawings.test.js 도 같은 예외를 filter 로 두고 있습니다 —
 *    거기는 "그림색에서 금색을 뺀다", 여기는 "겹침이 금색 하나뿐이다")
 *
 * ── 숫자를 박지 않습니다 ───────────────────────────────────────────────
 *   두 목록을 ★공개 API★ (K.LINE_COLORS · M.DRAW_COLORS · M.COLORS.alert)로
 *   읽어 매번 다시 잽니다. 소스 정규식으로 색을 긁지 않습니다 —
 *   목록 모양이 바뀌면 정규식은 조용히 0개를 읽고 초록이 됩니다.
 *   2026-09-02 실측 (이 파일이 매번 다시 잽니다) —
 *       지표 20색 · 그림 8색 · 알람 1색
 *       금색 쌍을 뺀 최소 ΔE2000  10.48  (#FF8F3C 주황 / #E06900 진주황)
 *   ★다음에 터질 자리는 그 쌍입니다.★ 여유가 0.48 밖에 없습니다.
 *
 * ── 여기서 ★안 보는 것★ (두 벌 금지) ──────────────────────────────────
 *   · 색 목록 안끼리의 거리 · 명암비 · 상승/하락색과의 거리
 *     -> tests/chart-indicator-kit-seal.test.js [1] 과
 *        tests/chart-drawings.test.js 5) 절이 각자 봅니다. 여기서 또 재지 않습니다.
 *   · 회원이 지표를 얹었을 때 지표끼리 겹치는지
 *     -> tests/chart-indicator-color-collision.test.js 한 곳입니다.
 *
 * ── 되돌리는 방법 ──────────────────────────────────────────────────────
 *   tests/_order.txt 의 이 줄과 이 파일을 지우면 됩니다.
 *   사이트 코드는 한 글자도 건드리지 않습니다. 서버·브라우저도 안 부릅니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const KIT = require("./_kit-harness.js");
const DRAW = require("./_chart-drawings-boot.js");

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

/* =========================================================================
 * 색 거리 자 — CIE ΔE2000. 사람 눈에 가까운 자입니다.
 *   ⚠️ ΔE76 만 보면 안 됩니다. 실측 —
 *      #BA6EED 보라 / #E637E6 자홍  ΔE76 30.76 인데 ΔE2000 은 9.71 입니다.
 * ========================================================================= */
function rgb(h) {
  const s = String(h).replace("#", "");
  return [0, 2, 4].map(function (i) { return parseInt(s.substr(i, 2), 16); });
}
function lab(h) {
  const v = rgb(h).map(function (x) {
    x /= 255;
    return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  const X = (v[0] * 0.4124 + v[1] * 0.3576 + v[2] * 0.1805) / 0.95047;
  const Y = v[0] * 0.2126 + v[1] * 0.7152 + v[2] * 0.0722;
  const Z = (v[0] * 0.0193 + v[1] * 0.1192 + v[2] * 0.9505) / 1.08883;
  const f = function (t) { return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116; };
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de2000(h1, h2) {
  const A = lab(h1); const B = lab(h2);
  const L1 = A[0], a1 = A[1], b1 = A[2];
  const L2 = B[0], a2 = B[1], b2 = B[2];
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const h1p = (Math.atan2(b1, a1p) * 180 / Math.PI + 360) % 360;
  const h2p = (Math.atan2(b2, a2p) * 180 / Math.PI + 360) % 360;
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh * Math.PI / 360);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb;
  if (C1p * C2p === 0) hb = h1p + h2p;
  else { hb = h1p + h2p; if (Math.abs(h1p - h2p) > 180) hb += hb < 360 ? 360 : -360; hb /= 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * Math.PI / 180) + 0.24 * Math.cos(2 * hb * Math.PI / 180)
    + 0.32 * Math.cos((3 * hb + 6) * Math.PI / 180) - 0.2 * Math.cos((4 * hb - 63) * Math.PI / 180);
  const dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2));
  const Sc = 1 + 0.045 * Cbp, Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin((2 * dTh * Math.PI) / 180) * Rc;
  return Math.sqrt(Math.pow(dL / Sl, 2) + Math.pow(dC / Sc, 2) + Math.pow(dH / Sh, 2)
    + Rt * (dC / Sc) * (dH / Sh));
}

/* 허용된 겹침 — 여기 적힌 것 말고는 하나도 허용하지 않습니다 */
const 허용된겹침 = ["#F0B429"];
/* 서로 다른 무리끼리 지켜야 하는 최소 거리.
   tests/chart-drawings.test.js 가 반대 방향에서 쓰는 값과 같은 10 입니다.
   ⚠️ 두 곳이 다른 값을 쓰면 한쪽만 통과하는 색이 생깁니다. */
const 최소거리 = 10;

/* =========================================================================
 * 목록 읽어오기 — 공개 API 로만
 * ========================================================================= */
const 지표판 = KIT.boot(KIT.makeCandles ? KIT.makeCandles(120) : []);
const 그리기판 = DRAW.띄우기({});
const K = 지표판.K;
const D = 그리기판.M;

console.log("\n차트 선 색이 무리를 넘어 안 겹친다 (지표 <-> 그리기 <-> 알람)");

절("[1] 두 목록을 공개 API 로 읽어 왔다 (소스 글자로 긁지 않았다)");
const 지표색 = (K && K.LINE_COLORS ? K.LINE_COLORS : []).map(function (c) {
  return String(c.hex).toUpperCase();
});
const 그림색 = (D && D.DRAW_COLORS ? D.DRAW_COLORS : []).map(function (c) {
  return String(c.hex).toUpperCase();
});
const 알람색 = D && D.COLORS && D.COLORS.alert ? String(D.COLORS.alert).toUpperCase() : "";
{
  ok("지표선 색 목록을 읽었다 (지금 " + 지표색.length + "색)", 지표색.length >= 20, String(지표색.length));
  ok("그림선 색 목록을 읽었다 (지금 " + 그림색.length + "색)", 그림색.length >= 8, String(그림색.length));
  ok("알람색을 읽었다 (" + 알람색 + ")", /^#[0-9A-F]{6}$/.test(알람색), 알람색);
  ok("셋 다 여섯 자리 색값이다",
    지표색.concat(그림색, [알람색]).every(function (h) { return /^#[0-9A-F]{6}$/.test(h); }),
    지표색.concat(그림색, [알람색]).filter(function (h) { return !/^#[0-9A-F]{6}$/.test(h); }).join(","));
  ok("같은 목록 안에 같은 색이 두 번 없다 (지표)",
    new Set(지표색).size === 지표색.length, 지표색.join(","));
  ok("같은 목록 안에 같은 색이 두 번 없다 (그림)",
    new Set(그림색).size === 그림색.length, 그림색.join(","));
}

/* =========================================================================
 * [2] 반대 방향 — 지표색 하나하나가 그림색·알람색과 안 겹친다
 * ========================================================================= */
절("[2] 지표색이 그림색·알람색과 겹치지 않는다 (아무도 안 보던 방향)");
{
  const 저쪽 = 그림색.concat([알람색]);

  /* 2-1) 글자 그대로 같은 색 */
  const 같은색 = 지표색.filter(function (h) { return 저쪽.indexOf(h) >= 0; });
  ok("글자 그대로 같은 색이 " + 허용된겹침.length + "개뿐이다 (금색)",
    같은색.length === 허용된겹침.length &&
      같은색.every(function (h) { return 허용된겹침.indexOf(h) >= 0; }),
    같은색.join(","));
  허용된겹침.forEach(function (h) {
    ok("허용된 겹침 " + h + " 이 실제로 두 목록에 다 있다 (예외가 낡지 않았다)",
      지표색.indexOf(h) >= 0 && 저쪽.indexOf(h) >= 0,
      "지표=" + (지표색.indexOf(h) >= 0) + " 저쪽=" + (저쪽.indexOf(h) >= 0));
  });

  /* 2-2) 눈으로 가까운 색 — 허용된 쌍만 빼고 전부 잽니다 */
  let 최소 = Infinity;
  let 짝 = "";
  const 가까운쌍 = [];
  지표색.forEach(function (i) {
    저쪽.forEach(function (d) {
      if (i === d && 허용된겹침.indexOf(i) >= 0) return; /* 허용된 겹침은 건너뜁니다 */
      const v = de2000(i, d);
      if (v < 최소) { 최소 = v; 짝 = i + " / " + d; }
      if (v < 최소거리) 가까운쌍.push(i + "/" + d + " = " + v.toFixed(2));
    });
  });
  console.log("      (실측 최소 ΔE2000 " + 최소.toFixed(2) + " — " + 짝 + ")");
  ok("지표색과 그림·알람색이 ΔE2000 " + 최소거리 + " 이상 떨어져 있다",
    가까운쌍.length === 0,
    가까운쌍.join(" / "));

  /* 2-3) 이 검사가 정말 뭔가를 재고 있는지 — 쌍 개수를 세어 둡니다 */
  ok("실제로 잰 쌍이 " + (지표색.length * 저쪽.length) + "쌍이다 (0쌍이면 헛검사입니다)",
    지표색.length * 저쪽.length >= 20 * 9,
    String(지표색.length * 저쪽.length));
}

/* =========================================================================
 * [3] 회원 경로 — 지표를 하나씩 다 얹었을 때 나온 색도 안 겹친다
 *   suggestColor() -> createInstance() -> updateInstance()
 *   ⚠️ 낮은 단계 함수(LINE_COLORS 를 그냥 읽기)만 보면, 틀이 목록 밖 색을
 *      내놓는 순간을 못 봅니다. 그래서 ★회원이 누르는 길★ 로 한 번 더 봅니다.
 * ========================================================================= */
절("[3] 회원이 지표를 얹었을 때 나온 색도 그림·알람색과 안 겹친다");
{
  const 저쪽 = 그림색.concat([알람색]);
  const B = KIT.boot(KIT.makeCandles ? KIT.makeCandles(150) : []);
  const KK = B.K;
  const 정의들 = (KK.listDefs ? KK.listDefs() : []).map(function (d) { return d.id; });
  ok("얹어 볼 지표 정의를 읽었다 (" + 정의들.length + "가지)", 정의들.length >= 5, String(정의들.length));

  /* 회원 경로 그대로 — 색을 먼저 고르고, 얹고, 첫 선 색을 그 색으로 바꿉니다 */
  const 고른색 = [];
  정의들.forEach(function (id) {
    const hex = KK.suggestColor();
    const 새id = KK.createInstance(id, { on: true });
    if (!새id) return;
    고른색.push(String(hex).toUpperCase());
    const inst = KK.listInstances().filter(function (i) { return i.id === 새id; })[0];
    if (inst && hex) {
      const 첫키 = Object.keys(inst.colors)[0];
      if (첫키) {
        const c = {};
        c[첫키] = hex;
        KK.updateInstance(새id, { colors: c });
      }
    }
  });
  ok("회원 경로로 지표를 " + 고른색.length + "개 얹었다", 고른색.length >= 5, String(고른색.length));

  /* 화면에 실제로 실린 선 색을 전부 모읍니다 (한 지표가 선을 여럿 들기도 합니다) */
  const 실린선색 = [];
  KK.listInstances().forEach(function (i) {
    Object.keys(i.colors).forEach(function (k) {
      실린선색.push(String(i.colors[k]).toUpperCase());
    });
  });
  ok("화면에 실린 선이 " + 실린선색.length + "개다", 실린선색.length >= 고른색.length,
    String(실린선색.length));

  const 나쁜것 = [];
  실린선색.forEach(function (h) {
    저쪽.forEach(function (d) {
      if (h === d && 허용된겹침.indexOf(h) >= 0) return;
      const v = de2000(h, d);
      if (v < 최소거리) 나쁜것.push(h + "/" + d + " = " + v.toFixed(2));
    });
  });
  ok("회원 경로로 얹은 선 색이 그림·알람색과 " + 최소거리 + " 이상 떨어져 있다",
    나쁜것.length === 0, Array.from(new Set(나쁜것)).join(" / "));

  ok("틀이 내놓은 색이 전부 목록 안의 색이다 (목록 밖 색을 지어내지 않는다)",
    실린선색.every(function (h) { return 지표색.indexOf(h) >= 0; }),
    실린선색.filter(function (h) { return 지표색.indexOf(h) < 0; }).join(","));
}

/* =========================================================================
 * [4] 알람색은 어느 목록에도 없다 (연파랑 가로선은 언제나 알람)
 * ========================================================================= */
절("[4] 알람색은 오직 알람만 쓴다");
{
  ok("알람색이 그림색 목록에 없다", 그림색.indexOf(알람색) < 0, 알람색);
  ok("알람색이 지표색 목록에 없다", 지표색.indexOf(알람색) < 0, 알람색);
  ok("알람색이 그림 기본색(금색)과 확실히 다르다",
    de2000(알람색, D.COLORS.draw) >= 30, de2000(알람색, D.COLORS.draw).toFixed(2));
  ok("알람색이 고른 그림(selected) 색과도 다르다",
    String(D.COLORS.selected).toUpperCase() !== 알람색,
    String(D.COLORS.selected));
}

/* =========================================================================
 * [5] 색을 적은 곳이 한 곳씩이다 (두 벌 금지)
 * ========================================================================= */
절("[5] 색을 적은 곳이 무리마다 한 곳씩이다");
{
  const 지표소스 = fs.readFileSync(path.join(KIT.REPO, "js", "chart-indicator-kit.js"), "utf8");
  const 그림소스 = fs.readFileSync(path.join(DRAW.REPO, "js", "chart-drawings.js"), "utf8");
  ok("지표선 색 목록(LINE_COLORS)이 한 번만 선언돼 있다",
    (지표소스.match(/var\s+LINE_COLORS\s*=/g) || []).length === 1,
    String((지표소스.match(/var\s+LINE_COLORS\s*=/g) || []).length));
  ok("그림선 색 목록(DRAW_COLORS)이 한 번만 선언돼 있다",
    (그림소스.match(/var\s+DRAW_COLORS\s*=/g) || []).length === 1,
    String((그림소스.match(/var\s+DRAW_COLORS\s*=/g) || []).length));
  ok("알람색(ALERT_COLOR)이 한 번만 선언돼 있다",
    (그림소스.match(/var\s+ALERT_COLOR\s*=/g) || []).length === 1,
    String((그림소스.match(/var\s+ALERT_COLOR\s*=/g) || []).length));
  /* 그림 파일이 지표 전용 색을 ★코드에★ 베껴 두면 두 벌이 됩니다.
     ⚠️ 설명글(주석)은 뺍니다 — 실제로 js/chart-drawings.js:513 이 실측값을 적으며
        "#FF8F3C 지표 주황" 이라고 ★주석에★ 써 두었고, 그건 두 벌이 아닙니다.
     ⚠️ 확정 팔레트 9색(본문 #E7ECF5 · 보조 #838DA4 …)도 뺍니다 — 그건 글자색이라
        두 파일에 다 나오는 것이 정상입니다. */
  const 확정팔레트 = ["#0A0F1C", "#101727", "#0D1422", "#1D273B",
    "#E7ECF5", "#838DA4", "#26C281", "#F0506E", "#F0B429"];
  const 그림코드 = 그림소스
    .replace(/[/][*][^]*?[*][/]/g, "")
    .replace(new RegExp("(^|[^:])//[^\\n]*", "g"), "$1");
  const 베낀것 = 지표색.filter(function (h) {
    return 허용된겹침.indexOf(h) < 0 && 확정팔레트.indexOf(h) < 0 &&
      그림코드.toUpperCase().indexOf(h) >= 0;
  });
  ok("그림 쪽 ★코드★ 가 지표 전용 색을 베껴 두지 않았다 (두 벌 금지)",
    베낀것.length === 0, 베낀것.join(","));
}

/* =========================================================================
 * [6] 등록
 * ========================================================================= */
절("[6] 등록");
{
  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-color-namespace-seal.test.js") >= 0,
    "등록 안 하면 npm test 가 안 돌립니다");
  const 나 = fs.readFileSync(__filename, "utf8");
  ok("되돌리는 방법이 이 파일에 적혀 있다", 나.indexOf("되돌리는 방법") >= 0);
}

try { 그리기판.닫기(); } catch (e) { /* 무시 */ }

console.log("\n  통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n  실패한 것:");
  실패목록.forEach(function (s) { console.log("   - " + s); });
}
process.exit(fail ? 1 : 0);
