/* tests/html-assets-tracked.test.js
 * =========================================================================
 * index.html 이 부르는 파일은 (1) 디스크에 있고 (2) git 에도 있어야 한다
 * =========================================================================
 * 2026-08-27 — 감사팀 발견 / 본부장 확인 / 기록팀 봉인
 *
 * 무엇이 위험한가
 *   파일이 **내 컴퓨터에는 있는데 git 에는 없는** 상태에서 index.html 만
 *   커밋해 푸시하면, 라이브에서 그 <script> 가 404 가 됩니다.
 *   화면은 멀쩡히 뜨고 콘솔에만 404 가 찍히므로 회원은 기능 하나가
 *   통째로 없어진 줄 모릅니다(조용한 고장).
 *
 *   2026-08-27 하루에만 이 상황이 두 번 났습니다. 그때마다 본부장이
 *   손으로 확인해서 막았습니다. 손으로 하는 확인은 언젠가 빠집니다.
 *
 * 그래서 여기서 못 박는 것
 *   ① index.html 이 부르는 js/css 가 디스크에 실제로 있다
 *   ② index.html 이 부르는 js/css 가 git 에 추적되고 있다   ← 핵심
 *   ③ importmap 이 가리키는 로컬 모듈도 같은 두 가지
 *   ④ 같은 파일을 두 번 부르지 않는다
 *   ⑤ (참고) 아무도 안 부르는 js/css 가 지금보다 늘지 않는다
 *
 *   ① 만 있으면 "내 컴퓨터엔 있는데 라이브엔 없는" 상태를 못 잡습니다.
 *   ② 가 이 파일의 존재 이유입니다.
 *
 * ⚠ git 이 없는 환경에서는 ② 를 건너뛰고 "git 없음" 이라고 남깁니다.
 *   테스트 자체가 죽으면 뒤 테스트가 통째로 안 돌아갑니다.
 * ========================================================================= */
"use strict";

const fs = require("fs");
const path = require("path");
const cp = require("child_process");

const REPO = process.env.REPO || path.resolve(__dirname, "..");

const ESC = String.fromCharCode(27);
const MARK_OK = ESC + "[32m" + "✓" + ESC + "[0m";
const MARK_NG = ESC + "[31m" + "✗" + ESC + "[0m";

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  " + MARK_OK + " " + name); }
  else { fail++; console.log("  " + MARK_NG + " " + name + (detail ? " — " + detail : "")); }
}
function section(t) { console.log("\n" + t); }

const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");

/* ------------------------------------------------------------------------
 * index.html 이 부르는 것 모으기
 * ---------------------------------------------------------------------- */
const isRemote = (u) => /^(https?:)?\/\//.test(u);
const clean = (u) => u.replace(/^\.\//, "").split("?")[0].split("#")[0];

function pick(re, group) {
  const out = [];
  let m;
  const r = new RegExp(re.source, "g");
  while ((m = r.exec(html)) !== null) out.push(m[group]);
  return out;
}

const scriptSrcs = pick(/<script[^>]*\ssrc="([^"]+)"/, 1);
const linkHrefs = pick(/<link[^>]*\shref="([^"]+\.css)"/, 1);

/* importmap — <script type="importmap"> 안의 { "imports": { "three": "./js/…" } }
   js/three-global-shim.js 는 <script src> 가 아니라 여기로만 불립니다.
   이것도 빠지면 3D 배지가 통째로 안 뜹니다. */
const importMapLocals = [];
{
  const m = html.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    const body = m[1].replace(/\/\*[\s\S]*?\*\//g, "");
    try {
      const map = JSON.parse(body);
      const imports = (map && map.imports) || {};
      Object.keys(imports).forEach((k) => {
        const v = String(imports[k]);
        if (!isRemote(v) && /\.js$/.test(v)) importMapLocals.push(clean(v));
      });
    } catch (e) {
      /* 파싱이 안 되면 아래 검사에서 "importmap 을 읽었다" 가 실패합니다. */
    }
  }
}

