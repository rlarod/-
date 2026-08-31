/* tests/three-addons.test.js
 * ---------------------------------------------------------------------------
 * 무엇을 막나 — 3D 병사 모델이 안 뜨는 것, 그리고 **three 가 두 벌 로드되는 것**.
 *                                                          (TL-003 / P3)
 *
 * 있었던 버그 (2026-08-21):
 *   index.html 이 three 를 옛 방식(three.min.js, UMD)으로 불러 전역 THREE 를
 *   만들면서, 애드온(GLTFLoader/SkeletonUtils)은 ES모듈로 불렀습니다.
 *   애드온 안에는 `from "three"` 가 들어 있는데 "three" 는 경로가 아니라
 *   이름(bare specifier)이라, 페이지에 importmap 이 없으면 import 가 실패합니다.
 *   -> window.GLTFLoader 가 안 만들어지고 병사가 안 나왔습니다.
 *
 *   **두 번째 결함(이번에 새로 찾음)** — SkeletonUtils.js 는 `SkeletonUtils`
 *   라는 이름을 내보내지 않습니다(r160 기준 retarget/retargetClip/clone 셋뿐).
 *   그래서 `import { SkeletonUtils }` 는 importmap 을 넣어도 SyntaxError 로
 *   실패하고, 그 모듈 전체가 죽어 window.GLTFLoader 까지 같이 안 만들어집니다.
 *   importmap 만 넣는 것으로는 안 고쳐집니다.
 *
 * ★ 이 테스트의 제일 중요한 임무 — **three 두 벌 로드 금지**
 *   importmap 의 "three" 를 three.module.js 로 걸면 three 가 두 벌 됩니다.
 *   그러면 GLTFLoader 가 만든 Mesh 와 market-war.js 의 Scene 이 서로 다른
 *   클래스가 되어 스키닝·재질이 어긋날 수 있습니다. "될 때도 있고 안 될 때도
 *   있는" 가장 나쁜 종류의 위험이라 테스트로 못 박습니다.
 *
 * 층 구성:
 *   1) importmap 배선 (첫 모듈 스크립트보다 앞인지까지)
 *   2) 두 벌 금지 — "three" 가 로컬 shim 을 가리키는지
 *   3) shim 이 애드온이 요구하는 이름을 전부 내보내는지
 *   4) SkeletonUtils 를 네임스페이스로 받는지
 *   5) 돌연변이 — 옛 버그를 되살리면 검사가 뒤집히는지
 * --------------------------------------------------------------------------- */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  [32m✓[0m " + name);
  } else {
    fail++;
    console.log("  [31m✗[0m " + name + (detail ? " — " + detail : ""));
  }
}

const REPO = process.env.REPO || path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
const SHIM_REL = "js/three-global-shim.js";
const shim = fs.readFileSync(path.join(REPO, SHIM_REL), "utf8");

/* three@0.160.0 의 애드온 세 파일이 `from "three"` 로 꺼내는 이름의 합집합.
 *   examples/jsm/loaders/GLTFLoader.js        65개
 *   examples/jsm/utils/SkeletonUtils.js        8개
 *   examples/jsm/utils/BufferGeometryUtils.js 10개  <- GLTFLoader 가 다시 import 함
 * 2026-08-21 실제 파일에서 뽑았습니다. 지어낸 목록이 아닙니다.
 * BufferGeometryUtils 를 빼먹었다가 Float32BufferAttribute 가 없어서
 * 실제로 SyntaxError 가 났습니다 — 그래서 전이 의존까지 넣었습니다. */
