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

  ["js/config.js", "js/utils.js", "js/storage.js", "js/trading.js", "js/rank.js", "js/notice-board.js", "js/user-panel.js", "js/ad-slots.js"].forEach((f) => {
    win.eval(fs.readFileSync(path.join(REPO, f), "utf8"));
  });

  // 로그인 여부를 테스트에서 지정 — auth.js의 공개 함수(getNickname)와 같은 모양
  win.App.Auth = { getNickname: () => o.nickname || "" };

  win.App.Trading.init();
  win.App.AdSlots.init();
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

  t("CSS 비율이 30 / 45 / 25 (공지 / 커뮤니티 / 내 정보)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.notice-board-wrap\{[\s\S]*?\}/);
    ok(m, ".notice-board-wrap 규칙 없음");
    const cols = m[0].match(/grid-template-columns:minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\)/);
    ok(cols, "3열 비율 선언 필요: " + m[0]);
    eq([+cols[1], +cols[2], +cols[3]].join("/"), "30/45/25");
    // minmax(0,...)이 빠지면 내 정보 칼럼이 내용 최소폭에 걸려 비율이 어긋납니다
    ok(/minmax\(0,/.test(m[0]), "minmax(0,...)로 축소를 허용해야 함");
  });

  t("탭 색: 비활성은 연회색 배경, 활성은 흰 배경 + 파란 글씨/밑줄", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const base = css.match(/\n\.notice-tab-btn\{[\s\S]*?\}/)[0];
    ok(/background:var\(--surface2\)/.test(base), "비활성 탭은 연회색 배경이어야 함");
    ok(/color:var\(--text-dim\)/.test(base), "비활성 탭은 어두운 회색 글씨여야 함");
    const active = css.match(/\.notice-tab-btn\.active\{[^}]*\}/)[0];
    ok(/background:var\(--surface\)/.test(active), "활성 탭은 흰 배경이어야 함");
    ok(/color:var\(--gold\)/.test(active), "활성 탭은 파란 글씨여야 함");
    ok(/border-bottom-color:var\(--gold\)/.test(active), "활성 탭은 파란 밑줄이어야 함");
  });

  t("게시물에 추천 수와 댓글 수가 함께 표시됨", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.NoticeBoard.renderForTest(
      doc.getElementById("notice-list-latest"),
      [
        { id: "a", title: "댓글 있는 글", like_count: 7, comment_count: 23 },
        { id: "b", title: "댓글 없는 글", like_count: 2, comment_count: 0 },
      ],
      "없음"
    );
    const items = doc.querySelectorAll("#notice-list-latest .notice-board-post");
    eq(items[0].querySelector(".notice-comment-count").textContent, "(23)");
    ok(/👍7/.test(items[0].textContent), "추천 수 표시 필요");
    // 댓글이 0이면 (0)을 붙이지 않습니다
    eq(items[1].querySelector(".notice-comment-count"), null);
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

  t("디자인: 둥근 카드는 걷어내되 글자는 거래소 수준으로 읽히는 크기", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const box = css.match(/\n\.notice-box\{[\s\S]*?\}/)[0];
    const radius = parseFloat(box.match(/border-radius:([\d.]+)px/)[1]);
    ok(radius <= 3, "border-radius가 너무 큼: " + radius);
    const li = css.match(/\.notice-board-list li\{[\s\S]*?\}/)[0];
    const fsz = parseFloat(li.match(/font-size:([\d.]+)px/)[1]);
    ok(fsz >= 16, "목록 글자가 너무 작음: " + fsz);
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
    ok(/class="event-banner[^"]*"/.test(html), "배너 마크업은 삭제하지 않고 보존해야 함");
    ok(/\.event-banner\{\n\s*margin-top/.test(css), "배너 원래 스타일도 보존해야 함(복구 가능)");
    // 바깥 여백이 다시 커지지 않도록 고정
    const app = css.match(/\n\.app\{[\s\S]*?\}/)[0];
    const pad = app.match(/padding:(\d+)px (\d+)px/);
    ok(pad && parseInt(pad[2], 10) <= 10, "좌우 여백이 너무 큼: " + (pad && pad[2]));
  });

  t("레이아웃: 차트가 주 영역이고 호가/주문창도 충분한 폭", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.main-grid\{[\s\S]*?\}/);
    ok(m, ".main-grid 규칙 없음");
    const cols = m[0].match(/grid-template-columns:(\d+)fr (\d+)fr (\d+)fr/);
    ok(cols, "3열 비율 선언 필요");
    const [chart, ob, order] = [+cols[1], +cols[2], +cols[3]];
    ok(chart >= 55, "차트가 주 영역이어야 함(현재 " + chart + "%)");
    ok(chart >= ob && chart >= order, "차트가 가장 넓어야 함");
    ok(ob >= 20, "호가창 폭이 부족함: " + ob);
    ok(order >= 22, "주문창 폭이 부족함: " + order);
    const mh = m[0].match(/\bheight:max\((\d+)px/);
    ok(mh, "행 높이는 확정값(height)이어야 함 — min-height만 주면 차트가 무한히 커짐");
    // 주문창 기본 상태가 폭에 따라 1182~1260px이라, 행이 그보다 낮으면
    // 주문창 칼럼에 스크롤바가 생깁니다.
    ok(parseInt(mh[1], 10) >= 1280, "행 높이가 주문창보다 낮아 스크롤바가 생김: " + mh[1]);
    // chart.js가 autoSize:true(ResizeObserver)라서, 행 높이가 내용에 따라 늘어나면
    // 차트가 커짐 -> 행이 커짐 -> 차트가 또 커짐 의 되먹임이 생깁니다.
    ok(!/min-height:max\(/.test(m[0]), "행 높이를 내용 기준으로 두면 차트가 무한히 늘어남");
    const side = css.match(/\.side-column\{[\s\S]*?\}/)[0];
    ok(/overflow-y:auto/.test(side), "주문창이 행보다 길 때 칼럼 안에서만 스크롤되어야 함");
  });

  t("타이포 스케일: 숫자가 일반 텍스트보다 한 단계 큼", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const size = (re, label) => {
      const m = css.match(re);
      ok(m, label + " 규칙 없음");
      return parseFloat(m[1]);
    };
    const label = size(/\.amitalk-order \.field-label\{[\s\S]*?font-size:([\d.]+)px/, "주문 라벨");
    const calc = size(/\.amitalk-order \.order-preview-row b\{[\s\S]*?font-size:([\d.]+)px/, "계산값");
    const acct = size(/\.amitalk-order \.order-account-row b\{[\s\S]*?font-size:([\d.]+)px/, "계좌값");
    const input = size(/\.amitalk-order \.margin-input-wrap input\{[\s\S]*?font-size:([\d.]+)px/, "주문 입력값");
    ok(label >= 17, "라벨이 너무 작음: " + label);
    ok(calc > label, "계산 숫자(" + calc + ")가 라벨(" + label + ")보다 커야 함");
    ok(acct >= calc, "계좌 숫자(" + acct + ")가 계산 숫자(" + calc + ") 이상이어야 함");
    ok(input > acct, "가격 입력값(" + input + ")이 가장 커야 함");
  });

  t("레이아웃: 콘텐츠 폭이 변수 하나로 관리되고 가운데 정렬됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 거래 셸은 좌우 광고/채팅을 위해 전체 폭을 쓰고,
    // 나머지 블록은 .page-center 등으로 --content-max를 유지해야 합니다.
    [
      [/\.top-banner-inner\{[\s\S]*?\}/, ".top-banner-inner"],
      [/\.menu-bar-inner\{[^}]*\}/, ".menu-bar-inner"],
      [/\.notice-board-wrap\{[\s\S]*?\}/, ".notice-board-wrap"],
      [/\.page-center\{[^}]*\}/, ".page-center"],
      [/\.top-ad-banner\{[^}]*\}/, ".top-ad-banner"],
    ].forEach(([re, label]) => {
      const m = css.match(re);
      ok(m, label + " 규칙 없음");
      ok(/max-width:var\(--content-max\)/.test(m[0]), label + " 는 --content-max를 써야 함");
      ok(/margin:0 auto|margin-left:auto/.test(m[0]), label + " 는 가운데 정렬되어야 함");
    });
    const root = css.match(/:root\{[\s\S]*?\n\}/)[0];
    const v = root.match(/--content-max:(\d+)px/);
    ok(v, ":root에 --content-max 정의 필요");
    ok(parseInt(v[1], 10) >= 1350, "콘텐츠 폭이 너무 좁아 3열이 눌림: " + v[1]);
  });

  t("광고/채팅: 거래 화면이 항상 최우선이고 소재가 없으면 자리도 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

    // 컴포넌트 자리(슬롯)가 존재해야 함 — 나중에 소재만 넣으면 되도록
    ok(/id="top-ad-slot"/.test(html), "상단 배너 슬롯 필요");
    ok(/id="left-ad-slot-1"/.test(html) && /id="left-ad-slot-2"/.test(html), "좌측 광고 슬롯 필요");
    ok(/id="right-chat-panel"/.test(html), "우측 채팅 패널 필요");

    // 소재가 없으면 빈 띠/빈 칸이 남지 않아야 함
    ok(/\.side-ad-slot:empty\{display:none;\}/.test(css), "빈 광고 슬롯은 숨겨야 함");
    ok(/\.exchange-main\{max-width:var\(--content-max\)/.test(css.replace(/\s+/g, " ")) || /\.exchange-main\{[^}]*max-width:var\(--content-max\)/.test(css), "거래 화면 폭 상한 필요");
    ok(/\.top-ad-banner:has\(\.top-ad-slot:empty\)\{display:none;\}/.test(css), "소재 없으면 상단 배너 자체를 숨겨야 함");

    // 칸 배치가 명시적이어야 함(숨겨진 패널 때문에 거래 화면이 0px 칸으로 밀리는 버그 방지)
    ok(/\.exchange-shell > \.exchange-main\{grid-column:2/.test(css), "거래 화면은 2번 칸에 고정되어야 함");
    ok(/\.exchange-shell > \.side-ad-panel\{grid-column:1/.test(css), "광고는 1번 칸");
    ok(/\.exchange-shell > \.side-chat-panel\{grid-column:3/.test(css), "채팅은 3번 칸");

    // 광고는 채팅보다 늦게(더 넓은 화면에서) 켜져야 함 — 우선순위 거래 > 채팅 > 광고
    const chatBp = parseInt(css.match(/@media \(min-width:(\d+)px\)\{\s*\.exchange-shell\{grid-template-columns:0 minmax/)[1], 10);
    const adBlocks = css.match(/@media \(min-width:\d+px\)\{(?:(?!@media)[\s\S])*?\.side-ad-panel\{display:(?:flex|block)[^}]*\}/g);
    ok(adBlocks && adBlocks.length, "광고 표시 미디어쿼리를 찾을 수 없음");
    const adBp = parseInt(adBlocks[adBlocks.length - 1].match(/min-width:(\d+)px/)[1], 10);
    ok(adBp > chatBp, "광고(" + adBp + "px)가 채팅(" + chatBp + "px)보다 넓은 화면에서 켜져야 함");
  });

  t("채팅/광고가 상단에 붙어 스크롤을 따라옴", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const chat = css.match(/\.side-chat-panel > \.page-chat-col\{[^}]*position:sticky[^}]*\}/);
    ok(chat, "채팅은 자기 트랙 안에서 sticky여야 함");
    ok(/top:\d+px/.test(chat[0]), "붙을 위치(top) 지정 필요");
    ok(/height:calc\(100vh/.test(chat[0]), "화면 높이에 맞춰야 함");

    // fixed로 두면 여백이 없는 1920px 화면에서 가운데 콘텐츠(내 정보)를 덮습니다.
    ok(!/\.side-chat-panel > \.page-chat-col\{[^}]*position:fixed/.test(css), "fixed는 가운데 콘텐츠를 덮음");

    // overflow:hidden이면 안쪽 sticky가 동작하지 않습니다(실제로 그 버그가 있었음)
    const wrap = css.match(/\.side-ad-panel,\.side-chat-panel\{[^}]*\}/)[0];
    ok(/overflow:visible/.test(wrap), "패널에 overflow:hidden이 있으면 sticky가 죽음");

    // sticky가 움직일 여지를 가지려면 셸이 거래 영역 전체를 감싸야 합니다
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const shell = html.slice(html.indexOf('class="exchange-shell"'), html.indexOf('id="right-chat-panel"'));
    ok(/class="main-grid"/.test(shell) && /history-panel/.test(shell), "셸이 거래내역까지 감싸야 함");
  });

  t("광고 슬롯: 자리 유지 + 비어 있으면 노출 안 됨 + 링크는 실제 메뉴만", () => {
    const { doc } = boot({ nickname: "홍길동" });
    // 슬롯(자리)은 항상 존재해야 나중에 소재만 넣으면 됩니다
    ["top-ad-slot", "left-ad-slot-1", "left-ad-slot-2"].forEach((id) => {
      ok(doc.getElementById(id), id + " 슬롯이 사라짐");
    });
    // 좌측은 실제 광고가 들어오기 전까지 비워 둡니다(빈 카드가 떠 있지 않게)
    eq(doc.getElementById("left-ad-slot-1").children.length, 0, "좌측 슬롯은 비어 있어야 함");
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.side-ad-slot:empty\{display:none;\}/.test(css), "빈 슬롯은 숨겨져야 함");
    // 소재가 있는 슬롯의 링크는 전부 실제로 존재하는 메뉴를 가리켜야 함(죽은 링크 금지)
    doc.querySelectorAll("[data-ad-link]").forEach((el) => {
      ok(doc.getElementById(el.dataset.adLink), "존재하지 않는 메뉴를 가리킴: " + el.dataset.adLink);
    });
  });

  t("미구현 항목: 배지를 떼지 않고 항목 자체를 화면에서만 숨김", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    // 마크업과 준비중 배지는 그대로 남아 있어야 함(프로젝트 원칙)
    ok(/nav-coming-soon/.test(html) && /nav-soon-badge/.test(html), "준비중 마크업을 삭제하면 안 됨");
    // 화면에서만 숨김
    ok(/\.top-banner-nav-btn\.nav-coming-soon\{display:none;\}/.test(css), "준비중 메뉴 숨김 규칙 필요");
    ok(/\.product-tab-btn\.nav-coming-soon\{display:none;\}/.test(css), "준비중 상품탭 숨김 규칙 필요");
    // 클릭 안내는 그대로 살아 있어야 함
    const nav = fs.readFileSync(path.join(REPO, "js/page-nav.js"), "utf8");
    ok(/nav-coming-soon[\s\S]*alert/.test(nav), "준비중 클릭 안내가 사라지면 안 됨");
  });

  t("채팅이 주문창에서 분리되어 우측 패널로 이동함", () => {
    const { doc } = boot({ nickname: "홍길동" });
    const chat = doc.getElementById("chat-panel");
    ok(chat, "채팅 패널이 사라지면 안 됨");
    ok(chat.closest(".side-chat-panel"), "채팅은 우측 패널 안에 있어야 함");
    ok(!chat.closest(".side-column"), "채팅이 주문창 칼럼 안에 있으면 안 됨");
    // chat.js가 쓰는 id가 전부 살아 있어야 함
    ["chat-messages", "chat-input", "chat-send-btn", "chat-err"].forEach((id) => {
      ok(doc.getElementById(id), id + " 가 사라짐");
    });
  });

  t("폰트: 사이트 전체가 한 글꼴 — 모노스페이스 잔재 없음", () => {
    // 주석 안의 설명 문구는 제외하고 실제 선언만 검사
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const root = css.match(/:root\{[\s\S]*?\n\}/)[0];
    ok(!/JetBrains Mono/.test(root), "JetBrains Mono가 남아있으면 안 됨");
    ok(!/monospace/.test(root), "monospace 폴백이 남아있으면 안 됨");
    // 특정 글꼴 이름을 박아두지 않고 "둘이 같은 글꼴"인지만 검사합니다
    // (글꼴을 바꿔도 이 테스트가 깨지지 않도록).
    const sans = root.match(/--sans:\s*'([^']+)'/);
    const mono = root.match(/--mono:\s*'([^']+)'/);
    ok(sans && mono, "--sans / --mono 선언 필요");
    eq(mono[1], sans[1], "--mono가 본문 글꼴과 달라서 화면이 따로 놉니다");
    // 모노스페이스를 뺀 대신 숫자 정렬은 tabular-nums로 유지되어야 함
    const body = css.match(/\nbody\{[\s\S]*?\n\}/)[0];
    ok(/tabular-nums/.test(body), "body에 tabular-nums 필요(호가창/표 자릿수 정렬)");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    ok(!/JetBrains/.test(html), "쓰이지 않는 글꼴을 계속 내려받으면 안 됨");
  });

  t("헤더: 레퍼런스 구조(로고 + [공지] 한 줄 + 우측 상태)와 컴팩트한 크기", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

    // 개미톡 헤더의 [공지] 자리 — 새 데이터가 아니라 기존 공지 목록 재사용
    ok(/id="header-notice-text"/.test(html), "헤더 공지 슬롯 필요");
    const nb = fs.readFileSync(path.join(REPO, "js/notice-board.js"), "utf8");
    ok(/STATIC_NOTICES\[0\]/.test(nb), "헤더 공지는 기존 공지 목록을 재사용해야 함");

    // 그라데이션 없는 흰 배경
    const banner = css.match(/\n\.top-banner\{[\s\S]*?\}/)[0];
    ok(!/linear-gradient/.test(banner), "헤더에 그라데이션을 쓰지 않음");
    ok(/background:var\(--surface\)/.test(banner), "헤더는 흰 배경");

    // 로고/상태 크기 — 헤더가 다시 커지지 않도록
    const size = (re, label) => {
      const m = css.match(re);
      ok(m, label + " 규칙 없음");
      return parseFloat(m[1]);
    };
    ok(size(/\.brand \.name\{[^}]*font-size:([\d.]+)px/, "로고 이름") <= 22, "로고 이름이 너무 큼");

    // 02단계 실측 기준 — 로고 마크는 정사각(비율 왜곡 금지),
    // 헤더 안쪽 여백은 (로고 높이 / 헤더 높이) = 0.59가 나오도록 잡혀 있어야 합니다.
    const mark = css.match(/\.brand \.mark\{[\s\S]*?\}/)[0];
    const mw = mark.match(/width:(\d+)px/)[1], mh = mark.match(/height:(\d+)px/)[1];
    eq(mw, mh, "로고 마크가 정사각이 아니면 비율이 깨짐");
    const inner = css.match(/\.top-banner-inner\{[\s\S]*?\}/)[0];
    const pad = inner.match(/padding:([\d.]+)px ([\d.]+)px/);
    ok(pad, "헤더 안쪽 여백 지정 필요");
    ok(parseFloat(pad[1]) >= 11 && parseFloat(pad[1]) <= 15,
      "헤더 상하 여백이 레퍼런스 비율(로고:헤더=0.59)에서 벗어남: " + pad[1]);
    ok(parseFloat(pad[2]) <= 10, "헤더 좌측 여백이 너무 큼: " + pad[2]);
    ok(size(/\.brand-tagline\{font-size:([\d.]+)px/, "태그라인") <= 13, "태그라인이 너무 큼");
    ok(size(/\.ws-status\{[^}]*font-size:([\d.]+)px/, "연결 상태") <= 14, "연결 상태가 너무 큼");
    ok(size(/\.auth-logout-btn\{[\s\S]*?font-size:([\d.]+)px/, "로그아웃") <= 14, "로그아웃 버튼이 너무 큼");
  });

  t("사이드 위젯: 레퍼런스처럼 하단 메뉴 한 줄, 좁아지면 접힘", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const nav = css.match(/\n\.up-nav\{[^}]*\}/)[0];
    ok(/grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/.test(nav),
      "레퍼런스 하단 메뉴는 한 줄이어야 함");
    // 폭이 모자라는 구간에서는 접혀야 글자가 잘리지 않음(실측: 460px 미만이면 잘림)
    ok(/@media \(max-width:1799px\)\{[\s\S]*?\.up-nav\{grid-template-columns:repeat\(3/.test(css),
      "좁은 화면에서 3열 2행으로 접는 규칙 필요");

    // 로그인/로그아웃 두 상태를 모두 지원해야 함
    const js = fs.readFileSync(path.join(REPO, "js/user-panel.js"), "utf8");
    ok(/renderLoggedOut/.test(js) && /user-panel-login/.test(js), "로그아웃 상태 UI 필요");
    ok(/renderShell/.test(js) && /user-panel-equity/.test(js), "로그인 상태 UI 필요");

    // 사이드 박스도 공통 박스 규격을 따라야 함
    ok(/\.user-panel-box/.test(css), "사이드 박스 클래스 필요");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok(/class="notice-box user-panel-box"/.test(html), "사이드 박스는 공통 .notice-box 규격을 써야 함");
  });

  t("박스 공통 규격: 모서리·테두리·배경이 한 가지로 통일됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const box = css.match(/\n\.notice-box\{[\s\S]*?\}/)[0];
    const panel = css.match(/\n\.panel\{[^}]*\}/)[0];
    const r1 = box.match(/border-radius:([\d.]+)px/)[1];
    const r2 = panel.match(/border-radius:([\d.]+)px/)[1];
    eq(r2, r1, "박스마다 모서리가 다르면 화면이 제각각으로 보임");
    ok(/border:1px solid var\(--border\)/.test(box) && /border:1px solid var\(--border\)/.test(panel),
      "테두리 두께·색이 같아야 함");
    ok(/background:var\(--surface\)/.test(box) && /background:var\(--surface\)/.test(panel),
      "박스 배경이 같아야 함");

    // 레퍼런스 실측 환산: 제목 약 19px, 목록 약 19px, 행 간격 33px
    const tab = css.match(/\n\.notice-tab-btn\{[\s\S]*?\}/)[0];
    const li = css.match(/\.notice-board-list li\{[\s\S]*?\}/)[0];
    const tfs = parseFloat(tab.match(/font-size:([\d.]+)px/)[1]);
    const lfs = parseFloat(li.match(/font-size:([\d.]+)px/)[1]);
    ok(tfs >= 17 && tfs <= 20, "제목 글자가 레퍼런스(약 19px)에서 벗어남: " + tfs);
    ok(lfs >= 17 && lfs <= 20, "목록 글자가 레퍼런스(약 19px)에서 벗어남: " + lfs);

    // 레퍼런스 목록에는 행 구분선이 없음(실측: 행 사이 가로선 0개)
    ok(!/\.notice-board-list li\{[^}]*border-bottom/.test(css), "레퍼런스에 없는 행 구분선을 넣으면 안 됨");
  });

  t("메인 콘텐츠 구조: 레퍼런스 좌:우 = 3.20:1, gap 0.73%", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

    // 사이드 폭 23.6% — 레퍼런스 실측(좌 75.7% / gap 0.73% / 우 23.6%)
    const mq = css.match(/@media \(min-width:1800px\)\{[\s\S]*?\n\}/);
    ok(mq, "사이드 표시 미디어쿼리 없음");
    ok(/grid-template-columns:0 minmax\(0,1fr\) 23\.6%/.test(mq[0]),
      "우측 사이드는 콘텐츠의 23.6%여야 함");
    ok(/gap:14px/.test(mq[0]), "영역 사이 간격은 레퍼런스 0.73%(=14px)");

    // 공통 컨테이너 재사용 — 메인 콘텐츠만 별도 max-width를 만들지 않음
    const main = css.match(/\.exchange-main\{[^}]*\}/);
    ok(!main || /var\(--content-max\)/.test(main[0]) || !/max-width:\d/.test(main[0]),
      "메인 콘텐츠가 별도 고정 폭을 쓰면 안 됨");

    // 사이드가 숨겨지는 구간에서도 메인이 0px 칸으로 밀리지 않아야 함
    ok(/\.exchange-shell > \.exchange-main\{grid-column:2/.test(css), "메인은 2번 칸 고정");
  });

  t("광고 배너: 레퍼런스 실측 규격(폭 99.6%, 높이 5.98%, 직각, 테두리·그림자 없음)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

    // 위치 — 메뉴 바로 아래
    const menuIdx = html.indexOf('class="menu-bar"');
    const adIdx = html.indexOf('id="top-ad-banner"');
    const noticeIdx = html.indexOf('class="notice-board-wrap"');
    ok(menuIdx < adIdx && adIdx < noticeIdx, "배너는 메뉴와 콘텐츠 사이에 있어야 함");

    // 폭 — 공통 컨테이너(--content-max) 사용, 좌우 여백 최소
    const wrap = css.match(/\.top-ad-banner\{[^}]*\}/)[0];
    ok(/max-width:var\(--content-max\)/.test(wrap), "공통 컨테이너 폭을 써야 함");
    ok(/margin:0 auto/.test(wrap), "가운데 정렬 필요");
    const wp = parseFloat(wrap.match(/padding:0 (\d+)px/)[1]);
    ok(wp <= 6, "배너 좌우 여백이 레퍼런스(99.6% 폭)보다 큼: " + wp);

    // 높이/모서리 — 레퍼런스 높이 비율 5.98%(1920 환산 115px), 직각
    const cre = css.match(/\.ad-creative-wide\{[^}]*\}/)[0];
    const hgt = parseFloat(cre.match(/height:(\d+)px/)[1]);
    // 레퍼런스 배너는 그래픽이 꽉 찬 이미지(환산 115px)지만 현재 소재는 문구 한 줄이라
    // 82px로 낮췄습니다. 이미지 소재로 바꾸면 슬롯이 height:auto라 원본 비율을 따릅니다.
    ok(hgt >= 70 && hgt <= 125, "배너 높이가 범위를 벗어남: " + hgt);
    ok(/border-radius:0/.test(cre), "레퍼런스 배너는 직각 모서리");
    const slot = css.match(/\.top-ad-slot\{[^}]*\}/)[0];
    ok(/border-radius:0/.test(slot), "슬롯도 직각");

    // 이미지 교체 시 비율 왜곡 방지
    ok(/\.top-ad-slot img\{display:block;width:100%;height:auto;\}/.test(css),
      "이미지는 height:auto로 원본 비율을 지켜야 함");

    // 소재가 없으면 빈 띠가 남지 않아야 함
    ok(/\.top-ad-banner:has\(\.top-ad-slot:empty\)\{display:none;\}/.test(css), "소재 없으면 숨김");
  });

  t("메뉴: 레퍼런스 실측 비율(헤더/메뉴=1.69, 글자 14px, 배경 #1769B3)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");

    // 배경색 — 레퍼런스에서 실측한 값. 사이트 강조색(--gold)은 건드리지 않음
    ok(/\.menu-bar\{width:100%;background:#1769B3;\}/.test(css), "메뉴바 배경은 실측색 #1769B3");

    const btn = css.match(/\n\.top-banner-nav-btn\{[\s\S]*?\}/)[0];
    const fsz = parseFloat(btn.match(/font-size:([\d.]+)px/)[1]);
    ok(fsz >= 13 && fsz <= 15, "메뉴 글자가 레퍼런스 비율(약 14px)에서 벗어남: " + fsz);
    const pad = btn.match(/padding:([\d.]+)px ([\d.]+)px/);
    ok(pad, "메뉴 버튼 패딩 필요");
    ok(parseFloat(pad[2]) >= 20 && parseFloat(pad[2]) <= 24, "item 좌우 패딩이 레퍼런스(약 22px)와 다름: " + pad[2]);

    // 레퍼런스 메뉴바에는 active 배경/밑줄이 없음 — 글자 밝기·굵기로만 표시
    const act = css.match(/\.top-banner-nav-btn\.active\{[^}]*\}/)[0];
    ok(/background:transparent/.test(act), "레퍼런스에 없는 active 배경을 쓰면 안 됨");
    ok(!/border-bottom-color/.test(act), "레퍼런스에 없는 active 밑줄을 쓰면 안 됨");
    ok(/font-weight:700/.test(act), "선택 상태는 글자 굵기로 표시");

    // 헤더 로고와 메뉴 글자 시작점이 어긋나지 않도록 첫 항목만 왼쪽 여백 축소
    ok(/\.top-banner-nav > \.top-banner-nav-btn:first-child\{padding-left:8px;\}/.test(css),
      "첫 메뉴의 시작점 정렬 규칙 필요");
  });

  t("기본 규격: body에 font-size / line-height / 글자색이 명시됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const body = css.match(/\nbody\{[\s\S]*?\n\}/)[0];
    const fs2 = body.match(/font-size:([\d.]+)px/);
    ok(fs2, "body에 기본 font-size가 없으면 브라우저 기본 16px이 됨");
    ok(parseFloat(fs2[1]) <= 14, "기본 글자 크기가 너무 큼: " + fs2[1]);
    const lh = body.match(/line-height:([\d.]+)/);
    ok(lh, "body에 기본 line-height 필요");
    ok(parseFloat(lh[1]) <= 1.5, "기본 줄간격이 너무 넓음: " + lh[1]);
    ok(/box-sizing:border-box/.test(css), "box-sizing 필요");
    ok(/html,body\{margin:0;padding:0/.test(css), "html/body 여백 초기화 필요");

    // 기본 링크 스타일(브라우저 기본 파란 밑줄/보라 방문색 방지)
    ok(/\na\{color:var\(--gold\);text-decoration:none;\}/.test(css), "a 기본 스타일 필요");
    ok(/a:visited\{/.test(css) && /a:hover\{/.test(css), "a:visited / a:hover 필요");

    // 좁은 화면에서 헤더가 가로로 넘치지 않도록(nowrap 회귀 방지)
    ok(/@media \(max-width:760px\)\{[\s\S]*?\.top-banner-inner\{flex-wrap:wrap/.test(css),
      "모바일에서 헤더 줄바꿈 허용 필요");

    // 같은 규칙을 두 미디어쿼리가 겹쳐 선언해 뒤엣것이 항상 이기는 죽은 코드 금지
    const mq1050 = css.match(/@media \(max-width:1050px\)\{[\s\S]*?\n\}/);
    ok(mq1050, "1050px 미디어쿼리 없음");
    ok(!/chart-container\{height:78vh/.test(mq1050[0]),
      "1300px 블록에 가려 적용되지 않는 죽은 규칙이 남아 있음");
  });

  t("디자인 시스템: 과도한 둥근 모서리·그림자가 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 금융 플랫폼 느낌 — radius는 0~3px, 50%(원형)만 예외
    const radii = (css.match(/border-radius:([\d.]+)px/g) || []).map((v) => parseFloat(v.split(":")[1]));
    const tooRound = radii.filter((v) => v > 3);
    eq(tooRound.length, 0, "3px를 넘는 모서리가 남아 있음: " + tooRound.slice(0, 5).join(","));
    ok(!/border-radius:999px/.test(css), "알약 형태 버튼은 쓰지 않음");

    // 그림자는 떠 있는 요소(모달/드롭다운)와 상태 점만, 그것도 얇게
    const shadows = css.match(/box-shadow:[^;]+;/g) || [];
    shadows.forEach((sh) => {
      const blur = (sh.match(/(\d+)px/g) || []).map((v) => parseInt(v, 10));
      const max = Math.max(...blur, 0);
      ok(max <= 10, "그림자가 너무 큼: " + sh.trim());
    });
  });

  t("마이페이지도 다른 페이지와 같은 표 형태", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 미디어쿼리 안의 동명 규칙이 아니라 줄 맨 앞의 기본 규칙을 찾습니다
    const grid = css.match(/\n\.mypage-grid\{[\s\S]*?\}/)[0];
    ok(/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(grid), "2칸 표 형태여야 함");
    const item = css.match(/\n\.mypage-item\{[\s\S]*?\}/)[0];
    ok(/justify-content:space-between/.test(item), "라벨 | 값 한 줄 배치여야 함");
    ok(/border-bottom:1px solid/.test(item), "행 구분선 필요");
    const val = css.match(/\n\.mypage-value\{[\s\S]*?\}/)[0];
    const size = parseFloat(val.match(/font-size:([\d.]+)px/)[1]);
    ok(size <= 20, "마이페이지 값 글자가 카드형처럼 너무 큼: " + size);
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
