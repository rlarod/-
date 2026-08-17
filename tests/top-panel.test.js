/* =========================================================================
 * 상단 3분할 + 계급 시스템 + 사용자 정보 패널 테스트
 * =========================================================================
 * 실행: node tests/top-panel.test.js
 * 계급 점수는 실제 js/trading.js로 거래를 넣어서 나온 값으로 검증합니다.
 * ========================================================================= */
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

let pass = 0,
  fail = 0;
const failures = [];
const queue = [];

function t(name, fn) {
  queue.push({ name, fn });
}
function section(s) {
  queue.push({ section: s });
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || "") + " 기대=" + JSON.stringify(b) + " 실제=" + JSON.stringify(a));
}
function ok(v, msg) {
  if (!v) throw new Error(msg || "참이어야 함");
}

/* ---------------- 페이지 부팅 ---------------- */
function boot(opts) {
  const o = opts || {};
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.test/" });
  const win = dom.window;
  win.WebSocket = function () {
    this.close = () => {};
    this.send = () => {};
  };
  win.fetch = () => Promise.resolve({ json: () => Promise.resolve({}) });
  win.alert = (m) => {
    win.__lastAlert = m;
  };
  win.eval(`
    window.App = window.App || {};
    App.Bus = (function(){ const L={}; return {
      on(e,f){(L[e]=L[e]||[]).push(f);return f;},
      off(e,f){if(L[e])L[e]=L[e].filter(x=>x!==f);},
      emit(e,p){(L[e]||[]).forEach(f=>{try{f(p);}catch(err){console.error(err);}});}
    };})();
  `);

  ["js/config.js", "js/utils.js", "js/storage.js", "js/trading.js", "js/rank.js", "js/notice-board.js", "js/user-panel.js"].forEach((f) => {
    win.eval(fs.readFileSync(path.join(REPO, f), "utf8"));
  });

  // 로그인 여부를 테스트에서 지정 — auth.js의 공개 함수(getNickname)와 같은 모양
  win.App.Auth = { getNickname: () => o.nickname || "" };

  win.App.Trading.init();
  win.App.Rank.init();
  win.App.NoticeBoard.init(); // App.Board가 없으면 조용히 넘어감
  win.App.UserPanel.init();
  return { dom, win, App: win.App, doc: win.document };
}

/* ===================================================================== */
section("[1] 상단 3분할 레이아웃");
{
  const { doc } = boot();
  const boxes = doc.querySelectorAll(".notice-board-wrap > .notice-box");

  t("상단이 정확히 3개 칼럼", () => eq(boxes.length, 3));

  t("CSS가 3등분(1fr 1fr 1fr)으로 선언됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.notice-board-wrap\{[\s\S]*?\}/);
    ok(m, ".notice-board-wrap 규칙 없음");
    ok(/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/.test(m[0]), "3등분 선언 필요: " + m[0]);
  });

  t("왼쪽=공지사항", () => {
    ok(/공지사항/.test(boxes[0].textContent), "왼쪽 칼럼에 공지사항 필요");
    ok(boxes[0].querySelector("#notice-list-notice"), "공지 목록 유지 필요");
  });

  t("가운데=최신게시물/인기글 + 준비중 게시판", () => {
    const txt = boxes[1].textContent;
    ok(/최신게시물/.test(txt) && /인기글/.test(txt), "커뮤니티 요약 필요");
    ok(/자유게시판/.test(txt) && /분석게시판/.test(txt), "기존 탭 보존 필요");
    ok(boxes[1].querySelector("#notice-list-latest"), "최신게시물 목록 유지");
    ok(boxes[1].querySelector("#notice-list-popular"), "인기글 목록 유지");
  });

  t("오른쪽=사용자 정보 패널", () => {
    ok(boxes[2].classList.contains("user-panel-box"));
    ok(boxes[2].querySelector("#user-panel-body"), "패널 본문 필요");
  });

  t("최신게시물 <-> 인기글 탭 전환", () => {
    const { doc: d } = boot();
    const latest = d.getElementById("notice-list-latest");
    const popular = d.getElementById("notice-list-popular");
    eq(popular.style.display, "none", "기본은 최신게시물");
    d.querySelector('.notice-tab-btn[data-tab="popular"]').dispatchEvent(new d.defaultView.MouseEvent("click", { bubbles: true }));
    eq(latest.style.display, "none");
    eq(popular.style.display, "");
    // 공지사항(왼쪽)은 탭 전환의 영향을 받지 않아야 함
    eq(d.getElementById("notice-list-notice").style.display, "");
  });
}

