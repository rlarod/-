/* tests/all-symbol-feed.test.js
 * =========================================================================
 * 네 종목 시세 공급(js/all-symbol-feed.js) — 데이터만, 화면은 0
 * =========================================================================
 * 2026-10-01 — PM 배정 / 수리팀
 *
 * ── 무엇을 지키나 ───────────────────────────────────────────────────────
 *   [1] 수정 금지 파일 12개가 그대로다 (특히 js/websocket.js)
 *   [2] ★화면을 한 글자도 안 건드린다★ — DOM 접근 0건
 *   [3] 종목 목록을 파일에 적지 않는다 — App.SymbolRegistry 가 단일 출처
 *   [4] 기존 방송 이름(ticker:update 등)을 쓰지 않는다 — 시세 경로가 안 섞인다
 *   [5] 경로가 /market 이다 — root 로 열면 open 은 되는데 ★메시지 0건★
 *   [6] ⭐ null(아직 안 옴) 과 0(진짜 0) 이 구분된다
 *   [7] 끊기면 조용히 죽지 않는다 — closed 를 방송하고 다시 붙는다
 *   [8] index.html · main.js 에 제대로 등록돼 있다
 *
 * ── 왜 이 검사가 필요한가 ───────────────────────────────────────────────
 *   js/websocket.js:173 이 지금 보고 있는 ★한 종목★ 만 엽니다. 나머지 3개는
 *   값이 영원히 없는데 ★오류가 하나도 안 납니다★ — CLAUDE.md 가 P1 로 못
 *   박은 "조용한 고장" 의 모양입니다. 그 구멍을 메우는 모듈이라, 이 모듈
 *   자신이 같은 방식으로 조용히 죽는 것을 막아야 합니다.
 *
 * ── ⚠ 바이낸스에 붙지 않습니다 ─────────────────────────────────────────
 *   네트워크를 쓰지 않습니다. WebSocket 을 가짜로 끼워 "메시지가 이렇게 오면
 *   이렇게 된다" 만 확인합니다. 종목 목록은 ★실제 js/symbol-registry.js★ 를
 *   그대로 태웁니다(가짜 스텁 금지 — tests/ticker-board-reality-seal.test.js
 *   가 겪은 함정과 같은 것입니다).
 *
 * ⚠ 사이트 코드를 한 글자도 고치지 않습니다. 읽어서 실행만 합니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(REPO, rel), "utf8");

const SRC_REL = "js/all-symbol-feed.js";
const SRC = read(SRC_REL);
/* 주석을 지운 "실제 코드" — 설명문에 적힌 글자 때문에 오판하지 않게 */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                .replace(/^(\s*)\/\/.*$/gm, "$1");

let pass = 0;
let fail = 0;
const 실패목록 = [];

function ok(제목, 조건, 도움말) {
  if (조건) { pass++; console.log("  ✓ " + 제목); }
  else {
    fail++;
    실패목록.push(제목 + (도움말 ? " → " + 도움말 : ""));
    console.log("  ✗ " + 제목 + (도움말 ? "\n      → " + 도움말 : ""));
  }
}
function 절(t) { console.log("\n" + t); }

/* -------------------------------------------------------------------------
 * 띄우기 — 실제 js/symbol-registry.js + js/all-symbol-feed.js
 *          WebSocket 만 가짜로 끼웁니다(네트워크 0)
 * ----------------------------------------------------------------------- */
