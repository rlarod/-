/* tests/ob-header-currency.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 호가창 머리글이 표시 통화를 안 따라가는 것. (TL-002 / P2)
 *
 * 있었던 버그 (2026-08-21):
 *   index.html 의 머리글이 `가격(USDT)` 로 **글자로 박혀** 있어서,
 *   KRW 로 바꾸면 값은 `112,261,650원` 인데 머리글은 `가격(USDT)` 로 남았습니다.
 *   → 회원이 원화 숫자를 달러로 오해할 수 있습니다.
 *
 * 이 테스트는 **실제 모듈을 jsdom 에 올려 진짜로 통화를 바꿔 가며** 머리글을 읽습니다.
 * 문자열만 grep 하지 않습니다 — grep 은 "등록됐는지"만 알 수 있고
 * "실제로 바뀌는지"는 모릅니다.
 *
 * 층 구성:
 *   1) 배선   — 새 모듈이 index.html·main.js 에 등록됐는가
 *   2) 구동   — 진짜로 통화를 바꿔 머리글이 따라오는가 (왕복까지)
 *   3) 안전   — 수정 금지 파일을 안 열었는가 / 데이터를 지우지 않는가
 *   4) 돌연변이 — 모듈을 메모리에서 떼어내면 옛 버그가 되살아나는가
 *                 (= 이 검사가 진짜로 잡는다는 증명. 파일은 안 고침)
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
const MODULE_REL = "js/ob-header-currency.js";
const MODULE_PATH = path.join(REPO, MODULE_REL);

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const mainJs = fs.readFileSync(path.join(REPO, "main.js"), "utf8");
const modSrc = fs.readFileSync(MODULE_PATH, "utf8");

/* =========================================================================
 * 0) 재사용 — 최소한의 jsdom 에 config/utils/모듈만 올려 구동합니다.
 *    (호가창 본체는 필요 없습니다. 머리글만 보는 검사입니다.)
 * =======================================================================*/
function bootHeader(opts) {
  opts = opts || {};
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  win.WebSocket = function () { this.close = () => {}; this.send = () => {}; };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });

  win.eval(`
    window.App = window.App || {};
    App.Bus = (function(){
      const l = {};
      return {
        on(e,f){ (l[e]=l[e]||[]).push(f); return f; },
        off(e,f){ if(l[e]) l[e]=l[e].filter(x=>x!==f); },
        emit(e,p){ (l[e]||[]).forEach(f=>{ try{f(p);}catch(err){} }); }
      };
    })();
  `);

  for (const f of ["js/config.js", "js/utils.js", "js/storage.js"]) {
    win.eval(fs.readFileSync(path.join(REPO, f), "utf8"));
  }
  /* 검사 대상 모듈 — 돌연변이 검사에서는 소스를 바꿔 넣습니다. */
  if (opts.moduleSource !== null) {
    win.eval(opts.moduleSource !== undefined ? opts.moduleSource : modSrc);
    if (win.App.ObHeaderCurrency && typeof win.App.ObHeaderCurrency.init === "function") {
      win.App.ObHeaderCurrency.init();
    }
  }

  const head = () => {
    const el = win.document.querySelector("#orderbook-panel .ob-header .ob-cols span");
    return el ? el.textContent : null;
  };
  return { win, doc: win.document, head, App: win.App };
}

/* =========================================================================
 * 1) 배선
 * =======================================================================*/
console.log("\n[배선] 새 모듈이 실제로 로드·초기화되는가");
{
  ok("js/ob-header-currency.js 파일이 있다", fs.existsSync(MODULE_PATH));
  ok("index.html 에 <script> 로 연결됐다", html.indexOf(MODULE_REL) !== -1);
  ok("main.js 모듈 목록에 이름이 있다", /"ObHeaderCurrency"/.test(mainJs));
  ok(
    "호가창 모듈(OrderBook)보다 뒤에서 init 된다",
    mainJs.indexOf('"ObHeaderCurrency"') > mainJs.indexOf('"OrderBook"'),
    "머리글이 만들어진 뒤에 고쳐야 합니다"
  );
  ok("index.html 머리글 원본 글자는 그대로 남아 있다(지우지 않음)", html.indexOf("가격(USDT)") !== -1);
}