const localJs = scriptSrcs.filter((u) => !isRemote(u)).map(clean);
const localCss = linkHrefs.filter((u) => !isRemote(u)).map(clean);

section("0. 무엇을 부르고 있나");
{
  ok("index.html 이 js 를 부르고 있다 (" + localJs.length + "개)", localJs.length > 50, String(localJs.length));
  ok("index.html 이 css 를 부르고 있다 (" + localCss.length + "개)", localCss.length >= 3, String(localCss.length));
  ok("importmap 을 읽었다 (" + importMapLocals.length + "개)", importMapLocals.length >= 1,
    "importmap 을 못 읽으면 <script src> 밖에서 불리는 모듈을 통째로 놓칩니다");
}

/* ------------------------------------------------------------------------
 * ① 디스크에 실제로 있나
 * ---------------------------------------------------------------------- */
section("1. 디스크에 실제로 있나");
function missingOnDisk(list) {
  return list.filter((f) => !fs.existsSync(path.join(REPO, f)));
}
{
  const a = missingOnDisk(localJs);
  ok("부르는 js 가 전부 디스크에 있다", a.length === 0, "없는 파일: " + a.join(", "));
  const b = missingOnDisk(localCss);
  ok("부르는 css 가 전부 디스크에 있다", b.length === 0, "없는 파일: " + b.join(", "));
  const c = missingOnDisk(importMapLocals);
  ok("importmap 이 가리키는 모듈이 전부 디스크에 있다", c.length === 0, "없는 파일: " + c.join(", "));
}

/* ------------------------------------------------------------------------
 * ② git 에 추적되고 있나   ← 이 파일의 핵심
 * ---------------------------------------------------------------------- */
section("2. git 에 추적되고 있나 (라이브 404 방지)");
{
  let tracked = null;
  let why = "";
  try {
    const out = cp.execFileSync("git", ["ls-files"], {
      cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024,
    });
    const set = new Set(out.split("\n").map((s) => s.trim()).filter(Boolean));
    if (set.size === 0) { why = "git 저장소가 아님(추적 파일 0건)"; }
    else tracked = set;
  } catch (e) {
    why = "git 을 실행할 수 없음: " + (e && e.message ? String(e.message).split("\n")[0] : e);
  }

  if (!tracked) {
    /* 테스트를 죽이지 않습니다. 못 봤다는 사실만 남깁니다. */
    console.log("  · git 검사 건너뜀 — " + why);
    ok("[건너뜀] git 추적 검사 — 이유를 남겼다", true);
  } else {
    const untracked = (list) => list.filter((f) => !tracked.has(f));
    const a = untracked(localJs);
    ok("부르는 js 가 전부 git 에 있다", a.length === 0,
      "미추적 " + a.length + "개: " + a.join(", ") + " — 이대로 index.html 만 푸시하면 라이브에서 404 입니다");
    const b = untracked(localCss);
    ok("부르는 css 가 전부 git 에 있다", b.length === 0, "미추적: " + b.join(", "));
    const c = untracked(importMapLocals);
    ok("importmap 이 가리키는 모듈도 git 에 있다", c.length === 0, "미추적: " + c.join(", "));
    ok("index.html 자체가 git 에 있다", tracked.has("index.html"));
  }
}

/* ------------------------------------------------------------------------
 * ④ 같은 파일을 두 번 부르지 않는다
 * ------------------------------------------------------------------------
 * 같은 모듈이 두 번 실행되면 이벤트 구독이 두 벌이 되고, 카운터가 초기화되고,
 * 감싸기(wrap)가 두 번 걸립니다. 이 프로젝트에서 반복해서 나온 유형입니다.
 * ---------------------------------------------------------------------- */
