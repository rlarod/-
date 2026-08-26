/* =========================================================================
 * js/chart-attr-logo.js — App.ChartAttrLogo
 * =========================================================================
 * 차트 왼쪽 아래에 겹쳐 있던 작은 마크를 차트 그림 밖(시간축 띠)으로 옮깁니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 먼저 — 이건 우리 TL 로고가 아닙니다
 * ─────────────────────────────────────────────────────────────────────────
 * 지금까지 "사이트 워터마크"로 알려져 있었지만, 실제로 확인해 보니
 * **차트 라이브러리가 스스로 넣는 트레이딩뷰 표기 링크**였습니다.
 *
 *   요소   <a id="tv-attr-logo" href="https://www.tradingview.com/?utm_medium=lwc-link…"
 *          title="Charting by TradingView">
 *   출처   lightweight-charts 5.2.0 이 직접 만들어 붙입니다.
 *          번들 안에서 이 <a> 와 함께 아래 <style> 을 같이 넣습니다.
 *            a#tv-attr-logo{position:absolute;left:10px;bottom:10px;
 *                           height:19px;width:35px;z-index:3;}
 *   스위치 layout.attributionLogo (기본값 true) — 공개 옵션입니다.
 *
 * 우리 코드(js/chart.js·css·index.html) 어디에도 이 마크를 그리는 곳이 없습니다.
 * grep 으로 확인했습니다.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 그래서 지우지 않았습니다
 * ─────────────────────────────────────────────────────────────────────────
 * 라이브러리는 Apache License 2.0 이고, 이 표기는 트레이딩뷰가 요청하는
 * 출처 표시입니다. 끄는 옵션이 공식으로 열려 있긴 하지만 그건 "우리 브랜드를
 * 어떻게 보일까" 가 아니라 "남의 저작물 표기를 뗄까" 의 문제라, 개발이 임의로
 * 결정할 일이 아닙니다. **켠 채로 두고 자리만 옮겼습니다.**
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 왜 "시간축 띠로 옮기기" 를 골랐나
 * ─────────────────────────────────────────────────────────────────────────
 * 원래 자리(칸 왼쪽 아래 10px)는 차트 그림 안쪽입니다. 실측하면
 *   - 지표를 끈 상태  : 거래량 막대 위에 겹칩니다
 *   - RSI·MACD 를 켠 상태 : <a> 는 칸 묶음 전체의 맨 아래에 붙으므로
 *                          제일 아래 칸(MACD) 선 위에 겹칩니다
 * 즉 "어느 칸에만 남긴다" 로는 해결이 안 됩니다. 어느 칸이든 그 칸의 데이터를
 * 가립니다.
 *
 * 다른 후보와 비교
 *   투명도만 낮춘다   → 겹침 자체는 그대로입니다. 거래량 막대·MACD 막대가
 *                      마크와 섞여 값을 잘못 읽게 만들 수 있어 택하지 않았습니다.
 *   캔들 칸에만 남긴다 → 거래량 막대 겹침이 남습니다.
 *   지표 켤 때만 비킨다 → 지표를 끈 기본 상태에서 겹침이 그대로 남습니다.
 *   시간축 띠로 옮긴다 → 캔들·거래량·이동평균·볼린저·RSI·MACD·포지션 선 어느
 *                      것과도 겹치지 않습니다. 이걸 골랐습니다.
 *
 * 띠 안에서 "왼쪽 끝" 이 아니라 "가격축 아래 빈 칸" 에 둡니다
 *   처음에는 띠의 왼쪽 끝(left:8px)에 뒀는데, 여섯 폭을 재 보니 375 에서 17px,
 *   390 에서 14px 만큼 **맨 왼쪽 눈금 글자와 겹쳤습니다.** 눈금 글자 시작 위치가
 *   폭마다 다르기 때문입니다(360:43px 375:26px 390:29px 768:55px 1920:63px).
 *   그래서 시간축 띠의 마지막 칸 — 가격축 바로 아래 칸 — 으로 옮겼습니다.
 *   이 칸은 라이브러리가 배경만 칠하고 글자·선을 하나도 그리지 않습니다
 *   (캔버스 잉크 픽셀 0 으로 확인). 폭도 360 에서 75px 라 35px 마크가 들어갑니다.
 *   혹시 이 칸이 마크보다 좁은 경우에는 욕심내지 않고 원래대로 왼쪽에 둡니다.
 *
 * 자리는 자바스크립트가 재서 CSS 변수 두 개로 넘깁니다.
 *   --tl-attr-logo-bottom  띠 높이가 글씨 크기에 따라 다르므로(360:29px 1920:47px)
 *                          띠의 세로 가운데에 오도록
 *   --tl-attr-logo-left    가격축 아래 빈 칸의 가로 가운데에 오도록
 * 값은 창 크기가 바뀔 때만 다시 잽니다(시세 틱과 무관).
 *
 * 투명도는 0.6 입니다. 이제 아무것과도 겹치지 않지만, 표기는 데이터가 아니라
 * 곁다리이므로 눈금 글자와 비슷한 무게로 낮춰 시선을 뺏지 않게 했습니다.
 *
 * js/chart.js 는 한 글자도 건드리지 않습니다. 라이브러리가 넣는 <style> 보다
 * 뒤에 이겨야 해서 !important 를 씁니다(라이브러리 <style> 은 body 안에 늦게
 * 들어오므로 순서만으로는 못 이깁니다).
 * css/style.css 도 건드리지 않았습니다 — 규칙은 이 파일이 넣습니다.
 *
 * 되돌리기
 *   index.html 에서 이 파일 script 한 줄을 지우면 원래 자리(왼쪽 아래 10px)로
 *   돌아갑니다. 실행 중이라면 콘솔에서 App.ChartAttrLogo.disable().
 * ========================================================================= */