function 띄우기() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>",
    { runScripts: "outside-only", url: "https://example.test/" });
  const win = dom.window;

  /* main.js 와 같은 모양의 App.Bus */
  win.eval([
    "window.App = window.App || {};",
    "App.Bus = (function(){ var L={}; return {",
    "  on:function(e,f){ (L[e]=L[e]||[]).push(f); return f; },",
    "  off:function(e,f){ if(L[e]) L[e]=L[e].filter(function(x){return x!==f;}); },",
    "  emit:function(e,p){ (L[e]||[]).forEach(function(f){ try{f(p);}catch(err){} }); }",
    "}; })();",
  ].join("\n"));

  /* 가짜 WebSocket — 만든 주소와 인스턴스를 전부 기억합니다 */
  const 소켓들 = [];
  const 주소들 = [];
  win.eval([
    "window.__소켓들 = [];",
    "window.WebSocket = function (url) {",
    "  this.url = url; this.readyState = 0; this.닫힘 = false;",
    "  window.__소켓들.push(this);",
    "};",
    "window.WebSocket.prototype.close = function(){ this.닫힘 = true; };",
  ].join("\n"));

  /* 타이머를 손으로 돌릴 수 있게 가로챕니다 (재접속 대기를 기다리지 않게) */
  const 예약 = [];
  const realSetTimeout = win.setTimeout;
  win.setTimeout = function (fn, ms) {
    const id = 예약.length + 1;
    예약.push({ id: id, fn: fn, ms: ms, 취소: false });
    return id;
  };
  win.clearTimeout = function (id) {
    const t = 예약.find((x) => x.id === id);
    if (t) t.취소 = true;
  };

  /* ★실제★ 종목 목록 — 가짜 스텁을 쓰지 않습니다 */
  win.eval(read("js/symbol-registry.js"));
  win.eval(SRC);

  const 받은 = { ticker: [], status: [] };
  win.App.Bus.on("allsymbol:ticker", (q) => 받은.ticker.push(q));
  win.App.Bus.on("allsymbol:status", (s) => 받은.status.push(s));

  function 마지막소켓() { return win.__소켓들[win.__소켓들.length - 1]; }

  return {
    win: win,
    F: win.App.AllSymbolFeed,
    받은: 받은,
    소켓들: () => win.__소켓들,
    마지막소켓: 마지막소켓,
    열기: function () { const s = 마지막소켓(); if (s && s.onopen) s.onopen({}); },
    보내기: function (obj) {
      const s = 마지막소켓();
      if (s && s.onmessage) s.onmessage({ data: typeof obj === "string" ? obj : JSON.stringify(obj) });
    },
    끊기: function (code) {
      const s = 마지막소켓();
      if (s && s.onclose) s.onclose({ code: code === undefined ? 1006 : code });
    },
    예약들: () => 예약.filter((t) => !t.취소),
    예약실행: function () {
      const 살아있는 = 예약.filter((t) => !t.취소 && !t.실행됨);
      살아있는.forEach((t) => { t.실행됨 = true; t.fn(); });
      return 살아있는.length;
    },
    닫기: function () { try { win.App.AllSymbolFeed.stop(); } catch (e) {} dom.window.close(); },
    realSetTimeout: realSetTimeout,
  };
}

/* 바이낸스 24hrTicker 한 건의 모양 (combined stream 포장까지 그대로) */
function 틱(symbol, 현재가, 등락률, 덮어쓰기) {
  const d = Object.assign({
    e: "24hrTicker", E: 1700000000000, s: symbol,
    c: String(현재가), o: "100", h: "110", l: "90",
    p: "1", P: String(등락률), q: "1234.5", v: "10",
  }, 덮어쓰기 || {});
  return { stream: symbol.toLowerCase() + "@ticker", data: d };
}

/* =========================================================================
 * [1] 파일이 있고, 수정 금지 파일 12개는 그대로다
 * ========================================================================= */
절("[1] 수정 금지 파일 12개가 그대로다 (특히 js/websocket.js)");
{
  const 잠긴 = require("./_locked-hashes.js");
  const 기준 = Object.assign({}, 잠긴.잠긴11, { "js/trading.js": 잠긴.TRADING });
  const md5 = (rel) => crypto.createHash("md5")
    .update(fs.readFileSync(path.join(REPO, rel))).digest("hex");

  ok("기준 해시가 12개다", Object.keys(기준).length === 12,
    "실제 " + Object.keys(기준).length + "개");
  const 다름 = Object.keys(기준).filter((f) => md5(f) !== 기준[f]);
  ok("12개 전부 기준 해시와 같다", 다름.length === 0, "달라진 파일: " + 다름.join(", "));
  ok("js/websocket.js 가 기준과 같다", md5("js/websocket.js") === 기준["js/websocket.js"],
    "이 건은 js/websocket.js 를 못 엽니다 — 별도 연결로 우회해야 합니다");
}

