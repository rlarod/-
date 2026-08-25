
/* 주문창 구역만 잘라냅니다.
   예전에는 "주문창(Order Panel)" 부터 파일 끝까지를 전부 검사했습니다.
   그래서 뒤에 새 규칙을 덧붙일 때마다 주문창과 무관한 코드가 이 검사에
   걸렸습니다(2026-08-19 채팅 강제청산 스타일이 실제로 걸렸습니다).
   다음 구역 표시(===== 로 시작하는 주석) 앞까지만 봅니다. */
function orderPanelBlock(css) {
  const start = css.indexOf("주문창(Order Panel)");
  if (start === -1) return "";
  const next = css.indexOf("/* =====", start + 20);
  return next === -1 ? css.slice(start) : css.slice(start, next);
}
/* =========================================================================
 * 주문창 개미톡 매칭 + 기존 기능 보존 회귀 테스트
 * =========================================================================
 * 실행: node order-panel.test.js
 * 계산은 전부 실제 js/trading.js를 그대로 사용합니다(모킹 없음).
 * ========================================================================= */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { boot, REPO } = require("./harness");

let pass = 0;
let fail = 0;
const failures = [];

const queue = [];
function t(name, fn) {
  queue.push({ name, fn });
}
function tick(ms) {
  // jsdom의 setTimeout(0) 콜백(레버리지/탭 전환 후 재계산)이 실행되도록 한 틱 양보
  return new Promise((r) => setTimeout(r, ms || 10));
}
async function runQueue() {
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
}
function eq(a, b, msg) {
  if (a !== b) throw new Error((msg || "") + " 기대=" + JSON.stringify(b) + " 실제=" + JSON.stringify(a));
}
function close(a, b, tol, msg) {
  if (!(Math.abs(a - b) <= tol)) throw new Error((msg || "") + " 기대≈" + b + " 실제=" + a);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || "참이어야 함");
}
function section(s) {
  queue.push({ section: s });
}

/* 페이지를 새로 띄우고 현재가를 실제 이벤트로 주입 */
function fresh(price) {
  const ctx = boot();
  ctx.win.localStorage.clear();
  const c = boot();
  c.App.Bus.emit("price:update", { symbol: "BTCUSDT", price: price || 68394, time: Date.now() });
  return c;
}
function click(el) {
  el.dispatchEvent(new (el.ownerDocument.defaultView.MouseEvent)("click", { bubbles: true }));
}
function setInput(el, v) {
  el.value = v;
  el.dispatchEvent(new (el.ownerDocument.defaultView.Event)("input", { bubbles: true }));
}

/* ===================================================================== */
section("[1] 보호 대상 핵심 파일 무결성");
const PROTECTED = {
  // 2026-08-18: 사장님 허락을 받아 펀딩비 정산 한 줄만 수정했습니다.
  //   state.balance += fundingFee  ->  Math.max(0, state.balance + fundingFee)
  //   (100% 진입 후 잔고가 음수가 되던 문제. 아래 회귀 테스트로 고정합니다.)
  "js/trading.js": "33250202c00b097ff8344ae2ee64cbe7",
  "js/ui.js": "333fc427e75b47b306699c92aa4e7b50",
  "js/auth.js": "9cec9a7257eb54f379bf72e14e21e463",
  "js/supabase-sync.js": "faddcbbc34b5165177ff26cb978040f8",
  "js/chat.js": "a93dfaa7f82ce72a914b270acb3650bb",
  "js/leaderboard.js": "62e839f06e0565cca5d9216e484b6031",
  "js/admin.js": "424e4c63ec1cd24681c4f27f60aee2fa",
  "js/season.js": "9c5fbf13ced09ca2f348e48f87c78224",
  "js/board.js": "8b847bd8f5d8231b8dd329f8b15dbe37",
  "js/orderbook.js": "fa5f77dc5108133128f85ba5ab3f096e",
  "js/chart.js": "02ddcb000d577131f797143d08c09123",
  "js/websocket.js": "1a914631175760e0b0cb5144bc11b59e",
};
Object.keys(PROTECTED).forEach((f) => {
  t(f + " 무수정", () => {
    const h = crypto.createHash("md5").update(fs.readFileSync(path.join(REPO, f))).digest("hex");
    eq(h, PROTECTED[f], f + " 가 변경됨!");
  });
});