window.App = window.App || {};

App.ChartAttrLogo = (function () {
  "use strict";

  var STYLE_ID = "tl-attr-logo-style";
  var VAR_BOTTOM = "--tl-attr-logo-bottom";
  var VAR_LEFT = "--tl-attr-logo-left";
  var LOGO_WIDTH = 35; /* 라이브러리가 정한 <a> 크기 */
  var LOGO_HEIGHT = 19;
  var OPACITY = 0.6;
  var FALLBACK_BOTTOM = -24; /* 시간축 높이를 못 쟀을 때(폰 기준값) */
  var FALLBACK_LEFT = 8;

  var enabled = true;
  var styleEl = null;
  var timer = null;
  var lastBottom = null;
  var lastLeft = null;

  function css() {
    return (
      "a#tv-attr-logo{" +
      "bottom:var(" + VAR_BOTTOM + "," + FALLBACK_BOTTOM + "px) !important;" +
      "left:var(" + VAR_LEFT + "," + FALLBACK_LEFT + "px) !important;" +
      "opacity:" + OPACITY + " !important;" +
      "}"
    );
  }

  function ensureStyle() {
    if (styleEl && styleEl.parentNode) return;
    styleEl = document.getElementById(STYLE_ID);
    if (!styleEl) {
      styleEl = document.createElement("style");
      styleEl.id = STYLE_ID;
      styleEl.textContent = css();
    }
    if (document.head) document.head.appendChild(styleEl);
  }

  /* 시간축 띠(차트 표의 마지막 행) 높이를 재서, 마크가 그 띠의 세로 가운데에
     오도록 bottom 값을 구합니다. <a> 는 캔들 칸 묶음(td) 기준으로 놓이므로
     띠 안으로 내리려면 음수여야 합니다. */
  function measurePlacement() {
    var logo = document.getElementById("tv-attr-logo");
    if (!logo) return null;
    var host = logo.parentElement; /* 캔들 칸 묶음 td — <a> 의 기준 상자 */
    if (!host) return null;
    var root = host.closest ? host.closest(".tv-lightweight-charts") : null;
    if (!root) return null;
    var rows = root.querySelectorAll("table tr");
    if (!rows.length) return null;
    var axisRow = rows[rows.length - 1];
    var h = axisRow.getBoundingClientRect().height;
    if (!h || h < LOGO_HEIGHT) return null;
    /* 띠 위쪽 여백 = (h - 19) / 2  →  bottom = -(여백 + 19) */
    var bottom = -Math.round((h - LOGO_HEIGHT) / 2 + LOGO_HEIGHT);

    /* 가로 자리 — 시간축 띠의 "가격축 아래 빈 칸" 가운데.
       이 칸은 라이브러리가 배경만 칠하고 아무것도 안 그립니다(잉크 0px 로 확인).
       띠 왼쪽에 두면 맨 왼쪽 눈금 글자와 겹칩니다 — 375/390 에서 실제로 겹쳤습니다. */
    var cells = axisRow.querySelectorAll("td");
    var corner = cells.length ? cells[cells.length - 1] : null;
    var hostW = host.getBoundingClientRect().width;
    var left = FALLBACK_LEFT;
    if (corner) {
      var cw = corner.getBoundingClientRect().width;
      /* 빈 칸이 마크보다 좁으면 욕심내지 않고 원래 왼쪽에 둡니다. */
      if (cw >= LOGO_WIDTH + 6) {
        left = Math.round(hostW + (cw - LOGO_WIDTH) / 2);
      }
    }
    return { bottom: bottom, left: left };
  }

  /* 옛 이름 유지 */
  function measureBottom() {
    var p = measurePlacement();
    return p ? p.bottom : null;
  }

  function apply() {
    if (!enabled) return false;
    ensureStyle();
    var p = measurePlacement();
    if (!p) return false;
    if (p.bottom === lastBottom && p.left === lastLeft) return true;
    lastBottom = p.bottom;
    lastLeft = p.left;
    try {
      document.documentElement.style.setProperty(VAR_BOTTOM, p.bottom + "px");
      document.documentElement.style.setProperty(VAR_LEFT, p.left + "px");
    } catch (e) {
      return false;
    }
    return true;
  }

  /* 차트가 늦게 만들어지고, 지표 칸을 켜면 표 구조가 바뀌므로 잠깐 되풀이해
     확인합니다. 값이 그대로면 아무것도 하지 않습니다. */
  var ticks = 0;
  function pump() {
    apply();
    ticks++;
    if (ticks > 40 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (timer) return;
    ticks = 0;
    timer = setInterval(pump, 250);
    pump();
  }

  function refresh() {
    lastBottom = null;
    lastLeft = null;
    ticks = 0;
    start();
    setTimeout(apply, 300);
  }

  function disable() {
    enabled = false;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    styleEl = null;
    lastBottom = null;
    lastLeft = null;
    try {
      document.documentElement.style.removeProperty(VAR_BOTTOM);
      document.documentElement.style.removeProperty(VAR_LEFT);
    } catch (e) {}
  }

  function enable() {
    enabled = true;
    lastBottom = null;
    lastLeft = null;
    start();
  }

  if (typeof window !== "undefined" && window.addEventListener) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
    window.addEventListener("resize", refresh);
    window.addEventListener("orientationchange", refresh);
  }

  return {
    apply: apply,
    refresh: refresh,
    enable: enable,
    disable: disable,
    isEnabled: function () {
      return enabled;
    },
    getBottom: function () {
      return lastBottom;
    },
    getLeft: function () {
      return lastLeft;
    },
    measureBottom: measureBottom,
    measurePlacement: measurePlacement,
    getSettings: function () {
      return { opacity: OPACITY, logoWidth: LOGO_WIDTH, logoHeight: LOGO_HEIGHT };
    },
  };
})();
