/* =========================================================================
 * js/nickname-rules.js — App.NicknameRules
 * =========================================================================
 * 닉네임 규칙을 한 곳에 모읍니다.
 *
 * ── 지금까지의 문제 ────────────────────────────────────────────────────
 * js/auth.js 는 '비었는지'와 '12자 이내인지'만 봅니다.
 * 그래서 이런 닉네임이 다 통과했습니다.
 *     "   "          공백만
 *     "김 갱"         중간 공백
 *     "★★관리자★★"    특수문자 + 사칭
 *     "시발"          욕설
 *     "a"            한 글자
 *
 * 닉네임은 랭킹·게시판·채팅에 그대로 노출되는 이름이라,
 * 한 번 잘못 만들어지면 운영이 곤란해집니다.
 *
 * ── 어떻게 막나 ────────────────────────────────────────────────────────
 * js/auth.js 는 수정 금지라 손대지 않습니다.
 * 가입 버튼을 캡처 단계에서 가로채, 규칙에 어긋나면 진행을 멈추고
 * 이유를 알려줍니다.
 *
 * 화면 검사만으로는 우회할 수 있으므로, 같은 규칙을 서버에도
 * 넣습니다(supabase/schema-nickname-rules.sql).
 * 이 파일의 규칙과 그 SQL 은 같은 내용이어야 합니다.
 * ========================================================================= */

window.App = window.App || {};

App.NicknameRules = (function () {
  "use strict";

  var MIN_LEN = 2;
  var MAX_LEN = 12;

  /* 허용: 한글, 영문, 숫자, 밑줄(_) 
     막음: 공백, 특수문자, 이모지 */
  var ALLOWED = /^[가-힣a-zA-Z0-9_]+$/;

  /* 자음·모음만 있는 닉네임(ㅋㅋㅋ, ㅏㅏㅏ)도 막습니다. */
  var JAMO_ONLY = /^[ㄱ-ㅎㅏ-ㅣ]+$/;

  /* 욕설·비속어. 서버 목록과 같아야 합니다.
     완벽할 수는 없지만 흔한 것은 걸러냅니다. */
  var BANNED_WORDS = [
    "시발", "씨발", "씨팔", "시바", "병신", "ㅅㅂ", "ㅂㅅ", "좆", "존나",
    "개새", "새끼", "지랄", "닥쳐", "꺼져", "죽어",
    "fuck", "shit", "bitch", "asshole",
  ];

  /* 사칭·혼동을 막습니다. */
  var RESERVED = [
    "관리자", "운영자", "admin", "administrator", "master", "root",
    "tl", "트레이딩리그", "tradingleague", "공지", "notice", "system", "시스템",
    "봇", "bot", "탈퇴", "익명",
  ];

  function normalize(v) {
    return String(v == null ? "" : v).trim();
  }

  /* 규칙 검사. 통과하면 { ok: true }, 아니면 이유를 담아 돌려줍니다. */
  function check(raw) {
    var n = normalize(raw);

    if (!n) return { ok: false, reason: "empty", message: "닉네임을 입력해주세요." };

    if (n.length < MIN_LEN) {
      return { ok: false, reason: "too_short", message: "닉네임은 " + MIN_LEN + "자 이상이어야 합니다." };
    }
    if (n.length > MAX_LEN) {
      return { ok: false, reason: "too_long", message: "닉네임은 " + MAX_LEN + "자 이내로 입력해주세요." };
    }

    /* 중간 공백도 막습니다(앞뒤 공백은 위에서 이미 잘렸습니다). */
    if (/\s/.test(n)) {
      return { ok: false, reason: "has_space", message: "닉네임에는 공백을 넣을 수 없습니다." };
    }

    if (!ALLOWED.test(n)) {
      return { ok: false, reason: "bad_char", message: "닉네임은 한글, 영문, 숫자, 밑줄(_)만 쓸 수 있습니다." };
    }

    if (JAMO_ONLY.test(n)) {
      return { ok: false, reason: "jamo_only", message: "자음·모음만으로는 닉네임을 만들 수 없습니다." };
    }

    var lower = n.toLowerCase();

    for (var i = 0; i < BANNED_WORDS.length; i++) {
      if (lower.indexOf(BANNED_WORDS[i].toLowerCase()) !== -1) {
        return { ok: false, reason: "banned", message: "사용할 수 없는 표현이 들어 있습니다." };
      }
    }

    for (var j = 0; j < RESERVED.length; j++) {
      if (lower === RESERVED[j].toLowerCase()) {
        return { ok: false, reason: "reserved", message: "이 닉네임은 사용할 수 없습니다." };
      }
    }

    return { ok: true, nickname: n };
  }

  /* ---------------- 가입 버튼 가로채기 ---------------- */
  function showError(msg) {
    /* 내 정보 칸의 로그인 폼과 원래 폼 둘 다에 표시합니다. */
    var boxes = [document.getElementById("up-login-err"), document.getElementById("auth-err")];
    boxes.forEach(function (b) { if (b) b.textContent = msg; });
    if (!boxes.some(Boolean)) alert(msg);
  }

  function guardOne(inputId, buttonId) {
    var btn = document.getElementById(buttonId);
    var input = document.getElementById(inputId);
    if (!btn || !input || btn.getAttribute("data-nick-guarded")) return;
    btn.setAttribute("data-nick-guarded", "1");

    btn.addEventListener(
      "click",
      function (e) {
        /* 회원가입 모드일 때만 검사합니다. 로그인은 기존 닉네임을 쓰므로
           규칙이 바뀌어도 기존 회원이 못 들어오면 안 됩니다. */
        var label = (btn.textContent || "").trim();
        if (label.indexOf("회원가입") === -1) return;

        var r = check(input.value);
        if (r.ok) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showError(r.message);
      },
      true // 캡처 단계 — auth.js 처리보다 먼저
    );
  }

  function attach() {
    guardOne("up-login-nick", "up-login-submit");   // 내 정보 칸의 폼
    guardOne("auth-nickname-input", "auth-submit-btn"); // 원래 폼
  }

  function init() {
    attach();
    /* 폼이 다시 그려질 수 있으므로 몇 번 더 걸어둡니다. */
    setTimeout(attach, 1500);
    setTimeout(attach, 4000);
    setInterval(attach, 5000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    check: check,
    normalize: normalize,
    MIN_LEN: MIN_LEN,
    MAX_LEN: MAX_LEN,
    BANNED_WORDS: BANNED_WORDS,
    RESERVED: RESERVED,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.NicknameRules;
