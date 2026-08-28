/* tests/stream-signals.test.js
 * ⭐ 조용한 고장 — "신호가 와야 하는데 안 오면 잡는다"
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────
 * 2026-08-21, 최근 체결 목록이 영구히 비어 있었습니다. 오류도 안 나고
 * 패널도 멀쩡히 보이는데(높이 575.75px) 체결 신호가 10초에 0회였습니다
 * (같은 시각 호가창은 21회 정상). 회원은 "거래가 뜸한가 보다"로 오해합니다.
 *
 * 원인은 접속 주소였습니다. 바이낸스 선물은 2026-04-23 주소 개편에서
 * 스트림을 경로별로 나눴는데, 체결(@trade)은 /public 에만 있고 /market 에는
 * 없습니다. 그런데 바이낸스는 없는 스트림 이름을 받아도 오류를 내지 않고
 * 연결을 유지합니다 — 그래서 "연결 정상 + 그 스트림만 0건"이 됩니다.
 *
 * 같은 유형이 둘 더 있습니다.
 *   · js/config.js 의 INTERVALS 에서 1s 가 native:true 인데, 바이낸스 선물
 *     kline 에는 1분 미만 간격이 없습니다 (1초 차트가 죽은 이유).
 *   · 비-native 간격(5s/15s)은 kline 스트림을 아예 빼고(config.js 134행)
 *     체결로 캔들을 만듭니다(js/websocket.js 148~163행). 체결이 없으면
 *     그 간격은 차트·현재가·손익·강제청산이 통째로 멈춥니다.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) 스트림 이름 ↔ 경로 짝이 실측 카탈로그와 맞는가
 *  (2) native:true 로 표시한 간격이 바이낸스 선물에 실제로 있는가
 *  (3) 비-native 간격 ↔ 체결 스트림 의존 관계가 끊기지 않았는가
 *
 * ── "잡아내는 테스트인지"를 이 파일 안에서 증명합니다 ──────────────────
 * 각 검사마다 (가) 합성 입력 자체검증 (나) 실제 소스를 메모리에서 망가뜨려
 * 다시 돌려보는 돌연변이 검사를 함께 넣었습니다. 파일은 하나도 안 고칩니다
 * (읽어서 문자열만 바꿔 jsdom 에 올립니다).
 *
 * ── 알려진 결함은 '예외 목록'으로 등록해 둡니다 ────────────────────────
 * TL-004(@trade 경로)와 1s native 는 대표 답변 대기 중이라 아직 안 고쳤습니다.
 * 그래서 지금 상태로 통과시키되, 예외 목록에 없는 위반이 하나라도 새로
 * 생기면 실패합니다. 고치고 나면 예외 목록에서 그 줄을 지우면 됩니다
 * (지우지 않아도 통과합니다 — 예외는 '허용'이지 '요구'가 아닙니다).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { JSDOM } = require("jsdom");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \x1b[32m✓\x1b[0m " + name); }
  else { fail++; console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : "")); }
}

const CONFIG_SRC = fs.readFileSync(path.join(REPO, "js", "config.js"), "utf8");
const WS_SRC = fs.readFileSync(path.join(REPO, "js", "websocket.js"), "utf8");

console.log("\n조용한 고장 — 신호가 와야 하는데 안 오면 잡는다");

/* =========================================================================
 * 0) 실측 카탈로그 — 바이낸스 선물에서 어떤 스트림이 어느 경로에 있는가
 *
 * 2026-08-21 수리팀이 사이트 밖에서 직접 붙어 세어 본 값입니다
 * (docs/수리준비.md "확인한 근거 (가)" 표).
 *
 *   /market/stream?...@trade          15초 → trade 0건      ❌
 *   /public/ws/btcusdt@trade           8초 → trade 737건    ✅
 *   /market/ws/btcusdt@aggTrade        8초 → aggTrade 234건 ✅
 *   /public/ws/btcusdt@aggTrade        8초 → 0건            ❌
 *   /public/ws/btcusdt@depth5@500ms    8초 → depthUpdate 15건 ✅ (호가창이 쓰는 주소)
 *   /market/stream?...@kline/@ticker/@markPrice → 전부 정상  ✅
 * ========================================================================= */
