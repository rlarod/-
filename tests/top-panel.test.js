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

  ["js/config.js", "js/utils.js", "js/storage.js", "js/trading.js", "js/rank.js", "js/notice-board.js", "js/user-panel.js", "js/ad-slots.js", "js/chat-event-style.js", "js/theme.js", "js/board-gallery-style.js", "js/board-paging.js"].forEach((f) => {
    win.eval(fs.readFileSync(path.join(REPO, f), "utf8"));
  });

  // 로그인 여부를 테스트에서 지정 — auth.js의 공개 함수(getNickname)와 같은 모양
  win.App.Auth = { getNickname: () => o.nickname || "" };

  win.App.Trading.init();
  win.App.AdSlots.init();
  win.App.Rank.init();
  win.App.NoticeBoard.init(); // App.Board가 없으면 조용히 넘어감
  win.App.UserPanel.init();
  win.App.Theme.init();
  win.App.BoardGalleryStyle.init();
  win.App.BoardPaging.init();
  return { dom, win, App: win.App, doc: win.document };
}

/* ===================================================================== */
section("[1] 상단 정보 패널 — 공지 / 게시판(4탭) / 내 정보");
{
  const { doc } = boot();
  const boxes = doc.querySelectorAll(".notice-board-wrap > .notice-box");

  t("상단은 박스 2개 — 내 정보는 우측 칼럼으로 이동(레퍼런스 구조)", () => {
    eq(boxes.length, 2);
    const right = doc.querySelector(".page-right");
    ok(right, "우측 칼럼 필요");
    ok(right.querySelector(".user-panel-box"), "내 정보는 우측 칼럼에 있어야 함");
    ok(right.querySelector("#chat-panel"), "채팅은 내 정보 아래에 있어야 함");
    const kids = [].map.call(right.children, (e) => e.className.split(" ")[0]);
    ok(kids.indexOf("notice-box") < kids.indexOf("side-chat-panel"), "내 정보가 채팅보다 위");
  });

  t("CSS 비율이 34.4 / 34.5 / 30 (레퍼런스 실측)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.notice-board-wrap\{[\s\S]*?\}/);
    ok(m, ".notice-board-wrap 규칙 없음");
    const cols = m[0].match(/grid-template-columns:minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\) minmax\(0,(\d+)fr\)/);
    ok(cols, "3열 비율 선언 필요: " + m[0]);
    eq([+cols[1], +cols[2], +cols[3]].join("/"), "344/345/300");
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

  t("① 박스1 = 공지사항 | 최신게시물 (레퍼런스 구성)", () => {
    const tabs = boxes[0].querySelectorAll(".notice-tab-btn[data-tab]");
    eq(Array.prototype.map.call(tabs, (b) => b.dataset.tab).join(","), "notice,latest");
    ["notice", "latest"].forEach((k) => ok(boxes[0].querySelector("#notice-list-" + k), k + " 없음"));
  });

  t("② 박스2 = 인기글 | 자유게시판 | 분석게시판 (레퍼런스 구성)", () => {
    const tabs = boxes[1].querySelectorAll(".notice-tab-btn[data-tab]");
    eq(Array.prototype.map.call(tabs, (b) => b.dataset.tab).join(","), "popular,free,analysis");
    ["popular", "free", "analysis"].forEach((k) => ok(boxes[1].querySelector("#notice-list-" + k), k + " 없음"));
  });

  t("③ 내 정보 (우측 칼럼)", () => {
    const box = doc.querySelector(".page-right .user-panel-box");
    ok(box, "우측 칼럼의 내 정보 박스 필요");
    ok(box.querySelector("#user-panel-body"));
  });

  t("탭 전환 — 같은 박스 안에서만 바뀌고 다른 박스는 영향 없음", () => {
    const { doc: d } = boot();
    // 박스1: 공지사항 <-> 최신게시물
    [["notice", "latest"], ["latest", "notice"]].forEach(([target, other]) => {
      d.querySelector('.notice-tab-btn[data-tab="' + target + '"]').dispatchEvent(new d.defaultView.MouseEvent("click", { bubbles: true }));
      ok(d.getElementById("notice-list-" + target).style.display !== "none", target + " 보여야 함");
      eq(d.getElementById("notice-list-" + other).style.display, "none", other + " 숨겨야 함");
      // 박스2는 영향 없음
      ok(d.getElementById("notice-list-popular").style.display !== "none", "박스2가 영향받으면 안 됨");
    });
    // 박스2: 인기글 / 자유 / 분석 — 박스1 상태는 그대로여야 함
    const b1State = () => ["notice", "latest"].map((k) => d.getElementById("notice-list-" + k).style.display).join("|");
    const before = b1State();
    const b2 = ["popular", "free", "analysis"];
    b2.forEach((target) => {
      d.querySelector('.notice-tab-btn[data-tab="' + target + '"]').dispatchEvent(new d.defaultView.MouseEvent("click", { bubbles: true }));
      b2.forEach((k) => eq(d.getElementById("notice-list-" + k).style.display !== "none", k === target, k + " 표시 상태"));
      eq(b1State(), before, "박스2 탭을 눌렀는데 박스1 상태가 바뀜");
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

  t("계급 점수는 자산이 초기자금의 몇 배인가로 정해짐", () => {
    const { App } = boot();
    /* 2026-08-19 방향 변경.
       예전에는 '청산 1건당 10점 + 수익률 1%당 20점' 이라 거래를 많이 하기만
       하면 올랐습니다. 손실 -21% 인 사람이 중장을 달고 있었습니다.
       이제 거래 횟수는 점수에 넣지 않고 지금 자산만 봅니다. */
    const P = (bal, used) => App.Rank.calculatePoints({ balance: bal, usedMargin: used || 0 });
    eq(Math.round(P(100000)), 0, "초기자금 그대로면 0점");
    eq(Math.round(P(200000)), 1000, "2배면 1000점");
    eq(Math.round(P(400000)), 2000, "4배면 2000점");
    eq(Math.round(P(800000)), 3000, "8배면 3000점");
    ok(P(150000) < P(200000) && P(200000) < P(300000), "자산이 늘면 점수도 늘어야 함");
    /* 같은 금액을 더 벌어도 위로 갈수록 점수 증가폭이 작아져야 합니다.
       (10만 → 20만 은 1000점, 20만 → 30만 은 585점)
       그래야 한 번 크게 번 사람이 영영 1등이 되지 않습니다. */
    ok(P(300000) - P(200000) < P(200000) - P(100000),
      "같은 금액을 벌어도 위로 갈수록 증가폭이 작아야 함: " +
      Math.round(P(300000) - P(200000)) + " vs " + Math.round(P(200000) - P(100000)));
  });

  t("자산이 줄면 계급도 내려감(강등)", () => {
    const { App } = boot();
    const P = (bal) => App.Rank.calculatePoints({ balance: bal, usedMargin: 0 });
    const N = (bal) => App.Rank.getRankName(P(bal));
    ok(P(300000) > P(200000), "3배가 2배보다 높아야 함");
    ok(P(200000) > P(150000), "손실을 보면 점수가 줄어야 함");
    ok(App.Rank.calculateRank(P(300000)).rank_level > App.Rank.calculateRank(P(150000)).rank_level,
      "자산이 반으로 줄면 계급도 내려가야 함: " + N(300000) + " → " + N(150000));
  });

  t("포지션을 잡아도 계급은 그대로", () => {
    const { App } = boot();
    const 전 = App.Rank.calculatePoints({ balance: 300000, usedMargin: 0 });
    const 후 = App.Rank.calculatePoints({ balance: 100000, usedMargin: 200000 });
    eq(Math.round(후), Math.round(전), "증거금으로 묶인 돈도 자산에 포함해야 함");
  });

  t("미실현 손익은 계급에 반영하지 않음", () => {
    const src = fs.readFileSync(path.join(REPO, "js", "rank.js"), "utf8");
    const fn = src.slice(src.indexOf("function calculatePoints"), src.indexOf("function getUserRank"));
    ok(!/unrealizedPnl/.test(fn), "미실현 손익이 공식에 들어감");
    ok(!/\bequity\b/.test(fn), "equity 는 미실현 손익을 포함하므로 쓰면 안 됨");
  });

  t("손실이 나도 계급 점수가 0 아래로 내려가지 않음", () => {
    const { App } = boot();
    const P = (bal) => App.Rank.calculatePoints({ balance: bal, usedMargin: 0 });
    eq(P(50000), 0, "원금 절반이면 0점(이병)");
    eq(P(0), 0, "전액 손실도 0점");
    eq(App.Rank.getRankName(P(10000)), "이병");
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
  t("로그아웃 상태 — 이 칸에서 바로 로그인/회원가입", () => {
    // 2026-08-18: 전체 화면 로그인 창을 없애고 이 칸에서 직접 처리합니다.
    const { doc } = boot({ nickname: "" });
    const body = doc.getElementById("user-panel-body");
    ok(/로그인/.test(body.textContent), "로그인 안내 필요");
    ok(body.querySelector("#up-login-nick"), "닉네임 입력칸 필요");
    ok(body.querySelector("#up-login-pw"), "비밀번호 입력칸 필요");
    ok(body.querySelector("#up-login-pw2"), "비밀번호 확인칸 필요(회원가입용)");
    ok(body.querySelector("#up-login-submit"), "제출 버튼 필요");
    ok(body.querySelector("#up-login-toggle-link"), "로그인/회원가입 전환 필요");
    ok(!body.querySelector("#user-panel-equity"), "로그아웃 상태에 자산이 보이면 안 됨");
  });

  t("로그인 상태 — 닉네임/계급/총자산/수익금/수익률 표시", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    const body = doc.getElementById("user-panel-body");
    ok(/홍길동/.test(body.textContent), "닉네임");
    ok(/이병/.test(body.textContent), "계급");
    ok(body.querySelector(".rank-badge svg"), "계급장 SVG");
    eq(doc.getElementById("user-panel-equity").textContent, "100,000.00", "자산은 통화 기호 없이 숫자만");
    // 라벨을 레퍼런스 구성(선물/포인트/USDT/수익률)으로 바꾸면서 수익금 칸은
    // 포인트(계급 점수)로 교체됐습니다. 실현손익 검증은 수익률로 이어갑니다.
    eq(doc.getElementById("user-panel-roe").textContent, "+0.00%");
    ok(doc.getElementById("user-panel-points"), "포인트 칸 필요");
    eq(doc.getElementById("user-panel-roe").textContent, "+0.00%");
  });

  t("실제 거래 결과가 패널에 반영됨", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const snap = App.Trading.getSnapshot();
    // 청산 후에는 보유분이 없어 미실현 기준 수익률은 0입니다.
    eq(doc.getElementById("user-panel-roe").textContent, App.Utils.formatPercent(snap.roe));
    eq(doc.getElementById("user-panel-equity").textContent, App.Utils.formatCurrencyPlain(snap.equity));
  });

  t("수익률은 미실현 손익 기준 ROE(손익 / 증거금)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.setLeverage(10);
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });

    const snap = App.Trading.getSnapshot();
    eq(doc.getElementById("user-panel-roe").textContent, App.Utils.formatPercent(snap.roe));
    // 랭킹은 실현손익 기준이라 값이 다를 수 있습니다(의도된 차이).
    ok(snap.roe !== 0, "보유 중에도 수익률이 움직여야 함");
  });

  t("진입만으로 지갑·포인트는 시세에 흔들리지 않음(핵심 원칙)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    const points0 = doc.getElementById("user-panel-points").textContent;

    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });

    // 시세가 올라도 자산(잔고)과 포인트는 그대로 — 청산해야 확정됩니다.
    const assetAfterOpen = doc.getElementById("user-panel-equity").textContent;
    eq(doc.getElementById("user-panel-points").textContent, points0, "포인트는 청산 전 불변");
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 62000, time: Date.now() });
    eq(doc.getElementById("user-panel-equity").textContent, assetAfterOpen, "지갑은 시세로 변하지 않음");

    // 반면 손익·수익률은 보유 중에도 움직여야 합니다.
    ok(App.Trading.getSnapshot().unrealizedPnl > 0, "미실현 손익은 반영되어야 함");
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
      // 왼쪽은 시세따라 움직이는 값, 오른쪽은 내가 들고 있는 값.
      //   손익 = 미실현 손익 / 지갑 = 주문가능 잔고
      //   수익률 = 미실현 ROE / 포인트 = 계급 점수
      "손익,지갑,수익률,보유 TL"
    );
    eq(body.querySelectorAll(".up-nav button").length, 6, "하단 링크 6개");
  });

  t("손익 칸은 보유 포지션의 미실현 손익(시세따라 실시간)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    const profit = () => doc.getElementById("user-panel-profit").textContent;

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    ok(/^[+-]?0/.test(profit().replace(/[,\s]/g, "")), "진입 직후에는 0");

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });
    ok(/^\+/.test(profit()), "가격이 오르면 + (청산하지 않아도 움직여야 함)");
    ok(!/\$/.test(profit()), "자산과 같은 형식이어야 함: " + profit());

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 59000, time: Date.now() });
    ok(/^-/.test(profit()), "가격이 내리면 -");

    App.Trading.closePosition();
    ok(/^[+-]?0/.test(profit().replace(/[,\s]/g, "")), "청산하면 보유분이 없으므로 0");
  });

  t("지갑은 내가 들고 있는 돈(balance) — 시세로 변하지 않음", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    const before = doc.getElementById("user-panel-equity").textContent;
    App.Trading.openPosition("long", 5000, null, null);
    const snap = App.Trading.getSnapshot();
    eq(doc.getElementById("user-panel-equity").textContent, App.Utils.formatCurrencyPlain(snap.balance));
    ok(doc.getElementById("user-panel-equity").textContent !== before, "포지션을 잡으면 지갑에서 나가야 함");

    // 시세가 움직여도 자산은 그대로(청산 때만 움직임)
    const afterOpen = doc.getElementById("user-panel-equity").textContent;
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });
    eq(doc.getElementById("user-panel-equity").textContent, afterOpen, "시세로는 지갑이 변하지 않아야 함");
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

  t("내 정보: 제목 띠 없이 프로필부터 시작(레퍼런스 구조)", () => {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    // 제목 띠는 삭제가 아니라 주석 보관 — 되돌릴 수 있어야 합니다
    ok(/<!--\s*\n\s*<div class="notice-board-tabs">\s*\n\s*<button class="notice-tab-btn active" type="button">🪖 내 정보<\/button>/.test(html),
      "제목 띠 마크업은 주석으로 보관되어야 함");

    const { doc } = boot({ nickname: "홍길동" });
    const box = doc.querySelector(".page-right .user-panel-box");
    eq(box.querySelector(".notice-board-tabs"), null, "내 정보 박스에 제목 띠가 없어야 함");
    ok(box.querySelector("#user-panel-body"), "본문은 그대로");

    // 비워진 공간을 프로필 줄과 하단 메뉴가 나눠 갖도록 키웠는지
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.page-right \.up-head\{\s*\n\s*padding:clamp\(/.test(css), "프로필 줄 여백이 폭에 비례해야 함");
    ok(/\.page-right \.up-nav button\{\s*\n\s*padding:clamp\(/.test(css), "하단 메뉴 여백이 폭에 비례해야 함");
    // 좁은 구간에서 "리워드 준비중"이 잘리지 않도록 별도 처리
    ok(/@media \(min-width:1800px\) and \(max-width:2100px\)/.test(css),
      "1800~2100px 구간 글자 축소 규칙 필요(메뉴 잘림 방지)");
  });

  t("포인트는 실제 계급 점수 — 진입만으로는 늘지 않음(핵심 원칙)", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    const before = doc.getElementById("user-panel-points").textContent;

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    eq(doc.getElementById("user-panel-points").textContent, before,
      "포지션만 열었는데 포인트가 늘면 안 됨");

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });
    App.Trading.closePosition();
    const after = doc.getElementById("user-panel-points").textContent;
    ok(after !== before, "청산 후에는 포인트가 반영되어야 함");
    // 지어낸 수치가 아니라 rank.js가 계산한 실제 점수여야 함
    const snap = App.Trading.getSnapshot();
    const pts = Math.round(App.Rank.getUserRank(snap).points);
    eq(after, pts.toLocaleString() + " TL"); // 단위는 브랜드 단위 TL
  });

  t("내 정보 값 색: 이익 초록 / 손실 빨강 / 보유 없으면 중립", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.page-right \.up-state-profit \.up-value\{color:var\(--green\) !important;\}/.test(css), "이익은 초록");
    ok(/\.page-right \.up-state-loss   \.up-value\{color:var\(--red\) !important;\}/.test(css), "손실은 빨강");
    ok(/\.page-right \.up-state-flat   \.up-value\{color:var\(--text\) !important;\}/.test(css), "거래 없으면 검정");

    const { doc, App } = boot({ nickname: "홍길동" });
    const grid = () => doc.getElementById("user-panel-grid").className;
    ok(/up-state-flat/.test(grid()), "거래 전에는 검정 상태");

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 60000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    ok(/up-state-flat/.test(grid()), "진입 직후에는 평가손익 0이라 검정");

    // 손익·수익률이 미실현 기준이라 색도 보유 중 평가손익을 따릅니다.
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 61000, time: Date.now() });
    ok(/up-state-profit/.test(grid()), "평가이익이면 초록 상태");
    ok(/^\+/.test(doc.getElementById("user-panel-roe").textContent), "수익률 앞에 + 표시");

    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 59000, time: Date.now() });
    ok(/up-state-loss/.test(grid()), "평가손실이면 빨강 상태");
    ok(/^-/.test(doc.getElementById("user-panel-roe").textContent), "수익률 앞에 - 표시");

    App.Trading.closePosition();
    ok(/up-state-flat/.test(grid()), "청산하면 보유분이 없어 중립");
  });

  t("지갑·포인트는 손익 색을 따르지 않음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 내가 들고 있는 값이라 시세따라 색이 바뀌면 헷갈립니다.
    ok(/#user-panel-equity,[\s\S]*?#user-panel-points\{color:var\(--text\) !important;\}/.test(css),
      "지갑·포인트는 항상 본문색이어야 함");
    ok(/up-state-profit #user-panel-equity/.test(css), "이익 상태에서도 색이 바뀌면 안 됨");
  });

  t("내 정보 값 표: 라벨 셀 회색 + 값마다 색(레퍼런스 실측)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 레퍼런스 실측: 라벨 셀 #EEEEEE, 값 셀 흰색
    ok(/\.page-right \.up-label\{[\s\S]*?background:#EEEEEE/.test(css), "라벨 셀은 회색 배경");
    ok(/\.page-right \.up-value\{[\s\S]*?background:#fff/.test(css), "값 셀은 흰 배경");
    // 자산은 강조색, 손익은 부호에 따라, 0이면 중립
    ok(/#user-panel-equity,\s*\n\s*\.page-right #user-panel-available\{color:var\(--gold\)/.test(css),
      "자산 값은 강조색");
    ok(/\.page-right #user-panel-roe\{color:var\(--text-dim\)/.test(css),
      "손익 0일 때는 중립색이어야 함(가짜 강조 방지)");
    ok(/\.page-right #user-panel-points\{color:var\(--gold\)/.test(css), "포인트는 강조색");
    // 내 정보 값 표는 국내 증시 관례 — 상승 빨강(+) / 하락 파랑(-)
    ok(/\.page-right \.up-value\.pnl-positive\{color:var\(--green\) !important;\}/.test(css), "이익은 초록");
    ok(/\.page-right \.up-value\.pnl-negative\{color:var\(--red\) !important;\}/.test(css), "손실은 빨강");
    // 거래 화면(호가창/포지션)의 기존 색 관례는 건드리지 않았는지 확인
    ok(/\n\.pnl-positive\{color:#34D399 !important;\}/.test(css), "전역 손익 색은 그대로여야 함");
  });

  t("메뉴 구성 — 동작 메뉴는 전부 페이지 연결", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const { doc } = boot({ nickname: "홍길동" });

    // 페이지가 연결된(=동작하는) 메뉴는 전부 실제 페이지가 있어야 합니다
    const working = Array.prototype.filter.call(
      doc.querySelectorAll(".top-banner-nav-btn"),
      (b) => !b.classList.contains("nav-coming-soon")
    );
    // 2026-08-18: TL 핫딜에 이어 TL 마켓도 실제 페이지가 되어 6개입니다.
    eq(working.length, 6, "동작하는 메뉴 6개(코인선물/커뮤니티/랭킹/TL 핫딜/TL 마켓/마이페이지)");
    working.forEach((b) => {
      const page = b.dataset.page;
      ok(page, b.textContent.trim() + " 에 연결 페이지가 없음");
      ok(doc.getElementById("page-" + page), "page-" + page + " 가 없음");
    });

    // TL 핫딜은 실제 페이지 — 준비중이 아니어야 하고 전용 페이지가 있어야 합니다
    const hot = doc.getElementById("page-nav-hotdeal");
    ok(hot && !hot.classList.contains("nav-coming-soon"), "TL 핫딜은 더 이상 준비중이 아님");
    ok(hot && hot.dataset.page === "hotdeal", "TL 핫딜에 연결 페이지 필요");
    ok(doc.getElementById("page-hotdeal"), "page-hotdeal 이 없음");

    // TL 마켓(기능성 아이템)도 실제 페이지입니다 — 핫딜과 별개 메뉴
    const market = doc.getElementById("page-nav-market");
    ok(market && !market.classList.contains("nav-coming-soon"), "TL 마켓은 더 이상 준비중이 아님");
    ok(market && market.dataset.page === "market", "TL 마켓에 연결 페이지 필요");
    ok(doc.getElementById("page-market"), "page-market 이 없음");
    ok(/TL 마켓/.test(market.textContent), "TL 마켓 이름 필요: " + market.textContent.trim());
    ok(doc.getElementById("page-hotdeal") && doc.getElementById("page-market"), "핫딜과 마켓은 별개 페이지여야 함");

    // 전쟁터는 화면에서만 숨기고 페이지·모듈은 그대로
    const battle = doc.getElementById("page-nav-battle");
    ok(battle && battle.classList.contains("nav-coming-soon"), "전쟁터는 화면에서 숨김");
    ok(doc.getElementById("page-battle"), "전쟁터 페이지가 사라지면 안 됨");

    // 나머지 준비중 메뉴도 마크업 보존
    ["schedule", "join", "market", "notice", "support"].forEach((id) => {
      ok(doc.getElementById("page-nav-" + id), "page-nav-" + id + " 이 사라지면 안 됨");
    });
  });

  t("채팅 파란 띠 높이를 배너와 동일하게(단차 방지)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const banner = css.match(/\.ad-creative-wide\{[\s\S]*?\}/)[0];
    const header = css.match(/\.page-right \.page-chat-panel > \.field-label\{[\s\S]*?\}/)[0];
    const bh = banner.match(/height:(\d+)px/);
    const hh = header.match(/height:(\d+)px/);
    ok(bh && hh, "두 파란 띠 모두 높이가 지정돼야 함");
    eq(hh[1], bh[1], "파란 띠 높이가 다르면 아랫변에 단차가 생김");
    // 패널 테두리 1px 때문에 띠가 아래에서 시작하던 것 보정
    ok(/margin:-1px -1px 0/.test(header), "테두리만큼 끌어올려야 윗변이 맞음");
  });

  t("채팅 아랫변을 거래 행에 맞춤 — 화면 높이에 따라 어긋나지 않게", () => {
    const js = fs.readFileSync(path.join(REPO, "js/layout-align.js"), "utf8");
    // 채팅은 100vh 기준, 거래 행은 콘텐츠 기준이라 CSS만으로는 못 맞춥니다.
    ok(/getBoundingClientRect\(\)/.test(js), "거래 행 실제 크기를 재야 함");
    // 커뮤니티 등 다른 페이지에서도 채팅이 줄어들면 안 됩니다
    // (차트/호가창/주문창 자리에 그 페이지가 들어간 것으로 봅니다).
    ok(/offsetParent[\s\S]*?getComputedStyle\(grid\)\.height/.test(js),
      "거래 행이 숨어 있어도 그 높이를 써야 함");
    // 게시판 등 다른 페이지 본문도 채팅과 같은 아랫변까지 늘려야 합니다
    ok(/alignPageToChat/.test(js), "페이지 본문도 채팅 높이에 맞춰야 함");
    ok(/page\.id === "page-exchange"/.test(js), "거래 화면은 원래 높이를 유지해야 함");
    ok(/\.main-grid/.test(js) && /page-chat-col/.test(js), "거래 행과 채팅을 모두 참조해야 함");
    // 좌우 2단이 풀리는 폭에서는 손대지 않아야 함
    ok(/MIN_WIDTH = 1800/.test(js), "2단 기준 폭이 style.css와 같아야 함");
    ok(/col\.style\.height = ""/.test(js), "2단이 아니면 CSS 기본값으로 되돌려야 함");
    // 창 크기나 주문창 길이가 바뀌면 다시 맞춰야 함
    ok(/addEventListener\("resize"/.test(js), "창 크기 변경 대응 필요");
    ok(/ResizeObserver/.test(js), "거래 행 높이 변화 대응 필요");
    // 세로 길이만 건드려야 함(색·글자·데이터 무관)
    ok(!/textContent|innerHTML|color/.test(js), "레이아웃 외 항목을 건드리면 안 됨");
  });

  t("관리자 창은 거래 화면에서 빠지고 내 정보 메뉴로만 열림", () => {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const js = fs.readFileSync(path.join(REPO, "js/admin-menu.js"), "utf8");

    // 패널과 초기화 버튼은 그대로 남아 있어야 함(삭제 금지)
    ok(/id="admin-panel"/.test(html), "관리자 패널이 사라지면 안 됨");
    ok(/id="admin-reset-btn"/.test(html), "시즌 초기화 버튼이 사라지면 안 됨");
    ok(/id="admin-modal"/.test(html), "관리자 모달 껍데기 필요");

    // 권한 판정을 새로 만들면 admin.js와 갈라집니다 — 지켜보기만 해야 함
    // 주석은 제외하고 실제 호출만 검사
    const jsCode = js.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
    ok(!/rpc\(\s*["']am_i_admin/.test(jsCode), "권한 확인을 중복 구현하면 안 됨");
    ok(/MutationObserver/.test(js), "admin.js의 노출 여부를 지켜봐야 함");
    ok(/panel\.style\.display !== "none"/.test(js), "관리자일 때만 메뉴를 꺼내야 함");

    // 패널은 모달 안으로 "이동"이라 이벤트가 유지됨
    ok(/slot\.appendChild\(panel\)/.test(js), "패널은 이동시켜야 함(복제 금지)");
  });

  t("상시 거래내역 표는 화면에서만 숨김(마감손익 탭에 동일 내용)", () => {
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    const js = fs.readFileSync(path.join(REPO, "js/position-table-extra.js"), "utf8");
    ok(/id="cloud-history-panel"/.test(html), "거래내역 표가 사라지면 안 됨");
    ok(/id="cloud-history-body"/.test(html), "거래내역 본문이 사라지면 안 됨");
    ok(/"cloud-history-panel"/.test(js), "숨김 목록에 있어야 함");
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/#cloud-history-panel\.position-col-hidden\{display:none !important;\}/.test(css),
      "인라인 style을 덮어쓸 규칙 필요");
  });

  t("무료 충전: 서버가 금액·횟수·포지션을 판정하고 클라이언트는 반영만", () => {
    const js = fs.readFileSync(path.join(REPO, "js/daily-recharge.js"), "utf8");
    const sql = fs.readFileSync(path.join(REPO, "supabase/schema-daily-recharge.sql"), "utf8");

    // 금액을 클라이언트가 정하면 조작할 수 있습니다 — 서버 상수여야 합니다.
    ok(!/100000/.test(js.replace(/100,000/g, "")), "충전 금액을 클라이언트가 정하면 안 됨");
    ok(/AMOUNT constant numeric := 100000/.test(sql), "금액은 서버 상수");

    // 횟수 제한과 포지션 확인도 서버에서
    ok(/already_claimed/.test(sql) && /has_position/.test(sql), "서버가 횟수·포지션을 검사해야 함");
    // 2026-08-18 규칙 변경: 오전 6시 하루 1회 -> 자정(한국시간) 하루 2회
    ok(/date_trunc\('day', now\(\) at time zone 'Asia\/Seoul'\)\) at time zone 'Asia\/Seoul'/.test(sql), "한국시간 자정 기준");
    ok(!/interval '6 hours'/.test(sql), "오전 6시 기준이 남아있으면 안 됨");
    ok(/recharge_max_per_day/.test(sql) && /select 2;/.test(sql), "하루 한도 2회는 서버가 정해야 함");
    ok(/recharge_count/.test(sql), "횟수를 서버에 기록해야 함(자정 전 재충전 방지)");
    ok(/for update/.test(sql), "동시 요청 이중 충전 방지 필요");

    // 기존 데이터를 지우지 않아야 함 (주석은 제외하고 실제 구문만 검사)
    const sqlCode = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    ok(!/drop\s+table/i.test(sqlCode) && !/truncate/i.test(sqlCode), "기존 테이블을 지우면 안 됨");
    ok(/add column if not exists/i.test(sql), "컬럼 추가는 안전하게");

    // 클라이언트는 서버가 돌려준 잔고만 반영
    ok(/saved\.balance = Number\(data\.balance\)/.test(js), "서버가 준 잔고를 그대로 반영");

    // 버튼은 기본 비활성 — 서버가 허용해야만 열림
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
    ok(/id="daily-recharge-btn" disabled/.test(html), "버튼은 기본 비활성이어야 함");

    // SQL 미적용을 다른 오류와 구분해 안내해야 함(원인 찾기 쉽게)
    ok(/PGRST202/.test(js) && /42883/.test(js), "함수 없음 오류 코드를 구분해야 함");
    ok(/서버 설정이 아직 적용되지 않았습니다/.test(js), "SQL 미적용 전용 안내 필요");
    ok(/schema-daily-recharge\.sql/.test(js), "콘솔에 실행할 파일명을 안내해야 함");
  });

  t("커뮤니티 목록이 갤러리형 칸 구성", () => {
    const js = fs.readFileSync(path.join(REPO, "js/board-gallery-style.js"), "utf8");
    // board.js(수정 금지)가 그린 뒤 순서만 바꾸는 방식이어야 합니다
    ok(/MutationObserver/.test(js), "board.js가 다시 그릴 때마다 재적용해야 함");
    // 값을 새로 만들지 않고 board.js가 넣은 것을 읽어 씁니다
    ok(/tds\[0\]\.innerHTML/.test(js), "제목은 board.js가 넣은 값을 그대로 써야 함");
    ok(!/like_count|comment_count|created_at/.test(js), "데이터를 직접 계산하면 안 됨");

    const { doc, App } = boot({ nickname: "홍길동" });
    const body = doc.getElementById("board-list-body");
    ok(body, "게시판 목록 필요");
    body.innerHTML =
      '<tr class="board-row" data-id="a">' +
      '<td style="text-align:left;">첫 글</td><td>김갱</td><td>👍 5</td><td>💬 2</td><td>10</td><td>1분 전</td></tr>';
    App.BoardGalleryStyle.applyForTest();

    const head = [].map.call(doc.querySelectorAll(".board-gallery thead th"), (t) => t.textContent);
    eq(head.join(","), "번호,제목,글쓴이,작성일,조회,추천");

    const row = body.querySelector("tr.board-row");
    eq(row.children.length, 6, "칸 수 유지");
    eq(row.dataset.id, "a", "글 id가 유지되어야 클릭이 동작함");
    ok(/\[2\]/.test(row.children[1].textContent), "댓글 수는 제목 뒤에");
  });

  t("게시글 상세로 들어가도 칼럼 폭이 줄지 않음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // .app이 flex 자식이라 내용이 좁으면 칼럼까지 같이 줄었습니다(2184 -> 402px).
    ok(/\.page-left > \.app\{width:100%;align-self:stretch;\}/.test(css),
      "왼쪽 칼럼 폭을 채우도록 고정해야 함");
    ok(/\.page-left \.app > div\{width:100%;\}/.test(css), "페이지도 폭을 채워야 함");
    // 상세 화면 버튼이 폭을 꽉 채우지 않도록
    ok(/#board-detail-view \.board-detail-actions > button\{[\s\S]*?width:auto/.test(css),
      "수정/삭제 버튼이 늘어지면 안 됨");
  });

  t("커뮤니티 페이지 번호와 검색", () => {
    const js = fs.readFileSync(path.join(REPO, "js/board-paging.js"), "utf8");
    // board.js를 고치지 않고 이미 불러온 목록만 다뤄야 합니다
    ok(!/supabase|\.from\(/.test(js), "서버에 새로 질의하면 board.js와 중복됨");
    ok(/MutationObserver/.test(js), "목록이 바뀌면 다시 계산해야 함");

    const { doc, App } = boot({ nickname: "홍길동" });
    const body = doc.getElementById("board-list-body");
    const titles = ["청산 후기", "레버리지 질문", "수익 인증", "손절 타이밍"];
    body.innerHTML = titles
      .map((t, i) =>
        '<tr class="board-row" data-id="p' + i + '">' +
        '<td style="text-align:left;">' + t + "</td><td>김갱" + i +
        "</td><td>5</td><td>2</td><td>10</td><td>1시간 전</td></tr>"
      )
      .join("");
    App.BoardGalleryStyle.applyForTest();
    App.BoardPaging.applyForTest();

    ok(doc.getElementById("board-page-nums"), "페이지 번호 영역 필요");
    ok(doc.getElementById("board-search-input"), "검색창 필요");

    // 검색이 제목으로 걸러야 함
    doc.getElementById("board-search-input").value = "청산";
    App.BoardPaging.searchForTest();
    const visible = [].filter.call(body.querySelectorAll("tr.board-row"), (r) => r.style.display !== "none");
    eq(visible.length, 1, "제목에 '청산'이 든 글만 남아야 함");

    // 검색어를 비우면 전체 복귀
    doc.getElementById("board-search-input").value = "";
    App.BoardPaging.searchForTest();
    const all = [].filter.call(body.querySelectorAll("tr.board-row"), (r) => r.style.display !== "none");
    eq(all.length, titles.length, "검색어를 지우면 전체가 보여야 함");
  });

  t("원화 표시에 '원'이 붙음", () => {
    const { App } = boot({ nickname: "홍길동" });
    App.Config.setDisplayCurrency("KRW");
    const krw = App.Utils.formatCurrencyPlain(100000);
    ok(/원$/.test(krw), "원화인데 단위가 없으면 어떤 통화인지 알 수 없음: " + krw);
    App.Config.setDisplayCurrency("USDT");
    ok(!/원$/.test(App.Utils.formatCurrencyPlain(100000)), "USDT에는 원이 붙으면 안 됨");
  });

  t("다크모드 버튼은 헤더 우측에만 있음", () => {
    const { doc, App } = boot({ nickname: "홍길동" });
    const header = doc.getElementById("header-theme-btn");
    ok(header, "헤더 다크모드 버튼 필요");
    // 헤더 우측 영역은 숨김 상태라, 그 안이 아니라 바깥에 있어야 보입니다
    ok(!header.closest(".top-banner-right"), "숨겨진 영역 안에 있으면 안 보임");
    // 같은 기능이 두 곳에 있으면 헷갈리므로 내 정보에는 두지 않습니다
    eq(doc.getElementById("theme-toggle-btn"), null, "내 정보에는 테마 버튼이 없어야 함");

    App.Theme.setForTest("dark");
    eq(header.textContent.trim(), "☀ 밝은 모드");
    App.Theme.setForTest("light");
    eq(header.textContent.trim(), "🌙 다크 모드");
  });

  t("다크모드: 변수만 바꿔서 전환, 밝은 모드에 영향 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const js = fs.readFileSync(path.join(REPO, "js/theme.js"), "utf8");

    // 색이 변수로 관리되므로 다크 블록에서 배경·글자·테두리만 덮으면 됩니다
    const dark = css.match(/html\[data-theme="dark"\]\{[\s\S]*?\n\}/);
    ok(dark, "다크 변수 블록 필요");
    ["--bg", "--surface", "--text", "--border"].forEach((v) => {
      ok(dark[0].indexOf(v) !== -1, v + " 가 다크 블록에 없음");
    });

    // 밝은 모드 규칙을 지우지 않고 덮어쓰기만 해야 되돌릴 수 있습니다
    ok(/:root\{[\s\S]*?--bg:#F3F4F7/.test(css), "밝은 모드 기본값이 남아 있어야 함");

    // 전환은 html 속성 하나로
    ok(/setAttribute\("data-theme", DARK\)/.test(js) && /removeAttribute\("data-theme"\)/.test(js),
      "속성 하나로 전환해야 함");
    // 고른 값을 저장하고 다음 방문에 복원
    ok(/localStorage/.test(js), "선택을 저장해야 함");
    ok(/prefers-color-scheme/.test(js), "저장값이 없으면 운영체제 설정을 따라야 함");
    // 버튼은 패널이 다시 그려져도 동작해야 함
    ok(/themeBound/.test(js), "리스너를 위임해야 함");
    // 거래 데이터에는 관여하지 않아야 함
    ok(!/Trading\.|realizedPnl|balance/.test(js), "테마 모듈이 거래 데이터를 건드리면 안 됨");

    const { doc, App } = boot({ nickname: "홍길동" });
    ok(doc.getElementById("header-theme-btn"), "테마 버튼 필요");
    App.Theme.setForTest("dark");
    eq(doc.documentElement.getAttribute("data-theme"), "dark");
    App.Theme.setForTest("light");
    eq(doc.documentElement.getAttribute("data-theme"), null, "밝은 모드는 속성이 없어야 함");
  });

  t("내 정보: USDT/원화 전환 버튼이 다시 그려져도 동작", () => {
    const js = fs.readFileSync(path.join(REPO, "js/user-panel.js"), "utf8");
    // 패널은 값이 바뀔 때마다 다시 그려집니다. 버튼에 직접 리스너를 걸면 사라집니다.
    ok(/body\.addEventListener\("click"/.test(js), "상위 요소에 위임해야 함");
    ok(/closest\("\[data-cur\]"\)/.test(js), "통화 버튼 위임 선택자 필요");
    // 통화가 바뀌면 값 표시도 따라가야 함
    ok(/App\.Bus\.on\("currency:change", render\)/.test(js), "통화 변경 시 다시 그려야 함");
    // 전환 자체는 기존 Config 함수를 그대로 씀(중복 구현 금지)
    ok(/App\.Config\.setDisplayCurrency\(btn\.dataset\.cur\)/.test(js), "기존 통화 전환 함수를 써야 함");

    const { doc, App } = boot({ nickname: "홍길동" });
    ok(doc.getElementById("up-cur-usdt") && doc.getElementById("up-cur-krw"), "통화 버튼 2개 필요");
    const before = doc.getElementById("user-panel-equity").textContent;
    App.Config.setDisplayCurrency("KRW");
    ok(doc.getElementById("user-panel-equity").textContent !== before, "원화로 바뀌어야 함");
    App.Config.setDisplayCurrency("USDT");
    eq(doc.getElementById("user-panel-equity").textContent, before, "USDT로 되돌아와야 함");
  });

  t("채팅: 거래 이벤트가 손익 부호별로 구분 표시됨", () => {
    // js/chat.js(수정 금지)는 그대로 두고, 그려진 뒤 DOM만 꾸미는 방식
    const js = fs.readFileSync(path.join(REPO, "js/chat-event-style.js"), "utf8");
    ok(/MutationObserver/.test(js), "chat.js를 고치지 않고 DOM 관찰로 처리해야 함");
    ok(/decorateForTest/.test(js), "테스트용 진입점 필요");

    const { doc, App } = boot({ nickname: "홍길동" });
    const mk = (text) => {
      const row = doc.createElement("div");
      row.className = "chat-msg chat-msg-event";
      const t = doc.createElement("div");
      t.className = "chat-msg-text";
      t.textContent = text;
      row.appendChild(t);
      App.ChatEventStyle.decorateForTest(row);
      return row;
    };
    const win = mk("홍길동님이 BTC 매수 포지션을 +254만원 익절했습니다");
    ok(win.classList.contains("chat-event-profit"), "익절은 초록 계열로 구분");

    const lose = mk("홍길동님이 BTC 매도 포지션을 -170만원 손절했습니다");
    ok(lose.classList.contains("chat-event-loss"), "손절은 빨강 계열로 구분");

    // 문구 전체에 색이 들어가야 합니다(금액만 강조하지 않음)
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.chat-event-profit \.chat-msg-text\{color:var\(--green\)/.test(css), "익절 문구는 초록");
    ok(/\.chat-event-liq \.chat-msg-text\{color:var\(--red\)/.test(css), "손절·청산 문구는 빨강");

    // 예전에 달러로 저장된 메시지도 원화로 보여야 합니다
    const old$ = mk("홍길동님이 BTC 매수 포지션을 $-1,696.82 손절했습니다");
    ok(/원/.test(old$.querySelector(".chat-msg-text").textContent), "달러 표기가 원화로 바뀌어야 함");
    ok(!/\$/.test(old$.querySelector(".chat-msg-text").textContent), "달러 기호가 남으면 안 됨");

    const liq = mk("홍길동님의 BTC 매수 포지션이 강제청산되었습니다 (-1.23억원)");
    ok(liq.classList.contains("chat-event-liq"), "강제청산 구분 필요");

    // 이미 원화인 문구는 그대로 둡니다
    eq(win.querySelector(".chat-msg-text").textContent,
      "홍길동님이 BTC 매수 포지션을 +254만원 익절했습니다");
  });

  t("내 정보 박스 내부: 남는 공간이 한 곳에 몰리지 않고 값 행이 나눠 가짐", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // space-between이면 남는 공간이 전부 값 행 아래 한 곳에 몰려 빈 띠가 생깁니다
    // (실측: 우리 36.0% vs 레퍼런스 18.8%).
    ok(/\.page-right > \.user-panel-box > \.user-panel-body\{\s*justify-content:stretch/.test(css),
      "남는 공간을 아래 한 곳에 몰면 빈 띠가 생김");
    ok(/\.page-right \.up-grid\{flex:1;grid-template-rows:1fr 1fr/.test(css),
      "값 표가 남는 공간을 나눠 가져야 함");
    // 글자도 폭에 비례해야 넓은 화면에서 작아 보이지 않음
    ["up-value", "up-label", "up-nick"].forEach((c) => {
      const m = css.match(new RegExp("\\.page-right \\." + c + "\\{font-size:clamp\\([^)]*\\)"));
      ok(m, c + " 글자 크기가 폭에 비례해야 함");
      ok(/vw/.test(m[0]), c + " 가 고정 px이면 넓은 화면에서 작아 보임");
    });
  });

  t("상단 박스 3개 높이 통일 — 내 정보만 내용 따라 변하지 않음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const v = css.match(/--top-box-h:\s*clamp\((\d+)px,\s*([\d.]+)vw,\s*(\d+)px\)/);
    ok(v, "상단 박스 높이는 폭에 비례해야 함(고정 px이면 넓은 화면에서 작아 보임)");
    // 레퍼런스 실측: 박스 높이 = 콘텐츠 폭의 11.27%
    const vw = parseFloat(v[2]);
    ok(Math.abs(vw - 11.27) <= 1, "박스 높이 비율이 레퍼런스(11.27%)에서 벗어남: " + vw);
    // 로그인 상태 내 정보가 들어가는 최소 높이는 유지되어야 함
    ok(parseInt(v[1], 10) >= 245, "최소 높이가 탭 줄 + 내 정보 내용보다 작음: " + v[1]);

    // 레퍼런스 실측: 탭 줄 = 박스 높이의 26.7%. 박스만 커지고 탭이 고정이면 얇아 보입니다.
    const tab = css.match(/\.notice-board-wrap \.notice-tab-btn,[\s\S]*?padding-top:clamp\([^)]*\)/);
    ok(tab, "탭 줄 높이도 폭에 비례해야 함");
    ok(/vw/.test(tab[0]), "탭 줄 패딩이 고정 px이면 넓은 화면에서 얇아 보임");
    const mq = css.match(/@media \(min-width:1800px\)\{[\s\S]*?height:var\(--top-box-h\);/);
    ok(mq, "2단 레이아웃에서 세 박스 높이를 고정해야 함");
    ok(/\.notice-board-wrap > \.notice-box,\s*\n\s*\.page-right > \.user-panel-box\{height:var\(--top-box-h\);\}/.test(css),
      "공지/게시판/내 정보가 같은 높이 변수를 써야 함");
    // 내용이 길어져도 박스가 늘어나지 않고 안에서 스크롤되어야 단차가 생기지 않음
    ok(/\.notice-board-list\{overflow-y:auto/.test(css.replace(/\s+/g, " ")) ||
       /notice-board-list\{overflow-y:auto/.test(css), "목록이 넘칠 때 내부 스크롤 필요");
  });

  t("칸 단차: 패널 상하좌우 경계가 서로 맞음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 배너 슬롯에 위 여백이 있으면 파란 배너 윗변이 오른쪽 채팅 헤더보다 아래에서 시작함
    ok(/\.top-ad-slot:not\(:empty\)\{margin:0;\}/.test(css),
      "배너 슬롯 여백이 있으면 채팅 헤더와 윗변이 어긋남");
    ok(/\.page-left > \.top-ad-banner\{margin-top:-1px;\}/.test(css),
      "좌우 세로 간격(6px) 통일 보정 필요");
    // ① 우측 칼럼 위 여백 = 공지 박스 위 여백
    ok(/\.page-right\{padding-top:6px;\}/.test(css), "우측 칼럼 위 여백이 공지 박스와 달라 단차가 생김");
    // ② 호가창 탭이 박스 밖에 있으면 윗변이 차트 박스보다 아래에서 시작함
    const wrap = css.match(/\n\.orderbook-tabs-wrap\{[\s\S]*?\}/g);
    ok(wrap && wrap.some((w) => /border:1px solid var\(--border\)/.test(w)),
      "호가창 탭 줄이 박스 안으로 들어와야 윗변이 맞음");
    // ③ 주문창이 칼럼 끝까지 채워야 아랫변이 맞음
    ok(/\.main-grid \.side-column > \.order-panel\{flex:1/.test(css), "주문창이 칼럼 아래까지 채워야 함");
  });

  /* ─────────────────────────────────────────────────────────────────────
   * 2026-08-21 — 레퍼런스 숫자를 바꿨습니다. 왜 바꿨는지 근거를 남깁니다.
   * ─────────────────────────────────────────────────────────────────────
   * 옛 값: 차트 42.4 / 호가 16.8 / 주문 16.0 / 채팅 23.0
   *   출처는 개미톡 캡처(콘텐츠 686px 기준 291/115/110/158)였고,
   *   "오른쪽에 채팅 세로 칸이 23% 항상 있다"는 전제가 깔려 있었습니다.
   *   실제 1920 실측도 정확히 42.4 / 16.8 / 16.0 이었습니다(2026-08-21 측정).
   *
   * 왜 바꾸나: 그 채팅 칸 13줄 중 10줄이 "누가 익절/손절했다"는 자동 알림이었고
   *   실제 대화는 3줄이었습니다(1440 실측). 알림 하나 때문에 화면의 23%를 쓰고
   *   차트가 42%로 눌려 있었습니다. 알림을 얇은 가로 띠(44px)로 빼고 대화를
   *   접이식으로 돌려 채팅 세로 칸을 없앴으므로, 이제 거래 3열이 화면 폭을
   *   전부 씁니다 -> 3열 비율이 곧 화면 대비 비율입니다.
   *
   * 새 값의 출처: 바이낸스 선물(BTCUSDT) 데스크톱 1440 실측
   *   차트 62.7% / 호가 16.7% / 주문 20.9%
   *   (docs/디자인-구조조사.md 2회차 "칼럼 비율" — 우리 56.0/22.2/21.2 와 대조)
   * ───────────────────────────────────────────────────────────────────── */
  t("3칼럼 비율: 차트 62.7 / 호가 16.7 / 주문 20.9 (바이낸스 선물 1440 실측)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const em = css.match(/\n\.exchange-main\{[\s\S]*?\}/)[0];
    ok(/grid-template-columns:minmax\(0,1fr\) 23%/.test(em), "채팅 트랙 선언은 유지(접었다 펴는 기준값)");
    const mg = css.match(/\.main-grid\{[\s\S]*?\}/)[0];
    const cols = mg.match(/grid-template-columns:(\d+)fr (\d+)fr (\d+)fr/);
    ok(cols, "거래 3열 비율 선언 필요");
    const [c, o, s2] = [+cols[1], +cols[2], +cols[3]];
    const sum = c + o + s2;
    // 채팅 칸이 사라졌으므로 3열 합이 곧 화면 폭 100% 입니다.
    const pct = (v) => (v / sum) * 100;
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    ok(near(pct(c), 62.7, 1.5), "차트 비율이 레퍼런스에서 벗어남: " + pct(c).toFixed(1));
    ok(near(pct(o), 16.7, 1.5), "호가창 비율이 레퍼런스에서 벗어남: " + pct(o).toFixed(1));
    ok(near(pct(s2), 20.9, 1.5), "주문창 비율이 레퍼런스에서 벗어남: " + pct(s2).toFixed(1));
    ok(c > o && c > s2, "차트가 가장 넓어야 함");
  });

  t("채팅 분리: ⚡ 알림 띠 + 💬 대화 접이식 (마크업은 하나도 안 지움)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

    // 띠가 존재하고, 거래 화면 위쪽(공지 박스보다 앞)에 있어야 함
    const ttIdx = html.indexOf('id="trade-ticker"');
    ok(ttIdx > -1, "⚡ 알림 띠가 필요함");
    ok(ttIdx < html.indexOf('class="notice-board-wrap"'), "알림 띠는 화면 맨 위 가로 띠여야 함");
    ok(/id="trade-ticker-track"/.test(html), "알림이 흐를 트랙 필요");

    // 얇아야 함 — 40~50px
    const tt = css.match(/\.trade-ticker\{[^}]*\}/)[0];
    const h = parseInt(tt.match(/height:(\d+)px/)[1], 10);
    ok(h >= 40 && h <= 50, "알림 띠가 얇은 가로 띠가 아님: " + h);

    // 대화는 지운 게 아니라 접은 것 — chat.js 가 쓰는 id 가 전부 남아 있어야 함
    ["chat-messages", "chat-input", "chat-send-btn", "chat-err", "chat-panel"].forEach((id) => {
      ok(html.indexOf('id="' + id + '"') > -1, id + " 가 사라짐");
    });
    ok(/id="chat-toggle-btn"/.test(html) && /id="chat-fab"/.test(html), "열고 닫는 버튼이 둘 다 필요");
    ok(/html\[data-chat="off"\] \.page-right \.side-chat-panel\{display:none;\}/.test(css),
      "접을 때는 CSS 로만 숨겨야 함(마크업 보존)");
    ok(/html\[data-chat="off"\] \.chat-fab\{display:inline-flex;\}/.test(css), "접었을 때 열기 버튼이 보여야 함");

    // 알림을 채팅 목록에서 숨기는 것은 띠가 실제로 만들어진 뒤에만
    // (스크립트가 실패했는데 알림까지 사라지면 조용한 고장이 됩니다)
    ok(/html\[data-tt="1"\] #chat-messages \.chat-msg-event\{display:none;\}/.test(css),
      "알림 숨김은 data-tt 게이트가 있어야 함");
    const js = fs.readFileSync(path.join(REPO, "js/chat-split.js"), "utf8");
    ok(/setAttribute\("data-tt", "1"\)/.test(js), "띠를 만든 뒤에만 data-tt 를 켜야 함");
    ok(/js\/chat-split\.js/.test(html), "chat-split.js 를 불러와야 함");
    const main = fs.readFileSync(path.join(REPO, "main.js"), "utf8");
    ok(/"ChatSplit"/.test(main), "ChatSplit 를 부팅 목록에 등록해야 함");
  });

  t("레이아웃: 차트가 주 영역이고 호가/주문창도 충분한 폭", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const m = css.match(/\.main-grid\{[\s\S]*?\}/);
    ok(m, ".main-grid 규칙 없음");
    const cols = m[0].match(/grid-template-columns:(\d+)fr (\d+)fr (\d+)fr/);
    ok(cols, "3열 비율 선언 필요");
    const [chart, ob, order] = [+cols[1], +cols[2], +cols[3]];
    const sum = chart + ob + order;
    ok(chart / sum >= 0.55, "차트가 주 영역이어야 함");
    ok(chart >= ob && chart >= order, "차트가 가장 넓어야 함");
    // 2026-08-21 갱신 — 채팅 세로 칸을 없애면서 3열이 화면 폭을 전부 쓰게 됐습니다.
    // 하한을 "3열 안에서의 몫"이 아니라 바이낸스 실측(호가 16.7% / 주문 20.9%)
    // 기준으로 다시 잡습니다. 예전 하한 0.20 은 채팅 칸 23% 를 빼고 남은 77%
    // 안에서의 몫이었습니다(=전체 대비 15.4%). 지금 16.5% 는 그보다 넓습니다.
    ok(ob / sum >= 0.16, "호가창 폭이 부족함");
    ok(order / sum >= 0.19, "주문창 폭이 부족함");
    const mh = m[0].match(/\bheight:max\((\d+)px/);
    ok(mh, "행 높이는 확정값(height)이어야 함 — min-height만 주면 차트가 무한히 커짐");
    // 주문창 기본 상태가 폭에 따라 1182~1260px이라, 행이 그보다 낮으면
    // 주문창 칼럼에 스크롤바가 생깁니다.
    // 주문창 실측 필요 높이(준비중 항목 숨김 + 여백 압축 후) 1088~1116px
    ok(parseInt(mh[1], 10) >= 1120, "행 높이가 주문창보다 낮아 스크롤바가 생김: " + mh[1]);
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

  t("레이아웃: 콘텐츠가 화면 폭을 100% 채움(레퍼런스 실측)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const root = css.match(/:root\{[\s\S]*?\n\}/)[0];
    // 레퍼런스는 콘텐츠가 화면을 100% 채웁니다. 폭 상한을 두면 넓은 모니터에서
    // 좌우가 30%씩 비어 전체 비율이 어긋납니다(실측 67.1% vs 100%).
    ok(/--content-max:\s*none/.test(root), "콘텐츠 폭 상한이 있으면 넓은 화면에서 좌우가 빔");

    // 폭을 쓰는 컨테이너들이 같은 변수를 참조해야 기준선이 어긋나지 않습니다
    [
      [/\.top-banner-inner\{[\s\S]*?\}/, ".top-banner-inner"],
      [/\.menu-bar-inner\{[^}]*\}/, ".menu-bar-inner"],
      [/\n\.page-shell\{[\s\S]*?\}/, ".page-shell"],
    ].forEach(([re, label]) => {
      const m = css.match(re);
      ok(m, label + " 규칙 없음");
      ok(/max-width:var\(--content-max\)/.test(m[0]), label + " 는 --content-max를 써야 함");
    });

    // 좌우 2단 비율 — 레퍼런스 77 : 23
    const shell = css.match(/\n\.page-shell\{[\s\S]*?\}/)[0];
    ok(/grid-template-columns:minmax\(0,1fr\) 23%/.test(shell), "우측 칼럼은 23%");
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
    ok(/\.exchange-main > \.side-chat-panel\{grid-column:2/.test(css), "채팅은 가운데 콘텐츠의 2번 칸");

    // 광고는 채팅보다 늦게(더 넓은 화면에서) 켜져야 함 — 우선순위 거래 > 채팅 > 광고
    const chatBlocks = css.match(/@media \(min-width:(\d+)px\)\{(?:(?!@media)[\s\S])*?\.side-chat-panel\{display:block;\}/);
    ok(chatBlocks, "채팅 표시 미디어쿼리를 찾을 수 없음");
    const chatBp = parseInt(chatBlocks[1], 10);
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

  t("헤더 우측(연결 상태/통화/로그인)은 화면에서만 숨김 — 기능은 유지", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.top-banner-right\{display:none;\}/.test(css), "헤더 우측 숨김 규칙 필요");

    // 마크업은 그대로 남아 있어야 합니다. 특히 #auth-logout-btn은 내 정보 패널의
    // "로그아웃"이 대신 눌러주는 대상이라, 삭제하면 로그아웃이 동작하지 않습니다.
    const { doc } = boot({ nickname: "홍길동" });
    ["auth-logout-btn", "ws-status-text", "last-update-text"].forEach((id) => {
      ok(doc.getElementById(id), id + " 이 사라지면 안 됨");
    });

    // 숨겨진 로그아웃 버튼이 내 정보 패널에서 실제로 눌리는지
    let fired = false;
    doc.getElementById("auth-logout-btn").addEventListener("click", () => { fired = true; });
    const btn = doc.querySelector('.up-nav button[data-nav="logout"]');
    ok(btn, "내 정보 로그아웃 버튼 필요");
    btn.dispatchEvent(new doc.defaultView.MouseEvent("click", { bubbles: true }));
    ok(fired, "숨긴 헤더 로그아웃까지 전달되어야 함");
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
    // 레퍼런스 세로 비율 실측(로고 26/686 = 3.79%)에 맞춰 1920 콘텐츠에서 로고 블록 약 73px.
    ok(size(/\.brand \.name\{[^}]*font-size:([\d.]+)px/, "로고 이름") >= 26, "로고 이름이 레퍼런스보다 작음");

    // 02단계 실측 기준 — 로고 마크는 정사각(비율 왜곡 금지),
    // 헤더 안쪽 여백은 (로고 높이 / 헤더 높이) = 0.59가 나오도록 잡혀 있어야 합니다.
    const mark = css.match(/\.brand \.mark\{[\s\S]*?\}/)[0];
    const mw = mark.match(/width:(\d+)px/)[1], mh = mark.match(/height:(\d+)px/)[1];
    eq(mw, mh, "로고 마크가 정사각이 아니면 비율이 깨짐");
    const inner = css.match(/\.top-banner-inner\{[\s\S]*?\}/)[0];
    const pad = inner.match(/padding:([\d.]+)px ([\d.]+)px/);
    ok(pad, "헤더 안쪽 여백 지정 필요");
    // 2026-08-18: 브랜드가 텍스트(로고 블록 37px)에서 TL 로고 이미지로 바뀌면서
    // 헤더 높이를 여백만으로 판단할 수 없게 됐습니다. 이제는 로고 높이가
    // 헤더를 결정하므로, 여백이 아니라 "로고 높이 + 여백×2" 로 검사합니다.
    // TL 브랜드 지침: 로고를 너무 작게 만들지 말 것.
    const logoH = parseFloat((css.match(/\.brand-logo\{[\s\S]*?height:([\d.]+)px/) || [])[1]);
    ok(logoH >= 100, "TL 로고가 너무 작음: " + logoH);
    const headerH = logoH + parseFloat(pad[1]) * 2;
    ok(headerH >= 120 && headerH <= 160,
      "헤더 높이가 과하거나 부족함(로고 " + logoH + "px + 여백 " + pad[1] + "px×2 = " + headerH + "px)");
    ok(parseFloat(pad[1]) <= 20, "로고를 키운 만큼 위아래 여백은 줄여야 함: " + pad[1]);
    ok(parseFloat(pad[2]) <= 10, "헤더 좌측 여백이 너무 큼: " + pad[2]);
    ok(size(/\.brand-tagline\{font-size:([\d.]+)px/, "태그라인") < size(/\.brand \.name\{[^}]*font-size:([\d.]+)px/, "로고 이름"), "태그라인은 로고 이름보다 작아야 함");
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
    ok(/renderLoggedOut/.test(js) && /up-login-submit/.test(js), "로그아웃 상태 UI 필요");
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
    // 채팅은 가운데 콘텐츠(.exchange-main) 안의 두 번째 칸입니다.
    // 셸 바깥 칸에 두면 숨겨진 좌측 광고 칸 때문에 가운데가 밀려 정렬이 깨집니다.
    const em = css.match(/\n\.exchange-main\{[\s\S]*?\}/)[0];
    ok(/grid-template-columns:minmax\(0,1fr\) 23%/.test(em), "우측 사이드는 콘텐츠의 23%여야 함(레퍼런스 실측)");
    ok(/gap:14px/.test(em), "영역 사이 간격은 레퍼런스 0.73%(=14px)");
    ok(/\.exchange-main > \.side-chat-panel\{grid-column:2/.test(css), "채팅은 가운데 콘텐츠 안에 있어야 함");
    // 셸 좌우 칸이 같아야 가운데가 화면 정중앙에 놓입니다
    const shell = css.match(/\n\.exchange-shell\{[\s\S]*?\}/)[0];
    ok(/grid-template-columns:minmax\(0,1fr\) minmax\(0,var\(--content-max\)\) minmax\(0,1fr\)/.test(shell),
      "셸 좌우 칸이 비대칭이면 거래 화면이 다른 블록과 어긋남");

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
    // 레퍼런스 순서: 메뉴 -> 공지/게시판 박스 -> 배너 -> 상품탭
    const menuIdx = html.indexOf('class="menu-bar"');
    const noticeIdx = html.indexOf('class="notice-board-wrap"');
    const adIdx = html.indexOf('id="top-ad-banner"');
    const productIdx = html.indexOf('class="product-tabs');
    ok(menuIdx < noticeIdx, "메뉴가 공지 박스보다 앞");
    ok(noticeIdx < adIdx, "배너는 공지/게시판 박스 아래에 있어야 함(레퍼런스 위치)");
    ok(adIdx < productIdx, "배너는 상품탭보다 앞");

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
    // 레퍼런스 배너 = 콘텐츠 폭의 7.00% (1920 환산 134px)
    ok(hgt >= 125 && hgt <= 145, "배너 높이가 레퍼런스 비율에서 벗어남: " + hgt);
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
    // 레퍼런스 메뉴바는 콘텐츠 폭 대비 약 3.8~5.1%로, 14px일 때는 눈에 띄게 작았습니다.
    // 레퍼런스 메뉴바 = 콘텐츠 폭의 3.94% (1920 환산 76px)
    ok(fsz >= 24 && fsz <= 28, "메뉴 글자가 레퍼런스 비율에서 벗어남: " + fsz);
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

  t("디자인 시스템: 모서리·그림자가 절제돼 있음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    /* 2026-08-19 방향 변경.
       예전 기준은 "모서리 3px 이하". 각진 금융 화면을 목표로 잡은 값이었는데,
       레퍼런스(개미톡) 화면을 실측하니 카드 모서리가 10px 이었습니다.
       그래서 상한을 12px 로 올립니다. 다만 알약 형태(999px)나 과하게
       둥근 카드는 여전히 막습니다 — 그러면 금융 화면이 아니라 앱처럼 보입니다. */
    const radii = (css.match(/border-radius:([\d.]+)px/g) || []).map((v) => parseFloat(v.split(":")[1]));
    const tooRound = radii.filter((v) => v > 12);
    eq(tooRound.length, 0, "12px를 넘는 모서리가 남아 있음: " + tooRound.slice(0, 5).join(","));
    ok(!/border-radius:999px/.test(css), "알약 형태 버튼은 쓰지 않음");

    // 그림자는 떠 있는 요소(모달/드롭다운)와 상태 점만, 그것도 얇게
    const shadows = css.match(/box-shadow:[^;]+;/g) || [];
    shadows.forEach((sh) => {
      const blur = (sh.match(/(\d+)px/g) || []).map((v) => parseInt(v, 10));
      const max = Math.max(...blur, 0);
      ok(max <= 10, "그림자가 너무 큼: " + sh.trim());
    });
  });

  t("다크 팔레트가 레퍼런스 실측값을 쓴다", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const dark = css.slice(css.indexOf('html[data-theme="dark"]{'));
    /* 캡처에서 픽셀로 뽑은 값입니다. 임의로 바꾸면 레퍼런스와 어긋납니다. */
    [["--bg:#0A0F1C", "페이지 배경"], ["--surface:#101727", "카드"],
     ["--surface2:#0D1422", "카드 안쪽 타일"], ["--border:#1D273B", "테두리"],
     ["--text:#E7ECF5", "본문 글자"], ["--text-faint:#838DA4", "보조 글자"],
     ["--green:#26C281", "상승"], ["--red:#F0506E", "하락"],
     ["--gold:#F0B429", "포인트"]].forEach(([v, label]) => {
      ok(dark.indexOf(v) !== -1, label + " 색이 실측값과 다름: " + v);
    });
    /* 브리프에 있던 보라는 쓰지 않기로 했습니다 — 레퍼런스 화면에 보라가
       한 픽셀도 없고, 골드가 그 자리를 맡고 있습니다. */
    ok(!/#6C63FF/i.test(css), "쓰지 않기로 한 보라(#6C63FF)가 들어옴");
    ok(/--card-radius:10px/.test(dark), "카드 모서리는 레퍼런스 실측 10px");
  });

  t("지금은 다크 하나로만 운영한다(밝은 모드는 보존)", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const theme = fs.readFileSync(path.join(REPO, "js", "theme.js"), "utf8");
    ok(/DARK_ONLY = true/.test(theme), "다크 고정이 풀림");
    ok(/#header-theme-btn\{display:none;\}/.test(css), "전환 버튼이 다시 보임");
    /* 지우지 않고 감춰둡니다 — 밝은 모드를 새로 만들 때 되살립니다. */
    ok(/function toggle/.test(theme) || /LIGHT/.test(theme), "밝은 모드 코드가 지워짐");
    ok(/--bg:#F/i.test(css) || /--surface:#FFFFFF/.test(css), "밝은 모드 색 정의가 지워짐");
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
