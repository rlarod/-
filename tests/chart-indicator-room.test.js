/* ===========================================================================
 * tests/chart-indicator-room.test.js
 *   — 아래 칸 지표를 「값이 사라질 만큼」 켤 수 없게 막는 것을 지킵니다
 *
 * 2026-09-04 수리팀 (P2 · 폰에서 지표 값이 사라지는 것)
 *
 * ── 무슨 일이 있었나 ──────────────────────────────────────────────────
 * 아래 칸(별도 칸) 지표를 여러 개 켜면 칸이 얇아져 ★값 배지가 잘려 사라졌습니다★.
 * 오류도 없고 선은 그대로 그려집니다 — 회원은 고장인 줄 모릅니다(조용한 고장).
 *
 * 브라우저 실측 (2026-09-04, MACD 16개를 켠 상태 · 배지 세 개의 세로 길이)
 *     800x360 (폰 눕힘)   칸 24px → 12 / 13 / ★0px★   값 사라진 칸 16개
 *    1024x768 (좁은 창)   칸 25px → 11 / 14 / ★0px★   값 사라진 칸 16개
 *   고친 뒤
 *     800x360             칸 114px → 31 / 31 / 28      값 사라진 칸 ★0개★
 *    1024x768             칸  95px → 29 / 31 / 19      값 사라진 칸 ★0개★
 *
 * ── 이 파일이 못 박는 것 ──────────────────────────────────────────────
 *   ① 자리 계산의 숫자(계수·여유폭)가 ★js/chart-indicator-room.js 한 곳★ 에만 있다
 *   ② 배지 높이 실측표가 문서에 남아 있다 (다음 사람이 다시 재지 않게)
 *   ③ 칸 높이 식이 실측값과 맞다 (1440 실측: 칸 0개 962 · 1개 233 · 6개 105)
 *   ④ 「폭」 이 아니라 「칸 높이」 로 잰다 — 폰 눕힘(17px)이 폰 세로(47px)보다 나쁨
 *   ⑤ 주 차트 지표(MA·EMA·BB…)는 ★절대 안 막는다★
 *   ⑥ 모르면 안 막는다 (그림영역·글씨 크기를 못 재면 통과)
 *   ⑦ 틀이 회원 설정을 ★안 지운다★ — 쉬게 할 때 setOn(false)·saveState 를 안 부른다
 *   ⑧ 눌러도 아무 일이 안 나는 길이 없다 (창은 반환값을 보고 이유를 적는다)
 *   ⑨ 알림줄이 하단 매수·매도 바를 보고 비킨다 · 글씨 17px
 *
 * ── 이 파일은 무엇을 하나 ─────────────────────────────────────────────
 * 파일을 읽고, 자리 계산 부분만 ★원본에서 글자 그대로 떼어★ vm 에서 돌립니다.
 * 계산을 여기 베껴 쓰지 않습니다 — 베껴 쓰면 원본이 바뀌어도 옛 식만 지킵니다.
 * 네트워크도 브라우저도 안 씁니다.
 * ======================================================================== */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const REPO = process.env.REPO || path.join(__dirname, "..");
const ROOM = path.join(REPO, "js", "chart-indicator-room.js");
const KIT = path.join(REPO, "js", "chart-indicator-kit.js");
const PICKER = path.join(REPO, "js", "chart-indicator-picker.js");
const ORDER = path.join(__dirname, "_order.txt");

const ROOM_SRC = fs.readFileSync(ROOM, "utf8");
const KIT_SRC = fs.readFileSync(KIT, "utf8");
const PICKER_SRC = fs.readFileSync(PICKER, "utf8");

let pass = 0;
let fail = 0;
function ok(제목, 조건, 도움말) {
  if (조건) {
    pass++;
    console.log("  [32m✓[0m " + 제목);
  } else {
    fail++;
    console.log("  [31m✗[0m " + 제목 + (도움말 ? "\n      -> " + 도움말 : ""));
  }
}
function 절(t) {
  console.log("\n" + t);
}

console.log("\n아래 칸 지표 자리 — 값이 사라질 만큼 켜지지 않는가");

/* 주석을 뺀 코드만 (주석에 적힌 예시를 코드로 세지 않게) */
function 코드만(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/* =========================================================================
 * [1] 숫자는 한 곳에만
 * ========================================================================= */
절("[1] 자리 계산의 숫자가 한 곳에만 있다");

const ROOM_CODE = 코드만(ROOM_SRC);
const KIT_CODE = 코드만(KIT_SRC);
const PICKER_CODE = 코드만(PICKER_SRC);

const K = /var\s+BADGE_K\s*=\s*([\d.]+)\s*;/.exec(ROOM_CODE);
const PAD = /var\s+BADGE_PAD\s*=\s*(\d+)\s*;/.exec(ROOM_CODE);
ok("BADGE_K(배지 높이 ÷ 축 글씨)가 room 파일에 있다", !!K, "못 찾았습니다");
ok("BADGE_PAD(여유폭)가 room 파일에 있다", !!PAD, "못 찾았습니다");
ok("BADGE_K 가 실측 범위(1.42~1.55) 안이다 — " + (K ? K[1] : "?"),
  !!K && Number(K[1]) >= 1.42 && Number(K[1]) <= 1.55,
  "실측: 축 글씨 8~26px 에서 배지 높이 ÷ 글씨 = 1.375 ~ 1.545. " +
  "1.42 아래로 내리면 배지가 통째로 사라지고, 1.55 위로 올리면 " +
  "800x360 에서 지표를 ★한 개도★ 못 켭니다(칸 114px < 필요 116px)");

ok("★틀(kit)에는 배지 계수가 없다★",
  !/BADGE_K|1\.45\s*\*|배지 한 개 높이 =/.test(KIT_CODE),
  "숫자가 두 벌이 되면 한쪽만 고쳐도 아무도 모릅니다");
ok("★창(picker)에는 배지 계수도 칸 높이 식도 없다★",
  !/BADGE_K/.test(PICKER_CODE) && !/PANE_RATIO|0\.32/.test(PICKER_CODE),
  "창은 틀에게 물어보기만 해야 합니다 (hasRoomFor)");
ok("창은 틀의 hasRoomFor 로 물어본다", /hasRoomFor/.test(PICKER_CODE));

/* =========================================================================
 * [2] 실측표가 문서에 남아 있다
 * ========================================================================= */
절("[2] 다음 사람이 다시 재지 않게 실측표가 적혀 있다");

ok("배지 높이 실측표(축 글씨 → 배지 높이)가 머리말에 있다",
  /축글씨[\s\S]{0,80}배지/.test(ROOM_SRC) && /\b31\b/.test(ROOM_SRC) && /\b17\b/.test(ROOM_SRC),
  "표가 없으면 다음 사람이 계수를 손대며 다시 재야 합니다");
ok("칸 높이 실측(1440 에서 962 · 233 · 105)이 머리말에 있다",
  /962/.test(ROOM_SRC) && /233/.test(ROOM_SRC),
  "칸 높이 식을 뒷받침하는 숫자가 없습니다");
ok("되돌리는 방법이 이 파일 머리말에 있다",
  /되돌리기/.test(ROOM_SRC) && /script 한 줄을 지우면/.test(ROOM_SRC));
ok("index.html 이 이 파일을 부른다",
  /chart-indicator-room\.js/.test(fs.readFileSync(path.join(REPO, "index.html"), "utf8")));

/* =========================================================================
 * [3] 계산 — ★원본에서 떼어★ 돌립니다
 * ========================================================================= */
절("[3] 칸 높이 · 필요 높이 계산 (원본 함수를 그대로 떼어 실행)");

function 함수떼기(name, src) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) return null;
  let k = src.indexOf("{", i);
  if (k < 0) return null;
  let depth = 0;
  for (; k < src.length; k++) {
    const c = src[k];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        k++;
        break;
      }
    }
  }
  return src.slice(i, k);
}

