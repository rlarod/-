/* =========================================================================
 * js/season.js — App.Season
 * =========================================================================
 * 관리자가 "전체 시즌 초기화"를 실행하면 서버(app_meta.season_version)가
 * 올라갑니다. 이 모듈은 부팅 직전에 서버 시즌 버전과 이 브라우저에 저장된
 * 버전을 비교해서, 다르면 로컬(localStorage) 거래 상태만 지웁니다.
 *
 * ── 왜 trading.js보다 먼저 실행되어야 하는지 ─────────────────────────
 * trading.js는 init() 시점에 localStorage를 읽어서 메모리에 올립니다.
 * 그 후에 지워봐야 이미 메모리에 올라간 옛 시즌 데이터가 화면에 남습니다.
 * 그래서 main.js가 App.bootApp()(=실제 모듈 부팅) 실행 "직전"에 이
 * 모듈을 먼저 실행하도록 연결했습니다(main.js만 한 줄 수정, trading.js는
 * 전혀 안 건드림).
 *
 * ── 최초 접속(이 브라우저에 시즌 기록이 아예 없는 경우) ────────────────
 * 지울 로컬 데이터 자체가 없으므로 아무것도 삭제하지 않고, 서버 버전만
 * 그대로 저장해둡니다(불필요한 "새 시즌 시작" 안내도 띄우지 않음).
 * ========================================================================= */

window.App = window.App || {};

App.Season = (function () {
  "use strict";

  const LOCAL_KEY = "season_version"; // App.Storage가 자동으로 prefix를 붙여서 저장

  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function checkAndReset() {
    const client = sb();
    if (!client || !App.Storage) return; // Supabase/저장소가 없으면 조용히 스킵(기존 로컬 동작 그대로)

    let serverVersion = null;
    try {
      const { data, error } = await client.from("app_meta").select("value").eq("key", "season_version").maybeSingle();
      if (error) throw error;
      if (data) serverVersion = data.value;
    } catch (e) {
      console.warn("[season.js] 시즌 버전 조회 실패(로컬 데이터는 그대로 유지):", e);
      return;
    }
    if (serverVersion === null) return; // 서버에 값이 아직 없으면(스키마 미실행 등) 아무 것도 안 함

    const localSaved = App.Storage.load(LOCAL_KEY);
    const localVersion = localSaved ? localSaved.value : null;

    if (localVersion === null) {
      // 이 브라우저 최초 접속 — 지울 로컬 거래 데이터가 없으므로 버전만 기록
      App.Storage.save(LOCAL_KEY, { value: serverVersion });
      return;
    }

    if (localVersion !== serverVersion) {
      App.Storage.clear("trading"); // trading.js가 쓰는 키 그대로(trading.js 코드는 안 건드림)
      App.Storage.save(LOCAL_KEY, { value: serverVersion });
      showResetBanner();
    }
  }

  function showResetBanner() {
    const div = document.createElement("div");
    div.className = "season-reset-banner";
    div.textContent = "🔄 새로운 시즌이 시작되었습니다.";
    document.body.appendChild(div);
    setTimeout(() => {
      div.classList.add("season-reset-banner-hide");
      setTimeout(() => div.remove(), 500);
    }, 5000);
  }

  return { checkAndReset };
})();