const 스트림_경로 = {
  "@trade": "public",
  "@aggTrade": "market",
  "@depth": "public",
  "@kline_": "market",
  "@ticker": "market",
  "@markPrice": "market",
};

/* 바이낸스 USDⓈ-M 선물 kline 이 실제로 제공하는 간격.
   1분 미만은 없습니다 — 1s 는 현물(spot)에만 있습니다. */
const 선물_KLINE_간격 = ["1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1w", "1M"];

/* ── 알려진 결함(아직 안 고침) ────────────────────────────────────────
   여기 없는 위반이 새로 생기면 이 테스트는 실패합니다. */
const 알려진예외 = [
  { 곳: "js/config.js", 무엇: "market:@trade", 사유: "TL-004 — 체결이 /market 에 없음. docs/수리준비.md [P1], 대표 답변 대기" },
  { 곳: "js/config.js", 무엇: "native:1s", 사유: "1초 캔들이 선물 kline 에 없음. docs/수리준비.md, 대표 답변 대기" },
];

/* =========================================================================
 * 1) 탐지기
 * ========================================================================= */

/* 스트림 이름에서 '종류'만 뽑습니다. btcusdt@markPrice@1s → @markPrice */
function 종류(stream) {
  const at = stream.indexOf("@");
  if (at < 0) return null;
  let rest = stream.slice(at + 1);
  const second = rest.indexOf("@");
  if (second >= 0) rest = rest.slice(0, second);
  if (/^kline_/.test(rest)) return "@kline_";
  rest = rest.replace(/\d+$/, "");            /* depth5 → depth, depth20 → depth */
  return "@" + rest;
}

/* 접속 주소 하나를 뜯어 { 경로, 스트림목록 } 으로 만듭니다. */
function 주소분해(url) {
  const m = /^wss?:\/\/[^/]+\/(public|market|private)\/(?:stream\?streams=([^&]+)|ws\/([^?&]+))/.exec(url);
  if (!m) return null;
  const list = (m[2] || m[3] || "").split("/").filter(Boolean);
  return { 경로: m[1], 스트림: list };
}

/* 주소 하나에서 '그 경로에 없는 스트림'을 찾아냅니다. */
function 경로위반(url) {
  const p = 주소분해(url);
  if (!p) return [];
  const out = [];
  for (const s of p.스트림) {
    const k = 종류(s);
    if (!k) continue;
    const 있어야할경로 = 스트림_경로[k];
    if (!있어야할경로) continue;                 /* 카탈로그에 없는 종류는 판단하지 않습니다 */
    if (있어야할경로 !== p.경로) out.push(p.경로 + ":" + k);
  }
  return out;
}

/* INTERVALS 배열에서 '선물에 없는데 native 라고 표시한 간격'을 찾아냅니다. */
function native위반(intervals) {
  return intervals
    .filter((iv) => iv && iv.native === true && 선물_KLINE_간격.indexOf(iv.value) < 0)
    .map((iv) => "native:" + iv.value);
}

/* config.js 소스(원본이든 망가뜨린 사본이든)를 jsdom 에 올려 App.Config 를 돌려줍니다.
   파일은 건드리지 않습니다 — 읽어온 문자열만 씁니다. */
function config올리기(src) {
  const dom = new JSDOM("<div></div>", { runScripts: "outside-only", pretendToBeVisual: true });
  const win = dom.window;
  win.eval("window.App={Bus:{on(){},off(){},emit(){}},Storage:null};");
  win.eval(src);
  return win.App.Config;
}

/* =========================================================================
 * 2) 탐지기 자체검증 — 합성 입력으로 "진짜 잡는지" 먼저 증명합니다
 * ========================================================================= */
