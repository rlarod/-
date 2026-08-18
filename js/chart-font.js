/* =========================================================================
 * js/chart-font.js — App.ChartFont
 * =========================================================================
 * 차트 축 글씨(가격 눈금 / 시간 눈금)를 키웁니다.
 *
 * 왜 이렇게 하나
 *   차트는 Lightweight Charts 가 캔버스에 직접 그립니다. 캔버스 안의 글자는
 *   CSS 로 못 키웁니다. 라이브러리의 layout.fontSize 옵션으로만 바뀝니다.
 *   그런데 js/chart.js 는 수정 금지 파일이고, 차트 객체를 밖으로 내주지도
 *   않습니다(return 은 init 뿐).
 *
 *   그래서 chart.js 가 부르는 LightweightCharts.createChart 를 감싸서
 *   옵션에 fontSize 를 끼워 넣고, 만들어진 차트 객체도 붙잡아 둡니다.
 *   chart.js 는 한 줄도 건드리지 않습니다.
 *
 *   이 파일은 반드시 라이브러리 다음, js/chart.js 앞에 실려야 합니다.
 *
 * 크기를 바꾸려면 아래 FONT_SIZE 만 고치면 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartFont = (function () {
  "use strict";

  /* 라이브러리 기본값은 12px 입니다.
     주변 UI 실측(2026-08-18)에 맞춰 정했습니다.
       호가창 숫자 18.5px / 주문창 평가·보유·가능 18.5px
       채팅 본문 20.5px / 레버리지 배지 21px
       차트 시간 버튼(1분/5분...) 20.5px
     처음엔 호가창(18.5px)에 맞춰 19px 로 뒀는데 화면에서 여전히 작아 보여,
     차트 영역 안의 이웃인 시간 버튼·채팅(20.5px)과 같은 눈높이로 올렸습니다.
     캔버스 글자가 DOM 글자보다 조금 작아 보이는 점도 감안했습니다. */
  var FONT_SIZE = 21;

  /* 글꼴도 사이트와 맞춥니다.
     js/chart.js 는 'JetBrains Mono' 를 지정하는데, 사이트는 예전에
     본문 글꼴로 통일했습니다(style.css 의 --sans / --mono 가 같은 값).
     그래서 차트 축 숫자만 다른 글꼴로 나와 따로 놀았습니다.
     CSS 변수에서 직접 읽어오므로, 나중에 사이트 글꼴을 바꾸면 차트도
     자동으로 따라옵니다(코드에 글꼴 이름을 박아두지 않습니다). */
  function siteFontFamily() {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue("--sans");
      v = (v || "").trim();
      if (v) return v;
    } catch (e) {
      /* 아래 기본값으로 */
    }
    return null;
  }

  /* ---- 굵게 ----
     라이브러리에 글씨 굵기 옵션이 없습니다. 축 글꼴 문자열을
     `${크기}px ${글꼴}` 로만 조립해서 굵기를 끼워 넣을 자리도 없습니다
     (크기 자리에 "bold 21" 을 넣어봤더니 차트가 통째로 안 그려졌습니다).

     그래서 "굵은 글꼴을 새 이름으로 등록"하는 방식을 씁니다.
     TL_CHART_BOLD 라는 이름에 사이트 글꼴의 굵은 자족을 연결해두고,
     차트에는 그 이름을 첫 번째 글꼴로 지정합니다.
     못 불러오면 그냥 다음 글꼴(보통 굵기)로 넘어가므로 지금과 같아집니다. */
  var BOLD_ALIAS = "TLChartBold";
  var STYLE_ID = "tl-chart-bold-font";

  /* --sans 의 첫 글꼴 이름만 뽑습니다(따옴표 제거). 이름을 코드에 박지 않습니다. */
  function primaryFamilyName() {
    var ff = siteFontFamily();
    if (!ff) return null;
    var first = String(ff).split(",")[0].trim().replace(/^['"]|['"]$/g, "");
    return first || null;
  }

  function installBoldAlias() {
    if (typeof document === "undefined" || !document.head) return;
    if (document.getElementById(STYLE_ID)) return;
    var name = primaryFamilyName();
    if (!name) return;

    /* 1차 — 사용자 기기에 이미 깔린 굵은 자족을 씁니다(네트워크 불필요). */
    var locals = [name + " Bold", name.replace(/\s+/g, "") + "-Bold", name + " SemiBold", name + " Black"];
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "@font-face{font-family:'" + BOLD_ALIAS + "';font-style:normal;font-weight:400;font-display:swap;src:" +
      locals.map(function (n) { return "local('" + n + "')"; }).join(",") + ";}";
    document.head.appendChild(style);

    /* 2차 — 웹폰트로 받아온 글꼴이면 같은 출처에서 700 굵기만 따로 받아
       BOLD_ALIAS 이름으로 다시 선언합니다. 실패하면 1차 결과로 남습니다. */
    try {
      if (typeof fetch !== "function") return;
      var url =
        "https://fonts.googleapis.com/css2?family=" +
        encodeURIComponent(name).replace(/%20/g, "+") +
        ":wght@700&display=swap";
      fetch(url)
        .then(function (r) { return r.ok ? r.text() : null; })
        .then(function (css) {
          if (!css) return;
          var renamed = css
            .replace(/font-family:\s*(['"])[^'"]+\1/g, "font-family:'" + BOLD_ALIAS + "'")
            .replace(/font-weight:\s*700/g, "font-weight:400");
          var s2 = document.createElement("style");
          s2.setAttribute("data-tl-chart-bold", "web");
          s2.textContent = renamed;
          document.head.appendChild(s2);
        })
        .catch(function () {
          /* 네트워크 실패 — 1차(local) 결과를 그대로 씁니다 */
        });
    } catch (e) {
      /* 무시 */
    }
  }

  /* 차트에 넣을 글꼴 = 굵은 별칭 + 사이트 글꼴(대체용) */
  function chartFontFamily() {
    var ff = siteFontFamily();
    if (!ff) return null;
    return "'" + BOLD_ALIAS + "'," + ff;
  }

  var charts = [];

  function patch() {
    if (typeof window.LightweightCharts === "undefined") return false;
    var LC = window.LightweightCharts;
    if (LC.__fontPatched) return true;
    if (typeof LC.createChart !== "function") return false;

    var origCreate = LC.createChart;

    function wrappedCreate(container, options) {
      var opts = options || {};
      opts.layout = opts.layout || {};
      /* chart.js 가 fontSize 를 직접 정하고 있으면 그 값을 존중합니다. */
      if (opts.layout.fontSize === undefined) opts.layout.fontSize = FONT_SIZE;
      /* 글꼴은 chart.js 가 지정해도 사이트 글꼴로 덮습니다(통일이 목적). */
      installBoldAlias();
      var ff = chartFontFamily();
      if (ff) opts.layout.fontFamily = ff;
      var chart = origCreate.call(LC, container, opts);
      try {
        charts.push(chart);
      } catch (e) {
        /* 무시 — 글씨 크기는 이미 적용됐습니다 */
      }
      return chart;
    }

    /* 라이브러리 객체는 동결(Object.freeze)돼 있어 createChart 를 덮어쓸 수
       없습니다(실측: writable=false, configurable=false, isFrozen=true).
       그냥 대입하면 strict mode 에서 예외가 나 모듈 전체가 죽습니다.
       대신 원본을 프로토타입으로 삼는 새 객체를 만들어 전역만 바꿔칩니다.
       CandlestickSeries·CrosshairMode 등 나머지는 프로토타입으로 그대로
       읽히고, createChart 만 우리 것이 가려 줍니다.
       (전역 window.LightweightCharts 는 writable=true 라 교체 가능합니다) */
    try {
      var proxy = Object.create(LC);
      Object.defineProperty(proxy, "createChart", {
        value: wrappedCreate,
        writable: true,
        configurable: true,
        enumerable: true,
      });
      Object.defineProperty(proxy, "__fontPatched", {
        value: true,
        writable: true,
        configurable: true,
        enumerable: false,
      });
      window.LightweightCharts = proxy;
    } catch (e) {
      console.warn("[chart-font.js] 라이브러리를 감싸지 못했습니다 — 글씨 크기는 기본값입니다.", e);
      return false;
    }

    return true;
  }

  /* 이미 만들어진 차트에도 적용하고 싶을 때 씁니다(크기 조절 실험용). */
  function setFontSize(px) {
    var n = Number(px);
    if (!isFinite(n) || n <= 0) return;
    FONT_SIZE = n;
    charts.forEach(function (c) {
      try {
        c.applyOptions({ layout: { fontSize: n } });
      } catch (e) {
        console.warn("[chart-font.js] 글씨 크기 적용 실패:", e);
      }
    });
  }

  /* 라이브러리가 아직 안 실렸을 수도 있어(CDN 지연 등) 잠깐 다시 시도합니다.
     chart.js 도 라이브러리가 없으면 차트를 안 만드므로, 늦게 붙어도
     그 전에 패치가 끝납니다. */
  if (!patch()) {
    var tries = 0;
    var timer = setInterval(function () {
      if (patch() || ++tries > 200) clearInterval(timer);
    }, 50);
  }

  return {
    setFontSize: setFontSize,
    getFontFamily: chartFontFamily,
    getSiteFontFamily: siteFontFamily,
    getFontSize: function () {
      return FONT_SIZE;
    },
    getCharts: function () {
      return charts.slice();
    },
  };
})();
