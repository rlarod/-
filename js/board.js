/* =========================================================================
 * js/board.js — App.Board
 * =========================================================================
 * 자유게시판. trading.js/auth.js/chat.js/leaderboard.js 등 기존 모듈은
 * 전혀 참조하지 않는 완전히 독립된 모듈입니다(App.Auth.getNickname()만
 * 예외적으로 화면 표시용으로 참조 — 다른 패널들도 이미 그렇게 함).
 *
 * ── 데이터 조회 함수(요구사항에서 지정한 이름 그대로) ─────────────────
 *   getPopularPosts() / getLatestPosts() / getPost() / createPost() /
 *   updatePost() / deletePost() / votePost()
 * 인기글/최신글 조회 함수를 분리해뒀기 때문에, 나중에 메인 화면에
 * "오늘의 인기글" 위젯을 따로 붙이고 싶으면 이 함수들을 그대로
 * 재사용하면 됩니다.
 *
 * ── 좋아요/싫어요 개수는 여기서 계산하지 않음 ─────────────────────────
 * posts_with_meta 뷰(서버)가 이미 계산해서 내려줍니다 — 클라이언트가
 * 개수를 직접 조작할 방법 자체가 없습니다(schema-board.sql 참고).
 *
 * ── 조회수 중복 방지 ────────────────────────────────────────────────
 * increment_post_view() RPC(서버)가 10분 이내 재조회는 무시합니다.
 * ========================================================================= */

window.App = window.App || {};

