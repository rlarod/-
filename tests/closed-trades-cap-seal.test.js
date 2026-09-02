/* tests/closed-trades-cap-seal.test.js
 * =========================================================================
 * 누적 실현손익이 ★201건째부터 얼어붙는다★ — 지금 이렇다는 사실을 못 박습니다
 * =========================================================================
 *
 * ── ⚠️ 이 파일은 "고친 것" 이 아니라 "지금 이렇다" 를 남기는 것입니다 ───
 *   고치는 것은 대표 결재 항목입니다(손익 계산식). 기록팀은 못 고칩니다.
 *   ★나중에 고치면 이 파일이 터지면서 "이제 바뀌었다" 고 알려줍니다.★
 *   그때 아래 [2] 를 새 기준으로 바꾸고, ★왜 바뀌었는지 날짜와 함께★ 적으세요.
 *
 * ── 무엇이 실제로 있었나 (2026-09-01 팀 발견) ───────────────────────────
 *   거래 199건 | 누적 실현손익 1790.005
 *   거래 200건 | 1799
 *   거래 201건 | ★1799★   ← 더 안 늘어남
 *   거래 260건 | ★1799★
 *
 *   원인은 두 줄입니다.
 *     js/trading.js:71   const MAX_CLOSED_TRADES = 200;
 *     js/trading.js:534  if (state.closedTrades.length > MAX_CLOSED_TRADES)
 *                          state.closedTrades.length = MAX_CLOSED_TRADES;
 *     js/trading.js:698  state.closedTrades.forEach((t) => { realizedPnl += t.pnl; });
 *
 *   즉 "누적" 이 아니라 ★최근 200건의 합★ 입니다. 오래된 거래는 조용히 빠집니다.
 *   손익이 매번 같으면 위처럼 ★얼어붙은 것처럼★ 보이고, 다르면 값이 ★줄기도★ 합니다.
 *
 * ── 왜 P1 성격인가 ──────────────────────────────────────────────────────
 *   화면도 안 깨지고 오류도 없습니다. 회원은 그 숫자를 "내가 지금까지 번 돈" 으로
 *   읽습니다. 우리가 조용한 고장이라고 부르는 그것입니다.
 *   지금은 표 머리글 툴팁이 "최근 200건까지만 합산합니다" 라고 알려 주고 있고,
 *   tests/order-panel.test.js 가 ★그 문구가 살아 있는지★ 를 지킵니다.
 *   이 파일은 ★숫자가 실제로 그렇게 도는지★ 를 지킵니다. 둘은 다른 것입니다.
 *
 * ── 이 파일이 못 박는 것 ────────────────────────────────────────────────
 *   [1] 상한값이 200 이다 — 바꾸면 여기서 터집니다
 *       (상한을 바꾸면 표 머리글 툴팁의 숫자도 같이 고쳐야 합니다)
 *   [2] 201건째부터 누적 실현손익이 안 늘어난다 (지금 사실)
 *   [3] 거래기록 자체도 200건에서 멈춘다
 *   [4] 오래된 것이 빠지고 최신 것이 남는다 (앞이 아니라 뒤가 잘립니다)
 *
 * ── 손대지 않은 것 ──────────────────────────────────────────────────────
 *   사이트 코드 한 글자도 안 고쳤습니다. 서버에도 안 붙습니다.
 *   ⭐ 실제 엔진(js/trading.js)을 그대로 돌려서 잽니다 — 흉내내지 않습니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { boot } = require("./harness.js");

const REPO = process.env.REPO || path.join(__dirname, "..");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

console.log("\n누적 실현손익 200건 상한 (지금 이렇다는 기록)");

const TRADING_SRC = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");

/* =======================================================================
 * [1] 상한값 — ★바꾸면 여기서 터집니다★
 *     숫자를 소스에서 읽어와 비교합니다. 사람이 눈으로 세지 않습니다.
 * ===================================================================== */
console.log("\n[1] 상한값");
const 상한매치 = /MAX_CLOSED_TRADES\s*=\s*(\d+)/.exec(TRADING_SRC);
ok("js/trading.js 에서 MAX_CLOSED_TRADES 를 읽었다", !!상한매치);
const 상한 = 상한매치 ? Number(상한매치[1]) : -1;
ok(
  "상한이 200 이다 — 바꾸려면 표 머리글 툴팁의 숫자도 같이 고쳐야 합니다",
  상한 === 200,
  "지금 " + 상한
);

