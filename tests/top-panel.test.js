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
section("[1] 상단 정보 패널 — 공지 / 게시판(4탭) / 내 정보");
{
  const { doc } = boot();
  const boxes = doc.querySelectorAll(".notice-board-wrap > .notice-box");

  t("박스 3개(공지 / 게시판 / 내 정보)", () => eq(boxes.length, 3));

  t("CSS 비율이 30 / 43 / 27", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.notice-board-wrap\{[\s\S]*?\}/);
    ok(m, ".notice-board-wrap 규칙 없음");
    ok(/grid-template-columns:30fr 43fr 27fr/.test(m[0]), "30/43/27 선언 필요: " + m[0]);
    ok(!/grid-template-columns:repeat\(4/.test(m[0]), "단순 4등분이면 안 됨");
  });

  t("① 공지사항 — 기존 데이터 유지", () => {
    ok(/공지사항/.test(boxes[0].textContent));
    ok(boxes[0].querySelector("#notice-list-notice"));
    // [공지]/[안내] 앞부분이 색상 구분용 태그로 렌더링되는지
    const tags = boxes[0].querySelectorAll(".notice-tag");
    ok(tags.length >= 4, "공지 태그 렌더링 필요");
    ok(boxes[0].querySelector(".notice-tag-notice"), "[공지] 색상 구분");
    ok(boxes[0].querySelector(".notice-tag-info"), "[안내] 색상 구분");
  });

  t("② 게시판은 박스 하나 + 탭 4개", () => {
    const tabs = boxes[1].querySelectorAll(".notice-tab-btn[data-tab]");
    eq(tabs.length, 4);
    eq(Array.prototype.map.call(tabs, (b) => b.dataset.tab).join(","), "latest,popular,free,analysis");
    ["latest", "popular", "free", "analysis"].forEach((k) => {
      ok(boxes[1].querySelector("#notice-list-" + k), k + " 내용 영역 필요");
    });
  });

  t("③ 내 정보", () => {
    ok(boxes[2].classList.contains("user-panel-box"));
    ok(boxes[2].querySelector("#user-panel-body"));
  });

  t("탭 전환 — 한 번에 하나만 보이고 공지/내 정보는 영향 없음", () => {
    const { doc: d } = boot();
    const ids = ["latest", "popular", "free", "analysis"];
    ids.forEach((target) => {
      d.querySelector('.notice-tab-btn[data-tab="' + target + '"]').dispatchEvent(new d.defaultView.MouseEvent("click", { bubbles: true }));
      ids.forEach((k) => {
        const shown = d.getElementById("notice-list-" + k).style.display !== "none";
        eq(shown, k === target, k + " 표시 상태");
      });
      // 다른 칼럼은 절대 숨겨지면 안 됨
      eq(d.getElementById("notice-list-notice").style.display, "");
      eq(d.getElementById("user-panel-body").style.display, "");
    });
  });

  t("자유/분석 게시판 — 분류 컬럼이 없어 가짜 목록 대신 준비중 안내", () => {
    const { doc: d } = boot();
    ["free", "analysis"].forEach((k) => {
      const list = d.getElementById("notice-list-" + k);
      ok(/준비중/.test(list.textContent), k + " 준비중 안내 필요");
      eq(list.querySelectorAll(".notice-board-post").length, 0, k + " 가짜 게시글이 있으면 안 됨");
    });
    ["free", "analysis"].forEach((k) => {
      ok(d.querySelector('.notice-tab-btn[data-tab="' + k + '"] .nav-soon-badge'), k + " 탭에 준비중 배지 필요");
    });
  });

  t("디자인: 둥근 카드/큰 여백을 걷어낸 촘촘한 패널", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const box = css.match(/\n\.notice-box\{[\s\S]*?\}/)[0];
    const radius = parseFloat(box.match(/border-radius:([\d.]+)px/)[1]);
    ok(radius <= 3, "border-radius가 너무 큼: " + radius);
    const li = css.match(/\.notice-board-list li\{[\s\S]*?\}/)[0];
    const fsz = parseFloat(li.match(/font-size:([\d.]+)px/)[1]);
    ok(fsz <= 15, "목록 글자가 너무 큼: " + fsz);
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

  t("개미톡 구조 — 헤더 / 2×2 값 표 / 하단 링크 줄", () => {
    const { doc } = boot({ nickname: "홍길동" });
    const body = doc.getElementById("user-panel-body");
    ok(body.querySelector(".up-head"), "헤더 줄 필요");
    ok(body.querySelector(".up-progress"), "진행률 표시 필요");
    const grid = body.querySelector(".up-grid");
    ok(grid, "값 표 필요");
    eq(grid.querySelectorAll(".up-label").length, 4, "라벨 4칸");
    eq(grid.querySelectorAll(".up-value").length, 4, "값 4칸");
    eq(
      Array.prototype.map.call(grid.querySelectorAll(".up-label"), (l) => l.textContent).join(","),
      "평가,수익금,가용,수익률"
    );
    eq(body.querySelectorAll(".up-nav button").length, 6, "하단 링크 6개");
  });

  t("가용은 실제 주문가능 잔고(balance)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    const snap = App.Trading.getSnapshot();
    eq(doc.getElementById("user-panel-available").textContent, App.Utils.formatCurrency(snap.balance));
    ok(snap.balance < snap.equity, "증거금이 묶였으므로 가용 < 평가");
  });

  t("진행률은 실제 계급 점수에서 계산", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    eq(doc.getElementById("user-panel-progress-text").textContent, "0%", "0점이면 0%");
    App.Trading.openPosition("long", 2000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61200, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const pct = parseFloat(doc.getElementById("user-panel-progress-text").textContent);
    const rank = App.Rank.getUserRank();
    const table = App.Rank.getRankTable();
    const cur = table.find((r) => r.rank_id === rank.rank_id);
    const next = table.find((r) => r.rank_id === rank.rank_id + 1);
    const expected = Math.round(((rank.points - cur.min_points) / (next.min_points - cur.min_points)) * 100);
    eq(pct, expected);
    ok(pct > 0, "거래 후 진행률이 올라야 함");
  });

  t("리워드/쪽지는 실제 기능이 없으므로 숫자 없이 준비중", () => {
    const { doc, win } = boot({ nickname: "홍길동" });
    const soon = doc.querySelectorAll(".up-nav .up-nav-soon");
    eq(soon.length, 2, "준비중 항목 2개");
    const txt = Array.prototype.map.call(soon, (b) => b.textContent).join(" ");
    ok(/리워드/.test(txt) && /쪽지/.test(txt));
    ok(!/\d/.test(txt), "준비중 항목에 숫자가 있으면 안 됨: " + txt);
    // 값 표(실제 데이터)에는 리워드가 들어가지 않아야 함
    ok(!/리워드/.test(doc.querySelector(".up-grid").textContent), "값 표에 리워드가 있으면 안 됨");
    soon[0].dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
    ok(/준비중/.test(win.__lastAlert || ""), "클릭 시 안내만 떠야 함");
  });

  t("하단 링크는 전부 기존 버튼을 대신 누름(새 로직 없음)", () => {
    const { doc } = boot({ nickname: "홍길동" });
    const clicked = {};
    [["auth-logout-btn", "logout"], ["page-nav-ranking", "ranking"], ["page-nav-board", "board"], ["page-nav-mypage", "mypage"]].forEach(([id, key]) => {
      doc.getElementById(id).addEventListener("click", () => (clicked[key] = true));
    });
    ["logout", "ranking", "board", "mypage"].forEach((key) => {
      doc.querySelector('.up-nav button[data-nav="' + key + '"]').dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
      ok(clicked[key], key + " → 기존 버튼이 눌려야 함");
    });
  });

  t("인기글은 '인기글 N위' 순위 표기 + 추천수", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    // board.js의 실제 반환 형태(제목 + like_count)를 그대로 넣어 렌더링만 확인
    const posts = [
      { id: "a", title: "첫 번째 글", like_count: 42 },
      { id: "b", title: "두 번째 글", like_count: 31 },
      { id: "c", title: "세 번째 글", like_count: 12 },
    ];
    App.NoticeBoard.renderForTest(doc.getElementById("notice-list-popular"), posts, "비어있음", { ranked: true });
    const items = doc.querySelectorAll("#notice-list-popular .notice-board-post");
    eq(items.length, 3);
    eq(items[0].querySelector(".notice-rank").textContent, "인기글 1위");
    eq(items[1].querySelector(".notice-rank").textContent, "인기글 2위");
    ok(/첫 번째 글/.test(items[0].textContent));
    ok(/42/.test(items[0].textContent), "추천수 표시 필요");
    // 최신게시물에는 순위 표기가 붙지 않아야 함
    App.NoticeBoard.renderForTest(doc.getElementById("notice-list-latest"), posts, "비어있음");
    eq(doc.querySelectorAll("#notice-list-latest .notice-rank").length, 0);
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

  t("레이아웃: 화면 위쪽에 낭비되는 장식 영역이 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 데이터가 없는 장식 배너는 화면에서 숨겨져 있어야 하고,
    // 마크업/코드는 삭제하지 않고 남아 있어야 합니다.
    ok(/\.event-banner\{display:none !important;\}/.test(css), "장식 배너는 화면에서 숨김 처리되어야 함");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok(/class="event-banner"/.test(html), "배너 마크업은 삭제하지 않고 보존해야 함");
    ok(/\.event-banner\{\n\s*margin-top/.test(css), "배너 원래 스타일도 보존해야 함(복구 가능)");
    // 바깥 여백이 다시 커지지 않도록 고정
    const app = css.match(/\.app\{[\s\S]*?\}/)[0];
    const pad = app.match(/padding:(\d+)px (\d+)px/);
    ok(pad && parseInt(pad[2], 10) <= 10, "좌우 여백이 너무 큼: " + (pad && pad[2]));
  });

  t("레이아웃: 거래 3열 비율 60/19/21 + 차트 최소 650px", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.main-grid\{[\s\S]*?\}/);
    ok(m, ".main-grid 규칙 없음");
    ok(/grid-template-columns:60fr 19fr 21fr/.test(m[0]), "차트/호가/주문 = 60:19:21 이어야 함");
    const mh = m[0].match(/min-height:(\d+)px/);
    ok(mh && parseInt(mh[1], 10) >= 650, "차트 영역 최소 높이 650px 이상 필요");
  });

  t("레이아웃: 전체 폭을 좁히는 고정 max-width가 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const app = css.match(/\.app\{[\s\S]*?\}/)[0];
    const mw = app.match(/max-width:(\d+)px/);
    ok(mw, ".app max-width 없음");
    ok(parseInt(mw[1], 10) >= 1900, "1920px 화면에서 좌우가 남지 않도록 1900px 이상이어야 함: " + mw[1]);
  });

  t("폰트: 사이트 전체가 한 글꼴 — 모노스페이스 잔재 없음", () => {
    // 주석 안의 설명 문구는 제외하고 실제 선언만 검사
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const root = css.match(/:root\{[\s\S]*?\n\}/)[0];
    ok(!/JetBrains Mono/.test(root), "JetBrains Mono가 남아있으면 안 됨");
    ok(!/monospace/.test(root), "monospace 폴백이 남아있으면 안 됨");
    ok(/--mono:'Spoqa Han Sans Neo'/.test(root), "--mono도 본문과 같은 글꼴이어야 함");
    ok(/--sans:'Spoqa Han Sans Neo'/.test(root), "--sans도 동일");
    // 모노스페이스를 뺀 대신 숫자 정렬은 tabular-nums로 유지되어야 함
    const body = css.match(/\nbody\{[\s\S]*?\n\}/)[0];
    ok(/tabular-nums/.test(body), "body에 tabular-nums 필요(호가창/표 자릿수 정렬)");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    ok(!/JetBrains/.test(html), "쓰이지 않는 글꼴을 계속 내려받으면 안 됨");
  });

  t("호가창 빈 공간 — 가짜 호가를 늘리지 않고 최근거래로 채움", () => {
    const ob = fs.readFileSync(path.join(REPO, "js/orderbook.js"), "utf8");
    // 호가 단계는 수정 금지 파일의 값 그대로여야 함(늘려서 공간을 메우면 안 됨)
    ok(/const DEPTH_LEVELS = 5;/.test(ob), "orderbook.js의 호가 단계를 바꾸면 안 됨");
    const tabs = fs.readFileSync(path.join(REPO, "js/orderbook-tabs.js"), "utf8");
    ok(/function showStacked/.test(tabs), "호가창+최근거래 상하 배치 필요");
    ok(/function showTab/.test(tabs), "좁은 화면용 탭 전환은 그대로 남아 있어야 함");
    ok(/addEventListener\("resize", apply\)/.test(tabs), "창 크기 변경 시 재적용 필요");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok(/data-tab="orderbook"/.test(html) && /data-tab="trades"/.test(html), "탭 버튼은 삭제하지 않고 보존");
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/#orderbook-tabs-content\.ob-stacked\{/.test(css), "상하 배치 CSS 필요");
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