/** room 의 순수 계산부만 떼어 sandbox 를 만듭니다 */
function 계산판(글씨) {
  const sb = {
    App: {
      ChartFont: {
        getFontSize: function () {
          return 글씨;
        }
      }
    },
    console: { warn() {}, log() {} }
  };
  vm.createContext(sb);
  const 조각 = ["axisFont", "needFor", "paneHeightFor", "usable", "maxValues", "plan", "check", "reason"]
    .map((n) => 함수떼기(n, ROOM_SRC));
  const 없는것 = 조각.map((c, i) => (c ? null : i)).filter((x) => x !== null);
  if (없는것.length) return { 오류: "못 떼어낸 함수가 있습니다" };
  const 머리 =
    "var BADGE_K=" + K[1] + ";var BADGE_PAD=" + PAD[1] + ";" +
    "var MIN_AREA=" + (/var\s+MIN_AREA\s*=\s*(\d+)/.exec(ROOM_CODE) || [0, "120"])[1] + ";" +
    "var enabled=true;function isFn(f){return typeof f==='function';}\n";
  vm.runInContext(머리 + 조각.join("\n"), sb, { filename: "떼어낸-room" });
  return sb;
}

{
  const s = 계산판(21);
  ok("떼어내기 성공", !s.오류, s.오류);

  /* 1440x900 브라우저 실측 — 그림영역 962 · 아래 칸 비율 0.32
     칸 0개 962 / 1개 728+233 / 2개 585+187+188 / 6개 327+105x5+104 */
  const geo = { drawArea: 962, ratio: 0.32 };
  const h = (m) => Math.round(s.paneHeightFor(m, geo));
  ok("칸 1개 = 233px (실측과 같다)", h(1) === 233, "지금 " + h(1));
  ok("칸 2개 = 187px (실측 187·188)", h(2) === 187 || h(2) === 188, "지금 " + h(2));
  ok("칸 6개 = 105px (실측 105)", h(6) === 105, "지금 " + h(6));
  ok("칸이 늘수록 한 칸이 줄어든다", h(1) > h(2) && h(2) > h(6));

  /* 필요 높이 — 축 글씨 21px 에서 값 3개 실측 89px, 배지 한 개 31px */
  ok("값 3개 필요 높이가 실측 89px 이상이다 (" + s.needFor(3, 21) + ")",
    s.needFor(3, 21) >= 89, "89px 보다 작으면 배지가 통째로 잘립니다");
  ok("값 1개 필요 높이가 실측 배지 높이 31px 이상이다 (" + s.needFor(1, 21) + ")",
    s.needFor(1, 21) >= 31);
  ok("값 3개 필요 높이가 값 1개의 3배 안팎이다",
    s.needFor(3, 21) <= s.needFor(1, 21) * 3 + 4);
  ok("★축 글씨가 작아지면 필요 높이도 작아진다★ (폰에서 글씨가 11px 로 줄어듭니다)",
    s.needFor(3, 11) < s.needFor(3, 21),
    "폭이 아니라 글씨 크기를 따라가야 합니다 — chart-axis-fit.js 가 폰에서 11px 로 줄입니다");
  ok("축 글씨 11px · 값 3개 = 실측 47px 이상 (" + s.needFor(3, 11) + ")",
    s.needFor(3, 11) >= 47);
}

/* =========================================================================
 * [4] ★폭이 아니라 칸 높이★ — 제일 나쁜 두 경우를 통과시키지 않는다
 * ========================================================================= */
