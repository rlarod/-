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

  /* ── 이미 알린 거래를 기억합니다 ────────────────────────────────────────
   * 예전에는 "지금까지 본 거래 건수" 하나만 세었고, 그 숫자가 페이지를 열
   * 때마다 0 으로 시작했습니다. 그래서 새로고침하면 예전 거래가 전부
   * '새 거래' 로 보여 같은 알림이 다시 나갔습니다
   * (실제로 같은 손절 알림이 채팅에 세 번 찍혔습니다).
   *
   * 건수 대신 청산 시각(closeTime)을 기억합니다. 시각은 거래마다 다르고
   * 브라우저를 닫아도 남으므로, 한 번 알린 거래는 다시 알리지 않습니다. */
  var SEEN_KEY = "chat-event-seen";
  var SEEN_MAX = 200;          // 너무 쌓이지 않게 최근 것만 남깁니다
  var 시작시각 = Date.now();

  /* 저장소를 매번 새로 읽습니다.
     예전에는 한 번 읽고 메모리에 들고 있었는데, 그러면 창을 두 개 띄웠을 때
     한쪽이 "이미 알림" 으로 표시한 걸 다른 쪽이 못 봐서 같은 알림이 두 번
     나갔습니다. 읽기는 값싸므로 매번 확인하는 편이 안전합니다. */
  function loadSeen() {
    var seen = new Set();
    try {
      var saved = App.Storage ? App.Storage.load(SEEN_KEY) : null;
      if (saved && Array.isArray(saved.times)) saved.times.forEach((t) => seen.add(t));
    } catch (e) {
      /* 못 읽으면 빈 상태로 시작합니다 */
    }
    return seen;
  }

  function markSeen(times) {
    var s = loadSeen();
    times.forEach((t) => s.add(t));
    if (!App.Storage) return;
    var arr = Array.from(s).sort((a, b) => b - a).slice(0, SEEN_MAX);
    try {
      App.Storage.save(SEEN_KEY, { times: arr });
    } catch (e) {
      /* 저장 실패해도 이번 세션에서는 중복이 막힙니다 */
    }
  }

  /* 마지막 방어선 — 같은 문장을 짧은 시간 안에 두 번 보내지 않습니다.
     위의 '청산 시각' 검사를 어떤 이유로든 빠져나온 경우에도(창 두 개,
     거래가 두 번 기록된 경우 등) 화면에 같은 줄이 겹쳐 보이는 것만은
     막습니다. 사람이 진짜로 같은 문장을 두 번 만들 일은 없습니다 —
     금액과 방향까지 똑같아야 하기 때문입니다. */
  var RECENT_KEY = "chat-event-recent";
  var RECENT_MS = 90000;   // 1분 30초

  function 최근에보냈나(message) {
    try {
      var saved = App.Storage ? App.Storage.load(RECENT_KEY) : null;
      var list = saved && Array.isArray(saved.list) ? saved.list : [];
      var now = Date.now();
      return list.some((r) => r.m === message && now - r.t < RECENT_MS);
    } catch (e) {
      return false;
    }
  }

  function 보냈다고표시(message) {
    try {
      var saved = App.Storage ? App.Storage.load(RECENT_KEY) : null;
      var list = saved && Array.isArray(saved.list) ? saved.list : [];
      var now = Date.now();
      list = list.filter((r) => now - r.t < RECENT_MS);
      list.push({ m: message, t: now });
      if (list.length > 30) list = list.slice(-30);
      if (App.Storage) App.Storage.save(RECENT_KEY, { list: list });
    } catch (e) {
      /* 저장 실패해도 위의 청산 시각 검사가 남아 있습니다 */
    }
  }

  function 알린적있나(trade) {
    if (!trade || typeof trade.closeTime !== "number") return true; // 시각이 없으면 판단 불가 — 조용히 넘어갑니다
    return loadSeen().has(trade.closeTime);
  }

  /* 페이지를 열기 전에 이미 끝난 거래는 알리지 않습니다.
     처음 방문한 브라우저라 기록이 비어 있어도, 지난 거래가 쏟아지지 않게 합니다. */
  function 이번접속거래인가(trade) {
    return trade && typeof trade.closeTime === "number" && trade.closeTime >= 시작시각;
  }

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
    if (!list.length) return;

    /* 알릴 대상 = 이번 접속 중에 끝났고 + 아직 안 알린 거래.
       예전에는 "건수가 늘었나" 로 판단했는데, 그 숫자가 새로고침마다
       0 으로 초기화돼 지난 거래를 다시 알렸습니다. */
    const 새거래 = list.filter((t) => 이번접속거래인가(t) && !알린적있나(t));

    if (!새거래.length) {
      /* 알릴 게 없어도 지난 거래는 '이미 본 것' 으로 표시해 둡니다.
         그래야 다음에 또 훑지 않습니다. */
      const 지난것 = list
        .filter((t) => typeof t.closeTime === "number" && !이번접속거래인가(t))
        .map((t) => t.closeTime);
      if (지난것.length) markSeen(지난것);
      return;
    }

    let newCount = 새거래.length;

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
      /* 건너뛴 거래도 '본 것' 으로 표시합니다. 안 그러면 저장될 때마다
         같은 판단을 반복하며 매번 경고만 찍습니다. */
      markSeen(새거래.map((t) => t.closeTime));
      return;
    }

    const client = sb();
    if (!client) return;
    const userId = await getUserId(client);
    if (!userId) return;
    const nickname = App.Auth ? App.Auth.getNickname() : null;
    if (!nickname) return;

    /* 보내기 전에 먼저 '본 것' 으로 표시합니다.
       전송에는 시간이 걸리는데, 그 사이 저장이 또 일어나면 같은 거래를
       한 번 더 보내게 됩니다. 표시를 먼저 해두면 그 겹침이 막힙니다. */
    markSeen(새거래.map((t) => t.closeTime));

    // 오래된 것부터 순서대로(여러 개가 한꺼번에 청산됐을 때 시간 순서 유지)
    const ordered = 새거래.slice().reverse();
    for (const t of ordered) {
      const message = buildMessage(nickname, t);
      if (최근에보냈나(message)) {
        console.warn("[trade-events-chat.js] 같은 알림을 방금 보냈습니다 — 건너뜁니다:", message);
        continue;
      }
      보냈다고표시(message);
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

  /* 손익 금액을 원화로. 축약하지 않고 전체 자리수로 적습니다.
     "3,000만원" 처럼 줄이면 실제 금액이 얼마인지 한눈에 안 들어옵니다.
     "30,000,000원" 이 사람이 읽기에 더 정확합니다(사용자 요청). */
  function formatKrwSigned(usd) {
    const rate = App.Config && App.Config.USD_KRW ? App.Config.USD_KRW : 0;
    if (!rate) return (usd >= 0 ? "+" : "") + usd.toFixed(2) + " USDT";
    const won = Math.round(usd * rate);
    const sign = won > 0 ? "+" : won < 0 ? "-" : "";
    return sign + Math.abs(won).toLocaleString("ko-KR") + "원";
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