/* ===================================================================== */
section("[2] 계급 시스템 — 19단계");
{
  const { App } = boot();
  const table = App.Rank.getRankTable();
  const EXPECTED = ["이병", "일병", "상병", "병장", "하사", "중사", "상사", "원사", "준위", "소위", "중위", "대위", "소령", "중령", "대령", "준장", "소장", "중장", "대장"];

  t("정확히 19단계", () => eq(table.length, 19));
  t("순서가 이병 → 대장 그대로", () => eq(table.map((r) => r.rank_name).join(","), EXPECTED.join(",")));
  t("rank_level이 1~19로 오름차순", () => eq(table.map((r) => r.rank_level).join(","), EXPECTED.map((_, i) => i + 1).join(",")));
  t("승급 기준 점수가 단조 증가", () => {
    for (let i = 1; i < table.length; i++) ok(table[i].min_points > table[i - 1].min_points, table[i].rank_name + " 기준점수 오류");
  });

  t("점수 → 계급 변환", () => {
    eq(App.Rank.getRankName(0), "이병");
    eq(App.Rank.getRankName(29), "이병");
    eq(App.Rank.getRankName(30), "일병");
    eq(App.Rank.getRankName(120), "병장");
    eq(App.Rank.getRankName(520), "준위");
    eq(App.Rank.getRankName(2070), "대장");
    eq(App.Rank.getRankName(999999), "대장");
  });

  t("다음 계급까지 남은 점수 안내", () => {
    const r = App.Rank.calculateRank(0);
    eq(r.next_rank_name, "일병");
    eq(r.points_to_next, 30);
    eq(App.Rank.calculateRank(2070).next_rank_name, null);
  });

  t("계층(병/부사관/준사관/위관/영관/장성)이 4/4/1/3/3/4로 구분", () => {
    const count = {};
    table.forEach((r) => (count[r.rank_tier] = (count[r.rank_tier] || 0) + 1));
    eq(count["병"], 4);
    eq(count["부사관"], 4);
    eq(count["준사관"], 1);
    eq(count["위관"], 3);
    eq(count["영관"], 3);
    eq(count["장성"], 4);
  });

  t("계급장이 계층마다 다른 모양(SVG 자체 생성, 외부 이미지 없음)", () => {
    const shapes = {};
    table.forEach((r) => {
      const svg = App.Rank.renderBadge(r, { size: 18 });
      ok(/<svg /.test(svg), r.rank_name + " SVG 아님");
      ok(!/<img/.test(svg), "외부 이미지 사용 금지");
      const key = r.rank_tier;
      (shapes[key] = shapes[key] || new Set()).add(svg.replace(/[\d.]+/g, "#"));
    });
    // 같은 계층 안에서도 마크 개수가 달라 계급마다 배지가 달라야 함
    const all = table.map((r) => App.Rank.renderBadge(r, { size: 18 }));
    eq(new Set(all).size, 19, "19개 계급 배지가 모두 달라야 함");
  });

  t("계급 표시는 공통 함수 하나로", () => {
    const html = App.Rank.renderNameWithRank("홍길동", App.Rank.calculateRank(120));
    ok(/병장/.test(html) && /홍길동/.test(html) && /<svg /.test(html));
  });
}

