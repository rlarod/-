/* tests/naver-login-hidden.test.js
 * =========================================================================
 * 「네이버로 계속하기」 버튼을 껐습니다 — ★지운 게 아니라 껐습니다★
 * =========================================================================
 *
 *   대표 (2026-09-10)  "네이버 로그인은 일단빼자"
 *
 * ── 이 봉인이 지키는 것 두 가지 ─────────────────────────────────────────
 *   ① ★버튼이 다시 나타나지 않는다★
 *   ② ★기존 네이버 회원이 깨지지 않는다★  ← 이쪽이 더 중요합니다
 *
 * ── ②가 왜 더 중요한가 (조용한 고장) ───────────────────────────────────
 *   js/social-login.js 의 PROVIDERS 목록은 버튼을 만드는 데만 쓰이는 게
 *   아닙니다. 로그인한 사람이 누구인지 판정하는 데도 씁니다.
 *
 *       providerById(name) → isSocialProvider(name) → isSocialUser(user)
 *
 *   그래서 "버튼 빼라" 는 말을 듣고 PROVIDERS 에서 네이버를 ★통째로 지우면★
 *   이미 네이버로 가입한 회원이 isSocialUser 에서 false 가 나옵니다.
 *   즉 「닉네임+비밀번호로 가입한 회원」 으로 잘못 분류되고, 그 뒤의
 *   닉네임 관문·개인정보 저장 흐름이 통째로 어긋납니다.
 *
 *   ⚠ 그런데 ★오류가 하나도 안 납니다. 화면도 멀쩡합니다.★
 *     회원도 우리도 고장인 줄 모릅니다. 그래서 봉인으로 못박습니다.
 *
 * ── 되살리는 방법 ───────────────────────────────────────────────────────
 *   js/social-login.js 의 PROVIDERS 안 네이버 항목에서 ★hidden: true★
 *   한 줄만 지우면 버튼이 돌아옵니다. 그때 이 파일의 "버튼이 없다" 쪽
 *   검사도 같이 되돌리면 됩니다(아래 [B] 묶음).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "social-login.js"), "utf8");
const RULES = fs.readFileSync(path.join(REPO, "js", "nickname-rules.js"), "utf8");

/* 로그인 폼 하나를 띄우고 모듈을 올립니다.
   서버는 안 부릅니다 — 세션 없음(비회원 첫 화면)이 기본입니다. */
function boot() {
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
  win.App.Auth = { init() { calls.push(["auth.init"]); }, getNickname: () => null };
  win.App.SupabaseClient = {
    get: () => ({
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        signOut: async () => ({}),
        signInWithOAuth: async (arg) => { calls.push(["oauth", arg]); return { error: null }; },
      },
      from() {
        const api = {
          select: () => api, eq: () => api,
          maybeSingle: async () => ({ data: null, error: null }),
          insert: async () => ({ error: null }),
          upsert: async () => ({ error: null }),
        };
        return api;
      },
    }),
  };
  win.eval(RULES);
  win.App.NicknameRules.init = win.App.NicknameRules.init || function () {};
  win.eval(SRC);
  return { win, doc: win.document, calls, K: win.App.SocialLogin };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 네이버로 가입한 회원 — 두 가지 모양 모두 실제로 옵니다.
   Supabase 는 app_metadata.provider 를 주기도 하고, 계정을 여러 개
   연결한 사람은 identities 안에만 들어 있기도 합니다. */
const NAVER_META = {
  id: "u-naver-1",
  app_metadata: { provider: "custom:naver" },
  user_metadata: { nickname: "네이버닉" },
  identities: [{ provider: "custom:naver", provider_id: "naver-123" }],
};
const NAVER_IDS_ONLY = {
  id: "u-naver-2",
  app_metadata: { provider: "email" },
  identities: [{ provider: "email" }, { provider: "custom:naver", provider_id: "naver-456" }],
};

