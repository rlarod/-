/* tests/rank-table.test.js
 * =========================================================================
 * 계급표(19단계)를 지킵니다 — 2026-08-24 대표 결정.
 *
 *   대장 = 지갑 1000억원 = 초기자금 10만 USDT(약 1.5억원)의 약 667배
 *   점수 = 1000 x log2(자산 / 초기자금)  ->  667배 = 9381점
 *
 * 이 테스트가 막는 것
 *   1) 대장 임계값이 667배(9381점)가 아니게 되면
 *   2) 계급이 19개가 아니게 되면
 *   3) min_points 가 오름차순이 아니게 되면
 *   4) 화면(js/rank.js)과 서버 SQL 의 임계값이 서로 달라지면  <- 제일 중요
 *   5) 충전받은 돈을 안 빼는 상태로 되돌아가면
 *
 * 4번이 왜 중요한가: 화면 계급과 랭킹표 계급이 서로 다르게 나오면
 * 회원은 어느 쪽이 맞는지 알 수 없습니다(조용한 고장).
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = path.join(__dirname, "..");
let pass = 0;
let fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    failures.push(name + (detail ? " — " + detail : ""));
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}
function section(title) {
  console.log("\n[1m" + title + "[0m");
}

/* ------------------------------------------------------------------
 * js/rank.js 를 브라우저 없이 그대로 실행합니다.
 * (App.Trading 등 다른 모듈 없이도 계급 계산만 떼어 쓸 수 있어야 합니다)
 * ------------------------------------------------------------------ */
