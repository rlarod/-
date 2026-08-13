/* =========================================================================
 * js/storage.js — App.Storage
 * =========================================================================
 * 브라우저 영구 저장 전용 모듈입니다. localStorage로 구현되어 있지만,
 * 다른 모듈은 save(key, data)/load(key)/clear(key) 세 함수만 호출하고
 * "어디에 저장되는지"는 전혀 모릅니다 — 나중에 Supabase DB로 바꿀 때
 * 이 파일 내부만 다시 구현하면 되고, 호출하는 쪽은 손댈 필요가 없습니다.
 *
 * key로 여러 "문서"를 독립적으로 저장합니다. 예:
 *   App.Storage.save('trading', {...})   → 잔고/포지션/거래내역
 *   App.Storage.save('settings', {...})  → 표시 통화 등 UI 설정
 * 각 문서는 자체 스키마 버전을 가지므로, 한쪽 스키마가 바뀌어도 다른
 * 문서에는 영향이 없습니다.
 *
 * ── 나중에 Supabase로 교체하려면 ─────────────────────────────────
 * save/load/clear의 이름과 역할을 유지한 채 내부만 Supabase 호출로
 * 바꾸면 됩니다. 지금은 동기 함수지만, 호출하는 쪽(trading.js 등)은
 * 반환값을 기다리지 않고 "실패해도 무시"하는 방식으로 호출하므로,
 * 나중에 비동기(Promise)로 바뀌어도 호출부 수정이 최소화됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.Storage = (function () {
  "use strict";

  const KEY_PREFIX = "btc_sim_v2_"; // v2: USDT 내부 통화 모델로 전환하며 스키마가 바뀌어 접두어 갱신
  const SCHEMA_VERSION = 1;

  function checkAvailable() {
    try {
      const testKey = "__storage_test__";
      window.localStorage.setItem(testKey, "1");
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      console.warn("[storage.js] localStorage를 사용할 수 없는 환경입니다 — 저장 기능이 꺼집니다:", e);
      return false;
    }
  }

  const available = checkAvailable();

  function save(key, data) {
    if (!available) return false;
    try {
      const payload = { version: SCHEMA_VERSION, savedAt: Date.now(), state: data };
      window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.error("[storage.js] 저장 실패(key=" + key + "):", e);
      return false;
    }
  }

  function load(key) {
    if (!available) return null;
    try {
      const raw = window.localStorage.getItem(KEY_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || parsed.version !== SCHEMA_VERSION || !parsed.state) {
        return null; // 손상되었거나 스키마 버전이 다름
      }
      return parsed.state;
    } catch (e) {
      console.warn("[storage.js] 저장된 데이터가 손상되어 무시합니다(key=" + key + "):", e);
      return null;
    }
  }

  function clear(key) {
    if (!available) return;
    try {
      window.localStorage.removeItem(KEY_PREFIX + key);
    } catch (e) {
      /* noop */
    }
  }

  return { save, load, clear, isAvailable: () => available };
})();
