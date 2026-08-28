/* tests/guest-leaderboard.test.js
 * ⭐ "서버는 열려 있는데 화면이 막는" 유형을 잡습니다 (TL-006)
 *
 * ── 무슨 일이 있었나 ───────────────────────────────────────────────────
 * supabase/schema-guest-read.sql 이 get_leaderboard 를 anon 에게 열어줬고,
 * 비로그인 브라우저에서 직접 부르면 오류 없이 3행이 왔습니다. 그런데
 * js/leaderboard.js 는 세션이 없으면 서버를 부르지도 않고
 * "로그인 후 확인할 수 있습니다."로 끝냈습니다. 서버 쪽 작업만 끝나고
 * 화면 쪽 잠금을 걷어내는 것을 빠뜨린, 반만 된 상태였습니다.
 * 실측(1440px, 비로그인): 랭킹 페이지 177px, 숫자 0개.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) 서버가 anon 에게 열어준 랭킹이 화면에도 실제로 나오는가
 *  (2) 원본이 잠금 문구로 다시 덮어도 되살아나는가
 *  (3) 로그인 사용자 화면은 손대지 않는가 (가장 중요한 회귀 검사)
 *  (4) 랭킹만 공개다 — 거래내역·개인정보·TL 잔액은 계속 막혀 있는가
 *
 * ── "잡아내는 테스트인지"를 이 파일 안에서 증명합니다 ──────────────────
 * (2)(3) 은 실제 소스를 메모리에서 망가뜨려 다시 돌려보는 돌연변이 검사를
 * 함께 넣었습니다. 망가뜨린 판이 통과해 버리면 그 검사는 가짜이므로
 * 실패로 처리합니다. 파일은 하나도 고치지 않습니다(읽어서 문자열만 바꿉니다).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  [32m✓[0m " + name); }
  else { fail++; console.log("  [31m✗[0m " + name + (detail ? " — " + detail : "")); }
}

const read = (p) => fs.readFileSync(path.join(REPO, p), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GUEST_SRC = read("js/guest-leaderboard.js");
const LB_SRC = read("js/leaderboard.js");
const UTILS_SRC = read("js/utils.js");
const INDEX = read("index.html");
const GUEST_SQL = read("supabase/schema-guest-read.sql");

const LOCK = "로그인 후 확인할 수 있습니다";

/* 실제 서버에서 온 모양 그대로 (본부장 실측, 2026-08-21) */
const 서버행 = [
  { nickname: "Mang9", roe_percent: 410.67, balance: 510669.4, total_asset: 510669.4, profit_amount: 410669.4 },
  { nickname: "테스터2", roe_percent: 12.5, balance: 112500, total_asset: 112500, profit_amount: 12500 },
  { nickname: "테스터3", roe_percent: -3.25, balance: 96750, total_asset: 96750, profit_amount: -3250 },
];

const BUS_SRC = `
  window.App = window.App || {};
  App.Bus = (function(){
    const L = {};
    return {
      on(e,f){ (L[e]=L[e]||[]).push(f); return f; },
      off(e,f){ if(L[e]) L[e]=L[e].filter(x=>x!==f); },
      emit(e,p){ (L[e]||[]).forEach(f=>{ try{f(p);}catch(err){} }); }
    };
  })();
`;

/* opts.session   : 로그인 세션 (없으면 비회원)
 * opts.nickname  : App.Auth.getNickname() 이 돌려줄 값
 * opts.rows      : get_leaderboard 가 돌려줄 행
 * opts.rpcErr    : RPC 가 오류를 돌려줌
 * opts.guestSrc  : 비회원 모듈 소스를 바꿔치기(돌연변이 검사용)
 * opts.skipGuest : 비회원 모듈을 아예 안 싣는다(원본만) */
