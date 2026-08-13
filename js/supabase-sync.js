/* =========================================================================
 * js/supabase-sync.js — App.SupabaseSync
 * =========================================================================
 * trading.js의 localStorage 저장 시점('trading:persisted' 이벤트, 실제
 * 거래 이벤트에서만 발생)을 그대로 재사용해서 Supabase로도 동기화합니다.
 * trading.js의 계산 로직은 이 파일에서 단 한 줄도 호출/수정하지 않습니다 —
 * 이미 계산된 스냅샷을 받아서 테이블에 옮겨 적기만 합니다.
 *
 * ── 동기화 방식(테이블별) ──────────────────────────────────────────
 *   trading_accounts : 매번 upsert(잔고는 계속 바뀜)
 *   positions        : "지금 이 순간의 포지션"을 그대로 반영 — 본인 행을
 *                       지운 뒤, 포지션이 있으면 다시 insert(0개 또는 1개)
 *   trades           : closedTrades는 앞에 추가만 되고 기존 항목이
 *                       바뀌지 않는 배열이라(trading.js 감사로 확인됨),
 *                       마지막 동기화 이후 새로 늘어난 만큼만 insert
 *   orders           : orderHistoryVersion이 실제로 바뀐 경우에만,
 *                       client_order_id 기준으로 upsert(상태 전이도 반영)
 *
 * ── 실패해도 기존 기능은 절대 안 깨짐 ─────────────────────────────
 * 여기서 일어나는 모든 Supabase 호출은 try/catch로 감싸고, 실패해도
 * console.warn만 남기고 조용히 넘어갑니다. localStorage 저장과 로컬
 * 거래 엔진 동작에는 어떤 영향도 주지 않습니다.
 * ========================================================================= */

window.App = window.App || {};

