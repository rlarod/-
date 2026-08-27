/* =========================================================================
 * js/stat-volume-unit.js — App.StatVolumeUnit
 * =========================================================================
 * 24H 거래량 뒤의 단위를 종목에 맞게 붙입니다 (2026-08-27, 차트팀)
 *
 * ── 무슨 문제였나 ────────────────────────────────────────────────
 * js/chart.js:498 (수정 금지 파일) 이 단위를 글자로 박아 씁니다.
 *
 *     dom.statVolume.textContent = App.Utils.formatVolume(payload.volume) + " BTC";
 *
 * 비트코인 하나만 있을 때는 맞는 말이었지만, 종목 전환이 열리면
 * 삼성전자를 보면서도 "1.20M BTC" 가 됩니다(조사팀 실측). 숫자는 주식 수량인데
 * 이름표는 코인이라, 회원이 잘못된 정보로 판단하게 되는 자리입니다.
 *
 * ── 어떻게 고치나 — 그 한 칸의 textContent 를 가로챕니다 ─────────────
 * #stat-volume 요소 하나에만 textContent 접근자(setter)를 덮어씌웁니다.
 * chart.js 가 값을 써넣는 그 순간 문자열 끝의 단위만 갈아끼우고,
 * 원래 setter(Node.prototype)로 넘깁니다. chart.js 는 한 글자도 안 고칩니다.
 *
 * MutationObserver 가 아니라 이 방법을 고른 이유 (2026-08-27 실측, 크롬):
 *   ① 값 쓰기가 틱당 1번으로 끝납니다. 관측자는 "쓰고 → 알림 → 다시 쓰기" 라
 *      틱당 DOM 쓰기가 2번이 되고 콜백이 마이크로태스크로 한 번 더 돕니다.
 *      실측 — 지금 이 방식은 시세 틱 16회에 #stat-volume 변경 기록이 정확히 16건입니다.
 *   ② 비용이 절반입니다. 같은 조건에서 2만 번 써서 잰 1회 평균 —
 *        아무것도 안 붙임 0.00276ms / 이 방식 0.00331ms / 관측자 0.00382ms
 *        → 늘어난 값  이 방식 +0.00055ms,  관측자 +0.00106ms
 *      실제 칸(#stat-volume)에서 켬·끔을 5번씩 번갈아 재면 중앙값 차이 0.0029ms 로,
 *      측정 흔들림(같은 조건 반복 편차 ±0.005ms)보다 작습니다.
 *      24H 거래량 갱신은 30.8초에 16회(초당 0.52회)라 사실상 0 입니다.
 *   ③ 관측자는 틀린 단위가 한 번 그려진 뒤 고쳐지지만, 접근자는 그려지기 전에
 *      바뀌므로 잘못된 단위가 한 프레임도 안 보입니다.
 * defineProperty 가 막힌 환경이면 관측자 방식으로 자동으로 떨어집니다.
 *
 * ── 단위는 어디서 읽나 ───────────────────────────────────────────
 * App.Utils.qtyUnit() — 종목 규격표(App.SymbolRegistry)에서 읽습니다.
 * 여기서 새로 만들지 않습니다. 모르는 종목이면 지금까지의 값("BTC")입니다.
 *   BTCUSDT → BTC / SAMSUNGUSDT → 주 / QQQUSDT → 주
 *
 * ⚠ 지금(비트코인 전용)은 화면이 한 글자도 안 바뀝니다.
 *    "132.38K BTC" → 그대로 "132.38K BTC".
 *
 * ⚠ js/symbol-stream-switch.js(수리팀, 아직 미커밋)에도 같은 목적의 fixVolumeUnit 이
 * 있습니다. 그쪽은 ticker:update 에 붙어 있고 그 구독이 js/chart.js 보다 먼저 등록되어
 * (스크립트를 읽는 즉시 boot() 하므로) chart.js 가 뒤이어 " BTC" 로 덮어씁니다.
 * 그리고 관측자를 다는 watchVolume() 은 init() 안에 있는데 그 init() 을 부르는 곳이
 * 저장소에 없습니다 — 그래서 지금은 효력이 없습니다. 이 파일은 그와 무관하게
 * 동작하고, 그쪽이 나중에 살아나도 결과가 같아 충돌하지 않습니다(값이 맞으면 즉시 반환).
 *
 * 되돌리기 — index.html 의 이 파일 <script> 한 줄을 지우면 원래대로입니다.
 * ========================================================================= */

