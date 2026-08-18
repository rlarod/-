/* =========================================================================
 * js/rank.js — App.Rank
 * =========================================================================
 * 한국식 군 계급(19단계) 시스템. 사이트 어디서든 같은 방식으로 계급을
 * 계산하고 같은 모양으로 표시하기 위한 공통 모듈입니다.
 *
 * 공개 함수
 *   getRankTable()            19단계 정의 배열
 *   calculateRank(points)     점수 -> 계급 객체
 *   getRankName(points)       점수 -> 계급 이름
 *   calculatePoints(snapshot) 거래 기록 -> 계급 점수
 *   getUserRank()             현재 사용자의 계급(점수 계산까지 한 번에)
 *   renderBadge(rank, opts)   계급장 HTML 문자열(실제 계급장 이미지, 없으면 SVG 도형)
 *   renderNameWithRank(nick)  "계급장 계급 닉네임" HTML 문자열
 *
 * 데이터 출처
 *   · 계급 정의: Supabase public.ranks 테이블이 있으면 그걸 쓰고,
 *     없으면 아래 RANK_TABLE(동일 내용)로 대체합니다. 즉 SQL 패치를
 *     실행하지 않아도 동작하고, 실행하면 코드 배포 없이 기준을 바꿀 수 있습니다.
 *   · 점수: App.Trading.getSnapshot()의 실제 거래 기록에서 계산합니다.
 *     가짜 값이 아니라 사용자가 실제로 청산한 거래의 결과입니다.
 *     여기에 profiles.rank_points(운영자 가감점)가 있으면 더합니다.
 *
 * trading.js / leaderboard.js / auth.js 등 기존 파일은 전혀 수정하지 않고,
 * 이미 공개된 getSnapshot() / getNickname() 만 읽습니다.
 * ========================================================================= */

window.App = window.App || {};

