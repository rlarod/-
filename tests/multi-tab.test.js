/* tests/multi-tab.test.js
 * 창을 두 개 열었을 때 한쪽 거래 기록이 사라지는 문제를 검증합니다.
 *
 * 발견했던 문제
 *   거래 데이터는 localStorage 에 저장되는데, 각 창은 자기 메모리 값으로
 *   통째로 덮어씁니다. 다른 창이 먼저 저장한 것을 모릅니다.
 *     창A, 창B 둘 다 100,000 으로 시작
 *     창A 거래 -> 100,156.58 저장
 *     창B 거래 -> 99,990 저장 (창A 것을 덮어씀)
 *     새로고침 -> 99,990. 창A 의 수익 156.58 이 사라짐
 */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
let pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log("  \u001b[32m✓\u001b[0m " + name); }
  else { fail++; console.log("  \u001b[31m✗\u001b[0m " + name + (detail ? " — " + detail : "")); }
}

/* 브라우저 환경을 흉내내 실제 모듈을 돌립니다. */
function boot(snapshot) {
  const state = { reloaded: false, listeners: {}, appended: [] };
  const sandbox = {
    console: { warn() {}, log() {} },
    document: {
      readyState: "complete",
      addEventListener() {},
      getElementById: (id) => state.appended.filter((n) => n.id === id)[0] || null,
      createElement: () => ({
        id: "", className: "", innerHTML: "",
        addEventListener() {}, remove() {},
      }),
      body: { appendChild(n) { state.appended.push(n); } },
    },
    location: { reload() { state.reloaded = true; } },
  };
  sandbox.window = sandbox;
  sandbox.addEventListener = function (name, fn) { state.listeners[name] = fn; };
  sandbox.App = {
    Trading: { getSnapshot: () => snapshot },
    Bus: { on() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(REPO, "js", "multi-tab-guard.js"), "utf8"), sandbox);
  sandbox.App.MultiTabGuard.init();
  return { G: sandbox.App.MultiTabGuard, state, sandbox };
}

console.log("\n창 두 개 동시 사용");

/* ---------- 작업 중이 아니면 조용히 따라간다 ---------- */
{
  const { state } = boot({ position: null, pendingOrder: null });
  state.listeners.storage({ key: "btcsim:trading" });
  ok("작업 중이 아니면 새로고침해 최신을 따라간다", state.reloaded);
  ok("안내 띠는 띄우지 않는다", state.appended.length === 0);
}

/* ---------- 포지션이 있으면 함부로 새로고침하지 않는다 ---------- */
{
  const { state } = boot({ position: { side: "long" }, pendingOrder: null });
  state.listeners.storage({ key: "btcsim:trading" });
  ok("포지션 보유 중엔 새로고침하지 않는다", !state.reloaded);
  ok("대신 안내 띠를 띄운다", state.appended.length === 1);
  ok("띠에 덮어쓰기 경고가 있다", /덮어쓸 수 있습니다/.test(state.appended[0].innerHTML));
  ok("최신 내용을 불러올 방법을 준다", /최신 내용 불러오기/.test(state.appended[0].innerHTML));
}

/* ---------- 미체결 주문이 있어도 지킨다 ---------- */
{
  const { state } = boot({ position: null, pendingOrder: { side: "long" } });
  state.listeners.storage({ key: "btcsim:trading" });
  ok("미체결 주문이 있어도 새로고침하지 않는다", !state.reloaded);
  ok("안내 띠를 띄운다", state.appended.length === 1);
}

/* ---------- 관계없는 키는 무시 ---------- */
{
  const { state } = boot({ position: null, pendingOrder: null });
  state.listeners.storage({ key: "theme" });
  ok("테마 변경에는 반응하지 않는다", !state.reloaded && state.appended.length === 0);
  state.listeners.storage({ key: null });
  ok("키가 없으면 무시한다", !state.reloaded);
}

/* ---------- 판단이 안 되면 안전하게 ---------- */
{
  const { G, state } = boot(null);
  /* getSnapshot 이 null 을 주면 상태를 알 수 없습니다. */
  ok("상태를 모르면 '작업 중'으로 본다", G.iAmBusy());
  state.listeners.storage({ key: "btcsim:trading" });
  ok("모를 때는 새로고침하지 않는다", !state.reloaded);
}

/* ---------- 안전·연결 ---------- */
{
  const src = fs.readFileSync(path.join(REPO, "js", "multi-tab-guard.js"), "utf8");
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
  const trading = fs.readFileSync(path.join(REPO, "js", "trading.js"), "utf8");

  ok("스크립트가 연결됐다", /js\/multi-tab-guard\.js/.test(html));
  ok("저장을 막지는 않는다(거래는 계속 가능)", !/localStorage\.setItem|Storage\.save/.test(src));
  ok("다른 탭의 변경만 듣는다", /addEventListener\("storage"/.test(src));
  ok("trading.js 는 건드리지 않았다", !/MultiTabGuard/.test(trading));
  ok("띠 모서리 3px(사이트 규칙)", /\.multi-tab-banner \.mtb-btn\{[\s\S]*?border-radius:3px/.test(css));
  ok("모바일에서도 안 깨진다", /@media \(max-width:520px\)\{[\s\S]{0,200}\.multi-tab-banner/.test(css));
}

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail === 0) console.log("전체 통과 ✅");
else { console.log("실패 있음 ❌"); process.exit(1); }
