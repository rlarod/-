/* =========================================================================
 * js/jitter-probe.js — App.JitterProbe
 * =========================================================================
 * 화면이 위아래로 흔들릴 때, 어느 부분의 높이가 변해서 그런지 찾아
 * 화면 오른쪽 아래에 표시합니다.
 *
 * 평소에는 아무것도 하지 않습니다. 주소 끝에 ?jitter=1 을 붙였을 때만
 * 켜집니다. 손님에게는 보이지 않습니다.
 *
 *   https://sigma-lovat-81.vercel.app/?jitter=1
 *
 * 왜 필요한가 — 채팅 칸은 화면에 고정(sticky)돼 있지만, 그 위쪽 내용의
 * 높이가 변하면 고정 기준점 자체가 움직여서 칸이 통째로 밀립니다.
 * 로컬에서는 시세·채팅이 안 들어와 재현되지 않아, 실제 화면에서 재야
 * 어느 부분이 범인인지 알 수 있습니다.
 * ========================================================================= */

window.App = window.App || {};

App.JitterProbe = (function () {
  "use strict";

  var ON = false;
  try {
    ON = /[?&]jitter=1/.test(window.location.search);
  } catch (e) {
    ON = false;
  }

  /* 높이가 변할 만한 큰 덩어리들. 이름은 화면에 그대로 보여줍니다. */
  var TARGETS = [
    ["문서 전체", "html"],
    ["헤더", ".top-banner"],
    ["메뉴", ".menu-bar"],
    ["공지·게시판 줄", ".notice-board-wrap"],
    ["광고", ".side-ad-panel"],
    ["시세 표", ".ticker-board-panel"],
    ["차트", ".chart-panel"],
    ["호가창", ".orderbook-panel"],
    ["주문", ".order-panel"],
    ["왼쪽 전체", ".page-left"],
    ["오른쪽 전체", ".page-right"],
    ["채팅 칸", ".page-chat-col"],
    ["채팅 메시지", "#chat-messages"],
    ["내 정보 박스", ".user-panel-box"],
    ["내 정보 내용", "#user-panel-body"],
    ["채팅 안내줄", ".page-right .chat-err"],
    ["채팅 입력줄", ".page-right .chat-input-row"],
    ["공지 박스", ".notice-box"],
    ["롱숏 비율", ".market-war-panel"],
  ];

  var box = null;

  function makeBox() {
    box = document.createElement("div");
    box.id = "jitter-probe";
    box.style.cssText =
      "position:fixed;right:10px;bottom:10px;z-index:99999;max-width:340px;" +
      "background:rgba(0,0,0,0.88);color:#fff;font:12px/1.5 monospace;" +
      "padding:10px 12px;border:1px solid #444;border-radius:6px;white-space:pre;";
    box.textContent = "화면이 자리 잡기를 기다리는 중... (5초)\n그대로 두세요";
    document.body.appendChild(box);
  }

  function h(sel) {
    var el = sel === "html" ? document.documentElement : document.querySelector(sel);
    if (!el) return null;
    return sel === "html"
      ? el.scrollHeight
      : Math.round(el.getBoundingClientRect().height);
  }

  function y(sel) {
    var el = document.querySelector(sel);
    return el ? Math.round(el.getBoundingClientRect().y) : null;
  }

  function run() {
    var 기록 = {};
    TARGETS.forEach(function (t) {
      기록[t[0]] = [];
    });
    var 채팅위치 = [];

    /* 페이지가 처음 뜰 때는 값이 비어 있다가 채워지면서 크게 한 번 변합니다
       (호가창이 0줄 → 5줄 같은 경우). 그건 흔들림이 아니라 자리 잡는
       과정입니다. 그래서 5초 기다렸다가 재기 시작합니다.
       또 '몇 번 변했는지' 를 함께 셉니다 — 한 번만 변했으면 일회성이고,
       수십 번 변했으면 계속 흔들리는 것입니다. 이 둘을 구분해야
       엉뚱한 곳을 고치지 않습니다. */
    setTimeout(function () {
      box.textContent = "측정 중... 15초만 그대로 두세요";
      var n = 0;
      var timer = setInterval(function () {
        TARGETS.forEach(function (t) {
          기록[t[0]].push(h(t[1]));
        });
        채팅위치.push(y(".page-chat-col"));
        n++;
        if (n < 150) return; /* 0.1초 x 150 = 15초 */
        clearInterval(timer);
        보고();
      }, 100);
    }, 5000);

    function 변화횟수(v) {
      var c = 0;
      for (var i = 1; i < v.length; i++) if (v[i] !== v[i - 1]) c++;
      return c;
    }

    function 보고() {
      var lines = [];
      var pos = 채팅위치.filter(function (x) {
        return x !== null;
      });
      var 진폭 = pos.length ? Math.max.apply(null, pos) - Math.min.apply(null, pos) : 0;
      lines.push("창 너비: " + window.innerWidth + "px");
      lines.push("채팅 칸: " + 진폭 + "px 움직임, " + 변화횟수(pos) + "번 변함");
      lines.push("");

      var 범인 = [];
      TARGETS.forEach(function (t) {
        var v = 기록[t[0]].filter(function (x) {
          return x !== null;
        });
        if (!v.length) return;
        var mn = Math.min.apply(null, v);
        var mx = Math.max.apply(null, v);
        var cnt = 변화횟수(v);
        if (mx - mn > 0) 범인.push([t[0], mx - mn, cnt, mn, mx]);
      });
      /* 자주 변한 것부터 — 계속 흔들리는 범인이 위로 옵니다 */
      범인.sort(function (a, b) {
        return b[2] - a[2] || b[1] - a[1];
      });

      if (!범인.length) {
        lines.push("높이가 변한 곳: 없음");
        lines.push("(지금은 흔들리지 않는 상태입니다)");
      } else {
        lines.push("계속 변한 곳 (자주 변한 순):");
        범인.slice(0, 6).forEach(function (r) {
          lines.push("  " + r[0]);
          lines.push("    " + r[2] + "번, " + r[1] + "px (" + r[3] + "~" + r[4] + ")");
        });
        lines.push("");
        lines.push("* 1~2번만 변했으면 흔들림 아님");
      }
      lines.push("");
      lines.push("이 상자를 캡처해서 보내주세요");
      box.textContent = lines.join("\n");
    }
  }

  function init() {
    if (!ON) return;
    makeBox();
    run();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, 켜짐: ON };
})();
