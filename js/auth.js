/* =========================================================================
 * js/auth.js — App.Auth
 * =========================================================================
 * 닉네임 + 비밀번호 로그인/회원가입. 이메일은 사용자에게 절대 안 보이고
 * 안 물어봅니다 — Supabase Auth가 내부적으로 이메일+비밀번호 방식만
 * 지원해서, 닉네임에서 결정론적으로 만든 "가짜 이메일"을 내부적으로만
 * 씁니다(예: 닉네임 "김갱" → 항상 같은 u<hex>@btcsim.local).
 *
 * ── 이전 버전(익명 로그인)과의 결정적 차이 ───────────────────────────
 *   - 세션이 있어도 그게 "익명" 세션이면 강제로 로그아웃시키고 로그인
 *     화면을 보여줍니다(요구사항 2, 10 — 예전 테스트용 익명 세션으로
 *     자동 로그인되는 문제 제거).
 *   - 비밀번호가 필요하므로 회원가입 화면이 별도로 생겼습니다.
 *
 * ── 비밀번호는 어디에 저장되나 ───────────────────────────────────────
 * 전부 Supabase Auth가 관리합니다(auth.users, 우리 프로젝트 어떤 테이블/
 * localStorage에도 비밀번호를 직접 저장하지 않습니다).
 *
 * ── 로그인 성공 시 서버 데이터 복원(요구사항 3) ───────────────────────
 * trading.js의 계산 로직은 전혀 안 건드립니다 — 대신 trading.js가 원래
 * localStorage에서 읽는 그 형식 그대로(App.Storage.save("trading", ...))
 * Supabase에서 가져온 balance/position/거래내역을 미리 채워넣고 나서
 * App.bootApp()을 호출합니다. trading.js 입장에서는 "새로고침해서 원래
 * 있던 localStorage를 읽은 것"과 구분이 안 됩니다.
 *   (한계: 지정가 미체결 주문의 세부 필드(notional 등)는 클라우드 스키마에
 *    1:1로 없어서 이번 버전에서는 복원하지 않습니다 — 로그인 직후에는
 *    미체결 주문이 없는 상태로 시작합니다. 아래 최종 보고에서 다시
 *    설명드립니다.)
 * ========================================================================= */

window.App = window.App || {};

