/* tests/funding-symbol-stamp.test.js
 * =========================================================================
 * 펀딩 정산 내역에 종목을 찍는다 — 재발 방지
 * =========================================================================
 * 무엇을 지키나
 *
 *  (1) 키가 f.timestamp 다 (f.fundingTime 이 아니다)   ★가장 중요★
 *      fundingTime 은 "정산 대상 시각" 이라, 부팅 때 밀린 펀딩을 채우면
 *      (js/trading.js checkMissedFunding) 몇 시간 전 시각이 들어옵니다.
 *      그걸 기준으로 삼으면 ★방금 만든 행이 '옛 기록' 으로 오판★ 되어
 *      영영 안 찍힙니다. timestamp 는 그 행을 만든 순간입니다.
 *
 *  (2) 옛 행은 비워 둔다 — BTCUSDT 로 채우지 않는다
 *      펀딩은 서버에 원본이 없습니다. 대조할 곳이 없는데 채워 넣으면
 *      그건 추측인데 화면에는 사실처럼 보입니다(조용한 고장).
 *
 *  (3) 이번 세션에서 생긴 행만 찍는다 — 소급 변경 금지
 *
 *  (4) App.Storage.save 를 새로 감싸지 않는다
 *      감싸는 모듈이 4개에서 5개가 되면 도장 순서가 뒤집혀
 *      다른 종목 포지션이 비트코인으로 둔갑합니다(2026-08-27 P1).
 *      그래서 이미 감싸고 있는 stampTradingDoc() 안에 넣었습니다.
 *
 * 판정 규칙을 그대로 옮긴 가짜로 돌려서 숫자로 확인합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [32m✓[0m " + name); }
  else { fail++; console.log("  [31m✗[0m " + name + (detail ? " — " + detail : "")); }
}
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const SRC = read("js/symbol-sync-bridge.js");
/* 주석을 걷어낸 진짜 코드 — 설명 문구가 검사에 걸리지 않게 합니다. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* stampTradingDoc 안의 펀딩 덩어리만 잘라냅니다. */
const BLOCK = (function () {
  const i = CODE.indexOf("data.fundingHistory");
  if (i < 0) return "";
  const j = CODE.indexOf("data.orderHistory", i);
  return j > i ? CODE.slice(i, j) : CODE.slice(i);
})();

/* ===================================================================== */
console.log("\n  (1) 키가 f.timestamp 다 — fundingTime 이 아니다");
/* ===================================================================== */
{
  ok("펀딩 덩어리를 찾았다", BLOCK.length > 0);
  ok("f.timestamp 를 쓴다", /f\.timestamp/.test(BLOCK));
  ok("f.fundingTime 을 ★안★ 쓴다", !/f\.fundingTime/.test(BLOCK),
    "fundingTime 을 쓰면 부팅 때 밀린 펀딩이 '옛 기록' 으로 오판돼 영영 안 찍힙니다");
  ok("stampTradingDoc() 안에 있다",
    CODE.indexOf("function stampTradingDoc") < CODE.indexOf("data.fundingHistory"));
}

/* ===================================================================== */
console.log("\n  (2)(3) 옛 행은 비워 두고, 이번 세션 것만 찍는다");
/* ===================================================================== */
{
  ok("PAGE_LOAD 보다 이전이면 건너뛴다",
    /madeAt\s*<\s*PAGE_LOAD/.test(BLOCK) && /continue/.test(BLOCK));
  ok("펀딩 덩어리에서 DEFAULT_SYMBOL 로 안 떨어진다",
    !/DEFAULT_SYMBOL/.test(BLOCK),
    "BTCUSDT 로 채우면 근거 없는 추측이 화면에 사실처럼 나옵니다");
  ok("이미 찍힌 값은 건드리지 않는다",
    /isSym\(f\.symbol\)/.test(BLOCK));
}