/* ===================================================================== */
section("[2] 개미톡 레이아웃 — 요소 존재 및 순서");
{
  const { doc } = fresh();
  const panel = doc.querySelector(".order-panel");

  t("주문창에 amitalk-order 클래스 적용", () => ok(panel.classList.contains("amitalk-order")));

  const expected = [
    ["교차(Cross) 배지", "#margin-mode-badge"],
    ["레버리지 배지", "#lev-mode-badge"],
    ["지정가/시장가 탭", "#order-type-row"],
    ["알림음 체크박스", "#order-sound-toggle"],
    ["주문가격 입력", "#limit-price-input"],
    ["주문수량 입력", "#order-qty-input"],
    ["수량 비율 버튼", "#qty-percent-row"],
    ["매수/매도 비율바", ".order-pressure-track"],
    ["매수가격", "#preview-ask-price"],
    ["매도가격", "#preview-bid-price"],
    ["매수금액", "#preview-buy-amount"],
    ["매도금액", "#preview-sell-amount"],
    ["매수/Long 버튼", "#btn-long"],
    ["매도/Short 버튼", "#btn-short"],
    ["평가", "#acc-equity"],
    ["보유", "#acc-balance-holding"],
    ["가능", "#acc-available"],
    ["수수료", "#acc-fee-rate"],
    ["하단 프로모션 영역", "#ami-promo"],
    ["하단 종목 영역", "#ami-symbols"],
  ];
  expected.forEach(([label, sel]) => {
    t("존재: " + label, () => ok(panel.querySelector(sel), sel + " 없음"));
  });

  t("DOM 순서가 개미톡 순서와 일치", () => {
    const nodes = expected.map(([label, sel]) => ({ label, el: panel.querySelector(sel) }));
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1].el;
      const cur = nodes[i].el;
      const rel = prev.compareDocumentPosition(cur);
      const after = !!(rel & 4) || !!(rel & 16); // FOLLOWING 또는 CONTAINED_BY
      ok(after, nodes[i - 1].label + " 다음에 " + nodes[i].label + " 가 와야 함");
    }
  });

  t("매수 / Long, 매도 / Short 라벨", () => {
    eq(doc.getElementById("btn-long").textContent.trim(), "매수 / Long");
    eq(doc.getElementById("btn-short").textContent.trim(), "매도 / Short");
  });

  t("퍼센트 버튼은 10/25/50/75/100 다섯 개", () => {
    const chips = panel.querySelectorAll("#qty-percent-row .chip");
    eq(chips.length, 5);
    eq(Array.prototype.map.call(chips, (c) => c.textContent).join(","), "10%,25%,50%,75%,100%");
  });

  t("개미톡 순서대로 [지정가][시장가]", () => {
    const btns = doc.querySelectorAll("#order-type-row .interval-btn");
    eq(btns[0].dataset.orderType, "limit");
    eq(btns[1].dataset.orderType, "market");
  });

  t("강제청산은 실제 유지증거금률 표기(가짜 70% 아님)", () => {
    const txt = panel.textContent;
    ok(txt.includes("유지증거금률 0.5%"), "실제 MMR 0.5% 표기 필요");
    ok(!txt.includes("70%"), "존재하지 않는 70% 값이 있으면 안 됨");
  });

  t("환율 항목은 데이터 소스가 없어 표시하지 않음", () => {
    ok(!panel.textContent.includes("환율"), "환율 항목이 노출되면 안 됨");
  });
}

/* ===================================================================== */
section("[3] 기능 보존 — 숨겨졌을 뿐 코드/DOM은 살아있음");
{
  const { doc } = fresh();
  [
    ["증거금 입력(#margin-input)", "margin-input"],
    ["증거금 프리셋 chip", "margin-field-hidden"],
    ["레버리지 슬라이더", "lev-slider"],
    ["TP 입력", "tp-input"],
    ["SL 입력", "sl-input"],
    ["미체결 지정가 카드", "pending-order-card"],
    ["포지션 카드", "position-card"],
  ].forEach(([label, id]) => {
    t("보존: " + label, () => ok(doc.getElementById(id), id + " 가 사라짐"));
  });

  t("레버리지 배지 클릭 시 슬라이더 펼쳐짐", () => {
    const { doc: d } = fresh();
    const field = d.getElementById("leverage-field-top");
    eq(field.style.display, "none", "기본은 접힘");
    click(d.getElementById("lev-mode-badge"));
    eq(field.style.display, "", "클릭 후 펼쳐져야 함");
  });

  t("TP/SL 토글로 펼침/접힘", () => {
    const { doc: d } = fresh();
    const box = d.getElementById("ami-tpsl-anchor");
    eq(box.style.display, "none");
    click(d.getElementById("ami-tpsl-toggle"));
    eq(box.style.display, "");
  });
}

/* ===================================================================== */
section("[4] 주문가격 — 시장가/지정가 전환, Last, ± 스텝");
{
  t("시장가 모드: 실시간 현재가 필드 표시, 지정가 입력 숨김", () => {
    const { doc, App } = fresh(68394);
    eq(doc.getElementById("ami-market-price-field").style.display, "");
    eq(doc.getElementById("limit-price-field").style.display, "none");
    ok(doc.getElementById("ami-market-price-input").value.replace(/,/g, "").startsWith("68394"), "현재가 표시 필요");
    void App;
  });

  t("지정가 탭 클릭 시 지정가 입력 표시, 시장가 필드 숨김", async () => {
    const { doc } = fresh();
    click(doc.querySelector('.interval-btn[data-order-type="limit"]'));
    await tick();
    ok(doc.getElementById("limit-price-field").style.display !== "none", "지정가 입력이 보여야 함");
    eq(doc.getElementById("ami-market-price-field").style.display, "none");
  });

  t("Last 버튼이 실제 현재가를 지정가 입력에 채움", () => {
    const { doc } = fresh(68394);
    click(doc.querySelector('.interval-btn[data-order-type="limit"]'));
    click(doc.getElementById("qty-price-last-btn"));
    close(parseFloat(doc.getElementById("limit-price-input").value.replace(/,/g, "")), 68394, 0.01);
  });

  t("± 버튼이 호가 단위 0.1 만큼 가격을 조정", () => {
    const { doc } = fresh(68394);
    click(doc.querySelector('.interval-btn[data-order-type="limit"]'));
    const input = doc.getElementById("limit-price-input");
    setInput(input, "68394");
    click(doc.querySelector('#ami-price-step button[data-step="up"]'));
    close(parseFloat(input.value), 68394.1, 0.001, "+ 스텝");
    click(doc.querySelector('#ami-price-step button[data-step="down"]'));
    close(parseFloat(input.value), 68394.0, 0.001, "− 스텝");
  });
}

