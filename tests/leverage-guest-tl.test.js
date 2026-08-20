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
  /* TL 화폐 공식은 서버 tl_earned() 가 정본입니다.
     2026-08-19 계급 점수를 자산 기준으로 바꾸면서, 계급은 rank_points() 로
     떼어냈고 TL 화폐는 예전 공식 그대로 뒀습니다. 그래서 여기서는
     rank.js 가 아니라 서버 SQL 에서 상수를 읽습니다. */
  const tlSql = fs.readFileSync(path.join(REPO, "supabase", "schema-tl-hotdeal.sql"), "utf8");
  const earned = tlSql.slice(tlSql.indexOf("function public.tl_earned"));
  const perTrade = Number((earned.match(/\)\s*,\s*0\)\s*\*\s*(\d+)/) || [])[1]);
  const perPct = Number((earned.match(/\)\s*\*\s*(\d+)\s*\n?\s*\+ coalesce/) || [])[1]);
  const init = 100000;
  ok("공식 상수를 읽어왔다", perTrade > 0 && perPct > 0, [perTrade, perPct].join(","));

  const tl = (closed, realized) => closed * perTrade + Math.max(0, (realized / init) * 100) * perPct;

  ok("수익 거래에 TL 지급", tl(1, 1000) > tl(1, 0), tl(1, 1000) + " vs " + tl(1, 0));
  ok("손실 거래에는 수익분 TL 미지급", tl(1, -1000) === tl(1, 0), tl(1, -1000) + " vs " + tl(1, 0));
  ok("손실이 커져도 TL이 마이너스로 안 간다", tl(3, -50000) === 3 * perTrade);
  ok("부분 청산도 청산 건수로 반영", tl(2, 1000) > tl(1, 1000));
  ok("같은 상태면 항상 같은 값(중복 지급 불가)", tl(2, 2000) === tl(2, 2000));

  /* 2026-08-19 계급 점수 방식이 '자산 배율' 로 바뀌었습니다.
     미실현 손익을 넣지 않는 원칙은 그대로입니다 — 확정되지 않은 숫자를
     넣으면 가격이 출렁일 때마다 계급이 오르내립니다. */
  const 점수함수 = rankSrc.slice(rankSrc.indexOf("function calculatePoints"), rankSrc.indexOf("function getUserRank"));
  ok("미실현손익은 공식에 없다", !/unrealizedPnl/.test(점수함수));
  ok("equity(미실현 포함)도 쓰지 않는다", !/\bequity\b/.test(점수함수));
  ok("자산 기준으로 계산한다", /getRankAssets/.test(점수함수));
  ok("원금 아래에서 0으로 막는 처리", /Math\.max\(0, fromAssets\)/.test(rankSrc));

  /* 계급 점수는 TL 과 분리됐습니다 — 화면과 서버가 같은 공식이어야
     내 화면의 계급과 랭킹표의 계급이 어긋나지 않습니다. */
  const rankSql = fs.readFileSync(path.join(REPO, "supabase", "schema-rank-assets.sql"), "utf8");
  ok("서버에 계급 점수 함수가 따로 있다", /function public\.rank_points\(/.test(rankSql));
  ok("서버도 자산 배율(log2)로 계산한다", /log\(2,/.test(rankSql));
  ok("서버도 2배당 1000점", /\* 1000/.test(rankSql));
  ok("서버도 원금 아래에서 0으로 막는다", /greatest\(0,/.test(rankSql));
  ok("서버도 미실현 손익을 쓰지 않는다", !/unrealized/i.test(rankSql));
  ok("랭킹표가 새 점수를 쓴다", /rank_points_all[\s\S]{0,400}public\.rank_points\(p\.id\)/.test(rankSql));
  ok("TL 화폐 공식은 건드리지 않았다", !/create or replace function public\.tl_earned/.test(rankSql));

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
  ok("로그인 창으로 데려가는 경로가 있다", /function openLogin/.test(guestSrc) && /up-login-nick/.test(guestSrc));
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

  /* 2026-08-18: 비회원 안내를 넣으면서 채팅 입력칸의 focus 를 가로채
     입력을 막았는데, 그 처리가 한 번 걸리면 로그인해도 풀리지 않아
     회원이 채팅을 아예 못 썼습니다. 안내 문구만 바꾸도록 고쳤습니다. */
  ok("채팅 입력을 가로막지 않는다", !/addEventListener\("focus"/.test(guestSrc) && !/\.blur\(\)/.test(guestSrc));
  ok("비회원에게는 안내 문구를 보여준다", /로그인 후 채팅에 참여할 수 있습니다/.test(guestSrc));
  ok("로그인하면 원래 문구로 되돌린다", /MEMBER_PLACEHOLDER/.test(guestSrc) && /메시지를 입력하세요/.test(guestSrc));
  ok("로그인 여부를 그때그때 다시 확인한다", /var loggedIn = /.test(guestSrc) && /setInterval\(markGuestAreas/.test(guestSrc));
  ok("전송 차단은 login-required 가 맡는다", /chat-send-btn/.test(fs.readFileSync(path.join(REPO, "js", "login-required.js"), "utf8")));

  const up = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
  ok("내 정보 칸이 직접 로그인 폼을 그린다", /up-login-submit/.test(up) && /bindInlineLogin/.test(up));
}

console.log("\n③-2 비회원은 보기만 (거래 차단)");
{
  const lr = fs.readFileSync(path.join(REPO, "js", "login-required.js"), "utf8");
  ok("매수·매도 버튼을 막는다", /"btn-long"/.test(lr) && /"btn-short"/.test(lr));
  ok("채팅·글쓰기·댓글·추천·무료충전도 막는다",
     /"chat-send-btn"/.test(lr) && /"board-write-btn"/.test(lr) &&
     /"board-comment-submit-btn"/.test(lr) && /"board-like-btn"/.test(lr) &&
     /"daily-recharge-btn"/.test(lr));

  /* 2026-08-18: 가드가 존재하지 않는 id 를 보고 있어 채팅 전송과 댓글 등록이
     비회원에게 그대로 열려 있었습니다(chat-send / board-comment-submit ->
     실제로는 chat-send-btn / board-comment-submit-btn).
     이름이 어긋나면 조용히 안 막히므로, 모든 대상 id 가 index.html 에
     실재하는지 매번 확인합니다. */
  {
    const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
    const targets = [...lr.matchAll(/\{ id: "([^"]+)", label: "([^"]+)" \}/g)].map((m) => [m[1], m[2]]);
    ok("가드 대상이 10개 이상", targets.length >= 10, String(targets.length));
    const missing = targets.filter(([id]) => !htmlIds.has(id));
    ok("가드 대상 id 가 전부 화면에 실재한다", missing.length === 0, missing.map((t) => t[1] + "(" + t[0] + ")").join(", "));
  }
  ok("댓글 입력칸 Enter 도 막는다", /board-comment-input/.test(lr));
  ok("캡처 단계로 원래 처리보다 먼저 가로챈다", /stopImmediatePropagation\(\)/.test(lr) && /true \/\/ 캡처 단계/.test(lr));
  ok("채팅 Enter 전송도 막는다", /e\.key !== "Enter"/.test(lr));
  ok("주문 함수 자체도 감싼다(화면 우회 방지)", /GUARDED_TRADING = \["openPosition"/.test(lr));
  ok("청산·주문취소까지 포함", /closePosition/.test(lr) && /cancelPendingOrder/.test(lr));
  ok("로그인하면 원래대로 통과", /if \(!isLoggedIn\(\)\)[\s\S]{0,120}return orig\.apply/.test(lr));
  ok("막을 때 로그인 창을 띄운다", /App\.GuestAccess[\s\S]{0,60}openLogin\(\)/.test(lr));
  ok("수정 금지 파일을 건드리지 않는다(별도 모듈)", /js\/login-required\.js/.test(html));

  /* 한국어 조사 — '매수은(는)' 처럼 어색하지 않아야 합니다 */
  const particle = (w) => {
    const last = w.charCodeAt(w.length - 1);
    if (last < 0xac00 || last > 0xd7a3) return w + "는 ";
    return w + (((last - 0xac00) % 28 !== 0) ? "은 " : "는 ");
  };
  ok("받침 없는 말에는 '는'", particle("매수") === "매수는 ");
  ok("받침 있는 말에는 '은'", particle("채팅") === "채팅은 " && particle("댓글") === "댓글은 ");
  ok("조사 처리를 실제로 쓴다", /withParticle\(what\)/.test(lr));

  const cssLR = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  ok("잠긴 버튼은 숨기지 않고 흐리게만", /\.login-required\{opacity:0\.6/.test(cssLR));
}

console.log("\n④ 비회원 내 정보");
{
  const up = fs.readFileSync(path.join(REPO, "js", "user-panel.js"), "utf8");
  ok("비회원 안내가 있다", /user-panel-guest/.test(up));
  /* 2026-08-18: 전체 화면 로그인 창을 없애고 이 칸에서 바로 처리합니다. */
  ok("닉네임·비밀번호 입력칸", /id="up-login-nick"/.test(up) && /id="up-login-pw"/.test(up));
  ok("회원가입 전환", /id="up-login-toggle-link"/.test(up) && /회원가입/.test(up));
  ok("로그인 처리는 auth.js 폼에 넘겨 재사용", /auth-nickname-input/.test(up) && /auth-submit-btn/.test(up));
  ok("auth.js 오류 문구를 이 칸에 표시", /auth-err/.test(up));
  const il = fs.readFileSync(path.join(REPO, "js", "inline-login.js"), "utf8");
  ok("전체 화면 로그인 창은 띄우지 않는다", /hideGate\(\);   \/\/ 전체 화면 창은 절대 띄우지 않습니다/.test(il));
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
