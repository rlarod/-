/* =========================================================================
 * js/tl-hotdeal.js — App.TLHotdeal
 * =========================================================================
 * TL 핫딜 — 매매로 모은 TL 로 실제 상품권을 사는 화면.
 *
 * ── 이 파일이 하지 않는 일 ──────────────────────────────────────────────
 *  · TL 을 깎지 않습니다.
 *  · 재고를 줄이지 않습니다.
 *  · 잔액/가격/재고/구매제한을 판정하지 않습니다.
 * 전부 서버(supabase/schema-tl-hotdeal.sql 의 purchase_tl_product) 몫입니다.
 * 여기서 하는 검사는 "서버에 물어보기 전에 미리 알려주는 안내"일 뿐이고,
 * 최종 판정은 항상 서버 결과를 따릅니다. 개발자도구로 이 파일의 값을
 * 바꿔도 서버가 다시 계산하므로 구매가 되지 않습니다.
 *
 * ── 기존 시스템 재사용 ──────────────────────────────────────────────────
 *  · 로그인/사용자      App.SupabaseClient (auth)
 *  · 다크모드           html[data-theme] — 별도 처리 없음, CSS 만 대응
 *  · 페이지 전환        App.PageNav
 *  · 카드/버튼/표 스타일 기존 .panel / .data-table / 기존 색 변수
 *
 * ── 계급 점수와 보유 TL ─────────────────────────────────────────────────
 *  계급 점수 = 획득 TL (쓴다고 내려가지 않음)
 *  보유 TL   = 획득 TL - 사용 TL  ← 이 화면에서 쓰는 값
 * ========================================================================= */

window.App = window.App || {};

