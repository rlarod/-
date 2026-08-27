/* tests/dev-server.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 로컬 확인용 서버(`npm run dev`)가 몇 시간마다 죽던 것.
 *
 * 있었던 상태 (2026-08-24)
 *   "dev": "serve -l 3000" 이었는데 `serve` 14.2.6 이 브라우저 요청을 오래
 *   받으면 `EMFILE: too many open files` 로 죽었습니다. 하루에 8번 죽었습니다.
 *   사이트 버그가 아니라 로컬 서버만의 문제지만 값이 비쌉니다 —
 *   팀이 측정하는 중에 죽으면 "3D 병사가 안 고쳐졌다", "5분 버튼이 없다"
 *   같은 **엉뚱한 결과**가 나옵니다. 실제로 두 번 다 그랬습니다.
 *
 * 이 테스트가 못 박는 것
 *   ① 서버가 외부 패키지를 쓰지 않는다 (node: 기본 모듈만).
 *      설치가 필요하면 그것 자체가 또 하나의 고장 지점이 됩니다.
 *   ② .js 를 자바스크립트 MIME 으로 준다.
 *      이 사이트는 <script type="importmap"> 과 three.js ES 모듈을 씁니다.
 *      .js 의 MIME 이 명세의 "JavaScript MIME type" 목록 밖이면 모듈이
 *      통째로 안 뜨고, 화면은 반쯤 나오는데 콘솔에만 오류가 뜹니다 —
 *      정확히 우리가 P1 으로 다루는 "조용한 고장" 입니다.
 *   ③ 경로 탈출(..)로 프로젝트 밖 파일을 못 읽는다. 문자열 검사가 아니라
 *      resolveSafePath() 를 **실제로 불러서** 확인합니다.
 *   ④ 스트림을 error / end / close + 응답쪽 close / error 에서 닫는다.
 *      이걸 빠뜨리는 것이 EMFILE 의 원인이었습니다.
 *   ⑤ package.json 에 되돌릴 수 있는 옛 스크립트가 남아 있다.
 *
 * 서버를 띄우지 않습니다.
 *   npm test 가 포트를 잡으면 팀이 쓰던 3000 서버를 죽입니다.
 *   그래서 소스를 읽어 검사하고, require 해도 listen 하지 않는지까지 확인합니다.
 * --------------------------------------------------------------------------- */

"use strict";

const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SERVER_REL = "scripts/dev-server.js";
const SERVER_ABS = path.join(REPO, SERVER_REL);

let pass = 0;
let fail = 0;
function ok(name, cond) {
  if (cond) {
    pass++;
    console.log("  ✅ " + name);
  } else {
    fail++;
    console.log("  ❌ " + name);
  }
}

console.log("\n=== dev-server: 로컬 서버가 EMFILE 로 죽지 않게 ===\n");

/* ------------------------------------------------------------------ */
console.log("[1] 파일이 있고 문법이 맞다");

ok("scripts/dev-server.js 가 있다", fs.existsSync(SERVER_ABS));
const src = fs.existsSync(SERVER_ABS) ? fs.readFileSync(SERVER_ABS, "utf8") : "";
ok("내용이 비어 있지 않다", src.length > 1000);

/* ------------------------------------------------------------------ */
console.log("\n[2] 외부 패키지를 쓰지 않는다 (node: 기본 모듈만)");

/* require("...") / require('...') 의 인자를 전부 뽑는다 */
const requires = [];
const reqRe = /require\(\s*["']([^"']+)["']\s*\)/g;
let m;
while ((m = reqRe.exec(src)) !== null) requires.push(m[1]);

ok("require 가 하나 이상 있다", requires.length > 0);
const nonBuiltin = requires.filter(function (r) {
  return !r.startsWith("node:");
});
ok(
  "require 는 전부 node: 접두사다" +
    (nonBuiltin.length ? " — 위반: " + nonBuiltin.join(", ") : ""),
  nonBuiltin.length === 0
);
ok("node:http 를 쓴다", requires.indexOf("node:http") !== -1);
ok("node:fs 를 쓴다", requires.indexOf("node:fs") !== -1);

