/* tests/kakao-login.test.js
 * 카카오 로그인이 기존 로그인 흐름을 깨지 않는지 검증합니다.
 *
 * 가장 중요한 것
 *   js/auth.js 는 "세션은 있는데 닉네임이 없으면" 곧바로 로그아웃시킵니다.
 *   카카오로 처음 들어온 사람이 정확히 그 상태이므로, 닉네임을 받아
 *   profiles 에 넣기 "전에" auth.js 가 시작되면 무조건 튕깁니다.
 *   그래서 순서를 테스트로 못 박아 둡니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "kakao-login.js"), "utf8");
const RULES = fs.readFileSync(path.join(REPO, "js", "nickname-rules.js"), "utf8");

/* 카카오 사용자 한 명을 만들어 줍니다. */
function kakaoUser(over) {
  return Object.assign({
    id: "uid-1",
    email: "a@kakao.test",
    app_metadata: { provider: "kakao" },
    user_metadata: { name: "카카오닉" },
    identities: [{ provider: "kakao", provider_id: "9876543210" }],
  }, over || {});
}

/* 화면 하나를 띄우고 모듈을 올립니다.
 * opts.session   : getSession 이 돌려줄 세션
 * opts.profile   : profiles 조회 결과(null 이면 신규 회원)
 * opts.insertErr : insert 가 돌려줄 오류 */
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!doctype html><html><body>' +
    '<div id="user-panel-body"><div class="user-panel-guest">' +
    '<button id="up-login-submit">로그인</button>' +
    '<div class="up-login-toggle">회원가입</div>' +
    "</div></div></body></html>",
    { runScripts: "outside-only", url: "https://tl.test/index.html" }
  );
  const win = dom.window;
  const calls = [];

  win.App = {};
  win.console = { warn() {}, log() {}, error() {} };

  /* auth.js 를 대신하는 최소 스텁 — init 이 언제 불렸는지만 기록합니다. */
  win.App.Auth = {
    init() { calls.push(["auth.init"]); },
    getNickname: () => null,
  };

  const fake = {
    auth: {
      getSession: async () => ({ data: { session: opts.session === undefined ? null : opts.session }, error: null }),
      signOut: async () => { calls.push(["signOut"]); return {}; },
      signInWithOAuth: async (arg) => { calls.push(["oauth", arg]); return { error: null }; },
    },
    from(table) {
      const api = {
        select: () => api,
        eq: () => api,
        maybeSingle: async () => ({ data: opts.profile === undefined ? null : opts.profile, error: null }),
        insert: async (row) => { calls.push(["insert", table, row]); return { error: opts.insertErr || null }; },
        upsert: async (row, o) => { calls.push(["upsert", table, row, o]); return { error: null }; },
      };
      return api;
    },
  };
  win.App.SupabaseClient = { get: () => fake };

  win.eval(RULES);
  win.App.NicknameRules.init = win.App.NicknameRules.init || function () {};
  win.eval(SRC);

  return { win, doc: win.document, calls, K: win.App.KakaoLogin };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async function run() {
  console.log("\n카카오 로그인");

  /* ---------- 로그인 출처 구분 ---------- */
  {
    const { K } = boot({});
    ok("카카오 회원을 알아본다", K.isKakaoUser(kakaoUser()));
    ok("닉네임+비밀번호 회원은 카카오가 아니다",
      !K.isKakaoUser({ id: "x", app_metadata: { provider: "email" }, identities: [{ provider: "email" }] }));
    ok("여러 방식을 연결한 계정도 알아본다",
      K.isKakaoUser({ id: "x", app_metadata: { provider: "email" }, identities: [{ provider: "email" }, { provider: "kakao", provider_id: "1" }] }));
    ok("카카오 회원번호를 꺼낸다", K.kakaoUserId(kakaoUser()) === "9876543210");
    ok("카카오 회원번호가 없으면 지어내지 않는다", K.kakaoUserId({ id: "x", identities: [] }) === null);
  }

  /* ---------- 카카오 닉네임 제안 ---------- */
  {
    const { K } = boot({});
    ok("규칙에 맞는 카카오 닉네임은 제안한다", K.kakaoNickname(kakaoUser()) === "카카오닉");
    ok("규칙에 어긋나면 제안하지 않는다(억지로 고치지 않음)",
      K.kakaoNickname(kakaoUser({ user_metadata: { name: "★관리자★" } })) === "");
    ok("공백이 든 카카오 닉네임도 제안하지 않는다",
      K.kakaoNickname(kakaoUser({ user_metadata: { name: "김 갱" } })) === "");
    ok("카카오가 이름을 안 줘도 안 터진다", K.kakaoNickname(kakaoUser({ user_metadata: {} })) === "");
  }

  /* ---------- auth.js 를 감쌌는지 ---------- */
  {
    const { win } = boot({});
    ok("auth.js 의 init 을 감쌌다", win.App.Auth.__kakaoWrapped === true);
    ok("auth.js 파일 자체는 손대지 않았다(감싸기만)",
      !fs.readFileSync(path.join(REPO, "js", "auth.js"), "utf8").includes("kakao"));
  }

  /* ---------- 순서: 닉네임이 저장된 다음에 auth.js 가 시작된다 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser() }, profile: null });
    win.App.Auth.init();          // main.js 가 부르는 그 호출
    await sleep(50);

    ok("신규 회원이면 닉네임 화면이 먼저 뜬다", !!doc.getElementById("kakao-nick-gate"));
    ok("닉네임을 받기 전에는 auth.js 가 시작되지 않는다",
      calls.filter((c) => c[0] === "auth.init").length === 0,
      "auth.init 이 먼저 불리면 세션이 로그아웃됩니다");

    doc.getElementById("kakao-nick-input").value = "김갱";
    doc.getElementById("kakao-nick-submit").click();
    await sleep(50);

    const order = calls.map((c) => c[0]);
    ok("닉네임을 profiles 에 넣는다", order.indexOf("insert") !== -1);
    ok("그 다음에 auth.js 가 시작된다",
      order.indexOf("auth.init") > order.indexOf("insert"), order.join(" → "));
    ok("닉네임 화면이 닫힌다", !doc.getElementById("kakao-nick-gate"));
  }

  /* ---------- 개인정보는 profiles 가 아니라 별도 표에 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser() }, profile: null });
    win.App.Auth.init();
    await sleep(50);
    doc.getElementById("kakao-nick-input").value = "김갱";
    doc.getElementById("kakao-nick-submit").click();
    await sleep(50);

    const ins = calls.find((c) => c[0] === "insert");
    const ups = calls.find((c) => c[0] === "upsert");
    ok("profiles 에는 닉네임만 넣는다",
      ins && Object.keys(ins[2]).sort().join(",") === "id,nickname", ins && JSON.stringify(ins[2]));
    ok("이메일은 profiles 에 넣지 않는다", ins && !("email" in ins[2]));
    ok("개인정보는 customer_private_info 로 간다", ups && ups[1] === "customer_private_info");
    ok("로그인 출처와 카카오 회원번호를 남긴다",
      ups && ups[2].provider === "kakao" && ups[2].provider_user_id === "9876543210");
  }

  /* ---------- 카카오가 이메일을 안 주는 경우 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser({ email: null }) }, profile: null });
    win.App.Auth.init();
    await sleep(50);
    doc.getElementById("kakao-nick-input").value = "김갱";
    doc.getElementById("kakao-nick-submit").click();
    await sleep(50);
    const ups = calls.find((c) => c[0] === "upsert");
    ok("이메일이 없으면 빈 값을 지어내지 않는다", ups && !("email" in ups[2]), ups && JSON.stringify(ups[2]));
  }

  /* ---------- 기존 회원은 방해하지 않는다 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser() }, profile: { nickname: "이미있음" } });
    win.App.Auth.init();
    await sleep(50);
    ok("닉네임이 있는 카카오 회원에게는 화면을 띄우지 않는다", !doc.getElementById("kakao-nick-gate"));
    ok("바로 auth.js 로 넘긴다", calls.some((c) => c[0] === "auth.init"));
    ok("닉네임을 다시 넣지 않는다", !calls.some((c) => c[0] === "insert"));
  }
  {
    const emailUser = { id: "u2", app_metadata: { provider: "email" }, identities: [{ provider: "email" }] };
    const { win, doc, calls } = boot({ session: { user: emailUser }, profile: null });
    win.App.Auth.init();
    await sleep(50);
    ok("닉네임+비밀번호 회원에게는 끼어들지 않는다", !doc.getElementById("kakao-nick-gate"));
    ok("기존 회원은 그대로 auth.js 로 간다", calls.some((c) => c[0] === "auth.init"));
    ok("기존 회원의 개인정보를 건드리지 않는다", !calls.some((c) => c[0] === "upsert"));
  }
  {
    const { win, doc, calls } = boot({ session: null });
    win.App.Auth.init();
    await sleep(50);
    ok("로그인 안 한 사람에게는 아무것도 하지 않는다",
      !doc.getElementById("kakao-nick-gate") && calls.some((c) => c[0] === "auth.init"));
  }

  /* ---------- 닉네임 규칙은 기존 규칙 그대로 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser() }, profile: null });
    win.App.Auth.init();
    await sleep(50);
    const bad = ["★관리자★", "김 갱", "시발", "a", "ㅋㅋㅋ", "관리자", "   "];
    let blocked = 0;
    for (const n of bad) {
      doc.getElementById("kakao-nick-input").value = n;
      doc.getElementById("kakao-nick-submit").click();
      await sleep(10);
      if (!calls.some((c) => c[0] === "insert")) blocked++;
    }
    ok("규칙에 어긋난 닉네임은 저장 시도조차 안 한다", blocked === bad.length, blocked + "/" + bad.length);
    ok("막힌 뒤에도 화면은 열려 있다", !!doc.getElementById("kakao-nick-gate"));
    ok("이유를 알려준다", (doc.getElementById("kakao-nick-err").textContent || "").length > 0);
  }

  /* ---------- 서버 오류를 사람 말로 ---------- */
  {
    const { K } = boot({});
    const cases = [
      ["duplicate key value violates unique constraint", "이미 사용 중인 닉네임입니다."],
      ["nickname_banned", "사용할 수 없는 단어가 들어 있습니다."],
      ["nickname_reserved", "사용할 수 없는 닉네임입니다."],
      ["nickname_has_space", "닉네임에는 공백을 넣을 수 없습니다."],
      ["nickname_too_long", "닉네임은 12자 이내로 입력해주세요."],
    ];
    cases.forEach(([raw, want]) => {
      ok("서버 오류를 풀어 쓴다: " + raw, K.serverErrorMessage({ message: raw }) === want, K.serverErrorMessage({ message: raw }));
    });
    ok("모르는 오류도 영어를 그대로 보여주지 않는다",
      !/[a-z]{5,}/.test(K.serverErrorMessage({ message: "PGRST301 something broke" })));
  }

  /* ---------- 취소하면 세션을 정리한다 ---------- */
  {
    const { win, doc, calls } = boot({ session: { user: kakaoUser() }, profile: null });
    win.App.Auth.init();
    await sleep(50);
    doc.getElementById("kakao-nick-cancel").click();
    await sleep(50);
    ok("취소하면 카카오 세션을 지운다", calls.some((c) => c[0] === "signOut"),
      "닉네임 없는 세션이 남으면 다음 방문 때 또 튕깁니다");
    ok("취소해도 사이트는 계속 뜬다", calls.some((c) => c[0] === "auth.init"));
    ok("취소하면 화면이 닫힌다", !doc.getElementById("kakao-nick-gate"));
  }

  /* ---------- 로그인 버튼 ---------- */
  {
    const { doc } = boot({});
    await sleep(20); // 화면 준비(DOMContentLoaded) 후에 버튼이 들어갑니다
    const btn = doc.getElementById("kakao-login-btn");
    ok("로그인 폼 안에 카카오 버튼이 있다", !!btn && !!doc.querySelector(".user-panel-guest #kakao-login-btn"));
    ok("버튼 문구가 한국어다", btn && /카카오/.test(btn.textContent));
    ok("로그인 버튼과 회원가입 줄 사이에 있다",
      btn && btn.compareDocumentPosition(doc.querySelector(".up-login-toggle")) & 4);
  }
  {
    const { doc, calls } = boot({});
    await sleep(20);
    doc.getElementById("kakao-login-btn").click();
    await sleep(30);
    const c = calls.find((x) => x[0] === "oauth");
    ok("버튼을 누르면 카카오로 보낸다", !!c && c[1].provider === "kakao");
    ok("로그인 후 지금 보던 페이지로 돌아온다",
      c && c[1].options.redirectTo === "https://tl.test/index.html", c && JSON.stringify(c[1].options));

    /* KOE205 재발 방지.
       scopes 를 안 주면 Supabase 가 기본값으로 account_email 과
       profile_image 까지 요청하는데, 카카오 콘솔에 그 동의항목이
       없으면 카카오가 로그인을 통째로 거부합니다.
       2026-08-19 실제로 이 에러로 막혔습니다. */
    ok("요청 항목을 직접 지정한다(기본값에 맡기지 않음)",
      c && typeof c[1].options.scopes === "string" && c[1].options.scopes.length > 0);
    ok("닉네임만 요청한다", c && c[1].options.scopes === "profile_nickname", c && c[1].options.scopes);
    ok("이메일을 요청하지 않는다(별도 심사 필요 — 없어도 되는 정보)",
      c && c[1].options.scopes.indexOf("account_email") === -1);
    ok("프로필사진을 요청하지 않는다(안 쓰는 정보)",
      c && c[1].options.scopes.indexOf("profile_image") === -1);
  }

  /* ---------- 폼이 다시 그려져도 버튼이 살아있다 ---------- */
  {
    const { doc, K } = boot({});
    await sleep(20);
    const box = doc.querySelector(".user-panel-guest");
    box.innerHTML = '<button id="up-login-submit">로그인</button><div class="up-login-toggle">회원가입</div>';
    ok("다시 그린 직후에는 버튼이 없다", !doc.getElementById("kakao-login-btn"));
    K.injectButton();
    ok("다시 넣으면 살아난다", !!doc.getElementById("kakao-login-btn"));
    K.injectButton();
    ok("두 번 넣어도 하나만 생긴다", doc.querySelectorAll("#kakao-login-btn").length === 1);
  }

  /* ---------- 수정 금지 파일 ---------- */
  {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const authAt = html.indexOf('js/auth.js');
    const kakaoAt = html.indexOf('js/kakao-login.js');
    const rulesAt = html.indexOf('js/nickname-rules.js');
    ok("kakao-login.js 가 index.html 에 연결돼 있다", kakaoAt !== -1);
    ok("auth.js 보다 뒤에 온다(감싸려면 auth.js 가 먼저 있어야 함)", kakaoAt > authAt);
    ok("nickname-rules.js 보다 뒤에 온다", kakaoAt > rulesAt);

    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok("카카오 버튼 폭을 100% 로 잡았다(로그인 버튼과 단차 방지)",
      /\.kakao-login-wrap\{[^}]*width:100%/.test(css));
    ok("카카오 지정 색을 쓴다", css.includes("#FEE500"));
  }

  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
})();