console.log("\n  [자체검증] 탐지기가 실제로 잡는가");
{
  /* 이번 버그가 났던 바로 그 주소 */
  const 버그주소 = "wss://fstream.binance.com/market/stream?streams=btcusdt@kline_1m/btcusdt@ticker/btcusdt@trade/btcusdt@markPrice@1s";
  const v = 경로위반(버그주소);
  ok("이번 버그 주소(/market + @trade)를 위반으로 잡는다",
    v.length === 1 && v[0] === "market:@trade", JSON.stringify(v));

  ok("고친 형태(/public + @trade)는 통과시킨다",
    경로위반("wss://fstream.binance.com/public/ws/btcusdt@trade").length === 0);
  ok("고친 형태(/market + @aggTrade)는 통과시킨다",
    경로위반("wss://fstream.binance.com/market/ws/btcusdt@aggTrade").length === 0);
  ok("거꾸로 쓴 것(/public + @aggTrade)은 잡는다",
    경로위반("wss://fstream.binance.com/public/ws/btcusdt@aggTrade").join() === "public:@aggTrade");
  ok("호가창이 쓰는 주소(/public + @depth5@500ms)는 통과시킨다",
    경로위반("wss://fstream.binance.com/public/ws/btcusdt@depth5@500ms").length === 0);
  ok("호가를 /market 으로 옮기면 잡는다",
    경로위반("wss://fstream.binance.com/market/ws/btcusdt@depth5@500ms").join() === "market:@depth");
  ok("kline/ticker/markPrice 를 /public 으로 옮기면 3건 다 잡는다",
    경로위반("wss://fstream.binance.com/public/stream?streams=btcusdt@kline_1m/btcusdt@ticker/btcusdt@markPrice@1s").length === 3);

  ok("native 검사 — 선물에 없는 1s 를 native 로 표시하면 잡는다",
    native위반([{ value: "1s", native: true }]).join() === "native:1s");
  ok("native 검사 — 1m/5m/1d 는 통과시킨다",
    native위반([{ value: "1m", native: true }, { value: "5m", native: true }, { value: "1d", native: true }]).length === 0);
  ok("native 검사 — 5s 를 비-native 로 두면 통과시킨다",
    native위반([{ value: "5s", native: false }, { value: "15s", native: false }]).length === 0);
  ok("native 검사 — 5s 를 native 로 바꾸면 잡는다",
    native위반([{ value: "5s", native: true }]).join() === "native:5s");
}

/* =========================================================================
 * 3) 실제 코드 검사 — js/config.js 를 그대로 돌려서 주소를 만들어 봅니다
 * ========================================================================= */
console.log("\n  [실제 코드] js/config.js 가 만드는 주소와 간격표");
let 실제위반 = [];
{
  const C = config올리기(CONFIG_SRC);
  ok("App.Config 가 뜬다", !!C && typeof C.buildCombinedStreamUrl === "function");

  const urlNative = C.buildCombinedStreamUrl("BTCUSDT");                 /* 기본 1m */
  C.setActiveInterval("5s");
  const urlSynth = C.buildCombinedStreamUrl("BTCUSDT");                  /* 비-native */
  C.setActiveInterval("1m");

  실제위반 = [...new Set([].concat(경로위반(urlNative), 경로위반(urlSynth), native위반(C.getIntervals())))];
  console.log("    native 간격 주소 : " + urlNative);
  console.log("    5초 간격 주소    : " + urlSynth);
  console.log("    발견된 위반      : " + (실제위반.join(", ") || "없음"));

  const 예외이름 = 알려진예외.map((e) => e.무엇);
  const 새위반 = 실제위반.filter((v) => 예외이름.indexOf(v) < 0);
  ok("예외 목록에 없는 새 위반이 없다", 새위반.length === 0, 새위반.join(", "));
  ok("예외 목록이 2건을 넘지 않는다(새 예외 추가 금지)", 알려진예외.length <= 2, String(알려진예외.length));
  알려진예외.forEach((e) => {
    if (실제위반.indexOf(e.무엇) >= 0) console.log("    · 아직 남아 있는 알려진 결함: " + e.무엇 + " (" + e.사유 + ")");
    else console.log("    · 해소됨 — 예외 목록에서 지워도 됩니다: " + e.무엇);
  });
}

