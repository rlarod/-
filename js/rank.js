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
 *   getRechargedTotal()       계급에서 빼는 '충전받은 총액'(서버에서 받아옴)
 *   setRechargedTotal(amount) 위 값을 직접 넣기(테스트/보정용)
 *   getUserRank()             현재 사용자의 계급(점수 계산까지 한 번에)
 *   renderBadge(rank, opts)   계급장 HTML 문자열(실제 계급장 이미지, 없으면 SVG 도형)
 *   renderNameWithRank(nick)  "계급장 계급 닉네임" HTML 문자열
 *
 * 데이터 출처
 *   · 계급 정의: Supabase public.ranks 테이블이 있으면 그걸 쓰고,
 *     없으면 아래 RANK_TABLE(동일 내용)로 대체합니다. 즉 SQL 패치를
 *     실행하지 않아도 동작하고, 실행하면 코드 배포 없이 기준을 바꿀 수 있습니다.
 *   · 충전분: 무료 충전으로 받은 돈은 계급 계산에서 뺍니다(rank_recharged_total).
 *     서버에 그 함수가 없으면 0 이라 예전과 똑같이 동작합니다.
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
   * 승급 기준 — 바꾸려면 여기와 supabase/schema-rank-1000.sql 을 같이
   * 고칩니다(화면·서버가 다르면 내 계급과 랭킹표 계급이 어긋납니다).
   * 나머지 코드는 이 표와 calculatePoints()만 참조합니다.
   *
   * 2026-08-24 대표 결정 — 대장 = 지갑 1000억원.
   *   초기자금 10만 USDT(약 1.5억원)의 약 667배입니다.
   *   그전에는 대장이 4.2배(약 6.3억원)라 회원 4명 중 1명이 이미 대장이었고,
   *   최고 계급이 너무 흔해 계급 체계가 의미를 잃었습니다.
   *
   * min_points 는 전부 아래 공식으로 뽑은 값입니다(소수점 반올림).
   *   min_points = 1000 × log2(배수)
   * 옆에 적힌 '배수' 가 근거입니다. 배수를 바꾸면 점수도 같이 다시 뽑으세요.
   * ------------------------------------------------------------------ */
  const RANK_TABLE = [
    { rank_id: 1, rank_name: "이병", rank_level: 1, rank_tier: "병", min_points: 0 }, // 1배
    { rank_id: 2, rank_name: "일병", rank_level: 2, rank_tier: "병", min_points: 378 }, // 1.3배
    { rank_id: 3, rank_name: "상병", rank_level: 3, rank_tier: "병", min_points: 766 }, // 1.7배
    { rank_id: 4, rank_name: "병장", rank_level: 4, rank_tier: "병", min_points: 1138 }, // 2.2배
    { rank_id: 5, rank_name: "하사", rank_level: 5, rank_tier: "부사관", min_points: 1585 }, // 3배
    { rank_id: 6, rank_name: "중사", rank_level: 6, rank_tier: "부사관", min_points: 2000 }, // 4배
    { rank_id: 7, rank_name: "상사", rank_level: 7, rank_tier: "부사관", min_points: 2459 }, // 5.5배
    { rank_id: 8, rank_name: "원사", rank_level: 8, rank_tier: "부사관", min_points: 2907 }, // 7.5배
    { rank_id: 9, rank_name: "준위", rank_level: 9, rank_tier: "준사관", min_points: 3322 }, // 10배
    { rank_id: 10, rank_name: "소위", rank_level: 10, rank_tier: "위관", min_points: 3807 }, // 14배
    { rank_id: 11, rank_name: "중위", rank_level: 11, rank_tier: "위관", min_points: 4322 }, // 20배
    { rank_id: 12, rank_name: "대위", rank_level: 12, rank_tier: "위관", min_points: 4807 }, // 28배
    { rank_id: 13, rank_name: "소령", rank_level: 13, rank_tier: "영관", min_points: 5322 }, // 40배
    { rank_id: 14, rank_name: "중령", rank_level: 14, rank_tier: "영관", min_points: 5907 }, // 60배
    { rank_id: 15, rank_name: "대령", rank_level: 15, rank_tier: "영관", min_points: 6492 }, // 90배
    { rank_id: 16, rank_name: "준장", rank_level: 16, rank_tier: "장성", min_points: 7129 }, // 140배
    { rank_id: 17, rank_name: "소장", rank_level: 17, rank_tier: "장성", min_points: 7845 }, // 230배
    { rank_id: 18, rank_name: "중장", rank_level: 18, rank_tier: "장성", min_points: 8644 }, // 400배
    { rank_id: 19, rank_name: "대장", rank_level: 19, rank_tier: "장성", min_points: 9381 }, // 667배
  ];

  /* ------------------------------------------------------------------
   * 점수 = 지금 가진 자산이 초기자금의 몇 배인가.
   *
   * 예전 방식은 "청산한 거래 1건당 10점 + 수익률 1%당 20점" 이었습니다.
   * 거래를 많이 하기만 하면 점수가 올라서, 손실 -21% 인 사람이 중장을
   * 달고 있었습니다. 계급이 실력을 나타내지 못했습니다.
   *
   * 새 방식 — 거래 횟수는 점수에 넣지 않습니다. 지금 자산만 봅니다.
   *   점수 = 1000 × log2(자산 / 초기자금)
   *
   * log2 를 쓰는 이유: 벌수록 올리기 어려워집니다. 2배면 1000점,
   * 4배면 2000점, 8배가 되어야 3000점입니다. 안 그러면 한 번 크게 번
   * 사람이 영영 1등이라 뒤에 온 사람이 따라잡을 수 없습니다.
   *   1.5배 → 585점(이병)  2배 → 1000점(일병)  4배 → 2000점(중사)
   *   10배 → 3322점(준위)  90배 → 6492점(대령)  667배 → 9381점(대장)
   *
   * 원금 아래로 내려가면 0점(이병)입니다. 원금도 못 지키면 계급이
   * 없는 셈입니다. 반대로 자산이 줄면 점수도 줄어 강등됩니다.
   *
   * ── 자산 = 지갑에 있는 돈 (2026-08-24 대표 결정) ───────────────────
   *   "계급은 무조건 지갑에 있는 돈으로 평가하는거임"
   *
   *   계급용 자산 = 지갑 잔고(balance)
   *               + 포지션에 묶인 증거금
   *               + 미체결 주문 증거금        (둘 다 snapshot.usedMargin)
   *               − 충전받은 총액
   *
   * 포지션을 잡으면 지갑에서 증거금이 빠져나가지만 그건 잃은 돈이
   * 아니므로 그대로 더합니다. 그래서 포지션을 잡아도 계급은 그대로입니다.
   *
   * ★ 펀딩비는 따로 더하지 않습니다 — 이미 지갑에 들어가 있습니다.
   *   trading.js 가 정산할 때마다 state.balance 에 바로 반영하기 때문에
   *   지갑을 보면 자동으로 포함됩니다. 반대로 realizedPnl(청산한 거래의
   *   손익 합계)에는 펀딩비가 안 들어 있어서, 그걸로 계급을 매기면
   *   펀딩비가 통째로 빠집니다(실측 예: 김갱 계정 11,231 USDT 차이).
   *   그래서 여기서도 서버에서도 realizedPnl 을 쓰지 않습니다.
   *
   * 미실현 손익은 넣지 않습니다 — 아직 확정되지 않은 숫자라, 넣으면
   * 가격이 출렁일 때마다 계급이 오르내립니다. 청산해서 손익이 확정되면
   * 그 결과가 지갑에 들어오므로 그때 반영됩니다.
   * ------------------------------------------------------------------ */
  const POINTS_PER_DOUBLING = 1000; // 자산이 2배가 될 때마다 오르는 점수
  const INITIAL_BALANCE = 100000;   // trading.js의 초기자산

  let rankTable = RANK_TABLE.slice();
  let bonusPoints = 0; // profiles.rank_points (SQL 패치를 실행한 경우에만 채워짐)
  /* 무료 충전처럼 '거래로 번 게 아닌 돈'. 계급 계산에서 뺍니다(아래 설명).
     서버(rank_recharged_total)에서 받아오며, 못 받아오면 0 = 예전 동작. */
  let rechargedTotal = 0;

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

  /* ---------------- 충전받은 돈은 계급에서 뺍니다 ----------------
   * 2026-08-24 대표 승인(A안).
   *
   * 무료 충전은 하루 2회 × 100,000 USDT 가 지갑에 그대로 들어옵니다.
   * 계급은 지갑 기준이라, 거래를 한 번도 안 해도 계급이 올랐습니다 —
   * 한 번 받으면 지갑이 2배(1000점, 상병), 두 번이면 3배(1584점, 병장).
   * 계급을 '사는' 셈이었습니다.
   *
   *   계급용 자산 = (지갑 + 포지션 증거금) − 충전받은 총액
   *
   * '충전받은 총액' 은 서버가 알려줍니다(rank_recharged_total).
   * 서버가 아직 그 함수를 갖고 있지 않으면 0 이라 예전과 똑같이 돕니다
   * — 부풀려진 계급이 남을 뿐 새로 깨지는 것은 없습니다.
   *
   * 왜 recharge_count 를 안 쓰나: trading_accounts.recharge_count 는
   * '오늘 몇 번 받았나' 라서 자정마다 0 으로 돌아갑니다(최대 2).
   * 지금까지 받은 총 횟수가 아니라서 그대로 곱하면 어제까지 받은 몫이
   * 통째로 빠집니다. 그래서 서버가 충전할 때마다 누계를 따로 기록합니다
   * (trading_accounts.recharge_total).
   *
   * ⚠ 이 값을 '거래로 설명되지 않는 돈' 으로 역산하면 안 됩니다.
   *   (지갑 + 증거금) − (초기자금 + 확정손익) 에는 펀딩비가 그대로
   *   섞여 들어가서, 펀딩비를 충전으로 오해해 도로 빼버립니다.
   *   2026-08-24 대표 결정("지갑에 있는 돈으로 평가")과 정반대가 됩니다.
   * -------------------------------------------------------------- */
  function getRechargedTotal() {
    return rechargedTotal;
  }

  function setRechargedTotal(amount) {
    const n = Number(amount);
    rechargedTotal = isFinite(n) && n > 0 ? n : 0;
    return rechargedTotal;
  }

  /* 계급 계산에 쓰는 '자산' — 지갑에 있는 돈 (2026-08-24 대표 결정).
       (지갑 잔고 + 포지션·미체결 증거금) − 충전받은 돈
     · 펀딩비는 이미 지갑(balance)에 들어 있으므로 자동 포함됩니다.
     · realizedPnl 은 쓰지 않습니다 — 펀딩비가 빠져 있습니다.
     · 미실현 손익도 쓰지 않습니다(위 설명 참고). */
  function getRankAssets(snapshot) {
    if (!snapshot) return INITIAL_BALANCE;
    const balance = typeof snapshot.balance === "number" ? snapshot.balance : 0;
    const used = typeof snapshot.usedMargin === "number" ? snapshot.usedMargin : 0;
    const assets = balance + used - rechargedTotal;
    return isFinite(assets) && assets > 0 ? assets : 0;
  }

  // 자산 -> 점수. 여기 말고 다른 곳에서 점수를 만들지 않습니다.
  function calculatePoints(snapshot) {
    if (!snapshot) return bonusPoints;
    const assets = getRankAssets(snapshot);
    if (assets <= 0) return bonusPoints; // 다 잃었으면 이병
    const ratio = assets / INITIAL_BALANCE;
    const fromAssets = Math.log2(ratio) * POINTS_PER_DOUBLING;
    // 원금 아래로 내려가면 0점 — 마이너스 점수는 만들지 않습니다.
    return Math.max(0, fromAssets) + bonusPoints;
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
      /* 충전받은 총액 — 계급 계산에서 뺍니다(위 getRankAssets 설명 참고).
         함수가 없으면(SQL 미적용) 0 으로 두고 예전 동작을 유지합니다. */
      const { data, error } = await client.rpc("rank_recharged_total");
      if (!error) setRechargedTotal(data);
    } catch (e) {
      /* rank_recharged_total 이 아직 없음 — 충전분 0으로 진행 */
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
    getRankAssets,
    getRechargedTotal,
    setRechargedTotal,
    renderBadge,
    renderNameWithRank,
  };
})();
