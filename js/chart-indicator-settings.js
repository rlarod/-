/* =========================================================================
 * js/chart-indicator-settings.js - App.ChartIndicatorSettings   (설정판)
 * =========================================================================
 * 지표 하나하나의 설정 창입니다. 트레이딩뷰 설정 창을 옆에 띄워 놓고
 * 맞췄습니다(2026-09-02 실측 · 1440 다크).
 *
 * -- 트레이딩뷰에서 무엇을 가져왔나 -----------------------------------
 *   탭 구조        Inputs / Style      ->  계산 / 모양
 *                  (Visibility "봉 간격별 표시" 는 이번엔 뺐습니다)
 *   계산 탭        Length · Source · Offset  ->  기간 · 값 종류 · 앞뒤로 밀기
 *   모양 탭        색 견본 · Thickness 네 칸 · Line style 세 칸
 *                  (Opacity 불투명도는 뺐습니다 - 넣으면 지표선 색끼리의
 *                   구분 거리를 전부 다시 재야 합니다)
 *   아래 단추      Defaults / Cancel / Ok  ->  기본값 / 취소 / 확인
 *   목록 줄 아이콘 숨기기 · 설정 · 지우기  (트레이딩뷰는 더보기까지 넷)
 *
 * -- 트레이딩뷰와 다르게 한 것 (일부러) -------------------------------
 *   색       트레이딩뷰는 견본 85개 + 직접입력입니다. 우리는 지표선 전용
 *            12색만 씁니다(App.ChartIndicatorKit.LINE_COLORS 한 곳).
 *            아무 색이나 열어 두면 상승 초록 · 하락 빨강과 헷갈립니다.
 *   글씨     트레이딩뷰 14~20px. 우리는 17~24px 입니다.
 *            (2026-08-31 대표 "내가 글씨 크게 하라는 거 다 크게해")
 *   바탕색   배경 · 테두리 · 글자는 확정 팔레트 그대로입니다.
 *
 * -- 값을 여기에 적지 않았습니다 --------------------------------------
 * 기간의 범위 · 값 종류 목록 · 색 목록 · 굵기 칸 수는 전부 틀
 * (js/chart-indicator-kit.js)에서 읽어옵니다. 이 파일에는 지표 관련
 * 숫자가 하나도 없습니다. 같은 값이 두 곳에 있으면 언젠가 어긋납니다.
 *
 * -- 무엇을 안 건드렸나 ------------------------------------------------
 *   js/chart.js                  (수정 금지 12개)
 *   js/chart-indicators.js       MA7 · MA25 · MA99 · 볼린저 · 거래량
 *   js/chart-oscillators.js      RSI · MACD
 *   js/chart-indicator-menu.js   fx 목록
 * 넷 다 한 글자도 안 고쳤습니다. 이 파일은 fx 목록에 이미 들어가 있는
 * "틀 지표 줄"(data-kit="1")에만 아이콘을 붙이고, 목록 끝에 "지표 추가"
 * 한 줄을 더합니다. 기존 7개 줄은 손대지 않습니다.
 *
 * -- 저장 -------------------------------------------------------------
 * 저장은 틀이 이미 하고 있습니다(btc_sim_v2_chart-indicator-kit).
 * 이 파일은 저장소를 따로 만들지 않습니다.
 * 기존 키 btc_sim_v2_chart-indicators 는 읽지도 쓰지도 않습니다.
 *
 * -- 되돌리기 ---------------------------------------------------------
 *   1) index.html 의 <script src="js/chart-indicator-settings.js"></script>
 *      한 줄을 지웁니다
 *   2) js/chart-indicator-settings.js 파일을 지웁니다
 * 그러면 설정 창과 줄 아이콘만 사라지고, 지표는 어제처럼 켜고 끄기만
 * 됩니다. 저장된 설정값은 틀이 그대로 들고 있어 다시 넣으면 살아납니다.
 * ========================================================================= */

window.App = window.App || {};