/* 상한이 걸리는 자리가 "뒤를 자르는" 방식인지 (앞을 자르면 최신이 날아갑니다) */
ok(
  "상한을 넘으면 배열 길이를 잘라서 ★오래된 것★ 을 버린다",
  /state\.closedTrades\.length\s*=\s*MAX_CLOSED_TRADES/.test(TRADING_SRC),
  "closedTrades 상한 처리 방식이 바뀌었습니다"
);
ok(
  "새 거래는 앞에 넣는다 (최근 순 배열)",
  /state\.closedTrades\.unshift\(/.test(TRADING_SRC),
  "closedTrades 에 unshift 가 없습니다 — 정렬 방향이 바뀌었을 수 있습니다"
);

/* =======================================================================
 * [2][3][4] 실제 엔진을 돌려서 잽니다
 * ===================================================================== */
console.log("\n[2] 실제로 201건째부터 안 늘어나는가");

const SYMBOL = "BTCUSDT";
const 진입가 = 100000;
const 청산가 = 100200;
const 증거금 = 100;
const 배율 = 10;

const { App, win } = boot({ balance: 1000000 });

function 시세(p) {
  App.Bus.emit("price:update", { symbol: SYMBOL, price: p });
}

App.Trading.setLeverage(배율);

/* 한 번 사고 한 번 파는 것을 260번. 값이 매번 같아야 "얼어붙음" 이 보입니다. */
const 기록 = {};
let 열림실패 = 0;
let 닫힘실패 = 0;
const 총회수 = 260;

for (let i = 1; i <= 총회수; i++) {
  시세(진입가);
  const r1 = App.Trading.openPosition("long", 증거금);
  if (!r1 || r1.ok === false) {
    열림실패++;
    break;
  }
  시세(청산가);
  const r2 = App.Trading.closePosition("수동청산");
  if (!r2 || r2.ok === false) {
    닫힘실패++;
    break;
  }
  const s = App.Trading.getSnapshot();
  기록[i] = { 누적: s.realizedPnl, 건수: s.closedTrades.length };
}

ok("260번 여는 데 실패한 적이 없다", 열림실패 === 0, "실패 " + 열림실패 + "회");
ok("260번 닫는 데 실패한 적이 없다", 닫힘실패 === 0, "실패 " + 닫힘실패 + "회");
ok("260건을 다 돌았다", !!기록[총회수], "마지막 기록 " + Object.keys(기록).length + "건");

if (기록[총회수]) {
  const 한건 = 기록[1].누적;
  ok("한 건당 실현손익이 0 이 아니다", Math.abs(한건) > 0, String(한건));

  /* 199 → 200 은 늘어야 합니다 */
  ok(
    "199건 → 200건 에서는 누적이 늘어난다",
    기록[200].누적 > 기록[199].누적,
    기록[199].누적 + " → " + 기록[200].누적
  );

  /* ⭐⭐ 201건째부터는 안 늘어납니다 — 이것이 이 파일의 핵심 기록입니다.
     (매 거래 손익이 같기 때문에 정확히 같은 값이 됩니다. 손익이 다르면
      늘지 않는 정도가 아니라 ★줄어들 수도★ 있습니다) */
  ok(
    "[기록] 201건째부터 누적 실현손익이 안 늘어난다",
    Math.abs(기록[201].누적 - 기록[200].누적) < 1e-9,
    기록[200].누적 + " → " + 기록[201].누적
  );
  ok(
    "[기록] 260건까지 가도 200건일 때와 같은 값이다",
    Math.abs(기록[총회수].누적 - 기록[200].누적) < 1e-9,
    기록[200].누적 + " vs " + 기록[총회수].누적
  );
  ok(
    "[기록] 누적값이 ★최근 200건의 합★ 과 같다 (한 건 손익 × 200)",
    Math.abs(기록[총회수].누적 - 한건 * 상한) < 1e-6,
    기록[총회수].누적 + " vs " + 한건 * 상한
  );
  /* 상한이 없었다면 260배가 됐어야 합니다 — 얼마나 빠졌는지 숫자로 남깁니다 */
  ok(
    "[기록] 상한이 없었다면 나왔을 값과 다르다 (빠진 60건만큼)",
    Math.abs(기록[총회수].누적 - 한건 * 총회수) > 1e-6,
    "지금 " + 기록[총회수].누적 + " / 상한 없었다면 " + 한건 * 총회수
  );

  console.log("\n[3] 거래기록 자체도 200건에서 멈추는가");
  ok("199건째에는 거래기록이 199건", 기록[199].건수 === 199, String(기록[199].건수));
  ok("200건째에는 거래기록이 200건", 기록[200].건수 === 상한, String(기록[200].건수));
  ok(
    "[기록] 201건째부터 거래기록이 더 안 쌓인다",
    기록[201].건수 === 상한,
    String(기록[201].건수)
  );
  ok("[기록] 260건째에도 200건 그대로다", 기록[총회수].건수 === 상한, String(기록[총회수].건수));

  console.log("\n[4] 오래된 것이 빠지고 최신 것이 남는가");
  const 목록 = App.Trading.getSnapshot().closedTrades;
  ok("거래기록이 최근 순이다 (앞이 가장 최근)", 목록.length === 상한);
  const 시각들 = 목록.map((t) => t.closeTime);
  ok(
    "앞으로 갈수록 최근이다 (내림차순)",
    시각들.every((v, i) => i === 0 || 시각들[i - 1] >= v),
    "정렬이 뒤집혔습니다"
  );
}

/* =======================================================================
 * 손대면 안 되는 것 · 등록 확인
 * ===================================================================== */
console.log("\n[5] 손대면 안 되는 것");
{
  const md5 = (f) =>
    crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
  const LOCKED = require("./_locked-hashes.js");
  ok("trading.js 를 건드리지 않았다", md5("trading.js") === LOCKED.TRADING, md5("trading.js"));
  ok("ui.js 를 건드리지 않았다", md5("ui.js") === LOCKED.잠긴11["js/ui.js"], md5("ui.js"));

  const order = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");
  ok(
    "이 파일이 tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/closed-trades-cap-seal.test.js") !== -1,
    "등록 안 하면 npm test 가 안 돌립니다"
  );
}

try {
  win.close();
} catch (e) {
  /* jsdom 창을 못 닫아도 아래 process.exit 로 끝냅니다 */
}

console.log("\n통과 " + pass + " / 실패 " + fail);
if (fail > 0) process.exit(1);
process.exit(0);