App.Auth = (function () {
  "use strict";

  const NICKNAME_MAX_LEN = 12;
  const PASSWORD_MIN_LEN = 6;
  const INITIAL_BALANCE = 10000;
  const EMAIL_DOMAIN = "@btcsim.local"; // 사용자에게 절대 노출 안 됨(내부 전용)

  let dom = {};
  let currentNickname = null;
  let booted = false; // App.bootApp()이 이미 호출됐는지(중복 부팅 방지)
  let mode = "login"; // "login" | "signup"

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient.get();
  }

  /* ---------------- 닉네임 → 내부 전용 가짜 이메일 ----------------
   * 닉네임을 그대로 이메일 local-part로 쓰면 한글/공백/이모지 등이 섞여
   * 이메일 형식에서 안전하지 않을 수 있어서, UTF-8 바이트를 16진수로
   * 결정론적으로 인코딩합니다. 같은(trim된) 닉네임은 항상 같은 이메일이
   * 되고, 이게 자연스럽게 "닉네임 중복 불가"를 이메일 unique 제약으로도
   * 한 번 더 강제해줍니다.
   * ------------------------------------------------------------- */
  function nicknameToEmail(nickname) {
    const bytes = new TextEncoder().encode(nickname);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
    return "u" + hex + EMAIL_DOMAIN;
  }
  function normalizeNickname(raw) {
    return (raw || "").trim(); // 앞뒤 공백 제거로 " 김갱 " = "김갱" = "김갱 " 전부 동일 취급(요구사항 5)
  }

  function cacheDom() {
    dom = {
      gate: el("auth-gate"),
      nicknameInput: el("auth-nickname-input"),
      passwordInput: el("auth-password-input"),
      confirmInput: el("auth-password-confirm-input"),
      err: el("auth-err"),
      submitBtn: el("auth-submit-btn"),
      loadingEl: el("auth-loading"),
      toggleText: el("auth-toggle-text"),
      toggleLink: el("auth-toggle-link"),
      note: el("auth-note"),
      appRoot: document.querySelector(".app"),
      userBadge: el("auth-user-badge"),
      userNicknameText: el("auth-user-nickname-text"),
      logoutBtn: el("auth-logout-btn"),
    };
  }

  function showGate() {
    if (dom.gate) dom.gate.style.display = "flex";
    if (dom.appRoot) dom.appRoot.classList.add("pending-auth");
    if (dom.nicknameInput) dom.nicknameInput.focus();
  }
  function hideGate() {
    if (dom.gate) dom.gate.style.display = "none";
    if (dom.appRoot) dom.appRoot.classList.remove("pending-auth");
  }
  function setError(msg) {
    if (dom.err) dom.err.textContent = msg || "";
  }
  function setLoading(isLoading) {
    if (dom.loadingEl) dom.loadingEl.style.display = isLoading ? "block" : "none";
    if (dom.submitBtn) dom.submitBtn.disabled = isLoading;
    if (dom.nicknameInput) dom.nicknameInput.disabled = isLoading;
    if (dom.passwordInput) dom.passwordInput.disabled = isLoading;
    if (dom.confirmInput) dom.confirmInput.disabled = isLoading;
  }

  function setMode(newMode) {
    mode = newMode;
    setError("");
    if (dom.passwordInput) dom.passwordInput.value = "";
    if (dom.confirmInput) dom.confirmInput.value = "";
    if (mode === "signup") {
      if (dom.confirmInput) dom.confirmInput.style.display = "";
      if (dom.submitBtn) dom.submitBtn.textContent = "회원가입";
      if (dom.toggleText) dom.toggleText.textContent = "이미 계정이 있으신가요?";
      if (dom.toggleLink) dom.toggleLink.textContent = "로그인";
      if (dom.note) dom.note.textContent = "최초 가입 시 10,000 USDT가 자동으로 지급됩니다.";
    } else {
      if (dom.confirmInput) dom.confirmInput.style.display = "none";
      if (dom.submitBtn) dom.submitBtn.textContent = "로그인";
      if (dom.toggleText) dom.toggleText.textContent = "처음 방문하셨나요?";
      if (dom.toggleLink) dom.toggleLink.textContent = "회원가입";
      if (dom.note) dom.note.textContent = "닉네임과 비밀번호로 로그인하세요.";
    }
  }

  function bootOnce() {
    if (booted) return;
    booted = true;
    App.bootApp();
  }

  function fallbackToLocalMode(reason) {
    console.warn("[auth.js] 로그인 기능을 건너뜁니다(" + reason + ") — 기존 로컬 모의투자만 동작합니다.");
    if (dom.gate) dom.gate.style.display = "none";
    if (dom.appRoot) dom.appRoot.classList.remove("pending-auth");
    bootOnce();
  }

  /* ---------------- 페이지 로드 시 세션 확인 ---------------- */
  async function tryRestoreSession() {
    const client = sb();
    if (!client) {
      fallbackToLocalMode("Supabase 클라이언트 없음");
      return;
    }

    let session = null;
    try {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      session = data.session;
    } catch (e) {
      console.warn("[auth.js] 세션 조회 실패:", e);
      showGate();
      return;
    }

    if (!session) {
      showGate();
      return;
    }

    // 요구사항 2/10: 이전 버전(익명 로그인)의 세션이 남아있으면 무조건
    // 로그아웃시키고 새 로그인 화면을 보여줍니다 — 절대 자동으로
    // 옛 익명 계정으로 들어가지 않습니다.
    if (session.user && session.user.is_anonymous) {
      try {
        await client.auth.signOut();
      } catch (e) {
        console.warn("[auth.js] 이전 익명 세션 로그아웃 실패(무시하고 로그인 화면 표시):", e);
      }
      if (App.Storage) App.Storage.clear("trading"); // 이전 익명 계정의 로컬 거래 데이터도 함께 정리(요구사항 16)
      showGate();
      return;
    }

    try {
      const { data: profile, error: profErr } = await client.from("profiles").select("nickname").eq("id", session.user.id).maybeSingle();
      if (profErr) throw profErr;
      if (profile && profile.nickname) {
        currentNickname = profile.nickname;
        await hydrateLocalStateFromSupabase(client, session.user.id);
        renderUserBadge();
        hideGate();
        bootOnce();
        return;
      }
    } catch (e) {
      console.warn("[auth.js] 프로필 조회 실패:", e);
    }

    // 세션은 있는데 프로필이 없는 비정상 상태 — 안전하게 로그아웃 후 로그인 화면
    try {
      await client.auth.signOut();
    } catch (e) {
      /* noop */
    }
    showGate();
  }

  /* ---------------- 로그인 ---------------- */
  async function submitLogin() {
    setError("");
    const nickname = normalizeNickname(dom.nicknameInput.value);
    const password = dom.passwordInput.value || "";

    if (!nickname) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해주세요.");
      return;
    }

    const client = sb();
    if (!client) {
      fallbackToLocalMode("Supabase 클라이언트 없음");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: nicknameToEmail(nickname),
        password,
      });
      if (error) {
        // 어느 쪽이 틀렸는지 구분해서 알려주지 않습니다(보안 관례) — 요구사항엔 없지만 안전한 기본값
        setError("닉네임 또는 비밀번호가 올바르지 않습니다.");
        setLoading(false);
        return;
      }
      currentNickname = nickname;
      await hydrateLocalStateFromSupabase(client, data.user.id);
      renderUserBadge();
      hideGate();
      bootOnce();
    } catch (e) {
      console.error("[auth.js] 로그인 중 오류:", e);
      setError("연결 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  /* ---------------- 회원가입 ---------------- */
  async function submitSignup() {
    setError("");
    const nickname = normalizeNickname(dom.nicknameInput.value);
    const password = dom.passwordInput.value || "";
    const confirm = dom.confirmInput.value || "";

    if (!nickname) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (nickname.length > NICKNAME_MAX_LEN) {
      setError("닉네임은 " + NICKNAME_MAX_LEN + "자 이내로 입력해주세요.");
      return;
    }
    if (password.length < PASSWORD_MIN_LEN) {
      setError("비밀번호는 " + PASSWORD_MIN_LEN + "자 이상 입력해주세요.");
      return;
    }
    if (password !== confirm) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    const client = sb();
    if (!client) {
      fallbackToLocalMode("Supabase 클라이언트 없음");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await client.auth.signUp({
        email: nicknameToEmail(nickname),
        password,
      });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        if (error.status === 422 || msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          setError("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
        } else {
          setError("회원가입에 실패했습니다: " + error.message);
        }
        setLoading(false);
        return;
      }
      if (!data.session || !data.user) {
        // Supabase 프로젝트의 "Confirm email" 설정이 켜져 있으면 세션이
        // 바로 안 옵니다 — 우리는 가짜 이메일이라 확인 메일을 받을 수
        // 없으므로, 이 설정은 반드시 꺼져 있어야 합니다(안내 문서 참고).
        setError("회원가입은 됐지만 자동 로그인에 실패했습니다. 관리자에게 문의해주세요(이메일 확인 설정 확인 필요).");
        setLoading(false);
        return;
      }

      const userId = data.user.id;

      const { error: insertErr } = await client.from("profiles").insert({ id: userId, nickname });
      if (insertErr) {
        if (insertErr.code === "23505") {
          setError("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
        } else {
          setError("프로필 생성에 실패했습니다: " + insertErr.message);
        }
        setLoading(false);
        return;
      }

      const { error: accErr } = await client.from("trading_accounts").insert({
        user_id: userId,
        balance: INITIAL_BALANCE,
        initial_balance: INITIAL_BALANCE,
        realized_pnl: 0,
      });
      if (accErr && accErr.code !== "23505") {
        console.warn("[auth.js] 초기 자산 생성 실패(계속 진행):", accErr);
      }

      currentNickname = nickname;
      if (App.Storage) App.Storage.clear("trading"); // 새 계정은 항상 깨끗한 상태로 시작
      renderUserBadge();
      hideGate();
      bootOnce();
    } catch (e) {
      console.error("[auth.js] 회원가입 중 오류:", e);
      setError("연결 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  /* ---------------- 로그아웃 ---------------- */
  async function logout() {
    const client = sb();
    if (!client) return;
    try {
      await client.auth.signOut();
    } catch (e) {
      console.warn("[auth.js] 로그아웃 중 오류(계속 진행):", e);
    }
    if (App.Storage) App.Storage.clear("trading"); // 다음 사람이 같은 브라우저를 써도 안 섞이게(요구사항 12/16)
    window.location.reload(); // 가장 확실하게 초기 상태(로그인 화면)로 되돌림
  }

  /* ---------------- 서버 데이터 → 로컬(localStorage) 복원 ----------------
   * trading.js는 안 건드리고, trading.js가 읽는 localStorage 형식 그대로
   * 채워넣기만 합니다. 미체결 지정가 주문(pendingOrder)은 클라우드
   * 스키마에 1:1로 없는 필드가 있어 이번 버전에서는 복원하지 않습니다
   * (로그인 직후엔 미체결 주문 없음 상태로 시작 — 알려진 한계).
   * ------------------------------------------------------------------- */
  async function hydrateLocalStateFromSupabase(client, userId) {
    if (!App.Storage) return;
    try {
      const [{ data: account }, { data: position }, { data: trades }, { data: orders }] = await Promise.all([
        client.from("trading_accounts").select("balance").eq("user_id", userId).maybeSingle(),
        client.from("positions").select("*").eq("user_id", userId).maybeSingle(),
        client.from("trades").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(200),
        client.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100),
      ]);

      const localPosition = position
        ? {
            side: position.side,
            entry: position.entry_price,
            leverage: position.leverage,
            margin: position.margin,
            qty: position.quantity,
            liq: position.liq_price,
            tp: position.tp_price,
            sl: position.sl_price,
            entryFee: position.entry_fee || 0,
            openTime: new Date(position.created_at).getTime(),
            orderId: position.id,
          }
        : null;

      const localClosedTrades = (trades || []).map((t) => ({
        side: t.side,
        leverage: t.leverage,
        entry: t.entry_price,
        exit: t.exit_price,
        qty: t.quantity,
        margin: t.margin,
        pnl: t.pnl,
        pnlPercent: t.roe,
        fee: t.fee,
        reason: t.close_reason,
        closeTime: new Date(t.created_at).getTime(),
      }));

      const localOrderHistory = (orders || []).map((o) => ({
        id: o.client_order_id || o.id,
        side: o.side,
        type: o.order_type,
        price: o.price,
        margin: o.margin,
        leverage: o.leverage,
        status: o.status,
        createdTime: new Date(o.created_at).getTime(),
        filledTime: o.filled_at ? new Date(o.filled_at).getTime() : undefined,
        cancelledTime: o.cancelled_at ? new Date(o.cancelled_at).getTime() : undefined,
      }));

      App.Storage.save("trading", {
        balance: account ? account.balance : INITIAL_BALANCE,
        leverage: localPosition ? localPosition.leverage : 10,
        position: localPosition,
        pendingOrder: null, // 알려진 한계(주석 참고)
        orderHistory: localOrderHistory,
        closedTrades: localClosedTrades,
        fundingHistory: [],
        lastSettledFundingTime: null,
      });
    } catch (e) {
      console.warn("[auth.js] 서버 데이터 복원 실패(기본값으로 시작):", e);
    }
  }

  /* ---------------- topbar 사용자 배지 + 로그아웃 버튼 ---------------- */
  function renderUserBadge() {
    if (dom.userNicknameText) dom.userNicknameText.textContent = currentNickname || "";
    if (dom.userBadge) dom.userBadge.style.display = "";
  }

  function bindEvents() {
    if (dom.submitBtn) {
      dom.submitBtn.addEventListener("click", () => {
        if (mode === "signup") submitSignup();
        else submitLogin();
      });
    }
    [dom.nicknameInput, dom.passwordInput, dom.confirmInput].forEach((input) => {
      if (!input) return;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          if (mode === "signup") submitSignup();
          else submitLogin();
        }
      });
    });
    if (dom.toggleLink) {
      dom.toggleLink.addEventListener("click", (e) => {
        e.preventDefault();
        setMode(mode === "signup" ? "login" : "signup");
      });
    }
    if (dom.logoutBtn) {
      dom.logoutBtn.addEventListener("click", logout);
    }
  }

  function init() {
    cacheDom();
    if (!dom.gate) {
      fallbackToLocalMode("게이트 DOM 없음");
      return;
    }
    setMode("login");
    bindEvents();
    tryRestoreSession();
  }

  return { init, getNickname: () => currentNickname };
})();
