/* tests/rank-badge.test.js
 * 계급장 19종이 계급과 1:1로 맞는지, 비율이 안 찌그러지는지 검증합니다. */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const sandbox = {
  console,
  document: {
    readyState: "complete", addEventListener() {},
    createElement: () => ({ className: "", src: "", alt: "", title: "", loading: "",
      set textContent(v) { this._t = v; }, get innerHTML() { return String(this._t == null ? "" : this._t); } }),
    querySelectorAll: () => [], getElementById: () => null,
  },
  module: { exports: {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(REPO, "js", "rank-badge.js"), "utf8"), sandbox);
const RB = sandbox.App.RankBadge;

/* rank.js 의 RANK_TABLE 을 소스에서 읽어옵니다(계급 체계는 그쪽이 원본). */
const rankSrc = fs.readFileSync(path.join(REPO, "js", "rank.js"), "utf8");
const table = [];
rankSrc.replace(/\{ rank_id: (\d+), rank_name: "([^"]+)", rank_level: \d+, rank_tier: "([^"]+)", min_points: (\d+) \}/g,
  (m, id, name, tier, pts) => { table.push({ id: Number(id), name, tier, pts: Number(pts) }); return m; });

console.log("\n계급장");

/* ---------- 계급 체계 ---------- */
{
  ok("기존 계급 체계가 19단계", table.length === 19, String(table.length));
  ok("이병에서 시작", table[0].name === "이병" && table[0].id === 1, table[0] && table[0].name);
  ok("대장으로 끝", table[18].name === "대장" && table[18].id === 19, table[18] && table[18].name);
  ok("승급 점수가 계속 올라간다", table.every((r, i) => i === 0 || r.pts > table[i - 1].pts));
  ok("계급 체계를 새로 만들지 않았다(rank.js 재사용)", /RANK_TABLE/.test(rankSrc));
}

/* ---------- 파일 ---------- */
{
  const dir = path.join(REPO, "assets", "ranks");
  ok("계급장 폴더가 있다", fs.existsSync(dir));
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  ok("계급장 파일이 19장", files.length === 19, String(files.length));

  function png(file) {
    const buf = fs.readFileSync(path.join(dir, file));
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), colorType: buf.readUInt8(25) };
  }

  let allAlpha = true, allSized = true, distinct = new Set();
  table.forEach((r) => {
    const rel = RB.fileFor(r.id);
    ok("계급 " + r.id + " (" + r.name + ") 에 파일이 연결됨", !!rel, String(rel));
    if (!rel) return;
    const file = rel.replace("assets/ranks/", "");
    const exists = fs.existsSync(path.join(dir, file));
    if (!exists) { ok(r.name + " 파일 존재", false, file); return; }
    const info = png(file);
    if (info.colorType !== 6) allAlpha = false;
    if (info.w < 20 || info.h < 20) allSized = false;
    distinct.add(file);
  });
  ok("모든 계급장이 투명 배경 PNG", allAlpha);
  ok("모든 계급장이 최소 크기 이상(빈 이미지 아님)", allSized);
  ok("19계급이 서로 다른 파일을 쓴다(한 장 공용 아님)", distinct.size === 19, String(distinct.size));

  /* 파일 이름이 계급 순서와 맞는지 — 번호가 rank_id 와 같아야 합니다 */
  let numbered = true;
  table.forEach((r) => {
    const f = RB.fileFor(r.id) || "";
    const m = f.match(/rank-(\d{2})-/);
    if (!m || Number(m[1]) !== r.id) numbered = false;
  });
  ok("파일 번호가 계급 번호와 일치", numbered);
}

/* ---------- 매핑 동작 ---------- */
{
  ok("범위를 벗어난 값은 끝 계급으로 보정", RB.normalizeId(0) === 1 && RB.normalizeId(99) === 19);
  ok("숫자가 아니면 null", RB.normalizeId("abc") === null);
  const h = RB.html({ rank_id: 19, rank_name: "대장" }, "ranking");
  ok("html() 이 img 를 돌려준다", /<img /.test(h) && /rank-19-general\.png/.test(h), h.slice(0, 80));
  ok("크기 이름이 클래스로 붙는다", /rank-badge-ranking/.test(h));
  ok("alt/title 에 계급 이름", /alt="대장"/.test(h) && /title="대장"/.test(h));
  ok("크기 이름을 안 주면 기본값", /rank-badge-community/.test(RB.html({ rank_id: 1, rank_name: "이병" })));
  ok("잘못된 계급이면 빈 문자열", RB.html({ rank_id: null }) === "");
}

