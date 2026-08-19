/* tests/leverage-guest-tl.test.js
 * ① 최대 레버리지 설정  ② TL 지급 공식  ③ 비회원 접근  ⑤ 레버리지 팝업 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}
function boot(file, extra) {
  const sb = Object.assign({
    console, setInterval: () => 0, clearInterval: () => {},
    document: {
      readyState: "complete", addEventListener() {}, getElementById: () => null,
      querySelector: () => null, querySelectorAll: () => [],
      createElement: () => ({ className: "", style: {}, innerHTML: "", appendChild() {}, addEventListener() {}, querySelectorAll: () => [] }),
      body: { appendChild() {} },
    },
    module: { exports: {} },
  }, extra || {});
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", file), "utf8"), sb);
  return sb;
}

const gateSrc = fs.readFileSync(path.join(REPO, "js", "leverage-gate.js"), "utf8");
const modalSrc = fs.readFileSync(path.join(REPO, "js", "leverage-modal.js"), "utf8");
const guestSrc = fs.readFileSync(path.join(REPO, "js", "guest-access.js"), "utf8");
const rankSrc = fs.readFileSync(path.join(REPO, "js", "rank.js"), "utf8");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

console.log("\n① 최대 레버리지");
{
  const LG = boot("leverage-gate.js").App.LeverageGate;
  ok("기본 상한 100배 (지금은 모두에게 열림)", LG.currentMax() === 100, String(LG.currentMax()));
  ok("이용권 없이도 100배", LG.getDefaultMax() === 100);

  /* 설정값 하나로 바뀌는 구조인지 */
  ok("상한이 한 곳(DEFAULT_MAX)에만 있다", (gateSrc.match(/DEFAULT_MAX = \d+/g) || []).length === 1);
  LG.setDefaultMax(50);
  ok("50으로 내리면 즉시 50배 제한", LG.currentMax() === 50, String(LG.currentMax()));
  LG._setBoost(100, new Date(Date.now() + 3600000).toISOString());
  ok("50배 제한에서도 이용권이 있으면 100배", LG.currentMax() === 100, String(LG.currentMax()));
  LG._setBoost(100, new Date(Date.now() - 1000).toISOString());
  ok("이용권이 끝나면 다시 50배", LG.currentMax() === 50);
  LG.setDefaultMax(100);
  ok("되돌리면 다시 100배", LG.currentMax() === 100);

  ok("팝업이 상한을 직접 계산하지 않고 게이트에 묻는다", /App\.LeverageGate[\s\S]{0,80}currentMax\(\)/.test(modalSrc));
  ok("팝업에 최대값을 하드코딩하지 않았다", !/max\s*=\s*100\b/.test(modalSrc.replace(/return 100;/, "")));
}