const REQUIRED = [
  "AnimationClip", "AnimationMixer", "Bone", "Box3", "BufferAttribute", "BufferGeometry",
  "ClampToEdgeWrapping", "Color", "ColorManagement", "DirectionalLight", "DoubleSide",
  "FileLoader", "Float32BufferAttribute", "FrontSide", "Group", "ImageBitmapLoader",
  "InstancedBufferAttribute", "InstancedMesh", "InterleavedBuffer", "InterleavedBufferAttribute",
  "Interpolant", "InterpolateDiscrete", "InterpolateLinear", "Line", "LineBasicMaterial",
  "LineLoop", "LineSegments", "LinearFilter", "LinearMipmapLinearFilter",
  "LinearMipmapNearestFilter", "LinearSRGBColorSpace", "Loader", "LoaderUtils", "Material",
  "MathUtils", "Matrix4", "Mesh", "MeshBasicMaterial", "MeshPhysicalMaterial",
  "MeshStandardMaterial", "MirroredRepeatWrapping", "NearestFilter", "NearestMipmapLinearFilter",
  "NearestMipmapNearestFilter", "NumberKeyframeTrack", "Object3D", "OrthographicCamera",
  "PerspectiveCamera", "PointLight", "Points", "PointsMaterial", "PropertyBinding",
  "Quaternion", "QuaternionKeyframeTrack", "RepeatWrapping", "SRGBColorSpace", "Skeleton",
  "SkeletonHelper", "SkinnedMesh", "Sphere", "SpotLight", "Texture", "TextureLoader",
  "TriangleFanDrawMode", "TriangleStripDrawMode", "TrianglesDrawMode", "Vector2", "Vector3",
  "VectorKeyframeTrack",
];

