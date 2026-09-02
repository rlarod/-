/* =========================================================================
 * js/chart-indicator-kit.js - App.ChartIndicatorKit   (지표 틀)
 * =========================================================================
 * 지표를 "정의 1개 + 인스턴스 N개" 로 얹는 틀입니다.
 *
 * -- 왜 이 모양인가 (2026-09-02 트레이딩뷰 실측) -----------------------
 * 트레이딩뷰 범례를 세었더니 이랬습니다.
 *     "MA 7 close 0"  "MA 25 close 0"  "MA 99 close 0"  "Volume"
 * MA7 · MA25 · MA99 는 서로 다른 지표가 아닙니다. "MA" 라는 정의 하나를
 * 기간만 달리해 세 번 얹은 것입니다. 각 줄마다 따로 숨기고 · 설정하고 ·
 * 지울 수 있고, 더보기 메뉴에 Move to(어느 칸으로) 까지 있습니다.
 *
 * 그래서 이 틀은 둘로 나눕니다.
 *     define(정의)        계산식. 프로그래머가 한 번 적습니다
 *     addInstance(정의id) 그 정의를 실제로 화면에 얹은 것 하나.
 *                         기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다
 *
 * -- 왜 틀이 먼저인가 (2026-09-02 실측) -------------------------------
 *   지표 하나 늘리는 데 손대야 할 곳   17군데
 *     js/chart-indicators.js 안에만 14군데("ma7" 이 글자로 박힌 줄)
 *   지표 하나 껐다 켜는 시간           MA7 6.51ms / MACD 3.36ms (봉 1006개)
 * 6.51ms 인 이유는 redrawAll() 이 "켠 지표 하나" 가 아니라 "켜진 것 전부" 를
 * 다시 계산하기 때문입니다. 트레이딩뷰만큼(내장 127개) 채우면 같은 방식으로
 * 한 번 누를 때마다 수백 ms - 화면 한 장이 16.7ms 이니 못 씁니다.
 * 이 틀은 "켠 인스턴스 하나만" 다시 계산합니다.
 *
 * -- 기존 7개는 한 글자도 안 건드렸습니다 -----------------------------
 * js/chart-indicators.js (MA7 · MA25 · MA99 · 볼린저 · 거래량)
 * js/chart-oscillators.js (RSI · MACD)
 * js/chart-indicator-menu.js (fx 목록)
 * 셋 다 그대로입니다. 이 파일을 지우면 어제 화면 그대로 돌아갑니다.
 *
 * -- js/chart.js 도 한 글자도 안 건드렸습니다 -------------------------
 * js/chart-font.js 가 LightweightCharts.createChart 를 감싸 두었기 때문에
 * App.ChartFont.getCharts() 로 차트 객체를 받습니다. 캔들 · 거래량 시리즈는
 * 공개 API 인 chart.panes()[n].getSeries() 로 찾습니다.
 * 1~4단계와 같은 방식입니다.
 *
 * -- 틀이 강제하는 것 (조용히 넘어가지 않고 등록을 거부합니다) --------
 *   1) step 이 없으면 거부
 *      step 은 "마지막 봉 하나만 O(1) 로 갱신" 하는 함수입니다. 이게 없으면
 *      틱마다 전체를 다시 계산하는 지표가 되어 화면이 버벅입니다.
 *      나중에 누가 그런 지표를 몰래 끼워 넣지 못하게 틀에서 막습니다.
 *   2) seed 가 없으면 거부 (켤 때 한 번 전체 계산)
 *   3) 지표선 색 목록 밖의 색이면 거부 (아래 LINE_COLORS)
 *   4) id 가 겹치면 거부
 *
 * -- 계산이 한 곳에만 있게 --------------------------------------------
 * 봉 데이터(시각 · 시가 · 고가 · 저가 · 종가 · 거래량)는 이 파일 안에 딱
 * 한 벌만 있습니다(BarStore). 인스턴스는 그걸 읽기만 합니다. 인스턴스를
 * 100개 얹어도 배열은 한 벌이고 감시 타이머도 하나입니다.
 * 값 자체(청산가 · 손익)는 지금처럼 App.Trading 에서만 읽습니다. 이 틀은
 * 시세만 씁니다.
 *
 * -- 꺼져 있으면 계산도 하지 않습니다 ---------------------------------
 * 켜진 인스턴스가 하나도 없으면 onTick() 첫 줄에서 바로 돌아갑니다.
 * 봉 배열도 만들지 않고 감시 타이머도 안 돕니다. 기본은 전부 꺼짐입니다.
 *
 * -- fx 목록에 어떻게 끼어드나 ----------------------------------------
 * js/chart-indicator-menu.js 를 고치지 않고 두 가지만 합니다.
 *   1) App.ChartIndicators.isOn / .toggle 을 감쌉니다(함수 감싸기 패턴).
 *      목록이 mod(who).isOn(key) 로 물어보는데, 우리 인스턴스 id 면 우리가
 *      답하고 아니면 원래 함수에 그대로 넘깁니다.
 *      - 그래서 점 색 · 스위치 · 눌림 표시가 저쪽 코드로 그대로 그려집니다.
 *        우리가 CSS 를 다시 적지 않습니다(같은 값이 두 곳에 생기지 않게).
 *   2) 목록 창이 열리면 MutationObserver 로 우리 줄을 이어 붙입니다.
 * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 세기 때문에 우리
 * 것을 못 셉니다. 그대로 두면 화면이 사실과 달라지므로(EMA 를 켰는데
 * "켜진 지표 0개"), 우리가 화면에 있는 줄을 다시 세어 고쳐 적습니다.
 *
 * -- 2026-09-02 (6단계) 에 늘어난 것 ----------------------------------
 * 설정 창(js/chart-indicator-settings.js)이 쓸 것만 틀에 더했습니다.
 *   값 종류(Source)   SOURCES 한 곳. 종가 · 시가 · 고가 · 저가 · HL2 · HLC3 · OHLC4
 *                     정의는 bs.src / bar.src 를 읽습니다(종가면 배열을 새로 안 만듭니다)
 *   앞뒤로 밀기(Offset)  봉 개수만큼 좌우로. 봉 끝을 넘으면 마지막 간격으로 늘려 잡습니다
 *   updateInstance()  인스턴스 ★하나만★ 다시 계산. 값 다듬기(범위 · 색 · 굵기)는 여기만
 *   createInstance()  "지표 추가" - 만들고 저장하고 화면까지
 *   resetInstance()   트레이딩뷰 Defaults 자리
 *   inputsOf()        설정 창이 무엇을 그릴지. 정의가 들고 있습니다
 * 설정 창 쪽 파일에는 기간 · 색 · 범위 같은 값이 하나도 없습니다(두 벌 금지).
 * 저장 키는 그대로 btc_sim_v2_chart-indicator-kit 이고 형식도 v1 그대로라
 * 이미 저장된 인스턴스는 그대로 열립니다.
 *
 * -- 되돌리기 ---------------------------------------------------------
 *   1) index.html 의 <script src="js/chart-indicator-kit.js"></script> 한 줄 삭제
 *   2) js/chart-indicator-kit.js 파일 삭제
 *   3) (테스트가 생겼다면) package.json 과 tests/_order.txt 의 해당 토막 삭제
 * 이 파일은 다른 파일을 하나도 고치지 않습니다. 지우면 원래 화면 그대로입니다.
 * (회원 브라우저에 남는 기록은 btc_sim_v2_chart-indicator-kit 키라
 *  그냥 남아 있어도 아무 동작도 하지 않습니다.)
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorKit = (function () {
  "use strict";

  /* =====================================================================
   * 지표선 색 목록 - 여기 한 곳에만 적습니다. 두 벌 금지.
   *
   * 확정 팔레트 9색은 그대로입니다. 이건 "지표선 전용 색 목록" 하나를
   * 새로 만든 것이고, 2026-09-02 대표 승인 사항입니다.
   *
   * 고른 방법 - 눈대중이 아니라 계산해서 골랐습니다.
   *   조건 1  배경 #0A0F1C 과의 명암비 4.5 이상        (실측 최소 4.52)
   *   조건 2  색끼리 CIE Lab 거리 22 이상              (실측 최소 29.6)
   *   조건 3  상승 #26C281 · 하락 #F0506E 와 45 이상   (실측 최소 46.4)
   *   조건 4  초록 구간(색상 100~185도)과 빨강 구간(330~18도)은 아예 제외
   *           - 거리 숫자만 보면 순수 초록 · 빨강도 통과합니다. 그런데 그건
   *             회원이 손익 색으로 읽습니다. 그래서 색상환에서 막았습니다.
   *   조건 5  앞의 셋은 지금 쓰는 값 그대로 - 대표가 매일 보시던
   *           MA7 · MA25 · MA99 색이 갑자기 바뀌면 안 됩니다.
   *
   * 2026-08-31 에 시세선과 MA7 이 둘 다 금색이라 회원 화면의 62.7% 에서
   * 한 줄로 보였던 일이 있습니다. 그래서 색만이 아니라 선 모양(solid /
   * dashed / dotted)도 같이 골라 쓸 수 있게 했습니다.
   * ===================================================================== */
  var LINE_COLORS = [
    { key: "gold", hex: "#F0B429", name: "금색" },   /* 지금 MA(7) 색 */
    { key: "white", hex: "#E7ECF5", name: "흰색" },  /* 지금 MA(25) 색 */
    { key: "gray", hex: "#838DA4", name: "회색" },   /* 지금 MA(99) 색 */
    { key: "orange", hex: "#FF8F3C", name: "주황" },
    { key: "brown", hex: "#B99264", name: "갈색" },
    { key: "cream", hex: "#E1ED97", name: "연노랑" },
    { key: "sky", hex: "#49C9E9", name: "하늘" },
    { key: "blue", hex: "#499EE9", name: "파랑" },
    { key: "navy", hex: "#4974E9", name: "남색" },
    { key: "purple", hex: "#BA6EED", name: "보라" },
    { key: "magenta", hex: "#E637E6", name: "자홍" },
    { key: "pink", hex: "#F292DE", name: "분홍" }
  ];

  /* 눈금 · 안내선용. 값이 아니라 배경이라 팔레트 테두리색을 씁니다. */
  var GUIDE_COLOR = "#1D273B";

  function colorHexes() {
    return LINE_COLORS.map(function (c) {
      return c.hex;
    });
  }

  var ALLOWED_STYLES = ["solid", "dashed", "dotted"];
  var ALLOWED_KINDS = ["line", "hist"];
  var ALLOWED_PANES = ["main", "sub"];

  var ALLOWED_WIDTHS = [1, 2, 3, 4];   /* 트레이딩뷰 Thickness 도 네 칸입니다 */
  var MAX_OFFSET = 500;                /* 앞뒤로 밀기 한계 */

  /* ---------------------------------------------------------------------
   * 값 종류(Source) - 트레이딩뷰 Inputs 의 Source 와 같은 목록입니다.
   * 실측(2026-09-02 · 트레이딩뷰 EMA 설정 창) - Close / Open / High / Low /
   * HL2 / HLC3 / OHLC4. 이름도 계산도 여기 한 곳에만 적습니다.
   * ------------------------------------------------------------------- */
  var SOURCES = [
    { key: "close", name: "종가", pick: function (b, i) { return b.close[i]; } },
    { key: "open", name: "시가", pick: function (b, i) { return b.open[i]; } },
    { key: "high", name: "고가", pick: function (b, i) { return b.high[i]; } },
    { key: "low", name: "저가", pick: function (b, i) { return b.low[i]; } },
    { key: "hl2", name: "(고+저)/2", pick: function (b, i) { return (b.high[i] + b.low[i]) / 2; } },
    { key: "hlc3", name: "(고+저+종)/3", pick: function (b, i) { return (b.high[i] + b.low[i] + b.close[i]) / 3; } },
    { key: "ohlc4", name: "(시+고+저+종)/4", pick: function (b, i) { return (b.open[i] + b.high[i] + b.low[i] + b.close[i]) / 4; } }
  ];

  function sourceOf(key) {
    for (var si = 0; si < SOURCES.length; si++) if (SOURCES[si].key === key) return SOURCES[si];
    return SOURCES[0];
  }

  function hasSource(key) {
    for (var si = 0; si < SOURCES.length; si++) if (SOURCES[si].key === key) return true;
    return false;
  }

  var DEFAULT_WIDTH = 1;   /* 바이낸스 · 트레이딩뷰 기본 굵기와 같은 1px */
  var PANE_RATIO = 0.32;   /* 아래 별도 칸 높이 비율 - 3단계와 같은 값 */

  /* ---------------------------------------------------------------------
   * 이미 남이 쓰고 있는 이름 - 여기 한 곳에만 적습니다.
   *
   * 2026-09-02 조사팀 지적. 아래 일곱은 js/chart-indicators.js 와
   * js/chart-oscillators.js 가 쓰는 이름입니다. 우리 인스턴스가 같은 이름을
   * 가지면, fx 목록에 끼어들려고 감싸 둔 isOn/toggle 다리가
   *     insts[key] 가 있다  ->  우리가 답한다
   * 로 갈라지기 때문에 ★MA(7) 스위치가 EMA 를 켜는★ 일이 납니다.
   * 화면은 멀쩡하고 오류도 안 나는 조용한 고장입니다.
   *
   * 지금 자동으로 붙이는 이름은 ema-1 · ema-2 라 부딪히지 않습니다. 그래도
   * 막는 이유는 두 가지입니다.
   *   1) 저장소는 ★회원 브라우저★ 에 있습니다. 손으로 고칠 수 있습니다
   *   2) 나중에 이름을 정하게 하는 화면이 생기면 그때 바로 열립니다
   * ------------------------------------------------------------------- */
  var RESERVED_IDS = ["ma7", "ma25", "ma99", "bb", "vol", "rsi", "macd"];

  function isReservedId(id) {
    return RESERVED_IDS.indexOf(id) >= 0;
  }

  var STORAGE_KEY = "chart-indicator-kit";
  var STORE_VERSION = 1;

  /* =====================================================================
   * 1. 정의 등록소 - 계산식은 여기에 한 번만
   * ===================================================================== */
  var defs = {};
  var defOrder = [];

  function isFn(v) {
    return typeof v === "function";
  }

  function copy(o) {
    var out = {};
    for (var k in o) out[k] = o[k];
    return out;
  }

  /**
   * 지표 정의 하나를 등록합니다. (계산식. 화면에 얹는 것은 addInstance)
   *
   *   id       "ema" 처럼 겹치지 않는 이름
   *   name     "EMA"            인스턴스 이름은 nameOf() 가 만듭니다
   *   note     "지수이동평균"    한 줄 설명
   *   pane     "main" | "sub"    기본으로 어디에 그릴지 (인스턴스가 덮어씀)
   *   params   { p: 9 }          설정값 기본치
   *   outputs  [{ key, kind:"line"|"hist", color, style }]
   *   nameOf(params) -> "EMA(9)"        (없으면 name 그대로)
   *   seed(bars, params, capture) -> { <outKey>: [{time,value}] }
   *            켤 때 한 번. 전체를 계산합니다.
   *            capture.state 에 "마지막으로 닫힌 봉까지의 상태" 를 넣어 줍니다.
   *   step(state, bar, params) -> { values: {<outKey>:숫자}, state: 다음상태 }
   *            틱마다. 마지막 봉 하나만. 반드시 O(1) 이어야 합니다.
   *
   * 등록되면 true, 거부되면 false (이유는 콘솔에 적습니다)
   */
  function define(def) {
    function no(why) {
      console.warn("[chart-indicator-kit] 정의 등록을 거부했습니다 - " + why, def);
      return false;
    }

    if (!def || typeof def !== "object") return no("정의가 객체가 아닙니다");
    if (!def.id || typeof def.id !== "string") return no("id 가 없습니다");
    if (defs[def.id]) return no("id 가 이미 있습니다: " + def.id);
    if (!def.name || typeof def.name !== "string") return no("name 이 없습니다: " + def.id);
    if (ALLOWED_PANES.indexOf(def.pane) < 0) return no("pane 은 main 또는 sub 여야 합니다: " + def.id);

    /* seed 와 step 은 둘 다 필수입니다.
       step 이 없으면 틱마다 전체를 다시 계산하게 되어 화면이 버벅입니다. */
    if (!isFn(def.seed)) return no("seed 가 없습니다(켤 때 전체 계산): " + def.id);
    if (!isFn(def.step)) return no("step 이 없습니다(틱마다 마지막 봉만 O(1) 갱신): " + def.id);

    if (!def.outputs || !def.outputs.length) return no("outputs 가 비었습니다: " + def.id);

    var hexes = colorHexes();
    for (var i = 0; i < def.outputs.length; i++) {
      var o = def.outputs[i];
      if (!o || !o.key) return no("outputs[" + i + "].key 가 없습니다: " + def.id);
      if (ALLOWED_KINDS.indexOf(o.kind || "line") < 0) return no("kind 는 line 또는 hist: " + def.id);
      if (hexes.indexOf(o.color) < 0) {
        return no(
          "지표선 색 목록에 없는 색입니다(" + o.color + "). 색을 늘리려면 LINE_COLORS 에 " +
          "추가하고 배경 대비 · 색끼리 거리를 다시 재야 합니다: " + def.id
        );
      }
      if (o.style && ALLOWED_STYLES.indexOf(o.style) < 0) return no("style 은 solid/dashed/dotted: " + def.id);
    }

    /* 설정 창이 무엇을 보여줄지도 정의가 들고 있습니다. 화면 쪽 파일에
       "EMA 는 기간" 을 또 적으면 같은 값이 두 벌이 됩니다. */
    var params0 = copy(def.params || {});
    var inputs = [];
    var bad = null;
    (def.inputs || []).forEach(function (sp) {
      if (!sp || !sp.key) { bad = "inputs 에 key 가 없습니다"; return; }
      if (!(sp.key in params0)) { bad = "inputs 의 key 가 params 에 없습니다: " + sp.key; return; }
      inputs.push({
        key: sp.key,
        label: sp.label || sp.key,
        type: "int",
        min: typeof sp.min === "number" ? sp.min : 1,
        max: typeof sp.max === "number" ? sp.max : 5000
      });
    });
    if (bad) return no(bad + " : " + def.id);

    if (def.useSource) {
      params0.src = hasSource(def.srcDefault) ? def.srcDefault : "close";
      inputs.push({ key: "src", label: "값 종류", type: "select" });
    }
    if (def.useOffset) {
      params0.off = 0;
      inputs.push({ key: "off", label: "앞뒤로 밀기", type: "int", min: -MAX_OFFSET, max: MAX_OFFSET });
    }

    defs[def.id] = {
      id: def.id,
      name: def.name,
      note: def.note || "",
      pane: def.pane,
      params: params0,
      inputs: inputs,
      outputs: def.outputs,
      nameOf: isFn(def.nameOf) ? def.nameOf : null,
      seed: def.seed,
      step: def.step
    };
    defOrder.push(def.id);
    return true;
  }

  /** 정의가 들고 있는 설정 항목 목록. 설정 창은 이것만 보고 그립니다. */
  function inputsOf(defId) {
    var d = defs[defId];
    if (!d) return [];
    return d.inputs.map(function (sp) {
      var r = { key: sp.key, label: sp.label, type: sp.type };
      if (sp.type === "int") {
        r.min = sp.min;
        r.max = sp.max;
      } else {
        r.options = SOURCES.map(function (o) {
          return { key: o.key, name: o.name };
        });
      }
      return r;
    });
  }

  /** 회원이 적어 넣은 값을 정의가 정한 범위 안으로 다듬습니다(틀에서 한 번만). */
  function cleanParams(defId, raw) {
    var d = defs[defId];
    var out = copy(d ? d.params : {});
    if (!d || !raw) return out;
    d.inputs.forEach(function (sp) {
      var v = raw[sp.key];
      if (v === undefined || v === null || v === "") return;
      if (sp.type === "select") {
        if (hasSource(v)) out[sp.key] = v;
        return;
      }
      var n = parseInt(v, 10);
      if (!isFinite(n)) return;
      if (n < sp.min) n = sp.min;
      if (n > sp.max) n = sp.max;
      out[sp.key] = n;
    });
    return out;
  }

  function listDefs() {
    return defOrder.map(function (id) {
      var d = defs[id];
      return {
        id: d.id,
        name: d.name,
        note: d.note,
        pane: d.pane,
        params: copy(d.params),
        inputs: inputsOf(d.id)
      };
    });
  }

  /* =====================================================================
   * 2. 인스턴스 - "그 정의를 실제로 얹은 것 하나"
   *    기간 · 색 · 굵기 · 선모양 · 어느 칸을 각자 들고 있습니다.
   * ===================================================================== */
  var insts = {};      /* instId -> 인스턴스 */
  var instOrder = [];
  var instSeq = 0;

  function nameOfInst(inst) {
    var d = defs[inst.def];
    if (!d) return inst.def;
    if (d.nameOf) {
      try {
        return d.nameOf(inst.params);
      } catch (e) {
        /* 이름을 못 만들면 정의 이름 그대로 */
      }
    }
    return d.name;
  }

  /**
   * 정의를 화면에 하나 얹습니다.
   *   defId  "ema"
   *   opts   { id, params:{p:9}, colors:{ema:"#49C9E9"}, style, width, pane, on }
   * 돌려주는 값 - 만들어진 인스턴스 id (실패하면 null)
   */
  function addInstance(defId, opts) {
    var d = defs[defId];
    if (!d) {
      console.warn("[chart-indicator-kit] 그런 정의가 없습니다: " + defId);
      return null;
    }
    opts = opts || {};

    var id = opts.id;
    if (id !== undefined && id !== null && (typeof id !== "string" || !id)) {
      console.warn("[chart-indicator-kit] 인스턴스 이름이 글자가 아니라 거부했습니다:", id);
      return null;
    }
    if (isReservedId(id)) {
      console.warn(
        "[chart-indicator-kit] 이미 다른 지표가 쓰는 이름이라 거부했습니다: " + id +
        " (못 쓰는 이름 - " + RESERVED_IDS.join(" · ") + ")"
      );
      return null;
    }
    if (!id) {
      /* 저장된 인스턴스가 "ema-1" 을 이미 쓰고 있을 수 있습니다.
         빈 번호가 나올 때까지 올립니다(다시 켜도 이름이 안 겹치게). */
      do {
        id = defId + "-" + ++instSeq;
      } while (insts[id] || isReservedId(id));
    }
    if (insts[id]) {
      console.warn("[chart-indicator-kit] 인스턴스 id 가 이미 있습니다: " + id);
      return null;
    }

    var params = cleanParams(defId, opts.params);

    /* 색 - 정의의 기본색에서 시작하고, 인스턴스가 골랐으면 그걸 씁니다.
       목록 밖의 색은 조용히 넘어가지 않고 기본색으로 되돌리며 알립니다. */
    var hexes = colorHexes();
    var colors = {};
    d.outputs.forEach(function (o) {
      var want = opts.colors && opts.colors[o.key];
      if (want && hexes.indexOf(want) < 0) {
        console.warn("[chart-indicator-kit] 지표선 색 목록에 없는 색이라 기본색을 씁니다: " + want);
        want = null;
      }
      colors[o.key] = want || o.color;
    });

    var style = ALLOWED_STYLES.indexOf(opts.style) >= 0 ? opts.style : null;
    var pane = ALLOWED_PANES.indexOf(opts.pane) >= 0 ? opts.pane : d.pane;

    insts[id] = {
      id: id,
      def: defId,
      params: params,
      colors: colors,
      style: style,          /* null 이면 정의의 outputs[].style 을 씁니다 */
      width: ALLOWED_WIDTHS.indexOf(opts.width | 0) >= 0 ? opts.width | 0 : DEFAULT_WIDTH,
      pane: pane,
      on: !!opts.on,
      live: null
    };
    instOrder.push(id);
    return id;
  }

  function removeInstance(id) {
    if (!insts[id]) return false;
    turnOff(id);
    delete insts[id];
    var i = instOrder.indexOf(id);
    if (i >= 0) instOrder.splice(i, 1);
    saveState();
    dropButton(id);
    dropMenuRow(id);
    return true;
  }

  function listInstances() {
    return instOrder.map(function (id) {
      var it = insts[id];
      return {
        id: it.id,
        def: it.def,
        name: nameOfInst(it),
        note: defs[it.def] ? defs[it.def].note : "",
        params: copy(it.params),
        colors: copy(it.colors),
        style: it.style,
        width: it.width,
        pane: it.pane,
        on: it.on
      };
    });
  }

  /** 인스턴스의 대표색 - 목록의 점 색으로 씁니다(첫 번째 선). */
  function mainColor(it) {
    var d = defs[it.def];
    if (!d) return LINE_COLORS[0].hex;
    return it.colors[d.outputs[0].key] || d.outputs[0].color;
  }

  /* =====================================================================
   * 3. 봉 창고(BarStore) - 온 세상에 딱 한 벌
   * ===================================================================== */
  var bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
  var barsReady = false;
  var syncMark = { len: -1, first: null };

  function barAt(i) {
    return {
      time: bars.time[i],
      open: bars.open[i],
      high: bars.high[i],
      low: bars.low[i],
      close: bars.close[i],
      volume: bars.volume[i]
    };
  }

  function barCount() {
    return bars.time.length;
  }

  function clearBars() {
    bars = { time: [], open: [], high: [], low: [], close: [], volume: [] };
    barsReady = false;
    syncMark.len = -1;
    syncMark.first = null;
  }

  /** 캔들 시리즈에서 통째로 다시 읽어옵니다(켤 때 / 봉 간격 · 종목이 바뀔 때). */
  function syncBars() {
    if (!candleSeries) return false;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return false;
    }
    if (!data || !data.length) {
      clearBars();
      return false;
    }

    var n = data.length;
    var t = new Array(n), o = new Array(n), h = new Array(n);
    var l = new Array(n), c = new Array(n), v = new Array(n);
    var i;
    for (i = 0; i < n; i++) {
      t[i] = data[i].time;
      o[i] = data[i].open;
      h[i] = data[i].high;
      l[i] = data[i].low;
      c[i] = data[i].close;
      v[i] = 0;
    }

    /* 거래량은 별도 시리즈에 있습니다(chart.js 가 그렇게 만들었습니다).
       시각으로 맞춰 넣습니다. 못 읽으면 0 으로 둡니다 - 지금 등록된 EMA 는
       거래량을 안 쓰고, 나중에 쓰는 지표(OBV · MFI · VWAP)를 만들 때
       0 인지 먼저 확인하고 써야 합니다. */
    if (volumeSeries) {
      try {
        var vd = volumeSeries.data();
        if (vd && vd.length) {
          var map = {};
          for (i = 0; i < vd.length; i++) map[vd[i].time] = vd[i].value;
          for (i = 0; i < n; i++) {
            var got = map[t[i]];
            if (typeof got === "number") v[i] = got;
          }
        }
      } catch (e2) {
        /* 거래량을 못 읽으면 0 인 채로 둡니다 */
      }
    }

    bars.time = t;
    bars.open = o;
    bars.high = h;
    bars.low = l;
    bars.close = c;
    bars.volume = v;
    barsReady = true;
    syncMark.len = n;
    syncMark.first = t[0];
    return true;
  }

  /* ---------------------------------------------------------------------
   * 값 종류(Source) - 정의는 bs.src 를 읽습니다. 종가면 배열을 새로 만들지
   * 않고 있는 것을 그대로 넘깁니다(켤 때 한 번, O(n)).
   * ------------------------------------------------------------------- */
  function barsView(params) {
    var key = params && params.src;
    if (!key || key === "close") {
      bars.src = bars.close;
      return bars;
    }
    var s = sourceOf(key);
    var n = bars.close.length;
    var arr = new Array(n);
    for (var i = 0; i < n; i++) arr[i] = s.pick(bars, i);
    return {
      time: bars.time, open: bars.open, high: bars.high, low: bars.low,
      close: bars.close, volume: bars.volume, src: arr
    };
  }

  /** 마지막 봉 하나에 src 를 붙입니다. 종가면 그대로(새로 안 만듭니다). */
  function barWithSrc(bar, key) {
    if (!key || key === "close") {
      bar.src = bar.close;
      return bar;
    }
    var s = sourceOf(key);
    var one = { open: [bar.open], high: [bar.high], low: [bar.low], close: [bar.close] };
    return {
      time: bar.time, open: bar.open, high: bar.high, low: bar.low,
      close: bar.close, volume: bar.volume, src: s.pick(one, 0)
    };
  }

  /* ---------------------------------------------------------------------
   * 앞뒤로 밀기(Offset) - 트레이딩뷰와 같이 "봉 개수" 만큼 좌우로 밉니다.
   * 봉 끝을 넘어가면 마지막 봉 간격으로 시각을 늘려 잡습니다.
   * ------------------------------------------------------------------- */
  function offOf(params) {
    var o = params && params.off ? params.off | 0 : 0;
    if (!isFinite(o)) return 0;
    if (o > MAX_OFFSET) return MAX_OFFSET;
    if (o < -MAX_OFFSET) return -MAX_OFFSET;
    return o;
  }

  function timeAtIndex(i) {
    var n = bars.time.length;
    if (i < 0 || !n) return null;
    if (i < n) return bars.time[i];
    if (n < 2) return null;
    var gap = bars.time[n - 1] - bars.time[n - 2];
    if (!(gap > 0)) return null;
    return bars.time[n - 1] + gap * (i - n + 1);
  }

  function timeIndexMap() {
    var m = {};
    for (var i = 0; i < bars.time.length; i++) m[bars.time[i]] = i;
    return m;
  }

  /** 켤 때 한 번. off 가 0 이면 원본 배열을 그대로 씁니다(복사 안 함). */
  function shiftPoints(arr, off, map) {
    if (!off || !arr || !arr.length) return arr || [];
    var out = [];
    for (var i = 0; i < arr.length; i++) {
      var at = map[arr[i].time];
      if (at === undefined) continue;
      var t = timeAtIndex(at + off);
      if (t === null) continue;
      out.push({ time: t, value: arr[i].value });
    }
    return out;
  }

  /* =====================================================================
   * 4. 차트 · 시리즈 찾기 - chart.js 를 고치지 않고 공개 API 로만
   * ===================================================================== */
  var chart = null;
  var candleSeries = null;
  var volumeSeries = null;

  function LC() {
    return window.LightweightCharts;
  }

  function ensureChart() {
    if (chart && candleSeries) return true;
    if (!App.ChartFont || !isFn(App.ChartFont.getCharts)) return false;

    var charts = App.ChartFont.getCharts();
    if (!charts || !charts.length) return false;
    chart = charts[0];

    try {
      if (!isFn(chart.panes)) return false;
      var panes = chart.panes();
      for (var i = 0; i < panes.length; i++) {
        if (!isFn(panes[i].getSeries)) continue;
        var arr = panes[i].getSeries();
        for (var j = 0; j < arr.length; j++) {
          var ty = arr[j].seriesType && arr[j].seriesType();
          if (ty === "Candlestick" && !candleSeries) candleSeries = arr[j];
          if (ty === "Histogram" && !volumeSeries) {
            try {
              if (arr[j].options().priceScaleId === "") volumeSeries = arr[j];
            } catch (e) {
              volumeSeries = arr[j];
            }
          }
        }
      }
    } catch (e2) {
      console.warn("[chart-indicator-kit] 시리즈를 찾지 못했습니다:", e2);
      return false;
    }
    return !!(chart && candleSeries);
  }

  /* =====================================================================
   * 5. 켜고 끄기 - 인스턴스 하나만 다시 계산합니다 (성능의 핵심)
   * ===================================================================== */
  var perf = { ticks: 0, totalMs: 0, maxMs: 0, seeds: 0, seedMs: 0, lastSeedMs: 0 };

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : 0;
  }

  function anyOn() {
    for (var i = 0; i < instOrder.length; i++) if (insts[instOrder[i]].on) return true;
    return false;
  }

  function styleOf(s) {
    var lc = LC();
    if (!lc || !lc.LineStyle) return 0;
    if (s === "dashed") return lc.LineStyle.Dashed;
    if (s === "dotted") return lc.LineStyle.Dotted;
    return lc.LineStyle.Solid;
  }

  function makePane() {
    var p = chart.addPane();
    try {
      var base = 1;
      var main = chart.panes()[0];
      if (main && isFn(main.getStretchFactor)) {
        var f = main.getStretchFactor();
        if (isFinite(f) && f > 0) base = f;
      }
      if (isFn(p.setStretchFactor)) p.setStretchFactor(base * PANE_RATIO);
    } catch (e) {
      /* 비율을 못 정하면 라이브러리 기본 높이로 둡니다 */
    }
    return p;
  }

  function addSeriesFor(it, out, pane) {
    var lc = LC();
    var kind = out.kind || "line";
    var opts = {
      priceScaleId: "right",
      priceLineVisible: false,
      lastValueVisible: it.pane === "sub",
      crosshairMarkerVisible: false,
      color: it.colors[out.key] || out.color
    };
    if (kind === "line") {
      opts.lineWidth = it.width || DEFAULT_WIDTH;
      opts.lineStyle = styleOf(it.style || out.style);
    }
    var seriesDef = kind === "hist" ? lc.HistogramSeries : lc.LineSeries;

    if (pane && isFn(pane.addSeries)) return pane.addSeries(seriesDef, opts);
    if (pane && isFn(pane.paneIndex)) return chart.addSeries(seriesDef, opts, pane.paneIndex());
    return chart.addSeries(seriesDef, opts);
  }

  /** 인스턴스 하나를 그립니다. 다른 인스턴스는 건드리지 않습니다. */
  function turnOn(id) {
    var it = insts[id];
    if (!it || it.live) return;
    var d = defs[it.def];
    if (!d) return;
    if (!ensureChart()) return;
    if (!barsReady && !syncBars()) return;

    var n = barCount();
    if (!n) return;

    var t0 = now();

    /* 계산 먼저. 그려야 할 것이 없으면 시리즈도 만들지 않습니다. */
    var cap = {};
    var outData;
    try {
      outData = d.seed(barsView(it.params), it.params, cap);
    } catch (e) {
      console.warn("[chart-indicator-kit] seed 가 실패했습니다: " + id, e);
      return;
    }
    if (!outData) return;

    var off = offOf(it.params);
    var map = off ? timeIndexMap() : null;

    var pane = it.pane === "sub" ? makePane() : null;
    var made = {};
    for (var i = 0; i < d.outputs.length; i++) {
      var out = d.outputs[i];
      try {
        made[out.key] = addSeriesFor(it, out, pane);
        made[out.key].setData(shiftPoints(outData[out.key] || [], off, map));
      } catch (e2) {
        console.warn("[chart-indicator-kit] 선을 못 그렸습니다: " + id + "." + out.key, e2);
      }
    }

    it.live = {
      series: made,
      pane: pane,
      off: off,
      commit: cap.state || null,
      commitIdx: cap.state ? n - 2 : -1
    };

    var ms = now() - t0;
    perf.seeds++;
    perf.seedMs += ms;
    perf.lastSeedMs = ms;
  }

  /** 인스턴스 하나를 지웁니다. 선을 없애고 칸도 비면 없앱니다. */
  function turnOff(id) {
    var it = insts[id];
    if (!it || !it.live) return;
    var L = it.live;
    var k;
    for (k in L.series) {
      try {
        chart.removeSeries(L.series[k]);
      } catch (e) {
        /* 이미 없으면 무시 */
      }
    }
    /* 시리즈가 0개가 되면 라이브러리가 칸을 스스로 없앱니다.
       혹시 남아 있으면 직접 없앱니다(3단계에서 확인한 동작). */
    if (L.pane) {
      try {
        var idx = isFn(L.pane.paneIndex) ? L.pane.paneIndex() : -1;
        if (idx > 0 && isFn(L.pane.getSeries) && L.pane.getSeries().length === 0) {
          if (isFn(chart.removePane)) chart.removePane(idx);
        }
      } catch (e3) {
        /* 무시 */
      }
    }
    it.live = null;
  }

  /** 켜진 것 전부를 다시 그립니다(봉 간격 · 종목이 바뀌었을 때만). */
  function reseedAll() {
    var i;
    for (i = 0; i < instOrder.length; i++) turnOff(instOrder[i]);
    if (!anyOn()) {
      clearBars();
      stopTimer();
      return;
    }
    if (!ensureChart()) return;
    syncBars();
    if (!barsReady) return;
    for (i = 0; i < instOrder.length; i++) {
      if (insts[instOrder[i]].on) turnOn(instOrder[i]);
    }
  }

  /* =====================================================================
   * 6. 실시간 - 마지막 봉 하나만. 켜진 인스턴스만.
   * ===================================================================== */
  function onTick(payload) {
    /* 꺼져 있으면 여기서 끝 - 계산도 하지 않습니다 */
    if (!anyOn()) return;
    if (!payload || !payload.candle) return;
    if (App.Config && payload.symbol !== App.Config.getActiveSymbol()) return;
    if (!candleSeries) return;
    if (!barsReady && !syncBars()) return;

    var t0 = now();

    var c = payload.candle;
    var n = barCount();
    var lastTime = n ? bars.time[n - 1] : null;
    var newBar = false;

    if (n && c.time === lastTime) {
      bars.open[n - 1] = c.open;
      bars.high[n - 1] = c.high;
      bars.low[n - 1] = c.low;
      bars.close[n - 1] = c.close;
      bars.volume[n - 1] = c.volume;
    } else if (!n || c.time > lastTime) {
      bars.time.push(c.time);
      bars.open.push(c.open);
      bars.high.push(c.high);
      bars.low.push(c.low);
      bars.close.push(c.close);
      bars.volume.push(c.volume);
      newBar = true;
      n = barCount();
      syncMark.len = n;
    } else {
      return; /* 과거 시각이 뒤늦게 온 경우 - 무시 */
    }

    var lastBar = barAt(n - 1);

    for (var i = 0; i < instOrder.length; i++) {
      var it = insts[instOrder[i]];
      if (!it.on || !it.live || !it.live.commit) continue;
      var d = defs[it.def];
      if (!d) continue;

      try {
        /* 새 봉이 생겼으면 "직전에 닫힌 봉" 을 확정 상태에 접어 넣습니다.
           확정 상태를 따로 들고 있어야 진행 중인 봉의 값이 확정값을
           오염시키지 않습니다(EMA 는 한 번 오염되면 계속 끌고 갑니다). */
        if (newBar && it.live.commitIdx === n - 3) {
          var closed = barWithSrc(barAt(n - 2), it.params.src);
          var r0 = d.step(it.live.commit, closed, it.params);
          if (r0 && r0.state) {
            it.live.commit = r0.state;
            it.live.commitIdx = n - 2;
          }
        }

        var r = d.step(it.live.commit, barWithSrc(lastBar, it.params.src), it.params);
        if (!r || !r.values) continue;
        /* 밀기가 있으면 그린 자리도 그만큼 옮겨야 합니다(자리가 없으면 건너뜀) */
        var at = it.live.off ? timeAtIndex(n - 1 + it.live.off) : lastBar.time;
        if (at === null) continue;
        for (var k in r.values) {
          if (!it.live.series[k]) continue;
          var v = r.values[k];
          if (typeof v !== "number" || !isFinite(v)) continue;
          it.live.series[k].update({ time: at, value: v });
        }
      } catch (e) {
        /* 한 인스턴스가 실패해도 나머지는 계속 그립니다.
           다음 전체 맞춤에서 정리됩니다. */
      }
    }

    if (t0) {
      var ms = now() - t0;
      perf.ticks++;
      perf.totalMs += ms;
      if (ms > perf.maxMs) perf.maxMs = ms;
    }
  }

  /* =====================================================================
   * 7. 차트 데이터가 통째로 바뀌었는지 감시 (봉 간격 변경 / 과거 스크롤)
   *    chart.js 는 그때 setData() 를 부르는데 알려주는 신호가 없습니다.
   *    켜진 인스턴스가 있을 때만 돕니다. 타이머는 하나뿐입니다.
   * ===================================================================== */
  var timer = null;

  function checkResync() {
    if (!anyOn() || !candleSeries) return;
    var data;
    try {
      data = candleSeries.data();
    } catch (e) {
      return;
    }
    if (!data || !data.length) return;
    if (data.length === syncMark.len && data[0].time === syncMark.first) return;
    reseedAll();
  }

  function startTimer() {
    if (timer) return;
    timer = setInterval(checkResync, 1500);
  }

  function stopTimer() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function scheduleResync() {
    if (!anyOn()) return;
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 40) {
        clearInterval(t);
        return;
      }
      var d = null;
      try {
        d = candleSeries && candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        reseedAll();
      }
    }, 100);
  }

  /* =====================================================================
   * 8. 켜기 / 끄기 / 저장
   * ===================================================================== */
  function setOn(id, on) {
    var it = insts[id];
    if (!it) return;
    on = !!on;
    if (it.on === on) return;
    it.on = on;
    saveState();

    if (on) {
      if (!ensureChart()) return;
      if (!barsReady) syncBars();
      startTimer();
      turnOn(id);
    } else {
      turnOff(id);
      if (!anyOn()) {
        clearBars();
        stopTimer();
      }
    }
    paintButtons();
    paintMenu();
  }

  function toggle(id) {
    if (!insts[id]) return;
    setOn(id, !insts[id].on);
  }

  function isOn(id) {
    return !!(insts[id] && insts[id].on);
  }

  /* ---------------------------------------------------------------------
   * 설정 바꾸기 - 인스턴스 ★하나만★ 다시 계산합니다.
   * 값을 다듬는 곳(범위 · 색 목록 · 굵기)은 여기 한 곳뿐입니다.
   * 화면(설정 창)은 값을 검사하지 않고 그대로 넘깁니다.
   * ------------------------------------------------------------------- */
  function updateInstance(id, patch) {
    var it = insts[id];
    if (!it || !patch) return false;
    var d = defs[it.def];
    if (!d) return false;

    if (patch.params) {
      var merged = copy(it.params);
      for (var pk in patch.params) merged[pk] = patch.params[pk];
      it.params = cleanParams(it.def, merged);
    }
    if (patch.colors) {
      var hexes = colorHexes();
      d.outputs.forEach(function (o) {
        var want = patch.colors[o.key];
        if (want && hexes.indexOf(want) >= 0) it.colors[o.key] = want;
      });
    }
    if (patch.style && ALLOWED_STYLES.indexOf(patch.style) >= 0) it.style = patch.style;
    if (patch.width && ALLOWED_WIDTHS.indexOf(patch.width | 0) >= 0) it.width = patch.width | 0;

    if (it.on) {
      turnOff(id);
      turnOn(id);
    }
    saveState();
    refreshLabels(id);
    paintButtons();
    paintMenu();
    return true;
  }

  /** 정의의 기본값으로 되돌립니다(트레이딩뷰 Defaults 자리). */
  function resetInstance(id) {
    var it = insts[id];
    var d = it && defs[it.def];
    if (!d) return false;
    it.params = copy(d.params);
    it.style = null;
    it.width = DEFAULT_WIDTH;
    d.outputs.forEach(function (o) {
      it.colors[o.key] = o.color;
    });
    if (it.on) {
      turnOff(id);
      turnOn(id);
    }
    saveState();
    refreshLabels(id);
    paintButtons();
    paintMenu();
    return true;
  }

  /* 기존 7개가 이미 쓰고 있는 색 - MA(7) 금색 · MA(25) 흰색 · MA(99) 회색이고,
     RSI 는 흰색 · MACD 는 금색과 회색입니다(js/chart-oscillators.js).
     새로 얹는 줄에는 이 셋을 ★맨 뒤로 미룹니다.★
     ⚠️ 2026-09-02 실측 - 그 전에는 "지표 추가" 로 얹은 첫 줄이 무조건 금색이라
        MA(7) 을 켜 둔 회원 화면에서 두 선이 한 줄로 보였습니다. 2026-08-31 에
        시세선과 MA7 이 둘 다 금색이던 사고와 같은 종류입니다.
     (LINE_COLORS 의 앞 세 자리는 기존 MA 색을 그대로 두기 위한 것이라
      순서를 못 바꿉니다. 그래서 목록이 아니라 고르는 쪽에서 미룹니다) */
  var LEGACY_HEXES = ["#F0B429", "#E7ECF5", "#838DA4"];

  /** 아직 아무도 안 쓴 색을 하나 고릅니다(같은 색 두 줄을 막습니다). */
  function suggestColor() {
    /* 대표색만이 아니라 ★모든 선의 색★ 을 셉니다 - KDJ 처럼 선이 셋인 지표가
       생기면서, 새로 얹은 줄의 첫 선이 다른 줄의 둘째·셋째 선과 같은 색이
       될 수 있게 됐습니다. */
    var used = {};
    instOrder.forEach(function (iid) {
      var it = insts[iid];
      for (var ck in it.colors) used[it.colors[ck]] = true;
    });
    var i;
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!used[LINE_COLORS[i].hex] && LEGACY_HEXES.indexOf(LINE_COLORS[i].hex) < 0) {
        return LINE_COLORS[i].hex;
      }
    }
    /* 나머지를 다 썼으면 그때 기존 7개와 같은 색도 씁니다 */
    for (i = 0; i < LINE_COLORS.length; i++) {
      if (!used[LINE_COLORS[i].hex]) return LINE_COLORS[i].hex;
    }
    return LINE_COLORS[instOrder.length % LINE_COLORS.length].hex;
  }

  /**
   * 회원이 "지표 추가" 를 눌렀을 때. 인스턴스를 만들고 저장하고 화면까지
   * 붙입니다. (addInstance 는 틀에 등록만 하고 화면은 안 건드립니다)
   */
  function createInstance(defId, opts) {
    opts = copy(opts || {});
    var want = !!opts.on;
    opts.on = false;
    var id = addInstance(defId, opts);
    if (!id) return null;
    saveState();
    buildButtons();
    injectMenuRows();
    if (want) setOn(id, true);
    paintButtons();
    paintMenu();
    return id;
  }

  /** 기간을 바꾸면 이름도 바뀝니다 - 버튼과 목록 줄의 글자를 다시 씁니다. */
  function refreshLabels(id) {
    var it = insts[id];
    if (!it) return;
    var nm = nameOfInst(it);
    var col = mainColor(it);

    if (barEl) {
      var b = barEl.querySelector('.tl-kit-btn[data-kit="' + id + '"]');
      if (b) {
        b.setAttribute("data-color", col);
        var last = b.lastChild;
        if (last && last.nodeType === 3) last.nodeValue = nm;
      }
    }
    var p = menuPanel();
    if (p) {
      var row = p.querySelector('.tl-fx-row[data-key="' + id + '"]');
      if (row) {
        row.setAttribute("data-color", col);
        var t = row.querySelector(".tl-fx-name");
        if (t) t.textContent = nm;
      }
    }
  }

  function saveState() {
    try {
      if (!App.Storage || !isFn(App.Storage.save)) return;
      App.Storage.save(STORAGE_KEY, {
        v: STORE_VERSION,
        instances: instOrder.map(function (id) {
          var it = insts[id];
          return {
            id: it.id,
            def: it.def,
            params: it.params,
            colors: it.colors,
            style: it.style,
            width: it.width,
            pane: it.pane,
            on: it.on
          };
        })
      });
    } catch (e) {
      /* 저장 실패해도 화면은 그대로 동작 */
    }
  }

  /** 저장된 것이 있으면 그걸로, 없으면 기본 인스턴스로 시작합니다. */
  function loadState(defaults) {
    var saved = null;
    try {
      if (App.Storage && isFn(App.Storage.load)) saved = App.Storage.load(STORAGE_KEY);
    } catch (e) {
      saved = null;
    }

    if (saved && saved.v === STORE_VERSION && saved.instances && saved.instances.length) {
      var made = 0;
      saved.instances.forEach(function (s) {
        if (!s || !defs[s.def]) return; /* 정의가 사라졌으면 건너뜁니다 */
        /* 저장소는 회원 브라우저에 있어 손댈 수 있습니다. 이름 검사는
           addInstance 안에서 합니다(검사가 두 곳에 생기지 않게).
           거부되면 그 줄만 버리고 나머지는 그대로 살립니다. */
        if (addInstance(s.def, s)) made++;
      });
      if (made) return;
    }

    (defaults || []).forEach(function (d) {
      addInstance(d.def, d);
    });
  }

  /* =====================================================================
   * 9. 차트 왼쪽 위 작은 버튼 - 2 · 3단계가 만든 막대에 이어 붙입니다
   *    (저쪽 paintButtons() 는 .tl-ind-btn / .tl-osc-btn 만 훑기 때문에
   *     우리 버튼은 클래스를 따로 두어 서로 색을 안 건드립니다.)
   * ===================================================================== */
  var barEl = null;

  function injectStyle() {
    if (document.getElementById("chart-indicator-kit-style")) return;
    var css =
      ".tl-kit-btn{pointer-events:auto;background:#0D1422;border:1px solid #1D273B;" +
      "color:#838DA4;border-radius:3px;padding:2px 7px;font-size:11px;font-weight:600;" +
      "line-height:1.5;cursor:pointer;font-family:inherit;opacity:.72;transition:.12s;" +
      "display:inline-flex;align-items:center;gap:5px;}" +
      ".tl-kit-btn:hover{opacity:1;border-color:#838DA4;}" +
      '.tl-kit-btn[aria-pressed="true"]{opacity:1;background:#101727;border-color:#838DA4;color:#E7ECF5;}' +
      ".tl-kit-dot{width:6px;height:6px;border-radius:50%;background:#1D273B;flex:0 0 auto;}";
    var st = document.createElement("style");
    st.id = "chart-indicator-kit-style";
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  function paintButtons() {
    if (!barEl) return;
    /* 여기도 "달라진 것만" 씁니다 - 위 paintMenu 와 같은 이유입니다 */
    var kids = barEl.querySelectorAll(".tl-kit-btn");
    for (var i = 0; i < kids.length; i++) {
      var id = kids[i].getAttribute("data-kit");
      var on = isOn(id);
      var press = on ? "true" : "false";
      if (kids[i].getAttribute("aria-pressed") !== press) kids[i].setAttribute("aria-pressed", press);
      var col = on ? "#E7ECF5" : "#838DA4";
      var bor = on ? "#838DA4" : "#1D273B";
      if (kids[i].style.color !== col) kids[i].style.color = col;
      if (kids[i].style.borderColor !== bor) kids[i].style.borderColor = bor;
      var dot = kids[i].querySelector(".tl-kit-dot");
      var bg = on ? kids[i].getAttribute("data-color") : "#1D273B";
      if (dot && dot.style.background !== bg) dot.style.background = bg;
    }
  }

  function dropButton(id) {
    if (!barEl) return;
    var b = barEl.querySelector('.tl-kit-btn[data-kit="' + id + '"]');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  }

  function buildButtons() {
    /* 2단계가 만든 막대에 붙입니다. 없으면(2단계를 지웠으면) 아무것도 안 합니다. */
    var bar = document.querySelector(".chart-panel .tl-ind-bar") || document.querySelector(".tl-ind-bar");
    if (!bar) return false;

    injectStyle();
    barEl = bar;

    instOrder.forEach(function (id) {
      if (bar.querySelector('.tl-kit-btn[data-kit="' + id + '"]')) return;
      var it = insts[id];
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tl-kit-btn";
      btn.setAttribute("data-kit", id);
      btn.setAttribute("data-color", mainColor(it));
      btn.setAttribute("aria-pressed", "false");
      var dot = document.createElement("span");
      dot.className = "tl-kit-dot";
      btn.appendChild(dot);
      btn.appendChild(document.createTextNode(nameOfInst(it)));
      btn.addEventListener("click", function () {
        toggle(id);
      });
      bar.appendChild(btn);
    });

    paintButtons();
    return true;
  }

  /* =====================================================================
   * 10. fx 목록에 끼어들기 - js/chart-indicator-menu.js 는 안 고칩니다
   * ===================================================================== */
  var wrapped = false;

  /** 목록이 물어보는 isOn/toggle 을 감쌉니다. 우리 인스턴스면 우리가 답합니다. */
  function wrapMenuBridge() {
    if (wrapped) return;
    var IND = App.ChartIndicators;
    if (!IND || !isFn(IND.isOn) || !isFn(IND.toggle)) return;

    var origIsOn = IND.isOn;
    var origToggle = IND.toggle;

    IND.isOn = function (key) {
      if (insts[key]) return isOn(key);
      return origIsOn.apply(this, arguments);
    };
    IND.toggle = function (key) {
      if (insts[key]) return toggle(key);
      return origToggle.apply(this, arguments);
    };
    wrapped = true;
  }

  function menuPanel() {
    return document.getElementById("tl-fx-menu");
  }

  function dropMenuRow(id) {
    var p = menuPanel();
    if (!p) return;
    var r = p.querySelector('.tl-fx-row[data-key="' + id + '"]');
    if (r && r.parentNode) r.parentNode.removeChild(r);
  }

  /** 목록 창이 열렸으면 우리 줄을 이어 붙입니다(이미 있으면 아무것도 안 함). */
  function injectMenuRows() {
    var p = menuPanel();
    if (!p) return;
    var list = p.querySelector(".tl-fx-list");
    if (!list) return;

    for (var i = 0; i < instOrder.length; i++) {
      var id = instOrder[i];
      if (list.querySelector('.tl-fx-row[data-key="' + id + '"]')) continue;
      var it = insts[id];
      var d = defs[it.def];
      if (!d) continue;

      var row = document.createElement("button");
      row.type = "button";
      /* 저쪽 클래스를 그대로 씁니다. 그래야 저쪽 CSS 와 paint() 가 그대로
         적용되고, 우리가 같은 값을 두 번 적지 않습니다.
         (paint() 가 부르는 isOn/toggle 은 위에서 감싸 두었습니다) */
      row.className = "tl-fx-row";
      row.setAttribute("data-who", "ind");
      row.setAttribute("data-key", id);
      row.setAttribute("data-color", mainColor(it));
      row.setAttribute("data-kit", "1");
      row.setAttribute("aria-pressed", isOn(id) ? "true" : "false");

      var dot = document.createElement("span");
      dot.className = "tl-fx-dot";
      if (isOn(id)) dot.style.background = mainColor(it);
      var nm = document.createElement("span");
      nm.className = "tl-fx-name";
      nm.textContent = nameOfInst(it);
      var note = document.createElement("span");
      note.className = "tl-fx-note";
      note.textContent = d.note;
      var sw = document.createElement("span");
      sw.className = "tl-fx-sw";
      sw.appendChild(document.createElement("i"));

      row.appendChild(dot);
      row.appendChild(nm);
      row.appendChild(note);
      row.appendChild(sw);

      (function (theId) {
        row.addEventListener("click", function (ev) {
          ev.preventDefault();
          ev.stopPropagation();
          toggle(theId);
        });
      })(id);

      /* "주 차트" 무리 끝에 넣습니다 - "아래 별도 칸" 머리 바로 앞입니다. */
      var placed = false;
      if (it.pane === "main") {
        var groups = list.querySelectorAll(".tl-fx-group");
        for (var g = 0; g < groups.length; g++) {
          if (groups[g].textContent === "아래 별도 칸") {
            list.insertBefore(row, groups[g]);
            placed = true;
            break;
          }
        }
      }
      if (!placed) list.appendChild(row);
    }
  }

  /**
   * 우리 줄의 상태를 다시 칠하고, 아래 안내줄의 개수를 사실대로 고칩니다.
   *
   * 저쪽 paint() 가 세는 "켜진 지표 N개" 는 저쪽 rows() 만 셉니다.
   * 그대로 두면 EMA 를 켰는데 "켜진 지표 0개" 라고 적히는, 화면이 사실과
   * 다른 상태가 됩니다. 그래서 화면에 실제로 있는 줄을 다시 세어 적습니다.
   */
  function paintMenu() {
    var p = menuPanel();
    if (!p) return;

    /* 값이 이미 그러면 다시 쓰지 않습니다.
       ★2026-09-02 실측으로 확인한 것★ - 같은 값이라도 setAttribute 를 하면
       aria-pressed 를 보고 있는 이 창의 감시가 다시 불립니다. 그러면
         감시 -> paintMenu -> setAttribute -> 감시 ...
       가 끝없이 돌아 화면이 멈춥니다(브라우저가 응답을 안 합니다).
       줄에 무엇을 하나라도 더 붙이면(설정 창의 아이콘 세 개처럼) 이 고리가
       시작됩니다. 그래서 "달라진 것만" 쓰도록 못 박습니다. */
    var mine = p.querySelectorAll('.tl-fx-row[data-kit="1"]');
    for (var i = 0; i < mine.length; i++) {
      var id = mine[i].getAttribute("data-key");
      var on = isOn(id);
      var want2 = on ? "true" : "false";
      if (mine[i].getAttribute("aria-pressed") !== want2) mine[i].setAttribute("aria-pressed", want2);
      var dot = mine[i].querySelector(".tl-fx-dot");
      var wantBg = on ? mine[i].getAttribute("data-color") : GUIDE_COLOR;
      if (dot && dot.style.background !== wantBg) dot.style.background = wantBg;
    }

    var foot = p.querySelector(".tl-fx-foot");
    if (!foot) return;
    var n = p.querySelectorAll('.tl-fx-row[aria-pressed="true"]').length;
    var want =
      n === 0
        ? "켜진 지표가 없습니다. 눌러서 켜면 차트에 바로 그려집니다."
        : "켜진 지표 " + n + "개. 꺼진 지표는 계산도 하지 않습니다.";
    /* 같으면 안 씁니다 - 안 그러면 아래 감시가 스스로를 다시 부릅니다 */
    if (foot.textContent !== want) foot.textContent = want;
  }

  /* 감시는 두 겹입니다. 이렇게 나눈 이유가 있습니다.
   *
   * 처음에는 .chart-panel 하나를 subtree + characterData 로 통째로 감시했는데,
   * 차트 칸 안에는 시세 · 눈금처럼 초당 수십 번 바뀌는 글자가 있어서 감시
   * 콜백이 계속 불렸습니다. 실측(1920, 봉 1001개) -
   *     통째로 감시   기존 지표 0.278ms + 기존 오실 0.167ms = 0.445ms/틱
   *     안 하던 때    기존 지표 0.161ms + 기존 오실 0.117ms = 0.278ms/틱
   * 우리 지표를 다 꺼둔 상태인데도 남의 계산이 느려졌습니다. 그래서
   *     바깥 감시  .chart-panel 의 "자식이 늘고 줄었나" 만 (subtree 없음)
   *     안쪽 감시  목록 창이 열려 있는 동안만, 그 창 안쪽만
   * 으로 나눴습니다. 목록이 닫혀 있으면 안쪽 감시는 아예 없습니다.
   * (목록 창은 .chart-panel 의 바로 밑 자식으로 붙습니다 -
   *  js/chart-indicator-menu.js 의 build() 가 h.appendChild(p) 를 합니다) */
  var hostWatcher = null;
  var panelWatcher = null;

  function onHostChange() {
    var p = menuPanel();
    if (p && !panelWatcher) {
      injectMenuRows();
      paintMenu();
      panelWatcher = new MutationObserver(function () {
        injectMenuRows();
        paintMenu();
      });
      panelWatcher.observe(p, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["aria-pressed"],
        characterData: true
      });
    } else if (!p && panelWatcher) {
      panelWatcher.disconnect();
      panelWatcher = null;
    }
  }

  function watchMenu() {
    if (hostWatcher || typeof MutationObserver === "undefined") return;
    var host = document.querySelector(".chart-panel");
    if (!host) return;
    hostWatcher = new MutationObserver(onHostChange);
    hostWatcher.observe(host, { childList: true }); /* 자식만. subtree 안 봅니다 */
    onHostChange();
  }

  /* =====================================================================
   * 11. 여기부터 지표 정의 - 계산식은 한 지표당 한 곳에만
   *
   * 지표를 늘리려면 아래처럼 define() 한 덩어리를 더 적으면 끝입니다.
   * 위쪽 틀은 하나도 안 고칩니다.
   * ===================================================================== */

  /* -- EMA 지수이동평균 -------------------------------------------------
   * EMA(t) = 종가(t) x k + EMA(t-1) x (1-k),   k = 2 / (기간+1)
   * 첫 값은 앞 기간개의 단순평균으로 시작합니다(트레이딩뷰 · 바이낸스와 같음).
   *
   * 바이낸스 실측(2026-09-02) - EMA 기본 기간은 7 / 25 / 99 였습니다
   * (Main Indicator > EMA > "EMA - Exponential Moving Average").
   * 여기서는 증명용이라 9 와 21 을 씁니다 - 이미 있는 MA(7) · MA(25) 와
   * 겹쳐 보이지 않게 일부러 다른 기간을 골랐습니다.
   * ------------------------------------------------------------------- */
  define({
    id: "ema",
    name: "EMA",
    note: "지수이동평균",
    pane: "main",
    params: { p: 9 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      return "EMA(" + prm.p + ")";
    },
    outputs: [{ key: "ema", kind: "line", color: "#49C9E9", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;   /* 값 종류(종가 · 시가 · HL2 ...) */
      var n = src.length;
      var out = [];
      if (n < p) return { ema: out };

      var k = 2 / (p + 1);
      var sum = 0;
      var i;
      for (i = 0; i < p; i++) sum += src[i];
      var e = sum / p;
      out.push({ time: bs.time[p - 1], value: e });
      if (p - 1 === n - 2) cap.state = { e: e };

      for (i = p; i < n; i++) {
        e = src[i] * k + e * (1 - k);
        out.push({ time: bs.time[i], value: e });
        if (i === n - 2) cap.state = { e: e };
      }
      return { ema: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var k = 2 / (p + 1);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var e = x * k + st.e * (1 - k);
      return { values: { ema: e }, state: { e: e } };
    }
  });

  /* -- WMA 가중이동평균 -------------------------------------------------
   * WMA(t) = (p·값(t) + (p-1)·값(t-1) + ... + 1·값(t-p+1)) / (1+2+...+p)
   * 단순평균(MA)과 뿌리가 같고 무게만 다릅니다 - 최근 봉에 가장 큰 무게.
   *
   * 기본 길이 9 · 종가 · 밀기 0 · 굵기 1 - 트레이딩뷰 "Moving Average
   * Weighted" 기본값입니다. ⚠️ 바이낸스는 다릅니다 - 2026-09-02 에 직접
   * 열어 보니 WMA1·2·3 = 7 · 25 · 99 였습니다(MA 와 같은 칸 열 개짜리 구조).
   * ★차트 시스템은 트레이딩뷰를 따라간다★ 는 지시라 9 로 뒀습니다. 바이낸스
   * 처럼 보고 싶으면 WMA(7) · WMA(25) · WMA(99) 세 줄을 얹으면 됩니다 -
   * 이 틀이 "정의 1개 + 인스턴스 N개" 인 이유가 그것입니다.
   *
   * -- step 이 O(1) 인 이유 (이 지표의 핵심) ----------------------------
   * 그냥 하면 틱마다 p개를 다시 더해야 합니다. 아래 두 줄이면 끝납니다.
   *     분자(t) = 분자(t-1) + p·값(t) - 합(t-1)
   *     합(t)   = 합(t-1)   + 값(t)   - 값(t-p)
   * 그래서 상태가 "곧 창에서 빠질 값(oldest)" 과 최근 p개(buf) 를 들고 다닙니다.
   *
   * ⚠️ buf 를 그 자리에서 고쳐 씁니다. 그래도 되는 이유 -
   *    step 은 ★진행 중인 봉★ 때문에 같은 상태로 여러 번 불립니다. 그때
   *    덮어쓰는 칸은 st.head ★하나뿐★ 이고, 그 칸의 옛 값은 st.oldest 에
   *    따로 적어 두었습니다. 그래서 몇 번을 다시 불러도 답이 같습니다.
   *    (다음 oldest 는 ★쓴 뒤에★ 읽습니다 - 기간이 1이면 그 칸이 자기 자신입니다)
   * ------------------------------------------------------------------- */

  /** i번째 봉까지 확정된 WMA 상태. buf 는 [i-p+1 .. i] 를 시간순으로 담고
   *  head 는 "곧 빠질 칸"(= i-p+1) 을 가리킵니다. */
  function wmaState(num, sum, src, i, p) {
    var buf = new Array(p);
    for (var q = 0; q < p; q++) buf[q] = src[i - p + 1 + q];
    return { N: num, S: sum, oldest: buf[0], buf: buf, head: 0 };
  }

  define({
    id: "wma",
    name: "WMA",
    note: "가중이동평균",
    pane: "main",
    params: { p: 9 },
    inputs: [{ key: "p", label: "기간", min: 1, max: 1000 }],
    useSource: true,
    useOffset: true,
    nameOf: function (prm) {
      return "WMA(" + prm.p + ")";
    },
    outputs: [{ key: "wma", kind: "line", color: "#FF8F3C", style: "solid" }],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var src = bs.src || bs.close;
      var n = src.length;
      var out = [];
      if (n < p) return { wma: out };

      var den = (p * (p + 1)) / 2;
      var num = 0;
      var sum = 0;
      var i;
      for (i = 0; i < p; i++) {
        num += (i + 1) * src[i];
        sum += src[i];
      }
      out.push({ time: bs.time[p - 1], value: num / den });
      if (p - 1 === n - 2) cap.state = wmaState(num, sum, src, p - 1, p);

      for (i = p; i < n; i++) {
        num = num + p * src[i] - sum;
        sum = sum + src[i] - src[i - p];
        out.push({ time: bs.time[i], value: num / den });
        if (i === n - 2) cap.state = wmaState(num, sum, src, i, p);
      }
      return { wma: out };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var x = typeof bar.src === "number" ? bar.src : bar.close;
      var den = (p * (p + 1)) / 2;
      var num = st.N + p * x - st.S;
      var sum = st.S + x - st.oldest;

      var len = st.buf.length || 1;
      st.buf[st.head] = x;                    /* 덮어쓰는 칸은 여기 하나뿐 */
      var head = (st.head + 1) % len;
      return {
        values: { wma: num / den },
        state: { N: num, S: sum, oldest: st.buf[head], buf: st.buf, head: head }
      };
    }
  });

  /* -- KDJ -------------------------------------------------------------
   * 국내·아시아권에서 많이 쓰는 스토캐스틱 계열입니다. 선이 셋입니다.
   *
   *   RSV(t) = (종가 - 기간최저) / (기간최고 - 기간최저) x 100
   *   K = ((k-1)·이전K + RSV) / k    기본 k=3 이면  K = (2·이전K + RSV) / 3
   *   D = ((d-1)·이전D + K)  / d     기본 d=3 이면  D = (2·이전D + K)  / 3
   *   J = 3K - 2D                    시작값은 K = D = 50
   *
   * J 는 K 와 D 의 벌어짐이라 0~100 을 넘어갑니다 - 그래서 눈금을 고정하지
   * 않고 라이브러리 자동 눈금에 맡깁니다.
   *
   * ⭐ 기본값 9 · 3 · 3 의 근거 - ★2026-09-02 바이낸스 선물 차트에서 직접 열어
   *    읽은 값입니다.★ (Original 차트 > 지표 > Sub Indicator > KDJ)
   *        KDJ - Stochastic Indicator
   *        Calculating Period 9 · MA Period 1  3 · MA Period 2  3
   *    우리 이름으로는 기간 9 · K 기간 3 · D 기간 3 입니다.
   *    트레이딩뷰 ★내장★ 에는 KDJ 가 없어서(커뮤니티 지표뿐이고 기본값이
   *    제각각입니다) 회원이 실제로 보는 바이낸스 값을 따랐습니다.
   *    바이낸스 선 색은 #EB40B5 · #B385F8 · #F0B90B 세 가지였습니다 -
   *    우리는 확정 팔레트 밖 색을 못 쓰므로 LINE_COLORS 안에서 골랐습니다.
   *
   * -- 기간최고 · 기간최저를 틱마다 다시 훑지 않습니다 -------------------
   *    창에 최고값이 어느 칸인지(hiIdx) 를 같이 들고 다닙니다.
   *      · 새 값이 더 높다         -> 그 값이 새 최고 (비교 한 번)
   *      · 최고가 창에 그대로 있다  -> 그대로 (비교 한 번)
   *      · 최고이던 봉이 빠졌다     -> 그때만 창을 훑습니다
   *    보통은 O(1) 이고, 훑는 경우에도 ★봉 개수 n 이 아니라 기간 p★ 입니다.
   *    (기본 9 -> 최대 8번 비교. 1000봉을 다시 계산하는 것과 다릅니다)
   *
   * ⚠️ ring 을 그 자리에서 고쳐 쓰는 것은 위 WMA 와 같은 이유로 안전합니다.
   *    값은 상태에 적어 둔 hiMax/loMin 으로만 내고, 창을 훑는 경우는
   *    ★현재 값을 쓴 뒤★ 라 몇 번을 다시 불러도 답이 같습니다.
   * ------------------------------------------------------------------- */

  function kdjInit(m) {
    return {
      hb: new Array(m), lb: new Array(m), head: 0, cnt: 0,
      hiMax: -Infinity, hiIdx: -1, loMin: Infinity, loIdx: -1,
      k: 50, d: 50
    };
  }

  /** seed 가 잡아 두는 상태는 배열까지 복사합니다 - 뒤이어 도는 봉이
   *  같은 배열을 고쳐 쓰지 못하게. (켤 때 한 번뿐입니다) */
  function kdjCopy(st) {
    return {
      hb: st.hb.slice(), lb: st.lb.slice(), head: st.head, cnt: st.cnt,
      hiMax: st.hiMax, hiIdx: st.hiIdx, loMin: st.loMin, loIdx: st.loIdx,
      k: st.k, d: st.d
    };
  }

  /** 봉 하나를 처리합니다. seed 와 step 이 ★같은 함수★ 를 씁니다
   *  (계산이 두 벌이 되면 켤 때와 틱이 어긋납니다). */
  function kdjOne(st, high, low, close, m, m1, m2) {
    var vals = null;
    var k = st.k;
    var d = st.d;

    if (st.cnt >= m) {
      var hh = high > st.hiMax ? high : st.hiMax;
      var ll = low < st.loMin ? low : st.loMin;
      var rsv = hh > ll ? ((close - ll) / (hh - ll)) * 100 : 50;
      k = ((m1 - 1) * st.k + rsv) / m1;
      d = ((m2 - 1) * st.d + k) / m2;
      vals = { k: k, d: d, j: 3 * k - 2 * d };
    }

    var head = st.head;
    var cnt = st.cnt;
    var hiMax = st.hiMax, hiIdx = st.hiIdx;
    var loMin = st.loMin, loIdx = st.loIdx;
    var a, v;

    if (m > 0) {
      st.hb[head] = high;                     /* 덮어쓰는 칸은 여기 하나뿐 */
      st.lb[head] = low;

      if (high >= hiMax) {
        hiMax = high;
        hiIdx = head;
      } else if (hiIdx === head) {            /* 최고이던 봉이 창에서 빠졌습니다 */
        hiMax = -Infinity;
        hiIdx = -1;
        for (a = 0; a < m; a++) {
          v = st.hb[a];
          if (v === undefined) continue;
          if (v > hiMax) { hiMax = v; hiIdx = a; }
        }
      }

      if (low <= loMin) {
        loMin = low;
        loIdx = head;
      } else if (loIdx === head) {
        loMin = Infinity;
        loIdx = -1;
        for (a = 0; a < m; a++) {
          v = st.lb[a];
          if (v === undefined) continue;
          if (v < loMin) { loMin = v; loIdx = a; }
        }
      }

      head = (head + 1) % m;
      if (cnt < m) cnt++;
    }

    return {
      values: vals,
      state: {
        hb: st.hb, lb: st.lb, head: head, cnt: cnt,
        hiMax: hiMax, hiIdx: hiIdx, loMin: loMin, loIdx: loIdx, k: k, d: d
      }
    };
  }

  define({
    id: "kdj",
    name: "KDJ",
    note: "K·D·J 세 선",
    pane: "sub",
    params: { p: 9, k: 3, d: 3 },
    inputs: [
      { key: "p", label: "기간", min: 1, max: 1000 },
      { key: "k", label: "K 기간", min: 1, max: 100 },
      { key: "d", label: "D 기간", min: 1, max: 100 }
    ],
    nameOf: function (prm) {
      return "KDJ(" + prm.p + "," + prm.k + "," + prm.d + ")";
    },
    outputs: [
      { key: "k", kind: "line", color: "#499EE9", style: "solid" },
      { key: "d", kind: "line", color: "#E1ED97", style: "solid" },
      { key: "j", kind: "line", color: "#E637E6", style: "solid" }
    ],

    seed: function (bs, prm, cap) {
      var p = Math.max(1, prm.p | 0);
      var m1 = Math.max(1, prm.k | 0);
      var m2 = Math.max(1, prm.d | 0);
      var m = p - 1;
      var n = bs.close.length;
      var outK = [], outD = [], outJ = [];
      var st = kdjInit(m);

      for (var i = 0; i < n; i++) {
        var r = kdjOne(st, bs.high[i], bs.low[i], bs.close[i], m, m1, m2);
        st = r.state;
        if (r.values) {
          outK.push({ time: bs.time[i], value: r.values.k });
          outD.push({ time: bs.time[i], value: r.values.d });
          outJ.push({ time: bs.time[i], value: r.values.j });
        }
        if (i === n - 2) cap.state = kdjCopy(st);
      }
      return { k: outK, d: outD, j: outJ };
    },

    step: function (st, bar, prm) {
      var p = Math.max(1, prm.p | 0);
      var r = kdjOne(
        st, bar.high, bar.low, bar.close,
        p - 1, Math.max(1, prm.k | 0), Math.max(1, prm.d | 0)
      );
      return { values: r.values || {}, state: r.state };
    }
  });

  /* 처음 오는 회원에게 주는 기본 인스턴스 - 전부 꺼짐입니다.
     정의는 "ema" 하나인데 인스턴스가 둘입니다. 이것이 이번 증명입니다. */
  var DEFAULT_INSTANCES = [
    { def: "ema", id: "ema-9", params: { p: 9 }, colors: { ema: "#49C9E9" }, style: "solid", on: false },
    { def: "ema", id: "ema-21", params: { p: 21 }, colors: { ema: "#BA6EED" }, style: "solid", on: false }
  ];

  /* =====================================================================
   * 12. 시작
   * ===================================================================== */
  function init() {
    loadState(DEFAULT_INSTANCES);

    if (App.Bus && isFn(App.Bus.on)) {
      App.Bus.on("kline:update", onTick);
      App.Bus.on("symbol:change", scheduleResync);
      App.Bus.on("interval:change", scheduleResync);
    }

    wrapMenuBridge();
    watchMenu();

    /* 차트는 chart.js 가 나중에 만들고, 과거 캔들은 그보다 더 나중에
       도착합니다(REST 조회). 둘 다 준비될 때까지만 잠깐 기다립니다. */
    var tries = 0;
    var t = setInterval(function () {
      if (++tries > 200) {
        clearInterval(t); /* 10초 - 그래도 없으면 포기 */
        return;
      }
      wrapMenuBridge();
      watchMenu(); /* .chart-panel 이 늦게 생길 수 있어 여기서도 다시 겁니다 */
      if (!ensureChart()) return;
      if (!buildButtons()) return;
      if (!anyOn()) {
        clearInterval(t); /* 켜진 게 없으면 캔들을 기다릴 이유도 없음 */
        return;
      }
      var d = null;
      try {
        d = candleSeries.data();
      } catch (e) {
        return;
      }
      if (d && d.length) {
        clearInterval(t);
        startTimer();
        reseedAll();
        paintButtons();
      }
    }, 50);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    /* 틀 */
    define: define,
    addInstance: addInstance,
    createInstance: createInstance,
    updateInstance: updateInstance,
    resetInstance: resetInstance,
    removeInstance: removeInstance,
    listDefs: listDefs,
    listInstances: listInstances,
    inputsOf: inputsOf,
    RESERVED_IDS: RESERVED_IDS,
    suggestColor: suggestColor,
    LINE_COLORS: LINE_COLORS,
    LINE_WIDTHS: ALLOWED_WIDTHS,
    LINE_STYLES: ALLOWED_STYLES,
    SOURCES: SOURCES,
    /* 켜기 / 끄기 */
    toggle: toggle,
    setOn: setOn,
    isOn: isOn,
    /* 확인용 */
    getPerf: function () {
      return {
        ticks: perf.ticks,
        avgMs: perf.ticks ? perf.totalMs / perf.ticks : 0,
        maxMs: perf.maxMs,
        seeds: perf.seeds,
        avgSeedMs: perf.seeds ? perf.seedMs / perf.seeds : 0,
        lastSeedMs: perf.lastSeedMs
      };
    },
    resetPerf: function () {
      perf.ticks = 0;
      perf.totalMs = 0;
      perf.maxMs = 0;
      perf.seeds = 0;
      perf.seedMs = 0;
      perf.lastSeedMs = 0;
    },
    getBarsForTest: function () {
      return bars;
    },
    getInstancesForTest: function () {
      return insts;
    },
    getDefsForTest: function () {
      return defs;
    },
    onTickForTest: onTick,
    rebuildButtonsForTest: buildButtons
  };
})();
