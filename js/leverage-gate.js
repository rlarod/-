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
 * ── ⭐ 엔진 상한을 절대 넘지 않습니다 (2026-08-28 추가) ─────────────────
 * js/trading.js:96 에 MAX_LEVERAGE 가 박혀 있고, setLeverage() 가 그 값으로
 * 조용히 깎습니다(오류 없음). 그래서 서버에 그보다 큰 이용권이 등록되면
 *   화면 "150배 사용 중"   ↔   엔진 실제 125배
 * 가 되어 회원이 잘못된 배율·청산가를 보게 됩니다 — CLAUDE.md 가 말하는
 * '조용한 고장' 입니다.
 *
 * 숫자(125)를 여기에 박지 않습니다. 박으면 엔진 값이 바뀔 때 조용히
 * 어긋납니다. 대신 ★엔진에 실제로 넣어 보고 되돌아온 값★ 을 잽니다
 * (tests/symbol-spec.test.js 의 [7] 이 쓰는 것과 같은 방법입니다).
 * 잰 뒤에는 원래 배율로 되돌려 놓습니다.
 *
 * 깎였을 때는 조용히 넘어가지 않고 회원에게 한 줄로 알립니다.
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

  /* ===== 엔진 상한 (js/trading.js:96 MAX_LEVERAGE) =====
     그 파일은 수정 금지라 값을 읽어올 방법이 없습니다. 그래서 글자로 읽지 않고
     ★실제로 큰 값을 넣어 보고 되돌아온 값★ 을 잽니다. 엔진 쪽 숫자가 바뀌어도
     여기서 자동으로 따라갑니다. 한 번만 재고 그 뒤로는 기억해 둡니다. */
  var PROBE = 100000;         // 어떤 상한이든 넘도록 충분히 큰 값
  var engineMaxCache = null;  // 잰 값 (못 쟀으면 null — 다음에 다시 시도)
  var measuring = false;      // 재는 중 재진입 방지 (감싼 setLeverage 와 물지 않게)
  var origSetLeverage = null; // 감싸기 전 원본 (wrap() 에서 채웁니다)

  function engineMax() {
    if (engineMaxCache !== null) return engineMaxCache;
    if (measuring) return null;
    if (!App.Trading || typeof App.Trading.getSnapshot !== "function") return null;
    var setter = origSetLeverage ||
      (typeof App.Trading.setLeverage === "function" ? App.Trading.setLeverage : null);
    if (!setter) return null;

    /* ★ 되돌릴 값을 ★먼저★ 확보합니다.
       읽는 것 자체가 실패하거나 값이 이상하면 ★아예 재보지 않습니다★ —
       못 읽은 값은 되돌려 놓을 수가 없어서, 재는 순간 회원 배율이
       엔진 상한(PROBE 가 깎인 값)에 그대로 남게 됩니다. 그건 돈에 직결됩니다.
       다음 기회에 다시 시도합니다(엔진 상한은 급한 값이 아닙니다). */
    var before = null;
    try {
      before = Number((App.Trading.getSnapshot() || {}).leverage);
    } catch (e) {
      return null;
    }
    if (!isFinite(before) || before < 1) return null;

    measuring = true;
    try {
      setter.call(App.Trading, PROBE);
      var got = Number((App.Trading.getSnapshot() || {}).leverage);
      if (isFinite(got) && got >= 1) engineMaxCache = got;
    } catch (e) {
      /* 못 재면 모름으로 둡니다. 모를 때는 조이지 않습니다(지금보다 나빠지지 않게) */
    } finally {
      /* ★ 무조건 되돌립니다 — 가운데서 예외가 나도 회원 배율이 남으면 안 됩니다.
         js/symbol-guard.js 가 같은 문제를 finally 로 푼 것과 같은 방식입니다. */
      try {
        setter.call(App.Trading, before);
      } catch (e2) {
        /* 되돌리기까지 실패하면 더 할 수 있는 것이 없습니다. 최소한 알립니다. */
        console.error("[LeverageGate] 배율 복구 실패 — 원래 값 " + before + "배:", e2);
      }
      measuring = false;
    }
    return engineMaxCache;
  }

  var cappedFrom = null; // 깎이기 전에 쓰려던 값 (안 깎였으면 null)
  var capWarned = false;

  function currentMax() {
    var want = DEFAULT_MAX;
    if (boostedMax && boostExpiresAt && new Date(boostExpiresAt).getTime() > Date.now()) {
      want = Math.max(DEFAULT_MAX, Number(boostedMax) || 0);
    }

    /* ★ 엔진이 받아주는 값을 넘지 않습니다.
       넘으면 회원은 want 배로 잡은 줄 아는데 엔진은 조용히 깎습니다. */
    var eng = engineMax();
    if (eng && want > eng) {
      if (cappedFrom !== want) {
        cappedFrom = want;
        if (!capWarned) {
          capWarned = true;
          console.warn(
            "[LeverageGate] 상한 " + want + "배가 거래 엔진 상한 " + eng +
            "배를 넘습니다(js/trading.js MAX_LEVERAGE). " + eng + "배로 맞춰서 보여줍니다."
          );
        }
      }
      return eng;
    }
    if (cappedFrom !== null) cappedFrom = null;
    return want;
  }

  /* 깎였을 때 회원에게 한 줄로 알립니다 — 조용히 자르면 그것도 조용한 고장입니다.
     레버리지 창(js/leverage-modal.js)이 만들어진 뒤에만 붙이고, 그 파일이 쓰는
     #lev-modal-note 는 건드리지 않습니다(서로 덮어쓰지 않게 자리를 나눕니다). */
  var CAP_NOTE_ID = "lev-cap-note";

  function renderCapNote() {
    var old = document.getElementById(CAP_NOTE_ID);
    if (cappedFrom === null) {
      if (old && old.parentNode) old.parentNode.removeChild(old);
      return;
    }
    var eng = engineMax();
    if (!eng) return;
    var anchor = document.getElementById("lev-modal-note");
    if (!anchor || !anchor.parentNode) return; // 창이 아직 없으면 다음 기회에

    var note = old;
    if (!note) {
      note = document.createElement("p");
      note.id = CAP_NOTE_ID;
      note.className = "lev-modal-note";
      anchor.parentNode.insertBefore(note, anchor.nextSibling);
    }
    note.textContent =
      "안내 — 이용권 상한은 " + cappedFrom + "배지만 거래 엔진 상한이 " + eng +
      "배라, 실제로는 " + eng + "배까지만 적용됩니다.";
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
    renderCapNote();
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
    origSetLeverage = orig; // 엔진 상한을 잴 때 감싼 것 말고 원본을 씁니다(재귀 방지)
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
    /* ★ 재는 시점 — 부팅할 때 딱 한 번입니다.
       한 번 재면 기억해 두고 그 뒤로는 엔진을 다시 건드리지 않습니다.
       회원이 주문을 넣는 중에 재는 일이 없도록, 화면이 뜨자마자 끝냅니다.
       (여기서 못 재면 값을 안 바꾸고 조용히 넘어가며, 나중에 다시 시도합니다) */
    engineMax();
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
    /* 엔진(js/trading.js)이 실제로 받아주는 최대 배율. 못 쟀으면 null */
    getEngineMax: engineMax,
    /* 엔진 상한 때문에 깎이고 있으면 '깎이기 전 값', 아니면 null */
    getCappedFrom: function () { return cappedFrom; },
    setDefaultMax: function (n) {
      var v = Number(n);
      if (isFinite(v) && v >= 1) { DEFAULT_MAX = Math.floor(v); applyToUi(); }
    },
    _setBoost: function (max, expiresAt) { boostedMax = max; boostExpiresAt = expiresAt; applyToUi(); },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.LeverageGate;
