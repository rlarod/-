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
  "js/trading.js": "d507994799da3ec6b71225b53a365b21",
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

    // 금액 = 수량 × 현재가
    eq(doc.getElementById("pos-notional").textContent, App.Utils.formatCurrencyPlain(notional));

    // 유지증거금률은 trading.js 안의 상수라 밖에 또 적으면 어긋납니다.
    // 공개 API(calcLiquidationPrice)에서 역산한 값을 써야 합니다.
    const mmr = App.PositionTableExtra.getMMRForTest();
    ok(mmr > 0 && mmr < 0.1, "역산한 유지증거금률이 비정상: " + mmr);
    eq(doc.getElementById("pos-maint-margin").textContent, App.Utils.formatCurrencyPlain(notional * mmr));
    const src = fs.readFileSync(path.join(REPO, "js/position-table-extra.js"), "utf8");
    ok(!/0\.005/.test(src), "유지증거금률을 하드코딩하면 안 됨");

    // 청산 버튼은 trading.js의 기존 청산을 부를 뿐이어야 함
    ok(/App\.Trading\.closePosition\(\)/.test(src), "기존 청산 함수를 써야 함");
    click(doc.getElementById("pos-close-market"));
    eq(App.Trading.getSnapshot().position, null, "시장가 청산이 동작해야 함");

    // 실현손익은 청산 뒤에 반영
    App.PositionTableExtra.renderForTest();
    eq(doc.getElementById("pos-realized").textContent,
       App.Utils.formatCurrencySigned(App.Trading.getSnapshot().realizedPnl));
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
    const block = css.slice(css.indexOf("주문창(Order Panel)"));
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
    const block = css.slice(css.indexOf("주문창(Order Panel)"));
    ok(!/font-weight:(800|900)/.test(block), "800/900 굵기는 쓰지 않음");
  });

  // 전체 크기는 앞으로도 일괄 조정될 수 있으므로, 절대 px가 아니라
  // "최소 크기"와 "요소 간 상대 위계"로 검사합니다.
  t("주문창 폰트 크기 — 최소 크기와 위계가 유지됨", () => {
    const css = fs.readFileSync(path.join(REPO, "style.css"), "utf8");
    const block = css.slice(css.indexOf("주문창(Order Panel)"));
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
    // 본문 텍스트(라벨/값/버튼/입력)는 14px 미만으로 줄어들면 안 됩니다.
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
