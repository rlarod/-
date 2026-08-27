/* tests/stale-notice-visible.test.js
 * =========================================================================
 * 시세 대기 안내가 폰에서 화면 밖으로 나가지 않게 — 재발 방지
 * =========================================================================
 * 무엇을 지키나
 *
 *  (1) 안내가 매수/매도 버튼 위에 붙는다
 *      버튼(.order-buttons)이 폰 시트에서 position:sticky; bottom:0 이라
 *      DOM 상 그 뒤에 있는 안내는 ★항상 버튼보다 아래★, 즉 화면 밖에
 *      그려집니다. 실측 360x800 — 버튼 725~788(화면 안),
 *      안내 839~872(화면 밖 72px). 버튼은 보이는데 왜 못 누르는지는
 *      안 보이는 상태였습니다.
 *
 *  (2) 버튼이 sticky 가 아닌 화면(태블릿·PC)에서는 예전 그대로 둔다
 *      폭을 숫자로 다시 세지 않고 ★실제 계산된 position★ 을 보고 정합니다.
 *      style.css 쪽 조건이 바뀌어도 따라가게 하기 위해서입니다.
 *
 *  (3) 안내가 버튼을 덮지 않는다 (z-index 2 < 버튼 3)
 *
 *  (4) 두 줄의 색이 다르다 — 위계
 *      첫 줄 #F0B429(포인트) / 그 뒤 #838DA4(보조). 둘 다 확정 팔레트.
 *
 *  (5) 문구를 바꾸지 않았다
 *
 * 브라우저를 띄우지 않습니다. 파일을 읽어서 규칙이 살아 있는지 봅니다.
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

const SRC = fs.readFileSync(path.join(REPO, "js/stale-price-guard.js"), "utf8");
const CSS = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

/* 주석을 걷어낸 "진짜 코드".
   왜 필요한가 — 주석에 "scrollIntoView 는 쓰지 않는다" 라고 적어두면
   그 글자 때문에 "scrollIntoView 를 쓴다" 로 잘못 잡힙니다.
   실제로 이 테스트를 처음 돌렸을 때 그렇게 2건이 헛되이 실패했습니다. */
const CODE = SRC
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ===================================================================== */
console.log("\n  (1) 안내를 버튼 위에 붙이는 코드가 있다");
/* ===================================================================== */
{
  ok("pinNotice() 가 있다", /function pinNotice\s*\(/.test(SRC));
  ok("paint() 가 pinNotice 를 부른다", /pinNotice\(box\)/.test(SRC));
  ok("매수/매도 버튼 줄을 찾아본다",
    /querySelector\("\.order-buttons"\)/.test(SRC));
  ok("sticky 로 붙인다", /box\.style\.position\s*=\s*"sticky"/.test(SRC));
  ok("버튼 줄 높이만큼 위로 띄운다(기기마다 다름)",
    /getBoundingClientRect\(\)\.height/.test(SRC) &&
    /box\.style\.bottom\s*=/.test(SRC),
    "고정 숫자로 박으면 기기마다 어긋납니다");
}

/* ===================================================================== */
console.log("\n  (2) 버튼이 sticky 일 때만 붙인다");
/* ===================================================================== */
{
  const fn = /function pinNotice[\s\S]*?\n  }/.exec(SRC);
  ok("pinNotice 본문을 찾았다", !!fn);
  const body = fn ? fn[0] : "";
  ok("계산된 position 을 실제로 읽는다",
    /getComputedStyle\(btns\)\.position/.test(body),
    "화면 폭 숫자를 여기서 다시 세면 style.css 와 어긋납니다");
  ok('"sticky" 일 때만 붙인다', /pos\s*===\s*"sticky"/.test(body));
  ok("아니면 원래대로 되돌린다(태블릿·PC 는 예전 그대로)",
    /box\.style\.position\s*=\s*""/.test(body) &&
    /box\.style\.bottom\s*=\s*""/.test(body));
  ok("폭 숫자(700 등)를 새로 박아넣지 않았다",
    !/innerWidth/.test(body) && !/matchMedia/.test(body));

  /* style.css 쪽 전제가 살아 있는지 — 버튼이 정말 sticky 인가 */
  ok("style.css 에서 매수/매도 줄이 시트 바닥에 sticky 로 붙어 있다",
    /\.amitalk-order \.order-buttons\{[\s\S]{0,200}?position:sticky/.test(CSS),
    "이 전제가 사라지면 pinNotice 는 아무 일도 안 하고 안내가 다시 화면 밖으로 갑니다");
}

/* ===================================================================== */
console.log("\n  (3) 안내가 버튼을 덮지 않는다");
/* ===================================================================== */
{
  const zNotice = /z-index:(\d+);?"/.exec(SRC.slice(SRC.indexOf("box.style.cssText")));
  ok("안내 상자에 z-index 가 있다", !!zNotice, "없으면 sticky 끼리 겹칠 때 순서가 안 정해집니다");
  const zBtn = /\.amitalk-order \.order-buttons\{[\s\S]{0,200}?z-index:(\d+)/.exec(CSS);
  ok("버튼 줄 z-index 를 찾았다", !!zBtn);
  const n = zNotice ? Number(zNotice[1]) : NaN;
  const b = zBtn ? Number(zBtn[1]) : NaN;
  ok("안내 z-index(" + n + ") 가 버튼(" + b + ") 보다 낮다", n < b,
    "안내가 버튼을 덮으면 주문 버튼을 못 누릅니다");
}

/* ===================================================================== */
console.log("\n  (4) 두 줄의 색이 달라 위계가 있다");
/* ===================================================================== */
{
  const paint = /box\.textContent = "";[\s\S]*?box\.style\.display = "";/.exec(SRC);
  ok("여러 줄을 그리는 부분을 찾았다", !!paint);
  const body = paint ? paint[0] : "";
  ok("첫 줄은 포인트색 #F0B429", /i === 0 \? "#F0B429"/.test(body));
  ok("그 뒤 줄은 보조색 #838DA4", /"#838DA4"/.test(body));
  ok("확정 팔레트 밖의 색을 새로 만들지 않았다",
    !/#(?!F0B429|838DA4|0D1422|1D273B)[0-9a-fA-F]{6}/.test(body),
    "팔레트에 없는 색이 섞였습니다");
  ok("innerHTML 을 쓰지 않는다(문구가 그대로 글자로 들어감)",
    !/innerHTML/.test(CODE));
  ok("줄바꿈은 <br> 그대로", /createElement\("br"\)/.test(body));
}

/* ===================================================================== */
console.log("\n  (5) 문구를 바꾸지 않았다");
/* ===================================================================== */
{
  ok("'시세를 받는 중' 안내가 그대로 있다", /시세를 받는 중/.test(SRC));
  ok("'지웠습니다' 안내가 그대로 있다", /지웠습니다/.test(SRC));
  ok("익절가(TP) 표기 그대로", /익절가\(TP\)/.test(SRC));
  ok("손절가(SL) 표기 그대로", /손절가\(SL\)/.test(SRC));
}

/* ===================================================================== */
console.log("\n  (6) 회원이 보던 자리를 강제로 옮기지 않는다");
/* ===================================================================== */
{
  ok("scrollIntoView 로 화면을 끌고 가지 않는다",
    !/scrollIntoView/.test(CODE),
    "안내를 보여주려고 회원이 보던 자리를 옮기면 스크롤 중에 놀랍니다");
  ok("scrollTop 을 직접 건드리지 않는다", !/\.scrollTop\s*=/.test(CODE));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
process.exit(0);