const rankSrc = fs.readFileSync(path.join(REPO, "js", "rank.js"), "utf8");
const sandbox = {
  console,
  document: {
    createElement: () => ({
      set textContent(v) { this._t = v; },
      get innerHTML() { return String(this._t == null ? "" : this._t); },
    }),
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(rankSrc, sandbox);
const Rank = sandbox.App.Rank;

/* 대표가 승인한 계급표 — 여기 값이 바뀌면 그건 새 결정이어야 합니다. */
const APPROVED = [
  [1, "이병", "병", 1, 0],
  [2, "일병", "병", 1.3, 378],
  [3, "상병", "병", 1.7, 766],
  [4, "병장", "병", 2.2, 1138],
  [5, "하사", "부사관", 3, 1585],
  [6, "중사", "부사관", 4, 2000],
  [7, "상사", "부사관", 5.5, 2459],
  [8, "원사", "부사관", 7.5, 2907],
  [9, "준위", "준사관", 10, 3322],
  [10, "소위", "위관", 14, 3807],
  [11, "중위", "위관", 20, 4322],
  [12, "대위", "위관", 28, 4807],
  [13, "소령", "영관", 40, 5322],
  [14, "중령", "영관", 60, 5907],
  [15, "대령", "영관", 90, 6492],
  [16, "준장", "장성", 140, 7129],
  [17, "소장", "장성", 230, 7845],
  [18, "중장", "장성", 400, 8644],
  [19, "대장", "장성", 667, 9381],
];
const INITIAL = 100000; // trading.js 초기자산 (USDT)

console.log("\n계급표 — 대장 = 지갑 1000억원 (667배)");

/* ===================================================================== */
section("[1] 화면(js/rank.js) 계급표");
{
  const table = Rank.getRankTable();

  ok("계급이 정확히 19개", table.length === 19, String(table.length));

  ok(
    "이름·계층·rank_level 이 대표 승인표 그대로",
    table.every((r, i) => r.rank_id === APPROVED[i][0] && r.rank_name === APPROVED[i][1] && r.rank_tier === APPROVED[i][2] && r.rank_level === APPROVED[i][0]),
    table.map((r) => r.rank_name).join(",")
  );

  ok(
    "승급 점수가 대표 승인표 그대로",
    table.every((r, i) => r.min_points === APPROVED[i][4]),
    table.map((r) => r.rank_name + ":" + r.min_points).join(" ")
  );

  ok(
    "min_points 가 오름차순",
    table.every((r, i) => i === 0 || r.min_points > table[i - 1].min_points),
    table.map((r) => r.min_points).join(",")
  );

  ok("이병은 0점에서 시작", table[0].min_points === 0, String(table[0].min_points));

  /* 대장 임계값 — 이 줄이 이 테스트의 핵심입니다. */
  /* 계급이 지워졌을 때 오류로 죽지 않고 '실패'로 나오게 빈 값을 둡니다. */
  const 대장 = table[18] || { rank_name: "(없음)", min_points: -1 };
  ok("대장 임계값이 9381점", 대장.rank_name === "대장" && 대장.min_points === 9381, 대장.rank_name + " " + 대장.min_points);

  ok(
    "대장 9381점이 초기자금의 667배(= 지갑 1000억원 수준)",
    Math.round(Math.pow(2, 9381 / 1000)) === 667,
    String(Math.pow(2, 9381 / 1000))
  );

  /* 승인표의 점수는 1000 x log2(배수) 를 소수점에서 정리한 값입니다.
     (올림/버림이 섞여 있어 1점 이내면 맞는 것으로 봅니다) */
  const 오차 = ([, , , mul, pts]) => Math.abs(Math.log2(mul) * 1000 - pts);
  ok(
    "min_points 가 전부 1000 x log2(배수) 와 1점 이내로 맞는다",
    APPROVED.every((r) => 오차(r) < 1),
    APPROVED.filter((r) => 오차(r) >= 1).map((r) => r[1] + "(" + 오차(r).toFixed(2) + ")").join(",")
  );
}

/* ===================================================================== */
section("[2] 경계값 — 각 계급 경계에서 정확히 그 계급이 나오는가");
{
  let 경계OK = true;
  const 어긋남 = [];
  APPROVED.forEach(([, name, , , pts], i) => {
    // 임계값 그 점수 -> 그 계급
    if (Rank.getRankName(pts) !== name) { 경계OK = false; 어긋남.push(pts + "->" + Rank.getRankName(pts) + "(기대 " + name + ")"); }
    // 임계값 -1 -> 바로 아래 계급 (이병은 아래가 없음)
    if (i > 0) {
      const 아래 = APPROVED[i - 1][1];
      if (Rank.getRankName(pts - 1) !== 아래) { 경계OK = false; 어긋남.push((pts - 1) + "->" + Rank.getRankName(pts - 1) + "(기대 " + 아래 + ")"); }
    }
    // 임계값 +1 -> 여전히 그 계급 (다음 계급과 1점 차이인 곳은 없음)
    if (Rank.getRankName(pts + 1) !== name) { 경계OK = false; 어긋남.push((pts + 1) + "->" + Rank.getRankName(pts + 1) + "(기대 " + name + ")"); }
  });
  ok("19개 계급 전부 경계값 ±1 에서 정확", 경계OK, 어긋남.join(" / "));

  ok("0점 미만·이상한 값은 이병", Rank.getRankName(-999) === "이병" && Rank.getRankName(NaN) === "이병" && Rank.getRankName(null) === "이병");
  ok("아주 큰 점수는 대장", Rank.getRankName(9999999) === "대장");
  ok("대장 위에는 다음 계급이 없다", Rank.calculateRank(9381).next_rank_name === null);
  ok("이병의 다음은 일병까지 378점", Rank.calculateRank(0).next_rank_name === "일병" && Rank.calculateRank(0).points_to_next === 378);
}

/* ===================================================================== */
section("[3] 자산 배수 -> 계급");
{
  const 계급 = (배수) => Rank.getRankName(Rank.calculatePoints({ balance: INITIAL * 배수, usedMargin: 0 }));

  ok("5.1배는 중사 (예전 기준이면 대장이었음)", 계급(5.1) === "중사", 계급(5.1));
  ok("667배는 대장", 계급(667) === "대장", 계급(667));
  ok("666배는 아직 대장이 아니다", 계급(666) !== "대장", 계급(666));
  /* 예전 대장 기준(4.2배 = 2070점)은 이제 중사입니다. */
  ok("4.2배는 중사 — 예전 대장 기준이 더 이상 대장이 아니다", 계급(4.2) === "중사", 계급(4.2));
  ok("1배(초기자금 그대로)는 이병", 계급(1) === "이병", 계급(1));
  ok("원금 아래는 이병", 계급(0.5) === "이병" && 계급(0.01) === "이병");

  /* 승인표의 모든 배수에서 그 계급이 나오는지.
     승급 점수가 소수점에서 정리된 값이라(위 [1] 참고) 딱 그 배수는
     0.5점 차이로 아래 계급이 될 수 있습니다. 0.1% 만 넘겨서 확인합니다. */
  const 배수어긋남 = APPROVED.filter(([, name, , mul]) => mul > 1 && 계급(mul * 1.001) !== name)
    .map((r) => r[1] + "(" + r[3] + "배)->" + 계급(r[3] * 1.001));
  ok("승인표의 배수가 전부 해당 계급으로 나온다", 배수어긋남.length === 0, 배수어긋남.join(","));
}

/* ===================================================================== */
section("[4] 무료 충전으로 계급을 살 수 없다");
{
  /* 무료 충전은 하루 2회 x 100,000 USDT 가 지갑에 그대로 들어옵니다.
     계급을 지갑 기준으로만 매기면 거래를 한 번도 안 해도 계급이 오릅니다. */
  const RECHARGE = 100000;

  ok("충전 총액을 넣고 뺄 수 있는 창구가 있다",
    typeof Rank.setRechargedTotal === "function" && typeof Rank.getRechargedTotal === "function");

  Rank.setRechargedTotal(0);
  const 거래없이_충전2회 = { balance: INITIAL + RECHARGE * 2, usedMargin: 0 };
  const 안뺐을때 = Rank.getRankName(Rank.calculatePoints(거래없이_충전2회));

  Rank.setRechargedTotal(RECHARGE * 2);
  const 뺐을때 = Rank.getRankName(Rank.calculatePoints(거래없이_충전2회));

  ok("충전 2회(20만) 받아도 계급이 안 오른다", 뺐을때 === "이병", 뺐을때);
  ok("안 빼면 실제로 계급이 올라간다(구멍이 있었다는 증거)", 안뺐을때 !== "이병", 안뺐을때);
  ok("충전 2회는 안 빼면 병장까지 올랐다(지갑 30만 = 3배)", 안뺐을때 === "병장", 안뺐을때);

  /* 한 번만 받아도 이미 두 계급이 오릅니다(지갑 20만 = 2배 = 1000점). */
  Rank.setRechargedTotal(0);
  const 충전1회_안뺌 = Rank.getRankName(Rank.calculatePoints({ balance: INITIAL + RECHARGE, usedMargin: 0 }));
  Rank.setRechargedTotal(RECHARGE);
  const 충전1회_뺌 = Rank.getRankName(Rank.calculatePoints({ balance: INITIAL + RECHARGE, usedMargin: 0 }));
  ok("충전 1회(10만)만 받아도 안 빼면 상병까지 올랐다", 충전1회_안뺌 === "상병", 충전1회_안뺌);
  ok("충전 1회는 빼면 이병 그대로", 충전1회_뺌 === "이병", 충전1회_뺌);

  /* 충전을 받아도 '거래로 번 돈' 만큼은 그대로 반영돼야 합니다. */
  Rank.setRechargedTotal(RECHARGE * 2);
  const 충전받고_4배로_불린사람 = { balance: INITIAL * 4 + RECHARGE * 2, usedMargin: 0 };
  ok("충전을 받아도 거래로 번 몫은 그대로 반영",
    Rank.getRankName(Rank.calculatePoints(충전받고_4배로_불린사람)) === "중사",
    Rank.getRankName(Rank.calculatePoints(충전받고_4배로_불린사람)));

  /* 포지션에 묶인 증거금은 잃은 돈이 아니므로 자산에 그대로 포함됩니다. */
  Rank.setRechargedTotal(RECHARGE);
  const 나눠서 = Rank.calculatePoints({ balance: INITIAL * 2 + RECHARGE - 50000, usedMargin: 50000 });
  const 몰아서 = Rank.calculatePoints({ balance: INITIAL * 2 + RECHARGE, usedMargin: 0 });
  ok("증거금으로 묶여 있어도 같은 점수", Math.round(나눠서) === Math.round(몰아서), 나눠서 + " vs " + 몰아서);

  /* 이상한 값이 와도 계급이 올라가면 안 됩니다(음수를 빼면 더하기가 됩니다). */
  Rank.setRechargedTotal(-999999);
  ok("음수 충전액은 0으로 막는다", Rank.getRechargedTotal() === 0, String(Rank.getRechargedTotal()));
  Rank.setRechargedTotal(NaN);
  ok("숫자가 아니면 0으로 막는다", Rank.getRechargedTotal() === 0, String(Rank.getRechargedTotal()));
  Rank.setRechargedTotal(undefined);
  ok("값이 없으면 0 — 서버 함수가 없어도 예전처럼 동작", Rank.getRechargedTotal() === 0, String(Rank.getRechargedTotal()));

  Rank.setRechargedTotal(0); // 뒷 테스트에 영향 없게 되돌립니다
}

/* ===================================================================== */
section("[5] 계산 코드가 충전분을 빼고 있는가 (되돌아감 방지)");
{
  const assetsFn = rankSrc.slice(rankSrc.indexOf("function getRankAssets"), rankSrc.indexOf("  // 자산 -> 점수"));
  ok("getRankAssets 가 충전 총액을 뺀다", /-\s*rechargedTotal/.test(assetsFn), assetsFn.slice(0, 0) || "빼는 식이 없음");
  ok("서버에서 충전 총액을 받아온다", /rpc\(\s*["']rank_recharged_total["']\s*\)/.test(rankSrc));
  ok("미실현 손익은 여전히 안 쓴다", !/unrealizedPnl/.test(assetsFn) && !/\bequity\b/.test(assetsFn));
  ok("원금 아래에서 0으로 막는 처리 유지", /Math\.max\(0, fromAssets\)/.test(rankSrc));
  ok("공식(2배당 1000점)은 그대로", /POINTS_PER_DOUBLING = 1000/.test(rankSrc) && /Math\.log2\(ratio\) \* POINTS_PER_DOUBLING/.test(rankSrc));
  ok("근거 주석이 남아 있다(대장 = 1000억원)", /1000억원/.test(rankSrc) && /667배/.test(rankSrc));
  ok("낡은 예시(4.2배 -> 대장)가 안 남아 있다", !/4\.2배 → 2070점/.test(rankSrc) && !/2070/.test(rankSrc));
}

/* ===================================================================== */
section("[6] 화면과 서버 SQL 의 임계값이 같은가 (제일 중요)");
{
  /* 대표가 돌리는 파일. 여기 값이 화면과 다르면 내 계급과 랭킹표 계급이
     서로 다르게 나옵니다. */
  const SQL_FILES = ["supabase/schema-rank-1000.sql", "supabase/schema-rank-patch.sql"];
  const table = Rank.getRankTable();

  SQL_FILES.forEach((rel) => {
    const full = path.join(REPO, rel);
    if (!fs.existsSync(full)) { ok(rel + " 가 있다", false, "파일 없음"); return; }
    const sql = fs.readFileSync(full, "utf8");

    ok(rel + " 에 19단계 정의가 있다", /insert into public\.ranks/.test(sql));

    const 어긋남 = [];
    table.forEach((r) => {
      const re = new RegExp("\\(\\s*" + r.rank_id + ",\\s*'" + r.rank_name + "',\\s*" + r.rank_level + ",\\s*'" + r.rank_tier + "',\\s*" + r.min_points + "\\s*\\)");
      if (!re.test(sql)) 어긋남.push(r.rank_name + "(" + r.min_points + ")");
    });
    ok(rel + " 의 임계값이 화면과 100% 같다", 어긋남.length === 0, 어긋남.join(","));

    /* SQL 안에 다른 계급 줄이 더 있으면(옛날 표가 남아 있으면) 안 됩니다. */
    const 계급줄 = (sql.match(/^\s*\(\s*\d+,\s*'[가-힣]+',\s*\d+,\s*'[가-힣]+',\s*\d+\s*\)/gm) || []).length;
    ok(rel + " 안에 계급 줄이 19개뿐(옛날 표가 안 남아 있다)", 계급줄 === 19, String(계급줄));
  });

  /* 서버 점수 공식이 화면과 같은지 */
  const main = fs.readFileSync(path.join(REPO, "supabase", "schema-rank-1000.sql"), "utf8");
  ok("서버도 2배당 1000점(log2)", /log\(2,/.test(main) && /\* 1000/.test(main));
  ok("서버도 원금 아래에서 0으로 막는다", /greatest\(0,/.test(main));
  ok("서버도 미실현 손익을 안 쓴다", !/unrealized/i.test(main));
  ok("서버 계급 점수는 지갑이 아니라 초기자금+확정손익", /ta\.initial_balance \+ ta\.realized_pnl/.test(main));
  ok("랭킹표(rank_points_all)도 같은 점수를 쓴다", /rank_points_all[\s\S]{0,600}public\.rank_points\(p\.id\)/.test(main));
  ok("중복 정의를 덮어쓰는 형태(create or replace)", (main.match(/create or replace function/g) || []).length >= 3);
  ok("화면이 빼는 금액을 알려주는 함수가 있다", /function public\.rank_recharged_total\(\)/.test(main));
  ok("그 함수는 음수를 0으로 막는다", /rank_recharged_total[\s\S]{0,400}greatest\(0,/.test(main));
  ok("TL 화폐 공식은 안 건드린다", !/create or replace function public\.tl_earned/.test(main));
  /* 주석에 "DELETE 가 하나도 없습니다" 같은 설명이 있으므로 주석을 뺀 뒤 봅니다. */
  const mainCode = main.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n");
  ok("회원 데이터를 지우거나 되돌리지 않는다",
    !/\bdelete\s+from\b/i.test(mainCode) && !/\btruncate\b/i.test(mainCode) && !/\bdrop\s+table\b/i.test(mainCode));
  ok("회원 지갑·손익을 고치는 update 가 없다",
    !/update\s+public\.(trading_accounts|profiles|positions|orders|trades)/i.test(mainCode), "update 발견");
  ok("근거가 주석으로 남아 있다", /1000억원/.test(main) && /2026-08-24/.test(main));
}

/* ===================================================================== */
section("[7] 계급장 이미지 19개가 새 계급과 1:1");
{
  const dir = path.join(REPO, "assets", "ranks");
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".png")) : [];
  ok("계급장 파일이 19장", files.length === 19, String(files.length));

  const badgeSrc = fs.readFileSync(path.join(REPO, "js", "rank-badge.js"), "utf8");
  const ids = (badgeSrc.match(/^\s*(\d+):\s*"rank-/gm) || []).map((m) => Number(m.trim().split(":")[0]));
  ok("rank-badge.js 가 1~19 를 모두 연결", ids.length === 19 && ids[0] === 1 && ids[18] === 19, ids.join(","));

  const 빠짐 = Rank.getRankTable().filter((r) => {
    const m = badgeSrc.match(new RegExp("^\\s*" + r.rank_id + ":\\s*\"([^\"]+)\"", "m"));
    return !m || !fs.existsSync(path.join(dir, m[1]));
  });
  ok("19개 계급 전부 계급장 파일이 실제로 있다", 빠짐.length === 0, 빠짐.map((r) => r.rank_name).join(","));
}

/* ===================================================================== */
console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("\n실패 목록:");
  failures.forEach((f) => console.log("  - " + f));
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
