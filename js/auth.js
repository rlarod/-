/* =========================================================================
 * js/auth.js — App.Auth
 * =========================================================================
 * 사이트 접속 → 닉네임 입력 → Supabase 익명 로그인 → profiles/trading_accounts
 * 생성 → 기존 거래 화면 진입까지 담당합니다.
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────────
 *   1) 페이지 로드 시 기존 Supabase 세션이 있는지 확인(있으면 닉네임 화면
 *      건너뛰고 바로 부팅 — 새로고침/재접속 복구)
 *   2) 세션이 없으면 닉네임 입력 게이트를 보여줌
 *   3) 닉네임 제출 시: 익명 로그인 → profiles insert(닉네임 중복이면 에러
 *      메시지) → trading_accounts insert(최초 10,000 USDT, 이미 있으면
 *      건드리지 않음) → 게이트를 닫고 App.bootApp()으로 기존 거래 화면 시작
 *
 * ── 기존 기능과의 관계 ───────────────────────────────────────────
 * js/trading.js/localStorage 저장 로직은 이 모듈이 전혀 건드리지 않습니다.
 * 지금 단계에서는 "누가 접속했는지"만 Supabase로 관리하고, 실제 거래
 * 데이터는 여전히 기존 방식(localStorage) 그대로입니다 — 거래 데이터를
 * Supabase로 옮기는 건 다음 단계입니다.
 *
 * ── 안전장치 ────────────────────────────────────────────────────
 * Supabase 연결 자체가 실패해도(CDN 로딩 실패, 네트워크 차단 등) 기존
 * 로컬 모의투자 기능은 그대로 켜지도록 폴백합니다 — 닉네임 시스템 때문에
 * 기존에 잘 되던 기능이 완전히 막히는 일은 없습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Auth = (function () {
  "use strict";

  const NICKNAME_MAX_LEN = 12;
  const INITIAL_BALANCE = 10000;

  let dom = {};
  let currentNickname = null;
  let booted = false; // App.bootApp()이 이미 호출됐는지(중복 부팅 방지)

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient.get();
  }

  function cacheDom() {
    dom = {
      gate: el("auth-gate"),
      input: el("auth-nickname-input"),
      err: el("auth-err"),
      startBtn: el("auth-start-btn"),
      loadingEl: el("auth-loading"),
      appRoot: document.querySelector(".app"),
    };
  }

  function showGate() {
    if (dom.gate) dom.gate.style.display = "flex";
    if (dom.appRoot) dom.appRoot.classList.add("pending-auth");
    if (dom.input) dom.input.focus();
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
    if (dom.startBtn) dom.startBtn.disabled = isLoading;
    if (dom.input) dom.input.disabled = isLoading;
  }

  function bootOnce() {
    if (booted) return;
    booted = true;
    App.bootApp();
  }

  // Supabase 자체를 못 쓰면(CDN 실패 등) 닉네임 시스템을 건너뛰고 바로
  // 기존 로컬 모의투자로 폴백합니다.
  function fallbackToLocalMode(reason) {
    console.warn("[auth.js] 닉네임/로그인 기능을 건너뜁니다(" + reason + ") — 기존 로컬 모의투자만 동작합니다.");
    if (dom.gate) dom.gate.style.display = "none";
    if (dom.appRoot) dom.appRoot.classList.remove("pending-auth");
    bootOnce();
  }

  /* ---------------- 세션 복구(새로고침/재접속) ---------------- */
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

    try {
      const { data: profile, error: profErr } = await client
        .from("profiles")
        .select("nickname")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profErr) throw profErr;

      if (profile && profile.nickname) {
        currentNickname = profile.nickname;
        renderNicknameBadge();
        hideGate();
        bootOnce();
        return;
      }
    } catch (e) {
      console.warn("[auth.js] 프로필 조회 실패, 닉네임 화면으로 진행:", e);
    }

    // 익명 세션은 있는데 프로필이 아직 없는 경우(닉네임 입력 중 이탈 등)
    // → 새 익명 계정을 또 만들지 않고, 같은 세션 그대로 닉네임만 다시 받습니다.
    showGate();
  }

  /* ---------------- 익명 로그인(이미 세션 있으면 재사용) ---------------- */
  async function ensureAnonymousSession(client) {
    const { data } = await client.auth.getSession();
    if (data.session) return data.session;
    const { data: signInData, error } = await client.auth.signInAnonymously();
    if (error) throw error;
    return signInData.session;
  }

  /* ---------------- 닉네임 제출 ---------------- */
  async function submitNickname() {
    const raw = (dom.input.value || "").trim();
    setError("");

    if (!raw) {
      setError("닉네임을 입력해주세요.");
      return;
    }
    if (raw.length > NICKNAME_MAX_LEN) {
      setError("닉네임은 " + NICKNAME_MAX_LEN + "자 이내로 입력해주세요.");
      return;
    }

    const client = sb();
    if (!client) {
      fallbackToLocalMode("Supabase 클라이언트 없음");
      return;
    }

    setLoading(true);
    try {
      const session = await ensureAnonymousSession(client);
      const userId = session.user.id;

      const { error: insertErr } = await client.from("profiles").insert({ id: userId, nickname: raw });
      if (insertErr) {
        if (insertErr.code === "23505") {
          // unique 제약 위반 = 닉네임 중복(요구사항 6)
          setError("이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해주세요.");
        } else {
          setError("닉네임 저장에 실패했습니다: " + insertErr.message);
        }
        setLoading(false);
        return;
      }

      // 최초 10,000 USDT 지급(요구사항 5). user_id가 기본키라 이미 있으면
      // insert 자체가 막혀서 재지급될 수 없습니다(23505는 "이미 있음"으로
      // 간주하고 조용히 넘어갑니다 — 정상 상황).
      const { error: accErr } = await client.from("trading_accounts").insert({
        user_id: userId,
        balance: INITIAL_BALANCE,
        initial_balance: INITIAL_BALANCE,
        realized_pnl: 0,
      });
      if (accErr && accErr.code !== "23505") {
        console.warn("[auth.js] 초기 자산 생성 실패(계속 진행하되 다음 접속 때 재시도 필요할 수 있음):", accErr);
      }

      currentNickname = raw;
      renderNicknameBadge();
      hideGate();
      bootOnce();
    } catch (e) {
      console.error("[auth.js] 닉네임 처리 중 오류:", e);
      setError("연결 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
      setLoading(false);
    }
  }

  // topbar에 닉네임 배지 표시 — 기존 .ws-status 구조는 그대로 두고 옆에만 끼워 넣음
  function renderNicknameBadge() {
    const wsStatus = document.querySelector(".ws-status");
    if (!wsStatus || !currentNickname) return;
    let badge = el("auth-nickname-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.id = "auth-nickname-badge";
      badge.className = "auth-nickname-badge";
      wsStatus.parentNode.insertBefore(badge, wsStatus);
    }
    badge.textContent = "👤 " + currentNickname;
  }

  function bindEvents() {
    if (dom.startBtn) dom.startBtn.addEventListener("click", submitNickname);
    if (dom.input) {
      dom.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitNickname();
      });
    }
  }

  function init() {
    cacheDom();
    if (!dom.gate) {
      // 게이트 DOM 자체가 없으면(예: index.html이 아직 안 바뀐 상태) 조용히 폴백
      fallbackToLocalMode("게이트 DOM 없음");
      return;
    }
    bindEvents();
    tryRestoreSession();
  }

  return { init, getNickname: () => currentNickname };
})();
