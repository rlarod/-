/* tests/placeholder-values.test.js
 * "데이터가 없음"을 그럴듯한 숫자로 덮는 것을 잡습니다.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * js/market-war.js 의 매수/매도 강도는 이렇게 되어 있습니다.
 *
 *     const total = buyIntensity + sellIntensity;
 *     const buyPct = total > 0 ? (buyIntensity / total) * 100 : 50;
 *
 * 체결이 한 건도 안 오면 total 이 0 이라 화면에 "매수 50% / 매도 50%" 가
 * 뜹니다. 회원은 이걸 **측정된 값**으로 읽습니다 — 실제로는 "아무것도 모름"
 * 입니다. 지금 TL-004(체결 스트림 경로) 때문에 체결이 0건이라, 이 바는
 * 켜진 순간부터 영구히 50:50 입니다. 오류도 안 나고 화면도 멀쩡합니다.
 *
 * 이게 CLAUDE.md 가 말하는 P1 "조용한 고장"입니다 — 화면이 깨지면 회원이
 * 안 믿지만, 그럴듯한 숫자는 그대로 믿고 판단합니다.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) "데이터 없음 → 그럴듯한 상수" 패턴이 지금보다 늘어나면 실패
 *  (2) 같은 비율 계산이 두 벌 있는데 둘이 어긋나면 실패
 *      (한쪽만 고치고 다른 쪽을 잊는 실수 — 실제로 이 저장소에서 두 번 났던 유형)
 *  (3) 그 값을 화면에 그리는 곳이 어디인지 못박아 둡니다
 *
 * ── 알려진 결함 ────────────────────────────────────────────────────────
 * 아래 두 줄은 아직 안 고쳤습니다(대표 답변 대기). 그래서 예외로 등록해
 * 두고, 예외 밖에서 새 대체값이 생기면 실패시킵니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}

console.log("\n데이터 없음을 그럴듯한 값으로 덮는가");

/* ── 알려진 결함(아직 안 고침) ──────────────────────────────────────── */
const 알려진예외 = [
  { 곳: "js/market-war.js", 값: "50", 사유: "매수/매도 강도 — 체결 0건일 때 50:50. docs/수리준비.md [P1] TL-004 와 한 몸" },
];

/* =========================================================================
 * 1) 탐지기 — "없으면 이 숫자" 패턴
 *
 * 잡는 것 : total > 0 ? ... : 50      (없을 때 그럴듯한 값)
 *           x.length ? ... : 50
 *           ... || 50                  (0/NaN 이면 50)
 * 안 잡는 것 : ... : 0   ... : null   ... : NaN   ... : "-"
 *              → "모른다"를 모른다고 말하는 것은 정직합니다
 * ========================================================================= */
const 중립값 = ["0", "null", "NaN", "undefined", "-1"];

function 대체값찾기(src, 파일명) {
  /* 주석은 지우되 줄 수는 그대로 둡니다 — 줄 번호가 어긋나면 보고가 쓸모없어집니다. */
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
  const out = [];
  const 줄들 = code.split(/\r?\n/);
  줄들.forEach((line, i) => {
    let m;
    /* (가) 있으면-없으면 삼항연산 */
    const t = /(?:>\s*0|>\s*0\.0|\.length|!=\s*null|!==\s*null|\btotal\b)\s*\?[^;\n]*?:\s*(-?\d+(?:\.\d+)?)\s*[;,)\]]/g;
    while ((m = t.exec(line))) {
      if (중립값.indexOf(m[1]) < 0) out.push({ 파일: 파일명, 줄: i + 1, 값: m[1], 코드: line.trim() });
    }
    /* (나) || 로 덮는 것 — 비율/퍼센트로 쓰이는 그럴듯한 상수만 */
    const o = /\|\|\s*(50|100|0\.5)\s*[;,)\]]/g;
    while ((m = o.exec(line))) {
      out.push({ 파일: 파일명, 줄: i + 1, 값: m[1], 코드: line.trim() });
    }
  });
  return out;
}

