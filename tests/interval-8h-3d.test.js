/* tests/interval-8h-3d.test.js
 * 8시간봉 · 3일봉 — 바이낸스에 있는데 우리에만 없던 간격 (2026-09-03 추가)
 *
 * ── 무엇이 문제였나 ────────────────────────────────────────────────────
 * 바이낸스 선물은 kline 간격을 15개 줍니다. 우리는 그중 8h 와 3d 두 개를
 * 빼놓고 있었습니다. 회원이 8시간봉을 보려면 우리 사이트를 못 씁니다.
 *
 *   ★실제로 불러서 확인했습니다★ (2026-09-03)
 *     GET /fapi/v1/klines?symbol=BTCUSDT&interval=8h → 봉 간격 28,800,000ms
 *     GET /fapi/v1/klines?symbol=BTCUSDT&interval=3d → 봉 간격 259,200,000ms
 *   둘 다 정상이라 native: true 입니다.
 *
 * ── 왜 테스트가 필요한가 ───────────────────────────────────────────────
 * 간격을 늘리면 ★"더보기" 메뉴가 길어집니다.★ 이 메뉴는 폰에서 하단
 * 매수/매도 막대 위에 떠야 하는데, 길어지면 막대 밑에 깔립니다.
 *
 *   실측 (360x640, 스크롤 25px 간격으로 18곳)
 *     7줄일 때  메뉴 키 232px
 *     9줄일 때  메뉴 키 288px · 남은 여유 위 23px / 아래 0px
 *   ★한 줄만 더 늘면 바로 잘립니다.★ 그래서 이번에 스크롤 안전망도 같이
 *   달았고, 이 파일이 그 안전망이 살아 있는지 지킵니다.
 *
 * ── 이 파일이 지키는 것 ────────────────────────────────────────────────
 *  (1) 8h · 3d 가 INTERVALS 에 있고 seconds 가 맞는가
 *  (2) INTERVALS 가 짧은 것 → 긴 것 순인가 (새 간격을 엉뚱한 데 끼우면 걸림)
 *  (3) 8h · 3d 가 "더보기" 안에 있는가 (밖으로 나오면 폰 버튼 줄이 터집니다)
 *  (4) 밖에 남는 버튼이 6개 그대로인가
 *  (5) 더보기 메뉴에 ★스크롤 안전망★ (바닥 기준 max-height + overflow-y) 이 있는가
 *  (6) ★글씨를 안 줄였는가★ (20.5px 그대로 — 대표가 작은 글씨를 못 읽습니다)
 *  (7) 기간 탭(1D~ALL)이 가리키는 간격이 전부 실제로 있는가
 *
 * 이 파일은 ★파일만 읽습니다.★ 네트워크도 서버도 안 씁니다.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const REPO = process.env.REPO || path.join(__dirname, "..");
const CONFIG = fs.readFileSync(path.join(REPO, "js", "config.js"), "utf8");
const MORE_SRC = fs.readFileSync(path.join(REPO, "js", "interval-more.js"), "utf8");
const RANGE_SRC = fs.readFileSync(path.join(REPO, "js", "chart-date-range.js"), "utf8");
const ORDER = fs.readFileSync(path.join(__dirname, "_order.txt"), "utf8");

let pass = 0;
let fail = 0;
function ok(name, cond, detail) {
  if (cond) {
    pass++;
    console.log("  \x1b[32m✓\x1b[0m " + name);
  } else {
    fail++;
    console.log("  \x1b[31m✗\x1b[0m " + name + (detail ? " — " + detail : ""));
  }
}

console.log("\n8시간봉 · 3일봉 (js/config.js · js/interval-more.js)");

/* INTERVALS 를 소스에서 그대로 뽑습니다 (실행하지 않고 글자로 읽습니다) */
const 간격들 = [];
const 줄정규식 = /\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*,\s*seconds:\s*(\d+)\s*,\s*native:\s*(true|false)\s*\}/g;
let m;
while ((m = 줄정규식.exec(CONFIG))) {
  간격들.push({ value: m[1], label: m[2], seconds: Number(m[3]), native: m[4] === "true" });
}
ok("INTERVALS 를 읽었다", 간격들.length >= 16, "읽은 개수 " + 간격들.length);

function 찾기(v) {
  return 간격들.find((x) => x.value === v) || null;
}

/* ── (1) 8h · 3d 가 있고 seconds 가 맞는가 ───────────────────────────── */
const 기대 = [
  { v: "8h", sec: 28800, label: "8시간" },
  { v: "3d", sec: 259200, label: "3일" },
];
기대.forEach((e) => {
  const iv = 찾기(e.v);
  ok(e.v + " 가 INTERVALS 에 있다", !!iv, "없습니다 — 바이낸스에 있는 간격입니다");
  if (!iv) return;
  ok(e.v + ' seconds 가 ' + e.sec, iv.seconds === e.sec, "지금 " + iv.seconds);
  ok(e.v + ' label 이 "' + e.label + '"', iv.label === e.label, "지금 " + iv.label);
  ok(
    e.v + " 는 native: true (바이낸스가 실제로 주는 간격)",
    iv.native === true,
    "native 가 false 면 config 가 kline 스트림을 안 붙입니다"
  );
});