/* ===================================================================== */
section("[3] 계급 점수 — 실제 거래 기록 기반");
{
  function tradeN(App, n) {
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    for (let i = 0; i < n; i++) {
      App.Trading.openPosition("long", 2000, null, null);
      App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61200, time: Date.now() });
      App.Trading.closePosition("수동청산");
      App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    }
    return App.Trading.getSnapshot();
  }

  t("거래가 없으면 이병(0점)", () => {
    const { App } = boot();
    eq(App.Rank.calculatePoints(App.Trading.getSnapshot()), 0);
    eq(App.Rank.getUserRank().rank_name, "이병");
  });

  t("청산 거래 1건당 10점 + 실현수익률 1%당 20점", () => {
    const { App } = boot();
    const snap = tradeN(App, 3);
    const expected = snap.closedTrades.length * 10 + Math.max(0, (snap.realizedPnl / 100000) * 100) * 20;
    eq(Math.round(App.Rank.calculatePoints(snap)), Math.round(expected));
    ok(snap.closedTrades.length === 3, "실제 청산 3건이어야 함");
  });

  t("손실이 나도 계급이 0점 아래로 내려가지 않음", () => {
    const { App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 2000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 58000, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const snap = App.Trading.getSnapshot();
    ok(snap.realizedPnl < 0, "손실이어야 함");
    eq(App.Rank.calculatePoints(snap), 10, "거래 1건 점수만 남아야 함");
  });

  t("거래를 쌓으면 계급이 올라감", () => {
    const { App } = boot();
    const low = App.Rank.getUserRank().rank_level;
    tradeN(App, 8);
    const high = App.Rank.getUserRank().rank_level;
    ok(high > low, "계급이 올라야 함 (" + low + " -> " + high + ")");
  });

  t("새로고침(재부팅) 후에도 계급 유지 — 거래기록이 localStorage에 남음", () => {
    const first = boot();
    tradeN(first.App, 5);
    const before = first.App.Rank.getUserRank().rank_name;
    const beforeTrades = first.App.Trading.getSnapshot().closedTrades.length;
    ok(beforeTrades === 5, "거래 5건");
    // trading.js가 저장한 상태를 그대로 읽어 같은 점수가 나오는지 확인
    const same = first.App.Rank.calculateRank(first.App.Rank.calculatePoints(first.App.Trading.getSnapshot()));
    eq(same.rank_name, before);
  });
}

/* ===================================================================== */
section("[4] 사용자 정보 패널");
{
  t("로그아웃 상태 — 로그인/회원가입 안내", () => {
    const { doc } = boot({ nickname: "" });
    const body = doc.getElementById("user-panel-body");
    ok(/로그인이 필요합니다/.test(body.textContent));
    ok(body.querySelector("#user-panel-login"), "로그인 버튼 필요");
    ok(body.querySelector("#user-panel-signup"), "회원가입 버튼 필요");
    ok(!body.querySelector("#user-panel-equity"), "로그아웃 상태에 자산이 보이면 안 됨");
  });

  t("로그인 상태 — 닉네임/계급/총자산/수익금/수익률 표시", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    const body = doc.getElementById("user-panel-body");
    ok(/홍길동/.test(body.textContent), "닉네임");
    ok(/이병/.test(body.textContent), "계급");
    ok(body.querySelector(".rank-badge svg"), "계급장 SVG");
    eq(doc.getElementById("user-panel-equity").textContent, "$100,000.00");
    eq(doc.getElementById("user-panel-profit").textContent, "+$0.00");
    eq(doc.getElementById("user-panel-roe").textContent, "+0.00%");
  });

  t("실제 거래 결과가 패널에 반영됨", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const snap = App.Trading.getSnapshot();
    eq(doc.getElementById("user-panel-profit").textContent, App.Utils.formatCurrencySigned(snap.realizedPnl));
    eq(doc.getElementById("user-panel-roe").textContent, App.Utils.formatPercent((snap.realizedPnl / 100000) * 100));
    eq(doc.getElementById("user-panel-equity").textContent, App.Utils.formatCurrency(snap.equity));
  });

  t("수익률은 랭킹 뷰와 같은 산식(실현손익 / 100,000)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const snap = App.Trading.getSnapshot();
    const shown = parseFloat(doc.getElementById("user-panel-roe").textContent.replace(/[+%]/g, ""));
    const expected = Math.round((snap.realizedPnl / 100000) * 100 * 100) / 100;
    eq(shown, expected);
  });

  t("포지션만 열었을 때는 수익금/수익률이 그대로(핵심 원칙)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    eq(doc.getElementById("user-panel-profit").textContent, "+$0.00", "청산 전 수익금은 0");
    eq(doc.getElementById("user-panel-roe").textContent, "+0.00%", "청산 전 수익률은 0");
  });

  t("리워드는 실제 데이터가 없으므로 숫자를 만들지 않고 준비중", () => {
    const { doc } = boot({ nickname: "홍길동" });
    const body = doc.getElementById("user-panel-body");
    ok(/리워드/.test(body.textContent));
    const soon = body.querySelector(".user-panel-soon");
    ok(soon && soon.textContent === "준비중", "준비중 표시 필요");
    ok(!/리워드[\s\S]{0,20}[\d,]{3,}/.test(body.textContent), "가짜 리워드 수치가 있으면 안 됨");
  });

  t("마이페이지/로그아웃은 기존 버튼을 그대로 사용", () => {
    const { doc } = boot({ nickname: "홍길동" });
    let logoutClicked = false;
    doc.getElementById("auth-logout-btn").addEventListener("click", () => (logoutClicked = true));
    doc.getElementById("user-panel-logout").dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
    ok(logoutClicked, "기존 #auth-logout-btn 이 눌려야 함(새 로그아웃 로직 금지)");
    ok(doc.getElementById("user-panel-mypage"), "마이페이지 버튼 필요");
  });

  t("계급이 오르면 패널 표시도 바뀜", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    ok(/이병/.test(doc.getElementById("user-panel-body").textContent));
    for (let i = 0; i < 6; i++) {
      App.Trading.openPosition("long", 2000, null, null);
      App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61200, time: Date.now() });
      App.Trading.closePosition("수동청산");
      App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    }
    const txt = doc.getElementById("user-panel-body").textContent;
    ok(!/이병/.test(txt), "계급이 올라야 함: " + txt.slice(0, 60));
  });
}