console.log("\n  [자체검증] 탐지기가 실제로 잡는가");
{
  const 잡힘 = (s) => 대체값찾기(s, "t").length;
  ok("이번 버그 그대로를 잡는다",
    잡힘("const buyPct = total > 0 ? (buyIntensity / total) * 100 : 50;") === 1);
  ok("50 대신 60 으로 바꿔도 잡는다",
    잡힘("const buyPct = total > 0 ? (a / total) * 100 : 60;") === 1);
  ok("0 으로 두면 통과시킨다(모름을 0 으로 말하는 것은 정직)",
    잡힘("const buyPct = total > 0 ? (a / total) * 100 : 0;") === 0);
  ok("null 로 두면 통과시킨다",
    잡힘("const buyPct = total > 0 ? (a / total) * 100 : null;") === 0);
  ok("length 로 판단하는 형태도 잡는다",
    잡힘("const v = rows.length ? avg(rows) : 50;") === 1);
  ok("|| 50 도 잡는다", 잡힘("const pct = 계산() || 50;") === 1);
  ok("|| 0 은 통과시킨다", 잡힘("const qty = parseFloat(d.q) || 0;") === 0);
  ok("주석 안에 적힌 예시는 세지 않는다",
    잡힘("/* 예: total > 0 ? x : 50 */\nconst a = 1;") === 0);
}

/* =========================================================================
 * 2) 실제 코드 스캔
 * ========================================================================= */
console.log("\n  [실제 코드] js/ 전체 스캔");
let 전체 = [];
{
  for (const f of fs.readdirSync(path.join(REPO, "js"))) {
    if (!f.endsWith(".js")) continue;
    전체 = 전체.concat(대체값찾기(fs.readFileSync(path.join(REPO, "js", f), "utf8"), "js/" + f));
  }
  전체.forEach((v) => console.log("    " + v.파일 + ":" + v.줄 + "  → " + v.값 + "   " + v.코드));

  const 예외키 = 알려진예외.map((e) => e.곳 + "|" + e.값);
  const 새것 = 전체.filter((v) => 예외키.indexOf(v.파일 + "|" + v.값) < 0);
  ok("예외 목록에 없는 새 대체값이 없다", 새것.length === 0,
    새것.map((v) => v.파일 + ":" + v.줄 + " → " + v.값).join(" / "));
  ok("대체값이 있는 파일이 1개를 넘지 않는다",
    [...new Set(전체.map((v) => v.파일))].length <= 1,
    [...new Set(전체.map((v) => v.파일))].join(", "));
  ok("예외 목록이 1건을 넘지 않는다(새 예외 추가 금지)", 알려진예외.length <= 1);
}

/* =========================================================================
 * 3) 같은 비율 계산이 두 벌 — 둘이 어긋나면 잡는다
 *
 * js/market-war.js 는 같은 식을 두 곳에서 씁니다.
 *   · updatePowerBarDom()  — 전쟁터 화면의 힘 게이지
 *   · getBuySellRatio()    — 주문창의 매수/매도 비율 바(js/order-pressure-bar.js)
 * 한쪽만 고치면 두 화면이 서로 다른 숫자를 보여줍니다.
 * ========================================================================= */
console.log("\n  [두 벌] 같은 비율 계산이 서로 어긋나지 않는가");
{
  const MW = fs.readFileSync(path.join(REPO, "js", "market-war.js"), "utf8");
  const 식들 = (MW.match(/const buyPct = total > 0 \?[^\n;]*;/g) || []).map((s) => s.replace(/\s+/g, " ").trim());
  console.log("    찾은 식 " + 식들.length + "개");
  식들.forEach((s) => console.log("      " + s));

  ok("매수 비율 식이 2곳에 있다", 식들.length === 2, String(식들.length));
  ok("두 식이 글자까지 똑같다(한쪽만 고치는 실수를 막는다)",
    식들.length === 2 && 식들[0] === 식들[1],
    식들.join("   ≠   "));

  const total정의 = (MW.match(/const total = buyIntensity \+ sellIntensity;/g) || []).length;
  ok("total 정의도 2곳에서 같다", total정의 === 2, String(total정의));
}

/* =========================================================================
 * 4) 그 값이 실제로 화면에 어떻게 나가는지 못박아 둡니다
 * ========================================================================= */
