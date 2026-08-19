/* =========================================================================
 * js/tl-market.js — App.TLMarket
 * =========================================================================
 * TL 마켓 — 모의투자 아이템 상점 + 아이템 보관함.
 *
 * ── 핫딜과의 관계 ───────────────────────────────────────────────────────
 *  핫딜 : 실제 상품권. tl_products / tl_purchases
 *  마켓 : 모의투자 아이템. tl_market_products / user_items / item_usage_logs
 *  TL 잔액과 거래내역은 둘이 같은 것을 씁니다(tl_balance_info, tl_transactions).
 *
 * ── 이 파일이 하지 않는 일 ──────────────────────────────────────────────
 *  · TL 을 깎지 않습니다.
 *  · 아이템 수량을 줄이지 않습니다.
 *  · 가격/재고/구매제한/효과를 판정하지 않습니다.
 * 전부 서버(purchase_tl_market_item / use_user_item)가 합니다.
 * 여기서 하는 검사는 서버에 묻기 전 안내일 뿐이고, 최종 판정은 서버 결과입니다.
 *
 * ── 구매와 사용은 분리 ──────────────────────────────────────────────────
 *  구매 -> TL 차감 -> 보관함에 쌓임 (효과 없음)
 *  사용 -> 수량 -1 -> 효과 적용    (TL 차감 없음)
 * ========================================================================= */

window.App = window.App || {};