/* =========================================================================
 * 4) 비-native 간격 ↔ 체결 스트림 의존 관계
 *
 * 비-native 간격은 kline 스트림이 빠지고 체결로 캔들을 만듭니다.
 * 체결 스트림이 주소에서 사라지면 5초/15초 차트는 데이터원이 0 이 됩니다
 * (실측: 5초로 바꾼 뒤 12초 동안 kline:update 0회, price:update 0회 →
 *  손익이 멈추고 강제청산 판정이 아예 안 돌았습니다).
 * ========================================================================= */
console.log("\n  [의존 관계] 비-native 간격은 체결 스트림에 매달려 있다");
{
  const C = config올리기(CONFIG_SRC);
  const 체결계열 = (url) => (주소분해(url) || { 스트림: [] }).스트림.some((s) => {
    const k = 종류(s); return k === "@trade" || k === "@aggTrade";
  });

  C.setActiveInterval("5s");
  const u5 = C.buildCombinedStreamUrl("BTCUSDT");
  ok("비-native(5s)에서는 kline 스트림을 빼고 있다", u5.indexOf("@kline_") < 0, u5);
  ok("그러니 비-native(5s) 주소에는 체결 스트림이 반드시 있어야 한다", 체결계열(u5), u5);

  C.setActiveInterval("15s");
  ok("15초도 같다", 체결계열(C.buildCombinedStreamUrl("BTCUSDT")));

  C.setActiveInterval("1m");
  const u1 = C.buildCombinedStreamUrl("BTCUSDT");
  ok("native(1m)에서는 kline 스트림이 들어 있다", u1.indexOf("@kline_1m") >= 0, u1);

  /* 비-native 로 표시된 간격이 실제로 1분 미만인지 — 1분 이상인데 비-native 면
     쓸데없이 체결로 만들고 있는 것입니다. */
  const 이상한비native = C.getIntervals().filter((iv) => !iv.native && iv.seconds >= 60).map((iv) => iv.value);
  ok("1분 이상인데 비-native 로 둔 간격이 없다", 이상한비native.length === 0, 이상한비native.join(","));

  /* 간격표 자체의 앞뒤가 맞는지 */
  const 초불일치 = C.getIntervals().filter((iv) => {
    const m = /^(\d+)([smhd])$/.exec(iv.value);
    if (!m) return false;
    const 배수 = { s: 1, m: 60, h: 3600, d: 86400 }[m[2]];
    return Number(m[1]) * 배수 !== iv.seconds;
  }).map((iv) => iv.value + "=" + iv.seconds);
  ok("간격 이름과 seconds 값이 서로 맞는다", 초불일치.length === 0, 초불일치.join(","));
}

/* =========================================================================
 * 5) 받는 쪽(js/websocket.js) — 비-native 캔들 합성이 체결 분기 안에 있다
 *    (수정 금지 파일이라 읽기만 합니다)
 * ========================================================================= */