절("[4] 폭으로 재지 않는다 (폰 눕힘 · 좁은 노트북 창이 폰 세로보다 나쁩니다)");
{
  const s = 계산판(21);
  const s폰 = 계산판(11);
  /* 브라우저 실측 그림영역 — 360x800:530(글씨11) · 800x360:472(21) · 1024x768:488(21) */
  const 폰세로 = { drawArea: 530, ratio: 0.32 };
  const 폰눕힘 = { drawArea: 472, ratio: 0.32 };
  const 좁은창 = { drawArea: 488, ratio: 0.32 };

  function 최대(sb, geo, 값수, 글씨) {
    let m = 0;
    for (let i = 1; i <= 40; i++) {
      if (sb.paneHeightFor(i, geo) >= sb.needFor(값수, 글씨)) m = i;
      else break;
    }
    return m;
  }
  const a = 최대(s폰, 폰세로, 3, 11);
  const b = 최대(s, 폰눕힘, 3, 21);
  const c = 최대(s, 좁은창, 3, 21);
  console.log("      값 3개짜리를 몇 개까지 — 폰세로 " + a + " · 폰눕힘 " + b + " · 좁은창 " + c);
  ok("폰 눕힘(800x360)이 폰 세로(360x800)보다 ★적게★ 허용된다",
    b < a, "폭으로 막으면 800 은 「폰이 아니다」 로 그냥 통과합니다");
  ok("좁은 노트북 창(1024x768)도 폰 세로보다 적게 허용된다", c < a);
  ok("어느 경우에도 ★적어도 한 개는★ 켤 수 있다 (폰눕힘 " + b + " · 좁은창 " + c + ")",
    b >= 1 && c >= 1,
    "0 이 되면 회원이 MACD 를 아예 못 켭니다 — 잘린 배지보다 나쁩니다");
}

/* =========================================================================
 * [5] 모르면 안 막는다
 * ========================================================================= */
절("[5] 모르면 안 막는다");
{
  const s = 계산판(21);
  const 없음 = s.check([], 3, null, "MACD");
  ok("그림영역을 모르면 통과시킨다", 없음.ok === true, JSON.stringify(없음));
  const 너무작음 = s.check([], 3, { drawArea: 30, ratio: 0.32 }, "MACD");
  ok("그림영역이 아직 안 잡혔으면(120px 미만) 통과시킨다", 너무작음.ok === true);

  const 글씨없음 = 계산판(0);
  ok("축 글씨를 못 읽으면 통과시킨다",
    글씨없음.check([], 3, { drawArea: 962, ratio: 0.32 }, "MACD").ok === true,
    "그럴듯한 글씨 크기를 지어내면 안 됩니다");
  ok("★글씨를 못 읽을 때 그럴듯한 숫자를 지어내지 않는다★ (axisFont 가 0)",
    글씨없음.axisFont() === 0, "지금 " + 글씨없음.axisFont());
}

/* =========================================================================
 * [6] plan — 앞에 있는 것이 자리를 지킨다
 * ========================================================================= */
절("[6] 자리가 모자라면 ★나중 것★ 이 쉰다");
{
  const s = 계산판(21);
  const geo = { drawArea: 488, ratio: 0.32 }; /* 1024x768 실측 */
  const items = [];
  for (let i = 1; i <= 6; i++) items.push({ id: "macd-" + i, values: 3, name: "MACD" });
  const p = s.plan(items, geo);
  console.log("      보임 " + p.show.length + "개 · 쉼 " + p.rest.length + "개");
  ok("여섯 개를 다 켜면 일부가 쉰다", p.rest.length > 0);
  ok("보이는 것 + 쉬는 것 = 여섯", p.show.length + p.rest.length === 6);
  ok("★앞에 있는 것이 남는다★ (나중에 켠 것이 밀립니다)",
    p.show[0] === "macd-1" && p.rest[p.rest.length - 1].id === "macd-6");
  ok("쉬는 것마다 「몇 px 이 있고 몇 px 이 필요한지」 를 들고 있다",
    p.rest.every((r) => r.have > 0 && r.need > 0));

  /* 값이 하나뿐인 지표는 값 세 개짜리보다 많이 들어간다 */
  const 하나 = [];
  for (let i = 1; i <= 6; i++) 하나.push({ id: "rsi-" + i, values: 1, name: "RSI" });
  ok("값 1개짜리는 여섯 개가 다 들어간다", s.plan(하나, geo).rest.length === 0);
}

/* =========================================================================
 * [7] 틀 — 주 차트 지표는 안 막고, 회원 설정을 안 지운다
 * ========================================================================= */
절("[7] 틀(kit) 이 지키는 것");

const canTurnOn본문 = 함수떼기("canTurnOn", KIT_SRC) || "";
const hasRoomFor본문 = 함수떼기("hasRoomFor", KIT_SRC) || "";
const applyRoom본문 = 함수떼기("applyRoom", KIT_SRC) || "";
const reseed본문 = 함수떼기("reseedAll", KIT_SRC) || "";
const setOn본문 = 함수떼기("setOn", KIT_SRC) || "";

ok("canTurnOn 이 있다", !!canTurnOn본문);
ok("hasRoomFor 가 있다", !!hasRoomFor본문);
ok("★주 차트 지표(pane !== sub)는 무조건 통과★ — canTurnOn",
  /it\.pane\s*!==\s*"sub"[\s\S]{0,60}ok:\s*true/.test(canTurnOn본문),
  "MA 6줄 · 볼린저 같은 것은 아래 칸을 안 만들어 영향이 0 입니다");
ok("★주 차트 지표는 무조건 통과★ — hasRoomFor",
  /d\.pane\s*!==\s*"sub"[\s\S]{0,60}ok:\s*true/.test(hasRoomFor본문));

ok("★applyRoom 이 setOn(id,false) 를 안 부른다★",
  !/setOn\s*\([^)]*false/.test(applyRoom본문),
  "setOn 은 saveState() 를 불러 ★회원 설정을 덮어씁니다★ — 쉬게 할 때는 turnOff 만");
ok("★applyRoom 이 saveState 를 안 부른다★",
  !/saveState/.test(applyRoom본문));