App.TLMarket = (function () {
  "use strict";

  var CATEGORIES = [
    { id: "all", label: "전체" },
    { id: "leverage", label: "⚡ 레버리지" },
    { id: "seed", label: "💰 자금/시드" },
    { id: "position", label: "👁 포지션" },
    { id: "trade", label: "🛡 거래/보호" },
    { id: "etc", label: "🎁 기타" },
  ];

  var state = {
    products: [],
    items: [],
    balance: null,
    effects: null,
    txs: [],
    category: "all",
    search: "",
    sort: "popular",
    view: "shop", // shop | bag | tx
    loading: false,
    error: null,
  };

  var dom = {};

  function el(id) { return document.getElementById(id); }
  function sb() { return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null; }
  function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }
  function num(n) { return Math.round(Number(n) || 0).toLocaleString("ko-KR"); }
  function tl(n) { return num(n) + " TL"; }

  /* =======================================================================
   * 순수 함수 — 화면 없이 테스트할 수 있게 분리
   * ======================================================================= */

  function filterProducts(products, opts) {
    var o = opts || {};
    var q = String(o.search || "").trim().toLowerCase();
    return (products || []).filter(function (p) {
      if (p.is_visible === false) return false;
      if (o.category && o.category !== "all" && p.category !== o.category) return false;
      if (q) {
        var hay = (String(p.name || "") + " " + String(p.description || "")).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
  }

  function sortProducts(products, mode) {
    var list = (products || []).slice();
    function price(p) { return Number(p.tl_price) || 0; }
    if (mode === "tl-asc") list.sort(function (a, b) { return price(a) - price(b); });
    else if (mode === "tl-desc") list.sort(function (a, b) { return price(b) - price(a); });
    else if (mode === "new") list.sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
    else list.sort(function (a, b) {
      var d = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
      return d !== 0 ? d : price(a) - price(b);
    });
    return list;
  }

  /* 상품 상태 -> 화면 표시 */
  function statusInfo(product) {
    var st = product.status;
    if (st === "paused") return { buyable: false, label: "판매 준비중", badge: "판매 준비중" };
    if (st === "ended") return { buyable: false, label: "판매 종료", badge: "판매 종료" };
    if (st === "soldout") return { buyable: false, label: "품절", badge: "품절" };
    if (product.stock !== null && product.stock !== undefined && Number(product.stock) <= 0) {
      return { buyable: false, label: "품절", badge: "품절" };
    }
    return { buyable: true, label: "구매하기", badge: null };
  }

  /* 구매 전 안내용 검사 — 서버와 같은 순서 */
  function checkPurchase(product, quantity, balance, alreadyOwned) {
    var q = Number(quantity) || 0;
    var bal = Number(balance);
    if (!product) return { ok: false, code: "no_product", message: "상품을 찾을 수 없습니다." };
    if (q < 1) return { ok: false, code: "bad_quantity", message: "수량을 확인해주세요." };
    var st = statusInfo(product);
    if (!st.buyable) return { ok: false, code: "not_on_sale", message: st.label + "인 상품입니다." };
    if (product.stock !== null && product.stock !== undefined && q > Number(product.stock)) {
      return { ok: false, code: "out_of_stock", message: "남은 수량보다 많이 구매할 수 없습니다." };
    }
    if (product.max_purchase !== null && product.max_purchase !== undefined) {
      if ((Number(alreadyOwned) || 0) + q > Number(product.max_purchase)) {
        return { ok: false, code: "limit_exceeded", message: "1인 구매 한도를 초과했습니다." };
      }
    }
    var total = (Number(product.tl_price) || 0) * q;
    if (!isFinite(bal)) return { ok: false, code: "unknown_balance", message: "보유 TL을 확인하지 못했습니다." };
    if (bal < total) {
      return { ok: false, code: "insufficient_tl", message: "TL이 부족합니다.", need: total, have: bal, short: total - bal };
    }
    return { ok: true, total: total, balanceAfter: bal - total };
  }

  /* 기간제 아이템이 지금 켜져 있는지 */
  function activeEffect(effects, itemType) {
    if (!effects || !effects.timed) return null;
    var now = Date.now();
    var found = null;
    effects.timed.forEach(function (e) {
      if (e.item_type !== itemType) return;
      var t = new Date(e.expires_at).getTime();
      if (t > now && (!found || t > new Date(found.expires_at).getTime())) found = e;
    });
    return found;
  }

  function remainText(expiresAt) {
    var ms = new Date(expiresAt).getTime() - Date.now();
    if (!isFinite(ms) || ms <= 0) return "만료됨";
    var h = Math.floor(ms / 3600000);
    var m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? h + "시간 " + m + "분 남음" : m + "분 남음";
  }

  function durationText(product) {
    if (product.duration_hours) return product.duration_hours + "시간";
    return "1회 사용";
  }

  function describeServerError(message) {
    var m = String(message || "");
    if (/not_logged_in/.test(m)) return "로그인 후 이용할 수 있습니다.";
    if (/insufficient_tl/.test(m)) return "TL이 부족합니다.";
    if (/out_of_stock/.test(m)) return "재고가 부족합니다.";
    if (/limit_exceeded/.test(m)) return "1인 구매 한도를 초과했습니다.";
    if (/not_on_sale/.test(m)) return "지금 구매할 수 없는 상품입니다.";
    if (/no_product/.test(m)) return "상품을 찾을 수 없습니다.";
    if (/no_item/.test(m)) return "보유하지 않은 아이템입니다.";
    if (/already_active/.test(m)) return "이미 사용 중인 아이템입니다. 끝난 뒤에 다시 사용해주세요.";
    if (/has_position/.test(m)) return "포지션을 정리한 뒤에 사용할 수 있습니다.";
    if (/bad_quantity/.test(m)) return "수량을 확인해주세요.";
    if (/PGRST202|could not find the function|does not exist|schema cache/i.test(m)) {
      return "서버 설정이 아직 적용되지 않았습니다. (schema-tl-market.sql 실행 필요)";
    }
    return "처리에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  /* =======================================================================
   * 서버에서 받아오기
   * ======================================================================= */

  function rpc(name) {
    var client = sb();
    if (!client) return Promise.resolve(null);
    return Promise.resolve(client.rpc(name)).then(function (r) {
      if (r.error) throw r.error;
      return r.data;
    });
  }

  function loadAll() {
    var client = sb();
    if (!client) return Promise.resolve([[], [], null, null, []]);
    return Promise.all([
      Promise.resolve(client.from("tl_market_products").select("*").order("sort_order", { ascending: true }))
        .then(function (r) { if (r.error) throw r.error; return r.data || []; }),
      Promise.resolve(client.from("user_items").select("*"))
        .then(function (r) { return r.error ? [] : (r.data || []); }),
      rpc("tl_balance_info"),
      rpc("active_user_effects"),
      Promise.resolve(client.from("tl_transactions").select("*").order("created_at", { ascending: false }).limit(50))
        .then(function (r) { return r.error ? [] : (r.data || []); }),
    ]);
  }

  function refresh() {
    if (!dom.grid) return Promise.resolve();
    state.loading = true;
    state.error = null;
    render();
    return loadAll()
      .then(function (r) {
        state.products = r[0];
        state.items = r[1];
        state.balance = r[2];
        state.effects = r[3];
        state.txs = r[4];
        state.loading = false;
        render();
      })
      .catch(function (e) {
        state.loading = false;
        state.error = describeServerError(e && e.message);
        console.warn("[tl-market.js] 불러오기 실패:", e);
        render();
      });
  }

  function ownedQty(productId) {
    var n = 0;
    (state.items || []).forEach(function (it) {
      if (it.product_id === productId) n = Number(it.quantity) || 0;
    });
    return n;
  }

  /* =======================================================================
   * 구매 / 사용
   * ======================================================================= */

  function openConfirm(product, quantity) {
    var bal = state.balance ? Number(state.balance.balance) : NaN;
    var pre = checkPurchase(product, quantity, bal, ownedQty(product.id));

    if (!pre.ok) {
      if (pre.code === "insufficient_tl") {
        alert(
          "TL이 부족합니다.\n\n" +
            "보유 TL   " + tl(pre.have) + "\n" +
            "필요 TL   " + tl(pre.need) + "\n" +
            "부족한 TL " + tl(pre.short) + "\n\n" +
            "매매로 TL을 더 모아주세요."
        );
        return;
      }
      alert(pre.message);
      return;
    }

    var ok = confirm(
      "상품 구매\n\n" +
        product.name + "\n\n" +
        "필요 TL      " + tl(pre.total) + "\n" +
        "현재 보유 TL " + tl(bal) + "\n" +
        "구매 후 잔액 " + tl(pre.balanceAfter) + "\n" +
        "사용기간     " + durationText(product) + "\n" +
        "수량         " + quantity + "개\n\n" +
        "정말 구매하시겠습니까?"
    );
    if (!ok) return;

    var client = sb();
    if (!client) { alert("로그인 후 이용할 수 있습니다."); return; }
    Promise.resolve(client.rpc("purchase_tl_market_item", { p_product_id: product.id, p_quantity: quantity }))
      .then(function (res) {
        if (res.error) throw res.error;
        var d = res.data || {};
        alert(
          "🎉 구매 완료!\n\n" +
            product.name + "이(가) 아이템 보관함에 지급되었습니다.\n\n" +
            "사용 TL  " + tl(d.spent) + "\n" +
            "남은 TL  " + tl(d.balance_after) + "\n" +
            "보유 수량 " + d.quantity + "개\n\n" +
            "보관함에서 [사용하기]를 눌러야 효과가 적용됩니다."
        );
        return refresh();
      })
      .catch(function (e) {
        alert(describeServerError(e && e.message));
        console.warn("[tl-market.js] 구매 실패:", e);
        refresh();
      });
  }

  function useItem(item) {
    var ok = confirm(
      item.product_name + " 을(를) 사용하시겠습니까?\n\n" +
        (item.duration_hours ? "사용 후 " + item.duration_hours + "시간 동안 적용됩니다.\n" : "1회 사용됩니다.\n") +
        "보유 수량 " + item.quantity + "개 → " + (item.quantity - 1) + "개"
    );
    if (!ok) return;

    var client = sb();
    if (!client) { alert("로그인 후 이용할 수 있습니다."); return; }
    Promise.resolve(client.rpc("use_user_item", { p_product_id: item.product_id }))
      .then(function (res) {
        if (res.error) throw res.error;
        var d = res.data || {};
        var msg = item.product_name + " 을(를) 사용했습니다.";
        if (d.expires_at) msg += "\n\n" + remainText(d.expires_at) + " 동안 적용됩니다.";
        if (d.balance !== null && d.balance !== undefined) {
          msg += "\n\n계정 잔고: " + num(d.balance) + " USDT";
        }
        alert(msg);
        /* 잔고가 바뀌는 아이템은 trading.js 가 읽는 저장값도 맞춰줍니다
           (js/daily-recharge.js 가 쓰는 방식과 동일). */
        if (d.balance !== null && d.balance !== undefined && App.Storage) {
          try {
            var saved = App.Storage.load("trading") || {};
            saved.balance = Number(d.balance);
            App.Storage.save("trading", saved);
            window.location.reload();
            return;
          } catch (e) {
            console.warn("[tl-market.js] 잔고 반영 실패:", e);
          }
        }
        return refresh();
      })
      .catch(function (e) {
        alert(describeServerError(e && e.message));
        console.warn("[tl-market.js] 사용 실패:", e);
        refresh();
      });
  }

  /* =======================================================================
   * 그리기
   * ======================================================================= */

  function chipRow(node, items, activeId, onPick) {
    if (!node) return;
    node.innerHTML = items.map(function (c) {
      return '<button type="button" class="hd-chip' + (c.id === activeId ? " active" : "") +
        '" data-id="' + esc(c.id) + '">' + esc(c.label) + "</button>";
    }).join("");
    node.querySelectorAll(".hd-chip").forEach(function (btn) {
      btn.addEventListener("click", function () { onPick(btn.dataset.id); });
    });
  }

  function productCard(p) {
    var st = statusInfo(p);
    var owned = ownedQty(p.id);
    var thumb = p.image_url
      ? '<img class="hd-thumb-img" src="' + esc(p.image_url) + '" alt="' + esc(p.name) + '">'
      : '<span class="mk-icon">' + esc(p.icon || "🎁") + "</span>";

    var qtyOptions = "";
    var maxQty = p.stock === null || p.stock === undefined ? 10 : Math.max(1, Math.min(10, Number(p.stock)));
    for (var i = 1; i <= maxQty; i++) qtyOptions += '<option value="' + i + '">' + i + "개</option>";

    var action = st.buyable
      ? '<select class="hd-qty" data-id="' + esc(p.id) + '">' + qtyOptions + "</select>" +
        '<button type="button" class="hd-buy-btn mk-buy" data-id="' + esc(p.id) + '">구매하기</button>'
      : '<button type="button" class="hd-buy-btn" disabled>' + esc(st.label) + "</button>";

    return (
      '<article class="hd-card mk-card' + (st.buyable ? "" : " hd-card-out") + '">' +
      '<div class="hd-badges">' +
      (st.badge ? '<span class="hd-badge hd-badge-out">' + esc(st.badge) + "</span>" : "") +
      '<span class="hd-badge mk-badge-dur">' + esc(durationText(p)) + "</span>" +
      (owned ? '<span class="hd-badge mk-badge-own">보유 ' + owned + "개</span>" : "") +
      "</div>" +
      '<div class="hd-thumb mk-thumb">' + thumb + "</div>" +
      '<div class="hd-name">' + esc(p.name) + "</div>" +
      '<div class="mk-desc">' + esc(p.description || "") + "</div>" +
      '<div class="hd-tl-row"><b class="hd-tl">🔵 ' + esc(tl(p.tl_price)) + "</b></div>" +
      '<div class="hd-actions">' + action + "</div>" +
      "</article>"
    );
  }

  function bagCard(it) {
    var active = it.duration_hours ? activeEffect(state.effects, it.item_type) : null;
    var canUse = Number(it.quantity) > 0 && !active;
    var note = active
      ? '<div class="mk-desc">사용 중 · ' + esc(remainText(active.expires_at)) + "</div>"
      : '<div class="mk-desc">' + esc(it.duration_hours ? it.duration_hours + "시간 적용" : "1회 사용") + "</div>";

    return (
      '<article class="hd-card mk-card">' +
      '<div class="hd-badges">' +
      '<span class="hd-badge mk-badge-own">보유 ' + num(it.quantity) + "개</span>" +
      (active ? '<span class="hd-badge mk-badge-active">사용 중</span>' : "") +
      "</div>" +
      '<div class="hd-name">' + esc(it.product_name) + "</div>" +
      note +
      '<div class="hd-actions">' +
      (canUse
        ? '<button type="button" class="hd-buy-btn mk-use" data-id="' + esc(it.product_id) + '">사용하기</button>'
        : '<button type="button" class="hd-buy-btn" disabled>' + (active ? "사용 중" : "사용 불가") + "</button>") +
      "</div></article>"
    );
  }

  function renderBalance() {
    if (!dom.balance) return;
    var b = state.balance;
    if (!b || !b.logged_in) {
      dom.balance.textContent = "-";
      if (dom.balanceSub) dom.balanceSub.textContent = "로그인 후 확인할 수 있습니다";
      return;
    }
    dom.balance.textContent = tl(b.balance);
    if (dom.balanceSub) {
      /* 지급/환불(granted)이 있으면 같이 보여줍니다. 없으면 표시하지 않습니다
         — 서버가 안 주는 값을 지어내지 않습니다. */
      var parts = ["획득 " + tl(b.earned)];
      if (Number(b.granted)) parts.push("지급 " + tl(b.granted));
      parts.push("사용 " + tl(b.spent));
      dom.balanceSub.textContent = parts.join(" · ");
    }
  }

  function renderActive() {
    if (!dom.active) return;
    var timed = (state.effects && state.effects.timed) || [];
    var now = Date.now();
    var live = timed.filter(function (e) { return new Date(e.expires_at).getTime() > now; });
    if (!live.length) { dom.active.style.display = "none"; return; }
    dom.active.style.display = "";
    dom.active.innerHTML =
      '<span class="mk-active-label">적용 중인 효과</span>' +
      live.map(function (e) {
        return '<span class="mk-active-item">' + esc(labelForType(e.item_type)) +
          ' <b>' + esc(remainText(e.expires_at)) + "</b></span>";
      }).join("");
  }

  function labelForType(t) {
    for (var i = 0; i < state.products.length; i++) {
      if (state.products[i].item_type === t) return state.products[i].name;
    }
    return t;
  }

  function renderTx() {
    if (!dom.txBody) return;
    var rows = state.txs || [];
    if (!rows.length) {
      dom.txBody.innerHTML = '<tr class="empty"><td colspan="4">거래내역이 없습니다.</td></tr>';
      return;
    }
    dom.txBody.innerHTML = rows.map(function (r) {
      var d = new Date(r.created_at);
      var date = isNaN(d.getTime()) ? "-" :
        d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
      var amt = Number(r.amount) || 0;
      var cls = amt < 0 ? "mk-tx-minus" : "mk-tx-plus";
      return "<tr>" +
        '<td style="text-align:left;">' + esc(r.description || (amt < 0 ? "사용" : "지급")) + "</td>" +
        "<td>" + esc(date) + "</td>" +
        '<td class="' + cls + '">' + (amt < 0 ? "" : "+") + num(amt) + " TL</td>" +
        "<td>" + esc(tl(r.balance_after)) + "</td></tr>";
    }).join("");
  }

  function bindGrid(root, cls, handler) {
    if (!root) return;
    root.querySelectorAll("." + cls).forEach(function (btn) {
      btn.addEventListener("click", function () { handler(btn); });
    });
  }

  function render() {
    if (!dom.grid) return;

    chipRow(dom.categoryRow, CATEGORIES, state.category, function (id) {
      state.category = id;
      render();
    });
    renderBalance();
    renderActive();

    if (dom.shopSection) dom.shopSection.style.display = state.view === "shop" ? "" : "none";
    if (dom.bagSection) dom.bagSection.style.display = state.view === "bag" ? "" : "none";
    if (dom.txSection) dom.txSection.style.display = state.view === "tx" ? "" : "none";
    if (dom.filters) dom.filters.style.display = state.view === "shop" ? "" : "none";

    if (state.loading || state.error) {
      dom.grid.innerHTML = "";
      if (dom.empty) {
        dom.empty.style.display = "";
        dom.empty.textContent = state.error || "아이템을 불러오는 중…";
      }
      return;
    }

    var visible = sortProducts(
      filterProducts(state.products, { category: state.category, search: state.search }),
      state.sort
    );
    if (dom.count) dom.count.textContent = visible.length ? visible.length + "개" : "";
    dom.grid.innerHTML = visible.map(productCard).join("");
    bindGrid(dom.grid, "mk-buy", function (btn) {
      var p = null;
      for (var i = 0; i < state.products.length; i++) if (state.products[i].id === btn.dataset.id) p = state.products[i];
      if (!p) return;
      var sel = dom.grid.querySelector('.hd-qty[data-id="' + btn.dataset.id + '"]');
      openConfirm(p, sel ? parseInt(sel.value, 10) : 1);
    });
    if (dom.empty) {
      dom.empty.style.display = visible.length ? "none" : "";
      if (!visible.length) dom.empty.textContent = state.products.length ? "조건에 맞는 아이템이 없습니다." : "등록된 아이템이 없습니다.";
    }

    /* 보관함 */
    if (dom.bagGrid) {
      var owned = (state.items || []).filter(function (it) { return Number(it.quantity) > 0; });
      dom.bagGrid.innerHTML = owned.map(bagCard).join("");
      bindGrid(dom.bagGrid, "mk-use", function (btn) {
        var it = null;
        owned.forEach(function (x) { if (x.product_id === btn.dataset.id) it = x; });
        if (it) useItem(it);
      });
      if (dom.bagEmpty) {
        dom.bagEmpty.style.display = owned.length ? "none" : "";
        dom.bagEmpty.textContent = "보유한 아이템이 없습니다.";
      }
    }

    renderTx();
  }

  /* =======================================================================
   * 초기화
   * ======================================================================= */

  function setView(v) {
    state.view = v;
    [["shop", dom.tabShop], ["bag", dom.tabBag], ["tx", dom.tabTx]].forEach(function (pair) {
      if (pair[1]) pair[1].classList.toggle("active", state.view === pair[0]);
    });
    render();
  }

  function init() {
    dom = {
      grid: el("mk-grid"),
      empty: el("mk-empty"),
      count: el("mk-count"),
      balance: el("mk-balance"),
      balanceSub: el("mk-balance-sub"),
      categoryRow: el("mk-category-row"),
      search: el("mk-search"),
      sort: el("mk-sort"),
      active: el("mk-active"),
      filters: document.querySelector("#page-market .hd-filters"),
      shopSection: el("mk-shop-section"),
      bagSection: el("mk-bag-section"),
      bagGrid: el("mk-bag-grid"),
      bagEmpty: el("mk-bag-empty"),
      txSection: el("mk-tx-section"),
      txBody: el("mk-tx-body"),
      tabShop: el("mk-tab-shop"),
      tabBag: el("mk-tab-bag"),
      tabTx: el("mk-tab-tx"),
      tabHotdeal: el("mk-tab-hotdeal"),
    };
    if (!dom.grid) return;

    if (dom.search) dom.search.addEventListener("input", function () { state.search = dom.search.value; render(); });
    if (dom.sort) dom.sort.addEventListener("change", function () { state.sort = dom.sort.value; render(); });
    if (dom.tabShop) dom.tabShop.addEventListener("click", function () { setView("shop"); });
    if (dom.tabBag) dom.tabBag.addEventListener("click", function () { setView("bag"); });
    if (dom.tabTx) dom.tabTx.addEventListener("click", function () { setView("tx"); });
    if (dom.tabHotdeal) {
      dom.tabHotdeal.addEventListener("click", function () {
        if (App.PageNav && App.PageNav.showPage) App.PageNav.showPage("hotdeal");
      });
    }

    render();
    if (App.Bus && typeof App.Bus.on === "function") App.Bus.on("auth:changed", refresh);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return {
    init: init,
    refresh: refresh,
    render: render,
    filterProducts: filterProducts,
    sortProducts: sortProducts,
    statusInfo: statusInfo,
    checkPurchase: checkPurchase,
    activeEffect: activeEffect,
    durationText: durationText,
    describeServerError: describeServerError,
    CATEGORIES: CATEGORIES,
    _state: state,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.TLMarket;