/* ── (2) 짧은 것 → 긴 것 순인가 ──────────────────────────────────────── */
let 순서깨진곳 = null;
for (let i = 1; i < 간격들.length; i++) {
  if (간격들[i].seconds <= 간격들[i - 1].seconds) {
    순서깨진곳 = 간격들[i - 1].value + " (" + 간격들[i - 1].seconds + ") → " +
      간격들[i].value + " (" + 간격들[i].seconds + ")";
    break;
  }
}
ok("INTERVALS 가 짧은 것 → 긴 것 순이다", 순서깨진곳 === null, 순서깨진곳);

/* ── (3)(4) "더보기" 안에 있는가 · 밖은 6개 그대로인가 ───────────────── */
const moreM = MORE_SRC.match(/var MORE = \[([^\]]*)\]/);
ok("interval-more.js 의 MORE 목록을 읽었다", !!moreM);
const MORE = moreM ? moreM[1].split(",").map((s) => s.trim().replace(/^"|"$/g, "")).filter(Boolean) : [];

["8h", "3d"].forEach((v) => {
  ok(
    v + ' 는 "더보기" 안에 있다',
    MORE.indexOf(v) !== -1,
    "밖으로 꺼내면 360px 에서 버튼 줄이 한 줄 더 늘어 차트를 밀어냅니다"
  );
});

/* 밖에 남는 것 = INTERVALS 중 MORE 에도 없고, 원래 숨겨진 초 단위도 아닌 것 */
const 초단위 = ["1s", "5s", "15s"];
const 밖에남는것 = 간격들
  .map((x) => x.value)
  .filter((v) => MORE.indexOf(v) === -1 && 초단위.indexOf(v) === -1);
ok(
  "버튼 줄에 남는 간격이 6개 그대로다",
  밖에남는것.length === 6,
  "지금 " + 밖에남는것.length + "개: " + 밖에남는것.join(", ")
);
ok(
  "남는 6개가 1분·5분·15분·1시간·4시간·1일 이다",
  밖에남는것.join(",") === "1m,5m,15m,1h,4h,1d",
  밖에남는것.join(",")
);

/* ── (5) 더보기 메뉴의 스크롤 안전망 ─────────────────────────────────── */
ok(
  "더보기 메뉴에 overflow-y:auto 가 있다",
  /overflow-y:auto/.test(MORE_SRC),
  "없으면 메뉴가 화면보다 커졌을 때 회원이 잘린 줄을 꺼낼 방법이 없습니다"
);
ok(
  "clampMenu() 가 바닥(menuFloorY) 기준으로 max-height 를 건다",
  /menu\.style\.maxHeight\s*=/.test(MORE_SRC) && /floorY\s*-\s*EDGE/.test(MORE_SRC),
  "max-height 를 100vh 기준으로 잡으면 폰 주문 막대 밑에 깔린 줄을 못 찾습니다"
);
ok(
  "메뉴 바닥 기준이 하단 주문 막대(.tl-order-bar)를 센다",
  /\.tl-order-bar/.test(MORE_SRC),
  "vh 만 보면 막대에 가려진 줄을 '화면 안' 으로 잘못 셉니다"
);

/* ── (6) 글씨를 안 줄였는가 ──────────────────────────────────────────── */
const 폰트들 = (MORE_SRC.match(/font-size:([\d.]+)px/g) || []).map((s) =>
  Number(s.replace(/[^\d.]/g, ""))
);
ok("interval-more.js 안에 글씨 크기가 있다", 폰트들.length > 0);
ok(
  "글씨를 한 픽셀도 안 줄였다 (전부 20.5px)",
  폰트들.length > 0 && 폰트들.every((f) => f === 20.5),
  "지금 " + 폰트들.join(" / ") + "px — 줄이 넘치면 글씨 대신 스크롤로 풉니다"
);

/* ── (7) 기간 탭이 가리키는 간격이 전부 실제로 있는가 ────────────────── */
const 탭간격 = [];
const 탭정규식 = /\{\s*id:\s*"[^"]+",\s*seconds:[^,]+,\s*interval:\s*"([^"]+)"/g;
let t;
while ((t = 탭정규식.exec(RANGE_SRC))) 탭간격.push(t[1]);
ok("기간 탭 목록을 읽었다", 탭간격.length >= 8, "읽은 개수 " + 탭간격.length);
const 없는탭간격 = 탭간격.filter((v) => !찾기(v));
ok(
  "기간 탭(1D~ALL)이 가리키는 간격이 전부 INTERVALS 에 있다",
  없는탭간격.length === 0,
  "없는 간격: " + 없는탭간격.join(", ")
);

/* ── 등록 확인 ───────────────────────────────────────────────────────── */
ok(
  "이 파일이 tests/_order.txt 에 등록돼 있다",
  ORDER.indexOf("tests/interval-8h-3d.test.js") !== -1,
  "등록 안 하면 npm test 가 안 돌립니다"
);

console.log("\n  통과 " + pass + " / 실패 " + fail + "\n");
if (fail > 0) process.exit(1);
process.exit(0);