ok("applyRoom 이 turnOff / turnOn 으로만 화면을 바꾼다",
  /turnOff\(/.test(applyRoom본문) && /turnOn\(/.test(applyRoom본문));
ok("★쉬는 것도 it.on 은 true 그대로★ (창을 넓히면 저절로 돌아옵니다)",
  /it\.rest\s*=/.test(applyRoom본문) && !/it\.on\s*=\s*false/.test(applyRoom본문));

ok("★reseedAll 이 초과분을 건너뛴다★ (저장소 복원 · 이관 경로)",
  /restPlan\(\)/.test(reseed본문) && /continue/.test(reseed본문));
ok("reseedAll 도 setOn 을 안 부른다", !/setOn\s*\(/.test(reseed본문));

ok("setOn 이 켜기 전에 자리를 본다", /canTurnOn\(/.test(setOn본문));
ok("★막았으면 이유를 보여준다★ (조용히 안 되는 길이 없다)",
  /R\.say\(/.test(setOn본문) || /say\(room\.msg\)/.test(setOn본문),
  "눌러도 아무 일이 안 나면 회원은 고장인 줄 압니다");
ok("setOn 이 막았을 때 false 를 돌려준다", /return\s+false/.test(setOn본문));

ok("★창 크기가 바뀌면 다시 잰다★ (폰 눕힘 · 창 줄임)",
  /addEventListener\("resize",\s*scheduleRoom\)/.test(KIT_CODE) &&
  /addEventListener\("orientationchange",\s*scheduleRoom\)/.test(KIT_CODE),
  "한 번만 재면 폰을 눕히는 순간 다시 값이 사라집니다");

ok("★칩에 「쉬는 중」 표시가 붙는다★ (켜짐인데 선이 없는 상태를 알립니다)",
  /tl-kit-rest/.test(KIT_CODE) && /쉼/.test(KIT_SRC));
ok("★안 쉴 때는 흔적을 아예 안 남긴다★ (data-kit-rest 를 쓰지 않는다)",
  !/data-kit-rest/.test(KIT_CODE),
  "2026-09-04 게이트 2 반려 — 지우는 대신 0 을 넣었더니 쉬지도 않는 칩 15개에 전부 " +
  "눌러 붙었고, PM 이 [data-kit-rest] 로 세어 ★멀쩡한 것까지 쉬는 중★ 으로 읽었습니다");
ok("★붙이는 곳과 떼는 곳이 한 줄이다★ (갈래를 나누면 한쪽만 도는 일이 생깁니다)",
  KIT_CODE.indexOf('var want = rest ? "tl-kit-btn tl-kit-rest" : "tl-kit-btn";') >= 0,
  "떼는 갈래를 따로 두면 그 갈래만 안 도는 상태가 만들어집니다 — 실제로 그랬습니다");
ok("★classList · hasAttribute · removeAttribute 를 안 쓴다★ (테스트의 가짜 DOM 에 없습니다)",
  !/kids\[i\]\.(hasAttribute|removeAttribute|classList)/.test(KIT_CODE),
  "2026-09-04 에 실제로 여기서 23개 테스트가 한꺼번에 터졌습니다");

/* =========================================================================
 * [8] 창(picker) — 반환값을 버리지 않는다
 * ========================================================================= */
절("[8] 창(picker) 이 지키는 것");

const add본문 = 함수떼기("add", PICKER_SRC) || "";
ok("add 를 찾았다", !!add본문);
ok("★createInstance 의 반환값을 확인한다★",
  /var\s+made\s*=\s*K\.createInstance/.test(add본문) || /=\s*K\.createInstance/.test(add본문),
  "2026-09-04 이전에는 버렸습니다 — 안 얹혀도 아무 일이 안 났습니다(조용한 고장)");
ok("자리 없는 줄에 aria-disabled 를 붙인다", /aria-disabled/.test(PICKER_CODE));
ok("자리 없는 줄에 「자리 없음」 이라고 적는다", /자리 없음/.test(PICKER_SRC));
ok("자리 없는 줄을 눌러도 ★이유가 창 안에 뜬다★ (틀의 알림줄은 이 창에 가립니다)",
  /noteMsg/.test(PICKER_CODE) && /tl-ipick-msg/.test(PICKER_CODE),
  "창의 z-index 가 2147483000 이라 차트 위 알림줄은 안 보입니다");

/* =========================================================================
 * [9] 알림줄 — 하단 매수·매도 바를 보고 비킨다 · 글씨는 안 줄인다
 * ========================================================================= */
절("[9] 알림줄");

ok("글씨가 17px 이다 (대표가 네 번 말씀하신 자리 — 줄이지 않습니다)",
  /var\s+TOAST_FONT\s*=\s*17\s*;/.test(ROOM_CODE),
  "17 아래로 내리면 팝업 글씨 바닥값 규칙을 깹니다");
ok("★하단 매수·매도 바를 본다★", /tl-order-bar/.test(ROOM_CODE));
ok("전체화면일 때는 바를 안 센다 (그때는 안 그려집니다)",
  /fullscreenElement/.test(ROOM_CODE));
ok("★재기 전에 left 를 0 으로 되돌린다★ (폭이 스스로 좁아지는 병)",
  /style\.left\s*=\s*"0px"/.test(ROOM_CODE),
  "placeToast 가 15차에 같은 병을 같은 방법으로 풀었습니다");
ok("글씨를 줄이지 않고 ★줄 수로★ 푼다 (word-break:keep-all)",
  /word-break:keep-all/.test(ROOM_CODE) && !/font-size:\s*1[0-6]px/.test(ROOM_CODE));
ok("차트를 못 만지게 하지 않는다 (pointer-events:none)",
  /pointer-events:none/.test(ROOM_CODE));

/* 바닥선을 ★동작으로★ 확인합니다 — 계산을 여기 베껴 쓰지 않습니다 */
{
  const EDGE = Number((/var\s+EDGE\s*=\s*(\d+)\s*;/.exec(ROOM_CODE) || [0, 8])[1]);
  const 바높이 = 73; /* 2026-09-03 · 2026-09-04 브라우저 실측 (800 높이에서 top 727) */
  function 바닥(화면) {
    const 바 = 화면.바
      ? {
          getBoundingClientRect: () => ({ top: 화면.h - 화면.바, height: 화면.바 }),
          __display: "block"
        }
      : null;
    const sb = {
      window: {
        innerHeight: 화면.h,
        getComputedStyle: (el) => ({ display: el.__display })
      },
      document: {
        documentElement: { clientHeight: 화면.h },
        fullscreenElement: 화면.전체화면 ? {} : null,
        webkitFullscreenElement: null,
        querySelector: (s) => (s === ".tl-order-bar" ? 바 : null)
      }
    };
    vm.createContext(sb);
    vm.runInContext(
      "var EDGE=" + EDGE + ";\n" + 함수떼기("vpH", ROOM_SRC) + "\n" + 함수떼기("floorY", ROOM_SRC),
      sb,
      { filename: "떼어낸-room-floorY" }
    );
    return sb.floorY();
  }
  const 폰 = 바닥({ h: 800, 바: 바높이 });
  const 데스크 = 바닥({ h: 900, 바: null });
  const 전체 = 바닥({ h: 800, 바: 바높이, 전체화면: true });
  ok("폰에서 바 위(" + (800 - 바높이 - EDGE) + ")에서 멈춘다", 폰 === 800 - 바높이 - EDGE, "지금 " + 폰);
  ok("바가 없는 폭에서는 화면 아래끝까지 쓴다", 데스크 === 900 - EDGE, "지금 " + 데스크);
  ok("전체화면일 때는 바를 안 센다", 전체 === 800 - EDGE, "지금 " + 전체);

  /* 돌연변이 — 바를 못 찾게 하면 반드시 바닥이 내려가야 합니다 */
  const 변이 = (function () {
    const sb = {
      window: { innerHeight: 800, getComputedStyle: () => ({ display: "block" }) },
      document: {
        documentElement: { clientHeight: 800 },
        fullscreenElement: null,
        webkitFullscreenElement: null,
        querySelector: () => null
      }
    };
    vm.createContext(sb);
    vm.runInContext(
      "var EDGE=" + EDGE + ";\n" +
        함수떼기("vpH", ROOM_SRC) + "\n" +
        함수떼기("floorY", ROOM_SRC).replace(/document\.querySelector\(\s*"\.tl-order-bar"\s*\)/g, "null"),
      sb,
      { filename: "떼어낸-room-floorY-변이" }
    );
    return sb.floorY();
  })();
  ok("★바를 못 찾게 하면 바닥이 " + 폰 + " -> " + 변이 + " 로 내려간다★ (검사가 살아 있다)",
    Number.isFinite(변이) && 변이 > 폰,
    "안 달라지면 이 검사가 아무것도 안 지키고 있습니다");
}

/* =========================================================================
 * [11] ★진짜로 돌려 봅니다★ — 좁혔다 다시 넓혔을 때 표시가 지워지는가
 *
 * 2026-09-04 게이트 2 반려로 추가했습니다.
 *
 * ── 봉인 65건이 못 잡은 것 ────────────────────────────────────────────
 * 앞의 검사는 전부 ★글자만★ 읽었습니다(원본에 이 낱말이 있는가).
 * 그래서 「붙이는 코드는 도는데 떼는 코드가 안 도는」 상태를 하나도 못 봤습니다.
 * PM 이 브라우저로 열어보고 잡았습니다 —
 *     선이 7칸 다 그려지는데 칩 15개에 「쉬는 중」 흔적이 남아 있었습니다.
 * ★조용한 고장의 반대★ 입니다. 멀쩡한 것을 고장났다고 말합니다.
 *
 * ── 그래서 여기서는 틀을 ★가짜 화면 위에서 실제로 돌립니다★ ───────────
 *   넓음(그림영역 962) -> 좁음(488) -> 다시 넓음(962)
 * 세 번 다 「그려진 칸 수 + 쉼 표시 수 == 켜진 수」 인지 봅니다.
 * 한쪽만 돌면 이 식이 반드시 깨집니다.
 * ======================================================================== */
절("[11] 좁혔다 다시 넓히기 — 가짜 화면 위에서 틀을 진짜로 돌립니다");

/* ── 아주 작은 가짜 DOM (기존 틀 테스트와 같은 모양) ───────────────────── */
function matchOne(el, compound) {
  const m = /^\.([A-Za-z0-9_-]+)(?:\[([A-Za-z0-9_-]+)="([^"]*)"\])?$/.exec(compound);
  if (!m) return false;
  if ((" " + (el.className || "") + " ").indexOf(" " + m[1] + " ") < 0) return false;
  if (m[2] && el.getAttribute(m[2]) !== m[3]) return false;
  return true;
}
function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    nodeType: 1, className: "", id: "", type: "", style: {},
    parentNode: null, childNodes: [], attrs: {}, offsetHeight: 23,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null;
    },
    appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; },
    insertBefore(c, ref) {
      c.parentNode = this;
      const i = this.childNodes.indexOf(ref);
      if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
      return c;
    },
    removeChild(c) {
      const i = this.childNodes.indexOf(c);
      if (i >= 0) this.childNodes.splice(i, 1);
      c.parentNode = null; return c;
    },
    addEventListener() {},
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) {
      const parts = String(sel).trim().split(/\s+/);
      const last = parts[parts.length - 1];
      const out = [];
      (function walk(n, chain) {
        n.childNodes.forEach((c) => {
          if (c.nodeType !== 1) return;
          if (matchOne(c, last)) {
            let okChain = true;
            for (let pi = 0; pi < parts.length - 1; pi++) {
              if (!chain.some((a) => matchOne(a, parts[pi]))) okChain = false;
            }
            if (okChain) out.push(c);
          }
          walk(c, chain.concat([c]));
        });
      })(this, []);
      return out;
    }
  };
  Object.defineProperty(el, "children", {
    get() { return this.childNodes.filter((c) => c.nodeType === 1); }
  });
  let 글자 = "";
  Object.defineProperty(el, "textContent", {
    get() { return 글자; }, set(v) { 글자 = String(v); }
  });
  return el;
}
function textNode(v) { return { nodeType: 3, nodeValue: v, parentNode: null }; }
function makeSeries(type, options) {
  return {
    _type: type, _opts: Object.assign({}, options), _data: [],
    seriesType() { return this._type; },
    options() { return this._opts; },
    applyOptions(o) { Object.assign(this._opts, o); },
    priceScale() { return { applyOptions() {} }; },
    createPriceLine() { return {}; },
    removePriceLine() {},
    attachPrimitive() {}, detachPrimitive() {},
    setData(d) { this._data = (d || []).slice(); },
    update() {},
    data() { return this._data; }
  };
}
function 봉만들기(n) {
  const out = [];
  let c = 100;
  for (let i = 0; i < n; i++) {
    c += ((i * 37) % 11) - 5;
    out.push({ time: 1700000000 + i * 60, open: c - 5, high: c + 9, low: c - 11, close: c, volume: 3 + (i % 4) });
  }
  return out;
}

