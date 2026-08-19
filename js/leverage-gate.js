/* =========================================================================
 * js/leverage-gate.js — App.LeverageGate
 * =========================================================================
 * 레버리지 상한을 아이템으로 열어주는 장치입니다.
 *
 *   기본           최대 DEFAULT_MAX 배
 *   이용권 사용 중  최대 (아이템의 effect_value) 배
 *   이용권 끝나면   다시 DEFAULT_MAX 배
 *
 * ── 기존 시스템을 어떻게 건드리지 않는가 ────────────────────────────────
 * js/trading.js 는 수정 금지 파일이고 MAX_LEVERAGE = 125 가 상수로 박혀
 * 있습니다. 다행히 App.Trading.setLeverage 가 밖으로 나와 있어서, 그걸
 * 감싸 상한을 한 번 더 조입니다. trading.js 는 한 줄도 안 건드립니다.
 *
 * ── 이미 잡은 포지션은 건드리지 않습니다 ────────────────────────────────
 * 이용권이 끝나도 보유 포지션을 바꾸거나 청산하지 않습니다.
 * 앞으로 넣는 주문의 상한만 기본값으로 되돌립니다.
 *
 * ── 상한 판정은 서버 값으로 ─────────────────────────────────────────────
 * 지금 이용권이 켜져 있는지는 서버의 active_user_effects() 로 확인합니다.
 * 화면 값을 고쳐도 상한이 열리지 않습니다.
 * (실제 주문 체결은 어차피 증거금 기준이라, 상한은 UI 제한입니다.)
 * ========================================================================= */

window.App = window.App || {};

App.LeverageGate = (function () {
  "use strict";

  /* ===== 최대 레버리지 설정 — 이 한 곳만 바꾸면 사이트 전체가 따라옵니다 =====
     지금은 모든 사용자에게 100배를 열어둡니다(이용권 없이도 100배 가능).
     나중에 이용자가 많아지면 이 값을 50으로 내리기만 하면
     기본 50배 + 이용권 사용 시 100배 구조로 즉시 전환됩니다.
     이용권 처리는 이미 아래에 다 들어 있어서 코드를 더 고칠 필요가 없습니다. */
  var DEFAULT_MAX = 100;

  /* 슬라이더·팝업 등 화면에서 쓸 수 있게 밖으로도 내줍니다.
     레버리지 상한을 코드 여기저기에 박지 않기 위한 단일 출처입니다. */
  var ITEM_TYPE = "leverage_boost";
  var REFRESH_MS = 60000;

  var boostedMax = null;      // 이용권으로 열린 상한(없으면 null)
  var boostExpiresAt = null;
  var timer = null;
  var wrapped = false;

  function currentMax() {
    if (boostedMax && boostExpiresAt && new Date(boostExpiresAt).getTime() > Date.now()) {
      return Math.max(DEFAULT_MAX, Number(boostedMax) || 0);
    }
    return DEFAULT_MAX;
  }

  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }

  /* 서버에서 지금 켜져 있는 효과를 받아옵니다. */
  function refresh() {
    var client = sb();
    if (!client) return Promise.resolve(currentMax());
    return Promise.resolve(client.rpc("active_user_effects"))
      .then(function (r) {
        if (r.error) throw r.error;
        var d = r.data || {};
        var best = null;
        (d.timed || []).forEach(function (e) {
          if (e.item_type !== ITEM_TYPE) return;
          if (new Date(e.expires_at).getTime() <= Date.now()) return;
          if (!best || Number(e.effect_value) > Number(best.effect_value)) best = e;
        });
        boostedMax = best ? Number(best.effect_value) : null;
        boostExpiresAt = best ? best.expires_at : null;
        applyToUi();
        return currentMax();
      })
      .catch(function () {
        /* 서버 설정 전이거나 로그아웃 — 기본 상한으로 둡니다 */
        boostedMax = null;
        boostExpiresAt = null;
        applyToUi();
        return currentMax();
      });
  }

  /* 슬라이더 최대값과 현재 표시값을 상한에 맞춥니다. */
  function applyToUi() {
    var max = currentMax();
    var slider = document.getElementById("lev-slider");
    if (slider) {
      slider.max = String(max);
      if (Number(slider.value) > max) {
        slider.value = String(max);
        try {
          slider.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (e) {
          /* 무시 */
        }
      }
    }
    var disp = document.getElementById("lev-display");
    if (disp) {
      var v = parseFloat(disp.textContent);
      if (isFinite(v) && v > max) disp.textContent = String(max);
    }
  }

  /* App.Trading.setLeverage 를 감싸 상한을 한 번 더 조입니다. */
  function wrap() {
    if (wrapped) return true;
    if (!App.Trading || typeof App.Trading.setLeverage !== "function") return false;
    var orig = App.Trading.setLeverage;
    App.Trading.setLeverage = function (lev) {
      var max = currentMax();
      var v = Number(lev);
      if (isFinite(v) && v > max) v = max;
      return orig.call(App.Trading, v);
    };
    wrapped = true;
    return true;
  }

  function init() {
    if (!wrap()) {
      var tries = 0;
      var t = setInterval(function () {
        if (wrap() || ++tries > 100) clearInterval(t);
      }, 100);
    }
    applyToUi();
    refresh();
    /* 이용권이 끝나는 순간을 놓치지 않게 주기적으로 확인합니다. */
    timer = setInterval(function () {
      if (boostExpiresAt && new Date(boostExpiresAt).getTime() <= Date.now()) {
        boostedMax = null;
        boostExpiresAt = null;
        applyToUi();
      }
      refresh();
    }, REFRESH_MS);
    if (App.Bus && typeof App.Bus.on === "function") App.Bus.on("auth:changed", refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    refresh: refresh,
    currentMax: currentMax,
    getDefaultMax: function () { return DEFAULT_MAX; },
    setDefaultMax: function (n) {
      var v = Number(n);
      if (isFinite(v) && v >= 1) { DEFAULT_MAX = Math.floor(v); applyToUi(); }
    },
    _setBoost: function (max, expiresAt) { boostedMax = max; boostExpiresAt = expiresAt; applyToUi(); },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.LeverageGate;