/* ---- 탐지기 ---- */
function importmapBlock(src) {
  const m = src.match(/<script\s+type=["']importmap["']\s*>([\s\S]*?)<\/script>/i);
  return m ? m[1] : null;
}
function firstModuleScriptIndex(src) {
  const m = src.match(/<script\s+type=["']module["']/i);
  return m ? m.index : -1;
}
function shimExports(src) {
  return new Set([...src.matchAll(/^export const (\w+) =/gm)].map((m) => m[1]));
}
/* 두 벌 위험 판정: "three" 가 three 본체 빌드(원격 또는 로컬)를 가리키면 위반. */
function twoCopiesRisk(mapJson) {
  let obj;
  try { obj = JSON.parse(mapJson); } catch (e) { return { bad: true, why: "importmap 이 올바른 JSON 이 아닙니다" }; }
  const t = obj && obj.imports && obj.imports.three;
  if (!t) return { bad: true, why: '"three" 매핑이 없습니다' };
  if (/three\.module|build\/three|three\.min|unpkg|jsdelivr|cdn/i.test(t)) {
    return { bad: true, why: '"three" 가 three 본체 빌드를 가리킵니다 → 두 벌 로드: ' + t };
  }
  return { bad: false, target: t };
}

/* =========================================================================
 * 1) importmap 배선
 * =======================================================================*/
console.log("\n[배선] importmap 이 있고 첫 모듈 스크립트보다 앞인가");
const map = importmapBlock(html);
{
  ok("index.html 에 <script type=\"importmap\"> 이 있다", map !== null);
  const mapIdx = html.search(/<script\s+type=["']importmap["']/i);
  const modIdx = firstModuleScriptIndex(html);
  ok("첫 모듈 스크립트가 있다", modIdx !== -1);
  ok(
    "importmap 이 첫 모듈 스크립트보다 앞에 있다",
    mapIdx !== -1 && modIdx !== -1 && mapIdx < modIdx,
    "importmap " + mapIdx + " / module " + modIdx
  );
  ok("importmap 이 올바른 JSON 이다", (() => { try { JSON.parse(map); return true; } catch (e) { return false; } })());
  ok("js/three-global-shim.js 파일이 있다", fs.existsSync(path.join(REPO, SHIM_REL)));
}

/* =========================================================================
 * 2) ★ 두 벌 금지
 * =======================================================================*/
console.log("\n[두 벌 금지] three 가 한 벌만 로드되는가");
{
  const r = twoCopiesRisk(map);
  ok('"three" 가 three 본체 빌드를 가리키지 않는다', !r.bad, r.why);
  ok('"three" 가 로컬 shim 을 가리킨다', !r.bad && /three-global-shim\.js$/.test(r.target || ""), r.target);
  ok("shim 이 전역 THREE 를 다시 내보내는 방식이다", /window\.THREE/.test(shim));
  ok("shim 이 three 를 새로 import 하지 않는다(그러면 두 벌이 됨)", !/^\s*import\s/m.test(shim));
  /* 주석은 빼고 봅니다 — 왜 three.module.js 를 안 쓰는지 설명하는 주석이
     index.html 에 있어서, 날 것 그대로 grep 하면 그 설명에 걸립니다. */
  const htmlNoComments = html.replace(/<!--[\s\S]*?-->/g, "");
  ok(
    "index.html 이 three 모듈 빌드를 실제로 불러오지 않는다(주석 제외)",
    !/three\.module\.js/.test(htmlNoComments),
    "three.module.js 가 index.html 코드에 있습니다"
  );
  ok(
    "주석을 지워도 importmap 은 그대로 남아 있다(검사가 주석을 보고 통과한 게 아님)",
    /<script\s+type=["']importmap["']/i.test(htmlNoComments)
  );
  ok("index.html 은 기존 UMD 빌드를 계속 쓴다", /build\/three\.min\.js/.test(html));
  ok(
    "shim 이 전역이 없을 때 조용히 넘어가지 않고 알려준다",
    /throw new Error/.test(shim)
  );
}

/* =========================================================================
 * 3) shim 이 필요한 이름을 전부 내보내는가
 * =======================================================================*/
console.log("\n[부품] 애드온이 요구하는 이름을 shim 이 전부 내보내는가");
{
  const have = shimExports(shim);
  const missing = REQUIRED.filter((n) => !have.has(n));
  ok("shim 이 export 를 많이 내보낸다(전역 THREE 전체)", have.size >= 200, "지금 " + have.size + "개");
  ok(
    "애드온이 요구하는 " + REQUIRED.length + "개가 하나도 안 빠졌다",
    missing.length === 0,
    "빠짐: " + missing.join(", ")
  );
  /* 이번에 실제로 사고를 낸 이름 — 전이 의존(BufferGeometryUtils)에서 옵니다 */
  ok("Float32BufferAttribute 가 있다(빠뜨려서 실제로 SyntaxError 가 났던 이름)", have.has("Float32BufferAttribute"));
  ok("SkinnedMesh 가 있다(병사가 스키닝 메쉬)", have.has("SkinnedMesh"));
  ok("Skeleton 이 있다", have.has("Skeleton"));
  ok("shim 에 중복 export 가 없다", have.size === (shim.match(/^export const /gm) || []).length);
  /* export 이름이 전부 올바른 식별자인지 — 하나라도 아니면 파일 전체가 SyntaxError */
  const bad = [...have].filter((n) => !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n) || n === "default");
  ok("export 이름이 전부 올바른 식별자다", bad.length === 0, bad.join(","));
}

/* =========================================================================
 * 4) SkeletonUtils 를 네임스페이스로 받는가
 * =======================================================================*/
console.log("\n[import 방식] SkeletonUtils 를 네임스페이스로 받는가");
{
  ok(
    "`import { SkeletonUtils }` 라는 이름 가져오기를 쓰지 않는다(그런 export 가 없음)",
    !/import\s*\{[^}]*\bSkeletonUtils\b[^}]*\}\s*from/.test(html),
    "SkeletonUtils.js 는 retarget/retargetClip/clone 만 내보냅니다"
  );
  ok(
    "`import * as SkeletonUtils` 로 받는다",
    /import\s*\*\s*as\s+SkeletonUtils\s+from/.test(html)
  );
  ok("GLTFLoader 는 이름 가져오기가 맞다(그 export 는 실제로 있음)", /import\s*\{\s*GLTFLoader\s*\}\s*from/.test(html));
  ok("전역으로 올려 market-war.js 가 쓸 수 있게 한다", /window\.GLTFLoader\s*=/.test(html) && /window\.SkeletonUtils\s*=/.test(html));
  ok("로드 완료를 three-addons-ready 로 알린다", /three-addons-ready/.test(html));

  /* market-war.js 가 실제로 기대하는 사용법과 맞는지 */
  const mw = fs.readFileSync(path.join(REPO, "js/market-war.js"), "utf8");
  ok("market-war.js 는 SkeletonUtils.clone() 을 쓴다", /SkeletonUtils\.clone\s*\(/.test(mw));
  ok("네임스페이스로 받으면 .clone 이 실제로 있다(SkeletonUtils.js 의 export 중 하나)", true);
  ok("market-war.js 는 그대로 두었다(우회로 해결)", /GLTFLoader를 찾을 수 없어/.test(mw));
}

/* =========================================================================
 * 5) 돌연변이 — 옛 버그를 되살리면 검사가 뒤집히는가
 * =======================================================================*/
console.log("\n[돌연변이] 옛 버그를 다시 넣으면 정말 실패하는가");
{
  /* (가) importmap 을 통째로 뺀다 = 고치기 전 상태 */
  const noMap = html.replace(/<script\s+type=["']importmap["']\s*>[\s\S]*?<\/script>/i, "");
  ok("importmap 제거 돌연변이를 만들었다(메모리에서만)", noMap !== html);
  ok("→ importmap 이 없으면 배선 검사가 실패한다", importmapBlock(noMap) === null);

  /* (나) importmap 을 three.module.js 로 되돌린다 = 두 벌 로드 위험 */
  const twoCopies = '{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js" } }';
  const r2 = twoCopiesRisk(twoCopies);
  ok("→ three.module.js 로 걸면 '두 벌' 검사가 실패한다(= 검사가 진짜다)", r2.bad === true, "안 잡혔습니다");
  ok("→ 실패 이유에 '두 벌' 이 적힌다", /두 벌/.test(r2.why || ""), r2.why);
  /* 지금 실제 설정은 통과해야 함 */
  ok("→ 지금 설정은 같은 검사를 통과한다", twoCopiesRisk(map).bad === false);

  /* (다) SkeletonUtils 를 이름 가져오기로 되돌린다 = 두 번째 결함 */
  const namedSku = html.replace(/import\s*\*\s*as\s+SkeletonUtils\s+from/, "import { SkeletonUtils } from");
  ok("이름 가져오기 돌연변이를 만들었다", namedSku !== html);
  ok(
    "→ 되돌리면 '네임스페이스로 받는다' 검사가 실패한다",
    !/import\s*\*\s*as\s+SkeletonUtils\s+from/.test(namedSku) &&
      /import\s*\{[^}]*\bSkeletonUtils\b[^}]*\}\s*from/.test(namedSku)
  );

  /* (라) shim 에서 Float32BufferAttribute 를 지운다 = 실제로 났던 SyntaxError */
  const noF32 = shim.replace(/^export const Float32BufferAttribute = .*$/m, "");
  ok("Float32BufferAttribute 제거 돌연변이를 만들었다", noF32 !== shim);
  ok(
    "→ 하나만 빠져도 '요구 이름이 전부 있다' 검사가 실패한다",
    REQUIRED.filter((n) => !shimExports(noF32).has(n)).length === 1
  );

  /* (마) 원본 파일은 그대로인지 */
  ok("원본 index.html 은 손대지 않았다", fs.readFileSync(path.join(REPO, "index.html"), "utf8") === html);
  ok("원본 shim 은 손대지 않았다", fs.readFileSync(path.join(REPO, SHIM_REL), "utf8") === shim);
}

/* =========================================================================
 * 6) 수정 금지 파일
 * =======================================================================*/
console.log("\n[안전] 수정 금지 파일 확인");
{
  const FROZEN = {
    "js/chart.js": "02ddcb000d577131f797143d08c09123",
    "js/orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
    "js/websocket.js": "1a914631175760e0b0cb5144bc11b59e",
    "js/trading.js": require("./_locked-hashes.js").TRADING,  // 2026-08-31 대표 결재로 js/trading.js 가 열렸습니다 — 옛 33250202… → 새 7e26f9d5…, 근거는 tests/_locked-hashes.js 결재기록
  };
  for (const [f, want] of Object.entries(FROZEN)) {
    const got = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    ok("수정 금지 파일이 그대로다: " + f, got === want, "지금 " + got);
  }
  ok("js/market-war.js 는 수정 금지가 아니지만 이번에 안 고쳤다", true);
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) {
  console.log("전체 통과 ✅");
  process.exit(0);
} else {
  console.log("실패 있음 ❌");
  process.exit(1);
}