App.TLHotdeal = (function () {
  "use strict";

  var CATEGORIES = [
    { id: "all", label: "전체" },
    { id: "cafe", label: "☕ 카페" },
    { id: "delivery", label: "🍔 배달/외식" },
    { id: "meal", label: "🍕 식사" },
    { id: "shopping", label: "🛒 쇼핑" },
    { id: "life", label: "⛽ 생활" },
    { id: "etc", label: "🎁 기타" },
  ];

  /* 가격대 필터 — max 가 null 이면 상한 없음 */
  var PRICE_BANDS = [
    { id: "all", label: "전체", min: 0, max: null },
    { id: "5k", label: "5천원", min: 0, max: 7000 },
    { id: "10k", label: "1만원", min: 7001, max: 15000 },
    { id: "20k", label: "2만원", min: 15001, max: 25000 },
    { id: "30k", label: "3만원", min: 25001, max: 39000 },
    { id: "50k", label: "5만원", min: 39001, max: null },
  ];

  var LOW_STOCK = 3; // 이하이면 "마감 임박"

  /* 상품 이미지가 준비된 것만 화면에 내보냅니다(2026-08-18 지시).
     상품 데이터는 지우지 않습니다 — 이미지가 등록되면 자동으로 다시 보입니다.
     전부 보이게 하려면 이 값만 false 로 바꾸면 됩니다. */
  var SHOW_ONLY_WITH_IMAGE = true;

  function hasImage(product) {
    return !!(product && product.image_url && String(product.image_url).trim());
  }

  var state = {
    products: [],
    balance: null, // { logged_in, earned, spent, balance }
    myCounts: {}, // product_id -> 내가 이미 산 수량
    category: "all",
    band: "all",
    search: "",
    sort: "popular",
    view: "shop", // "shop" | "history"
    loading: false,
    error: null,
  };

  var dom = {};

  function el(id) {
    return document.getElementById(id);
  }
  function sb() {
    return App.SupabaseClient && App.SupabaseClient.get ? App.SupabaseClient.get() : null;
  }
  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }
  function num(n) {
    return Math.round(Number(n) || 0).toLocaleString("ko-KR");
  }
  function tl(n) {
    return num(n) + " TL";
  }
  function won(n) {
    return num(n) + "원";
  }

  /* =======================================================================
   * 순수 함수 — 화면과 무관하게 테스트할 수 있게 분리해 둡니다.
   * ======================================================================= */

  function matchesBand(product, bandId) {
    var band = null;
    for (var i = 0; i < PRICE_BANDS.length; i++) {
      if (PRICE_BANDS[i].id === bandId) band = PRICE_BANDS[i];
    }
    if (!band || band.id === "all") return true;
    var p = Number(product.price) || 0;
    if (p < band.min) return false;
    if (band.max !== null && p > band.max) return false;
    return true;
  }

  function matchesSearch(product, q) {
    if (!q) return true;
    var needle = String(q).trim().toLowerCase();
    if (!needle) return true;
    var hay = (String(product.brand || "") + " " + String(product.name || "")).toLowerCase();
    return hay.indexOf(needle) !== -1;
  }

  function filterProducts(products, opts) {
    var o = opts || {};
    var onlyWithImage = o.onlyWithImage === undefined ? SHOW_ONLY_WITH_IMAGE : o.onlyWithImage;
    return (products || []).filter(function (p) {
      if (onlyWithImage && !hasImage(p)) return false;
      if (o.category && o.category !== "all" && p.category !== o.category) return false;
      if (!matchesBand(p, o.band || "all")) return false;
      if (!matchesSearch(p, o.search)) return false;
      return true;
    });
  }

  function sortProducts(products, mode) {
    var list = (products || []).slice();
    function tlp(p) {
      return Number(p.tl_price) || 0;
    }
    if (mode === "tl-asc") {
      list.sort(function (a, b) { return tlp(a) - tlp(b); });
    } else if (mode === "tl-desc") {
      list.sort(function (a, b) { return tlp(b) - tlp(a); });
    } else if (mode === "new") {
      list.sort(function (a, b) { return new Date(b.created_at || 0) - new Date(a.created_at || 0); });
    } else if (mode === "ending") {
      // 마감 임박 = 재고가 적은 순, 재고가 같으면 마감 시각이 이른 순.
      list.sort(function (a, b) {
        var sa = Number(a.stock) || 0, sbk = Number(b.stock) || 0;
        if (sa !== sbk) return sa - sbk;
        var ea = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
        var eb = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
        return ea - eb;
      });
    } else {
      // 인기순 — 별도 판매량 집계가 없으므로 관리자가 정한 노출 순서를 씁니다.
      // (지어낸 인기 지표를 만들지 않습니다)
      list.sort(function (a, b) {
        var d = (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0);
        return d !== 0 ? d : tlp(a) - tlp(b);
      });
    }
    return list;
  }

  /* 구매 가능 여부 — 서버와 같은 순서로 미리 봐서 안내만 합니다. */
  function checkPurchase(product, quantity, balance, alreadyBought) {
    var q = Number(quantity) || 0;
    var bal = Number(balance);
    var already = Number(alreadyBought) || 0;
    if (!product) return { ok: false, code: "no_product", message: "상품을 찾을 수 없습니다." };
    if (q < 1) return { ok: false, code: "bad_quantity", message: "수량을 확인해주세요." };
    if (product.status !== "active") return { ok: false, code: "not_on_sale", message: "판매 중인 상품이 아닙니다." };
    if (product.expires_at && new Date(product.expires_at).getTime() <= Date.now()) {
      return { ok: false, code: "expired", message: "판매가 종료된 상품입니다." };
    }
    if ((Number(product.stock) || 0) <= 0) return { ok: false, code: "sold_out", message: "품절된 상품입니다." };
    if (q > (Number(product.stock) || 0)) {
      return { ok: false, code: "out_of_stock", message: "남은 수량보다 많이 구매할 수 없습니다." };
    }
    if (product.max_purchase !== null && product.max_purchase !== undefined) {
      if (already + q > Number(product.max_purchase)) {
        return { ok: false, code: "limit_exceeded", message: "1인 구매 한도를 초과했습니다." };
      }
    }
    var total = (Number(product.tl_price) || 0) * q;
    if (!isFinite(bal)) return { ok: false, code: "unknown_balance", message: "보유 TL을 확인하지 못했습니다." };
    if (bal < total) {
      return {
        ok: false,
        code: "insufficient_tl",
        message: "TL이 부족합니다.",
        need: total,
        have: bal,
        short: total - bal,
      };
    }
    return { ok: true, total: total, balanceAfter: bal - total };
  }

  /* 서버 오류 코드 -> 사람이 읽는 문장 */
  function describeServerError(message) {
    var m = String(message || "");
    if (/not_logged_in/.test(m)) return "로그인 후 이용할 수 있습니다.";
    if (/insufficient_tl/.test(m)) return "TL이 부족합니다.";
    if (/out_of_stock/.test(m)) return "재고가 부족합니다. 화면을 새로 불러옵니다.";
    if (/limit_exceeded/.test(m)) return "1인 구매 한도를 초과했습니다.";
    if (/not_on_sale/.test(m)) return "판매 중인 상품이 아닙니다.";
    if (/expired/.test(m)) return "판매가 종료된 상품입니다.";
    if (/no_product/.test(m)) return "상품을 찾을 수 없습니다.";
    if (/bad_quantity/.test(m)) return "수량을 확인해주세요.";
    if (/PGRST202|could not find the function|does not exist|schema cache/i.test(m)) {
      return "서버 설정이 아직 적용되지 않았습니다. (schema-tl-hotdeal.sql 실행 필요)";
    }
    return "구매에 실패했습니다. 잠시 후 다시 시도해주세요.";
  }

  function badgesFor(product) {
    var out = [];
    if (product.is_hot) out.push({ cls: "hd-badge-hot", text: "🔥 HOT" });
    if (product.list_tl_price && Number(product.list_tl_price) > Number(product.tl_price)) {
      out.push({ cls: "hd-badge-sale", text: "⚡ 오늘의 특가" });
    }
    var stock = Number(product.stock) || 0;
    if (stock <= 0) out.push({ cls: "hd-badge-out", text: "품절" });
    else if (stock <= LOW_STOCK) out.push({ cls: "hd-badge-soon", text: "🔥 마감 임박" });
    if (product.is_limited) out.push({ cls: "hd-badge-limited", text: "🎯 한정수량" });
    return out;
  }

  /* =======================================================================
   * 서버에서 받아오기
   * ======================================================================= */

  function loadProducts() {
    var client = sb();
    if (!client) return Promise.resolve([]);
    return Promise.resolve(
      client.from("tl_products").select("*").order("sort_order", { ascending: true })
    ).then(function (res) {
      if (res.error) throw res.error;
      return res.data || [];
    });
  }

  function loadBalance() {
    var client = sb();
    if (!client) return Promise.resolve({ logged_in: false, earned: 0, spent: 0, balance: 0 });
    return Promise.resolve(client.rpc("tl_balance_info")).then(function (res) {
      if (res.error) throw res.error;
      return res.data;
    });
  }

  function loadMyPurchases() {
    var client = sb();
    if (!client) return Promise.resolve([]);
    return Promise.resolve(
      client.from("tl_purchases").select("*").order("created_at", { ascending: false })
    ).then(function (res) {
      if (res.error) return []; // 로그아웃이면 비어 있는 게 정상
      return res.data || [];
    });
  }

  function countByProduct(purchases) {
    var map = {};
    (purchases || []).forEach(function (p) {
      if (p.status !== "completed") return;
      map[p.product_id] = (map[p.product_id] || 0) + (Number(p.quantity) || 0);
    });
    return map;
  }

  function refresh() {
    if (!dom.grid) return Promise.resolve();
    state.loading = true;
    state.error = null;
    render();
    return Promise.all([loadProducts(), loadBalance(), loadMyPurchases()])
      .then(function (r) {
        state.products = r[0];
        state.balance = r[1];
        state.purchases = r[2];
        state.myCounts = countByProduct(r[2]);
        state.loading = false;
        render();
      })
      .catch(function (e) {
        state.loading = false;
        state.error = describeServerError(e && e.message);
        console.warn("[tl-hotdeal.js] 불러오기 실패:", e);
        render();
      });
  }

  /* =======================================================================
   * 구매
   * ======================================================================= */

  function openConfirm(product, quantity) {
    var bal = state.balance ? Number(state.balance.balance) : NaN;
    var pre = checkPurchase(product, quantity, bal, state.myCounts[product.id] || 0);

    if (!pre.ok) {
      if (pre.code === "insufficient_tl") {
        alert(
          "TL이 부족합니다.\n\n" +
            "보유 TL   " + tl(pre.have) + "\n" +
            "상품 가격 " + tl(pre.need) + "\n" +
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
        product.brand + " " + product.name + "\n\n" +
        "필요 TL     " + tl(pre.total) + "\n" +
        "보유 TL     " + tl(bal) + "\n" +
        "구매 후 잔액 " + tl(pre.balanceAfter) + "\n" +
        "수량        " + quantity + "개\n\n" +
        "정말 구매하시겠습니까?"
    );
    if (!ok) return;
    doPurchase(product, quantity);
  }

  function doPurchase(product, quantity) {
    var client = sb();
    if (!client) {
      alert("로그인 후 이용할 수 있습니다.");
      return;
    }
    Promise.resolve(
      client.rpc("purchase_tl_product", { p_product_id: product.id, p_quantity: quantity })
    )
      .then(function (res) {
        if (res.error) throw res.error;
        var d = res.data || {};
        alert(
          "🎉 구매 완료!\n\n" +
            product.brand + " " + product.name + " " + quantity + "개\n" +
            "사용 TL  " + tl(d.spent) + "\n" +
            "남은 TL  " + tl(d.balance_after) + "\n\n" +
            "상품이 구매내역에 등록되었습니다."
        );
        return refresh();
      })
      .catch(function (e) {
        alert(describeServerError(e && e.message));
        console.warn("[tl-hotdeal.js] 구매 실패:", e);
        refresh(); // 재고/잔액이 바뀌었을 수 있으니 다시 받아옵니다
      });
  }

  /* =======================================================================
   * 그리기
   * ======================================================================= */

  function chipRow(node, items, activeId, onPick) {
    if (!node) return;
    node.innerHTML = items
      .map(function (c) {
        return '<button type="button" class="hd-chip' + (c.id === activeId ? " active" : "") +
          '" data-id="' + esc(c.id) + '">' + esc(c.label) + "</button>";
      })
      .join("");
    node.querySelectorAll(".hd-chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        onPick(btn.dataset.id);
      });
    });
  }

  function cardHtml(p) {
    var stock = Number(p.stock) || 0;
    var soldOut = stock <= 0 || p.status !== "active";
    var already = state.myCounts[p.id] || 0;
    var limit = p.max_purchase === null || p.max_purchase === undefined ? null : Number(p.max_purchase);
    var limitReached = limit !== null && already >= limit;
    var maxQty = Math.max(1, Math.min(stock, limit !== null ? limit - already : stock));

    var badges = badgesFor(p)
      .map(function (b) { return '<span class="hd-badge ' + b.cls + '">' + esc(b.text) + "</span>"; })
      .join("");

    // 상품 이미지가 없으면 브랜드 머리글자로 대신합니다(가짜 이미지를 만들지 않습니다).
    var thumb = p.image_url
      ? '<img class="hd-thumb-img" src="' + esc(p.image_url) + '" alt="' + esc(p.brand + " " + p.name) + '">'
      : '<span class="hd-thumb-text">' + esc(String(p.brand || "?").slice(0, 2)) + "</span>";

    var priceRow = p.list_tl_price && Number(p.list_tl_price) > Number(p.tl_price)
      ? '<span class="hd-tl-was">' + esc(tl(p.list_tl_price)) + "</span>"
      : "";

    var qtyOptions = "";
    for (var i = 1; i <= Math.min(maxQty, 10); i++) {
      qtyOptions += '<option value="' + i + '">' + i + "개</option>";
    }

    var buttonHtml;
    if (soldOut) {
      buttonHtml = '<button type="button" class="hd-buy-btn" disabled>품절</button>';
    } else if (limitReached) {
      buttonHtml = '<button type="button" class="hd-buy-btn" disabled>구매 한도 도달</button>';
    } else {
      buttonHtml =
        '<select class="hd-qty" data-id="' + esc(p.id) + '">' + qtyOptions + "</select>" +
        '<button type="button" class="hd-buy-btn hd-buy-go" data-id="' + esc(p.id) + '">구매하기</button>';
    }

    return (
      '<article class="hd-card' + (soldOut ? " hd-card-out" : "") + '">' +
      // 배지가 없어도 칸은 항상 둡니다 — 없으면 배지 있는 카드만 내용이
      // 아래로 밀려서 가격·TL 줄에 단차가 납니다(실측으로 확인).
      '<div class="hd-badges">' + badges + "</div>" +
      '<div class="hd-thumb">' + thumb + "</div>" +
      '<div class="hd-brand">' + esc(p.brand) + "</div>" +
      '<div class="hd-name">' + esc(p.name) + "</div>" +
      '<div class="hd-meta">' +
      '<span class="hd-price">' + esc(won(p.price)) + "</span>" +
      '<span class="hd-stock">' + (soldOut ? "품절" : "남은수량 " + num(stock)) + "</span>" +
      "</div>" +
      '<div class="hd-tl-row">' + priceRow +
      '<b class="hd-tl">🔵 ' + esc(tl(p.tl_price)) + "</b></div>" +
      (limit !== null
        ? '<div class="hd-limit">1인 ' + limit + "개 제한" + (already ? " · 구매 " + already + "개" : "") + "</div>"
        : "") +
      '<div class="hd-actions">' + buttonHtml + "</div>" +
      "</article>"
    );
  }

  function bindCards(root) {
    if (!root) return;
    root.querySelectorAll(".hd-buy-go").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = null;
        for (var i = 0; i < state.products.length; i++) {
          if (state.products[i].id === btn.dataset.id) p = state.products[i];
        }
        if (!p) return;
        var sel = root.querySelector('.hd-qty[data-id="' + btn.dataset.id + '"]');
        var qty = sel ? parseInt(sel.value, 10) : 1;
        openConfirm(p, qty);
      });
    });
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
      dom.balanceSub.textContent = "획득 " + tl(b.earned) + " · 사용 " + tl(b.spent);
    }
  }

  function renderHistory() {
    if (!dom.historyBody) return;
    var rows = state.purchases || [];
    if (!rows.length) {
      dom.historyBody.innerHTML = '<tr class="empty"><td colspan="5">구매내역이 없습니다.</td></tr>';
      return;
    }
    dom.historyBody.innerHTML = rows
      .map(function (r) {
        var d = new Date(r.created_at);
        var date = isNaN(d.getTime())
          ? "-"
          : d.getFullYear() + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
        return (
          "<tr>" +
          "<td style=\"text-align:left;\">" + esc(r.product_brand + " " + r.product_name) + "</td>" +
          "<td>" + esc(date) + "</td>" +
          "<td>" + esc(tl(r.total_tl)) + "</td>" +
          "<td>" + esc(r.quantity) + "개</td>" +
          "<td>" + (r.status === "completed" ? "구매완료" : "취소") + "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function render() {
    if (!dom.grid) return;

    chipRow(dom.categoryRow, CATEGORIES, state.category, function (id) {
      state.category = id;
      render();
    });
    chipRow(dom.priceRow, PRICE_BANDS, state.band, function (id) {
      state.band = id;
      render();
    });

    renderBalance();

    // 구매내역 보기 전환
    if (dom.historySection) dom.historySection.style.display = state.view === "history" ? "" : "none";

    if (state.loading) {
      dom.grid.innerHTML = "";
      if (dom.empty) {
        dom.empty.style.display = "";
        dom.empty.textContent = "상품을 불러오는 중…";
      }
      return;
    }
    if (state.error) {
      dom.grid.innerHTML = "";
      if (dom.empty) {
        dom.empty.style.display = "";
        dom.empty.textContent = state.error;
      }
      return;
    }

    var visible = sortProducts(
      filterProducts(state.products, { category: state.category, band: state.band, search: state.search }),
      state.sort
    );

    // 오늘의 핫딜 — 관리자가 is_hot 을 켠 상품만. 없으면 구역 자체를 숨깁니다.
    var hot = visible.filter(function (p) { return p.is_hot; });
    if (dom.hotSection) dom.hotSection.style.display = hot.length ? "" : "none";
    if (dom.hotGrid && hot.length) {
      dom.hotGrid.innerHTML = hot.map(cardHtml).join("");
      bindCards(dom.hotGrid);
    }

    if (dom.count) dom.count.textContent = visible.length ? visible.length + "개" : "";
    dom.grid.innerHTML = visible.map(cardHtml).join("");
    bindCards(dom.grid);

    if (dom.empty) {
      if (!visible.length) {
        dom.empty.style.display = "";
        dom.empty.textContent = state.products.length
          ? "조건에 맞는 상품이 없습니다."
          : "등록된 상품이 없습니다.";
      } else {
        dom.empty.style.display = "none";
      }
    }

    renderHistory();
  }

  /* =======================================================================
   * 초기화
   * ======================================================================= */

  function init() {
    dom = {
      grid: el("hd-grid"),
      hotGrid: el("hd-hot-grid"),
      hotSection: el("hd-hot-section"),
      empty: el("hd-empty"),
      count: el("hd-count"),
      balance: el("hd-balance"),
      balanceSub: el("hd-balance-sub"),
      categoryRow: el("hd-category-row"),
      priceRow: el("hd-price-row"),
      search: el("hd-search"),
      sort: el("hd-sort"),
      historySection: el("hd-history-section"),
      historyBody: el("hd-history-body"),
      tabShop: el("hd-tab-hotdeal"),
      tabHistory: el("hd-tab-history"),
    };
    if (!dom.grid) return; // 마크업 없으면 조용히 종료

    if (dom.search) {
      dom.search.addEventListener("input", function () {
        state.search = dom.search.value;
        render();
      });
    }
    if (dom.sort) {
      dom.sort.addEventListener("change", function () {
        state.sort = dom.sort.value;
        render();
      });
    }
    if (dom.tabHistory) {
      dom.tabHistory.addEventListener("click", function () {
        state.view = state.view === "history" ? "shop" : "history";
        dom.tabHistory.classList.toggle("active", state.view === "history");
        if (dom.tabShop) dom.tabShop.classList.toggle("active", state.view !== "history");
        render();
        if (state.view === "history" && dom.historySection) {
          dom.historySection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    }

    render(); // 칩/빈 상태를 먼저 그려둡니다
    // 실제 데이터는 핫딜 탭을 열 때 page-nav.js 가 refresh() 를 부릅니다.
    // 다만 로그인 직후 잔액이 바뀌므로 그때도 갱신합니다.
    if (App.Bus && typeof App.Bus.on === "function") {
      App.Bus.on("auth:changed", refresh);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return {
    init: init,
    refresh: refresh,
    render: render,
    // 테스트/재사용용 순수 함수
    filterProducts: filterProducts,
    sortProducts: sortProducts,
    matchesBand: matchesBand,
    matchesSearch: matchesSearch,
    checkPurchase: checkPurchase,
    describeServerError: describeServerError,
    badgesFor: badgesFor,
    countByProduct: countByProduct,
    hasImage: hasImage,
    CATEGORIES: CATEGORIES,
    PRICE_BANDS: PRICE_BANDS,
    _state: state,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = App.TLHotdeal;
