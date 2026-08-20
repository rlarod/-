/* tests/trade-events-chat.test.js
 * 청산·익절·손절 때 채팅에 올라가는 시스템 메시지.
 *
 * 이 파일이 지키는 것
 *   1) 같은 거래를 두 번 알리지 않는다 (새로고침해도)
 *   2) 금액을 축약하지 않는다 — "3,000만원" 이 아니라 "30,000,000원"
 *   3) 강제청산도 알린다
 *   4) 시스템 메시지는 가운데 정렬
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const REPO = path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

const SRC = fs.readFileSync(path.join(REPO, "js", "trade-events-chat.js"), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* 아주 작은 이벤트 버스 — main.js 의 App.Bus 를 대신합니다. */
function makeBus() {
  const handlers = {};
  return {
    on: (k, f) => { (handlers[k] = handlers[k] || []).push(f); },
    emit: (k, v) => { (handlers[k] || []).forEach((f) => f(v)); },
  };
}

function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://tl.test/" });
  const win = dom.window;
  const sent = [];
  const store = opts.store || {};

  win.App = {
    Bus: makeBus(),
    Config: { USD_KRW: 1500 },
    Auth: { getNickname: () => (opts.nickname === undefined ? "김갱" : opts.nickname) },
    Storage: {
      load: (k) => (k in store ? store[k] : null),
      save: (k, v) => { store[k] = v; return true; },
      clear: (k) => { delete store[k]; return true; },
    },
    SupabaseClient: {
      get: () => ({
        auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } }, error: null }) },
        from: () => ({ insert: async (row) => { sent.push(row); return { error: null }; } }),
      }),
    },
  };
  win.console = { warn() {}, log() {}, error() {} };

  win.eval(SRC);
  win.App.TradeEventsChat.init();
  return { win, sent, store, bus: win.App.Bus };
}

const 거래 = (over) => Object.assign(
  { side: "long", pnl: -100, reason: "수동청산", closeTime: Date.now() + 10 }, over || {});