/**
 * 틀 + 자리 계산기를 한 상자에 올리고 돌립니다.
 * 소스변형 을 주면 ★그 글자를 바꿔서★ 올립니다 (돌연변이 검사용).
 * ⚠️ 원본 파일은 안 건드립니다 — 읽어 온 글자만 바꿉니다.
 */
function 태우기(소스변형) {
  const 봉 = 봉만들기(160);
  const timers = [];
  const stored = {};

  /* ── 가짜 차트 — 칸 높이를 ★틀이 실제로 넣은 stretchFactor★ 로 계산합니다.
     비율(0.32)을 여기 적지 않습니다. 그림영역을 바꾸면 창을 좁힌 것과 같습니다. */
  let 그림영역 = 962; /* 1440x900 브라우저 실측 */
  const subs = [];
  const candle = makeSeries("Candlestick", { priceScaleId: "right" });
  candle._data = 봉.slice();
  const vol = makeSeries("Histogram", { priceScaleId: "" });
  let mainSf = 2;
  function 몫() {
    const 그림 = 그림영역 - subs.length; /* 칸 사이 구분선 1px */
    let 합 = mainSf;
    subs.forEach((p2) => { 합 += p2._sf; });
    return { 그림, 합 };
  }
  const mainPane = {
    _series: [candle, vol],
    _sf: 2,
    getSeries() { return this._series.slice(); },
    getStretchFactor() { return mainSf; },
    setStretchFactor(f) { mainSf = f; },
    getHeight() { const h = 몫(); return Math.round(h.그림 * mainSf / h.합); },
    paneIndex() { return 0; },
    addSeries(def, o) {
      const s2 = makeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", o);
      this._series.push(s2); return s2;
    }
  };
  function 새칸() {
    return {
      _sf: 1, _series: [],
      getSeries() { return this._series.slice(); },
      setStretchFactor(f) { this._sf = f; },
      getStretchFactor() { return this._sf; },
      getHeight() { const h = 몫(); return Math.round(h.그림 * this._sf / h.합); },
      paneIndex() { return subs.indexOf(this) + 1; },
      addSeries(def, o) {
        const s2 = makeSeries(def && def.__kind === "hist" ? "Histogram" : "Line", o);
        this._series.push(s2); return s2;
      }
    };
  }
  const chart = {
    panes() { return [mainPane].concat(subs); },
    addPane() { const p2 = 새칸(); subs.push(p2); return p2; },
    removePane(i) { if (i > 0) subs.splice(i - 1, 1); },
    addSeries(def, o) { return mainPane.addSeries(def, o); },
    removeSeries(s2) {
      const i0 = mainPane._series.indexOf(s2);
      if (i0 >= 0) { mainPane._series.splice(i0, 1); return; }
      subs.forEach((p2) => {
        const i = p2._series.indexOf(s2);
        if (i >= 0) p2._series.splice(i, 1);
      });
    }
  };

  /* ── 가짜 문서 ───────────────────────────────────────────────────── */
  const head = makeEl("head");
  const body = makeEl("body");
  const panel = makeEl("div"); panel.className = "chart-panel";
  const wrap = makeEl("div"); wrap.className = "chart-wrap";
  const indBar = makeEl("div"); indBar.className = "tl-ind-bar";
  panel.appendChild(wrap); panel.appendChild(indBar); body.appendChild(panel);
  function findById(root, id) {
    let found = null;
    (function walk(n) {
      n.childNodes.forEach((c) => {
        if (c.nodeType !== 1) return;
        if (c.id === id && !found) found = c;
        walk(c);
      });
    })(root);
    return found;
  }
  const doc = {
    readyState: "complete", head, body, documentElement: makeEl("html"),
    fullscreenElement: null, webkitFullscreenElement: null,
    addEventListener() {}, createElement: makeEl, createTextNode: textNode,
    getElementById(id) { return findById(head, id) || findById(body, id); },
    querySelector(sel) { return body.querySelectorAll(sel)[0] || null; },
    querySelectorAll(sel) { return body.querySelectorAll(sel); }
  };

  const sandbox = {
    console: { warn() {}, log() {}, error() {} },
    document: doc,
    performance: { now: () => 0 },
    innerWidth: 1440, innerHeight: 900,
    setInterval(fn, ms) { timers.push({ ms, fn, alive: true }); return timers.length; },
    clearInterval(id) { if (id && timers[id - 1]) timers[id - 1].alive = false; },
    setTimeout() { return 0; },
    clearTimeout() {},
    addEventListener() {},
    getComputedStyle() { return { display: "none" }; },
    LightweightCharts: {
      LineSeries: { __kind: "line" },
      HistogramSeries: { __kind: "hist" },
      LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 }
    }
  };
  sandbox.window = sandbox;
  sandbox.App = {
    Storage: {
      save(k, v) { stored[k] = JSON.parse(JSON.stringify(v)); return true; },
      load(k) { return stored[k] ? JSON.parse(JSON.stringify(stored[k])) : null; }
    },
    Bus: { on() {}, emit() {} },
    ChartFont: { getCharts() { return [chart]; }, getFontSize() { return 21; } },
    Config: { getActiveSymbol() { return "BTCUSDT"; } }
  };

  vm.createContext(sandbox);
  vm.runInContext(ROOM_SRC, sandbox, { filename: "js/chart-indicator-room.js" });
  vm.runInContext(소스변형 ? 소스변형(KIT_SRC) : KIT_SRC, sandbox,
    { filename: "js/chart-indicator-kit.js" });
  timers.slice().forEach((t) => t.alive && t.fn());

  const K2 = sandbox.App.ChartIndicatorKit;
  const insts = K2.getInstancesForTest();

  /** 지금 상태를 셉니다 — 칩은 ★화면에 적힌 글자(className)로만★ 봅니다 */
  function 재기() {
    const chips = indBar.querySelectorAll(".tl-kit-btn");
    const 쉼칩 = chips.filter((b) => (" " + b.className + " ").indexOf(" tl-kit-rest ") >= 0);
    const 흔적 = chips.filter((b) => b.getAttribute("data-kit-rest") !== null);
    const 켜진 = Object.keys(insts).filter((id) => insts[id].on);
    return {
      칸높이: chart.panes().map((p2) => p2.getHeight()),
      선그려진칸: subs.filter((p2) => p2._series.length > 0).length,
      켜진수: 켜진.length,
      쉼칩: 쉼칩.map((b) => b.getAttribute("data-kit")).sort(),
      흔적수: 흔적.length,
      칩수: chips.length,
      저장: JSON.stringify(stored["chart-indicator-kit"] || null)
    };
  }
  return {
    재기,
    폭바꾸기(h) { 그림영역 = h; },
    켜기(defId) { return K2.createInstance(defId, { on: true }); },
    자리다시() { return K2.applyRoomForTest(true); }
  };
}