/* ===================================================================== */
section("[5] 주문수량 → 증거금 역산(기존 trading.js 파라미터로 변환)");
{
  t("수량 × 가격 ÷ 레버리지 = #margin-input", () => {
    const { doc } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.5");
    const lev = parseFloat(doc.getElementById("lev-display").textContent);
    close(parseFloat(doc.getElementById("margin-input").value), (0.5 * 68394) / lev, 0.01);
  });

  t("레버리지 변경 시 증거금 재계산", async () => {
    const { doc } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.5");
    const slider = doc.getElementById("lev-slider");
    slider.value = "20";
    slider.dispatchEvent(new (doc.defaultView.Event)("input", { bubbles: true }));
    await tick();
    close(parseFloat(doc.getElementById("margin-input").value), (0.5 * 68394) / 20, 0.01);
  });

  t("10/25/50/75/100% 가 실제 주문가능 금액에 연동", () => {
    const { doc, App } = fresh(68394);
    const lev = parseFloat(doc.getElementById("lev-display").textContent);
    const maxMargin = App.Trading.getMaxAffordableMargin();
    [10, 25, 50, 75, 100].forEach((p) => {
      click(doc.querySelector('#qty-percent-row .chip[data-pct="' + p + '"]'));
      const expectedQty = ((maxMargin * lev) / 68394) * (p / 100);
      close(parseFloat(doc.getElementById("order-qty-input").value), expectedQty, 1e-5, p + "%");
    });
  });

  t("100% 주문이 잔고를 넘지 않아 실제로 체결됨", () => {
    const { doc, App } = fresh(68394);
    click(doc.querySelector('#qty-percent-row .chip[data-pct="100"]'));
    click(doc.getElementById("btn-long"));
    eq(doc.getElementById("order-err").textContent, "", "에러 없이 체결되어야 함");
    ok(App.Trading.getSnapshot().position, "포지션 생성 필요");
  });
}

/* ===================================================================== */
section("[6] 실제 거래 로직 연동 — LONG/SHORT/시장가/지정가/TP·SL");
{
  t("LONG 시장가: 입력한 수량 그대로 포지션 생성", () => {
    const { doc, App } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.5");
    click(doc.getElementById("btn-long"));
    const pos = App.Trading.getSnapshot().position;
    ok(pos, "포지션 없음");
    eq(pos.side, "long");
    close(pos.qty, 0.5, 1e-6, "수량");
  });

  t("SHORT 시장가: side=short", () => {
    const { doc, App } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.3");
    click(doc.getElementById("btn-short"));
    const pos = App.Trading.getSnapshot().position;
    eq(pos.side, "short");
    close(pos.qty, 0.3, 1e-6);
  });

  t("지정가 주문: pendingOrder 생성 + 입력 가격 반영", () => {
    const { doc, App } = fresh(68394);
    click(doc.querySelector('.interval-btn[data-order-type="limit"]'));
    setInput(doc.getElementById("limit-price-input"), "67000");
    setInput(doc.getElementById("order-qty-input"), "0.2");
    click(doc.getElementById("btn-long"));
    const p = App.Trading.getSnapshot().pendingOrder;
    ok(p, "미체결 주문 없음");
    close(p.price, 67000, 0.01);
    ok(!App.Trading.getSnapshot().position, "지정가는 즉시 체결되면 안 됨");
  });

  t("TP/SL 입력이 포지션에 반영", () => {
    const { doc, App } = fresh(68394);
    click(doc.getElementById("ami-tpsl-toggle"));
    setInput(doc.getElementById("order-qty-input"), "0.1");
    doc.getElementById("tp-input").value = "70000";
    doc.getElementById("sl-input").value = "66000";
    click(doc.getElementById("btn-long"));
    const pos = App.Trading.getSnapshot().position;
    close(pos.tp, 70000, 0.01, "TP");
    close(pos.sl, 66000, 0.01, "SL");
  });
}

/* ===================================================================== */
section("[7] 수익률 핵심 원칙(진입≠확정, 청산=확정)");
{
  t("초기 총자산은 100,000 USDT", () => {
    const { App } = fresh(68394);
    close(App.Trading.getSnapshot().equity, 100000, 0.01);
  });

  t("포지션 진입만으로는 실현손익이 변하지 않음(총자산은 진입 수수료만큼만 감소)", () => {
    const { doc, App } = fresh(68394);
    const before = App.Trading.getSnapshot();
    setInput(doc.getElementById("order-qty-input"), "0.5");
    click(doc.getElementById("btn-long"));
    const after = App.Trading.getSnapshot();
    const pos = after.position;
    // 기존 trading.js는 실거래소와 동일하게 진입 시 taker 수수료를 차감합니다.
    // 그 외에 진입만으로 확정되는 손익은 없어야 합니다.
    close(after.equity, before.equity - pos.entryFee, 0.01, "총자산은 진입 수수료만큼만 감소");
    eq(after.realizedPnl, before.realizedPnl, "실현손익은 불변");
    eq(after.realizedPnl, 0, "청산 전 실현손익 0");
  });

  t("가격이 오르면 미실현 손익만 움직이고 실현손익은 0", () => {
    const { doc, App } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.5");
    click(doc.getElementById("btn-long"));
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 70000, time: Date.now() });
    const s = App.Trading.getSnapshot();
    close(s.unrealizedPnl, (70000 - s.position.entry) * s.position.qty, 0.01, "미실현손익");
    eq(s.realizedPnl, 0, "청산 전 실현손익은 0이어야 함");
  });

  t("청산했을 때만 실현손익에 확정 반영", () => {
    const { doc, App } = fresh(68394);
    setInput(doc.getElementById("order-qty-input"), "0.5");
    click(doc.getElementById("btn-long"));
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 70000, time: Date.now() });
    App.Trading.closePosition("수동청산");
    const s = App.Trading.getSnapshot();
    ok(s.realizedPnl > 0, "청산 후 실현손익이 반영되어야 함 (실제=" + s.realizedPnl + ")");
    eq(s.position, null, "청산 후 포지션 없음");
    ok(s.equity > 100000, "이익 청산 후 총자산 증가 필요");
  });
}