App.ChartIndicatorSettings = (function () {
  "use strict";

  /* 확정 팔레트 - 화면 색은 이 아홉 개 안에서만 씁니다.
     지표선 색은 여기 없습니다. 틀(LINE_COLORS)에서 읽어옵니다. */
  var C_PAGE = "#0A0F1C";
  var C_CARD = "#101727";
  var C_TILE = "#0D1422";
  var C_BORDER = "#1D273B";
  var C_TEXT = "#E7ECF5";
  var C_MUTED = "#838DA4";
  var C_POINT = "#F0B429";

  var PANEL_ID = "tl-ind-cfg";
  var PICK_ID = "tl-ind-pick";
  var STYLE_ID = "tl-ind-cfg-style";

  var panel = null;
  var picker = null;
  var draft = null;      /* 창을 여는 동안만 들고 있는 값. 확인을 눌러야 반영 */
  var openAnchor = null; /* 어느 줄에서 열었나 - 탭을 바꿔 창이 커지면 다시 앉힙니다 */
  var openId = null;
  var openTab = "calc";

  function KIT() {
    return App.ChartIndicatorKit || null;
  }

  function isFn(v) {
    return typeof v === "function";
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }

  /* =====================================================================
   * 생김새 - 그림자 없음. 카드 위쪽 흰색 3% 얇은 선. 모서리 10px.
   *
   * 트레이딩뷰 실측(1440 다크)을 옆에 적어 둡니다.
   *   창 폭       트레이딩뷰 380px             우리 400px (좁으면 화면폭-16)
   *   제목        20px/600                     우리 24px/700
   *   탭          16px/600 · 사이 24px         우리 19px/700 · 사이 24px (같음)
   *   항목 이름   14px/400                     우리 17px/500
   *   입력칸      70 x 28px · 14px             우리 120 x 38px · 17px
   *   색 견본     17 x 17 · 모서리 2 · 사이 6  우리 26 x 26 · 모서리 3 · 사이 8
   *   굵기 칸     57 x 32 · 4칸                우리 66 x 38 · 4칸 (칸 수 같음)
   *   선 모양 칸  76 x 32 · 3칸                우리 84 x 38 · 3칸 (칸 수 같음)
   * 글씨와 누르는 자리만 키웠고 칸 수 · 배치 · 차례는 트레이딩뷰 그대로입니다.
   * ===================================================================== */
  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var P = "#" + PANEL_ID;
    var K = "#" + PICK_ID;
    var css =
      P + "," + K + "{position:fixed;z-index:960;width:400px;max-width:calc(100vw - 16px);" +
      "background:" + C_CARD + ";border:1px solid " + C_BORDER + ";border-radius:10px;" +
      "box-shadow:none;overflow:hidden;font-family:inherit;box-sizing:border-box;" +
      "display:flex;flex-direction:column;}" +
      P + "::before," + K + "::before{content:\"\";position:absolute;left:0;right:0;top:0;height:1px;" +
      "background:rgba(255,255,255,.03);pointer-events:none;}" +

      P + " .tl-cfg-head," + K + " .tl-cfg-head{display:flex;align-items:center;" +
      "justify-content:space-between;padding:12px 15px 9px;border-bottom:1px solid " + C_BORDER + ";" +
      "flex:0 0 auto;}" +
      P + " .tl-cfg-title," + K + " .tl-cfg-title{font-size:24px;font-weight:700;color:" + C_TEXT + ";" +
      "letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}" +
      P + " .tl-cfg-x," + K + " .tl-cfg-x{background:none;border:0;color:" + C_MUTED + ";font-size:24px;" +
      "line-height:1;cursor:pointer;padding:0 2px;font-family:inherit;}" +
      P + " .tl-cfg-x:hover," + K + " .tl-cfg-x:hover{color:" + C_TEXT + ";}" +

      P + " .tl-cfg-tabs{display:flex;gap:24px;padding:10px 15px 0;border-bottom:1px solid " + C_BORDER + ";" +
      "flex:0 0 auto;}" +
      P + " .tl-cfg-tab{background:none;border:0;border-bottom:2px solid transparent;color:" + C_MUTED + ";" +
      "font-size:19px;font-weight:700;line-height:1.5;padding:0 0 8px;cursor:pointer;font-family:inherit;}" +
      P + " .tl-cfg-tab:hover{color:" + C_TEXT + ";}" +
      P + " .tl-cfg-tab[aria-selected=\"true\"]{color:" + C_TEXT + ";border-bottom-color:" + C_POINT + ";}" +

      P + " .tl-cfg-body{padding:12px 15px 14px;overflow-y:auto;overscroll-behavior:contain;flex:1 1 auto;}" +
      P + " .tl-cfg-body::-webkit-scrollbar{width:3px;}" +
      P + " .tl-cfg-body::-webkit-scrollbar-thumb{background:" + C_BORDER + ";border-radius:2px;}" +
      P + " .tl-cfg-row{display:flex;align-items:center;justify-content:space-between;gap:10px;" +
      "padding:7px 0;}" +
      P + " .tl-cfg-lab{font-size:17px;font-weight:500;color:" + C_MUTED + ";line-height:26px;}" +
      P + " .tl-cfg-sec{font-size:17px;font-weight:700;color:" + C_MUTED + ";padding:10px 0 2px;}" +
      P + " .tl-cfg-in{width:120px;height:38px;box-sizing:border-box;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:6px;color:" + C_TEXT + ";font-size:17px;" +
      "font-family:inherit;padding:0 9px;}" +
      P + " .tl-cfg-sel{height:38px;box-sizing:border-box;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:6px;color:" + C_TEXT + ";font-size:17px;" +
      "font-family:inherit;padding:0 9px;min-width:150px;max-width:62%;}" +
      P + " .tl-cfg-in:focus," + P + " .tl-cfg-sel:focus{outline:none;border-color:" + C_MUTED + ";}" +

      P + " .tl-cfg-sw{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0 2px;}" +
      P + " .tl-cfg-chip{width:26px;height:26px;border-radius:3px;border:1px solid " + C_BORDER + ";" +
      "cursor:pointer;padding:0;font-size:0;}" +
      P + " .tl-cfg-chip[aria-pressed=\"true\"]{outline:2px solid " + C_TEXT + ";outline-offset:2px;}" +
      P + " .tl-cfg-seg{display:flex;gap:6px;flex-wrap:wrap;padding:4px 0 2px;}" +
      P + " .tl-cfg-seg button{height:38px;min-width:66px;background:" + C_TILE + ";" +
      "border:1px solid " + C_BORDER + ";border-radius:6px;cursor:pointer;color:" + C_MUTED + ";" +
      "font-size:17px;font-family:inherit;display:flex;align-items:center;justify-content:center;" +
      "gap:6px;padding:0 8px;}" +
      P + " .tl-cfg-seg button:hover{border-color:" + C_MUTED + ";}" +
      P + " .tl-cfg-seg button[aria-pressed=\"true\"]{border-color:" + C_TEXT + ";color:" + C_TEXT + ";" +
      "background:" + C_CARD + ";}" +
      P + " .tl-cfg-wide button{min-width:84px;}" +

      P + " .tl-cfg-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;" +
      "padding:10px 15px 12px;border-top:1px solid " + C_BORDER + ";flex:0 0 auto;}" +
      P + " .tl-cfg-btn{height:42px;padding:0 16px;border-radius:6px;font-size:17px;font-weight:600;" +
      "font-family:inherit;cursor:pointer;background:" + C_TILE + ";border:1px solid " + C_BORDER + ";" +
      "color:" + C_TEXT + ";}" +
      P + " .tl-cfg-btn:hover{border-color:" + C_MUTED + ";}" +
      P + " .tl-cfg-btn.on{background:" + C_POINT + ";border-color:" + C_POINT + ";color:" + C_PAGE + ";}" +

      /* fx 목록 줄에 붙는 아이콘 - 숨기기 · 설정 · 지우기 */
      "#tl-fx-menu .tl-cfg-acts{display:flex;align-items:center;gap:2px;flex:0 0 auto;}" +
      "#tl-fx-menu .tl-cfg-act{width:28px;height:28px;border-radius:5px;display:flex;" +
      "align-items:center;justify-content:center;cursor:pointer;color:" + C_MUTED + ";}" +
      "#tl-fx-menu .tl-cfg-act:hover{background:" + C_TILE + ";color:" + C_TEXT + ";}" +
      "#tl-fx-menu .tl-cfg-act svg{width:17px;height:17px;display:block;}" +
      "#tl-fx-menu .tl-cfg-add{width:100%;display:flex;align-items:center;gap:8px;background:none;" +
      "border:0;border-top:1px solid " + C_BORDER + ";padding:11px 15px;cursor:pointer;" +
      "font-family:inherit;font-size:19px;font-weight:600;color:" + C_MUTED + ";text-align:left;}" +
      "#tl-fx-menu .tl-cfg-add:hover{background:" + C_TILE + ";color:" + C_TEXT + ";}" +
      "#tl-fx-menu .tl-cfg-plus{font-size:21px;line-height:1;}" +

      K + " .tl-cfg-pickrow{width:100%;display:flex;align-items:baseline;gap:8px;background:none;" +
      "border:0;padding:11px 15px;cursor:pointer;font-family:inherit;text-align:left;}" +
      K + " .tl-cfg-pickrow:hover{background:" + C_TILE + ";}" +
      K + " .tl-cfg-pickname{font-size:19px;font-weight:600;color:" + C_TEXT + ";}" +
      K + " .tl-cfg-picknote{font-size:17px;color:" + C_MUTED + ";}" +

      /* 우리 줄은 설명("지수이동평균")을 접습니다.
         실측(1440) - 아이콘 세 개가 들어가면 이름이 "EM..." 으로 잘렸습니다.
         트레이딩뷰도 범례에 설명을 안 쓰고 이름과 값만 씁니다("EMA 9 close").
         기존 7개 줄의 설명은 그대로 둡니다. */
      "#tl-fx-menu .tl-fx-row[data-kit=\"1\"] .tl-fx-note{display:none;}";

    var st = document.createElement("style");
    st.id = STYLE_ID;
    st.textContent = css;
    (document.head || document.documentElement).appendChild(st);
  }

  /* =====================================================================
   * 아이콘 - 이모지를 쓰지 않습니다(tests/no-emoji.test.js). 선으로만 그립니다.
   * ===================================================================== */
  function svg(paths) {
    var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24");
    s.setAttribute("fill", "none");
    s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2");
    s.setAttribute("stroke-linecap", "round");
    s.setAttribute("stroke-linejoin", "round");
    paths.forEach(function (d) {
      var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("d", d);
      s.appendChild(p);
    });
    return s;
  }

  var ICON = {
    eye: [
      "M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z",
      "M12 14.6a2.6 2.6 0 100-5.2 2.6 2.6 0 000 5.2z"
    ],
    eyeOff: [
      "M4 4l16 16",
      "M9.9 5.7A9.9 9.9 0 0112 5.5c6.4 0 10 6.5 10 6.5a17 17 0 01-3.3 4",
      "M6.3 7.8A16.6 16.6 0 002 12s3.6 6.5 10 6.5c1.4 0 2.6-.3 3.7-.8"
    ],
    gear: [
      "M12 15.2a3.2 3.2 0 100-6.4 3.2 3.2 0 000 6.4z",
      "M19.4 13.6l1.7 1.3-1.9 3.3-2-.8a7.7 7.7 0 01-1.8 1l-.3 2.1h-3.8l-.3-2.1a7.7 7.7 0 01-1.8-1l-2 .8-1.9-3.3 1.7-1.3a7.9 7.9 0 010-2l-1.7-1.3 1.9-3.3 2 .8a7.7 7.7 0 011.8-1l.3-2.1h3.8l.3 2.1c.6.3 1.2.6 1.8 1l2-.8 1.9 3.3-1.7 1.3a7.9 7.9 0 010 2z"
    ],
    trash: ["M4 7h16", "M10 7V5h4v2", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6"]
  };

  function iconBtn(name, title, onClick) {
    var b = el("span", "tl-cfg-act");
    b.setAttribute("role", "button");
    b.setAttribute("tabindex", "0");
    b.setAttribute("title", title);
    b.setAttribute("aria-label", title);
    b.appendChild(svg(ICON[name]));
    b.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    b.addEventListener("keydown", function (ev) {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      ev.preventDefault();
      ev.stopPropagation();
      onClick();
    });
    return b;
  }

  /* =====================================================================
   * 설정 창
   * ===================================================================== */
  function instOf(id) {
    var kit = KIT();
    if (!kit) return null;
    var list = kit.listInstances();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function defOf(defId) {
    var kit = KIT();
    if (!kit) return null;
    var list = kit.listDefs();
    for (var i = 0; i < list.length; i++) if (list[i].id === defId) return list[i];
    return null;
  }

  function close() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
    draft = null;
    openId = null;
    openAnchor = null;
  }

  function closePicker() {
    if (picker && picker.parentNode) picker.parentNode.removeChild(picker);
    picker = null;
  }

  /* 판이 내려갈 수 있는 화면상의 마지노선 (top + 높이 가 이 값을 넘으면 안 됩니다).
     폰의 하단 고정 매수/매도 바(.tl-order-bar) 위로는 안 내려갑니다.
     전체화면일 때는 그 바가 화면에 안 그려지므로 세지 않습니다.

     ⚠️ 2026-09-03 수리팀 (P1) — 그전에는 화면 아래끝(innerHeight)만 봤습니다.
        하단 주문 바를 몰라서 ★단추줄 세 개가 통째로 바 밑에 깔렸습니다★.
        실측 360x640 — 단추 577~619 / 바 윗변 567 / 겹침 52px,
        elementFromPoint(확인 한가운데) 가 tl-order-bar-short 를 돌려줬습니다.
        오류도 안 나고 화면도 멀쩡한데 "확인" 자리에서 ★매도/숏 주문창★이 열립니다.
        돈이 오가는 자리라 P1 로 잡았습니다.

     ⚠️ js/chart-indicator-menu.js 의 floorY() 와 ★같은 것★ 입니다.
        거기서 이미 검증된 방법이라 새로 만들지 않고 그대로 맞췄습니다.
        한쪽만 고치면 같은 화면에서 두 판이 서로 다르게 놓입니다 — 같이 고치세요. */
  function floorY(m) {
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;
    var lim = vh - m;
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
    if (r.height > 0 && r.top - m < lim) lim = r.top - m;
    return lim;
  }

  /** 화면 안으로 밀어 넣습니다. 360 에서도 밖으로 안 나가게. */
  function place(box, anchor) {
    var m = 8;
    var vw = window.innerWidth;
    var bottom = floorY(m);

    /* ⚠️ 자리만 위로 밀고 최대 높이를 그대로 두면 ★판이 안 밀립니다★.
       키가 그대로라 위로 못 올라가고 안쪽만 잘립니다.
       (오늘 js/chart-timezone.js 가 똑같은 함정에 빠졌던 자리입니다)
       그래서 마지노선에서 위 여백까지 뺀 값을 최대 높이로 줍니다.
       머리줄·단추줄은 flex:0 0 auto 라 안 줄고, 가운데 .tl-cfg-body 만
       overflow-y:auto 로 스크롤됩니다 — 단추는 항상 보입니다. */
    box.style.maxHeight = Math.max(0, bottom - m) + "px";
    var w = box.offsetWidth || 400;
    var h = box.offsetHeight || 400;

    var left, top;
    if (anchor) {
      var r = anchor.getBoundingClientRect();
      left = r.left + r.width / 2 - w / 2;
      top = r.top;
    } else {
      /* 가운데 정렬도 ★쓸 수 있는 칸★ 안에서 합니다.
         화면 한가운데(vh/2)로 잡으면 바 밑으로 내려갑니다. */
      left = vw / 2 - w / 2;
      top = m + (bottom - m - h) / 2;
    }
    if (left + w > vw - m) left = vw - m - w;
    if (left < m) left = m;
    if (top + h > bottom) top = bottom - h;
    if (top < m) top = m;
    box.style.left = Math.round(left) + "px";
    box.style.top = Math.round(top) + "px";
  }

  /* -- 계산 탭 --------------------------------------------------------- */
  function buildCalc(body, def) {
    def.inputs.forEach(function (sp) {
      var row = el("div", "tl-cfg-row");
      row.appendChild(el("span", "tl-cfg-lab", sp.label));

      if (sp.type === "select") {
        var sel = el("select", "tl-cfg-sel");
        sp.options.forEach(function (o) {
          var op = el("option", null, o.name);
          op.value = o.key;
          sel.appendChild(op);
        });
        sel.value = draft.params[sp.key];
        sel.addEventListener("change", function () {
          draft.params[sp.key] = sel.value;
        });
        row.appendChild(sel);
      } else {
        var inp = el("input", "tl-cfg-in");
        inp.type = "number";
        inp.min = String(sp.min);
        inp.max = String(sp.max);
        inp.step = "1";
        inp.value = String(draft.params[sp.key]);
        inp.addEventListener("input", function () {
          draft.params[sp.key] = inp.value;
        });
        row.appendChild(inp);
      }
      body.appendChild(row);
    });
  }

  /* -- 모양 탭 --------------------------------------------------------- */
  function linePreview(width, style) {
    var c = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    c.setAttribute("viewBox", "0 0 44 12");
    c.setAttribute("width", "44");
    c.setAttribute("height", "12");
    var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M2 6 H42");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", String(width));
    p.setAttribute("fill", "none");
    if (style === "dashed") p.setAttribute("stroke-dasharray", "6 4");
    if (style === "dotted") p.setAttribute("stroke-dasharray", "1.5 3.5");
    c.appendChild(p);
    return c;
  }

  function segGroup(values, current, render, onPick, wide) {
    var g = el("div", "tl-cfg-seg" + (wide ? " tl-cfg-wide" : ""));
    values.forEach(function (v) {
      var b = el("button");
      b.type = "button";
      b.setAttribute("aria-pressed", v === current ? "true" : "false");
      b.appendChild(render(v));
      b.addEventListener("click", function () {
        onPick(v);
        var kids = g.querySelectorAll("button");
        for (var i = 0; i < kids.length; i++) {
          kids[i].setAttribute("aria-pressed", values[i] === v ? "true" : "false");
        }
      });
      g.appendChild(b);
    });
    return g;
  }

  function buildStyle(body) {
    var kit = KIT();
    var keys = Object.keys(draft.colors);

    /* 색 - 출력선마다. 목록은 틀이 들고 있는 12색뿐입니다. */
    keys.forEach(function (key) {
      body.appendChild(el("div", "tl-cfg-sec", keys.length > 1 ? key + " 색" : "색"));
      var wrap = el("div", "tl-cfg-sw");
      kit.LINE_COLORS.forEach(function (c) {
        var b = el("button", "tl-cfg-chip");
        b.type = "button";
        b.style.background = c.hex;
        b.title = c.name;
        b.setAttribute("aria-label", c.name);
        b.setAttribute("aria-pressed", draft.colors[key] === c.hex ? "true" : "false");
        b.addEventListener("click", function () {
          draft.colors[key] = c.hex;
          var kids = wrap.querySelectorAll(".tl-cfg-chip");
          for (var i = 0; i < kids.length; i++) {
            kids[i].setAttribute("aria-pressed", kit.LINE_COLORS[i].hex === c.hex ? "true" : "false");
          }
        });
        wrap.appendChild(b);
      });
      body.appendChild(wrap);
    });

    /* 굵기 */
    body.appendChild(el("div", "tl-cfg-sec", "굵기"));
    body.appendChild(
      segGroup(
        kit.LINE_WIDTHS,
        draft.width,
        function (w) {
          return linePreview(w, "solid");
        },
        function (w) {
          draft.width = w;
        },
        false
      )
    );

    /* 선 모양 */
    var names = { solid: "실선", dashed: "파선", dotted: "점선" };
    body.appendChild(el("div", "tl-cfg-sec", "선 모양"));
    body.appendChild(
      segGroup(
        kit.LINE_STYLES,
        draft.style,
        function (st) {
          var box = el("span");
          box.style.display = "inline-flex";
          box.style.alignItems = "center";
          box.style.gap = "6px";
          box.appendChild(linePreview(2, st));
          box.appendChild(el("span", null, names[st] || st));
          return box;
        },
        function (st) {
          draft.style = st;
        },
        true
      )
    );
  }

  function paintBody() {
    if (!panel) return;
    var body = panel.querySelector(".tl-cfg-body");
    if (!body) return;
    while (body.firstChild) body.removeChild(body.firstChild);

    var inst = instOf(openId);
    if (!inst) return;
    var def = defOf(inst.def);
    if (!def) return;

    if (openTab === "calc") buildCalc(body, def);
    else buildStyle(body);

    var tabs = panel.querySelectorAll(".tl-cfg-tab");
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].setAttribute("aria-selected", tabs[i].getAttribute("data-tab") === openTab ? "true" : "false");
    }

    /* 탭을 바꾸면 창 높이가 달라집니다(실측 360 - 계산 354px, 모양 459px).
       그대로 두면 아래가 화면 밖으로 8px 나갔습니다. 다시 앉힙니다. */
    if (panel.parentNode) place(panel, openAnchor);
  }

  /** 지금 인스턴스 값을 임시 사본으로 뜹니다(확인을 눌러야 반영됩니다). */
  function makeDraft(inst) {
    var d = { params: {}, colors: {}, style: inst.style || "solid", width: inst.width };
    var k;
    for (k in inst.params) d.params[k] = inst.params[k];
    for (k in inst.colors) d.colors[k] = inst.colors[k];
    return d;
  }

  function open(id, anchor) {
    var kit = KIT();
    if (!kit) return;
    var inst = instOf(id);
    if (!inst) return;
    if (!defOf(inst.def)) return;

    closePicker();
    close();
    injectStyle();

    openId = id;
    openTab = "calc";
    openAnchor = anchor || null;
    draft = makeDraft(inst);

    panel = el("div");
    panel.id = PANEL_ID;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", inst.name + " 설정");

    var head = el("div", "tl-cfg-head");
    head.appendChild(el("span", "tl-cfg-title", inst.name));
    var x = el("button", "tl-cfg-x", "✕");
    x.type = "button";
    x.title = "닫기";
    x.addEventListener("click", close);
    head.appendChild(x);
    panel.appendChild(head);

    var tabs = el("div", "tl-cfg-tabs");
    [["calc", "계산"], ["style", "모양"]].forEach(function (t) {
      var b = el("button", "tl-cfg-tab", t[1]);
      b.type = "button";
      b.setAttribute("data-tab", t[0]);
      b.setAttribute("aria-selected", t[0] === openTab ? "true" : "false");
      b.addEventListener("click", function () {
        openTab = t[0];
        paintBody();
      });
      tabs.appendChild(b);
    });
    panel.appendChild(tabs);

    panel.appendChild(el("div", "tl-cfg-body"));

    var foot = el("div", "tl-cfg-foot");
    var reset = el("button", "tl-cfg-btn", "기본값");
    reset.type = "button";
    reset.title = "이 지표를 처음 값으로 되돌립니다";
    reset.addEventListener("click", function () {
      if (isFn(kit.resetInstance)) kit.resetInstance(openId);
      var again = instOf(openId);
      if (again) draft = makeDraft(again);
      paintBody();
    });
    foot.appendChild(reset);

    var right = el("div");
    right.style.display = "flex";
    right.style.gap = "8px";
    var cancel = el("button", "tl-cfg-btn", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", close);
    var ok = el("button", "tl-cfg-btn on", "확인");
    ok.type = "button";
    ok.addEventListener("click", function () {
      var id2 = openId;
      var d = draft;
      close();
      if (isFn(kit.updateInstance)) kit.updateInstance(id2, d);
    });
    right.appendChild(cancel);
    right.appendChild(ok);
    foot.appendChild(right);
    panel.appendChild(foot);

    (document.body || document.documentElement).appendChild(panel);
    paintBody();   /* 안쪽을 채운 뒤라야 높이를 제대로 재서 앉힐 수 있습니다 */
  }

  /* =====================================================================
   * 지표 추가 - 틀에 등록된 정의 목록을 그대로 보여줍니다
   * ===================================================================== */
  function openPicker(anchor) {
    var kit = KIT();
    if (!kit) return;
    injectStyle();
    closePicker();

    picker = el("div");
    picker.id = PICK_ID;
    picker.setAttribute("role", "dialog");
    picker.setAttribute("aria-label", "지표 추가");

    var head = el("div", "tl-cfg-head");
    head.appendChild(el("span", "tl-cfg-title", "지표 추가"));
    var x = el("button", "tl-cfg-x", "✕");
    x.type = "button";
    x.title = "닫기";
    x.addEventListener("click", closePicker);
    head.appendChild(x);
    picker.appendChild(head);

    var list = el("div");
    list.style.overflowY = "auto";
    kit.listDefs().forEach(function (d) {
      var row = el("button", "tl-cfg-pickrow");
      row.type = "button";
      row.appendChild(el("span", "tl-cfg-pickname", d.name));
      if (d.note) row.appendChild(el("span", "tl-cfg-picknote", d.note));
      row.addEventListener("click", function () {
        closePicker();
        /* 아직 아무도 안 쓴 색을 틀이 골라 줍니다(같은 색 두 줄 방지) */
        var hex = isFn(kit.suggestColor) ? kit.suggestColor() : null;
        var made = kit.createInstance(d.id, { on: true });
        if (!made) return;
        var inst = instOf(made);
        if (inst && hex) {
          var first = Object.keys(inst.colors)[0];
          if (first) {
            var c = {};
            c[first] = hex;
            kit.updateInstance(made, { colors: c });
          }
        }
        open(made, null);
      });
      list.appendChild(row);
    });
    picker.appendChild(list);

    (document.body || document.documentElement).appendChild(picker);
    place(picker, anchor || null);
  }

  /* =====================================================================
   * fx 목록에 손대기 - 우리 줄(data-kit="1")에만 아이콘을 붙입니다.
   * 기존 7개 줄은 건드리지 않습니다.
   * ===================================================================== */
  function menuPanel() {
    return document.getElementById("tl-fx-menu");
  }

  function buildActs(row, id) {
    var kit = KIT();
    var acts = el("span", "tl-cfg-acts");
    acts.appendChild(
      iconBtn("eye", "숨기기", function () {
        kit.toggle(id);
        decorateRows();
      })
    );
    acts.appendChild(
      iconBtn("gear", "설정", function () {
        open(id, row);
      })
    );
    acts.appendChild(
      iconBtn("trash", "지우기", function () {
        if (openId === id) close();
        kit.removeInstance(id);
        decorateRows();
      })
    );
    return acts;
  }

  /** 켜져 있으면 "숨기기"(뜬 눈), 꺼져 있으면 "보이기"(감은 눈). */
  function paintActs(acts, id) {
    var kit = KIT();
    var on = false;
    try {
      on = !!(kit && kit.isOn(id));
    } catch (e) {
      on = false;
    }
    var b = acts.firstChild;
    if (!b) return;
    var want = on ? "숨기기" : "보이기";
    if (b.getAttribute("title") === want) return;
    b.setAttribute("title", want);
    b.setAttribute("aria-label", want);
    while (b.firstChild) b.removeChild(b.firstChild);
    b.appendChild(svg(on ? ICON.eye : ICON.eyeOff));
  }

  function decorateRows() {
    var kit = KIT();
    var p = menuPanel();
    if (!kit || !p) return;

    var rows = p.querySelectorAll(".tl-fx-row[data-kit=\"1\"]");
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var id = row.getAttribute("data-key");
      if (!id) continue;
      var acts = row.querySelector(".tl-cfg-acts");
      if (!acts) {
        acts = buildActs(row, id);
        var sw = row.querySelector(".tl-fx-sw");
        if (sw) row.insertBefore(acts, sw);
        else row.appendChild(acts);
      }
      paintActs(acts, id);
    }

    var list = p.querySelector(".tl-fx-list");
    if (list && !p.querySelector(".tl-cfg-add")) {
      var add = el("button", "tl-cfg-add");
      add.type = "button";
      add.appendChild(el("span", "tl-cfg-plus", "+"));
      add.appendChild(el("span", null, "지표 추가"));
      add.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        openPicker(add);
      });
      if (list.nextSibling) list.parentNode.insertBefore(add, list.nextSibling);
      else list.parentNode.appendChild(add);
    }
  }

  /* 감시는 두 겹입니다. 넓게 걸면 시세 글자에까지 걸려 느려집니다
     (앞 단계 실측 - 틱당 0.278ms -> 0.445ms).
       바깥  .chart-panel 의 자식이 늘고 주는 것만 (subtree 없음)
       안쪽  목록 창이 열려 있는 동안만, 그 창의 "줄 목록" 자식만 */
  var hostWatcher = null;
  var listWatcher = null;

  function onHostChange() {
    var p = menuPanel();
    if (p && !listWatcher) {
      decorateRows();
      var list = p.querySelector(".tl-fx-list");
      if (!list) return;
      listWatcher = new MutationObserver(function () {
        decorateRows();
      });
      listWatcher.observe(list, { childList: true });
    } else if (!p && listWatcher) {
      listWatcher.disconnect();
      listWatcher = null;
      close();
      closePicker();
    }
  }

  function watch() {
    if (hostWatcher || typeof MutationObserver === "undefined") return;
    var host = document.querySelector(".chart-panel");
    if (!host) return;
    hostWatcher = new MutationObserver(onHostChange);
    hostWatcher.observe(host, { childList: true });
    onHostChange();
  }

  function init() {
    injectStyle();
    watch();

    /* .chart-panel 이 늦게 생길 수 있어 잠깐만 다시 시도합니다 */
    var tries = 0;
    var t = setInterval(function () {
      watch();
      if (hostWatcher || ++tries > 200) clearInterval(t);
    }, 50);

    window.addEventListener("resize", function () {
      if (panel) place(panel, openAnchor);
      if (picker) place(picker, null);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") return;
      if (picker) closePicker();
      else if (panel) close();
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    open: open,
    close: close,
    openPicker: openPicker,
    decorateRowsForTest: decorateRows,
    isOpenForTest: function () {
      return !!panel;
    }
  };
})();
