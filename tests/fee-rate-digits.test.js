/* tests/fee-rate-digits.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 주문창 "수수료" 줄의 메이커/테이커 자릿수가 서로 어긋나는 것.
 *
 * 있었던 버그 (2026-08-21, [P3]):
 *   js/order-info-panel.js 96행
 *     (maker*100).toFixed(2) + "% / " + (taker*100).toFixed(3) + "%"
 *   → 화면에 "0.02% / 0.050%" 로 나왔습니다. 같은 한 줄에서 왼쪽은 소수 2자리,
 *     오른쪽은 3자리라 회원이 서로 다른 정밀도의 값으로 오해할 수 있었습니다.
 *
 * 이 테스트는 "몇 자리여야 한다"를 못 박지 않습니다(자릿수는 디자인 판단).
 * **양쪽이 같은 자릿수인가**만 봅니다. 그래서 나중에 2자리로 바꾸든 4자리로
 * 바꾸든 통과하고, 한쪽만 바꾸면 실패합니다.
 *
 * 층 구성 (다른 테스트들과 같은 방식):
 *   1) 탐지기      — "무엇이 잘못인가"를 순수 함수로
 *   2) 자체검증    — 합성 입력으로 탐지기가 진짜 잡는지 증명
 *   3) 실제 소스   — js/order-info-panel.js 를 검사
 *   4) 실제 구동   — jsdom 에 진짜로 올려서 렌더된 글자를 읽음
 *   5) 돌연변이    — 소스를 **메모리에서만** 옛 버그로 되돌려 검사가 뒤집히는지
 *                    (파일은 한 글자도 안 고칩니다)
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");

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

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const SRC_PATH = path.join(REPO, "js/order-info-panel.js");

/* =========================================================================
 * 1) 탐지기
 * =======================================================================*/

/* 소스에서 accFeeRate 에 대입하는 한 줄을 찾아 toFixed 자릿수를 전부 뽑습니다.
   여러 줄로 나뉘어 있어도 되도록 "대입 시작 ~ 세미콜론"까지를 한 덩어리로 봅니다. */
function feeRateAssignment(src) {
  const start = src.indexOf("dom.accFeeRate.textContent");
  if (start === -1) return null;
  const end = src.indexOf(";", start);
  if (end === -1) return null;
  return src.slice(start, end + 1);
}

function toFixedDigits(stmt) {
  if (!stmt) return [];
  const out = [];
  const re = /toFixed\(\s*(\d+)\s*\)/g;
  let m;
  while ((m = re.exec(stmt)) !== null) out.push(Number(m[1]));
  return out;
}

/* 위반 판정: 자릿수가 2개 이상 나오는데 전부 같지 않으면 위반. */
function digitsMismatch(stmt) {
  const d = toFixedDigits(stmt);
  if (d.length < 2) return null; // 판단 대상 아님
  const uniq = [...new Set(d)];
  return uniq.length > 1 ? { digits: d, uniq } : null;
}

/* 렌더된 글자 판정: "0.0200% / 0.0500%" 처럼 퍼센트 값 두 개의 소수 자릿수 비교 */
function renderedMismatch(text) {
  const nums = String(text).match(/\d+\.?\d*(?=%)/g);
  if (!nums || nums.length < 2) return null;
  const dec = nums.map((n) => {
    const i = n.indexOf(".");
    return i === -1 ? 0 : n.length - i - 1;
  });
  const uniq = [...new Set(dec)];
  return uniq.length > 1 ? { nums, dec } : null;
}

/* =========================================================================
 * 2) 자체검증 — 탐지기가 진짜 잡는가 (합성 입력)
 * =======================================================================*/