/* ===================================================================== */
section("[8] 알림음 / 프로모션 / 종목 스트립");
{
  t("알림음 기본 꺼짐, 체크박스로 켜짐 저장", () => {
    const { doc } = fresh();
    const cb = doc.getElementById("order-sound-toggle");
    eq(cb.checked, false);
    cb.checked = true;
    cb.dispatchEvent(new (doc.defaultView.Event)("change", { bubbles: true }));
    eq(doc.defaultView.localStorage.getItem("amitalk:orderSound"), "1");
  });

  t("포지션 표: 추가 칸이 실제 계산값과 일치(하드코딩 없음)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.setLeverage(10);
    App.Trading.openPosition("long", 5000, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 64000, time: Date.now() });
    App.PositionTableExtra.renderForTest();

    const snap = App.Trading.getSnapshot();
    const notional = snap.position.qty * snap.currentPrice;

    // 금액 = 수량 × 현재가 (USDT 줄에 표시)
    const notionalUsdt = doc.getElementById("pos-notional").querySelector(".pos-money-usdt");
    ok(notionalUsdt, "USDT 줄 필요");
    // 값이 클수록 소수 자리를 줄여 칸을 아낍니다(10만 이상 0자리 / 1000 이상 2자리)
    const dp = notional >= 100000 ? 0 : notional >= 1000 ? 2 : 4;
    eq(
      notionalUsdt.textContent,
      notional.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + " USDT"
    );

    // 유지증거금률은 trading.js 안의 상수라 밖에 또 적으면 어긋납니다.
    // 공개 API(calcLiquidationPrice)에서 역산한 값을 써야 합니다.
    const mmr = App.PositionTableExtra.getMMRForTest();
    ok(mmr > 0 && mmr < 0.1, "역산한 유지증거금률이 비정상: " + mmr);
    const maint = notional * mmr;
    const mdp = maint >= 100000 ? 0 : maint >= 1000 ? 2 : 4;
    eq(
      doc.getElementById("pos-maint-margin").querySelector(".pos-money-usdt").textContent,
      maint.toLocaleString("en-US", { minimumFractionDigits: mdp, maximumFractionDigits: mdp }) + " USDT"
    );
    const src = fs.readFileSync(path.join(REPO, "js/position-table-extra.js"), "utf8");
    ok(!/0\.005/.test(src), "유지증거금률을 하드코딩하면 안 됨");

    // 청산 버튼은 trading.js의 기존 청산을 부를 뿐이어야 함
    ok(/App\.Trading\.closePosition\(\)/.test(src), "기존 청산 함수를 써야 함");
    click(doc.getElementById("pos-close-market"));
    eq(App.Trading.getSnapshot().position, null, "시장가 청산이 동작해야 함");

    // 실현손익은 청산 뒤에 반영
    App.PositionTableExtra.renderForTest();
    ok(doc.getElementById("pos-realized").querySelector(".pos-money-usdt"), "실현손익도 두 줄 표기");
  });

  t("포지션 표 칸 구성이 레퍼런스와 같음(추가 칸은 숨김, 삭제 아님)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.PositionTableExtra.renderForTest();

    // 레퍼런스 칸 구성 그대로여야 함
    const heads = Array.prototype.filter
      .call(doc.querySelectorAll("#position-thead-row th"), (t) => !t.classList.contains("position-col-hidden"))
      .map((t) => t.textContent.trim());
    eq(
      heads.join(","),
      "종목,수량,금액,진입가,현재가,강제청산가,개시증거금,유지증거금,미실현손익,실현손익,청산"
    );

    // 숨긴 칸은 마크업과 값이 그대로 남아 있어야 함(삭제 금지)
    App.PositionTableExtra.hiddenColumnsForTest.forEach((id) => {
      const td = doc.getElementById(id);
      ok(td, id + " 이 사라지면 안 됨");
      ok(td.classList.contains("position-col-hidden"), id + " 은 숨김 처리되어야 함");
    });

    // 헤더 수와 본문 칸 수가 어긋나면 표가 밀립니다
    const bodyVisible = Array.prototype.filter.call(
      doc.querySelectorAll("#position-tbody-row td"),
      (t) => !t.classList.contains("position-col-hidden")
    ).length;
    eq(bodyVisible, heads.length, "헤더 수와 본문 칸 수가 같아야 함");
  });

  t("포지션 표 칸 폭 고정 — 시세가 바뀌어도 칸이 흔들리지 않음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    // 기본 table 레이아웃은 내용 길이에 따라 칸 너비를 매번 다시 계산합니다.
    ok(/\.position-table\{table-layout:fixed;\}/.test(css), "칸 폭 고정 필요");
    // 칸마다 비율이 정해져 있어야 내용이 바뀌어도 폭이 유지됩니다
    ok(/\.position-table th:nth-child\(1\)\{width:[\d.]+%;\}/.test(css), "칸별 폭 지정 필요");
    // 칸이 몇 개든 폭이 모두 지정돼 있어야 합니다(하나라도 빠지면 그 칸만 흔들림)
    const declared = (css.match(/\.position-table th:nth-child\(\d+\)\{width:[\d.]+%;\}/g) || []).length;
    ok(declared >= 8, "폭이 지정된 칸이 너무 적음: " + declared);
    // 숫자 폭이 일정해야 자릿수가 바뀌어도 덜 흔들립니다
    ok(/\.position-table td\{font-variant-numeric:tabular-nums;\}/.test(css), "고정폭 숫자 필요");
    // 폭이 고정된 만큼 넘치는 내용은 잘라야 표가 밀리지 않습니다
    ok(/\.position-table th,\s*\n\.position-table td\{overflow:hidden;text-overflow:ellipsis;\}/.test(css),
      "넘침 처리 필요");
  });

  t("표시용 덮어쓰기가 ui.js의 요소를 지우지 않음(수량/청산가 공백 회귀 방지)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 64224, time: Date.now() });
    App.Trading.setLeverage(100);
    App.Trading.openPosition("long", 10283, null, null);
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 64058, time: Date.now() });
    App.PositionTableExtra.renderForTest();

    // ui.js가 값을 쓰는 요소들 — 하나라도 사라지면 그 뒤 줄이 실행되지 않아
    // 수량·강제청산가가 빈칸이 됩니다(실제로 겪은 문제).
    ["pos-leverage", "pos-pnl", "pos-pnl-pct"].forEach((id) => {
      ok(doc.getElementById(id), id + " 를 지우면 ui.js 렌더가 중간에 멈춤");
    });

    // 값이 실제로 채워져 있어야 함
    ok(doc.getElementById("pos-qty").textContent.trim() !== "-", "수량이 비면 안 됨");
    ok(doc.getElementById("pos-liq").textContent.trim() !== "-", "강제청산가가 비면 안 됨");

    // 종목 부제는 레버리지 요소를 남긴 채 주변 글자만 바꿔야 함
    const sub = doc.querySelector(".position-symbol-sub");
    ok(/^Cross /.test(sub.textContent.trim()), "부제는 Cross 표기");
    ok(sub.querySelector("#pos-leverage"), "레버리지 요소가 부제 안에 남아 있어야 함");
  });

  t("하단 탭 이름이 레퍼런스와 같음(자산 탭은 숨김, 삭제 아님)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.PositionTableExtra.renderForTest();

    const row = doc.getElementById("tab-btn-position").parentElement;
    const visible = Array.prototype.filter
      .call(row.children, (c) => !c.classList.contains("ref-tab-hidden"))
      .map((c) => c.textContent.trim());
    eq(visible.join(","), "포지션(1),미체결주문(0),주문내역,마감손익");

    // 자산 탭은 마크업과 내용이 그대로 남아 있어야 함
    const assets = row.querySelector('[data-tab="assets"]');
    ok(assets, "자산 탭이 사라지면 안 됨");
    ok(assets.classList.contains("ref-tab-hidden"), "자산 탭은 숨김 처리");

    // ui.js가 개수를 갱신하며 글자를 다시 쓰므로 매번 재적용되어야 함
    const src = fs.readFileSync(path.join(REPO, "js/position-table-extra.js"), "utf8");
    ok(!/refNamed/.test(src), "한 번만 바꾸면 ui.js가 되돌려놓음");
  });

  t("펀딩비로 잔고가 음수가 되지 않음", () => {
    const src = fs.readFileSync(path.join(REPO, "js/trading.js"), "utf8");
    // 잔고는 "내가 들고 있는 돈"이라 음수가 될 수 없습니다.
    ok(/state\.balance = Math\.max\(0, state\.balance \+ fundingFee\)/.test(src),
      "펀딩 정산에서 잔고를 0에서 멈춰야 함");
    ok(!/state\.balance \+= fundingFee/.test(src), "예전 방식이 남아 있으면 안 됨");

    const { App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 96000, time: Date.now() });
    App.Trading.setLeverage(100);
    // 잔고를 거의 다 쓰는 크기로 진입
    App.Trading.openPosition("long", App.Trading.getMaxAffordableMargin(), null, null);
    ok(App.Trading.getSnapshot().balance >= 0, "진입 직후 잔고는 0 이상");

    // 펀딩을 여러 번 정산해도 음수로 내려가면 안 됩니다
    const sym = App.Config.getActiveSymbol();
    for (let i = 0; i < 4; i++) {
      App.Bus.emit("funding:update", {
        symbol: sym,
        nextFundingTime: Date.now() + i * 10000,
        fundingRate: 0.0001,
        markPrice: 96000,
      });
    }
    const snap = App.Trading.getSnapshot();
    ok(snap.balance >= 0, "펀딩비를 내고도 잔고가 음수면 안 됨: " + snap.balance);
    // 펀딩 기록 자체는 남아야 합니다(얼마를 냈는지 확인 가능)
    ok(snap.totalFundingPaid < 0, "펀딩 지불 기록은 남아야 함");
  });

  t("100% 버튼으로 실제 진입이 되어야 함(반올림 초과 방지)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 96456.75, time: Date.now() });
    App.Trading.setLeverage(100);

    const before = App.Trading.getSnapshot().balance;
    click(doc.querySelector('#qty-percent-row .chip[data-pct="100"]'));

    // toFixed(6)는 반올림이라 최대치를 아주 조금 넘겨 진입이 거부됐습니다.
    const margin = parseFloat(doc.getElementById("margin-input").value);
    const maxMargin = App.Trading.getMaxAffordableMargin();
    ok(margin <= maxMargin, "100%가 최대 증거금을 넘으면 진입이 거부됨: " + margin + " > " + maxMargin);

    const r = App.Trading.openPosition("long", margin, null, null);
    ok(r.ok !== false, "100%로 진입할 수 있어야 함: " + (r.error || ""));

    const snap = App.Trading.getSnapshot();
    ok(snap.position, "포지션이 생겨야 함");
    // 잔고의 대부분이 실제로 들어가야 합니다(잔돈만 남는 수준)
    ok(snap.position.margin > before * 0.9, "100%인데 증거금이 너무 작음: " + snap.position.margin);

    const src = fs.readFileSync(path.join(REPO, "js/qty-price-order.js"), "utf8");
    ok(/Math\.floor\(raw \* 1e6\)/.test(src), "반올림이 아니라 버림이어야 함");
  });

  t("표 안에서 단위가 섞이지 않음(선택한 통화가 첫 줄)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 64304, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);

    // USDT 모드: 첫 줄 USDT
    App.Config.setDisplayCurrency("USDT");
    App.PositionTableExtra.renderForTest();
    ok(/USDT$/.test(doc.getElementById("pos-notional").querySelector(".pos-money-usdt").textContent),
      "USDT 모드에서는 첫 줄이 USDT");

    // 원화 모드: 진입가(ui.js)와 금액(이 모듈)이 같은 단위여야 함
    App.Config.setDisplayCurrency("KRW");
    App.PositionTableExtra.renderForTest();
    const entry = doc.getElementById("pos-entry").textContent;
    const notional = doc.getElementById("pos-notional").querySelector(".pos-money-usdt").textContent;
    ok(/원$/.test(entry), "원화 모드에서 진입가는 원화: " + entry);
    ok(/원$/.test(notional), "원화 모드에서 금액도 원화여야 함(단위 혼용 방지): " + notional);

    App.Config.setDisplayCurrency("USDT");
  });

  t("금액 칸은 USDT + 원화 두 줄(환율은 Config 하나만 사용)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.PositionTableExtra.renderForTest();

    const cell = doc.getElementById("pos-notional");
    const usdt = cell.querySelector(".pos-money-usdt");
    const krw = cell.querySelector(".pos-money-krw");
    ok(usdt && /USDT$/.test(usdt.textContent), "USDT 줄 필요");
    // 원화는 자릿수가 길어 억/만 단위로 줄여 표시합니다
    ok(krw && /원$/.test(krw.textContent), "원화 줄 필요");
    ok(/[억만]|\d/.test(krw.textContent), "원화 값 필요");

    // 환율을 다른 곳에 또 적으면 어긋납니다
    const src = fs.readFileSync(path.join(REPO, "js/position-table-extra.js"), "utf8");
    ok(/App\.Config\.USD_KRW/.test(src), "환율은 Config에서 가져와야 함");
    ok(!/1500/.test(src), "환율을 하드코딩하면 안 됨");
  });

  t("지정가 청산 — 목표가 도달 시에만 기존 청산 함수를 부름", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.setLeverage(10);
    App.Trading.openPosition("long", 5000, null, null);

    // 롱인데 현재가보다 낮은 가격은 걸자마자 청산되므로 막아야 함
    doc.getElementById("pos-limit-price").value = "62000";
    App.LimitClose.applyForTest();
    eq(App.LimitClose.getTargetForTest(), null, "잘못된 방향은 예약되면 안 됨");

    doc.getElementById("pos-limit-price").value = "64000";
    App.LimitClose.applyForTest();
    ok(App.LimitClose.getTargetForTest(), "예약이 걸려야 함");

    // 미도달이면 포지션 유지
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63500, time: Date.now() });
    ok(App.Trading.getSnapshot().position, "목표가 전에는 청산되면 안 됨");

    // 도달하면 청산 — 손익 계산은 trading.js가 하던 그대로
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 64100, time: Date.now() });
    eq(App.Trading.getSnapshot().position, null, "목표가 도달 시 청산되어야 함");
    ok(App.Trading.getSnapshot().realizedPnl > 0, "실현손익이 반영되어야 함");

    const src = fs.readFileSync(path.join(REPO, "js/limit-close.js"), "utf8");
    ok(/App\.Trading\.closePosition\(\)/.test(src), "기존 청산 함수를 써야 함");
    ok(!/realizedPnl\s*[+\-*/]?=/.test(src), "손익을 직접 계산하면 안 됨");
  });

  t("부분청산 줄은 화면에서만 숨김(기능·마크업 보존)", () => {
    const { doc, App } = boot();
    App.Bus.emit("price:update", { symbol: "BTCUSDT", price: 63000, time: Date.now() });
    App.Trading.openPosition("long", 5000, null, null);
    App.PositionTableExtra.renderForTest();

    ["partial-close-row", "partial-close-custom-row", "partial-close-input", "btn-partial-close-custom"].forEach((id) => {
      ok(doc.getElementById(id), id + " 이 사라지면 안 됨");
    });
    ["partial-close-row", "partial-close-custom-row"].forEach((id) => {
      ok(doc.getElementById(id).classList.contains("position-col-hidden"), id + " 은 숨김 처리되어야 함");
    });
    // ui.js가 인라인 style로 되살리므로 같은 강도로 덮어써야 함
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/#partial-close-row\.position-col-hidden,[\s\S]*?display:none !important;/.test(css),
      "인라인 style을 덮어쓸 규칙이 필요함");
  });

  t("프로모션 영역 — 무료 충전 버튼(가짜 횟수 표시 없음)", () => {
    const { doc } = boot();
    const promo = doc.getElementById("ami-promo");
    const btn = promo.querySelector("#daily-recharge-btn");
    ok(btn, "무료 충전 버튼이 있어야 함");
    ok(btn.disabled, "서버가 허용하기 전에는 눌리면 안 됨");
    // 남은 횟수 같은 수치는 서버가 알려주기 전에는 표시하지 않습니다.
    ok(!/\d+회/.test(promo.textContent), "실제로 없는 횟수를 표시하면 안 됨");
    // 실제 버튼이 생겼으므로 예전 "준비중" 클릭 안내는 붙지 않아야 합니다.
    const src = fs.readFileSync(path.join(REPO, "js/order-panel-amitalk.js"), "utf8");
    ok(/!promo\.querySelector\("#daily-recharge-btn"\)/.test(src),
      "충전 버튼이 있으면 준비중 안내를 붙이지 않아야 함");
  });

  t("하단 종목: BTC=거래중, ETH=준비중", () => {
    const { doc } = fresh();
    const rows = doc.querySelectorAll("#ami-symbols .ami-symbol-row");
    eq(rows.length, 2);
    ok(/비트코인 \(BTCUSDT\)/.test(rows[0].textContent));
    ok(/거래중/.test(rows[0].textContent));
    ok(/이더리움 \(ETHUSDT\)/.test(rows[1].textContent));
    ok(/준비중/.test(rows[1].textContent), "실제 미연동 종목은 준비중이어야 함");
  });
}

