/* =========================================================================
 * js/currency-refresh.js — App.CurrencyRefresh
 * =========================================================================
 * 통화를 바꿨을 때 같이 갱신되지 않던 화면들을 다시 그립니다.
 *
 * ── 무엇이 문제인가 ────────────────────────────────────────────────────
 * js/config.js 가 통화를 바꾸면 'currency:change' 를 방송합니다.
 * 그런데 그 신호를 듣지 않는 화면이 있습니다.
 *
 *   듣는 곳   차트, 랭킹, 내 정보 패널, 포지션표, MARKET WAR
 *   안 듣는 곳 마이페이지, 주문정보 패널, 거래내역
 *
 * 그래서 원화로 바꿔도 마이페이지 숫자는 USDT 그대로 남습니다.
 * 실측: 원화 모드로 바꿨는데 총자산이 100,161.67 로 동일했습니다.
 * 환율이 1,500 이니 원화면 1억 5천만 원대로 보여야 맞습니다.
 *
 * 같은 화면에 원화와 USDT 가 섞여 보이면 사용자가 자기 자산을
 * 잘못 판단합니다.
 *
 * ── 어떻게 고치나 ──────────────────────────────────────────────────────
 * 각 모듈은 이미 "지금 값으로 다시 그리는" 방법을 갖고 있습니다.
 * 통화가 바뀌면 그 방법을 한 번 더 불러주기만 하면 됩니다.
 *   마이페이지·주문정보 패널 -> trading:update 를 다시 흘려보냅니다
 *                              (두 모듈 다 그 이벤트로 그립니다)
 *   거래내역                 -> render() 를 다시 부릅니다
 *
 * 값을 새로 계산하지 않습니다. 표시만 다시 그립니다.
 * 해당 모듈들은 건드리지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.CurrencyRefresh = (function () {
  "use strict";

  function repaint() {
    /* 마이페이지·주문정보 패널은 trading:update 로 그립니다.
       지금 값을 그대로 한 번 더 흘려보내면 새 통화로 다시 그려집니다. */
    try {
      if (App.Bus && App.Trading && typeof App.Trading.getSnapshot === "function") {
        App.Bus.emit("trading:update", App.Trading.getSnapshot());
      }
    } catch (e) {
      console.warn("[currency-refresh.js] 자산 화면 갱신 실패:", e);
    }

    /* 거래내역은 trading:persisted 로 다시 불러와 그립니다.
       (render 를 밖으로 내주지 않아서 이 이벤트를 씁니다) */
    try {
      if (App.Bus && App.Trading && typeof App.Trading.getSnapshot === "function") {
        App.Bus.emit("trading:persisted", App.Trading.getSnapshot());
      }
    } catch (e) {
      console.warn("[currency-refresh.js] 거래내역 갱신 실패:", e);
    }
  }


  /* =======================================================================
   * (2) 표시 통화를 <html data-cur="..."> 로 알려줍니다   2026-08-27 디자인팀
   * =======================================================================
   * 왜 필요한가 — 원화는 자릿수가 훨씬 깁니다.
   *   1440 실측  USDT "79,458.20"     가격칸 93.8px / 한 줄(24px) / 행 34px
   *              원   "119,220,900원" 가격칸 117px 인데 글자는 135.3px 이라
   *                                   "원" 이 둘째 줄로 밀려 칸 48px / 행 58px
   * CSS 는 글자 내용을 볼 수 없어서 "지금 원화인지" 를 알 방법이 없습니다.
   * 그래서 통화 이름만 최상위 요소에 붙여 두고, 좁히는 일은 style.css 가 합니다.
   *
   * 값·계산·이벤트를 건드리지 않습니다. 화면에 붙는 표시용 표식 하나뿐입니다.
   * 되돌리려면 이 함수와 init 의 호출 두 줄을 지우면 됩니다.
   * ===================================================================== */
  function currentCurrency() {
    try {
      if (App.Config && typeof App.Config.getDisplayCurrency === "function") {
        return App.Config.getDisplayCurrency() || "USDT";
      }
    } catch (e) { /* 못 읽으면 기본값 */ }
    return "USDT";
  }

  function markCurrency() {
    try {
      document.documentElement.setAttribute("data-cur", currentCurrency());
    } catch (e) {
      /* 표식을 못 붙여도 화면은 그대로 동작합니다 */
    }
  }

  /* =======================================================================
   * (3) 시세 바 "마크가격" 의 통화 표기를 옆 항목과 맞춥니다   2026-08-27
   * =======================================================================
   * 무엇이 어긋났나 (1440 실측)
   *   원화 모드  현재가 ₩119,220,150 · 24H 고가 ₩120,749,850  ← 기호가 앞
   *              마크가격 119,223,981원                        ← 단위가 뒤
   *   USDT 모드  현재가 $79,419.70 · 24H 고가 $80,499.90       ← 기호가 앞
   *              마크가격 79,414.00                            ← 통화 표시 없음
   *
   * 왜 여기서 고치나 — 마크가격을 쓰는 곳은 js/chart.js:119 인데
   * **수정 금지 12개 파일** 입니다. 그래서 그 파일을 열지 않고, 이미 찍힌
   * 글자의 통화 표기만 바깥에서 옆 항목과 같은 모양으로 고쳐 씁니다.
   * 숫자는 한 글자도 바꾸지 않습니다 (표기 자리만 옮깁니다).
   *
   * 무한 루프가 없는 이유 — 이미 맞는 모양이면 아무것도 쓰지 않습니다.
   * "-" 같은 자리표시자처럼 숫자로 시작하지 않는 글자는 건드리지 않습니다.
   * 되돌리려면 아래 두 함수와 init 의 호출을 지우면 됩니다.
   * ===================================================================== */
  var markObserver = null;

  function fixMarkPriceUnit() {
    var e = document.getElementById("stat-mark-price");
    if (!e) return;
    var t = (e.textContent || "").trim();
    if (!t) return;
    var sign = currentCurrency() === "KRW" ? "₩" : "$";
    if (t.charAt(0) === sign) return;   /* 이미 맞음 → 한 글자도 안 씁니다 */
    /* 통화를 막 바꾼 직후 1~3초는 이전 통화 값이 남아 있습니다 — 마크가격은
       funding:update 가 올 때만 새로 찍히기 때문입니다(이 모듈 이전부터 그랬습니다).
       그 값은 "이전 통화 기준" 이 맞으므로 기호를 그대로 둡니다. 다음 갱신에
       새 통화 값이 오면 그때 새 기호가 붙습니다. 기호를 뗐다 붙이면 관찰자가
       자기 글씨를 다시 보고 틀린 기호를 붙일 수 있어 그렇게 하지 않습니다. */
    if (!/^[0-9]/.test(t)) return;      /* 숫자로 시작하지 않으면 그대로 둡니다 */
    var want = sign + t.replace(/원$/, "");
    if (e.textContent !== want) e.textContent = want;
  }

  function watchMarkPrice() {
    if (markObserver || typeof MutationObserver !== "function") return;
    /* #stat-mark-price 는 js/chart.js 가 나중에 만들어 넣습니다. 그래서
       시세 바를 보고 있다가 생기는 순간과 값이 바뀔 때마다 맞춥니다. */
    var bar = document.querySelector(".stats-bar");
    if (!bar) return;
    markObserver = new MutationObserver(fixMarkPriceUnit);
    markObserver.observe(bar, { childList: true, subtree: true, characterData: true });
    fixMarkPriceUnit();
  }

  function init() {
    markCurrency();
    watchMarkPrice();
    if (!App.Bus || typeof App.Bus.on !== "function") return;
    App.Bus.on("currency:change", repaint);
    App.Bus.on("currency:change", markCurrency);
    App.Bus.on("currency:change", fixMarkPriceUnit);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { init: init, repaint: repaint, markCurrency: markCurrency, fixMarkPriceUnit: fixMarkPriceUnit };
})();