App.Rank = (function () {
  "use strict";

  /* ------------------------------------------------------------------
   * 승급 기준 — 바꾸려면 여기(또는 supabase/schema-rank-patch.sql)만 고치면
   * 됩니다. 나머지 코드는 이 표와 calculatePoints()만 참조합니다.
   * ------------------------------------------------------------------ */
  const RANK_TABLE = [
    { rank_id: 1, rank_name: "이병", rank_level: 1, rank_tier: "병", min_points: 0 },
    { rank_id: 2, rank_name: "일병", rank_level: 2, rank_tier: "병", min_points: 30 },
    { rank_id: 3, rank_name: "상병", rank_level: 3, rank_tier: "병", min_points: 70 },
    { rank_id: 4, rank_name: "병장", rank_level: 4, rank_tier: "병", min_points: 120 },
    { rank_id: 5, rank_name: "하사", rank_level: 5, rank_tier: "부사관", min_points: 180 },
    { rank_id: 6, rank_name: "중사", rank_level: 6, rank_tier: "부사관", min_points: 250 },
    { rank_id: 7, rank_name: "상사", rank_level: 7, rank_tier: "부사관", min_points: 330 },
    { rank_id: 8, rank_name: "원사", rank_level: 8, rank_tier: "부사관", min_points: 420 },
    { rank_id: 9, rank_name: "준위", rank_level: 9, rank_tier: "준사관", min_points: 520 },
    { rank_id: 10, rank_name: "소위", rank_level: 10, rank_tier: "위관", min_points: 630 },
    { rank_id: 11, rank_name: "중위", rank_level: 11, rank_tier: "위관", min_points: 750 },
    { rank_id: 12, rank_name: "대위", rank_level: 12, rank_tier: "위관", min_points: 880 },
    { rank_id: 13, rank_name: "소령", rank_level: 13, rank_tier: "영관", min_points: 1020 },
    { rank_id: 14, rank_name: "중령", rank_level: 14, rank_tier: "영관", min_points: 1170 },
    { rank_id: 15, rank_name: "대령", rank_level: 15, rank_tier: "영관", min_points: 1330 },
    { rank_id: 16, rank_name: "준장", rank_level: 16, rank_tier: "장성", min_points: 1500 },
    { rank_id: 17, rank_name: "소장", rank_level: 17, rank_tier: "장성", min_points: 1680 },
    { rank_id: 18, rank_name: "중장", rank_level: 18, rank_tier: "장성", min_points: 1870 },
    { rank_id: 19, rank_name: "대장", rank_level: 19, rank_tier: "장성", min_points: 2070 },
  ];

  // 점수 배점 — 청산한 거래 1건당 10점 + 실현 수익률 1%당 20점.
  // 손실이어도 계급이 내려가지 않도록 수익률 기여분은 0 미만으로 안 갑니다.
  const POINTS_PER_CLOSED_TRADE = 10;
  const POINTS_PER_RETURN_PCT = 20;
  const INITIAL_BALANCE = 100000; // trading.js의 초기자산과 동일 기준(수익률 분모)

  let rankTable = RANK_TABLE.slice();
  let bonusPoints = 0; // profiles.rank_points (SQL 패치를 실행한 경우에만 채워짐)

  function getRankTable() {
    return rankTable.slice();
  }

  /* ---------------- 계급 계산 ---------------- */
  function calculateRank(points) {
    const p = typeof points === "number" && isFinite(points) ? points : 0;
    let found = rankTable[0];
    for (const r of rankTable) {
      if (p >= r.min_points) found = r;
      else break;
    }
    const next = rankTable.find((r) => r.min_points > p) || null;
    return {
      rank_id: found.rank_id,
      rank_name: found.rank_name,
      rank_level: found.rank_level,
      rank_tier: found.rank_tier,
      points: p,
      next_rank_name: next ? next.rank_name : null,
      points_to_next: next ? next.min_points - p : 0,
    };
  }

  function getRankName(points) {
    return calculateRank(points).rank_name;
  }

  // 실제 거래 기록 -> 점수. 여기 말고 다른 곳에서 점수를 만들지 않습니다.
  function calculatePoints(snapshot) {
    if (!snapshot) return bonusPoints;
    const closed = Array.isArray(snapshot.closedTrades) ? snapshot.closedTrades.length : 0;
    const realized = typeof snapshot.realizedPnl === "number" ? snapshot.realizedPnl : 0;
    const returnPct = (realized / INITIAL_BALANCE) * 100;
    const fromReturn = Math.max(0, returnPct) * POINTS_PER_RETURN_PCT;
    return closed * POINTS_PER_CLOSED_TRADE + fromReturn + bonusPoints;
  }

  function getUserRank(snapshot) {
    const snap = snapshot || (App.Trading ? App.Trading.getSnapshot() : null);
    return calculateRank(calculatePoints(snap));
  }

  /* ---------------- 계급장(SVG) ----------------
   * 실제 한국군 계급장 구성을 단순화해서 자체 구현했습니다(외부 이미지 없음).
   *   병      : 막대(작대기) 1~4
   *   부사관  : 갈매기(V) 1~4
   *   준사관  : 마름모 1
   *   위관    : 마름모 1~3
   *   영관    : 무궁화(꽃) 1~3
   *   장성    : 별 1~4
   * -------------------------------------------------------------- */
  const TIER_STYLE = {
    병: { shape: "bar", color: "#7C8494" },
    부사관: { shape: "chevron", color: "#C08A2E" },
    준사관: { shape: "diamond", color: "#9AA3B2" },
    위관: { shape: "diamond", color: "#C9A227" },
    영관: { shape: "flower", color: "#C9A227" },
    장성: { shape: "star", color: "#D64545" },
  };

  function tierIndex(rank) {
    // 계층 안에서 몇 번째인지(1부터) — 마크 개수로 씁니다.
    const sameTier = rankTable.filter((r) => r.rank_tier === rank.rank_tier);
    const i = sameTier.findIndex((r) => r.rank_id === rank.rank_id);
    return i < 0 ? 1 : i + 1;
  }

  function shapePath(shape, cx, cy, s, color) {
    if (shape === "bar") {
      return '<rect x="' + (cx - s * 0.32) + '" y="' + (cy - s * 0.9) + '" width="' + s * 0.64 + '" height="' + s * 1.8 + '" rx="' + s * 0.18 + '" fill="' + color + '"/>';
    }
    if (shape === "chevron") {
      const w = s * 0.95, h = s * 0.85, t = s * 0.42;
      return '<path d="M' + (cx - w) + ' ' + (cy + h) + ' L' + cx + ' ' + (cy - h) + ' L' + (cx + w) + ' ' + (cy + h) + ' L' + (cx + w - t) + ' ' + (cy + h) + ' L' + cx + ' ' + (cy - h + t) + ' L' + (cx - w + t) + ' ' + (cy + h) + ' Z" fill="' + color + '"/>';
    }
    if (shape === "diamond") {
      return '<path d="M' + cx + ' ' + (cy - s) + ' L' + (cx + s * 0.72) + ' ' + cy + ' L' + cx + ' ' + (cy + s) + ' L' + (cx - s * 0.72) + ' ' + cy + ' Z" fill="' + color + '"/>';
    }
    if (shape === "flower") {
      let petals = "";
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        petals += '<ellipse cx="' + (cx + Math.cos(a) * s * 0.52) + '" cy="' + (cy + Math.sin(a) * s * 0.52) + '" rx="' + s * 0.34 + '" ry="' + s * 0.34 + '" fill="' + color + '"/>';
      }
      return petals + '<circle cx="' + cx + '" cy="' + cy + '" r="' + s * 0.36 + '" fill="#fff" opacity="0.85"/>';
    }
    // star
    let d = "";
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s : s * 0.45;
      const a = (Math.PI * i) / 5 - Math.PI / 2;
      d += (i === 0 ? "M" : "L") + (cx + Math.cos(a) * r) + " " + (cy + Math.sin(a) * r) + " ";
    }
    return '<path d="' + d + 'Z" fill="' + color + '"/>';
  }

  function renderBadge(rank, opts) {
    const o = opts || {};
    const size = o.size || 18;

    /* 2026-08-18 — 실제 계급장 이미지가 생겼습니다(assets/ranks/).
       js/rank-badge.js 가 rank_id 로 파일을 골라줍니다.
       이 함수를 부르는 곳(내 정보 패널, 계급 줄 등)이 전부 한 번에 바뀝니다.
       이미지를 못 불러오는 상황이면 아래 기존 SVG 도형으로 그대로 넘어갑니다. */
    if (App.RankBadge && typeof App.RankBadge.fileFor === "function") {
      const src = App.RankBadge.fileFor(rank.rank_id);
      if (src) {
        return (
          '<span class="rank-badge rank-tier-' + rank.rank_tier + '" title="' + rank.rank_name +
          '" aria-label="' + rank.rank_name + '">' +
          '<img class="rank-badge-img" src="' + src + '" alt="' + rank.rank_name +
          '" style="height:' + size + 'px;width:auto;" loading="lazy">' +
          "</span>"
        );
      }
    }

    const style = TIER_STYLE[rank.rank_tier] || TIER_STYLE["병"];
    const count = tierIndex(rank);
    const unit = size * 0.42;
    const gap = style.shape === "bar" ? unit * 0.95 : unit * 1.35;
    const totalW = gap * (count - 1) + unit * 2;
    const w = Math.max(size, totalW);
    let marks = "";
    for (let i = 0; i < count; i++) {
      const cx = w / 2 - (gap * (count - 1)) / 2 + gap * i;
      marks += shapePath(style.shape, cx, size / 2, unit, style.color);
    }
    return (
      '<span class="rank-badge rank-tier-' + rank.rank_tier + '" title="' + rank.rank_name + '" aria-label="' + rank.rank_name + '">' +
      '<svg width="' + w + '" height="' + size + '" viewBox="0 0 ' + w + " " + size + '" xmlns="http://www.w3.org/2000/svg" role="img">' +
      marks +
      "</svg></span>"
    );
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  // "계급장 + 계급명 + 닉네임" — 채팅/게시판/랭킹 등 어디서든 같은 모양으로.
  function renderNameWithRank(nickname, rank, opts) {
    const r = rank || getUserRank();
    const o = opts || {};
    return (
      '<span class="rank-name-wrap">' +
      renderBadge(r, { size: o.size || 16 }) +
      '<span class="rank-name-label rank-tier-text-' + r.rank_tier + '">' + escapeHtml(r.rank_name) + "</span>" +
      (nickname ? '<span class="rank-nickname">' + escapeHtml(nickname) + "</span>" : "") +
      "</span>"
    );
  }

  /* ---------------- Supabase 연동(있으면 사용, 없으면 무시) ---------------- */
  async function loadFromSupabase() {
    if (!App.SupabaseClient || typeof App.SupabaseClient.get !== "function") return;
    const client = App.SupabaseClient.get();
    if (!client) return;
    try {
      const { data, error } = await client.from("ranks").select("*").order("rank_id");
      if (!error && Array.isArray(data) && data.length) rankTable = data;
    } catch (e) {
      /* ranks 테이블이 아직 없음 — 코드 안의 기본 표를 그대로 사용 */
    }
    try {
      const { data: sess } = await client.auth.getSession();
      const uid = sess && sess.session ? sess.session.user.id : null;
      if (!uid) return;
      const { data, error } = await client.from("profiles").select("rank_points").eq("id", uid).single();
      if (!error && data && typeof data.rank_points === "number") bonusPoints = data.rank_points;
    } catch (e) {
      /* rank_points 컬럼이 아직 없음 — 가감점 0으로 진행 */
    }
  }

  function init() {
    loadFromSupabase().then(() => {
      App.Bus.emit("rank:ready", getUserRank());
    });
  }

  return {
    init,
    getRankTable,
    calculateRank,
    getRankName,
    calculatePoints,
    getUserRank,
    renderBadge,
    renderNameWithRank,
  };
})();
