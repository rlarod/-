/* tests/comment-fix.test.js
 * 댓글 조회 우회(js/comment-fix.js)가 실제로 동작하는지 가짜 클라이언트로 검증합니다.
 * 실제 Supabase 에 붙지 않고, board.js 가 보내는 쿼리와 똑같은 모양으로 재현합니다. */
"use strict";

const fs = require("fs");
const path = require("path");
/* 2026-08-28 기록팀 — REPO 를 고정으로 박아두면 돌연변이 검증이 사본이 아니라
   진짜 저장소를 읽어서 "조용히 통과" 합니다. 실제로 두 번 속았습니다. */
const REPO = process.env.REPO || require("path").join(__dirname, "..");
const vm = require("vm");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \u001b[32m✓\u001b[0m " + name);
  } else {
    fail++;
    console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : ""));
  }
}

/* ---------- 가짜 Supabase 클라이언트 ---------- */
/* 실제 PostgREST 처럼: profiles 임베드가 들어오면 PGRST200 으로 실패시킵니다. */
function makeFakeClient(store) {
  const calls = [];
  function from(table) {
    const q = {
      _table: table,
      _cols: "*",
      _filters: [],
      select(cols) {
        this._cols = cols;
        calls.push({ table, cols });
        return this;
      },
      eq(col, val) {
        this._filters.push([col, "eq", val]);
        return this;
      },
      in(col, vals) {
        this._filters.push([col, "in", vals]);
        return this;
      },
      order() {
        return this;
      },
      then(onOk, onErr) {
        const self = this;
        return new Promise((resolve) => {
          if (typeof self._cols === "string" && self._cols.indexOf("profiles(") !== -1) {
            resolve({
              data: null,
              error: { code: "PGRST200", message: "Could not find a relationship between 'post_comments' and 'profiles'" },
            });
            return;
          }
          let rows = (store[self._table] || []).slice();
          self._filters.forEach(([col, op, val]) => {
            rows = rows.filter((r) => (op === "eq" ? r[col] === val : val.indexOf(r[col]) !== -1));
          });
          resolve({ data: rows.map((r) => Object.assign({}, r)), error: null });
        }).then(onOk, onErr);
      },
    };
    return q;
  }
  return { client: { from }, calls };
}

