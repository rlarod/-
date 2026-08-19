/* =========================================================================
 * js/trade-events-chat.js — App.TradeEventsChat
 * =========================================================================
 * 실제로 포지션이 청산됐을 때만(주문 버튼을 눌렀다고 X) 채팅에 자동
 * 메시지를 올립니다. trading.js/chat.js/supabase-sync.js는 전혀
 * 안 건드립니다 — 기존 'trading:persisted' 이벤트(실제 거래 이벤트
 * 발생 시에만 발생)를 구독해서 closedTrades가 늘어난 걸 감지하는
 * 방식으로, supabase-sync.js의 거래내역 동기화와 똑같은 원리입니다.
 *
 * ── 왜 여기서 직접 chat_messages에 insert 하는지 ─────────────────────
 * chat.js가 이미 chat_messages 테이블을 Realtime으로 구독하고 있어서,
 * 여기서 insert만 하면 chat.js 쪽 코드를 전혀 안 건드리고도(id로만
 * 요소를 찾는 구조 유지) 자동으로 채팅창에 나타납니다 — chat.js에는
 * message_type에 따라 스타일만 다르게 그리는 부분만 추가했습니다.
 * ========================================================================= */

window.App = window.App || {};

App.TradeEventsChat = (function () {
  "use strict";

  let lastSeenClosedCount = 0;

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

  async function onTradingPersisted(snapshot) {
    const list = snapshot.closedTrades || [];
    if (list.length <= lastSeenClosedCount) {
      lastSeenClosedCount = list.length; // 줄어든 경우(예: 다른 탭 초기화) 기준 재조정
      return;
    }
    let newCount = list.length - lastSeenClosedCount;
    lastSeenClosedCount = list.length;

    /* 한 번에 여러 건이 쏟아지는 건 정상이 아닙니다.
       기록이 잠깐 0건으로 보였다가 되돌아오면(복원 중 등) 전부
       '새 거래' 로 착각해 같은 알림을 수백 번 보내게 됩니다
       — 실제로 채팅이 도배됐습니다.
       사람이 한 번에 청산할 수 있는 건 많아야 몇 건이므로,
       그 이상은 알림을 건너뜁니다(거래 기록 자체는 그대로 남습니다). */
    const MAX_BURST = 5;
    if (newCount > MAX_BURST) {
      console.warn(
        "[trade-events-chat.js] 한꺼번에 " + newCount +
        "건이 새로 잡혀 알림을 건너뜁니다(도배 방지). 거래 기록은 그대로입니다."
      );
      return;
    }

    const newTrades = list.slice(0, newCount); // 앞쪽이 최신

    const client = sb();
    if (!client) return;
    const userId = await getUserId(client);
    if (!userId) return;
    const nickname = App.Auth ? App.Auth.getNickname() : null;
    if (!nickname) return;

    // 오래된 것부터 순서대로(여러 개가 한꺼번에 청산됐을 때 시간 순서 유지)
    const ordered = newTrades.slice().reverse();
    for (const t of ordered) {
      const message = buildMessage(nickname, t);
      /* 채팅 도배 방지 트리거가 1.5초 간격을 강제합니다. 거래 이벤트는
         supabase/schema-chat-event-exempt.sql 로 예외 처리했지만,
         그 SQL 을 아직 안 돌린 서버에서는 여전히 막힙니다.
         그래서 rate_limited 면 잠깐 기다렸다 한 번 더 시도합니다.
         이렇게 하지 않으면 빠른 매매 때 청산 알림이 조용히 사라집니다. */
      const send = () =>
        client.from("chat_messages").insert({
          user_id: userId,
          nickname, // 실제 저장값은 서버 트리거가 profiles 기준으로 덮어씀(기존과 동일)
          message,
          message_type: "trade_event",
        });

      try {
        let { error } = await send();
        if (error && /rate_limited/.test(String(error.message || error))) {
          await new Promise((r) => setTimeout(r, 1700));
          ({ error } = await send());
        }
        if (error) {
          console.warn(
            "[trade-events-chat.js] 이벤트 메시지 전송 실패:",
            error,
            /rate_limited/.test(String(error.message || error))
              ? "(도배 제한에 막혔습니다 — schema-chat-event-exempt.sql 실행 필요)"
              : ""
          );
        }
      } catch (e) {
        console.warn("[trade-events-chat.js] 이벤트 메시지 전송 중 오류:", e);
      }
    }
  }

  // 손익 금액을 원화로. 1억 이상은 "1.23억", 1만 이상은 "1,234만".
  function formatKrwSigned(usd) {
    const rate = App.Config && App.Config.USD_KRW ? App.Config.USD_KRW : 0;
    if (!rate) return (usd >= 0 ? "+" : "") + usd.toFixed(2) + " USDT";
    const won = Math.round(usd * rate);
    const sign = won > 0 ? "+" : won < 0 ? "-" : "";
    const abs = Math.abs(won);
    let body;
    if (abs >= 100000000) body = (abs / 100000000).toFixed(2) + "억";
    else if (abs >= 10000) body = Math.round(abs / 10000).toLocaleString("ko-KR") + "만";
    else body = abs.toLocaleString("ko-KR");
    return sign + body + "원";
  }

  function buildMessage(nickname, t) {
    // 방향은 한글로 — 채팅은 한국어 문장이라 LONG/SHORT만 영문이면 어색합니다.
    const sideLabel = t.side === "long" ? "매수" : "매도";
    // 금액도 원화로 — 채팅은 사람이 읽는 문장이라 익숙한 단위가 낫습니다.
    // 환율은 App.Config.USD_KRW 하나만 씁니다(다른 곳에 또 적지 않음).
    const amountText = formatKrwSigned(t.pnl);
    if (t.reason === "강제청산") {
      return nickname + "님의 BTC " + sideLabel + " 포지션이 강제청산되었습니다 (" + amountText + ")";
    }
    if (t.pnl >= 0) {
      return nickname + "님이 BTC " + sideLabel + " 포지션을 " + amountText + " 익절했습니다";
    }
    return nickname + "님이 BTC " + sideLabel + " 포지션을 " + amountText + " 손절했습니다";
  }

  function init() {
    // DOM 요소가 필요 없는 순수 데이터 모듈이라, App.Bus만 있으면 항상 동작합니다.
    App.Bus.on("trading:persisted", onTradingPersisted);
  }

  return { init };
})();