console.log("\n  [어디에 보이는가]");
{
  const OPB_RAW = fs.readFileSync(path.join(REPO, "js", "order-pressure-bar.js"), "utf8");
  /* 주석에는 옛 코드 이야기가 남아 있으므로 코드만 봅니다. */
  const OPB = OPB_RAW
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");

  /* 2026-08-21 TL-005 로 고쳐진 부분입니다. 되돌아가면 여기서 걸립니다. */
  ok("주문창 압력 바가 '데이터 없음'을 지어내지 않는다(null 로 돌려준다)",
    /if \(total <= 0\) return null;/.test(OPB),
    "여기서 50 을 돌려주면 '모름'이 다시 '반반'이 됩니다");
  ok("데이터가 없으면 퍼센트 대신 '—' 를 보여준다",
    /"매수 —"/.test(OPB) && /"매도 —"/.test(OPB),
    "숫자를 지어내면 회원이 그걸 측정값으로 믿습니다");
  ok("전쟁터 연출값(getBuySellRatio)에 더는 기대지 않는다",
    !/App\.MarketWar\.getBuySellRatio\(\)/.test(OPB),
    "강도는 둘 다 상한 100 에 붙어 늘 50:50 이라 압력 바에 못 씁니다");
  ok("실제 체결(테이커 매수/매도)량으로 직접 센다",
    /isBuy:\s*!p\.isBuyerMaker/.test(OPB) && /App\.Bus\.on\("trade:tick", onTradeTick\)/.test(OPB));

  const MW = fs.readFileSync(path.join(REPO, "js", "market-war.js"), "utf8");
  ok("전쟁터 힘 게이지는 여전히 강도 기반이다(연출값 — 그대로 둔 것이 맞음)",
    /buyEl\.style\.width = buyPct \+ "%"/.test(MW));

  /* 강도는 체결(trade:tick)로만 채워집니다 — 체결이 0건이면 영구히 50:50. */
  ok("강도의 유일한 입력이 체결이다(그래서 TL-004 와 한 몸이다)",
    /App\.Bus\.on\("trade:tick", onTradeTick\)/.test(MW),
    "다른 입력이 생기면 이 주석과 tests/stream-signals.test.js 를 같이 고쳐야 합니다");
}

/* =========================================================================
 * 5) 돌연변이 검사 — 실제 소스를 메모리에서 망가뜨려 잡히는지 확인
 *    (파일은 하나도 안 고칩니다)
 * ========================================================================= */
console.log("\n  [돌연변이] 버그를 다시 넣으면 정말 실패하는가");
{
  const MW = fs.readFileSync(path.join(REPO, "js", "market-war.js"), "utf8");

  /* (가) 한쪽만 고친다 — 두 화면이 다른 숫자를 보여주게 됨 */
  {
    const 망친 = MW.replace("const buyPct = total > 0 ? (buyIntensity / total) * 100 : 50;",
      "const buyPct = total > 0 ? (buyIntensity / total) * 100 : 0;");
    const 식들 = (망친.match(/const buyPct = total > 0 \?[^\n;]*;/g) || []).map((s) => s.replace(/\s+/g, " ").trim());
    ok("→ 한쪽만 고치면 '두 식이 똑같다' 검사가 실패한다",
      식들.length === 2 && 식들[0] !== 식들[1], 식들.join(" | "));
  }

  /* (나) 다른 파일에 새 대체값을 들여온다 */
  {
    const 새파일 = "var 승률 = 판수 > 0 ? (이긴판 / 판수) * 100 : 50;";
    const v = 대체값찾기(새파일, "js/새모듈.js");
    const 예외키 = 알려진예외.map((e) => e.곳 + "|" + e.값);
    ok("→ 다른 파일에 새 대체값이 들어오면 예외 밖 위반으로 잡힌다",
      v.length === 1 && 예외키.indexOf(v[0].파일 + "|" + v[0].값) < 0);
  }

  /* (다) 주문창 압력 바를 TL-005 이전으로 되돌린다 */
  {
    const OPB = fs.readFileSync(path.join(REPO, "js", "order-pressure-bar.js"), "utf8");

    const 되돌림1 = OPB.replace("if (total <= 0) return null;",
      "if (total <= 0) return { buyPct: 50, sellPct: 50 };");
    ok("→ 되돌림 사본이 실제로 만들어졌다", 되돌림1 !== OPB);
    ok("→ 데이터 없음을 50:50 으로 되돌리면 '지어내지 않는다' 검사가 실패한다",
      !/if \(total <= 0\) return null;/.test(되돌림1));

    const 되돌림2 = OPB.replace(/"매수 —"/g, '"매수 50%"').replace(/"매도 —"/g, '"매도 50%"');
    ok("→ '—' 를 숫자로 바꾸면 '지어내지 않는다' 검사가 실패한다",
      !/"매수 —"/.test(되돌림2) && !/"매도 —"/.test(되돌림2));

    const 되돌림3 = OPB.replace("const r = computeRatio();",
      "const r = App.MarketWar.getBuySellRatio();");
    ok("→ 전쟁터 연출값으로 되돌리면 '기대지 않는다' 검사가 실패한다",
      /App\.MarketWar\.getBuySellRatio\(\)/.test(
        되돌림3.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      ));
  }
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
process.exit(0);