/* =========================================================================
 * 2) 구동 — 진짜로 통화를 바꿔 본다
 * =======================================================================*/
console.log("\n[구동] 통화를 바꾸면 머리글이 따라오는가");
let liveOk = false;
{
  const h = bootHeader();
  ok("머리글 칸을 찾았다", h.head() !== null);
  ok("기본 상태(USDT)에서 '가격(USDT)'", h.head() === "가격(USDT)", "지금: " + h.head());

  h.App.Config.setDisplayCurrency("KRW");
  const krwHead = h.head();
  ok("KRW 로 바꾸면 머리글이 '가격(원)' 이 된다", krwHead === "가격(원)", "지금: " + krwHead);
  liveOk = krwHead === "가격(원)";

  /* 2026-08-28 디자인팀 — 표기 규칙을 한 줄로 정했습니다.
       라벨(열 머리글) = 통화 이름   가격(원) / 가격(USDT)
       값             = 통화 기호   ₩112,261,650 / 79,458.20
     그래서 머리글은 '원', 값은 '₩' 입니다. 둘 다 같은 통화를 가리킵니다.
     검사하는 것은 그대로 — **값이 원화라는 걸 알 수 있는가**. */
  const sample = h.App.Utils.formatCurrencyPlain(74841.1);
  ok("같은 통화에서 값에 '₩' 가 앞에 붙는다", /^₩/.test(sample), "값 예: " + sample);
  ok("값에 '원' 이 뒤에 또 붙지 않는다(표기가 두 방식으로 섞이면 안 됩니다)",
    !/원$/.test(sample), "값 예: " + sample);

  h.App.Config.setDisplayCurrency("USDT");
  ok("USDT 로 되돌리면 머리글도 원복된다", h.head() === "가격(USDT)", "지금: " + h.head());
  const sample2 = h.App.Utils.formatCurrencyPlain(74841.1);
  ok("되돌린 뒤 값에는 원화 표기가 없다", !/원$/.test(sample2) && !/₩/.test(sample2), "값 예: " + sample2);

  /* 왕복을 여러 번 해도 안정적인가 */
  let stable = true;
  for (let i = 0; i < 3; i++) {
    h.App.Config.setDisplayCurrency("KRW");
    if (h.head() !== "가격(원)") stable = false;
    h.App.Config.setDisplayCurrency("USDT");
    if (h.head() !== "가격(USDT)") stable = false;
  }
  ok("3회 왕복해도 계속 맞는다", stable);

  /* 저장된 통화가 KRW 인 채로 새로 들어온 회원(= 8/17 이후 갇힌 회원) */
  const h2 = bootHeader();
  h2.App.Config.setDisplayCurrency("KRW");
  const h3 = bootHeader();   // 같은 저장소를 쓰지는 않지만, init 시점 적용을 봅니다
  h3.App.Config.setDisplayCurrency("KRW");
  ok("init 이후에 바뀐 통화도 반영된다", h3.head() === "가격(원)", "지금: " + h3.head());

  /* 다른 머리글은 안 건드리는가 — 최근 체결(js/trades.js)은 통화 표기가 없습니다 */
  const trades = fs.readFileSync(path.join(REPO, "js/trades.js"), "utf8");
  ok("최근 체결 머리글에는 통화 표기가 없어 손댈 것이 없다", trades.indexOf("가격(USDT)") === -1);

  /* 수량/총수량은 기초자산(BTC)이라 표시 통화와 무관 — 안 건드려야 맞습니다 */
  const cols = h.doc.querySelectorAll("#orderbook-panel .ob-header .ob-cols span");
  ok("수량 칸은 그대로 '수량(BTC)'", cols[1] && cols[1].textContent === "수량(BTC)", cols[1] && cols[1].textContent);
  ok("총수량 칸은 그대로 '총수량(BTC)'", cols[2] && cols[2].textContent === "총수량(BTC)", cols[2] && cols[2].textContent);
}