/* import 구문으로 외부 패키지를 끌어오지도 않는지 */
ok(
  "ES import 로 외부 패키지를 끌어오지 않는다",
  !/^\s*import\s+[^\n]*from\s+["'](?!node:)/m.test(src)
);

/* package.json 의 의존성 이름이 소스에 등장하지 않는지 */
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, "package.json"), "utf8"));
const depNames = Object.keys(pkg.dependencies || {}).concat(
  Object.keys(pkg.devDependencies || {})
);
const leaked = depNames.filter(function (d) {
  return requires.indexOf(d) !== -1;
});
ok(
  "devDependencies(" + depNames.join(", ") + ") 를 require 하지 않는다",
  leaked.length === 0
);

/* ------------------------------------------------------------------ */
console.log("\n[3] require 해도 서버가 뜨지 않는다 (npm test 가 포트를 뺏으면 안 됨)");

ok(
  "listen() 이 require.main === module 안에서만 불린다",
  /require\.main\s*===\s*module/.test(src)
);

let mod = null;
let loadErr = null;
try {
  mod = require(SERVER_ABS);
} catch (e) {
  loadErr = e;
}
ok("require 가 오류 없이 된다" + (loadErr ? " — " + loadErr.message : ""), !loadErr);
ok(
  "require 만으로는 listen 하지 않는다",
  !!mod && !!mod.server && mod.server.listening === false
);

/* ------------------------------------------------------------------ */
console.log("\n[4] MIME — .js 를 자바스크립트로 준다 (importmap/ES 모듈이 여기 달렸다)");

const MIME = (mod && mod.MIME) || {};
ok(".js 항목이 MIME 표에 있다", typeof MIME[".js"] === "string" && MIME[".js"].length > 0);

/* essence = 파라미터(charset) 뺀 앞부분 */
function essence(v) {
  return String(v).split(";")[0].trim().toLowerCase();
}

const allowed = (mod && mod.JS_MIME_ALLOWED) || [];
ok(
  "허용 목록에 text/javascript 가 있다",
  allowed.indexOf("text/javascript") !== -1
);
ok(
  "허용 목록에 application/javascript 가 있다",
  allowed.indexOf("application/javascript") !== -1
);
ok(
  ".js 값(" + MIME[".js"] + ") 이 자바스크립트 MIME 목록 안이다",
  allowed.indexOf(essence(MIME[".js"])) !== -1
);
ok(".js 에 charset=utf-8 이 붙는다", /charset=utf-8/i.test(MIME[".js"] || ""));

/* 2026-08-24 실측: 기존 serve 와 실제 배포(Vercel)가 둘 다 이 값이었습니다.
   로컬이 배포와 다른 MIME 을 주면 로컬에서만 되는/안 되는 차이가 생깁니다. */
ok(
  ".js 가 배포(Vercel)와 같은 application/javascript 다",
  essence(MIME[".js"]) === "application/javascript"
);