const 서브지표 = ["macd", "kdj", "dmi", "rsi", "srsi", "stoch", "atr"];

{
  const t = 태우기(null);
  서브지표.forEach((d) => t.켜기(d));

  /* ── A. 넓은 화면 — 다 그려지고 「쉼」 은 하나도 없어야 합니다 ─────── */
  const A = t.재기();
  console.log("      A 넓음(962) — 선 " + A.선그려진칸 + "칸 · 켜짐 " + A.켜진수 +
    " · 쉼 " + A.쉼칩.length + " · 흔적 " + A.흔적수 + " · 칩 " + A.칩수);
  ok("A) 켠 것이 전부 그려진다", A.선그려진칸 === A.켜진수 && A.켜진수 > 1, JSON.stringify(A));
  ok("★A) 멀쩡한데 「쉬는 중」 이라고 말하지 않는다★ (쉼 " + A.쉼칩.length + "개)",
    A.쉼칩.length === 0,
    "PM 이 브라우저에서 잡은 것이 정확히 이것입니다 — 선이 다 그려지는데 쉼 표시가 남았습니다");
  ok("★A) 안 쉬는 칩에는 흔적이 아예 안 남는다★ (data-kit-rest " + A.흔적수 + "개)",
    A.흔적수 === 0,
    "지우지 않고 0 을 넣으면 [data-kit-rest] 로 세는 사람에게 ★쉬는 중으로 읽힙니다★ — " +
    "2026-09-04 에 실제로 그렇게 읽혔습니다");
  const 저장A = A.저장;

  /* ── B. 좁힘 — 쉬는 것만 표시돼야 합니다 ──────────────────────────── */
  t.폭바꾸기(488); /* 1024x768 브라우저 실측 */
  t.자리다시();
  const B = t.재기();
  console.log("      B 좁힘(488) — 선 " + B.선그려진칸 + "칸 · 켜짐 " + B.켜진수 +
    " · 쉼 " + B.쉼칩.length + " · 흔적 " + B.흔적수);
  ok("B) 좁히면 일부가 쉰다", B.쉼칩.length > 0 && B.선그려진칸 < A.선그려진칸, JSON.stringify(B));
  ok("★B) 그려진 칸 + 쉼 표시 = 켜진 수★ (" + B.선그려진칸 + " + " + B.쉼칩.length +
    " = " + B.켜진수 + ")",
    B.선그려진칸 + B.쉼칩.length === B.켜진수,
    "어긋나면 ★그려지는데 쉬는 중이라 하거나, 안 그려지는데 아무 말도 안 하는★ 것입니다");
  ok("B) 켜진 수는 그대로다 (회원이 켠 것을 안 끕니다)", B.켜진수 === A.켜진수);
  ok("★B) 저장칸이 안 바뀐다★", B.저장 === 저장A, "쉬게 하면서 회원 설정을 덮어썼습니다");

  /* ── C. 다시 넓힘 — ★표시가 지워져야 합니다★ ────────────────────── */
  t.폭바꾸기(962);
  t.자리다시();
  const C = t.재기();
  console.log("      C 다시넓힘(962) — 선 " + C.선그려진칸 + "칸 · 켜짐 " + C.켜진수 +
    " · 쉼 " + C.쉼칩.length + " · 흔적 " + C.흔적수);
  ok("C) 넓히면 전부 돌아온다", C.선그려진칸 === A.선그려진칸, JSON.stringify(C));
  ok("★C) 넓히면 「쉬는 중」 표시가 지워진다★ (쉼 " + C.쉼칩.length + "개)",
    C.쉼칩.length === 0,
    "★이것이 2026-09-04 게이트 2 반려 사유입니다★ — 칸은 돌아오는데 표시만 눌러 붙었습니다");
  ok("★C) 흔적도 안 남는다★ (data-kit-rest " + C.흔적수 + "개)", C.흔적수 === 0);
  ok("★C) 그려진 칸 + 쉼 표시 = 켜진 수★", C.선그려진칸 + C.쉼칩.length === C.켜진수);
  ok("C) 저장칸이 왕복 내내 그대로다", C.저장 === 저장A);
}