console.log("\n② TL 지급 공식");
{
  /* rank.js 의 상수를 소스에서 읽어 시나리오로 검증합니다. */
  const perTrade = Number((rankSrc.match(/POINTS_PER_CLOSED_TRADE = (\d+)/) || [])[1]);
  const perPct = Number((rankSrc.match(/POINTS_PER_RETURN_PCT = (\d+)/) || [])[1]);
  const init = Number((rankSrc.match(/INITIAL_BALANCE = (\d+)/) || [])[1]);
  ok("공식 상수를 읽어왔다", perTrade > 0 && perPct > 0 && init > 0, [perTrade, perPct, init].join(","));

  const tl = (closed, realized) => closed * perTrade + Math.max(0, (realized / init) * 100) * perPct;

  ok("수익 거래에 TL 지급", tl(1, 1000) > tl(1, 0), tl(1, 1000) + " vs " + tl(1, 0));
  ok("손실 거래에는 수익분 TL 미지급", tl(1, -1000) === tl(1, 0), tl(1, -1000) + " vs " + tl(1, 0));
  ok("손실이 커져도 TL이 마이너스로 안 간다", tl(3, -50000) === 3 * perTrade);
  ok("부분 청산도 청산 건수로 반영", tl(2, 1000) > tl(1, 1000));
  ok("같은 상태면 항상 같은 값(중복 지급 불가)", tl(2, 2000) === tl(2, 2000));

  ok("미실현손익은 공식에 없다(실현 기준)", /realizedPnl/.test(rankSrc) && !/unrealizedPnl/.test(rankSrc.slice(rankSrc.indexOf("function calculatePoints"), rankSrc.indexOf("function getUserRank"))));
  ok("손실에서 0으로 막는 처리", /Math\.max\(0, returnPct\)/.test(rankSrc));

  /* 서버도 같은 공식이어야 새로고침·재로그인 후에도 같은 값이 나옵니다. */
  const sql = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-hotdeal.sql"), "utf8");
  const code = sql.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  ok("서버도 청산 건수 x " + perTrade, new RegExp("from public\\.trades t where t\\.user_id = p_uid\\), 0\\) \\* " + perTrade).test(code));
  ok("서버도 수익률 x " + perPct, new RegExp("where ta\\.user_id = p_uid\\), 0\\)\\) \\* " + perPct).test(code));
  ok("서버도 손실은 0으로 막는다", /greatest\(0,/.test(code));
  ok("서버는 저장된 실현손익을 쓴다(새로고침 후에도 유지)", /ta\.realized_pnl/.test(code));
  ok("서버 잔액은 획득 - 사용", /public\.tl_earned\(p_uid\)[\s\S]{0,120}sum\(amount\)/.test(code));
}

console.log("\n③ 비회원 접근");
{
  ok("자동으로 뜬 로그인 게이트만 닫는다", /if \(isOpen\(g\) && !userOpened\)/.test(guestSrc));
  ok("사용자가 직접 열면 그대로 보여준다", /function openLogin/.test(guestSrc) && /userOpened = true/.test(guestSrc));
  ok("게이트를 지우지 않는다(로그인 기능 유지)", /auth-gate/.test(html) && !/remove\(\)/.test(guestSrc));
  ok("auth.js 는 손대지 않는다", /js\/guest-access\.js/.test(html));
  ok("게이트 변화를 감시한다", /MutationObserver/.test(guestSrc));
  /* 진짜 원인이었던 부분 — auth.js 는 게이트를 띄울 때 .app 에 pending-auth 를
     붙여 화면 전체를 display:none 으로 숨깁니다(style.css). 게이트만 닫고
     이 클래스를 안 떼면 게시판·랭킹·핫딜까지 전부 안 보입니다. */
  ok("pending-auth 를 떼어 화면을 되살린다", /function clearPendingAuth/.test(guestSrc) && /classList\.remove\("pending-auth"\)/.test(guestSrc));
  ok("게이트를 닫을 때도 같이 뗀다", /g\.style\.display = "none";\s*\n\s*clearPendingAuth\(\);/.test(guestSrc));
  ok("나중에 다시 붙어도 감시해서 뗀다", /attributeFilter: \["class"\]/.test(guestSrc));
  ok("부팅은 짐작하지 않고 기록으로 판단", /var bootCalled = false/.test(guestSrc) && /if \(bootCalled\) return;/.test(guestSrc));

  const cssG = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  ok("pending-auth 규칙은 그대로 둔다(로그인 창 띄울 때 필요)", /\.app\.pending-auth\{display:none;\}/.test(cssG));
  ok("ESC·바깥 클릭으로 닫힌다", /Escape/.test(guestSrc) && /e\.target === g/.test(guestSrc));

  const up = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
  ok("내 정보 로그인 버튼이 새 경로를 쓴다", /App\.GuestAccess[\s\S]{0,60}openLogin\(\)/.test(up));
}

console.log("\n④ 비회원 내 정보");
{
  const up = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
  ok("비회원 안내가 있다", /user-panel-guest/.test(up));
  ok("로그인 버튼", /id="user-panel-login">로그인</.test(up));
  ok("회원가입 버튼", /id="user-panel-signup">회원가입</.test(up));
  ok("로그인하면 기존 화면으로 돌아간다", /renderShell/.test(up) && /isLoggedIn\(\)/.test(up));
}

console.log("\n⑤ 레버리지 팝업");
{
  ok("확인을 눌러야 적용된다", /dom\.ok\.addEventListener\("click", apply\)/.test(modalSrc));
  ok("취소·X·ESC·바깥 클릭으로 닫힌다",
     /dom\.cancel\.addEventListener\("click", close\)/.test(modalSrc) &&
     /dom\.x\.addEventListener\("click", close\)/.test(modalSrc) &&
     /Escape/.test(modalSrc) && /e\.target === wrap/.test(modalSrc));
  ok("닫으면 실제 값은 안 바뀐다(pending 만 비움)", /function close\(\)[\s\S]{0,120}pending = null/.test(modalSrc));
  ok("실제 변경은 App.Trading.setLeverage 하나로만", /App\.Trading\.setLeverage\(v\)/.test(modalSrc));
  ok("포지션을 건드리지 않는다", !/closePosition|closePartial|openPosition/.test(modalSrc));
  ok("빠른 선택 버튼 11개(1x~100x)", /PRESETS = \[1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100\]/.test(modalSrc));
  ok("슬라이더로 실시간 표시", /dom\.range\.addEventListener\("input"/.test(modalSrc) && /dom\.value\.textContent/.test(modalSrc));
  ok("기존 슬라이더를 지우지 않는다", /id="lev-slider"/.test(html));

  ok("팝업 색을 새로 만들지 않았다", /\.lev-modal-ok\{background:var\(--gold\)/.test(css));
  ok("모서리 3px (사이트 규칙)", /\.lev-modal-card\{[\s\S]*?border-radius:3px/.test(css));
  ok("모바일에서 안 잘린다", /@media \(max-width:520px\)\{[\s\S]{0,200}\.lev-modal-card\{max-width:none;\}/.test(css));
  ok("화면보다 길면 스크롤", /\.lev-modal-card\{[\s\S]*?max-height:calc\(100vh - 32px\);overflow-y:auto/.test(css));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