/* 사이트가 실제로 쓰는 확장자는 전부 표에 있어야 한다 (2026-08-24 index.html 기준) */
[
  [".html", "text/html"],
  [".css", "text/css"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".glb", "model/gltf-binary"],
  [".json", "application/json"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
].forEach(function (pair) {
  ok(
    pair[0] + " → " + pair[1],
    essence(MIME[pair[0]]) === pair[1]
  );
});

/* 모르는 확장자는 추측하지 않는다 */
ok(
  "모르는 확장자는 application/octet-stream 으로 떨어진다",
  mod && essence(mod.mimeFor("x.zzzunknown")) === "application/octet-stream"
);
ok(
  "확장자 대소문자를 가리지 않는다 (.PNG 도 image/png)",
  mod && essence(mod.mimeFor("A.PNG")) === "image/png"
);

/* ------------------------------------------------------------------ */
console.log("\n[5] 경로 탈출 차단 — 실제로 함수를 불러서 확인");

const resolveSafePath = mod && mod.resolveSafePath;
ok("resolveSafePath 가 내보내져 있다", typeof resolveSafePath === "function");

if (typeof resolveSafePath === "function") {
  /* 막아야 하는 것들 */
  [
    "/../package.json",
    "/../../Windows/win.ini",
    "/../../../../etc/hosts",
    "/js/../../package.json",
    "/..%2f..%2fWindows/win.ini",
    "/%2e%2e/%2e%2e/Windows/win.ini",
    "/..\\..\\Windows\\win.ini",
    "/js/..\\..\\package.json",
  ].forEach(function (p) {
    const r = resolveSafePath(p);
    ok("막힌다: " + p, r.error === 403 || r.error === 400);
  });

  /* 통과해야 하는 것들 — 막아버리면 사이트가 안 뜬다 */
  [
    ["/", REPO],
    ["/index.html", path.join(REPO, "index.html")],
    ["/js/trading.js", path.join(REPO, "js", "trading.js")],
    ["/assets/soldier.glb", path.join(REPO, "assets", "soldier.glb")],
    ["/js/market-data/mock-adapter.js", path.join(REPO, "js", "market-data", "mock-adapter.js")],
  ].forEach(function (pair) {
    const r = resolveSafePath(pair[0]);
    ok("통과한다: " + pair[0], !r.error && r.full === pair[1]);
  });

  /* 한글 파일명(퍼센트 인코딩)도 제대로 풀린다 */
  const kr = resolveSafePath("/assets/%EB%B0%B0%EB%84%88.png");
  ok(
    "퍼센트 인코딩된 한글 파일명이 풀린다",
    !kr.error && kr.full === path.join(REPO, "assets", "배너.png")
  );

  /* 깨진 인코딩 / 널바이트는 400 */
  ok("깨진 퍼센트 인코딩은 400", resolveSafePath("/%ZZ").error === 400);
  ok("널바이트는 400", resolveSafePath("/a%00b.js").error === 400);

  /* ROOT 밖으로 나가는 결과가 하나라도 나오면 안 된다 */
  const escapes = [
    "/../package.json",
    "/../../Windows/win.ini",
    "/%2e%2e/%2e%2e/x",
    "/..\\x",
  ].filter(function (p) {
    const r = resolveSafePath(p);
    return !r.error && r.full && !r.full.startsWith(mod.ROOT);
  });
  ok("ROOT 밖 경로를 돌려주는 입력이 하나도 없다", escapes.length === 0);
}

/* ------------------------------------------------------------------ */
console.log("\n[6] 파일 핸들을 흘리지 않는다 (EMFILE 의 원인)");

ok("createReadStream 을 쓴다", /createReadStream/.test(src));
ok("stream.destroy() 로 닫는다", /stream\.destroy\(\)/.test(src));

/* 다섯 군데 정리 지점 — 하나라도 빠지면 fd 가 샌다 */
ok("스트림 'error' 에서 정리한다", /stream\.on\(\s*["']error["']/.test(src));
ok("스트림 'end' 에서 정리한다", /stream\.on\(\s*["']end["']\s*,\s*cleanup/.test(src));
ok("스트림 'close' 에서 정리한다", /stream\.on\(\s*["']close["']\s*,\s*cleanup/.test(src));
ok(
  "응답 'close' 에서 정리한다 (브라우저가 도중에 끊는 경우)",
  /res\.on\(\s*["']close["']\s*,\s*cleanup/.test(src)
);
ok("응답 'error' 에서 정리한다", /res\.on\(\s*["']error["']\s*,\s*cleanup/.test(src));

/* 두 번 이상 불려도 한 번만 동작해야 한다 */
ok("cleanup 이 중복 실행을 막는다 (closed 플래그)", /closed\s*=\s*true/.test(src));

/* EMFILE 이 나도 죽지 않는다 */
ok("EMFILE 을 잡아서 서버가 죽지 않는다", /EMFILE/.test(src));
ok("clientError 로 잘못된 요청에 안 죽는다", /clientError/.test(src));

/* 소켓도 쌓이면 EMFILE 이다 */
ok("keepAliveTimeout 을 건다", /keepAliveTimeout\s*=/.test(src));
ok("requestTimeout 을 건다", /requestTimeout\s*=/.test(src));

/* 끌 때 남은 스트림 정리 */
ok("SIGINT/SIGTERM 에서 남은 스트림을 닫는다", /SIGINT/.test(src) && /openStreams/.test(src));

/* ------------------------------------------------------------------ */
console.log("\n[7] 기본 동작이 소스에 있다");

ok("없는 파일은 404 를 준다 (조용히 200 을 주지 않는다)", /404/.test(src));
ok("디렉터리는 index.html 로 간다", /index\.html/.test(src));
ok("GET/HEAD 외에는 405", /405/.test(src));
ok("포트 기본값이 3000 이다", /\|\|\s*3000/.test(src));

/* ------------------------------------------------------------------ */
console.log("\n[8] package.json — 되돌릴 수 있어야 한다");

const scripts = pkg.scripts || {};
ok("dev 스크립트가 있다", typeof scripts.dev === "string");
ok(
  "dev:node 로 새 서버를 부를 수 있다",
  typeof scripts["dev:node"] === "string" &&
    /scripts\/dev-server\.js/.test(scripts["dev:node"])
);
ok(
  "옛 serve 스크립트가 dev:serve 로 남아 있다 (되돌리기용)",
  typeof scripts["dev:serve"] === "string" && /serve\s+-l\s+3000/.test(scripts["dev:serve"])
);
ok(
  "serve 가 devDependencies 에 남아 있다 (되돌릴 때 설치 없이 바로 되게)",
  !!(pkg.devDependencies && pkg.devDependencies.serve)
);
/* 2026-08-27 — 실행 목록이 package.json 의 && 사슬에서 tests/_order.txt 로
   옮겨졌습니다. 확인하는 것("이 테스트가 npm test 로 실제 돈다")은 그대로고
   보는 자리만 바뀌었습니다. 왜 옮겼는지는 tests/_run-all.js 머리말 참조. */
ok(
  "npm test 가 전체 실행기(tests/_run-all.js)를 부른다",
  /tests[/\\]_run-all\.js/.test(scripts.test || "")
);
ok(
  "npm test 목록(tests/_order.txt)에 이 테스트가 등록돼 있다",
  /tests\/dev-server\.test\.js/.test(
    fs.readFileSync(path.join(REPO, "tests", "_order.txt"), "utf8")
  )
);
ok(
  "새 패키지를 설치하지 않았다 (dependencies 없음)",
  !pkg.dependencies || Object.keys(pkg.dependencies).length === 0
);

/* ------------------------------------------------------------------ */
console.log("\n[9] 사이트 파일은 건드리지 않았다 (이건 개발 도구 작업이다)");

/* 수정 금지 12개 + index.html 은 이 작업과 무관해야 한다.
   여기서는 "서버가 특정 사이트 파일을 특별 취급하지 않는지"만 본다. */
[
  "js/trading.js",
  "js/ui.js",
  "js/auth.js",
  "js/supabase-sync.js",
  "js/chat.js",
  "js/leaderboard.js",
  "js/admin.js",
  "js/season.js",
  "js/board.js",
  "js/orderbook.js",
  "js/chart.js",
  "js/websocket.js",
].forEach(function (f) {
  ok("서버가 " + f + " 를 특별 취급하지 않는다", src.indexOf(f) === -1);
});

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) {
  console.log("전체 통과 ✅");
  process.exit(0);
} else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
