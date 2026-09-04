/* =========================================================================
 * js/chart-indicator-room.js — App.ChartIndicatorRoom
 * =========================================================================
 * 「아래 칸에 지표 값이 들어갈 자리가 있는가」 를 재는 곳입니다.
 * 이 파일이 ★자리 계산의 유일한 원본★ 입니다 — 계수도 여유폭도 여기 한 번만
 * 적습니다. 틀(chart-indicator-kit.js)과 창(chart-indicator-picker.js)은
 * 숫자를 안 갖고 이 파일에 물어보기만 합니다.
 *
 * ── 무슨 일이 있었나 (2026-09-04, P2) ────────────────────────────────
 * 아래 칸(별도 칸) 지표를 여러 개 켜면 칸이 얇아져서 ★값 배지가 잘려 나갑니다★.
 * 오류도 안 나고 선은 그대로 그려집니다. 회원은 「지금 값이 얼마인지」만
 * 못 봅니다 — 전형적인 조용한 고장입니다.
 *
 * ── 라이브러리가 배지를 어떻게 그리는지 (2026-09-04 수리팀 실측) ──────
 * lightweight-charts 5.2.0 은 값이 서로 가까우면 배지를 ★세로로 쌓습니다★.
 * 쌓은 더미가 칸보다 길면 ★아래쪽부터 그냥 잘립니다★(다시 나눠 담지 않습니다).
 *
 *   1440 · 축글씨 21px · MACD(값 3개) · 아래 칸 높이를 2px 씩 훑은 값
 *       칸  95px → 배지 3개 온전 (더미 끝 89)
 *       칸  79px → 세 번째 배지 21px 만 보임
 *       칸  67px → 세 번째 9px
 *       칸  54px → 세 번째 ★사라짐★ (0px)
 *
 *   배지 한 개 높이(값 1개짜리 지표 하나만 켜고 캔버스 픽셀을 훑은 값)
 *       축글씨  8  9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26
 *       배지   11 13 15 17 17 19 21 21 23 25 27 27 29 31 31 33 35 35 37
 *
 *   값 3개를 다 보려면 필요한 칸 높이 (같은 방법으로 훑은 값)
 *       축글씨 11 → 47px    14 → 61px    16 → 69px    21 → 89px
 *       한 칸당  15.7        20.3         23.0         29.7
 *       축글씨로 나누면  1.42 ~ 1.45
 *
 * 그래서 ★배지 한 개 = 축 글씨 × 1.45★ 로 잡고 여유 2px 을 더합니다.
 * 위 네 경우 모두 3~5px 여유로 안전합니다.
 *
 * ── 칸 높이는 우리가 정합니다 ────────────────────────────────────────
 * chart-indicator-kit.js 의 makePane() 이 아래 칸을 주 칸의 0.32 배로 만듭니다.
 *     아래 칸 높이 = 그림영역 × 0.32 / (1 + 0.32 × M)      M = 아래 칸 개수
 * 그림영역은 칸을 몇 개 만들든 늘 같습니다(칸 사이 구분선 1px 을 되돌려 더한 값).
 *     1440×900 실측 — 칸 0개 962 · 1개 728+233+1 · 6개 327+105×5+104+6 = 962
 *
 * ── 폭으로 재지 않습니다 ─────────────────────────────────────────────
 * 폰 세로(칸 47px)보다 폰 가로(17px) · 좁은 노트북 창(25px) 이 더 나쁩니다.
 * 폭으로 막으면 제일 나쁜 두 경우를 그냥 통과시킵니다. ★칸 높이로 잽니다.★
 *
 * ── 되돌리기 ────────────────────────────────────────────────────────
 * index.html 에서 이 파일 script 한 줄을 지우면 전부 2026-09-04 이전으로
 * 돌아갑니다 — 틀도 창도 이 파일이 없으면 「자리는 늘 있다」로 답합니다.
 * 실행 중에 끄려면 콘솔에서 App.ChartIndicatorRoom.disable().
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorRoom = (function () {
  "use strict";

  /* ⭐ 자리 계산에 쓰는 숫자는 ★이 두 줄이 전부★ 입니다.
     늘리거나 줄이려면 위 실측표를 다시 재고 여기만 고칩니다. */
  var BADGE_K = 1.45; /* 배지 한 개 높이 ÷ 축 글씨 크기 (실측 1.42~1.45) */
  var BADGE_PAD = 2;  /* 여유 2px - 칸 높이가 딱 맞아떨어질 때의 반올림 몫 */

  /* 그림영역이 이보다 작으면 「아직 자리를 못 잰다」로 보고 아무것도 안 막습니다.
     화면이 아직 안 잡힌 순간(첫 그리기 직전)에 회원 지표를 재우지 않으려는 것입니다. */
  var MIN_AREA = 120;

  /* 알림줄 - js/chart-drawings.js 의 placeToast() 규칙을 그대로 옮겼습니다.
     ★새로 재지 않았습니다★: 17px · 차트 칸 안 · 하단 매수·매도 바 안 가림 ·
     글씨는 어떤 경우에도 안 줄이고 줄 수로 풉니다. */
  var TOAST_FONT = 17;
  var TOAST_LINE = 1.45;
  var TOAST_MS = 2600; /* 이유가 두세 줄이라 그림 알림(1600)보다 깁니다 */
  var EDGE = 8;

  var C_CARD = "#101727";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";

  var STYLE_ID = "chart-indicator-room-style";
  var enabled = true;
  var toastEl = null;
  var toastTimer = null;

  function isFn(f) {
    return typeof f === "function";
  }

  /* ---------------------------------------------------------------------
   * 1. 재는 부분 - 화면도 차트도 안 건드립니다(순수 계산)
   * ------------------------------------------------------------------- */

  /** 축 글씨 크기. chart-font.js 가 원본이고, 폰에서는 chart-axis-fit.js 가
   *  이미 그 값을 줄여 둡니다 - 그래서 여기서 폭을 다시 볼 필요가 없습니다.
   *  ★못 읽으면 0 을 돌려줍니다★ - 그럴듯한 값을 지어내지 않습니다.
   *  0 이면 usable() 이 거짓이 되어 ★아무것도 막지 않습니다★. */
  function axisFont() {
    try {
      if (App.ChartFont && isFn(App.ChartFont.getFontSize)) {
        var f = App.ChartFont.getFontSize();
        if (isFinite(f) && f > 0) return f;
      }
    } catch (e) {
      /* 못 읽으면 아래 0 */
    }
    return 0;
  }

  /** 값 count 개를 다 보이려면 아래 칸이 몇 px 이어야 하는가.
   *  값 개수나 글씨 크기를 모르면 0 - 「모르면 안 막는다」 */
  function needFor(count, font) {
    var n = Math.floor(count) > 0 ? Math.floor(count) : 0;
    var f = font > 0 ? font : axisFont();
    if (!n || !f) return 0;
    return Math.ceil(n * f * BADGE_K) + BADGE_PAD;
  }

  /** 아래 칸을 M 개 만들었을 때 한 칸의 높이 */
  function paneHeightFor(m, geo) {
    if (!geo || !(geo.drawArea > 0) || !(geo.ratio > 0)) return 0;
    if (m <= 0) return 0;
    /* 칸을 하나 더 만들면 구분선이 1px 씩 늘어 그림영역이 그만큼 줍니다 */
    return (geo.drawArea - m) * geo.ratio / (1 + geo.ratio * m);
  }

  /** 잴 수 있는 상태인가. ★하나라도 모르면 안 막습니다★ */
  function usable(geo) {
    return !!(enabled && geo && geo.drawArea >= MIN_AREA && geo.ratio > 0 && axisFont() > 0);
  }

  function maxValues(items) {
    var v = 0;
    for (var i = 0; i < items.length; i++) if (items[i].values > v) v = items[i].values;
    return v;
  }

  /**
   * 켜져 있는 아래 칸 지표들을 순서대로 넣어 보고, 자리가 없는 것을 골라냅니다.
   *   items = [{ id, values, name }]   (instOrder 순서 그대로)
   *   geo   = { drawArea, ratio }
   * 앞에 있는 것이 자리를 지킵니다 - 나중에 켠 것이 밀립니다.
   */
  function plan(items, geo) {
    var font = axisFont();
    var out = { show: [], rest: [], font: font };
    items = items || [];
    if (!usable(geo)) {
      for (var k = 0; k < items.length; k++) out.show.push(items[k].id);
      return out;
    }
    var shown = [];
    for (var i = 0; i < items.length; i++) {
      var v = Math.max(maxValues(shown), items[i].values);
      var have = paneHeightFor(shown.length + 1, geo);
      var need = needFor(v, font);
      if (have >= need) {
        shown.push(items[i]);
        out.show.push(items[i].id);
      } else {
        out.rest.push({
          id: items[i].id,
          name: items[i].name,
          values: items[i].values,
          need: need,
          have: Math.round(have)
        });
      }
    }
    return out;
  }

  /**
   * 「지금 켜 둔 것들 + 값 count 개짜리 하나」 가 다 들어가는가.
   *   -> { ok, why, need, have, font, msg }
   * ★켜 둔 것 전부★ 로 봅니다(쉬는 중인 것도 포함). 그래야 새로 켠 것 때문에
   * 다른 것이 조용히 쉬게 되는 일이 없습니다.
   */
  function check(items, count, geo, name) {
    var font = axisFont();
    items = items || [];
    if (!usable(geo)) return { ok: true, why: "", need: 0, have: 0, font: font, msg: "" };
    var v = Math.max(maxValues(items), count);
    var have = paneHeightFor(items.length + 1, geo);
    var need = needFor(v, font);
    var ok = have >= need;
    return {
      ok: ok,
      why: ok ? "" : "noroom",
      need: need,
      have: Math.round(have),
      font: font,
      msg: ok ? "" : reason(name, need, Math.round(have))
    };
  }

  /** 회원에게 보여줄 말. 전문용어를 안 씁니다. */
  function reason(name, need, have) {
    var who = name ? name + " 을(를) " : "이 지표를 ";
    return (
      who + "켤 자리가 없습니다. 아래 칸이 " + have + "px 인데 값을 다 보이려면 " +
      need + "px 이 필요합니다. 다른 지표를 끄거나 창을 키우면 켜집니다."
    );
  }

  /** 쉬는 중인 것들을 한 줄로 알립니다(창이 좁아졌을 때) */
  function restMsg(rest) {
    if (!rest || !rest.length) return "";
    var names = [];
    for (var i = 0; i < rest.length; i++) names.push(rest[i].name || rest[i].id);
    return (
      "차트 칸이 좁아 " + names.join(" · ") + " 을(를) 잠시 쉽니다. " +
      "값이 잘려 보이지 않기 때문입니다. 창을 키우면 저절로 돌아옵니다."
    );
  }

  /* ---------------------------------------------------------------------
   * 2. 알리는 부분 - 알림줄 한 줄
   *    ⚠️ chart-drawings.js 의 알림줄은 그 모듈 안에 갇혀 있어 못 씁니다.
   *       자리잡기 규칙만 그대로 옮겨 왔습니다(새로 재지 않았습니다).
   * ------------------------------------------------------------------- */

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css =
      ".tl-room-toast{position:fixed;left:0;top:0;z-index:10;" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";color:" + C_TEXT + ";" +
      "border-radius:6px;padding:7px 12px;" +
      "font-size:" + TOAST_FONT + "px;line-height:" + TOAST_LINE + ";" +
      /* 한글은 아무 글자에서나 줄이 갈립니다 - 낱말째 넘기고 긴 덩어리만 풉니다 */
      "word-break:keep-all;overflow-wrap:anywhere;" +
      "text-align:center;pointer-events:none;display:none;}";
    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function vpW() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }
  function vpH() {
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function chartWrap() {
    return (
      document.querySelector(".chart-panel .chart-wrap") ||
      document.querySelector(".chart-wrap") ||
      document.querySelector(".chart-container")
    );
  }

  /** 하단 매수·매도 바 위끝 - 폰에서만 있습니다(chart-drawings.js 와 같은 규칙) */
  function floorY() {
    var lim = vpH() - EDGE;
    if (document.fullscreenElement || document.webkitFullscreenElement) return lim;
    var bar = document.querySelector(".tl-order-bar");
    if (!bar || !bar.getBoundingClientRect) return lim;
    var cs = null;
    try {
      cs = window.getComputedStyle(bar);
    } catch (e) {
      cs = null;
    }
    if (cs && cs.display === "none") return lim;
    var r = bar.getBoundingClientRect();
    if (r.height > 0 && r.top - EDGE < lim) lim = r.top - EDGE;
    return lim;
  }

  /** 차트 칸에서 지금 화면에 실제로 보이는 네모. 없으면 null */
  function visibleBox() {
    var w = chartWrap();
    if (!w || !w.getBoundingClientRect) return null;
    var r = w.getBoundingClientRect();
    var box = {
      top: Math.max(r.top, EDGE),
      bottom: Math.min(r.bottom, floorY()),
      left: Math.max(r.left, EDGE),
      right: Math.min(r.right, vpW() - EDGE)
    };
    if (box.bottom - box.top < 44 || box.right - box.left < 80) return null;
    return box;
  }

  function place() {
    if (!toastEl || toastEl.style.display !== "block") return;
    var box = visibleBox();
    if (!box) {
      toastEl.style.visibility = "hidden";
      return;
    }
    toastEl.style.visibility = "visible";
    /* 차트 칸보다 넓어지지 않게 미리 묶습니다. 안 들어가면 ★줄 수로★ 풉니다 -
       글씨는 줄이지 않습니다(17px 그대로). */
    var maxW = box.right - box.left - EDGE * 2;
    toastEl.style.maxWidth = (maxW > 160 ? maxW : 160) + "px";
    /* ★재기 전에 왼쪽 끝으로 되돌립니다★ - 폭을 안 정해 둔 position:fixed 칸의
       폭은 「남은 자리 = 화면폭 - left」 라, 밀어 둔 left 를 그대로 두고 재면
       실제보다 좁게 나오고 그 값으로 다시 밀립니다(placeToast 15차와 같은 병). */
    toastEl.style.left = "0px";
    var w = toastEl.offsetWidth;
    var x = (box.left + box.right) / 2 - w / 2;
    if (x < box.left) x = box.left;
    if (x + w > box.right) x = box.right - w;
    var h = toastEl.offsetHeight;
    var y = box.top + EDGE;
    if (y + h > box.bottom) y = box.bottom - h;
    if (y < EDGE) y = EDGE;
    toastEl.style.left = Math.round(x) + "px";
    toastEl.style.top = Math.round(y) + "px";
  }

  /** 한 줄 알립니다. 차트 칸이 없으면 아무것도 안 합니다(오류도 안 냅니다). */
  function say(msg) {
    if (!enabled || !msg) return false;
    var w = chartWrap();
    if (!w) return false;
    injectStyle();
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "tl-room-toast";
      toastEl.setAttribute("role", "status");
      w.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    place();
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.style.display = "none";
    }, TOAST_MS);
    return true;
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
  }

  return {
    plan: plan,
    check: check,
    needFor: needFor,
    paneHeightFor: paneHeightFor,
    restMsg: restMsg,
    reasonForTest: reason,
    say: say,
    placeForTest: place,
    getToastForTest: function () {
      return toastEl;
    },
    /* 되돌리기 - 콘솔에서 끄면 아무것도 안 막습니다 */
    disable: function () {
      enabled = false;
    },
    enable: function () {
      enabled = true;
    },
    isEnabled: function () {
      return enabled;
    },
    BADGE_K: BADGE_K,
    BADGE_PAD: BADGE_PAD,
    MIN_AREA: MIN_AREA,
    TOAST_FONT: TOAST_FONT
  };
})();
