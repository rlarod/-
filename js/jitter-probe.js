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
    box.textContent = "흔들림 측정 중... 10초만 그대로 두세요";
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

    var n = 0;
    var timer = setInterval(function () {
      TARGETS.forEach(function (t) {
        기록[t[0]].push(h(t[1]));
      });
      채팅위치.push(y(".page-chat-col"));
      n++;
      if (n < 100) return; /* 0.1초 x 100 = 10초 */
      clearInterval(timer);

      var lines = [];
      var 진폭 = (function () {
        var v = 채팅위치.filter(function (x) {
          return x !== null;
        });
        return v.length ? Math.max.apply(null, v) - Math.min.apply(null, v) : 0;
      })();
      lines.push("창 너비: " + window.innerWidth + "px");
      lines.push("채팅 칸 흔들림: " + 진폭 + "px");
      lines.push("");

      var 범인 = [];
      TARGETS.forEach(function (t) {
        var v = 기록[t[0]].filter(function (x) {
          return x !== null;
        });
        if (!v.length) return;
        var mn = Math.min.apply(null, v);
        var mx = Math.max.apply(null, v);
        if (mx - mn > 0) 범인.push([t[0], mx - mn, mn, mx]);
      });
      범인.sort(function (a, b) {
        return b[1] - a[1];
      });

      if (!범인.length) {
        lines.push("높이가 변한 곳: 없음");
        lines.push("(다른 원인일 수 있습니다)");
      } else {
        lines.push("높이가 변한 곳 (큰 순서):");
        범인.slice(0, 6).forEach(function (r) {
          lines.push("  " + r[0] + " : " + r[1] + "px (" + r[2] + "~" + r[3] + ")");
        });
      }
      lines.push("");
      lines.push("이 상자를 캡처해서 보내주세요");
      box.textContent = lines.join("\n");
    }, 100);
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