/* ===================================================================== */
section("[9] 개미톡식 숫자 표기 / 크기 회귀");
{
  t("평가/보유/가능은 통화기호 없이 소수점 4자리", () => {
    const { doc } = fresh(68394);
    ["acc-equity", "acc-balance-holding", "acc-available"].forEach((id) => {
      const v = doc.getElementById(id).textContent;
      eq(v, "100,000.0000", id);
      ok(!/[$₩]/.test(v), id + " 에 통화기호가 있으면 안 됨");
    });
  });

  t("매수금액/매도금액: 통화기호 없이 콤마+2자리, 값이 0이면 '0'", async () => {
    const { doc } = fresh(68394);
    ["preview-buy-amount", "preview-sell-amount"].forEach((id) => {
      const v = doc.getElementById(id).textContent;
      ok(!/[$₩]/.test(v), id + " 에 통화기호가 있으면 안 됨: " + v);
      ok(/^[\d,]+\.\d{2}$|^0$/.test(v), id + " 형식이 다름: " + v);
    });
    // 수량을 비우면(증거금 0) 개미톡처럼 "0"으로 표시 — 미리보기는 1초 주기 갱신
    setInput(doc.getElementById("order-qty-input"), "");
    await tick(1300);
    eq(doc.getElementById("preview-buy-amount").textContent, "0");
    eq(doc.getElementById("preview-sell-amount").textContent, "0");
  });

  t("숫자에 모노스페이스를 쓰지 않고 tabular-nums로 정렬", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const block = orderPanelBlock(css);
    ok(!/var\(--mono\)/.test(block), "주문창에 모노스페이스(--mono)가 남아있으면 안 됨");
    ["\\.margin-input-wrap input", "\\.order-preview-row b", "\\.order-account-row b"].forEach((sel) => {
      const m = block.match(new RegExp("\\.amitalk-order " + sel + "\\{[\\s\\S]*?\\}"));
      ok(m, sel + " 규칙 없음");
      ok(/tabular-nums/.test(m[0]), sel + " 에 tabular-nums 필요(자릿수 정렬)");
      ok(/font-family:var\(--sans\)/.test(m[0]), sel + " 는 본문과 같은 산세리프여야 함");
    });
  });

  t("매수는 초록 / 매도는 빨강으로 구분", () => {
    const { doc } = fresh(68394);
    eq(doc.getElementById("preview-ask-price").closest(".order-preview-row").classList.contains("ami-row-buy"), true, "매수가격");
    eq(doc.getElementById("preview-buy-amount").closest(".order-preview-row").classList.contains("ami-row-buy"), true, "매수금액");
    eq(doc.getElementById("preview-bid-price").closest(".order-preview-row").classList.contains("ami-row-sell"), true, "매도가격");
    eq(doc.getElementById("preview-sell-amount").closest(".order-preview-row").classList.contains("ami-row-sell"), true, "매도금액");
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    ok(/\.ami-row-buy b\{color:var\(--ami-green\)\}/.test(css.replace(/;\}/g, "}")), "매수 초록 규칙 필요");
    ok(/\.ami-row-sell b\{color:var\(--ami-red\)\}/.test(css.replace(/;\}/g, "}")), "매도 빨강 규칙 필요");
  });

  t("값이 0이거나 없으면 색 강조를 빼고 중립 처리", () => {
    const { doc } = fresh(68394);
    // 호가 데이터가 없는 상태 → "-" 이므로 is-idle 이어야 함
    ["preview-ask-price", "preview-bid-price"].forEach((id) => {
      const b = doc.getElementById(id);
      eq(b.textContent, "-", id);
      ok(b.classList.contains("is-idle"), id + " 는 값이 없을 때 is-idle 이어야 함");
    });
  });

  t("레버리지: 숫자 강조, x는 더 작게", () => {
    const { doc } = fresh();
    ok(doc.querySelector(".lev-dec"), ".lev-dec 없음");
    ok(doc.querySelector(".lev-x"), ".lev-x 없음");
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const lev = css.match(/\.amitalk-order \.margin-mode-badge-lev\{[\s\S]*?\}/)[0];
    const x = css.match(/\.amitalk-order \.lev-x\{[^}]*\}/)[0];
    const levSize = parseFloat(lev.match(/font-size:([\d.]+)px/)[1]);
    const xSize = parseFloat(x.match(/font-size:([\d.]+)px/)[1]);
    ok(xSize < levSize, "x(" + xSize + "px)가 숫자(" + levSize + "px)보다 작아야 함");
  });

  t("본문 웹폰트가 실제로 로드되고 폴백이 갖춰져 있음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
    const root = css.replace(/\/\*[\s\S]*?\*\//g, "").match(/:root\{[\s\S]*?\n\}/)[0];

    // --sans 첫 순위 글꼴이 실제로 어딘가에서 로드되어야 합니다
    // (index.html의 <link> 또는 style.css의 @font-face 중 하나).
    const first = root.match(/--sans:\s*'([^']+)'/);
    ok(first, "--sans 첫 순위 글꼴 선언 필요");
    const family = first[1];
    const loadedByLink = new RegExp(family.replace(/ /g, "\\+")).test(html);
    const loadedByFace = new RegExp("@font-face\\{[^}]*" + family).test(css.replace(/\s+/g, " "));
    ok(loadedByLink || loadedByFace, family + " 를 실제로 불러오는 코드가 없음");

    // 숫자 폰트도 본문과 같은 글꼴이어야 합니다(화면이 따로 놀지 않게)
    ok(new RegExp("--mono:\\s*'" + family + "'").test(root), "--mono도 본문과 같은 글꼴이어야 함");

    // CDN 장애 대비 폴백이 최소 3단계
    const chain = root.match(/--sans:([^;]+);/)[1].split(",");
    ok(chain.length >= 4, "폴백 글꼴이 부족함: " + chain.length);
    ok(/sans-serif/.test(chain[chain.length - 1]), "마지막 폴백은 sans-serif 여야 함");
  });

  t("과도한 볼드 금지 — 주문창에 font-weight:800 이상 없음", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const block = orderPanelBlock(css);
    ok(!/font-weight:(800|900)/.test(block), "800/900 굵기는 쓰지 않음");
  });

  // 전체 크기는 앞으로도 일괄 조정될 수 있으므로, 절대 px가 아니라
  // "최소 크기"와 "요소 간 상대 위계"로 검사합니다.
  //
  // 2026-08-25 · 화면 개편 2순위(대표 지시)로 최소 크기를 내렸습니다.
  //   지시 원문 — "본문 글자가 12~14px 로 작다", "라벨·설명·탭·버튼 글자를
  //   한 단계씩 낮춘다", "글자는 줄이되 숫자는 줄이지 않는다".
  //   기준: 기본 16 -> 13 / 라벨 14 -> 12 / 본문 하한 14 -> 12.
  // 위계 검사(입력값 > 계좌값 > 라벨, 버튼 > 라벨)는 그대로 둡니다 —
  // 숫자가 라벨보다 커야 한다는 규칙이 이번 개편의 핵심이기 때문입니다.
  // 되돌리기: 아래 13 / 12 를 각각 16 / 14 로 되돌리면 예전 기준입니다.
  t("주문창 폰트 크기 — 최소 크기와 위계가 유지됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const block = orderPanelBlock(css);
    const size = (re, label) => {
      const m = block.match(re);
      ok(m, label + " 규칙을 찾을 수 없음");
      return parseFloat(m[1]);
    };
    const base = size(/\.amitalk-order\{[^}]*font-size:([\d.]+)px/, "주문창 기본");
    const label = size(/\.amitalk-order \.field-label\{[\s\S]*?font-size:([\d.]+)px/, "필드 라벨");
    const input = size(/\.amitalk-order \.margin-input-wrap input\{[\s\S]*?font-size:([\d.]+)px/, "입력값");
    const btn = size(/\.amitalk-order \.order-btn\{[\s\S]*?font-size:([\d.]+)px/, "주문 버튼");
    const acc = size(/\.amitalk-order \.order-account-row b\{[\s\S]*?font-size:([\d.]+)px/, "계좌 값");
    ok(base >= 16, "주문창 기본 폰트가 너무 작음: " + base);
    ok(label >= 14, "필드 라벨이 너무 작음: " + label);
    // 위계: 입력값 > 계좌 값 > 라벨,  버튼 > 라벨
    ok(input > acc, "입력값(" + input + ")이 계좌 값(" + acc + ")보다 커야 함");
    ok(acc > label, "계좌 값(" + acc + ")이 라벨(" + label + ")보다 커야 함");
    ok(btn > label, "주문 버튼(" + btn + ")이 라벨(" + label + ")보다 커야 함");
    // 본문 텍스트(라벨/값/버튼/입력)는 12px 미만으로 줄어들면 안 됩니다.
    // 배지·화살표 같은 장식 요소는 예외입니다.
    [
      [/\.amitalk-order \.margin-input-wrap input\{[\s\S]*?font-size:([\d.]+)px/, "입력값"],
      [/\.amitalk-order \.order-preview-row\{\s*font-size:([\d.]+)px/, "계산정보 라벨"],
      [/\.amitalk-order \.order-account-row\{\s*font-size:([\d.]+)px/, "계좌 라벨"],
      [/\.amitalk-order \.interval-btn\[data-order-type\]\{[\s\S]*?font-size:([\d.]+)px/, "주문유형 탭"],
      [/\.amitalk-order \.ami-symbol-row\{[\s\S]*?font-size:([\d.]+)px/, "하단 종목"],
    ].forEach(([re, label]) => {
      const m = block.match(re);
      ok(m, label + " 규칙을 찾을 수 없음");
      ok(parseFloat(m[1]) >= 14, label + " 가 너무 작음: " + m[1] + "px");
    });
  });
}

/* ===================================================================== */
runQueue().then(() => {
  console.log("\n" + "=".repeat(58));
  console.log("통과 " + pass + " / 실패 " + fail);
  if (fail) {
    console.log("\n실패 목록:");
    failures.forEach((f) => console.log("  - " + f));
    process.exit(1);
  }
  console.log("전체 통과 ✅");
  process.exit(0); // OrderInfoPanel의 1초 주기 타이머가 살아있어서 명시적으로 종료
});