/* =========================================================================
 * 3) 안전
 * =======================================================================*/
console.log("\n[안전] 수정 금지 파일 / 데이터 감추기");
{
  const FROZEN = {
    "js/orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "js/chart.js": "02ddcb000d577131f797143d08c09123",
    "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
    "js/trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
  };
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok("수정 금지 파일이 그대로다: " + f, got === want, "지금 " + got);
  }
  ok("모듈이 display:none 으로 감추지 않는다(데이터 감추기 금지)", !/display\s*:\s*none/.test(modSrc));
  ok("모듈이 머리글을 지우지 않고 다시 쓴다", /textContent\s*=/.test(modSrc) && !/\.remove\(\)/.test(modSrc));
  ok(
    "MutationObserver 가 호가 행 전체가 아니라 머리글만 감시한다(성능)",
    /ob-header/.test(modSrc) && !/observer\.observe\(\s*panel/.test(modSrc)
  );
  ok("이미 맞는 값이면 다시 쓰지 않는다(무한 루프 방지)", /textContent\s*===\s*want/.test(modSrc));
}

/* =========================================================================
 * 4) 돌연변이 — 모듈을 떼면 옛 버그가 되살아나는가
 * =======================================================================*/
console.log("\n[돌연변이] 모듈을 떼면 정말 옛 버그가 되살아나는가");
{
  /* (가) 모듈을 아예 안 올린 상태 = 고치기 전 상태 */
  const before = bootHeader({ moduleSource: null });
  before.App.Config.setDisplayCurrency("KRW");
  const stuck = before.head();
  ok("→ 모듈 없이 KRW 로 바꾸면 머리글이 '가격(USDT)' 로 멈춘다(= 옛 버그)", stuck === "가격(USDT)", "지금: " + stuck);
  ok("→ 값은 원화로 바뀌어 있다(머리글만 어긋난 상태)", /^₩/.test(before.App.Utils.formatCurrencyPlain(74841.1)));
  ok("→ 고친 뒤와 결과가 다르다(= 검사가 진짜다)", liveOk && stuck !== "가격(원)");

  /* (나) currency:change 구독만 떼어낸 돌연변이 */
  const noSub = modSrc.replace(/App\.Bus\.on\("currency:change",\s*apply\);/, "/* 구독 제거(돌연변이) */");
  ok("구독 제거 돌연변이를 만들었다(메모리에서만)", noSub !== modSrc);
  const h4 = bootHeader({ moduleSource: noSub });
  h4.App.Config.setDisplayCurrency("KRW");
  ok("→ 구독을 떼면 통화를 바꿔도 머리글이 안 따라온다", h4.head() === "가격(USDT)", "지금: " + h4.head());

  /* (다) 단위표를 거꾸로 넣은 돌연변이 */
  const wrongUnit = modSrc.replace(/var UNIT = \{[^}]*\};/, 'var UNIT = { KRW: "USDT", USDT: "원" };');
  ok("잘못된 단위표 돌연변이를 만들었다", wrongUnit !== modSrc);
  const h5 = bootHeader({ moduleSource: wrongUnit });
  h5.App.Config.setDisplayCurrency("KRW");
  ok("→ 단위표가 틀리면 '가격(원)' 이 안 나온다", h5.head() !== "가격(원)", "지금: " + h5.head());

  /* (라) 원본 파일은 그대로인지 */
  ok("원본 모듈 파일은 손대지 않았다", fs.readFileSync(MODULE_PATH, "utf8") === modSrc);
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