/* ---------- 모듈 로드 ---------- */
const src = fs.readFileSync(path.join(REPO, "js", "comment-fix.js"), "utf8");
const sandbox = {
  console,
  setInterval: () => 0,
  clearInterval: () => {},
  document: { addEventListener: () => {} },
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const CommentFix = sandbox.App.CommentFix;

/* ---------- 데이터 ---------- */
const store = {
  post_comments: [
    { id: "c1", post_id: "p1", user_id: "u1", content: "첫 댓글", created_at: "2026-08-18T01:00:00Z" },
    { id: "c2", post_id: "p1", user_id: "u2", content: "둘째 댓글", created_at: "2026-08-18T02:00:00Z" },
    { id: "c3", post_id: "p9", user_id: "u1", content: "다른 글 댓글", created_at: "2026-08-18T03:00:00Z" },
  ],
  profiles: [
    { id: "u1", nickname: "김갱" },
    { id: "u2", nickname: "박철" },
  ],
};

console.log("\n댓글 조회 우회 (js/comment-fix.js)");

(async () => {
  /* 1) 우회 전에는 실제로 실패하는지 — 진단이 맞는지부터 확인 */
  {
    const { client } = makeFakeClient(store);
    const res = await client.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1").order("created_at");
    ok("우회 전: profiles 임베드 조회가 PGRST200 으로 실패한다(원인 재현)", res.error && res.error.code === "PGRST200", JSON.stringify(res.error));
  }

  /* 2) 우회 후 — board.js 와 완전히 같은 호출 */
  const { client, calls } = makeFakeClient(store);
  CommentFix.patchClient(client);
  const res = await client.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1").order("created_at", { ascending: true });

  ok("우회 후: 오류 없이 조회된다", !res.error, JSON.stringify(res.error));
  ok("우회 후: 댓글 2건이 돌아온다", res.data && res.data.length === 2, res.data ? "실제 " + res.data.length + "건" : "data 없음");
  ok("post_id 필터가 그대로 적용된다(다른 글 댓글이 안 섞임)", res.data.every((c) => c.post_id === "p1"));
  ok("board.js 가 읽는 c.profiles.nickname 이 채워진다", res.data[0].profiles && res.data[0].profiles.nickname === "김갱", JSON.stringify(res.data[0].profiles));
  ok("두 번째 댓글 닉네임도 맞다", res.data[1].profiles && res.data[1].profiles.nickname === "박철", JSON.stringify(res.data[1].profiles));
  ok("본문·id·user_id 는 손대지 않는다", res.data[0].content === "첫 댓글" && res.data[0].id === "c1" && res.data[0].user_id === "u1");

  const commentSelect = calls.find((c) => c.table === "post_comments");
  ok("실제로 보낸 쿼리에서 profiles 임베드가 제거됐다", commentSelect && commentSelect.cols.indexOf("profiles") === -1, commentSelect && commentSelect.cols);
  ok("profiles 는 한 번만 따로 조회한다(N+1 아님)", calls.filter((c) => c.table === "profiles").length === 1, "실제 " + calls.filter((c) => c.table === "profiles").length + "회");

  /* 3) 프로필이 없는 작성자 */
  {
    const store2 = { post_comments: [{ id: "c9", post_id: "p1", user_id: "u404", content: "고아 댓글", created_at: "2026-08-18T04:00:00Z" }], profiles: [] };
    const { client: c2 } = makeFakeClient(store2);
    CommentFix.patchClient(c2);
    const r2 = await c2.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1");
    ok("프로필이 없는 작성자도 댓글은 보인다", r2.data && r2.data.length === 1 && r2.data[0].content === "고아 댓글");
    ok("프로필이 없으면 닉네임은 (알수없음)", r2.data[0].profiles.nickname === "(알수없음)", JSON.stringify(r2.data[0].profiles));
  }

  /* 4) 댓글이 하나도 없을 때 */
  {
    const { client: c3 } = makeFakeClient({ post_comments: [], profiles: [] });
    CommentFix.patchClient(c3);
    const r3 = await c3.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1");
    ok("댓글 0건이면 빈 배열 그대로(오류 아님)", !r3.error && Array.isArray(r3.data) && r3.data.length === 0);
  }

  /* 5) 다른 테이블·다른 쿼리는 건드리지 않는다 */
  {
    const { client: c4, calls: calls4 } = makeFakeClient(store);
    CommentFix.patchClient(c4);
    await c4.from("profiles").select("id, nickname");
    const r5 = await c4.from("post_comments").select("*").eq("post_id", "p1");
    ok("post_comments 외 테이블은 그대로 통과", calls4[0].table === "profiles" && calls4[0].cols === "id, nickname");
    ok("임베드를 안 쓴 post_comments 조회는 그대로 통과", !r5.error && r5.data.length === 2 && !r5.data[0].profiles);
  }

  /* 6) 두 번 적용해도 안전한지 */
  {
    const { client: c5, calls: calls5 } = makeFakeClient(store);
    CommentFix.patchClient(c5);
    CommentFix.patchClient(c5);
    const r6 = await c5.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1");
    ok("두 번 감싸도 결과가 같다(중복 적용 안전)", !r6.error && r6.data.length === 2 && r6.data[0].profiles.nickname === "김갱");
    ok("두 번 감싸도 profiles 조회는 한 번뿐", calls5.filter((c) => c.table === "profiles").length === 1);
  }

  /* 7) 외래키를 나중에 추가해서 임베드가 되살아나도 깨지지 않는지 */
  {
    const store7 = {
      post_comments: [{ id: "c1", post_id: "p1", user_id: "u1", content: "첫 댓글", created_at: "2026-08-18T01:00:00Z", profiles: { nickname: "김갱" } }],
      profiles: [{ id: "u1", nickname: "김갱" }],
    };
    const { client: c7 } = makeFakeClient(store7);
    CommentFix.patchClient(c7);
    const r7 = await c7.from("post_comments").select("*, profiles(nickname)").eq("post_id", "p1");
    ok("외래키가 추가돼 profiles 가 이미 붙어 와도 덮어쓰지 않는다", r7.data[0].profiles.nickname === "김갱");
  }

  console.log("\n==========================================================");
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail === 0) console.log("전체 통과 ✅");
  else {
    console.log("실패 있음 ❌");
    process.exit(1);
  }
})();