/* =========================================================================
 * [2] ★화면을 하나도 안 건드린다★
 *     대표님 홈페이지 전면 개편 시안이 정해지기 전이라, 값만 만들고
 *     보여주는 일은 다음 건입니다. 여기서 그리기 시작하면 시안이 갈립니다.
 * ========================================================================= */
절("[2] ★DOM 접근 0건★ — 데이터만 담당한다");
{
  const 금지 = [
    ["document", /\bdocument\b/],
    ["querySelector", /querySelector/],
    ["getElementById", /getElementById/],
    ["innerHTML", /innerHTML/],
    ["textContent", /textContent/],
    ["createElement", /createElement/],
    ["appendChild", /appendChild/],
    ["classList", /classList/],
    [".style", /\.style\b/],
    ["insertAdjacent", /insertAdjacent/],
    ["MutationObserver", /MutationObserver/],
  ];
  const 걸린것 = 금지.filter(([, re]) => re.test(CODE)).map(([n]) => n);
  ok("DOM 을 건드리는 낱말이 하나도 없다", 걸린것.length === 0,
    "걸린 것: " + 걸린것.join(", ") + " — 표시는 다음 건입니다");

  ok("style.css 를 안 쓴다(파일에 css 글자가 없다)", !/\.css\b/.test(CODE));

  /* 실제로 띄워 봐도 DOM 이 안 바뀌는지 — body 를 before/after 로 비교 */
  const t = 띄우기();
  const 전 = t.win.document.body.innerHTML;
  t.F.init();
  t.열기();
  t.보내기(틱("BTCUSDT", 83525.3, 0.162));
  const 후 = t.win.document.body.innerHTML;
  ok("init + 시세 수신 뒤에도 body 가 글자 하나 안 바뀐다", 전 === 후,
    "전[" + 전 + "] 후[" + 후 + "]");
  t.닫기();
}

/* =========================================================================
 * [3] 종목 목록을 파일에 적지 않는다 — App.SymbolRegistry 가 단일 출처
 * ========================================================================= */
절("[3] 종목 이름을 코드에 박지 않는다");
{
  ok("App.SymbolRegistry 에서 읽는다", /App\.SymbolRegistry/.test(CODE));
  const 박힌것 = ["BTCUSDT", "QQQUSDT", "SAMSUNGUSDT", "SKHYNIXUSDT",
                  "btcusdt", "qqqusdt", "samsungusdt", "skhynixusdt"]
    .filter((s) => CODE.indexOf(s) >= 0);
  ok("네 종목 이름이 코드에 하나도 없다", 박힌것.length === 0,
    "박힌 것: " + 박힌것.join(", ") + " — 종목이 늘면 두 벌이 됩니다");

  /* 실제 레지스트리로 띄워서, 주소에 네 종목이 전부 들어가는지 */
  const t = 띄우기();
  t.F.init();
  const url = t.마지막소켓().url;
  const 실제종목 = t.win.App.SymbolRegistry.getAll()
    .filter((s) => s.dataSource === "binance").map((s) => s.symbol);
  ok("실제 레지스트리가 4종목을 준다", 실제종목.length === 4, "실제 " + 실제종목.length + "개");
  const 빠진것 = 실제종목.filter((s) => url.indexOf(s.toLowerCase()) < 0);
  ok("주소에 4종목이 전부 들어 있다", 빠진것.length === 0, "빠진 것: " + 빠진것.join(", "));
  ok("한 종목만 열지 않는다(스트림이 4개다)",
    (url.match(/@ticker/g) || []).length === 4, url);
  t.닫기();
}

/* =========================================================================
 * [4] 기존 방송 이름을 쓰지 않는다 — 시세 경로가 안 섞인다
 * ========================================================================= */