console.log("\n  [받는 쪽] js/websocket.js");
{
  const md5 = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, "js", "websocket.js"))).digest("hex");
  ok("websocket.js 를 건드리지 않았다", md5 === "1a914631175760e0b0cb5144bc11b59e", md5);

  /* data.e === "trade" 분기 본문만 잘라내 그 안을 봅니다. */
  const at = WS_SRC.indexOf('data.e === "trade"');
  ok("체결(trade) 분기가 있다", at > 0);
  const 분기본문 = WS_SRC.slice(at, at + 2000);

  ok("체결 분기 안에서 trade:tick 을 방송한다",
    /App\.Bus\.emit\("trade:tick"/.test(분기본문),
    "이게 사라지면 최근 체결·전쟁터 강도가 통째로 멈춥니다");
  ok("체결 분기 안에서 비-native 캔들을 만든다",
    /isNativeInterval\(interval\)/.test(분기본문) && /syntheticCandle/.test(분기본문),
    "5초/15초 캔들의 유일한 데이터원입니다");
  ok("비-native 쪽에서도 kline:update 를 내보낸다",
    (분기본문.match(/App\.Bus\.emit\("kline:update"/g) || []).length >= 2);
  ok("체결 분기 끝에서 현재가를 내보낸다(손익·강제청산의 입력)",
    /setCurrentPrice\(price, data\.s\)/.test(분기본문));

  /* trade:tick 을 방송하는 곳이 몇 군데인지 — 여러 곳이면 두 번 나가 차트가 어긋납니다.
     TL-004 를 별도 모듈로 고치면 2 가 되는데, 그때는 '한 곳은 죽어 있는 곳'이라
     이 검사를 3 이상에서만 실패하도록 열어 둡니다. */
  const 방송처 = [];
  for (const f of fs.readdirSync(path.join(REPO, "js"))) {
    if (!f.endsWith(".js")) continue;
    const s = fs.readFileSync(path.join(REPO, "js", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    if (/App\.Bus\.emit\(\s*"trade:tick"/.test(s)) 방송처.push(f);
  }
  console.log("    trade:tick 을 방송하는 파일: " + 방송처.join(", "));
  ok("체결을 방송하는 곳이 2곳을 넘지 않는다", 방송처.length <= 2, 방송처.join(", "));
}

/* =========================================================================
 * 6) 저장소 전체 스캔 — 어디서든 주소를 새로 만들면 같은 규칙을 적용합니다
 * ========================================================================= */
console.log("\n  [전체 스캔] js/ 안의 모든 접속 주소");
{
  /* 주소를 문자열 하나로 다 적는 파일도 있고(orderbook.js), 조각을 이어 붙이는
     파일도 있습니다(trade-stream-fix.js: 경로 + 심볼 + "@aggTrade").
     그래서 "그 파일에 나오는 경로"와 "그 파일에 나오는 @스트림 이름"을 모두
     짝지어 봅니다. 조각내서 숨겨도 잡힙니다. */
  function 파일검사(src, 파일명) {
    const s = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
                 .replace(/^(\s*)\/\/.*$/gm, "$1");
    const 경로들 = [...new Set((s.match(/wss?:\/\/[^"'`\s]*fstream\.binance\.com\/(public|market|private)\//g) || [])
      .map((u) => /\/(public|market|private)\/$/.exec(u)[1]))];
    if (!경로들.length) return { 경로들: [], 스트림들: [], 위반: [] };
    const 스트림들 = [...new Set((s.match(/"@[A-Za-z][\w]*"|'@[A-Za-z][\w]*'/g) || [])
      .map((q) => 종류(q.slice(1, -1))).filter((k) => k && 스트림_경로[k]))];
    const 위반 = [];
    for (const p of 경로들) for (const k of 스트림들) {
      if (스트림_경로[k] !== p) 위반.push(파일명 + " " + p + ":" + k);
    }
    return { 경로들, 스트림들, 위반 };
  }

  const 위반들 = [];
  for (const f of fs.readdirSync(path.join(REPO, "js"))) {
    if (!f.endsWith(".js")) continue;
    const r = 파일검사(fs.readFileSync(path.join(REPO, "js", f), "utf8"), "js/" + f);
    if (!r.경로들.length) continue;
    console.log("    js/" + f + " → 경로 [" + r.경로들.join(",") + "] · 스트림 [" + (r.스트림들.join(",") || "없음") + "]");
    위반들.push(...r.위반);
  }
  const 예외이름 = 알려진예외.map((e) => e.무엇);
  const 새위반 = 위반들.filter((v) => !예외이름.some((n) => v.indexOf(n) >= 0));
  ok("js/ 안에서 주소를 만드는 곳의 경로가 전부 맞다", 새위반.length === 0, 새위반.join(", "));

  /* 이 스캔이 실제로 잡는지 — 조각내서 적은 형태를 망가뜨려 봅니다 */
  const 정상사본 = 'var 경로 = "wss://fstream.binance.com/market/ws/";\nvar S = "@aggTrade";';
  const 망친사본 = 'var 경로 = "wss://fstream.binance.com/market/ws/";\nvar S = "@trade";';
  ok("→ 조각내어 적은 정상 주소는 통과시킨다", 파일검사(정상사본, "t").위반.length === 0);
  ok("→ 조각내어 적어도 /market + @trade 는 잡는다",
    파일검사(망친사본, "t").위반.join() === "t market:@trade");
}

/* =========================================================================
 * 7) 돌연변이 검사 — 실제 소스를 메모리에서 망가뜨려 이 테스트가 잡는지 확인
 *    (파일은 하나도 안 고칩니다. 읽어온 문자열만 바꿔 씁니다.)
 * ========================================================================= */
console.log("\n  [돌연변이] 버그를 다시 넣으면 정말 실패하는가");
{
  /* (가) 체결 스트림을 빼 버린다 — "어차피 안 오니까 지우자" 가 이 모양입니다.
         5초/15초 차트의 유일한 데이터원이 사라집니다. */
  const 뺀소스 = CONFIG_SRC.replace('s + "@trade", ', "");
  ok("돌연변이 준비 — 체결 스트림을 뺀 사본을 만들었다", 뺀소스 !== CONFIG_SRC);
  {
    const C = config올리기(뺀소스);
    C.setActiveInterval("5s");
    const u = C.buildCombinedStreamUrl("BTCUSDT");
    const 체결있나 = (주소분해(u) || { 스트림: [] }).스트림.some((s) => {
      const k = 종류(s); return k === "@trade" || k === "@aggTrade";
    });
    ok("→ 체결을 빼면 '비-native 는 체결에 매달린다' 검사가 실패한다", 체결있나 === false, u);
  }

  /* (나) 경로를 고친 사본 — 위반이 사라지는지 (검사가 방향까지 맞는지) */
  {
    const 고친소스 = CONFIG_SRC.replace(
      'const WS_STREAM_BASE = "wss://fstream.binance.com/market";',
      'const WS_STREAM_BASE = "wss://fstream.binance.com/public";'
    );
    const C = config올리기(고친소스);
    const v = 경로위반(C.buildCombinedStreamUrl("BTCUSDT"));
    /* /public 으로 통째로 옮기면 @trade 는 살고 kline/ticker/markPrice 가 죽습니다.
       "경로 하나로 다 되지 않는다"는 사실 자체를 여기서 못박아 둡니다. */
    ok("→ 통째로 /public 으로 옮기면 이번엔 kline/ticker/markPrice 가 위반이 된다",
      v.indexOf("public:@trade") < 0 && v.length === 3, v.join(","));
  }

  /* (다) 5초를 native 로 바꿔 버린다 — 바이낸스에 없는 간격을 있다고 표시 */
  {
    const 망친소스 = CONFIG_SRC.replace(
      '{ value: "5s", label: "5초", seconds: 5, native: false }',
      '{ value: "5s", label: "5초", seconds: 5, native: true }'
    );
    const C = config올리기(망친소스);
    const v = native위반(C.getIntervals());
    ok("→ 5초를 native 로 바꾸면 새 위반으로 잡힌다", v.indexOf("native:5s") >= 0, v.join(","));
    const 예외이름 = 알려진예외.map((e) => e.무엇);
    ok("→ 그 위반은 예외 목록에 없어서 3) 검사가 실패한다",
      v.filter((x) => 예외이름.indexOf(x) < 0).length === 1);
  }

  /* (라) 간격 이름과 seconds 를 어긋나게 만든다 */
  {
    const 망친소스 = CONFIG_SRC.replace(
      '{ value: "15m", label: "15분", seconds: 900, native: true }',
      '{ value: "15m", label: "15분", seconds: 90, native: true }'
    );
    const C = config올리기(망친소스);
    const 불일치 = C.getIntervals().filter((iv) => {
      const m = /^(\d+)([smhd])$/.exec(iv.value);
      if (!m) return false;
      return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2]] !== iv.seconds;
    });
    ok("→ 간격 이름과 seconds 가 어긋나면 잡는다", 불일치.length === 1, JSON.stringify(불일치));
  }
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) { console.log("실패 있음 ❌"); process.exit(1); }
console.log("전체 통과 ✅");
/* jsdom 창이 타이머를 붙들고 있어 명시적으로 끝냅니다(tests/README.md). */
process.exit(0);