section("3. 같은 파일을 두 번 부르지 않는다");
{
  const dup = (list) => {
    const seen = {}; const out = [];
    list.forEach((f) => { seen[f] = (seen[f] || 0) + 1; if (seen[f] === 2) out.push(f); });
    return out;
  };
  const dj = dup(localJs);
  ok("같은 js 를 두 번 부르지 않는다", dj.length === 0, "중복: " + dj.join(", "));
  const dc = dup(localCss);
  ok("같은 css 를 두 번 부르지 않는다", dc.length === 0, "중복: " + dc.join(", "));
}

/* ------------------------------------------------------------------------
 * ⑤ 아무도 안 부르는 파일 — 목록만 보여주고, 개수만 못 박습니다
 * ------------------------------------------------------------------------
 * 실패시키지 않습니다. 일부러 안 부르는 것이 있습니다(css/ad-banner-*.css 는
 * 광고 배너 시안 잔재입니다). 다만 **늘어나면** 잡습니다 —
 * 만들었는데 아무도 안 부르는 죽은 모듈이 쌓이는 것을 막습니다.
 *
 * 2026-08-27 실측
 *   js  1개  — js/ad-status-bar.js (115줄, 참조 0건, 2026-08-26 디자인팀 C안 시안)
 *   css 6개  — css/ad-banner*.css 시안 잔재
 * 늘리려면 이 숫자를 올리기 전에 "왜 안 부르는지" 를 여기 주석에 적으세요.
 * ---------------------------------------------------------------------- */
section("4. 아무도 안 부르는 파일 (참고 — 늘지만 않게)");
{
  const JS_DEAD_MAX = 1;
  const CSS_DEAD_MAX = 6;

  const listFiles = (dir, rel) => {
    const p = path.join(REPO, dir);
    if (!fs.existsSync(p)) return [];
    return fs.readdirSync(p).filter((f) => f.endsWith(rel)).map((f) => (dir === "." ? f : dir + "/" + f));
  };

  const diskJs = listFiles("js", ".js");
  const diskCss = listFiles("css", ".css").concat(listFiles(".", ".css"));

  /* 부르는 쪽 = index.html(<script src> · importmap) + 다른 js 소스가
     파일명을 문자열로 들고 있는 경우(동적 로딩). 이름만 보고 죽었다고
     단정하지 않습니다. */
  const jsSources = diskJs.map((f) => {
    try { return fs.readFileSync(path.join(REPO, f), "utf8"); } catch (e) { return ""; }
  }).join("\n");

  const referenced = new Set(localJs.concat(importMapLocals));
  const deadJs = diskJs.filter((f) => {
    if (referenced.has(f)) return false;
    const base = f.replace(/^js\//, "");
    /* 자기 파일 안의 자기 이름(머리말 주석)은 참조로 치지 않습니다. */
    const others = jsSources.split(fs.readFileSync(path.join(REPO, f), "utf8")).join("");
    return others.indexOf(base) < 0;
  });

  const cssReferenced = new Set(localCss);
  const deadCss = diskCss.filter((f) => !cssReferenced.has(f) && html.indexOf(f) < 0);

  if (deadJs.length) console.log("  · 안 불리는 js: " + deadJs.join(", "));
  if (deadCss.length) console.log("  · 안 불리는 css: " + deadCss.join(", "));

  ok("안 불리는 js 가 " + JS_DEAD_MAX + "개를 넘지 않는다 (지금 " + deadJs.length + "개)",
    deadJs.length <= JS_DEAD_MAX, deadJs.join(", "));
  ok("안 불리는 css 가 " + CSS_DEAD_MAX + "개를 넘지 않는다 (지금 " + deadCss.length + "개)",
    deadCss.length <= CSS_DEAD_MAX, deadCss.join(", "));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); }
/* 남은 타이머가 프로세스를 붙들면 뒤 테스트가 통째로 안 돌아갑니다. */
process.exit(fail === 0 ? 0 : 1);