절("[4] 기존 App.Bus 이름을 덮어쓰지 않는다");
{
  const 방송이름 = [...new Set((CODE.match(/emit\(\s*"([^"]+)"/g) || [])
    .map((m) => /"([^"]+)"/.exec(m)[1]))];
  ok("방송 이름이 전부 allsymbol: 로 시작한다",
    방송이름.length > 0 && 방송이름.every((n) => n.indexOf("allsymbol:") === 0),
    "실제: " + 방송이름.join(", "));

  const 충돌 = ["ticker:update", "price:update", "kline:update", "trade:tick",
                "ws:status", "orderbook:update", "funding:update"]
    .filter((n) => CODE.indexOf(n) >= 0);
  ok("js/websocket.js 가 쓰는 이름을 하나도 안 쓴다", 충돌.length === 0,
    "충돌: " + 충돌.join(", ") + " — 24H 통계가 종목끼리 섞입니다");
}

/* =========================================================================
 * [5] 경로가 /market 이다
 *     실측 2026-10-01 — root(wss://fstream.binance.com/stream?...) 로 열면
 *     ★open 은 되고 오류도 0건인데 15초 동안 메시지가 0건★ 이었습니다.
 *     /market 으로 열면 10초에 17건. 조용한 고장이라 눈치챌 방법이 없습니다.
 * ========================================================================= */
절("[5] ★경로가 /market★ 이다 (root 로 열면 메시지 0건)");
{
  const t = 띄우기();
  t.F.init();
  const url = t.마지막소켓().url;
  ok("주소가 /market/stream? 을 쓴다", url.indexOf("/market/stream?") > 0, url);
  ok("주소가 fstream.binance.com 이다", url.indexOf("wss://fstream.binance.com/") === 0, url);
  ok("root(/stream?) 로 바로 열지 않는다",
    !/fstream\.binance\.com\/stream\?/.test(url), url);
  ok("스트림 종류가 @ticker 다 (경로 카탈로그와 같은 짝)",
    /@ticker/.test(url) && !/@miniTicker/.test(url), url);
  t.닫기();
}

/* =========================================================================
 * [6] ⭐ null(아직 안 옴) 과 0(진짜 0) 이 구분된다
 *     이 프로젝트에서 조용한 고장이 가장 자주 나온 자리입니다.
 * ========================================================================= */
절("[6] ⭐ '아직 안 옴(null)' 과 '진짜 0' 이 구분된다");
{
  const t = 띄우기();
  t.F.init();
  t.열기();

  /* (가) 아무것도 안 왔을 때 */
  ok("한 번도 안 온 종목은 get() 이 null 이다", t.F.get("QQQUSDT") === null);
  ok("한 번도 안 온 종목은 has() 가 false 다", t.F.has("QQQUSDT") === false);
  const 처음 = t.F.getAll();
  ok("getAll() 은 ★종목 키는 있고 값만 null★ 이다 (종목이 없는 것과 구분)",
    Object.keys(처음).length === 4 && Object.keys(처음).every((k) => 처음[k] === null),
    JSON.stringify(처음));

  /* (나) 진짜 0 이 왔을 때 */
  t.보내기(틱("QQQUSDT", 0, 0));
  const q0 = t.F.get("QQQUSDT");
  ok("진짜 0 이 오면 get() 이 null 이 아니다", q0 !== null);
  ok("그 값의 price 가 0 이다", q0 && q0.price === 0, q0 && String(q0.price));
  ok("그 종목은 has() 가 true 다", t.F.has("QQQUSDT") === true,
    "0 을 '안 왔다' 로 읽으면 화면이 '-' 로 거짓말을 합니다");
  ok("등락률 0 도 null 이 아니다", q0 && q0.changePercent === 0, q0 && String(q0.changePercent));

  /* (다) 숫자가 아닌 값이 오면 버린다 — 0 으로 지어내지 않는다 */
  const 전dropped = t.F.getStats().dropped;
  t.보내기(틱("SAMSUNGUSDT", "", null, { c: "" }));
  t.보내기(틱("SAMSUNGUSDT", "abc", null, { c: "abc" }));
  t.보내기("{망가진 JSON");
  ok("쓸 수 없는 값은 저장하지 않는다", t.F.get("SAMSUNGUSDT") === null,
    JSON.stringify(t.F.get("SAMSUNGUSDT")));
  ok("버린 건수를 ★세어서 남긴다★ (0 으로 숨기지 않는다)",
    t.F.getStats().dropped === 전dropped + 3,
    "전 " + 전dropped + " → 후 " + t.F.getStats().dropped);

  /* (다-2) 빈 프레임은 ★데이터가 아니라 keepalive★ — dropped 로 세지 않는다.
     실측 2026-10-01 — 바이낸스가 연결마다 빈 프레임 1개를 보냅니다
     (48프레임 중 1개). 섞어 세면 멀쩡한데 "버린 게 1건" 으로 보입니다. */
  const 전empty = t.F.getStats().empty;
  const 전dropped2 = t.F.getStats().dropped;
  t.보내기("");
  t.보내기("   ");
  ok("빈 프레임은 empty 로 따로 센다", t.F.getStats().empty === 전empty + 2,
    "전 " + 전empty + " → 후 " + t.F.getStats().empty);
  ok("빈 프레임을 dropped 로 세지 않는다", t.F.getStats().dropped === 전dropped2,
    "dropped 가 " + 전dropped2 + " → " + t.F.getStats().dropped + " 로 늘었습니다");

  /* (라) 정상 값 */
  t.보내기(틱("SKHYNIXUSDT", 1310.23, -0.724));
  const q = t.F.get("SKHYNIXUSDT");
  ok("정상 값의 price 가 숫자로 들어온다", q && q.price === 1310.23, q && String(q.price));
  ok("등락률은 ★바이낸스 P 값 그대로★ 다 (우리가 다시 계산하지 않는다)",
    q && q.changePercent === -0.724, q && String(q.changePercent));
  ok("App.Bus 로도 방송됐다",
    t.받은.ticker.some((x) => x.symbol === "SKHYNIXUSDT" && x.price === 1310.23),
    JSON.stringify(t.받은.ticker.map((x) => x.symbol)));
  ok("getAll() 에 ageMs(값이 얼마나 오래됐나)가 있다",
    typeof t.F.getAll()["SKHYNIXUSDT"].ageMs === "number");
  t.닫기();
}

/* =========================================================================
 * [7] 끊기면 조용히 죽지 않는다
 *     실측 2026-10-01 — 세 번 강제로 끊고 "끊김 감지 → 다시 값" 까지
 *     1,257 / 2,215 / 1,746 ms. 3번 모두 스스로 되살아났습니다.
 * ========================================================================= */
절("[7] 끊기면 ★조용히 죽지 않고★ 다시 붙는다");
{
  const t = 띄우기();
  t.F.init();
  t.열기();
  ok("붙으면 isConnected() 가 true 다", t.F.isConnected() === true, t.F.getState());
  ok("open 이 방송됐다", t.받은.status.some((s) => s.state === "open"));

  const 소켓수 = t.소켓들().length;
  t.끊기(1006);
  ok("끊기면 ★closed 를 반드시 방송한다★",
    t.받은.status.some((s) => s.state === "closed"),
    "아무 말 없이 멈추면 아무도 고장을 모릅니다");
  ok("끊긴 뒤 isConnected() 가 false 다", t.F.isConnected() === false, t.F.getState());
  ok("다시 붙을 예약(타이머)을 걸었다", t.예약들().length >= 1,
    "예약이 0개면 영원히 안 붙습니다");
  const 첫대기 = t.받은.status.filter((s) => s.state === "reconnecting").pop();
  ok("첫 재시도 대기가 1000ms 다", 첫대기 && 첫대기.afterMs === 1000,
    JSON.stringify(첫대기));

  t.예약실행();
  ok("예약이 돌면 ★새 소켓을 실제로 만든다★", t.소켓들().length === 소켓수 + 1,
    "소켓 " + 소켓수 + " → " + t.소켓들().length);
  t.열기();
  ok("다시 붙으면 open 이 또 방송된다",
    t.받은.status.filter((s) => s.state === "open").length === 2);
  t.보내기(틱("BTCUSDT", 83418.7, 0.09));
  ok("다시 붙은 뒤 값이 들어온다", t.F.get("BTCUSDT").price === 83418.7);
  ok("재접속 횟수가 기록된다 (opens 2 / closes 1)",
    t.F.getStats().opens === 2 && t.F.getStats().closes === 1,
    JSON.stringify(t.F.getStats()));

  /* 한 번 제대로 붙었으면 다음 끊김에 또 1초부터 */
  t.끊기(1006);
  const 둘째대기 = t.받은.status.filter((s) => s.state === "reconnecting").pop();
  ok("성공 후 다음 끊김은 ★또 1000ms★ 부터다 (백오프가 되돌아간다)",
    둘째대기 && 둘째대기.afterMs === 1000, JSON.stringify(둘째대기));

  /* stop() 하면 더 안 붙는다 — 끌 수 있어야 되돌릴 수 있습니다 */
  const 끄기전 = t.소켓들().length;
  t.F.stop();
  t.예약실행();
  ok("stop() 뒤에는 다시 안 붙는다", t.소켓들().length === 끄기전,
    "소켓 " + 끄기전 + " → " + t.소켓들().length);
  t.닫기();
}

/* =========================================================================
 * [8] 등록 — index.html 과 main.js
 * ========================================================================= */
절("[8] index.html · main.js 에 제대로 등록돼 있다");
{
  const html = read("index.html");
  const main = read("main.js");

  ok("index.html 이 js/all-symbol-feed.js 를 부른다",
    /<script src="js\/all-symbol-feed\.js"><\/script>/.test(html));
  ok("index.html 에 한 번만 있다",
    (html.match(/js\/all-symbol-feed\.js/g) || []).length === 1,
    "두 번이면 소켓이 두 개 열립니다");
  ok("js/symbol-registry.js ★뒤★ 에 있다 (앞이면 종목 목록을 못 읽습니다)",
    html.indexOf("js/all-symbol-feed.js") > html.indexOf("js/symbol-registry.js"));
  ok("js/config.js ★뒤★ 에 있다 (주소를 App.Config 에서 뽑습니다)",
    html.indexOf("js/all-symbol-feed.js") > html.indexOf('src="js/config.js"'));

  ok("main.js 부팅 목록에 AllSymbolFeed 가 있다", /"AllSymbolFeed"/.test(main));
  ok("main.js 에 한 번만 있다", (main.match(/"AllSymbolFeed"/g) || []).length === 1,
    "두 번이면 init() 이 두 번 불립니다");
  ok('main.js 에서 "UI" ★뒤★ 에 있다',
    main.indexOf('"AllSymbolFeed"') > main.indexOf('"UI"'),
    "UI.init() 이 DOM 을 재배치하기 전에 끼어들지 않게");

  /* git 에 올라가 있나 — 디스크엔 있는데 커밋엔 없는 조용한 고장 방지 */
  const { execFileSync } = require("child_process");
  const 추적 = execFileSync("git", ["ls-files", "--", SRC_REL], { cwd: REPO })
    .toString().trim();
  ok("js/all-symbol-feed.js 가 git 에 올라가 있다", 추적 === SRC_REL,
    "git ls-files 결과: [" + 추적 + "] — clone 한 PC 에서만 빈 링크가 됩니다");
}

/* ===================================================================== */
console.log("\n" + (fail === 0 ? "✅" : "❌") +
  " all-symbol-feed — 통과 " + pass + " / 실패 " + fail);
if (fail > 0) {
  console.log("\n실패 목록:");
  실패목록.forEach((s) => console.log("  - " + s));
}
/* jsdom 창이 안 닫히면 프로세스가 끝나지 않아 뒤의 테스트가 통째로
   실행되지 않습니다. 반드시 명시적으로 끝냅니다. */
process.exit(fail > 0 ? 1 : 0);