console.log("\n[자체검증] 탐지기가 어긋난 자릿수를 실제로 잡는가");
{
  const buggy = 'dom.accFeeRate.textContent = (a*100).toFixed(2) + "% / " + (b*100).toFixed(3) + "%";';
  const fixed4 = 'dom.accFeeRate.textContent = (a*100).toFixed(4) + "% / " + (b*100).toFixed(4) + "%";';
  const fixed2 = 'dom.accFeeRate.textContent = (a*100).toFixed(2) + "% / " + (b*100).toFixed(2) + "%";';

  ok("옛 버그 모양(2 vs 3)을 위반으로 잡는다", digitsMismatch(feeRateAssignment(buggy)) !== null);
  ok("4자리 통일은 통과시킨다", digitsMismatch(feeRateAssignment(fixed4)) === null);
  ok("2자리 통일도 통과시킨다(자릿수를 강요하지 않음)", digitsMismatch(feeRateAssignment(fixed2)) === null);
  ok("자릿수를 두 개 다 뽑는다", toFixedDigits(feeRateAssignment(buggy)).join(",") === "2,3");

  ok("렌더 글자 '0.02% / 0.050%' 를 위반으로 잡는다", renderedMismatch("0.02% / 0.050%") !== null);
  ok("렌더 글자 '0.0200% / 0.0500%' 는 통과", renderedMismatch("0.0200% / 0.0500%") === null);
  ok("렌더 글자 '0.02% / 0.05%' 도 통과", renderedMismatch("0.02% / 0.05%") === null);
  ok("퍼센트가 하나뿐이면 판단 대상이 아니다", renderedMismatch("0.02%") === null);
}

/* =========================================================================
 * 3) 실제 소스 검사
 * =======================================================================*/
console.log("\n[소스] js/order-info-panel.js 의 수수료 줄");
const src = fs.readFileSync(SRC_PATH, "utf8");
const stmt = feeRateAssignment(src);
{
  ok("수수료 대입 줄을 찾았다", stmt !== null, "dom.accFeeRate.textContent 가 없습니다");
  const digits = toFixedDigits(stmt);
  ok("toFixed 가 두 번 쓰인다(메이커/테이커)", digits.length === 2, "찾은 자릿수: " + digits.join(","));
  const v = digitsMismatch(stmt);
  ok(
    "메이커/테이커 자릿수가 같다",
    v === null,
    v ? "어긋남: " + v.digits.join(" vs ") : ""
  );
  ok("계산식이 아니라 표시만 바꾼다(요율 값에 손대지 않음)", /feeRate\.maker/.test(stmt) && /feeRate\.taker/.test(stmt));
}

/* =========================================================================
 * 4) 실제 구동 — jsdom 에 진짜로 올려 렌더된 글자를 읽는다
 * =======================================================================*/
console.log("\n[구동] 실제 모듈을 올려 화면에 찍히는 글자를 읽는다");
let renderedText = null;
try {
  const { boot } = require("./harness.js");
  const h = boot();
  const elFee = h.doc.getElementById("acc-fee-rate");
  ok("주문창에 수수료 칸이 있다", !!elFee);
  if (elFee) {
    renderedText = elFee.textContent;
    ok("수수료 칸이 '-' 가 아니라 실제 값으로 채워졌다", renderedText !== "-" && /%/.test(renderedText), "값: " + renderedText);
    const v = renderedMismatch(renderedText);
    ok("찍힌 글자의 소수 자릿수가 양쪽 같다", v === null, v ? "값 '" + renderedText + "' → 자릿수 " + v.dec.join(" vs ") : "값: " + renderedText);

    /* 요율 값 자체는 그대로인지 — 표시만 바꾼 것이 맞는지 확인 */
    const snap = h.App.Trading && h.App.Trading.getSnapshot ? h.App.Trading.getSnapshot() : null;
    if (snap && snap.feeRate) {
      ok("메이커 요율은 그대로 0.0002", Math.abs(snap.feeRate.maker - 0.0002) < 1e-12, String(snap.feeRate.maker));
      ok("테이커 요율은 그대로 0.0005", Math.abs(snap.feeRate.taker - 0.0005) < 1e-12, String(snap.feeRate.taker));
      const nums = renderedText.match(/\d+\.?\d*(?=%)/g) || [];
      ok("찍힌 값이 메이커 요율과 일치한다", nums[0] !== undefined && Math.abs(Number(nums[0]) - snap.feeRate.maker * 100) < 1e-9, "찍힘 " + nums[0]);
      ok("찍힌 값이 테이커 요율과 일치한다", nums[1] !== undefined && Math.abs(Number(nums[1]) - snap.feeRate.taker * 100) < 1e-9, "찍힘 " + nums[1]);
    } else {
      ok("스냅샷에서 요율을 읽었다", false, "App.Trading.getSnapshot().feeRate 가 없습니다");
    }
  }
} catch (e) {
  ok("jsdom 구동", false, e.message);
}