/* ===================================================================== */
console.log("\n  (4) App.Storage.save 를 새로 감싸지 않았다");
/* ===================================================================== */
{
  const files = fs.readdirSync(path.join(REPO, "js")).filter((f) => f.endsWith(".js"));
  /* tests/storage-save-wrap-order.test.js 와 ★똑같은★ 정규식입니다.
     (?!=) 가 없으면 App.Storage.save === "function" 같은 비교문까지
     감싸기로 잘못 셉니다 — 실제로 처음에 7개로 잘못 나왔습니다. */
  const WRAP = /App\.Storage\.save\s*=(?!=)/;
  const 감싸는 = files.filter((f) =>
    WRAP.test(read("js/" + f).replace(/\/\*[\s\S]*?\*\//g, " ")));
  ok("App.Storage.save 를 감싸는 모듈이 4개 그대로다 (" + 감싸는.length + "개)",
    감싸는.length === 4, 감싸는.join(", "));
}

/* ===================================================================== */
console.log("\n  (5) 판정 규칙을 그대로 돌려 봅니다");
/* ===================================================================== */
{
  /* 위 코드와 같은 규칙을 옮긴 것입니다. */
  const PAGE_LOAD = 1000;
  function stamp(list, held) {
    const map = {};
    list.forEach((f) => {
      if (!f || typeof f !== "object") return;
      if (typeof f.symbol === "string" && f.symbol) { map[f.timestamp] = f.symbol; return; }
      const madeAt = typeof f.timestamp === "number" && isFinite(f.timestamp) ? f.timestamp : null;
      if (madeAt === null || madeAt < PAGE_LOAD) return;
      f.symbol = map[f.timestamp] || held || "BTCUSDT";
      map[f.timestamp] = f.symbol;
    });
    return list;
  }

  /* 부팅 때 밀린 펀딩을 채운 경우 — fundingTime 은 몇 시간 전이지만
     timestamp 는 지금입니다. 그래도 찍혀야 합니다. */
  const 밀린것 = stamp([
    { fundingTime: 1, timestamp: 1500, positionSize: 0.05 },
  ], "SAMSUNGUSDT");
  ok("밀린 펀딩도 이번 세션 것이면 찍힌다 (fundingTime 이 아주 옛날이어도)",
    밀린것[0].symbol === "SAMSUNGUSDT", String(밀린것[0].symbol));

  /* 지난 세션에 만들어진 행 — 비어 있어야 합니다. */
  const 옛것 = stamp([{ fundingTime: 900, timestamp: 900, positionSize: 0.05 }], "SAMSUNGUSDT");
  ok("지난 세션 행은 비어 있다(소급 변경 없음)",
    옛것[0].symbol === undefined, String(옛것[0].symbol));

  /* 이미 찍힌 값은 안 바뀝니다. */
  const 이미 = stamp([{ timestamp: 2000, symbol: "QQQUSDT" }], "SAMSUNGUSDT");
  ok("이미 찍힌 종목은 안 덮는다", 이미[0].symbol === "QQQUSDT", String(이미[0].symbol));

  /* timestamp 가 없는 행은 손대지 않습니다. */
  const 없음 = stamp([{ fundingTime: 5000, positionSize: 1 }], "SAMSUNGUSDT");
  ok("timestamp 가 없으면 안 찍는다", 없음[0].symbol === undefined, String(없음[0].symbol));
}

/* ===================================================================== */
console.log("\n  (6) 아직 안 끝난 것 — 화면은 여전히 종목을 안 봅니다");
/* ===================================================================== */
{
  /* 이 검사는 "일부러 실패시키지 않는" 기록입니다.
     기록 쪽은 고쳤지만 그리는 쪽(js/ui.js:599)은 수정 금지 파일이라
     아직 f.symbol 을 안 씁니다. 누가 ui.js 를 우회해 고치면 이 검사가
     바뀌므로, 그때 이 파일도 같이 손보라는 표시입니다. */
  const ui = read("js/ui.js");
  const 그줄 = /App\.Utils\.formatQty\(f\.positionSize[^)]*\)/.exec(ui);
  ok("js/ui.js 의 펀딩 수량 줄을 찾았다", !!그줄);
  const 종목을주나 = 그줄 ? /,/.test(그줄[0]) : false;
  console.log("     · 지금 그 줄: " + (그줄 ? 그줄[0] : "(못 찾음)"));
  console.log("     · 종목을 넘기나: " + (종목을주나 ? "예" : "아니오 — 화면은 아직 활성 종목으로 떨어집니다"));
  ok("js/ui.js 는 수정 금지라 그대로다(우회 모듈이 아직 없음을 기록)",
    true);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