(async function run() {
  console.log("\n거래 이벤트 채팅");

  /* ---------- 중복 알림 ---------- */
  {
    const { sent, bus } = boot({});
    const t = 거래();
    bus.emit("trading:persisted", { closedTrades: [t] });
    await sleep(60);
    ok("새 거래는 알린다", sent.length === 1, sent.length + "건");

    bus.emit("trading:persisted", { closedTrades: [t] });
    bus.emit("trading:persisted", { closedTrades: [t] });
    await sleep(60);
    ok("같은 거래가 또 저장돼도 다시 알리지 않는다", sent.length === 1, sent.length + "건");
  }
  {
    /* 새로고침 재현 — 저장소는 유지한 채 모듈만 다시 올립니다.
       예전에는 여기서 지난 거래를 전부 다시 알렸습니다(같은 문구 3번). */
    const store = {};
    const 예전거래 = 거래({ closeTime: Date.now() - 3600000 }); // 한 시간 전
    const a = boot({ store });
    a.bus.emit("trading:persisted", { closedTrades: [예전거래] });
    await sleep(60);
    ok("접속 전에 끝난 거래는 알리지 않는다", a.sent.length === 0, a.sent.length + "건");

    const b = boot({ store });
    b.bus.emit("trading:persisted", { closedTrades: [예전거래] });
    await sleep(60);
    ok("새로고침해도 지난 거래를 다시 알리지 않는다", b.sent.length === 0,
      "예전에는 여기서 같은 알림이 또 나갔습니다");

    const c = boot({ store });
    c.bus.emit("trading:persisted", { closedTrades: [예전거래] });
    await sleep(60);
    ok("세 번 열어도 마찬가지", c.sent.length === 0);
  }
  {
    /* 기억은 브라우저에 남아야 합니다. */
    const store = {};
    const a = boot({ store });
    a.bus.emit("trading:persisted", { closedTrades: [거래()] });
    await sleep(60);
    ok("알린 거래를 저장해 둔다", !!store["chat-event-seen"], JSON.stringify(store));

    const 같은거래 = a.sent.length ? null : null;
    const b = boot({ store });
    b.bus.emit("trading:persisted", { closedTrades: [{ side: "long", pnl: -100, reason: "수동청산", closeTime: store["chat-event-seen"].times[0] }] });
    await sleep(60);
    ok("저장된 기억으로 중복을 막는다", b.sent.length === 0, b.sent.length + "건");
  }
  {
    const { sent, bus } = boot({});
    const t1 = 거래({ closeTime: Date.now() + 10 });
    const t2 = 거래({ closeTime: Date.now() + 20, pnl: 50 });
    bus.emit("trading:persisted", { closedTrades: [t1] });
    await sleep(60);
    bus.emit("trading:persisted", { closedTrades: [t2, t1] });
    await sleep(60);
    ok("새 거래가 추가되면 그것만 알린다", sent.length === 2, sent.map((s) => s.message).join(" / "));
  }
  {
    /* 한꺼번에 쏟아지면 도배 방지 — 그리고 그 거래를 다시 시도하지 않아야 합니다. */
    const now = Date.now();
    const 많음 = [];
    for (let i = 0; i < 9; i++) 많음.push(거래({ closeTime: now + 100 + i }));
    const { sent, bus } = boot({});
    bus.emit("trading:persisted", { closedTrades: 많음 });
    await sleep(60);
    ok("한 번에 6건 이상이면 알리지 않는다(도배 방지)", sent.length === 0, sent.length + "건");
    bus.emit("trading:persisted", { closedTrades: 많음 });
    await sleep(60);
    ok("건너뛴 거래를 매번 다시 판단하지 않는다", sent.length === 0);
  }

  {
    /* 창을 두 개 띄운 경우 재현 — 저장소는 공유하고 모듈만 따로 올립니다.
       예전에는 저장소를 한 번만 읽고 메모리에 들고 있어서, 한쪽이 표시한
       걸 다른 쪽이 못 보고 같은 알림을 또 보냈습니다. */
    const store = {};
    const t = 거래();
    const 창1 = boot({ store });
    const 창2 = boot({ store });
    창1.bus.emit("trading:persisted", { closedTrades: [t] });
    await sleep(60);
    창2.bus.emit("trading:persisted", { closedTrades: [t] });
    await sleep(60);
    ok("창을 두 개 띄워도 알림은 한 번만", 창1.sent.length + 창2.sent.length === 1,
      "창1 " + 창1.sent.length + "건 / 창2 " + 창2.sent.length + "건");
  }
  {
    /* 마지막 방어선 — 청산 시각이 달라도 문장이 똑같으면 막습니다.
       2026-08-19 같은 문장이 두 줄씩 찍히는 것을 보고 넣었습니다. */
    const { sent, bus } = boot({});
    const now = Date.now();
    bus.emit("trading:persisted", { closedTrades: [거래({ closeTime: now + 200 })] });
    await sleep(60);
    bus.emit("trading:persisted", { closedTrades: [거래({ closeTime: now + 300 })] });
    await sleep(60);
    ok("같은 문장은 짧은 시간 안에 두 번 보내지 않는다", sent.length === 1,
      sent.map((s) => s.message).join(" / "));
  }
  {
    /* 다만 내용이 다르면 당연히 둘 다 보내야 합니다. */
    const { sent, bus } = boot({});
    const now = Date.now();
    bus.emit("trading:persisted", { closedTrades: [거래({ closeTime: now + 200, pnl: -100 })] });
    await sleep(60);
    bus.emit("trading:persisted", { closedTrades: [거래({ closeTime: now + 300, pnl: -200 })] });
    await sleep(60);
    ok("금액이 다르면 둘 다 보낸다", sent.length === 2,
      sent.map((s) => s.message).join(" / "));
  }

  /* ---------- 금액 표기 ---------- */
  {
    const { sent, bus } = boot({});
    // 환율 1500 기준 20,000 USDT = 30,000,000원
    bus.emit("trading:persisted", { closedTrades: [거래({ pnl: 20000, closeTime: Date.now() + 50 })] });
    await sleep(60);
    const m = sent[0] ? sent[0].message : "";
    ok("금액을 전체 자리수로 적는다", m.indexOf("+30,000,000원") !== -1, m);
    ok("'만' 으로 줄이지 않는다", m.indexOf("만원") === -1, m);
    ok("'억' 으로 줄이지 않는다", m.indexOf("억") === -1, m);
  }
  {
    const { sent, bus } = boot({});
    bus.emit("trading:persisted", { closedTrades: [거래({ pnl: -123456.78, closeTime: Date.now() + 60 })] });
    await sleep(60);
    const m = sent[0] ? sent[0].message : "";
    ok("큰 손실도 전체 자리수", /-185,185,170원/.test(m), m);
    ok("손실은 손절로 적는다", m.indexOf("손절") !== -1, m);
  }
  {
    const { sent, bus } = boot({});
    bus.emit("trading:persisted", { closedTrades: [거래({ pnl: 3.5, closeTime: Date.now() + 70 })] });
    await sleep(60);
    const m = sent[0] ? sent[0].message : "";
    ok("작은 금액도 콤마 규칙 그대로", m.indexOf("+5,250원") !== -1, m);
    ok("이익은 익절로 적는다", m.indexOf("익절") !== -1, m);
  }

  /* ---------- 강제청산 ---------- */
  {
    const { sent, bus } = boot({});
    bus.emit("trading:persisted", {
      closedTrades: [거래({ reason: "강제청산", pnl: -20000, side: "short", closeTime: Date.now() + 80 })],
    });
    await sleep(60);
    const m = sent[0] ? sent[0].message : "";
    ok("강제청산도 채팅에 올린다", !!m, "전송 없음");
    ok("강제청산이라고 알려준다", m.indexOf("강제청산") !== -1, m);
    ok("강제청산 금액도 전체 자리수", m.indexOf("-30,000,000원") !== -1, m);
    ok("방향을 한글로 적는다", m.indexOf("매도") !== -1, m);
  }

  /* ---------- 보내지 않아야 할 때 ---------- */
  {
    const { sent, bus } = boot({ nickname: null });
    bus.emit("trading:persisted", { closedTrades: [거래({ closeTime: Date.now() + 90 })] });
    await sleep(60);
    ok("로그인 안 했으면 보내지 않는다", sent.length === 0);
  }
  {
    const { sent, bus } = boot({});
    bus.emit("trading:persisted", { closedTrades: [] });
    await sleep(60);
    ok("거래가 없으면 아무것도 안 한다", sent.length === 0);
  }

  /* ---------- 화면 표시 ---------- */
  {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok("시스템 메시지를 가운데 정렬한다", /\.chat-msg-event\{text-align:center;\}/.test(css));
    ok("채팅 칸 안에서도 가운데 정렬한다",
      /\.page-right \.chat-msg-event\{[^}]*text-align:center/.test(css));
    ok("가운데 정렬과 어긋나는 왼쪽 선을 뺐다",
      /\.page-right \.chat-msg-event\{[^}]*border-left:none/.test(css));

    const style = fs.readFileSync(path.join(REPO, "js", "chat-event-style.js"), "utf8");
    ok("예전 달러 메시지도 같은 형식으로 바꾼다(억·만 축약 없음)",
      style.indexOf('"억"') === -1 && style.indexOf('"만"') === -1);
  }

  /* ---------- 수정 금지 파일 ----------
     chat.js 에는 원래부터 이 파일 이름이 주석으로 적혀 있어서
     문자열로는 판단할 수 없습니다. 내용 지문(md5)으로 확인합니다. */
  {
    const crypto = require("crypto");
    const md5 = (f) => crypto.createHash("md5")
      .update(fs.readFileSync(path.join(REPO, "js", f))).digest("hex");
    ok("chat.js 를 건드리지 않았다", md5("chat.js") === "a93dfaa7f82ce72a914b270acb3650bb", md5("chat.js"));
    ok("trading.js 를 건드리지 않았다", md5("trading.js") === "33250202c00b097ff8344ae2ee64cbe7", md5("trading.js"));
  }

  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
  console.log("전체 통과 ✅");
  process.exit(0);
})();