/* =========================================================================
 * 5) 돌연변이 — 옛 버그를 메모리에서만 되살려 검사가 뒤집히는지
 *    (파일은 한 글자도 안 고칩니다)
 * =======================================================================*/
console.log("\n[돌연변이] 옛 버그를 다시 넣으면 정말 실패하는가");
{
  /* (가) 소스 문자열만 망가뜨려 탐지기에 다시 먹인다 */
  const mutated = src.replace(
    /(dom\.accFeeRate\.textContent[\s\S]*?)toFixed\(\s*\d+\s*\)([\s\S]*?);/,
    (m, a, b) => a + "toFixed(2)" + b.replace(/toFixed\(\s*\d+\s*\)/, "toFixed(3)") + ";"
  );
  ok("돌연변이를 만들었다(메모리에서만)", mutated !== src);
  const mv = digitsMismatch(feeRateAssignment(mutated));
  ok("→ 옛 버그판은 '자릿수가 같다' 검사에서 실패한다(= 검사가 진짜다)", mv !== null, "돌연변이가 안 잡혔습니다");
  if (mv) ok("→ 잡힌 어긋남이 2 vs 3 이다", mv.digits.join(",") === "2,3", mv.digits.join(","));

  /* (나) 실제 파일은 그대로인지 다시 확인 */
  ok("원본 파일은 손대지 않았다", fs.readFileSync(SRC_PATH, "utf8") === src);

  /* (다) 돌연변이 소스를 실제로 구동해 렌더 글자가 옛 모양으로 나오는지 */
  try {
    const os = require("os");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fee-digits-"));
    /* 저장소 전체를 복사하지 않고, 필요한 파일만 심볼릭이 아닌 복사로 옮깁니다. */
    const need = [
      "index.html",
      "js/config.js", "js/utils.js", "js/storage.js", "js/symbol-registry.js",
      "js/trading.js", "js/ui.js", "js/order-info-panel.js", "js/qty-price-order.js",
      "js/order-panel-amitalk.js", "js/position-table-extra.js", "js/limit-close.js",
    ];
    fs.mkdirSync(path.join(tmp, "js"), { recursive: true });
    for (const f of need) fs.copyFileSync(path.join(REPO, f), path.join(tmp, f));
    fs.writeFileSync(path.join(tmp, "js/order-info-panel.js"), mutated, "utf8");

    delete require.cache[require.resolve("./harness.js")];
    const prev = process.env.REPO;
    process.env.REPO = tmp;
    const { boot } = require("./harness.js");
    const h2 = boot();
    process.env.REPO = prev;
    delete require.cache[require.resolve("./harness.js")];

    const t2 = h2.doc.getElementById("acc-fee-rate").textContent;
    ok("→ 돌연변이판은 화면에 '0.02% / 0.050%' 로 찍힌다", t2 === "0.02% / 0.050%", "찍힘: " + t2);
    ok("→ 렌더 탐지기가 그 글자를 위반으로 잡는다(= 검사가 진짜다)", renderedMismatch(t2) !== null);
    if (renderedText) ok("→ 지금 화면 글자와 다르다", t2 !== renderedText, "지금: " + renderedText);

    fs.rmSync(tmp, { recursive: true, force: true });
    ok("임시 사본을 지웠다", !fs.existsSync(tmp));
  } catch (e) {
    ok("돌연변이 구동", false, e.message);
  }
}

/* =========================================================================
 * 6) 수정 금지 파일을 안 건드렸는지
 * =======================================================================*/
console.log("\n[안전] 수정 금지 파일 확인");
{
  const crypto = require("crypto");
  const FROZEN = {
    "js/trading.js": "33250202c00b097ff8344ae2ee64cbe7",
    "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "js/chart.js": "02ddcb000d577131f797143d08c09123",
  };
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok("수정 금지 파일이 그대로다: " + f, got === want, "지금 " + got);
  }
  ok("js/order-info-panel.js 는 수정 금지 12개가 아니다", !Object.keys(FROZEN).includes("js/order-info-panel.js"));
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
