/* =========================================================================
 * js/comment-fix.js — 댓글이 등록은 되는데 화면에 안 보이던 문제 수정
 * =========================================================================
 * 증상
 *   댓글을 쓰고 [등록]을 눌러도 계속 "아직 댓글이 없습니다."만 보임.
 *   입력칸은 비워지고 오류창도 안 뜸.
 *
 * 원인
 *   js/board.js 의 getComments() 가 댓글을 이렇게 읽습니다.
 *     .from("post_comments").select("*, profiles(nickname)")
 *   "profiles(nickname)" 은 PostgREST 임베드 문법인데, 두 테이블 사이에
 *   외래키가 있어야만 동작합니다. 그런데 post_comments.user_id 는
 *   auth.users(id) 만 참조하고, public.profiles 를 참조하는 외래키는
 *   스키마 전체에 하나도 없습니다.
 *     -> 조회가 PGRST200 으로 실패
 *     -> board.js 가 빈 배열을 반환 -> "아직 댓글이 없습니다."
 *   등록(INSERT)은 profiles 를 안 거치므로 정상입니다.
 *   그래서 지금까지 쓴 댓글은 DB 에 그대로 살아 있습니다.
 *
 * 해결
 *   js/board.js 는 수정 금지 파일이라 손대지 않습니다.
 *   대신 App.SupabaseClient.get() 이 돌려주는 클라이언트를 감싸서
 *   post_comments 조회에서만 "profiles(nickname)" 부분을 떼어내고,
 *   닉네임은 profiles 를 따로 한 번 조회해서 붙여 돌려줍니다.
 *   board.js 입장에서는 원래 기대하던 c.profiles.nickname 이 그대로 있습니다.
 *
 *   외래키를 나중에 추가해도(supabase/schema-comment-author-fk.sql)
 *   이 모듈은 그대로 잘 동작합니다. 둘 중 아무거나 하나만 있어도 됩니다.
 * ========================================================================= */

window.App = window.App || {};

App.CommentFix = (function () {
  "use strict";

  var EMBED_RE = /\s*,\s*profiles\s*\([^)]*\)/g;
  var LEADING_EMBED_RE = /^\s*profiles\s*\([^)]*\)\s*,\s*/;

  /* post_comments 조회에서 임베드를 떼고 닉네임을 따로 붙이도록 클라이언트를 감쌉니다. */
  function patchClient(client) {
    if (!client || client.__commentFixPatched) return client;
    if (typeof client.from !== "function") return client;
    client.__commentFixPatched = true;

    var origFrom = client.from.bind(client);

    /* 댓글 목록에 작성자 닉네임을 붙입니다. profiles 는 한 번만 조회합니다. */
    function attachNicknames(res) {
      if (!res || res.error || !Array.isArray(res.data) || !res.data.length) {
        return Promise.resolve(res);
      }
      var ids = [];
      res.data.forEach(function (row) {
        if (row && row.user_id && ids.indexOf(row.user_id) === -1) ids.push(row.user_id);
      });
      if (!ids.length) return Promise.resolve(res);

      return Promise.resolve(origFrom("profiles").select("id, nickname").in("id", ids))
        .then(function (profRes) {
          var map = Object.create(null);
          if (profRes && !profRes.error && Array.isArray(profRes.data)) {
            profRes.data.forEach(function (p) {
              map[p.id] = p.nickname;
            });
          }
          res.data.forEach(function (row) {
            if (!row.profiles) row.profiles = { nickname: map[row.user_id] || "(알수없음)" };
          });
          return res;
        })
        .catch(function (e) {
          /* 닉네임을 못 붙여도 댓글 자체는 보여야 합니다. */
          console.warn("[comment-fix.js] 닉네임 조회 실패 — 댓글은 그대로 표시합니다:", e);
          res.data.forEach(function (row) {
            if (!row.profiles) row.profiles = { nickname: "(알수없음)" };
          });
          return res;
        });
    }

    client.from = function (table) {
      var qb = origFrom(table);
      if (table !== "post_comments" || !qb || typeof qb.select !== "function") return qb;

      var origSelect = qb.select.bind(qb);
      qb.select = function (cols) {
        var args = Array.prototype.slice.call(arguments);
        if (typeof cols !== "string" || cols.indexOf("profiles") === -1) {
          return origSelect.apply(null, args);
        }
        var cleaned = cols.replace(EMBED_RE, "").replace(LEADING_EMBED_RE, "").trim();
        args[0] = cleaned || "*";

        var builder = origSelect.apply(null, args);
        if (!builder || typeof builder.then !== "function") return builder;

        /* .eq() / .order() 는 같은 객체를 돌려주므로 then 만 덮으면 됩니다. */
        var origThen = builder.then.bind(builder);
        builder.then = function (onFulfilled, onRejected) {
          return origThen(attachNicknames).then(onFulfilled, onRejected);
        };
        return builder;
      };
      return qb;
    };

    return client;
  }

  /* App.SupabaseClient.get() 을 감싸 둡니다. 클라이언트는 싱글턴이라 한 번만 적용됩니다. */
  function install() {
    if (!window.App || !App.SupabaseClient || typeof App.SupabaseClient.get !== "function") return false;
    if (App.SupabaseClient.__commentFixWrapped) return true;
    var origGet = App.SupabaseClient.get;
    App.SupabaseClient.get = function () {
      return patchClient(origGet.apply(App.SupabaseClient, arguments));
    };
    App.SupabaseClient.__commentFixWrapped = true;
    return true;
  }

  if (!install()) {
    /* supabase-client.js 보다 먼저 실행된 경우를 대비합니다. */
    var tries = 0;
    var timer = setInterval(function () {
      if (install() || ++tries > 100) clearInterval(timer);
    }, 100);
    document.addEventListener("DOMContentLoaded", install);
  }

  return { install: install, patchClient: patchClient };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.CommentFix;