/* ---------- 공통 렌더러 연결 ---------- */
{
  ok("rank.js 의 renderBadge 가 계급장 이미지를 쓴다", /App\.RankBadge[\s\S]{0,200}fileFor\(rank\.rank_id\)/.test(rankSrc));
  ok("이미지를 못 쓰면 기존 SVG 로 넘어간다(안전망)", /<svg width=/.test(rankSrc));

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const tags = html.match(/<script src="[^"]+"><\/script>/g) || [];
  const at = (n) => tags.findIndex((t) => t.indexOf(n) !== -1);
  ok("rank-badge.js 가 rank.js 보다 먼저 실린다", at("js/rank-badge.js") >= 0 && at("js/rank-badge.js") < at("js/rank.js"));
  ok("rank-badge-attach.js 가 연결됐다", at("js/rank-badge-attach.js") > at("js/rank.js"));

  const attach = fs.readFileSync(path.join(REPO, "js", "rank-badge-attach.js"), "utf8");
  /* 2026-08-18: 서버가 닉네임별 계급 점수를 주게 되어 모두의 계급장을 붙입니다. */
  ok("계급 점수를 서버에서 받아온다", /rpc\("rank_points_all"\)/.test(attach));
  ok("점수를 화면에서 지어내지 않는다", !/Math\.random/.test(attach));
  ok("계급 단계 판정은 rank.js 에 맡긴다", /App\.Rank\.calculateRank/.test(attach));
  ok("모르는 닉네임에는 아무것도 안 붙인다", /if \(!rank\) return;/.test(attach));
  ok("랭킹표·채팅·커뮤니티 세 곳에 붙인다", /attachLeaderboard/.test(attach) && /attachChat/.test(attach) && /attachBoard/.test(attach));
  ok("서버 함수가 없으면 조용히 넘어간다", /loadFailed = true/.test(attach));
  ok("실패해도 계속 재시도하지 않는다", /if \(loading \|\| loadFailed\) return/.test(attach));

  const sqlBadge = fs.readFileSync(path.join(REPO, "supabase", "schema-rank-badges.sql"), "utf8");
  const sqlCode = sqlBadge.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  ok("SQL: 점수를 기존 tl_earned() 로 계산(새 공식 안 만듦)", /public\.tl_earned\(p\.id\)/.test(sqlCode));
  ok("SQL: 테이블을 만들거나 지우지 않는다", !/create table|drop table|truncate/i.test(sqlCode));
  ok("SQL: 조회 수를 제한한다(과부하 방지)", /limit greatest/.test(sqlCode));
}

/* ---------- 크기 규격 ---------- */
{
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  function size(sel) {
    const m = css.match(new RegExp("img\\.rank-badge-" + sel + "\\{height:(\\d+)px"));
    return m ? Number(m[1]) : -1;
  }
  const chat = size("chat"), com = size("community"), rank = size("ranking"), prof = size("profile");
  ok("채팅 18~22px", chat >= 18 && chat <= 22, String(chat));
  ok("커뮤니티 20~24px", com >= 20 && com <= 24, String(com));
  ok("랭킹 32~40px", rank >= 32 && rank <= 40, String(rank));
  ok("프로필 40~56px", prof >= 40 && prof <= 56, String(prof));
  ok("작은 화면 -> 큰 화면 순서가 맞다", chat <= com && com <= rank && rank <= prof);
  ok("가로는 auto — 비율을 안 찌그러뜨린다", /img\.rank-badge\{width:auto/.test(css) || /rank-badge-img,\s*\nimg\.rank-badge\{width:auto/.test(css));
  ok("다크모드에서도 색을 바꾸지 않는다(그림자만)", !/html\[data-theme="dark"\][^{]*rank-badge[^}]*filter:(?!drop-shadow)/.test(css));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
