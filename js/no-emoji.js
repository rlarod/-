/* =========================================================================
 * js/no-emoji.js — App.NoEmoji
 * =========================================================================
 * 화면에서 이모지를 걷어냅니다 (2026-08-25 대표 지시 · 화면 개편 1순위).
 *
 * 왜 — 바이낸스 같은 전문 트레이딩 화면에는 이모지가 한 개도 없습니다.
 *      "무료 사이트" 신호이고, 기기마다 그림 모양도 다르게 나옵니다.
 *
 * ── 이 파일이 필요한 이유 ────────────────────────────────────────────────
 * index.html 과 일반 모듈의 이모지는 그 자리에서 지웠습니다. 그런데 아래
 * 네 개는 "수정 금지 12개 파일" 이라 한 글자도 건드릴 수 없습니다.
 *
 *   js/board.js       인기글 앞 🔥 / 인기 배지 🔥 / 추천수 👍 / 댓글수 💬
 *   js/chat.js        거래 알림 줄 앞 ⚡
 *   js/leaderboard.js 1·2·3위 배지 🥇 🥈 🥉
 *   js/season.js      시즌 초기화 안내 🔄
 *
 * 그래서 원본은 그대로 두고, 그 파일들이 DOM 을 그린 "뒤에" 글자만 고칩니다
 * (docs/인계문서.md 1-1 의 "DOM 후처리 + MutationObserver" 패턴).
 * 목록은 다시 그려질 때마다 새로 붙으므로 MutationObserver 로 계속 지킵니다.
 *
 * ── 건드리지 않는 것 ────────────────────────────────────────────────────
 * · 회원이 쓴 글(제목·본문·댓글·채팅 내용) 은 손대지 않습니다.
 *   회원이 이모지를 썼으면 그건 그 사람의 글입니다.
 *   그래서 "화면 전체에서 이모지 제거" 가 아니라, 아래 표에 적은
 *   자리(선택자)만, 적어둔 방식대로 고칩니다.
 * · 숫자 옆 화살표(▲▼), ₿, ›, · 같은 기능 기호는 이모지가 아니라 그대로 둡니다.
 * · 마크업을 지우거나 옮기지 않습니다. 글자만 바꿉니다.
 *
 * 되돌리기 — index.html 에서 <script src="js/no-emoji.js"></script> 한 줄과
 *            main.js 부팅 목록의 "NoEmoji" 한 줄을 지우면 즉시 원래대로
 *            돌아갑니다(원본 파일은 하나도 안 고쳤기 때문입니다).
 * ========================================================================= */

window.App = window.App || {};

App.NoEmoji = (function () {
  "use strict";

  /* 그림문자(이모지) 범위. 화살표(↑↓▲▼)·통화기호·괄호는 일부러 뺐습니다. */
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu;

  function hasEmoji(s) {
    EMOJI.lastIndex = 0;
    return EMOJI.test(s);
  }

  /* 텍스트 노드에서 이모지만 빼고 남은 공백을 정리합니다. */
  function clean(s) {
    return s.replace(EMOJI, "").replace(/\s{2,}/g, " ");
  }

  /* -----------------------------------------------------------------------
   * 고칠 자리 표
   *   sel : 어디를
   *   fix : 어떻게 (elm 을 받아 고칩니다. 고쳤으면 true)
   * --------------------------------------------------------------------- */
  const RULES = [
    /* js/board.js — 인기글 배지. 원래 내용이 🔥 하나뿐이라 글자 HOT 으로 바꿉니다.
       (배지 자리를 비우면 제목이 왼쪽으로 붙어 줄이 흔들립니다) */
    {
      sel: ".board-hot-badge",
      fix(el) {
        const t = (el.textContent || "").trim();
        if (!hasEmoji(t)) return false;
        el.textContent = clean(t).trim() || "HOT";
        return true;
      },
    },

    /* js/board.js — 인기글 한 줄. "🔥 " 는 맨 앞 표시일 뿐이고 그 뒤는 회원이
       쓴 제목입니다. 그래서 맨 앞 표시 하나만 떼고 제목은 그대로 둡니다. */
    {
      sel: ".board-popular-item",
      fix(el) {
        const first = el.firstChild;
        if (!first || first.nodeType !== 3) return false;
        const v = first.nodeValue;
        const cut = v.replace(/^\s*[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]+\s*/u, "");
        if (cut === v) return false;
        first.nodeValue = cut;
        return true;
      },
    },

    /* js/board.js — 인기글 줄 끝의 "👍3". 뒤는 숫자뿐이라 안전합니다. */
    {
      sel: ".board-mini-stat",
      fix(el) {
        const t = el.textContent || "";
        if (!hasEmoji(t)) return false;
        el.textContent = "추천 " + clean(t).trim();
        return true;
      },
    },

    /* js/leaderboard.js · js/guest-leaderboard.js — "🥇 1위" → "1위".
       등수 글자는 그대로 남고, 색(금·은·동)은 원래 CSS 가 계속 칠합니다. */
    {
      sel: ".leaderboard-rank-badge",
      fix(el) {
        const t = el.textContent || "";
        if (!hasEmoji(t)) return false;
        el.textContent = clean(t).trim();
        return true;
      },
    },

    /* js/chat.js — 거래 알림 줄 앞의 ⚡.
       이 줄은 이미 배경색과 글자색으로 일반 대화와 구분됩니다
       (.chat-msg-event / .chat-event-liq). 그래서 표시를 없애도 구분이 남습니다.
       span 은 지우지 않고 비워만 둡니다. 빈 칸이 6px 벌어지는 것은
       style.css 의 .chat-event-icon:empty 한 줄이 막습니다. */
    {
      sel: ".chat-event-icon",
      fix(el) {
        if (!el.textContent) return false;
        if (!hasEmoji(el.textContent)) return false;
        el.textContent = "";
        return true;
      },
    },

    /* js/season.js — "🔄 새로운 시즌이 시작되었습니다." */
    {
      sel: ".season-reset-banner",
      fix(el) {
        const t = el.textContent || "";
        if (!hasEmoji(t)) return false;
        el.textContent = clean(t).trim();
        return true;
      },
    },
  ];

  function sweep(root) {
    const scope = root && root.querySelectorAll ? root : document;
    RULES.forEach((r) => {
      let list;
      try {
        list = scope.querySelectorAll(r.sel);
      } catch (e) {
        return;
      }
      list.forEach((el) => {
        try {
          r.fix(el);
        } catch (e) {
          /* 한 자리가 실패해도 나머지는 계속 고칩니다 */
        }
      });
      // 바뀐 노드 자신이 대상인 경우도 있습니다(행 하나만 갈아끼울 때).
      if (scope !== document && scope.matches && scope.matches(r.sel)) {
        try {
          r.fix(scope);
        } catch (e) {
          /* 무시 */
        }
      }
    });
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      sweep(document);
    });
  }

  function init() {
    sweep(document);
    const mo = new MutationObserver((records) => {
      for (const rec of records) {
        if (rec.addedNodes && rec.addedNodes.length) {
          schedule();
          return;
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    /* 늦게 그려지는 목록(서버 응답 뒤)도 확실히 잡습니다 */
    [400, 1200, 3000].forEach((ms) => setTimeout(() => sweep(document), ms));
  }

  return { init, sweep };
})();