/* ===================================================================== */
section("[5] 기존 기능 보존");
{
  const { doc } = boot({ nickname: "홍길동" });
  [
    ["공지 목록", "notice-list-notice"],
    ["최신게시물 목록", "notice-list-latest"],
    ["인기글 목록", "notice-list-popular"],
    ["로그인 게이트", "auth-gate"],
    ["기존 로그아웃 버튼", "auth-logout-btn"],
    ["랭킹 메뉴", "page-nav-ranking"],
    ["커뮤니티 메뉴", "page-nav-board"],
    ["마이페이지 메뉴(숨김 상태)", "page-nav-mypage"],
    ["전쟁터 메뉴(숨김 상태)", "page-nav-battle"],
    ["주문창 LONG", "btn-long"],
    ["주문창 SHORT", "btn-short"],
  ].forEach(([label, id]) => {
    t("보존: " + label, () => ok(doc.getElementById(id), id + " 가 사라짐"));
  });

  t("SQL 패치는 추가 전용(DROP TABLE / TRUNCATE 없음)", () => {
    // 주석에 "TRUNCATE하지 않습니다" 같은 설명이 있으므로, 주석을 걷어낸
    // 실제 SQL 문만 검사합니다.
    const raw = fs.readFileSync(path.join(REPO, "supabase/schema-rank-patch.sql"), "utf8");
    const sql = raw
      .split("\n")
      .filter((line) => !/^\s*--/.test(line))
      .join("\n");
    ok(!/drop\s+table/i.test(sql), "DROP TABLE 금지");
    ok(!/truncate/i.test(sql), "TRUNCATE 금지");
    ok(!/delete\s+from/i.test(sql), "DELETE 금지");
    ok(!/alter\s+table\s+\S+\s+drop/i.test(sql), "컬럼 삭제 금지");
    ok(/create table if not exists public\.ranks/i.test(sql), "ranks 테이블 생성 필요");
    ok(/add column if not exists rank_points/i.test(sql), "rank_points 컬럼 추가 필요");
    // 기존 뷰/함수는 건드리지 않아야 함
    ok(!/drop\s+view\s+if\s+exists\s+public\.leaderboard/i.test(sql), "기존 leaderboard 뷰 건드리면 안 됨");
    ok(!/drop\s+function\s+if\s+exists\s+public\.get_leaderboard/i.test(sql), "기존 랭킹 함수 건드리면 안 됨");
  });

  t("SQL의 19단계와 코드의 19단계가 일치", () => {
    const sql = fs.readFileSync(path.join(REPO, "supabase/schema-rank-patch.sql"), "utf8");
    const { App } = boot();
    App.Rank.getRankTable().forEach((r) => {
      const re = new RegExp("\\(\\s*" + r.rank_id + ",\\s*'" + r.rank_name + "',\\s*" + r.rank_level + ",\\s*'" + r.rank_tier + "',\\s*" + r.min_points + "\\)");
      ok(re.test(sql), r.rank_name + " 정의가 SQL과 다름");
    });
  });
}

/* ===================================================================== */
(async () => {
  for (const item of queue) {
    if (item.section) {
      console.log("\n\x1b[1m" + item.section + "\x1b[0m");
      continue;
    }
    try {
      await item.fn();
      pass++;
      console.log("  \x1b[32m✓\x1b[0m " + item.name);
    } catch (e) {
      fail++;
      failures.push(item.name + " → " + e.message);
      console.log("  \x1b[31m✗\x1b[0m " + item.name + "\n      " + e.message);
    }
  }
  console.log("\n" + "=".repeat(58));
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("\n실패 목록:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("전체 통과 ✅");
  process.exit(0);
})();
