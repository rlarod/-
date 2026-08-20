/* =========================================================================
 * js/social-login.js — App.SocialLogin
 * =========================================================================
 * 카카오·네이버 계정으로 로그인하는 기능입니다.
 *
 * ── 카카오와 네이버의 차이 ──────────────────────────────────────────────
 * 카카오는 Supabase 가 기본으로 지원해서 provider 이름이 그냥 'kakao' 입니다.
 * 네이버는 기본 목록에 없어서 Supabase 대시보드에 "직접 등록"(Custom OAuth)
 * 으로 넣어야 하고, 그때 정한 이름이 그대로 provider 가 됩니다.
 * 우리는 'custom:naver' 로 등록하기로 했습니다. 이 이름이 Supabase 설정과
 * 정확히 같아야 하며, 다르면 로그인 버튼이 그냥 실패합니다.
 *
 * ── 왜 별도 파일인가 ────────────────────────────────────────────────────
 * js/auth.js 는 수정 금지 파일입니다. 손대지 않고 바깥에서 감쌉니다.
 *
 * ── auth.js 의 함정 ─────────────────────────────────────────────────────
 * auth.js 는 페이지가 열릴 때 이렇게 동작합니다.
 *     로그인 기록(세션)은 있는데 profiles 에 닉네임이 없다
 *       → "비정상 상태" 로 보고 곧바로 로그아웃시킨다
 *
 * 카카오로 처음 들어온 사람이 정확히 그 상태입니다.
 *   카카오 인증은 끝나서 세션은 생겼는데, 우리 쪽 닉네임은 아직 없음.
 * 그래서 그냥 붙이면 "카카오 로그인 → 즉시 튕김" 이 됩니다.
 *
 * 해결: auth.js 의 init 을 감싸서, auth.js 가 확인하기 "전에"
 *       닉네임을 받아 profiles 에 넣고, 그 다음 원래 init 을 부릅니다.
 *       auth.js 입장에서는 처음부터 닉네임이 있던 회원과 똑같이 보입니다.
 *
 * ── 기존 회원과의 공존 ──────────────────────────────────────────────────
 * 닉네임+비밀번호 회원은 이 파일이 아무것도 하지 않습니다.
 * 로그인 출처가 카카오·네이버인 세션일 때만 끼어듭니다.
 *
 * ── 개인정보 ────────────────────────────────────────────────────────────
 * 이메일·카카오 회원번호는 profiles 가 아니라 customer_private_info 에
 * 넣습니다. profiles 는 랭킹·게시판·채팅에서 누구나 읽는 표라서,
 * 거기에 개인정보를 넣으면 그대로 노출됩니다.
 * (supabase/schema-private-info.sql 참고)
 *
 * ── 값을 지어내지 않습니다 ──────────────────────────────────────────────
 * 카카오가 이메일을 안 주면 비워둡니다. 임의의 값을 채우지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.SocialLogin = (function () {
  "use strict";

  /* 로그인 수단 목록. 여기에 한 줄 추가하면 버튼이 하나 더 생깁니다. */
  var PROVIDERS = [
    {
      id: "kakao",              // Supabase 기본 지원
      key: "kakao",
      label: "카카오로 시작하기",   /* 마우스를 올렸을 때·읽어주는 프로그램용 */
      short: "카카오",              /* 박스 안에 보이는 글자 */
      cls: "kakao-login-btn",
    },
    {
      id: "custom:naver",       // Supabase 대시보드에 직접 등록한 이름과 같아야 함
      key: "naver",
      label: "네이버로 시작하기",
      short: "네이버",
      cls: "naver-login-btn",
    },
  ];

  var GATE_ID = "social-nick-gate";

  function providerById(id) {
    for (var i = 0; i < PROVIDERS.length; i++) if (PROVIDERS[i].id === id) return PROVIDERS[i];
    return null;
  }
  function isSocialProvider(name) {
    return !!providerById(name);
  }

  /* ── 요청 항목(scope)은 우리가 못 정합니다 ──────────────────────────────
   * Supabase 는 카카오에 대해 항상 아래 세 가지를 요청합니다.
   *     profile_nickname, profile_image, account_email
   * signInWithOAuth 에 scopes 를 넘겨도 무시하고 세 개를 그대로 보냅니다
   * (Supabase 쪽에 버그로 등록된 알려진 문제 — supabase/supabase#36878).
   *
   * 그래서 카카오 콘솔의 [카카오 로그인] > [동의항목] 에 세 개가 전부
   * 설정돼 있어야 합니다. 하나라도 빠지면 로그인 자체가 거부됩니다
   * (잘못된 요청 KOE205 — 2026-08-19 닉네임만 설정한 상태에서 막혔습니다).
   *
   * 우리가 실제로 쓰는 건 닉네임뿐이고, 프로필사진은 안 씁니다.
   * 이메일은 받아도 되고 못 받아도 됩니다(Supabase 의
   * "Allow users without an email" 이 ON 이라 없어도 계정이 생깁니다).
   * ------------------------------------------------------------------ */

  function sb() {
    return App.SupabaseClient && typeof App.SupabaseClient.get === "function"
      ? App.SupabaseClient.get()
      : null;
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  /* ---------------- 로그인 출처 판별 ----------------
   * 세션 사용자가 카카오로 들어온 사람인지 봅니다.
   * app_metadata.provider 가 기본이고, 없으면 identities 를 봅니다. */
  function providerOf(user) {
    if (!user) return null;
    if (user.app_metadata && user.app_metadata.provider) return user.app_metadata.provider;
    if (user.identities && user.identities.length) return user.identities[0].provider;
    return null;
  }

  /* 카카오·네이버 같은 간편 로그인으로 들어온 사람인지.
     닉네임+비밀번호 회원은 여기서 false 가 나와야 하고, 그래야
     기존 로그인 흐름을 전혀 건드리지 않습니다. */
  function isSocialUser(user) {
    if (isSocialProvider(providerOf(user))) return true;
    /* 여러 방식을 연결한 계정이면 identities 에 섞여 있습니다. */
    var ids = (user && user.identities) || [];
    for (var i = 0; i < ids.length; i++) {
      if (isSocialProvider(ids[i].provider)) return true;
    }
    return false;
  }

  /* 어느 수단으로 들어왔는지 — 개인정보 표에 남길 값입니다. */
  function socialProviderOf(user) {
    var p = providerOf(user);
    if (isSocialProvider(p)) return p;
    var ids = (user && user.identities) || [];
    for (var i = 0; i < ids.length; i++) {
      if (isSocialProvider(ids[i].provider)) return ids[i].provider;
    }
    return null;
  }

  /* 그쪽 서비스에서의 회원번호 — 같은 계정으로 두 번 가입되는 걸 막는 데 씁니다. */
  function socialUserId(user) {
    var ids = (user && user.identities) || [];
    for (var i = 0; i < ids.length; i++) {
      if (isSocialProvider(ids[i].provider)) {
        return String(ids[i].provider_id || ids[i].id || "") || null;
      }
    }
    return null;
  }

  /* 그쪽에서 준 닉네임 — 닉네임 칸의 첫 제안값으로만 씁니다.
     규칙에 안 맞으면 제안하지 않습니다(억지로 고쳐 넣지 않습니다).
     네이버는 nickname, 카카오는 name 으로 주는 등 이름이 달라 모두 봅니다. */
  function suggestedNickname(user) {
    var m = (user && user.user_metadata) || {};
    var raw = m.nickname || m.name || m.preferred_username || m.full_name || "";
    if (!raw) return "";
    if (!App.NicknameRules) return "";
    var r = App.NicknameRules.check(raw);
    return r.ok ? r.nickname : "";
  }

  /* ---------------- 1) 로그인 버튼 ---------------- */

  function iconSvg(key) {
    if (key === "kakao") {
      return '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" ' +
        'd="M12 3C6.99 3 2.93 6.2 2.93 10.15c0 2.52 1.66 4.73 4.17 6L6.05 20.3c-.08.29.23.52.48.36l4.9-3.23c.19.01.38.02.57.02 5.01 0 9.07-3.2 9.07-7.15S17.01 3 12 3z"/></svg>';
    }
    /* 네이버 심볼 — 지정 형태(대문자 N)를 그대로 씁니다. */
    return '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" ' +
      'd="M14.2 12.4L9.5 5.5H5v13h4.8v-6.9l4.7 6.9H19v-13h-4.8v6.9z"/></svg>';
  }

  function buttonHtml() {
    /* 정사각형 박스 두 개를 나란히 놓습니다. 가로로 긴 막대로 쌓으면
       바로 위 로그인 버튼과 형태가 같아 셋이 한 덩어리로 읽힙니다. */
    var html = '<div class="social-login-or"><span>또는</span></div>' +
      '<div class="social-login-row">';
    PROVIDERS.forEach(function (p) {
      html +=
        '<button type="button" class="social-login-btn ' + p.cls + '" ' +
        'data-provider="' + p.id + '" id="social-login-' + p.key + '" ' +
        'title="' + p.label + '" aria-label="' + p.label + '">' +
        '<span class="social-login-icon" aria-hidden="true">' + iconSvg(p.key) + "</span>" +
        "<span>" + p.short + "</span>" +
        "</button>";
    });
    html += "</div>" +
      '<div class="social-login-err" id="social-login-err"></div>';
    return html;
  }

  function showButtonError(msg) {
    var e = document.getElementById("social-login-err");
    if (e) e.textContent = msg || "";
  }

  /* '내 정보' 칸의 로그인 폼 안에 버튼을 넣습니다.
     이 칸은 user-panel.js 가 innerHTML 로 통째로 다시 그리기 때문에,
     한 번 넣고 끝이 아니라 다시 그려질 때마다 넣어야 합니다. */
  function injectButton() {
    var box = document.querySelector(".user-panel-guest");
    if (!box) return;
    if (box.querySelector(".social-login-wrap")) return; /* 이미 있음 */

    var holder = document.createElement("div");
    holder.className = "social-login-wrap";
    holder.innerHTML = buttonHtml();

    /* 회원가입 전환 줄 바로 위에 둡니다. */
    var toggle = box.querySelector(".up-login-toggle");
    if (toggle) box.insertBefore(holder, toggle);
    else box.appendChild(holder);

    holder.querySelectorAll(".social-login-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        startLogin(btn.getAttribute("data-provider"));
      });
    });
  }

  function watchLoginForm() {
    injectButton();
    var host = document.getElementById("user-panel-body");
    if (!host || typeof MutationObserver === "undefined") return;
    var mo = new MutationObserver(function () {
      injectButton();
    });
    mo.observe(host, { childList: true, subtree: true });
  }

  /* ---------------- 2) 그쪽 로그인 화면으로 보내기 ---------------- */

  async function startLogin(providerId) {
    showButtonError("");
    var p = providerById(providerId);
    if (!p) return;
    var client = sb();
    if (!client) {
      showButtonError("로그인 서버에 연결할 수 없습니다. 새로고침 후 다시 시도해주세요.");
      return;
    }
    /* 로그인 후 돌아올 주소 — 지금 보고 있는 페이지 그대로입니다. */
    var redirectTo = window.location.origin + window.location.pathname;
    try {
      var res = await client.auth.signInWithOAuth({
        provider: p.id,
        options: { redirectTo: redirectTo },
      });
      if (res && res.error) throw res.error;
    } catch (e) {
      console.warn("[social-login.js] 로그인 시작 실패(" + p.id + "):", e);
      showButtonError("지금은 이 방법으로 로그인할 수 없습니다. 닉네임으로 로그인해주세요.");
    }
  }

  /* ---------------- 3) 신규 회원 닉네임 설정 ---------------- */

  function gateHtml(suggest) {
    return (
      '<div class="social-nick-card">' +
      '<div class="social-nick-title">닉네임을 정해주세요</div>' +
      '<div class="social-nick-sub">랭킹·커뮤니티·채팅에 표시되는 이름입니다.</div>' +
      '<input type="text" class="social-nick-input" id="social-nick-input" maxlength="12" ' +
      'placeholder="닉네임" autocomplete="off" value="' + escapeHtml(suggest) + '">' +
      '<div class="social-nick-rule">한글·영문·숫자·밑줄(_) 2~12자<br>공백과 특수문자는 쓸 수 없습니다</div>' +
      '<div class="social-nick-err" id="social-nick-err"></div>' +
      '<button type="button" class="social-nick-submit" id="social-nick-submit">시작하기</button>' +
      '<button type="button" class="social-nick-cancel" id="social-nick-cancel">취소하고 돌아가기</button>' +
      "</div>"
    );
  }

  /* 서버(트리거)가 던지는 오류를 사람 말로 바꿉니다.
     화면 검사와 같은 규칙이지만, 화면을 우회한 경우에도 걸립니다. */
  function serverErrorMessage(err) {
    var m = String((err && (err.message || err.details || err.hint)) || "");
    if (/nickname_banned/.test(m)) return "사용할 수 없는 단어가 들어 있습니다.";
    if (/nickname_reserved/.test(m)) return "사용할 수 없는 닉네임입니다.";
    if (/nickname_too_short/.test(m)) return "닉네임은 2자 이상이어야 합니다.";
    if (/nickname_too_long/.test(m)) return "닉네임은 12자 이내로 입력해주세요.";
    if (/nickname_has_space/.test(m)) return "닉네임에는 공백을 넣을 수 없습니다.";
    if (/nickname_bad_char/.test(m)) return "한글·영문·숫자·밑줄(_)만 쓸 수 있습니다.";
    if (/nickname_jamo_only/.test(m)) return "자음·모음만으로는 만들 수 없습니다.";
    if (/nickname_empty/.test(m)) return "닉네임을 입력해주세요.";
    if (/duplicate key|23505|already exists/i.test(m)) return "이미 사용 중인 닉네임입니다.";
    return "닉네임을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  }

  /* 닉네임을 받아 profiles 에 넣습니다.
     넣기 전에는 auth.js 를 시작시키지 않습니다(넣기 전에 시작하면
     auth.js 가 "닉네임 없는 세션" 으로 보고 로그아웃시킵니다). */
  function askNickname(client, user) {
    return new Promise(function (resolve) {
      var gate = document.createElement("div");
      gate.className = "social-nick-gate";
      gate.id = GATE_ID;
      gate.innerHTML = gateHtml(suggestedNickname(user));
      document.body.appendChild(gate);

      var input = gate.querySelector("#social-nick-input");
      var err = gate.querySelector("#social-nick-err");
      var submit = gate.querySelector("#social-nick-submit");
      var cancel = gate.querySelector("#social-nick-cancel");
      var busy = false;

      function setErr(m) {
        if (err) err.textContent = m || "";
      }
      function close() {
        if (gate.parentNode) gate.parentNode.removeChild(gate);
      }

      async function save() {
        if (busy) return;
        setErr("");

        var raw = input ? input.value : "";
        var checked = App.NicknameRules
          ? App.NicknameRules.check(raw)
          : { ok: !!String(raw).trim(), nickname: String(raw).trim(), message: "닉네임을 입력해주세요." };
        if (!checked.ok) {
          setErr(checked.message);
          return;
        }

        busy = true;
        if (submit) {
          submit.disabled = true;
          submit.textContent = "만드는 중...";
        }
        try {
          var ins = await client.from("profiles").insert({ id: user.id, nickname: checked.nickname });
          if (ins && ins.error) throw ins.error;
          await savePrivateInfo(client, user);
          close();
          resolve(true);
        } catch (e) {
          console.warn("[social-login.js] 닉네임 저장 실패:", e);
          setErr(serverErrorMessage(e));
          busy = false;
          if (submit) {
            submit.disabled = false;
            submit.textContent = "시작하기";
          }
        }
      }

      /* 취소하면 카카오 로그인을 없던 일로 하고 로그인 화면으로 돌아갑니다.
         닉네임 없는 세션을 남겨두면 다음에 들어올 때 또 튕깁니다. */
      async function giveUp() {
        if (busy) return;
        busy = true;
        try {
          await client.auth.signOut();
        } catch (e) {
          /* 로그아웃 실패해도 화면은 닫고 진행합니다. */
        }
        close();
        resolve(false);
      }

      if (submit) submit.addEventListener("click", save);
      if (cancel) cancel.addEventListener("click", giveUp);
      if (input) {
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") save();
        });
        try {
          input.focus();
        } catch (e) {
          /* noop */
        }
      }
    });
  }

  /* ---------------- 4) 개인정보 기록 ---------------- */

  async function savePrivateInfo(client, user) {
    var row = {
      user_id: user.id,
      /* 'custom:naver' 처럼 Supabase 쪽 접두어가 붙어 있으면 떼고 'naver' 로 남깁니다.
         마이페이지(js/my-private-info.js)가 'kakao' / 'naver' 를 보고 이름을 붙입니다. */
      provider: String(socialProviderOf(user) || "").replace(/^custom:/, "") || null,
      provider_user_id: socialUserId(user),
    };
    /* 이메일은 그쪽에서 준 경우에만 넣습니다. 없으면 칸을 아예 건드리지 않습니다. */
    if (user.email) row.email = user.email;

    try {
      var res = await client.from("customer_private_info").upsert(row, { onConflict: "user_id" });
      if (res && res.error) throw res.error;
    } catch (e) {
      /* 이 표가 아직 없거나 권한이 없어도 로그인 자체는 되게 둡니다.
         기록만 못 남는 것이지, 사용자가 못 들어올 이유는 없습니다. */
      console.warn("[social-login.js] 개인정보 기록 실패(로그인은 계속 진행):", e);
    }
  }

  /* ---------------- 5) auth.js 보다 먼저 끼어들기 ---------------- */

  async function prepareSocialUser() {
    var client = sb();
    if (!client) return;

    var session = null;
    try {
      var s = await client.auth.getSession();
      if (s && s.error) throw s.error;
      session = s && s.data ? s.data.session : null;
    } catch (e) {
      console.warn("[social-login.js] 세션 조회 실패:", e);
      return;
    }
    if (!session || !session.user) return;

    var user = session.user;
    if (!isSocialUser(user)) return; /* 닉네임+비밀번호 회원 — 건드리지 않습니다 */

    /* 이미 닉네임이 있으면 신규가 아닙니다. */
    var profile = null;
    try {
      var p = await client.from("profiles").select("nickname").eq("id", user.id).maybeSingle();
      if (p && p.error) throw p.error;
      profile = p ? p.data : null;
    } catch (e) {
      console.warn("[social-login.js] 프로필 조회 실패:", e);
      return; /* 확실하지 않으면 아무것도 하지 않고 원래 흐름에 맡깁니다 */
    }

    if (profile && profile.nickname) {
      await savePrivateInfo(client, user); /* 로그인 출처만 최신으로 */
      return;
    }

    await askNickname(client, user);
  }

  /* auth.js 의 init 을 감쌉니다. auth.js 파일 자체는 건드리지 않습니다. */
  function wrapAuthInit() {
    if (!App.Auth || typeof App.Auth.init !== "function") return false;
    if (App.Auth.__socialWrapped) return true;

    var original = App.Auth.init;
    App.Auth.init = function () {
      var self = this;
      var args = arguments;
      prepareSocialUser()
        .catch(function (e) {
          console.warn("[social-login.js] 준비 중 오류(원래 로그인 흐름으로 진행):", e);
        })
        .then(function () {
          original.apply(self, args);
        });
    };
    App.Auth.__socialWrapped = true;
    return true;
  }

  /* ---------------- 시작 ---------------- */

  function init() {
    watchLoginForm();
  }

  /* auth.js 는 DOMContentLoaded 때 main.js 가 부릅니다.
     그보다 먼저 감싸야 하므로, 파일이 읽히는 순간 바로 감쌉니다. */
  wrapAuthInit();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    /* 아래는 테스트용으로 열어둡니다. */
    PROVIDERS: PROVIDERS,
    providerOf: providerOf,
    isSocialUser: isSocialUser,
    socialProviderOf: socialProviderOf,
    socialUserId: socialUserId,
    suggestedNickname: suggestedNickname,
    serverErrorMessage: serverErrorMessage,
    prepareSocialUser: prepareSocialUser,
    injectButton: injectButton,
  };
})();