function boot(opts) {
  opts = opts || {};
  const html =
    '<!doctype html><html><body>' +
    '<div id="page-ranking" style="display:none;"><div class="panel"><table>' +
    '<tbody id="leaderboard-body"><tr class="empty"><td colspan="5">불러오는 중...</td></tr></tbody>' +
    '</table><div class="leaderboard-my-rank" id="leaderboard-my-rank"></div></div></div>' +
    '</body></html>';
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://tl.test/", pretendToBeVisual: true });
  const win = dom.window;
  win.console = { warn() {}, log() {}, error() {} };

  const calls = { rpc: [], getSession: 0 };
  const client = {
    auth: {
      getSession: async () => {
        calls.getSession++;
        return { data: { session: opts.session || null }, error: null };
      },
    },
    rpc: async (name, args) => {
      calls.rpc.push({ name, args });
      if (opts.rpcErr) return { data: null, error: { message: "권한 없음" } };
      if (name === "get_leaderboard") return { data: opts.rows || [], error: null };
      return { data: [], error: null };
    },
  };

  win.eval(BUS_SRC);
  win.App.Config = { getDisplayCurrency: () => "USDT", USD_KRW: 1400 };
  win.eval(UTILS_SRC);                                  /* 진짜 숫자 서식 */
  win.App.Auth = { getNickname: () => opts.nickname || null };
  win.App.SupabaseClient = { get: () => client };

  if (!opts.skipGuest) win.eval(opts.guestSrc || GUEST_SRC); /* 실려 있기만 해도 스스로 시작 */
  win.eval(LB_SRC);                                     /* 수정 금지 원본 그대로 */

  const body = () => win.document.getElementById("leaderboard-body");
  return {
    win, calls, client, body,
    html: () => body().innerHTML,
    text: () => body().textContent,
    rows: () => body().querySelectorAll("tr:not(.empty)").length,
    원본그리기: () => win.App.Leaderboard.init(),
  };
}

