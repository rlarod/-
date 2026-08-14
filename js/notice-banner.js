/* =========================================================================
 * js/notice-banner.js — App.NoticeBanner
 * =========================================================================
 * 상단 공지/이벤트 배너. 순수 안내용 텍스트를 몇 초마다 돌려가며
 * 보여줍니다(개미톡 등 실제 거래소 사이트의 공지 배너 참고). 실제
 * 서버 데이터가 아니라 정적 문구 배열이라, 나중에 진짜 공지 기능이
 * 필요해지면 이 배열을 Supabase 조회로 바꾸기만 하면 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.NoticeBanner = (function () {
  "use strict";

  const MESSAGES = [
    "이 사이트는 실제 자금이 오가지 않는 모의투자 플랫폼입니다.",
    "🏆 랭킹은 청산된 거래(실현 손익) 기준으로만 계산됩니다.",
    "📝 자유게시판에서 다른 투자자들과 의견을 나눠보세요.",
    "⚔ 전쟁터에서 실시간 매수/매도 세력 대결을 구경해보세요.",
  ];
  const ROTATE_INTERVAL_MS = 5000;

  let idx = 0;
  let dom = {};
  let timer = null;

  function el(id) {
    return document.getElementById(id);
  }

  function render() {
    if (!dom.text) return;
    dom.text.textContent = MESSAGES[idx];
    idx = (idx + 1) % MESSAGES.length;
  }

  function init() {
    dom = { text: el("notice-banner-text") };
    if (!dom.text) return;
    render();
    timer = setInterval(render, ROTATE_INTERVAL_MS);
  }

  return { init };
})();