App.SupabaseSync = (function () {
  "use strict";

  let lastSyncedTradesCount = 0;
  let lastSyncedOrderHistoryVersion = -1;
  let syncing = false; // 동시에 여러 번 겹쳐 돌지 않게 하는 간단한 락

  function sb() {
    return App.SupabaseClient ? App.SupabaseClient.get() : null;
  }

  async function getUserId(client) {
    try {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session) return null;
      return data.session.user.id;
    } catch (e) {
      return null;
    }
  }

  /* ---------------- trading_accounts ---------------- */
  async function syncAccount(client, userId, snapshot) {
    const { error } = await client.from("trading_accounts").upsert(
      {
        user_id: userId,
        balance: snapshot.balance,
        // initial_balance는 최초 지급 시(js/auth.js) 이미 만들어져 있고 여기서는
        // 절대 다시 안 씁니다 — 실수로 덮어써서 수익률 계산 기준이 바뀌는 걸 방지.
        realized_pnl: snapshot.realizedPnl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    if (error) console.warn("[supabase-sync.js] trading_accounts 동기화 실패:", error);
  }

  /* ---------------- positions: "현재 상태 그대로" 반영 ---------------- */
  async function syncPosition(client, userId, snapshot) {
    const { error: delErr } = await client.from("positions").delete().eq("user_id", userId);
    if (delErr) {
      console.warn("[supabase-sync.js] positions 초기화 실패:", delErr);
      return;
    }
    const pos = snapshot.position;
    if (!pos) return; // 포지션 없으면 삭제된 채로 끝(정상)

    const { error: insErr } = await client.from("positions").insert({
      user_id: userId,
      symbol: "BTCUSDT",
      side: pos.side,
      quantity: pos.qty,
      entry_price: pos.entry,
      leverage: pos.leverage,
      margin: pos.margin,
      tp_price: pos.tp,
      sl_price: pos.sl,
      liq_price: pos.liq,
      entry_fee: pos.entryFee,
      created_at: new Date(pos.openTime).toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (insErr) console.warn("[supabase-sync.js] positions 반영 실패:", insErr);
  }

  /* ---------------- trades: 새로 늘어난 것만 insert ---------------- */
  async function syncNewTrades(client, userId, snapshot) {
    const list = snapshot.closedTrades || [];
    if (list.length <= lastSyncedTradesCount) {
      // 줄어들었다면(예: 다른 탭에서 storage가 초기화된 경우) 기준을 다시 맞춤
      lastSyncedTradesCount = list.length;
      return;
    }
    // closedTrades는 항상 앞(index 0)에 최신이 unshift되므로, 처음 N개가
    // "이번에 새로 생긴" 거래입니다.
    const newCount = list.length - lastSyncedTradesCount;
    const newTrades = list.slice(0, newCount);

    const rows = newTrades.map((t) => ({
      user_id: userId,
      symbol: "BTCUSDT",
      side: t.side,
      entry_price: t.entry,
      exit_price: t.exit,
      quantity: t.qty,
      leverage: t.leverage,
      margin: t.margin,
      pnl: t.pnl,
      roe: t.pnlPercent,
      fee: t.fee,
      close_reason: t.reason,
      created_at: new Date(t.closeTime).toISOString(),
    }));

    const { error } = await client.from("trades").insert(rows);
    if (error) {
      console.warn("[supabase-sync.js] trades 동기화 실패(다음 이벤트에서 재시도):", error);
      return; // lastSyncedTradesCount를 안 올려서 다음번에 다시 시도되게 함
    }
    lastSyncedTradesCount = list.length;
  }

  /* ---------------- orders: 버전이 바뀐 경우에만 통째로 upsert ---------------- */
  async function syncOrderHistory(client, userId, snapshot) {
    if (snapshot.orderHistoryVersion === lastSyncedOrderHistoryVersion) return;

    const list = (snapshot.orderHistory || []).slice(0, 100); // MAX_ORDER_HISTORY와 동일 상한
    if (list.length === 0) {
      lastSyncedOrderHistoryVersion = snapshot.orderHistoryVersion;
      return;
    }

    const rows = list.map((o) => {
      const price = o.price || null;
      const quantity = price ? (o.margin * o.leverage) / price : null;
      return {
        user_id: userId,
        client_order_id: o.id,
        symbol: "BTCUSDT",
        side: o.side,
        order_type: o.type,
        price,
        quantity,
        margin: o.margin,
        leverage: o.leverage,
        status: o.status,
        created_at: new Date(o.createdTime).toISOString(),
        filled_at: o.filledTime ? new Date(o.filledTime).toISOString() : null,
        cancelled_at: o.cancelledTime ? new Date(o.cancelledTime).toISOString() : null,
      };
    });

    const { error } = await client.from("orders").upsert(rows, { onConflict: "user_id,client_order_id" });
    if (error) {
      console.warn("[supabase-sync.js] orders 동기화 실패(다음 이벤트에서 재시도):", error);
      return;
    }
    lastSyncedOrderHistoryVersion = snapshot.orderHistoryVersion;
  }

  /* ---------------- 진입점 ---------------- */
  async function onTradingPersisted(snapshot) {
    const client = sb();
    if (!client) return; // Supabase 자체가 없으면 조용히 스킵(로컬 저장은 이미 끝난 상태)
    if (syncing) return; // 짧은 시간에 이벤트가 겹치면 다음 것은 건너뛰고, 그다음 이벤트 때 최신 스냅샷으로 다시 맞춰짐
    syncing = true;
    try {
      const userId = await getUserId(client);
      if (!userId) return; // 아직 로그인 전(닉네임 게이트 통과 전)이면 스킵

      await syncAccount(client, userId, snapshot);
      await syncPosition(client, userId, snapshot);
      await syncNewTrades(client, userId, snapshot);
      await syncOrderHistory(client, userId, snapshot);
    } catch (e) {
      console.warn("[supabase-sync.js] 동기화 중 예상치 못한 오류(로컬 저장에는 영향 없음):", e);
    } finally {
      syncing = false;
    }
  }

  function init() {
    App.Bus.on("trading:persisted", onTradingPersisted);
  }

  return { init };
})();