/* =========================================================================
 * [12] ★돌연변이★ — 표시를 떼는 갈래를 막으면 반드시 빨개져야 합니다
 *
 * 이걸 안 하면 [11] 이 「아무것도 안 지키면서 초록」 일 수 있습니다.
 * 2026-09-04 에 봉인 65건이 정확히 그 상태였습니다.
 * ======================================================================== */
절("[12] 돌연변이 — 떼는 갈래를 막으면 [11] 이 빨개지는가");

/** 「붙이기만 하고 떼지 않는」 틀을 만듭니다 (원본 파일은 안 건드립니다) */
function 떼기막기(src) {
  const 원본 = 'var want = rest ? "tl-kit-btn tl-kit-rest" : "tl-kit-btn";';
  if (src.indexOf(원본) < 0) return null;
  return src.replace(원본, 'var want = rest ? "tl-kit-btn tl-kit-rest" : kids[i].className;');
}
{
  ok("떼는 갈래를 찾았다 (한 줄에서 붙이고 뗍니다)", 떼기막기(KIT_SRC) !== null,
    "paintButtons 의 want 줄이 바뀌었으면 이 돌연변이도 같이 고치세요");
  if (떼기막기(KIT_SRC)) {
    const t = 태우기(떼기막기);
    서브지표.forEach((d) => t.켜기(d));
    t.폭바꾸기(488); t.자리다시();
    const 좁음 = t.재기();
    t.폭바꾸기(962); t.자리다시();
    const 넓음 = t.재기();
    console.log("      (변이) 좁힘 쉼 " + 좁음.쉼칩.length + " -> 다시넓힘 쉼 " + 넓음.쉼칩.length +
      " · 선 " + 넓음.선그려진칸 + "칸");
    ok("★변이: 다시 넓혀도 「쉼」 이 남는다 = [11] 이 진짜로 잡는다★",
      좁음.쉼칩.length > 0 && 넓음.쉼칩.length > 0,
      "변이를 넣었는데도 표시가 지워졌습니다 — ★[11] 이 아무것도 안 지키고 있습니다★");
    ok("★변이: 「그려진 칸 + 쉼 = 켜진 수」 가 깨진다★",
      넓음.선그려진칸 + 넓음.쉼칩.length !== 넓음.켜진수,
      "이 식이 안 깨지면 그 검사가 헛돌고 있습니다");
  }
}