(async function run() {
  console.log("\n비회원 랭킹 공개 (서버는 열려 있는데 화면이 막는 유형)");

  /* ---------- 0) 서버는 이미 열려 있다 ---------- */
  {
    ok("서버가 랭킹을 비회원(anon)에게 열어뒀다",
      /grant\s+execute\s+on\s+function\s+public\.get_leaderboard\s+to\s+anon/i.test(GUEST_SQL),
      "이게 없으면 화면만 열어도 데이터가 안 옵니다");
    ok("계급 점수도 비회원에게 열려 있다",
      /grant\s+execute\s+on\s+function\s+public\.rank_points_all\s+to\s+anon/i.test(GUEST_SQL));
    ok("index.html 이 비회원 랭킹 모듈을 싣는다",
      /<script src="js\/guest-leaderboard\.js"><\/script>/.test(INDEX),
      "파일만 있고 안 실으면 아무 일도 안 일어납니다");
  }

  /* ---------- 1) 비회원에게 실제 순위가 나온다 ---------- */
  {
    const t = boot({ rows: 서버행 });
    t.원본그리기();
    await sleep(80);
    ok("비회원인데 랭킹 행이 나온다", t.rows() === 3, "행 수=" + t.rows());
    ok("잠금 문구가 남아 있지 않다", t.text().indexOf(LOCK) === -1, t.text().slice(0, 60));
    ok("닉네임이 보인다", t.text().indexOf("Mang9") !== -1);
    ok("수익률 숫자가 보인다", /\+410\.67%/.test(t.html()), t.html().slice(0, 200));
    ok("총자산이 통화 서식으로 나온다", /\$510,669\.40/.test(t.html()));
    ok("손실 행은 하락 색을 쓴다", /pnl-negative[^>]*>-3\.25%|pnl-negative/.test(t.html()));
    ok("1·2·3위 배지 마크업이 원본과 같다",
      /leaderboard-rank-badge rank-1/.test(t.html()) && /leaderboard-rank-badge rank-3/.test(t.html()));
    ok("서버를 실제로 불렀다(상위 20)",
      t.calls.rpc.some((c) => c.name === "get_leaderboard" && c.args && c.args.limit_count === 20),
      JSON.stringify(t.calls.rpc));
    ok("비회원에게 '내 순위'는 비워둔다",
      win_text(t, "leaderboard-my-rank") === "");
  }

  /* ---------- 2) 원본이 다시 덮어도 되살아난다 ---------- */
  {
    const t = boot({ rows: 서버행 });
    t.원본그리기();
    await sleep(80);
    const 처음 = t.rows();

    /* 원본이 다시 그리는 상황 — 페이지를 나갔다 들어오거나 거래 이벤트가 올 때 */
    t.원본그리기();
    await sleep(80);
    ok("원본이 다시 그려도 순위가 유지된다", t.rows() === 3, "처음=" + 처음 + " 나중=" + t.rows());

    /* 원본이 잠금 문구를 직접 밀어 넣는 상황 */
    t.body().innerHTML = '<tr class="empty"><td colspan="5">' + LOCK + ".</td></tr>";
    await sleep(80);
    ok("잠금 문구로 덮어도 다시 채운다", t.rows() === 3 && t.text().indexOf(LOCK) === -1);

    /* 되돌이(무한 반복)에 빠지지 않는지 — 호출 횟수가 폭주하면 안 됩니다 */
    ok("되돌이에 빠지지 않는다(서버 호출 5회 미만)",
      t.calls.rpc.filter((c) => c.name === "get_leaderboard").length < 5,
      "호출=" + t.calls.rpc.length);
  }

  /* (2) 돌연변이 검사 — 다시 채우는 장치를 떼면 위 검사가 실패해야 합니다 */
  {
    const 망가진 = GUEST_SRC.replace("watchBody();", "/* 떼어냄 */");
    ok("돌연변이: 다시 채우는 장치를 떼면 티가 난다", 망가진 !== GUEST_SRC, "치환 실패");
    const t = boot({ rows: 서버행, guestSrc: 망가진 });
    t.원본그리기();
    await sleep(80);
    t.body().innerHTML = '<tr class="empty"><td colspan="5">' + LOCK + ".</td></tr>";
    await sleep(80);
    ok("돌연변이판은 잠금 문구로 되돌아간다(= 검사가 진짜다)",
      t.text().indexOf(LOCK) !== -1,
      "망가뜨렸는데도 통과하면 위 검사가 가짜입니다");
  }

  /* ---------- 3) 로그인 사용자 화면은 하나도 안 바뀐다 ---------- */
  {
    /* 원본만 실었을 때의 화면 */
    const 원본 = boot({ session: { user: { id: "u1" } }, nickname: "Mang9", rows: 서버행, skipGuest: true });
    원본.원본그리기();
    await sleep(80);

    /* 비회원 모듈까지 실었을 때의 화면 */
    const 같이 = boot({ session: { user: { id: "u1" } }, nickname: "Mang9", rows: 서버행 });
    같이.원본그리기();
    await sleep(80);

    ok("로그인 화면 마크업이 완전히 같다", 원본.html() === 같이.html(),
      "다르면 회귀입니다");
    ok("로그인 화면에도 순위가 그대로 나온다", 같이.rows() === 3);
    ok("'나' 강조가 그대로 남아 있다", /leaderboard-row-me/.test(같이.html()));
  }
  {
    /* 원본을 부르지 않았는데도 비회원 모듈이 손을 대면 안 됩니다 */
    const t = boot({ session: { user: { id: "u1" } }, nickname: "Mang9", rows: 서버행 });
    await sleep(120);
    ok("로그인 상태면 서버를 부르지 않는다",
      t.calls.rpc.length === 0, JSON.stringify(t.calls.rpc));
    ok("로그인 상태면 표를 건드리지 않는다",
      t.text().indexOf("불러오는 중") !== -1, t.text().slice(0, 60));
  }
  {
    /* 세션 확인이 안 되는 상황에서도 회원 화면을 건드리면 안 됩니다.
       모르면 아무것도 안 하는 쪽이 안전합니다. */
    const t = boot({ rows: 서버행 });
    t.client.auth.getSession = async () => { throw new Error("네트워크 끊김"); };
    t.win.App.GuestLeaderboard.refresh(true);
    await sleep(80);
    ok("세션을 못 물어보면 아무것도 하지 않는다",
      t.calls.rpc.filter((c) => c.name === "get_leaderboard").length === 0);
  }

  /* (3) 돌연변이 검사 — 로그인 판정이 틀어지면 위 검사가 실패해야 합니다.
     (실제로 일어날 법한 고장: 세션 확인이 어긋나 회원을 비회원으로 봄) */
  {
    const 망가진 = GUEST_SRC
      .replace("if (loggedInSync()) { isGuest = false; return Promise.resolve(false); }",
               "/* 판정 없음 */")
      .replace("isGuest = !(r && r.data && r.data.session) && !loggedInSync();",
               "isGuest = true;");
    ok("돌연변이: 로그인 판정을 망가뜨릴 수 있다",
      망가진 !== GUEST_SRC && 망가진.indexOf("isGuest = true;") !== -1, "치환 실패");
    const t = boot({ session: { user: { id: "u1" } }, nickname: "Mang9", rows: 서버행, guestSrc: 망가진 });
    await sleep(120);
    ok("돌연변이판은 로그인 상태에서도 서버를 부른다(= 검사가 진짜다)",
      t.calls.rpc.length > 0,
      "망가뜨렸는데도 통과하면 위 검사가 가짜입니다");
  }

  /* ---------- 4) 랭킹만 공개다 ---------- */
  {
    ok("비회원 모듈은 랭킹 말고 다른 것을 부르지 않는다",
      (GUEST_SRC.match(/\.rpc\(\s*"([^"]+)"/g) || []).every((s) => /get_leaderboard/.test(s)),
      (GUEST_SRC.match(/\.rpc\(\s*"([^"]+)"/g) || []).join(", "));
    ok("거래내역은 계속 로그인해야 본다",
      /if \(!userId\)[\s\S]{0,200}renderMessage\("로그인 후 확인할 수 있습니다\."\)/.test(read("js/trade-history.js")));
    ok("개인정보는 계속 로그인해야 본다",
      /logged_in !== true[\s\S]{0,160}로그인 후 확인할 수 있습니다/.test(read("js/my-private-info.js")));
    ok("TL 핫딜 잔액은 계속 가려진다",
      /!b\.logged_in[\s\S]{0,200}로그인 후 확인할 수 있습니다/.test(read("js/tl-hotdeal.js")));
    ok("TL 마켓 잔액은 계속 가려진다",
      /!b\.logged_in[\s\S]{0,200}로그인 후 확인할 수 있습니다/.test(read("js/tl-market.js")));
  }

  /* ---------- 5) 데이터가 없거나 못 받을 때 지어내지 않는다 ---------- */
  {
    const t = boot({ rows: [] });
    t.원본그리기();
    await sleep(80);
    ok("행이 0개면 '아직 랭킹 데이터가 없습니다'", /아직 랭킹 데이터가 없습니다/.test(t.text()), t.text());
  }
  {
    const t = boot({ rpcErr: true });
    t.원본그리기();
    await sleep(80);
    ok("서버가 거절하면 가짜 숫자를 만들지 않는다",
      t.rows() === 0 && !/\$/.test(t.html()), t.html().slice(0, 120));
  }

  /* ---------- 6) 수정 금지 파일을 건드리지 않았다 ---------- */
  {
    ok("js/leaderboard.js 의 잠금 코드가 그대로 있다",
      /renderMessage\("로그인 후 확인할 수 있습니다\."\);\s*\n\s*return;/.test(LB_SRC),
      "원본을 고쳐서 해결했다면 수정 금지 규칙 위반입니다");
    ok("비회원 모듈이 원본 표시 규칙을 그대로 따라한다",
      GUEST_SRC.indexOf('leaderboard-rank-badge rank-1') !== -1 &&
      GUEST_SRC.indexOf("App.Utils.formatCurrencySigned(r.profit_amount)") !== -1);
  }

  console.log("\n" + (fail === 0 ? "[32m모두 통과[0m" : "[31m실패 " + fail + "건[0m") + " (" + pass + "/" + (pass + fail) + ")");
  process.exit(fail === 0 ? 0 : 1);
})();

function win_text(t, id) {
  const n = t.win.document.getElementById(id);
  return n ? n.textContent : null;
}