window.App = window.App || {};

App.StatVolumeUnit = (function () {
  "use strict";

  var TARGET_ID = "stat-volume";
  var FALLBACK = "BTC";

  /* 끝에 이미 붙어 있는 단위. 숫자 뒤 공백 + 글자(BTC · 주 · ETH …) */
  var TAIL = /\s+(?:주|[A-Za-z]{2,6})\s*$/;

  var installed = false;   /* 접근자를 덮었나 */
  var mode = "none";       /* "setter" | "observer" | "none" */
  var hooked = null;       /* 접근자를 덮어씌운 요소 */
  var observer = null;
  var applying = false;

  function target() {
    return document.getElementById(TARGET_ID);
  }

  function unit() {
    if (App.Utils && typeof App.Utils.qtyUnit === "function") {
      try {
        return App.Utils.qtyUnit() || FALLBACK;
      } catch (e) {
        return FALLBACK;
      }
    }
    return FALLBACK;
  }

  /* 화면에 들어갈 글자를 만듭니다. 값이 아닌 것("-" · 빈칸)은 그대로 둡니다. */
  function retag(value) {
    if (value === null || value === undefined) return value;
    var s = String(value);
    var t = s.trim();
    if (!t || t === "-") return s;      /* 종목 전환 중 비운 상태 */
    if (!/[0-9]/.test(t)) return s;     /* 숫자가 없으면 거래량 값이 아님 */
    var want = t.replace(TAIL, "") + " " + unit();
    return want === s ? s : want;
  }

  /* ---------------- 방법 1) textContent 접근자 덮어쓰기 ---------------- */
  function installSetter(el) {
    var base = Object.getOwnPropertyDescriptor(Node.prototype, "textContent");
    if (!base || typeof base.set !== "function" || typeof base.get !== "function") return false;
    try {
      Object.defineProperty(el, "textContent", {
        configurable: true,
        enumerable: false,
        get: function () {
          return base.get.call(this);
        },
        set: function (v) {
          base.set.call(this, retag(v));
        },
      });
    } catch (e) {
      return false;
    }
    hooked = el;
    mode = "setter";
    return true;
  }

  /* ---------------- 방법 2) 못 덮었을 때만 — 관측자 ---------------- */
  function fix() {
    var el = target();
    if (!el) return;
    var now = el.textContent;
    var want = retag(now);
    if (want === now) return;
    applying = true;
    el.textContent = want;
    applying = false;
  }

  function installObserver(el) {
    if (typeof MutationObserver !== "function") return false;
    observer = new MutationObserver(function () {
      if (applying) return;
      fix();
    });
    observer.observe(el, { childList: true, characterData: true, subtree: true });
    hooked = el;
    mode = "observer";
    fix();
    return true;
  }

  /* ---------------- 설치 ---------------- */
  function install() {
    var el = target();
    if (!el) return false;
    if (installed && hooked === el && el.isConnected) return true;
    installed = false;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    installed = installSetter(el) || installObserver(el);
    if (installed) apply();
    return installed;
  }

  /* 지금 들어 있는 글자를 다시 손봅니다(종목이 바뀐 직후 등). */
  function apply() {
    var el = target();
    if (!el) return;
    var now = el.textContent;
    var want = retag(now);
    if (want !== now) el.textContent = want;
  }

  var wired = false;
  function wire() {
    if (wired) return true;
    if (!App.Bus || typeof App.Bus.on !== "function") return false;
    /* 종목이 바뀌면 다음 시세를 기다리지 않고 바로 이름표를 맞춥니다.
       시세 틱마다 도는 일이 아니라 틱 비용이 붙지 않습니다. */
    App.Bus.on("symbol:change", function () {
      install();
      apply();
    });
    wired = true;
    return true;
  }

  function init() {
    install();
    wire();
  }

  /* main.js 의 init 목록에 기대지 않고 스스로 붙습니다.
     (App.Bus 는 main.js 에서 만들어지고, 이 파일은 그보다 뒤에 읽힙니다) */
  wire();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    install();
  }

  return {
    init: init,
    apply: apply,
    install: install,
    retag: retag,
    unit: unit,
    getMode: function () {
      return mode;
    },
    isInstalled: function () {
      return installed;
    },
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.StatVolumeUnit;
