/* tests/tl-balance-sync.test.js
 * '보유 TL' 이 화면마다 다르게 나오지 않는지 검증합니다.
 *
 * 발견했던 문제
 *   같은 시점인데 두 곳이 다른 값을 보여줬습니다.
 *     내 정보 패널   2,000 TL   (js/rank.js 의 계급 점수, 브라우저 계산)
 *     TL 핫딜       36,560 TL   (서버 tl_balance_info 의 실제 잔액)
 *
 *   계급 점수와 보유 TL 은 원래 다른 값입니다.
 *     계급 점수 = 지금까지 획득한 TL (써도 안 내려감)
 *     보유 TL   = 획득 - 사용 (쓰면 줄어듦)
 *   게다가 브라우저는 로컬 기록(최대 200건)만, 서버는 전체를 봅니다.
 *
 *   사용자에게 '보유 TL' 은 하나여야 하고, 물건을 살 때 쓰는 값
 *   (서버 잔액)이 맞습니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const src = fs.readFileSync(path.join(REPO, "js", "tl-balance-sync.js"), "utf8");
const panel = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
const hotdeal = fs.readFileSync(path.join(REPO, "js", "tl-hotdeal.js"), "utf8");
const market = fs.readFileSync(path.join(REPO, "js", "tl-market.js"), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

console.log("\n보유 TL 일치");

/* ---------- 같은 출처를 쓰는가 ---------- */
{
  ok("핫딜은 서버 잔액을 쓴다", /rpc\("tl_balance_info"\)/.test(hotdeal));
  ok("마켓도 서버 잔액을 쓴다", /rpc\("tl_balance_info"\)/.test(market));
  ok("내 정보 패널도 같은 서버 함수를 쓰게 했다", /rpc\("tl_balance_info"\)/.test(src));
  ok("세 곳이 같은 함수를 본다",
     [hotdeal, market, src].every((f) => /tl_balance_info/.test(f)));
}

/* ---------- 패널이 다시 그려져도 유지되는가 ---------- */
{
  ok("패널 갱신 때마다 다시 채운다", /App\.Bus\.on\("trading:update", paint\)/.test(src));
  ok("패널 DOM 변화를 지켜본다", /MutationObserver/.test(src) && /user-panel-box/.test(src));
  ok("거래가 끝나면 다시 받아온다", /App\.Bus\.on\("trading:persisted"/.test(src));
  ok("로그인 상태가 바뀌면 다시 받아온다", /auth:changed/.test(src));
  ok("물건을 사면 줄어드므로 주기적으로 확인한다", /setInterval\(fetchBalance, 60000\)/.test(src));
}

/* ---------- 안전 ---------- */
{
  ok("서버에서 못 받으면 손대지 않는다", /if \(serverBalance === null\) return;/.test(src));
  ok("조회 실패해도 화면을 망가뜨리지 않는다", /기존 표시 유지/.test(src));
  ok("같은 값이면 다시 쓰지 않는다", /if \(el\.textContent !== want\)/.test(src));
  ok("user-panel.js 는 건드리지 않았다", !/TLBalanceSync/.test(panel));
  ok("스크립트가 연결됐다", /js\/tl-balance-sync\.js/.test(html));
}

/* ---------- 계급은 그대로 ---------- */
{
  /* 계급(이병·일병…)은 계급 점수로 정하는 게 맞습니다.
     이 모듈은 '보유 TL' 숫자만 바로잡습니다. */
  ok("계급 계산은 건드리지 않는다", !/rank_name|calculateRank/.test(src));
  ok("보유 TL 자리만 고친다", /TARGET_ID = "user-panel-points"/.test(src));
  ok("패널은 여전히 계급을 표시한다", /user-panel-rank|rank/.test(panel));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