(async function run() {
  console.log("\n네이버 로그인 — 버튼만 끄고 판정은 살려둔다 (2026-09-10 대표 지시)");

  /* ===================================================================
   * [A] ★기존 네이버 회원이 깨지지 않는다★ — 이게 핵심입니다
   *     PROVIDERS 에서 네이버를 통째로 지우면 여기가 전부 무너집니다.
   * =================================================================== */
  {
    const { K } = boot();

    ok("[A] 네이버 회원을 여전히 간편로그인 회원으로 알아본다(app_metadata)",
      K.isSocialUser(NAVER_META) === true,
      "false 면 '닉네임+비밀번호 회원' 으로 잘못 분류됩니다 — 오류 없이 조용히 깨집니다");

    ok("[A] identities 안에만 있어도 알아본다",
      K.isSocialUser(NAVER_IDS_ONLY) === true,
      "여러 계정을 연결한 네이버 회원이 여기서 걸립니다");

    ok("[A] 어느 수단으로 들어왔는지 그대로 답한다",
      K.socialProviderOf(NAVER_META) === "custom:naver",
      String(K.socialProviderOf(NAVER_META)));

    ok("[A] 네이버 회원번호를 그대로 꺼낸다",
      K.socialUserId(NAVER_META) === "naver-123", String(K.socialUserId(NAVER_META)));

    ok("[A] 네이버가 준 닉네임 제안도 그대로 동작한다",
      K.suggestedNickname(NAVER_META) === "네이버닉");

    /* 반대쪽도 확인 — 원래 false 여야 하는 사람이 true 로 바뀌면 안 됩니다. */
    ok("[A] 닉네임+비밀번호 회원은 여전히 간편로그인 회원이 아니다",
      K.isSocialUser({ id: "x", app_metadata: { provider: "email" }, identities: [{ provider: "email" }] }) === false);

    /* 목록 자체가 살아 있는지 — 지운 것과 끈 것을 구분합니다. */
    const nv = K.PROVIDERS.filter((p) => p.key === "naver")[0];
    ok("[A] PROVIDERS 에 네이버 항목이 그대로 남아 있다", !!nv,
      "★지우지 말고 hidden:true 로 끄세요★ — 지우면 위 판정이 전부 false 가 됩니다");
    ok("[A] Supabase 에 등록한 이름(custom:naver)이 그대로다",
      nv && nv.id === "custom:naver", nv && nv.id);
    ok("[A] 되살릴 때 쓸 이름표(label)도 남아 있다",
      nv && nv.label === "네이버로 계속하기", nv && nv.label);
  }

  /* ===================================================================
   * [B] ★버튼은 화면에 없다★
   *     되살릴 때는 hidden:true 를 지우고 이 묶음도 같이 되돌립니다.
   * =================================================================== */
  {
    const { doc, K } = boot();
    await sleep(20);

    ok("[B] 로그인 폼에 네이버 버튼이 없다",
      !doc.getElementById("social-login-naver"));
    ok("[B] 네이버 글자가 로그인 폼 어디에도 안 보인다",
      !/네이버/.test(doc.querySelector(".social-login-wrap").textContent),
      doc.querySelector(".social-login-wrap").textContent);
    ok("[B] 네이버 색 버튼(naver-login-btn)도 안 그려진다",
      doc.querySelectorAll(".naver-login-btn").length === 0);
    ok("[B] 간편 로그인 버튼은 딱 하나(카카오)뿐이다",
      doc.querySelectorAll(".social-login-btn").length === 1,
      String(doc.querySelectorAll(".social-login-btn").length));

    /* 다시 그려도 살아나면 안 됩니다(user-panel.js 가 innerHTML 로 다시 그립니다). */
    doc.querySelector(".social-login-wrap").remove();
    K.injectButton();
    ok("[B] 폼을 다시 그려도 네이버가 되살아나지 않는다",
      !doc.getElementById("social-login-naver"));

    /* 표시가 있는 것만 감춥니다 — hidden 은 네이버에만 붙어 있어야 합니다. */
    const kakao = K.PROVIDERS.filter((p) => p.key === "kakao")[0];
    ok("[B] 카카오에는 감추기 표시가 없다", !kakao.hidden);
    const nv = K.PROVIDERS.filter((p) => p.key === "naver")[0];
    ok("[B] 네이버에 감추기 표시(hidden:true)가 붙어 있다", nv && nv.hidden === true,
      "이 한 줄이 없으면 버튼이 다시 보입니다");
  }

  /* ===================================================================
   * [C] ★카카오는 하나도 안 건드렸다★
   * =================================================================== */
  {
    const { doc, calls } = boot();
    await sleep(20);
    const btn = doc.getElementById("social-login-kakao");
    ok("[C] 카카오 버튼은 그대로 있다", !!btn);
    ok("[C] 카카오 버튼 문구도 그대로", btn && /카카오로 계속하기/.test(btn.textContent));
    btn.click();
    await sleep(30);
    const c = calls.find((x) => x[0] === "oauth");
    ok("[C] 눌렀을 때 카카오로 보낸다", c && c[1].provider === "kakao", c && c[1].provider);
    ok("[C] 보던 페이지로 돌아온다",
      c && c[1].options.redirectTo === "https://tl.test/index.html");
  }

  /* ===================================================================
   * [D] 끄는 방식이 ★한 곳★ 에만 있어야 합니다
   *     두 군데서 끄면 되살릴 때 한 곳을 빠뜨립니다.
   * =================================================================== */
  {
    /* 주석 안에도 "hidden:true" 라는 글자가 여러 번 나옵니다(되살리는 방법 안내).
       그래서 ★주석을 걷어낸 뒤★ 셉니다. */
    const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    const hiddenCount = (CODE.match(/hidden:\s*true/g) || []).length;
    ok("[D] 감추기 표시는 딱 한 줄뿐이다", hiddenCount === 1, "hidden:true 가 " + hiddenCount + "개");
    ok("[D] 그 표시를 보는 곳은 버튼 만드는 곳 한 군데뿐이다",
      (CODE.match(/p\.hidden/g) || []).length === 1);
    ok("[D] 판정 함수(providerById)가 감추기를 보지 않는다",
      !/function providerById\(id\)[\s\S]{0,240}?hidden/.test(SRC),
      "providerById 가 hidden 을 보면 기존 네이버 회원이 깨집니다");

    /* CSS 는 안 건드렸습니다 — 되살릴 때 색이 그대로 있어야 합니다. */
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok("[D] 네이버 버튼 색 규칙(#03C75A)은 지우지 않았다", css.includes("#03C75A"),
      "되살릴 때 색까지 다시 만들어야 합니다");
  }

  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
  /* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다. */
  process.exit(0);
})();