App.Board = (function () {
  "use strict";

  const PAGE_SIZE = 20;
  const POPULAR_POST_LIKE_THRESHOLD = 10; // 상수로 관리 — 나중에 쉽게 바꿀 수 있게

  let dom = {};
  let currentView = "list"; // "list" | "write" | "detail"
  let editingPostId = null; // null이면 새 글 작성, 값이 있으면 수정 모드
  let currentDetailPost = null;
  let latestOffset = 0;
  let myVoteOnCurrentPost = null; // "LIKE" | "DISLIKE" | null

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }
  async function getUserId(client) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return data.session.user.id;
    } catch (e) {
      return null;
    }
  }
  function escapeHtml(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }
  function fmtRelativeTime(iso) {
    const diffMs = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return "방금 전";
    if (min < 60) return min + "분 전";
    const hr = Math.floor(min / 60);
    if (hr < 24) return hr + "시간 전";
    const day = Math.floor(hr / 24);
    if (day < 7) return day + "일 전";
    const d = new Date(iso);
    return (d.getMonth() + 1) + "/" + d.getDate();
  }

  /* ---------------- 데이터 함수 ---------------- */
  async function getPopularPosts() {
    const client = sb();
    if (!client) return [];
    const { data, error } = await client
      .from("posts_with_meta")
      .select("*")
      .gte("like_count", POPULAR_POST_LIKE_THRESHOLD)
      .order("like_count", { ascending: false })
      .limit(5);
    if (error) {
      console.warn("[board.js] 인기글 조회 실패:", error);
      return [];
    }
    return data || [];
  }

  async function getLatestPosts(offset) {
    const client = sb();
    if (!client) return [];
    const { data, error } = await client
      .from("posts_with_meta")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      console.warn("[board.js] 최신글 조회 실패:", error);
      return [];
    }
    return data || [];
  }

  async function getPost(postId) {
    const client = sb();
    if (!client) return null;
    const { data, error } = await client.from("posts_with_meta").select("*").eq("id", postId).maybeSingle();
    if (error) {
      console.warn("[board.js] 게시글 조회 실패:", error);
      return null;
    }
    return data;
  }

  async function createPost(title, content) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const userId = await getUserId(client);
    if (!userId) return { ok: false, error: "로그인 후 이용할 수 있습니다." };
    const { data, error } = await client.from("posts").insert({ user_id: userId, title, content }).select().single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, post: data };
  }

  async function updatePost(postId, title, content) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const { error } = await client.from("posts").update({ title, content, updated_at: new Date().toISOString() }).eq("id", postId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function deletePost(postId) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const { error } = await client.from("posts").delete().eq("id", postId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  // voteType: "LIKE" | "DISLIKE" | null(취소)
  async function votePost(postId, voteType) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const userId = await getUserId(client);
    if (!userId) return { ok: false, error: "로그인 후 이용할 수 있습니다." };

    if (voteType === null) {
      const { error } = await client.from("post_votes").delete().eq("post_id", postId).eq("user_id", userId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }
    const { error } = await client.from("post_votes").upsert({ post_id: postId, user_id: userId, vote_type: voteType }, { onConflict: "post_id,user_id" });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function getMyVote(postId) {
    const client = sb();
    if (!client) return null;
    const userId = await getUserId(client);
    if (!userId) return null;
    const { data } = await client.from("post_votes").select("vote_type").eq("post_id", postId).eq("user_id", userId).maybeSingle();
    return data ? data.vote_type : null;
  }

  async function getComments(postId) {
    const client = sb();
    if (!client) return [];
    const { data, error } = await client
      .from("post_comments")
      .select("*, profiles(nickname)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("[board.js] 댓글 조회 실패:", error);
      return [];
    }
    return data || [];
  }

  async function createComment(postId, content) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const userId = await getUserId(client);
    if (!userId) return { ok: false, error: "로그인 후 이용할 수 있습니다." };
    const { error } = await client.from("post_comments").insert({ post_id: postId, user_id: userId, content });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  async function deleteComment(commentId) {
    const client = sb();
    if (!client) return { ok: false, error: "서버 연결을 사용할 수 없습니다." };
    const { error } = await client.from("post_comments").delete().eq("id", commentId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  /* ---------------- 화면 전환 ---------------- */
  function showView(view) {
    currentView = view;
    if (dom.listView) dom.listView.style.display = view === "list" ? "" : "none";
    if (dom.writeView) dom.writeView.style.display = view === "write" ? "" : "none";
    if (dom.detailView) dom.detailView.style.display = view === "detail" ? "" : "none";
  }

  /* ---------------- 목록 렌더 ---------------- */
  function renderPopular(posts) {
    if (!dom.popularSection || !dom.popularList) return;
    if (!posts.length) {
      dom.popularSection.style.display = "none";
      return;
    }
    dom.popularSection.style.display = "";
    dom.popularList.innerHTML = posts
      .map((p) => '<div class="board-popular-item" data-id="' + p.id + '">🔥 ' + escapeHtml(p.title) + ' <span class="board-mini-stat">👍' + p.like_count + "</span></div>")
      .join("");
    dom.popularList.querySelectorAll(".board-popular-item").forEach((elm) => {
      elm.addEventListener("click", () => openDetail(elm.dataset.id));
    });
  }

  function renderList(posts, append) {
    if (!dom.listBody) return;
    const rowsHtml = posts
      .map((p) => {
        const isPopular = p.like_count >= POPULAR_POST_LIKE_THRESHOLD;
        return (
          '<tr class="board-row" data-id="' + p.id + '">' +
          "<td style=\"text-align:left;\">" + (isPopular ? '<span class="board-hot-badge">🔥</span> ' : "") + escapeHtml(p.title) + "</td>" +
          "<td>" + escapeHtml(p.author_nickname) + "</td>" +
          "<td>👍 " + p.like_count + "</td>" +
          "<td>💬 " + p.comment_count + "</td>" +
          "<td>" + p.view_count + "</td>" +
          "<td>" + fmtRelativeTime(p.created_at) + "</td>" +
          "</tr>"
        );
      })
      .join("");
    dom.listBody.innerHTML = append ? dom.listBody.innerHTML + rowsHtml : rowsHtml;
    dom.listBody.querySelectorAll(".board-row").forEach((row) => {
      row.addEventListener("click", () => openDetail(row.dataset.id));
    });
    if (!append && posts.length === 0) {
      dom.listBody.innerHTML = '<tr class="empty"><td colspan="6">아직 게시글이 없습니다. 첫 글을 남겨보세요!</td></tr>';
    }
    if (dom.loadMoreBtn) dom.loadMoreBtn.style.display = posts.length < PAGE_SIZE ? "none" : "";
  }

  async function loadList(reset) {
    if (reset) latestOffset = 0;
    const [popular, latest] = await Promise.all([reset ? getPopularPosts() : Promise.resolve(null), getLatestPosts(latestOffset)]);
    if (popular) renderPopular(popular);
    renderList(latest, !reset);
    latestOffset += latest.length;
  }

  /* ---------------- 작성/수정 화면 ---------------- */
  function openWrite(post) {
    editingPostId = post ? post.id : null;
    if (dom.titleInput) dom.titleInput.value = post ? post.title : "";
    if (dom.contentInput) dom.contentInput.value = post ? post.content : "";
    if (dom.writeErr) dom.writeErr.textContent = "";
    showView("write");
  }

  async function submitWrite() {
    const title = (dom.titleInput.value || "").trim();
    const content = (dom.contentInput.value || "").trim();
    if (dom.writeErr) dom.writeErr.textContent = "";
    if (!title) {
      if (dom.writeErr) dom.writeErr.textContent = "제목을 입력해주세요.";
      return;
    }
    if (!content) {
      if (dom.writeErr) dom.writeErr.textContent = "내용을 입력해주세요.";
      return;
    }
    dom.writeSubmitBtn.disabled = true;
    try {
      const result = editingPostId ? await updatePost(editingPostId, title, content) : await createPost(title, content);
      if (!result.ok) {
        if (dom.writeErr) dom.writeErr.textContent = result.error || "저장에 실패했습니다.";
        return;
      }
      if (editingPostId) {
        await openDetail(editingPostId);
      } else {
        showView("list");
        loadList(true);
      }
    } finally {
      dom.writeSubmitBtn.disabled = false;
    }
  }

  /* ---------------- 상세 화면 ---------------- */
  function renderComments(comments) {
    if (!dom.commentsList) return;
    const client = sb();
    const myUserIdPromise = client ? getUserId(client) : Promise.resolve(null);
    myUserIdPromise.then((myId) => {
      if (!comments.length) {
        dom.commentsList.innerHTML = '<div class="board-empty-comment">아직 댓글이 없습니다.</div>';
        return;
      }
      dom.commentsList.innerHTML = comments
        .map((c) => {
          const nick = c.profiles ? c.profiles.nickname : "(알수없음)";
          const isMine = myId && c.user_id === myId;
          return (
            '<div class="board-comment-item">' +
            '<div class="board-comment-meta"><span class="chat-msg-nick">' + escapeHtml(nick) + "</span>" +
            '<span class="chat-msg-time">' + fmtRelativeTime(c.created_at) + "</span>" +
            (isMine ? '<button class="board-comment-delete-btn" data-id="' + c.id + '">삭제</button>' : "") +
            "</div>" +
            '<div class="board-comment-text">' + escapeHtml(c.content) + "</div>" +
            "</div>"
          );
        })
        .join("");
      dom.commentsList.querySelectorAll(".board-comment-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("댓글을 삭제하시겠습니까?")) return;
          await deleteComment(btn.dataset.id);
          const updated = await getComments(currentDetailPost.id);
          renderComments(updated);
        });
      });
    });
  }

  async function openDetail(postId) {
    const client = sb();
    if (client) {
      try {
        await client.rpc("increment_post_view", { p_post_id: postId });
      } catch (e) {
        console.warn("[board.js] 조회수 반영 실패(무시하고 계속):", e);
      }
    }
    const post = await getPost(postId);
    if (!post) return;
    currentDetailPost = post;
    myVoteOnCurrentPost = await getMyVote(postId);

    if (dom.detailTitle) dom.detailTitle.textContent = post.title;
    if (dom.detailMeta) dom.detailMeta.textContent = post.author_nickname + " · " + fmtRelativeTime(post.created_at) + " · 조회 " + post.view_count;
    if (dom.detailContent) dom.detailContent.textContent = post.content;
    if (dom.likeCount) dom.likeCount.textContent = post.like_count;
    if (dom.dislikeCount) dom.dislikeCount.textContent = post.dislike_count;
    updateVoteButtonStyles();

    const client2 = sb();
    const myId = client2 ? await getUserId(client2) : null;
    const isOwner = myId && post.user_id === myId;
    if (dom.ownerActions) dom.ownerActions.style.display = isOwner ? "" : "none";

    const comments = await getComments(postId);
    renderComments(comments);

    showView("detail");
  }

  function updateVoteButtonStyles() {
    if (dom.likeBtn) dom.likeBtn.classList.toggle("board-vote-active", myVoteOnCurrentPost === "LIKE");
    if (dom.dislikeBtn) dom.dislikeBtn.classList.toggle("board-vote-active", myVoteOnCurrentPost === "DISLIKE");
  }

  async function handleVote(type) {
    const newVote = myVoteOnCurrentPost === type ? null : type; // 같은 걸 다시 누르면 취소
    const result = await votePost(currentDetailPost.id, newVote);
    if (!result.ok) {
      alert(result.error || "투표에 실패했습니다.");
      return;
    }
    myVoteOnCurrentPost = newVote;
    const post = await getPost(currentDetailPost.id);
    if (post) {
      currentDetailPost = post;
      if (dom.likeCount) dom.likeCount.textContent = post.like_count;
      if (dom.dislikeCount) dom.dislikeCount.textContent = post.dislike_count;
    }
    updateVoteButtonStyles();
  }

  async function submitComment() {
    const content = (dom.commentInput.value || "").trim();
    if (!content) return;
    dom.commentSubmitBtn.disabled = true;
    try {
      const result = await createComment(currentDetailPost.id, content);
      if (!result.ok) {
        alert(result.error || "댓글 작성에 실패했습니다.");
        return;
      }
      dom.commentInput.value = "";
      const comments = await getComments(currentDetailPost.id);
      renderComments(comments);
    } finally {
      dom.commentSubmitBtn.disabled = false;
    }
  }

  /* ---------------- 이벤트 바인딩 ---------------- */
  function bindEvents() {
    if (dom.writeBtn) dom.writeBtn.addEventListener("click", () => openWrite(null));
    if (dom.writeCancelBtn) dom.writeCancelBtn.addEventListener("click", () => (editingPostId ? openDetail(editingPostId) : showView("list")));
    if (dom.writeSubmitBtn) dom.writeSubmitBtn.addEventListener("click", submitWrite);
    if (dom.loadMoreBtn) dom.loadMoreBtn.addEventListener("click", () => loadList(false));
    if (dom.backBtn) dom.backBtn.addEventListener("click", () => { showView("list"); loadList(true); });
    if (dom.editBtn) dom.editBtn.addEventListener("click", () => openWrite(currentDetailPost));
    if (dom.deleteBtn) {
      dom.deleteBtn.addEventListener("click", async () => {
        if (!confirm("게시글을 삭제하시겠습니까?")) return;
        const result = await deletePost(currentDetailPost.id);
        if (!result.ok) {
          alert(result.error || "삭제에 실패했습니다.");
          return;
        }
        showView("list");
        loadList(true);
      });
    }
    if (dom.likeBtn) dom.likeBtn.addEventListener("click", () => handleVote("LIKE"));
    if (dom.dislikeBtn) dom.dislikeBtn.addEventListener("click", () => handleVote("DISLIKE"));
    if (dom.commentSubmitBtn) dom.commentSubmitBtn.addEventListener("click", submitComment);
    if (dom.commentInput) {
      dom.commentInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submitComment();
      });
    }
  }

  function init() {
    dom = {
      listView: el("board-list-view"),
      writeView: el("board-write-view"),
      detailView: el("board-detail-view"),
      writeBtn: el("board-write-btn"),
      popularSection: el("board-popular-section"),
      popularList: el("board-popular-list"),
      listBody: el("board-list-body"),
      loadMoreBtn: el("board-load-more-btn"),
      titleInput: el("board-title-input"),
      contentInput: el("board-content-input"),
      writeErr: el("board-write-err"),
      writeCancelBtn: el("board-write-cancel-btn"),
      writeSubmitBtn: el("board-write-submit-btn"),
      backBtn: el("board-back-btn"),
      detailTitle: el("board-detail-title"),
      detailMeta: el("board-detail-meta"),
      detailContent: el("board-detail-content"),
      ownerActions: el("board-detail-owner-actions"),
      editBtn: el("board-edit-btn"),
      deleteBtn: el("board-delete-btn"),
      likeBtn: el("board-like-btn"),
      dislikeBtn: el("board-dislike-btn"),
      likeCount: el("board-like-count"),
      dislikeCount: el("board-dislike-count"),
      commentsList: el("board-comments-list"),
      commentInput: el("board-comment-input"),
      commentSubmitBtn: el("board-comment-submit-btn"),
    };
    if (!dom.listView) return; // 패널 DOM 없으면 조용히 종료

    bindEvents();
    showView("list");
    loadList(true);
  }

  return { init, getPopularPosts, getLatestPosts, getPost, createPost, updatePost, deletePost, votePost, openDetail };
})();
