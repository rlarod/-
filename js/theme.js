/* =========================================================================
 * js/theme.js — App.Theme
 * =========================================================================
 * 밝은 모드 / 다크모드 전환.
 *
 * 색은 style.css의 CSS 변수로 관리되고 있어서, html에 data-theme="dark"만
 * 붙이면 배경·글자·테두리가 한 번에 바뀝니다. 이 모듈은 그 속성을 켜고
 * 끄고, 고른 값을 저장했다가 다음 방문 때 그대로 복원하는 일만 합니다.
 *
 * 거래 데이터나 계산에는 전혀 관여하지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Theme = (function () {
  "use strict";

  const KEY = "theme";
  const DARK = "dark";
  const LIGHT = "light";

  function saved() {
    try {
      return localStorage.getItem(KEY);
    } catch (e) {
      return null; // 저장이 막혀 있어도 동작은 해야 합니다
    }
  }

  function store(v) {
    try {
      localStorage.setItem(KEY, v);
    } catch (e) {
      /* 저장 실패는 무시 — 이번 세션에만 적용됩니다 */
    }
  }

  function current() {
    return document.documentElement.getAttribute("data-theme") === DARK ? DARK : LIGHT;
  }

  function paintButton() {
    // 버튼에는 "누르면 무엇이 되는지"를 적습니다.
    const label = current() === DARK ? "밝은 모드" : "다크 모드";
    ["theme-toggle-btn", "header-theme-btn"].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) btn.textContent = label;
    });
  }

  function set(theme) {
    if (theme === DARK) document.documentElement.setAttribute("data-theme", DARK);
    else document.documentElement.removeAttribute("data-theme");
    store(theme);
    paintButton();
  }

  function toggle() {
    set(current() === DARK ? LIGHT : DARK);
  }

  /* 지금은 다크 하나로만 운영합니다.
     밝은 모드의 색 정의는 style.css 에 그대로 남아 있고, 전환 버튼만
     화면에서 감춰뒀습니다(마크업·코드는 보존). 밝은 모드를 새 디자인에
     맞게 다시 만들면 이 함수와 버튼 숨김만 되돌리면 됩니다.
     저장값이 light 여도 무시합니다 — 예전에 밝은 모드를 켜뒀던 사람이
     새 디자인이 적용되지 않은 화면을 보게 되기 때문입니다. */
  const DARK_ONLY = true;

  function initialTheme() {
    if (DARK_ONLY) return DARK;
    const s = saved();
    if (s === DARK || s === LIGHT) return s;
    try {
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return DARK;
    } catch (e) {
      /* 무시 */
    }
    return LIGHT;
  }

  function init() {
    set(initialTheme());

    // 버튼은 내 정보 패널 안에 있고, 패널은 값이 바뀔 때마다 다시 그려집니다.
    // 그래서 버튼에 직접 걸지 않고 상위 요소에 한 번만 위임합니다.
    const body = document.getElementById("user-panel-body");
    if (body && body.dataset.themeBound !== "1") {
      body.dataset.themeBound = "1";
      body.addEventListener("click", (e) => {
        const btn = e.target.closest ? e.target.closest("#theme-toggle-btn") : null;
        if (btn) toggle();
      });
    }
    // 헤더 버튼은 다시 그려지지 않으므로 직접 걸어도 됩니다.
    const headerBtn = document.getElementById("header-theme-btn");
    if (headerBtn) headerBtn.addEventListener("click", toggle);

    if (App.Bus) App.Bus.on("trading:update", paintButton);
    paintButton();
  }

  return { init, toggle, current, setForTest: set };
})();