/** ★2026-09-04 에 실제로 배포 직전까지 갔던 그 코드★ 를 되돌려 넣습니다.
 *  「지우는 대신 0 을 넣는」 방식 — 화면의 "쉼" 글자는 지워지지만
 *  data-kit-rest 가 ★쉬지도 않는 칩 전부에★ 눌러 붙습니다.
 *  PM 이 [data-kit-rest] 로 세어 15개를 보고 「멀쩡한 것까지 쉬는 중」 으로 읽었습니다. */
function 옛방식되돌리기(src) {
  const 원본 = [
    '      var rest = on && !!(insts[id] && insts[id].rest);',
    '      var want = rest ? "tl-kit-btn tl-kit-rest" : "tl-kit-btn";',
    '      if (kids[i].className !== want) {',
    '        kids[i].className = want;'
  ].join("\n");
  if (src.indexOf(원본) < 0) return null;
  const 옛것 = [
    '      var rest = on && !!(insts[id] && insts[id].rest) ? "1" : "0";',
    '      var want = rest;',
    '      if (kids[i].getAttribute("data-kit-rest") !== want) {',
    '        kids[i].setAttribute("data-kit-rest", want);'
  ].join("\n");
  return src.replace(원본, 옛것);
}
{
  ok("옛 방식 자리를 찾았다", 옛방식되돌리기(KIT_SRC) !== null,
    "paintButtons 가 바뀌었으면 이 돌연변이도 같이 고치세요");
  if (옛방식되돌리기(KIT_SRC)) {
    const t = 태우기(옛방식되돌리기);
    서브지표.forEach((d) => t.켜기(d));
    const 옛A = t.재기();
    console.log("      (옛방식) 넓음 — 선 " + 옛A.선그려진칸 + "칸 · 쉼글자 " + 옛A.쉼칩.length +
      " · ★흔적 " + 옛A.흔적수 + "개★");
    ok("★옛 방식: 멀쩡한 칩 전부에 흔적이 눌러 붙는다 = 새 봉인이 진짜로 잡는다★",
      옛A.흔적수 > 0 && 옛A.흔적수 === 옛A.칩수,
      "옛 방식을 되돌렸는데도 흔적이 0 이면 ★[11] 의 흔적 검사가 헛돌고 있습니다★");
    ok("(참고) 옛 방식도 화면의 「쉼」 글자 자체는 지워졌다 — 그래서 눈으로만 봐서는 못 봅니다",
      옛A.쉼칩.length === 0);
  }
}

/** 「자리를 다시 재고도 안 칠하는」 틀 — 켜는 쪽만 세던 옛 모습 */
{
  const 원본 = "      if (!!it.rest !== rest) changed = true;\n";
  ok("★applyRoom 이 표시만 바뀐 경우도 다시 칠한다★ (켜는 쪽·끄는 쪽을 같은 눈으로)",
    KIT_SRC.indexOf(원본) >= 0,
    "그리기(live)가 바뀔 때만 다시 칠하면 ★표시만 남는★ 자리가 생깁니다");
}

/* =========================================================================
 * [10] 등록 · 되돌리기
 * ========================================================================= */
절("[10] 등록 · 되돌리기");
{
  const order = fs.readFileSync(ORDER, "utf8");
  ok("tests/_order.txt 에 등록돼 있다",
    order.indexOf("tests/chart-indicator-room.test.js") >= 0);
  ok("되돌리는 방법이 이 파일에 적혀 있다",
    fs.readFileSync(__filename, "utf8").indexOf("되돌리기:") >= 0);
}

/* 되돌리기:
 *   1) index.html 에서 <script src="js/chart-indicator-room.js"> 한 줄을 지운다
 *   2) git checkout js/chart-indicator-kit.js js/chart-indicator-picker.js index.html
 *   3) git rm -f --cached js/chart-indicator-room.js  (아직 커밋 전이면 rm js/...)
 *   4) 이 줄과 tests/chart-indicator-room.test.js 를 _order.txt 에서 지운다
 */

console.log("\n==========================================================");
console.log("통과 " + pass + " / 실패 " + fail);
if (fail) {
  console.log("실패 있음 ❌");
  process.exit(1);
}
console.log("전체 통과 ✅");
process.exit(0);
